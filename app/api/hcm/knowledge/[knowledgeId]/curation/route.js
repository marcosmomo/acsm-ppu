import { curateKnowledgeItem } from '../../../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk, readJsonBody } from '../../../_response';
import { commitHcmMirror, initializeHcmPrimary } from '../../../../../../services/memory/mongoHcmRepository';

export async function POST(request, { params }) {
  try {
    await initializeHcmPrimary();
    const { knowledgeId } = await params;
    const body = await readJsonBody(request);
    const result = curateKnowledgeItem(knowledgeId, body);
    await commitHcmMirror();
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
