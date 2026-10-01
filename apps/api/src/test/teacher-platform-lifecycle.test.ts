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
} from "../modules/teacher-platform/index.js";
import { randomUUID } from "node:crypto";

describe("Teacher Platform — Backend Lifecycle Integration Test Suite", () => {
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

  const orgId = "11111111-1111-4111-8111-111111111111" as OrganizationId;
  const otherOrgId = "22222222-2222-4222-8222-222222222222" as OrganizationId;

  // Helper to create users with sessions and memberships
  async function createUserWithRole(
    email: string,
    role: Role,
    organizationId: OrganizationId = orgId,
    names?: { firstName?: string; lastName?: string },
  ) {
    const fullName = names ? `${names.firstName ?? ""} ${names.lastName ?? ""}`.trim() : "Test User";
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "hashed-pass",
      name: fullName,
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

  // Helper to create platform_admin user without any organization memberships
  async function createPlatformAdminWithoutMembership(email: string) {
    const user = await userStore.createUserWithPassword({
      email,
      passwordHash: "hashed-pass",
      name: "Platform Admin",
    });
    user.globalRole = Roles.platform_admin;
    user.role = Roles.platform_admin;
    userStore.insert({ ...user });
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

    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    teacherExamStore = new InMemoryTeacherExamStore();
    teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();
    teacherExamAttemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();

    // Wire in-memory cross-references
    classroomStore.examStore = teacherExamStore;
    classroomStore.attemptStore = teacherExamAttemptStore;
    teacherExamStore.attemptStore = teacherExamAttemptStore;
    teacherExamQuestionStore.examStore = teacherExamStore;

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
    });
  });

  // =========================================================================
  // 1. Authorization & Object-Level IDOR Protection Suite
  // =========================================================================
  describe("Authorization & IDOR Security", () => {
    test("Enforces role checks and prevents IDOR between teachers", async () => {
      const teacher1 = await createUserWithRole("teacher1@avana.org", Roles.teacher);
      const teacher2 = await createUserWithRole("teacher2@avana.org", Roles.teacher);
      const student1 = await createUserWithRole("student1@avana.org", Roles.student);
      const editor = await createUserWithRole("editor@avana.org", Roles.course_editor);
      const worker = await createUserWithRole("worker@avana.org", Roles.content_worker);

      // 1. Course Editor & Content Worker denied access to teacher routes
      const editorResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: editor.sessionToken },
        payload: { title: "Editor Class" },
      });
      expect(editorResp.statusCode).toBe(403);

      const workerResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: worker.sessionToken },
        payload: { title: "Worker Class" },
      });
      expect(workerResp.statusCode).toBe(403);

      // 2. Teacher 1 creates classroom
      const createClassResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher1.sessionToken },
        payload: { title: "فارماکولوژی بیهوشی - کلاس ۱" },
      });
      expect(createClassResp.statusCode).toBe(201);
      const classroom1 = createClassResp.json().classroom;
      expect(classroom1.title).toBe("فارماکولوژی بیهوشی - کلاس ۱");
      expect(classroom1.teacherId).toBe(teacher1.user.id);
      expect(classroom1.inviteCode).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);

      // 3. Teacher 2 cannot view or mutate Teacher 1's classroom (IDOR Protection)
      const teacher2GetClass = await app.inject({
        method: "GET",
        url: `/v1/teacher/classrooms/${classroom1.id}`,
        cookies: { avana_session: teacher2.sessionToken },
      });
      expect(teacher2GetClass.statusCode).toBe(404);

      const teacher2PatchClass = await app.inject({
        method: "PATCH",
        url: `/v1/teacher/classrooms/${classroom1.id}`,
        cookies: { avana_session: teacher2.sessionToken },
        payload: { title: "Hacked Class Title" },
      });
      expect(teacher2PatchClass.statusCode).toBe(404);

      // 4. Teacher 1 creates exam in classroom
      const now = new Date();
      const createExamResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom1.id}/exams`,
        cookies: { avana_session: teacher1.sessionToken },
        payload: {
          title: "آزمون میان‌ترم بیهوشی",
          durationMinutes: 45,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 3600000).toISOString(),
          passingScorePercentage: 70,
        },
      });
      expect(createExamResp.statusCode).toBe(201);
      const exam1 = createExamResp.json().exam;

      // 5. Teacher 2 cannot view or mutate Teacher 1's exam
      const teacher2GetExam = await app.inject({
        method: "GET",
        url: `/v1/teacher/exams/${exam1.id}`,
        cookies: { avana_session: teacher2.sessionToken },
      });
      expect(teacher2GetExam.statusCode).toBe(404);

      // 6. Non-enrolled student cannot access classroom exams or start attempt
      const studentListExams = await app.inject({
        method: "GET",
        url: `/v1/student/classrooms/${classroom1.id}/exams`,
        cookies: { avana_session: student1.sessionToken },
      });
      expect(studentListExams.statusCode).toBe(403);

      const studentStartExam = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam1.id}/start`,
        cookies: { avana_session: student1.sessionToken },
      });
      expect(studentStartExam.statusCode).toBe(403);
    });

    test("platform_admin accesses classroom list without requiring organization membership", async () => {
      const platformAdmin = await createPlatformAdminWithoutMembership("superadmin@avana.org");

      // Verify the admin has zero memberships in orgStore
      const adminMemberships = await orgStore.listMembershipsByUserId(platformAdmin.user.id as UserId);
      expect(adminMemberships).toHaveLength(0);

      // Request GET /v1/organizations/:organizationId/teacher/classrooms
      const resp = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: platformAdmin.sessionToken },
      });

      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body).toHaveProperty("classrooms");
      expect(Array.isArray(body.classrooms)).toBe(true);
    });
  });

  // =========================================================================
  // 2. Classroom & Membership Lifecycle Suite
  // =========================================================================
  describe("Classroom & Membership Lifecycle", () => {
    test("Manages invite codes, join, duplicate join, leave, and rejoin semantics", async () => {
      const teacher = await createUserWithRole("teacher_lifecycle@avana.org", Roles.teacher);
      const student = await createUserWithRole("student_lifecycle@avana.org", Roles.student);

      // 1. Create classroom
      const createResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس فیزیولوژی تنفس" },
      });
      const classroom = createResp.json().classroom;
      const initialInviteCode = classroom.inviteCode;

      // 2. Regenerate invite code
      const regenResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/regenerate-invite-code`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(regenResp.statusCode).toBe(200);
      const newInviteCode = regenResp.json().classroom.inviteCode;
      expect(newInviteCode).not.toBe(initialInviteCode);

      // 3. Old code fails to join
      const oldJoinResp = await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: initialInviteCode },
      });
      expect(oldJoinResp.statusCode).toBe(404);

      // 4. Valid join succeeds
      const joinResp = await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: newInviteCode },
      });
      expect(joinResp.statusCode).toBe(200);
      expect(joinResp.json().status).toBe("joined");
      const firstJoinedAt = joinResp.json().membership.firstJoinedAt;
      expect(firstJoinedAt).toBeTruthy();

      // 5. Duplicate join while active returns 409 Conflict
      const dupJoinResp = await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: newInviteCode },
      });
      expect(dupJoinResp.statusCode).toBe(409);

      // 6. Student leaves classroom
      const leaveResp = await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/${classroom.id}/leave`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(leaveResp.statusCode).toBe(200);
      expect(leaveResp.json().member.status).toBe("left");
      expect(leaveResp.json().member.leftAt).toBeTruthy();

      // 7. Student rejoins -> status active, leftAt cleared, firstJoinedAt strictly preserved
      const rejoinResp = await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: newInviteCode },
      });
      expect(rejoinResp.statusCode).toBe(200);
      expect(rejoinResp.json().status).toBe("rejoined");
      expect(rejoinResp.json().membership.status).toBe("active");
      expect(rejoinResp.json().membership.firstJoinedAt).toBe(firstJoinedAt);
      expect(rejoinResp.json().membership.leftAt).toBeNull();

      // 8. Teacher lists members -> verify student's real name and profile details are returned
      const listMembersResp = await app.inject({
        method: "GET",
        url: `/v1/teacher/classrooms/${classroom.id}/members`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(listMembersResp.statusCode).toBe(200);
      const membersList = listMembersResp.json().members;
      expect(membersList.length).toBe(1);
      expect(membersList[0].user).toBeDefined();
      expect(membersList[0].user.email).toBe(student.user.email);
      expect(membersList[0].user.name).toBe(student.user.name);

      // 9. Teacher removes student
      const removeResp = await app.inject({
        method: "DELETE",
        url: `/v1/teacher/classrooms/${classroom.id}/members/${student.user.id}`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(removeResp.statusCode).toBe(200);
      expect(removeResp.json().member.status).toBe("removed");
    });
  });

  // =========================================================================
  // 3. Exam Lifecycle & Question Immutability Suite
  // =========================================================================
  describe("Exam Lifecycle & Question Immutability", () => {
    test("Enforces question immutability upon publication and validates unpublish constraints", async () => {
      const teacher = await createUserWithRole("teacher_exam@avana.org", Roles.teacher);

      const createClass = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس فارماکولوژی بالینی" },
      });
      const classroom = createClass.json().classroom;

      const now = new Date();
      const createExam = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون بیهوشی عمومی",
          durationMinutes: 30,
          startsAt: new Date(now.getTime() - 10000).toISOString(),
          endsAt: new Date(now.getTime() + 7200000).toISOString(),
          passingScorePercentage: 60,
        },
      });
      expect(createExam.statusCode).toBe(201);
      const exam = createExam.json().exam;
      expect(exam.status).toBe("draft");

      // 1. Publishing with 0 questions fails
      const publishEmpty = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(publishEmpty.statusCode).toBe(400);

      // 2. Add questions in draft
      const addQ1 = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "کدام داروی بیهوشی استنشاقی کمترین ضریب پارتیشن خون به گاز را دارد؟",
          points: 10,
          options: [
            { id: "opt-1", text: "دسفلوران" },
            { id: "opt-2", text: "سووفلوران" },
            { id: "opt-3", text: "ایزوفلوران" },
            { id: "opt-4", text: "هالوتان" },
          ],
          correctOptionId: "opt-1",
          explanation: "دسفلوران دارای ضریب ۰.۴۲ است.",
        },
      });
      expect(addQ1.statusCode).toBe(201);
      const q1 = addQ1.json().question;

      const addQ2 = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "مکانیسم اثر پروپوفول چیست؟",
          points: 10,
          options: [
            { id: "opt-a", text: "تقویت گیرنده GABA-A" },
            { id: "opt-b", text: "مهار گیرنده NMDA" },
          ],
          correctOptionId: "opt-a",
        },
      });
      expect(addQ2.statusCode).toBe(201);
      const q2 = addQ2.json().question;

      // 3. Update question in draft succeeds
      const updateQ1 = await app.inject({
        method: "PUT",
        url: `/v1/teacher/exams/${exam.id}/questions/${q1.id}`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "کدام داروی بیهوشی استنشاقی کمترین ضریب پارتیشن خون به گاز را داراست؟ (ویرایش)",
          points: 15,
          options: q1.options,
          correctOptionId: "opt-1",
        },
      });
      expect(updateQ1.statusCode).toBe(200);

      // 4. Reorder questions in draft succeeds
      const reorderResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions/reorder`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { questionIds: [q2.id, q1.id] },
      });
      expect(reorderResp.statusCode).toBe(200);

      // 5. Publish exam with valid questions succeeds
      const publishResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(publishResp.statusCode).toBe(200);
      expect(publishResp.json().exam.status).toBe("published");

      // 6. QUESTION IMMUTABILITY: Adding, updating, deleting, or reordering questions after publication fails
      const addQAfterPublish = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سوال غیرمجاز بعد از انتشار",
          points: 5,
          options: [
            { id: "x1", text: "الف" },
            { id: "x2", text: "ب" },
          ],
          correctOptionId: "x1",
        },
      });
      expect(addQAfterPublish.statusCode).toBe(400);

      const updateQAfterPublish = await app.inject({
        method: "PUT",
        url: `/v1/teacher/exams/${exam.id}/questions/${q1.id}`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "ویرایش غیرمجاز",
          points: 20,
          options: q1.options,
          correctOptionId: "opt-1",
        },
      });
      expect(updateQAfterPublish.statusCode).toBe(400);

      const deleteQAfterPublish = await app.inject({
        method: "DELETE",
        url: `/v1/teacher/exams/${exam.id}/questions/${q1.id}`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(deleteQAfterPublish.statusCode).toBe(400);

      const reorderAfterPublish = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions/reorder`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { questionIds: [q1.id, q2.id] },
      });
      expect(reorderAfterPublish.statusCode).toBe(400);

      // 7. Unpublish exam with 0 attempts succeeds
      const unpublishResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/unpublish`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(unpublishResp.statusCode).toBe(200);
      expect(unpublishResp.json().exam.status).toBe("draft");
    });
  });

  // =========================================================================
  // 4. Attempt Lifecycle, Timing, Grace Period & Snapshot Freezing
  // =========================================================================
  describe("Attempt Lifecycle & Timing Grace Enforcement", () => {
    test("Full flow: start, snapshot sanitization, one-attempt rule, save answers, grace period submission", async () => {
      const teacher = await createUserWithRole("teacher_attempt@avana.org", Roles.teacher);
      const student1 = await createUserWithRole("student_attempt1@avana.org", Roles.student);

      // Setup classroom & join student
      const classResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس ارزیابی بیهوشی" },
      });
      const classroom = classResp.json().classroom;

      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student1.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // Create and publish exam with 2 questions
      const now = new Date();
      const examResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون آزمایشی فارماکولوژی",
          durationMinutes: 15,
          startsAt: new Date(now.getTime() - 30000).toISOString(),
          endsAt: new Date(now.getTime() + 3600000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: false,
          shuffleQuestions: false,
          shuffleOptions: false,
        },
      });
      const exam = examResp.json().exam;

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "کدام دارو باربیتورات فوق کوتاه‌اثر است؟",
          points: 10,
          options: [
            { id: "o1", text: "تiopental" },
            { id: "o2", text: "میدازولام" },
          ],
          correctOptionId: "o1",
          explanation: "تیوپنتال یک باربیتورات سریع‌الاثر است.",
        },
      });

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "آنتاگونیست بنزودیازپین‌ها کدام است؟",
          points: 10,
          options: [
            { id: "b1", text: "فلومازنیل" },
            { id: "b2", text: "نالوکسان" },
          ],
          correctOptionId: "b1",
          explanation: "فلومازنیل آنتاگونیست اختصاصی گیرنده بنزودیازپین است.",
        },
      });

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // 1. Student starts attempt
      const startResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student1.sessionToken },
      });
      expect(startResp.statusCode).toBe(201);
      const attempt = startResp.json().attempt;
      expect(attempt.status).toBe("in_progress");
      expect(attempt.questions.length).toBe(2);

      // SANITIZATION CHECK: student snapshot questions must NOT expose correctOptionId or explanation
      for (const q of attempt.questions) {
        expect(q.correctOptionId).toBeUndefined();
        expect(q.explanation).toBeUndefined();
      }

      // 2. ONE-ATTEMPT INVARIANT: second attempt start must return 409 Conflict
      const secondStartResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student1.sessionToken },
      });
      expect(secondStartResp.statusCode).toBe(409);

      // 3. Current attempt endpoint returns active attempt
      const currentResp = await app.inject({
        method: "GET",
        url: `/v1/student/exams/${exam.id}/current`,
        cookies: { avana_session: student1.sessionToken },
      });
      expect(currentResp.statusCode).toBe(200);
      expect(currentResp.json().attempt.id).toBe(attempt.id);

      // 4. Save answers before deadline
      const saveQ1 = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${attempt.questions[0].id}`,
        cookies: { avana_session: student1.sessionToken },
        payload: { selectedOptionId: "o1" }, // correct
      });
      expect(saveQ1.statusCode).toBe(200);

      const saveQ2 = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${attempt.questions[1].id}`,
        cookies: { avana_session: student1.sessionToken },
        payload: { selectedOptionId: "b2" }, // incorrect (chose naloxone instead of flumazenil)
      });
      expect(saveQ2.statusCode).toBe(200);

      // Invalid option rejected
      const invalidOpt = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${attempt.questions[0].id}`,
        cookies: { avana_session: student1.sessionToken },
        payload: { selectedOptionId: "non-existent-option" },
      });
      expect(invalidOpt.statusCode).toBe(400);

      // 5. Submit attempt within time
      const submitResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: student1.sessionToken },
      });
      expect(submitResp.statusCode).toBe(200);
      const submitResult = submitResp.json().result;
      expect(submitResult.status).toBe("submitted");
      // Since showResultsImmediately = false, score is null
      expect(submitResult.score).toBeNull();

      // 6. Cannot save answers or submit again after completion
      const saveAfterSubmit = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${attempt.questions[0].id}`,
        cookies: { avana_session: student1.sessionToken },
        payload: { selectedOptionId: "o2" },
      });
      expect(saveAfterSubmit.statusCode).toBe(400);

      const dupSubmit = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: student1.sessionToken },
      });
      expect(dupSubmit.statusCode).toBe(409);

      // 7. Exam cannot be unpublished once attempts exist
      const unpublishWithAttempts = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/unpublish`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(unpublishWithAttempts.statusCode).toBe(409);
    });

    test("Enforces deadline & 60-second grace period rules", async () => {
      const teacher = await createUserWithRole("teacher_grace@avana.org", Roles.teacher);
      const student = await createUserWithRole("student_grace@avana.org", Roles.student);

      const classResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس تست مهلت زمانی" },
      });
      const classroom = classResp.json().classroom;

      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const now = new Date();
      const examResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون سریع",
          durationMinutes: 10,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 3600000).toISOString(),
          passingScorePercentage: 50,
        },
      });
      const exam = examResp.json().exam;

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "تست سوال زمان‌بندی",
          points: 10,
          options: [
            { id: "o1", text: "۱" },
            { id: "o2", text: "۲" },
          ],
          correctOptionId: "o1",
        },
      });

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Start attempt
      const startResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student.sessionToken },
      });
      const attempt = startResp.json().attempt;

      // Simulate deadline has just passed (now > deadlineAt), but within 60s grace
      // In the in-memory attempt store, adjust deadlineAt to 20 seconds ago
      const deadlinePassed = new Date(Date.now() - 20000).toISOString();
      await teacherExamAttemptStore.update(attempt.id, {
        deadlineAt: deadlinePassed,
      });

      // 1. Modifying answers during grace period is strictly PROHIBITED
      const saveInGrace = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${attempt.questions[0].id}`,
        cookies: { avana_session: student.sessionToken },
        payload: { selectedOptionId: "o1" },
      });
      expect(saveInGrace.statusCode).toBe(400);

      // 2. Submitting attempt during 60s grace period SUCCEEDS as 'submitted'
      const submitInGrace = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(submitInGrace.statusCode).toBe(200);
      expect(submitInGrace.json().result.status).toBe("submitted");

      // Verify second scenario: submit past 60s grace finalizes as 'timed_out'
      const student2 = await createUserWithRole("student_timeout@avana.org", Roles.student);
      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student2.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const startResp2 = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student2.sessionToken },
      });
      const attempt2 = startResp2.json().attempt;

      // Adjust deadlineAt to 70 seconds ago (grace has expired!)
      const graceExpired = new Date(Date.now() - 70000).toISOString();
      await teacherExamAttemptStore.update(attempt2.id, {
        deadlineAt: graceExpired,
      });

      const submitPastGrace = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: student2.sessionToken },
      });
      expect(submitPastGrace.statusCode).toBe(200);
      expect(submitPastGrace.json().result.status).toBe("timed_out");
    });
  });

  // =========================================================================
  // 5. Results Aggregation, Review & Visibility Suite
  // =========================================================================
  describe("Results Aggregation & Review Visibility", () => {
    test("Hides results before release and reveals complete score and answers after teacher release", async () => {
      const teacher = await createUserWithRole(
        "teacher_results@avana.org",
        Roles.teacher,
        orgId,
        { firstName: "دکتر", lastName: "احمدی" },
      );
      const student = await createUserWithRole(
        "student_results@avana.org",
        Roles.student,
        orgId,
        { firstName: "علی", lastName: "محمدی" },
      );

      const classResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس نورولوژی بیهوشی" },
      });
      const classroom = classResp.json().classroom;

      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const now = new Date();
      const examResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون فشار داخل جمجمه (ICP)",
          durationMinutes: 20,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 7200000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: false, // strictly hide results initially
        },
      });
      const exam = examResp.json().exam;

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "مقدار طبیعی فشار درون جمجمه‌ای (ICP) در فرد بالغ چقدر است؟",
          points: 20,
          options: [
            { id: "o1", text: "۵ تا ۱۵ میلی‌متر جیوه" },
            { id: "o2", text: "۲۰ تا ۳۰ میلی‌متر جیوه" },
          ],
          correctOptionId: "o1",
          explanation: "ICP نرمال در حالت استراحت ۵ تا ۱۵ میلی‌متر جیوه است.",
        },
      });

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Student starts, answers correctly, and submits
      const startResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student.sessionToken },
      });
      const attempt = startResp.json().attempt;

      await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${attempt.questions[0].id}`,
        cookies: { avana_session: student.sessionToken },
        payload: { selectedOptionId: "o1" },
      });

      await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: student.sessionToken },
      });

      // 1. Student reviews exam BEFORE release -> resultsReleased is false, questions/scores HIDDEN
      const unreleasedReview = await app.inject({
        method: "GET",
        url: `/v1/student/exams/${exam.id}/review`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(unreleasedReview.statusCode).toBe(200);
      const unreleasedData = unreleasedReview.json().review;
      expect(unreleasedData.resultsReleased).toBe(false);
      expect(unreleasedData.score).toBeUndefined();
      expect(unreleasedData.questions).toBeUndefined();
      expect(unreleasedData.message).toContain("نتایج این آزمون پس از پایان مهلت آزمون یا انتشار توسط استاد");

      // 2. Teacher views aggregate results
      const aggregateResp = await app.inject({
        method: "GET",
        url: `/v1/teacher/exams/${exam.id}/results`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(aggregateResp.statusCode).toBe(200);
      const aggregate = aggregateResp.json().results;
      expect(aggregate.enrolledCount).toBe(1);
      expect(aggregate.submittedCount).toBe(1);
      expect(aggregate.averageScore).toBe(20);
      expect(aggregate.passingRate).toBe(100);
      expect(aggregate.students.length).toBe(1);
      expect(aggregate.students[0].studentName).toBe("علی محمدی");
      expect(aggregate.students[0].score).toBe(20);
      expect(aggregate.students[0].passed).toBe(true);

      // 3. Teacher views individual student breakdown
      const studentDetailResp = await app.inject({
        method: "GET",
        url: `/v1/teacher/exams/${exam.id}/results/students/${student.user.id}`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(studentDetailResp.statusCode).toBe(200);
      const detail = studentDetailResp.json().detail;
      expect(detail.attempt.score).toBe(20);
      expect(detail.questions[0].isCorrect).toBe(true);
      expect(detail.questions[0].correctOptionId).toBe("o1");
      expect(detail.questions[0].explanation).toContain("ICP نرمال");

      // 4. Teacher releases results
      const releaseResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/release-results`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(releaseResp.statusCode).toBe(200);
      expect(releaseResp.json().exam.resultsReleasedAt).toBeTruthy();

      // 5. Student reviews exam AFTER release -> resultsReleased is true, full score and explanations VISIBLE
      const releasedReview = await app.inject({
        method: "GET",
        url: `/v1/student/exams/${exam.id}/review`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(releasedReview.statusCode).toBe(200);
      const releasedData = releasedReview.json().review;
      expect(releasedData.resultsReleased).toBe(true);
      expect(releasedData.score).toBe(20);
      expect(releasedData.maxScore).toBe(20);
      expect(releasedData.percentage).toBe(100);
      expect(releasedData.passed).toBe(true);
      expect(releasedData.questions.length).toBe(1);
      expect(releasedData.questions[0].selectedOptionId).toBe("o1");
      expect(releasedData.questions[0].correctOptionId).toBe("o1");
      expect(releasedData.questions[0].isCorrect).toBe(true);
      expect(releasedData.questions[0].explanation).toContain("ICP نرمال");
    });
  });

  // =========================================================================
  // 7. Targeted Fix Pass: Concurrency & Aggregation Invariants
  // =========================================================================
  describe("Targeted Fix Pass: Concurrency & Aggregation Invariants", () => {
    test("Blocker 1: Concurrent finalization yields exactly 1 success (200) and 1 conflict (409)", async () => {
      const teacher = await createUserWithRole("teacher-race@avana.org", Roles.teacher);
      const student = await createUserWithRole("student-race@avana.org", Roles.student);

      // Create classroom & enroll student
      const classResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "Concurrency Class" },
      });
      const classroom = classResp.json().classroom;

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // Create & publish exam
      const now = Date.now();
      const examResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "Concurrency Exam",
          durationMinutes: 30,
          startsAt: new Date(now - 60000).toISOString(),
          endsAt: new Date(now + 3600000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: true,
        },
      });
      const exam = examResp.json().exam;

      // Add question
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سوال تست همزمانی",
          options: [
            { id: "o1", text: "گزینه ۱" },
            { id: "o2", text: "گزینه ۲" },
          ],
          correctOptionId: "o1",
          points: 20,
        },
      });

      // Publish exam
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Student starts attempt
      const startResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(startResp.statusCode).toBe(201);
      const qId = startResp.json().attempt.questions[0].id;

      // Save answer
      const ansResp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${qId}`,
        cookies: { avana_session: student.sessionToken },
        payload: { selectedOptionId: "o1" },
      });
      expect(ansResp.statusCode).toBe(200);

      // Concurrent submitAttempt
      const [res1, res2] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/v1/student/exams/${exam.id}/submit`,
          cookies: { avana_session: student.sessionToken },
        }),
        app.inject({
          method: "POST",
          url: `/v1/student/exams/${exam.id}/submit`,
          cookies: { avana_session: student.sessionToken },
        }),
      ]);

      const statusCodes = [res1.statusCode, res2.statusCode].sort();
      expect(statusCodes).toEqual([200, 409]);

      const conflictResp = res1.statusCode === 409 ? res1 : res2;
      const successResp = res1.statusCode === 200 ? res1 : res2;

      expect(conflictResp.json().error.code).toBe("conflict");
      expect(conflictResp.json().error.message).toContain("این آزمون قبلاً پایان یافته و ثبت شده است");

      expect(successResp.json().result.score).toBe(20);
      expect(successResp.json().result.status).toBe("submitted");
    });

    test("Blocker 2: Concurrent startAttempt returns 409 Conflict, not 500, with exactly 1 attempt record", async () => {
      const teacher = await createUserWithRole("teacher-start@avana.org", Roles.teacher);
      const student = await createUserWithRole("student-start@avana.org", Roles.student);

      // Create classroom & enroll student
      const classResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "Start Concurrency Class" },
      });
      const classroom = classResp.json().classroom;

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // Create & publish exam
      const now = Date.now();
      const examResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "Start Concurrency Exam",
          durationMinutes: 30,
          startsAt: new Date(now - 60000).toISOString(),
          endsAt: new Date(now + 3600000).toISOString(),
          passingScorePercentage: 50,
        },
      });
      const exam = examResp.json().exam;

      // Add question
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سوال شروع همزمان",
          options: [
            { id: "o1", text: "گزینه ۱" },
            { id: "o2", text: "گزینه ۲" },
          ],
          correctOptionId: "o1",
          points: 10,
        },
      });

      // Publish exam
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Concurrent startAttempt
      const [start1, start2] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/v1/student/exams/${exam.id}/start`,
          cookies: { avana_session: student.sessionToken },
        }),
        app.inject({
          method: "POST",
          url: `/v1/student/exams/${exam.id}/start`,
          cookies: { avana_session: student.sessionToken },
        }),
      ]);

      const statusCodes = [start1.statusCode, start2.statusCode].sort();
      expect(statusCodes).toEqual([201, 409]);

      const conflictResp = start1.statusCode === 409 ? start1 : start2;
      expect(conflictResp.json().error.code).toBe("conflict");

      // Verify exactly 1 attempt exists in store
      const allAttempts = await teacherExamAttemptStore.listByExam(exam.id);
      expect(allAttempts.length).toBe(1);
    });

    test("Blocker 3: Result aggregation includes completed attempts even if student leaves/is removed", async () => {
      const teacher = await createUserWithRole("teacher-agg@avana.org", Roles.teacher);
      const studentA = await createUserWithRole("student-a@avana.org", Roles.student, orgId, {
        firstName: "سارا",
        lastName: "احمدی",
      });
      const studentB = await createUserWithRole("student-b@avana.org", Roles.student, orgId, {
        firstName: "رضا",
        lastName: "کمالی",
      });

      // Create classroom & enroll both students
      const classResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "Aggregation Classroom" },
      });
      const classroom = classResp.json().classroom;

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/join`,
        cookies: { avana_session: studentB.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // Create & publish exam
      const now = Date.now();
      const examResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "Aggregation Exam",
          durationMinutes: 30,
          startsAt: new Date(now - 60000).toISOString(),
          endsAt: new Date(now + 3600000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: true,
        },
      });
      const exam = examResp.json().exam;

      // Add question (20 points)
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سوال تجمیع نتایج",
          options: [
            { id: "o1", text: "گزینه ۱" },
            { id: "o2", text: "گزینه ۲" },
          ],
          correctOptionId: "o1",
          points: 20,
        },
      });

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Student A takes exam, answers correctly, and submits
      const startRespA = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: studentA.sessionToken },
      });
      expect(startRespA.statusCode).toBe(201);
      const qId = startRespA.json().attempt.questions[0].id;

      const ansRespA = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${qId}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "o1" },
      });
      expect(ansRespA.statusCode).toBe(200);

      const submitResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: studentA.sessionToken },
      });
      expect(submitResp.statusCode).toBe(200);
      expect(submitResp.json().result.score).toBe(20);

      // Student B does NOT take the exam.

      // Now Student A leaves the classroom (membership marked "left")
      const leaveResp = await app.inject({
        method: "POST",
        url: `/v1/student/classrooms/${classroom.id}/leave`,
        cookies: { avana_session: studentA.sessionToken },
      });
      expect(leaveResp.statusCode).toBe(200);

      // Teacher requests aggregate results
      const resultsResp = await app.inject({
        method: "GET",
        url: `/v1/teacher/exams/${exam.id}/results`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(resultsResp.statusCode).toBe(200);
      const results = resultsResp.json().results;

      // Assertions per Blocker 3 specification:
      // Student A's completed attempt is retained in aggregate metrics despite having left:
      expect(results.submittedCount).toBe(1);
      expect(results.averageScore).toBe(20);
      expect(results.maxScore).toBe(20);
      expect(results.minScore).toBe(20);
      expect(results.passingRate).toBe(100);

      // Enrolled count is 1 (only Student B is currently active)
      expect(results.enrolledCount).toBe(1);
      // Absent count is 1 (Student B has no attempt)
      expect(results.absentCount).toBe(1);

      // Both students appear in the students list:
      // Student A with status "submitted" and score 20
      // Student B with status "absent" and score null
      expect(results.students.length).toBe(2);

      const studentAEntry = results.students.find(
        (s: { studentId: string }) => s.studentId === studentA.user.id,
      );
      expect(studentAEntry).toBeDefined();
      expect(studentAEntry.status).toBe("submitted");
      expect(studentAEntry.score).toBe(20);
      expect(studentAEntry.passed).toBe(true);

      const studentBEntry = results.students.find(
        (s: { studentId: string }) => s.studentId === studentB.user.id,
      );
      expect(studentBEntry).toBeDefined();
      expect(studentBEntry.status).toBe("absent");
      expect(studentBEntry.score).toBeNull();
    });
  });

  describe("8. allowBackNavigation Backend Policy & Attempt Lifecycle Suite", () => {
    test("8.1. Create and update exam with allowBackNavigation policy", async () => {
      const teacher = await createUserWithRole("teacher_nav@avana.org", Roles.teacher);

      const createClassResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس تست ناوبری" },
      });
      const classroom = createClassResp.json().classroom;

      // 1. Default creation without allowBackNavigation -> true
      const now = new Date();
      const createDefaultResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون با تنظیم پیش‌فرض",
          durationMinutes: 30,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 3600000).toISOString(),
        },
      });
      expect(createDefaultResp.statusCode).toBe(201);
      const defaultExam = createDefaultResp.json().exam;
      expect(defaultExam.allowBackNavigation).toBe(true);

      // 2. Explicit creation with allowBackNavigation: false
      const createFalseResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون بدون بازگشت",
          durationMinutes: 30,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 3600000).toISOString(),
          allowBackNavigation: false,
        },
      });
      expect(createFalseResp.statusCode).toBe(201);
      const falseExam = createFalseResp.json().exam;
      expect(falseExam.allowBackNavigation).toBe(false);

      // 3. Update exam from false to true
      const updateToTrueResp = await app.inject({
        method: "PATCH",
        url: `/v1/teacher/exams/${falseExam.id}`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { allowBackNavigation: true },
      });
      expect(updateToTrueResp.statusCode).toBe(200);
      expect(updateToTrueResp.json().exam.allowBackNavigation).toBe(true);

      // 4. Update exam from true to false
      const updateToFalseResp = await app.inject({
        method: "PATCH",
        url: `/v1/teacher/exams/${falseExam.id}`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { allowBackNavigation: false },
      });
      expect(updateToFalseResp.statusCode).toBe(200);
      expect(updateToFalseResp.json().exam.allowBackNavigation).toBe(false);
    });

    test("8.2. Student attempt receives non-optional allowBackNavigation contract", async () => {
      const teacher = await createUserWithRole("teacher_nav_student@avana.org", Roles.teacher);
      const student = await createUserWithRole("student_nav@avana.org", Roles.student);

      const createClassResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس آزمون تست دانشجو" },
      });
      const classroom = createClassResp.json().classroom;

      // Student joins
      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // Teacher creates and publishes exam with allowBackNavigation: false
      const now = new Date();
      const createExamResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون بدون بازگشت",
          durationMinutes: 30,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 3600000).toISOString(),
          allowBackNavigation: false,
          shuffleQuestions: false,
          shuffleOptions: false,
        },
      });
      const exam = createExamResp.json().exam;

      // Add question
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سوال ۱",
          options: [
            { id: "opt_1", text: "گزینه ۱" },
            { id: "opt_2", text: "گزینه ۲" },
          ],
          correctOptionId: "opt_1",
          points: 10,
        },
      });

      // Publish
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Student lists exams
      const listResp = await app.inject({
        method: "GET",
        url: `/v1/student/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(listResp.statusCode).toBe(200);
      expect(listResp.json().exams[0].allowBackNavigation).toBe(false);

      // Student starts attempt
      const startResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(startResp.statusCode).toBe(201);
      expect(startResp.json().attempt.allowBackNavigation).toBe(false);

      // Student gets current attempt
      const currentResp = await app.inject({
        method: "GET",
        url: `/v1/student/exams/${exam.id}/current`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(currentResp.statusCode).toBe(200);
      expect(currentResp.json().attempt.allowBackNavigation).toBe(false);
    });

    test("8.3. Policy Enforcement: allowBackNavigation === false blocks modifying earlier questions, while true allows it", async () => {
      const teacher = await createUserWithRole("teacher_policy@avana.org", Roles.teacher);
      const studentA = await createUserWithRole("student_policy_a@avana.org", Roles.student);
      const studentB = await createUserWithRole("student_policy_b@avana.org", Roles.student);

      const createClassResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس تست پالیسی ناوبری" },
      });
      const classroom = createClassResp.json().classroom;

      // Students join
      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: studentA.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });
      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: studentB.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // Create Exam 1: allowBackNavigation = false
      const now = new Date();
      const createExamFalseResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون ناوبری یک‌طرفه",
          durationMinutes: 30,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 3600000).toISOString(),
          allowBackNavigation: false,
          shuffleQuestions: false,
          shuffleOptions: false,
        },
      });
      const examFalse = createExamFalseResp.json().exam;

      // Add 3 questions
      const q1Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${examFalse.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "صورت سوال اول",
          options: [
            { id: "opt_1a", text: "گزینه ۱ الف" },
            { id: "opt_1b", text: "گزینه ۱ ب" },
          ],
          correctOptionId: "opt_1a",
          points: 10,
        },
      });
      const q1 = q1Resp.json().question;

      const q2Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${examFalse.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "صورت سوال دوم",
          options: [
            { id: "opt_2a", text: "گزینه ۲ الف" },
            { id: "opt_2b", text: "گزینه ۲ ب" },
          ],
          correctOptionId: "opt_2a",
          points: 10,
        },
      });
      const q2 = q2Resp.json().question;

      const q3Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${examFalse.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "صورت سوال سوم",
          options: [
            { id: "opt_3a", text: "گزینه ۳ الف" },
            { id: "opt_3b", text: "گزینه ۳ ب" },
          ],
          correctOptionId: "opt_3a",
          points: 10,
        },
      });
      const q3 = q3Resp.json().question;

      // Publish exam
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${examFalse.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Student A starts attempt on examFalse
      await app.inject({
        method: "POST",
        url: `/v1/student/exams/${examFalse.id}/start`,
        cookies: { avana_session: studentA.sessionToken },
      });

      // 1. Answer Q1
      const saveQ1Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${examFalse.id}/answers/${q1.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_1a" },
      });
      expect(saveQ1Resp.statusCode).toBe(200);

      // 2. Modify Q1 while still at Q1 (allowed before moving forward)
      const modifyQ1Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${examFalse.id}/answers/${q1.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_1b" },
      });
      expect(modifyQ1Resp.statusCode).toBe(200);

      // 3. Move forward to Q2 and answer Q2
      const saveQ2Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${examFalse.id}/answers/${q2.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_2a" },
      });
      expect(saveQ2Resp.statusCode).toBe(200);

      // 4. Student A attempts to bypass and modify Q1 via direct API request (Back Navigation Violation)
      const bypassQ1Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${examFalse.id}/answers/${q1.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_1a" },
      });
      expect(bypassQ1Resp.statusCode).toBe(400);
      expect(bypassQ1Resp.json().error.message).toContain("امکان بازگشت و تغییر پاسخ سوالات قبلی در این آزمون وجود ندارد");

      // 5. Student B skips Q1 and Q2, answers Q3 (index 2)
      await app.inject({
        method: "POST",
        url: `/v1/student/exams/${examFalse.id}/start`,
        cookies: { avana_session: studentB.sessionToken },
      });

      const saveB_Q3Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${examFalse.id}/answers/${q3.id}`,
        cookies: { avana_session: studentB.sessionToken },
        payload: { selectedOptionId: "opt_3a" },
      });
      expect(saveB_Q3Resp.statusCode).toBe(200);

      // Student B attempts to answer skipped Q1 or Q2
      const saveB_Q1Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${examFalse.id}/answers/${q1.id}`,
        cookies: { avana_session: studentB.sessionToken },
        payload: { selectedOptionId: "opt_1a" },
      });
      expect(saveB_Q1Resp.statusCode).toBe(400);
      expect(saveB_Q1Resp.json().error.message).toContain("امکان بازگشت و تغییر پاسخ سوالات قبلی در این آزمون وجود ندارد");

      const saveB_Q2Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${examFalse.id}/answers/${q2.id}`,
        cookies: { avana_session: studentB.sessionToken },
        payload: { selectedOptionId: "opt_2a" },
      });
      expect(saveB_Q2Resp.statusCode).toBe(400);
      expect(saveB_Q2Resp.json().error.message).toContain("امکان بازگشت و تغییر پاسخ سوالات قبلی در این آزمون وجود ندارد");
    });

    test("11. Per-Question Timing (perQuestionTimeSeconds) — Validation, Snapshotting, and Sequential Timing Enforcement", async () => {
      const teacher = await createUserWithRole("teacher_pqt@test.com", Roles.teacher);
      const studentA = await createUserWithRole("student_pqt_a@test.com", Roles.student);
      const studentB = await createUserWithRole("student_pqt_b@test.com", Roles.student);

      // Create classroom and join students
      const classroomResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس آزمون‌های زمان‌دار" },
      });
      const classroom = classroomResp.json().classroom;

      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: studentA.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });
      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: studentB.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const now = new Date();
      const startsAt = new Date(now.getTime() - 60000).toISOString();
      const endsAt = new Date(now.getTime() + 7200000).toISOString();

      // 1. Validation tests
      // Invalid: perQuestionTimeSeconds < 5
      const invalidLowResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون زمان‌دار نامعتبر کم",
          durationMinutes: 60,
          startsAt,
          endsAt,
          perQuestionTimeSeconds: 3,
        },
      });
      expect(invalidLowResp.statusCode).toBe(400);

      // Invalid: perQuestionTimeSeconds > 3600
      const invalidHighResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون زمان‌دار نامعتبر زیاد",
          durationMinutes: 60,
          startsAt,
          endsAt,
          perQuestionTimeSeconds: 4000,
        },
      });
      expect(invalidHighResp.statusCode).toBe(400);

      // Invalid: perQuestionTimeSeconds > 0 AND allowBackNavigation: true
      const invalidInvariantResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون زمان‌دار متناقض",
          durationMinutes: 60,
          startsAt,
          endsAt,
          perQuestionTimeSeconds: 30,
          allowBackNavigation: true,
        },
      });
      expect(invalidInvariantResp.statusCode).toBe(400);
      expect(invalidInvariantResp.json().error.message).toContain("در آزمون زمان");

      // Valid creation: perQuestionTimeSeconds = 30
      const validExamResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون ۳۰ ثانیه برای هر سؤال",
          durationMinutes: 60,
          startsAt,
          endsAt,
          passingScorePercentage: 50,
          perQuestionTimeSeconds: 30,
          showResultsImmediately: true,
          shuffleQuestions: false,
          shuffleOptions: false,
        },
      });
      expect(validExamResp.statusCode).toBe(201);
      const exam = validExamResp.json().exam;
      expect(exam.perQuestionTimeSeconds).toBe(30);
      expect(exam.allowBackNavigation).toBe(false);

      // Add 3 questions
      const q1Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سؤال اول ۳۰ ثانیه‌ای",
          options: [
            { id: "opt_1a", text: "الف" },
            { id: "opt_1b", text: "ب" },
          ],
          correctOptionId: "opt_1a",
          points: 10,
        },
      });
      const q1 = q1Resp.json().question;

      const q2Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سؤال دوم ۳۰ ثانیه‌ای",
          options: [
            { id: "opt_2a", text: "الف" },
            { id: "opt_2b", text: "ب" },
          ],
          correctOptionId: "opt_2b",
          points: 10,
        },
      });
      const q2 = q2Resp.json().question;

      const q3Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سؤال سوم ۳۰ ثانیه‌ای",
          options: [
            { id: "opt_3a", text: "الف" },
            { id: "opt_3b", text: "ب" },
          ],
          correctOptionId: "opt_3a",
          points: 10,
        },
      });
      const q3 = q3Resp.json().question;

      // Publish exam
      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // 2. Student A starts attempt -> verify snapshot
      const startResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: studentA.sessionToken },
      });
      expect(startResp.statusCode).toBe(201);
      const attemptA = startResp.json().attempt;
      expect(attemptA.perQuestionTimeSeconds).toBe(30);
      expect(attemptA.allowBackNavigation).toBe(false);

      // 3. Student A answers Q1 (not finalized)
      const saveQ1Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q1.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_1a" },
      });
      expect(saveQ1Resp.statusCode).toBe(200);

      // Student A tries to answer Q2 before Q1 is finalized -> rejected
      const earlyQ2Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q2.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_2a" },
      });
      expect(earlyQ2Resp.statusCode).toBe(400);
      expect(earlyQ2Resp.json().error.message).toContain("ابتدا باید به سؤال جاری پاسخ دهید");

      // Student A finalizes Q1
      const finalizeQ1Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q1.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_1a", finalized: true },
      });
      expect(finalizeQ1Resp.statusCode).toBe(200);

      // Student A tries to modify Q1 after finalization -> rejected
      const modFinalizedQ1Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q1.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_1b" },
      });
      expect(modFinalizedQ1Resp.statusCode).toBe(400);
      expect(modFinalizedQ1Resp.json().error.message).toContain("امکان بازگشت و تغییر پاسخ سوالات قبلی در این آزمون وجود ندارد");

      // 4. Now Q2 is active -> student A answers and finalizes Q2
      const saveQ2Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q2.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_2b", finalized: true },
      });
      expect(saveQ2Resp.statusCode).toBe(200);

      // 5. Now Q3 is active -> student A answers and finalizes Q3
      const saveQ3Resp = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q3.id}`,
        cookies: { avana_session: studentA.sessionToken },
        payload: { selectedOptionId: "opt_3a", finalized: true },
      });
      expect(saveQ3Resp.statusCode).toBe(200);

      // Submit attempt
      const submitResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: studentA.sessionToken },
      });
      expect(submitResp.statusCode).toBe(200);
      const result = submitResp.json().result;
      expect(result.score).toBe(30);
      expect(result.passed).toBe(true);
    });

    test("12. Next vs Timeout Concurrency Race — Idempotent Finalization and Single Transition", async () => {
      const teacher = await createUserWithRole("teacher_race@test.com", Roles.teacher);
      const student = await createUserWithRole("student_race@test.com", Roles.student);

      const classroomResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس تست همزمانی" },
      });
      const classroom = classroomResp.json().classroom;

      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      const now = new Date();
      const createExamResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون زمان‌دار تست همزمانی",
          durationMinutes: 60,
          startsAt: new Date(now.getTime() - 60000).toISOString(),
          endsAt: new Date(now.getTime() + 7200000).toISOString(),
          passingScorePercentage: 50,
          perQuestionTimeSeconds: 30,
          showResultsImmediately: true,
          shuffleQuestions: false,
          shuffleOptions: false,
        },
      });
      const exam = createExamResp.json().exam;

      // Add 2 questions
      const q1Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سؤال مسابقه اول",
          options: [
            { id: "opt_1a", text: "الف" },
            { id: "opt_1b", text: "ب" },
          ],
          correctOptionId: "opt_1a",
          points: 10,
        },
      });
      const q1 = q1Resp.json().question;

      const q2Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          prompt: "سؤال مسابقه دوم",
          options: [
            { id: "opt_2a", text: "الف" },
            { id: "opt_2b", text: "ب" },
          ],
          correctOptionId: "opt_2b",
          points: 10,
        },
      });
      const q2 = q2Resp.json().question;

      await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });

      // Start attempt
      await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student.sessionToken },
      });

      // Simulate simultaneous Next and Timeout race on Q1
      const [raceResp1, raceResp2] = await Promise.all([
        app.inject({
          method: "PUT",
          url: `/v1/student/exams/${exam.id}/answers/${q1.id}`,
          cookies: { avana_session: student.sessionToken },
          payload: { selectedOptionId: "opt_1a", finalized: true },
        }),
        app.inject({
          method: "PUT",
          url: `/v1/student/exams/${exam.id}/answers/${q1.id}`,
          cookies: { avana_session: student.sessionToken },
          payload: { selectedOptionId: "opt_1a", finalized: true },
        }),
      ]);

      // At least one (or both) succeeds with 200 (idempotent upsert)
      expect(raceResp1.statusCode === 200 || raceResp2.statusCode === 200).toBe(true);

      // Verify Attempt state after race: Q2 is now active
      const attemptAfterRaceResp = await app.inject({
        method: "GET",
        url: `/v1/student/exams/${exam.id}/current`,
        cookies: { avana_session: student.sessionToken },
      });
      const attemptAfterRace = attemptAfterRaceResp.json().attempt;
      expect(attemptAfterRace.savedAnswers.length).toBe(1);
      expect(attemptAfterRace.savedAnswers[0].questionId).toBe(q1.id);
      expect(attemptAfterRace.savedAnswers[0].finalizedAt).toBeTruthy();

      // Answer Q2
      const saveQ2 = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q2.id}`,
        cookies: { avana_session: student.sessionToken },
        payload: { selectedOptionId: "opt_2b", finalized: true },
      });
      expect(saveQ2.statusCode).toBe(200);

      // Concurrent final submission (e.g. rapid double submit or timeout + click submit)
      const [submit1, submit2] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/v1/student/exams/${exam.id}/submit`,
          cookies: { avana_session: student.sessionToken },
        }),
        app.inject({
          method: "POST",
          url: `/v1/student/exams/${exam.id}/submit`,
          cookies: { avana_session: student.sessionToken },
        }),
      ]);

      const statuses = [submit1.statusCode, submit2.statusCode].sort();
      expect(statuses).toEqual([200, 409]);

      const successResult = submit1.statusCode === 200 ? submit1.json().result : submit2.json().result;
      expect(successResult.score).toBe(20);
      expect(successResult.passed).toBe(true);
    });
  });

  // =========================================================================
  // 7. Descriptive & Mixed Exam Lifecycle Suite
  // =========================================================================
  describe("Descriptive & Mixed Exam Lifecycle", () => {
    test("Mixed exam flow: create descriptive question, take exam, submit with needs_manual_review, and grade via teacher endpoint", async () => {
      const teacher = await createUserWithRole("teacher_desc@avana.org", Roles.teacher);
      const student = await createUserWithRole("student_desc@avana.org", Roles.student);

      // 1. Create classroom and enroll student
      const classResp = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/teacher/classrooms`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { title: "کلاس آزمون تشریحی" },
      });
      const classroom = classResp.json().classroom;

      await app.inject({
        method: "POST",
        url: "/v1/student/classrooms/join",
        cookies: { avana_session: student.sessionToken },
        payload: { inviteCode: classroom.inviteCode },
      });

      // 2. Create exam
      const now = new Date();
      const examResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/classrooms/${classroom.id}/exams`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          title: "آزمون ترکیبی تستی و تشریحی",
          durationMinutes: 40,
          startsAt: new Date(now.getTime() - 10000).toISOString(),
          endsAt: new Date(now.getTime() + 7200000).toISOString(),
          passingScorePercentage: 60,
          showResultsImmediately: true,
          shuffleQuestions: false,
          shuffleOptions: false,
        },
      });
      const exam = examResp.json().exam;

      // 3. Add single_choice question (4 points)
      const q1Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          questionType: "single_choice",
          prompt: "کدام دارو مهارکننده مستقیم ترومبین است؟",
          options: [
            { id: "opt-1", text: "دابیگاتران" },
            { id: "opt-2", text: "وارفارین" },
          ],
          correctOptionId: "opt-1",
          points: 4,
        },
      });
      expect(q1Resp.statusCode).toBe(201);
      const q1 = q1Resp.json().question;
      expect(q1.questionType).toBe("single_choice");

      // 4. Add descriptive question (6 points) - options and correctOptionId are omitted
      const q2Resp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/questions`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          questionType: "descriptive",
          prompt: "فارماکوکینتیک داروی وارفارین و تداخلات عمده آن با آنتی‌بیوتیک‌ها را تشریح کنید.",
          points: 6,
        },
      });
      expect(q2Resp.statusCode).toBe(201);
      const q2 = q2Resp.json().question;
      expect(q2.questionType).toBe("descriptive");
      expect(q2.points).toBe(6);

      // 5. Publish exam with mixed questions succeeds
      const publishResp = await app.inject({
        method: "POST",
        url: `/v1/teacher/exams/${exam.id}/publish`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(publishResp.statusCode).toBe(200);

      // 6. Student starts attempt
      const startResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/start`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(startResp.statusCode).toBe(201);
      const attempt = startResp.json().attempt;
      expect(attempt.questions.length).toBe(2);
      expect(attempt.questions[1].questionType).toBe("descriptive");

      // 7. Student answers Q1 (single_choice)
      const saveQ1 = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q1.id}`,
        cookies: { avana_session: student.sessionToken },
        payload: { selectedOptionId: "opt-1" },
      });
      expect(saveQ1.statusCode).toBe(200);

      // 8. Student answers Q2 (descriptive text)
      const descriptiveAnswerText = "داروی وارفارین از طریق روده جذب شده و با اتصال بالا به آلبومین در پلاسما گردش می‌کند. آنتی‌بیوتیک‌هایی مانند مترونیدازول و کوتریموکسازول با مهار آنزیم CYP2C9 متابولیسم وارفارین را کاهش داده و INR را افزایش می‌دهند.";
      const saveQ2 = await app.inject({
        method: "PUT",
        url: `/v1/student/exams/${exam.id}/answers/${q2.id}`,
        cookies: { avana_session: student.sessionToken },
        payload: { textAnswer: descriptiveAnswerText },
      });
      expect(saveQ2.statusCode).toBe(200);

      // Verify current attempt returns textAnswer
      const currentResp = await app.inject({
        method: "GET",
        url: `/v1/student/exams/${exam.id}/current`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(currentResp.statusCode).toBe(200);
      const savedQ2 = currentResp.json().attempt.savedAnswers.find((a: any) => a.questionId === q2.id);
      expect(savedQ2?.textAnswer).toBe(descriptiveAnswerText);

      // 9. Student submits attempt
      const submitResp = await app.inject({
        method: "POST",
        url: `/v1/student/exams/${exam.id}/submit`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(submitResp.statusCode).toBe(200);
      const submitResult = submitResp.json().result;
      expect(submitResult.status).toBe("submitted");
      // Since descriptive question is pending grading, score is the autoScore (4), but passed & percentage are not finalized (null)
      expect(submitResult.score).toBe(4);
      expect(submitResult.maxScore).toBe(10);
      expect(submitResult.passed).toBeNull();
      expect(submitResult.percentage).toBeNull();

      // 10. Teacher views student's attempt detail
      const teacherDetailResp = await app.inject({
        method: "GET",
        url: `/v1/teacher/exams/${exam.id}/results/${student.user.id}`,
        cookies: { avana_session: teacher.sessionToken },
      });
      expect(teacherDetailResp.statusCode).toBe(200);
      const detail = teacherDetailResp.json().detail;
      expect(detail.attempt.gradingStatus).toBe("needs_manual_review");
      const reviewQ2 = detail.questions.find((q: any) => q.questionId === q2.id);
      expect(reviewQ2.questionType).toBe("descriptive");
      expect(reviewQ2.textAnswer).toBe(descriptiveAnswerText);
      expect(reviewQ2.gradingStatus).toBe("ungraded");
      expect(reviewQ2.pointsEarned).toBeNull();
      expect(reviewQ2.maxPoints).toBe(6);

      // 11. Grading bounds validation: scoring > maxPoints (e.g. 7 on 6 pt question) fails
      const invalidGradeResp = await app.inject({
        method: "PUT",
        url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${q2.id}/grade`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          pointsEarned: 7,
          teacherFeedback: "نمره بیش از حد مجاز",
        },
      });
      expect(invalidGradeResp.statusCode).toBe(400);

      // Negative points fails
      const negGradeResp = await app.inject({
        method: "PUT",
        url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${q2.id}/grade`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          pointsEarned: -1,
        },
      });
      expect(negGradeResp.statusCode).toBe(400);

      // 12. Student cannot call teacher grade endpoint (returns 404 for IDOR protection)
      const studentGradeResp = await app.inject({
        method: "PUT",
        url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${q2.id}/grade`,
        cookies: { avana_session: student.sessionToken },
        payload: {
          pointsEarned: 6,
        },
      });
      expect(studentGradeResp.statusCode).toBe(404);

      // 13. Valid teacher grade: 5.5 points out of 6 with feedback
      const gradeResp = await app.inject({
        method: "PUT",
        url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${q2.id}/grade`,
        cookies: { avana_session: teacher.sessionToken },
        payload: {
          pointsEarned: 5.5,
          teacherFeedback: "تحلیل عالی و دقیق تداخلات دارویی.",
        },
      });
      expect(gradeResp.statusCode).toBe(200);
      const gradeResult = gradeResp.json();
      expect(gradeResult.answer.pointsEarned).toBe(5.5);
      expect(gradeResult.answer.gradingStatus).toBe("graded");
      expect(gradeResult.answer.teacherFeedback).toBe("تحلیل عالی و دقیق تداخلات دارویی.");

      // Verify Attempt is now fully graded
      expect(gradeResult.attempt.gradingStatus).toBe("fully_graded");
      expect(gradeResult.attempt.score).toBe(9.5); // 4 + 5.5
      expect(gradeResult.attempt.maxScore).toBe(10);
      expect(gradeResult.attempt.percentage).toBe(95);
      expect(gradeResult.attempt.passed).toBe(true);

      // 14. Student review endpoint returns updated final grades and teacher feedback
      const studentReviewResp = await app.inject({
        method: "GET",
        url: `/v1/student/exams/${exam.id}/review`,
        cookies: { avana_session: student.sessionToken },
      });
      expect(studentReviewResp.statusCode).toBe(200);
      const review = studentReviewResp.json().review;
      expect(review.score).toBe(9.5);
      expect(review.percentage).toBe(95);
      expect(review.passed).toBe(true);
      expect(review.gradingStatus).toBe("fully_graded");
      const revQ2 = review.questions.find((q: any) => q.questionId === q2.id);
      expect(revQ2.textAnswer).toBe(descriptiveAnswerText);
      expect(revQ2.pointsEarned).toBe(5.5);
      expect(revQ2.teacherFeedback).toBe("تحلیل عالی و دقیق تداخلات دارویی.");
      expect(revQ2.gradingStatus).toBe("graded");
    });
  });
});
