// Dynamic Distress Score Engine - Build Prompt Section 5.
//
// This is a corrected version of the formula as written in the spec. The spec's raw
// formula had two bugs, found and fixed here (not carried into code as-is):
//   1. The weighted sum of four 0..1-ish terms tops out around ~1.0, but the risk
//      thresholds (30/55/80) assume a 0-100 scale - needed an explicit x100.
//   2. sentiment_score was specified as a signed -1..+1 range while the other three
//      signals are 0..1 - normalized here to 0..1 before weighting so the sum means
//      what it looks like it means.
//
// Weights are data, not a hardcoded formula, so Phase 2 (real voice-stress scoring)
// can drop in without touching this function's shape. While voice_stress_score is
// deferred (always 0, per Section 0), its 0.3 weight is redistributed across the
// other three active signals - otherwise the max reachable score is 70/100 and
// Critical (>=80) is mathematically unreachable, which would make the alert flow
// impossible to demo.

const PHASE_1_WEIGHTS = Object.freeze({
  // voice_stress_score's 0.3 share redistributed proportionally: 0.4/0.2/0.1 -> sum to 1.0
  sentiment: 4 / 7,       // 0.5714...
  voiceStress: 0,          // deferred - see Build Prompt Section 0
  emotion: 2 / 7,          // 0.2857...
  engagement: 1 / 7,       // 0.1429...
});

// The real weights from the spec, ready to switch to once voice-stress scoring
// (Phase 2) is actually producing values - not used yet.
const PHASE_2_WEIGHTS = Object.freeze({
  sentiment: 0.4,
  voiceStress: 0.3,
  emotion: 0.2,
  engagement: 0.1,
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {number} sentimentRaw   -1..+1, already inverted so higher = more distress
 * @param {number} voiceStress    0..1 (pass 0 while Phase 1 - component deferred)
 * @param {number} emotion        0..1, weighted toward fear/sadness
 * @param {number} engagementDelta 0..1, drop in response length/frequency vs baseline
 * @param {object} weights        defaults to PHASE_1_WEIGHTS
 * @returns {{ scoreValue: number, riskLevel: string }}
 */
function computeDistressScore(sentimentRaw, voiceStress, emotion, engagementDelta, weights = PHASE_1_WEIGHTS) {
  const sentimentNorm = clamp((sentimentRaw + 1) / 2, 0, 1);
  const voiceStressNorm = clamp(voiceStress, 0, 1);
  const emotionNorm = clamp(emotion, 0, 1);
  const engagementNorm = clamp(engagementDelta, 0, 1);

  const weighted =
    weights.sentiment * sentimentNorm +
    weights.voiceStress * voiceStressNorm +
    weights.emotion * emotionNorm +
    weights.engagement * engagementNorm;

  const scoreValue = clamp(Math.round(weighted * 100), 0, 100);

  return { scoreValue, riskLevel: classifyRiskLevel(scoreValue) };
}

function classifyRiskLevel(scoreValue) {
  if (scoreValue < 30) return 'Low';
  if (scoreValue < 55) return 'Moderate';
  if (scoreValue < 80) return 'High';
  return 'Critical';
}

// "escalating" if the last 3 scores (oldest -> newest) are monotonically increasing
// by >= 10 points total, per Build Prompt Section 5.
function isEscalatingTrend(lastThreeScoresOldestFirst) {
  if (lastThreeScoresOldestFirst.length < 3) return false;
  const [a, b, c] = lastThreeScoresOldestFirst;
  const monotonic = a <= b && b <= c;
  const totalRise = c - a;
  return monotonic && totalRise >= 10;
}

module.exports = {
  PHASE_1_WEIGHTS,
  PHASE_2_WEIGHTS,
  computeDistressScore,
  classifyRiskLevel,
  isEscalatingTrend,
};
