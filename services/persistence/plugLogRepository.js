const endpoint = () => `${String(process.env.ACSM_PERSISTENCE_URL || 'http://localhost:3010').replace(/\/$/, '')}/api/plug-log`;
const timeoutMs = () => Number(process.env.ACSM_PERSISTENCE_TIMEOUT_MS || 5000);

async function request(options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(endpoint(), { cache: 'no-store', signal: controller.signal, ...options });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `Persistence returned HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export const readPlugLog = () => request();
export const writePlugLogEvent = (event) => request({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(event),
});
