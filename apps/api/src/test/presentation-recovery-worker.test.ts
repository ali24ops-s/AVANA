import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  PRESENTATION_SLIDE_COST_TOMAN,
  type UserId,
  type OrganizationId,
} from "@avana/domain";
import {
  InMemoryPresentationProjectStore,
} from "../modules/presentation/in-memory-presentation-store.js";
import { InMemoryPresentationSlideStore } from "../modules/presentation/in-memory-presentation-slide-store.js";
import { InMemoryPresentationGenerationOperationStore } from "../modules/presentation/presentation-generation-operation-store.js";
import { PresentationGenerationOperationService } from "../modules/presentation/presentation-generation-operation-service.js";
import { PresentationRecoveryWorker } from "../modules/presentation/presentation-recovery-worker.js";
import { InMemoryWalletStore, WalletService } from "../modules/wallet/index.js";

describe("PresentationRecoveryWorker Unit & Integration Tests", () => {
  let projectStore: InMemoryPresentationProjectStore;
  let slideStore: InMemoryPresentationSlideStore;
  let operationStore: InMemoryPresentationGenerationOperationStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let operationService: PresentationGenerationOperationService;
  let activeWorkers: PresentationRecoveryWorker[] = [];

  const userId = randomUUID() as UserId;
  const orgId = randomUUID() as OrganizationId;

  beforeEach(async () => {
    projectStore = new InMemoryPresentationProjectStore();
    slideStore = new InMemoryPresentationSlideStore();
    operationStore = new InMemoryPresentationGenerationOperationStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);
    activeWorkers = [];

    // Mock minimal generation service (not called during recovery)
    const mockGenerationService = {
      generateSlide: vi.fn(),
    } as unknown as import("../modules/presentation/presentation-generation-service.js").PresentationGenerationService;

    operationService = new PresentationGenerationOperationService(
      operationStore,
      slideStore,
      mockGenerationService,
      walletService,
    );

    // Initial wallet balance
    await walletService.credit({
      userId,
      amount: 5000,
      source: "gift",
      referenceType: "topup",
      referenceId: randomUUID(),
    });
  });

  afterEach(async () => {
    for (const worker of activeWorkers) {
      await worker.stop();
    }
    activeWorkers = [];
  });

  it("1. Worker starts and executes an immediate first recovery pass on startup", async () => {
    const project = await projectStore.create({
      ownerUserId: userId,
      organizationId: orgId,
      title: "Worker Test",
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
      status: "created",
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "Slide 1",
      rawText: "Raw text",
    });

    // Debit 1500 and create a stale operation from 10 minutes ago
    const debitRes = await walletService.debit({
      userId,
      amount: PRESENTATION_SLIDE_COST_TOMAN,
      source: "content_generation",
      referenceType: "presentation_slide",
      referenceId: slide.id,
      idempotencyKey: "debit_stale_1",
    });

    const op = await operationStore.claimOperation({
      projectId: project.id,
      slideId: slide.id,
      userId,
      costToman: PRESENTATION_SLIDE_COST_TOMAN,
      idempotencyKey: "op_stale_1",
    });

    await operationStore.updateStatus(op.id, {
      status: "debited",
      debitTransactionId: debitRes.transaction.id,
    });
    // Set startedAt to 10 minutes ago
    (operationStore as unknown as { operations: Map<string, { startedAt: string }> }).operations.get(op.id)!.startedAt = new Date(
      Date.now() - 10 * 60 * 1000,
    ).toISOString();

    const loggedMessages: string[] = [];
    const mockLogger = {
      info: vi.fn((obj: Record<string, unknown> | string, msg?: string) => {
        loggedMessages.push(msg || JSON.stringify(obj));
      }),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const worker = new PresentationRecoveryWorker({
      operationService,
      logger: mockLogger,
      pollIntervalMs: 60_000,
      staleThresholdMs: 5 * 60 * 1000,
    });
    activeWorkers.push(worker);

    expect(worker.getStatus().isRunning).toBe(false);

    // Start worker — should immediately execute first cycle
    worker.start();
    expect(worker.getStatus().isRunning).toBe(true);

    // Wait a brief moment for the unawaited immediate cycle to complete
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Verify operation was refunded automatically without waiting 60s
    const updatedOp = await operationStore.findById(op.id);
    expect(updatedOp?.status).toBe("refunded");
    expect(updatedOp?.refundTransactionId).toBeDefined();

    // Verify wallet balance restored to 5000
    const finalWallet = await walletService.getUserWallet(userId);
    expect(finalWallet.balance).toBe(5000);

    // Verify structured logger was called
    expect(mockLogger.info).toHaveBeenCalled();
  });

  it("2. Single-flight protection: concurrent calls to executeCycle do not overlap", async () => {
    let activeExecutions = 0;
    let maxSimultaneousExecutions = 0;

    // Spy on recoverStaleOperations with artificial delay
    const originalRecover = operationService.recoverStaleOperations.bind(operationService);
    vi.spyOn(operationService, "recoverStaleOperations").mockImplementation(async (...args) => {
      activeExecutions++;
      maxSimultaneousExecutions = Math.max(maxSimultaneousExecutions, activeExecutions);
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeExecutions--;
      return originalRecover(...args);
    });

    const worker = new PresentationRecoveryWorker({
      operationService,
      pollIntervalMs: 60_000,
    });
    activeWorkers.push(worker);

    // Fire 5 triggers concurrently
    await Promise.all([
      worker.executeCycle(),
      worker.executeCycle(),
      worker.executeCycle(),
      worker.executeCycle(),
      worker.executeCycle(),
    ]);

    expect(maxSimultaneousExecutions).toBe(1);
  });

  it("3. Error resilience: transient errors in recoverStaleOperations are logged and do not kill the worker", async () => {
    let callCount = 0;
    const loggedErrors: Array<Record<string, unknown>> = [];
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn((obj: Record<string, unknown> | string) => {
        if (typeof obj === "object" && obj !== null) {
          loggedErrors.push(obj);
        }
      }),
    };

    vi.spyOn(operationService, "recoverStaleOperations").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Temporary DB connection drop");
      }
      return {
        examined: 0,
        refunded: 0,
        completed: 0,
        failedWithoutRefund: 0,
        skippedActiveLock: 0,
      };
    });

    const worker = new PresentationRecoveryWorker({
      operationService,
      logger: mockLogger,
      pollIntervalMs: 50,
    });
    activeWorkers.push(worker);

    // First cycle throws
    await worker.executeCycle();
    expect(callCount).toBe(1);
    expect(loggedErrors.length).toBe(1);
    expect(loggedErrors[0]?.error).toContain("Temporary DB connection drop");

    // Second cycle succeeds normally (worker was NOT permanently terminated)
    await worker.executeCycle();
    expect(callCount).toBe(2);
  });

  it("4. Graceful shutdown: stop() waits for in-flight cycle and prevents future ticks", async () => {
    let isCycleRunning = false;
    let cycleCompleted = false;

    vi.spyOn(operationService, "recoverStaleOperations").mockImplementation(async () => {
      isCycleRunning = true;
      await new Promise((resolve) => setTimeout(resolve, 60));
      isCycleRunning = false;
      cycleCompleted = true;
      return {
        examined: 0,
        refunded: 0,
        completed: 0,
        failedWithoutRefund: 0,
        skippedActiveLock: 0,
      };
    });

    const worker = new PresentationRecoveryWorker({
      operationService,
      pollIntervalMs: 50,
    });

    worker.start();
    // Allow cycle to start
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(isCycleRunning).toBe(true);

    // Now stop while cycle is running
    await worker.stop();

    expect(isCycleRunning).toBe(false);
    expect(cycleCompleted).toBe(true);
    expect(worker.getStatus().isRunning).toBe(false);
  });

  it("5. Multi-instance coordination: two independent workers compete safely using atomic lease locking", async () => {
    const project = await projectStore.create({
      ownerUserId: userId,
      organizationId: orgId,
      title: "Multi-Worker Project",
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
      status: "created",
    });

    const slide = await slideStore.createSlide({
      projectId: project.id,
      slideIndex: 1,
      title: "Slide 1",
      rawText: "Content",
    });

    const debitRes = await walletService.debit({
      userId,
      amount: PRESENTATION_SLIDE_COST_TOMAN,
      source: "content_generation",
      referenceType: "presentation_slide",
      referenceId: slide.id,
      idempotencyKey: "debit_multi_worker_1",
    });

    const op = await operationStore.claimOperation({
      projectId: project.id,
      slideId: slide.id,
      userId,
      costToman: PRESENTATION_SLIDE_COST_TOMAN,
      idempotencyKey: "op_multi_worker_1",
    });

    await operationStore.updateStatus(op.id, {
      status: "debited",
      debitTransactionId: debitRes.transaction.id,
    });
    (operationStore as unknown as { operations: Map<string, { startedAt: string }> }).operations.get(op.id)!.startedAt = new Date(
      Date.now() - 10 * 60 * 1000,
    ).toISOString();

    // Create TWO independent recovery worker instances (simulating two API containers)
    const worker1 = new PresentationRecoveryWorker({
      operationService,
      workerId: "api_container_instance_1",
    });
    const worker2 = new PresentationRecoveryWorker({
      operationService,
      workerId: "api_container_instance_2",
    });

    activeWorkers.push(worker1, worker2);

    // Both workers execute a cycle concurrently
    await Promise.all([worker1.executeCycle(), worker2.executeCycle()]);

    // EXACTLY one refund must have been issued
    const finalWallet = await walletService.getUserWallet(userId);
    expect(finalWallet.balance).toBe(5000); // 3500 + 1500 = 5000 (NOT 6500!)

    const finalOp = await operationStore.findById(op.id);
    expect(finalOp?.status).toBe("refunded");
    expect(finalOp?.refundTransactionId).toBeDefined();
  });
});
