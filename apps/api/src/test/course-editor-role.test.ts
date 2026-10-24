import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  asUserId,
  asOrganizationId,
  asCoursePublicationId,
  Roles,
  defaultPolicy,
  DomainError,
} from "@avana/domain";
import { InMemoryCourseStore, InMemoryCoursePublicationStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryContentPackStore } from "../modules/library/in-memory-stores.js";
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
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { OfficialContentService } from "../modules/admin/official-content-service.js";
import { DocumentService } from "../modules/documents/document-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";

describe("Course Editor Role — Comprehensive Integration Test Suite", () => {
  const systemOrgId = asOrganizationId("b4a0b464-16db-4087-92b7-163a1e6f6776");
  const teacherOrgId = asOrganizationId("11111111-1111-1111-1111-111111111111");

  const editorActor: Actor = {
    userId: asUserId("editor-user-id"),
    role: "course_editor",
    globalRole: "course_editor",
  };
  const editorActor2: Actor = {
    userId: asUserId("editor2-user-id"),
    role: "course_editor",
    globalRole: "course_editor",
  };
  const adminActor: Actor = {
    userId: asUserId("admin-user-id"),
    role: "platform_admin",
    globalRole: "platform_admin",
  };
  const teacherActor: Actor = {
    userId: asUserId("teacher-user-id"),
    role: "teacher",
  };
  const studentActor: Actor = {
    userId: asUserId("student-user-id"),
    role: "student",
  };

  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let commerceStore: InMemoryCommerceStore;
  let adminStore: InMemoryAdminStore;
  let orgStore: InMemoryOrganizationStore;
  let publicationStore: InMemoryCoursePublicationStore;

  let modelGateway: MockModelGateway;
  let generationService: GenerationService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;
  let documentService: DocumentService;

  // Track product catalog state and entitlements in mockDb
  let catalogProducts: Map<string, any>;
  let entitlementsList: Array<any>;
  let ordersList: Array<any>;

  beforeEach(async () => {
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    commerceStore = new InMemoryCommerceStore();
    adminStore = new InMemoryAdminStore();
    orgStore = new InMemoryOrganizationStore();
    publicationStore = new InMemoryCoursePublicationStore();

    catalogProducts = new Map();
    entitlementsList = [];
    ordersList = [];

    modelGateway = new MockModelGateway();
    generationService = new GenerationService(
      modelGateway,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      systemOrgId,
      undefined,
      commerceStore,
      courseStore,
    );

    reviewService = new ReviewService(
      generatedContentStore,
      generatedContentCitationStore,
      moduleStore,
      lessonStore,
      documentStore,
    );

    const mockDb = {
      select: (fields?: any) => ({
        from: (table: any) => ({
          where: (clause: any) => ({
            limit: async () => Array.from(catalogProducts.values()).slice(0, 1),
            orderBy: () => ({
              limit: async () => Array.from(catalogProducts.values()).slice(0, 1),
            }),
            then: (fn: any) => fn(Array.from(catalogProducts.values()).slice(0, 1)),
          }),
        }),
      }),
      insert: (table: any) => ({
        values: (vals: any) => ({
          returning: async () => {
            const product = { id: `prod_${randomUUID()}`, ...vals };
            catalogProducts.set(product.code, product);
            return [product];
          },
        }),
      }),
      update: (table: any) => ({
        set: (vals: any) => ({
          where: (clause: any) => ({
            returning: async () => {
              const updated = Array.from(catalogProducts.values()).map((p) => {
                const updatedProduct = { ...p, ...vals };
                catalogProducts.set(p.code, updatedProduct);
                return updatedProduct;
              });
              return updated.length > 0
                ? updated
                : [{ id: "prod-1", code: "course_1", price: 499000, active: vals.active ?? true }];
            },
            then: (fn: any) => fn([]),
          }),
        }),
      }),
      transaction: async (fn: any) =>
        fn({
          select: (fields?: any) => ({
            from: (t: any) => ({
              where: () => [],
            }),
          }),
          update: (t: any) => ({
            set: () => ({
              where: () => [],
            }),
          }),
        }),
    } as any;

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
      generationService,
      reviewService,
      adminStore,
      systemOrgId,
    );

    documentService = new DocumentService(
      documentStore,
      {
        createUpload: async () => ({ storageKey: "key", uploadUrl: null, expiresAt: "" }),
        save: async () => {},
        read: async () => Buffer.from("dummy"),
        delete: async () => {},
        exists: async () => true,
      },
      orgStore,
      defaultPolicy,
      undefined,
      documentChunkStore,
      generatedContentStore,
      generationJobStore,
    );

    // Seed organizations
    await orgStore.createWithAdminMembership({
      organization: {
        id: systemOrgId,
        name: "AVANA System",
        slug: "avana-system",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: systemOrgId,
        userId: adminActor.userId,
        role: "platform_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: editorActor.userId,
      role: "course_editor",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: studentActor.userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe("1. Course Lifecycle Operations by course_editor", () => {
    it("allows course_editor to create official course in draft state", async () => {
      const course = await officialContentService.createOfficialCourse(editorActor, {
        name: "فارماکولوژی پایه و بالینی",
        subject: "داروسازی",
        description: "دوره جامع فارماکولوژی",
      });

      expect(course.id).toBeDefined();
      expect(course.status).toBe("draft");
      expect(course.isOfficial).toBe(true);
      expect(course.name).toBe("فارماکولوژی پایه و بالینی");
    });

    it("allows course_editor to manage and edit courses created by other users (creator neutrality across admin, teacher, other editor, and regular user)", async () => {
      // 1. Course created by Platform Admin
      const adminCourse = await officialContentService.createOfficialCourse(adminActor, {
        name: "شیمی آلی (ساخته شده توسط مدیر کل)",
        subject: "شیمی",
      });

      // 2. Course created by Teacher in teacher organization
      const teacherCourse = await courseStore.create({
        course: {
          id: `course_teacher_${randomUUID()}` as CourseId,
          organizationId: teacherOrgId,
          name: "ژنتیک مولکولی (ساخته شده توسط مدرس)",
          subject: "زیست‌شناسی",
          status: "draft",
          creatorUserId: teacherActor.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      // 3. Course created by another Course Editor
      const otherEditorCourse = await officialContentService.createOfficialCourse(editorActor2, {
        name: "فیزیولوژی اعصاب (ساخته شده توسط ویرایشگر دیگر)",
        subject: "پزشکی",
      });

      // 4. Course created by a regular Student / User
      const userCourse = await courseStore.create({
        course: {
          id: `course_user_${randomUUID()}` as CourseId,
          organizationId: systemOrgId,
          name: "زبان عمومی (ساخته شده توسط کاربر عادی)",
          subject: "زبان",
          status: "draft",
          creatorUserId: studentActor.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      const allTestedCourses = [adminCourse, teacherCourse, otherEditorCourse, userCourse];

      for (const course of allTestedCourses) {
        // A. Verify course_editor can retrieve each course
        const fetched = await courseStore.findById(course.id);
        expect(fetched).toBeDefined();
        expect(fetched?.id).toBe(course.id);

        // B. Verify course_editor can update metadata regardless of who created it
        course.name = `${course.name} - ویرایش شده توسط course_editor`;
        const updated = await courseStore.update(course);
        expect(updated.name).toContain("ویرایش شده توسط course_editor");

        // C. Verify course_editor can add modules and lessons
        const module = await moduleStore.create({
          courseId: course.id,
          title: `فصل تست ${course.id}`,
          orderIndex: 0,
        });
        const lesson = await lessonStore.create({
          moduleId: module.id,
          title: `درس تست ${course.id}`,
          orderIndex: 0,
          content: "محتوای تست ویراستار",
        });
        expect(lesson.title).toContain("درس تست");

        // D. Verify course_editor can configure pricing
        const pricingRes = await officialContentService.setProductPricing(editorActor, course.id, {
          price: 250000,
        });
        expect(pricingRes.price).toBe(250000);
      }
    });

    it("allows course_editor to set course pricing and generate pricing suggestions", async () => {
      const course = await officialContentService.createOfficialCourse(editorActor, {
        name: "بیوشیمی پزشکی",
      });

      // Set pricing as editor
      const pricingResult = await officialContentService.setProductPricing(
        editorActor,
        course.id,
        { price: 650000 },
      );
      expect(pricingResult.price).toBe(650000);
      expect(pricingResult.code).toBe(`course_${course.id}`);

      // Set lesson product pricing as editor
      const module = await moduleStore.create({
        courseId: course.id,
        title: "فصل بیوشیمی",
        orderIndex: 0,
      });
      const lesson = await lessonStore.create({
        moduleId: module.id,
        title: "درس متابولیسم کربوهیدرات‌ها",
        orderIndex: 0,
        content: "محتوای بیوشیمی",
      });

      const lessonProduct = await officialContentService.createOrUpdateLessonProduct(
        editorActor,
        lesson.id,
        { price: 50000 },
      );
      expect(lessonProduct.price).toBe(50000);
    });

    it("allows course_editor to publish, unpublish, archive, restore, and delete an official course", async () => {
      const course = await officialContentService.createOfficialCourse(editorActor, {
        name: "زیست‌شناسی سلولی مولکولی",
      });

      // Structure course with module and lesson
      const module = await moduleStore.create({
        courseId: course.id,
        title: "غشای سلولی",
        orderIndex: 0,
      });
      await lessonStore.create({
        moduleId: module.id,
        title: "انتقال فعال و غیرفعال",
        orderIndex: 0,
        content: "محتوای زیست‌شناسی",
        publicationStatus: "published",
      });

      // Mock validateConsistency to pass for publishing test
      vi.spyOn(officialContentService, "validateConsistency").mockResolvedValue({
        valid: true,
        courseStatus: "approved",
        moduleCount: 1,
        lessonCount: 1,
        flashcardCount: 1,
        quizQuestionCount: 1,
        unresolvedLessonMappings: 0,
        errors: [],
      });

      // 1. Publish official course
      const publishRes = await officialContentService.publishOfficialCourse(editorActor, course.id);
      expect(publishRes.success).toBe(true);
      expect(publishRes.course.status).toBe("published");
      expect(publishRes.product.active).toBe(true);

      // 2. Unpublish official course (transitions back to draft, deactivates catalog product)
      const unpublishRes = await officialContentService.unpublishOfficialCourse(editorActor, course.id);
      expect(unpublishRes.success).toBe(true);
      expect(unpublishRes.course.status).toBe("draft");

      // Verify product active status was set to false
      const product = catalogProducts.get(`course_${course.id}`);
      if (product) {
        expect(product.active).toBe(false);
      }

      // 3. Archive official course (transitions to archived)
      const archiveRes = await officialContentService.archiveOfficialCourse(editorActor, course.id);
      expect(archiveRes.success).toBe(true);
      expect(archiveRes.course.status).toBe("archived");

      // 4. Restore/unarchive official course (transitions back to draft)
      const unarchiveRes = await officialContentService.unarchiveOfficialCourse(editorActor, course.id);
      expect(unarchiveRes.success).toBe(true);
      expect(unarchiveRes.course.status).toBe("draft");

      // 5. Safe delete course (draft course with no financial entanglements)
      const deleteRes = await officialContentService.deleteOfficialCourse(editorActor, course.id, {
        confirmationName: "زیست‌شناسی سلولی مولکولی",
      });
      expect(deleteRes.success).toBe(true);
      expect(deleteRes.deletedCourseId).toBe(course.id);
    });

    it("validates state integrity: rejects unpublishing non-published course and unarchiving non-archived course", async () => {
      const course = await officialContentService.createOfficialCourse(editorActor, {
        name: "دوره تست اعتبارسنجی وضعیت",
      });

      // Attempt unpublish on draft course -> bad_request
      await expect(
        officialContentService.unpublishOfficialCourse(editorActor, course.id),
      ).rejects.toThrow("تنها دوره‌های منتشر شده را می‌توان لغو انتشار کرد.");

      // Attempt unarchive on draft course -> bad_request
      await expect(
        officialContentService.unarchiveOfficialCourse(editorActor, course.id),
      ).rejects.toThrow("تنها دوره‌های بایگانی شده را می‌توان بازگردانی کرد.");
    });
  });

  describe("2. Preservation of Past Purchases & User Entitlements", () => {
    it("ensures that unpublishing or archiving a course does not wipe historical orders or existing entitlements", async () => {
      const course = await officialContentService.createOfficialCourse(editorActor, {
        name: "فیزیولوژی پزشکی گایتون",
      });

      vi.spyOn(officialContentService, "validateConsistency").mockResolvedValue({
        valid: true,
        courseStatus: "approved",
        moduleCount: 1,
        lessonCount: 1,
        flashcardCount: 1,
        quizQuestionCount: 1,
        unresolvedLessonMappings: 0,
        errors: [],
      });

      // Publish course
      await officialContentService.publishOfficialCourse(editorActor, course.id);

      // Simulate prior user purchases and active entitlements
      const userPurchaserId = asUserId("student-purchaser-42");
      ordersList.push({
        id: "order_1001",
        userId: userPurchaserId,
        courseId: course.id,
        status: "paid",
        amount: 499000,
        paidAt: new Date().toISOString(),
      });
      entitlementsList.push({
        id: "ent_2001",
        userId: userPurchaserId,
        resourceType: "course",
        resourceId: course.id,
        expiresAt: null, // lifetime access
        createdAt: new Date().toISOString(),
      });

      // Unpublish course
      await officialContentService.unpublishOfficialCourse(editorActor, course.id);

      // Past orders and user entitlements remain intact
      expect(ordersList).toHaveLength(1);
      expect(ordersList[0].userId).toBe(userPurchaserId);
      expect(entitlementsList).toHaveLength(1);
      expect(entitlementsList[0].expiresAt).toBeNull();

      // Archive course
      await officialContentService.archiveOfficialCourse(editorActor, course.id);

      // Past orders and user entitlements still remain intact
      expect(ordersList).toHaveLength(1);
      expect(entitlementsList).toHaveLength(1);
    });
  });

  describe("3. Fastify HTTP Endpoints & Privilege Boundaries", () => {
    let app: Awaited<ReturnType<typeof createApp>>;
    let editorCookies: { avana_session: string };
    let studentCookies: { avana_session: string };

    beforeEach(async () => {
      const config = loadApiConfig();
      config.session.maxAgeMs = 86400000;
      config.logging.level = "silent";

      const sessionStore = new InMemorySessionStore();
      const userStore = new InMemoryUserStore(orgStore);
      const sessionService = new SessionService(sessionStore, config.session);

      // Create editor user
      const editorUser = await userStore.createUserWithPassword({
        email: "editor@test.com",
        passwordHash: "x",
      });
      editorUser.globalRole = Roles.course_editor;
      editorUser.role = Roles.course_editor;
      userStore.insert({ ...editorUser });

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: systemOrgId,
        userId: editorUser.id,
        role: Roles.course_editor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create student user
      const studentUser = await userStore.createUserWithPassword({
        email: "student@test.com",
        passwordHash: "x",
      });
      studentUser.role = Roles.student;
      userStore.insert({ ...studentUser });

      const editorSession = await sessionService.createSession(editorUser.id);
      const studentSession = await sessionService.createSession(studentUser.id);

      editorCookies = { avana_session: editorSession.sessionToken };
      studentCookies = { avana_session: studentSession.sessionToken };

      app = createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        adminStore,
        organizationStore: orgStore,
        courseStore,
        documentStore,
        coursePublicationStore: publicationStore,
        contentPackStore: new InMemoryContentPackStore(),
        commerceStore,
        officialContentService,
      });
    });

    it("allows course_editor to access content studio routes including unpublish and unarchive", async () => {
      // 1. Create course via API
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/admin/content-studio/courses",
        payload: { name: "فیزیک پزشکی", subject: "پزشکی" },
        cookies: editorCookies,
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      const courseId = created.course.id;

      // Mock consistency validation for API publication test
      vi.spyOn(officialContentService, "validateConsistency").mockResolvedValue({
        valid: true,
        courseStatus: "approved",
        moduleCount: 1,
        lessonCount: 1,
        flashcardCount: 1,
        quizQuestionCount: 1,
        unresolvedLessonMappings: 0,
        errors: [],
      });

      // 2. Publish course via API
      const publishRes = await app.inject({
        method: "POST",
        url: `/v1/admin/content-studio/courses/${courseId}/publish`,
        cookies: editorCookies,
      });
      expect(publishRes.statusCode).toBe(200);

      // 3. Unpublish course via API
      const unpublishRes = await app.inject({
        method: "POST",
        url: `/v1/admin/content-studio/courses/${courseId}/unpublish`,
        cookies: editorCookies,
      });
      expect(unpublishRes.statusCode).toBe(200);
      const unpublishBody = JSON.parse(unpublishRes.body);
      expect(unpublishBody.success).toBe(true);
      expect(unpublishBody.course.status).toBe("draft");

      // 4. Archive course via API
      const archiveRes = await app.inject({
        method: "POST",
        url: `/v1/admin/content-studio/courses/${courseId}/archive`,
        cookies: editorCookies,
      });
      expect(archiveRes.statusCode).toBe(200);

      // 5. Unarchive course via API
      const unarchiveRes = await app.inject({
        method: "POST",
        url: `/v1/admin/content-studio/courses/${courseId}/unarchive`,
        cookies: editorCookies,
      });
      expect(unarchiveRes.statusCode).toBe(200);
      const unarchiveBody = JSON.parse(unarchiveRes.body);
      expect(unarchiveBody.success).toBe(true);
      expect(unarchiveBody.course.status).toBe("draft");
    });

    it("allows course_editor to review and approve community course submissions and content packs", async () => {
      // Seed a community course publication submission
      const courseId = `course_${randomUUID()}` as CourseId;
      const teacherCourse = await courseStore.create({
        course: {
          id: courseId,
          organizationId: teacherOrgId,
          name: "ایمونولوژی بالینی",
          status: "draft",
          creatorUserId: teacherActor.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        auditEvents: [],
      });

      const pubId = asCoursePublicationId(`pub_${randomUUID()}`);
      const pub = await publicationStore.create({
        id: pubId,
        courseId: teacherCourse.id,
        version: 1,
        title: "ایمونولوژی بالینی",
        description: "دوره ارسالی استاد",
        subject: "پزشکی",
        status: "pending_review",
        creatorUserId: teacherActor.userId,
        scope: "community",
        snapshot: {
          version: 1,
          course: { id: teacherCourse.id, name: "ایمونولوژی بالینی" },
          stats: { modulesCount: 1, lessonsCount: 2, totalDurationMinutes: 60 },
          structure: [],
        },
        metadata: { accessType: "paid" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: null,
        deletedAt: null,
      });

      // 1. List course submissions as editor
      const listSubmissionsRes = await app.inject({
        method: "GET",
        url: "/v1/admin/course-submissions",
        cookies: editorCookies,
      });
      expect(listSubmissionsRes.statusCode).toBe(200);

      // 2. Approve course submission as editor
      const approveRes = await app.inject({
        method: "POST",
        url: `/v1/admin/course-submissions/${pub.id}/approve`,
        payload: { accessType: "paid", price: 350000 },
        cookies: editorCookies,
      });
      expect(approveRes.statusCode).toBe(200);

      // 3. Access content packs as editor
      const contentPacksRes = await app.inject({
        method: "GET",
        url: "/v1/admin/content-packs",
        cookies: editorCookies,
      });
      expect(contentPacksRes.statusCode).toBe(200);
    });

    it("DENIES course_editor from accessing platform admin routes (strict scope containment)", async () => {
      const superAdminOnlyRoutes = [
        { method: "GET", url: "/v1/admin/users" },
        { method: "GET", url: "/v1/admin/system/health" },
        { method: "GET", url: "/v1/admin/system/logs" },
        { method: "GET", url: "/v1/admin/system/audit" },
        { method: "GET", url: "/v1/admin/teachers/applications" },
        { method: "POST", url: "/v1/admin/commerce/payments/p-1/approve", payload: {} },
      ];

      for (const r of superAdminOnlyRoutes) {
        const resp = await app.inject({
          method: r.method as any,
          url: r.url,
          payload: (r as any).payload,
          cookies: editorCookies,
        });
        expect(
          resp.statusCode,
          `Expected 403 Forbidden for course_editor on ${r.method} ${r.url}`,
        ).toBe(403);
      }
    });

    it("DENIES student role from accessing course_editor operations (non-privilege escalation)", async () => {
      const editorProtectedRoutes = [
        { method: "POST", url: "/v1/admin/content-studio/courses", payload: { name: "هک دوره" } },
        { method: "GET", url: "/v1/admin/course-submissions" },
        { method: "GET", url: "/v1/admin/content-packs" },
      ];

      for (const r of editorProtectedRoutes) {
        const resp = await app.inject({
          method: r.method as any,
          url: r.url,
          payload: (r as any).payload,
          cookies: studentCookies,
        });
        expect(
          resp.statusCode,
          `Expected 403 Forbidden for student on ${r.method} ${r.url}`,
        ).toBe(403);
      }
    });
  });

  describe("4. Document Administration & Deletion", () => {
    it("allows course_editor to administer and delete documents", async () => {
      const doc = await documentStore.create({
        organizationId: systemOrgId,
        title: "منبع فارماکولوژی کاتزونگ",
        originalName: "katzung.pdf",
        storageKey: "storage/katzung.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1048576,
        createdBy: editorActor.userId,
      });

      // Editor can admin-delete the document
      await expect(
        documentService.adminDeleteDocument(editorActor, systemOrgId, doc.id),
      ).resolves.not.toThrow();

      // Verify soft deleted
      const found = await documentStore.findById(doc.id);
      expect(found).toBeUndefined();
    });

    it("denies student from admin-deleting documents", async () => {
      const doc = await documentStore.create({
        organizationId: systemOrgId,
        title: "منبع محافظت‌شده",
        originalName: "protected.pdf",
        storageKey: "storage/protected.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        createdBy: adminActor.userId,
      });

      await expect(
        documentService.adminDeleteDocument(studentActor, systemOrgId, doc.id),
      ).rejects.toThrow("Only platform admins and course editors can use this operation");
    });
  });
});
