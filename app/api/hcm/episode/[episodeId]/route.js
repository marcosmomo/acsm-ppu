import { getEpisode } from '../../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk } from '../../_response';
import { initializeHcmPrimary } from '../../../../../services/memory/mongoHcmRepository';

export async function GET(_request, { params }) {
  try {
    await initializeHcmPrimary();
    const { episodeId } = await params;
    const episode = getEpisode(episodeId);
    if (!episode) {
      const error = new Error('HCM episode not found.');
      error.status = 404;
      throw error;
    }
    return jsonOk({ episode });
  } catch (error) {
    return jsonError(error);
  }
}
