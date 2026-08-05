/**
 * PR-12 E2E Critical Path Test.
 *
 * Covers the full Sprint 1 critical path:
 * 1. Sign in
 * 2. Verify /v1/me
 * 3. Create organization
 * 4. Create course
 * 5. Read/list course
 * 6. Update course
 * 7. Archive course
 * 8. Sign out
 * 9. Verify subsequent authenticated request returns 401
 *
 * Uses the existing app.inject() pattern with in-memory stores,
 * consistent with PR-7, PR-8, PR-9, and PR-11 test infrastructure.
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
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  return res.cookies.find((c) => c.name === "avana_session")?.value;
}

describe("PR-12: Sprint 1 E2E Critical Path", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
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
      auditService,
    });
    return app;
  }

  it("completes the full Sprint 1 critical path (auth → org → course → sign out → deny)", async () => {
    const app = await buildApp();

    // -----------------------------------------------------------------------
    // Step 1: Sign in
    // -----------------------------------------------------------------------
    const signInRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "alice@example.com", name: "Alice" },
    });
    expect(signInRes.statusCode).toBe(200);
    const signInBody = JSON.parse(signInRes.body) as {
      request_id: string;
      user: { id: string; email: string; role: string };
    };
    expect(signInBody.user.email).toBe("alice@example.com");
    expect(signInBody.user.role).toBe("student");

    const sessionToken = extractSessionToken(signInRes);
    expect(sessionToken).toBeDefined();
    const token = sessionToken!;

    // -----------------------------------------------------------------------
    // Step 2: Verify /v1/me
    // -----------------------------------------------------------------------
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { avana_session: token },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body) as {
      user: { id: string; email: string; role: string };
    };
    expect(meBody.user.email).toBe("alice@example.com");
    expect(meBody.user.role).toBe("student");
    expect(meBody.user.id).toBe(signInBody.user.id);

    // -----------------------------------------------------------------------
    // Step 3: Create organization
    // -----------------------------------------------------------------------
    const createOrgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name: "Alice Learning" },
    });
    expect(createOrgRes.statusCode).toBe(201);
    const orgBody = JSON.parse(createOrgRes.body) as {
      organization: { id: string; name: string };
    };
    expect(orgBody.organization.name).toBe("Alice Learning");
    const orgId = orgBody.organization.id;

    // Verify org appears in list
    const listOrgRes = await app.inject({
      method: "GET",
      url: "/v1/organizations",
      cookies: { avana_session: token },
    });
    expect(listOrgRes.statusCode).toBe(200);
    const orgListBody = JSON.parse(listOrgRes.body) as {
      items: Array<{ id: string; name: string }>;
    };
    expect(orgListBody.items.length).toBe(1);
    expect(orgListBody.items[0].id).toBe(orgId);

    // -----------------------------------------------------------------------
    // Step 4: Create course
    // -----------------------------------------------------------------------
    const createCourseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: { avana_session: token },
      payload: {
        title: "Biology 101",
        subject: "Science",
        exam_at: "2026-06-15T00:00:00Z",
      },
    });
    expect(createCourseRes.statusCode).toBe(201);
    const createCourseBody = JSON.parse(createCourseRes.body) as {
      course: { id: string; title: string; subject: string; archived: boolean };
    };
    expect(createCourseBody.course.title).toBe("Biology 101");
    expect(createCourseBody.course.subject).toBe("Science");
    expect(createCourseBody.course.archived).toBe(false);
    const courseId = createCourseBody.course.id;

    // -----------------------------------------------------------------------
    // Step 5: Read/list course
    // -----------------------------------------------------------------------
    // List courses
    const listCourseRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: { avana_session: token },
    });
    expect(listCourseRes.statusCode).toBe(200);
    const listCourseBody = JSON.parse(listCourseRes.body) as {
      items: Array<{ id: string; title: string }>;
    };
    expect(listCourseBody.items.length).toBe(1);
    expect(listCourseBody.items[0].id).toBe(courseId);

    // Get single course
    const getCourseRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}`,
      cookies: { avana_session: token },
    });
    expect(getCourseRes.statusCode).toBe(200);
    const getCourseBody = JSON.parse(getCourseRes.body) as {
      course: { id: string; title: string; subject: string };
    };
    expect(getCourseBody.course.title).toBe("Biology 101");
    expect(getCourseBody.course.subject).toBe("Science");

    // -----------------------------------------------------------------------
    // Step 6: Update course
    // -----------------------------------------------------------------------
    const updateCourseRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${orgId}/courses/${courseId}`,
      cookies: { avana_session: token },
      payload: {
        title: "Biology 102",
        subject: "Advanced Science",
        exam_at: "2026-12-01T00:00:00Z",
      },
    });
    expect(updateCourseRes.statusCode).toBe(200);
    const updateCourseBody = JSON.parse(updateCourseRes.body) as {
      course: { id: string; title: string; subject: string };
    };
    expect(updateCourseBody.course.title).toBe("Biology 102");
    expect(updateCourseBody.course.subject).toBe("Advanced Science");

    // -----------------------------------------------------------------------
    // Step 7: Archive course
    // -----------------------------------------------------------------------
    const archiveCourseRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${orgId}/courses/${courseId}`,
      cookies: { avana_session: token },
    });
    expect(archiveCourseRes.statusCode).toBe(204);

    // Verify archived course is no longer listed
    const listAfterArchiveRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: { avana_session: token },
    });
    expect(listAfterArchiveRes.statusCode).toBe(200);
    const listAfterArchiveBody = JSON.parse(listAfterArchiveRes.body) as {
      items: Array<{ id: string }>;
    };
    const archivedInList = listAfterArchiveBody.items.find(
      (c) => c.id === courseId,
    );
    expect(archivedInList).toBeUndefined();

    // -----------------------------------------------------------------------
    // Step 8: Sign out
    // -----------------------------------------------------------------------
    const signOutRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      cookies: { avana_session: token },
    });
    expect(signOutRes.statusCode).toBe(204);
    expect(signOutRes.body).toBe("");

    // -----------------------------------------------------------------------
    // Step 9: Verify subsequent authenticated request returns 401
    // -----------------------------------------------------------------------
    const meAfterSignOutRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { avana_session: token },
    });
    expect(meAfterSignOutRes.statusCode).toBe(401);
    const meAfterBody = JSON.parse(meAfterSignOutRes.body) as {
      error: { code: string; message: string };
    };
    expect(meAfterBody.error.code).toBe("unauthorized");
    expect(meAfterBody.error.message).toBe("Not signed in");

    // Verify org list also returns 401
    const orgAfterSignOutRes = await app.inject({
      method: "GET",
      url: "/v1/organizations",
      cookies: { avana_session: token },
    });
    expect(orgAfterSignOutRes.statusCode).toBe(401);

    // Verify course list also returns 401
    const courseAfterSignOutRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: { avana_session: token },
    });
    expect(courseAfterSignOutRes.statusCode).toBe(401);

    // -----------------------------------------------------------------------
    // Verify audit events were persisted during the critical path
    // -----------------------------------------------------------------------
    // Aggregate audit events are persisted by the aggregate stores (the single
    // source of truth) — exactly once each, and not duplicated via AuditService.
    const orgActions = orgStore.getAuditEvents().map((e) => e.action);
    expect(orgActions).toContain("org.created");
    expect(orgActions).toContain("membership.created");

    const courseActions = courseStore.getAuditEvents().map((e) => e.action);
    expect(courseActions).toContain("course.created");
    expect(courseActions).toContain("course.updated");
    expect(courseActions).toContain("course.archived");

    // No aggregate events should have leaked into the standalone AuditService.
    expect((await auditService.listAll()).length).toBe(0);

    await app.close();
  });

  it("rejects unauthenticated access to all protected endpoints", async () => {
    const app = await buildApp();

    // Test GET /v1/me
    const meRes = await app.inject({ method: "GET", url: "/v1/me" });
    expect(meRes.statusCode).toBe(401);
    expect(JSON.parse(meRes.body).error.code).toBe("unauthorized");

    // Test GET /v1/organizations
    const orgListRes = await app.inject({
      method: "GET",
      url: "/v1/organizations",
    });
    expect(orgListRes.statusCode).toBe(401);
    expect(JSON.parse(orgListRes.body).error.code).toBe("unauthorized");

    // Test POST /v1/organizations
    const createOrgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      payload: { name: "Test" },
    });
    expect(createOrgRes.statusCode).toBe(401);
    expect(JSON.parse(createOrgRes.body).error.code).toBe("unauthorized");

    // Test GET /v1/organizations/:id
    const getOrgRes = await app.inject({
      method: "GET",
      url: "/v1/organizations/00000000-0000-0000-0000-000000000000",
    });
    expect(getOrgRes.statusCode).toBe(401);
    expect(JSON.parse(getOrgRes.body).error.code).toBe("unauthorized");

    // Test POST /v1/organizations/:id/courses
    const createCourseRes = await app.inject({
      method: "POST",
      url: "/v1/organizations/00000000-0000-0000-0000-000000000000/courses",
      payload: { title: "Test", subject: null, exam_at: null },
    });
    expect(createCourseRes.statusCode).toBe(401);
    expect(JSON.parse(createCourseRes.body).error.code).toBe("unauthorized");

    await app.close();
  });
});
