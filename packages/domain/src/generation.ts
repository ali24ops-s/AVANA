/**
 * Framework-independent generation domain primitives (PR6-4).
 *
 * Pure types and constants only — no infrastructure, network, or
 * observability concerns. These mirror the payload/status shapes stored in
 * `generated_contents` and are shared between the API and future workers.
 *
 * The user instruction is to keep the type union extensible. Flashcard/quiz/review_summary
 * are declared here so the schema and pipeline can adopt them cleanly.
 */

import { DomainError } from "./errors.js";
import type {
  CourseId,
  DocumentId,
  GenerationJobId,
  OrganizationId,
} from "./ids.js";

// ---------------------------------------------------------------------------
// Incremental / Resumable Generation Primitives
// ---------------------------------------------------------------------------

export const DEFAULT_GENERATION_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes default

export type GenerationChunkStage =
  | "planning"
  | "lesson"
  | "flashcard"
  | "quiz"
  | "review_summary";

export type GenerationChunkStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type GenerationChunkRecord = {
  id: string;
  organizationId: OrganizationId;
  documentId: DocumentId;
  courseId?: CourseId | null;
  generationJobId?: GenerationJobId | null;
  stage: GenerationChunkStage;
  chunkIndex: number;
  chunkKey: string;
  status: GenerationChunkStatus;
  payload?: unknown | null;
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;
  attempts: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  heartbeatAt?: string | null;
  leaseExpiresAt?: string | null;
  completedAt?: string | null;
  deletedAt?: string | null;
};

export type GenerationProgressStatus =
  | "idle"
  | "queued"
  | "planning"
  | "generating"
  | "reviewing"
  | "stopping"
  | "stopped"
  | "completed"
  | "failed"
  | "deleting"
  | "deleted";

export type GenerationPipelineStage =
  | "analysis"
  | "planning"
  | "quiz"
  | "flashcard"
  | "summary"
  | "lesson"
  | "review"
  | "publishing";

export const STAGE_LABELS_FA: Record<GenerationPipelineStage, string> = {
  analysis: "تحلیل فایل",
  planning: "برنامه‌ریزی محتوا",
  lesson: "تولید درسنامه",
  flashcard: "تولید فلش‌کارت",
  quiz: "تولید آزمون",
  summary: "تولید خلاصه",
  review: "بازبینی و اعتبارسنجی",
  publishing: "انتشار",
};

export type DocumentGenerationProgressRecord = {
  documentId: DocumentId;
  organizationId: OrganizationId;
  status: GenerationProgressStatus;
  stage: GenerationPipelineStage | null;
  progressCurrent: number;
  progressTotal: number;
  stageStartedAt: string | null;
  lastActivityAt: string | null;
  errorMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentGenerationProgressResource = {
  status: GenerationProgressStatus;
  stage: GenerationPipelineStage | null;
  stageLabel: string | null;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
  stageStartedAt: string | null;
  lastActivityAt: string | null;
  error: string | null;
};

export type GenerationProgress = {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  status: "queued" | "running" | "succeeded" | "failed" | "partial" | "stopping" | "stopped";
  currentStage?: GenerationChunkStage;
  currentChunkKey?: string;
};


/**
 * The kind of AI-generated artifact in the AVANA 5-stage pipeline.
 */
export type GeneratedContentType =
  | "lesson"
  | "flashcard"
  | "quiz"
  | "review_summary";

/**
 * AI artifact lifecycle (separate from the document processing lifecycle).
 *
 * A generated content row starts as a `draft` and is only surfaced to the
 * owner after review/acceptance.
 */
export type GeneratedContentStatus =
  "draft" | "accepted" | "rejected" | "edited" | "regenerating";

/**
 * Job lifecycle used by the generation worker queue (PR6-5).
 *
 * This is the persisted domain/application job lifecycle, kept intentionally
 * separate from both the generated-content lifecycle and the document
 * lifecycle. It is queue-agnostic: it does not mirror BullMQ state, so it
 * remains valid even if the queue implementation changes.
 */
export type GenerationJobStatus =
  | "queued"
  | "running"
  | "stopping"
  | "stopped"
  | "succeeded"
  | "failed"
  | "deleting"
  | "deleted";

/**
 * The set of job lifecycle states, in field/type form for validation.
 */
export const GENERATION_JOB_STATUSES: readonly GenerationJobStatus[] = [
  "queued",
  "running",
  "stopping",
  "stopped",
  "succeeded",
  "failed",
  "deleting",
  "deleted",
];

/**
 * Map of valid status transitions for a Generation Job.
 */
export const VALID_JOB_STATUS_TRANSITIONS: Record<
  GenerationJobStatus,
  readonly GenerationJobStatus[]
> = {
  // From queued: can start running, be requested to stop, or be deleted directly
  queued: ["queued", "running", "stopping", "stopped", "deleting", "deleted"],

  // From running: can succeed, fail, be requested to stop, or be requested to delete
  running: ["running", "succeeded", "failed", "stopping", "deleting"],

  // From stopping: can reach stopped at safe point, or transition to deleting if deleted while stopping
  stopping: ["stopping", "stopped", "deleting", "deleted", "failed"],

  // From stopped: is terminal for execution, but can be deleted
  stopped: ["stopped", "deleting", "deleted"],

  // From succeeded: terminal execution state, but job record can be deleted if cleaned up
  succeeded: ["succeeded", "deleting", "deleted"],

  // From failed: terminal execution state, but job record can be deleted
  failed: ["failed", "deleting", "deleted"],

  // From deleting: transitions to deleted when cleanup is complete
  deleting: ["deleting", "deleted"],

  // From deleted: terminal, idempotent
  deleted: ["deleted"],
};

/**
 * Validates whether transitioning from one job status to another is legal.
 */
export function isValidJobStatusTransition(
  from: GenerationJobStatus,
  to: GenerationJobStatus,
): boolean {
  const allowed = VALID_JOB_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Checks whether a job status represents an active lifecycle state (worker or queue is processing/cancelling).
 */
export function isJobActive(status: GenerationJobStatus): boolean {
  return (
    status === "queued" ||
    status === "running" ||
    status === "stopping" ||
    status === "deleting"
  );
}

/**
 * Checks whether a job status is terminal (cannot execute further).
 */
export function isJobTerminal(status: GenerationJobStatus): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "stopped" ||
    status === "deleted"
  );
}

