/**
 * Studio Exam Generation — Domain Models and Core Foundation Logic.
 *
 * Provides framework-independent types, balanced question distribution,
 * batch splitting, deterministic pattern allocation, and status derivation
 * for multi-chapter exam generation in AVANA Exam Studio.
 */

import { DomainError } from "./errors.js";
import { toPersianDigits } from "./persian-numbers.js";
import type {
  StudioExamOperationId,
  StudioExamTaskId,
  StudioExamBatchId,
  StudioExamGeneratedQuestionId,
  CourseId,
  ModuleId,
  OrganizationId,
  UserId,
} from "./ids.js";

// ---------------------------------------------------------------------------
// Lifecycle Statuses
// ---------------------------------------------------------------------------

export type StudioExamOperationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type StudioExamTaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "insufficient_content"
  | "cancelled";

export type StudioExamBatchStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export const MAX_TOTAL_QUESTIONS = 100;
export const MIN_TOTAL_QUESTIONS = 1;
export const MAX_BATCH_SIZE = 10;
export const MIN_BATCH_SIZE = 1;

// ---------------------------------------------------------------------------
// Quota & Batching Types
// ---------------------------------------------------------------------------

export interface ChapterQuotaAllocation {
  moduleId: string;
  quota: number;
}

export interface StudioExamPatternSnapshot {
  patternId: string;
  patternVersion: number;
  title: string;
  category?: string | null;
  cognitiveLevel?: string | null;
  skills: string[];
  systemInstructions: string;
  examples: Array<{
    question: string;
    choices: string[];
    correctAnswer: unknown;
    explanation?: string | null;
    clinicalContext?: string | null;
  }>;
}

export interface QuestionPatternAssignment {
  questionIndex: number; // 1-based position within the batch (1..10)
  patternId: string;
  patternVersion: number;
}

