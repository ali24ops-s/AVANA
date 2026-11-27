/**
 * AVANA Pocket — Clinical Search Store Interface (UI-4.1).
 *
 * Defines contracts for:
 * 1. Unified search across published entities.
 * 2. Autocomplete suggestions (Typeahead).
 * 3. Clinical discovery (Category browsing).
 * 4. Related clinical entities (Relationships).
 *
 * Guarantees:
 * - Query-level isolation: only records where status = 'published' are returned.
 * - Test-only implementations are kept inside test infrastructure.
 */

import type {
  ClinicalPillarType,
  ClinicalSearchAggregateType,
  DiscoverySortOption,
  PocketDiscoveryResponse,
  PocketRelatedEntitiesResponse,
  PocketSearchResponse,
  PocketSuggestionsResponse,
} from "./pocket-search-types.js";

export interface SearchPublishedStoreParams {
  query?: string;
  type: ClinicalSearchAggregateType;
  limit: number;
  offset: number;
}

export interface SuggestionsStoreParams {
  query: string;
  type: ClinicalSearchAggregateType;
  limit: number;
}

export interface DiscoveryStoreParams {
  type: ClinicalSearchAggregateType;
  category?: string;
  sort: DiscoverySortOption;
  limit: number;
  offset: number;
}

export interface PocketSearchStore {
  /**
   * Search published clinical entities across all four pillars with deterministic pagination and ranking.
   */
  searchPublished(params: SearchPublishedStoreParams): Promise<PocketSearchResponse>;

  /**
   * Fast, lightweight suggestions across published clinical entities.
   */
  getSuggestions(params: SuggestionsStoreParams): Promise<PocketSuggestionsResponse>;

  /**
   * Browse published entities without requiring a search query.
   */
  getDiscovery(params: DiscoveryStoreParams): Promise<PocketDiscoveryResponse>;

  /**
   * Discover published entities related to a specific aggregate.
   * Returns null if the root aggregate does not exist or is not published.
   */
  getRelatedEntities(
    type: ClinicalPillarType,
    id: string,
  ): Promise<PocketRelatedEntitiesResponse | null>;

  /**
   * Scoped batch clinical verification lookup for multiple aggregate entities.
   */
  getVerificationStatusBatch?(
    items: Array<{ type: ClinicalPillarType; id: string }>,
  ): Promise<Map<string, import("./pocket-search-types.js").ClinicalVerificationStatus>>;
}
