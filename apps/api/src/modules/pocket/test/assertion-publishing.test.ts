/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { type Actor } from "@avana/domain";
import { createDbClient } from "@avana/database/client";
import { sql, eq } from "drizzle-orm";
import {
  users,
  pocketDrugs,
  pocketClinicalReviewerCredentials,
  pocketScientificAssertions,
  pocketAssertionAuditLog,
  pocketAssertionVerifications,
  pocketEntityVersionRegistry,
  pocketOutbox,
} from "@avana/database/schema";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import {
  InMemoryReviewerStore,
} from "../reviewer-store.js";
import {
  InMemoryAssertionReviewStore,
  type ScientificAssertionRecord,
} from "../assertion-review-store.js";
import {
  InMemoryAssertionVerificationStore,
} from "../assertion-verification-store.js";
import {
  InMemoryAssertionPublishingStore,
} from "../assertion-publishing-store.js";
import { DrizzleAssertionPublishingStore } from "../drizzle-assertion-publishing-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { AssertionPublishingService } from "../assertion-publishing-service.js";
import { pocketAssertionPublishingRoutes } from "../assertion-publishing-routes.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";
import { evaluateAssertionVerificationSummary } from "../assertion-verification-resolver.js";

describe("AVANA Pocket Phase 2C-3: Atomic Publishing Workflow", () => {
  const adminUserId = randomUUID();
  const doctorUserId = randomUUID();
  const studentUserId = randomUUID();
  const drugId = randomUUID();

  const adminActor: Actor = {
    userId: adminUserId as Actor["userId"],
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const doctorActor: Actor = {
    userId: doctorUserId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  const studentActor: Actor = {
    userId: studentUserId as Actor["userId"],
    role: "student",
    globalRole: null,
  };

  let reviewerStore: InMemoryReviewerStore;
  let assertionStore: InMemoryAssertionReviewStore;
  let verificationStore: InMemoryAssertionVerificationStore;
  let publishingStore: InMemoryAssertionPublishingStore;
  let publishingService: AssertionPublishingService;

  beforeEach(async () => {
    reviewerStore = new InMemoryReviewerStore();

    const sharedMap = new Map<string, ScientificAssertionRecord>();
    assertionStore = new InMemoryAssertionReviewStore(sharedMap);
    verificationStore = new InMemoryAssertionVerificationStore();
    publishingStore = new InMemoryAssertionPublishingStore(sharedMap);

    publishingService = new AssertionPublishingService({
      publishingStore,
      assertionStore,
      verificationStore,
      resolveVerificationSummary: async (context) => {
        const verifs = await verificationStore.findVerificationsByAssertionId(context.assertionId);
        const creds = await reviewerStore.listAll();
        return evaluateAssertionVerificationSummary({
          context,
          verifications: verifs,
          credentials: creds,
          conflicts: [],
          safetyOverrides: [],
        });
      },
    });

    // Setup active reviewer
    await reviewerStore.create({
      userId: doctorUserId,
      medicalLicenseNumber: "MD-PUB-998877",
      specialty: "Clinical Toxicology",
      licensingAuthority: "Medical Council",
      grantedBy: adminUserId,
      licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
  });

  describe("1. Publishing Preconditions & Lifecycle Validations", () => {
    it("rejects publishing an assertion in 'draft' status", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.cardiology.draft",
        assertionType: "dosing_rule",
        statementText: "Draft statement cannot be published",
        drugId,
        status: "draft",
      });

      await expect(
        publishingService.publishAssertion(adminActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Cannot publish draft assertion");
    });

    it("rejects publishing an assertion in 'in_review' status", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.cardiology.in_review",
        assertionType: "dosing_rule",
        statementText: "In review assertion cannot be published",
        drugId,
        status: "in_review",
      });

      await expect(
        publishingService.publishAssertion(adminActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Cannot publish assertion in review");
    });

    it("rejects publishing an assertion in 'reviewed' status without clinical verification", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.cardiology.reviewed",
        assertionType: "dosing_rule",
        statementText: "Reviewed assertion without clinical verification cannot be published",
        drugId,
        status: "reviewed",
      });

      await expect(
        publishingService.publishAssertion(adminActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Cannot publish assertion in reviewed status");
    });

    it("rejects publishing an already 'published' assertion", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.cardiology.published",
        assertionType: "dosing_rule",
        statementText: "Already published statement",
        drugId,
        status: "published",
      });

      await expect(
        publishingService.publishAssertion(adminActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Assertion is already published");
    });

    it("rejects publishing a 'superseded' assertion", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.cardiology.superseded",
        assertionType: "dosing_rule",
        statementText: "Superseded statement cannot be republished",
        drugId,
        status: "superseded",
      });

      await expect(
        publishingService.publishAssertion(adminActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Cannot publish a superseded assertion");
    });

    it("rejects publishing a 'verified' assertion if clinical verification record is missing", async () => {
      // Manually placed in 'verified' without verification record
      const assertion = await assertionStore.create({
        assertionKey: "dosing.cardiology.orphan_verified",
        assertionType: "dosing_rule",
        statementText: "Verified status but missing verification row",
        drugId,
        status: "verified",
      });

      await expect(
        publishingService.publishAssertion(adminActor, { assertionId: assertion.id }),
      ).rejects.toThrow("no_verifications");
    });

    it("rejects non-platform_admin roles (student, teacher, reviewer) from publishing clinical assertions", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.cardiology.unauthorized_roles",
        assertionType: "dosing_rule",
        statementText: "Unauthorized role assertion",
        drugId,
        status: "verified",
      });

      await verificationStore.createVerification({
        assertionId: assertion.id,
        reviewerUserId: doctorUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified by toxicologist",
      });

      // Student rejected
      await expect(
        publishingService.publishAssertion(studentActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Publishing clinical assertions is restricted strictly to platform administrators");

      // Doctor/Reviewer without platform_admin rejected
      await expect(
        publishingService.publishAssertion(doctorActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Publishing clinical assertions is restricted strictly to platform administrators");
    });

    it("rejects publishing unauthenticated actor", async () => {
      await expect(
        publishingService.publishAssertion(null as unknown as Actor, { assertionId: randomUUID() }),
      ).rejects.toThrow("Authenticated actor identity is required");
    });
  });

  describe("2. Version Binding & Verification Scoping", () => {
    it("verification on Version 1 does NOT grant publication rights to Version 2", async () => {
      const rootId = randomUUID();

      // Version 1 created and verified
      const v1 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "dosing.epinephrine.v1",
        assertionType: "dosing_rule",
        statementText: "Epinephrine 1mg IV every 3-5 mins",
        drugId,
        status: "verified",
      });

      await verificationStore.createVerification({
        assertionId: v1.id,
        reviewerUserId: doctorUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "V1 verified by MD",
      });

      // Version 2 created under same root but not verified
      const v2 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: v1.id,
        assertionKey: "dosing.epinephrine.v2",
        assertionType: "dosing_rule",
        statementText: "Epinephrine 1mg IV every 3-5 mins with CPR",
        drugId,
        status: "verified", // forcibly set to verified but no verification record on v2.id
      });

      // Attempting to publish v2 must fail because verification is on v1, not v2
      await expect(
        publishingService.publishAssertion(adminActor, { assertionId: v2.id }),
      ).rejects.toThrow("no_verifications");
    });
  });

  describe("3. Successful First Publication & Side Effects", () => {
    it("atomically publishes verified assertion, increments version registry, enqueues outbox, and writes audit log", async () => {
      const assertion = await assertionStore.create({
        assertionKey: "dosing.amiodarone.v1",
        assertionType: "general_info",
        statementText: "Amiodarone 300mg IV push in cardiac arrest (VF/pVT)",
        drugId,
        status: "verified",
      });

      const verification = await verificationStore.createVerification({
        assertionId: assertion.id,
        reviewerUserId: doctorUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified per ACLS 2025 guidelines",
      });

      const result = await publishingService.publishAssertion(adminActor, {
        assertionId: assertion.id,
        notes: "Initial publication to clinical pocket store",
      });

      // 1. Published assertion checks
      expect(result.publishedAssertion.id).toBe(assertion.id);
      expect(result.publishedAssertion.status).toBe("published");
      expect(result.supersededAssertion).toBeNull();

      // 2. Monotonic Entity Version Registry checks
      expect(result.entityVersion.aggregateType).toBe("drug");
      expect(result.entityVersion.aggregateId).toBe(drugId);
      expect(result.entityVersion.currentVersion).toBe(1);

      // Verify registry state in store
      const storedVersion = publishingStore.getEntityVersion("drug", drugId);
      expect(storedVersion).not.toBeNull();
      expect(storedVersion?.currentVersion).toBe(1);

      // 3. Outbox Event checks
      expect(result.outboxEvent.aggregateType).toBe("drug");
      expect(result.outboxEvent.aggregateId).toBe(drugId);
      expect(result.outboxEvent.eventType).toBe("assertion.published");
      expect(result.outboxEvent.status).toBe("pending");
      expect(result.outboxEvent.payload.assertionId).toBe(assertion.id);
      expect(result.outboxEvent.payload.verificationId).toBe(verification.id);
      expect(result.outboxEvent.payload.clinicalVerifierUserId).toBe(doctorUserId);
      expect(result.outboxEvent.payload.publisherUserId).toBe(adminUserId);
      expect(result.outboxEvent.payload.entityVersion).toBe(1);
      expect(result.outboxEvent.payload.supersededAssertionId).toBeNull();

      // 4. Audit Log checks
      expect(result.auditLog.assertionId).toBe(assertion.id);
      expect(result.auditLog.actorUserId).toBe(adminUserId);
      expect(result.auditLog.action).toBe("published");
      expect(result.auditLog.previousStatus).toBe("verified");
      expect(result.auditLog.newStatus).toBe("published");

      // Verify assertion record updated in store
      const updatedInStore = await assertionStore.findById(assertion.id);
      expect(updatedInStore?.status).toBe("published");
    });
  });

  describe("4. Superseding Previous Published Version & Scientific Immutability", () => {
    it("atomically supersedes previous version under same root, sets supersededAt, preserves scientific statement, and increments entity version", async () => {
      const rootId = randomUUID();

      // --- 1. Publish Version 1 ---
      const v1 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "dosing.ceftriaxone",
        assertionType: "general_info",
        statementText: "Ceftriaxone 1g IV daily for mild to moderate CAP",
        drugId,
        status: "verified",
      });

      await verificationStore.createVerification({
        assertionId: v1.id,
        reviewerUserId: doctorUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "V1 verified by doctor",
      });

      const pub1 = await publishingService.publishAssertion(adminActor, {
        assertionId: v1.id,
      });

      expect(pub1.publishedAssertion.status).toBe("published");
      expect(pub1.entityVersion.currentVersion).toBe(1);
      expect(pub1.supersededAssertion).toBeNull();

      // Capture v1 statement and keys for immutability check
      const originalV1Statement = v1.statementText;
      const originalV1Key = v1.assertionKey;
      const originalV1DrugId = v1.drugId;

      // --- 2. Create and Verify Version 2 ---
      const v2 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: v1.id,
        assertionKey: "dosing.ceftriaxone",
        assertionType: "general_info",
        statementText: "Ceftriaxone 2g IV q24h for severe CAP or meningitis",
        drugId,
        status: "verified",
      });

      await verificationStore.createVerification({
        assertionId: v2.id,
        reviewerUserId: doctorUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "V2 verified with updated meningitis dosage",
      });

      // --- 3. Publish Version 2 ---
      const pub2 = await publishingService.publishAssertion(adminActor, {
        assertionId: v2.id,
        notes: "Upgraded dosing protocol to 2g based on new clinical guideline",
      });

      // Check V2 is published
      expect(pub2.publishedAssertion.id).toBe(v2.id);
      expect(pub2.publishedAssertion.status).toBe("published");

      // Check V1 is superseded
      expect(pub2.supersededAssertion).not.toBeNull();
      expect(pub2.supersededAssertion?.id).toBe(v1.id);
      expect(pub2.supersededAssertion?.status).toBe("superseded");
      expect(pub2.supersededAssertion?.supersededAt).toBeInstanceOf(Date);

      // Verify V1 scientific statement immutability in storage
      const v1AfterSupersede = await assertionStore.findById(v1.id);
      expect(v1AfterSupersede?.status).toBe("superseded");
      expect(v1AfterSupersede?.statementText).toBe(originalV1Statement); // STRICT IMMUTABILITY
      expect(v1AfterSupersede?.assertionKey).toBe(originalV1Key);
      expect(v1AfterSupersede?.drugId).toBe(originalV1DrugId);
      expect(v1AfterSupersede?.supersededAt).not.toBeNull();

      // Check Version Registry incremented to 2
      expect(pub2.entityVersion.currentVersion).toBe(2);
      const registryEntry = publishingStore.getEntityVersion("drug", drugId);
      expect(registryEntry?.currentVersion).toBe(2);

      // Check Outbox Event for V2 publishing
      expect(pub2.outboxEvent.aggregateId).toBe(drugId);
      expect(pub2.outboxEvent.payload.assertionId).toBe(v2.id);
      expect(pub2.outboxEvent.payload.versionNumber).toBe(2);
      expect(pub2.outboxEvent.payload.supersededAssertionId).toBe(v1.id);
      expect(pub2.outboxEvent.payload.entityVersion).toBe(2);

      // Check Audit Log entries for both assertions
      const v1Logs = await assertionStore.listAuditLogsByAssertionId(v1.id);
      const supersedeLog = v1Logs.find((l) => l.action === "superseded");
      expect(supersedeLog).toBeDefined();
      expect(supersedeLog?.previousStatus).toBe("published");
      expect(supersedeLog?.newStatus).toBe("superseded");

      const v2Logs = await assertionStore.listAuditLogsByAssertionId(v2.id);
      const v2PublishLog = v2Logs.find((l) => l.action === "published");
      expect(v2PublishLog).toBeDefined();
      expect(v2PublishLog?.previousStatus).toBe("verified");
      expect(v2PublishLog?.newStatus).toBe("published");
    });
  });

  describe("5. Fastify HTTP Route Integration", () => {
    let app: FastifyInstance;
    let routeAssertionStore: InMemoryAssertionReviewStore;
    let routeVerificationStore: InMemoryAssertionVerificationStore;
    let routePublishingStore: InMemoryAssertionPublishingStore;
    let routePublishingService: AssertionPublishingService;

    beforeAll(async () => {
      app = fastify({ logger: false });
      await app.register(errorHandlerPlugin);

      const routeSharedMap = new Map<string, ScientificAssertionRecord>();
      routeAssertionStore = new InMemoryAssertionReviewStore(routeSharedMap);
      routeVerificationStore = new InMemoryAssertionVerificationStore();
      routePublishingStore = new InMemoryAssertionPublishingStore(routeSharedMap);

      const routeReviewerStore = new InMemoryReviewerStore();
      await routeReviewerStore.create({
        userId: doctorUserId,
        medicalLicenseNumber: "MD-ROUTE-PUB",
        specialty: "Clinical Pharmacology",
        licensingAuthority: "Medical Council",
        grantedBy: adminUserId,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      routePublishingService = new AssertionPublishingService({
        publishingStore: routePublishingStore,
        assertionStore: routeAssertionStore,
        verificationStore: routeVerificationStore,
        resolveVerificationSummary: async (context) => {
          const verifs = await routeVerificationStore.findVerificationsByAssertionId(context.assertionId);
          const creds = await routeReviewerStore.listAll();
          return evaluateAssertionVerificationSummary({
            context,
            verifications: verifs,
            credentials: creds,
            conflicts: [],
            safetyOverrides: [],
          });
        },
      });

      const mockSessionService = {
        validateSessionDetails: async (token: string) => {
          let role = "teacher";
          let globalRole: string | null = null;
          let uid = doctorUserId;
          if (token === "token-student") {
            role = "student";
            uid = studentUserId;
          } else if (token === "token-admin") {
            role = "platform_admin";
            globalRole = "platform_admin";
            uid = adminUserId;
          }
          return {
            valid: true,
            revoked: false,
            user: { userId: uid, role, globalRole },
          };
        },
        getConfig: () => ({}),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

      const mockUserStore = {
        findById: async (id: string) => {
          if (id === doctorUserId) return { id, email: "doc@avana.local", role: "teacher", globalRole: null };
          if (id === adminUserId) return { id, email: "admin@avana.local", role: "platform_admin", globalRole: "platform_admin" };
          return { id, email: "student@avana.local", role: "student", globalRole: null };
        },
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await app.register(pocketAssertionPublishingRoutes, {
        assertionPublishingService: routePublishingService,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });

      await app.ready();
    });

    afterAll(async () => {
      await app?.close();
    });

    it("POST /v1/pocket/assertions/:id/publish succeeds for authorized actor", async () => {
      const assertion = await routeAssertionStore.create({
        assertionKey: "dosing.http.pub",
        assertionType: "general_info",
        statementText: "Verified statement for route test",
        drugId: randomUUID(),
        status: "verified",
      });

      await routeVerificationStore.createVerification({
        assertionId: assertion.id,
        reviewerUserId: doctorUserId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified via review board",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${assertion.id}/publish`,
        headers: {
          authorization: "Bearer token-admin",
        },
        payload: {
          notes: "Published via Fastify route",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.publishedAssertion.status).toBe("published");
      expect(json.data.entityVersion.currentVersion).toBe(1);
    });

    it("POST /v1/pocket/assertions/:id/publish returns 403 for non-platform_admin (doctor/reviewer and student)", async () => {
      const assertion = await routeAssertionStore.create({
        assertionKey: "dosing.http.forbidden_roles",
        assertionType: "dosing_rule",
        statementText: "Statement for forbidden roles test",
        drugId: randomUUID(),
        status: "verified",
      });

      // Doctor/Reviewer returns 403
      const resDoc = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${assertion.id}/publish`,
        headers: {
          authorization: "Bearer token-doctor",
        },
      });
      expect(resDoc.statusCode).toBe(403);

      // Student returns 403
      const resStudent = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${assertion.id}/publish`,
        headers: {
          authorization: "Bearer token-student",
        },
      });
      expect(resStudent.statusCode).toBe(403);
    });

    it("POST /v1/pocket/assertions/:id/publish returns 400 when assertion is not verified", async () => {
      const assertion = await routeAssertionStore.create({
        assertionKey: "dosing.http.draft_fail",
        assertionType: "dosing_rule",
        statementText: "Draft statement cannot be published",
        drugId: randomUUID(),
        status: "draft",
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${assertion.id}/publish`,
        headers: {
          authorization: "Bearer token-admin",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("POST /v1/pocket/assertions/:id/publish returns 404 when assertion does not exist", async () => {
      const nonExistentId = randomUUID();

      const res = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${nonExistentId}/publish`,
        headers: {
          authorization: "Bearer token-admin",
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("6. Real PostgreSQL Database Integration", () => {
    let client: ReturnType<typeof createDbClient> | null = null;
    let drizzleReviewerStore: DrizzleReviewerStore;
    let drizzleAssertionStore: DrizzleAssertionReviewStore;
    let drizzleVerificationStore: DrizzleAssertionVerificationStore;
    let drizzlePublishingStore: DrizzleAssertionPublishingStore;
    let pgPublishingService: AssertionPublishingService;
    let isConnected = false;

    const pgAdminId = randomUUID();
    const pgDoctorId = randomUUID();
    const pgDrugId = randomUUID();

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;

        drizzleReviewerStore = new DrizzleReviewerStore(client.db);
        drizzleAssertionStore = new DrizzleAssertionReviewStore(client.db);
        drizzleVerificationStore = new DrizzleAssertionVerificationStore(client.db);
        drizzlePublishingStore = new DrizzleAssertionPublishingStore(client.db);

        pgPublishingService = new AssertionPublishingService({
          publishingStore: drizzlePublishingStore,
          assertionStore: drizzleAssertionStore,
          verificationStore: drizzleVerificationStore,
          db: client.db,
        });

        // Seed users
        await client.db.insert(users).values([
          {
            id: pgAdminId,
            email: `pg-pub-admin-${Date.now()}@avana.local`,
            name: "PG Pub Admin",
            globalRole: "platform_admin",
          },
          {
            id: pgDoctorId,
            email: `pg-pub-doc-${Date.now()}@avana.local`,
            name: "PG Pub Doctor",
            role: "teacher",
          },
        ]);

        // Seed drug
        await client.db.insert(pocketDrugs).values({
          id: pgDrugId,
          slug: `pg-pub-drug-${Date.now()}`,
          genericNameEn: "Dopamine",
          genericNameFa: "دوپامین",
          drugClass: "Inotrope",
          mechanismOfAction: "Adrenergic receptor agonist",
        });

        // Grant active credential to doctor in PostgreSQL
        await drizzleReviewerStore.create({
          userId: pgDoctorId,
          medicalLicenseNumber: "MD-PG-PUB-909",
          specialty: "Critical Care",
          licensingAuthority: "Medical Council",
          grantedBy: pgAdminId,
          licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
    });

    afterAll(async () => {
      if (isConnected && client) {
        try {
          // Clean up in reverse dependency order
          await client.db
            .delete(pocketOutbox)
            .where(eq(pocketOutbox.aggregateId, pgDrugId));
          await client.db
            .delete(pocketEntityVersionRegistry)
            .where(eq(pocketEntityVersionRegistry.aggregateId, pgDrugId));
          await client.db
            .delete(pocketAssertionAuditLog)
            .where(sql`actor_user_id IN (${pgAdminId}, ${pgDoctorId})`);
          await client.db
            .delete(pocketAssertionVerifications)
            .where(eq(pocketAssertionVerifications.reviewerUserId, pgDoctorId));
          await client.db
            .delete(pocketScientificAssertions)
            .where(eq(pocketScientificAssertions.drugId, pgDrugId));
          await client.db
            .delete(pocketClinicalReviewerCredentials)
            .where(eq(pocketClinicalReviewerCredentials.userId, pgDoctorId));
          await client.db
            .delete(pocketDrugs)
            .where(eq(pocketDrugs.id, pgDrugId));
          await client.db
            .delete(users)
            .where(sql`id IN (${pgAdminId}, ${pgDoctorId})`);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it("executes atomic publishing in PostgreSQL, updates version registry, enqueues outbox, and supersedes previous version", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const rootId = randomUUID();
      const pgAdminActor: Actor = {
        userId: pgAdminId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      // 1. Create and verify Version 1 in PostgreSQL
      const v1 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "dosing.dopamine.renal",
        assertionType: "general_info",
        statementText: "Dopamine 2-5 mcg/kg/min IV infusion for renal vasodilation",
        drugId: pgDrugId,
        status: "verified",
      });

      await drizzleVerificationStore.createVerification({
        assertionId: v1.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified initial renal dosing protocol in PostgreSQL",
      });

      // 2. Publish Version 1 in PostgreSQL
      const pub1 = await pgPublishingService.publishAssertion(pgAdminActor, {
        assertionId: v1.id,
        notes: "V1 live in production",
      });

      expect(pub1.publishedAssertion.status).toBe("published");
      expect(pub1.entityVersion.currentVersion).toBe(1);
      expect(pub1.outboxEvent.status).toBe("pending");

      // Verify in DB directly
      const [dbV1AfterPub] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, v1.id));
      expect(dbV1AfterPub.status).toBe("published");

      const [dbRegistry] = await client.db
        .select()
        .from(pocketEntityVersionRegistry)
        .where(
          sql`aggregate_type = 'drug' AND aggregate_id = ${pgDrugId}`,
        );
      expect(Number(dbRegistry.currentVersion)).toBe(1);

      // 3. Create and verify Version 2 under same root
      const v2 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: v1.id,
        assertionKey: "dosing.dopamine.renal",
        assertionType: "general_info",
        statementText: "Dopamine 2-5 mcg/kg/min IV infusion (caution: clinical controversy exists)",
        drugId: pgDrugId,
        status: "verified",
      });

      await drizzleVerificationStore.createVerification({
        assertionId: v2.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "V2 verified with updated clinical controversy note",
      });

      // 4. Publish Version 2 in PostgreSQL
      const pub2 = await pgPublishingService.publishAssertion(pgAdminActor, {
        assertionId: v2.id,
        notes: "Superseding V1 with V2 advisory note",
      });

      expect(pub2.publishedAssertion.id).toBe(v2.id);
      expect(pub2.publishedAssertion.status).toBe("published");
      expect(pub2.supersededAssertion?.id).toBe(v1.id);
      expect(pub2.supersededAssertion?.status).toBe("superseded");
      expect(pub2.entityVersion.currentVersion).toBe(2);

      // Verify V1 in DB: status = superseded, statement text unchanged
      const [dbV1Final] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, v1.id));
      expect(dbV1Final.status).toBe("superseded");
      expect(dbV1Final.supersededAt).not.toBeNull();
      expect(dbV1Final.statementText).toBe(v1.statementText);

      // Verify V2 in DB
      const [dbV2Final] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, v2.id));
      expect(dbV2Final.status).toBe("published");

      // Verify Registry incremented to 2
      const [dbRegistryUpdated] = await client.db
        .select()
        .from(pocketEntityVersionRegistry)
        .where(
          sql`aggregate_type = 'drug' AND aggregate_id = ${pgDrugId}`,
        );
      expect(Number(dbRegistryUpdated.currentVersion)).toBe(2);

      // Verify Outbox records in PostgreSQL
      const outboxRows = await client.db
        .select()
        .from(pocketOutbox)
        .where(eq(pocketOutbox.aggregateId, pgDrugId));
      expect(outboxRows.length).toBeGreaterThanOrEqual(2);

      // Verify Audit Log entries
      const auditRows = await client.db
        .select()
        .from(pocketAssertionAuditLog)
        .where(
          sql`assertion_id IN (${v1.id}, ${v2.id})`,
        );
      const v1SupersededLog = auditRows.find(
        (l) => l.assertionId === v1.id && l.action === "superseded",
      );
      expect(v1SupersededLog).toBeDefined();

      const v2PublishedLog = auditRows.find(
        (l) => l.assertionId === v2.id && l.action === "published",
      );
      expect(v2PublishedLog).toBeDefined();
    });

    it("rolls back all changes in PostgreSQL if outbox insertion fails", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const rootId = randomUUID();
      const pgAdminActor: Actor = {
        userId: pgAdminId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      // Create and verify assertion
      const assertion = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "dosing.rollback.test",
        assertionType: "general_info",
        statementText: "Statement to test transactional rollback",
        drugId: pgDrugId,
        status: "verified",
      });

      await drizzleVerificationStore.createVerification({
        assertionId: assertion.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified for rollback test",
      });

      // Mock publishingStore to throw on outbox insertion
      const failingPublishingStore = new DrizzleAssertionPublishingStore(client.db);
      failingPublishingStore.enqueueOutboxEvent = async () => {
        throw new Error("Simulated Outbox Failure For Rollback Test");
      };

      const failingService = new AssertionPublishingService({
        publishingStore: failingPublishingStore,
        assertionStore: drizzleAssertionStore,
        verificationStore: drizzleVerificationStore,
        db: client.db,
      });

      await expect(
        failingService.publishAssertion(pgAdminActor, { assertionId: assertion.id }),
      ).rejects.toThrow("Simulated Outbox Failure For Rollback Test");

      // Verify assertion was NOT updated to published in DB (rolled back!)
      const [dbAssertionAfterFail] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, assertion.id));
      expect(dbAssertionAfterFail.status).toBe("verified"); // Still verified!

      // Verify no audit log with 'published' was committed for this assertion
      const auditLogs = await client.db
        .select()
        .from(pocketAssertionAuditLog)
        .where(eq(pocketAssertionAuditLog.assertionId, assertion.id));
      const pubLog = auditLogs.find((l) => l.action === "published");
      expect(pubLog).toBeUndefined();
    });

    it("serializes concurrent publishes of two different versions under the same assertionRootId (no prior published) leaving at most 1 published row", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const rootId = randomUUID();
      const pgAdminActor: Actor = {
        userId: pgAdminId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      const v1 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "concurrent.root.noprior",
        assertionType: "general_info",
        statementText: "Version 1 statement",
        drugId: pgDrugId,
        status: "verified",
      });
      const v2 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: v1.id,
        assertionKey: "concurrent.root.noprior",
        assertionType: "general_info",
        statementText: "Version 2 statement",
        drugId: pgDrugId,
        status: "verified",
      });

      await drizzleVerificationStore.createVerification({
        assertionId: v1.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified v1",
      });
      await drizzleVerificationStore.createVerification({
        assertionId: v2.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified v2",
      });

      const [res1, res2] = await Promise.all([
        pgPublishingService.publishAssertion(pgAdminActor, { assertionId: v1.id }),
        pgPublishingService.publishAssertion(pgAdminActor, { assertionId: v2.id }),
      ]);

      expect(res1.publishedAssertion.status).toBe("published");
      expect(res2.publishedAssertion.status).toBe("published");

      const publishedRows = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(
          sql`${pocketScientificAssertions.assertionRootId} = ${rootId} AND ${pocketScientificAssertions.status} = 'published'`,
        );
      expect(publishedRows).toHaveLength(1);

      const allRootRows = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.assertionRootId, rootId));
      const supersededRows = allRootRows.filter((r) => r.status === "superseded");
      expect(supersededRows).toHaveLength(1);
    });

    it("serializes concurrent publishes of two different versions under the same assertionRootId when a prior published version exists", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const rootId = randomUUID();
      const pgAdminActor: Actor = {
        userId: pgAdminId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      const v1 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "concurrent.root.withprior",
        assertionType: "general_info",
        statementText: "Version 1 statement",
        drugId: pgDrugId,
        status: "verified",
      });
      await drizzleVerificationStore.createVerification({
        assertionId: v1.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified v1",
      });
      await pgPublishingService.publishAssertion(pgAdminActor, { assertionId: v1.id });

      const v2 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: v1.id,
        assertionKey: "concurrent.root.withprior",
        assertionType: "general_info",
        statementText: "Version 2 statement",
        drugId: pgDrugId,
        status: "verified",
      });
      const v3 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 3,
        previousVersionId: v2.id,
        assertionKey: "concurrent.root.withprior",
        assertionType: "general_info",
        statementText: "Version 3 statement",
        drugId: pgDrugId,
        status: "verified",
      });
      await drizzleVerificationStore.createVerification({
        assertionId: v2.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified v2",
      });
      await drizzleVerificationStore.createVerification({
        assertionId: v3.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified v3",
      });

      await Promise.all([
        pgPublishingService.publishAssertion(pgAdminActor, { assertionId: v2.id }),
        pgPublishingService.publishAssertion(pgAdminActor, { assertionId: v3.id }),
      ]);

      const publishedRows = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(
          sql`${pocketScientificAssertions.assertionRootId} = ${rootId} AND ${pocketScientificAssertions.status} = 'published'`,
        );
      expect(publishedRows).toHaveLength(1);

      const allRootRows = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.assertionRootId, rootId));
      const supersededRows = allRootRows.filter((r) => r.status === "superseded");
      expect(supersededRows).toHaveLength(2);
    });

    it("publishes two different assertionRootIds concurrently without blocking one another", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const rootA = randomUUID();
      const rootB = randomUUID();
      const pgAdminActor: Actor = {
        userId: pgAdminId as Actor["userId"],
        role: "platform_admin",
        globalRole: "platform_admin",
      };

      const a1 = await drizzleAssertionStore.create({
        assertionRootId: rootA,
        versionNumber: 1,
        assertionKey: "concurrent.diffroot.a",
        assertionType: "general_info",
        statementText: "Root A statement",
        drugId: pgDrugId,
        status: "verified",
      });
      const b1 = await drizzleAssertionStore.create({
        assertionRootId: rootB,
        versionNumber: 1,
        assertionKey: "concurrent.diffroot.b",
        assertionType: "general_info",
        statementText: "Root B statement",
        drugId: pgDrugId,
        status: "verified",
      });
      await drizzleVerificationStore.createVerification({
        assertionId: a1.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified A",
      });
      await drizzleVerificationStore.createVerification({
        assertionId: b1.id,
        reviewerUserId: pgDoctorId,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Verified B",
      });

      // Hold rootA's publish advisory lock inside an open transaction while rootB publishes
      let releaseRootALock!: () => void;
      const rootALockReleased = new Promise<void>((resolve) => {
        releaseRootALock = resolve;
      });
      let rootALockAcquired!: () => void;
      const waitRootALock = new Promise<void>((resolve) => {
        rootALockAcquired = resolve;
      });

      const holdTx = client.db.transaction(async (tx) => {
        await drizzlePublishingStore.lockPublishRoot(rootA, tx);
        rootALockAcquired();
        await rootALockReleased;
      });

      await waitRootALock;

      try {
        // rootB must complete immediately even though rootA is locked!
        const bRes = await pgPublishingService.publishAssertion(pgAdminActor, { assertionId: b1.id });
        expect(bRes.publishedAssertion.status).toBe("published");
      } finally {
        releaseRootALock();
        await holdTx;
      }
    });

    it("maps PostgreSQL unique violation (23505 on uq_pocket_published_assertion_root) to a safe DomainError conflict without leaking DB internals", async (ctx) => {
      if (!isConnected || !client) {
        ctx.skip();
        return;
      }

      const rootId = randomUUID();
      const v1 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "unique.violation.test",
        assertionType: "general_info",
        statementText: "Published v1",
        drugId: pgDrugId,
        status: "published",
      });
      const v2 = await drizzleAssertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: v1.id,
        assertionKey: "unique.violation.test",
        assertionType: "general_info",
        statementText: "Verified v2 attempting direct markAssertionPublished without superseding v1",
        drugId: pgDrugId,
        status: "verified",
      });

      let caught: unknown;
      try {
        await drizzlePublishingStore.markAssertionPublished(v2.id);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect((caught as { code?: string }).code).toBe("conflict");
      const msg = (caught as { message?: string }).message ?? "";
      expect(msg).not.toContain("uq_pocket_published_assertion_root");
      expect(msg).not.toContain("pocket_scientific_assertions");
      expect(msg).not.toContain("23505");
    });
  });
});
