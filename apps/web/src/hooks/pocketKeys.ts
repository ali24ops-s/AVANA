/**
 * AVANA Pocket — Central Type-Safe Query Keys.
 *
 * Provides deterministic, structured query keys for all Pocket domains:
 * - Reviewers (me, credentials list, single credential)
 * - Assertions (history, verifications)
 * - Consumption (aggregates, version probe)
 */

import type {
  ClinicalAggregateType,
  ClinicalPillarType,
  ListReviewerCredentialsQuery,
  ListSafetyOverridesQuery,
  PocketAdminAssertionsQuery,
  PocketDiscoveryQueryParams,
  PocketSearchQueryParams,
  PocketSuggestionsQueryParams,
} from "../lib/api/pocket.js";

export const pocketKeys = {
  all: ["pocket"] as const,

  reviewers: () => [...pocketKeys.all, "reviewers"] as const,
  reviewerMe: () => [...pocketKeys.reviewers(), "me"] as const,
  reviewerCredentials: (options?: ListReviewerCredentialsQuery) =>
    options !== undefined
      ? ([...pocketKeys.reviewers(), "credentials", options] as const)
      : ([...pocketKeys.reviewers(), "credentials"] as const),
  reviewerCredential: (id: string) =>
    [...pocketKeys.reviewers(), "credentials", id] as const,

  assertions: () => [...pocketKeys.all, "assertions"] as const,
  publishedAssertion: (id: string) =>
    [...pocketKeys.assertions(), id, "published"] as const,
  assertionHistory: (id: string) =>
    [...pocketKeys.assertions(), id, "history"] as const,
  assertionVerifications: (id: string) =>
    [...pocketKeys.assertions(), id, "verifications"] as const,

  consumption: (type: ClinicalAggregateType, id: string) =>
    [...pocketKeys.all, "consumption", type, id] as const,
  metadata: (type: ClinicalAggregateType, id: string) =>
    [...pocketKeys.consumption(type, id), "metadata"] as const,
  version: (type: ClinicalAggregateType, id: string) =>
    [...pocketKeys.all, "version", type, id] as const,

  // Clinical Search & Discovery (Phase UI-4.1 / UI-4.2)
  searches: () => [...pocketKeys.all, "search"] as const,
  search: (params?: PocketSearchQueryParams) =>
    params !== undefined
      ? ([...pocketKeys.searches(), params] as const)
      : ([...pocketKeys.searches()] as const),

  suggestions: () => [...pocketKeys.all, "suggestions"] as const,
  suggestion: (params?: PocketSuggestionsQueryParams) =>
    params !== undefined
      ? ([...pocketKeys.suggestions(), params] as const)
      : ([...pocketKeys.suggestions()] as const),

  discovery: () => [...pocketKeys.all, "discovery"] as const,
  discoveryList: (params?: PocketDiscoveryQueryParams) =>
    params !== undefined
      ? ([...pocketKeys.discovery(), params] as const)
      : ([...pocketKeys.discovery()] as const),

  relatedEntities: (type: ClinicalPillarType, id: string) =>
    [...pocketKeys.all, "related", type, id] as const,

  // Safety Override Management (Phase D.3)
  safetyOverrides: () => [...pocketKeys.all, "safety-overrides"] as const,
  safetyOverridesList: (query?: ListSafetyOverridesQuery) =>
    query !== undefined
      ? ([...pocketKeys.safetyOverrides(), "list", query] as const)
      : ([...pocketKeys.safetyOverrides(), "list"] as const),
  safetyOverride: (id: string) =>
    [...pocketKeys.safetyOverrides(), id] as const,

  // Admin Dashboard Summary & Assertions List (Phase 2.1 / 2.2)
  adminSummary: () => [...pocketKeys.all, "admin", "summary"] as const,
  adminAssertions: (query?: PocketAdminAssertionsQuery) =>
    query !== undefined
      ? ([...pocketKeys.all, "admin", "assertions", query] as const)
      : ([...pocketKeys.all, "admin", "assertions"] as const),
  adminAssertionDetail: (id: string) =>
    [...pocketKeys.all, "admin", "assertions", id, "detail"] as const,

  // Clinical Reviewer Workbench (Phase 2.4)
  reviewerAssertions: (query?: PocketAdminAssertionsQuery) =>
    query !== undefined
      ? ([...pocketKeys.all, "reviewer-workbench", "assertions", query] as const)
      : ([...pocketKeys.all, "reviewer-workbench", "assertions"] as const),
  reviewerAssertionDetail: (id: string) =>
    [...pocketKeys.all, "reviewer-workbench", "assertions", id, "detail"] as const,
};
