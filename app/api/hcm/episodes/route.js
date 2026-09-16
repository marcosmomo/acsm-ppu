import { listEpisodes } from '../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk } from '../_response';

export async function GET() {
  try {
    return jsonOk({ episodes: listEpisodes() });
  } catch (error) {
    return jsonError(error);
  }
}
