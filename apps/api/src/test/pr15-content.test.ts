/**
 * PR5-A Integration tests: Content authoring API.
 *
 * Covers all acceptance criteria:
 * 1. Editor can read course content (including drafts)
 * 2. Editor can create a draft lesson
 * 3. Editor can update a lesson
 * 4. Editor can publish a draft lesson
 * 5. Learner APIs filter out draft lessons
 * 6. Non-editor cannot access content endpoints
 * 7. Cross-tenant isolation (non-disclosing failure)
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

describe("PR5-A: Content authoring API", () => {
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

  async function seedOrgWithCourse(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    orgName: string,
  ) {
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

    const courseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses`,
      cookies: { avana_session: token },
      payload: {
        title: "Test Course",
        subject: "Testing",
        exam_at: null,
      },
    });
    expect(courseRes.statusCode).toBe(201);
    const courseBody = JSON.parse(courseRes.body) as {
      course: { id: string };
    };
    const courseId = courseBody.course.id as CourseId;

    const now = new Date().toISOString();
    const moduleId = randomUUID() as ModuleId;
    moduleStore.insert({
      id: moduleId,
      courseId,
      title: "Test Module",
      description: "A test module",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const publishedLessonId = randomUUID() as LessonId;
    lessonStore.insert({
      id: publishedLessonId,
      moduleId,
      title: "Published Lesson",
      contentType: "markdown",
      contentMarkdown: "# Published",
      sortOrder: 1,
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const draftLessonId = randomUUID() as LessonId;
    lessonStore.insert({
      id: draftLessonId,
      moduleId,
      title: "Draft Lesson",
      contentType: "markdown",
      contentMarkdown: "# Draft",
      sortOrder: 2,
      estimatedMinutes: 3,
      publicationStatus: "draft",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return {
      organizationId,
      courseId,
      moduleId,
      publishedLessonId,
      draftLessonId,
    };
  }

  // ---------------------------------------------------------------------------
  // Content read endpoint
  // ---------------------------------------------------------------------------
  describe("GET /v1/organizations/:orgId/courses/:courseId/content", () => {
    it("returns all lessons including drafts for an editor", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId } = await seedOrgWithCourse(
        app,
        token,
        "Editor Org",
      );

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/content`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        request_id: string;
        course: { id: string; title: string };
        modules: Array<{
          id: string;
          title: string;
          lessons: Array<{
            id: string;
            title: string;
            publicationStatus: string;
          }>;
        }>;
      };
      expect(body.request_id).toBeDefined();
      expect(body.course.title).toBe("Test Course");
      expect(body.modules).toHaveLength(1);
      expect(body.modules[0].lessons).toHaveLength(2);
      expect(body.modules[0].lessons[0].publicationStatus).toBe("published");
      expect(body.modules[0].lessons[1].publicationStatus).toBe("draft");
      await app.close();
    });

    it("rejects access for a student (non-editor)", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "student@example.com");
      const { organizationId, courseId } = await seedOrgWithCourse(
        app,
        token,
        "Student Org",
      );

      // Demote to student role
      orgStore.setMembershipRole(organizationId, userId, "student");

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/content`,
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("rejects unauthenticated request", async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: "GET",
        url: "/v1/organizations/00000000-0000-0000-0000-000000000000/courses/00000000-0000-0000-0000-000000000000/content",
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("returns 404 for cross-tenant access", async () => {
      const app = await buildApp();
      const { token: token1 } = await signIn(app, "tenant1@example.com");
      const { organizationId, courseId } = await seedOrgWithCourse(
        app,
        token1,
        "Tenant 1",
      );

      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "tenant2@example.com");

      const res = await app2.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/content`,
        cookies: { avana_session: token2 },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
      await app2.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Create lesson
  // ---------------------------------------------------------------------------
  describe("POST /v1/organizations/:orgId/courses/:courseId/modules/:moduleId/lessons", () => {
    it("creates a draft lesson and returns it", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId } = await seedOrgWithCourse(
        app,
        token,
        "Create Org",
      );

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons`,
        cookies: { avana_session: token },
        payload: {
          title: "New Lesson",
          content_markdown: "# New content",
          estimated_minutes: 10,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as {
        request_id: string;
        lesson: { id: string; title: string; publicationStatus: string };
      };
      expect(body.lesson.title).toBe("New Lesson");
      expect(body.lesson.publicationStatus).toBe("draft");
      await app.close();
    });

    it("rejects when title is missing", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId } = await seedOrgWithCourse(
        app,
        token,
        "Missing Title",
      );

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons`,
        cookies: { avana_session: token },
        payload: { content_markdown: "# content" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects for student role", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "student@example.com");
      const { organizationId, courseId, moduleId } = await seedOrgWithCourse(
        app,
        token,
        "Student Create",
      );

      orgStore.setMembershipRole(organizationId, userId, "student");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons`,
        cookies: { avana_session: token },
        payload: { title: "Nope" },
      });
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Update lesson
  // ---------------------------------------------------------------------------
  describe("PATCH /v1/organizations/:orgId/courses/:courseId/modules/:moduleId/lessons/:lessonId", () => {
    it("updates lesson title and content", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, draftLessonId } =
        await seedOrgWithCourse(app, token, "Update Org");

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}`,
        cookies: { avana_session: token },
        payload: {
          title: "Updated Title",
          content_markdown: "# Updated content",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        request_id: string;
        lesson: { id: string; title: string; publicationStatus: string };
      };
      expect(body.lesson.title).toBe("Updated Title");
      expect(body.lesson.publicationStatus).toBe("draft"); // Still draft after update
      await app.close();
    });

    it("does not publish implicitly on update", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, draftLessonId } =
        await seedOrgWithCourse(app, token, "No Implicit Publish");

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}`,
        cookies: { avana_session: token },
        payload: { title: "Still Draft" },
      });

      const body = JSON.parse(res.body) as {
        lesson: { publicationStatus: string };
      };
      expect(body.lesson.publicationStatus).toBe("draft");
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Publish lesson
  // ---------------------------------------------------------------------------
  describe("POST /v1/organizations/:orgId/courses/:courseId/modules/:moduleId/lessons/:lessonId/publish", () => {
    it("publishes a draft lesson", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, draftLessonId } =
        await seedOrgWithCourse(app, token, "Publish Org");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}/publish`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        request_id: string;
        lesson: { id: string; title: string; publicationStatus: string };
      };
      expect(body.lesson.publicationStatus).toBe("published");
      await app.close();
    });

    it("rejects publishing a lesson with empty title", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId } = await seedOrgWithCourse(
        app,
        token,
        "Empty Title",
      );

      const now = new Date().toISOString();
      const emptyLessonId = randomUUID() as LessonId;
      lessonStore.insert({
        id: emptyLessonId,
        moduleId,
        title: "",
        contentType: "markdown",
        contentMarkdown: "# content",
        sortOrder: 3,
        estimatedMinutes: 1,
        publicationStatus: "draft",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${emptyLessonId}/publish`,
        cookies: { avana_session: token },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("is idempotent when already published", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, publishedLessonId } =
        await seedOrgWithCourse(app, token, "Idempotent");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${publishedLessonId}/publish`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        lesson: { publicationStatus: string };
      };
      expect(body.lesson.publicationStatus).toBe("published");
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Learner draft filtering
  // ---------------------------------------------------------------------------
  describe("Learner APIs filter drafts", () => {
    it("excludes draft lessons from course learning response", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "learner@example.com");
      const { organizationId, courseId, publishedLessonId } =
        await seedOrgWithCourse(app, token, "Filter Org");

      // Set role to student
      orgStore.setMembershipRole(organizationId, userId, "student");

      const res = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/learn`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        modules: Array<{ lessons: Array<{ id: string }> }>;
        progress: { total_lessons: number };
      };
      // Should only see published lesson (1), not draft (1)
      expect(body.modules[0].lessons).toHaveLength(1);
      expect(body.modules[0].lessons[0].id).toBe(publishedLessonId);
      expect(body.progress.total_lessons).toBe(1);
      await app.close();
    });

    it("rejects completing a draft lesson", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "learner@example.com");
      const { organizationId, courseId, draftLessonId } =
        await seedOrgWithCourse(app, token, "Draft Complete");

      orgStore.setMembershipRole(organizationId, userId, "student");

      const res = await app.inject({
        method: "POST",
        url: `/v1/courses/${courseId}/lessons/${draftLessonId}/progress`,
        cookies: { avana_session: token },
        payload: { completed: true },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("excludes drafts from course progress count", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "learner@example.com");
      const { organizationId, courseId } = await seedOrgWithCourse(
        app,
        token,
        "Progress Filter",
      );

      orgStore.setMembershipRole(organizationId, userId, "student");

      const res = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/progress`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        total_lessons: number;
        completed_lessons: number;
        percentage: number;
      };
      expect(body.total_lessons).toBe(1); // Only published lesson counted
      expect(body.completed_lessons).toBe(0);
      expect(body.percentage).toBe(0);
      await app.close();
    });

    it("excludes drafts from course progress count even when completed", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "learner@example.com");
      const { organizationId, courseId, publishedLessonId } =
        await seedOrgWithCourse(app, token, "Progress Filter Completed");

      orgStore.setMembershipRole(organizationId, userId, "student");

      // Complete the published lesson
      const completeRes = await app.inject({
        method: "POST",
        url: `/v1/courses/${courseId}/lessons/${publishedLessonId}/progress`,
        cookies: { avana_session: token },
        payload: { completed: true },
      });
      expect(completeRes.statusCode).toBe(200);

      const res = await app.inject({
        method: "GET",
        url: `/v1/courses/${courseId}/progress`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        total_lessons: number;
        completed_lessons: number;
        percentage: number;
      };
      expect(body.total_lessons).toBe(1); // Only published lesson counted
      expect(body.completed_lessons).toBe(1);
      expect(body.percentage).toBe(100);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Audit event verification
  // ---------------------------------------------------------------------------
  describe("Audit events for content mutations", () => {
    it("records audit event on lesson creation", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId } = await seedOrgWithCourse(
        app,
        token,
        "Audit Create",
      );

      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons`,
        cookies: { avana_session: token },
        payload: {
          title: "Audited Lesson",
          content_markdown: "# Audit content",
        },
      });

      const events = await auditStore.listAll();
      const lessonCreated = events.find(
        (e: { action: string }) => e.action === "lesson.created",
      );
      expect(lessonCreated).toBeDefined();
      expect(lessonCreated!.actorId).toBe(userId);
      expect(lessonCreated!.organizationId).toBe(organizationId);
      expect(lessonCreated!.details?.title).toBe("Audited Lesson");
      expect(lessonCreated!.details?.publication_status).toBe("draft");
      await app.close();
    });

    it("records audit event with changed fields and content metadata on update", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, draftLessonId } =
        await seedOrgWithCourse(app, token, "Audit Update");

      await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}`,
        cookies: { avana_session: token },
        payload: {
          title: "Updated Title",
          content_markdown: "# Updated content for audit",
        },
      });

      const events = await auditStore.listAll();
      const lessonUpdated = events.find(
        (e: { action: string }) => e.action === "lesson.updated",
      );
      expect(lessonUpdated).toBeDefined();
      expect(lessonUpdated!.actorId).toBe(userId);
      const details = lessonUpdated!.details;
      expect(details?.changed_fields).toBeDefined();
      const changedFields = details?.changed_fields as readonly string[];
      expect(changedFields).toContain("title");
      expect(changedFields).toContain("content_markdown");
      expect(details?.content_length).toBeGreaterThan(0);
      expect(details?.content_sha256).toBeDefined();
      // Never contains full markdown
      expect(JSON.stringify(details)).not.toContain(
        "Updated content for audit",
      );
      await app.close();
    });

    it("records audit event on lesson publish", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, draftLessonId } =
        await seedOrgWithCourse(app, token, "Audit Publish");

      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}/publish`,
        cookies: { avana_session: token },
      });

      const events = await auditStore.listAll();
      const lessonPublished = events.find(
        (e: { action: string }) => e.action === "lesson.published",
      );
      expect(lessonPublished).toBeDefined();
      expect(lessonPublished!.actorId).toBe(userId);
      expect(lessonPublished!.organizationId).toBe(organizationId);
      expect(lessonPublished!.entityId).toBe(draftLessonId);
      expect(lessonPublished!.details?.course_id).toBe(courseId);
      expect(lessonPublished!.details?.module_id).toBe(moduleId);
      await app.close();
    });

    it("does not emit duplicate publish audit event on idempotent publish", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, draftLessonId } =
        await seedOrgWithCourse(app, token, "Audit Idempotent");

      // First publish
      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}/publish`,
        cookies: { avana_session: token },
      });

      // Second publish (idempotent)
      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}/publish`,
        cookies: { avana_session: token },
      });

      const events = await auditStore.listAll();
      const publishEvents = events.filter(
        (e: { action: string }) => e.action === "lesson.published",
      );
      expect(publishEvents).toHaveLength(1); // Only one publish event
      await app.close();
    });

    it("does not emit duplicate update audit event for no-op update", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "editor@example.com");
      const { organizationId, courseId, moduleId, draftLessonId } =
        await seedOrgWithCourse(app, token, "Audit No-op");

      // Send empty update (no fields changed)
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/modules/${moduleId}/lessons/${draftLessonId}`,
        cookies: { avana_session: token },
        payload: {},
      });
      expect(res.statusCode).toBe(200);

      const events = await auditStore.listAll();
      const updateEvents = events.filter(
        (e: { action: string }) => e.action === "lesson.updated",
      );
      expect(updateEvents).toHaveLength(0); // No update event for no-op
      await app.close();
    });
  });
});
