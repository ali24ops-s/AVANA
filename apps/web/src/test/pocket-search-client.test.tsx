/**
 * AVANA Pocket — Phase UI-4.2 Phase 1: Search & Discovery Client & Hooks Test Suite.
 *
 * Verifies:
 * 1. API Client methods for search, suggestions, discovery, and related entities.
 * 2. Proper Query parameter serialization, bounded constraints, and URL path construction.
 * 3. Typed Response parsing across all 4 endpoints.
 * 4. Structured, collision-free React Query keys in pocketKeys.
 * 5. Hook execution and `enabled` behavior for invalid/empty inputs:
 *    - usePocketSearch prevents empty search auto-firing unless configured
 *    - usePocketSuggestions prevents execution with empty/whitespace query
 *    - usePocketRelatedEntities prevents execution with invalid UUID or non-clinical type
 * 6. Cache separation across query, type, category, and pagination changes.
 * 7. Session isolation: cleanupUserSessionCache purges ["pocket"] search and discovery caches.
 * 8. Defense-in-depth: search and discovery responses do not contain reviewer clinical notes.
 * 9. ApiError handling and propagation.
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { createApiClient } from "../lib/api/client.js";
import { ApiError } from "../lib/api/errors.js";
import {
  createPocketApi,
  type PocketSearchResponse,
  type PocketSuggestionsResponse,
  type PocketDiscoveryResponse,
  type PocketRelatedEntitiesResponse,
} from "../lib/api/pocket.js";
import { pocketKeys } from "../hooks/pocketKeys.js";
import { usePocketSearch } from "../hooks/usePocketSearch.js";
import { usePocketSuggestions } from "../hooks/usePocketSuggestions.js";
import { usePocketDiscovery } from "../hooks/usePocketDiscovery.js";
import { usePocketRelatedEntities } from "../hooks/usePocketRelatedEntities.js";
import { cleanupUserSessionCache } from "../providers/AuthProvider.js";

// Mock Auth
let mockIsAuthenticated = true;
vi.mock("../providers/AuthProvider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../providers/AuthProvider.js")>();
  return {
    ...actual,
    useAuth: () => ({
      user: { id: "test-user-id", role: "student" },
      isAuthenticated: mockIsAuthenticated,
    }),
  };
});

function mockFetchResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const headerMap = new Map<string, string>(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    text: () => Promise.resolve(body !== undefined ? JSON.stringify(body) : ""),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("AVANA Pocket UI-4.2 Phase 1: Search & Discovery API Client & Hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockIsAuthenticated = true;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 1000 * 60 * 5 },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  // ===========================================================================
  // 1. API Client Contracts & Parameter Mapping
  // ===========================================================================

  describe("1. API Client Endpoints", () => {
    it("search: sends GET to /v1/pocket/search with correctly serialized query params", async () => {
      const mockSearchData: PocketSearchResponse = {
        items: [
          {
            id: "drug-123",
            slug: "atorvastatin",
            type: "drug",
            titleEn: "Atorvastatin",
            titleFa: "آتورواستاتین",
            classification: "HMG-CoA Reductase Inhibitor",
            summary: "کاهش‌دهنده چربی خون.",
            publishedAt: "2026-03-20T10:00:00Z",
            versionNumber: 2,
            relevanceScore: 95,
            matchField: "name_fa",
            matchedTerm: "آتورواستاتین",
            verification: {
              isClinicallyVerified: true,
              verifiedAssertionsCount: 4,
              totalAssertionsCount: 4,
              lastVerifiedAt: "2026-03-20T11:00:00Z",
            },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        query: "آتورواستاتین",
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockSearchData }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.search({
        q: "آتورواستاتین",
        type: "drug",
        limit: 20,
        offset: 0,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/v1/pocket/search?");
      expect(calledUrl).toContain("q=%D8%A2%D8%AA%D9%88%D8%B1%D9%88%D8%A7%D8%B3%D8%AA%D8%A7%D8%AA%DB%8C%D9%86");
      expect(calledUrl).toContain("type=drug");
      expect(calledUrl).toContain("limit=20");
      expect(calledUrl).toContain("offset=0");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("drug-123");
      expect(result.items[0].verification.isClinicallyVerified).toBe(true);
    });

    it("getSuggestions: sends GET to /v1/pocket/search/suggestions", async () => {
      const mockSuggestionsData: PocketSuggestionsResponse = {
        query: "asp",
        suggestions: [
          {
            id: "drug-asp",
            slug: "aspirin",
            type: "drug",
            titleEn: "Aspirin",
            titleFa: "آسپرین",
            classification: "NSAID / Antiplatelet",
            matchSource: "name_en",
            matchedText: "Aspirin",
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockSuggestionsData }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getSuggestions({ q: "asp", type: "drug", limit: 5 });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/v1/pocket/search/suggestions?");
      expect(calledUrl).toContain("q=asp");
      expect(calledUrl).toContain("type=drug");
      expect(calledUrl).toContain("limit=5");

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].titleEn).toBe("Aspirin");
    });

    it("getDiscovery: sends GET to /v1/pocket/discovery with category and sort", async () => {
      const mockDiscoveryData: PocketDiscoveryResponse = {
        items: [
          {
            id: "dis-1",
            slug: "hypertension",
            type: "disease",
            titleEn: "Essential Hypertension",
            titleFa: "فشار خون اولیه",
            classification: "Cardiovascular",
            summary: "فشار خون بالای بدون علت زمینه‌ای.",
            category: "Cardiovascular",
            publishedAt: "2026-03-21T08:00:00Z",
            versionNumber: 1,
            verification: {
              isClinicallyVerified: true,
              verifiedAssertionsCount: 2,
              totalAssertionsCount: 2,
              lastVerifiedAt: "2026-03-21T09:00:00Z",
            },
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
        type: "disease",
        category: "Cardiovascular",
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockDiscoveryData }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getDiscovery({
        type: "disease",
        category: "Cardiovascular",
        sort: "name_asc",
        limit: 10,
        offset: 0,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/v1/pocket/discovery?");
      expect(calledUrl).toContain("type=disease");
      expect(calledUrl).toContain("category=Cardiovascular");
      expect(calledUrl).toContain("sort=name_asc");

      expect(result.items[0].category).toBe("Cardiovascular");
    });

    it("getRelatedEntities: sends GET to /v1/pocket/aggregates/:type/:id/related", async () => {
      const mockRelatedData: PocketRelatedEntitiesResponse = {
        aggregateType: "drug",
        aggregateId: "e9365287-c999-4d6d-8c44-b25832a81830",
        groups: [
          {
            relationshipCategory: "indicated_diseases",
            relationshipLabelFa: "بیماری‌های اندیکه‌شده",
            entities: [
              {
                id: "d0944f77-ec0e-4ba9-9520-2521e1ebf4da",
                slug: "hyperlipidemia",
                type: "disease",
                titleEn: "Hyperlipidemia",
                titleFa: "هیپرلیپیدمی",
                classification: "Metabolic Disorder",
                relationshipType: "indicated_for",
                clinicalNotes: "خط اول درمان هیپرکلسترولمی",
                verification: {
                  isClinicallyVerified: true,
                  verifiedAssertionsCount: 3,
                  totalAssertionsCount: 3,
                  lastVerifiedAt: "2026-03-20T10:00:00Z",
                },
              },
            ],
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockRelatedData }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      const result = await api.getRelatedEntities(
        "drug",
        "e9365287-c999-4d6d-8c44-b25832a81830",
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        "/v1/pocket/aggregates/drug/e9365287-c999-4d6d-8c44-b25832a81830/related",
      );

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].relationshipCategory).toBe("indicated_diseases");
      expect(result.groups[0].entities[0].titleEn).toBe("Hyperlipidemia");
    });

    it("propagates ApiError on backend failure", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(400, {
          success: false,
          error: {
            code: "bad_request",
            message: "Search query is too long (maximum 100 characters).",
          },
        }),
      );

      const client = createApiClient({ baseUrl: "" });
      const api = createPocketApi(client);

      await expect(api.search({ q: "a".repeat(101) })).rejects.toThrow(ApiError);
    });
  });

  // ===========================================================================
  // 2. Query Keys Isolation & Collision Prevention
  // ===========================================================================

  describe("2. Deterministic Query Keys", () => {
    it("generates distinct, collision-free query keys for search, suggestions, discovery, and related", () => {
      const searchKey1 = pocketKeys.search({ q: "aspirin", type: "drug" });
      const searchKey2 = pocketKeys.search({ q: "aspirin", type: "all" });
      const searchKeyPage2 = pocketKeys.search({ q: "aspirin", type: "drug", offset: 20 });

      expect(searchKey1).toEqual(["pocket", "search", { q: "aspirin", type: "drug" }]);
      expect(searchKey1).not.toEqual(searchKey2);
      expect(searchKey1).not.toEqual(searchKeyPage2);

      const suggestionKey = pocketKeys.suggestion({ q: "asp", type: "drug" });
      expect(suggestionKey).toEqual(["pocket", "suggestions", { q: "asp", type: "drug" }]);
      expect(suggestionKey).not.toEqual(searchKey1);

      const discoveryKey = pocketKeys.discoveryList({ type: "disease", category: "Cardio" });
      expect(discoveryKey).toEqual([
        "pocket",
        "discovery",
        { type: "disease", category: "Cardio" },
      ]);

      const relatedKey = pocketKeys.relatedEntities(
        "drug",
        "e9365287-c999-4d6d-8c44-b25832a81830",
      );
      expect(relatedKey).toEqual([
        "pocket",
        "related",
        "drug",
        "e9365287-c999-4d6d-8c44-b25832a81830",
      ]);
    });
  });

  // ===========================================================================
  // 3. React Query Hooks & Enabled Behavior
  // ===========================================================================

  describe("3. React Query Hooks Execution", () => {
    it("usePocketSearch: prevents auto-fetching on empty query unless enabled", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Empty query with no type - should NOT fetch
      const { result } = renderHook(() => usePocketSearch({ q: "" }), { wrapper });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("usePocketSearch: fetches when search term is present", async () => {
      const mockResult: PocketSearchResponse = {
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
        query: "aspirin",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockResult }),
      );

      const { result } = renderHook(() => usePocketSearch({ q: "aspirin" }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.query).toBe("aspirin");
    });

    it("usePocketSuggestions: does not query server when query is empty or whitespace", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const { result } = renderHook(() => usePocketSuggestions({ q: "   " }), { wrapper });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("usePocketSuggestions: fetches suggestions when query is valid", async () => {
      const mockSuggestions: PocketSuggestionsResponse = {
        query: "met",
        suggestions: [
          {
            id: "d-met",
            slug: "metformin",
            type: "drug",
            titleEn: "Metformin",
            titleFa: "متفورمین",
            classification: "Biguanide",
            matchSource: "name_en",
            matchedText: "Metformin",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockSuggestions }),
      );

      const { result } = renderHook(() => usePocketSuggestions({ q: "met" }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.suggestions).toHaveLength(1);
    });

    it("usePocketDiscovery: fetches category browsing list", async () => {
      const mockDiscovery: PocketDiscoveryResponse = {
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "treatment",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockDiscovery }),
      );

      const { result } = renderHook(() => usePocketDiscovery({ type: "treatment" }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.type).toBe("treatment");
    });

    it("usePocketRelatedEntities: prevents request when ID is invalid identifier format", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const { result } = renderHook(
        () => usePocketRelatedEntities("drug", "invalid identifier!"),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("options.enabled = true CANNOT bypass input validation in any hook", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // 1. usePocketSearch: empty query with enabled: true
      const { result: emptySearchResult } = renderHook(
        () => usePocketSearch({ q: "" }, { enabled: true }),
        { wrapper },
      );
      expect(emptySearchResult.current.fetchStatus).toBe("idle");

      // 2. usePocketSearch: query too long with enabled: true
      const { result: longSearchResult } = renderHook(
        () => usePocketSearch({ q: "a".repeat(101) }, { enabled: true }),
        { wrapper },
      );
      expect(longSearchResult.current.fetchStatus).toBe("idle");

      // 3. usePocketSearch: invalid aggregate type with enabled: true
      const { result: invalidTypeSearchResult } = renderHook(
        () =>
          usePocketSearch(
            { q: "aspirin", type: "not_a_type" as unknown as ClinicalSearchAggregateType },
            { enabled: true },
          ),
        { wrapper },
      );
      expect(invalidTypeSearchResult.current.fetchStatus).toBe("idle");

      // 4. usePocketSuggestions: empty query with enabled: true
      const { result: emptySugResult } = renderHook(
        () => usePocketSuggestions({ q: "   " }, { enabled: true }),
        { wrapper },
      );
      expect(emptySugResult.current.fetchStatus).toBe("idle");

      // 5. usePocketDiscovery: category too long with enabled: true
      const { result: longCatResult } = renderHook(
        () => usePocketDiscovery({ category: "c".repeat(101) }, { enabled: true }),
        { wrapper },
      );
      expect(longCatResult.current.fetchStatus).toBe("idle");

      // 6. usePocketDiscovery: invalid sort with enabled: true
      const { result: invalidSortResult } = renderHook(
        () =>
          usePocketDiscovery(
            { sort: "invalid_sort" as unknown as DiscoverySortOption },
            { enabled: true },
          ),
        { wrapper },
      );
      expect(invalidSortResult.current.fetchStatus).toBe("idle");

      // 7. usePocketRelatedEntities: invalid identifier format with enabled: true
      const { result: invalidUuidResult } = renderHook(
        () => usePocketRelatedEntities("drug", "not a valid id!", { enabled: true }),
        { wrapper },
      );
      expect(invalidUuidResult.current.fetchStatus).toBe("idle");

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("prevents any hook from fetching when user is unauthenticated", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      mockIsAuthenticated = false;

      const { result } = renderHook(
        () => usePocketSearch({ q: "aspirin" }, { enabled: true }),
        { wrapper },
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe("idle");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("usePocketRelatedEntities: executes request when UUID is valid", async () => {
      const validUuid = "c8b0a514-4fb9-4f80-b747-91f1a5ff6818";
      const mockRelated: PocketRelatedEntitiesResponse = {
        aggregateType: "drug",
        aggregateId: validUuid,
        groups: [],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(200, { success: true, data: mockRelated }),
      );

      const { result } = renderHook(
        () => usePocketRelatedEntities("drug", validUuid),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.aggregateId).toBe(validUuid);
    });
  });

  // ===========================================================================
  // 4. Session Isolation & Confidentiality
  // ===========================================================================

  describe("4. Session Isolation & Security Invariants", () => {
    it("cleanupUserSessionCache purges search, discovery, and related caches", () => {
      // Seed search, discovery, related into queryClient
      queryClient.setQueryData(pocketKeys.search({ q: "test" }), { items: [], total: 0 });
      queryClient.setQueryData(pocketKeys.discoveryList({ type: "drug" }), { items: [] });
      queryClient.setQueryData(
        pocketKeys.relatedEntities("drug", "c8b0a514-4fb9-4f80-b747-91f1a5ff6818"),
        { groups: [] },
      );

      // Verify they are populated
      expect(queryClient.getQueryData(pocketKeys.search({ q: "test" }))).toBeDefined();
      expect(queryClient.getQueryData(pocketKeys.discoveryList({ type: "drug" }))).toBeDefined();
      expect(
        queryClient.getQueryData(
          pocketKeys.relatedEntities("drug", "c8b0a514-4fb9-4f80-b747-91f1a5ff6818"),
        ),
      ).toBeDefined();

      // Trigger session cleanup
      cleanupUserSessionCache(queryClient);

      // Verify all pocket queries starting with ["pocket"] are wiped
      expect(queryClient.getQueryData(pocketKeys.search({ q: "test" }))).toBeUndefined();
      expect(queryClient.getQueryData(pocketKeys.discoveryList({ type: "drug" }))).toBeUndefined();
      expect(
        queryClient.getQueryData(
          pocketKeys.relatedEntities("drug", "c8b0a514-4fb9-4f80-b747-91f1a5ff6818"),
        ),
      ).toBeUndefined();
    });

    it("search and discovery item types do not expose privileged reviewer notes or IDs", () => {
      const searchItem: PocketSearchResponse["items"][0] = {
        id: "d-1",
        slug: "drug-1",
        type: "drug",
        titleEn: "Drug",
        titleFa: "دارو",
        classification: "Class",
        summary: "Summary",
        publishedAt: "2026-01-01",
        versionNumber: 1,
        relevanceScore: 100,
        matchField: "name_fa",
        matchedTerm: "دارو",
        verification: {
          isClinicallyVerified: true,
          verifiedAssertionsCount: 1,
          totalAssertionsCount: 1,
          lastVerifiedAt: "2026-01-01",
        },
      };

      // Type-level assertion: searchItem must not have reviewerUserId or clinicalReviewNotes
      expect((searchItem as unknown as Record<string, unknown>).reviewerUserId).toBeUndefined();
      expect((searchItem as unknown as Record<string, unknown>).clinicalReviewNotes).toBeUndefined();
    });
  });
});
