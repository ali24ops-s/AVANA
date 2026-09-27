/**
 * Phase 3.6 Module Structure Authorization Test Suite.
 *
 * Tests the canonical module workspace structure read endpoint:
 * GET /v1/organizations/:organizationId/courses/:courseId/structure
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
  type LessonId,
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

describe("Phase 3.6: Module Structure Read Authorization Suite", () => {
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

  let phoneCounter = 1000;
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

  async function seedOrgWithCourseAndModule(orgName: string, isOfficial = false, orgIdOverride?: OrganizationId) {
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
      title: "Module 1: Cellular Pathology",
      description: "Detailed cellular pathology study",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const lessonId = randomUUID() as LessonId;
    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "Lesson 1.1: Cell Injury",
      contentType: "markdown",
      contentMarkdown: "# Secret Proprietary Lesson Content",
      sortOrder: 0,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return { orgId, courseId, moduleId, lessonId };
  }

  // ---------------------------------------------------------------------------
  // 1. Role Matrix on Tenant Course Module Structure
  // ---------------------------------------------------------------------------
  describe("Role Matrix & Tenant Isolation", () => {
    it("allows platform_admin to access module structure across any organization", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Tenant Alpha");
      const { token: adminToken } = await signIn(app,"admin@avana.test", Roles.platform_admin);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/structure`,
        cookies: { avana_session: adminToken },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.unassignedModules.length).toBe(1);
      expect(body.unassignedModules[0].id).toBe(moduleId);
      expect(body.unassignedModules[0].title).toBe("Module 1: Cellular Pathology");
      await app.close();
    });

    it("allows tenant members (student, teacher, course_editor, org_admin) to read module structure", async () => {
      const app = await buildTestApp();
      const { orgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Member Org");

      for (const role of ["student", "teacher", "course_editor", "organization_admin"] as const) {
        const { token, userId } = await signIn(app, `user-${role}@tenant.test`);
        const now = new Date().toISOString();
        orgStore.addMembership({
          id: randomUUID(),
          organizationId: orgId,
          userId,
          role,
          createdAt: now,
          updatedAt: now,
        });

        const res = await app.inject({
          method: "GET",
          url: `/v1/organizations/${orgId}/courses/${courseId}/structure`,
          cookies: { avana_session: token },
        });

        expect(res.statusCode, `Expected 200 for ${role}`).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.unassignedModules[0].id).toBe(moduleId);
      }
      await app.close();
    });

    it("denies support_agent from reading module structure (404 non-disclosing)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await seedOrgWithCourseAndModule("Support Check Org");
      const { token, userId } = await signIn(app,"agent@tenant.test");
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
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/structure`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("denies access to a user with no membership in target organization (404 non-disclosing)", async () => {
      const app = await buildTestApp();
      const { orgId, courseId } = await seedOrgWithCourseAndModule("Private Org");
      const { token } = await signIn(app,"stranger@other.test");

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/structure`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("denies access to a user with membership only in another organization", async () => {
      const app = await buildTestApp();
      const { orgId: orgA, courseId: courseA } = await seedOrgWithCourseAndModule("Org Alpha");
      const { orgId: orgB } = await seedOrgWithCourseAndModule("Org Beta");

      const { token, userId } = await signIn(app,"member-b@beta.test");
      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgB,
        userId,
        role: "student",
        createdAt: now,
        updatedAt: now,
      });

      // Try to read Org A's course structure
      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgA}/courses/${courseA}/structure`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. content_worker on System vs Tenant Module Structures
  // ---------------------------------------------------------------------------
  describe("content_worker Global Functional Role", () => {
    it("allows content_worker on System Course module structure", async () => {
      const app = await buildTestApp();
      const { courseId, moduleId } = await seedOrgWithCourseAndModule(
        "System Org",
        true,
        systemOrgId,
      );

      const { token: workerToken } = await signIn(app,"worker@system.test", Roles.content_worker);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${systemOrgId}/courses/${courseId}/structure`,
        cookies: { avana_session: workerToken },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.unassignedModules[0].id).toBe(moduleId);
      await app.close();
    });

    it("denies content_worker on Tenant Course module structure if not a member", async () => {
      const app = await buildTestApp();
      const { orgId: tenantOrgId, courseId } = await seedOrgWithCourseAndModule("Private Tenant");
      const { token: workerToken } = await signIn(app,"worker@system.test", Roles.content_worker);

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${tenantOrgId}/courses/${courseId}/structure`,
        cookies: { avana_session: workerToken },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("allows content_worker on Tenant Course module structure if holds membership in that tenant", async () => {
      const app = await buildTestApp();
      const { orgId: tenantOrgId, courseId, moduleId } = await seedOrgWithCourseAndModule("Tenant With Worker");
      const { token: workerToken, userId: workerId } = await signIn(app,"worker2@system.test", Roles.content_worker);

      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: tenantOrgId,
        userId: workerId,
        role: "course_editor",
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${tenantOrgId}/courses/${courseId}/structure`,
        cookies: { avana_session: workerToken },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.unassignedModules[0].id).toBe(moduleId);
      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-Org Membership Scoping & Tampering
  // ---------------------------------------------------------------------------
  describe("Multi-Org Membership Scoping & Anti-Tampering", () => {
    it("correctly evaluates permissions across multiple memberships and denies third org", async () => {
      const app = await buildTestApp();
      const { orgId: orgA, courseId: courseA } = await seedOrgWithCourseAndModule("Multi Org A");
      const { orgId: orgB, courseId: courseB } = await seedOrgWithCourseAndModule("Multi Org B");
      const { orgId: orgC, courseId: courseC } = await seedOrgWithCourseAndModule("Multi Org C");

      const { token: multiToken, userId: multiUserId } = await signIn(app,"multirole@user.test");
      const now = new Date().toISOString();
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgA,
        userId: multiUserId,
        role: "student",
        createdAt: now,
        updatedAt: now,
      });
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgB,
        userId: multiUserId,
        role: "course_editor",
        createdAt: now,
        updatedAt: now,
      });

      // Course A -> 200 OK
      const resA = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgA}/courses/${courseA}/structure`,
        cookies: { avana_session: multiToken },
      });
      expect(resA.statusCode).toBe(200);

      // Course B -> 200 OK
      const resB = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgB}/courses/${courseB}/structure`,
        cookies: { avana_session: multiToken },
      });
      expect(resB.statusCode).toBe(200);

      // Course C -> 404 Not Found
      const resC = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgC}/courses/${courseC}/structure`,
        cookies: { avana_session: multiToken },
      });
      expect(resC.statusCode).toBe(404);

      // Client Tampering: URL has orgB, but target is courseC (which belongs to orgC)
      const resTamper = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgB}/courses/${courseC}/structure`,
        cookies: { avana_session: multiToken },
      });
      expect(resTamper.statusCode).toBe(404);

      await app.close();
    });

    it("returns 404 for non-existent course without leaking data", async () => {
      const app = await buildTestApp();
      const fakeCourseId = "00000000-0000-0000-0000-000000000000" as CourseId;
      const fakeOrgId = "11111111-1111-1111-1111-111111111111" as OrganizationId;
      const { token } = await signIn(app,"anyone@test.test");

      const res = await app.inject({
        method: "GET",
        url: `/v1/organizations/${fakeOrgId}/courses/${fakeCourseId}/structure`,
        cookies: { avana_session: token },
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
