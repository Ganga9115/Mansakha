const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool, withTransaction } = require('../../core/db/pgPool');
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
// Detailed PDF Reports - District tier only ever computes/renders its own
// case-wise snapshot, per compute function per tier (this IS shared code
// across the 3 admin route files, unlike the route files themselves - see
// reportSnapshot.js's own header comment for why).
const { resolveReportPeriod } = require('../../core/services/reportPeriods');
const {
  computeCaseWiseSnapshot,
  computeInvestigationProgress,
  computeThreatProtectionSummary,
  computeCompensationReliefSummary,
  computeAgencyReferralVolume,
} = require('../../core/services/reportSnapshot');
const { renderReportHtml, generatePdfBuffer } = require('../../core/services/reportPdf');

// How far back to look when predicting escalation risk across a whole
// jurisdiction subtree - predictEscalationRisk itself further caps each
// user's own history to their most recent 8 readings.
const PREDICTION_LOOKBACK_DAYS = 30;

const router = express.Router();

// This is District Admin's own dedicated copy of what used to be the single
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
  // Raw pg (see computeAverageScore's comment above for why) - this is
  // called on every dashboard load to resolve Ministry's "home" jurisdiction.
  const { rows: rootRows } = await pool.query(
    `select jurisdiction_id, name from jurisdictions where level = 'national' limit 1`
  );
  const data = rootRows[0];
  if (!data) return fail(res, 'No national jurisdiction configured', 404);
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
//
// Multi-Case-Per-Person Support: distress_scores rows only ever exist under
// a person's ANCHOR user_id (see counsellor.routes.js's resolveActivityUserId
// and auth.user.routes.js's login), so the lateral join resolves through
// coalesce(u.linked_to_user_id, u.user_id) - otherwise a dependent case
// would always look unscored even though its anchor has a real risk tier.
// This is a per-case tally (like Case Queue), not an average, so a person
// with 2 linked cases in this jurisdiction correctly contributes 2 - no
// dedup needed here, unlike the reports-analytics chart below.
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
       select risk_level_id from distress_scores where user_id = coalesce(u.linked_to_user_id, u.user_id) order by computed_at desc limit 1
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

