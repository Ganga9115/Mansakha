const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { getDescendantJurisdictionIds, getChildJurisdictions } = require('../services/jurisdictionTree');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { requireJurisdiction } = require('../middleware/requireJurisdiction');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');

const router = express.Router();

// Ministry's own role has jurisdiction_id: null (unrestricted, per Section 3), so
// the frontend needs some way to know which jurisdiction ID to load as Ministry's
// "home" National Dashboard view. Non-sensitive (jurisdiction names only), so any
// authenticated official can call it, not just Ministry.
router.get('/root-jurisdiction', verifyToken, generalApiLimiter, async (req, res) => {
  if (!req.auth || req.auth.type !== 'official') return fail(res, 'Staff account required', 403);
  const { data, error } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'national').limit(1).maybeSingle();
  if (error || !data) return fail(res, 'No national jurisdiction configured', 404);
  return ok(res, { jurisdictionId: data.jurisdiction_id, name: data.name });
});

async function countVictimsByRisk(jurisdictionIds) {
  const { data: victims } = await supabase
    .from('victims')
    .select('victim_id, distress_scores(score_value, computed_at, risk_levels(name))')
    .in('jurisdiction_id', jurisdictionIds)
    .order('computed_at', { referencedTable: 'distress_scores', ascending: false });

  const counts = { total: 0, vulnerable: 0, highRisk: 0, critical: 0 };
  const caseRows = [];
  for (const v of victims || []) {
    counts.total += 1;
    const latest = v.distress_scores?.[0];
    const riskLevel = latest ? latest.risk_levels.name : null;
    if (riskLevel === 'Moderate') counts.vulnerable += 1;
    if (riskLevel === 'High') counts.highRisk += 1;
    if (riskLevel === 'Critical') counts.critical += 1;
    caseRows.push({ victimId: v.victim_id, score: latest ? latest.score_value : null, riskLevel });
  }
  return { counts, caseRows };
}

// Both routes below are protected by requireJurisdiction(req => req.params.jurisdictionId)
// - this is what actually enforces that a District Admin can't edit the URL to view
// a different district, and a State Admin can't view a different state's data. The
// parent-chain walk in requireJurisdiction means a target that IS the caller's own
// jurisdiction, or a descendant of it, passes; anything outside that subtree is 403.
router.get(
  '/dashboard/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']), // Ministry is a superset of Administration, per Section 3
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;
    const { page = 1 } = req.query;
    const pageSize = 30;
    const offset = (Number(page) - 1) * pageSize;

    const { data: jurisdiction, error: jError } = await supabase
      .from('jurisdictions')
      .select('level, name')
      .eq('jurisdiction_id', jurisdictionId)
      .single();
    if (jError || !jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'admin_dashboard', entityId: jurisdictionId });

    if (jurisdiction.level === 'district') {
      // District's default view is case-level detail, not just aggregates -
      // Section 4.5. `counts` stay computed over the full district (not just
      // the current page) - only the case list itself is paginated, so a
      // district with thousands of cases doesn't load them all at once.
      const { counts, caseRows } = await countVictimsByRisk([jurisdictionId]);
      const total = caseRows.length;
      const cases = caseRows.slice(offset, offset + pageSize);
      return ok(res, { tier: 'district', ...counts, trends: null, cases, total });
    }

    // State/National: aggregate-with-drill-down is the default, not case-level -
    // Section 4.5. State also sees its child districts side by side; National sees
    // its child states side by side.
    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    const { counts } = await countVictimsByRisk(allDescendantIds);

    const children = await getChildJurisdictions(jurisdictionId);
    const breakdown = [];
    for (const child of children) {
      const childDescendants = await getDescendantJurisdictionIds(child.jurisdiction_id);
      const { counts: childCounts } = await countVictimsByRisk(childDescendants);
      breakdown.push({ jurisdictionId: child.jurisdiction_id, name: child.name, ...childCounts });
    }

    return ok(res, { tier: jurisdiction.level, ...counts, trends: breakdown });
  }
);

// District tier only, per the PS's alert routing ("...district authorities...") -
// State/National are policy/comparison tiers and don't get a live alert feed.
router.get(
  '/alerts/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']), // Ministry is a superset of Administration, per Section 3
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;

    const { data: jurisdiction } = await supabase.from('jurisdictions').select('level').eq('jurisdiction_id', jurisdictionId).single();
    if (!jurisdiction || jurisdiction.level !== 'district') {
      return fail(res, 'Live alert feed is only available at the district tier', 400);
    }

    // Capped, not full-page-UI paginated - same reasoning as the Counsellor
    // alerts feed (routes/counsellor.js): polled and rendered live, not
    // paged through by the user.
    const { data, error } = await supabase
      .from('alert_notifications')
      .select('alert_id, notified_at, alerts(victim_id, triggered_at, alert_statuses(name))')
      .eq('official_id', req.auth.officialId)
      .order('notified_at', { ascending: false })
      .limit(50);
    if (error) return fail(res, 'Could not load alerts', 500);

    return ok(res, {
      alerts: (data || []).map((n) => ({
        alertId: n.alert_id,
        victimId: n.alerts.victim_id,
        triggeredAt: n.alerts.triggered_at,
        status: n.alerts.alert_statuses.name,
      })),
    });
  }
);

