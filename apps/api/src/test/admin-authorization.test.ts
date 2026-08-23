import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Authorization & Role Resolution", () => {
  test("Denies access to non-admin roles and allows access to platform_admin across endpoints", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();

    const sessionService = new SessionService(sessionStore, config.session);

    // Helper to create a user with a specific role in an organization
    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    // 1. Create users with each role
    const student = await createUserWithRole("student@test.com", Roles.student);
    const teacher = await createUserWithRole("teacher@test.com", Roles.teacher);
    const editor = await createUserWithRole("editor@test.com", Roles.course_editor);
    const orgAdmin = await createUserWithRole("orgadmin@test.com", Roles.organization_admin);
    const support = await createUserWithRole("support@test.com", Roles.support_agent);
    const platformAdmin = await createUserWithRole("platformadmin@test.com", Roles.platform_admin);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
    });

    const endpoints = [
      "/v1/admin/dashboard",
      "/v1/admin/users",
      "/v1/admin/courses",
      "/v1/admin/documents",
      "/v1/admin/content/lessons",
      "/v1/admin/content/flashcards",
      "/v1/admin/content/exams",
      "/v1/admin/documents/doc-123",
      "/v1/admin/generation",
      "/v1/admin/generation/providers",
      "/v1/admin/generation/prompts",
      "/v1/admin/generation/job-123",
      "/v1/admin/system/health",
      "/v1/admin/system/integrity",
      "/v1/admin/system/logs",
      "/v1/admin/system/audit",
      "/v1/admin/analytics",
      "/v1/admin/analytics/ai",
      "/v1/admin/settings",
      "/v1/admin/settings/features",
    ];

    const mutationEndpoints = [
      { method: "PATCH", url: "/v1/admin/users/user-123/role", payload: { role: "teacher" } },
      { method: "PATCH", url: "/v1/admin/courses/course-123", payload: { name: "test" } },
      { method: "POST", url: "/v1/admin/documents/doc-123/retry", payload: {} },
      { method: "POST", url: "/v1/admin/generation/job-123/retry", payload: {} },
    ];

    // 1. Verify 401 for unauthenticated requests on GET and mutation endpoints
    const unauthGet = await app.inject({ method: "GET", url: "/v1/admin/dashboard" });
    expect(unauthGet.statusCode).toBe(401);

    for (const ep of mutationEndpoints) {
      const resp = await app.inject({
        method: ep.method as any,
        url: ep.url,
        payload: ep.payload,
      });
      expect(resp.statusCode, `Expected 401 for unauthenticated on ${ep.method} ${ep.url}`).toBe(401);
    }

    // 2. Verify 403 for non-platform_admin roles on /v1/admin/dashboard
    const nonAdminTokens = [
      { name: "student", token: student.sessionToken },
      { name: "teacher", token: teacher.sessionToken },
      { name: "course_editor", token: editor.sessionToken },
      { name: "organization_admin", token: orgAdmin.sessionToken },
      { name: "support_agent", token: support.sessionToken },
    ];

    for (const { name, token } of nonAdminTokens) {
      const resp = await app.inject({
        method: "GET",
        url: "/v1/admin/dashboard",
        cookies: { avana_session: token },
      });
      expect(resp.statusCode, `Expected 403 for ${name} on /v1/admin/dashboard`).toBe(403);
    }

    // 3. Verify 403 for student across ALL admin endpoints
    for (const ep of endpoints) {
      const resp = await app.inject({
        method: "GET",
        url: ep,
        cookies: { avana_session: student.sessionToken },
      });
      expect(resp.statusCode, `Expected 403 for student on ${ep}`).toBe(403);
    }

    for (const ep of mutationEndpoints) {
      const resp = await app.inject({
        method: ep.method as any,
        url: ep.url,
        payload: ep.payload,
        cookies: { avana_session: student.sessionToken },
      });
      expect(resp.statusCode, `Expected 403 for student on ${ep.method} ${ep.url}`).toBe(403);
    }

    // 4. Verify 200/404 for platform_admin on all GET endpoints
    for (const ep of endpoints) {
      const resp = await app.inject({
        method: "GET",
        url: ep,
        cookies: { avana_session: platformAdmin.sessionToken },
      });
      expect([200, 404].includes(resp.statusCode), `Expected 200/404 for platform_admin on ${ep}, got ${resp.statusCode}`).toBe(true);
    }

    // 5. Verify input validation for platform_admin mutations
    const invalidRoleRes = await app.inject({
      method: "PATCH",
      url: "/v1/admin/users/user-123/role",
      payload: { role: "superman" },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(invalidRoleRes.statusCode).toBe(400);

    const invalidCourseRes = await app.inject({
      method: "PATCH",
      url: "/v1/admin/courses/course-123",
      payload: { invalidField: "test" },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(invalidCourseRes.statusCode).toBe(400);

    // 6. Multi-membership resolution test:
    // Case A: User is "student" in Org 1, and "platform_admin" in Org 2 -> effective role is platform_admin -> ALLOW (200)
    const multiAdmin = await userStore.createUserWithPassword({ email: "multiadmin@test.com", passwordHash: "x" });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: randomUUID() as OrganizationId,
      userId: multiAdmin.id as UserId,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: randomUUID() as OrganizationId,
      userId: multiAdmin.id as UserId,
      role: Roles.platform_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const multiAdminSession = await sessionService.createSession(multiAdmin.id);

    const multiAdminRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: multiAdminSession.sessionToken },
    });
    expect(multiAdminRes.statusCode).toBe(200);

    // Case B: User is "teacher" in Org 1, and "organization_admin" in Org 2 -> effective role is organization_admin -> DENY (403)
    const multiTeacher = await userStore.createUserWithPassword({ email: "multiteacher@test.com", passwordHash: "x" });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: randomUUID() as OrganizationId,
      userId: multiTeacher.id as UserId,
      role: Roles.teacher,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: randomUUID() as OrganizationId,
      userId: multiTeacher.id as UserId,
      role: Roles.organization_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const multiTeacherSession = await sessionService.createSession(multiTeacher.id);

    const multiTeacherRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: multiTeacherSession.sessionToken },
    });
    expect(multiTeacherRes.statusCode).toBe(403);

    await app.close();
  });
});
