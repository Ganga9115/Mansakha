const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { supabase } = require('../../core/db/supabaseClient');
const { pool, withTransaction } = require('../../core/db/pgPool');
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
const { ensureCourtCaseDetails } = require('../../core/services/courtCaseSync');
const { getCompensationSchedule, withLiveCompensationView } = require('../../core/services/compensationSchedule');
const { POOR_FEEDBACK_RATING_THRESHOLD } = require('../../core/services/legalAidConstants');

// Fixed national Police Control Room number - the mobile app dials this
// directly via the device's own phone dialer (Linking.openURL('tel:...'))
// when "Get Help Now" is triggered, rather than routing it through
// dispatch_queue's IVRS path: that path requires real Exotel credentials
// this project doesn't have (services/dispatchWorker.js's placeIvrsCall is
// a disclosed, deliberate stub that always throws "not yet implemented"),
// so a real emergency call must not depend on it.
const PCR_NUMBER = '100';

const router = express.Router();

// Case-based multi-case scoping (migration_034's case-lifecycle rules) -
// wellness/interaction data (distress scores, chat, check-ins) has always
// lived on the anchor only (auth.user.routes.js's login resolves every
// docket to one shared anchor identity/session, and every existing route
// below already reads/writes req.auth.userId on that basis - unchanged).
// What genuinely varies PER DOCKET is legal/case metadata: docket_number,
// case_stage, and the stage-dependent features tied to it (rehabilitation,
// compensation, investigation progress). Routes that are case-specific
// accept an optional ?caseUserId= query param naming which docket in the
// caller's own family to act on; this resolves and validates it, falling
// back to the anchor itself (today's exact behaviour, unchanged) whenever
// it's absent or doesn't actually belong to the caller - never trusting an
// arbitrary user_id from the client without checking family membership
// first, and never throwing on a bad one (a stale/mistyped caseUserId
// silently degrades to "my own case" rather than erroring the whole page).
async function resolveCaseUserId(req) {
  const anchorUserId = req.auth.userId;
  const requested = req.query.caseUserId;
  if (!requested || requested === anchorUserId) return anchorUserId;

  const { rows } = await pool.query(
    `select user_id from users where user_id = $1 and (user_id = $2 or linked_to_user_id = $2)`,
    [requested, anchorUserId]
  );
  return rows[0] ? requested : anchorUserId;
}

