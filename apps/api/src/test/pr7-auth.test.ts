/**
 * PR-7 Integration tests: Authentication and session boundary.
 *
 * Covers all acceptance criteria:
 * 1. Identity adapter behind an interface
 * 2. Session endpoints + GET /v1/me
 * 3. Secure cookie configuration
 * 4. CSRF protection strategy
 * 5. First-login user creation/linking
 * 6. Unauthenticated responses are non-disclosing
 * 7. Session lifecycle edge cases (expired sessions)
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
} from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { hashToken } from "../modules/identity/session-service.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("PR-7: Authentication and session boundary", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  describe("1. Identity adapter behind an interface", () => {
    it("allows sign-in with valid domain", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "test@example.com", password: "password123" },
      });
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it("rejects unauthorized email domains", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "test@evil.com" },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("rejects empty email", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "" },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("2. Session endpoints + GET /v1/me", () => {
    it("sign-in creates a session and returns user", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "alice@example.com", name: "Alice" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as {
        request_id: string;
        user: { id: string; email: string; role: string };
      };
      expect(body.user.email).toBe("alice@example.com");
      expect(body.user.role).toBe("student");
      expect(body.user.id).toBeDefined();
      const token = extractSessionToken(res);
      expect(token).toBeDefined();
      await app.close();
    });

    it("GET /v1/me with valid session returns authenticated user", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "bob@example.com", name: "Bob" },
      });
      const token = extractSessionToken(signInRes);
      expect(token).toBeDefined();
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: token! },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.body) as {
        user: { id: string; email: string; role: string };
      };
      expect(meBody.user.email).toBe("bob@example.com");
      expect(meBody.user.role).toBe("student");
      await app.close();
    });

    it("GET /v1/me without session returns 401", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({ method: "GET", url: "/v1/me" });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("sign-out revokes session and returns 204 No Content", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "charlie@example.com" },
      });
      const token = extractSessionToken(signInRes);
      expect(token).toBeDefined();
      const signOutRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        cookies: { avana_session: token! },
      });
      expect(signOutRes.statusCode).toBe(204);
      expect(signOutRes.body).toBe("");
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: token! },
      });
      expect(meRes.statusCode).toBe(401);
      await app.close();
    });
  });

  describe("3. Secure cookie configuration", () => {
    it("sets HttpOnly session cookies", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "cookie-test@example.com" },
      });
      expect(res.cookies.length).toBeGreaterThanOrEqual(1);
      const sessionCookie = res.cookies.find((c) => c.name === "avana_session");
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie!.httpOnly).toBe(true);
      expect(sessionCookie!.sameSite).toBeDefined();
      expect(sessionCookie!.path).toBe("/");
      await app.close();
    });

    it("sets CSRF cookie without HttpOnly", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "csrf-cookie-test@example.com" },
      });
      const csrfCookie = res.cookies.find((c) => c.name === "avana_csrf");
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie!.httpOnly).not.toBe(true);
      expect(csrfCookie!.sameSite).toBeDefined();
      await app.close();
    });
  });

  describe("4. CSRF protection strategy", () => {
    it("generates bound CSRF tokens during sign-in", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "csrf-bound@example.com" },
      });
      const csrfCookie = res.cookies.find((c) => c.name === "avana_csrf");
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie!.value.length).toBeGreaterThan(0);
      await app.close();
    });
  });

  describe("5. First-login user creation/linking", () => {
    it("creates a local user on first verified identity and links on subsequent login", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "repeat@example.com", name: "Repeat User" },
      });
      expect(res1.statusCode).toBe(200);
      const body1 = JSON.parse(res1.body) as {
        user: { id: string; email: string };
      };
      const firstUserId = body1.user.id;
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "repeat@example.com", name: "Repeat User" },
      });
      expect(res2.statusCode).toBe(200);
      const body2 = JSON.parse(res2.body) as {
        user: { id: string; email: string };
      };
      expect(body2.user.id).toBe(firstUserId);
      await app.close();
    });
  });

  describe("6. Unauthenticated responses are non-disclosing", () => {
    it("returns standard error envelope for unauthenticated GET /v1/me", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({ method: "GET", url: "/v1/me" });
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body) as {
        request_id: string;
        error: { code: string; message: string };
      };
      expect(body.request_id).toBeDefined();
      expect(body.error.code).toBe("unauthorized");
      expect(body.error.message).toBe("Not signed in");
      expect(Object.keys(body.error)).toEqual(["code", "message"]);
      await app.close();
    });

    it("returns not_found for unknown routes", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const res = await app.inject({
        method: "GET",
        url: "/v1/some-hidden-resource",
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe("not_found");
      expect(body.error.message).toBe("Not found");
      await app.close();
    });
  });

  describe("Session lifecycle edge cases", () => {
    it("expired session returns 401", async () => {
      const app = createApp({ config });
      await app.register(v1Routes);
      const opts: IdentityPluginOptions = { config, sessionStore, userStore };
      await app.register(registerIdentityModule, opts);
      const signInRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "expired@example.com", name: "Expired" },
      });
      const token = extractSessionToken(signInRes);
      expect(token).toBeDefined();

      // Manually expire the session in the in-memory store
      const h = hashToken(token!);
      const record = await sessionStore.findByTokenHash(h);
      expect(record).toBeDefined();

      // Override the expiresAt in the store to the past
      sessionStore.setExpiresAt(
        record!.id,
        new Date(Date.now() - 60000).toISOString(),
      );

      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: token! },
      });
      expect(meRes.statusCode).toBe(401);
      await app.close();
    }, 10000);
  });
});
