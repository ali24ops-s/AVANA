/**
 * Course Publication domain primitives and snapshot types.
 *
 * A Course Publication is an immutable snapshot of a user-generated course
 * (chapters, lessons, flashcards, quizzes, review summary) submitted for
 * Avana Library distribution and admin review.
 *
 * Strict Privacy & Architectural Invariants:
 * 1. IMMUTABLE SNAPSHOT: Subsequent edits to private courses do NOT alter published versions.
 * 2. ZERO PRIVATE DATA EXPOSURE: Raw source documents, storage keys, and private attachments
 *    are NEVER included in the publication snapshot.
 * 3. ONLY ACCEPTED CONTENT: Only content in accepted/published status is included in the snapshot.
 * 4. SINGLE SOURCE OF TRUTH: Commerce products govern pricing and access for paid courses.
 */

import type {
  CourseId,
  CoursePublicationId,
  OrganizationId,
  UserId,
} from "./ids.js";

// ---------------------------------------------------------------------------
// Course Publication Status & Access
// ---------------------------------------------------------------------------

export type CoursePublicationStatus =
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected"
  | "archived";

export const COURSE_PUBLICATION_STATUSES: readonly CoursePublicationStatus[] = [
  "pending_review",
  "changes_requested",
  "approved",
  "published",
  "rejected",
  "archived",
];

export function isCoursePublicationStatus(v: string): v is CoursePublicationStatus {
  return (COURSE_PUBLICATION_STATUSES as readonly string[]).includes(v);
}

export type CoursePublicationAccessType = "free" | "paid";

export const COURSE_PUBLICATION_ACCESS_TYPES: readonly CoursePublicationAccessType[] = [
  "free",
  "paid",
];