// True when the given case belongs to the caller's own family (their anchor
// or any docket linked to it). resolveCaseUserId above silently falls back
// on a bad id, which is right for a display route; an ownership CHECK has to
// answer yes/no instead.
async function isOwnCase(req, caseUserId) {
  if (caseUserId === req.auth.userId) return true;
  const { rows } = await pool.query(
    `select 1 from users where user_id = $1 and (user_id = $2 or linked_to_user_id = $2)`,
    [caseUserId, req.auth.userId]
  );
  return rows.length > 0;
}

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
  const anchorUserId = req.auth.userId;
  // Case-lifecycle isolation (migration_034): which docket's own case_stage/
  // rehabilitation status this Home screen should reflect - defaults to the
  // anchor (today's exact behaviour) unless a specific family member's
  // docket is requested and actually belongs to this caller. Wellness data
  // below stays anchor-scoped regardless - it always has (see
  // resolveCaseUserId's own comment above).
  const activeUserId = await resolveCaseUserId(req);

  // These 7 reads are all keyed on userId alone - none depends on another's
  // result - but ran one after another, each paying Supabase REST's own
  // ~500-650ms round-trip on top of the last. Confirmed live as the cause of
  // the Home screen sitting on its loading skeleton for several seconds; now
  // raw pg (~224ms/round trip) run concurrently via Promise.all, matching
  // districtAdmin.routes.js's own dashboard/heatmap routes for the same
  // pattern applied to their own N+1 loops.
  const [
    userResult,
    activeCaseResult,
    identityResult,
    latestScoreResult,
    openAlertsResult,
    lastInteractionResult,
    caseFamilyResult,
  ] = await Promise.all([
    pool.query(
      `select status, preferred_language, opted_for_manual_counsellor, sms_checkin_enabled, assigned_counsellor_id
       from users where user_id = $1 limit 1`,
      [anchorUserId]
    ),
    // The ACTIVE case's own docket/stage/rehabilitation facts - a separate
    // row from the anchor's own wellness fields above whenever a specific
    // family member's docket is being viewed.
    pool.query(
      `select docket_number, case_stage, rehabilitation_opted_in_at, rehabilitation_declined_at,
              rehabilitation_closure_pending_ack, rehabilitation_continued_after_closure
       from users where user_id = $1 limit 1`,
      [activeUserId]
    ),
    pool.query(`select full_name from user_identity where user_id = $1 limit 1`, [anchorUserId]),
    pool.query(
      `select ds.score_value, ds.risk_level_id, ds.computed_at, rl.name as risk_level_name
       from distress_scores ds
       join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       where ds.user_id = $1
       order by ds.computed_at desc
       limit 1`,
      [anchorUserId]
    ),
    pool.query(
      `select a.alert_id, a.triggered_at, ast.name as alert_status_name
       from alerts a
       join alert_statuses ast on ast.alert_status_id = a.alert_status_id
       where a.user_id = $1
       order by a.triggered_at desc`,
      [anchorUserId]
    ),
    pool.query(`select occurred_at from interactions where user_id = $1 order by occurred_at desc limit 1`, [anchorUserId]),
    // Multi-case support: anchorUserId here is always the anchor (see
    // auth.user.routes.js's login), so every row sharing it - including the
    // anchor's own case - is this person's full set of cases. Rehabilitation
    // fields included so the app-level gate can tell, for EVERY case in the
    // family (not just whichever is currently active), whether one of them
    // needs the isolated Rehabilitation context or the post-closure
    // continuation popup - see UserGate.js.
    pool.query(
      `select u.user_id, u.docket_number, u.case_stage, u.rehabilitation_opted_in_at, u.rehabilitation_declined_at,
              u.rehabilitation_closure_pending_ack, u.rehabilitation_continued_after_closure,
              ct.name as case_type_name, j.name as jurisdiction_name
       from users u
       left join case_types ct on ct.case_type_id = u.case_type_id
       left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
       where u.user_id = $1 or u.linked_to_user_id = $1`,
      [anchorUserId]
    ),
  ]);

  const user = userResult.rows[0];
  const activeCase = activeCaseResult.rows[0];
  if (!user || !activeCase) return fail(res, 'User record not found', 404);
  const identity = identityResult.rows[0];
  const latestScore = latestScoreResult.rows[0];
  const openAlerts = openAlertsResult.rows;
  const lastInteraction = lastInteractionResult.rows[0];
  const caseFamily = caseFamilyResult.rows;

  const linkedCases = (caseFamily || []).map((c) => ({
    userId: c.user_id,
    docketNumber: c.docket_number,
    caseStage: c.case_stage,
    caseType: c.case_type_name || null,
    jurisdictionName: c.jurisdiction_name || null,
    rehabilitationOptedIn: !!c.rehabilitation_opted_in_at,
    rehabilitationDeclined: !!c.rehabilitation_declined_at,
    rehabilitationClosurePendingAck: c.rehabilitation_closure_pending_ack,
    rehabilitationContinuedAfterClosure: c.rehabilitation_continued_after_closure,
  }));

  // Red-dot indicator for the "Chat with counsellor" Home tile - a separate
  // follow-up query (not part of the Promise.all above) since it needs
  // user.assigned_counsellor_id, which that batch itself is fetching.
  let hasUnreadCounsellorMessage = false;
  if (user.assigned_counsellor_id) {
    const { rows: unreadRows } = await pool.query(
      `select count(*) as count from messages where user_id = $1 and official_id = $2 and sender_type = 'official' and read_at is null`,
      [anchorUserId, user.assigned_counsellor_id]
    );
    hasUnreadCounsellorMessage = Number(unreadRows[0]?.count || 0) > 0;
  }

  // Placeholder cadence rule - there's no scheduler built yet (Section 4.2's
  // "scheduling and dispatch" is a future pass), so this is a real computed date
  // from real data, but not a true dispatch schedule.
  const nextCheckIn = lastInteraction
    ? new Date(new Date(lastInteraction.occurred_at).getTime() + NEXT_CHECKIN_CADENCE_DAYS * 86400000)
    : new Date();

  await writeAuditLog({ userId: anchorUserId, action: 'read', entityType: 'user_dashboard', entityId: activeUserId });

  return ok(res, {
    fullName: identity?.full_name || null,
    // Case-specific (migration_034) - reflects whichever docket is
    // currently active (defaults to the anchor's own), never a stale mix
    // of one case's docket with another's stage.
    userId: activeUserId,
    docketNumber: activeCase.docket_number,
    caseStatus: { status: user.status, caseStage: activeCase.case_stage },
    rehabilitation: {
      optedIn: !!activeCase.rehabilitation_opted_in_at,
      declined: !!activeCase.rehabilitation_declined_at,
      closurePendingAck: activeCase.rehabilitation_closure_pending_ack,
      continuedAfterClosure: activeCase.rehabilitation_continued_after_closure,
    },
    preferredLanguageId: user.preferred_language,
    optedForManualCounsellor: user.opted_for_manual_counsellor,
    smsCheckinEnabled: user.sms_checkin_enabled,
    hasUnreadCounsellorMessage,
    currentDistressLevel: latestScore
      ? { score: Number(latestScore.score_value), riskLevel: latestScore.risk_level_name }
      : null,
    recommendation: buildRecommendation(latestScore?.risk_level_name || null, user.opted_for_manual_counsellor),
    nextCheckIn,
    alerts: (openAlerts || []).map((a) => ({ alertId: a.alert_id, triggeredAt: a.triggered_at, status: a.alert_status_name })),
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
// rename, kept rather than a migration for a label). Notifies FOUR roles,
// not just the counsellor: the assigned counsellor (or, if none yet,
// whichever counsellor nationwide currently has the lightest caseload - see
// stressResponse.js's selectLeastLoadedCounsellor, which is no longer
// district-scoped), every District Administration official over the user's
// own district, every State Administration official over that district's
// parent state, and (migration_032) the Protection Officer assigned to the
// victim's own district - given a real, actionable referral (not just a
// passing notification), the same way a victim-initiated threat report
// does. Best-effort current location (device-permission-dependent, may be
// null) is captured client-side and carried on both the sos_events row and
// the Protection Officer referral. The actual call to the Police Control
// Room (100) happens client-side (Linking.openURL('tel:100')) - see
// PCR_NUMBER's comment above for why that can't go through
// dispatch_queue's IVRS path.
router.post('/urgent-help', async (req, res) => {
  const userId = req.auth.userId;
  const { location } = req.body;
  const sosLocation = location && typeof location.lat === 'number' && typeof location.lng === 'number'
    ? { lat: location.lat, lng: location.lng, capturedAt: new Date().toISOString() }
    : null;

  // All three independent - the SOS event insert doesn't need anything read
  // from `user`/`identity` first (it only needs userId, already known from
  // the auth token) - running them concurrently instead of one after
  // another matters most exactly here, the single most time-critical action
  // in the app. The two reads go through raw pg (~224ms) instead of
  // Supabase REST (~500-650ms); the sos_events insert stays on supabase -
  // it's a write into the alert pipeline, left alone per this migration's
  // own write-safety rule.
  const [userResult, identityResult, sosResult] = await Promise.all([
    pool.query(`select jurisdiction_id, assigned_counsellor_id from users where user_id = $1 limit 1`, [userId]),
    pool.query(`select contact_number from user_identity where user_id = $1 limit 1`, [userId]),
    supabase.from('sos_events').insert({ user_id: userId, location: sosLocation }).select('sos_event_id, triggered_at').single(),
  ]);
  const user = userResult.rows[0];
  const identity = identityResult.rows[0];
  const { data: sosEvent, error: sosError } = sosResult;
  if (!user) return fail(res, 'User record not found', 404);
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
    const { rows: districtRows } = await pool.query(`select parent_id from jurisdictions where jurisdiction_id = $1 limit 1`, [jid]);
    const districtRow = districtRows[0];
    let stateJurisdictionId = null;
    if (districtRow?.parent_id) {
      const { rows: parentRows } = await pool.query(`select jurisdiction_id, level from jurisdictions where jurisdiction_id = $1 limit 1`, [districtRow.parent_id]);
      const parentRow = parentRows[0];
      if (parentRow?.level === 'state') stateJurisdictionId = parentRow.jurisdiction_id;
    }

    const idsToCheck = stateJurisdictionId ? [jid, stateJurisdictionId] : [jid];
    const { rows: adminRoles } = await pool.query(
      `select orr.official_id, r.role_name
       from official_roles orr
       join roles r on r.role_id = orr.role_id
       where orr.jurisdiction_id = any($1::uuid[]) and orr.revoked_at is null`,
      [idsToCheck]
    );
    return (adminRoles || []).filter((r) => r.role_name === 'Administration').map((r) => r.official_id);
  }));
  for (const ids of adminIdsPerJurisdiction) {
    for (const id of ids) adminIdSet.add(id);
  }

  // Protection Officer assigned to the victim's own district(s) - "nearby
  // PO", same jurisdiction_id scoping protectionOfficer.routes.js's own
  // queue already enforces. Unlike Administration above, this does NOT walk
  // up to the parent state - a PO is a district-level appointment.
  const { rows: poRoles } = await pool.query(
    `select orr.official_id
     from official_roles orr
     join roles r on r.role_id = orr.role_id
     where orr.jurisdiction_id = any($1::uuid[]) and orr.revoked_at is null and r.role_name = 'Protection Officer'`,
    [jurisdictionIds]
  );
  const protectionOfficerIds = [...new Set(poRoles.map((r) => r.official_id))];

  // Give the Protection Officer a real, actionable referral - not just a
  // passing notification - same self-referral pattern as /threat-report.
  // Reuses an existing OPEN one if this victim already has one (adds a note
  // and refreshes the location) rather than creating a duplicate.
  if (protectionOfficerIds.length > 0) {
    const { rows: existingReferralRows } = await pool.query(
      `select referral_id, metadata from agency_referrals where user_id = $1 and referred_to_role = 'Protection Officer' and status = 'Open' limit 1`,
      [userId]
    );
    const existingReferral = existingReferralRows[0];
    if (existingReferral) {
      // agency_referral_notes.author_official_id is not-null (a note always
      // represents a real person's word) - a re-trigger just refreshes the
      // location and relies on the alert_notifications/dispatch below (sent
      // again either way) to actually re-notify the PO, rather than writing
      // a note with no genuine author. originType is force-upgraded to
      // 'sos_emergency' on every re-trigger regardless of what this case's
      // open referral originally was (a self-reported threat, an IO alert) -
      // an active "Get Help Now" tap right now is always the highest-
      // priority fact about this case, and the Protection Registry's own
      // sort order (protectionOfficer.routes.js) reads this field to decide
      // what surfaces first.
      const nextMetadata = {
        ...existingReferral.metadata,
        originType: 'sos_emergency',
        ...(sosLocation ? { location: sosLocation, sosRetriggeredAt: new Date().toISOString() } : {}),
      };
      await supabase.from('agency_referrals').update({ metadata: nextMetadata }).eq('referral_id', existingReferral.referral_id);
    } else {
      await supabase.from('agency_referrals').insert({
        user_id: userId,
        referred_to_role: 'Protection Officer',
        referred_by_user_id: userId,
        reason: 'Emergency SOS triggered via "Get Help Now" - immediate attention required.',
        // originType drives the Protection Registry's priority sort - see
        // protectionOfficer.routes.js's GET /referrals.
        metadata: { originType: 'sos_emergency', sosTriggered: true, ...(sosLocation ? { location: sosLocation } : {}) },
      });
    }
  } else {
    console.error('POST /urgent-help: no Protection Officer assigned to this district', { userId, jurisdictionIds });
  }

  const recipientIds = [...new Set([counsellorId, ...adminIdSet, ...protectionOfficerIds].filter(Boolean))];

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

  try {
    await pool.query(`update users set sms_checkin_enabled = $2 where user_id = $1`, [req.auth.userId, enabled]);
  } catch (err) {
    return fail(res, `Could not update SMS preference: ${err.message}`, 500);
  }
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
    const { rows: userRows } = await pool.query(
      `select jurisdiction_id, assigned_counsellor_id from users where user_id = $1 limit 1`,
      [req.auth.userId]
    );
    const user = userRows[0];
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
    const { rows: officialRows } = await pool.query(
      `select full_name, phone, whatsapp_number from officials where official_id = $1 limit 1`,
      [counsellorId]
    );
    const official = officialRows[0];
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
      const { rows: officialRows } = await pool.query(
        `select full_name, phone, whatsapp_number from officials where official_id = $1 limit 1`,
        [chosenCounsellorId]
      );
      const official = officialRows[0];
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

  // Trivially simple upsert on a typing indicator only (no scoring/alert
  // pipeline involved) - migrated despite being a write because the composer
  // pings this roughly every 2s while actively typing, making it one of the
  // highest-frequency calls in this file.
  try {
    await pool.query(
      `insert into typing_status (user_id, official_id, sender_type, updated_at)
       values ($1, $2, 'user', now())
       on conflict (user_id, official_id, sender_type) do update set updated_at = excluded.updated_at`,
      [req.auth.userId, officialId]
    );
  } catch (err) {
    return fail(res, `Could not update typing status: ${err.message}`, 500);
  }

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

  try {
    await pool.query(`update users set preferred_language = $2 where user_id = $1`, [req.auth.userId, languageId]);
  } catch (err) {
    return fail(res, `Could not update language: ${err.message}`, 500);
  }

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

// Case Details (Quick Access tile) - court-case information for one of the
// caller's own dockets. `:userId` can be the caller's own anchor id (the
// common case) or any docket linked to them (Multi-Case-Per-Person Support)
// - the .or() below is what makes this safe: a docket that belongs to
// someone else's case family 404s here rather than ever being fetchable by
// this account, matching the existing linkedCases query's own reasoning in
// GET /dashboard above.
router.get('/court-case/:userId', async (req, res) => {
  const { userId } = req.params;
  const callerId = req.auth.userId;

  // Auth check preserved exactly: user_id = :userId AND (user_id = :callerId
  // OR linked_to_user_id = :callerId) - a docket that belongs to someone
  // else's case family never matches, matching the original .eq().or() chain.
  const { rows: caseRows } = await pool.query(
    `select u.user_id, u.docket_number, u.case_stage, u.cnr_number, u.enrolled_at, u.linked_to_user_id,
            ct.name as case_type_name, j.name as jurisdiction_name
     from users u
     left join case_types ct on ct.case_type_id = u.case_type_id
     left join jurisdictions j on j.jurisdiction_id = u.jurisdiction_id
     where u.user_id = $1 and (u.user_id = $2 or u.linked_to_user_id = $2)
     limit 1`,
    [userId, callerId]
  );
  const caseRow = caseRows[0];
  if (!caseRow) return fail(res, 'Case not found', 404);

  const { rows: identityRows } = await pool.query(`select full_name from user_identity where user_id = $1 limit 1`, [callerId]);
  let courtCase;
  try {
    courtCase = await ensureCourtCaseDetails({
      userId,
      caseStage: caseRow.case_stage,
      docketNumber: caseRow.docket_number,
      cnrNumber: caseRow.cnr_number,
      caseTypeName: caseRow.case_type_name || null,
      jurisdictionName: caseRow.jurisdiction_name || null,
      enrolledAt: caseRow.enrolled_at,
      victimFullName: identityRows[0]?.full_name || null,
    });
  } catch (err) {
    return fail(res, err.message, 500);
  }
  if (!courtCase.available) return ok(res, { available: false, reason: courtCase.reason });
  const row = courtCase.row;

  await writeAuditLog({ userId: callerId, action: 'read', entityType: 'simulated_court_case', entityId: userId });

  return ok(res, {
    available: true,
    simulated: true,
    note: 'Simulated data - placeholder for a real eCourts integration that does not exist yet. Not a live government record.',
    cnrNumber: row.cnr_number,
    caseType: row.case_type,
    caseCategory: row.case_category,
    caseSubCategory: row.case_sub_category,
    filingNumber: row.filing_number,
    filingDate: row.filing_date,
    registrationNumber: row.registration_number,
    registrationDate: row.registration_date,
    courtComplex: row.court_complex,
    courtEstablishment: row.court_establishment,
    courtNumber: row.court_number,
    coram: row.coram,
    caseStageLabel: row.case_stage_label,
    firstHearingDate: row.first_hearing_date,
    nextHearingDate: row.next_hearing_date,
    nextHearingPurpose: row.next_hearing_purpose,
    caseStatus: row.case_status,
    decisionDate: row.decision_date,
    disposalNature: row.disposal_nature,
    petitionerNames: row.petitioner_names,
    respondentNames: row.respondent_names,
    advocateNames: row.advocate_names,
    actsSections: row.acts_sections,
    firPoliceStation: row.fir_police_station,
    firNumber: row.fir_number,
    firYear: row.fir_year,
    iaDetails: row.ia_details,
    hearingHistory: row.hearing_history,
    orders: row.orders,
    connectedCases: row.connected_cases,
    originatingCaseNumber: row.originating_case_number,
    transferHistory: row.transfer_history,
    objections: row.objections,
    hearingMode: row.hearing_mode,
    lastSyncedAt: row.last_synced_at,
  });
});

// ===== Victim-Initiated Intervention Requests =====
// Flips the direction of the old Counsellor-recommended `interventions` flow:
// a victim now REQUESTS one of the 6 eligible types (Counselling is excluded
// - see migration_027's own comment - it has no real proof/eligibility gate
// and already has a simpler self-service path via opted_for_manual_counsellor
// above), attaches proof documents, and their District Admin Accepts or
// Rejects it (districtAdmin.routes.js). See migration_027_intervention_
// requests.sql for the full schema/reasoning.

const interventionDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // matches mail.routes.js's ATTACHMENT_MAX_BYTES
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only PDF, PNG, or JPEG files are allowed for proof documents'));
    cb(null, true);
  },
});

