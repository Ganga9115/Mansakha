const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { requireJurisdiction } = require('../../core/middleware/requireJurisdiction');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { isEscalatingTrend, predictEscalationRisk, predictEscalationRiskBatch } = require('../../ai/scoring');

// How far back to look when predicting escalation risk in bulk (Dashboard) -
// predictEscalationRisk itself further caps each user's history to their
// most recent 8 readings, this just bounds how much the SQL fetch pulls
// across a whole jurisdiction's users in one query.
const PREDICTION_LOOKBACK_DAYS = 30;
const { resolveDateWindow, bucketize } = require('../../core/services/reportBuckets');

const RISK_SORT_ORDER = { Critical: 4, High: 3, Moderate: 2, Low: 1 };

// A score's source channel, for the counsellor's benefit (per explicit
// request: "counsellor should know user got the score from check-in, chat,
// or IVRS call"). The 3 Ollama-based paths (weekly review, chat-milestone,
// IVRS webhook) already tag model_version distinctly, so those take
// priority over the generic channel name; every other score (the routine
// per-check-in/per-chat-turn Gemini scoring, which all share the same
// generic 'gemini-phase1-v1' model_version) falls back to channels.channel_name.
const MODEL_VERSION_LABELS = {
  'ollama-checkin-weekly-v1': 'Weekly Review',
  'ollama-chat-v1': 'AI Chat (5000-word review)',
  'ollama-ivrs-v1': 'IVRS Call',
};
const CHANNEL_LABELS = {
  'Mobile App': 'Check-in',
  Chatbot: 'AI Chat',
  IVRS: 'IVRS Call',
};

function describeScoreSource(modelVersion, channelName) {
  if (MODEL_VERSION_LABELS[modelVersion]) return MODEL_VERSION_LABELS[modelVersion];
  if (channelName) return CHANNEL_LABELS[channelName] || channelName;
  return 'Unknown';
}

const router = express.Router();

// No standing "assignment" table exists in the schema, so "cases this counsellor
// handles" is scoped by the same jurisdiction model Administration uses -
// EXCEPT when the caller is this user's own assigned_counsellor_id: the
// system-wide fallback in stressResponse.js's selectLeastLoadedCounsellor
// deliberately assigns a user to a counsellor outside their district when
// their own district has none, so requiring a jurisdiction match on top of
// that explicit assignment would 403 a counsellor out of their own patient's
// case (confirmed live - a Porbandar user assigned to a Central Delhi
// counsellor got "Outside your assigned jurisdiction" on every one of these
// routes). Substituting the caller's own jurisdiction as the "target" here
// makes requireJurisdiction's tree-walk trivially and correctly pass,
// without changing requireJurisdiction itself (still used as-is by
// Administration's read-only access to this same route, which SHOULD stay
// jurisdiction-gated).
async function resolveUserJurisdiction(req) {
  const { data } = await supabase.from('users').select('jurisdiction_id, assigned_counsellor_id').eq('user_id', req.params.userId).maybeSingle();
  if (!data) return null;
  if (req.auth.type === 'official' && data.assigned_counsellor_id === req.auth.officialId) {
    const ownJurisdictionId = req.auth.roles.find((r) => r.jurisdictionId)?.jurisdictionId;
    if (ownJurisdictionId) return ownJurisdictionId;
  }
  return data.jurisdiction_id;
}

// Multi-Case-Per-Person Support - a mobile session always reads/writes
// distress_scores/interactions/messages/typing_status under the ANCHOR's
// user_id (see auth.user.routes.js's login), but a counsellor/admin route
// takes a literal :userId straight from the URL (whichever specific case was
// clicked into). Without this, a dependent case's own user_id would never
// have accumulated any of its own rows in those four tables, so its Case
// Detail would 404 forever, its Messages would always be empty, and its
// dashboard/queue risk tiers would show as unscored - even though the person
// is actively being monitored under their other docket. Deliberately NOT
// applied to case_notes/interventions/counselling_sessions - those track
// THIS case's own legal-proceeding progress and correctly stay per-case.
async function resolveActivityUserId(userId) {
  const { data } = await supabase.from('users').select('linked_to_user_id').eq('user_id', userId).maybeSingle();
  return data?.linked_to_user_id || userId;
}

router.use(verifyToken);

// The Log Intervention screen needs real intervention_type_id values to submit a
// valid intervention (not just the fixed names) - this is that lookup.
router.get('/intervention-types', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { data, error } = await supabase.from('intervention_types').select('intervention_type_id, name').order('name');
  if (error) return fail(res, 'Could not load intervention types', 500);
  return ok(res, { interventionTypes: data || [] });
});

