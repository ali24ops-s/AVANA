/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { sql, eq, inArray } from "drizzle-orm";
import type { Actor } from "@avana/domain";
import { createDbClient } from "@avana/database/client";
import {
  users,
  pocketDrugs,
  pocketDiseases,
  pocketDrugDiseaseLinks,
  pocketScientificAssertions,
  pocketAssertionAuditLog,
  pocketAssertionVerifications,
  pocketClinicalReviewerCredentials,
  pocketClinicalConflicts,
  pocketSafetyOverrides,
  pocketEntityVersionRegistry,
  pocketOutbox,
} from "@avana/database/schema";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import { InMemoryAssertionConsumptionStore } from "../assertion-consumption-store.js";
import { AssertionConsumptionService } from "../assertion-consumption-service.js";
import { pocketAssertionConsumptionRoutes } from "../assertion-consumption-routes.js";
import { DrizzleAssertionConsumptionStore } from "../drizzle-assertion-consumption-store.js";
import { DrizzlePocketSearchStore } from "../drizzle-pocket-search-store.js";
import { PocketSearchService } from "../pocket-search-service.js";
import { pocketSearchRoutes } from "../pocket-search-routes.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleAssertionPublishingStore } from "../drizzle-assertion-publishing-store.js";
import { DrizzleSafetyOverrideStore } from "../drizzle-safety-override-store.js";
import { ReviewerService } from "../reviewer-service.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";
import { AssertionPublishingService } from "../assertion-publishing-service.js";
import { SafetyOverrideService } from "../safety-override-service.js";
import type { ScientificAssertionRecord } from "../assertion-review-store.js";
import type { EntityVersionRecord } from "../assertion-publishing-store.js";

