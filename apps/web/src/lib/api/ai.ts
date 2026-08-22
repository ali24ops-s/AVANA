/**
 * AI Study Assistant typed client.
 *
 * Calls the canonical /v1/ai/ask backend endpoint powered by Cloudflare Workers AI.
 */

import type { ApiClient } from "./client.js";
import type {
  AskAiAssistantRequest,
  AskAiAssistantResponse,
  AiConversationDetailResponse,
} from "@avana/contracts";

export interface AiAssistantApi {
  ask(request: AskAiAssistantRequest): Promise<AskAiAssistantResponse>;
  getConversation(conversationId: string): Promise<AiConversationDetailResponse>;
  deleteConversation(conversationId: string): Promise<{ ok: boolean }>;
}

export function createAiAssistantApi(client: ApiClient): AiAssistantApi {
  return {
    async ask(request: AskAiAssistantRequest): Promise<AskAiAssistantResponse> {
      return client.post<AskAiAssistantResponse>("/v1/ai/ask", request);
    },

    async getConversation(
      conversationId: string,
    ): Promise<AiConversationDetailResponse> {
      return client.get<AiConversationDetailResponse>(
        `/v1/ai/conversations/${encodeURIComponent(conversationId)}`,
      );
    },

    async deleteConversation(
      conversationId: string,
    ): Promise<{ ok: boolean }> {
      return client.delete<{ ok: boolean }>(
        `/v1/ai/conversations/${encodeURIComponent(conversationId)}`,
      );
    },
  };
}
