/**
 * React Query hook for Public Published Scientific Assertion Read.
 *
 * Endpoint: GET /v1/pocket/assertions/:id
 *
 * Invariants:
 * - Accessible to all authenticated users (including students).
 * - Only retrieves published, non-superseded assertions.
 * - Stale time: 60s.
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import type { PublishedAssertionItem } from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export function usePocketAssertion(id: string | undefined | null) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<PublishedAssertionItem>({
    queryKey: pocketKeys.publishedAssertion(id ?? ""),
    queryFn: ({ signal }) => api.getPublishedAssertion(id!, signal),
    enabled: Boolean(isAuthenticated && id && id.trim().length > 0),
    staleTime: 60_000,
  });
}
