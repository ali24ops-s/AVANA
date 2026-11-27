/**
 * React Query hook for Related Clinical Entities (Relational traversal).
 *
 * Endpoint: GET /v1/pocket/aggregates/:type/:id/related
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import {
  CLINICAL_AGGREGATE_TYPES,
  type ClinicalPillarType,
  type PocketRelatedEntitiesResponse,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-zA-Z0-9_.-]+$/;

export interface UsePocketRelatedEntitiesOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export function usePocketRelatedEntities(
  type: ClinicalPillarType,
  id: string | undefined | null,
  options?: UsePocketRelatedEntitiesOptions,
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  const trimmedId = id ? id.trim() : "";
  const isValidIdentifier = Boolean(
    trimmedId &&
    trimmedId.length <= 255 &&
    (UUID_REGEX.test(trimmedId) || SLUG_REGEX.test(trimmedId)),
  );
  const isValidType = CLINICAL_AGGREGATE_TYPES.includes(type);

  // 1. Strict Parameter Validation (RFC 4122 UUID or canonical slug matching Backend and Valid Pillar Type)
  const isInputValid = isValidIdentifier && isValidType;

  // 2. Decoupled Activation: options.enabled controls caller activation, CANNOT bypass isInputValid
  const userEnabled = options?.enabled !== undefined ? options.enabled : true;
  const isEnabled = Boolean(isAuthenticated && isInputValid && userEnabled);

  return useQuery<PocketRelatedEntitiesResponse>({
    queryKey: pocketKeys.relatedEntities(type, trimmedId),
    queryFn: ({ signal }) => api.getRelatedEntities(type, trimmedId, signal),
    enabled: isEnabled,
    staleTime: options?.staleTime ?? 60_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
  });
}
