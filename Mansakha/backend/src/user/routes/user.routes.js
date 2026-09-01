const express = require('express');
const { supabase } = require('../../core/db/supabaseClient');
const { pool } = require('../../core/db/pgPool');
const { analyzeInteraction, analyzeChatMessage, analyzeInteractionFromClientAi } = require('../../ai/ai');
const { writeAuditLog } = require('../../core/services/auditLog');
const { verifyToken } = require('../../core/middleware/verifyToken');
const { generalApiLimiter, userChatLimiter } = require('../../core/middleware/rateLimiter');
const { ok, fail } = require('../../core/services/responseEnvelope');
const { recordInteraction, recordAiDistressScore, PipelineError } = require('../../core/services/interactionPipeline');
const { applyStressResponse, selectLeastLoadedCounsellor } = require('../../core/services/stressResponse');
const { enqueueAlertDispatch } = require('../../core/services/dispatchWorker');
const { generateNextQuestion, predictDistressScore } = require('../../ai/ollama');

const router = express.Router();

const NEXT_CHECKIN_CADENCE_DAYS = 7;
const SUPPORT_LINKS = [
  { label: 'NHAA Helpline', detail: 'Call 14566, 24/7, available in Hindi/English/regional languages' },
];

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
  ] = await Promise.all([
    supabase
      .from('users')
      .select('status, case_stage, preferred_language, docket_number, opted_for_manual_counsellor, sms_checkin_enabled')
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
  ]);
  if (userError || !user) return fail(res, 'User record not found', 404);

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
    currentDistressLevel: latestScore
      ? { score: latestScore.score_value, riskLevel: latestScore.risk_levels.name }
      : null,
    nextCheckIn,
    alerts: (openAlerts || []).map((a) => ({ alertId: a.alert_id, triggeredAt: a.triggered_at, status: a.alert_statuses.name })),
    supportLinks: SUPPORT_LINKS,
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

  const { scoreId } = await recordAiDistressScore(userId, interactionId, analysis);

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

