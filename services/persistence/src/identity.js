'use strict';
const crypto = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    if (!['receivedAt', 'retryCount'].includes(key)) out[key] = stable(value[key]);
    return out;
  }, {});
}

function messageId(topic, payload) {
  const supplied = payload.messageId || payload.eventId || payload.commandId || payload.id;
  if (supplied) return String(supplied);
  const origin = payload.ts ?? payload.timestamp ?? payload.generatedAt;
  return crypto.createHash('sha256').update(`${topic}|${origin ?? ''}|${JSON.stringify(stable(payload))}`).digest('hex');
}

module.exports = { messageId, stable };
