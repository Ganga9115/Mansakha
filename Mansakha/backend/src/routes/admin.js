const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { getDescendantJurisdictionIds, getChildJurisdictions } = require('../services/jurisdictionTree');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { requireJurisdiction } = require('../middleware/requireJurisdiction');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { createVictim, updateVictim, ProvisioningError } = require('../services/victimProvisioning');

const router = express.Router();

// Average distress score for a set of jurisdictions within [sinceIso, untilIso)
// - untilIso omitted means "up to now". Mirrors countVictimsByRisk's existing
// query shape (fetch victims with embedded distress_scores, aggregate in JS)
// rather than a reverse-embed filter, matching this file's established style.
async function computeAverageScore(jurisdictionIds, sinceIso, untilIso) {
  const { data: victims } = await supabase
    .from('victims')
    .select('distress_scores(score_value, computed_at)')
    .in('jurisdiction_id', jurisdictionIds);

  let sum = 0;
  let count = 0;
  for (const v of victims || []) {
    for (const s of v.distress_scores || []) {
      if (s.computed_at >= sinceIso && (!untilIso || s.computed_at < untilIso)) {
        sum += s.score_value;
        count += 1;
      }
    }
  }
  return count > 0 ? sum / count : null;
}

const TREND_PERIOD_DAYS = 30;
const TREND_FLAT_THRESHOLD = 2; // point-difference below which a change reads as noise, not a real trend

// Feature Catalog Section 4.3 "Rising-trend districts" - compares this
// period's average score against the prior period's for the same
// jurisdiction set. Small, bounded helper - not a new table, a derived fact
// computed on read (same reasoning schema.sql already uses for disengagement).
async function computeTrendDirection(jurisdictionIds) {
  const now = Date.now();
  const periodStart = new Date(now - TREND_PERIOD_DAYS * 86400000).toISOString();
  const priorPeriodStart = new Date(now - 2 * TREND_PERIOD_DAYS * 86400000).toISOString();

  const [currentAvg, priorAvg] = await Promise.all([
    computeAverageScore(jurisdictionIds, periodStart, null),
    computeAverageScore(jurisdictionIds, priorPeriodStart, periodStart),
  ]);

  if (currentAvg === null || priorAvg === null) return 'flat';
  if (currentAvg > priorAvg + TREND_FLAT_THRESHOLD) return 'up';
  if (currentAvg < priorAvg - TREND_FLAT_THRESHOLD) return 'down';
  return 'flat';
}

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
      // Section 4.3 "Rising-trend districts" - a per-row indicator, not a
      // separate list, so the frontend can sort/highlight in place.
      const trendDirection = await computeTrendDirection(childDescendants);
      breakdown.push({ jurisdictionId: child.jurisdiction_id, name: child.name, ...childCounts, trendDirection });
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

// Feature Catalog Section 5.2 "Policy-input trend lines" - a longitudinal
// time series distinct from the current-snapshot stat tiles above. National/
// State tiers only makes sense here (District's own DistressHistoryScreen-
// style per-case detail already exists via Counsellor's case detail).
router.get(
  '/dashboard/:jurisdictionId/trend',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;
    const months = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);

    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    const { data: victims } = await supabase
      .from('victims')
      .select('distress_scores(score_value, computed_at)')
      .in('jurisdiction_id', allDescendantIds);

    const scoresByMonth = new Map(); // 'YYYY-MM' -> { sum, count }
    for (const v of victims || []) {
      for (const s of v.distress_scores || []) {
        const monthKey = s.computed_at.slice(0, 7);
        const bucket = scoresByMonth.get(monthKey) || { sum: 0, count: 0 };
        bucket.sum += s.score_value;
        bucket.count += 1;
        scoresByMonth.set(monthKey, bucket);
      }
    }

    const points = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = scoresByMonth.get(monthKey);
      points.push({ month: monthKey, averageScore: bucket ? Math.round((bucket.sum / bucket.count) * 10) / 10 : null });
    }

    return ok(res, { points });
  }
);

