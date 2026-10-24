/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
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
import { Roles } from "@avana/domain";
import { randomUUID } from "node:crypto";
import type { AuditService } from "../observability/audit-service.js";
import type { AuditEvent } from "@avana/domain";

describe("Admin Delete User & User Search Test Suite", () => {
  const config = loadApiConfig();
  config.session.maxAgeMs = 86400000;
  config.logging.level = "silent";

  function setupTestApp() {
    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    const emittedAuditEvents: AuditEvent[] = [];
    const auditService: AuditService = {
      emit: async (events: AuditEvent[]) => {
        emittedAuditEvents.push(...events);
      },
    };

    const app = createApp({ config });
    app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      auditService,
    });

    return {
      app,
      sessionStore,
      orgStore,
      userStore,
      adminStore,
      sessionService,
      emittedAuditEvents,
    };
  }

  async function createSessionForRole(
    userStore: InMemoryUserStore,
    sessionService: SessionService,
    role: string,
    globalRole?: string | null,
  ) {
    const user = await userStore.createUserWithPassword({
      email: `${role}_${randomUUID()}@avana.test`,
      passwordHash: "hash",
      globalRole: globalRole ?? (role === Roles.platform_admin ? Roles.platform_admin : null),
    });
    user.role = role;
    if (typeof userStore.insert === "function") {
      userStore.insert({ ...user, role, globalRole: globalRole ?? user.globalRole });
    }
    await userStore.setEmailVerified(user.id);
    const session = await sessionService.createSession(user.id);
    return { user, sessionToken: session.sessionToken };
  }

  describe("1. User search by email, phone number, and user ID", () => {
    it("can search and find users by email, mobile number, and user ID accurately", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const targetUser = await userStore.createUserWithPassword({
        email: "unique_student@avana.test",
        passwordHash: "hash",
        name: "دانش‌آموز تستی",
        phoneNumber: "09129876543",
      });

      // 1. Search by email
      const resEmail = await app.inject({
        method: "GET",
        url: "/v1/admin/users?search=unique_student",
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });
      expect(resEmail.statusCode).toBe(200);
      const dataEmail = JSON.parse(resEmail.payload);
      expect(dataEmail.users).toHaveLength(1);
      expect(dataEmail.users[0].id).toBe(targetUser.id);

      // 2. Search by phone number
      const resPhone = await app.inject({
        method: "GET",
        url: "/v1/admin/users?search=09129876543",
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });
      expect(resPhone.statusCode).toBe(200);
      const dataPhone = JSON.parse(resPhone.payload);
      expect(dataPhone.users).toHaveLength(1);
      expect(dataPhone.users[0].id).toBe(targetUser.id);

      // 3. Search by user ID
      const resId = await app.inject({
        method: "GET",
        url: `/v1/admin/users?search=${targetUser.id}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });
      expect(resId.statusCode).toBe(200);
      const dataId = JSON.parse(resId.payload);
      expect(dataId.users).toHaveLength(1);
      expect(dataId.users[0].id).toBe(targetUser.id);
    });
  });

  describe("2. Authorization and Access Control for Account Deletion", () => {
    it("allows platform_admin to delete a valid user account", async () => {
      const { app, userStore, sessionService, emittedAuditEvents } = setupTestApp();
      const { user: admin, sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const student = await userStore.createUserWithPassword({
        email: "victim@avana.test",
        passwordHash: "hash",
        phoneNumber: "09120000001",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${student.id}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);

      // Ensure user is no longer in userStore
      const found = await userStore.findById(student.id);
      expect(found).toBeUndefined();

      // Ensure audit log was emitted
      const deleteAudit = emittedAuditEvents.find(
        (e) => e.action === "admin.delete_user" && e.entityId === student.id,
      );
      expect(deleteAudit).toBeDefined();
      expect(deleteAudit?.actorId).toBe(admin.id);
    });

    it("prevents platform_admin from deleting their own account (self-deletion guard)", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { user: admin, sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${admin.id}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("conflict");
      expect(body.message).toContain("جاری");
    });

    it("rejects deletion requests from support_agent role (403)", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: supportToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.support_agent,
        Roles.support_agent,
      );

      const target = await userStore.createUserWithPassword({
        email: "target1@avana.test",
        passwordHash: "hash",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${target.id}`,
        headers: {
          cookie: `avana_session=${supportToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects deletion requests from content_worker role (403)", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: workerToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.content_worker,
        Roles.content_worker,
      );

      const target = await userStore.createUserWithPassword({
        email: "target2@avana.test",
        passwordHash: "hash",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${target.id}`,
        headers: {
          cookie: `avana_session=${workerToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects deletion requests from course_editor role (403)", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: editorToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.course_editor,
        Roles.course_editor,
      );

      const target = await userStore.createUserWithPassword({
        email: "target3@avana.test",
        passwordHash: "hash",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${target.id}`,
        headers: {
          cookie: `avana_session=${editorToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects deletion requests from regular student/user (403)", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: studentToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.student,
      );

      const otherUser = await userStore.createUserWithPassword({
        email: "other@avana.test",
        passwordHash: "hash",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${otherUser.id}`,
        headers: {
          cookie: `avana_session=${studentToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects unauthenticated requests (401)", async () => {
      const { app } = setupTestApp();
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("3. Edge cases, Not Found, Sessions & Idempotency", () => {
    it("returns 404 when trying to delete a non-existent user", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const fakeId = randomUUID();
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${fakeId}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("not_found");
    });

    it("revokes active user sessions when account is deleted", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const user = await userStore.createUserWithPassword({
        email: "session_user@avana.test",
        passwordHash: "hash",
      });
      const userSession = await sessionService.createSession(user.id);

      // Verify session is initially valid
      const validationBefore = await sessionService.validateSession(userSession.sessionToken);
      expect(validationBefore?.userId).toBe(user.id);

      // Admin deletes user
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${user.id}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });
      expect(res.statusCode).toBe(200);

      // Verify session is revoked and validation fails
      const validationAfter = await sessionService.validateSession(userSession.sessionToken);
      expect(validationAfter).toBeUndefined();
    });

    it("handles concurrent/repeated deletion gracefully (second delete returns 404)", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const user = await userStore.createUserWithPassword({
        email: "double_delete@avana.test",
        passwordHash: "hash",
      });

      // First call
      const res1 = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${user.id}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });
      expect(res1.statusCode).toBe(200);

      // Second call immediately after
      const res2 = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${user.id}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });
      expect(res2.statusCode).toBe(404);
    });

    it("prevents deletion of a user with active wallet balance", async () => {
      const { app, userStore, adminStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const user = await userStore.createUserWithPassword({
        email: "rich_user@avana.test",
        passwordHash: "hash",
      });

      // Seed positive wallet balance in InMemoryAdminStore
      adminStore.memoryWallets.push({
        userId: user.id,
        balance: 50000,
        currency: "toman",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${user.id}`,
        headers: {
          cookie: `avana_session=${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("conflict");
      expect(body.message).toContain("کیف پول");

      // Verify user was NOT deleted
      const found = await userStore.findById(user.id);
      expect(found).toBeDefined();
    });
  });

  describe("4. Data Integrity, Privacy, Multi-Session, and Concurrency Audits", () => {
    it("does not store user PII (email, mobile, name) in audit log details", async () => {
      const { app, userStore, sessionService, emittedAuditEvents } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const target = await userStore.createUserWithPassword({
        email: "private_student_123@avana.test",
        passwordHash: "hash",
        name: "سارا حسینی",
        phoneNumber: "09121112233",
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${target.id}`,
        headers: { cookie: `avana_session=${adminToken}` },
      });
      expect(res.statusCode).toBe(200);

      const deleteAudit = emittedAuditEvents.find(
        (e) => e.action === "admin.delete_user" && e.entityId === target.id,
      );
      expect(deleteAudit).toBeDefined();

      const detailsStr = JSON.stringify(deleteAudit?.details ?? {});
      expect(detailsStr).not.toContain("private_student_123@avana.test");
      expect(detailsStr).not.toContain("09121112233");
      expect(detailsStr).not.toContain("سارا حسینی");
      expect(deleteAudit?.details).toHaveProperty("admin_user_id");
      expect(deleteAudit?.details).toHaveProperty("target_user_id", target.id);
      expect(deleteAudit?.details).toHaveProperty("reason");
    });

    it("preserves data and sessions of other users when one user is deleted", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const userA = await userStore.createUserWithPassword({
        email: "user_a@avana.test",
        passwordHash: "hash",
      });
      const userB = await userStore.createUserWithPassword({
        email: "user_b@avana.test",
        passwordHash: "hash",
      });

      const sessionA = await sessionService.createSession(userA.id);
      const sessionB = await sessionService.createSession(userB.id);

      // Verify both sessions initially valid
      expect(await sessionService.validateSession(sessionA.sessionToken)).toBeDefined();
      expect(await sessionService.validateSession(sessionB.sessionToken)).toBeDefined();

      // Admin deletes User A
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${userA.id}`,
        headers: { cookie: `avana_session=${adminToken}` },
      });
      expect(res.statusCode).toBe(200);

      // User A is deleted and session revoked
      expect(await userStore.findById(userA.id)).toBeUndefined();
      expect(await sessionService.validateSession(sessionA.sessionToken)).toBeUndefined();

      // User B and session B are completely intact
      const foundB = await userStore.findById(userB.id);
      expect(foundB).toBeDefined();
      expect(foundB?.id).toBe(userB.id);
      const validatedB = await sessionService.validateSession(sessionB.sessionToken);
      expect(validatedB?.userId).toBe(userB.id);
    });

    it("ensures all sessions across devices are invalidated when user has multiple sessions", async () => {
      const { app, userStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const multiUser = await userStore.createUserWithPassword({
        email: "multi_device@avana.test",
        passwordHash: "hash",
      });

      // Create 3 active sessions across different devices
      const s1 = await sessionService.createSession(multiUser.id);
      const s2 = await sessionService.createSession(multiUser.id);
      const s3 = await sessionService.createSession(multiUser.id);

      // Verify all 3 sessions valid
      expect(await sessionService.validateSession(s1.sessionToken)).toBeDefined();
      expect(await sessionService.validateSession(s2.sessionToken)).toBeDefined();
      expect(await sessionService.validateSession(s3.sessionToken)).toBeDefined();

      // Delete user
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${multiUser.id}`,
        headers: { cookie: `avana_session=${adminToken}` },
      });
      expect(res.statusCode).toBe(200);

      // Verify ALL 3 sessions are invalidated
      expect(await sessionService.validateSession(s1.sessionToken)).toBeUndefined();
      expect(await sessionService.validateSession(s2.sessionToken)).toBeUndefined();
      expect(await sessionService.validateSession(s3.sessionToken)).toBeUndefined();
    });

    it("preserves financial records and blocks deletion when user has paid payments", async () => {
      const { app, userStore, adminStore, sessionService } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const paidUser = await userStore.createUserWithPassword({
        email: "paying_customer@avana.test",
        passwordHash: "hash",
      });

      // Add paid payment record in commerce history
      adminStore.memoryPayments.push({
        id: randomUUID(),
        userId: paidUser.id,
        orderId: randomUUID(),
        amount: 250000,
        currency: "toman",
        gateway: "zarinpal",
        status: "paid",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${paidUser.id}`,
        headers: { cookie: `avana_session=${adminToken}` },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("conflict");
      expect(body.message).toContain("پرداخت مالی");

      // Verify user was NOT deleted
      const found = await userStore.findById(paidUser.id);
      expect(found).toBeDefined();
    });

    it("handles concurrent deletion requests safely without crashing or duplicate events", async () => {
      const { app, userStore, sessionService, emittedAuditEvents } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const target = await userStore.createUserWithPassword({
        email: "concurrent_target@avana.test",
        passwordHash: "hash",
      });

      // Fire 2 concurrent deletion requests
      const [res1, res2] = await Promise.all([
        app.inject({
          method: "DELETE",
          url: `/v1/admin/users/${target.id}`,
          headers: { cookie: `avana_session=${adminToken}` },
        }),
        app.inject({
          method: "DELETE",
          url: `/v1/admin/users/${target.id}`,
          headers: { cookie: `avana_session=${adminToken}` },
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      // One request must succeed (200), and the other must get 404 (user already deleted)
      expect(statuses).toEqual([200, 404]);

      // Exactly 1 audit event should be emitted
      const deleteAudits = emittedAuditEvents.filter(
        (e) => e.action === "admin.delete_user" && e.entityId === target.id,
      );
      expect(deleteAudits).toHaveLength(1);
    });

    it("ensures rollback/safety if underlying store fails during deletion", async () => {
      const { app, userStore, adminStore, sessionService, emittedAuditEvents } = setupTestApp();
      const { sessionToken: adminToken } = await createSessionForRole(
        userStore,
        sessionService,
        Roles.platform_admin,
      );

      const target = await userStore.createUserWithPassword({
        email: "failing_store_target@avana.test",
        passwordHash: "hash",
      });
      const session = await sessionService.createSession(target.id);

      // Force adminStore.deleteUser to fail unexpectedly
      adminStore.deleteUser = async () => {
        throw new Error("simulated_store_unhandled_failure");
      };

      const res = await app.inject({
        method: "DELETE",
        url: `/v1/admin/users/${target.id}`,
        headers: { cookie: `avana_session=${adminToken}` },
      });

      expect(res.statusCode).toBe(500);

      // User must still exist
      const stillExists = await userStore.findById(target.id);
      expect(stillExists).toBeDefined();

      // Session must still be valid
      const sessionValid = await sessionService.validateSession(session.sessionToken);
      expect(sessionValid).toBeDefined();

      // No audit event emitted
      const deleteAudits = emittedAuditEvents.filter(
        (e) => e.action === "admin.delete_user" && e.entityId === target.id,
      );
      expect(deleteAudits).toHaveLength(0);
    });
  });
});
