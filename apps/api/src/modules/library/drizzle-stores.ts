import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "@avana/database/client";
import {
  contentPacks,
  contentPackItems,
  contentPackUsages,
  flashcards,
  generatedContents,
  lessons,
  modules,
  quizQuestions,
  quizzes,
  users,
} from "@avana/database/schema";
import type {
  ContentPackStore,
  ContentPackUsageStore,
  ListPublishedPacksOptions,
  ListPublishedPacksResult,
  MaterializationResult,
  MaterializeToCourseInput,
} from "./library-store.js";
import {
  type ContentPackContentType,
  type ContentPackId,
  type ContentPackItemId,
  type ContentPackItemRecord,
  type ContentPackMetadata,
  type ContentPackRecord,
  type ContentPackStatus,
  type ContentPackUsageId,
  type ContentPackUsageRecord,
  type CourseId,
  type DocumentId,
  type FlashcardPayload,
  type GeneratedContentId,
  type GeneratedContentPayload,
  type LessonPayload,
  type ModuleId,
  type OrganizationId,
  type QuizPayload,
  type UserId,
  DomainError,
  canonicalizeAndShuffleQuestion,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function toContentPackRecord(row: {
  id: string;
  creatorUserId: string | null;
  organizationId: string | null;
  sourceDocumentId: string | null;
  title: string;
  description: string | null;
  subject: string | null;
  status: string;
  publishedAt: Date | string;
  usageCount: number;
  metadata: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt: Date | string | null;
}): ContentPackRecord {
  return {
    id: row.id as ContentPackId,
    creatorUserId: (row.creatorUserId as UserId) ?? null,
    organizationId: (row.organizationId as OrganizationId) ?? null,
    sourceDocumentId: (row.sourceDocumentId as DocumentId) ?? null,
    title: row.title,
    description: row.description,
    subject: row.subject,
    status: row.status as ContentPackStatus,
    publishedAt:
      row.publishedAt instanceof Date
        ? row.publishedAt.toISOString()
        : new Date(row.publishedAt).toISOString(),
    usageCount: row.usageCount,
    metadata: (row.metadata as ContentPackMetadata) ?? {},
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt).toISOString(),
    deletedAt: row.deletedAt
      ? row.deletedAt instanceof Date
        ? row.deletedAt.toISOString()
        : new Date(row.deletedAt).toISOString()
      : null,
  };
}