// Feature Catalog Section 3.5 "Edit victim record" - search-by-docket-number
// for the Edit form to load a record into before PATCHing it. Jurisdiction-
// checked on the FOUND victim's own jurisdiction (not derivable from the
// query string up front), same reasoning as PATCH /victims/:victimId below.
router.get('/victims', verifyToken, requireRole(['Administration', 'Ministry']), generalApiLimiter, async (req, res) => {
  const { docketNumber } = req.query;
  if (!docketNumber) return fail(res, 'docketNumber is required', 400);

  const { data: victim } = await supabase
    .from('victims')
    .select('victim_id, docket_number, case_type_id, jurisdiction_id, case_stage, status')
    .ilike('docket_number', String(docketNumber).trim().replace(/[%_\\]/g, '\\$&'))
    .maybeSingle();
  if (!victim) return ok(res, { victim: null });

  // Same parent-chain walk requireJurisdiction() does, applied to the FOUND
  // victim's jurisdiction (unknowable up front from just a docket number
  // query string, which is why this route can't use that middleware
  // directly) - so a State/National Admin can find victims anywhere in
  // their own subtree, not just an exact district-id match.
  if (!req.auth.roles.some((r) => r.roleName === 'Ministry')) {
    const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));
    let currentId = victim.jurisdiction_id;
    let allowed = false;
    while (currentId) {
      if (assignedIds.has(currentId)) { allowed = true; break; }
      const { data: node } = await supabase.from('jurisdictions').select('parent_id').eq('jurisdiction_id', currentId).maybeSingle();
      currentId = node ? node.parent_id : null;
    }
    if (!allowed) return fail(res, 'Outside your assigned jurisdiction', 403);
  }

  const { data: identity } = await supabase.from('victim_identity').select('full_name, contact_number, address').eq('victim_id', victim.victim_id).maybeSingle();

  return ok(res, {
    victim: {
      victimId: victim.victim_id,
      docketNumber: victim.docket_number,
      caseTypeId: victim.case_type_id,
      jurisdictionId: victim.jurisdiction_id,
      caseStage: victim.case_stage,
      status: victim.status,
      fullName: identity?.full_name || null,
      contactNumber: identity?.contact_number || null,
      address: identity?.address || null,
    },
  });
});

// Feature Catalog Section 3.5 - the write-side counterpart to auth.victim.js's
// docket-based login (Section 1.1). requireJurisdiction on the BODY's
// jurisdictionId (the district the new victim belongs to, not an existing
// resource) is what actually enforces "a District Admin can only create
// victims inside their own district."
router.post(
  '/victims',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { docketNumber, fullName, jurisdictionId, caseTypeId, caseStage, address, caseBackground } = req.body;
    try {
      const { victimId } = await createVictim({
        docketNumber, fullName, jurisdictionId, caseTypeId, caseStage, address, caseBackground,
        provisionedVia: 'district_admin',
      });
      await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'create', entityType: 'victim', entityId: victimId });
      // docketNumber returned explicitly (not just victimId) - this is what
      // the victim will need to log in, and the admin needs to hand it to
      // them out-of-band, same reasoning as Ministry's temp-password return
      // on staff creation (routes/ministry.js).
      return ok(res, { victimId, docketNumber }, 'Victim record created', 201);
    } catch (err) {
      if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
      throw err;
    }
  }
);

router.patch(
  '/victims/:victimId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction(async (req) => {
    const { data } = await supabase.from('victims').select('jurisdiction_id').eq('victim_id', req.params.victimId).maybeSingle();
    return data ? data.jurisdiction_id : null;
  }),
  async (req, res) => {
    const { victimId } = req.params;
    const { caseStage, address, contactNumber } = req.body;
    try {
      await updateVictim(victimId, { caseStage, address, contactNumber });
      await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'update', entityType: 'victim', entityId: victimId });
      return ok(res, null, 'Victim record updated');
    } catch (err) {
      if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
      throw err;
    }
  }
);

// Feature Catalog Section 3.6/4.4 - snapshots the caller's own dashboard
// numbers (the exact same computation /dashboard/:jurisdictionId already
// does, so there's no separate aggregation query to keep in sync) into a
// durable `reports` row Ministry can list (routes/ministry.js's inbox).
router.post(
  '/reports/generate',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId, periodStart, periodEnd } = req.body;
    if (!jurisdictionId) return fail(res, 'jurisdictionId is required', 400);

    const { data: jurisdiction, error: jError } = await supabase.from('jurisdictions').select('level, name').eq('jurisdiction_id', jurisdictionId).single();
    if (jError || !jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    const { counts } = await countVictimsByRisk(allDescendantIds);

    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getTime() - TREND_PERIOD_DAYS * 86400000);

    const { data, error } = await supabase
      .from('reports')
      .insert({
        jurisdiction_id: jurisdictionId,
        generated_by: req.auth.officialId,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        snapshot: { jurisdictionName: jurisdiction.name, tier: jurisdiction.level, ...counts },
      })
      .select('report_id, generated_at')
      .single();
    if (error) return fail(res, `Could not generate report: ${error.message}`, 500);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'report', entityId: data.report_id });

    return ok(res, { reportId: data.report_id, generatedAt: data.generated_at }, 'Report generated - visible to Ministry', 201);
  }
);

module.exports = router;
