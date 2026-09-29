import { listEpisodes } from '../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk } from '../_response';
import { initializeHcmPrimary } from '../../../../services/memory/mongoHcmRepository';

export async function GET(request) {
  try {
    await initializeHcmPrimary();
    const { searchParams } = new URL(request.url);
    return jsonOk({ episodes: listEpisodes({ limit: searchParams.get('limit') }) });
  } catch (error) {
    return jsonError(error);
  }
}
