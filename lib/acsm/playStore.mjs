import { buildPlayState } from './playService.mjs';
import { getManagedCpsIdsForAcsm, normalizeCpsId } from './config.js';

const STORE_KEY = Symbol.for('acsm.play.facade.runtime-store');
const emptySnapshot = Object.freeze({ cps: [], analytics: {}, historySize: 0 });
const store = globalThis[STORE_KEY] || { snapshot: emptySnapshot };
const managedCps = new Set(getManagedCpsIdsForAcsm('acsm1'));

const getCpsId = (cps = {}) => normalizeCpsId(
  cps?.cpsId ?? cps?.id ?? cps?.cps?.cpsId ?? cps?.lifecycle?.cpsId
);

globalThis[STORE_KEY] = store;

export const updatePlaySnapshot = (snapshot = {}) => {
  store.snapshot = {
    cps: Array.isArray(snapshot.cps)
      ? snapshot.cps.filter((cps) => managedCps.has(getCpsId(cps)))
      : [],
    analytics: snapshot.analytics && typeof snapshot.analytics === 'object'
      ? snapshot.analytics
      : {},
    historySize: snapshot.historySize,
    minimumHistory: snapshot.minimumHistory,
    recommendation: snapshot.recommendation,
    interpretation: snapshot.interpretation,
  };
  return buildPlayState(store.snapshot);
};

export const getPlayState = () => buildPlayState(store.snapshot);
