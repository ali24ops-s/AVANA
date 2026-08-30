/**
 * Framework-independent generation domain primitives (PR6-4).
 *
 * Pure types and constants only — no infrastructure, network, or
 * observability concerns. These mirror the payload/status shapes stored in
 * `generated_contents` and are shared between the API and future workers.
 *
 * The user instruction is to keep the type union extensible but only enable
 * `lesson` generation at runtime for PR6-4. Flashcard/quiz/recommendation are
 * declared here so the schema and future PRs can adopt them without churn.
 */

// ---------------------------------------------------------------------------
// Generated content lifecycle
// ---------------------------------------------------------------------------

/**
 * The kind of AI-generated artifact.
 *
 * Extensible union — new types (e.g. "summary", "mnemonic") can be added
 * behind the same pipeline later. Runtime generation is limited to `lesson`
 * for PR6-4; the others are reserved for PR6-5+.
 */
export type GeneratedContentType =
  | "lesson"
  | "flashcard"
  | "quiz"
  | "recommendation"
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
export type GenerationJobStatus = "queued" | "running" | "succeeded" | "failed";

/**
 * The set of job lifecycle states, in field/type form for validation.
 */
export const GENERATION_JOB_STATUSES: readonly GenerationJobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
];

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
  }>;
  citationChunkIds: string[];
};

export type RecommendationPayload = {
  kind: "recommendation";
  summary: string;
  topics: string[];
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

export type GeneratedContentPayload =
  | LessonPayload
  | FlashcardPayload
  | QuizPayload
  | RecommendationPayload
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
  "recommendation",
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
// Adaptive Generation Budgeting (Phase 2 & Coverage Architecture)
// ---------------------------------------------------------------------------

export * from "./generation-budget.js";
