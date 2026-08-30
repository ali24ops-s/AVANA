/**
 * Content Pack domain primitives and types.
 *
 * A Content Pack is an immutable, shareable bundle containing exactly 4
 * AI-generated educational assets (lesson, flashcard, quiz, review_summary)
 * generated from a source document and approved by an editor/creator.
 *
 * Architectural Principle:
 *   IMMUTABLE SNAPSHOT + OPTIONAL AUDIT LINEAGE
 *   Public Library details and consumption NEVER depend on generated_contents.
 */

import type {
  ContentPackId,
  ContentPackItemId,
  ContentPackUsageId,
  CourseId,
  DocumentId,
  GeneratedContentId,
  ModuleId,
  OrganizationId,
  UserId,
} from "./ids.js";
import type {
  GeneratedContentPayload,
  LessonPayload,
  FlashcardPayload,
  QuizPayload,
  ReviewSummaryPayload,
} from "./generation.js";

// ---------------------------------------------------------------------------
// Content Pack Types & Constants
// ---------------------------------------------------------------------------

export type ContentPackStatus = "published" | "archived";

export const CONTENT_PACK_STATUSES: readonly ContentPackStatus[] = [
  "published",
  "archived",
];

export function isContentPackStatus(v: string): v is ContentPackStatus {
  return (CONTENT_PACK_STATUSES as readonly string[]).includes(v);
}

export type ContentPackContentType =
  | "lesson"
  | "flashcard"
  | "quiz"
  | "review_summary";

export const CONTENT_PACK_CONTENT_TYPES: readonly ContentPackContentType[] = [
  "lesson",
  "flashcard",
  "quiz",
  "review_summary",
];

