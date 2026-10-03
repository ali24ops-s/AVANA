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

describe("Descriptive Answer Integrity & Behavioral Telemetry Suite", () => {
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
  });

  afterEach(async () => {
    await app.close();
  });

  test("Full E2E Flow: Save descriptive answer with Paste & Rapid Input telemetry, finalize attempt, and retrieve teacher integrity analysis", async () => {
    const teacher = await createUserWithRole("teacher-integrity@avana.ir", Roles.teacher);
    const student = await createUserWithRole("student-integrity@avana.ir", Roles.student);

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

    // 2. Create Exam with a Descriptive Question
    const now = Date.now();
    const examResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/exams`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        title: "آزمون تشریحی فارماکولوژی",
        durationMinutes: 45,
        startsAt: new Date(now - 10000).toISOString(),
        endsAt: new Date(now + 3600000).toISOString(),
        passingScorePercentage: 60,
      },
    });
    expect(examResp.statusCode).toBe(201);
    const exam = examResp.json().exam;

    const qResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/exams/${exam.id}/questions`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        questionType: "descriptive",
        prompt: "مکانیسم اثر داروهای مسدودکننده گیرنده بتا را به طور مشروح توضیح دهید.",
        points: 10,
        explanation: "داروهای بتابلوکر با اتصال رقابتی به گیرنده‌های بتا-۱ و بتا-۲ اثر می‌کنند.",
      },
    });
    expect(qResp.statusCode).toBe(201);
    const question = qResp.json().question;

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

    // 5. Student Saves Descriptive Answer with Paste & Rapid Input Telemetry
    const textAnswer = "داروهای مسدودکننده گیرنده بتا (Beta Blockers) با مهار رقابتی اثرات کاتکول‌آمین‌ها بر گیرنده‌های آدرنرژیک بتا عمل می‌کنند.";
    const saveResp = await app.inject({
      method: "PUT",
      url: `/v1/student/exams/${exam.id}/answers/${question.id}`,
      cookies: { avana_session: student.sessionToken },
      payload: {
        textAnswer,
        activeDurationMs: 45000,
        tabSwitchesCount: 1,
        integrityData: {
          startedAt: new Date(now - 30000).toISOString(),
          lastEditedAt: new Date(now - 5000).toISOString(),
          durationMs: 25000,
          editCount: 6,
          pasteCount: 1,
          pastedCharactersTotal: 25,
          pastedWordsTotal: 3,
          rapidInputCount: 0,
          rapidInputCharactersTotal: 0,
          rapidInputWordsTotal: 0,
          pasteEvents: [
            {
              timestamp: new Date(now - 15000).toISOString(),
              characterCount: 25,
              wordCount: 3,
              cursorPosition: 10,
            },
          ],
          timeline: [
            { type: "start", timestamp: new Date(now - 30000).toISOString() },
            { type: "typing", timestamp: new Date(now - 25000).toISOString(), characterDelta: 20 },
            { type: "paste", timestamp: new Date(now - 15000).toISOString(), characterDelta: 25, wordDelta: 3 },
            { type: "edit", timestamp: new Date(now - 5000).toISOString(), characterDelta: 40 },
          ],
        },
      },
    });
    expect(saveResp.statusCode).toBe(200);

    // Verify stored answer directly: clipboard content is NEVER stored
    const storedAnswers = await teacherExamAttemptAnswerStore.listByAttempt(attempt.id);
    expect(storedAnswers.length).toBe(1);
    const storedAns = storedAnswers[0];
    expect(storedAns.integrityMetadata).toBeDefined();
    expect(storedAns.integrityMetadata?.pasteCount).toBe(1);
    expect(storedAns.integrityMetadata?.pastedCharactersTotal).toBe(25);
    // Ensure no clipboard text or foreign source field is present
    expect((storedAns.integrityMetadata as any).clipboardText).toBeUndefined();
    expect((storedAns.integrityMetadata as any).sourceApplication).toBeUndefined();

    // 6. Student Submits Attempt
    const submitResp = await app.inject({
      method: "POST",
      url: `/v1/student/exams/${exam.id}/submit`,
      cookies: { avana_session: student.sessionToken },
    });
    expect(submitResp.statusCode).toBe(200);

    // 7. Teacher Views Student Result Detail
    const teacherResultResp = await app.inject({
      method: "GET",
      url: `/v1/teacher/exams/${exam.id}/results/${student.user.id}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(teacherResultResp.statusCode).toBe(200);
    const resultBody = teacherResultResp.json();
    const questionsList = resultBody.result?.questions ?? resultBody.questions;
    expect(questionsList).toBeDefined();
    expect(questionsList.length).toBe(1);

    const qReview = questionsList[0];
    expect(qReview.integrityAnalysis).toBeDefined();
    expect(qReview.integrityAnalysis.pasteDetected).toBe(true);
    expect(qReview.integrityAnalysis.pasteCount).toBe(1);
    expect(qReview.integrityAnalysis.pastedCharactersTotal).toBe(25);
    expect(qReview.integrityAnalysis.finalAnswerCharacters).toBe(textAnswer.length);
    expect(qReview.integrityAnalysis.editCount).toBe(6);
    expect(qReview.integrityAnalysis.timeline.length).toBe(4);
    expect(qReview.integrityAnalysis.signals).toContain("تعداد ۱ عملیات Paste در ورود پاسخ ثبت شده است.");
  });

  test("Sanitization & Bounds Checking: Handles negative, NaN, and oversized payloads safely without error", async () => {
    const teacher = await createUserWithRole("teacher-sanitize@avana.ir", Roles.teacher);
    const student = await createUserWithRole("student-sanitize@avana.ir", Roles.student);

    const classResp = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/teacher/classrooms`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { title: "کلاس تست ایمنی" },
    });
    const classroom = classResp.json().classroom;

    await app.inject({
      method: "POST",
      url: "/v1/student/classrooms/join",
      cookies: { avana_session: student.sessionToken },
      payload: { inviteCode: classroom.inviteCode },
    });

    const now = Date.now();
    const examResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/exams`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        title: "آزمون ایمنی",
        startsAt: new Date(now - 5000).toISOString(),
        endsAt: new Date(now + 3600000).toISOString(),
      },
    });
    const exam = examResp.json().exam;

    const qResp = await app.inject({
      method: "POST",
      url: `/v1/teacher/exams/${exam.id}/questions`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        questionType: "descriptive",
        prompt: "سوال تست ایمنی پی‌لود",
        points: 5,
      },
    });
    const question = qResp.json().question;

    await app.inject({
      method: "POST",
      url: `/v1/teacher/exams/${exam.id}/publish`,
      cookies: { avana_session: teacher.sessionToken },
    });

    await app.inject({
      method: "POST",
      url: `/v1/student/exams/${exam.id}/start`,
      cookies: { avana_session: student.sessionToken },
    });

    // Send malformed / negative / NaN / oversized values
    const saveResp = await app.inject({
      method: "PUT",
      url: `/v1/student/exams/${exam.id}/answers/${question.id}`,
      cookies: { avana_session: student.sessionToken },
      payload: {
        textAnswer: "پاسخ ایمن",
        integrityData: {
          startedAt: "invalid-date",
          durationMs: -999999,
          editCount: -50,
          pasteCount: -10,
          pastedCharactersTotal: -500,
          pastedWordsTotal: -100,
          rapidInputCount: -5,
          rapidInputCharactersTotal: -200,
          rapidInputWordsTotal: -50,
        },
      },
    });
    expect(saveResp.statusCode).toBe(200);

    const teacherResultResp = await app.inject({
      method: "GET",
      url: `/v1/teacher/exams/${exam.id}/results/${student.user.id}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(teacherResultResp.statusCode).toBe(200);
    const resultBody = teacherResultResp.json();
    const questionsList = resultBody.result?.questions ?? resultBody.questions;
    const analysis = questionsList[0].integrityAnalysis;
    expect(analysis.pasteDetected).toBe(false);
    expect(analysis.pasteCount).toBe(0);
    expect(analysis.editCount).toBe(0);
  });
});
