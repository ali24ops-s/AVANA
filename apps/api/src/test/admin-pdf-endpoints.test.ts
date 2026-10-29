import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryCoursePublicationStore,
  InMemoryCourseStore,
} from "../modules/courses/test/in-memory-stores.js";
import { InMemoryModuleStore } from "../modules/learning/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";
import { adminRoutes } from "../modules/admin/admin-routes.js";
import {
  Roles,
  asCoursePublicationId,
  asGeneratedContentId,
  asOrganizationId,
  asCourseId,
  type OrganizationId,
  type ReviewSummaryPayload,
} from "@avana/domain";
import type { PdfGenerationService } from "../modules/admin/pdf-generation-service.js";

describe("Admin PDF Generation Endpoints", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const coursePublicationStore = new InMemoryCoursePublicationStore();
    const courseStore = new InMemoryCourseStore(orgStore);
    const moduleStore = new InMemoryModuleStore();
    const generatedContentStore = new InMemoryGeneratedContentStore();

    const sessionService = new SessionService(sessionStore, config.session);

    // 1. Platform Admin user
    const adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.test",
      passwordHash: "x",
    });
    adminUser.globalRole = "platform_admin";
    adminUser.role = "platform_admin";
    userStore.insert({ ...adminUser });

    const adminOrgId = randomUUID() as OrganizationId;
    const foreignOrgId = randomUUID() as OrganizationId;

    await orgStore.createWithAdminMembership({
      organization: {
        id: adminOrgId,
        name: "سازمان اصلی",
        slug: "admin-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: adminOrgId,
        userId: adminUser.id as any,
        role: Roles.platform_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    await orgStore.createWithAdminMembership({
      organization: {
        id: foreignOrgId,
        name: "سازمان خارجی",
        slug: "foreign-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: foreignOrgId,
        userId: randomUUID() as any,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const adminSession = await sessionService.createSession(adminUser.id);

    // 2. Organization Admin user (only member of adminOrgId)
    const orgAdminUser = await userStore.createUserWithPassword({
      email: "orgadmin@avana.test",
      passwordHash: "x",
    });
    orgAdminUser.role = "organization_admin";
    userStore.insert({ ...orgAdminUser });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: adminOrgId,
      userId: orgAdminUser.id as any,
      role: Roles.organization_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const orgAdminSession = await sessionService.createSession(orgAdminUser.id);

    // 3. Student user (unauthorized for admin endpoints)
    const studentUser = await userStore.createUserWithPassword({
      email: "student@avana.test",
      passwordHash: "x",
    });
    studentUser.role = "student";
    userStore.insert({ ...studentUser });
    const studentSession = await sessionService.createSession(studentUser.id);

    // Mock PDF Service
    const mockPdfService: PdfGenerationService = {
      generatePdfFromHtml: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4 mock html pdf")),
      generateLessonPdf: vi.fn().mockImplementation(async (data) => {
        if (!data.contentMarkdown || !data.contentMarkdown.trim()) {
          throw new Error("Lesson content is empty or incomplete.");
        }
        return Buffer.from("%PDF-1.4 mock lesson pdf buffer");
      }),
      generateReviewSummaryPdf: vi.fn().mockImplementation(async (data) => {
        const hasOverview = Boolean(data.overview && data.overview.trim());
        const hasSections = Array.isArray(data.sections) && data.sections.length > 0;
        const hasTakeaways = Array.isArray(data.finalTakeaways) && data.finalTakeaways.length > 0;
        if (!hasOverview && !hasSections && !hasTakeaways) {
          throw new Error("Review summary content is empty or incomplete.");
        }
        return Buffer.from("%PDF-1.4 mock review summary pdf buffer");
      }),
    } as any;

    const app = createApp({ config });
    await app.register(fastifyCookie);
    await app.register(adminRoutes, {
      prefix: "/v1/admin",
      sessionService,
      userStore,
      adminStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      coursePublicationStore,
      generatedContentStore,
      pdfGenerationService: mockPdfService,
      systemOrganizationId: adminOrgId,
    });

    await app.ready();

    return {
      app,
      adminStore,
      courseStore,
      moduleStore,
      coursePublicationStore,
      generatedContentStore,
      mockPdfService,
      adminOrgId,
      foreignOrgId,
      adminHeaders: {
        authorization: `Bearer ${adminSession.sessionToken}`,
        cookie: `avana_session=${adminSession.sessionToken}`,
      },
      orgAdminHeaders: {
        authorization: `Bearer ${orgAdminSession.sessionToken}`,
        cookie: `avana_session=${orgAdminSession.sessionToken}`,
      },
      studentHeaders: {
        authorization: `Bearer ${studentSession.sessionToken}`,
        cookie: `avana_session=${studentSession.sessionToken}`,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Lesson PDF Tests
  // -------------------------------------------------------------------------
  describe("GET /v1/admin/content/lessons/:id/pdf", () => {
    it("rejects unauthorized access when not signed in with 401", async () => {
      const { app } = await setupTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content/lessons/lesson-1/pdf",
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects student access with 403 forbidden", async () => {
      const { app, studentHeaders } = await setupTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content/lessons/lesson-1/pdf",
        headers: studentHeaders,
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 if lesson is not found in store or snapshots", async () => {
      const { app, adminHeaders } = await setupTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content/lessons/nonexistent/pdf",
        headers: adminHeaders,
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("not_found");
    });

    it("returns 400 if lesson contentMarkdown is empty", async () => {
      const { app, adminStore, adminHeaders } = await setupTestApp();
      const lessonId = randomUUID();
      adminStore.getLesson = async (id: string) => {
        if (id === lessonId) {
          return {
            id: lessonId,
            title: "درس بدون متن",
            courseName: "دوره فیزیک",
            moduleTitle: "بخش ۱",
            publicationStatus: "draft",
            createdAt: new Date().toISOString(),
            contentMarkdown: "   ",
          };
        }
        return null;
      };

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/lessons/${lessonId}/pdf`,
        headers: adminHeaders,
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("empty_content");
    });

    it("generates and downloads valid PDF for live lesson with RFC 6266 headers", async () => {
      const { app, adminStore, adminHeaders, mockPdfService } = await setupTestApp();
      const lessonId = randomUUID();
      adminStore.getLesson = async (id: string) => {
        if (id === lessonId) {
          return {
            id: lessonId,
            title: "فارماکولوژی قلب",
            courseName: "فارماکولوژی جامع",
            moduleTitle: "فصل ۲",
            publicationStatus: "published",
            createdAt: new Date().toISOString(),
            contentMarkdown: "# عنوان درس\n\nمتن آموزشی تخصصی پزشکی",
          };
        }
        return null;
      };

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/lessons/${lessonId}/pdf`,
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment;");
      expect(res.headers["content-disposition"]).toContain("filename*=");
      expect(res.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(res.rawPayload.slice(0, 5).toString("utf-8")).toBe("%PDF-");
      expect(mockPdfService.generateLessonPdf).toHaveBeenCalledTimes(1);
    });

    it("resolves lesson from publication snapshot when not in live db", async () => {
      const { app, coursePublicationStore, adminHeaders, mockPdfService } = await setupTestApp();
      const lessonId = "snap-lesson-1";
      const pubId = asCoursePublicationId(randomUUID() as any);

      await coursePublicationStore.create({
        id: pubId,
        courseId: randomUUID() as any,
        organizationId: randomUUID() as any,
        version: 1,
        status: "published",
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        deletedAt: null,
        snapshot: {
          title: "دوره بیوشیمی منتشر شده",
          chapters: [
            {
              id: "ch-1",
              title: "فصل آنزیم‌ها",
              lessons: [
                {
                  id: lessonId,
                  title: "آنزیم‌های آلوستریک",
                  contentMarkdown: "محتوای تست آنزیم‌ها",
                },
              ],
            },
          ],
        } as any,
      } as any);

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/lessons/${lessonId}/pdf?submissionId=${pubId}`,
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(mockPdfService.generateLessonPdf).toHaveBeenCalledTimes(1);
    });

    it("rejects organization_admin from accessing snapshot lesson belonging to foreign organization (403)", async () => {
      const { app, coursePublicationStore, orgAdminHeaders, foreignOrgId } = await setupTestApp();
      const lessonId = "foreign-snap-lesson";
      const pubId = asCoursePublicationId(randomUUID() as any);

      await coursePublicationStore.create({
        id: pubId,
        courseId: randomUUID() as any,
        organizationId: foreignOrgId,
        version: 1,
        status: "published",
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        deletedAt: null,
        snapshot: {
          title: "دوره سازمان دیگر",
          chapters: [
            {
              id: "ch-foreign",
              title: "فصل خارجی",
              lessons: [
                {
                  id: lessonId,
                  title: "درس سازمان دیگر",
                  contentMarkdown: "متن محرمانه سازمان دیگر",
                },
              ],
            },
          ],
        } as any,
      } as any);

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/lessons/${lessonId}/pdf?submissionId=${pubId}`,
        headers: orgAdminHeaders,
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("forbidden");
    });

    it("allows organization_admin to access snapshot lesson belonging to their own organization (200)", async () => {
      const { app, coursePublicationStore, orgAdminHeaders, adminOrgId, mockPdfService } = await setupTestApp();
      const lessonId = "own-snap-lesson";
      const pubId = asCoursePublicationId(randomUUID() as any);

      await coursePublicationStore.create({
        id: pubId,
        courseId: randomUUID() as any,
        organizationId: adminOrgId,
        version: 1,
        status: "published",
        createdAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        deletedAt: null,
        snapshot: {
          title: "دوره سازمان خود کاربر",
          chapters: [
            {
              id: "ch-own",
              title: "فصل خودی",
              lessons: [
                {
                  id: lessonId,
                  title: "درس مجاز",
                  contentMarkdown: "متن مجاز سازمان خود کاربر",
                },
              ],
            },
          ],
        } as any,
      } as any);

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/lessons/${lessonId}/pdf?submissionId=${pubId}`,
        headers: orgAdminHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(mockPdfService.generateLessonPdf).toHaveBeenCalledTimes(1);
    });

    it("rejects organization_admin from accessing live lesson in a foreign organization course (403)", async () => {
      const { app, adminStore, courseStore, moduleStore, orgAdminHeaders, foreignOrgId } = await setupTestApp();
      const lessonId = randomUUID();
      const courseId = asCourseId(randomUUID() as any);
      const moduleId = randomUUID();

      await courseStore.create({
        course: {
          id: courseId,
          organizationId: foreignOrgId,
          name: "دوره خارجی",
          status: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        } as any,
        auditEvents: [],
      });

      await moduleStore.create({
        id: moduleId as any,
        courseId,
        title: "فصل خارجی",
        orderIndex: 1,
        deletedAt: null,
      } as any);

      adminStore.getLesson = async (id: string) => {
        if (id === lessonId) {
          return {
            id: lessonId,
            title: "درس خارجی",
            courseName: "دوره خارجی",
            moduleTitle: "فصل خارجی",
            moduleId,
            publicationStatus: "published",
            createdAt: new Date().toISOString(),
            contentMarkdown: "# درس در سازمان خارجی",
          };
        }
        return null;
      };

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/lessons/${lessonId}/pdf`,
        headers: orgAdminHeaders,
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("forbidden");
    });
  });

  // -------------------------------------------------------------------------
  // Review Summary PDF Tests
  // -------------------------------------------------------------------------
  describe("GET /v1/admin/content/review-summaries/:id/pdf", () => {
    it("rejects unauthorized access when not signed in with 401", async () => {
      const { app } = await setupTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content/review-summaries/summary-1/pdf",
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects student access with 403 forbidden", async () => {
      const { app, studentHeaders } = await setupTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content/review-summaries/summary-1/pdf",
        headers: studentHeaders,
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when review summary is not found", async () => {
      const { app, adminHeaders } = await setupTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content/review-summaries/nonexistent/pdf",
        headers: adminHeaders,
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("not_found");
    });

    it("returns 400 when review summary payload is empty or invalid", async () => {
      const { app, generatedContentStore, adminOrgId, adminHeaders } = await setupTestApp();
      const summaryId = asGeneratedContentId(randomUUID() as any);

      await generatedContentStore.insert({
        id: summaryId,
        organizationId: adminOrgId,
        documentId: null,
        courseId: randomUUID() as any,
        type: "review_summary",
        status: "draft",
        payload: {
          kind: "review_summary",
          title: "خلاصه خالی",
          overview: "",
          sections: [],
          finalTakeaways: [],
          citationChunkIds: [],
          estimatedReadingMinutes: 5,
        } as ReviewSummaryPayload,
        promptVersion: "1.0",
        model: "gemini",
        tokenUsage: null,
        generationKey: null,
        acceptedAt: null,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/review-summaries/${summaryId}/pdf`,
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("empty_content");
    });

    it("generates and downloads valid PDF for complete review summary with RFC 6266 headers", async () => {
      const { app, generatedContentStore, adminOrgId, adminHeaders, mockPdfService } = await setupTestApp();
      const summaryId = asGeneratedContentId(randomUUID() as any);

      await generatedContentStore.insert({
        id: summaryId,
        organizationId: adminOrgId,
        documentId: null,
        courseId: randomUUID() as any,
        type: "review_summary",
        status: "accepted",
        payload: {
          kind: "review_summary",
          title: "خلاصه مرور مبحث گیرنده‌ها",
          estimatedReadingMinutes: 10,
          overview: "بررسی فشرده نکات کلیدی گیرنده‌های فارماکولوژیک",
          sections: [
            {
              title: "گیرنده‌های جفت‌شونده با G-protein",
              keyPoints: ["نکته ۱", "نکته ۲"],
              examPoints: ["نکته کنکوری"],
            },
          ],
          finalTakeaways: ["جمع‌بندی نهایی"],
          citationChunkIds: [],
        } as ReviewSummaryPayload,
        promptVersion: "1.0",
        model: "gemini",
        tokenUsage: null,
        generationKey: null,
        acceptedAt: null,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/review-summaries/${summaryId}/pdf`,
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["content-disposition"]).toContain("attachment;");
      expect(res.headers["content-disposition"]).toContain("filename*=");
      expect(res.headers["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(res.rawPayload.slice(0, 5).toString("utf-8")).toBe("%PDF-");
      expect(mockPdfService.generateReviewSummaryPdf).toHaveBeenCalledTimes(1);
    });

    it("rejects organization_admin from accessing review summary belonging to foreign organization (403)", async () => {
      const { app, generatedContentStore, foreignOrgId, orgAdminHeaders } = await setupTestApp();
      const summaryId = asGeneratedContentId(randomUUID() as any);

      await generatedContentStore.insert({
        id: summaryId,
        organizationId: foreignOrgId,
        documentId: null,
        courseId: randomUUID() as any,
        type: "review_summary",
        status: "accepted",
        payload: {
          kind: "review_summary",
          title: "خلاصه سازمان دیگر",
          estimatedReadingMinutes: 5,
          overview: "خلاصه محرمانه",
          sections: [{ title: "بخش ۱", keyPoints: ["نکته"] }],
          finalTakeaways: ["پایان"],
          citationChunkIds: [],
        } as ReviewSummaryPayload,
        promptVersion: "1.0",
        model: "gemini",
        tokenUsage: null,
        generationKey: null,
        acceptedAt: null,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/review-summaries/${summaryId}/pdf`,
        headers: orgAdminHeaders,
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("forbidden");
    });

    it("returns 404 if review summary is marked as deleted", async () => {
      const { app, generatedContentStore, adminOrgId, adminHeaders } = await setupTestApp();
      const summaryId = asGeneratedContentId(randomUUID() as any);

      await generatedContentStore.insert({
        id: summaryId,
        organizationId: adminOrgId,
        documentId: null,
        courseId: randomUUID() as any,
        type: "review_summary",
        status: "accepted",
        payload: {
          kind: "review_summary",
          title: "خلاصه حذف شده",
          overview: "محتوا",
          sections: [],
          finalTakeaways: [],
          citationChunkIds: [],
        } as ReviewSummaryPayload,
        promptVersion: "1.0",
        model: "gemini",
        tokenUsage: null,
        generationKey: null,
        acceptedAt: null,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/review-summaries/${summaryId}/pdf`,
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("not_found");
    });

    it("returns 404 if generated content is not of type review_summary", async () => {
      const { app, generatedContentStore, adminOrgId, adminHeaders } = await setupTestApp();
      const quizId = asGeneratedContentId(randomUUID() as any);

      await generatedContentStore.insert({
        id: quizId,
        organizationId: adminOrgId,
        documentId: null,
        courseId: randomUUID() as any,
        type: "quiz" as any,
        status: "accepted",
        payload: {
          title: "آزمون چهارگزینه‌ای",
        } as any,
        promptVersion: "1.0",
        model: "gemini",
        tokenUsage: null,
        generationKey: null,
        acceptedAt: null,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/review-summaries/${quizId}/pdf`,
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("not_found");
    });

    it("returns 404 if review summary status is rejected", async () => {
      const { app, generatedContentStore, adminOrgId, adminHeaders } = await setupTestApp();
      const rejectedId = asGeneratedContentId(randomUUID() as any);

      await generatedContentStore.insert({
        id: rejectedId,
        organizationId: adminOrgId,
        documentId: null,
        courseId: randomUUID() as any,
        type: "review_summary",
        status: "rejected",
        payload: {
          kind: "review_summary",
          title: "خلاصه رد شده",
          overview: "محتوا",
          sections: [],
          finalTakeaways: [],
          citationChunkIds: [],
        } as ReviewSummaryPayload,
        promptVersion: "1.0",
        model: "gemini",
        tokenUsage: null,
        generationKey: null,
        acceptedAt: null,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/review-summaries/${rejectedId}/pdf`,
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(404);
    });

    it("enforces fail-closed 403 when organization_admin requests lesson whose organization cannot be resolved", async () => {
      const { app, adminStore, orgAdminHeaders } = await setupTestApp();
      const orphanLessonId = randomUUID();

      adminStore.getLesson = async (id: string) => {
        if (id === orphanLessonId) {
          return {
            id: orphanLessonId,
            title: "درس بدون سازمان مشخص",
            courseName: "دوره نامشخص",
            publicationStatus: "draft",
            createdAt: new Date().toISOString(),
            contentMarkdown: "# محتوای معتبر اما بدون سازمان مشخص",
            moduleId: undefined, // no module
          };
        }
        return null;
      };

      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content/lessons/${orphanLessonId}/pdf`,
        headers: orgAdminHeaders,
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.code).toBe("forbidden");
    });
  });
});
