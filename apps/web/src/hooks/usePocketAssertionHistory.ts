/**
 * React Query hook for Scientific Assertion History & Audit Log.
 *
 * Endpoint: GET /v1/pocket/assertions/:id/history
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import type { AssertionHistoryResult } from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export function usePocketAssertionHistory(id: string | undefined | null) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<AssertionHistoryResult>({
    queryKey: pocketKeys.assertionHistory(id ?? ""),
    queryFn: ({ signal }) => api.getAssertionHistory(id!, signal),
    enabled: Boolean(isAuthenticated && id && id.trim().length > 0),
    staleTime: 30_000,
  });
}
