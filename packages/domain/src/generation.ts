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
import {
  type CourseId,
  type DocumentId,
  type GenerationJobId,
  type OrganizationId,
  type QuestionPatternId,
  type QuestionPatternExampleId,
  type UUID,
  asQuestionPatternId,
} from "./ids.js";
import type { ChemicalStructure, ChemicalReaction } from "./chemistry/types.js";
import type { SuggestedVisualization } from "./chart/types.js";
import { type SourcePackRole, canonicalizeSourceRole } from "./source-pack.js";
import {
  normalizePersianDigits,
  normalizePersianText,
} from "./payment-extraction.js";

// ---------------------------------------------------------------------------
// Multi-Source Generation Primitives (MVP)
// ---------------------------------------------------------------------------

export type GenerationSource = {
  documentId: DocumentId;
  order: number;
  role?: SourcePackRole;
};

/**
 * Normalizes multi-source generation inputs:
 * 1. Validates source count (min 2, max 10 for multi-source).
 * 2. Rejects duplicate document IDs.
 * 3. Sorts by order ascending and maps order to 0, 1, 2, ...
 * 4. Canonicalizes semantic source roles (defaults first doc to primary_notes, subsequent to supplementary_reference).
 */
export function normalizeGenerationSources(
  sources: Array<{ documentId: DocumentId; order?: number; role?: SourcePackRole }> | unknown,
): GenerationSource[] {
  if (!Array.isArray(sources) || sources.length < 2) {
    throw new DomainError("bad_request", "عملیات تولید چندسندی نیازمند حداقل ۲ سند است.");
  }
  if (sources.length > 10) {
    throw new DomainError("bad_request", "حداکثر تعداد مجاز اسناد برای تولید همزمان ۱۰ سند است.");
  }

  const seen = new Set<string>();
  for (const s of sources) {
    if (seen.has(s.documentId)) {
      throw new DomainError("bad_request", `سند تکراری در درخواست یافت شد: ${s.documentId}`);
    }
    seen.add(s.documentId);
  }

  const sorted = [...sources].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.map((s, index) => ({
    documentId: s.documentId,
    order: index,
    role: s.role ? canonicalizeSourceRole(s.role) : (index === 0 ? "primary_notes" : "supplementary_reference"),
  }));
}

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

/**
 * Canonical 6-stage user-facing pipeline indicator stages.
 */
export type CanonicalGenerationStage =
  | "queued"
  | "planning"
  | "lessons"
  | "flashcards"
  | "mcqs"
  | "completed";

export const CANONICAL_STAGE_LABELS_FA: Record<CanonicalGenerationStage, string> = {
  queued: "صف",
  planning: "برنامه‌ریزی",
  lessons: "تولید درس‌ها",
  flashcards: "تولید فلش‌کارت‌ها",
  mcqs: "تولید سوالات",
  completed: "تکمیل",
};

/**
 * Normalizes any incoming stage identifier (or status) to one of the 6 canonical stages.
 * Prevents UI from getting stuck on step 0 due to casing, naming mismatch, or undefined keys.
 */
export function normalizeGenerationStage(
  stage?: string | null,
  status?: string | null,
): CanonicalGenerationStage {
  if (status === "completed" || status === "succeeded" || status === "ready") {
    return "completed";
  }
  if (!stage || stage.trim().length === 0) {
    if (status === "queued" || status === "idle") return "queued";
    if (status === "planning") return "planning";
    if (status === "generating") return "lessons";
    return "queued";
  }

  const s = stage.toLowerCase().trim();
  switch (s) {
    case "queued":
    case "queue":
    case "pending":
    case "idle":
      return "queued";

    case "analysis":
    case "planning":
    case "plan":
      return "planning";

    case "lesson":
    case "lessons":
    case "session":
    case "sessions":
      return "lessons";

    case "flashcard":
    case "flashcards":
    case "cards":
      return "flashcards";

    case "quiz":
    case "quizzes":
    case "mcq":
    case "mcqs":
    case "exam":
    case "exams":
    case "summary":
    case "review_summary":
      return "mcqs";

    case "completed":
    case "succeeded":
    case "review":
    case "reviewing":
    case "publishing":
    case "ready":
      return "completed";

    default:
      return "planning";
  }
}


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
  chemicalStructures?: ChemicalStructure[];
  chemicalReactions?: ChemicalReaction[];
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
  chemicalStructures?: ChemicalStructure[];
  chemicalReactions?: ChemicalReaction[];
};

export type FlashcardDifficulty = "easy" | "medium" | "hard";

export const VALID_FLASHCARD_DIFFICULTIES: readonly FlashcardDifficulty[] = [
  "easy",
  "medium",
  "hard",
] as const;

export type FlashcardPayload = {
  kind: "flashcard";
  title?: string;
  moduleTitle?: string;
  question?: string;
  answer?: string;
  explanation?: string;
  cardType?: string;
  difficulty?: FlashcardDifficulty;
  cards?: Array<{
    question: string;
    answer: string;
    explanation?: string;
    cardType?: string;
    difficulty?: FlashcardDifficulty;
  }>;
  citationChunkIds: string[];
};

