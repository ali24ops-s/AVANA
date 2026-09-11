import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryModuleStore, InMemoryLessonStore, InMemoryDocumentStore, InMemoryDocumentChunkStore } from "../modules/learning/test/in-memory-stores.js";
import { InMemoryFlashcardStore, InMemoryQuizStore, InMemoryQuizQuestionStore } from "../modules/study/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore, InMemoryGeneratedContentCitationStore, InMemoryGenerationJobStore } from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import {
  RoleBasedPolicy,
  asCourseId,
  asDocumentId,
  asUserId,
  asOrganizationId,
  asGeneratedContentId,
  asLessonId,
  asFlashcardId,
  type Actor,
  type DocumentId,
} from "@avana/domain";

describe("Official Course Approval & Flashcard Decoupling Test Suite", () => {
  let officialContentService: OfficialContentService;
  let reviewService: ReviewService;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let commerceStore: InMemoryCommerceStore;
  let adminStore: InMemoryAdminStore;

  const adminActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "platform_admin",
  };
  const systemOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

  beforeEach(() => {
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    commerceStore = new InMemoryCommerceStore();
    adminStore = new InMemoryAdminStore();

    const citationStore = new InMemoryGeneratedContentCitationStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const jobStore = new InMemoryGenerationJobStore();
    const queue = new InMemoryGenerationQueue(jobStore);

    reviewService = new ReviewService(
      generatedContentStore,
      citationStore,
      documentStore,
      chunkStore,
      moduleStore,
      lessonStore,
      new RoleBasedPolicy(),
      queue,
      undefined, // auditService
      flashcardStore,
      quizStore,
      quizQuestionStore,
      undefined, // orgStore
      commerceStore,
    );

    const courseProducts = new Map<string, any>();

    const extractKeyValuePairs = (sqlObj: any, result: Record<string, any> = {}): Record<string, any> => {
      if (!sqlObj) return result;
      if (sqlObj.queryChunks && Array.isArray(sqlObj.queryChunks)) {
        const chunks = sqlObj.queryChunks;
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (chunk && chunk.queryChunks) {
            extractKeyValuePairs(chunk, result);
          } else if (chunk && chunk.name && i + 2 < chunks.length && chunks[i + 2] && chunks[i + 2].value !== undefined) {
            result[chunk.name] = chunks[i + 2].value;
          }
        }
      }
      return result;
    };

    const evaluateCondition = (p: any, cond: any): boolean => {
      if (!cond) return true;
      const pairs = extractKeyValuePairs(cond);
      for (const [colName, val] of Object.entries(pairs)) {
        if (colName === "code" && p.code !== val) return false;
        if (colName === "id" && p.id !== val) return false;
        if ((colName === "target_id" || colName === "targetId") && p.targetId !== val) return false;
        if ((colName === "target_type" || colName === "targetType") && p.targetType !== val) return false;
        if ((colName === "deleted_at" || colName === "deletedAt") && (p.deletedAt ?? null) !== (val ?? null)) return false;
      }
      return true;
    };

    const findMatching = (cond?: any) => {
      const all = Array.from(courseProducts.values());
      if (!cond) return all;
      return all.filter((p) => evaluateCondition(p, cond));
    };

    const mockDb: any = {
      select: () => ({
        from: (_table: any) => ({
          where: (condition: any) => ({
            limit: async (lim?: number) => {
              const matched = findMatching(condition);
              return typeof lim === "number" ? matched.slice(0, lim) : matched;
            },
          }),
        }),
      }),
      insert: () => ({
        values: (val: any) => ({
          returning: async () => {
            const p = await commerceStore.createProduct({
              id: val.id || randomUUID(),
              code: val.code,
              type: val.type || "course",
              title: val.title,
              description: val.description || null,
              price: val.price,
              currency: val.currency || "toman",
              targetType: val.targetType || "course",
              targetId: val.targetId || null,
              durationDays: val.durationDays || null,
              active: val.active ?? false,
              metadata: val.metadata || {},
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              deletedAt: null,
            });
            courseProducts.set(p.id, p);
            return [p];
          },
        }),
      }),
      update: () => ({
        set: (vals: any) => ({
          where: (cond: any) => ({
            returning: async () => {
              const matched = findMatching(cond);
              if (matched.length > 0) {
                const target = matched[0];
                const updated = {
                  ...target,
                  ...vals,
                  updatedAt: new Date().toISOString(),
                };
                courseProducts.set(target.id, updated);
                const idx = commerceStore.products.findIndex(
                  (p) => p.id === target.id,
                );
                if (idx >= 0) {
                  commerceStore.products[idx] = updated;
                }
                return [updated];
              }
              return [];
            },
          }),
        }),
      }),
    };

    officialContentService = new OfficialContentService(
      mockDb,
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      generatedContentStore,
      null as any, // generationService
      reviewService,
      adminStore,
      systemOrgId,
    );
  });

  async function setupBasicCourseAndDoc() {
    const courseId = asCourseId(randomUUID());
    const docId = asDocumentId(randomUUID());

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره فیزیولوژی",
        description: "توضیحات دوره",
        subject: "پزشکی",
        status: "draft",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await documentStore.create({
      id: docId,
      organizationId: systemOrgId,
      courseId,
      ownerUserId: adminActor.userId,
      originalName: "cardiology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      storagePath: "/tmp/doc.pdf",
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create a lesson draft
    await generatedContentStore.create({
      id: asGeneratedContentId(randomUUID()),
      organizationId: systemOrgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        title: "کلیات ساختار قلب",
        moduleTitle: "فصل ۱: آناتومی",
        sessions: [
          {
            title: "درس ۱: دهلیزها و بطن‌ها",
            contentMarkdown: "محتوای آموزشی ساختار قلب",
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedBy: null,
      acceptedAt: null,
      materializedLessonId: null,
    });

    return { courseId, docId };
  }

  it("Test A: Flashcard with documentId=valid and lessonId=null -> Approval succeeds", async () => {
    const { courseId, docId } = await setupBasicCourseAndDoc();

    // Flashcard draft without sessionIndex / topic (lessonId will materialize as null)
    await generatedContentStore.create({
      id: asGeneratedContentId(randomUUID()),
      organizationId: systemOrgId,
      courseId,
      documentId: docId,
      type: "flashcard",
      status: "draft",
      payload: {
        cards: [
          {
            front: "عملکرد دهلیز چیست؟",
            back: "دریافت خون ورودی به قلب",
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedBy: null,
      acceptedAt: null,
      materializedLessonId: null,
    });

    const workspace = await officialContentService.getReviewWorkspace(adminActor, courseId);
    expect(workspace.unresolvedLessonMappings).toBe(0);
    expect(workspace.readyForApproval).toBe(true);

    const result = await officialContentService.approveOfficialCourse(adminActor, courseId);
    expect(result.approved).toBe(true);
    expect(result.materialized.flashcards).toBe(1);

    const cards = await flashcardStore.listByCourse(courseId, systemOrgId);
    expect(cards.length).toBe(1);
    expect(cards[0].documentId).toBe(docId);
    expect(cards[0].lessonId).toBeNull();
  });

  it("Test B: Flashcard with documentId=valid and lessonId=valid -> Approval succeeds", async () => {
    const { courseId, docId } = await setupBasicCourseAndDoc();

    // Flashcard draft with topic matching lesson
    await generatedContentStore.create({
      id: asGeneratedContentId(randomUUID()),
      organizationId: systemOrgId,
      courseId,
      documentId: docId,
      type: "flashcard",
      status: "draft",
      payload: {
        cards: [
          {
            front: "دهلیز راست چیست؟",
            back: "دریافت‌کننده خون سیاهرگی",
            topic: "دهلیزها",
            sessionIndex: 0,
          },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      acceptedBy: null,
      acceptedAt: null,
      materializedLessonId: null,
    });

    const result = await officialContentService.approveOfficialCourse(adminActor, courseId);
    expect(result.approved).toBe(true);
    expect(result.materialized.flashcards).toBe(1);

    const cards = await flashcardStore.listByCourse(courseId, systemOrgId);
    expect(cards.length).toBe(1);
    expect(cards[0].documentId).toBe(docId);
    expect(cards[0].lessonId).not.toBeNull();
  });

  it("Test C: Flashcard with documentId=null -> Fails invariant check with clear unprocessable error", async () => {
    const { courseId } = await setupBasicCourseAndDoc();

    // Manually insert an orphaned flashcard with documentId=null into store
    await flashcardStore.create({
      id: asFlashcardId(randomUUID()),
      organizationId: systemOrgId,
      courseId,
      documentId: null as unknown as DocumentId,
      generatedContentId: null,
      lessonId: null,
      question: "سوال یتیم",
      answer: "پاسخ یتیم",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      officialContentService.approveOfficialCourse(adminActor, courseId),
    ).rejects.toThrow("فلش‌کارت رسمی فاقد سند معتبر است (document_id نامعتبر).");
  });

  it("Test D: Flashcard with invalid lessonId (points to non-existent lesson) -> Fails with validation error", async () => {
    const { courseId, docId } = await setupBasicCourseAndDoc();

    // Manually insert a flashcard with invalid lessonId into store
    await flashcardStore.create({
      id: asFlashcardId(randomUUID()),
      organizationId: systemOrgId,
      courseId,
      documentId: docId,
      generatedContentId: null,
      lessonId: asLessonId(randomUUID()),
      question: "سوال با درس نامعتبر",
      answer: "پاسخ",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      officialContentService.approveOfficialCourse(adminActor, courseId),
    ).rejects.toThrow("فلش‌کارت رسمی دارای اتصال نامعتبر به درس است (lesson_id نامعتبر).");
  });

  it("Test E (Stage 3 Publishing & 1173 Cards): 1173 flashcards with documentId=valid and lessonId=null -> validateConsistency succeeds and does not throw error", async () => {
    const { courseId, docId } = await setupBasicCourseAndDoc();

    // Create 1173 flashcards with valid documentId and lessonId=null
    const cardsToInsert = Array.from({ length: 1173 }, (_, i) => ({
      id: asFlashcardId(randomUUID()),
      organizationId: systemOrgId,
      courseId,
      documentId: docId,
      generatedContentId: null,
      lessonId: null,
      question: `سوال شماره ${i + 1}`,
      answer: `پاسخ شماره ${i + 1}`,
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    }));

    await flashcardStore.createMany(cardsToInsert);

    // Set course status to approved and set a product for publishing check
    const course = await courseStore.findById(courseId);
    if (course) {
      course.status = "approved";
      await courseStore.update(course);
    }

    const report = await officialContentService.validateConsistency(courseId);

    // Assert that the error "1173 فلش‌کارت فاقد اتصال معتبر به درس هستند." is NOT present
    const hasUnmappedError = report.errors.some((e) =>
      e.includes("فلش‌کارت فاقد اتصال معتبر به درس هستند"),
    );
    expect(hasUnmappedError).toBe(false);
    expect(report.unresolvedLessonMappings).toBe(0);
  });

  it("Test F (Rejected Content): Course with a rejected draft item -> Skips rejected item and succeeds", async () => {
    const { courseId, docId } = await setupBasicCourseAndDoc();

    // Rejected flashcard draft
    await generatedContentStore.create({
      id: asGeneratedContentId(randomUUID()),
      organizationId: systemOrgId,
      courseId,
      documentId: docId,
      type: "flashcard",
      status: "rejected",
      payload: {
        cards: [{ front: "سوال ردشده", back: "پاسخ" }],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      reviewedBy: adminActor.userId,
      reviewedAt: new Date().toISOString(),
      reviewReason: "کیفیت پایین",
      acceptedBy: null,
      acceptedAt: null,
      materializedLessonId: null,
    });

    const result = await officialContentService.approveOfficialCourse(adminActor, courseId);
    expect(result.approved).toBe(true);
    // Lessons materialized, rejected flashcard skipped
    expect(result.materialized.lessons).toBe(1);
    expect(result.materialized.flashcards).toBe(0);
  });
});
