import { describe, it, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore, DrizzleAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type UserId, type OrganizationId } from "@avana/domain";
import type { DbClient } from "@avana/database/client";
import { randomUUID } from "node:crypto";

describe("Admin Role Change Regression Test Suite", () => {
  const config = loadApiConfig();
  config.session.maxAgeMs = 86400000;
  config.logging.level = "silent";

  function setupTestApp() {
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

  // Helper to create an authenticated platform_admin session
  async function createAdminSession(
    userStore: InMemoryUserStore,
    sessionService: SessionService,
  ) {
    const admin = await userStore.createUserWithPassword({
      email: `admin_${randomUUID()}@avana.test`,
      passwordHash: "hash",
      globalRole: Roles.platform_admin,
    });
    const session = await sessionService.createSession(admin.id);
    return { admin, sessionToken: session.sessionToken };
  }

  // ---------------------------------------------------------------------------
  // Test 1 — organization role (student -> teacher)
  // ---------------------------------------------------------------------------
  it("Test 1: organization role (student -> teacher) updates DB and persists in GET /v1/admin/users", async () => {
    const { app, userStore, orgStore, sessionService } = setupTestApp();
    const { sessionToken } = await createAdminSession(userStore, sessionService);

    // Create user with 1 organization membership as student
    const user = await userStore.createUserWithPassword({
      email: "student1@avana.test",
      passwordHash: "hash",
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

    // 1. Initial check: GET /v1/admin/users returns student
    const initialGet = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    expect(initialGet.statusCode).toBe(200);
    const initialData = JSON.parse(initialGet.body);
    const foundInitUser = initialData.users.find((u: { id: string }) => u.id === user.id);
    expect(foundInitUser).toBeDefined();
    expect(foundInitUser.role).toBe(Roles.student);

    // 2. PATCH role to teacher
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${user.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.teacher },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body)).toEqual({ success: true });

    // 3. Verify membership in store is actually teacher
    const memberships = await orgStore.listMembershipsByUserId(user.id);
    expect(memberships[0].role).toBe(Roles.teacher);

    // 4. GET /v1/admin/users returns role = teacher
    const getRes1 = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    expect(getRes1.statusCode).toBe(200);
    const data1 = JSON.parse(getRes1.body);
    const userAfterPatch = data1.users.find((u: { id: string }) => u.id === user.id);
    expect(userAfterPatch).toBeDefined();
    expect(userAfterPatch.role).toBe(Roles.teacher);

    // 5. Subsequent GET (simulating page refresh / query refetch) still returns teacher
    const getRes2 = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    const data2 = JSON.parse(getRes2.body);
    const userAfterRefresh = data2.users.find((u: { id: string }) => u.id === user.id);
    expect(userAfterRefresh.role).toBe(Roles.teacher);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 2 — global role (student -> platform_admin)
  // ---------------------------------------------------------------------------
  it("Test 2: global role (student -> platform_admin) sets global_role and GET returns platform_admin", async () => {
    const { app, userStore, orgStore, sessionService } = setupTestApp();
    const { sessionToken } = await createAdminSession(userStore, sessionService);

    const user = await userStore.createUserWithPassword({
      email: "promote_admin@avana.test",
      passwordHash: "hash",
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

    // 1. PATCH to platform_admin
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${user.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.platform_admin },
    });
    expect(patchRes.statusCode).toBe(200);

    // 2. Check store user record
    const updatedUser = await userStore.findById(user.id);
    expect(updatedUser?.globalRole).toBe(Roles.platform_admin);
    expect(updatedUser?.role).toBe(Roles.platform_admin);

    // 3. GET /v1/admin/users returns platform_admin
    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    const data = JSON.parse(getRes.body);
    const userInList = data.users.find((u: { id: string }) => u.id === user.id);
    expect(userInList).toBeDefined();
    expect(userInList.role).toBe(Roles.platform_admin);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 3 — global role for user with 0 organizations
  // ---------------------------------------------------------------------------
  it("Test 3: user without organization memberships can be promoted to platform_admin", async () => {
    const { app, userStore, sessionService } = setupTestApp();
    const { sessionToken } = await createAdminSession(userStore, sessionService);

    // User with 0 memberships
    const user = await userStore.createUserWithPassword({
      email: "no_org@avana.test",
      passwordHash: "hash",
    });

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${user.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.platform_admin },
    });
    expect(patchRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    const data = JSON.parse(getRes.body);
    const userInList = data.users.find((u: { id: string }) => u.id === user.id);
    expect(userInList).toBeDefined();
    expect(userInList.role).toBe(Roles.platform_admin);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 4 — multi-org user can be promoted to platform_admin without multi_org error
  // ---------------------------------------------------------------------------
  it("Test 4: multi-org user can be promoted to platform_admin without multi_org error", async () => {
    const { app, userStore, orgStore, sessionService } = setupTestApp();
    const { sessionToken } = await createAdminSession(userStore, sessionService);

    const user = await userStore.createUserWithPassword({
      email: "multi_org@avana.test",
      passwordHash: "hash",
    });
    const org1 = randomUUID() as OrganizationId;
    const org2 = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: org1,
      userId: user.id,
      role: Roles.teacher,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: org2,
      userId: user.id,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${user.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.platform_admin },
    });
    expect(patchRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    const data = JSON.parse(getRes.body);
    const userInList = data.users.find((u: { id: string }) => u.id === user.id);
    expect(userInList.role).toBe(Roles.platform_admin);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 5 — revert from global role (student -> platform_admin -> student)
  // ---------------------------------------------------------------------------
  it("Test 5: reverting role (student -> platform_admin -> student) returns student in GET /v1/admin/users", async () => {
    const { app, userStore, orgStore, sessionService } = setupTestApp();
    const { sessionToken } = await createAdminSession(userStore, sessionService);

    const user = await userStore.createUserWithPassword({
      email: "revert_user@avana.test",
      passwordHash: "hash",
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

    // 1. Promote to platform_admin
    await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${user.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.platform_admin },
    });

    // 2. Demote back to student
    const demoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${user.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.student },
    });
    expect(demoteRes.statusCode).toBe(200);

    // 3. GET /v1/admin/users returns student
    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    const data = JSON.parse(getRes.body);
    const userInList = data.users.find((u: { id: string }) => u.id === user.id);
    expect(userInList).toBeDefined();
    expect(userInList.role).toBe(Roles.student);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 6 — filter by role
  // ---------------------------------------------------------------------------
  it("Test 6: role filter finds platform_admin and excludes them from student filter", async () => {
    const { app, userStore, orgStore, sessionService } = setupTestApp();
    const { sessionToken } = await createAdminSession(userStore, sessionService);

    const studentUser = await userStore.createUserWithPassword({
      email: "regular_student@avana.test",
      passwordHash: "hash",
    });
    const adminUser = await userStore.createUserWithPassword({
      email: "promoted_admin@avana.test",
      passwordHash: "hash",
    });

    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: studentUser.id,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: adminUser.id,
      role: Roles.student, // legacy/base membership is student
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Promote adminUser to platform_admin
    await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${adminUser.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.platform_admin },
    });

    // 1. Filter ?role=platform_admin: must include adminUser
    const filterAdminRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users?role=${Roles.platform_admin}`,
      cookies: { avana_session: sessionToken },
    });
    const adminFilterData = JSON.parse(filterAdminRes.body);
    expect(adminFilterData.users.some((u: { id: string }) => u.id === adminUser.id)).toBe(true);
    expect(adminFilterData.users.some((u: { id: string }) => u.id === studentUser.id)).toBe(false);

    // 2. Filter ?role=student: must NOT include adminUser even if their membership was student
    const filterStudentRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users?role=${Roles.student}`,
      cookies: { avana_session: sessionToken },
    });
    const studentFilterData = JSON.parse(filterStudentRes.body);
    expect(studentFilterData.users.some((u: { id: string }) => u.id === studentUser.id)).toBe(true);
    expect(studentFilterData.users.some((u: { id: string }) => u.id === adminUser.id)).toBe(false);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 7 — content_worker global role
  // ---------------------------------------------------------------------------
  it("Test 7: content_worker role behaves correctly for promotion, GET, and filter", async () => {
    const { app, userStore, orgStore, sessionService } = setupTestApp();
    const { sessionToken } = await createAdminSession(userStore, sessionService);

    const workerUser = await userStore.createUserWithPassword({
      email: "worker_user@avana.test",
      passwordHash: "hash",
    });
    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: workerUser.id,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 1. PATCH to content_worker
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${workerUser.id}/role`,
      cookies: { avana_session: sessionToken },
      payload: { role: Roles.content_worker },
    });
    expect(patchRes.statusCode).toBe(200);

    // 2. GET /v1/admin/users returns content_worker
    const getRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: sessionToken },
    });
    const data = JSON.parse(getRes.body);
    const foundUser = data.users.find((u: { id: string }) => u.id === workerUser.id);
    expect(foundUser).toBeDefined();
    expect(foundUser.role).toBe(Roles.content_worker);

    // 3. Filter ?role=content_worker finds workerUser
    const filterWorkerRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users?role=${Roles.content_worker}`,
      cookies: { avana_session: sessionToken },
    });
    const workerFilterData = JSON.parse(filterWorkerRes.body);
    expect(workerFilterData.users.some((u: { id: string }) => u.id === workerUser.id)).toBe(true);

    // 4. Filter ?role=student excludes workerUser
    const filterStudentRes = await app.inject({
      method: "GET",
      url: `/v1/admin/users?role=${Roles.student}`,
      cookies: { avana_session: sessionToken },
    });
    const studentFilterData = JSON.parse(filterStudentRes.body);
    expect(studentFilterData.users.some((u: { id: string }) => u.id === workerUser.id)).toBe(false);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Test 8 — DrizzleAdminStore.listUsers role resolution unit verification
  // ---------------------------------------------------------------------------
  it("Test 8: DrizzleAdminStore.listUsers correctly passes u.globalRole to resolveEffectiveRole", async () => {
    const fakeUsers = [
      {
        id: "user-1",
        email: "admin@avana.test",
        name: "Admin User",
        globalRole: "platform_admin",
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "user-2",
        email: "teacher@avana.test",
        name: "Teacher User",
        globalRole: null,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "user-3",
        email: "student@avana.test",
        name: "Student User",
        globalRole: null,
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const fakeMemberships = [
      { userId: "user-1", role: "student" }, // Membership is student, but globalRole is platform_admin
      { userId: "user-2", role: "teacher" }, // Membership is teacher, globalRole is null
      { userId: "user-3", role: "student" }, // Membership is student, globalRole is null
    ];

    const mockDb = {
      select: (selectArg?: { count?: () => unknown; role?: unknown }) => ({
        from: (table: { _?: { name?: string } }) => ({
          where: (_whereClause: unknown) => {
            // Count query
            if (selectArg && selectArg.count) {
              return Promise.resolve([{ count: fakeUsers.length }]);
            }
            // Memberships query
            if (table?._?.name === "organization_memberships" || (selectArg && selectArg.role)) {
              return Promise.resolve(fakeMemberships);
            }
            // Users base query with limit/offset/orderBy
            return {
              limit: (_limit: number) => ({
                offset: (_offset: number) => ({
                  orderBy: () => Promise.resolve(fakeUsers),
                }),
              }),
            };
          },
        }),
      }),
    } as unknown as DbClient;

    const drizzleAdminStore = new DrizzleAdminStore(mockDb);
    const listResult = await drizzleAdminStore.listUsers({ page: 1, pageSize: 20 });

    expect(listResult.totalCount).toBe(3);
    const u1 = listResult.users.find((u) => u.id === "user-1");
    const u2 = listResult.users.find((u) => u.id === "user-2");
    const u3 = listResult.users.find((u) => u.id === "user-3");

    // CRITICAL: user-1 must be platform_admin, NOT student!
    expect(u1?.role).toBe("platform_admin");
    // CRITICAL: user-2 must be teacher, NOT student!
    expect(u2?.role).toBe("teacher");
    // user-3 is student
    expect(u3?.role).toBe("student");
  });
});
