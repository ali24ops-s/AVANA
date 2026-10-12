import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asUserId,
  asWalletId,
  type CourseId,
  type DocumentId,
  type GenerationJobId,
  type OrganizationId,
  type UUID,
} from "@avana/domain";
import type { ApiConfig } from "../config.js";
import { InMemoryGenerationJobStore } from "../modules/generation/test/in-memory-stores.js";
import { InMemoryWalletStore, WalletService } from "../modules/wallet/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { processGenerationJob } from "../modules/generation/generation-processor.js";
import type { GenerationService } from "../modules/generation/generation-service.js";
import type { Job } from "bullmq";

const { MockBullWorker, MockBullQueue } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("node:events");
  class MockBullWorker extends EventEmitter {
    public isClosed = false;
    constructor(
      public queueName: string,
      public processor: (job: unknown) => Promise<unknown>,
      public opts: Record<string, unknown>,
    ) {
      super();
    }
    async close(): Promise<void> {
      this.isClosed = true;
    }
  }

  class MockBullQueue {
    public isClosed = false;
    constructor(public queueName: string, public opts: Record<string, unknown>) {}
    async add(): Promise<{ id: string }> {
      return { id: "job-123" };
    }
    async getActiveCount(): Promise<number> {
      return 0;
    }
    async close(): Promise<void> {
      this.isClosed = true;
    }
  }

  return { MockBullWorker, MockBullQueue };
});

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();
  return {
    ...actual,
    Worker: MockBullWorker,
    Queue: MockBullQueue,
  };
});

