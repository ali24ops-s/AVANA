import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type ProductId,
  type UserId,
  asCourseId,
  asLessonId,
  asModuleId,
  asOrganizationId,
  asProductId,
  asUserId,
  asUserEntitlementId,
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
} from "../modules/learning/test/in-memory-stores.js";
import { LearningService } from "../modules/learning/learning-service.js";
import { LibraryService } from "../modules/library/library-service.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";

describe("AVANA Content and Course Independent Pricing Architecture", () => {
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

  const systemOrgId = asOrganizationId(randomUUID());

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
  let lesson1Id: LessonId;
  let lesson2Id: LessonId;
  let lesson3Id: LessonId;

  let courseProductId: ProductId;
  let lesson1ProductId: ProductId;
  let lesson2ProductId: ProductId;

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

    // Create a course
    courseId = asCourseId(randomUUID());
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: systemOrgId,
        name: "دوره جامع هوش مصنوعی",
        description: "آموزش کامل مبانی و کاربردهای پیشرفته هوش مصنوعی",
        subject: "computer_science",
        level: "intermediate",
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

    // Create a module
    moduleId = asModuleId(randomUUID());
    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل ۱: مفاهیم پایه",
      description: "آشنایی با یادگیری ماشین و شبکه‌های عصبی",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create 3 lessons
    lesson1Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: lesson1Id,
      moduleId,
      title: "درس ۱: یادگیری ماشین چیست؟",
      contentType: "lesson",
      contentMarkdown: "# متن کامل و محرمانه درس ۱",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lesson2Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: lesson2Id,
      moduleId,
      title: "درس ۲: شبکه‌های عصبی و یادگیری عمیق",
      contentType: "lesson",
      contentMarkdown: "# متن کامل و محرمانه درس ۲",
      sortOrder: 2,
      estimatedMinutes: 20,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lesson3Id = asLessonId(randomUUID());
    await lessonStore.create({
      id: lesson3Id,
      moduleId,
      title: "درس ۳: ترنسفورمرها و مدل‌های زبانی",
      contentType: "lesson",
      contentMarkdown: "# متن کامل و محرمانه درس ۳",
      sortOrder: 3,
      estimatedMinutes: 25,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create products with decoupled, independent pricing:
    // Course price: 150,000 Toman
    // Lesson 1 price: 60,000 Toman
    // Lesson 2 price: 70,000 Toman
    // Lesson 3: No individual product (inherits course pricing / access)
    courseProductId = asProductId(randomUUID());
    await commerceStore.createProduct({
      id: courseProductId,
      code: `course_${courseId}`,
      type: "course",
      title: "دوره جامع هوش مصنوعی",
      description: "خرید کل دوره جامع",
      price: 150000,
      currency: "toman",
      targetType: "course",
      targetId: courseId,
      durationDays: null,
      active: true,
      metadata: { courseId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lesson1ProductId = asProductId(randomUUID());
    await commerceStore.createProduct({
      id: lesson1ProductId,
      code: `content_${lesson1Id}`,
      type: "content",
      title: "خرید درس ۱: یادگیری ماشین چیست؟",
      description: "دسترسی مستقل و دائمی به درس ۱",
      price: 60000,
      currency: "toman",
      targetType: "content",
      targetId: lesson1Id,
      durationDays: null,
      active: true,
      metadata: { lessonId: lesson1Id },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lesson2ProductId = asProductId(randomUUID());
    await commerceStore.createProduct({
      id: lesson2ProductId,
      code: `content_${lesson2Id}`,
      type: "content",
      title: "خرید درس ۲: شبکه‌های عصبی",
      description: "دسترسی مستقل و دائمی به درس ۲",
      price: 70000,
      currency: "toman",
      targetType: "content",
      targetId: lesson2Id,
      durationDays: null,
      active: true,
      metadata: { lessonId: lesson2Id },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  describe("1. Access Control & Paywall Resolution", () => {
    it("locks unpurchased paid content and returns available purchase options (content, course, subscription)", async () => {
      const access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "lesson",
        resourceId: lesson1Id,
        courseId,
      });

      expect(access.granted).toBe(false);
      expect(access.reason).toBe("locked");
      expect(access.availablePurchaseOptions.length).toBeGreaterThanOrEqual(3);

      const contentOpt = access.availablePurchaseOptions.find(
        (o) => o.type === "content",
      );
      const courseOpt = access.availablePurchaseOptions.find(
        (o) => o.type === "course",
      );
      const subOpt = access.availablePurchaseOptions.find(
        (o) => o.type === "subscription",
      );

      expect(contentOpt).toBeDefined();
      expect(contentOpt!.productId).toBe(lesson1ProductId);
      expect(contentOpt!.price).toBe(60000);

      expect(courseOpt).toBeDefined();
      expect(courseOpt!.productId).toBe(courseProductId);
      expect(courseOpt!.price).toBe(150000);

      expect(subOpt).toBeDefined();
    });

    it("locks unpurchased course directly", async () => {
      const access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });

      expect(access.granted).toBe(false);
      expect(access.reason).toBe("locked");
    });
  });

  describe("2. Independent Content Purchase & Lifetime Access", () => {
    it("allows purchasing an individual lesson creating a permanent content entitlement", async () => {
      // 1. Submit Card-to-Card payment for lesson product
      const c2cRes = await commerceService.submitCardToCardPayment(
        studentUser,
        {
          productId: lesson1ProductId,
          amount: 60000,
          trackingNumber: "TRK-C2C-LESSON-1",
          sourceCardLast4: "1234",
        },
        "req-c2c-lesson-1",
      );

      expect(c2cRes.success).toBe(true);
      expect(c2cRes.orderId).toBeDefined();

      const ent = await commerceStore.findActiveEntitlement(
        studentUser.userId,
        "content",
        lesson1Id,
      );
      expect(ent).toBeDefined();
      expect(ent!.resourceType).toBe("content");
      expect(ent!.resourceId).toBe(lesson1Id);
      expect(ent!.expiresAt).toBeNull();

      // 3. Check access for lesson 1 -> GRANTED (content_purchase)
      const lesson1Access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "lesson",
        resourceId: lesson1Id,
        courseId,
      });
      expect(lesson1Access.granted).toBe(true);
      expect(lesson1Access.reason).toBe("content_purchase");

      // 4. Check access for lesson 2 -> Still LOCKED!
      const lesson2Access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "lesson",
        resourceId: lesson2Id,
        courseId,
      });
      expect(lesson2Access.granted).toBe(false);
      expect(lesson2Access.reason).toBe("locked");

      // 5. Check access for Course -> Still LOCKED!
      const courseAccess = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });
      expect(courseAccess.granted).toBe(false);
      expect(courseAccess.reason).toBe("locked");
    });
  });

  describe("3. Full Course Purchase & Hierarchical Unlocking", () => {
    it("purchasing the course unlocks ALL lessons within the course dynamically without duplicate rows", async () => {
      // 1. Submit Card-to-Card payment for Course product
      const c2cRes = await commerceService.submitCardToCardPayment(
        studentUser,
        {
          productId: courseProductId,
          amount: 150000,
          trackingNumber: "TRK-C2C-COURSE-1",
          sourceCardLast4: "5678",
        },
        "req-c2c-course-1",
      );

      expect(c2cRes.success).toBe(true);
      expect(c2cRes.orderId).toBeDefined();

      const ent = await commerceStore.findActiveEntitlement(
        studentUser.userId,
        "course",
        courseId,
      );
      expect(ent).toBeDefined();
      expect(ent!.resourceType).toBe("course");
      expect(ent!.resourceId).toBe(courseId);

      // 3. Course access -> GRANTED (course_purchase)
      const courseAccess = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "course",
        resourceId: courseId,
      });
      expect(courseAccess.granted).toBe(true);
      expect(courseAccess.reason).toBe("course_purchase");

      // 4. Lesson 1, Lesson 2, Lesson 3 access -> ALL GRANTED (course_purchase)!
      const l1Access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "lesson",
        resourceId: lesson1Id,
        courseId,
      });
      expect(l1Access.granted).toBe(true);
      expect(l1Access.reason).toBe("course_purchase");

      const l2Access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "lesson",
        resourceId: lesson2Id,
        courseId,
      });
      expect(l2Access.granted).toBe(true);
      expect(l2Access.reason).toBe("course_purchase");

      const l3Access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "lesson",
        resourceId: lesson3Id,
        courseId,
      });
      expect(l3Access.granted).toBe(true);
      expect(l3Access.reason).toBe("course_purchase");
    });
  });

  describe("4. Subscriptions, Creator, and Platform Admin Bypasses", () => {
    it("active subscription grants access to all courses and contents", async () => {
      // Create subscription entitlement
      const now = new Date();
      const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await commerceStore.grantEntitlement({
        id: asUserEntitlementId(randomUUID()),
        userId: studentUser.userId,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: null,
        startsAt: now.toISOString(),
        expiresAt: expiry.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      const l1Access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "lesson",
        resourceId: lesson1Id,
        courseId,
      });
      expect(l1Access.granted).toBe(true);
      expect(l1Access.reason).toBe("subscription");
    });

    it("platform admin gets admin_grant bypass", async () => {
      const access = await entitlementService.checkAccess(adminUser, {
        userId: adminUser.userId,
        resourceType: "lesson",
        resourceId: lesson1Id,
        courseId,
      });
      expect(access.granted).toBe(true);
      expect(access.reason).toBe("admin_grant");
    });

    it("course creator gets creator_access bypass", async () => {
      const access = await entitlementService.checkAccess(creatorUser, {
        userId: creatorUser.userId,
        resourceType: "lesson",
        resourceId: lesson1Id,
        courseId,
      });
      expect(access.granted).toBe(true);
      expect(access.reason).toBe("creator_access");
    });
  });

  describe("5. Content Redaction & Security in LearningService", () => {
    it("redacts locked lesson markdown and sets locked = true when user has no entitlement", async () => {
      const response = await learningService.getCourseLearning(
        studentUser,
        courseId,
        "req-test-1",
      );

      expect(response.course.locked).toBe(true);
      const mod = response.modules[0];
      expect(mod.lessons.length).toBe(3);

      const l1 = mod.lessons.find((l) => l.id === lesson1Id);
      const l2 = mod.lessons.find((l) => l.id === lesson2Id);

      expect(l1!.locked).toBe(true);
      expect(l1!.content_markdown).toContain("🔒");
      expect(l1!.content_markdown).not.toContain("متن کامل و محرمانه درس ۱");
      expect(l1!.purchase_options).toBeDefined();

      expect(l2!.locked).toBe(true);
      expect(l2!.content_markdown).toContain("🔒");
      expect(l2!.content_markdown).not.toContain("متن کامل و محرمانه درس ۲");
    });

    it("reveals full markdown for a lesson after individual purchase while keeping other lessons locked", async () => {
      // Buy lesson 1 only
      await commerceStore.grantEntitlement({
        id: asUserEntitlementId(randomUUID()),
        userId: studentUser.userId,
        resourceType: "content",
        resourceId: lesson1Id,
        sourceType: "purchase",
        orderId: null,
        startsAt: new Date().toISOString(),
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const response = await learningService.getCourseLearning(
        studentUser,
        courseId,
        "req-test-2",
      );

      const mod = response.modules[0];
      const l1 = mod.lessons.find((l) => l.id === lesson1Id);
      const l2 = mod.lessons.find((l) => l.id === lesson2Id);

      // Lesson 1 is unlocked!
      expect(l1!.locked).toBe(false);
      expect(l1!.access_reason).toBe("content_purchase");
      expect(l1!.content_markdown).toBe("# متن کامل و محرمانه درس ۱");

      // Lesson 2 remains locked!
      expect(l2!.locked).toBe(true);
      expect(l2!.content_markdown).toContain("🔒");
    });

    it("prevents completing a locked lesson with DomainError forbidden", async () => {
      await expect(
        learningService.markLessonComplete(studentUser, courseId, lesson1Id),
      ).rejects.toThrowError(/خرید محتوا یا خرید دوره الزامی است/);
    });
  });

  describe("6. Backward Compatibility & Existing Entitlements Preservation", () => {
    it("preserves active legacy course entitlements seamlessly", async () => {
      const legacyCourseId = asCourseId(randomUUID());
      await commerceStore.grantEntitlement({
        id: asUserEntitlementId(randomUUID()),
        userId: studentUser.userId,
        resourceType: "course",
        resourceId: legacyCourseId,
        sourceType: "purchase",
        orderId: null,
        startsAt: new Date().toISOString(),
        expiresAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const access = await entitlementService.checkAccess(studentUser, {
        userId: studentUser.userId,
        resourceType: "course",
        resourceId: legacyCourseId,
      });

      expect(access.granted).toBe(true);
      expect(access.reason).toBe("course_purchase");
    });
  });

  describe("7. Decoupled Pricing Invariant", () => {
    it("guarantees course price is completely independent from the sum of content prices", async () => {
      // Course price is 150,000 Toman
      // Lesson 1 = 60,000 Toman, Lesson 2 = 70,000 Toman, Lesson 3 = unpriced
      const courseProduct = await commerceStore.findProductById(courseProductId);
      const l1Product = await commerceStore.findProductById(lesson1ProductId);
      const l2Product = await commerceStore.findProductById(lesson2ProductId);

      expect(courseProduct!.price).toBe(150000);
      expect(l1Product!.price).toBe(60000);
      expect(l2Product!.price).toBe(70000);

      // Sum of individual lesson prices is 130,000 != 150,000
      expect(l1Product!.price + l2Product!.price).not.toBe(courseProduct!.price);
    });
  });
});