// Dashboard counts computed server-side (not tallied from one paginated /cases
// page client-side, which would be wrong once a jurisdiction has more cases than
// one page) - Screen Inventory's Counsellor Dashboard needs this.
router.get('/dashboard', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  // assigned_counsellor_id is the sole source of truth for "is this my
  // patient" - same fix/rationale as /my-users above: filtering by the
  // counsellor's own jurisdiction roles silently hid every user assigned via
  // selectLeastLoadedCounsellor's system-wide fallback (confirmed live - a
  // user outside a counsellor's own jurisdiction never showed up here,
  // Total Cases read 0 despite /my-users correctly showing that user).
  //
  // Raw pg (not Supabase REST) - this is the Counsellor's own landing screen,
  // so its latency is felt on every login/reload; a single PostgREST round
  // trip alone costs ~1-2s here regardless of how little data comes back
  // (confirmed live elsewhere this session), while a warmed pg connection
  // is a few hundred ms at most.
  const [{ rows }, { rows: recentScoreRows }] = await Promise.all([
    pool.query(
      // case_stage != 'Case Closed' - a closed case previously stayed in
      // this count forever (Dashboard's "Total Cases" only ever went up),
      // even though the counsellor-assignment algorithm (stressResponse.js)
      // already treats a closed case as zero active load. Same filter now
      // applied consistently here, in /my-users, and in /cases below.
      // status = 'active' - an inactive case contributes zero to
      // selectLeastLoadedCounsellor's own load count (stressResponse.js), but
      // this display query had no matching exclusion, so a deactivated case
      // stayed visible/actionable here forever while silently not counting
      // toward assignment load. Same filter now applied consistently here,
      // in /my-users, and in /cases below.
      `select u.user_id, rl.name as risk_level_name
       from users u
       left join lateral (
         select risk_level_id from distress_scores where user_id = coalesce(u.linked_to_user_id, u.user_id) order by computed_at desc limit 1
       ) ds on true
       left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       where u.assigned_counsellor_id = $1 and u.case_stage != 'Case Closed' and u.status = 'active'`,
      [req.auth.officialId]
    ),
    // Feeds predictEscalationRiskBatch below - the forward-looking sibling of
    // the reactive counts above (PS: "predict escalation... before a crisis
    // situation emerges", not just tally cases that are already Critical).
    // case_stage/status filters match the `rows` query above - without them,
    // a just-closed or deactivated case with a recent rising trend still
    // inflated predictedEscalations even though it's excluded from `total`
    // and every risk-tier bucket, making the two dashboard numbers disagree.
    pool.query(
      `select ds.user_id, ds.score_value, ds.computed_at
       from distress_scores ds
       join users u on coalesce(u.linked_to_user_id, u.user_id) = ds.user_id
       where u.assigned_counsellor_id = $1
         and u.case_stage != 'Case Closed' and u.status = 'active'
         and ds.computed_at > now() - ($2 || ' days')::interval`,
      [req.auth.officialId, PREDICTION_LOOKBACK_DAYS]
    ),
  ]);

  // By design, low+moderate+high+critical will not always sum to `total`:
  // `total` is every active, non-closed case assigned to this counsellor,
  // while each risk bucket only counts a case that already has a distress
  // score to derive a tier from. A newly assigned case with zero check-ins
  // yet is real and counted in `total`, just not yet in any risk bucket -
  // not a miscount, just an unscored case.
  const counts = { total: 0, low: 0, moderate: 0, high: 0, critical: 0, predictedEscalations: 0 };
  for (const u of rows) {
    counts.total += 1;
    const riskLevel = u.risk_level_name;
    if (riskLevel === 'Low') counts.low += 1;
    if (riskLevel === 'Moderate') counts.moderate += 1;
    if (riskLevel === 'High') counts.high += 1;
    if (riskLevel === 'Critical') counts.critical += 1;
  }

  // r.user_id here is distress_scores' own user_id, which - unlike u.user_id
  // in the loop above - is always the anchor's id (see coalesce() in the
  // recentScoreRows query above), so predictEscalationRiskBatch's Map
  // naturally dedupes a linked person's single real trend to one entry
  // instead of one per case, the same way avgDistressPointDrop in the admin
  // routes' /counsellors/performance avoids double-counting one improvement
  // as two - unlike total/low/moderate/high/critical above, a computed trend
  // shouldn't be counted twice just because the person has two linked cases.
  const predictions = predictEscalationRiskBatch(
    recentScoreRows.map((r) => ({ userId: r.user_id, score: Number(r.score_value), computedAt: r.computed_at }))
  );
  for (const prediction of predictions.values()) {
    if (prediction.daysToNextTier != null) counts.predictedEscalations += 1;
  }
  return ok(res, counts);
});

