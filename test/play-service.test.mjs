import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlayState, DEFAULT_MINIMUM_HISTORY } from '../lib/acsm/playService.mjs';

const playCps = (id, oee, overrides = {}) => ({
  id,
  lifecyclePhase: 'play',
  operationalState: 'running',
  ...(oee === undefined ? {} : { oee }),
  ...overrides,
});

test('empty snapshot exposes explicit no-evidence states', () => {
  const result = buildPlayState();

  assert.equal(result.activeCPS.count, 0);
  assert.deepEqual(result.activeCPS.items, []);
  assert.equal(result.globalOEE.current, null);
  assert.equal(result.globalOEE.evidenceStatus, 'NO_DATA');
  assert.equal(result.criticalCPS, null);
  assert.deepEqual(result.systemHealth, { state: 'UNKNOWN', score: null });
  assert.equal(result.systemState, 'UNKNOWN');
  assert.equal(result.learning.state, 'NO_DATA');
  assert.equal(result.reasoning.state, 'INSUFFICIENT_DATA');
  assert.equal(result.prediction.state, 'INSUFFICIENT_HISTORY');
  assert.equal(result.recommendation.state, 'NO_RECOMMENDATION');
  assert.equal(result.interpretation.state, 'NO_EVIDENCE');
});

test('measured OEE equal to zero remains valid evidence', () => {
  const result = buildPlayState({ cps: [playCps('cps1', { value: 0 })] });

  assert.equal(result.globalOEE.current, 0);
  assert.equal(result.globalOEE.evidenceStatus, 'AVAILABLE');
});

test('three Play CPS aggregate OEE dimensions and select the lowest OEE as critical', () => {
  const result = buildPlayState({
    cps: [
      playCps('cps1', { value: 0.6, availability: 0.8, performance: 0.75, quality: 1 }),
      playCps('cps5', { value: 0.75, availability: 0.9, performance: 0.85, quality: 0.95 }),
      playCps('cps7', { value: 0.9, availability: 1, performance: 0.95, quality: 0.9 }),
    ],
  });

  assert.equal(result.activeCPS.count, 3);
  assert.deepEqual(result.activeCPS.items, ['cps1', 'cps5', 'cps7']);
  assert.equal(result.globalOEE.current, 0.75);
  assert.equal(result.globalOEE.availability, 0.9);
  assert.equal(result.globalOEE.performance, 0.85);
  assert.equal(result.globalOEE.quality, 0.95);
  assert.equal(result.criticalCPS.cpsId, 'cps1');
  assert.equal(Object.hasOwn(result, 'bottleneck'), false);
});

test('partial OEE evidence uses valid measurements and reports INSUFFICIENT_DATA', () => {
  const result = buildPlayState({
    cps: [
      playCps('cps1', { value: 0.6 }),
      playCps('cps5', undefined),
      playCps('cps7', { value: 0.8 }),
    ],
  });

  assert.equal(result.globalOEE.current, 0.7);
  assert.equal(result.globalOEE.evidenceStatus, 'INSUFFICIENT_DATA');
});

test('LAI CPS and non-Play managed CPS are excluded from active CPS', () => {
  const result = buildPlayState({
    cps: [
      playCps('cps1', { value: 0.6 }),
      playCps('cpslai1', { value: 0.1 }),
      playCps('cps5', { value: 0.8 }),
      playCps('cps7', { value: 0.9 }, { lifecyclePhase: 'maintenance' }),
    ],
  });

  assert.deepEqual(result.activeCPS.items, ['cps1', 'cps5']);
  assert.doesNotMatch(JSON.stringify(result), /cpslai/i);
});

test('insufficient history gates Learning and hides preliminary Prediction', () => {
  const result = buildPlayState({
    cps: [playCps('cps1', { value: 0.6 })],
    historySize: 3,
    analytics: { predictedSystemOEE: 0.7 },
  });

  assert.equal(DEFAULT_MINIMUM_HISTORY, 6);
  assert.equal(result.learning.state, 'INSUFFICIENT_HISTORY');
  assert.equal(result.prediction.state, 'INSUFFICIENT_HISTORY');
  assert.equal(result.prediction.predictedSystemOEE, null);
});

test('ready Learning preserves an existing valid Prediction', () => {
  const result = buildPlayState({
    cps: [playCps('cps1', { value: 0.6 })],
    historySize: 6,
    analytics: {
      learningPattern: 'stable_system',
      predictedSystemOEE: 0.71,
    },
  });

  assert.equal(result.learning.state, 'READY');
  assert.equal(result.learning.pattern, 'stable_system');
  assert.deepEqual(result.prediction, {
    state: 'AVAILABLE',
    predictedSystemOEE: 0.71,
  });
});

test('system Health uses the worst state and averages valid scores', () => {
  const result = buildPlayState({
    cps: [
      playCps('cps1', { value: 0.7 }, { health: { label: 'HEALTHY', score: 0.9 } }),
      playCps('cps5', { value: 0.7 }, { health: { label: 'WARNING', score: 0.6 } }),
      playCps('cps7', { value: 0.7 }, { health: { label: 'HEALTHY', score: 0.9 } }),
    ],
  });

  assert.deepEqual(result.systemHealth, { state: 'WARNING', score: 0.8 });
  assert.equal(result.systemState, 'DEGRADED');
});

test('Recommendation is descriptive and never invokes execution callbacks', () => {
  let calls = 0;
  const result = buildPlayState({
    cps: [playCps('cps1', {
      value: 0.6,
      availability: 0.9,
      performance: 0.7,
      quality: 0.95,
    })],
    recommendation: {
      recommendation: 'Adjust process parameter',
      governableAction: 'ADJUST_PARAMETER',
      cpsId: 'cps1',
      confidence: 0.84,
    },
    approve: () => { calls += 1; },
    reject: () => { calls += 1; },
    executeAction: () => { calls += 1; },
    publishMqtt: () => { calls += 1; },
  });

  assert.deepEqual(result.recommendation, {
    state: 'AVAILABLE',
    recommendation: 'Adjust process parameter',
    governableAction: 'ADJUST_PARAMETER',
    cpsId: 'cps1',
    confidence: 0.84,
  });
  assert.equal(calls, 0);
});

test('Interpretation distinguishes no evidence, insufficient history and available text', () => {
  assert.equal(buildPlayState().interpretation.state, 'NO_EVIDENCE');

  const insufficient = buildPlayState({
    cps: [playCps('cps1', { value: 0.6 })],
    historySize: 5,
    interpretation: { text: 'Preliminary explanation' },
  });
  assert.deepEqual(insufficient.interpretation, {
    state: 'INSUFFICIENT_HISTORY',
    text: null,
  });

  const available = buildPlayState({
    cps: [playCps('cps1', { value: 0.6 })],
    historySize: 6,
    interpretation: { text: 'Performance loss affects cps1.' },
  });
  assert.deepEqual(available.interpretation, {
    state: 'AVAILABLE',
    text: 'Performance loss affects cps1.',
  });
});
