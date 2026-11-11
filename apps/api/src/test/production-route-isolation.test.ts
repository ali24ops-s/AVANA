import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { InMemorySessionStore, InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { SessionService } from "../modules/identity/session-service.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryModuleStore, InMemoryLessonStore } from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryStudySessionStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

describe("Production Route Isolation - Out-of-Scope Routes Strict Exclusion", () => {
  let app: FastifyInstance;
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
  let sessionCookie: string;

  beforeEach(async () => {
    userStore = new InMemoryUserStore();
    sessionStore = new InMemorySessionStore();

    const config = loadApiConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/avana_test",
      REDIS_URL: "redis://localhost:6379",
      APP_URL: "https://avana.org",
      AUTH_VERIFICATION_SECRET: "test-secret-at-least-32-chars-long-123456",
      GEMINI_API_KEY: "test-gemini-key",
      COOKIE_SECRET: "test-cookie-secret-at-least-32-chars-long",
    });

    app = createApp({ config });

    const sessionService = new SessionService(sessionStore, config.session);

    const adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.org",
      passwordHash: "hash123",
    });
    adminUser.name = "Admin User";
    adminUser.globalRole = "platform_admin";
    adminUser.role = "platform_admin";
    userStore.insert({ ...adminUser });

    const session = await sessionService.createSession(adminUser.id);
    sessionCookie = `avana_session=${session.token}`;

    await app.register(v1Routes, {
      config,
      userStore,
      sessionStore,
      organizationStore: new InMemoryOrganizationStore(),
      courseStore: new InMemoryCourseStore(),
      moduleStore: new InMemoryModuleStore(),
      lessonStore: new InMemoryLessonStore(),
      flashcardStore: new InMemoryFlashcardStore(),
      flashcardReviewStore: new InMemoryFlashcardReviewStore(),
      userFlashcardScheduleStore: new InMemoryUserFlashcardScheduleStore(),
      quizStore: new InMemoryQuizStore(),
      quizQuestionStore: new InMemoryQuizQuestionStore(),
      quizAttemptStore: new InMemoryQuizAttemptStore(new InMemoryQuizStore()),
      studySessionStore: new InMemoryStudySessionStore(),
      adminStore: new InMemoryAdminStore(),
      auditService: new AuditService({} as any),
      // Production de-coupled configuration:
      personalSummaryService: undefined,
      mindMapService: undefined,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("1. GET /v1/study/modules/:moduleId/personal-summary returns 404 (Route not registered)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/study/modules/11111111-1111-4111-8111-111111111111/personal-summary",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("2. POST /v1/study/modules/:moduleId/personal-summary/generate returns 404 (Route not registered)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/study/modules/11111111-1111-4111-8111-111111111111/personal-summary/generate",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("3. GET /v1/study/modules/:moduleId/personal-summary/mind-map returns 404 (Route not registered)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/study/modules/11111111-1111-4111-8111-111111111111/personal-summary/mind-map",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("4. POST /v1/study/modules/:moduleId/personal-summary/mind-map/generate returns 404 (Route not registered)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/study/modules/11111111-1111-4111-8111-111111111111/personal-summary/mind-map/generate",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("5. GET /v1/admin/crm/customers returns 404 (Route not registered)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("6. GET /v1/admin/crm/segments returns 404 (Route not registered)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/segments",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("7. Presentation reference routes return 404 (Route not registered)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/presentations/references/search?query=test",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
