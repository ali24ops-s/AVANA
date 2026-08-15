/**
 * In-memory implementations of study stores for testing (PR6-7).
 *
 * Follows the existing in-memory store pattern (learning/test/in-memory-stores).
 * Supports pre-loading seed data for integration tests.
 */

import type {
  CourseId,
  DocumentId,
  FlashcardId,
  GeneratedContentId,
  OrganizationId,
  QuizAttemptId,
  QuizId,
  UserId,
} from "@avana/domain";
import type {
  FlashcardRecord,
  FlashcardReviewRecord,
  FlashcardScheduleUpdate,
  FlashcardStore,
  FlashcardReviewStore,
  QuizRecord,
  QuizQuestionRecord,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
} from "../study-store.js";
import type { QuizAttemptRecord } from "@avana/domain";

// ---------------------------------------------------------------------------
// InMemoryFlashcardStore
// ---------------------------------------------------------------------------

export class InMemoryFlashcardStore implements FlashcardStore {
  private flashcards: Map<string, FlashcardRecord> = new Map();

  async findByIdForOrganization(
    id: FlashcardId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord | undefined> {
    const record = this.flashcards.get(id);
    if (
      !record ||
      record.organizationId !== organizationId ||
      record.deletedAt !== null
    ) {
      return undefined;
    }
    return { ...record };
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord[]> {
    return Array.from(this.flashcards.values())
      .filter(
        (f) =>
          f.courseId === courseId &&
          f.organizationId === organizationId &&
          f.deletedAt === null,
      )
      .map((f) => ({ ...f }));
  }

  async create(record: FlashcardRecord): Promise<FlashcardRecord> {
    this.flashcards.set(record.id, { ...record });
    return { ...record };
  }

  async createMany(records: FlashcardRecord[]): Promise<FlashcardRecord[]> {
    for (const r of records) {
      this.flashcards.set(r.id, { ...r });
    }
    return records.map((r) => ({ ...r }));
  }

  async updateSchedule(
    id: FlashcardId,
    schedule: FlashcardScheduleUpdate,
  ): Promise<void> {
    const existing = this.flashcards.get(id);
    if (existing) {
      this.flashcards.set(id, {
        ...existing,
        dueAt: schedule.dueAt,
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor,
        updatedAt: schedule.updatedAt,
      });
    }
  }

  async findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<FlashcardRecord | undefined> {
    for (const f of this.flashcards.values()) {
      if (f.generatedContentId === generatedContentId && f.deletedAt === null) {
        return { ...f };
      }
    }
    return undefined;
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, f] of this.flashcards) {
      if (
        f.documentId === documentId &&
        f.organizationId === organizationId &&
        f.deletedAt === null
      ) {
        this.flashcards.set(id, {
          ...f,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  /** Directly insert a record (used for seeding). */
  insert(record: FlashcardRecord): void {
    this.flashcards.set(record.id, { ...record });
  }

  /** Get all stored records (for test assertions). */
  getAll(): FlashcardRecord[] {
    return Array.from(this.flashcards.values()).map((f) => ({ ...f }));
  }

  /** Clear all records (for test isolation). */
  clear(): void {
    this.flashcards.clear();
  }
}

// ---------------------------------------------------------------------------
// In-Memory Flashcard Review Store
// ---------------------------------------------------------------------------

export class InMemoryFlashcardReviewStore implements FlashcardReviewStore {
  private reviews: FlashcardReviewRecord[] = [];

  async create(record: FlashcardReviewRecord): Promise<FlashcardReviewRecord> {
    this.reviews.push({ ...record });
    return { ...record };
  }

  async listByUserAndFlashcard(
    userId: UserId,
    flashcardId: FlashcardId,
  ): Promise<FlashcardReviewRecord[]> {
    return this.reviews
      .filter((r) => r.userId === userId && r.flashcardId === flashcardId)
      .map((r) => ({ ...r }));
  }

  async listByUser(userId: UserId): Promise<FlashcardReviewRecord[]> {
    return this.reviews
      .filter((r) => r.userId === userId)
      .map((r) => ({ ...r }));
  }

  async countByUser(userId: UserId): Promise<number> {
    return this.reviews.filter((r) => r.userId === userId).length;
  }

  /** Directly insert a review (used for seeding). */
  insert(record: FlashcardReviewRecord): void {
    this.reviews.push({ ...record });
  }

  /** Get all stored reviews (for test assertions). */
  getAll(): FlashcardReviewRecord[] {
    return this.reviews.map((r) => ({ ...r }));
  }

  /** Clear all reviews (for test isolation). */
  clear(): void {
    this.reviews = [];
  }
}

// ---------------------------------------------------------------------------
// InMemoryQuizStore
// ---------------------------------------------------------------------------

export class InMemoryQuizStore implements QuizStore {
  private quizzes: Map<string, QuizRecord> = new Map();
  private questionsByQuiz: Map<string, QuizQuestionRecord[]> = new Map();

  async findByIdForOrganization(
    id: QuizId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord | undefined> {
    const record = this.quizzes.get(id);
    if (
      !record ||
      record.organizationId !== organizationId ||
      record.deletedAt !== null
    ) {
      return undefined;
    }
    return { ...record };
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord[]> {
    return Array.from(this.quizzes.values())
      .filter(
        (q) =>
          q.courseId === courseId &&
          q.organizationId === organizationId &&
          q.deletedAt === null,
      )
      .map((q) => ({ ...q }));
  }

  async create(record: QuizRecord): Promise<QuizRecord> {
    this.quizzes.set(record.id, { ...record });
    return { ...record };
  }

  async findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<QuizRecord | undefined> {
    // Look up question by generatedContentId to find the parent quiz
    for (const [quizId, questions] of this.questionsByQuiz.entries()) {
      if (questions.some((q) => q.generatedContentId === generatedContentId)) {
        return this.quizzes.get(quizId);
      }
    }
    return undefined;
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    for (const [id, q] of this.quizzes) {
      if (
        q.documentId === documentId &&
        q.organizationId === organizationId &&
        q.deletedAt === null
      ) {
        this.quizzes.set(id, {
          ...q,
          deletedAt: new Date().toISOString(),
        });
      }
    }
  }

  /** Helper to link questions for findByGeneratedContent */
  setQuestionsForQuiz(quizId: string, questions: QuizQuestionRecord[]): void {
    this.questionsByQuiz.set(quizId, questions);
  }

  /** Directly insert a record (used for seeding). */
  insert(record: QuizRecord): void {
    this.quizzes.set(record.id, { ...record });
  }

  /** Get all stored records (for test assertions). */
  getAll(): QuizRecord[] {
    return Array.from(this.quizzes.values()).map((q) => ({ ...q }));
  }

  /** Clear all records (for test isolation). */
  clear(): void {
    this.quizzes.clear();
    this.questionsByQuiz.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryQuizQuestionStore
// ---------------------------------------------------------------------------

export class InMemoryQuizQuestionStore implements QuizQuestionStore {
  private questions: QuizQuestionRecord[] = [];

  async listByQuiz(quizId: QuizId): Promise<QuizQuestionRecord[]> {
    return this.questions
      .filter((q) => q.quizId === quizId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((q) => ({ ...q }));
  }

  async createMany(
    records: QuizQuestionRecord[],
  ): Promise<QuizQuestionRecord[]> {
    for (const r of records) {
      this.questions.push({ ...r });
    }
    return records.map((r) => ({ ...r }));
  }

  /** Directly insert questions (used for seeding). */
  insert(record: QuizQuestionRecord): void {
    this.questions.push({ ...record });
  }

  /** Get all stored questions (for test assertions). */
  getAll(): QuizQuestionRecord[] {
    return this.questions.map((q) => ({ ...q }));
  }

  /** Clear all questions (for test isolation). */
  clear(): void {
    this.questions = [];
  }
}

// ---------------------------------------------------------------------------
// InMemoryQuizAttemptStore
// ---------------------------------------------------------------------------

export class InMemoryQuizAttemptStore implements QuizAttemptStore {
  private attempts: Map<string, QuizAttemptRecord> = new Map();
  // Optional reference to quizStore to resolve courseId in listByUserAndCourse
  private quizStore?: InMemoryQuizStore;

  constructor(quizStore?: InMemoryQuizStore) {
    this.quizStore = quizStore;
  }

  setQuizStore(quizStore: InMemoryQuizStore): void {
    this.quizStore = quizStore;
  }

  async findById(id: QuizAttemptId): Promise<QuizAttemptRecord | undefined> {
    const record = this.attempts.get(id);
    return record ? { ...record } : undefined;
  }

  async listByUserAndQuiz(
    userId: UserId,
    quizId: QuizId,
  ): Promise<QuizAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.userId === userId && a.quizId === quizId)
      .map((a) => ({ ...a }));
  }

  async listByUser(userId: UserId): Promise<QuizAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.userId === userId)
      .map((a) => ({ ...a }));
  }

  async listByUserAndCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<QuizAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => {
        if (a.userId !== userId) return false;
        if (!this.quizStore) return true;
        const allQuizzes = this.quizStore.getAll();
        const quiz = allQuizzes.find((q) => q.id === a.quizId);
        return quiz?.courseId === courseId;
      })
      .map((a) => ({ ...a }));
  }

  async create(record: QuizAttemptRecord): Promise<QuizAttemptRecord> {
    this.attempts.set(record.id, { ...record });
    return { ...record };
  }

  /** Directly insert an attempt (used for seeding). */
  insert(record: QuizAttemptRecord): void {
    this.attempts.set(record.id, { ...record });
  }

  /** Get all stored attempts (for test assertions). */
  getAll(): QuizAttemptRecord[] {
    return Array.from(this.attempts.values()).map((a) => ({ ...a }));
  }

  /** Clear all attempts (for test isolation). */
  clear(): void {
    this.attempts.clear();
  }
}
