const { callOllama, callOllamaChat } = require('./ollama');
const { computeDistressScore } = require('./scoring');
const { supabase } = require('../core/db/supabaseClient');
const {
  analyzeTextViaDjango,
  analyzeVoiceViaDjango,
  analyzeMultimodalViaDjango,
  chatViaDjango,
} = require('./djangoAiClient');

// Orchestrator called in-process by user/routes/user.routes.js's checkin flow.
// Multi-modal AI: Supports Voice Stress Analytics (Phase 2), fine-tuned NLP, and Ollama.

const BASELINE_WINDOW = 5; // how many prior interactions define "normal" for this user

// `excludeInteractionId`: the /checkin and /chat routes both call
// recordInteraction() (which inserts THIS interaction's own row into
// `interactions`) before running analysis - without excluding that row
// here, "prior interactions" always included the very response being
// measured against its own baseline, since it's the most recent row for
// this user by construction. That silently pulled the baseline average
// toward the current value on every single call: a real drop in engagement
// reads smaller than it should (the current, lower value drags the average
// down with it), understating exactly the signal this is meant to catch.
async function computeEngagementDelta(userId, currentResponseLength, excludeInteractionId = null) {
  let query = supabase
    .from('interactions')
    .select('transcript_length')
    .eq('user_id', userId);
  if (excludeInteractionId) query = query.neq('interaction_id', excludeInteractionId);
  // .neq() above is a WHERE-clause filter, applied before .limit() regardless
  // of chaining order - so this always returns BASELINE_WINDOW *prior* rows,
  // never the current one.
  const { data: priorInteractions } = await query.order('occurred_at', { ascending: false }).limit(BASELINE_WINDOW);

  if (!priorInteractions || priorInteractions.length === 0) {
    return 0; // no baseline yet - first check-in, nothing to compare against
  }

  const baselineLengths = priorInteractions
    .map((i) => i.transcript_length || 0)
    .filter((len) => len > 0);

  if (baselineLengths.length === 0) return 0;

  const baselineAvg = baselineLengths.reduce((a, b) => a + b, 0) / baselineLengths.length;
  if (baselineAvg === 0) return 0;

  const drop = (baselineAvg - currentResponseLength) / baselineAvg;
  return Math.max(0, Math.min(1, drop)); // only a DROP in engagement counts as a signal
}

/**
 * @param {string} userId
 * @param {string} text - the check-in response text
 * @param {object} [options] - optional { audioBase64 } for voice/audio check-in
 * @returns {{ scoreValue: number, riskLevel: string, sentimentRaw: number, emotion: number,
 *   voiceStressScore: number, engagementDelta: number, reason: string|null }}
 */
async function resolveInterventionTypeId(name) {
  if (!name) return null;
  const { data } = await supabase.from('intervention_types').select('intervention_type_id').eq('name', name).maybeSingle();
  return data ? data.intervention_type_id : null;
}

async function analyzeInteraction(userId, text, options = {}) {
  let sentimentRaw = 0;
  let emotion = 0.2;
  let voiceStressScore = 0;
  let reason = null;
  let suggestedInterventionName = null;
  let effectiveText = text || '';

  // 1. If audio is provided, run full multimodal pipeline (Voice Stress + STT + Sentiment + Emotion)
  if (options.audioBase64) {
    const multiResult = await analyzeMultimodalViaDjango(effectiveText, options.audioBase64);
    if (multiResult && multiResult.success) {
      sentimentRaw = multiResult.sentimentRaw;
      emotion = multiResult.emotionScore;
      voiceStressScore = multiResult.voiceStressScore;
      reason = multiResult.reason;
      suggestedInterventionName = multiResult.suggestedIntervention;
      if (!effectiveText && multiResult.transcript) {
        effectiveText = multiResult.transcript;
      }
    }
  }

  // 2. If text analysis not completed by multimodal, query Django fine-tuned models
  if (!reason && effectiveText) {
    const djangoTextRes = await analyzeTextViaDjango(effectiveText);
    if (djangoTextRes && djangoTextRes.success) {
      sentimentRaw = djangoTextRes.sentimentRaw;
      emotion = djangoTextRes.emotionScore;
    }
  }

  // 3. Complete assessment with Ollama clinical rationale and fallback heuristics
  if (!reason) {
    const ollamaAssessment = await callOllama(effectiveText);
    if (sentimentRaw === 0) sentimentRaw = ollamaAssessment.sentimentRaw;
    if (emotion === 0.2) emotion = ollamaAssessment.emotion;
    reason = ollamaAssessment.reason;
    suggestedInterventionName = ollamaAssessment.suggestedInterventionName;
  }

  const engagementDelta = await computeEngagementDelta(userId, effectiveText.length, options.interactionId);
  // Real voiceStressScore activates PHASE_2_WEIGHTS (0.4 sentiment, 0.3 voice stress, 0.2 emotion, 0.1 engagement)
  const { scoreValue, riskLevel } = computeDistressScore(sentimentRaw, voiceStressScore, emotion, engagementDelta);
  const suggestedInterventionTypeId = await resolveInterventionTypeId(suggestedInterventionName);

  return {
    scoreValue,
    riskLevel,
    sentimentRaw,
    emotion,
    voiceStressScore,
    engagementDelta,
    reason,
    suggestedInterventionTypeId,
    transcript: effectiveText,
  };
}