export function isCoursePublicationAccessType(
  v: string,
): v is CoursePublicationAccessType {
  return (COURSE_PUBLICATION_ACCESS_TYPES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Snapshot Tree Types (Sanitized & Privacy-Safe)
// ---------------------------------------------------------------------------

export interface CoursePublicationLessonSnapshot {
  id: string;
  title: string;
  contentMarkdown: string;
  sortOrder: number;
  estimatedMinutes?: number | null;
}

export interface CoursePublicationFlashcardSnapshot {
  front: string;
  back: string;
  explanation?: string | null;
  difficulty?: string;
}

export interface CoursePublicationQuizQuestionSnapshot {
  question: string;
  choices: string[];
  correctAnswer: string;
  explanation?: string | null;
  difficulty?: string;
  category?: string;
}

export interface CoursePublicationQuizSnapshot {
  title: string;
  questions: CoursePublicationQuizQuestionSnapshot[];
}

export interface CoursePublicationSummarySnapshot {
  title: string;
  overview?: string;
  summary?: string;
  estimatedReadingMinutes?: number;
  sections?: Array<{
    title: string;
    keyPoints?: string[];
  }>;
}

export interface CoursePublicationChapterSnapshot {
  id: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  lessons: CoursePublicationLessonSnapshot[];
  flashcards?: CoursePublicationFlashcardSnapshot[];
  quiz?: CoursePublicationQuizSnapshot | null;
  reviewSummary?: CoursePublicationSummarySnapshot | null;
}

export interface CoursePublicationSnapshot {
  courseId: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  chapters: CoursePublicationChapterSnapshot[];
  stats: {
    chapterCount: number;
    lessonCount: number;
    flashcardCount: number;
    quizQuestionCount: number;
    estimatedReadingMinutes: number;
  };
}

// ---------------------------------------------------------------------------
// Course Publication Pricing & Metadata
// ---------------------------------------------------------------------------

export type CoursePublicationPricing = {
  is_free: boolean;
  price: number;
  currency: string;
  product_id: string | null;
};

export interface CoursePublicationDiffSummary {
  addedLessons: Array<{ id: string; title: string; chapterTitle: string }>;
  updatedLessons: Array<{
    id: string;
    title: string;
    chapterTitle: string;
    contentChanged: boolean;
    titleChanged: boolean;
  }>;
  deletedLessons: Array<{ id: string; title: string; chapterTitle: string }>;
  addedChapters: Array<{ id: string; title: string }>;
  updatedChapters: Array<{ id: string; title: string }>;
  deletedChapters: Array<{ id: string; title: string }>;
  courseInfoChanged: {
    titleChanged: boolean;
    descriptionChanged: boolean;
    subjectChanged: boolean;
    oldTitle?: string;
    newTitle?: string;
  };
  totalChanges: number;
}

export type CoursePublicationMetadata = {
  accessType?: CoursePublicationAccessType;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  isUpdate?: boolean;
  baseVersion?: number;
  basePublicationId?: string | null;
  diffSummary?: CoursePublicationDiffSummary | null;
  reviewNotes?: string | null;
  requestType?: "initial" | "update";
  stats?: {
    chapterCount: number;
    lessonCount: number;
    flashcardCount: number;
    quizQuestionCount: number;
    estimatedReadingMinutes: number;
  };
  [key: string]: unknown;
};

export type CoursePublicationRecord = {
  id: CoursePublicationId;
  courseId: CourseId;
  creatorUserId: UserId | null;
  organizationId: OrganizationId | null;
  title: string;
  description: string | null;
  subject: string | null;
  version: number;
  status: CoursePublicationStatus;
  publishedAt: string | null;
  metadata: CoursePublicationMetadata;
  snapshot: CoursePublicationSnapshot;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// ---------------------------------------------------------------------------
// Helpers & Invariant Computations
// ---------------------------------------------------------------------------

export function computeCoursePublicationStats(
  chapters: CoursePublicationChapterSnapshot[],
): {
  chapterCount: number;
  lessonCount: number;
  flashcardCount: number;
  quizQuestionCount: number;
  estimatedReadingMinutes: number;
} {
  let lessonCount = 0;
  let flashcardCount = 0;
  let quizQuestionCount = 0;
  let estimatedReadingMinutes = 0;

  for (const ch of chapters) {
    lessonCount += ch.lessons.length;
    for (const l of ch.lessons) {
      estimatedReadingMinutes += l.estimatedMinutes || 5;
    }
    if (ch.flashcards) {
      flashcardCount += ch.flashcards.length;
    }
    if (ch.quiz && ch.quiz.questions) {
      quizQuestionCount += ch.quiz.questions.length;
    }
    if (ch.reviewSummary?.estimatedReadingMinutes) {
      estimatedReadingMinutes += ch.reviewSummary.estimatedReadingMinutes;
    }
  }

  return {
    chapterCount: chapters.length,
    lessonCount,
    flashcardCount,
    quizQuestionCount,
    estimatedReadingMinutes: Math.max(1, estimatedReadingMinutes),
  };
}

export function validateCoursePublicationEligibility(
  chapters: CoursePublicationChapterSnapshot[],
): { eligible: boolean; reason?: string } {
  if (!chapters || chapters.length === 0) {
    return {
      eligible: false,
      reason: "دوره باید حداقل دارای یک فصل باشد.",
    };
  }

  let totalLessons = 0;
  let totalFlashcards = 0;
  let totalQuizzes = 0;

  for (const ch of chapters) {
    totalLessons += ch.lessons.length;
    if (ch.flashcards && ch.flashcards.length > 0) totalFlashcards += ch.flashcards.length;
    if (ch.quiz && ch.quiz.questions && ch.quiz.questions.length > 0) totalQuizzes += 1;
  }

  if (totalLessons === 0 && totalFlashcards === 0 && totalQuizzes === 0) {
    return {
      eligible: false,
      reason: "دوره باید حداقل دارای یک درس یا محتوای آموزشی تاییدشده باشد.",
    };
  }

  return { eligible: true };
}

export function computePublicationDiff(
  baseSnapshot: CoursePublicationSnapshot | null | undefined,
  newSnapshot: CoursePublicationSnapshot,
): CoursePublicationDiffSummary {
  const result: CoursePublicationDiffSummary = {
    addedLessons: [],
    updatedLessons: [],
    deletedLessons: [],
    addedChapters: [],
    updatedChapters: [],
    deletedChapters: [],
    courseInfoChanged: {
      titleChanged: false,
      descriptionChanged: false,
      subjectChanged: false,
    },
    totalChanges: 0,
  };

  if (!baseSnapshot) {
    // Initial publication — all chapters and lessons are newly added
    for (const ch of newSnapshot.chapters) {
      result.addedChapters.push({ id: ch.id, title: ch.title });
      for (const l of ch.lessons) {
        result.addedLessons.push({
          id: l.id,
          title: l.title,
          chapterTitle: ch.title,
        });
      }
    }
    result.totalChanges =
      result.addedChapters.length + result.addedLessons.length;
    return result;
  }

  // Compare course info
  const titleChanged = baseSnapshot.title !== newSnapshot.title;
  const descriptionChanged =
    (baseSnapshot.description ?? "").trim() !==
    (newSnapshot.description ?? "").trim();
  const subjectChanged =
    (baseSnapshot.subject ?? "").trim() !== (newSnapshot.subject ?? "").trim();

  result.courseInfoChanged = {
    titleChanged,
    descriptionChanged,
    subjectChanged,
    oldTitle: titleChanged ? baseSnapshot.title : undefined,
    newTitle: titleChanged ? newSnapshot.title : undefined,
  };

  // Build maps for chapters
  const baseChapterMap = new Map<string, CoursePublicationChapterSnapshot>();
  for (const ch of baseSnapshot.chapters) {
    baseChapterMap.set(ch.id, ch);
  }

  const newChapterMap = new Map<string, CoursePublicationChapterSnapshot>();
  for (const ch of newSnapshot.chapters) {
    newChapterMap.set(ch.id, ch);
  }

  // Compare chapters
  for (const ch of newSnapshot.chapters) {
    const baseCh = baseChapterMap.get(ch.id);
    if (!baseCh) {
      result.addedChapters.push({ id: ch.id, title: ch.title });
    } else if (baseCh.title !== ch.title) {
      result.updatedChapters.push({ id: ch.id, title: ch.title });
    }
  }

  for (const baseCh of baseSnapshot.chapters) {
    if (!newChapterMap.has(baseCh.id)) {
      result.deletedChapters.push({ id: baseCh.id, title: baseCh.title });
    }
  }

  // Build maps for lessons (persistent lesson IDs)
  const baseLessonMap = new Map<
    string,
    { lesson: CoursePublicationLessonSnapshot; chapterTitle: string }
  >();
  for (const ch of baseSnapshot.chapters) {
    for (const l of ch.lessons) {
      baseLessonMap.set(l.id, { lesson: l, chapterTitle: ch.title });
    }
  }

  const newLessonMap = new Map<
    string,
    { lesson: CoursePublicationLessonSnapshot; chapterTitle: string }
  >();
  for (const ch of newSnapshot.chapters) {
    for (const l of ch.lessons) {
      newLessonMap.set(l.id, { lesson: l, chapterTitle: ch.title });
    }
  }

  // Compare lessons
  for (const [newId, newEntry] of newLessonMap.entries()) {
    const baseEntry = baseLessonMap.get(newId);
    if (!baseEntry) {
      result.addedLessons.push({
        id: newId,
        title: newEntry.lesson.title,
        chapterTitle: newEntry.chapterTitle,
      });
    } else {
      const titleChanged =
        baseEntry.lesson.title.trim() !== newEntry.lesson.title.trim();
      const contentChanged =
        (baseEntry.lesson.contentMarkdown || "").trim() !==
        (newEntry.lesson.contentMarkdown || "").trim();

      if (titleChanged || contentChanged) {
        result.updatedLessons.push({
          id: newId,
          title: newEntry.lesson.title,
          chapterTitle: newEntry.chapterTitle,
          titleChanged,
          contentChanged,
        });
      }
    }
  }

  for (const [baseId, baseEntry] of baseLessonMap.entries()) {
    if (!newLessonMap.has(baseId)) {
      result.deletedLessons.push({
        id: baseId,
        title: baseEntry.lesson.title,
        chapterTitle: baseEntry.chapterTitle,
      });
    }
  }

  result.totalChanges =
    result.addedChapters.length +
    result.updatedChapters.length +
    result.deletedChapters.length +
    result.addedLessons.length +
    result.updatedLessons.length +
    result.deletedLessons.length +
    (titleChanged ? 1 : 0) +
    (descriptionChanged ? 1 : 0) +
    (subjectChanged ? 1 : 0);

  return result;
}
