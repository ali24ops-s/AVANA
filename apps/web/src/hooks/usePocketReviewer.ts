/**
 * React Query hook for current user's clinical reviewer status.
 *
 * Endpoint: GET /v1/pocket/reviewers/me
 */

import { useQuery } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createPocketApi, type ReviewerMeData } from "../lib/api/pocket.js";
import { pocketKeys } from "./pocketKeys.js";
import { useAuth } from "../providers/AuthProvider.js";

export function getPocketApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createPocketApi(client);
}

export function usePocketReviewer() {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<ReviewerMeData>({
    queryKey: pocketKeys.reviewerMe(),
    queryFn: ({ signal }) => api.getMe(signal),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}
