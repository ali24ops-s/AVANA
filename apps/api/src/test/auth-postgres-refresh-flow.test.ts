import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { loadApiConfig } from "../config.js";
import { DrizzleUserStore, DrizzleSessionStore } from "../modules/identity/drizzle-stores.js";
import { DrizzleOrganizationStore } from "../modules/organizations/drizzle-stores.js";
import type { FastifyInstance } from "fastify";

function extractCookie(res: { headers: Record<string, any> }, name: string): string | undefined {
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) {
    if (c.startsWith(`${name}=`)) {
      return c.split(";")[0].split("=")[1];
    }
  }
  return undefined;
}

describe("Real PostgreSQL Auth Refresh & Re-Authentication E2E Flow", () => {
  const dbUrl = process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";
  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;
  let app: FastifyInstance;

  const testEmail = `test_refresh_${Date.now()}@gmail.com`;
  const testPassword = "StrongPassword123!";

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close().catch(() => {});
    }
    if (client) {
      await client.close().catch(() => {});
    }
  });

  it("Executes complete Register -> Login -> GET /v1/me -> Refresh -> Login again -> GET /v1/me with PostgreSQL", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    const { db } = client;
    const config = loadApiConfig();
    const userStore = new DrizzleUserStore(db);
    const sessionStore = new DrizzleSessionStore(db);
    const organizationStore = new DrizzleOrganizationStore(db);

    app = createApp({ config });

    await app.register(v1Routes, {
      config,
      userStore,
      sessionStore,
      organizationStore,
    });
    await app.ready();

    // 1. REGISTER with Email (@gmail.com domain, not in LocalIdentityAdapter default allowlist) + Password
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: testEmail,
        password: testPassword,
        name: "Postgres Refresh User",
      },
    });

    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.user.email).toBe(testEmail);

    const sessionCookie1 = extractCookie(regRes, "avana_session");
    expect(sessionCookie1).toBeDefined();

    // 2. GET /v1/me with initial session cookie
    const meRes1 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: `avana_session=${sessionCookie1}`,
      },
    });
    expect(meRes1.statusCode).toBe(200);
    const meBody1 = JSON.parse(meRes1.body);
    expect(meBody1.user.email).toBe(testEmail);

    // 3. BROWSER REFRESH simulation (AuthInit -> GET /v1/me with existing session cookie)
    const meRes2 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: `avana_session=${sessionCookie1}`,
      },
    });
    expect(meRes2.statusCode).toBe(200);
    const meBody2 = JSON.parse(meRes2.body);
    expect(meBody2.user.email).toBe(testEmail);

    // 4. SIGN OUT
    const logoutRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: {
        cookie: `avana_session=${sessionCookie1}`,
      },
    });
    expect(logoutRes.statusCode).toBe(204);

    // 5. LOGIN AGAIN with same Email (@gmail.com) + Password
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.user.email).toBe(testEmail);

    const sessionCookie2 = extractCookie(loginRes, "avana_session");
    expect(sessionCookie2).toBeDefined();

    // 6. GET /v1/me with new session cookie
    const meRes3 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: `avana_session=${sessionCookie2}`,
      },
    });
    expect(meRes3.statusCode).toBe(200);
    const meBody3 = JSON.parse(meRes3.body);
    expect(meBody3.user.email).toBe(testEmail);
  });
});