describe("AVANA Pocket Phase D.4: Post-Publication Clinical Safety Enforcement", () => {
  describe("1. Unit Tests (In-Memory Consumption & ETag Revalidation)", () => {
    const drugId = randomUUID();
    const rev1 = randomUUID();
    const rev2 = randomUUID();
    const studentId = randomUUID();

    let assertionsMap: Map<string, ScientificAssertionRecord>;
    let versionRegistry: Map<string, EntityVersionRecord>;
    let store: InMemoryAssertionConsumptionStore;
    let service: AssertionConsumptionService;
    let app: FastifyInstance;

    beforeEach(async () => {
      assertionsMap = new Map();
      versionRegistry = new Map();
      store = new InMemoryAssertionConsumptionStore(assertionsMap, versionRegistry);
      store.registerAggregate("drug", drugId);
      versionRegistry.set(`drug:${drugId}`, {
        aggregateType: "drug",
        aggregateId: drugId,
        currentVersion: 1,
        updatedAt: new Date(),
      });

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

      service = new AssertionConsumptionService({ consumptionStore: store });
      app = fastify({ logger: false });
      await app.register(errorHandlerPlugin);
      await app.register(pocketAssertionConsumptionRoutes, {
        assertionConsumptionService: service,
        sessionService: {
          validateSessionDetails: async () => ({
            valid: true,
            revoked: false,
            user: { userId: studentId, role: "student", globalRole: null },
          }),
          getConfig: () => ({}),
        } as unknown as Parameters<typeof pocketAssertionConsumptionRoutes>[1]["sessionService"],
        userStore: {
          findById: async () => ({
            id: studentId,
            email: "student@avana.test",
            role: "student",
            globalRole: null,
          }),
        } as unknown as Parameters<typeof pocketAssertionConsumptionRoutes>[1]["userStore"],
      });
      await app.ready();
    });

    it("returns valid published assertions, omits invalid ones, returns 200 [] when all invalid, and 404 for direct invalid lookup", async () => {
      const validId = randomUUID();
      const invalidId = randomUUID();
      const now = new Date();

      assertionsMap.set(validId, {
        id: validId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "general_info",
        assertionKey: "info.valid",
        statementText: "Valid clinical statement",
        jurisdiction: "global",
        targetPopulation: "adults",
        clinicalSetting: "all",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });
      assertionsMap.set(invalidId, {
        id: invalidId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        previousVersionId: null,
        drugId,
        diseaseId: null,
        treatmentId: null,
        emergencyId: null,
        assertionType: "dosing",
        assertionKey: "dosing.under_quorum",
        statementText: "Should be withheld (1/2 quorum)",
        jurisdiction: "global",
        targetPopulation: "adults",
        clinicalSetting: "all",
        status: "published",
        releaseId: null,
        validUntilDate: null,
        supersededAt: null,
        createdAt: now,
        updatedAt: now,
      });

      store.registerVerification({
        id: randomUUID(),
        assertionId: validId,
        reviewerUserId: rev1,
        verificationAction: "clinical_verified",
        verifiedAt: now,
      });
      store.registerVerification({
        id: randomUUID(),
        assertionId: invalidId,
        reviewerUserId: rev1,
        verificationAction: "clinical_verified",
        verifiedAt: now,
      });

      // Partial invalidation: only validId returned
      const partialRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: { authorization: "Bearer token" },
      });
      expect(partialRes.statusCode).toBe(200);
      const partialJson = JSON.parse(partialRes.payload);
      expect(partialJson.data.assertions.map((a: { id: string }) => a.id)).toEqual([validId]);
      const firstEtag = partialRes.headers.etag as string;

      // Direct invalid lookup -> 404 without revealing assertion body
      const directInvalid = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${invalidId}`,
        headers: { authorization: "Bearer token" },
      });
      expect(directInvalid.statusCode).toBe(404);
      expect(directInvalid.payload).not.toContain("Should be withheld");

      // Restored quorum on invalidId -> becomes available AND changes ETag (prevents stale 304!)
      store.registerVerification({
        id: randomUUID(),
        assertionId: invalidId,
        reviewerUserId: rev2,
        verificationAction: "clinical_verified",
        verifiedAt: new Date(now.getTime() + 1000),
      });

      const restoredRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: {
          authorization: "Bearer token",
          "if-none-match": firstEtag,
        },
      });
      expect(restoredRes.statusCode).toBe(200);
      expect(JSON.parse(restoredRes.payload).data.assertions).toHaveLength(2);
      expect(restoredRes.headers.etag).not.toBe(firstEtag);

      // Aggregate-level Safety Override -> HTTP 200 with empty array [] AND Metadata 404
      store.registerMetadata({
        id: drugId,
        type: "drug",
        slug: `drug-${drugId.slice(0, 8)}`,
        nameEn: "Test Drug",
        nameFa: "داروی تست",
        classification: "Test Class",
        summary: "Test Summary",
        publishedAt: now.toISOString(),
        versionNumber: 1,
      });

      // Before safety override: Metadata is accessible (200)
      const metaBefore = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/metadata`,
        headers: { authorization: "Bearer token" },
      });
      expect(metaBefore.statusCode).toBe(200);
      expect(JSON.parse(metaBefore.payload).data.id).toBe(drugId);

      store.registerSafetyOverride({
        id: "ov-agg-1",
        targetEntityType: "drug",
        targetEntityId: drugId,
        actionState: "active",
        isActive: true,
      });
      const blockedRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/assertions`,
        headers: { authorization: "Bearer token" },
      });
      expect(blockedRes.statusCode).toBe(200);
      expect(JSON.parse(blockedRes.payload).data.assertions).toEqual([]);

      // Active Safety Override -> Metadata returns 404 (not_found)
      const metaBlocked = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/metadata`,
        headers: { authorization: "Bearer token" },
      });
      expect(metaBlocked.statusCode).toBe(404);

      // Cleared Safety Override -> Metadata is accessible again (200)
      store.clearSafetyOverride("ov-agg-1");
      const metaCleared = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugId}/metadata`,
        headers: { authorization: "Bearer token" },
      });
      expect(metaCleared.statusCode).toBe(200);
      expect(JSON.parse(metaCleared.payload).data.id).toBe(drugId);

      await app.close();
    });
  });

  describe("2. PostgreSQL Integration: Consumption, Search, Discovery, Related & Restoration", () => {
    let client: ReturnType<typeof createDbClient>;
    let consumptionStore: DrizzleAssertionConsumptionStore;
    let consumptionService: AssertionConsumptionService;
    let searchStore: DrizzlePocketSearchStore;
    let searchService: PocketSearchService;
    let reviewerStore: DrizzleReviewerStore;
    let reviewStore: DrizzleAssertionReviewStore;
    let verificationStore: DrizzleAssertionVerificationStore;
    let publishingStore: DrizzleAssertionPublishingStore;
    let overrideStore: DrizzleSafetyOverrideStore;
    let reviewerService: ReviewerService;
    let verificationService: AssertionVerificationService;
    let publishingService: AssertionPublishingService;
    let overrideService: SafetyOverrideService;
    let app: FastifyInstance;

    const adminId = randomUUID();
    const rev1Id = randomUUID();
    const rev2Id = randomUUID();
    const rev3Id = randomUUID();
    const studentId = randomUUID();

    const uniqueToken = `d4tok${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const drugValidId = randomUUID();
    const drugPartialId = randomUUID();
    const drugOverrideId = randomUUID();
    const diseaseRelatedId = randomUUID();

    const createdAssertionIds: string[] = [];
    const createdDrugIds = [drugValidId, drugPartialId, drugOverrideId];
    const createdUserIds = [adminId, rev1Id, rev2Id, rev3Id];

    const adminActor: Actor = {
      userId: adminId as Actor["userId"],
      role: "platform_admin",
      globalRole: "platform_admin",
    };
    const rev1Actor: Actor = { userId: rev1Id as Actor["userId"], role: "teacher", globalRole: null };
    const rev2Actor: Actor = { userId: rev2Id as Actor["userId"], role: "teacher", globalRole: null };
    const rev3Actor: Actor = { userId: rev3Id as Actor["userId"], role: "teacher", globalRole: null };

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);

      consumptionStore = new DrizzleAssertionConsumptionStore(client.db);
      consumptionService = new AssertionConsumptionService({ consumptionStore });
      searchStore = new DrizzlePocketSearchStore(client.db);
      searchService = new PocketSearchService({ searchStore });
      reviewerStore = new DrizzleReviewerStore(client.db);
      reviewStore = new DrizzleAssertionReviewStore(client.db);
      verificationStore = new DrizzleAssertionVerificationStore(client.db);
      publishingStore = new DrizzleAssertionPublishingStore(client.db);
      overrideStore = new DrizzleSafetyOverrideStore(client.db);
      reviewerService = new ReviewerService({ reviewerStore, db: client.db });
      verificationService = new AssertionVerificationService({
        verificationStore,
        assertionStore: reviewStore,
        reviewerService,
        db: client.db,
      });
      publishingService = new AssertionPublishingService({
        publishingStore,
        assertionStore: reviewStore,
        verificationStore,
        db: client.db,
      });
      overrideService = new SafetyOverrideService({
        safetyOverrideStore: overrideStore,
        db: client.db,
      });

      app = fastify({ logger: false });
      await app.register(errorHandlerPlugin);
      const mockSession = {
        validateSessionDetails: async () => ({
          valid: true,
          revoked: false,
          user: { userId: studentId, role: "student", globalRole: null },
        }),
        getConfig: () => ({}),
      } as unknown as Parameters<typeof pocketAssertionConsumptionRoutes>[1]["sessionService"];
      const mockUsers = {
        findById: async () => ({
          id: studentId,
          email: "d4-student@avana.test",
          role: "student",
          globalRole: null,
        }),
      } as unknown as Parameters<typeof pocketAssertionConsumptionRoutes>[1]["userStore"];

      await app.register(pocketAssertionConsumptionRoutes, {
        assertionConsumptionService: consumptionService,
        sessionService: mockSession,
        userStore: mockUsers,
      });
      await app.register(pocketSearchRoutes, {
        pocketSearchService: searchService,
        sessionService: mockSession,
        userStore: mockUsers,
      });
      await app.ready();

      await client.db.insert(users).values([
        {
          id: adminId,
          email: `d4-admin-${adminId.slice(0, 8)}@avana.test`,
          name: "D4 Admin",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "platform_admin",
        },
        {
          id: rev1Id,
          email: `d4-r1-${rev1Id.slice(0, 8)}@avana.test`,
          name: "D4 R1",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "user",
        },
        {
          id: rev2Id,
          email: `d4-r2-${rev2Id.slice(0, 8)}@avana.test`,
          name: "D4 R2",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "user",
        },
        {
          id: rev3Id,
          email: `d4-r3-${rev3Id.slice(0, 8)}@avana.test`,
          name: "D4 R3",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "user",
        },
      ]);

      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await client.db.insert(pocketClinicalReviewerCredentials).values([
        {
          userId: rev1Id,
          medicalLicenseNumber: `LIC-D4-1-${rev1Id.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Pharmacy",
          isActive: true,
          suspendedAt: null,
          grantedBy: adminId,
          licenseExpiresAt: future,
        },
        {
          userId: rev2Id,
          medicalLicenseNumber: `LIC-D4-2-${rev2Id.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Medicine",
          isActive: true,
          suspendedAt: null,
          grantedBy: adminId,
          licenseExpiresAt: future,
        },
        {
          userId: rev3Id,
          medicalLicenseNumber: `LIC-D4-3-${rev3Id.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Cardiology",
          isActive: true,
          suspendedAt: null,
          grantedBy: adminId,
          licenseExpiresAt: future,
        },
      ]);

      const now = new Date();
      await client.db.insert(pocketDrugs).values([
        {
          id: drugValidId,
          slug: `d4-valid-${drugValidId.slice(0, 8)}`,
          genericNameEn: `${uniqueToken} AlphaDrug`,
          genericNameFa: `${uniqueToken} داروی الفا`,
          drugClass: "Beta Blocker",
          mechanismOfAction: "MOA",
          status: "published",
          publishedAt: now,
        },
        {
          id: drugPartialId,
          slug: `d4-partial-${drugPartialId.slice(0, 8)}`,
          genericNameEn: `${uniqueToken} BetaDrug`,
          genericNameFa: `${uniqueToken} داروی بتا`,
          drugClass: "Beta Blocker",
          mechanismOfAction: "MOA",
          status: "published",
          publishedAt: now,
        },
        {
          id: drugOverrideId,
          slug: `d4-override-${drugOverrideId.slice(0, 8)}`,
          genericNameEn: `${uniqueToken} GammaDrug`,
          genericNameFa: `${uniqueToken} داروی گاما`,
          drugClass: "Beta Blocker",
          mechanismOfAction: "MOA",
          status: "published",
          publishedAt: now,
        },
      ]);

      await client.db.insert(pocketDiseases).values({
        id: diseaseRelatedId,
        slug: `d4-dis-${diseaseRelatedId.slice(0, 8)}`,
        icd10Code: "I10",
        titleEn: `${uniqueToken} Disease`,
        titleFa: `${uniqueToken} بیماری`,
        definition: "Test disease",
        status: "published",
        publishedAt: now,
      });

      await client.db.insert(pocketDrugDiseaseLinks).values([
        {
          drugId: drugValidId,
          diseaseId: diseaseRelatedId,
          relationshipType: "indication",
          clinicalNotes: "Valid link",
        },
        {
          drugId: drugOverrideId,
          diseaseId: diseaseRelatedId,
          relationshipType: "indication",
          clinicalNotes: "Overridden drug link",
        },
      ]);
    });

    afterAll(async () => {
      try {
        await app.close();
        await client.db
          .delete(pocketDrugDiseaseLinks)
          .where(eq(pocketDrugDiseaseLinks.diseaseId, diseaseRelatedId));
        await client.db
          .delete(pocketSafetyOverrides)
          .where(inArray(pocketSafetyOverrides.targetEntityId, [...createdAssertionIds, ...createdDrugIds, diseaseRelatedId]));
        await client.db
          .delete(pocketClinicalConflicts)
          .where(inArray(pocketClinicalConflicts.assertionAId, createdAssertionIds));
        await client.db
          .delete(pocketOutbox)
          .where(inArray(pocketOutbox.aggregateId, createdDrugIds));
        await client.db
          .delete(pocketEntityVersionRegistry)
          .where(inArray(pocketEntityVersionRegistry.aggregateId, createdDrugIds));

        if (createdAssertionIds.length > 0) {
          let remaining = await client.db
            .select({
              id: pocketAssertionVerifications.id,
              parentId: pocketAssertionVerifications.parentVerificationId,
            })
            .from(pocketAssertionVerifications)
            .where(inArray(pocketAssertionVerifications.assertionId, createdAssertionIds));
          while (remaining.length > 0) {
            const parentIds = new Set(
              remaining.map((r) => r.parentId).filter((p): p is string => p !== null),
            );
            const leafIds = remaining.filter((r) => !parentIds.has(r.id)).map((r) => r.id);
            if (leafIds.length === 0) break;
            await client.db
              .delete(pocketAssertionVerifications)
              .where(inArray(pocketAssertionVerifications.id, leafIds));
            remaining = remaining.filter((r) => !leafIds.includes(r.id));
          }

          await client.db
            .delete(pocketAssertionAuditLog)
            .where(inArray(pocketAssertionAuditLog.assertionId, createdAssertionIds));
          await client.db
            .delete(pocketScientificAssertions)
            .where(inArray(pocketScientificAssertions.id, createdAssertionIds));
        }

        await client.db.delete(pocketDiseases).where(eq(pocketDiseases.id, diseaseRelatedId));
        await client.db.delete(pocketDrugs).where(inArray(pocketDrugs.id, createdDrugIds));
        await client.db
          .delete(pocketClinicalReviewerCredentials)
          .where(inArray(pocketClinicalReviewerCredentials.userId, createdUserIds))
          .catch(() => {});
        await client.db
          .delete(users)
          .where(inArray(users.id, createdUserIds))
          .catch(() => {});
      } finally {
        await client.close();
      }
    });

    it("enforces post-publication unavailability across credential suspension/revocation/expiration, rejection, conflict, safety overrides, restoration, and search/discovery", async () => {
      // Seed & publish assertions
      const aValid = randomUUID();
      const aPartialGood = randomUUID();
      const aPartialBad = randomUUID();
      const aOverride = randomUUID();
      const aDiseaseRelated = randomUUID();
      createdAssertionIds.push(aValid, aPartialGood, aPartialBad, aOverride, aDiseaseRelated);

      await client.db.insert(pocketScientificAssertions).values([
        {
          id: aValid,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          drugId: drugValidId,
          assertionType: "general_info",
          assertionKey: "d4.valid.info",
          statementText: "Valid assertion on drugValid",
          status: "reviewed",
        },
        {
          id: aPartialGood,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          drugId: drugPartialId,
          assertionType: "general_info",
          assertionKey: "d4.partial.good",
          statementText: "Partial good assertion",
          status: "reviewed",
        },
        {
          id: aPartialBad,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          drugId: drugPartialId,
          assertionType: "general_info",
          assertionKey: "d4.partial.bad",
          statementText: "Partial bad assertion",
          status: "reviewed",
        },
        {
          id: aOverride,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          drugId: drugOverrideId,
          assertionType: "general_info",
          assertionKey: "d4.override.info",
          statementText: "Overridden drug assertion",
          status: "reviewed",
        },
        {
          id: aDiseaseRelated,
          assertionRootId: randomUUID(),
          versionNumber: 1,
          diseaseId: diseaseRelatedId,
          assertionType: "general_info",
          assertionKey: "d4.disease.related",
          statementText: "Valid assertion on diseaseRelated",
          status: "reviewed",
        },
      ]);

      // Verify & publish all 4
      const tempRevId = randomUUID();
      createdUserIds.push(tempRevId);
      await client.db.insert(users).values({
        id: tempRevId,
        email: `d4-temp-${tempRevId.slice(0, 8)}@avana.test`,
        name: "D4 Temp Rev",
        passwordHash: "hash",
        role: "admin",
        emailVerified: true,
        globalRole: "user",
      });
      const [tempCred] = await client.db
        .insert(pocketClinicalReviewerCredentials)
        .values({
          userId: tempRevId,
          medicalLicenseNumber: `LIC-D4-T-${tempRevId.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Pharmacy",
          isActive: true,
          suspendedAt: null,
          grantedBy: adminId,
          licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        })
        .returning();
      const tempActor: Actor = { userId: tempRevId as Actor["userId"], role: "teacher", globalRole: null };

      await verificationService.verifyAssertion(tempActor, {
        assertionId: aValid,
        clinicalReviewNotes: "Approved by tempRev",
      });
      await verificationService.verifyAssertion(rev1Actor, {
        assertionId: aPartialGood,
        clinicalReviewNotes: "Approved good",
      });
      await verificationService.verifyAssertion(rev2Actor, {
        assertionId: aPartialBad,
        clinicalReviewNotes: "Approved bad",
      });
      await verificationService.verifyAssertion(rev1Actor, {
        assertionId: aOverride,
        clinicalReviewNotes: "Approved override drug",
      });
      await verificationService.verifyAssertion(rev1Actor, {
        assertionId: aDiseaseRelated,
        clinicalReviewNotes: "Approved disease related",
      });

      for (const aid of [aValid, aPartialGood, aPartialBad, aOverride, aDiseaseRelated]) {
        await publishingService.publishAssertion(adminActor, { assertionId: aid });
      }

      // 1. Credential suspension makes aValid unavailable (404 direct, [] aggregate, excluded from search)
      await reviewerService.suspendCredential(adminActor, {
        credentialId: tempCred.id,
        reason: "Post-publication suspension",
      });

      const direct404 = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${aValid}`,
        headers: { authorization: "Bearer token" },
      });
      expect(direct404.statusCode).toBe(404);

      const aggEmpty = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugValidId}/assertions`,
        headers: { authorization: "Bearer token" },
      });
      expect(aggEmpty.statusCode).toBe(200);
      expect(JSON.parse(aggEmpty.payload).data.assertions).toEqual([]);

      // Historical status remains 'published'
      const [aValidRow] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, aValid));
      expect(aValidRow.status).toBe("published");

      // Search excludes drugValid (all published assertions invalid)
      const search1 = await app.inject({
        method: "GET",
        url: `/v1/pocket/search?q=${uniqueToken}`,
        headers: { authorization: "Bearer token" },
      });
      expect(search1.statusCode).toBe(200);
      const searchIds1 = JSON.parse(search1.payload).data.items.map((i: { id: string }) => i.id);
      expect(searchIds1).not.toContain(drugValidId);
      expect(searchIds1).toContain(drugPartialId);

      // 2. Replacement valid approval on aValid restores availability WITHOUT republishing!
      await verificationService.verifyAssertion(rev3Actor, {
        assertionId: aValid,
        clinicalReviewNotes: "Replacement approval after suspension",
      });
      const restoredDirect = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${aValid}`,
        headers: { authorization: "Bearer token" },
      });
      expect(restoredDirect.statusCode).toBe(200);

      // 3. Post-publication rejection on aPartialBad hides ONLY aPartialBad; drugPartialId keeps aPartialGood
      await verificationService.rejectAssertionVerification(rev2Actor, {
        assertionId: aPartialBad,
        clinicalReviewNotes: "Post-publication rejection",
      });
      const partialCons = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugPartialId}/assertions`,
        headers: { authorization: "Bearer token" },
      });
      expect(partialCons.statusCode).toBe(200);
      const partialIds = JSON.parse(partialCons.payload).data.assertions.map(
        (a: { id: string }) => a.id,
      );
      expect(partialIds).toEqual([aPartialGood]);

      // 4. Aggregate-level Safety Override on drugOverrideId hides it from Search, Discovery, Related, Consumption & Metadata
      const metaBeforeOverride = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugOverrideId}/metadata`,
        headers: { authorization: "Bearer token" },
      });
      expect(metaBeforeOverride.statusCode).toBe(200);

      const { override: aggOv } = await overrideService.activateOverride(adminActor, {
        targetEntityType: "drug",
        targetEntityId: drugOverrideId,
        reason: "Emergency aggregate hold",
      });

      const metaDuringOverride = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugOverrideId}/metadata`,
        headers: { authorization: "Bearer token" },
      });
      expect(metaDuringOverride.statusCode).toBe(404);

      // Aggregate without valid assertions (but no safety override) still returns Metadata (200) consistent with Consumption
      const metaNoValidAssertions = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugPartialId}/metadata`,
        headers: { authorization: "Bearer token" },
      });
      expect(metaNoValidAssertions.statusCode).toBe(200);

      const search2 = await app.inject({
        method: "GET",
        url: `/v1/pocket/search?q=${uniqueToken}&limit=1&offset=0`,
        headers: { authorization: "Bearer token" },
      });
      const search2Json = JSON.parse(search2.payload).data;
      expect(search2Json.items).toHaveLength(1);
      expect(search2Json.total).toBeGreaterThanOrEqual(3); // drugValid, drugPartial, diseaseRelated (not drugOverride)

      const discovery = await app.inject({
        method: "GET",
        url: `/v1/pocket/discovery?type=drug&sort=name_asc&limit=50&offset=0`,
        headers: { authorization: "Bearer token" },
      });
      const discoveryIds = JSON.parse(discovery.payload).data.items.map((i: { id: string }) => i.id);
      expect(discoveryIds).toContain(drugValidId);
      expect(discoveryIds).not.toContain(drugOverrideId);

      const related = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/disease/${diseaseRelatedId}/related`,
        headers: { authorization: "Bearer token" },
      });
      expect(related.statusCode).toBe(200);
      const relatedDrugIds = JSON.parse(related.payload)
        .data.groups.flatMap((g: { entities: Array<{ id: string }> }) => g.entities)
        .map((e: { id: string }) => e.id);
      expect(relatedDrugIds).toContain(drugValidId);
      expect(relatedDrugIds).not.toContain(drugOverrideId);

      // 5. Clearing aggregate override restores availability & discovery without republishing
      await overrideService.clearOverride(adminActor, {
        overrideId: aggOv.id,
        reason: "Cleared emergency hold",
      });
      const restoredOverrideDrug = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${aOverride}`,
        headers: { authorization: "Bearer token" },
      });
      expect(restoredOverrideDrug.statusCode).toBe(200);

      const metaAfterClear = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/drug/${drugOverrideId}/metadata`,
        headers: { authorization: "Bearer token" },
      });
      expect(metaAfterClear.statusCode).toBe(200);

      // 6. Active clinical conflict blocks aValid; resolving/clearing isn't needed for test cleanup
      await client.db.insert(pocketClinicalConflicts).values({
        assertionAId: aValid,
        assertionBId: aPartialGood,
        conflictSubject: "Post-pub conflict",
        discrepancyDescription: "Conflicting clinical evidence",
        status: "active_discrepancy",
      });
      const conflictedRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/assertions/${aValid}`,
        headers: { authorization: "Bearer token" },
      });
      expect(conflictedRes.statusCode).toBe(404);
    });

    it("excludes aggregates with zero published assertions from Search, Discovery, and Related results (and handles zero-assertion Safety Override)", async () => {
      const zeroDrugId = randomUUID();
      const zeroOverriddenDrugId = randomUUID();
      const zeroToken = `d4zero${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      const now = new Date();

      createdDrugIds.push(zeroDrugId, zeroOverriddenDrugId);

      await client.db.insert(pocketDrugs).values([
        {
          id: zeroDrugId,
          slug: `d4-zero-${zeroDrugId.slice(0, 8)}`,
          genericNameEn: `${zeroToken} ZeroAssertionDrug`,
          genericNameFa: `${zeroToken} داروی بدون گزاره`,
          drugClass: "Beta Blocker",
          mechanismOfAction: "MOA",
          status: "published",
          publishedAt: now,
        },
        {
          id: zeroOverriddenDrugId,
          slug: `d4-zero-ov-${zeroOverriddenDrugId.slice(0, 8)}`,
          genericNameEn: `${zeroToken} ZeroOverriddenDrug`,
          genericNameFa: `${zeroToken} داروی بدون گزاره مسدود`,
          drugClass: "Beta Blocker",
          mechanismOfAction: "MOA",
          status: "published",
          publishedAt: now,
        },
      ]);

      // Link zeroDrugId to diseaseRelatedId so Related endpoint also sees it as a candidate
      await client.db.insert(pocketDrugDiseaseLinks).values({
        drugId: zeroDrugId,
        diseaseId: diseaseRelatedId,
        relationshipType: "indication",
        clinicalNotes: "Zero assertion drug link",
      });

      // Active aggregate-level safety override on zeroOverriddenDrugId (with zero assertions)
      await overrideService.activateOverride(adminActor, {
        targetEntityType: "drug",
        targetEntityId: zeroOverriddenDrugId,
        reason: "Safety hold on zero-assertion drug",
      });

      // 1. Search excludes both zeroDrugId and zeroOverriddenDrugId
      const searchRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/search?q=${zeroToken}`,
        headers: { authorization: "Bearer token" },
      });
      expect(searchRes.statusCode).toBe(200);
      const searchData = JSON.parse(searchRes.payload).data;
      expect(searchData.items).toHaveLength(0);
      expect(searchData.total).toBe(0);

      // 2. Discovery excludes both zero-assertion drugs while keeping valid drugs visible
      const discRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/discovery?type=drug&sort=name_asc&limit=50&offset=0`,
        headers: { authorization: "Bearer token" },
      });
      expect(discRes.statusCode).toBe(200);
      const discIds = JSON.parse(discRes.payload).data.items.map((i: { id: string }) => i.id);
      expect(discIds).not.toContain(zeroDrugId);
      expect(discIds).not.toContain(zeroOverriddenDrugId);
      expect(discIds).toContain(drugOverrideId); // has valid assertion aOverride (override cleared)

      // 3. Related results exclude zeroDrugId
      const relatedRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/aggregates/disease/${diseaseRelatedId}/related`,
        headers: { authorization: "Bearer token" },
      });
      expect(relatedRes.statusCode).toBe(200);
      const relatedIds = JSON.parse(relatedRes.payload)
        .data.groups.flatMap((g: { entities: Array<{ id: string }> }) => g.entities)
        .map((e: { id: string }) => e.id);
      expect(relatedIds).not.toContain(zeroDrugId);
    });
  });
});
