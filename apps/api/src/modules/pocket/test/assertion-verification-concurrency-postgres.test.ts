/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq, inArray } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import type { Actor } from "@avana/domain";
import {
  users,
  pocketDrugs,
  pocketScientificAssertions,
  pocketAssertionAuditLog,
  pocketAssertionVerifications,
  pocketClinicalReviewerCredentials,
} from "@avana/database/schema";
import { DrizzleAssertionVerificationStore } from "../drizzle-assertion-verification-store.js";
import { DrizzleAssertionReviewStore } from "../drizzle-assertion-review-store.js";
import { DrizzleReviewerStore } from "../drizzle-reviewer-store.js";
import { ReviewerService } from "../reviewer-service.js";
import { AssertionVerificationService } from "../assertion-verification-service.js";
import { evaluateAssertionVerificationSummary } from "../assertion-verification-resolver.js";
import { resolveSafePostgresTestUrl } from "../../../test/pg-test-guard.js";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface LockWaitEvidence {
  holderPid: number;
  blockedPid: number;
  waitEventType: string;
  waitEvent: string | null;
  blockingPids: number[];
  lockType: string | null;
  lockMode: string | null;
  relationName: string | null;
}

/**
 * Observes PostgreSQL `pg_stat_activity` and `pg_locks` from an independent
 * observer connection until `blockedPid` is genuinely waiting on a lock held
 * by `holderPid`. Uses real DB queries (no sleep/setTimeout) with a bounded
 * protective timeout and rich diagnostic output on timeout.
 */
async function waitForPostgresLockWait(params: {
  observerDb: ReturnType<typeof createDbClient>["db"];
  blockedPid: number;
  holderPid: number;
  label: string;
  timeoutMs?: number;
}): Promise<LockWaitEvidence> {
  const { observerDb, blockedPid, holderPid, label, timeoutMs = 5000 } = params;
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot: unknown = null;

  while (Date.now() < deadline) {
    const res = await observerDb.execute<{
      pid: number;
      state: string | null;
      wait_event_type: string | null;
      wait_event: string | null;
      blocking_pids: number[] | null;
      locktype: string | null;
      mode: string | null;
      granted: boolean | null;
      relation_name: string | null;
    }>(sql`
      SELECT
        a.pid,
        a.state,
        a.wait_event_type,
        a.wait_event,
        pg_blocking_pids(a.pid) AS blocking_pids,
        l.locktype,
        l.mode,
        l.granted,
        l.relation::regclass::text AS relation_name
      FROM pg_stat_activity a
      LEFT JOIN pg_locks l
        ON l.pid = a.pid
       AND l.granted = false
      WHERE a.pid = ${blockedPid}
    `);

    const row = res.rows[0];
    lastSnapshot = row ?? null;

    if (row) {
      const blockingPids = Array.isArray(row.blocking_pids)
        ? row.blocking_pids.map(Number)
        : [];
      const isWaitingOnHolder =
        row.wait_event_type === "Lock" &&
        row.granted === false &&
        blockingPids.includes(holderPid);

      if (isWaitingOnHolder) {
        return {
          holderPid,
          blockedPid,
          waitEventType: row.wait_event_type,
          waitEvent: row.wait_event,
          blockingPids,
          lockType: row.locktype,
          lockMode: row.mode,
          relationName: row.relation_name,
        };
      }
    }
  }

  const locksRes = await observerDb.execute(sql`
    SELECT pid, locktype, mode, granted, relation::regclass::text AS relation_name
    FROM pg_locks
    WHERE pid IN (${holderPid}, ${blockedPid})
  `);

  throw new Error(
    `[LockWaitTimeout:${label}] Timed out after ${timeoutMs}ms waiting for blockedPid=${blockedPid} to wait on holderPid=${holderPid}. ` +
      `lastActivity=${JSON.stringify(lastSnapshot)} locks=${JSON.stringify(locksRes.rows)}`,
  );
}

