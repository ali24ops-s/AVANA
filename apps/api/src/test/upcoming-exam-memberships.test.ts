import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import type { CourseId, OrganizationId, UserId } from "@avana/domain";

function makeTestConfig(systemOrgId?: string) {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  if (systemOrgId) {
    process.env.SYSTEM_ORGANIZATION_ID = systemOrgId;
  }
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Personal Exam Schedules & Custom Course Exams", () => {
  const systemOrgId = "00000000-0000-0000-0000-000000000000" as OrganizationId;
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;

  beforeEach(() => {
    config = makeTestConfig(systemOrgId);
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore(orgStore);
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
    });
    return app;
  }

  async function signIn(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    return {
      token: extractSessionToken(res)!,
      userId: body.user.id,
      email: body.user.email,
    };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    name: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      organization: { id: string; name: string };
    };
    return body.organization;
  }

  function addOrgMembership(userId: string, orgId: string, role: string) {
    orgStore.addMembership({
      id: `mem-${userId}-${orgId}` as never,
      organizationId: orgId as never,
      userId: userId as UserId,
      role: role as never,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  }

  it("Two-User Exam Isolation: User A and User B manage independent exams on official course without cross-talk", async () => {
    const app = await buildApp();
    const admin = await signIn(app, "admin@example.com");
    const studentA = await signIn(app, "studentA@example.com");
    const studentB = await signIn(app, "studentB@example.com");
    const org = await createOrg(app, admin.token, "Org Alpha");

    addOrgMembership(studentA.userId, org.id, "student");
    addOrgMembership(studentB.userId, org.id, "student");

    // Create a TRUE official course directly via fixture
    const officialCourseId = "00000000-0000-0000-0000-000000000099" as CourseId;
    await courseStore.create({
      course: {
        id: officialCourseId,
        organizationId: org.id as OrganizationId,
        name: "هندسه تحلیلی",
        subject: "Mathematics",
        isOfficial: true,
        status: "published",
        targetAcademicFields: [],
        examDate: null,
        examScope: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Both students add this official course to their enrolled list
    await courseStore.addUserCourse(studentA.userId, officialCourseId);
    await courseStore.addUserCourse(studentB.userId, officialCourseId);

    // 1. User A registers an exam schedule
    const examDateA = "2026-11-20T08:30:00.000Z";
    const regResA = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/exam`,
      cookies: { avana_session: studentA.token },
      payload: {
        course_id: officialCourseId,
        exam_at: examDateA,
        exam_scope: { moduleIds: ["mod-1"] },
      },
    });
    expect(regResA.statusCode).toBe(200);
    expect(JSON.parse(regResA.body).course.exam_at).toBe(examDateA);

    // 2. User B views the course -> does NOT see User A's exam date
    const myResB1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: studentB.token },
    });
    expect(myResB1.statusCode).toBe(200);
    const courseForB1 = JSON.parse(myResB1.body).items.find(
      (c: { id: string }) => c.id === officialCourseId,
    );
    expect(courseForB1).toBeDefined();
    expect(courseForB1.exam_at).toBeNull();
    expect(courseForB1.exam_scope).toBeNull();

    // 3. User B registers a DIFFERENT exam date on the same course
    const examDateB = "2026-12-05T14:00:00.000Z";
    const regResB = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/exam`,
      cookies: { avana_session: studentB.token },
      payload: {
        course_id: officialCourseId,
        exam_at: examDateB,
      },
    });
    expect(regResB.statusCode).toBe(200);
    expect(JSON.parse(regResB.body).course.exam_at).toBe(examDateB);

    // 4. User A still sees their own date
    const myResA1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: studentA.token },
    });
    const courseForA1 = JSON.parse(myResA1.body).items.find(
      (c: { id: string }) => c.id === officialCourseId,
    );
    expect(courseForA1.exam_at).toBe(examDateA);

    // 5. User A deletes their exam
    const delResA = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${org.id}/courses/${officialCourseId}/exam`,
      cookies: { avana_session: studentA.token },
    });
    expect(delResA.statusCode).toBe(200);

    // 6. User B's exam remains intact
    const myResB2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: studentB.token },
    });
    const courseForB2 = JSON.parse(myResB2.body).items.find(
      (c: { id: string }) => c.id === officialCourseId,
    );
    expect(courseForB2.exam_at).toBe(examDateB);

    // 7. Deletion of User A's exam does NOT delete the course from User A's list or system catalog
    const myResA2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: studentA.token },
    });
    const courseForA2 = JSON.parse(myResA2.body).items.find(
      (c: { id: string }) => c.id === officialCourseId,
    );
    expect(courseForA2).toBeDefined();
    expect(courseForA2.exam_at).toBeNull();

    // Verify course remains intact in organization courses list
    const catalogRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: admin.token },
    });
    const officialInCatalog = JSON.parse(catalogRes.body).items.find(
      (c: { id: string }) => c.id === officialCourseId,
    );
    expect(officialInCatalog).toBeDefined();
    expect(officialInCatalog.is_official).toBe(true);

    // Verify course record directly in the store was not altered
    const rawCourse = await courseStore.findById(officialCourseId);
    expect(rawCourse).toBeDefined();
    expect(rawCourse?.isOfficial).toBe(true);
    expect(rawCourse?.deletedAt).toBeNull();
  });

  it("registers an exam for a new subject, auto-creating a personal course in 'دوره‌های من'", async () => {
    const app = await buildApp();
    const user = await signIn(app, "learner@example.com");
    const org = await createOrg(app, user.token, "Personal Space");

    const examDate = "2026-12-15T10:00:00.000Z";
    const regRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/exam`,
      cookies: { avana_session: user.token },
      payload: {
        title: "فیزیک هالیدی جلد ۱",
        exam_at: examDate,
      },
    });
    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.course.title).toBe("فیزیک هالیدی جلد ۱");
    expect(regBody.course.is_official).toBe(false);
    expect(regBody.course.exam_at).toBe(examDate);

    // Verify course appears in user's enrolled courses ("دوره‌های من")
    const myCoursesRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: user.token },
    });
    expect(myCoursesRes.statusCode).toBe(200);
    const myCoursesBody = JSON.parse(myCoursesRes.body);
    const createdCourse = myCoursesBody.items.find(
      (c: { title: string }) => c.title === "فیزیک هالیدی جلد ۱",
    );
    expect(createdCourse).toBeDefined();
    expect(createdCourse.id).toBe(regBody.course.id);
    expect(createdCourse.exam_at).toBe(examDate);
  });

  it("Deduplication Matrix: tests re-use rules across users, official courses, organizations, and deleted courses", async () => {
    const app = await buildApp();
    const user1 = await signIn(app, "dup1@example.com");
    const user2 = await signIn(app, "dup2@example.com");
    const org1 = await createOrg(app, user1.token, "Org One");
    const org2 = await createOrg(app, user2.token, "Org Two");

    addOrgMembership(user2.userId, org1.id, "student");

    // Rule 1: Same user re-registers same name -> reuses personal course
    const firstRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org1.id}/courses/exam`,
      cookies: { avana_session: user1.token },
      payload: {
        title: "مدارهای الکتریکی ۱",
        exam_at: "2026-11-01T09:00:00.000Z",
      },
    });
    expect(firstRes.statusCode).toBe(200);
    const firstCourseId = JSON.parse(firstRes.body).course.id;

    const secondRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org1.id}/courses/exam`,
      cookies: { avana_session: user1.token },
      payload: {
        title: "  مدارهای الکتریکی ۱   ", // trimmed name
        exam_at: "2026-11-05T14:00:00.000Z",
      },
    });
    expect(secondRes.statusCode).toBe(200);
    expect(JSON.parse(secondRes.body).course.id).toBe(firstCourseId);

    // Rule 2: Different user registers same name -> creates independent course
    const user2Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org1.id}/courses/exam`,
      cookies: { avana_session: user2.token },
      payload: {
        title: "مدارهای الکتریکی ۱",
        exam_at: "2026-11-10T10:00:00.000Z",
      },
    });
    expect(user2Res.statusCode).toBe(200);
    const user2CourseId = JSON.parse(user2Res.body).course.id;
    expect(user2CourseId).not.toBe(firstCourseId); // Distinct personal course!

    // Rule 3: Official course exists with same name -> does NOT reuse official course
    const officialCourseId = "00000000-0000-0000-0000-000000000777" as CourseId;
    await courseStore.create({
      course: {
        id: officialCourseId,
        organizationId: org1.id as OrganizationId,
        name: "شیمی عمومی ۱",
        subject: "Chemistry",
        isOfficial: true,
        status: "published",
        targetAcademicFields: [],
        examDate: null,
        examScope: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const user1ChemistryRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org1.id}/courses/exam`,
      cookies: { avana_session: user1.token },
      payload: {
        title: "شیمی عمومی ۱",
        exam_at: "2026-12-01T08:00:00.000Z",
      },
    });
    expect(user1ChemistryRes.statusCode).toBe(200);
    const user1ChemCourse = JSON.parse(user1ChemistryRes.body).course;
    expect(user1ChemCourse.id).not.toBe(officialCourseId); // Official course NOT reused!
    expect(user1ChemCourse.is_official).toBe(false);

    // Rule 4: User in different organization registers same name -> independent course in their org
    const user2Org2Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org2.id}/courses/exam`,
      cookies: { avana_session: user2.token },
      payload: {
        title: "مدارهای الکتریکی ۱",
        exam_at: "2026-12-20T10:00:00.000Z",
      },
    });
    expect(user2Org2Res.statusCode).toBe(200);
    const user2Org2CourseId = JSON.parse(user2Org2Res.body).course.id;
    expect(user2Org2CourseId).not.toBe(firstCourseId);
    expect(user2Org2CourseId).not.toBe(user2CourseId);

    // Rule 5: Deleted course is NOT reused
    await courseStore.deleteUserExamSchedule(user1.userId, firstCourseId);
    const firstCourseRecord = await courseStore.findById(firstCourseId);
    if (firstCourseRecord) {
      firstCourseRecord.deletedAt = new Date().toISOString();
      await courseStore.update(firstCourseRecord);
    }

    const reCreateAfterDeleteRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org1.id}/courses/exam`,
      cookies: { avana_session: user1.token },
      payload: {
        title: "مدارهای الکتریکی ۱",
        exam_at: "2026-12-25T09:00:00.000Z",
      },
    });
    expect(reCreateAfterDeleteRes.statusCode).toBe(200);
    const newCourseAfterDeleteId = JSON.parse(reCreateAfterDeleteRes.body).course.id;
    expect(newCourseAfterDeleteId).not.toBe(firstCourseId); // Re-creates new personal course!
  });

  it("Security & Validation: rejects invalid courseId, invalid dates, and attempts to create personal courses in system org", async () => {
    const app = await buildApp();
    const user = await signIn(app, "security@example.com");
    const org = await createOrg(app, user.token, "Personal Space");

    // 1. Invalid courseId UUID
    const badIdRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/exam`,
      cookies: { avana_session: user.token },
      payload: {
        course_id: "not-a-valid-uuid",
        exam_at: "2026-11-20T08:30:00.000Z",
      },
    });
    expect(badIdRes.statusCode).toBe(400);

    // 2. Invalid exam date string
    const badDateRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/exam`,
      cookies: { avana_session: user.token },
      payload: {
        title: "زبان عمومی",
        exam_at: "this-is-not-a-date",
      },
    });
    expect(badDateRes.statusCode).toBe(400);

    // 3. Attempting to create a custom personal course in system organization is rejected
    addOrgMembership(user.userId, systemOrgId, "student");
    const systemOrgCreateRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${systemOrgId}/courses/exam`,
      cookies: { avana_session: user.token },
      payload: {
        title: "دوره در سازمان سیستمی",
        exam_at: "2026-11-20T08:30:00.000Z",
      },
    });
    expect(systemOrgCreateRes.statusCode).toBe(400);
  });

  it("legacy PATCH route updates user's membership exam schedule without mutating shared course", async () => {
    const app = await buildApp();
    const user = await signIn(app, "user3@example.com");
    const org = await createOrg(app, user.token, "Org Gamma");

    // Register personal course
    const regRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses/exam`,
      cookies: { avana_session: user.token },
      payload: {
        title: "آمار و احتمالات مهندسی",
        exam_at: "2026-11-10T08:00:00.000Z",
      },
    });
    const courseId = JSON.parse(regRes.body).course.id;

    // Call legacy PATCH
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${org.id}/courses/${courseId}`,
      cookies: { avana_session: user.token },
      payload: {
        exam_at: "2026-11-15T09:00:00.000Z",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const patched = JSON.parse(patchRes.body).course;
    expect(patched.exam_at).toBe("2026-11-15T09:00:00.000Z");

    // Verify base course record in store does NOT have examDate set
    const baseCourse = await courseStore.findById(courseId);
    expect(baseCourse?.examDate).toBeNull();
  });
});
