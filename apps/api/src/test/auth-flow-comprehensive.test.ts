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

describe("Comprehensive Auth Flow Suite", () => {
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

  describe("1. Registration Validation: 4 Required Fields (First Name, Last Name, Email, Phone)", () => {
    it("rejects registration without first name", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "",
          lastName: "محمدی",
          email: "test_nofirst@example.com",
          phoneNumber: "09121112233",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("نام الزامی است");
      await app.close();
    });

    it("rejects registration without last name", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "علی",
          lastName: "   ",
          email: "test_nolast@example.com",
          phoneNumber: "09121112233",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("نام خانوادگی الزامی است");
      await app.close();
    });

    it("rejects registration with whitespace-only first or last name", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "   ",
          lastName: "   ",
          email: "test_whitespace@example.com",
          phoneNumber: "09121112233",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("نام الزامی است");
      await app.close();
    });

    it("rejects registration without email", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "علی",
          lastName: "محمدی",
          phoneNumber: "09121112233",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("نشانی ایمیل معتبر نیست");
      await app.close();
    });

    it("rejects registration with invalid email format", async () => {
      const app = await createTestApp();
      const invalidEmails = ["invalid-email", "test@", "@domain.com", "test@domain"];

      for (const email of invalidEmails) {
        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: {
            firstName: "علی",
            lastName: "محمدی",
            email,
            phoneNumber: "09121112233",
            password: "password123",
          },
        });
        expect(res.statusCode).toBe(400);
      }
      await app.close();
    });

    it("rejects registration without phone number", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "علی",
          lastName: "محمدی",
          email: "nophone@example.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain("شماره موبایل الزامی است");
      await app.close();
    });

    it("rejects registration with invalid Iranian phone format", async () => {
      const app = await createTestApp();
      const invalidPhones = ["9123456789", "08123456789", "091234567", "0912345678901", "abc"];

      for (const phoneNumber of invalidPhones) {
        const res = await app.inject({
          method: "POST",
          url: "/v1/auth/register",
          payload: {
            firstName: "علی",
            lastName: "محمدی",
            email: `test_${Date.now()}@example.com`,
            phoneNumber,
            password: "password123",
          },
        });
        expect(res.statusCode).toBe(400);
      }
      await app.close();
    });

    it("rejects duplicate email with 409 Conflict", async () => {
      const app = await createTestApp();
      await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "کاربر",
          lastName: "اول",
          email: "duplicate@example.com",
          phoneNumber: "09121112233",
          password: "password123",
        },
      });

      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "کاربر",
          lastName: "دوم",
          email: "duplicate@example.com",
          phoneNumber: "09129998877",
          password: "password123",
        },
      });

      expect(res2.statusCode).toBe(409);
      expect(JSON.parse(res2.body).error.message).toContain("امکان ثبت‌نام با این ایمیل وجود ندارد");
      await app.close();
    });

    it("rejects duplicate phone number with 409 Conflict", async () => {
      const app = await createTestApp();
      await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "کاربر",
          lastName: "اول",
          email: "first_phone@example.com",
          phoneNumber: "09121112233",
          password: "password123",
        },
      });

      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "کاربر",
          lastName: "دوم",
          email: "second_phone@example.com",
          phoneNumber: "+989121112233", // Same phone in canonical format
          password: "password123",
        },
      });

      expect(res2.statusCode).toBe(409);
      expect(JSON.parse(res2.body).error.message).toContain("این شماره موبایل قبلاً در سامانه ثبت شده است");
      await app.close();
    });

    it("accepts valid registration with all 4 fields and stores normalized phone + full name", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "رضا",
          lastName: "حسینی",
          email: "reza.hosseini@example.com",
          phoneNumber: "۰۹۱۲۳۴۵۶۷۸۹", // Persian digits
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.name).toBe("رضا حسینی");
      expect(body.user.email).toBe("reza.hosseini@example.com");
      expect(body.user.phoneNumber).toBe("+989123456789");
      expect(body.user.emailVerified).toBe(false);
      expect(body.user.phoneVerified).toBe(false);
      expect(body.user.isVerified).toBe(false);

      await app.close();
    });
  });

  describe("2. Dual-Channel Verification Independence & Single Channel Sufficiency", () => {
    it("choosing Email verification ONLY sets emailVerifiedAt and satisfies isVerified", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "سارا",
          lastName: "راد",
          email: "sara.rad@example.com",
          phoneNumber: "09128887766",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // User requests Email verification code
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "email" },
      });
      const code = emailService.getLastCodeFor("sara.rad@example.com")!;

      // Verify Email code
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "email", code },
      });

      expect(verifyRes.statusCode).toBe(200);
      const body = JSON.parse(verifyRes.body);
      expect(body.user.emailVerified).toBe(true);
      expect(body.user.phoneVerified).toBe(false); // MUST remain false
      expect(body.user.isVerified).toBe(true); // Active access granted

      // Check DB user record directly
      const userInDb = await userStore.findByEmail("sara.rad@example.com");
      expect(userInDb?.emailVerifiedAt).toBeTruthy();
      expect(userInDb?.phoneVerifiedAt).toBeNull(); // Phone timestamp NEVER touched

      await app.close();
    });

    it("choosing Phone (SMS) verification ONLY sets phoneVerifiedAt and satisfies isVerified", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "امید",
          lastName: "نوری",
          email: "omid.nouri@example.com",
          phoneNumber: "09125554433",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // User requests SMS verification code
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const code = smsProvider.getLastCodeFor("+989125554433")!;

      // Verify Phone code
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code },
      });

      expect(verifyRes.statusCode).toBe(200);
      const body = JSON.parse(verifyRes.body);
      expect(body.user.phoneVerified).toBe(true);
      expect(body.user.emailVerified).toBe(false); // MUST remain false
      expect(body.user.isVerified).toBe(true); // Active access granted

      // Check DB user record directly
      const userInDb = await userStore.findByPhoneNumber("+989125554433");
      expect(userInDb?.phoneVerifiedAt).toBeTruthy();
      expect(userInDb?.emailVerifiedAt).toBeNull(); // Email timestamp NEVER touched

      await app.close();
    });
  });

  describe("3. Login Flows & phoneVerifiedAt Enforcement", () => {
    it("Scenario 1: Register -> only Email verification -> phone login MUST be rejected (403)", async () => {
      const app = await createTestApp();

      // 1. Register user
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "سارا",
          lastName: "اکبری",
          email: "sara_unverified_phone@example.com",
          phoneNumber: "09121110091",
          password: "Password123!",
        },
      });
      expect(regRes.statusCode).toBe(200);
      const token = extractSessionToken(regRes)!;

      // 2. Verify ONLY Email
      const emailCode = emailService.getLastCodeFor("sara_unverified_phone@example.com")!;
      const emailVerifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "email", code: emailCode },
      });
      expect(emailVerifyRes.statusCode).toBe(200);
      expect(JSON.parse(emailVerifyRes.body).user.emailVerified).toBe(true);
      expect(JSON.parse(emailVerifyRes.body).user.phoneVerified).toBe(false);

      smsProvider.clear();

      // 3. Attempt Phone Login OTP Request -> MUST BE REJECTED (403)
      const sendOtpRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09121110091" },
      });
      expect(sendOtpRes.statusCode).toBe(403);
      expect(JSON.parse(sendOtpRes.body).error.message).toContain("شماره موبایل این حساب کاربری هنوز تأیید نشده است");
      expect(smsProvider.sentMessages.length).toBe(0); // NO SMS SENT!

      // 4. Attempt Phone Login Verify OTP -> MUST ALSO BE REJECTED (403)
      const verifyOtpRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09121110091", code: "123456" },
      });
      expect(verifyOtpRes.statusCode).toBe(403);
      expect(JSON.parse(verifyOtpRes.body).error.message).toContain("شماره موبایل این حساب کاربری هنوز تأیید نشده است");

      await app.close();
    });

    it("Scenario 2: Register -> Phone verification -> phone login MUST succeed", async () => {
      const app = await createTestApp();

      // 1. Register user
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "حمید",
          lastName: "رضایی",
          email: "hamid_verified_phone@example.com",
          phoneNumber: "09121110092",
          password: "Password123!",
        },
      });
      expect(regRes.statusCode).toBe(200);
      const token = extractSessionToken(regRes)!;

      // 2. Verify Phone
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const phoneVerifyCode = smsProvider.getLastCodeFor("+989121110092")!;
      const phoneVerifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: phoneVerifyCode },
      });
      expect(phoneVerifyRes.statusCode).toBe(200);
      expect(JSON.parse(phoneVerifyRes.body).user.phoneVerified).toBe(true);

      // 3. Request Phone Login OTP -> MUST SUCCEED (200)
      const sendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09121110092" },
      });
      expect(sendRes.statusCode).toBe(200);
      expect(JSON.parse(sendRes.body).message).toContain("کد تأیید ورود برای شما ارسال شد");

      const loginCode = smsProvider.getLastCodeFor("+989121110092")!;
      expect(loginCode).toMatch(/^\d{6}$/);

      // 4. Verify Phone Login OTP -> MUST SUCCEED (200) and issue session
      const loginVerifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09121110092", code: loginCode },
      });
      expect(loginVerifyRes.statusCode).toBe(200);
      const loginBody = JSON.parse(loginVerifyRes.body);
      expect(loginBody.user.phoneNumber).toBe("+989121110092");
      expect(loginBody.user.phoneVerified).toBe(true);
      expect(extractSessionToken(loginVerifyRes)).toBeDefined();

      await app.close();
    });

    it("Scenario 3: Register -> Email verification -> email login MUST succeed", async () => {
      const app = await createTestApp();

      // 1. Register
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "مهدی",
          lastName: "کریمی",
          email: "mehdi.karimi@example.com",
          phoneNumber: "09129990011",
          password: "MyPassword123!",
        },
      });
      expect(regRes.statusCode).toBe(200);
      const token = extractSessionToken(regRes)!;

      // 2. Verify Email
      const emailCode = emailService.getLastCodeFor("mehdi.karimi@example.com")!;
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "email", code: emailCode },
      });

      // 3. Email + Password Login
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: {
          email: "mehdi.karimi@example.com",
          password: "MyPassword123!",
        },
      });

      expect(loginRes.statusCode).toBe(200);
      const body = JSON.parse(loginRes.body);
      expect(body.user.email).toBe("mehdi.karimi@example.com");
      expect(body.user.emailVerified).toBe(true);
      expect(extractSessionToken(loginRes)).toBeDefined();

      await app.close();
    });

    it("logs in with phone number + SMS OTP and normalizes various Iranian phone input formats (for verified phone)", async () => {
      const app = await createTestApp();

      // Register user with phone +989127778899
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "نیما",
          lastName: "آریایی",
          email: "nima@example.com",
          phoneNumber: "09127778899",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // Verify phone first
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const vCode = smsProvider.getLastCodeFor("+989127778899")!;
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: vCode },
      });

      // Test login with Persian digits format
      const sendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "۰۹۱۲۷۷۷۸۸۹۹" },
      });
      expect(sendRes.statusCode).toBe(200);
      expect(JSON.parse(sendRes.body).message).toContain("کد تأیید ورود");

      const sentCode = smsProvider.getLastCodeFor("+989127778899")!;
      expect(sentCode).toMatch(/^\d{6}$/);

      // Verify OTP and complete login using 00989... format
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: {
          phoneNumber: "00989127778899",
          code: sentCode,
        },
      });

      expect(verifyRes.statusCode).toBe(200);
      const verifyBody = JSON.parse(verifyRes.body);
      expect(verifyBody.user.phoneNumber).toBe("+989127778899");
      expect(verifyBody.user.name).toBe("نیما آریایی");
      expect(extractSessionToken(verifyRes)).toBeDefined();

      await app.close();
    });

    it("does NOT send OTP if phone number is not registered (404)", async () => {
      const app = await createTestApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09199999999" },
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error.message).toContain("حساب کاربری با این شماره موبایل یافت نشد");
      expect(smsProvider.sentMessages.length).toBe(0);

      await app.close();
    });

    it("prevents login with wrong OTP code (on verified phone)", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "تست",
          lastName: "کد اشتباه",
          email: "wrong_otp@example.com",
          phoneNumber: "09124443322",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // Verify phone
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const vCode = smsProvider.getLastCodeFor("+989124443322")!;
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: vCode },
      });

      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09124443322" },
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: {
          phoneNumber: "09124443322",
          code: "000000",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain("کد واردشده صحیح نیست");

      await app.close();
    });

    it("enforces 5-attempt lockout on login OTP", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "قفل",
          lastName: "تلاش",
          email: "lockout_login@example.com",
          phoneNumber: "09123332211",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // Verify phone
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const vCode = smsProvider.getLastCodeFor("+989123332211")!;
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: vCode },
      });

      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09123332211" },
      });
      const validCode = smsProvider.getLastCodeFor("+989123332211")!;

      // 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: "POST",
          url: "/v1/auth/phone/verify-otp",
          payload: { phoneNumber: "09123332211", code: "999999" },
        });
      }

      // 6th attempt with valid code is locked out
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09123332211", code: validCode },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain("تعداد تلاش‌های مجاز به پایان رسیده است");

      await app.close();
    });

    it("enforces 60-second cooldown on login OTP resend", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "محدودیت",
          lastName: "ارسال",
          email: "cooldown_login@example.com",
          phoneNumber: "09126665544",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // Verify phone
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const vCode = smsProvider.getLastCodeFor("+989126665544")!;
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: vCode },
      });

      const firstSend = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09126665544" },
      });
      expect(firstSend.statusCode).toBe(200);

      const secondSend = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09126665544" },
      });
      expect(secondSend.statusCode).toBe(429);
      expect(JSON.parse(secondSend.body).error.message).toContain("۶۰ ثانیه");

      await app.close();
    });
  });

  describe("4. OTP Purpose Isolation", () => {
    it("Scenario 4: Using phone verification OTP for phone login MUST be rejected", async () => {
      const app = await createTestApp();

      // Register user
      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "جداسازی",
          lastName: "ورود",
          email: "purpose_verify_to_login@example.com",
          phoneNumber: "09127654321",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // 1. Request Phone Verification OTP (channel: "phone")
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const verificationOtp = smsProvider.getLastCodeFor("+989127654321")!;
      expect(verificationOtp).toBeDefined();

      // 2. Attempt to use this verification OTP in /v1/auth/phone/verify-otp (phone login)
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: {
          phoneNumber: "09127654321",
          code: verificationOtp,
        },
      });

      // Must be rejected (either 403 because phone not verified yet, or 400 invalid code)
      expect([400, 403]).toContain(loginRes.statusCode);

      await app.close();
    });

    it("Scenario 5: Using phone login OTP for phone verification MUST be rejected", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "جداسازی",
          lastName: "هدف",
          email: "purpose_login_to_verify@example.com",
          phoneNumber: "09121234567",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;

      // 1. Verify phone initially so login OTP can be generated
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        cookies: { avana_session: token },
        payload: { channel: "phone" },
      });
      const initialVerifyCode = smsProvider.getLastCodeFor("+989121234567")!;
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: initialVerifyCode },
      });

      // 2. Request a Phone Login OTP (channel: "phone_login")
      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09121234567" },
      });
      const loginOtp = smsProvider.getLastCodeFor("+989121234567")!;

      // 3. Attempt to use this login OTP in /v1/auth/verification/verify (phone verification channel "phone")
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        cookies: { avana_session: token },
        payload: { channel: "phone", code: loginOtp },
      });

      expect(verifyRes.statusCode).toBe(400);

      await app.close();
    });
  });

  describe("5. Legacy Backward Compatibility", () => {
    it("preserves /v1/auth/verify-email and /v1/auth/resend-verification", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "قدیمی",
          lastName: "ایمیل",
          email: "legacy_verify@example.com",
          phoneNumber: "09120001122",
          password: "password123",
        },
      });
      const token = extractSessionToken(regRes)!;
      const initialCode = emailService.getLastCodeFor("legacy_verify@example.com")!;

      // Verify email via legacy endpoint
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verify-email",
        cookies: { avana_session: token },
        payload: { code: initialCode },
      });

      expect(verifyRes.statusCode).toBe(200);
      const body = JSON.parse(verifyRes.body);
      expect(body.user.emailVerified).toBe(true);

      await app.close();
    });
  });
});
