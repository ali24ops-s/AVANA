/**
 * React Query hooks for Clinical Aggregate Consumption & Version Probe.
 *
 * Endpoints:
 * - GET /v1/pocket/aggregates/:type/:id/assertions
 * - GET /v1/pocket/aggregates/:type/:id/version
 *
 * Implements strict, type-safe conditional ETag / HTTP 304 handling:
 * 1. Tracks authoritative ETag per aggregate key.
 * 2. On 304 Not Modified, retrieves and returns existing cached data from TanStack Query's cache.
 * 3. Fallback: If 304 is received but Query cache is empty, retries once without If-None-Match to guarantee real data.
 * 4. Ensures 304 never throws false errors, never purges valid cached data, and never delivers incomplete objects.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import type {
  AggregateAssertionsQueryResult,
  ClinicalAggregateType,
  VersionProbeQueryResult,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

import {
  consumptionEtagRegistry,
  versionEtagRegistry,
  resetPocketEtagRegistry,
} from "./pocketEtagRegistry.js";

export { resetPocketEtagRegistry };

/**
 * Non-retryable error thrown when an unconditional fallback after a 304 cache miss
 * still returns no payload (e.g. persistent 304), preventing React Query retry loops.
 */
export class ConditionalNotModifiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConditionalNotModifiedError";
  }
}

export function getConsumptionCacheKey(type: ClinicalAggregateType, id: string): string {
  return `${type}:${id}`;
}

export function usePocketConsumption(
  type: ClinicalAggregateType,
  id: string | undefined | null,
) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const api = getPocketApi();

  const isEnabled = Boolean(isAuthenticated && id && id.trim().length > 0);
  const queryKey = pocketKeys.consumption(type, id ?? "");

  return useQuery<AggregateAssertionsQueryResult>({
    queryKey,
    queryFn: async ({ signal }): Promise<AggregateAssertionsQueryResult> => {
      const aggregateId = id!;
      const cacheKey = getConsumptionCacheKey(type, aggregateId);
      const existingEtag = consumptionEtagRegistry.get(cacheKey);
      const existingData = queryClient.getQueryData<AggregateAssertionsQueryResult>(queryKey);

      // Perform conditional request if we have an existing ETag and existing data
      const res = await api.getPublishedAssertions(
        type,
        aggregateId,
        existingEtag && existingData ? existingEtag : undefined,
        signal,
      );

      // Scenario 1: Server returned 304 Not Modified
      if (res.notModified) {
        if (existingData) {
          // Retain authoritative cached data intact
          return existingData;
        }

        // Cache was empty or invalidated: Retry request once unconditionally without ETag
        consumptionEtagRegistry.delete(cacheKey);
        const freshRes = await api.getPublishedAssertions(type, aggregateId, undefined, signal);
        if (freshRes.etag) {
          consumptionEtagRegistry.set(cacheKey, freshRes.etag);
        }
        if (!freshRes.data) {
          throw new ConditionalNotModifiedError(
            "Received empty payload for clinical aggregate assertions",
          );
        }
        return freshRes.data;
      }

      // Scenario 2: Server returned 200 OK with fresh body
      if (res.etag) {
        consumptionEtagRegistry.set(cacheKey, res.etag);
      }
      if (!res.data) {
        throw new Error("Received empty payload for clinical aggregate assertions");
      }
      return res.data;
    },
    enabled: isEnabled,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ConditionalNotModifiedError) return false;
      return failureCount < 1;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function usePocketVersionProbe(
  type: ClinicalAggregateType,
  id: string | undefined | null,
) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const api = getPocketApi();

  const isEnabled = Boolean(isAuthenticated && id && id.trim().length > 0);
  const queryKey = pocketKeys.version(type, id ?? "");

  return useQuery<VersionProbeQueryResult>({
    queryKey,
    queryFn: async ({ signal }): Promise<VersionProbeQueryResult> => {
      const aggregateId = id!;
      const cacheKey = getConsumptionCacheKey(type, aggregateId);
      const existingEtag = versionEtagRegistry.get(cacheKey);
      const existingData = queryClient.getQueryData<VersionProbeQueryResult>(queryKey);

      const res = await api.getCurrentVersion(
        type,
        aggregateId,
        existingEtag && existingData ? existingEtag : undefined,
        signal,
      );

      // 304 Not Modified handling
      if (res.notModified) {
        if (existingData) {
          return existingData;
        }

        versionEtagRegistry.delete(cacheKey);
        const freshRes = await api.getCurrentVersion(type, aggregateId, undefined, signal);
        if (freshRes.etag) {
          versionEtagRegistry.set(cacheKey, freshRes.etag);
        }
        if (!freshRes.data) {
          throw new ConditionalNotModifiedError(
            "Received empty payload for aggregate version probe",
          );
        }
        return freshRes.data;
      }

      // 200 OK handling
      if (res.etag) {
        versionEtagRegistry.set(cacheKey, res.etag);
      }
      if (!res.data) {
        throw new Error("Received empty payload for aggregate version probe");
      }
      return res.data;
    },
    enabled: isEnabled,
    staleTime: 15_000,
    retry: (failureCount, error) => {
      if (error instanceof ConditionalNotModifiedError) return false;
      return failureCount < 1;
    },
    placeholderData: (previousData) => previousData,
  });
}
