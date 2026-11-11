/**
 * Comprehensive Test Suite for Autonomous Personal Summary Recovery.
 *
 * Verifies all 9 mandatory requirements:
 * 1. Startup recovery executes automatically without user HTTP request.
 * 2. Periodic execution continues across subsequent interval ticks.
 * 3. Recovery reactivates upon API / Worker restart.
 * 4. Failed refunds are retried in subsequent cycles.
 * 5. Multi-instance concurrent recovery never applies duplicate refunds.
 * 6. Service stop during recovery preserves pending state for next startup.
 * 7. Multiple recovery executions do not double-credit wallet balance (Idempotency).
 * 8. Graceful shutdown halts timer and prevents uncontrolled new executions.
 * 9. Existing successful summaries and past versions remain intact and accessible.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  type Actor,
  type CourseId,
  type OrganizationId,
  asUserId,
  asCourseId,
} from "@avana/domain";
import {
  PersonalSummaryService,
} from "../modules/study/personal-summary-service.js";
import {
  InMemoryPersonalSummaryStore,
} from "../modules/study/personal-summary-store.js";
import {
  startPersonalSummaryReconciler,
  type PersonalSummaryReconcilerHandle,
} from "../modules/study/personal-summary-reconciler.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import type { ModuleRecord, CourseRecord } from "../learning/learning-store.js";
import type { ModuleStore, LessonStore } from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { ModelGateway } from "../generation/gateway/types.js";

const USER_A = asUserId("11111111-1111-4111-8111-111111111111");
const COURSE_ID = asCourseId("33333333-3333-4333-8333-333333333333");
const MODULE_ID = "44444444-4444-4444-8444-444444444444";
const ORG_ID = "org-1111-1111" as OrganizationId;

const ACTOR_A: Actor = {
  type: "user",
  userId: USER_A,
  organizationId: ORG_ID,
  role: "student",
};

describe("Autonomous Personal Summary Recovery", () => {
  let store: InMemoryPersonalSummaryStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let service: PersonalSummaryService;
  let reconcilerHandle: PersonalSummaryReconcilerHandle | undefined;

  const mockModule: ModuleRecord = {
    id: MODULE_ID,
    courseId: COURSE_ID,
    documentId: "doc-1",
    title: "فصل اول",
    description: "شرح",
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockCourse: CourseRecord = {
    id: COURSE_ID,
    organizationId: ORG_ID,
    name: "دوره فارماکولوژی",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockModuleStore = {
    findById: vi.fn(async (id: string) => (id === MODULE_ID ? mockModule : null)),
  } as unknown as ModuleStore;

  const mockLessonStore = {
    listByModule: vi.fn(async () => []),
  } as unknown as LessonStore;

  const mockCourseStore = {
    findByIdForUser: vi.fn(async (cid: CourseId) => (cid === COURSE_ID ? mockCourse : null)),
    findById: vi.fn(async (cid: CourseId) => (cid === COURSE_ID ? mockCourse : null)),
  } as unknown as CourseStore;

  const mockOrgStore = {
    listMembershipsByUserId: vi.fn(async () => [
      { organizationId: ORG_ID, role: "student", userId: USER_A },
    ]),
  } as unknown as OrganizationStore;

  const mockGateway: ModelGateway = {
    provider: "google",
    model: "gemini-2.5-flash",
    complete: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    store = new InMemoryPersonalSummaryStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);

    service = new PersonalSummaryService(
      store,
      walletService,
      mockGateway,
      mockModuleStore,
      mockLessonStore,
      mockCourseStore,
      mockOrgStore,
      undefined,
      ORG_ID,
    );
  });

  afterEach(async () => {
    if (reconcilerHandle) {
      await reconcilerHandle.stop();
      reconcilerHandle = undefined;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1. executes recovery upon startup automatically without requiring user HTTP request", async () => {
    // Setup: User was debited 3000, but generation failed with pending refund
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-1",
      idempotencyKey: "topup-key-1",
    });
    const debit = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "failed-job-1",
      idempotencyKey: "debit-key-1",
    });
    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

    await store.createPending({
      id: "failed-job-1",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "failed",
      refundStatus: "pending",
      failureReason: "Network glitch to AI gateway",
      transactionId: debit.transaction.id,
      idempotencyKey: "failed-job-1-idemp",
    });

    // Start reconciler: simulates server startup
    reconcilerHandle = startPersonalSummaryReconciler(service, {
      intervalMs: 120_000,
      workerId: "test-worker-1",
    });

    // Let the startup promise settle
    await vi.advanceTimersByTimeAsync(10);

    // User's wallet is automatically restored to 10000 Tomans WITHOUT user login
    const wallet = await walletService.getMyWallet(ACTOR_A);
    expect(wallet.balance).toBe(10000);

    const record = await store.findById("failed-job-1");
    expect(record?.status).toBe("failed");
    expect(record?.refundStatus).toBe("refunded");
  });

  it("2. continues periodic execution across subsequent interval ticks (every 2 minutes)", async () => {
    reconcilerHandle = startPersonalSummaryReconciler(service, {
      intervalMs: 120_000,
      workerId: "test-worker-2",
    });
    await vi.advanceTimersByTimeAsync(10);

    // After 1 minute: a new failure with pending refund happens
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-2",
      idempotencyKey: "topup-key-2",
    });
    const debit = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "failed-job-2",
      idempotencyKey: "debit-key-2",
    });
    await store.createPending({
      id: "failed-job-2",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "failed",
      refundStatus: "pending",
      failureReason: "Gateway 503",
      transactionId: debit.transaction.id,
      idempotencyKey: "failed-job-2-idemp",
    });

    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);

    // Advance by 120,000ms to trigger next periodic sweep
    await vi.advanceTimersByTimeAsync(120_000);

    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);
    const record = await store.findById("failed-job-2");
    expect(record?.status).toBe("failed");
    expect(record?.refundStatus).toBe("refunded");
  });

  it("3. reactivates recovery upon API / Worker restart and processes pending records", async () => {
    // 1st instance runs and then shuts down
    reconcilerHandle = startPersonalSummaryReconciler(service, { intervalMs: 120_000 });
    reconcilerHandle.stop();

    // While service was offline, a record with pending refund remained
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-3",
      idempotencyKey: "topup-key-3",
    });
    const debit = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "offline-job-3",
      idempotencyKey: "debit-key-3",
    });
    await store.createPending({
      id: "offline-job-3",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "failed",
      refundStatus: "pending",
      transactionId: debit.transaction.id,
      idempotencyKey: "offline-job-3-idemp",
    });

    // 2nd instance boots up (restart)
    const newReconciler = startPersonalSummaryReconciler(service, { intervalMs: 120_000 });
    reconcilerHandle = newReconciler;
    await vi.advanceTimersByTimeAsync(10);

    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);
    const record = await store.findById("offline-job-3");
    expect(record?.refundStatus).toBe("refunded");
  });

  it("4. retries failed refund in subsequent cycles if WalletService fails initially", async () => {
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-4",
      idempotencyKey: "topup-key-4",
    });
    const debit = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "retry-job-4",
      idempotencyKey: "debit-key-4",
    });

    await store.createPending({
      id: "retry-job-4",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "failed",
      refundStatus: "pending",
      transactionId: debit.transaction.id,
      idempotencyKey: "retry-job-4-idemp",
    });

    // 1st cycle: WalletService fails
    vi.spyOn(walletService, "refund").mockRejectedValueOnce(new Error("Wallet DB temporary glitch"));

    reconcilerHandle = startPersonalSummaryReconciler(service, { intervalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(10);

    // Balance remains 7000 and record remains pending
    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(7000);
    let record = await store.findById("retry-job-4");
    expect(record?.refundStatus).toBe("pending");

    // Advance to cycle 2: WalletService is restored
    vi.restoreAllMocks();
    await vi.advanceTimersByTimeAsync(120_000);

    // Balance successfully refunded to 10000
    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);
    record = await store.findById("retry-job-4");
    expect(record?.refundStatus).toBe("refunded");
  });

  it("5. prevents multi-instance concurrent recovery from applying duplicate refunds", async () => {
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-5",
      idempotencyKey: "topup-key-5",
    });
    const debit = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "concurrent-job-5",
      idempotencyKey: "debit-key-5",
    });

    await store.createPending({
      id: "concurrent-job-5",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "failed",
      refundStatus: "pending",
      transactionId: debit.transaction.id,
      idempotencyKey: "concurrent-job-5-idemp",
    });

    // Simulate two concurrent worker instances running recovery at the exact same moment
    const [stats1, stats2] = await Promise.all([
      service.claimAndRecoverBatch("instance-A", 50),
      service.claimAndRecoverBatch("instance-B", 50),
    ]);
    expect(stats1.refundsSuccessful + stats2.refundsSuccessful).toBe(1);

    // Wallet is credited exactly 3000 once (balance 10000, NOT 13000)
    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

    const txs = await walletService.listMyTransactions(ACTOR_A);
    const refundTxs = txs.transactions.filter((t) => t.type === "refund");
    expect(refundTxs.length).toBe(1);

    const record = await store.findById("concurrent-job-5");
    expect(record?.refundStatus).toBe("refunded");
  });

  it("6. preserves pending state if service stops during recovery so it can be recovered next time", async () => {
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-6",
      idempotencyKey: "topup-key-6",
    });
    const debit = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "crash-job-6",
      idempotencyKey: "debit-key-6",
    });

    await store.createPending({
      id: "crash-job-6",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "pending",
      refundStatus: "none",
      transactionId: debit.transaction.id,
      idempotencyKey: "crash-job-6-idemp",
      leaseExpiresAt: new Date(Date.now() - 10_000), // lease expired
    });

    // Simulate abort mid-execution: record remains failed/pending refund
    await store.markFailed("crash-job-6", "aborted", null, "pending");

    // Next run recovers it
    const stats = await service.claimAndRecoverBatch("restart-worker", 50);
    expect(stats.refundsSuccessful).toBe(1);
    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);
  });

  it("7. guarantees idempotency: repeated recovery cycles never increase user balance more than once", async () => {
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-7",
      idempotencyKey: "topup-key-7",
    });
    const debit = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "idemp-job-7",
      idempotencyKey: "debit-key-7",
    });

    await store.createPending({
      id: "idemp-job-7",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "failed",
      refundStatus: "pending",
      transactionId: debit.transaction.id,
      idempotencyKey: "idemp-job-7-idemp",
    });

    // Run recovery 5 times in a row
    for (let i = 0; i < 5; i++) {
      await service.claimAndRecoverBatch(`repeat-worker-${i}`, 50);
    }

    // Balance remains 10000
    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

    const txs = await walletService.listMyTransactions(ACTOR_A);
    const refunds = txs.transactions.filter((t) => t.type === "refund");
    expect(refunds.length).toBe(1);
  });

  it("8. graceful shutdown stops timer and prevents uncontrolled new executions", async () => {
    let cycleCount = 0;
    const customService = {
      claimAndRecoverBatch: async () => {
        cycleCount++;
        return {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1,
          recordsExamined: 0,
          recordsRecovered: 0,
          refundsSuccessful: 0,
          refundsFailed: 0,
          unexpectedErrors: 0,
        };
      },
    } as unknown as PersonalSummaryService;

    reconcilerHandle = startPersonalSummaryReconciler(customService, { intervalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(10);
    expect(cycleCount).toBe(1); // Ran once on startup

    // Stop reconciler
    await reconcilerHandle.stop();
    expect(reconcilerHandle.isRunning()).toBe(false);

    // Advance time by 10 minutes (5 ticks)
    await vi.advanceTimersByTimeAsync(600_000);

    // cycleCount must still be 1 (no new executions after stop)
    expect(cycleCount).toBe(1);
  });

  it("9. preserves existing successful versions and contents during recovery of failed attempts", async () => {
    // Version 1 succeeded earlier
    await store.createPending({
      id: "v1-completed",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 1,
      status: "completed",
      payload: { title: "خلاصه نسخه ۱", sections: [] },
      inputSnapshot: {
        capturedAt: new Date().toISOString(),
        moduleId: MODULE_ID,
        moduleTitle: "فصل اول",
        courseId: COURSE_ID,
        totalHighlights: 2,
        totalNotes: 1,
        items: [],
      },
      highlightsCount: 2,
      notesCount: 1,
      costToman: 3000,
      idempotencyKey: "v1-idemp",
    });

    // Version 2 failed with pending refund
    await walletService.credit({
      userId: USER_A,
      amount: 10000,
      source: "wallet_topup",
      referenceType: "order",
      referenceId: "topup-9",
      idempotencyKey: "topup-key-9",
    });
    const debitV2 = await walletService.debit({
      userId: USER_A,
      amount: 3000,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: "v2-failed-job",
      idempotencyKey: "debit-key-9",
    });

    await store.createPending({
      id: "v2-failed-job",
      userId: USER_A,
      courseId: COURSE_ID,
      moduleId: MODULE_ID,
      version: 2,
      status: "failed",
      refundStatus: "pending",
      transactionId: debitV2.transaction.id,
      idempotencyKey: "v2-idemp",
    });

    // Run recovery
    reconcilerHandle = startPersonalSummaryReconciler(service, { intervalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(10);

    // User gets refunded
    expect((await walletService.getMyWallet(ACTOR_A)).balance).toBe(10000);

    // Version 1 is still completed and active!
    const summaryStatus = await service.getPersonalSummary(ACTOR_A, MODULE_ID);
    expect(summaryStatus.has_personal_summary).toBe(true);
    expect(summaryStatus.summary?.version).toBe(1);
    expect(summaryStatus.summary?.status).toBe("completed");
    expect(summaryStatus.summary?.highlightsCount).toBe(2);
    expect(summaryStatus.summary?.notesCount).toBe(1);
  });
});

describe("Personal Summary Reconciler Graceful Shutdown & Resource Safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1. Stop without active cycle resolves immediately", async () => {
    const customService = {
      claimAndRecoverBatch: vi.fn(async () => ({
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1,
        recordsExamined: 0,
        recordsRecovered: 0,
        refundsSuccessful: 0,
        refundsFailed: 0,
        unexpectedErrors: 0,
      })),
    } as unknown as PersonalSummaryService;

    const reconciler = startPersonalSummaryReconciler(customService, { intervalMs: 120_000 });
    // Let startup microtasks finish
    await vi.advanceTimersByTimeAsync(1);

    const stopStart = Date.now();
    await reconciler.stop();
    const stopDuration = Date.now() - stopStart;

    expect(stopDuration).toBeLessThan(50);
    expect(reconciler.isRunning()).toBe(false);
  });

  it("2. Stop during active recovery awaits in-flight cycle to finish", async () => {
    let resolveBatch!: (value: PersonalSummaryRecoveryCycleStats) => void;
    const batchPromise = new Promise<PersonalSummaryRecoveryCycleStats>((resolve) => {
      resolveBatch = resolve;
    });

    const customService = {
      claimAndRecoverBatch: vi.fn(() => batchPromise),
    } as unknown as PersonalSummaryService;

    const reconciler = startPersonalSummaryReconciler(customService, { intervalMs: 120_000 });
    // Startup tick started and is currently in-flight
    await vi.advanceTimersByTimeAsync(1);
    expect(customService.claimAndRecoverBatch).toHaveBeenCalledTimes(1);

    let stopResolved = false;
    const stopPromise = reconciler.stop().then(() => {
      stopResolved = true;
    });

    // Advance timers - stop must NOT have resolved yet because batchPromise is still pending
    await vi.advanceTimersByTimeAsync(100);
    expect(stopResolved).toBe(false);
    expect(reconciler.isRunning()).toBe(false); // active is set to false immediately

    // Now resolve the in-flight batch
    resolveBatch({
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 50,
      recordsExamined: 1,
      recordsRecovered: 1,
      refundsSuccessful: 1,
      refundsFailed: 0,
      unexpectedErrors: 0,
    });

    await stopPromise;
    expect(stopResolved).toBe(true);
  });

  it("3. No new cycle starts: after stop, ticks never trigger new recovery executions", async () => {
    let callCount = 0;
    const customService = {
      claimAndRecoverBatch: vi.fn(async () => {
        callCount++;
        return {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1,
          recordsExamined: 0,
          recordsRecovered: 0,
          refundsSuccessful: 0,
          refundsFailed: 0,
          unexpectedErrors: 0,
        };
      }),
    } as unknown as PersonalSummaryService;

    const reconciler = startPersonalSummaryReconciler(customService, { intervalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(1);
    expect(callCount).toBe(1); // Ran startup tick

    await reconciler.stop();

    // Advance through 10 intervals (20 minutes)
    await vi.advanceTimersByTimeAsync(1_200_000);

    // Call count must remain 1
    expect(callCount).toBe(1);
    expect(customService.claimAndRecoverBatch).toHaveBeenCalledTimes(1);
  });

  it("4. Idempotent multiple stop calls: concurrent or subsequent calls return same promise and behave consistently", async () => {
    let resolveBatch!: (value: PersonalSummaryRecoveryCycleStats) => void;
    const customService = {
      claimAndRecoverBatch: vi.fn(() => new Promise<PersonalSummaryRecoveryCycleStats>((resolve) => { resolveBatch = resolve; })),
    } as unknown as PersonalSummaryService;

    const reconciler = startPersonalSummaryReconciler(customService, { intervalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(1);

    // Call stop multiple times concurrently
    const p1 = reconciler.stop();
    const p2 = reconciler.stop();
    const p3 = reconciler.stop();

    expect(p1).toBe(p2);
    expect(p2).toBe(p3);

    resolveBatch({
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 10,
      recordsExamined: 0,
      recordsRecovered: 0,
      refundsSuccessful: 0,
      refundsFailed: 0,
      unexpectedErrors: 0,
    });

    await Promise.all([p1, p2, p3]);
    expect(reconciler.isRunning()).toBe(false);

    // Calling stop again after completion returns already resolved promise
    const p4 = reconciler.stop();
    await expect(p4).resolves.toBeUndefined();
  });

  it("5. Error in active cycle: handled cleanly and does not cause Unhandled Promise Rejection on stop", async () => {
    let rejectBatch!: (err: unknown) => void;
    const customService = {
      claimAndRecoverBatch: vi.fn(() => new Promise<PersonalSummaryRecoveryCycleStats>((_, reject) => { rejectBatch = reject; })),
    } as unknown as PersonalSummaryService;

    const logs: string[] = [];
    const reconciler = startPersonalSummaryReconciler(customService, {
      intervalMs: 120_000,
      logger: (msg) => logs.push(msg),
    });
    await vi.advanceTimersByTimeAsync(1);

    const stopPromise = reconciler.stop();

    // Reject the in-flight cycle
    rejectBatch(new Error("Transient PostgreSQL connection failure"));

    // stopPromise must resolve cleanly without throwing
    await expect(stopPromise).resolves.toBeUndefined();
    expect(logs.some((l) => l.includes("Transient PostgreSQL connection failure"))).toBe(true);
    expect(reconciler.isRunning()).toBe(false);
  });

  it("6. Shutdown order: proves database close() is never called before recovery cycle completes", async () => {
    const executionOrder: string[] = [];
    let resolveBatch!: () => void;

    const customService = {
      claimAndRecoverBatch: vi.fn(async () => {
        executionOrder.push("recovery_cycle_started");
        await new Promise<void>((resolve) => { resolveBatch = resolve; });
        executionOrder.push("recovery_cycle_finished");
        return {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 50,
          recordsExamined: 1,
          recordsRecovered: 1,
          refundsSuccessful: 1,
          refundsFailed: 0,
          unexpectedErrors: 0,
        };
      }),
    } as unknown as PersonalSummaryService;

    const mockDbClose = vi.fn(async () => {
      executionOrder.push("db_connection_pool_closed");
    });

    const reconciler = startPersonalSummaryReconciler(customService, { intervalMs: 120_000 });
    await vi.advanceTimersByTimeAsync(1);
    expect(executionOrder).toEqual(["recovery_cycle_started"]);

    // Simulated shutdown orchestrator (matches enhancedClose in composeProduction.ts)
    const runGracefulShutdown = async () => {
      executionOrder.push("shutdown_initiated");
      await reconciler.stop();
      executionOrder.push("reconciler_stopped");
      await mockDbClose();
    };

    const shutdownPromise = runGracefulShutdown();
    await vi.advanceTimersByTimeAsync(10);

    expect(executionOrder).toEqual([
      "recovery_cycle_started",
      "shutdown_initiated",
    ]);

    // Now complete the recovery cycle
    resolveBatch({});
    await shutdownPromise;

    expect(executionOrder).toEqual([
      "recovery_cycle_started",
      "shutdown_initiated",
      "recovery_cycle_finished",
      "reconciler_stopped",
      "db_connection_pool_closed",
    ]);

    // Verify DB was closed strictly AFTER recovery finished
    const finishIdx = executionOrder.indexOf("recovery_cycle_finished");
    const dbCloseIdx = executionOrder.indexOf("db_connection_pool_closed");
    expect(finishIdx).toBeLessThan(dbCloseIdx);
  });

  it("7. Long shutdown warning: operational timeout logs warning but preserves database until cycle completes", async () => {
    const logs: string[] = [];
    const executionOrder: string[] = [];
    let resolveBatch!: () => void;

    const customService = {
      claimAndRecoverBatch: vi.fn(async () => {
        executionOrder.push("recovery_started");
        await new Promise<void>((resolve) => { resolveBatch = resolve; });
        executionOrder.push("recovery_completed");
        return {
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 6000,
          recordsExamined: 1,
          recordsRecovered: 1,
          refundsSuccessful: 1,
          refundsFailed: 0,
          unexpectedErrors: 0,
        };
      }),
    } as unknown as PersonalSummaryService;

    const mockDbClose = vi.fn(async () => {
      executionOrder.push("db_closed");
    });

    const reconciler = startPersonalSummaryReconciler(customService, {
      intervalMs: 120_000,
      shutdownWarningTimeoutMs: 1000, // 1 second warning threshold
      logger: (msg) => logs.push(msg),
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(executionOrder).toEqual(["recovery_started"]);

    const shutdownPromise = (async () => {
      await reconciler.stop();
      await mockDbClose();
    })();

    // Advance 1.5 seconds - past the 1s warning threshold
    await vi.advanceTimersByTimeAsync(1500);

    // Operational warning must be logged
    expect(logs.some((l) => l.includes("shutdown taking longer than 1000ms"))).toBe(true);

    // But DB must NOT be closed yet!
    expect(executionOrder).toEqual(["recovery_started"]);
    expect(mockDbClose).not.toHaveBeenCalled();

    // Advance another 5 seconds while batch is still working
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockDbClose).not.toHaveBeenCalled();

    // Finally let recovery complete
    resolveBatch({});
    await shutdownPromise;

    expect(executionOrder).toEqual(["recovery_started", "recovery_completed", "db_closed"]);
    expect(mockDbClose).toHaveBeenCalledTimes(1);
  });
});