// Reports page's 3 charts (trend line, severity-distribution stacked bars,
// intervention-phase donut) - previously all hardcoded/static markup in
// Reports.jsx (a flat line, 0%-height bars, a 0% donut) with a time-range
// filter that changed which button was highlighted but fetched nothing.
// This is the real data those charts should have been reading from.
router.get('/reports-analytics', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { since, until, buckets } = resolveDateWindow(req.query);

  const [{ rows: scoreRows }, { rows: interventionRows }] = await Promise.all([
    // DISTINCT, not a plain select - a person with 2 cases linked to this
    // same counsellor would otherwise join each of their real score rows
    // twice (once per case), inflating this chart's averages/bucket counts
    // by double-counting one real reading as two. Unlike the per-case risk
    // buckets on /dashboard (legitimately one entry per case, matching
    // "total cases"), this is an aggregate over historical readings, where
    // duplication actually distorts the numbers - same reasoning as
    // avgDistressPointDrop in the admin routes' /counsellors/performance.
    pool.query(
      `select distinct ds.score_id, ds.computed_at, ds.score_value, rl.name as risk_level_name
       from distress_scores ds
       join users u on coalesce(u.linked_to_user_id, u.user_id) = ds.user_id
       join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       where u.assigned_counsellor_id = $1 and ds.computed_at >= $2 and ds.computed_at <= $3`,
      [req.auth.officialId, since.toISOString(), until.toISOString()]
    ),
    // "In Progress" vs "Planned/Referred" isn't a stored status - the schema
    // only has recommended_at/completed_at - so an intervention counts as
    // in-progress once the assigned official has actually logged a case
    // note on it, and planned/referred until then. Completed always wins.
    pool.query(
      `select i.completed_at,
              exists(
                select 1 from case_notes cn
                where cn.user_id = i.user_id and cn.official_id = i.assigned_official_id
                  and cn.created_at > i.recommended_at
              ) as has_notes
       from interventions i
       where i.assigned_official_id = $1 and i.recommended_at >= $2 and i.recommended_at <= $3`,
      [req.auth.officialId, since.toISOString(), until.toISOString()]
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
});

router.get('/my-users', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { riskLevel, q, page = 1 } = req.query;
  const pageSize = 20;
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * pageSize;

  // assigned_counsellor_id is the sole source of truth for "is this my
  // patient" - it's already set explicitly, whether by the normal
  // same-jurisdiction match or by selectLeastLoadedCounsellor's system-wide
  // fallback when a user's own district has no counsellor at all
  // (stressResponse.js). Requiring the user's CURRENT jurisdiction to also
  // match one of the counsellor's own jurisdiction roles silently hid every
  // user assigned via that fallback path - confirmed live (a user in
  // Porbandar assigned to a Central Delhi counsellor never showed up here).
  const [{ rows }, { rows: unreadRows }] = await Promise.all([
    pool.query(
      // case_stage != 'Case Closed' and status = 'active' - see /dashboard above for why.
      // linked_to_user_id selected so hasUnreadMessage below can check the
      // shared messages thread via this case's anchor - messages are only
      // ever written under the anchor's user_id (see auth.user.routes.js's
      // login), so a dependent case's own literal user_id would never appear
      // in `messages` even when the person has real unread messages.
      // full_name joined via coalesce(linked_to_user_id, user_id) - a
      // dependent case has no user_identity row of its own (see
      // createLinkedCase in userProvisioning.js), so this feeds the search
      // box below with the real person's name regardless of which of their
      // cases this row is.
      `select u.user_id, u.linked_to_user_id, u.docket_number, u.case_stage, u.case_background, ds.score_value, rl.name as risk_level_name, ui.full_name
       from users u
       left join lateral (
         select score_value, risk_level_id from distress_scores where user_id = coalesce(u.linked_to_user_id, u.user_id) order by computed_at desc limit 1
       ) ds on true
       left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       left join user_identity ui on ui.user_id = coalesce(u.linked_to_user_id, u.user_id)
       where u.assigned_counsellor_id = $1 and u.case_stage != 'Case Closed' and u.status = 'active'`,
      [req.auth.officialId]
    ),
    pool.query(
      `select distinct user_id from messages where official_id = $1 and sender_type = 'user' and read_at is null`,
      [req.auth.officialId]
    ),
  ]);

  const unreadUserIds = new Set(unreadRows.map((r) => r.user_id));

  const BACKSTORY_EXCERPT_LENGTH = 140;

  let cases = rows.map((u) => ({
    userId: u.user_id,
    docketNumber: u.docket_number,
    fullName: u.full_name || null,
    caseStage: u.case_stage,
    score: u.score_value !== null ? Number(u.score_value) : null,
    riskLevel: u.risk_level_name,
    caseBackground: u.case_background
      ? (u.case_background.length > BACKSTORY_EXCERPT_LENGTH ? `${u.case_background.slice(0, BACKSTORY_EXCERPT_LENGTH)}…` : u.case_background)
      : null,
    hasUnreadMessage: unreadUserIds.has(u.linked_to_user_id || u.user_id),
  }));

  if (riskLevel) cases = cases.filter((c) => c.riskLevel === riskLevel);
  // Search by case id, docket number, or name - matched against the same
  // full caseload this counsellor's queue already loads (pagination below
  // slices AFTER this, same as the riskLevel filter above), so this searches
  // every case they hold, not just the current page.
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    cases = cases.filter((c) =>
      c.userId.toLowerCase().includes(needle) ||
      (c.docketNumber || '').toLowerCase().includes(needle) ||
      (c.fullName || '').toLowerCase().includes(needle)
    );
  }
  cases.sort((a, b) => (RISK_SORT_ORDER[b.riskLevel] || 0) - (RISK_SORT_ORDER[a.riskLevel] || 0));

  const total = cases.length;
  cases = cases.slice(offset, offset + pageSize);
  return ok(res, { cases, total });
});

