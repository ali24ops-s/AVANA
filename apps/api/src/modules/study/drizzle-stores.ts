/**
 * Drizzle-backed implementations of FlashcardStore, QuizStore, and AttemptStore.
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape.
 */

import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  flashcards,
  flashcardReviews,
  quizzes,
  quizQuestions,
  quizAttempts,
} from "@avana/database/schema";
import type {
  FlashcardRecord,
  FlashcardReviewRecord,
  FlashcardScheduleUpdate,
  QuizRecord,
  QuizQuestionRecord,
  FlashcardStore,
  FlashcardReviewStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
} from "./study-store.js";
import type {
  CourseId,
  DocumentId,
  FlashcardId,
  GeneratedContentId,
  OrganizationId,
  QuizId,
  QuizQuestionId,
  QuizAttemptId,
  UserId,
  QuizAttemptRecord,
  FlashcardRating,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFlashcardRecord(row: {
  id: string;
  organizationId: string;
  courseId: string;
  documentId: string;
  generatedContentId: string | null;
  question: string;
  answer: string;
  explanation: string | null;
  cardType: string;
  difficulty: string;
  dueAt: Date | string | null;
  intervalDays: number | null;
  easeFactor: string | number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): FlashcardRecord {
  return {
    id: row.id as FlashcardId,
    organizationId: row.organizationId as OrganizationId,
    courseId: row.courseId as CourseId,
    documentId: row.documentId as DocumentId,
    generatedContentId: row.generatedContentId as GeneratedContentId | null,
    question: row.question,
    answer: row.answer,
    explanation: row.explanation,
    cardType: row.cardType,
    difficulty: row.difficulty,
    dueAt:
      row.dueAt instanceof Date
        ? row.dueAt.toISOString()
        : (row.dueAt ?? new Date().toISOString()),
    intervalDays: row.intervalDays ?? 0,
    easeFactor:
      typeof row.easeFactor === "string"
        ? parseFloat(row.easeFactor)
        : (row.easeFactor ?? 2.5),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toFlashcardReviewRecord(row: {
  id: string;
  flashcardId: string;
  userId: string;
  rating: string;
  reviewedAt: Date;
  reactionMs: number | null;
}): FlashcardReviewRecord {
  return {
    id: row.id,
    flashcardId: row.flashcardId as FlashcardId,
    userId: row.userId as UserId,
    rating: row.rating as FlashcardRating,
    reviewedAt: row.reviewedAt.toISOString(),
    reactionMs: row.reactionMs,
  };
}

function toQuizRecord(row: {
  id: string;
  organizationId: string;
  courseId: string;
  documentId: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): QuizRecord {
  return {
    id: row.id as QuizId,
    organizationId: row.organizationId as OrganizationId,
    courseId: row.courseId as CourseId,
    documentId: row.documentId as DocumentId,
    title: row.title,
    status: row.status as "draft" | "published",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function toQuizQuestionRecord(row: {
  id: string;
  quizId: string;
  generatedContentId: string | null;
  question: string;
  questionType: string;
  choices: unknown;
  correctAnswer: unknown;
  explanation: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): QuizQuestionRecord {
  return {
    id: row.id as QuizQuestionId,
    quizId: row.quizId as QuizId,
    generatedContentId: row.generatedContentId as GeneratedContentId | null,
    question: row.question,
    questionType: row.questionType,
    choices: (row.choices as string[]) ?? null,
    correctAnswer: row.correctAnswer,
    explanation: row.explanation,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toQuizAttemptRecord(row: {
  id: string;
  quizId: string;
  userId: string;
  score: string | number;
  answers: unknown;
  startedAt: Date;
  completedAt: Date | null;
}): QuizAttemptRecord {
  return {
    id: row.id,
    quizId: row.quizId as QuizId,
    userId: row.userId as UserId,
    score: Number(row.score),
    answers: (row.answers as Record<string, unknown>) ?? {},
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt
      ? row.completedAt.toISOString()
      : row.startedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DrizzleFlashcardStore
// ---------------------------------------------------------------------------

export class DrizzleFlashcardStore implements FlashcardStore {
  constructor(private readonly db: DbClient) {}

  async findByIdForOrganization(
    id: FlashcardId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord | undefined> {
    const row = await this.db
      .select()
      .from(flashcards)
      .where(
        and(
          eq(flashcards.id, id),
          eq(flashcards.organizationId, organizationId),
          isNull(flashcards.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toFlashcardRecord(row);
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<FlashcardRecord[]> {
    const rows = await this.db
      .select()
      .from(flashcards)
      .where(
        and(
          eq(flashcards.courseId, courseId),
          eq(flashcards.organizationId, organizationId),
          isNull(flashcards.deletedAt),
        ),
      )
      .orderBy(asc(flashcards.createdAt));

    return rows.map(toFlashcardRecord);
  }

  async create(record: FlashcardRecord): Promise<FlashcardRecord> {
    const [row] = await this.db
      .insert(flashcards)
      .values({
        id: record.id,
        organizationId: record.organizationId,
        courseId: record.courseId,
        documentId: record.documentId,
        generatedContentId: record.generatedContentId,
        question: record.question,
        answer: record.answer,
        explanation: record.explanation,
        cardType: record.cardType,
        difficulty: record.difficulty,
        dueAt: new Date(record.dueAt),
        intervalDays: record.intervalDays,
        easeFactor: record.easeFactor.toString(),
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      })
      .returning();

    return toFlashcardRecord(row);
  }

  async createMany(records: FlashcardRecord[]): Promise<FlashcardRecord[]> {
    if (records.length === 0) return [];
    const rows = await this.db
      .insert(flashcards)
      .values(
        records.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          courseId: r.courseId,
          documentId: r.documentId,
          generatedContentId: r.generatedContentId,
          question: r.question,
          answer: r.answer,
          explanation: r.explanation,
          cardType: r.cardType,
          difficulty: r.difficulty,
          dueAt: new Date(r.dueAt),
          intervalDays: r.intervalDays,
          easeFactor: r.easeFactor.toString(),
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        })),
      )
      .returning();

    return rows.map(toFlashcardRecord);
  }

  async updateSchedule(
    id: FlashcardId,
    schedule: FlashcardScheduleUpdate,
  ): Promise<void> {
    await this.db
      .update(flashcards)
      .set({
        dueAt: new Date(schedule.dueAt),
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor.toString(),
        updatedAt: new Date(schedule.updatedAt),
      })
      .where(eq(flashcards.id, id));
  }

  async findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<FlashcardRecord | undefined> {
    const row = await this.db
      .select()
      .from(flashcards)
      .where(eq(flashcards.generatedContentId, generatedContentId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toFlashcardRecord(row);
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db
      .update(flashcards)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(flashcards.documentId, documentId),
          eq(flashcards.organizationId, organizationId),
          isNull(flashcards.deletedAt),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// DrizzleFlashcardReviewStore
// ---------------------------------------------------------------------------

export class DrizzleFlashcardReviewStore implements FlashcardReviewStore {
  constructor(private readonly db: DbClient) {}

  async create(record: FlashcardReviewRecord): Promise<FlashcardReviewRecord> {
    const [row] = await this.db
      .insert(flashcardReviews)
      .values({
        id: record.id,
        flashcardId: record.flashcardId,
        userId: record.userId,
        rating: record.rating,
        reviewedAt: new Date(record.reviewedAt),
        reactionMs: record.reactionMs,
      })
      .returning();

    return toFlashcardReviewRecord(row);
  }

  async listByUserAndFlashcard(
    userId: UserId,
    flashcardId: FlashcardId,
  ): Promise<FlashcardReviewRecord[]> {
    const rows = await this.db
      .select()
      .from(flashcardReviews)
      .where(
        and(
          eq(flashcardReviews.userId, userId),
          eq(flashcardReviews.flashcardId, flashcardId),
        ),
      )
      .orderBy(asc(flashcardReviews.reviewedAt));

    return rows.map(toFlashcardReviewRecord);
  }

  async listByUser(userId: UserId): Promise<FlashcardReviewRecord[]> {
    const rows = await this.db
      .select()
      .from(flashcardReviews)
      .where(eq(flashcardReviews.userId, userId))
      .orderBy(asc(flashcardReviews.reviewedAt));

    return rows.map(toFlashcardReviewRecord);
  }

  async countByUser(userId: UserId): Promise<number> {
    const result = await this.db
      .select({ value: count() })
      .from(flashcardReviews)
      .where(eq(flashcardReviews.userId, userId));
    return result[0]?.value ?? 0;
  }
}

// ---------------------------------------------------------------------------
// DrizzleQuizStore
// ---------------------------------------------------------------------------

export class DrizzleQuizStore implements QuizStore {
  constructor(private readonly db: DbClient) {}

  async findByIdForOrganization(
    id: QuizId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord | undefined> {
    const row = await this.db
      .select()
      .from(quizzes)
      .where(
        and(
          eq(quizzes.id, id),
          eq(quizzes.organizationId, organizationId),
          isNull(quizzes.deletedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toQuizRecord(row);
  }

  async listByCourse(
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<QuizRecord[]> {
    const rows = await this.db
      .select()
      .from(quizzes)
      .where(
        and(
          eq(quizzes.courseId, courseId),
          eq(quizzes.organizationId, organizationId),
          isNull(quizzes.deletedAt),
        ),
      )
      .orderBy(asc(quizzes.createdAt));

    return rows.map(toQuizRecord);
  }

  async create(record: QuizRecord): Promise<QuizRecord> {
    const [row] = await this.db
      .insert(quizzes)
      .values({
        id: record.id,
        organizationId: record.organizationId,
        courseId: record.courseId,
        documentId: record.documentId,
        title: record.title,
        status: record.status,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
      })
      .returning();

    return toQuizRecord(row);
  }

  async findByGeneratedContent(
    generatedContentId: GeneratedContentId,
  ): Promise<QuizRecord | undefined> {
    // Note: Quizzes are materialized from multiple generated questions.
    // The quiz table doesn't have a generatedContentId column currently.
    // We would need to join with quiz_questions to find it.
    const row = await this.db
      .select({ quiz: quizzes })
      .from(quizzes)
      .innerJoin(quizQuestions, eq(quizzes.id, quizQuestions.quizId))
      .where(eq(quizQuestions.generatedContentId, generatedContentId))
      .limit(1)
      .then((rows) => rows[0]?.quiz);

    if (!row) return undefined;
    return toQuizRecord(row);
  }

  async deleteByDocument(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<void> {
    await this.db
      .update(quizzes)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(quizzes.documentId, documentId),
          eq(quizzes.organizationId, organizationId),
          isNull(quizzes.deletedAt),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// DrizzleQuizQuestionStore
// ---------------------------------------------------------------------------

export class DrizzleQuizQuestionStore implements QuizQuestionStore {
  constructor(private readonly db: DbClient) {}

  async listByQuiz(quizId: QuizId): Promise<QuizQuestionRecord[]> {
    const rows = await this.db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.sortOrder));

    return rows.map(toQuizQuestionRecord);
  }

  async createMany(
    records: QuizQuestionRecord[],
  ): Promise<QuizQuestionRecord[]> {
    if (records.length === 0) return [];
    const rows = await this.db
      .insert(quizQuestions)
      .values(
        records.map((r) => ({
          id: r.id,
          quizId: r.quizId,
          generatedContentId: r.generatedContentId,
          question: r.question,
          questionType: r.questionType,
          choices: r.choices,
          correctAnswer: r.correctAnswer,
          explanation: r.explanation,
          sortOrder: r.sortOrder,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        })),
      )
      .returning();

    return rows.map(toQuizQuestionRecord);
  }
}

// ---------------------------------------------------------------------------
// DrizzleQuizAttemptStore
// ---------------------------------------------------------------------------

export class DrizzleQuizAttemptStore implements QuizAttemptStore {
  constructor(private readonly db: DbClient) {}

  async findById(id: QuizAttemptId): Promise<QuizAttemptRecord | undefined> {
    const row = await this.db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toQuizAttemptRecord(row);
  }

  async listByUserAndQuiz(
    userId: UserId,
    quizId: QuizId,
  ): Promise<QuizAttemptRecord[]> {
    const rows = await this.db
      .select()
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId)),
      )
      .orderBy(asc(quizAttempts.completedAt));

    return rows.map(toQuizAttemptRecord);
  }

  async listByUser(userId: UserId): Promise<QuizAttemptRecord[]> {
    const rows = await this.db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, userId))
      .orderBy(asc(quizAttempts.completedAt));

    return rows.map(toQuizAttemptRecord);
  }

  async listByUserAndCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<QuizAttemptRecord[]> {
    // Join quiz_attempts → quizzes to filter by course
    const rows = await this.db
      .select({ attempt: quizAttempts })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(
        and(
          eq(quizAttempts.userId, userId),
          eq(quizzes.courseId, courseId),
        ),
      )
      .orderBy(asc(quizAttempts.completedAt));

    return rows.map((r) => toQuizAttemptRecord(r.attempt));
  }

  async create(record: QuizAttemptRecord): Promise<QuizAttemptRecord> {
    const [row] = await this.db
      .insert(quizAttempts)
      .values({
        id: record.id,
        quizId: record.quizId,
        userId: record.userId,
        score: record.score.toString(),
        answers: record.answers,
        startedAt: new Date(record.startedAt),
        completedAt: new Date(record.completedAt),
      })
      .returning();

    return toQuizAttemptRecord(row);
  }
}
