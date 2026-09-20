/**
 * Generation job processor.
 *
 * Consumes `content_generate` jobs from the BullMQ queue and calls the
 * existing worker-ready `GenerationService.generateForDocument` unchanged —
 * there is no duplication of generation logic. The processor is responsible
 * only for job lifecycle accounting:
 *
 *   queued → running → succeeded
 *                   ↘ failed   (with error_code/message + attempts)
 *
 * Idempotency:
 *  - The job id is the same as the `generation_jobs` row id (set by the
 *    producer via BullMQ's `jobId` option), so a redelivered job targets the
 *    same DB row.
 *  - `GenerationService` re-authorizes and enforces `generation_key`
 *    idempotency, so a duplicated draft is never created.
 *
 * On failure the processor rethrows so BullMQ applies its retry/backoff
 * policy; the row is marked `failed` (with the current attempt count) and a
 * `generation.failed` audit event is emitted by the service.
 */

import { Worker, type Job } from "bullmq";
import {
  DomainError,
  type Actor,
  type CourseId,
  type DocumentId,
  type GenerationJobId,
  type OrganizationId,
  type GeneratedContentType,
} from "@avana/domain";
import {
  GenerationService,
  GenerationStoppedError,
  GenerationDeletedError,
} from "./generation-service.js";
import type { GenerationJobStore } from "./generation-jobs-store.js";
import type { GenerationJobPayload, GenerationContext } from "./generation-queue.js";
import type { WalletService } from "../wallet/wallet-service.js";
import type { WalletStore } from "../wallet/wallet-store.js";
import { refundGenerationJobDebit } from "./generation-refund-helper.js";

export type GenerationProcessorDeps = {
  generationService?: GenerationService;
  adminGenerationService?: GenerationService;
  userGenerationService?: GenerationService;
  generationJobStore: GenerationJobStore;
  walletService?: WalletService;
  walletStore?: WalletStore;
};

/**
 * Read the BullMQ job payload as a GenerationJobPayload.
 */
function toPayload(job: Job): GenerationJobPayload {
  const data = job.data as Record<string, unknown>;
  return {
    actorUserId: data.actorUserId as Actor["userId"],
    actorRole: data.actorRole as Actor["role"],
    organizationId: data.organizationId as OrganizationId,
    documentId: data.documentId as DocumentId,
    courseId: data.courseId as CourseId,
    types: (data.types as GeneratedContentType[]) ?? ["lesson"],
    promptVersion:
      typeof data.promptVersion === "string" ? data.promptVersion : undefined,
    generationKey:
      typeof data.generationKey === "string" ? data.generationKey : undefined,
    force: typeof data.force === "boolean" ? data.force : undefined,
    generationContext:
      data.generationContext === "admin" || data.generationContext === "public"
        ? (data.generationContext as GenerationContext)
        : undefined,
  };
}

/**
 * Build the actor the service authorizes with. The service's policy layer
 * re-authorizes `content:generate` using the actor's role; ownership scoping
 * is preserved because the document is resolved org-scoped.
 */
function toActor(payload: GenerationJobPayload): Actor {
  return {
    userId: payload.actorUserId,
    role: payload.actorRole,
  };
}

/**
 * Mark a job row as running (started_at set, status running, lease acquired).
 */
async function markRunning(
  jobStore: GenerationJobStore,
  jobId: GenerationJobId,
  payload: GenerationJobPayload,
): Promise<{ leaseExpiresAt: string }> {
  const existing = await jobStore.findByIdForOrganization(
    jobId,
    payload.organizationId,
  );
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + 600_000).toISOString();

  if (existing) {
    if (
      existing.status === "stopped" ||
      existing.status === "stopping" ||
      existing.status === "deleting" ||
      existing.status === "deleted"
    ) {
      return { leaseExpiresAt: existing.leaseExpiresAt ?? now };
    }
    await jobStore.update({
      ...existing,
      status: "running",
      attempts: existing.attempts + 1,
      startedAt: existing.startedAt ?? now,
      heartbeatAt: now,
      leaseExpiresAt,
      updatedAt: now,
    });
  }

  return { leaseExpiresAt };
}