// Same Multi-Case-Per-Person coalesce as countUsersByRiskGroupedByChild
// above - distress_scores only ever exist under the anchor's user_id.
async function countUsersByRisk(jurisdictionIds) {
  const { rows } = await pool.query(
    `select u.user_id, u.case_stage, ds.score_value, rl.name as risk_level_name
     from users u
     left join lateral (
       select score_value, risk_level_id
       from distress_scores
       where user_id = coalesce(u.linked_to_user_id, u.user_id)
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
  // Multi-Case-Per-Person Support: same coalesce as countUsersByRisk above -
  // ds.user_id here is always the anchor's id once joined this way, so a
  // linked person's single real trend is naturally deduped to one Map entry
  // by predictEscalationRiskBatch below, not counted once per linked case.
  const { rows } = await pool.query(
    `select ds.user_id, ds.score_value, ds.computed_at
     from distress_scores ds
     join users u on coalesce(u.linked_to_user_id, u.user_id) = ds.user_id
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

// Two cheap, current-state counts for the live dashboard - deliberately NOT
// the full periodic-report computation (reportSnapshot.js's own
// computeThreatProtectionSummary/computeCompensationReliefSummary are
// multi-second, whole-subtree aggregations, too heavy for a page load).
// Open Protection Referrals: cases a Protection Officer hasn't yet
// resolved. Compensation Pending: cases whose compensation has been
// verified but at least one payment stage still isn't Paid - a single
// jsonb_array_elements EXISTS check, still one query.
async function countNewRoleDashboardStats(jurisdictionIds) {
  const [{ rows: protectionRows }, { rows: compensationRows }] = await Promise.all([
    pool.query(
      `select count(*) as count
       from agency_referrals ar
       join users u on u.user_id = ar.user_id
       where ar.referred_to_role = 'Protection Officer' and ar.status = 'Open' and u.jurisdiction_id = any($1::uuid[])`,
      [jurisdictionIds]
    ),
    pool.query(
      `select count(*) as count
       from agency_referrals ar
       join users u on u.user_id = ar.user_id
       where ar.referred_to_role = 'District Welfare Officer'
         and ar.metadata->'compensation'->>'verifiedAt' is not null
         and exists (
           select 1 from jsonb_array_elements(ar.metadata->'compensation'->'stages') s
           where s->>'status' != 'Paid'
         )
         and u.jurisdiction_id = any($1::uuid[])`,
      [jurisdictionIds]
    ),
  ]);
  return {
    openProtectionReferrals: Number(protectionRows[0].count),
    compensationPendingCount: Number(compensationRows[0].count),
  };
}

// Reports page's 3 charts (trend line, severity-distribution stacked bars,
// intervention-phase donut) - previously all hardcoded/static markup in
// Reports.jsx regardless of tier, with a time-range filter that only
// changed which button looked selected. This is the real data those charts
// should read from, scoped to jurisdictionId's own subtree (a district's
// own cases; a state's or nation's descendant districts' cases) exactly
// like /dashboard/:jurisdictionId above.
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
      // DISTINCT, not a plain select - a person with 2 cases linked in this
      // subtree would otherwise join each of their real score rows twice
      // (once per case), inflating this chart's averages/bucket counts by
      // double-counting one real reading as two. Unlike the per-case risk
      // counts above (legitimately one entry per case), this is an aggregate
      // over historical readings, where duplication actually distorts the
      // numbers - same reasoning as avgDistressPointDrop in
      // /counsellors/performance below.
      pool.query(
        `select distinct ds.score_id, ds.computed_at, ds.score_value, rl.name as risk_level_name
         from distress_scores ds
         join users u on coalesce(u.linked_to_user_id, u.user_id) = ds.user_id
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

    // Coordination-role activity across the SAME jurisdiction subtree and
    // time window as the wellness charts above - a flat aggregate over
    // whatever this admin can see (not a per-child breakdown; that
    // comparison already exists on the Dashboard's own trends table). Reuses
    // reportSnapshot.js's own Report-building functions unmodified - see
    // their own header comments for the real-world grounding on each.
    const [investigationProgress, threatProtection, compensationRelief, agencyReferralVolume] = await Promise.all([
      computeInvestigationProgress(jurisdictionIds),
      computeThreatProtectionSummary(jurisdictionIds, since, until),
      computeCompensationReliefSummary(jurisdictionIds),
      computeAgencyReferralVolume(jurisdictionIds, since, until),
    ]);

    return ok(res, { trend, severityDistribution, interventionPhases, investigationProgress, threatProtection, compensationRelief, agencyReferralVolume });
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

    // Raw pg (see computeAverageScore's comment above for why) - this
    // single-row lookup fires on every dashboard page load.
    const { rows: jurisdictionRows } = await pool.query(
      'select level, name from jurisdictions where jurisdiction_id = $1',
      [jurisdictionId]
    );
    const jurisdiction = jurisdictionRows[0];
    if (!jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'admin_dashboard', entityId: jurisdictionId });

    try {
      if (jurisdiction.level === 'district') {
        // District's default view is case-level detail, not just aggregates -
        // Section 4.5. `counts` stay computed over the full district (not just
        // the current page) - only the case list itself is paginated, so a
        // district with thousands of cases doesn't load them all at once.
        const [{ counts, caseRows }, predictedEscalations, newRoleStats] = await Promise.all([
          countUsersByRisk([jurisdictionId]),
          countPredictedEscalations([jurisdictionId]),
          countNewRoleDashboardStats([jurisdictionId]),
        ]);
        const total = caseRows.length;
        const cases = caseRows.slice(offset, offset + pageSize);
        return ok(res, { tier: 'district', ...counts, predictedEscalations, ...newRoleStats, trends: null, cases, total });
      }

      // State/National: aggregate-with-drill-down is the default, not case-level -
      // Section 4.5. State also sees its child districts side by side; National sees
      // its child states side by side.
      const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
      const children = await getChildJurisdictions(jurisdictionId);
      // One rollup for the whole subtree, not broken down per child - shown as
      // a single headline stat ("N cases predicted to escalate soon") rather
      // than adding a column to every child's row.
      const predictedEscalations = await countPredictedEscalations(allDescendantIds);
      const newRoleStats = await countNewRoleDashboardStats(allDescendantIds);

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

      return ok(res, { tier: jurisdiction.level, ...counts, predictedEscalations, ...newRoleStats, trends: breakdown });
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

    // Raw pg, not Supabase REST - both branches below now use it (the
    // district branch used to make two sequential PostgREST calls, ~1-2s
    // each, for this jurisdiction-picker's live Alerts Feed; a single-row
    // lookup by primary key has no reason to cost that on its own).
    const { rows: jurisdictionRows } = await pool.query('select level from jurisdictions where jurisdiction_id = $1', [jurisdictionId]);
    const jurisdiction = jurisdictionRows[0];
    if (!jurisdiction) {
      return fail(res, 'Jurisdiction not found', 404);
    }

    let formattedAlerts = [];
    if (jurisdiction.level === 'district') {
      // Alerts Feed is for actionable items only (a Critical alert or an
      // SOS, each with a real open/acknowledged/resolved state) -
      // 'disengagement'/'weekly_review' are informational notices with no
      // alerts/sos_events row and stay bell-only. LEFT JOINing both alerts
      // and sos_events (rather than PostgREST's embed syntax) means every
      // row is guaranteed a real linked object regardless of which one its
      // source populated (schema.sql's exactly-one-subject constraint) - the
      // previous version only ever selected alerts() and read
      // `n.alerts.user_id` unconditionally, which threw (TypeError: Cannot
      // read properties of null) the moment this official had received even
      // one 'sos' (or disengagement/weekly_review) notification - confirmed
      // live as a real crash, not hypothetical, since SOS is explicitly
      // routed here.
      const { rows } = await pool.query(
        `select an.notified_at, an.source, an.priority,
                a.alert_id, a.user_id as alert_user_id, a.triggered_at as alert_triggered_at, ast.name as alert_status_name,
                se.sos_event_id, se.user_id as sos_user_id, se.triggered_at as sos_triggered_at, se.acknowledged_at, se.resolved_at
         from alert_notifications an
         left join alerts a on a.alert_id = an.alert_id
         left join alert_statuses ast on ast.alert_status_id = a.alert_status_id
         left join sos_events se on se.sos_event_id = an.sos_event_id
         where an.official_id = $1 and an.source in ('distress_score', 'sos')
         order by an.notified_at desc
         limit 50`,
        [req.auth.officialId]
      );

      formattedAlerts = rows.map((n) => {
        const isUrgentHelp = n.source === 'sos';
        return {
          alertId: isUrgentHelp ? n.sos_event_id : n.alert_id,
          userId: isUrgentHelp ? n.sos_user_id : n.alert_user_id,
          triggeredAt: isUrgentHelp ? n.sos_triggered_at : n.alert_triggered_at,
          status: isUrgentHelp
            ? (n.resolved_at ? 'Resolved' : n.acknowledged_at ? 'Acknowledged' : 'Open')
            : n.alert_status_name,
          // AdminAlerts.jsx keys its SOS badge/red-urgent-border off these two
          // fields - the crash-fix above stopped the TypeError but never
          // actually forwarded them, so every alert rendered identically
          // regardless of real severity. counsellor.routes.js's own /alerts
          // already does this; this was the one adaptation that dropped it.
          source: n.source,
          priority: n.priority,
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
        // source lets AdminAlerts.jsx tell these apart the same way the
        // district branch above does - this branch bypasses
        // alert_notifications entirely (see comment above), so there's no
        // `priority` column to forward here; the frontend's priority check is
        // just inert (undefined) for these rows, which is correct since no
        // real priority value exists for a direct alerts/sos_events read.
        ...alertRows.map((a) => ({
          alertId: a.alert_id,
          userId: a.user_id,
          triggeredAt: a.triggered_at,
          status: a.status_name,
          source: 'distress_score',
        })),
        ...sosRows.map((s) => ({
          alertId: s.sos_event_id,
          userId: s.user_id,
          triggeredAt: s.triggered_at,
          status: s.resolved_at ? 'Resolved' : s.acknowledged_at ? 'Acknowledged' : 'Open',
          source: 'sos',
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

    // Raw pg (see computeAverageScore's comment above for why).
    const { rows: jurisdictionRows } = await pool.query(
      'select level, name from jurisdictions where jurisdiction_id = $1',
      [jurisdictionId]
    );
    const jurisdiction = jurisdictionRows[0];
    if (!jurisdiction) return fail(res, 'Jurisdiction not found', 404);

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

// Feature Catalog Section 5.2 "Distress trend lines" - a longitudinal time
// series distinct from the current-snapshot stat tiles above. National/
// State tiers only makes sense here (District's own DistressHistoryScreen-
// style per-case detail already exists via Counsellor's case detail).
// Used to also overlay "policy launch" markers (Ministry Analytics &
// Workflow spec Task 2B) - that feature (and Task 2C Emergency Broadcast)
// was retired as not appropriate for this system's real scope, so this now
// returns just the score trend it always genuinely computed.
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

    // Raw pg with `= any($1::uuid[])`, not selectInChunks/Supabase REST -
    // avoids ID-chunked PostgREST's own per-call overhead on what can be a
    // large jurisdiction subtree.
    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    const { rows: scoreRows } = await pool.query(
      `select ds.score_value, ds.computed_at
       from distress_scores ds
       join users u on u.user_id = ds.user_id
       where u.jurisdiction_id = any($1::uuid[])`,
      [allDescendantIds]
    );

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

    return ok(res, { points });
  }
);

// Feature Catalog Section 3.5 "Edit user record" - search-by-docket-number
// for the Edit form to load a record into before PATCHing it. Jurisdiction-
// checked on the FOUND user's own jurisdiction (not derivable from the
// query string up front), same reasoning as PATCH /users/:userId below.
router.get('/users', verifyToken, requireRole(['Administration', 'Ministry']), generalApiLimiter, async (req, res) => {
  const { docketNumber } = req.query;
  if (!docketNumber) return fail(res, 'docketNumber is required', 400);

  // Raw pg (see computeAverageScore's comment above for why). ilike here is
  // a case-insensitive exact match, not a wildcard search - the escaping
  // below neutralizes any %, _ or \ the caller's docket number happens to
  // contain rather than adding wildcards of its own.
  const { rows: userRows } = await pool.query(
    `select user_id, docket_number, case_type_id, jurisdiction_id, case_stage, status, linked_to_user_id
     from users where docket_number ilike $1`,
    [String(docketNumber).trim().replace(/[%_\\]/g, '\\$&')]
  );
  const user = userRows[0];
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
      const { rows: nodeRows } = await pool.query('select parent_id from jurisdictions where jurisdiction_id = $1', [currentId]);
      const node = nodeRows[0];
      currentId = node ? node.parent_id : null;
    }
    if (!allowed) return fail(res, 'Outside your assigned jurisdiction', 403);
  }

  // A dependent case has no user_identity row of its own (it inherits the
  // anchor's - see createLinkedCase in userProvisioning.js), so this docket
  // search would otherwise show blank name/contact/address for one - even
  // though a District Admin searching by that exact docket clearly expects
  // to find the person, not an empty identity.
  const { rows: identityRows } = await pool.query(
    'select full_name, contact_number, address from user_identity where user_id = $1',
    [user.linked_to_user_id || user.user_id]
  );
  const identity = identityRows[0];

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
    // migration_034: caseStage not accepted - every case starts at
    // 'Investigation', only the (simulated) eCourt sync worker advances it.
    const { docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, address, caseBackground, password, aadhaarNumber } = req.body;
    try {
      const { userId, temporaryPassword } = await createUser({
        docketNumber, fullName, contactNumber, jurisdictionId, caseTypeId, address, caseBackground, password, aadhaarNumber,
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
    const { rows } = await pool.query('select jurisdiction_id from users where user_id = $1', [req.params.userId]);
    return rows[0] ? rows[0].jurisdiction_id : null;
  }),
  async (req, res) => {
    const { userId } = req.params;
    // migration_034: caseStage removed entirely - District Admin (like
    // every staff role) has no case-stage authority at all any more, not
    // even the previous restricted "open stages only" editing.
    const { address, contactNumber } = req.body;
    try {
      await updateUser(userId, { address, contactNumber });
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

    // Raw pg (see computeAverageScore's comment above for why).
    const { rows: jurisdictionRows } = await pool.query('select level, name from jurisdictions where jurisdiction_id = $1', [jurisdictionId]);
    const jurisdiction = jurisdictionRows[0];
    if (!jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    const end = periodEnd ? new Date(periodEnd) : new Date();
    const start = periodStart ? new Date(periodStart) : new Date(end.getTime() - TREND_PERIOD_DAYS * 86400000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const allDescendantIds = await getDescendantJurisdictionIds(jurisdictionId);
    let users;
    try {
      // Raw pg with = any($1::uuid[]) (see selectInChunks' own comment above
      // for why this has no URL-length limit to chunk around) - one round
      // trip instead of PostgREST's per-chunk overhead.
      const { rows } = await pool.query('select user_id from users where jurisdiction_id = any($1::uuid[])', [allDescendantIds]);
      users = rows;
    } catch (err) {
      return fail(res, `Could not load users: ${err.message}`, 500);
    }
    const userIds = users.map((u) => u.user_id);

    let chatMessages = [];
    let journalEntries = [];
    let caseNotes = [];
    if (userIds.length > 0) {
      // Raw pg (see computeAverageScore's comment above for why) - three
      // independent reads, still parallelized exactly as before.
      const [{ rows: chatRows }, { rows: journalRows }, { rows: noteRows }] = await Promise.all([
        // sender: 'user' only - the AI's own canned supportive replies
        // (sender: 'ai') aren't a distress signal worth feeding back into
        // another AI analysis.
        pool.query(
          `select body, sent_at from chat_messages
           where user_id = any($1::uuid[]) and sender = 'user' and sent_at >= $2 and sent_at <= $3
           order by sent_at desc limit $4`,
          [userIds, startIso, endIso, ANALYTICS_PER_SOURCE_CAP]
        ),
        pool.query(
          `select content, created_at from journal_entries
           where user_id = any($1::uuid[]) and created_at >= $2 and created_at <= $3
           order by created_at desc limit $4`,
          [userIds, startIso, endIso, ANALYTICS_PER_SOURCE_CAP]
        ),
        pool.query(
          `select note_text, created_at from case_notes
           where user_id = any($1::uuid[]) and created_at >= $2 and created_at <= $3
           order by created_at desc limit $4`,
          [userIds, startIso, endIso, ANALYTICS_PER_SOURCE_CAP]
        ),
      ]);
      chatMessages = chatRows;
      journalEntries = journalRows;
      caseNotes = noteRows;
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
      // Raw pg, real join instead of the embed-hint (see the comment above
      // for why an embed is ambiguous here anyway) - = any($1::uuid[]) drops
      // selectInChunks' chunking entirely (see its own comment above).
      const { rows } = await pool.query(
        `select oro.official_id, r.role_name
         from official_roles oro
         join roles r on r.role_id = oro.role_id
         where oro.jurisdiction_id = any($1::uuid[]) and oro.revoked_at is null`,
        [jurisdictionIds]
      );
      roleRows = rows;
    } catch (err) {
      return fail(res, `Could not load counsellors: ${err.message}`, 500);
    }

    const counsellorIds = roleRows.filter((r) => r.role_name === 'Counsellor').map((r) => r.official_id);
    if (counsellorIds.length === 0) return ok(res, { counsellors: [] });

    const { rows: officialRows } = await pool.query(
      'select official_id, full_name from officials where official_id = any($1::uuid[])',
      [counsellorIds]
    );
    const fullNameById = new Map(officialRows.map((o) => [o.official_id, o.full_name]));

    // One query for every counsellor's users, not one query PER counsellor -
    // the previous version awaited a separate supabase.from() inside this
    // loop (only ever silenced with an eslint-disable, never actually
    // fixed), which meant a jurisdiction with 20 counsellors made 20
    // sequential ~1-2s PostgREST round trips (20-40s) to load this one page.
    // A single .in() call plus grouping in JS is both correct (identical
    // per-counsellor results) and a single round trip regardless of how many
    // counsellors there are.
    // Raw pg, two plain queries instead of an embed (same "avoid embed
    // hints, do two queries and group in JS" convention as roleRows above) -
    // distress_scores is only fetched for non-linked (anchor) users since
    // the loop below skips every linked/dependent case anyway, same as the
    // original embed effectively did (a dependent's own user_id never has a
    // real distress_scores row - see the Multi-Case-Per-Person comments
    // elsewhere in this file).
    const { rows: userRows } = await pool.query(
      `select user_id, assigned_counsellor_id, status, linked_to_user_id
       from users where assigned_counsellor_id = any($1::uuid[])`,
      [counsellorIds]
    );
    const anchorUserIds = userRows.filter((u) => !u.linked_to_user_id).map((u) => u.user_id);
    const scoresByUserId = new Map();
    if (anchorUserIds.length > 0) {
      const { rows: scoreRows } = await pool.query(
        'select user_id, score_value, computed_at from distress_scores where user_id = any($1::uuid[])',
        [anchorUserIds]
      );
      for (const s of scoreRows) {
        const list = scoresByUserId.get(s.user_id) || [];
        // Number(): pg returns `numeric` columns as strings, unlike
        // PostgREST's JSON numbers - cast here so downstream arithmetic
        // (avgDistressPointDrop below) behaves identically either way.
        list.push({ score_value: Number(s.score_value), computed_at: s.computed_at });
        scoresByUserId.set(s.user_id, list);
      }
    }
    const allUsers = userRows.map((u) => ({ ...u, distress_scores: scoresByUserId.get(u.user_id) || [] }));

    const usersByCounsellor = new Map(counsellorIds.map((id) => [id, []]));
    for (const u of allUsers) {
      usersByCounsellor.get(u.assigned_counsellor_id)?.push(u);
    }

    const results = counsellorIds.map((officialId) => {
      const users = usersByCounsellor.get(officialId) || [];
      const activeCaseCount = users.filter((u) => u.status === 'active').length;

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
      for (const u of users) {
        // A dependent case's distress_scores embed shows the exact same
        // trend as its anchor (real scores only ever live under the
        // anchor - see countUsersByRisk above), so it's skipped here rather
        // than counting one person's real improvement a second time on top
        // of the anchor's own row.
        if (u.linked_to_user_id) continue;
        const scores = (u.distress_scores || []).slice().sort((a, b) => new Date(a.computed_at) - new Date(b.computed_at));
        if (scores.length < 2) continue;
        dropSum += scores[0].score_value - scores[scores.length - 1].score_value;
        consideredCount += 1;
      }

      return {
        officialId,
        fullName: fullNameById.get(officialId) || null,
        activeCaseCount,
        avgDistressPointDrop: consideredCount > 0 ? Math.round((dropSum / consideredCount) * 10) / 10 : null,
        usersConsideredForEfficacy: consideredCount,
      };
    });

    return ok(res, { counsellors: results });
  }
);

// ===== Section B: Coordination-Role Workforce Data =====
// Distinct from Section A (reportSnapshot.js's case/user data, already in
// the Report/Dashboard/Analysis) - this is about the ROSTER, not the cases:
// which officials hold which of the 5 jurisdiction/station-attributable
// coordination roles, and how their own queue (referrals to that role, in
// their own scope) is actually moving. Rehabilitation Officer is
// deliberately excluded here - it's scoped by rehabilitation_providers
// (nationwide provider, not a jurisdiction or a police station), so it has
// no honest place in a jurisdiction-scoped view; Ministry's own separate
// copy of this feature covers all 6 roles including RO, since Ministry
// already manages providers via Staff Management.
//
// Unlike Counsellor (a user is assigned to exactly one counsellor via
// users.assigned_counsellor_id), there is no per-official assignment column
// on agency_referrals - a referral targets a ROLE within a case's
// jurisdiction, not a specific person. Confirmed live: two officials never
// share a real (non-null) jurisdiction/station for the same role in this
// data today, so attributing a jurisdiction's own queue numbers to
// whichever official holds that scope is accurate - and correct even in
// the rare case they DO share a scope, since they genuinely share the same
// queue.
const COORDINATION_ROLES_JURISDICTION_SCOPED = ['Protection Officer', 'District Welfare Officer', 'DLSA Coordinator', 'District Collector'];

router.get(
  '/coordination-roles/performance/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;
    const jurisdictionIds = await getDescendantJurisdictionIds(jurisdictionId);

    // Investigating Officer is station-scoped (station_id, not
    // jurisdiction_id) - coalesce onto the station's own jurisdiction_id so
    // every role in this view resolves to one "effective jurisdiction" a
    // single queue-health query can group by.
    const { rows: officialRows } = await pool.query(
      `select o.official_id, o.full_name, r.role_name, orr.designation, orr.station_id, ps.name as station_name,
              coalesce(orr.jurisdiction_id, ps.jurisdiction_id) as effective_jurisdiction_id,
              j.name as jurisdiction_name
       from official_roles orr
       join officials o on o.official_id = orr.official_id
       join roles r on r.role_id = orr.role_id
       left join police_stations ps on ps.station_id = orr.station_id
       left join jurisdictions j on j.jurisdiction_id = coalesce(orr.jurisdiction_id, ps.jurisdiction_id)
       where orr.revoked_at is null
         and r.role_name in ('Protection Officer', 'District Welfare Officer', 'DLSA Coordinator', 'District Collector', 'Investigating Officer')
         and coalesce(orr.jurisdiction_id, ps.jurisdiction_id) = any($1::uuid[])`,
      [jurisdictionIds]
    );

    if (officialRows.length === 0) return ok(res, { officials: [] });

    // One grouped query for every role+jurisdiction's queue health, not one
    // query per official - same "single round trip regardless of roster
    // size" fix the counsellor-performance route above already applies.
    const { rows: queueRows } = await pool.query(
      `select ar.referred_to_role as role_name, u.jurisdiction_id,
              count(*) filter (where ar.status = 'Open') as open_count,
              count(*) filter (where ar.status = 'Resolved') as resolved_count,
              avg(extract(epoch from (ar.resolved_at - ar.created_at)) / 86400) filter (where ar.resolved_at is not null) as avg_resolve_days
       from agency_referrals ar
       join users u on u.user_id = ar.user_id
       where ar.referred_to_role in ('Protection Officer', 'District Welfare Officer', 'DLSA Coordinator', 'District Collector', 'Investigating Officer')
         and u.jurisdiction_id = any($1::uuid[])
       group by ar.referred_to_role, u.jurisdiction_id`,
      [jurisdictionIds]
    );
    const queueByKey = new Map(queueRows.map((r) => [`${r.role_name}::${r.jurisdiction_id}`, r]));

    const officials = officialRows.map((o) => {
      const q = queueByKey.get(`${o.role_name}::${o.effective_jurisdiction_id}`);
      return {
        officialId: o.official_id,
        fullName: o.full_name,
        roleName: o.role_name,
        designation: o.designation,
        jurisdictionId: o.effective_jurisdiction_id,
        jurisdictionName: o.jurisdiction_name,
        stationName: o.station_name,
        openReferralCount: q ? Number(q.open_count) : 0,
        resolvedReferralCount: q ? Number(q.resolved_count) : 0,
        avgResolveDays: q && q.avg_resolve_days !== null ? Math.round(Number(q.avg_resolve_days) * 10) / 10 : null,
      };
    });

    return ok(res, { officials });
  }
);

// A real, actionable coverage gap - which district-level jurisdictions in
// this admin's own subtree have NO official at all holding a given
// jurisdiction-scoped role, and which police stations have no
// Investigating Officer. Distinct from "officials" above (which only ever
// lists roles that ARE staffed) - this is the honest complement, the same
// "jurisdictionAssigned: false" gap already surfaced inline elsewhere
// (e.g. Protection Officer's own queue) but rolled up for oversight here.
router.get(
  '/coordination-roles/staffing-gaps/:jurisdictionId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.params.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId } = req.params;
    const jurisdictionIds = await getDescendantJurisdictionIds(jurisdictionId);

    const [roleGapResults, { rows: stationGaps }] = await Promise.all([
      Promise.all(
        COORDINATION_ROLES_JURISDICTION_SCOPED.map(async (roleName) => {
          const { rows } = await pool.query(
            `select j.jurisdiction_id, j.name
             from jurisdictions j
             where j.jurisdiction_id = any($1::uuid[]) and j.level = 'district'
               and not exists (
                 select 1 from official_roles orr
                 join roles r on r.role_id = orr.role_id
                 where r.role_name = $2 and orr.jurisdiction_id = j.jurisdiction_id and orr.revoked_at is null
               )
             order by j.name`,
            [jurisdictionIds, roleName]
          );
          return { roleName, unassignedJurisdictions: rows.map((r) => ({ jurisdictionId: r.jurisdiction_id, name: r.name })) };
        })
      ),
      pool.query(
        `select ps.station_id, ps.name, j.name as jurisdiction_name
         from police_stations ps
         join jurisdictions j on j.jurisdiction_id = ps.jurisdiction_id
         where ps.jurisdiction_id = any($1::uuid[]) and ps.deleted_at is null
           and not exists (
             select 1 from official_roles orr
             join roles r on r.role_id = orr.role_id
             where r.role_name = 'Investigating Officer' and orr.station_id = ps.station_id and orr.revoked_at is null
           )
         order by j.name, ps.name`,
        [jurisdictionIds]
      ),
    ]);

    return ok(res, {
      roleGaps: roleGapResults,
      stationGaps: stationGaps.map((s) => ({ stationId: s.station_id, name: s.name, jurisdictionName: s.jurisdiction_name })),
    });
  }
);

// ===== Detailed PDF Reports (District tier) =====
// Replaces the old single-snapshot/single-target design: a District's report
// carries a full case-wise snapshot (reportSnapshot.js's
// computeCaseWiseSnapshot) over a real calendar period (reportPeriods.js),
// rendered to a real PDF (reportPdf.js), and routed to one or more
// recipients (report_recipients) instead of a single target_jurisdiction_id.

const VALID_PERIOD_TYPES = ['weekly', 'monthly', 'quarterly', 'custom'];

// A District's report always goes up to its own State - this is NEVER
// trusted from the client (a District Admin editing the request body could
// otherwise claim any parent). Optional extras from the client are cc's
// ONLY, and only to the National root and/or Ministry - anything else
// (e.g. a random other district) is rejected.
async function resolveDistrictReportRecipients(jurisdiction, requestedRecipients) {
  if (!jurisdiction.parent_id) {
    throw Object.assign(new Error('This district has no parent jurisdiction configured'), { status: 500 });
  }
  const primary = { recipientType: 'jurisdiction', jurisdictionId: jurisdiction.parent_id, isPrimary: true };

  const extras = [];
  for (const r of requestedRecipients || []) {
    if (r && r.type === 'jurisdiction') {
      const { rows } = await pool.query('select level from jurisdictions where jurisdiction_id = $1', [r.jurisdictionId]);
      if (!rows[0] || rows[0].level !== 'national') {
        throw Object.assign(new Error('Invalid recipient: an extra jurisdiction cc must be the national jurisdiction'), { status: 400 });
      }
      extras.push({ recipientType: 'jurisdiction', jurisdictionId: r.jurisdictionId, isPrimary: false });
    } else if (r && r.type === 'ministry') {
      extras.push({ recipientType: 'ministry', jurisdictionId: null, isPrimary: false });
    } else {
      throw Object.assign(new Error(`Invalid recipient: ${JSON.stringify(r)}`), { status: 400 });
    }
  }
  return [primary, ...extras];
}

// Feature Catalog Section 3.6/4.4, rebuilt for Detailed PDF Reports - snapshots
// a real calendar period (not just "current state") into a durable `reports`
// row, with an explicit real-report-vs-Draft split (asDraft) and multi-
// recipient routing (report_recipients) replacing the old single
// target_jurisdiction_id column.
router.post(
  '/reports/generate',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.body.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId, commentary, insightId, asDraft } = req.body;
    if (!jurisdictionId) return fail(res, 'jurisdictionId is required', 400);

    // Raw pg (see computeAverageScore's comment above for why) - this is the
    // jurisdiction-existence check that fires on every report generation.
    const { rows: jurisdictionRows } = await pool.query(
      'select level, name, parent_id from jurisdictions where jurisdiction_id = $1',
      [jurisdictionId]
    );
    const jurisdiction = jurisdictionRows[0];
    if (!jurisdiction) return fail(res, 'Jurisdiction not found', 404);

    if (insightId) {
      const { rows: insightRows } = await pool.query(
        'select insight_id from jurisdiction_analytics_insights where insight_id = $1',
        [insightId]
      );
      if (!insightRows[0]) return fail(res, 'insightId not found', 404);
    }

    const periodType = VALID_PERIOD_TYPES.includes(req.body.periodType) ? req.body.periodType : 'custom';
    const { periodStart, periodEnd, label } = resolveReportPeriod({ ...req.body, periodType });

    // Recipients are only resolved/validated for a real (non-draft) submission -
    // a Draft's `recipients` body is simply ignored, per the spec, so no need
    // to fail a draft over an invalid cc that will never be written anyway.
    let recipientsToInsert = [];
    if (!asDraft) {
      try {
        recipientsToInsert = await resolveDistrictReportRecipients(jurisdiction, req.body.recipients);
      } catch (err) {
        return fail(res, err.message, err.status || 400);
      }
    }

    let computedSnapshot;
    try {
      computedSnapshot = await computeCaseWiseSnapshot(jurisdictionId, periodStart, periodEnd, periodType);
    } catch (err) {
      return fail(res, `Could not compute report snapshot: ${err.message}`, 500);
    }

    // periodLabel lives inside this jsonb (not a reports column) - same
    // "spread jurisdictionName/tier in at the route level" convention as
    // before this rebuild.
    const snapshot = { jurisdictionName: jurisdiction.name, tier: jurisdiction.level, periodLabel: label, ...computedSnapshot };

    let report;
    try {
      report = await withTransaction(async (client) => {
        const insertPayload = {
          jurisdiction_id: jurisdictionId,
          generated_by: req.auth.officialId,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          snapshot: JSON.stringify(snapshot),
          commentary: commentary || null,
          insight_id: insightId || null,
          period_type: periodType,
        };
        // asDraft omits `status` entirely (not a literal 'Draft') so the
        // column's own default applies - same convention as the old
        // no-targetJurisdictionId branch this replaces.
        if (!asDraft) insertPayload.status = 'Submitted';

        const columns = Object.keys(insertPayload);
        const values = Object.values(insertPayload);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await client.query(
          `insert into reports (${columns.join(', ')}) values (${placeholders}) returning report_id, generated_at, status`,
          values
        );
        const inserted = rows[0];

        // Zero report_recipients rows for a Draft - a Draft report hasn't
        // been sent anywhere yet, per report_recipients' own migration
        // comment.
        for (const r of recipientsToInsert) {
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            `insert into report_recipients (report_id, recipient_type, jurisdiction_id, is_primary) values ($1, $2, $3, $4)`,
            [inserted.report_id, r.recipientType, r.jurisdictionId, r.isPrimary]
          );
        }

        return inserted;
      });
    } catch (err) {
      return fail(res, `Could not generate report: ${err.message}`, 500);
    }

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'report', entityId: report.report_id });

    return ok(res, { reportId: report.report_id, generatedAt: report.generated_at, status: report.status }, 'Report generated', 201);
  }
);

const REPORT_RECIPIENT_STATUSES = ['Submitted', 'Reviewed'];

// Reworked for multi-recipient routing: no more target_jurisdiction_id gate -
// a report can now have several report_recipients rows (its own State,
// optionally National and/or Ministry), each reviewing independently. This
// updates ONLY the row belonging to the calling official's own jurisdiction
// (or the Ministry row, for a Ministry caller) - never any other recipient's
// row, and never the report's own sender.
router.patch(
  '/reports/:reportId/status',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res) => {
    const { reportId } = req.params;
    const { status } = req.body;
    if (!REPORT_RECIPIENT_STATUSES.includes(status)) return fail(res, `status must be one of: ${REPORT_RECIPIENT_STATUSES.join(', ')}`, 400);

    const { rows: reportRows } = await pool.query('select report_id from reports where report_id = $1', [reportId]);
    if (!reportRows[0]) return fail(res, 'Report not found', 404);

    const { rows: recipientRows } = await pool.query(
      'select recipient_id, recipient_type, jurisdiction_id from report_recipients where report_id = $1',
      [reportId]
    );

    const isMinistry = req.auth.roles.some((r) => r.roleName === 'Ministry');
    // Exact match only, not a parent-chain walk - a recipient row's
    // jurisdiction_id IS the exact jurisdiction the report was sent to, same
    // set requireJurisdiction() itself builds internally.
    const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));
    const myRow = isMinistry
      ? recipientRows.find((r) => r.recipient_type === 'ministry')
      : recipientRows.find((r) => r.recipient_type === 'jurisdiction' && assignedIds.has(r.jurisdiction_id));
    if (!myRow) return fail(res, 'You are not a recipient of this report', 404);

    const patch = { status };
    if (status === 'Reviewed') {
      patch.reviewed_by = req.auth.officialId;
      patch.reviewed_at = new Date().toISOString();
    }

    const { rows: updatedRows } = await pool.query(
      `update report_recipients set status = $1, reviewed_by = $2, reviewed_at = $3 where recipient_id = $4 returning recipient_id, status`,
      [patch.status, patch.reviewed_by || null, patch.reviewed_at || null, myRow.recipient_id]
    );

    await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'report', entityId: reportId });

    return ok(res, { reportId, recipientId: updatedRows[0].recipient_id, status: updatedRows[0].status }, 'Report status updated');
  }
);

// Lists reports this jurisdiction sent (outbox) or received (inbox) -
// Ministry Analytics & Workflow's "Inbox/Outbox split," rebuilt on
// report_recipients instead of the old single target_jurisdiction_id.
router.get(
  '/reports',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.query.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId, box } = req.query;
    if (!jurisdictionId) return fail(res, 'jurisdictionId is required', 400);
    if (box !== 'inbox' && box !== 'outbox') return fail(res, "box must be 'inbox' or 'outbox'", 400);

    let reportRows;
    let myRowByReportId = new Map();
    try {
      if (box === 'outbox') {
        ({ rows: reportRows } = await pool.query(
          `select r.report_id, r.jurisdiction_id, r.generated_by, r.generated_at, r.period_start, r.period_end, r.snapshot,
                  r.status, r.commentary, r.period_type,
                  j.name as jurisdiction_name, j.level as tier,
                  o.full_name as generated_by_name
           from reports r
           join jurisdictions j on j.jurisdiction_id = r.jurisdiction_id
           left join officials o on o.official_id = r.generated_by
           where r.jurisdiction_id = $1
           order by r.generated_at desc`,
          [jurisdictionId]
        ));
      } else {
        // fwd: joined so the CALLER's own recipient row can tell an
        // original recipient apart from a forwarded one (Detailed PDF
        // Reports - Forward After Review) without a second round trip.
        const { rows } = await pool.query(
          `select r.report_id, r.jurisdiction_id, r.generated_by, r.generated_at, r.period_start, r.period_end, r.snapshot,
                  r.status, r.commentary, r.period_type,
                  origin.name as jurisdiction_name, origin.level as tier,
                  o.full_name as generated_by_name,
                  rr.recipient_id as my_recipient_id, rr.status as my_status, rr.is_primary as my_is_primary,
                  rr.forwarded_at as my_forwarded_at, fwd.full_name as my_forwarded_by_name
           from report_recipients rr
           join reports r on r.report_id = rr.report_id
           join jurisdictions origin on origin.jurisdiction_id = r.jurisdiction_id
           left join officials o on o.official_id = r.generated_by
           left join officials fwd on fwd.official_id = rr.forwarded_by
           where rr.recipient_type = 'jurisdiction' and rr.jurisdiction_id = $1
           order by r.generated_at desc`,
          [jurisdictionId]
        );
        reportRows = rows;
        myRowByReportId = new Map(rows.map((r) => [r.report_id, {
          myRecipientId: r.my_recipient_id,
          myStatus: r.my_status,
          myIsPrimary: r.my_is_primary,
          isForwarded: !!r.my_forwarded_at,
          forwardedByName: r.my_forwarded_at ? r.my_forwarded_by_name || null : null,
          forwardedAt: r.my_forwarded_at,
        }]));
      }

      // Batched, not N+1 - one query for every report's recipients at once,
      // grouped in JS, same convention this file's own selectInChunks/
      // grouped-query helpers use elsewhere.
      const reportIds = reportRows.map((r) => r.report_id);
      let recipientsByReportId = new Map();
      if (reportIds.length > 0) {
        const { rows: recipientRows } = await pool.query(
          `select rr.report_id, rr.recipient_id, rr.recipient_type, rr.jurisdiction_id, rr.is_primary, rr.status, rr.reviewed_at,
                  rr.forwarded_at, fwd.full_name as forwarded_by_name,
                  j.name as jurisdiction_name
           from report_recipients rr
           left join jurisdictions j on j.jurisdiction_id = rr.jurisdiction_id
           left join officials fwd on fwd.official_id = rr.forwarded_by
           where rr.report_id = any($1::uuid[])`,
          [reportIds]
        );
        recipientsByReportId = new Map();
        for (const r of recipientRows) {
          const list = recipientsByReportId.get(r.report_id) || [];
          list.push({
            recipientId: r.recipient_id,
            recipientType: r.recipient_type,
            jurisdictionId: r.jurisdiction_id,
            jurisdictionName: r.jurisdiction_name,
            isPrimary: r.is_primary,
            status: r.status,
            reviewedAt: r.reviewed_at,
            isForwarded: !!r.forwarded_at,
            forwardedByName: r.forwarded_at ? r.forwarded_by_name || null : null,
            forwardedAt: r.forwarded_at,
          });
          recipientsByReportId.set(r.report_id, list);
        }
      }

      const reports = reportRows.map((r) => ({
        reportId: r.report_id,
        jurisdictionId: r.jurisdiction_id,
        jurisdictionName: r.jurisdiction_name,
        tier: r.tier,
        generatedByName: r.generated_by_name || null,
        generatedAt: r.generated_at,
        periodType: r.period_type,
        periodLabel: r.snapshot?.periodLabel || null,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        status: r.status,
        commentary: r.commentary,
        snapshot: r.snapshot,
        recipients: recipientsByReportId.get(r.report_id) || [],
        ...(box === 'inbox' ? myRowByReportId.get(r.report_id) : {}),
      }));

      return ok(res, { reports });
    } catch (err) {
      return fail(res, `Could not load reports: ${err.message}`, 500);
    }
  }
);

// Streams the rendered PDF for one report - access is either the report's
// own sender OR one of its recipients (an OR-across-two-sources check that
// doesn't fit requireJurisdiction's single-resolver shape, so it's a small
// custom inline check instead). Ministry bypasses entirely, matching every
// other route in this file.
router.get(
  '/reports/:reportId/pdf',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res) => {
    const { reportId } = req.params;

    const { rows: reportRows } = await pool.query(
      `select r.report_id, r.jurisdiction_id, r.generated_at, r.period_start, r.period_end, r.snapshot, r.status, r.commentary, r.period_type,
              origin.name as jurisdiction_name, origin.level as tier,
              o.full_name as generated_by_name
       from reports r
       join jurisdictions origin on origin.jurisdiction_id = r.jurisdiction_id
       left join officials o on o.official_id = r.generated_by
       where r.report_id = $1`,
      [reportId]
    );
    const report = reportRows[0];
    if (!report) return fail(res, 'Report not found', 404);

    const { rows: recipientRows } = await pool.query(
      `select rr.recipient_id, rr.recipient_type, rr.jurisdiction_id, rr.is_primary, rr.status, rr.reviewed_at,
              rr.forwarded_at, fwd.full_name as forwarded_by_name,
              j.name as jurisdiction_name
       from report_recipients rr
       left join jurisdictions j on j.jurisdiction_id = rr.jurisdiction_id
       left join officials fwd on fwd.official_id = rr.forwarded_by
       where rr.report_id = $1`,
      [reportId]
    );

    const isMinistry = req.auth.roles.some((r) => r.roleName === 'Ministry');
    if (!isMinistry) {
      const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));
      const isSender = assignedIds.has(report.jurisdiction_id);
      const isRecipient = recipientRows.some((r) => r.jurisdiction_id && assignedIds.has(r.jurisdiction_id));
      if (!isSender && !isRecipient) return fail(res, 'Outside your assigned jurisdiction', 403);
    }

    const reportForPdf = {
      jurisdictionName: report.jurisdiction_name,
      periodLabel: report.snapshot?.periodLabel || '',
      periodType: report.period_type,
      tier: report.tier,
      snapshot: report.snapshot,
      commentary: report.commentary,
      status: report.status,
      generatedByName: report.generated_by_name,
      generatedAt: report.generated_at,
      recipients: recipientRows.map((r) => ({
        recipientType: r.recipient_type,
        jurisdictionName: r.jurisdiction_name,
        isPrimary: r.is_primary,
        status: r.status,
        reviewedAt: r.reviewed_at,
        // Forward After Review - a forwarded recipient row shows distinctly
        // in the PDF trail ("Forwarded by X on Y") instead of the plain
        // Primary/Cc label.
        isForwarded: !!r.forwarded_at,
        forwardedByName: r.forwarded_at ? r.forwarded_by_name || null : null,
        forwardedAt: r.forwarded_at,
      })),
    };

    let buffer;
    try {
      const { html, title, periodLabel } = renderReportHtml(reportForPdf);
      buffer = await generatePdfBuffer(html, { periodLabel, title });
    } catch (err) {
      return fail(res, `Could not generate PDF: ${err.message}`, 500);
    }

    await writeAuditLog({ officialId: req.auth.officialId, action: 'export', entityType: 'report', entityId: reportId });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.jurisdiction_name}-report-${reportId}.pdf"`);
    return res.send(buffer);
  }
);