describe("AVANA Pocket Phase C.2.4: PostgreSQL Concurrency Verification", () => {
  let client: ReturnType<typeof createDbClient>;
  let observerClient: ReturnType<typeof createDbClient>;
  let verificationStore: DrizzleAssertionVerificationStore;
  let reviewStore: DrizzleAssertionReviewStore;
  let reviewerStore: DrizzleReviewerStore;
  let reviewerService: ReviewerService;
  let verificationService: AssertionVerificationService;

  const adminId = randomUUID();
  const reviewerAId = randomUUID();
  const reviewerBId = randomUUID();
  const drugId = randomUUID();
  const createdAssertionIds: string[] = [];
  const createdUserIds: string[] = [adminId, reviewerAId, reviewerBId];

  const adminActor: Actor = {
    userId: adminId as Actor["userId"],
    role: "platform_admin",
    globalRole: "platform_admin",
  };
  const actorA: Actor = {
    userId: reviewerAId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };
  const actorB: Actor = {
    userId: reviewerBId as Actor["userId"],
    role: "teacher",
    globalRole: null,
  };

  async function createTestAssertion(status: "reviewed" | "verified" = "reviewed"): Promise<string> {
    const assertionId = randomUUID();
    await client.db.insert(pocketScientificAssertions).values({
      id: assertionId,
      assertionRootId: randomUUID(),
      versionNumber: 1,
      drugId,
      assertionType: "dosing",
      assertionKey: `c24_${assertionId.slice(0, 8)}`,
      statementText: "Concurrency verification test assertion.",
      status,
    });
    createdAssertionIds.push(assertionId);
    return assertionId;
  }

  async function getBackendPid(tx?: Parameters<DrizzleAssertionReviewStore["findByIdForUpdate"]>[1]): Promise<number> {
    const runner = tx ?? client.db;
    const res = await runner.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
    return Number(res.rows[0].pid);
  }

  async function inspectChainIntegrityForAssertions(assertionIds: string[]) {
    const verifs = await client.db
      .select()
      .from(pocketAssertionVerifications)
      .where(inArray(pocketAssertionVerifications.assertionId, assertionIds));

    const byId = new Map(verifs.map((v) => [v.id, v]));
    const childCounts = new Map<string, number>();
    const rootCounts = new Map<string, number>();

    for (const v of verifs) {
      if (v.parentVerificationId === null) {
        const key = `${v.assertionId}:${v.reviewerUserId}`;
        rootCounts.set(key, (rootCounts.get(key) ?? 0) + 1);
      } else {
        expect(v.parentVerificationId).not.toBe(v.id); // No self-reference
        const parent = byId.get(v.parentVerificationId);
        expect(parent).toBeDefined(); // No orphan
        expect(parent!.assertionId).toBe(v.assertionId); // Same assertion
        expect(parent!.reviewerUserId).toBe(v.reviewerUserId); // No cross-reviewer parent
        childCounts.set(v.parentVerificationId, (childCounts.get(v.parentVerificationId) ?? 0) + 1);
      }
    }

    for (const count of childCounts.values()) {
      expect(count).toBeLessThanOrEqual(1); // Zero forks
    }
    for (const count of rootCounts.values()) {
      expect(count).toBeLessThanOrEqual(1); // Zero multi-roots
    }
    return verifs;
  }

  beforeAll(async () => {
    const dbUrl = resolveSafePostgresTestUrl();
    client = createDbClient(dbUrl);
    observerClient = createDbClient(dbUrl);
    await client.db.execute(sql`SELECT 1;`);
    await observerClient.db.execute(sql`SELECT 1;`);

    verificationStore = new DrizzleAssertionVerificationStore(client.db);
    reviewStore = new DrizzleAssertionReviewStore(client.db);
    reviewerStore = new DrizzleReviewerStore(client.db);
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
        email: `c24-admin-${adminId.slice(0, 8)}@avana.test`,
        name: "C24 Admin",
        passwordHash: "hash",
        role: "admin",
        emailVerified: true,
        globalRole: "platform_admin",
      },
      {
        id: reviewerAId,
        email: `c24-revA-${reviewerAId.slice(0, 8)}@avana.test`,
        name: "C24 Reviewer A",
        passwordHash: "hash",
        role: "admin",
        emailVerified: true,
        globalRole: "user",
      },
      {
        id: reviewerBId,
        email: `c24-revB-${reviewerBId.slice(0, 8)}@avana.test`,
        name: "C24 Reviewer B",
        passwordHash: "hash",
        role: "admin",
        emailVerified: true,
        globalRole: "user",
      },
    ]);

    const futureExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await client.db.insert(pocketClinicalReviewerCredentials).values([
      {
        userId: reviewerAId,
        medicalLicenseNumber: `LIC-C24-A-${reviewerAId.slice(0, 6)}`,
        licensingAuthority: "Council",
        specialty: "Clinical Pharmacy",
        isActive: true,
        suspendedAt: null,
        grantedBy: adminId,
        licenseExpiresAt: futureExpiry,
      },
      {
        userId: reviewerBId,
        medicalLicenseNumber: `LIC-C24-B-${reviewerBId.slice(0, 6)}`,
        licensingAuthority: "Council",
        specialty: "Internal Medicine",
        isActive: true,
        suspendedAt: null,
        grantedBy: adminId,
        licenseExpiresAt: futureExpiry,
      },
    ]);

    await client.db.insert(pocketDrugs).values({
      id: drugId,
      slug: `c24-drug-${drugId.slice(0, 8)}`,
      genericNameEn: `C24 Drug ${drugId.slice(0, 8)}`,
      genericNameFa: "داروی همزمانی",
      drugClass: "Test Class",
      mechanismOfAction: "Test MOA",
      status: "published",
      publishedAt: new Date(),
    });
  });

  afterAll(async () => {
    try {
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

      await client.db
        .delete(pocketDrugs)
        .where(eq(pocketDrugs.id, drugId));
      await client.db
        .delete(pocketClinicalReviewerCredentials)
        .where(inArray(pocketClinicalReviewerCredentials.userId, createdUserIds))
        .catch(() => {});
      await client.db
        .delete(users)
        .where(inArray(users.id, createdUserIds))
        .catch(() => {});
    } finally {
      await observerClient.close();
      await client.close();
    }
  });

  it("Scenario 1A: two concurrent identical verify requests from same reviewer (3 rounds, proven PostgreSQL Lock Wait) -> 1 succeeds, 1 rejects 409", async () => {
    for (let round = 0; round < 3; round++) {
      const assertionId = await createTestAssertion("reviewed");

      const tx1LockedAssertion = createDeferred<number>();
      const tx2PidReady = createDeferred<number>();
      const releaseTx1 = createDeferred<void>();
      let lockAcquireCount = 0;

      const barrierReviewStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
      barrierReviewStore.findByIdForUpdate = async (id, tx) => {
        const callIndex = ++lockAcquireCount;
        const pid = await getBackendPid(tx);
        if (callIndex === 1) {
          const row = await reviewStore.findByIdForUpdate(id, tx);
          tx1LockedAssertion.resolve(pid);
          await releaseTx1.promise;
          return row;
        }
        tx2PidReady.resolve(pid);
        return await reviewStore.findByIdForUpdate(id, tx);
      };

      const barrierService = new AssertionVerificationService({
        verificationStore,
        assertionStore: barrierReviewStore,
        reviewerService,
        db: client.db,
      });

      const p1 = barrierService.verifyAssertion(actorA, {
        assertionId,
        clinicalReviewNotes: `Identical concurrent note round ${round}`,
      });
      const tx1Pid = await tx1LockedAssertion.promise;

      const p2 = barrierService.verifyAssertion(actorA, {
        assertionId,
        clinicalReviewNotes: `Identical concurrent note round ${round}`,
      });
      const tx2Pid = await tx2PidReady.promise;
      expect(tx2Pid).not.toBe(tx1Pid);

      const evidence = await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: tx2Pid,
        holderPid: tx1Pid,
        label: `1A-round-${round}`,
      });
      expect(evidence.waitEventType).toBe("Lock");
      expect(evidence.blockingPids).toContain(tx1Pid);

      releaseTx1.resolve();

      const results = await Promise.allSettled([p1, p2]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
      expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: "conflict" });

      const verifs = await inspectChainIntegrityForAssertions([assertionId]);
      expect(verifs).toHaveLength(1);
      expect(verifs[0].parentVerificationId).toBeNull();

      const audits = await client.db
        .select()
        .from(pocketAssertionAuditLog)
        .where(eq(pocketAssertionAuditLog.assertionId, assertionId));
      expect(audits).toHaveLength(1);
    }
  });

  it("Scenario 1B: two concurrent distinct votes (verify + reject) from same reviewer (3 rounds, proven PostgreSQL Lock Wait) -> linear chain A1 -> A2", async () => {
    for (let round = 0; round < 3; round++) {
      const assertionId = await createTestAssertion("reviewed");

      const tx1LockedAssertion = createDeferred<number>();
      const tx2PidReady = createDeferred<number>();
      const releaseTx1 = createDeferred<void>();
      let lockAcquireCount = 0;

      const barrierReviewStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
      barrierReviewStore.findByIdForUpdate = async (id, tx) => {
        const callIndex = ++lockAcquireCount;
        const pid = await getBackendPid(tx);
        if (callIndex === 1) {
          const row = await reviewStore.findByIdForUpdate(id, tx);
          tx1LockedAssertion.resolve(pid);
          await releaseTx1.promise;
          return row;
        }
        tx2PidReady.resolve(pid);
        return await reviewStore.findByIdForUpdate(id, tx);
      };

      const barrierService = new AssertionVerificationService({
        verificationStore,
        assertionStore: barrierReviewStore,
        reviewerService,
        db: client.db,
      });

      const p1 = barrierService.verifyAssertion(actorA, {
        assertionId,
        clinicalReviewNotes: `Distinct vote A1 round ${round}`,
      });
      const tx1Pid = await tx1LockedAssertion.promise;

      const p2 = barrierService.rejectAssertionVerification(actorA, {
        assertionId,
        clinicalReviewNotes: `Distinct vote A2 round ${round}`,
      });
      const tx2Pid = await tx2PidReady.promise;
      expect(tx2Pid).not.toBe(tx1Pid);

      const evidence = await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: tx2Pid,
        holderPid: tx1Pid,
        label: `1B-round-${round}`,
      });
      expect(evidence.waitEventType).toBe("Lock");
      expect(evidence.blockingPids).toContain(tx1Pid);

      releaseTx1.resolve();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.verification.parentVerificationId).toBeNull();
      expect(r2.verification.parentVerificationId).toBe(r1.verification.id);
      expect(r2.verification.verifiedAt.getTime()).toBeGreaterThan(
        r1.verification.verifiedAt.getTime(),
      );

      const verifs = await inspectChainIntegrityForAssertions([assertionId]);
      expect(verifs).toHaveLength(2);

      const latest = await verificationStore.findLatestVerificationByReviewerAndAssertion(
        reviewerAId,
        assertionId,
      );
      expect(latest?.id).toBe(r2.verification.id);
      expect(latest?.verificationAction).toBe("clinical_rejected");

      const audits = await client.db
        .select()
        .from(pocketAssertionAuditLog)
        .where(eq(pocketAssertionAuditLog.assertionId, assertionId));
      expect(audits).toHaveLength(2);
    }
  });

  it("Scenario 2: two independent reviewers A and B vote concurrently (3 rounds, proven Assertion Lock Wait serialization) -> two independent roots A1, B1", async () => {
    for (let round = 0; round < 3; round++) {
      const assertionId = await createTestAssertion("reviewed");

      const txALockedAssertion = createDeferred<number>();
      const txBPidReady = createDeferred<number>();
      const releaseTxA = createDeferred<void>();
      let lockAcquireCount = 0;

      const barrierReviewStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
      barrierReviewStore.findByIdForUpdate = async (id, tx) => {
        const callIndex = ++lockAcquireCount;
        const pid = await getBackendPid(tx);
        if (callIndex === 1) {
          const row = await reviewStore.findByIdForUpdate(id, tx);
          txALockedAssertion.resolve(pid);
          await releaseTxA.promise;
          return row;
        }
        txBPidReady.resolve(pid);
        return await reviewStore.findByIdForUpdate(id, tx);
      };

      const barrierService = new AssertionVerificationService({
        verificationStore,
        assertionStore: barrierReviewStore,
        reviewerService,
        db: client.db,
      });

      const pA = barrierService.verifyAssertion(actorA, {
        assertionId,
        clinicalReviewNotes: `Independent A round ${round}`,
      });
      const txAPid = await txALockedAssertion.promise;

      const pB = barrierService.verifyAssertion(actorB, {
        assertionId,
        clinicalReviewNotes: `Independent B round ${round}`,
      });
      const txBPid = await txBPidReady.promise;
      expect(txBPid).not.toBe(txAPid);

      const evidence = await waitForPostgresLockWait({
        observerDb: observerClient.db,
        blockedPid: txBPid,
        holderPid: txAPid,
        label: `2-round-${round}`,
      });
      expect(evidence.waitEventType).toBe("Lock");
      expect(evidence.blockingPids).toContain(txAPid);

      releaseTxA.resolve();

      const [resA, resB] = await Promise.all([pA, pB]);
      expect(resA.verification.parentVerificationId).toBeNull();
      expect(resB.verification.parentVerificationId).toBeNull();

      const verifs = await inspectChainIntegrityForAssertions([assertionId]);
      expect(verifs).toHaveLength(2);

      const [assertionRow] = await client.db
        .select()
        .from(pocketScientificAssertions)
        .where(eq(pocketScientificAssertions.id, assertionId));
      expect(assertionRow.status).toBe("verified");

      const audits = await client.db
        .select()
        .from(pocketAssertionAuditLog)
        .where(eq(pocketAssertionAuditLog.assertionId, assertionId));
      expect(audits).toHaveLength(2);

      const credA = await reviewerStore.findActiveByUserId(reviewerAId);
      const credB = await reviewerStore.findActiveByUserId(reviewerBId);
      const summary = evaluateAssertionVerificationSummary({
        context: {
          assertionId,
          assertionType: "dosing",
          aggregateType: "drug",
          aggregateId: drugId,
        },
        verifications: verifs.map((v) => ({
          id: v.id,
          assertionId: v.assertionId,
          reviewerUserId: v.reviewerUserId,
          verificationAction: v.verificationAction,
          verifiedAt: v.verifiedAt,
        })),
        credentials: [credA!, credB!],
        conflicts: [],
        safetyOverrides: [],
      });

      expect(summary.validApprovalCount).toBe(2);
      expect(summary.quorumSatisfied).toBe(true);
      expect(summary.isClinicallyVerified).toBe(true);
    }
  });

  it("Scenario 3A: Vote acquires credential lock first, Suspend genuinely waits on Credential Lock in PostgreSQL, then commits in order", async () => {
    const tempRevId = randomUUID();
    createdUserIds.push(tempRevId);
    await client.db.insert(users).values({
      id: tempRevId,
      email: `c24-3a-${tempRevId.slice(0, 8)}@avana.test`,
      name: "C24 Temp 3A",
      passwordHash: "hash",
      role: "admin",
      emailVerified: true,
      globalRole: "user",
    });
    const [cred] = await client.db
      .insert(pocketClinicalReviewerCredentials)
      .values({
        userId: tempRevId,
        medicalLicenseNumber: `LIC-3A-${tempRevId.slice(0, 6)}`,
        licensingAuthority: "Council",
        specialty: "Clinical Pharmacy",
        isActive: true,
        suspendedAt: null,
        grantedBy: adminId,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const assertionId = await createTestAssertion("reviewed");
    const voteLockedCred = createDeferred<number>();
    const suspendPidReady = createDeferred<number>();
    const releaseVote = createDeferred<void>();
    const commitOrder: string[] = [];

    const barrierReviewerStore = Object.create(reviewerStore) as DrizzleReviewerStore;
    barrierReviewerStore.findActiveByUserIdForUpdate = async (uid, tx) => {
      const votePid = await getBackendPid(tx);
      const row = await reviewerStore.findActiveByUserIdForUpdate(uid, tx);
      voteLockedCred.resolve(votePid);
      await releaseVote.promise;
      return row;
    };
    barrierReviewerStore.findByIdForUpdate = async (id, tx) => {
      const suspendPid = await getBackendPid(tx);
      suspendPidReady.resolve(suspendPid);
      return await reviewerStore.findByIdForUpdate(id, tx);
    };

    const barrierReviewerService = new ReviewerService({
      reviewerStore: barrierReviewerStore,
      db: client.db,
    });
    const barrierVerificationService = new AssertionVerificationService({
      verificationStore,
      assertionStore: reviewStore,
      reviewerService: barrierReviewerService,
      db: client.db,
    });

    const votePromise = barrierVerificationService
      .verifyAssertion(
        { userId: tempRevId as Actor["userId"], role: "teacher", globalRole: null },
        { assertionId, clinicalReviewNotes: "Vote before suspend commits" },
      )
      .then((res) => {
        commitOrder.push("vote");
        return res;
      });

    const votePid = await voteLockedCred.promise;

    const suspendPromise = barrierReviewerService
      .suspendCredential(adminActor, {
        credentialId: cred.id,
        reason: "Concurrent suspension after vote lock",
      })
      .then((res) => {
        commitOrder.push("suspend");
        return res;
      });

    const suspendPid = await suspendPidReady.promise;
    expect(suspendPid).not.toBe(votePid);

    const evidence = await waitForPostgresLockWait({
      observerDb: observerClient.db,
      blockedPid: suspendPid,
      holderPid: votePid,
      label: "3A-vote-before-suspend",
    });
    expect(evidence.waitEventType).toBe("Lock");
    expect(evidence.blockingPids).toContain(votePid);

    releaseVote.resolve();

    const [voteRes, suspendedCred] = await Promise.all([votePromise, suspendPromise]);
    expect(commitOrder).toEqual(["vote", "suspend"]);
    expect(voteRes.verification.verificationAction).toBe("clinical_verified");
    expect(suspendedCred.suspendedAt).not.toBeNull();

    const verifs = await inspectChainIntegrityForAssertions([assertionId]);
    expect(verifs).toHaveLength(1);
    const audits = await client.db
      .select()
      .from(pocketAssertionAuditLog)
      .where(eq(pocketAssertionAuditLog.assertionId, assertionId));
    expect(audits).toHaveLength(1);

    const summary = evaluateAssertionVerificationSummary({
      context: {
        assertionId,
        assertionType: "dosing",
        aggregateType: "drug",
        aggregateId: drugId,
      },
      verifications: verifs.map((v) => ({
        id: v.id,
        assertionId: v.assertionId,
        reviewerUserId: v.reviewerUserId,
        verificationAction: v.verificationAction,
        verifiedAt: v.verifiedAt,
      })),
      credentials: [suspendedCred],
      conflicts: [],
      safetyOverrides: [],
    });
    expect(summary.validApprovalCount).toBe(0);
    expect(summary.isClinicallyVerified).toBe(false);
  });

  it("Scenario 3B: Suspend acquires credential lock first, Vote genuinely waits on Credential Lock in PostgreSQL, then sees suspended credential and rejects 403", async () => {
    const tempRevId = randomUUID();
    createdUserIds.push(tempRevId);
    await client.db.insert(users).values({
      id: tempRevId,
      email: `c24-3b-${tempRevId.slice(0, 8)}@avana.test`,
      name: "C24 Temp 3B",
      passwordHash: "hash",
      role: "admin",
      emailVerified: true,
      globalRole: "user",
    });
    const [cred] = await client.db
      .insert(pocketClinicalReviewerCredentials)
      .values({
        userId: tempRevId,
        medicalLicenseNumber: `LIC-3B-${tempRevId.slice(0, 6)}`,
        licensingAuthority: "Council",
        specialty: "Clinical Pharmacy",
        isActive: true,
        suspendedAt: null,
        grantedBy: adminId,
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const assertionId = await createTestAssertion("reviewed");
    const suspendLockedCred = createDeferred<number>();
    const votePidReady = createDeferred<number>();
    const releaseSuspend = createDeferred<void>();
    const finishOrder: string[] = [];

    const barrierReviewerStore = Object.create(reviewerStore) as DrizzleReviewerStore;
    barrierReviewerStore.findActiveByUserIdForUpdate = async (uid, tx) => {
      const votePid = await getBackendPid(tx);
      votePidReady.resolve(votePid);
      return await reviewerStore.findActiveByUserIdForUpdate(uid, tx);
    };

    const barrierReviewerService = new ReviewerService({
      reviewerStore: barrierReviewerStore,
      db: client.db,
    });
    const barrierVerificationService = new AssertionVerificationService({
      verificationStore,
      assertionStore: reviewStore,
      reviewerService: barrierReviewerService,
      db: client.db,
    });

    const suspendTxPromise = client.db
      .transaction(async (tx) => {
        const suspendPid = await getBackendPid(tx);
        await reviewerStore.suspend(
          {
            id: cred.id,
            suspensionReason: "Concurrent suspend holds lock first",
            suspendedAt: new Date(),
          },
          tx,
        );
        suspendLockedCred.resolve(suspendPid);
        await releaseSuspend.promise;
      })
      .then(() => {
        finishOrder.push("suspend_commit");
      });

    const suspendPid = await suspendLockedCred.promise;

    const votePromise = barrierVerificationService
      .verifyAssertion(
        { userId: tempRevId as Actor["userId"], role: "teacher", globalRole: null },
        { assertionId, clinicalReviewNotes: "Vote must see suspended cred and fail 403" },
      )
      .catch((err) => {
        finishOrder.push("vote_rejected");
        throw err;
      });

    const votePid = await votePidReady.promise;
    expect(votePid).not.toBe(suspendPid);

    const evidence = await waitForPostgresLockWait({
      observerDb: observerClient.db,
      blockedPid: votePid,
      holderPid: suspendPid,
      label: "3B-suspend-before-vote",
    });
    expect(evidence.waitEventType).toBe("Lock");
    expect(evidence.blockingPids).toContain(suspendPid);

    releaseSuspend.resolve();

    await suspendTxPromise;
    await expect(votePromise).rejects.toMatchObject({ code: "forbidden" });
    expect(finishOrder).toEqual(["suspend_commit", "vote_rejected"]);

    const verifs = await inspectChainIntegrityForAssertions([assertionId]);
    expect(verifs).toHaveLength(0);
    const audits = await client.db
      .select()
      .from(pocketAssertionAuditLog)
      .where(eq(pocketAssertionAuditLog.assertionId, assertionId));
    expect(audits).toHaveLength(0);
  });

  it("Scenario 4: two concurrent requests with identical stale parent (A1) -> proven Lock Wait, 1 commits A2, 2nd rejects 409", async () => {
    const assertionId = await createTestAssertion("reviewed");
    const root = await verificationService.verifyAssertion(actorA, {
      assertionId,
      clinicalReviewNotes: "Root A1",
    });

    const tx1LockedAssertion = createDeferred<number>();
    const tx2PidReady = createDeferred<number>();
    const releaseTx1 = createDeferred<void>();
    let lockAcquireCount = 0;

    const barrierReviewStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
    barrierReviewStore.findByIdForUpdate = async (id, tx) => {
      const callIndex = ++lockAcquireCount;
      const pid = await getBackendPid(tx);
      if (callIndex === 1) {
        const row = await reviewStore.findByIdForUpdate(id, tx);
        tx1LockedAssertion.resolve(pid);
        await releaseTx1.promise;
        return row;
      }
      tx2PidReady.resolve(pid);
      return await reviewStore.findByIdForUpdate(id, tx);
    };

    const barrierService = new AssertionVerificationService({
      verificationStore,
      assertionStore: barrierReviewStore,
      reviewerService,
      db: client.db,
    });

    const p1 = barrierService.rejectAssertionVerification(actorA, {
      assertionId,
      clinicalReviewNotes: "Concurrent reject with parent A1 (1)",
      parentVerificationId: root.verification.id,
    });
    const tx1Pid = await tx1LockedAssertion.promise;

    const p2 = barrierService.rejectAssertionVerification(actorA, {
      assertionId,
      clinicalReviewNotes: "Concurrent reject with parent A1 (2)",
      parentVerificationId: root.verification.id,
    });
    const tx2Pid = await tx2PidReady.promise;
    expect(tx2Pid).not.toBe(tx1Pid);

    const evidence = await waitForPostgresLockWait({
      observerDb: observerClient.db,
      blockedPid: tx2Pid,
      holderPid: tx1Pid,
      label: "4-stale-parent",
    });
    expect(evidence.waitEventType).toBe("Lock");
    expect(evidence.blockingPids).toContain(tx1Pid);

    releaseTx1.resolve();

    const results = await Promise.allSettled([p1, p2]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: "conflict" });

    const verifs = await inspectChainIntegrityForAssertions([assertionId]);
    expect(verifs).toHaveLength(2);
    const child = verifs.find((v) => v.parentVerificationId !== null);
    expect(child?.parentVerificationId).toBe(root.verification.id);
  });

  it("Scenario 5: rapid sequential vote changes produce strictly ascending verifiedAt and Resolver picks true latest vote", async () => {
    const assertionId = await createTestAssertion("reviewed");

    const v1 = await verificationService.verifyAssertion(actorA, {
      assertionId,
      clinicalReviewNotes: "Step 1 verify",
    });
    const v2 = await verificationService.rejectAssertionVerification(actorA, {
      assertionId,
      clinicalReviewNotes: "Step 2 reject",
    });
    const v3 = await verificationService.verifyAssertion(actorA, {
      assertionId,
      clinicalReviewNotes: "Step 3 verify",
    });
    const v4 = await verificationService.rejectAssertionVerification(actorA, {
      assertionId,
      clinicalReviewNotes: "Step 4 reject",
    });
    const v5 = await verificationService.verifyAssertion(actorA, {
      assertionId,
      clinicalReviewNotes: "Step 5 final verify",
    });

    const chain = [v1.verification, v2.verification, v3.verification, v4.verification, v5.verification];
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].parentVerificationId).toBe(chain[i - 1].id);
      expect(chain[i].verifiedAt.getTime()).toBeGreaterThan(chain[i - 1].verifiedAt.getTime());
    }

    const verifs = await inspectChainIntegrityForAssertions([assertionId]);
    expect(verifs).toHaveLength(5);

    const credA = await reviewerStore.findActiveByUserId(reviewerAId);
    const summary = evaluateAssertionVerificationSummary({
      context: {
        assertionId,
        assertionType: "dosing",
        aggregateType: "drug",
        aggregateId: drugId,
      },
      verifications: verifs.map((v) => ({
        id: v.id,
        assertionId: v.assertionId,
        reviewerUserId: v.reviewerUserId,
        verificationAction: v.verificationAction,
        verifiedAt: v.verifiedAt,
      })),
      credentials: [credA!],
      conflicts: [],
      safetyOverrides: [],
    });

    expect(summary.validApprovalCount).toBe(1);
    expect(summary.validRejectionCount).toBe(0);
    expect(summary.latestValidApprovalVerificationId).toBe(v5.verification.id);
  });

  it("Scenario 7A & 7B: barrier-synchronized mixed concurrency (no deadlock) and full PostgreSQL rollback on audit failure", async () => {
    const assertionId = await createTestAssertion("reviewed");

    // 7B: Force real overlap between Reviewer A (holding Assertion + Credential A lock) and Reviewer B (waiting on Assertion Lock)
    const txAHoldingBothLocks = createDeferred<number>();
    const txBPidReady = createDeferred<number>();
    const releaseTxA = createDeferred<void>();

    const barrierReviewStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
    let callNum = 0;
    barrierReviewStore.findByIdForUpdate = async (id, tx) => {
      const idx = ++callNum;
      const pid = await getBackendPid(tx);
      if (idx === 2) {
        txBPidReady.resolve(pid);
      }
      return await reviewStore.findByIdForUpdate(id, tx);
    };

    const barrierReviewerStore = Object.create(reviewerStore) as DrizzleReviewerStore;
    let credCallNum = 0;
    barrierReviewerStore.findActiveByUserIdForUpdate = async (uid, tx) => {
      const idx = ++credCallNum;
      const pid = await getBackendPid(tx);
      const row = await reviewerStore.findActiveByUserIdForUpdate(uid, tx);
      if (idx === 1) {
        txAHoldingBothLocks.resolve(pid);
        await releaseTxA.promise;
      }
      return row;
    };

    const barrierReviewerService = new ReviewerService({
      reviewerStore: barrierReviewerStore,
      db: client.db,
    });
    const barrierService = new AssertionVerificationService({
      verificationStore,
      assertionStore: barrierReviewStore,
      reviewerService: barrierReviewerService,
      db: client.db,
    });

    const pA = barrierService.verifyAssertion(actorA, {
      assertionId,
      clinicalReviewNotes: "Mix A1",
    });
    const txAPid = await txAHoldingBothLocks.promise;

    const pB = barrierService.verifyAssertion(actorB, {
      assertionId,
      clinicalReviewNotes: "Mix B1",
    });
    const txBPid = await txBPidReady.promise;

    const evidence = await waitForPostgresLockWait({
      observerDb: observerClient.db,
      blockedPid: txBPid,
      holderPid: txAPid,
      label: "7B-mixed-lock-order",
    });
    expect(evidence.waitEventType).toBe("Lock");
    expect(evidence.blockingPids).toContain(txAPid);

    releaseTxA.resolve();
    await Promise.all([pA, pB]);

    // 7A: Rollback on mid-transaction audit failure
    const verifsBeforeRollback = await inspectChainIntegrityForAssertions([assertionId]);
    expect(verifsBeforeRollback).toHaveLength(2);
    const auditsBeforeRollback = await client.db
      .select()
      .from(pocketAssertionAuditLog)
      .where(eq(pocketAssertionAuditLog.assertionId, assertionId));
    expect(auditsBeforeRollback).toHaveLength(2);

    const failingAssertionStore = Object.create(reviewStore) as DrizzleAssertionReviewStore;
    failingAssertionStore.insertAuditLog = async () => {
      throw new Error("C24 simulated audit log failure");
    };
    const failingService = new AssertionVerificationService({
      verificationStore,
      assertionStore: failingAssertionStore,
      reviewerService,
      db: client.db,
    });

    await expect(
      failingService.rejectAssertionVerification(actorA, {
        assertionId,
        clinicalReviewNotes: "Must roll back completely",
      }),
    ).rejects.toThrow("C24 simulated audit log failure");

    const verifsAfterRollback = await inspectChainIntegrityForAssertions([assertionId]);
    expect(verifsAfterRollback).toHaveLength(2);

    const auditsAfterRollback = await client.db
      .select()
      .from(pocketAssertionAuditLog)
      .where(eq(pocketAssertionAuditLog.assertionId, assertionId));
    expect(auditsAfterRollback).toHaveLength(2);
  });
});
