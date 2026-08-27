const { supabase } = require('../db/supabaseClient');
const { generateProactiveContactMessage } = require('./gemini');

// Closes both "no proactive scheduling" and "no real alert-dispatch worker"
// (Section 4.2 / Section 0b) with one mechanism: a durable dispatch_queue,
// populated by (a) a periodic scan for overdue check-ins, (b) alert/SOS
// creation (routes/victim.js, services/stressResponse.js), and (c) Feature
// Catalog Section 1.3/1.5's newer kinds (ivrs_call, sms_checkin_prompt,
// wellness_push, ai_proactive_contact) - drained here with retry-with-backoff.
//
// What's real vs. still missing, disclosed rather than hidden: sendExpoPush
// below is a genuine call to Expo's push endpoint (no separate API key
// needed for basic sending), and the queue/scan/drain/retry logic is fully
// wired and exercised. What's NOT done this pass is the frontend half -
// registering a real device token via `expo-notifications` - because that
// package doesn't support web at all, and web has been this project's only
// reliably-testable platform this session; wiring it against native-only
// would be shipped untested. Every dispatch_queue row will simply fail with
// "No push token registered" until a real device registers one via
// PATCH /api/me/push-token (already built, frontend-pending) - tracked in
// LAST_PRIORITY.md alongside the Google/Firebase/Exotel credentials gaps.
// IVRS (Exotel) and SMS-prompt (Twilio Messages, not Verify) sending follow
// the same "never fabricate success" rule: attempt a real call/send only if
// the relevant credentials are actually configured, otherwise log plainly
// and leave the row to exhaust its retries like any other undeliverable one.

const MAX_ATTEMPTS = 5;
const CHECKIN_DUE_DAYS = 7; // matches NEXT_CHECKIN_CADENCE_DAYS in routes/victim.js
const RETRY_BACKOFF_MS = 5 * 60 * 1000;

async function sendExpoPush(token, title, body) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body }),
  });
  const json = await res.json().catch(() => null);
  const ticket = json?.data;
  if (!res.ok || ticket?.status === 'error') {
    throw new Error(ticket?.message || `Expo push send failed (${res.status})`);
  }
  return ticket;
}

async function enqueueAlertDispatch(alertId, victimId, officialIds) {
  if (!officialIds || officialIds.length === 0) return;
  const rows = officialIds.map((officialId) => ({ kind: 'alert', alert_id: alertId, victim_id: victimId, official_id: officialId }));
  const { error } = await supabase.from('dispatch_queue').insert(rows);
  if (error) throw new Error(`Could not enqueue alert dispatch: ${error.message}`);
}

// Idempotent scan: a victim already has an undelivered checkin_due row
// skipped, so re-running this on every tick doesn't pile up duplicates.
async function scanCheckinsDue() {
  const cutoff = new Date(Date.now() - CHECKIN_DUE_DAYS * 86400000).toISOString();

  const { data: victims, error } = await supabase.from('victims').select('victim_id').eq('status', 'active');
  if (error) throw new Error(`Could not scan for due check-ins: ${error.message}`);

  for (const victim of victims || []) {
    const { data: lastInteraction } = await supabase
      .from('interactions')
      .select('occurred_at')
      .eq('victim_id', victim.victim_id)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastInteraction && lastInteraction.occurred_at > cutoff) continue; // not due yet

    const { data: existing } = await supabase
      .from('dispatch_queue')
      .select('dispatch_id')
      .eq('kind', 'checkin_due')
      .eq('victim_id', victim.victim_id)
      .is('delivered_at', null)
      .maybeSingle();
    if (existing) continue; // already queued

    await supabase.from('dispatch_queue').insert({ kind: 'checkin_due', victim_id: victim.victim_id });
  }
}

// Feature Catalog Section 1.3 "IVRS Call" delivery. Real Exotel call only if
// configured - see the header comment on why a fabricated success is never
// acceptable here.
async function placeIvrsCall(victim) {
  if (!process.env.EXOTEL_API_KEY || !process.env.EXOTEL_API_TOKEN) {
    throw new Error('IVRS provider not configured');
  }
  // Exotel's Connect API call would go here once real trial-account
  // credentials are provisioned (see backend/.env.example's note on Exotel
  // not being a genuine free tier) - intentionally not implemented against
  // no real account, matching this codebase's "disclosed gap, not a fake
  // call" convention elsewhere.
  throw new Error('IVRS provider configured but call placement is not yet implemented');
}

// Feature Catalog Section 1.3 "SMS check-in" outbound prompt delivery. Uses
// Twilio's Messages API (a different capability than the now-removed
// Verify-based OTP flow) - same account credentials, but needs a purchased
// Twilio phone number (TWILIO_PHONE_NUMBER) to send FROM, which isn't
// provisioned. Real send only if fully configured.
async function sendSmsCheckinPrompt(victim) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    throw new Error('SMS provider not configured (TWILIO_PHONE_NUMBER missing)');
  }
  const { data: identity } = await supabase.from('victim_identity').select('contact_number').eq('victim_id', victim.victim_id).maybeSingle();
  if (!identity?.contact_number) throw new Error('No phone number on file for this victim');

  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    to: identity.contact_number,
    from: process.env.TWILIO_PHONE_NUMBER,
    body: 'Mansakha check-in: How are you feeling today? Reply or open the app to share.',
  });
}

