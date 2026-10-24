import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { loadApiConfig } from "../config.js";
import { InMemorySessionStore, InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import type { FastifyInstance } from "fastify";

function extractCookie(
  res: { headers: Record<string, string | string[] | number | undefined> },
  name: string,
): string | undefined {
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

function extractRawCookieHeader(
  res: { headers: Record<string, string | string[] | number | undefined> },
  name: string,
): string | undefined {
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.find((c) => c.startsWith(`${name}=`));
}

describe("Complete User Login & Session Persistence Flow Verification", () => {
  let app: FastifyInstance;
  let userStore: InMemoryUserStore;
  let sessionStore: InMemorySessionStore;
  let organizationStore: InMemoryOrganizationStore;

  const testEmail = "learner_login@example.com";
  const testPassword = "ValidPassword123!";
  const testPhone = "09129876543";

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

    // Register test user
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: testEmail,
        password: testPassword,
        name: "کاربر تست آوانا",
        phoneNumber: testPhone,
      },
    });
    expect(regRes.statusCode).toBe(200);
  });

  afterEach(async () => {
    await app.close();
  });

  it("1. Successful Login: signs in with email & password, sets session + csrf cookies, returns user data", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(testEmail);
    expect(body.user.name).toBe("کاربر تست آوانا");
    expect(body.memberships).toBeDefined();

    const sessionCookie = extractCookie(loginRes, "avana_session");
    const csrfCookie = extractCookie(loginRes, "avana_csrf");

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.length).toBeGreaterThan(20);
    expect(csrfCookie).toBeDefined();
  });

  it("2. Failed Login: rejects invalid password with 401 unauthorized", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: "WrongPassword_999",
      },
    });

    expect(loginRes.statusCode).toBe(401);
    const sessionCookie = extractCookie(loginRes, "avana_session");
    expect(sessionCookie).toBeUndefined();
  });

  it("3. Immediate User Info: retrieves profile immediately via GET /v1/me using session cookie", async () => {
    // Sign in
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    const sessionToken = extractCookie(loginRes, "avana_session");

    // Fetch /v1/me
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });

    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user).toBeDefined();
    expect(meBody.user.email).toBe(testEmail);
    expect(meBody.user.name).toBe("کاربر تست آوانا");
  });

  it("4. Session Persistence: maintains session across multiple subsequent requests", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    const sessionToken = extractCookie(loginRes, "avana_session");

    for (let reqIndex = 1; reqIndex <= 5; reqIndex++) {
      const res = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.user.email).toBe(testEmail);
    }
  });

  it("5. Session Recovery on Reload: simulates browser reload restoring user session via /v1/me", async () => {
    // Step A: Login and save cookie
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    const savedCookie = extractCookie(loginRes, "avana_session");

    // Step B: Simulate closing app / full page reload by creating a fresh request with saved cookie
    const reloadRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: `avana_session=${savedCookie}`,
      },
    });

    expect(reloadRes.statusCode).toBe(200);
    const reloadBody = JSON.parse(reloadRes.body);
    expect(reloadBody.user).toBeDefined();
    expect(reloadBody.user.email).toBe(testEmail);
    expect(reloadBody.user.phoneNumber).toBe("+989129876543");
  });

  it("6. Expired / Invalid Session: returns 401 when session is invalid or revoked", async () => {
    // Non-existent token
    const invalidRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: "avana_session=completely_fake_invalid_token_xyz123",
      },
    });
    expect(invalidRes.statusCode).toBe(401);

    // Expired session in store
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    const sessionToken = extractCookie(loginRes, "avana_session");

    // Manually revoke all sessions in the store to simulate expired/invalidated session
    const user = await userStore.findByEmail(testEmail);
    await sessionStore.revokeAllByUser(user!.id, new Date().toISOString(), "expired_test");

    const expiredRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });
    expect(expiredRes.statusCode).toBe(401);
  });

  it("7. Logout & Session Invalidation: sign-out revokes session and clears cookies", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });
    const sessionToken = extractCookie(loginRes, "avana_session");

    // Call sign-out
    const signOutRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });

    expect(signOutRes.statusCode).toBe(204);

    // Verify session cookie is cleared
    const rawSessionCookie = extractRawCookieHeader(signOutRes, "avana_session");
    expect(rawSessionCookie).toBeDefined();
    // In Fastify/cookie, clearing sets maxAge <= 0 or expires in past
    expect(rawSessionCookie).toMatch(/Max-Age=0|Expires=/i);

    // Subsequent request with old sessionToken must be rejected with 401
    const postLogoutRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        cookie: `avana_session=${sessionToken}`,
      },
    });
    expect(postLogoutRes.statusCode).toBe(401);
  });

  it("8. Production Cookie Settings: validates secure, SameSite=lax, domain, and 14+ days maxAge", async () => {
    // Configure production environment
    const prodConfig = loadApiConfig({
      NODE_ENV: "production",
      AVANA_APP_URL: "https://aavana.ir",
      AVANA_COOKIE_SECURE: "true",
      AVANA_COOKIE_DOMAIN: ".aavana.ir",
    });

    const prodSessionStore = new InMemorySessionStore();
    const prodUserStore = new InMemoryUserStore();
    const prodOrgStore = new InMemoryOrganizationStore();

    const prodApp = createApp({ config: prodConfig });
    await prodApp.register(v1Routes, {
      config: prodConfig,
      sessionStore: prodSessionStore,
      userStore: prodUserStore,
      organizationStore: prodOrgStore,
    });
    await prodApp.ready();

    // Register user on prodApp
    await prodApp.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: "prod_user@example.com",
        password: testPassword,
        name: "کاربر محیط پروداکشن",
        phoneNumber: "09120001122",
      },
    });

    // Sign in on prodApp
    const loginRes = await prodApp.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: {
        email: "prod_user@example.com",
        password: testPassword,
      },
    });

    expect(loginRes.statusCode).toBe(200);

    const rawSessionCookie = extractRawCookieHeader(loginRes, "avana_session");
    expect(rawSessionCookie).toBeDefined();

    // Cookie security assertions
    expect(rawSessionCookie).toContain("HttpOnly");
    expect(rawSessionCookie).toContain("Secure");
    expect(rawSessionCookie).toContain("SameSite=Lax");
    expect(rawSessionCookie).toContain("Domain=.aavana.ir");
    expect(rawSessionCookie).toContain("Path=/");

    // MaxAge assertion (minimum 14 days = 1,209,600 seconds)
    const maxAgeMatch = rawSessionCookie!.match(/Max-Age=(\d+)/i);
    expect(maxAgeMatch).not.toBeNull();
    const maxAgeSeconds = Number(maxAgeMatch![1]);
    expect(maxAgeSeconds).toBeGreaterThanOrEqual(14 * 24 * 60 * 60);

    // Verify sign-out also clears with matching Domain=.aavana.ir
    const token = extractCookie(loginRes, "avana_session");
    const signOutRes = await prodApp.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: {
        cookie: `avana_session=${token}`,
      },
    });
    expect(signOutRes.statusCode).toBe(204);
    const clearCookieHeader = extractRawCookieHeader(signOutRes, "avana_session");
    expect(clearCookieHeader).toContain("Domain=.aavana.ir");

    await prodApp.close();
  });
});