/**
 * Mark a job row as succeeded (completed_at set, status succeeded, lease cleared).
 */
async function markSucceeded(
  jobStore: GenerationJobStore,
  jobId: GenerationJobId,
  payload: GenerationJobPayload,
): Promise<void> {
  const existing = await jobStore.findByIdForOrganization(
    jobId,
    payload.organizationId,
  );
  if (
    !existing ||
    existing.status === "stopped" ||
    existing.status === "stopping" ||
    existing.status === "deleting" ||
    existing.status === "deleted"
  ) {
    return;
  }

  const now = new Date().toISOString();
  await jobStore.update({
    ...existing,
    status: "succeeded",
    errorCode: null,
    errorMessage: null,
    leaseExpiresAt: null,
    completedAt: now,
    updatedAt: now,
  });
}

/**
 * Mark a job row as failed (completed_at set, status failed, error captured, lease cleared).
 */
async function markFailed(
  jobStore: GenerationJobStore,
  jobId: GenerationJobId,
  payload: GenerationJobPayload,
  err: unknown,
): Promise<{ errorCode: string; errorMessage: string }> {
  const existing = await jobStore.findByIdForOrganization(
    jobId,
    payload.organizationId,
  );
  const now = new Date().toISOString();
  const errorCode = resolveErrorCode(err);
  const errorMessage = err instanceof Error ? err.message : String(err);

  if (
    existing &&
    existing.status !== "stopped" &&
    existing.status !== "stopping" &&
    existing.status !== "deleting" &&
    existing.status !== "deleted"
  ) {
    await jobStore.update({
      ...existing,
      status: "failed",
      errorCode,
      errorMessage,
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    });
  }

  return { errorCode, errorMessage };
}

/**
 * Resolve a stable error code from an unknown error.
 */
function resolveErrorCode(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    return (err as { code: string }).code;
  }
  return "generation_failed";
}

/**
 * Helper to atomically refund a generation debit if one exists for the given job.
 */
async function refundGenerationDebit(
  deps: GenerationProcessorDeps,
  jobId: GenerationJobId,
  payload: GenerationJobPayload,
  reason: string,
): Promise<void> {
  await refundGenerationJobDebit({
    walletService: deps.walletService,
    walletStore: deps.walletStore,
    jobId,
    actorUserId: payload.actorUserId,
    documentId: payload.documentId,
    organizationId: payload.organizationId,
    reason,
  });
}

/**
 * The BullMQ processor function for a single generation job.
 *
 * @throws on failure so BullMQ retries with its configured backoff.
 */