// Administration gets this GET too (Section 8: District Administration has a
// read-only Case Detail screen) - but NOT the POST intervention route below,
// per Section 4.4's explicit "no intervention action for Administration."
router.get('/cases/:userId', requireRole(['Counsellor', 'Administration']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId } = req.params;

  // Raw pg (not Supabase REST), same fix as elsewhere this session.
  // users.phone doesn't exist - the previous query silently failed on that
  // bad column reference (error was never checked), which is why Case
  // Detail's Call/WhatsApp buttons never showed: userRow always came back
  // undefined. linked_to_user_id is fetched first (not run concurrently with
  // the three queries below) because those need its resolved value: a
  // dependent case's own literal user_id never has its own distress_scores,
  // messages, or user_identity row at all (all three only ever exist under
  // the anchor - see auth.user.routes.js's login and createLinkedCase in
  // userProvisioning.js), so querying any of them by the literal :userId
  // would come back empty/404 for a dependent case, even one being actively
  // monitored under its other docket. Phone is fetched via activityUserId
  // below (NOT joined here on the literal :userId) for the same reason - a
  // left join against user_identity here would always come back null phone
  // for a dependent case despite the anchor having a real one on file.
  const { rows: userRows } = await pool.query(
    `select case_stage, case_background, opted_for_manual_counsellor, linked_to_user_id from users where user_id = $1`,
    [userId]
  );
  const userRow = userRows[0];
  if (!userRow) return fail(res, 'Case not found', 404);
  const activityUserId = userRow.linked_to_user_id || userId;

  const [{ rows: scoreRows }, { rows: unreadRows }, { data: identity }] = await Promise.all([
    // 12, not 3 - the extra rows feed the per-case longitudinal trend chart
    // below (Section 2.2/FR-3.3's "weekly distress score to help counsellors
    // analyse trends": the computation already existed via the weekly
    // check-in threshold, but nothing surfaced the history to a counsellor -
    // Reports only ever charted jurisdiction-wide averages, never one case's
    // own readings over time). `latest`/`previous` and the 3-point escalation
    // check below still only look at the newest 3, unaffected by the wider fetch.
    // channel_name (via interactions) + model_version together tell a
    // counsellor WHICH of check-in/chat/IVRS actually produced this score -
    // previously invisible here entirely, per explicit request.
    pool.query(
      `select ds.score_id, ds.score_value, ds.computed_at, ds.interaction_id, ds.explanation, ds.suggested_intervention_type_id,
              ds.model_version, it.name as intervention_type_name, rl.name as risk_level_name, c.channel_name
       from distress_scores ds
       left join intervention_types it on it.intervention_type_id = ds.suggested_intervention_type_id
       left join interactions i on i.interaction_id = ds.interaction_id
       left join channels c on c.channel_id = i.channel_id
       join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       where ds.user_id = $1
       order by ds.computed_at desc
       limit 12`,
      [activityUserId]
    ),
    // Red-dot indicator for the "Chat with User" button - unread from the
    // user's side, scoped to this counsellor specifically.
    pool.query(
      `select 1 from messages where user_id = $1 and official_id = $2 and sender_type = 'user' and read_at is null limit 1`,
      [activityUserId, req.auth.officialId]
    ),
    supabase.from('user_identity').select('contact_number').eq('user_id', activityUserId).maybeSingle(),
  ]);
  const hasUnreadMessage = unreadRows.length > 0;

  if (scoreRows.length === 0) return fail(res, 'No check-ins recorded for this case yet', 404);

  const [latest, previous] = scoreRows;
  // isEscalatingTrend wants oldest-first and only ever looks at its first 3
  // entries - explicitly take the newest 3 (not the wider scoreRows fetch
  // above) before reversing, so a case with a long history still gets
  // evaluated on its most recent readings, not its oldest ones.
  const escalating = scoreRows.length >= 3 && isEscalatingTrend([...scoreRows.slice(0, 3)].reverse().map((s) => Number(s.score_value)));

  // Explainability + intervention status are independent of each other, so
  // they run concurrently too - both only need ids already known above.
  const [{ rows: signals }, { rows: interventionRows }] = await Promise.all([
    pool.query(
      `select isg.value, st.name as signal_type_name
       from interaction_signals isg
       join signal_types st on st.signal_type_id = isg.signal_type_id
       where isg.interaction_id = $1`,
      [latest.interaction_id]
    ),
    pool.query(
      `select intervention_id, completed_at from interventions where user_id = $1 order by recommended_at desc limit 1`,
      [userId]
    ),
  ]);
  const openIntervention = interventionRows[0];

  await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'read', entityType: 'case_detail', entityId: userId });

  // The real 3-point monotonic-rise detector (ai/scoring.js,
  // unit-tested) takes priority when there's enough history; the cruder
  // 2-point comparison is only a fallback for a case with just 2 check-ins.
  const trend = previous
    ? (escalating || Number(latest.score_value) > Number(previous.score_value) ? 'escalating' : 'stable_or_improving')
    : 'insufficient_data';

  return ok(res, {
    caseStage: userRow?.case_stage || null,
    caseBackground: userRow?.case_background || null,
    phone: identity?.contact_number || null,
    optedForManualCounsellor: userRow?.opted_for_manual_counsellor || false,
    hasUnreadMessage,
    score: Number(latest.score_value),
    previousScore: previous ? Number(previous.score_value) : null,
    trend,
    riskLevel: latest.risk_level_name,
    scoreSource: describeScoreSource(latest.model_version, latest.channel_name),
    riskFactors: signals.map((s) => ({ signal: s.signal_type_name, value: Number(s.value) })),
    explanation: latest.explanation || null,
    suggestedInterventionType: latest.suggested_intervention_type_id
      ? { id: latest.suggested_intervention_type_id, name: latest.intervention_type_name }
      : null,
    interventionStatus: openIntervention ? (openIntervention.completed_at ? 'completed' : 'pending') : 'none',
    interventionId: openIntervention ? openIntervention.intervention_id : null,
    // Chronological (oldest first), for the per-case trend chart - separate
    // from `score`/`previousScore`/`trend` above, which describe only the
    // single most-recent reading.
    scoreHistory: [...scoreRows].reverse().map((s) => ({
      scoreId: s.score_id,
      score: Number(s.score_value),
      riskLevel: s.risk_level_name,
      computedAt: s.computed_at,
      source: describeScoreSource(s.model_version, s.channel_name),
    })),
    // `trend` above is retrospective ("has this case already been rising?");
    // `predictedRisk` is forward-looking (PS: "predict escalation... before a
    // crisis situation emerges") - a linear projection of this same score
    // history that flags whether the case is on track to cross into a higher
    // risk tier soon, not just whether it already has.
    // Bounded to the same PREDICTION_LOOKBACK_DAYS window /dashboard already
    // applies before calling predictEscalationRiskBatch - without this, a
    // case whose last activity was months ago could still
    // regress over up to 12 stale historical points and report "N days to
    // next tier" from a trend that stopped being current long ago.
    // scoreHistory above intentionally stays unbounded (it's the full chart).
    predictedRisk: predictEscalationRisk(
      [...scoreRows]
        .reverse()
        .filter((s) => Date.now() - new Date(s.computed_at).getTime() <= PREDICTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
        .map((s) => ({ score: Number(s.score_value), computedAt: s.computed_at }))
    ),
  });
});

