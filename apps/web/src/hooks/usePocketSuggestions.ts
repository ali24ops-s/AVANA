/**
 * React Query hook for Clinical Search Suggestions (Typeahead).
 *
 * Endpoint: GET /v1/pocket/search/suggestions
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import {
  VALID_SEARCH_AGGREGATE_TYPES,
  type ClinicalSearchAggregateType,
  type PocketSuggestionsQueryParams,
  type PocketSuggestionsResponse,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export interface UsePocketSuggestionsOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export function usePocketSuggestions(
  params?: PocketSuggestionsQueryParams,
  options?: UsePocketSuggestionsOptions,
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  // 1. Strict Parameter Validation (Domain Invariants matching Backend)
  const trimmedQuery = params?.q ? params.q.trim() : "";
  const hasQuery = trimmedQuery.length > 0;
  const isQueryLengthValid = trimmedQuery.length <= 100;

  const isTypeValid =
    !params?.type ||
    VALID_SEARCH_AGGREGATE_TYPES.includes(params.type as ClinicalSearchAggregateType);

  const isLimitValid =
    params?.limit !== undefined
      ? Number.isInteger(Number(params.limit)) &&
        Number(params.limit) >= 1 &&
        Number(params.limit) <= 50
      : true;

  // Suggestions strictly require non-empty query <= 100 chars and valid params
  const isInputValid = hasQuery && isQueryLengthValid && isTypeValid && isLimitValid;

  // 2. Decoupled Activation: options.enabled controls caller activation, CANNOT bypass isInputValid
  const userEnabled = options?.enabled !== undefined ? options.enabled : true;
  const isEnabled = Boolean(isAuthenticated && isInputValid && userEnabled);

  return useQuery<PocketSuggestionsResponse>({
    queryKey: pocketKeys.suggestion(params),
    queryFn: ({ signal }) => api.getSuggestions(params, signal),
    enabled: isEnabled,
    staleTime: options?.staleTime ?? 60_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
  });
}
