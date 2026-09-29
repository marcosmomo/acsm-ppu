import fs from 'fs';
import path from 'path';

const endpoint = () => `${String(process.env.ACSM_PERSISTENCE_URL || 'http://localhost:3010').replace(/\/$/, '')}/api/hcm/snapshot`;
const storePath = () => process.env.HCM_STORE_PATH || path.join(process.cwd(), 'data', 'hcm-store.json');
const timeout = () => Number(process.env.ACSM_PERSISTENCE_TIMEOUT_MS || 5000);

const request = async (options = {}) => {
  const response = await fetch(endpoint(), { ...options, signal: AbortSignal.timeout(timeout()), cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || `MongoDB HCM request failed (${response.status})`); error.status = 503; throw error; }
  return body;
};

export const readPrimaryHcmStore = async () => (await request()).store;
export const hydrateHcmMirror = async () => { const store = await readPrimaryHcmStore(); const file = storePath(); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, 'utf8'); return store; };
export const commitHcmMirror = async () => { const store = JSON.parse(fs.readFileSync(storePath(), 'utf8')); return request({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(store) }); };
export const initializeHcmPrimary = async () => { try { return await hydrateHcmMirror(); } catch (error) { if (!fs.existsSync(storePath())) throw error; await commitHcmMirror(); return hydrateHcmMirror(); } };