export async function processGenerationJob(
  job: Job,
  deps: GenerationProcessorDeps,
): Promise<{ job_id: GenerationJobId; status: "succeeded" | "stopped" | "deleted" }> {
  const payload = toPayload(job);
  const jobId = job.id as unknown as GenerationJobId;
  const { generationJobStore } = deps;

  const isActorAdmin =
    payload.actorRole === "platform_admin" ||
    payload.actorRole === "organization_admin" ||
    payload.actorRole === "course_editor";
  const effectiveContext: GenerationContext =
    payload.generationContext ?? (isActorAdmin ? "admin" : "public");

  const service =
    effectiveContext === "admin"
      ? (deps.adminGenerationService ?? deps.generationService)
      : (deps.userGenerationService ?? deps.generationService);

  if (!service) {
    throw new DomainError(
      "bad_request",
      `No GenerationService configured for generation context '${effectiveContext}'`,
    );
  }

  process.stdout.write(
    `[GENERATION] job claimed: ${jobId} (doc: ${payload.documentId}, context: ${effectiveContext})\n`,
  );

  // 1. Pre-execution check: is job already stopping, stopped, deleting, or deleted?
  const existingJob = await deps.generationJobStore.findByIdForOrganization(
    jobId,
    payload.organizationId,
  );
  if (!existingJob || existingJob.status === "deleted" || existingJob.status === "deleting") {
    process.stdout.write(`[GENERATION] job ${jobId} is already deleted/deleting. Skipping execution.\n`);
    return { job_id: jobId, status: "deleted" };
  }
  if (existingJob.status === "stopped" || existingJob.status === "stopping") {
    process.stdout.write(`[GENERATION] job ${jobId} is in status '${existingJob.status}'. Finalizing stop.\n`);
    const now = new Date().toISOString();
    await deps.generationJobStore.update({
      ...existingJob,
      status: "stopped",
      leaseExpiresAt: null,
      completedAt: now,
      updatedAt: now,
    });
    await refundGenerationDebit(deps, jobId, payload, "job_stopped_pre_execution");
    return { job_id: jobId, status: "stopped" };
  }

  // Mark running (idempotent — reuses existing started_at) and acquire 10-minute lease.
  const { leaseExpiresAt } = await markRunning(deps.generationJobStore, jobId, payload);
  process.stdout.write(`[GENERATION] lease acquired: ${jobId} (expires: ${leaseExpiresAt})\n`);
  process.stdout.write(`[GENERATION] generation started: ${jobId} (types: ${payload.types.join(",")}, context: ${effectiveContext})\n`);

  try {
    await service.generateForDocument(
      toActor(payload),
      payload.organizationId,
      payload.documentId,
      {
        types: payload.types,
        promptVersion: payload.promptVersion,
        generationKey: payload.generationKey,
        courseId: payload.courseId,
        force: payload.force,
        jobId,
        generationContext: effectiveContext,
      },
    );

    // Re-check job status after pipeline finishes
    const finalJob = await generationJobStore.findByIdForOrganization(
      jobId,
      payload.organizationId,
    );
    if (finalJob?.status === "stopped") {
      process.stdout.write(`[GENERATION] job finished in stopped state: ${jobId}\n`);
      await refundGenerationDebit(deps, jobId, payload, "job_stopped_post_execution");
      return { job_id: jobId, status: "stopped" };
    }
    if (finalJob?.status === "deleted" || !finalJob) {
      process.stdout.write(`[GENERATION] job finished in deleted state: ${jobId}\n`);
      return { job_id: jobId, status: "deleted" };
    }

    await markSucceeded(generationJobStore, jobId, payload);
    process.stdout.write(`[GENERATION] job completed: ${jobId}\n`);
    return { job_id: jobId, status: "succeeded" };
  } catch (err) {
    if (
      err instanceof GenerationStoppedError ||
      (err instanceof Error && err.name === "GenerationStoppedError")
    ) {
      process.stdout.write(`[GENERATION] job caught stopped error: ${jobId}\n`);
      await refundGenerationDebit(deps, jobId, payload, "job_stopped_error");
      return { job_id: jobId, status: "stopped" };
    }
    if (
      err instanceof GenerationDeletedError ||
      (err instanceof Error && err.name === "GenerationDeletedError")
    ) {
      process.stdout.write(`[GENERATION] job caught deleted error: ${jobId}\n`);
      return { job_id: jobId, status: "deleted" };
    }

    const { errorCode, errorMessage } = await markFailed(generationJobStore, jobId, payload, err);
    process.stderr.write(`[GENERATION] job failed: ${jobId} (error: ${errorMessage}, code: ${errorCode})\n`);
    await refundGenerationDebit(deps, jobId, payload, `job_failed:${errorCode}`);
    throw err;
  }
}

/**
 * Create a BullMQ Worker bound to the generation processor.
 */
export function createGenerationWorker(
  connection: { url: string },
  queueName: string,
  deps: GenerationProcessorDeps,
): Worker {
  return new Worker(queueName, async (job) => processGenerationJob(job, deps), {
    connection: { url: connection.url },
    concurrency: 1,
    lockDuration: 600_000,
  });
}
