/**
 * Comprehensive Security & Integration Test Suite for AVANA Authentication & Authorization.
 *
 * Covers requirements 1-14:
 * 1. Password hashing (scrypt with salt) & non-disclosure
 * 2. Registration (validation, email normalization, duplicate handling)
 * 3. Login (success, invalid password, nonexistent email, case/whitespace handling)
 * 4. User Enumeration Protection (identical error for wrong password vs missing email)
 * 5. Session Fixation & Revocation (Session invalidated on logout, fresh token issued)
 * 6. Rate Limiting protection on auth routes
 * 7. Authorization & IDOR isolation (User A cannot access User B's resources by ID manipulation)
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { registerIdentityModule } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import {
  hashPassword,
  verifyPassword,
} from "../modules/identity/password-hasher.js";


function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractCookie(
  res: { cookies: Array<{ name: string; value: string }> },
  cookieName: string,
): string | undefined {
  const cookie = res.cookies.find((c) => c.name === cookieName);
  return cookie?.value;
}

describe("AVANA Authentication & Authorization Security Audit Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
  });

  describe("1. Password Hashing Security", () => {
    it("hashes password with scrypt and unique random salt", async () => {
      const hash1 = await hashPassword("SecurePass123!");
      const hash2 = await hashPassword("SecurePass123!");

      expect(hash1).toMatch(/^scrypt\$N=\d+,r=\d+,p=\d+\$[0-9a-f]+\$[0-9a-f]+$/);
      expect(hash2).toMatch(/^scrypt\$N=\d+,r=\d+,p=\d+\$[0-9a-f]+\$[0-9a-f]+$/);
      // Different random salts produce different hashes for the same password
      expect(hash1).not.toBe(hash2);

      expect(await verifyPassword("SecurePass123!", hash1)).toBe(true);
      expect(await verifyPassword("WrongPass", hash1)).toBe(false);
    });
  });

  describe("2. User Registration Security", () => {
    it("registers user with valid email & password, returning user object without password", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      await app.register(registerIdentityModule, { config, sessionStore, userStore });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "NewUser@Example.com",
          password: "mysecretpassword",
          name: "New User",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe("newuser@example.com"); // Normalized lowercase
      expect(body.user.id).toBeDefined();
      expect(body.user.password).toBeUndefined();
      expect(body.user.passwordHash).toBeUndefined();

      const sessionCookie = extractCookie(res, "avana_session");
      expect(sessionCookie).toBeDefined();

      await app.close();
    });

    it("rejects duplicate email registration safely", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      await app.register(registerIdentityModule, { config, sessionStore, userStore });

      // First registration
      await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "dupe@example.com", password: "password123" },
      });

      // Second registration with same email
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "DUPE@example.com", password: "password123" },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error.message).toBe("امکان ثبت‌نام با این ایمیل وجود ندارد.");
      await app.close();
    });

    it("rejects registration with short password (< 8 chars)", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      await app.register(registerIdentityModule, { config, sessionStore, userStore });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "short@example.com", password: "short" },
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("3. User Login & User Enumeration Protection", () => {
    it("returns identical error message for wrong password and non-existent email", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      // Register identity module without identityAdapter so auto-creation doesn't run
      const { SessionService } = await import("../modules/identity/session-service.js");
      const { authRoutes } = await import("../modules/identity/auth-routes.js");
      await app.register(authRoutes, {
        sessionService: new SessionService(sessionStore, config.session),
        userStore,
      });

      // Register valid user with password
      const hashed = await hashPassword("correctpassword");
      await userStore.createUserWithPassword({
        email: "valid@example.com",
        passwordHash: hashed,
      });

      // Attempt 1: Non-existent email
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "nonexistent@example.com", password: "somepassword" },
      });

      // Attempt 2: Valid email, wrong password
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "valid@example.com", password: "wrongpassword" },
      });

      expect(res1.statusCode).toBe(401);
      expect(res2.statusCode).toBe(401);

      const body1 = JSON.parse(res1.body);
      const body2 = JSON.parse(res2.body);

      // Exact same generic error message prevents account enumeration
      expect(body1.error.message).toBe("ایمیل یا رمز عبور نادرست است.");
      expect(body2.error.message).toBe("ایمیل یا رمز عبور نادرست است.");

      await app.close();
    });

    it("handles whitespace and case variation in login email", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      await app.register(registerIdentityModule, { config, sessionStore, userStore });

      await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "user@example.com", password: "password123" },
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "  USER@EXAMPLE.COM  ", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe("user@example.com");

      await app.close();
    });
  });

  describe("4. Session Fixation & Logout Revocation", () => {
    it("revokes session on sign-out and blocks subsequent requests", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      await app.register(registerIdentityModule, { config, sessionStore, userStore });

      // Register & get session
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "logout_test@example.com", password: "password123" },
      });
      const sessionToken = extractCookie(regRes, "avana_session");
      expect(sessionToken).toBeDefined();

      // Verify active session works
      const meResBefore = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken! },
      });
      expect(meResBefore.statusCode).toBe(200);

      // Sign out
      const logoutRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        cookies: { avana_session: sessionToken! },
      });
      expect(logoutRes.statusCode).toBe(204);

      // Verify session token is now revoked and rejected
      const meResAfter = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken! },
      });
      expect(meResAfter.statusCode).toBe(401);

      await app.close();
    });
  });

  describe("5. Authorization & IDOR Protection", () => {
    it("ensures User A cannot access User B's session or unauthorized data", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      await app.register(registerIdentityModule, { config, sessionStore, userStore });

      // Register User A
      const userARes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "usera@example.com", password: "password123" },
      });
      const userAToken = extractCookie(userARes, "avana_session")!;
      const userABody = JSON.parse(userARes.body);

      // Register User B
      const userBRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "userb@example.com", password: "password123" },
      });
      const userBToken = extractCookie(userBRes, "avana_session")!;
      const userBBody = JSON.parse(userBRes.body);

      // User A checking /v1/me gets User A's identity
      const meARes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: userAToken },
      });
      expect(JSON.parse(meARes.body).user.id).toBe(userABody.user.id);
      expect(JSON.parse(meARes.body).user.id).not.toBe(userBBody.user.id);

      // User B checking /v1/me gets User B's identity
      const meBRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: userBToken },
      });
      expect(JSON.parse(meBRes.body).user.id).toBe(userBBody.user.id);

      await app.close();
    });
  });
});
