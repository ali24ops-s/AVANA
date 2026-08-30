/**
 * Drizzle-backed implementations of FlashcardStore, QuizStore, and AttemptStore.
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape.
 */

import { and, asc, count, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  flashcards,
  flashcardReviews,
  userFlashcardSchedules,
  quizzes,
  quizQuestions,
  quizAttempts,
  studySessions,
  flashcardStudySessions,
  flashcardStudySessionCards,
} from "@avana/database/schema";
import type {
  FlashcardRecord,
  FlashcardReviewRecord,
  FlashcardScheduleUpdate,
  UserFlashcardScheduleRecord,
  QuizRecord,
  QuizQuestionRecord,
  FlashcardStore,
  FlashcardReviewStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
  StudySessionStore,
  FlashcardStudySessionStore,
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
  StudySessionRecord,
  FlashcardStudySessionRecord,
  FlashcardStudySessionCardRecord,
  FlashcardSessionStatus,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFlashcardRecord(row: {
  id: string;
  organizationId: string;
  courseId: string;
  documentId: string | null;
  generatedContentId: string | null;
  lessonId?: string | null;
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
    documentId: (row.documentId as DocumentId) ?? null,
    generatedContentId: row.generatedContentId as GeneratedContentId | null,
    lessonId: (row.lessonId as any) ?? null,
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

function toUserFlashcardScheduleRecord(row: {
  id: string;
  userId: string;
  flashcardId: string;
  dueAt: Date;
  intervalDays: number;
  easeFactor: string | number;
  lastReviewedAt: Date | null;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}): UserFlashcardScheduleRecord {
  return {
    id: row.id,
    userId: row.userId as UserId,
    flashcardId: row.flashcardId as FlashcardId,
    dueAt: row.dueAt.toISOString(),
    intervalDays: row.intervalDays,
    easeFactor:
      typeof row.easeFactor === "string"
        ? parseFloat(row.easeFactor)
        : row.easeFactor,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    reviewCount: row.reviewCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toQuizRecord(row: {
  id: string;
  organizationId: string;
  courseId: string;
  documentId: string | null;
  title: string;
  topic?: string | null;
  difficulty?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}): QuizRecord {
  return {
    id: row.id as QuizId,
    organizationId: row.organizationId as OrganizationId,
    courseId: row.courseId as CourseId,
    documentId: (row.documentId as DocumentId) || null,
    title: row.title,
    topic: row.topic ?? null,
    difficulty: row.difficulty ?? "medium",
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
  lessonId?: string | null;
  question: string;
  topic?: string | null;
  difficulty?: string | null;
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
    lessonId: (row.lessonId as any) ?? null,
    question: row.question,
    topic: row.topic ?? null,
    difficulty: row.difficulty ?? "medium",
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
  quizId: string | null;
  userId: string;
  score: string;
  answers: unknown;
  questionIds?: unknown;
  topic?: string | null;
  difficulty?: string | null;
  status?: string | null;
  startedAt: Date;
  completedAt: Date | null;
}): QuizAttemptRecord {
  return {
    id: row.id,
    quizId: row.quizId ?? null,
    userId: row.userId as UserId,
    score: Number(row.score),
    answers: (row.answers as Record<string, unknown>) ?? {},
    questionIds: (row.questionIds as string[]) ?? null,
    topic: row.topic ?? null,
    difficulty: row.difficulty ?? null,
    status: row.status ?? "in_progress",
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function toStudySessionRecord(row: {
  id: string;
  userId: string;
  activityType: string;
  courseId: string | null;
  moduleId: string | null;
  lessonId: string | null;
  startedAt: Date;
  lastActivityAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}): StudySessionRecord {
  return {
    id: row.id,
    userId: row.userId as UserId,
    activityType: row.activityType as any,
    courseId: (row.courseId as CourseId) ?? null,
    moduleId: row.moduleId ?? null,
    lessonId: row.lessonId ?? null,
    startedAt: row.startedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

  async listByOrganization(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
  ): Promise<FlashcardRecord[]> {
    const orgFilter =
      systemOrganizationId && systemOrganizationId !== organizationId
        ? or(
            eq(flashcards.organizationId, organizationId),
            eq(flashcards.organizationId, systemOrganizationId),
          )
        : eq(flashcards.organizationId, organizationId);

    const rows = await this.db
      .select()
      .from(flashcards)
      .where(and(orgFilter, isNull(flashcards.deletedAt)))
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
        lessonId: record.lessonId ?? null,
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
          lessonId: r.lessonId ?? null,
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
// DrizzleUserFlashcardScheduleStore
// ---------------------------------------------------------------------------

export class DrizzleUserFlashcardScheduleStore
  implements UserFlashcardScheduleStore
{
  constructor(private readonly db: DbClient) {}

  async getByUserAndCard(
    userId: UserId,
    flashcardId: FlashcardId,
  ): Promise<UserFlashcardScheduleRecord | undefined> {
    const row = await this.db
      .select()
      .from(userFlashcardSchedules)
      .where(
        and(
          eq(userFlashcardSchedules.userId, userId),
          eq(userFlashcardSchedules.flashcardId, flashcardId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toUserFlashcardScheduleRecord(row);
  }

  async listByUser(userId: UserId): Promise<UserFlashcardScheduleRecord[]> {
    const rows = await this.db
      .select()
      .from(userFlashcardSchedules)
      .where(eq(userFlashcardSchedules.userId, userId));

    return rows.map(toUserFlashcardScheduleRecord);
  }

  async upsertSchedule(
    record: Omit<UserFlashcardScheduleRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<UserFlashcardScheduleRecord> {
    const now = new Date();
    const rows = await this.db
      .insert(userFlashcardSchedules)
      .values({
        userId: record.userId,
        flashcardId: record.flashcardId,
        dueAt: new Date(record.dueAt),
        intervalDays: record.intervalDays,
        easeFactor: record.easeFactor.toString(),
        lastReviewedAt: record.lastReviewedAt ? new Date(record.lastReviewedAt) : null,
        reviewCount: record.reviewCount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userFlashcardSchedules.userId, userFlashcardSchedules.flashcardId],
        set: {
          dueAt: new Date(record.dueAt),
          intervalDays: record.intervalDays,
          easeFactor: record.easeFactor.toString(),
          lastReviewedAt: record.lastReviewedAt ? new Date(record.lastReviewedAt) : null,
          reviewCount: record.reviewCount,
          updatedAt: now,
        },
      })
      .returning();

    return toUserFlashcardScheduleRecord(rows[0]);
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

  async listByOrganization(
    organizationId: OrganizationId,
    systemOrganizationId?: OrganizationId,
  ): Promise<QuizRecord[]> {
    const orgFilter =
      systemOrganizationId && systemOrganizationId !== organizationId
        ? or(
            eq(quizzes.organizationId, organizationId),
            eq(quizzes.organizationId, systemOrganizationId),
          )
        : eq(quizzes.organizationId, organizationId);

    const rows = await this.db
      .select()
      .from(quizzes)
      .where(and(orgFilter, isNull(quizzes.deletedAt)))
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
        topic: record.topic,
        difficulty: record.difficulty ?? "medium",
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

  async listByIds(ids: QuizQuestionId[]): Promise<QuizQuestionRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(quizQuestions)
      .where(inArray(quizQuestions.id, ids));

    const map = new Map(rows.map((r) => [r.id, r]));
    const ordered: QuizQuestionRecord[] = [];
    for (const id of ids) {
      const found = map.get(id);
      if (found) ordered.push(toQuizQuestionRecord(found));
    }
    return ordered;
  }

  async listByFilter(filter: {
    organizationId?: OrganizationId;
    systemOrganizationId?: OrganizationId;
    topics?: string[];
    difficulty?: string;
  }): Promise<QuizQuestionRecord[]> {
    let query = this.db
      .select({ question: quizQuestions })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
      .$dynamic();

    const conditions = [isNull(quizzes.deletedAt)];

    if (filter.organizationId) {
      if (
        filter.systemOrganizationId &&
        filter.systemOrganizationId !== filter.organizationId
      ) {
        conditions.push(
          or(
            eq(quizzes.organizationId, filter.organizationId),
            eq(quizzes.organizationId, filter.systemOrganizationId),
          )!,
        );
      } else {
        conditions.push(eq(quizzes.organizationId, filter.organizationId));
      }
    }

    if (filter.difficulty && filter.difficulty !== "all") {
      conditions.push(
        or(
          eq(quizQuestions.difficulty, filter.difficulty),
          eq(quizzes.difficulty, filter.difficulty),
        )!,
      );
    }

    if (filter.topics && filter.topics.length > 0) {
      const topicConditions = filter.topics.map(
        (t) =>
          or(
            eq(quizQuestions.topic, t),
            eq(quizzes.topic, t),
            sql`lower(${quizzes.title}) LIKE lower(${`%${t}%`})`,
            sql`lower(${quizQuestions.question}) LIKE lower(${`%${t}%`})`,
          )!,
      );
      conditions.push(or(...topicConditions)!);
    }

    const rows = await query.where(and(...conditions)).orderBy(asc(quizQuestions.sortOrder));
    return rows.map((r) => toQuizQuestionRecord(r.question));
  }

  async countByTopicAndDifficulty(
    organizationId?: OrganizationId,
  ): Promise<Array<{ topic: string; difficulty: string; questionCount: number }>> {
    let query = this.db
      .select({
        questionTopic: quizQuestions.topic,
        quizTopic: quizzes.topic,
        quizTitle: quizzes.title,
        questionDifficulty: quizQuestions.difficulty,
        quizDifficulty: quizzes.difficulty,
        cnt: sql<number>`count(${quizQuestions.id})`,
      })
      .from(quizQuestions)
      .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
      .$dynamic();

    const conditions = [isNull(quizzes.deletedAt)];
    if (organizationId) {
      conditions.push(eq(quizzes.organizationId, organizationId));
    }

    const rows = await query
      .where(and(...conditions))
      .groupBy(
        quizQuestions.topic,
        quizzes.topic,
        quizzes.title,
        quizQuestions.difficulty,
        quizzes.difficulty,
      );

    const countsMap = new Map<string, number>();
    for (const r of rows) {
      const rawTopic = r.questionTopic || r.quizTopic || r.quizTitle || "عمومی";
      const rawDiff = r.questionDifficulty || r.quizDifficulty || "medium";
      const key = `${rawTopic}:::${rawDiff}`;
      countsMap.set(key, (countsMap.get(key) ?? 0) + Number(r.cnt));
    }

    const result: Array<{ topic: string; difficulty: string; questionCount: number }> = [];
    for (const [key, count] of countsMap.entries()) {
      const [topic, difficulty] = key.split(":::");
      result.push({ topic, difficulty, questionCount: count });
    }
    return result;
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
          lessonId: r.lessonId ?? null,
          question: r.question,
          topic: r.topic,
          difficulty: r.difficulty ?? "medium",
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

  async countCompletedByUser(userId: UserId): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.userId, userId),
          or(
            eq(quizAttempts.status, "completed"),
            isNotNull(quizAttempts.completedAt),
          )!,
        ),
      );

    return Number(result[0]?.count ?? 0);
  }

  async listByUserAndCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<QuizAttemptRecord[]> {
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
        quizId: record.quizId ?? null,
        userId: record.userId,
        score: record.score.toString(),
        answers: record.answers,
        questionIds: record.questionIds ?? null,
        topic: record.topic ?? null,
        difficulty: record.difficulty ?? null,
        status: record.status ?? "in_progress",
        startedAt: new Date(record.startedAt),
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
      })
      .returning();

    return toQuizAttemptRecord(row);
  }

  async update(record: QuizAttemptRecord): Promise<QuizAttemptRecord> {
    const [row] = await this.db
      .update(quizAttempts)
      .set({
        score: record.score.toString(),
        answers: record.answers,
        status: record.status ?? "completed",
        completedAt: record.completedAt ? new Date(record.completedAt) : new Date(),
      })
      .where(eq(quizAttempts.id, record.id))
      .returning();

    return toQuizAttemptRecord(row);
  }
}

// ---------------------------------------------------------------------------
// DrizzleStudySessionStore
// ---------------------------------------------------------------------------

export class DrizzleStudySessionStore implements StudySessionStore {
  constructor(private readonly db: DbClient) {}

  async create(
    record: Omit<StudySessionRecord, "createdAt" | "updatedAt">,
  ): Promise<StudySessionRecord> {
    const [row] = await this.db
      .insert(studySessions)
      .values({
        id: record.id,
        userId: record.userId,
        activityType: record.activityType,
        courseId: record.courseId ?? null,
        moduleId: record.moduleId ?? null,
        lessonId: record.lessonId ?? null,
        startedAt: new Date(record.startedAt),
        lastActivityAt: new Date(record.lastActivityAt),
        endedAt: record.endedAt ? new Date(record.endedAt) : null,
        durationSeconds: record.durationSeconds,
      })
      .returning();

    return toStudySessionRecord(row);
  }

  async findById(id: string): Promise<StudySessionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(studySessions)
      .where(eq(studySessions.id, id))
      .limit(1);

    return row ? toStudySessionRecord(row) : undefined;
  }

  async findActiveByUser(userId: UserId): Promise<StudySessionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          isNull(studySessions.endedAt),
        ),
      )
      .orderBy(sql`${studySessions.startedAt} DESC`)
      .limit(1);

    return row ? toStudySessionRecord(row) : undefined;
  }

  async update(record: StudySessionRecord): Promise<StudySessionRecord> {
    const [row] = await this.db
      .update(studySessions)
      .set({
        lastActivityAt: new Date(record.lastActivityAt),
        endedAt: record.endedAt ? new Date(record.endedAt) : null,
        durationSeconds: record.durationSeconds,
        updatedAt: new Date(record.updatedAt),
      })
      .where(eq(studySessions.id, record.id))
      .returning();

    return toStudySessionRecord(row);
  }

  async closeActiveSessionsForUser(
    userId: UserId,
    endedAt: string,
  ): Promise<void> {
    const endedDate = new Date(endedAt);
    await this.db
      .update(studySessions)
      .set({
        endedAt: endedDate,
        updatedAt: endedDate,
      })
      .where(
        and(
          eq(studySessions.userId, userId),
          isNull(studySessions.endedAt),
        ),
      );
  }

  async listByUser(userId: UserId): Promise<StudySessionRecord[]> {
    const rows = await this.db
      .select()
      .from(studySessions)
      .where(eq(studySessions.userId, userId))
      .orderBy(sql`${studySessions.startedAt} ASC`);

    return rows.map(toStudySessionRecord);
  }

  async listByUserAndDateRange(
    userId: UserId,
    fromDate: string,
    toDate: string,
  ): Promise<StudySessionRecord[]> {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const rows = await this.db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          sql`${studySessions.startedAt} >= ${from}`,
          sql`${studySessions.startedAt} <= ${to}`,
        ),
      )
      .orderBy(sql`${studySessions.startedAt} ASC`);

    return rows.map(toStudySessionRecord);
  }
}

// ---------------------------------------------------------------------------
// Flashcard Study Session Helpers & Store
// ---------------------------------------------------------------------------

function toFlashcardStudySessionRecord(row: {
  id: string;
  userId: string;
  organizationId: string;
  courseId: string | null;
  title: string;
  mode: string;
  customMode: string | null;
  status: string;
  totalCards: number;
  completedCards: number;
  currentIndex: number;
  currentCardId: string | null;
  startedAt: Date;
  lastActivityAt: Date;
  completedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): FlashcardStudySessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    courseId: row.courseId ?? null,
    title: row.title,
    mode: row.mode,
    customMode: row.customMode ?? null,
    status: row.status as FlashcardSessionStatus,
    totalCards: row.totalCards,
    completedCards: row.completedCards,
    currentIndex: row.currentIndex,
    currentCardId: row.currentCardId ?? null,
    startedAt: row.startedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toFlashcardStudySessionCardRecord(row: {
  id: string;
  sessionId: string;
  flashcardId: string | null;
  sortOrder: number;
  status: string;
  rating: string | null;
  reactionMs: number | null;
  reviewedAt: Date | null;
  createdAt: Date;
}): FlashcardStudySessionCardRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    flashcardId: row.flashcardId ?? null,
    sortOrder: row.sortOrder,
    status: row.status as "unseen" | "reviewed",
    rating: row.rating ?? null,
    reactionMs: row.reactionMs ?? null,
    reviewedAt: row.reviewedAt ? (row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : new Date(row.reviewedAt as any).toISOString()) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
  };
}

export class DrizzleFlashcardStudySessionStore
  implements FlashcardStudySessionStore
{
  constructor(private readonly db: DbClient) {}

  async createSessionWithCards(
    session: Omit<FlashcardStudySessionRecord, "createdAt" | "updatedAt">,
    cards: Array<{ flashcardId: string; sortOrder: number }>,
  ): Promise<FlashcardStudySessionRecord> {
    const [sessionRow] = await this.db
      .insert(flashcardStudySessions)
      .values({
        id: session.id,
        userId: session.userId,
        organizationId: session.organizationId,
        courseId: session.courseId ?? null,
        title: session.title,
        mode: session.mode,
        customMode: session.customMode ?? null,
        status: session.status,
        totalCards: session.totalCards,
        completedCards: session.completedCards,
        currentIndex: session.currentIndex,
        currentCardId: session.currentCardId ?? null,
        startedAt: new Date(session.startedAt),
        lastActivityAt: new Date(session.lastActivityAt),
        completedAt: session.completedAt ? new Date(session.completedAt) : null,
        metadata: session.metadata ?? null,
      })
      .returning();

    if (cards.length > 0) {
      await this.db.insert(flashcardStudySessionCards).values(
        cards.map((c) => ({
          sessionId: session.id,
          flashcardId: c.flashcardId,
          sortOrder: c.sortOrder,
          status: "unseen",
        })),
      );
    }

    return toFlashcardStudySessionRecord(sessionRow);
  }

  async findById(id: string): Promise<FlashcardStudySessionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(flashcardStudySessions)
      .where(eq(flashcardStudySessions.id, id))
      .limit(1);

    return row ? toFlashcardStudySessionRecord(row) : undefined;
  }

  async listActiveByUser(
    userId: UserId,
    organizationId?: OrganizationId,
  ): Promise<FlashcardStudySessionRecord[]> {
    const conditions = [
      eq(flashcardStudySessions.userId, userId),
      eq(flashcardStudySessions.status, "in_progress"),
    ];
    if (organizationId) {
      conditions.push(eq(flashcardStudySessions.organizationId, organizationId));
    }

    const rows = await this.db
      .select()
      .from(flashcardStudySessions)
      .where(and(...conditions))
      .orderBy(sql`${flashcardStudySessions.lastActivityAt} DESC`);

    return rows.map(toFlashcardStudySessionRecord);
  }

  async listSessionCards(
    sessionId: string,
  ): Promise<FlashcardStudySessionCardRecord[]> {
    const rows = await this.db
      .select()
      .from(flashcardStudySessionCards)
      .where(eq(flashcardStudySessionCards.sessionId, sessionId))
      .orderBy(asc(flashcardStudySessionCards.sortOrder));

    return rows.map(toFlashcardStudySessionCardRecord);
  }

  async updateProgress(
    sessionId: string,
    data: {
      currentIndex: number;
      completedCards: number;
      currentCardId?: string | null;
      lastActivityAt: string;
      cardUpdate?: {
        flashcardId: string;
        status: "reviewed";
        rating?: string | null;
        reactionMs?: number | null;
        reviewedAt: string;
      };
    },
  ): Promise<FlashcardStudySessionRecord | undefined> {
    const now = new Date(data.lastActivityAt);

    if (data.cardUpdate) {
      await this.db
        .update(flashcardStudySessionCards)
        .set({
          status: data.cardUpdate.status,
          rating: data.cardUpdate.rating ?? null,
          reactionMs: data.cardUpdate.reactionMs ?? null,
          reviewedAt: new Date(data.cardUpdate.reviewedAt),
        })
        .where(
          and(
            eq(flashcardStudySessionCards.sessionId, sessionId),
            eq(flashcardStudySessionCards.flashcardId, data.cardUpdate.flashcardId),
          ),
        );
    }

    const [sessionRow] = await this.db
      .update(flashcardStudySessions)
      .set({
        currentIndex: data.currentIndex,
        completedCards: data.completedCards,
        currentCardId: data.currentCardId ?? null,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(flashcardStudySessions.id, sessionId))
      .returning();

    return sessionRow ? toFlashcardStudySessionRecord(sessionRow) : undefined;
  }

  async updateStatus(
    sessionId: string,
    status: FlashcardSessionStatus,
    completedAt?: string | null,
    lastActivityAt?: string,
  ): Promise<FlashcardStudySessionRecord | undefined> {
    const now = lastActivityAt ? new Date(lastActivityAt) : new Date();
    const [row] = await this.db
      .update(flashcardStudySessions)
      .set({
        status,
        completedAt: completedAt ? new Date(completedAt) : null,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(flashcardStudySessions.id, sessionId))
      .returning();

    return row ? toFlashcardStudySessionRecord(row) : undefined;
  }
}


