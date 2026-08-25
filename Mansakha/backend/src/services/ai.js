const { callGemini } = require('./gemini');
const { computeDistressScore } = require('./scoring');
const { supabase } = require('../db/supabaseClient');

// Orchestrator called in-process by routes/victim.js's checkin flow (no self-HTTP
// call - see routes/ai.js for why the HTTP route still exists separately).
// voice_stress_score stays 0: Phase 1 deferral, per Build Prompt Section 0.

const BASELINE_WINDOW = 5; // how many prior interactions define "normal" for this victim

async function computeEngagementDelta(victimId, currentResponseLength) {
  const { data: priorInteractions } = await supabase
    .from('interactions')
    .select('transcript_length')
    .eq('victim_id', victimId)
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
 * @param {string} victimId
 * @param {string} text - the check-in response text
 * @returns {{ scoreValue: number, riskLevel: string, sentimentRaw: number, emotion: number,
 *   engagementDelta: number, reason: string|null }}
 */
async function resolveInterventionTypeId(name) {
  if (!name) return null;
  const { data } = await supabase.from('intervention_types').select('intervention_type_id').eq('name', name).maybeSingle();
  return data ? data.intervention_type_id : null;
}

async function analyzeInteraction(victimId, text) {
  const [{ sentimentRaw, emotion, reason, suggestedInterventionName }, engagementDelta] = await Promise.all([
    callGemini(text),
    computeEngagementDelta(victimId, text.length),
  ]);

  const { scoreValue, riskLevel } = computeDistressScore(sentimentRaw, 0, emotion, engagementDelta);
  // A suggestion a Counsellor reviews and can override on Log Intervention -
  // never auto-applied (Section 4.4 has no "AI decides" concept anywhere).
  const suggestedInterventionTypeId = await resolveInterventionTypeId(suggestedInterventionName);

  return { scoreValue, riskLevel, sentimentRaw, emotion, engagementDelta, reason, suggestedInterventionTypeId };
}

module.exports = { analyzeInteraction };
