import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "@avana/database/client";
import {
  contentPacks,
  contentPackItems,
  contentPackUsages,
  courses,
  courseMemberships,
  flashcards,
  generatedContents,
  lessons,
  lessonProgress,
  modules,
  organizationMemberships,
  quizQuestions,
  quizzes,
  users,
} from "@avana/database/schema";
import type {
  ContentPackStore,
  ContentPackUsageStore,
  LibraryContentResource,
  LibraryCourseResource,
  ListCoursePackagesOptions,
  ListCoursePackagesResult,
  ListLibraryResourcesOptions,
  ListLibraryResourcesResult,
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
  type LessonId,
  type LessonPayload,
  type ModuleId,
  type OrganizationId,
  type QuizPayload,
  type UserId,
  DomainError,
  normalizeQuestionOptions,
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
      inArray(contentPacks.status, ["published", "pending_review", "approved"]),
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
      sql`(${contentPacks.metadata}->>'accessType' IS NULL OR ${contentPacks.metadata}->>'accessType' IN ('free', 'paid'))`,
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

            const normalized = normalizeQuestionOptions({
              question: q.question || "سوال آزمون",
              choices: rawChoices,
              correctAnswer: rawAns,
              explanation: q.explanation || null,
            });

            const shuffled = canonicalizeAndShuffleQuestion(normalized.normalized);

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

  async updateStatus(
    id: ContentPackId,
    status: ContentPackStatus,
    metadata?: ContentPackMetadata,
    publishedAt?: string,
  ): Promise<ContentPackRecord> {
    const now = new Date();
    const setFields: Record<string, unknown> = {
      status,
      updatedAt: now,
    };
    if (metadata !== undefined) {
      setFields.metadata = metadata;
    }
    if (publishedAt !== undefined) {
      setFields.publishedAt = new Date(publishedAt);
    }

    const [updated] = await this.db
      .update(contentPacks)
      .set(setFields)
      .where(eq(contentPacks.id, id))
      .returning();

    if (!updated) {
      throw new DomainError("not_found", "بسته آموزشی یافت نشد.");
    }
    return toContentPackRecord(updated);
  }

  async listAll(options: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: ContentPackRecord[]; totalCount: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions = [isNull(contentPacks.deletedAt)];

    if (options.status && options.status !== "all") {
      conditions.push(eq(contentPacks.status, options.status));
    }

    if (options.search && options.search.trim().length > 0) {
      const pattern = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(contentPacks.title, pattern),
          ilike(contentPacks.description, pattern),
          ilike(contentPacks.subject, pattern),
        )!,
      );
    }

    const whereClause = and(...conditions);

    const [{ totalCount }] = await this.db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(contentPacks)
      .where(whereClause);

    const rows = await this.db
      .select()
      .from(contentPacks)
      .where(whereClause)
      .orderBy(desc(contentPacks.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(toContentPackRecord),
      totalCount: Number(totalCount || 0),
    };
  }

  async listLibraryResources(
    options: ListLibraryResourcesOptions,
  ): Promise<ListLibraryResourcesResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = (page - 1) * limit;
    const fetchCourses = options.type !== "contents";
    const fetchContents = options.type !== "courses";
    const trimmedQ = options.q?.trim();
    const subject = options.subject?.trim();

    const userId = options.userId;
    const systemOrgId = options.systemOrganizationId;

    const accessConditions = [];
    if (userId) {
      accessConditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${organizationMemberships} om 
          WHERE om.organization_id = ${courses.organizationId} 
          AND om.user_id = ${userId}
        )`,
        sql`EXISTS (
          SELECT 1 FROM ${courseMemberships} cm 
          WHERE cm.course_id = ${courses.id} 
          AND cm.user_id = ${userId}
        )`,
      );
    }
    accessConditions.push(
      and(
        eq(courses.isOfficial, true),
        eq(courses.status, "published"),
      ),
    );
    if (systemOrgId) {
      accessConditions.push(
        and(
          eq(courses.organizationId, systemOrgId),
          eq(courses.status, "published"),
        ),
      );
    }

    const courseAccessFilter = or(...accessConditions)!;

    // Course filters
    const courseConditions = [
      isNull(courses.deletedAt),
      courseAccessFilter,
    ];

    if (subject && subject !== "all") {
      courseConditions.push(eq(courses.subject, subject));
    }

    if (trimmedQ) {
      const pattern = `%${trimmedQ}%`;
      courseConditions.push(
        or(
          ilike(courses.name, pattern),
          ilike(courses.description, pattern),
          ilike(courses.subject, pattern),
        )!,
      );
    }

    // Contents filters
    const contentConditions = [
      isNull(lessons.deletedAt),
      eq(lessons.publicationStatus, "published"),
      isNull(modules.deletedAt),
      isNull(courses.deletedAt),
      courseAccessFilter,
    ];

    if (subject && subject !== "all") {
      contentConditions.push(eq(courses.subject, subject));
    }

    if (trimmedQ) {
      const pattern = `%${trimmedQ}%`;
      contentConditions.push(
        or(
          ilike(lessons.title, pattern),
          ilike(modules.title, pattern),
          ilike(courses.name, pattern),
          ilike(courses.subject, pattern),
        )!,
      );
    }

    let courseResults: LibraryCourseResource[] = [];
    let totalCourses = 0;

    let contentResults: LibraryContentResource[] = [];
    let totalContents = 0;

    if (fetchCourses) {
      const [{ count: totalCourseCount }] = await this.db
        .select({ count: sql<number>`count(distinct ${courses.id})::int` })
        .from(courses)
        .where(and(...courseConditions));
      totalCourses = Number(totalCourseCount || 0);

      if (totalCourses > 0) {
        const courseRows = await this.db
          .select({
            id: courses.id,
            title: courses.name,
            description: courses.description,
            subject: courses.subject,
            createdAt: courses.createdAt,
            updatedAt: courses.updatedAt,
            moduleCount: sql<number>`count(distinct ${modules.id}) filter (where ${modules.deletedAt} is null)::int`,
            contentCount: sql<number>`count(distinct ${lessons.id}) filter (where ${lessons.deletedAt} is null and ${lessons.publicationStatus} = 'published')::int`,
            completedLessons: userId
              ? sql<number>`count(distinct ${lessonProgress.lessonId}) filter (where ${lessonProgress.userId} = ${userId} and ${lessonProgress.completed} = true)::int`
              : sql<number>`0::int`,
          })
          .from(courses)
          .leftJoin(modules, and(eq(modules.courseId, courses.id), isNull(modules.deletedAt)))
          .leftJoin(lessons, and(eq(lessons.moduleId, modules.id), isNull(lessons.deletedAt), eq(lessons.publicationStatus, "published")))
          .leftJoin(
            lessonProgress,
            userId
              ? and(
                  eq(lessonProgress.lessonId, lessons.id),
                  eq(lessonProgress.userId, userId),
                )
              : sql`false`,
          )
          .where(and(...courseConditions))
          .groupBy(courses.id)
          .orderBy(
            options.sort === "newest"
              ? desc(courses.createdAt)
              : desc(courses.updatedAt),
          )
          .limit(limit)
          .offset(offset);

        courseResults = courseRows.map((row) => {
          const total = Number(row.contentCount || 0);
          const completed = Number(row.completedLessons || 0);
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
          return {
            id: row.id as CourseId,
            title: row.title,
            description: row.description ?? null,
            subject: row.subject ?? null,
            moduleCount: Number(row.moduleCount || 0),
            contentCount: total,
            progress: {
              completedLessons: completed,
              totalLessons: total,
              percent,
            },
            href: `/courses/${row.id}`,
            createdAt:
              row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : new Date(row.createdAt).toISOString(),
            updatedAt:
              row.updatedAt instanceof Date
                ? row.updatedAt.toISOString()
                : new Date(row.updatedAt).toISOString(),
          };
        });
      }
    }

    if (fetchContents) {
      const [{ count: totalContentCount }] = await this.db
        .select({ count: sql<number>`count(distinct ${lessons.id})::int` })
        .from(lessons)
        .innerJoin(modules, and(eq(lessons.moduleId, modules.id), isNull(modules.deletedAt)))
        .innerJoin(courses, and(eq(modules.courseId, courses.id), isNull(courses.deletedAt)))
        .where(and(...contentConditions));
      totalContents = Number(totalContentCount || 0);

      if (totalContents > 0) {
        const contentRows = await this.db
          .select({
            id: lessons.id,
            title: lessons.title,
            contentType: lessons.contentType,
            estimatedMinutes: lessons.estimatedMinutes,
            createdAt: lessons.createdAt,
            updatedAt: lessons.updatedAt,
            moduleId: modules.id,
            moduleTitle: modules.title,
            courseId: courses.id,
            courseTitle: courses.name,
            completed: userId ? lessonProgress.completed : sql<boolean>`false`,
            completedAt: userId ? lessonProgress.completedAt : sql<Date | null>`null`,
          })
          .from(lessons)
          .innerJoin(modules, and(eq(lessons.moduleId, modules.id), isNull(modules.deletedAt)))
          .innerJoin(courses, and(eq(modules.courseId, courses.id), isNull(courses.deletedAt)))
          .leftJoin(
            lessonProgress,
            userId
              ? and(
                  eq(lessonProgress.lessonId, lessons.id),
                  eq(lessonProgress.userId, userId),
                )
              : sql`false`,
          )
          .where(and(...contentConditions))
          .orderBy(
            options.sort === "newest"
              ? desc(lessons.createdAt)
              : desc(lessons.updatedAt),
          )
          .limit(limit)
          .offset(offset);

        contentResults = contentRows.map((row) => ({
          id: row.id,
          title: row.title,
          type: "lesson" as const,
          courseId: row.courseId as CourseId,
          courseTitle: row.courseTitle,
          moduleId: row.moduleId as ModuleId,
          moduleTitle: row.moduleTitle,
          lessonId: row.id as LessonId,
          estimatedMinutes: row.estimatedMinutes ?? null,
          completed: Boolean(row.completed),
          completedAt: row.completedAt
            ? row.completedAt instanceof Date
              ? row.completedAt.toISOString()
              : new Date(row.completedAt).toISOString()
            : null,
          href: `/courses/${row.courseId}?lessonId=${row.id}`,
          createdAt:
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : new Date(row.createdAt).toISOString(),
          updatedAt:
            row.updatedAt instanceof Date
              ? row.updatedAt.toISOString()
              : new Date(row.updatedAt).toISOString(),
        }));
      }
    }

    return {
      courses: courseResults,
      contents: contentResults,
      totalCourses,
      totalContents,
    };
  }

  async listCoursePackages(
    options: ListCoursePackagesOptions,
  ): Promise<ListCoursePackagesResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = (page - 1) * limit;
    const trimmedQ = options.q?.trim();
    const subject = options.subject?.trim();
    const userId = options.userId;
    const systemOrgId = options.systemOrganizationId;
    const filterCourseId = options.courseId;

    const accessConditions = [];
    if (userId) {
      accessConditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${organizationMemberships} om 
          WHERE om.organization_id = ${courses.organizationId} 
          AND om.user_id = ${userId}
        )`,
        sql`EXISTS (
          SELECT 1 FROM ${courseMemberships} cm 
          WHERE cm.course_id = ${courses.id} 
          AND cm.user_id = ${userId}
        )`,
      );
    }
    accessConditions.push(
      and(
        eq(courses.isOfficial, true),
        eq(courses.status, "published"),
      ),
    );
    if (systemOrgId) {
      accessConditions.push(
        and(
          eq(courses.organizationId, systemOrgId),
          eq(courses.status, "published"),
        ),
      );
    }

    const courseConditions = [
      isNull(courses.deletedAt),
      or(...accessConditions)!,
    ];

    if (filterCourseId) {
      courseConditions.push(eq(courses.id, filterCourseId));
    }

    if (subject && subject !== "all") {
      courseConditions.push(eq(courses.subject, subject));
    }

    if (trimmedQ) {
      const pattern = `%${trimmedQ}%`;
      courseConditions.push(
        or(
          ilike(courses.name, pattern),
          ilike(courses.description, pattern),
          ilike(courses.subject, pattern),
          sql`EXISTS (
            SELECT 1 FROM ${modules} m
            WHERE m.course_id = ${courses.id}
            AND m.deleted_at IS NULL
            AND (m.title ILIKE ${pattern} OR m.description ILIKE ${pattern})
          )`,
          sql`EXISTS (
            SELECT 1 FROM ${modules} m
            JOIN ${lessons} l ON l.module_id = m.id
            WHERE m.course_id = ${courses.id}
            AND m.deleted_at IS NULL
            AND l.deleted_at IS NULL
            AND l.title ILIKE ${pattern}
          )`,
        )!,
      );
    }

    // 1. Count total matching courses
    const [{ count: totalCourseCount }] = await this.db
      .select({ count: sql<number>`count(distinct ${courses.id})::int` })
      .from(courses)
      .where(and(...courseConditions));
    const totalCourses = Number(totalCourseCount || 0);

    if (totalCourses === 0) {
      return {
        courses: [],
        totalCourses: 0,
        totalPackages: 0,
      };
    }

    // 2. Fetch courses for current page
    const courseRows = await this.db
      .select({
        id: courses.id,
        title: courses.name,
        description: courses.description,
        subject: courses.subject,
        isOfficial: courses.isOfficial,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
      })
      .from(courses)
      .where(and(...courseConditions))
      .orderBy(
        options.sort === "newest"
          ? desc(courses.createdAt)
          : desc(courses.updatedAt),
      )
      .limit(limit)
      .offset(offset);

    const courseIds = courseRows.map((c) => c.id);
    if (courseIds.length === 0) {
      return {
        courses: [],
        totalCourses: 0,
        totalPackages: 0,
      };
    }

    // 3. Batch fetch all active modules for these courses
    const moduleRows = await this.db
      .select({
        id: modules.id,
        courseId: modules.courseId,
        documentId: modules.documentId,
        title: modules.title,
        description: modules.description,
        sortOrder: modules.sortOrder,
        createdAt: modules.createdAt,
        updatedAt: modules.updatedAt,
      })
      .from(modules)
      .where(
        and(
          inArray(modules.courseId, courseIds),
          isNull(modules.deletedAt),
        ),
      )
      .orderBy(modules.courseId, modules.sortOrder);

    const moduleIds = moduleRows.map((m) => m.id);
    const documentIds = moduleRows
      .map((m) => m.documentId)
      .filter((d): d is string => Boolean(d));

    // 4. Batch fetch lessons for these modules
    let lessonRows: Array<{
      id: string;
      moduleId: string;
      title: string;
      estimatedMinutes: number | null;
      publicationStatus: string;
      sortOrder: number;
    }> = [];

    if (moduleIds.length > 0) {
      lessonRows = await this.db
        .select({
          id: lessons.id,
          moduleId: lessons.moduleId,
          title: lessons.title,
          estimatedMinutes: lessons.estimatedMinutes,
          publicationStatus: lessons.publicationStatus,
          sortOrder: lessons.sortOrder,
        })
        .from(lessons)
        .where(
          and(
            inArray(lessons.moduleId, moduleIds),
            isNull(lessons.deletedAt),
            eq(lessons.publicationStatus, "published"),
          ),
        )
        .orderBy(lessons.moduleId, lessons.sortOrder);
    }

    const lessonsByModuleId = new Map<string, typeof lessonRows>();
    for (const l of lessonRows) {
      const arr = lessonsByModuleId.get(l.moduleId) ?? [];
      arr.push(l);
      lessonsByModuleId.set(l.moduleId, arr);
    }

    // 5. Batch fetch flashcards count
    const flashcardCountsByDoc = new Map<string, number>();
    const flashcardCountsByLesson = new Map<string, number>();

    const flashcardRows = await this.db
      .select({
        id: flashcards.id,
        documentId: flashcards.documentId,
        lessonId: flashcards.lessonId,
      })
      .from(flashcards)
      .where(
        and(
          inArray(flashcards.courseId, courseIds),
          isNull(flashcards.deletedAt),
        ),
      );

    for (const fc of flashcardRows) {
      if (fc.documentId) {
        flashcardCountsByDoc.set(
          fc.documentId,
          (flashcardCountsByDoc.get(fc.documentId) ?? 0) + 1,
        );
      }
      if (fc.lessonId) {
        flashcardCountsByLesson.set(
          fc.lessonId,
          (flashcardCountsByLesson.get(fc.lessonId) ?? 0) + 1,
        );
      }
    }

    // 6. Batch fetch quizzes and quiz questions count
    const quizzesByDoc = new Map<
      string,
      { id: string; title: string; questionCount: number }
    >();

    const quizRows = await this.db
      .select({
        id: quizzes.id,
        documentId: quizzes.documentId,
        title: quizzes.title,
        questionCount: sql<number>`count(${quizQuestions.id})::int`,
      })
      .from(quizzes)
      .leftJoin(
        quizQuestions,
        eq(quizQuestions.quizId, quizzes.id),
      )
      .where(
        and(
          inArray(quizzes.courseId, courseIds),
          isNull(quizzes.deletedAt),
        ),
      )
      .groupBy(quizzes.id, quizzes.documentId, quizzes.title);

    for (const qz of quizRows) {
      if (qz.documentId) {
        quizzesByDoc.set(qz.documentId, {
          id: qz.id,
          title: qz.title,
          questionCount: Number(qz.questionCount || 0),
        });
      }
    }

    // 7. Batch fetch review summaries from generatedContents
    const summariesByDoc = new Map<
      string,
      { title: string; overview: string; estimatedReadingMinutes?: number }
    >();

    if (documentIds.length > 0) {
      const summaryRows = await this.db
        .select({
          id: generatedContents.id,
          documentId: generatedContents.documentId,
          payload: generatedContents.payload,
        })
        .from(generatedContents)
        .where(
          and(
            inArray(generatedContents.documentId, documentIds),
            eq(generatedContents.type, "review_summary"),
            eq(generatedContents.status, "accepted"),
            isNull(generatedContents.deletedAt),
          ),
        );

      for (const s of summaryRows) {
        if (s.documentId && s.payload) {
          const p = s.payload as Record<string, any>;
          summariesByDoc.set(s.documentId, {
            title: p.title || "خلاصه و جمع‌بندی نکات",
            overview: p.overview || "",
            estimatedReadingMinutes: p.estimatedReadingMinutes ?? 5,
          });
        }
      }
    }

    // 8. Batch fetch published content packs for these documents
    const contentPacksByDoc = new Map<string, ContentPackRecord>();
    if (documentIds.length > 0) {
      const packRows = await this.db
        .select()
        .from(contentPacks)
        .where(
          and(
            inArray(contentPacks.sourceDocumentId, documentIds),
            eq(contentPacks.status, "published"),
            isNull(contentPacks.deletedAt),
          ),
        );

      for (const pr of packRows) {
        if (pr.sourceDocumentId) {
          contentPacksByDoc.set(pr.sourceDocumentId, toContentPackRecord(pr));
        }
      }
    }

    // 9. Group by Course -> Chapter Packages
    const modulesByCourseId = new Map<string, typeof moduleRows>();
    for (const m of moduleRows) {
      const arr = modulesByCourseId.get(m.courseId) ?? [];
      arr.push(m);
      modulesByCourseId.set(m.courseId, arr);
    }

    let grandTotalPackages = 0;
    const coursesResult: import("@avana/domain").CourseWithChapterPackages[] = [];

    for (const courseRow of courseRows) {
      const courseModules = modulesByCourseId.get(courseRow.id) ?? [];
      const chapterPackages: import("@avana/domain").ChapterPackageItem[] = [];

      for (const mod of courseModules) {
        const modLessons = lessonsByModuleId.get(mod.id) ?? [];
        const attachedPack = mod.documentId
          ? contentPacksByDoc.get(mod.documentId)
          : undefined;

        // Flashcards count
        let fcCount = 0;
        if (mod.documentId && flashcardCountsByDoc.has(mod.documentId)) {
          fcCount = flashcardCountsByDoc.get(mod.documentId)!;
        } else {
          for (const l of modLessons) {
            fcCount += flashcardCountsByLesson.get(l.id) ?? 0;
          }
        }
        if (fcCount === 0 && attachedPack?.metadata?.flashcardCount) {
          fcCount = attachedPack.metadata.flashcardCount;
        }

        // Quiz
        let quizInfo: { id?: string; title?: string; questionCount: number } | undefined;
        if (mod.documentId && quizzesByDoc.has(mod.documentId)) {
          quizInfo = quizzesByDoc.get(mod.documentId);
        } else if (attachedPack?.metadata?.quizQuestionCount) {
          quizInfo = {
            title: `آزمون ${mod.title}`,
            questionCount: attachedPack.metadata.quizQuestionCount,
          };
        }

        // Summary
        let summaryInfo: { title?: string; overview?: string; estimatedReadingMinutes?: number } | undefined;
        if (mod.documentId && summariesByDoc.has(mod.documentId)) {
          summaryInfo = summariesByDoc.get(mod.documentId);
        }

        // Lesson metrics
        const lessonCount = modLessons.length;
        const totalLessonMinutes = modLessons.reduce(
          (acc, cur) => acc + (cur.estimatedMinutes ?? 10),
          0,
        );

        const hasLesson = lessonCount > 0;
        const hasSummary = Boolean(summaryInfo);
        const hasFlashcards = fcCount > 0;
        const hasQuiz = Boolean(quizInfo && quizInfo.questionCount > 0);

        const totalItems =
          (hasLesson ? 1 : 0) +
          (hasSummary ? 1 : 0) +
          (hasFlashcards ? 1 : 0) +
          (hasQuiz ? 1 : 0);

        // If a chapter has no contents at all, do not render as sellable package
        if (totalItems === 0) {
          continue;
        }

        const completeness: import("@avana/domain").ChapterPackageCompleteness =
          totalItems === 4 ? "complete" : "partial";

        const totalReadingMinutes =
          totalLessonMinutes + (summaryInfo?.estimatedReadingMinutes ?? 0);

        const pkgItem: import("@avana/domain").ChapterPackageItem = {
          id: attachedPack?.id ?? mod.id,
          moduleId: mod.id,
          courseId: courseRow.id,
          courseTitle: courseRow.title,
          title: mod.title,
          description: mod.description ?? attachedPack?.description ?? null,
          subject: courseRow.subject ?? attachedPack?.subject ?? null,
          sortOrder: mod.sortOrder,
          documentId: mod.documentId ?? null,
          contentPackId: attachedPack?.id ?? null,
          contents: {
            lesson: {
              exists: hasLesson,
              count: lessonCount,
              estimatedMinutes: totalLessonMinutes,
              title: modLessons[0]?.title,
              lessonId: modLessons[0]?.id,
            },
            summary: {
              exists: hasSummary,
              title: summaryInfo?.title,
              overview: summaryInfo?.overview,
              estimatedMinutes: summaryInfo?.estimatedReadingMinutes,
            },
            flashcards: {
              exists: hasFlashcards,
              count: fcCount,
            },
            quiz: {
              exists: hasQuiz,
              quizId: quizInfo?.id,
              title: quizInfo?.title,
              questionCount: quizInfo?.questionCount ?? 0,
            },
          },
          stats: {
            totalItems,
            lessonCount,
            flashcardCount: fcCount,
            quizQuestionCount: quizInfo?.questionCount ?? 0,
            estimatedReadingMinutes: totalReadingMinutes,
          },
          completeness,
          access: {
            isFree: false,
            isPurchased: false,
            hasAccess: false,
            accessSource: null,
          },
          purchase: {
            price: 0,
            currency: "toman",
            canPurchase: true,
            productId: null,
          },
          createdAt:
            mod.createdAt instanceof Date
              ? mod.createdAt.toISOString()
              : new Date(mod.createdAt).toISOString(),
          updatedAt:
            mod.updatedAt instanceof Date
              ? mod.updatedAt.toISOString()
              : new Date(mod.updatedAt).toISOString(),
        };

        chapterPackages.push(pkgItem);
      }

      grandTotalPackages += chapterPackages.length;

      coursesResult.push({
        id: courseRow.id,
        title: courseRow.title,
        description: courseRow.description,
        subject: courseRow.subject,
        isOfficial: courseRow.isOfficial,
        totalPackages: chapterPackages.length,
        packages: chapterPackages,
        createdAt:
          courseRow.createdAt instanceof Date
            ? courseRow.createdAt.toISOString()
            : new Date(courseRow.createdAt).toISOString(),
        updatedAt:
          courseRow.updatedAt instanceof Date
            ? courseRow.updatedAt.toISOString()
            : new Date(courseRow.updatedAt).toISOString(),
      });
    }

    return {
      courses: coursesResult,
      totalCourses,
      totalPackages: grandTotalPackages,
    };
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

