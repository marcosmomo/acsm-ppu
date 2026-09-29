'use strict';
const CPS_TOPICS = /^cps(1|5|7)\//i;
const MAIN_CPS = new Set(['CPS-001', 'CPS-005', 'CPS-007']);

function scopeOf(topic) { return CPS_TOPICS.test(topic) ? 'cps_local' : 'acsm_system'; }
function cpsIdOf(topic, payload) {
  const raw = payload.cpsId || payload.targetCps || (topic.match(/^cps(1|5|7)/i) || [])[0] || null;
  if (!raw) return null;
  const n = String(raw).match(/\d+/)?.[0];
  return n ? `CPS-${n.padStart(3, '0')}` : String(raw);
}
function kindOf(topic) {
  if (/\/(data|telemetry)$/i.test(topic)) return 'telemetry';
  if (/\/oee$/i.test(topic)) return 'analytics';
  if (/\/(health|learning|reasoning|prediction|recommendation|adaptive|intelligence)$/i.test(topic)) return 'analytics';
  if (/\/(cmd|ack)$/i.test(topic)) return 'command';
  if (/\/(status|\$state)$/i.test(topic)) return 'event';
  return 'log';
}
function sourceTime(payload, fallback = new Date()) {
  const raw = payload.ts ?? payload.timestamp ?? payload.generatedAt;
  const date = typeof raw === 'number' ? new Date(raw) : new Date(raw || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
function flattenNumbers(value, prefix = '', out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'number' && Number.isFinite(child)) out.push({ name, value: child });
    else if (child && typeof child === 'object' && !Array.isArray(child)) flattenNumbers(child, name, out);
  }
  return out;
}
function containsLaiMarker(value) {
  const text = JSON.stringify(value || {}).toLowerCase();
  return text.includes('cps-lai') || text.includes('ppu-lai') || text.includes('opcua') || text.includes('physical-equipment');
}
function composedCpsIds(payload) {
  const candidates = [payload.cpsIds, payload.sources, payload.contributingCps, payload.criticalityRanking, payload.cpsResults];
  const ids = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') { const id = cpsIdOf('', { cpsId: value }); if (id) ids.push(id); return; }
    const own = value.cpsId || value.id || value.source; if (own) { const id = cpsIdOf('', { cpsId: own }); if (id) ids.push(id); }
    Object.values(value).forEach((child) => { if (child && typeof child === 'object') visit(child); });
  };
  candidates.filter(Boolean).forEach(visit); return [...new Set(ids)];
}
function validateMainOrigin(topic, payload = {}) {
  if (!payload || typeof payload !== 'object' || containsLaiMarker(payload)) return { accepted: false, reason: 'missing_or_lai_origin' };
  const environment = String(payload.environmentId || payload.environment || '').toLowerCase();
  const origin = String(payload.origin || '').toLowerCase();
  if (environment === 'acsm-main' || origin === 'acsm-main-simulation') {
    const cpsId = cpsIdOf(topic, payload);
    if (cpsId && !MAIN_CPS.has(cpsId)) return { accepted: false, reason: 'cps_not_in_acsm_main' };
    return { accepted: true, reason: 'explicit_acsm_main_marker' };
  }
  if (/^acsm1?\//i.test(topic)) {
    const members = composedCpsIds(payload);
    if (members.length && members.every((id) => MAIN_CPS.has(id))) return { accepted: true, reason: 'validated_system_composition' };
    return { accepted: false, reason: 'system_origin_not_determinable' };
  }
  return { accepted: false, reason: 'local_origin_not_determinable' };
}
module.exports = { scopeOf, cpsIdOf, kindOf, sourceTime, flattenNumbers, validateMainOrigin, composedCpsIds };
