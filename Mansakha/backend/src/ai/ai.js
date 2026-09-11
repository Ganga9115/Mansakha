const { callGemini, callGeminiChat } = require('./gemini');
const { computeDistressScore } = require('./scoring');
const { supabase } = require('../core/db/supabaseClient');

// Orchestrator called in-process by user/routes/user.routes.js's checkin flow (no self-HTTP
// call - see routes/ai.js for why the HTTP route still exists separately).
// voice_stress_score stays 0: Phase 1 deferral, per Build Prompt Section 0.

const BASELINE_WINDOW = 5; // how many prior interactions define "normal" for this user

async function computeEngagementDelta(userId, currentResponseLength) {
  const { data: priorInteractions } = await supabase
    .from('interactions')
    .select('transcript_length')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(BASELINE_WINDOW);

  if (!priorInteractions || priorInteractions.length === 0) {
    return 0; // no baseline yet - first check-in, nothing to compare against
  }

  // transcript_ref is now a Supabase Storage path, not the raw text, so
  // response length is tracked separately in transcript_length instead of
  // being derived from transcript_ref.length.
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
 * @returns {{ scoreValue: number, riskLevel: string, sentimentRaw: number, emotion: number,
 *   engagementDelta: number, reason: string|null }}
 */
async function resolveInterventionTypeId(name) {
  if (!name) return null;
  const { data } = await supabase.from('intervention_types').select('intervention_type_id').eq('name', name).maybeSingle();
  return data ? data.intervention_type_id : null;
}

async function analyzeInteraction(userId, text) {
  const [{ sentimentRaw, emotion, reason, suggestedInterventionName }, engagementDelta] = await Promise.all([
    callGemini(text),
    computeEngagementDelta(userId, text.length),
  ]);

  const { scoreValue, riskLevel } = computeDistressScore(sentimentRaw, 0, emotion, engagementDelta);
  // A suggestion a Counsellor reviews and can override on Log Intervention -
  // never auto-applied (Section 4.4 has no "AI decides" concept anywhere).
  const suggestedInterventionTypeId = await resolveInterventionTypeId(suggestedInterventionName);

  return { scoreValue, riskLevel, sentimentRaw, emotion, engagementDelta, reason, suggestedInterventionTypeId };
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

async function analyzeInteractionFromClientAi(userId, text, clientAnalysis) {
  const sentimentRaw = clamp(clientAnalysis.sentiment, -1, 1);
  const emotion = clamp(clientAnalysis.emotion, 0, 1);
  const reason = typeof clientAnalysis.reason === 'string' ? clientAnalysis.reason : null;

  const engagementDelta = await computeEngagementDelta(userId, text.length);
  const { scoreValue, riskLevel } = computeDistressScore(sentimentRaw, 0, emotion, engagementDelta);
  const suggestedInterventionTypeId = await resolveInterventionTypeId(clientAnalysis.suggestedIntervention);

  return { scoreValue, riskLevel, sentimentRaw, emotion, engagementDelta, reason, suggestedInterventionTypeId };
}

const HIGH_RISK_HELP_POINTER = "\n\nIf things feel unsafe or overwhelming right now, please reach out to real support: call the NHAA Helpline at 14566 (24/7) or talk to your Counsellor through the Support section of this app.";

// Feature Catalog Section 1.3 "AI Chat" - mirrors analyzeInteraction()'s
// shape (same computeEngagementDelta + computeDistressScore calls, both
// unchanged), sourced from callGeminiChat instead of callGemini, and
// returns the extra `reply` field user/routes/user.routes.js's /chat sends back.
async function analyzeChatMessage(userId, text) {
  const [{ sentimentRaw, emotion, reason, suggestedInterventionName, reply }, engagementDelta] = await Promise.all([
    callGeminiChat(text),
    computeEngagementDelta(userId, text.length),
  ]);

  const { scoreValue, riskLevel } = computeDistressScore(sentimentRaw, 0, emotion, engagementDelta);
  const suggestedInterventionTypeId = await resolveInterventionTypeId(suggestedInterventionName);

  // Deterministic safety net: don't rely solely on the model remembering to
  // mention 14566 - computeDistressScore's real, tested threshold decides
  // this, not the model's own judgment call.
  const finalReply = (riskLevel === 'High' || riskLevel === 'Critical') && !reply.includes('14566')
    ? `${reply}${HIGH_RISK_HELP_POINTER}`
    : reply;

  return { scoreValue, riskLevel, sentimentRaw, emotion, engagementDelta, reason, suggestedInterventionTypeId, reply: finalReply };
}

module.exports = { analyzeInteraction, analyzeChatMessage, analyzeInteractionFromClientAi };