// Ministry Analytics & Workflow spec Task 2C "Emergency Broadcast" SMS
// delivery (migration_010). Same Twilio Messages API call as
// sendSmsCheckinPrompt above, just sending the admin's own freeform
// dispatch_queue.message instead of the fixed check-in-prompt text - kept as
// a separate function (rather than a bodyText param on sendSmsCheckinPrompt)
// so that function's fixed prompt text stays obviously fixed, matching this
// file's one-function-per-kind style. Real send only if fully configured,
// same "never fabricate success" rule as every other kind here.
async function sendAdminBroadcastSms(victim, messageText) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    throw new Error('SMS provider not configured (TWILIO_PHONE_NUMBER missing)');
  }
  const { data: identity } = await supabase.from('victim_identity').select('contact_number').eq('victim_id', victim.victim_id).maybeSingle();
  if (!identity?.contact_number) throw new Error('No phone number on file for this victim');

  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    to: identity.contact_number,
    from: process.env.TWILIO_PHONE_NUMBER,
    body: messageText,
  });
}

// Feature Catalog Section 1.5 "Moderate" tier - a simple, non-over-engineered
// category pick: the victim's most recent emotion_score (fear/sadness
// weighted, per services/gemini.js's prompt) above 0.5 suggests a calming
// activity; otherwise an energizing one. Not a model, just one signal read.
async function pickWellnessCategory(victimId) {
  const { data: lastInteraction } = await supabase
    .from('interactions')
    .select('interaction_id')
    .eq('victim_id', victimId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastInteraction) return 'exercise';

  const { data: signal } = await supabase
    .from('interaction_signals')
    .select('value, signal_types!inner(name)')
    .eq('interaction_id', lastInteraction.interaction_id)
    .eq('signal_types.name', 'emotion_score')
    .maybeSingle();

  return signal && signal.value > 0.5 ? 'meditation' : 'exercise';
}

async function drainDispatchQueue() {
  const retryCutoff = new Date(Date.now() - RETRY_BACKOFF_MS).toISOString();
  const { data: pending, error } = await supabase
    .from('dispatch_queue')
    .select('dispatch_id, kind, victim_id, official_id, attempt_count, last_attempt_at, message, priority')
    .is('delivered_at', null)
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`Could not read dispatch queue: ${error.message}`);

  for (const item of pending || []) {
    if (item.last_attempt_at && item.last_attempt_at > retryCutoff) continue; // backoff window not elapsed

    const attemptPatch = { attempt_count: item.attempt_count + 1, last_attempt_at: new Date().toISOString() };
    try {
      if (item.kind === 'ivrs_call') {
        await placeIvrsCall({ victim_id: item.victim_id });
      } else if (item.kind === 'sms_checkin_prompt') {
        await sendSmsCheckinPrompt({ victim_id: item.victim_id });
      } else if (item.kind === 'admin_broadcast_sms') {
        await sendAdminBroadcastSms({ victim_id: item.victim_id }, item.message || 'This is an emergency broadcast from Mansakha.');
      } else {
        // checkin_due / alert / wellness_push / ai_proactive_contact /
        // admin_broadcast_push all deliver via Expo push to a victim or
        // official's device token.
        const isAlert = item.kind === 'alert';
        const targetTable = isAlert ? 'officials' : 'victims';
        const idColumn = isAlert ? 'official_id' : 'victim_id';
        const targetId = isAlert ? item.official_id : item.victim_id;
        const { data: target } = await supabase.from(targetTable).select('expo_push_token').eq(idColumn, targetId).maybeSingle();
        if (!target?.expo_push_token) throw new Error('No push token registered for this recipient');

        let title = 'Check-in reminder';
        let body = "It's been a while since your last check-in.";
        if (isAlert) {
          title = 'New distress alert';
          body = 'A case in your jurisdiction needs review.';
        } else if (item.kind === 'wellness_push') {
          const category = await pickWellnessCategory(item.victim_id);
          title = 'A moment for yourself';
          body = category === 'meditation' ? 'Try a short breathing exercise in the Wellness section.' : 'A quick activity might help - check the Wellness section.';
        } else if (item.kind === 'ai_proactive_contact') {
          title = 'Checking in on you';
          try {
            body = await generateProactiveContactMessage('recent check-ins show rising distress');
          } catch (err) {
            body = 'We noticed things might be tough right now. We are here if you want to talk.';
          }
        } else if (item.kind === 'admin_broadcast_push') {
          title = item.priority === 'urgent' ? 'URGENT: Emergency Broadcast' : 'Emergency Broadcast';
          body = item.message || 'This is an emergency broadcast from Mansakha.';
        }
        await sendExpoPush(target.expo_push_token, title, body);
      }

      await supabase.from('dispatch_queue').update({ ...attemptPatch, delivered_at: new Date().toISOString() }).eq('dispatch_id', item.dispatch_id);
    } catch (err) {
      await supabase.from('dispatch_queue').update(attemptPatch).eq('dispatch_id', item.dispatch_id);
    }
  }
}

function startDispatchWorker(intervalMs = 60000) {
  const tick = async () => {
    try {
      await scanCheckinsDue();
      await drainDispatchQueue();
    } catch (err) {
      console.error('Dispatch worker tick failed:', err.message);
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = { enqueueAlertDispatch, scanCheckinsDue, drainDispatchQueue, startDispatchWorker, sendExpoPush };
