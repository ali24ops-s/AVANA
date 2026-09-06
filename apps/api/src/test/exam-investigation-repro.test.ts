import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { loadApiConfig } from "../config.js";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { composeProduction } from "../server/composeProduction.js";
import { generateSessionToken, hashToken } from "../modules/identity/session-service.js";
import type { FastifyInstance } from "fastify";
import type { UserId, LessonId, ModuleId, CourseId } from "@avana/domain";

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("Comprehensive Exam End-to-End Scenarios", () => {
  let app: FastifyInstance;
  let closeProd: () => Promise<void>;
  let cookieHeader: string;
  const orgId = "389575c5-7563-4242-854a-9af1a988eb3a";
  let sampleLessonId1: string;
  let sampleLessonId2: string;
  let sampleModuleId: string;
  let sampleCourseId: string;
  let isConnected = false;

  beforeAll(async () => {
    try {
      const config = loadApiConfig();
      const prod = await composeProduction(config);
      closeProd = prod.close;

      app = createApp({ config });
      await app.register(v1Routes, prod.v1Options);
      await app.ready();

      const userId = "79bda286-08a4-4a16-9340-4106864e0732" as UserId;
      const sessionToken = generateSessionToken();
      const tokenHash = hashToken(sessionToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await prod.v1Options.sessionStore.createSessionWithTakeover({
        userId,
        tokenHash,
        expiresAt,
      });

      cookieHeader = `avana_session=${sessionToken}`;

      sampleLessonId1 = "93b501bf-dc27-4056-9c95-6d6639cc630a";
      sampleLessonId2 = "4326da85-03c2-4ade-bc56-d4da7f304e9a";

      if (prod.v1Options.lessonStore) {
        const lesson = await prod.v1Options.lessonStore.findById(sampleLessonId1 as LessonId);
        if (lesson && lesson.moduleId) {
          sampleModuleId = lesson.moduleId;
          if (prod.v1Options.moduleStore) {
            const mod = await prod.v1Options.moduleStore.findById(lesson.moduleId as ModuleId);
            if (mod && mod.courseId) {
              sampleCourseId = mod.courseId;
            }
          }
        }
      }
      isConnected = true;
    } catch {
      isConnected = false;
    }
  });

  beforeEach((ctx) => {
    if (!isConnected) {
      ctx.skip();
    }
  });

  afterAll(async () => {
    if (app) await app.close();
    if (closeProd) await closeProd();
  });

  it("Scenario 1: 5 long session titles (previously caused character varying(255) error)", async () => {
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        sections: [],
        chapters: [
          "93b501bf-dc27-4056-9c95-6d6639cc630a",
          "4326da85-03c2-4ade-bc56-d4da7f304e9a",
          "13fffea7-a743-4786-91ed-45b36671eca4",
          "46e750e7-8873-4209-aa32-04895daf89c2",
          "c2596e9e-5e57-4f17-ab55-da6aa2ea90b0",
        ],
        topics: [
          "93b501bf-dc27-4056-9c95-6d6639cc630a",
          "4326da85-03c2-4ade-bc56-d4da7f304e9a",
          "13fffea7-a743-4786-91ed-45b36671eca4",
          "46e750e7-8873-4209-aa32-04895daf89c2",
          "c2596e9e-5e57-4f17-ab55-da6aa2ea90b0",
        ],
        questionCount: 10,
        difficulty: "medium",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const body = startRes.json();
    expect(body.attemptId).toBeDefined();
    expect(body.questions).toHaveLength(10);
    expect(body.topic).not.toMatch(UUID_REGEX);
    expect(body.topic.length).toBeLessThanOrEqual(255);
  });

  it("Scenario 2: Single lesson selection (جلسه تکی)", async () => {
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        sections: [],
        chapters: [sampleLessonId1],
        topics: [sampleLessonId1],
        questionCount: 5,
        difficulty: "all",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const body = startRes.json();
    expect(body.attemptId).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.topic).not.toMatch(UUID_REGEX);
    expect(body.topic).not.toContain("محور آدرنال");
    expect(body.coverage).toBeDefined();
  });

  it("Scenario 3: Multi-lesson selection (چند جلسه)", async () => {
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        sections: [],
        chapters: [sampleLessonId1, sampleLessonId2],
        topics: [sampleLessonId1, sampleLessonId2],
        questionCount: 5,
        difficulty: "all",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const body = startRes.json();
    expect(body.attemptId).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.topic).not.toMatch(UUID_REGEX);
    expect(body.topic).not.toContain("جلسه");
    expect(body.coverage).toBeDefined();
  });

  it("Scenario 4: Single module selection (سرفصل تکی)", async () => {
    if (!sampleModuleId) return;

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        sections: [sampleModuleId],
        chapters: [],
        topics: [],
        questionCount: 5,
        difficulty: "all",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const body = startRes.json();
    expect(body.attemptId).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.topic).not.toMatch(UUID_REGEX);
  });

  it("Scenario 5: Multi-module selection (چند سرفصل)", async () => {
    if (!sampleModuleId) return;

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        sections: [sampleModuleId, "mod-unassigned"],
        chapters: [],
        topics: [],
        questionCount: 5,
        difficulty: "all",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const body = startRes.json();
    expect(body.attemptId).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.topic).not.toMatch(UUID_REGEX);
  });

  it("Scenario 6: Course-level selection (سطح کل درس)", async () => {
    if (!sampleCourseId) return;

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        courseId: sampleCourseId,
        sections: [],
        chapters: [],
        topics: [],
        questionCount: 5,
        difficulty: "all",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const body = startRes.json();
    expect(body.attemptId).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.topic).not.toMatch(UUID_REGEX);
  });

  it("Scenario 7: Comprehensive exam (آزمون جامع بدون فیلتر)", async () => {
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        sections: [],
        chapters: [],
        topics: [],
        questionCount: 5,
        difficulty: "all",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const body = startRes.json();
    expect(body.attemptId).toBeDefined();
    expect(body.questions.length).toBeGreaterThan(0);
    expect(body.topic).not.toMatch(UUID_REGEX);
    expect(body.coverage).toBeDefined();
  });

  it("Scenario 8 & 9: Resume / Continue and Submit Exam Attempt", async () => {
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/start`,
      headers: { cookie: cookieHeader },
      payload: {
        sections: [],
        chapters: [sampleLessonId1],
        topics: [sampleLessonId1],
        questionCount: 5,
        difficulty: "all",
      },
    });
    expect(startRes.statusCode).toBe(200);
    const startBody = startRes.json();
    const attemptId = startBody.attemptId;
    const questions = startBody.questions;

    const getRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.isCompleted).toBe(false);
    expect(getBody.questions).toHaveLength(questions.length);
    expect(getBody.attempt.topic).not.toMatch(UUID_REGEX);

    const answers = questions.map((q: any) => ({
      questionId: q.id,
      answer: q.choices[0],
    }));

    const submitRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}/submit`,
      headers: { cookie: cookieHeader },
      payload: { answers },
    });
    expect(submitRes.statusCode).toBe(200);
    const submitBody = submitRes.json();
    expect(submitBody.attempt.score).toBeDefined();
    expect(submitBody.attempt.total).toBe(questions.length);

    const reviewRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/study/exams/attempts/${attemptId}`,
      headers: { cookie: cookieHeader },
    });
    expect(reviewRes.statusCode).toBe(200);
    const reviewBody = reviewRes.json();
    expect(reviewBody.isCompleted).toBe(true);
    expect(reviewBody.attempt.status).toBe("completed");
    expect(reviewBody.attempt.topic).not.toMatch(UUID_REGEX);
  });
});
