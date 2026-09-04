const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { analyzeInteraction, analyzeChatMessage, analyzeInteractionFromClientAi } = require('../../ai/ai');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { generalApiLimiter, userChatLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { recordInteraction, recordAiDistressScore, recordOllamaDistressScore, PipelineError } = require('../../core/services/interactionPipeline');
const { applyStressResponse, selectLeastLoadedCounsellor, notifyWeeklyReview, getJurisdictionIdsForCaseFamily } = require('../../core/services/stressResponse');
const { enqueueAlertDispatch } = require('../../core/services/dispatchWorker');
const { propagateCounsellorAssignment } = require('../services/userProvisioning');
const { generateNextQuestion, predictDistressScore, analyzeChatTranscript } = require('../../ai/ollama');

// Fixed national Police Control Room number - the mobile app dials this
// directly via the device's own phone dialer (Linking.openURL('tel:...'))
// when "Get Help Now" is triggered, rather than routing it through
// dispatch_queue's IVRS path: that path requires real Exotel credentials
// this project doesn't have (services/dispatchWorker.js's placeIvrsCall is
// a disclosed, deliberate stub that always throws "not yet implemented"),
// so a real emergency call must not depend on it.
const PCR_NUMBER = '100';

const router = express.Router();

const NEXT_CHECKIN_CADENCE_DAYS = 7;
// 15 questions/day x 7 days - see the weekly-score trigger in
// POST /questionnaire/submit.
const WEEKLY_CHECKIN_ANSWER_THRESHOLD = 105;
const SUPPORT_LINKS = [
  { label: 'NHAA Helpline', detail: 'Call 14566, 24/7, available in Hindi/English/regional languages' },
];

// Feature improvement: tier-based recommendation shown on Home below the
// distress summary, and a short teaser of check-in prompts shown below the
// "Start Check-in" button - both driven by whichever risk tier the user's
// LATEST distress_scores row landed in, regardless of which channel produced
// it (AI chat, an IVRS call transcript, or the 15-question check-in all
// write to the same table, so this needs no per-channel branching).
const RECOMMENDATION_BY_TIER = {
  Low: () => ({
    message: 'Enjoy Life / Live a Happy Life.',
    detail: 'Suggested: activities that promote a happy and healthy lifestyle.',
    actionType: 'wellness',
  }),
  Moderate: () => ({
    message: 'Exercise / My Well-being activities.',
    detail: 'Recommended: activities that improve your physical and mental well-being.',
    actionType: 'wellness',
  }),
  High: (optedIn) => (optedIn
    ? {
      message: 'Talk to your assigned counsellor.',
      detail: 'A real person is here for you - reach out to your counsellor directly.',
      actionType: 'counsellor_chat',
    }
    : {
      message: 'Consider opting in for counselling support.',
      detail: 'A human counsellor can offer more direct support during a time like this.',
      actionType: 'opt_in_counsellor',
    }),
  Critical: () => ({
    message: 'Please seek professional medical treatment.',
    detail: 'Immediate mental health support is strongly recommended - you are not alone in this.',
    actionType: 'medical',
  }),
};

const CHECKIN_QUESTION_PROMPTS_BY_TIER = {
  Low: ['What made you smile today?', 'What are you grateful for this week?', "What's one small win you had recently?"],
  Moderate: ['How have you been sleeping this week?', "What's been on your mind lately?", 'Is there anything weighing on you right now?'],
  High: ['How are you feeling right now, in this moment?', 'Do you feel safe where you are?', 'Is there someone you trust that you can talk to today?'],
  Critical: ['Are you safe right now?', 'Is someone with you at this moment?', 'Would you like us to connect you with your counsellor immediately?'],
};

function buildRecommendation(riskLevel, optedForManualCounsellor) {
  if (!riskLevel || !RECOMMENDATION_BY_TIER[riskLevel]) return null;
  return {
    riskLevel,
    ...RECOMMENDATION_BY_TIER[riskLevel](optedForManualCounsellor),
    suggestedQuestions: CHECKIN_QUESTION_PROMPTS_BY_TIER[riskLevel],
  };
}

function requireUser(req, res, next) {
  if (!req.auth || req.auth.type !== 'user') return fail(res, 'User account required', 403);
  next();
}

// Every route below uses req.auth.userId (from the verified JWT) - NEVER a
// client-supplied user ID - so a user's own token can only ever act on their
// own record, matching the same "no ID lets you reach outside your own scope"
// property enforced elsewhere via requireJurisdiction.
router.use(verifyToken, requireUser, generalApiLimiter);

router.get('/dashboard', async (req, res) => {
  const userId = req.auth.userId;

  // These 5 reads are all keyed on userId alone - none depends on another's
  // result - but ran one after another, each paying Supabase REST's own
  // ~1-2s round-trip on top of the last. Confirmed live as the cause of the
  // Home screen sitting on its loading skeleton for several seconds; running
  // them concurrently is a straightforward fix (see admin.js's dashboard/
  // heatmap routes for the same pattern applied to their own N+1 loops).
  const [
    { data: user, error: userError },
    { data: identity },
    { data: latestScore },
    { data: openAlerts },
    { data: lastInteraction },
    { data: caseFamily },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('status, case_stage, preferred_language, docket_number, opted_for_manual_counsellor, sms_checkin_enabled, assigned_counsellor_id')
      .eq('user_id', userId)
      .single(),
    supabase.from('user_identity').select('full_name').eq('user_id', userId).maybeSingle(),
    supabase
      .from('distress_scores')
      .select('score_value, risk_level_id, computed_at, risk_levels(name)')
      .eq('user_id', userId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('alerts')
      .select('alert_id, triggered_at, alert_statuses(name)')
      .eq('user_id', userId)
      .order('triggered_at', { ascending: false }),
    supabase
      .from('interactions')
      .select('occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Multi-case support: userId here is always the anchor (see
    // auth.user.routes.js's login), so every row sharing it - including the
    // anchor's own case - is this person's full set of cases.
    supabase
      .from('users')
      .select('user_id, docket_number, case_stage, case_types(name), jurisdictions(name)')
      .or(`user_id.eq.${userId},linked_to_user_id.eq.${userId}`),
  ]);
  if (userError || !user) return fail(res, 'User record not found', 404);

  const linkedCases = (caseFamily || []).map((c) => ({
    userId: c.user_id,
    docketNumber: c.docket_number,
    caseStage: c.case_stage,
    caseType: c.case_types?.name || null,
    jurisdictionName: c.jurisdictions?.name || null,
  }));

  // Red-dot indicator for the "Chat with counsellor" Home tile - a separate
  // follow-up query (not part of the Promise.all above) since it needs
  // user.assigned_counsellor_id, which that batch itself is fetching.
  let hasUnreadCounsellorMessage = false;
  if (user.assigned_counsellor_id) {
    const { count } = await supabase
      .from('messages')
      .select('message_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('official_id', user.assigned_counsellor_id)
      .eq('sender_type', 'official')
      .is('read_at', null);
    hasUnreadCounsellorMessage = (count || 0) > 0;
  }

  // Placeholder cadence rule - there's no scheduler built yet (Section 4.2's
  // "scheduling and dispatch" is a future pass), so this is a real computed date
  // from real data, but not a true dispatch schedule.
  const nextCheckIn = lastInteraction
    ? new Date(new Date(lastInteraction.occurred_at).getTime() + NEXT_CHECKIN_CADENCE_DAYS * 86400000)
    : new Date();

  await writeAuditLog({ userId, action: 'read', entityType: 'user_dashboard', entityId: userId });

  return ok(res, {
    fullName: identity?.full_name || null,
    docketNumber: user.docket_number,
    caseStatus: { status: user.status, caseStage: user.case_stage },
    preferredLanguageId: user.preferred_language,
    optedForManualCounsellor: user.opted_for_manual_counsellor,
    smsCheckinEnabled: user.sms_checkin_enabled,
    hasUnreadCounsellorMessage,
    currentDistressLevel: latestScore
      ? { score: latestScore.score_value, riskLevel: latestScore.risk_levels.name }
      : null,
    recommendation: buildRecommendation(latestScore?.risk_levels?.name || null, user.opted_for_manual_counsellor),
    nextCheckIn,
    alerts: (openAlerts || []).map((a) => ({ alertId: a.alert_id, triggeredAt: a.triggered_at, status: a.alert_statuses.name })),
    supportLinks: SUPPORT_LINKS,
    linkedCases,
  });
});

// Check-in now runs its conversation against a locally-running Ollama instance
// on the user's own device (frontend/src/services/ollamaClient.js), not a
// server-side Gemini call - the client sends the transcript plus its own
// Ollama-derived distress analysis, and this route scores it through the same
// computeDistressScore/alerts/case-note pipeline analyzeInteraction() used to
// feed (see ai/ai.js's analyzeInteractionFromClientAi).
router.post('/checkin', async (req, res) => {
  const userId = req.auth.userId;
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
    ({ interactionId } = await recordInteraction({ userId, channelName: channel, transcriptText: text }));
  } catch (err) {
    if (err instanceof PipelineError) return fail(res, err.message, err.status);
    throw err;
  }

  let analysis;
  try {
    analysis = await analyzeInteractionFromClientAi(userId, text, aiAnalysis);
  } catch (err) {
    return fail(res, `Check-in recorded, but analysis failed: ${err.message}`, 502);
  }

  // analyzeInteractionFromClientAi (ai/ai.js) never calls Gemini - it's pure
  // local math over an already-on-device-Ollama-computed aiAnalysis - but
  // recordAiDistressScore defaults model_version to 'gemini-phase1-v1' when
  // no version is passed, so every real check-in (this is the live path
  // CheckinScreen.js actually calls) was mislabeled as Gemini-sourced. The
  // counsellor-facing "Check-in" label was unaffected (describeScoreSource
  // falls back to the channel name), but the raw model_version column itself
  // was factually wrong for every check-in ever recorded through this route.
  // (The /chat route below genuinely does call Gemini via analyzeChatMessage,
  // so its own recordAiDistressScore call correctly keeps the default.)
  const { scoreId } = await recordAiDistressScore(userId, interactionId, analysis, 'ollama-checkin-client-v1');

  // Feature Catalog Section 1.5 - replaces the old "if High/Critical, create
  // one alert and notify the jurisdiction" logic with the full tiered
  // response (Low no-op, Moderate wellness push, High AI proactive contact,
  // Critical real alert with opt-in-aware routing).
  const { alertId } = await applyStressResponse(userId, scoreId, analysis.riskLevel);

  // Section 2.3 - after a real check-in, save a case note a Counsellor can
  // review/edit. The summary is already AI-authored (by the same Ollama
  // conversation, not a second server-side call) - stored as-is.
  const summary = aiAnalysis.summary.trim();
  try {
    await supabase.from('case_notes').insert({ user_id: userId, official_id: null, note_text: summary, authored_by: 'ai' });
  } catch (err) {
    console.warn('checkin: saving AI case-note summary failed (non-fatal):', err.message);
  }

  await writeAuditLog({ userId, action: 'create', entityType: 'interaction', entityId: interactionId });

  return ok(res, {
    interactionId,
    scoreValue: analysis.scoreValue,
    riskLevel: analysis.riskLevel,
    alertTriggered: alertId !== null,
    summary,
  }, null, 201);
});

router.get('/history', async (req, res) => {
  const { rows } = await pool.query(
    `select note_text from case_notes where user_id = $1 and authored_by = 'ai' order by created_at desc limit 3`,
    [req.auth.userId]
  );
  const historyText = rows.map((n) => n.note_text).join('\n\n');
  return ok(res, { history: historyText });
});

router.post('/interaction/append', async (req, res) => {
  // A fire-and-forget endpoint to save ongoing conversation chunks asynchronously
  const userId = req.auth.userId;
  const { text } = req.body;

  if (!text) return ok(res, { status: 'ignored' });

  // In a full implementation, this would append to a live transcript buffer
  // or a temporary messages table. For now, we simply acknowledge it to
  // unblock the frontend and satisfy the requirement of async background saving.
  return ok(res, { status: 'appended' });
});

// Feature Catalog Section 1.3 "AI Chat" - one message in, one AI reply +
// real distress score out, via the 'Chatbot' channel. userChatLimiter
// (on top of the router-wide generalApiLimiter) protects the Gemini free
// tier's shared 20/day quota from one runaway conversation.
router.post('/chat', userChatLimiter, async (req, res) => {
  const userId = req.auth.userId;
  const { message } = req.body;
  if (typeof message !== 'string' || !message.trim()) return fail(res, 'message is required', 400);

  await supabase.from('chat_messages').insert({ user_id: userId, sender: 'user', body: message.trim() });

  let interactionId;
  try {
    ({ interactionId } = await recordInteraction({ userId, channelName: 'Chatbot', transcriptText: message }));
  } catch (err) {
    if (err instanceof PipelineError) return fail(res, err.message, err.status);
    throw err;
  }

  let analysis;
  try {
    analysis = await analyzeChatMessage(userId, message);
  } catch (err) {
    return fail(res, `Message recorded, but reply generation failed: ${err.message}`, 502);
  }

  const { scoreId } = await recordAiDistressScore(userId, interactionId, analysis);
  const { alertId } = await applyStressResponse(userId, scoreId, analysis.riskLevel);

  await supabase.from('chat_messages').insert({ user_id: userId, sender: 'ai', body: analysis.reply });
  await writeAuditLog({ userId, action: 'create', entityType: 'interaction', entityId: interactionId });

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
  const { rows } = await pool.query(
    `select message_id, sender, body, sent_at from chat_messages where user_id = $1 order by sent_at asc`,
    [req.auth.userId]
  );
  return ok(res, {
    messages: rows.map((m) => ({ messageId: m.message_id, sender: m.sender, body: m.body, sentAt: m.sent_at })),
  });
});

// Feature improvement point 1: the local-Ollama AI chat screen
// (ChatScreen.js) talks to Ollama directly for replies (no per-message round
// trip through the backend, unlike /chat above), so this is purely a
// persistence + scoring endpoint - call it once per exchange (both sides at
// once, including a voice-call turn once the browser's speech recognition
// has already turned it into text) rather than once per keystroke.
//
// No separate "daily score" table: once the running word count crosses
// CHAT_SCORE_WORD_THRESHOLD, this inserts one more ordinary distress_scores
// row (same table every check-in/questionnaire score already lands in), so
// the Counsellor dashboard/case detail/Reports trend chart all pick it up
// with no other change - "most recent score" and "7-day average" already
// read from exactly this table.
const CHAT_SCORE_WORD_THRESHOLD = 5000;
const CHAT_SCORE_LOOKBACK_MESSAGES = 200; // enough recent turns for a meaningful read without scanning the whole history

function countWords(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

router.post('/chat/log', async (req, res) => {
  const userId = req.auth.userId;
  const { userMessage, aiMessage } = req.body;
  if (typeof userMessage !== 'string' || !userMessage.trim()) return fail(res, 'userMessage is required', 400);

  const toInsert = [{ user_id: userId, sender: 'user', body: userMessage.trim() }];
  if (typeof aiMessage === 'string' && aiMessage.trim()) {
    toInsert.push({ user_id: userId, sender: 'ai', body: aiMessage.trim() });
  }
  const { error: insertError } = await supabase.from('chat_messages').insert(toInsert);
  if (insertError) return fail(res, `Could not save chat message: ${insertError.message}`, 500);

  const addedWords = toInsert.reduce((sum, r) => sum + countWords(r.body), 0);
  const { rows: updatedRows } = await pool.query(
    `update users set chat_word_count = chat_word_count + $2 where user_id = $1 returning chat_word_count`,
    [userId, addedWords]
  );
  const wordCount = updatedRows[0]?.chat_word_count ?? addedWords;

  if (wordCount < CHAT_SCORE_WORD_THRESHOLD) {
    return ok(res, { scored: false, wordCount });
  }

  // Threshold crossed - score the recent conversation via Ollama (never
  // Gemini, per how this feature was specced) and reset the counter only on
  // success, so a transient Ollama failure just retries on the next message
  // instead of silently losing the word count that already accrued.
  const { rows: recentMessages } = await pool.query(
    `select sender, body from (
       select sender, body, sent_at from chat_messages where user_id = $1 order by sent_at desc limit $2
     ) recent order by sent_at asc`,
    [userId, CHAT_SCORE_LOOKBACK_MESSAGES]
  );

  let scoreResult;
  try {
    scoreResult = await analyzeChatTranscript(recentMessages);
  } catch (err) {
    return ok(res, { scored: false, wordCount, scoringError: err.message });
  }

  let interactionId;
  try {
    ({ interactionId } = await recordInteraction({
      userId,
      channelName: 'Chatbot',
      transcriptText: recentMessages.map((m) => `${m.sender === 'user' ? 'Person' : 'Mansakha'}: ${m.body}`).join('\n'),
    }));
  } catch (err) {
    return ok(res, { scored: false, wordCount, scoringError: err instanceof PipelineError ? err.message : 'Could not record interaction' });
  }

  const { scoreId, riskLevel } = await recordOllamaDistressScore(userId, interactionId, scoreResult, `ollama-chat-v1`);
  const { alertId } = await applyStressResponse(userId, scoreId, riskLevel);
  await pool.query(`update users set chat_word_count = 0 where user_id = $1`, [userId]);

  return ok(res, { scored: true, wordCount: 0, scoreValue: scoreResult.score, riskLevel, alertTriggered: alertId !== null });
});

// "Get Help Now" - one tap, no AI call (must be fast, must not depend on an
// external API that could be slow/down/rate-limited). Deliberately bypasses
// interactions/distress_scores/alerts entirely - see sos_events in
// schema.sql (source = 'sos' in alert_notifications predates this feature's
// rename, kept rather than a migration for a label). Notifies THREE roles,
// not just the counsellor: the assigned counsellor (or, if none yet,
// whichever counsellor nationwide currently has the lightest caseload - see
// stressResponse.js's selectLeastLoadedCounsellor, which is no longer
// district-scoped), every District Administration official over the user's
// own district, and every State Administration official over that
// district's parent state. The actual call to the Police Control Room
// (100) happens client-side (Linking.openURL('tel:100')) - see PCR_NUMBER's
// comment above for why that can't go through dispatch_queue's IVRS path.
router.post('/urgent-help', async (req, res) => {
  const userId = req.auth.userId;

  // All three independent - the SOS event insert doesn't need anything read
  // from `user`/`identity` first (it only needs userId, already known from
  // the auth token) - running them concurrently instead of one after
  // another matters most exactly here, the single most time-critical action
  // in the app.
  const [
    { data: user, error: userError },
    { data: identity },
    { data: sosEvent, error: sosError },
  ] = await Promise.all([
    supabase.from('users').select('jurisdiction_id, assigned_counsellor_id').eq('user_id', userId).single(),
    supabase.from('user_identity').select('contact_number').eq('user_id', userId).maybeSingle(),
    supabase.from('sos_events').insert({ user_id: userId }).select('sos_event_id, triggered_at').single(),
  ]);
  if (userError || !user) return fail(res, 'User record not found', 404);
  if (sosError) return fail(res, `Could not record urgent-help request: ${sosError.message}`, 500);

  let counsellorId = user.assigned_counsellor_id;
  if (!counsellorId) {
    counsellorId = await selectLeastLoadedCounsellor(user.jurisdiction_id);
    if (counsellorId) {
      // userId is always the anchor (see auth.user.routes.js's login) -
      // propagating (not a single-row update) keeps every other case this
      // person has in sync with the counsellor an SOS just triggered.
      await propagateCounsellorAssignment(userId, { counsellorId });
    }
  }

  // Multi-case support: an SOS is relevant to Administration in every
  // jurisdiction this person has an open case in, not just the case that
  // happened to trigger it (same reasoning/decision as applyStressResponse's
  // Critical-alert routing in stressResponse.js). userId is always the
  // anchor already (see auth.user.routes.js's login).
  const jurisdictionIds = await getJurisdictionIdsForCaseFamily(userId);
  const adminIdSet = new Set();
  // Each jurisdiction's own 3-step walk (district -> parent -> admin roles)
  // is a genuine dependency chain, but a person with several linked cases
  // has several INDEPENDENT jurisdictions to walk - those now run
  // concurrently (Promise.all) instead of one full chain after another,
  // which used to make an SOS - the single most time-critical action in the
  // app - wait out N x 2 sequential PostgREST round trips before ever
  // notifying anyone.
  const adminIdsPerJurisdiction = await Promise.all(jurisdictionIds.map(async (jid) => {
    // Walk the jurisdiction tree up from this district to find its parent
    // state - State Administration is scoped to that state row, not the
    // district itself, so this can't be a simple eq() on jid alone.
    const { data: districtRow } = await supabase.from('jurisdictions').select('parent_id').eq('jurisdiction_id', jid).maybeSingle();
    let stateJurisdictionId = null;
    if (districtRow?.parent_id) {
      const { data: parentRow } = await supabase.from('jurisdictions').select('jurisdiction_id, level').eq('jurisdiction_id', districtRow.parent_id).maybeSingle();
      if (parentRow?.level === 'state') stateJurisdictionId = parentRow.jurisdiction_id;
    }

    const idsToCheck = stateJurisdictionId ? [jid, stateJurisdictionId] : [jid];
    const { data: adminRoles } = await supabase
      .from('official_roles')
      .select('official_id, roles(role_name)')
      .in('jurisdiction_id', idsToCheck)
      .is('revoked_at', null);
    return (adminRoles || []).filter((r) => r.roles?.role_name === 'Administration').map((r) => r.official_id);
  }));
  for (const ids of adminIdsPerJurisdiction) {
    for (const id of ids) adminIdSet.add(id);
  }

  const recipientIds = [...new Set([counsellorId, ...adminIdSet].filter(Boolean))];

  if (recipientIds.length > 0) {
    const { error: notifyError } = await supabase
      .from('alert_notifications')
      .insert(recipientIds.map((officialId) => ({ sos_event_id: sosEvent.sos_event_id, official_id: officialId, source: 'sos', priority: 'urgent' })));
    if (notifyError) {
      console.error('POST /urgent-help: could not write alert_notifications', notifyError.message);
    } else {
      await enqueueAlertDispatch(null, userId, recipientIds);
    }
  } else {
    console.error('POST /urgent-help: no counsellor or admin available to notify', { sosEventId: sosEvent.sos_event_id, userId });
  }

  await writeAuditLog({ userId, action: 'create', entityType: 'sos_event', entityId: sosEvent.sos_event_id });

  return ok(
    res,
    { sosEventId: sosEvent.sos_event_id, triggeredAt: sosEvent.triggered_at, pcrNumber: PCR_NUMBER, contactNumber: identity?.contact_number || null },
    'Help is on the way',
    201
  );
});

// Feature Catalog Section 1.3 "IVRS Call" - queues a dispatch, never returns
// a fabricated "call placed" success. The worker (services/dispatchWorker.js)
// drains it and calls Exotel's API if configured; if not, the entry stays
// queued/failed rather than silently pretending to succeed.
router.post('/ivrs/trigger', async (req, res) => {
  const { error } = await supabase.from('dispatch_queue').insert({ kind: 'ivrs_call', user_id: req.auth.userId });
  if (error) return fail(res, `Could not queue IVRS call: ${error.message}`, 500);
  return ok(res, null, "We'll call you shortly", 201);
});

// Feature Catalog Section 1.3 "SMS check-in" opt-in toggle.
router.patch('/sms-preference', async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return fail(res, 'enabled (boolean) is required', 400);

  const { error } = await supabase.from('users').update({ sms_checkin_enabled: enabled }).eq('user_id', req.auth.userId);
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

  // counsellorId stays undefined (not touched) when opting out, matching the
  // original behavior of never clearing an existing assignment on opt-out -
  // only computed when opting in with no counsellor yet.
  let counsellorId;
  if (optedIn) {
    const { data: user } = await supabase
      .from('users')
      .select('jurisdiction_id, assigned_counsellor_id')
      .eq('user_id', req.auth.userId)
      .maybeSingle();
    if (!user) return fail(res, 'User record not found', 404);
    counsellorId = user.assigned_counsellor_id || await selectLeastLoadedCounsellor(user.jurisdiction_id);
  }

  // req.auth.userId is always the anchor - this propagates the opt-in flag
  // (and, if one was just picked, the counsellor) to every case in the
  // family in one call, on EVERY toggle, not just when a fresh assignment
  // happens to coincide with it (see userProvisioning.js's
  // propagateCounsellorAssignment for why both fields travel together).
  try {
    await propagateCounsellorAssignment(req.auth.userId, { counsellorId, optedForManual: optedIn });
  } catch (err) {
    return fail(res, `Could not update counsellor preference: ${err.message}`, 500);
  }

  let assignedCounsellor = null;
  if (optedIn && counsellorId) {
    const { data: official } = await supabase
      .from('officials')
      .select('full_name, phone, whatsapp_number')
      .eq('official_id', counsellorId)
      .maybeSingle();
    if (official) {
      assignedCounsellor = {
        fullName: official.full_name,
        phone: official.phone,
        whatsappNumber: official.whatsapp_number,
      };
    }
  }

  return ok(res, { assigned: !!assignedCounsellor, counsellor: assignedCounsellor }, 'Counsellor preference updated');
});

// Section 2.2 "Scheduled counsellings" - the counsellor-side write
// (POST /api/counsellor/cases/:userId/schedule) had no matching user-side
// read anywhere, so a scheduled session was invisible to the person it was
// scheduled for. Upcoming only - a completed/cancelled session isn't
// something the user still needs to "prepare for."
router.get('/counselling-sessions', async (req, res) => {
  // `status = 'upcoming'` alone isn't enough - nothing ever flips a session's
  // status once its scheduled time passes, so a session stays "upcoming"
  // forever unless it's also time-filtered here (confirmed live: a session
  // scheduled for a time already in the past was still showing on the Home
  // screen's "Upcoming Session" card). `scheduled_at > now()` is the same
  // check getUserNotifications (routes/me.js) already applies for the
  // notification-bell version of this same data.
  const { rows } = await pool.query(
    `select cs.session_id, cs.scheduled_at, cs.status, o.full_name
     from counselling_sessions cs
     left join officials o on o.official_id = cs.counsellor_id
     where cs.user_id = $1 and cs.status = 'upcoming' and cs.scheduled_at > now()
     order by cs.scheduled_at asc`,
    [req.auth.userId]
  );

  return ok(res, {
    sessions: rows.map((s) => ({
      sessionId: s.session_id,
      counsellorName: s.full_name || null,
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
  const { rows } = await pool.query(
    `select u.opted_for_manual_counsellor, u.assigned_counsellor_id, u.jurisdiction_id, o.full_name, o.phone, o.whatsapp_number
     from users u
     left join officials o on o.official_id = u.assigned_counsellor_id
     where u.user_id = $1`,
    [req.auth.userId]
  );
  const user = rows[0];
  if (!user) return fail(res, 'User record not found', 404);

  if (!user.opted_for_manual_counsellor) {
    return ok(res, { assigned: false, counsellor: null });
  }

  // If opted in but no counsellor is assigned yet, assign immediately!
  let counsellorName = user.full_name;
  let counsellorPhone = user.phone;
  let counsellorWhatsapp = user.whatsapp_number;

  if (!user.assigned_counsellor_id || !counsellorName) {
    const chosenCounsellorId = await selectLeastLoadedCounsellor(user.jurisdiction_id);
    if (chosenCounsellorId) {
      // req.auth.userId is always the anchor - propagates to every case in
      // the family, not just this one.
      await propagateCounsellorAssignment(req.auth.userId, { counsellorId: chosenCounsellorId });
      const { data: official } = await supabase
        .from('officials')
        .select('full_name, phone, whatsapp_number')
        .eq('official_id', chosenCounsellorId)
        .maybeSingle();
      if (official) {
        counsellorName = official.full_name;
        counsellorPhone = official.phone;
        counsellorWhatsapp = official.whatsapp_number;
      }
    }
  }

  if (!counsellorName) {
    return ok(res, { assigned: false, counsellor: null });
  }

  return ok(res, {
    assigned: true,
    counsellor: { fullName: counsellorName, phone: counsellorPhone, whatsappNumber: counsellorWhatsapp },
  });
});

// Feature Catalog Section 1.4 "In-app chat with assigned counsellor" - every
// read and write checks opted_for_manual_counsellor AND assigned_counsellor_id
// at the query level, not just hidden in the UI.
async function requireCounsellorOptIn(req, res) {
  const { rows } = await pool.query(
    'select opted_for_manual_counsellor, assigned_counsellor_id from users where user_id = $1',
    [req.auth.userId]
  );
  const user = rows[0];
  if (!user) {
    fail(res, 'User record not found', 404);
    return null;
  }
  if (!user.opted_for_manual_counsellor) {
    fail(res, 'Opt in for a manual counsellor first', 403);
    return null;
  }
  if (!user.assigned_counsellor_id) {
    // Opt-in now assigns a counsellor immediately if one's available - this
    // only fires when the jurisdiction genuinely has none, not a normal path.
    fail(res, 'No counsellor is available in your jurisdiction right now', 409);
    return null;
  }
  return user.assigned_counsellor_id;
}

// A ping older than this is treated as "stopped typing" - the composer
// pings roughly every 2s while actively typing, so 4s comfortably survives
// one missed/delayed ping without the indicator flickering, while still
// disappearing quickly once the other party actually stops.
const TYPING_ACTIVE_MS = 4000;

// Voice messages: WhatsApp-style - recorded client-side, uploaded as one
// audio file, played back with a duration rather than transcribed. Stored
// in Supabase Storage's private `voice-messages` bucket (not public, unlike
// profile-photos - these are private counsellor<->user conversations), so
// GET below exchanges the stored path for a short-lived signed URL on every
// fetch rather than a permanent public link.
const VOICE_MESSAGE_URL_TTL_SECONDS = 3600;
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB - comfortably covers a few minutes of compressed voice audio
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

router.get('/messages', async (req, res) => {
  const officialId = await requireCounsellorOptIn(req, res);
  if (!officialId) return;

  const { rows: data } = await pool.query(
    `select message_id, sender_type, body, sent_at, message_type, audio_path, duration_seconds from messages where user_id = $1 and official_id = $2 order by sent_at asc`,
    [req.auth.userId, officialId]
  );

  // Opening/polling this thread is what marks the counsellor's messages
  // read - matches ordinary chat-app semantics, no separate "mark read"
  // call needed.
  await pool.query(
    `update messages set read_at = now() where user_id = $1 and official_id = $2 and sender_type = 'official' and read_at is null`,
    [req.auth.userId, officialId]
  );

  const { rows: typingRows } = await pool.query(
    `select updated_at from typing_status where user_id = $1 and official_id = $2 and sender_type = 'official'`,
    [req.auth.userId, officialId]
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

router.post('/messages', async (req, res) => {
  const officialId = await requireCounsellorOptIn(req, res);
  if (!officialId) return;

  const { body } = req.body;
  if (!body || !body.trim()) return fail(res, 'body is required', 400);

  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: req.auth.userId, official_id: officialId, sender_type: 'user', message_type: 'text', body: body.trim() })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send message: ${error.message}`, 500);

  // Sending implies typing has stopped - clears the indicator on the
  // counsellor's side immediately rather than waiting out TYPING_ACTIVE_MS.
  await supabase.from('typing_status').delete().eq('user_id', req.auth.userId).eq('official_id', officialId).eq('sender_type', 'user');

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

router.post('/messages/voice', audioUpload.single('audio'), async (req, res) => {
  const officialId = await requireCounsellorOptIn(req, res);
  if (!officialId) return;
  if (!req.file) return fail(res, 'audio file is required', 400);

  const durationSeconds = Math.max(0, Math.round(Number(req.body.duration) || 0));
  const audioPath = `${req.auth.userId}/${crypto.randomUUID()}.${audioExtensionFromMime(req.file.mimetype)}`;

  const { error: uploadError } = await supabase.storage
    .from('voice-messages')
    .upload(audioPath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return fail(res, `Could not upload voice message: ${uploadError.message}`, 500);

  const { data, error } = await supabase
    .from('messages')
    .insert({ user_id: req.auth.userId, official_id: officialId, sender_type: 'user', message_type: 'voice', audio_path: audioPath, duration_seconds: durationSeconds })
    .select('message_id, sent_at')
    .single();
  if (error) return fail(res, `Could not send voice message: ${error.message}`, 500);

  await supabase.from('typing_status').delete().eq('user_id', req.auth.userId).eq('official_id', officialId).eq('sender_type', 'user');

  return ok(res, { messageId: data.message_id, sentAt: data.sent_at }, null, 201);
});

// Fire-and-forget ping while the user is actively composing a reply -
// upserted (not inserted) since only the most recent "still typing" moment
// matters, not a history of keystrokes.
router.post('/messages/typing', async (req, res) => {
  const officialId = await requireCounsellorOptIn(req, res);
  if (!officialId) return;

  const { error } = await supabase
    .from('typing_status')
    .upsert({ user_id: req.auth.userId, official_id: officialId, sender_type: 'user', updated_at: new Date().toISOString() }, { onConflict: 'user_id,official_id,sender_type' });
  if (error) return fail(res, `Could not update typing status: ${error.message}`, 500);

  return ok(res, null);
});

// Feature Catalog Section 1.6 Wellness & Self-Care - static content, no AI.
router.get('/wellness-suggestions', async (req, res) => {
  const { category } = req.query;
  if (!['exercise', 'meditation', 'music'].includes(category)) {
    return fail(res, 'category must be one of: exercise, meditation, music', 400);
  }

  const { rows: data } = await pool.query(
    `select content_id, title, body, duration_seconds from wellness_content where category = $1 order by created_at`,
    [category]
  );

  // wellness_content.body is jsonb ({text, url?} for exercise/music,
  // {steps:[...]} for meditation - see schema.sql's own comment on the
  // column) - flattened here into plain top-level fields so the frontend
  // never receives an object where it renders a <Text> child (React Native
  // throws "Objects are not valid as a React child" on that).
  return ok(res, {
    suggestions: (data || []).map((c) => {
      const body = c.body || {};
      return {
        contentId: c.content_id,
        title: c.title,
        body: typeof body.text === 'string' ? body.text : null,
        url: typeof body.url === 'string' ? body.url : null,
        steps: Array.isArray(body.steps) ? body.steps : null,
        durationSeconds: c.duration_seconds,
      };
    }),
  });
});

// Feature Catalog Section 1.6 Journal writing - reflection-only signal;
// content is run through Gemini's existing sentiment extraction (reused,
// not duplicated) but deliberately does NOT feed distress_scores/the trend
// line, and never triggers alerts - this is the user's own private space.
// migration_008 added title/updated_at - list now orders by last-edited
// (updated_at desc) instead of created_at, so an edited entry rises back to
// the top, matching idx_journal_entries_user's new column order.
router.get('/journal', async (req, res) => {
  const { page = 1 } = req.query;
  const pageSize = 20;
  const offset = (Number(page) - 1) * pageSize;

  // count(*) over() rides along in the same query instead of a second
  // round trip just to get the total for pagination.
  const { rows } = await pool.query(
    `select entry_id, title, content, sentiment_score, created_at, updated_at, count(*) over() as total_count
     from journal_entries
     where user_id = $1
     order by updated_at desc
     limit $2 offset $3`,
    [req.auth.userId, pageSize, offset]
  );

  return ok(res, {
    entries: rows.map((e) => ({
      entryId: e.entry_id,
      title: e.title,
      content: e.content,
      sentimentScore: e.sentiment_score,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  });
});

router.post('/journal', async (req, res) => {
  const { title, content } = req.body;
  if (!title || !title.trim()) return fail(res, 'title is required', 400);
  if (!content || !content.trim()) return fail(res, 'content is required', 400);

  let sentimentScore = null;
  try {
    const analysis = await analyzeInteraction(req.auth.userId, content);
    sentimentScore = analysis.sentimentRaw;
  } catch (err) {
    // Reflection-only signal - a failed sentiment read must never block the
    // user from saving their own journal entry.
    console.warn('journal: sentiment analysis failed (non-fatal):', err.message);
  }

  const { data, error } = await supabase
    .from('journal_entries')
    .insert({ user_id: req.auth.userId, title: title.trim(), content: content.trim(), sentiment_score: sentimentScore })
    .select('entry_id, created_at, updated_at')
    .single();
  if (error) return fail(res, `Could not save journal entry: ${error.message}`, 500);

  return ok(res, { entryId: data.entry_id, createdAt: data.created_at, updatedAt: data.updated_at }, 'Journal entry saved', 201);
});

// Ownership guard: the .eq('user_id', ...) on both the update and its
// preceding existence check means a user's token can never touch another
// user's entry_id, guessed or not - same property every other route in
// this file relies on req.auth.userId (never a client-supplied user ID)
// for.
router.patch('/journal/:entryId', async (req, res) => {
  const { entryId } = req.params;
  const { title, content } = req.body;
  if (title !== undefined && !title.trim()) return fail(res, 'title cannot be blank', 400);
  if (content !== undefined && !content.trim()) return fail(res, 'content cannot be blank', 400);
  if (title === undefined && content === undefined) return fail(res, 'title or content is required', 400);

  const update = { updated_at: new Date().toISOString() };
  if (title !== undefined) update.title = title.trim();
  if (content !== undefined) update.content = content.trim();
  // sentiment_score is deliberately left untouched on edit, not recomputed -
  // analyzeInteraction() makes a real Gemini call (the same shared free-tier
  // quota /chat's userChatLimiter exists to protect), and re-spending that
  // on every keystroke-driven save of an edited entry isn't worth it for a
  // reflection-only signal that never feeds distress_scores anyway.

  const { data, error } = await supabase
    .from('journal_entries')
    .update(update)
    .eq('entry_id', entryId)
    .eq('user_id', req.auth.userId)
    .select('entry_id, title, content, sentiment_score, created_at, updated_at')
    .maybeSingle();
  if (error) return fail(res, `Could not update journal entry: ${error.message}`, 500);
  if (!data) return fail(res, 'Journal entry not found', 404);

  return ok(res, {
    entryId: data.entry_id,
    title: data.title,
    content: data.content,
    sentimentScore: data.sentiment_score,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }, 'Journal entry updated');
});

router.delete('/journal/:entryId', async (req, res) => {
  const { entryId } = req.params;

  const { data, error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('entry_id', entryId)
    .eq('user_id', req.auth.userId)
    .select('entry_id')
    .maybeSingle();
  if (error) return fail(res, `Could not delete journal entry: ${error.message}`, 500);
  if (!data) return fail(res, 'Journal entry not found', 404);

  return ok(res, null, 'Journal entry deleted');
});

// Screen Inventory (Section 8) shows Consent as its own step after login, before
// the Home Dashboard - extending the API contract to support it, per Section 7's
// own "extend as needed." One row per channel actually consented to.
router.post('/consent', async (req, res) => {
  const userId = req.auth.userId;
  const { channel } = req.body;
  if (!channel) return fail(res, 'channel is required', 400);

  const CHANNEL_ALIASES = {
    'Voice Call': 'IVRS',
    'Voice': 'IVRS',
    'IVRS Call': 'IVRS',
    'Chat': 'Chatbot',
    'Text Chat': 'Chatbot',
    'App': 'Mobile App',
    'Broadcast': 'Emergency Broadcast',
  };
  const resolvedChannelName = CHANNEL_ALIASES[channel] || channel;

  let { data: channelRow } = await supabase
    .from('channels')
    .select('channel_id')
    .or(`channel_name.eq."${resolvedChannelName}",channel_name.eq."${channel}"`)
    .is('deleted_at', null)
    .maybeSingle();

  if (!channelRow) {
    const { data: softDeleted } = await supabase
      .from('channels')
      .select('channel_id')
      .or(`channel_name.eq."${resolvedChannelName}",channel_name.eq."${channel}"`)
      .maybeSingle();

    if (softDeleted) {
      channelRow = softDeleted;
      await supabase.from('channels').update({ deleted_at: null }).eq('channel_id', softDeleted.channel_id);
    }
  }

  if (!channelRow) {
    const { data: inserted, error: insErr } = await supabase
      .from('channels')
      .insert({ channel_name: resolvedChannelName })
      .select('channel_id')
      .single();
    if (!insErr && inserted) {
      channelRow = inserted;
    }
  }

  if (!channelRow) return fail(res, `Unknown channel: ${channel}`, 400);

  const { error } = await supabase.from('consent_records').insert({ user_id: userId, channel_id: channelRow.channel_id });
  if (error) return fail(res, 'Could not record consent', 500);

  await writeAuditLog({ userId, action: 'create', entityType: 'consent_record', entityId: userId });

  return ok(res, null, 'Consent recorded', 201);
});

// preferred_language was previously only ever set once, at registration -
// no endpoint existed to change it afterward.
router.patch('/language', async (req, res) => {
  const { languageId } = req.body;
  if (!languageId) return fail(res, 'languageId is required', 400);

  const { error } = await supabase.from('users').update({ preferred_language: languageId }).eq('user_id', req.auth.userId);
  if (error) return fail(res, `Could not update language: ${error.message}`, 500);

  return ok(res, null, 'Language updated');
});

router.get('/consent-status', async (req, res) => {
  const { rows } = await pool.query(
    'select consent_id from consent_records where user_id = $1 and revoked_at is null limit 1',
    [req.auth.userId]
  );
  return ok(res, { hasConsented: rows.length > 0 });
});

router.get('/distress-history', async (req, res) => {
  const userId = req.auth.userId;

  const { rows: scores } = await pool.query(
    `select ds.score_value, ds.computed_at, rl.name as risk_level_name
     from distress_scores ds
     join risk_levels rl on rl.risk_level_id = ds.risk_level_id
     where ds.user_id = $1
     order by ds.computed_at asc`,
    [userId]
  );

  await writeAuditLog({ userId, action: 'read', entityType: 'distress_history', entityId: userId });

  return ok(res, { scores: scores.map((s) => ({ score: Number(s.score_value), riskLevel: s.risk_level_name, computedAt: s.computed_at })) });
});

router.post('/questionnaire/next', async (req, res) => {
  const { currentQuestionIndex, previousResponses } = req.body;
  if (!Array.isArray(previousResponses)) {
    return fail(res, 'previousResponses must be an array', 400);
  }

  try {
    const nextQuestion = await generateNextQuestion(previousResponses);
    return ok(res, { question: nextQuestion });
  } catch (err) {
    console.error('Ollama generation error:', err);
    return fail(res, 'Failed to generate next question', 500);
  }
});

router.post('/questionnaire/submit', async (req, res) => {
  const userId = req.auth.userId;
  const { allResponses } = req.body;

  if (!Array.isArray(allResponses) || allResponses.length === 0) {
    return fail(res, 'allResponses must be a non-empty array', 400);
  }

  try {
    const { score, summary } = await predictDistressScore(allResponses);

    // Save the questionnaire
    const { data: qData, error: qError } = await supabase
      .from('user_questionnaires')
      .insert({
        user_id: userId,
        responses: allResponses,
        predicted_distress_score: score
      })
      .select('id')
      .single();

    if (qError) throw qError;

    // Record interaction and distress score
    const text = allResponses.map(r => `Q: ${r.q}\nA: ${r.a}`).join('\n\n');
    const { interactionId } = await recordInteraction({ userId, channelName: 'App', transcriptText: text });

    // This score comes from predictDistressScore (Ollama) above, not Gemini -
    // recordOllamaDistressScore is the correct recorder for that (same as the
    // chat-milestone/weekly/IVRS paths right below). This used to go through
    // recordAiDistressScore instead (the Gemini-shaped recorder), which meant
    // every ordinary check-in's score was mislabeled model_version
    // 'gemini-phase1-v1' (the default applied when none is passed), its real
    // AI explanation was silently dropped (that function reads
    // analysis.reason, not analysis.summary - explanation was always null
    // even though a real summary existed), and it wrote 4 fabricated-zero
    // interaction_signals rows indistinguishable from a genuine Gemini
    // reading - for the single most common scoring event in the app.
    const { scoreId, riskLevel } = await recordOllamaDistressScore(userId, interactionId, { score, summary }, 'ollama-checkin-v1');

    const { alertId } = await applyStressResponse(userId, scoreId, riskLevel);

    try {
      await supabase.from('case_notes').insert({ user_id: userId, official_id: null, note_text: summary, authored_by: 'ai' });
    } catch (err) {
      console.warn('checkin: saving AI case-note summary failed (non-fatal):', err.message);
    }

    await writeAuditLog({ userId, action: 'create', entityType: 'interaction', entityId: interactionId });

    // Feature improvement: once this user has answered 105 questions
    // (15/day x 7 days) across their check-ins, score the last 7
    // questionnaires' combined responses as one more distress_scores row -
    // a weekly-scoped reading, not a separate table, so it flows through
    // the exact same dashboard/trend/alert machinery every other score does.
    let weeklyScored = false;
    try {
      const { rows: countRows } = await pool.query(
        `update users set questionnaire_answer_count = questionnaire_answer_count + $2 where user_id = $1 returning questionnaire_answer_count`,
        [userId, allResponses.length]
      );
      const answerCount = countRows[0]?.questionnaire_answer_count ?? allResponses.length;

      if (answerCount >= WEEKLY_CHECKIN_ANSWER_THRESHOLD) {
        const { rows: recentQuestionnaires } = await pool.query(
          `select responses from user_questionnaires where user_id = $1 order by created_at desc limit 7`,
          [userId]
        );
        const weeklyResponses = recentQuestionnaires.flatMap((q) => q.responses || []);
        if (weeklyResponses.length > 0) {
          const weekly = await predictDistressScore(weeklyResponses);
          const { interactionId: weeklyInteractionId } = await recordInteraction({
            userId,
            channelName: 'App',
            transcriptText: weeklyResponses.map((r) => `Q: ${r.q}\nA: ${r.a}`).join('\n\n'),
          });
          const { scoreId: weeklyScoreId, riskLevel: weeklyRiskLevel } = await recordOllamaDistressScore(
            userId, weeklyInteractionId, weekly, 'ollama-checkin-weekly-v1'
          );
          await applyStressResponse(userId, weeklyScoreId, weeklyRiskLevel);
          // Distinct from applyStressResponse above - fires regardless of
          // risk level, so a Moderate weekly review (which applyStressResponse
          // alone would leave completely silent) still reaches the assigned
          // counsellor and district admins as its own notification.
          await notifyWeeklyReview(userId);
          weeklyScored = true;
        }
        await pool.query(`update users set questionnaire_answer_count = 0 where user_id = $1`, [userId]);
      }
    } catch (err) {
      console.warn('checkin: weekly score computation failed (non-fatal):', err.message);
    }

    return ok(res, {
      questionnaireId: qData.id,
      scoreValue: score,
      riskLevel,
      alertTriggered: alertId !== null,
      summary,
      weeklyScored
    }, 'Questionnaire submitted successfully', 201);

  } catch (err) {
    console.error('Questionnaire submit error:', err);
    return fail(res, 'Failed to submit questionnaire', 500);
  }
});

module.exports = router;
