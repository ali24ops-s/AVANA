/**
 * Study store abstractions (PR6-7).
 *
 * Decouples flashcard review and quiz attempt data access from the database.
 * Follows the existing store pattern.
 */

import type {
  CourseId,
  DocumentId,
  FlashcardId,
  GeneratedContentId,
  OrganizationId,
  QuizAttemptId,
  QuizId,
  QuizQuestionId,
  UserId,
} from "@avana/domain";
import type {
  FlashcardRating,
  QuizAttemptRecord,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type FlashcardRecord = {
  id: FlashcardId;
  organizationId: OrganizationId;
  courseId: CourseId;
  documentId: DocumentId;
  generatedContentId: GeneratedContentId | null;
  question: string;
  answer: string;
  explanation: string | null;
  cardType: string;
  difficulty: string;
  /** When the card is next due for review (ISO string). Defaults to now. */
  dueAt: string;
  /** Interval in days produced by the last review. Defaults to 0. */
  intervalDays: number;
  /** Ease factor multiplier (FSRS-inspired). Defaults to 2.5. */
  easeFactor: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FlashcardReviewRecord = {
  id: string;
  flashcardId: FlashcardId;
  userId: UserId;
  rating: FlashcardRating;
  reviewedAt: string;
  reactionMs: number | null;
};

export type QuizRecord = {
  id: QuizId;
  organizationId: OrganizationId;
  courseId: CourseId;
  documentId: DocumentId;
  title: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type QuizQuestionRecord = {
  id: QuizQuestionId;
  quizId: QuizId;
  generatedContentId: GeneratedContentId | null;
  question: string;
  questionType: string;
  choices: string[] | null;
  correctAnswer: unknown;
  explanation: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Scheduling update payload
// ---------------------------------------------------------------------------

/**
 * Fields written back to a flashcard row after a review.
 * Called via FlashcardStore.updateSchedule().
 */
export type FlashcardScheduleUpdate = {
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Store interfaces
// ---------------------------------------------------------------------------

export interface FlashcardStore {
  findByIdForOrganization(
    id: FlashcardId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord | undefined>;

  listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord[]>;

  create(record: FlashcardRecord): Promise<FlashcardRecord>;

  createMany(records: FlashcardRecord[]): Promise<FlashcardRecord[]>;

  /**
   * Persist the updated spaced-repetition scheduling state on a flashcard
   * after a review. Updates due_at, interval_days, ease_factor.
   */
  updateSchedule(
    id: FlashcardId,
    schedule: FlashcardScheduleUpdate,
  ): Promise<void>;

  /**
   * Find a flashcard by its source generated content ID.
   * Used for idempotency check during materialization.
   */
  findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<FlashcardRecord | undefined>;

  /**
   * Soft-delete all flashcards for a document.
   */
  deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void>;
}

export interface FlashcardReviewStore {
  create(record: FlashcardReviewRecord): Promise<FlashcardReviewRecord>;

  listByUserAndFlashcard(
    userId: UserId,
    flashcardId: FlashcardId,
  ): Promise<FlashcardReviewRecord[]>;

  listByUser(userId: UserId): Promise<FlashcardReviewRecord[]>;

  /** Count total review events for a user (for analytics). */
  countByUser(userId: UserId): Promise<number>;
}

export interface QuizStore {
  findByIdForOrganization(
    id: QuizId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord | undefined>;

  listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord[]>;

  create(record: QuizRecord): Promise<QuizRecord>;

  /**
   * Find a quiz by its source generated content ID.
   * Used for idempotency check during materialization.
   */
  findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<QuizRecord | undefined>;

  /**
   * Soft-delete all quizzes for a document.
   */
  deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void>;
}

export interface QuizQuestionStore {
  listByQuiz(quizId: QuizId): Promise<QuizQuestionRecord[]>;
  createMany(records: QuizQuestionRecord[]): Promise<QuizQuestionRecord[]>;
}

export interface QuizAttemptStore {
  findById(id: QuizAttemptId): Promise<QuizAttemptRecord | undefined>;
  listByUserAndQuiz(userId: UserId, quizId: QuizId): Promise<QuizAttemptRecord[]>;
  listByUser(userId: UserId): Promise<QuizAttemptRecord[]>;
  /**
   * List all attempts across all quizzes in a course for a user.
   * Used for analytics aggregation.
   */
  listByUserAndCourse(userId: UserId, courseId: CourseId): Promise<QuizAttemptRecord[]>;
  create(record: QuizAttemptRecord): Promise<QuizAttemptRecord>;
}
