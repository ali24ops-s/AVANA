/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { createDbClient } from "@avana/database/client";
import { sql, eq } from "drizzle-orm";
import {
  pocketDrugs,
  pocketDiseases,
  pocketTreatments,
  pocketEmergencies,
  pocketScientificAssertions,
  pocketAssertionVerifications,
  pocketClinicalReviewerCredentials,
  pocketEntityVersionRegistry,
  users,
} from "@avana/database/schema";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import {
  InMemoryAssertionConsumptionStore,
  type ClinicalAggregateType,
} from "../assertion-consumption-store.js";
import { DrizzleAssertionConsumptionStore } from "../drizzle-assertion-consumption-store.js";
import { AssertionConsumptionService } from "../assertion-consumption-service.js";
import {
  pocketAssertionConsumptionRoutes,
  formatEntityETag,
  matchesETag,
} from "../assertion-consumption-routes.js";
import type { ScientificAssertionRecord } from "../assertion-review-store.js";
import type { EntityVersionRecord } from "../assertion-publishing-store.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

describe("AVANA Pocket Phase 2C-4A: Clinical Consumption API", () => {
  const drugId = randomUUID();
  const diseaseId = randomUUID();
  const treatmentId = randomUUID();
  const emergencyId = randomUUID();

  let sharedAssertions: Map<string, ScientificAssertionRecord>;
  let sharedVersionRegistry: Map<string, EntityVersionRecord>;
  let consumptionStore: InMemoryAssertionConsumptionStore;
  let consumptionService: AssertionConsumptionService;

  function seedValidInMemoryVerification(
    store: InMemoryAssertionConsumptionStore,
    assertionId: string,
  ): void {
    const rev1 = randomUUID();
    const rev2 = randomUUID();
    const future = new Date("2030-01-01T00:00:00Z");
    store.registerReviewerCredential({
      userId: rev1,
      isActive: true,
      suspendedAt: null,
      licenseExpiresAt: future,
    });
    store.registerReviewerCredential({
      userId: rev2,
      isActive: true,
      suspendedAt: null,
      licenseExpiresAt: future,
    });
    store.registerVerification({
      id: randomUUID(),
      assertionId,
      reviewerUserId: rev1,
      verificationAction: "clinical_verified",
      verifiedAt: new Date(),
    });
    store.registerVerification({
      id: randomUUID(),
      assertionId,
      reviewerUserId: rev2,
      verificationAction: "clinical_verified",
      verifiedAt: new Date(),
    });
  }

  beforeEach(() => {
    sharedAssertions = new Map<string, ScientificAssertionRecord>();
    sharedVersionRegistry = new Map<string, EntityVersionRecord>();
    consumptionStore = new InMemoryAssertionConsumptionStore(sharedAssertions, sharedVersionRegistry);
    consumptionService = new AssertionConsumptionService({
      consumptionStore,
    });
  });

  describe("1. Strict Status Filtering & Lifecycle Isolation", () => {
    it("returns ONLY published assertions and strictly excludes draft, in_review, reviewed, verified, and superseded", async () => {
      const root1 = randomUUID();
      const root2 = randomUUID();
      const root3 = randomUUID();
      const root4 = randomUUID();
      const root5 = randomUUID();
      const root6 = randomUUID();

      const now = new Date();

      // 1. Published assertion (MUST be returned)
      const publishedAssertion: ScientificAssertionRecord = {
        id: randomUUID(),
        assertionRootId: root1,
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing_rule",
        assertionKey: "dosing.published.active",
        statementText: "Ceftriaxone 1g IV daily",
        jurisdiction: "IR",
        targetPopulation: "adults",
        clinicalSetting: "inpatient",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      };

      // 2. Draft assertion (MUST NOT be returned)
      const draftAssertion: ScientificAssertionRecord = {
        ...publishedAssertion,
        id: randomUUID(),
        assertionRootId: root2,
        assertionKey: "dosing.draft.test",
        status: "draft",
      };

      // 3. In Review assertion (MUST NOT be returned)
      const inReviewAssertion: ScientificAssertionRecord = {
        ...publishedAssertion,
        id: randomUUID(),
        assertionRootId: root3,
        assertionKey: "dosing.in_review.test",
        status: "in_review",
      };

      // 4. Reviewed assertion (MUST NOT be returned)
      const reviewedAssertion: ScientificAssertionRecord = {
        ...publishedAssertion,
        id: randomUUID(),
        assertionRootId: root4,
        assertionKey: "dosing.reviewed.test",
        status: "reviewed",
      };

      // 5. Verified assertion (MUST NOT be returned until published!)
      const verifiedAssertion: ScientificAssertionRecord = {
        ...publishedAssertion,
        id: randomUUID(),
        assertionRootId: root5,
        assertionKey: "dosing.verified.test",
        status: "verified",
      };

      // 6. Superseded assertion (MUST NOT be returned)
      const supersededAssertion: ScientificAssertionRecord = {
        ...publishedAssertion,
        id: randomUUID(),
        assertionRootId: root6,
        assertionKey: "dosing.superseded.test",
        status: "superseded",
        supersededAt: now,
      };

      // Populate in-memory map
      sharedAssertions.set(publishedAssertion.id, publishedAssertion);
      seedValidInMemoryVerification(consumptionStore, publishedAssertion.id);
      sharedAssertions.set(draftAssertion.id, draftAssertion);
      sharedAssertions.set(inReviewAssertion.id, inReviewAssertion);
      sharedAssertions.set(reviewedAssertion.id, reviewedAssertion);
      sharedAssertions.set(verifiedAssertion.id, verifiedAssertion);
      sharedAssertions.set(supersededAssertion.id, supersededAssertion);

      // Register version
      sharedVersionRegistry.set(`drug:${drugId}`, {
        aggregateType: "drug",
        aggregateId: drugId,
        currentVersion: 5,
        updatedAt: now,
      });

      const result = await consumptionService.getPublishedAssertionsByAggregate("drug", drugId);

      expect(result.aggregateType).toBe("drug");
      expect(result.aggregateId).toBe(drugId);
      expect(result.currentVersion).toBe(5);
      expect(result.assertions.length).toBe(1);
      expect(result.assertions[0].id).toBe(publishedAssertion.id);
      expect(result.assertions[0].assertionKey).toBe("dosing.published.active");
    });
  });

  describe("2. Safe Clinical Consumer Projection (Zero Data Leakage)", () => {
    it("strictly projects only consumer fields and omits reviewer critiques, verifier identities, and audit data", async () => {
      const now = new Date();
      const publishedAssertion: ScientificAssertionRecord = {
        id: randomUUID(),
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "contraindication",
        assertionKey: "contraindication.renal_failure",
        statementText: "Contraindicated in severe end-stage renal disease (CrCl < 15 mL/min)",
        jurisdiction: "global",
        targetPopulation: "renal_impaired",
        clinicalSetting: "all",
        status: "published",
        releaseId: null,
        validUntilDate: "2030-12-31",
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      };

      sharedAssertions.set(publishedAssertion.id, publishedAssertion);
      seedValidInMemoryVerification(consumptionStore, publishedAssertion.id);
      sharedVersionRegistry.set(`drug:${drugId}`, {
        aggregateType: "drug",
        aggregateId: drugId,
        currentVersion: 1,
        updatedAt: now,
      });

      const result = await consumptionService.getPublishedAssertionsByAggregate("drug", drugId);
      const item = result.assertions[0];

      // Verifying allowed clinical consumer fields
      expect(item.id).toBe(publishedAssertion.id);
      expect(item.assertionRootId).toBe(publishedAssertion.assertionRootId);
      expect(item.versionNumber).toBe(1);
      expect(item.statementText).toBe(publishedAssertion.statementText);
      expect(item.validUntilDate).toBe("2030-12-31");
      expect(item.publishedAt).toBeInstanceOf(Date);

      // Verifying strict non-existence of internal fields
      const itemAny = item as Record<string, unknown>;
      expect(itemAny.clinicalReviewNotes).toBeUndefined();
      expect(itemAny.reviewerUserId).toBeUndefined();
      expect(itemAny.auditLogs).toBeUndefined();
      expect(itemAny.status).toBeUndefined(); // status is implicit (all items are published)
    });
  });

  describe("3. Support for All 4 Clinical Aggregate Types", () => {
    it("accurately fetches published assertions for drug, disease, treatment, and emergency", async () => {
      const now = new Date();

      // Drug
      sharedAssertions.set("a-drug", {
        id: "a-drug",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing_rule",
        assertionKey: "drug.dosing",
        statementText: "Drug assertion",
        jurisdiction: "global",
        targetPopulation: "adults",
        clinicalSetting: "inpatient",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Disease
      sharedAssertions.set("a-disease", {
        id: "a-disease",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: null,
        diseaseId,
        treatmentId: null,
        emergencyId: null,
        assertionType: "diagnostic_criterion",
        assertionKey: "disease.criteria",
        statementText: "Disease diagnostic assertion",
        jurisdiction: "global",
        targetPopulation: "adults",
        clinicalSetting: "outpatient",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Treatment
      sharedAssertions.set("a-treatment", {
        id: "a-treatment",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: null,
        diseaseId: null,
        treatmentId,
        emergencyId: null,
        assertionType: "protocol_step",
        assertionKey: "treatment.protocol",
        statementText: "Treatment guideline step",
        jurisdiction: "global",
        targetPopulation: "pediatric",
        clinicalSetting: "icu",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Emergency
      sharedAssertions.set("a-emergency", {
        id: "a-emergency",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: null,
        diseaseId: null,
        treatmentId: null,
        emergencyId,
        assertionType: "resuscitation_rule",
        assertionKey: "emergency.acls",
        statementText: "Defibrillation at 200J biphasic",
        jurisdiction: "global",
        targetPopulation: "all",
        clinicalSetting: "emergency",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      seedValidInMemoryVerification(consumptionStore, "a-drug");
      seedValidInMemoryVerification(consumptionStore, "a-disease");
      seedValidInMemoryVerification(consumptionStore, "a-treatment");
      seedValidInMemoryVerification(consumptionStore, "a-emergency");

      const resDrug = await consumptionService.getPublishedAssertionsByAggregate("drug", drugId);
      expect(resDrug.assertions.length).toBe(1);
      expect(resDrug.assertions[0].id).toBe("a-drug");

      const resDisease = await consumptionService.getPublishedAssertionsByAggregate("disease", diseaseId);
      expect(resDisease.assertions.length).toBe(1);
      expect(resDisease.assertions[0].id).toBe("a-disease");

      const resTreatment = await consumptionService.getPublishedAssertionsByAggregate("treatment", treatmentId);
      expect(resTreatment.assertions.length).toBe(1);
      expect(resTreatment.assertions[0].id).toBe("a-treatment");

      const resEmergency = await consumptionService.getPublishedAssertionsByAggregate("emergency", emergencyId);
      expect(resEmergency.assertions.length).toBe(1);
      expect(resEmergency.assertions[0].id).toBe("a-emergency");
    });

    it("returns version 0 and empty assertions list when aggregate exists with no published assertions", async () => {
      const emptyDrugId = randomUUID();
      consumptionStore.registerAggregate("drug", emptyDrugId);
      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", emptyDrugId);
      expect(res.currentVersion).toBe(0);
      expect(res.assertions).toEqual([]);
    });

    it("throws 404 DomainError when aggregate entity does not exist", async () => {
      const nonExistentDrugId = randomUUID();
      await expect(
        consumptionService.getPublishedAssertionsByAggregate("drug", nonExistentDrugId),
      ).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("getCurrentVersion throws 404 DomainError when aggregate entity does not exist", async () => {
      const nonExistentDrugId = randomUUID();
      await expect(
        consumptionService.getCurrentVersion("drug", nonExistentDrugId),
      ).rejects.toMatchObject({
        code: "not_found",
      });
    });
  });

  describe("4. Input Validation & Security", () => {
    it("rejects invalid aggregate type", async () => {
      await expect(
        consumptionService.getPublishedAssertionsByAggregate("invalid_type" as unknown as ClinicalAggregateType, drugId),
      ).rejects.toThrow("Invalid clinical aggregate type");
    });

    it("rejects invalid aggregate identifier format with 400 bad_request", async () => {
      await expect(
        consumptionService.getPublishedAssertionsByAggregate("drug", "invalid id with spaces!"),
      ).rejects.toThrow("Invalid aggregate identifier format");
    });

    it("returns not_found 404 when valid slug does not exist", async () => {
      await expect(
        consumptionService.getPublishedAssertionsByAggregate("drug", "non-existent-drug-slug"),
      ).rejects.toThrow("was not found");
    });
  });

  describe("5. Fastify HTTP Routes Integration (ETag & 304 Validation)", () => {
    let app: FastifyInstance;
    let routeAssertions: Map<string, ScientificAssertionRecord>;
    let routeRegistry: Map<string, EntityVersionRecord>;
    let routeStore: InMemoryAssertionConsumptionStore;
    let routeService: AssertionConsumptionService;

    const studentUserId = randomUUID();

    beforeAll(async () => {
      app = fastify({ logger: false });
      await app.register(errorHandlerPlugin);

      routeAssertions = new Map<string, ScientificAssertionRecord>();
      routeRegistry = new Map<string, EntityVersionRecord>();
      routeStore = new InMemoryAssertionConsumptionStore(routeAssertions, routeRegistry);
      routeService = new AssertionConsumptionService({
        consumptionStore: routeStore,
      });

      const mockSessionService = {
        validateSessionDetails: async (_token: string) => ({
          valid: true,
          revoked: false,
          user: { userId: studentUserId, role: "student", globalRole: null },
        }),
        getConfig: () => ({}),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

      const mockUserStore = {
        findById: async (id: string) => ({ id, email: "student@avana.local", role: "student", globalRole: null }),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await app.register(pocketAssertionConsumptionRoutes, {
        assertionConsumptionService: routeService,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });

      await app.ready();
    });

    afterAll(async () => {
      await app?.close();
    });

    it("GET /v1/pocket/aggregates/:type/:id/assertions returns 200 with data and ETag for authenticated student", async () => {
      const now = new Date();
      routeAssertions.set("asrt-student-1", {
        id: "asrt-student-1",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing_rule",
        assertionKey: "dosing.http.cardiology",
        statementText: "Aspirin 81mg daily",
        jurisdiction: "global",
        targetPopulation: "adults",
        clinicalSetting: "cardiology",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });
      seedValidInMemoryVerification(routeStore, "asrt-student-1");

      routeRegistry.set(`drug:${drugId}`, {
        aggregateType: "drug",
        aggregateId: drugId,
        currentVersion: 1,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.assertions.length).toBe(1);
      expect(json.data.currentVersion).toBe(1);

      const expectedEtag = formatEntityETag("drug", drugId, 1, ["asrt-student-1"]);
      expect(res.headers.etag).toBe(expectedEtag);
      expect(res.headers["x-entity-version"]).toBe("1");
    });

    it("GET /v1/pocket/aggregates/:type/:id/assertions returns 304 Not Modified when If-None-Match matches ETag", async () => {
      const expectedEtag = formatEntityETag("drug", drugId, 1, ["asrt-student-1"]);

      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": expectedEtag,
        },
      });

      expect(res.statusCode).toBe(304);
      expect(res.payload).toBe("");
      expect(res.headers.etag).toBe(expectedEtag);
    });

    it("returns 200 with new data and new ETag when entity version changes", async () => {
      // Simulate publication of a new version bumping current_version to 2
      routeRegistry.set(`drug:${drugId}`, {
        aggregateType: "drug",
        aggregateId: drugId,
        currentVersion: 2,
        updatedAt: new Date(),
      });

      const oldEtag = formatEntityETag("drug", drugId, 1, ["asrt-student-1"]);

      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": oldEtag, // old cached ETag!
        },
      });

      // Must return 200 because cache is now stale
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.currentVersion).toBe(2);

      const newEtag = formatEntityETag("drug", drugId, 2, ["asrt-student-1"]);
      expect(res.headers.etag).toBe(newEtag);
      expect(res.headers["x-entity-version"]).toBe("2");
    });

    it("GET /v1/pocket/aggregates/:type/:id/version provides lightweight version probing with ETag", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/version`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.aggregateType).toBe("drug");
      expect(json.data.aggregateId).toBe(drugId);
      expect(json.data.currentVersion).toBe(2);
      expect(res.headers.etag).toBe(formatEntityETag("drug", drugId, 2));

      // With If-None-Match
      const res304 = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/version`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": formatEntityETag("drug", drugId, 2),
        },
      });

      expect(res304.statusCode).toBe(304);
    });

    it("returns 400 for invalid aggregate type", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/unknown_pillar/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid aggregate identifier format", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/pocket/aggregates/drug/invalid%20id%20with%20spaces!/assertions",
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for non-existent aggregate slug", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/pocket/aggregates/drug/non-existent-slug/assertions",
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 Not Found for nonexistent aggregate on assertions endpoint", async () => {
      const nonExistentId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${nonExistentId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.payload);
      expect(json.error.code).toBe("not_found");
    });

    it("returns 404 Not Found for nonexistent aggregate on version endpoint", async () => {
      const nonExistentId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${nonExistentId}/version`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.payload);
      expect(json.error.code).toBe("not_found");
    });

    it("returns 304 Not Modified when If-None-Match: * is provided for an existing aggregate", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": "*",
        },
      });

      expect(res.statusCode).toBe(304);
      expect(res.payload).toBe("");
      expect(res.headers.etag).toBe(formatEntityETag("drug", drugId, 2, ["asrt-student-1"]));
    });

    it("returns 404 Not Found when If-None-Match: * is provided for a NONEXISTENT aggregate (never 304)", async () => {
      const nonExistentId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${nonExistentId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": "*",
        },
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.payload);
      expect(json.error.code).toBe("not_found");
    });

    it("returns 304 when If-None-Match contains comma-separated values including matching ETag", async () => {
      const currentEtag = formatEntityETag("drug", drugId, 2, ["asrt-student-1"]);
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": `W/"stale-etag-1", ${currentEtag}, "other-etag"`,
        },
      });

      expect(res.statusCode).toBe(304);
    });

    it("returns 200 (not 304) when If-None-Match: \"*\" (quoted entity tag) is provided for an existing aggregate", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": '"*"', // Quoted entity tag is not wildcard
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
    });

    it("returns 200 with currentVersion 0 and empty assertions list for registered empty aggregate", async () => {
      const emptyRouteDrugId = randomUUID();
      routeStore.registerAggregate("drug", emptyRouteDrugId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${emptyRouteDrugId}/assertions`,
        headers: {
          authorization: "Bearer token-student",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.currentVersion).toBe(0);
      expect(json.data.assertions).toEqual([]);
      expect(res.headers.etag).toBe(formatEntityETag("drug", emptyRouteDrugId, 0, []));
    });

    it("GET version probe returns 304 with If-None-Match: * for existing aggregate", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/version`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": "*",
        },
      });

      expect(res.statusCode).toBe(304);
    });

    it("GET version probe returns 404 with If-None-Match: * for nonexistent aggregate", async () => {
      const nonExistentId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${nonExistentId}/version`,
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": "*",
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("6. Real PostgreSQL Database Integration", () => {
    let client: ReturnType<typeof createDbClient> | null = null;
    let drizzleStore: DrizzleAssertionConsumptionStore;
    let pgService: AssertionConsumptionService;
    let isConnected = false;

    const pgDrugId = randomUUID();
    const pgDiseaseId = randomUUID();
    const pgTreatmentId = randomUUID();
    const pgEmergencyId = randomUUID();
    const pgRev1Id = randomUUID();
    const pgRev2Id = randomUUID();
    const pgPublishedAssertionId = randomUUID();

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;

      drizzleStore = new DrizzleAssertionConsumptionStore(client.db);
      pgService = new AssertionConsumptionService({
        consumptionStore: drizzleStore,
      });

      const now = new Date();

      // Seed 4 published pillar entities matching actual Drizzle schema
      await client.db.insert(pocketDrugs).values({
        id: pgDrugId,
        slug: `pg-consume-drug-${Date.now()}`,
        genericNameEn: "Metoprolol",
        genericNameFa: "متوپرولول",
        drugClass: "Beta Blocker",
        mechanismOfAction: "Selective beta-1 receptor antagonist",
        status: "published",
        publishedAt: now,
      });

      await client.db.insert(pocketDiseases).values({
        id: pgDiseaseId,
        slug: `pg-consume-disease-${Date.now()}`,
        icd10Code: "I10",
        titleEn: "Essential Hypertension",
        titleFa: "فشار خون اولیه",
        definition: "Chronic blood pressure elevation",
        status: "published",
        publishedAt: now,
      });

      await client.db.insert(pocketTreatments).values({
        id: pgTreatmentId,
        slug: `pg-consume-treatment-${Date.now()}`,
        titleEn: "Hypertensive Crisis Protocol",
        titleFa: "پروتکل بحران فشار خون",
        treatmentType: "protocol",
        pharmacologicalStrategy: "Immediate IV antihypertensive titration",
        efficacyMonitoring: "Continuous arterial blood pressure monitoring",
        safetyMonitoring: "Monitor for hypotension and bradycardia",
        status: "published",
        publishedAt: now,
      });

      await client.db.insert(pocketEmergencies).values({
        id: pgEmergencyId,
        slug: `pg-consume-emergency-${Date.now()}`,
        titleEn: "Hypertensive Encephalopathy",
        titleFa: "انسفالوپاتی ناشی از فشار خون",
        conditionType: "hypertensive_emergency",
        immediateTriageGuidance: "Immediate IV labetalol or nicardipine infusion",
        referralAndEscalationCriteria: "Immediate ICU admission and neurology consult",
        status: "published",
        publishedAt: now,
      });

      // Seed entity version registry
      await client.db.insert(pocketEntityVersionRegistry).values({
        aggregateType: "drug",
        aggregateId: pgDrugId,
        currentVersion: 3,
      });

      // Seed 2 valid reviewers & credentials
      await client.db.insert(users).values([
        {
          id: pgRev1Id,
          email: `pg-cons-r1-${pgRev1Id.slice(0, 8)}@avana.local`,
          name: "PG Cons Rev1",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "user",
        },
        {
          id: pgRev2Id,
          email: `pg-cons-r2-${pgRev2Id.slice(0, 8)}@avana.local`,
          name: "PG Cons Rev2",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "user",
        },
      ]);
      await client.db.insert(pocketClinicalReviewerCredentials).values([
        {
          userId: pgRev1Id,
          medicalLicenseNumber: `LIC-CONS1-${pgRev1Id.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Pharmacy",
          isActive: true,
          suspendedAt: null,
          grantedBy: pgRev1Id,
          licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
        },
        {
          userId: pgRev2Id,
          medicalLicenseNumber: `LIC-CONS2-${pgRev2Id.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Medicine",
          isActive: true,
          suspendedAt: null,
          grantedBy: pgRev2Id,
          licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
        },
      ]);

      // Seed published assertion
      await client.db.insert(pocketScientificAssertions).values({
        id: pgPublishedAssertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: pgDrugId,
        assertionType: "dosing_rule",
        assertionKey: "dosing.metoprolol.oral",
        statementText: "Metoprolol succinate 50mg PO once daily",
        status: "published",
      });

      await client.db.insert(pocketAssertionVerifications).values([
        {
          assertionId: pgPublishedAssertionId,
          reviewerUserId: pgRev1Id,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "PG R1 verified",
        },
        {
          assertionId: pgPublishedAssertionId,
          reviewerUserId: pgRev2Id,
          verificationAction: "clinical_verified",
          clinicalReviewNotes: "PG R2 verified",
        },
      ]);

      // Seed superseded assertion (MUST be excluded)
      await client.db.insert(pocketScientificAssertions).values({
        id: randomUUID(),
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: pgDrugId,
        assertionType: "dosing_rule",
        assertionKey: "dosing.metoprolol.superseded",
        statementText: "Old dosing statement",
        status: "superseded",
        supersededAt: new Date(),
      });

      // Seed draft assertion (MUST be excluded)
      await client.db.insert(pocketScientificAssertions).values({
        id: randomUUID(),
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: pgDrugId,
        assertionType: "dosing_rule",
        assertionKey: "dosing.metoprolol.draft",
        statementText: "Draft statement",
        status: "draft",
      });
    });

    afterAll(async () => {
      if (isConnected && client) {
        try {
          await client.db
            .delete(pocketAssertionVerifications)
            .where(eq(pocketAssertionVerifications.assertionId, pgPublishedAssertionId));
          await client.db
            .delete(pocketScientificAssertions)
            .where(eq(pocketScientificAssertions.drugId, pgDrugId));
          await client.db
            .delete(pocketEntityVersionRegistry)
            .where(eq(pocketEntityVersionRegistry.aggregateId, pgDrugId));
          await client.db.delete(pocketDrugs).where(eq(pocketDrugs.id, pgDrugId));
          await client.db.delete(pocketDiseases).where(eq(pocketDiseases.id, pgDiseaseId));
          await client.db.delete(pocketTreatments).where(eq(pocketTreatments.id, pgTreatmentId));
          await client.db.delete(pocketEmergencies).where(eq(pocketEmergencies.id, pgEmergencyId));
          await client.db
            .delete(pocketClinicalReviewerCredentials)
            .where(sql`${pocketClinicalReviewerCredentials.userId} IN (${pgRev1Id}::uuid, ${pgRev2Id}::uuid)`);
          await client.db
            .delete(users)
            .where(sql`${users.id} IN (${pgRev1Id}::uuid, ${pgRev2Id}::uuid)`);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("executes published assertion consumption query in real PostgreSQL", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const result = await pgService.getPublishedAssertionsByAggregate("drug", pgDrugId);
      expect(result.currentVersion).toBe(3);
      expect(result.assertions.length).toBe(1);
      expect(result.assertions[0].assertionKey).toBe("dosing.metoprolol.oral");
      expect(result.assertions[0].statementText).toBe("Metoprolol succinate 50mg PO once daily");
    });

    it("returns 404 for nonexistent aggregate in real PostgreSQL", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const nonExistentDrugId = randomUUID();
      await expect(
        pgService.getPublishedAssertionsByAggregate("drug", nonExistentDrugId),
      ).rejects.toMatchObject({
        code: "not_found",
      });
    });

    it("returns 200 with version 0 and empty assertions list for real PostgreSQL aggregate without assertions", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      // pgDiseaseId was seeded, but has NO assertions and NO entity version registry entry
      const result = await pgService.getPublishedAssertionsByAggregate("disease", pgDiseaseId);
      expect(result.currentVersion).toBe(0);
      expect(result.assertions).toEqual([]);
    });
  });

  describe("7. Snapshot Consistency, Column Projection & RFC 7232 Wildcard", () => {
    describe("RFC 7232 If-None-Match ETag Evaluation", () => {
      const etag = `W/"drug-123-v5"`;

      it("evaluates wildcard * correctly", () => {
        expect(matchesETag("*", etag)).toBe(true);
        expect(matchesETag(" * ", etag)).toBe(true);
      });

      it("treats quoted entity tag \"*\" as a regular entity tag, NOT a wildcard", () => {
        // Quoted "*" must NOT match an AVANA ETag
        expect(matchesETag('"*"', etag)).toBe(false);
        expect(matchesETag('W/"*"', etag)).toBe(false);

        // Quoted "*" must only match if the expected ETag is itself "*" or W/"*"
        expect(matchesETag('"*"', '"*"')).toBe(true);
        expect(matchesETag('"*"', 'W/"*"')).toBe(true);
        expect(matchesETag('W/"*"', '"*"')).toBe(true);
      });

      it("evaluates exact matching ETags", () => {
        expect(matchesETag(etag, etag)).toBe(true);
        expect(matchesETag('"drug-123-v5"', etag)).toBe(true);
        expect(matchesETag('W/"drug-123-v5"', etag)).toBe(true);
      });

      it("evaluates comma-separated ETag lists", () => {
        expect(matchesETag('W/"other-etag", W/"drug-123-v5"', etag)).toBe(true);
        expect(matchesETag('W/"other-etag", *', etag)).toBe(true);
        expect(matchesETag('W/"other-etag", "stale-etag"', etag)).toBe(false);
      });

      it("returns false for non-matching or empty values", () => {
        expect(matchesETag(undefined, etag)).toBe(false);
        expect(matchesETag("", etag)).toBe(false);
        expect(matchesETag('W/"drug-123-v4"', etag)).toBe(false);
      });
    });

    describe("Explicit SQL Column Projection & Transaction Configuration", () => {
      it("executes within REPEATABLE READ READ ONLY transaction and projects only consumer columns", async () => {
        const testDrugId = randomUUID();
        let transactionOptions: unknown = null;
        const capturedSelectedFields: unknown[] = [];

        // Mock database client that simulates Drizzle's query builder & transaction
        const mockRunner = {
          select: (fieldsObj: unknown) => {
            capturedSelectedFields.push(fieldsObj);
            return {
              from: () => ({
                where: () => ({
                  limit: () => Promise.resolve([{ id: testDrugId }]),
                  orderBy: () => Promise.resolve([
                    {
                      id: randomUUID(),
                      assertionRootId: randomUUID(),
                      versionNumber: 1,
                      previousVersionId: null,
                      assertionType: "dosing_rule",
                      assertionKey: "dosing.safe",
                      statementText: "Safe statement",
                      jurisdiction: "global",
                      targetPopulation: "adults",
                      clinicalSetting: "inpatient",
                      validUntilDate: null,
                      updatedAt: new Date(),
                    },
                  ]),
                }),
              }),
            };
          },
        };

        const mockDb = {
          ...mockRunner,
          transaction: async (cb: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
            transactionOptions = opts;
            return await cb(mockRunner);
          },
        } as unknown as import("@avana/database/client").DbClient;

        const store = new DrizzleAssertionConsumptionStore(mockDb);
        const result = await store.findPublishedByAggregate("drug", testDrugId);

        expect(result).not.toBeNull();
        expect(transactionOptions).toEqual({
          isolationLevel: "repeatable read",
          accessMode: "read only",
        });

        // Verify the 3 queries executed by findPublishedByAggregate:
        // 1. aggregateExists: { id: ... }
        // 2. readCurrentVersion: { currentVersion: ... }
        // 3. published assertions: consumer-safe columns projection
        expect(capturedSelectedFields.length).toBe(3);

        const assertionFields = capturedSelectedFields[2] as Record<string, unknown>;
        const fieldKeys = Object.keys(assertionFields);

        // Required consumer-safe columns
        expect(fieldKeys).toContain("id");
        expect(fieldKeys).toContain("assertionRootId");
        expect(fieldKeys).toContain("versionNumber");
        expect(fieldKeys).toContain("previousVersionId");
        expect(fieldKeys).toContain("assertionType");
        expect(fieldKeys).toContain("assertionKey");
        expect(fieldKeys).toContain("statementText");
        expect(fieldKeys).toContain("jurisdiction");
        expect(fieldKeys).toContain("targetPopulation");
        expect(fieldKeys).toContain("clinicalSetting");
        expect(fieldKeys).toContain("validUntilDate");
        expect(fieldKeys).toContain("updatedAt");

        // Forbidden internal/governance columns MUST NOT be selected
        expect(fieldKeys).not.toContain("releaseId");
        expect(fieldKeys).not.toContain("status");
        expect(fieldKeys).not.toContain("supersededAt");
        expect(fieldKeys).not.toContain("createdAt");
        expect(fieldKeys).not.toContain("drugId");
        expect(fieldKeys).not.toContain("diseaseId");
        expect(fieldKeys).not.toContain("treatmentId");
        expect(fieldKeys).not.toContain("emergencyId");
      });
    });
  });

  describe("8. Single Published Assertion Read API (Phase UI-3)", () => {
    it("returns 200 with consumer-safe PublishedAssertionItem for published assertion", async () => {
      const assertionId = randomUUID();
      sharedAssertions.set(assertionId, {
        id: assertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "adult_dose",
        statementText: "Adult dose: 500mg PO TID.",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "outpatient",
        status: "published",
        releaseId: "rel-123",
        validUntilDate: null,
        supersededAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      seedValidInMemoryVerification(consumptionStore, assertionId);

      const result = await consumptionService.getPublishedAssertionById(assertionId);
      expect(result.id).toBe(assertionId);
      expect(result.statementText).toBe("Adult dose: 500mg PO TID.");
      expect(result.aggregateType).toBe("drug");
      expect(result.aggregateId).toBe(drugId);
      // Privacy verification: internal fields must NOT leak
      const resultObj = result as Record<string, unknown>;
      expect(resultObj.releaseId).toBeUndefined();
      expect(resultObj.actorUserId).toBeUndefined();
      expect(resultObj.clinicalNotes).toBeUndefined();
    });

    it("throws 404 for draft, in_review, reviewed, verified, or superseded assertions", async () => {
      const draftId = randomUUID();
      sharedAssertions.set(draftId, {
        id: draftId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "draft_dose",
        statementText: "Draft statement",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "all",
        status: "draft",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(consumptionService.getPublishedAssertionById(draftId)).rejects.toThrow(
        /not found/i,
      );

      const supersededId = randomUUID();
      sharedAssertions.set(supersededId, {
        id: supersededId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "superseded_dose",
        statementText: "Old dose",
        jurisdiction: "global",
        targetPopulation: "general_adult",
        clinicalSetting: "all",
        status: "published",
        releaseId: "rel-1",
        validUntilDate: null,
        supersededAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(consumptionService.getPublishedAssertionById(supersededId)).rejects.toThrow(
        /not found/i,
      );
    });

    it("throws 404 for nonexistent assertion ID", async () => {
      await expect(consumptionService.getPublishedAssertionById(randomUUID())).rejects.toThrow(
        /not found/i,
      );
    });
  });

  describe("9. Aggregate Metadata Read API (Phase UI-3)", () => {
    it("returns unified metadata for registered drug aggregate", async () => {
      consumptionStore.registerMetadata({
        id: drugId,
        type: "drug",
        slug: "cephalexin",
        nameEn: "Cephalexin",
        nameFa: "سفالکسین",
        classification: "First-generation cephalosporin",
        summary: "Inhibits bacterial cell wall synthesis",
        versionNumber: 3,
        publishedAt: "2026-01-15T00:00:00.000Z",
      });

      const meta = await consumptionService.getAggregateMetadata("drug", drugId);
      expect(meta.id).toBe(drugId);
      expect(meta.type).toBe("drug");
      expect(meta.nameEn).toBe("Cephalexin");
      expect(meta.nameFa).toBe("سفالکسین");
      expect(meta.classification).toBe("First-generation cephalosporin");
      expect(meta.versionNumber).toBe(3);
    });

    it("throws 404 for nonexistent aggregate metadata", async () => {
      await expect(
        consumptionService.getAggregateMetadata("drug", randomUUID()),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe("10. Dual UUID and Canonical Slug Resolution (Phase 6.1)", () => {
    let testApp: FastifyInstance;
    const canonicalDrugId = randomUUID();
    const canonicalDiseaseId = randomUUID();
    const canonicalTreatmentId = randomUUID();
    const canonicalEmergencyId = randomUUID();
    const draftDrugId = randomUUID();

    beforeAll(async () => {
      const delegateStore: AssertionConsumptionStore = {
        resolveAggregateIdentity: (...args) => consumptionStore.resolveAggregateIdentity(...args),
        findPublishedByAggregate: (...args) => consumptionStore.findPublishedByAggregate(...args),
        findPublishedAssertionById: (...args) => consumptionStore.findPublishedAssertionById(...args),
        getAggregateMetadata: (...args) => consumptionStore.getAggregateMetadata(...args),
        getCurrentVersion: (...args) => consumptionStore.getCurrentVersion(...args),
        aggregateExists: (...args) => consumptionStore.aggregateExists(...args),
      };
      const delegateService = new AssertionConsumptionService({ consumptionStore: delegateStore });

      testApp = fastify({ logger: false });
      await testApp.register(errorHandlerPlugin);

      const mockSessionService = {
        validateSessionDetails: async (_token: string) => ({
          valid: true,
          revoked: false,
          user: { userId: randomUUID(), role: "student", globalRole: null },
        }),
        getConfig: () => ({}),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

      const mockUserStore = {
        findById: async (id: string) => ({ id, email: "student@avana.local", role: "student", globalRole: null }),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await testApp.register(pocketAssertionConsumptionRoutes, {
        assertionConsumptionService: delegateService,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });

      await testApp.ready();
    });

    afterAll(async () => {
      await testApp?.close();
    });

    beforeEach(() => {
      const now = new Date();

      // 1. Register canonical published entities with metadata
      consumptionStore.registerMetadata({
        id: canonicalDrugId,
        type: "drug",
        slug: "amoxicillin",
        nameEn: "Amoxicillin",
        nameFa: "آموکسی‌سیلین",
        classification: "Penicillin Antibiotic",
        summary: "Inhibits bacterial cell wall synthesis",
        versionNumber: 2,
        publishedAt: "2026-02-01T00:00:00.000Z",
      });

      consumptionStore.registerMetadata({
        id: canonicalDiseaseId,
        type: "disease",
        slug: "type-2-diabetes",
        nameEn: "Type 2 Diabetes Mellitus",
        nameFa: "دیابت نوع ۲",
        classification: "E11",
        summary: "Metabolic disorder characterized by hyperglycemia",
        versionNumber: 1,
        publishedAt: "2026-02-01T00:00:00.000Z",
      });

      consumptionStore.registerMetadata({
        id: canonicalTreatmentId,
        type: "treatment",
        slug: "beta-blocker-titration",
        nameEn: "Beta-Blocker Titration Protocol",
        nameFa: "پروتکل تیبراسیون بتابلاکر",
        classification: "Pharmacotherapy",
        summary: "Stepwise dose titration for heart failure",
        versionNumber: 1,
        publishedAt: "2026-02-01T00:00:00.000Z",
      });

      consumptionStore.registerMetadata({
        id: canonicalEmergencyId,
        type: "emergency",
        slug: "anaphylaxis",
        nameEn: "Anaphylaxis Management",
        nameFa: "مدیریت شوک آنافیلاکسی",
        classification: "Resuscitation / Immediate",
        summary: "Emergency intramuscular epinephrine administration",
        versionNumber: 1,
        publishedAt: "2026-02-01T00:00:00.000Z",
      });

      // 2. Register unpublished draft entity
      consumptionStore.registerDraftAggregate("drug", draftDrugId, {
        id: draftDrugId,
        type: "drug",
        slug: "draft-experimental-drug",
        nameEn: "Draft Drug",
        nameFa: "داروی پیش‌نویس",
        classification: "Experimental",
        summary: "Not yet reviewed",
        versionNumber: 0,
        publishedAt: null,
      });

      // 3. Register assertions linked to canonical UUIDs
      const amoxAssertion: ScientificAssertionRecord = {
        id: "asst-amox-1",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: canonicalDrugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing_rule",
        assertionKey: "amox.dosing.adult",
        statementText: "500 mg every 8 hours or 875 mg every 12 hours orally.",
        jurisdiction: "FDA / IR",
        targetPopulation: "adults",
        clinicalSetting: "outpatient",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      };
      sharedAssertions.set("asst-amox-1", amoxAssertion);
      seedValidInMemoryVerification(consumptionStore, "asst-amox-1");

      sharedAssertions.set("asst-t2d-1", {
        id: "asst-t2d-1",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: null,
        diseaseId: canonicalDiseaseId,
        treatmentId: null,
        emergencyId: null,
        assertionType: "diagnostic_criterion",
        assertionKey: "t2d.diagnosis.a1c",
        statementText: "HbA1c >= 6.5% confirms diagnosis.",
        jurisdiction: "ADA",
        targetPopulation: "adults",
        clinicalSetting: "outpatient",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      sharedAssertions.set("asst-bb-1", {
        id: "asst-bb-1",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: null,
        diseaseId: null,
        treatmentId: canonicalTreatmentId,
        emergencyId: null,
        assertionType: "treatment_protocol",
        assertionKey: "bb.titration.step1",
        statementText: "Initiate bisoprolol at 1.25 mg daily.",
        jurisdiction: "ESC",
        targetPopulation: "HFrEF patients",
        clinicalSetting: "outpatient",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      sharedAssertions.set("asst-ana-1", {
        id: "asst-ana-1",
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: null,
        diseaseId: null,
        treatmentId: null,
        emergencyId: canonicalEmergencyId,
        assertionType: "emergency_guideline",
        assertionKey: "anaphylaxis.epinephrine",
        statementText: "Inject epinephrine 0.3 mg IM immediately into anterolateral thigh.",
        jurisdiction: "WAO",
        targetPopulation: "adults",
        clinicalSetting: "emergency",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      seedValidInMemoryVerification(consumptionStore, "asst-t2d-1");
      seedValidInMemoryVerification(consumptionStore, "asst-bb-1");
      seedValidInMemoryVerification(consumptionStore, "asst-ana-1");
    });

    it("resolves aggregate identity directly via store for UUID and slug", async () => {
      const byUuid = await consumptionStore.resolveAggregateIdentity("drug", canonicalDrugId);
      expect(byUuid).toEqual({ canonicalId: canonicalDrugId, slug: "amoxicillin" });

      const bySlug = await consumptionStore.resolveAggregateIdentity("drug", "amoxicillin");
      expect(bySlug).toEqual({ canonicalId: canonicalDrugId, slug: "amoxicillin" });

      const nonExistent = await consumptionStore.resolveAggregateIdentity("drug", "non-existent");
      expect(nonExistent).toBeNull();

      const draft = await consumptionStore.resolveAggregateIdentity("drug", "draft-experimental-drug");
      expect(draft).toBeNull();
    });

    it("fetches assertions via UUID and slug, returning identical canonicalId and assertions", async () => {
      const resUuid = await consumptionService.getPublishedAssertionsByAggregate("drug", canonicalDrugId);
      const resSlug = await consumptionService.getPublishedAssertionsByAggregate("drug", "amoxicillin");

      expect(resUuid.aggregateId).toBe(canonicalDrugId);
      expect(resSlug.aggregateId).toBe(canonicalDrugId);
      expect(resUuid.assertions.length).toBe(1);
      expect(resSlug.assertions.length).toBe(1);
      expect(resSlug.assertions[0].id).toBe(resUuid.assertions[0].id);
      expect(resSlug.assertions[0].statementText).toBe("500 mg every 8 hours or 875 mg every 12 hours orally.");
    });

    it("fetches metadata via slug for all 4 pillars", async () => {
      const drugMeta = await consumptionService.getAggregateMetadata("drug", "amoxicillin");
      expect(drugMeta.id).toBe(canonicalDrugId);
      expect(drugMeta.nameEn).toBe("Amoxicillin");

      const diseaseMeta = await consumptionService.getAggregateMetadata("disease", "type-2-diabetes");
      expect(diseaseMeta.id).toBe(canonicalDiseaseId);
      expect(diseaseMeta.nameEn).toBe("Type 2 Diabetes Mellitus");

      const treatmentMeta = await consumptionService.getAggregateMetadata("treatment", "beta-blocker-titration");
      expect(treatmentMeta.id).toBe(canonicalTreatmentId);
      expect(treatmentMeta.nameEn).toBe("Beta-Blocker Titration Protocol");

      const emergencyMeta = await consumptionService.getAggregateMetadata("emergency", "anaphylaxis");
      expect(emergencyMeta.id).toBe(canonicalEmergencyId);
      expect(emergencyMeta.nameEn).toBe("Anaphylaxis Management");
    });

    it("fetches assertions via slug for disease, treatment, and emergency", async () => {
      const disRes = await consumptionService.getPublishedAssertionsByAggregate("disease", "type-2-diabetes");
      expect(disRes.aggregateId).toBe(canonicalDiseaseId);
      expect(disRes.assertions.length).toBe(1);

      const treatRes = await consumptionService.getPublishedAssertionsByAggregate("treatment", "beta-blocker-titration");
      expect(treatRes.aggregateId).toBe(canonicalTreatmentId);
      expect(treatRes.assertions.length).toBe(1);

      const emRes = await consumptionService.getPublishedAssertionsByAggregate("emergency", "anaphylaxis");
      expect(emRes.aggregateId).toBe(canonicalEmergencyId);
      expect(emRes.assertions.length).toBe(1);
    });

    it("enforces cross-pillar isolation (disease slug under drug returns 404)", async () => {
      await expect(
        consumptionService.getPublishedAssertionsByAggregate("drug", "type-2-diabetes"),
      ).rejects.toThrow(/not found/i);

      await expect(
        consumptionService.getAggregateMetadata("drug", "type-2-diabetes"),
      ).rejects.toThrow(/not found/i);
    });

    it("enforces unpublished isolation for draft aggregate slug", async () => {
      await expect(
        consumptionService.getPublishedAssertionsByAggregate("drug", "draft-experimental-drug"),
      ).rejects.toThrow(/not found/i);

      await expect(
        consumptionService.getAggregateMetadata("drug", "draft-experimental-drug"),
      ).rejects.toThrow(/not found/i);
    });

    it("guarantees identical ETag and 304 response on HTTP endpoints between UUID and Slug", async () => {
      const uuidRes = await testApp.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${canonicalDrugId}/assertions`,
        headers: { authorization: "Bearer token-student" },
      });
      expect(uuidRes.statusCode).toBe(200);
      const uuidEtag = uuidRes.headers["etag"];
      expect(uuidEtag).toBeDefined();

      const slugRes = await testApp.inject({
        method: "GET",
        url: "/v1/pocket/aggregates/drug/amoxicillin/assertions",
        headers: { authorization: "Bearer token-student" },
      });
      expect(slugRes.statusCode).toBe(200);
      const slugEtag = slugRes.headers["etag"];

      // Both must match canonical UUID ETag
      expect(slugEtag).toBe(uuidEtag);

      // Sending ETag to slug endpoint returns 304 Not Modified
      const conditionalRes = await testApp.inject({
        method: "GET",
        url: "/v1/pocket/aggregates/drug/amoxicillin/assertions",
        headers: {
          authorization: "Bearer token-student",
          "if-none-match": slugEtag,
        },
      });
      expect(conditionalRes.statusCode).toBe(304);
    });
  });

  describe("11. P0 Clinical Verification Badge Correction & Multi-Reviewer Domain Logic", () => {
    let testApp: FastifyInstance;
    const testDrugId = randomUUID();

    beforeAll(async () => {
      const delegateStore: AssertionConsumptionStore = {
        resolveAggregateIdentity: (...args) => consumptionStore.resolveAggregateIdentity(...args),
        findPublishedByAggregate: (...args) => consumptionStore.findPublishedByAggregate(...args),
        findPublishedAssertionById: (...args) => consumptionStore.findPublishedAssertionById(...args),
        getAggregateMetadata: (...args) => consumptionStore.getAggregateMetadata(...args),
        getCurrentVersion: (...args) => consumptionStore.getCurrentVersion(...args),
        aggregateExists: (...args) => consumptionStore.aggregateExists(...args),
      };
      const delegateService = new AssertionConsumptionService({ consumptionStore: delegateStore });

      testApp = fastify({ logger: false });
      await testApp.register(errorHandlerPlugin);

      const mockSessionService = {
        validateSessionDetails: async (_token: string) => ({
          valid: true,
          revoked: false,
          user: { userId: randomUUID(), role: "student", globalRole: null },
        }),
        getConfig: () => ({}),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

      const mockUserStore = {
        findById: async (id: string) => ({ id, email: "student@avana.local", role: "student", globalRole: null }),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await testApp.register(pocketAssertionConsumptionRoutes, {
        assertionConsumptionService: delegateService,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });

      await testApp.ready();
    });

    afterAll(async () => {
      await testApp?.close();
    });

    beforeEach(() => {
      sharedAssertions.clear();
      sharedVersionRegistry.clear();
      consumptionStore.registerAggregate("drug", testDrugId);
    });

    function createAssertionRecord(
      assertionId: string,
      assertionKey: string,
      assertionType: string = "general_information",
    ): ScientificAssertionRecord {
      const now = new Date();
      return {
        id: assertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId: testDrugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType,
        assertionKey,
        statementText: "Test dosing statement",
        jurisdiction: "IR",
        targetPopulation: "adults",
        clinicalSetting: "inpatient",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: new Date(now.getTime() - 100000),
        updatedAt: new Date(now.getTime() - 50000), // publishedAt
      };
    }

    it("Scenario 1: published assertion with no clinical verifications is withheld from consumers (D.4)", async () => {
      const assertionId = randomUUID();
      sharedAssertions.set(assertionId, createAssertionRecord(assertionId, "dosing.no_verifications"));

      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res.assertions).toHaveLength(0);
    });

    it("Scenario 2: published assertion with valid verification by active credentialed reviewer returns isClinicallyVerified = true and verifiedAt = Date", async () => {
      const assertionId = randomUUID();
      const reviewerId = randomUUID();
      const verifiedTimestamp = new Date("2026-03-25T12:00:00Z");

      sharedAssertions.set(assertionId, createAssertionRecord(assertionId, "dosing.verified"));

      consumptionStore.registerReviewerCredential({
        userId: reviewerId,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });

      consumptionStore.registerVerification({
        id: randomUUID(),
        assertionId,
        reviewerUserId: reviewerId,
        verificationAction: "clinical_verified",
        verifiedAt: verifiedTimestamp,
      });

      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res.assertions.length).toBe(1);
      const assertion = res.assertions[0];
      expect(assertion.isClinicallyVerified).toBe(true);
      expect(assertion.verifiedAt).toEqual(verifiedTimestamp);
    });

    it("Scenario 3: reviewer credential expired or suspended blocks clinical verification", async () => {
      const assertionId1 = randomUUID();
      const reviewerSuspended = randomUUID();
      sharedAssertions.set(assertionId1, createAssertionRecord(assertionId1, "dosing.suspended_reviewer"));

      consumptionStore.registerReviewerCredential({
        userId: reviewerSuspended,
        isActive: true,
        suspendedAt: new Date("2026-01-01T00:00:00Z"), // suspended!
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: randomUUID(),
        assertionId: assertionId1,
        reviewerUserId: reviewerSuspended,
        verificationAction: "clinical_verified",
        verifiedAt: new Date(),
      });

      const res1 = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res1.assertions).toHaveLength(0);

      // Expired license
      const assertionId2 = randomUUID();
      const reviewerExpired = randomUUID();
      sharedAssertions.set(assertionId2, createAssertionRecord(assertionId2, "dosing.expired_reviewer"));

      consumptionStore.registerReviewerCredential({
        userId: reviewerExpired,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2020-01-01T00:00:00Z"), // expired!
      });
      consumptionStore.registerVerification({
        id: randomUUID(),
        assertionId: assertionId2,
        reviewerUserId: reviewerExpired,
        verificationAction: "clinical_verified",
        verifiedAt: new Date("2019-01-01T00:00:00Z"),
      });

      await expect(
        consumptionService.getPublishedAssertionById(assertionId2),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("Scenario 4: active conflict (active_discrepancy) blocks verification even with valid reviewer approvals", async () => {
      const assertionIdA = randomUUID();
      const assertionIdB = randomUUID();
      const reviewerId = randomUUID();

      sharedAssertions.set(assertionIdA, createAssertionRecord(assertionIdA, "dosing.conflict_a"));

      consumptionStore.registerReviewerCredential({
        userId: reviewerId,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: randomUUID(),
        assertionId: assertionIdA,
        reviewerUserId: reviewerId,
        verificationAction: "clinical_verified",
        verifiedAt: new Date(),
      });

      // Active conflict exists
      consumptionStore.registerConflict({
        id: randomUUID(),
        assertionAId: assertionIdA,
        assertionBId: assertionIdB,
        status: "active_discrepancy",
      });

      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res.assertions).toHaveLength(0);
    });

    it("Scenario 5: resolved conflict (status = 'resolved') does not block verification", async () => {
      const assertionId = randomUUID();
      const reviewerId = randomUUID();
      const verifiedTime = new Date("2026-03-22T08:00:00Z");

      sharedAssertions.set(assertionId, createAssertionRecord(assertionId, "dosing.resolved_conflict"));

      consumptionStore.registerReviewerCredential({
        userId: reviewerId,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: randomUUID(),
        assertionId,
        reviewerUserId: reviewerId,
        verificationAction: "clinical_verified",
        verifiedAt: verifiedTime,
      });

      // Resolved conflict
      consumptionStore.registerConflict({
        id: randomUUID(),
        assertionAId: assertionId,
        assertionBId: randomUUID(),
        status: "resolved",
      });

      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res.assertions[0].isClinicallyVerified).toBe(true);
      expect(res.assertions[0].verifiedAt).toEqual(verifiedTime);
    });

    it("Scenario 6: multi-reviewer disagreement (Reviewer 1 rejected, Reviewer 2 verified) fails closed to isClinicallyVerified = false", async () => {
      const assertionId = randomUUID();
      const reviewer1 = randomUUID();
      const reviewer2 = randomUUID();
      const r2VerifiedTime = new Date("2026-03-24T15:00:00Z");

      sharedAssertions.set(
        assertionId,
        createAssertionRecord(assertionId, "dosing.multi_reviewer", "general_information"),
      );

      consumptionStore.registerReviewerCredential({
        userId: reviewer1,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      consumptionStore.registerReviewerCredential({
        userId: reviewer2,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });

      // Reviewer 1 rejects
      consumptionStore.registerVerification({
        id: "v-1",
        assertionId,
        reviewerUserId: reviewer1,
        verificationAction: "clinical_rejected",
        verifiedAt: new Date("2026-03-23T10:00:00Z"),
      });

      // Reviewer 2 approves
      consumptionStore.registerVerification({
        id: "v-2",
        assertionId,
        reviewerUserId: reviewer2,
        verificationAction: "clinical_verified",
        verifiedAt: r2VerifiedTime,
      });

      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res.assertions).toHaveLength(0);
    });

    it("Scenario 6b: 2 valid approvals + 1 valid rejection still fails closed (simple majority does not override)", async () => {
      const assertionId = randomUUID();
      const reviewer1 = randomUUID();
      const reviewer2 = randomUUID();
      const reviewer3 = randomUUID();

      sharedAssertions.set(
        assertionId,
        createAssertionRecord(assertionId, "dosing.majority_disagreement", "dosing_rule"),
      );

      for (const r of [reviewer1, reviewer2, reviewer3]) {
        consumptionStore.registerReviewerCredential({
          userId: r,
          isActive: true,
          suspendedAt: null,
          licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
        });
      }

      consumptionStore.registerVerification({
        id: "v-m1",
        assertionId,
        reviewerUserId: reviewer1,
        verificationAction: "clinical_verified",
        verifiedAt: new Date("2026-03-23T10:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: "v-m2",
        assertionId,
        reviewerUserId: reviewer2,
        verificationAction: "clinical_rejected",
        verifiedAt: new Date("2026-03-24T10:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: "v-m3",
        assertionId,
        reviewerUserId: reviewer3,
        verificationAction: "clinical_verified",
        verifiedAt: new Date("2026-03-25T10:00:00Z"),
      });

      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res.assertions).toHaveLength(0);
    });

    it("Scenario 9: quorum enforcement (1/2 on dosing_rule is false, 2/2 on dosing_rule is true)", async () => {
      const assertionId = randomUUID();
      const reviewer1 = randomUUID();
      const reviewer2 = randomUUID();
      const t1 = new Date("2026-03-20T10:00:00Z");
      const t2 = new Date("2026-03-21T12:00:00Z");

      sharedAssertions.set(
        assertionId,
        createAssertionRecord(assertionId, "dosing.quorum_check", "dosing_rule"),
      );

      for (const r of [reviewer1, reviewer2]) {
        consumptionStore.registerReviewerCredential({
          userId: r,
          isActive: true,
          suspendedAt: null,
          licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
        });
      }

      consumptionStore.registerVerification({
        id: "v-q1",
        assertionId,
        reviewerUserId: reviewer1,
        verificationAction: "clinical_verified",
        verifiedAt: t1,
      });

      const resInsufficient = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(resInsufficient.assertions).toHaveLength(0);

      consumptionStore.registerVerification({
        id: "v-q2",
        assertionId,
        reviewerUserId: reviewer2,
        verificationAction: "clinical_verified",
        verifiedAt: t2,
      });

      const resSufficient = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(resSufficient.assertions[0].isClinicallyVerified).toBe(true);
      expect(resSufficient.assertions[0].verifiedAt).toEqual(t2);
    });

    it("Scenario 10: inactive, missing, and historical multiple credentials per reviewer", async () => {
      const assertionInactive = randomUUID();
      const reviewerInactive = randomUUID();
      sharedAssertions.set(
        assertionInactive,
        createAssertionRecord(assertionInactive, "info.inactive", "general_information"),
      );
      consumptionStore.registerReviewerCredential({
        userId: reviewerInactive,
        isActive: false,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: "v-inact",
        assertionId: assertionInactive,
        reviewerUserId: reviewerInactive,
        verificationAction: "clinical_verified",
        verifiedAt: new Date("2026-03-20T10:00:00Z"),
      });
      await expect(
        consumptionService.getPublishedAssertionById(assertionInactive),
      ).rejects.toMatchObject({ code: "not_found" });

      const assertionMissing = randomUUID();
      sharedAssertions.set(
        assertionMissing,
        createAssertionRecord(assertionMissing, "info.missing", "general_information"),
      );
      consumptionStore.registerVerification({
        id: "v-miss",
        assertionId: assertionMissing,
        reviewerUserId: randomUUID(),
        verificationAction: "clinical_verified",
        verifiedAt: new Date("2026-03-20T10:00:00Z"),
      });
      await expect(
        consumptionService.getPublishedAssertionById(assertionMissing),
      ).rejects.toMatchObject({ code: "not_found" });

      const assertionHistorical = randomUUID();
      const reviewerHistorical = randomUUID();
      const verifiedTime = new Date("2026-03-25T10:00:00Z");
      sharedAssertions.set(
        assertionHistorical,
        createAssertionRecord(assertionHistorical, "info.historical", "general_information"),
      );
      consumptionStore.registerReviewerCredential({
        id: "cred-old-revoked",
        userId: reviewerHistorical,
        isActive: false,
        suspendedAt: new Date("2025-01-01T00:00:00Z"),
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
        grantedAt: new Date("2024-01-01T00:00:00Z"),
      });
      consumptionStore.registerReviewerCredential({
        id: "cred-new-active",
        userId: reviewerHistorical,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
        grantedAt: new Date("2026-01-01T00:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: "v-hist",
        assertionId: assertionHistorical,
        reviewerUserId: reviewerHistorical,
        verificationAction: "clinical_verified",
        verifiedAt: verifiedTime,
      });
      const resHistorical = await consumptionService.getPublishedAssertionById(assertionHistorical);
      expect(resHistorical?.isClinicallyVerified).toBe(true);
      expect(resHistorical?.verifiedAt).toEqual(verifiedTime);
    });

    it("Scenario 11: active safety override on assertion or parent aggregate blocks verification", async () => {
      const assertionByAssertionOverride = randomUUID();
      const assertionByAggregateOverride = randomUUID();
      const reviewer = randomUUID();
      const verifiedTime = new Date("2026-03-25T10:00:00Z");

      consumptionStore.registerReviewerCredential({
        userId: reviewer,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });

      sharedAssertions.set(
        assertionByAssertionOverride,
        createAssertionRecord(assertionByAssertionOverride, "info.override_a", "general_information"),
      );
      consumptionStore.registerVerification({
        id: "v-ov-a",
        assertionId: assertionByAssertionOverride,
        reviewerUserId: reviewer,
        verificationAction: "clinical_verified",
        verifiedAt: verifiedTime,
      });
      consumptionStore.registerSafetyOverride({
        id: randomUUID(),
        targetEntityType: "assertion",
        targetEntityId: assertionByAssertionOverride,
        actionState: "quarantined",
        isActive: true,
      });

      await expect(
        consumptionService.getPublishedAssertionById(assertionByAssertionOverride),
      ).rejects.toMatchObject({ code: "not_found" });

      sharedAssertions.set(
        assertionByAggregateOverride,
        createAssertionRecord(assertionByAggregateOverride, "info.override_agg", "general_information"),
      );
      consumptionStore.registerVerification({
        id: "v-ov-agg",
        assertionId: assertionByAggregateOverride,
        reviewerUserId: reviewer,
        verificationAction: "clinical_verified",
        verifiedAt: verifiedTime,
      });
      consumptionStore.registerSafetyOverride({
        id: randomUUID(),
        targetEntityType: "drug",
        targetEntityId: testDrugId,
        actionState: "quarantined",
        isActive: true,
      });

      await expect(
        consumptionService.getPublishedAssertionById(assertionByAggregateOverride),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("Scenario 7: same reviewer verified then rejected yields isClinicallyVerified = false (latest action takes precedence)", async () => {
      const assertionId = randomUUID();
      const reviewerId = randomUUID();

      sharedAssertions.set(assertionId, createAssertionRecord(assertionId, "dosing.reviewer_change_mind"));

      consumptionStore.registerReviewerCredential({
        userId: reviewerId,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });

      // Action 1: earlier verified
      consumptionStore.registerVerification({
        id: "v-earlier",
        assertionId,
        reviewerUserId: reviewerId,
        verificationAction: "clinical_verified",
        verifiedAt: new Date("2026-03-20T10:00:00Z"),
      });

      // Action 2: later rejected
      consumptionStore.registerVerification({
        id: "v-later",
        assertionId,
        reviewerUserId: reviewerId,
        verificationAction: "clinical_rejected",
        verifiedAt: new Date("2026-03-21T10:00:00Z"),
      });

      const res = await consumptionService.getPublishedAssertionsByAggregate("drug", testDrugId);
      expect(res.assertions).toHaveLength(0);
    });

    it("Scenario 8: API endpoint unification guarantees identical isClinicallyVerified and verifiedAt across aggregate and single assertion endpoints", async () => {
      const assertionId = randomUUID();
      const reviewerId = randomUUID();
      const verifiedTimestamp = new Date("2026-03-25T14:30:00Z");

      sharedAssertions.set(assertionId, createAssertionRecord(assertionId, "dosing.unified_api"));

      consumptionStore.registerReviewerCredential({
        userId: reviewerId,
        isActive: true,
        suspendedAt: null,
        licenseExpiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      consumptionStore.registerVerification({
        id: randomUUID(),
        assertionId,
        reviewerUserId: reviewerId,
        verificationAction: "clinical_verified",
        verifiedAt: verifiedTimestamp,
      });

      // 1. Call GET /v1/pocket/aggregates/:type/:id/assertions
      const aggregateHttpRes = await testApp.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${testDrugId}/assertions`,
        headers: { authorization: "Bearer token-student" },
      });
      expect(aggregateHttpRes.statusCode).toBe(200);
      const aggBody = aggregateHttpRes.json();
      const aggAssertion = aggBody.data.assertions.find(
        (a: { id: string }) => a.id === assertionId,
      );
      expect(aggAssertion).toBeDefined();
      expect(aggAssertion.isClinicallyVerified).toBe(true);
      expect(new Date(aggAssertion.verifiedAt)).toEqual(verifiedTimestamp);

      // 2. Call GET /v1/pocket/assertions/:id
      const singleHttpRes = await testApp.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${assertionId}`,
        headers: { authorization: "Bearer token-student" },
      });
      expect(singleHttpRes.statusCode).toBe(200);
      const singleBody = singleHttpRes.json();
      const singleAssertion = singleBody.data;
      expect(singleAssertion).toBeDefined();
      expect(singleAssertion.isClinicallyVerified).toBe(true);
      expect(new Date(singleAssertion.verifiedAt)).toEqual(verifiedTimestamp);

      // Strict parity check
      expect(aggAssertion.isClinicallyVerified).toBe(singleAssertion.isClinicallyVerified);
      expect(aggAssertion.verifiedAt).toBe(singleAssertion.verifiedAt);
    });
  });
});
