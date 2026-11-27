/**
 * AVANA Exam Studio — Multi-Chapter AI Exam Store & Repository (Phase 2).
 *
 * Implements:
 * 1. Atomic claim with Fencing Token (retry_count increment) and 120s lease.
 * 2. Time-validated heartbeat to strictly prevent resurrecting expired leases.
 * 3. Conditional lease release on transient error (fast retry in BullMQ).
 * 4. Transactional question persistence with Fencing Token validation and FOR UPDATE locking.
 * 5. Strict bounds enforcement (question_index must be in 1..target_count).
 * 6. Deterministic Task and Operation reconciliation serialized with row-level locks.
 */

import { sql, eq, and, isNull, desc, inArray } from "drizzle-orm";
import {
  DomainError,
  deriveTaskStatus,
  deriveOperationStatus,
  allocateQuestionPatterns,
  type StudioExamOperationStatus,
  type StudioExamTaskStatus,
  type StudioExamBatchStatus,
  type StudioExamPatternSnapshot,
  type QuestionPatternAssignment,
} from "@avana/domain";
import type { DbClient } from "@avana/database/client";
import {
  studioExamGenerationOperations,
  studioExamGenerationTasks,
  studioExamGenerationBatches,
  studioExamGeneratedQuestions,
  marketingQuizQuestions,
  lessons,
} from "@avana/database/schema";
import { STUDIO_EXAM_BATCH_JOB_NAME } from "./studio-exam-queue.js";
import type { MarketingQuizQuestionSnapshot } from "./types.js";

export const DEFAULT_LEASE_DURATION_SECONDS = 120; // 2 minutes

export type WorkerStopReason =
  | "lease_expired"
  | "fencing_token_stale"
  | "operation_cancelled"
  | "batch_cancelled";

export class WorkerStopError extends Error {
  constructor(
    public readonly reason: WorkerStopReason,
    message: string,
  ) {
    super(message);
    this.name = "WorkerStopError";
  }
}

export class FencingTokenStaleError extends WorkerStopError {
  constructor(message = "توکن Fencing نامعتبر است یا توسط ورکر دیگری تصاحب شده است.") {
    super("fencing_token_stale", message);
    this.name = "FencingTokenStaleError";
  }
}

export interface ClaimBatchResult {
  claimed: boolean;
  fencingToken?: number;
  reason?:
    | "already_completed"
    | "active_lease_held"
    | "not_found"
    | "operation_cancelled"
    | "batch_cancelled";
}

export interface BatchExecutionDetails {
  batch: {
    id: string;
    taskId: string;
    batchIndex: number;
    targetCount: number;
    generatedCount: number;
    status: StudioExamBatchStatus;
    patternAllocations: QuestionPatternAssignment[];
    retryCount: number;
  };
  task: {
    id: string;
    operationId: string;
    courseId: string;
    moduleId: string;
    targetQuestionCount: number;
    generatedQuestionCount: number;
    status: StudioExamTaskStatus;
  };
  operation: {
    id: string;
    quizId: string;
    organizationId?: string | null;
    totalRequestedQuestions: number;
    totalGeneratedQuestions: number;
    status: StudioExamOperationStatus;
    config: Record<string, unknown>;
    patternSnapshots: StudioExamPatternSnapshot[];
  };
  existingQuestions: Array<{
    id: string;
    questionIndex: number;
    patternId?: string | null;
    patternVersion?: number | null;
    question: string;
  }>;
}

export interface ModuleLessonContent {
  lessons: Array<{ id: string; title: string; contentMarkdown: string; sortOrder: number }>;
  combinedMarkdown: string;
  totalLength: number;
}