// ===== Detailed PDF Reports - Forward After Review =====
// An EXISTING recipient of an already-submitted report can forward it to
// someone else after reviewing it, without the original sender
// regenerating the report. Reuses the exact same "find my own recipient
// row" logic PATCH .../status already has - a caller who was never sent
// this report can't forward something they never received.
router.post(
  '/reports/:reportId/forward',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res) => {
    const { reportId } = req.params;
    const { type, jurisdictionId } = req.body;

    const { rows: reportRows } = await pool.query('select report_id from reports where report_id = $1', [reportId]);
    if (!reportRows[0]) return fail(res, 'Report not found', 404);

    const { rows: recipientRows } = await pool.query(
      'select recipient_id, recipient_type, jurisdiction_id from report_recipients where report_id = $1',
      [reportId]
    );

    const isMinistry = req.auth.roles.some((r) => r.roleName === 'Ministry');
    // Exact match only, same set requireJurisdiction() itself builds
    // internally - same "find my own recipient row" logic as PATCH .../status.
    const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));
    const myRow = isMinistry
      ? recipientRows.find((r) => r.recipient_type === 'ministry')
      : recipientRows.find((r) => r.recipient_type === 'jurisdiction' && assignedIds.has(r.jurisdiction_id));
    if (!myRow) return fail(res, 'You are not a recipient of this report', 404);

    // Ministry has nothing above it - nothing to forward to.
    if (myRow.recipient_type === 'ministry') {
      return fail(res, 'Ministry has no recipient above it to forward a report to', 400);
    }

    // Allowed forward targets depend on the CALLER's OWN tier (the level of
    // the jurisdiction their own matched recipient row belongs to), not the
    // report's own origin tier or which of the 3 admin route files happened
    // to receive this request - a State-tier official could in principle
    // call any of the 3 files, and the correct rule is always "what level is
    // THIS recipient row." Mirrors the same "compute allowed recipients"
    // judgment call POST /reports/generate already makes for the ORIGINAL
    // send, just re-applied at forward time for whoever currently holds this
    // report as a reviewed recipient: District/State-tier -> may forward to
    // the national jurisdiction and/or Ministry; National-tier -> Ministry only.
    const { rows: myJurisdictionRows } = await pool.query('select level from jurisdictions where jurisdiction_id = $1', [myRow.jurisdiction_id]);
    const myLevel = myJurisdictionRows[0]?.level;

    let target;
    if (type === 'ministry') {
      target = { recipientType: 'ministry', jurisdictionId: null };
    } else if (type === 'jurisdiction') {
      if (myLevel === 'national') {
        return fail(res, 'A national-tier recipient can only forward to Ministry', 400);
      }
      if (!jurisdictionId) return fail(res, 'jurisdictionId is required when type is "jurisdiction"', 400);
      const { rows: targetRows } = await pool.query('select level from jurisdictions where jurisdiction_id = $1', [jurisdictionId]);
      if (!targetRows[0] || targetRows[0].level !== 'national') {
        return fail(res, 'A jurisdiction forward target must be the national jurisdiction', 400);
      }
      target = { recipientType: 'jurisdiction', jurisdictionId };
    } else {
      return fail(res, "type must be 'jurisdiction' or 'ministry'", 400);
    }

    let inserted;
    try {
      const { rows } = await pool.query(
        `insert into report_recipients (report_id, recipient_type, jurisdiction_id, is_primary, status, forwarded_by, forwarded_at)
         values ($1, $2, $3, false, 'Submitted', $4, now())
         returning recipient_id, recipient_type, jurisdiction_id, status, forwarded_at`,
        [reportId, target.recipientType, target.jurisdictionId, req.auth.officialId]
      );
      inserted = rows[0];
    } catch (err) {
      // unique (report_id, recipient_type, jurisdiction_id), or the partial
      // unique index capping a report to one ministry recipient - either
      // way this means the target is already a recipient of this report.
      if (err.code === '23505') return fail(res, 'This report has already been sent to that recipient', 409);
      return fail(res, `Could not forward report: ${err.message}`, 500);
    }

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'report_recipient', entityId: inserted.recipient_id });

    return ok(
      res,
      { recipientId: inserted.recipient_id, recipientType: inserted.recipient_type, jurisdictionId: inserted.jurisdiction_id, status: inserted.status },
      'Report forwarded',
      201
    );
  }
);

