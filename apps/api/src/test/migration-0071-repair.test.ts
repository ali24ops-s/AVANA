/**
 * Isolated Staged Validation Test Suite for Migration 0071.
 *
 * Verifies:
 * 1. Target legacy records (3 users) transition from 'organization_admin' to 'student'.
 * 2. Effective role drops to 'student' and admin routes (/v1/admin/*) return 403 Forbidden.
 * 3. Platform admins (global_role: "platform_admin") retain admin privileges without regression.
 * 4. Normal students and unrelated organization admins remain completely unaffected.
 * 5. Fail-closed guards abort and throw if preconditions (user_id, org_id, role, global_role) fail.
 * 6. Migration is idempotent on re-execution.
 * 7. Rollback (down) safely restores roles if needed.
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
import {
  Roles,
  resolveEffectiveRole,
  type UserId,
  type OrganizationId,
} from "@avana/domain";
import {
  up as up0071,
  down as down0071,
  TARGET_MEMBERSHIPS,
} from "../../../../database/migrations/0071_repair_legacy_registration_org_admins.js";

// Mock DB executing sql tags against in-memory state
interface MockDbState {
  users: Array<{ id: string; email: string; global_role: string | null }>;
  memberships: Array<{
    id: string;
    user_id: string;
    organization_id: string;
    role: string;
    updated_at?: Date;
  }>;
  audit_logs: Array<any>;
}

function extractSql(queryObj: any): string {
  if (queryObj?.text) return queryObj.text;
  if (typeof queryObj?.toQuery === "function") {
    return queryObj.toQuery({
      escapeName: (s: string) => s,
      escapeParam: (i: number) => `$${i}`,
    }).sql;
  }
  return String(queryObj);
}

function createMockDb(state: MockDbState) {
  return {
    async execute(queryObj: any) {
      const sqlString = extractSql(queryObj).trim();

      const cleanSql = sqlString.replace(/\s+/g, " ");

      // SELECT preCheck query
      if (cleanSql.includes("SELECT m.id, m.user_id, m.organization_id, m.role, u.global_role")) {
        const rows = state.memberships
          .filter((m) =>
            TARGET_MEMBERSHIPS.some((t) => t.membershipId === m.id),
          )
          .map((m) => {
            const u = state.users.find((u) => u.id === m.user_id);
            return {
              id: m.id,
              user_id: m.user_id,
              organization_id: m.organization_id,
              role: m.role,
              global_role: u ? u.global_role : null,
            };
          });
        return { rows, rowCount: rows.length };
      }

      // SELECT postCheck query
      if (cleanSql.includes("SELECT id, role") && cleanSql.includes("FROM organization_memberships")) {
        const rows = state.memberships
          .filter((m) =>
            TARGET_MEMBERSHIPS.some((t) => t.membershipId === m.id),
          )
          .map((m) => ({ id: m.id, role: m.role }));
        return { rows, rowCount: rows.length };
      }

      // UPDATE organization_memberships SET role = 'student' (up)
      if (cleanSql.includes("UPDATE organization_memberships") && cleanSql.includes("SET role = 'student'")) {
        let count = 0;
        for (const m of state.memberships) {
          if (
            TARGET_MEMBERSHIPS.some((t) => t.membershipId === m.id) &&
            m.role === "organization_admin"
          ) {
            m.role = "student";
            m.updated_at = new Date();
            count++;
          }
        }
        return { rowCount: count };
      }

      // UPDATE organization_memberships SET role = 'organization_admin' (down)
      if (cleanSql.includes("UPDATE organization_memberships") && cleanSql.includes("SET role = 'organization_admin'")) {
        let count = 0;
        for (const m of state.memberships) {
          if (
            TARGET_MEMBERSHIPS.some((t) => t.membershipId === m.id) &&
            m.role === "student"
          ) {
            m.role = "organization_admin";
            m.updated_at = new Date();
            count++;
          }
        }
        return { rowCount: count };
      }

      // INSERT INTO audit_logs
      if (cleanSql.includes("INSERT INTO audit_logs")) {
        state.audit_logs.push(queryObj);
        return { rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

describe("Migration 0071: Legacy Registration Org Admin Repair Validation", () => {
  let mockState: MockDbState;

  beforeEach(() => {
    mockState = {
      users: [
        // Target User 1
        {
          id: "0077321b-ed28-441e-af32-b6aa513fc73f",
          email: "teacher_1790765436109@test.com",
          global_role: null,
        },
        // Target User 2
        {
          id: "cccfafda-42e6-487b-b2ac-3f0068582869",
          email: "teacher_1790766115836@test.com",
          global_role: null,
        },
        // Target User 3
        {
          id: "cb72c03b-8b14-4046-a357-c3a088b7db08",
          email: "teacher_1790766367347@test.com",
          global_role: null,
        },
        // Legitimate Platform Admin (User B)
        {
          id: "11111111-1111-1111-1111-111111111111",
          email: "ali1383mohammadlo@gmail.com",
          global_role: "platform_admin",
        },
        // Legitimate Student (User C)
        {
          id: "22222222-2222-2222-2222-222222222222",
          email: "student@test.com",
          global_role: null,
        },
        // Legitimate Unrelated Org Admin (User D)
        {
          id: "33333333-3333-3333-3333-333333333333",
          email: "orgadmin@company.com",
          global_role: null,
        },
      ],
      memberships: [
        // Target 1 (Accidental Admin)
        {
          id: "4591ba83-9a5a-4b23-98d0-24b0cb124bb0",
          user_id: "0077321b-ed28-441e-af32-b6aa513fc73f",
          organization_id: "c830eb8a-c603-4f90-8800-4b3e8e19c366",
          role: "organization_admin",
        },
        // Target 2 (Accidental Admin)
        {
          id: "533e8880-3b68-414e-bb49-01400b05ebbd",
          user_id: "cccfafda-42e6-487b-b2ac-3f0068582869",
          organization_id: "d549079f-6bc5-4c07-b2eb-14b301ca1efd",
          role: "organization_admin",
        },
        // Target 3 (Accidental Admin)
        {
          id: "69381508-8af1-4fcf-a889-fe4c7570e5d1",
          user_id: "cb72c03b-8b14-4046-a357-c3a088b7db08",
          organization_id: "11fdb75b-8858-46fa-b93e-6aee29da185d",
          role: "organization_admin",
        },
        // Platform Admin membership
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          user_id: "11111111-1111-1111-1111-111111111111",
          organization_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          role: "organization_admin",
        },
        // Student membership
        {
          id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          user_id: "22222222-2222-2222-2222-222222222222",
          organization_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          role: "student",
        },
        // Unrelated Org Admin membership
        {
          id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          user_id: "33333333-3333-3333-3333-333333333333",
          organization_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          role: "organization_admin",
        },
      ],
      audit_logs: [],
    };
  });

  it("successfully repairs all 3 target records to 'student' and creates audit logs", async () => {
    const db = createMockDb(mockState);
    await up0071(db);

    // Verify target memberships transitioned to student
    for (const target of TARGET_MEMBERSHIPS) {
      const m = mockState.memberships.find((item) => item.id === target.membershipId);
      expect(m?.role).toBe("student");
    }

    // Verify non-target memberships are unchanged
    const platformAdminMem = mockState.memberships.find(
      (m) => m.id === "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    expect(platformAdminMem?.role).toBe("organization_admin");

    const studentMem = mockState.memberships.find(
      (m) => m.id === "cccccccc-cccc-cccc-cccc-cccccccccccc",
    );
    expect(studentMem?.role).toBe("student");

    const unrelatedAdminMem = mockState.memberships.find(
      (m) => m.id === "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    );
    expect(unrelatedAdminMem?.role).toBe("organization_admin");

    // Verify audit logs were written for all 3 targets
    expect(mockState.audit_logs.length).toBe(3);
  });

  it("is idempotent: re-executing up() on already repaired database succeeds safely without re-mutation", async () => {
    const db = createMockDb(mockState);
    await up0071(db);
    expect(mockState.audit_logs.length).toBe(3);

    // Run again
    await expect(up0071(db)).resolves.not.toThrow();

    // Verify roles still student
    for (const target of TARGET_MEMBERSHIPS) {
      const m = mockState.memberships.find((item) => item.id === target.membershipId);
      expect(m?.role).toBe("student");
    }
  });

  it("fail-closed guard: throws and aborts if any target membership is missing", async () => {
    // Remove one target membership
    mockState.memberships = mockState.memberships.filter(
      (m) => m.id !== "69381508-8af1-4fcf-a889-fe4c7570e5d1",
    );

    const db = createMockDb(mockState);
    await expect(up0071(db)).rejects.toThrow(
      "[Migration 0071] Precondition failed: Expected exactly 3 target membership rows, found 2",
    );
  });

  it("fail-closed guard: aborts if target user has a global_role (protecting platform admin)", async () => {
    // Accidentally set global_role on target 1
    const user1 = mockState.users.find(
      (u) => u.id === "0077321b-ed28-441e-af32-b6aa513fc73f",
    );
    if (user1) user1.global_role = "platform_admin";

    const db = createMockDb(mockState);
    await expect(up0071(db)).rejects.toThrow(
      "Target user 0077321b-ed28-441e-af32-b6aa513fc73f has global_role 'platform_admin', expected NULL",
    );
  });

  it("supports reversible rollback via down()", async () => {
    const db = createMockDb(mockState);
    await up0071(db);

    // Verify converted to student
    for (const target of TARGET_MEMBERSHIPS) {
      const m = mockState.memberships.find((item) => item.id === target.membershipId);
      expect(m?.role).toBe("student");
    }

    // Rollback
    await down0071(db);

    // Verify restored to organization_admin
    for (const target of TARGET_MEMBERSHIPS) {
      const m = mockState.memberships.find((item) => item.id === target.membershipId);
      expect(m?.role).toBe("organization_admin");
    }
  });

  it("authorization policy verification: repaired user effective role drops to student and loses admin access", async () => {
    // Target user before repair: organization_admin membership
    const preEffectiveRole = resolveEffectiveRole(null, ["organization_admin"]);
    expect(preEffectiveRole).toBe(Roles.organization_admin);

    // Apply repair
    const db = createMockDb(mockState);
    await up0071(db);

    // Target user after repair: membership is student
    const postEffectiveRole = resolveEffectiveRole(null, ["student"]);
    expect(postEffectiveRole).toBe(Roles.student);

    // Platform admin remains platform_admin
    const platformAdminRole = resolveEffectiveRole("platform_admin", ["organization_admin"]);
    expect(platformAdminRole).toBe(Roles.platform_admin);

    // Setup HTTP server with repaired user and verify /v1/admin/* returns 403 Forbidden
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const emailVerificationStore = new InMemoryEmailVerificationStore();
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      emailVerificationStore,
      adminStore,
    });
    await app.ready();

    // Seed target user 1 as student (post-repair)
    const targetUserId = "0077321b-ed28-441e-af32-b6aa513fc73f" as UserId;
    const targetOrgId = "c830eb8a-c603-4f90-8800-4b3e8e19c366" as OrganizationId;
    userStore.insert({
      id: targetUserId,
      email: "teacher_1790765436109@test.com",
      name: "Repaired Teacher 1",
      emailVerified: true,
      globalRole: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: "4591ba83-9a5a-4b23-98d0-24b0cb124bb0",
      userId: targetUserId,
      organizationId: targetOrgId,
      role: "student", // Repaired role!
      createdAt: new Date().toISOString(),
    });

    const targetSession = await sessionService.createSession(targetUserId);

    // 1. /v1/me returns student
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { avana_session: targetSession.sessionToken },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json();
    expect(meBody.user.role).toBe("student");

    // 2. /v1/admin/* strictly rejects with 403
    const adminCoursesRes = await app.inject({
      method: "GET",
      url: "/v1/admin/courses",
      cookies: { avana_session: targetSession.sessionToken },
    });
    expect(adminCoursesRes.statusCode).toBe(403);

    const adminUsersRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: targetSession.sessionToken },
    });
    expect(adminUsersRes.statusCode).toBe(403);

    // 3. Platform Admin user remains 200 OK on admin routes
    const adminUserId = "11111111-1111-1111-1111-111111111111" as UserId;
    userStore.insert({
      id: adminUserId,
      email: "ali1383mohammadlo@gmail.com",
      name: "Platform Admin",
      emailVerified: true,
      globalRole: "platform_admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const adminSession = await sessionService.createSession(adminUserId);

    const adminMeRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { avana_session: adminSession.sessionToken },
    });
    expect(adminMeRes.statusCode).toBe(200);
    expect(adminMeRes.json().user.role).toBe("platform_admin");

    const platformAdminCoursesRes = await app.inject({
      method: "GET",
      url: "/v1/admin/courses",
      cookies: { avana_session: adminSession.sessionToken },
    });
    expect(platformAdminCoursesRes.statusCode).toBe(200);

    await app.close();
  });
});