// Multi-Case-Per-Person Support - lets a counsellor navigate from one of a
// person's cases to another. Resolves the anchor first so this works
// identically whether the case just opened is itself the anchor or a
// dependent - the underlying data-correctness fix (this page actually
// showing real activity for a dependent case) is already in place above;
// this route is purely additive navigation.
router.get('/cases/:userId/linked-cases', requireRole(['Counsellor', 'Administration']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId } = req.params;
  const anchorUserId = await resolveActivityUserId(userId);

  const { data, error } = await supabase
    .from('users')
    .select('user_id, docket_number, case_stage, case_types(name), jurisdictions(name)')
    .or(`user_id.eq.${anchorUserId},linked_to_user_id.eq.${anchorUserId}`);
  if (error) return fail(res, 'Could not load linked cases', 500);

  return ok(res, {
    cases: (data || []).map((c) => ({
      userId: c.user_id,
      docketNumber: c.docket_number,
      caseStage: c.case_stage,
      caseType: c.case_types?.name || null,
      jurisdictionName: c.jurisdictions?.name || null,
      isCurrent: c.user_id === userId,
    })),
  });
});

router.post('/cases/:userId/intervention', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId } = req.params;
  const { interventionTypeId, notes } = req.body;
  if (!interventionTypeId) return fail(res, 'interventionTypeId is required', 400);

  // An alert's user_id is always the anchor's (alerts are generated from
  // distress_scores under applyStressResponse, which always runs against the
  // anchor) - looking this up by the literal :userId would never find a
  // dependent case's real open alert, silently failing to link/acknowledge it.
  const activityUserId = await resolveActivityUserId(userId);
  const { data: openAlert } = await supabase
    .from('alerts')
    .select('alert_id, alert_status_id, alert_statuses(name)')
    .eq('user_id', activityUserId)
    .order('triggered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: intervention, error } = await supabase
    .from('interventions')
    .insert({
      user_id: userId,
      alert_id: openAlert ? openAlert.alert_id : null,
      intervention_type_id: interventionTypeId,
      assigned_official_id: req.auth.officialId,
      notes: notes || null,
    })
    .select('intervention_id')
    .single();
  if (error) return fail(res, 'Could not log intervention', 500);

  if (openAlert && openAlert.alert_statuses.name === 'Open') {
    const { data: acknowledgedStatus } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Acknowledged').single();
    await supabase.from('alerts').update({ alert_status_id: acknowledgedStatus.alert_status_id }).eq('alert_id', openAlert.alert_id);
  }

  await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'create', entityType: 'intervention', entityId: intervention.intervention_id });

  return ok(res, { interventionId: intervention.intervention_id }, null, 201);
});

// interventions.completed_at existed in the schema with no code path that
// ever set it - "AI follow-up tracking" (Section 4.4) had no real mechanism
// behind it until this.
router.patch('/cases/:userId/intervention/:interventionId/complete', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId, interventionId } = req.params;

  const { data, error } = await supabase
    .from('interventions')
    .update({ completed_at: new Date().toISOString() })
    .eq('intervention_id', interventionId)
    .eq('user_id', userId)
    .select('intervention_id')
    .maybeSingle();
  if (error) return fail(res, 'Could not mark intervention complete', 500);
  if (!data) return fail(res, 'Intervention not found for this case', 404);

  await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'update', entityType: 'intervention', entityId: interventionId });

  return ok(res, null, 'Intervention marked complete');
});

// Case notes - free-text commentary, separate from the structured
// interventions above and from audit_log's read/write record.
router.get('/cases/:userId/notes', requireRole(['Counsellor', 'Administration']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `select cn.note_id, cn.note_text, cn.authored_by, cn.created_at, o.full_name
     from case_notes cn
     left join officials o on o.official_id = cn.official_id
     where cn.user_id = $1
     order by cn.created_at desc`,
    [userId]
  );

  return ok(res, {
    notes: rows.map((n) => ({
      noteId: n.note_id,
      noteText: n.note_text,
      // Section 2.3: AI-drafted notes (authored_by: 'ai') have no official_id
      // yet - officials is null for those (nullable FK), so authorName falls
      // back to a fixed label instead of crashing on a null embed.
      authoredBy: n.authored_by,
      authorName: n.full_name || 'Mansakha AI (drafted)',
      createdAt: n.created_at,
    })),
  });
});

router.post('/cases/:userId/notes', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId } = req.params;
  const { noteText } = req.body;
  if (!noteText || !noteText.trim()) return fail(res, 'noteText is required', 400);

  const { data, error } = await supabase
    .from('case_notes')
    .insert({ user_id: userId, official_id: req.auth.officialId, note_text: noteText.trim() })
    .select('note_id')
    .single();
  if (error) return fail(res, 'Could not save note', 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'create', entityType: 'case_note', entityId: data.note_id });

  return ok(res, { noteId: data.note_id }, 'Note added', 201);
});

