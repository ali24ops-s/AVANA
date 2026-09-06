import { randomUUID } from "node:crypto";
import {
  type ContentPackId,
  type ContentPackItemRecord,
  type ContentPackMetadata,
  type ContentPackRecord,
  type ContentPackStatus,
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
  normalizeQuestionOptions,
  canonicalizeAndShuffleQuestion,
} from "@avana/domain";
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
import type { UserStore } from "../identity/user-store.js";
import type {
  ModuleStore,
  LessonStore,
  ProgressStore,
} from "../learning/learning-store.js";
import type { CourseStore, CourseRecord } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
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
    private readonly courseStore?: CourseStore,
    private readonly progressStore?: ProgressStore,
    _organizationStore?: OrganizationStore,
  ) {}

  setUsageStore(usageStore: ContentPackUsageStore) {
    this.usageStore = usageStore;
  }

  async create(
    pack: ContentPackRecord,
    items: ContentPackItemRecord[],
  ): Promise<ContentPackRecord> {
    if (
      pack.sourceDocumentId &&
      (pack.status === "published" ||
        pack.status === "pending_review" ||
        pack.status === "approved")
    ) {
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
        (pack.status === "published" ||
          pack.status === "pending_review" ||
          pack.status === "approved") &&
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
      (p) =>
        p.status === "published" &&
        p.deletedAt === null &&
        (!p.metadata?.accessType || p.metadata?.accessType === "free" || p.metadata?.accessType === "paid"),
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

      if (this.flashcardStore && rawCards.length > 0) {
        const cardsToCreate = rawCards.map((c: RawFlashcardItem) => {
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
        questionType?: "multiple_choice" | "true_false" | "fill_blank";
      };
      type ExtendedQuizPayload = QuizPayload & {
        topic?: string;
        difficulty?: string;
        question?: string;
        questions?: RawQuizQuestionItem[];
      };
      const quizPayload = quizItem.payloadSnapshot as ExtendedQuizPayload;
      const quizId = randomUUID() as QuizId;
      if (this.quizStore) {
        await this.quizStore.create({
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
          deletedAt: null,
        });
        quizzesCount = 1;
      }

      const rawQuestions: RawQuizQuestionItem[] =
        Array.isArray(quizPayload.questions) && quizPayload.questions.length > 0
          ? quizPayload.questions
          : quizPayload.question
          ? [quizPayload]
          : [];

      if (this.quizQuestionStore && rawQuestions.length > 0) {
        const questionsToCreate = rawQuestions.map((q: RawQuizQuestionItem, qIdx: number) => {
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

          const normalized = normalizeQuestionOptions({
            question: q.question || "سوال آزمون",
            choices: rawChoices,
            correctAnswer: rawAns,
            explanation: q.explanation || null,
          });

          const shuffled = canonicalizeAndShuffleQuestion(normalized.normalized);

          return {
            id: randomUUID() as QuizQuestionId,
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

  async updateStatus(
    id: ContentPackId,
    status: ContentPackStatus,
    metadata?: ContentPackMetadata,
    publishedAt?: string,
  ): Promise<ContentPackRecord> {
    const pack = this.packs.get(id);
    if (!pack || pack.deletedAt !== null) {
      throw new DomainError("not_found", "بسته آموزشی یافت نشد.");
    }
    const now = new Date().toISOString();
    pack.status = status;
    pack.updatedAt = now;
    if (metadata !== undefined) {
      pack.metadata = { ...pack.metadata, ...metadata };
    }
    if (publishedAt !== undefined) {
      pack.publishedAt = publishedAt;
    }
    this.packs.set(id, { ...pack });
    return { ...pack };
  }

  async listAll(options: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: ContentPackRecord[]; totalCount: number }> {
    let list = Array.from(this.packs.values()).filter(
      (p) => p.deletedAt === null,
    );

    if (options.status && options.status !== "all") {
      list = list.filter((p) => p.status === options.status);
    }

    if (options.search && options.search.trim().length > 0) {
      const query = options.search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query)) ||
          (p.subject && p.subject.toLowerCase().includes(query)),
      );
    }

    const totalCount = list.length;
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const start = (page - 1) * limit;
    const items = list.slice(start, start + limit).map((p) => ({ ...p }));

    return {
      items,
      totalCount,
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
    const trimmedQ = options.q?.trim().toLowerCase();
    const subject = options.subject?.trim();
    const userId = options.userId;

    let accessibleCourses: CourseRecord[] = [];
    if (this.courseStore) {
      if (userId) {
        const userCourses = await this.courseStore.listUserCourses(
          userId,
          undefined,
          options.systemOrganizationId,
        );
        accessibleCourses = userCourses.filter((c) => !c.deletedAt);
      }
    }

    if (subject && subject !== "all") {
      accessibleCourses = accessibleCourses.filter((c) => c.subject === subject);
    }

    const courseResults: LibraryCourseResource[] = [];
    const contentResults: LibraryContentResource[] = [];

    for (const course of accessibleCourses) {
      const courseModules = this.moduleStore
        ? (await this.moduleStore.listByCourse(course.id)).filter((m) => !m.deletedAt)
        : [];

      let totalLessons = 0;
      let completedLessons = 0;

      for (const mod of courseModules) {
        const modLessons = this.lessonStore
          ? (await this.lessonStore.listByModule(mod.id)).filter(
              (l) => !l.deletedAt && l.publicationStatus === "published",
            )
          : [];

        totalLessons += modLessons.length;

        for (const les of modLessons) {
          let completed = false;
          let completedAt: string | null = null;
          if (this.progressStore && userId) {
            const prog = await this.progressStore.findByUserAndLesson(
              userId,
              les.id,
            );
            if (prog && prog.completed) {
              completed = true;
              completedAt = prog.completedAt;
              completedLessons += 1;
            }
          }

          if (fetchContents) {
            const matchesQuery =
              !trimmedQ ||
              les.title.toLowerCase().includes(trimmedQ) ||
              mod.title.toLowerCase().includes(trimmedQ) ||
              course.name.toLowerCase().includes(trimmedQ);

            if (matchesQuery) {
              contentResults.push({
                id: les.id,
                title: les.title,
                type: "lesson",
                courseId: course.id,
                courseTitle: course.name,
                moduleId: mod.id,
                moduleTitle: mod.title,
                lessonId: les.id,
                estimatedMinutes: les.estimatedMinutes ?? null,
                completed,
                completedAt,
                href: `/courses/${course.id}?lessonId=${les.id}`,
                createdAt: les.createdAt,
                updatedAt: les.updatedAt,
              });
            }
          }
        }
      }

      if (fetchCourses) {
        const matchesCourseQuery =
          !trimmedQ ||
          course.name.toLowerCase().includes(trimmedQ) ||
          (course.description && course.description.toLowerCase().includes(trimmedQ)) ||
          (course.subject && course.subject.toLowerCase().includes(trimmedQ));

        if (matchesCourseQuery) {
          const percent =
            totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
          courseResults.push({
            id: course.id,
            title: course.name,
            description: course.description ?? null,
            subject: course.subject ?? null,
            moduleCount: courseModules.length,
            contentCount: totalLessons,
            progress: {
              completedLessons,
              totalLessons,
              percent,
            },
            href: `/courses/${course.id}`,
            createdAt: course.createdAt,
            updatedAt: course.updatedAt,
          });
        }
      }
    }

    const totalCourses = courseResults.length;
    const totalContents = contentResults.length;

    return {
      courses: courseResults.slice(offset, offset + limit),
      contents: contentResults.slice(offset, offset + limit),
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
    const trimmedQ = options.q?.trim().toLowerCase();
    const subject = options.subject?.trim();
    const filterCourseId = options.courseId || (options as any).course_id;

    if (!this.courseStore || !this.moduleStore) {
      return {
        courses: [],
        totalCourses: 0,
        totalPackages: 0,
      };
    }

    let allCourses: CourseRecord[] = [];
    if (typeof (this.courseStore as any).getAll === "function") {
      allCourses = (this.courseStore as any).getAll();
    }

    // Filter courses: active, published, official or accessible
    const matchingCourses = allCourses.filter((c) => {
      if (c.deletedAt !== null) return false;
      if (filterCourseId && c.id !== filterCourseId) return false;
      if (subject && subject !== "all" && c.subject !== subject) return false;
      return true;
    });

    const coursesResult: import("@avana/domain").CourseWithChapterPackages[] = [];
    let grandTotalPackages = 0;

    for (const course of matchingCourses) {
      const allModules = typeof (this.moduleStore as any).getAll === "function"
        ? (this.moduleStore as any).getAll().filter((m: any) => m.courseId === course.id && m.deletedAt === null)
        : [];
      
      allModules.sort((a: any, b: any) => a.sortOrder - b.sortOrder);

      const chapterPackages: import("@avana/domain").ChapterPackageItem[] = [];

      for (const mod of allModules) {
        // Lessons
        const modLessons = this.lessonStore && typeof (this.lessonStore as any).getAll === "function"
          ? (this.lessonStore as any).getAll().filter((l: any) => l.moduleId === mod.id && l.deletedAt === null && l.publicationStatus === "published")
          : [];
        modLessons.sort((a: any, b: any) => a.sortOrder - b.sortOrder);

        // Content pack attached
        let attachedPack: ContentPackRecord | undefined;
        if (mod.documentId) {
          for (const p of this.packs.values()) {
            if (p.sourceDocumentId === mod.documentId && p.status === "published" && p.deletedAt === null) {
              attachedPack = p;
              break;
            }
          }
        }

        // Flashcards
        let fcCount = 0;
        if (this.flashcardStore && typeof (this.flashcardStore as any).getAll === "function") {
          const allFc = (this.flashcardStore as any).getAll().filter((f: any) => f.deletedAt === null);
          for (const f of allFc) {
            if (f.courseId === course.id && (f.documentId === mod.documentId || modLessons.some((l: any) => l.id === f.lessonId))) {
              fcCount++;
            }
          }
        }
        if (fcCount === 0 && attachedPack?.metadata?.flashcardCount) {
          fcCount = attachedPack.metadata.flashcardCount;
        }

        // Quiz
        let quizInfo: { id?: string; title?: string; questionCount: number } | undefined;
        if (this.quizStore && typeof (this.quizStore as any).getAll === "function") {
          const allQuizzes = (this.quizStore as any).getAll().filter((q: any) => q.deletedAt === null && q.courseId === course.id);
          const modQuiz = allQuizzes.find((q: any) => (mod.documentId && q.documentId === mod.documentId) || modLessons.some((l: any) => l.id === q.lessonId));
          if (modQuiz) {
            let qCount = 0;
            if (this.quizQuestionStore && typeof (this.quizQuestionStore as any).getAll === "function") {
              qCount = (this.quizQuestionStore as any).getAll().filter((qq: any) => qq.quizId === modQuiz.id).length;
            }
            quizInfo = { id: modQuiz.id, title: modQuiz.title, questionCount: qCount };
          }
        }
        if (!quizInfo && attachedPack?.metadata?.quizQuestionCount) {
          quizInfo = { title: `آزمون ${mod.title}`, questionCount: attachedPack.metadata.quizQuestionCount };
        }

        // Summary
        let summaryInfo: { title?: string; overview?: string; estimatedReadingMinutes?: number } | undefined;
        if (this.generatedContentStore && typeof (this.generatedContentStore as any).getAll === "function") {
          const allGc = (this.generatedContentStore as any).getAll();
          const gcSummary = allGc.find((gc: any) => 
            ((mod.documentId && gc.documentId === mod.documentId) || modLessons.some((l: any) => l.id === gc.materializedLessonId) || (gc.courseId === course.id && mod.documentId && gc.documentId === mod.documentId)) &&
            gc.type === "review_summary" && 
            (gc.status === "accepted" || gc.status === "published") && 
            gc.deletedAt === null
          );
          if (gcSummary?.payload) {
            summaryInfo = {
              title: gcSummary.payload.title || "خلاصه نکات کلیدی",
              overview: gcSummary.payload.overview || gcSummary.payload.summary || "",
              estimatedReadingMinutes: gcSummary.payload.estimatedReadingMinutes ?? gcSummary.payload.estimated_reading_minutes ?? 5,
            };
          }
        }

        const lessonCount = modLessons.length;
        const totalLessonMinutes = modLessons.reduce((acc: number, cur: any) => acc + (cur.estimatedMinutes ?? 10), 0);

        const hasLesson = lessonCount > 0;
        const hasSummary = Boolean(summaryInfo);
        const hasFlashcards = fcCount > 0;
        const hasQuiz = Boolean(quizInfo && quizInfo.questionCount > 0);

        const totalItems =
          (hasLesson ? 1 : 0) +
          (hasSummary ? 1 : 0) +
          (hasFlashcards ? 1 : 0) +
          (hasQuiz ? 1 : 0);

        if (totalItems === 0) {
          continue;
        }

        const completeness: import("@avana/domain").ChapterPackageCompleteness =
          totalItems === 4 ? "complete" : "partial";

        const totalReadingMinutes = totalLessonMinutes + (summaryInfo?.estimatedReadingMinutes ?? 0);

        const pkgItem: import("@avana/domain").ChapterPackageItem = {
          id: attachedPack?.id ?? mod.id,
          moduleId: mod.id,
          courseId: course.id,
          courseTitle: course.name,
          title: mod.title,
          description: mod.description ?? attachedPack?.description ?? null,
          subject: course.subject ?? attachedPack?.subject ?? null,
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
          createdAt: mod.createdAt,
          updatedAt: mod.updatedAt,
        };

        chapterPackages.push(pkgItem);
      }

      // Check query filter against course and its chapter packages
      let finalChapterPackages = chapterPackages;
      if (trimmedQ) {
        const matchesCourse =
          course.name.toLowerCase().includes(trimmedQ) ||
          (course.description && course.description.toLowerCase().includes(trimmedQ)) ||
          (course.subject && course.subject.toLowerCase().includes(trimmedQ));
        if (!matchesCourse) {
          finalChapterPackages = chapterPackages.filter(
            (p) =>
              p.title.toLowerCase().includes(trimmedQ) ||
              (p.description && p.description.toLowerCase().includes(trimmedQ)),
          );
        }
        if (finalChapterPackages.length === 0) {
          continue;
        }
      }

      if (finalChapterPackages.length === 0) {
        continue;
      }

      grandTotalPackages += finalChapterPackages.length;

      coursesResult.push({
        id: course.id,
        title: course.name,
        description: course.description ?? null,
        subject: course.subject ?? null,
        isOfficial: course.isOfficial ?? false,
        totalPackages: finalChapterPackages.length,
        packages: finalChapterPackages,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      });
    }

    if (options.sort === "newest") {
      coursesResult.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else {
      coursesResult.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }

    const totalCourses = coursesResult.length;

    return {
      courses: coursesResult.slice(offset, offset + limit),
      totalCourses,
      totalPackages: grandTotalPackages,
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