// Feature Catalog Section 1.3 "AI Chat" check-in, Ollama variant - the mobile
// app's Check-in screen now runs its own conversation against a locally-running
// Ollama instance (frontend/src/services/ollamaClient.js) instead of a per-message
// Gemini call, then sends ONE analysis of the whole conversation here. Mirrors
// analyzeInteraction()'s shape exactly (same computeEngagementDelta +
// computeDistressScore + resolveInterventionTypeId calls, all unchanged, so
// scoring.js/alerts/case-notes stay untouched) - only the sentiment/emotion/
// reason/suggestedIntervention values are sourced from the client's Ollama
// analysis instead of a server-side callGemini().
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function analyzeInteractionFromClientAi(userId, text, clientAnalysis, interactionId = null) {
  const sentimentRaw = clamp(clientAnalysis.sentiment, -1, 1);
  const emotion = clamp(clientAnalysis.emotion, 0, 1);
  const reason = typeof clientAnalysis.reason === 'string' ? clientAnalysis.reason : null;

  const engagementDelta = await computeEngagementDelta(userId, text.length, interactionId);
  const { scoreValue, riskLevel } = computeDistressScore(sentimentRaw, 0, emotion, engagementDelta);
  const suggestedInterventionTypeId = await resolveInterventionTypeId(clientAnalysis.suggestedIntervention);

  return { scoreValue, riskLevel, sentimentRaw, emotion, engagementDelta, reason, suggestedInterventionTypeId };
}

const HIGH_RISK_HELP_POINTER = "\n\nIf things feel unsafe or overwhelming right now, please reach out to real support: call the NHAA Helpline at 14566 (24/7) or talk to your Counsellor through the Support section of this app.";

// Feature Catalog Section 1.3 "AI Chat" - mirrors analyzeInteraction()'s
// shape (same computeEngagementDelta + computeDistressScore calls, both
// unchanged), sourced from callGeminiChat instead of callGemini, and
// returns the extra `reply` field user/routes/user.routes.js's /chat sends back.
async function analyzeChatMessage(userId, text, interactionId = null) {
  let sentimentRaw = 0;
  let emotion = 0.2;
  let reason = 'Conversational screening performed.';
  let suggestedInterventionName = null;
  let reply = '';

  // 1. Try Django AI companion endpoint
  const djangoChat = await chatViaDjango(text);
  if (djangoChat && djangoChat.reply) {
    reply = djangoChat.reply;
    sentimentRaw = djangoChat.sentiment_raw || 0;
    emotion = djangoChat.emotion_score || 0.2;
    if (djangoChat.dominant_emotion && ['fear', 'sadness', 'anger'].includes(djangoChat.dominant_emotion)) {
      suggestedInterventionName = 'Counselling';
    }
  } else {
    // 2. Fallback to direct Ollama chat
    const ollamaChat = await callOllamaChat(text);
    sentimentRaw = ollamaChat.sentimentRaw;
    emotion = ollamaChat.emotion;
    reason = ollamaChat.reason;
    suggestedInterventionName = ollamaChat.suggestedInterventionName;
    reply = ollamaChat.reply;
  }

  const engagementDelta = await computeEngagementDelta(userId, text.length, interactionId);
  const { scoreValue, riskLevel } = computeDistressScore(sentimentRaw, 0, emotion, engagementDelta);
  const suggestedInterventionTypeId = await resolveInterventionTypeId(suggestedInterventionName);

  // Deterministic safety net: don't rely solely on the model remembering to
  // mention 14566 - computeDistressScore's real, tested threshold decides
  // this, not the model's own judgment call.
  const finalReply = (riskLevel === 'High' || riskLevel === 'Critical') && !reply.includes('14566')
    ? `${reply}${HIGH_RISK_HELP_POINTER}`
    : reply;

  return {
    scoreValue,
    riskLevel,
    sentimentRaw,
    emotion,
    engagementDelta,
    reason,
    suggestedInterventionTypeId,
    reply: finalReply,
  };
}

async function analyzeVoiceInteraction(userId, audioBase64) {
  return analyzeInteraction(userId, '', { audioBase64 });
}

module.exports = {
  analyzeInteraction,
  analyzeChatMessage,
  analyzeInteractionFromClientAi,
  analyzeVoiceInteraction,
};