// Capped, not full-page-UI paginated - this feed is polled every 15s
// (web-frontend/src/services/hooks.js) and rendered as a live list, not paged
// through by the user, so a fixed recent-N cap is what Section 9's "don't
// load thousands of rows at once" actually calls for here.
//
// A row here backs EITHER a distress-score alert OR an urgent-help request
// (alert_notifications.source = 'sos' in the DB, predating the "Get Help
// Now" rename - not worth a migration for a label), never both (schema.sql's
// XOR check constraint). Urgent-help rows skip the jurisdiction re-check
// below: that counsellor can be assigned nationwide (selectLeastLoadedCounsellor
// no longer scopes by district), so `official_id = me` alone is already
// sufficient proof this is legitimately mine - re-requiring a jurisdiction
// match would incorrectly hide exactly the cross-jurisdiction assignments
// this feature exists to allow (same bug class fixed earlier for
// /my-users and case-detail's requireJurisdiction).
router.get('/alerts', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { alerts: [] });

  // Alerts Feed is for actionable items only (an open Critical alert or an
  // SOS, each with a real open/acknowledged/resolved state) - 'disengagement'
  // and 'weekly_review' are informational notices with no alerts/sos_events
  // row and no such state at all (they stay bell-only, via /api/me/notifications).
  // Filtering at the query level (not after fetching) means every row that
  // comes back is guaranteed to have a real `alerts` or `sos_events` object -
  // this used to filter disengagement/weekly_review out only as a side
  // effect of the jurisdiction lookup below silently no-op'ing on a null
  // `n.alerts`, which was fragile (and outright crashed the equivalent
  // Admin-tier query - see districtAdmin.routes.js).
  const { data, error } = await supabase
    .from('alert_notifications')
    .select('notified_at, source, priority, auto_assigned, alerts(alert_id, user_id, triggered_at, alert_statuses(name), users(jurisdiction_id)), sos_events(sos_event_id, user_id, triggered_at, acknowledged_at, resolved_at)')
    .eq('official_id', req.auth.officialId)
    .in('source', ['distress_score', 'sos'])
    .order('notified_at', { ascending: false })
    .limit(100); // Increased limit slightly to account for filtered items
  if (error) return fail(res, 'Could not load alerts', 500);

  const alerts = [];
  for (const n of data || []) {
    const isUrgentHelp = n.source === 'sos';
    if (!isUrgentHelp) {
      const jId = n.alerts?.users?.jurisdiction_id;
      if (!jurisdictionIds.includes(jId)) continue;
    }

    alerts.push({
      alertId: isUrgentHelp ? n.sos_events.sos_event_id : n.alerts.alert_id,
      source: n.source,
      priority: n.priority,
      autoAssigned: n.auto_assigned,
      userId: isUrgentHelp ? n.sos_events.user_id : n.alerts.user_id,
      triggeredAt: isUrgentHelp ? n.sos_events.triggered_at : n.alerts.triggered_at,
      status: isUrgentHelp
        ? (n.sos_events.resolved_at ? 'Resolved' : n.sos_events.acknowledged_at ? 'Acknowledged' : 'Open')
        : n.alerts.alert_statuses.name,
      notifiedAt: n.notified_at,
    });
  }

  // The Alerts Feed list is deliberately capped to the 50 most recent
  // notifications (below) - fine for a scrollable feed, but the Dashboard's
  // "OPEN ALERTS" tile used to derive its count by filtering that same
  // capped array, so a counsellor with more than 50 accumulated
  // notifications could have a genuinely-open older alert fall outside the
  // window and silently not be counted. This is a real, separate COUNT
  // query (not limited to 100/50) so the tile reflects the true total
  // without fetching every notification's full row just to count them.
  const { rows: openCountRows } = await pool.query(
    `select count(*)::int as open_count
     from alert_notifications an
     left join alerts al on al.alert_id = an.alert_id
     left join alert_statuses ast on ast.alert_status_id = al.alert_status_id
     left join users u on u.user_id = al.user_id
     left join sos_events se on se.sos_event_id = an.sos_event_id
     where an.official_id = $1
       and an.source in ('distress_score', 'sos')
       and (
         (an.source = 'sos' and se.acknowledged_at is null and se.resolved_at is null)
         or (an.source = 'distress_score' and ast.name = 'Open' and u.jurisdiction_id = any($2::uuid[]))
       )`,
    [req.auth.officialId, jurisdictionIds]
  );

  return ok(res, { alerts: alerts.slice(0, 50), openCount: openCountRows[0].open_count });
});

// schema.sql's sos_events comment documents "resolved_at/resolved_by are
// set by PATCH /api/counsellor/sos/:sosEventId/resolve" - that route never
// actually existed, which is why every SOS-sourced alert (source: 'sos')
// stayed "Open" forever on the Alerts feed with no way to change it. Scoped
// the same way /cases/:userId's requireJurisdiction(resolveUserJurisdiction)
// is - via the SOS event's own user, substituting the caller's own
// jurisdiction when they're that user's assigned counsellor (the
// nationwide-fallback-assignment case).
async function resolveSosEventJurisdiction(req) {
  const { data: sosEvent } = await supabase.from('sos_events').select('user_id').eq('sos_event_id', req.params.sosEventId).maybeSingle();
  if (!sosEvent) return null;
  return resolveUserJurisdiction({ ...req, params: { userId: sosEvent.user_id } });
}

router.patch(
  '/sos/:sosEventId/resolve',
  requireRole(['Counsellor']),
  generalApiLimiter,
  requireJurisdiction(resolveSosEventJurisdiction),
  async (req, res) => {
    const { sosEventId } = req.params;
    const { data, error } = await supabase
      .from('sos_events')
      .update({ resolved_at: new Date().toISOString(), resolved_by: req.auth.officialId })
      .eq('sos_event_id', sosEventId)
      .is('resolved_at', null)
      .select('sos_event_id, user_id')
      .maybeSingle();
    if (error) return fail(res, 'Could not resolve this urgent-help event', 500);
    if (!data) return fail(res, 'Urgent-help event not found or already resolved', 404);

    await writeAuditLog({ officialId: req.auth.officialId, userId: data.user_id, action: 'update', entityType: 'sos_event', entityId: sosEventId });
    return ok(res, { sosEventId: data.sos_event_id, status: 'Resolved' });
  }
);