// ===== Victim-Initiated Intervention Requests =====
// District Admin's own review side of the flow - see migration_027 and
// user.routes.js's request-submission routes for the full picture. Never
// exposes a victim's full_name/contact - docket-number identification only,
// same privacy boundary the Reports feature already established.
const INTERVENTION_REQUEST_STATUSES = ['Pending', 'Accepted', 'Rejected'];

router.get(
  '/intervention-requests',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  requireJurisdiction((req) => req.query.jurisdictionId),
  async (req, res) => {
    const { jurisdictionId, status } = req.query;
    if (!jurisdictionId) return fail(res, 'jurisdictionId is required', 400);
    if (status && !INTERVENTION_REQUEST_STATUSES.includes(status)) {
      return fail(res, `status must be one of: ${INTERVENTION_REQUEST_STATUSES.join(', ')}`, 400);
    }

    try {
      const { rows } = await pool.query(
        `select ir.request_id, ir.description, ir.status, ir.decision_reason, ir.requested_at, ir.reviewed_at,
                u.docket_number, u.case_stage, ct.name as case_type_name,
                it.name as intervention_type_name
         from intervention_requests ir
         join users u on u.user_id = ir.user_id
         join case_types ct on ct.case_type_id = u.case_type_id
         join intervention_types it on it.intervention_type_id = ir.intervention_type_id
         where u.jurisdiction_id = $1 ${status ? 'and ir.status = $2' : ''}
         order by ir.requested_at desc`,
        status ? [jurisdictionId, status] : [jurisdictionId]
      );

      return ok(res, {
        requests: rows.map((r) => ({
          requestId: r.request_id,
          docketNumber: r.docket_number,
          caseStage: r.case_stage,
          caseTypeName: r.case_type_name,
          interventionTypeName: r.intervention_type_name,
          description: r.description,
          status: r.status,
          decisionReason: r.decision_reason,
          requestedAt: r.requested_at,
          reviewedAt: r.reviewed_at,
        })),
      });
    } catch (err) {
      return fail(res, `Could not load intervention requests: ${err.message}`, 500);
    }
  }
);

