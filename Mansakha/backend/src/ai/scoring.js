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

  // Automatically activate Phase 2 weights when voice stress analytics is active
  const activeWeights = (weights === PHASE_1_WEIGHTS && voiceStress > 0) ? PHASE_2_WEIGHTS : weights;

  const weighted =
    activeWeights.sentiment * sentimentNorm +
    activeWeights.voiceStress * voiceStressNorm +
    activeWeights.emotion * emotionNorm +
    activeWeights.engagement * engagementNorm;

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

// Least-squares fit of y = slope*x + intercept. Returns null when every x is
// identical (e.g. all readings share one timestamp) - vertical line, no slope.
function linearRegression(points) {
  const n = points.length;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

const PREDICTION_WINDOW_DAYS = 14; // how far ahead a crossing still counts as "predicted"
const MIN_POINTS_FOR_PREDICTION = 3;
const MAX_POINTS_FOR_PREDICTION = 8; // recent readings only, so an old spike doesn't dominate the fit
const FLAT_SLOPE_THRESHOLD = 0.5; // points/day - below this, call the trend "flat" rather than rising/falling
const RISK_TIER_THRESHOLDS = [30, 55, 80]; // matches classifyRiskLevel's own boundaries

// Forward-looking counterpart to isEscalatingTrend: the PS asks to "predict
// escalation of psychological distress before a crisis situation emerges," not
// just flag a rise that already happened. Fits a simple linear trend (least-
// squares regression over score-vs-time, in days) through the case's recent
// readings and projects it forward - if the line is rising and would cross
// into a higher risk tier within PREDICTION_WINDOW_DAYS, that's surfaced as a
// predicted escalation. Deliberately a transparent/explainable model (the
// slope and the projected crossing date ARE the explanation) rather than an
// opaque classifier, so a counsellor can see exactly why a case was flagged.
function predictEscalationRisk(historyOldestFirst) {
  const empty = { predictedTrend: 'insufficient_data', projectedScoreIn7Days: null, daysToNextTier: null, nextTier: null };
  const points = historyOldestFirst.slice(-MAX_POINTS_FOR_PREDICTION);
  if (points.length < MIN_POINTS_FOR_PREDICTION) return empty;

  const t0 = new Date(points[0].computedAt).getTime();
  const regressionPoints = points.map((p) => ({
    x: (new Date(p.computedAt).getTime() - t0) / 86400000, // days since this window's first reading
    y: p.score,
  }));

  const fit = linearRegression(regressionPoints);
  if (!fit) return empty;

  const { slope, intercept } = fit;
  const lastPoint = regressionPoints[regressionPoints.length - 1];
  const predictedTrend = slope > FLAT_SLOPE_THRESHOLD ? 'rising' : slope < -FLAT_SLOPE_THRESHOLD ? 'falling' : 'flat';
  const projectedScoreIn7Days = Math.round(clamp(intercept + slope * (lastPoint.x + 7), 0, 100));

  let daysToNextTier = null;
  let nextTier = null;
  if (slope > FLAT_SLOPE_THRESHOLD) {
    const nextThreshold = RISK_TIER_THRESHOLDS.find((t) => t > lastPoint.y);
    if (nextThreshold !== undefined) {
      const daysAhead = (nextThreshold - lastPoint.y) / slope;
      if (daysAhead > 0 && daysAhead <= PREDICTION_WINDOW_DAYS) {
        daysToNextTier = Math.round(daysAhead * 10) / 10;
        nextTier = classifyRiskLevel(nextThreshold);
      }
    }
  }

  return { predictedTrend, projectedScoreIn7Days, daysToNextTier, nextTier };
}

// Batched form of predictEscalationRisk for a jurisdiction/caseload-wide list
// rather than one case at a time - used anywhere a Case Queue, dashboard, or
// admin rollup needs "how many of these users are predicted to escalate soon"
// without an N+1 query per user. `rows` can be in any order (grouped and
// sorted here) - each row is `{userId, score, computedAt}` from a single
// batched SQL fetch of recent scores for every user in scope.
function predictEscalationRiskBatch(rows) {
  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId).push(row);
  }

  const result = new Map();
  for (const [userId, userRows] of byUser) {
    const oldestFirst = [...userRows].sort((a, b) => new Date(a.computedAt) - new Date(b.computedAt));
    result.set(userId, predictEscalationRisk(oldestFirst));
  }
  return result;
}

module.exports = {
  PHASE_1_WEIGHTS,
  PHASE_2_WEIGHTS,
  computeDistressScore,
  classifyRiskLevel,
  isEscalatingTrend,
  predictEscalationRisk,
  predictEscalationRiskBatch,
};
