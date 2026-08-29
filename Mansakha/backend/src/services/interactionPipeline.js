const crypto = require('crypto');
const { supabase } = require('../db/supabaseClient');

class PipelineError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Shared by routes/victim.js's /checkin, /chat, and /sos - resolves
// channelName -> channel_id, uploads transcriptText to Supabase Storage
// (bucket "transcripts", at-rest encrypted by Storage itself), inserts the
// interactions row. Same 3 Supabase calls every one of those routes needs.
async function recordInteraction({ victimId, channelName, transcriptText }) {
  const CHANNEL_ALIASES = {
    'Voice Call': 'IVRS',
    'Voice': 'IVRS',
    'IVRS Call': 'IVRS',
    'Chat': 'Chatbot',
    'Text Chat': 'Chatbot',
    'App': 'Mobile App',
    'Broadcast': 'Emergency Broadcast',
  };
  const resolvedChannelName = CHANNEL_ALIASES[channelName] || channelName;

  // 1. Try active channel matching resolvedChannelName or raw channelName
  let { data: channelRow } = await supabase
    .from('channels')
    .select('channel_id')
    .or(`channel_name.eq."${resolvedChannelName}",channel_name.eq."${channelName}"`)
    .is('deleted_at', null)
    .maybeSingle();

  // 2. Fallback: try including soft-deleted rows and auto-restore
  if (!channelRow) {
    const { data: softDeleted } = await supabase
      .from('channels')
      .select('channel_id')
      .or(`channel_name.eq."${resolvedChannelName}",channel_name.eq."${channelName}"`)
      .maybeSingle();

    if (softDeleted) {
      channelRow = softDeleted;
      await supabase.from('channels').update({ deleted_at: null }).eq('channel_id', softDeleted.channel_id);
    }
  }

  // 3. Fallback: if channel still doesn't exist, dynamically insert it
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

  if (!channelRow) throw new PipelineError(`Unknown channel: ${channelName}`, 400);

  const transcriptPath = `${victimId}/${crypto.randomUUID()}.txt`;
  const { error: uploadError } = await supabase.storage.from('transcripts').upload(transcriptPath, transcriptText, { contentType: 'text/plain' });
  if (uploadError) throw new PipelineError(`Could not store transcript: ${uploadError.message}`, 500);

  const { data: interaction, error: interactionError } = await supabase
    .from('interactions')
    .insert({ victim_id: victimId, channel_id: channelRow.channel_id, transcript_ref: transcriptPath, transcript_length: transcriptText.length })
    .select('interaction_id')
    .single();
  if (interactionError) throw new PipelineError('Could not record interaction', 500);

  return { interactionId: interaction.interaction_id };
}

// Shared by /checkin and /chat - writes interaction_signals (4 rows) +
// distress_scores for an AI-analyzed interaction. Takes analyzeInteraction()'s
// or analyzeChatMessage()'s return shape (the latter's extra `reply` field is
// ignored here). /sos never calls this - it writes its own fixed-value
// distress_scores row directly (no interaction_signals, since there are no
// real AI-computed values to report for a self-triggered SOS).
async function recordAiDistressScore(victimId, interactionId, analysis, modelVersion = 'gemini-phase1-v1') {
  const { data: signalTypes } = await supabase.from('signal_types').select('signal_type_id, name');
  const signalIdByName = Object.fromEntries((signalTypes || []).map((s) => [s.name, s.signal_type_id]));

  await supabase.from('interaction_signals').insert([
    { interaction_id: interactionId, signal_type_id: signalIdByName.sentiment_score, value: analysis.sentimentRaw, model_version: modelVersion },
    { interaction_id: interactionId, signal_type_id: signalIdByName.voice_stress_score, value: 0, model_version: modelVersion },
    { interaction_id: interactionId, signal_type_id: signalIdByName.emotion_score, value: analysis.emotion, model_version: modelVersion },
    { interaction_id: interactionId, signal_type_id: signalIdByName.engagement_score, value: analysis.engagementDelta, model_version: modelVersion },
  ]);

  const { data: riskLevelRow, error: riskLevelError } = await supabase.from('risk_levels').select('risk_level_id').eq('name', analysis.riskLevel).single();
  if (riskLevelError || !riskLevelRow) throw new PipelineError(`Could not resolve risk level: ${analysis.riskLevel}`, 500);

  const { data: scoreRow, error } = await supabase
    .from('distress_scores')
    .insert({
      victim_id: victimId,
      interaction_id: interactionId,
      score_value: analysis.scoreValue,
      risk_level_id: riskLevelRow.risk_level_id,
      model_version: modelVersion,
      explanation: analysis.reason || null,
      suggested_intervention_type_id: analysis.suggestedInterventionTypeId,
    })
    .select('score_id')
    .single();
  if (error) throw new PipelineError('Could not record distress score', 500);

  return { scoreId: scoreRow.score_id };
}

module.exports = { recordInteraction, recordAiDistressScore, PipelineError };
