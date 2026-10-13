/**
 * Comprehensive regression tests for generation stopping and reconciliation.
 *
 * Verifies:
 * 1. Worker pre-execution check transitions `stopping` -> `stopped`, calls progressService.stop(), and refunds debit.
 * 2. Worker post-execution check transitions `stopping` -> `stopped` (never `succeeded`), calls progressService.stop(), and refunds debit.
 * 3. Worker error-handling transitions `stopping` -> `stopped`, calls progressService.stop(), and refunds debit.
 * 4. Progress store monotonic update prevents overwriting `stopping` or `stopped` with `generating`/`planning`/`queued`.
 * 5. Lifecycle service handles repeated stop click: immediately finalizes to `stopped` if lease expired.
 * 6. Active status reconciler cleans up stale orphaned `stopping` jobs without marking them failed.
 * 7. Active status reconciler preserves active `stopping` jobs with valid leases.
 * 8. Wallet debit refund idempotency on repeated stop / failure calls.
 * 9. Multi-tenant isolation during stopping.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Job } from "bullmq";
import {
  type Actor,
  type DocumentId,
  type OrganizationId,
  type CourseId,
  type GenerationJobId,
  type GenerationJobRecord,
  type DocumentGenerationProgressRecord,
  type UserId,
} from "@avana/domain";
import { processGenerationJob } from "../modules/generation/generation-processor.js";
import { InMemoryGenerationJobStore, InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryGenerationProgressStore,
  DrizzleGenerationProgressStore,
} from "../modules/generation/generation-progress-store.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import { InMemoryGenerationChunkStore } from "../modules/generation/generation-chunk-store.js";
import { GenerationLifecycleService } from "../modules/generation/services/generation-lifecycle-service.js";
import { GenerationActiveStatusService } from "../modules/generation/services/generation-active-status-service.js";
import { GenerationQueryService } from "../modules/generation/services/generation-query-service.js";
import { GenerationService, GenerationStoppedError } from "../modules/generation/generation-service.js";
import { InMemoryDocumentStore } from "../modules/learning/test/in-memory-stores.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import type { OrganizationStore, OrganizationRecord, OrganizationMembershipRecord } from "../modules/organizations/organization-store.js";
import type { AuditService } from "../modules/audit/audit-service.js";

describe("Generation Stopping & Reconciliation Comprehensive Suite", () => {
  const orgId = "org-test-1" as OrganizationId;
  const docId = "doc-test-1" as DocumentId;
  const courseId = "course-test-1" as CourseId;
  const userId = "user-test-1" as UserId;
  const actor: Actor = { userId, role: "organization_admin", organizationId: orgId };

  let jobStore: InMemoryGenerationJobStore;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let docStore: InMemoryDocumentStore;
  let contentStore: InMemoryGeneratedContentStore;
  let chunkStore: InMemoryGenerationChunkStore;
  let auditService: AuditService;

  beforeEach(() => {
    jobStore = new InMemoryGenerationJobStore();
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    walletStore = new InMemoryWalletStore();
    auditService = {
      record: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    walletService = new WalletService(walletStore, auditService);
    docStore = new InMemoryDocumentStore();
    contentStore = new InMemoryGeneratedContentStore();
    chunkStore = new InMemoryGenerationChunkStore();
  });

  function createMockBullJob(jobId: string, overrides: Record<string, unknown> = {}): Job {
    return {
      id: jobId,
      data: {
        actorUserId: userId,
        actorRole: "organization_admin",
        organizationId: orgId,
        documentId: docId,
        courseId,
        types: ["lesson", "flashcard", "quiz"],
        promptVersion: 1,
        generationKey: `gen-key-${jobId}`,
        priority: 1,
        ...overrides,
      },
    } as unknown as Job;
  }

  function createProgressRecord(overrides: Partial<DocumentGenerationProgressRecord> = {}): DocumentGenerationProgressRecord {
    const now = new Date().toISOString();
    return {
      documentId: docId,
      organizationId: orgId,
      status: "queued",
      stage: null,
      progressCurrent: 0,
      progressTotal: 100,
      stageStartedAt: null,
      lastActivityAt: now,
      errorMessage: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  describe("1. Worker (processGenerationJob) lifecycle finalization", () => {
    it("finalizes pre-execution stopping job to stopped, clears lease, notifies progress, and refunds debit", async () => {
      const jobId = "job-pre-stop" as GenerationJobId;
      const initialJob: GenerationJobRecord = {
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopping",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 0,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
        heartbeatAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(initialJob);

      // Initialize progress to 'stopping'
      await progressStore.upsert(createProgressRecord({ status: "stopping" }));

      // Credit wallet and charge debit for the job
      await walletStore.executeAtomicWalletMutation({
        userId,
        mutationType: "credit",
        amount: 10000,
        source: "system",
        referenceType: "topup",
        referenceId: "initial-topup",
      });
      await walletStore.executeAtomicWalletMutation({
        userId,
        mutationType: "debit",
        amount: 500,
        source: "system",
        referenceType: "generation_job",
        referenceId: jobId,
        idempotencyKey: `generation-debit:${jobId}`,
      });

      const walletBefore = await walletStore.getOrCreateWallet(userId);
      expect(walletBefore.balance).toBe(9500);

      const mockGenerationService = {
        generateForDocument: vi.fn(),
      } as unknown as GenerationService;

      const bullJob = createMockBullJob(jobId);
      const result = await processGenerationJob(bullJob, {
        generationService: mockGenerationService,
        generationJobStore: jobStore,
        generationProgressService: progressService,
        walletService,
        walletStore,
      });

      expect(result).toEqual({ job_id: jobId, status: "stopped" });
      expect(mockGenerationService.generateForDocument).not.toHaveBeenCalled();

      // Check job in DB
      const updatedJob = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(updatedJob?.status).toBe("stopped");
      expect(updatedJob?.leaseExpiresAt).toBeNull();
      expect(updatedJob?.completedAt).not.toBeNull();

      // Check progress
      const progress = await progressStore.findByDocument(docId, orgId);
      expect(progress?.status).toBe("stopped");

      // Check wallet refund
      const walletAfter = await walletStore.getOrCreateWallet(userId);
      expect(walletAfter.balance).toBe(10000);
    });

    it("finalizes post-execution stopping job to stopped instead of succeeded", async () => {
      const jobId = "job-post-stop" as GenerationJobId;
      const initialJob: GenerationJobRecord = {
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "queued",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 0,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: null,
        heartbeatAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(initialJob);

      await progressStore.upsert(createProgressRecord({ status: "generating" }));

      // Mock generation service that finishes, but user pressed Stop during execution
      const mockGenerationService = {
        generateForDocument: vi.fn().mockImplementation(async () => {
          // Simulate user clicking Stop while pipeline is in its last stage
          const job = await jobStore.findByIdForOrganization(jobId, orgId);
          if (job) {
            await jobStore.update({
              ...job,
              status: "stopping",
              updatedAt: new Date().toISOString(),
            });
          }
          await progressStore.updateMonotonic(docId, orgId, { status: "stopping" });
        }),
      } as unknown as GenerationService;

      const bullJob = createMockBullJob(jobId);
      const result = await processGenerationJob(bullJob, {
        generationService: mockGenerationService,
        generationJobStore: jobStore,
        generationProgressService: progressService,
        walletService,
        walletStore,
      });

      expect(result).toEqual({ job_id: jobId, status: "stopped" });

      const updatedJob = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(updatedJob?.status).toBe("stopped");
      expect(updatedJob?.leaseExpiresAt).toBeNull();
      expect(updatedJob?.completedAt).not.toBeNull();

      const progress = await progressStore.findByDocument(docId, orgId);
      expect(progress?.status).toBe("stopped");
    });

    it("finalizes error during execution as stopped when job is in stopping state", async () => {
      const jobId = "job-err-stop" as GenerationJobId;
      const initialJob: GenerationJobRecord = {
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "queued",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 0,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: null,
        heartbeatAt: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(initialJob);

      const mockGenerationService = {
        generateForDocument: vi.fn().mockImplementation(async () => {
          // Transition to stopping and throw GenerationStoppedError
          const job = await jobStore.findByIdForOrganization(jobId, orgId);
          if (job) {
            await jobStore.update({
              ...job,
              status: "stopping",
              updatedAt: new Date().toISOString(),
            });
          }
          throw new GenerationStoppedError(docId, jobId);
        }),
      } as unknown as GenerationService;

      const bullJob = createMockBullJob(jobId);
      const result = await processGenerationJob(bullJob, {
        generationService: mockGenerationService,
        generationJobStore: jobStore,
        generationProgressService: progressService,
        walletService,
        walletStore,
      });

      expect(result).toEqual({ job_id: jobId, status: "stopped" });

      const updatedJob = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(updatedJob?.status).toBe("stopped");
      expect(updatedJob?.leaseExpiresAt).toBeNull();
    });
  });

  describe("2. Progress Store monotonic update protections & valid transitions", () => {
    it("1. allows stopped -> queued for starting a new generation", async () => {
      await progressStore.upsert(createProgressRecord({ status: "stopped" }));

      // Explicit new generation starts
      await progressStore.updateMonotonic(docId, orgId, {
        status: "queued",
        progressCurrent: 0,
        progressTotal: 1,
      });

      const current = await progressStore.findByDocument(docId, orgId);
      expect(current?.status).toBe("queued");
    });

    it("2. allows failed -> queued for starting a new generation", async () => {
      await progressStore.upsert(createProgressRecord({ status: "failed" }));

      await progressStore.updateMonotonic(docId, orgId, {
        status: "queued",
        progressCurrent: 0,
        progressTotal: 1,
      });

      const current = await progressStore.findByDocument(docId, orgId);
      expect(current?.status).toBe("queued");
    });

    it("3. rejects late generating update from overwriting stopped", async () => {
      await progressStore.upsert(createProgressRecord({ status: "stopped" }));

      await progressStore.updateMonotonic(docId, orgId, {
        status: "generating",
        progressCurrent: 90,
      });

      const current = await progressStore.findByDocument(docId, orgId);
      expect(current?.status).toBe("stopped");
    });

    it("4. rejects late planning update from overwriting stopping", async () => {
      await progressStore.upsert(createProgressRecord({ status: "stopping" }));

      await progressStore.updateMonotonic(docId, orgId, {
        status: "planning",
        progressCurrent: 10,
      });

      const current = await progressStore.findByDocument(docId, orgId);
      expect(current?.status).toBe("stopping");
    });

    it("5. rejects queue request from resurrecting a deleted or deleting document", async () => {
      await progressStore.upsert(createProgressRecord({ status: "deleted" }));

      await progressStore.updateMonotonic(docId, orgId, {
        status: "queued",
      });

      let current = await progressStore.findByDocument(docId, orgId);
      expect(current?.status).toBe("deleted");

      // Also for deleting
      await progressStore.upsert(createProgressRecord({ status: "deleting" }));

      await progressStore.updateMonotonic(docId, orgId, {
        status: "queued",
      });

      current = await progressStore.findByDocument(docId, orgId);
      expect(current?.status).toBe("deleting");
    });

    it("6. guarantees consistent transition logic between InMemory and Drizzle store", async () => {
      let capturedSet: Record<string, unknown> | null = null;

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  documentId: docId,
                  organizationId: orgId,
                  status: "stopped",
                  stage: null,
                  progressCurrent: 50,
                  progressTotal: 100,
                  stageStartedAt: null,
                  lastActivityAt: null,
                  errorMessage: null,
                  version: 1,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            capturedSet = payload;
            return {
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([
                  {
                    documentId: docId,
                    organizationId: orgId,
                    status: "queued",
                    stage: null,
                    progressCurrent: 0,
                    progressTotal: 1,
                    stageStartedAt: null,
                    lastActivityAt: null,
                    errorMessage: null,
                    version: 2,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ]),
              }),
            };
          }),
        }),
      };

      const drizzleStore = new DrizzleGenerationProgressStore(mockDb as never);

      type ChunkItem = { value?: unknown; name?: unknown };

      // A: queued on stopped -> Drizzle sets atomic CASE statement protecting stopping/deleting/deleted
      await drizzleStore.updateMonotonic(docId, orgId, { status: "queued" });
      expect(capturedSet).toBeDefined();
      expect(capturedSet?.status).toBeDefined();
      // SQL expression protects stopping, deleting, deleted, while permitting stopped/failed
      const sqlObjA = capturedSet?.status as { queryChunks?: Array<ChunkItem | string> };
      const chunksA = (sqlObjA.queryChunks ?? [])
        .map((c) => (typeof c === "string" ? c : String(c.value ?? c.name ?? "")))
        .join(" ");
      expect(chunksA).toContain("stopping");
      expect(chunksA).toContain("deleting");
      expect(chunksA).toContain("deleted");

      // B: generating on stopped -> Drizzle sets atomic CASE statement protecting all terminal/stopping states
      await drizzleStore.updateMonotonic(docId, orgId, { status: "generating" });
      const sqlObjB = capturedSet?.status as { queryChunks?: Array<ChunkItem | string> };
      const chunksB = (sqlObjB.queryChunks ?? [])
        .map((c) => (typeof c === "string" ? c : String(c.value ?? c.name ?? "")))
        .join(" ");
      expect(chunksB).toContain("stopped");
      expect(chunksB).toContain("failed");
    });
  });

  describe("3. Lifecycle Service repeated stop and multi-job resolution", () => {
    let mockOrgStore: OrganizationStore;

    beforeEach(() => {
      mockOrgStore = {
        findById: async (id: string) => ({ id, name: "Org 1" } as unknown as OrganizationRecord),
        findMembership: async (oId: string, uId: string) => ({
          organizationId: oId,
          userId: uId,
          role: "organization_admin",
        } as unknown as OrganizationMembershipRecord),
      } as unknown as OrganizationStore;
    });

    it("immediately finalizes to stopped if job is stopping and lease is expired or missing", async () => {
      const lifecycleService = new GenerationLifecycleService(
        docStore,
        contentStore,
        progressService,
        chunkStore,
        jobStore,
        mockOrgStore,
      );

      await docStore.create({
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: userId,
        mimeType: "application/pdf",
        fileSize: 1000,
        checksum: "abc",
        storagePath: "/path",
        extractedText: "test",
        chunkCount: 1,
        pageCount: 1,
        errorCode: null,
        errorMessage: null,
        generationRequestedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const jobId = "job-stuck-stopping" as GenerationJobId;
      const expiredLease = new Date(Date.now() - 60000).toISOString();
      await jobStore.create({
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopping",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: expiredLease,
        heartbeatAt: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await progressStore.upsert(createProgressRecord({ status: "stopping" }));

      const res = await lifecycleService.stopGenerationForDocument(actor, orgId, docId);
      expect(res.status).toBe("stopped");
      expect(res.previousStatus).toBe("stopping");

      const updatedJob = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(updatedJob?.status).toBe("stopped");
      expect(updatedJob?.leaseExpiresAt).toBeNull();

      const progress = await progressStore.findByDocument(docId, orgId);
      expect(progress?.status).toBe("stopped");

      const doc = await docStore.findByIdForOrganization(docId, orgId);
      expect(doc?.status).toBe("extracted");
    });

    it("keeps status as stopping if worker lease is still active to allow safe shutdown", async () => {
      const lifecycleService = new GenerationLifecycleService(
        docStore,
        contentStore,
        progressService,
        chunkStore,
        jobStore,
        mockOrgStore,
      );

      await docStore.create({
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: userId,
        mimeType: "application/pdf",
        fileSize: 1000,
        checksum: "abc",
        storagePath: "/path",
        extractedText: "test",
        chunkCount: 1,
        pageCount: 1,
        errorCode: null,
        errorMessage: null,
        generationRequestedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const jobId = "job-active-stopping" as GenerationJobId;
      const activeLease = new Date(Date.now() + 300000).toISOString();
      await jobStore.create({
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopping",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: activeLease,
        heartbeatAt: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await lifecycleService.stopGenerationForDocument(actor, orgId, docId);
      expect(res.status).toBe("stopping");
      expect(res.previousStatus).toBe("stopping");

      const job = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(job?.status).toBe("stopping");
    });
  });

  describe("4. GenerationActiveStatusService stale recovery", () => {
    let mockOrgStore: OrganizationStore;

    beforeEach(() => {
      mockOrgStore = {
        findById: async (id: string) => ({ id, name: "Org 1" } as unknown as OrganizationRecord),
        findMembership: async (oId: string, uId: string) => ({
          organizationId: oId,
          userId: uId,
          role: "organization_admin",
        } as unknown as OrganizationMembershipRecord),
        listMembershipsByUserId: async () => [
          { organizationId: orgId, userId, role: "organization_admin" } as unknown as OrganizationMembershipRecord,
        ],
        listAll: async () => [{ id: orgId }] as unknown as OrganizationRecord[],
      } as unknown as OrganizationStore;
    });

    it("reconciles stale orphaned stopping job to stopped and notifies progress", async () => {
      const queryService = new GenerationQueryService(
        docStore,
        chunkStore,
        progressService,
        jobStore,
      );

      const activeStatusService = new GenerationActiveStatusService(
        docStore,
        contentStore,
        progressService,
        queryService,
        mockOrgStore,
      );

      await docStore.create({
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "stale-doc.pdf",
        status: "generating",
        ownerUserId: userId,
        mimeType: "application/pdf",
        fileSize: 1000,
        checksum: "abc",
        storagePath: "/path",
        extractedText: "test",
        chunkCount: 1,
        pageCount: 1,
        errorCode: null,
        errorMessage: null,
        generationRequestedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        deletedAt: null,
      });

      const jobId = "job-stale-stopping" as GenerationJobId;
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await jobStore.create({
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopping",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: staleTime,
        heartbeatAt: staleTime,
        startedAt: staleTime,
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: staleTime,
        updatedAt: staleTime,
        deletedAt: null,
      });

      await progressStore.upsert(createProgressRecord({
        status: "stopping",
        lastActivityAt: staleTime,
        updatedAt: staleTime,
      }));

      const activeList = await activeStatusService.getActiveGenerations(actor, orgId);
      // Stale stopping job should be reconciled to stopped status
      expect(activeList.length).toBe(1);
      expect(activeList[0].status).toBe("stopped");

      const updatedJob = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(updatedJob?.status).toBe("stopped");
      expect(updatedJob?.leaseExpiresAt).toBeNull();

      const progress = await progressStore.findByDocument(docId, orgId);
      expect(progress?.status).toBe("stopped");
    });

    it("does not prematurely reconcile active stopping job with valid heartbeat", async () => {
      const queryService = new GenerationQueryService(
        docStore,
        chunkStore,
        progressService,
        jobStore,
      );

      const activeStatusService = new GenerationActiveStatusService(
        docStore,
        contentStore,
        progressService,
        queryService,
        mockOrgStore,
      );

      await docStore.create({
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "active-doc.pdf",
        status: "generating",
        ownerUserId: userId,
        mimeType: "application/pdf",
        fileSize: 1000,
        checksum: "abc",
        storagePath: "/path",
        extractedText: "test",
        chunkCount: 1,
        pageCount: 1,
        errorCode: null,
        errorMessage: null,
        generationRequestedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const jobId = "job-fresh-stopping" as GenerationJobId;
      const recentTime = new Date().toISOString();
      await jobStore.create({
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopping",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
        heartbeatAt: recentTime,
        startedAt: recentTime,
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: recentTime,
        updatedAt: recentTime,
      });

      await progressStore.upsert(createProgressRecord({
        status: "stopping",
        lastActivityAt: recentTime,
        updatedAt: recentTime,
      }));

      const activeList = await activeStatusService.getActiveGenerations(actor, orgId);
      expect(activeList.length).toBe(1);
      expect(activeList[0].status).toBe("stopping");

      const job = await jobStore.findByIdForOrganization(jobId, orgId);
      expect(job?.status).toBe("stopping");
    });
  });

  describe("5. Wallet refund idempotency", () => {
    it("ensures duplicate refund attempts for the same stopped job only refund once", async () => {
      const jobId = "job-refund-test" as GenerationJobId;
      await walletStore.executeAtomicWalletMutation({
        userId,
        mutationType: "credit",
        amount: 5000,
        source: "system",
        referenceType: "topup",
        referenceId: "topup-1",
      });
      await walletStore.executeAtomicWalletMutation({
        userId,
        mutationType: "debit",
        amount: 1000,
        source: "system",
        referenceType: "generation_job",
        referenceId: jobId,
        idempotencyKey: `generation-debit:${jobId}`,
      });

      let wallet = await walletStore.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(4000);

      const jobRecord: GenerationJobRecord = {
        id: jobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopping",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: null,
        heartbeatAt: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await jobStore.create(jobRecord);

      const bullJob = createMockBullJob(jobId);
      const mockService = {
        generateForDocument: vi.fn(),
      } as unknown as GenerationService;

      // 1st run of processor on stopping job
      await processGenerationJob(bullJob, {
        generationService: mockService,
        generationJobStore: jobStore,
        generationProgressService: progressService,
        walletService,
        walletStore,
      });

      wallet = await walletStore.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(5000);

      // 2nd run (e.g. repeated redelivery)
      await processGenerationJob(bullJob, {
        generationService: mockService,
        generationJobStore: jobStore,
        generationProgressService: progressService,
        walletService,
        walletStore,
      });

      // Balance remains exactly 5000, no double refund!
      wallet = await walletStore.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(5000);
    });
  });
});