router.get(
  '/intervention-requests/:requestId',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res) => {
    const { requestId } = req.params;
    try {
      const { rows } = await pool.query(
        `select ir.request_id, ir.description, ir.status, ir.decision_reason, ir.requested_at, ir.reviewed_at,
                u.jurisdiction_id, u.docket_number, u.case_stage, ct.name as case_type_name,
                it.name as intervention_type_name
         from intervention_requests ir
         join users u on u.user_id = ir.user_id
         join case_types ct on ct.case_type_id = u.case_type_id
         join intervention_types it on it.intervention_type_id = ir.intervention_type_id
         where ir.request_id = $1`,
        [requestId]
      );
      if (!rows[0]) return fail(res, 'Request not found', 404);

      // Same OR-not-quite-shape check every other jurisdiction-scoped GET
      // in this file uses - the case's own jurisdiction must be inside the
      // caller's assigned subtree. Ministry bypasses via requireJurisdiction's
      // own Ministry short-circuit, replicated inline here since this route
      // resolves the target AFTER the initial DB read (the request row
      // itself has to be fetched first to know which jurisdiction to check).
      if (!req.auth.roles.some((r) => r.roleName === 'Ministry')) {
        const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));
        let currentId = rows[0].jurisdiction_id;
        let inScope = false;
        while (currentId) {
          if (assignedIds.has(currentId)) { inScope = true; break; }
          const { rows: jRows } = await pool.query('select parent_id from jurisdictions where jurisdiction_id = $1', [currentId]);
          if (!jRows[0]) break;
          currentId = jRows[0].parent_id;
        }
        if (!inScope) return fail(res, 'Outside your assigned jurisdiction', 403);
      }

      const { rows: docRows } = await pool.query(
        'select document_id, document_label, storage_path from intervention_request_documents where request_id = $1',
        [requestId]
      );
      const documents = await Promise.all(docRows.map(async (d) => {
        const { data, error } = await supabase.storage.from('intervention-proofs').createSignedUrl(d.storage_path, 3600);
        return { documentLabel: d.document_label, signedUrl: error ? null : data.signedUrl };
      }));

      const r = rows[0];
      await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'intervention_request', entityId: requestId });

      return ok(res, {
        requestId: r.request_id,
        docketNumber: r.docket_number,
        caseStage: r.case_stage,
        caseTypeName: r.case_type_name,
        interventionTypeName: r.intervention_type_name,
        description: r.description,
        status: r.status,
        decisionReason: r.decision_reason,
        requestedAt: r.requested_at,
        reviewedAt: r.reviewed_at,
        documents,
      });
    } catch (err) {
      return fail(res, `Could not load request: ${err.message}`, 500);
    }
  }
);