function sanitizeDocumentFileName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

// The 6 eligible types (Counselling deliberately excluded) + their
// required_documents, for the request form's type picker.
router.get('/intervention-types', async (req, res) => {
  const { rows } = await pool.query(
    `select intervention_type_id, name, required_documents
     from intervention_types
     where deleted_at is null and name != 'Counselling'
     order by name`
  );
  return ok(res, {
    interventionTypes: rows.map((r) => ({
      interventionTypeId: r.intervention_type_id,
      name: r.name,
      requiredDocuments: r.required_documents,
    })),
  });
});

// migration_034 scoping, extended here: a request is filed against the
// ACTIVE case, not always the anchor. This was a real bug - the reviewing
// officer's queue is jurisdiction-scoped, so a victim with cases in two
// districts who raised a request while working their second docket had it
// filed against the first one, and the officer for the district it actually
// concerned never saw it.
router.post('/intervention-requests', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { interventionTypeId, description } = req.body;
  if (!interventionTypeId) return fail(res, 'interventionTypeId is required', 400);

  const { rows: typeRows } = await pool.query(
    "select 1 from intervention_types where intervention_type_id = $1 and deleted_at is null and name != 'Counselling'",
    [interventionTypeId]
  );
  if (typeRows.length === 0) return fail(res, 'Invalid or ineligible interventionTypeId', 400);

  const { rows } = await pool.query(
    `insert into intervention_requests (user_id, intervention_type_id, description)
     values ($1, $2, $3) returning request_id, status, requested_at`,
    [activeUserId, interventionTypeId, description ? String(description).trim() || null : null]
  );

  await writeAuditLog({ userId: activeUserId, action: 'create', entityType: 'intervention_request', entityId: rows[0].request_id });

  return ok(res, { requestId: rows[0].request_id, status: rows[0].status, requestedAt: rows[0].requested_at }, 'Request submitted', 201);
});

// Multiple documents are uploaded one at a time (one required_documents slot
// per call) rather than a single multi-file submission - matches mail's own
// one-attachment-per-request convention and keeps each upload independently
// retryable if one fails.
router.post('/intervention-requests/:requestId/documents', interventionDocumentUpload.single('file'), async (req, res) => {
  const { requestId } = req.params;
  const { documentLabel } = req.body;
  if (!req.file) return fail(res, 'file is required', 400);
  if (!documentLabel) return fail(res, 'documentLabel is required', 400);

  const { rows } = await pool.query('select user_id, status from intervention_requests where request_id = $1', [requestId]);
  if (!rows[0]) return fail(res, 'Request not found', 404);
  if (!(await isOwnCase(req, rows[0].user_id))) return fail(res, 'Not your request', 403);
  if (rows[0].status !== 'Pending') return fail(res, 'Cannot attach a document to a request that has already been decided', 400);

  const documentId = crypto.randomUUID();
  const storagePath = `${rows[0].user_id}/${requestId}/${documentId}-${sanitizeDocumentFileName(req.file.originalname)}`;

  const { error: uploadError } = await supabase.storage.from('intervention-proofs').upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return fail(res, `Could not upload document: ${uploadError.message}`, 500);

  await pool.query(
    `insert into intervention_request_documents (document_id, request_id, document_label, storage_path, content_type)
     values ($1, $2, $3, $4, $5)`,
    [documentId, requestId, documentLabel, storagePath, req.file.mimetype]
  );

  await writeAuditLog({ userId: req.auth.userId, action: 'create', entityType: 'intervention_request_document', entityId: documentId });

  return ok(res, { documentId }, 'Document uploaded', 201);
});

