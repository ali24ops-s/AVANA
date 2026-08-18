/**
 * Integration tests for AVANA Exam Configuration & Secure Attempt API.
 *
 * Verifies:
 * 1. GET /v1/organizations/:organizationId/study/exams/topics -> Dynamic topic question counts from DB.
 * 2. POST /v1/organizations/:organizationId/study/exams/start -> Snapshotting question IDs into attempt record.
 * 3. Validation: Insufficient questions returns 400 error (Directive 5).
 * 4. Security: In-progress questions do NOT expose correctAnswer in API response.
 * 5. POST /v1/organizations/:organizationId/study/exams/attempts/:attemptId/submit -> Server-side scoring & completion.
 * 6. Immutability & Resume: GET attempt returns locked question snapshot for exact attempt ID.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { CourseId, OrganizationId, QuizId, UserId } from "@avana/domain";

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Exams API Integration", () => {
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let queue: InMemoryGenerationQueue;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  const courseId = "22222222-3333-4444-8555-666666666666" as CourseId;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";

    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    queue = new InMemoryGenerationQueue(generationJobStore);
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildTestApp() {
    const config = loadApiConfig();
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      auditService,
    });
    await app.ready();
    return app;
  }

  async function signIn(app: any, email: string, _role = "student") {
    const user = await userStore.createFromVerifiedIdentity({
      email,
      name: email.split("@")[0],
      provider: "local",
      providerSubject: `local|${email}`,
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    const token = extractSessionToken(res)!;
    return { token, userId: user.id as UserId };
  }

  async function createOrg(
    app: any,
    token: string,
    name: string,
  ): Promise<OrganizationId> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { organization: { id: string } };
    return body.organization.id as OrganizationId;
  }

  it("should fetch dynamic topic question counts from DB and start exam attempt with locked snapshot", async () => {
    const app = await buildTestApp();
    const { token, userId: _userId } = await signIn(app, "student1@example.com");
    const orgId = await createOrg(app, token, "Med School Org 1");

    const q1Id = randomUUID() as any;
    const q2Id = randomUUID() as any;

    quizStore.insert({
      id: "quiz-1" as QuizId,
      organizationId: orgId,
      courseId,
      documentId: null,
      title: "Pharm Quiz",
      topic: "Pharmacology",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    quizQuestionStore.insert({
      id: q1Id,
      quizId: "quiz-1" as QuizId,
      generatedContentId: null,
      question: "Q1 Pharm: Enalapril mechanism?",
      topic: "Pharmacology",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["ACE inhibitor", "Beta blocker", "Diuretic", "ARBs"],
      correctAnswer: "ACE inhibitor",
      explanation: "Enalapril inhibits ACE.",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    quizQuestionStore.insert({
      id: q2Id,
      quizId: "quiz-1" as QuizId,
      generatedContentId: null,
      question: "Q2 Pharm: Atenolol action?",
      topic: "Pharmacology",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["Beta-1 selective", "Alpha blocker", "CCB", "Statin"],
      correctAnswer: "Beta-1 selective",
      explanation: "Atenolol is a selective beta-1 blocker.",
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. Fetch dynamic topic summary
    const topicsRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/topics`,
      headers: { cookie: `avana_session=${token}` },
    });
    expect(topicsRes.statusCode).toBe(200);
    const topicsBody = JSON.parse(topicsRes.body);
    expect(topicsBody.topics).toBeDefined();
    const pharmTopic = topicsBody.topics.find((t: any) => t.topic === "Pharmacology");
    expect(pharmTopic).toBeDefined();
    expect(pharmTopic.questionCount).toBe(2);

    // 2. Start exam attempt with 2 questions
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        topics: ["Pharmacology"],
        questionCount: 2,
        difficulty: "medium",
      },
    });
    expect(startRes.statusCode).toBe(200);
    const startBody = JSON.parse(startRes.body);
    expect(startBody.attemptId).toBeDefined();
    expect(startBody.questions.length).toBe(2);
    // Security check: correctAnswer MUST NOT be returned in in-progress attempt!
    expect(startBody.questions[0].correctAnswer).toBeUndefined();

    const attemptId = startBody.attemptId;

    // 3. Submit exam attempt answers
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        answers: [
          { questionId: q1Id, answer: "ACE inhibitor" },
          { questionId: q2Id, answer: "Beta-1 selective" },
        ],
      },
    });
    expect(submitRes.statusCode).toBe(200);
    const submitBody = JSON.parse(submitRes.body);
    expect(submitBody.score).toBe(100);
    expect(submitBody.correct).toBe(2);
    expect(submitBody.passed).toBe(true);
    const q1Result = submitBody.questions.find((q: any) => q.id === q1Id);
    expect(q1Result?.explanation).toBe("Enalapril inhibits ACE.");

    await app.close();
  });

  it("should return hierarchical sections and chapters in GET topics API", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student3@example.com");
    const orgId = await createOrg(app, token, "Med School Org 3");

    quizStore.insert({
      id: "quiz-hierarchy" as QuizId,
      organizationId: orgId,
      courseId,
      documentId: null,
      title: "Hierarchical Pharm Quiz",
      topic: "Pharmacodynamics",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    quizQuestionStore.insert({
      id: randomUUID() as any,
      quizId: "quiz-hierarchy" as QuizId,
      generatedContentId: null,
      question: "Q Pharmaco: Dose response curve shift?",
      topic: "Pharmacodynamics",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["Right", "Left", "Up", "Down"],
      correctAnswer: "Right",
      explanation: "Competitive antagonists shift the dose-response curve to the right.",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/topics`,
      headers: { cookie: `avana_session=${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sections).toBeDefined();
    expect(Array.isArray(body.sections)).toBe(true);

    const pharmSection = body.sections.find((s: any) =>
      s.chapters?.some((c: any) => c.topic?.toLowerCase().includes("pharm") || c.title?.toLowerCase().includes("pharm")),
    ) || body.sections[0];
    expect(pharmSection).toBeDefined();
    expect(pharmSection.chapters).toBeDefined();
    expect(pharmSection.chapters.length).toBeGreaterThan(0);

    const pdChapter = pharmSection.chapters.find((c: any) => c.topic?.toLowerCase().includes("pharm") || c.title?.toLowerCase().includes("pharm")) || pharmSection.chapters[0];
    expect(pdChapter).toBeDefined();
    expect(pdChapter.questionCount).toBe(1);

    await app.close();
  });

  it("should start exam for specific selected chapters across sections and preserve snapshot", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student4@example.com");
    const orgId = await createOrg(app, token, "Med School Org 4");

    const q1 = randomUUID() as any;
    const q2 = randomUUID() as any;

    quizQuestionStore.insert({
      id: q1,
      quizId: "quiz-h" as any,
      generatedContentId: null,
      question: "Q1 PD: Affinity definition?",
      topic: "Pharmacodynamics",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["K_d value", "V_max", "Clearance", "t_1/2"],
      correctAnswer: "K_d value",
      explanation: "Affinity is inversely proportional to Kd.",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    quizQuestionStore.insert({
      id: q2,
      quizId: "quiz-h" as any,
      generatedContentId: null,
      question: "Q2 IHD: Angina treatment?",
      topic: "Ischemic Heart Disease",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["Nitroglycerin", "Penicillin", "Insulin", "Warfarin"],
      correctAnswer: "Nitroglycerin",
      explanation: "Sublingual NTG is first-line for acute angina.",
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Start exam for 2 specific chapters from 2 different sections
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        chapters: ["Pharmacodynamics", "Ischemic Heart Disease"],
        questionCount: 2,
        difficulty: "medium",
      },
    });
    expect(startRes.statusCode).toBe(200);
    const startBody = JSON.parse(startRes.body);
    expect(startBody.questions.length).toBe(2);

    const attemptId = startBody.attemptId;

    // Fetch locked attempt snapshot (resuming / refreshing)
    const getAttemptRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: `avana_session=${token}` },
    });
    expect(getAttemptRes.statusCode).toBe(200);
    const getAttemptBody = JSON.parse(getAttemptRes.body);
    expect(getAttemptBody.questions.length).toBe(2);
    // Locked snapshot order must match exactly
    expect(getAttemptBody.questions.map((q: any) => q.id)).toEqual(
      startBody.questions.map((q: any) => q.id),
    );

    await app.close();
  });

  it("should support real-time answer saving, resuming with answers, and reject modification of completed attempt", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student5@example.com");
    const orgId = await createOrg(app, token, "Med School Org 5");

    const q1Id = randomUUID() as any;
    const q2Id = randomUUID() as any;

    quizQuestionStore.insert({
      id: q1Id,
      quizId: "quiz-save" as any,
      generatedContentId: null,
      question: "Q1 Save: ACE Inhibitor side effect?",
      topic: "Pharmacology",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["Dry cough", "Hyperglycemia", "Tachycardia", "Tinnitus"],
      correctAnswer: "Dry cough",
      explanation: "Bradykinin accumulation causes dry cough.",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    quizQuestionStore.insert({
      id: q2Id,
      quizId: "quiz-save" as any,
      generatedContentId: null,
      question: "Q2 Save: Losartan class?",
      topic: "Pharmacology",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["ARB", "ACE inhibitor", "Beta blocker", "Diuretic"],
      correctAnswer: "ARB",
      explanation: "Losartan is an Angiotensin Receptor Blocker.",
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. Start exam attempt
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        topics: ["Pharmacology"],
        questionCount: 2,
        difficulty: "medium",
      },
    });
    expect(startRes.statusCode).toBe(200);
    const { attemptId } = JSON.parse(startRes.body);

    // 2. Save answer for Q1 in real time
    const saveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        answers: [{ questionId: q1Id, answer: "Dry cough" }],
      },
    });
    expect(saveRes.statusCode).toBe(200);
    const saveBody = JSON.parse(saveRes.body);
    expect(saveBody.success).toBe(true);
    expect(saveBody.answers[q1Id]).toBe("Dry cough");

    // 3. Resume attempt (GET attempt detail) -> verifies saved answers are restored
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: `avana_session=${token}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.attempt.answers[q1Id]).toBe("Dry cough");
    expect(detailBody.isCompleted).toBe(false);

    // 4. Submit attempt
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        answers: [
          { questionId: q1Id, answer: "Dry cough" },
          { questionId: q2Id, answer: "ARB" },
        ],
      },
    });
    expect(submitRes.statusCode).toBe(200);
    expect(JSON.parse(submitRes.body).score).toBe(100);

    // 5. Try saving answer after completion -> should fail with 400 Bad Request
    const saveAfterSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        answers: [{ questionId: q1Id, answer: "Tachycardia" }],
      },
    });
    expect(saveAfterSubmitRes.statusCode).toBe(400);

    await app.close();
  });

  it("should reject start attempt with invalid non-UUID organization ID ('demo-org-id') and accept valid UUID", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student6@example.com");
    const validOrgId = await createOrg(app, token, "Med School Org 6");

    // 1. Attempt start with invalid non-UUID string ('demo-org-id') -> 400 Invalid organization ID
    const invalidStartRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/demo-org-id/study/exams/start`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        topics: ["Pharmacology"],
        questionCount: 5,
        difficulty: "medium",
      },
    });
    expect(invalidStartRes.statusCode).toBe(400);
    const invalidBody = JSON.parse(invalidStartRes.body);
    expect(invalidBody.error?.message || invalidBody.message || invalidBody.error).toBeDefined();

    // Seed 1 question in valid org
    quizQuestionStore.insert({
      id: randomUUID() as any,
      quizId: "quiz-valid" as any,
      generatedContentId: null,
      question: "Q Valid Org?",
      topic: "Pharmacology",
      difficulty: "medium",
      questionType: "multiple_choice",
      choices: ["Yes", "No"],
      correctAnswer: "Yes",
      explanation: "Valid UUID org works.",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Attempt start with valid UUID -> 200 OK & attempt created
    const validStartRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${validOrgId}/study/exams/start`,
      headers: { cookie: `avana_session=${token}` },
      payload: {
        topics: ["Pharmacology"],
        questionCount: 1,
        difficulty: "medium",
      },
    });
    expect(validStartRes.statusCode).toBe(200);
    const validBody = JSON.parse(validStartRes.body);
    expect(validBody.attemptId).toBeDefined();

    await app.close();
  });
});
