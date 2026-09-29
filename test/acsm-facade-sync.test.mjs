import test from 'node:test';
import assert from 'node:assert/strict';

import { getPlugState, updatePlugSnapshot } from '../lib/acsm/plugStore.mjs';
import { getPlayState, updatePlaySnapshot } from '../lib/acsm/playStore.mjs';

const plugAsset = (cpsId) => ({
  cpsId,
  displayName: cpsId.toUpperCase(),
  lifecyclePhase: 'plug',
  capabilities: [{ group: 'Integration', items: ['MQTT', 'REST', 'AAS'] }],
  interfaces: [{ name: 'MQTT', protocol: 'MQTT', topic: cpsId }],
  governance: { profileId: `profile-${cpsId}`, profileVersion: 1, status: 'APPROVED' },
  lifecycleEvidence: { maintenanceCount: 0, lastEvolutionTimestamp: null, events: [] },
});

const playCps = (cpsId, value) => ({
  cpsId,
  lifecyclePhase: 'play',
  status: 'running',
  oee: { value, availability: value, performance: value, quality: value },
});

test('Plug store synchronizes exactly cps1, cps5 and cps7', () => {
  updatePlugSnapshot({ assets: ['cps1', 'cps5', 'cps7'].map(plugAsset) });
  const state = getPlugState();
  assert.equal(state.summary.registeredCPS, 3);
  assert.deepEqual(state.assets.map(({ cps }) => cps.cpsId), ['cps1', 'cps5', 'cps7']);
});

test('Plug synchronization filters LAI before storing the projection', () => {
  updatePlugSnapshot({ assets: ['cps1', 'cpslai1', 'cps5'].map(plugAsset) });
  assert.deepEqual(getPlugState().assets.map(({ cps }) => cps.cpsId), ['cps1', 'cps5']);
});

test('Play store synchronizes three CPS, average OEE and public critical CPS', () => {
  updatePlaySnapshot({
    cps: [playCps('cps1', 0.6), playCps('cps5', 0.75), playCps('cps7', 0.9)],
  });
  const state = getPlayState();
  assert.equal(state.activeCPS.count, 3);
  assert.equal(state.globalOEE.current, 0.75);
  assert.equal(state.criticalCPS.cpsId, 'cps1');
});

test('Play synchronization preserves measured zero as valid evidence', () => {
  updatePlaySnapshot({ cps: [playCps('cps1', 0)] });
  const state = getPlayState();
  assert.equal(state.globalOEE.current, 0);
  assert.notEqual(state.globalOEE.evidenceStatus, 'NO_DATA');
});

test('Play synchronization preserves missing OEE as null', () => {
  updatePlaySnapshot({ cps: [playCps('cps1', null)] });
  const state = getPlayState();
  assert.equal(state.globalOEE.current, null);
  assert.equal(state.globalOEE.evidenceStatus, 'NO_DATA');
});

test('Recommendation remains descriptive and governableAction invokes nothing', () => {
  let calls = 0;
  updatePlaySnapshot({
    cps: [playCps('cps1', 0.6)],
    recommendation: {
      recommendation: 'Inspect performance parameters',
      governableAction: 'INSPECT_PARAMETERS',
      cpsId: 'cps1',
      execute: () => { calls += 1; },
    },
  });
  const state = getPlayState();
  assert.equal(state.recommendation.governableAction, 'INSPECT_PARAMETERS');
  assert.equal(calls, 0);
});

test('Play synchronization filters LAI before exposing active CPS', () => {
  updatePlaySnapshot({ cps: [playCps('cps1', 0.6), playCps('cpslai1', 0.1)] });
  assert.deepEqual(getPlayState().activeCPS.items, ['cps1']);
});