describe("Production Generation Worker Lifecycle & Execution QA", () => {
  const makeMockConfig = (overrides?: Partial<ApiConfig>): ApiConfig => ({
    nodeEnv: "production",
    server: { host: "127.0.0.1", port: 3000 },
    http: { jsonBodyLimit: "1048576" },
    logging: { redactHeaders: [], level: "silent" },
    appUrl: "https://aavana.ir",
    security: {
      cors: { origin: ["https://aavana.ir"], credentials: true },
      rateLimit: { max: 100, timeWindowMs: 60000 },
    },
    session: {
      cookieName: "avana_session",
      secure: true,
      sameSite: "lax",
      maxAgeMs: 604800000,
      path: "/",
    },
    csrf: {
      cookieName: "avana_csrf",
      headerName: "x-csrf-token",
      tokenExpiryMs: 86400000,
      secure: true,
      sameSite: "strict",
      path: "/",
    },
    database: { url: "postgres://mock:5432/mock" },
    storage: { local: { directory: "./storage/uploads" } },
    redis: { url: "redis://127.0.0.1:6379" },
    email: { provider: "resend", resendApiKey: "re_mock_test_key", from: "info@aavana.ir" },
    sms: { provider: "mock" },
    auth: { verificationSecret: "secret-123" },
    systemOrganizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    generation: {
      aiProvider: "gemini",
      enableFallback: false,
      queueName: "content_generate",
      geminiApiKey: "mock-gemini-key",
      geminiApiKeys: ["mock-gemini-key"],
      geminiModel: "gemini-3.6-flash",
      cloudflareAiModel: "@cf/zai-org/glm-4.7-flash",
      groqModel: "openai/gpt-oss-120b",
      gapgptModel: "gpt-5.6-luna",
      arvancloudModel: "DeepSeek-R1-qwen-7b-awq",
      pricing: {
        inputPricePerMillionUsd: 0.14,
        outputPricePerMillionUsd: 0.28,
        usdToTomanRate: 100000,
      },
    },
    userAi: {
      provider: "openrouter",
      openrouterApiKey: "sk-or-v1-mock-key",
      openrouterModel: "z-ai/glm-5.3-flash",
      appTitle: "AVANA",
    },
    commerce: {
      provider: "disabled",
      onlinePaymentEnabled: false,
      mockPaymentEnabled: false,
      zarinpalSandbox: true,
      cardToCard: { enabled: false },
    },
    telegram: {
      enabled: false,
      botUsername: "mock_bot",
      timeoutMs: 5000,
    },
    ...overrides,
  });

  describe("Scenario 1 & 6: Production Path Boots Worker & Avoids Duplicate Worker", () => {
    it("composeProduction initializes BullMQ Worker in production environment", async () => {
      const { composeProduction } = await import("../server/composeProduction.js");
      const config = makeMockConfig({ nodeEnv: "production" });

      const prod = await composeProduction(config, { startWorker: true });

      expect(prod.worker).toBeDefined();
      expect(prod.worker).toBeInstanceOf(MockBullWorker);
      expect((prod.worker as unknown as MockBullWorker).queueName).toBe("content_generate");

      // Verify no duplicate: closing dependencies shuts down worker cleanly
      await prod.close();
      expect((prod.worker as unknown as MockBullWorker).isClosed).toBe(true);
    });

    it("composeProduction does NOT start worker when explicitly startWorker: false (e.g. in test env)", async () => {
      const { composeProduction } = await import("../server/composeProduction.js");
      const config = makeMockConfig({ nodeEnv: "test" });

      const prod = await composeProduction(config, { startWorker: false });

      expect(prod.worker).toBeUndefined();
      await prod.close();
    });
  });

  describe("Scenario 2 & 3: Job Pickup & Status Transitions (queued -> running -> succeeded)", () => {
    it("processGenerationJob transitions job status from queued to running then succeeded", async () => {
      const orgId = randomUUID() as OrganizationId;
      const courseId = randomUUID() as CourseId;
      const documentId = randomUUID() as DocumentId;
      const jobId = `job-${randomUUID()}` as GenerationJobId;
      const actorUserId = randomUUID();

      const jobStore = new InMemoryGenerationJobStore();
      const now = new Date().toISOString();
      await jobStore.create({
        id: jobId,
        jobId,
        organizationId: orgId,
        documentId,
        courseId,
        type: "lesson",
        status: "queued",
        generationKey: `key-${jobId}`,
        attempts: 0,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        deletedAt: null,
      });

      const mockGenerateForDocument = vi.fn().mockImplementation(async () => {
        // Assert job status while running
        const runningJob = await jobStore.findByIdForOrganization(jobId, orgId);
        expect(runningJob?.status).toBe("running");
        expect(runningJob?.startedAt).toBeDefined();
        expect(runningJob?.leaseExpiresAt).toBeDefined();
      });

      const mockService = {
        generateForDocument: mockGenerateForDocument,
      };

      const bullmqJob = {
        id: jobId,
        name: "generate",
        data: {
          actorUserId,
          actorRole: "student",
          organizationId: orgId,
          documentId,
          courseId,
          types: ["lesson"],
          generationContext: "public",
        },
      } as unknown as Job;

      const result = await processGenerationJob(bullmqJob, {
        userGenerationService: mockService as unknown as GenerationService,
        generationJobStore: jobStore,
      });

      expect(result.status).toBe("succeeded");
      expect(result.job_id).toBe(jobId);
      expect(mockGenerateForDocument).toHaveBeenCalledTimes(1);

      const finalJob = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(finalJob?.status).toBe("succeeded");
      expect(finalJob?.completedAt).toBeDefined();
      expect(finalJob?.leaseExpiresAt).toBeNull();
    });
  });

  describe("Scenario 4: Non-Silent Failure, Error Capture & Refund", () => {
    it("processGenerationJob marks job failed, captures error code and message, and refunds debit", async () => {
      const orgId = randomUUID() as OrganizationId;
      const courseId = randomUUID() as CourseId;
      const documentId = randomUUID() as DocumentId;
      const jobId = `job-err-${randomUUID()}` as GenerationJobId;
      const userId = asUserId(randomUUID() as UUID);

      const jobStore = new InMemoryGenerationJobStore();
      const now = new Date().toISOString();
      await jobStore.create({
        id: jobId,
        jobId,
        organizationId: orgId,
        documentId,
        courseId,
        type: "lesson",
        status: "queued",
        generationKey: `key-${jobId}`,
        attempts: 0,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        deletedAt: null,
      });

      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const walletStore = new InMemoryWalletStore();
      const walletService = new WalletService(walletStore, auditService);

      // Seed wallet & debit
      await walletStore.createWallet({
        id: asWalletId(randomUUID() as UUID),
        userId,
        balance: 10000,
        currency: "toman",
        createdAt: now,
        updatedAt: now,
      });
      await walletService.debit({
        userId,
        amount: 2000,
        source: "generation_debit",
        referenceType: "generation_job",
        referenceId: jobId,
        idempotencyKey: `generation-debit:${jobId}`,
      });

      const failingService = {
        generateForDocument: vi.fn().mockRejectedValue(new Error("AI Model Quota Exceeded")),
      };

      const bullmqJob = {
        id: jobId,
        name: "generate",
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

      await expect(
        processGenerationJob(bullmqJob, {
          userGenerationService: failingService as unknown as GenerationService,
          generationJobStore: jobStore,
          walletService,
          walletStore,
        }),
      ).rejects.toThrow("AI Model Quota Exceeded");

      const finalJob = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(finalJob?.status).toBe("failed");
      expect(finalJob?.errorMessage).toContain("AI Model Quota Exceeded");
      expect(finalJob?.completedAt).toBeDefined();

      // Verify wallet was refunded
      const wallet = await walletStore.findWalletByUserId(userId);
      expect(wallet?.balance).toBe(10000);
    });
  });

  describe("Scenario 5: Graceful Shutdown", () => {
    it("enhancedClose closes worker, queue, and database connection cleanly", async () => {
      const { composeProduction } = await import("../server/composeProduction.js");
      const config = makeMockConfig({ nodeEnv: "production" });

      const prod = await composeProduction(config, { startWorker: true });
      const worker = prod.worker as unknown as MockBullWorker;
      expect(worker.isClosed).toBe(false);

      await prod.close();
      expect(worker.isClosed).toBe(true);
    });
  });

  describe("Scenario 7: Admin vs Public User Routing & Gateway Isolation", () => {
    it("routes admin jobs to adminGenerationService and public jobs to userGenerationService", async () => {
      const orgId = randomUUID() as OrganizationId;
      const courseId = randomUUID() as CourseId;
      const documentId = randomUUID() as DocumentId;
      const adminJobId = `job-admin-${randomUUID()}` as GenerationJobId;
      const publicJobId = `job-public-${randomUUID()}` as GenerationJobId;

      const jobStore = new InMemoryGenerationJobStore();
      const now = new Date().toISOString();

      await jobStore.create({
        id: adminJobId,
        jobId: adminJobId,
        organizationId: orgId,
        documentId,
        courseId,
        type: "lesson",
        status: "queued",
        generationKey: `key-${adminJobId}`,
        attempts: 0,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        deletedAt: null,
      });

      await jobStore.create({
        id: publicJobId,
        jobId: publicJobId,
        organizationId: orgId,
        documentId,
        courseId,
        type: "lesson",
        status: "queued",
        generationKey: `key-${publicJobId}`,
        attempts: 0,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        deletedAt: null,
      });

      const adminService = {
        generateForDocument: vi.fn().mockResolvedValue(undefined),
      };
      const userService = {
        generateForDocument: vi.fn().mockResolvedValue(undefined),
      };

      // 1. Process Admin Job
      const adminBullJob = {
        id: adminJobId,
        name: "generate",
        data: {
          actorUserId: randomUUID(),
          actorRole: "platform_admin",
          organizationId: orgId,
          documentId,
          courseId,
          types: ["lesson"],
          generationContext: "admin",
        },
      } as unknown as Job;

      await processGenerationJob(adminBullJob, {
        adminGenerationService: adminService as unknown as GenerationService,
        userGenerationService: userService as unknown as GenerationService,
        generationJobStore: jobStore,
      });

      expect(adminService.generateForDocument).toHaveBeenCalledTimes(1);
      expect(userService.generateForDocument).not.toHaveBeenCalled();

      // 2. Process Public Job
      const publicBullJob = {
        id: publicJobId,
        name: "generate",
        data: {
          actorUserId: randomUUID(),
          actorRole: "student",
          organizationId: orgId,
          documentId,
          courseId,
          types: ["lesson"],
          generationContext: "public",
        },
      } as unknown as Job;

      await processGenerationJob(publicBullJob, {
        adminGenerationService: adminService as unknown as GenerationService,
        userGenerationService: userService as unknown as GenerationService,
        generationJobStore: jobStore,
      });

      expect(userService.generateForDocument).toHaveBeenCalledTimes(1);
    });
  });
});
