import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type GeneratedContentId,
  asUserId,
  asOrganizationId,
  Roles,
  DomainError,
} from "@avana/domain";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
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
import { ContentService } from "../modules/learning/content-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";

describe("Worker End-to-End Course Preparation & Authorization Isolation", () => {
  const systemOrgId = asOrganizationId("b4a0b464-16db-4087-92b7-163a1e6f6776");

  const workerActor: Actor = {
    userId: asUserId("worker-user-1"),
    role: "content_worker",
  };
  const adminActor: Actor = {
    userId: asUserId("admin-ops-user"),
    role: "platform_admin",
  };
  const studentActor: Actor = {
    userId: asUserId("student-user-1"),
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

  let modelGateway: MockModelGateway;
  let generationService: GenerationService;
  let reviewService: ReviewService;
  let officialContentService: OfficialContentService;
  let contentService: ContentService;

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

    modelGateway = new MockModelGateway();

    generationService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      modelGateway,
      documentStore,
      documentChunkStore,
      undefined,
      undefined,
      orgStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      systemOrgId,
    );

    const mockQueue = {
      enqueueGenerationJob: async () => ({
        generationJobId: "job-123" as any,
        status: "queued" as const,
      }),
      enqueueRegenerationJob: async () => ({
        generationJobId: "job-regen-123" as any,
        status: "queued" as const,
      }),
    } as any;

    reviewService = new ReviewService(
      generatedContentStore,
      generatedContentCitationStore,
      documentStore,
      documentChunkStore,
      moduleStore,
      lessonStore,
      undefined,
      mockQueue,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      orgStore,
      commerceStore,
      undefined,
    );

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [
            { id: "prod-1", code: "course_1", price: 0, active: false },
          ],
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [
              { id: "prod-1", code: "course_1", price: 499000, active: true },
            ],
          }),
        }),
      }),
      transaction: async (fn: any) => fn(mockDb),
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

    contentService = new ContentService(
      courseStore,
      orgStore,
      moduleStore,
      lessonStore,
    );

    // Seed system organization and memberships
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: workerActor.userId,
      role: "content_worker",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: systemOrgId,
      userId: adminActor.userId,
      role: "platform_admin",
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

  describe("End-to-End Worker Content Preparation Lifecycle", () => {
    it("allows content_worker to create, structure, generate, review, edit, approve, and export a course", async () => {
      // 1. Create Official Course
      const course = await officialContentService.createOfficialCourse(workerActor, {
        name: "شیمی دارویی پیشرفته",
        subject: "داروسازی",
        description: "دوره جامع شیمی دارویی",
      });
      expect(course.id).toBeDefined();
      expect(course.name).toBe("شیمی دارویی پیشرفته");
      expect(course.status).toBe("draft");

      // 2. List Official Courses
      const list = await officialContentService.listOfficialCourses(workerActor);
      expect(list.some((c) => c.id === course.id)).toBe(true);

      // 3. Upload & seed source document with chunks
      const docId = "doc-pharma-01" as DocumentId;
      await documentStore.create({
        id: docId,
        organizationId: systemOrgId,
        ownerUserId: workerActor.userId,
        courseId: course.id,
        originalName: "pharma-chapter-1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024 * 50,
        storageKey: "docs/pharma-01.pdf",
        sha256Hash: "hash123",
        status: "ready",
        pageCount: 10,
        chunkCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await documentChunkStore.createMany([
        {
          id: "chunk-1" as any,
          documentId: docId,
          organizationId: systemOrgId,
          sequence: 1,
          heading: "مقدمه و فارماکوکینتیک",
          content: "فارماکوکینتیک بررسی مسیر ورود، توزیع و متابولیسم دارو در بدن است.",
          tokenCount: 50,
          startPage: 1,
          endPage: 2,
          createdAt: new Date().toISOString(),
        },
      ]);

      // 4. Trigger AI Generation as Worker
      const genResult = await officialContentService.triggerOfficialGeneration(
        workerActor,
        course.id,
        docId,
        { lesson: true, flashcards: true, exam: true, review_summary: true },
      );
      expect(genResult.status).toBe("review");

      // 5. Inspect Review Workspace as Worker
      const workspace = await officialContentService.getReviewWorkspace(workerActor, course.id);
      expect(workspace.course.id).toBe(course.id);
      expect(workspace.draftContents.length).toBeGreaterThan(0);
      expect(workspace.unresolvedLessonMappings).toBe(0);
      expect(workspace.readyForApproval).toBe(true);

      // 6. Edit Draft Content as Worker
      const lessonDraft = workspace.draftContents.find((d) => d.contentType === "lesson");
      expect(lessonDraft).toBeDefined();

      const editedPayload = {
        title: "فصل اول: اصول فارماکوکینتیک بالینی",
        sessions: [
          {
            title: "جلسه اول: جذب و توزیع",
            content: "مباحث تکمیلی در رابطه با زیست‌دست‌یابی دارو...",
            keyTakeaways: ["جذب سریع", "توزیع بافتی"],
            selfCheckQuestions: ["زیست‌دست‌یابی چیست؟"],
          },
        ],
      };

      const editResult = await reviewService.editContent(
        workerActor,
        systemOrgId,
        lessonDraft!.id as GeneratedContentId,
        { payload: editedPayload as any },
      );
      expect(editResult.content.status).toBe("edited");

      // 7. Approve Official Course (Materializes Modules, Lessons, Flashcards, Quizzes, Questions)
      const approvalResult = await officialContentService.approveOfficialCourse(
        workerActor,
        course.id,
      );
      expect(approvalResult.approved).toBe(true);
      expect(approvalResult.materialized.modules).toBeGreaterThan(0);
      expect(approvalResult.materialized.lessons).toBeGreaterThan(0);
      expect(approvalResult.materialized.flashcards).toBeGreaterThan(0);
      expect(approvalResult.materialized.quizzes).toBeGreaterThan(0);

      // 8. Validate Consistency
      const validationReport = await officialContentService.validateConsistency(course.id);
      expect(validationReport.moduleCount).toBeGreaterThan(0);
      expect(validationReport.lessonCount).toBeGreaterThan(0);
      expect(validationReport.unresolvedLessonMappings).toBe(0);

      // 9. Verify materialized course status is 'approved'
      const updatedCourse = await courseStore.findById(course.id);
      expect(updatedCourse?.status).toBe("approved");

      // 10. Archive course as Worker
      const archiveRes = await officialContentService.archiveOfficialCourse(workerActor, course.id);
      expect(archiveRes.success).toBe(true);
      expect(archiveRes.course.status).toBe("archived");
    });
  });

  describe("Strict Security & Boundary Enforcement for Worker", () => {
    it("DENIES product pricing and commerce operations to content_worker", async () => {
      const course = await officialContentService.createOfficialCourse(workerActor, {
        name: "دوره تست امنیتی",
      });

      // 1. Worker cannot set product pricing
      await expect(
        officialContentService.setProductPricing(workerActor, course.id, { price: 500000 }),
      ).rejects.toThrow(DomainError);

      // 2. Worker cannot set lesson product pricing
      await expect(
        officialContentService.createOrUpdateLessonProduct(workerActor, "lesson-1" as any, {
          price: 50000,
        }),
      ).rejects.toThrow(DomainError);

      // 3. Worker cannot publish course commercially
      await expect(
        officialContentService.publishOfficialCourse(workerActor, course.id),
      ).rejects.toThrow(DomainError);
    });

    it("DENIES non-content admin operations across Fastify routes for content_worker", async () => {
      const config = loadApiConfig();
      config.session.maxAgeMs = 86400000;
      config.logging.level = "silent";

      const sessionStore = new InMemorySessionStore();
      const userStore = new InMemoryUserStore(orgStore);
      const sessionService = new SessionService(sessionStore, config.session);

      const workerUser = await userStore.createUserWithPassword({
        email: "worker@test.com",
        passwordHash: "x",
      });
      workerUser.globalRole = "content_worker";
      workerUser.role = "content_worker";
      userStore.insert({ ...workerUser });

      orgStore.addMembership({
        id: randomUUID(),
        organizationId: systemOrgId,
        userId: workerUser.id,
        role: Roles.content_worker,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const workerSession = await sessionService.createSession(workerUser.id);

      const app = createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        adminStore,
        organizationStore: orgStore,
        courseStore,
        documentStore,
      });

      const workerCookies = { avana_session: workerSession.sessionToken };

      // 1. Forbidden routes for Worker
      const forbiddenRoutes = [
        { method: "GET", url: "/v1/admin/dashboard" },
        { method: "GET", url: "/v1/admin/users" },
        { method: "PATCH", url: "/v1/admin/users/user-123/role", payload: { role: "teacher" } },
        { method: "POST", url: "/v1/admin/commerce/payments/p-123/approve", payload: {} },
        { method: "GET", url: "/v1/admin/system/health" },
        { method: "GET", url: "/v1/admin/system/integrity" },
        { method: "GET", url: "/v1/admin/system/logs" },
        { method: "GET", url: "/v1/admin/system/audit" },
        { method: "GET", url: "/v1/admin/settings" },
        { method: "GET", url: "/v1/admin/analytics" },
        { method: "GET", url: "/v1/admin/analytics/ai" },
      ];

      for (const r of forbiddenRoutes) {
        const resp = await app.inject({
          method: r.method as any,
          url: r.url,
          payload: (r as any).payload,
          cookies: workerCookies,
        });
        expect(resp.statusCode, `Expected 403 Forbidden for Worker on ${r.method} ${r.url}`).toBe(
          403,
        );
      }

      // 2. Allowed routes for Worker
      const allowedRoutes = [
        { method: "GET", url: "/v1/admin/courses" },
        { method: "GET", url: "/v1/admin/documents" },
        { method: "GET", url: "/v1/admin/generation" },
        { method: "GET", url: "/v1/admin/generation/providers" },
        { method: "GET", url: "/v1/admin/generation/prompts" },
        { method: "GET", url: "/v1/admin/content/lessons" },
        { method: "GET", url: "/v1/admin/content/flashcards" },
        { method: "GET", url: "/v1/admin/content/exams" },
      ];

      for (const r of allowedRoutes) {
        const resp = await app.inject({
          method: r.method as any,
          url: r.url,
          cookies: workerCookies,
        });
        expect(
          [200, 404].includes(resp.statusCode),
          `Expected 200/404 for Worker on ${r.method} ${r.url}, got ${resp.statusCode}`,
        ).toBe(true);
      }

      await app.close();
    });
  });
});
