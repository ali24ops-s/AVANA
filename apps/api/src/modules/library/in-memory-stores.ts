import { randomUUID } from "node:crypto";
import {
  type ContentPackId,
  type ContentPackItemRecord,
  type ContentPackRecord,
  type ContentPackUsageId,
  type ContentPackUsageRecord,
  type CourseId,
  type DocumentId,
  type FlashcardId,
  type FlashcardPayload,
  type GeneratedContentId,
  type LessonId,
  type LessonPayload,
  type ModuleId,
  type OrganizationId,
  type QuizId,
  type QuizPayload,
  type QuizQuestionId,
  type UserId,
  DomainError,
  canonicalizeAndShuffleQuestion,
} from "@avana/domain";
import type {
  ContentPackStore,
  ContentPackUsageStore,
  ListPublishedPacksOptions,
  ListPublishedPacksResult,
  MaterializationResult,
  MaterializeToCourseInput,
} from "./library-store.js";
import type { UserStore } from "../identity/user-store.js";
import type {
  ModuleStore,
  LessonStore,
} from "../learning/learning-store.js";
import type {
  FlashcardStore,
  QuizStore,
  QuizQuestionStore,
} from "../study/index.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";

export class InMemoryContentPackStore implements ContentPackStore {
  private readonly packs = new Map<string, ContentPackRecord>();
  private readonly items = new Map<string, ContentPackItemRecord[]>();

  constructor(
    private readonly userStore?: UserStore,
    private readonly moduleStore?: ModuleStore,
    private readonly lessonStore?: LessonStore,
    private readonly flashcardStore?: FlashcardStore,
    private readonly quizStore?: QuizStore,
    private readonly quizQuestionStore?: QuizQuestionStore,
    private readonly generatedContentStore?: GeneratedContentStore,
    private usageStore?: ContentPackUsageStore,
  ) {}

  setUsageStore(usageStore: ContentPackUsageStore) {
    this.usageStore = usageStore;
  }

  async create(
    pack: ContentPackRecord,
    items: ContentPackItemRecord[],
  ): Promise<ContentPackRecord> {
    if (pack.sourceDocumentId && pack.status === "published") {
      const active = await this.findActiveByDocument(
        pack.sourceDocumentId,
        pack.organizationId ?? undefined,
      );
      if (active) {
        throw new DomainError(
          "conflict",
          "یک بسته آموزشی فعال و منتشرشده برای این سند از قبل وجود دارد.",
        );
      }
    }

    this.packs.set(pack.id, { ...pack });
    this.items.set(
      pack.id,
      items.map((it) => ({
        ...it,
        payloadSnapshot: JSON.parse(JSON.stringify(it.payloadSnapshot)),
      })),
    );
    return { ...pack };
  }

  async findById(id: ContentPackId): Promise<ContentPackRecord | undefined> {
    const pack = this.packs.get(id);
    if (!pack || pack.deletedAt !== null) return undefined;
    return { ...pack };
  }

