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
import type { StorageProvider, StoredFile, UploadIntent } from "../modules/storage/storage-provider.js";
import { randomUUID } from "node:crypto";

class InMemoryStorageProvider implements StorageProvider {
  public files = new Map<string, Buffer>();

  async createUpload(options: { storageKey: string; mimeType: string }): Promise<UploadIntent> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error(`File not found: ${storageKey}`);
    return data;
  }
}

describe("Classroom Assignment (تکلیف کلاسی) — Backend Lifecycle Test Suite", () => {
  let app: ReturnType<typeof createApp>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let sessionService: SessionService;
  let storageProvider: InMemoryStorageProvider;

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
    storageProvider = new InMemoryStorageProvider();

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
      undefined,
      undefined,
      storageProvider,
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
      storageProvider,
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

    test("Teacher successfully retrieves submissions list for valid assignment (200 OK, zero submissions & enrolled roster)", async () => {
      const teacher = await createUserWithRole("teacher_submissions_ok@avana.org", Roles.teacher);
      const student1 = await createUserWithRole("student_sub1@avana.org", Roles.student, orgId, "سینا صادقی");
      const student2 = await createUserWithRole("student_sub2@avana.org", Roles.student, orgId, "نیما کاظمی");

      // 1. Create classroom
      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس آمار و احتمال" },
      });
      expect(classRes.statusCode).toBe(201);
      const classroom = classRes.json().classroom;

      // 2. Students join classroom
      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student1.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });
      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student2.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // 3. Create published assignment
      const now = new Date();
      const inThreeDays = new Date(now.getTime() + 3 * 86400000);
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "تمرین متغیرهای تصادفی",
          startsAt: now.toISOString(),
          dueAt: inThreeDays.toISOString(),
          status: "published",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const assignmentId = createRes.json().assignment.id;

      // 4. Teacher queries GET /v1/teacher/assignments/:assignmentId/submissions
      const submissionsRes = await app.inject({
        method: "GET",
        url: `/v1/teacher/assignments/${assignmentId}/submissions`,
        cookies: { avana_session: teacher.sessionToken },
      });

      expect(submissionsRes.statusCode).toBe(200);
      const body = submissionsRes.json();
      expect(body.assignment).toBeDefined();
      expect(body.assignment.id).toBe(assignmentId);
      expect(body.assignment.title).toBe("تمرین متغیرهای تصادفی");
      expect(body.stats).toEqual({
        submittedCount: 0,
        totalStudentsCount: 2,
      });
      expect(body.submissions).toHaveLength(2);
      expect(body.submissions[0].submitted).toBe(false);
      expect(body.submissions[0].submission).toBeNull();
      expect(body.submissions[1].submitted).toBe(false);
      expect(body.submissions[1].submission).toBeNull();
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

    test("Rich Submission: Supports long text (multi-paragraph), file attachment only, and text + file attachment", async () => {
      const teacher = await createUserWithRole("teacher60@avana.org", Roles.teacher);
      const student = await createUserWithRole("student60@avana.org", Roles.student);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس پروژه تحقیقاتی" },
      });
      const classroom = classRes.json().classroom;

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const now = new Date();
      const assignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "ارسال پروژه پایان‌ترم",
          description: "لطفاً گزارش متنی یا فایل PDF پروژه را ارسال فرمایید.",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          status: "published",
        },
      });
      const assignmentId = assignRes.json().assignment.id;

      // 1. Validation: Fails if both text and attachment are empty
      const emptyRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: { answerText: "   " },
      });
      expect(emptyRes.statusCode).toBe(400);
      expect(emptyRes.json().error.message).toContain("متن پاسخ یا فایل پیوست");

      // 2. Long text submission (e.g. 5,000 characters)
      const longText = "پاراگراف اول پاسخ دانشجو به صورت کاملاً تشریحی و مبسوط.\n\n" + "الف".repeat(4900);
      const longTextRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: { answerText: longText },
      });
      expect(longTextRes.statusCode).toBe(201);
      expect(longTextRes.json().submission.answerText).toBe(longText);

      // 3. File only submission (without text)
      const fileOnlyRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          answerText: "",
          attachmentUrl: "/v1/student/assignments/attachments/assignments%2Fproject-report.pdf",
          attachmentName: "project-report.pdf",
          attachmentSizeBytes: 2048576,
        },
      });
      expect(fileOnlyRes.statusCode).toBe(201);
      expect(fileOnlyRes.json().submission.attachmentUrl).toBe(
        "/v1/student/assignments/attachments/assignments%2Fproject-report.pdf",
      );
      expect(fileOnlyRes.json().submission.attachmentName).toBe("project-report.pdf");
      expect(fileOnlyRes.json().submission.attachmentSizeBytes).toBe(2048576);

      // 4. Combined submission: Long text + file attachment
      const combinedRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          answerText: "این متن توضیحات پروژه است و فایل پیوست در ضمیمه ارسال شده است.",
          attachmentUrl: "/v1/student/assignments/attachments/assignments%2Fproject-final.zip",
          attachmentName: "project-final.zip",
          attachmentSizeBytes: 10485760,
        },
      });
      expect(combinedRes.statusCode).toBe(201);
      const sub = combinedRes.json().submission;
      expect(sub.answerText).toBe("این متن توضیحات پروژه است و فایل پیوست در ضمیمه ارسال شده است.");
      expect(sub.attachmentUrl).toBe("/v1/student/assignments/attachments/assignments%2Fproject-final.zip");
      expect(sub.attachmentName).toBe("project-final.zip");
      expect(sub.attachmentSizeBytes).toBe(10485760);

      // 5. Verify Student details endpoint returns attachment metadata
      const studentDetailsRes = await app.inject({
        method: "GET",
        url: `/v1/student/assignments/${assignmentId}`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(studentDetailsRes.statusCode).toBe(200);
      expect(studentDetailsRes.json().submission.attachmentName).toBe("project-final.zip");

      // 6. Verify Teacher submissions drawer endpoint returns student's attachment
      const teacherSubmissionsRes = await app.inject({
        method: "GET",
        url: `/v1/teacher/assignments/${assignmentId}/submissions`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(teacherSubmissionsRes.statusCode).toBe(200);
      const teacherSubmissions = teacherSubmissionsRes.json().submissions as Array<{
        studentId: string;
        submitted: boolean;
        submission?: { attachmentName: string; attachmentUrl: string };
      }>;
      const teacherSubItem = teacherSubmissions.find(
        (s) => s.studentId === student.user.id,
      );
      expect(teacherSubItem?.submitted).toBe(true);
      expect(teacherSubItem?.submission?.attachmentName).toBe("project-final.zip");
      expect(teacherSubItem?.submission?.attachmentUrl).toBe(
        "/v1/student/assignments/attachments/assignments%2Fproject-final.zip",
      );
    });
  });

  // =========================================================================
  // 4. Attachment Security, Authorization & IDOR Matrix
  // =========================================================================
  describe("Attachment Security, Authorization & IDOR Matrix", () => {
    test("Uploads attachment, validates namespace, and enforces strict IDOR matrix", async () => {
      const teacherA = await createUserWithRole("teacher.math@avana.org", Roles.teacher);
      const teacherB = await createUserWithRole("teacher.chem@avana.org", Roles.teacher);
      const studentA = await createUserWithRole("student.alice@avana.org", Roles.student, orgId, "آلیس رضایی");
      const studentB = await createUserWithRole("student.bob@avana.org", Roles.student, orgId, "بابک حسینی");
      const platformAdmin = await createUserWithRole("admin@avana.org", Roles.platform_admin);

      // Teacher A creates classroom A
      const classResA = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacherA.sessionToken },
        payload: { title: "کلاس ریاضی پیشرفته" },
      });
      const classroomA = classResA.json().classroom;

      // Teacher B creates classroom B
      const classResB = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacherB.sessionToken },
        payload: { title: "کلاس شیمی تخصصی" },
      });
      const classroomB = classResB.json().classroom;

      // Student A joins Classroom A
      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { inviteCode: classroomA.inviteCode },
      });

      // Student B joins Classroom B
      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: studentB.sessionToken },
        payload: { inviteCode: classroomB.inviteCode },
      });

      // Teacher A creates assignment in classroom A
      const now = new Date();
      const assignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroomA.id}/assignments`,
        cookies: { avana_session: teacherA.sessionToken },
        payload: {
          title: "پروژه حساب دیفرانسیل",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          status: "published",
        },
      });
      const assignmentId = assignRes.json().assignment.id;

      // 1. Student A uploads attachment
      // eslint-disable-next-line no-secrets/no-secrets
      const boundary = "----WebKitFormBoundaryAssignmentTest123";
      const fileContent = "This is Student A homework PDF file content.";
      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="calculus_report.pdf"',
        "Content-Type: application/pdf",
        "",
        fileContent,
        `--${boundary}--`,
      ].join("\r\n");

      const uploadRes = await app.inject({
        method: "POST",
        url: "/v1/student/assignments/attachments",
        cookies: { avana_session: studentA.sessionToken },
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: multipartBody,
      });

      expect(uploadRes.statusCode).toBe(201);
      const uploadData = uploadRes.json();
      expect(uploadData.storage_key).toContain(`assignments/${studentA.user.id}/`);
      expect(uploadData.attachment_name).toBe("calculus_report.pdf");

      const attachmentUrl = uploadData.attachment_url;
      const storageKey = uploadData.storage_key;

      // Verify file is saved in storageProvider
      expect(storageProvider.files.has(storageKey)).toBe(true);

      // 2. Student A (owner) can download/stream the file before submitting
      const studentADownloadPreRes = await app.inject({
        method: "GET",
        url: attachmentUrl,
        cookies: { avana_session: studentA.sessionToken },
      });
      expect(studentADownloadPreRes.statusCode).toBe(200);
      expect(studentADownloadPreRes.body).toBe(fileContent);
      expect(studentADownloadPreRes.headers["content-type"]).toBe("application/pdf");

      // 3. Student B (intruder) tries to download Student A's attachment -> 403 Forbidden
      const studentBDownloadPreRes = await app.inject({
        method: "GET",
        url: attachmentUrl,
        cookies: { avana_session: studentB.sessionToken },
      });
      expect(studentBDownloadPreRes.statusCode).toBe(403);
      expect(studentBDownloadPreRes.json().error.message).toContain("اجازه دسترسی");

      // 4. Student A submits answer with this attachment
      const submitRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: studentA.sessionToken },
        payload: {
          answerText: "پاسخ تمرینات حساب دیفرانسیل ضمیمه گردید.",
          attachmentUrl: uploadData.attachment_url,
          attachmentName: uploadData.attachment_name,
          attachmentSizeBytes: uploadData.attachment_size_bytes,
        },
      });
      expect(submitRes.statusCode).toBe(201);

      // 5. Teacher A (authorized classroom teacher) downloads Student A's attachment -> 200 OK
      const teacherADownloadRes = await app.inject({
        method: "GET",
        url: attachmentUrl,
        cookies: { avana_session: teacherA.sessionToken },
      });
      expect(teacherADownloadRes.statusCode).toBe(200);
      expect(teacherADownloadRes.body).toBe(fileContent);

      // 6. Teacher B (unauthorized teacher from another classroom) tries to download -> 403 Forbidden
      const teacherBDownloadRes = await app.inject({
        method: "GET",
        url: attachmentUrl,
        cookies: { avana_session: teacherB.sessionToken },
      });
      expect(teacherBDownloadRes.statusCode).toBe(403);
      expect(teacherBDownloadRes.json().error.message).toContain("اجازه دسترسی");

      // 7. Platform Admin downloads attachment -> 200 OK
      const adminDownloadRes = await app.inject({
        method: "GET",
        url: attachmentUrl,
        cookies: { avana_session: platformAdmin.sessionToken },
      });
      expect(adminDownloadRes.statusCode).toBe(200);
      expect(adminDownloadRes.body).toBe(fileContent);

      // 8. Unauthenticated request -> 401 Unauthorized
      const unauthDownloadRes = await app.inject({
        method: "GET",
        url: attachmentUrl,
      });
      expect(unauthDownloadRes.statusCode).toBe(401);

      // 9. Path traversal attempt -> 400 Bad Request
      const traversalRes = await app.inject({
        method: "GET",
        url: "/v1/student/assignments/attachments/assignments%2F..%2F..%2Fetc%2Fpasswd",
        cookies: { avana_session: studentA.sessionToken },
      });
      expect(traversalRes.statusCode).toBe(400);
      expect(traversalRes.json().error.message).toContain("مسیر فایل نامعتبر");
    });

    test("File Lifecycle: cleans up orphaned storage files when attachment is replaced or removed", async () => {
      const teacher = await createUserWithRole("teacher.lifecycle@avana.org", Roles.teacher);
      const student = await createUserWithRole("student.lifecycle@avana.org", Roles.student);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس فیزیک هسته‌ای" },
      });
      const classroom = classRes.json().classroom;

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const now = new Date();
      const assignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "پروژه رآکتور",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          status: "published",
        },
      });
      const assignmentId = assignRes.json().assignment.id;

      // 1. Upload File 1
      const boundary = "----WebKitFormBoundaryLifecycle1";
      const file1Body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="version1.pdf"',
        "Content-Type: application/pdf",
        "",
        "Version 1 content",
        `--${boundary}--`,
      ].join("\r\n");

      const up1 = await app.inject({
        method: "POST",
        url: "/v1/student/assignments/attachments",
        cookies: { avana_session: student.sessionToken },
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: file1Body,
      });
      const data1 = up1.json();
      expect(storageProvider.files.has(data1.storage_key)).toBe(true);

      // Submit with File 1
      await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          answerText: "پاسخ نسخه ۱",
          attachmentUrl: data1.attachment_url,
          attachmentName: data1.attachment_name,
          attachmentSizeBytes: data1.attachment_size_bytes,
        },
      });

      // 2. Upload File 2
      const boundary2 = "----WebKitFormBoundaryLifecycle2";
      const file2Body = [
        `--${boundary2}`,
        'Content-Disposition: form-data; name="file"; filename="version2.pdf"',
        "Content-Type: application/pdf",
        "",
        "Version 2 updated content",
        `--${boundary2}--`,
      ].join("\r\n");

      const up2 = await app.inject({
        method: "POST",
        url: "/v1/student/assignments/attachments",
        cookies: { avana_session: student.sessionToken },
        headers: { "content-type": `multipart/form-data; boundary=${boundary2}` },
        payload: file2Body,
      });
      const data2 = up2.json();
      expect(storageProvider.files.has(data2.storage_key)).toBe(true);

      // Update submission with File 2 (replaces File 1)
      await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          answerText: "پاسخ نسخه ۲ (اصلاح شده)",
          attachmentUrl: data2.attachment_url,
          attachmentName: data2.attachment_name,
          attachmentSizeBytes: data2.attachment_size_bytes,
        },
      });

      // Assert: File 1 was cleaned up from storage, File 2 remains
      expect(storageProvider.files.has(data1.storage_key)).toBe(false);
      expect(storageProvider.files.has(data2.storage_key)).toBe(true);

      // 3. Update submission without attachment (text only)
      await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          answerText: "پاسخ نهایی فقط متنی",
          attachmentUrl: null,
          attachmentName: null,
          attachmentSizeBytes: null,
        },
      });

      // Assert: File 2 was also cleaned up from storage
      expect(storageProvider.files.has(data2.storage_key)).toBe(false);
    });
  });

  // =========================================================================
  // 5. 50,000 Character Boundary Enforcement
  // =========================================================================
  describe("50,000 Character Boundary Tests", () => {
    test("Accepts exactly 50,000 characters and rejects 50,001 characters", async () => {
      const teacher = await createUserWithRole("teacher.boundary@avana.org", Roles.teacher);
      const student = await createUserWithRole("student.boundary@avana.org", Roles.student);

      const classRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس ادبیات کنکور" },
      });
      const classroom = classRes.json().classroom;

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const now = new Date();
      const assignRes = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "نگارش مقاله تحلیلی شاهنامه",
          startsAt: now.toISOString(),
          dueAt: new Date(now.getTime() + 86400000).toISOString(),
          status: "published",
        },
      });
      const assignmentId = assignRes.json().assignment.id;

      // 1. Exactly 15,000 characters (Persian characters)
      const exact15k = "ا".repeat(15000);
      expect(exact15k.length).toBe(15000);

      const valid15kRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: { answerText: exact15k },
      });
      expect(valid15kRes.statusCode).toBe(201);
      expect(valid15kRes.json().submission.answerText.length).toBe(15000);
      expect(valid15kRes.json().submission.answerText).toBe(exact15k);

      // 2. 15,001 characters (exceeds limit by 1)
      const excess15k1 = "ا".repeat(15001);
      expect(excess15k1.length).toBe(15001);

      const invalid15kRes = await app.inject({
        method: "POST",
        url: `/v1/student/assignments/${assignmentId}/submit`,
        cookies: { avana_session: student.sessionToken },
        payload: { answerText: excess15k1 },
      });
      expect(invalid15kRes.statusCode).toBe(400);
      expect(invalid15kRes.json().error.message).toContain("۱۵٬۰۰۰ کاراکتر");
    });

    test("Attachment File Size Boundary: Accepts exactly 20MB (20,971,520 bytes) and rejects 20MB + 1 byte", async () => {
      const student = await createUserWithRole("student.boundary@avana.org", Roles.student, orgId, "دانش‌آموز تست سایز");

      // eslint-disable-next-line no-secrets/no-secrets
      const boundary = "----WebKitFormBoundarySizeTest123";

      // 1. Exactly 20MB (20 * 1024 * 1024 bytes)
      const exact20MBBuffer = Buffer.alloc(20 * 1024 * 1024, "a");
      const validMultipart = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.pdf"',
        "Content-Type: application/pdf",
        "",
        exact20MBBuffer.toString("binary"),
        `--${boundary}--`,
      ].join("\r\n");

      const validRes = await app.inject({
        method: "POST",
        url: "/v1/student/assignments/attachments",
        cookies: { avana_session: student.sessionToken },
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: Buffer.from(validMultipart, "binary"),
      });

      expect(validRes.statusCode).toBe(201);
      expect(validRes.json().attachment_size_bytes).toBe(20 * 1024 * 1024);

      // 2. Exactly 20MB + 1 byte (20,971,521 bytes)
      const excess20MBBuffer = Buffer.alloc(20 * 1024 * 1024 + 1, "a");
      const invalidMultipart = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test2.pdf"',
        "Content-Type: application/pdf",
        "",
        excess20MBBuffer.toString("binary"),
        `--${boundary}--`,
      ].join("\r\n");

      const invalidRes = await app.inject({
        method: "POST",
        url: "/v1/student/assignments/attachments",
        cookies: { avana_session: student.sessionToken },
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: Buffer.from(invalidMultipart, "binary"),
      });

      expect(invalidRes.statusCode).toBe(413);
    });
  });
});
