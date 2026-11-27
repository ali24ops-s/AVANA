/**
 * React Query hook for Clinical Aggregate Metadata Read.
 *
 * Endpoint: GET /v1/pocket/aggregates/:type/:id/metadata
 *
 * Invariants:
 * - Retrieves human-readable English/Persian names, classification, and summary.
 * - Stale time: 60s.
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import type { ClinicalAggregateMetadata, ClinicalAggregateType } from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export function usePocketAggregateMetadata(
  type: ClinicalAggregateType,
  id: string | undefined | null,
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<ClinicalAggregateMetadata>({
    queryKey: pocketKeys.metadata(type, id ?? ""),
    queryFn: ({ signal }) => api.getAggregateMetadata(type, id!, signal),
    enabled: Boolean(isAuthenticated && id && id.trim().length > 0),
    staleTime: 60_000,
  });
}