/**
 * Checks whether a job status represents a cancellation or deletion in flight.
 */
export function isJobCancelledOrDeleting(status: GenerationJobStatus): boolean {
  return (
    status === "stopping" ||
    status === "stopped" ||
    status === "deleting" ||
    status === "deleted"
  );
}

/**
 * Whether a value is a valid generation job lifecycle status.
 */
export function isGenerationJobStatus(v: string): v is GenerationJobStatus {
  return (GENERATION_JOB_STATUSES as readonly string[]).includes(v);
}

/**
 * Model provider identifier.
 *
 * Extensible — future "openai" | "anthropic" | "azure" are added behind the
 * ModelGateway abstraction. PR6-4 only provides the "mock" provider.
 */
export type ModelProvider =
  | "mock"
  | "gemini"
  | "cloudflare"
  | "groq"
  | "gapgpt"
  | "arvancloud";

// ---------------------------------------------------------------------------
// Generated content payloads
// ---------------------------------------------------------------------------

/**
 * Minimal discriminated payload unions. Intentionally not over-designed —
 * lesson/flashcard/quiz schemas will evolve in later PRs.
 *
 * Every payload carries `citationChunkIds` which MUST map to document_chunks.
 * This is the enforcement point for the source-grounded principle.
 */
export type LessonSession = {
  title: string;
  contentMarkdown: string;
  citationChunkIds?: string[];
  estimatedMinutes?: number;
};

export type LessonPayload = {
  kind: "lesson";
  title: string;
  moduleTitle?: string;
  outline?: Array<{
    title: string;
    description?: string;
  }>;
  sessions?: LessonSession[];
  contentMarkdown: string;
  citationChunkIds: string[];
  coverageReport?: DocumentCoverageReport;
};

export type FlashcardPayload = {
  kind: "flashcard";
  question?: string;
  answer?: string;
  explanation?: string;
  cardType?: string;
  difficulty?: "easy" | "medium" | "hard";
  cards?: Array<{
    question: string;
    answer: string;
    explanation?: string;
    cardType?: string;
    difficulty?: "easy" | "medium" | "hard";
  }>;
  citationChunkIds: string[];
};

export type QuizQuestionCategory =
  | "recall"
  | "application"
  | "mechanism_discrimination"
  | "clinical_reasoning"
  | "adverse_effect_differential"
  | "contraindication_nuance"
  | "pharmacokinetic_comparison";

export type QuizQuestionDifficulty = "easy" | "medium" | "hard";

export type QuizPayload = {
  kind: "quiz";
  title: string;
  questions: Array<{
    sessionIndex?: number;
    question: string;
    questionType: "multiple_choice" | "true_false" | "fill_blank";
    difficulty?: QuizQuestionDifficulty;
    category?: QuizQuestionCategory | string;
    choices?: string[];
    correctAnswer: unknown;
    explanation?: string;
    distractorRationale?: Record<string, string> | Array<{ choice: string; reason: string }>;
    citationChunkIds?: string[];
  }>;
  citationChunkIds: string[];
};

export type ReviewSummaryComparison = {
  conceptA: string;
  conceptB: string;
  keyDifferences: string;
};

export type ReviewSummarySection = {
  title: string;
  keyPoints: string[];
  mechanisms?: string[];
  classifications?: string[];
  comparisons?: ReviewSummaryComparison[] | string[];
  memorizationPoints?: string[];
  examPoints?: string[];
  citationChunkIds?: string[];
  relatedSessionIds?: string[];
  relatedConceptIds?: string[];
};

export type ReviewSummaryPayload = {
  kind: "review_summary";
  title: string;
  estimatedReadingMinutes: number;
  overview: string;
  sections: ReviewSummarySection[];
  finalTakeaways: string[];
  citationChunkIds: string[];
  targetReadingMinutes?: number;
};

export type ConsolidatedReviewSection = {
  title: string;
  originalSectionTitles: string[];
  keyPoints: string[];
  mechanisms?: string[];
  classifications?: string[];
  comparisons?: (ReviewSummaryComparison | string)[];
  memorizationPoints?: string[];
  examPoints?: string[];
  citationChunkIds?: string[];
  relatedSessionIds?: string[];
  relatedConceptIds?: string[];
};

export type FlattenedReviewSummaryCategories = {
  keyPoints: string[];
  mechanisms: string[];
  classifications: string[];
  comparisons: (ReviewSummaryComparison | string)[];
  memorizationPoints: string[];
  examPoints: string[];
  citationChunkIds: string[];
};

export type GeneratedContentPayload =
  | LessonPayload
  | FlashcardPayload
  | QuizPayload
  | ReviewSummaryPayload;

// ---------------------------------------------------------------------------
// Runtime generation scope
// ---------------------------------------------------------------------------

/**
 * Generation types supported by the system.
 */
export const ALL_GENERATION_TYPES: readonly GeneratedContentType[] = [
  "lesson",
  "flashcard",
  "quiz",
  "review_summary",
];

/**
 * Generation types currently enabled for active generation workflows.
 */
export const ENABLED_GENERATION_TYPES: readonly GeneratedContentType[] = [
  "lesson",
  "flashcard",
  "quiz",
  "review_summary",
];

