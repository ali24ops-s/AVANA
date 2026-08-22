/**
 * Generation queue abstraction (PR6-5).
 *
 * Decouples the API route layer from the job-queue implementation (BullMQ).
 * The route layer depends only on this interface; the concrete BullMQ-backed
 * implementation is wired at the composition root.
 *
 * Design goals:
 * - The queue enqueues a job and persists a `generation_jobs` row so the
 *   lifecycle is tracked even before (or without) BullMQ processing.
 * - The job payload carries the actor, org scope, document, requested types,
 *   prompt version, and idempotency key. No raw chunk text is ever stored in
 *   the queue payload.
 * - The worker calls the existing `GenerationService.generateForDocument`
 *   unchanged (no duplication of generation logic).
 */

import type {
  Actor,
  CourseId,
  DocumentId,
  GenerationJobId,
  OrganizationId,
} from "@avana/domain";
import type { GeneratedContentType } from "@avana/domain";
import type { GenerationJobStore } from "./generation-jobs-store.js";
import type { GenerationService } from "./generation-service.js";

/**
 * Payload handed to the queue for a generation job.
 */
export type GenerationJobPayload = {
  actorUserId: Actor["userId"];
  actorRole: Actor["role"];
  organizationId: OrganizationId;
  documentId: DocumentId;
  courseId: CourseId;
  types: GeneratedContentType[];
  promptVersion?: string;
  generationKey?: string;
};

/**
 * Result of enqueueing a generation job.
 */
export type EnqueueGenerationResult = {
  generationJobId: GenerationJobId;
  /** The queue implementation's job id (e.g. BullMQ job id). */
  jobId: string | null;
  status: "queued" | "running" | "succeeded" | "failed";
};

/**
 * Queue abstraction used by the API to submit generation work.
 */
export interface GenerationQueue {
  /**
   * Persist a `generation_jobs` row and enqueue the job for async processing.
   * Returns the job id the client can poll.
   */
  enqueueGenerationJob(
    payload: GenerationJobPayload,
  ): Promise<EnqueueGenerationResult>;
}

/**
 * A local in-memory queue used for tests and local development without Redis.
 *
 * Persists the generation_jobs row (via the store) and executes generation
 * asynchronously via GenerationService when provided.
 */
export class InMemoryGenerationQueue implements GenerationQueue {
  private generationService?: GenerationService;

  constructor(
    private readonly jobStore: GenerationJobStore,
    generationService?: GenerationService,
  ) {
    this.generationService = generationService;
  }

  setGenerationService(service: GenerationService): void {
    this.generationService = service;
  }

  async enqueueGenerationJob(
    payload: GenerationJobPayload,
  ): Promise<EnqueueGenerationResult> {
    const now = new Date().toISOString();
    const jobId = this.newJobId();
    const record = {
      id: jobId,
      organizationId: payload.organizationId,
      documentId: payload.documentId,
      courseId: payload.courseId,
      type: payload.types.join(","),
      status: "queued" as const,
      generationKey: payload.generationKey ?? null,
      jobId: null,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      deletedAt: null,
    };
    await this.jobStore.create(record as never);

    if (this.generationService) {
      const service = this.generationService;
      setTimeout(async () => {
        try {
          const startedAt = new Date().toISOString();
          await this.jobStore.update({
            ...record,
            status: "running",
            attempts: 1,
            startedAt,
            updatedAt: startedAt,
          });

          await service.generateForDocument(
            {
              userId: payload.actorUserId,
              role: payload.actorRole,
            },
            payload.organizationId,
            payload.documentId,
            {
              courseId: payload.courseId,
              types: payload.types,
              promptVersion: payload.promptVersion,
              generationKey: payload.generationKey,
            },
          );

          const completedAt = new Date().toISOString();
          await this.jobStore.update({
            ...record,
            status: "succeeded",
            attempts: 1,
            startedAt,
            completedAt,
            updatedAt: completedAt,
          });
        } catch (err: unknown) {
          const failedAt = new Date().toISOString();
          const errorAny = err as any;
          const errorCode =
            errorAny?.code && typeof errorAny.code === "string"
              ? errorAny.code
              : "generation_failed";
          const errorMessage = err instanceof Error ? err.message : String(err);
          await this.jobStore.update({
            ...record,
            status: "failed",
            attempts: 1,
            errorCode,
            errorMessage,
            updatedAt: failedAt,
          });
        }
      }, 50);
    }

    return {
      generationJobId: record.id,
      jobId: null,
      status: "queued",
    };
  }

  private newJobId(): GenerationJobId {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID() as GenerationJobId;
    }
    // Fallback for environments without global crypto.randomUUID.
    return `job-${Date.now()}-${Math.random().toString(36).slice(2)}` as unknown as GenerationJobId;
  }
}
