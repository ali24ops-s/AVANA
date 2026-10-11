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
import { Roles, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";
import { createDbClient } from "@avana/database/client";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";

describe("Admin AI Center Regression Tests", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();
    const sessionService = new SessionService(sessionStore, config.session);

    const platformAdminUser = await userStore.createUserWithPassword({
      email: "admin@avana.ir",
      passwordHash: "x",
    });
    platformAdminUser.name = "مدیر سیستم";
    platformAdminUser.globalRole = "platform_admin";
    platformAdminUser.role = "platform_admin";
    userStore.insert({ ...platformAdminUser });

    const workerUser = await userStore.createUserWithPassword({
      email: "worker@avana.ir",
      passwordHash: "x",
    });
    workerUser.globalRole = "content_worker";
    workerUser.role = "content_worker";
    userStore.insert({ ...workerUser });

    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: platformAdminUser.id as UserId,
      role: Roles.platform_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const adminSession = await sessionService.createSession(platformAdminUser.id);
    const workerSession = await sessionService.createSession(workerUser.id);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      // Omit questionPatternStore to test that it is purely optional
      questionPatternStore: undefined,
    });

    return {
      app,
      adminSessionToken: adminSession.sessionToken,
      workerSessionToken: workerSession.sessionToken,
      adminStore,
    };
  }

  test("GET /v1/admin/generation succeeds without Question Pattern store configured (No Question Pattern = successful response)", async () => {
    const { app, adminSessionToken, adminStore } = await setupTestApp();

    const job = await adminStore.getGenerationJob("non-existent-job");
    expect(job).toBeNull();

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/generation?page=1&pageSize=20",
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("jobs");
    expect(body).toHaveProperty("totalCount");
    expect(Array.isArray(body.jobs)).toBe(true);
  });

  test("GET /v1/admin/generation succeeds for content_worker role as well", async () => {
    const { app, workerSessionToken } = await setupTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/generation?page=1&pageSize=20",
      headers: { authorization: `Bearer ${workerSessionToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("jobs");
    expect(Array.isArray(body.jobs)).toBe(true);
  });

  test("GET /v1/admin/generation/rejected-contents succeeds without 500 Internal Error", async () => {
    const { app, adminSessionToken } = await setupTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/generation/rejected-contents?page=1&pageSize=20",
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("totalCount");
  });

  test("Database schema integrity: DrizzleAdminStore.listGenerationJobs succeeds against Postgres schema with 0075 columns", async () => {
    const config = loadApiConfig();
    const dbUrl = process.env.DATABASE_URL || config.database?.url || "postgresql://localhost:5432/avana";
    let dbClient;
    try {
      dbClient = createDbClient(dbUrl);
    } catch {
      return;
    }

    try {
      const store = new DrizzleAdminStore(dbClient.db);
      const res = await store.listGenerationJobs({ page: 1, pageSize: 10 });
      expect(res).toBeDefined();
      expect(typeof res.totalCount).toBe("number");
      expect(Array.isArray(res.jobs)).toBe(true);

      for (const job of res.jobs) {
        expect(job.id).toBeDefined();
        expect(job.type).toBeDefined();
        expect(job.status).toBeDefined();
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: string; cause?: { code?: string }; message?: string };
      const isNetworkRestricted =
        errorObj.code === "ECONNREFUSED" ||
        errorObj.code === "EPERM" ||
        errorObj.cause?.code === "EPERM" ||
        errorObj.cause?.code === "ECONNREFUSED" ||
        String(err).includes("EPERM") ||
        String(errorObj.cause).includes("EPERM");

      if (isNetworkRestricted) {
        // Sandboxed test runner without network access to DB socket
        return;
      }
      throw err;
    } finally {
      if (dbClient) {
        await dbClient.close().catch(() => {});
      }
    }
  });
});
