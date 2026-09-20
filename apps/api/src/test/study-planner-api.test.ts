import { describe, it, expect, beforeEach } from "vitest";
import type { CourseId, LessonId, ModuleId, OrganizationId, UserId } from "@avana/domain";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryStudySessionStore,
  InMemoryDailyStudyPlanStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemorySessionStore, InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import type { DailyStudyPlanResponse, UpdateStudyTaskStatusResponse } from "@avana/contracts";

describe("Daily Study Planner API (Phase 3)", () => {
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
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
  let studySessionStore: InMemoryStudySessionStore;
  let dailyPlanStore: InMemoryDailyStudyPlanStore;

  const testUser = {
    id: "user-plan-1",
    email: "student-planner@avana.ai",
    name: "Student Planner",
    password: "Password123!",
  };

  const otherUser = {
    id: "user-plan-2",
    email: "other-student@avana.ai",
    name: "Other Student",
    password: "Password123!",
  };

  let app: ReturnType<typeof createApp>;
  let sessionCookie: string;
  let otherSessionCookie: string;

  beforeEach(async () => {
    userStore = new InMemoryUserStore();
    sessionStore = new InMemorySessionStore();
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
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    studySessionStore = new InMemoryStudySessionStore();
    dailyPlanStore = new InMemoryDailyStudyPlanStore();

    const config = loadApiConfig();
    app = createApp({ config });

    await app.register(v1Routes, {
      config,
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
      studySessionStore,
      dailyPlanStore,
    });

    // Register test user 1
    const regRes1 = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
        phoneNumber: "09121111111",
      }),
    });
    expect(regRes1.statusCode).toBe(200);
    const cookie1 = regRes1.cookies.find((c) => c.name === "avana_session");
    sessionCookie = `avana_session=${cookie1?.value}`;
    const currentUserId = regRes1.json().user.id;

    // Register test user 2
    const regRes2 = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: otherUser.email,
        password: otherUser.password,
        name: otherUser.name,
        phoneNumber: "09122222222",
      }),
    });
    expect(regRes2.statusCode).toBe(200);
    const cookie2 = regRes2.cookies.find((c) => c.name === "avana_session");
    otherSessionCookie = `avana_session=${cookie2?.value}`;

    // Seed learning content for candidate generation
    const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
    const courseId = "c1111111-1111-1111-1111-111111111111" as CourseId;
    const moduleId = "m1111111-1111-1111-1111-111111111111" as ModuleId;
    const lesson1Id = "l1111111-1111-1111-1111-111111111111" as LessonId;
    const lesson2Id = "l2222222-2222-2222-2222-222222222222" as LessonId;

    await organizationStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Avana Org",
        slug: "avana-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-1",
        organizationId: orgId,
        userId: currentUserId as UserId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "دوره جامع فارماکولوژی",
        slug: "pharmacology",
        status: "published",
        enrollmentType: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.addUserCourse(currentUserId, courseId);

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل اول: آنتی‌بیوتیک‌ها",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lesson1Id,
      moduleId,
      title: "درس ۱: پنی‌سیلین‌ها",
      contentMarkdown: "# پنی‌سیلین‌ها",
      sortOrder: 1,
      publicationStatus: "published",
      estimatedMinutes: 20,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lesson2Id,
      moduleId,
      title: "درس ۲: سفالوسپورین‌ها",
      contentMarkdown: "# سفالوسپورین‌ها",
      sortOrder: 2,
      publicationStatus: "published",
      estimatedMinutes: 25,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  describe("GET /v1/study/daily-plan", () => {
    it("1. creates daily plan lazily for authenticated user when none exists", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });

      expect(res.statusCode).toBe(200);
      const json: DailyStudyPlanResponse = JSON.parse(res.payload);
      expect(json.plan).toBeDefined();
      expect(json.plan.id).toBeDefined();
      expect(json.plan.planDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(json.plan.status).toBe("in_progress");
      expect(json.plan.targetDurationMinutes).toBe(120);
      expect(json.plan.completedDurationMinutes).toBe(0);
      expect(json.plan.remainingDurationMinutes).toBe(120);
      expect(json.plan.tasks.length).toBeGreaterThan(0);

      const firstTask = json.plan.tasks[0];
      expect(firstTask.id).toBeDefined();
      expect(firstTask.taskType).toBe("read_lesson");
      expect(firstTask.status).toBe("pending");
      expect(firstTask.title).toContain("درس ۱: پنی‌سیلین‌ها");
      expect(firstTask.estimatedMinutes).toBe(20);
      expect(firstTask.completedAt).toBeNull();
      expect(firstTask.lessonId).toBe("l1111111-1111-1111-1111-111111111111");
    });

    it("2. returns existing plan on subsequent calls without creating duplicate", async () => {
      const res1 = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const json1: DailyStudyPlanResponse = JSON.parse(res1.payload);

      const res2 = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const json2: DailyStudyPlanResponse = JSON.parse(res2.payload);

      expect(json2.plan.id).toBe(json1.plan.id);
      expect(json2.plan.tasks.length).toBe(json1.plan.tasks.length);
      expect(dailyPlanStore.plans.size).toBe(1);
    });

    it("3. automatically synchronizes completion when underlying activity is completed", async () => {
      // 1. Create plan
      const res1 = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const json1: DailyStudyPlanResponse = JSON.parse(res1.payload);
      const lessonTask = json1.plan.tasks.find((t) => t.taskType === "read_lesson")!;
      expect(lessonTask.status).toBe("pending");

      // 2. Simulate user completed the lesson via learning progress
      const currentUserId = json1.plan.userId;

      await progressStore.upsert({
        id: "prog-1",
        userId: currentUserId as UserId,
        lessonId: lessonTask.lessonId as LessonId,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 3. GET daily-plan again -> should sync to completed
      const res2 = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const json2: DailyStudyPlanResponse = JSON.parse(res2.payload);
      const updatedLessonTask = json2.plan.tasks.find((t) => t.id === lessonTask.id)!;

      expect(updatedLessonTask.status).toBe("completed");
      expect(updatedLessonTask.completedAt).not.toBeNull();
      expect(json2.plan.completedDurationMinutes).toBe(lessonTask.estimatedMinutes);
    });

    it("4. rejects unauthenticated requests with 401", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /v1/study/daily-plan/regenerate", () => {
    it("5. regenerates plan and preserves completed tasks", async () => {
      // 1. Initial plan creation
      const res1 = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const json1: DailyStudyPlanResponse = JSON.parse(res1.payload);
      expect(json1.plan.tasks.length).toBeGreaterThan(0);

      const firstTaskId = json1.plan.tasks[0].id;

      // 2. Complete first task
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/study/daily-plan/tasks/${firstTaskId}`,
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });
      expect(patchRes.statusCode).toBe(200);

      // 3. Call regenerate
      const regenRes = await app.inject({
        method: "POST",
        url: "/v1/study/daily-plan/regenerate",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetMinutes: 60 }),
      });

      expect(regenRes.statusCode).toBe(200);
      const regenJson: DailyStudyPlanResponse = JSON.parse(regenRes.payload);

      // Completed task must still be present and marked completed
      const preservedTask = regenJson.plan.tasks.find((t) => t.id === firstTaskId);
      expect(preservedTask).toBeDefined();
      expect(preservedTask?.status).toBe("completed");
    });

    it("6. rejects unauthenticated regeneration requests with 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/study/daily-plan/regenerate",
      });
      expect(res.statusCode).toBe(401);
    });

    it("7. validates targetMinutes parameter if provided", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/study/daily-plan/regenerate",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetMinutes: -10 }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("PATCH /v1/study/daily-plan/tasks/:taskId", () => {
    it("8. updates task status from pending to in_progress", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const planJson: DailyStudyPlanResponse = JSON.parse(getRes.payload);
      const targetTask = planJson.plan.tasks[0];

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/study/daily-plan/tasks/${targetTask.id}`,
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "in_progress" }),
      });

      expect(patchRes.statusCode).toBe(200);
      const patchJson: UpdateStudyTaskStatusResponse = JSON.parse(patchRes.payload);
      expect(patchJson.task.id).toBe(targetTask.id);
      expect(patchJson.task.status).toBe("in_progress");
      expect(patchJson.task.completedAt).toBeNull();
    });

    it("9. updates task status to completed and records completedAt timestamp", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const planJson: DailyStudyPlanResponse = JSON.parse(getRes.payload);
      const targetTask = planJson.plan.tasks[0];

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/study/daily-plan/tasks/${targetTask.id}`,
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });

      expect(patchRes.statusCode).toBe(200);
      const patchJson: UpdateStudyTaskStatusResponse = JSON.parse(patchRes.payload);
      expect(patchJson.task.id).toBe(targetTask.id);
      expect(patchJson.task.status).toBe("completed");
      expect(patchJson.task.completedAt).not.toBeNull();

      // Verify parent plan reflects completed duration
      const verifyRes = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const updatedPlanJson: DailyStudyPlanResponse = JSON.parse(verifyRes.payload);
      expect(updatedPlanJson.plan.completedDurationMinutes).toBe(targetTask.estimatedMinutes);
    });

    it("10. updates task status to skipped", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const planJson: DailyStudyPlanResponse = JSON.parse(getRes.payload);
      const targetTask = planJson.plan.tasks[0];

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/study/daily-plan/tasks/${targetTask.id}`,
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "skipped" }),
      });

      expect(patchRes.statusCode).toBe(200);
      const patchJson: UpdateStudyTaskStatusResponse = JSON.parse(patchRes.payload);
      expect(patchJson.task.status).toBe("skipped");
    });

    it("11. prevents modifying another user's study task and returns 404", async () => {
      // User 1 creates a plan with a task
      const getRes1 = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const planJson1: DailyStudyPlanResponse = JSON.parse(getRes1.payload);
      const user1TaskId = planJson1.plan.tasks[0].id;

      // User 2 attempts to patch User 1's task
      const attackRes = await app.inject({
        method: "PATCH",
        url: `/v1/study/daily-plan/tasks/${user1TaskId}`,
        headers: {
          cookie: otherSessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });

      expect(attackRes.statusCode).toBe(404);
    });

    it("12. returns 404 for non-existent task ID", async () => {
      const nonExistentId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/study/daily-plan/tasks/${nonExistentId}`,
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });

      expect(res.statusCode).toBe(404);
    });

    it("13. returns 400 for invalid task ID format", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/v1/study/daily-plan/tasks/invalid-not-uuid",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });

      expect(res.statusCode).toBe(400);
    });

    it("14. returns 400 for invalid status string", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/study/daily-plan",
        headers: { cookie: sessionCookie },
      });
      const planJson: DailyStudyPlanResponse = JSON.parse(getRes.payload);
      const targetTask = planJson.plan.tasks[0];

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/study/daily-plan/tasks/${targetTask.id}`,
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "invalid_status_value" }),
      });

      expect(res.statusCode).toBe(400);
    });

    it("15. returns 401 for unauthenticated PATCH request", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/v1/study/daily-plan/tasks/f47ac10b-58cc-4372-a567-0e02b2c3d479",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "completed" }),
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("Phase 5: Exam-Aware Daily Study Planning End-to-End API", () => {
    it("16. updates course exam_date & exam_scope and regenerates daily plan with exam urgency", async () => {
      // 1. Update course with upcoming exam in 2 days and scoped to module
      const courseId = "c1111111-1111-1111-1111-111111111111";
      const moduleId = "m1111111-1111-1111-1111-111111111111";
      const target = new Date();
      target.setDate(target.getDate() + 2);
      const examDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;

      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/00000000-0000-0000-0000-000000000001/courses/${courseId}`,
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          exam_at: examDate,
          exam_scope: {
            moduleIds: [moduleId],
          },
        }),
      });

      expect(updateRes.statusCode).toBe(200);
      const updateJson = JSON.parse(updateRes.payload);
      expect(updateJson.course.exam_at).toBe(examDate);
      expect(updateJson.course.exam_scope).toEqual({ moduleIds: [moduleId] });

      // 2. Regenerate daily plan
      const regenRes = await app.inject({
        method: "POST",
        url: "/v1/study/daily-plan/regenerate",
        headers: {
          cookie: sessionCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(regenRes.statusCode).toBe(200);
      const regenJson: DailyStudyPlanResponse = JSON.parse(regenRes.payload);
      expect(regenJson.plan.targetDurationMinutes).toBe(360); // Critical urgency budget (< 3 days)
      expect(regenJson.plan.tasks.length).toBeGreaterThan(0);

      const examTask = regenJson.plan.tasks[0];
      expect(examTask.metadata?.isExamRelated).toBe(true);
      expect(examTask.metadata?.examDaysRemaining).toBe(2);
      expect(examTask.metadata?.category).toBe("mandatory");
    });
  });
});
