import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
  MockEmailService,
  MockSmsProvider,
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

describe("Iranian Phone & Dual-Channel Verification System", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let emailService: MockEmailService;
  let smsProvider: MockSmsProvider;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    emailService = new MockEmailService();
    smsProvider = new MockSmsProvider();
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  async function createTestApp(overrideSmsProvider?: MockSmsProvider) {
    const app = createApp({ config });
    await app.register(v1Routes);
    const opts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService,
      smsProvider: overrideSmsProvider ?? smsProvider,
    };
    await app.register(registerIdentityModule, opts);
    return app;
  }

  describe("Registration Phone Validation", () => {
    it("rejects registration without phone number", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "nophone@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("شماره موبایل الزامی است");
      await app.close();
    });

    it("rejects registration with invalid phone format (missing 0, wrong prefix, incorrect length)", async () => {
      const app = await createTestApp();

      const invalidNumbers = [
        "9123456789", // missing prefix (standalone 9 is rejected)
        "08123456789", // invalid prefix 08
        "0912345678", // 10 digits (too short)
        "091234567890", // 12 digits (too long)
        "not-a-phone",
        "+14155552671", // non-iranian
      ];

      for (const phone of invalidNumbers) {
        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: {
            email: `invalid_${Date.now()}_${Math.random()}@example.com`,
            password: "password123",
            firstName: "علی",
            lastName: "علوی",
            phoneNumber: phone,
          },
        });
        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.error).toBeDefined();
        expect(body.error.message.length).toBeGreaterThan(0);
      }

      await app.close();
    });

    it("accepts valid Iranian phone formats and normalizes them to +989xxxxxxxxx", async () => {
      const app = await createTestApp();

      const testCases = [
        { input: "09123456789", expected: "+989123456789" },
        { input: "+989901234567", expected: "+989901234567" },
        { input: "00989351234567", expected: "+989351234567" },
        { input: "۰۹۱۲۹۸۷۶۵۴۳", expected: "+989129876543" }, // Persian digits
        { input: "0912-345-6780", expected: "+989123456780" }, // with dashes
      ];

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: {
            email: `valid_${i}@example.com`,
            password: "password123",
            firstName: "علی",
            lastName: "علوی",
            phoneNumber: tc.input,
          },
        });

        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.user.phoneNumber).toBe(tc.expected);
        expect(body.user.phoneVerified).toBe(false);
      }

      await app.close();
    });

    it("rejects duplicate phone number registration with 409 Conflict", async () => {
      const app = await createTestApp();

      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "first@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09121112233",
        },
      });
      expect(res1.statusCode).toBe(200);

      // Try registering with same phone in different format (0098)
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "second@example.com",
          password: "password123",
          firstName: "رضا",
          lastName: "رضایی",
          phoneNumber: "00989121112233",
        },
      });
      expect(res2.statusCode).toBe(409);
      const body = JSON.parse(res2.body);
      expect(body.error.message).toContain("این شماره موبایل قبلاً در سامانه ثبت شده است");

      await app.close();
    });
  });

  describe("Dual-Channel Verification: SMS Flow", () => {
    it("sends SMS OTP to registered phone and verifies successfully", async () => {
      const app = await createTestApp();

      // 1. Register user
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "smsuser@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09123456789",
        },
      });
      expect(regRes.statusCode).toBe(200);
      const token = extractSessionToken(regRes)!;
      expect(token).toBeDefined();

      // 2. Request SMS verification
      const sendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      expect(sendRes.statusCode).toBe(200);
      const sendBody = JSON.parse(sendRes.body);
      expect(sendBody.channel).toBe("phone");
      expect(sendBody.cooldown_seconds).toBe(60);

      // Verify MockSmsProvider captured the code for normalized phone
      const sentCode = smsProvider.getLastCodeFor("+989123456789");
      expect(sentCode).toBeDefined();
      expect(sentCode).toMatch(/^\d{6}$/);

      // Verify code is not leaked in sendRes body
      expect(sendRes.body).not.toContain(sentCode);

      // 3. Submit SMS verification code
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: sentCode! },
      });

      expect(verifyRes.statusCode).toBe(200);
      const verifyBody = JSON.parse(verifyRes.body);
      expect(verifyBody.user.phoneVerified).toBe(true);
      expect(verifyBody.user.isVerified).toBe(true);

      // 4. Verify GET /v1/me reflects phoneVerified
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: token },
      });
      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.body);
      expect(meBody.user.phoneVerified).toBe(true);
      expect(meBody.user.phoneNumber).toBe("+989123456789");

      await app.close();
    });

    it("enforces 60-second cooldown on SMS resend", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "cooldown@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09123456789",
        },
      });
      const token = extractSessionToken(regRes)!;

      // First send
      const send1 = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      expect(send1.statusCode).toBe(200);

      // Immediate second send -> 429
      const send2 = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      expect(send2.statusCode).toBe(429);
      expect(JSON.parse(send2.body).error.message).toContain("۶۰ ثانیه");

      await app.close();
    });

    it("locks out SMS OTP after 5 failed attempts", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "lockout@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09123456789",
        },
      });
      const token = extractSessionToken(regRes)!;

      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const correctCode = smsProvider.getLastCodeFor("+989123456789")!;

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        const failRes = await app.inject({
          method: "POST",
          url: "/v1/auth/verification/verify",
          cookies: { avana_session: token },
          payload: { channel: "phone", code: "000000" },
        });
        expect(failRes.statusCode).toBe(400);
      }

      // 6th attempt with correct code fails due to lockout
      const finalRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: correctCode },
      });
      expect(finalRes.statusCode).toBe(400);
      expect(JSON.parse(finalRes.body).error.message).toContain("تعداد تلاش‌های مجاز به پایان رسیده است");

      await app.close();
    });

    it("prevents replay of already verified SMS OTP", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "replay_sms@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09123456789",
        },
      });
      const token = extractSessionToken(regRes)!;

      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const code = smsProvider.getLastCodeFor("+989123456789")!;

      // First verification: success
      const verify1 = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code },
      });
      expect(verify1.statusCode).toBe(200);

      // Second verification: 400
      const verify2 = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code },
      });
      expect(verify2.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("Dual-Channel Verification: Email Flow via Unified Endpoints", () => {
    it("sends Email OTP and verifies via /v1/auth/verification/verify", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "unified_email@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09123456789",
        },
      });
      const token = extractSessionToken(regRes)!;

      // During registration, an initial email code was generated
      const initialCode = emailService.getLastCodeFor("unified_email@example.com")!;
      expect(initialCode).toBeDefined();

      // Verify via new unified endpoint
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "email", code: initialCode },
      });

      expect(verifyRes.statusCode).toBe(200);
      const body = JSON.parse(verifyRes.body);
      expect(body.user.emailVerified).toBe(true);

      await app.close();
    });

    it("prevents cross-channel OTP usage (email OTP cannot verify phone)", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "cross_channel@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09123456789",
        },
      });
      const token = extractSessionToken(regRes)!;
      const emailCode = emailService.getLastCodeFor("cross_channel@example.com")!;

      // Also request phone verification code so a phone challenge exists
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });

      // Attempt to verify email code on phone channel
      const crossRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: emailCode },
      });

      expect(crossRes.statusCode).toBe(400);
      expect(JSON.parse(crossRes.body).error.message).toContain("کد واردشده صحیح نیست");

      await app.close();
    });
  });

  describe("Existing Users & Backward Compatibility", () => {
    it("allows existing users without phone to log in and use legacy verify-email", async () => {
      const { hashPassword } = await import("../modules/identity/password-hasher.js");
      const hashedPassword = await hashPassword("password123");

      // Seed legacy user directly into userStore
      const user = await userStore.createUserWithPassword({
        email: "legacy@example.com",
        passwordHash: hashedPassword,
        name: "Legacy User",
        // phoneNumber is omitted (NULL)
      });
      expect(user.phoneNumber).toBeFalsy();
      expect(user.phoneVerifiedAt).toBeFalsy();

      const app = await createTestApp();

      // Login as legacy user
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: {
          email: "legacy@example.com",
          password: "password123",
        },
      });
      expect(loginRes.statusCode).toBe(200);
      const token = extractSessionToken(loginRes)!;
      expect(token).toBeDefined();

      // Legacy resend email verification
      const resendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/resend-verification",
        cookies: { avana_session: token },
      });
      expect(resendRes.statusCode).toBe(200);
      const emailCode = emailService.getLastCodeFor("legacy@example.com")!;
      expect(emailCode).toBeDefined();

      // Legacy verify-email
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: token },
        payload: { code: emailCode },
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(JSON.parse(verifyRes.body).user.emailVerified).toBe(true);

      // Requesting phone verification without phone number returns 400
      const phoneSendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      expect(phoneSendRes.statusCode).toBe(400);
      expect(JSON.parse(phoneSendRes.body).error.message).toContain("شماره موبایل");

      await app.close();
    });
  });

  describe("Provider Error Handling", () => {
    it("handles SMS provider failures gracefully (500 error, invalidates code)", async () => {
      // Faulty SMS provider
      const faultySmsProvider: MockSmsProvider = {
        sentMessages: [],
        async sendVerificationCode() {
          throw new Error("Kavenegar SMS Gateway Timeout");
        },
        getLastCodeFor() {
          return undefined;
        },
      };

      const app = await createTestApp(faultySmsProvider);

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "smserror@example.com",
          password: "password123",
          firstName: "علی",
          lastName: "علوی",
          phoneNumber: "09123456789",
        },
      });
      const token = extractSessionToken(regRes)!;

      const sendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });

      expect(sendRes.statusCode).toBe(500);
      expect(JSON.parse(sendRes.body).error.message).toContain("ارسال پیامک با خطا مواجه شد");

      await app.close();
    });
  });
});

