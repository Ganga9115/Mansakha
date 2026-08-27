const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { analyzeInteraction, analyzeChatMessage, analyzeInteractionFromClientAi } = require('../services/ai');
const { writeAuditLog } = require('../services/auditLog');
const { verifyToken } = require('../middleware/verifyToken');
const { generalApiLimiter, victimChatLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');
const { recordInteraction, recordAiDistressScore, PipelineError } = require('../services/interactionPipeline');
const { applyStressResponse, selectLeastLoadedCounsellor } = require('../services/stressResponse');
const { enqueueAlertDispatch } = require('../services/dispatchWorker');

const router = express.Router();

const NEXT_CHECKIN_CADENCE_DAYS = 7;
const SUPPORT_LINKS = [
  { label: 'NHAA Helpline', detail: 'Call 14566, 24/7, available in Hindi/English/regional languages' },
  { label: 'Talk to your Counsellor', detail: 'Available through the Support section' },
];

function requireVictim(req, res, next) {
  if (!req.auth || req.auth.type !== 'victim') return fail(res, 'Victim account required', 403);
  next();
}

// Every route below uses req.auth.victimId (from the verified JWT) - NEVER a
// client-supplied victim ID - so a victim's own token can only ever act on their
// own record, matching the same "no ID lets you reach outside your own scope"
// property enforced elsewhere via requireJurisdiction.
router.use(verifyToken, requireVictim, generalApiLimiter);

router.get('/dashboard', async (req, res) => {
  const victimId = req.auth.victimId;

  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .select('status, case_stage, preferred_language, docket_number, opted_for_manual_counsellor, sms_checkin_enabled')
    .eq('victim_id', victimId)
    .single();
  if (victimError || !victim) return fail(res, 'Victim record not found', 404);

  const { data: identity } = await supabase
    .from('victim_identity')
    .select('full_name')
    .eq('victim_id', victimId)
    .maybeSingle();

  const { data: latestScore } = await supabase
    .from('distress_scores')
    .select('score_value, risk_level_id, computed_at, risk_levels(name)')
    .eq('victim_id', victimId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: openAlerts } = await supabase
    .from('alerts')
    .select('alert_id, triggered_at, alert_statuses(name)')
    .eq('victim_id', victimId)
    .order('triggered_at', { ascending: false });

  const { data: lastInteraction } = await supabase
    .from('interactions')
    .select('occurred_at')
    .eq('victim_id', victimId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Placeholder cadence rule - there's no scheduler built yet (Section 4.2's
  // "scheduling and dispatch" is a future pass), so this is a real computed date
  // from real data, but not a true dispatch schedule.
  const nextCheckIn = lastInteraction
    ? new Date(new Date(lastInteraction.occurred_at).getTime() + NEXT_CHECKIN_CADENCE_DAYS * 86400000)
    : new Date();

  await writeAuditLog({ victimId, action: 'read', entityType: 'victim_dashboard', entityId: victimId });

  return ok(res, {
    fullName: identity?.full_name || null,
    docketNumber: victim.docket_number,
    caseStatus: { status: victim.status, caseStage: victim.case_stage },
    preferredLanguageId: victim.preferred_language,
    optedForManualCounsellor: victim.opted_for_manual_counsellor,
    smsCheckinEnabled: victim.sms_checkin_enabled,
    currentDistressLevel: latestScore
      ? { score: latestScore.score_value, riskLevel: latestScore.risk_levels.name }
      : null,
    nextCheckIn,
    alerts: (openAlerts || []).map((a) => ({ alertId: a.alert_id, triggeredAt: a.triggered_at, status: a.alert_statuses.name })),
    supportLinks: SUPPORT_LINKS,
  });
});

// Check-in now runs its conversation against a locally-running Ollama instance
// on the victim's own device (frontend/src/services/ollamaClient.js), not a
// server-side Gemini call - the client sends the transcript plus its own
// Ollama-derived distress analysis, and this route scores it through the same
// computeDistressScore/alerts/case-note pipeline analyzeInteraction() used to
// feed (see services/ai.js's analyzeInteractionFromClientAi).
router.post('/checkin', async (req, res) => {
  const victimId = req.auth.victimId;
  const { channel, responses, aiAnalysis } = req.body;
  if (!channel || !Array.isArray(responses) || responses.length === 0) {
    return fail(res, 'channel and a non-empty responses[] are required', 400);
  }
  if (
    !aiAnalysis ||
    typeof aiAnalysis.sentiment !== 'number' ||
    typeof aiAnalysis.emotion !== 'number' ||
    typeof aiAnalysis.summary !== 'string' ||
    !aiAnalysis.summary.trim()
  ) {
    return fail(res, 'aiAnalysis (sentiment, emotion, summary) is required', 400);
  }
  const text = responses.join(' ');

  let interactionId;
  try {
    ({ interactionId } = await recordInteraction({ victimId, channelName: channel, transcriptText: text }));
  } catch (err) {
    if (err instanceof PipelineError) return fail(res, err.message, err.status);
    throw err;
  }

  let analysis;
  try {
    analysis = await analyzeInteractionFromClientAi(victimId, text, aiAnalysis);
  } catch (err) {
    return fail(res, `Check-in recorded, but analysis failed: ${err.message}`, 502);
  }

  const { scoreId } = await recordAiDistressScore(victimId, interactionId, analysis);

  // Feature Catalog Section 1.5 - replaces the old "if High/Critical, create
  // one alert and notify the jurisdiction" logic with the full tiered
  // response (Low no-op, Moderate wellness push, High AI proactive contact,
  // Critical real alert with opt-in-aware routing).
  const { alertId } = await applyStressResponse(victimId, scoreId, analysis.riskLevel);

  // Section 2.3 - after a real check-in, save a case note a Counsellor can
  // review/edit. The summary is already AI-authored (by the same Ollama
  // conversation, not a second server-side call) - stored as-is.
  const summary = aiAnalysis.summary.trim();
  try {
    await supabase.from('case_notes').insert({ victim_id: victimId, official_id: null, note_text: summary, authored_by: 'ai' });
  } catch (err) {
    console.warn('checkin: saving AI case-note summary failed (non-fatal):', err.message);
  }

  await writeAuditLog({ victimId, action: 'create', entityType: 'interaction', entityId: interactionId });

  return ok(res, {
    interactionId,
    scoreValue: analysis.scoreValue,
    riskLevel: analysis.riskLevel,
    alertTriggered: alertId !== null,
    summary,
  }, null, 201);
});

// Feature Catalog Section 1.3 "AI Chat" - one message in, one AI reply +
// real distress score out, via the 'Chatbot' channel. victimChatLimiter
// (on top of the router-wide generalApiLimiter) protects the Gemini free
// tier's shared 20/day quota from one runaway conversation.
router.post('/chat', victimChatLimiter, async (req, res) => {
  const victimId = req.auth.victimId;
  const { message } = req.body;
  if (typeof message !== 'string' || !message.trim()) return fail(res, 'message is required', 400);

  await supabase.from('chat_messages').insert({ victim_id: victimId, sender: 'victim', body: message.trim() });

  let interactionId;
  try {
    ({ interactionId } = await recordInteraction({ victimId, channelName: 'Chatbot', transcriptText: message }));
  } catch (err) {
    if (err instanceof PipelineError) return fail(res, err.message, err.status);
    throw err;
  }

  let analysis;
  try {
    analysis = await analyzeChatMessage(victimId, message);
  } catch (err) {
    return fail(res, `Message recorded, but reply generation failed: ${err.message}`, 502);
  }

  const { scoreId } = await recordAiDistressScore(victimId, interactionId, analysis);
  const { alertId } = await applyStressResponse(victimId, scoreId, analysis.riskLevel);

  await supabase.from('chat_messages').insert({ victim_id: victimId, sender: 'ai', body: analysis.reply });
  await writeAuditLog({ victimId, action: 'create', entityType: 'interaction', entityId: interactionId });

  return ok(res, {
    interactionId,
    reply: analysis.reply,
    scoreValue: analysis.scoreValue,
    riskLevel: analysis.riskLevel,
    alertTriggered: alertId !== null,
  }, null, 201);
});

// Chat history for the thread UI - oldest first, matching DistressHistoryScreen's
// existing convention for time-series data.
router.get('/chat', async (req, res) => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('message_id, sender, body, sent_at')
    .eq('victim_id', req.auth.victimId)
    .order('sent_at', { ascending: true });
  if (error) return fail(res, 'Could not load chat history', 500);

  return ok(res, {
    messages: (data || []).map((m) => ({ messageId: m.message_id, sender: m.sender, body: m.body, sentAt: m.sent_at })),
  });
});

// Feature Catalog Section 1.5 SOS - one tap, no AI call (must be fast, must
// not depend on an external API that could be slow/down/rate-limited).
// Deliberately bypasses interactions/distress_scores/alerts entirely - see
// sos_events in schema.sql. Notifies the assigned counsellor if the victim
// has one, otherwise auto-selects (and assigns) the least-loaded counsellor
// in the jurisdiction, same selection logic Critical-tier routing uses
// (services/stressResponse.js).
router.post('/sos', async (req, res) => {
  const victimId = req.auth.victimId;

  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .select('jurisdiction_id, assigned_counsellor_id')
    .eq('victim_id', victimId)
    .single();
  if (victimError || !victim) return fail(res, 'Victim record not found', 404);

  const { data: sosEvent, error: sosError } = await supabase
    .from('sos_events')
    .insert({ victim_id: victimId })
    .select('sos_event_id, triggered_at')
    .single();
  if (sosError) return fail(res, `Could not record SOS: ${sosError.message}`, 500);

  let counsellorId = victim.assigned_counsellor_id;
  if (!counsellorId) {
    counsellorId = await selectLeastLoadedCounsellor(victim.jurisdiction_id);
    if (counsellorId) {
      await supabase.from('victims').update({ assigned_counsellor_id: counsellorId }).eq('victim_id', victimId);
    }
  }

  if (counsellorId) {
    const { error: notifyError } = await supabase
      .from('alert_notifications')
      .insert({ sos_event_id: sosEvent.sos_event_id, official_id: counsellorId, source: 'sos', priority: 'urgent' });
    if (notifyError) {
      console.error('POST /sos: could not write alert_notifications', notifyError.message);
    } else {
      await enqueueAlertDispatch(null, victimId, [counsellorId]);
    }
  } else {
    console.error('POST /sos: no counsellor available to notify', { sosEventId: sosEvent.sos_event_id, victimId });
  }

  await writeAuditLog({ victimId, action: 'create', entityType: 'sos_event', entityId: sosEvent.sos_event_id });

  return ok(res, { sosEventId: sosEvent.sos_event_id, triggeredAt: sosEvent.triggered_at }, 'Emergency alert sent', 201);
});

// Feature Catalog Section 1.3 "IVRS Call" - queues a dispatch, never returns
// a fabricated "call placed" success. The worker (services/dispatchWorker.js)
// drains it and calls Exotel's API if configured; if not, the entry stays
// queued/failed rather than silently pretending to succeed.
router.post('/ivrs/trigger', async (req, res) => {
  const { error } = await supabase.from('dispatch_queue').insert({ kind: 'ivrs_call', victim_id: req.auth.victimId });
  if (error) return fail(res, `Could not queue IVRS call: ${error.message}`, 500);
  return ok(res, null, "We'll call you shortly", 201);
});

// Feature Catalog Section 1.3 "SMS check-in" opt-in toggle.
router.patch('/sms-preference', async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return fail(res, 'enabled (boolean) is required', 400);

  const { error } = await supabase.from('victims').update({ sms_checkin_enabled: enabled }).eq('victim_id', req.auth.victimId);
  if (error) return fail(res, `Could not update SMS preference: ${error.message}`, 500);
  return ok(res, null, 'SMS check-in preference updated');
});

