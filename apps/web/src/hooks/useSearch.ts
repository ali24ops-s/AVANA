import { useQuery } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createSearchApi } from "../lib/api/search.js";

function getSearchApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createSearchApi(client);
}

export function useSearch(query: string, limit = 10) {
  const trimmed = query ? query.trim() : "";
  const api = getSearchApi();

  return useQuery({
    queryKey: ["global-search", trimmed, limit],
    queryFn: () => api.search(trimmed, limit),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });
}