/**
 * Validates and normalizes flashcard difficulty before persistence.
 * Rejects arbitrary or corrupted AI output with a DomainError while preserving null/undefined fallback.
 */
export function validateFlashcardDifficulty(
  raw: unknown,
  context?: { cardIndex?: number },
): FlashcardDifficulty {
  if (raw === undefined || raw === null || raw === "") {
    return "medium";
  }
  if (raw === "easy" || raw === "medium" || raw === "hard") {
    return raw;
  }
  const indexSuffix = context?.cardIndex !== undefined ? ` at card index ${context.cardIndex}` : "";
  const snippet = typeof raw === "string" ? raw.slice(0, 50) : String(raw);
  throw new DomainError(
    "unprocessable",
    `Invalid flashcard difficulty${indexSuffix}: "${snippet}". Expected one of: "easy", "medium", "hard".`,
    {
      contentType: "flashcard",
      cardIndex: context?.cardIndex,
      field: "difficulty",
      invalidValue: snippet,
    },
  );
}

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
  questionPatternId?: string;
  questionPatternVersion?: number;
  questionPatternTitle?: string;
};

// ---------------------------------------------------------------------------
// Question Pattern Domain Types (Admin Reference Patterns)
// ---------------------------------------------------------------------------

export type CognitiveLevel =
  | "recall"
  | "understand"
  | "apply"
  | "analyze"
  | "evaluate";

export const COGNITIVE_LEVELS: readonly CognitiveLevel[] = [
  "recall",
  "understand",
  "apply",
  "analyze",
  "evaluate",
] as const;

export const COGNITIVE_LEVEL_LABELS_FA: Record<CognitiveLevel, string> = {
  recall: "یادآوری",
  understand: "درک و تفسیر",
  apply: "کاربرد",
  analyze: "تحلیل",
  evaluate: "ارزیابی و قضاوت",
};

export interface QuestionSkillDefinition {
  id: string;
  labelFa: string;
  category: "cognitive" | "clinical" | "analytical" | "practical";
}

export const STANDARD_QUESTION_SKILLS: readonly QuestionSkillDefinition[] = [
  { id: "direct_recall", labelFa: "یادآوری مستقیم", category: "cognitive" },
  { id: "calculation", labelFa: "محاسبه", category: "analytical" },
  { id: "comparison", labelFa: "مقایسه", category: "analytical" },
  { id: "data_interpretation", labelFa: "تفسیر داده", category: "analytical" },
  { id: "problem_solving", labelFa: "حل مسئله", category: "cognitive" },
  { id: "causal_reasoning", labelFa: "استدلال علّی", category: "cognitive" },
  { id: "decision_making", labelFa: "تصمیم‌گیری", category: "practical" },
  { id: "best_answer_selection", labelFa: "انتخاب بهترین گزینه", category: "practical" },
  { id: "scenario_analysis", labelFa: "تحلیل سناریو", category: "analytical" },
  { id: "error_identification", labelFa: "شناسایی خطا", category: "analytical" },
  { id: "outcome_prediction", labelFa: "پیش‌بینی پیامد", category: "cognitive" },
  { id: "diagnosis", labelFa: "تشخیص", category: "clinical" },
  { id: "differential_diagnosis", labelFa: "تشخیص افتراقی", category: "clinical" },
  { id: "treatment_management", labelFa: "مدیریت درمان", category: "clinical" },
  { id: "clinical_reasoning", labelFa: "استدلال بالینی", category: "clinical" },
] as const;

/**
 * Normalizes any incoming string into a valid Bloom MCQ CognitiveLevel.
 * Safe fallback is "recall".
 */
export function normalizeCognitiveLevel(raw?: string | null): CognitiveLevel {
  if (!raw) return "recall";
  const s = raw.trim().toLowerCase();
  if (
    s === "recall" ||
    s === "factual_recall" ||
    s === "factual" ||
    s === "یادآوری" ||
    s === "یادآوری نکات مستقیم"
  ) {
    return "recall";
  }
  if (
    s === "understand" ||
    s === "comprehension" ||
    s === "درک" ||
    s === "درک و تفسیر"
  ) {
    return "understand";
  }
  if (
    s === "apply" ||
    s === "application" ||
    s === "کاربرد" ||
    s === "pharmacotherapy_management" ||
    s === "مدیریت دارودرمانی"
  ) {
    return "apply";
  }
  if (
    s === "analyze" ||
    s === "analysis" ||
    s === "تحلیل" ||
    s === "clinical_reasoning" ||
    s === "differential_diagnosis" ||
    s === "استدلال بالینی" ||
    s === "تشخیص افتراقی"
  ) {
    return "analyze";
  }
  if (
    s === "evaluate" ||
    s === "evaluation" ||
    s === "ارزیابی" ||
    s === "ارزیابی و قضاوت"
  ) {
    return "evaluate";
  }
  return "recall";
}

/**
 * Maps legacy pre-upgrade cognitive level strings to pure CognitiveLevel and separate skills.
 */