// Feature Catalog Section 1.4 "Opt-in for Manual Counsellor". Opting in now
// assigns a counsellor immediately (via the same automated scoring
// algorithm Critical-risk routing and /sos use), not just on the next
// crisis event - so the WhatsApp/Call redirects below have someone to point
// to right away, matching the actual UX request.
router.patch('/counsellor-preference', async (req, res) => {
  const { optedIn } = req.body;
  if (typeof optedIn !== 'boolean') return fail(res, 'optedIn (boolean) is required', 400);

  const { error } = await supabase.from('victims').update({ opted_for_manual_counsellor: optedIn }).eq('victim_id', req.auth.victimId);
  if (error) return fail(res, `Could not update counsellor preference: ${error.message}`, 500);

  if (optedIn) {
    const { data: victim } = await supabase
      .from('victims')
      .select('jurisdiction_id, assigned_counsellor_id')
      .eq('victim_id', req.auth.victimId)
      .maybeSingle();
    if (victim && !victim.assigned_counsellor_id) {
      const chosenCounsellorId = await selectLeastLoadedCounsellor(victim.jurisdiction_id);
      if (chosenCounsellorId) {
        await supabase.from('victims').update({ assigned_counsellor_id: chosenCounsellorId }).eq('victim_id', req.auth.victimId);
      }
    }
  }

  return ok(res, null, 'Counsellor preference updated');
});

