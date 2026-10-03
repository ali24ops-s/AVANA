import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import {
  InMemoryClassroomStore,
  InMemoryClassroomMemberStore,
  InMemoryTeacherExamStore,
  InMemoryTeacherExamQuestionStore,
  InMemoryTeacherExamAttemptStore,
  InMemoryTeacherExamAttemptAnswerStore,
  InMemoryAssignmentStore,
  InMemoryAssignmentSubmissionStore,
  ClassroomService,
  TeacherExamService,
  AssignmentService,
} from "../modules/teacher-platform/index.js";
import { asUserId, asOrganizationId, type OrganizationId, type Role } from "@avana/domain";

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

describe("Classroom Student Notifications Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let orgStore: InMemoryOrganizationStore;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;

  let classroomStore: InMemoryClassroomStore;
  let memberStore: InMemoryClassroomMemberStore;
  let examStore: InMemoryTeacherExamStore;
  let questionStore: InMemoryTeacherExamQuestionStore;
  let attemptStore: InMemoryTeacherExamAttemptStore;
  let attemptAnswerStore: InMemoryTeacherExamAttemptAnswerStore;
  let assignmentStore: InMemoryAssignmentStore;
  let submissionStore: InMemoryAssignmentSubmissionStore;

  let classroomService: ClassroomService;
  let examService: TeacherExamService;
  let assignmentService: AssignmentService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    orgStore = new InMemoryOrganizationStore();
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);

    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    examStore = new InMemoryTeacherExamStore();
    questionStore = new InMemoryTeacherExamQuestionStore();
    attemptStore = new InMemoryTeacherExamAttemptStore();
    attemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();
    assignmentStore = new InMemoryAssignmentStore();
    submissionStore = new InMemoryAssignmentSubmissionStore();

    classroomStore.examStore = examStore;
    classroomStore.attemptStore = attemptStore;
    teacherExamStoreWiring(examStore, questionStore, attemptStore);

    classroomService = new ClassroomService(
      classroomStore,
      memberStore,
      examStore,
      orgStore,
      userStore,
    );

    examService = new TeacherExamService(
      examStore,
      questionStore,
      classroomStore,
      orgStore,
      memberStore,
      notificationService,
    );

    assignmentService = new AssignmentService(
      assignmentStore,
      submissionStore,
      classroomStore,
      memberStore,
      orgStore,
      userStore,
      undefined,
      notificationService,
    );
  });

  function teacherExamStoreWiring(
    exStore: InMemoryTeacherExamStore,
    qStore: InMemoryTeacherExamQuestionStore,
    attStore: InMemoryTeacherExamAttemptStore,
  ) {
    exStore.attemptStore = attStore;
    qStore.examStore = exStore;
  }

  async function createTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      organizationStore: orgStore,
      notificationStore,
      notificationService,
      classroomStore,
      classroomMemberStore: memberStore,
      teacherExamStore: examStore,
      teacherExamQuestionStore: questionStore,
      teacherExamAttemptStore: attemptStore,
      teacherExamAttemptAnswerStore: attemptAnswerStore,
      assignmentStore,
      assignmentSubmissionStore: submissionStore,
      assignmentService,
    });
    return app;
  }

  async function registerAndLogin(
    app: ReturnType<typeof createApp>,
    email: string,
    role = "student",
    globalRole?: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "تست",
        lastName: "کاربر",
        phoneNumber: `0912${Math.floor(1000000 + Math.random() * 9000000)}`,
        email,
        password: "ValidPassword123!",
      },
    });
    expect(res.statusCode).toBe(200);
    const token = extractSessionToken(res);
    expect(token).toBeDefined();
    const data = res.json();
    const userId = asUserId(data.user.id);

    if (role !== "student" || globalRole) {
      const existing = await userStore.findById(userId);
      if (existing) {
        userStore.insert({
          ...existing,
          role: role as Role,
          globalRole: (globalRole ?? (role === "platform_admin" ? "platform_admin" : null)) as Role | null,
        });
      }
    }

    return {
      userId,
      token: token!,
      cookieHeader: `avana_session=${token}`,
    };
  }

  async function createTestOrg(orgId: OrganizationId, name = "دانشگاه تهران", adminUserId?: string) {
    const defaultUserId = asUserId(adminUserId ?? randomUUID());
    return await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name,
        slug: `slug-${orgId.slice(0, 8)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId: defaultUserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });
  }

  // =========================================================================
  // 1. Exam Notifications Suite
  // =========================================================================
  describe("Exam Notifications Lifecycle", () => {
    it("does not create notifications for draft exams, but notifies all active members upon publication", async () => {
      const app = await createTestApp();

      const orgId = asOrganizationId(randomUUID());
      await createTestOrg(orgId, "دانشگاه تهران");

      const teacher = await registerAndLogin(app, "teacher1@example.com", "teacher", "platform_admin");
      const student1 = await registerAndLogin(app, "student1@example.com", "student");
      const student2 = await registerAndLogin(app, "student2@example.com", "student");
      const removedStudent = await registerAndLogin(app, "removed@example.com", "student");
      const nonMember = await registerAndLogin(app, "nonmember@example.com", "student");

      // Teacher creates classroom
      const classroom = await classroomService.createClassroom(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        { organizationId: orgId, title: "فارماکولوژی پزشکی" },
      );

      // Students join classroom
      await classroomService.joinClassroom(
        { userId: student1.userId, role: "user" },
        { inviteCode: classroom.inviteCode },
      );
      await classroomService.joinClassroom(
        { userId: student2.userId, role: "user" },
        { inviteCode: classroom.inviteCode },
      );
      await classroomService.joinClassroom(
        { userId: removedStudent.userId, role: "user" },
        { inviteCode: classroom.inviteCode },
      );

      // Teacher removes removedStudent
      await classroomService.removeMember(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        removedStudent.userId,
      );

      // Teacher creates draft exam
      const now = new Date();
      const startsAt = new Date(now.getTime() + 3600000).toISOString();
      const endsAt = new Date(now.getTime() + 7200000).toISOString();

      const exam = await examService.createExam(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        {
          title: "میان‌ترم فارماکولوژی",
          durationMinutes: 45,
          startsAt,
          endsAt,
        },
      );

      // Add a question to exam
      await examService.createQuestion(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        exam.id,
        {
          prompt: "کدام دارو بتابلوکر است؟",
          options: [
            { id: "opt-1", text: "پروپرانولول" },
            { id: "opt-2", text: "کاپتوپریل" },
            { id: "opt-3", text: "آتنولول" },
            { id: "opt-4", text: "لوزارتان" },
          ],
          correctOptionId: "opt-1",
          points: 1,
        },
      );

      // In draft status: students must NOT have any exam notifications
      const notifsDraft1 = await notificationService.listForUser(student1.userId);
      expect(notifsDraft1.items.filter((n) => n.type === "classroom_exam_published").length).toBe(0);

      // Teacher publishes exam
      await examService.publishExam(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        exam.id,
      );

      // Active students should receive exam notification
      const notifsStudent1 = await notificationService.listForUser(student1.userId);
      const examNotif1 = notifsStudent1.items.find((n) => n.type === "classroom_exam_published");
      expect(examNotif1).toBeDefined();
      expect(examNotif1?.title).toBe("آزمون جدید");
      expect(examNotif1?.message).toBe("آزمون «میان‌ترم فارماکولوژی» در کلاس «فارماکولوژی پزشکی» اضافه شد.");
      expect(examNotif1?.action?.url).toBe(`/classrooms/${classroom.id}/exams/${exam.id}`);
      expect(examNotif1?.isRead).toBe(false);

      const notifsStudent2 = await notificationService.listForUser(student2.userId);
      const examNotif2 = notifsStudent2.items.find((n) => n.type === "classroom_exam_published");
      expect(examNotif2).toBeDefined();

      // Removed student and Non-member must NOT receive notification
      const notifsRemoved = await notificationService.listForUser(removedStudent.userId);
      expect(notifsRemoved.items.filter((n) => n.type === "classroom_exam_published").length).toBe(0);

      const notifsNonMember = await notificationService.listForUser(nonMember.userId);
      expect(notifsNonMember.items.filter((n) => n.type === "classroom_exam_published").length).toBe(0);

      // Idempotency: publishing again or re-running notification should not create duplicate
      await notificationService.notifyClassroomExamPublished([student1.userId], {
        examId: exam.id,
        classroomId: classroom.id,
        examTitle: "میان‌ترم فارماکولوژی",
        classTitle: "فارماکولوژی پزشکی",
      });
      const checkStudent1 = await notificationService.listForUser(student1.userId);
      expect(checkStudent1.items.filter((n) => n.type === "classroom_exam_published").length).toBe(1);
    });

    it("sends notifications for releaseResults, closeExamManually, and archiveExam", async () => {
      const app = await createTestApp();

      const orgId = asOrganizationId(randomUUID());
      await createTestOrg(orgId, "uni");

      const teacher = await registerAndLogin(app, "teacher_lifecycle@example.com", "teacher", "platform_admin");
      const student = await registerAndLogin(app, "student_lifecycle@example.com", "student");

      const classroom = await classroomService.createClassroom(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        { organizationId: orgId, title: "شیمی دارویی" },
      );

      await classroomService.joinClassroom(
        { userId: student.userId, role: "user" },
        { inviteCode: classroom.inviteCode },
      );

      const startsAt = new Date(Date.now() - 3600000).toISOString();
      const endsAt = new Date(Date.now() + 3600000).toISOString();

      const exam = await examService.createExam(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        { title: "کوییز ۱", startsAt, endsAt },
      );

      await examService.createQuestion(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        exam.id,
        {
          prompt: "صورت سوال",
          options: [
            { id: "1", text: "الف" },
            { id: "2", text: "ب" },
            { id: "3", text: "ج" },
            { id: "4", text: "د" },
          ],
          correctOptionId: "1",
        },
      );

      await examService.publishExam(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        exam.id,
      );

      // 1. Results release notification
      await examService.releaseResults(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        exam.id,
      );

      const notifs1 = await notificationService.listForUser(student.userId);
      const resultsNotif = notifs1.items.find((n) => n.type === "classroom_exam_results_released");
      expect(resultsNotif).toBeDefined();
      expect(resultsNotif?.title).toBe("اعلام نتایج آزمون");
      expect(resultsNotif?.message).toBe("نتایج آزمون «کوییز ۱» در کلاس «شیمی دارویی» منتشر شد.");
      expect(resultsNotif?.action?.url).toBe(`/classrooms/${classroom.id}/exams/${exam.id}/results`);

      // 2. Manual close notification
      await examService.closeExamManually(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        exam.id,
      );

      const notifs2 = await notificationService.listForUser(student.userId);
      const closeNotif = notifs2.items.find((n) => n.type === "classroom_exam_closed");
      expect(closeNotif).toBeDefined();
      expect(closeNotif?.title).toBe("پایان آزمون");
      expect(closeNotif?.message).toBe("آزمون «کوییز ۱» در کلاس «شیمی دارویی» بسته شد.");
      expect(closeNotif?.action?.url).toBe(`/classrooms/${classroom.id}/exams/${exam.id}`);

      // 3. Archive exam notification
      await examService.archiveExam(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        exam.id,
      );

      const notifs3 = await notificationService.listForUser(student.userId);
      const archiveNotif = notifs3.items.find((n) => n.type === "classroom_exam_archived");
      expect(archiveNotif).toBeDefined();
      expect(archiveNotif?.title).toBe("لغو آزمون");
      expect(archiveNotif?.message).toBe("آزمون «کوییز ۱» در کلاس «شیمی دارویی» لغو شد.");
      expect(archiveNotif?.action?.url).toBe(`/classrooms/${classroom.id}`);
    });
  });

  // =========================================================================
  // 2. Assignment Notifications Suite
  // =========================================================================
  describe("Assignment Notifications Lifecycle", () => {
    it("handles draft creation without notifications and published creation with exactly one notification", async () => {
      const app = await createTestApp();

      const orgId = asOrganizationId(randomUUID());
      await createTestOrg(orgId, "org");

      const teacher = await registerAndLogin(app, "teacher_assign@example.com", "teacher", "platform_admin");
      const student = await registerAndLogin(app, "student_assign@example.com", "student");

      const classroom = await classroomService.createClassroom(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        { organizationId: orgId, title: "کلاس فیزیولوژی" },
      );

      await classroomService.joinClassroom(
        { userId: student.userId, role: "user" },
        { inviteCode: classroom.inviteCode },
      );

      const startsAt = new Date(Date.now()).toISOString();
      const dueAt = new Date(Date.now() + 86400000).toISOString();

      // 1. Create draft assignment -> NO notification
      const draftAssignment = await assignmentService.createAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        {
          title: "تکلیف ۱ (پیش‌نویس)",
          startsAt,
          dueAt,
          status: "draft",
        },
      );

      let studentNotifs = await notificationService.listForUser(student.userId);
      expect(studentNotifs.items.filter((n) => n.type === "classroom_assignment_published").length).toBe(0);

      // Publish the draft assignment -> exactly 1 notification
      await assignmentService.publishAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        draftAssignment.id,
      );

      studentNotifs = await notificationService.listForUser(student.userId);
      const notifPublished = studentNotifs.items.find(
        (n) => n.type === "classroom_assignment_published" && n.title === "تکلیف جدید",
      );
      expect(notifPublished).toBeDefined();
      expect(notifPublished?.message).toBe("تکلیف «تکلیف ۱ (پیش‌نویس)» در کلاس «کلاس فیزیولوژی» اضافه شد.");
      expect(notifPublished?.action?.url).toBe(`/classrooms/${classroom.id}`);

      // 2. Direct published assignment creation -> exactly 1 notification
      await assignmentService.createAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        {
          title: "تکلیف ۲ (مستقیم)",
          startsAt,
          dueAt,
          status: "published",
        },
      );

      studentNotifs = await notificationService.listForUser(student.userId);
      const notifDirect = studentNotifs.items.find(
        (n) =>
          n.type === "classroom_assignment_published" &&
          n.message.includes("تکلیف ۲ (مستقیم)"),
      );
      expect(notifDirect).toBeDefined();
    });

    it("sends due date change notification only when dueAt actually changes on a published assignment", async () => {
      const app = await createTestApp();

      const orgId = asOrganizationId(randomUUID());
      await createTestOrg(orgId, "uni2");

      const teacher = await registerAndLogin(app, "teacher_due@example.com", "teacher", "platform_admin");
      const student = await registerAndLogin(app, "student_due@example.com", "student");

      const classroom = await classroomService.createClassroom(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        { organizationId: orgId, title: "بیوشیمی پزشکی" },
      );

      await classroomService.joinClassroom(
        { userId: student.userId, role: "user" },
        { inviteCode: classroom.inviteCode },
      );

      const startsAt = new Date(Date.now()).toISOString();
      const originalDueAt = new Date(Date.now() + 86400000).toISOString();

      const assignment = await assignmentService.createAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        {
          title: "گزارش کار آزمایشگاه",
          startsAt,
          dueAt: originalDueAt,
          status: "published",
        },
      );

      // Unrelated update (e.g. description only) -> NO due date notification
      await assignmentService.updateAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        assignment.id,
        {
          description: "توضیحات تکمیلی اضافه شد",
        },
      );

      let studentNotifs = await notificationService.listForUser(student.userId);
      expect(studentNotifs.items.filter((n) => n.type === "classroom_assignment_due_changed").length).toBe(0);

      // Update with same dueAt -> NO notification
      await assignmentService.updateAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        assignment.id,
        {
          dueAt: originalDueAt,
        },
      );
      studentNotifs = await notificationService.listForUser(student.userId);
      expect(studentNotifs.items.filter((n) => n.type === "classroom_assignment_due_changed").length).toBe(0);

      // Real dueAt change -> Send notification
      const newDueAt = new Date(Date.now() + 172800000).toISOString();
      await assignmentService.updateAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        assignment.id,
        {
          dueAt: newDueAt,
        },
      );

      studentNotifs = await notificationService.listForUser(student.userId);
      const dueNotif = studentNotifs.items.find((n) => n.type === "classroom_assignment_due_changed");
      expect(dueNotif).toBeDefined();
      expect(dueNotif?.title).toBe("تغییر مهلت تکلیف");
      expect(dueNotif?.message).toBe("مهلت تکلیف «گزارش کار آزمایشگاه» در کلاس «بیوشیمی پزشکی» تغییر کرد.");
      expect(dueNotif?.action?.url).toBe(`/classrooms/${classroom.id}`);

      // Archive assignment -> notification
      await assignmentService.archiveAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        assignment.id,
      );

      studentNotifs = await notificationService.listForUser(student.userId);
      const archiveNotif = studentNotifs.items.find((n) => n.type === "classroom_assignment_archived");
      expect(archiveNotif).toBeDefined();
      expect(archiveNotif?.title).toBe("تغییر وضعیت تکلیف");
      expect(archiveNotif?.message).toBe("تکلیف «گزارش کار آزمایشگاه» در کلاس «بیوشیمی پزشکی» بسته شد.");
    });
  });

  // =========================================================================
  // 3. Class Isolation & Multi-Class Isolation
  // =========================================================================
  describe("Classroom Isolation", () => {
    it("ensures Student A in Classroom A receives only Classroom A notifications and Student B in Classroom B receives only Classroom B notifications", async () => {
      const app = await createTestApp();

      const orgId = asOrganizationId(randomUUID());
      await createTestOrg(orgId, "org-iso");

      const teacher = await registerAndLogin(app, "teacher_iso@example.com", "teacher", "platform_admin");
      const studentA = await registerAndLogin(app, "student_a@example.com", "student");
      const studentB = await registerAndLogin(app, "student_b@example.com", "student");

      const classA = await classroomService.createClassroom(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        { organizationId: orgId, title: "کلاس الف" },
      );

      const classB = await classroomService.createClassroom(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        { organizationId: orgId, title: "کلاس ب" },
      );

      // Student A joins Class A only
      await classroomService.joinClassroom(
        { userId: studentA.userId, role: "user" },
        { inviteCode: classA.inviteCode },
      );

      // Student B joins Class B only
      await classroomService.joinClassroom(
        { userId: studentB.userId, role: "user" },
        { inviteCode: classB.inviteCode },
      );

      // Create and publish assignment in Class A
      const startsAt = new Date().toISOString();
      const dueAt = new Date(Date.now() + 86400000).toISOString();
      await assignmentService.createAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classA.id,
        { title: "تکلیف کلاس الف", startsAt, dueAt, status: "published" },
      );

      // Create and publish assignment in Class B
      await assignmentService.createAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classB.id,
        { title: "تکلیف کلاس ب", startsAt, dueAt, status: "published" },
      );

      const notifsA = await notificationService.listForUser(studentA.userId);
      const notifsB = await notificationService.listForUser(studentB.userId);

      const titlesA = notifsA.items.map((n) => n.message);
      const titlesB = notifsB.items.map((n) => n.message);

      expect(titlesA.some((m) => m.includes("کلاس الف"))).toBe(true);
      expect(titlesA.some((m) => m.includes("کلاس ب"))).toBe(false);

      expect(titlesB.some((m) => m.includes("کلاس ب"))).toBe(true);
      expect(titlesB.some((m) => m.includes("کلاس الف"))).toBe(false);
    });
  });

  // =========================================================================
  // 4. Read / Unread Tracking via HTTP API
  // =========================================================================
  describe("Read / Unread HTTP API Integration", () => {
    it("manages unread badge count, mark as read, and mark all as read for classroom notifications", async () => {
      const app = await createTestApp();

      const orgId = asOrganizationId(randomUUID());
      await createTestOrg(orgId, "uni-read");

      const teacher = await registerAndLogin(app, "teacher_read@example.com", "teacher", "platform_admin");
      const student = await registerAndLogin(app, "student_read@example.com", "student");

      const classroom = await classroomService.createClassroom(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        { organizationId: orgId, title: "کلاس ژنتیک" },
      );

      await classroomService.joinClassroom(
        { userId: student.userId, role: "user" },
        { inviteCode: classroom.inviteCode },
      );

      // Initial unread count from registration notification
      const countRes1 = await app.inject({
        method: "GET",
        url: "/v1/notifications/unread-count",
        headers: { cookie: student.cookieHeader },
      });
      const initialCount = countRes1.json().unread_count;

      // Create 2 published assignments
      const startsAt = new Date().toISOString();
      const dueAt = new Date(Date.now() + 86400000).toISOString();

      await assignmentService.createAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        { title: "تکلیف ۱ ژنتیک", startsAt, dueAt, status: "published" },
      );

      await assignmentService.createAssignment(
        { userId: teacher.userId, role: "platform_admin", globalRole: "platform_admin" },
        classroom.id,
        { title: "تکلیف ۲ ژنتیک", startsAt, dueAt, status: "published" },
      );

      // Unread count should have increased by 2
      const countRes2 = await app.inject({
        method: "GET",
        url: "/v1/notifications/unread-count",
        headers: { cookie: student.cookieHeader },
      });
      expect(countRes2.json().unread_count).toBe(initialCount + 2);

      // List notifications
      const listRes = await app.inject({
        method: "GET",
        url: "/v1/notifications",
        headers: { cookie: student.cookieHeader },
      });
      expect(listRes.statusCode).toBe(200);
      const items = listRes.json().items;
      const assignmentNotifs = items.filter((n: { type: string }) => n.type === "classroom_assignment_published");
      expect(assignmentNotifs.length).toBe(2);

      // Mark single notification as read
      const firstNotifId = assignmentNotifs[0].id;
      const readRes = await app.inject({
        method: "PATCH",
        url: `/v1/notifications/${firstNotifId}/read`,
        headers: { cookie: student.cookieHeader },
      });
      expect(readRes.statusCode).toBe(200);
      expect(readRes.json().notification.isRead).toBe(true);

      // Unread count decreases by 1
      const countRes3 = await app.inject({
        method: "GET",
        url: "/v1/notifications/unread-count",
        headers: { cookie: student.cookieHeader },
      });
      expect(countRes3.json().unread_count).toBe(initialCount + 1);

      // Mark all as read
      const readAllRes = await app.inject({
        method: "POST",
        url: "/v1/notifications/read-all",
        headers: { cookie: student.cookieHeader },
      });
      expect(readAllRes.statusCode).toBe(200);
      expect(readAllRes.json().success).toBe(true);

      // Final unread count is 0
      const countRes4 = await app.inject({
        method: "GET",
        url: "/v1/notifications/unread-count",
        headers: { cookie: student.cookieHeader },
      });
      expect(countRes4.json().unread_count).toBe(0);
    });
  });
});