export function mapLegacyCognitiveLevelToSkill(raw?: string | null): {
  cognitiveLevel: CognitiveLevel;
  skills: string[];
} {
  if (!raw) {
    return { cognitiveLevel: "recall", skills: [] };
  }
  const s = raw.trim().toLowerCase();
  switch (s) {
    case "clinical_reasoning":
    case "استدلال بالینی":
      return {
        cognitiveLevel: "analyze",
        skills: ["clinical_reasoning", "scenario_analysis"],
      };
    case "differential_diagnosis":
    case "تشخیص افتراقی":
      return {
        cognitiveLevel: "analyze",
        skills: ["differential_diagnosis"],
      };
    case "pharmacotherapy_management":
    case "مدیریت دارودرمانی":
      return {
        cognitiveLevel: "apply",
        skills: ["treatment_management"],
      };
    case "factual_recall":
    case "یادآوری نکات مستقیم":
      return {
        cognitiveLevel: "recall",
        skills: ["direct_recall"],
      };
    case "recall":
    case "understand":
    case "apply":
    case "analyze":
    case "evaluate":
      return {
        cognitiveLevel: s as CognitiveLevel,
        skills: [],
      };
    default:
      return {
        cognitiveLevel: normalizeCognitiveLevel(s),
        skills: [],
      };
  }
}

export type QuestionPatternCategory = "exam" | "analytical" | "supplementary";

