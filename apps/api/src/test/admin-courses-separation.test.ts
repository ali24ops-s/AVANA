import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Courses Segregation & Inspection (Official, Teacher, User)", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    const systemOrgId = "00000000-0000-0000-0000-000000000001";
    config.systemOrganizationId = systemOrgId;

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
      if (role === Roles.platform_admin) {
        user.globalRole = role;
        user.role = role;
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken, orgId };
    }

    const platformAdmin = await createUserWithRole("admin@avana.test", Roles.platform_admin);
    const student = await createUserWithRole("student@avana.test", Roles.student);

    // Seed test courses
    const officialCourseId = randomUUID();
    const teacherCourseId = randomUUID();
    const userCourseId = randomUUID();
    const ambiguousCourseId = randomUUID();

    adminStore.memoryCourses = [
      {
        id: officialCourseId,
        organizationId: systemOrgId,
        name: "زیست‌شناسی جامع کنکور (رسمی)",
        subject: "تجربی",
        status: "published",
        isOfficial: true,
        scope: "official",
        createdAt: new Date().toISOString(),
        counts: { modules: 5, lessons: 20, flashcards: 100, quizzes: 50 },
        hasContent: true,
      },
      {
        id: teacherCourseId,
        organizationId: randomUUID(),
        name: "فیزیک یازدهم استاد رضایی",
        subject: "فیزیک",
        status: "draft",
        isOfficial: false,
        scope: "teacher",
        createdAt: new Date().toISOString(),
        teacher: {
          id: randomUUID(),
          name: "دکتر رضایی",
          email: "rezaei@school.test",
          role: "teacher",
        },
        classroom: {
          id: randomUUID(),
          title: "کلاس کنکور فیزیک",
          inviteCode: "PHY101",
        },
        counts: { modules: 2, lessons: 8, flashcards: 30, quizzes: 15 },
        hasContent: true,
      },
      {
        id: userCourseId,
        organizationId: randomUUID(),
        name: "یادداشت‌های شیمی من",
        subject: "شیمی",
        status: "draft",
        isOfficial: false,
        scope: "user",
        createdAt: new Date().toISOString(),
        owner: {
          id: randomUUID(),
          name: "علی احمدی",
          email: "ali@student.test",
          role: "student",
        },
        counts: { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 },
        hasContent: false,
      },
      {
        id: ambiguousCourseId,
        organizationId: randomUUID(), // NOT system org, but flagged official
        name: "دوره دارای تناقض مالکیت",
        subject: "نامشخص",
        status: "draft",
        isOfficial: false,
        scope: "user",
        needsReview: true,
        createdAt: new Date().toISOString(),
        counts: { modules: 1, lessons: 1, flashcards: 0, quizzes: 0 },
        hasContent: true,
      },
    ];

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      systemOrganizationId: systemOrgId,
    });

    return {
      app,
      adminToken: platformAdmin.sessionToken,
      studentToken: student.sessionToken,
      officialCourseId,
      teacherCourseId,
      userCourseId,
      ambiguousCourseId,
    };
  }

  test("GET /v1/admin/courses filters strictly by scope=official and returns badge counts", async () => {
    const { app, adminToken, officialCourseId } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/courses?scope=official",
      cookies: { avana_session: adminToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].id).toBe(officialCourseId);
    expect(body.courses[0].scope).toBe("official");
    expect(body.courses[0].isOfficial).toBe(true);

    // Verify badge counts for the 3 tabs
    expect(body.counts).toBeDefined();
    expect(body.counts.official).toBe(1);
    expect(body.counts.teacher).toBe(1);
    expect(body.counts.user).toBe(2); // userCourse + ambiguous
  });

  test("GET /v1/admin/courses filters strictly by scope=teacher with classroom & teacher info", async () => {
    const { app, adminToken, teacherCourseId } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/courses?scope=teacher",
      cookies: { avana_session: adminToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].id).toBe(teacherCourseId);
    expect(body.courses[0].scope).toBe("teacher");
    expect(body.courses[0].teacher).toBeDefined();
    expect(body.courses[0].teacher.name).toBe("دکتر رضایی");
    expect(body.courses[0].classroom).toBeDefined();
    expect(body.courses[0].classroom.inviteCode).toBe("PHY101");
  });

  test("GET /v1/admin/courses filters strictly by scope=user and flags ambiguous course as needsReview", async () => {
    const { app, adminToken, userCourseId, ambiguousCourseId } = await setupTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/courses?scope=user",
      cookies: { avana_session: adminToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.courses).toHaveLength(2);

    const normalUserCourse = body.courses.find((c: any) => c.id === userCourseId);
    expect(normalUserCourse).toBeDefined();
    expect(normalUserCourse.hasContent).toBe(false);
    expect(normalUserCourse.owner.name).toBe("علی احمدی");

    const ambiguous = body.courses.find((c: any) => c.id === ambiguousCourseId);
    expect(ambiguous).toBeDefined();
    expect(ambiguous.needsReview).toBe(true);
  });

  test("GET /v1/admin/courses/:id resolves single course across all 3 scopes without false 404", async () => {
    const { app, adminToken, teacherCourseId, userCourseId, officialCourseId } = await setupTestApp();

    // 1. Official course
    const resOff = await app.inject({
      method: "GET",
      url: `/v1/admin/courses/${officialCourseId}`,
      cookies: { avana_session: adminToken },
    });
    expect(resOff.statusCode).toBe(200);
    const bodyOff = JSON.parse(resOff.body);
    expect(bodyOff.course.id).toBe(officialCourseId);
    expect(bodyOff.course.scope).toBe("official");

    // 2. Teacher course
    const resTeach = await app.inject({
      method: "GET",
      url: `/v1/admin/courses/${teacherCourseId}`,
      cookies: { avana_session: adminToken },
    });
    expect(resTeach.statusCode).toBe(200);
    const bodyTeach = JSON.parse(resTeach.body);
    expect(bodyTeach.course.id).toBe(teacherCourseId);
    expect(bodyTeach.course.scope).toBe("teacher");
    expect(bodyTeach.course.teacher.name).toBe("دکتر رضایی");

    // 3. User personal course
    const resUser = await app.inject({
      method: "GET",
      url: `/v1/admin/courses/${userCourseId}`,
      cookies: { avana_session: adminToken },
    });
    expect(resUser.statusCode).toBe(200);
    const bodyUser = JSON.parse(resUser.body);
    expect(bodyUser.course.id).toBe(userCourseId);
    expect(bodyUser.course.scope).toBe("user");
  });

  test("GET /v1/admin/courses/:id returns 404 not_found when course truly does not exist", async () => {
    const { app, adminToken } = await setupTestApp();

    const nonExistentId = randomUUID();
    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/courses/${nonExistentId}`,
      cookies: { avana_session: adminToken },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("not_found");
    expect(body.message).toContain("یافت نشد");
  });

  test("Denies unauthorized access to student (403)", async () => {
    const { app, studentToken, officialCourseId } = await setupTestApp();

    const resList = await app.inject({
      method: "GET",
      url: "/v1/admin/courses?scope=official",
      cookies: { avana_session: studentToken },
    });
    expect(resList.statusCode).toBe(403);

    const resDetail = await app.inject({
      method: "GET",
      url: `/v1/admin/courses/${officialCourseId}`,
      cookies: { avana_session: studentToken },
    });
    expect(resDetail.statusCode).toBe(403);
  });
});
