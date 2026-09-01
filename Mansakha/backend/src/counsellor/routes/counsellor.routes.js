const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { requireRole } = require('../../core/middleware/requireRole');
const { requireJurisdiction } = require('../../core/middleware/requireJurisdiction');
const { generalApiLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { isEscalatingTrend } = require('../../ai/scoring');

const RISK_SORT_ORDER = { Critical: 4, High: 3, Moderate: 2, Low: 1 };

const router = express.Router();

// No standing "assignment" table exists in the schema, so "cases this counsellor
// handles" is scoped by the same jurisdiction model Administration uses.
async function resolveUserJurisdiction(req) {
  const { data } = await supabase.from('users').select('jurisdiction_id').eq('user_id', req.params.userId).maybeSingle();
  return data ? data.jurisdiction_id : null;
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
  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { total: 0, low: 0, moderate: 0, high: 0, critical: 0 });

  // Raw pg (not Supabase REST) - this is the Counsellor's own landing screen,
  // so its latency is felt on every login/reload; a single PostgREST round
  // trip alone costs ~1-2s here regardless of how little data comes back
  // (confirmed live elsewhere this session), while a warmed pg connection
  // is a few hundred ms at most.
  const { rows } = await pool.query(
    `select u.user_id, rl.name as risk_level_name
     from users u
     left join lateral (
       select risk_level_id from distress_scores where user_id = u.user_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );

  const counts = { total: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const u of rows) {
    counts.total += 1;
    const riskLevel = u.risk_level_name;
    if (riskLevel === 'Low') counts.low += 1;
    if (riskLevel === 'Moderate') counts.moderate += 1;
    if (riskLevel === 'High') counts.high += 1;
    if (riskLevel === 'Critical') counts.critical += 1;
  }
  return ok(res, counts);
});

router.get('/cases', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { riskLevel, page = 1 } = req.query;
  const pageSize = 20;
  const offset = (Number(page) - 1) * pageSize;

  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { cases: [], total: 0 });

  // Each user's CURRENT risk tier is their most recent distress_scores row - not
  // modeled as a denormalized column on `users`, so this is resolved via the
  // latest score per user rather than trusting any cached field. Sorting by
  // priority means the whole jurisdiction's cases have to be fetched and sorted
  // in application code before paginating - a DB-level `.range()` would only
  // sort within one already-arbitrary page, not across the whole queue.
  //
  // Raw pg, not Supabase REST - the Case Queue is a screen a Counsellor
  // reloads constantly through a shift; see /dashboard above for the
  // measured REST-vs-pg latency gap this is closing.
  const { rows } = await pool.query(
    `select u.user_id, u.case_stage, u.case_background, ds.score_value, rl.name as risk_level_name
     from users u
     left join lateral (
       select score_value, risk_level_id from distress_scores where user_id = u.user_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );

  const BACKSTORY_EXCERPT_LENGTH = 140; // Section 2.2: a truncated excerpt on the list, full text on Case Detail

  let cases = rows.map((u) => ({
    userId: u.user_id,
    caseStage: u.case_stage,
    score: u.score_value !== null ? Number(u.score_value) : null,
    riskLevel: u.risk_level_name,
    caseBackground: u.case_background
      ? (u.case_background.length > BACKSTORY_EXCERPT_LENGTH ? `${u.case_background.slice(0, BACKSTORY_EXCERPT_LENGTH)}…` : u.case_background)
      : null,
  }));

  if (riskLevel) cases = cases.filter((c) => c.riskLevel === riskLevel);

  // Sorted by priority (highest risk first), not by recency - a case queue's
  // whole point is surfacing the most urgent cases first.
  cases.sort((a, b) => (RISK_SORT_ORDER[b.riskLevel] || 0) - (RISK_SORT_ORDER[a.riskLevel] || 0));

  const total = cases.length;
  cases = cases.slice(offset, offset + pageSize);

  await writeAuditLog({ officialId: req.auth.officialId, action: 'read', entityType: 'case_list' });

  return ok(res, { cases, total });
});

