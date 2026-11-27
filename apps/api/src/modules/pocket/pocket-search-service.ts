/**
 * AVANA Pocket — Clinical Search & Discovery Service (UI-4.1).
 *
 * Implements orchestrating business logic, parameter validation, bounded execution,
 * and error handling for:
 * 1. Unified Search (/v1/pocket/search)
 * 2. Autocomplete Suggestions (/v1/pocket/search/suggestions)
 * 3. Clinical Discovery (/v1/pocket/discovery)
 * 4. Related Clinical Entities (/v1/pocket/aggregates/:type/:id/related)
 */

import { DomainError } from "@avana/domain";
import type {
  ClinicalPillarType,
  ClinicalSearchAggregateType,
  DiscoverySortOption,
  PocketDiscoveryResponse,
  PocketRelatedEntitiesResponse,
  PocketSearchResponse,
  PocketSuggestionsResponse,
} from "./pocket-search-types.js";
import {
  VALID_DISCOVERY_SORT_OPTIONS,
  VALID_PILLAR_TYPES,
  VALID_SEARCH_AGGREGATE_TYPES,
} from "./pocket-search-types.js";
import type { PocketSearchStore } from "./pocket-search-store.js";
import { tokenizeClinicalText } from "./pocket-text-normalizer.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-zA-Z0-9_.-]+$/;

const VALID_SORT_OPTIONS = VALID_DISCOVERY_SORT_OPTIONS;

export interface PocketSearchServiceDeps {
  searchStore: PocketSearchStore;
}

export interface UnifiedSearchInput {
  q?: string;
  type?: string;
  limit?: number | string;
  offset?: number | string;
}

export interface SuggestionsInput {
  q?: string;
  type?: string;
  limit?: number | string;
}

export interface DiscoveryInput {
  type?: string;
  category?: string;
  sort?: string;
  limit?: number | string;
  offset?: number | string;
}

export class PocketSearchService {
  private readonly store: PocketSearchStore;

  constructor(deps: PocketSearchServiceDeps) {
    this.store = deps.searchStore;
  }

  private validateAggregateType(type?: string): ClinicalSearchAggregateType {
    if (!type || type.trim().length === 0) {
      return "all";
    }
    const clean = type.trim().toLowerCase();
    if (!VALID_SEARCH_AGGREGATE_TYPES.includes(clean as ClinicalSearchAggregateType)) {
      throw new DomainError(
        "bad_request",
        `Invalid aggregate type '${type}'. Allowed types: ${VALID_SEARCH_AGGREGATE_TYPES.join(", ")}`,
      );
    }
    return clean as ClinicalSearchAggregateType;
  }

  private validatePillarType(type: string): ClinicalPillarType {
    if (!type) {
      throw new DomainError("bad_request", "Aggregate pillar type is required.");
    }
    const clean = type.trim().toLowerCase();
    if (!VALID_PILLAR_TYPES.includes(clean as ClinicalPillarType)) {
      throw new DomainError(
        "bad_request",
        `Invalid clinical pillar type '${type}'. Allowed types: ${VALID_PILLAR_TYPES.join(", ")}`,
      );
    }
    return clean as ClinicalPillarType;
  }

  private parseBoundedInt(val: unknown, defaultVal: number, min: number, max: number, name: string): number {
    if (val === undefined || val === null || val === "") {
      return defaultVal;
    }
    const num = typeof val === "number" ? val : parseInt(String(val), 10);
    if (isNaN(num)) {
      throw new DomainError("bad_request", `Invalid parameter '${name}': must be an integer.`);
    }
    if (num < min || num > max) {
      throw new DomainError(
        "bad_request",
        `Parameter '${name}' out of bounds. Must be between ${min} and ${max}.`,
      );
    }
    return num;
  }

