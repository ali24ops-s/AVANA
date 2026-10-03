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
  InMemoryTeacherConversationStore,
  InMemoryTeacherConversationMessageStore,
  TeacherMessageService,
} from "../modules/teacher-platform/index.js";
import { randomUUID } from "node:crypto";

import {
  InMemoryNotificationStore,
} from "../modules/notifications/drizzle-stores.js";
import { NotificationService } from "../modules/notifications/notification-service.js";
import { DrizzleTeacherConversationStore, DrizzleTeacherConversationMessageStore } from "../modules/teacher-platform/stores.js";

describe("Teacher Student Messaging (پیام‌های دانشجویان) — Backend Lifecycle Test Suite", () => {
  let app: ReturnType<typeof createApp>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let sessionService: SessionService;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;

  let classroomStore: InMemoryClassroomStore;
  let memberStore: InMemoryClassroomMemberStore;
  let teacherExamStore: InMemoryTeacherExamStore;
  let teacherExamQuestionStore: InMemoryTeacherExamQuestionStore;
  let teacherExamAttemptStore: InMemoryTeacherExamAttemptStore;
  let teacherExamAttemptAnswerStore: InMemoryTeacherExamAttemptAnswerStore;
  let assignmentStore: InMemoryAssignmentStore;
  let assignmentSubmissionStore: InMemoryAssignmentSubmissionStore;
  let conversationStore: InMemoryTeacherConversationStore;
  let conversationMessageStore: InMemoryTeacherConversationMessageStore;
  let messageService: TeacherMessageService;

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

    if (role === Roles.platform_admin) {
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
    return { user, sessionToken: session.sessionToken };
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
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);

    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    teacherExamStore = new InMemoryTeacherExamStore();
    teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();
    teacherExamAttemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();
    assignmentStore = new InMemoryAssignmentStore();
    assignmentSubmissionStore = new InMemoryAssignmentSubmissionStore();
    conversationStore = new InMemoryTeacherConversationStore();
    conversationMessageStore = new InMemoryTeacherConversationMessageStore();

    messageService = new TeacherMessageService(
      conversationStore,
      conversationMessageStore,
      classroomStore,
      memberStore,
      userStore,
      notificationService,
    );

    app = createApp({ config });
    await app.register(v1Routes, {
      config: config.session,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      notificationStore,
      notificationService,
      classroomStore,
      classroomMemberStore: memberStore,
      teacherExamStore,
      teacherExamQuestionStore,
      teacherExamAttemptStore,
      teacherExamAttemptAnswerStore,
      assignmentStore,
      assignmentSubmissionStore,
      teacherConversationStore: conversationStore,
      teacherConversationMessageStore: conversationMessageStore,
      teacherMessageService: messageService,
    });
  });

  test("1. Student creates a valid message for their teacher within an active classroom", async () => {
    const teacher = await createUserWithRole("teacher1@example.com", Roles.teacher, orgId, "دکتر رضایی");
    const student = await createUserWithRole("student1@example.com", Roles.student, orgId, "علی اکبری");

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "ریاضی عمومی ۱",
      description: "کلاس درس ترم پاییز",
      inviteCode: "MATH101",
      status: "active",
    });

    await memberStore.addMember({
      id: randomUUID(),
      classroomId: classroom.id,
      studentId: student.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: student.sessionToken },
      payload: {
        classroomId: classroom.id,
        category: "study_question",
        subject: "سؤال در مورد قضیه رول",
        body: "استاد گرامی در صفحه ۴۵ کتاب مفهوم اثبات برای من واضح نبود.",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.conversation).toBeDefined();
    expect(body.conversation.category).toBe("study_question");
    expect(body.conversation.status).toBe("new");
    expect(body.conversation.studentId).toBe(student.user.id);
    expect(body.conversation.subject).toContain("قضیه رول");
    expect(body.message.body).toContain("مفهوم اثبات");
  });

  test("2. Validation: rejects invalid categories or empty fields", async () => {
    const teacher = await createUserWithRole("teacher_val@example.com", Roles.teacher, orgId);
    const student = await createUserWithRole("student_val@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "فیزیک ۱",
      inviteCode: "PHYS101",
      status: "active",
    });

    await memberStore.addMember({
      id: randomUUID(),
      classroomId: classroom.id,
      studentId: student.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    // Invalid category
    const resInvalidCat = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: student.sessionToken },
      payload: {
        classroomId: classroom.id,
        category: "invalid_category",
        subject: "عنوان",
        body: "متن پیام",
      },
    });
    expect(resInvalidCat.statusCode).toBe(400);

    // Empty body
    const resEmptyBody = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: student.sessionToken },
      payload: {
        classroomId: classroom.id,
        category: "study_question",
        subject: "عنوان",
        body: "   ",
      },
    });
    expect(resEmptyBody.statusCode).toBe(400);
  });

  test("3. Security / Authorization: Student cannot message a teacher of a classroom they are not enrolled in", async () => {
    const teacher = await createUserWithRole("teacher_sec@example.com", Roles.teacher, orgId);
    const studentNotEnrolled = await createUserWithRole("outsider@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "شیمی آلی",
      inviteCode: "CHEM101",
      status: "active",
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: studentNotEnrolled.sessionToken },
      payload: {
        classroomId: classroom.id,
        category: "study_question",
        subject: "سؤال غیرمجاز",
        body: "متن پیام",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  test("4. Security / IDOR: Student cannot read another student's conversation", async () => {
    const teacher = await createUserWithRole("teacher_idor@example.com", Roles.teacher, orgId);
    const student1 = await createUserWithRole("student1_idor@example.com", Roles.student, orgId);
    const student2 = await createUserWithRole("student2_idor@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "آمار و احتمالات",
      inviteCode: "STAT101",
      status: "active",
    });

    await memberStore.addMember({
      id: randomUUID(),
      classroomId: classroom.id,
      studentId: student1.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    const conv = await conversationStore.create({
      id: randomUUID(),
      studentId: student1.user.id,
      teacherId: teacher.user.id,
      classroomId: classroom.id,
      category: "study_question",
      subject: "سؤال دانشجو ۱",
      status: "new",
      lastActivityAt: new Date().toISOString(),
      lastSenderRole: "student",
      teacherReadAt: null,
      studentReadAt: new Date().toISOString(),
      answeredAt: null,
      closedAt: null,
    });

    // Student 2 attempts to fetch Student 1's conversation
    const res = await app.inject({
      method: "GET",
      url: `/v1/student/conversations/${conv.id}`,
      cookies: { avana_session: student2.sessionToken },
    });

    expect(res.statusCode).toBe(404);
  });

  test("5. Teacher can view conversations, filter by category/status, and read details", async () => {
    const teacher = await createUserWithRole("teacher_inbox@example.com", Roles.teacher, orgId, "دکتر حسینی");
    const student = await createUserWithRole("student_inbox@example.com", Roles.student, orgId, "مریم میرزا");

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "برنامه‌نویسی پیشرفته",
      inviteCode: "PROG101",
      status: "active",
    });

    const conv1 = await conversationStore.create({
      id: randomUUID(),
      studentId: student.user.id,
      teacherId: teacher.user.id,
      classroomId: classroom.id,
      category: "assignment",
      subject: "اشکال در تست خودکار تکلیف ۱",
      status: "new",
      lastActivityAt: new Date().toISOString(),
      lastSenderRole: "student",
      teacherReadAt: null,
      studentReadAt: new Date().toISOString(),
      answeredAt: null,
      closedAt: null,
    });

    await conversationMessageStore.create({
      id: randomUUID(),
      conversationId: conv1.id,
      senderId: student.user.id,
      senderRole: "student",
      body: "سلام استاد، تست سوم در کامپایلر خطا می‌دهد.",
    });

    // List conversations
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/conversations?category=assignment&status=new`,
      cookies: { avana_session: teacher.sessionToken },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.conversations.length).toBe(1);
    expect(listBody.conversations[0].studentName).toBe("مریم میرزا");
    expect(listBody.conversations[0].classroomTitle).toBe("برنامه‌نویسی پیشرفته");
    expect(listBody.unreadCount).toBe(1);

    // Get conversation details
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/conversations/${conv1.id}`,
      cookies: { avana_session: teacher.sessionToken },
    });

    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.conversation.id).toBe(conv1.id);
    expect(detailBody.messages.length).toBe(1);
    expect(detailBody.student.name).toBe("مریم میرزا");
  });

  test("6. Security: Teacher cannot view or reply to another teacher's conversation", async () => {
    const teacher1 = await createUserWithRole("teacher_a@example.com", Roles.teacher, orgId);
    const teacher2 = await createUserWithRole("teacher_b@example.com", Roles.teacher, orgId);
    const student = await createUserWithRole("student_ab@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher1.user.id,
      title: "مدار منطقی",
      inviteCode: "LOGIC101",
      status: "active",
    });

    const conv = await conversationStore.create({
      id: randomUUID(),
      studentId: student.user.id,
      teacherId: teacher1.user.id,
      classroomId: classroom.id,
      category: "exam",
      subject: "سؤال درباره کوییز",
      status: "new",
      lastActivityAt: new Date().toISOString(),
      lastSenderRole: "student",
      teacherReadAt: null,
      studentReadAt: new Date().toISOString(),
      answeredAt: null,
      closedAt: null,
    });

    const getRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/conversations/${conv.id}`,
      cookies: { avana_session: teacher2.sessionToken },
    });
    expect(getRes.statusCode).toBe(404);

    const replyRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/conversations/${conv.id}/reply`,
      cookies: { avana_session: teacher2.sessionToken },
      payload: { body: "پاسخ غیرمجاز" },
    });
    expect(replyRes.statusCode).toBe(404);
  });

  test("7. Teacher replies to conversation: status transitions to answered and answeredAt is recorded", async () => {
    const teacher = await createUserWithRole("teacher_reply@example.com", Roles.teacher, orgId);
    const student = await createUserWithRole("student_reply@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "ساختمان داده",
      inviteCode: "DS101",
      status: "active",
    });

    const conv = await conversationStore.create({
      id: randomUUID(),
      studentId: student.user.id,
      teacherId: teacher.user.id,
      classroomId: classroom.id,
      category: "study_question",
      subject: "درخت AVL",
      status: "new",
      lastActivityAt: new Date().toISOString(),
      lastSenderRole: "student",
      teacherReadAt: null,
      studentReadAt: new Date().toISOString(),
      answeredAt: null,
      closedAt: null,
    });

    const replyRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/conversations/${conv.id}/reply`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { body: "درخت AVL یک درخت دودویی خودمتوازن است." },
    });

    expect(replyRes.statusCode).toBe(201);
    const replyBody = JSON.parse(replyRes.body);
    expect(replyBody.conversation.status).toBe("answered");
    expect(replyBody.conversation.answeredAt).toBeDefined();
    expect(replyBody.conversation.lastSenderRole).toBe("teacher");
    expect(replyBody.message.body).toContain("خودمتوازن");
  });

  test("8. Student follows up on answered conversation: status transitions to in_progress", async () => {
    const teacher = await createUserWithRole("teacher_fup@example.com", Roles.teacher, orgId);
    const student = await createUserWithRole("student_fup@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "شبکه‌های کامپیوتری",
      inviteCode: "NET101",
      status: "active",
    });

    const conv = await conversationStore.create({
      id: randomUUID(),
      studentId: student.user.id,
      teacherId: teacher.user.id,
      classroomId: classroom.id,
      category: "guidance",
      subject: "پروتکل TCP",
      status: "answered",
      lastActivityAt: new Date().toISOString(),
      lastSenderRole: "teacher",
      teacherReadAt: new Date().toISOString(),
      studentReadAt: null,
      answeredAt: new Date().toISOString(),
      closedAt: null,
    });

    const followUpRes = await app.inject({
      method: "POST",
      url: `/v1/student/conversations/${conv.id}/reply`,
      cookies: { avana_session: student.sessionToken },
      payload: { body: "ممنون استاد، آیا برای لایه انتقال اسلاید اضافه‌ای هست؟" },
    });

    expect(followUpRes.statusCode).toBe(201);
    const followUpBody = JSON.parse(followUpRes.body);
    expect(followUpBody.conversation.status).toBe("in_progress");
    expect(followUpBody.conversation.lastSenderRole).toBe("student");
  });

  test("9. Teacher updates conversation status (e.g. closes conversation)", async () => {
    const teacher = await createUserWithRole("teacher_close@example.com", Roles.teacher, orgId);
    const student = await createUserWithRole("student_close@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "سیستم عامل",
      inviteCode: "OS101",
      status: "active",
    });

    const conv = await conversationStore.create({
      id: randomUUID(),
      studentId: student.user.id,
      teacherId: teacher.user.id,
      classroomId: classroom.id,
      category: "class_issue",
      subject: "لینک جلسه آنلاین",
      status: "answered",
      lastActivityAt: new Date().toISOString(),
      lastSenderRole: "teacher",
      teacherReadAt: new Date().toISOString(),
      studentReadAt: new Date().toISOString(),
      answeredAt: new Date().toISOString(),
      closedAt: null,
    });

    const closeRes = await app.inject({
      method: "PATCH",
      url: `/v1/teacher/conversations/${conv.id}/status`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { status: "closed" },
    });

    expect(closeRes.statusCode).toBe(200);
    const closeBody = JSON.parse(closeRes.body);
    expect(closeBody.conversation.status).toBe("closed");
  });

  test("10. Student creates conversation/message end-to-end through real route and dispatches notification to teacher", async () => {
    const teacher = await createUserWithRole("teacher_e2e@example.com", Roles.teacher, orgId, "استاد حسینی");
    const student = await createUserWithRole("student_e2e@example.com", Roles.student, orgId, "محمد محمدی");

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacher.user.id,
      title: "معماری کامپیوتر",
      inviteCode: "ARCH202",
      status: "active",
    });

    await memberStore.addMember({
      id: randomUUID(),
      classroomId: classroom.id,
      studentId: student.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: student.sessionToken },
      payload: {
        classroomId: classroom.id,
        category: "assignment",
        subject: "سؤال درباره پیاده‌سازی خط لوله MIPS",
        body: "استاد گرامی، در فاز دوم پروژه معماری، نحوه مدیریت مخاطره داده‌ای را چگونه تست کنیم؟",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.conversation).toBeDefined();
    expect(body.conversation.id).toBeDefined();
    expect(body.conversation.teacherId).toBe(teacher.user.id);
    expect(body.conversation.studentId).toBe(student.user.id);
    expect(body.conversation.classroomId).toBe(classroom.id);
    expect(body.conversation.category).toBe("assignment");
    expect(body.message.body).toContain("فاز دوم پروژه معماری");

    // Verify notification was sent to teacher
    const teacherNotifications = await notificationStore.listForUser(teacher.user.id);
    const newMsgNotif = teacherNotifications.items.find(
      (n) => n.type === "teacher_new_message" && (n.metadata as Record<string, unknown>)?.conversationId === body.conversation.id,
    );
    expect(newMsgNotif).toBeDefined();
    expect(newMsgNotif?.title).toBe("پیام جدید از دانشجو");
    expect(newMsgNotif?.actionUrl).toBe(`/teacher/messages/${body.conversation.id}`);
  });

  test("11. Security & Integrity: Teacher ID cannot be injected or forged by student", async () => {
    const realTeacher = await createUserWithRole("real_teacher@example.com", Roles.teacher, orgId);
    const forgedTeacher = await createUserWithRole("forged_teacher@example.com", Roles.teacher, orgId);
    const student = await createUserWithRole("student_forge@example.com", Roles.student, orgId);

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: realTeacher.user.id,
      title: "طراحی الگوریتم",
      inviteCode: "ALGO303",
      status: "active",
    });

    await memberStore.addMember({
      id: randomUUID(),
      classroomId: classroom.id,
      studentId: student.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    // Attempt to forge teacherId
    const res = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: student.sessionToken },
      payload: {
        classroomId: classroom.id,
        teacherId: forgedTeacher.user.id, // Forged teacherId
        category: "guidance",
        subject: "سؤال الگوریتم حریصانه",
        body: "لطفاً در خصوص اثبات درستی الگوریتم دایکسترا راهنمایی بفرمایید.",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    // Real teacher of classroom must be used, NOT the injected forged teacherId
    expect(body.conversation.teacherId).toBe(realTeacher.user.id);
    expect(body.conversation.teacherId).not.toBe(forgedTeacher.user.id);
  });

  test("12. Drizzle messaging store: mapper safely handles string timestamp formats from database", async () => {
    const fakeConvRow = {
      id: "22222222-2222-4222-8222-222222222222",
      studentId: "33333333-3333-4333-8333-333333333333",
      teacherId: "44444444-4444-4444-8444-444444444444",
      classroomId: "55555555-5555-4555-8555-555555555555",
      category: "study_question",
      subject: "تست فرمت تاریخ",
      status: "new",
      lastActivityAt: "2026-10-03T10:00:00.000Z", // String timestamp
      lastSenderRole: "student",
      teacherReadAt: null,
      studentReadAt: "2026-10-03T10:00:00.000Z", // String timestamp
      answeredAt: null,
      closedAt: null,
      createdAt: "2026-10-03T10:00:00.000Z", // String timestamp
      updatedAt: "2026-10-03T10:00:00.000Z", // String timestamp
    };

    const mockDb = {
      insert: () => ({
        values: () => ({
          returning: async () => [fakeConvRow],
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [fakeConvRow],
          }),
        }),
      }),
    } as any;

    const drizzleStore = new DrizzleTeacherConversationStore(mockDb);
    const created = await drizzleStore.create({
      id: fakeConvRow.id,
      studentId: fakeConvRow.studentId,
      teacherId: fakeConvRow.teacherId,
      classroomId: fakeConvRow.classroomId,
      category: "study_question",
      subject: "تست فرمت تاریخ",
      status: "new",
      lastActivityAt: "2026-10-03T10:00:00.000Z",
      lastSenderRole: "student",
      studentReadAt: "2026-10-03T10:00:00.000Z",
      teacherReadAt: null,
      answeredAt: null,
      closedAt: null,
    });

    expect(created.id).toBe(fakeConvRow.id);
    expect(created.createdAt).toBe("2026-10-03T10:00:00.000Z");
    expect(created.lastActivityAt).toBe("2026-10-03T10:00:00.000Z");
  });

  test("13. Same-User scenario: Teacher attempting to send student message to themselves returns HTTP 400 Bad Request with clear Persian error message", async () => {
    const teacherStudent = await createUserWithRole("teacher_self@example.com", Roles.teacher, orgId, "استاد دوکاربره");

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: teacherStudent.user.id,
      title: "شبکه‌های کامپیوتری",
      inviteCode: "NET999",
      status: "active",
    });

    // Even if enrolled as member in their own classroom
    await memberStore.addMember({
      id: randomUUID(),
      classroomId: classroom.id,
      studentId: teacherStudent.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: teacherStudent.sessionToken },
      payload: {
        classroomId: classroom.id,
        category: "study_question",
        subject: "تست ارسال پیام به خود",
        body: "آیا می‌توانم به عنوان استاد به خودم پیام ارسال کنم؟",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("bad_request");
    expect(body.error.message).toContain("امکان ارسال پیام به خود به عنوان استاد این کلاس وجود ندارد");
  });

  test("14. Independent fixture: Student ≠ Teacher in a separate classroom sends message successfully without 500 Internal Error", async () => {
    const independentTeacher = await createUserWithRole("indep_teacher@example.com", Roles.teacher, orgId, "دکتر تهرانی");
    const independentStudent = await createUserWithRole("indep_student@example.com", Roles.student, orgId, "سارا حسنی");

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgId,
      teacherId: independentTeacher.user.id,
      title: "پایگاه داده پیشرفته",
      inviteCode: "DB404",
      status: "active",
    });

    await memberStore.addMember({
      id: randomUUID(),
      classroomId: classroom.id,
      studentId: independentStudent.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/student/conversations",
      cookies: { avana_session: independentStudent.sessionToken },
      payload: {
        classroomId: classroom.id,
        category: "study_question",
        subject: "سؤال درباره سطوح ایزولاسیون تراکنش‌ها",
        body: "استاد گرامی تفاوت حالت Serializable با Repeatable Read در عمل چیست؟",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.conversation).toBeDefined();
    expect(body.conversation.teacherId).toBe(independentTeacher.user.id);
    expect(body.conversation.studentId).toBe(independentStudent.user.id);
    expect(body.message.body).toContain("تفاوت حالت Serializable");
  });
});