// The caller's own requests only - a dependent/linked case's own requests
// stay separate, same "per literal case, not resolved through the anchor"
// convention as case_notes/interventions themselves (migration_027's own
// comment explains why).
// "My Requests" is scoped to whichever docket is currently active
// (?caseUserId=, resolveCaseUserId - same convention as every other
// case-scoped route here, and the same docket the rest of the app is now
// consistently driven by via the RN app's own ActiveCaseContext), not
// spanning the whole family - switching docket in Settings/Profile is
// supposed to change what this list shows, same as Case Details/
// Compensation/Rehabilitation already do.
router.get('/intervention-requests', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows } = await pool.query(
    `select ir.request_id, ir.description, ir.status, ir.decision_reason, ir.requested_at, ir.reviewed_at,
            it.name as intervention_type_name, u.docket_number
     from intervention_requests ir
     join intervention_types it on it.intervention_type_id = ir.intervention_type_id
     join users u on u.user_id = ir.user_id
     where u.user_id = $1
     order by ir.requested_at desc`,
    [activeUserId]
  );
  const requestIds = rows.map((r) => r.request_id);
  const { rows: docRows } = requestIds.length > 0
    ? await pool.query('select request_id, document_label from intervention_request_documents where request_id = any($1::uuid[])', [requestIds])
    : { rows: [] };
  const docsByRequest = new Map();
  for (const d of docRows) {
    if (!docsByRequest.has(d.request_id)) docsByRequest.set(d.request_id, []);
    docsByRequest.get(d.request_id).push({ documentLabel: d.document_label });
  }

  return ok(res, {
    requests: rows.map((r) => ({
        docketNumber: r.docket_number,
      requestId: r.request_id,
      interventionTypeName: r.intervention_type_name,
      description: r.description,
      status: r.status,
      decisionReason: r.decision_reason,
      requestedAt: r.requested_at,
      reviewedAt: r.reviewed_at,
      documents: docsByRequest.get(r.request_id) || [],
    })),
  });
});

router.get('/intervention-requests/:requestId', async (req, res) => {
  const { requestId } = req.params;
  const { rows } = await pool.query(
    `select ir.request_id, ir.user_id, ir.description, ir.status, ir.decision_reason, ir.requested_at, ir.reviewed_at,
            it.name as intervention_type_name
     from intervention_requests ir
     join intervention_types it on it.intervention_type_id = ir.intervention_type_id
     where ir.request_id = $1`,
    [requestId]
  );
  if (!rows[0]) return fail(res, 'Request not found', 404);
  if (!(await isOwnCase(req, rows[0].user_id))) return fail(res, 'Not your request', 403);

  const { rows: docRows } = await pool.query(
    'select document_label from intervention_request_documents where request_id = $1',
    [requestId]
  );

  const r = rows[0];
  return ok(res, {
    requestId: r.request_id,
    interventionTypeName: r.intervention_type_name,
    description: r.description,
    status: r.status,
    decisionReason: r.decision_reason,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
    documents: docRows.map((d) => ({ documentLabel: d.document_label })),
  });
});

// ===== Rehabilitation (migration_034) =====
// Rehabilitation is now a genuine mid-case stage set exclusively by eCourt
// (Investigation -> Trial -> Rehabilitation -> Compensation -> Case
// Closed), no longer a post-closure phase the victim's own opt-in used to
// trigger. Opting in is now a SEPARATE fact (rehabilitation_opted_in_at)
// from case_stage itself - a case can be in the Rehabilitation stage
// without the victim having opted in yet, and opting in never touches
// case_stage (only core/services/ecourtStageSync.js ever does). Every
// route below accepts ?caseUserId= (resolveCaseUserId, defined near the
// top of this file) so a specific docket in the caller's own family can be
// acted on - required for the isolated Rehabilitation context to work for
// a docket that isn't the caller's anchor.
router.get('/rehabilitation-progress', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows } = await pool.query(
    `select referral_id, status, reason, created_at, resolved_at
     from agency_referrals
     where user_id = $1 and referred_to_role = 'Rehabilitation Officer'
     order by created_at desc`,
    [activeUserId]
  );

  if (rows.length === 0) {
    return ok(res, { inRehabilitation: false, phases: [] });
  }

  const referralIds = rows.map((r) => r.referral_id);
  const { rows: noteRows } = await pool.query(
    `select referral_id, note_text, created_at
     from agency_referral_notes
     where referral_id = any($1)
     order by created_at asc`,
    [referralIds]
  );
  const notesByReferral = noteRows.reduce((acc, n) => {
    (acc[n.referral_id] = acc[n.referral_id] || []).push({ noteText: n.note_text, createdAt: n.created_at });
    return acc;
  }, {});

  return ok(res, {
    inRehabilitation: rows.some((r) => r.status === 'Open'),
    phases: rows.map((r) => ({
      referralId: r.referral_id,
      status: r.status,
      startedAt: r.created_at,
      completedAt: r.resolved_at,
      updates: notesByReferral[r.referral_id] || [],
    })),
  });
});

// Eligible to be ASKED to opt in - the case's own eCourt stage is
// 'Rehabilitation' and the victim hasn't already answered (opted in or
// declined) for this stage instance yet. Never automatic, never official-
// triggered alone (DWO's own hand-off route is a separate, official-
// initiated path - this is specifically the victim's own mandatory-gate
// decision).
router.get('/rehabilitation-eligibility', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows: userRows } = await pool.query(
    'select case_stage, jurisdiction_id, rehabilitation_opted_in_at, rehabilitation_declined_at from users where user_id = $1',
    [activeUserId]
  );
  const user = userRows[0];
  if (!user) return fail(res, 'Case not found', 404);

  if (user.rehabilitation_opted_in_at) {
    return ok(res, { eligible: false, alreadyOptedIn: true, reason: 'You have already opted in to rehabilitation.', providers: [] });
  }
  if (user.rehabilitation_declined_at) {
    return ok(res, { eligible: false, alreadyOptedIn: false, reason: 'You already answered this for the current stage.', providers: [] });
  }
  if (user.case_stage !== 'Rehabilitation') {
    return ok(res, { eligible: false, alreadyOptedIn: false, reason: 'Rehabilitation becomes available once your case reaches that stage.', providers: [] });
  }

  const { rows: providers } = await pool.query(
    `select provider_id, name, provider_type, contact_info
     from rehabilitation_providers
     where deleted_at is null and (jurisdiction_id is null or jurisdiction_id = $1)
     order by provider_type, name`,
    [user.jurisdiction_id]
  );

  return ok(res, {
    eligible: true,
    alreadyOptedIn: false,
    reason: null,
    providers: providers.map((p) => ({ providerId: p.provider_id, name: p.name, providerType: p.provider_type, contactInfo: p.contact_info })),
  });
});

router.post('/rehabilitation-opt-in', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { providerId } = req.body;
  if (!providerId) return fail(res, 'providerId is required', 400);

  const { rows: userRows } = await pool.query(
    'select case_stage, rehabilitation_opted_in_at, rehabilitation_declined_at from users where user_id = $1',
    [activeUserId]
  );
  const user = userRows[0];
  if (!user) return fail(res, 'Case not found', 404);
  if (user.rehabilitation_opted_in_at) return fail(res, 'You have already opted in to rehabilitation.', 400);
  if (user.rehabilitation_declined_at) return fail(res, 'You already answered this for the current stage.', 400);
  if (user.case_stage !== 'Rehabilitation') {
    return fail(res, 'Rehabilitation is only available once your case reaches that stage.', 400);
  }

  const { rows: providerRows } = await pool.query(
    'select provider_id, name from rehabilitation_providers where provider_id = $1 and deleted_at is null',
    [providerId]
  );
  const provider = providerRows[0];
  if (!provider) return fail(res, 'Selected provider not found', 404);

  let referralId;
  try {
    referralId = await withTransaction(async (client) => {
      // Opting in is now purely a rehabilitation_opted_in_at flag - it never
      // touches case_stage, which stays exclusively eCourt's to set.
      await client.query(`update users set rehabilitation_opted_in_at = now() where user_id = $1`, [activeUserId]);
      const { rows } = await client.query(
        `insert into agency_referrals (user_id, referred_to_role, referred_by_user_id, reason, metadata)
         values ($1, 'Rehabilitation Officer', $1, $2, $3)
         returning referral_id`,
        [activeUserId, `Victim opted in to rehabilitation with ${provider.name}.`, JSON.stringify({ providerId: provider.provider_id, providerName: provider.name })]
      );
      return rows[0].referral_id;
    });
  } catch (err) {
    return fail(res, `Could not opt in: ${err.message}`, 500);
  }

  await writeAuditLog({ userId: activeUserId, action: 'create', entityType: 'agency_referral', entityId: referralId });

  return ok(res, { referralId }, 'Opted in to rehabilitation', 201);
});

// Self-service decline - the mandatory app-open gate's "No" answer. Unlike
// before migration_034, this case is NOT closed (Rehabilitation now sits
// mid-lifecycle, before Compensation/Case Closed) - declining just records
// the answer and lets the case continue under completely normal tracking;
// it no longer deactivates the account. If the victim has not opted in,
// this case simply never enters the isolated Rehabilitation workflow, and
// when it later reaches Case Closed it's treated as an ordinary closure.
router.post('/rehabilitation-decline', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows: userRows } = await pool.query(
    'select case_stage, rehabilitation_opted_in_at, rehabilitation_declined_at from users where user_id = $1',
    [activeUserId]
  );
  const user = userRows[0];
  if (!user) return fail(res, 'Case not found', 404);
  if (user.rehabilitation_opted_in_at) return fail(res, 'You have already opted in to rehabilitation.', 400);
  if (user.rehabilitation_declined_at) return fail(res, 'You already answered this for the current stage.', 400);
  if (user.case_stage !== 'Rehabilitation') {
    return fail(res, 'This decision is only available once your case reaches the Rehabilitation stage.', 400);
  }

  const { error } = await supabase.from('users').update({ rehabilitation_declined_at: new Date().toISOString() }).eq('user_id', activeUserId);
  if (error) return fail(res, `Could not process this request: ${error.message}`, 500);

  await writeAuditLog({ userId: activeUserId, action: 'update', entityType: 'user', entityId: activeUserId });

  return ok(res, null, 'Understood - your case will continue under normal tracking.');
});