// The "seen it, on it" middle state - without this, an SOS alert could only
// ever be Open or fully Resolved, with no way to signal active work on it
// while still investigating (see migration_016's acknowledged_at/by columns).
router.patch(
  '/sos/:sosEventId/acknowledge',
  requireRole(['Counsellor']),
  generalApiLimiter,
  requireJurisdiction(resolveSosEventJurisdiction),
  async (req, res) => {
    const { sosEventId } = req.params;
    const { data, error } = await supabase
      .from('sos_events')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: req.auth.officialId })
      .eq('sos_event_id', sosEventId)
      .is('resolved_at', null)
      .select('sos_event_id, user_id')
      .maybeSingle();
    if (error) return fail(res, 'Could not acknowledge this urgent-help event', 500);
    if (!data) return fail(res, 'Urgent-help event not found or already resolved', 404);

    await writeAuditLog({ officialId: req.auth.officialId, userId: data.user_id, action: 'update', entityType: 'sos_event', entityId: sosEventId });
    return ok(res, { sosEventId: data.sos_event_id, status: 'Acknowledged' });
  }
);

// The only existing write path for a distress_score-sourced alert
// (POST /cases/:userId/intervention) only ever moves Open -> Acknowledged,
// as a side effect of logging an intervention - there was no way to move
// Acknowledged (or Open, if no intervention was ever needed) -> Resolved.
async function resolveAlertJurisdiction(req) {
  const { data: alert } = await supabase.from('alerts').select('user_id').eq('alert_id', req.params.alertId).maybeSingle();
  if (!alert) return null;
  return resolveUserJurisdiction({ ...req, params: { userId: alert.user_id } });
}

router.patch(
  '/alerts/:alertId/acknowledge',
  requireRole(['Counsellor']),
  generalApiLimiter,
  requireJurisdiction(resolveAlertJurisdiction),
  async (req, res) => {
    const { alertId } = req.params;
    const { data: ackStatus, error: statusError } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Acknowledged').single();
    if (statusError || !ackStatus) return fail(res, 'Could not resolve "Acknowledged" status', 500);

    const { data, error } = await supabase
      .from('alerts')
      .update({ alert_status_id: ackStatus.alert_status_id })
      .eq('alert_id', alertId)
      .select('alert_id, user_id')
      .maybeSingle();
    if (error) return fail(res, 'Could not acknowledge this alert', 500);
    if (!data) return fail(res, 'Alert not found', 404);

    await writeAuditLog({ officialId: req.auth.officialId, userId: data.user_id, action: 'update', entityType: 'alert', entityId: alertId });
    return ok(res, { alertId: data.alert_id, status: 'Acknowledged' });
  }
);

router.patch(
  '/alerts/:alertId/resolve',
  requireRole(['Counsellor']),
  generalApiLimiter,
  requireJurisdiction(resolveAlertJurisdiction),
  async (req, res) => {
    const { alertId } = req.params;
    const { data: resolvedStatus, error: statusError } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Resolved').single();
    if (statusError || !resolvedStatus) return fail(res, 'Could not resolve "Resolved" status', 500);

    const { data, error } = await supabase
      .from('alerts')
      .update({ alert_status_id: resolvedStatus.alert_status_id, resolved_at: new Date().toISOString() })
      .eq('alert_id', alertId)
      .select('alert_id, user_id')
      .maybeSingle();
    if (error) return fail(res, 'Could not resolve this alert', 500);
    if (!data) return fail(res, 'Alert not found', 404);

    await writeAuditLog({ officialId: req.auth.officialId, userId: data.user_id, action: 'update', entityType: 'alert', entityId: alertId });
    return ok(res, { alertId: data.alert_id, status: 'Resolved' });
  }
);

// Feature Catalog Section 2.2 "Scheduled counsellings".
router.get('/scheduled', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { rows } = await pool.query(
    `select session_id, user_id, scheduled_at, status from counselling_sessions
     where counsellor_id = $1 and status = 'upcoming' order by scheduled_at asc`,
    [req.auth.officialId]
  );

  return ok(res, {
    sessions: rows.map((s) => ({ sessionId: s.session_id, userId: s.user_id, scheduledAt: s.scheduled_at, status: s.status })),
  });
});

