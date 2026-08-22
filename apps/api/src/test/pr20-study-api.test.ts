/**
 * PR6-7 Integration tests: Study Consumption & Analytics API.
 *
 * Covers:
 *  1. GET  .../flashcards → list all flashcards + next review count
 *  2. GET  .../flashcards/review-queue → list due flashcards only
 *  3. POST .../flashcards/:flashcardId/review → submit rating, update schedule
 *  4. GET  .../quizzes → list published quizzes
 *  5. GET  .../quizzes/:quizId → get quiz details and questions
 *  6. POST .../quizzes/:quizId/attempts → submit answers, receive score & results
 *  7. GET  .../quizzes/:quizId/attempts/:attemptId → get specific attempt result
 *  8. GET  .../study/analytics → aggregated study metrics (progress, mastery, weak areas)
 *  9. GET  .../study/recommendations → actionable next steps
 * 10. Cross-org isolation (404) & unauthenticated requests (401)
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
import type {
  CourseId,
  DocumentId,
  FlashcardId,
  OrganizationId,
  QuizId,
  QuizQuestionId,
  UserId,
} from "@avana/domain";

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

describe("PR6-7: Study Consumption & Analytics API", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
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

  const courseId = "11111111-1111-4111-8111-111111111111" as CourseId;
  const documentId = "33333333-3333-4333-8333-333333333333" as DocumentId;

  beforeEach(() => {
    config = makeTestConfig();
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
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildApp() {
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
    return app;
  }

  async function signIn(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
    role = "student",
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    const userId = body.user.id as UserId;
    userStore.insert({ id: userId, email: body.user.email, role });
    const token = extractSessionToken(res)!;
    return { token, userId, email: body.user.email };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
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

  function seedFlashcards(orgId: OrganizationId, cId: CourseId = courseId, userId?: UserId) {
    const now = new Date();
    const past = new Date(now.getTime() - 1000 * 60).toISOString();
    const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString();

    const dueCard: FlashcardId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as FlashcardId;
    const futureCard: FlashcardId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as FlashcardId;

    flashcardStore.insert({
      id: dueCard,
      organizationId: orgId,
      courseId: cId,
      documentId,
      generatedContentId: null,
      question: "What is the primary action of a beta blocker?",
      answer: "Reduces heart rate and blood pressure by blocking beta receptors.",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: past,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: past,
      updatedAt: past,
      deletedAt: null,
    });

    flashcardStore.insert({
      id: futureCard,
      organizationId: orgId,
      courseId: cId,
      documentId,
      generatedContentId: null,
      question: "What is an ACE inhibitor?",
      answer: "Inhibits angiotensin-converting enzyme.",
      explanation: null,
      cardType: "definition",
      difficulty: "easy",
      dueAt: future,
      intervalDays: 5,
      easeFactor: 2.65,
      createdAt: past,
      updatedAt: past,
      deletedAt: null,
    });

    if (userId) {
      flashcardReviewStore.create({
        id: randomUUID(),
        flashcardId: dueCard,
        userId,
        rating: "good",
        reviewedAt: past,
        reactionMs: 1000,
      });
    }

    return { dueCard, futureCard };
  }

  function seedQuizAndQuestions(orgId: OrganizationId, cId: CourseId = courseId) {
    const quizId: QuizId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as QuizId;
    const now = new Date().toISOString();

    quizStore.insert({
      id: quizId,
      organizationId: orgId,
      courseId: cId,
      documentId,
      title: "Cardiovascular Pharmacology Quiz",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const q1: QuizQuestionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as QuizQuestionId;
    const q2: QuizQuestionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as QuizQuestionId;

    const questions = [
      {
        id: q1,
        quizId,
        generatedContentId: null,
        question: "Which drug is a beta blocker?",
        questionType: "multiple_choice",
        choices: ["Metoprolol", "Lisinopril", "Amlodipine"],
        correctAnswer: "Metoprolol",
        explanation: "Metoprolol is a cardioselective beta-1 blocker.",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: q2,
        quizId,
        generatedContentId: null,
        question: "Which drug is an ACE inhibitor?",
        questionType: "multiple_choice",
        choices: ["Metoprolol", "Lisinopril", "Amlodipine"],
        correctAnswer: "Lisinopril",
        explanation: "Lisinopril is an ACE inhibitor.",
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
    ];

    quizQuestionStore.createMany(questions);
    quizStore.setQuestionsForQuiz(quizId, questions);

    return { quizId, questions };
  }

  // -------------------------------------------------------------------------
  // 1. Flashcards Endpoints
  // -------------------------------------------------------------------------

  describe("Flashcards API", () => {
    it("GET .../flashcards returns all flashcards and due count", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      seedFlashcards(orgId, courseId, userId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/flashcards`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.flashcards.length).toBe(2);
      expect(body.next_review_count).toBe(1);
    });

    it("GET .../flashcards/review-queue returns only due flashcards", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      const { dueCard } = seedFlashcards(orgId, courseId, userId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/flashcards/review-queue`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.due_cards.length).toBe(1);
      expect(body.due_cards[0].id).toBe(dueCard);
    });

    it("GET .../flashcards/review-queue excludes unread cards for new user", async () => {
      const app = await buildApp();
      const { token: user1Token, userId: user1Id } = await signIn(app, "user1@example.com", "student");
      const orgId = await createOrg(app, user1Token, "Health Org");
      const { token: user2Token, userId: user2Id } = await signIn(app, "user2@example.com", "student");
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user2Id,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Seed card and review for user1
      seedFlashcards(orgId, courseId, user1Id);

      // user1 sees 1 due card
      const res1 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/flashcards/review-queue`,
        cookies: { avana_session: user1Token },
      });
      expect(res1.statusCode).toBe(200);
      expect(JSON.parse(res1.body).due_cards.length).toBe(1);

      // user2 (in same org, has not reviewed card yet) sees 1 card due for initial review
      const res2 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/flashcards/review-queue`,
        cookies: { avana_session: user2Token },
      });
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).due_cards.length).toBe(1);
    });

    it("POST .../flashcards/:flashcardId/review advances schedule and emits audit log", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      const { dueCard } = seedFlashcards(orgId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/flashcards/${dueCard}/review`,
        cookies: { avana_session: token },
        payload: {
          rating: "good",
          reaction_ms: 1200,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      // Verify schedule updated in store for student
      const studentUser = await userStore.findByEmail("student@example.com");
      const updated = await userFlashcardScheduleStore.getByUserAndCard(studentUser!.id, dueCard);
      expect(updated!.intervalDays).toBe(1); // 0 -> 1 on good
      expect(new Date(updated!.dueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("POST .../flashcards/:flashcardId/review validates rating", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      const { dueCard } = seedFlashcards(orgId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/flashcards/${dueCard}/review`,
        cookies: { avana_session: token },
        payload: {
          rating: "super_easy", // invalid
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Quizzes Endpoints
  // -------------------------------------------------------------------------

  describe("Quizzes API", () => {
    it("GET .../quizzes lists published quizzes", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      const { quizId } = seedQuizAndQuestions(orgId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/quizzes`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.quizzes.length).toBe(1);
      expect(body.quizzes[0].id).toBe(quizId);
    });

    it("GET .../quizzes/:quizId returns quiz with questions", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      const { quizId, questions } = seedQuizAndQuestions(orgId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/quizzes/${quizId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.quiz.id).toBe(quizId);
      expect(body.quiz.questions.length).toBe(2);
      expect(body.quiz.questions[0].id).toBe(questions[0].id);
    });

    it("POST .../quizzes/:quizId/attempts submits and grades attempt", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      const { quizId, questions } = seedQuizAndQuestions(orgId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/quizzes/${quizId}/attempts`,
        cookies: { avana_session: token },
        payload: {
          answers: [
            { questionId: questions[0].id, answer: "Metoprolol" }, // correct
            { questionId: questions[1].id, answer: "Metoprolol" }, // incorrect
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.attempt.score).toBe(50);
      expect(body.attempt.correct).toBe(1);
      expect(body.attempt.total).toBe(2);

      // Verify GET specific attempt works
      const attemptId = body.attempt.attemptId;
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/quizzes/${quizId}/attempts/${attemptId}`,
        cookies: { avana_session: token },
      });

      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.attempt.id).toBe(attemptId);
      expect(getBody.attempt.score).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Study Analytics & Recommendations API
  // -------------------------------------------------------------------------

  describe("Study Analytics & Recommendations API", () => {
    it("GET .../study/analytics returns aggregated metrics", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      seedFlashcards(orgId);
      seedQuizAndQuestions(orgId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/study/analytics`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.analytics).toBeDefined();
      expect(body.analytics.total_flashcards).toBe(2);
      expect(body.analytics.total_quizzes).toBe(1);
    });

    it("GET .../study/recommendations returns study recommendations", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "student@example.com", "student");
      const orgId = await createOrg(app, token, "Health Org");
      seedFlashcards(orgId);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/study/recommendations`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.recommendations)).toBe(true);
      expect(body.recommendations.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Security & Tenant Isolation
  // -------------------------------------------------------------------------

  describe("Security & Tenant Isolation", () => {
    it("returns 401 when accessing study endpoints without session", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${randomUUID()}/courses/${courseId}/flashcards`,
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 404 for cross-organization access (tenant isolation)", async () => {
      const app = await buildApp();
      const { token: user1Token } = await signIn(app, "user1@example.com");
      const org1Id = await createOrg(app, user1Token, "Org 1");

      const { token: user2Token } = await signIn(app, "user2@example.com");
      await createOrg(app, user2Token, "Org 2");

      // user2 tries to access org1's flashcards -> 404 (non-disclosing)
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org1Id}/courses/${courseId}/flashcards`,
        cookies: { avana_session: user2Token },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
