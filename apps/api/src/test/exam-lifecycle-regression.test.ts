/**
 * Comprehensive Exam Attempt Lifecycle Regression Test Suite (Scenarios A through M).
 *
 * Verifies strict lifecycle invariants:
 * A) Start -> answer -> leave -> Attempt is still in_progress / incomplete.
 * B) Start -> answer -> leave -> Recent Exams -> Resuming returns exact same attemptId.
 * C) Previous answers remain intact after resume.
 * D) Timer stops upon exit (pause).
 * E) Timer resumes from previously saved elapsedSeconds.
 * F) Refresh / re-fetching attempt does not complete the attempt.
 * G) Route change / navigation away does not complete the attempt.
 * H) Finish confirmation cancel -> Attempt remains in_progress.
 * I) Finish confirmation approve -> Attempt becomes completed with score.
 * J) Completed attempt cannot be modified (saveAnswer rejected).
 * K) Resume does not create a duplicate attempt.
 * L) Special Exam / randomized exam does not re-randomize upon resume.
 * M) Concurrent race between save answer / pause / resume / submit handled cleanly.
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
  type QuizQuestionRecord,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  InMemoryCommerceStore,
} from "../modules/commerce/commerce-store.js";
import { asUserEntitlementId, asUserSubscriptionId, asProductId } from "@avana/domain";

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Exam Attempt Lifecycle Comprehensive Regression", () => {
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
  let commerceStore: InMemoryCommerceStore;
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
    commerceStore = new InMemoryCommerceStore();
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
      generationQueue: queue,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      commerceStore,
      auditService,
    });
    await app.ready();
    return app;
  }

  async function setupTestEnvironment() {
    const app = await buildTestApp();
    const email = `student-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;

    // 1. Seed user & sign in
    const user = await userStore.createFromVerifiedIdentity({
      email,
      name: "دانشجو",
      provider: "local",
      providerSubject: `local|${email}`,
    });
    const userId = user.id as UserId;

    const authRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "دانشجو" },
    });
    const token = extractSessionToken(authRes)!;
    const cookieHeader = `avana_session=${token}`;

    // 2. Seed organization & membership
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: "دانشگاه علوم پزشکی تهران" },
    });
    const orgId = JSON.parse(orgRes.body).organization.id as OrganizationId;

    // Seed active student subscription for configured exams
    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId,
      planId: asProductId(randomUUID()),
      status: "active",
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      autoRenew: false,
      gateway: "mock",
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed general pool quiz
    quizStore.insert({
      id: "general-exam-pool" as QuizId,
      organizationId: orgId,
      courseId,
      documentId: null,
      title: "داروهای قلب و عروق",
      topic: "داروهای قلب و عروق",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 3. Seed 10 mock questions for exams
    const questions: QuizQuestionRecord[] = [];
    for (let i = 1; i <= 10; i++) {
      const qId = `q-cardio-${i}` as QuizQuestionId;
      const qRecord: QuizQuestionRecord = {
        id: qId,
        quizId: "general-exam-pool" as QuizId,
        question: `سؤال فارماکولوژی قلب شماره ${i}: مکانیسم اثر داروی گروه ${i} چیست؟`,
        choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
        correctAnswer: "گزینه الف",
        explanation: `توضیح تشریحی سؤال ${i}: گزینه الف پاسخ صحیح است.`,
        difficulty: i % 2 === 0 ? "hard" : "medium",
        questionType: "multiple_choice",
        topic: "داروهای قلب و عروق",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        sortOrder: i,
      };
      quizQuestionStore.insert(qRecord);
      questions.push(qRecord);
    }

    return { app, userId, orgId, cookieHeader, questions };
  }

  it("Scenarios A, B, C: Start -> Answer -> Leave -> Reopen from History -> Resume same attempt & answers", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    // 1. Start exam attempt
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        topics: ["داروهای قلب و عروق"],
        questionCount: 4,
        difficulty: "all",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const startData = startRes.json();
    const attemptId = startData.attemptId;
    expect(attemptId).toBeDefined();
    expect(startData.questions).toHaveLength(4);

    // Verify questions in start response have correctAnswer hidden
    expect(startData.questions[0].correctAnswer).toBeUndefined();

    // 2. Answer question 1 and save elapsed time (e.g. 45 seconds)
    const q1 = startData.questions[0];
    const saveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: q1.id, answer: "گزینه الف" }],
        elapsedSeconds: 45,
      },
    });
    expect(saveRes.statusCode).toBe(200);

    // 3. User leaves / unmounts (Scenario A: Attempt is STILL in_progress, NOT completed)
    const historyRes1 = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieHeader },
    });
    expect(historyRes1.statusCode).toBe(200);
    const history1 = historyRes1.json().items;
    const historyItem = history1.find((h: any) => h.attemptId === attemptId);
    expect(historyItem).toBeDefined();
    expect(historyItem.status).toBe("in_progress");
    expect(historyItem.completedAt).toBeNull();

    // 4. User re-opens attempt from Recent Exams (Scenario B: Exact same attemptId returned)
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(getRes.statusCode).toBe(200);
    const resumed = getRes.json();
    expect(resumed.attempt.id).toBe(attemptId);
    expect(resumed.isCompleted).toBe(false);

    // Scenario C: Answers and elapsed seconds are preserved
    expect(resumed.answers[q1.id]).toBe("گزینه الف");
    expect(resumed.attempt.metrics.elapsedSeconds).toBe(45);
    expect(resumed.questions).toHaveLength(4);
    // Security: still masked during active resume
    expect(resumed.questions[0].correctAnswer).toBeUndefined();
  });

  it("Scenarios D, E: Timer pause on leave & resume from accumulated elapsed seconds", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    // 1. Start exam
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { questionCount: 4, difficulty: "all" },
    });
    const attemptId = startRes.json().attemptId;

    // 2. User spends 120 seconds in session 1, then leaves
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: { answers: [], elapsedSeconds: 120 },
    });

    // 3. Check attempt on server (Scenario D: paused at 120s)
    let detailRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(detailRes.json().attempt.metrics.elapsedSeconds).toBe(120);

    // 4. User resumes 30 minutes later and spends another 60 seconds (total 180s)
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: { answers: [], elapsedSeconds: 180 },
    });

    // Scenario E: Resumed elapsed seconds monotonically increase
    detailRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(detailRes.json().attempt.metrics.elapsedSeconds).toBe(180);
    expect(detailRes.json().isCompleted).toBe(false);
  });

  it("Scenarios F, G: Page refresh or route navigation does NOT complete attempt", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { questionCount: 3, difficulty: "all" },
    });
    const attemptId = startRes.json().attemptId;

    // Simulate 5 consecutive page refreshes / route transitions
    for (let i = 1; i <= 5; i++) {
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
        headers: { cookie: cookieHeader },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().isCompleted).toBe(false);
      expect(getRes.json().attempt.status).toBe("in_progress");
      expect(getRes.json().attempt.completedAt).toBeNull();
    }
  });

  it("Scenarios H, I, J: Cancel modal keeps active; Confirm finish completes; Completed is immutable", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { questionCount: 2, difficulty: "all" },
    });
    const startData = startRes.json();
    const attemptId = startData.attemptId;
    const [q1, q2] = startData.questions;

    // Scenario H: User decides not to submit (cancel modal) -> Still in_progress
    const checkRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(checkRes.json().isCompleted).toBe(false);

    // Scenario I: User confirms finish -> POST /submit
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [
          { questionId: q1.id, answer: "گزینه الف" }, // correct
          { questionId: q2.id, answer: "گزینه ب" }, // incorrect
        ],
        elapsedSeconds: 200,
      },
    });

    expect(submitRes.statusCode).toBe(200);
    const submitData = submitRes.json();
    expect(submitData.attempt.score).toBe(50); // 1 of 2
    expect(submitData.correct).toBe(1);
    expect(submitData.total).toBe(2);
    expect(submitData.completedAt).toBeDefined();

    // Verify GET attempt now returns isCompleted: true and full explanations
    const finishedGet = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(finishedGet.json().isCompleted).toBe(true);
    expect(finishedGet.json().questions[0].correctAnswer).toBe("گزینه الف");
    expect(finishedGet.json().questions[0].explanation).toBeDefined();

    // Scenario J: Modifying completed attempt is strictly rejected
    const trySaveAfterFinish = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: q1.id, answer: "گزینه تغییر یافته" }],
      },
    });
    expect(trySaveAfterFinish.statusCode).toBe(400);
  });

  it("Scenario K: Resume does not create duplicate attempts in history", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { questionCount: 2, difficulty: "all" },
    });
    const attemptId = startRes.json().attemptId;

    // Simulate opening attempt 3 times
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
        headers: { cookie: cookieHeader },
      });
    }

    const historyRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieHeader },
    });
    const items = historyRes.json().items;
    const matching = items.filter((h: any) => h.attemptId === attemptId);
    expect(matching).toHaveLength(1);
  });

  it("Scenario L: Question snapshot is completely frozen across resumes (no re-randomization)", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { questionCount: 5, difficulty: "all" },
    });
    const startData = startRes.json();
    const attemptId = startData.attemptId;
    const originalQIds = startData.questions.map((q: any) => q.id);

    // Resume multiple times
    for (let i = 0; i < 3; i++) {
      const resumeRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
        headers: { cookie: cookieHeader },
      });
      const currentQIds = resumeRes.json().questions.map((q: any) => q.id);
      expect(currentQIds).toEqual(originalQIds);
    }
  });

  it("Scenario M: Concurrent race between save answer / pause / resume / submit handled cleanly", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { questionCount: 3, difficulty: "all" },
    });
    const startData = startRes.json();
    const attemptId = startData.attemptId;
    const [q1, q2] = startData.questions;

    // Execute concurrent save answer and status checks
    const [res1, res2, res3] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
        headers: { cookie: cookieHeader },
        payload: { answers: [{ questionId: q1.id, answer: "گزینه الف" }], elapsedSeconds: 30 },
      }),
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
        headers: { cookie: cookieHeader },
        payload: { answers: [{ questionId: q2.id, answer: "گزینه ب" }], elapsedSeconds: 35 },
      }),
      app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
        headers: { cookie: cookieHeader },
      }),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res3.statusCode).toBe(200);

    // Verify both answers merged safely without race condition loss
    const verifyGet = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    const answers = verifyGet.json().answers;
    expect(answers[q1.id]).toBe("گزینه الف");
    expect(answers[q2.id]).toBe("گزینه ب");
    expect(verifyGet.json().isCompleted).toBe(false);

    // Concurrent submit calls are idempotent
    const [sub1, sub2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
        headers: { cookie: cookieHeader },
        payload: { answers: [{ questionId: q1.id, answer: "گزینه الف" }], elapsedSeconds: 50 },
      }),
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
        headers: { cookie: cookieHeader },
        payload: { answers: [{ questionId: q1.id, answer: "گزینه الف" }], elapsedSeconds: 50 },
      }),
    ]);

    expect(sub1.statusCode).toBe(200);
    expect(sub2.statusCode).toBe(200);
    expect(sub1.json().attempt.id).toBe(attemptId);
    expect(sub2.json().attempt.id).toBe(attemptId);
  });

  it("End-to-End Real-User 11-Step Verification Scenario", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    // 1. Start exam
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        topics: ["داروهای قلب و عروق"],
        questionCount: 3,
        difficulty: "all",
      },
    });
    expect(startRes.statusCode).toBe(200);
    const startData = startRes.json();
    const attemptId = startData.attemptId;
    const originalQuestions = startData.questions;
    const [q1, q2, q3] = originalQuestions;

    // 2. Answer question 1 and question 2
    // 3. Spend 60 seconds active time inside exam
    const saveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [
          { questionId: q1.id, answer: "گزینه الف" },
          { questionId: q2.id, answer: "گزینه ب" },
        ],
        elapsedSeconds: 60,
      },
    });
    expect(saveRes.statusCode).toBe(200);

    // 4. Leave exam page WITHOUT clicking finish -> Go to Recent Exams
    // 5. Verification:
    const historyRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieHeader },
    });
    expect(historyRes.statusCode).toBe(200);
    const historyItem = historyRes.json().items.find((h: any) => h.attemptId === attemptId);
    expect(historyItem).toBeDefined();
    expect(historyItem.status).toBe("in_progress");
    expect(historyItem.completedAt).toBeNull();

    // Invariant: leave exam != submit exam
    const getLeaveRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(getLeaveRes.json().isCompleted).toBe(false);
    expect(getLeaveRes.json().attempt.status).toBe("in_progress");
    expect(getLeaveRes.json().attempt.completedAt).toBeNull();
    expect(getLeaveRes.json().answers[q1.id]).toBe("گزینه الف");
    expect(getLeaveRes.json().answers[q2.id]).toBe("گزینه ب");
    expect(getLeaveRes.json().attempt.metrics.elapsedSeconds).toBe(60);

    // 6. User spends 1 hour (3600s) away from the app
    // Invariant: time spent outside exam != elapsed exam time
    // Server elapsed seconds remain strictly 60s
    const midCheck = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(midCheck.json().attempt.metrics.elapsedSeconds).toBe(60);

    // 7. User clicks 'ادامه آزمون' (Resume) from Recent Exams
    // 8. Verification:
    const resumeRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(resumeRes.statusCode).toBe(200);
    const resumeData = resumeRes.json();
    expect(resumeData.attempt.id).toBe(attemptId);
    expect(resumeData.questions.map((q: any) => q.id)).toEqual(originalQuestions.map((q: any) => q.id));
    expect(resumeData.answers[q1.id]).toBe("گزینه الف");
    expect(resumeData.answers[q2.id]).toBe("گزینه ب");
    expect(resumeData.attempt.metrics.elapsedSeconds).toBe(60);

    // 9. User spends another 30 seconds inside exam (total 90s) answering question 3
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: q3.id, answer: "گزینه ج" }],
        elapsedSeconds: 90,
      },
    });

    // 10. User clicks 'Finish Exam' modal -> Clicks Cancel in confirmation modal
    // Verify attempt remains in_progress
    const cancelCheck = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(cancelCheck.json().isCompleted).toBe(false);
    expect(cancelCheck.json().attempt.status).toBe("in_progress");

    // 11. User clicks Finish -> Confirms submission in modal
    const finalSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [
          { questionId: q1.id, answer: "گزینه الف" },
          { questionId: q2.id, answer: "گزینه ب" },
          { questionId: q3.id, answer: "گزینه ج" },
        ],
        elapsedSeconds: 90,
      },
    });
    expect(finalSubmitRes.statusCode).toBe(200);
    const finalSubmitData = finalSubmitRes.json();
    expect(finalSubmitData.attempt.id).toBe(attemptId);
    expect(finalSubmitData.attempt.score).toBeDefined();
    expect(finalSubmitData.completedAt).toBeDefined();

    // Verify completed status
    const finalGet = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(finalGet.json().isCompleted).toBe(true);
    expect(finalGet.json().attempt.status).toBe("completed");
    expect(finalGet.json().attempt.completedAt).toBeDefined();
  });

  it("Scenarios N, O, P, Q: Completed attempt -> Retake creates new attempt; Old attempt remains immutable; In-progress attempt resumes correctly", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    // 1. Start exam
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        topics: ["داروهای قلب و عروق"],
        questionCount: 3,
        difficulty: "all",
      },
    });
    const startData = startRes.json();
    const attempt1Id = startData.attemptId;
    const q1 = startData.questions[0];

    // 2. Submit attempt 1
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attempt1Id}/submit`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: q1.id, answer: "گزینه الف" }],
        elapsedSeconds: 40,
      },
    });
    expect(submitRes.statusCode).toBe(200);

    // 3. Trigger Retake (شرکت مجدد در آزمون)
    const retakeRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attempt1Id}/retake`,
      headers: { cookie: cookieHeader },
    });
    expect(retakeRes.statusCode).toBe(200);
    const retakeData = retakeRes.json();
    const attempt2Id = retakeData.attemptId;

    // Assert Scenario N: New attempt created
    expect(attempt2Id).toBeDefined();
    expect(attempt2Id).not.toBe(attempt1Id);
    expect(retakeData.questions).toHaveLength(3);

    // Assert Scenario O: Old attempt remains immutable and completed
    const oldAttemptRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attempt1Id}`,
      headers: { cookie: cookieHeader },
    });
    expect(oldAttemptRes.json().isCompleted).toBe(true);
    expect(oldAttemptRes.json().attempt.status).toBe("completed");
    expect(oldAttemptRes.json().attempt.completedAt).toBeDefined();

    // Assert New attempt is in_progress, with empty answers and reset elapsed time
    const newAttemptRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attempt2Id}`,
      headers: { cookie: cookieHeader },
    });
    expect(newAttemptRes.json().isCompleted).toBe(false);
    expect(newAttemptRes.json().attempt.status).toBe("in_progress");
    expect(newAttemptRes.json().attempt.completedAt).toBeNull();
    expect(newAttemptRes.json().answers).toEqual({});
  });

  it("Scenario R: Special Exam Retake retains entitlement access without 403 error", async () => {
    const { app, orgId, cookieHeader, userId, questions } = await setupTestEnvironment();

    // Setup an initial Special Exam attempt
    const initialAttemptId = randomUUID();
    const productId = randomUUID();
    const now = new Date().toISOString();

    quizAttemptStore.insert({
      id: initialAttemptId as any,
      quizId: null,
      userId,
      score: 80,
      answers: { [questions[0].id]: "گزینه الف" },
      questionIds: questions.slice(0, 3).map((q) => q.id),
      questionSnapshot: questions.slice(0, 3),
      topic: "آزمون ویژه قلب",
      difficulty: "medium",
      status: "completed",
      metrics: {
        isSpecialExam: true,
        productId,
        elapsedSeconds: 120,
      },
      startedAt: now,
      completedAt: now,
    });

    // Grant user entitlement for the purchased Special Exam attempt
    commerceStore.entitlements.push({
      id: asUserEntitlementId(randomUUID()),
      userId,
      resourceType: "special_exam",
      resourceId: initialAttemptId,
      sourceType: "purchase",
      sourceId: null,
      grantedBy: null,
      metadata: {},
      startsAt: now,
      expiresAt: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
    });

    // Retake the Special Exam attempt
    const retakeRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${initialAttemptId}/retake`,
      headers: { cookie: cookieHeader },
    });
    expect(retakeRes.statusCode).toBe(200);
    const retakeData = retakeRes.json();
    const retakenAttemptId = retakeData.attemptId;
    expect(retakenAttemptId).toBeDefined();

    // Get the retaken attempt detail (verifies getExamAttempt succeeds)
    const getRetakenRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${retakenAttemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(getRetakenRes.statusCode).toBe(200);
    expect(getRetakenRes.json().isCompleted).toBe(false);
    expect(getRetakenRes.json().attempt.status).toBe("in_progress");
    expect(getRetakenRes.json().attempt.completedAt).toBeNull();
    expect(getRetakenRes.json().attempt.metrics.retakeOfAttemptId).toBe(initialAttemptId);

    // Save answer on retaken attempt
    const saveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${retakenAttemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: questions[0].id, answer: "گزینه الف" }],
        elapsedSeconds: 30,
      },
    });
    expect(saveRes.statusCode).toBe(200);

    // Submit retaken attempt
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${retakenAttemptId}/submit`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: questions[0].id, answer: "گزینه الف" }],
        elapsedSeconds: 30,
      },
    });
    expect(submitRes.statusCode).toBe(200);
    expect(submitRes.json().attempt.id).toBe(retakenAttemptId);
    expect(submitRes.json().attempt.completedAt).toBeDefined();
  });

  it("5 Consecutive Exit & Resume Cycles: Preserves answers, latest edits, and attempt snapshot without reset", async () => {
    const { app, orgId, cookieHeader } = await setupTestEnvironment();

    // Start exam
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        topics: ["داروهای قلب و عروق"],
        questionCount: 5,
        difficulty: "all",
      },
    });
    expect(startRes.statusCode).toBe(200);
    const startData = startRes.json();
    const attemptId = startData.attemptId;
    const qList = startData.questions;
    expect(qList).toHaveLength(5);

    const [q1, q2, q3, q4, q5] = qList;

    // --- Cycle 1 ---
    // Answer Q1 & Q2 -> Exit -> Resume
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [
          { questionId: q1.id, answer: "گزینه الف" },
          { questionId: q2.id, answer: "گزینه ب" },
        ],
        elapsedSeconds: 20,
      },
    });

    const resume1Res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(resume1Res.statusCode).toBe(200);
    const data1 = resume1Res.json();
    expect(data1.attempt.id).toBe(attemptId);
    expect(data1.isCompleted).toBe(false);
    expect(data1.attempt.status).toBe("in_progress");
    expect(data1.attempt.completedAt).toBeNull();
    expect(data1.answers[q1.id]).toBe("گزینه الف");
    expect(data1.answers[q2.id]).toBe("گزینه ب");
    expect(data1.answers[q3.id]).toBeUndefined();

    // --- Cycle 2 ---
    // Answer Q3, Change Q2 -> Exit -> Resume
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [
          { questionId: q3.id, answer: "گزینه ج" },
          { questionId: q2.id, answer: "گزینه د" },
        ],
        elapsedSeconds: 45,
      },
    });

    const resume2Res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(resume2Res.statusCode).toBe(200);
    const data2 = resume2Res.json();
    expect(data2.attempt.id).toBe(attemptId);
    expect(data2.answers[q1.id]).toBe("گزینه الف");
    expect(data2.answers[q2.id]).toBe("گزینه د"); // Changed value
    expect(data2.answers[q3.id]).toBe("گزینه ج");
    expect(data2.answers[q4.id]).toBeUndefined();

    // --- Cycle 3 ---
    // Answer Q4 -> Exit -> Resume
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: q4.id, answer: "گزینه الف" }],
        elapsedSeconds: 70,
      },
    });

    const resume3Res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(resume3Res.statusCode).toBe(200);
    const data3 = resume3Res.json();
    expect(data3.answers[q1.id]).toBe("گزینه الف");
    expect(data3.answers[q2.id]).toBe("گزینه د");
    expect(data3.answers[q3.id]).toBe("گزینه ج");
    expect(data3.answers[q4.id]).toBe("گزینه الف");
    expect(data3.answers[q5.id]).toBeUndefined();

    // --- Cycle 4 ---
    // Change Q1 -> Exit -> Resume
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: q1.id, answer: "گزینه ب" }],
        elapsedSeconds: 95,
      },
    });

    const resume4Res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(resume4Res.statusCode).toBe(200);
    const data4 = resume4Res.json();
    expect(data4.answers[q1.id]).toBe("گزینه ب"); // Latest value
    expect(data4.answers[q2.id]).toBe("گزینه د");
    expect(data4.answers[q3.id]).toBe("گزینه ج");
    expect(data4.answers[q4.id]).toBe("گزینه الف");
    expect(data4.answers[q5.id]).toBeUndefined();

    // --- Cycle 5 ---
    // Final exit & resume check: verify snapshot frozen, no duplicate attempts, elapsedSeconds active
    const resume5Res = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(resume5Res.statusCode).toBe(200);
    const data5 = resume5Res.json();
    expect(data5.attempt.id).toBe(attemptId);
    expect(data5.attempt.status).toBe("in_progress");
    expect(data5.attempt.completedAt).toBeNull();
    expect(data5.questions.map((q: any) => q.id)).toEqual(qList.map((q: any) => q.id));
    expect(data5.attempt.metrics.elapsedSeconds).toBe(95);

    // Verify history contains exactly one attempt
    const histRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieHeader },
    });
    const histItems = histRes.json().items;
    expect(histItems.filter((i: any) => i.attemptId === attemptId)).toHaveLength(1);
  });

  it("Recent Exams Removal: Hide in-progress and completed attempts without deleting attempts or breaking lifecycle", async () => {
    const { app, orgId, cookieHeader, userId } = await setupTestEnvironment();

    // 1. Start two attempts: Attempt A (in_progress) and Attempt B (completed)
    const startARes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { topics: ["داروهای قلب و عروق"], questionCount: 4 },
    });
    const attemptAId = startARes.json().attemptId;
    const questionsA = startARes.json().questions;

    // Answer Q1 for Attempt A
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptAId}/answers`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [{ questionId: questionsA[0].id, answer: "گزینه الف" }],
        elapsedSeconds: 25,
      },
    });

    const startBRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: { topics: ["داروهای قلب و عروق"], questionCount: 4 },
    });
    const attemptBId = startBRes.json().attemptId;
    const questionsB = startBRes.json().questions;

    // Submit Attempt B to complete it
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptBId}/submit`,
      headers: { cookie: cookieHeader },
      payload: {
        answers: [
          { questionId: questionsB[0].id, answer: "گزینه الف" },
          { questionId: questionsB[1].id, answer: "گزینه ب" },
        ],
        elapsedSeconds: 50,
      },
    });

    // Verify both attempts exist in history
    const initialHistRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieHeader },
    });
    expect(initialHistRes.statusCode).toBe(200);
    const initialItems = initialHistRes.json().items;
    expect(initialItems.some((i: any) => i.attemptId === attemptAId)).toBe(true);
    expect(initialItems.some((i: any) => i.attemptId === attemptBId)).toBe(true);

    // 2. Hide in-progress Attempt A from Recent Exams
    const deleteARes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgId}/study/exams/history/${attemptAId}`,
      headers: { cookie: cookieHeader },
    });
    expect(deleteARes.statusCode).toBe(200);
    expect(deleteARes.json().success).toBe(true);

    // Verify Attempt A is no longer in history, but Attempt B remains
    const histAfterA = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieHeader },
    });
    const itemsAfterA = histAfterA.json().items;
    expect(itemsAfterA.some((i: any) => i.attemptId === attemptAId)).toBe(false);
    expect(itemsAfterA.some((i: any) => i.attemptId === attemptBId)).toBe(true);

    // 3. Assert Attempt A data still exists, is in_progress, answers and snapshot intact
    const getAttemptARes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptAId}`,
      headers: { cookie: cookieHeader },
    });
    expect(getAttemptARes.statusCode).toBe(200);
    const attemptAData = getAttemptARes.json();
    expect(attemptAData.attempt.id).toBe(attemptAId);
    expect(attemptAData.attempt.status).toBe("in_progress");
    expect(attemptAData.attempt.completedAt).toBeNull();
    expect(attemptAData.answers[questionsA[0].id]).toBe("گزینه الف");
    expect(attemptAData.questions).toHaveLength(4);

    // 4. Hide completed Attempt B from Recent Exams
    const deleteBRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgId}/study/exams/history/${attemptBId}`,
      headers: { cookie: cookieHeader },
    });
    expect(deleteBRes.statusCode).toBe(200);

    // Verify history is now empty of both attempts
    const histAfterB = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieHeader },
    });
    const itemsAfterB = histAfterB.json().items;
    expect(itemsAfterB.some((i: any) => i.attemptId === attemptAId)).toBe(false);
    expect(itemsAfterB.some((i: any) => i.attemptId === attemptBId)).toBe(false);

    // 5. Assert Attempt B result is intact and Retake still works
    const getAttemptBRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptBId}`,
      headers: { cookie: cookieHeader },
    });
    expect(getAttemptBRes.statusCode).toBe(200);
    expect(getAttemptBRes.json().attempt.status).toBe("completed");
    expect(getAttemptBRes.json().isCompleted).toBe(true);

    const retakeBRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptBId}/retake`,
      headers: { cookie: cookieHeader },
    });
    expect(retakeBRes.statusCode).toBe(200);
    const retakeData = retakeBRes.json();
    expect(retakeData.attemptId).not.toBe(attemptBId);
  });

  it("Authorization Security: User A cannot hide User B's exam attempt from history", async () => {
    const { app, orgId, cookieHeader: cookieA, userId: userAId } = await setupTestEnvironment();

    // Create User B in same app
    const emailB = `user-b-${Date.now()}@example.com`;
    const userB = await userStore.createFromVerifiedIdentity({
      email: emailB,
      name: "دانشجو ب",
      provider: "local",
      providerSubject: `local|${emailB}`,
    });
    const authBRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: emailB, name: "دانشجو ب" },
    });
    const tokenB = extractSessionToken(authBRes)!;
    const cookieB = `avana_session=${tokenB}`;

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: userB.id as UserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    commerceStore.subscriptions.push({
      id: asUserSubscriptionId(randomUUID()),
      userId: userB.id as UserId,
      planId: asProductId(randomUUID()),
      status: "active",
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      autoRenew: false,
      gateway: "mock",
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // User B starts an exam
    const startBRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieB },
      payload: { topics: ["داروهای قلب و عروق"], questionCount: 3 },
    });
    expect(startBRes.statusCode).toBe(200);
    const userBAttemptId = startBRes.json().attemptId;

    // User A tries to hide User B's attempt
    const unauthorizedHideRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgId}/study/exams/history/${userBAttemptId}`,
      headers: { cookie: cookieA },
    });
    expect(unauthorizedHideRes.statusCode).toBe(404);

    // Verify User B still sees their attempt in history
    const userBHistRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/history`,
      headers: { cookie: cookieB },
    });
    expect(userBHistRes.json().items.some((i: any) => i.attemptId === userBAttemptId)).toBe(true);
  });
});

