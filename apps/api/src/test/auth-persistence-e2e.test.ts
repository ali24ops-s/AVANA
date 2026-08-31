import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { loadApiConfig } from "../config.js";
import { InMemorySessionStore, InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import type { FastifyInstance } from "fastify";

function extractCookie(res: { headers: Record<string, string | string[] | number | undefined> }, name: string): string | undefined {
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

describe("Authentication Persistence & Multi-Session Verification", () => {
  let app: FastifyInstance;
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
  let organizationStore: InMemoryOrganizationStore;

  const testEmail = "test_persistence_user@example.com";
  const testPassword = "StrongPassword123";

  beforeEach(async () => {
    const config = loadApiConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("User persists after registration and can log in multiple times after logout", async () => {
    // 1. Register
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: testEmail,
        password: testPassword,
        name: "Test User",
      },
    });

    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.user).toBeDefined();
    expect(regBody.user.email).toBe(testEmail);
    expect(regBody.user.name).toBe("Test User");
    expect(regBody.memberships).toHaveLength(1);

    const session1 = extractCookie(regRes, "avana_session");
    expect(session1).toBeDefined();

    // 2. Verify User exists in Store with Password Hash
    const storedUser = await userStore.findWithPasswordByEmail(testEmail);
    expect(storedUser).toBeDefined();
    expect(storedUser?.email).toBe(testEmail);
    expect(storedUser?.passwordHash).toBeDefined();
    expect(storedUser?.passwordHash?.length).toBeGreaterThan(10);

    // 3. Logout (Sign Out)
    const logoutRes1 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: {
        cookie: `avana_session=${session1}`,
      },
    });
    expect(logoutRes1.statusCode).toBe(204);

    // 4. Verify User STILL exists after logout (logout MUST NOT delete user)
    const userAfterLogout1 = await userStore.findWithPasswordByEmail(testEmail);
    expect(userAfterLogout1).toBeDefined();
    expect(userAfterLogout1?.passwordHash).toBeDefined();

    // 5. First Login with SAME Email + Password
    const loginRes1 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(loginRes1.statusCode).toBe(200);
    const loginBody1 = JSON.parse(loginRes1.body);
    expect(loginBody1.user.email).toBe(testEmail);
    const session2 = extractCookie(loginRes1, "avana_session");
    expect(session2).toBeDefined();
    expect(session2).not.toBe(session1); // New session issued

    // 6. Second Logout
    const logoutRes2 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: {
        cookie: `avana_session=${session2}`,
      },
    });
    expect(logoutRes2.statusCode).toBe(204);

    // 7. Second Login with SAME Email + Password
    const loginRes2 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(loginRes2.statusCode).toBe(200);
    const loginBody2 = JSON.parse(loginRes2.body);
    expect(loginBody2.user.email).toBe(testEmail);
    const session3 = extractCookie(loginRes2, "avana_session");
    expect(session3).toBeDefined();

    // 8. Third Logout
    await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: {
        cookie: `avana_session=${session3}`,
      },
    });

    // 9. Third Login with SAME Email + Password
    const loginRes3 = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    expect(loginRes3.statusCode).toBe(200);

    // 10. Attempt Duplicate Registration with same email must fail with 409 Conflict
    const dupRegRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: testEmail,
        password: "NewPassword123",
      },
    });
    expect(dupRegRes.statusCode).toBe(409);
  });

  it("Email normalization works across mixed case and whitespace", async () => {
    const rawEmail = `  USER_NORM@example.com  `;
    const normalizedEmail = "user_norm@example.com";

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: rawEmail,
        password: testPassword,
      },
    });

    expect(regRes.statusCode).toBe(200);

    // Sign in using different casing and whitespace
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "USER_NORM@EXAMPLE.COM",
        password: testPassword,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    expect(JSON.parse(loginRes.body).user.email).toBe(normalizedEmail);
  });

  it("App restart / re-initialization preserves user and allows login on new app instance", async () => {
    const email = "restart_test@example.com";
    const password = "PasswordRestart123";

    // 1. Register user on first app instance
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password, name: "Restart User" },
    });
    expect(regRes.statusCode).toBe(200);

    const session1 = extractCookie(regRes, "avana_session");
    expect(session1).toBeDefined();

    // 2. Sign out
    const logoutRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: { cookie: `avana_session=${session1}` },
    });
    expect(logoutRes.statusCode).toBe(204);

    // 3. Simulate App Restart / Service Re-initialization:
    // Close existing Fastify instance and boot a NEW Fastify instance sharing the persistent store
    await app.close();

    const config = loadApiConfig();
    const app2 = createApp({ config });
    await app2.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
    });
    await app2.ready();

    // 4. Login on the NEW app instance after restart
    const loginRes = await app2.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, password },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.user.email).toBe(email);

    await app2.close();
  });
});
