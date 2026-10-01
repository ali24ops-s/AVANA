/**
 * Batch Synchronization, Idempotency, Stale Protection & Concurrency Test Suite
 *
 * Verifies key high-concurrency invariants for 100+ concurrent exam participants:
 * 1. Valid batch sync with revisions returns acknowledged list.
 * 2. Stale revisions arriving late do NOT overwrite newer stored answers, and acknowledge current revision.
 * 3. Newer revisions correctly apply and update answers and metrics.answersMeta.
 * 4. Storing answers uses lightweight update (no questionSnapshot rewrite).
 * 5. Reject invalid question IDs not in attempt snapshot.
 * 6. Reject expired attempts when time limit exceeded beyond grace period.
 * 7. Duplicate/idempotent batch sync calls produce identical results.
 * 8. Authoritative final scoring uses server-side question snapshot and keys.
 * 9. Final submit succeeds even with empty/partial answers by falling back to persisted answers.
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
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import {
  asUserSubscriptionId,
  asProductId,
  type UserId,
  type OrganizationId,
  type QuizId,
  type QuizAttemptId,
} from "@avana/domain";

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Exam Batch Synchronization & High Concurrency Optimizations", () => {
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

    const user = await userStore.createFromVerifiedIdentity({
      email,
      name: "شرکت‌کننده آزمون",
      provider: "local",
      providerSubject: `local|${email}`,
    });
    const userId = user.id as UserId;

    const authRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: "شرکت‌کننده آزمون" },
    });
    const token = extractSessionToken(authRes)!;

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: "دانشگاه آزمایشی" },
    });
    const orgId = JSON.parse(orgRes.body).organization.id as OrganizationId;

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

    const mockQuestions: QuizQuestionRecord[] = [
      {
        id: "q-1",
        quizId: "pool-quiz" as QuizId,
        question: "سؤال شماره یک",
        choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه ۲",
        sortOrder: 0,
        difficulty: "medium",
        questionType: "multiple_choice",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "q-2",
        quizId: "pool-quiz" as QuizId,
        question: "سؤال شماره دو",
        choices: ["الف", "ب", "ج", "د"],
        correctAnswer: "ج",
        sortOrder: 1,
        difficulty: "medium",
        questionType: "multiple_choice",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "q-3",
        quizId: "pool-quiz" as QuizId,
        question: "سؤال شماره سه",
        choices: ["آیتم ۱", "آیتم ۲"],
        correctAnswer: "آیتم ۱",
        sortOrder: 2,
        difficulty: "easy",
        questionType: "multiple_choice",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const attemptId = randomUUID() as QuizAttemptId;
    quizAttemptStore.insert({
      id: attemptId,
      userId,
      quizId: "pool-quiz" as QuizId,
      score: 0,
      answers: {},
      questionIds: mockQuestions.map((q) => q.id),
      questionSnapshot: mockQuestions,
      metrics: {
        timeLimitMinutes: 30,
        answersMeta: {},
      },
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
    });

    return { app, token, orgId, userId, attemptId, mockQuestions };
  }

  it("1. Batch sync saves multiple answers atomically and returns acknowledged revisions", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    const syncRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [
          { questionId: "q-1", answer: "گزینه ۲", revision: 1 },
          { questionId: "q-2", answer: "ب", revision: 1 },
        ],
        elapsedSeconds: 45,
      },
    });

    expect(syncRes.statusCode).toBe(200);
    const body = JSON.parse(syncRes.body);
    expect(body.success).toBe(true);
    expect(body.acknowledged).toEqual([
      { questionId: "q-1", revision: 1 },
      { questionId: "q-2", revision: 1 },
    ]);
    expect(body.answers["q-1"]).toBe("گزینه ۲");
    expect(body.answers["q-2"]).toBe("ب");
    expect(body.elapsedSeconds).toBe(45);

    // Verify stored attempt
    const stored = await quizAttemptStore.findById(attemptId);
    expect(stored?.answers).toEqual({
      "q-1": "گزینه ۲",
      "q-2": "ب",
    });
    expect((stored?.metrics as Record<string, unknown>).answersMeta).toEqual({
      "q-1": 1,
      "q-2": 1,
    });
  });

  it("2. Stale revision protection: does not overwrite newer answer, but acknowledges existing revision", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    // 1. Sync question q-1 at revision 5
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "پاسخ جدیدتر", revision: 5 }],
      },
    });

    // 2. An older delayed request arrives with revision 3
    const staleRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "پاسخ قدیمی", revision: 3 }],
      },
    });

    expect(staleRes.statusCode).toBe(200);
    const body = JSON.parse(staleRes.body);
    // Answer must remain "پاسخ جدیدتر"
    expect(body.answers["q-1"]).toBe("پاسخ جدیدتر");
    // Acknowledges current higher revision so client knows server is at revision 5
    expect(body.acknowledged).toEqual([{ questionId: "q-1", revision: 5 }]);

    const stored = await quizAttemptStore.findById(attemptId);
    expect(stored?.answers["q-1"]).toBe("پاسخ جدیدتر");
  });

  it("3. Newer revision successfully overwrites older answer", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    // Revision 1
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "پاسخ اول", revision: 1 }],
      },
    });

    // Revision 2
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "پاسخ اصلاح‌شده", revision: 2 }],
      },
    });

    expect(res2.statusCode).toBe(200);
    const body = JSON.parse(res2.body);
    expect(body.answers["q-1"]).toBe("پاسخ اصلاح‌شده");
    expect(body.acknowledged).toEqual([{ questionId: "q-1", revision: 2 }]);
  });

  it("4. Rejects questionId that does not belong to this exam attempt", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "foreign-question-999", answer: "گزینه ۱", revision: 1 }],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("5. Rejects sync if attempt belongs to another user", async () => {
    const { app, orgId, attemptId } = await setupTestEnvironment();

    // Create a second user
    await userStore.createFromVerifiedIdentity({
      email: "attacker@example.com",
      name: "کاربر متفرقه",
      provider: "local",
      providerSubject: "local|attacker",
    });
    const authRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "attacker@example.com", name: "کاربر متفرقه" },
    });
    const otherToken = extractSessionToken(authRes)!;

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: otherToken },
      payload: {
        answers: [{ questionId: "q-1", answer: "گزینه ۲", revision: 1 }],
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("6. Rejects sync when attempt time limit has expired", async () => {
    const { app, token, orgId, userId, mockQuestions } = await setupTestEnvironment();

    // Create an expired attempt (started 2 hours ago with 30-min time limit)
    const expiredAttemptId = randomUUID() as QuizAttemptId;
    quizAttemptStore.insert({
      id: expiredAttemptId,
      userId,
      quizId: "pool-quiz" as QuizId,
      score: 0,
      answers: {},
      questionIds: mockQuestions.map((q) => q.id),
      questionSnapshot: mockQuestions,
      metrics: {
        timeLimitMinutes: 30,
      },
      status: "in_progress",
      startedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      completedAt: null,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${expiredAttemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "گزینه ۲", revision: 1 }],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("7. Duplicate/idempotent batch sync produces identical state", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    const payload = {
      answers: [
        { questionId: "q-1", answer: "گزینه ۲", revision: 1 },
        { questionId: "q-2", answer: "ج", revision: 1 },
      ],
      elapsedSeconds: 60,
    };

    const res1 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload,
    });
    const res2 = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload,
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const b1 = JSON.parse(res1.body);
    const b2 = JSON.parse(res2.body);
    expect(b1.answers).toEqual(b2.answers);
    expect(b1.acknowledged).toEqual(b2.acknowledged);
  });

  it("8. Authoritative final scoring and fallback to persisted answers", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    // 1. Sync q-1 and q-2
    // q-1: "گزینه ۲" (correct)
    // q-2: "ج" (correct)
    // q-3: unanswered
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [
          { questionId: "q-1", answer: "گزینه ۲", revision: 1 },
          { questionId: "q-2", answer: "ج", revision: 1 },
        ],
      },
    });

    // 2. Submit with empty answers array (verifies server uses persisted attempt.answers)
    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      cookies: { avana_session: token },
      payload: {
        answers: [],
        elapsedSeconds: 120,
      },
    });

    expect(submitRes.statusCode).toBe(200);
    const submitBody = JSON.parse(submitRes.body);
    expect(submitBody.correct).toBe(2);
    expect(submitBody.unanswered).toBe(1);
    expect(submitBody.total).toBe(3);
    // Score: 2 / 3 * 100 = 66.67
    expect(submitBody.score).toBeCloseTo(66.67, 1);
    expect(submitBody.passed).toBe(true);

    // 3. Verify attempt status is completed
    const completedAttempt = await quizAttemptStore.findById(attemptId);
    expect(completedAttempt?.status).toBe("completed");
    expect(completedAttempt?.completedAt).toBeDefined();

    // 4. Double submit returns identical result (idempotency)
    const doubleSubmitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      cookies: { avana_session: token },
      payload: { answers: [] },
    });
    expect(doubleSubmitRes.statusCode).toBe(200);
    const doubleBody = JSON.parse(doubleSubmitRes.body);
    expect(doubleBody.score).toBe(submitBody.score);
  });

  it("9. findAttemptForAnswerSync projection returns metadata without heavy questionSnapshot", async () => {
    const { attemptId } = await setupTestEnvironment();

    const syncMeta = await quizAttemptStore.findAttemptForAnswerSync(attemptId);
    expect(syncMeta).toBeDefined();
    expect(syncMeta!.id).toBe(attemptId);
    expect(syncMeta!.questionIds).toEqual(["q-1", "q-2", "q-3"]);
    expect(syncMeta!.answers).toBeDefined();
    expect(syncMeta!.metrics).toBeDefined();
    // Verify questionSnapshot is NOT part of the projected sync meta
    expect("questionSnapshot" in syncMeta!).toBe(false);
  });

  it("10. Backward compatibility: legacy attempts without questionIds fall back gracefully and enforce question bounds", async () => {
    const { app, token, orgId, userId, mockQuestions } = await setupTestEnvironment();

    // Create a legacy attempt that has null questionIds but populated questionSnapshot
    const legacyAttemptId = randomUUID() as QuizAttemptId;
    quizAttemptStore.insert({
      id: legacyAttemptId,
      userId,
      quizId: "pool-quiz" as QuizId,
      score: 0,
      answers: {},
      questionIds: null, // Legacy state
      questionSnapshot: mockQuestions,
      metrics: {
        timeLimitMinutes: 30,
        answersMeta: {},
      },
      status: "in_progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
    });

    // Valid answer should succeed via fallback
    const validRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${legacyAttemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "گزینه ۲", revision: 1 }],
      },
    });
    expect(validRes.statusCode).toBe(200);
    const validBody = JSON.parse(validRes.body);
    expect(validBody.success).toBe(true);
    expect(validBody.acknowledged).toEqual([{ questionId: "q-1", revision: 1 }]);

    // Foreign question should still be rejected with 400
    const invalidRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${legacyAttemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "foreign-legacy-q", answer: "تست", revision: 1 }],
      },
    });
    expect(invalidRes.statusCode).toBe(400);
  });

  it("11. Race Safety Case A: A(rev 6) commits before B(rev 7) -> final revision = 7", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    // 1. Initial state: revision 5
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "Rev 5 Answer", revision: 5 }],
      },
    });

    // 2. Request A (revision 6)
    const resA = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "Rev 6 Answer", revision: 6 }],
      },
    });
    expect(resA.statusCode).toBe(200);

    // 3. Request B (revision 7)
    const resB = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "Rev 7 Answer", revision: 7 }],
      },
    });
    expect(resB.statusCode).toBe(200);

    // Verify stored state is revision 7
    const stored = await quizAttemptStore.findById(attemptId);
    expect(stored?.answers["q-1"]).toBe("Rev 7 Answer");
    expect((stored?.metrics as Record<string, unknown>).answersMeta).toEqual({
      "q-1": 7,
    });
  });

  it("12. Race Safety Case B: B(rev 7) commits before A(rev 6) -> A(6) cannot overwrite 7", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    // 1. Initial state: revision 5
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "Rev 5 Answer", revision: 5 }],
      },
    });

    // 2. B(7) arrives first and commits
    const resB = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "Rev 7 Answer", revision: 7 }],
      },
    });
    expect(resB.statusCode).toBe(200);
    const bodyB = JSON.parse(resB.body);
    expect(bodyB.answers["q-1"]).toBe("Rev 7 Answer");
    expect(bodyB.acknowledged).toEqual([{ questionId: "q-1", revision: 7 }]);

    // 3. Stale A(6) arrives later
    const resA = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "Rev 6 Stale", revision: 6 }],
      },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.body);

    // A must not overwrite revision 7:
    expect(bodyA.answers["q-1"]).toBe("Rev 7 Answer");
    // A acknowledges current higher revision 7:
    expect(bodyA.acknowledged).toEqual([{ questionId: "q-1", revision: 7 }]);

    const stored = await quizAttemptStore.findById(attemptId);
    expect(stored?.answers["q-1"]).toBe("Rev 7 Answer");
    expect((stored?.metrics as Record<string, unknown>).answersMeta).toEqual({
      "q-1": 7,
    });
  });

  it("13. Race Safety Case C: Concurrent in-flight requests for same question resolve monotonically to revision 7", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    // Initial state: revision 5
    await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
      cookies: { avana_session: token },
      payload: {
        answers: [{ questionId: "q-1", answer: "Rev 5 Answer", revision: 5 }],
      },
    });

    // Launch both requests concurrently via Promise.all
    const [resA, resB] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
        cookies: { avana_session: token },
        payload: {
          answers: [{ questionId: "q-1", answer: "Rev 6 Concurrent", revision: 6 }],
        },
      }),
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
        cookies: { avana_session: token },
        payload: {
          answers: [{ questionId: "q-1", answer: "Rev 7 Concurrent", revision: 7 }],
        },
      }),
    ]);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);

    // Regardless of which completed first, the final persisted state must be revision 7
    const stored = await quizAttemptStore.findById(attemptId);
    expect(stored?.answers["q-1"]).toBe("Rev 7 Concurrent");
    expect((stored?.metrics as Record<string, unknown>).answersMeta).toEqual({
      "q-1": 7,
    });
  });

  it("14. Race Safety Case D: Concurrent in-flight requests for different questions preserve both updates", async () => {
    const { app, token, orgId, attemptId } = await setupTestEnvironment();

    // Launch two requests updating different questions concurrently
    const [res1, res2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
        cookies: { avana_session: token },
        payload: {
          answers: [{ questionId: "q-1", answer: "Question 1 Answer", revision: 1 }],
        },
      }),
      app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/answers`,
        cookies: { avana_session: token },
        payload: {
          answers: [{ questionId: "q-2", answer: "Question 2 Answer", revision: 1 }],
        },
      }),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    // Both updates must be preserved in the persisted attempt (zero lost update)
    const stored = await quizAttemptStore.findById(attemptId);
    expect(stored?.answers["q-1"]).toBe("Question 1 Answer");
    expect(stored?.answers["q-2"]).toBe("Question 2 Answer");
    expect((stored?.metrics as Record<string, unknown>).answersMeta).toEqual({
      "q-1": 1,
      "q-2": 1,
    });
  });
});
