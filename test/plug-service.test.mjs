import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlugState } from '../lib/acsm/plugService.mjs';

const phases = ['plug', 'play', 'stop', 'maintenance', 'return', 'unplug'];

const simulatedCps = (cpsId, overrides = {}) => ({
  id: cpsId,
  nome: cpsId.toUpperCase(),
  lifecyclePhase: 'plug',
  lifecycle: { supportedPhases: phases },
  endpoints: {
    status: `/api/${cpsId}/status`,
    health: `/api/${cpsId}/health`,
    oee: `/api/${cpsId}/oee`,
  },
  topic: cpsId,
  aasMetadata: { id: `urn:acsm:${cpsId}`, idShort: `${cpsId}-aas` },
  ...overrides,
});

test('empty Plug snapshot returns NO_DATA without error or invented assets', () => {
  const result = buildPlugState();

  assert.equal(result.acsmId, 'acsm1');
  assert.equal(result.phase, 'plug');
  assert.equal(result.type, 'phase-service-facade');
  assert.equal(result.evidenceStatus, 'NO_DATA');
  assert.equal(result.summary.registeredCPS, 0);
  assert.deepEqual(result.assets, []);
  assert.equal(Number.isNaN(Date.parse(result.timestamp)), false);
});

test('cps1 is projected with every principal Plug structure', () => {
  const result = buildPlugState({
    assets: [simulatedCps('cps1', { assetType: 'robotic welding cell' })],
  });
  const asset = result.assets[0];

  assert.equal(result.assets.length, 1);
  assert.equal(asset.cps.cpsId, 'cps1');
  for (const key of [
    'identification',
    'capabilities',
    'interfaces',
    'supportedPhases',
    'governance',
    'lifecycleEvidence',
  ]) {
    assert.equal(Object.hasOwn(asset, key), true);
  }
  assert.deepEqual(asset.supportedPhases, phases);
  assert.deepEqual(
    asset.capabilities.find(({ group }) => group === 'Process')?.items,
    ['Welding']
  );
});

test('three simulated CPS are consolidated exactly inside the ACSM boundary', () => {
  const result = buildPlugState({
    assets: [
      simulatedCps('cps1', { assetType: 'welding' }),
      simulatedCps('cps5', { assetType: 'visual inspection' }),
      simulatedCps('cps7', { assetType: 'transport conveyor' }),
    ],
  });

  assert.equal(result.evidenceStatus, 'AVAILABLE');
  assert.equal(result.summary.registeredCPS, 3);
  assert.deepEqual(result.assets.map(({ cps }) => cps.cpsId), ['cps1', 'cps5', 'cps7']);
});

test('LAI CPS are ignored even when supplied beside managed CPS', () => {
  const result = buildPlugState({
    assets: [simulatedCps('cps1'), simulatedCps('cpslai1'), simulatedCps('cps5')],
  });

  assert.deepEqual(result.assets.map(({ cps }) => cps.cpsId), ['cps1', 'cps5']);
  assert.equal(result.summary.registeredCPS, 2);
});

test('Governance metadata is projected without invoking decision or execution callbacks', () => {
  let calls = 0;
  const result = buildPlugState({
    assets: [simulatedCps('cps5', {
      governanceProfile: {
        profileId: 'profile-cps5',
        profileVersion: 4,
        status: 'PENDING_APPROVAL',
      },
      approve: () => { calls += 1; },
      reject: () => { calls += 1; },
      execute: () => { calls += 1; },
    })],
  });

  assert.deepEqual(result.assets[0].governance, {
    profileId: 'profile-cps5',
    profileVersion: 4,
    status: 'PENDING_APPROVAL',
  });
  assert.equal(calls, 0);
});

test('empty lifecycle evidence preserves valid zero, null and empty array values', () => {
  const result = buildPlugState({
    assets: [simulatedCps('cps7', {
      lifecycleEvidence: {
        maintenanceCount: 0,
        lastEvolutionTimestamp: null,
        events: [],
      },
    })],
  });

  assert.deepEqual(result.assets[0].lifecycleEvidence, {
    maintenanceCount: 0,
    lastEvolutionTimestamp: null,
    events: [],
  });
});

test('Integration capabilities and interfaces exclude LAI physical technology', () => {
  const result = buildPlugState({
    assets: [simulatedCps('cps1', {
      capabilities: [
        { group: 'Integration', items: ['MQTT', 'REST', 'AAS', 'OPC UA', 'PLC'] },
      ],
      interfaces: [
        { name: 'MQTT', protocol: 'MQTT', topic: 'cps1' },
        { name: 'Physical adapter', protocol: 'OPCUA', nodeId: 'ns=3;s=PLC' },
        { name: 'LAI adapter', endpoint: 'http://cpslai1.local' },
      ],
    })],
  });
  const serialized = JSON.stringify({
    capabilities: result.assets[0].capabilities,
    interfaces: result.assets[0].interfaces,
  });

  assert.doesNotMatch(serialized, /OPC\s*UA|OPCUA|NodeId|PLC|cpslai/i);
  assert.match(serialized, /MQTT/);
});
