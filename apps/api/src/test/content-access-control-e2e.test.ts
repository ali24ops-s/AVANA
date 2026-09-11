import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type FlashcardId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type ProductId,
  type QuizId,
  type QuizQuestionId,
  type UserId,
  asCourseId,
  asDocumentId,
  asLessonId,
  asModuleId,
  asOrganizationId,
  asProductId,
  asQuizId,
  asUserId,
  defaultPolicy,
  DomainError,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import { LearningService } from "../modules/learning/learning-service.js";
import { LibraryService } from "../modules/library/library-service.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";
import { DocumentService } from "../modules/documents/document-service.js";
import { StudyService } from "../modules/study/study-service.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";
import { Readable } from "node:stream";

describe("Content Access Control End-to-End Suite (Before vs After Purchase)", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let entitlementService: EntitlementService;

  let courseStore: InMemoryCourseStore;
  let organizationStore: InMemoryOrganizationStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let contentPackStore: InMemoryContentPackStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;

  let learningService: LearningService;
  let libraryService: LibraryService;
  let documentService: DocumentService;
  let studyService: StudyService;

  const systemOrgId = asOrganizationId(randomUUID());

  const mockStorage: StorageProvider = {
    createUpload: async () => ({ storageKey: "key", uploadUrl: null, expiresAt: "" }),
    save: async () => {},
    delete: async () => {},
    exists: async () => true,
    read: async () => Buffer.from("Mock PDF content for pharmacology"),
    readStream: async () => Readable.from([Buffer.from("Mock PDF content for pharmacology")]),
  };

  const studentUser: Actor = {
    userId: asUserId(randomUUID()),
    role: "student",
  };

  const creatorUser: Actor = {
    userId: asUserId(randomUUID()),
    role: "teacher",
  };

  const adminUser: Actor = {
    userId: asUserId(randomUUID()),
    role: "platform_admin",
  };

  let courseId: CourseId;
  let moduleId: ModuleId;
  let lessonId: LessonId;
  let lockedLessonId: LessonId;
  let documentId: DocumentId;
  let quizId: QuizId;
  let courseProductId: ProductId;

  const SECRET_LESSON_MARKDOWN =
    "# فصل اول: مفاهیم اصلی داروشناسی\n\nاین متن محرمانه و کامل درسنامه است که فقط پس از خرید باید قابل دیدن باشد.";

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway();
    courseStore = new InMemoryCourseStore();
    organizationStore = new InMemoryOrganizationStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
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

    // Create system organization with creator membership
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

    // Add student membership
    organizationStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: studentUser.userId,
      role: "student",
      createdAt: new Date().toISOString(),
    });

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      contentPackStore,
      documentStore,
    });

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      undefined,
      lessonStore,
    );

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

    documentService = new DocumentService(
      documentStore,
      mockStorage,
      organizationStore,
      defaultPolicy,
      undefined,
      documentChunkStore,
      undefined,
      undefined,
      flashcardStore,
      quizStore,
      courseStore,
      moduleStore,
      lessonStore,
      entitlementService,
    );

    studyService = new StudyService(
      flashcardStore,
      undefined as any,
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

    // Setup a Paid Course
    courseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره جامع فارماکولوژی بالینی",
        description: "آموزش پیشرفته داروشناسی و فارماکوکینتیک",
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

    // Setup Module
    moduleId = asModuleId(randomUUID());
    await moduleStore.create({
      id: moduleId,
      courseId,
      documentId: null,
      title: "فصل ۱: فارماکوکینتیک",
      description: "مفاهیم جذب، توزیع، متابولیسم و دفع",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Setup Lesson 1 (Preview candidate)
    lessonId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس ۱: جذب و توزیع دارو",
      contentType: "lesson",
      contentMarkdown: SECRET_LESSON_MARKDOWN,
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Setup Lesson 2 (Locked with SECRET_LESSON_MARKDOWN)
    lockedLessonId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lockedLessonId,
      moduleId,
      title: "درس ۲: متابولیسم دارو",
      contentType: "lesson",
      contentMarkdown: SECRET_LESSON_MARKDOWN,
      sortOrder: 2,
      estimatedMinutes: 20,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Setup Document linked to Course
    documentId = asDocumentId(randomUUID());
    await documentStore.create({
      id: documentId,
      organizationId: systemOrgId,
      courseId,
      originalName: "clinical_pharmacology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "dummy-hash-1234",
      storageKey: "orgs/system/docs/clinical_pharmacology.pdf",
      status: "ready",
      uploadedByUserId: creatorUser.userId,
      uploadedAt: new Date().toISOString(),
      deletedAt: null,
      deletedByUserId: null,
    });

    // Setup Quiz linked to Course
    quizId = asQuizId(randomUUID());
    await quizStore.create({
      id: quizId,
      organizationId: systemOrgId,
      courseId,
      documentId: null,
      title: "آزمونک سنجش مفاهیم جذب و توزیع",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: "q-1" as QuizQuestionId,
        quizId,
        generatedContentId: null,
        lessonId,
        question: "کدام مسیر تجویز بالاترین فراهمی زیستی (Bioavailability) را دارد؟",
        questionType: "multiple_choice",
        choices: ["خوراکی (Oral)", "وریدی (IV)", "عضلانی (IM)", "زیرپوستی (SC)"],
        correctAnswer: "وریدی (IV)",
        explanation: "تزریق وریدی دارای فراهمی زیستی ۱۰۰٪ است.",
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    // Setup Flashcard in Course
    await flashcardStore.create({
      id: "card-1" as FlashcardId,
      organizationId: systemOrgId,
      courseId,
      documentId: null,
      generatedContentId: null,
      lessonId,
      question: "نیمه‌عمر دارو (t1/2) چیست؟",
      answer: "مدت زمانی که غلظت پلاسمایی دارو به نصف مقدار اولیه کاهش می‌یابد.",
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

    // Setup Active Product for Course (Price = 85,000 Tomans)
    courseProductId = asProductId(randomUUID());
    await commerceStore.createProduct({
      id: courseProductId,
      code: "course-pharm-101",
      type: "course",
      title: "دوره جامع فارماکولوژی بالینی",
      description: "دسترسی کامل به تمامی دروس و آزمون‌ها",
      price: 85000,
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

  describe("Phase 1: Direct URL Before Purchase (Unpaid Student)", () => {
    it("masks full lesson content markdown and flags locked=true for direct URL requests", async () => {
      const learnRes = await learningService.getCourseLearning(
        studentUser,
        courseId,
        "req-1",
      );

      const firstModule = learnRes.modules[0];
      const lockedLesson = firstModule.lessons.find((l) => l.locked === true)!;

      expect(lockedLesson).toBeDefined();
      expect(lockedLesson.locked).toBe(true);
      // The secret content must NEVER be exposed
      expect(lockedLesson.content_markdown).not.toContain(SECRET_LESSON_MARKDOWN);
      expect(lockedLesson.content_markdown).toContain("🔒");
      expect(lockedLesson.content_markdown).toContain("آوانا پلاس");
      expect(lockedLesson.purchase_options?.length).toBeGreaterThan(0);
    });

    it("blocks direct document download with 403 forbidden", async () => {
      await expect(
        documentService.downloadDocument(studentUser, systemOrgId, documentId),
      ).rejects.toThrow(DomainError);

      try {
        await documentService.downloadDocument(studentUser, systemOrgId, documentId);
      } catch (err: any) {
        expect(err.code).toBe("forbidden");
        expect(err.message).toContain("خرید");
      }
    });

    it("blocks direct quiz attempt with 403 forbidden", async () => {
      await expect(
        studyService.getQuizForAttempt(studentUser, systemOrgId, quizId),
      ).rejects.toThrow(DomainError);

      try {
        await studyService.getQuizForAttempt(studentUser, systemOrgId, quizId);
      } catch (err: any) {
        expect(err.code).toBe("forbidden");
        expect(err.message).toContain("دسترسی");
      }
    });

    it("blocks review of non-preview flashcard with 403 forbidden", async () => {
      const nonPreviewCardId = "card-locked-1" as FlashcardId;
      await flashcardStore.create({
        id: nonPreviewCardId,
        organizationId: systemOrgId,
        courseId,
        documentId: null,
        generatedContentId: null,
        lessonId: lockedLessonId,
        question: "سوال غیر پیش‌نمایش؟",
        answer: "پاسخ",
        explanation: null,
        cardType: "standard",
        difficulty: "medium",
        dueAt: new Date().toISOString(),
        intervalDays: 1,
        easeFactor: 2.5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await expect(
        studyService.submitFlashcardReview(studentUser, systemOrgId, {
          flashcardId: nonPreviewCardId,
          rating: "good",
        }),
      ).rejects.toThrow(DomainError);
    });

    it("renders pricing badges and purchase info in library resource queries", async () => {
      const libraryRes = await libraryService.listResources(
        studentUser,
        { type: "all" },
        "req-lib-1",
      );

      const courseCard = libraryRes.courses.find((c) => c.id === courseId);
      expect(courseCard).toBeDefined();
      expect(courseCard?.access?.hasAccess).toBe(false);
      expect(courseCard?.access?.isFree).toBe(false);
      expect(courseCard?.purchase?.price).toBe(85000);
      expect(courseCard?.purchase?.productId).toBe(courseProductId);

      const lockedContentCard = libraryRes.contents.find((c) => c.access?.hasAccess === false);
      expect(lockedContentCard).toBeDefined();
      expect(lockedContentCard?.access?.hasAccess).toBe(false);
      expect(lockedContentCard?.access?.isFree).toBe(false);
    });
  });

  describe("Phase 2: Direct URL After Purchase (Purchased Student)", () => {
    beforeEach(async () => {
      // Execute Card-to-Card purchase flow
      const c2cResult = await commerceService.submitCardToCardPayment(
        studentUser,
        {
          productId: courseProductId,
          amount: 85000,
          trackingNumber: `TRK-${Date.now()}`,
          sourceCardLast4: "5678",
        },
        "req-checkout-1",
      );

      expect(c2cResult.success).toBe(true);

      // Verify entitlement exists in commerce store
      const entitlements = await commerceStore.listActiveEntitlements(
        studentUser.userId,
      );
      expect(entitlements.length).toBeGreaterThan(0);
      expect(entitlements.some((e) => e.resourceId === courseId)).toBe(true);
    });

    it("displays complete, untruncated content_markdown and locked=false on direct URL", async () => {
      const learnRes = await learningService.getCourseLearning(
        studentUser,
        courseId,
        "req-2",
      );

      const firstModule = learnRes.modules[0];
      const firstLesson = firstModule.lessons[0];

      expect(firstLesson.locked).toBe(false);
      expect(firstLesson.content_markdown).toBe(SECRET_LESSON_MARKDOWN);
    });

    it("allows direct document download after purchase", async () => {
      const download = await documentService.downloadDocument(
        studentUser,
        systemOrgId,
        documentId,
      );

      expect(download.originalName).toBe("clinical_pharmacology.pdf");
      expect(download.data).toBeDefined();
    });

    it("allows direct quiz attempt and returns all questions/options after purchase", async () => {
      const quiz = await studyService.getQuizForAttempt(
        studentUser,
        systemOrgId,
        quizId,
      );

      expect(quiz.id).toBe(quizId);
      expect(quiz.questions.length).toBe(1);
      expect(quiz.questions[0].question).toContain("فراهمی زیستی");
      expect(quiz.questions[0].choices?.length).toBe(4);
    });

    it("allows direct flashcard study and returns cards after purchase", async () => {
      const cards = await studyService.listFlashcardsForReview(
        studentUser,
        systemOrgId,
        courseId,
      );

      expect(cards.length).toBe(1);
      expect(cards[0].question).toContain("نیمه‌عمر");
    });

    it("reflects purchased status in Library resource list", async () => {
      const libraryRes = await libraryService.listResources(
        studentUser,
        { type: "all" },
        "req-lib-2",
      );

      const courseCard = libraryRes.courses.find((c) => c.id === courseId);
      expect(courseCard?.access?.hasAccess).toBe(true);
      expect(courseCard?.access?.isPurchased).toBe(true);
      expect(courseCard?.access?.accessSource).toBe("course_purchase");

      const contentCard = libraryRes.contents.find((c) => c.id === lessonId);
      expect(contentCard?.access?.hasAccess).toBe(true);
      expect(contentCard?.access?.isPurchased).toBe(true);
      expect(contentCard?.access?.accessSource).toBe("course_purchase");
    });
  });

  describe("Phase 3: Subscription & Hierarchy Precedence", () => {
    it("allows full access to paid course content when user holds active subscription", async () => {
      // Add active subscription
      await commerceStore.createSubscription({
        id: "sub-1",
        userId: studentUser.userId,
        planType: "monthly",
        status: "active",
        startsAt: new Date(Date.now() - 86400000).toISOString(),
        expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        renewsAt: null,
        canceledAt: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const learnRes = await learningService.getCourseLearning(
        studentUser,
        courseId,
        "req-sub",
      );

      const firstLesson = learnRes.modules[0].lessons[0];
      expect(firstLesson.locked).toBe(false);
      expect(firstLesson.content_markdown).toBe(SECRET_LESSON_MARKDOWN);

      const quiz = await studyService.getQuizForAttempt(
        studentUser,
        systemOrgId,
        quizId,
      );
      expect(quiz.id).toBe(quizId);

      const download = await documentService.downloadDocument(
        studentUser,
        systemOrgId,
        documentId,
      );
      expect(download.originalName).toBe("clinical_pharmacology.pdf");
    });

    it("allows free preview lesson when standalone lesson product is free (price = 0) even if course is paid", async () => {
      // Define a free standalone product for this specific lesson
      await commerceStore.createProduct({
        id: asProductId(randomUUID()),
        code: `content-${lessonId}`,
        type: "content",
        title: "درس ۱ (پیش‌نمایش رایگان)",
        description: "پیش‌نمایش رایگان درس اول",
        price: 0,
        currency: "toman",
        targetType: "content",
        targetId: lessonId,
        durationDays: null,
        active: true,
        metadata: { adminPriced: true, explicitlyFree: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const learnRes = await learningService.getCourseLearning(
        studentUser,
        courseId,
        "req-free-prev",
      );

      const firstLesson = learnRes.modules[0].lessons[0];
      expect(firstLesson.locked).toBe(false);
      expect(firstLesson.content_markdown).toBe(SECRET_LESSON_MARKDOWN);
    });

    it("allows platform_admin and course creator full bypass without payment", async () => {
      // Platform admin
      const adminLearn = await learningService.getCourseLearning(
        adminUser,
        courseId,
        "req-admin",
      );
      expect(adminLearn.modules[0].lessons[0].locked).toBe(false);
      expect(adminLearn.modules[0].lessons[0].content_markdown).toBe(
        SECRET_LESSON_MARKDOWN,
      );

      // Creator
      const creatorLearn = await learningService.getCourseLearning(
        creatorUser,
        courseId,
        "req-creator",
      );
      expect(creatorLearn.modules[0].lessons[0].locked).toBe(false);
      expect(creatorLearn.modules[0].lessons[0].content_markdown).toBe(
        SECRET_LESSON_MARKDOWN,
      );
    });

    it("allows free course content to be accessed directly by any user", async () => {
      // Create free course
      const freeCourseId = asCourseId(randomUUID());
      await courseStore.create({
        course: {
          id: freeCourseId,
          organizationId: systemOrgId,
          name: "مبانی داروشناسی رایگان",
          description: "دوره عمومی و رایگان",
          subject: "داروسازی",
          level: "beginner",
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

      // Create a price=0 product for this explicitly free course
      await commerceStore.createProduct({
        id: asProductId(randomUUID()),
        code: `course_${freeCourseId}`,
        type: "course",
        title: "مبانی داروشناسی رایگان",
        description: "دوره عمومی و رایگان",
        price: 0,
        currency: "toman",
        targetType: "course",
        targetId: freeCourseId,
        durationDays: null,
        active: true,
        metadata: { adminPriced: true, explicitlyFree: true },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const freeModuleId = asModuleId(randomUUID());
      await moduleStore.create({
        id: freeModuleId,
        courseId: freeCourseId,
        documentId: null,
        title: "فصل اول",
        description: "مقدمه",
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const freeLessonId = asLessonId(randomUUID());
      await lessonStore.create({
        id: freeLessonId,
        moduleId: freeModuleId,
        title: "درس رایگان ۱",
        contentType: "lesson",
        contentMarkdown: "# این یک درس کاملاً رایگان است.",
        sortOrder: 1,
        estimatedMinutes: 5,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const learnRes = await learningService.getCourseLearning(
        studentUser,
        freeCourseId,
        "req-free",
      );

      const firstLesson = learnRes.modules[0].lessons[0];
      expect(firstLesson.locked).toBe(false);
      expect(firstLesson.content_markdown).toBe("# این یک درس کاملاً رایگان است.");
    });
  });
});
