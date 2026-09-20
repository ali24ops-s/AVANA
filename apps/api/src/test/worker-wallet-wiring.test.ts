import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type DocumentId,
  type CourseId,
  type OrganizationId,
  type GenerationJobId,
  type UUID,
  asUserId,
  asWalletId,
} from "@avana/domain";
import { composeWorker } from "../../../worker/src/compose.js";
import { processGenerationJob } from "@avana/api/generation/generation-processor";
import { GenerationRecoveryService } from "@avana/api/generation/generation-recovery-service";
import {
  InMemoryWalletStore,
  WalletService,
} from "../modules/wallet/index.js";
import {
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { Job } from "bullmq";
import type { WorkerConfig } from "../../../worker/src/config.js";
import { GenerationService } from "../modules/generation/generation-service.js";

describe("Phase 4A: Production Worker Wallet Wiring QA", () => {
  it("composeWorker constructs and injects walletStore and walletService into both recovery and worker dependencies", async () => {
    // Mock db client structure matching ReturnType<typeof createDbClient>["db"]
    const mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    };
    const mockClose = vi.fn().mockResolvedValue(undefined);

    const mockConfig: WorkerConfig = {
      database: { url: "postgres://mock:5432/mock" },
      redis: { url: "redis://localhost:6379" },
      generation: {
        queueName: "test-queue",
        aiProvider: "mock",
        geminiApiKey: "mock-key",
        geminiApiKeys: [],
        geminiModel: "gemini-pro",
        maxConcurrency: 1,
        staleThresholdMs: 600000,
        enableFallback: false,
        cloudflareAccountId: "",
        cloudflareApiToken: "",
        anthropicApiKey: "",
      },
      userAi: {
        provider: "openrouter",
        openrouterApiKey: "mock-openrouter-key",
        openrouterModel: "mock-deepseek",
        httpReferer: "https://avana.test",
        appTitle: "Avana Test",
      },
      monitoring: { port: 9091 },
      pricing: {
        costPerLessonToman: 1000,
        costPerFlashcardToman: 100,
        costPerQuizQuestionToman: 200,
        costPerSummaryToman: 500,
      },
    };

    const deps = await composeWorker(mockConfig, { db: mockDb as unknown as Parameters<typeof composeWorker>[1] extends { db: infer D } ? D : never, close: mockClose });

    expect(deps).toBeDefined();
    // Verify wallet dependencies exist on WorkerDependencies
    expect(deps.walletStore).toBeDefined();
    expect(deps.walletService).toBeDefined();
    expect(deps.adminGenerationService).toBeInstanceOf(GenerationService);
    expect(deps.userGenerationService).toBeInstanceOf(GenerationService);
    expect(deps.recoveryService).toBeInstanceOf(GenerationRecoveryService);

    // Verify recoveryService has the exact walletService and walletStore injected
    const recoveryAny = deps.recoveryService as unknown as { walletService?: unknown; walletStore?: unknown };
    expect(recoveryAny.walletService).toBe(deps.walletService);
    expect(recoveryAny.walletStore).toBe(deps.walletStore);

    // Verify gateways
    expect(deps.adminGateway.provider).toBe("mock");
    expect(deps.userGateway.provider).toBe("openrouter");

    await deps.close();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("processGenerationJob refunds user generation debit when a public job fails, and ensures idempotency", async () => {
    const orgId = randomUUID() as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const documentId = randomUUID() as DocumentId;
    const userId = asUserId(randomUUID() as UUID);
    const jobId = `job-fail-${randomUUID()}` as GenerationJobId;

    const jobStore = new InMemoryGenerationJobStore();
    await jobStore.create({
      id: jobId,
      jobId: `bullmq-${jobId}`,
      organizationId: orgId,
      documentId,
      courseId,
      type: "lesson",
      status: "queued",
      generationKey: `gen-key-${jobId}`,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      deletedAt: null,
    });

    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const walletStore = new InMemoryWalletStore();
    const walletService = new WalletService(walletStore, auditService);

    // Initial state: User wallet has 10,000 Tomans
    const initialBalance = 10000;
    await walletStore.createWallet({
      id: asWalletId(randomUUID() as UUID),
      userId,
      balance: initialBalance,
      currency: "toman",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Debit 1,500 Tomans for generation job
    const debitAmount = 1500;
    await walletService.debit({
      userId,
      amount: debitAmount,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-debit:${jobId}`,
    });

    const debitedWallet = await walletStore.findWalletByUserId(userId);
    expect(debitedWallet?.balance).toBe(8500);

    // Mock failing UserGenerationService
    const failingUserService = {
      generateForDocument: vi.fn().mockRejectedValue(new Error("OpenRouter 429 Rate Limit")),
    } as unknown as GenerationService;

    const bullmqJob = {
      id: jobId,
      data: {
        actorUserId: userId,
        actorRole: "student",
        organizationId: orgId,
        documentId,
        courseId,
        types: ["lesson"],
        generationContext: "public",
      },
    } as unknown as Job;

    // Execute processor with worker dependencies
    await expect(
      processGenerationJob(bullmqJob, {
        userGenerationService: failingUserService,
        generationJobStore: jobStore,
        walletService,
        walletStore,
      }),
    ).rejects.toThrow("OpenRouter 429 Rate Limit");

    // 1. Check job status became failed
    const finalJob = await jobStore.findByIdForOrganization(jobId, orgId);
    expect(finalJob?.status).toBe("failed");
    expect(finalJob?.errorMessage).toContain("OpenRouter 429 Rate Limit");

    // 2. Check wallet was refunded exact original debit amount (1,500)
    const refundedWallet = await walletStore.findWalletByUserId(userId);
    expect(refundedWallet?.balance).toBe(10000);

    // 3. Verify ledger idempotency: refund transaction exists with referenceType and exact key
    const refundTx = await walletStore.findTransactionByIdempotencyKey(`generation-refund:${jobId}`);
    expect(refundTx).toBeDefined();
    expect(refundTx?.amount).toBe(debitAmount);
    expect(refundTx?.type).toBe("refund");
    expect(refundTx?.referenceId).toBe(jobId);

    // 4. Test idempotency: calling refund again is a no-op duplicate and does NOT double-credit the user
    const duplicateRefundResult = await walletService.refund({
      userId,
      amount: debitAmount,
      source: "generation_refund",
      referenceType: "generation_job",
      referenceId: jobId,
      idempotencyKey: `generation-refund:${jobId}`,
    });
    expect(duplicateRefundResult.isDuplicate).toBe(true);

    const doubleCheckWallet = await walletStore.findWalletByUserId(userId);
    expect(doubleCheckWallet?.balance).toBe(10000); // balance strictly unchanged
  });

  it("admin generation failure produces ZERO wallet refund or mutation (Admin isolation invariant)", async () => {
    const orgId = randomUUID() as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const documentId = randomUUID() as DocumentId;
    const adminUserId = asUserId(randomUUID() as UUID);
    const adminJobId = `job-admin-${randomUUID()}` as GenerationJobId;

    const jobStore = new InMemoryGenerationJobStore();
    await jobStore.create({
      id: adminJobId,
      jobId: `bullmq-${adminJobId}`,
      organizationId: orgId,
      documentId,
      courseId,
      type: "lesson",
      status: "queued",
      generationKey: `gen-key-${adminJobId}`,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      deletedAt: null,
    });

    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const walletStore = new InMemoryWalletStore();
    const walletService = new WalletService(walletStore, auditService);

    const initialBalance = 5000;
    await walletStore.createWallet({
      id: asWalletId(randomUUID() as UUID),
      userId: adminUserId,
      balance: initialBalance,
      currency: "toman",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Mock failing AdminGenerationService (Gemini)
    const failingAdminService = {
      generateForDocument: vi.fn().mockRejectedValue(new Error("Gemini quota exhausted")),
    } as unknown as GenerationService;

    const refundSpy = vi.spyOn(walletService, "refund");

    const bullmqJob = {
      id: adminJobId,
      data: {
        actorUserId: adminUserId,
        actorRole: "platform_admin",
        organizationId: orgId,
        documentId,
        courseId,
        types: ["lesson"],
        generationContext: "admin",
      },
    } as unknown as Job;

    await expect(
      processGenerationJob(bullmqJob, {
        adminGenerationService: failingAdminService,
        generationJobStore: jobStore,
        walletService,
        walletStore,
      }),
    ).rejects.toThrow("Gemini quota exhausted");

    // Admin jobs have NO prior debit, so walletService.refund must NOT be called
    expect(refundSpy).not.toHaveBeenCalled();

    // Admin wallet balance remains strictly unchanged
    const finalAdminWallet = await walletStore.findWalletByUserId(adminUserId);
    expect(finalAdminWallet?.balance).toBe(initialBalance);
  });

  it("GenerationRecoveryService in worker context refunds stale generation jobs", async () => {
    const orgId = randomUUID() as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const documentId = randomUUID() as DocumentId;
    const userId = asUserId(randomUUID() as UUID);
    const staleJobId = `job-stale-${randomUUID()}` as GenerationJobId;

    const jobStore = new InMemoryGenerationJobStore();
    // Insert a stale job (created and heartbeat over 1 hour ago)
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    await jobStore.create({
      id: staleJobId,
      jobId: `bullmq-${staleJobId}`,
      organizationId: orgId,
      documentId,
      courseId,
      type: "lesson",
      status: "running",
      generationKey: `gen-key-${staleJobId}`,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: oneHourAgo,
      updatedAt: oneHourAgo,
      startedAt: oneHourAgo,
      heartbeatAt: oneHourAgo,
      leaseExpiresAt: oneHourAgo, // lease definitely expired
      completedAt: null,
      deletedAt: null,
    });

    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const walletStore = new InMemoryWalletStore();
    const walletService = new WalletService(walletStore, auditService);

    await walletStore.createWallet({
      id: asWalletId(randomUUID() as UUID),
      userId,
      balance: 10000,
      currency: "toman",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Debit 2,000 Tomans
    const debitAmount = 2000;
    await walletService.debit({
      userId,
      amount: debitAmount,
      source: "generation_debit",
      referenceType: "generation_job",
      referenceId: staleJobId,
      idempotencyKey: `generation-debit:${staleJobId}`,
    });

    const debitedWallet = await walletStore.findWalletByUserId(userId);
    expect(debitedWallet?.balance).toBe(8000);

    // Mock minimal DB object without .select/.update so it uses jobStore.reconcileStaleJobs fallback
    const mockDb = {};

    const recoveryService = new GenerationRecoveryService(
      mockDb as unknown as Parameters<typeof composeWorker>[1] extends { db: infer D } ? D : never,
      {} as unknown as Parameters<typeof GenerationRecoveryService.prototype.isCourseActivelyGenerating>[0] extends CourseId ? never : never,
      {} as unknown as Parameters<typeof GenerationRecoveryService.prototype.isDocumentActivelyGenerating>[0] extends DocumentId ? never : never,
      undefined,
      undefined,
      jobStore,
      undefined,
      auditService,
      undefined,
      undefined,
      walletService,
      walletStore,
    );

    const result = await recoveryService.reconcileStaleJobs(orgId, 60_000);

    expect(result.recoveredJobsCount).toBe(1);

    // Job is marked failed
    const reconciledJob = await jobStore.findByIdForOrganization(staleJobId, orgId);
    expect(reconciledJob?.status).toBe("failed");
    expect(reconciledJob?.errorCode).toBe("STALE_LEASE_EXPIRED");

    // Wallet is refunded back to 10,000 Tomans
    const recoveredWallet = await walletStore.findWalletByUserId(userId);
    expect(recoveredWallet?.balance).toBe(10000);

    // Refund ledger transaction exists
    const refundTx = await walletStore.findTransactionByIdempotencyKey(`generation-refund:${staleJobId}`);
    expect(refundTx).toBeDefined();
    expect(refundTx?.amount).toBe(debitAmount);
  });
});
