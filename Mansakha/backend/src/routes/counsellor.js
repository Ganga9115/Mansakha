const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { pool } = require('../db/pgPool');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { requireRole } = require('../middleware/requireRole');
const { requireJurisdiction } = require('../middleware/requireJurisdiction');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { isEscalatingTrend } = require('../services/scoring');

const RISK_SORT_ORDER = { Critical: 4, High: 3, Moderate: 2, Low: 1 };

const router = express.Router();

// No standing "assignment" table exists in the schema, so "cases this counsellor
// handles" is scoped by the same jurisdiction model Administration uses.
async function resolveVictimJurisdiction(req) {
  const { data } = await supabase.from('victims').select('jurisdiction_id').eq('victim_id', req.params.victimId).maybeSingle();
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
    `select v.victim_id, rl.name as risk_level_name
     from victims v
     left join lateral (
       select risk_level_id from distress_scores where victim_id = v.victim_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where v.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );

  const counts = { total: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const v of rows) {
    counts.total += 1;
    const riskLevel = v.risk_level_name;
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

  // Each victim's CURRENT risk tier is their most recent distress_scores row - not
  // modeled as a denormalized column on `victims`, so this is resolved via the
  // latest score per victim rather than trusting any cached field. Sorting by
  // priority means the whole jurisdiction's cases have to be fetched and sorted
  // in application code before paginating - a DB-level `.range()` would only
  // sort within one already-arbitrary page, not across the whole queue.
  //
  // Raw pg, not Supabase REST - the Case Queue is a screen a Counsellor
  // reloads constantly through a shift; see /dashboard above for the
  // measured REST-vs-pg latency gap this is closing.
  const { rows } = await pool.query(
    `select v.victim_id, v.case_stage, v.case_background, ds.score_value, rl.name as risk_level_name
     from victims v
     left join lateral (
       select score_value, risk_level_id from distress_scores where victim_id = v.victim_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where v.jurisdiction_id = any($1::uuid[])`,
    [jurisdictionIds]
  );

  const BACKSTORY_EXCERPT_LENGTH = 140; // Section 2.2: a truncated excerpt on the list, full text on Case Detail

  let cases = rows.map((v) => ({
    victimId: v.victim_id,
    caseStage: v.case_stage,
    score: v.score_value !== null ? Number(v.score_value) : null,
    riskLevel: v.risk_level_name,
    caseBackground: v.case_background
      ? (v.case_background.length > BACKSTORY_EXCERPT_LENGTH ? `${v.case_background.slice(0, BACKSTORY_EXCERPT_LENGTH)}…` : v.case_background)
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

router.get('/my-victims', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const jurisdictionIds = req.auth.roles.filter((r) => r.roleName === 'Counsellor').map((r) => r.jurisdictionId).filter(Boolean);
  if (jurisdictionIds.length === 0) return ok(res, { cases: [], total: 0 });

  const { riskLevel, page = 1 } = req.query;
  const pageSize = 20;
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * pageSize;

  const { rows } = await pool.query(
    `select v.victim_id, v.case_stage, v.case_background, ds.score_value, rl.name as risk_level_name
     from victims v
     left join lateral (
       select score_value, risk_level_id from distress_scores where victim_id = v.victim_id order by computed_at desc limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where v.assigned_counsellor_id = $1 and v.jurisdiction_id = any($2::uuid[])`,
    [req.auth.officialId, jurisdictionIds]
  );

  const BACKSTORY_EXCERPT_LENGTH = 140;

  let cases = rows.map((v) => ({
    victimId: v.victim_id,
    caseStage: v.case_stage,
    score: v.score_value !== null ? Number(v.score_value) : null,
    riskLevel: v.risk_level_name,
    caseBackground: v.case_background
      ? (v.case_background.length > BACKSTORY_EXCERPT_LENGTH ? `${v.case_background.slice(0, BACKSTORY_EXCERPT_LENGTH)}…` : v.case_background)
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
router.get('/cases/:victimId', requireRole(['Counsellor', 'Administration']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;

  // Raw pg (not Supabase REST) with the two truly-independent lookups run
  // concurrently, same fix as elsewhere this session. victims.phone doesn't
  // exist - the previous query silently failed on that bad column reference
  // (error was never checked), which is why Case Detail's Call/WhatsApp
  // buttons never showed: victimRow always came back undefined. Fixed to
  // pull the real contact number from victim_identity instead.
  const [{ rows: victimRows }, { rows: scoreRows }] = await Promise.all([
    pool.query(
      `select v.case_background, vi.contact_number as phone
       from victims v
       left join victim_identity vi on vi.victim_id = v.victim_id
       where v.victim_id = $1`,
      [victimId]
    ),
    pool.query(
      `select ds.score_id, ds.score_value, ds.computed_at, ds.interaction_id, ds.explanation, ds.suggested_intervention_type_id,
              it.name as intervention_type_name, rl.name as risk_level_name
       from distress_scores ds
       left join intervention_types it on it.intervention_type_id = ds.suggested_intervention_type_id
       join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       where ds.victim_id = $1
       order by ds.computed_at desc
       limit 3`,
      [victimId]
    ),
  ]);
  const victimRow = victimRows[0];

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
      `select intervention_id, completed_at from interventions where victim_id = $1 order by recommended_at desc limit 1`,
      [victimId]
    ),
  ]);
  const openIntervention = interventionRows[0];

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'read', entityType: 'case_detail', entityId: victimId });

  // The real 3-point monotonic-rise detector (services/scoring.js,
  // unit-tested) takes priority when there's enough history; the cruder
  // 2-point comparison is only a fallback for a case with just 2 check-ins.
  const trend = previous
    ? (escalating || Number(latest.score_value) > Number(previous.score_value) ? 'escalating' : 'stable_or_improving')
    : 'insufficient_data';

  return ok(res, {
    caseBackground: victimRow?.case_background || null,
    phone: victimRow?.phone || null,
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

router.post('/cases/:victimId/intervention', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;
  const { interventionTypeId, notes } = req.body;
  if (!interventionTypeId) return fail(res, 'interventionTypeId is required', 400);

  const { data: openAlert } = await supabase
    .from('alerts')
    .select('alert_id, alert_status_id, alert_statuses(name)')
    .eq('victim_id', victimId)
    .order('triggered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: intervention, error } = await supabase
    .from('interventions')
    .insert({
      victim_id: victimId,
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

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'create', entityType: 'intervention', entityId: intervention.intervention_id });

  return ok(res, { interventionId: intervention.intervention_id }, null, 201);
});

// interventions.completed_at existed in the schema with no code path that
// ever set it - "AI follow-up tracking" (Section 4.4) had no real mechanism
// behind it until this.
router.patch('/cases/:victimId/intervention/:interventionId/complete', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId, interventionId } = req.params;

  const { data, error } = await supabase
    .from('interventions')
    .update({ completed_at: new Date().toISOString() })
    .eq('intervention_id', interventionId)
    .eq('victim_id', victimId)
    .select('intervention_id')
    .maybeSingle();
  if (error) return fail(res, 'Could not mark intervention complete', 500);
  if (!data) return fail(res, 'Intervention not found for this case', 404);

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'update', entityType: 'intervention', entityId: interventionId });

  return ok(res, null, 'Intervention marked complete');
});

// Case notes - free-text commentary, separate from the structured
// interventions above and from audit_log's read/write record.
router.get('/cases/:victimId/notes', requireRole(['Counsellor', 'Administration']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;
  const { rows } = await pool.query(
    `select cn.note_id, cn.note_text, cn.authored_by, cn.created_at, o.full_name
     from case_notes cn
     left join officials o on o.official_id = cn.official_id
     where cn.victim_id = $1
     order by cn.created_at desc`,
    [victimId]
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

router.post('/cases/:victimId/notes', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;
  const { noteText } = req.body;
  if (!noteText || !noteText.trim()) return fail(res, 'noteText is required', 400);

  const { data, error } = await supabase
    .from('case_notes')
    .insert({ victim_id: victimId, official_id: req.auth.officialId, note_text: noteText.trim() })
    .select('note_id')
    .single();
  if (error) return fail(res, 'Could not save note', 500);

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'create', entityType: 'case_note', entityId: data.note_id });

  return ok(res, { noteId: data.note_id }, 'Note added', 201);
});

// Capped, not full-page-UI paginated - this feed is polled every 15s
// (frontend/src/services/hooks.js) and rendered as a live list, not paged
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
    .select('notified_at, source, priority, auto_assigned, alerts(alert_id, victim_id, triggered_at, alert_statuses(name), victims(jurisdiction_id)), sos_events(sos_event_id, victim_id, triggered_at, resolved_at, victims(jurisdiction_id))')
    .eq('official_id', req.auth.officialId)
    .order('notified_at', { ascending: false })
    .limit(100); // Increased limit slightly to account for filtered items
  if (error) return fail(res, 'Could not load alerts', 500);

  const alerts = [];
  for (const n of data || []) {
    const isSos = n.source === 'sos';
    const jId = isSos ? n.sos_events?.victims?.jurisdiction_id : n.alerts?.victims?.jurisdiction_id;
    if (!jurisdictionIds.includes(jId)) continue;
    
    alerts.push({
      alertId: isSos ? n.sos_events.sos_event_id : n.alerts.alert_id,
      source: n.source,
      priority: n.priority,
      autoAssigned: n.auto_assigned,
      victimId: isSos ? n.sos_events.victim_id : n.alerts.victim_id,
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
    .select('sos_event_id, victim_id')
    .maybeSingle();
  if (error) return fail(res, 'Could not resolve SOS event', 500);
  if (!data) return fail(res, 'SOS event not found or already resolved', 404);

  await writeAuditLog({ officialId: req.auth.officialId, victimId: data.victim_id, action: 'update', entityType: 'sos_event', entityId: sosEventId });

  return ok(res, null, 'SOS event resolved');
});

// Feature Catalog Section 2.2 "Scheduled counsellings".
router.get('/scheduled', requireRole(['Counsellor']), generalApiLimiter, async (req, res) => {
  const { rows } = await pool.query(
    `select session_id, victim_id, scheduled_at, status from counselling_sessions
     where counsellor_id = $1 and status = 'upcoming' order by scheduled_at asc`,
    [req.auth.officialId]
  );

  return ok(res, {
    sessions: rows.map((s) => ({ sessionId: s.session_id, victimId: s.victim_id, scheduledAt: s.scheduled_at, status: s.status })),
  });
});

router.post('/cases/:victimId/schedule', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  const { victimId } = req.params;
  const { scheduledAt } = req.body;
  if (!scheduledAt) return fail(res, 'scheduledAt is required', 400);

  const { data, error } = await supabase
    .from('counselling_sessions')
    .insert({ victim_id: victimId, counsellor_id: req.auth.officialId, scheduled_at: scheduledAt })
    .select('session_id')
    .single();
  if (error) return fail(res, `Could not schedule session: ${error.message}`, 500);

  await writeAuditLog({ officialId: req.auth.officialId, victimId, action: 'create', entityType: 'counselling_session', entityId: data.session_id });

  return ok(res, { sessionId: data.session_id }, 'Session scheduled', 201);
});

// Feature Catalog Section 2.3 "In-app chat with victim" - the Counsellor-side
// mirror of routes/victim.js's /messages, same opt-in gating (checked here
// via the victim's own row, not just trusted from the URL).
async function requireOptedInVictim(req, res) {
  const { victimId } = req.params;
  const { data: victim } = await supabase
    .from('victims')
    .select('opted_for_manual_counsellor, assigned_counsellor_id')
    .eq('victim_id', victimId)
    .maybeSingle();
  if (!victim || !victim.opted_for_manual_counsellor || victim.assigned_counsellor_id !== req.auth.officialId) {
    fail(res, 'This victim has not opted in for chat with you', 403);
    return false;
  }
  return true;
}

router.get('/cases/:victimId/messages', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  if (!(await requireOptedInVictim(req, res))) return;
  const { victimId } = req.params;

  const { data, error } = await supabase
    .from('messages')
    .select('message_id, sender_type, body, sent_at')
    .eq('victim_id', victimId)
    .eq('official_id', req.auth.officialId)
    .order('sent_at', { ascending: true });
  if (error) return fail(res, 'Could not load messages', 500);

  return ok(res, {
    messages: (data || []).map((m) => ({ messageId: m.message_id, senderType: m.sender_type, body: m.body, sentAt: m.sent_at })),
  });
});

router.post('/cases/:victimId/messages', requireRole(['Counsellor']), generalApiLimiter, requireJurisdiction(resolveVictimJurisdiction), async (req, res) => {
  if (!(await requireOptedInVictim(req, res))) return;
  const { victimId } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) return fail(res, 'body is required', 400);

  const { data, error } = await supabase
    .from('messages')
    .insert({ victim_id: victimId, official_id: req.auth.officialId, sender_type: 'official', body: body.trim() })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send message: ${error.message}`, 500);

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

module.exports = router;
