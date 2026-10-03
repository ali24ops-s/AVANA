import { describe, test, expect, beforeEach, afterEach } from "vitest";
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

describe("Teacher Platform — Descriptive Grading & Decimal Precision End-to-End Suite", () => {
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

    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Test Organization",
        slug: "test-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId: "admin-user" as UserId,
        role: Roles.org_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    teacherExamStore = new InMemoryTeacherExamStore();
    teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();
    teacherExamAttemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();

    classroomStore.examStore = teacherExamStore;
    classroomStore.attemptStore = teacherExamAttemptStore;
    teacherExamStore.attemptStore = teacherExamAttemptStore;
    teacherExamQuestionStore.examStore = teacherExamStore;
    teacherExamAttemptStore.answerStore = teacherExamAttemptAnswerStore;

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

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  test("Full End-to-End: Lifecycle of exam, student attempt, descriptive manual grading, decimal precision (0.01 step), attemptId identity, and reload persistence", async () => {
    const teacher = await createUserWithRole("teacher-grade@avana.ir", Roles.teacher);
    const student = await createUserWithRole("student-grade@avana.ir", Roles.student);

    // 1. Create Classroom & Enroll Student
    const classResp = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/teacher/classrooms`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { title: "کلاس فارماکولوژی" },
    });
    expect(classResp.statusCode).toBe(201);
    const classroom = classResp.json().classroom;

    const joinResp = await app.inject({
      method: "POST",
      url: "/v1/student/classrooms/join",
      cookies: { avana_session: student.sessionToken },
      payload: { inviteCode: classroom.inviteCode },
    });
    expect(joinResp.statusCode).toBe(200);

    // 2. Create Exam with Descriptive Question and Multiple Choice Question
    const now = Date.now();
    const examResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/exams`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        title: "آزمون جامع تشریحی",
        durationMinutes: 45,
        startsAt: new Date(now - 10000).toISOString(),
        endsAt: new Date(now + 3600000).toISOString(),
        passingScorePercentage: 50,
      },
    });
    expect(examResp.statusCode).toBe(201);
    const exam = examResp.json().exam;

    const qDescResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/exams/${exam.id}/questions`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        questionType: "descriptive",
        prompt: "مکانیسم اثر داروهای مسدودکننده گیرنده بتا را به طور مشروح توضیح دهید.",
        points: 1,
        explanation: "داروهای بتابلوکر با اتصال رقابتی به گیرنده‌های بتا اثر می‌کنند.",
      },
    });
    expect(qDescResp.statusCode).toBe(201);
    const qDesc = qDescResp.json().question;

    const qMcResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/exams/${exam.id}/questions`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        questionType: "single_choice",
        prompt: "کدام دارو بتابلوکر اختصاصی بتا-۱ است؟",
        points: 1,
        options: [
          { id: "opt-1", text: "متوپرولول" },
          { id: "opt-2", text: "پروپرانولول" },
          { id: "opt-3", text: "آتنولول" },
          { id: "opt-4", text: "کارودیلول" },
        ],
        correctOptionId: "opt-1",
      },
    });
    expect(qMcResp.statusCode).toBe(201);
    const qMc = qMcResp.json().question;

    // 3. Publish Exam
    const pubResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/exams/${exam.id}/publish`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(pubResp.statusCode).toBe(200);

    // 4. Student Starts Attempt
    const startResp = await app.inject({
      method: "POST",
      url: `/v1/student/exams/${exam.id}/start`,
      cookies: { avana_session: student.sessionToken },
    });
    expect(startResp.statusCode).toBe(201);
    const attempt = startResp.json().attempt;

    // 5. Student submits answers
    await app.inject({
      method: "PUT",
      url: `/v1/student/exams/${exam.id}/answers/${qDesc.id}`,
      cookies: { avana_session: student.sessionToken },
      payload: {
        textAnswer: "مهار رقابتی گیرنده‌های آدرنرژیک و کاهش اینوتروپی و کرونوتروپی قلبی.",
      },
    });

    await app.inject({
      method: "PUT",
      url: `/v1/student/exams/${exam.id}/answers/${qMc.id}`,
      cookies: { avana_session: student.sessionToken },
      payload: {
        selectedOptionId: "opt-1",
      },
    });

    const finishResp = await app.inject({
      method: "POST",
      url: `/v1/student/exams/${exam.id}/submit`,
      cookies: { avana_session: student.sessionToken },
    });
    expect(finishResp.statusCode).toBe(200);

    // 6. Teacher reviews student attempt result
    const reviewResp = await app.inject({
      method: "GET",
      url: `/v1/teacher/exams/${exam.id}/results/${student.user.id}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(reviewResp.statusCode).toBe(200);
    const reviewData = reviewResp.json().result;

    // Verify canonical attemptId and id are present and match attempt.id
    expect(reviewData.attempt.attemptId).toBe(attempt.id);
    expect(reviewData.attempt.id).toBe(attempt.id);
    expect(reviewData.attempt.attemptId).not.toBe(exam.id);
    expect(reviewData.attempt.gradingStatus).toBe("needs_manual_review");

    // 7. Verify attemptId isolation: Passing exam.id as attemptId MUST return 404
    const badGradeResp = await app.inject({
      method: "PUT",
      url: `/v1/teacher/exams/${exam.id}/attempts/${exam.id}/answers/${qDesc.id}/grade`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        pointsEarned: 0.37,
      },
    });
    expect(badGradeResp.statusCode).toBe(404);

    // 8. Successfully grade descriptive question with decimal score (0.37) using canonical attempt.id
    const gradeResp = await app.inject({
      method: "PUT",
      url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${qDesc.id}/grade`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        pointsEarned: 0.37,
        teacherFeedback: "بخش اول توضیح دقیق بود.",
      },
    });
    expect(gradeResp.statusCode).toBe(200);
    const gradeData = gradeResp.json();
    expect(gradeData.answer.pointsEarned).toBe(0.37);
    expect(gradeData.answer.gradingStatus).toBe("graded");
    // MC = 1 pt, Descriptive = 0.37 pt -> Total score = 1.37 out of 2, percentage = 68.5%
    expect(gradeData.attempt.score).toBe(1.37);
    expect(gradeData.attempt.percentage).toBe(68.5);
    expect(gradeData.attempt.passed).toBe(true);
    expect(gradeData.attempt.gradingStatus).toBe("fully_graded");

    // 9. Reload student result and verify exact decimal preservation
    const reloadResp = await app.inject({
      method: "GET",
      url: `/v1/teacher/exams/${exam.id}/results/${student.user.id}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(reloadResp.statusCode).toBe(200);
    const reloaded = reloadResp.json().result;
    expect(reloaded.attempt.score).toBe(1.37);
    expect(reloaded.attempt.percentage).toBe(68.5);
    const descReview = reloaded.questions.find((q: { questionId: string }) => q.questionId === qDesc.id);
    expect(descReview.pointsEarned).toBe(0.37);
    expect(descReview.teacherFeedback).toBe("بخش اول توضیح دقیق بود.");

    // 10. Update existing grade to another decimal (0.86)
    const updateGradeResp = await app.inject({
      method: "PUT",
      url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${qDesc.id}/grade`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        pointsEarned: 0.86,
        teacherFeedback: "پاسخ کامل ارزیابی شد.",
      },
    });
    expect(updateGradeResp.statusCode).toBe(200);
    const updateGradeData = updateGradeResp.json();
    expect(updateGradeData.answer.pointsEarned).toBe(0.86);
    // MC = 1, Desc = 0.86 -> 1.86 / 2 = 93%
    expect(updateGradeData.attempt.score).toBe(1.86);
    expect(updateGradeData.attempt.percentage).toBe(93);

    // 11. Test grade boundary & invalid submissions
    // Reject negative score
    const negResp = await app.inject({
      method: "PUT",
      url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${qDesc.id}/grade`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { pointsEarned: -0.01 },
    });
    expect(negResp.statusCode).toBe(400);

    // Reject score exceeding maxPoints (1.01 > 1.0)
    const overMaxResp = await app.inject({
      method: "PUT",
      url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${qDesc.id}/grade`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { pointsEarned: 1.01 },
    });
    expect(overMaxResp.statusCode).toBe(400);

    // Reject score with > 2 decimal places (0.001, 0.009, 0.999, 1.001)
    for (const invalidPrecision of [0.001, 0.009, 0.999, 1.001]) {
      const precisionResp = await app.inject({
        method: "PUT",
        url: `/v1/teacher/exams/${exam.id}/attempts/${attempt.id}/answers/${qDesc.id}/grade`,
        cookies: { avana_session: teacher.sessionToken },
        payload: { pointsEarned: invalidPrecision },
      });
      expect(precisionResp.statusCode).toBe(400);
      expect(precisionResp.json().error.message).toContain("حداکثر می‌تواند ۲ رقم اعشار داشته باشد");
    }
  });
});