router.get('/my-users', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { cases: [], total: 0 });

  const { riskLevel, page = 1 } = req.query;
  const pageSize = 20;
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * pageSize;

  const { rows } = await pool.query(
    `select u.user_id, u.case_stage, u.case_background, ds.score_value, rl.name as risk_level_name
     from users u
     left join lateral (
       select score_value, risk_level_id from distress_scores where user_id = u.user_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.assigned_counsellor_id = $1 and u.jurisdiction_id = any($2::uuid[])`,
    [req.auth.officialId, jurisdictionIds]
  );

  const BACKSTORY_EXCERPT_LENGTH = 140;

  let cases = rows.map((u) => ({
    userId: u.user_id,
    caseStage: u.case_stage,
    score: u.score_value !== null ? Number(u.score_value) : null,
    riskLevel: u.risk_level_name,
    caseBackground: u.case_background
      ? (u.case_background.length > BACKSTORY_EXCERPT_LENGTH ? `${u.case_background.slice(0, BACKSTORY_EXCERPT_LENGTH)}…` : u.case_background)
      : null,
  }));

  if (riskLevel) cases = cases.filter((c) => c.riskLevel === riskLevel);
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

  // Raw pg (not Supabase REST) with the two truly-independent lookups run
  // concurrently, same fix as elsewhere this session. users.phone doesn't
  // exist - the previous query silently failed on that bad column reference
  // (error was never checked), which is why Case Detail's Call/WhatsApp
  // buttons never showed: userRow always came back undefined. Fixed to
  // pull the real contact number from user_identity instead.
  const [{ rows: userRows }, { rows: scoreRows }] = await Promise.all([
    pool.query(
      `select u.case_background, ui.contact_number as phone
       from users u
       left join user_identity ui on ui.user_id = u.user_id
       where u.user_id = $1`,
      [userId]
    ),
    pool.query(
      `select ds.score_id, ds.score_value, ds.computed_at, ds.interaction_id, ds.explanation, ds.suggested_intervention_type_id,
              it.name as intervention_type_name, rl.name as risk_level_name
       from distress_scores ds
       left join intervention_types it on it.intervention_type_id = ds.suggested_intervention_type_id
       join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       where ds.user_id = $1
       order by ds.computed_at desc
       limit 3`,
      [userId]
    ),
  ]);
  const userRow = userRows[0];

  if (scoreRows.length === 0) return fail(res, 'No check-ins recorded for this case yet', 404);

  const [latest, previous] = scoreRows;
  // isEscalatingTrend wants oldest-first; `scoreRows` came back newest-first.
  const escalating = scoreRows.length >= 3 && isEscalatingTrend([...scoreRows].reverse().map((s) => Number(s.score_value)));

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
    caseBackground: userRow?.case_background || null,
    phone: userRow?.phone || null,
    score: Number(latest.score_value),
    previousScore: previous ? Number(previous.score_value) : null,
    trend,
    riskLevel: latest.risk_level_name,
    riskFactors: signals.map((s) => ({ signal: s.signal_type_name, value: Number(s.value) })),
    explanation: latest.explanation || null,
    suggestedInterventionType: latest.suggested_intervention_type_id
      ? { id: latest.suggested_intervention_type_id, name: latest.intervention_type_name }
      : null,
    interventionStatus: openIntervention ? (openIntervention.completed_at ? 'completed' : 'pending') : 'none',
    interventionId: openIntervention ? openIntervention.intervention_id : null,
  });
});

router.post('/cases/:userId/intervention', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  const { userId } = req.params;
  const { interventionTypeId, notes } = req.body;
  if (!interventionTypeId) return fail(res, 'interventionTypeId is required', 400);

  const { data: openAlert } = await supabase
    .from('alerts')
    .select('alert_id, alert_status_id, alert_statuses(name)')
    .eq('user_id', userId)
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
// Feature Catalog Section 2.2/2.4 "SOS alert" - a row here now backs EITHER
// a distress-score alert OR an SOS event (alert_notifications.source),
// never both (see schema.sql's XOR check constraint) - the response always
// includes `source` so the frontend can render the distinct SOS badge.
router.get('/alerts', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { alerts: [] });

  const { data, error } = await supabase
    .from('alert_notifications')
    .select('notified_at, source, priority, auto_assigned, alerts(alert_id, user_id, triggered_at, alert_statuses(name), users(jurisdiction_id)), sos_events(sos_event_id, user_id, triggered_at, resolved_at, users(jurisdiction_id))')
    .eq('official_id', req.auth.officialId)
    .order('notified_at', { ascending: false })
    .limit(100); // Increased limit slightly to account for filtered items
  if (error) return fail(res, 'Could not load alerts', 500);

  const alerts = [];
  for (const n of data || []) {
    const isSos = n.source === 'sos';
    const jId = isSos ? n.sos_events?.users?.jurisdiction_id : n.alerts?.users?.jurisdiction_id;
    if (!jurisdictionIds.includes(jId)) continue;

    alerts.push({
      alertId: isSos ? n.sos_events.sos_event_id : n.alerts.alert_id,
      source: n.source,
      priority: n.priority,
      autoAssigned: n.auto_assigned,
      userId: isSos ? n.sos_events.user_id : n.alerts.user_id,
      triggeredAt: isSos ? n.sos_events.triggered_at : n.alerts.triggered_at,
      status: isSos ? (n.sos_events.resolved_at ? 'Resolved' : 'Open') : n.alerts.alert_statuses.name,
      notifiedAt: n.notified_at,
    });
  }

  return ok(res, { alerts: alerts.slice(0, 50) });
});

// Marks an SOS event resolved - the sos_events equivalent of acknowledging/
// resolving a normal alert (which uses alert_statuses instead, since SOS
// deliberately doesn't create an alerts row - see schema.sql).
router.patch('/sos/:sosEventId/resolve', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { sosEventId } = req.params;

  const { data, error } = await supabase
    .from('sos_events')
    .update({ resolved_at: new Date().toISOString(), resolved_by: req.auth.officialId })
    .eq('sos_event_id', sosEventId)
    .is('resolved_at', null)
    .select('sos_event_id, user_id')
    .maybeSingle();
  if (error) return fail(res, 'Could not resolve SOS event', 500);
  if (!data) return fail(res, 'SOS event not found or already resolved', 404);

  await writeAuditLog({ officialId: req.auth.officialId, userId: data.user_id, action: 'update', entityType: 'sos_event', entityId: sosEventId });

  return ok(res, null, 'SOS event resolved');
});

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

router.get('/cases/:userId/messages', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;

  const { data, error } = await supabase
    .from('messages')
    .select('message_id, sender_type, body, sent_at')
    .eq('user_id', userId)
    .eq('official_id', req.auth.officialId)
    .order('sent_at', { ascending: true });
  if (error) return fail(res, 'Could not load messages', 500);

  return ok(res, {
    messages: (data || []).map((m) => ({ messageId: m.message_id, senderType: m.sender_type, body: m.body, sentAt: m.sent_at })),
  });
});

router.post('/cases/:userId/messages', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) return fail(res, 'body is required', 400);

  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: userId, official_id: req.auth.officialId, sender_type: 'official', body: body.trim() })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send message: ${error.message}`, 500);

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

module.exports = router;
