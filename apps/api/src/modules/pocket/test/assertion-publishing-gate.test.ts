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
import { InMemoryReviewerStore } from "../reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import {
  InMemoryAssertionReviewStore,
  type ScientificAssertionRecord,
} from "../assertion-review-store.js";
import { InMemoryAssertionVerificationStore } from "../assertion-verification-store.js";
import { InMemoryAssertionPublishingStore } from "../assertion-publishing-store.js";
import { AssertionPublishingService } from "../assertion-publishing-service.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";
import { pocketAssertionPublishingRoutes } from "../assertion-publishing-routes.js";
import {
  evaluateAssertionVerificationSummary,
  type RawClinicalConflictRow,
  type RawSafetyOverrideRow,
} from "../assertion-verification-resolver.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleAssertionPublishingStore } from "../drizzle-assertion-publishing-store.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForPostgresLockWait(params: {
  observerDb: ReturnType<typeof createDbClient>["db"];
  blockedPid: number;
  holderPid: number;
  label: string;
  timeoutMs?: number;
}) {
  const { observerDb, blockedPid, holderPid, label, timeoutMs = 5000 } = params;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await observerDb.execute<{
      pid: number;
      wait_event_type: string | null;
      blocking_pids: number[] | null;
      granted: boolean | null;
    }>(sql`
      SELECT
        a.pid,
        a.wait_event_type,
        pg_blocking_pids(a.pid) AS blocking_pids,
        l.granted
      FROM pg_stat_activity a
      LEFT JOIN pg_locks l
        ON l.pid = a.pid
       AND l.granted = false
      WHERE a.pid = ${blockedPid}
    `);

    const row = res.rows[0];
    if (row) {
      const blockingPids = Array.isArray(row.blocking_pids)
        ? row.blocking_pids.map(Number)
        : [];
      if (
        row.wait_event_type === "Lock" &&
        row.granted === false &&
        blockingPids.includes(holderPid)
      ) {
        return { holderPid, blockedPid, blockingPids };
      }
    }
  }

  throw new Error(
    `[LockWaitTimeout:${label}] blockedPid=${blockedPid} did not wait on holderPid=${holderPid} within ${timeoutMs}ms`,
  );
}

