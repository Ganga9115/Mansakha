const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { getDescendantJurisdictionIds, getChildJurisdictions } = require('../../core/services/jurisdictionTree');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { requireJurisdiction } = require('../../core/middleware/requireJurisdiction');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { createUser, updateUser, ProvisioningError } = require('../../user/services/userProvisioning');
const { generateJurisdictionAnalytics } = require('../../ai/gemini');
const { predictEscalationRiskBatch } = require('../../ai/scoring');
const { resolveDateWindow, bucketize } = require('../../core/services/reportBuckets');

// How far back to look when predicting escalation risk across a whole
// jurisdiction subtree - predictEscalationRisk itself further caps each
// user's own history to their most recent 8 readings.
const PREDICTION_LOOKBACK_DAYS = 30;

const router = express.Router();

// This is State Admin's own dedicated copy of what used to be the single
// shared routes/admin.js - per the role-based restructure, every tier
// (district/state/national) owns a full, independent copy of every route,
// even the ones that don't actually branch by tier. No shared imports across
// role folders.

// PostgREST rejects a `.in()` filter once the id list makes the URL too long -
// confirmed live at the National tier, where a full descendant-jurisdiction
// list (700+ districts) blew past that limit and made the query fail with a
// 400. Several callers here were only reading `data`, never `error`, so that
// failure silently read as "no matching rows" instead of a broken request -
// every place that filters by an unbounded jurisdiction subtree goes through
// this chunked helper instead of a bare `.in()` so that can't happen again.
const ID_CHUNK_SIZE = 150;

async function selectInChunks(ids, runChunk) {
  const rows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await runChunk(chunk);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
}

// Average distress score for a set of jurisdictions within [sinceIso, untilIso)
// - untilIso omitted means "up to now".
//
// Goes straight to Postgres (pgPool) rather than through supabase-js/PostgREST -
// confirmed live that a single PostgREST round trip costs ~1-2s of pure
// network/HTTP overhead here regardless of how little data comes back, and
// this is called twice per state on every State/National dashboard load
// (~70 calls total). The raw connection cuts each call to tens of
// milliseconds, which is what actually took the National dashboard from
// 30+ seconds down to near-instant - the chunking/parallelizing fixes above
// this comment address a different, smaller-impact problem (PostgREST's
// URL-length limit and this file's own sequential loop), not this one.
async function computeAverageScore(jurisdictionIds, sinceIso, untilIso) {
  const { rows } = await pool.query(
    `select ds.score_value
     from distress_scores ds
     join users u on u.user_id = ds.user_id
     where u.jurisdiction_id = any($1::uuid[])
       and ds.computed_at >= $2
       and ($3::timestamptz is null or ds.computed_at < $3)`,
    [jurisdictionIds, sinceIso, untilIso || null]
  );
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + Number(r.score_value), 0);
  return sum / rows.length;
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

// Raw pg (see computeAverageScore's comment above for why) - LATERAL join
// picks each user's single latest distress_scores row (or none), matching
// the old embed's `distress_scores?.[0]` after an order-by-computed_at-desc.
// Computes total/vulnerable/highRisk/critical for every DIRECT CHILD of a
// jurisdiction in one grouped query, instead of the N+1 loop below that ran
// countUsersByRisk once per child (35 separate round trips for a National-
// tier load, all competing for the pg pool's limited connections - confirmed
// live as the dominant remaining cost after moving those calls off REST).
// Users are always assigned to a district-level jurisdiction, so the
// grouping key differs by tier: State's children are districts (group by
// the user's own jurisdiction_id directly); National's children are
// states (group by that district's parent_id) - the hierarchy is exactly
// national -> state -> district, never deeper, so one extra join covers it.
async function countUsersByRiskGroupedByChild(jurisdictionIds, { groupByParent }) {
  const groupExpr = groupByParent ? 'j.parent_id' : 'u.jurisdiction_id';
  const { rows } = await pool.query(
    `select ${groupExpr} as group_id,
            count(distinct u.user_id) as total,
            count(distinct u.user_id) filter (where rl.name = 'Moderate') as vulnerable,
            count(distinct u.user_id) filter (where rl.name = 'High') as high_risk,
            count(distinct u.user_id) filter (where rl.name = 'Critical') as critical
     from users u
     join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     left join lateral (
       select risk_level_id from distress_scores where user_id = u.user_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.jurisdiction_id = any($1::uuid[])
     group by ${groupExpr}`,
    [jurisdictionIds]
  );

  const byGroupId = new Map();
  for (const r of rows) {
    byGroupId.set(r.group_id, {
      total: Number(r.total),
      vulnerable: Number(r.vulnerable),
      highRisk: Number(r.high_risk),
      critical: Number(r.critical),
    });
  }
  return byGroupId;
}

