/**
 * AVANA Exam Studio — Batched AI Exam Generation Processor & Worker (Phase 2).
 *
 * Implements the complete multi-chapter generation lifecycle:
 * 1. Atomic Claim with Fencing Token (retry_count) & 120s Lease.
 * 2. Already-completed path with automatic Task & Operation reconciliation.
 * 3. Exact missing slot calculation (preserves existing valid questions).
 * 4. Grounded lesson content validation (rejects chapters without content).
 * 5. Periodic 20s Heartbeat with AbortController for Gemini network requests.
 * 6. Structured output parsing & rigorous 4-choice validation.
 * 7. Transactional persistence with Fencing Token validation and FOR UPDATE locking.
 * 8. Conditional lease release on transient errors for fast BullMQ retries.
 * 9. Serialized Task and Operation state machine reconciliation.
 */

import { Worker, type Job, UnrecoverableError } from "bullmq";
import {
  DomainError,
  asOrganizationId,
  asDocumentId,
  type StudioExamPatternSnapshot,
} from "@avana/domain";
import type { ModelGateway } from "../generation/gateway/types.js";
import { cleanAndParseJson } from "../generation/engine/resilient-json-parser.js";
import {
  STUDIO_EXAM_BATCH_QUEUE_NAME,
  type StudioExamBatchJobPayload,
} from "./studio-exam-queue.js";
import {
  FencingTokenStaleError,
  WorkerStopError,
  type WorkerStopReason,
  type StudioExamStore,
} from "./studio-exam-store.js";
import {
  STUDIO_EXAM_SYSTEM_PROMPT,
  buildStudioExamUserPrompt,
  type MissingSlotInstruction,
} from "./studio-exam-prompt-builder.js";
import {
  validateStudioExamQuestions,
  type QuestionPatternMeta,
} from "./studio-exam-validator.js";
import {
  shuffleAndBalanceStudioQuestions,
} from "./studio-question-quality.js";

export const HEARTBEAT_INTERVAL_MS = 20_000; // 20 seconds
export const LEASE_DURATION_SECONDS = 120; // 2 minutes

export interface StudioExamProcessorDeps {
  store: StudioExamStore;
  gateway: ModelGateway;
  heartbeatIntervalMs?: number;
  leaseDurationSeconds?: number;
  logger?: (msg: string) => void;
}

export interface ProcessBatchResult {
  batchId: string;
  status: "succeeded" | "already_completed" | "superseded" | "failed";
  reason?: WorkerStopReason | string;
  generatedCount?: number;
  isCompleted?: boolean;
}

export function toBatchJobPayload(job: Job): StudioExamBatchJobPayload {
  const data = job.data as Record<string, unknown>;
  const operationId = typeof data.operationId === "string" ? data.operationId : "";
  const taskId = typeof data.taskId === "string" ? data.taskId : "";
  const batchId = typeof data.batchId === "string" ? data.batchId : "";

  if (!operationId || !taskId || !batchId) {
    throw new DomainError(
      "bad_request",
      "شناسه‌های operationId، taskId یا batchId در پی‌لود جاب نامعتبر هستند.",
      {
        operationId: typeof data.operationId === "string" ? data.operationId : null,
        taskId: typeof data.taskId === "string" ? data.taskId : null,
        batchId: typeof data.batchId === "string" ? data.batchId : null,
      },
    );
  }

  return { operationId, taskId, batchId };
}