  async findActiveByDocument(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<ContentPackRecord | undefined> {
    for (const pack of this.packs.values()) {
      if (
        pack.sourceDocumentId === documentId &&
        pack.status === "published" &&
        pack.deletedAt === null
      ) {
        if (!organizationId || pack.organizationId === organizationId) {
          return { ...pack };
        }
      }
    }
    return undefined;
  }

  async listPublished(
    options: ListPublishedPacksOptions,
  ): Promise<ListPublishedPacksResult> {
    let list = Array.from(this.packs.values()).filter(
      (p) => p.status === "published" && p.deletedAt === null,
    );

    if (options.subject && options.subject.trim().length > 0) {
      const subj = options.subject.trim();
      list = list.filter((p) => p.subject === subj);
    }

    if (options.q && options.q.trim().length > 0) {
      const query = options.q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query)) ||
          (p.subject && p.subject.toLowerCase().includes(query)),
      );
    }

    const totalCount = list.length;

    // Sorting
    if (options.sort === "newest") {
      list.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
    } else {
      list.sort((a, b) => {
        if (b.usageCount !== a.usageCount) {
          return b.usageCount - a.usageCount;
        }
        return (
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
      });
    }

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit).map((p) => ({ ...p }));

    return {
      items,
      totalCount,
    };
  }

  async findItemsByPackId(
    packId: ContentPackId,
  ): Promise<ContentPackItemRecord[]> {
    const list = this.items.get(packId) ?? [];
    return list.map((it) => ({
      ...it,
      payloadSnapshot: JSON.parse(JSON.stringify(it.payloadSnapshot)),
    }));
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
    if (this.userStore) {
      const user = await this.userStore.findById(userId);
      if (user) {
        return {
          id: user.id,
          name: user.name || "کاربر آوانا",
        };
      }
    }
    return {
      id: userId as string,
      name: "کاربر آوانا",
    };
  }

  async findUsage(
    packId: ContentPackId,
    userId: UserId,
    targetCourseId: CourseId,
  ): Promise<ContentPackUsageRecord | undefined> {
    if (this.usageStore) {
      return this.usageStore.findUsage(packId, userId, targetCourseId);
    }
    return undefined;
  }

  async materializeToCourse(
    input: MaterializeToCourseInput,
  ): Promise<MaterializationResult> {
    const { pack, items, userId, organizationId, targetCourseId } = input;
    const now = new Date().toISOString();

    // 1. Idempotency check
    if (this.usageStore) {
      const existing = await this.usageStore.findUsage(
        pack.id,
        userId,
        targetCourseId,
      );
      if (existing) {
        return {
          alreadyInstalled: true,
          moduleId: existing.targetModuleId ?? ("" as ModuleId),
          moduleTitle: pack.title,
          lessonsCreated: 0,
          flashcardsCreated: 0,
          quizzesCreated: 0,
          quizQuestionsCreated: 0,
          reviewSummaryCreated: false,
        };
      }
    }

    // 2. Validate items
    if (!items || items.length === 0) {
      throw new Error(
        "Cannot materialize empty Content Pack: missing content items.",
      );
    }

    const lessonItem = items.find((i) => i.contentType === "lesson");
    const flashcardItem = items.find((i) => i.contentType === "flashcard");
    const quizItem = items.find((i) => i.contentType === "quiz");
    const reviewSummaryItem = items.find((i) => i.contentType === "review_summary");

    // 3. Create Module
    const moduleId = randomUUID() as ModuleId;
    if (this.moduleStore) {
      const existingCourseModules = await this.moduleStore.listByCourse(targetCourseId);
      await this.moduleStore.create({
        id: moduleId,
        courseId: targetCourseId,
        documentId: null,
        title: pack.title,
        description: pack.description,
        sortOrder: existingCourseModules.length,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    }

    // 4. Create Lessons (if present)
    const createdLessons: LessonId[] = [];
    if (lessonItem) {
      const lessonPayload = lessonItem.payloadSnapshot as LessonPayload;
      const sessionList: Array<{ title: string; contentMarkdown: string; estimatedMinutes?: number }> =
        Array.isArray(lessonPayload.sessions) && lessonPayload.sessions.length > 0
          ? lessonPayload.sessions
          : Array.isArray(lessonPayload.outline) && lessonPayload.outline.length > 0
          ? lessonPayload.outline.map((o) => ({
              title: o.title,
              contentMarkdown: (o as any).description || "",
            }))
          : [
              {
                title: lessonPayload.title || pack.title,
                contentMarkdown: (lessonPayload as any).contentMarkdown || "",
              },
            ];

      if (this.lessonStore) {
        for (let idx = 0; idx < sessionList.length; idx++) {
          const sess = sessionList[idx];
          const lessonId = randomUUID() as LessonId;
          await this.lessonStore.create({
            id: lessonId,
            moduleId,
            title: sess.title,
            contentType: "markdown",
            contentMarkdown: sess.contentMarkdown || "",
            sortOrder: idx,
            estimatedMinutes: sess.estimatedMinutes ?? 10,
            publicationStatus: "published",
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          createdLessons.push(lessonId);
        }
      }
    }

    // 5. Create Flashcards (if present)
    let flashcardsCount = 0;
    if (flashcardItem) {
      const fcPayload = flashcardItem.payloadSnapshot as FlashcardPayload;
      const rawCards =
        Array.isArray(fcPayload.cards) && fcPayload.cards.length > 0
          ? fcPayload.cards
          : Array.isArray((fcPayload as any).flashcards) && (fcPayload as any).flashcards.length > 0
          ? (fcPayload as any).flashcards
          : (fcPayload as any).question && (fcPayload as any).answer
          ? [fcPayload as any]
          : [];

      if (this.flashcardStore && rawCards.length > 0) {
        const cardsToCreate = rawCards.map((c: any) => {
          let cLessonId: LessonId | null = null;
          if (typeof c.sessionIndex === "number" && !isNaN(c.sessionIndex)) {
            if (c.sessionIndex >= 0 && c.sessionIndex < createdLessons.length) {
              cLessonId = createdLessons[c.sessionIndex];
            }
          }
          if (!cLessonId && createdLessons.length > 0) {
            cLessonId = createdLessons[0];
          }

          return {
            id: randomUUID() as FlashcardId,
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
            easeFactor: 2.5,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
        });

        await this.flashcardStore.createMany(cardsToCreate);
        flashcardsCount = cardsToCreate.length;
      }
    }

    // 6. Create Quiz & Questions (if present)
    let quizzesCount = 0;
    let questionsCount = 0;
    if (quizItem) {
      const quizPayload = quizItem.payloadSnapshot as QuizPayload;
      const quizId = randomUUID() as QuizId;
      if (this.quizStore) {
        await this.quizStore.create({
          id: quizId,
          organizationId,
          courseId: targetCourseId,
          documentId: null,
          title: quizPayload.title || `آزمون ${pack.title}`,
          topic: (quizPayload as any).topic || pack.subject || null,
          difficulty: (quizPayload as any).difficulty || "medium",
          status: "published",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        quizzesCount = 1;
      }

      const rawQuestions =
        Array.isArray(quizPayload.questions) && quizPayload.questions.length > 0
          ? quizPayload.questions
          : (quizPayload as any).question
          ? [quizPayload as any]
          : [];

      if (this.quizQuestionStore && rawQuestions.length > 0) {
        const questionsToCreate = rawQuestions.map((q: any, qIdx: number) => {
          let qLessonId: LessonId | null = null;
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
            id: randomUUID() as QuizQuestionId,
            quizId,
            generatedContentId: null,
            lessonId: qLessonId,
            question: shuffled.question || q.question || "سوال آزمون",
            topic: q.topic || (quizPayload as any).topic || null,
            difficulty: q.difficulty || "medium",
            questionType: (q.questionType as any) || "multiple_choice",
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

        await this.quizQuestionStore.createMany(questionsToCreate);
        questionsCount = questionsToCreate.length;
      }
    }

    // 7. Create Review Summary (if present)
    let reviewSummaryCreated = false;
    if (reviewSummaryItem) {
      if (this.generatedContentStore) {
        await this.generatedContentStore.create({
          id: randomUUID() as GeneratedContentId,
          organizationId,
          courseId: targetCourseId,
          documentId: null,
          type: "review_summary",
          status: "accepted",
          payload: reviewSummaryItem.payloadSnapshot,
          promptVersion: "v1",
          model: "content-pack",
          tokenUsage: null,
          generationKey: null,
          acceptedAt: now,
          acceptedBy: userId,
          reviewedBy: userId,
          reviewedAt: now,
          reviewReason: null,
          editedBy: null,
          editedAt: null,
          previousPayload: null,
          materializedLessonId: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
      reviewSummaryCreated = true;
    }

    // 8. Record usage & update unique user usage count
    if (this.usageStore) {
      await this.usageStore.recordUsage({
        id: randomUUID() as ContentPackUsageId,
        contentPackId: pack.id,
        userId,
        targetCourseId,
        targetModuleId: moduleId,
        addedAt: now,
      });

      const uniqueCount = await this.usageStore.getUniqueUserCount(pack.id);
      pack.usageCount = uniqueCount;
      this.packs.set(pack.id, { ...pack });
    }

    return {
      alreadyInstalled: false,
      moduleId,
      moduleTitle: pack.title,
      lessonsCreated: createdLessons.length,
      flashcardsCreated: flashcardsCount,
      quizzesCreated: quizzesCount,
      quizQuestionsCreated: questionsCount,
      reviewSummaryCreated,
    };
  }
}

export class InMemoryContentPackUsageStore implements ContentPackUsageStore {
  private readonly usages = new Map<string, ContentPackUsageRecord>();

  async recordUsage(usage: ContentPackUsageRecord): Promise<void> {
    const key = `${usage.contentPackId}:${usage.userId}:${usage.targetCourseId}`;
    if (!this.usages.has(key)) {
      this.usages.set(key, { ...usage });
    }
  }

  async hasUserAdded(
    contentPackId: ContentPackId,
    userId: UserId,
  ): Promise<boolean> {
    for (const u of this.usages.values()) {
      if (u.contentPackId === contentPackId && u.userId === userId) {
        return true;
      }
    }
    return false;
  }

  async findUsage(
    contentPackId: ContentPackId,
    userId: UserId,
    targetCourseId: CourseId,
  ): Promise<ContentPackUsageRecord | undefined> {
    const key = `${contentPackId}:${userId}:${targetCourseId}`;
    const usage = this.usages.get(key);
    if (usage) return { ...usage };
    return undefined;
  }

  async getUniqueUserCount(contentPackId: ContentPackId): Promise<number> {
    const uniqueUsers = new Set<string>();
    for (const u of this.usages.values()) {
      if (u.contentPackId === contentPackId) {
        uniqueUsers.add(u.userId);
      }
    }
    return uniqueUsers.size;
  }
}

