import { describe, expect, it, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryLessonAnnotationStore,
  InMemoryContentReportStore,
} from "../modules/study/index.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import {
  asCourseId,
  asLessonId,
  asModuleId,
  asUserId,
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  type LessonId,
  type CourseId,
} from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Support Agent Content Repair Workflow & Security Audit (10-Step E2E)", () => {
  let config: ReturnType<typeof makeTestConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let annotationStore: InMemoryLessonAnnotationStore;
  let reportStore: InMemoryContentReportStore;
  let adminStore: InMemoryAdminStore;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;
  let recordedAuditEvents: any[];

  let studentCookie: string;
  let studentUserId: UserId;
  let supportCookie: string;
  let supportUserId: UserId;
  let platformAdminCookie: string;

  let testCourseId: CourseId;
  let testLessonId: LessonId;
  let unassociatedLessonId: LessonId;

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      annotationStore,
      reportStore,
      adminStore,
      notificationStore,
      notificationService,
      auditService: {
        emit: vi.fn(async (events) => {
          recordedAuditEvents.push(...events);
        }),
      } as any,
    });
    return app;
  }

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    annotationStore = new InMemoryLessonAnnotationStore();
    reportStore = new InMemoryContentReportStore();
    adminStore = new InMemoryAdminStore(userStore, organizationStore);
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);
    recordedAuditEvents = [];

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "x",
        name: email.split("@")[0],
      });
      if (
        role === Roles.platform_admin ||
        role === Roles.content_worker ||
        role === Roles.support_agent
      ) {
        user.globalRole = role;
        user.role = role;
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      organizationStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    const student = await createUserWithRole("student@avana.ai", Roles.student);
    studentCookie = `avana_session=${student.sessionToken}`;
    studentUserId = student.user.id as UserId;

    const support = await createUserWithRole("support@avana.ai", Roles.support_agent);
    supportCookie = `avana_session=${support.sessionToken}`;
    supportUserId = support.user.id as UserId;

    const admin = await createUserWithRole("admin@avana.ai", Roles.platform_admin);
    platformAdminCookie = `avana_session=${admin.sessionToken}`;

    // Seed test lesson with broken formula LaTeX
    testCourseId = asCourseId(randomUUID());
    const moduleId = asModuleId(randomUUID());
    testLessonId = asLessonId(randomUUID());
    unassociatedLessonId = asLessonId(randomUUID());

    await lessonStore.create({
      id: testLessonId,
      moduleId,
      title: "درسنامه فارماکولوژی بالینی",
      orderIndex: 0,
      contentMarkdown: "# واکنش هیدرولیز\n\nفرمول واکنش: textCaC_2 + 2textH 2O",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await lessonStore.create({
      id: unassociatedLessonId,
      moduleId,
      title: "درسنامه متفرقه و نامرتبط",
      orderIndex: 1,
      contentMarkdown: "این درسنامه نباید توسط پشتیبان تغییر کند.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("Executes the complete 10-step content repair workflow with strict security boundaries", async () => {
    const app = await buildTestApp();

    // -------------------------------------------------------------------------
    // Step 1: Student files a content problem report
    // -------------------------------------------------------------------------
    const report = await reportStore.create({
      userId: studentUserId,
      courseId: testCourseId,
      lessonId: testLessonId,
      selectedText: "textCaC_2",
      category: "rendering_issue",
      comment: "فرمول به جای فرمت ریاضی به صورت متن خام نمایش داده می‌شود.",
    });
    expect(report.id).toBeDefined();
    expect(report.status).toBe("pending");

    // -------------------------------------------------------------------------
    // Step 2: Support views the report in /admin/content-reports
    // -------------------------------------------------------------------------
    const listReportsRes = await app.inject({
      method: "GET",
      url: `/v1/admin/content-reports/${report.id}`,
      headers: { cookie: supportCookie },
    });
    expect(listReportsRes.statusCode).toBe(200);
    const reportData = JSON.parse(listReportsRes.payload);
    expect(reportData.id).toBe(report.id);
    expect(reportData.lessonId).toBe(testLessonId);
    expect(reportData.selectedText).toBe("textCaC_2");
    expect(reportData.status).toBe("pending");

    // -------------------------------------------------------------------------
    // Step 3: Support previews the repair bound to the report
    // -------------------------------------------------------------------------
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId: testLessonId,
      }),
    });
    expect(previewRes.statusCode).toBe(200);
    const previewData = JSON.parse(previewRes.payload);
    expect(previewData.hasRepairs).toBe(true);
    expect(previewData.candidates.length).toBeGreaterThan(0);
    expect(previewData.candidates[0].ruleId).toBe("latex-command-corruption");
    expect(previewData.repairedContent).toContain("\\text{CaC}_2");
    expect(previewData.originalHash).toBeDefined();

    // -------------------------------------------------------------------------
    // Step 4: Stale originalHash rejected with 409 Conflict (concurrency check)
    // -------------------------------------------------------------------------
    const staleApplyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId: testLessonId,
        originalHash: "stale_hash_from_an_earlier_version",
      }),
    });
    expect(staleApplyRes.statusCode).toBe(409);
    // Verify lesson content is NOT modified and report is NOT resolved
    const lessonAfterStale = await lessonStore.findById(testLessonId);
    expect(lessonAfterStale?.contentMarkdown).toContain("textCaC_2");
    const reportAfterStale = await reportStore.findById(report.id);
    expect(reportAfterStale?.status).toBe("pending");

    // -------------------------------------------------------------------------
    // Step 5: Support applies the permitted repair
    // -------------------------------------------------------------------------
    const validApplyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId: testLessonId,
        originalHash: previewData.originalHash,
      }),
    });
    expect(validApplyRes.statusCode).toBe(200);
    const applyData = JSON.parse(validApplyRes.payload);
    expect(applyData.success).toBe(true);
    expect(applyData.reportStatus).toBe("resolved");

    // -------------------------------------------------------------------------
    // Step 6: Verify correct repaired content is stored in the database lesson
    // -------------------------------------------------------------------------
    const savedLesson = await lessonStore.findById(testLessonId);
    expect(savedLesson?.contentMarkdown).toContain("\\text{CaC}_2");
    expect(savedLesson?.contentMarkdown).not.toContain("textCaC_2");

    // -------------------------------------------------------------------------
    // Step 7: Verify correct report status transition to "resolved"
    // -------------------------------------------------------------------------
    const resolvedReport = await reportStore.findById(report.id);
    expect(resolvedReport?.status).toBe("resolved");

    // -------------------------------------------------------------------------
    // Step 8: Verify audit events recorded (content.edited & content_report.status_changed)
    // -------------------------------------------------------------------------
    const contentEditAudit = recordedAuditEvents.find((e) => e.action === "content.edited");
    expect(contentEditAudit).toBeDefined();
    expect(contentEditAudit.entityId).toBe(testLessonId);

    const reportStatusAudit = recordedAuditEvents.find((e) => e.action === "content_report.status_changed");
    expect(reportStatusAudit).toBeDefined();
    expect(reportStatusAudit.entityId).toBe(report.id);
    expect(reportStatusAudit.details?.oldStatus).toBe("pending");
    expect(reportStatusAudit.details?.newStatus).toBe("resolved");

    // -------------------------------------------------------------------------
    // Step 9: Verify notification created for the reporting student
    // -------------------------------------------------------------------------
    const studentNotifs = await notificationStore.listForUser(studentUserId);
    expect(studentNotifs.total).toBe(1);
    expect(studentNotifs.items[0].title).toBe("رفع اشکال گزارش‌شده");
    expect(studentNotifs.items[0].message).toContain("بررسی و برطرف شد");

    // -------------------------------------------------------------------------
    // Step 10: Reject unauthorized, tampered, or out-of-scope requests
    // -------------------------------------------------------------------------
    // 10a. Tampered lessonId (attempting to repair unrelated lesson using report.id) -> 403 Forbidden
    const tamperedLessonRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId: unassociatedLessonId,
        originalHash: "any_hash",
      }),
    });
    expect(tamperedLessonRes.statusCode).toBe(403);

    // 10b. Support calling preview without reportId -> 400 Bad Request
    const noReportRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({ lessonId: testLessonId }),
    });
    expect(noReportRes.statusCode).toBe(400);

    // 10c. Calling apply on an already resolved report -> 400 Bad Request
    const alreadyResolvedRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId: testLessonId,
        originalHash: applyData.contentHash,
      }),
    });
    expect(alreadyResolvedRes.statusCode).toBe(400);

    // 10d. Normal student calling content-repair preview or apply -> 403 Forbidden
    const studentPreviewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: studentCookie, "content-type": "application/json" },
      body: JSON.stringify({ reportId: report.id, lessonId: testLessonId }),
    });
    expect(studentPreviewRes.statusCode).toBe(403);

    const studentApplyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: studentCookie, "content-type": "application/json" },
      body: JSON.stringify({ reportId: report.id, lessonId: testLessonId, originalHash: "h" }),
    });
    expect(studentApplyRes.statusCode).toBe(403);

    // 10e. Support trying to modify course details -> 403 Forbidden
    const supportPatchCourse = await app.inject({
      method: "PATCH",
      url: `/v1/admin/courses/${testCourseId}`,
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Hacked Course" }),
    });
    expect(supportPatchCourse.statusCode).toBe(403);

    // 10f. Support trying to delete document -> 403 Forbidden
    const supportDeleteDoc = await app.inject({
      method: "DELETE",
      url: `/v1/admin/documents/${randomUUID()}`,
      headers: { cookie: supportCookie },
    });
    expect(supportDeleteDoc.statusCode).toBe(403);

    // Verify unassociated lesson was never touched
    const unassociated = await lessonStore.findById(unassociatedLessonId);
    expect(unassociated?.contentMarkdown).toBe("این درسنامه نباید توسط پشتیبان تغییر کند.");
  });
});