  /**
   * GET /v1/pocket/search — Unified Search across all 4 pillars.
   */
  async search(input: UnifiedSearchInput): Promise<PocketSearchResponse> {
    const type = this.validateAggregateType(input.type);
    const limit = this.parseBoundedInt(input.limit, 20, 1, 50, "limit");
    const offset = this.parseBoundedInt(input.offset, 0, 0, 10000, "offset");

    const rawQ = input.q ? String(input.q).trim() : "";
    if (rawQ.length > 100) {
      throw new DomainError("bad_request", "Search query is too long (maximum 100 characters).");
    }
    const tokens = tokenizeClinicalText(rawQ);
    if (tokens.length > 6) {
      throw new DomainError("bad_request", "Search query contains too many terms (maximum 6 words).");
    }

    return this.store.searchPublished({
      query: rawQ,
      type,
      limit,
      offset,
    });
  }

  /**
   * GET /v1/pocket/search/suggestions — Fast typeahead suggestions.
   */
  async getSuggestions(input: SuggestionsInput): Promise<PocketSuggestionsResponse> {
    const rawQ = input.q ? String(input.q).trim() : "";
    if (!rawQ || rawQ.length === 0) {
      return { query: "", suggestions: [] };
    }
    if (rawQ.length > 100) {
      throw new DomainError("bad_request", "Search query is too long (maximum 100 characters).");
    }
    const tokens = tokenizeClinicalText(rawQ);
    if (tokens.length > 6) {
      throw new DomainError("bad_request", "Search query contains too many terms (maximum 6 words).");
    }

    const type = this.validateAggregateType(input.type);
    const parsedLimit = this.parseBoundedInt(input.limit, 5, 1, 50, "limit");
    const limit = Math.min(10, parsedLimit);

    return this.store.getSuggestions({
      query: rawQ,
      type,
      limit,
    });
  }

  /**
   * GET /v1/pocket/discovery — Category browsing without search query.
   */
  async getDiscovery(input: DiscoveryInput): Promise<PocketDiscoveryResponse> {
    const type = this.validateAggregateType(input.type);
    const limit = this.parseBoundedInt(input.limit, 20, 1, 50, "limit");
    const offset = this.parseBoundedInt(input.offset, 0, 0, 10000, "offset");

    let sort: DiscoverySortOption = "recent";
    if (input.sort && input.sort.trim()) {
      const cleanSort = input.sort.trim().toLowerCase();
      if (!VALID_SORT_OPTIONS.includes(cleanSort as DiscoverySortOption)) {
        throw new DomainError(
          "bad_request",
          `Invalid sort parameter '${input.sort}'. Allowed: ${VALID_SORT_OPTIONS.join(", ")}`,
        );
      }
      sort = cleanSort as DiscoverySortOption;
    }

    const rawCat = input.category ? String(input.category).trim() : undefined;
    if (rawCat && rawCat.length > 100) {
      throw new DomainError("bad_request", "Category is too long (maximum 100 characters).");
    }

    return this.store.getDiscovery({
      type,
      category: rawCat,
      sort,
      limit,
      offset,
    });
  }

  /**
   * GET /v1/pocket/aggregates/:type/:id/related — Relational entity traversal.
   */
  async getRelatedEntities(type: string, id: string): Promise<PocketRelatedEntitiesResponse> {
    const validatedType = this.validatePillarType(type);

    const trimmed = id ? id.trim() : "";
    if (
      !trimmed ||
      trimmed.length > 255 ||
      (!UUID_REGEX.test(trimmed) && !SLUG_REGEX.test(trimmed))
    ) {
      throw new DomainError(
        "bad_request",
        `Invalid aggregate identifier '${id}'. Must be a valid UUID or slug.`,
      );
    }

    const result = await this.store.getRelatedEntities(validatedType, trimmed);
    if (!result) {
      throw new DomainError(
        "not_found",
        `Published clinical aggregate '${validatedType}' with ID '${id}' was not found.`,
      );
    }

    return result;
  }
}