// Section 2.2 "Scheduled counsellings" - the counsellor-side write
// (POST /api/counsellor/cases/:victimId/schedule) had no matching victim-side
// read anywhere, so a scheduled session was invisible to the person it was
// scheduled for. Upcoming only - a completed/cancelled session isn't
// something the victim still needs to "prepare for."
router.get('/counselling-sessions', async (req, res) => {
  const { data, error } = await supabase
    .from('counselling_sessions')
    .select('session_id, counsellor_id, scheduled_at, status, officials(full_name)')
    .eq('victim_id', req.auth.victimId)
    .eq('status', 'upcoming')
    .order('scheduled_at', { ascending: true });
  if (error) return fail(res, 'Could not load scheduled sessions', 500);

  return ok(res, {
    sessions: (data || []).map((s) => ({
      sessionId: s.session_id,
      counsellorName: s.officials?.full_name || null,
      scheduledAt: s.scheduled_at,
      status: s.status,
    })),
  });
});

// Feature Catalog Section 1.4 "Call Counsellor button" / WhatsApp redirect -
// name + phone + WhatsApp number only when opted in AND assigned; the
// frontend renders a tel: link (Call) or a wa.me link (WhatsApp) from this.
// No backend call-routing/VoIP infrastructure implied.
router.get('/assigned-counsellor', async (req, res) => {
  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .select('opted_for_manual_counsellor, assigned_counsellor_id')
    .eq('victim_id', req.auth.victimId)
    .single();
  if (victimError || !victim) return fail(res, 'Victim record not found', 404);

  if (!victim.opted_for_manual_counsellor || !victim.assigned_counsellor_id) {
    return ok(res, { assigned: false, counsellor: null });
  }

  const { data: official } = await supabase
    .from('officials')
    .select('full_name, phone, whatsapp_number')
    .eq('official_id', victim.assigned_counsellor_id)
    .maybeSingle();
  if (!official) return ok(res, { assigned: false, counsellor: null });

  return ok(res, {
    assigned: true,
    counsellor: { fullName: official.full_name, phone: official.phone, whatsappNumber: official.whatsapp_number },
  });
});