// Counsellor Workload View - District tier only (Section 4.5). No formal
// "assignment" concept exists in the schema (same reasoning as counsellor.js's
// jurisdiction-based case scoping), so workload here is: how many interventions
// this counsellor has logged, and how many open/acknowledged alerts are currently
// routed to them - a real, queryable proxy for load, not an invented number.
router.get(
  '/workload/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;

    const { data: jurisdiction } = await supabase.from('jurisdictions').select('level').eq('jurisdiction_id', jurisdictionId).single();
    if (!jurisdiction || jurisdiction.level !== 'district') {
      return fail(res, 'Workload view is only available at the district tier', 400);
    }

    // official_roles has TWO foreign keys into officials (official_id AND
    // assigned_by) - officials(full_name) alone is an ambiguous embed for
    // PostgREST and silently returned no rows with no error surfaced. The
    // explicit constraint-name hint disambiguates it; the error check here is
    // what would have caught this the first time.
    const { data: allRoles, error: rolesError } = await supabase
      .from('official_roles')
      .select('official_id, roles(role_name), officials!official_roles_official_id_fkey(full_name)')
      .eq('jurisdiction_id', jurisdictionId)
      .is('revoked_at', null);
    if (rolesError) return fail(res, `Could not load workload: ${rolesError.message}`, 500);
    const counsellorRoles = (allRoles || []).filter((r) => r.roles.role_name === 'Counsellor');
    const counsellorIds = counsellorRoles.map((r) => r.official_id);
    if (counsellorIds.length === 0) return ok(res, { counsellors: [] });

    const { data: interventions } = await supabase.from('interventions').select('assigned_official_id').in('assigned_official_id', counsellorIds);
    const { data: notifications } = await supabase
      .from('alert_notifications')
      .select('official_id, alerts(alert_status_id, alert_statuses(name))')
      .in('official_id', counsellorIds);

    const workload = counsellorRoles.map((r) => {
      const interventionCount = (interventions || []).filter((i) => i.assigned_official_id === r.official_id).length;
      const openAlertCount = (notifications || []).filter(
        (n) => n.official_id === r.official_id && n.alerts.alert_statuses.name !== 'Resolved'
      ).length;
      return { officialId: r.official_id, name: r.officials.full_name, interventionCount, openAlertCount };
    });

    return ok(res, { counsellors: workload });
  }
);

function toCsvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(headers, rows) {
  const lines = [headers.map(toCsvCell).join(',')];
  for (const row of rows) lines.push(headers.map((h) => toCsvCell(row[h])).join(','));
  return lines.join('\n');
}

// "Cross-jurisdiction reporting" for Administration - CSV of exactly what the
// dashboard already computed (district: case list; state/national: the
// child-jurisdiction breakdown), so there's no separate aggregation query to
// keep in sync with the dashboard's own numbers. Deliberately bypasses the
// {success,data,message} JSON envelope every other route uses - this is a
// file download, not a JSON API response.
router.get(
  '/dashboard/:jurisdictionId/export',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;

    const { data: jurisdiction, error: jError } = await supabase
      .from('jurisdictions')
      .select('level, name')
      .eq('jurisdiction_id', jurisdictionId)
      .single();
    if (jError || !jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'export', entityType: 'admin_dashboard', entityId: jurisdictionId });

    let csv;
    let filename;
    if (jurisdiction.level === 'district') {
      const { caseRows } = await countVictimsByRisk([jurisdictionId]);
      csv = toCsv(['victimId', 'score', 'riskLevel'], caseRows);
      filename = `${jurisdiction.name}-cases.csv`;
    } else {
      const children = await getChildJurisdictions(jurisdictionId);
      const breakdown = [];
      for (const child of children) {
        const childDescendants = await getDescendantJurisdictionIds(child.jurisdiction_id);
        const { counts } = await countVictimsByRisk(childDescendants);
        breakdown.push({ jurisdictionId: child.jurisdiction_id, name: child.name, ...counts });
      }
      csv = toCsv(['jurisdictionId', 'name', 'total', 'vulnerable', 'highRisk', 'critical'], breakdown);
      filename = `${jurisdiction.name}-breakdown.csv`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }
);

module.exports = router;
