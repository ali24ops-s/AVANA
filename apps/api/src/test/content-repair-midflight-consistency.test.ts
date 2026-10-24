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

describe("Content Repair Mid-flight Failures, Concurrency & Data Consistency Audit", () => {
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
  let auditEmitMock: any;

  let supportUserId: UserId;
  let studentUserId: UserId;
  let supportCookie: string;
  let testCourseId: CourseId;
  let testModuleId: ReturnType<typeof asModuleId>;

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
        emit: auditEmitMock,
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
    auditEmitMock = vi.fn(async (events) => {
      recordedAuditEvents.push(...events);
    });

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

    const student = await createUserWithRole("student@avana.test", Roles.student);
    studentUserId = student.user.id as UserId;

    const support = await createUserWithRole("support@avana.test", Roles.support_agent);
    supportUserId = support.user.id as UserId;
    supportCookie = `avana_session=${support.sessionToken}`;

    testCourseId = asCourseId(randomUUID());
    testModuleId = asModuleId(randomUUID());
  });

  it("Scenario 1: Handles failure in report status update gracefully after content is saved", async () => {
    const app = await buildTestApp();

    const lessonId = asLessonId(randomUUID());
    const initialText = "# واکنش شیمیایی\n\nواکنش هیدرولیز: textCaC_2 + 2textH 2O";
    await lessonStore.create({
      id: lessonId,
      moduleId: testModuleId,
      title: "درس شیمی ۱",
      contentType: "text",
      contentMarkdown: initialText,
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await reportStore.create({
      userId: studentUserId,
      lessonId,
      courseId: testCourseId,
      selectedText: "textCaC_2",
      category: "typo",
      comment: "غلط در فرمول",
    });

    // Preview
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({ reportId: report.id, lessonId }),
    });
    const preview = JSON.parse(previewRes.body);

    // Mock reportStore.updateStatus to throw an unexpected database error ONLY on final resolution
    const originalUpdateStatus = reportStore.updateStatus.bind(reportStore);
    vi.spyOn(reportStore, "updateStatus").mockImplementation(async (id, status, expected) => {
      if (status === "resolved") {
        throw new Error("Database connection dropped during report resolution");
      }
      return originalUpdateStatus(id, status, expected);
    });

    // Apply repair
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId,
        originalHash: preview.originalHash,
        appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
      }),
    });

    // Content was saved in DB
    const updatedLesson = await lessonStore.findById(lessonId);
    expect(updatedLesson?.contentMarkdown).not.toBe(initialText);

    // Report update failed, so report status is not resolved
    const reportInDb = await reportStore.findById(report.id);
    expect(reportInDb?.status).not.toBe("resolved");

    // But because content was successfully saved, response returned 200 with reportUpdateFailed: true
    expect(applyRes.statusCode).toBe(200);
    const body = JSON.parse(applyRes.body);
    expect(body.reportUpdateFailed).toBe(true);
    expect(body.reportStatus).toBeUndefined();

    // If client retries with the same old originalHash, server detects conflict (409)
    const retryRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId,
        originalHash: preview.originalHash,
      }),
    });
    expect(retryRes.statusCode).toBe(409);
  });

  it("Scenario 2: Continues successfully when audit service or notification service fails", async () => {
    const app = await buildTestApp();

    const lessonId = asLessonId(randomUUID());
    const initialText = "# درس فیزیولوژی\n\nتغییرات بیوشیمیایی: textCaC_2 + 2textH 2O";
    await lessonStore.create({
      id: lessonId,
      moduleId: testModuleId,
      title: "درس زیست",
      contentType: "text",
      contentMarkdown: initialText,
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await reportStore.create({
      userId: studentUserId,
      lessonId,
      courseId: testCourseId,
      selectedText: "textCaC_2",
      category: "typo",
      comment: "غلط فرمولی",
    });

    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({ reportId: report.id, lessonId }),
    });
    const preview = JSON.parse(previewRes.body);

    // Mock auditService to fail
    auditEmitMock.mockRejectedValue(new Error("Audit Kafka unreachable"));
    // Mock notificationService to fail
    vi.spyOn(notificationService, "notifyContentReportStatus").mockRejectedValue(
      new Error("Push service timeout"),
    );

    // Apply repair
    const applyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId,
        originalHash: preview.originalHash,
        appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
      }),
    });

    expect(applyRes.statusCode).toBe(200);

    // Lesson is repaired
    const updatedLesson = await lessonStore.findById(lessonId);
    expect(updatedLesson?.contentMarkdown).not.toBe(initialText);

    // Report is resolved
    const reportInDb = await reportStore.findById(report.id);
    expect(reportInDb?.status).toBe("resolved");
  });

  it("Scenario 3: Sequential duplicate apply request is rejected (idempotency)", async () => {
    const app = await buildTestApp();

    const lessonId = asLessonId(randomUUID());
    const initialText = "تست ریاضی: $x = 1$$";
    await lessonStore.create({
      id: lessonId,
      moduleId: testModuleId,
      title: "درس ریاضی",
      contentType: "text",
      contentMarkdown: initialText,
      sortOrder: 1,
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await reportStore.create({
      userId: studentUserId,
      lessonId,
      courseId: testCourseId,
      selectedText: "$x = 1$$",
      category: "typo",
    });

    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({ reportId: report.id, lessonId }),
    });
    const preview = JSON.parse(previewRes.body);

    // 1st request -> 200 OK
    const firstRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId,
        originalHash: preview.originalHash,
        appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
      }),
    });
    expect(firstRes.statusCode).toBe(200);

    // 2nd identical duplicate request -> 400 Bad Request (report already resolved)
    const duplicateRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/apply",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        lessonId,
        originalHash: preview.originalHash,
        appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
      }),
    });
    expect(duplicateRes.statusCode).toBe(400);
    const body = JSON.parse(duplicateRes.body);
    expect(body.error.message).toContain("قبلاً تعیین تکلیف شده است");
  });

  it("Scenario 4: Two concurrent requests with the same originalHash are safely serialized with lock", async () => {
    const app = await buildTestApp();

    const lessonId = asLessonId(randomUUID());
    const initialText = "متن درس: $y = 2$$";
    await lessonStore.create({
      id: lessonId,
      moduleId: testModuleId,
      title: "درس فیزیک",
      contentType: "text",
      contentMarkdown: initialText,
      sortOrder: 1,
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await reportStore.create({
      userId: studentUserId,
      lessonId,
      courseId: testCourseId,
      selectedText: "$y = 2$$",
      category: "typo",
    });

    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({ reportId: report.id, lessonId }),
    });
    const preview = JSON.parse(previewRes.body);

    // Fire two requests concurrently
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/v1/admin/content-repair/apply",
        headers: { cookie: supportCookie, "content-type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          lessonId,
          originalHash: preview.originalHash,
          appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
        }),
      }),
      app.inject({
        method: "POST",
        url: "/v1/admin/content-repair/apply",
        headers: { cookie: supportCookie, "content-type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          lessonId,
          originalHash: preview.originalHash,
          appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
        }),
      }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // One must succeed (200) and the other must be rejected (409 conflict or 400 bad request)
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);

    // Check notifications count: exactly 1 notification sent
    const notifs = await notificationStore.listForUser(studentUserId);
    expect(notifs.total).toBe(1);

    // Final report status is resolved
    const reportInDb = await reportStore.findById(report.id);
    expect(reportInDb?.status).toBe("resolved");
  });

  it("Scenario 5: Multi-process simulation: Two distinct app instances (isolated memory spaces) sharing DB lock atomically", async () => {
    // appInstance1 and appInstance2 represent two separate Node.js processes/containers
    // Each has its own module instance and in-memory Set (activeRepairLocks is NOT shared between them)
    const appInstance1 = await buildTestApp();
    const appInstance2 = await buildTestApp();

    const lessonId = asLessonId(randomUUID());
    const initialText = "# درس ترمودینامیک\n\nتغییرات انرژی: textCaC_2 + 2textH 2O";
    await lessonStore.create({
      id: lessonId,
      moduleId: testModuleId,
      title: "درس ترمودینامیک",
      contentType: "text",
      contentMarkdown: initialText,
      sortOrder: 1,
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const report = await reportStore.create({
      userId: studentUserId,
      lessonId,
      courseId: testCourseId,
      selectedText: "textCaC_2",
      category: "typo",
    });

    const previewRes = await appInstance1.inject({
      method: "POST",
      url: "/v1/admin/content-repair/preview",
      headers: { cookie: supportCookie, "content-type": "application/json" },
      body: JSON.stringify({ reportId: report.id, lessonId }),
    });
    const preview = JSON.parse(previewRes.body);

    // Fire two requests concurrently hitting DIFFERENT app instances (simulating 2 separate containers/processes)
    const [resFromPod1, resFromPod2] = await Promise.all([
      appInstance1.inject({
        method: "POST",
        url: "/v1/admin/content-repair/apply",
        headers: { cookie: supportCookie, "content-type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          lessonId,
          originalHash: preview.originalHash,
          appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
        }),
      }),
      appInstance2.inject({
        method: "POST",
        url: "/v1/admin/content-repair/apply",
        headers: { cookie: supportCookie, "content-type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          lessonId,
          originalHash: preview.originalHash,
          appliedBlockIndices: preview.candidates.map((c: any) => c.blockIndex),
        }),
      }),
    ]);

    const statuses = [resFromPod1.statusCode, resFromPod2.statusCode].sort();
    // Exactly one instance must succeed (200), the other MUST be rejected (409 conflict via DB CAS or 400 already resolved)
    expect(statuses[0]).toBe(200);
    expect([400, 409]).toContain(statuses[1]);

    const rejectedRes = statuses[1] === resFromPod1.statusCode ? resFromPod1 : resFromPod2;
    const conflictBody = JSON.parse(rejectedRes.body);
    expect(conflictBody.error.message).toMatch(/(در حال تعیین تکلیف است|قبلاً تعیین تکلیف شده است)/);

    // DB state verification
    // 1. Exactly 1 notification created
    const notifs = await notificationStore.listForUser(studentUserId);
    expect(notifs.total).toBe(1);

    // 2. Report status is resolved
    const reportInDb = await reportStore.findById(report.id);
    expect(reportInDb?.status).toBe("resolved");

    // 3. Lesson was repaired cleanly
    const updatedLesson = await lessonStore.findById(lessonId);
    expect(updatedLesson?.contentMarkdown).not.toBe(initialText);
  });
});