/**
 * Whether a content type is currently enabled for generation.
 */
export function isGenerationTypeEnabled(type: GeneratedContentType): boolean {
  return ENABLED_GENERATION_TYPES.includes(type);
}

// ---------------------------------------------------------------------------
// Coverage-Driven Generation & Educational Audit
// ---------------------------------------------------------------------------

export type CoverageConceptCategory =
  | "concept"
  | "mechanism"
  | "receptor"
  | "indication"
  | "adverse_effect"
  | "contraindication"
  | "interaction"
  | "pharmacokinetics"
  | "comparison"
  | "clinical_pearl"
  | "high_yield";

export type CoverageConcept = {
  id: string;
  name: string;
  category: CoverageConceptCategory;
  description: string;
  sourceChunkIds?: string[];
};

export type ContentPlan = {
  moduleTitle: string;
  sourceTopics: Array<{
    id: string;
    title: string;
    description: string;
    category?: string;
    relevantChunkIds: string[];
  }>;
  sessions: Array<{
    index: number;
    title: string;
    description: string;
    coreConcepts: CoverageConcept[];
    relevantChunkIds: string[];
    targetFlashcardCount: number;
    targetQuizCount: number;
  }>;
  highYieldFacts: Array<{
    id: string;
    fact: string;
    category: CoverageConceptCategory;
    sessionIndex: number;
  }>;
};

export type SessionCoverageAudit = {
  topicIndex: number;
  topicTitle: string;
  keyConcepts: CoverageConcept[];
  flashcardCount: number;
  quizQuestionCount: number;
  coveredByLesson: boolean;
  coveredByFlashcards: boolean;
  coveredByQuiz: boolean;
  uncoveredConcepts: CoverageConcept[];
  supplementalNeeded: boolean;
};

export type DocumentCoverageReport = {
  sourceTopicsIdentified: Array<{
    title: string;
    description: string;
    category?: string;
    relevantChunkIds?: string[];
  }>;
  topicsAssignedToSessions: Array<{
    sessionIndex: number;
    sessionTitle: string;
    assignedTopics: string[];
  }>;
  majorConceptsCovered: CoverageConcept[];
  uncoveredConcepts: CoverageConcept[];
  flashcardCoverage: {
    totalCards: number;
    coveragePct: number;
    cardsPerSession: Array<{ sessionTitle: string; cardCount: number }>;
  };
  quizCoverage: {
    totalQuestions: number;
    coveragePct: number;
    questionsPerSession: Array<{ sessionTitle: string; questionCount: number }>;
  };
  totalIdentifiedFacts: number;
  coveredByLessons: number;
  coveredByFlashcards: number;
  coveredByQuiz: number;
  lessonCoveragePct: number;
  flashcardCoveragePct: number;
  quizCoveragePct: number;
  sessionsAudit: SessionCoverageAudit[];
  supplementalPassTriggered: boolean;
};

// ---------------------------------------------------------------------------
// Stage 5: Review Summary Generation Input Contract (Stage 1 + 2 -> Stage 5)
// ---------------------------------------------------------------------------

export type ReviewSummarySourceTopic = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  chunkIds: string[];
};

export type ReviewSummarySession = {
  id: string;
  order: number;
  title: string;
  description?: string;
  relevantChunkIds: string[];
  coreConceptIds: string[];
};

export type ReviewSummaryCoreConcept = {
  id: string;
  title: string;
  description?: string;
  importance?: "high" | "medium" | "low" | string;
  category?: CoverageConceptCategory | string;
  relatedChunkIds: string[];
  relatedSessionIds?: string[];
};

export type ReviewSummaryHighYieldFact = {
  id: string;
  fact: string;
  importance?: "high" | "critical" | string;
  category?: CoverageConceptCategory | string;
  sourceChunkIds: string[];
  relatedConceptIds?: string[];
  sessionIndex?: number;
  sessionId?: string;
};

export interface ReviewSummaryLessonInput {
  sessionId: string;
  sessionOrder: number;
  title: string;
  contentMarkdown: string;
  citationChunkIds: string[];
}

