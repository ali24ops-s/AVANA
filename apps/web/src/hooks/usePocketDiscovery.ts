/**
 * React Query hook for Clinical Discovery (Category browsing across pillars).
 *
 * Endpoint: GET /v1/pocket/discovery
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import {
  VALID_DISCOVERY_SORT_OPTIONS,
  VALID_SEARCH_AGGREGATE_TYPES,
  type ClinicalSearchAggregateType,
  type DiscoverySortOption,
  type PocketDiscoveryQueryParams,
  type PocketDiscoveryResponse,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export interface UsePocketDiscoveryOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export function usePocketDiscovery(
  params?: PocketDiscoveryQueryParams,
  options?: UsePocketDiscoveryOptions,
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  // 1. Strict Parameter Validation (Domain Invariants matching Backend)
  const isTypeValid =
    !params?.type ||
    VALID_SEARCH_AGGREGATE_TYPES.includes(params.type as ClinicalSearchAggregateType);

  const isCategoryValid = params?.category
    ? params.category.trim().length <= 100
    : true;

  const isSortValid =
    !params?.sort ||
    VALID_DISCOVERY_SORT_OPTIONS.includes(params.sort as DiscoverySortOption);

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

  const isInputValid =
    isTypeValid && isCategoryValid && isSortValid && isLimitValid && isOffsetValid;

  // 2. Decoupled Activation: options.enabled controls caller activation, CANNOT bypass isInputValid
  const userEnabled = options?.enabled !== undefined ? options.enabled : true;
  const isEnabled = Boolean(isAuthenticated && isInputValid && userEnabled);

  return useQuery<PocketDiscoveryResponse>({
    queryKey: pocketKeys.discoveryList(params),
    queryFn: ({ signal }) => api.getDiscovery(params, signal),
    enabled: isEnabled,
    staleTime: options?.staleTime ?? 60_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
  });
}