function toContentPackItemRecord(row: {
  id: string;
  contentPackId: string;
  contentType: string;
  sourceGeneratedContentId: string | null;
  payloadSnapshot: unknown;
  sortOrder: number;
  createdAt: Date | string;
}): ContentPackItemRecord {
  return {
    id: row.id as ContentPackItemId,
    contentPackId: row.contentPackId as ContentPackId,
    contentType: row.contentType as ContentPackContentType,
    sourceGeneratedContentId: row.sourceGeneratedContentId as GeneratedContentId | null,
    payloadSnapshot: row.payloadSnapshot as GeneratedContentPayload,
    sortOrder: row.sortOrder,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// DrizzleContentPackStore
// ---------------------------------------------------------------------------

export class DrizzleContentPackStore implements ContentPackStore {
  constructor(private readonly db: DbClient) {}

  async create(
    pack: ContentPackRecord,
    items: ContentPackItemRecord[],
  ): Promise<ContentPackRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const [insertedPack] = await tx
          .insert(contentPacks)
          .values({
            id: pack.id,
            creatorUserId: pack.creatorUserId,
            organizationId: pack.organizationId,
            sourceDocumentId: pack.sourceDocumentId,
            title: pack.title,
            description: pack.description,
            subject: pack.subject,
            status: pack.status,
            publishedAt: new Date(pack.publishedAt),
            usageCount: pack.usageCount,
            metadata: pack.metadata,
            createdAt: new Date(pack.createdAt),
            updatedAt: new Date(pack.updatedAt),
          })
          .returning();

        if (items.length > 0) {
          await tx.insert(contentPackItems).values(
            items.map((it) => ({
              id: it.id,
              contentPackId: it.contentPackId,
              contentType: it.contentType,
              sourceGeneratedContentId: it.sourceGeneratedContentId,
              payloadSnapshot: it.payloadSnapshot,
              sortOrder: it.sortOrder,
              createdAt: new Date(it.createdAt),
            })),
          );
        }

        return toContentPackRecord(insertedPack);
      });
    } catch (err: unknown) {
      type ErrorWithCode = { code?: string; message?: string };
      const e = err as ErrorWithCode;
      if (
        e?.code === "23505" ||
        e?.message?.includes("idx_content_packs_active_source_doc")
      ) {
        throw new DomainError(
          "conflict",
          "یک بسته آموزشی فعال و منتشرشده برای این سند از قبل وجود دارد.",
        );
      }
      throw err;
    }
  }

  async findById(id: ContentPackId): Promise<ContentPackRecord | undefined> {
    const row = await this.db
      .select()
      .from(contentPacks)
      .where(and(eq(contentPacks.id, id), isNull(contentPacks.deletedAt)))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toContentPackRecord(row);
  }

  async findActiveByDocument(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<ContentPackRecord | undefined> {
    const conditions = [
      eq(contentPacks.sourceDocumentId, documentId),
      eq(contentPacks.status, "published"),
      isNull(contentPacks.deletedAt),
    ];
    if (organizationId) {
      conditions.push(eq(contentPacks.organizationId, organizationId));
    }

    const row = await this.db
      .select()
      .from(contentPacks)
      .where(and(...conditions))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return toContentPackRecord(row);
  }

  async listPublished(
    options: ListPublishedPacksOptions,
  ): Promise<ListPublishedPacksResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(contentPacks.status, "published"),
      isNull(contentPacks.deletedAt),
    ];

    if (options.subject && options.subject.trim().length > 0) {
      conditions.push(eq(contentPacks.subject, options.subject.trim()));
    }

    if (options.q && options.q.trim().length > 0) {
      const pattern = `%${options.q.trim()}%`;
      conditions.push(
        or(
          ilike(contentPacks.title, pattern),
          ilike(contentPacks.description, pattern),
          ilike(contentPacks.subject, pattern),
        )!,
      );
    }

    const whereClause = and(...conditions);

    // Total count query
    const [{ totalCount }] = await this.db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(contentPacks)
      .where(whereClause);

    // Sorting
    const orderByClause =
      options.sort === "newest"
        ? [desc(contentPacks.publishedAt)]
        : [desc(contentPacks.usageCount), desc(contentPacks.publishedAt)];

    const rows = await this.db
      .select()
      .from(contentPacks)
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(toContentPackRecord),
      totalCount: Number(totalCount || 0),
    };
  }

  async findItemsByPackId(
    packId: ContentPackId,
  ): Promise<ContentPackItemRecord[]> {
    const rows = await this.db
      .select()
      .from(contentPackItems)
      .where(eq(contentPackItems.contentPackId, packId))
      .orderBy(contentPackItems.sortOrder);

    return rows.map(toContentPackItemRecord);
  }

  async getCreatorPublicInfo(
    userId: UserId | null,
  ): Promise<{ id: string; name: string } | undefined> {
    if (!userId) {
      return {
        id: "",
        name: "کاربر آوانا",
      };
    }

    const row = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) {
      return {
        id: userId as string,
        name: "کاربر آوانا",
      };
    }
    return {
      id: row.id,
      name: row.name || "کاربر آوانا",
    };
  }

  async findUsage(
    packId: ContentPackId,
    userId: UserId,
    targetCourseId: CourseId,
  ): Promise<ContentPackUsageRecord | undefined> {
    const row = await this.db
      .select()
      .from(contentPackUsages)
      .where(
        and(
          eq(contentPackUsages.contentPackId, packId),
          eq(contentPackUsages.userId, userId),
          eq(contentPackUsages.targetCourseId, targetCourseId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return {
      id: row.id as ContentPackUsageId,
      contentPackId: row.contentPackId as ContentPackId,
      userId: row.userId as UserId,
      targetCourseId: row.targetCourseId as CourseId,
      targetModuleId: (row.targetModuleId as ModuleId) ?? null,
      addedAt: row.addedAt.toISOString(),
    };
  }

  async materializeToCourse(
    input: MaterializeToCourseInput,
  ): Promise<MaterializationResult> {
    const { pack, items, userId, organizationId, targetCourseId } = input;
    const now = new Date();

    return this.db.transaction(async (tx) => {
      // 1. Idempotency check: see if pack is already installed in targetCourseId for this user
      const existingUsage = await tx
        .select()
        .from(contentPackUsages)
        .where(
          and(
            eq(contentPackUsages.contentPackId, pack.id),
            eq(contentPackUsages.userId, userId),
            eq(contentPackUsages.targetCourseId, targetCourseId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (existingUsage) {
        return {
          alreadyInstalled: true,
          moduleId: (existingUsage.targetModuleId as ModuleId) ?? ("" as ModuleId),
          moduleTitle: pack.title,
          lessonsCreated: 0,
          flashcardsCreated: 0,
          quizzesCreated: 0,
          quizQuestionsCreated: 0,
          reviewSummaryCreated: false,
        };
      }

      // 2. Validate items
      if (!items || items.length === 0) {
        throw new Error("Cannot materialize empty Content Pack: missing content items.");
      }

      const lessonItem = items.find((i) => i.contentType === "lesson");
      const flashcardItem = items.find((i) => i.contentType === "flashcard");
      const quizItem = items.find((i) => i.contentType === "quiz");
      const reviewSummaryItem = items.find((i) => i.contentType === "review_summary");

      // 3. Determine next available module sortOrder
      const [{ count: moduleCount }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(modules)
        .where(and(eq(modules.courseId, targetCourseId), isNull(modules.deletedAt)));

      const moduleId = randomUUID();
      const [insertedModule] = await tx
        .insert(modules)
        .values({
          id: moduleId,
          courseId: targetCourseId,
          documentId: null,
          title: pack.title,
          description: pack.description,
          sortOrder: Number(moduleCount || 0),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // 4. Materialize Lessons (if present)
      const createdLessons: string[] = [];
      if (lessonItem) {
        const lessonPayload = lessonItem.payloadSnapshot as LessonPayload;
        type SessionOrOutlineItem = { title: string; contentMarkdown?: string; description?: string; estimatedMinutes?: number };
        const sessionList: Array<{ title: string; contentMarkdown: string; estimatedMinutes?: number }> =
          Array.isArray(lessonPayload.sessions) && lessonPayload.sessions.length > 0
            ? lessonPayload.sessions
            : Array.isArray(lessonPayload.outline) && lessonPayload.outline.length > 0
            ? (lessonPayload.outline as SessionOrOutlineItem[]).map((o) => ({
                title: o.title,
                contentMarkdown: o.description || o.contentMarkdown || "",
              }))
            : [
                {
                  title: lessonPayload.title || pack.title,
                  contentMarkdown: (lessonPayload as { contentMarkdown?: string }).contentMarkdown || "",
                },
              ];

        for (let idx = 0; idx < sessionList.length; idx++) {
          const sess = sessionList[idx];
          const lessonId = randomUUID();
          await tx.insert(lessons).values({
            id: lessonId,
            moduleId: insertedModule.id,
            title: sess.title,
            contentType: "markdown",
            contentMarkdown: sess.contentMarkdown || "",
            sortOrder: idx,
            estimatedMinutes: sess.estimatedMinutes ?? 10,
            publicationStatus: "published",
            createdAt: now,
            updatedAt: now,
          });
          createdLessons.push(lessonId);
        }
      }

      // 5. Materialize Flashcards (if present)
      let flashcardsCount = 0;
      if (flashcardItem) {
        type RawFlashcardItem = {
          front?: string;
          back?: string;
          question?: string;
          answer?: string;
          explanation?: string;
          cardType?: string;
          difficulty?: string;
          sessionIndex?: number;
        };
        type ExtendedFcPayload = FlashcardPayload & {
          flashcards?: RawFlashcardItem[];
          cards?: RawFlashcardItem[];
          question?: string;
          answer?: string;
        };
        const fcPayload = flashcardItem.payloadSnapshot as ExtendedFcPayload;
        const rawCards: RawFlashcardItem[] =
          Array.isArray(fcPayload.cards) && fcPayload.cards.length > 0
            ? fcPayload.cards
            : Array.isArray(fcPayload.flashcards) && fcPayload.flashcards.length > 0
            ? fcPayload.flashcards
            : fcPayload.question && fcPayload.answer
            ? [fcPayload]
            : [];

        if (rawCards.length > 0) {
          await tx.insert(flashcards).values(
            rawCards.map((c: RawFlashcardItem) => {
              let cLessonId: string | null = null;
              if (typeof c.sessionIndex === "number" && !isNaN(c.sessionIndex)) {
                if (c.sessionIndex >= 0 && c.sessionIndex < createdLessons.length) {
                  cLessonId = createdLessons[c.sessionIndex];
                }
              }
              if (!cLessonId && createdLessons.length > 0) {
                cLessonId = createdLessons[0];
              }

              return {
                id: randomUUID(),
                organizationId,
                courseId: targetCourseId,
                documentId: null,
                generatedContentId: null,
                lessonId: cLessonId,
                question: c.question || c.front || "Flashcard",
                answer: c.answer || c.back || "",
                explanation: c.explanation || null,
                cardType: c.cardType || "definition",
                difficulty: c.difficulty || "medium",
                dueAt: now,
                intervalDays: 0,
                easeFactor: "2.5",
                createdAt: now,
                updatedAt: now,
              };
            }),
          );
          flashcardsCount = rawCards.length;
        }
      }

      // 6. Materialize Quiz & Questions (if present)
      let quizzesCount = 0;
      let questionsCount = 0;
      if (quizItem) {
        type RawQuizQuestionItem = {
          question?: string;
          choices?: string[];
          options?: string[];
          correctAnswer?: string;
          correct_answer?: string;
          answer?: string;
          explanation?: string;
          sessionIndex?: number;
          topic?: string;
          difficulty?: string;
          questionType?: string;
        };
        type ExtendedQuizPayload = QuizPayload & {
          topic?: string;
          difficulty?: string;
          question?: string;
          questions?: RawQuizQuestionItem[];
        };
        const quizPayload = quizItem.payloadSnapshot as ExtendedQuizPayload;
        const quizId = randomUUID();
        await tx.insert(quizzes).values({
          id: quizId,
          organizationId,
          courseId: targetCourseId,
          documentId: null,
          title: quizPayload.title || `آزمون ${pack.title}`,
          topic: quizPayload.topic || pack.subject || null,
          difficulty: quizPayload.difficulty || "medium",
          status: "published",
          createdAt: now,
          updatedAt: now,
        });
        quizzesCount = 1;

        const rawQuestions: RawQuizQuestionItem[] =
          Array.isArray(quizPayload.questions) && quizPayload.questions.length > 0
            ? quizPayload.questions
            : quizPayload.question
            ? [quizPayload]
            : [];

        if (rawQuestions.length > 0) {
          const processedQuestions = rawQuestions.map((q: RawQuizQuestionItem, qIdx: number) => {
            let qLessonId: string | null = null;
            if (typeof q.sessionIndex === "number" && !isNaN(q.sessionIndex)) {
              if (q.sessionIndex >= 0 && q.sessionIndex < createdLessons.length) {
                qLessonId = createdLessons[q.sessionIndex];
              }
            }
            if (!qLessonId && createdLessons.length > 0) {
              qLessonId = createdLessons[0];
            }

            const rawChoices = q.choices || q.options || [];
            const rawAns = q.correctAnswer ?? q.correct_answer ?? q.answer;

            const shuffled = canonicalizeAndShuffleQuestion({
              question: q.question || "سوال آزمون",
              choices: rawChoices,
              correctAnswer: rawAns,
              explanation: q.explanation || null,
            });

            return {
              id: randomUUID(),
              quizId,
              generatedContentId: null,
              lessonId: qLessonId,
              question: shuffled.question || q.question || "سوال آزمون",
              topic: q.topic || quizPayload.topic || null,
              difficulty: q.difficulty || "medium",
              questionType: q.questionType || "multiple_choice",
              choices:
                shuffled.choices && shuffled.choices.length > 0
                  ? shuffled.choices
                  : rawChoices,
              correctAnswer: shuffled.correctAnswer,
              explanation: q.explanation || null,
              sortOrder: qIdx,
              createdAt: now,
              updatedAt: now,
            };
          });

          await tx.insert(quizQuestions).values(processedQuestions);
          questionsCount = rawQuestions.length;
        }
      }

      // 7. Materialize Review Summary (if present)
      let reviewSummaryCreated = false;
      if (reviewSummaryItem) {
        await tx.insert(generatedContents).values({
          id: randomUUID(),
          organizationId,
          courseId: targetCourseId,
          documentId: null,
          type: "review_summary",
          status: "accepted",
          payload: reviewSummaryItem.payloadSnapshot,
          promptVersion: "v1",
          model: "content-pack",
          acceptedAt: now,
          acceptedBy: userId,
          reviewedBy: userId,
          reviewedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        reviewSummaryCreated = true;
      }

      // 8. Record course installation usage with race condition safety
      try {
        await tx.insert(contentPackUsages).values({
          id: randomUUID(),
          contentPackId: pack.id,
          userId,
          targetCourseId,
          targetModuleId: insertedModule.id,
          addedAt: now,
        });
      } catch (err: unknown) {
        type ErrorWithCode = { code?: string; message?: string };
        const e = err as ErrorWithCode;
        if (
          e?.code === "23505" ||
          e?.message?.includes("idx_content_pack_usages_pack_user_course")
        ) {
          return {
            alreadyInstalled: true,
            moduleId: insertedModule.id as ModuleId,
            moduleTitle: insertedModule.title,
            lessonsCreated: 0,
            flashcardsCreated: 0,
            quizzesCreated: 0,
            quizQuestionsCreated: 0,
            reviewSummaryCreated: false,
          };
        }
        throw err;
      }

      // 9. Re-synchronize unique user count directly from database
      await tx
        .update(contentPacks)
        .set({
          usageCount: sql`(SELECT count(DISTINCT user_id)::int FROM content_pack_usages WHERE content_pack_id = ${pack.id})`,
          updatedAt: now,
        })
        .where(eq(contentPacks.id, pack.id));

      return {
        alreadyInstalled: false,
        moduleId: insertedModule.id as ModuleId,
        moduleTitle: insertedModule.title,
        lessonsCreated: createdLessons.length,
        flashcardsCreated: flashcardsCount,
        quizzesCreated: quizzesCount,
        quizQuestionsCreated: questionsCount,
        reviewSummaryCreated,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// DrizzleContentPackUsageStore
// ---------------------------------------------------------------------------

export class DrizzleContentPackUsageStore implements ContentPackUsageStore {
  constructor(private readonly db: DbClient) {}

  async recordUsage(usage: ContentPackUsageRecord): Promise<void> {
    await this.db
      .insert(contentPackUsages)
      .values({
        id: usage.id,
        contentPackId: usage.contentPackId,
        userId: usage.userId,
        targetCourseId: usage.targetCourseId,
        targetModuleId: usage.targetModuleId,
        addedAt: new Date(usage.addedAt),
      })
      .onConflictDoNothing();
  }

  async hasUserAdded(
    contentPackId: ContentPackId,
    userId: UserId,
  ): Promise<boolean> {
    const row = await this.db
      .select({ id: contentPackUsages.id })
      .from(contentPackUsages)
      .where(
        and(
          eq(contentPackUsages.contentPackId, contentPackId),
          eq(contentPackUsages.userId, userId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    return Boolean(row);
  }

  async findUsage(
    contentPackId: ContentPackId,
    userId: UserId,
    targetCourseId: CourseId,
  ): Promise<ContentPackUsageRecord | undefined> {
    const row = await this.db
      .select()
      .from(contentPackUsages)
      .where(
        and(
          eq(contentPackUsages.contentPackId, contentPackId),
          eq(contentPackUsages.userId, userId),
          eq(contentPackUsages.targetCourseId, targetCourseId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) return undefined;
    return {
      id: row.id as ContentPackUsageId,
      contentPackId: row.contentPackId as ContentPackId,
      userId: row.userId as UserId,
      targetCourseId: row.targetCourseId as CourseId,
      targetModuleId: (row.targetModuleId as ModuleId) ?? null,
      addedAt: row.addedAt.toISOString(),
    };
  }

  async getUniqueUserCount(contentPackId: ContentPackId): Promise<number> {
    const [{ count }] = await this.db
      .select({
        count: sql<number>`count(distinct ${contentPackUsages.userId})::int`,
      })
      .from(contentPackUsages)
      .where(eq(contentPackUsages.contentPackId, contentPackId));

    return Number(count || 0);
  }
}

