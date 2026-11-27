/**
 * React Query hook for Unified Clinical Search across all 4 pillars.
 *
 * Endpoint: GET /v1/pocket/search
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import {
  VALID_SEARCH_AGGREGATE_TYPES,
  type ClinicalSearchAggregateType,
  type PocketSearchQueryParams,
  type PocketSearchResponse,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export interface UsePocketSearchOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export function usePocketSearch(
  params?: PocketSearchQueryParams,
  options?: UsePocketSearchOptions,
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  // 1. Strict Parameter Validation (Domain Invariants matching Backend)
  const trimmedQ = params?.q ? params.q.trim() : "";
  const hasSearchTerm = trimmedQ.length > 0;
  const isQueryLengthValid = trimmedQ.length <= 100;
  const hasSpecificType = Boolean(params?.type && params.type !== "all");
  const hasSearchIntent = hasSearchTerm || hasSpecificType;

  const isTypeValid =
    !params?.type ||
    VALID_SEARCH_AGGREGATE_TYPES.includes(params.type as ClinicalSearchAggregateType);

  const isLimitValid =
    params?.limit !== undefined
      ? Number.isInteger(Number(params.limit)) &&
        Number(params.limit) >= 1 &&
        Number(params.limit) <= 50
      : true;

  const isOffsetValid =
    params?.offset !== undefined
      ? Number.isInteger(Number(params.offset)) &&
        Number(params.offset) >= 0 &&
        Number(params.offset) <= 10000
      : true;

  // Unnecessary request prevention: require search intent and valid parameters
  const isInputValid =
    hasSearchIntent &&
    isQueryLengthValid &&
    isTypeValid &&
    isLimitValid &&
    isOffsetValid;

  // 2. Decoupled Activation: options.enabled controls caller activation, CANNOT bypass isInputValid
  const userEnabled = options?.enabled !== undefined ? options.enabled : true;
  const isEnabled = Boolean(isAuthenticated && isInputValid && userEnabled);

  return useQuery<PocketSearchResponse>({
    queryKey: pocketKeys.search(params),
    queryFn: ({ signal }) => api.search(params, signal),
    enabled: isEnabled,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
  });
}
