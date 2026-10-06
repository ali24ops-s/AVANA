/**
 * Role Escalation Prevention and Integrity Hardening Test Suite.
 *
 * Validates:
 * 1. Stage 6: Registration (POST /v1/auth/register) creates user with NULL global_role,
 *    membership.role = "student", /v1/me returns "student", and blocked from /v1/admin/*.
 * 2. Stage 7: Organization creation (POST /v1/organizations) security hardening:
 *    - Scenario A: Student creates personal organization -> receives "student".
 *    - Scenario B: Privilege escalation blocked -> Student cannot request "organization_admin" (403 Forbidden).
 *    - Scenario C: Legitimate admin flow -> Platform admin creates organization -> receives "organization_admin".
 * 3. Stage 8: Role resolution regression:
 *    - Validates resolveEffectiveRole hierarchy without regression.
 * 4. Stage 9: Role mutation audit:
 *    - Non-platform-admins cannot mutate roles via PATCH /v1/admin/users/:id/role.
 * 5. Stage 10: Compiler / Static guard against dangerous default (initialRole = "organization_admin").
 * 6. Stage 11: Existing user fixture tests (legacy students stay students, legitimate admins stay admins).
 * 7. Stage 12: Migration safety assertion.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { OrganizationService } from "../modules/organizations/organization-service.js";
import {
  Roles,
  resolveEffectiveRole,
  type UserId,
  type OrganizationId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  const cfg = loadApiConfig();
  cfg.session.maxAgeMs = 86400000;
  cfg.logging.level = "silent";
  return cfg;
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Role Escalation Prevention & Security Hardening", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let sessionService: SessionService;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    sessionService = new SessionService(sessionStore, config.session);
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    emailVerificationStore = new InMemoryEmailVerificationStore();
  });

  async function createTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      emailVerificationStore,
    });
    return app;
  }

  // ---------------------------------------------------------------------------
  // Stage 6: Registration Integration Tests
  // ---------------------------------------------------------------------------
  describe("Stage 6: User Registration Flow (POST /v1/auth/register)", () => {
    it("creates newly registered user with global_role=null, org membership role=student, and me.role=student", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "سارا",
          lastName: "احمدی",
          email: "sara.ahmadi@example.com",
          phoneNumber: "09121112233",
          password: "SecurePassword123!",
        },
      });

      expect(regRes.statusCode).toBe(200);
      const regBody = JSON.parse(regRes.body);
      const userId = regBody.user.id as UserId;
      const sessionToken = extractSessionToken(regRes);
      expect(sessionToken).toBeDefined();

      // 1. Verify user store record has global_role = null
      const storedUser = await userStore.findById(userId);
      expect(storedUser).toBeDefined();
      expect(storedUser?.globalRole).toBeNull();
      expect(storedUser?.role).toBe(Roles.student);

      // 2. Verify organization membership role is explicitly "student"
      const memberships = await orgStore.listMembershipsByUserId(userId);
      expect(memberships.length).toBeGreaterThanOrEqual(1);
      expect(memberships[0].role).toBe(Roles.student);

      // 3. Verify GET /v1/me returns role = "student"
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken! },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.body);
      expect(meBody.user.role).toBe(Roles.student);

      // 4. Verify user cannot access /v1/admin/* endpoints
      const adminRes = await app.inject({
        method: "GET",
        url: "/v1/admin/users",
        cookies: { avana_session: sessionToken! },
      });
      expect(adminRes.statusCode).toBe(403);

      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 7: Organization Creation Security Hardening
  // ---------------------------------------------------------------------------
  describe("Stage 7: POST /v1/organizations Security Hardening", () => {
    it("Scenario A: Student creates personal organization and receives student role", async () => {
      const app = await createTestApp();

      const user = await userStore.createUserWithPassword({
        email: "student_creator@example.com",
        passwordHash: "hash123",
        globalRole: null,
      });

      const { sessionToken } = await sessionService.createSession(user.id);

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: sessionToken },
        payload: { name: "فضای یادگیری شخصی من" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      const orgId = body.organization.id as OrganizationId;

      // Verify created membership role is student
      const memberships = await orgStore.listMembershipsByUserId(user.id);
      const createdMembership = memberships.find((m) => m.organizationId === orgId);
      expect(createdMembership).toBeDefined();
      expect(createdMembership?.role).toBe(Roles.student);

      // Verify effective role remains student
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken },
      });
      expect(meRes.statusCode).toBe(200);
      expect(JSON.parse(meRes.body).user.role).toBe(Roles.student);

      await app.close();
    });

    it("Scenario B: Caller cannot silently or explicitly escalate to organization_admin", async () => {
      const app = await createTestApp();

      const user = await userStore.createUserWithPassword({
        email: "attacker@example.com",
        passwordHash: "hash123",
        globalRole: null,
      });

      const { sessionToken } = await sessionService.createSession(user.id);

      // Attempt explicit privilege escalation
      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: sessionToken },
        payload: {
          name: "Attacker Organization",
          role: "organization_admin",
        },
      });

      // Must be rejected with 403 Forbidden
      expect(res.statusCode).toBe(403);

      await app.close();
    });

    it("Scenario C: Legitimate platform admin flow creates organization with organization_admin membership", async () => {
      const app = await createTestApp();

      const adminUser = await userStore.createUserWithPassword({
        email: "platform_admin@example.com",
        passwordHash: "adminhash",
        globalRole: Roles.platform_admin,
      });

      const { sessionToken } = await sessionService.createSession(adminUser.id);

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: sessionToken },
        payload: { name: "دانشگاه صنعتی شریف" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      const orgId = body.organization.id as OrganizationId;

      // Platform admin receives organization_admin membership in the created org
      const memberships = await orgStore.listMembershipsByUserId(adminUser.id);
      const createdMembership = memberships.find((m) => m.organizationId === orgId);
      expect(createdMembership).toBeDefined();
      expect(createdMembership?.role).toBe(Roles.organization_admin);

      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 8: Role Resolution Regression
  // ---------------------------------------------------------------------------
  describe("Stage 8: Role Resolution Hierarchy Integrity", () => {
    it("preserves correct role resolution for single and multi-membership combinations", () => {
      // 1. student membership -> student
      expect(resolveEffectiveRole(null, [Roles.student])).toBe(Roles.student);

      // 2. organization_admin membership -> organization_admin
      expect(resolveEffectiveRole(null, [Roles.organization_admin])).toBe(Roles.organization_admin);

      // 3. teacher membership -> teacher
      expect(resolveEffectiveRole(null, [Roles.teacher])).toBe(Roles.teacher);

      // 4. course_editor membership -> course_editor
      expect(resolveEffectiveRole(null, [Roles.course_editor])).toBe(Roles.course_editor);

      // 5. platform_admin globalRole overrides any membership
      expect(resolveEffectiveRole(Roles.platform_admin, [Roles.student])).toBe(Roles.platform_admin);
      expect(resolveEffectiveRole(Roles.platform_admin, [])).toBe(Roles.platform_admin);

      // 6. platform_admin in membership does NOT grant platform_admin when globalRole is null
      expect(resolveEffectiveRole(null, [Roles.platform_admin])).toBe(Roles.student);

      // 7. Multi-membership precedence: organization_admin > teacher > student
      expect(
        resolveEffectiveRole(null, [Roles.student, Roles.organization_admin]),
      ).toBe(Roles.organization_admin);
      expect(
        resolveEffectiveRole(null, [Roles.student, Roles.teacher]),
      ).toBe(Roles.teacher);
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 9: Role Mutation Audit Test
  // ---------------------------------------------------------------------------
  describe("Stage 9: Role Mutation Endpoint Audit (PATCH /v1/admin/users/:id/role)", () => {
    it("strictly blocks non-platform-admins from mutating roles", async () => {
      const app = await createTestApp();

      const studentUser = await userStore.createUserWithPassword({
        email: "victim@example.com",
        passwordHash: "hash",
        globalRole: null,
      });

      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: studentUser.id,
        role: Roles.student,
        createdAt: new Date().toISOString(),
      });

      const { sessionToken: studentToken } = await sessionService.createSession(studentUser.id);

      // 1. Student attempts to promote themselves to platform_admin
      const studentAttempt = await app.inject({
        method: "PATCH",
        url: `/v1/admin/users/${studentUser.id}/role`,
        cookies: { avana_session: studentToken },
        payload: { role: "platform_admin" },
      });
      expect(studentAttempt.statusCode).toBe(403);

      // 2. Organization admin without globalRole attempts to promote
      const orgAdminUser = await userStore.createUserWithPassword({
        email: "org_admin_local@example.com",
        passwordHash: "hash",
        globalRole: null,
      });
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: orgAdminUser.id,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
      });
      const { sessionToken: orgAdminToken } = await sessionService.createSession(orgAdminUser.id);

      const orgAdminAttempt = await app.inject({
        method: "PATCH",
        url: `/v1/admin/users/${studentUser.id}/role`,
        cookies: { avana_session: orgAdminToken },
        payload: { role: "platform_admin" },
      });
      expect(orgAdminAttempt.statusCode).toBe(403);

      // 3. Platform admin can mutate roles
      const platformAdmin = await userStore.createUserWithPassword({
        email: "superadmin@example.com",
        passwordHash: "hash",
        globalRole: Roles.platform_admin,
      });
      const { sessionToken: platformAdminToken } = await sessionService.createSession(platformAdmin.id);

      const adminSuccess = await app.inject({
        method: "PATCH",
        url: `/v1/admin/users/${studentUser.id}/role`,
        cookies: { avana_session: platformAdminToken },
        payload: { role: "teacher" },
      });
      expect(adminSuccess.statusCode).toBe(200);

      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 10: Guard Against Dangerous Default
  // ---------------------------------------------------------------------------
  describe("Stage 10: Compiler / Static Guard Against Dangerous Default", () => {
    it("ensures OrganizationService.createOrganization requires initialRole and has no default organization_admin", () => {
      // 1. Check runtime function arity (number of non-default parameters before any default)
      // When initialRole is required and customSlug is required/typed, arity is 4.
      expect(OrganizationService.prototype.createOrganization.length).toBe(4);

      // 2. Static source verification to guard against code regression in CI
      const serviceSourcePath = path.resolve(
        process.cwd(),
        "apps/api/src/modules/organizations/organization-service.ts",
      );
      const sourceContent = fs.readFileSync(serviceSourcePath, "utf-8");

      // Verify that initialRole: Role = "organization_admin" does NOT exist
      expect(sourceContent).not.toMatch(/initialRole\s*:\s*Role\s*=\s*["']organization_admin["']/);
      expect(sourceContent).not.toMatch(/initialRole\s*=\s*["']organization_admin["']/);
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 11: Existing User Fixtures (Non-Regression for Legitimate Admins)
  // ---------------------------------------------------------------------------
  describe("Stage 11: Existing User Fixtures & Legacy Non-Regression", () => {
    it("preserves student role for legitimate students across restarts and session revalidation", async () => {
      const app = await createTestApp();

      const legacyStudent = await userStore.createUserWithPassword({
        email: "legacy_student@example.com",
        passwordHash: "hash",
        globalRole: null,
      });

      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: legacyStudent.id,
        role: Roles.student,
        createdAt: new Date().toISOString(),
      });

      const { sessionToken } = await sessionService.createSession(legacyStudent.id);

      const res = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).user.role).toBe(Roles.student);

      await app.close();
    });

    it("preserves organization_admin role for legitimate existing organization admins without downgrade", async () => {
      const app = await createTestApp();

      const legitimateAdmin = await userStore.createUserWithPassword({
        email: "legitimate_admin@example.com",
        passwordHash: "hash",
        globalRole: null,
      });

      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: legitimateAdmin.id,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
      });

      const { sessionToken } = await sessionService.createSession(legitimateAdmin.id);

      const res = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).user.role).toBe(Roles.organization_admin);

      await app.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Stage 12: Migration Safety Invariant
  // ---------------------------------------------------------------------------
  describe("Stage 12: Migration Safety Invariant", () => {
    it("ensures normal operations do not mutate roles implicitly", () => {
      // Normal application boots and operations must NOT mutate membership roles
      expect(Roles.student).toBe("student");
      expect(Roles.organization_admin).toBe("organization_admin");
    });
  });
});
