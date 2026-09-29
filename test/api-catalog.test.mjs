import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAcsmApiCatalog } from '../lib/acsm/apiCatalog.mjs';
import {
  ACSM_CONFIGS,
  MANAGED_CPS_BY_ACSM,
  getManagedCpsIdsForAcsm,
  isCpsManagedByAcsm,
} from '../lib/acsm/config.js';

const EXPECTED_CPS = ['cps1', 'cps5', 'cps7'];
const EXPECTED_FACADES = ['/api/acsm/plug', '/api/acsm/play'];
const LIFECYCLE_WITHOUT_FACADE = ['stop', 'maintenance', 'return', 'unplug'];

test('catalog identifies acsm1 and exposes exactly the public Plug and Play facades', () => {
  const catalog = buildAcsmApiCatalog();

  assert.equal(catalog.acsmId, 'acsm1');
  assert.equal(catalog.type, 'api-catalog');
  assert.equal(catalog.availableFacades.length, 2);
  assert.deepEqual(
    catalog.availableFacades.map((facade) => facade.endpoint),
    EXPECTED_FACADES
  );
  assert.equal(Number.isNaN(Date.parse(catalog.timestamp)), false);
});

test('all catalog facades are available read-only GET phase-service facades', () => {
  const catalog = buildAcsmApiCatalog();

  for (const facade of catalog.availableFacades) {
    assert.equal(facade.method, 'GET');
    assert.equal(facade.available, true);
    assert.equal(facade.readOnly, true);
    assert.equal(facade.type, 'phase-service-facade');
  }
});

test('lifecycle operations do not have dedicated ACSM facades', () => {
  const catalog = buildAcsmApiCatalog();
  const endpoints = catalog.availableFacades.map((facade) => facade.endpoint);

  for (const operation of LIFECYCLE_WITHOUT_FACADE) {
    assert.equal(endpoints.includes(`/api/acsm/${operation}`), false);
    assert.equal(catalog.lifecycleOperations[operation].dedicatedFacade, false);
  }
});

test('acsm1 manages exactly cps1, cps5 and cps7', () => {
  assert.deepEqual(MANAGED_CPS_BY_ACSM.acsm1, EXPECTED_CPS);
  assert.deepEqual(ACSM_CONFIGS.acsm1.managedCpsIds, EXPECTED_CPS);
  assert.deepEqual(ACSM_CONFIGS.acsm1.allowedCpsIds, EXPECTED_CPS);
  assert.deepEqual(getManagedCpsIdsForAcsm('acsm1'), EXPECTED_CPS);

  for (const cpsId of EXPECTED_CPS) {
    assert.equal(isCpsManagedByAcsm('acsm1', cpsId), true);
  }

  for (const cpsId of ['cpslai1', 'cpslai2', 'cpslai3']) {
    assert.equal(MANAGED_CPS_BY_ACSM.acsm1.includes(cpsId), false);
    assert.equal(isCpsManagedByAcsm('acsm1', cpsId), false);
  }
});
