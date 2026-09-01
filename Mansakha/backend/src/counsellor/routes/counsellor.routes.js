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
const { isEscalatingTrend } = require('../../ai/scoring');

const RISK_SORT_ORDER = { Critical: 4, High: 3, Moderate: 2, Low: 1 };

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
  const { rows } = await pool.query(
    `select u.user_id, rl.name as risk_level_name
     from users u
     left join lateral (
       select risk_level_id from distress_scores where user_id = u.user_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where u.assigned_counsellor_id = $1`,
    [req.auth.officialId]
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

  // assigned_counsellor_id, not jurisdiction - same fix as /dashboard and
  // /my-users above (see /my-users' comment for the full rationale).
  //
  // Each user's CURRENT risk tier is their most recent distress_scores row - not
  // modeled as a denormalized column on `users`, so this is resolved via the
  // latest score per user rather than trusting any cached field. Sorting by
  // priority means the whole queue has to be fetched and sorted in
  // application code before paginating - a DB-level `.range()` would only
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
     where u.assigned_counsellor_id = $1`,
    [req.auth.officialId]
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
  const { riskLevel, page = 1 } = req.query;
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
      `select u.user_id, u.case_stage, u.case_background, ds.score_value, rl.name as risk_level_name
       from users u
       left join lateral (
         select score_value, risk_level_id from distress_scores where user_id = u.user_id order by computed_at desc limit 1
       ) ds on true
       left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       where u.assigned_counsellor_id = $1`,
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
    caseStage: u.case_stage,
    score: u.score_value !== null ? Number(u.score_value) : null,
    riskLevel: u.risk_level_name,
    caseBackground: u.case_background
      ? (u.case_background.length > BACKSTORY_EXCERPT_LENGTH ? `${u.case_background.slice(0, BACKSTORY_EXCERPT_LENGTH)}…` : u.case_background)
      : null,
    hasUnreadMessage: unreadUserIds.has(u.user_id),
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
  const [{ rows: userRows }, { rows: scoreRows }, { rows: unreadRows }] = await Promise.all([
    pool.query(
      `select u.case_background, u.opted_for_manual_counsellor, ui.contact_number as phone
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
    // Red-dot indicator for the "Chat with User" button - unread from the
    // user's side, scoped to this counsellor specifically.
    pool.query(
      `select 1 from messages where user_id = $1 and official_id = $2 and sender_type = 'user' and read_at is null limit 1`,
      [userId, req.auth.officialId]
    ),
  ]);
  const userRow = userRows[0];
  const hasUnreadMessage = unreadRows.length > 0;

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
    optedForManualCounsellor: userRow?.opted_for_manual_counsellor || false,
    hasUnreadMessage,
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

  const { data, error } = await supabase
    .from('alert_notifications')
    .select('notified_at, source, priority, auto_assigned, alerts(alert_id, user_id, triggered_at, alert_statuses(name), users(jurisdiction_id)), sos_events(sos_event_id, user_id, triggered_at, resolved_at)')
    .eq('official_id', req.auth.officialId)
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
      status: isUrgentHelp ? (n.sos_events.resolved_at ? 'Resolved' : 'Open') : n.alerts.alert_statuses.name,
      notifiedAt: n.notified_at,
    });
  }

  return ok(res, { alerts: alerts.slice(0, 50) });
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

  const { data, error } = await supabase
    .from('messages')
    .select('message_id, sender_type, body, sent_at, message_type, audio_path, duration_seconds')
    .eq('user_id', userId)
    .eq('official_id', req.auth.officialId)
    .order('sent_at', { ascending: true });
  if (error) return fail(res, 'Could not load messages', 500);

  // Opening/polling this thread is what marks the user's messages read -
  // matches ordinary chat-app semantics, no separate "mark read" call needed.
  await pool.query(
    `update messages set read_at = now() where user_id = $1 and official_id = $2 and sender_type = 'user' and read_at is null`,
    [userId, req.auth.officialId]
  );

  const { rows: typingRows } = await pool.query(
    `select updated_at from typing_status where user_id = $1 and official_id = $2 and sender_type = 'user'`,
    [userId, req.auth.officialId]
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

  return ok(res, { messages, otherPartyTyping });
});

router.post('/cases/:userId/messages', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) return fail(res, 'body is required', 400);

  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: userId, official_id: req.auth.officialId, sender_type: 'official', message_type: 'text', body: body.trim() })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send message: ${error.message}`, 500);

  // Sending implies typing has stopped - clears the indicator on the user's
  // side immediately rather than waiting out TYPING_ACTIVE_MS.
  await supabase.from('typing_status').delete().eq('user_id', userId).eq('official_id', req.auth.officialId).eq('sender_type', 'official');

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

router.post('/cases/:userId/messages/voice', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), audioUpload.single('audio'), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;
  if (!req.file) return fail(res, 'audio file is required', 400);

  const durationSeconds = Math.max(0, Math.round(Number(req.body.duration) || 0));
  const audioPath = `${userId}/${crypto.randomUUID()}.${audioExtensionFromMime(req.file.mimetype)}`;

  const { error: uploadError } = await supabase.storage
    .from('voice-messages')
    .upload(audioPath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return fail(res, `Could not upload voice message: ${uploadError.message}`, 500);

  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: userId, official_id: req.auth.officialId, sender_type: 'official', message_type: 'voice', audio_path: audioPath, duration_seconds: durationSeconds })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send voice message: ${error.message}`, 500);

  await supabase.from('typing_status').delete().eq('user_id', userId).eq('official_id', req.auth.officialId).eq('sender_type', 'official');

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

// Fire-and-forget ping while the counsellor is actively composing a reply -
// upserted (not inserted) since only the most recent "still typing" moment
// matters, not a history of keystrokes.
router.post('/cases/:userId/messages/typing', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveUserJurisdiction), async (req, res) => {
  if (!(await requireOptedInUser(req, res))) return;
  const { userId } = req.params;

  const { error } = await supabase
    .from('typing_status')
    .upsert({ user_id: userId, official_id: req.auth.officialId, sender_type: 'official', updated_at: new Date().toISOString() }, { onConflict: 'user_id,official_id,sender_type' });
  if (error) return fail(res, `Could not update typing status: ${error.message}`, 500);

  return ok(res, null);
});

module.exports = router;