// Financial Assistance, Medical, Legal Aid, Witness Protection and
// Relocation are now reviewed by the specialist role they actually concern
// (see interventionRequestReview.js, mounted on dwo/dlsa/protection_officer's
// own routers) - District Admin keeps full GET visibility above for
// oversight, but can no longer decide on these 5 types itself. Only
// Rehabilitation remains decided here (its dedicated post-case-closure
// Rehabilitation Officer flow is a separate, already-gated lifecycle that
// doesn't go through proof-verified Request Assistance at all today).
const DISTRICT_ADMIN_DECIDABLE_TYPES = ['Rehabilitation'];

router.patch(
  '/intervention-requests/:requestId/decision',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res, next) => {
    const { rows } = await pool.query(
      `select ir.request_id, ir.status, ir.user_id, ir.intervention_type_id, ir.description, u.jurisdiction_id,
              it.name as intervention_type_name
       from intervention_requests ir
       join users u on u.user_id = ir.user_id
       join intervention_types it on it.intervention_type_id = ir.intervention_type_id
       where ir.request_id = $1`,
      [req.params.requestId]
    );
    if (!rows[0]) return fail(res, 'Request not found', 404);
    req._targetRequest = rows[0];
    next();
  },
  requireJurisdiction((req) => req._targetRequest.jurisdiction_id),
  async (req, res) => {
    if (!DISTRICT_ADMIN_DECIDABLE_TYPES.includes(req._targetRequest.intervention_type_name)) {
      return fail(res, `${req._targetRequest.intervention_type_name} requests are reviewed by the assigned specialist role, not District Administration.`, 403);
    }

    const { decision, reason } = req.body;
    if (!['Accepted', 'Rejected'].includes(decision)) return fail(res, "decision must be 'Accepted' or 'Rejected'", 400);
    if (decision === 'Rejected' && !(reason && String(reason).trim())) return fail(res, 'A reason is required to reject a request', 400);
    if (req._targetRequest.status !== 'Pending') return fail(res, 'This request has already been decided', 400);

    const target = req._targetRequest;

    try {
      let updated;
      if (decision === 'Accepted') {
        // Insert the real interventions row AND flip the request's own
        // status together - either both happen or neither does, so the
        // Reports feature's Intervention Summary section (reportSnapshot.js)
        // never sees a request marked Accepted with no backing interventions
        // row, or vice versa.
        updated = await withTransaction(async (client) => {
          const { rows: ivRows } = await client.query(
            `insert into interventions (user_id, intervention_type_id, assigned_official_id, notes, recommended_at)
             values ($1, $2, $3, $4, now()) returning intervention_id`,
            [target.user_id, target.intervention_type_id, req.auth.officialId, target.description]
          );
          const { rows: reqRows } = await client.query(
            `update intervention_requests
             set status = 'Accepted', reviewed_by = $1, reviewed_at = now(), resulting_intervention_id = $2
             where request_id = $3
             returning request_id, status`,
            [req.auth.officialId, ivRows[0].intervention_id, target.request_id]
          );
          return reqRows[0];
        });
      } else {
        const { rows: reqRows } = await pool.query(
          `update intervention_requests
           set status = 'Rejected', reviewed_by = $1, reviewed_at = now(), decision_reason = $2
           where request_id = $3
           returning request_id, status`,
          [req.auth.officialId, String(reason).trim(), target.request_id]
        );
        updated = reqRows[0];
      }

      await writeAuditLog({ officialId: req.auth.officialId, action: 'update', entityType: 'intervention_request', entityId: target.request_id });

      return ok(res, { requestId: updated.request_id, status: updated.status }, `Request ${decision.toLowerCase()}`);
    } catch (err) {
      return fail(res, `Could not record decision: ${err.message}`, 500);
    }
  }
);

