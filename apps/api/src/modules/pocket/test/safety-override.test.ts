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
  pocketSafetyOverrides,
  pocketEntityVersionRegistry,
  pocketOutbox,
} from "@avana/database/schema";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import { InMemorySafetyOverrideStore } from "../safety-override-store.js";
import { DrizzleSafetyOverrideStore } from "../drizzle-safety-override-store.js";
import { SafetyOverrideService } from "../safety-override-service.js";
import { pocketSafetyOverrideRoutes } from "../safety-override-routes.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";
import { resolveAssertionVerificationSummariesFromDb } from "../assertion-verification-resolver.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleAssertionPublishingStore } from "../drizzle-assertion-publishing-store.js";
import { ReviewerService } from "../reviewer-service.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";
import { AssertionPublishingService } from "../assertion-publishing-service.js";

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

describe("AVANA Pocket Phase D.3: Safety Override Management", () => {
  const adminId = randomUUID();
  const teacherId = randomUUID();
  const studentId = randomUUID();

  const adminActor: Actor = {
    userId: adminId as Actor["userId"],
    role: "platform_admin",
    globalRole: "platform_admin",
  };
  const teacherActor: Actor = {
    userId: teacherId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  describe("1. Unit Tests (In-Memory Store & Service)", () => {
    let store: InMemorySafetyOverrideStore;
    let service: SafetyOverrideService;

    beforeEach(() => {
      store = new InMemorySafetyOverrideStore();
      service = new SafetyOverrideService({ safetyOverrideStore: store });
    });

    it("activates and clears a safety override while preserving append-only events", async () => {
      const targetId = randomUUID();
      const activated = await service.activateOverride(adminActor, {
        targetEntityType: "assertion",
        targetEntityId: targetId,
        reason: "Urgent clinical safety hold",
      });

      expect(activated.override.actionState).toBe("active");
      expect(activated.override.isActive).toBe(true);
      expect(activated.override.currentEventId).toBe(activated.event.id);
      expect(activated.event.eventType).toBe("activated");
      expect(activated.event.previousState).toBeNull();
      expect(activated.event.newState).toBe("active");

      const cleared = await service.clearOverride(adminActor, {
        overrideId: activated.override.id,
        reason: "Verified safe after clinical review",
      });

      expect(cleared.override.actionState).toBe("cleared");
      expect(cleared.override.isActive).toBe(false);
      expect(cleared.override.currentEventId).toBe(cleared.event.id);
      expect(cleared.event.eventType).toBe("cleared");
      expect(cleared.event.previousState).toBe("active");
      expect(cleared.event.newState).toBe("cleared");

      const history = await service.getOverrideWithHistory(adminActor, activated.override.id);
      expect(history.events).toHaveLength(2);
      expect(history.events[0].eventType).toBe("activated");
      expect(history.events[1].eventType).toBe("cleared");
    });

    it("rejects duplicate active override (409) and clearing already-cleared override (409)", async () => {
      const targetId = randomUUID();
      const created = await service.activateOverride(adminActor, {
        targetEntityType: "drug",
        targetEntityId: targetId,
        reason: "Drug-level hold",
      });

      await expect(
        service.activateOverride(adminActor, {
          targetEntityType: "drug",
          targetEntityId: targetId,
          reason: "Duplicate hold",
        }),
      ).rejects.toMatchObject({ code: "conflict" });

      await service.clearOverride(adminActor, {
        overrideId: created.override.id,
        reason: "Cleared once",
      });

      await expect(
        service.clearOverride(adminActor, {
          overrideId: created.override.id,
          reason: "Cleared twice",
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("rejects invalid target types, invalid UUIDs, empty reasons, and unauthorized actors", async () => {
      await expect(
        service.activateOverride(teacherActor, {
          targetEntityType: "assertion",
          targetEntityId: randomUUID(),
          reason: "Non-admin attempt",
        }),
      ).rejects.toMatchObject({ code: "forbidden" });

      await expect(
        service.activateOverride(null as unknown as Actor, {
          targetEntityType: "assertion",
          targetEntityId: randomUUID(),
          reason: "Unauthenticated attempt",
        }),
      ).rejects.toMatchObject({ code: "unauthorized" });

      await expect(
        service.activateOverride(adminActor, {
          targetEntityType: "invalid_type",
          targetEntityId: randomUUID(),
          reason: "Bad type",
        }),
      ).rejects.toMatchObject({ code: "bad_request" });

      await expect(
        service.activateOverride(adminActor, {
          targetEntityType: "assertion",
          targetEntityId: "not-a-uuid",
          reason: "Bad UUID",
        }),
      ).rejects.toMatchObject({ code: "bad_request" });

      await expect(
        service.activateOverride(adminActor, {
          targetEntityType: "assertion",
          targetEntityId: randomUUID(),
          reason: "   ",
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
    });

    it("rolls back transaction when event append fails", async () => {
      let rolledBack = false;
      const mockDb = {
        transaction: async <T>(cb: (tx: unknown) => Promise<T>) => {
          try {
            return await cb({});
          } catch (err) {
            rolledBack = true;
            throw err;
          }
        },
      } as unknown as import("@avana/database/client").DbClient;

      const failingStore = Object.create(store) as InMemorySafetyOverrideStore;
      failingStore.appendEvent = async () => {
        throw new Error("Simulated event store failure");
      };

      const txService = new SafetyOverrideService({
        safetyOverrideStore: failingStore,
        db: mockDb,
      });

      await expect(
        txService.activateOverride(adminActor, {
          targetEntityType: "assertion",
          targetEntityId: randomUUID(),
          reason: "Rollback test",
        }),
      ).rejects.toThrow("Simulated event store failure");
      expect(rolledBack).toBe(true);
    });
  });

  describe("2. HTTP Route Tests (Fastify)", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      const store = new InMemorySafetyOverrideStore();
      const service = new SafetyOverrideService({ safetyOverrideStore: store });

      app = fastify({ logger: false });
      await app.register(errorHandlerPlugin);
      await app.register(pocketSafetyOverrideRoutes, {
        safetyOverrideService: service,
        sessionService: {
          validateSessionDetails: async (token: string) => {
            if (token === "token-admin") {
              return {
                valid: true,
                revoked: false,
                user: { userId: adminId, role: "platform_admin", globalRole: "platform_admin" },
              };
            }
            if (token === "token-teacher") {
              return {
                valid: true,
                revoked: false,
                user: { userId: teacherId, role: "teacher", globalRole: null },
              };
            }
            return {
              valid: true,
              revoked: false,
              user: { userId: studentId, role: "student", globalRole: null },
            };
          },
          getConfig: () => ({}),
        } as unknown as Parameters<typeof pocketSafetyOverrideRoutes>[1]["sessionService"],
        userStore: {
          findById: async (id: string) => {
            if (id === adminId) {
              return { id: adminId, email: "admin@avana.test", role: "platform_admin", globalRole: "platform_admin" };
            }
            if (id === teacherId) {
              return { id: teacherId, email: "teacher@avana.test", role: "teacher", globalRole: null };
            }
            return { id: studentId, email: "student@avana.test", role: "student", globalRole: null };
          },
        } as unknown as Parameters<typeof pocketSafetyOverrideRoutes>[1]["userStore"],
      });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it("enforces platform_admin authorization, no-store headers, and full lifecycle via HTTP", async () => {
      const targetId = randomUUID();

      // Non-admin (teacher/reviewer and student) blocked with 403
      const forbiddenActivate = await app.inject({
        method: "POST",
        url: "/v1/pocket/safety-overrides",
        headers: { authorization: "Bearer token-teacher" },
        payload: {
          targetEntityType: "assertion",
          targetEntityId: targetId,
          reason: "Unauthorized attempt",
        },
      });
      expect(forbiddenActivate.statusCode).toBe(403);

      const forbiddenList = await app.inject({
        method: "GET",
        url: "/v1/pocket/safety-overrides",
        headers: { authorization: "Bearer token-student" },
      });
      expect(forbiddenList.statusCode).toBe(403);

      // Invalid payload -> 400
      const invalidRes = await app.inject({
        method: "POST",
        url: "/v1/pocket/safety-overrides",
        headers: { authorization: "Bearer token-admin" },
        payload: {
          targetEntityType: "invalid",
          targetEntityId: targetId,
          reason: "Bad type",
        },
      });
      expect(invalidRes.statusCode).toBe(400);

      // Admin activates -> 201
      const activateRes = await app.inject({
        method: "POST",
        url: "/v1/pocket/safety-overrides",
        headers: { authorization: "Bearer token-admin" },
        payload: {
          targetEntityType: "assertion",
          targetEntityId: targetId,
          reason: "HTTP safety hold",
        },
      });
      expect(activateRes.statusCode).toBe(201);
      expect(activateRes.headers["cache-control"]).toContain("no-store");
      const activatedData = JSON.parse(activateRes.payload).data;
      const overrideId = activatedData.override.id as string;

      // Admin lists -> 200
      const listRes = await app.inject({
        method: "GET",
        url: "/v1/pocket/safety-overrides?isActive=true",
        headers: { authorization: "Bearer token-admin" },
      });
      expect(listRes.statusCode).toBe(200);
      expect(JSON.parse(listRes.payload).data.length).toBeGreaterThanOrEqual(1);

      // Admin clears -> 200
      const clearRes = await app.inject({
        method: "POST",
        url: `/v1/pocket/safety-overrides/${overrideId}/clear`,
        headers: { authorization: "Bearer token-admin" },
        payload: { reason: "Resolved via HTTP" },
      });
      expect(clearRes.statusCode).toBe(200);

      // Admin inspects history -> 200 with 2 append-only events
      const historyRes = await app.inject({
        method: "GET",
        url: `/v1/pocket/safety-overrides/${overrideId}`,
        headers: { authorization: "Bearer token-admin" },
      });
      expect(historyRes.statusCode).toBe(200);
      const historyData = JSON.parse(historyRes.payload).data;
      expect(historyData.override.actionState).toBe("cleared");
      expect(historyData.events).toHaveLength(2);
    });
  });

  describe("3. PostgreSQL Integration, Resolver & Concurrency Tests", () => {
    let client: ReturnType<typeof createDbClient>;
    let observerClient: ReturnType<typeof createDbClient>;
    let overrideStore: DrizzleSafetyOverrideStore;
    let overrideService: SafetyOverrideService;
    let reviewerStore: DrizzleReviewerStore;
    let reviewStore: DrizzleAssertionReviewStore;
    let verificationStore: DrizzleAssertionVerificationStore;
    let publishingStore: DrizzleAssertionPublishingStore;
    let reviewerService: ReviewerService;
    let verificationService: AssertionVerificationService;
    let publishingService: AssertionPublishingService;

    const pgAdminId = randomUUID();
    const pgRevId = randomUUID();
    const pgDrugId = randomUUID();
    const createdAssertionIds: string[] = [];
    const createdOverrideTargetIds: string[] = [];
    const createdUserIds: string[] = [pgAdminId, pgRevId];

    const pgAdminActor: Actor = {
      userId: pgAdminId as Actor["userId"],
      role: "platform_admin",
      globalRole: "platform_admin",
    };
    const pgRevActor: Actor = {
      userId: pgRevId as Actor["userId"],
      role: "teacher",
      globalRole: null,
    };

    async function getBackendPid(
      tx?: Parameters<DrizzleSafetyOverrideStore["findByIdForUpdate"]>[1],
    ): Promise<number> {
      const runner = tx ?? client.db;
      const res = await runner.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      return Number(res.rows[0].pid);
    }

    async function createVerifiedGeneralAssertion(status: "reviewed" | "published" = "reviewed") {
      const assertionId = randomUUID();
      await client.db.insert(pocketScientificAssertions).values({
        id: assertionId,
        assertionRootId: randomUUID(),
        versionNumber: 1,
        drugId: pgDrugId,
        assertionType: "general_info",
        assertionKey: `d3_${assertionId.slice(0, 8)}`,
        statementText: "Phase D.3 safety override test assertion",
        status: status === "published" ? "reviewed" : "reviewed",
      });
      createdAssertionIds.push(assertionId);
      createdOverrideTargetIds.push(assertionId);

      await verificationService.verifyAssertion(pgRevActor, {
        assertionId,
        clinicalReviewNotes: "Approved for D.3 test",
      });

      if (status === "published") {
        await publishingService.publishAssertion(pgAdminActor, { assertionId });
      }
      return assertionId;
    }

    beforeAll(async () => {
      const dbUrl = resolveSafePostgresTestUrl();
      client = createDbClient(dbUrl);
      observerClient = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      await observerClient.db.execute(sql`SELECT 1;`);

      overrideStore = new DrizzleSafetyOverrideStore(client.db);
      overrideService = new SafetyOverrideService({
        safetyOverrideStore: overrideStore,
        db: client.db,
      });
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
      publishingService = new AssertionPublishingService({
        publishingStore,
        assertionStore: reviewStore,
        verificationStore,
        db: client.db,
      });

      await client.db.insert(users).values([
        {
          id: pgAdminId,
          email: `d3-admin-${pgAdminId.slice(0, 8)}@avana.test`,
          name: "D3 Admin",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "platform_admin",
        },
        {
          id: pgRevId,
          email: `d3-rev-${pgRevId.slice(0, 8)}@avana.test`,
          name: "D3 Reviewer",
          passwordHash: "hash",
          role: "admin",
          emailVerified: true,
          globalRole: "user",
        },
      ]);

      await client.db.insert(pocketClinicalReviewerCredentials).values({
        userId: pgRevId,
        medicalLicenseNumber: `LIC-D3-${pgRevId.slice(0, 6)}`,
        licensingAuthority: "Council",
        specialty: "Clinical Pharmacy",
        isActive: true,
        suspendedAt: null,
        grantedBy: pgAdminId,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      await client.db.insert(pocketDrugs).values({
        id: pgDrugId,
        slug: `d3-drug-${pgDrugId.slice(0, 8)}`,
        genericNameEn: "D3 Test Drug",
        genericNameFa: "داروی ایمنی",
        drugClass: "Test",
        mechanismOfAction: "Test MOA",
        status: "published",
        publishedAt: new Date(),
      });
      createdOverrideTargetIds.push(pgDrugId);
    });

    afterAll(async () => {
      try {
        if (createdOverrideTargetIds.length > 0) {
          await client.db
            .delete(pocketSafetyOverrides)
            .where(inArray(pocketSafetyOverrides.targetEntityId, createdOverrideTargetIds));
        }
        await client.db.delete(pocketOutbox).where(eq(pocketOutbox.aggregateId, pgDrugId));
        await client.db
          .delete(pocketEntityVersionRegistry)
          .where(eq(pocketEntityVersionRegistry.aggregateId, pgDrugId));

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

        await client.db.delete(pocketDrugs).where(eq(pocketDrugs.id, pgDrugId));
        await client.db
          .delete(pocketClinicalReviewerCredentials)
          .where(inArray(pocketClinicalReviewerCredentials.userId, createdUserIds));
        await client.db.delete(users).where(inArray(users.id, createdUserIds));
      } finally {
        await observerClient.close();
        await client.close();
      }
    });

    it("1, 6, 7, 8, 9 & 10. enforces unique active override, assertion & aggregate resolution, clearing restoration, and historical preservation", async () => {
      const a1 = await createVerifiedGeneralAssertion("reviewed");
      const a2Published = await createVerifiedGeneralAssertion("published");

      // Assertion-level override on a1
      const { override: ov1 } = await overrideService.activateOverride(pgAdminActor, {
        targetEntityType: "assertion",
        targetEntityId: a1,
        reason: "Assertion-level hold",
      });

      // DB unique constraint blocks duplicate active override
      await expect(
        overrideStore.createOverride({
          targetEntityType: "assertion",
          targetEntityId: a1,
          actionState: "active",
          isActive: true,
        }),
      ).rejects.toMatchObject({ code: "conflict" });

      // Resolver blocks a1 while a2Published remains valid
      let summaries = await resolveAssertionVerificationSummariesFromDb(
        [
          { assertionId: a1, aggregateType: "drug", aggregateId: pgDrugId, assertionType: "general_info" },
          { assertionId: a2Published, aggregateType: "drug", aggregateId: pgDrugId, assertionType: "general_info" },
        ],
        client.db,
      );
      expect(summaries.get(a1)?.isClinicallyVerified).toBe(false);
      expect(summaries.get(a1)?.hasActiveSafetyOverride).toBe(true);
      expect(summaries.get(a2Published)?.isClinicallyVerified).toBe(true);

      // Clear assertion-level override -> eligibility restored & historical event preserved
      await overrideService.clearOverride(pgAdminActor, {
        overrideId: ov1.id,
        reason: "Cleared assertion-level hold",
      });
      const history1 = await overrideService.getOverrideWithHistory(pgAdminActor, ov1.id);
      expect(history1.events.map((e) => e.eventType)).toEqual(["activated", "cleared"]);

      summaries = await resolveAssertionVerificationSummariesFromDb(
        [{ assertionId: a1, aggregateType: "drug", aggregateId: pgDrugId, assertionType: "general_info" }],
        client.db,
      );
      expect(summaries.get(a1)?.isClinicallyVerified).toBe(true);
      expect(summaries.get(a1)?.hasActiveSafetyOverride).toBe(false);

      // Aggregate-level override on pgDrugId blocks BOTH a1 and a2Published, without altering published status in DB
      const { override: aggOv } = await overrideService.activateOverride(pgAdminActor, {
        targetEntityType: "drug",
        targetEntityId: pgDrugId,
        reason: "Drug-level emergency hold",
      });

      summaries = await resolveAssertionVerificationSummariesFromDb(
        [
          { assertionId: a1, aggregateType: "drug", aggregateId: pgDrugId, assertionType: "general_info" },
          { assertionId: a2Published, aggregateType: "drug", aggregateId: pgDrugId, assertionType: "general_info" },
        ],
        client.db,
      );
      expect(summaries.get(a1)?.isClinicallyVerified).toBe(false);
      expect(summaries.get(a2Published)?.isClinicallyVerified).toBe(false);
      expect(summaries.get(a2Published)?.hasActiveSafetyOverride).toBe(true);

      // Historical published status remains intact
      const [pubRow] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, a2Published));
      expect(pubRow.status).toBe("published");

      // Clear aggregate override -> restores eligibility without republishing
      await overrideService.clearOverride(pgAdminActor, {
        overrideId: aggOv.id,
        reason: "Drug hold cleared",
      });
      summaries = await resolveAssertionVerificationSummariesFromDb(
        [{ assertionId: a2Published, aggregateType: "drug", aggregateId: pgDrugId, assertionType: "general_info" }],
        client.db,
      );
      expect(summaries.get(a2Published)?.isClinicallyVerified).toBe(true);
    });

    it("2. concurrent activation requests on same target -> 1 succeeds, 1 rejects 409", async () => {
      const targetId = randomUUID();
      createdOverrideTargetIds.push(targetId);

      const results = await Promise.allSettled([
        overrideService.activateOverride(pgAdminActor, {
          targetEntityType: "assertion",
          targetEntityId: targetId,
          reason: "Concurrent activate 1",
        }),
        overrideService.activateOverride(pgAdminActor, {
          targetEntityType: "assertion",
          targetEntityId: targetId,
          reason: "Concurrent activate 2",
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "conflict" });

      const activeRows = await client.db
        .select()
        .from(pocketSafetyOverrides)
        .where(eq(pocketSafetyOverrides.targetEntityId, targetId));
      expect(activeRows).toHaveLength(1);
    });

    it("3. concurrent clearing requests serialize via FOR UPDATE (proven Lock Wait) -> 1 succeeds, 1 rejects 409", async () => {
      const targetId = randomUUID();
      createdOverrideTargetIds.push(targetId);

      const { override } = await overrideService.activateOverride(pgAdminActor, {
        targetEntityType: "assertion",
        targetEntityId: targetId,
        reason: "To be cleared concurrently",
      });

      const tx1Locked = createDeferred<number>();
      const tx2PidReady = createDeferred<number>();
      const releaseTx1 = createDeferred<void>();
      let calls = 0;

      const barrierStore = Object.create(overrideStore) as DrizzleSafetyOverrideStore;
      barrierStore.findByIdForUpdate = async (id, tx) => {
        const idx = ++calls;
        const pid = await getBackendPid(tx);
        if (idx === 1) {
          const row = await overrideStore.findByIdForUpdate(id, tx);
          tx1Locked.resolve(pid);
          await releaseTx1.promise;
          return row;
        }
        tx2PidReady.resolve(pid);
        return await overrideStore.findByIdForUpdate(id, tx);
      };

      const barrierService = new SafetyOverrideService({
        safetyOverrideStore: barrierStore,
        db: client.db,
      });

      const p1 = barrierService.clearOverride(pgAdminActor, {
        overrideId: override.id,
        reason: "Clear 1",
      });
      const tx1Pid = await tx1Locked.promise;

      const p2 = barrierService.clearOverride(pgAdminActor, {
        overrideId: override.id,
        reason: "Clear 2",
      });
      const tx2Pid = await tx2PidReady.promise;

      await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: tx2Pid,
        holderPid: tx1Pid,
        label: "D3-concurrent-clear",
      });

      releaseTx1.resolve();

      const results = await Promise.allSettled([p1, p2]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: "conflict" });

      const events = await overrideStore.listEventsByOverrideId(override.id);
      expect(events.map((e) => e.eventType)).toEqual(["activated", "cleared"]);
    });

    it("4 & 5. activation vs publishing blocks publish (409); clearing vs publishing waits on override lock and succeeds", async () => {
      // 4. Activation commits before publish reads/locks -> publish rejected with active_safety_override
      const assertionA = await createVerifiedGeneralAssertion("reviewed");
      await overrideService.activateOverride(pgAdminActor, {
        targetEntityType: "assertion",
        targetEntityId: assertionA,
        reason: "Block before publish",
      });

      await expect(
        publishingService.publishAssertion(pgAdminActor, { assertionId: assertionA }),
      ).rejects.toMatchObject({
        code: "conflict",
        details: expect.objectContaining({
          primaryBlockReason: "active_safety_override",
        }),
      });

      // 5. Clearing holds lock on override; publish waits on lock, sees cleared state, and succeeds
      const assertionB = await createVerifiedGeneralAssertion("reviewed");
      const { override: ovB } = await overrideService.activateOverride(pgAdminActor, {
        targetEntityType: "assertion",
        targetEntityId: assertionB,
        reason: "Temporary hold before clear-vs-publish race",
      });

      const clearLocked = createDeferred<number>();
      const publishPidReady = createDeferred<number>();
      const releaseClear = createDeferred<void>();

      const barrierOverrideStore = Object.create(overrideStore) as DrizzleSafetyOverrideStore;
      barrierOverrideStore.findByIdForUpdate = async (id, tx) => {
        const pid = await getBackendPid(tx);
        const row = await overrideStore.findByIdForUpdate(id, tx);
        clearLocked.resolve(pid);
        await releaseClear.promise;
        return row;
      };
      const barrierClearService = new SafetyOverrideService({
        safetyOverrideStore: barrierOverrideStore,
        db: client.db,
      });

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

      const clearPromise = barrierClearService.clearOverride(pgAdminActor, {
        overrideId: ovB.id,
        reason: "Cleared concurrently with publish",
      });
      const clearPid = await clearLocked.promise;

      const pubPromise = barrierPubService.publishAssertion(pgAdminActor, {
        assertionId: assertionB,
      });
      const pubPid = await publishPidReady.promise;

      await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: pubPid,
        holderPid: clearPid,
        label: "D3-clear-vs-publish",
      });

      releaseClear.resolve();

      await clearPromise;
      const pubRes = await pubPromise;
      expect(pubRes.publishedAssertion.status).toBe("published");
    });
  });
});
