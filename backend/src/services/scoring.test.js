const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDistressScore, classifyRiskLevel, isEscalatingTrend, PHASE_1_WEIGHTS } = require('./scoring');

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
