/**
 * Phase 3.7.1 Module Deletion Authorization Test Suite.
 *
 * Tests the canonical module delete mutation endpoint:
 * DELETE /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId
 *
 * Uses REAL defaultPolicy.can without mocking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
  type CourseId,
  type ModuleId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import {
  InMemorySubCourseGroupStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";

describe("Phase 3.7.1: Module Deletion (DELETE) Authorization Suite", () => {
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let courseStore: InMemoryCourseStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  const systemOrgId = "99999999-9999-9999-9999-999999999999" as OrganizationId;

  function makeConfig() {
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";
    const cfg = loadApiConfig();
    cfg.systemOrganizationId = systemOrgId;
    return cfg;
  }

  async function buildTestApp(config = makeConfig()) {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      subCourseGroupStore,
      moduleStore,
      lessonStore,
      documentStore,
      auditService,
    });
    return app;
  }

  beforeEach(() => {
    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore();
    courseStore = new InMemoryCourseStore(orgStore);
    subCourseGroupStore = new InMemorySubCourseGroupStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  let phoneCounter = 3000;
  async function signIn(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    email: string,
    globalRole?: Role | null,
  ) {
    phoneCounter++;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password123",
        firstName: "Test",
        lastName: "User",
        phoneNumber: `0912000${phoneCounter}`,
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    const userId = body.user.id as UserId;
    if (globalRole) {
      const user = await userStore.findById(userId);
      if (user) {
        userStore.insert({
          ...user,
          globalRole,
          role: globalRole === "platform_admin" ? "platform_admin" : "student",
        });
      }
    }
    return {
      token: extractSessionToken(res)!,
      userId,
      email: body.user.email,
    };
  }

  async function seedOrgWithCourseAndModule(
    orgName: string,
    isOfficial = false,
    orgIdOverride?: OrganizationId,
  ) {
    const orgId = orgIdOverride ?? (randomUUID() as OrganizationId);
    const now = new Date().toISOString();

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: randomUUID() as UserId,
      role: "organization_admin",
      createdAt: now,
      updatedAt: now,
    });

    const courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: `${orgName} Course`,
        subject: "Medical Science",
        examDate: null,
        status: "published",
        isOfficial,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      subCourseGroupId: null,
      documentId: null,
      title: "Module To Delete",
      description: "Original Description",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return { orgId, courseId, moduleId };
  }

  // ---------------------------------------------------------------------------
  // 1. Allowed Roles
  // ---------------------------------------------------------------------------
  describe("Allowed Deletion Roles", () => {
    it("allows platform_admin to delete module across any organization (204 No Content)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Tenant Alpha");
      const { token: adminToken } = await signIn(app, "admin@avana.test", Roles.platform_admin);

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(204);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).not.toBeNull();
      await app.close();
    });

    it("allows organization_admin of matching org to delete module", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Org Admin Tenant");
      const { token, userId } = await signIn(app, "orgadmin@tenant.test");

      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "organization_admin",
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(204);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).not.toBeNull();
      await app.close();
    });

    it("allows course_editor of matching org to delete module", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Editor Tenant");
      const { token, userId } = await signIn(app, "editor@tenant.test");

      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "course_editor",
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(204);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).not.toBeNull();
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Denied Roles & Mutation Protection
  // ---------------------------------------------------------------------------
  describe("Denied Roles (403 / 404) & Deletion Protection", () => {
    it("denies teacher from deleting module (403 Forbidden) and prevents deletion", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Teacher Tenant");
      const { token, userId } = await signIn(app, "teacher@tenant.test");

      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "teacher",
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(403);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).toBeNull();
      await app.close();
    });

    it("denies student from deleting module (403 Forbidden) and prevents deletion", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Student Tenant");
      const { token, userId } = await signIn(app, "student@tenant.test");

      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "student",
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(403);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).toBeNull();
      await app.close();
    });

    it("denies support_agent from deleting module (403 Forbidden) and prevents deletion", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Support Tenant");
      const { token, userId } = await signIn(app, "support@tenant.test");

      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "support_agent",
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(403);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).toBeNull();
      await app.close();
    });

    it("denies content_worker on private tenant without membership (404 Non-disclosing)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Private Tenant");
      const { token } = await signIn(app, "worker@system.test", Roles.content_worker);

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(404);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).toBeNull();
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. System Resources
  // ---------------------------------------------------------------------------
  describe("System Resource Deletions", () => {
    it("allows content_worker on system official course module deletion", async () => {
      const app = await buildTestApp();
      const { courseId, moduleId } = await seedOrgWithCourseAndModule(
        "System Org",
        true,
        systemOrgId,
      );

      const { token } = await signIn(app, "worker@system.test", Roles.content_worker);

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${systemOrgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(204);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).not.toBeNull();
      await app.close();
    });

    it("allows platform_admin on system official course module deletion", async () => {
      const app = await buildTestApp();
      const { courseId, moduleId } = await seedOrgWithCourseAndModule(
        "System Org",
        true,
        systemOrgId,
      );

      const { token } = await signIn(app, "admin@system.test", Roles.platform_admin);

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${systemOrgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(204);

      const stored = await moduleStore.findById(moduleId);
      expect(stored?.deletedAt).not.toBeNull();
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Scope, Tampering & IDOR Protection
  // ---------------------------------------------------------------------------
  describe("Scope, Tampering & IDOR Protection", () => {
    it("denies deletion if moduleId belongs to a different course (404 Not Found)", async () => {
      const app = await buildTestApp();
      const { orgId, moduleId: moduleA } = await seedOrgWithCourseAndModule("Org A");
      const { courseId: courseB } = await seedOrgWithCourseAndModule("Org A Course B", false, orgId);

      const { token: adminToken } = await signIn(app, "admin@avana.test", Roles.platform_admin);

      // Target courseB but pass moduleA (which belongs to courseA)
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseB}/modules/${moduleA}`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(404);

      const stored = await moduleStore.findById(moduleA);
      expect(stored?.deletedAt).toBeNull();
      await app.close();
    });

    it("denies deletion if organizationId does not match course organization (404 Not Found)", async () => {
      const app = await buildTestApp();
      const { courseId: courseA, moduleId: moduleA } = await seedOrgWithCourseAndModule("Org A");
      const { orgId: orgB } = await seedOrgWithCourseAndModule("Org B");

      const { token: adminToken } = await signIn(app, "admin@avana.test", Roles.platform_admin);

      // URL has orgB, but target is courseA/moduleA
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgB}/courses/${courseA}/modules/${moduleA}`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(404);

      const stored = await moduleStore.findById(moduleA);
      expect(stored?.deletedAt).toBeNull();
      await app.close();
    });

    it("denies deletion on already soft-deleted module (404 Not Found)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Org A");
      const { token: adminToken } = await signIn(app, "admin@avana.test", Roles.platform_admin);

      // Soft-delete the module first
      const now = new Date().toISOString();
      const mod = await moduleStore.findById(moduleId);
      await moduleStore.update({
        ...mod!,
        deletedAt: now,
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgId}/courses/${courseId}/modules/${moduleId}`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Multi-Org Membership Scoping
  // ---------------------------------------------------------------------------
  describe("Multi-Org Membership Scoping", () => {
    it("correctly evaluates permissions across multiple memberships (course_editor in A, student in B)", async () => {
      const app = await buildTestApp();
      const { orgId: orgA, courseId: courseA, moduleId: moduleA } = await seedOrgWithCourseAndModule("Multi Org A");
      const { orgId: orgB, courseId: courseB, moduleId: moduleB } = await seedOrgWithCourseAndModule("Multi Org B");

      const { token: multiToken, userId: multiUserId } = await signIn(app, "multirole@user.test");
      const now = new Date().toISOString();

      // Member A: course_editor
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgA,
        userId: multiUserId,
        role: "course_editor",
        createdAt: now,
        updatedAt: now,
      });

      // Member B: student
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgB,
        userId: multiUserId,
        role: "student",
        createdAt: now,
        updatedAt: now,
      });

      // 1. Delete in Org A -> Allowed (204 No Content)
      const resA = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgA}/courses/${courseA}/modules/${moduleA}`,
        cookies: { avana_session: multiToken },
      });
      expect(resA.statusCode).toBe(204);
      const storedA = await moduleStore.findById(moduleA);
      expect(storedA?.deletedAt).not.toBeNull();

      // 2. Delete in Org B -> Denied (403 Forbidden)
      const resB = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${orgB}/courses/${courseB}/modules/${moduleB}`,
        cookies: { avana_session: multiToken },
      });
      expect(resB.statusCode).toBe(403);
      const storedB = await moduleStore.findById(moduleB);
      expect(storedB?.deletedAt).toBeNull();

      await app.close();
    });
  });
});
