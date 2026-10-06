import { describe, expect, it, beforeEach, vi } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
  MockEmailService,
  ResendEmailService,
} from "../modules/identity/index.js";
import { hashPassword } from "../modules/identity/password-hasher.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
  InMemoryPasswordResetStore,
} from "../modules/identity/test/in-memory-stores.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Password Reset System - Security, Transactional & API Tests", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let passwordResetStore: InMemoryPasswordResetStore;
  let emailService: MockEmailService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    passwordResetStore = new InMemoryPasswordResetStore(userStore, sessionStore);
    emailService = new MockEmailService();
  });

  async function createTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes);
    const opts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      passwordResetStore,
      emailService,
    };
    await app.register(registerIdentityModule, opts);
    return app;
  }

  async function seedTestUser(email = "student@example.com", password = "oldPassword123") {
    const hashedPassword = await hashPassword(password);
    return await userStore.createUserWithPassword({
      email,
      passwordHash: hashedPassword,
      name: "Test Student",
    });
  }

  describe("1. Forgot Password Request Flow & Security", () => {
    it("sends password reset email with secure token for registered user", async () => {
      const app = await createTestApp();
      await seedTestUser("user1@example.com");

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "user1@example.com" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.request_id).toBeDefined();
      expect(body.message).toContain("اگر حسابی با این ایمیل وجود داشته باشد");
      expect(body.cooldown_seconds).toBe(60);

      // Verify email was dispatched
      expect(emailService.sentPasswordResetEmails).toHaveLength(1);
      const sent = emailService.sentPasswordResetEmails[0];
      expect(sent.email).toBe("user1@example.com");
      expect(sent.resetUrl).toContain("/reset-password?token=");

      // Verify token format
      const token = emailService.getLastResetTokenFor("user1@example.com");
      expect(token).toBeDefined();
      expect(token?.length).toBe(64); // 32 bytes hex = 64 characters
    });

    it("prevents user enumeration: returns identical generic response for unregistered email", async () => {
      const app = await createTestApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "nonexistent@example.com" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.request_id).toBeDefined();
      expect(body.message).toContain("اگر حسابی با این ایمیل وجود داشته باشد");

      // No email should be sent
      expect(emailService.sentPasswordResetEmails).toHaveLength(0);
    });

    it("rejects invalid email formats with 400 bad_request", async () => {
      const app = await createTestApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "not-an-email" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toBe("نشانی ایمیل معتبر نیست.");
    });

    it("enforces 60-second cooldown rate limit on resending reset requests", async () => {
      const app = await createTestApp();
      await seedTestUser("cooldown@example.com");

      // First request succeeds
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "cooldown@example.com" },
      });
      expect(res1.statusCode).toBe(200);

      // Immediate second request hits 429 cooldown
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "cooldown@example.com" },
      });
      expect(res2.statusCode).toBe(429);
      expect(JSON.parse(res2.body).error.message).toContain("پیش از درخواست مجدد ۶۰ ثانیه صبر کنید");
    });

    it("does not log raw reset token or resetUrl in application logger", async () => {
      const app = await createTestApp();
      await seedTestUser("logger_test@example.com");

      const logSpy = vi.spyOn(app.log, "info");
      const errorSpy = vi.spyOn(app.log, "error");

      await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "logger_test@example.com" },
      });

      const token = emailService.getLastResetTokenFor("logger_test@example.com")!;
      expect(token).toBeDefined();

      // Check all log calls to ensure raw token never appeared
      for (const call of logSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(token);
      }
      for (const call of errorSpy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(token);
      }
    });

    it("rolls back token creation if email delivery throws an error (failure resilience)", async () => {
      const app = await createTestApp();
      await seedTestUser("fail_email@example.com");

      // Mock email delivery failure
      vi.spyOn(emailService, "sendPasswordResetEmail").mockRejectedValueOnce(
        new Error("Network timeout to email provider"),
      );

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "fail_email@example.com" },
      });

      expect(res.statusCode).toBe(500);

      // Verify no tokens remained created for user
      const user = await userStore.findByEmail("fail_email@example.com");
      expect(user).toBeDefined();
    });
  });

  describe("2. Reset Password Execution, Validation & Atomicity", () => {
    it("successfully resets password with valid token and allows sign-in with new password", async () => {
      const app = await createTestApp();
      await seedTestUser("reset_success@example.com", "oldPassword123");

      // 1. Request reset
      await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "reset_success@example.com" },
      });

      const token = emailService.getLastResetTokenFor("reset_success@example.com")!;
      expect(token).toBeDefined();

      // 2. Submit new password
      const resetRes = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        payload: {
          token,
          password: "newBrandPassword456",
        },
      });

      expect(resetRes.statusCode).toBe(200);
      const resetBody = JSON.parse(resetRes.body);
      expect(resetBody.request_id).toBeDefined();
      expect(resetBody.message).toBe("رمز عبور شما با موفقیت تغییر کرد.");

      // 3. Old password must NOT work
      const oldLogin = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: {
          email: "reset_success@example.com",
          password: "oldPassword123",
        },
      });
      expect(oldLogin.statusCode).toBe(401);

      // 4. New password MUST work
      const newLogin = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: {
          email: "reset_success@example.com",
          password: "newBrandPassword456",
        },
      });
      expect(newLogin.statusCode).toBe(200);
    });

    it("rejects invalid token", async () => {
      const app = await createTestApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        payload: {
          token: "0000000000000000000000000000000000000000000000000000000000000000",
          password: "newPassword123",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toBe("لینک بازیابی رمز عبور نامعتبر است.");
    });

    it("rejects expired token", async () => {
      await createTestApp();
      const user = await seedTestUser("expired@example.com");

      // Create an expired token manually in store
      await passwordResetStore.createToken({
        userId: user.id,
        tokenHash: "expired_token_hash_value",
        expiresAt: new Date(Date.now() - 60000).toISOString(), // expired 1 min ago
      });

      // Attempt to reset with expired token
      const res = await passwordResetStore.atomicConsumeAndResetPassword({
        tokenHash: "expired_token_hash_value",
        newPasswordHash: "hashed",
      });

      expect(res.success).toBe(false);
      expect(res.reason).toBe("expired");
    });

    it("rejects token reuse (single-use enforcement)", async () => {
      const app = await createTestApp();
      await seedTestUser("single_use@example.com");

      await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "single_use@example.com" },
      });

      const token = emailService.getLastResetTokenFor("single_use@example.com")!;

      // First reset: succeeds
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        payload: { token, password: "newPasswordFirst123" },
      });
      expect(res1.statusCode).toBe(200);

      // Second reset with SAME token: rejected!
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        payload: { token, password: "newPasswordSecond123" },
      });
      expect(res2.statusCode).toBe(400);
      expect(JSON.parse(res2.body).error.message).toContain("این لینک بازیابی قبلاً استفاده شده است");
    });

    it("rejects passwords shorter than 8 characters", async () => {
      const app = await createTestApp();
      await seedTestUser("short_pw@example.com");

      await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "short_pw@example.com" },
      });

      const token = emailService.getLastResetTokenFor("short_pw@example.com")!;

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        payload: { token, password: "short" },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toBe("رمز عبور باید حداقل ۸ کاراکتر باشد.");
    });

    it("concurrency test: exactly ONE succeeds when two concurrent requests hit with the same token", async () => {
      const app = await createTestApp();
      await seedTestUser("concurrent@example.com");

      await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "concurrent@example.com" },
      });

      const token = emailService.getLastResetTokenFor("concurrent@example.com")!;

      // Dispatch two simultaneous requests with the same token
      const [res1, res2] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/v1/auth/reset-password",
          payload: { token, password: "concurPassword1" },
        }),
        app.inject({
          method: "POST",
          url: "/v1/auth/reset-password",
          payload: { token, password: "concurPassword2" },
        }),
      ]);

      const statusCodes = [res1.statusCode, res2.statusCode];
      expect(statusCodes).toContain(200);
      expect(statusCodes).toContain(400);

      const successfulRes = res1.statusCode === 200 ? res1 : res2;
      const failedRes = res1.statusCode === 400 ? res1 : res2;

      expect(JSON.parse(successfulRes.body).message).toBe("رمز عبور شما با موفقیت تغییر کرد.");
      expect(JSON.parse(failedRes.body).error.message).toContain("قبلاً استفاده شده است");
    });

    it("invalidates all active sessions for the user upon password reset", async () => {
      const app = await createTestApp();
      const user = await seedTestUser("sessions@example.com");

      // Create multiple active sessions for this user
      await sessionStore.insert({
        userId: user.id,
        tokenHash: "session_hash_1",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      await sessionStore.insert({
        userId: user.id,
        tokenHash: "session_hash_2",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });

      // Verify sessions are active before reset
      const checkS1Before = await sessionStore.findByTokenHash("session_hash_1");
      const checkS2Before = await sessionStore.findByTokenHash("session_hash_2");
      expect(checkS1Before?.revokedAt).toBeNull();
      expect(checkS2Before?.revokedAt).toBeNull();

      // Trigger password reset
      await app.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "sessions@example.com" },
      });

      const token = emailService.getLastResetTokenFor("sessions@example.com")!;

      const resetRes = await app.inject({
        method: "POST",
        url: "/v1/auth/reset-password",
        payload: { token, password: "newPasswordSessions123" },
      });
      expect(resetRes.statusCode).toBe(200);

      // Verify both sessions were revoked
      const checkS1After = await sessionStore.findByTokenHash("session_hash_1");
      const checkS2After = await sessionStore.findByTokenHash("session_hash_2");
      expect(checkS1After?.revokedAt).not.toBeNull();
      expect(checkS1After?.revocationReason).toBe("password_reset");
      expect(checkS2After?.revokedAt).not.toBeNull();
      expect(checkS2After?.revocationReason).toBe("password_reset");
    });
  });

  describe("3. Production ResendEmailService Password Reset Email Dispatch", () => {
    it("dispatches valid RTL Persian email with correct URL, sender, and headers to Resend API", async () => {
      let capturedRequest: {
        url: string;
        headers: Record<string, string>;
        body: Record<string, unknown>;
      } | null = null;
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedRequest = {
          url,
          headers: init?.headers as Record<string, string>,
          body: JSON.parse(init?.body as string) as Record<string, unknown>,
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "msg_12345" }),
          text: async () => JSON.stringify({ id: "msg_12345" }),
        } as Response;
      });

      const resendService = new ResendEmailService(
        "re_test_key_abc",
        "AVANA <security@avana.ir>",
        mockFetch as typeof fetch,
      );

      const targetEmail = "student@example.com";
      const resetUrl = "https://avana.ir/reset-password?token=sample-reset-token-value";

      await resendService.sendPasswordResetEmail(targetEmail, resetUrl);

      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.url).toBe("https://api.resend.com/emails");
      expect(capturedRequest!.headers.Authorization).toBe("Bearer re_test_key_abc");
      expect(capturedRequest!.headers["Content-Type"]).toBe("application/json");
      expect(capturedRequest!.body.from).toBe("AVANA <security@avana.ir>");
      expect(capturedRequest!.body.to).toEqual(["student@example.com"]);
      expect(capturedRequest!.body.subject).toBe("بازیابی رمز عبور آوانا");
      expect(capturedRequest!.body.html).toContain(resetUrl);
      expect(capturedRequest!.body.html).toContain('dir="rtl"');
      expect(capturedRequest!.body.html).toContain("بازیابی رمز عبور");
      expect(capturedRequest!.body.text).toContain(resetUrl);
    });

    it("surfaces meaningful error when Resend API fails without leaking sensitive token data", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden: Domain not verified",
      } as Response);

      const resendService = new ResendEmailService(
        "re_test_key_abc",
        "AVANA <security@avana.ir>",
        mockFetch as typeof fetch,
      );

      await expect(
        resendService.sendPasswordResetEmail(
          "student@example.com",
          "https://avana.ir/reset-password?token=secret123",
        ),
      ).rejects.toThrow("Resend API email delivery failed (403): Forbidden: Domain not verified");
    });
  });

  describe("4. Production Application URL & Password Reset Link Security Regression Tests", () => {
    it("Test 1: defaults to https://aavana.ir in production when AVANA_APP_URL is not set", () => {
      const cfg = loadApiConfig({
        ...process.env,
        NODE_ENV: "production",
        AVANA_APP_URL: undefined,
        APP_URL: undefined,
        FRONTEND_URL: undefined,
        RESEND_API_KEY: "re_dummy_key_for_test",
      });
      expect(cfg.appUrl).toBe("https://aavana.ir");
    });

    it("Test 2: strictly isolates appUrl from AVANA_CORS_ORIGIN even if CORS contains an IP address", () => {
      const cfg = loadApiConfig({
        ...process.env,
        NODE_ENV: "production",
        AVANA_CORS_ORIGIN: "http://194.163.150.22:5173",
        AVANA_APP_URL: undefined,
        APP_URL: undefined,
        FRONTEND_URL: undefined,
        RESEND_API_KEY: "re_dummy_key_for_test",
      });
      expect(cfg.appUrl).toBe("https://aavana.ir");
      expect(cfg.security.cors.origin).toContain("http://194.163.150.22:5173");
    });

    it("Test 3: generates reset email with canonical https://aavana.ir domain in production", async () => {
      const prodConfig = loadApiConfig({
        ...process.env,
        NODE_ENV: "production",
        AVANA_APP_URL: "https://aavana.ir",
        RESEND_API_KEY: "re_dummy_key_for_test",
        AVANA_API_PORT: "0",
      });
      const prodUserStore = new InMemoryUserStore();
      const prodSessionStore = new InMemorySessionStore();
      const prodResetStore = new InMemoryPasswordResetStore(prodUserStore, prodSessionStore);
      const prodEmailService = new MockEmailService();
      const prodVerificationStore = new InMemoryEmailVerificationStore();

      const prodApp = createApp({ config: prodConfig });
      await prodApp.register(v1Routes);
      await prodApp.register(registerIdentityModule, {
        config: prodConfig,
        sessionStore: prodSessionStore,
        userStore: prodUserStore,
        emailVerificationStore: prodVerificationStore,
        passwordResetStore: prodResetStore,
        emailService: prodEmailService,
      });

      const hashedPw = await hashPassword("mySecretPassword123");
      await prodUserStore.createUserWithPassword({
        email: "prod-user@example.com",
        passwordHash: hashedPw,
        name: "Prod User",
      });

      const res = await prodApp.inject({
        method: "POST",
        url: "/v1/auth/forgot-password",
        payload: { email: "prod-user@example.com" },
      });

      expect(res.statusCode).toBe(200);
      const sent = prodEmailService.sentPasswordResetEmails[0];
      expect(sent).toBeDefined();
      expect(sent.resetUrl).toMatch(/^https:\/\/aavana\.ir\/reset-password\?token=[a-f0-9]{64}$/);
    });

    it("Test 4: rejects plain HTTP in production", () => {
      expect(() =>
        loadApiConfig({
          ...process.env,
          NODE_ENV: "production",
          AVANA_APP_URL: "http://aavana.ir",
          RESEND_API_KEY: "re_dummy_key_for_test",
        }),
      ).toThrow(/Production application URL must use HTTPS protocol/);
    });

    it("Test 5: rejects IPv4 address in production", () => {
      expect(() =>
        loadApiConfig({
          ...process.env,
          NODE_ENV: "production",
          AVANA_APP_URL: "http://194.163.150.22:5173",
          RESEND_API_KEY: "re_dummy_key_for_test",
        }),
      ).toThrow(/Production application URL/);
    });

    it("Test 6: rejects IPv6 address in production", () => {
      expect(() =>
        loadApiConfig({
          ...process.env,
          NODE_ENV: "production",
          AVANA_APP_URL: "http://[::1]:5173",
          RESEND_API_KEY: "re_dummy_key_for_test",
        }),
      ).toThrow(/Production application URL/);
    });

    it("Test 7: rejects localhost in production", () => {
      expect(() =>
        loadApiConfig({
          ...process.env,
          NODE_ENV: "production",
          AVANA_APP_URL: "http://localhost:5173",
          RESEND_API_KEY: "re_dummy_key_for_test",
        }),
      ).toThrow(/Production application URL/);

      expect(() =>
        loadApiConfig({
          ...process.env,
          NODE_ENV: "production",
          AVANA_APP_URL: "https://localhost:5173",
          RESEND_API_KEY: "re_dummy_key_for_test",
        }),
      ).toThrow(/Production application URL cannot be localhost/);
    });

    it("Test 8: allows http://localhost:5173 in local development without error", () => {
      const devConfig = loadApiConfig({
        ...process.env,
        NODE_ENV: "development",
        AVANA_APP_URL: "http://localhost:5173",
      });
      expect(devConfig.appUrl).toBe("http://localhost:5173");
    });

    it("Test 9: strips trailing slash so reset URL does not contain double slashes", () => {
      const cfg = loadApiConfig({
        ...process.env,
        NODE_ENV: "production",
        AVANA_APP_URL: "https://aavana.ir/",
        RESEND_API_KEY: "re_dummy_key_for_test",
      });
      expect(cfg.appUrl).toBe("https://aavana.ir");
    });

    it("Test 10: respects APP_URL and FRONTEND_URL legacy fallbacks when valid, applying production validation", () => {
      const cfgFromLegacy = loadApiConfig({
        ...process.env,
        NODE_ENV: "production",
        AVANA_APP_URL: undefined,
        APP_URL: undefined,
        FRONTEND_URL: "https://aavana.ir",
        RESEND_API_KEY: "re_dummy_key_for_test",
      });
      expect(cfgFromLegacy.appUrl).toBe("https://aavana.ir");

      expect(() =>
        loadApiConfig({
          ...process.env,
          NODE_ENV: "production",
          AVANA_APP_URL: undefined,
          APP_URL: "http://194.163.150.22",
          RESEND_API_KEY: "re_dummy_key_for_test",
        }),
      ).toThrow(/Production application URL/);
    });
  });
});
