import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type FlashcardId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type ProductId,
  type QuizId,
  type QuizQuestionId,
  type UserId,
  asCourseId,
  asLessonId,
  asModuleId,
  asOrganizationId,
  asProductId,
  asQuizId,
  asUserId,
  defaultPolicy,
  DomainError,
  selectDeterministicItem,
  selectDeterministicSubset,
  fnv1a32,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { PreviewResolver } from "../modules/commerce/preview-resolver.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";
import { LearningService } from "../modules/learning/learning-service.js";
import { LibraryService } from "../modules/library/library-service.js";
import { StudyService } from "../modules/study/study-service.js";

describe("Free Preview Comprehensive Suite (Deterministic, Entitlement, Security, UI Metadata)", () => {
  describe("Unit: Pure Deterministic Selection & Fallback", () => {
    it("fnv1a32 produces stable 32-bit hashes", () => {
      const h1 = fnv1a32("test-seed-123");
      const h2 = fnv1a32("test-seed-123");
      const h3 = fnv1a32("test-seed-456");

      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
      expect(h1).toBeGreaterThanOrEqual(0);
    });

    it("handles 0 items by returning undefined", () => {
      const selected = selectDeterministicItem("parent-1", "lesson", []);
      expect(selected).toBeUndefined();
    });

    it("handles 1 item by always returning that single item", () => {
      const item = { id: "item-single" };
      const selected = selectDeterministicItem("parent-1", "lesson", [item]);
      expect(selected).toBe(item);
    });

    it("is 100% deterministic across multiple runs and distinct seeds", () => {
      const items = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
      const run1 = selectDeterministicItem("course-alpha", "quiz", items);
      const run2 = selectDeterministicItem("course-alpha", "quiz", items);
      const run3 = selectDeterministicItem("course-beta", "quiz", items);

      expect(run1).toBe(run2);
      expect(items).toContain(run1);
      expect(items).toContain(run3);
    });

    it("falls back to another item when an item is removed from active list", () => {
      const itemsAll = [{ id: "A" }, { id: "B" }, { id: "C" }];
      const selectedOriginal = selectDeterministicItem("seed-1", "lesson", itemsAll)!;

      // Filter out the selected item (simulating deletion/unpublish)
      const remaining = itemsAll.filter((i) => i.id !== selectedOriginal.id);
      const selectedFallback = selectDeterministicItem("seed-1", "lesson", remaining);

      expect(selectedFallback).toBeDefined();
      expect(selectedFallback?.id).not.toBe(selectedOriginal.id);
      expect(remaining).toContain(selectedFallback);
    });

    it("selects deterministic subset capped at limit (e.g. 5 flashcards)", () => {
      const cards = Array.from({ length: 12 }, (_, i) => ({ id: `card-${i + 1}` }));
      const subset1 = selectDeterministicSubset("course-1", "flashcard", cards, 5);
      const subset2 = selectDeterministicSubset("course-1", "flashcard", cards, 5);

      expect(subset1.length).toBe(5);
      expect(subset2.length).toBe(5);
      expect(subset1.map((c) => c.id)).toEqual(subset2.map((c) => c.id));

      // Limit greater than total items returns all items
      const subsetAll = selectDeterministicSubset("course-1", "flashcard", cards.slice(0, 3), 5);
      expect(subsetAll.length).toBe(3);
    });
  });

  describe("Integration: End-to-End Free Preview Flow", () => {
    let commerceStore: InMemoryCommerceStore;
    let courseStore: InMemoryCourseStore;
    let organizationStore: InMemoryOrganizationStore;
    let moduleStore: InMemoryModuleStore;
    let lessonStore: InMemoryLessonStore;
    let progressStore: InMemoryProgressStore;
    let documentStore: InMemoryDocumentStore;
    let contentPackStore: InMemoryContentPackStore;
    let flashcardStore: InMemoryFlashcardStore;
    let quizStore: InMemoryQuizStore;
    let quizQuestionStore: InMemoryQuizQuestionStore;

    let previewResolver: PreviewResolver;
    let entitlementService: EntitlementService;
    let learningService: LearningService;
    let libraryService: LibraryService;
    let studyService: StudyService;

    const systemOrgId = asOrganizationId(randomUUID());
    const studentUser: Actor = {
      userId: asUserId(randomUUID()),
      role: "student",
    };
    const creatorUser: Actor = {
      userId: asUserId(randomUUID()),
      role: "teacher",
    };

    let courseId: CourseId;
    let moduleId: ModuleId;
    let lesson1Id: LessonId;
    let lesson2Id: LessonId;
    let quiz1Id: QuizId;
    let quiz2Id: QuizId;
    let courseProductId: ProductId;

    const LESSON_1_CONTENT = "# محتوای درسنامه اول - داروشناسی پایه";
    const LESSON_2_CONTENT = "# محتوای درسنامه دوم - فارماکوکینتیک پیشرفته";

    beforeEach(async () => {
      commerceStore = new InMemoryCommerceStore();
      courseStore = new InMemoryCourseStore();
      organizationStore = new InMemoryOrganizationStore();
      moduleStore = new InMemoryModuleStore();
      lessonStore = new InMemoryLessonStore();
      progressStore = new InMemoryProgressStore();
      documentStore = new InMemoryDocumentStore();
      flashcardStore = new InMemoryFlashcardStore();
      quizStore = new InMemoryQuizStore();
      quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);

      contentPackStore = new InMemoryContentPackStore(
        undefined,
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        undefined,
        undefined,
        courseStore,
        progressStore,
        organizationStore,
      );

      previewResolver = new PreviewResolver({
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        commerceStore,
      });

      entitlementService = new EntitlementService({
        commerceStore,
        courseStore,
        moduleStore,
        lessonStore,
        documentStore,
        flashcardStore,
        quizStore,
        contentPackStore,
        organizationStore,
        previewResolver,
      });

      learningService = new LearningService(
        courseStore,
        organizationStore,
        moduleStore,
        lessonStore,
        progressStore,
        defaultPolicy,
        undefined,
        systemOrgId,
        entitlementService,
      );

      libraryService = new LibraryService(
        contentPackStore,
        undefined as any,
        documentStore,
        undefined as any,
        organizationStore,
        undefined,
        courseStore,
        defaultPolicy,
        undefined,
        entitlementService,
        commerceStore,
        systemOrgId,
      );

      const flashcardReviewStore = new InMemoryFlashcardReviewStore();

      studyService = new StudyService(
        flashcardStore,
        flashcardReviewStore,
        quizStore,
        quizQuestionStore,
        undefined as any,
        moduleStore,
        lessonStore,
        progressStore,
        defaultPolicy,
        undefined,
        organizationStore,
        undefined,
        courseStore,
        systemOrgId,
        undefined,
        undefined,
        entitlementService,
      );

      // System Org Setup
      await organizationStore.createWithAdminMembership({
        organization: {
          id: systemOrgId,
          name: "AVANA Academy",
          slug: "avana",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        membership: {
          id: randomUUID(),
          organizationId: systemOrgId,
          userId: creatorUser.userId,
          role: "teacher",
          createdAt: new Date().toISOString(),
        },
        auditEvents: [],
      });

      organizationStore.addMembership({
        id: randomUUID(),
        organizationId: systemOrgId,
        userId: studentUser.userId,
        role: "student",
        createdAt: new Date().toISOString(),
      });

      // Paid Course Setup
      courseId = asCourseId(randomUUID());
      await courseStore.create({
        course: {
          id: courseId,
          organizationId: systemOrgId,
          name: "فارماکولوژی جامع",
          description: "دوره پولی داروشناسی",
          subject: "داروسازی",
          level: "advanced",
          isOfficial: true,
          status: "published",
          examDate: null,
          ownerUserId: creatorUser.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      // Module Setup
      moduleId = asModuleId(randomUUID());
      await moduleStore.create({
        id: moduleId,
        courseId,
        documentId: null,
        title: "فصل ۱: کلیات دارو",
        description: "مفاهیم پایه",
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // 2 Lessons in this Module
      lesson1Id = asLessonId(randomUUID());
      await lessonStore.create({
        id: lesson1Id,
        moduleId,
        title: "درس ۱: تعاریف اولیه",
        contentType: "lesson",
        contentMarkdown: LESSON_1_CONTENT,
        sortOrder: 1,
        estimatedMinutes: 10,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      lesson2Id = asLessonId(randomUUID());
      await lessonStore.create({
        id: lesson2Id,
        moduleId,
        title: "درس ۲: متابولیسم و فارماکوکینتیک",
        contentType: "lesson",
        contentMarkdown: LESSON_2_CONTENT,
        sortOrder: 2,
        estimatedMinutes: 20,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // 2 Quizzes in this Course
      quiz1Id = asQuizId(randomUUID());
      await quizStore.create({
        id: quiz1Id,
        organizationId: systemOrgId,
        courseId,
        documentId: null,
        title: "آزمون فصل ۱ - بخش اول",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await quizQuestionStore.createMany([
        {
          id: "q-1" as QuizQuestionId,
          quizId: quiz1Id,
          generatedContentId: null,
          lessonId: lesson1Id,
          question: "سوال آزمون اول؟",
          questionType: "multiple_choice",
          choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
          correctAnswer: "گزینه ۱",
          explanation: "توضیح سوال اول",
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      quiz2Id = asQuizId(randomUUID());
      await quizStore.create({
        id: quiz2Id,
        organizationId: systemOrgId,
        courseId,
        documentId: null,
        title: "آزمون فصل ۱ - بخش دوم",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await quizQuestionStore.createMany([
        {
          id: "q-2" as QuizQuestionId,
          quizId: quiz2Id,
          generatedContentId: null,
          lessonId: lesson2Id,
          question: "سوال آزمون دوم؟",
          questionType: "multiple_choice",
          choices: ["پاسخ الف", "پاسخ ب"],
          correctAnswer: "پاسخ الف",
          explanation: "توضیح آزمون دوم",
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      // 10 Flashcards in this Course
      for (let i = 1; i <= 10; i++) {
        await flashcardStore.create({
          id: `card-${i}` as FlashcardId,
          organizationId: systemOrgId,
          courseId,
          documentId: null,
          generatedContentId: null,
          lessonId: i <= 5 ? lesson1Id : lesson2Id,
          question: `فلش‌کارت شماره ${i}`,
          answer: `پاسخ کارت ${i}`,
          explanation: null,
          cardType: "standard",
          difficulty: "medium",
          dueAt: new Date().toISOString(),
          intervalDays: 0,
          easeFactor: 2.5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });
      }

      // Course Product Setup (Paid 95,000 Tomans)
      courseProductId = asProductId(randomUUID());
      await commerceStore.createProduct({
        id: courseProductId,
        code: "course-pharm",
        type: "course",
        title: "فارماکولوژی جامع",
        description: "دسترسی کامل",
        price: 95000,
        currency: "toman",
        targetType: "course",
        targetId: courseId,
        durationDays: null,
        active: true,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Enroll student in user courses
      await courseStore.addUserCourse(studentUser.userId, courseId);
    });

    it("1. EntitlementService correctly grants free_preview to preview items and denies non-preview items", async () => {
      const previewLesson = await previewResolver.resolvePreviewLesson(moduleId);
      expect(previewLesson).toBeDefined();

      const nonPreviewLessonId = previewLesson?.id === lesson1Id ? lesson2Id : lesson1Id;

      // Preview lesson check
      const previewAccess = await entitlementService.checkAccess(studentUser, {
        resourceType: "lesson",
        resourceId: previewLesson!.id,
        moduleId,
        courseId,
      });
      expect(previewAccess.granted).toBe(true);
      expect(previewAccess.reason).toBe("free_preview");
      expect(previewAccess.accessSource).toBe("free_preview");

      // Non-preview lesson check
      const lockedAccess = await entitlementService.checkAccess(studentUser, {
        resourceType: "lesson",
        resourceId: nonPreviewLessonId,
        moduleId,
        courseId,
      });
      expect(lockedAccess.granted).toBe(false);
      expect(lockedAccess.reason).toBe("locked");

      // Verify no fake orders or entitlements were created in DB
      expect(commerceStore.entitlements.length).toBe(0);
      expect(commerceStore.orders.length).toBe(0);
    });

    it("2. LearningService delivers unmasked preview lesson and masks locked lessons", async () => {
      const learnRes = await learningService.getCourseLearning(
        studentUser,
        courseId,
        "req-preview-1",
      );

      expect(learnRes.modules.length).toBe(1);
      const mod = learnRes.modules[0];
      expect(mod.lessons.length).toBe(2);

      const previewLesson = mod.lessons.find((l) => l.is_preview === true);
      const lockedLesson = mod.lessons.find((l) => l.is_preview === false || l.locked === true);

      expect(previewLesson).toBeDefined();
      expect(lockedLesson).toBeDefined();

      // Preview lesson must NOT be locked and must contain real markdown
      expect(previewLesson?.locked).toBe(false);
      expect(previewLesson?.is_preview).toBe(true);
      expect(previewLesson?.content_markdown).toMatch(/# محتوای درسنامه/);

      // Locked lesson must be locked and masked on the server
      expect(lockedLesson?.locked).toBe(true);
      expect(lockedLesson?.content_markdown).toContain("🔒");
      expect(lockedLesson?.content_markdown).toContain("آوانا پلاس");
      expect(lockedLesson?.content_markdown).not.toContain(LESSON_1_CONTENT);
      expect(lockedLesson?.content_markdown).not.toContain(LESSON_2_CONTENT);
    });

    it("3. StudyService permits preview quiz attempt and strictly blocks non-preview quiz", async () => {
      const previewQuiz = await previewResolver.resolvePreviewQuiz(courseId, systemOrgId);
      expect(previewQuiz).toBeDefined();

      const lockedQuizId = previewQuiz?.id === quiz1Id ? quiz2Id : quiz1Id;

      // Attempting the preview quiz must SUCCEED with is_preview flag
      const quizAttempt = await studyService.getQuizForAttempt(
        studentUser,
        systemOrgId,
        previewQuiz!.id,
      );
      expect(quizAttempt.id).toBe(previewQuiz!.id);
      expect(quizAttempt.is_preview).toBe(true);
      expect(quizAttempt.questions.length).toBeGreaterThan(0);

      // Attempting the non-preview quiz must FAIL with 403 DomainError
      await expect(
        studyService.getQuizForAttempt(studentUser, systemOrgId, lockedQuizId),
      ).rejects.toThrow(DomainError);

      try {
        await studyService.getQuizForAttempt(studentUser, systemOrgId, lockedQuizId);
      } catch (err: any) {
        expect(err.code).toBe("forbidden");
        expect(err.message).toContain("دسترسی");
      }
    });

    it("4. StudyService caps flashcard preview to at most 5 cards and denies review of non-preview cards", async () => {
      // Unpaid student listing flashcards for review receives only the 5 preview cards
      const reviewCards = await studyService.listFlashcardsForReview(
        studentUser,
        systemOrgId,
        courseId,
      );
      expect(reviewCards.length).toBe(5);

      const previewCards = await previewResolver.resolvePreviewFlashcards(courseId, systemOrgId, 5);
      const previewCardIds = new Set(previewCards.map((c) => c.id));
      expect(reviewCards.every((c) => previewCardIds.has(c.id))).toBe(true);

      // Reviewing a preview card succeeds
      const firstPreviewCard = reviewCards[0];
      await expect(
        studyService.submitFlashcardReview(studentUser, systemOrgId, {
          flashcardId: firstPreviewCard.id,
          rating: "good",
        }),
      ).resolves.not.toThrow();

      // Reviewing a non-preview card fails closed with 403
      const nonPreviewCard = (await flashcardStore.listByCourse(courseId, systemOrgId)).find(
        (c) => !previewCardIds.has(c.id),
      )!;
      expect(nonPreviewCard).toBeDefined();

      await expect(
        studyService.submitFlashcardReview(studentUser, systemOrgId, {
          flashcardId: nonPreviewCard.id,
          rating: "good",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("5. LibraryService exposes preview metadata and badges", async () => {
      // 5.1 listResources
      const libRes = await libraryService.listResources(
        studentUser,
        { type: "all" },
        "req-lib-test",
      );

      const previewLesson = await previewResolver.resolvePreviewLesson(moduleId);
      const previewCard = libRes.contents.find((c) => c.id === previewLesson?.id);
      expect(previewCard).toBeDefined();
      expect(previewCard?.is_preview).toBe(true);

      // 5.2 listCoursePackages
      const packagesRes = await libraryService.listCoursePackages(
        studentUser,
        { courseId },
        "req-pkg-test",
      );
      expect(packagesRes.courses.length).toBe(1);
      const courseItem = packagesRes.courses[0];
      expect(courseItem.packages.length).toBe(1);
      const pkg = courseItem.packages[0];
      expect(pkg.preview).toBeDefined();
      expect(pkg.preview?.hasPreview).toBe(true);
      expect(pkg.preview?.lesson?.id).toBe(previewLesson?.id);
      expect(pkg.preview?.flashcards?.available).toBe(true);
      expect(pkg.preview?.flashcards?.previewCount).toBe(5);
    });

    it("5.3 Flashcard Multi-Queue: listFlashcardsForReviewMulti and getExamModeFlashcards restrict unentitled courses to 5 preview cards", async () => {
      // Unentitled student calls multi-course endpoints
      const multiCards = await studyService.listFlashcardsForReviewMulti(
        studentUser,
        systemOrgId,
        [courseId],
      );
      // Even though there are 10 flashcards in the course, unentitled student only gets 5 preview cards
      expect(multiCards.length).toBe(5);

      const examCards = await studyService.getExamModeFlashcards(
        studentUser,
        systemOrgId,
        [courseId],
        50,
      );
      expect(examCards.length).toBe(5);
    });

    it("6. Post-Purchase: Full access unlocks all content and disables preview restrictions", async () => {
      // Grant full course entitlement (simulating completed purchase)
      await commerceStore.grantEntitlement({
        id: randomUUID(),
        userId: studentUser.userId,
        resourceType: "course",
        resourceId: courseId,
        source: "purchase",
        orderId: randomUUID(),
        subscriptionId: null,
        active: true,
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // All lessons unlocked
      const learnRes = await learningService.getCourseLearning(studentUser, courseId, "req-post-1");
      expect(learnRes.modules[0].lessons.every((l) => l.locked === false)).toBe(true);

      // Both quizzes accessible
      const q1Attempt = await studyService.getQuizForAttempt(studentUser, systemOrgId, quiz1Id);
      const q2Attempt = await studyService.getQuizForAttempt(studentUser, systemOrgId, quiz2Id);
      expect(q1Attempt.id).toBe(quiz1Id);
      expect(q2Attempt.id).toBe(quiz2Id);

      // All 10 flashcards accessible
      const allCards = await studyService.listFlashcardsForReview(studentUser, systemOrgId, courseId);
      expect(allCards.length).toBe(10);
    });
  });
});