describe("AVANA Pocket Phase D.2: Resolver-Based Publishing Gate", () => {
  describe("Unit & HTTP Route Gate Scenarios (1-11)", () => {
    const adminId = randomUUID();
    const rev1Id = randomUUID();
    const rev2Id = randomUUID();
    const drugId = randomUUID();

    const adminActor: Actor = {
      userId: adminId as Actor["userId"],
      role: "platform_admin",
      globalRole: "platform_admin",
    };

    let reviewerStore: InMemoryReviewerStore;
    let assertionStore: InMemoryAssertionReviewStore;
    let verificationStore: InMemoryAssertionVerificationStore;
    let publishingStore: InMemoryAssertionPublishingStore;
    let conflicts: RawClinicalConflictRow[];
    let safetyOverrides: RawSafetyOverrideRow[];
    let service: AssertionPublishingService;
    let app: FastifyInstance;

    beforeEach(async () => {
      reviewerStore = new InMemoryReviewerStore();
      const sharedAssertions = new Map<string, ScientificAssertionRecord>();
      assertionStore = new InMemoryAssertionReviewStore(sharedAssertions);
      verificationStore = new InMemoryAssertionVerificationStore();
      publishingStore = new InMemoryAssertionPublishingStore(sharedAssertions);
      conflicts = [];
      safetyOverrides = [];

      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      await reviewerStore.create({
        userId: rev1Id,
        medicalLicenseNumber: "LIC-D2-1",
        specialty: "Clinical Pharmacy",
        licensingAuthority: "Council",
        grantedBy: adminId,
        licenseExpiresAt: future,
      });
      await reviewerStore.create({
        userId: rev2Id,
        medicalLicenseNumber: "LIC-D2-2",
        specialty: "Internal Medicine",
        licensingAuthority: "Council",
        grantedBy: adminId,
        licenseExpiresAt: future,
      });

      service = new AssertionPublishingService({
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
            conflicts,
            safetyOverrides,
          });
        },
      });

      app = fastify({ logger: false });
      await app.register(errorHandlerPlugin);
      await app.register(pocketAssertionPublishingRoutes, {
        assertionPublishingService: service,
        sessionService: {
          validateSessionDetails: async (token: string) =>
            token === "token-admin"
              ? {
                  valid: true,
                  revoked: false,
                  user: { userId: adminId, role: "platform_admin", globalRole: "platform_admin" },
                }
              : { valid: false, revoked: false, user: null },
          getConfig: () => ({}),
        } as unknown as Parameters<typeof pocketAssertionPublishingRoutes>[1]["sessionService"],
        userStore: {
          findById: async (id: string) =>
            id === adminId
              ? { id: adminId, email: "admin@avana.test", role: "platform_admin", globalRole: "platform_admin" }
              : null,
        } as unknown as Parameters<typeof pocketAssertionPublishingRoutes>[1]["userStore"],
      });
      await app.ready();
    });

    it("1. publishes valid assertion with quorum = 1 (general_info)", async () => {
      const a = await assertionStore.create({
        assertionKey: "info.mechanism",
        assertionType: "general_info",
        statementText: "General info statement",
        drugId,
        status: "verified",
      });
      const v1 = await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved general info",
      });

      const res = await service.publishAssertion(adminActor, { assertionId: a.id });
      expect(res.publishedAssertion.status).toBe("published");
      expect(res.outboxEvent.payload.verificationId).toBe(v1.id);
      expect(res.outboxEvent.payload.clinicalVerifierUserId).toBe(rev1Id);
      expect(res.outboxEvent.payload.validApprovalCount).toBe(1);
      expect(res.outboxEvent.payload.requiredApprovals).toBe(1);
      expect(res.auditLog.clinicalNotes).toContain("validApprovals=1/1");
      expect(res.auditLog.clinicalNotes).toContain(v1.id);
    });

    it("2. publishes valid assertion with quorum = 2 (dosing) and records outbox + audit metadata", async () => {
      const a = await assertionStore.create({
        assertionKey: "dosing.adult",
        assertionType: "dosing",
        statementText: "Dosing statement",
        drugId,
        status: "verified",
      });
      const v1 = await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved R1",
        verifiedAt: new Date(Date.now() - 2000),
      });
      const v2 = await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev2Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved R2",
        verifiedAt: new Date(Date.now() - 1000),
      });

      const res = await service.publishAssertion(adminActor, { assertionId: a.id });
      expect(res.publishedAssertion.status).toBe("published");
      expect(res.outboxEvent.payload.verificationId).toBe(v2.id);
      expect(res.outboxEvent.payload.clinicalVerifierUserId).toBe(rev2Id);
      expect(res.outboxEvent.payload.validApprovalCount).toBe(2);
      expect(res.outboxEvent.payload.requiredApprovals).toBe(2);
      expect(res.auditLog.clinicalNotes).toContain("quorumPolicy=assertion_type:dosing");
      expect(res.auditLog.clinicalNotes).toContain("validApprovals=2/2");
      expect(res.auditLog.clinicalNotes).toContain(v1.id);
      expect(res.auditLog.clinicalNotes).toContain(v2.id);
    });

    it("3. rejects under-quorum assertion with HTTP 409 and structured block reasons", async () => {
      const a = await assertionStore.create({
        assertionKey: "dosing.under_quorum",
        assertionType: "dosing",
        statementText: "Only 1 approval on quorum=2",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Single approval",
      });

      const httpRes = await app.inject({
        method: "POST",
        url: `/v1/pocket/assertions/${a.id}/publish`,
        headers: { authorization: "Bearer token-admin" },
        payload: {},
      });
      expect(httpRes.statusCode).toBe(409);
      const body = JSON.parse(httpRes.payload);
      expect(body.error.details.verificationBlockReasons).toContain("quorum_not_met");
      expect((await assertionStore.findById(a.id))?.status).toBe("verified");
      expect(publishingStore.getOutboxEvents()).toHaveLength(0);
    });

    it("4. rejects active disagreement (rev1 approved, rev2 rejected) with 409", async () => {
      const a = await assertionStore.create({
        assertionKey: "dosing.disagree",
        assertionType: "dosing",
        statementText: "Disputed dosing",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved R1",
      });
      await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev2Id,
        verificationAction: "clinical_rejected",
        clinicalReviewNotes: "Rejected R2",
      });

      await expect(
        service.publishAssertion(adminActor, { assertionId: a.id }),
      ).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          verificationBlockReasons: expect.stringContaining("active_disagreement"),
        }),
      });
    });

    it("5. rejects when reviewer's latest vote is rejected (verify -> reject)", async () => {
      const a = await assertionStore.create({
        assertionKey: "info.withdrawn",
        assertionType: "general_info",
        statementText: "Withdrawn info",
        drugId,
        status: "verified",
      });
      const v1 = await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Initial approval",
        verifiedAt: new Date(Date.now() - 2000),
      });
      await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_rejected",
        clinicalReviewNotes: "Withdrawn approval",
        parentVerificationId: v1.id,
        verifiedAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.publishAssertion(adminActor, { assertionId: a.id }),
      ).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          verificationBlockReasons: expect.stringContaining("active_disagreement"),
        }),
      });
    });

    it("6, 7 & 8. rejects suspended, revoked, and expired reviewer credentials with 409", async () => {
      const cred1 = await reviewerStore.findActiveByUserId(rev1Id);

      // Suspended reviewer
      const aSusp = await assertionStore.create({
        assertionKey: "info.susp",
        assertionType: "general_info",
        statementText: "Suspended reviewer",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: aSusp.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved before suspension",
      });
      await reviewerStore.suspend({
        id: cred1!.id,
        suspensionReason: "Suspended",
        suspendedAt: new Date(),
      });
      await expect(
        service.publishAssertion(adminActor, { assertionId: aSusp.id }),
      ).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          primaryBlockReason: "all_approvals_invalidated",
        }),
      });

      // Revoked reviewer (rev2)
      const cred2 = await reviewerStore.findActiveByUserId(rev2Id);
      const aRev = await assertionStore.create({
        assertionKey: "info.revoked",
        assertionType: "general_info",
        statementText: "Revoked reviewer",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: aRev.id,
        reviewerUserId: rev2Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved before revocation",
      });
      await reviewerStore.revoke({ id: cred2!.id, reason: "Revoked" });
      await expect(
        service.publishAssertion(adminActor, { assertionId: aRev.id }),
      ).rejects.toMatchObject({ code: "conflict" });

      // Expired credential (rev3)
      const rev3Id = randomUUID();
      await reviewerStore.create({
        userId: rev3Id,
        medicalLicenseNumber: "LIC-EXP",
        specialty: "Pharmacy",
        licensingAuthority: "Council",
        grantedBy: adminId,
        licenseExpiresAt: new Date(Date.now() - 1000),
      });
      const aExp = await assertionStore.create({
        assertionKey: "info.expired",
        assertionType: "general_info",
        statementText: "Expired reviewer",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: aExp.id,
        reviewerUserId: rev3Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved with expired license",
      });
      await expect(
        service.publishAssertion(adminActor, { assertionId: aExp.id }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("9 & 10. rejects active clinical conflict and active safety override (assertion & aggregate)", async () => {
      const a = await assertionStore.create({
        assertionKey: "info.conflict",
        assertionType: "general_info",
        statementText: "Conflicted statement",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: a.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Approved",
      });

      // 9. Active conflict
      conflicts.push({
        id: randomUUID(),
        assertionAId: a.id,
        assertionBId: randomUUID(),
        status: "active_discrepancy",
      });
      await expect(
        service.publishAssertion(adminActor, { assertionId: a.id }),
      ).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          primaryBlockReason: "unresolved_clinical_conflict",
        }),
      });

      // Clear conflict, add assertion-level safety override
      conflicts.length = 0;
      safetyOverrides.push({
        id: randomUUID(),
        targetEntityType: "assertion",
        targetEntityId: a.id,
        actionState: "emergency_hold",
        isActive: true,
      });
      await expect(
        service.publishAssertion(adminActor, { assertionId: a.id }),
      ).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          primaryBlockReason: "active_safety_override",
        }),
      });
    });

    it("11. preserves existing published version, entityVersion, outbox, and audit when new version fails gate", async () => {
      const rootId = randomUUID();
      const v1 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 1,
        assertionKey: "dosing.preserve",
        assertionType: "general_info",
        statementText: "V1 statement",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: v1.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "V1 approved",
      });
      await service.publishAssertion(adminActor, { assertionId: v1.id });

      const v2 = await assertionStore.create({
        assertionRootId: rootId,
        versionNumber: 2,
        previousVersionId: v1.id,
        assertionKey: "dosing.preserve",
        assertionType: "dosing",
        statementText: "V2 statement under quorum",
        drugId,
        status: "verified",
      });
      await verificationStore.createVerification({
        assertionId: v2.id,
        reviewerUserId: rev1Id,
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "Only 1 approval for quorum=2",
      });

      await expect(
        service.publishAssertion(adminActor, { assertionId: v2.id }),
      ).rejects.toMatchObject({ code: "conflict" });

      const v1After = await assertionStore.findById(v1.id);
      expect(v1After?.status).toBe("published");
      expect(v1After?.supersededAt).toBeNull();
      expect(publishingStore.getEntityVersion("drug", drugId)?.currentVersion).toBe(1);
      expect(publishingStore.getOutboxEvents()).toHaveLength(1);
    });
  });

  describe("PostgreSQL Integration & Concurrency Scenarios (12-15)", () => {
    let client: ReturnType<typeof createDbClient>;
    let observerClient: ReturnType<typeof createDbClient>;
    let reviewerStore: DrizzleReviewerStore;
    let reviewStore: DrizzleAssertionReviewStore;
    let verificationStore: DrizzleAssertionVerificationStore;
    let publishingStore: DrizzleAssertionPublishingStore;
    let reviewerService: ReviewerService;
    let verificationService: AssertionVerificationService;

    const adminId = randomUUID();
    const rev1Id = randomUUID();
    const rev2Id = randomUUID();
    const drugId = randomUUID();
    const createdAssertionIds: string[] = [];
    const createdUserIds: string[] = [adminId, rev1Id, rev2Id];

    const adminActor: Actor = {
      userId: adminId as Actor["userId"],
      role: "platform_admin",
      globalRole: "platform_admin",
    };
    const rev1Actor: Actor = {
      userId: rev1Id as Actor["userId"],
      role: "teacher",
      globalRole: null,
    };
    const rev2Actor: Actor = {
      userId: rev2Id as Actor["userId"],
      role: "teacher",
      globalRole: null,
    };

    async function getBackendPid(
      tx?: Parameters<DrizzleAssertionReviewStore["findByIdForUpdate"]>[1],
    ): Promise<number> {
      const runner = tx ?? client.db;
      const res = await runner.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      return Number(res.rows[0].pid);
    }

    async function seedVerifiedDosingAssertion(rootId = randomUUID(), versionNumber = 1) {
      const assertionId = randomUUID();
      await client.db.insert(pocketScientificAssertions).values({
        id: assertionId,
        assertionRootId: rootId,
        versionNumber,
        drugId,
        assertionType: "dosing",
        assertionKey: `d2_pg_${assertionId.slice(0, 8)}`,
        statementText: "PostgreSQL D.2 publishing gate assertion",
        status: "reviewed",
      });
      createdAssertionIds.push(assertionId);

      await verificationService.verifyAssertion(rev1Actor, {
        assertionId,
        clinicalReviewNotes: "PG R1 approval",
      });
      await verificationService.verifyAssertion(rev2Actor, {
        assertionId,
        clinicalReviewNotes: "PG R2 approval",
      });
      return assertionId;
    }

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      observerClient = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      await observerClient.db.execute(sql`SELECT 1;`);

      reviewerStore = new DrizzleReviewerStore(client.db);
      reviewStore = new DrizzleAssertionReviewStore(client.db);
      verificationStore = new DrizzleAssertionVerificationStore(client.db);
      publishingStore = new DrizzleAssertionPublishingStore(client.db);
      reviewerService = new ReviewerService({ reviewerStore, db: client.db });
      verificationService = new AssertionVerificationService({
        verificationStore,
        assertionStore: reviewStore,
        reviewerService,
        db: client.db,
      });

      await client.db.insert(users).values([
        {
          id: adminId,
          email: `d2-admin-${adminId.slice(0, 8)}@avana.test`,
          name: "D2 Admin",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "platform_admin",
        },
        {
          id: rev1Id,
          email: `d2-rev1-${rev1Id.slice(0, 8)}@avana.test`,
          name: "D2 Rev1",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "user",
        },
        {
          id: rev2Id,
          email: `d2-rev2-${rev2Id.slice(0, 8)}@avana.test`,
          name: "D2 Rev2",
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
          medicalLicenseNumber: `LIC-D2-PG1-${rev1Id.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Clinical Pharmacy",
          isActive: true,
          suspendedAt: null,
          grantedBy: adminId,
          licenseExpiresAt: future,
        },
        {
          userId: rev2Id,
          medicalLicenseNumber: `LIC-D2-PG2-${rev2Id.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Internal Medicine",
          isActive: true,
          suspendedAt: null,
          grantedBy: adminId,
          licenseExpiresAt: future,
        },
      ]);

      await client.db.insert(pocketDrugs).values({
        id: drugId,
        slug: `d2-drug-${drugId.slice(0, 8)}`,
        genericNameEn: "D2 Test Drug",
        genericNameFa: "داروی تست",
        drugClass: "Test",
        mechanismOfAction: "Test MOA",
        status: "published",
        publishedAt: new Date(),
      });
    });

    afterAll(async () => {
      try {
        if (createdAssertionIds.length > 0) {
          await client.db
            .delete(pocketOutbox)
            .where(eq(pocketOutbox.aggregateId, drugId));
          await client.db
            .delete(pocketEntityVersionRegistry)
            .where(eq(pocketEntityVersionRegistry.aggregateId, drugId));
          await client.db
            .delete(pocketSafetyOverrides)
            .where(inArray(pocketSafetyOverrides.targetEntityId, [...createdAssertionIds, drugId]));
          await client.db
            .delete(pocketClinicalConflicts)
            .where(inArray(pocketClinicalConflicts.assertionAId, createdAssertionIds));

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

        await client.db.delete(pocketDrugs).where(eq(pocketDrugs.id, drugId));
        await client.db
          .delete(pocketClinicalReviewerCredentials)
          .where(inArray(pocketClinicalReviewerCredentials.userId, createdUserIds));
        await client.db.delete(users).where(inArray(users.id, createdUserIds));
      } finally {
        await observerClient.close();
        await client.close();
      }
    });

    it("12. atomically rolls back outbox, entity version, status, and audit on PostgreSQL failure", async () => {
      const assertionId = await seedVerifiedDosingAssertion();
      const [verBefore] = await client.db
        .select()
        .from(pocketEntityVersionRegistry)
        .where(eq(pocketEntityVersionRegistry.aggregateId, drugId));

      const failingReviewStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
      failingReviewStore.insertAuditLog = async () => {
        throw new Error("Simulated D.2 audit failure");
      };
      const failingService = new AssertionPublishingService({
        publishingStore,
        assertionStore: failingReviewStore,
        verificationStore,
        db: client.db,
      });

      await expect(
        failingService.publishAssertion(adminActor, { assertionId }),
      ).rejects.toThrow("Simulated D.2 audit failure");

      const [row] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, assertionId));
      expect(row.status).toBe("verified");

      const [verAfter] = await client.db
        .select()
        .from(pocketEntityVersionRegistry)
        .where(eq(pocketEntityVersionRegistry.aggregateId, drugId));
      expect(verAfter?.currentVersion ?? null).toBe(verBefore?.currentVersion ?? null);
    });

    it("13. concurrent publication attempts on the same assertion serialize via FOR UPDATE -> 1 succeeds, 1 rejects 409", async () => {
      const assertionId = await seedVerifiedDosingAssertion();

      const tx1Locked = createDeferred<number>();
      const tx2PidReady = createDeferred<number>();
      const releaseTx1 = createDeferred<void>();
      let lockCount = 0;

      const barrierPubStore = Object.create(publishingStore) as DrizzleAssertionPublishingStore;
      barrierPubStore.lockPublishRoot = async (rootId, tx) => {
        const idx = ++lockCount;
        const pid = await getBackendPid(tx);
        if (idx === 1) {
          await publishingStore.lockPublishRoot(rootId, tx);
          tx1Locked.resolve(pid);
          await releaseTx1.promise;
          return;
        }
        tx2PidReady.resolve(pid);
        return await publishingStore.lockPublishRoot(rootId, tx);
      };

      const barrierPublishingService = new AssertionPublishingService({
        publishingStore: barrierPubStore,
        assertionStore: reviewStore,
        verificationStore,
        db: client.db,
      });

      const p1 = barrierPublishingService.publishAssertion(adminActor, { assertionId });
      const tx1Pid = await tx1Locked.promise;

      const p2 = barrierPublishingService.publishAssertion(adminActor, { assertionId });
      const tx2Pid = await tx2PidReady.promise;

      await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: tx2Pid,
        holderPid: tx1Pid,
        label: "D2-concurrent-publish",
      });

      releaseTx1.resolve();

      const results = await Promise.allSettled([p1, p2]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: "conflict" });
    });

    it("14. publication racing with credential suspension: suspend holds credential lock -> publish waits and rejects 409", async () => {
      const tempRevId = randomUUID();
      createdUserIds.push(tempRevId);
      await client.db.insert(users).values({
        id: tempRevId,
        email: `d2-race-susp-${tempRevId.slice(0, 8)}@avana.test`,
        name: "D2 Race Susp",
        passwordHash: "hash",
        role: "admin",
        emailVerified: true,
        globalRole: "user",
      });
      const [cred] = await client.db
        .insert(pocketClinicalReviewerCredentials)
        .values({
          userId: tempRevId,
          medicalLicenseNumber: `LIC-D2-S-${tempRevId.slice(0, 6)}`,
          licensingAuthority: "Council",
          specialty: "Pharmacy",
          isActive: true,
          suspendedAt: null,
          grantedBy: adminId,
          licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        })
        .returning();

      const assertionId = randomUUID();
      await client.db.insert(pocketScientificAssertions).values({
        id: assertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId,
        assertionType: "general_info",
        assertionKey: `d2_susp_${assertionId.slice(0, 8)}`,
        statementText: "Publish vs suspend race assertion",
        status: "reviewed",
      });
      createdAssertionIds.push(assertionId);

      await verificationService.verifyAssertion(
        { userId: tempRevId as Actor["userId"], role: "teacher", globalRole: null },
        { assertionId, clinicalReviewNotes: "Approved before race" },
      );

      const suspendLockedCred = createDeferred<number>();
      const publishPidReady = createDeferred<number>();
      const releaseSuspend = createDeferred<void>();

      const barrierPubStore = Object.create(publishingStore) as DrizzleAssertionPublishingStore;
      barrierPubStore.lockClinicalGateInputsForPublish = async (aId, aggType, aggId, tx) => {
        const pid = await getBackendPid(tx);
        publishPidReady.resolve(pid);
        return await publishingStore.lockClinicalGateInputsForPublish(aId, aggType, aggId, tx);
      };

      const barrierPubService = new AssertionPublishingService({
        publishingStore: barrierPubStore,
        assertionStore: reviewStore,
        verificationStore,
        db: client.db,
      });

      const suspendTx = client.db.transaction(async (tx) => {
        const suspendPid = await getBackendPid(tx);
        await reviewerStore.suspend(
          {
            id: cred.id,
            suspensionReason: "Race suspension",
            suspendedAt: new Date(),
          },
          tx,
        );
        suspendLockedCred.resolve(suspendPid);
        await releaseSuspend.promise;
      });

      const suspendPid = await suspendLockedCred.promise;
      const pubPromise = barrierPubService.publishAssertion(adminActor, { assertionId });
      const pubPid = await publishPidReady.promise;

      await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: pubPid,
        holderPid: suspendPid,
        label: "D2-publish-vs-suspend",
      });

      releaseSuspend.resolve();
      await suspendTx;

      await expect(pubPromise).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          primaryBlockReason: "all_approvals_invalidated",
        }),
      });

      const [row] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, assertionId));
      expect(row.status).toBe("verified");
    });

    it("15. publication racing with a new rejection: reject holds assertion lock -> publish waits and rejects 409", async () => {
      const assertionId = await seedVerifiedDosingAssertion();

      const rejectLockedAssertion = createDeferred<number>();
      const publishPidReady = createDeferred<number>();
      const releaseReject = createDeferred<void>();

      const barrierVerifStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
      barrierVerifStore.findByIdForUpdate = async (id, tx) => {
        const pid = await getBackendPid(tx);
        const row = await reviewStore.findByIdForUpdate(id, tx);
        rejectLockedAssertion.resolve(pid);
        await releaseReject.promise;
        return row;
      };

      const barrierPubStore = Object.create(publishingStore) as DrizzleAssertionPublishingStore;
      barrierPubStore.lockRootAssertionsForUpdate = async (rootId, tx) => {
        const pid = await getBackendPid(tx);
        publishPidReady.resolve(pid);
        return await publishingStore.lockRootAssertionsForUpdate(rootId, tx);
      };

      const barrierVerifService = new AssertionVerificationService({
        verificationStore,
        assertionStore: barrierVerifStore,
        reviewerService,
        db: client.db,
      });
      const barrierPubService = new AssertionPublishingService({
        publishingStore: barrierPubStore,
        assertionStore: reviewStore,
        verificationStore,
        db: client.db,
      });

      const rejectPromise = barrierVerifService.rejectAssertionVerification(rev2Actor, {
        assertionId,
        clinicalReviewNotes: "Late rejection racing with publish",
      });
      const rejectPid = await rejectLockedAssertion.promise;

      const pubPromise = barrierPubService.publishAssertion(adminActor, { assertionId });
      const pubPid = await publishPidReady.promise;

      await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: pubPid,
        holderPid: rejectPid,
        label: "D2-publish-vs-reject",
      });

      releaseReject.resolve();
      await rejectPromise;

      await expect(pubPromise).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          verificationBlockReasons: expect.stringContaining("active_disagreement"),
        }),
      });

      const [row] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, assertionId));
      expect(row.status).toBe("verified");
    });
  });
});
