import { describe, test, expect, beforeEach } from "vitest";
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
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
} from "@avana/domain";
import {
  InMemoryClassroomStore,
  InMemoryClassroomMemberStore,
  InMemoryTeacherExamStore,
  InMemoryTeacherExamQuestionStore,
  InMemoryTeacherExamAttemptStore,
  InMemoryTeacherExamAttemptAnswerStore,
  InMemoryAssignmentStore,
  InMemoryAssignmentSubmissionStore,
  AssignmentService,
} from "../modules/teacher-platform/index.js";
import { randomUUID } from "node:crypto";

describe("Classroom Assignment (تکلیف کلاسی) — Backend Lifecycle Test Suite", () => {
  let app: ReturnType<typeof createApp>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let sessionService: SessionService;

  let classroomStore: InMemoryClassroomStore;
  let memberStore: InMemoryClassroomMemberStore;
  let teacherExamStore: InMemoryTeacherExamStore;
  let teacherExamQuestionStore: InMemoryTeacherExamQuestionStore;
  let teacherExamAttemptStore: InMemoryTeacherExamAttemptStore;
  let teacherExamAttemptAnswerStore: InMemoryTeacherExamAttemptAnswerStore;
  let assignmentStore: InMemoryAssignmentStore;
  let assignmentSubmissionStore: InMemoryAssignmentSubmissionStore;
  let assignmentService: AssignmentService;

  const orgId = "11111111-1111-4111-8111-111111111111" as OrganizationId;
  const otherOrgId = "22222222-2222-4222-8222-222222222222" as OrganizationId;

  async function createUserWithRole(
    email: string,
    role: Role,
    organizationId: OrganizationId = orgId,
    name: string = "Test User",
  ) {
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "hashed-pass",
      name,
    });

    if (role === Roles.platform_admin || role === Roles.content_worker) {
      user.globalRole = role;
      user.role = role;
      userStore.insert({ ...user });
    }

    orgStore.addMembership({
      id: randomUUID(),
      organizationId,
      userId: user.id as UserId,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const session = await sessionService.createSession(user.id);
    return { user, sessionToken: session.sessionToken, orgId: organizationId };
  }

  beforeEach(async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = orgId;

    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    sessionService = new SessionService(sessionStore, config.session);

    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    teacherExamStore = new InMemoryTeacherExamStore();
    teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();
    teacherExamAttemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();
    assignmentStore = new InMemoryAssignmentStore();
    assignmentSubmissionStore = new InMemoryAssignmentSubmissionStore();

    assignmentService = new AssignmentService(
      assignmentStore,
      assignmentSubmissionStore,
      classroomStore,
      memberStore,
      orgStore,
      userStore,
    );

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      classroomStore,
      classroomMemberStore: memberStore,
      teacherExamStore,
      teacherExamQuestionStore,
      teacherExamAttemptStore,
      teacherExamAttemptAnswerStore,
      assignmentStore,
      assignmentSubmissionStore,
      assignmentService,
    });
  });

  // =========================================================================
  // 1. Teacher Assignment CRUD & Workflow
  // =========================================================================
  describe("Teacher Assignment Management", () => {
    test("Teacher creates draft assignment, updates it, and publishes it", async () => {
      const teacher = await createUserWithRole("teacher@avana.org", Roles.teacher);

      // Create classroom
      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس فیزیک کنکور" },
      });
      expect(classRes.statusCode).toBe(201);
      const classroomId = classRes.json().classroom.id;

      // Create draft assignment
      const now = new Date();
      const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تمرین مبحث حرکت‌شناسی",
          description: "حل ۱۰ تست سطح پیشرفته",
          startsAt: now.toISOString(),
          dueAt: inFiveDays.toISOString(),
          status: "draft",
        },
      });

      expect(createRes.statusCode).toBe(201);
      const assignment = createRes.json().assignment;
      expect(assignment.title).toBe("تمرین مبحث حرکت‌شناسی");
      expect(assignment.status).toBe("draft");
      expect(assignment.classroomId).toBe(classroomId);

      // Update and publish assignment
      const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const updateRes = await app.inject({
        method: "PUT",
        url: `/v1/teacher/assignments/${assignment.id}`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تمرین مبحث حرکت‌شناسی و دینامیک",
          dueAt: inSevenDays.toISOString(),
          status: "published",
        },
      });

      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().assignment.title).toBe("تمرین مبحث حرکت‌شناسی و دینامیک");
      expect(updateRes.json().assignment.status).toBe("published");

      // List classroom assignments
      const listRes = await app.inject({
        method: "GET",
        url: `/v1/teacher/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
      });

      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().assignments).toHaveLength(1);
      expect(listRes.json().assignments[0].id).toBe(assignment.id);
    });

    test("Prevents teacher IDOR: Teacher B cannot view or edit Teacher A's assignment", async () => {
      const teacherA = await createUserWithRole("teachera@avana.org", Roles.teacher);
      const teacherB = await createUserWithRole("teacherb@avana.org", Roles.teacher);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacherA.sessionToken },
        payload: { title: "کلاس استاد الف" },
      });
      const classroomId = classRes.json().classroom.id;

      const now = new Date();
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: teacherA.sessionToken },
        payload: {
          title: "تکلیف ۱",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          status: "published",
        },
      });
      const assignmentId = createRes.json().assignment.id;

      // Teacher B attempts to view Teacher A's assignment submissions
      const idorViewRes = await app.inject({
        method: "GET",
        url: `/v1/teacher/assignments/${assignmentId}/submissions`,
        cookies: { avana_session: teacherB.sessionToken },
      });
      expect(idorViewRes.statusCode).toBe(404);

      // Teacher B attempts to update Teacher A's assignment
      const idorUpdateRes = await app.inject({
        method: "PUT",
        url: `/v1/teacher/assignments/${assignmentId}`,
        cookies: { avana_session: teacherB.sessionToken },
        payload: { title: "Hacked title" },
      });
      expect(idorUpdateRes.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // 2. Student Assignment Access & Submission Flow
  // =========================================================================
  describe("Student Assignment Access & Submissions", () => {
    test("Student joins classroom, views assignments, submits answer and resubmits before deadline", async () => {
      const teacher = await createUserWithRole("teacher10@avana.org", Roles.teacher);
      const student = await createUserWithRole("student10@avana.org", Roles.student, orgId, "علی رضایی");

      // Teacher creates classroom
      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "زیست‌شناسی پایه یازدهم" },
      });
      const classroom = classRes.json().classroom;

      // Student joins classroom with invite code
      const joinRes = await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });
      expect(joinRes.statusCode).toBe(200);

      // Teacher creates published assignment
      const now = new Date();
      const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const assignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "گزارش آزمایشگاه بافت‌شناسی",
          description: "متن گزارش مشاهده میکروسکوپی لام شماره ۳ را ارسال نمایید.",
          startsAt: new Date(now.getTime() - 10000).toISOString(),
          dueAt: inThreeDays.toISOString(),
          status: "published",
        },
      });
      const assignmentId = assignRes.json().assignment.id;

      // Student lists assignments for this classroom
      const listRes = await app.inject({
        method: "GET",
        url: `/v1/student/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().assignments).toHaveLength(1);
      expect(listRes.json().assignments[0].hasSubmitted).toBe(false);
      expect(listRes.json().assignments[0].studentStatus).toBe("can_submit");

      // Student views single assignment details
      const detailRes = await app.inject({
        method: "GET",
        url: `/v1/student/assignments/${assignmentId}`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.json().canSubmit).toBe(true);
      expect(detailRes.json().submission).toBeNull();

      // Student submits answer
      const submitRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          answerText: "سلول‌های اپی‌تلیال سنگفرشی به وضوح با رنگ‌آمیزی هماتوکسیلین قابل تشخیص بودند.",
        },
      });
      expect(submitRes.statusCode).toBe(201);
      expect(submitRes.json().submission.answerText).toContain("سلول‌های اپی‌تلیال");

      // Student updates/resubmits answer before deadline
      const resubmitRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          answerText: "پاسخ ویرایش شده: جزئیات هسته و غشای پایه نیز اضافه شد.",
        },
      });
      expect(resubmitRes.statusCode).toBe(201);
      expect(resubmitRes.json().submission.answerText).toContain("پاسخ ویرایش شده");

      // Teacher views submissions
      const submissionsRes = await app.inject({
        method: "GET",
        url: `/v1/teacher/assignments/${assignmentId}/submissions`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(submissionsRes.statusCode).toBe(200);
      const body = submissionsRes.json();
      expect(body.stats.totalStudentsCount).toBe(1);
      expect(body.stats.submittedCount).toBe(1);
      expect(body.submissions[0].submitted).toBe(true);
      expect(body.submissions[0].studentName).toBe("علی رضایی");
      expect(body.submissions[0].submission.answerText).toContain("پاسخ ویرایش شده");
    });

    test("Non-enrolled student is blocked from accessing or submitting assignment", async () => {
      const teacher = await createUserWithRole("teacher20@avana.org", Roles.teacher);
      const studentNonMember = await createUserWithRole("intruder@avana.org", Roles.student);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "شیمی آلی" },
      });
      const classroomId = classRes.json().classroom.id;

      const now = new Date();
      const assignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تمرین واکنش آلکین‌ها",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          status: "published",
        },
      });
      const assignmentId = assignRes.json().assignment.id;

      // Non-member student tries to list classroom assignments
      const listRes = await app.inject({
        method: "GET",
        url: `/v1/student/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: studentNonMember.sessionToken },
      });
      expect(listRes.statusCode).toBe(403);

      // Non-member student tries to submit
      const submitRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: studentNonMember.sessionToken },
        payload: { answerText: "Illegal attempt" },
      });
      expect(submitRes.statusCode).toBe(403);
    });

    test("Enforces deadline window: blocks submission before startsAt and after dueAt", async () => {
      const teacher = await createUserWithRole("teacher30@avana.org", Roles.teacher);
      const student = await createUserWithRole("student30@avana.org", Roles.student);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "هندسه تحلیلی" },
      });
      const classroom = classRes.json().classroom;

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // 1. Future assignment (startsAt in the future)
      const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const futureDue = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const futureAssignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تکلیف آینده",
          startsAt: futureStart.toISOString(),
          dueAt: futureDue.toISOString(),
          status: "published",
        },
      });
      const futureAssignId = futureAssignRes.json().assignment.id;

      const earlySubmitRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${futureAssignId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: { answerText: "Too early" },
      });
      expect(earlySubmitRes.statusCode).toBe(400);
      expect(earlySubmitRes.json().error.message).toContain("هنوز فرا نرسیده است");

      // 2. Expired assignment (dueAt in the past)
      const pastStart = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const pastDue = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pastAssignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تکلیف منقضی‌شده",
          startsAt: pastStart.toISOString(),
          dueAt: pastDue.toISOString(),
          status: "published",
        },
      });
      const pastAssignId = pastAssignRes.json().assignment.id;

      const lateSubmitRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${pastAssignId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: { answerText: "Too late" },
      });
      expect(lateSubmitRes.statusCode).toBe(400);
      expect(lateSubmitRes.json().error.message).toContain("مهلت ارسال");
    });
  });

  // =========================================================================
  // 3. Assignment Status Transitions (Publish, Unpublish, Archive, Delete)
  // =========================================================================
  describe("Assignment Status Transitions & Lifecycle", () => {
    test("Full lifecycle: draft -> publish -> unpublish -> archive -> delete", async () => {
      const teacher = await createUserWithRole("teacher40@avana.org", Roles.teacher);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس ادبیات فارسی" },
      });
      const classroomId = classRes.json().classroom.id;

      const now = new Date();
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تحلیل آرایه‌های ادبی غزل حافظ",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          status: "draft",
        },
      });
      const assignmentId = createRes.json().assignment.id;

      // 1. Publish
      const pubRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/assignments/${assignmentId}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(pubRes.statusCode).toBe(200);
      expect(pubRes.json().assignment.status).toBe("published");

      // 2. Unpublish
      const unpubRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/assignments/${assignmentId}/unpublish`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(unpubRes.statusCode).toBe(200);
      expect(unpubRes.json().assignment.status).toBe("draft");

      // 3. Archive
      const archRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/assignments/${assignmentId}/archive`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(archRes.statusCode).toBe(200);
      expect(archRes.json().assignment.status).toBe("archived");
      expect(archRes.json().assignment.archivedAt).toBeTruthy();

      // 4. Delete
      const delRes = await app.inject({
        method: "DELETE",
        url: `/v1/teacher/assignments/${assignmentId}`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(delRes.statusCode).toBe(204);

      // Verify assignment is gone
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/teacher/assignments/${assignmentId}`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(getRes.statusCode).toBe(404);
    });

    test("Validation: Rejects invalid inputs (empty title, dueAt <= startsAt)", async () => {
      const teacher = await createUserWithRole("teacher50@avana.org", Roles.teacher);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس شیمی کنکور" },
      });
      const classroomId = classRes.json().classroom.id;

      const now = new Date();

      // Short / empty title
      const invalidTitleRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "a",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
        },
      });
      expect(invalidTitleRes.statusCode).toBe(400);

      // dueAt <= startsAt
      const invalidDatesRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroomId}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تکلیف نامعتبر",
          startsAt: new Date(now.getTime() + 86400000).toISOString(),
          dueAt: now.toISOString(),
        },
      });
      expect(invalidDatesRes.statusCode).toBe(400);
      expect(invalidDatesRes.json().error.message).toContain("مهلت ارسال");
    });
  });
});