export function isContentPackContentType(
  v: string,
): v is ContentPackContentType {
  return (CONTENT_PACK_CONTENT_TYPES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Content Pack Metadata & Snapshot Items
// ---------------------------------------------------------------------------

export type ContentPackMetadata = {
  sessionCount?: number;
  flashcardCount?: number;
  quizQuestionCount?: number;
  estimatedReadingMinutes?: number;
  [key: string]: unknown;
};

export type ContentPackRecord = {
  id: ContentPackId;
  creatorUserId: UserId | null;
  organizationId: OrganizationId | null;
  sourceDocumentId: DocumentId | null;
  title: string;
  description: string | null;
  subject: string | null;
  status: ContentPackStatus;
  publishedAt: string;
  usageCount: number;
  metadata: ContentPackMetadata;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ContentPackItemRecord = {
  id: ContentPackItemId;
  contentPackId: ContentPackId;
  contentType: ContentPackContentType;
  sourceGeneratedContentId: GeneratedContentId | null;
  payloadSnapshot: GeneratedContentPayload;
  sortOrder: number;
  createdAt: string;
};

export type ContentPackUsageRecord = {
  id: ContentPackUsageId;
  contentPackId: ContentPackId;
  userId: UserId;
  targetCourseId: CourseId;
  targetModuleId: ModuleId | null;
  addedAt: string;
};

// ---------------------------------------------------------------------------
// Public Library Preview & Resource Types
// ---------------------------------------------------------------------------

export type ContentPackPreview = {
  lesson?: {
    title: string;
    sessionTitles: string[];
    sessionCount: number;
  };
  flashcard?: {
    totalCards: number;
    sampleQuestions: string[];
  };
  quiz?: {
    title: string;
    totalQuestions: number;
    topics: string[];
  };
  review_summary?: {
    title: string;
    overview: string;
    estimatedReadingMinutes: number;
  };
};

export type PublicContentPackItemSummary = {
  id: ContentPackId;
  title: string;
  description: string | null;
  subject: string | null;
  creator: {
    id: string;
    name: string;
  };
  usage_count: number;
  stats: {
    session_count: number;
    flashcard_count: number;
    quiz_question_count: number;
    estimated_reading_minutes: number;
  };
  published_at: string;
};

export type PublicContentPackDetailResource = {
  id: ContentPackId;
  title: string;
  description: string | null;
  subject: string | null;
  creator: {
    id: string;
    name: string;
  };
  usage_count: number;
  stats: {
    session_count: number;
    flashcard_count: number;
    quiz_question_count: number;
    estimated_reading_minutes: number;
  };
  published_at: string;
  preview: ContentPackPreview;
};

// ---------------------------------------------------------------------------
// Helper Utilities for Metadata and Preview Calculation
// ---------------------------------------------------------------------------

/**
 * Computes high-level metadata statistics from the payload items at publish time.
 */
export function computeContentPackMetadata(items: {
  lesson?: LessonPayload;
  flashcard?: FlashcardPayload;
  quiz?: QuizPayload;
  review_summary?: ReviewSummaryPayload;
}): ContentPackMetadata {
  let sessionCount = 0;
  if (items.lesson) {
    if (Array.isArray(items.lesson.sessions) && items.lesson.sessions.length > 0) {
      sessionCount = items.lesson.sessions.length;
    } else if (Array.isArray(items.lesson.outline) && items.lesson.outline.length > 0) {
      sessionCount = items.lesson.outline.length;
    } else {
      sessionCount = 1;
    }
  }

  let flashcardCount = 0;
  if (items.flashcard) {
    if (Array.isArray(items.flashcard.cards)) {
      flashcardCount = items.flashcard.cards.length;
    } else if ((items.flashcard as any).flashcards && Array.isArray((items.flashcard as any).flashcards)) {
      flashcardCount = (items.flashcard as any).flashcards.length;
    } else if (items.flashcard.question) {
      flashcardCount = 1;
    }
  }

  let quizQuestionCount = 0;
  if (items.quiz) {
    if (Array.isArray(items.quiz.questions)) {
      quizQuestionCount = items.quiz.questions.length;
    } else if ((items.quiz as any).question) {
      quizQuestionCount = 1;
    }
  }

  let estimatedReadingMinutes = 0;
  if (items.review_summary) {
    if (typeof items.review_summary.estimatedReadingMinutes === "number") {
      estimatedReadingMinutes = items.review_summary.estimatedReadingMinutes;
    } else {
      estimatedReadingMinutes = 12;
    }
  } else if (items.lesson) {
    if (Array.isArray(items.lesson.sessions) && items.lesson.sessions.length > 0) {
      estimatedReadingMinutes = items.lesson.sessions.reduce(
        (sum, s) => sum + (s.estimatedMinutes ?? 10),
        0,
      );
    } else {
      estimatedReadingMinutes = 10;
    }
  }

  return {
    sessionCount,
    flashcardCount,
    quizQuestionCount,
    estimatedReadingMinutes,
  };
}

/**
 * Generates structured public preview safely from the 4 payload snapshots.
 */
export function buildContentPackPreview(
  items: ContentPackItemRecord[],
): ContentPackPreview {
  const preview: ContentPackPreview = {};

  for (const item of items) {
    const payload = item.payloadSnapshot;
    if (!payload) continue;

    if (item.contentType === "lesson" && payload.kind === "lesson") {
      const lesson = payload as LessonPayload;
      const sessionTitles: string[] = [];
      if (Array.isArray(lesson.sessions) && lesson.sessions.length > 0) {
        for (const s of lesson.sessions) {
          if (s.title) sessionTitles.push(s.title);
        }
      } else if (Array.isArray(lesson.outline) && lesson.outline.length > 0) {
        for (const o of lesson.outline) {
          if (o.title) sessionTitles.push(o.title);
        }
      }

      preview.lesson = {
        title: lesson.title || lesson.moduleTitle || "درسنامه آموزشی",
        sessionTitles,
        sessionCount: sessionTitles.length > 0 ? sessionTitles.length : 1,
      };
    } else if (item.contentType === "flashcard" && payload.kind === "flashcard") {
      const fc = payload as FlashcardPayload;
      const sampleQuestions: string[] = [];
      let totalCards = 0;

      const rawCards =
        Array.isArray(fc.cards) && fc.cards.length > 0
          ? fc.cards
          : Array.isArray((fc as any).flashcards) && (fc as any).flashcards.length > 0
          ? (fc as any).flashcards
          : (fc as any).question
          ? [fc]
          : [];

      totalCards = rawCards.length;
      for (let i = 0; i < Math.min(3, rawCards.length); i++) {
        const q = rawCards[i].question || rawCards[i].front;
        if (q) sampleQuestions.push(q);
      }

      preview.flashcard = {
        totalCards,
        sampleQuestions,
      };
    } else if (item.contentType === "quiz" && payload.kind === "quiz") {
      const qz = payload as QuizPayload;
      const rawQuestions = Array.isArray(qz.questions)
        ? qz.questions
        : (qz as any).question
        ? [qz as any]
        : [];
      const topicsSet = new Set<string>();
      if ((qz as any).topic) topicsSet.add((qz as any).topic);

      for (const q of rawQuestions) {
        if ((q as any).topic) topicsSet.add((q as any).topic);
        if (q.category) topicsSet.add(q.category);
      }

      preview.quiz = {
        title: qz.title || "آزمون ارزیابی",
        totalQuestions: rawQuestions.length,
        topics: Array.from(topicsSet).slice(0, 5),
      };
    } else if (
      item.contentType === "review_summary" &&
      payload.kind === "review_summary"
    ) {
      const rs = payload as ReviewSummaryPayload;
      preview.review_summary = {
        title: rs.title || "خلاصه مروری",
        overview: rs.overview || "",
        estimatedReadingMinutes: rs.estimatedReadingMinutes || 12,
      };
    }
  }

  return preview;
}
