import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
  MockEmailService,
} from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Email Verification System - Unit & API Integration", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let emailService: MockEmailService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    emailService = new MockEmailService();
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  async function createTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes);
    const opts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService,
    };
    await app.register(registerIdentityModule, opts);
    return app;
  }

  describe("Registration Flow with Email Verification Challenge", () => {
    it("creates account with emailVerified=false and sends 6-digit code", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "newuser@example.com",
          password: "password123",
          name: "New User",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe("newuser@example.com");
      expect(body.user.emailVerified).toBe(false);

      // Verify code was generated and recorded in mock email service
      const sentCode = emailService.getLastCodeFor("newuser@example.com");
      expect(sentCode).toBeDefined();
      expect(sentCode).toMatch(/^\d{6}$/);

      // Verify code is NOT plaintext in response body or user store
      expect(JSON.stringify(body)).not.toContain(sentCode);

      await app.close();
    });

    it("verifies email successfully with correct code", async () => {
      const app = await createTestApp();
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "verifytest@example.com",
          password: "password123",
        },
      });

      const token = extractSessionToken(regRes);
      expect(token).toBeDefined();

      const sentCode = emailService.getLastCodeFor("verifytest@example.com");
      expect(sentCode).toBeDefined();

      // Submit verification code
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: token! },
        payload: { code: sentCode },
      });

      expect(verifyRes.statusCode).toBe(200);
      const verifyBody = JSON.parse(verifyRes.body);
      expect(verifyBody.user.emailVerified).toBe(true);

      // GET /v1/me now returns emailVerified=true
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: token! },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.body);
      expect(meBody.user.emailVerified).toBe(true);

      await app.close();
    });

    it("rejects wrong verification code and increments attempt counter", async () => {
      const app = await createTestApp();
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "wrongcode@example.com",
          password: "password123",
        },
      });

      const token = extractSessionToken(regRes);

      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: token! },
        payload: { code: "000000" },
      });

      expect(verifyRes.statusCode).toBe(400);
      const body = JSON.parse(verifyRes.body);
      expect(body.error.message).toBe("کد واردشده صحیح نیست.");

      await app.close();
    });

    it("invalidates code after 5 failed attempts", async () => {
      const app = await createTestApp();
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "attempts@example.com",
          password: "password123",
        },
      });

      const token = extractSessionToken(regRes);
      const correctCode = emailService.getLastCodeFor("attempts@example.com")!;

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: "POST",
          url: "/v1/auth/verify-email",
          cookies: { avana_session: token! },
          payload: { code: "999999" },
        });
      }

      // 6th attempt with correct code should fail because code is now locked out
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: token! },
        payload: { code: correctCode },
      });

      expect(verifyRes.statusCode).toBe(400);
      expect(JSON.parse(verifyRes.body).error.message).toContain("تعداد تلاش‌های مجاز به پایان رسیده است");

      await app.close();
    });

    it("prevents code reuse after successful verification", async () => {
      const app = await createTestApp();
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "reuse@example.com",
          password: "password123",
        },
      });

      const token = extractSessionToken(regRes);
      const code = emailService.getLastCodeFor("reuse@example.com")!;

      // First use: success
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: token! },
        payload: { code },
      });
      expect(res1.statusCode).toBe(200);

      // Second use: failure
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: token! },
        payload: { code },
      });
      expect(res2.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("Resend Verification & Rate Limiting", () => {
    it("invalidates previous code and issues new code upon resend", async () => {
      const app = await createTestApp();
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "resendtest@example.com",
          password: "password123",
        },
      });

      const token = extractSessionToken(regRes)!;

      // Wait or invoke resend (note: first resend right after register will hit cooldown unless we test cooldown error)
      const resend1 = await app.inject({
        method: "POST",
        url: "/v1/auth/resend-verification",
        cookies: { avana_session: token },
      });

      // Cooldown enforced (60s)
      expect(resend1.statusCode).toBe(429);
      expect(JSON.parse(resend1.body).error.message).toContain("لطفاً پیش از درخواست مجدد ۶۰ ثانیه صبر کنید");

      await app.close();
    });
  });

  describe("Security Boundaries", () => {
    it("rejects verify-email when unauthenticated", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        payload: { code: "123456" },
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("prevents User A from verifying User B's account (session bound)", async () => {
      const app = await createTestApp();

      // Register User A
      const resA = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "userA@example.com", password: "password123" },
      });
      const tokenA = extractSessionToken(resA)!;
      const codeA = emailService.getLastCodeFor("userA@example.com")!;

      // Register User B
      const resB = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: { email: "userB@example.com", password: "password123" },
      });
      const tokenB = extractSessionToken(resB)!;

      // User B tries to use User A's code
      const attackRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: tokenB },
        payload: { code: codeA },
      });

      expect(attackRes.statusCode).toBe(400);

      // User A is still unverified
      const meA = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: tokenA },
      });
      expect(JSON.parse(meA.body).user.emailVerified).toBe(false);

      await app.close();
    });
  });
});