router.post('/cases/:userId/schedule', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId } = req.params;
  const { scheduledAt } = req.body;
  if (!scheduledAt) return fail(res, 'scheduledAt is required', 400);

  const { data, error } = await supabase
    .from('counselling_sessions')
    .insert({ user_id: userId, counsellor_id: req.auth.officialId, scheduled_at: scheduledAt })
    .select('session_id')
    .single();
  if (error) return fail(res, `Could not schedule session: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, userId, action: 'create', entityType: 'counselling_session', entityId: data.session_id });

  return ok(res, { sessionId: data.session_id }, 'Session scheduled', 201);
});

// Feature Catalog Section 2.3 "In-app chat with user" - the Counsellor-side
// mirror of user/routes/user.routes.js's /messages, same opt-in gating (checked here
// via the user's own row, not just trusted from the URL).
async function requireOptedInUser(req, res) {
  const { userId } = req.params;
  const { data: user } = await supabase
    .from('users')
    .select('opted_for_manual_counsellor, assigned_counsellor_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!user || !user.opted_for_manual_counsellor || user.assigned_counsellor_id !== req.auth.officialId) {
    fail(res, 'This user has not opted in for chat with you', 403);
    return false;
  }
  return true;
}

// A ping older than this is treated as "stopped typing" - see the matching
// constant/comment in user/routes/user.routes.js.
const TYPING_ACTIVE_MS = 4000;

// Voice messages - see the matching constants/helpers in
// user/routes/user.routes.js for the full rationale (private signed-URL
// bucket, WhatsApp-style record/upload/play-with-duration).
const VOICE_MESSAGE_URL_TTL_SECONDS = 3600;
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) return cb(new Error('File must be audio'));
    cb(null, true);
  },
});

function audioExtensionFromMime(mimetype) {
  if (mimetype.includes('webm')) return 'webm';
  if (mimetype.includes('mp4') || mimetype.includes('m4a') || mimetype.includes('aac')) return 'm4a';
  if (mimetype.includes('ogg')) return 'ogg';
  if (mimetype.includes('wav')) return 'wav';
  return 'audio';
}

async function getVoiceMessageUrl(audioPath) {
  if (!audioPath) return null;
  const { data, error } = await supabase.storage.from('voice-messages').createSignedUrl(audioPath, VOICE_MESSAGE_URL_TTL_SECONDS);
  return error ? null : data.signedUrl;
}

router.get('/cases/:userId/messages', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;
  // Messages/typing_status/user_identity all only ever exist under the
  // ANCHOR's user_id (see auth.user.routes.js's login and createLinkedCase in
  // userProvisioning.js - a dependent case has no user_identity row of its
  // own at all) - opening a dependent case's chat by its literal :userId
  // would show an empty thread and a blank phone number even though the real,
  // ongoing conversation is happening under its anchor.
  const activityUserId = await resolveActivityUserId(userId);

  const { data, error } = await supabase
    .from('messages')
    .select('message_id, sender_type, body, sent_at, message_type, audio_path, duration_seconds')
    .eq('user_id', activityUserId)
    .eq('official_id', req.auth.officialId)
    .order('sent_at', { ascending: true });
  if (error) return fail(res, 'Could not load messages', 500);

  // Opening/polling this thread is what marks the user's messages read -
  // matches ordinary chat-app semantics, no separate "mark read" call needed.
  await pool.query(
    `update messages set read_at = now() where user_id = $1 and official_id = $2 and sender_type = 'user' and read_at is null`,
    [activityUserId, req.auth.officialId]
  );

  const { rows: typingRows } = await pool.query(
    `select updated_at from typing_status where user_id = $1 and official_id = $2 and sender_type = 'user'`,
    [activityUserId, req.auth.officialId]
  );
  const otherPartyTyping = !!typingRows[0] && (Date.now() - new Date(typingRows[0].updated_at).getTime()) < TYPING_ACTIVE_MS;

  const messages = await Promise.all((data || []).map(async (m) => ({
    messageId: m.message_id,
    senderType: m.sender_type,
    messageType: m.message_type,
    body: m.body,
    audioUrl: m.message_type === 'voice' ? await getVoiceMessageUrl(m.audio_path) : null,
    durationSeconds: m.duration_seconds,
    sentAt: m.sent_at,
  })));

  // CaseChat.jsx (this endpoint's only caller, polled every 3s while the
  // page is open) used to call useCaseDetail(userId) purely to read
  // .phone for its Call button - a full case-detail fetch (scores, signals,
  // trend, predicted risk, etc.) just for one field. This is already a
  // per-user lookup on an already-polled endpoint, so a single-row
  // user_identity read here is effectively free and removes the need for
  // that second, much heavier request entirely.
  const { data: identity } = await supabase.from('user_identity').select('contact_number').eq('user_id', activityUserId).maybeSingle();

  return ok(res, { messages, otherPartyTyping, phone: identity?.contact_number || null });
});

router.post('/cases/:userId/messages', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) return fail(res, 'body is required', 400);
  // Writing under the anchor (not the literal case clicked into) keeps this
  // one shared thread regardless of which of the person's dockets the
  // counsellor happens to have open - matches the mobile app, which always
  // reads/writes messages under req.auth.userId (always the anchor).
  const activityUserId = await resolveActivityUserId(userId);

  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: activityUserId, official_id: req.auth.officialId, sender_type: 'official', message_type: 'text', body: body.trim() })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send message: ${error.message}`, 500);

  // Sending implies typing has stopped - clears the indicator on the user's
  // side immediately rather than waiting out TYPING_ACTIVE_MS.
  await supabase.from('typing_status').delete().eq('user_id', activityUserId).eq('official_id', req.auth.officialId).eq('sender_type', 'official');

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

router.post('/cases/:userId/messages/voice', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), audioUpload.single('audio'), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;
  if (!req.file) return fail(res, 'audio file is required', 400);
  const activityUserId = await resolveActivityUserId(userId);

  const durationSeconds = Math.max(0, Math.round(Number(req.body.duration) || 0));
  const audioPath = `${activityUserId}/${crypto.randomUUID()}.${audioExtensionFromMime(req.file.mimetype)}`;

  const { error: uploadError } = await supabase.storage
    .from('voice-messages')
    .upload(audioPath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return fail(res, `Could not upload voice message: ${uploadError.message}`, 500);

  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: activityUserId, official_id: req.auth.officialId, sender_type: 'official', message_type: 'voice', audio_path: audioPath, duration_seconds: durationSeconds })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send voice message: ${error.message}`, 500);

  await supabase.from('typing_status').delete().eq('user_id', activityUserId).eq('official_id', req.auth.officialId).eq('sender_type', 'official');

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

// Fire-and-forget ping while the counsellor is actively composing a reply -
// upserted (not inserted) since only the most recent "still typing" moment
// matters, not a history of keystrokes.
router.post('/cases/:userId/messages/typing', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;
  const activityUserId = await resolveActivityUserId(userId);

  const { error } = await supabase
    .from('typing_status')
    .upsert({ user_id: activityUserId, official_id: req.auth.officialId, sender_type: 'official', updated_at: new Date().toISOString() }, { onConflict: 'user_id,official_id,sender_type' });
  if (error) return fail(res, `Could not update typing status: ${error.message}`, 500);

  return ok(res, null);
});

module.exports = router;