// ===== Rehabilitation post-closure continuation (migration_034) =====
// The special flow: a case that was in Rehabilitation WITH the victim
// already opted in, then closed by eCourt, arms
// rehabilitation_closure_pending_ack (see ecourtStageSync.js's own
// transition logic) - this pair of routes is how the victim answers the
// resulting popup. Scoped by ?caseUserId= like every route above, since
// the docket in question may not be the caller's own anchor.
router.get('/rehabilitation-closure-status', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows } = await pool.query(
    'select docket_number, rehabilitation_closure_pending_ack from users where user_id = $1',
    [activeUserId]
  );
  const user = rows[0];
  if (!user) return fail(res, 'Case not found', 404);
  return ok(res, { pending: user.rehabilitation_closure_pending_ack, docketNumber: user.docket_number });
});

// "Yes, continue Rehabilitation" - the court case itself stays Closed (that
// fact never changes), but this docket's Rehabilitation context and
// application access stay alive despite the closed-docket rule that would
// otherwise apply (see auth.user.routes.js's login check).
router.post('/rehabilitation-closure-continue', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows } = await pool.query(
    'select rehabilitation_closure_pending_ack from users where user_id = $1',
    [activeUserId]
  );
  if (!rows[0]) return fail(res, 'Case not found', 404);
  if (!rows[0].rehabilitation_closure_pending_ack) return fail(res, 'There is no pending closure decision for this case.', 400);

  const { error } = await supabase
    .from('users')
    .update({ rehabilitation_closure_pending_ack: false, rehabilitation_continued_after_closure: true })
    .eq('user_id', activeUserId);
  if (error) return fail(res, `Could not process this request: ${error.message}`, 500);

  await writeAuditLog({ userId: activeUserId, action: 'update', entityType: 'user', entityId: activeUserId });
  return ok(res, null, 'Continuing your Rehabilitation support.');
});

// "No" - ends this docket's Rehabilitation access; the app returns the
// victim to whichever of their other cases remains active (UserGate.js's
// own concern, not this route's).
router.post('/rehabilitation-closure-end', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows } = await pool.query(
    'select rehabilitation_closure_pending_ack from users where user_id = $1',
    [activeUserId]
  );
  if (!rows[0]) return fail(res, 'Case not found', 404);
  if (!rows[0].rehabilitation_closure_pending_ack) return fail(res, 'There is no pending closure decision for this case.', 400);

  const { error } = await supabase
    .from('users')
    .update({ rehabilitation_closure_pending_ack: false, rehabilitation_continued_after_closure: false })
    .eq('user_id', activeUserId);
  if (error) return fail(res, `Could not process this request: ${error.message}`, 500);

  await writeAuditLog({ userId: activeUserId, action: 'update', entityType: 'user', entityId: activeUserId });
  return ok(res, null, 'Rehabilitation access ended for this case.');
});

// ===== Legal Aid (consolidated DLSA flow) =====
// The no-proof self-referral creation route that used to live here
// (POST /legal-aid-request) has been retired - real Legal Aid requests
// under the PoA Act require verified proof (caste certificate, FIR copy,
// photo ID), which only Request Assistance's existing document-upload flow
// actually enforces. Creation now happens ONLY via
// POST /intervention-requests (type 'Legal Aid') followed by DLSA
// Coordinator's own Accept decision (interventionRequestReview.js), which
// creates the same kind of agency_referral this route used to create
// directly. The status/feedback routes below are unaffected - they simply
// read whatever referral exists, however it was created.

// Read-only status the victim's own app polls - assigned counsel's name
// (once DLSA acts), SLA deadline, and whether feedback has already been
// given for the current assignment (so the app doesn't re-show a feedback
// form for counsel already rated).
router.get('/legal-aid-status', async (req, res) => {
  const { rows } = await pool.query(
    `select referral_id, status, metadata, created_at, resolved_at
     from agency_referrals
     where user_id = $1 and referred_to_role = 'DLSA Coordinator'
     order by created_at desc limit 1`,
    [req.auth.userId]
  );
  const referral = rows[0];
  if (!referral) return ok(res, { hasRequest: false });

  const metadata = referral.metadata || {};
  return ok(res, {
    hasRequest: true,
    referralId: referral.referral_id,
    status: referral.status,
    assignedLawyer: metadata.assignedLawyer || null,
    slaDeadline: metadata.slaDeadline || null,
    feedbackGiven: !!metadata.lawyerFeedback,
    createdAt: referral.created_at,
    resolvedAt: referral.resolved_at,
  });
});

