import { buildPlugState } from './plugService.mjs';
import { getManagedCpsIdsForAcsm, normalizeCpsId } from './config.js';

const STORE_KEY = Symbol.for('acsm.plug.facade.runtime-store');
const emptySnapshot = Object.freeze({ assets: [] });
const store = globalThis[STORE_KEY] || { snapshot: emptySnapshot };
const managedCps = new Set(getManagedCpsIdsForAcsm('acsm1'));

const getCpsId = (asset = {}) => normalizeCpsId(
  asset?.cps?.cpsId ?? asset?.cpsId ?? asset?.id ?? asset?.lifecycle?.cpsId
);

globalThis[STORE_KEY] = store;

export const updatePlugSnapshot = (snapshot = {}) => {
  store.snapshot = {
    assets: Array.isArray(snapshot.assets)
      ? snapshot.assets.filter((asset) => managedCps.has(getCpsId(asset)))
      : [],
  };
  return buildPlugState(store.snapshot);
};

export const getPlugState = () => buildPlugState(store.snapshot);
