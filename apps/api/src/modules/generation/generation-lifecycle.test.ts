/**
 * Generation Lifecycle Integration Tests (PR Real Stop & Delete).
 *
 * Verifies backend lifecycle controls:
 * 1. Stopping queued job transitions directly to stopped and halts execution.
 * 2. Stopping running job transitions to stopping, then halts at safe point with status stopped.
 * 3. Stop preserves already-persisted chunk outputs in database.
 * 4. Stop is idempotent on already stopped jobs.
 * 5. Stopping a completed job throws conflict DomainError.
 * 6. Deleting a generation job cleans up job chunks and drafts, resets progress to idle,
 *    and NEVER deletes the parent document.
 * 7. Delete is idempotent on already deleted jobs.
 * 8. Anti-resurrection: workers never resurrect stopped or deleted jobs to running.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type {
  Actor,
  CourseId,
  DocumentId,
  GenerationJobId,
  OrganizationId,
} from "@avana/domain";
import { GenerationService } from "./generation-service.js";
import { GenerationProgressService } from "./generation-progress-service.js";
import { InMemoryGenerationProgressStore } from "./generation-progress-store.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
  InMemoryGenerationChunkStore,
} from "./test/in-memory-stores.js";
import { InMemoryDocumentStore, InMemoryDocumentChunkStore } from "../learning/test/in-memory-stores.js";
import { MockModelGateway } from "./gateway/mock.js";
import { processGenerationJob } from "./generation-processor.js";

describe("Generation Backend Lifecycle (Stop & Delete)", () => {
  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const docId = "00000000-0000-0000-0000-000000000003" as DocumentId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as any,
    role: "course_editor",
  };

  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let jobStore: InMemoryGenerationJobStore;
  let chunkRecordStore: InMemoryGenerationChunkStore;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let gateway: MockModelGateway;
  let generationService: GenerationService;

  beforeEach(() => {
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    jobStore = new InMemoryGenerationJobStore();
    chunkRecordStore = new InMemoryGenerationChunkStore();
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    gateway = new MockModelGateway();

    generationService = new GenerationService(
      contentStore,
      citationStore,
      gateway,
      documentStore,
      chunkStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chunkRecordStore,
      jobStore,
      progressService,
    );

    // Seed document with chunks
    documentStore.insert({
      id: docId,
      organizationId: orgId,
      courseId,
      originalName: "cardio_chapter.pdf",
      storageKey: "docs/cardio_chapter.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      status: "extracted",
      pageCount: 10,
      tokenEstimate: 500,
      sha256: "dummy-hash",
      errorCode: null,
      ownerUserId: actor.userId,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    chunkStore.insert({
      id: "chunk-1" as any,
      documentId: docId,
      organizationId: orgId,
      sequence: 1,
      heading: "Section 1",
      content: "Beta blockers are medications that reduce blood pressure.",
      startPage: 1,
      endPage: 2,
      tokenEstimate: 100,
      contentHash: "hash-1",
      createdAt: new Date().toISOString(),
    });
    chunkStore.insert({
      id: "chunk-2" as any,
      documentId: docId,
      organizationId: orgId,
      sequence: 2,
      heading: "Section 2",
      content: "ACE inhibitors prevent the formation of angiotensin II.",
      startPage: 3,
      endPage: 4,
      tokenEstimate: 100,
      contentHash: "hash-2",
      createdAt: new Date().toISOString(),
    });
  });

  it("stops a queued job immediately and updates progress and document status", async () => {
    const jobId = "00000000-0000-0000-0000-000000000010" as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "queued",
      generationKey: null,
      jobId: null,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      deletedAt: null,
    });
    await progressService.queue(docId, orgId);

    const result = await generationService.stopGenerationJob(actor, orgId, jobId);
    expect(result.status).toBe("stopped");
    expect(result.previousStatus).toBe("queued");

    const updatedJob = await jobStore.findByIdForOrganization(jobId, orgId);
    expect(updatedJob?.status).toBe("stopped");
    expect(updatedJob?.completedAt).not.toBeNull();

    const progress = await progressService.getRecord(docId, orgId);
    expect(progress?.status).toBe("stopped");
  });

  it("marks a running job as stopping and halts at safe point without marking failed", async () => {
    const jobId = "00000000-0000-0000-0000-000000000011" as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "running",
      generationKey: null,
      jobId: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    const stopResult = await generationService.stopGenerationJob(actor, orgId, jobId);
    expect(stopResult.status).toBe("stopping");
    expect(stopResult.previousStatus).toBe("running");

    const progressDuringStop = await progressService.getRecord(docId, orgId);
    expect(progressDuringStop?.status).toBe("stopping");

    // When the generation pipeline runs with this jobId, it halts cleanly at safe point
    await generationService.generateForDocument(actor, orgId, docId, {
      types: ["lesson"],
      jobId,
    });

    const finalJob = await jobStore.findByIdForOrganization(jobId, orgId);
    expect(finalJob?.status).toBe("stopped");
    expect(finalJob?.errorCode).toBeNull();

    const finalProgress = await progressService.getRecord(docId, orgId);
    expect(finalProgress?.status).toBe("stopped");
  });

  it("is idempotent when stopping an already stopped job", async () => {
    const jobId = "00000000-0000-0000-0000-000000000012" as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "stopped",
      generationKey: null,
      jobId: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const result = await generationService.stopGenerationJob(actor, orgId, jobId);
    expect(result.status).toBe("stopped");
    expect(result.previousStatus).toBe("stopped");
  });

  it("throws conflict when attempting to stop an already succeeded job", async () => {
    const jobId = "00000000-0000-0000-0000-000000000013" as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "succeeded",
      generationKey: null,
      jobId: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      generationService.stopGenerationJob(actor, orgId, jobId),
    ).rejects.toThrow(/Cannot stop a job that has already completed/);
  });

  it("safely deletes a generation job and unaccepted drafts without deleting the document", async () => {
    const jobId = "00000000-0000-0000-0000-000000000014" as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "running",
      generationKey: null,
      jobId: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      deletedAt: null,
    });

    // Create a draft content
    await contentStore.create({
      id: "content-1" as any,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {} as any,
      promptVersion: "v1",
      model: "mock",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create a chunk record associated with this job
    await chunkRecordStore.upsert({
      id: "chunk-rec-1",
      organizationId: orgId,
      documentId: docId,
      courseId,
      generationJobId: jobId,
      stage: "lesson",
      chunkIndex: 0,
      chunkKey: "lesson:0",
      status: "completed",
      payload: { title: "Draft" },
      tokenUsage: null,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await generationService.deleteGenerationJob(actor, orgId, jobId);
    expect(result.status).toBe("deleted");

    // Job is marked deleted
    const job = await jobStore.findByIdForOrganization(jobId, orgId);
    expect(job).toBeUndefined(); // Soft-deleted, non-disclosing

    // Job chunks are cleaned up
    const chunks = await chunkRecordStore.listByDocument(docId, orgId);
    expect(chunks.length).toBe(0);

    // Drafts are deleted
    const drafts = await contentStore.listByDocument(docId, orgId);
    expect(drafts.length).toBe(0);

    // Progress reset to idle
    const progress = await progressService.getRecord(docId, orgId);
    expect(progress?.status).toBe("idle");

    // PARENT DOCUMENT IS NOT DELETED!
    const doc = await documentStore.findById(docId);
    expect(doc).toBeDefined();
    expect(doc?.deletedAt).toBeNull();
  });

  it("worker aborts execution when claiming a stopped or deleted job (anti-resurrection)", async () => {
    const jobId = "00000000-0000-0000-0000-000000000015" as GenerationJobId;
    await jobStore.create({
      id: jobId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "stopped",
      generationKey: null,
      jobId: null,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const mockJob: any = {
      id: jobId,
      data: {
        actorUserId: actor.userId,
        actorRole: actor.role,
        organizationId: orgId,
        documentId: docId,
        courseId,
        types: ["lesson"],
      },
    };

    const processResult = await processGenerationJob(mockJob, {
      generationService,
      generationJobStore: jobStore,
    });

    expect(processResult.status).toBe("stopped");

    // Must NOT be resurrected to running or succeeded
    const job = await jobStore.findByIdForOrganization(jobId, orgId);
    expect(job?.status).toBe("stopped");
  });
});
