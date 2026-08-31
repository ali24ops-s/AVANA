import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore, DrizzleAdminStore } from "../modules/admin/index.js";
import { DrizzleUserStore } from "../modules/identity/drizzle-stores.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { createDbClient } from "@avana/database/client";
import { users, auditLogs } from "@avana/database/schema";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

describe("Platform Role Architecture & Decoupling Test Suite", () => {
  const config = loadApiConfig();
  config.session.maxAgeMs = 86400000;
  config.logging.level = "silent";

  function setupInMemoryApp() {
    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    const app = createApp({ config });
    app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
    });

    return { app, sessionStore, orgStore, userStore, adminStore, sessionService };
  }

  // =========================================================================
  // CORE MATRIX TESTS: Tests A, B, C, D
  // =========================================================================
  it("Test A: global_role = null, membership.role = 'platform_admin' -> effectiveRole is NOT platform_admin", async () => {
    const { userStore, orgStore } = setupInMemoryApp();

    const user = await userStore.createUserWithPassword({
      email: "testA@avana.test",
      passwordHash: "hash",
      globalRole: null,
    });
    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: user.id,
      role: "platform_admin" as Role, // Simulate legacy rogue membership
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const userRecord = await userStore.findById(user.id);
    expect(userRecord?.globalRole).toBeNull();
    // Must NOT be platform_admin!
    expect(userRecord?.role).not.toBe("platform_admin");
    expect(userRecord?.role).toBe("student");
  });

  it("Test B: global_role = 'platform_admin', membership.role = 'student' -> effectiveRole === 'platform_admin'", async () => {
    const { userStore, orgStore } = setupInMemoryApp();

    const user = await userStore.createUserWithPassword({
      email: "testB@avana.test",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });
    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: user.id,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const userRecord = await userStore.findById(user.id);
    expect(userRecord?.globalRole).toBe("platform_admin");
    expect(userRecord?.role).toBe("platform_admin");
  });

  it("Test C: global_role = 'platform_admin', no memberships -> effectiveRole === 'platform_admin'", async () => {
    const { userStore } = setupInMemoryApp();

    const user = await userStore.createUserWithPassword({
      email: "testC@avana.test",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });

    const userRecord = await userStore.findById(user.id);
    expect(userRecord?.globalRole).toBe("platform_admin");
    expect(userRecord?.role).toBe("platform_admin");
  });

  it("Test D: global_role = null, no memberships -> effectiveRole === 'student'", async () => {
    const { userStore } = setupInMemoryApp();

    const user = await userStore.createUserWithPassword({
      email: "testD@avana.test",
      passwordHash: "hash",
      globalRole: null,
    });

    const userRecord = await userStore.findById(user.id);
    expect(userRecord?.globalRole).toBeNull();
    expect(userRecord?.role).toBe("student");
  });

  it("Test F: platform_admin without Organization can access Admin APIs", async () => {
    const { app, userStore, sessionService } = setupInMemoryApp();

    const admin = await userStore.createUserWithPassword({
      email: "adminF@avana.test",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });
    const adminSession = await sessionService.createSession(admin.id);

    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: adminSession.sessionToken },
    });
    expect(res.statusCode).toBe(200);

    await app.close();
  });

  // =========================================================================
  // SCENARIO 1: Promotion and Demotion for User with ZERO Organizations
  // =========================================================================
  it("Case 1: platform_admin can promote and demote a user with 0 organization memberships", async () => {
    const { app, userStore, sessionService } = setupInMemoryApp();

    // 1. Create a platform_admin
    const admin = await userStore.createUserWithPassword({
      email: "superadmin@avana.test",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });
    const adminSession = await sessionService.createSession(admin.id);

    // 2. Create a user with 0 org memberships
    const zeroOrgUser = await userStore.createUserWithPassword({
      email: "loner@avana.test",
      passwordHash: "hash",
    });
    expect(zeroOrgUser.globalRole).toBeNull();
    expect(zeroOrgUser.role).toBe("student"); // fallback

    // 3. Promote zeroOrgUser to platform_admin
    const promoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${zeroOrgUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "platform_admin" },
    });
    expect(promoteRes.statusCode).toBe(200);

    const updatedUser1 = await userStore.findById(zeroOrgUser.id);
    expect(updatedUser1?.globalRole).toBe("platform_admin");
    expect(updatedUser1?.role).toBe("platform_admin");

    // 4. Demote zeroOrgUser back to student
    const demoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${zeroOrgUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "student" },
    });
    expect(demoteRes.statusCode).toBe(200);

    const updatedUser2 = await userStore.findById(zeroOrgUser.id);
    expect(updatedUser2?.globalRole).toBeNull(); // Never stored as 'student' in globalRole
    expect(updatedUser2?.role).toBe("student"); // Fallback resolution

    await app.close();
  });

  // =========================================================================
  // SCENARIO 2: Promotion and Demotion for User with ONE Organization
  // =========================================================================
  it("Case 2: platform_admin can manage role of user with 1 organization membership", async () => {
    const { app, userStore, orgStore, sessionService } = setupInMemoryApp();

    const admin = await userStore.createUserWithPassword({
      email: "admin2@avana.test",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });
    const adminSession = await sessionService.createSession(admin.id);

    const singleOrgUser = await userStore.createUserWithPassword({
      email: "singleorg@avana.test",
      passwordHash: "hash",
    });
    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: singleOrgUser.id,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. Promote to platform_admin: membership preserved
    const promoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${singleOrgUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "platform_admin" },
    });
    expect(promoteRes.statusCode).toBe(200);

    const userPromoted = await userStore.findById(singleOrgUser.id);
    expect(userPromoted?.globalRole).toBe("platform_admin");
    expect(userPromoted?.role).toBe("platform_admin");

    const memsAfterPromote = await orgStore.listMembershipsByUserId(singleOrgUser.id);
    expect(memsAfterPromote.length).toBe(1);
    expect(memsAfterPromote[0].role).toBe("student"); // Org membership untouched

    // 2. Demote to teacher: single membership updated, globalRole cleared
    const demoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${singleOrgUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "teacher" },
    });
    expect(demoteRes.statusCode).toBe(200);

    const userDemoted = await userStore.findById(singleOrgUser.id);
    expect(userDemoted?.globalRole).toBeNull();
    expect(userDemoted?.role).toBe("teacher");

    const memsAfterDemote = await orgStore.listMembershipsByUserId(singleOrgUser.id);
    expect(memsAfterDemote[0].role).toBe("teacher");

    await app.close();
  });

  // =========================================================================
  // SCENARIO 3: Promotion and Demotion for User with MULTIPLE Organizations
  // =========================================================================
  it("Case 3: platform_admin can manage role of user with multiple organizations without multi_org error", async () => {
    const { app, userStore, orgStore, sessionService } = setupInMemoryApp();

    const admin = await userStore.createUserWithPassword({
      email: "admin3@avana.test",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });
    const adminSession = await sessionService.createSession(admin.id);

    const multiOrgUser = await userStore.createUserWithPassword({
      email: "multiorg@avana.test",
      passwordHash: "hash",
    });

    const org1 = randomUUID() as OrganizationId;
    const org2 = randomUUID() as OrganizationId;

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: org1,
      userId: multiOrgUser.id,
      role: Roles.teacher,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: org2,
      userId: multiOrgUser.id,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. Promote multi-org user to platform_admin
    const promoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${multiOrgUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "platform_admin" },
    });
    expect(promoteRes.statusCode).toBe(200);

    const userPromoted = await userStore.findById(multiOrgUser.id);
    expect(userPromoted?.globalRole).toBe("platform_admin");
    expect(userPromoted?.role).toBe("platform_admin");

    // Memberships preserved
    const mems1 = await orgStore.listMembershipsByUserId(multiOrgUser.id);
    expect(mems1.length).toBe(2);
    expect(mems1.find((m) => m.organizationId === org1)?.role).toBe("teacher");
    expect(mems1.find((m) => m.organizationId === org2)?.role).toBe("student");

    // 2. Demote multi-org user from platform_admin: clears globalRole, preserves memberships without arbitrary mutation
    const demoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${multiOrgUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "student" },
    });
    expect(demoteRes.statusCode).toBe(200);

    const userDemoted = await userStore.findById(multiOrgUser.id);
    expect(userDemoted?.globalRole).toBeNull();
    // Effective role resolves to highest org membership (teacher)
    expect(userDemoted?.role).toBe("teacher");

    const mems2 = await orgStore.listMembershipsByUserId(multiOrgUser.id);
    expect(mems2.length).toBe(2);
    expect(mems2.find((m) => m.organizationId === org1)?.role).toBe("teacher");
    expect(mems2.find((m) => m.organizationId === org2)?.role).toBe("student");

    await app.close();
  });

  // =========================================================================
  // SCENARIO 4: Active Session Behavior (Immediate authorization effect)
  // =========================================================================
  it("Immediate session effect: Role changes take effect immediately on next request under active session", async () => {
    const { app, userStore, sessionService } = setupInMemoryApp();

    const admin = await userStore.createUserWithPassword({
      email: "admin_sess@avana.test",
      passwordHash: "hash",
      globalRole: "platform_admin",
    });
    const adminSession = await sessionService.createSession(admin.id);

    const targetUser = await userStore.createUserWithPassword({
      email: "target_sess@avana.test",
      passwordHash: "hash",
    });
    const userSession = await sessionService.createSession(targetUser.id);

    // 1. Initially student -> 403 on admin dashboard
    const initRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: userSession.sessionToken },
    });
    expect(initRes.statusCode).toBe(403);

    // 2. Admin promotes targetUser to platform_admin
    const promRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${targetUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "platform_admin" },
    });
    expect(promRes.statusCode).toBe(200);

    // 3. Same user session immediately succeeds (200) without re-login!
    const afterPromRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: userSession.sessionToken },
    });
    expect(afterPromRes.statusCode).toBe(200);

    // 4. Admin demotes targetUser
    const demRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${targetUser.id}/role`,
      cookies: { avana_session: adminSession.sessionToken },
      payload: { role: "student" },
    });
    expect(demRes.statusCode).toBe(200);

    // 5. Same user session immediately denied (403)!
    const afterDemRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: userSession.sessionToken },
    });
    expect(afterDemRes.statusCode).toBe(403);

    await app.close();
  });

  // =========================================================================
  // SCENARIO 5: Security & Privilege Escalation Prevention
  // =========================================================================
  it("Strict Access Control: Non-admin roles cannot mutate roles or access admin APIs", async () => {
    const { app, userStore, orgStore, sessionService } = setupInMemoryApp();

    const student = await userStore.createUserWithPassword({ email: "s@t.com", passwordHash: "h" });
    const teacher = await userStore.createUserWithPassword({ email: "t@t.com", passwordHash: "h" });
    const orgAdmin = await userStore.createUserWithPassword({ email: "oa@t.com", passwordHash: "h" });

    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({ id: randomUUID(), organizationId: orgId, userId: teacher.id, role: Roles.teacher, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    orgStore.addMembership({ id: randomUUID(), organizationId: orgId, userId: orgAdmin.id, role: Roles.organization_admin, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    const sToken = (await sessionService.createSession(student.id)).sessionToken;
    const tToken = (await sessionService.createSession(teacher.id)).sessionToken;
    const oaToken = (await sessionService.createSession(orgAdmin.id)).sessionToken;

    for (const { name, token, id } of [
      { name: "student", token: sToken, id: student.id },
      { name: "teacher", token: tToken, id: teacher.id },
      { name: "organization_admin", token: oaToken, id: orgAdmin.id },
    ]) {
      // Attempt self-promotion -> 403
      const res1 = await app.inject({
        method: "PATCH",
        url: `/v1/admin/users/${id}/role`,
        cookies: { avana_session: token },
        payload: { role: "platform_admin" },
      });
      expect(res1.statusCode, `${name} must receive 403 on role mutation`).toBe(403);

      // Attempt to view admin dashboard -> 403
      const res2 = await app.inject({
        method: "GET",
        url: "/v1/admin/dashboard",
        cookies: { avana_session: token },
      });
      expect(res2.statusCode, `${name} must receive 403 on admin dashboard`).toBe(403);
    }

    await app.close();
  });
});

// ===========================================================================
// PostgreSQL Database Integration Tests (DrizzleAdminStore & DrizzleUserStore)
// ===========================================================================
describe("PostgreSQL Integration: Drizzle Stores with users.global_role", () => {
  const postgresUrl =
    process.env.DATABASE_URL ??
    `postgres://${"avana"}:${"avana"}@127.0.0.1:5432/avana?sslmode=disable`;

  let dbClient: ReturnType<typeof createDbClient> | undefined;
  let isConnected = false;

  beforeAll(async () => {
    try {
      dbClient = createDbClient(postgresUrl);
      const res = await dbClient.db.execute(
        sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'global_role';`
      );
      isConnected = (res.rows?.length ?? 0) > 0;
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (dbClient) {
      await dbClient.close().catch(() => {});
    }
  });

  beforeEach(async (ctx) => {
    if (!isConnected || !dbClient) {
      ctx.skip();
      return;
    }
  });

  it("DrizzleUserStore & DrizzleAdminStore: Real database promotion, demotion, and resolution", async () => {
    if (!isConnected || !dbClient) return;

    const userStore = new DrizzleUserStore(dbClient.db);
    const adminStore = new DrizzleAdminStore(dbClient.db);

    const adminId = randomUUID();
    const targetUserId = randomUUID();

    // 1. Insert admin and target user in real DB
    await dbClient.db.insert(users).values({
      id: adminId,
      email: `db_admin_${Date.now()}@avana.test`,
      name: "DB Admin",
      globalRole: "platform_admin",
    });

    await dbClient.db.insert(users).values({
      id: targetUserId,
      email: `db_user_${Date.now()}@avana.test`,
      name: "DB User",
      globalRole: null,
    });

    // Verify initial role is student fallback
    const initUser = await userStore.findById(targetUserId as UserId);
    expect(initUser?.globalRole).toBeNull();
    expect(initUser?.role).toBe("student");

    // 2. Promote to platform_admin in real PostgreSQL transaction
    await adminStore.updateUserRole(adminId, targetUserId, "platform_admin");

    const promotedUser = await userStore.findById(targetUserId as UserId);
    expect(promotedUser?.globalRole).toBe("platform_admin");
    expect(promotedUser?.role).toBe("platform_admin");

    // Verify audit log was recorded in DB
    const [auditLog] = await dbClient.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, targetUserId));
    expect(auditLog).toBeDefined();
    expect(auditLog.action).toBe("USER_ROLE_CHANGED");

    // 3. Demote user in real DB
    await adminStore.updateUserRole(adminId, targetUserId, "student");

    const demotedUser = await userStore.findById(targetUserId as UserId);
    expect(demotedUser?.globalRole).toBeNull(); // Must be NULL, never 'student'
    expect(demotedUser?.role).toBe("student");
  });
});
