import {
  listKnowledgeItems,
  registerKnowledgeItem,
} from '../../../../services/memory/cognitiveEpisodicMemoryService';
import { jsonError, jsonOk, readJsonBody } from '../_response';
import { commitHcmMirror, initializeHcmPrimary } from '../../../../services/memory/mongoHcmRepository';

export async function GET(request) {
  try {
    await initializeHcmPrimary();
    const { searchParams } = new URL(request.url);
    return jsonOk({
      knowledgeItems: listKnowledgeItems({
        cpsId: searchParams.get('cpsId'),
        limit: searchParams.get('limit'),
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    await initializeHcmPrimary();
    const body = await readJsonBody(request);
    const result = registerKnowledgeItem(body);
    await commitHcmMirror();
    return jsonOk(result, result.reused ? 200 : 201);
  } catch (error) {
    return jsonError(error);
  }
}
