import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import type { AuthMiddlewareDeps } from "../../../http/authMiddleware.js";
import { PocketSearchService } from "../pocket-search-service.js";
import { pocketSearchRoutes } from "../pocket-search-routes.js";
import { InMemoryPocketSearchStore, type MockEntityData } from "./in-memory-pocket-search-store.js";
import {
  normalizeClinicalText,
  compareUnicodeCodePoint,
  getNormalizedTitleSortKey,
} from "../pocket-text-normalizer.js";
import { InMemoryAssertionConsumptionStore } from "../assertion-consumption-store.js";
import { AssertionConsumptionService } from "../assertion-consumption-service.js";
import { pocketAssertionConsumptionRoutes } from "../assertion-consumption-routes.js";

describe("AVANA Pocket UI-4.1: Clinical Discovery & Search Backend Foundation", () => {
  let searchStore: InMemoryPocketSearchStore;
  let searchService: PocketSearchService;
  let consumptionStore: InMemoryAssertionConsumptionStore;
  let consumptionService: AssertionConsumptionService;
  let app: FastifyInstance;

  // Stable UUIDs for test entities
  const drug1Id = randomUUID();
  const drugDraftId = randomUUID();
  const disease1Id = randomUUID();
  const diseaseDraftId = randomUUID();
  const treatment1Id = randomUUID();
  const emergency1Id = randomUUID();

  beforeEach(async () => {
    searchStore = new InMemoryPocketSearchStore();
    searchService = new PocketSearchService({ searchStore });

    consumptionStore = new InMemoryAssertionConsumptionStore();
    consumptionService = new AssertionConsumptionService({ consumptionStore });

    // Seed published drug with Persian name containing ZWNJ & Arabic Kaf/Yeh variations
    const drug1: MockEntityData = {
      id: drug1Id,
      slug: "atorvastatin",
      type: "drug",
      titleEn: "Atorvastatin",
      titleFa: "آتورواستاتین",
      classification: "HMG-CoA Reductase Inhibitor",
      summary: "کاهش‌دهنده کلسترول و چربی خون",
      category: "HMG-CoA Reductase Inhibitor",
      status: "published",
      versionNumber: 1,
      publishedAt: "2026-03-01T10:00:00Z",
      brandNames: ["لیپیتور", "Lipitor"],
      aliases: ["آتورواستاتین کلسیم", "Atorvastatin Calcium"],
      verification: {
        isClinicallyVerified: true,
        verifiedAssertionsCount: 3,
        totalAssertionsCount: 3,
        lastVerifiedAt: "2026-03-02T12:00:00Z",
      },
    };

    // Seed draft drug (MUST NEVER be exposed in search or direct consumption)
    const drugDraft: MockEntityData = {
      id: drugDraftId,
      slug: "secret-draft-drug",
      type: "drug",
      titleEn: "Secret Draft Drug",
      titleFa: "داروی آزمایشی محرمانه",
      classification: "Experimental",
      summary: "پیش‌نویس منتشرنشده",
      category: "Experimental",
      status: "draft",
      versionNumber: 1,
      publishedAt: null,
      verification: {
        isClinicallyVerified: false,
        verifiedAssertionsCount: 0,
        totalAssertionsCount: 0,
        lastVerifiedAt: null,
      },
    };

    // Seed published disease
    const disease1: MockEntityData = {
      id: disease1Id,
      slug: "hypertension",
      type: "disease",
      titleEn: "Essential Hypertension",
      titleFa: "فشار خون اولیه",
      classification: "I10",
      summary: "افزایش مزمن فشار خون سیستولیک یا دیاستولیک",
      category: "I10",
      status: "published",
      versionNumber: 2,
      publishedAt: "2026-02-15T08:00:00Z",
      aliases: ["HTN", "فشارخون بالا"],
      verification: {
        isClinicallyVerified: true,
        verifiedAssertionsCount: 2,
        totalAssertionsCount: 2,
        lastVerifiedAt: "2026-02-20T10:00:00Z",
      },
    };

    // Seed draft disease
    const diseaseDraft: MockEntityData = {
      id: diseaseDraftId,
      slug: "draft-disease",
      type: "disease",
      titleEn: "Draft Rare Syndrome",
      titleFa: "سندروم نادر پیش‌نویس",
      classification: "Q99",
      summary: "بیماری در دست بررسی",
      category: "Q99",
      status: "draft",
      versionNumber: 1,
      publishedAt: null,
    };

    // Seed published treatment
    const treatment1: MockEntityData = {
      id: treatment1Id,
      slug: "lipid-lowering-therapy",
      type: "treatment",
      titleEn: "Statin Therapy Guidelines",
      titleFa: "دستورالعمل درمانی استاتین‌ها",
      classification: "pharmacological",
      summary: "استراتژی درمانی کاهش چربی خون و پیشگیری از حوادث قلبی عروقی",
      category: "pharmacological",
      status: "published",
      versionNumber: 1,
      publishedAt: "2026-01-10T12:00:00Z",
      verification: {
        isClinicallyVerified: false,
        verifiedAssertionsCount: 0,
        totalAssertionsCount: 1,
        lastVerifiedAt: null,
      },
    };

    // Seed published emergency
    const emergency1: MockEntityData = {
      id: emergency1Id,
      slug: "hypertensive-crisis",
      type: "emergency",
      titleEn: "Hypertensive Crisis",
      titleFa: "بحران فشار خون اورژانسی",
      classification: "cardiovascular",
      summary: "افزایش بحرانی فشار خون همراه با آسیب حاد اندام هدف",
      category: "cardiovascular",
      status: "published",
      versionNumber: 3,
      publishedAt: "2026-03-10T14:00:00Z",
      aliases: ["اورژانس هیپرتانسیون"],
      verification: {
        isClinicallyVerified: true,
        verifiedAssertionsCount: 4,
        totalAssertionsCount: 5,
        lastVerifiedAt: "2026-03-12T09:00:00Z",
      },
    };

    searchStore.registerEntity(drug1);
    searchStore.registerEntity(drugDraft);
    searchStore.registerEntity(disease1);
    searchStore.registerEntity(diseaseDraft);
    searchStore.registerEntity(treatment1);
    searchStore.registerEntity(emergency1);

    // Seed relationships
    // Published Drug1 -> Published Disease1 (Indicated)
    searchStore.registerRelation({
      sourceType: "drug",
      sourceId: drug1Id,
      targetType: "disease",
      targetId: disease1Id,
      relationshipCategory: "indicated_diseases",
      relationshipLabelFa: "بیماری‌ها و اندیکاسیون‌های مرتبط",
      relationshipType: "primary_indication",
      clinicalNotes: "خط اول در درمان دیس‌لیپیدمی مرتبط با پرفشاری خون",
    });

    // Published Drug1 -> Draft Disease (MUST NEVER be exposed via relationship traversal!)
    searchStore.registerRelation({
      sourceType: "drug",
      sourceId: drug1Id,
      targetType: "disease",
      targetId: diseaseDraftId,
      relationshipCategory: "indicated_diseases",
      relationshipLabelFa: "بیماری‌ها و اندیکاسیون‌های مرتبط",
      relationshipType: "experimental_indication",
    });

    // Published Disease1 -> Published Treatment1
    searchStore.registerRelation({
      sourceType: "disease",
      sourceId: disease1Id,
      targetType: "treatment",
      targetId: treatment1Id,
      relationshipCategory: "treatments",
      relationshipLabelFa: "راهنماها و خطوط درمان",
      relationshipType: "first_line_guideline",
    });

    // Also register in consumptionStore for direct UUID metadata checks
    consumptionStore.registerMetadata({
      id: drug1Id,
      type: "drug",
      slug: "atorvastatin",
      nameEn: "Atorvastatin",
      nameFa: "آتورواستاتین",
      classification: "HMG-CoA Reductase Inhibitor",
      summary: "کاهش‌دهنده کلسترول",
      versionNumber: 1,
      publishedAt: "2026-03-01T10:00:00Z",
    });

    consumptionStore.registerDraftAggregate("drug", drugDraftId, {
      id: drugDraftId,
      type: "drug",
      slug: "secret-draft-drug",
      nameEn: "Secret Draft Drug",
      nameFa: "داروی آزمایشی",
      classification: "Experimental",
      summary: "پیش‌نویس",
      versionNumber: 1,
      publishedAt: null,
    });

    // Mock Auth & Session Service
    const mockSessionService = {
      validateSessionDetails: async (_token: string) => ({
        valid: true,
        revoked: false,
        user: { userId: "test-user-1", role: "student", globalRole: null },
      }),
      getConfig: () => ({}),
    };
    const mockUserStore = {
      findById: async (id: string) => ({
        id,
        email: "student@avana.ir",
        role: "student",
      }),
    };

    app = fastify({ logger: false });
    await app.register(errorHandlerPlugin);

    // Register search routes
    await app.register(pocketSearchRoutes, {
      pocketSearchService: searchService,
      sessionService: mockSessionService as unknown as AuthMiddlewareDeps["sessionService"],
      userStore: mockUserStore as unknown as AuthMiddlewareDeps["userStore"],
    });

    // Register consumption routes
    await app.register(pocketAssertionConsumptionRoutes, {
      assertionConsumptionService: consumptionService,
      sessionService: mockSessionService as unknown as AuthMiddlewareDeps["sessionService"],
      userStore: mockUserStore as unknown as AuthMiddlewareDeps["userStore"],
    });

    await app.ready();
  });

  // ===========================================================================
  // 1. Persian Exact Search
  // ===========================================================================
  it("1. matches Persian exact query and ranks with highest score", async () => {
    const res = await searchService.search({ q: "آتورواستاتین" });
    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.items[0].id).toBe(drug1Id);
    expect(res.items[0].relevanceScore).toBe(100);
    expect(res.items[0].matchField).toBe("name_fa");
  });

  // ===========================================================================
  // 2. English Exact Search
  // ===========================================================================
  it("2. matches English exact query case-insensitively", async () => {
    const res = await searchService.search({ q: "atorvastatin" });
    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.items[0].id).toBe(drug1Id);
    expect(res.items[0].relevanceScore).toBe(100);
    expect(res.items[0].matchField).toBe("name_en");
  });

  // ===========================================================================
  // 3. Persian Partial Search & Normalization (ZWNJ, Arabic Yeh/Kaf, Diacritics)
  // ===========================================================================
  it("3. handles Persian text with Arabic Kaf, Arabic Yeh, ZWNJ and diacritics bidirectionally", async () => {
    // Query with Arabic Kaf (ك \u0643) and Arabic Yeh (ي \u064a) and Fatha
    const arabicQuery = "آتُورواستاتين"; // Contains Harakat and Arabic Yeh
    const res = await searchService.search({ q: arabicQuery });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe(drug1Id);

    // Query with ZWNJ (نیم‌فاصله) vs without ZWNJ
    const resDisease = await searchService.search({ q: "فشار‌خون" }); // with ZWNJ
    expect(resDisease.total).toBe(1);
    expect(resDisease.items[0].id).toBe(disease1Id);
  });

  // ===========================================================================
  // 4. Alias Matching
  // ===========================================================================
  it("4. matches registered aliases and brand names", async () => {
    // Search by brand name
    const brandRes = await searchService.search({ q: "لیپیتور" });
    expect(brandRes.total).toBe(1);
    expect(brandRes.items[0].id).toBe(drug1Id);
    expect(brandRes.items[0].matchField).toBe("brand_name");

    // Search by alias
    const aliasRes = await searchService.search({ q: "HTN" });
    expect(aliasRes.total).toBe(1);
    expect(aliasRes.items[0].id).toBe(disease1Id);
    expect(aliasRes.items[0].matchField).toBe("alias");
  });

  // ===========================================================================
  // 5. All Four Entity Types
  // ===========================================================================
  it("5. searches and returns all four clinical entity types", async () => {
    const allRes = await searchService.search({ q: "" }); // Empty returns all published
    expect(allRes.total).toBe(4);
    const types = new Set(allRes.items.map((i) => i.type));
    expect(types.has("drug")).toBe(true);
    expect(types.has("disease")).toBe(true);
    expect(types.has("treatment")).toBe(true);
    expect(types.has("emergency")).toBe(true);
  });

  // ===========================================================================
  // 6. Type Filtering
  // ===========================================================================
  it("6. filters results strictly by entity type", async () => {
    const drugOnly = await searchService.search({ type: "drug" });
    expect(drugOnly.items.every((i) => i.type === "drug")).toBe(true);

    const diseaseOnly = await searchService.search({ type: "disease" });
    expect(diseaseOnly.items.every((i) => i.type === "disease")).toBe(true);

    const emergencyOnly = await searchService.search({ type: "emergency" });
    expect(emergencyOnly.items.every((i) => i.type === "emergency")).toBe(true);
  });

  // ===========================================================================
  // 7. Published-Only Isolation
  // ===========================================================================
  it("7. strictly isolates published content and excludes draft or archived records", async () => {
    const res = await searchService.search({ q: "محرمانه" }); // Matches draft drug
    expect(res.total).toBe(0);
    expect(res.items.length).toBe(0);

    const resRare = await searchService.search({ q: "سندروم نادر" }); // Matches draft disease
    expect(resRare.total).toBe(0);
  });

  // ===========================================================================
  // 8. Draft UUID Metadata Access Rejection
  // ===========================================================================
  it("8. rejects direct access to draft entity metadata with 404", async () => {
    // Published drug metadata succeeds
    const publishedMeta = await consumptionService.getAggregateMetadata("drug", drug1Id);
    expect(publishedMeta.id).toBe(drug1Id);

    // Draft drug metadata MUST throw 404 not_found
    await expect(
      consumptionService.getAggregateMetadata("drug", drugDraftId),
    ).rejects.toThrow(/not found/i);
  });

  // ===========================================================================
  // 9. Pagination
  // ===========================================================================
  it("9. supports deterministic pagination with limit, offset, and hasMore", async () => {
    const page1 = await searchService.search({ limit: 2, offset: 0 });
    expect(page1.items.length).toBe(2);
    expect(page1.total).toBe(4);
    expect(page1.hasMore).toBe(true);

    const page2 = await searchService.search({ limit: 2, offset: 2 });
    expect(page2.items.length).toBe(2);
    expect(page2.total).toBe(4);
    expect(page2.hasMore).toBe(false);

    // Ensure no overlapping IDs between pages
    const idsPage1 = new Set(page1.items.map((i) => i.id));
    for (const item of page2.items) {
      expect(idsPage1.has(item.id)).toBe(false);
    }
  });

  // ===========================================================================
  // 10. Deterministic Ranking
  // ===========================================================================
  it("10. ranks exact matches above partial matches with deterministic secondary ordering", async () => {
    // Add two items where one is exact and one starts with prefix
    searchStore.registerEntity({
      id: randomUUID(),
      slug: "atorvastatin-combination",
      type: "drug",
      titleEn: "Atorvastatin Combination",
      titleFa: "آتورواستاتین ترکیبی",
      classification: "Lipid Regulating",
      summary: "داروی ترکیبی",
      category: "Lipid Regulating",
      status: "published",
      versionNumber: 1,
      publishedAt: "2026-03-05T00:00:00Z",
    });

    const res = await searchService.search({ q: "آتورواستاتین" });
    expect(res.items.length).toBe(2);
    expect(res.items[0].id).toBe(drug1Id); // Exact match
    expect(res.items[0].relevanceScore).toBe(100);
    expect(res.items[1].relevanceScore).toBeLessThan(100); // Partial prefix match
  });

  // ===========================================================================
  // 11. Suggestions (Typeahead)
  // ===========================================================================
  it("11. returns fast, lightweight autocomplete suggestions for published entities", async () => {
    const sugRes = await searchService.getSuggestions({ q: "فشار" });
    expect(sugRes.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(sugRes.suggestions[0].titleFa).toContain("فشار");
    expect(sugRes.suggestions[0].slug).toBeDefined();

    // Max 10 limit enforcement
    const capped = await searchService.getSuggestions({ q: "ا", limit: 20 });
    expect(capped.suggestions.length).toBeLessThanOrEqual(10);
  });

  // ===========================================================================
  // 12. Related Entity Publication Isolation
  // ===========================================================================
  it("12. discovers related entities and strictly excludes unpublished targets", async () => {
    const related = await searchService.getRelatedEntities("drug", drug1Id);
    expect(related.aggregateId).toBe(drug1Id);
    expect(related.groups.length).toBe(1);

    const indGroup = related.groups[0];
    expect(indGroup.relationshipCategory).toBe("indicated_diseases");
    expect(indGroup.entities.length).toBe(1);
    expect(indGroup.entities[0].id).toBe(disease1Id); // Only published disease

    // Ensure draft disease (diseaseDraftId) was NOT included
    const hasDraft = indGroup.entities.some((e) => e.id === diseaseDraftId);
    expect(hasDraft).toBe(false);

    // Querying related via slug returns the same results with canonical UUID as aggregateId
    const relatedBySlug = await searchService.getRelatedEntities("drug", "atorvastatin");
    expect(relatedBySlug.aggregateId).toBe(drug1Id);
    expect(relatedBySlug.groups).toEqual(related.groups);

    // Querying related for a draft drug throws 404
    await expect(searchService.getRelatedEntities("drug", drugDraftId)).rejects.toThrow(/not found/i);
  });

  it("12b. resolves drug related entities with interactions by slug, returning canonical UUID and interacting drug", async () => {
    const interactingDrugId = randomUUID();
    searchStore.registerEntity({
      id: interactingDrugId,
      slug: "clarithromycin",
      type: "drug",
      titleEn: "Clarithromycin",
      titleFa: "کلاریترومایسین",
      classification: "Macrolide Antibiotic",
      summary: "آنتی‌بیوتیک ماکرولید و مهارکننده قوی CYP3A4",
      category: "Macrolide Antibiotic",
      status: "published",
      versionNumber: 1,
      publishedAt: "2026-03-01T10:00:00Z",
    });

    searchStore.registerRelation({
      sourceType: "drug",
      sourceId: drug1Id,
      targetType: "drug",
      targetId: interactingDrugId,
      relationshipCategory: "interactions",
      relationshipLabelFa: "تداخلات دارویی مهم",
      relationshipType: "تداخل: severe",
      clinicalNotes: "افزایش غلظت خونی آتورواستاتین و خطر رابدومیولیز",
    });

    // 1. Drug requested with Slug
    const relatedBySlug = await searchService.getRelatedEntities("drug", "atorvastatin");

    // 2. Canonical UUID returned
    expect(relatedBySlug.aggregateId).toBe(drug1Id);
    expect(relatedBySlug.aggregateType).toBe("drug");

    // 3. Interactions group returned
    const interactionGroup = relatedBySlug.groups.find((g) => g.relationshipCategory === "interactions");
    expect(interactionGroup).toBeDefined();

    // 4. Other drug ID and relationship info returned accurately
    const interactingDrug = interactionGroup?.entities.find((e) => e.id === interactingDrugId);
    expect(interactingDrug).toBeDefined();
    expect(interactingDrug?.titleEn).toBe("Clarithromycin");
    expect(interactingDrug?.relationshipType).toBe("تداخل: severe");
    expect(interactingDrug?.clinicalNotes).toContain("افزایش غلظت خونی آتورواستاتین");
  });

  // ===========================================================================
  // 13. Verification Status Integrity
  // ===========================================================================
  it("13. reports authentic clinical verification status and distinguishes unverified entities", async () => {
    const res = await searchService.search({ q: "آتورواستاتین" });
    const drugItem = res.items.find((i) => i.id === drug1Id);
    expect(drugItem?.verification.isClinicallyVerified).toBe(true);
    expect(drugItem?.verification.verifiedAssertionsCount).toBe(3);

    // Statin Therapy Guidelines has 0 verified assertions
    const treatRes = await searchService.search({ q: "استاتین" });
    const treatItem = treatRes.items.find((i) => i.id === treatment1Id);
    expect(treatItem?.verification.isClinicallyVerified).toBe(false);
    expect(treatItem?.verification.verifiedAssertionsCount).toBe(0);
  });

  // ===========================================================================
  // 14. Invalid Parameters Handling
  // ===========================================================================
  it("14. rejects invalid query parameters with DomainError 400", async () => {
    await expect(searchService.search({ type: "invalid_type" })).rejects.toThrow(/invalid aggregate type/i);
    await expect(searchService.search({ limit: 999 })).rejects.toThrow(/out of bounds/i);
    await expect(searchService.search({ offset: -5 })).rejects.toThrow(/out of bounds/i);
    await expect(searchService.search({ q: "a".repeat(101) })).rejects.toThrow(/too long/i);
    await expect(searchService.getRelatedEntities("drug", "invalid id with spaces!")).rejects.toThrow(/invalid aggregate identifier/i);
    await expect(searchService.getRelatedEntities("drug", "not-a-uuid")).rejects.toThrow(/not found/i);
  });

  // ===========================================================================
  // 15. Fastify HTTP Endpoints Integration & Empty Query Behavior
  // ===========================================================================
  it("15. executes all endpoints via Fastify HTTP request injection", async () => {
    const authHeaders = { authorization: "Bearer test-token" };

    // 15a. GET /v1/pocket/search
    const searchHttp = await app.inject({
      method: "GET",
      url: "/v1/pocket/search?q=atorvastatin&type=drug",
      headers: authHeaders,
    });
    expect(searchHttp.statusCode).toBe(200);
    const searchBody = JSON.parse(searchHttp.body);
    expect(searchBody.success).toBe(true);
    expect(searchBody.data.items.length).toBe(1);

    // 15b. GET /v1/pocket/search/suggestions
    const sugHttp = await app.inject({
      method: "GET",
      url: "/v1/pocket/search/suggestions?q=ator",
      headers: authHeaders,
    });
    expect(sugHttp.statusCode).toBe(200);
    const sugBody = JSON.parse(sugHttp.body);
    expect(sugBody.data.suggestions.length).toBeGreaterThanOrEqual(1);

    // 15c. GET /v1/pocket/discovery (Browsing without search query)
    const discHttp = await app.inject({
      method: "GET",
      url: "/v1/pocket/discovery?type=disease&category=I10",
      headers: authHeaders,
    });
    expect(discHttp.statusCode).toBe(200);
    const discBody = JSON.parse(discHttp.body);
    expect(discBody.data.items.length).toBe(1);
    expect(discBody.data.items[0].id).toBe(disease1Id);

    // 15d. GET /v1/pocket/aggregates/:type/:id/related
    const relHttp = await app.inject({
      method: "GET",
      url: `/v1/pocket/aggregates/drug/${drug1Id}/related`,
      headers: authHeaders,
    });
    expect(relHttp.statusCode).toBe(200);
    const relBody = JSON.parse(relHttp.body);
    expect(relBody.data.groups.length).toBe(1);
  });

  // ===========================================================================
  // 16. Regression: Normalization Parity for Hyphenated & Punctuation Terms
  // ===========================================================================
  it("16. normalizes hyphenated and slash-separated terms with exact character count parity", async () => {
    const { PG_PUNCTUATION_FROM, PG_PUNCTUATION_TO, escapeSqlLikePattern } = await import(
      "../pocket-text-normalizer.js"
    );

    // Verify 22-char equality
    expect(PG_PUNCTUATION_FROM.length).toBe(22);
    expect(PG_PUNCTUATION_TO.length).toBe(22);
    expect(PG_PUNCTUATION_TO).toBe(" ".repeat(22));

    // Hyphenated term normalization
    expect(normalizeClinicalText("Co-Amoxiclav")).toBe("co amoxiclav");
    expect(normalizeClinicalText("co amoxiclav")).toBe("co amoxiclav");
    expect(normalizeClinicalText("Co-Amoxiclav")).toBe(normalizeClinicalText("co amoxiclav"));

    // Slash and bracket normalization
    expect(normalizeClinicalText("Trimethoprim/Sulfamethoxazole")).toBe("trimethoprim sulfamethoxazole");
    expect(normalizeClinicalText("Vitamin B12 [Cobalamin]")).toBe("vitamin b12 cobalamin");

    // Wildcard escaping with !
    expect(escapeSqlLikePattern("50%")).toBe("50!%");
    expect(escapeSqlLikePattern("drug_a")).toBe("drug!_a");
    expect(escapeSqlLikePattern("alert!100")).toBe("alert!!100");
  });

  // ===========================================================================
  // 17. Regression: Rejection of Unsupported 'assertions_count' Sort
  // ===========================================================================
  it("17. rejects unsupported sort=assertions_count with HTTP 400 Bad Request", async () => {
    const authHeaders = { authorization: "Bearer test-token" };

    const res = await app.inject({
      method: "GET",
      url: "/v1/pocket/discovery?sort=assertions_count",
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("Invalid sort parameter 'assertions_count'");
    expect(body.error.message).toContain("recent, name_asc, name_desc");
  });

  // ===========================================================================
  // 18. Regression: Related Entity Deduplication with Merged Relationship Metadata
  // ===========================================================================
  it("18. deduplicates related entities by type:id and merges relationship metadata", async () => {
    // Add multiple relations connecting drug1 to disease1 with different types and notes
    searchStore.registerRelation({
      sourceType: "drug",
      sourceId: drug1Id,
      targetType: "disease",
      targetId: disease1Id,
      relationshipCategory: "indicated_diseases",
      relationshipLabelFa: "اندیکاسیون‌ها",
      relationshipType: "primary_indication",
      clinicalNotes: "خط اول درمان برای هیپرکلسترولمی",
    });

    searchStore.registerRelation({
      sourceType: "drug",
      sourceId: drug1Id,
      targetType: "disease",
      targetId: disease1Id,
      relationshipCategory: "indicated_diseases",
      relationshipLabelFa: "اندیکاسیون‌ها",
      relationshipType: "secondary_prevention",
      clinicalNotes: "پیشگیری ثانویه پس از سکته قلبی",
    });

    const related = await searchService.getRelatedEntities("drug", drug1Id);
    const indGroup = related.groups.find((g) => g.relationshipCategory === "indicated_diseases");
    expect(indGroup).toBeDefined();

    // Exactly 1 deduplicated disease entity
    expect(indGroup!.entities.filter((e) => e.id === disease1Id).length).toBe(1);

    const diseaseEntity = indGroup!.entities.find((e) => e.id === disease1Id)!;
    expect(diseaseEntity.relationshipType).toContain("primary_indication");
    expect(diseaseEntity.relationshipType).toContain("secondary_prevention");
    expect(diseaseEntity.clinicalNotes).toContain("خط اول درمان");
    expect(diseaseEntity.clinicalNotes).toContain("پیشگیری ثانویه");
  });

  // ===========================================================================
  // 19. Regression: Scoped Batch Verification Execution & Empty Array Safety
  // ===========================================================================
  it("19. batch verification returns composite keys and handles empty input safely", async () => {
    if (searchStore.getVerificationStatusBatch) {
      // Empty input returns empty map without querying
      const emptyMap = await searchStore.getVerificationStatusBatch([]);
      expect(emptyMap.size).toBe(0);

      // Scoped batch lookup
      const batchRes = await searchStore.getVerificationStatusBatch([
        { type: "drug", id: drug1Id },
        { type: "disease", id: disease1Id },
      ]);

      expect(batchRes.has(`drug:${drug1Id}`)).toBe(true);
      expect(batchRes.has(`disease:${disease1Id}`)).toBe(true);
      expect(batchRes.get(`drug:${drug1Id}`)?.isClinicallyVerified).toBe(true);
      expect(batchRes.get(`disease:${disease1Id}`)?.isClinicallyVerified).toBe(true);
    }
  });

  // ===========================================================================
  // 20. Multi-token Search: Word Order Independence
  // ===========================================================================
  it("20. multi-token search matches entities regardless of word order", async () => {
    // Search with reversed word order "کلسیم آتورواستاتین" against alias "آتورواستاتین کلسیم"
    const resReversed = await searchService.search({ q: "کلسیم آتورواستاتین" });
    expect(resReversed.items.length).toBeGreaterThanOrEqual(1);
    expect(resReversed.items[0].id).toBe(drug1Id);

    // Search with original word order "آتورواستاتین کلسیم"
    const resOriginal = await searchService.search({ q: "آتورواستاتین کلسیم" });
    expect(resOriginal.items.length).toBeGreaterThanOrEqual(1);
    expect(resOriginal.items[0].id).toBe(drug1Id);
  });

  // ===========================================================================
  // 21. Multi-token Search: Cross-Field Matching
  // ===========================================================================
  it("21. multi-token search matches across different fields of the same entity", async () => {
    // "آتورواستاتین" is in titleFa, "لیپیتور" is in brandNames
    const resTitleAndBrand = await searchService.search({ q: "آتورواستاتین لیپیتور" });
    expect(resTitleAndBrand.items.length).toBeGreaterThanOrEqual(1);
    expect(resTitleAndBrand.items[0].id).toBe(drug1Id);

    // "آتورواستاتین" is in titleFa, "کاهش‌دهنده" is in summary
    const resTitleAndSummary = await searchService.search({ q: "آتورواستاتین چربی" });
    expect(resTitleAndSummary.items.length).toBeGreaterThanOrEqual(1);
    expect(resTitleAndSummary.items[0].id).toBe(drug1Id);
  });

  // ===========================================================================
  // 22. Multi-token Search: Strict Exclusion on Missing Token
  // ===========================================================================
  it("22. multi-token search strictly excludes entities missing even one token", async () => {
    // "آتورواستاتین" exists, but "دیابت" does NOT exist on drug1
    const res = await searchService.search({ q: "آتورواستاتین دیابت" });
    expect(res.items.some((item) => item.id === drug1Id)).toBe(false);
  });

  // ===========================================================================
  // 23. Bounded Query Validation: > 6 Unique Tokens Rejection
  // ===========================================================================
  it("23. bounded query validation rejects query with more than 6 unique tokens with 400 DomainError", async () => {
    const authHeaders = { authorization: "Bearer test-token" };
    // 7 unique tokens
    const querySevenTokens = "یک دو سه چهار پنج شش هفت";
    await expect(searchService.search({ q: querySevenTokens })).rejects.toThrow(
      "Search query contains too many terms (maximum 6 words).",
    );

    // Via HTTP injection to verify Fastify 400 mapping
    const response = await app.inject({
      method: "GET",
      url: `/v1/pocket/search?q=${encodeURIComponent(querySevenTokens)}`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("Search query contains too many terms");
  });

  // ===========================================================================
  // 24. Bounded Query Validation: > 100 Characters Rejection
  // ===========================================================================
  it("24. bounded query validation rejects query exceeding 100 characters with 400 DomainError", async () => {
    const authHeaders = { authorization: "Bearer test-token" };
    const longQuery = "داروی_".repeat(25); // > 100 characters
    await expect(searchService.search({ q: longQuery })).rejects.toThrow(
      "Search query is too long (maximum 100 characters).",
    );

    const response = await app.inject({
      method: "GET",
      url: `/v1/pocket/search?q=${encodeURIComponent(longQuery)}`,
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("Search query is too long");
  });

  // ===========================================================================
  // 25. Deterministic Tie-breaking: Stable Pagination Across Identical Scores
  // ===========================================================================
  it("25. deterministic tie-breaking ensures identical total ordering with code-point collation and UUID id ASC", async () => {
    // Register 4 entities with identical score and title to test secondary tie-breaking
    const idA = "11111111-1111-4111-8111-111111111111";
    const idB = "22222222-2222-4222-8222-222222222222";
    const idC = "33333333-3333-4333-8333-333333333333";

    searchStore.registerEntity({
      id: idB,
      slug: "test-b",
      type: "drug",
      titleEn: "Beta Drug",
      titleFa: "داروی تست",
      classification: "Test",
      summary: "خلاصه تست",
      category: "Test",
      status: "published",
      versionNumber: 1,
      publishedAt: "2026-03-01T10:00:00Z",
    });

    searchStore.registerEntity({
      id: idA,
      slug: "test-a",
      type: "drug",
      titleEn: "Alpha Drug",
      titleFa: "داروی تست",
      classification: "Test",
      summary: "خلاصه تست",
      category: "Test",
      status: "published",
      versionNumber: 1,
      publishedAt: "2026-03-01T10:00:00Z",
    });

    searchStore.registerEntity({
      id: idC,
      slug: "test-c",
      type: "drug",
      titleEn: "Gamma Drug",
      titleFa: "داروی تست",
      classification: "Test",
      summary: "خلاصه تست",
      category: "Test",
      status: "published",
      versionNumber: 1,
      publishedAt: "2026-03-01T10:00:00Z",
    });

    // Query matching all 3 equally
    const page1 = await searchService.search({ q: "داروی تست", limit: 2, offset: 0 });
    const page2 = await searchService.search({ q: "داروی تست", limit: 2, offset: 2 });

    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(1);

    // Guaranteed order by id ASC: idA then idB on page 1, idC on page 2
    expect(page1.items[0].id).toBe(idA);
    expect(page1.items[1].id).toBe(idB);
    expect(page2.items[0].id).toBe(idC);

    // Zero duplicates between pages
    const page1Ids = new Set(page1.items.map((i) => i.id));
    for (const item of page2.items) {
      expect(page1Ids.has(item.id)).toBe(false);
    }
  });

  // ===========================================================================
  // 26. Code Point Comparator & Collation Test Suite
  // ===========================================================================
  it("26. code point comparator accurately orders Persian letters (ب, پ, چ, ژ, گ), numbers, English, and non-BMP characters", () => {
    // In code point order (ASCII numbers < ASCII upper < ASCII lower < Persian Unicode block)
    expect(compareUnicodeCodePoint("123", "abc")).toBe(-1);
    expect(compareUnicodeCodePoint("ABC", "abc")).toBe(-1);
    expect(compareUnicodeCodePoint("abc", "آتورواستاتین")).toBe(-1);

    // Persian specific letters in Unicode code point order:
    // ب (\u0628) < پ (\u067E)
    expect(compareUnicodeCodePoint("ب", "پ")).toBe(-1);
    // ج (\u062C) < چ (\u0686)
    expect(compareUnicodeCodePoint("ج", "چ")).toBe(-1);
    // ز (\u0632) < ژ (\u0698)
    expect(compareUnicodeCodePoint("ز", "ژ")).toBe(-1);
    // ک (\u06A9) < گ (\u06AF)
    expect(compareUnicodeCodePoint("ک", "گ")).toBe(-1);

    // Normalized sort key matches normalized text
    expect(getNormalizedTitleSortKey("آتورواستاتین كلسيم")).toBe("آتورواستاتین کلسیم");

    // Non-BMP surrogate pairs (e.g. Emoji 💊 U+1F48A vs 💉 U+1F489)
    // 💉 U+1F489 < 💊 U+1F48A
    expect(compareUnicodeCodePoint("💉", "💊")).toBe(-1);
    expect(compareUnicodeCodePoint("💊", "💉")).toBe(1);
    expect(compareUnicodeCodePoint("💊", "💊")).toBe(0);
  });
});
