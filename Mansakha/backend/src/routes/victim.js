const express = require('express');
const crypto = require('crypto');
const { supabase } = require('../db/supabaseClient');
const { analyzeInteraction } = require('../services/ai');
const { writeAuditLog } = require('../services/auditLog');
const { enqueueAlertDispatch } = require('../services/dispatchWorker');
const { verifyToken } = require('../middleware/verifyToken');
const { generalApiLimiter } = require('../middleware/rateLimiter');
const { ok, fail } = require('../services/responseEnvelope');

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

router.get('/dashboard', verifyToken, requireVictim, generalApiLimiter, async (req, res) => {
  const victimId = req.auth.victimId;

  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .select('status, case_stage, preferred_language')
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
    caseStatus: { status: victim.status, caseStage: victim.case_stage },
    preferredLanguageId: victim.preferred_language,
    currentDistressLevel: latestScore
      ? { score: latestScore.score_value, riskLevel: latestScore.risk_levels.name }
      : null,
    nextCheckIn,
    alerts: (openAlerts || []).map((a) => ({ alertId: a.alert_id, triggeredAt: a.triggered_at, status: a.alert_statuses.name })),
    supportLinks: SUPPORT_LINKS,
  });
});

router.post('/checkin', verifyToken, requireVictim, generalApiLimiter, async (req, res) => {
  const victimId = req.auth.victimId;
  const { channel, responses } = req.body;
  if (!channel || !Array.isArray(responses) || responses.length === 0) {
    return fail(res, 'channel and a non-empty responses[] are required', 400);
  }

  const { data: channelRow } = await supabase.from('channels').select('channel_id').eq('channel_name', channel).maybeSingle();
  if (!channelRow) return fail(res, `Unknown channel: ${channel}`, 400);

  const text = responses.join(' ');

  // Raw check-in text goes into Supabase Storage, not directly into a
  // Postgres column - Storage encrypts at rest; transcript_ref is a real
  // pointer, not the transcript itself.
  const transcriptPath = `${victimId}/${crypto.randomUUID()}.txt`;
  const { error: uploadError } = await supabase.storage.from('transcripts').upload(transcriptPath, text, { contentType: 'text/plain' });
  if (uploadError) return fail(res, `Could not store check-in transcript: ${uploadError.message}`, 500);

  const { data: interaction, error: interactionError } = await supabase
    .from('interactions')
    .insert({ victim_id: victimId, channel_id: channelRow.channel_id, transcript_ref: transcriptPath, transcript_length: text.length })
    .select('interaction_id')
    .single();
  if (interactionError) return fail(res, 'Could not record interaction', 500);

  let analysis;
  try {
    analysis = await analyzeInteraction(victimId, text);
  } catch (err) {
    return fail(res, `Check-in recorded, but analysis failed: ${err.message}`, 502);
  }

  const { data: signalTypes } = await supabase.from('signal_types').select('signal_type_id, name');
  const signalIdByName = Object.fromEntries((signalTypes || []).map((s) => [s.name, s.signal_type_id]));
  const modelVersion = 'gemini-phase1-v1';

  await supabase.from('interaction_signals').insert([
    { interaction_id: interaction.interaction_id, signal_type_id: signalIdByName.sentiment_score, value: analysis.sentimentRaw, model_version: modelVersion },
    { interaction_id: interaction.interaction_id, signal_type_id: signalIdByName.voice_stress_score, value: 0, model_version: modelVersion },
    { interaction_id: interaction.interaction_id, signal_type_id: signalIdByName.emotion_score, value: analysis.emotion, model_version: modelVersion },
    { interaction_id: interaction.interaction_id, signal_type_id: signalIdByName.engagement_score, value: analysis.engagementDelta, model_version: modelVersion },
  ]);

  const { data: riskLevelRow } = await supabase.from('risk_levels').select('risk_level_id').eq('name', analysis.riskLevel).single();

  const { data: scoreRow } = await supabase
    .from('distress_scores')
    .insert({
      victim_id: victimId,
      interaction_id: interaction.interaction_id,
      score_value: analysis.scoreValue,
      risk_level_id: riskLevelRow.risk_level_id,
      model_version: modelVersion,
      // Gemini's own natural-language reasoning - previously requested and
      // received (services/ai.js) but discarded here instead of persisted,
      // so Counsellors only ever saw numeric signal values, never the actual
      // explanation sentence.
      explanation: analysis.reason || null,
      suggested_intervention_type_id: analysis.suggestedInterventionTypeId,
    })
    .select('score_id')
    .single();

  let alertId = null;
  if (analysis.riskLevel === 'High' || analysis.riskLevel === 'Critical') {
    const { data: openStatus } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Open').single();
    const { data: alert } = await supabase
      .from('alerts')
      .insert({ victim_id: victimId, distress_score_id: scoreRow.score_id, alert_status_id: openStatus.alert_status_id })
      .select('alert_id')
      .single();
    alertId = alert.alert_id;

    // Route to the assigned Counsellor AND every District Administration official
    // in the victim's jurisdiction - Build Prompt Section 4.4's explicit alert
    // routing requirement, not just a single recipient.
    const { data: victimRow } = await supabase.from('victims').select('jurisdiction_id').eq('victim_id', victimId).single();
    const { data: districtOfficials } = await supabase
      .from('official_roles')
      .select('official_id, roles(role_name)')
      .eq('jurisdiction_id', victimRow.jurisdiction_id)
      .is('revoked_at', null);

    const recipients = (districtOfficials || [])
      .filter((r) => r.roles.role_name === 'Administration' || r.roles.role_name === 'Counsellor')
      .map((r) => ({ alert_id: alertId, official_id: r.official_id }));

    if (recipients.length > 0) {
      await supabase.from('alert_notifications').insert(recipients);
      // Durable dispatch queue entry per recipient - the actual "worker
      // dispatches with retry" half of Section 0b, not just the table write.
      await enqueueAlertDispatch(alertId, victimId, recipients.map((r) => r.official_id));
    }
  }

  await writeAuditLog({ victimId, action: 'create', entityType: 'interaction', entityId: interaction.interaction_id });

  return ok(res, {
    interactionId: interaction.interaction_id,
    scoreValue: analysis.scoreValue,
    riskLevel: analysis.riskLevel,
    alertTriggered: alertId !== null,
  }, null, 201);
});

// Screen Inventory (Section 8) shows Consent as its own step after login, before
// the Home Dashboard - extending the API contract to support it, per Section 7's
// own "extend as needed." One row per channel actually consented to.
router.post('/consent', verifyToken, requireVictim, generalApiLimiter, async (req, res) => {
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
router.patch('/language', verifyToken, requireVictim, generalApiLimiter, async (req, res) => {
  const { languageId } = req.body;
  if (!languageId) return fail(res, 'languageId is required', 400);

  const { error } = await supabase.from('victims').update({ preferred_language: languageId }).eq('victim_id', req.auth.victimId);
  if (error) return fail(res, `Could not update language: ${error.message}`, 500);

  return ok(res, null, 'Language updated');
});

router.get('/consent-status', verifyToken, requireVictim, generalApiLimiter, async (req, res) => {
  const { data } = await supabase.from('consent_records').select('consent_id').eq('victim_id', req.auth.victimId).is('revoked_at', null).limit(1);
  return ok(res, { hasConsented: (data || []).length > 0 });
});

router.get('/distress-history', verifyToken, requireVictim, generalApiLimiter, async (req, res) => {
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
