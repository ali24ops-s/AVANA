/**
 * React Query hooks for AVANA Pocket Safety Override Management (Phase D.3).
 *
 * Endpoints:
 * - GET  /v1/pocket/safety-overrides
 * - GET  /v1/pocket/safety-overrides/:id
 * - POST /v1/pocket/safety-overrides
 * - POST /v1/pocket/safety-overrides/:id/clear
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import { consumptionEtagRegistry, versionEtagRegistry } from "./pocketEtagRegistry.js";
import type {
  ActivateSafetyOverrideRequest,
  ClearSafetyOverrideRequest,
  ClinicalAggregateType,
  ListSafetyOverridesQuery,
  SafetyOverrideActionResult,
  SafetyOverrideRecord,
  SafetyOverrideWithHistoryResult,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

function invalidateAffectedTargetCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  result: SafetyOverrideActionResult,
): void {
  void queryClient.invalidateQueries({ queryKey: pocketKeys.safetyOverrides() });
  void queryClient.invalidateQueries({
    queryKey: pocketKeys.safetyOverride(result.override.id),
  });

  const { targetEntityType, targetEntityId } = result.override;
  if (targetEntityType === "assertion") {
    void queryClient.invalidateQueries({
      queryKey: pocketKeys.publishedAssertion(targetEntityId),
    });
    void queryClient.invalidateQueries({
      queryKey: pocketKeys.assertionHistory(targetEntityId),
    });
    void queryClient.invalidateQueries({
      queryKey: pocketKeys.assertions(),
    });
    return;
  }

  const aggType = targetEntityType as ClinicalAggregateType;
  const etagKey = `${aggType}:${targetEntityId}`;
  consumptionEtagRegistry.delete(etagKey);
  versionEtagRegistry.delete(etagKey);

  void queryClient.invalidateQueries({
    queryKey: pocketKeys.consumption(aggType, targetEntityId),
  });
  void queryClient.invalidateQueries({
    queryKey: pocketKeys.version(aggType, targetEntityId),
  });
  void queryClient.invalidateQueries({
    queryKey: pocketKeys.metadata(aggType, targetEntityId),
  });
}

export function usePocketSafetyOverrides(
  query?: ListSafetyOverridesQuery,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<SafetyOverrideRecord[]>({
    queryKey: pocketKeys.safetyOverridesList(query),
    queryFn: ({ signal }) => api.listSafetyOverrides(query, signal),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function usePocketSafetyOverride(id: string | undefined | null) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<SafetyOverrideWithHistoryResult>({
    queryKey: pocketKeys.safetyOverride(id ?? ""),
    queryFn: ({ signal }) => api.getSafetyOverride(id!, signal),
    enabled: Boolean(isAuthenticated && id && id.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useActivateSafetyOverride() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: (body: ActivateSafetyOverrideRequest) => api.activateSafetyOverride(body),
    onSuccess: (result) => {
      invalidateAffectedTargetCaches(queryClient, result);
    },
  });
}

export function useClearSafetyOverride() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClearSafetyOverrideRequest }) =>
      api.clearSafetyOverride(id, body),
    onSuccess: (result) => {
      invalidateAffectedTargetCaches(queryClient, result);
    },
  });
}
