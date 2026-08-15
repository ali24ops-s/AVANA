/**
 * BullMQ-backed generation queue implementation (PR6-5).
 *
 * Implements the `GenerationQueue` interface using BullMQ + ioredis. The
 * producer enqueues a job on the `content_generate` queue and persists a
 * `generation_jobs` row via the `GenerationJobStore` so the lifecycle is
 * tracked in the database.
 *
 * The job `jobId` is set to our own `generation_jobs` id (via BullMQ's
 * `jobId` option) so BullMQ's job id matches our DB id — this makes
 * redelivery idempotent and lets the API map a client-facing job id to the
 * queue entry directly.
 *
 * The worker consumes these jobs and calls `GenerationService` unchanged.
 * This module is only wired in environments with Redis (production / local
 * dev with Redis up). Tests use `InMemoryGenerationQueue`.
 */

import { Queue } from "bullmq";
import type { GenerationJobId } from "@avana/domain";
import type {
  GenerationQueue,
  GenerationJobPayload,
  EnqueueGenerationResult,
} from "./generation-queue.js";
import type { GenerationJobStore } from "./generation-jobs-store.js";

export type BullMqGenerationQueueOptions = {
  jobStore: GenerationJobStore;
  connection: { url: string };
  queueName?: string;
  newJobId?: () => GenerationJobId;
};

/**
 * BullMQ-backed queue. Assumes Redis is available.
 */
export class BullMqGenerationQueue implements GenerationQueue {
  private readonly queue: Queue;
  private readonly jobStore: GenerationJobStore;
  private readonly queueName: string;
  private readonly newJobId: () => GenerationJobId;

  constructor(options: BullMqGenerationQueueOptions) {
    this.jobStore = options.jobStore;
    this.queueName = options.queueName ?? "content_generate";
    this.newJobId =
      options.newJobId ?? (() => crypto.randomUUID() as GenerationJobId);
    this.queue = new Queue(this.queueName, {
      connection: { url: options.connection.url },
    });
  }

  async enqueueGenerationJob(
    payload: GenerationJobPayload,
  ): Promise<EnqueueGenerationResult> {
    const generationJobId = this.newJobId();
    const now = new Date().toISOString();

    // Persist the job row first (status queued).
    await this.jobStore.create({
      id: generationJobId,
      organizationId: payload.organizationId,
      documentId: payload.documentId,
      courseId: payload.courseId,
      type: payload.types.join(","),
      status: "queued",
      generationKey: payload.generationKey ?? null,
      jobId: generationJobId,
      attempts: 0,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      deletedAt: null,
    });

    // Enqueue the job with the same id (idempotent redelivery; jobId matches DB).
    await this.queue.add("generate", this.toBullPayload(payload), {
      jobId: generationJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: false,
      removeOnFail: false,
    });

    return { generationJobId, jobId: generationJobId, status: "queued" };
  }

  private toBullPayload(
    payload: GenerationJobPayload,
  ): Record<string, unknown> {
    return {
      actorUserId: payload.actorUserId,
      actorRole: payload.actorRole,
      organizationId: payload.organizationId,
      documentId: payload.documentId,
      courseId: payload.courseId,
      types: payload.types,
      promptVersion: payload.promptVersion,
      generationKey: payload.generationKey,
    };
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export type {
  GenerationJobPayload,
  EnqueueGenerationResult,
} from "./generation-queue.js";
