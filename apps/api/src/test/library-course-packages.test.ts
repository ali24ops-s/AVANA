import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type ModuleId,
  type OrganizationId,
  type UserId,
  type GeneratedContentId,
  calculateDefaultContentPrice,
} from "@avana/domain";
import { LibraryService } from "../modules/library/library-service.js";
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";

describe("Educational Course Chapter Packages Suite (Complete 4-Asset Bundles)", () => {
  let userStore: InMemoryUserStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let contentPackUsageStore: InMemoryContentPackUsageStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let commerceStore: InMemoryCommerceStore;
  let entitlementService: EntitlementService;
  let contentPackStore: InMemoryContentPackStore;
  let libraryService: LibraryService;

  const testOrgId = randomUUID() as OrganizationId;
  const enrolledUserId = randomUUID() as UserId;
  const subscriberUserId = randomUUID() as UserId;
  const guestUserId = randomUUID() as UserId;

  const enrolledActor: Actor = { userId: enrolledUserId, role: "student" };
  const subscriberActor: Actor = { userId: subscriberUserId, role: "student" };
  const guestActor: Actor = { userId: guestUserId, role: "student" };

  let course1Id: CourseId;
  let course2Id: CourseId;
  let module1Id: ModuleId;
  let module2Id: ModuleId;
  let module3Id: ModuleId;
  let module4EmptyId: ModuleId;
  let doc1Id: DocumentId;
  let doc2Id: DocumentId;

  beforeEach(async () => {
    userStore = new InMemoryUserStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    contentPackUsageStore = new InMemoryContentPackUsageStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    commerceStore = new InMemoryCommerceStore();

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      lessonStore,
    });

    contentPackStore = new InMemoryContentPackStore(
      userStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      generatedContentStore,
      contentPackUsageStore,
      courseStore,
      progressStore,
      documentStore as any,
    );

    libraryService = new LibraryService(
      contentPackStore,
      contentPackUsageStore,
      documentStore as any,
      generatedContentStore,
      undefined, // organizationStore
      userStore, // userStore
      courseStore, // courseStore
      undefined, // policy
      undefined, // auditService
      entitlementService, // entitlementService
      commerceStore, // commerceStore
    );

    // 1. Seed Courses
    course1Id = randomUUID() as CourseId;
    course2Id = randomUUID() as CourseId;

    await courseStore.create({
      course: {
        id: course1Id,
        organizationId: testOrgId,
        name: "فارماکولوژی جامع",
        description: "دوره کامل داروشناسی بالینی و پایه",
        subject: "فارماکولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: course2Id,
        organizationId: testOrgId,
        name: "فیزیولوژی اعصاب",
        description: "مفاهیم هدایت عصبی و سیناپس",
        subject: "فیزیولوژی",
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: "2026-08-05T10:00:00.000Z",
        updatedAt: "2026-08-05T10:00:00.000Z",
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 2. Enroll enrolledUser in course1 and grant course purchase entitlement
    await courseStore.addUserCourse(enrolledUserId, course1Id, "student");
    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: enrolledUserId,
      resourceType: "course",
      resourceId: course1Id,
      sourceType: "course_purchase",
      orderId: null,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3. Grant active subscription to subscriberUser
    const subscriptionPlanId = randomUUID() as any;
    await commerceStore.createProduct({
      id: subscriptionPlanId,
      code: "sub_pro_monthly",
      type: "subscription",
      title: "اشتراک ماهانه آوانا پرو",
      description: "دسترسی کامل به تمام دوره‌ها و بسته‌های آموزشی",
      price: 299000,
      currency: "IRR",
      targetType: "plan",
      targetId: null,
      durationDays: 30,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await commerceStore.createSubscription({
      id: randomUUID() as any,
      userId: subscriberUserId,
      productId: subscriptionPlanId,
      orderId: null,
      status: "active",
      startedAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 29 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await commerceStore.grantEntitlement({
      id: randomUUID() as any,
      userId: subscriberUserId,
      resourceType: "subscription",
      resourceId: null,
      sourceType: "subscription",
      orderId: null,
      startsAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 29 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 4. Seed Modules
    module1Id = randomUUID() as ModuleId;
    module2Id = randomUUID() as ModuleId;
    module3Id = randomUUID() as ModuleId;
    module4EmptyId = randomUUID() as ModuleId;

    await moduleStore.create({
      id: module1Id,
      courseId: course1Id,
      title: "فصل اول: داروهای کولینرژیک",
      description: "آگونیست‌ها و آنتاگونیست‌های گیرنده‌های موسکارینی و نیکوتینی",
      sortOrder: 1,
      createdAt: "2026-08-01T11:00:00.000Z",
      updatedAt: "2026-08-01T11:00:00.000Z",
      deletedAt: null,
    });

    await moduleStore.create({
      id: module2Id,
      courseId: course1Id,
      title: "فصل دوم: داروهای آدرنرژیک",
      description: "سمپاتومیمتیک‌ها و سمپاتولیتیک‌ها",
      sortOrder: 2,
      createdAt: "2026-08-01T11:30:00.000Z",
      updatedAt: "2026-08-01T11:30:00.000Z",
      deletedAt: null,
    });

    await moduleStore.create({
      id: module3Id,
      courseId: course2Id,
      title: "فصل اول: پتانسیل عمل و سیناپس",
      description: "مکانیسم‌های الکتروفیزیولوژی انتقال پیام عصبی",
      sortOrder: 1,
      createdAt: "2026-08-05T11:00:00.000Z",
      updatedAt: "2026-08-05T11:00:00.000Z",
      deletedAt: null,
    });

    await moduleStore.create({
      id: module4EmptyId,
      courseId: course2Id,
      title: "فصل دوم: خالی بدون محتوا",
      description: "هنوز محتوایی بارگذاری نشده است",
      sortOrder: 2,
      createdAt: "2026-08-05T11:30:00.000Z",
      updatedAt: "2026-08-05T11:30:00.000Z",
      deletedAt: null,
    });

    // 5. Seed Documents
    doc1Id = randomUUID() as DocumentId;
    doc2Id = randomUUID() as DocumentId;

    await documentStore.create({
      id: doc1Id,
      organizationId: testOrgId,
      userId: enrolledUserId,
      courseId: course1Id,
      moduleId: module1Id,
      title: "جزوه کامل داروهای کولینرژیک",
      fileType: "pdf",
      fileSize: 1024000,
      storageKey: `docs/${doc1Id}.pdf`,
      processingStatus: "completed",
      createdAt: "2026-08-01T10:30:00.000Z",
      updatedAt: "2026-08-01T10:30:00.000Z",
      deletedAt: null,
    });

    await documentStore.create({
      id: doc2Id,
      organizationId: testOrgId,
      userId: enrolledUserId,
      courseId: course2Id,
      moduleId: module3Id,
      title: "جزوه الکتروفیزیولوژی سیناپس",
      fileType: "pdf",
      fileSize: 2048000,
      storageKey: `docs/${doc2Id}.pdf`,
      processingStatus: "completed",
      createdAt: "2026-08-05T10:30:00.000Z",
      updatedAt: "2026-08-05T10:30:00.000Z",
      deletedAt: null,
    });

    // 6. Populate Module 1 with ALL 4 CONTENT TYPES (Complete Package)
    // 6a. Lessons (2 lessons)
    const lesson1Id = randomUUID();
    const lesson2Id = randomUUID();
    await lessonStore.create({
      id: lesson1Id as any,
      moduleId: module1Id,
      title: "درسنامه آگونیست‌های کولینرژیک مستقیم",
      contentType: "markdown",
      contentMarkdown: "# آگونیست‌های موسکارینی...",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
      deletedAt: null,
    });
    await lessonStore.create({
      id: lesson2Id as any,
      moduleId: module1Id,
      title: "درسنامه آنتی‌کولین‌استرازها",
      contentType: "markdown",
      contentMarkdown: "# مهارکننده‌های استیل‌کولین‌استراز...",
      sortOrder: 2,
      estimatedMinutes: 20,
      publicationStatus: "published",
      createdAt: "2026-08-01T12:30:00.000Z",
      updatedAt: "2026-08-01T12:30:00.000Z",
      deletedAt: null,
    });

    // 6b. Flashcards (8 cards)
    for (let i = 1; i <= 8; i++) {
      await flashcardStore.create({
        id: randomUUID() as any,
        organizationId: testOrgId,
        documentId: doc1Id,
        courseId: course1Id,
        lessonId: lesson1Id as any,
        front: `سوال فلش‌کارت کولینرژیک ${i}`,
        back: `پاسخ فلش‌کارت کولینرژیک ${i}`,
        sortOrder: i,
        createdAt: "2026-08-01T13:00:00.000Z",
        updatedAt: "2026-08-01T13:00:00.000Z",
        deletedAt: null,
      });
    }

    // 6c. Quiz with Questions (5 questions)
    const quiz1Id = randomUUID();
    await quizStore.create({
      id: quiz1Id as any,
      organizationId: testOrgId,
      documentId: doc1Id,
      courseId: course1Id,
      lessonId: lesson1Id as any,
      title: "آزمون تستی داروهای کولینرژیک",
      description: "ارزیابی مفاهیم گیرنده‌های موسکارینی و نیکوتینی",
      createdAt: "2026-08-01T14:00:00.000Z",
      updatedAt: "2026-08-01T14:00:00.000Z",
      deletedAt: null,
    });
    const q1List: any[] = [];
    for (let i = 1; i <= 5; i++) {
      q1List.push({
        id: randomUUID() as any,
        quizId: quiz1Id as any,
        question: `سوال ${i}: اثر پیلوکارپین بر مردمک چیست؟`,
        choices: ["میوزیس", "میدریازیس", "بدون تغییر", "فلج تطابق"],
        correctAnswer: "میوزیس",
        sortOrder: i,
        createdAt: "2026-08-01T14:00:00.000Z",
        updatedAt: "2026-08-01T14:00:00.000Z",
        deletedAt: null,
      });
    }
    await quizQuestionStore.createMany(q1List);

    // 6d. Review Summary
    await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: testOrgId,
      courseId: course1Id,
      documentId: doc1Id,
      type: "review_summary",
      status: "accepted",
      payload: {
        title: "خلاصه جامع داروهای کولینرژیک",
        overview: "نکات کلیدی آگونیست‌ها، آنتاگونیست‌ها و مسمومیت ارگانوفسفره",
        estimatedReadingMinutes: 12,
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: "2026-08-01T15:00:00.000Z",
      acceptedBy: enrolledUserId,
      reviewedBy: enrolledUserId,
      reviewedAt: "2026-08-01T15:00:00.000Z",
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: lesson1Id as any,
      createdAt: "2026-08-01T15:00:00.000Z",
      updatedAt: "2026-08-01T15:00:00.000Z",
      deletedAt: null,
    });

    // 7. Populate Module 2 with PARTIAL CONTENT (Lesson + Flashcards only)
    const lesson3Id = randomUUID();
    await lessonStore.create({
      id: lesson3Id as any,
      moduleId: module2Id,
      title: "درسنامه آگونیست‌های آلفا و بتا",
      contentType: "markdown",
      contentMarkdown: "# گیرنده‌های آدرنرژیک...",
      sortOrder: 1,
      estimatedMinutes: 25,
      publicationStatus: "published",
      createdAt: "2026-08-01T16:00:00.000Z",
      updatedAt: "2026-08-01T16:00:00.000Z",
      deletedAt: null,
    });
    for (let i = 1; i <= 6; i++) {
      await flashcardStore.create({
        id: randomUUID() as any,
        organizationId: testOrgId,
        documentId: null,
        courseId: course1Id,
        lessonId: lesson3Id as any,
        front: `سوال فلش‌کارت آدرنرژیک ${i}`,
        back: `پاسخ فلش‌کارت آدرنرژیک ${i}`,
        sortOrder: i,
        createdAt: "2026-08-01T16:30:00.000Z",
        updatedAt: "2026-08-01T16:30:00.000Z",
        deletedAt: null,
      });
    }

    // 8. Populate Module 3 with PARTIAL CONTENT (Lesson + Quiz + Summary, No Flashcards)
    const lesson4Id = randomUUID();
    await lessonStore.create({
      id: lesson4Id as any,
      moduleId: module3Id,
      title: "درسنامه پتانسیل عمل و سیناپس شیمیایی",
      contentType: "markdown",
      contentMarkdown: "# فیزیولوژی سیناپس...",
      sortOrder: 1,
      estimatedMinutes: 18,
      publicationStatus: "published",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
      deletedAt: null,
    });
    const quiz2Id = randomUUID();
    await quizStore.create({
      id: quiz2Id as any,
      organizationId: testOrgId,
      documentId: doc2Id,
      courseId: course2Id,
      lessonId: lesson4Id as any,
      title: "آزمون الکتروفیزیولوژی سیناپس",
      description: "ارزیابی پتانسیل عمل و آزادسازی وزیکول‌ها",
      createdAt: "2026-08-05T13:00:00.000Z",
      updatedAt: "2026-08-05T13:00:00.000Z",
      deletedAt: null,
    });
    const q2List: any[] = [];
    for (let i = 1; i <= 4; i++) {
      q2List.push({
        id: randomUUID() as any,
        quizId: quiz2Id as any,
        question: `سوال سیناپس ${i}: ورود کدام یون باعث اگزوسیتوز وزیکول‌ها می‌شود؟`,
        choices: ["کلسیم", "سدیم", "پتاسیم", "کلر"],
        correctAnswer: "کلسیم",
        sortOrder: i,
        createdAt: "2026-08-05T13:00:00.000Z",
        updatedAt: "2026-08-05T13:00:00.000Z",
        deletedAt: null,
      });
    }
    await quizQuestionStore.createMany(q2List);
    await generatedContentStore.create({
      id: randomUUID() as GeneratedContentId,
      organizationId: testOrgId,
      courseId: course2Id,
      documentId: doc2Id,
      type: "review_summary",
      status: "accepted",
      payload: {
        title: "خلاصه هدایت پیام عصبی و سیناپس",
        overview: "مرور نکات کلیدی کانال‌های ولتاژی و گیرنده‌های یونوتروپیک",
        estimatedReadingMinutes: 10,
      },
      promptVersion: "v1",
      model: "test-model",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: "2026-08-05T14:00:00.000Z",
      acceptedBy: enrolledUserId,
      reviewedBy: enrolledUserId,
      reviewedAt: "2026-08-05T14:00:00.000Z",
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: lesson4Id as any,
      createdAt: "2026-08-05T14:00:00.000Z",
      updatedAt: "2026-08-05T14:00:00.000Z",
      deletedAt: null,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Hierarchy & Zero-Duplicate Package Identity
  // ---------------------------------------------------------------------------
  it("groups educational packages strictly by Course + Chapter/Module with zero duplicates", async () => {
    const result = await libraryService.listCoursePackages(
      guestActor,
      {},
      "req-grouping",
    );

    expect(result.courses.length).toBe(2);

    // Course 1 (فارماکولوژی جامع) should have exactly 2 chapter packages
    const course1 = result.courses.find((c) => c.id === course1Id);
    expect(course1).toBeDefined();
    expect(course1?.totalPackages).toBe(2);
    expect(course1?.packages.length).toBe(2);

    const [pkg1, pkg2] = course1!.packages;
    expect(pkg1.moduleId).toBe(module1Id);
    expect(pkg1.title).toBe("فصل اول: داروهای کولینرژیک");
    expect(pkg1.courseId).toBe(course1Id);

    expect(pkg2.moduleId).toBe(module2Id);
    expect(pkg2.title).toBe("فصل دوم: داروهای آدرنرژیک");
    expect(pkg2.courseId).toBe(course1Id);

    // Course 2 (فیزیولوژی اعصاب) should have 1 package (module 4 is empty, so omitted)
    const course2 = result.courses.find((c) => c.id === course2Id);
    expect(course2).toBeDefined();
    expect(course2?.totalPackages).toBe(1);
    expect(course2?.packages.length).toBe(1);
    expect(course2?.packages[0].moduleId).toBe(module3Id);
  });

  // ---------------------------------------------------------------------------
  // 2. 4 Educational Content Types & Completeness Resolution
  // ---------------------------------------------------------------------------
  it("resolves all 4 educational content types accurately and detects completeness status", async () => {
    const result = await libraryService.listCoursePackages(
      guestActor,
      {},
      "req-contents",
    );

    const course1 = result.courses.find((c) => c.id === course1Id)!;
    const pkg1 = course1.packages.find((p) => p.moduleId === module1Id)!;

    // Pkg 1: COMPLETE (Lesson + Flashcards + Quiz + Summary)
    expect(pkg1.completeness).toBe("complete");
    expect(pkg1.contents.lesson.exists).toBe(true);
    expect(pkg1.contents.lesson.count).toBe(2);
    expect(pkg1.contents.lesson.estimatedMinutes).toBe(35); // 15 + 20
    expect(pkg1.contents.summary.exists).toBe(true);
    expect(pkg1.contents.summary.title).toBe("خلاصه جامع داروهای کولینرژیک");
    expect(pkg1.contents.flashcards.exists).toBe(true);
    expect(pkg1.contents.flashcards.count).toBe(8);
    expect(pkg1.contents.quiz.exists).toBe(true);
    expect(pkg1.contents.quiz.questionCount).toBe(5);

    // Pkg 2: PARTIAL (Lesson + Flashcards, No Quiz, No Summary)
    const pkg2 = course1.packages.find((p) => p.moduleId === module2Id)!;
    expect(pkg2.completeness).toBe("partial");
    expect(pkg2.contents.lesson.exists).toBe(true);
    expect(pkg2.contents.lesson.count).toBe(1);
    expect(pkg2.contents.flashcards.exists).toBe(true);
    expect(pkg2.contents.flashcards.count).toBe(6);
    expect(pkg2.contents.summary.exists).toBe(false);
    expect(pkg2.contents.quiz.exists).toBe(false);

    // Pkg 3: PARTIAL (Lesson + Quiz + Summary, No Flashcards)
    const course2 = result.courses.find((c) => c.id === course2Id)!;
    const pkg3 = course2.packages.find((p) => p.moduleId === module3Id)!;
    expect(pkg3.completeness).toBe("partial");
    expect(pkg3.contents.lesson.exists).toBe(true);
    expect(pkg3.contents.summary.exists).toBe(true);
    expect(pkg3.contents.quiz.exists).toBe(true);
    expect(pkg3.contents.quiz.questionCount).toBe(4);
    expect(pkg3.contents.flashcards.exists).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 3. Canonical Pricing Integration
  // ---------------------------------------------------------------------------
  it("calculates canonical content pack pricing via calculateDefaultContentPrice and prioritizes active commerce product", async () => {
    // 3a. Check default calculated canonical price for Pkg 1
    const result1 = await libraryService.listCoursePackages(
      guestActor,
      {},
      "req-price",
    );
    const course1 = result1.courses.find((c) => c.id === course1Id)!;
    const pkg1 = course1.packages.find((p) => p.moduleId === module1Id)!;

    const expectedCanonicalPrice = calculateDefaultContentPrice({
      lessonCount: 2,
      flashcardCount: 8,
      questionCount: 5,
      hasReviewSummary: true,
    });
    expect(pkg1.purchase.price).toBe(expectedCanonicalPrice);
    expect(pkg1.purchase.productId).toBeNull();

    // 3b. Create an active commerce product targeting this package
    const customPrice = 89000;
    const prodId = randomUUID() as any;
    const prod = await commerceStore.createProduct({
      id: prodId,
      code: `pack-${pkg1.id}`,
      type: "content_pack",
      title: "بسته آموزشی فصل اول فارماکولوژی",
      description: "بسته کامل ۴ محتوایی",
      targetType: "content_pack",
      targetId: pkg1.id,
      price: customPrice,
      currency: "IRR",
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const result2 = await libraryService.listCoursePackages(
      guestActor,
      {},
      "req-price-active",
    );
    const course1After = result2.courses.find((c) => c.id === course1Id)!;
    const pkg1After = course1After.packages.find((p) => p.moduleId === module1Id)!;

    expect(pkg1After.purchase.productId).toBe(prod.id);
    expect(pkg1After.purchase.price).toBe(customPrice);
  });

  // ---------------------------------------------------------------------------
  // 4. Entitlements & Access Control Integration
  // ---------------------------------------------------------------------------
  it("grants access to packages for course-enrolled user and active subscribers, while denying guest user", async () => {
    // 4a. Course-enrolled user has access to Course 1 packages, but NOT Course 2
    const enrolledResult = await libraryService.listCoursePackages(
      enrolledActor,
      {},
      "req-enrolled",
    );
    const enrolledCourse1 = enrolledResult.courses.find((c) => c.id === course1Id)!;
    const enrolledCourse2 = enrolledResult.courses.find((c) => c.id === course2Id)!;

    expect(enrolledCourse1.access?.hasAccess).toBe(true);
    expect(enrolledCourse1.packages[0].access.hasAccess).toBe(true);
    expect(enrolledCourse1.packages[1].access.hasAccess).toBe(true);

    expect(enrolledCourse2.access?.hasAccess).toBe(false);
    expect(enrolledCourse2.packages[0].access.hasAccess).toBe(false);

    // 4b. Subscriber user has access to ALL courses & chapter packages
    const subResult = await libraryService.listCoursePackages(
      subscriberActor,
      {},
      "req-subscriber",
    );
    const subCourse1 = subResult.courses.find((c) => c.id === course1Id)!;
    const subCourse2 = subResult.courses.find((c) => c.id === course2Id)!;

    expect(subCourse1.access?.hasAccess).toBe(true);
    expect(subCourse1.packages[0].access.hasAccess).toBe(true);
    expect(subCourse1.packages[0].access.accessSource).toBe("subscription");
    expect(subCourse2.access?.hasAccess).toBe(true);
    expect(subCourse2.packages[0].access.hasAccess).toBe(true);
    expect(subCourse2.packages[0].access.accessSource).toBe("subscription");

    // 4c. Guest user has NO access
    const guestResult = await libraryService.listCoursePackages(
      guestActor,
      {},
      "req-guest",
    );
    expect(guestResult.courses[0].access?.hasAccess).toBe(false);
    expect(guestResult.courses[0].packages[0].access.hasAccess).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 5. Query Filters: course_id, subject, search q
  // ---------------------------------------------------------------------------
  it("filters course packages by course_id, subject, and search keyword", async () => {
    // Filter by course_id
    const courseOnlyRes = await libraryService.listCoursePackages(
      guestActor,
      { course_id: course1Id },
      "req-filter-course",
    );
    expect(courseOnlyRes.courses.length).toBe(1);
    expect(courseOnlyRes.courses[0].id).toBe(course1Id);

    // Filter by subject (فیزیولوژی)
    const subjectRes = await libraryService.listCoursePackages(
      guestActor,
      { subject: "فیزیولوژی" },
      "req-filter-subject",
    );
    expect(subjectRes.courses.length).toBe(1);
    expect(subjectRes.courses[0].id).toBe(course2Id);

    // Search query (کولینرژیک)
    const searchRes = await libraryService.listCoursePackages(
      guestActor,
      { q: "کولینرژیک" },
      "req-search-q",
    );
    expect(searchRes.courses.length).toBe(1);
    expect(searchRes.courses[0].id).toBe(course1Id);
    expect(searchRes.courses[0].packages.length).toBe(1);
    expect(searchRes.courses[0].packages[0].title).toBe("فصل اول: داروهای کولینرژیک");
  });
});
