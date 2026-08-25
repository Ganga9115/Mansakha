const { supabase } = require('../db/supabaseClient');

// Closes both "no proactive scheduling" and "no real alert-dispatch worker"
// (Section 4.2 / Section 0b) with one mechanism: a durable dispatch_queue,
// populated by (a) a periodic scan for overdue check-ins and (b) alert
// creation (routes/victim.js), drained here with retry-with-backoff via
// Expo push notifications.
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

async function drainDispatchQueue() {
  const retryCutoff = new Date(Date.now() - RETRY_BACKOFF_MS).toISOString();
  const { data: pending, error } = await supabase
    .from('dispatch_queue')
    .select('dispatch_id, kind, victim_id, official_id, attempt_count, last_attempt_at')
    .is('delivered_at', null)
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw new Error(`Could not read dispatch queue: ${error.message}`);

  for (const item of pending || []) {
    if (item.last_attempt_at && item.last_attempt_at > retryCutoff) continue; // backoff window not elapsed

    const isAlert = item.kind === 'alert';
    const targetTable = isAlert ? 'officials' : 'victims';
    const idColumn = isAlert ? 'official_id' : 'victim_id';
    const targetId = isAlert ? item.official_id : item.victim_id;
    const { data: target } = await supabase.from(targetTable).select('expo_push_token').eq(idColumn, targetId).maybeSingle();

    const attemptPatch = { attempt_count: item.attempt_count + 1, last_attempt_at: new Date().toISOString() };
    try {
      if (!target?.expo_push_token) throw new Error('No push token registered for this recipient');
      const title = isAlert ? 'New distress alert' : 'Check-in reminder';
      const body = isAlert ? 'A case in your jurisdiction needs review.' : "It's been a while since your last check-in.";
      await sendExpoPush(target.expo_push_token, title, body);
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
