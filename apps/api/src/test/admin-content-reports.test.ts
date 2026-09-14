import { describe, expect, it, beforeEach } from "vitest";
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
  asUserId,
  Roles,
} from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Admin Content Problem Reports Endpoints", () => {
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

  let platformAdminCookie: string;
  let contentWorkerCookie: string;
  let studentCookie: string;
  let studentUserId: UserId;
  let otherStudentUserId: UserId;

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

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x", name: email.split("@")[0] });
      if (role === Roles.platform_admin || role === Roles.content_worker) {
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

    const admin = await createUserWithRole("admin@avana.ai", Roles.platform_admin);
    platformAdminCookie = `avana_session=${admin.sessionToken}`;

    const worker = await createUserWithRole("worker@avana.ai", Roles.content_worker);
    contentWorkerCookie = `avana_session=${worker.sessionToken}`;

    const student = await createUserWithRole("student@avana.ai", Roles.student);
    studentCookie = `avana_session=${student.sessionToken}`;
    studentUserId = student.user.id as UserId;

    const otherStudent = await createUserWithRole("other_student@avana.ai", Roles.student);
    otherStudentUserId = otherStudent.user.id as UserId;
  });

  describe("Security & Authorization", () => {
    it("1. Returns 401 when unauthenticated", async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports",
      });
      expect(res.statusCode).toBe(401);
    });

    it("2. Returns 403 when user is student (insufficient permissions)", async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports",
        headers: { cookie: studentCookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it("3. Allows access to platform_admin", async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports",
        headers: { cookie: platformAdminCookie },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data).toHaveProperty("items");
      expect(data).toHaveProperty("totalCount");
    });

    it("4. Allows access to content_worker", async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports",
        headers: { cookie: contentWorkerCookie },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("List & Filters", () => {
    it("5. Returns paginated reports with correct shape", async () => {
      // Seed two reports
      await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: asCourseId("33333333-3333-3333-3333-333333333333"),
        selectedText: "متن اشتباه نمونه ۱",
        category: "scientific_error",
        comment: "توضیح اشتباه علمی",
      });
      await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: asCourseId("33333333-3333-3333-3333-333333333333"),
        selectedText: "متن دارای غلط تایپی ۲",
        category: "typo",
        comment: "نقطه جا افتاده",
      });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports?page=1&pageSize=10",
        headers: { cookie: platformAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.totalCount).toBe(2);
      expect(data.items.length).toBe(2);
      expect(data.items[0].status).toBe("pending");
      expect(data.items[0].selectedText).toBeDefined();
      expect(data.items[0].category).toBeDefined();
    });

    it("6. Filters by category correctly", async () => {
      await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: null,
        selectedText: "متن اشتباه علمی",
        category: "scientific_error",
        comment: null,
      });
      await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: null,
        selectedText: "فرمول نامفهوم",
        category: "rendering_issue",
        comment: null,
      });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports?category=scientific_error",
        headers: { cookie: platformAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.totalCount).toBe(1);
      expect(data.items[0].category).toBe("scientific_error");
    });

    it("7. Filters by courseId correctly", async () => {
      const courseA = asCourseId("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
      const courseB = asCourseId("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

      await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: courseA,
        selectedText: "دوره آ",
        category: "other",
        comment: null,
      });
      await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: courseB,
        selectedText: "دوره ب",
        category: "other",
        comment: null,
      });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content-reports?courseId=${courseA}`,
        headers: { cookie: platformAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.totalCount).toBe(1);
      expect(data.items[0].courseId).toBe(courseA);
    });
  });

  describe("Detail & Status Updates", () => {
    it("8. Gets report detail by id", async () => {
      const created = await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: asCourseId("33333333-3333-3333-3333-333333333333"),
        selectedText: "متن نمونه جهت مشاهده جزئیات",
        category: "unclear_content",
        comment: "جمله آخر مبهم است",
      });

      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: { cookie: platformAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.id).toBe(created.id);
      expect(data.selectedText).toBe("متن نمونه جهت مشاهده جزئیات");
      expect(data.comment).toBe("جمله آخر مبهم است");
    });

    it("9. Returns 404 for nonexistent report id", async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports/00000000-0000-0000-0000-000000000000",
        headers: { cookie: platformAdminCookie },
      });
      expect(res.statusCode).toBe(404);
    });

    it("10. Updates report status successfully (pending -> resolved)", async () => {
      const created = await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: null,
        selectedText: "متن نیازمند اصلاح",
        category: "typo",
        comment: "اصلاح شد",
      });

      const app = await buildTestApp();
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "resolved" }),
      });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().status).toBe("resolved");

      // Verify in list
      const listRes = await app.inject({
        method: "GET",
        url: "/v1/admin/content-reports?status=resolved",
        headers: { cookie: platformAdminCookie },
      });
      expect(listRes.json().totalCount).toBe(1);
    });

    it("11. Rejects invalid status with 400 bad request", async () => {
      const created = await reportStore.create({
        userId: asUserId("11111111-1111-1111-1111-111111111111"),
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: null,
        selectedText: "متن تست",
        category: "other",
        comment: null,
      });

      const app = await buildTestApp();
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "invalid_status_xyz" }),
      });

      expect(patchRes.statusCode).toBe(400);
    });

    it("12. Changing status pending -> in_review creates notification for report author", async () => {
      const created = await reportStore.create({
        userId: studentUserId,
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: asCourseId("33333333-3333-3333-3333-333333333333"),
        selectedText: "متن نیازمند بررسی",
        category: "scientific",
        comment: "نیاز به بررسی منبع",
      });

      const app = await buildTestApp();
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "in_review" }),
      });

      expect(patchRes.statusCode).toBe(200);

      // Verify notification created for studentUserId
      const notifs = await notificationStore.listForUser(studentUserId);
      expect(notifs.total).toBe(1);
      const notif = notifs.items[0];
      expect(notif.type).toBe("content_report_status_changed");
      expect(notif.title).toBe("بررسی گزارش اشکال");
      expect(notif.message).toContain("در حال بررسی توسط تیم آموزشی است");
      expect(notif.actionUrl).toBe(
        "/courses/33333333-3333-3333-3333-333333333333?lessonId=22222222-2222-2222-2222-222222222222",
      );
    });

    it("13. Changing status in_review -> resolved creates resolved notification", async () => {
      const created = await reportStore.create({
        userId: studentUserId,
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: asCourseId("33333333-3333-3333-3333-333333333333"),
        selectedText: "متن حل‌شده",
        category: "typo",
        comment: "اصلاح شود",
      });
      await reportStore.updateStatus(created.id, "in_review");

      const app = await buildTestApp();
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "resolved" }),
      });

      expect(patchRes.statusCode).toBe(200);

      const notifs = await notificationStore.listForUser(studentUserId);
      expect(notifs.total).toBe(1);
      const notif = notifs.items[0];
      expect(notif.type).toBe("content_report_status_changed");
      expect(notif.title).toBe("رفع اشکال گزارش‌شده");
      expect(notif.message).toContain("بررسی و برطرف شد");
    });

    it("14. Changing status pending -> dismissed creates dismissed notification", async () => {
      const created = await reportStore.create({
        userId: studentUserId,
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: null,
        selectedText: "متن فاقد ایراد",
        category: "scientific",
        comment: null,
      });

      const app = await buildTestApp();
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "dismissed" }),
      });

      expect(patchRes.statusCode).toBe(200);

      const notifs = await notificationStore.listForUser(studentUserId);
      expect(notifs.total).toBe(1);
      const notif = notifs.items[0];
      expect(notif.type).toBe("content_report_status_changed");
      expect(notif.title).toBe("نتیجه بررسی گزارش اشکال");
      expect(notif.message).toContain("به‌عنوان مشکل قابل اصلاح تأیید نگردید");
    });

    it("15. Saving the same status again does NOT create a duplicate notification", async () => {
      const created = await reportStore.create({
        userId: studentUserId,
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: null,
        selectedText: "متن تست تکرار",
        category: "typo",
        comment: null,
      });

      const app = await buildTestApp();

      // First PATCH: pending -> in_review
      const firstPatch = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "in_review" }),
      });
      expect(firstPatch.statusCode).toBe(200);

      const notifsAfterFirst = await notificationStore.listForUser(studentUserId);
      expect(notifsAfterFirst.total).toBe(1);

      // Second PATCH: in_review -> in_review (same status)
      const secondPatch = await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "in_review" }),
      });
      expect(secondPatch.statusCode).toBe(200);

      // Total count of notifications must still be 1 (no duplicate)
      const notifsAfterSecond = await notificationStore.listForUser(studentUserId);
      expect(notifsAfterSecond.total).toBe(1);
    });

    it("16. Notification is delivered only to report author, not to other users", async () => {
      const created = await reportStore.create({
        userId: studentUserId,
        lessonId: asLessonId("22222222-2222-2222-2222-222222222222"),
        courseId: null,
        selectedText: "متن کاربر اول",
        category: "typo",
        comment: null,
      });

      const app = await buildTestApp();
      await app.inject({
        method: "PATCH",
        url: `/v1/admin/content-reports/${created.id}`,
        headers: {
          cookie: platformAdminCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "in_review" }),
      });

      const otherUserNotifs = await notificationStore.listForUser(otherStudentUserId);
      expect(otherUserNotifs.total).toBe(0);

      const authorNotifs = await notificationStore.listForUser(studentUserId);
      expect(authorNotifs.total).toBe(1);
    });
  });
});