export interface ReviewSummarySourceChunk {
  id: string;
  text: string;
  sourceType?: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface ReviewSummaryGenerationContext {
  targetMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  language: "fa";
  audience: "pharmacy_students";
  documentTitle?: string;
  wordsPerMinute?: number;
  targetWordBudget?: number;
  maxSections?: number;
}

export interface ReviewSummaryGenerationInput {
  documentId: string;
  generationId?: string;
  generationJobId?: string;
  planning: {
    sourceTopics: ReviewSummarySourceTopic[];
    sessions: ReviewSummarySession[];
    coreConcepts: ReviewSummaryCoreConcept[];
    highYieldFacts: ReviewSummaryHighYieldFact[];
  };
  lessons: ReviewSummaryLessonInput[];
  sourceChunks: ReviewSummarySourceChunk[];
  generationContext: ReviewSummaryGenerationContext;
}

/**
 * Validates ReviewSummaryGenerationInput before calling the model.
 * Enforces:
 * - STAGE5_MISSING_PLANNING if Stage 1 planning is absent
 * - STAGE5_MISSING_LESSONS if Stage 2 lessons are absent
 * - STAGE5_INVALID_SESSION_REFERENCE if a lesson references a nonexistent session
 * - STAGE5_INVALID_CHUNK_REFERENCE if chunks referenced do not exist in sourceChunks
 */
export function validateReviewSummaryInput(input: ReviewSummaryGenerationInput): void {
  if (!input.planning || !Array.isArray(input.planning.sessions) || input.planning.sessions.length === 0) {
    throw new DomainError(
      "bad_request",
      "STAGE5_MISSING_PLANNING: Stage 1 content planning must be completed before generating a review summary.",
    );
  }

  if (
    !Array.isArray(input.lessons) ||
    input.lessons.length === 0 ||
    input.lessons.every((l) => !l.contentMarkdown || l.contentMarkdown.trim().length === 0)
  ) {
    throw new DomainError(
      "bad_request",
      "STAGE5_MISSING_LESSONS: Stage 2 lessons must be generated before generating a review summary.",
    );
  }

  const validSessionIds = new Set<string>();
  const validSessionOrders = new Set<number>();
  for (const session of input.planning.sessions) {
    if (session.id) {
      validSessionIds.add(session.id);
      validSessionIds.add(session.id.toLowerCase());
    }
    if (typeof session.order === "number") {
      validSessionOrders.add(session.order);
      validSessionIds.add(`session-${session.order + 1}`);
      validSessionIds.add(`session-${session.order}`);
      validSessionIds.add(String(session.order));
      validSessionIds.add(String(session.order + 1));
    }
  }

  for (const lesson of input.lessons) {
    const matchesId =
      (lesson.sessionId && validSessionIds.has(lesson.sessionId)) ||
      (lesson.sessionId && validSessionIds.has(lesson.sessionId.toLowerCase()));
    const matchesOrder = typeof lesson.sessionOrder === "number" && validSessionOrders.has(lesson.sessionOrder);
    if (!matchesId && !matchesOrder) {
      throw new DomainError(
        "bad_request",
        `STAGE5_INVALID_SESSION_REFERENCE: Lesson "${lesson.title}" references session "${lesson.sessionId}" which is not found in Stage 1 planning.`,
      );
    }
  }

  const validChunkIds = new Set(input.sourceChunks.map((c) => c.id));
  const docDiagnostic = input.documentId ? ` for document "${input.documentId}"` : "";
  const genId = input.generationId || input.generationJobId;
  const genDiagnostic = genId ? `, generationId: "${genId}"` : "";

  for (const session of input.planning.sessions) {
    if (Array.isArray(session.relevantChunkIds)) {
      for (const chunkId of session.relevantChunkIds) {
        if (!validChunkIds.has(chunkId)) {
          throw new DomainError(
            "bad_request",
            `STAGE5_INVALID_CHUNK_REFERENCE: Session "${session.title}" (sessionId: "${session.id}"${docDiagnostic}${genDiagnostic}) references unknown chunk "${chunkId}".`,
          );
        }
      }
    }
  }

  for (const lesson of input.lessons) {
    if (Array.isArray(lesson.citationChunkIds)) {
      for (const chunkId of lesson.citationChunkIds) {
        if (!validChunkIds.has(chunkId)) {
          throw new DomainError(
            "bad_request",
            `STAGE5_INVALID_CHUNK_REFERENCE: Lesson "${lesson.title}" (sessionId: "${lesson.sessionId}"${docDiagnostic}${genDiagnostic}) cites unknown chunk "${chunkId}".`,
          );
        }
      }
    }
  }

  if (Array.isArray(input.planning.highYieldFacts)) {
    for (const fact of input.planning.highYieldFacts) {
      if (Array.isArray(fact.sourceChunkIds)) {
        for (const chunkId of fact.sourceChunkIds) {
          if (!validChunkIds.has(chunkId)) {
            throw new DomainError(
              "bad_request",
              `STAGE5_INVALID_CHUNK_REFERENCE: High-yield fact "${fact.id}" (${fact.sessionId ? `sessionId: "${fact.sessionId}", ` : ""}${docDiagnostic}${genDiagnostic}) references unknown chunk "${chunkId}".`,
            );
          }
        }
      }
    }
  }
}

/**
 * Validates that an object returned by the model is a structurally valid ReviewSummaryPayload.
 * Enforces:
 * - Must be an object
 * - Non-empty string title
 * - Non-empty string overview
 * - Array of at least 1 section
 * - Each section must have non-empty title and non-empty keyPoints
 *
 * Throws DomainError with STAGE5_INVALID_MODEL_JSON if invalid.
 * Never silently repairs or inserts placeholder educational content.
 */
export function validateReviewSummaryPayload(raw: unknown): ReviewSummaryPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DomainError(
      "unprocessable",
      "STAGE5_INVALID_MODEL_JSON: Review summary payload must be a JSON object.",
    );
  }

  const candidate = raw as Record<string, unknown>;

  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) {
    throw new DomainError(
      "unprocessable",
      "STAGE5_INVALID_MODEL_JSON: Review summary payload missing required non-empty 'title'.",
    );
  }

  if (typeof candidate.overview !== "string" || candidate.overview.trim().length === 0) {
    throw new DomainError(
      "unprocessable",
      "STAGE5_INVALID_MODEL_JSON: Review summary payload missing required non-empty 'overview'.",
    );
  }

  if (!Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    throw new DomainError(
      "unprocessable",
      "STAGE5_INVALID_MODEL_JSON: Review summary payload must contain at least one section.",
    );
  }

  for (let i = 0; i < candidate.sections.length; i++) {
    const sec = candidate.sections[i];
    if (!sec || typeof sec !== "object" || Array.isArray(sec)) {
      throw new DomainError(
        "unprocessable",
        `STAGE5_INVALID_MODEL_JSON: Review summary section at index ${i} is not an object.`,
      );
    }
    const secRecord = sec as Record<string, unknown>;
    if (typeof secRecord.title !== "string" || secRecord.title.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        `STAGE5_INVALID_MODEL_JSON: Review summary section at index ${i} missing required non-empty 'title'.`,
      );
    }
    if (
      !Array.isArray(secRecord.keyPoints) ||
      secRecord.keyPoints.length === 0 ||
      secRecord.keyPoints.every((kp: unknown) => typeof kp !== "string" || kp.trim().length === 0)
    ) {
      throw new DomainError(
        "unprocessable",
        `STAGE5_INVALID_MODEL_JSON: Review summary section "${secRecord.title}" missing required non-empty 'keyPoints'.`,
      );
    }
  }

  const finalTakeaways = Array.isArray(candidate.finalTakeaways)
    ? candidate.finalTakeaways.filter(
        (t): t is string => typeof t === "string" && t.trim().length > 0,
      )
    : [];

  return {
    kind: "review_summary",
    title: candidate.title.trim(),
    estimatedReadingMinutes:
      typeof candidate.estimatedReadingMinutes === "number" &&
      candidate.estimatedReadingMinutes > 0
        ? candidate.estimatedReadingMinutes
        : 10,
    overview: candidate.overview.trim(),
    sections: candidate.sections as ReviewSummarySection[],
    finalTakeaways,
    citationChunkIds: Array.isArray(candidate.citationChunkIds)
      ? (candidate.citationChunkIds as string[])
      : [],
  };
}

