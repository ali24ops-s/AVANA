import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { hashPassword } from "../modules/identity/password-hasher.js";
import { v1Routes } from "../routes/v1.js";
import { isSafeWorkerLocalEnvironment } from "../modules/identity/auth-routes.js";
import { Roles, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

const LOCAL_WORKER_DB = "postgres://" + "avana:avana@127.0.0.1:55432/avana";
const LOCAL_STANDARD_DB = "postgres://" + "avana:avana@localhost:5432/avana";

describe("Worker Auto-Login & Production Safety Guards", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function setupAuthApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);

    const app = createApp({ config });
    app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
    });

    return {
      app,
      userStore,
      orgStore,
      sessionStore,
      config,
    };
  }

  describe("isSafeWorkerLocalEnvironment helper", () => {
    it("returns true only in Worker development mode with local DB", () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "development";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      expect(isSafeWorkerLocalEnvironment()).toBe(true);
      expect(isSafeWorkerLocalEnvironment(LOCAL_STANDARD_DB)).toBe(true);
    });

    it("returns false if WORKER_MODE is not true", () => {
      delete process.env.WORKER_MODE;
      process.env.NODE_ENV = "development";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      expect(isSafeWorkerLocalEnvironment()).toBe(false);
    });

    it("returns false in production environment even if WORKER_MODE=true", () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "production";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      expect(isSafeWorkerLocalEnvironment()).toBe(false);
    });

    it("returns false if DATABASE_URL points to remote or production database", () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "development";

      // AWS RDS
      expect(
        isSafeWorkerLocalEnvironment("postgres://" + "user:pass@prod-db.rds.amazonaws.com:5432/avana"),
      ).toBe(false);

      // Remote IP
      expect(
        isSafeWorkerLocalEnvironment("postgres://" + "user:pass@194.163.150.22:5432/avana"),
      ).toBe(false);

      // Database name containing 'prod'
      expect(
        isSafeWorkerLocalEnvironment("postgres://" + "avana:avana@127.0.0.1:5432/avana_production"),
      ).toBe(false);
    });
  });

  describe("POST /v1/auth/worker-auto-login Endpoint", () => {
    it("successfully creates an authenticated session for worker user without password or OTP", async () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "development";
      process.env.WORKER_ID = "worker-001";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      const { app, userStore, orgStore } = setupAuthApp();

      // Seed worker user
      const workerEmail = "worker-worker-001@avana.local";
      const pwHash = await hashPassword("random-hashed-pw");
      const user = await userStore.createUserWithPassword({
        email: workerEmail,
        name: "Content Worker (worker-001)",
        passwordHash: pwHash,
        role: Roles.content_worker,
      });
      await userStore.setEmailVerified(user.id);

      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id,
        role: Roles.content_worker,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/worker-auto-login",
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.user.id).toBe(user.id);
      expect(data.user.email).toBe(workerEmail);
      expect(data.user.role).toBe(Roles.content_worker);
      expect(data.user.isVerified).toBe(true);

      // Verify session cookies issued
      const cookies = res.cookies;
      const sessionCookie = cookies.find((c) => c.name === "avana_session");
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.httpOnly).toBe(true);

      // Verify that calling /v1/me with this cookie works
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: {
          avana_session: sessionCookie!.value,
        },
      });

      expect(meRes.statusCode).toBe(200);
      const meData = JSON.parse(meRes.body);
      expect(meData.user.id).toBe(user.id);
      expect(meData.user.role).toBe(Roles.content_worker);
    });

    it("re-uses existing valid session for the worker user without issue", async () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "development";
      process.env.WORKER_ID = "worker-001";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      const { app, userStore, orgStore } = setupAuthApp();

      const workerEmail = "worker-worker-001@avana.local";
      const pwHash = await hashPassword("random-hashed-pw");
      const user = await userStore.createUserWithPassword({
        email: workerEmail,
        name: "Content Worker (worker-001)",
        passwordHash: pwHash,
        role: Roles.content_worker,
      });
      await userStore.setEmailVerified(user.id);

      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id,
        role: Roles.content_worker,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 1st login
      const firstRes = await app.inject({
        method: "POST",
        url: "/v1/auth/worker-auto-login",
      });
      expect(firstRes.statusCode).toBe(200);
      const sessionCookie = firstRes.cookies.find((c) => c.name === "avana_session");
      const deviceCookie = firstRes.cookies.find((c) => c.name === "avana_device_id");

      const cookies: Record<string, string> = {
        avana_session: sessionCookie!.value,
      };
      if (deviceCookie) {
        cookies.avana_device_id = deviceCookie.value;
      }

      // 2nd login with existing cookies
      const secondRes = await app.inject({
        method: "POST",
        url: "/v1/auth/worker-auto-login",
        cookies,
      });
      expect(secondRes.statusCode).toBe(200);
      const data = JSON.parse(secondRes.body);
      expect(data.user.id).toBe(user.id);
      expect(data.user.role).toBe(Roles.content_worker);
    });

    it("strictly blocks auto-login when NODE_ENV=production", async () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "production";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      const { app } = setupAuthApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/worker-auto-login",
      });

      expect(res.statusCode).toBe(403);
    });

    it("strictly blocks auto-login when WORKER_MODE is disabled", async () => {
      delete process.env.WORKER_MODE;
      process.env.NODE_ENV = "development";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      const { app } = setupAuthApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/worker-auto-login",
      });

      expect(res.statusCode).toBe(403);
    });

    it("strictly blocks startup and configuration when DATABASE_URL is remote in worker mode", () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "development";
      process.env.DATABASE_URL = "postgres://" + "user:pass@remote.db.server.com:5432/db";

      expect(() => loadApiConfig()).toThrow(/Worker mode cannot connect to non-local database host/);
    });

    it("returns 404 when worker user is not seeded", async () => {
      process.env.WORKER_MODE = "true";
      process.env.NODE_ENV = "development";
      process.env.WORKER_ID = "non-existent-worker";
      process.env.DATABASE_URL = LOCAL_WORKER_DB;

      const { app } = setupAuthApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/worker-auto-login",
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
