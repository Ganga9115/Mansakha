const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDistressScore, classifyRiskLevel, isEscalatingTrend, predictEscalationRisk, predictEscalationRiskBatch, PHASE_1_WEIGHTS } = require('./scoring');

// Helper: build oldest-first history from scores spaced exactly 1 day apart,
// starting 2026-01-01, so tests can reason in plain "points per day".
function historyFromScores(scores) {
  return scores.map((score, i) => ({ score, computedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));
}

test('classifyRiskLevel boundaries match Build Prompt Section 5 thresholds', () => {
  assert.equal(classifyRiskLevel(0), 'Low');
  assert.equal(classifyRiskLevel(29), 'Low');
  assert.equal(classifyRiskLevel(30), 'Moderate');
  assert.equal(classifyRiskLevel(54), 'Moderate');
  assert.equal(classifyRiskLevel(55), 'High');
  assert.equal(classifyRiskLevel(79), 'High');
  assert.equal(classifyRiskLevel(80), 'Critical');
  assert.equal(classifyRiskLevel(100), 'Critical');
});

test('PHASE_1_WEIGHTS sum to 1 and Critical stays reachable while voice_stress is deferred', () => {
  const sum = PHASE_1_WEIGHTS.sentiment + PHASE_1_WEIGHTS.voiceStress + PHASE_1_WEIGHTS.emotion + PHASE_1_WEIGHTS.engagement;
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights should sum to 1, got ${sum}`);

  // Worst-case distress input (max sentiment, emotion, engagement; voice_stress
  // always 0 in Phase 1) must still classify as Critical - this is the exact bug
  // this formula was rewritten to fix.
  const { scoreValue, riskLevel } = computeDistressScore(1, 0, 1, 1);
  assert.equal(scoreValue, 100);
  assert.equal(riskLevel, 'Critical');
});

test('computeDistressScore normalizes signed sentiment before weighting', () => {
  // Neutral sentiment (0), no emotion/engagement signal at all -> score should be
  // roughly the midpoint of sentiment's contribution, not negative or absurd.
  const { scoreValue } = computeDistressScore(0, 0, 0, 0);
  assert.ok(scoreValue >= 0 && scoreValue <= 100);
  assert.equal(scoreValue, Math.round(PHASE_1_WEIGHTS.sentiment * 0.5 * 100));
});

test('computeDistressScore clamps to 0-100 even with out-of-range inputs', () => {
  const { scoreValue } = computeDistressScore(5, 5, 5, 5); // deliberately invalid inputs
  assert.ok(scoreValue >= 0 && scoreValue <= 100);
});

test('isEscalatingTrend requires 3 scores, monotonic increase, and >=10 total rise', () => {
  assert.equal(isEscalatingTrend([10, 20]), false); // fewer than 3
  assert.equal(isEscalatingTrend([10, 25, 22]), false); // not monotonic
  assert.equal(isEscalatingTrend([10, 14, 18]), false); // monotonic but only +8 total
  assert.equal(isEscalatingTrend([10, 18, 25]), true); // monotonic, +15 total
  assert.equal(isEscalatingTrend([10, 10, 20]), true); // flat-then-rise still monotonic (<=), +10 total
});

test('predictEscalationRisk needs at least 3 readings', () => {
  const result = predictEscalationRisk(historyFromScores([20, 25]));
  assert.equal(result.predictedTrend, 'insufficient_data');
  assert.equal(result.daysToNextTier, null);
});

test('predictEscalationRisk calls a flat/noisy series "flat", not rising or falling', () => {
  const result = predictEscalationRisk(historyFromScores([40, 41, 39, 40, 41]));
  assert.equal(result.predictedTrend, 'flat');
  assert.equal(result.daysToNextTier, null);
});

test('predictEscalationRisk projects a steady rise across the Moderate/High boundary (55)', () => {
  // +5/day, currently at 50 (Moderate) - crosses 55 in (55-50)/5 = 1 day.
  const result = predictEscalationRisk(historyFromScores([40, 45, 50]));
  assert.equal(result.predictedTrend, 'rising');
  assert.equal(result.nextTier, 'High');
  assert.equal(result.daysToNextTier, 1);
  assert.equal(result.projectedScoreIn7Days, 85); // 40 + 5*(2+7), clamped to 100
});

test('predictEscalationRisk does not flag a crossing beyond the prediction window', () => {
  // +0.6/day, currently at 41.2 - next tier (55) is (55-41.2)/0.6 ≈ 23 days out,
  // well past the 14-day window, even though the trend is still "rising".
  const result = predictEscalationRisk(historyFromScores([40, 40.6, 41.2]));
  assert.equal(result.predictedTrend, 'rising');
  assert.equal(result.daysToNextTier, null);
  assert.equal(result.nextTier, null);
});

test('predictEscalationRisk reports falling trends without a next-tier crossing', () => {
  const result = predictEscalationRisk(historyFromScores([80, 70, 60]));
  assert.equal(result.predictedTrend, 'falling');
  assert.equal(result.daysToNextTier, null);
  assert.equal(result.nextTier, null);
});

test('predictEscalationRisk has no next tier once already at the top of Critical', () => {
  const result = predictEscalationRisk(historyFromScores([90, 95, 100]));
  assert.equal(result.predictedTrend, 'rising');
  assert.equal(result.nextTier, null); // nothing above Critical
  assert.equal(result.daysToNextTier, null);
});

test('predictEscalationRiskBatch groups unordered rows per user and sorts each before regressing', () => {
  // Two users' rows interleaved and out of chronological order - the batch
  // helper must group by userId and sort each group itself.
  const rows = [
    { userId: 'a', score: 50, computedAt: '2026-01-03T00:00:00Z' },
    { userId: 'b', score: 80, computedAt: '2026-01-01T00:00:00Z' },
    { userId: 'a', score: 40, computedAt: '2026-01-01T00:00:00Z' },
    { userId: 'a', score: 45, computedAt: '2026-01-02T00:00:00Z' },
    { userId: 'b', score: 70, computedAt: '2026-01-02T00:00:00Z' },
    { userId: 'b', score: 60, computedAt: '2026-01-03T00:00:00Z' },
  ];
  const result = predictEscalationRiskBatch(rows);
  assert.equal(result.size, 2);
  assert.equal(result.get('a').predictedTrend, 'rising'); // 40 -> 45 -> 50
  assert.equal(result.get('b').predictedTrend, 'falling'); // 80 -> 70 -> 60
});