/**
 * Validates and grounds citations for a Stage 5 ReviewSummaryPayload.
 *
 * Invariants (I1):
 * 1. Every section in `payload.sections` must have a non-empty `citationChunkIds` array.
 * 2. Every chunk ID in each section's `citationChunkIds` must exist in `availableChunkIds`.
 * 3. Any unknown, invalid, or fake chunk ID (even in mixed lists like ["valid", "fake"])
 *    causes an immediate DomainError("unprocessable", "STAGE5_INVALID_SECTION_CITATION: ...").
 * 4. An empty section citation array causes an immediate DomainError("unprocessable", "STAGE5_INVALID_SECTION_CITATION: ...").
 * 5. If top-level `payload.citationChunkIds` is provided, every chunk ID in it must exist in `availableChunkIds`.
 *    Any unknown ID causes DomainError("unprocessable", "STAGE5_INVALID_CHUNK_REFERENCE: ...").
 * 6. Top-level `citationChunkIds` is established as the deduplicated union of all section citations
 *    (and any valid top-level citations), ensuring complete source grounding.
 * 7. Under NO circumstances does this function fall back to all document chunks (`availableChunkIds`).
 *    Missing or invalid citations strictly halt execution before persistence.
 * 8. Each section's individual `citationChunkIds` array is preserved on `section.citationChunkIds`,
 *    maintaining section-level citation traceability in the persisted payload.
 */
export function validateAndGroundReviewSummaryCitations(
  payload: ReviewSummaryPayload,
  availableChunkIds: string[],
): ReviewSummaryPayload {
  const validChunkSet = new Set(availableChunkIds);

  if (!Array.isArray(payload.sections) || payload.sections.length === 0) {
    throw new DomainError(
      "unprocessable",
      "STAGE5_INVALID_SECTION_CITATION: Review summary must contain at least one section with citations.",
    );
  }

  const validatedSections: ReviewSummarySection[] = [];
  const allSectionChunkIds = new Set<string>();

  for (let i = 0; i < payload.sections.length; i++) {
    const section = payload.sections[i];
    const rawCitations = section.citationChunkIds;

    if (!Array.isArray(rawCitations) || rawCitations.length === 0) {
      throw new DomainError(
        "unprocessable",
        `STAGE5_INVALID_SECTION_CITATION: Section "${section.title}" (index ${i}) must cite at least one source chunk.`,
      );
    }

    const sectionCitations: string[] = [];
    for (const chunkId of rawCitations) {
      if (typeof chunkId !== "string" || !validChunkSet.has(chunkId)) {
        throw new DomainError(
          "unprocessable",
          `STAGE5_INVALID_SECTION_CITATION: Section "${section.title}" cites unknown or invalid chunk ID "${chunkId}".`,
        );
      }
      sectionCitations.push(chunkId);
      allSectionChunkIds.add(chunkId);
    }

    validatedSections.push({
      ...section,
      citationChunkIds: sectionCitations,
    });
  }

  // Validate top-level citations if provided
  const topLevelCited = new Set<string>();
  if (Array.isArray(payload.citationChunkIds)) {
    for (const chunkId of payload.citationChunkIds) {
      if (typeof chunkId !== "string" || !validChunkSet.has(chunkId)) {
        throw new DomainError(
          "unprocessable",
          `STAGE5_INVALID_CHUNK_REFERENCE: Review summary cites unknown or invalid chunk ID "${chunkId}".`,
        );
      }
      topLevelCited.add(chunkId);
    }
  }

  // Deduplicated union of all section citations and top-level citations
  const unionCitations = Array.from(
    new Set([...allSectionChunkIds, ...topLevelCited]),
  );

  if (unionCitations.length === 0) {
    throw new DomainError(
      "unprocessable",
      "STAGE5_INVALID_SECTION_CITATION: Review summary has no valid source chunk citations.",
    );
  }

  return {
    ...payload,
    sections: validatedSections,
    citationChunkIds: unionCitations,
  };
}

// ---------------------------------------------------------------------------
// Review Summary Consolidation & Section Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes and cleans section titles by stripping artificial generator micro-numbering
 * (e.g., "بخش ۱: ", "فصل ۲ - ", "1. ", "جلسه ۳: ") while preserving scientific terminology.
 */
export function cleanReviewSectionTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== "string") return "";
  let title = rawTitle.trim();

  // Strip leading generator prefix markers: "بخش ۱: ", "فصل ۲ - ", "Section 1: ", "Part 2 - ", etc.
  title = title.replace(
    /^(?:بخش|فصل|جلسه|مبحث|قسمت|پارت|درس|Part|Section|Chapter|Topic|Session)\s*[\d\u06F0-\u06F9]+[\s:ـ\-\–\—\.]*/i,
    "",
  );

  // Strip leading raw numbers: "1. ", "۲- ", "3: ", "4) "
  title = title.replace(/^[\d\u06F0-\u06F9]+[\s:ـ\-\–\—\.\)]+/, "");

  // Strip trailing part/sub-section annotations: " (بخش ۱)", " (Part 2)"
  title = title.replace(
    /\s*\((?:بخش|قسمت|پارت|Part)\s*[\d\u06F0-\u06F9]+\)$/i,
    "",
  );

  title = title.trim();
  return title.length > 0 ? title : rawTitle.trim();
}