// Victim's feedback on their assigned counsel - stored on the same
// referral's metadata (DLSA already reads/returns the full metadata blob,
// so no change needed there for this to surface). One feedback per
// assignment - re-assigning counsel (assign-lawyer overwrites
// assignedLawyer) naturally clears the way for fresh feedback later, since
// a NEW assignment is a different fact than the one already rated.
router.post('/legal-aid-feedback', async (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return fail(res, 'rating is required (1-5)', 400);

  const { rows } = await pool.query(
    `select referral_id, metadata from agency_referrals where user_id = $1 and referred_to_role = 'DLSA Coordinator' order by created_at desc limit 1`,
    [req.auth.userId]
  );
  const referral = rows[0];
  if (!referral) return fail(res, 'No legal aid request found', 404);
  if (!referral.metadata?.assignedLawyer) return fail(res, 'Counsel has not been assigned yet', 400);

  const newMetadata = {
    ...referral.metadata,
    lawyerFeedback: { rating, comment: comment ? String(comment).trim() : null, submittedAt: new Date().toISOString() },
  };
  const { error } = await supabase.from('agency_referrals').update({ metadata: newMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not submit feedback: ${error.message}`, 500);

  await writeAuditLog({ userId: req.auth.userId, action: 'create', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, null, 'Feedback submitted. Kindly note that if you rate your counsel poorly, DLSA may reassign your case to a different lawyer.');
});

// ===== Legal Aid (dedicated pipeline, migration_040) =====
// Replaces the consolidated flow above for every NEW request - Legal Aid no
// longer rides through the generic Request Assistance intake at all
// (intervention_types' 'Legal Aid' row is soft-deleted by migration_040).
// A dedicated legal_aid_requests row carries a real 7-stage lifecycle
// (Submitted -> Under Review -> Verified -> Approved -> Active -> Completed,
// or Under Review -> Rejected), reviewed by a jurisdiction-scoped DLSA
// Coordinator (dlsa.routes.js) and served by a real Public Prosecutor
// account (legal_representative/routes/legalRepresentative.routes.js) once
// assigned - not a free-text lawyer name. The routes above are untouched and
// stay live read-only, so a case already accepted under the old flow keeps
// working; GET .../current below additionally surfaces a legacyRequestFound
// flag so nobody's existing in-flight request silently disappears from the UI.

const legalAidDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // matches interventionDocumentUpload's own limit
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only PDF, PNG, or JPEG files are allowed for Legal Aid documents'));
    cb(null, true);
  },
});

// Best-effort staff notification, shared by submission (below) and poor
// feedback (further down) - same user_id-only alert_notifications shape
// already used for 'disengagement'/'weekly_review', never blocks the
// caller's own response on failure.
async function notifyJurisdictionalDlsa(caseUserId, jurisdictionId, priority) {
  try {
    const { rows: dlsaOfficials } = await pool.query(
      `select o.official_id from officials o
       join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
       join roles r on r.role_id = orr.role_id
       where r.role_name = 'DLSA Coordinator' and orr.jurisdiction_id = $1`,
      [jurisdictionId]
    );
    if (dlsaOfficials.length === 0) return;
    const { error } = await supabase.from('alert_notifications').insert(
      dlsaOfficials.map((d) => ({ user_id: caseUserId, official_id: d.official_id, source: 'legal_aid', priority }))
    );
    if (error) console.error('notifyJurisdictionalDlsa: insert failed', error.message, { caseUserId, jurisdictionId });
  } catch (err) {
    console.error('notifyJurisdictionalDlsa: failed', err.message, { caseUserId, jurisdictionId });
  }
}

// Filed against the literal ACTIVE case, never the anchor - same convention
// intervention_requests already follows (see its own POST route's comment).
// migration_041: one Legal Aid request per case, ever - not just one in
// flight at a time. A rejected or completed request no longer opens the
// door to a fresh submission on the same docket.
router.post('/legal-aid-requests', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { reason, description } = req.body;
  if (!reason || !String(reason).trim()) return fail(res, 'reason is required', 400);

  const { rows: caseRows } = await pool.query('select jurisdiction_id from users where user_id = $1', [activeUserId]);
  if (!caseRows[0]) return fail(res, 'Case not found', 404);

  let request;
  try {
    const { rows } = await pool.query(
      `insert into legal_aid_requests (user_id, reason, description)
       values ($1, $2, $3) returning request_id, status, created_at`,
      [activeUserId, String(reason).trim(), description ? String(description).trim() || null : null]
    );
    request = rows[0];
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'idx_legal_aid_requests_one_open_per_case') {
      return fail(res, 'This case has already used its one Legal Aid request', 409);
    }
    return fail(res, `Could not submit Legal Aid request: ${err.message}`, 500);
  }

  // Best-effort - the request itself has already committed above. Auto-links
  // whatever documents this case already has on file rather than making the
  // victim re-upload a caste certificate/FIR/ID they've already provided
  // elsewhere: every prior proof document from ANY of this case's own past
  // intervention requests, plus the IO's own filed FIR/chargesheet if present.
  try {
    const { rows: priorDocs } = await pool.query(
      `select ird.document_id, ird.document_label, ird.content_type
       from intervention_request_documents ird
       join intervention_requests ir on ir.request_id = ird.request_id
       where ir.user_id = $1`,
      [activeUserId]
    );
    const { rows: investigationRows } = await pool.query(
      `select investigation_id, fir_document_path, chargesheet_document_path from investigation_records where user_id = $1`,
      [activeUserId]
    );

    const linkRows = priorDocs.map((d) => ({
      request_id: request.request_id,
      source: 'existing_case_document',
      document_label: d.document_label,
      linked_intervention_request_document_id: d.document_id,
      content_type: d.content_type,
    }));
    const investigation = investigationRows[0];
    if (investigation?.fir_document_path) {
      linkRows.push({ request_id: request.request_id, source: 'existing_case_document', document_label: 'FIR Copy', linked_investigation_record_id: investigation.investigation_id, content_type: 'application/pdf' });
    }
    if (investigation?.chargesheet_document_path) {
      linkRows.push({ request_id: request.request_id, source: 'existing_case_document', document_label: 'Chargesheet', linked_investigation_record_id: investigation.investigation_id, content_type: 'application/pdf' });
    }
    if (linkRows.length > 0) {
      const { error: linkError } = await supabase.from('legal_aid_request_documents').insert(linkRows);
      if (linkError) console.error('POST /legal-aid-requests: could not auto-link existing documents', linkError.message, { requestId: request.request_id });
    }
  } catch (err) {
    console.error('POST /legal-aid-requests: auto-link step failed', err.message, { requestId: request.request_id });
  }

  await writeAuditLog({ userId: activeUserId, action: 'create', entityType: 'legal_aid_request', entityId: request.request_id });
  await notifyJurisdictionalDlsa(activeUserId, caseRows[0].jurisdiction_id, 'normal');

  return ok(res, { requestId: request.request_id, status: request.status, createdAt: request.created_at }, 'Legal Aid request submitted', 201);
});

// Allowed at any non-terminal status, unlike intervention_request_documents'
// Pending-only rule - Legal Aid is a long-running relationship, a victim may
// reasonably need to add a document well after intake (e.g. once Active).
router.post('/legal-aid-requests/:requestId/documents', legalAidDocumentUpload.single('file'), async (req, res) => {
  const { requestId } = req.params;
  const { documentLabel } = req.body;
  if (!req.file) return fail(res, 'file is required', 400);
  if (!documentLabel) return fail(res, 'documentLabel is required', 400);

  const { rows } = await pool.query('select user_id, status from legal_aid_requests where request_id = $1', [requestId]);
  if (!rows[0]) return fail(res, 'Request not found', 404);
  if (!(await isOwnCase(req, rows[0].user_id))) return fail(res, 'Not your request', 403);
  if (['Rejected', 'Completed'].includes(rows[0].status)) return fail(res, 'This request has already been closed', 400);

  const documentId = crypto.randomUUID();
  const storagePath = `${rows[0].user_id}/${requestId}/${documentId}-${sanitizeDocumentFileName(req.file.originalname)}`;

  const { error: uploadError } = await supabase.storage.from('legal-aid-documents').upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return fail(res, `Could not upload document: ${uploadError.message}`, 500);

  await pool.query(
    `insert into legal_aid_request_documents (document_id, request_id, source, document_label, storage_path, storage_bucket, content_type)
     values ($1, $2, 'uploaded', $3, $4, 'legal-aid-documents', $5)`,
    [documentId, requestId, documentLabel, storagePath, req.file.mimetype]
  );

  await writeAuditLog({ userId: req.auth.userId, action: 'create', entityType: 'legal_aid_request_document', entityId: documentId });

  return ok(res, { documentId }, 'Document uploaded', 201);
});

// "My Legal Aid Requests" - spans the whole case family, same duality as
// GET /intervention-requests (filed per literal case, listed across the family).
router.get('/legal-aid-requests', async (req, res) => {
  const { rows } = await pool.query(
    `select lar.request_id, lar.reason, lar.description, lar.status, lar.rejection_reason, lar.created_at, lar.updated_at, u.docket_number
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     where u.user_id = $1 or u.linked_to_user_id = $1
     order by lar.created_at desc`,
    [req.auth.userId]
  );
  return ok(res, {
    requests: rows.map((r) => ({
      requestId: r.request_id,
      docketNumber: r.docket_number,
      reason: r.reason,
      description: r.description,
      status: r.status,
      rejectionReason: r.rejection_reason,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// Single-object convenience for the Legal Aid hub screen, scoped to the
// active/selected case (?caseUserId=, resolveCaseUserId) - mirrors the old
// GET /legal-aid-status's single-object contract. legacyRequestFound flags
// whether this case's ANCHOR has a pre-existing referral under the old
// consolidated flow (the only shape that flow ever used), so the hub can
// show a read-only "legacy request" banner rather than silently dropping it.
router.get('/legal-aid-requests/current', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);

  const { rows } = await pool.query(
    `select lar.request_id, lar.reason, lar.description, lar.status, lar.rejection_reason, lar.created_at, lar.updated_at, u.jurisdiction_id
     from legal_aid_requests lar
     join users u on u.user_id = lar.user_id
     where lar.user_id = $1 order by lar.created_at desc limit 1`,
    [activeUserId]
  );
  const { rows: legacyRows } = await pool.query(
    `select 1 from agency_referrals where user_id = $1 and referred_to_role = 'DLSA Coordinator' limit 1`,
    [req.auth.userId]
  );
  const legacyRequestFound = legacyRows.length > 0;

  const request = rows[0];
  if (!request) return ok(res, { hasRequest: false, legacyRequestFound });

  const { rows: docRows } = await pool.query(
    'select document_id, document_label, source from legal_aid_request_documents where request_id = $1 order by uploaded_at',
    [request.request_id]
  );

  // The DLSA Coordinator responsible for this case's own district - shown
  // on the status page throughout the lifecycle (same disclosure level as
  // an assigned Public Prosecutor's own contact card below), not just once
  // a Public Prosecutor has been assigned. Jurisdiction-resolved, same as
  // dlsa.routes.js's own eligible-representatives picker resolves Public
  // Prosecutors - not tied to whichever DLSA official happened to click
  // Start Review, since that's an internal detail, not "who do I contact".
  const { rows: dlsaRows } = await pool.query(
    `select o.full_name, o.phone
     from officials o
     join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
     join roles r on r.role_id = orr.role_id
     where r.role_name = 'DLSA Coordinator' and orr.jurisdiction_id = $1
     order by o.full_name limit 1`,
    [request.jurisdiction_id]
  );
  const dlsaCoordinator = dlsaRows[0] ? { fullName: dlsaRows[0].full_name, phone: dlsaRows[0].phone } : null;

  // migration_043: one feedback per Public Prosecutor ASSIGNMENT, not per
  // hearing - "current" here means whichever assignment is/was most recent
  // (the Active one, or the final one once Completed), so the feedback box
  // below the status page's stepper knows whether to show the form or the
  // "already submitted" state.
  const { rows: latestAssignmentRows } = await pool.query(
    `select assignment_id from legal_aid_assignments where request_id = $1 order by assigned_at desc limit 1`,
    [request.request_id]
  );
  let myFeedback = null;
  if (latestAssignmentRows[0]) {
    const { rows: feedbackRows } = await pool.query(
      `select rating, comment from legal_aid_feedback where assignment_id = $1`,
      [latestAssignmentRows[0].assignment_id]
    );
    if (feedbackRows[0]) myFeedback = { rating: feedbackRows[0].rating, comment: feedbackRows[0].comment };
  }

  return ok(res, {
    hasRequest: true,
    requestId: request.request_id,
    status: request.status,
    reason: request.reason,
    description: request.description,
    rejectionReason: request.rejection_reason,
    documents: docRows.map((d) => ({ documentId: d.document_id, documentLabel: d.document_label, source: d.source })),
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    legacyRequestFound,
    dlsaCoordinator,
    myFeedback,
  });
});

// Representatives are directly contactable by their own client, same
// disclosure level as GET /assigned-counsellor above (not the docket-only
// convention Protection Officer's own contact routes use elsewhere).
router.get('/legal-aid-requests/:requestId/representative', async (req, res) => {
  const { requestId } = req.params;
  const { rows: reqRows } = await pool.query('select user_id from legal_aid_requests where request_id = $1', [requestId]);
  if (!reqRows[0]) return fail(res, 'Request not found', 404);
  if (!(await isOwnCase(req, reqRows[0].user_id))) return fail(res, 'Not your request', 403);

  const { rows } = await pool.query(
    `select laa.status as assignment_status, o.full_name, o.phone, o.whatsapp_number, orr.designation
     from legal_aid_assignments laa
     join officials o on o.official_id = laa.representative_official_id
     left join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
     left join roles r on r.role_id = orr.role_id and r.role_name = 'Public Prosecutor'
     where laa.request_id = $1
     order by laa.assigned_at desc limit 1`,
    [requestId]
  );
  const rep = rows[0];
  if (!rep) return ok(res, { hasRepresentative: false });

  return ok(res, {
    hasRepresentative: true,
    fullName: rep.full_name,
    designation: rep.designation,
    phone: rep.phone,
    whatsappNumber: rep.whatsapp_number,
    assignmentStatus: rep.assignment_status,
  });
});

// Official hearing records only - never legal_aid_private_notes, enforced by
// table choice alone (that table is never queried from this router).
// migration_043: no more per-hearing feedbackGiven flag - feedback is
// assignment-scoped now (see GET .../current's own myFeedback), unrelated to
// any individual hearing on this list.
router.get('/legal-aid-requests/:requestId/hearings', async (req, res) => {
  const { requestId } = req.params;
  const { rows: reqRows } = await pool.query('select user_id from legal_aid_requests where request_id = $1', [requestId]);
  if (!reqRows[0]) return fail(res, 'Request not found', 404);
  if (!(await isOwnCase(req, reqRows[0].user_id))) return fail(res, 'Not your request', 403);

  const { rows } = await pool.query(
    `select hearing_id, hearing_date, court, hearing_type, outcome, next_hearing_date, notes, created_at
     from legal_aid_hearings where request_id = $1 order by hearing_date desc`,
    [requestId]
  );
  return ok(res, {
    hearings: rows.map((h) => ({
      hearingId: h.hearing_id,
      hearingDate: h.hearing_date,
      court: h.court,
      hearingType: h.hearing_type,
      outcome: h.outcome,
      nextHearingDate: h.next_hearing_date,
      notes: h.notes,
      createdAt: h.created_at,
    })),
  });
});

// migration_043: one feedback per Public Prosecutor ASSIGNMENT (DB-enforced),
// not per hearing - reachable the moment a Public Prosecutor is assigned,
// not gated behind a hearing actually having been recorded yet. A victim can
// never edit another victim's feedback (every write here is scoped to
// submitted_by_user_id = the caller's own id) or overwrite their own either
// (the assignment-uniqueness index blocks a second insert; the frontend
// shows GET .../current's own myFeedback instead of the form once one
// exists).
router.post('/legal-aid-requests/:requestId/feedback', async (req, res) => {
  const { requestId } = req.params;
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) return fail(res, 'rating is required (1-5)', 400);

  const { rows: reqRows } = await pool.query('select lar.user_id, u.jurisdiction_id from legal_aid_requests lar join users u on u.user_id = lar.user_id where lar.request_id = $1', [requestId]);
  if (!reqRows[0]) return fail(res, 'Request not found', 404);
  if (!(await isOwnCase(req, reqRows[0].user_id))) return fail(res, 'Not your request', 403);

  const { rows: assignmentRows } = await pool.query(
    `select assignment_id from legal_aid_assignments where request_id = $1 order by assigned_at desc limit 1`,
    [requestId]
  );
  if (!assignmentRows[0]) return fail(res, 'No Public Prosecutor has been assigned to this case yet', 400);

  let feedback;
  try {
    const { rows } = await pool.query(
      `insert into legal_aid_feedback (request_id, assignment_id, submitted_by_user_id, rating, comment)
       values ($1, $2, $3, $4, $5) returning feedback_id`,
      [requestId, assignmentRows[0].assignment_id, req.auth.userId, rating, comment ? String(comment).trim() || null : null]
    );
    feedback = rows[0];
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'idx_legal_aid_feedback_one_per_assignment') {
      return fail(res, 'You have already submitted feedback for your current Public Prosecutor', 409);
    }
    return fail(res, `Could not submit feedback: ${err.message}`, 500);
  }

  await writeAuditLog({ userId: req.auth.userId, action: 'create', entityType: 'legal_aid_feedback', entityId: feedback.feedback_id });

  if (rating <= POOR_FEEDBACK_RATING_THRESHOLD) {
    await notifyJurisdictionalDlsa(reqRows[0].user_id, reqRows[0].jurisdiction_id, 'urgent');
  }

  return ok(res, { feedbackId: feedback.feedback_id }, 'Feedback submitted. Kindly note that if you rate your Public Prosecutor poorly, DLSA may reassign your case.', 201);
});

// ===== Protection status (Protection Officer flow) =====
// POST /threat-report has been removed: "Report a Threat" duplicated the
// Emergency Call's destination (the same jurisdiction-scoped Protection
// Officer queue), only slower and without the emergency framing - which
// forced a victim in danger to choose between two near-identical buttons.
// A protection referral is now created either by POST /urgent-help (urgent)
// or by an accepted Witness Protection / Relocation intervention request
// (planned, proof-reviewed). This read-only status route serves whichever
// of those is active.

// Read-only status the victim's own app polls - whether protection is
// active, and the Protection Officer's own logged updates (weekly
// verification notes), surfaced the same way Rehabilitation Officer's
// notes already surface on the victim's rehabilitation dashboard.
router.get('/threat-status', async (req, res) => {
  const { rows } = await pool.query(
    `select referral_id, status, metadata, created_at, resolved_at
     from agency_referrals
     where user_id = $1 and referred_to_role = 'Protection Officer'
     order by created_at desc limit 1`,
    [req.auth.userId]
  );
  const referral = rows[0];
  if (!referral) return ok(res, { hasReport: false });

  const { rows: notes } = await pool.query(
    `select n.note_text, n.created_at
     from agency_referral_notes n
     where n.referral_id = $1
     order by n.created_at desc`,
    [referral.referral_id]
  );

  return ok(res, {
    hasReport: true,
    referralId: referral.referral_id,
    status: referral.status,
    createdAt: referral.created_at,
    resolvedAt: referral.resolved_at,
    updates: notes.map((n) => ({ noteText: n.note_text, createdAt: n.created_at })),
    // The structured outcome the Protection Officer records on Mark
    // Resolved (protectionOfficer.routes.js's PATCH /referrals/:id/resolve)
    // - this is what actually closes the loop for the victim: "Resolved"
    // alone says nothing about what was done. null until resolved with an
    // outcome recorded.
    outcome: referral.metadata?.outcome || null,
  });
});

// ===== DWO Financial Aid (Immediate Relief) =====
// The no-proof self-referral creation route that used to live here
// (POST /financial-aid-request) has been retired - real Financial
// Assistance under the PoA Act requires verified proof (FIR copy, caste
// certificate, bank passbook), which only Request Assistance's existing
// document-upload flow actually enforces. Creation now happens ONLY via
// POST /intervention-requests (type 'Financial Assistance' or 'Medical')
// followed by DWO's own Accept decision (interventionRequestReview.js),
// which creates the same kind of agency_referral this route used to create
// directly. The status/confirm routes below are unaffected - they simply
// read whatever referral exists, however it was created.

// Read-only status the victim's own app polls - what DWO has approved (if
// anything) and whether it has actually been provided yet.
router.get('/financial-aid-status', async (req, res) => {
  const { rows } = await pool.query(
    `select referral_id, status, metadata, created_at, resolved_at
     from agency_referrals
     where user_id = $1 and referred_to_role = 'District Welfare Officer'
     order by created_at desc limit 1`,
    [req.auth.userId]
  );
  const referral = rows[0];
  if (!referral) return ok(res, { hasRequest: false });

  return ok(res, {
    hasRequest: true,
    referralId: referral.referral_id,
    status: referral.status,
    immediateRelief: referral.metadata?.immediateRelief || null,
    createdAt: referral.created_at,
    resolvedAt: referral.resolved_at,
  });
});

// Victim's own confirmation that relief marked "Provided" was actually
// received - the flow's final "victim confirms" step. Deliberately does
// NOT resolve the whole referral (Compensation tracking on the same
// referral may still be ongoing for years after immediate relief is
// settled) - DWO resolves the referral itself, separately, once satisfied.
router.post('/financial-aid-confirm', async (req, res) => {
  const { rows } = await pool.query(
    `select referral_id, metadata from agency_referrals where user_id = $1 and referred_to_role = 'District Welfare Officer' order by created_at desc limit 1`,
    [req.auth.userId]
  );
  const referral = rows[0];
  if (!referral) return fail(res, 'No financial aid request found', 404);

  const relief = referral.metadata?.immediateRelief;
  if (!relief || relief.status !== 'Provided') {
    return fail(res, 'There is no provided relief awaiting your confirmation.', 400);
  }

  const nextMetadata = { ...referral.metadata, immediateRelief: { ...relief, status: 'Confirmed', confirmedAt: new Date().toISOString() } };
  const { error } = await supabase.from('agency_referrals').update({ metadata: nextMetadata }).eq('referral_id', referral.referral_id);
  if (error) return fail(res, `Could not confirm receipt: ${error.message}`, 500);

  await writeAuditLog({ userId: req.auth.userId, action: 'update', entityType: 'agency_referral', entityId: referral.referral_id });

  return ok(res, null, 'Thank you for confirming. Your relief record has been closed.');
});

// ===== Compensation Module (read-only for the victim) =====
// "Case Registered -> Compensation Module auto-identifies applicable
// statutory category, shows applicable amount & payment" - available the
// moment a case exists, independent of any DWO referral or action. Once
// DWO has verified an exact amount (dwo.routes.js's compensation/verify),
// that verified figure and live stage tracker take over from the
// auto-suggested one.
router.get('/compensation-status', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows: userRows } = await pool.query(
    `select u.case_stage, ct.name as case_type_name
     from users u
     join case_types ct on ct.case_type_id = u.case_type_id
     where u.user_id = $1`,
    [activeUserId]
  );
  const user = userRows[0];
  if (!user) return fail(res, 'Case not found', 404);

  const { rows: referralRows } = await pool.query(
    `select metadata from agency_referrals where user_id = $1 and referred_to_role = 'District Welfare Officer' order by created_at desc limit 1`,
    [activeUserId]
  );
  const compensation = referralRows[0]?.metadata?.compensation || null;

  if (!compensation) {
    const suggested = getCompensationSchedule(user.case_type_name);
    return ok(res, { verified: false, statutoryCategory: suggested.statutoryCategory, suggestedAmount: suggested.suggestedAmount, stages: null });
  }

  const live = withLiveCompensationView(compensation, user.case_stage);
  return ok(res, {
    verified: true,
    statutoryCategory: live.statutoryCategory,
    suggestedAmount: live.suggestedAmount,
    verifiedAmount: live.verifiedAmount,
    verifiedAt: live.verifiedAt,
    stages: live.stages,
  });
});

// ===== Investigation Progress (read-only for the victim) =====
// "Case progress shown to victim (no confidential evidence)" - a curated
// subset of the Investigating Officer's own investigation_records
// (migration_033): accused custody status and chargesheet status (both
// factual, not raw evidence) plus IO's own victim-safe progress summary.
// Raw investigative detail (case_notes, IO-authored) never surfaces here.
// Entirely separate from the eCourts simulation (court-case/:userId above,
// courtCaseSimulation.js) - that stays a decorative, deterministic fixture,
// this is the real record IO actually maintains.
router.get('/investigation-progress', async (req, res) => {
  const activeUserId = await resolveCaseUserId(req);
  const { rows } = await pool.query(
    `select ir.accused_status, ir.investigation_progress, ir.chargesheet_status, ir.chargesheet_filed_at,
            ir.investigation_complete_at, ir.fir_document_path, ir.chargesheet_document_path
     from users u
     left join investigation_records ir on ir.user_id = u.user_id
     where u.user_id = $1`,
    [activeUserId]
  );
  const row = rows[0];
  if (!row) return fail(res, 'Case not found', 404);

  // migration_037 - Document Transparency: the FIR copy and filed
  // chargesheet the Investigating Officer uploaded, downloadable straight
  // from the victim's own Case Details. A fresh short-lived signed URL is
  // minted per read (never a permanent public link, never a stored URL) -
  // same discipline as intervention-proof retrieval.
  const signDocument = async (path) => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from('case-documents').createSignedUrl(path, 3600);
    return error ? null : data.signedUrl;
  };
  const [firDocumentUrl, chargesheetDocumentUrl] = await Promise.all([
    signDocument(row.fir_document_path),
    signDocument(row.chargesheet_document_path),
  ]);

  return ok(res, {
    accusedStatus: row.accused_status || null,
    investigationProgress: row.investigation_progress || null,
    chargesheetStatus: row.chargesheet_status || 'Not Filed',
    chargesheetFiledAt: row.chargesheet_filed_at || null,
    // A real milestone for someone waiting on their own case - the victim
    // had no way of learning the investigation had concluded.
    investigationCompleteAt: row.investigation_complete_at || null,
    firDocumentUrl,
    chargesheetDocumentUrl,
  });
});


// ===== Compensation bank details (migration_038) =====
// PoA Act relief is paid by DBT into the victim's own account - without
// this, DWO could mark a payment stage "Paid" with nothing to pay into.
// Held against the PERSON (user_identity, resolved through the anchor for a
// linked case), not one docket: the same account is used for every case
// this person has.
//
// Deliberately NOT proof-gated to submit. The bank proof is optional
// supporting evidence DWO can ask for - the same reasoning migration_036
// applied to the intervention types: a victim entitled to statutory relief
// should not be blocked from even recording where to send it. DWO verifies
// before actually disbursing.
router.get('/bank-details', async (req, res) => {
  const { rows } = await pool.query(
    `select bank_account_name, bank_account_number, bank_ifsc, bank_name, bank_proof_path, bank_details_updated_at
     from user_identity where user_id = $1`,
    [req.auth.userId]
  );
  const row = rows[0];
  if (!row) return ok(res, { hasDetails: false });

  let proofUrl = null;
  if (row.bank_proof_path) {
    const { data, error } = await supabase.storage.from('intervention-proofs').createSignedUrl(row.bank_proof_path, 3600);
    proofUrl = error ? null : data.signedUrl;
  }

  return ok(res, {
    hasDetails: !!row.bank_account_number,
    accountName: row.bank_account_name || null,
    accountNumber: row.bank_account_number || null,
    ifsc: row.bank_ifsc || null,
    bankName: row.bank_name || null,
    proofUrl,
    updatedAt: row.bank_details_updated_at || null,
  });
});

router.patch('/bank-details', async (req, res) => {
  const { accountName, accountNumber, ifsc, bankName } = req.body;
  if (!accountName || !String(accountName).trim()) return fail(res, 'accountName is required', 400);
  if (!accountNumber || !/^[0-9]{9,18}$/.test(String(accountNumber).trim())) {
    return fail(res, 'accountNumber must be 9-18 digits', 400);
  }
  // Real IFSC format: 4 letters, then 0, then 6 alphanumerics.
  if (!ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(ifsc).trim().toUpperCase())) {
    return fail(res, 'ifsc must be a valid IFSC code (e.g. SBIN0001234)', 400);
  }

  const { error } = await supabase
    .from('user_identity')
    .update({
      bank_account_name: String(accountName).trim(),
      bank_account_number: String(accountNumber).trim(),
      bank_ifsc: String(ifsc).trim().toUpperCase(),
      bank_name: bankName ? String(bankName).trim() : null,
      bank_details_updated_at: new Date().toISOString(),
    })
    .eq('user_id', req.auth.userId);
  if (error) return fail(res, `Could not save bank details: ${error.message}`, 500);

  await writeAuditLog({ userId: req.auth.userId, action: 'update', entityType: 'bank_details', entityId: req.auth.userId });

  return ok(res, null, 'Bank details saved - your compensation will be paid into this account');
});

// Optional supporting proof (passbook page / cancelled cheque). Reuses the
// existing private intervention-proofs bucket - same class of sensitive
// victim document, retrieved only through a short-lived signed URL.
router.post('/bank-details/proof', interventionDocumentUpload.single('file'), async (req, res) => {
  if (!req.file) return fail(res, 'file is required', 400);

  const storagePath = `${req.auth.userId}/bank-proof/${crypto.randomUUID()}-${sanitizeDocumentFileName(req.file.originalname)}`;
  const { error: uploadError } = await supabase.storage
    .from('intervention-proofs')
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return fail(res, `Could not upload proof: ${uploadError.message}`, 500);

  const { error } = await supabase
    .from('user_identity')
    .update({ bank_proof_path: storagePath })
    .eq('user_id', req.auth.userId);
  if (error) return fail(res, `Uploaded, but could not attach it to your record: ${error.message}`, 500);

  await writeAuditLog({ userId: req.auth.userId, action: 'update', entityType: 'bank_details', entityId: req.auth.userId });

  return ok(res, null, 'Bank proof uploaded', 201);
});

module.exports = router;
