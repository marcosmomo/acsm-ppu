import { listEpisodes } from '../../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk } from '../../_response';
import { initializeHcmPrimary } from '../../../../../services/memory/mongoHcmRepository';

export async function GET() {
  try {
    await initializeHcmPrimary();
    return jsonOk({ episodes: listEpisodes({ status: 'open' }) });
  } catch (error) {
    return jsonError(error);
  }
}
