/**
 * PR-2 Integration tests: Learning read API.
 *
 * Covers all acceptance criteria:
 * 1. Authenticated user can retrieve course learning structure
 * 2. Response contains course info, ordered modules, ordered lessons
 * 3. User progress included (empty when no progress)
 * 4. Unauthenticated request rejected
 * 5. Non-existent course returns 404
 * 6. Cross-tenant isolation (non-disclosing failure)
 *
 * Follows the PR-9 test pattern (course vertical slice).
 */

import { describe, expect, it, beforeEach } from "vitest";
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
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type {
  CourseId,
  ModuleId,
  LessonId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";

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

describe("PR-2: Learning read API", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  /**
   * Helper seed: creates an org, a course, modules, and lessons
   * for a fresh test app. Returns IDs needed for API calls.
   */
  async function seedCourseWithContent(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    orgName: string,
  ) {
    // Create org
    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: orgName },
    });
    expect(orgRes.statusCode).toBe(201);
    const orgBody = JSON.parse(orgRes.body) as {
      organization: { id: string };
    };
    const organizationId = orgBody.organization.id as OrganizationId;

    // Create course
    const courseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses`,
      cookies: { avana_session: token },
      payload: {
        title: "Pharmacology Basics",
        subject: "Pharmacy",
        exam_at: null,
      },
    });
    expect(courseRes.statusCode).toBe(201);
    const courseBody = JSON.parse(courseRes.body) as {
      course: { id: string };
    };
    const courseId = courseBody.course.id as CourseId;

    // Seed modules and lessons directly into in-memory stores
    const now = new Date().toISOString();

    const module1Id = randomUUID() as ModuleId;
    moduleStore.insert({
      id: module1Id,
      courseId,
      title: "Module 1: Drug Classifications",
      description: "Understanding drug categories",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const lesson1Id = randomUUID() as LessonId;
    lessonStore.insert({
      id: lesson1Id,
      moduleId: module1Id,
      title: "Lesson 1.1: Intro",
      contentType: "markdown",
      contentMarkdown: "# Intro to Drug Classes",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const lesson2Id = randomUUID() as LessonId;
    lessonStore.insert({
      id: lesson2Id,
      moduleId: module1Id,
      title: "Lesson 1.2: Nomenclature",
      contentType: "markdown",
      contentMarkdown: "# Drug Nomenclature",
      sortOrder: 2,
      estimatedMinutes: 8,
      publicationStatus: "published" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const module2Id = randomUUID() as ModuleId;
    moduleStore.insert({
      id: module2Id,
      courseId,
      title: "Module 2: Pharmacokinetics",
      description: "How the body processes drugs",
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const lesson3Id = randomUUID() as LessonId;
    lessonStore.insert({
      id: lesson3Id,
      moduleId: module2Id,
      title: "Lesson 2.1: Absorption",
      contentType: "markdown",
      contentMarkdown: "# Absorption",
      sortOrder: 1,
      estimatedMinutes: 12,
      publicationStatus: "published" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return {
      organizationId,
      courseId,
      module1Id,
      module2Id,
      lesson1Id,
      lesson2Id,
      lesson3Id,
    };
  }

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
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
      auditService,
    });
    return app;
  }

  async function signIn(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
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
    return {
      token: extractSessionToken(res)!,
      userId: body.user.id as UserId,
      email: body.user.email,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Get learning structure
  // ---------------------------------------------------------------------------
  describe("GET /v1/courses/:courseId/learn", () => {
    it("returns full learning structure with modules, lessons, and progress", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "learner@example.com");
      const { courseId } = await seedCourseWithContent(app, token, "Learn Org");

      const res = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/learn`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        request_id: string;
        course: { id: string; title: string; subject: string | null };
        modules: Array<{
          id: string;
          title: string;
          description: string | null;
          sort_order: number;
          lessons: Array<{
            id: string;
            module_id: string;
            title: string;
            content_type: string;
            content_markdown: string;
            sort_order: number;
            estimated_minutes: number | null;
            completed: boolean;
            completed_at: string | null;
          }>;
        }>;
        progress: {
          total_lessons: number;
          completed_lessons: number;
          progress_percent: number;
        };
      };

      expect(body.request_id).toBeDefined();
      expect(body.course.id).toBe(courseId);
      expect(body.course.title).toBe("Pharmacology Basics");
      expect(body.course.subject).toBe("Pharmacy");

      // Verify modules are ordered
      expect(body.modules.length).toBe(2);
      expect(body.modules[0].title).toContain("Module 1");
      expect(body.modules[0].sort_order).toBe(1);
      expect(body.modules[1].title).toContain("Module 2");
      expect(body.modules[1].sort_order).toBe(2);

      // Verify lessons within module 1 are ordered
      const module1 = body.modules[0];
      expect(module1.lessons.length).toBe(2);
      expect(module1.lessons[0].title).toBe("Lesson 1.1: Intro");
      expect(module1.lessons[0].sort_order).toBe(1);
      expect(module1.lessons[1].title).toBe("Lesson 1.2: Nomenclature");
      expect(module1.lessons[1].sort_order).toBe(2);

      // Verify lesson content is present
      expect(module1.lessons[0].content_markdown).toBe(
        "# Intro to Drug Classes",
      );
      expect(module1.lessons[0].content_type).toBe("markdown");
      expect(module1.lessons[0].estimated_minutes).toBe(10);

      // Verify progress (all false since no progress recorded)
      expect(body.progress.total_lessons).toBe(3);
      expect(body.progress.completed_lessons).toBe(0);
      expect(body.progress.progress_percent).toBe(0);

      // Each lesson should have completed=false
      for (const mod of body.modules) {
        for (const lesson of mod.lessons) {
          expect(lesson.completed).toBe(false);
          expect(lesson.completed_at).toBeNull();
        }
      }

      await app.close();
    });

    it("reflects user lesson completion status", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "completer@example.com");
      const { courseId, lesson1Id } = await seedCourseWithContent(
        app,
        token,
        "Completion Org",
      );

      // Manually insert a completion record
      const now = new Date().toISOString();
      progressStore.insert({
        id: randomUUID(),
        userId,
        lessonId: lesson1Id,
        completed: true,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/learn`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        modules: Array<{
          lessons: Array<{
            id: string;
            completed: boolean;
            completed_at: string | null;
          }>;
        }>;
        progress: {
          total_lessons: number;
          completed_lessons: number;
          progress_percent: number;
        };
      };

      // First lesson should be completed
      const firstLesson = body.modules[0].lessons[0];
      expect(firstLesson.completed).toBe(true);
      expect(firstLesson.completed_at).toBe(now);

      // Other lessons should not be completed
      expect(body.modules[0].lessons[1].completed).toBe(false);

      // Progress summary
      expect(body.progress.total_lessons).toBe(3);
      expect(body.progress.completed_lessons).toBe(1);
      expect(body.progress.progress_percent).toBe(33);

      await app.close();
    });

    it("rejects unauthenticated request", async () => {
      const app = await buildApp();
      const fakeCourseId = "00000000-0000-0000-0000-000000000000";

      const res = await app.inject({
        method: "GET",
        url: `/v1/courses/${fakeCourseId}/learn`,
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("returns 404 for non-existent course", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "nonexistent@example.com");

      const res = await app.inject({
        method: "GET",
        url: "/v1/courses/00000000-0000-0000-0000-000000000000/learn",
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("returns 400 for invalid course ID format", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "badid@example.com");

      const res = await app.inject({
        method: "GET",
        url: "/v1/courses/not-a-uuid/learn",
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("prevents cross-tenant access (non-disclosing 404)", async () => {
      const app = await buildApp();
      const { token: token1 } = await signIn(app, "tenant1@example.com");
      const { courseId } = await seedCourseWithContent(
        app,
        token1,
        "Tenant 1 Org",
      );

      // Tenant 2 should not see Tenant 1's course
      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "tenant2@example.com");

      const res = await app2.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/learn`,
        cookies: { avana_session: token2 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PR-4: Learning progress API", () => {
    it("persists a student completion, updates percentage, and emits one audit event", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "student@example.com");
      const { organizationId, courseId, lesson1Id } =
        await seedCourseWithContent(app, token, "Student Progress Org");
      orgStore.setMembershipRole(organizationId, userId, "student");

      const complete = await app.inject({
        method: "POST",
        url: `/v1/courses/${courseId}/lessons/${lesson1Id}/progress`,
        cookies: { avana_session: token },
        payload: { completed: true },
      });

      expect(complete.statusCode).toBe(200);
      const completion = JSON.parse(complete.body) as {
        lesson_id: string;
        completed: boolean;
        completed_at: string | null;
      };
      expect(completion).toMatchObject({
        lesson_id: lesson1Id,
        completed: true,
      });
      expect(completion.completed_at).not.toBeNull();

      // A fresh read models the browser refresh path and must retain state.
      const learning = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/learn`,
        cookies: { avana_session: token },
      });
      const learningBody = JSON.parse(learning.body) as {
        modules: Array<{
          lessons: Array<{ id: string; completed: boolean }>;
        }>;
        progress: {
          completed_lessons: number;
          progress_percent: number;
        };
      };
      const completedLesson = learningBody.modules
        .flatMap((module) => module.lessons)
        .find((lesson) => lesson.id === lesson1Id);
      expect(completedLesson?.completed).toBe(true);
      expect(learningBody.progress).toMatchObject({
        completed_lessons: 1,
        progress_percent: 33,
      });

      const progress = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/progress`,
        cookies: { avana_session: token },
      });
      expect(progress.statusCode).toBe(200);
      expect(JSON.parse(progress.body)).toEqual({
        course_id: courseId,
        total_lessons: 3,
        completed_lessons: 1,
        percentage: 33,
      });

      // Completion is idempotent and does not produce duplicate change events.
      const repeated = await app.inject({
        method: "POST",
        url: `/v1/courses/${courseId}/lessons/${lesson1Id}/progress`,
        cookies: { avana_session: token },
        payload: { completed: true },
      });
      expect(JSON.parse(repeated.body).completed_at).toBe(
        completion.completed_at,
      );

      const progressEvents = (await auditStore.listAll()).filter(
        (event) => event.action === "lesson.completed",
      );
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0]).toMatchObject({
        actorId: userId,
        organizationId,
        entityType: "lesson_progress",
        entityId: lesson1Id,
        details: { course_id: courseId },
      });

      await app.close();
    });

    it("rejects progress access outside the course organization", async () => {
      const app = await buildApp();
      const owner = await signIn(app, "progress-owner@example.com");
      const { courseId, lesson1Id } = await seedCourseWithContent(
        app,
        owner.token,
        "Progress Owner Org",
      );
      const outsider = await signIn(app, "progress-outsider@example.com");

      const write = await app.inject({
        method: "POST",
        url: `/v1/courses/${courseId}/lessons/${lesson1Id}/progress`,
        cookies: { avana_session: outsider.token },
        payload: { completed: true },
      });
      const read = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/progress`,
        cookies: { avana_session: outsider.token },
      });

      expect(write.statusCode).toBe(404);
      expect(read.statusCode).toBe(404);
      expect(
        (await auditStore.listAll()).filter(
          (event) => event.action === "lesson.completed",
        ),
      ).toHaveLength(0);

      await app.close();
    });

    it("rejects a lesson that does not belong to the course in the URL", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "course-scope@example.com");
      const first = await seedCourseWithContent(app, token, "First Scope Org");
      const second = await seedCourseWithContent(
        app,
        token,
        "Second Scope Org",
      );

      const response = await app.inject({
        method: "POST",
        url: `/v1/courses/${second.courseId}/lessons/${first.lesson1Id}/progress`,
        cookies: { avana_session: token },
        payload: { completed: true },
      });

      expect(response.statusCode).toBe(404);
      expect(
        await progressStore.findByUserAndLesson(userId, first.lesson1Id),
      ).toBeUndefined();
      expect(
        (await auditStore.listAll()).filter(
          (event) => event.action === "lesson.completed",
        ),
      ).toHaveLength(0);

      await app.close();
    });
  });
});