/**
 * Extracts a common root topic prefix before delimiters like ':', ' - ', ' – ', ' — ', ' | '
 * if it represents a substantive subject (at least 4 characters).
 * Note: Compound words with internal hyphens (e.g., "رنین-آنژیوتانسین", "قلبی-عروقی")
 * without surrounding whitespace are intentionally preserved and not split.
 */
function extractRootTopicPrefix(title: string): string | null {
  const cleaned = cleanReviewSectionTitle(title);
  // Match colon (with optional spaces) OR dash/vertical-bar WITH spaces (e.g., "مبحث - زیرمبحث")
  const delimiterMatch = cleaned.match(/^([^:\-\–\—\|•]{4,}?)(?:\s*:\s*|\s+[\-\–\—\|•]\s+)(.+)$/);
  if (delimiterMatch && delimiterMatch[1] && delimiterMatch[2]) {
    const root = delimiterMatch[1].trim();
    if (root.length >= 4) {
      return root;
    }
  }
  return null;
}

/**
 * Compares two comparison objects or strings for exact structural equality.
 */
function isExactComparisonDuplicate(
  a: ReviewSummaryComparison | string,
  b: ReviewSummaryComparison | string,
): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a.trim() === b.trim();
  }
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    return (
      a.conceptA.trim() === b.conceptA.trim() &&
      a.conceptB.trim() === b.conceptB.trim() &&
      a.keyDifferences.trim() === b.keyDifferences.trim()
    );
  }
  return false;
}

/**
 * Consolidates fragmented review summary sections into unified topic domains for the Review Sheet.
 *
 * Consolidation Rules (Conservative & Scientifically Safe):
 * 1. Explicit Session Association: Sections sharing a non-empty `relatedSessionIds` belong to the same curriculum module and merge.
 * 2. Shared Explicit Root Topic: Sections sharing a common root topic prefix before a delimiter (e.g. "مهارکننده‌های ACE: ...") merge.
 * 3. Exact Normalized Title: Sections with identical cleaned titles merge.
 * 4. Anti-Overmerging: Generic terms alone (e.g., "نکات تکمیلی", "عوارض", "مقایسه") without a shared session or root prefix DO NOT merge.
 * 5. Strict Preservation: All points, mechanisms, classifications, comparisons, memorization points, and exam points are strictly preserved in original logical order.
 * 6. Exact Deduplication Only: Only strictly identical strings are deduplicated.
 */