// ===== Agency Coordination (new coordination roles) =====
// District Admin optionally creates a referral into one of the 6 new
// coordination-role queues (migration_028_agency_referrals.sql) AFTER
// already deciding a case through the existing, unmodified Intervention
// Requests flow above - this never intercepts or reroutes that decision.
// Case lookup for the coordination page reuses the existing GET /users
// docket-search route above; no new lookup route needed.
// Investigating Officer and Special Public Prosecutor were retired as
// separate logins (their real functions absorbed into Protection Officer
// and DLSA Coordinator respectively) - trimmed here too, so this manual
// escalation picker can no longer target a queue nobody can see.
const AGENCY_REFERRAL_ROLES = [
  'District Welfare Officer',
  'Protection Officer',
  'DLSA Coordinator',
  'District Collector',
  'Rehabilitation Officer',
];

router.get(
  '/agency-referrals',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res) => {
    const { userId } = req.query;
    if (!userId) return fail(res, 'userId is required', 400);

    const { rows: userRows } = await pool.query('select jurisdiction_id from users where user_id = $1', [userId]);
    if (!userRows[0]) return fail(res, 'Case not found', 404);

    const jurisdictionCheck = await requireJurisdictionInline(req, userRows[0].jurisdiction_id);
    if (jurisdictionCheck) return fail(res, jurisdictionCheck, 403);

    // LEFT JOIN, not JOIN - a referral can now be victim-initiated (no
    // referred_by_official_id at all, see migration_029's rehabilitation
    // opt-in flow), which an inner join would silently drop from this list.
    const { rows } = await pool.query(
      `select ar.referral_id, ar.referred_to_role, ar.reason, ar.status, ar.created_at, ar.resolved_at,
              o.full_name as referred_by_name
       from agency_referrals ar
       left join officials o on o.official_id = ar.referred_by_official_id
       where ar.user_id = $1
       order by ar.created_at desc`,
      [userId]
    );

    return ok(res, {
      referrals: rows.map((r) => ({
        referralId: r.referral_id,
        referredToRole: r.referred_to_role,
        reason: r.reason,
        status: r.status,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        referredByName: r.referred_by_name || 'Victim (self opt-in)',
      })),
    });
  }
);