export interface StudioExamOperationConfig {
  difficulty?: "easy" | "medium" | "hard";
  instructions?: string;
  allChapterAllocations?: ChapterQuotaAllocation[];
  sampleQuestions?: Array<{ question: string; choices?: string[]; explanation?: string }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Domain Records
// ---------------------------------------------------------------------------

export interface StudioExamOperationRecord {
  id: StudioExamOperationId;
  quizId: string;
  organizationId?: OrganizationId | null;
  createdBy?: UserId | null;
  totalRequestedQuestions: number;
  totalGeneratedQuestions: number;
  status: StudioExamOperationStatus;
  config: StudioExamOperationConfig;
  patternSnapshots: StudioExamPatternSnapshot[];
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioExamTaskRecord {
  id: StudioExamTaskId;
  operationId: StudioExamOperationId;
  courseId: CourseId;
  moduleId: ModuleId;
  targetQuestionCount: number;
  generatedQuestionCount: number;
  status: StudioExamTaskStatus;
  retryCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioExamBatchRecord {
  id: StudioExamBatchId;
  taskId: StudioExamTaskId;
  batchIndex: number;
  targetCount: number;
  generatedCount: number;
  status: StudioExamBatchStatus;
  patternAllocations: QuestionPatternAssignment[];
  retryCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudioExamGeneratedQuestionChoice {
  id: string;
  text: string;
}

export interface StudioExamGeneratedQuestionRecord {
  id: StudioExamGeneratedQuestionId;
  operationId: StudioExamOperationId;
  taskId: StudioExamTaskId;
  batchId: StudioExamBatchId;
  courseId: CourseId;
  moduleId: ModuleId;
  patternId?: string | null;
  patternVersion?: number | null;
  questionIndex: number; // 1-based position within batch (1..10)
  question: string;
  choices: StudioExamGeneratedQuestionChoice[];
  correctAnswer: { choiceId: string } | string;
  explanation?: string | null;
  difficulty: "easy" | "medium" | "hard";
  topic?: string | null;
  questionType: string;
  metadata?: Record<string, unknown>;
  isAccepted: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Balanced Distribution Algorithm
// ---------------------------------------------------------------------------

/**
 * Distributes a requested total question count evenly across a given list of chapters (modules).
 *
 * Rules:
 * 1. 1 <= totalQuestions <= 100.
 * 2. moduleIds must contain at least 1 non-empty, unique chapter ID.
 * 3. Base quota = floor(totalQuestions / chapterCount).
 * 4. Remainder = totalQuestions % chapterCount is distributed 1-by-1 to the first R chapters.
 * 5. Sum of all quotas strictly equals totalQuestions.
 *
 * @throws DomainError if inputs are invalid or outside allowable bounds.
 */
export function distributeQuestionQuotas(
  totalQuestions: number,
  moduleIds: readonly string[],
): ChapterQuotaAllocation[] {
  if (
    typeof totalQuestions !== "number" ||
    !Number.isInteger(totalQuestions) ||
    Number.isNaN(totalQuestions)
  ) {
    throw new DomainError(
      "bad_request",
      "تعداد کل سؤالات باید یک عدد صحیح معتبر باشد.",
      { totalQuestions },
    );
  }

  if (totalQuestions < MIN_TOTAL_QUESTIONS) {
    throw new DomainError(
      "bad_request",
      `تعداد کل سؤالات نمی‌تواند کمتر از ${toPersianDigits(MIN_TOTAL_QUESTIONS)} باشد.`,
      { totalQuestions, min: MIN_TOTAL_QUESTIONS },
    );
  }

  if (totalQuestions > MAX_TOTAL_QUESTIONS) {
    throw new DomainError(
      "bad_request",
      `تعداد کل سؤالات نمی‌تواند بیشتر از ${toPersianDigits(MAX_TOTAL_QUESTIONS)} باشد.`,
      { totalQuestions, max: MAX_TOTAL_QUESTIONS },
    );
  }

  if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
    throw new DomainError(
      "bad_request",
      "حداقل باید یک فصل برای تولید سؤال انتخاب شود.",
    );
  }

  // Validate non-empty strings and uniqueness
  const seen = new Set<string>();
  for (let i = 0; i < moduleIds.length; i++) {
    const id = moduleIds[i];
    if (typeof id !== "string" || !id.trim()) {
      throw new DomainError(
        "bad_request",
        `شناسه فصل در ردیف ${toPersianDigits(i + 1)} نامعتبر است.`,
        { index: i },
      );
    }
    const trimmed = id.trim();
    if (seen.has(trimmed)) {
      throw new DomainError(
        "bad_request",
        `شناسه فصل تکراری در درخواست وجود دارد: ${trimmed}`,
        { duplicateModuleId: trimmed },
      );
    }
    seen.add(trimmed);
  }

  const chapterCount = moduleIds.length;
  const baseQuota = Math.floor(totalQuestions / chapterCount);
  const remainder = totalQuestions % chapterCount;

  const allocations: ChapterQuotaAllocation[] = [];
  let sum = 0;

  for (let i = 0; i < chapterCount; i++) {
    const quota = baseQuota + (i < remainder ? 1 : 0);
    allocations.push({
      moduleId: moduleIds[i].trim(),
      quota,
    });
    sum += quota;
  }

  if (sum !== totalQuestions) {
    throw new DomainError(
      "internal_error",
      "خطای محاسباتی در الگوریتم توزیع سهمیه سؤالات.",
      { sum, totalQuestions },
    );
  }

  return allocations;
}

/**
 * Filters chapter allocations to only those with a positive quota (> 0).
 * Chapters with 0 quota are excluded from task scheduling in the database,
 * while their metadata is retained in the Operation config.
 */
export function filterExecutableTasks(
  allocations: readonly ChapterQuotaAllocation[],
): ChapterQuotaAllocation[] {
  if (!Array.isArray(allocations)) return [];
  return allocations.filter((a) => a.quota > 0);
}

/**
 * Splits a chapter's target quota into sub-batches of at most maxBatchSize (default 10).
 *
 * Example: 25 questions -> [10, 10, 5]
 * Example: 34 questions -> [10, 10, 10, 4]
 * Example: 10 questions -> [10]
 * Example: 0 questions  -> []
 */
export function splitQuotaIntoBatches(
  targetCount: number,
  maxBatchSize: number = MAX_BATCH_SIZE,
): number[] {
  if (
    typeof targetCount !== "number" ||
    !Number.isInteger(targetCount) ||
    Number.isNaN(targetCount)
  ) {
    throw new DomainError(
      "bad_request",
      "سهمیه سؤالات فصل باید یک عدد صحیح معتبر باشد.",
      { targetCount },
    );
  }

  if (targetCount < 0) {
    throw new DomainError(
      "bad_request",
      "سهمیه سؤالات فصل نمی‌تواند منفی باشد.",
      { targetCount },
    );
  }

  if (targetCount === 0) {
    return [];
  }

  if (
    typeof maxBatchSize !== "number" ||
    !Number.isInteger(maxBatchSize) ||
    maxBatchSize < MIN_BATCH_SIZE ||
    maxBatchSize > MAX_BATCH_SIZE
  ) {
    throw new DomainError(
      "bad_request",
      `حجم هر بسته (Batch) باید بین ${toPersianDigits(MIN_BATCH_SIZE)} تا ${toPersianDigits(MAX_BATCH_SIZE)} باشد.`,
      { maxBatchSize },
    );
  }

  const batches: number[] = [];
  let remaining = targetCount;

  while (remaining > 0) {
    const batch = Math.min(remaining, maxBatchSize);
    batches.push(batch);
    remaining -= batch;
  }

  return batches;
}

// ---------------------------------------------------------------------------
// Deterministic Pattern Allocation
// ---------------------------------------------------------------------------

/**
 * Deterministically assigns question patterns to each question slot (1..targetCount) in a batch.
 *
 * If snapshots are empty, returns empty pattern assignments.
 * Patterns are distributed round-robin across slots to guarantee balanced representation.
 */
export function allocateQuestionPatterns(params: {
  targetCount: number;
  patternSnapshots: readonly StudioExamPatternSnapshot[];
  startIndex?: number; // Optional global question offset for multi-batch continuity
}): QuestionPatternAssignment[] {
  const { targetCount, patternSnapshots, startIndex = 0 } = params;

  if (targetCount <= 0 || !Array.isArray(patternSnapshots) || patternSnapshots.length === 0) {
    return [];
  }

  const assignments: QuestionPatternAssignment[] = [];
  const patternCount = patternSnapshots.length;

  for (let slot = 1; slot <= targetCount; slot++) {
    const globalIndex = startIndex + (slot - 1);
    const chosenPattern = patternSnapshots[globalIndex % patternCount];
    assignments.push({
      questionIndex: slot,
      patternId: chosenPattern.patternId,
      patternVersion: chosenPattern.patternVersion,
    });
  }

  return assignments;
}

// ---------------------------------------------------------------------------
// Status Derivation Helpers
// ---------------------------------------------------------------------------

/**
 * Computes the aggregate operation status from the statuses of its individual chapter tasks.
 */
export function deriveOperationStatus(
  taskStatuses: readonly StudioExamTaskStatus[],
): StudioExamOperationStatus {
  if (!taskStatuses || taskStatuses.length === 0) {
    return "pending";
  }

  // If any task is currently running
  if (taskStatuses.some((s) => s === "processing")) {
    return "processing";
  }

  const isAllPending = taskStatuses.every((s) => s === "pending");
  if (isAllPending) {
    return "pending";
  }

  const hasAnyPending = taskStatuses.some((s) => s === "pending");

  const completedCount = taskStatuses.filter((s) => s === "completed").length;
  const partialCount = taskStatuses.filter((s) => s === "partial").length;
  const cancelledCount = taskStatuses.filter((s) => s === "cancelled").length;
  const failedCount = taskStatuses.filter(
    (s) => s === "failed" || s === "insufficient_content",
  ).length;

  // If all completed
  if (completedCount === taskStatuses.length) {
    return "completed";
  }

  // If all tasks cancelled without any successful outputs
  if (cancelledCount === taskStatuses.length) {
    return "cancelled";
  }

  // If all tasks failed / had insufficient content
  if (failedCount === taskStatuses.length) {
    return "failed";
  }

  // If some completed or partial, but still some pending
  if (hasAnyPending) {
    return "processing";
  }

  // If all finished and there is a mix of successes and failures/partials/cancelled
  if (completedCount > 0 || partialCount > 0) {
    return "partial";
  }

  if (cancelledCount > 0) {
    return "cancelled";
  }

  return "failed";
}

/**
 * Computes chapter task status based on batch statuses and generated counts.
 *
 * Rules:
 * 1. If targetCount is 0, task is considered completed.
 * 2. If insufficientContent is flagged, status is insufficient_content.
 * 3. If generatedCount >= targetCount, status is completed.
 * 4. If any batch is processing, status is processing.
 * 5. If all finished, returns completed, partial (if generated > 0), cancelled (if all cancelled & 0 generated), or failed.
 */
export function deriveTaskStatus(params: {
  batchStatuses: readonly StudioExamBatchStatus[];
  targetCount: number;
  generatedCount: number;
  insufficientContent?: boolean;
}): StudioExamTaskStatus {
  const { batchStatuses, targetCount, generatedCount, insufficientContent } =
    params;

  if (insufficientContent) {
    return "insufficient_content";
  }

  if (targetCount === 0) {
    return "completed";
  }

  if (generatedCount >= targetCount) {
    return "completed";
  }

  if (!batchStatuses || batchStatuses.length === 0) {
    return "pending";
  }

  if (batchStatuses.some((s) => s === "processing")) {
    return "processing";
  }

  const hasPending = batchStatuses.some((s) => s === "pending");
  if (hasPending) {
    return batchStatuses.every((s) => s === "pending")
      ? "pending"
      : "processing";
  }

  // All batches finished
  if (generatedCount >= targetCount) {
    return "completed";
  }

  if (generatedCount > 0) {
    return "partial";
  }

  const allCancelled = batchStatuses.every((s) => s === "cancelled");
  if (allCancelled) {
    return "cancelled";
  }

  const hasCancelled = batchStatuses.some((s) => s === "cancelled");
  if (hasCancelled) {
    return "cancelled";
  }

  return "failed";
}