export function consolidateReviewSummarySections(
  sections: ReviewSummarySection[] | undefined | null,
): ConsolidatedReviewSection[] {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [];
  }

  const consolidated: ConsolidatedReviewSection[] = [];

  for (const rawSection of sections) {
    const cleanedTitle = cleanReviewSectionTitle(rawSection.title);
    const rootPrefix = extractRootTopicPrefix(rawSection.title);
    const currSessionIds = Array.isArray(rawSection.relatedSessionIds)
      ? rawSection.relatedSessionIds.filter(Boolean)
      : [];

    let matchedIndex = -1;

    // Check against the last active consolidated section (maintaining sequential continuity)
    if (consolidated.length > 0) {
      const last = consolidated[consolidated.length - 1];
      const lastSessionIds = Array.isArray(last.relatedSessionIds)
        ? last.relatedSessionIds.filter(Boolean)
        : [];

      // Signal 1: Shared Session ID (Strongest Signal)
      const hasSharedSession =
        currSessionIds.length > 0 &&
        lastSessionIds.length > 0 &&
        currSessionIds.some((sId) => lastSessionIds.includes(sId));

      // Signal 2: Shared Root Topic Prefix
      const lastRootPrefix = extractRootTopicPrefix(last.title) || extractRootTopicPrefix(last.originalSectionTitles[0] || "");
      const hasSharedRootPrefix =
        Boolean(rootPrefix && lastRootPrefix && rootPrefix.toLowerCase() === lastRootPrefix.toLowerCase());

      // Signal 3: Exact Normalized Title Match
      const hasExactTitleMatch =
        cleanedTitle.length > 0 &&
        cleanReviewSectionTitle(last.title).toLowerCase() === cleanedTitle.toLowerCase();

      if (hasSharedSession || hasSharedRootPrefix || hasExactTitleMatch) {
        matchedIndex = consolidated.length - 1;
      }
    }

    if (matchedIndex >= 0) {
      // Merge into existing consolidated group
      const target = consolidated[matchedIndex];

      // If merging by common root topic prefix, adopt the root prefix as the unified title
      if (rootPrefix && extractRootTopicPrefix(target.originalSectionTitles[0] || "") === rootPrefix) {
        target.title = rootPrefix;
      }

      target.originalSectionTitles.push(rawSection.title);

      // 1. Key Points (Strict exact deduplication only)
      if (Array.isArray(rawSection.keyPoints)) {
        for (const kp of rawSection.keyPoints) {
          if (typeof kp === "string" && kp.trim().length > 0) {
            if (!target.keyPoints.some((existing) => existing.trim() === kp.trim())) {
              target.keyPoints.push(kp);
            }
          }
        }
      }

      // 2. Mechanisms
      if (Array.isArray(rawSection.mechanisms)) {
        if (!target.mechanisms) target.mechanisms = [];
        for (const m of rawSection.mechanisms) {
          if (typeof m === "string" && m.trim().length > 0) {
            if (!target.mechanisms.some((existing) => existing.trim() === m.trim())) {
              target.mechanisms.push(m);
            }
          }
        }
      }

      // 3. Classifications
      if (Array.isArray(rawSection.classifications)) {
        if (!target.classifications) target.classifications = [];
        for (const c of rawSection.classifications) {
          if (typeof c === "string" && c.trim().length > 0) {
            if (!target.classifications.some((existing) => existing.trim() === c.trim())) {
              target.classifications.push(c);
            }
          }
        }
      }

      // 4. Comparisons
      if (Array.isArray(rawSection.comparisons)) {
        if (!target.comparisons) target.comparisons = [];
        for (const comp of rawSection.comparisons) {
          if (!target.comparisons.some((existing) => isExactComparisonDuplicate(existing, comp))) {
            target.comparisons.push(comp);
          }
        }
      }

      // 5. Memorization Points
      if (Array.isArray(rawSection.memorizationPoints)) {
        if (!target.memorizationPoints) target.memorizationPoints = [];
        for (const mem of rawSection.memorizationPoints) {
          if (typeof mem === "string" && mem.trim().length > 0) {
            if (!target.memorizationPoints.some((existing) => existing.trim() === mem.trim())) {
              target.memorizationPoints.push(mem);
            }
          }
        }
      }

      // 6. Exam Points
      if (Array.isArray(rawSection.examPoints)) {
        if (!target.examPoints) target.examPoints = [];
        for (const ex of rawSection.examPoints) {
          if (typeof ex === "string" && ex.trim().length > 0) {
            if (!target.examPoints.some((existing) => existing.trim() === ex.trim())) {
              target.examPoints.push(ex);
            }
          }
        }
      }

      // 7. Citations, Sessions & Concepts
      if (Array.isArray(rawSection.citationChunkIds)) {
        if (!target.citationChunkIds) target.citationChunkIds = [];
        for (const id of rawSection.citationChunkIds) {
          if (!target.citationChunkIds.includes(id)) {
            target.citationChunkIds.push(id);
          }
        }
      }

      if (Array.isArray(rawSection.relatedSessionIds)) {
        if (!target.relatedSessionIds) target.relatedSessionIds = [];
        for (const id of rawSection.relatedSessionIds) {
          if (!target.relatedSessionIds.includes(id)) {
            target.relatedSessionIds.push(id);
          }
        }
      }

      if (Array.isArray(rawSection.relatedConceptIds)) {
        if (!target.relatedConceptIds) target.relatedConceptIds = [];
        for (const id of rawSection.relatedConceptIds) {
          if (!target.relatedConceptIds.includes(id)) {
            target.relatedConceptIds.push(id);
          }
        }
      }
    } else {
      // Start a new consolidated topic group
      const newGroup: ConsolidatedReviewSection = {
        title: cleanedTitle || rawSection.title,
        originalSectionTitles: [rawSection.title],
        keyPoints: Array.isArray(rawSection.keyPoints) ? [...rawSection.keyPoints] : [],
        mechanisms: Array.isArray(rawSection.mechanisms) ? [...rawSection.mechanisms] : undefined,
        classifications: Array.isArray(rawSection.classifications) ? [...rawSection.classifications] : undefined,
        comparisons: Array.isArray(rawSection.comparisons) ? [...rawSection.comparisons] : undefined,
        memorizationPoints: Array.isArray(rawSection.memorizationPoints) ? [...rawSection.memorizationPoints] : undefined,
        examPoints: Array.isArray(rawSection.examPoints) ? [...rawSection.examPoints] : undefined,
        citationChunkIds: Array.isArray(rawSection.citationChunkIds) ? [...rawSection.citationChunkIds] : undefined,
        relatedSessionIds: Array.isArray(rawSection.relatedSessionIds) ? [...rawSection.relatedSessionIds] : undefined,
        relatedConceptIds: Array.isArray(rawSection.relatedConceptIds) ? [...rawSection.relatedConceptIds] : undefined,
      };

      // If this section has a root topic prefix, use it if appropriate
      if (rootPrefix) {
        newGroup.title = rootPrefix;
      }

      consolidated.push(newGroup);
    }
  }

  return consolidated;
}

/**
 * Flattens all review summary sections into unified document-level Category collections.
 *
 * Presentation Design:
 * - The Review Summary is rendered as a single unified Review Sheet.
 * - Section boundaries are removed as presentation units.
 * - All items from all sections are aggregated into 6 fixed categories:
 *   1. keyPoints (نکات کلیدی)
 *   2. mechanisms (مکانیسم‌ها)
 *   3. classifications (طبقه‌بندی‌ها)
 *   4. comparisons (مقایسه‌ها و تفاوت‌های کلیدی - Key Distinctions)
 *   5. memorizationPoints (نکات حفظی)
 *   6. examPoints (نکات مهم آزمونی)
 * - Traversal order across sections is strictly preserved.
 * - Exact string duplicates are filtered. No fuzzy/semantic drops.
 */