export async function processStudioExamBatchJob(
  job: Job<StudioExamBatchJobPayload>,
  deps: StudioExamProcessorDeps,
): Promise<ProcessBatchResult> {
  const logger = deps.logger ?? ((msg) => process.stdout.write(`[studio-exam-processor] ${msg}\n`));
  const payload = toBatchJobPayload(job);
  const { batchId } = payload;
  const heartbeatMs = deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const leaseSec = deps.leaseDurationSeconds ?? LEASE_DURATION_SECONDS;

  // 1. Atomic Claim with Fencing Token
  const claim = await deps.store.claimBatch(batchId, leaseSec);

  if (!claim.claimed) {
    if (claim.reason === "already_completed") {
      logger(`Batch ${batchId} is already completed. Running reconciliation for safety.`);
      await deps.store.reconcileTaskAndOperation(payload.taskId, payload.operationId);
      return { batchId, status: "already_completed" };
    }

    if (claim.reason === "operation_cancelled" || claim.reason === "batch_cancelled") {
      logger(`Batch ${batchId} was cancelled (${claim.reason}). Exiting cleanly.`);
      return { batchId, status: "superseded", reason: claim.reason };
    }

    if (claim.reason === "active_lease_held") {
      logger(`Batch ${batchId} has an active lease held by another worker. Deferring job.`);
      throw new Error(`Batch ${batchId} is currently locked by another active worker`);
    }

    throw new DomainError("not_found", `بسته آزمون با شناسه ${batchId} جهت پردازش یافت نشد.`);
  }

  const fencingToken = claim.fencingToken!;
  logger(`Claimed batch ${batchId} with fencingToken=${fencingToken}`);

  let heartbeatTimer: NodeJS.Timeout | undefined;
  const abortController = new AbortController();

  const startHeartbeat = () => {
    heartbeatTimer = setInterval(async () => {
      try {
        const renewed = await deps.store.heartbeatBatch(batchId, fencingToken, leaseSec);
        if (!renewed) {
          logger(`Heartbeat failed for batch ${batchId} (token=${fencingToken}). Ownership lost or operation cancelled.`);
          abortController.abort(
            new WorkerStopError(
              "operation_cancelled",
              "Heartbeat rejected: Lease expired, token superseded, or operation cancelled",
            ),
          );
          clearInterval(heartbeatTimer);
        }
      } catch (hbErr) {
        logger(`Heartbeat network/db error for batch ${batchId}: ${String(hbErr)}`);
      }
    }, heartbeatMs);
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  };

  try {
    // 2. Load execution details & existing questions
    const details = await deps.store.getBatchExecutionDetails(batchId);
    if (!details) {
      throw new DomainError("not_found", `اطلاعات اجرایی بسته ${batchId} یافت نشد.`);
    }

    const { batch, task, operation, existingQuestions } = details;

    if (operation.status === "cancelled" || batch.status === "cancelled") {
      logger(`Operation ${operation.id} or batch ${batchId} is cancelled. Exiting cleanly without calling Gemini.`);
      return { batchId, status: "superseded", reason: "operation_cancelled" };
    }

    // 3. Calculate missing slots
    const allSlots = Array.from({ length: batch.targetCount }, (_, i) => i + 1);
    const existingIndices = new Set(existingQuestions.map((q) => q.questionIndex));
    const missingSlotIndices = allSlots.filter((idx) => !existingIndices.has(idx));

    if (missingSlotIndices.length === 0) {
      logger(`All ${batch.targetCount} slots are already populated for batch ${batchId}. Finalizing.`);
      const finalizeRes = await deps.store.saveBatchQuestionsAndFinalize({
        batchId,
        fencingToken,
        questions: [],
        leaseDurationSeconds: leaseSec,
      });
      await deps.store.reconcileTaskAndOperation(task.id, operation.id);
      return {
        batchId,
        status: "succeeded",
        generatedCount: finalizeRes.generatedCount,
        isCompleted: finalizeRes.isCompleted,
      };
    }

    // 4. Load scientific lesson content for this module
    const lessonContent = await deps.store.getModuleLessonContent(task.moduleId);
    if (lessonContent.totalLength < 20) {
      logger(`Module ${task.moduleId} has insufficient lesson content (${lessonContent.totalLength} chars). Failing batch.`);
      await deps.store.markBatchFailed({
        batchId,
        fencingToken,
        errorCode: "insufficient_content",
        errorMessage: "محتوای علمی معتبری برای درس‌های این فصل یافت نشد.",
      });
      await deps.store.reconcileTaskAndOperation(task.id, operation.id);
      throw new UnrecoverableError("محتوای علمی فصل برای تولید سؤال کافی نیست.");
    }

    // 5. Match patterns for missing slots
    const patternMap = new Map<number, QuestionPatternMeta>();
    const missingSlotInstructions: MissingSlotInstruction[] = [];

    const snapshotMap = new Map<string, StudioExamPatternSnapshot>();
    for (const snap of operation.patternSnapshots) {
      snapshotMap.set(snap.patternId, snap);
    }

    for (const slotIndex of missingSlotIndices) {
      const alloc = batch.patternAllocations.find((a) => a.questionIndex === slotIndex);
      if (!alloc) {
        logger(`Missing pattern allocation for slot ${slotIndex} in batch ${batchId}. Marking batch failed.`);
        await deps.store.markBatchFailed({
          batchId,
          fencingToken,
          errorCode: "invalid_pattern_snapshot",
          errorMessage: `تخصیص الگو برای اسلات ${slotIndex} در بسته ${batchId} یافت نشد.`,
        });
        await deps.store.reconcileTaskAndOperation(task.id, operation.id);
        throw new UnrecoverableError(`تخصیص الگو برای اسلات ${slotIndex} در بسته ${batchId} یافت نشد.`);
      }

      const patternSnapshot = snapshotMap.get(alloc.patternId);
      if (!patternSnapshot) {
        logger(`Missing snapshot for pattern ${alloc.patternId} in operation ${operation.id}. Marking batch failed.`);
        await deps.store.markBatchFailed({
          batchId,
          fencingToken,
          errorCode: "invalid_pattern_snapshot",
          errorMessage: `اسنپ‌شات الگوی سؤال با شناسه ${alloc.patternId} در عملیات یافت نشد.`,
        });
        await deps.store.reconcileTaskAndOperation(task.id, operation.id);
        throw new UnrecoverableError(`اسنپ‌شات الگوی سؤال یافت نشد: ${alloc.patternId}`);
      }

      patternMap.set(slotIndex, {
        patternId: alloc.patternId,
        patternVersion: alloc.patternVersion,
      });

      missingSlotInstructions.push({
        questionIndex: slotIndex,
        pattern: patternSnapshot,
      });
    }

    // 6. Build prompt
    const difficulty = (operation.config.difficulty as string) ?? "medium";
    const customInstructions = (operation.config.instructions as string) ?? undefined;

    const existingQuestionStems = existingQuestions.map((q) => q.question);

    const userPrompt = buildStudioExamUserPrompt({
      lessonMarkdown: lessonContent.combinedMarkdown,
      lessons: lessonContent.lessons,
      missingSlots: missingSlotInstructions,
      difficulty,
      instructions: customInstructions,
      existingQuestionStems,
    });

    // 7. Start periodic heartbeat during LLM generation
    startHeartbeat();

    logger(`Calling Gemini Gateway for ${missingSlotInstructions.length} missing slot(s)...`);
    const completion = await deps.gateway.complete({
      promptVersion: "studio_exam_batch_v2",
      messages: [
        { role: "system", content: STUDIO_EXAM_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      jsonSchema: { type: "studio_exam_questions" },
      temperature: 0.2,
      maxTokens: 4000,
      correlationId: `studio_batch_${batchId}_${fencingToken}`,
      jobId: job.id,
      organizationId: asOrganizationId(operation.organizationId ?? "00000000-0000-0000-0000-000000000000"),
      documentId: asDocumentId("00000000-0000-0000-0000-000000000000"),
      stage: "studio_exam_batch",
      signal: abortController.signal,
    });

    stopHeartbeat();

    if (abortController.signal.aborted) {
      const abortReason = abortController.signal.reason;
      if (abortReason instanceof WorkerStopError || abortReason instanceof FencingTokenStaleError) {
        throw abortReason;
      }
      throw new WorkerStopError("operation_cancelled", "Processing aborted: Operation was cancelled or token superseded");
    }

    // 8. Parse and validate Gemini response using unified quality + deterministic normalization gate
    const parsed = cleanAndParseJson<{ questions: unknown }>(completion.text, "quiz");
    const validation = validateStudioExamQuestions({
      rawQuestions: parsed.questions,
      expectedSlotIndices: missingSlotIndices,
      targetCount: batch.targetCount,
      patternMap,
      defaultDifficulty: difficulty,
      existingQuestionStems,
    });

    if (validation.rejectedIndices.length > 0) {
      logger(
        `Quality gate dropped ${validation.rejectedIndices.length} invalid question(s) for slots: ${validation.rejectedIndices.join(", ")}`,
      );
    }

    const finalValidQuestions = [...validation.validQuestions];

    if (finalValidQuestions.length === 0) {
      logger(`Zero valid questions produced for batch ${batchId}. Errors: ${validation.errors.join("; ")}`);
      throw new Error(`تولید سؤالات با شکست مواجه شد: ${validation.errors[0] ?? "خروجی نامعتبر"}`);
    }

    // 8c. Atomic option shuffling & batch-level key position balancing before persisting to staging
    const mcqsToShuffle = finalValidQuestions.filter(
      (q) => q.questionType === "multiple_choice" && Array.isArray(q.choices) && q.choices.length === 4,
    );
    const shuffledMcqs = shuffleAndBalanceStudioQuestions(
      mcqsToShuffle.map((q) => ({
        ...q,
        choices: q.choices as string[],
        correctAnswer: String(q.correctAnswer),
      })),
    );
    const shuffledByIndex = new Map(shuffledMcqs.map((q) => [q.questionIndex, q]));
    const persistedQuestions = finalValidQuestions.map((q) => shuffledByIndex.get(q.questionIndex) ?? q);

    // 9. Transactional save with Fencing Token enforcement and row-level lock
    logger(`Persisting ${persistedQuestions.length} valid question(s) into staging for batch ${batchId}...`);
    const saveResult = await deps.store.saveBatchQuestionsAndFinalize({
      batchId,
      fencingToken,
      questions: persistedQuestions,
      leaseDurationSeconds: leaseSec,
    });

    // 10. Reconcile Task and Operation state
    await deps.store.reconcileTaskAndOperation(task.id, operation.id);

    // 10b. If some slots were rejected by Quality Gate + Critic, do not leave the batch stuck in 'processing':
    // throw a controlled error so BullMQ retries only the remaining empty slots (or finalizes on last attempt).
    if (!saveResult.isCompleted) {
      logger(
        `Batch ${batchId} partially saved (${saveResult.generatedCount}/${batch.targetCount}). Triggering controlled retry for remaining slots.`,
      );
      throw new Error(
        `تولید برخی سؤالات بسته ${batchId} با استاندارد کیفیت مطابقت نداشت (${saveResult.generatedCount}/${batch.targetCount}).`,
      );
    }

    logger(
      `Batch ${batchId} saved successfully. Total generated count: ${saveResult.generatedCount}/${batch.targetCount} (completed=${saveResult.isCompleted})`,
    );

    return {
      batchId,
      status: "succeeded",
      generatedCount: saveResult.generatedCount,
      isCompleted: saveResult.isCompleted,
    };
  } catch (err) {
    stopHeartbeat();

    // 11. Worker Stop Error (Operation cancelled, Batch cancelled, Lease expired, Fencing token stale)
    if (abortController.signal.aborted) {
      const reason = abortController.signal.reason;
      if (reason instanceof WorkerStopError) {
        logger(`Aborted with WorkerStopError [${reason.reason}] on batch ${batchId}: ${reason.message}. Exiting cleanly as superseded.`);
        return { batchId, status: "superseded", reason: reason.reason };
      }
      if (reason instanceof FencingTokenStaleError) {
        return { batchId, status: "superseded", reason: "fencing_token_stale" };
      }
      return { batchId, status: "superseded", reason: "operation_cancelled" };
    }

    if (err instanceof WorkerStopError) {
      logger(`WorkerStopError [${err.reason}] on batch ${batchId}: ${err.message}. Exiting cleanly as superseded.`);
      return { batchId, status: "superseded", reason: err.reason };
    }

    if (err instanceof FencingTokenStaleError) {
      logger(`FencingTokenStaleError: Worker lost ownership of batch ${batchId} (token=${fencingToken}). Exiting cleanly.`);
      return { batchId, status: "superseded", reason: "fencing_token_stale" };
    }

    // 12. Non-retryable error (UnrecoverableError)
    if (err instanceof UnrecoverableError) {
      logger(`UnrecoverableError on batch ${batchId}: ${err.message}. Marking failed.`);
      throw err;
    }

    // 13. Final retry check
    // In BullMQ, attempts is total allowed attempts (default 5).
    // attemptsMade is number of previous attempts. (e.g. 0 on 1st run, 4 on 5th run).
    // So if (job.attemptsMade + 1) >= maxAttempts, this attempt failure IS the final failure!
    const maxAttempts = job.opts?.attempts ?? 5;
    const isFinalAttempt = (job.attemptsMade + 1) >= maxAttempts;

    if (isFinalAttempt) {
      logger(`Final attempt failed (${job.attemptsMade + 1}/${maxAttempts}) for batch ${batchId}. Executing handleBatchFinalFailureAndReconcile.`);
      await deps.store.handleBatchFinalFailureAndReconcile({
        batchId,
        fencingToken,
        errorCode: "exhausted_retries",
        errorMessage: err instanceof Error ? err.message : String(err),
        taskId: payload.taskId,
        operationId: payload.operationId,
      });
      throw err;
    }

    // 14. Transient error: Conditionally release lease so BullMQ's next retry in ~30s can claim immediately
    try {
      const released = await deps.store.releaseLeaseOnTransientError(
        batchId,
        fencingToken,
        "transient_error",
        err instanceof Error ? err.message : String(err),
      );
      if (released) {
        logger(`Released lease for batch ${batchId} following transient error to allow fast retry.`);
      }
    } catch (releaseErr) {
      logger(`Failed to conditionally release lease for batch ${batchId}: ${String(releaseErr)}`);
    }

    throw err;
  }
}

/**
 * BullMQ Worker Factory for Studio Exam Batch Generation.
 */
export function createStudioExamWorker(
  connection: { url: string },
  deps: StudioExamProcessorDeps,
  options?: { concurrency?: number; queueName?: string },
): Worker {
  const queueName = options?.queueName ?? STUDIO_EXAM_BATCH_QUEUE_NAME;
  const logger = deps.logger ?? ((msg: string) => process.stdout.write(`[studio-exam-worker] ${msg}\n`));
  const worker = new Worker(
    queueName,
    async (job) => processStudioExamBatchJob(job as Job<StudioExamBatchJobPayload>, deps),
    {
      connection: { url: connection.url },
      concurrency: options?.concurrency ?? 2,
      lockDuration: 300_000, // 5 minutes BullMQ lock
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts?.attempts ?? 5;
    if (job.attemptsMade >= maxAttempts || err?.name === "UnrecoverableError") {
      try {
        const payload = toBatchJobPayload(job);
        logger(`Worker 'failed' event triggered final reconcile for batch ${payload.batchId}`);
        await deps.store.handleBatchFinalFailureAndReconcile({
          batchId: payload.batchId,
          fencingToken: -1,
          errorCode: "exhausted_retries",
          errorMessage: err?.message ?? "Job exhausted retries",
          taskId: payload.taskId,
          operationId: payload.operationId,
        });
      } catch (recErr) {
        logger(`Worker 'failed' event reconcile error: ${String(recErr)}`);
      }
    }
  });

  return worker;
}
