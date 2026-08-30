/**
 * Search API calls using typed client and contracts.
 */

import type { SearchResponse } from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createSearchApi(client: ApiClient) {
  return {
    /**
     * GET /v1/search — Global search across courses and shared content.
     */
    search(query: string, limit = 10): Promise<SearchResponse> {
      const searchParams = new URLSearchParams();
      if (query.trim()) {
        searchParams.set("q", query.trim());
      }
      if (limit) {
        searchParams.set("limit", String(limit));
      }
      return client.get<SearchResponse>(`/v1/search?${searchParams.toString()}`);
    },
  };
}

export type SearchApi = ReturnType<typeof createSearchApi>;
