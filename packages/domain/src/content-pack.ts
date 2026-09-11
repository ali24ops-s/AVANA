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

export type ContentPackStatus =
  | "pending_review"
  | "approved"
  | "published"
  | "rejected"
  | "archived";

export const CONTENT_PACK_STATUSES: readonly ContentPackStatus[] = [
  "pending_review",
  "approved",
  "published",
  "rejected",
  "archived",
];

export function isContentPackStatus(v: string): v is ContentPackStatus {
  return (CONTENT_PACK_STATUSES as readonly string[]).includes(v);
}

export type ContentPackAccessType = "free" | "paid";

export const CONTENT_PACK_ACCESS_TYPES: readonly ContentPackAccessType[] = [
  "free",
  "paid",
];

export function isContentPackAccessType(v: string): v is ContentPackAccessType {
  return (CONTENT_PACK_ACCESS_TYPES as readonly string[]).includes(v);
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
// Content Pack Pricing & Metadata
// ---------------------------------------------------------------------------

export type ContentPackPricing = {
  is_free: boolean;
  price: number;
  currency: string;
  product_id: string | null;
};

export type ContentPackMetadata = {
  sessionCount?: number;
  flashcardCount?: number;
  quizQuestionCount?: number;
  estimatedReadingMinutes?: number;
  accessType?: ContentPackAccessType;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
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
  pricing?: ContentPackPricing;
  access_type?: ContentPackAccessType;
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
  pricing?: ContentPackPricing;
  access_type?: ContentPackAccessType;
};

// ---------------------------------------------------------------------------
// Course Chapter Packages Domain Types
// ---------------------------------------------------------------------------

export type ChapterPackageCompleteness = "complete" | "partial" | "empty";

export type ChapterPackageContentsSummary = {
  lesson: {
    exists: boolean;
    count: number;
    estimatedMinutes: number;
    title?: string;
    lessonId?: string;
  };
  summary: {
    exists: boolean;
    title?: string;
    overview?: string;
    estimatedMinutes?: number;
  };
  flashcards: {
    exists: boolean;
    count: number;
  };
  quiz: {
    exists: boolean;
    quizId?: string;
    title?: string;
    questionCount: number;
  };
};

export type ChapterPackageItem = {
  id: string;
  moduleId: string;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string | null;
  subject: string | null;
  sortOrder: number;
  documentId: string | null;
  contentPackId: string | null;
  contents: ChapterPackageContentsSummary;
  stats: {
    totalItems: number;
    lessonCount: number;
    flashcardCount: number;
    quizQuestionCount: number;
    estimatedReadingMinutes: number;
  };
  completeness: ChapterPackageCompleteness;
  access: import("./commerce.js").ResourceAccessSummary;
  purchase: import("./commerce.js").ResourcePurchaseSummary;
  preview?: import("./preview-resolver.js").ContentPreviewMetadata;
  createdAt: string;
  updatedAt: string;
};

export type CourseWithChapterPackages = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  isOfficial: boolean;
  totalPackages: number;
  packages: ChapterPackageItem[];
  access?: import("./commerce.js").ResourceAccessSummary;
  purchase?: import("./commerce.js").ResourcePurchaseSummary;
  createdAt: string;
  updatedAt: string;
};

export type CoursePackagesResponse = {
  request_id: string;
  courses: CourseWithChapterPackages[];
  pagination: {
    page: number;
    limit: number;
    total_courses: number;
    total_packages: number;
  };
};

// ---------------------------------------------------------------------------
// Helper Utilities for Metadata and Preview Calculation
// ---------------------------------------------------------------------------





export type AdminContentPackPreview = {
  lesson?: {
    title: string;
    sessionCount: number;
    estimatedMinutes: number;
    sessions: Array<{
      title: string;
      contentMarkdown?: string;
      estimatedMinutes: number;
    }>;
    contentMarkdown?: string;
    outline?: Array<{
      title: string;
      description?: string;
    }>;
    hasCanonicalSessions?: boolean;
  };
  flashcard?: {
    title: string;
    totalCards: number;
    cards: Array<{
      front: string;
      back: string;
      explanation?: string | null;
      difficulty?: string;
      cardType?: string;
    }>;
  };
  quiz?: {
    title: string;
    totalQuestions: number;
    questions: Array<{
      question: string;
      choices: string[];
      correctAnswer: string;
      explanation?: string | null;
      difficulty?: string;
      category?: string;
    }>;
  };
  review_summary?: {
    title: string;
    summary: string;
    overview: string;
    estimatedReadingMinutes?: number;
    sections?: Array<{
      title: string;
      keyPoints?: string[];
    }>;
  };
};