async function countUsersByRisk(jurisdictionIds) {
  const { rows } = await pool.query(
    `select u.user_id, u.case_stage, ds.score_value, rl.name as risk_level_name
     from users u
     left join lateral (
       select score_value, risk_level_id
       from distress_scores
       where user_id = u.user_id
       order by computed_at desc
       limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );

  const counts = { totalCases: 0, vulnerableUsers: 0, highRiskCases: 0, criticalCases: 0 };
  const caseRows = [];
  for (const u of rows) {
    counts.totalCases += 1;
    const riskLevel = u.risk_level_name || null;
    if (riskLevel === 'Moderate') counts.vulnerableUsers += 1;
    if (riskLevel === 'High') counts.highRiskCases += 1;
    if (riskLevel === 'Critical') counts.criticalCases += 1;
    caseRows.push({ userId: u.user_id, caseStage: u.case_stage, score: u.score_value !== null ? Number(u.score_value) : null, riskLevel });
  }
  return { counts, caseRows };
}

// Forward-looking sibling of countUsersByRisk: that function tallies cases by
// their CURRENT risk tier (reactive - what has already happened);  this one
// counts how many are projected to cross into a higher tier soon (PS:
// "predict escalation... before a crisis situation emerges"). One batched
// fetch of recent score history for every user in the jurisdiction subtree,
// not a query per user, then predictEscalationRiskBatch does the regression.
async function countPredictedEscalations(jurisdictionIds) {
  // Raw pg (not Supabase REST/selectInChunks), matching computeAverageScore
  // and countUsersByRisk above - `= any($1::uuid[])` passes the id list as a
  // single bound parameter, so it isn't subject to the URL-length limit
  // selectInChunks exists to work around, and avoids PostgREST's ~1-2s
  // per-call overhead on what can be a large jurisdiction subtree.
  const { rows } = await pool.query(
    `select ds.user_id, ds.score_value, ds.computed_at
     from distress_scores ds
     join users u on u.user_id = ds.user_id
     where u.jurisdiction_id = any($1::uuid[])
       and ds.computed_at > now() - ($2 || ' days')::interval`,
    [jurisdictionIds, PREDICTION_LOOKBACK_DAYS]
  );

  const predictions = predictEscalationRiskBatch(
    rows.map((r) => ({ userId: r.user_id, score: Number(r.score_value), computedAt: r.computed_at }))
  );

  let count = 0;
  for (const prediction of predictions.values()) {
    if (prediction.daysToNextTier != null) count += 1;
  }
  return count;
}

// Reports page's 3 charts (trend line, severity-distribution stacked bars,
// intervention-phase donut) - previously all hardcoded/static markup in
// Reports.jsx regardless of tier, with a time-range filter that only
// changed which button looked selected. This is the real data those charts
// should read from, scoped to jurisdictionId's own subtree exactly like
// /dashboard/:jurisdictionId above.
router.get(
  '/reports-analytics/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;
    const { since, until, buckets } = resolveDateWindow(req.query);
    const jurisdictionIds = await getDescendantJurisdictionIds(jurisdictionId);

    const [{ rows: scoreRows }, { rows: interventionRows }] = await Promise.all([
      pool.query(
        `select ds.computed_at, ds.score_value, rl.name as risk_level_name
         from distress_scores ds
         join users u on u.user_id = ds.user_id
         join risk_levels rl on rl.risk_level_id = ds.risk_level_id
         where u.jurisdiction_id = any($1::uuid[]) and ds.computed_at >= $2 and ds.computed_at <= $3`,
        [jurisdictionIds, since.toISOString(), until.toISOString()]
      ),
      // "In Progress" vs "Planned/Referred" isn't a stored status - the
      // schema only has recommended_at/completed_at - so an intervention
      // counts as in-progress once its assigned official has actually
      // logged a case note on that user, and planned/referred until then.
      pool.query(
        `select i.completed_at,
                exists(
                  select 1 from case_notes cn
                  where cn.user_id = i.user_id and cn.official_id = i.assigned_official_id
                    and cn.created_at > i.recommended_at
                ) as has_notes
         from interventions i
         join users u on u.user_id = i.user_id
         where u.jurisdiction_id = any($1::uuid[]) and i.recommended_at >= $2 and i.recommended_at <= $3`,
        [jurisdictionIds, since.toISOString(), until.toISOString()]
      ),
    ]);

    const scoreBuckets = bucketize(scoreRows, buckets, 'computed_at');
    const trend = buckets.map((b, i) => {
      const rowsInBucket = scoreBuckets[i];
      const avg = rowsInBucket.length
        ? rowsInBucket.reduce((sum, r) => sum + Number(r.score_value), 0) / rowsInBucket.length
        : null;
      return { label: b.label, avgScore: avg !== null ? Math.round(avg * 10) / 10 : null };
    });
    const severityDistribution = buckets.map((b, i) => {
      const rowsInBucket = scoreBuckets[i];
      return {
        label: b.label,
        critical: rowsInBucket.filter((r) => r.risk_level_name === 'Critical').length,
        high: rowsInBucket.filter((r) => r.risk_level_name === 'High').length,
        moderate: rowsInBucket.filter((r) => r.risk_level_name === 'Moderate').length,
        low: rowsInBucket.filter((r) => r.risk_level_name === 'Low').length,
      };
    });

    const interventionPhases = { completed: 0, inProgress: 0, planned: 0 };
    for (const i of interventionRows) {
      if (i.completed_at) interventionPhases.completed += 1;
      else if (i.has_notes) interventionPhases.inProgress += 1;
      else interventionPhases.planned += 1;
    }

    return ok(res, { trend, severityDistribution, interventionPhases });
  }
);

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

    try {
      if (jurisdiction.level === 'district') {
        // District's default view is case-level detail, not just aggregates -
        // Section 4.5. `counts` stay computed over the full district (not just
        // the current page) - only the case list itself is paginated, so a
        // district with thousands of cases doesn't load them all at once.
        const [{ counts, caseRows }, predictedEscalations] = await Promise.all([
          countUsersByRisk([jurisdictionId]),
          countPredictedEscalations([jurisdictionId]),
        ]);
        const total = caseRows.length;
        const cases = caseRows.slice(offset, offset + pageSize);
        return ok(res, { tier: 'district', ...counts, predictedEscalations, trends: null, cases, total });
      }

      // State/National: aggregate-with-drill-down is the default, not case-level -
      // Section 4.5. State also sees its child districts side by side; National sees
      // its child states side by side.
      const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
      // One rollup for the whole subtree, not broken down per child - shown as
      // a single headline stat ("N cases predicted to escalate soon") rather
      // than adding a column to every child's row.
      const predictedEscalations = await countPredictedEscalations(allDescendantIds);
      const children = await getChildJurisdictions(jurisdictionId);

      // One grouped query gets every child's counts at once (see
      // countUsersByRiskGroupedByChild's comment) instead of one query per
      // child - this is what actually took the National tier from single-
      // digit seconds down further, since it was still running 35 separate
      // pg round trips through a 10-connection pool. Trend direction is
      // its own (smaller, still parallelized) pass per child below.
      const countsByChildId = await countUsersByRiskGroupedByChild(allDescendantIds, { groupByParent: jurisdiction.level === 'national' });
      const zeroCounts = { total: 0, totalCases: 0, vulnerable: 0, vulnerableUsers: 0, highRisk: 0, highRiskCases: 0, critical: 0, criticalCases: 0 };
      const rawCounts = [...countsByChildId.values()].reduce(
        (acc, c) => ({
          total: acc.total + c.total,
          vulnerable: acc.vulnerable + c.vulnerable,
          highRisk: acc.highRisk + c.highRisk,
          critical: acc.critical + c.critical,
        }),
        { total: 0, vulnerable: 0, highRisk: 0, critical: 0 }
      );
      const counts = {
        ...rawCounts,
        totalCases: rawCounts.total,
        vulnerableUsers: rawCounts.vulnerable,
        highRiskCases: rawCounts.highRisk,
        criticalCases: rawCounts.critical,
      };

      const breakdown = await Promise.all(children.map(async (child) => {
        const childDescendants = await getDescendantJurisdictionIds(child.jurisdiction_id);
        const trendDirection = await computeTrendDirection(childDescendants);
        const childCounts = countsByChildId.get(child.jurisdiction_id) || zeroCounts;
        return {
          jurisdictionId: child.jurisdiction_id,
          name: child.name,
          ...childCounts,
          totalCases: childCounts.total,
          vulnerableUsers: childCounts.vulnerable,
          highRiskCases: childCounts.highRisk,
          criticalCases: childCounts.critical,
          trendDirection,
        };
      }));

      return ok(res, { tier: jurisdiction.level, ...counts, predictedEscalations, trends: breakdown });
    } catch (err) {
      return fail(res, `Could not load dashboard: ${err.message}`, 500);
    }
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
    if (!jurisdiction) {
      return fail(res, 'Jurisdiction not found', 404);
    }

    let formattedAlerts = [];
    if (jurisdiction.level === 'district') {
      // Alerts Feed is for actionable items only (a Critical alert or an
      // SOS, each with a real open/acknowledged/resolved state) -
      // 'disengagement'/'weekly_review' are informational notices with no
      // alerts/sos_events row and stay bell-only. Filtering by source at the
      // query level - and embedding BOTH alerts() and sos_events() - means
      // every row is guaranteed a real linked object; the previous version
      // only ever selected alerts() and read `n.alerts.user_id`
      // unconditionally, which threw (TypeError: Cannot read properties of
      // null) the moment this official had received even one 'sos' (or
      // disengagement/weekly_review) notification - confirmed live as a
      // real crash, not hypothetical, since SOS is explicitly routed here.
      const { data, error } = await supabase
        .from('alert_notifications')
        .select('notified_at, source, alerts(alert_id, user_id, triggered_at, alert_statuses(name)), sos_events(sos_event_id, user_id, triggered_at, acknowledged_at, resolved_at)')
        .eq('official_id', req.auth.officialId)
        .in('source', ['distress_score', 'sos'])
        .order('notified_at', { ascending: false })
        .limit(50);
      if (error) return fail(res, 'Could not load alerts', 500);

      formattedAlerts = (data || []).map((n) => {
        const isUrgentHelp = n.source === 'sos';
        return {
          alertId: isUrgentHelp ? n.sos_events.sos_event_id : n.alerts.alert_id,
          userId: isUrgentHelp ? n.sos_events.user_id : n.alerts.user_id,
          triggeredAt: isUrgentHelp ? n.sos_events.triggered_at : n.alerts.triggered_at,
          status: isUrgentHelp
            ? (n.sos_events.resolved_at ? 'Resolved' : n.sos_events.acknowledged_at ? 'Acknowledged' : 'Open')
            : n.alerts.alert_statuses.name,
        };
      });
    } else {
      const descendants = await getDescendantJurisdictionIds(jurisdictionId);
      // Raw pg, not Supabase REST - a State/National-tier call can have
      // hundreds of descendant district ids (724 nationwide), and PostgREST's
      // .in() filter serializes the whole array into the request URL, which
      // exceeds its request-size limit and 500s ("Bad Request") once the
      // jurisdiction has more than roughly a hundred descendants. A
      // parameterized array bound over the wire has no such limit.
      //
      // Both queries run against the whole subtree directly (not through
      // alert_notifications/this official's own inbox, since a State/National
      // admin isn't necessarily a personal recipient of every case in their
      // tree) - alerts and sos_events are UNIONed here so an SOS in this
      // subtree shows up alongside Critical alerts, not just in the bell.
      const [{ rows: alertRows }, { rows: sosRows }] = await Promise.all([
        pool.query(
          `select a.alert_id, a.user_id, a.triggered_at, ast.name as status_name
           from alerts a
           join users u on u.user_id = a.user_id
           join alert_statuses ast on ast.alert_status_id = a.alert_status_id
           where u.jurisdiction_id = any($1::uuid[])
           order by a.triggered_at desc
           limit 50`,
          [descendants]
        ),
        pool.query(
          `select se.sos_event_id, se.user_id, se.triggered_at, se.acknowledged_at, se.resolved_at
           from sos_events se
           join users u on u.user_id = se.user_id
           where u.jurisdiction_id = any($1::uuid[])
           order by se.triggered_at desc
           limit 50`,
          [descendants]
        ),
      ]);

      formattedAlerts = [
        ...alertRows.map((a) => ({
          alertId: a.alert_id,
          userId: a.user_id,
          triggeredAt: a.triggered_at,
          status: a.status_name,
        })),
        ...sosRows.map((s) => ({
          alertId: s.sos_event_id,
          userId: s.user_id,
          triggeredAt: s.triggered_at,
          status: s.resolved_at ? 'Resolved' : s.acknowledged_at ? 'Acknowledged' : 'Open',
        })),
      ]
        .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
        .slice(0, 50);
    }

    return ok(res, { alerts: formattedAlerts });
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
    try {
    if (jurisdiction.level === 'district') {
      const { caseRows } = await countUsersByRisk([jurisdictionId]);
      csv = toCsv(['userId', 'score', 'riskLevel'], caseRows);
      filename = `${jurisdiction.name}-cases.csv`;
    } else {
      // Same one-query-per-tier fix as GET /dashboard/:jurisdictionId, instead
      // of one round trip per child.
      const [children, allDescendantIds] = await Promise.all([
        getChildJurisdictions(jurisdictionId),
        getDescendantJurisdictionIds(jurisdictionId),
      ]);
      const countsByChildId = await countUsersByRiskGroupedByChild(allDescendantIds, { groupByParent: jurisdiction.level === 'national' });
      const breakdown = children.map((child) => ({
        jurisdictionId: child.jurisdiction_id,
        name: child.name,
        ...(countsByChildId.get(child.jurisdiction_id) || { total: 0, vulnerable: 0, highRisk: 0, critical: 0 }),
      }));
      csv = toCsv(['jurisdictionId', 'name', 'total', 'vulnerable', 'highRisk', 'critical'], breakdown);
      filename = `${jurisdiction.name}-breakdown.csv`;
    }
    } catch (err) {
      return fail(res, `Could not export dashboard: ${err.message}`, 500);
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

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString();

    // Score history and policies are independent (different tables, neither
    // depends on the other's result) and both go straight to Postgres - the
    // ID-chunked Supabase REST calls this used to make were both slow (REST's
    // own per-call overhead) and, for a jurisdiction with a very large
    // descendant set, exactly the kind of unbounded fan-out fixed elsewhere
    // this session.
    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    const [{ rows: scoreRows }, { rows: policyRows }] = await Promise.all([
      pool.query(
        `select ds.score_value, ds.computed_at
         from distress_scores ds
         join users u on u.user_id = ds.user_id
         where u.jurisdiction_id = any($1::uuid[])`,
        [allDescendantIds]
      ),
      // Ministry Analytics & Workflow spec Task 2B "Policy Impact Tracker" -
      // overlays this SAME jurisdiction's own launched policies (not its
      // descendant subtree - a policy is understood as authored by/scoped to
      // exactly the jurisdiction it was created under, unlike the score
      // aggregation above) onto the identical [windowStart, now] window the
      // trend line already covers, so the frontend can plot a marker at each
      // policy's launched_at against the score line without a second
      // months-to-dates computation.
      pool.query(
        `select policy_id, title, launched_at from policies
         where jurisdiction_id = $1 and launched_at >= $2 and launched_at <= $3
         order by launched_at desc`,
        [jurisdictionId, windowStart, now.toISOString()]
      ),
    ]);

    const scoresByMonth = new Map(); // 'YYYY-MM' -> { sum, count }
    for (const s of scoreRows) {
      const monthKey = s.computed_at.toISOString().slice(0, 7);
      const bucket = scoresByMonth.get(monthKey) || { sum: 0, count: 0 };
      bucket.sum += Number(s.score_value);
      bucket.count += 1;
      scoresByMonth.set(monthKey, bucket);
    }

    const points = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = scoresByMonth.get(monthKey);
      points.push({ month: monthKey, averageScore: bucket ? Math.round((bucket.sum / bucket.count) * 10) / 10 : null });
    }

    const policies = policyRows.map((p) => ({ policyId: p.policy_id, title: p.title, launchedAt: p.launched_at }));

    return ok(res, { points, policies });
  }
);

// Ministry Analytics & Workflow spec Task 2B "Policy Impact Tracker" -
// create/list a strategic intervention a National/State/District admin
// launches, so its effect on the distress trend line above can be visually
// compared. jurisdiction-scoped on the BODY's jurisdictionId (a new
// resource, same reasoning as POST /users above).
router.post(
  '/policies',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { title, description, launchedAt, jurisdictionId } = req.body;
    if (!title || !launchedAt || !jurisdictionId) return fail(res, 'title, launchedAt, and jurisdictionId are required', 400);

    const { data, error } = await supabase
      .from('policies')
      .insert({
        jurisdiction_id: jurisdictionId,
        title,
        description: description || null,
        launched_at: new Date(launchedAt).toISOString(),
        created_by: req.auth.officialId,
      })
      .select('policy_id, title, description, launched_at')
      .single();
    if (error) return fail(res, `Could not create policy: ${error.message}`, 500);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'policy', entityId: data.policy_id });

    return ok(
      res,
      { policyId: data.policy_id, title: data.title, description: data.description, launchedAt: data.launched_at },
      'Policy created',
      201
    );
  }
);

// List a jurisdiction's own launched policies - exact jurisdiction_id match,
// same reasoning as the trend endpoint's policies overlay above (not the
// descendant subtree /dashboard and /dashboard/trend use for score
// aggregation).
router.get(
  '/policies/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;
    const { rows: data } = await pool.query(
      `select policy_id, title, description, launched_at, created_by from policies
       where jurisdiction_id = $1 order by launched_at desc`,
      [jurisdictionId]
    );

    return ok(res, {
      policies: data.map((p) => ({
        policyId: p.policy_id,
        title: p.title,
        description: p.description,
        launchedAt: p.launched_at,
        createdBy: p.created_by,
      })),
    });
  }
);

// Feature Catalog Section 3.5 "Edit user record" - search-by-docket-number
// for the Edit form to load a record into before PATCHing it. Jurisdiction-
// checked on the FOUND user's own jurisdiction (not derivable from the
// query string up front), same reasoning as PATCH /users/:userId below.
router.get('/users', verifyToken, requireRole(['Administration', 'Ministry']), generalApiLimiter, async (req, res) => {
  const { docketNumber } = req.query;
  if (!docketNumber) return fail(res, 'docketNumber is required', 400);

  const { data: user } = await supabase
    .from('users')
    .select('user_id, docket_number, case_type_id, jurisdiction_id, case_stage, status')
    .ilike('docket_number', String(docketNumber).trim().replace(/[%_\\]/g, '\\$&'))
    .maybeSingle();
  if (!user) return ok(res, { user: null });

  // Same parent-chain walk requireJurisdiction() does, applied to the FOUND
  // user's jurisdiction (unknowable up front from just a docket number
  // query string, which is why this route can't use that middleware
  // directly) - so a State/National Admin can find users anywhere in
  // their own subtree, not just an exact district-id match.
  if (!req.auth.roles.some((r) => r.roleName === 'Ministry')) {
    const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));
    let currentId = user.jurisdiction_id;
    let allowed = false;
    while (currentId) {
      if (assignedIds.has(currentId)) { allowed = true; break; }
      const { data: node } = await supabase.from('jurisdictions').select('parent_id').eq('jurisdiction_id', currentId).maybeSingle();
      currentId = node ? node.parent_id : null;
    }
    if (!allowed) return fail(res, 'Outside your assigned jurisdiction', 403);
  }

  const { data: identity } = await supabase.from('user_identity').select('full_name, contact_number, address').eq('user_id', user.user_id).maybeSingle();

  return ok(res, {
    user: {
      userId: user.user_id,
      docketNumber: user.docket_number,
      caseTypeId: user.case_type_id,
      jurisdictionId: user.jurisdiction_id,
      caseStage: user.case_stage,
      status: user.status,
      fullName: identity?.full_name || null,
      contactNumber: identity?.contact_number || null,
      address: identity?.address || null,
    },
  });
});

// Feature Catalog Section 3.5 - the write-side counterpart to auth.user.js's
// docket-based login (Section 1.1). requireJurisdiction on the BODY's
// jurisdictionId (the district the new user belongs to, not an existing
// resource) is what actually enforces "a District Admin can only create
// users inside their own district."
router.post(
  '/users',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground, password } = req.body;
    try {
      const { userId, temporaryPassword } = await createUser({
        docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, caseStage, address, caseBackground, password,
        provisionedVia: 'district_admin',
      });
      await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'create', entityType: 'user', entityId: userId });
      // docketNumber and temporaryPassword returned explicitly (not just
      // userId) - this is what the user needs to log in, and the admin
      // has to hand it to them out-of-band, same reasoning as Ministry's
      // temp-password return on staff creation (routes/ministry.js).
      return ok(res, { userId, docketNumber, temporaryPassword }, 'User record created', 201);
    } catch (err) {
      if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
      throw err;
    }
  }
);

router.patch(
  '/users/:userId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction(async (req) => {
    const { data } = await supabase.from('users').select('jurisdiction_id').eq('user_id', req.params.userId).maybeSingle();
    return data ? data.jurisdiction_id : null;
  }),
  async (req, res) => {
    const { userId } = req.params;
    const { caseStage, address, contactNumber } = req.body;
    try {
      // canCloseCase omitted (defaults false) - District Admin cannot mark a
      // case 'Case Closed', only Data Operator can (routes/dataIntake.js).
      await updateUser(userId, { caseStage, address, contactNumber });
      await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'update', entityType: 'user', entityId: userId });
      return ok(res, null, 'User record updated');
    } catch (err) {
      if (err instanceof ProvisioningError) return fail(res, err.message, err.status);
      throw err;
    }
  }
);

// ===== Ministry Analytics & Workflow: Task 2A - AI analytics generator =====

// Most-recent-N-rows-per-source cap on the raw dump handed to Gemini - an
// active jurisdiction's chat/journal/case-note volume over a period could
// otherwise be unbounded, risking a call that's too large or too slow.
// Documented judgment call: 200 rows per source (600 rows total max), most
// recent first within the requested period.
const ANALYTICS_PER_SOURCE_CAP = 200;

// Feature Catalog / Ministry Analytics & Workflow spec Task 2A - caches a
// Gemini-generated qualitative read (themes, sentiment, predicted counsellor
// demand, possible syndicate flags) into jurisdiction_analytics_insights so
// the dashboard never has to call Gemini on page load against the shared,
// small free-tier quota - this route is the only thing that ever calls
// Gemini for this feature, and only when an admin explicitly clicks
// "Generate".
//
// Scope judgment call: users are matched via the DESCENDANT SUBTREE of
// jurisdictionId (getDescendantJurisdictionIds), not an exact jurisdiction_id
// match - a State/National admin generating analytics against their own
// state/national-level jurisdiction_id would otherwise always see zero
// users (no user's jurisdiction_id is ever a state/national id
// directly). Same reasoning /dashboard and /dashboard/trend above already
// use for aggregating users across a subtree.
router.post(
  '/analytics/generate',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId, periodStart, periodEnd } = req.body;
    if (!jurisdictionId) return fail(res, 'jurisdictionId is required', 400);

    const { data: jurisdiction, error: jError } = await supabase.from('jurisdictions').select('level, name').eq('jurisdiction_id', jurisdictionId).single();
    if (jError || !jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getTime() - TREND_PERIOD_DAYS * 86400000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    let users;
    try {
      users = await selectInChunks(allDescendantIds, (chunk) =>
        supabase.from('users').select('user_id').in('jurisdiction_id', chunk)
      );
    } catch (err) {
      return fail(res, `Could not load users: ${err.message}`, 500);
    }
    const userIds = users.map((u) => u.user_id);

    let chatMessages = [];
    let journalEntries = [];
    let caseNotes = [];
    if (userIds.length > 0) {
      const [chatRes, journalRes, notesRes] = await Promise.all([
        // sender: 'user' only - the AI's own canned supportive replies
        // (sender: 'ai') aren't a distress signal worth feeding back into
        // another AI analysis.
        supabase
          .from('chat_messages')
          .select('body, sent_at')
          .in('user_id', userIds)
          .eq('sender', 'user')
          .gte('sent_at', startIso)
          .lte('sent_at', endIso)
          .order('sent_at', { ascending: false })
          .limit(ANALYTICS_PER_SOURCE_CAP),
        supabase
          .from('journal_entries')
          .select('content, created_at')
          .in('user_id', userIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(ANALYTICS_PER_SOURCE_CAP),
        supabase
          .from('case_notes')
          .select('note_text, created_at')
          .in('user_id', userIds)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(ANALYTICS_PER_SOURCE_CAP),
      ]);
      chatMessages = chatRes.data || [];
      journalEntries = journalRes.data || [];
      caseNotes = notesRes.data || [];
    }

    const totalItems = chatMessages.length + journalEntries.length + caseNotes.length;
    if (totalItems === 0) {
      // No inserted row for a zero-data period, per the spec - nothing
      // meaningful to cache, and no Gemini call spent on empty input.
      return ok(res, { insight: null }, 'Not enough interaction data for this period');
    }

    const rawDump = [
      ...chatMessages.map((m) => `[chat] ${m.body}`),
      ...journalEntries.map((j) => `[journal] ${j.content}`),
      ...caseNotes.map((n) => `[case_note] ${n.note_text}`),
    ].join('\n');

    let analysis;
    try {
      analysis = await generateJurisdictionAnalytics(rawDump);
    } catch (err) {
      // Malformed/failed Gemini response never gets inserted as a row - a
      // clear 502 instead, per the spec.
      return fail(res, `Analytics generation failed: ${err.message}`, 502);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('jurisdiction_analytics_insights')
      .insert({
        jurisdiction_id: jurisdictionId,
        period_start: startIso,
        period_end: endIso,
        top_themes: analysis.topThemes,
        overall_sentiment: analysis.overallSentiment,
        emerging_risks: analysis.emergingRisks,
        predicted_counsellor_demand: analysis.predictedCounsellorDemand,
        demand_reasoning: analysis.demandReasoning,
      })
      .select('insight_id, jurisdiction_id, generated_at, period_start, period_end, top_themes, overall_sentiment, emerging_risks, predicted_counsellor_demand, demand_reasoning')
      .single();
    if (insertError) return fail(res, `Could not save analytics insight: ${insertError.message}`, 500);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'jurisdiction_analytics_insight', entityId: inserted.insight_id });

    return ok(
      res,
      {
        insight: {
          insightId: inserted.insight_id,
          jurisdictionId: inserted.jurisdiction_id,
          generatedAt: inserted.generated_at,
          periodStart: inserted.period_start,
          periodEnd: inserted.period_end,
          topThemes: inserted.top_themes,
          overallSentiment: inserted.overall_sentiment,
          emergingRisks: inserted.emerging_risks,
          predictedCounsellorDemand: inserted.predicted_counsellor_demand,
          demandReasoning: inserted.demand_reasoning,
        },
      },
      'Analytics generated',
      201
    );
  }
);

// ===== Ministry Analytics & Workflow: Task 2C - Emergency Broadcast =====

// Feature Catalog / Ministry Analytics & Workflow spec Task 2C - mass SMS +
// push to every active user in a jurisdiction. Uses the same
// descendant-subtree scoping as Task 2A above (not an exact jurisdiction_id
// match) so a State/National admin's broadcast actually reaches users
// (who are always enrolled at district level), not zero rows.
router.post(
  '/broadcast',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId, message, priority } = req.body;
    if (!jurisdictionId || !message) return fail(res, 'jurisdictionId and message are required', 400);
    const normalizedPriority = priority === 'urgent' ? 'urgent' : 'normal';

    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    let activeUsers;
    try {
      activeUsers = await selectInChunks(allDescendantIds, (chunk) =>
        supabase.from('users').select('user_id').in('jurisdiction_id', chunk).eq('status', 'active')
      );
    } catch (err) {
      return fail(res, `Could not load users: ${err.message}`, 500);
    }

    if (activeUsers.length === 0) {
      return ok(res, { queuedCount: 0 }, 'No active users in this jurisdiction to broadcast to');
    }

    // Judgment call: every active user gets BOTH an SMS and a push row
    // (not gated by users.sms_checkin_enabled, unlike the automated
    // sms_checkin_prompt kind) - an emergency broadcast's whole point is
    // maximum reach, not respecting a routine-reminder opt-in. Two separate
    // dispatch_queue rows per user (not one row carrying two kinds)
    // matches this table's existing one-row-per-delivery-attempt shape, so
    // a user whose push fails but SMS succeeds (or vice versa) gets
    // independent, accurate retry/attempt tracking per channel.
    const rows = [];
    for (const u of activeUsers) {
      rows.push({ kind: 'admin_broadcast_sms', user_id: u.user_id, message, priority: normalizedPriority });
      rows.push({ kind: 'admin_broadcast_push', user_id: u.user_id, message, priority: normalizedPriority });
    }

    const { error: insertError } = await supabase.from('dispatch_queue').insert(rows);
    if (insertError) return fail(res, `Could not queue broadcast: ${insertError.message}`, 500);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'admin_broadcast', entityId: jurisdictionId });

    // Count of USERS queued (not dispatch_queue rows, which is 2x this),
    // per the spec.
    return ok(res, { queuedCount: activeUsers.length }, `Broadcast queued for ${activeUsers.length} user(s)`, 201);
  }
);

// ===== Ministry Analytics & Workflow: Task 2D - Counsellor Efficacy =====

// Feature Catalog / Ministry Analytics & Workflow spec Task 2D. Distinct,
// newly-built feature from the now-removed standalone "Workload" Admin Panel
// page (that page was deleted as a separate product decision, unrelated to
// this route) - reuses the same official_roles+role_name='Counsellor' join
// pattern services/stressResponse.js's selectLeastLoadedCounsellor already
// uses for counsellor lookup within a jurisdiction, exact jurisdiction_id
// match (not a descendant subtree) to match that same existing convention -
// a counsellor is assigned to work exactly one jurisdiction, not a whole
// state/national subtree.
router.get(
  '/counsellors/performance/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;

    // A counsellor is always assigned to a single district-level jurisdiction
    // (Ministry's Create Account form never offers a state/national
    // jurisdiction for a Counsellor role) - so an exact-match lookup here
    // would always come back empty for a State or National selection, even
    // though every one of that jurisdiction's districts may have counsellors.
    // Walking the descendant tree (a no-op for an already-district id, since
    // getDescendantJurisdictionIds always includes the root itself) lets the
    // same picker meaningfully aggregate at every tier instead of only
    // working for 'district'.
    const jurisdictionIds = await getDescendantJurisdictionIds(jurisdictionId);

    // official_roles has TWO FKs into officials (official_id AND
    // assigned_by), so a plain `officials(full_name)` embed here is
    // ambiguous to PostgREST ("more than one relationship was found") -
    // confirmed live, not hypothetical. Sidestepped with a second plain
    // query instead of an embed-hint (routes/lookups.js documents the same
    // "avoid embed hints, do two queries" convention for a different
    // ambiguous-relationship case).
    let roleRows;
    try {
      roleRows = await selectInChunks(jurisdictionIds, (chunk) =>
        supabase.from('official_roles').select('official_id, roles(role_name)').in('jurisdiction_id', chunk).is('revoked_at', null)
      );
    } catch (err) {
      return fail(res, `Could not load counsellors: ${err.message}`, 500);
    }

    const counsellorIds = roleRows.filter((r) => r.roles.role_name === 'Counsellor').map((r) => r.official_id);
    if (counsellorIds.length === 0) return ok(res, { counsellors: [] });

    const { data: officialRows } = await supabase.from('officials').select('official_id, full_name').in('official_id', counsellorIds);
    const fullNameById = new Map((officialRows || []).map((o) => [o.official_id, o.full_name]));

    const results = [];
    for (const officialId of counsellorIds) {
      // eslint-disable-next-line no-await-in-loop
      const { data: users } = await supabase
        .from('users')
        .select('status, distress_scores(score_value, computed_at)')
        .eq('assigned_counsellor_id', officialId);

      const activeCaseCount = (users || []).filter((u) => u.status === 'active').length;

      // EFFICACY PROXY (documented judgment call, per the spec's own
      // acknowledged ambiguity): there is no assignment-history table
      // recording WHEN a user was assigned to THIS counsellor
      // (users.assigned_counsellor_id is a single current-value column,
      // overwritten on reassignment, no history kept) - so a true
      // "before assignment vs. after assignment" comparison isn't possible
      // without building that out, which is out of scope here. Proxy used
      // instead: for every user CURRENTLY assigned to this counsellor
      // (active or not), compare their EARLIEST-ever distress_scores row
      // (computed_at asc) against their MOST RECENT one (computed_at
      // desc) - a positive point-drop (earliest minus latest) reads as
      // improvement. Users with fewer than 2 score readings are excluded
      // from the average entirely (nothing to compare), and the count of
      // users that WERE considered is returned alongside the average so
      // the UI can show "based on N cases" rather than presenting a
      // 1-case average as a solid signal.
      let dropSum = 0;
      let consideredCount = 0;
      for (const u of users || []) {
        const scores = (u.distress_scores || []).slice().sort((a, b) => new Date(a.computed_at) - new Date(b.computed_at));
        if (scores.length < 2) continue;
        dropSum += scores[0].score_value - scores[scores.length - 1].score_value;
        consideredCount += 1;
      }

      results.push({
        officialId,
        fullName: fullNameById.get(officialId) || null,
        activeCaseCount,
        avgDistressPointDrop: consideredCount > 0 ? Math.round((dropSum / consideredCount) * 10) / 10 : null,
        usersConsideredForEfficacy: consideredCount,
      });
    }

    return ok(res, { counsellors: results });
  }
);

// Feature Catalog Section 3.6/4.4 - snapshots the caller's own dashboard
// numbers (the exact same computation /dashboard/:jurisdictionId already
// does, so there's no separate aggregation query to keep in sync) into a
// durable `reports` row Ministry can list (routes/ministry.js's inbox).
//
// Ministry Analytics & Workflow spec Task 2E extends this with upward
// routing: commentary (the sending admin's own write-up), targetJurisdictionId
// (the parent tier this is being sent TO - setting it also marks the report
// 'Submitted' immediately instead of leaving it at the column's 'Draft'
// default), and insightId (optionally linking a Task 2A analytics snapshot).
router.post(
  '/reports/generate',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId, periodStart, periodEnd, commentary, targetJurisdictionId, insightId } = req.body;
    if (!jurisdictionId) return fail(res, 'jurisdictionId is required', 400);

    const { data: jurisdiction, error: jError } = await supabase.from('jurisdictions').select('level, name').eq('jurisdiction_id', jurisdictionId).single();
    if (jError || !jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    if (targetJurisdictionId) {
      const { data: targetJ } = await supabase.from('jurisdictions').select('jurisdiction_id').eq('jurisdiction_id', targetJurisdictionId).maybeSingle();
      if (!targetJ) return fail(res, 'targetJurisdictionId not found', 404);
    }
    if (insightId) {
      const { data: insightRow } = await supabase.from('jurisdiction_analytics_insights').select('insight_id').eq('insight_id', insightId).maybeSingle();
      if (!insightRow) return fail(res, 'insightId not found', 404);
    }

    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    let counts;
    try {
      ({ counts } = await countUsersByRisk(allDescendantIds));
    } catch (err) {
      return fail(res, `Could not compute jurisdiction counts: ${err.message}`, 500);
    }

    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getTime() - TREND_PERIOD_DAYS * 86400000);

    const insertPayload = {
      jurisdiction_id: jurisdictionId,
      generated_by: req.auth.officialId,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      snapshot: { jurisdictionName: jurisdiction.name, tier: jurisdiction.level, ...counts },
      commentary: commentary || null,
      target_jurisdiction_id: targetJurisdictionId || null,
      insight_id: insightId || null,
    };
    // Sending straight up to a parent tier (targetJurisdictionId given)
    // marks this Submitted immediately, per the spec - this key is omitted
    // entirely (not set to a literal 'Draft') when no target is given, so
    // the column's own default applies.
    if (targetJurisdictionId) insertPayload.status = 'Submitted';

    const { data, error } = await supabase
      .from('reports')
      .insert(insertPayload)
      .select('report_id, generated_at, status')
      .single();
    if (error) return fail(res, `Could not generate report: ${error.message}`, 500);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'report', entityId: data.report_id });

    return ok(res, { reportId: data.report_id, generatedAt: data.generated_at, status: data.status }, 'Report generated - visible to Ministry', 201);
  }
);

const REPORT_STATUSES = ['Draft', 'Submitted', 'Reviewed'];

// Ministry Analytics & Workflow spec Task 2E - the RECIPIENT tier (whoever
// the report's target_jurisdiction_id points at) marks a report reviewed
// after reading it. requireJurisdiction is scoped to target_jurisdiction_id,
// not the report's own origin jurisdiction_id - the sender shouldn't be able
// to mark their own upward report "Reviewed". The existence/target-set check
// runs BEFORE requireJurisdiction (as a plain middleware, not inside the
// resolver) specifically so a missing report or one with no target yields
// the spec's requested 404, rather than requireJurisdiction's generic 400
// "Could not resolve target jurisdiction".
router.patch(
  '/reports/:reportId/status',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res, next) => {
    const { data: report } = await supabase
      .from('reports')
      .select('report_id, target_jurisdiction_id')
      .eq('report_id', req.params.reportId)
      .maybeSingle();
    if (!report || !report.target_jurisdiction_id) return fail(res, 'Report not found or has no target jurisdiction set', 404);
    req._targetReport = report;
    next();
  },
  requireJurisdiction((req) => req._targetReport.target_jurisdiction_id),
  async (req, res) => {
    const { status } = req.body;
    if (!REPORT_STATUSES.includes(status)) return fail(res, `status must be one of: ${REPORT_STATUSES.join(', ')}`, 400);

    const { data, error } = await supabase
      .from('reports')
      .update({ status })
      .eq('report_id', req._targetReport.report_id)
      .select('report_id, status')
      .single();
    if (error) return fail(res, `Could not update report status: ${error.message}`, 500);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'report', entityId: req._targetReport.report_id });

    return ok(res, { reportId: data.report_id, status: data.status }, 'Report status updated');
  }
);

module.exports = router;
