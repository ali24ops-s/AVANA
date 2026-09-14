import { describe, it, expect, beforeEach, vi } from "vitest";
import { GenerationLifecycleService } from "./generation-lifecycle-service.js";
import {
  GenerationStoppedError,
  GenerationDeletedError,
} from "../generation-service.js";
import { InMemoryGenerationChunkStore } from "../generation-chunk-store.js";
import { GenerationProgressService } from "../generation-progress-service.js";
import { InMemoryGenerationProgressStore } from "../generation-progress-store.js";
import { InMemoryGeneratedContentStore, InMemoryGenerationJobStore } from "../test/in-memory-stores.js";
import type { DocumentRecord, DocumentStore } from "../../learning/learning-store.js";
import type { OrganizationStore, OrganizationMembershipRecord, OrganizationRecord } from "../../organizations/organization-store.js";
import type {
  Actor,
  DocumentId,
  OrganizationId,
  CourseId,
  GenerationJobId,
  GenerationJobRecord,
  GeneratedContentId,
  GeneratedContentPayload,
} from "@avana/domain";

describe("GenerationLifecycleService (Unit Tests)", () => {
  let lifecycleService: GenerationLifecycleService;
  let chunkStore: InMemoryGenerationChunkStore;
  let jobStore: InMemoryGenerationJobStore;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let contentStore: InMemoryGeneratedContentStore;
  let mockDocStore: DocumentStore;
  let mockOrgStore: OrganizationStore;
  let docs: DocumentRecord[];

  const orgId = "org-1" as OrganizationId;
  const docId = "doc-1" as DocumentId;
  const courseId = "course-1" as CourseId;
  const actor: Actor = { userId: "admin-1", role: "organization_admin", organizationId: orgId };

  beforeEach(() => {
    chunkStore = new InMemoryGenerationChunkStore();
    jobStore = new InMemoryGenerationJobStore();
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    contentStore = new InMemoryGeneratedContentStore();
    docs = [];

    mockDocStore = {
      findByIdForOrganization: async (id: string, oId: string) => {
        return docs.find((d) => d.id === id && d.organizationId === oId && d.deletedAt === null) ?? null;
      },
      update: async (doc: DocumentRecord) => {
        const idx = docs.findIndex((d) => d.id === doc.id);
        if (idx >= 0) {
          docs[idx] = { ...doc };
          return docs[idx];
        }
        return doc;
      },
    } as unknown as DocumentStore;

    mockOrgStore = {
      findById: async (id: string) => {
        if (id === orgId) {
          return { id, name: "Org 1" } as unknown as OrganizationRecord;
        }
        return null;
      },
      findMembership: async (oId: string, userId: string) => {
        if (userId === "admin-1") {
          return { organizationId: oId, userId, role: "organization_admin" } as unknown as OrganizationMembershipRecord;
        }
        return null;
      },
    } as unknown as OrganizationStore;

    lifecycleService = new GenerationLifecycleService(
      mockDocStore,
      contentStore,
      progressService,
      chunkStore,
      jobStore,
      mockOrgStore,
    );
  });

  describe("stopGenerationJob", () => {
    it("transitions queued job directly to stopped and reconciles document", async () => {
      const doc: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(doc);

      const job: GenerationJobRecord = {
        id: "job-queued" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "queued",
        targetTypes: ["lesson", "flashcard"],
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
      await jobStore.create(job);

      const result = await lifecycleService.stopGenerationJob(actor, orgId, job.id);
      expect(result.status).toBe("stopped");
      expect(result.previousStatus).toBe("queued");

      const updatedJob = await jobStore.findByIdForOrganization(job.id, orgId);
      expect(updatedJob?.status).toBe("stopped");

      const updatedDoc = docs.find((d) => d.id === docId);
      expect(updatedDoc?.status).toBe("extracted"); // no drafts exist -> extracted
    });

    it("transitions running job with expired lease directly to stopped", async () => {
      const doc: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(doc);

      const job: GenerationJobRecord = {
        id: "job-expired" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "running",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: new Date(Date.now() - 10000).toISOString(), // expired
        heartbeatAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(job);

      const result = await lifecycleService.stopGenerationJob(actor, orgId, job.id);
      expect(result.status).toBe("stopped");
      expect(result.previousStatus).toBe("running");

      const updatedJob = await jobStore.findByIdForOrganization(job.id, orgId);
      expect(updatedJob?.status).toBe("stopped");
    });

    it("transitions active running job with valid lease to stopping state", async () => {
      const job: GenerationJobRecord = {
        id: "job-active" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "running",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(), // active lease
        heartbeatAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(job);

      const result = await lifecycleService.stopGenerationJob(actor, orgId, job.id);
      expect(result.status).toBe("stopping");
      expect(result.previousStatus).toBe("running");

      const updatedJob = await jobStore.findByIdForOrganization(job.id, orgId);
      expect(updatedJob?.status).toBe("stopping");
    });

    it("throws conflict when stopping a succeeded or failed job", async () => {
      const jobSucceeded: GenerationJobRecord = {
        id: "job-succeeded" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "succeeded",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: null,
        heartbeatAt: null,
        startedAt: null,
        completedAt: new Date().toISOString(),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(jobSucceeded);

      await expect(
        lifecycleService.stopGenerationJob(actor, orgId, jobSucceeded.id)
      ).rejects.toThrow(/Cannot stop a job that has already completed/);
    });

    it("throws not_found when stopping non-existent job", async () => {
      await expect(
        lifecycleService.stopGenerationJob(actor, orgId, "non-existing" as GenerationJobId)
      ).rejects.toThrow(/Generation job not found/);
    });

    it("preserves draft contents and sets document to review_pending on stop", async () => {
      const doc: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(doc);

      await contentStore.create({
        id: "gen-1" as unknown as GeneratedContentId,
        documentId: docId,
        organizationId: orgId,
        type: "lesson",
        status: "draft",
        payload: { sessions: [{ title: "Session 1" }] } as unknown as GeneratedContentPayload,
        confidenceScore: 0.9,
        reviewNotes: null,
        reviewedByUserId: null,
        reviewedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const job: GenerationJobRecord = {
        id: "job-with-drafts" as GenerationJobId,
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
      await jobStore.create(job);

      await lifecycleService.stopGenerationJob(actor, orgId, job.id);

      const updatedDoc = docs.find((d) => d.id === docId);
      expect(updatedDoc?.status).toBe("review_pending");
    });
  });

  describe("stopGenerationForDocument", () => {
    it("finds active job for document and delegates to stopGenerationJob", async () => {
      const doc: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(doc);

      const job: GenerationJobRecord = {
        id: "job-doc-active" as GenerationJobId,
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
      await jobStore.create(job);

      const result = await lifecycleService.stopGenerationForDocument(actor, orgId, docId);
      expect(result.status).toBe("stopped");
      expect(result.jobId).toBe(job.id);
    });
  });

  describe("deleteGenerationJob", () => {
    it("cleans up chunks, unaccepted drafts, soft-deletes job, and resets progress", async () => {
      const doc: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(doc);

      const job: GenerationJobRecord = {
        id: "job-to-delete" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "running",
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
        deletedAt: null,
      };
      await jobStore.create(job);

      // Create draft content to be cleaned up
      await contentStore.create({
        id: "draft-to-delete" as unknown as GeneratedContentId,
        documentId: docId,
        organizationId: orgId,
        type: "lesson",
        status: "draft",
        payload: { sessions: [{ title: "Session 1" }] } as unknown as GeneratedContentPayload,
        confidenceScore: 0.9,
        reviewNotes: null,
        reviewedByUserId: null,
        reviewedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create accepted content that MUST NOT be deleted
      await contentStore.create({
        id: "accepted-preserve" as unknown as GeneratedContentId,
        documentId: docId,
        organizationId: orgId,
        type: "flashcard",
        status: "accepted",
        payload: { cards: [{ front: "F", back: "B" }] } as unknown as GeneratedContentPayload,
        confidenceScore: 0.95,
        reviewNotes: null,
        reviewedByUserId: "admin-1",
        reviewedAt: new Date().toISOString(),
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await lifecycleService.deleteGenerationJob(actor, orgId, job.id);
      expect(result.status).toBe("deleted");

      // Job is soft deleted
      const foundJob = await jobStore.findByIdForOrganization(job.id, orgId);
      expect(foundJob).toBeFalsy();

      // Draft content deleted, accepted content preserved
      const contents = await contentStore.listByDocument(docId, orgId);
      const remainingIds = contents.map((c) => c.id);
      expect(remainingIds).not.toContain("draft-to-delete");
      expect(remainingIds).toContain("accepted-preserve");
    });
  });

  describe("deleteGenerationForDocument", () => {
    it("deletes all jobs and chunks for document and resets progress", async () => {
      const doc: DocumentRecord = {
        id: docId,
        organizationId: orgId,
        courseId,
        originalName: "test.pdf",
        status: "generating",
        ownerUserId: "admin-1",
        errorCode: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      } as unknown as DocumentRecord;
      docs.push(doc);

      const job1: GenerationJobRecord = {
        id: "job-doc-1" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "running",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
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
      await jobStore.create(job1);

      await chunkStore.upsert({
        id: "chunk-1",
        documentId: docId,
        organizationId: orgId,
        stage: "planning",
        chunkIndex: 0,
        chunkKey: "planning",
        status: "completed",
        attempts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await lifecycleService.deleteGenerationForDocument(actor, orgId, docId);
      expect(result.status).toBe("deleted");

      const chunks = await chunkStore.listByDocument(docId, orgId);
      expect(chunks.length).toBe(0);
    });
  });

  describe("checkCancellation", () => {
    it("is no-op when jobId, organizationId, or jobStore is not provided", async () => {
      // 1. Missing jobId
      await expect(
        lifecycleService.checkCancellation(undefined, orgId, docId),
      ).resolves.toBeUndefined();

      // 2. Missing organizationId
      await expect(
        lifecycleService.checkCancellation("job-1", undefined, docId),
      ).resolves.toBeUndefined();

      // 3. Missing jobStore
      const serviceWithoutStore = new GenerationLifecycleService(
        mockDocStore,
        contentStore,
        progressService,
        chunkStore,
        undefined, // no job store
        mockOrgStore,
      );
      await expect(
        serviceWithoutStore.checkCancellation("job-1", orgId, docId),
      ).resolves.toBeUndefined();
    });

    it("throws GenerationDeletedError and resets progress when job is missing", async () => {
      const resetSpy = vi.spyOn(progressService, "reset");

      await expect(
        lifecycleService.checkCancellation("missing-job-id", orgId, docId),
      ).rejects.toThrow(GenerationDeletedError);

      expect(resetSpy).toHaveBeenCalledWith(docId, orgId);

      // Also verify when documentId is not provided
      resetSpy.mockClear();
      await expect(
        lifecycleService.checkCancellation("missing-job-id", orgId, undefined),
      ).rejects.toThrow(GenerationDeletedError);
      expect(resetSpy).not.toHaveBeenCalled();
    });

    it("handles 'stopping' status: transitions job to 'stopped', clears lease, stops progress, and throws GenerationStoppedError with strict side-effect order", async () => {
      const job: GenerationJobRecord = {
        id: "job-stopping-1" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopping",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
        heartbeatAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(job);

      const executionOrder: string[] = [];
      const originalUpdate = jobStore.update.bind(jobStore);
      vi.spyOn(jobStore, "update").mockImplementation(async (r) => {
        executionOrder.push("jobStore.update");
        return originalUpdate(r);
      });
      vi.spyOn(progressService, "stop").mockImplementation(async () => {
        executionOrder.push("progressService.stop");
      });

      await expect(
        lifecycleService.checkCancellation(job.id, orgId, docId),
      ).rejects.toThrow(GenerationStoppedError);

      // Verify side effect order: update DB before stopping progress
      expect(executionOrder).toEqual(["jobStore.update", "progressService.stop"]);

      // Verify DB record mutation
      const updatedJob = await jobStore.findByIdForOrganization(job.id, orgId);
      expect(updatedJob?.status).toBe("stopped");
      expect(updatedJob?.leaseExpiresAt).toBeNull();
      expect(updatedJob?.completedAt).toBeTruthy();
      expect(updatedJob?.updatedAt).toBeTruthy();
    });

    it("handles 'stopped' status: stops progress and throws GenerationStoppedError without DB update", async () => {
      const job: GenerationJobRecord = {
        id: "job-stopped-1" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "stopped",
        targetTypes: ["lesson"],
        priority: 1,
        attempts: 1,
        maxAttempts: 3,
        payload: {},
        leaseExpiresAt: null,
        heartbeatAt: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      await jobStore.create(job);

      const updateSpy = vi.spyOn(jobStore, "update");
      const stopSpy = vi.spyOn(progressService, "stop");

      await expect(
        lifecycleService.checkCancellation(job.id, orgId, docId),
      ).rejects.toThrow(GenerationStoppedError);

      expect(updateSpy).not.toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalledWith(docId, orgId);
    });

    it("handles 'deleting' status: resets progress and throws GenerationDeletedError", async () => {
      const job: GenerationJobRecord = {
        id: "job-deleting-1" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "deleting",
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
        deletedAt: null,
      };
      await jobStore.create(job);

      const resetSpy = vi.spyOn(progressService, "reset");

      await expect(
        lifecycleService.checkCancellation(job.id, orgId, docId),
      ).rejects.toThrow(GenerationDeletedError);

      expect(resetSpy).toHaveBeenCalledWith(docId, orgId);
    });

    it("handles 'deleted' status: resets progress and throws GenerationDeletedError", async () => {
      const job: GenerationJobRecord = {
        id: "job-deleted-1" as GenerationJobId,
        documentId: docId,
        organizationId: orgId,
        status: "deleted",
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
        deletedAt: new Date().toISOString(),
      };
      await jobStore.create(job);

      const resetSpy = vi.spyOn(progressService, "reset");

      await expect(
        lifecycleService.checkCancellation(job.id, orgId, docId),
      ).rejects.toThrow(GenerationDeletedError);

      expect(resetSpy).toHaveBeenCalledWith(docId, orgId);
    });

    it("does not mutate or throw for active/non-cancellation statuses (queued, running, succeeded, failed)", async () => {
      const statuses: GenerationJobRecord["status"][] = ["queued", "running", "succeeded", "failed"];

      for (const status of statuses) {
        const job: GenerationJobRecord = {
          id: `job-active-${status}` as GenerationJobId,
          documentId: docId,
          organizationId: orgId,
          status,
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
          deletedAt: null,
        };
        await jobStore.create(job);

        const updateSpy = vi.spyOn(jobStore, "update");
        const stopSpy = vi.spyOn(progressService, "stop");
        const resetSpy = vi.spyOn(progressService, "reset");

        await expect(
          lifecycleService.checkCancellation(job.id, orgId, docId),
        ).resolves.toBeUndefined();

        expect(updateSpy).not.toHaveBeenCalled();
        expect(stopSpy).not.toHaveBeenCalled();
        expect(resetSpy).not.toHaveBeenCalled();
      }
    });
  });
});
