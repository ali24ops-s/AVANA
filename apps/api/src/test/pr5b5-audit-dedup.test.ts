/**
 * PR5-B5 Integration tests: Single audit persistence per event.
 *
 * Verifies that aggregate audit events (organization/course mutations) are
 * persisted exactly ONCE, via the aggregate store, and are NOT also emitted
 * through AuditService (which previously caused duplicate audit records).
 *
 * Regression coverage:
 * - Creating an organization writes exactly 2 audit events (org.created,
 *   membership.created), once each.
 * - Creating a course writes exactly 1 audit event (course.created), once.
 * - Updating a course writes exactly 1 audit event (course.updated), once.
 * - Archiving a course writes exactly 1 audit event (course.archived), once.
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

describe("PR5-B5: Single audit persistence per event", () => {
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
    };
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
    const body = JSON.parse(res.body) as { organization: { id: string } };
    return body.organization;
  }

  it("writes each organization audit event exactly once via the store", async () => {
    const app = await buildApp();
    const { token } = await signIn(app, "dedup-org@example.com");

    await createOrg(app, token, "Dedup Org");

    // The aggregate store is the single source of persistence.
    const orgEvents = orgStore.getAuditEvents();
    const actions = orgEvents.map((e) => e.action);
    expect(actions).toEqual(["org.created", "membership.created"]);

    // No leftover writes on the AuditService side for these aggregate events.
    const auditSideActions = (await auditService.listAll()).map(
      (e) => e.action,
    );
    expect(auditSideActions).not.toContain("org.created");
    expect(auditSideActions).not.toContain("membership.created");

    await app.close();
  });

  it("writes each course audit event exactly once via the store", async () => {
    const app = await buildApp();
    const { token, userId } = await signIn(app, "dedup-course@example.com");
    const org = await createOrg(app, token, "Dedup Course Org");

    // Promote to org_admin so update/archive are permitted.
    orgStore.setMembershipRole(
      org.id as never,
      userId as never,
      "organization_admin",
    );

    // Create
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${org.id}/courses`,
      cookies: { avana_session: token },
      payload: { title: "Dedup Course", subject: null, exam_at: null },
    });
    expect(createRes.statusCode).toBe(201);
    const created = JSON.parse(createRes.body) as { course: { id: string } };
    const courseId = created.course.id;

    // Update
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${org.id}/courses/${courseId}`,
      cookies: { avana_session: token },
      payload: { title: "Dedup Course Updated" },
    });
    expect(updateRes.statusCode).toBe(200);

    // Archive
    const archiveRes = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${org.id}/courses/${courseId}`,
      cookies: { avana_session: token },
    });
    expect(archiveRes.statusCode).toBe(204);

    // The aggregate store is the single source of persistence. Each distinct
    // course event appears exactly once (no duplicates).
    const courseEvents = courseStore.getAuditEvents();
    const actions = courseEvents.map((e) => e.action);
    expect(actions.filter((a) => a === "course.created")).toHaveLength(1);
    expect(actions.filter((a) => a === "course.updated")).toHaveLength(1);
    expect(actions.filter((a) => a === "course.archived")).toHaveLength(1);

    // No leftover course writes on the AuditService side.
    const auditSideActions = (await auditService.listAll()).map(
      (e) => e.action,
    );
    expect(auditSideActions).not.toContain("course.created");
    expect(auditSideActions).not.toContain("course.updated");
    expect(auditSideActions).not.toContain("course.archived");

    await app.close();
  });
});
