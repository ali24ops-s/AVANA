/**
 * Integration Test: Per-User Exam Schedule Isolation.
 *
 * Verifies:
 * 1. Independent exam registration by two users on the same course.
 * 2. User A's exam is NOT visible to User B.
 * 3. User B's exam is NOT visible to User A.
 * 4. Editing User A's exam date does NOT affect User B's exam date.
 * 5. Deleting User A's exam does NOT delete or alter User B's exam.
 * 6. Direct API attempts to supply another user's ID or access another's schedule are isolated.
 * 7. Persistence after session re-sign-in (re-auth / refresh).
 * 8. Regression prevention: official course exam dates remain distinct and protected.
 */

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

describe("Upcoming Exams: Per-User Exam Schedule Isolation", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;

  beforeEach(() => {
    config = makeTestConfig();
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

  async function setOrgMembershipRole(
    userId: string,
    orgId: string,
    role: "organization_admin" | "course_editor" | "student",
  ) {
    orgStore.setMembershipRole(
      orgId as unknown as OrganizationId,
      userId as unknown as UserId,
      role,
    );
    const existing = await orgStore.findMembership(
      orgId as unknown as OrganizationId,
      userId as unknown as UserId,
    );
    if (!existing) {
      orgStore.addMembership({
        id: crypto.randomUUID(),
        organizationId: orgId as unknown as OrganizationId,
        userId: userId as unknown as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  it("satisfies the entire lifecycle of multi-user exam schedule isolation", async () => {
    const app = await buildApp();

    // 1. Setup organization and admin
    const admin = await signIn(app, "admin@example.com");
    const org = await createOrg(app, admin.token, "Avana University");

    // 2. Admin creates a shared course (with an optional official exam date)
    const officialDate = "2026-12-20T09:00:00.000Z";
    const createCourseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: admin.token },
      payload: {
        title: "فیزیولوژی پزشکی",
        subject: "پزشکی",
        exam_at: officialDate,
      },
    });
    expect(createCourseRes.statusCode).toBe(201);
    const course = JSON.parse(createCourseRes.body).course as { id: string };

    // 3. User A and User B register and join the organization as students
    const userA = await signIn(app, "studentA@example.com");
    await setOrgMembershipRole(userA.userId, org.id, "student");
    await courseStore.addUserCourse(userA.userId as UserId, course.id as unknown as CourseId);

    const userB = await signIn(app, "studentB@example.com");
    await setOrgMembershipRole(userB.userId, org.id, "student");
    await courseStore.addUserCourse(userB.userId as UserId, course.id as unknown as CourseId);

    // Initial check: Both users have enrolled in the course, but neither has set a personal exam date
    const initialListA = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userA.token },
    });
    expect(initialListA.statusCode).toBe(200);
    const initialCoursesA = JSON.parse(initialListA.body).items;
    expect(initialCoursesA[0].exam_at).toBeNull();
    expect(initialCoursesA[0].official_exam_at).toBe(officialDate);

    const initialListB = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userB.token },
    });
    expect(initialListB.statusCode).toBe(200);
    const initialCoursesB = JSON.parse(initialListB.body).items;
    expect(initialCoursesB[0].exam_at).toBeNull();
    expect(initialCoursesB[0].official_exam_at).toBe(officialDate);

    // =========================================================================
    // Test 1: User A schedules an exam for 2026-11-10
    // =========================================================================
    const userADate = "2026-11-10T08:00:00.000Z";
    const scheduleResA = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/${course.id}/exam-schedule`,
      cookies: { avana_session: userA.token },
      payload: {
        exam_at: userADate,
        exam_scope: { moduleIds: ["mod-cardio"] },
      },
    });
    expect(scheduleResA.statusCode).toBe(200);
    const scheduleBodyA = JSON.parse(scheduleResA.body);
    expect(scheduleBodyA.course.exam_at).toBe(userADate);
    expect(scheduleBodyA.course.exam_scope).toEqual({ moduleIds: ["mod-cardio"] });

    // =========================================================================
    // Test 2: Verify User A sees their exam, but User B does NOT see User A's exam
    // =========================================================================
    const listA1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userA.token },
    });
    const coursesAfterA = JSON.parse(listA1.body).items;
    expect(coursesAfterA[0].exam_at).toBe(userADate);

    const listB1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userB.token },
    });
    const coursesBAfterA = JSON.parse(listB1.body).items;
    expect(coursesBAfterA[0].exam_at).toBeNull(); // User B does NOT see User A's exam!

    // =========================================================================
    // Test 3: User B schedules a different exam date for 2026-11-25
    // =========================================================================
    const userBDate = "2026-11-25T14:00:00.000Z";
    const scheduleResB = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/${course.id}/exam-schedule`,
      cookies: { avana_session: userB.token },
      payload: {
        exam_at: userBDate,
        exam_scope: { moduleIds: ["mod-neuro"] },
      },
    });
    expect(scheduleResB.statusCode).toBe(200);

    // Verify isolation: User A has userADate, User B has userBDate
    const listA2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userA.token },
    });
    expect(JSON.parse(listA2.body).items[0].exam_at).toBe(userADate);
    expect(JSON.parse(listA2.body).items[0].exam_scope).toEqual({ moduleIds: ["mod-cardio"] });

    const listB2 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userB.token },
    });
    expect(JSON.parse(listB2.body).items[0].exam_at).toBe(userBDate);
    expect(JSON.parse(listB2.body).items[0].exam_scope).toEqual({ moduleIds: ["mod-neuro"] });

    // =========================================================================
    // Test 4: User A edits exam date -> User B's date is unaffected
    // =========================================================================
    const userAEditedDate = "2026-11-15T10:00:00.000Z";
    const editResA = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/${course.id}/exam-schedule`,
      cookies: { avana_session: userA.token },
      payload: {
        exam_at: userAEditedDate,
        exam_scope: { moduleIds: ["mod-cardio", "mod-renal"] },
      },
    });
    expect(editResA.statusCode).toBe(200);

    const listA3 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userA.token },
    });
    expect(JSON.parse(listA3.body).items[0].exam_at).toBe(userAEditedDate);

    const listB3 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userB.token },
    });
    expect(JSON.parse(listB3.body).items[0].exam_at).toBe(userBDate); // B is untouched

    // =========================================================================
    // Test 5: User A deletes exam -> User B's exam remains intact
    // =========================================================================
    const deleteResA = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${org.id}/courses/${course.id}/exam-schedule`,
      cookies: { avana_session: userA.token },
    });
    expect(deleteResA.statusCode).toBe(200);

    const listA4 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userA.token },
    });
    expect(JSON.parse(listA4.body).items[0].exam_at).toBeNull(); // A is deleted

    const listB4 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userB.token },
    });
    expect(JSON.parse(listB4.body).items[0].exam_at).toBe(userBDate); // B is STILL intact!

    // =========================================================================
    // Test 6: API Ownership Security - Client cannot send userId to forge ownership
    // =========================================================================
    const maliciousPayload = {
      user_id: userB.userId,
      userId: userB.userId,
      exam_at: "2029-01-01T00:00:00.000Z",
    };
    await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/${course.id}/exam-schedule`,
      cookies: { avana_session: userA.token },
      payload: maliciousPayload,
    });

    // Check that User B was NOT modified by User A's request with userB's id
    const verifyB = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userB.token },
    });
    expect(JSON.parse(verifyB.body).items[0].exam_at).toBe(userBDate);

    // =========================================================================
    // Test 7: Persistence after re-sign-in / new session
    // =========================================================================
    const userBReAuth = await signIn(app, "studentB@example.com");
    const listBReAuth = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: userBReAuth.token },
    });
    expect(JSON.parse(listBReAuth.body).items[0].exam_at).toBe(userBDate);

    // =========================================================================
    // Test 8: Official Course Exam integrity - courses.examDate is preserved
    // =========================================================================
    const courseDetails = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: admin.token },
    });
    const parsedCourse = JSON.parse(courseDetails.body).course;
    expect(parsedCourse.official_exam_at).toBe(officialDate);

    await app.close();
  });

  it("differential sync: preserves existing exam schedules when re-syncing or adding/removing courses", async () => {
    const app = await buildApp();

    const admin = await signIn(app, "sync-admin@example.com");
    const org = await createOrg(app, admin.token, "Sync Org");

    // Create 3 courses
    const c1Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: admin.token },
      payload: { title: "Course 1", subject: "Math" },
    });
    const c1 = JSON.parse(c1Res.body).course;

    const c2Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: admin.token },
      payload: { title: "Course 2", subject: "Physics" },
    });
    const c2 = JSON.parse(c2Res.body).course;

    const c3Res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: admin.token },
      payload: { title: "Course 3", subject: "Chemistry" },
    });
    const c3 = JSON.parse(c3Res.body).course;

    const student = await signIn(app, "sync-student@example.com");
    await setOrgMembershipRole(student.userId, org.id, "student");

    // Student enrolls in Course 1 and Course 2 via sync
    const sync1 = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: student.token },
      payload: { course_ids: [c1.id, c2.id] },
    });
    expect(sync1.statusCode).toBe(200);

    // Student sets exam date for Course 1
    const examDateC1 = "2026-11-20T10:00:00.000Z";
    const setExamRes = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/${c1.id}/exam-schedule`,
      cookies: { avana_session: student.token },
      payload: { exam_at: examDateC1 },
    });
    expect(setExamRes.statusCode).toBe(200);

    // Re-sync: Student retains Course 1, drops Course 2, and adds Course 3
    const sync2 = await app.inject({
      method: "PUT",
      url: `/v1/organizations/${org.id}/courses/my`,
      cookies: { avana_session: student.token },
      payload: { course_ids: [c1.id, c3.id] },
    });
    expect(sync2.statusCode).toBe(200);
    const sync2Items = JSON.parse(sync2.body).items as Array<{ id: string; exam_at: string | null }>;

    const itemC1 = sync2Items.find((i) => i.id === c1.id);
    const itemC3 = sync2Items.find((i) => i.id === c3.id);
    const itemC2 = sync2Items.find((i) => i.id === c2.id);

    expect(itemC1).toBeDefined();
    // CRITICAL: Course 1 exam date is preserved and NOT wiped by sync!
    expect(itemC1?.exam_at).toBe(examDateC1);

    expect(itemC3).toBeDefined();
    expect(itemC3?.exam_at).toBeNull();

    // Course 2 was removed from student's courses
    expect(itemC2).toBeUndefined();

    await app.close();
  });

  it("popular courses: official exam date is NOT exposed as personal exam_at", async () => {
    const app = await buildApp();

    const admin = await signIn(app, "pop-admin@example.com");
    const org = await createOrg(app, admin.token, "Popular Org");

    const officialDate = "2026-12-30T10:00:00.000Z";
    const courseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: admin.token },
      payload: { title: "Popular Course", subject: "Bio", exam_at: officialDate },
    });
    const createdCourse = JSON.parse(courseRes.body).course;
    const courseRecord = courseStore.courses.get(createdCourse.id);
    if (courseRecord) courseRecord.status = "published";

    const student = await signIn(app, "pop-student@example.com");
    await setOrgMembershipRole(student.userId, org.id, "student");

    const popRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/popular`,
      cookies: { avana_session: student.token },
    });
    expect(popRes.statusCode).toBe(200);
    const popItems = JSON.parse(popRes.body).items;
    expect(popItems.length).toBeGreaterThan(0);
    const popCourse = popItems[0];

    // Personal exam_at MUST be null; official_exam_at holds the official course exam
    expect(popCourse.exam_at).toBeNull();
    expect(popCourse.official_exam_at).toBe(officialDate);

    await app.close();
  });

  it("admin vs student permissions for official course exam modification", async () => {
    const app = await buildApp();

    const admin = await signIn(app, "admin-perm@example.com");
    const org = await createOrg(app, admin.token, "Perm Org");
    await setOrgMembershipRole(admin.userId, org.id, "organization_admin");

    const initialOfficialDate = "2026-10-15T08:00:00.000Z";
    const courseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: admin.token },
      payload: {
        title: "Official Exam Course",
        subject: "Biology",
        exam_at: initialOfficialDate,
      },
    });
    const course = JSON.parse(courseRes.body).course;
    expect(course.official_exam_at).toBe(initialOfficialDate);

    const student = await signIn(app, "student-perm@example.com");
    await setOrgMembershipRole(student.userId, org.id, "student");
    await courseStore.addUserCourse(student.userId as UserId, course.id as unknown as CourseId);

    // 1. Regular student PATCH: setting exam_at only updates student's personal schedule, NOT official exam
    const studentExamDate = "2026-11-05T09:00:00.000Z";
    const studentPatchRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: student.token },
      payload: { exam_at: studentExamDate },
    });
    expect(studentPatchRes.statusCode).toBe(200);
    const studentCourse = JSON.parse(studentPatchRes.body).course;
    expect(studentCourse.exam_at).toBe(studentExamDate);
    expect(studentCourse.official_exam_at).toBe(initialOfficialDate);

    // Verify official course exam in database was NOT changed by student
    const checkCourse = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: admin.token },
    });
    expect(JSON.parse(checkCourse.body).course.official_exam_at).toBe(initialOfficialDate);

    // 2. Regular student PATCH title: Forbidden (403)
    const studentHackRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: student.token },
      payload: { title: "Unauthorized Title Change" },
    });
    expect(studentHackRes.statusCode).toBe(403);

    // 3. Manager/Admin with course:update: can update the official course exam date
    const newOfficialDate = "2026-12-25T14:00:00.000Z";
    const adminUpdateRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: admin.token },
      payload: { exam_at: newOfficialDate },
    });
    expect(adminUpdateRes.statusCode).toBe(200);
    const adminUpdatedCourse = JSON.parse(adminUpdateRes.body).course;
    expect(adminUpdatedCourse.official_exam_at).toBe(newOfficialDate);

    // 4. Verify student now sees updated official_exam_at, while their personal exam_at remains untouched
    const studentViewRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${org.id}/courses/${course.id}`,
      cookies: { avana_session: student.token },
    });
    const studentView = JSON.parse(studentViewRes.body).course;
    expect(studentView.exam_at).toBe(studentExamDate);
    expect(studentView.official_exam_at).toBe(newOfficialDate);

    await app.close();
  });
});