// Feature Catalog Section 1.4 "In-app chat with assigned counsellor" - every
// read and write checks opted_for_manual_counsellor AND assigned_counsellor_id
// at the query level, not just hidden in the UI.
async function requireCounsellorOptIn(req, res) {
  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .select('opted_for_manual_counsellor, assigned_counsellor_id')
    .eq('victim_id', req.auth.victimId)
    .single();
  if (victimError || !victim) {
    fail(res, 'Victim record not found', 404);
    return null;
  }
  if (!victim.opted_for_manual_counsellor) {
    fail(res, 'Opt in for a manual counsellor first', 403);
    return null;
  }
  if (!victim.assigned_counsellor_id) {
    // Opt-in now assigns a counsellor immediately if one's available - this
    // only fires when the jurisdiction genuinely has none, not a normal path.
    fail(res, 'No counsellor is available in your jurisdiction right now', 409);
    return null;
  }
  return victim.assigned_counsellor_id;
}

router.get('/messages', async (req, res) => {
  const officialId = await requireCounsellorOptIn(req, res);
  if (!officialId) return;

  const { data, error } = await supabase
    .from('messages')
    .select('message_id, sender_type, body, sent_at')
    .eq('victim_id', req.auth.victimId)
    .eq('official_id', officialId)
    .order('sent_at', { ascending: true });
  if (error) return fail(res, 'Could not load messages', 500);

  return ok(res, {
    messages: (data || []).map((m) => ({ messageId: m.message_id, senderType: m.sender_type, body: m.body, sentAt: m.sent_at })),
  });
});

