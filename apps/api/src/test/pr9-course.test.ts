/**
 * PR-9 Integration tests: Course vertical slice.
 *
 * Covers all acceptance criteria:
 * 1. Course CRUD inside an organization
 * 2. Organization-scoped course access
 * 3. Cross-tenant isolation (non-disclosing failure)
 * 4. Role matrix (student/editor/admin permissions)
 * 5. Archived course behavior
 * 6. Audit events for course mutations
 * 7. Validation errors
 *
 * Follows the PR-8 test pattern where each test creates its own app instance
 * with fresh store instances. Modules are registered once per app.
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
  auditCourseCreated,
  auditCourseUpdated,
  auditCourseArchived,
} from "@avana/domain";
import type { UserId } from "@avana/domain";

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

describe("PR-9: Course vertical slice", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
  });

  /**
   * Creates a Fastify app with all modules registered.
   */
  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
    });
    return app;
  }

  /**
   * Signs in a user and returns session info.
   * Stores are shared; no need to re-register modules.
   */
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
      userId: body.user.id,
      email: body.user.email,
    };
  }

  /**
   * Creates an organization and returns it.
   */
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
    return body.organization;
  }

  /**
   * Sets a user's membership role in the in-memory org store.
   */
  function setOrgMembershipRole(userId: string, orgId: string, role: string) {
    orgStore.setMembershipRole(
      orgId as UserId as never,
      userId as UserId,
      role as string as never,
    );
  }

  describe("1. Course creation", () => {
    it("creates a course inside an organization", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "admin@example.com");
      const org = await createOrg(app, token, "Test Org");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: {
          title: "Biology 101",
          subject: "Science",
          exam_at: "2026-06-15T00:00:00Z",
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body) as {
        course: {
          id: string;
          title: string;
          subject: string;
          exam_at: string;
          archived: boolean;
        };
      };
      expect(body.course.title).toBe("Biology 101");
      expect(body.course.subject).toBe("Science");
      expect(body.course.archived).toBe(false);

      // Verify audit event was emitted
      const events = courseStore.getAuditEvents();
      expect(events.length).toBe(1);
      expect(events[0].action).toBe("course.created");
      await app.close();
    });

    it("rejects empty course title", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "admin2@example.com");
      const org = await createOrg(app, token, "Test Org 2");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "", subject: null, exam_at: null },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects title exceeding 200 characters", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "admin3@example.com");
      const org = await createOrg(app, token, "Test Org 3");

      const res = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "A".repeat(201), subject: null, exam_at: null },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects unauthenticated request", async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations/00000000-0000-0000-0000-000000000000/courses",
        payload: {
          title: "Unauthenticated Course",
          subject: null,
          exam_at: null,
        },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("rejects course creation in non-existent org (non-disclosing)", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "nouser@example.com");

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations/00000000-0000-0000-0000-000000000000/courses",
        cookies: { avana_session: token },
        payload: { title: "Orphan Course", subject: null, exam_at: null },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("2. Course listing", () => {
    it("lists courses scoped to an organization", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "member@example.com");
      const org = await createOrg(app, token, "List Org");

      // Create two courses
      await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Course A", subject: null, exam_at: null },
      });
      await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Course B", subject: null, exam_at: null },
      });

      const listRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
      });
      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.body) as {
        items: Array<{ id: string; title: string }>;
      };
      expect(body.items.length).toBe(2);
      expect(body.items.map((c) => c.title).sort()).toEqual([
        "Course A",
        "Course B",
      ]);
      await app.close();
    });

    it("returns empty list when org has no courses", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "empty@example.com");
      const org = await createOrg(app, token, "Empty Org");

      const listRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
      });
      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.body) as { items: Array<unknown> };
      expect(body.items.length).toBe(0);
      await app.close();
    });
  });

  describe("3. Course read/get", () => {
    it("gets a single course by ID within an org", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "reader@example.com");
      const org = await createOrg(app, token, "Read Org");

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Readable Course", subject: "Math", exam_at: null },
      });
      const created = JSON.parse(createRes.body) as {
        course: { id: string; title: string };
      };

      const getRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
      });
      expect(getRes.statusCode).toBe(200);
      const body = JSON.parse(getRes.body) as {
        course: { id: string; title: string; subject: string };
      };
      expect(body.course.title).toBe("Readable Course");
      expect(body.course.subject).toBe("Math");
      await app.close();
    });

    it("rejects getting a course by ID alone (non-disclosing 404)", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "cross@example.com");
      const org = await createOrg(app, token, "Cross Org");

      const getRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses/00000000-0000-0000-0000-000000000000`,
        cookies: { avana_session: token },
      });
      expect(getRes.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("4. Course update", () => {
    it("updates a course title, subject, and exam date", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "updater@example.com");
      const org = await createOrg(app, token, "Update Org");

      // Make the user an org_admin so they can update
      setOrgMembershipRole(userId, org.id, "organization_admin");

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Old Title", subject: "Old", exam_at: null },
      });
      const created = JSON.parse(createRes.body) as {
        course: { id: string };
      };

      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
        payload: {
          title: "New Title",
          subject: "New Subject",
          exam_at: "2026-12-01T00:00:00Z",
        },
      });
      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.body) as {
        course: {
          id: string;
          title: string;
          subject: string;
          exam_at: string;
          updated_at: string;
        };
      };
      expect(body.course.title).toBe("New Title");
      expect(body.course.subject).toBe("New Subject");
      expect(body.course.exam_at).toBe("2026-12-01T00:00:00Z");

      // Verify audit event
      const events = courseStore.getAuditEvents();
      const updateEvent = events.find((e) => e.action === "course.updated");
      expect(updateEvent).toBeDefined();
      expect(updateEvent!.details?.title).toBe("New Title");
      await app.close();
    });

    it("rejects update by student role", async () => {
      const app = await buildApp();

      // Sign in and create org (user is org_admin by default)
      const { token, userId } = await signIn(app, "student@example.com");
      const org = await createOrg(app, token, "Student Org");

      // Change role to student
      setOrgMembershipRole(userId, org.id, "student");

      // Create a course (student has course:create)
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Student Course", subject: null, exam_at: null },
      });
      const created = JSON.parse(createRes.body) as {
        course: { id: string };
      };

      // Try to update (student does NOT have course:update)
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
        payload: { title: "Hacked Title" },
      });
      expect(updateRes.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("5. Course archive (soft delete)", () => {
    it("archives a course", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "archiver@example.com");
      const org = await createOrg(app, token, "Archive Org");

      // Make user org_admin to allow archiving
      setOrgMembershipRole(userId, org.id, "organization_admin");

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "To Archive", subject: null, exam_at: null },
      });
      const created = JSON.parse(createRes.body) as {
        course: { id: string };
      };

      const archiveRes = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
      });
      expect(archiveRes.statusCode).toBe(204);

      // Verify audit event
      const events = courseStore.getAuditEvents();
      const archiveEvent = events.find((e) => e.action === "course.archived");
      expect(archiveEvent).toBeDefined();

      // Archived course should not appear in list
      const listRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
      });
      const listBody = JSON.parse(listRes.body) as {
        items: Array<{ id: string }>;
      };
      const archivedCourse = listBody.items.find(
        (c) => c.id === created.course.id,
      );
      expect(archivedCourse).toBeUndefined();
      await app.close();
    });

    it("rejects archive by course_editor role", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "editor@example.com");
      const org = await createOrg(app, token, "Editor Org");

      // Set role to course_editor
      setOrgMembershipRole(userId, org.id, "course_editor");

      // Create a course (course_editor has course:create)
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Editor Course", subject: null, exam_at: null },
      });
      const created = JSON.parse(createRes.body) as {
        course: { id: string };
      };

      // Try to archive (course_editor does NOT have course:archive)
      const archiveRes = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
      });
      expect(archiveRes.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("6. Cross-tenant isolation", () => {
    it("prevents cross-tenant course read (non-disclosing 404)", async () => {
      // Tenant 1 app
      const app1 = await buildApp();
      const { token: token1 } = await signIn(app1, "tenant1@example.com");
      const org1 = await createOrg(app1, token1, "Tenant 1");

      const createRes = await app1.inject({
        method: "POST",
        url: `/v1/organizations/${org1.id}/courses`,
        cookies: { avana_session: token1 },
        payload: { title: "Tenant 1 Course", subject: null, exam_at: null },
      });
      const created = JSON.parse(createRes.body) as {
        course: { id: string };
      };

      // Tenant 2 app
      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "tenant2@example.com");
      const org2 = await createOrg(app2, token2, "Tenant 2");

      // Tenant 2 tries to read Tenant 1's course using Tenant 2's org in the URL
      const getRes = await app2.inject({
        method: "GET",
        url: `/v1/organizations/${org2.id}/courses/${created.course.id}`,
        cookies: { avana_session: token2 },
      });
      // Non-disclosing failure: course doesn't exist in Tenant 2's org
      expect(getRes.statusCode).toBe(404);

      await app1.close();
      await app2.close();
    });

    it("prevents cross-tenant course listing", async () => {
      // Tenant 1 app
      const app1 = await buildApp();
      const { token: token1 } = await signIn(app1, "list1@example.com");
      const org1 = await createOrg(app1, token1, "List Tenant 1");
      await app1.inject({
        method: "POST",
        url: `/v1/organizations/${org1.id}/courses`,
        cookies: { avana_session: token1 },
        payload: { title: "Secret Course", subject: null, exam_at: null },
      });

      // Tenant 2 app
      const app2 = await buildApp();
      const { token: token2 } = await signIn(app2, "list2@example.com");
      const org2 = await createOrg(app2, token2, "List Tenant 2");

      const listRes = await app2.inject({
        method: "GET",
        url: `/v1/organizations/${org2.id}/courses`,
        cookies: { avana_session: token2 },
      });
      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.body) as { items: Array<unknown> };
      expect(body.items.length).toBe(0);

      await app1.close();
      await app2.close();
    });
  });

  describe("7. Course_editor permissions", () => {
    it("allows course_editor to create, read, and update courses", async () => {
      const app = await buildApp();
      const { token, userId } = await signIn(app, "editor2@example.com");
      const org = await createOrg(app, token, "Editor Perms Org");

      // Set role to course_editor
      setOrgMembershipRole(userId, org.id, "course_editor");

      // Create (course_editor has course:create)
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Editor Course", subject: null, exam_at: null },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body) as {
        course: { id: string };
      };

      // Read (course_editor has course:read)
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
      });
      expect(getRes.statusCode).toBe(200);

      // Update (course_editor has course:update)
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
        payload: { title: "Updated by Editor" },
      });
      expect(updateRes.statusCode).toBe(200);
      await app.close();
    });
  });

  describe("8. Organization_admin permissions", () => {
    it("allows org_admin to manage courses fully (create, read, update, archive)", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "orgadmin@example.com");
      const org = await createOrg(app, token, "Admin Full Org");

      // Create
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${org.id}/courses`,
        cookies: { avana_session: token },
        payload: { title: "Admin Course", subject: null, exam_at: null },
      });
      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body) as {
        course: { id: string };
      };

      // Update
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
        payload: { title: "Admin Updated" },
      });
      expect(updateRes.statusCode).toBe(200);

      // Archive
      const archiveRes = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${org.id}/courses/${created.course.id}`,
        cookies: { avana_session: token },
      });
      expect(archiveRes.statusCode).toBe(204);
      await app.close();
    });
  });

  describe("9. Audit event helpers (domain-level unit tests)", () => {
    it("produces correct audit event for course creation", () => {
      const event = auditCourseCreated(
        "u1" as UserId,
        "o1" as UserId as never,
        "c1",
        "Test Course",
        "Science",
        "2026-06-15T00:00:00Z",
      );
      expect(event.action).toBe("course.created");
      expect(event.entityType).toBe("course");
      expect(event.actorId).toBe("u1" as UserId);
      expect(event.details?.title).toBe("Test Course");
      expect(event.details?.subject).toBe("Science");
    });

    it("produces correct audit event for course update", () => {
      const event = auditCourseUpdated(
        "u1" as UserId,
        "o1" as UserId as never,
        "c1",
        { title: "New Title" },
      );
      expect(event.action).toBe("course.updated");
      expect(event.entityType).toBe("course");
      expect(event.details?.title).toBe("New Title");
    });

    it("produces correct audit event for course archiving", () => {
      const event = auditCourseArchived(
        "u1" as UserId,
        "o1" as UserId as never,
        "c1",
      );
      expect(event.action).toBe("course.archived");
      expect(event.entityType).toBe("course");
      expect(event.entityId).toBe("c1");
    });
  });
});
