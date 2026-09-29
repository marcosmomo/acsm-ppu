import { getKnowledgeItemById } from '../../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk } from '../../_response';
import { initializeHcmPrimary } from '../../../../../services/memory/mongoHcmRepository';

export async function GET(_request, { params }) {
  try {
    await initializeHcmPrimary();
    const { knowledgeId } = await params;
    const knowledgeItem = getKnowledgeItemById(knowledgeId);
    if (!knowledgeItem) {
      const error = new Error('Knowledge item not found.');
      error.status = 404;
      throw error;
    }
    return jsonOk({ knowledgeItem });
  } catch (error) {
    return jsonError(error);
  }
}
