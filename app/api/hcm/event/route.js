import { registerEvent } from '../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk, readJsonBody } from '../_response';
import { commitHcmMirror, initializeHcmPrimary } from '../../../../services/memory/mongoHcmRepository';

export async function POST(request) {
  try {
    await initializeHcmPrimary();
    const body = await readJsonBody(request);
    console.log('[HCM EVENT] request payload', body);
    const result = registerEvent(body);
    await commitHcmMirror();
    console.log('[HCM EVENT] response', {
      status: 201,
      eventId: result.event?.eventId,
      episodeId: result.event?.episodeId,
      source: result.event?.source,
      eventType: result.event?.eventType,
    });
    return jsonOk(result, 201);
  } catch (error) {
    console.error('[HCM EVENT] error', {
      status: error.status || 500,
      message: error.message,
      details: error.details,
    });
    return jsonError(error);
  }
}