export type QuestionPatternRecord = {
  id: QuestionPatternId;
  title: string;
  description?: string | null;
  category?: QuestionPatternCategory;
  cognitiveLevel: CognitiveLevel;
  skills: string[];
  systemInstructions: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type QuestionPatternExampleRecord = {
  id: QuestionPatternExampleId;
  questionPatternId: QuestionPatternId;
  sourceQuizQuestionId?: string | null;
  question: string;
  choices: string[];
  correctAnswer: unknown;
  explanation?: string | null;
  clinicalContext?: string | null;
  sortOrder: number;
  createdAt: string;
};

export type QuestionPatternDefinition = QuestionPatternRecord & {
  examples: QuestionPatternExampleRecord[];
};

export interface StandardQuestionPatternSeed {
  id: QuestionPatternId;
  title: string;
  description: string;
  category: QuestionPatternCategory;
  cognitiveLevel: CognitiveLevel;
  skills: string[];
  systemInstructions: string;
  isActive: boolean;
  version: number;
}

export const STANDARD_QUESTION_PATTERNS: readonly StandardQuestionPatternSeed[] = [
  // ---------------------------------------------------------------------------
  // دسته اول: الگوهای امتحانی (exam)
  // ---------------------------------------------------------------------------
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000001" as UUID),
    title: "نکات پرتکرار امتحانی",
    description: "تمرکز بر نکات کلیدی، پرتکرار و مباحث پرتکرار آزمون‌های جامع و پایان‌ترم.",
    category: "exam",
    cognitiveLevel: "recall",
    skills: ["direct_recall", "high_yield_facts", "concept_application"],
    systemInstructions: [
      "الگوی نکات پرتکرار امتحانی:",
      "- سوالاتی طراحی کنید که مستقیماً مهم‌ترین و متداول‌ترین نکات امتحانی، تعاریف بنیادین و روابط اصلی مبحث را بسنجند.",
      "- صورت سوال باید شفاف، صریح و بدون ابهام باشد و مفهوم اصلی را به سرعت منتقل کند.",
      "- گزینه‌های انحرافی باید از سایر مفاهیم مهم و پرتکرار مرتبط در متن انتخاب شوند و از پرداختن به جزئیات حاشیه‌ای و کم‌اهمیت پرهیز شود.",
      "- تمام گزینه‌ها باید همگن و از نظر ساختار گرامری و طول متوازن باشند.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000002" as UUID),
    title: "مفهومی و درک عمیق",
    description: "سنجش فهم پایه‌ای سازوکارها و اصول علمی به جای حفظ کردن کلمات.",
    category: "exam",
    cognitiveLevel: "understand",
    skills: ["deep_comprehension", "concept_integration", "mechanism_analysis"],
    systemInstructions: [
      "الگوی مفهومی و درک عمیق:",
      "- سوال باید چرایی و چگونگی پدیده‌ها، اصول علمی یا مکانیسم‌های مطرح‌شده در متن را هدف قرار دهد.",
      "- پاسخ صحیح نیازمند فهم ارتباطات مفهومی و منطقی باشد، نه صرفاً بازشناسی واژگانی و حفظ کلمه به کلمه.",
      "- گزینه‌های انحرافی باید بازتاب‌دهنده تصورات نادرست و مغالطه‌های مفهومی رایج دانشجویان در درک موضوع باشند.",
      "- در پاسخ تشریحی دلیل بنیادین درستی گزینه صحیح و رد برداشت‌های غلط به روشنی تبیین شود.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000003" as UUID),
    title: "تمایز و مقایسه",
    description: "تمرکز بر تفاوت‌های معنادار و تمایزات کلیدی میان مفاهیم، دسته‌ها یا موارد مشابه.",
    category: "exam",
    cognitiveLevel: "analyze",
    skills: ["comparison", "differential_diagnosis", "category_discrimination"],
    systemInstructions: [
      "الگوی تمایز و مقایسه:",
      "- صورت سوال باید بر مقایسه دقیق دو یا چند پدیده، دسته، روش، دارو یا مفهوم مشابه تمرکز کند و تفاوت محوری و اختصاصی آنها را مورد سنجش قرار دهد.",
      "- تست باید توانایی تفکیک مرزهای ظریف میان مفاهیم هم‌پوشان را ارزیابی کند.",
      "- گزینه‌های انحرافی باید ویژگی‌های واقعی یکی از موارد مقایسه باشند که به اشتباه به مورد دیگر نسبت داده شده‌اند، تا دقت تشخیصی دانشجو محک بخورد.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000004" as UUID),
    title: "نکات دامدار و اشتباهات رایج",
    description: "استفاده از اشتباهات علمی رایج برای طراحی گزینه‌های انحرافی هوشمندانه بدون تله‌های زبانی.",
    category: "exam",
    cognitiveLevel: "analyze",
    skills: ["error_identification", "misconception_avoidance", "fine_distinction"],
    systemInstructions: [
      "الگوی نکات دامدار و اشتباهات رایج:",
      "- سوال باید خطاهای رایج علمی، استثنائات مهم، تداخلات ظریف یا سوءبرداشت‌های متداول در موضوع را هدف قرار دهد.",
      "- گزینه‌های انحرافی باید بسیار فریبنده، وسوسه‌برانگیز و منطبق بر شهود اولیه اما نادرست دانشجویان باشند.",
      "- دام و چالش سوال باید کاملاً مبتنی بر عمق تمایز علمی باشد، نه مبهم‌گویی ادبی، ترفندهای لغوی یا نگارش گمراه‌کننده.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },

  // ---------------------------------------------------------------------------
  // دسته دوم: الگوهای تحلیلی (analytical)
  // ---------------------------------------------------------------------------
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000005" as UUID),
    title: "سناریومحور",
    description: "قرار دادن مسئله در قالب یک وضعیت یا سناریوی کاربردی و واقعی مرتبط با محتوا.",
    category: "analytical",
    cognitiveLevel: "apply",
    skills: ["scenario_analysis", "clinical_reasoning", "decision_making"],
    systemInstructions: [
      "الگوی سناریومحور:",
      "- صورت سوال باید در قالب یک سناریوی واقعی، شرح‌حال بالینی، گزارش موردی، یا مسئله کاربردی منسجم تدوین شود.",
      "- شواهد و سرنخ‌های کلیدی باید در متن سناریو ارائه شوند تا دانشجو ملزم به تحلیل وضعیت و اتخاذ بهترین تصمیم، انتخاب رویکرد یا تشخیص شود.",
      "- گزینه‌های انحرافی باید اقدامات یا نتایج محتمل و معقول در شرایط مشابه باشند که به دلیل جزئیات سناریو انتخاب اول نیستند.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000006" as UUID),
    title: "استدلال چندمرحله‌ای",
    description: "الزام به تحلیل حداقل دو مرحله منطقی متوالی برای رسیدن به پاسخ درست.",
    category: "analytical",
    cognitiveLevel: "analyze",
    skills: ["multistep_deduction", "causal_reasoning", "problem_solving"],
    systemInstructions: [
      "الگوی استدلال چندمرحله‌ای:",
      "- رسیدن به پاسخ درست نباید با یک یادآوری تک‌مرحله‌ای ممکن باشد، بلکه باید مستلزم حداقل دو مرحله تحلیل متوالی باشد.",
      "- مثال گام‌ها: گام اول = تفسیر علائم/یافته‌ها و شناسایی ماهیت زمینه؛ گام دوم = انتخاب اقدام، مکانیسم یا پیامد متناسب با وضعیت شناسایی‌شده.",
      "- گزینه‌های انحرافی باید منطبق بر خطاهای شناختی احتمالی در گام اول یا دوم استدلال باشند.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000007" as UUID),
    title: "علت و معلول",
    description: "بررسی روابط علی و معلولی، ریشه‌یابی و پیامد زنجیره‌ای رخدادها.",
    category: "analytical",
    cognitiveLevel: "analyze",
    skills: ["causal_reasoning", "outcome_prediction", "pathophysiology"],
    systemInstructions: [
      "الگوی علت و معلول:",
      "- سوال باید زنجیره روابط علی، محرک‌ها، پاسخ‌های واکنشی یا پیامدهای متوالی یک رخداد/مداخله را بسنجد.",
      "- صورت سوال باید جهت‌داری رابطه (دلیل بروز یک پدیده یا پیامد مستقیم یک تغییر) را به صراحت مورد پرسش قرار دهد.",
      "- گزینه‌های انحرافی باید شامل علیت معکوس، همبستگی‌های تصادفی بدون رابطه علی، یا مراحل اشتباه در توالی فرآیند باشند.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000008" as UUID),
    title: "حل مسئله و محاسبات",
    description: "استفاده از فرمول‌ها، نسبت‌ها، مقادیر عددی یا الگوریتم‌های گام‌به‌گام برای حل مسئله.",
    category: "analytical",
    cognitiveLevel: "apply",
    skills: ["calculation", "problem_solving", "quantitative_reasoning"],
    systemInstructions: [
      "الگوی حل مسئله و محاسبات:",
      "- سوال باید داده‌های شفاف و قابل اندازه‌گیری را ارائه داده و دانشجو را به استفاده از فرمول‌ها، ضرایب، نسبت‌ها یا الگوریتم‌های محاسباتی منبع دعوت کند.",
      "- مقادیر و فرضیات باید واقع‌بینانه و دقیقاً بر مبنای محتوای درسنامه باشند.",
      "- گزینه‌های انحرافی باید بر مبنای اشتباهات متداول محاسباتی (مانند اشتباه در تبدیل واحد، فراموشی توان، یا استفاده از پارامتر غلط) طراحی شوند.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },

  // ---------------------------------------------------------------------------
  // دسته سوم: الگوهای تکمیلی (supplementary)
  // ---------------------------------------------------------------------------
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000009" as UUID),
    title: "سبک آزمون‌های استاندارد",
    description: "طراحی سوال دقیقاً منطبق بر چارچوب سنجش آزمون‌های رسمی ۴ گزینه‌ای استاندارد.",
    category: "supplementary",
    cognitiveLevel: "apply",
    skills: ["standardized_testing", "clinical_reasoning", "best_answer_selection"],
    systemInstructions: [
      "الگوی سبک آزمون‌های استاندارد:",
      "- تدوین سوال کاملاً منطبق بر اصول روان‌سنجی آزمون‌های استاندارد کشوری و بین‌المللی.",
      "- صورت سوال مثبت، روشن و فاقد اطلاعات زائد؛ جمله پایانی به عنوان پرسش صریح (Lead-in).",
      "- گزینه‌ها همگن، کوتاه، با گرامر و طول متوازن؛ بدون گزینه‌های غیرحرفه‌ای نظیر «همه موارد» یا «هیچ‌کدام».",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000010" as UUID),
    title: "سؤالات ترکیبی",
    description: "تلفیق همزمان مباحث مختلف فصل‌ها یا رشته‌ها در یک پرسش جامع.",
    category: "supplementary",
    cognitiveLevel: "evaluate",
    skills: ["concept_integration", "cross_disciplinary_synthesis", "comprehensive_analysis"],
    systemInstructions: [
      "الگوی سؤالات ترکیبی:",
      "- سوال باید حداقل دو مبحث متمایز، دو بخش از درسنامه، یا مفاهیم بین‌رشته‌ای را به یکدیگر پیوند دهد.",
      "- پاسخ صحیح مستلزم یکپارچه‌سازی و سنتز اطلاعات از چند بخش منبع باشد.",
      "- گزینه‌های انحرافی باید شامل ترکیب‌های ناقص یا متناقض از مباحث پیوند‌خورده باشند.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000011" as UUID),
    title: "تشخیص گزینه نادرست",
    description: "یافتن عبارت اشتباه یا استثنا در میان موارد صحیح («کدام گزینه نادرست است؟»).",
    category: "supplementary",
    cognitiveLevel: "analyze",
    skills: ["critical_appraisal", "error_detection", "exception_identification"],
    systemInstructions: [
      "الگوی تشخیص گزینه نادرست:",
      "- سوال باید برای ارزیابی نقادانه و کشف گزاره غلط یا استثنا طراحی شود («کدام عبارت در خصوص ... نادرست است؟» یا «به‌جز...»).",
      "- سه گزینه انحرافی باید گزاره‌های کاملاً صحیح و مستند به درسنامه باشند؛ و تنها گزینه هدف، حاوی یک مغایرت علمی صریح و مستدل باشد.",
      "- لحن منفی صورت سوال باید کاملاً برجسته و مشخص باشد تا از ابهام زبانی جلوگیری شود.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
  {
    id: asQuestionPatternId("10000000-0000-4000-a000-000000000012" as UUID),
    title: "یادآوری فعال و بازیابی اطلاعات",
    description: "پرسش‌های موجز جهت فعال‌سازی حافظه بلندمدت و بازیابی موثر آموخته‌ها.",
    category: "supplementary",
    cognitiveLevel: "recall",
    skills: ["direct_recall", "active_retrieval", "long_term_retention"],
    systemInstructions: [
      "الگوی یادآوری فعال و بازیابی اطلاعات:",
      "- بهینه‌سازی شده برای تقویت یادگیری ماندگار و بازیابی سریع ذهنی (Active Recall).",
      "- صورت سوال باید سرنخ‌های متمرکز و دقیقی ارائه دهد تا ذهن را برای بازیابی واژگان، تعاریف یا قوانین اصلی تحریک کند.",
      "- گزینه‌ها باید موارد هم‌رده و معتبری باشند تا تمایز دقیق ذهنی را به چالش بکشند.",
    ].join("\n"),
    isActive: true,
    version: 1,
  },
];

export type QuizPatternPromptSection = {
  title: string;
  cognitiveLevel: CognitiveLevel;
  skills?: string[];
  systemInstructions: string;
  examples: Array<{
    question: string;
    choices: string[];
    correctAnswer: string;
    explanation?: string;
    clinicalContext?: string;
  }>;
};

export type PatternExtractionConfidence = "high" | "medium" | "low";

export type QuestionPatternExtractionResult = {
  title: string;
  description?: string;
  cognitiveLevel: CognitiveLevel;
  skills: string[];
  questionStructure?: string;
  reasoningStyle?: string;
  stemStyle?: string;
  optionCount?: number;
  answerType?: string;
  distractorStrategy?: string;
  difficultyCharacteristics?: string;
  scenarioCharacteristics?: string;
  systemInstructions: string;
  confidence: PatternExtractionConfidence;
  warnings?: string[];
  parsedExamples?: Array<{
    question: string;
    choices: string[];
    correctAnswer: number | string;
    explanation?: string;
    clinicalContext?: string;
  }>;
};

export type SampleQuestionInput = {
  question: string;
  choices?: string[];
  correctAnswer?: number | string;
  explanation?: string;
  clinicalContext?: string;
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

export type FactCoverageStatus = "covered" | "unverified" | "contradiction";

export interface FactCoverageEvaluation {
  factId: string;
  name: string;
  status: FactCoverageStatus;
  evidence?: string;
  details?: string;
}

export interface ReviewSummaryCoverageReport {
  evaluatedRulesCount: number;
  coveredCount: number;
  unverifiedCount: number;
  contradictionCount: number;
  evaluations: FactCoverageEvaluation[];
  warnings: string[];
}

export type ReviewSummaryPayload = {
  kind: "review_summary";
  title: string;
  estimatedReadingMinutes: number;
  overview: string;
  sections: ReviewSummarySection[];
  finalTakeaways: string[];
  citationChunkIds: string[];
  targetReadingMinutes?: number;
  coverageWarnings?: string[];
  coverageReport?: ReviewSummaryCoverageReport;
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

/**
 * Normalizes, trims, deduplicates, and preserves canonical order for raw requested content types string.
 */
export function normalizeRequestedContentTypes(
  raw?: string | string[] | null,
): GeneratedContentType[] | undefined {
  if (!raw) return undefined;
  const canonicalOrder: GeneratedContentType[] = [
    "lesson",
    "flashcard",
    "quiz",
    "review_summary",
  ];
  const validSet = new Set<string>(canonicalOrder);
  const items = Array.isArray(raw) ? raw : raw.split(",");
  const matched = new Set<GeneratedContentType>();

  for (const item of items) {
    if (typeof item === "string") {
      const trimmed = item.trim().toLowerCase();
      if (validSet.has(trimmed)) {
        matched.add(trimmed as GeneratedContentType);
      }
    }
  }

  if (matched.size === 0) return undefined;
  return canonicalOrder.filter((t) => matched.has(t));
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
    suggestedVisualizations?: SuggestedVisualization[];
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
  primaryChunksAssigned?: number;
  primaryChunksCited?: number;
  contentCoveragePct?: number;
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
  primaryNotesCoverage?: {
    structural: {
      totalPrimaryChunks: number;
      assignedPrimaryChunks: number;
      structuralCoveragePct: number;
    };
    content: {
      totalCoreConcepts: number;
      coveredCoreConcepts: number;
      contentCoveragePct: number;
      citedPrimaryChunksCount: number;
      primaryCitationCoveragePct: number;
    };
    status: "complete" | "partial" | "insufficient";
    resolvedChunks: string[];
    unresolvedChunks: string[];
    uncoveredConcepts: string[];
  };
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
  role?: string;
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
 * Critical Clinical and Educational Coverage Rules.
 * Evaluates high-priority medical facts with multi-predicate relational assertions.
 */
export interface CriticalRuleDefinition {
  id: string;
  name: string;
  isApplicable: (fullText: string) => boolean;
  evaluate: (segments: string[], fullText: string) => {
    status: FactCoverageStatus;
    evidence?: string;
    details?: string;
  };
}

export const REVIEW_SUMMARY_CRITICAL_RULES: readonly CriticalRuleDefinition[] = [
  {
    id: "CRIT-HTN-PREGNANCY",
    name: "منع مصرف مطلق مهارکننده‌های ACE/ARB در بارداری (تراتوژنیسیته)",
    isApplicable: (text: string) =>
      /acei|arb|آنژیوتانسین|لوزارتان|کاپتوپریل|انالاپریل|لیزینوپریل|والزارتان|مهارکننده\s*(?:های)?\s*raas|raas/.test(
        text,
      ),
    evaluate: (segments: string[], fullText: string) => {
      const contradictionRegex =
        /(?:acei|arb|کاپتوپریل|انالاپریل|لوزارتان|والزارتان|raas).{0,60}(?:مجاز در بارداری|بی\s*خطر در بارداری|انتخاب اول در بارداری|خط اول در بارداری)|(?:safe|first[- ]line|recommended)\s+(?:in|during)\s+pregnancy/;
      if (contradictionRegex.test(fullText)) {
        return {
          status: "contradiction",
          details:
            "تناقض بالینی: مصرف مهارکننده RAAS در بارداری مجاز یا ایمن ذکر شده است.",
        };
      }
      for (const seg of segments) {
        const hasDrug =
          /acei|arb|آنژیوتانسین|کاپتوپریل|انالاپریل|لوزارتان|والزارتان|raas/.test(
            seg,
          );
        const hasPregnancy =
          /باردار|جنین|تراتوژن|سه‌ماهه|سه\s*ماهه|pregnancy|teratogen|fetus/.test(
            seg,
          );
        const hasProhibition =
          /منع مصرف|کنترااندیکاسیون|تراتوژن|سمی|آسیب جنین|خطر مرگ|ممنوع|contraindicated/.test(
            seg,
          );
        if (hasDrug && hasPregnancy && hasProhibition) {
          return { status: "covered", evidence: seg };
        }
      }
      return {
        status: "unverified",
        details:
          "هشدار: منع مصرف مهارکننده‌های RAAS در بارداری یا تراتوژنیسیته احراز نشد.",
      };
    },
  },
  {
    id: "CRIT-HTN-RENAL-STENOSIS",
    name: "منع مصرف ACEI/ARB در تنگی دوطرفه شریان کلیه",
    isApplicable: (text: string) =>
      /acei|arb|آنژیوتانسین|مهارکننده\s*(?:های)?\s*raas|raas/.test(text),
    evaluate: (segments: string[], fullText: string) => {
      const contradictionRegex =
        /(?:تنگی شریان کلیه|تنگی دوطرفه).{0,50}(?:بی\s*خطر|داروی انتخابی|مجاز)|safe in renal artery stenosis/;
      if (contradictionRegex.test(fullText)) {
        return {
          status: "contradiction",
          details: "تناقض: مصرف در تنگی شریان مجاز ذکر شده است.",
        };
      }
      for (const seg of segments) {
        const hasStenosis =
          /تنگی شریان کلیه|تنگی دوطرفه|تنگی شریان|renal artery stenosis/.test(
            seg,
          );
        const hasProhibition =
          /منع مصرف|کنترااندیکاسیون|افت شدید gfr|افت gfr|نارسایی حاد کلیه|contraindicated/.test(
            seg,
          );
        if (hasStenosis && hasProhibition) {
          return { status: "covered", evidence: seg };
        }
      }
      return {
        status: "unverified",
        details:
          "هشدار: ارتباط تنگی دوطرفه شریان کلیه با منع مصرف یا افت شدید GFR احراز نشد.",
      };
    },
  },
  {
    id: "CRIT-HTN-BRADYKININ-COUGH",
    name: "مکانیسم سرفه و آنژیوادم ناشی از برادی‌کینین با ACEI",
    isApplicable: (text: string) =>
      /acei|مهارکننده\s*(?:های)?\s*ace|کاپتوپریل|انالاپریل|لیزینوپریل/.test(text),
    evaluate: (segments: string[]) => {
      for (const seg of segments) {
        const hasDrugOrCough =
          /acei|مهارکننده|سرفه|آنژیوادم|انژیوادم|cough/.test(seg);
        const hasBradykinin =
          /برادی\s*کینین|برادی‌کینین|سابستنس\s*p|ماده\s*p|bradykinin/.test(seg);
        if (hasDrugOrCough && hasBradykinin) {
          return { status: "covered", evidence: seg };
        }
      }
      return {
        status: "unverified",
        details:
          "هشدار: سازوکار تجمع برادی‌کینین در سرفه یا آنژیوادم ACEI احراز نشد.",
      };
    },
  },
  {
    id: "CRIT-SHOCK-MAP-65",
    name: "آستانه هدف فشار شریانی میانگین (MAP >= 65 mmHg) در شوک",
    isApplicable: (text: string) => /شوک|سپسیس|سپتیک|shock|sepsis/.test(text),
    evaluate: (segments: string[], fullText: string) => {
      if (/map.{0,30}(?:زیر 50|< 50|کمتر از 50)/.test(fullText)) {
        return {
          status: "contradiction",
          details: "تناقض: تارگت MAP کمتر از ۵۰ قید شده است.",
        };
      }
      for (const seg of segments) {
        const hasMap =
          /map|فشار شریانی میانگین|فشار میانگین شریانی|میانگین فشار/.test(seg);
        const has65 = /65/.test(seg);
        if (hasMap && has65) {
          return { status: "covered", evidence: seg };
        }
      }
      return {
        status: "unverified",
        details: "هشدار: تارگت عددی MAP بالای ۶۵ میلی‌متر جیوه احراز نشد.",
      };
    },
  },
  {
    id: "CRIT-SHOCK-VASOPRESSIN-003",
    name: "دوز ثابت وازوپرسین (تا 0.03 units/min) در شوک سپسیس",
    isApplicable: (text: string) => /وازوپرسین|vasopressin/.test(text),
    evaluate: (segments: string[]) => {
      for (const seg of segments) {
        const hasVaso = /وازوپرسین|vasopressin/.test(seg);
        const hasDose = /0\.03/.test(seg);
        if (hasVaso && hasDose) {
          return { status: "covered", evidence: seg };
        }
      }
      return {
        status: "unverified",
        details: "هشدار: دوز ثابت 0.03 وازوپرسین احراز نشد.",
      };
    },
  },
  {
    id: "CRIT-FOYE-APAP-NAPQI",
    name: "سمیت کبدی استامینوفن با متابولیت NAPQI و تخلیه گلوتاتیون",
    isApplicable: (text: string) =>
      /استامینوفن|apap|پاراستامول|acetaminophen/.test(text),
    evaluate: (segments: string[]) => {
      for (const seg of segments) {
        const hasNapqi = /napqi|کینون ایمین/.test(seg);
        const hasGshOrNecrosis =
          /گلوتاتیون|gsh|نکروز|سمیت|کووالان|nac|استیل‌سیستئین|استیل\s*سیستئین/.test(
            seg,
          );
        if (hasNapqi && hasGshOrNecrosis) {
          return { status: "covered", evidence: seg };
        }
      }
      return {
        status: "unverified",
        details:
          "هشدار: ارتباط NAPQI، گلوتاتیون یا سمیت کبدی استامینوفن احراز نشد.",
      };
    },
  },
];

/**
 * Deterministic rule-based evaluation of critical medical facts in ReviewSummaryPayload.
 * Normalizes Persian/English digits and characters, and applies multi-predicate relational assertions.
 */
export function evaluateReviewSummaryDeterministicCoverage(
  payload: Pick<ReviewSummaryPayload, "title" | "overview" | "sections"> & {
    finalTakeaways?: string[];
  },
): ReviewSummaryCoverageReport {
  const parts: string[] = [];
  if (payload.title) parts.push(payload.title);
  if (payload.overview) parts.push(payload.overview);
  if (Array.isArray(payload.finalTakeaways)) parts.push(...payload.finalTakeaways);

  if (Array.isArray(payload.sections)) {
    for (const sec of payload.sections) {
      if (sec.title) parts.push(sec.title);
      if (Array.isArray(sec.keyPoints)) parts.push(...sec.keyPoints);
      if (Array.isArray(sec.mechanisms)) parts.push(...sec.mechanisms);
      if (Array.isArray(sec.classifications)) parts.push(...sec.classifications);
      if (Array.isArray(sec.memorizationPoints)) parts.push(...sec.memorizationPoints);
      if (Array.isArray(sec.examPoints)) parts.push(...sec.examPoints);
      if (Array.isArray(sec.comparisons)) {
        for (const comp of sec.comparisons) {
          if (typeof comp === "string") parts.push(comp);
          else if (comp && typeof comp === "object") {
            if (comp.conceptA) parts.push(comp.conceptA);
            if (comp.conceptB) parts.push(comp.conceptB);
            if (comp.keyDifferences) parts.push(comp.keyDifferences);
          }
        }
      }
    }
  }

  const normalizedSegments = parts.map((p) =>
    normalizePersianDigits(normalizePersianText(p)).toLowerCase(),
  );
  const fullText = normalizedSegments.join(" ");

  const evaluations: FactCoverageEvaluation[] = [];
  const warnings: string[] = [];
  let coveredCount = 0;
  let unverifiedCount = 0;
  let contradictionCount = 0;

  for (const rule of REVIEW_SUMMARY_CRITICAL_RULES) {
    if (!rule.isApplicable(fullText)) {
      continue;
    }

    const res = rule.evaluate(normalizedSegments, fullText);
    evaluations.push({
      factId: rule.id,
      name: rule.name,
      status: res.status,
      evidence: res.evidence,
      details: res.details,
    });

    if (res.status === "covered") {
      coveredCount++;
    } else if (res.status === "contradiction") {
      contradictionCount++;
      warnings.push(`[${rule.id}] ${res.details || rule.name}`);
    } else {
      unverifiedCount++;
      warnings.push(`[${rule.id}] ${res.details || rule.name}`);
    }
  }

  return {
    evaluatedRulesCount: evaluations.length,
    coveredCount,
    unverifiedCount,
    contradictionCount,
    evaluations,
    warnings,
  };
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

  const trimmedTitle = candidate.title.trim();
  const trimmedOverview = candidate.overview.trim();
  const sections = candidate.sections as ReviewSummarySection[];

  const coverageReport = evaluateReviewSummaryDeterministicCoverage({
    title: trimmedTitle,
    overview: trimmedOverview,
    sections,
    finalTakeaways,
  });

  return {
    kind: "review_summary",
    title: trimmedTitle,
    estimatedReadingMinutes:
      typeof candidate.estimatedReadingMinutes === "number" &&
      candidate.estimatedReadingMinutes > 0
        ? candidate.estimatedReadingMinutes
        : 10,
    overview: trimmedOverview,
    sections,
    finalTakeaways,
    citationChunkIds: Array.isArray(candidate.citationChunkIds)
      ? (candidate.citationChunkIds as string[])
      : [],
    ...(coverageReport.warnings.length > 0 ? { coverageWarnings: coverageReport.warnings } : {}),
    coverageReport,
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