router.post(
  '/agency-referrals',
  verifyToken,
  requireRole(['Administration', 'Ministry']),
  generalApiLimiter,
  async (req, res) => {
    const { userId, referredToRole, reason } = req.body;
    if (!userId || !referredToRole) return fail(res, 'userId and referredToRole are required', 400);
    if (!AGENCY_REFERRAL_ROLES.includes(referredToRole)) {
      return fail(res, `referredToRole must be one of: ${AGENCY_REFERRAL_ROLES.join(', ')}`, 400);
    }

    const { rows: userRows } = await pool.query('select jurisdiction_id, case_stage, rehabilitation_opted_in_at from users where user_id = $1', [userId]);
    if (!userRows[0]) return fail(res, 'Case not found', 404);

    const jurisdictionCheck = await requireJurisdictionInline(req, userRows[0].jurisdiction_id);
    if (jurisdictionCheck) return fail(res, jurisdictionCheck, 403);

    // migration_034: Rehabilitation is now a genuine mid-case eCourt stage -
    // same gate as DWO's own hand-off route and the victim's opt-in route.
    if (referredToRole === 'Rehabilitation Officer' && userRows[0].case_stage !== 'Rehabilitation') {
      return fail(res, 'Rehabilitation referrals are only available once the case reaches the Rehabilitation stage.', 400);
    }

    const { data, error } = await supabase
      .from('agency_referrals')
      .insert({ user_id: userId, referred_to_role: referredToRole, referred_by_official_id: req.auth.officialId, reason: reason || null })
      .select('referral_id')
      .single();
    if (error) return fail(res, `Could not create referral: ${error.message}`, 500);

    // Same reasoning as DWO's hand-off-rehabilitation - a referral to
    // Rehabilitation Officer created through this general-purpose route
    // must also mark the case as opted in, or it would never actually get
    // isolated into its own Rehabilitation context. Only set once - never
    // overwrites an existing opt-in timestamp.
    if (referredToRole === 'Rehabilitation Officer' && !userRows[0].rehabilitation_opted_in_at) {
      const { error: optInError } = await supabase
        .from('users')
        .update({ rehabilitation_opted_in_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (optInError) console.error('agency-referrals: could not set rehabilitation_opted_in_at', optInError.message);
    }

    await writeAuditLog({ officialId: req.auth.officialId, action: 'create', entityType: 'agency_referral', entityId: data.referral_id });

    return ok(res, { referralId: data.referral_id }, 'Referral created', 201);
  }
);

// Inline jurisdiction-scope check, same reasoning as the intervention-request
// decision route above: the target case's jurisdiction is only known after
// an initial DB read, so the requireJurisdiction middleware (which resolves
// its target BEFORE the handler runs) doesn't fit directly here. Returns an
// error message string on failure, null on success - mirrors
// requireJurisdiction's own chain-walk logic exactly.
async function requireJurisdictionInline(req, targetJurisdictionId) {
  if (req.auth.roles.some((r) => r.roleName === 'Ministry')) return null;

  const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));
  let currentId = targetJurisdictionId;
  while (currentId) {
    if (assignedIds.has(currentId)) return null;
    const { data: node, error } = await supabase.from('jurisdictions').select('parent_id').eq('jurisdiction_id', currentId).single();
    if (error || !node) break;
    currentId = node.parent_id;
  }
  return 'Outside your assigned jurisdiction';
}

module.exports = router;