export interface SaveQuestionInput {
  questionIndex: number;
  patternId?: string | null;
  patternVersion?: number | null;
  question: string;
  choices: Array<{ id: string; text: string }> | string[];
  correctAnswer: unknown;
  explanation?: string | null;
  difficulty?: string;
  topic?: string | null;
  questionType?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateOperationBatchParams {
  batchIndex: number;
  targetCount: number;
  patternAllocations: QuestionPatternAssignment[];
}

export interface CreateOperationTaskParams {
  courseId: string;
  moduleId: string;
  targetQuestionCount: number;
  batches: CreateOperationBatchParams[];
}

export interface CreateOperationWithTasksAndBatchesParams {
  quizId: string;
  organizationId?: string | null;
  createdBy?: string | null;
  totalRequestedQuestions: number;
  config: Record<string, unknown>;
  patternSnapshots: StudioExamPatternSnapshot[];
  tasks: CreateOperationTaskParams[];
}

export interface CreatedOperationDetails {
  operation: {
    id: string;
    quizId: string;
    organizationId?: string | null;
    createdBy?: string | null;
    totalRequestedQuestions: number;
    totalGeneratedQuestions: number;
    status: StudioExamOperationStatus;
    config: Record<string, unknown>;
    patternSnapshots: StudioExamPatternSnapshot[];
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  tasks: Array<{
    id: string;
    operationId: string;
    courseId: string;
    moduleId: string;
    targetQuestionCount: number;
    generatedQuestionCount: number;
    status: StudioExamTaskStatus;
    createdAt: Date | string;
  }>;
  batches: Array<{
    id: string;
    taskId: string;
    batchIndex: number;
    targetCount: number;
    generatedCount: number;
    status: StudioExamBatchStatus;
    patternAllocations: QuestionPatternAssignment[];
    createdAt: Date | string;
  }>;
}

export interface ActiveOperationSummary {
  id: string;
  quizId: string;
  organizationId?: string | null;
  totalRequestedQuestions: number;
  totalGeneratedQuestions: number;
  status: StudioExamOperationStatus;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OperationTaskDetail {
  id: string;
  operationId: string;
  courseId: string;
  moduleId: string;
  targetQuestionCount: number;
  generatedQuestionCount: number;
  status: StudioExamTaskStatus;
  retryCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface OperationBatchDetail {
  id: string;
  taskId: string;
  batchIndex: number;
  targetCount: number;
  generatedCount: number;
  status: StudioExamBatchStatus;
  patternAllocations: QuestionPatternAssignment[];
  retryCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface FullOperationDetails {
  operation: {
    id: string;
    quizId: string;
    organizationId?: string | null;
    createdBy?: string | null;
    totalRequestedQuestions: number;
    totalGeneratedQuestions: number;
    status: StudioExamOperationStatus;
    config: Record<string, unknown>;
    patternSnapshots: StudioExamPatternSnapshot[];
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  tasks: OperationTaskDetail[];
  batches: OperationBatchDetail[];
}

export interface TaskProgressSummary {
  taskId: string;
  moduleId: string;
  courseId: string;
  targetCount: number;
  generatedCount: number;
  status: StudioExamTaskStatus;
}

export interface OperationProgressSummary {
  operationId: string;
  quizId: string;
  organizationId?: string | null;
  status: StudioExamOperationStatus;
  totalRequestedQuestions: number;
  totalGeneratedQuestions: number;
  progressPercentage: number;
  updatedAt: Date | string;
  tasks: TaskProgressSummary[];
}

export type StagingQuestionReviewStatus =
  | "pending_review"
  | "accepted"
  | "rejected"
  | "transferred";

export type StagingQuestionReviewDecision =
  | "pending_review"
  | "accepted"
  | "rejected";

export interface GetGeneratedQuestionsParams {
  operationId: string;
  taskId?: string;
  batchId?: string;
  isAccepted?: boolean;
  reviewStatus?: StagingQuestionReviewStatus;
  limit?: number;
  offset?: number;
}

export interface StagingQuestionRecord {
  id: string;
  operationId: string;
  taskId: string;
  batchId: string;
  courseId: string;
  moduleId: string;
  patternId?: string | null;
  patternVersion?: number | null;
  questionIndex: number;
  question: string;
  choices: Array<{ id: string; text: string }>;
  correctAnswer: unknown;
  explanation?: string | null;
  difficulty: string;
  topic?: string | null;
  questionType: string;
  metadata: Record<string, unknown>;
  isAccepted: boolean;
  reviewStatus: StagingQuestionReviewStatus;
  transferredQuestionId?: string | null;
  transferredAt?: Date | string | null;
  createdAt: Date | string;
}

/**
 * Normalizes raw staging choices (string[] or { id, text }[]) into canonical { id, text }[].
 */
export function normalizeStagingChoices(
  rawChoices: unknown,
): Array<{ id: string; text: string }> {
  if (!Array.isArray(rawChoices)) {
    return [];
  }
  return rawChoices.map((c, idx) => {
    if (typeof c === "string") {
      return { id: String(idx + 1), text: c.trim() };
    }
    if (typeof c === "object" && c !== null) {
      const obj = c as { id?: unknown; text?: unknown };
      const id =
        typeof obj.id === "string" && obj.id.trim().length > 0
          ? obj.id.trim()
          : String(idx + 1);
      const text =
        typeof obj.text === "string" ? obj.text.trim() : String(obj.text ?? "").trim();
      return { id, text };
    }
    return { id: String(idx + 1), text: String(c ?? "").trim() };
  });
}

/**
 * Normalizes raw staging correctAnswer (text, numeric index, or { choiceId }) into { choiceId }
 * by matching strictly against the normalized choices.
 */
export function normalizeStagingCorrectAnswer(
  rawAnswer: unknown,
  normalizedChoices: Array<{ id: string; text: string }>,
): unknown {
  if (normalizedChoices.length === 0) {
    return rawAnswer;
  }

  const resolveToken = (token: string): string | null => {
    const trimmed = token.trim();
    if (!trimmed) return null;

    const byExactText = normalizedChoices.find((c) => c.text.trim() === trimmed);
    if (byExactText) return byExactText.id;

    const lower = trimmed.toLowerCase();
    const byLowerText = normalizedChoices.find(
      (c) => c.text.trim().toLowerCase() === lower,
    );
    if (byLowerText) return byLowerText.id;

    const byId = normalizedChoices.find((c) => c.id === trimmed);
    if (byId) return byId.id;

    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= normalizedChoices.length) {
        return normalizedChoices[num - 1].id;
      }
    }
    return null;
  };

  if (typeof rawAnswer === "string") {
    const matchedId = resolveToken(rawAnswer);
    if (matchedId) {
      return { choiceId: matchedId };
    }
  } else if (typeof rawAnswer === "object" && rawAnswer !== null) {
    const obj = rawAnswer as Record<string, unknown>;
    if (typeof obj.choiceId === "string") {
      const matchedId = resolveToken(obj.choiceId);
      if (matchedId) {
        return { choiceId: matchedId };
      }
    }
    if (Array.isArray(obj.choiceIds)) {
      return rawAnswer;
    }
  }

  return rawAnswer;
}

/**
 * Strictly resolves the normalized `{ choiceId }` for choice-based questions during transfer.
 * Never falls back silently to choices[0] or "1"; throws DomainError so the transaction rolls back.
 */
export function resolveStrictTransferCorrectAnswer(
  rawAnswer: unknown,
  normalizedChoices: Array<{ id: string; text: string }>,
  questionId: string,
): { choiceId: string } | string {
  if (normalizedChoices.length === 0) {
    if (typeof rawAnswer === "string" && rawAnswer.trim().length > 0) {
      return rawAnswer.trim();
    }
    throw new DomainError(
      "bad_request",
      "پاسخ صحیح سؤال نامعتبر است و انتقال متوقف شد.",
      { questionId },
    );
  }

  const normalizedAnswer = normalizeStagingCorrectAnswer(rawAnswer, normalizedChoices);
  if (
    normalizedAnswer &&
    typeof normalizedAnswer === "object" &&
    "choiceId" in normalizedAnswer &&
    typeof (normalizedAnswer as { choiceId: unknown }).choiceId === "string"
  ) {
    const cid = (normalizedAnswer as { choiceId: string }).choiceId;
    if (normalizedChoices.some((c) => c.id === cid)) {
      return { choiceId: cid };
    }
  }

  throw new DomainError(
    "bad_request",
    "پاسخ صحیح سؤال با گزینه‌های موجود منطبق نیست و انتقال متوقف شد.",
    { questionId, rawAnswer: typeof rawAnswer === "string" ? rawAnswer : null },
  );
}

export interface ReviewGeneratedQuestionsParams {
  operationId: string;
  questionIds: string[];
  decision: StagingQuestionReviewDecision;
}

export interface ReviewGeneratedQuestionsResult {
  updatedCount: number;
  skippedTransferredIds: string[];
  questions: StagingQuestionRecord[];
}

export interface TransferGeneratedQuestionsParams {
  operationId: string;
  questionIds: string[];
}

export interface TransferGeneratedQuestionsResult {
  transferredCount: number;
  alreadyTransferredIds: string[];
  createdQuestions: MarketingQuizQuestionSnapshot[];
  existingTransferredQuestionIds: string[];
}

export interface StagingQuestionStats {
  totalCount: number;
  pendingReviewCount: number;
  acceptedCount: number;
  rejectedCount: number;
  transferredCount: number;
}

export interface ExamOperationHistoryItem {
  id: string;
  quizId: string;
  organizationId?: string | null;
  status: StudioExamOperationStatus;
  totalRequestedQuestions: number;
  totalGeneratedQuestions: number;
  progressPercentage: number;
  stagingStats: StagingQuestionStats;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ListOperationsByQuizIdParams {
  quizId: string;
  organizationId?: string | null;
  status?: StudioExamOperationStatus;
  limit?: number;
  offset?: number;
}

export interface ListOperationsByQuizIdResult {
  operations: ExamOperationHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export function sanitizeErrorMessage(
  errorCode?: string | null,
  errorMessage?: string | null,
): string | null {
  if (!errorCode && !errorMessage) return null;

  switch (errorCode) {
    case "gemini_timeout":
      return "پاسخ مدل هوش مصنوعی با تأخیر مواجه شد.";
    case "rate_limit_exceeded":
      return "محدودیت تعداد درخواست به مدل هوش مصنوعی.";
    case "insufficient_content":
      return "محتوای متنی درس‌های این فصل برای تولید سؤال کافی نیست.";
    case "validation_error":
      return "پاسخ مدل هوش مصنوعی با استانداردهای آزمون همخوانی نداشت.";
    case "operation_cancelled":
      return "عملیات توسط کاربر لغو شد.";
    case "stale_lease_expired":
      return "توقف پردازش به دلیل انقضای زمان پاسخ‌دهی.";
    case "fencing_token_stale":
      return "تداخل در پردازش همزمان بسته.";
    default:
      break;
  }

  if (!errorMessage) {
    return "خطای غیرمنتظره در پردازش بسته سؤالات.";
  }

  const sensitiveRegex =
    /(api[_-]?key|token|bearer|google\.com|googleapis|axios|fetch|at\s+\w+\s+\(|node:internal)/i;
  if (sensitiveRegex.test(errorMessage)) {
    return "خطای غیرمنتظره در ارتباط با سرویس هوش مصنوعی.";
  }

  return errorMessage;
}

export function isUuid(val: unknown): val is string {
  return (
    typeof val === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
  );
}

export interface ReconcileStaleBatchesOptions {
  leaseDurationSeconds?: number;
  gracePeriodSeconds?: number;
  pendingGraceSeconds?: number;
  limit?: number;
  queue?: {
    add(
      name: string,
      data: { operationId: string; taskId: string; batchId: string },
      opts?: { jobId?: string },
    ): Promise<void>;
  };
}

export interface ReconcileStaleBatchesResult {
  scannedCount: number;
  recoveredBatchesCount: number;
  recoveredBatchIds: string[];
  reenqueuedBatchesCount: number;
  reenqueuedBatchIds: string[];
}

export interface StudioExamStore {
  createOperationWithTasksAndBatches(
    params: CreateOperationWithTasksAndBatchesParams,
  ): Promise<CreatedOperationDetails>;
  getActiveOperationByQuizId(quizId: string): Promise<ActiveOperationSummary | null>;
  listOperationsByQuizId(
    params: ListOperationsByQuizIdParams,
  ): Promise<ListOperationsByQuizIdResult>;
  getOperationById(operationId: string): Promise<FullOperationDetails | null>;
  getOperationProgress(operationId: string): Promise<OperationProgressSummary | null>;
  getGeneratedQuestions(
    params: GetGeneratedQuestionsParams,
  ): Promise<StagingQuestionRecord[]>;
  reviewGeneratedQuestions(
    params: ReviewGeneratedQuestionsParams,
  ): Promise<ReviewGeneratedQuestionsResult>;
  transferGeneratedQuestionsToQuiz(
    params: TransferGeneratedQuestionsParams,
  ): Promise<TransferGeneratedQuestionsResult>;
  claimBatch(batchId: string, leaseDurationSeconds?: number): Promise<ClaimBatchResult>;
  heartbeatBatch(batchId: string, fencingToken: number, leaseDurationSeconds?: number): Promise<boolean>;
  releaseLeaseOnTransientError(batchId: string, fencingToken: number, errorCode: string, errorMessage: string): Promise<boolean>;
  getBatchExecutionDetails(batchId: string): Promise<BatchExecutionDetails | null>;
  getModuleLessonContent(moduleId: string): Promise<ModuleLessonContent>;
  saveBatchQuestionsAndFinalize(params: {
    batchId: string;
    fencingToken: number;
    questions: SaveQuestionInput[];
    leaseDurationSeconds?: number;
  }): Promise<{ generatedCount: number; isCompleted: boolean }>;
  markBatchFailed(params: {
    batchId: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<boolean>;
  reconcileTaskAndOperation(taskId: string, operationId: string): Promise<{
    taskStatus: StudioExamTaskStatus;
    taskGeneratedCount: number;
    operationStatus: string;
    operationGeneratedCount: number;
  }>;
  cancelOperation(
    operationId: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reason?: string }>;
  handleBatchFinalFailureAndReconcile(params: {
    batchId: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    taskId: string;
    operationId: string;
  }): Promise<void>;
  reconcileStaleBatches(
    options?: ReconcileStaleBatchesOptions,
  ): Promise<ReconcileStaleBatchesResult>;
  repairPendingOperationPatterns(
    operationId: string,
    patternSnapshots: StudioExamPatternSnapshot[],
  ): Promise<{ repairedBatchCount: number }>;
}

export class DrizzleStudioExamStore implements StudioExamStore {
  constructor(private readonly db: DbClient) {}

  async claimBatch(
    batchId: string,
    leaseDurationSeconds: number = DEFAULT_LEASE_DURATION_SECONDS,
  ): Promise<ClaimBatchResult> {
    // 1. Check parent operation and batch status
    const existingRes = await this.db.execute<{ batch_status: string; operation_status: string }>(sql`
      SELECT b.status AS batch_status, o.status AS operation_status
      FROM studio_exam_generation_batches b
      JOIN studio_exam_generation_tasks t ON t.id = b.task_id
      JOIN studio_exam_generation_operations o ON o.id = t.operation_id
      WHERE b.id = ${batchId}::uuid
      LIMIT 1;
    `);

    const existingRows = (existingRes as { rows?: Array<{ batch_status: string; operation_status: string }> }).rows ?? [];
    if (existingRows.length === 0) {
      return { claimed: false, reason: "not_found" };
    }

    const existing = existingRows[0];
    if (existing.operation_status === "cancelled") {
      return { claimed: false, reason: "operation_cancelled" };
    }
    if (existing.batch_status === "completed") {
      return { claimed: false, reason: "already_completed" };
    }
    if (existing.batch_status === "cancelled") {
      return { claimed: false, reason: "batch_cancelled" };
    }

    // 2. Atomic claim with Fencing Token increment and lease window, strictly preventing claims on cancelled operations
    const result = await this.db.execute<{ retry_count: number }>(sql`
      UPDATE studio_exam_generation_batches b
      SET status = 'processing',
          started_at = COALESCE(b.started_at, NOW()),
          updated_at = NOW(),
          retry_count = b.retry_count + 1
      FROM studio_exam_generation_tasks t
      JOIN studio_exam_generation_operations o ON o.id = t.operation_id
      WHERE b.id = ${batchId}::uuid
        AND b.task_id = t.id
        AND o.status != 'cancelled'
        AND (
          b.status IN ('pending', 'failed')
          OR (
            b.status = 'processing'
            AND b.updated_at < NOW() - (${leaseDurationSeconds} || ' seconds')::interval
          )
        )
      RETURNING b.retry_count;
    `);

    const rows = (result as { rows?: Array<{ retry_count: number }> }).rows ?? [];
    if (rows.length > 0 && typeof rows[0].retry_count === "number") {
      return { claimed: true, fencingToken: rows[0].retry_count };
    }

    return { claimed: false, reason: "active_lease_held" };
  }

  async heartbeatBatch(
    batchId: string,
    fencingToken: number,
    leaseDurationSeconds: number = DEFAULT_LEASE_DURATION_SECONDS,
  ): Promise<boolean> {
    // Updates updated_at strictly if token matches, lease is valid, and parent operation is NOT cancelled
    const result = await this.db.execute<{ id: string }>(sql`
      UPDATE studio_exam_generation_batches b
      SET updated_at = NOW()
      FROM studio_exam_generation_tasks t
      JOIN studio_exam_generation_operations o ON o.id = t.operation_id
      WHERE b.id = ${batchId}::uuid
        AND b.task_id = t.id
        AND b.status = 'processing'
        AND b.retry_count = ${fencingToken}
        AND b.updated_at >= NOW() - (${leaseDurationSeconds} || ' seconds')::interval
        AND o.status != 'cancelled'
        AND b.status != 'cancelled'
      RETURNING b.id;
    `);

    const rows = (result as { rows?: Array<{ id: string }> }).rows ?? [];
    return rows.length > 0;
  }

  async releaseLeaseOnTransientError(
    batchId: string,
    fencingToken: number,
    errorCode: string,
    errorMessage: string,
  ): Promise<boolean> {
    // Sets status = 'failed' and forces updated_at to the past, so BullMQ retry in ~30s can immediately claim
    const result = await this.db.execute<{ id: string }>(sql`
      UPDATE studio_exam_generation_batches
      SET status = 'failed',
          error_code = ${errorCode},
          error_message = ${errorMessage},
          updated_at = NOW() - INTERVAL '10 minutes'
      WHERE id = ${batchId}::uuid
        AND status = 'processing'
        AND retry_count = ${fencingToken}
      RETURNING id;
    `);

    const rows = (result as { rows?: Array<{ id: string }> }).rows ?? [];
    return rows.length > 0;
  }

  async getBatchExecutionDetails(batchId: string): Promise<BatchExecutionDetails | null> {
    const [batchRow] = await this.db
      .select()
      .from(studioExamGenerationBatches)
      .where(eq(studioExamGenerationBatches.id, batchId))
      .limit(1);

    if (!batchRow) return null;

    const [taskRow] = await this.db
      .select()
      .from(studioExamGenerationTasks)
      .where(eq(studioExamGenerationTasks.id, batchRow.taskId))
      .limit(1);

    if (!taskRow) return null;

    const [opRow] = await this.db
      .select()
      .from(studioExamGenerationOperations)
      .where(eq(studioExamGenerationOperations.id, taskRow.operationId))
      .limit(1);

    if (!opRow) return null;

    const questions = await this.db
      .select({
        id: studioExamGeneratedQuestions.id,
        questionIndex: studioExamGeneratedQuestions.questionIndex,
        patternId: studioExamGeneratedQuestions.patternId,
        patternVersion: studioExamGeneratedQuestions.patternVersion,
        question: studioExamGeneratedQuestions.question,
      })
      .from(studioExamGeneratedQuestions)
      .where(eq(studioExamGeneratedQuestions.batchId, batchId))
      .orderBy(studioExamGeneratedQuestions.questionIndex);

    return {
      batch: {
        id: batchRow.id,
        taskId: batchRow.taskId,
        batchIndex: batchRow.batchIndex,
        targetCount: batchRow.targetCount,
        generatedCount: batchRow.generatedCount,
        status: batchRow.status as StudioExamBatchStatus,
        patternAllocations: (batchRow.patternAllocations ?? []) as unknown as QuestionPatternAssignment[],
        retryCount: batchRow.retryCount,
      },
      task: {
        id: taskRow.id,
        operationId: taskRow.operationId,
        courseId: taskRow.courseId,
        moduleId: taskRow.moduleId,
        targetQuestionCount: taskRow.targetQuestionCount,
        generatedQuestionCount: taskRow.generatedQuestionCount,
        status: taskRow.status as StudioExamTaskStatus,
      },
      operation: {
        id: opRow.id,
        quizId: opRow.quizId,
        organizationId: opRow.organizationId,
        totalRequestedQuestions: opRow.totalRequestedQuestions,
        totalGeneratedQuestions: opRow.totalGeneratedQuestions,
        status: opRow.status as StudioExamOperationStatus,
        config: opRow.config as Record<string, unknown>,
        patternSnapshots: (opRow.patternSnapshots ?? []) as unknown as StudioExamPatternSnapshot[],
      },
      existingQuestions: questions,
    };
  }

  async getModuleLessonContent(moduleId: string): Promise<ModuleLessonContent> {
    const rows = await this.db
      .select({
        id: lessons.id,
        title: lessons.title,
        contentMarkdown: lessons.contentMarkdown,
        sortOrder: lessons.sortOrder,
      })
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
      .orderBy(lessons.sortOrder);

    const validLessons = rows.map((r) => ({
      id: r.id,
      title: r.title,
      contentMarkdown: r.contentMarkdown ?? "",
      sortOrder: r.sortOrder,
    }));

    const combinedMarkdown = validLessons
      .map((l, idx) => `## درس ${idx + 1}: ${l.title}\n\n${l.contentMarkdown.trim()}`)
      .join("\n\n---\n\n")
      .trim();

    return {
      lessons: validLessons,
      combinedMarkdown,
      totalLength: combinedMarkdown.length,
    };
  }

  async saveBatchQuestionsAndFinalize(params: {
    batchId: string;
    fencingToken: number;
    questions: SaveQuestionInput[];
    leaseDurationSeconds?: number;
  }): Promise<{ generatedCount: number; isCompleted: boolean }> {
    const { batchId, fencingToken, questions, leaseDurationSeconds = DEFAULT_LEASE_DURATION_SECONDS } = params;

    return await this.db.transaction(async (tx) => {
      // 1. Lock Operation row FIRST with FOR UPDATE (Strict deadlock-free lock order shared with cancelOperation)
      const opLockRes = await tx.execute<{ id: string; status: string }>(sql`
        SELECT o.id, o.status
        FROM studio_exam_generation_operations o
        WHERE o.id = (
          SELECT t.operation_id
          FROM studio_exam_generation_batches b
          JOIN studio_exam_generation_tasks t ON t.id = b.task_id
          WHERE b.id = ${batchId}::uuid
          LIMIT 1
        )
        FOR UPDATE;
      `);

      const opRows = (opLockRes as { rows?: Array<{ id: string; status: string }> }).rows ?? [];
      if (opRows.length === 0) {
        throw new DomainError("not_found", `عملیات والد برای بسته ${batchId} یافت نشد.`);
      }

      const parentOp = opRows[0];
      if (parentOp.status === "cancelled") {
        throw new WorkerStopError("operation_cancelled", "عملیات والد قبلاً لغو شده است.");
      }

      // 2. Lock batch row SECOND with FOR UPDATE and verify Fencing Token and Lease Validity
      const checkRes = await tx.execute<{
        retry_count: number;
        status: string;
        target_count: number;
        task_id: string;
        operation_id: string;
        course_id: string;
        module_id: string;
        is_lease_valid: boolean;
      }>(sql`
        SELECT b.retry_count, b.status, b.target_count, b.task_id,
               t.operation_id, t.course_id, t.module_id,
               (b.updated_at >= NOW() - (${leaseDurationSeconds} || ' seconds')::interval) AS is_lease_valid
        FROM studio_exam_generation_batches b
        INNER JOIN studio_exam_generation_tasks t ON t.id = b.task_id
        WHERE b.id = ${batchId}::uuid
        FOR UPDATE;
      `);

      const batchRows = (checkRes as { rows?: Array<{
        retry_count: number;
        status: string;
        target_count: number;
        task_id: string;
        operation_id: string;
        course_id: string;
        module_id: string;
        is_lease_valid: boolean;
      }> }).rows ?? [];

      if (batchRows.length === 0) {
        throw new DomainError("not_found", `بسته آزمون با شناسه ${batchId} یافت نشد.`);
      }

      const current = batchRows[0];

      // 3. Verify conditions with differentiated stop reasons
      if (current.status === "cancelled") {
        throw new WorkerStopError("batch_cancelled", "بسته آزمون قبلاً لغو شده است.");
      }
      if (!current.is_lease_valid) {
        throw new WorkerStopError(
          "lease_expired",
          `مدت زمان Lease منقضی شده است (Current lease exceeded ${leaseDurationSeconds}s).`,
        );
      }
      if (current.retry_count !== fencingToken) {
        throw new FencingTokenStaleError(
          `توکن Fencing نامعتبر است یا توسط ورکر دیگری تصاحب شده است (Current: ${current.retry_count}, Expected: ${fencingToken}).`,
        );
      }
      if (current.status !== "processing") {
        throw new WorkerStopError(
          "batch_cancelled",
          `بسته در وضعیت پردازش نیست (Status: ${current.status}).`,
        );
      }

      // 2. Validate question_index boundaries (Strictly 1..target_count)
      for (const q of questions) {
        if (
          typeof q.questionIndex !== "number" ||
          !Number.isInteger(q.questionIndex) ||
          q.questionIndex < 1 ||
          q.questionIndex > current.target_count
        ) {
          throw new DomainError(
            "bad_request",
            `اندیس سؤال (${q.questionIndex}) خارج از بازه مجاز بسته (۱ تا ${current.target_count}) است.`,
            { questionIndex: q.questionIndex, targetCount: current.target_count },
          );
        }
      }

      // 3. Insert questions with ON CONFLICT (batch_id, question_index) DO NOTHING to preserve prior valid outputs
      for (const q of questions) {
        await tx.execute(sql`
          INSERT INTO studio_exam_generated_questions (
            operation_id,
            task_id,
            batch_id,
            course_id,
            module_id,
            pattern_id,
            pattern_version,
            question_index,
            question,
            choices,
            correct_answer,
            explanation,
            difficulty,
            topic,
            question_type,
            metadata
          ) VALUES (
            ${current.operation_id}::uuid,
            ${current.task_id}::uuid,
            ${batchId}::uuid,
            ${current.course_id}::uuid,
            ${current.module_id}::uuid,
            ${q.patternId && isUuid(q.patternId) ? sql`${q.patternId}::uuid` : sql`NULL`},
            ${q.patternVersion ?? sql`NULL`},
            ${q.questionIndex},
            ${q.question},
            ${JSON.stringify(q.choices)}::jsonb,
            ${JSON.stringify(q.correctAnswer)}::jsonb,
            ${q.explanation ?? null},
            ${q.difficulty ?? "medium"},
            ${q.topic ?? null},
            ${q.questionType ?? "multiple_choice"},
            ${JSON.stringify(q.metadata ?? {})}::jsonb
          )
          ON CONFLICT (batch_id, question_index) DO NOTHING;
        `);
      }

      // 4. Read physical count from DB
      const countRes = await tx.execute<{ count: string | number }>(sql`
        SELECT COUNT(*) AS count
        FROM studio_exam_generated_questions
        WHERE batch_id = ${batchId}::uuid;
      `);
      const countRows = (countRes as { rows?: Array<{ count: string | number }> }).rows ?? [];
      const actualCount = countRows.length > 0 ? Number(countRows[0].count) : 0;
      const isCompleted = actualCount >= current.target_count;

      // 5. Update batch status and actual count
      if (isCompleted) {
        await tx.execute(sql`
          UPDATE studio_exam_generation_batches
          SET status = 'completed',
              generated_count = ${actualCount},
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = ${batchId}::uuid;
        `);
      } else {
        await tx.execute(sql`
          UPDATE studio_exam_generation_batches
          SET generated_count = ${actualCount},
              updated_at = NOW()
          WHERE id = ${batchId}::uuid;
        `);
      }

      return { generatedCount: actualCount, isCompleted };
    });
  }

  async markBatchFailed(params: {
    batchId: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<boolean> {
    const { batchId, fencingToken, errorCode, errorMessage } = params;

    const result = await this.db.execute<{ id: string }>(sql`
      UPDATE studio_exam_generation_batches
      SET status = 'failed',
          error_code = ${errorCode},
          error_message = ${errorMessage},
          updated_at = NOW()
      WHERE id = ${batchId}::uuid
        AND status = 'processing'
        AND retry_count = ${fencingToken}
      RETURNING id;
    `);

    const rows = (result as { rows?: Array<{ id: string }> }).rows ?? [];
    return rows.length > 0;
  }

  async reconcileTaskAndOperation(taskId: string, operationId: string): Promise<{
    taskStatus: StudioExamTaskStatus;
    taskGeneratedCount: number;
    operationStatus: string;
    operationGeneratedCount: number;
  }> {
    return await this.db.transaction(async (tx) => {
      // 1. Lock Operation row FIRST with FOR UPDATE (Strict deadlock-free hierarchy: operations -> tasks -> batches)
      const opRes = await tx.execute<{ id: string; status: string }>(sql`
        SELECT id, status
        FROM studio_exam_generation_operations
        WHERE id = ${operationId}::uuid
        FOR UPDATE;
      `);
      const opRows = (opRes as { rows?: Array<{ id: string; status: string }> }).rows ?? [];
      if (opRows.length === 0) {
        throw new DomainError("not_found", `عملیات با شناسه ${operationId} یافت نشد.`);
      }

      // 2. Lock Task row SECOND with FOR UPDATE
      const taskRes = await tx.execute<{
        id: string;
        target_question_count: number;
        error_code: string | null;
      }>(sql`
        SELECT id, target_question_count, error_code
        FROM studio_exam_generation_tasks
        WHERE id = ${taskId}::uuid
        FOR UPDATE;
      `);

      const taskRows = (taskRes as { rows?: Array<{ id: string; target_question_count: number; error_code: string | null }> }).rows ?? [];
      if (taskRows.length === 0) {
        throw new DomainError("not_found", `تسک با شناسه ${taskId} یافت نشد.`);
      }
      const taskRecord = taskRows[0];

      // 3. Query all batches for this task
      const batchesRes = await tx.execute<{
        status: StudioExamBatchStatus;
        generated_count: number;
        error_code: string | null;
      }>(sql`
        SELECT status, generated_count, error_code
        FROM studio_exam_generation_batches
        WHERE task_id = ${taskId}::uuid;
      `);
      const batchRows = (batchesRes as { rows?: Array<{ status: StudioExamBatchStatus; generated_count: number; error_code: string | null }> }).rows ?? [];

      const batchStatuses = batchRows.map((b) => b.status);
      const taskGeneratedCount = batchRows.reduce((sum, b) => sum + (Number(b.generated_count) || 0), 0);
      const hasInsufficientContent =
        taskRecord.error_code === "insufficient_content" ||
        batchRows.some((b) => b.error_code === "insufficient_content");

      const newTaskStatus = deriveTaskStatus({
        batchStatuses,
        targetCount: taskRecord.target_question_count,
        generatedCount: taskGeneratedCount,
        insufficientContent: hasInsufficientContent,
      });

      await tx.execute(sql`
        UPDATE studio_exam_generation_tasks
        SET status = ${newTaskStatus},
            generated_question_count = ${taskGeneratedCount},
            completed_at = ${newTaskStatus === "completed" || newTaskStatus === "partial" || newTaskStatus === "failed" || newTaskStatus === "insufficient_content" ? sql`COALESCE(completed_at, NOW())` : sql`NULL`},
            updated_at = NOW()
        WHERE id = ${taskId}::uuid;
      `);

      // 4. Query all tasks for this operation (operation is already locked from Step 1)
      const tasksRes = await tx.execute<{
        status: StudioExamTaskStatus;
        generated_question_count: number;
      }>(sql`
        SELECT status, generated_question_count
        FROM studio_exam_generation_tasks
        WHERE operation_id = ${operationId}::uuid;
      `);
      const allTasks = (tasksRes as { rows?: Array<{ status: StudioExamTaskStatus; generated_question_count: number }> }).rows ?? [];

      const allTaskStatuses = allTasks.map((t) => t.status);
      const operationGeneratedCount = allTasks.reduce((sum, t) => sum + (Number(t.generated_question_count) || 0), 0);
      const derivedOpStatus = deriveOperationStatus(allTaskStatuses);

      const opRow = opRows[0];
      const newOperationStatus =
        opRow.status === "cancelled" && operationGeneratedCount === 0
          ? "cancelled"
          : opRow.status === "cancelled"
            ? "partial"
            : derivedOpStatus;

      await tx.execute(sql`
        UPDATE studio_exam_generation_operations
        SET status = ${newOperationStatus},
            total_generated_questions = ${operationGeneratedCount},
            completed_at = ${newOperationStatus === "completed" || newOperationStatus === "partial" || newOperationStatus === "failed" || newOperationStatus === "cancelled" ? sql`COALESCE(completed_at, NOW())` : sql`NULL`},
            updated_at = NOW()
        WHERE id = ${operationId}::uuid;
      `);

      return {
        taskStatus: newTaskStatus,
        taskGeneratedCount,
        operationStatus: newOperationStatus,
        operationGeneratedCount,
      };
    });
  }

  async cancelOperation(
    operationId: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reason?: string }> {
    return await this.db.transaction(async (tx) => {
      // 1. Lock Operation row FIRST with FOR UPDATE (Strict deadlock-free hierarchy: operations -> tasks -> batches)
      const opRes = await tx.execute<{
        id: string;
        status: string;
        total_requested_questions: number;
        total_generated_questions: number;
      }>(sql`
        SELECT id, status, total_requested_questions, total_generated_questions
        FROM studio_exam_generation_operations
        WHERE id = ${operationId}::uuid
        FOR UPDATE;
      `);

      const opRows = (opRes as { rows?: Array<{ id: string; status: string; total_requested_questions: number; total_generated_questions: number }> }).rows ?? [];
      if (opRows.length === 0) {
        throw new DomainError("not_found", `عملیات با شناسه ${operationId} یافت نشد.`);
      }

      const op = opRows[0];
      if (op.status === "completed") {
        return { cancelled: false, reason: "already_completed" };
      }
      if (op.status === "failed") {
        return { cancelled: false, reason: "already_failed" };
      }
      if (op.status === "cancelled") {
        return { cancelled: true, reason: "already_cancelled" };
      }

      // 2. Lock Tasks SECOND with FOR UPDATE
      await tx.execute(sql`
        SELECT t.id
        FROM studio_exam_generation_tasks t
        WHERE t.operation_id = ${operationId}::uuid
        FOR UPDATE;
      `);

      // 3. Lock Batches THIRD with FOR UPDATE
      const lockedBatchesRes = await tx.execute<{ status: string }>(sql`
        SELECT b.status
        FROM studio_exam_generation_batches b
        JOIN studio_exam_generation_tasks t ON t.id = b.task_id
        WHERE t.operation_id = ${operationId}::uuid
        FOR UPDATE;
      `);
      const lockedBatches = (lockedBatchesRes as { rows?: Array<{ status: string }> }).rows ?? [];
      if (
        op.status === "partial" &&
        !lockedBatches.some((b) => b.status === "pending" || b.status === "processing")
      ) {
        return { cancelled: false, reason: "already_finalized" };
      }

      // 3. Mark pending and processing batches as cancelled (Completed batches remain untouched!)
      await tx.execute(sql`
        UPDATE studio_exam_generation_batches b
        SET status = 'cancelled',
            error_code = 'operation_cancelled',
            error_message = ${reason ?? 'عملیات توسط کاربر لغو شد.'},
            completed_at = COALESCE(b.completed_at, NOW()),
            updated_at = NOW()
        FROM studio_exam_generation_tasks t
        WHERE b.task_id = t.id
          AND t.operation_id = ${operationId}::uuid
          AND b.status IN ('pending', 'processing');
      `);

      // 4. Mark pending and processing tasks as cancelled (Completed tasks remain untouched!)
      await tx.execute(sql`
        UPDATE studio_exam_generation_tasks
        SET status = 'cancelled',
            error_code = 'operation_cancelled',
            error_message = ${reason ?? 'عملیات توسط کاربر لغو شد.'},
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
        WHERE operation_id = ${operationId}::uuid
          AND status IN ('pending', 'processing');
      `);

      // 5. Sync each task's generated_question_count with its actual batches
      await tx.execute(sql`
        UPDATE studio_exam_generation_tasks t
        SET generated_question_count = COALESCE((
          SELECT SUM(b.generated_count)
          FROM studio_exam_generation_batches b
          WHERE b.task_id = t.id
        ), 0)
        WHERE t.operation_id = ${operationId}::uuid;
      `);

      // 6. Query tasks to determine total generated count and derived status
      const tasksRes = await tx.execute<{ status: StudioExamTaskStatus; generated_question_count: number }>(sql`
        SELECT status, generated_question_count
        FROM studio_exam_generation_tasks
        WHERE operation_id = ${operationId}::uuid;
      `);
      const allTasks = (tasksRes as { rows?: Array<{ status: StudioExamTaskStatus; generated_question_count: number }> }).rows ?? [];
      const totalGenerated = allTasks.reduce((sum, t) => sum + (Number(t.generated_question_count) || 0), 0);
      const derivedOpStatus = deriveOperationStatus(allTasks.map((t) => t.status));

      // If any questions were successfully generated, status is partial; otherwise cancelled
      const finalOpStatus = totalGenerated > 0 ? "partial" : derivedOpStatus;

      await tx.execute(sql`
        UPDATE studio_exam_generation_operations
        SET status = ${finalOpStatus},
            total_generated_questions = ${totalGenerated},
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${operationId}::uuid;
      `);

      return { cancelled: true, reason: finalOpStatus };
    });
  }

  async handleBatchFinalFailureAndReconcile(params: {
    batchId: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    taskId: string;
    operationId: string;
  }): Promise<void> {
    const { batchId, fencingToken, errorCode, errorMessage, taskId, operationId } = params;

    // 1. Mark batch as failed
    if (fencingToken > 0) {
      await this.markBatchFailed({
        batchId,
        fencingToken,
        errorCode,
        errorMessage,
      });
    } else {
      // Fallback update without fencingToken filter if token is -1
      await this.db.execute(sql`
        UPDATE studio_exam_generation_batches
        SET status = 'failed',
            error_code = ${errorCode},
            error_message = ${errorMessage},
            updated_at = NOW()
        WHERE id = ${batchId}::uuid
          AND status != 'completed';
      `);
    }

    // 2. Reconcile Task and Operation deterministically
    await this.reconcileTaskAndOperation(taskId, operationId);
  }

  async reconcileStaleBatches(
    options?: ReconcileStaleBatchesOptions,
  ): Promise<ReconcileStaleBatchesResult> {
    const leaseSec = options?.leaseDurationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS;
    const graceSec = options?.gracePeriodSeconds ?? 180; // 3 minutes grace period
    const pendingGraceSec = options?.pendingGraceSeconds ?? 60; // 1 minute grace period for un-enqueued batches
    const staleThresholdSeconds = leaseSec + graceSec;
    const limit = options?.limit ?? 50;

    // 1. Query candidate batches that appear to have expired leases
    const candidateRes = await this.db.execute<{
      batch_id: string;
      task_id: string;
      operation_id: string;
      retry_count: number;
    }>(sql`
      SELECT b.id AS batch_id, b.task_id, t.operation_id, b.retry_count
      FROM studio_exam_generation_batches b
      JOIN studio_exam_generation_tasks t ON t.id = b.task_id
      WHERE b.status = 'processing'
        AND b.updated_at < NOW() - (${staleThresholdSeconds} || ' seconds')::interval
      ORDER BY b.updated_at ASC
      LIMIT ${limit};
    `);

    const candidates = (candidateRes as { rows?: Array<{
      batch_id: string;
      task_id: string;
      operation_id: string;
      retry_count: number;
    }> }).rows ?? [];

    const recoveredBatchIds: string[] = [];

    for (const c of candidates) {
      try {
        const recovered = await this.db.transaction(async (tx) => {
          // 1. Lock Operation row FIRST with FOR UPDATE (SKIP LOCKED to avoid contention with active transactions)
          const opRes = await tx.execute<{ id: string; status: string }>(sql`
            SELECT id, status
            FROM studio_exam_generation_operations
            WHERE id = ${c.operation_id}::uuid
            FOR UPDATE SKIP LOCKED;
          `);
          const opRows = (opRes as { rows?: Array<{ id: string; status: string }> }).rows ?? [];
          if (opRows.length === 0) {
            return false;
          }

          // 2. Lock Task row SECOND with FOR UPDATE
          const taskRes = await tx.execute<{ id: string }>(sql`
            SELECT id
            FROM studio_exam_generation_tasks
            WHERE id = ${c.task_id}::uuid
            FOR UPDATE;
          `);
          const taskRows = (taskRes as { rows?: Array<{ id: string }> }).rows ?? [];
          if (taskRows.length === 0) {
            return false;
          }

          // 3. Lock Batch row THIRD with FOR UPDATE and verify Fencing Token & Lease Expiration
          const batchRes = await tx.execute<{
            id: string;
            status: string;
            retry_count: number;
            is_stale: boolean;
          }>(sql`
            SELECT id, status, retry_count,
                   (updated_at < NOW() - (${staleThresholdSeconds} || ' seconds')::interval) AS is_stale
            FROM studio_exam_generation_batches
            WHERE id = ${c.batch_id}::uuid
            FOR UPDATE;
          `);
          const batchRows = (batchRes as { rows?: Array<{
            id: string;
            status: string;
            retry_count: number;
            is_stale: boolean;
          }> }).rows ?? [];

          if (batchRows.length === 0) {
            return false;
          }

          const currentBatch = batchRows[0];
          // Safety verification: verify batch is still processing, token unchanged, and still stale!
          if (
            currentBatch.status !== "processing" ||
            currentBatch.retry_count !== c.retry_count ||
            !currentBatch.is_stale
          ) {
            // An active worker has updated or finalized the batch!
            return false;
          }

          // 4. Mark batch as failed due to lease timeout
          await tx.execute(sql`
            UPDATE studio_exam_generation_batches
            SET status = 'failed',
                error_code = 'stale_lease_expired',
                error_message = 'Lease expired without heartbeat renewal (recovered by sweeper)',
                updated_at = NOW()
            WHERE id = ${c.batch_id}::uuid;
          `);

          // 5. Query task details and batches to reconcile task
          const taskDetailRes = await tx.execute<{ target_question_count: number; error_code: string | null }>(sql`
            SELECT target_question_count, error_code
            FROM studio_exam_generation_tasks
            WHERE id = ${c.task_id}::uuid;
          `);
          const taskDetail = (taskDetailRes as { rows?: Array<{ target_question_count: number; error_code: string | null }> }).rows?.[0];
          if (!taskDetail) return false;

          const allBatchesRes = await tx.execute<{
            status: StudioExamBatchStatus;
            generated_count: number;
            error_code: string | null;
          }>(sql`
            SELECT status, generated_count, error_code
            FROM studio_exam_generation_batches
            WHERE task_id = ${c.task_id}::uuid;
          `);
          const allBatchRows = (allBatchesRes as { rows?: Array<{ status: StudioExamBatchStatus; generated_count: number; error_code: string | null }> }).rows ?? [];

          const batchStatuses = allBatchRows.map((b) => b.status);
          const taskGeneratedCount = allBatchRows.reduce((sum, b) => sum + (Number(b.generated_count) || 0), 0);
          const hasInsufficientContent =
            taskDetail.error_code === "insufficient_content" ||
            allBatchRows.some((b) => b.error_code === "insufficient_content");

          const newTaskStatus = deriveTaskStatus({
            batchStatuses,
            targetCount: taskDetail.target_question_count,
            generatedCount: taskGeneratedCount,
            insufficientContent: hasInsufficientContent,
          });

          await tx.execute(sql`
            UPDATE studio_exam_generation_tasks
            SET status = ${newTaskStatus},
                generated_question_count = ${taskGeneratedCount},
                completed_at = ${newTaskStatus === "completed" || newTaskStatus === "partial" || newTaskStatus === "failed" || newTaskStatus === "insufficient_content" ? sql`COALESCE(completed_at, NOW())` : sql`NULL`},
                updated_at = NOW()
            WHERE id = ${c.task_id}::uuid;
          `);

          // 6. Query all tasks to reconcile operation
          const allTasksRes = await tx.execute<{
            status: StudioExamTaskStatus;
            generated_question_count: number;
          }>(sql`
            SELECT status, generated_question_count
            FROM studio_exam_generation_tasks
            WHERE operation_id = ${c.operation_id}::uuid;
          `);
          const allTaskRows = (allTasksRes as { rows?: Array<{ status: StudioExamTaskStatus; generated_question_count: number }> }).rows ?? [];

          const allTaskStatuses = allTaskRows.map((t) => t.status);
          const opGeneratedCount = allTaskRows.reduce((sum, t) => sum + (Number(t.generated_question_count) || 0), 0);
          const derivedOpStatus = deriveOperationStatus(allTaskStatuses);

          const opRow = opRows[0];
          const newOperationStatus =
            opRow.status === "cancelled" && opGeneratedCount === 0
              ? "cancelled"
              : opRow.status === "cancelled"
                ? "partial"
                : derivedOpStatus;

          await tx.execute(sql`
            UPDATE studio_exam_generation_operations
            SET status = ${newOperationStatus},
                total_generated_questions = ${opGeneratedCount},
                completed_at = ${newOperationStatus === "completed" || newOperationStatus === "partial" || newOperationStatus === "failed" || newOperationStatus === "cancelled" ? sql`COALESCE(completed_at, NOW())` : sql`NULL`},
                updated_at = NOW()
            WHERE id = ${c.operation_id}::uuid;
          `);

          return true;
        });

        if (recovered) {
          recoveredBatchIds.push(c.batch_id);
        }
      } catch {
        // Individual batch transient error does not abort entire sweeper run
      }
    }

    // 2. Scan and re-enqueue orphaned pending batches older than pendingGraceSec
    const reenqueuedBatchIds: string[] = [];
    if (options?.queue) {
      const pendingRes = await this.db.execute<{
        batch_id: string;
        task_id: string;
        operation_id: string;
      }>(sql`
        SELECT b.id AS batch_id, b.task_id, t.operation_id
        FROM studio_exam_generation_batches b
        JOIN studio_exam_generation_tasks t ON t.id = b.task_id
        JOIN studio_exam_generation_operations o ON o.id = t.operation_id
        WHERE b.status = 'pending'
          AND o.status IN ('pending', 'processing')
          AND jsonb_array_length(b.pattern_allocations) > 0
          AND b.created_at <= NOW() - (${pendingGraceSec} || ' seconds')::interval
        ORDER BY b.created_at ASC
        LIMIT ${limit};
      `);
      const pendingBatches = (pendingRes as { rows?: Array<{
        batch_id: string;
        task_id: string;
        operation_id: string;
      }> }).rows ?? [];

      for (const pb of pendingBatches) {
        try {
          await options.queue.add(
            STUDIO_EXAM_BATCH_JOB_NAME,
            {
              operationId: pb.operation_id,
              taskId: pb.task_id,
              batchId: pb.batch_id,
            },
            {
              jobId: `batch_${pb.batch_id}`,
            },
          );
          reenqueuedBatchIds.push(pb.batch_id);
        } catch {
          // Individual batch re-enqueuing failure does not abort sweeper
        }
      }
    }

    return {
      scannedCount: candidates.length,
      recoveredBatchesCount: recoveredBatchIds.length,
      recoveredBatchIds,
      reenqueuedBatchesCount: reenqueuedBatchIds.length,
      reenqueuedBatchIds,
    };
  }

  async repairPendingOperationPatterns(
    operationId: string,
    patternSnapshots: StudioExamPatternSnapshot[],
  ): Promise<{ repairedBatchCount: number }> {
    if (!isUuid(operationId) || patternSnapshots.length === 0) {
      return { repairedBatchCount: 0 };
    }

    return await this.db.transaction(async (tx) => {
      const opRes = await tx.execute<{
        id: string;
        status: string;
        pattern_snapshots: StudioExamPatternSnapshot[];
      }>(sql`
        SELECT id, status, pattern_snapshots
        FROM studio_exam_generation_operations
        WHERE id = ${operationId}::uuid
        FOR UPDATE;
      `);
      const opRow = (opRes as {
        rows?: Array<{
          id: string;
          status: string;
          pattern_snapshots: StudioExamPatternSnapshot[];
        }>;
      }).rows?.[0];

      if (!opRow || (opRow.status !== "pending" && opRow.status !== "processing")) {
        return { repairedBatchCount: 0 };
      }

      const effectiveSnapshots =
        Array.isArray(opRow.pattern_snapshots) && opRow.pattern_snapshots.length > 0
          ? opRow.pattern_snapshots
          : patternSnapshots;

      if (!Array.isArray(opRow.pattern_snapshots) || opRow.pattern_snapshots.length === 0) {
        await tx.execute(sql`
          UPDATE studio_exam_generation_operations
          SET pattern_snapshots = ${JSON.stringify(effectiveSnapshots)}::jsonb,
              updated_at = NOW()
          WHERE id = ${operationId}::uuid;
        `);
      }

      const batchesRes = await tx.execute<{
        id: string;
        target_count: number;
        generated_count: number;
        status: string;
        pattern_allocations: QuestionPatternAssignment[];
      }>(sql`
        SELECT b.id, b.target_count, b.generated_count, b.status, b.pattern_allocations
        FROM studio_exam_generation_batches b
        JOIN studio_exam_generation_tasks t ON t.id = b.task_id
        WHERE t.operation_id = ${operationId}::uuid
        ORDER BY b.created_at ASC, b.batch_index ASC
        FOR UPDATE;
      `);
      const batchRows = (batchesRes as {
        rows?: Array<{
          id: string;
          target_count: number;
          generated_count: number;
          status: string;
          pattern_allocations: QuestionPatternAssignment[];
        }>;
      }).rows ?? [];

      let repairedBatchCount = 0;
      let startIndex = 0;
      for (const b of batchRows) {
        const targetCount = Number(b.target_count) || 0;
        const allocs = Array.isArray(b.pattern_allocations) ? b.pattern_allocations : [];
        if (b.status === "pending" && Number(b.generated_count) === 0 && allocs.length === 0 && targetCount > 0) {
          const newAllocs = allocateQuestionPatterns({
            targetCount,
            patternSnapshots: effectiveSnapshots,
            startIndex,
          });
          await tx.execute(sql`
            UPDATE studio_exam_generation_batches
            SET pattern_allocations = ${JSON.stringify(newAllocs)}::jsonb,
                updated_at = NOW()
            WHERE id = ${b.id}::uuid;
          `);
          repairedBatchCount++;
        }
        startIndex += targetCount;
      }

      return { repairedBatchCount };
    });
  }

  async createOperationWithTasksAndBatches(
    params: CreateOperationWithTasksAndBatchesParams,
  ): Promise<CreatedOperationDetails> {
    return await this.db.transaction(async (tx) => {
      // 1. Lock Quiz row FIRST with FOR UPDATE to serialize operation creation per quiz and eliminate race conditions
      const quizRes = await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM marketing_quizzes
        WHERE id = ${params.quizId}::uuid
        FOR UPDATE;
      `);
      const quizRows = (quizRes as { rows?: Array<{ id: string }> }).rows ?? [];
      if (quizRows.length === 0) {
        throw new DomainError(
          "not_found",
          "آزمون مورد نظر یافت نشد.",
          { quizId: params.quizId },
        );
      }

      // 2. Conflict check: check if an active operation already exists for this quiz
      const activeRes = await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM studio_exam_generation_operations
        WHERE quiz_id = ${params.quizId}::uuid
          AND status IN ('pending', 'processing')
        FOR UPDATE;
      `);
      const activeRows = (activeRes as { rows?: Array<{ id: string }> }).rows ?? [];
      if (activeRows.length > 0) {
        throw new DomainError(
          "conflict",
          "یک عملیات فعال برای این آزمون در حال اجرا است.",
          { activeOperationId: activeRows[0].id },
        );
      }

      // 2. Insert operation
      const opRes = await tx.execute<{
        id: string;
        quiz_id: string;
        organization_id: string | null;
        created_by: string | null;
        total_requested_questions: number;
        total_generated_questions: number;
        status: StudioExamOperationStatus;
        config: Record<string, unknown>;
        pattern_snapshots: StudioExamPatternSnapshot[];
        created_at: Date | string;
        updated_at: Date | string;
      }>(sql`
        INSERT INTO studio_exam_generation_operations (
          quiz_id,
          organization_id,
          created_by,
          total_requested_questions,
          total_generated_questions,
          status,
          config,
          pattern_snapshots
        ) VALUES (
          ${params.quizId}::uuid,
          ${params.organizationId ? sql`${params.organizationId}::uuid` : sql`NULL`},
          ${params.createdBy ? sql`${params.createdBy}::uuid` : sql`NULL`},
          ${params.totalRequestedQuestions},
          0,
          'pending',
          ${JSON.stringify(params.config ?? {})}::jsonb,
          ${JSON.stringify(params.patternSnapshots ?? [])}::jsonb
        )
        RETURNING id, quiz_id, organization_id, created_by, total_requested_questions,
                  total_generated_questions, status, config, pattern_snapshots, created_at, updated_at;
      `);
      const opRows = (opRes as { rows?: Array<{
        id: string;
        quiz_id: string;
        organization_id: string | null;
        created_by: string | null;
        total_requested_questions: number;
        total_generated_questions: number;
        status: StudioExamOperationStatus;
        config: Record<string, unknown>;
        pattern_snapshots: StudioExamPatternSnapshot[];
        created_at: Date | string;
        updated_at: Date | string;
      }> }).rows ?? [];
      const opRow = opRows[0];

      const createdTasks: CreatedOperationDetails["tasks"] = [];
      const createdBatches: CreatedOperationDetails["batches"] = [];

      // 3. Insert tasks and batches
      for (const task of params.tasks) {
        const taskRes = await tx.execute<{
          id: string;
          operation_id: string;
          course_id: string;
          module_id: string;
          target_question_count: number;
          generated_question_count: number;
          status: StudioExamTaskStatus;
          created_at: Date | string;
        }>(sql`
          INSERT INTO studio_exam_generation_tasks (
            operation_id,
            course_id,
            module_id,
            target_question_count,
            generated_question_count,
            status
          ) VALUES (
            ${opRow.id}::uuid,
            ${task.courseId}::uuid,
            ${task.moduleId}::uuid,
            ${task.targetQuestionCount},
            0,
            'pending'
          )
          RETURNING id, operation_id, course_id, module_id, target_question_count,
                    generated_question_count, status, created_at;
        `);
        const taskRows = (taskRes as { rows?: Array<{
          id: string;
          operation_id: string;
          course_id: string;
          module_id: string;
          target_question_count: number;
          generated_question_count: number;
          status: StudioExamTaskStatus;
          created_at: Date | string;
        }> }).rows ?? [];
        const taskRow = taskRows[0];
        createdTasks.push({
          id: taskRow.id,
          operationId: taskRow.operation_id,
          courseId: taskRow.course_id,
          moduleId: taskRow.module_id,
          targetQuestionCount: Number(taskRow.target_question_count),
          generatedQuestionCount: Number(taskRow.generated_question_count),
          status: taskRow.status,
          createdAt: taskRow.created_at,
        });

        for (const batch of task.batches) {
          const batchRes = await tx.execute<{
            id: string;
            task_id: string;
            batch_index: number;
            target_count: number;
            generated_count: number;
            status: StudioExamBatchStatus;
            pattern_allocations: QuestionPatternAssignment[];
            created_at: Date | string;
          }>(sql`
            INSERT INTO studio_exam_generation_batches (
              task_id,
              batch_index,
              target_count,
              generated_count,
              status,
              pattern_allocations
            ) VALUES (
              ${taskRow.id}::uuid,
              ${batch.batchIndex},
              ${batch.targetCount},
              0,
              'pending',
              ${JSON.stringify(batch.patternAllocations ?? [])}::jsonb
            )
            RETURNING id, task_id, batch_index, target_count, generated_count,
                      status, pattern_allocations, created_at;
          `);
          const batchRows = (batchRes as { rows?: Array<{
            id: string;
            task_id: string;
            batch_index: number;
            target_count: number;
            generated_count: number;
            status: StudioExamBatchStatus;
            pattern_allocations: QuestionPatternAssignment[];
            created_at: Date | string;
          }> }).rows ?? [];
          const batchRow = batchRows[0];
          createdBatches.push({
            id: batchRow.id,
            taskId: batchRow.task_id,
            batchIndex: Number(batchRow.batch_index),
            targetCount: Number(batchRow.target_count),
            generatedCount: Number(batchRow.generated_count),
            status: batchRow.status,
            patternAllocations: batchRow.pattern_allocations ?? [],
            createdAt: batchRow.created_at,
          });
        }
      }

      return {
        operation: {
          id: opRow.id,
          quizId: opRow.quiz_id,
          organizationId: opRow.organization_id,
          createdBy: opRow.created_by,
          totalRequestedQuestions: Number(opRow.total_requested_questions),
          totalGeneratedQuestions: Number(opRow.total_generated_questions),
          status: opRow.status,
          config: opRow.config ?? {},
          patternSnapshots: opRow.pattern_snapshots ?? [],
          createdAt: opRow.created_at,
          updatedAt: opRow.updated_at,
        },
        tasks: createdTasks,
        batches: createdBatches,
      };
    });
  }

  async getActiveOperationByQuizId(quizId: string): Promise<ActiveOperationSummary | null> {
    const res = await this.db.execute<{
      id: string;
      quiz_id: string;
      organization_id: string | null;
      total_requested_questions: number;
      total_generated_questions: number;
      status: StudioExamOperationStatus;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(sql`
      SELECT id, quiz_id, organization_id, total_requested_questions, total_generated_questions,
             status, started_at, completed_at, created_at, updated_at
      FROM studio_exam_generation_operations
      WHERE quiz_id = ${quizId}::uuid
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1;
    `);

    const rows =
      (res as {
        rows?: Array<{
          id: string;
          quiz_id: string;
          organization_id: string | null;
          total_requested_questions: number;
          total_generated_questions: number;
          status: StudioExamOperationStatus;
          started_at: Date | string | null;
          completed_at: Date | string | null;
          created_at: Date | string;
          updated_at: Date | string;
        }>;
      }).rows ?? [];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      quizId: r.quiz_id,
      organizationId: r.organization_id,
      totalRequestedQuestions: Number(r.total_requested_questions),
      totalGeneratedQuestions: Number(r.total_generated_questions),
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async listOperationsByQuizId(
    params: ListOperationsByQuizIdParams,
  ): Promise<ListOperationsByQuizIdResult> {
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const offset = Math.max(0, params.offset ?? 0);

    if (!isUuid(params.quizId)) {
      return { operations: [], total: 0, limit, offset };
    }

    const conditions = [eq(studioExamGenerationOperations.quizId, params.quizId)];
    if (params.organizationId) {
      conditions.push(eq(studioExamGenerationOperations.organizationId, params.organizationId));
    }
    if (params.status) {
      conditions.push(eq(studioExamGenerationOperations.status, params.status));
    }
    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const [countRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(studioExamGenerationOperations)
      .where(whereClause);
    const total = Number(countRow?.count ?? 0);

    if (total === 0) {
      return { operations: [], total: 0, limit, offset };
    }

    const opRows = await this.db
      .select({
        id: studioExamGenerationOperations.id,
        quizId: studioExamGenerationOperations.quizId,
        organizationId: studioExamGenerationOperations.organizationId,
        status: studioExamGenerationOperations.status,
        totalRequestedQuestions: studioExamGenerationOperations.totalRequestedQuestions,
        totalGeneratedQuestions: studioExamGenerationOperations.totalGeneratedQuestions,
        startedAt: studioExamGenerationOperations.startedAt,
        completedAt: studioExamGenerationOperations.completedAt,
        createdAt: studioExamGenerationOperations.createdAt,
        updatedAt: studioExamGenerationOperations.updatedAt,
      })
      .from(studioExamGenerationOperations)
      .where(whereClause)
      .orderBy(desc(studioExamGenerationOperations.createdAt))
      .limit(limit)
      .offset(offset);

    if (opRows.length === 0) {
      return { operations: [], total, limit, offset };
    }

    const opIds = opRows.map((op) => op.id);
    const statsRows = await this.db
      .select({
        operationId: studioExamGeneratedQuestions.operationId,
        totalCount: sql<number>`count(*)::int`,
        pendingReviewCount: sql<number>`count(*) filter (where ${studioExamGeneratedQuestions.reviewStatus} = 'pending_review' and ${studioExamGeneratedQuestions.transferredQuestionId} is null)::int`,
        acceptedCount: sql<number>`count(*) filter (where ${studioExamGeneratedQuestions.reviewStatus} = 'accepted' and ${studioExamGeneratedQuestions.transferredQuestionId} is null)::int`,
        rejectedCount: sql<number>`count(*) filter (where ${studioExamGeneratedQuestions.reviewStatus} = 'rejected' and ${studioExamGeneratedQuestions.transferredQuestionId} is null)::int`,
        transferredCount: sql<number>`count(*) filter (where ${studioExamGeneratedQuestions.reviewStatus} = 'transferred' or ${studioExamGeneratedQuestions.transferredQuestionId} is not null)::int`,
      })
      .from(studioExamGeneratedQuestions)
      .where(inArray(studioExamGeneratedQuestions.operationId, opIds))
      .groupBy(studioExamGeneratedQuestions.operationId);

    const statsByOpId = new Map<string, StagingQuestionStats>(
      statsRows.map((s) => [
        s.operationId,
        {
          totalCount: Number(s.totalCount ?? 0),
          pendingReviewCount: Number(s.pendingReviewCount ?? 0),
          acceptedCount: Number(s.acceptedCount ?? 0),
          rejectedCount: Number(s.rejectedCount ?? 0),
          transferredCount: Number(s.transferredCount ?? 0),
        },
      ]),
    );

    const operations: ExamOperationHistoryItem[] = opRows.map((op) => {
      const requested = Number(op.totalRequestedQuestions);
      const stats = statsByOpId.get(op.id) ?? {
        totalCount: 0,
        pendingReviewCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        transferredCount: 0,
      };
      const generated = Math.max(Number(op.totalGeneratedQuestions), stats.totalCount);
      const progressPercentage =
        requested > 0 ? Math.min(100, Math.round((generated / requested) * 100)) : 0;

      return {
        id: op.id,
        quizId: op.quizId,
        organizationId: op.organizationId,
        status: op.status as StudioExamOperationStatus,
        totalRequestedQuestions: requested,
        totalGeneratedQuestions: generated,
        progressPercentage,
        stagingStats: stats,
        startedAt: op.startedAt,
        completedAt: op.completedAt,
        createdAt: op.createdAt,
        updatedAt: op.updatedAt,
      };
    });

    return { operations, total, limit, offset };
  }

  async getOperationById(operationId: string): Promise<FullOperationDetails | null> {
    if (!isUuid(operationId)) {
      return null;
    }
    const opRes = await this.db.execute<{
      id: string;
      quiz_id: string;
      organization_id: string | null;
      created_by: string | null;
      total_requested_questions: number;
      total_generated_questions: number;
      status: StudioExamOperationStatus;
      config: Record<string, unknown>;
      pattern_snapshots: StudioExamPatternSnapshot[];
      started_at: Date | string | null;
      completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(sql`
      SELECT id, quiz_id, organization_id, created_by, total_requested_questions, total_generated_questions,
             status, config, pattern_snapshots, started_at, completed_at, created_at, updated_at
      FROM studio_exam_generation_operations
      WHERE id = ${operationId}::uuid
      LIMIT 1;
    `);
    const opRows = (opRes as { rows?: Array<{
      id: string;
      quiz_id: string;
      organization_id: string | null;
      created_by: string | null;
      total_requested_questions: number;
      total_generated_questions: number;
      status: StudioExamOperationStatus;
      config: Record<string, unknown>;
      pattern_snapshots: StudioExamPatternSnapshot[];
      started_at: Date | string | null;
      completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }> }).rows ?? [];
    if (opRows.length === 0) return null;
    const op = opRows[0];

    const tasksRes = await this.db.execute<{
      id: string;
      operation_id: string;
      course_id: string;
      module_id: string;
      target_question_count: number;
      generated_question_count: number;
      status: StudioExamTaskStatus;
      retry_count: number;
      error_code: string | null;
      error_message: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(sql`
      SELECT id, operation_id, course_id, module_id, target_question_count, generated_question_count,
             status, retry_count, error_code, error_message, started_at, completed_at, created_at, updated_at
      FROM studio_exam_generation_tasks
      WHERE operation_id = ${operationId}::uuid
      ORDER BY created_at ASC;
    `);
    const taskRows = (tasksRes as { rows?: Array<{
      id: string;
      operation_id: string;
      course_id: string;
      module_id: string;
      target_question_count: number;
      generated_question_count: number;
      status: StudioExamTaskStatus;
      retry_count: number;
      error_code: string | null;
      error_message: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }> }).rows ?? [];

    const batchesRes = await this.db.execute<{
      id: string;
      task_id: string;
      batch_index: number;
      target_count: number;
      generated_count: number;
      status: StudioExamBatchStatus;
      pattern_allocations: QuestionPatternAssignment[];
      retry_count: number;
      error_code: string | null;
      error_message: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(sql`
      SELECT b.id, b.task_id, b.batch_index, b.target_count, b.generated_count,
             b.status, b.pattern_allocations, b.retry_count, b.error_code, b.error_message,
             b.started_at, b.completed_at, b.created_at, b.updated_at
      FROM studio_exam_generation_batches b
      JOIN studio_exam_generation_tasks t ON t.id = b.task_id
      WHERE t.operation_id = ${operationId}::uuid
      ORDER BY b.batch_index ASC;
    `);
    const batchRows = (batchesRes as { rows?: Array<{
      id: string;
      task_id: string;
      batch_index: number;
      target_count: number;
      generated_count: number;
      status: StudioExamBatchStatus;
      pattern_allocations: QuestionPatternAssignment[];
      retry_count: number;
      error_code: string | null;
      error_message: string | null;
      started_at: Date | string | null;
      completed_at: Date | string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }> }).rows ?? [];

    return {
      operation: {
        id: op.id,
        quizId: op.quiz_id,
        organizationId: op.organization_id,
        createdBy: op.created_by,
        totalRequestedQuestions: Number(op.total_requested_questions),
        totalGeneratedQuestions: Number(op.total_generated_questions),
        status: op.status,
        config: op.config ?? {},
        patternSnapshots: op.pattern_snapshots ?? [],
        startedAt: op.started_at,
        completedAt: op.completed_at,
        createdAt: op.created_at,
        updatedAt: op.updated_at,
      },
      tasks: taskRows.map((t) => ({
        id: t.id,
        operationId: t.operation_id,
        courseId: t.course_id,
        moduleId: t.module_id,
        targetQuestionCount: Number(t.target_question_count),
        generatedQuestionCount: Number(t.generated_question_count),
        status: t.status,
        retryCount: Number(t.retry_count),
        errorCode: t.error_code,
        errorMessage: sanitizeErrorMessage(t.error_code, t.error_message),
        startedAt: t.started_at,
        completedAt: t.completed_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
      batches: batchRows.map((b) => ({
        id: b.id,
        taskId: b.task_id,
        batchIndex: Number(b.batch_index),
        targetCount: Number(b.target_count),
        generatedCount: Number(b.generated_count),
        status: b.status,
        patternAllocations: b.pattern_allocations ?? [],
        retryCount: Number(b.retry_count),
        errorCode: b.error_code,
        errorMessage: sanitizeErrorMessage(b.error_code, b.error_message),
        startedAt: b.started_at,
        completedAt: b.completed_at,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      })),
    };
  }

  async getOperationProgress(operationId: string): Promise<OperationProgressSummary | null> {
    if (!isUuid(operationId)) {
      return null;
    }
    const opRes = await this.db.execute<{
      id: string;
      quiz_id: string;
      organization_id: string | null;
      status: StudioExamOperationStatus;
      total_requested_questions: number;
      total_generated_questions: number;
      updated_at: Date | string;
    }>(sql`
      SELECT id, quiz_id, organization_id, status, total_requested_questions, total_generated_questions, updated_at
      FROM studio_exam_generation_operations
      WHERE id = ${operationId}::uuid
      LIMIT 1;
    `);
    const opRows = (opRes as { rows?: Array<{
      id: string;
      quiz_id: string;
      organization_id: string | null;
      status: StudioExamOperationStatus;
      total_requested_questions: number;
      total_generated_questions: number;
      updated_at: Date | string;
    }> }).rows ?? [];
    if (opRows.length === 0) return null;
    const op = opRows[0];

    const tasksRes = await this.db.execute<{
      id: string;
      module_id: string;
      course_id: string;
      target_question_count: number;
      generated_question_count: number;
      status: StudioExamTaskStatus;
      physical_count: number;
    }>(sql`
      SELECT t.id, t.module_id, t.course_id, t.target_question_count, t.generated_question_count, t.status,
             COUNT(q.id)::int AS physical_count
      FROM studio_exam_generation_tasks t
      LEFT JOIN studio_exam_generated_questions q ON q.task_id = t.id
      WHERE t.operation_id = ${operationId}::uuid
      GROUP BY t.id, t.module_id, t.course_id, t.target_question_count, t.generated_question_count, t.status, t.created_at
      ORDER BY t.created_at ASC;
    `);
    const taskRows = (tasksRes as { rows?: Array<{
      id: string;
      module_id: string;
      course_id: string;
      target_question_count: number;
      generated_question_count: number;
      status: StudioExamTaskStatus;
      physical_count: number;
    }> }).rows ?? [];

    const tasks: TaskProgressSummary[] = taskRows.map((t) => {
      const gen = Math.max(Number(t.generated_question_count) || 0, Number(t.physical_count) || 0);
      return {
        taskId: t.id,
        moduleId: t.module_id,
        courseId: t.course_id,
        targetCount: Number(t.target_question_count),
        generatedCount: gen,
        status: t.status,
      };
    });

    const totalRequested = Number(op.total_requested_questions) || 0;
    const taskSumGenerated = tasks.reduce((sum, t) => sum + t.generatedCount, 0);
    const totalGenerated = Math.max(Number(op.total_generated_questions) || 0, taskSumGenerated);
    const progressPercentage =
      totalRequested > 0 ? Math.min(100, Math.round((totalGenerated / totalRequested) * 100)) : 0;

    return {
      operationId: op.id,
      quizId: op.quiz_id,
      organizationId: op.organization_id,
      status: op.status,
      totalRequestedQuestions: totalRequested,
      totalGeneratedQuestions: totalGenerated,
      progressPercentage,
      updatedAt: op.updated_at,
      tasks,
    };
  }

  async getGeneratedQuestions(
    params: GetGeneratedQuestionsParams,
  ): Promise<StagingQuestionRecord[]> {
    if (!isUuid(params.operationId)) {
      return [];
    }
    const conditions = [sql`operation_id = ${params.operationId}::uuid`];
    if (params.taskId) {
      conditions.push(sql`task_id = ${params.taskId}::uuid`);
    }
    if (params.batchId) {
      conditions.push(sql`batch_id = ${params.batchId}::uuid`);
    }
    if (params.isAccepted !== undefined) {
      conditions.push(sql`is_accepted = ${params.isAccepted}`);
    }
    if (params.reviewStatus !== undefined) {
      conditions.push(sql`review_status = ${params.reviewStatus}`);
    }

    const limitClause = params.limit ? sql`LIMIT ${params.limit}` : sql``;
    const offsetClause = params.offset ? sql`OFFSET ${params.offset}` : sql``;

    const res = await this.db.execute<StagingQuestionDbRow>(sql`
      SELECT id, operation_id, task_id, batch_id, course_id, module_id, pattern_id, pattern_version,
             question_index, question, choices, correct_answer, explanation, difficulty, topic,
             question_type, metadata, is_accepted, review_status, transferred_question_id,
             transferred_at, created_at
      FROM studio_exam_generated_questions
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY created_at ASC, question_index ASC
      ${limitClause}
      ${offsetClause};
    `);

    const rows = (res as { rows?: StagingQuestionDbRow[] }).rows ?? [];
    return rows.map((r) => this.mapStagingQuestionRow(r));
  }

  private mapStagingQuestionRow(r: StagingQuestionDbRow): StagingQuestionRecord {
    const choices = normalizeStagingChoices(r.choices);
    const correctAnswer = normalizeStagingCorrectAnswer(r.correct_answer, choices);
    return {
      id: r.id,
      operationId: r.operation_id,
      taskId: r.task_id,
      batchId: r.batch_id,
      courseId: r.course_id,
      moduleId: r.module_id,
      patternId: r.pattern_id,
      patternVersion: r.pattern_version ? Number(r.pattern_version) : null,
      questionIndex: Number(r.question_index),
      question: r.question,
      choices,
      correctAnswer,
      explanation: r.explanation,
      difficulty: r.difficulty,
      topic: r.topic,
      questionType: r.question_type,
      metadata: r.metadata ?? {},
      isAccepted: Boolean(r.is_accepted),
      reviewStatus: (r.review_status ?? (r.is_accepted ? "accepted" : "pending_review")) as StagingQuestionReviewStatus,
      transferredQuestionId: r.transferred_question_id ?? null,
      transferredAt: r.transferred_at ?? null,
      createdAt: r.created_at,
    };
  }

  async reviewGeneratedQuestions(
    params: ReviewGeneratedQuestionsParams,
  ): Promise<ReviewGeneratedQuestionsResult> {
    if (!isUuid(params.operationId)) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", {
        operationId: params.operationId,
      });
    }

    const uniqueIds = Array.from(new Set(params.questionIds));
    if (uniqueIds.length === 0) {
      throw new DomainError("bad_request", "حداقل یک سؤال باید انتخاب شود.");
    }
    for (const qId of uniqueIds) {
      if (!isUuid(qId)) {
        throw new DomainError("bad_request", "شناسه سؤال نامعتبر است.", { questionId: qId });
      }
    }

    return await this.db.transaction(async (tx) => {
      const opRes = await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM studio_exam_generation_operations
        WHERE id = ${params.operationId}::uuid
        FOR UPDATE;
      `);
      const opRows = (opRes as { rows?: Array<{ id: string }> }).rows ?? [];
      if (opRows.length === 0) {
        throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", {
          operationId: params.operationId,
        });
      }

      const idListSql = sql.join(
        uniqueIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );

      const lockedRes = await tx.execute<StagingQuestionDbRow>(sql`
        SELECT id, operation_id, task_id, batch_id, course_id, module_id, pattern_id, pattern_version,
               question_index, question, choices, correct_answer, explanation, difficulty, topic,
               question_type, metadata, is_accepted, review_status, transferred_question_id,
               transferred_at, created_at
        FROM studio_exam_generated_questions
        WHERE id IN (${idListSql})
        FOR UPDATE;
      `);

      const lockedRows = (lockedRes as { rows?: StagingQuestionDbRow[] }).rows ?? [];
      if (
        lockedRows.length !== uniqueIds.length ||
        lockedRows.some((r) => r.operation_id !== params.operationId)
      ) {
        throw new DomainError(
          "bad_request",
          "یک یا چند سؤال در این عملیات یافت نشد یا متعلق به عملیات دیگری است.",
        );
      }

      const skippedTransferredIds: string[] = [];
      const idsToUpdate: string[] = [];
      const newIsAccepted = params.decision === "accepted";

      for (const row of lockedRows) {
        if (row.review_status === "transferred") {
          skippedTransferredIds.push(row.id);
          continue;
        }
        if (row.review_status !== params.decision || Boolean(row.is_accepted) !== newIsAccepted) {
          idsToUpdate.push(row.id);
        }
      }

      if (idsToUpdate.length > 0) {
        const updateIdsSql = sql.join(
          idsToUpdate.map((id) => sql`${id}::uuid`),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE studio_exam_generated_questions
          SET review_status = ${params.decision},
              is_accepted = ${newIsAccepted}
          WHERE operation_id = ${params.operationId}::uuid
            AND id IN (${updateIdsSql})
            AND review_status != 'transferred';
        `);
      }

      const updatedRes = await tx.execute<StagingQuestionDbRow>(sql`
        SELECT id, operation_id, task_id, batch_id, course_id, module_id, pattern_id, pattern_version,
               question_index, question, choices, correct_answer, explanation, difficulty, topic,
               question_type, metadata, is_accepted, review_status, transferred_question_id,
               transferred_at, created_at
        FROM studio_exam_generated_questions
        WHERE id IN (${idListSql})
        ORDER BY created_at ASC, question_index ASC;
      `);

      const updatedRows = (updatedRes as { rows?: StagingQuestionDbRow[] }).rows ?? [];
      return {
        updatedCount: idsToUpdate.length,
        skippedTransferredIds,
        questions: updatedRows.map((r) => this.mapStagingQuestionRow(r)),
      };
    });
  }

  async transferGeneratedQuestionsToQuiz(
    params: TransferGeneratedQuestionsParams,
  ): Promise<TransferGeneratedQuestionsResult> {
    if (!isUuid(params.operationId)) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", {
        operationId: params.operationId,
      });
    }

    const uniqueIds = Array.from(new Set(params.questionIds));
    if (uniqueIds.length === 0) {
      throw new DomainError("bad_request", "حداقل یک سؤال باید برای انتقال انتخاب شود.");
    }
    for (const qId of uniqueIds) {
      if (!isUuid(qId)) {
        throw new DomainError("bad_request", "شناسه سؤال نامعتبر است.", { questionId: qId });
      }
    }

    return await this.db.transaction(async (tx) => {
      // 1. Lock Operation row and extract authoritative quizId from DB
      const opRes = await tx.execute<{ id: string; quiz_id: string }>(sql`
        SELECT id, quiz_id
        FROM studio_exam_generation_operations
        WHERE id = ${params.operationId}::uuid
        FOR UPDATE;
      `);
      const opRows = (opRes as { rows?: Array<{ id: string; quiz_id: string }> }).rows ?? [];
      if (opRows.length === 0) {
        throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", {
          operationId: params.operationId,
        });
      }
      const quizId = opRows[0].quiz_id;

      // 2. Lock target quiz row to serialize sortOrder and confirm quiz is active
      const quizRes = await tx.execute<{ id: string }>(sql`
        SELECT id
        FROM marketing_quizzes
        WHERE id = ${quizId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE;
      `);
      const quizRows = (quizRes as { rows?: Array<{ id: string }> }).rows ?? [];
      if (quizRows.length === 0) {
        throw new DomainError("not_found", "آزمون مقصد یافت نشد یا حذف شده است.", { quizId });
      }

      // 3. Lock target staging questions with FOR UPDATE
      const idListSql = sql.join(
        uniqueIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      const lockedRes = await tx.execute<StagingQuestionDbRow>(sql`
        SELECT id, operation_id, task_id, batch_id, course_id, module_id, pattern_id, pattern_version,
               question_index, question, choices, correct_answer, explanation, difficulty, topic,
               question_type, metadata, is_accepted, review_status, transferred_question_id,
               transferred_at, created_at
        FROM studio_exam_generated_questions
        WHERE id IN (${idListSql})
        FOR UPDATE;
      `);
      const lockedRows = (lockedRes as { rows?: StagingQuestionDbRow[] }).rows ?? [];
      if (
        lockedRows.length !== uniqueIds.length ||
        lockedRows.some((r) => r.operation_id !== params.operationId)
      ) {
        throw new DomainError(
          "bad_request",
          "یک یا چند سؤال در این عملیات یافت نشد یا متعلق به عملیات دیگری است.",
        );
      }

      const rowMap = new Map(lockedRows.map((r) => [r.id, r]));
      const alreadyTransferredIds: string[] = [];
      const existingTransferredQuestionIds: string[] = [];
      const toTransfer: StagingQuestionDbRow[] = [];

      for (const qId of uniqueIds) {
        const row = rowMap.get(qId)!;
        if (row.review_status === "transferred" || row.transferred_question_id !== null) {
          alreadyTransferredIds.push(row.id);
          if (row.transferred_question_id) {
            existingTransferredQuestionIds.push(row.transferred_question_id);
          }
          continue;
        }
        if (row.review_status !== "accepted") {
          throw new DomainError(
            "bad_request",
            "فقط سؤالات تأییدشده قابل انتقال به آزمون هستند.",
            { questionId: row.id, reviewStatus: row.review_status },
          );
        }
        toTransfer.push(row);
      }

      if (toTransfer.length === 0) {
        return {
          transferredCount: 0,
          alreadyTransferredIds,
          createdQuestions: [],
          existingTransferredQuestionIds,
        };
      }

      // 4. Determine next sort_order in marketing_quiz_questions
      const sortRes = await tx.execute<{ next_sort: number }>(sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
        FROM marketing_quiz_questions
        WHERE marketing_quiz_id = ${quizId}::uuid;
      `);
      const sortRows = (sortRes as { rows?: Array<{ next_sort: number }> }).rows ?? [];
      let nextSort = Number(sortRows[0]?.next_sort ?? 0);

      const createdQuestions: MarketingQuizQuestionSnapshot[] = [];

      // 5. Insert into marketing_quiz_questions and update staging rows atomically
      for (const row of toTransfer) {
        const normalizedDifficulty: "easy" | "medium" | "hard" =
          row.difficulty === "easy" || row.difficulty === "hard" ? row.difficulty : "medium";
        const choices = normalizeStagingChoices(row.choices);
        const correctAnswer = resolveStrictTransferCorrectAnswer(
          row.correct_answer,
          choices,
          row.id,
        );

        let insertedRows: Array<typeof marketingQuizQuestions.$inferSelect>;
        try {
          insertedRows = await tx
            .insert(marketingQuizQuestions)
            .values({
              marketingQuizId: quizId,
              sourceQuestionId: null,
              sourceBankQuestionId: null,
              sourceStagingQuestionId: row.id,
              question: row.question,
              choices,
              correctAnswer,
              explanation: row.explanation ?? null,
              difficulty: normalizedDifficulty,
              topic: row.topic ?? null,
              questionType: row.question_type || "multiple_choice",
              sortOrder: nextSort++,
            })
            .returning();
        } catch (err) {
          const pgErr = err as { code?: string; constraint?: string };
          if (pgErr?.code === "23505") {
            throw new DomainError(
              "conflict",
              "این سؤال قبلاً به آزمون منتقل شده است.",
              { questionId: row.id },
            );
          }
          throw err;
        }

        const inserted = insertedRows[0];
        await tx.execute(sql`
          UPDATE studio_exam_generated_questions
          SET review_status = 'transferred',
              is_accepted = true,
              transferred_question_id = ${inserted.id}::uuid,
              transferred_at = NOW()
          WHERE id = ${row.id}::uuid;
        `);

        createdQuestions.push({
          id: inserted.id,
          marketingQuizId: inserted.marketingQuizId,
          sourceQuestionId: inserted.sourceQuestionId,
          sourceBankQuestionId: inserted.sourceBankQuestionId,
          sourceStagingQuestionId: inserted.sourceStagingQuestionId ?? null,
          question: inserted.question,
          choices: inserted.choices,
          correctAnswer: inserted.correctAnswer,
          explanation: inserted.explanation,
          difficulty: inserted.difficulty as "easy" | "medium" | "hard",
          topic: inserted.topic,
          questionType: inserted.questionType,
          sortOrder: inserted.sortOrder,
          createdAt: inserted.createdAt,
          updatedAt: inserted.updatedAt,
        });
      }

      return {
        transferredCount: createdQuestions.length,
        alreadyTransferredIds,
        createdQuestions,
        existingTransferredQuestionIds,
      };
    });
  }
}

type StagingQuestionDbRow = {
  id: string;
  operation_id: string;
  task_id: string;
  batch_id: string;
  course_id: string;
  module_id: string;
  pattern_id: string | null;
  pattern_version: number | null;
  question_index: number;
  question: string;
  choices: Array<string | { id: string; text: string }>;
  correct_answer: unknown;
  explanation: string | null;
  difficulty: string;
  topic: string | null;
  question_type: string;
  metadata: Record<string, unknown>;
  is_accepted: boolean;
  review_status: string | null;
  transferred_question_id: string | null;
  transferred_at: Date | string | null;
  created_at: Date | string;
}

export interface InMemoryQuizStoreAdapter {
  getById(id: string): Promise<{ id: string; deletedAt?: Date | null } | null>;
  addQuestion(
    question: Omit<MarketingQuizQuestionSnapshot, "id" | "createdAt" | "updatedAt">,
  ): Promise<MarketingQuizQuestionSnapshot>;
  getQuestions(quizId: string): Promise<MarketingQuizQuestionSnapshot[]>;
  deleteQuestion(id: string): Promise<boolean>;
}

/**
 * In-memory implementation of StudioExamStore for isolated unit testing.
 */
export class InMemoryStudioExamStore implements StudioExamStore {
  public operations = new Map<string, CreatedOperationDetails["operation"] & { startedAt?: Date | string | null; completedAt?: Date | string | null }>();
  public tasks = new Map<string, OperationTaskDetail>();
  public batches = new Map<string, OperationBatchDetail>();
  public questions = new Map<string, StagingQuestionRecord>();
  private transferredStagingSourceIds = new Set<string>();
  private inFlightTransferLocks = new Set<string>();

  constructor(private quizStore?: InMemoryQuizStoreAdapter) {}

  setQuizStore(quizStore: InMemoryQuizStoreAdapter): void {
    this.quizStore = quizStore;
  }
  public lessonContents = new Map<string, ModuleLessonContent>();

  async createOperationWithTasksAndBatches(
    params: CreateOperationWithTasksAndBatchesParams,
  ): Promise<CreatedOperationDetails> {
    // Check active operation for quiz
    for (const op of this.operations.values()) {
      if (op.quizId === params.quizId && (op.status === "pending" || op.status === "processing")) {
        throw new DomainError("conflict", "یک عملیات فعال برای این آزمون در حال اجرا است.", {
          activeOperationId: op.id,
        });
      }
    }

    const opId = crypto.randomUUID();
    const now = new Date();

    const operation: CreatedOperationDetails["operation"] & { startedAt?: Date | string | null; completedAt?: Date | string | null } = {
      id: opId,
      quizId: params.quizId,
      organizationId: params.organizationId ?? null,
      createdBy: params.createdBy ?? null,
      totalRequestedQuestions: params.totalRequestedQuestions,
      totalGeneratedQuestions: 0,
      status: "pending",
      config: params.config,
      patternSnapshots: params.patternSnapshots,
      createdAt: now,
      updatedAt: now,
    };
    this.operations.set(opId, operation);

    const createdTasks: CreatedOperationDetails["tasks"] = [];
    const createdBatches: CreatedOperationDetails["batches"] = [];

    for (const t of params.tasks) {
      const taskId = crypto.randomUUID();
      const taskDetail: OperationTaskDetail = {
        id: taskId,
        operationId: opId,
        courseId: t.courseId,
        moduleId: t.moduleId,
        targetQuestionCount: t.targetQuestionCount,
        generatedQuestionCount: 0,
        status: "pending",
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.set(taskId, taskDetail);
      createdTasks.push({
        id: taskId,
        operationId: opId,
        courseId: t.courseId,
        moduleId: t.moduleId,
        targetQuestionCount: t.targetQuestionCount,
        generatedQuestionCount: 0,
        status: "pending",
        createdAt: now,
      });

      for (const b of t.batches) {
        const batchId = crypto.randomUUID();
        const batchDetail: OperationBatchDetail = {
          id: batchId,
          taskId: taskId,
          batchIndex: b.batchIndex,
          targetCount: b.targetCount,
          generatedCount: 0,
          status: "pending",
          patternAllocations: b.patternAllocations,
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        this.batches.set(batchId, batchDetail);
        createdBatches.push({
          id: batchId,
          taskId: taskId,
          batchIndex: b.batchIndex,
          targetCount: b.targetCount,
          generatedCount: 0,
          status: "pending",
          patternAllocations: b.patternAllocations,
          createdAt: now,
        });
      }
    }

    return {
      operation,
      tasks: createdTasks,
      batches: createdBatches,
    };
  }

  async getActiveOperationByQuizId(quizId: string): Promise<ActiveOperationSummary | null> {
    for (const op of this.operations.values()) {
      if (op.quizId === quizId && (op.status === "pending" || op.status === "processing")) {
        return {
          id: op.id,
          quizId: op.quizId,
          organizationId: op.organizationId,
          totalRequestedQuestions: op.totalRequestedQuestions,
          totalGeneratedQuestions: op.totalGeneratedQuestions,
          status: op.status,
          startedAt: op.startedAt,
          completedAt: op.completedAt,
          createdAt: op.createdAt,
          updatedAt: op.updatedAt,
        };
      }
    }
    return null;
  }

  async getOperationById(operationId: string): Promise<FullOperationDetails | null> {
    const op = this.operations.get(operationId);
    if (!op) return null;

    const opTasks = Array.from(this.tasks.values())
      .filter((t) => t.operationId === operationId)
      .map((t) => ({
        ...t,
        errorMessage: sanitizeErrorMessage(t.errorCode, t.errorMessage),
      }));

    const taskIds = new Set(opTasks.map((t) => t.id));
    const opBatches = Array.from(this.batches.values())
      .filter((b) => taskIds.has(b.taskId))
      .map((b) => ({
        ...b,
        errorMessage: sanitizeErrorMessage(b.errorCode, b.errorMessage),
      }));

    return {
      operation: {
        id: op.id,
        quizId: op.quizId,
        organizationId: op.organizationId,
        createdBy: op.createdBy,
        totalRequestedQuestions: op.totalRequestedQuestions,
        totalGeneratedQuestions: op.totalGeneratedQuestions,
        status: op.status,
        config: op.config,
        patternSnapshots: op.patternSnapshots,
        startedAt: op.startedAt,
        completedAt: op.completedAt,
        createdAt: op.createdAt,
        updatedAt: op.updatedAt,
      },
      tasks: opTasks,
      batches: opBatches,
    };
  }

  async getOperationProgress(operationId: string): Promise<OperationProgressSummary | null> {
    const op = this.operations.get(operationId);
    if (!op) return null;

    const opTasks = Array.from(this.tasks.values()).filter((t) => t.operationId === operationId);
    const tasks: TaskProgressSummary[] = opTasks.map((t) => {
      const physicalCount = Array.from(this.questions.values()).filter((q) => q.taskId === t.id).length;
      const gen = Math.max(t.generatedQuestionCount, physicalCount);
      return {
        taskId: t.id,
        moduleId: t.moduleId,
        courseId: t.courseId,
        targetCount: t.targetQuestionCount,
        generatedCount: gen,
        status: t.status,
      };
    });

    const taskSumGenerated = tasks.reduce((sum, t) => sum + t.generatedCount, 0);
    const totalGenerated = Math.max(op.totalGeneratedQuestions, taskSumGenerated);
    const progressPercentage =
      op.totalRequestedQuestions > 0
        ? Math.min(100, Math.round((totalGenerated / op.totalRequestedQuestions) * 100))
        : 0;

    return {
      operationId: op.id,
      quizId: op.quizId,
      organizationId: op.organizationId,
      status: op.status,
      totalRequestedQuestions: op.totalRequestedQuestions,
      totalGeneratedQuestions: totalGenerated,
      progressPercentage,
      updatedAt: op.updatedAt,
      tasks,
    };
  }

  async getGeneratedQuestions(
    params: GetGeneratedQuestionsParams,
  ): Promise<StagingQuestionRecord[]> {
    let list = Array.from(this.questions.values()).filter(
      (q) => q.operationId === params.operationId,
    );
    if (params.taskId) {
      list = list.filter((q) => q.taskId === params.taskId);
    }
    if (params.batchId) {
      list = list.filter((q) => q.batchId === params.batchId);
    }
    if (params.isAccepted !== undefined) {
      list = list.filter((q) => q.isAccepted === params.isAccepted);
    }
    if (params.reviewStatus !== undefined) {
      list = list.filter((q) => q.reviewStatus === params.reviewStatus);
    }

    if (params.offset) {
      list = list.slice(params.offset);
    }
    if (params.limit) {
      list = list.slice(0, params.limit);
    }
    return list;
  }

  async claimBatch(batchId: string, _leaseDurationSeconds = DEFAULT_LEASE_DURATION_SECONDS): Promise<ClaimBatchResult> {
    const batch = this.batches.get(batchId);
    if (!batch) return { claimed: false, reason: "not_found" };
    const task = this.tasks.get(batch.taskId);
    if (!task) return { claimed: false, reason: "not_found" };
    const op = this.operations.get(task.operationId);
    if (!op) return { claimed: false, reason: "not_found" };

    if (op.status === "cancelled") return { claimed: false, reason: "operation_cancelled" };
    if (batch.status === "completed") return { claimed: false, reason: "already_completed" };
    if (batch.status === "cancelled") return { claimed: false, reason: "batch_cancelled" };

    batch.retryCount += 1;
    batch.status = "processing";
    batch.startedAt = batch.startedAt ?? new Date();
    batch.updatedAt = new Date();
    return { claimed: true, fencingToken: batch.retryCount };
  }

  async heartbeatBatch(batchId: string, fencingToken: number): Promise<boolean> {
    const batch = this.batches.get(batchId);
    if (!batch || batch.retryCount !== fencingToken || batch.status !== "processing") return false;
    batch.updatedAt = new Date();
    return true;
  }

  async releaseLeaseOnTransientError(batchId: string, fencingToken: number, errorCode: string, errorMessage: string): Promise<boolean> {
    const batch = this.batches.get(batchId);
    if (!batch || batch.retryCount !== fencingToken || batch.status !== "processing") return false;
    batch.status = "failed";
    batch.errorCode = errorCode;
    batch.errorMessage = errorMessage;
    batch.updatedAt = new Date();
    return true;
  }

  async getBatchExecutionDetails(batchId: string): Promise<BatchExecutionDetails | null> {
    const batch = this.batches.get(batchId);
    if (!batch) return null;
    const task = this.tasks.get(batch.taskId);
    if (!task) return null;
    const op = this.operations.get(task.operationId);
    if (!op) return null;

    const existingQuestions = Array.from(this.questions.values())
      .filter((q) => q.batchId === batchId)
      .map((q) => ({
        id: q.id,
        questionIndex: q.questionIndex,
        patternId: q.patternId,
        patternVersion: q.patternVersion,
        question: q.question,
      }));

    return {
      batch: {
        id: batch.id,
        taskId: batch.taskId,
        batchIndex: batch.batchIndex,
        targetCount: batch.targetCount,
        generatedCount: batch.generatedCount,
        status: batch.status,
        patternAllocations: batch.patternAllocations,
        retryCount: batch.retryCount,
      },
      task: {
        id: task.id,
        operationId: task.operationId,
        courseId: task.courseId,
        moduleId: task.moduleId,
        targetQuestionCount: task.targetQuestionCount,
        generatedQuestionCount: task.generatedQuestionCount,
        status: task.status,
      },
      operation: {
        id: op.id,
        quizId: op.quizId,
        organizationId: op.organizationId,
        totalRequestedQuestions: op.totalRequestedQuestions,
        totalGeneratedQuestions: op.totalGeneratedQuestions,
        status: op.status,
        config: op.config,
        patternSnapshots: op.patternSnapshots,
      },
      existingQuestions,
    };
  }

  async getModuleLessonContent(moduleId: string): Promise<ModuleLessonContent> {
    const content = this.lessonContents.get(moduleId);
    if (content) return content;
    return {
      lessons: [],
      combinedMarkdown: "",
      totalLength: 0,
    };
  }

  async saveBatchQuestionsAndFinalize(params: {
    batchId: string;
    fencingToken: number;
    questions: SaveQuestionInput[];
  }): Promise<{ generatedCount: number; isCompleted: boolean }> {
    const batch = this.batches.get(params.batchId);
    if (!batch || batch.retryCount !== params.fencingToken || batch.status !== "processing") {
      throw new FencingTokenStaleError();
    }
    const task = this.tasks.get(batch.taskId);
    if (!task) throw new Error("Task not found");
    const op = this.operations.get(task.operationId);
    if (!op) throw new Error("Operation not found");
    if (op.status === "cancelled") {
      throw new WorkerStopError("operation_cancelled", "Operation was cancelled");
    }

    for (const q of params.questions) {
      const alreadyExists = Array.from(this.questions.values()).some(
        (existing) => existing.batchId === batch.id && existing.questionIndex === q.questionIndex,
      );
      if (alreadyExists) {
        continue;
      }

      const qId = crypto.randomUUID();
      const choices = normalizeStagingChoices(q.choices);
      const correctAnswer = normalizeStagingCorrectAnswer(q.correctAnswer, choices);
      const questionRecord: StagingQuestionRecord = {
        id: qId,
        operationId: op.id,
        taskId: task.id,
        batchId: batch.id,
        courseId: task.courseId,
        moduleId: task.moduleId,
        patternId: q.patternId ?? null,
        patternVersion: q.patternVersion ?? null,
        questionIndex: q.questionIndex,
        question: q.question,
        choices,
        correctAnswer,
        explanation: q.explanation ?? null,
        difficulty: q.difficulty ?? "medium",
        topic: q.topic ?? null,
        questionType: q.questionType ?? "multiple_choice",
        metadata: q.metadata ?? {},
        isAccepted: false,
        reviewStatus: "pending_review",
        transferredQuestionId: null,
        transferredAt: null,
        createdAt: new Date(),
      };
      this.questions.set(qId, questionRecord);
    }

    const actualCount = Array.from(this.questions.values()).filter(
      (q) => q.batchId === batch.id,
    ).length;
    const isCompleted = actualCount >= batch.targetCount;

    batch.generatedCount = actualCount;
    if (isCompleted) {
      batch.status = "completed";
      batch.completedAt = new Date();
    }
    batch.updatedAt = new Date();

    await this.reconcileTaskAndOperation(task.id, op.id);

    return { generatedCount: actualCount, isCompleted };
  }

  async markBatchFailed(params: {
    batchId: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<boolean> {
    const batch = this.batches.get(params.batchId);
    if (!batch || batch.retryCount !== params.fencingToken) return false;
    batch.status = "failed";
    batch.errorCode = params.errorCode;
    batch.errorMessage = params.errorMessage;
    batch.updatedAt = new Date();
    return true;
  }

  async reconcileTaskAndOperation(taskId: string, operationId: string): Promise<{
    taskStatus: StudioExamTaskStatus;
    taskGeneratedCount: number;
    operationStatus: string;
    operationGeneratedCount: number;
  }> {
    const task = this.tasks.get(taskId);
    if (!task) throw new DomainError("not_found", "Task not found");
    const op = this.operations.get(operationId);
    if (!op) throw new DomainError("not_found", "Operation not found");

    const taskBatches = Array.from(this.batches.values()).filter((b) => b.taskId === taskId);
    const batchStatuses = taskBatches.map((b) => b.status);
    const taskGeneratedCount = taskBatches.reduce((sum, b) => sum + b.generatedCount, 0);

    const hasInsufficientContent =
      task.errorCode === "insufficient_content" ||
      taskBatches.some((b) => b.errorCode === "insufficient_content");

    const newTaskStatus = deriveTaskStatus({
      batchStatuses,
      targetCount: task.targetQuestionCount,
      generatedCount: taskGeneratedCount,
      insufficientContent: hasInsufficientContent,
    });

    task.status = newTaskStatus;
    task.generatedQuestionCount = taskGeneratedCount;
    task.updatedAt = new Date();

    const allTasks = Array.from(this.tasks.values()).filter((t) => t.operationId === operationId);
    const allTaskStatuses = allTasks.map((t) => t.status);
    const opGeneratedCount = allTasks.reduce((sum, t) => sum + t.generatedQuestionCount, 0);
    const derivedOpStatus = deriveOperationStatus(allTaskStatuses);

    const newOpStatus =
      op.status === "cancelled" && opGeneratedCount === 0
        ? "cancelled"
        : op.status === "cancelled"
          ? "partial"
          : derivedOpStatus;

    op.status = newOpStatus;
    op.totalGeneratedQuestions = opGeneratedCount;
    op.updatedAt = new Date();

    return {
      taskStatus: newTaskStatus,
      taskGeneratedCount,
      operationStatus: newOpStatus,
      operationGeneratedCount: opGeneratedCount,
    };
  }

  async cancelOperation(
    operationId: string,
    reason?: string,
  ): Promise<{ cancelled: boolean; reason?: string }> {
    const op = this.operations.get(operationId);
    if (!op) throw new DomainError("not_found", "Operation not found");
    if (op.status === "completed") return { cancelled: false, reason: "already_completed" };
    if (op.status === "failed") return { cancelled: false, reason: "already_failed" };
    if (op.status === "cancelled") return { cancelled: true, reason: "already_cancelled" };

    const opTasks = Array.from(this.tasks.values()).filter((t) => t.operationId === operationId);
    const taskIds = new Set(opTasks.map((t) => t.id));
    const opBatches = Array.from(this.batches.values()).filter((b) => taskIds.has(b.taskId));

    if (
      op.status === "partial" &&
      !opBatches.some((b) => b.status === "pending" || b.status === "processing")
    ) {
      return { cancelled: false, reason: "already_finalized" };
    }

    for (const b of opBatches) {
      if (b.status === "pending" || b.status === "processing") {
        b.status = "cancelled";
        b.errorCode = "operation_cancelled";
        b.errorMessage = reason ?? "عملیات توسط کاربر لغو شد.";
        b.updatedAt = new Date();
      }
    }

    for (const t of opTasks) {
      if (t.status === "pending" || t.status === "processing") {
        t.status = "cancelled";
        t.errorCode = "operation_cancelled";
        t.errorMessage = reason ?? "عملیات توسط کاربر لغو شد.";
        t.updatedAt = new Date();
      }
    }

    const totalGenerated = opTasks.reduce((sum, t) => sum + t.generatedQuestionCount, 0);
    const derivedStatus = deriveOperationStatus(opTasks.map((t) => t.status));
    const finalStatus = totalGenerated > 0 ? "partial" : derivedStatus;

    op.status = finalStatus;
    op.totalGeneratedQuestions = totalGenerated;
    op.completedAt = new Date();
    op.updatedAt = new Date();

    return { cancelled: true, reason: finalStatus };
  }

  async listOperationsByQuizId(
    params: ListOperationsByQuizIdParams,
  ): Promise<ListOperationsByQuizIdResult> {
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const offset = Math.max(0, params.offset ?? 0);

    let list = Array.from(this.operations.values()).filter(
      (op) => op.quizId === params.quizId,
    );
    if (params.organizationId) {
      list = list.filter((op) => op.organizationId === params.organizationId);
    }
    if (params.status) {
      list = list.filter((op) => op.status === params.status);
    }

    // Sort newest first (createdAt DESC)
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = list.length;
    const paged = list.slice(offset, offset + limit);

    const operations: ExamOperationHistoryItem[] = paged.map((op) => {
      const opQuestions = Array.from(this.questions.values()).filter(
        (q) => q.operationId === op.id,
      );
      const stats: StagingQuestionStats = {
        totalCount: opQuestions.length,
        pendingReviewCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        transferredCount: 0,
      };
      for (const q of opQuestions) {
        if (q.reviewStatus === "transferred" || q.transferredQuestionId) {
          stats.transferredCount += 1;
        } else if (q.reviewStatus === "accepted") {
          stats.acceptedCount += 1;
        } else if (q.reviewStatus === "rejected") {
          stats.rejectedCount += 1;
        } else {
          stats.pendingReviewCount += 1;
        }
      }

      const generated = Math.max(op.totalGeneratedQuestions, stats.totalCount);
      const progressPercentage =
        op.totalRequestedQuestions > 0
          ? Math.min(100, Math.round((generated / op.totalRequestedQuestions) * 100))
          : 0;

      return {
        id: op.id,
        quizId: op.quizId,
        organizationId: op.organizationId,
        status: op.status,
        totalRequestedQuestions: op.totalRequestedQuestions,
        totalGeneratedQuestions: generated,
        progressPercentage,
        stagingStats: stats,
        startedAt: op.startedAt ?? null,
        completedAt: op.completedAt ?? null,
        createdAt: op.createdAt,
        updatedAt: op.updatedAt,
      };
    });

    return { operations, total, limit, offset };
  }

  async handleBatchFinalFailureAndReconcile(params: {
    batchId: string;
    fencingToken: number;
    errorCode: string;
    errorMessage: string;
    taskId: string;
    operationId: string;
  }): Promise<void> {
    await this.markBatchFailed(params);
    await this.reconcileTaskAndOperation(params.taskId, params.operationId);
  }

  async reconcileStaleBatches(
    options?: ReconcileStaleBatchesOptions,
  ): Promise<ReconcileStaleBatchesResult> {
    const recoveredBatchIds: string[] = [];
    const reenqueuedBatchIds: string[] = [];
    const now = Date.now();
    const staleThresholdMs =
      ((options?.leaseDurationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS) +
        (options?.gracePeriodSeconds ?? 180)) *
      1000;
    const pendingGraceMs = (options?.pendingGraceSeconds ?? 60) * 1000;

    for (const [batchId, b] of this.batches.entries()) {
      if (b.status === "processing") {
        const updatedAt = new Date(b.updatedAt).getTime();
        if (now - updatedAt > staleThresholdMs) {
          b.status = "failed";
          b.errorCode = "stale_lease_expired";
          b.errorMessage = "Lease expired without heartbeat renewal (recovered by sweeper)";
          b.updatedAt = new Date(now);
          recoveredBatchIds.push(batchId);
        }
      } else if (b.status === "pending" && b.patternAllocations.length > 0 && options?.queue) {
        const createdAt = new Date(b.createdAt).getTime();
        if (now - createdAt >= pendingGraceMs) {
          const task = this.tasks.get(b.taskId);
          const op = task ? this.operations.get(task.operationId) : undefined;
          if (task && op && (op.status === "pending" || op.status === "processing")) {
            await options.queue.add(
              STUDIO_EXAM_BATCH_JOB_NAME,
              {
                operationId: task.operationId,
                taskId: b.taskId,
                batchId: b.id,
              },
              {
                jobId: `batch_${b.id}`,
              },
            );
            reenqueuedBatchIds.push(b.id);
          }
        }
      }
    }

    return {
      scannedCount: this.batches.size,
      recoveredBatchesCount: recoveredBatchIds.length,
      recoveredBatchIds,
      reenqueuedBatchesCount: reenqueuedBatchIds.length,
      reenqueuedBatchIds,
    };
  }

  async repairPendingOperationPatterns(
    operationId: string,
    patternSnapshots: StudioExamPatternSnapshot[],
  ): Promise<{ repairedBatchCount: number }> {
    const op = this.operations.get(operationId);
    if (!op || (op.status !== "pending" && op.status !== "processing") || patternSnapshots.length === 0) {
      return { repairedBatchCount: 0 };
    }
    if (op.patternSnapshots.length === 0) {
      op.patternSnapshots = patternSnapshots;
    }
    let repairedBatchCount = 0;
    let startIndex = 0;
    for (const b of this.batches.values()) {
      const task = this.tasks.get(b.taskId);
      if (!task || task.operationId !== operationId) continue;
      if (b.status === "pending" && b.generatedCount === 0 && b.patternAllocations.length === 0 && b.targetCount > 0) {
        b.patternAllocations = allocateQuestionPatterns({
          targetCount: b.targetCount,
          patternSnapshots: op.patternSnapshots,
          startIndex,
        });
        repairedBatchCount++;
      }
      startIndex += b.targetCount;
    }
    return { repairedBatchCount };
  }

  async reviewGeneratedQuestions(
    params: ReviewGeneratedQuestionsParams,
  ): Promise<ReviewGeneratedQuestionsResult> {
    const op = this.operations.get(params.operationId);
    if (!op) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", {
        operationId: params.operationId,
      });
    }

    const uniqueIds = Array.from(new Set(params.questionIds));
    if (uniqueIds.length === 0) {
      throw new DomainError("bad_request", "حداقل یک سؤال باید انتخاب شود.");
    }

    const targets: StagingQuestionRecord[] = [];
    for (const qId of uniqueIds) {
      const q = this.questions.get(qId);
      if (!q || q.operationId !== params.operationId) {
        throw new DomainError(
          "bad_request",
          "یک یا چند سؤال در این عملیات یافت نشد یا متعلق به عملیات دیگری است.",
        );
      }
      targets.push(q);
    }

    const skippedTransferredIds: string[] = [];
    let updatedCount = 0;
    const newIsAccepted = params.decision === "accepted";

    for (const q of targets) {
      if (q.reviewStatus === "transferred") {
        skippedTransferredIds.push(q.id);
        continue;
      }
      if (q.reviewStatus !== params.decision || q.isAccepted !== newIsAccepted) {
        q.reviewStatus = params.decision;
        q.isAccepted = newIsAccepted;
        updatedCount += 1;
      }
    }

    return {
      updatedCount,
      skippedTransferredIds,
      questions: targets.map((q) => ({ ...q })),
    };
  }

  async transferGeneratedQuestionsToQuiz(
    params: TransferGeneratedQuestionsParams,
  ): Promise<TransferGeneratedQuestionsResult> {
    const op = this.operations.get(params.operationId);
    if (!op) {
      throw new DomainError("not_found", "عملیات تولید هوشمند آزمون یافت نشد.", {
        operationId: params.operationId,
      });
    }

    const uniqueIds = Array.from(new Set(params.questionIds));
    if (uniqueIds.length === 0) {
      throw new DomainError("bad_request", "حداقل یک سؤال باید برای انتقال انتخاب شود.");
    }

    // Serialize concurrent in-memory transfers on the same operation
    while (this.inFlightTransferLocks.has(params.operationId)) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    this.inFlightTransferLocks.add(params.operationId);

    try {
      const quizId = op.quizId;
      if (this.quizStore) {
        const quiz = await this.quizStore.getById(quizId);
        if (!quiz || quiz.deletedAt) {
          throw new DomainError("not_found", "آزمون مقصد یافت نشد یا حذف شده است.", { quizId });
        }
      }

      const targets: StagingQuestionRecord[] = [];
      for (const qId of uniqueIds) {
        const q = this.questions.get(qId);
        if (!q || q.operationId !== params.operationId) {
          throw new DomainError(
            "bad_request",
            "یک یا چند سؤال در این عملیات یافت نشد یا متعلق به عملیات دیگری است.",
          );
        }
        targets.push(q);
      }

      const alreadyTransferredIds: string[] = [];
      const existingTransferredQuestionIds: string[] = [];
      const toTransfer: StagingQuestionRecord[] = [];

      for (const q of targets) {
        if (q.reviewStatus === "transferred" || q.transferredQuestionId) {
          alreadyTransferredIds.push(q.id);
          if (q.transferredQuestionId) {
            existingTransferredQuestionIds.push(q.transferredQuestionId);
          }
          continue;
        }
        if (q.reviewStatus !== "accepted") {
          throw new DomainError(
            "bad_request",
            "فقط سؤالات تأییدشده قابل انتقال به آزمون هستند.",
            { questionId: q.id, reviewStatus: q.reviewStatus },
          );
        }
        toTransfer.push(q);
      }

      if (toTransfer.length === 0) {
        return {
          transferredCount: 0,
          alreadyTransferredIds,
          createdQuestions: [],
          existingTransferredQuestionIds,
        };
      }

      const existingQuizQuestions = this.quizStore
        ? await this.quizStore.getQuestions(quizId)
        : [];
      let nextSort = existingQuizQuestions.reduce(
        (max, q) => Math.max(max, q.sortOrder),
        -1,
      ) + 1;

      const createdQuestions: MarketingQuizQuestionSnapshot[] = [];
      const rollbackSnapshots: Array<{
        stagingId: string;
        prevStatus: StagingQuestionReviewStatus;
        prevAccepted: boolean;
        prevTransferredId: string | null | undefined;
        prevTransferredAt: Date | string | null | undefined;
        createdQuizQuestionId: string;
      }> = [];

      try {
        for (const q of toTransfer) {
          if (this.transferredStagingSourceIds.has(q.id)) {
            throw new DomainError("conflict", "این سؤال قبلاً به آزمون منتقل شده است.", {
              questionId: q.id,
            });
          }

          const normalizedDifficulty: "easy" | "medium" | "hard" =
            q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium";
          const choices = normalizeStagingChoices(q.choices);
          const correctAnswer = resolveStrictTransferCorrectAnswer(
            q.correctAnswer,
            choices,
            q.id,
          );

          let created: MarketingQuizQuestionSnapshot;
          if (this.quizStore) {
            created = await this.quizStore.addQuestion({
              marketingQuizId: quizId,
              sourceQuestionId: null,
              sourceBankQuestionId: null,
              sourceStagingQuestionId: q.id,
              question: q.question,
              choices,
              correctAnswer,
              explanation: q.explanation ?? null,
              difficulty: normalizedDifficulty,
              topic: q.topic ?? null,
              questionType: q.questionType || "multiple_choice",
              sortOrder: nextSort++,
            });
          } else {
            const now = new Date();
            created = {
              id: crypto.randomUUID(),
              marketingQuizId: quizId,
              sourceQuestionId: null,
              sourceBankQuestionId: null,
              sourceStagingQuestionId: q.id,
              question: q.question,
              choices,
              correctAnswer,
              explanation: q.explanation ?? null,
              difficulty: normalizedDifficulty,
              topic: q.topic ?? null,
              questionType: q.questionType || "multiple_choice",
              sortOrder: nextSort++,
              createdAt: now,
              updatedAt: now,
            };
          }

          rollbackSnapshots.push({
            stagingId: q.id,
            prevStatus: q.reviewStatus,
            prevAccepted: q.isAccepted,
            prevTransferredId: q.transferredQuestionId,
            prevTransferredAt: q.transferredAt,
            createdQuizQuestionId: created.id,
          });

          this.transferredStagingSourceIds.add(q.id);
          q.reviewStatus = "transferred";
          q.isAccepted = true;
          q.transferredQuestionId = created.id;
          q.transferredAt = new Date();
          createdQuestions.push(created);
        }
      } catch (err) {
        // Atomic rollback in memory on mid-batch failure
        for (const snap of rollbackSnapshots.reverse()) {
          this.transferredStagingSourceIds.delete(snap.stagingId);
          const stagingQ = this.questions.get(snap.stagingId);
          if (stagingQ) {
            stagingQ.reviewStatus = snap.prevStatus;
            stagingQ.isAccepted = snap.prevAccepted;
            stagingQ.transferredQuestionId = snap.prevTransferredId ?? null;
            stagingQ.transferredAt = snap.prevTransferredAt ?? null;
          }
          if (this.quizStore) {
            await this.quizStore.deleteQuestion(snap.createdQuizQuestionId);
          }
        }
        throw err;
      }

      return {
        transferredCount: createdQuestions.length,
        alreadyTransferredIds,
        createdQuestions,
        existingTransferredQuestionIds,
      };
    } finally {
      this.inFlightTransferLocks.delete(params.operationId);
    }
  }
}
