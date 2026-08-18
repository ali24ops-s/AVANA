/**
 * PR5-D2 Integration tests: Organization membership role resolution in auth
 * responses.
 *
 * The frontend must know a user's organization membership roles so permission
 * checks (`canManageCourseContent`) work correctly. The `/v1/me` and
 * `/v1/auth/sign-in` responses expose a `memberships` array of
 * `{ organization_id, role }` entries. The base `user.role` is intentionally
 * left unchanged (always "student") for backward compatibility.
 *
 * Covers:
 * 1. organization_admin membership is exposed in /v1/me and /v1/auth/sign-in
 * 2. course_editor membership is exposed
 * 3. student membership stays student
 * 4. multiple memberships are all exposed
 * 5. course_editor permissions work end-to-end (content endpoints)
 * 6. No org membership -> empty memberships array (backward compatible)
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
import type { OrganizationId, ModuleId, CourseId, UserId } from "@avana/domain";
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

type MeBody = {
  user: { id: string; email: string; role: string };
  memberships: Array<{ organization_id: string; role: string }>;
};

describe("PR5-D2: Organization membership role resolution", () => {
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
    const body = JSON.parse(res.body) as MeBody;
    return {
      token: extractSessionToken(res)!,
      userId: body.user.id as UserId,
      email: body.user.email,
      signInRole: body.user.role,
      signInMemberships: body.memberships,
    };
  }

  async function getMe(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
  ): Promise<MeBody> {
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { avana_session: token },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body) as MeBody;
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    name: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      organization: { id: string; name: string };
    };
    return {
      id: body.organization.id as OrganizationId,
      name: body.organization.name,
    };
  }

  describe("1. organization_admin membership", () => {
    it("exposes organization_admin membership in /v1/me and /v1/auth/sign-in after creating an org", async () => {
      const app = await buildApp();
      const { token, signInRole, signInMemberships } = await signIn(
        app,
        "admin@example.com",
      );

      // Before any membership, sign-in returns the base role (student) and
      // an empty memberships array.
      expect(signInRole).toBe("student");
      expect(signInMemberships).toEqual([]);

      // Creating an org makes the user an organization_admin
      await createOrg(app, token, "Admin Org");
      const me = await getMe(app, token);
      expect(me.user.role).toBe("student");
      expect(me.memberships).toHaveLength(1);
      expect(me.memberships[0]!.role).toBe("organization_admin");

      // A fresh sign-in should also expose the memberships
      const signIn2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "admin@example.com", name: "Admin" },
      });
      const signIn2Body = JSON.parse(signIn2.body) as MeBody;
      expect(signIn2Body.memberships[0]!.role).toBe("organization_admin");

      await app.close();
    });
  });

  describe("2. course_editor membership", () => {
    it("exposes course_editor when the user's membership role is course_editor", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "editor@example.com");
      const org = await createOrg(app, token, "Editor Org");

      orgStore.setMembershipRole(org.id, userId, "course_editor");

      const me = await getMe(app, token);
      expect(me.user.role).toBe("student");
      expect(me.memberships).toHaveLength(1);
      expect(me.memberships[0]!.role).toBe("course_editor");
      await app.close();
    });
  });

  describe("3. student stays student", () => {
    it("exposes student when the user's membership role is student", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "student@example.com");
      const org = await createOrg(app, token, "Student Org");

      orgStore.setMembershipRole(org.id, userId, "student");

      const me = await getMe(app, token);
      expect(me.user.role).toBe("student");
      expect(me.memberships).toHaveLength(1);
      expect(me.memberships[0]!.role).toBe("student");
      await app.close();
    });

    it("exposes an empty memberships array when the user has no memberships", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "nobody@example.com");

      const me = await getMe(app, token);
      expect(me.user.role).toBe("student");
      expect(me.memberships).toEqual([]);
      await app.close();
    });
  });

  describe("4. multiple memberships", () => {
    it("exposes all memberships with their roles", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "multi@example.com");

      // Create two orgs (both make the user org_admin)
      const orgA = await createOrg(app, token, "Org A");
      const orgB = await createOrg(app, token, "Org B");

      // Set distinct roles per membership
      orgStore.setMembershipRole(orgA.id, userId, "course_editor");
      orgStore.setMembershipRole(orgB.id, userId, "organization_admin");

      const me = await getMe(app, token);
      expect(me.memberships).toHaveLength(2);
      const roles = me.memberships.map((m) => m.role).sort();
      expect(roles).toEqual(["course_editor", "organization_admin"]);

      await app.close();
    });
  });

  describe("5. course_editor permissions work end-to-end", () => {
    it("a course_editor can access content endpoints", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "editor-perms@example.com");
      const org = await createOrg(app, token, "Perms Org");
      orgStore.setMembershipRole(org.id, userId, "course_editor");

      // Create a course (course_editor has course:create)
      const courseRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Course", subject: null, exam_at: null },
      });
      expect(courseRes.statusCode).toBe(201);
      const courseBody = JSON.parse(courseRes.body) as {
        course: { id: string };
      };
      const courseId = courseBody.course.id as CourseId;

      // Seed a module via the store
      const now = new Date().toISOString();
      const moduleId = randomUUID() as ModuleId;
      moduleStore.insert({
        id: moduleId,
        courseId,
        title: "Module",
        description: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      // course_editor can create a lesson (content:write)
      const createLessonRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses/${courseId}/modules/${moduleId}/lessons`,
        cookies: { avana_session: token },
        payload: { title: "Lesson", content_markdown: "# Body" },
      });
      expect(createLessonRes.statusCode).toBe(201);
      const lessonBody = JSON.parse(createLessonRes.body) as {
        lesson: { id: string; publication_status: string };
      };
      expect(lessonBody.lesson.publication_status).toBe("draft");

      // course_editor can publish a lesson (content:publish)
      const publishRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses/${courseId}/modules/${moduleId}/lessons/${lessonBody.lesson.id}/publish`,
        cookies: { avana_session: token },
      });
      expect(publishRes.statusCode).toBe(200);
      const publishBody = JSON.parse(publishRes.body) as {
        lesson: { publication_status: string };
      };
      expect(publishBody.lesson.publication_status).toBe("published");

      // course_editor can delete a lesson (content:write)
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${org.id}/courses/${courseId}/modules/${moduleId}/lessons/${lessonBody.lesson.id}`,
        cookies: { avana_session: token },
      });
      expect(deleteRes.statusCode).toBe(204);

      await app.close();
    });
  });
});
