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
import { Roles } from "@avana/domain";
import type { DbClient } from "@avana/database/client";
import { randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

describe("Admin Users Verification Status & Filtering Test Suite", () => {
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

  async function createAdminSession(
    userStore: InMemoryUserStore,
    sessionService: SessionService,
  ) {
    const admin = await userStore.createUserWithPassword({
      email: `admin_${randomUUID()}@avana.test`,
      passwordHash: "hash",
      globalRole: Roles.platform_admin,
    });
    // Set admin as verified
    await userStore.setEmailVerified(admin.id);
    const session = await sessionService.createSession(admin.id);
    return { admin, sessionToken: session.sessionToken };
  }

  describe("Part 1: 4-Quadrant Verification Matrix on InMemoryAdminStore and API", () => {
    it("handles all 4 verification quadrants and filters correctly via GET /v1/admin/users", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken } = await createAdminSession(userStore, sessionService);

      // Quadrant 1: Email verified ONLY, phone NOT verified
      const userEmailOnly = await userStore.createUserWithPassword({
        email: "user_email_only@avana.test",
        passwordHash: "hash",
        name: "User Email Only",
        phoneNumber: "09121111111",
      });
      await userStore.setEmailVerified(userEmailOnly.id);

      // Quadrant 2: Phone verified ONLY, email NOT verified
      const userPhoneOnly = await userStore.createUserWithPassword({
        email: "user_phone_only@avana.test",
        passwordHash: "hash",
        name: "User Phone Only",
        phoneNumber: "09122222222",
      });
      await userStore.setPhoneVerified(userPhoneOnly.id);

      // Quadrant 3: BOTH email and phone verified
      const userBoth = await userStore.createUserWithPassword({
        email: "user_both@avana.test",
        passwordHash: "hash",
        name: "User Both Verified",
        phoneNumber: "09123333333",
      });
      await userStore.setEmailVerified(userBoth.id);
      await userStore.setPhoneVerified(userBoth.id);

      // Quadrant 4: NEITHER verified
      const userNeither = await userStore.createUserWithPassword({
        email: "user_neither@avana.test",
        passwordHash: "hash",
        name: "User Neither Verified",
        phoneNumber: "09124444444",
      });

      // 1. Fetch with status="all" (or no status filter)
      const resAll = await app.inject({
        method: "GET",
        url: "/v1/admin/users",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resAll.statusCode).toBe(200);
      const dataAll = JSON.parse(resAll.payload);
      // We have admin + 4 test users = 5 total
      expect(dataAll.totalCount).toBe(5);

      const rEmailOnly = dataAll.users.find((u: { id: string }) => u.id === userEmailOnly.id);
      const rPhoneOnly = dataAll.users.find((u: { id: string }) => u.id === userPhoneOnly.id);
      const rBoth = dataAll.users.find((u: { id: string }) => u.id === userBoth.id);
      const rNeither = dataAll.users.find((u: { id: string }) => u.id === userNeither.id);

      // Verify Quadrant 1
      expect(rEmailOnly).toBeDefined();
      expect(rEmailOnly.emailVerified).toBe(true);
      expect(rPhoneOnly.emailVerified).toBe(false);
      expect(rEmailOnly.isVerified).toBe(true);

      // Verify Quadrant 2 (Critical fix: Phone verified is isVerified = true)
      expect(rPhoneOnly).toBeDefined();
      expect(rPhoneOnly.emailVerified).toBe(false);
      expect(rPhoneOnly.phoneVerified).toBe(true);
      expect(rPhoneOnly.isVerified).toBe(true);

      // Verify Quadrant 3
      expect(rBoth).toBeDefined();
      expect(rBoth.emailVerified).toBe(true);
      expect(rBoth.phoneVerified).toBe(true);
      expect(rBoth.isVerified).toBe(true);

      // Verify Quadrant 4
      expect(rNeither).toBeDefined();
      expect(rNeither.emailVerified).toBe(false);
      expect(rNeither.phoneVerified).toBe(false);
      expect(rNeither.isVerified).toBe(false);

      // 2. Fetch with status="active" (Should return admin, userEmailOnly, userPhoneOnly, userBoth)
      const resActive = await app.inject({
        method: "GET",
        url: "/v1/admin/users?status=active",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resActive.statusCode).toBe(200);
      const dataActive = JSON.parse(resActive.payload);
      const activeIds = dataActive.users.map((u: { id: string }) => u.id);

      expect(activeIds).toContain(userEmailOnly.id);
      expect(activeIds).toContain(userPhoneOnly.id); // Must be included!
      expect(activeIds).toContain(userBoth.id);
      expect(activeIds).not.toContain(userNeither.id); // Must be excluded!

      // 3. Fetch with status="inactive" (Should ONLY return userNeither)
      const resInactive = await app.inject({
        method: "GET",
        url: "/v1/admin/users?status=inactive",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resInactive.statusCode).toBe(200);
      const dataInactive = JSON.parse(resInactive.payload);
      const inactiveIds = dataInactive.users.map((u: { id: string }) => u.id);

      expect(inactiveIds).toContain(userNeither.id);
      expect(inactiveIds).not.toContain(userEmailOnly.id);
      expect(inactiveIds).not.toContain(userPhoneOnly.id);
      expect(inactiveIds).not.toContain(userBoth.id);
    });
  });

  describe("Part 2: DrizzleAdminStore listUsers Unit Verification", () => {
    it("maps database rows to emailVerified, phoneVerified, isVerified correctly", async () => {
      const now = new Date();
      const fakeUsers = [
        {
          id: "u-email-only",
          email: "email@test.com",
          name: "Email User",
          globalRole: null,
          emailVerifiedAt: now,
          phoneVerifiedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "u-phone-only",
          email: "phone@test.com",
          name: "Phone User",
          globalRole: null,
          emailVerifiedAt: null,
          phoneVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "u-both",
          email: "both@test.com",
          name: "Both User",
          globalRole: null,
          emailVerifiedAt: now,
          phoneVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "u-neither",
          email: "neither@test.com",
          name: "Neither User",
          globalRole: null,
          emailVerifiedAt: null,
          phoneVerifiedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      const dialect = new PgDialect();
      const capturedWhereClauses: string[] = [];

      const mockDb = {
        select: (selectArg?: { count?: () => unknown; role?: unknown }) => ({
          from: (table: { _?: { name?: string } }) => ({
            where: (whereClause: unknown) => {
              const sqlStr = whereClause ? dialect.sqlToQuery(whereClause as SQL).sql : "";
              capturedWhereClauses.push(sqlStr);

              // Dynamically evaluate SQL conditions against fakeUsers
              let matchingUsers = fakeUsers;
              if (sqlStr.includes('"users"."email_verified_at" is not null or "users"."phone_verified_at" is not null')) {
                matchingUsers = fakeUsers.filter((u) => u.emailVerifiedAt != null || u.phoneVerifiedAt != null);
              } else if (sqlStr.includes('"users"."email_verified_at" is null and "users"."phone_verified_at" is null')) {
                matchingUsers = fakeUsers.filter((u) => u.emailVerifiedAt == null && u.phoneVerifiedAt == null);
              }

              if (selectArg && selectArg.count) {
                return Promise.resolve([{ count: matchingUsers.length }]);
              }
              if (table?._?.name === "organization_memberships" || (selectArg && selectArg.role)) {
                return Promise.resolve([]);
              }
              return {
                limit: (_limit: number) => ({
                  offset: (_offset: number) => ({
                    orderBy: () => Promise.resolve(matchingUsers),
                  }),
                }),
              };
            },
          }),
        }),
      } as unknown as DbClient;

      const drizzleAdminStore = new DrizzleAdminStore(mockDb);

      // 1. Call listUsers with status="active"
      capturedWhereClauses.length = 0;
      const activeRes = await drizzleAdminStore.listUsers({ page: 1, pageSize: 20, status: "active" });

      // Rigorously assert generated SQL WHERE clause contains dual-channel OR condition
      expect(capturedWhereClauses.length).toBeGreaterThan(0);
      expect(capturedWhereClauses[0]).toContain(
        '("users"."email_verified_at" is not null or "users"."phone_verified_at" is not null)'
      );

      // Verify filtered results: exactly 3 active users
      expect(activeRes.totalCount).toBe(3);
      expect(activeRes.users.length).toBe(3);
      const activeIds = activeRes.users.map((u) => u.id);
      expect(activeIds).toContain("u-email-only");
      expect(activeIds).toContain("u-phone-only"); // Phone verified is ACTIVE!
      expect(activeIds).toContain("u-both");
      expect(activeIds).not.toContain("u-neither");

      // Verify mapping on active users
      const rPhoneOnly = activeRes.users.find((u) => u.id === "u-phone-only")!;
      expect(rPhoneOnly.emailVerified).toBe(false);
      expect(rPhoneOnly.phoneVerified).toBe(true);
      expect(rPhoneOnly.isVerified).toBe(true);

      // 2. Call listUsers with status="inactive"
      capturedWhereClauses.length = 0;
      const inactiveRes = await drizzleAdminStore.listUsers({ page: 1, pageSize: 20, status: "inactive" });

      // Rigorously assert generated SQL WHERE clause contains dual-channel AND condition
      expect(capturedWhereClauses.length).toBeGreaterThan(0);
      expect(capturedWhereClauses[0]).toContain(
        '("users"."email_verified_at" is null and "users"."phone_verified_at" is null)'
      );

      // Verify filtered results: exactly 1 inactive user
      expect(inactiveRes.totalCount).toBe(1);
      expect(inactiveRes.users.length).toBe(1);
      expect(inactiveRes.users[0].id).toBe("u-neither");
      expect(inactiveRes.users[0].emailVerified).toBe(false);
      expect(inactiveRes.users[0].phoneVerified).toBe(false);
      expect(inactiveRes.users[0].isVerified).toBe(false);

      // 3. Call listUsers with no status filter (all)
      capturedWhereClauses.length = 0;
      const allRes = await drizzleAdminStore.listUsers({ page: 1, pageSize: 20 });
      expect(capturedWhereClauses.length).toBeGreaterThan(0);
      expect(capturedWhereClauses[0]).not.toContain("email_verified_at");
      expect(capturedWhereClauses[0]).not.toContain("phone_verified_at");
      expect(allRes.totalCount).toBe(4);
      expect(allRes.users.length).toBe(4);
    });
  });
});