/**
 * Computes high-level metadata statistics from the payload items at publish time.
 * Canonical data takes priority; fallbacks ensure resilience across historical schemas.
 */
export function computeContentPackMetadata(items: {
  lesson?: LessonPayload | Record<string, unknown>;
  flashcard?: FlashcardPayload | Record<string, unknown>;
  quiz?: QuizPayload | Record<string, unknown>;
  review_summary?: ReviewSummaryPayload | Record<string, unknown>;
}): ContentPackMetadata {
  let sessionCount = 0;
  if (items.lesson) {
    const rawLesson = items.lesson as Record<string, unknown>;
    const sessions = Array.isArray(rawLesson.sessions) ? rawLesson.sessions : undefined;
    const outline = Array.isArray(rawLesson.outline) ? rawLesson.outline : undefined;

    if (sessions && sessions.length > 0) {
      sessionCount = sessions.length;
    } else if (outline && outline.length > 0) {
      sessionCount = outline.length;
    } else if (
      rawLesson.contentMarkdown ||
      rawLesson.content_markdown ||
      rawLesson.markdown ||
      rawLesson.text ||
      rawLesson.body
    ) {
      sessionCount = 1;
    }
  }

  let flashcardCount = 0;
  if (items.flashcard) {
    const fc = items.flashcard as Record<string, unknown>;
    const cards = Array.isArray(fc.cards)
      ? fc.cards
      : Array.isArray(fc.flashcards)
      ? fc.flashcards
      : Array.isArray(fc.items)
      ? fc.items
      : undefined;

    if (cards) {
      flashcardCount = cards.length;
    } else if (fc.question || fc.front) {
      flashcardCount = 1;
    }
  }

  let quizQuestionCount = 0;
  if (items.quiz) {
    const qz = items.quiz as Record<string, unknown>;
    const questions = Array.isArray(qz.questions)
      ? qz.questions
      : Array.isArray(qz.quizQuestions)
      ? qz.quizQuestions
      : Array.isArray(qz.items)
      ? qz.items
      : undefined;

    if (questions) {
      quizQuestionCount = questions.length;
    } else if (qz.question) {
      quizQuestionCount = 1;
    }
  }

  let estimatedReadingMinutes = 0;
  if (items.review_summary) {
    const rs = items.review_summary as Record<string, unknown>;
    if (typeof rs.estimatedReadingMinutes === "number") {
      estimatedReadingMinutes = rs.estimatedReadingMinutes;
    } else if (typeof rs.estimated_reading_minutes === "number") {
      estimatedReadingMinutes = rs.estimated_reading_minutes;
    } else {
      estimatedReadingMinutes = 12;
    }
  } else if (items.lesson) {
    const rawLesson = items.lesson as Record<string, unknown>;
    const sessions = Array.isArray(rawLesson.sessions) ? rawLesson.sessions : undefined;
    if (sessions && sessions.length > 0) {
      estimatedReadingMinutes = sessions.reduce(
        (sum: number, s: any) => sum + (s?.estimatedMinutes ?? s?.estimated_minutes ?? 10),
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
 * Generates structured public preview safely from the payload snapshots.
 */
export function buildContentPackPreview(
  items: ContentPackItemRecord[],
): ContentPackPreview {
  const preview: ContentPackPreview = {};

  for (const item of items) {
    const payload = item.payloadSnapshot as Record<string, any>;
    if (!payload) continue;

    if (item.contentType === "lesson") {
      const sessionTitles: string[] = [];
      const rawSessions = Array.isArray(payload.sessions) ? payload.sessions : undefined;
      const rawOutline = Array.isArray(payload.outline) ? payload.outline : undefined;

      if (rawSessions && rawSessions.length > 0) {
        for (let i = 0; i < rawSessions.length; i++) {
          const s = rawSessions[i];
          const title = s?.title || s?.name || s?.sessionTitle || `جلسه ${i + 1}`;
          sessionTitles.push(title);
        }
      } else if (rawOutline && rawOutline.length > 0) {
        for (let i = 0; i < rawOutline.length; i++) {
          const o = rawOutline[i];
          const title = o?.title || o?.name || `فصل ${i + 1}`;
          sessionTitles.push(title);
        }
      }

      preview.lesson = {
        title: payload.title || payload.moduleTitle || payload.module_title || "درسنامه آموزشی",
        sessionTitles,
        sessionCount: sessionTitles.length > 0 ? sessionTitles.length : 1,
      };
    } else if (item.contentType === "flashcard") {
      const sampleQuestions: string[] = [];
      const rawCards = Array.isArray(payload.cards)
        ? payload.cards
        : Array.isArray(payload.flashcards)
        ? payload.flashcards
        : Array.isArray(payload.items)
        ? payload.items
        : payload.question || payload.front
        ? [{ question: payload.question, front: payload.front }]
        : [];

      const totalCards = rawCards.length;
      for (let i = 0; i < Math.min(3, rawCards.length); i++) {
        const itemCard = rawCards[i];
        const q = itemCard ? (itemCard.question || itemCard.front || itemCard.prompt) : undefined;
        if (q) sampleQuestions.push(q);
      }

      preview.flashcard = {
        totalCards,
        sampleQuestions,
      };
    } else if (item.contentType === "quiz") {
      const rawQuestions = Array.isArray(payload.questions)
        ? payload.questions
        : Array.isArray(payload.quizQuestions)
        ? payload.quizQuestions
        : Array.isArray(payload.items)
        ? payload.items
        : payload.question
        ? [{ question: payload.question, topic: payload.topic, category: payload.category }]
        : [];

      const topicsSet = new Set<string>();
      if (payload.topic) topicsSet.add(payload.topic);

      for (const q of rawQuestions) {
        if (q.topic) topicsSet.add(q.topic);
        if (q.category) topicsSet.add(q.category);
      }

      preview.quiz = {
        title: payload.title || "آزمون ارزیابی",
        totalQuestions: rawQuestions.length,
        topics: Array.from(topicsSet).slice(0, 5),
      };
    } else if (item.contentType === "review_summary") {
      preview.review_summary = {
        title: payload.title || "خلاصه مروری",
        overview: payload.overview || payload.summary || "",
        estimatedReadingMinutes:
          payload.estimatedReadingMinutes || payload.estimated_reading_minutes || 12,
      };
    }
  }

  return preview;
}

/**
 * Generates full structured review preview with all sessions, cards, and questions
 * for the authenticated Admin moderation review workspace.
 *
 * Canonical Principle:
 * 1. Canonical data fields (e.g. sessions array) always take top priority.
 * 2. Fallbacks (e.g. outline, single master markdown) ensure full reviewability without creating fake DB records.
 * 3. Never produces empty states when real educational content exists in the payload.
 */
export function buildAdminContentPackPreview(
  items: ContentPackItemRecord[],
): AdminContentPackPreview {
  const preview: AdminContentPackPreview = {};

  for (const item of items) {
    const payload = item.payloadSnapshot as Record<string, any>;
    if (!payload) continue;

    if (item.contentType === "lesson") {
      const rawTitle =
        payload.title ||
        payload.moduleTitle ||
        payload.module_title ||
        payload.name ||
        "درسنامه آموزشی";

      const masterMarkdown =
        typeof payload.contentMarkdown === "string"
          ? payload.contentMarkdown
          : typeof payload.content_markdown === "string"
          ? payload.content_markdown
          : typeof payload.markdown === "string"
          ? payload.markdown
          : typeof payload.content === "string"
          ? payload.content
          : typeof payload.text === "string"
          ? payload.text
          : typeof payload.body === "string"
          ? payload.body
          : "";

      const rawOutline = Array.isArray(payload.outline) ? payload.outline : undefined;
      const outline = rawOutline
        ? rawOutline.map((o: any, idx: number) => ({
            title: o?.title || o?.name || `بخش ${idx + 1}`,
            description: o?.description || o?.desc || undefined,
          }))
        : undefined;

      const sessions: Array<{
        title: string;
        contentMarkdown?: string;
        estimatedMinutes: number;
      }> = [];

      let hasCanonicalSessions = false;

      if (Array.isArray(payload.sessions) && payload.sessions.length > 0) {
        hasCanonicalSessions = true;
        for (let i = 0; i < payload.sessions.length; i++) {
          const s = payload.sessions[i];
          const sTitle = s?.title || s?.name || s?.sessionTitle || s?.heading || `جلسه ${i + 1}`;
          const sContent =
            s?.contentMarkdown ||
            s?.content_markdown ||
            s?.markdown ||
            s?.content ||
            s?.text ||
            s?.body ||
            s?.description ||
            (payload.sessions.length === 1 && masterMarkdown ? masterMarkdown : "");
          const sMinutes =
            typeof s?.estimatedMinutes === "number"
              ? s.estimatedMinutes
              : typeof s?.estimated_minutes === "number"
              ? s.estimated_minutes
              : 10;

          sessions.push({
            title: sTitle,
            contentMarkdown: sContent,
            estimatedMinutes: sMinutes,
          });
        }
      } else if (rawOutline && rawOutline.length > 0) {
        hasCanonicalSessions = false;
        for (let i = 0; i < rawOutline.length; i++) {
          const o = rawOutline[i];
          const oTitle = o?.title || o?.name || `فصل ${i + 1}`;
          const oContent = o?.description || masterMarkdown || "";
          sessions.push({
            title: oTitle,
            contentMarkdown: oContent,
            estimatedMinutes: 10,
          });
        }
      } else if (masterMarkdown.trim().length > 0) {
        hasCanonicalSessions = false;
        sessions.push({
          title: rawTitle,
          contentMarkdown: masterMarkdown,
          estimatedMinutes: 10,
        });
      }

      const estimatedMinutes = sessions.reduce(
        (sum, s) => sum + (s.estimatedMinutes || 10),
        0,
      );

      preview.lesson = {
        title: rawTitle,
        sessionCount: sessions.length,
        estimatedMinutes: estimatedMinutes || 10,
        sessions,
        contentMarkdown: masterMarkdown || undefined,
        outline,
        hasCanonicalSessions,
      };
    } else if (item.contentType === "flashcard") {
      const cards: Array<{
        front: string;
        back: string;
        explanation?: string | null;
        difficulty?: string;
        cardType?: string;
      }> = [];

      const rawCards = Array.isArray(payload.cards)
        ? payload.cards
        : Array.isArray(payload.flashcards)
        ? payload.flashcards
        : Array.isArray(payload.items)
        ? payload.items
        : payload.question || payload.front
        ? [payload]
        : [];

      for (const c of rawCards) {
        cards.push({
          front: c.front || c.question || c.prompt || c.term || "",
          back: c.back || c.answer || c.response || c.definition || "",
          explanation: c.explanation || c.expl || null,
          difficulty: c.difficulty || undefined,
          cardType: c.cardType || c.card_type || c.type || undefined,
        });
      }

      preview.flashcard = {
        title: payload.title || payload.name || "فلش‌کارت‌های آموزشی",
        totalCards: cards.length,
        cards,
      };
    } else if (item.contentType === "quiz") {
      const questions: Array<{
        question: string;
        choices: string[];
        correctAnswer: string;
        explanation?: string | null;
        difficulty?: string;
        category?: string;
      }> = [];

      const rawQuestions = Array.isArray(payload.questions)
        ? payload.questions
        : Array.isArray(payload.quizQuestions)
        ? payload.quizQuestions
        : Array.isArray(payload.items)
        ? payload.items
        : payload.question
        ? [payload]
        : [];

      for (const q of rawQuestions) {
        const rawChoices = Array.isArray(q.choices)
          ? q.choices
          : Array.isArray(q.options)
          ? q.options
          : [];
        const rawAns = q.correctAnswer ?? q.correct_answer ?? q.answer ?? q.correctOption ?? "";
        questions.push({
          question: q.question || q.prompt || q.title || "سوال تستی",
          choices: rawChoices,
          correctAnswer: typeof rawAns === "string" ? rawAns : String(rawAns ?? ""),
          explanation: q.explanation || q.expl || null,
          difficulty: q.difficulty || undefined,
          category: q.category || q.topic || undefined,
        });
      }

      preview.quiz = {
        title: payload.title || payload.name || "آزمون ارزیابی",
        totalQuestions: questions.length,
        questions,
      };
    } else if (item.contentType === "review_summary") {
      const summaryText =
        payload.summary ||
        payload.overview ||
        payload.content ||
        payload.contentMarkdown ||
        payload.content_markdown ||
        (Array.isArray(payload.sections)
          ? payload.sections
              .map((s: any) => `${s.title}:\n${(s.keyPoints || s.key_points || []).join("\n")}`)
              .join("\n\n")
          : "");

      const rawSections = Array.isArray(payload.sections) ? payload.sections : undefined;
      const sections = rawSections
        ? rawSections.map((s: any) => ({
            title: s.title || "بخش",
            keyPoints: Array.isArray(s.keyPoints)
              ? s.keyPoints
              : Array.isArray(s.key_points)
              ? s.key_points
              : [],
          }))
        : undefined;

      preview.review_summary = {
        title: payload.title || payload.name || "خلاصه مروری",
        summary: summaryText,
        overview: payload.overview || summaryText,
        estimatedReadingMinutes:
          payload.estimatedReadingMinutes || payload.estimated_reading_minutes || 12,
        sections,
      };
    }
  }

  return preview;
}
