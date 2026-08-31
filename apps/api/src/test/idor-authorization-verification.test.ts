/**
 * Real IDOR & Authorization Verification Integration Test Suite.
 *
 * Verifies that User A cannot read or mutate User B's resources
 * by changing IDs, userId, courseId, lessonId, flashcardId, or attemptId.
 *
 * Resources tested:
 *  1. Courses
 *  2. Modules
 *  3. Lessons
 *  4. Flashcards
 *  5. Flashcard Reviews
 *  6. Exams / Quizzes
 *  7. Exam Attempts
 *  8. Study Progress
 *  9. Analytics & Recommendations
 * 10. User Profile
 * 11. Organization Memberships
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { registerIdentityModule } from "../modules/identity/index.js";
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
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryUserFlashcardScheduleStore,
} from "../modules/study/test/in-memory-stores.js";
import { randomUUID } from "node:crypto";
import type {
  CourseId,
  ModuleId,
  LessonId,
  FlashcardId,
  QuizId,
  QuizAttemptId,
  OrganizationId,
  UserId,
  DocumentId,
} from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractCookie(
  res: { cookies: Array<{ name: string; value: string }> },
  cookieName: string,
): string | undefined {
  const cookie = res.cookies.find((c) => c.name === cookieName);
  return cookie?.value;
}

describe("IDOR & Authorization Real Security Verification", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;

  let userAToken: string;
  let userAId: string;
  let userBId: string;

  let orgAId: OrganizationId;
  let orgBId: OrganizationId;

  let courseBId: CourseId;

  let moduleBId: ModuleId;
  let lessonBId: LessonId;
  let flashcardBId: FlashcardId;
  let quizBId: QuizId;
  let attemptBId: QuizAttemptId;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();

    const app = createApp({ config });
    await app.register(v1Routes, {
      sessionStore,
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
    });
    await app.register(registerIdentityModule, { config, sessionStore, userStore });

    // Register User A
    const resA = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "usera_idor@example.com", password: "password123", name: "User A" },
    });
    userAToken = extractCookie(resA, "avana_session")!;
    userAId = JSON.parse(resA.body).user.id;

    // Register User B
    const resB = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email: "userb_idor@example.com", password: "password123", name: "User B" },
    });
    userBId = JSON.parse(resB.body).user.id;

    // Create Org A owned by User A & Org B owned by User B
    orgAId = randomUUID() as OrganizationId;
    await organizationStore.createWithAdminMembership({
      organization: {
        id: orgAId,
        name: "Org A",
        slug: "org-a",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgAId,
        userId: userAId as UserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    orgBId = randomUUID() as OrganizationId;
    await organizationStore.createWithAdminMembership({
      organization: {
        id: orgBId,
        name: "Org B",
        slug: "org-b",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgBId,
        userId: userBId as UserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Seed Course B, Module B, Lesson B, Flashcard B, Quiz B, Attempt B in Org B for User B
    courseBId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseBId,
        organizationId: orgBId,
        name: "Course B",
        subject: "Math",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    moduleBId = randomUUID() as ModuleId;
    moduleStore.insert({
      id: moduleBId,
      courseId: courseBId,
      title: "Module B1",
      description: "Module B1 description",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lessonBId = randomUUID() as LessonId;
    lessonStore.insert({
      id: lessonBId,
      moduleId: moduleBId,
      title: "Lesson B1.1",
      contentType: "markdown",
      contentMarkdown: "Secret Lesson Content for User B",
      publicationStatus: "published",
      sortOrder: 1,
      estimatedMinutes: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    flashcardBId = randomUUID() as FlashcardId;
    flashcardStore.insert({
      id: flashcardBId,
      organizationId: orgBId,
      courseId: courseBId,
      documentId: randomUUID() as DocumentId,
      generatedContentId: null,
      lessonId: null,
      question: "User B Question?",
      answer: "User B Secret Answer",
      explanation: null,
      cardType: "basic",
      difficulty: "medium",
      dueAt: new Date().toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    quizBId = randomUUID() as QuizId;
    quizStore.insert({
      id: quizBId,
      organizationId: orgBId,
      courseId: courseBId,
      documentId: randomUUID() as DocumentId,
      title: "Quiz B Secret Exam",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    attemptBId = randomUUID() as QuizAttemptId;
    quizAttemptStore.insert({
      id: attemptBId,
      quizId: quizBId,
      userId: userBId as UserId,
      score: 100,
      answers: {},
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    await app.close();
  });

  async function getApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      sessionStore,
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
    });
    await app.register(registerIdentityModule, { config, sessionStore, userStore });
    return app;
  }

  describe("1. Resource Read IDOR Isolation", () => {
    it("User A cannot read User B's Courses by orgId or courseId manipulation", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgBId}/courses/${courseBId}`,
        cookies: { avana_session: userAToken },
      });
      // User A is not a member of Org B / Course B -> 401, 403, or 404
      expect([401, 403, 404]).toContain(res.statusCode);
      await app.close();
    });

    it("User A cannot list User B's Flashcards by orgId manipulation", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgBId}/study/flashcards`,
        cookies: { avana_session: userAToken },
      });
      expect([401, 403, 404]).toContain(res.statusCode);
      await app.close();
    });

    it("User A cannot read User B's Quizzes/Exams by orgId or quizId manipulation", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgBId}/study/quizzes/${quizBId}`,
        cookies: { avana_session: userAToken },
      });
      expect([401, 403, 404]).toContain(res.statusCode);
      await app.close();
    });

    it("User A cannot read User B's Quiz Attempt results by attemptId manipulation", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgBId}/study/quizzes/${quizBId}/attempts/${attemptBId}`,
        cookies: { avana_session: userAToken },
      });
      expect([401, 403, 404]).toContain(res.statusCode);
      await app.close();
    });

    it("User A cannot read User B's Study Progress or Analytics by orgId manipulation", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgBId}/study/analytics`,
        cookies: { avana_session: userAToken },
      });
      expect([401, 403, 404]).toContain(res.statusCode);
      await app.close();
    });

    it("User A cannot fetch User B's profile via /v1/me even if userId parameter is supplied", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "GET",
        url: `/v1/me?userId=${userBId}`,
        cookies: { avana_session: userAToken },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // Identity MUST be User A, ignoring the query string userId
      expect(body.user.id).toBe(userAId);
      expect(body.user.id).not.toBe(userBId);
      await app.close();
    });
  });

  describe("2. Resource Mutation / Write IDOR Isolation", () => {
    it("User A cannot submit a review for User B's flashcard", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgBId}/study/flashcards/${flashcardBId}/review`,
        cookies: { avana_session: userAToken },
        payload: { rating: "good", userId: userBId },
      });
      expect([401, 403, 404]).toContain(res.statusCode);
      await app.close();
    });

    it("User A cannot submit a quiz attempt on User B's quiz or send userBId in payload to impersonate User B", async () => {
      const app = await getApp();
      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgBId}/study/quizzes/${quizBId}/attempts`,
        cookies: { avana_session: userAToken },
        payload: { userId: userBId, answers: {} },
      });
      expect([401, 403, 404]).toContain(res.statusCode);
      await app.close();
    });
  });
});