router.post('/messages', async (req, res) => {
  const officialId = await requireCounsellorOptIn(req, res);
  if (!officialId) return;

  const { body } = req.body;
  if (!body || !body.trim()) return fail(res, 'body is required', 400);

  const { data, error } = await supabase
    .from('messages')
    .insert({ victim_id: req.auth.victimId, official_id: officialId, sender_type: 'victim', body: body.trim() })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send message: ${error.message}`, 500);

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

// Feature Catalog Section 1.6 Wellness & Self-Care - static content, no AI.
router.get('/wellness-suggestions', async (req, res) => {
  const { category } = req.query;
  if (!['exercise', 'meditation', 'music'].includes(category)) {
    return fail(res, 'category must be one of: exercise, meditation, music', 400);
  }

  const { data, error } = await supabase
    .from('wellness_content')
    .select('content_id, title, body, duration_seconds')
    .eq('category', category)
    .order('created_at');
  if (error) return fail(res, 'Could not load wellness suggestions', 500);

  return ok(res, {
    suggestions: (data || []).map((c) => ({ contentId: c.content_id, title: c.title, body: c.body, durationSeconds: c.duration_seconds })),
  });
});

// Feature Catalog Section 1.6 Journal writing - reflection-only signal;
// content is run through Gemini's existing sentiment extraction (reused,
// not duplicated) but deliberately does NOT feed distress_scores/the trend
// line, and never triggers alerts - this is the victim's own private space.
router.get('/journal', async (req, res) => {
  const { page = 1 } = req.query;
  const pageSize = 20;
  const offset = (Number(page) - 1) * pageSize;

  const { data, count, error } = await supabase
    .from('journal_entries')
    .select('entry_id, content, sentiment_score, created_at', { count: 'exact' })
    .eq('victim_id', req.auth.victimId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) return fail(res, 'Could not load journal entries', 500);

  return ok(res, {
    entries: (data || []).map((e) => ({ entryId: e.entry_id, content: e.content, sentimentScore: e.sentiment_score, createdAt: e.created_at })),
    total: count || 0,
  });
});

router.post('/journal', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return fail(res, 'content is required', 400);

  let sentimentScore = null;
  try {
    const analysis = await analyzeInteraction(req.auth.victimId, content);
    sentimentScore = analysis.sentimentRaw;
  } catch (err) {
    // Reflection-only signal - a failed sentiment read must never block the
    // victim from saving their own journal entry.
    console.warn('journal: sentiment analysis failed (non-fatal):', err.message);
  }

  const { data, error } = await supabase
    .from('journal_entries')
    .insert({ victim_id: req.auth.victimId, content: content.trim(), sentiment_score: sentimentScore })
    .select('entry_id, created_at')
    .single();
  if (error) return fail(res, `Could not save journal entry: ${error.message}`, 500);

  return ok(res, { entryId: data.entry_id, createdAt: data.created_at }, 'Journal entry saved', 201);
});

// Screen Inventory (Section 8) shows Consent as its own step after login, before
// the Home Dashboard - extending the API contract to support it, per Section 7's
// own "extend as needed." One row per channel actually consented to.
router.post('/consent', async (req, res) => {
  const victimId = req.auth.victimId;
  const { channel } = req.body;
  if (!channel) return fail(res, 'channel is required', 400);

  const { data: channelRow } = await supabase.from('channels').select('channel_id').eq('channel_name', channel).maybeSingle();
  if (!channelRow) return fail(res, `Unknown channel: ${channel}`, 400);

  const { error } = await supabase.from('consent_records').insert({ victim_id: victimId, channel_id: channelRow.channel_id });
  if (error) return fail(res, 'Could not record consent', 500);

  await writeAuditLog({ victimId, action: 'create', entityType: 'consent_record', entityId: victimId });

  return ok(res, null, 'Consent recorded', 201);
});

// preferred_language was previously only ever set once, at registration -
// no endpoint existed to change it afterward.
router.patch('/language', async (req, res) => {
  const { languageId } = req.body;
  if (!languageId) return fail(res, 'languageId is required', 400);

  const { error } = await supabase.from('victims').update({ preferred_language: languageId }).eq('victim_id', req.auth.victimId);
  if (error) return fail(res, `Could not update language: ${error.message}`, 500);

  return ok(res, null, 'Language updated');
});

router.get('/consent-status', async (req, res) => {
  const { data } = await supabase.from('consent_records').select('consent_id').eq('victim_id', req.auth.victimId).is('revoked_at', null).limit(1);
  return ok(res, { hasConsented: (data || []).length > 0 });
});

router.get('/distress-history', async (req, res) => {
  const victimId = req.auth.victimId;

  const { data: scores, error } = await supabase
    .from('distress_scores')
    .select('score_value, computed_at, risk_levels(name)')
    .eq('victim_id', victimId)
    .order('computed_at', { ascending: true });
  if (error) return fail(res, 'Could not load distress history', 500);

  await writeAuditLog({ victimId, action: 'read', entityType: 'distress_history', entityId: victimId });

  return ok(res, { scores: (scores || []).map((s) => ({ score: s.score_value, riskLevel: s.risk_levels.name, computedAt: s.computed_at })) });
});

module.exports = router;
