import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asCourseId,
  asLessonId,
  asModuleId,
  asOrganizationId,
  asProductId,
  asUserId,
  asUserEntitlementId,
  type Actor,
  type CourseId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type UserId,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { LearningService } from "../modules/learning/learning-service.js";
import { LibraryService } from "../modules/library/library-service.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";

describe("E2E Content & Course Pricing, Purchase Independence, and Paywall Verification", () => {
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
  let contentPackStore: InMemoryContentPackStore;

  let learningService: LearningService;
  let libraryService: LibraryService;

  const systemOrgId = asOrganizationId("system-org-avana");
  const adminActor: Actor = { userId: asUserId("admin-1"), role: "platform_admin" };
  const studentActor: Actor = { userId: asUserId("student-1"), role: "student" };

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway();
    courseStore = new InMemoryCourseStore();
    organizationStore = new InMemoryOrganizationStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    contentPackStore = new InMemoryContentPackStore();

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      lessonStore,
    );

    entitlementService = new EntitlementService({
      commerceStore,
      courseStore,
      moduleStore,
      lessonStore,
      contentPackStore,
    });

    learningService = new LearningService(
      courseStore,
      organizationStore,
      moduleStore,
      lessonStore,
      progressStore,
      undefined as any,
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
      undefined,
      undefined,
      entitlementService,
      commerceStore,
      systemOrgId,
    );

    // Seed default subscription product
    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: "sub_pro_monthly",
      type: "subscription",
      title: "اشتراک ماهانه آوانا پلاس",
      description: "دسترسی نامحدود به کلیه دوره‌ها و درسنامه‌ها",
      price: 189000,
      currency: "toman",
      targetType: "subscription",
      targetId: "plan_monthly",
      durationDays: 30,
      active: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
  });

  it("Step 4 & 5: Verified End-to-End Independence Scenario (Content A -> Course A)", async () => {
    // 1. Create Course A with 3 Lessons: Lesson A, Lesson B, Lesson C
    const courseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره جامع هوش مصنوعی",
        description: "آموزش هوش مصنوعی",
        subject: "AI Engineering",
        status: "published",
        isOfficial: true,
        examDate: "2026-10-01",
        deletedAt: null,
        ownerUserId: adminActor.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const moduleId = asModuleId(randomUUID());
    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل اول: مفاهیم پایه",
      description: "مفاهیم اولیه",
      sortOrder: 1,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const lessonAId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonAId,
      moduleId,
      title: "درس اول: شبکه‌های عصبی",
      contentType: "markdown",
      contentMarkdown: "# محتوای محرمانه درس اول",
      sortOrder: 1,
      estimatedMinutes: 20,
      publicationStatus: "published",
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const lessonBId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonBId,
      moduleId,
      title: "درس دوم: یادگیری عمیق",
      contentType: "markdown",
      contentMarkdown: "# محتوای محرمانه درس دوم",
      sortOrder: 2,
      estimatedMinutes: 25,
      publicationStatus: "published",
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const lessonCId = asLessonId(randomUUID());
    await lessonStore.create({
      id: lessonCId,
      moduleId,
      title: "درس سوم: ترانسفورمرها",
      contentType: "markdown",
      contentMarkdown: "# محتوای محرمانه درس سوم",
      sortOrder: 3,
      estimatedMinutes: 30,
      publicationStatus: "published",
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Set Course Price (300,000 Toman) & Individual Lesson Prices (Lesson A: 50,000, Lesson B: 60,000, Lesson C: 70,000)
    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `course_${courseId}`,
      type: "course",
      title: "دوره جامع هوش مصنوعی",
      description: null,
      price: 300000,
      currency: "toman",
      targetType: "course",
      targetId: courseId,
      durationDays: null,
      active: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonAId}`,
      type: "content",
      title: "درس اول: شبکه‌های عصبی",
      description: null,
      price: 50000,
      currency: "toman",
      targetType: "content",
      targetId: lessonAId,
      durationDays: null,
      active: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonBId}`,
      type: "content",
      title: "درس دوم: یادگیری عمیق",
      description: null,
      price: 60000,
      currency: "toman",
      targetType: "content",
      targetId: lessonBId,
      durationDays: null,
      active: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await commerceStore.createProduct({
      id: asProductId(randomUUID()),
      code: `content_${lessonCId}`,
      type: "content",
      title: "درس سوم: ترانسفورمرها",
      description: null,
      price: 70000,
      currency: "toman",
      targetType: "content",
      targetId: lessonCId,
      durationDays: null,
      active: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // 3. BEFORE ANY PURCHASE: Check learning data & paywall options
    const beforeLearn = await learningService.getCourseLearning(studentActor, courseId, "req-1");
    expect(beforeLearn.course.locked).toBe(true);
    expect(beforeLearn.access?.granted).toBe(false);

    // Verify all 3 lessons are locked
    const lessonsBefore = beforeLearn.modules[0].lessons;
    expect(lessonsBefore[0].locked).toBe(true);
    expect(lessonsBefore[1].locked).toBe(true);
    expect(lessonsBefore[2].locked).toBe(true);

    // Requirement 6: Verify Network Payload Security — contentMarkdown is REDACTED for unpaid user
    expect(lessonsBefore[0].content_markdown).toContain("🔒 این محتوا مخصوص اعضای ویژه آوانا است");
    expect(lessonsBefore[0].content_markdown).not.toContain("محتوای محرمانه درس اول");
    expect(lessonsBefore[1].content_markdown).not.toContain("محتوای محرمانه درس دوم");
    expect(lessonsBefore[2].content_markdown).not.toContain("محتوای محرمانه درس سوم");

    // Paywall options for Lesson A includes Lesson A (50,000), Course (300,000), Subscription (189,000)
    const optionsA = lessonsBefore[0].purchase_options!;
    expect(optionsA).toBeDefined();
    expect(optionsA.some((o) => o.type === "content" && o.price === 50000)).toBe(true);
    expect(optionsA.some((o) => o.type === "course" && o.price === 300000)).toBe(true);
    expect(optionsA.some((o) => o.type === "subscription" && o.price === 189000)).toBe(true);

    // 4. BUY ONLY CONTENT A
    await commerceStore.grantEntitlement({
      id: asUserEntitlementId(randomUUID()),
      userId: studentActor.userId,
      resourceType: "content",
      resourceId: lessonAId,
      accessSource: "content_purchase",
      startsAt: new Date(),
      expiresAt: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // Verify Independence: Content A Accessible, Content B & C Locked, Course Locked
    const afterBuyA = await learningService.getCourseLearning(studentActor, courseId, "req-2");
    expect(afterBuyA.course.locked).toBe(true);
    expect(afterBuyA.access?.granted).toBe(false);

    const lessonsAfterBuyA = afterBuyA.modules[0].lessons;
    // Content A -> Accessible with full content!
    expect(lessonsAfterBuyA[0].locked).toBe(false);
    expect(lessonsAfterBuyA[0].content_markdown).toBe("# محتوای محرمانه درس اول");

    // Content B -> Locked & Redacted
    expect(lessonsAfterBuyA[1].locked).toBe(true);
    expect(lessonsAfterBuyA[1].content_markdown).toContain("🔒");
    expect(lessonsAfterBuyA[1].content_markdown).not.toContain("محتوای محرمانه درس دوم");

    // Content C -> Locked & Redacted
    expect(lessonsAfterBuyA[2].locked).toBe(true);
    expect(lessonsAfterBuyA[2].content_markdown).toContain("🔒");
    expect(lessonsAfterBuyA[2].content_markdown).not.toContain("محتوای محرمانه درس سوم");

    // 5. NOW BUY ENTIRE COURSE A
    await commerceStore.grantEntitlement({
      id: asUserEntitlementId(randomUUID()),
      userId: studentActor.userId,
      resourceType: "course",
      resourceId: courseId,
      accessSource: "course_purchase",
      startsAt: new Date(),
      expiresAt: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    // Verify: Course A Accessible, and ALL Lessons (A, B, C) Accessible!
    const afterBuyCourse = await learningService.getCourseLearning(studentActor, courseId, "req-3");
    expect(afterBuyCourse.course.locked).toBe(false);
    expect(afterBuyCourse.access?.granted).toBe(true);

    const lessonsAfterCourse = afterBuyCourse.modules[0].lessons;
    expect(lessonsAfterCourse[0].locked).toBe(false);
    expect(lessonsAfterCourse[0].content_markdown).toBe("# محتوای محرمانه درس اول");

    expect(lessonsAfterCourse[1].locked).toBe(false);
    expect(lessonsAfterCourse[1].content_markdown).toBe("# محتوای محرمانه درس دوم");

    expect(lessonsAfterCourse[2].locked).toBe(false);
    expect(lessonsAfterCourse[2].content_markdown).toBe("# محتوای محرمانه درس سوم");
  });
});