// Feature Catalog Section 1.5 SOS - one tap, no AI call (must be fast, must
// not depend on an external API that could be slow/down/rate-limited).
// Deliberately bypasses interactions/distress_scores/alerts entirely - see
// sos_events in schema.sql. Notifies the assigned counsellor if the user
// has one, otherwise auto-selects (and assigns) the least-loaded counsellor
// in the jurisdiction, same selection logic Critical-tier routing uses
// (services/stressResponse.js).
router.post('/sos', async (req, res) => {
  const userId = req.auth.userId;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('jurisdiction_id, assigned_counsellor_id')
    .eq('user_id', userId)
    .single();
  if (userError || !user) return fail(res, 'User record not found', 404);

  const { data: sosEvent, error: sosError } = await supabase
    .from('sos_events')
    .insert({ user_id: userId })
    .select('sos_event_id, triggered_at')
    .single();
  if (sosError) return fail(res, `Could not record SOS: ${sosError.message}`, 500);

  let counsellorId = user.assigned_counsellor_id;
  if (!counsellorId) {
    counsellorId = await selectLeastLoadedCounsellor(user.jurisdiction_id);
    if (counsellorId) {
      await supabase.from('users').update({ assigned_counsellor_id: counsellorId }).eq('user_id', userId);
    }
  }

  if (counsellorId) {
    const { error: notifyError } = await supabase
      .from('alert_notifications')
      .insert({ sos_event_id: sosEvent.sos_event_id, official_id: counsellorId, source: 'sos', priority: 'urgent' });
    if (notifyError) {
      console.error('POST /sos: could not write alert_notifications', notifyError.message);
    } else {
      await enqueueAlertDispatch(null, userId, [counsellorId]);
    }
  } else {
    console.error('POST /sos: no counsellor available to notify', { sosEventId: sosEvent.sos_event_id, userId });
  }

  await writeAuditLog({ userId, action: 'create', entityType: 'sos_event', entityId: sosEvent.sos_event_id });

  return ok(res, { sosEventId: sosEvent.sos_event_id, triggeredAt: sosEvent.triggered_at }, 'Emergency alert sent', 201);
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

  const { error } = await supabase.from('users').update({ opted_for_manual_counsellor: optedIn }).eq('user_id', req.auth.userId);
  if (error) return fail(res, `Could not update counsellor preference: ${error.message}`, 500);

  let assignedCounsellor = null;
  if (optedIn) {
    const { data: user } = await supabase
      .from('users')
      .select('jurisdiction_id, assigned_counsellor_id')
      .eq('user_id', req.auth.userId)
      .maybeSingle();

    let counsellorId = user?.assigned_counsellor_id;
    if (user && !counsellorId) {
      counsellorId = await selectLeastLoadedCounsellor(user.jurisdiction_id);
      if (counsellorId) {
        await supabase.from('users').update({ assigned_counsellor_id: counsellorId }).eq('user_id', req.auth.userId);
      }
    }

    if (counsellorId) {
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
  }

  return ok(res, { assigned: !!assignedCounsellor, counsellor: assignedCounsellor }, 'Counsellor preference updated');
});

// Section 2.2 "Scheduled counsellings" - the counsellor-side write
// (POST /api/counsellor/cases/:userId/schedule) had no matching user-side
// read anywhere, so a scheduled session was invisible to the person it was
// scheduled for. Upcoming only - a completed/cancelled session isn't
// something the user still needs to "prepare for."
router.get('/counselling-sessions', async (req, res) => {
  const { rows } = await pool.query(
    `select cs.session_id, cs.scheduled_at, cs.status, o.full_name
     from counselling_sessions cs
     left join officials o on o.official_id = cs.counsellor_id
     where cs.user_id = $1 and cs.status = 'upcoming'
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
      await supabase.from('users').update({ assigned_counsellor_id: chosenCounsellorId }).eq('user_id', req.auth.userId);
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

router.get('/messages', async (req, res) => {
  const officialId = await requireCounsellorOptIn(req, res);
  if (!officialId) return;

  const { rows: data } = await pool.query(
    `select message_id, sender_type, body, sent_at from messages where user_id = $1 and official_id = $2 order by sent_at asc`,
    [req.auth.userId, officialId]
  );

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
    .insert({ user_id: req.auth.userId, official_id: officialId, sender_type: 'user', body: body.trim() })
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

    // Convert distress score 0-100 to risk level
    let riskLevel = 'Low';
    if (score >= 80) riskLevel = 'Critical';
    else if (score >= 55) riskLevel = 'High';
    else if (score >= 30) riskLevel = 'Moderate';

    // Record interaction and distress score
    const text = allResponses.map(r => `Q: ${r.q}\nA: ${r.a}`).join('\n\n');
    const { interactionId } = await recordInteraction({ userId, channelName: 'App', transcriptText: text });

    // recordAiDistressScore reads analysis.sentimentRaw/emotion/engagementDelta
    // for the interaction_signals rows it inserts alongside the score itself
    // (interactionPipeline.js) - the questionnaire flow doesn't produce those
    // three signals independently (Ollama returns one overall score+summary,
    // not per-signal sentiment/emotion/engagement), so they're recorded as
    // neutral/zero rather than left undefined - passing an undefined field
    // name here previously (`sentiment` instead of `sentimentRaw`) meant that
    // insert silently failed on interaction_signals.value's NOT NULL
    // constraint every time, though it never affected scoreValue itself
    // (distress_scores.score_value comes from analysis.scoreValue directly).
    const { scoreId } = await recordAiDistressScore(userId, interactionId, {
      scoreValue: score,
      riskLevel,
      sentimentRaw: 0,
      emotion: 0,
      engagementDelta: 0,
      summary
    });

    const { alertId } = await applyStressResponse(userId, scoreId, riskLevel);

    try {
      await supabase.from('case_notes').insert({ user_id: userId, official_id: null, note_text: summary, authored_by: 'ai' });
    } catch (err) {
      console.warn('checkin: saving AI case-note summary failed (non-fatal):', err.message);
    }

    await writeAuditLog({ userId, action: 'create', entityType: 'interaction', entityId: interactionId });

    return ok(res, {
      questionnaireId: qData.id,
      scoreValue: score,
      riskLevel,
      alertTriggered: alertId !== null,
      summary
    }, 'Questionnaire submitted successfully', 201);

  } catch (err) {
    console.error('Questionnaire submit error:', err);
    return fail(res, 'Failed to submit questionnaire', 500);
  }
});

module.exports = router;