export function flattenReviewSummarySections(
  sections: ReviewSummarySection[] | undefined | null,
): FlattenedReviewSummaryCategories {
  const result: FlattenedReviewSummaryCategories = {
    keyPoints: [],
    mechanisms: [],
    classifications: [],
    comparisons: [],
    memorizationPoints: [],
    examPoints: [],
    citationChunkIds: [],
  };

  if (!Array.isArray(sections) || sections.length === 0) {
    return result;
  }

  for (const section of sections) {
    // 1. Key Points
    if (Array.isArray(section.keyPoints)) {
      for (const kp of section.keyPoints) {
        if (typeof kp === "string" && kp.trim().length > 0) {
          if (!result.keyPoints.some((existing) => existing.trim() === kp.trim())) {
            result.keyPoints.push(kp);
          }
        }
      }
    }

    // 2. Mechanisms
    if (Array.isArray(section.mechanisms)) {
      for (const m of section.mechanisms) {
        if (typeof m === "string" && m.trim().length > 0) {
          if (!result.mechanisms.some((existing) => existing.trim() === m.trim())) {
            result.mechanisms.push(m);
          }
        }
      }
    }

    // 3. Classifications
    if (Array.isArray(section.classifications)) {
      for (const c of section.classifications) {
        if (typeof c === "string" && c.trim().length > 0) {
          if (!result.classifications.some((existing) => existing.trim() === c.trim())) {
            result.classifications.push(c);
          }
        }
      }
    }

    // 4. Comparisons / Key Distinctions
    if (Array.isArray(section.comparisons)) {
      for (const comp of section.comparisons) {
        if (!result.comparisons.some((existing) => isExactComparisonDuplicate(existing, comp))) {
          result.comparisons.push(comp);
        }
      }
    }

    // 5. Memorization Points
    if (Array.isArray(section.memorizationPoints)) {
      for (const mem of section.memorizationPoints) {
        if (typeof mem === "string" && mem.trim().length > 0) {
          if (!result.memorizationPoints.some((existing) => existing.trim() === mem.trim())) {
            result.memorizationPoints.push(mem);
          }
        }
      }
    }

    // 6. Exam Points
    if (Array.isArray(section.examPoints)) {
      for (const ex of section.examPoints) {
        if (typeof ex === "string" && ex.trim().length > 0) {
          if (!result.examPoints.some((existing) => existing.trim() === ex.trim())) {
            result.examPoints.push(ex);
          }
        }
      }
    }

    // Citations
    if (Array.isArray(section.citationChunkIds)) {
      for (const id of section.citationChunkIds) {
        if (typeof id === "string" && id.trim().length > 0 && !result.citationChunkIds.includes(id)) {
          result.citationChunkIds.push(id);
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Lesson & Content Plan Chunk Set Currency Checkers
// ---------------------------------------------------------------------------

/**
 * Validates whether all chunk IDs referenced by a lesson (top-level citations,
 * session citations, and session outlines) exist within the current document chunk set.
 */
export function isLessonChunkSetCurrent(
  lessonPayload: unknown,
  currentChunkIds: Set<string> | string[],
): boolean {
  if (!lessonPayload || typeof lessonPayload !== "object") {
    return false;
  }

  const payload =
    "payload" in lessonPayload && (lessonPayload as { payload?: unknown }).payload
      ? (lessonPayload as { payload: unknown }).payload
      : lessonPayload;

  if (!payload || typeof payload !== "object") {
    return false;
  }

  const p = payload as LessonPayload;
  const sessions = p.sessions;
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return false;
  }

  const currentSet =
    currentChunkIds instanceof Set ? currentChunkIds : new Set(currentChunkIds);

  // 1. Top-level citationChunkIds
  if (Array.isArray(p.citationChunkIds)) {
    for (const id of p.citationChunkIds) {
      if (typeof id === "string" && !currentSet.has(id)) {
        return false;
      }
    }
  }

  // 2. Session-level citationChunkIds
  for (const session of sessions) {
    if (!session || typeof session !== "object") {
      return false;
    }
    if (Array.isArray(session.citationChunkIds)) {
      for (const id of session.citationChunkIds) {
        if (typeof id === "string" && !currentSet.has(id)) {
          return false;
        }
      }
    }
  }

  // 3. Outline-level relevantChunkIds (if present)
  if (Array.isArray(p.outline)) {
    for (const item of p.outline) {
      const relevantChunkIds = (item as { relevantChunkIds?: string[] })?.relevantChunkIds;
      if (Array.isArray(relevantChunkIds)) {
        for (const id of relevantChunkIds) {
          if (typeof id === "string" && !currentSet.has(id)) {
            return false;
          }
        }
      }
    }
  }

  // 4. Coverage report source topics (if present)
  if (Array.isArray(p.coverageReport?.sourceTopicsIdentified)) {
    for (const topic of p.coverageReport.sourceTopicsIdentified) {
      const relevantChunkIds = (topic as { relevantChunkIds?: string[] })?.relevantChunkIds;
      if (Array.isArray(relevantChunkIds)) {
        for (const id of relevantChunkIds) {
          if (typeof id === "string" && !currentSet.has(id)) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

/**
 * Validates whether all chunk IDs referenced by a ContentPlan (sourceTopics and
 * session relevantChunkIds) exist within the current document chunk set.
 */
export function isContentPlanChunkSetCurrent(
  contentPlan: unknown,
  currentChunkIds: Set<string> | string[],
): boolean {
  if (!contentPlan || typeof contentPlan !== "object") {
    return false;
  }

  const cp = contentPlan as ContentPlan;
  if (!Array.isArray(cp.sessions) || cp.sessions.length === 0) {
    return false;
  }

  const currentSet =
    currentChunkIds instanceof Set ? currentChunkIds : new Set(currentChunkIds);

  // 1. Session-level relevantChunkIds
  for (const session of cp.sessions) {
    if (!session || typeof session !== "object") {
      return false;
    }
    if (Array.isArray(session.relevantChunkIds)) {
      for (const id of session.relevantChunkIds) {
        if (typeof id === "string" && !currentSet.has(id)) {
          return false;
        }
      }
    }
  }

  // 2. Source topics relevantChunkIds
  if (Array.isArray(cp.sourceTopics)) {
    for (const topic of cp.sourceTopics) {
      if (Array.isArray(topic.relevantChunkIds)) {
        for (const id of topic.relevantChunkIds) {
          if (typeof id === "string" && !currentSet.has(id)) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Adaptive Generation Budgeting (Phase 2 & Coverage Architecture)
// ---------------------------------------------------------------------------

export * from "./generation-budget.js";

