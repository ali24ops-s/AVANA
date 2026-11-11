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
import { hashPassword } from "../modules/identity/password-hasher.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Unified Contact Verification & Phone+Password Login", () => {
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

  async function createTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes);
    const opts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService,
      smsProvider,
    };
    await app.register(registerIdentityModule, opts);
    return app;
  }

  describe("Contact Verification & Profile Modification", () => {
    it("successfully verifies email via /v1/auth/verification/verify", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("pass12345");
      await userStore.createUser({
        email: "alice@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989121111111",
        emailVerified: false,
        phoneVerified: false,
      });

      // Login to get session
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "alice@example.com", password: "pass12345" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      // Send verification code
      const sendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email" },
      });
      expect(sendRes.statusCode).toBe(200);
      expect(emailService.sentEmails).toHaveLength(1);
      const code = emailService.sentEmails[0].code;

      // Verify with code
      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email", code },
      });
      expect(verifyRes.statusCode).toBe(200);
      const body = JSON.parse(verifyRes.body);
      expect(body.user.emailVerified).toBe(true);
    });

    it("fails verification with incorrect code", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("pass12345");
      const user = await userStore.createUser({
        email: "bob@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989122222222",
        emailVerified: false,
        phoneVerified: false,
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "bob@example.com", password: "pass12345" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email" },
      });

      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email", code: "000000" },
      });
      expect(verifyRes.statusCode).toBe(400);
      const updatedUser = await userStore.findById(user.id);
      expect(updatedUser?.emailVerified).toBe(false);
    });

    it("successfully verifies mobile phone via /v1/auth/verification/verify", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("pass12345");
      await userStore.createUser({
        email: "charlie@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989123333333",
        emailVerified: true,
        phoneVerified: false,
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "charlie@example.com", password: "pass12345" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      const sendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone" },
      });
      expect(sendRes.statusCode).toBe(200);
      expect(smsProvider.sentMessages).toHaveLength(1);
      const code = smsProvider.sentMessages[0].code;

      const verifyRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone", code },
      });
      expect(verifyRes.statusCode).toBe(200);
      const body = JSON.parse(verifyRes.body);
      expect(body.user.phoneVerified).toBe(true);
    });

    it("enforces cooldown on resending OTP and locks code after 5 wrong attempts", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("pass12345");
      await userStore.createUser({
        email: "dave@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989124444444",
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "dave@example.com", password: "pass12345" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      // 1st send
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone" },
      });

      // Immediate 2nd send should be rate limited (429)
      const resendRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone" },
      });
      expect(resendRes.statusCode).toBe(429);

      // Attempt 5 wrong codes
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: "POST",
          url: "/v1/auth/verification/verify",
          headers: { cookie: `avana_session=${sessionToken}` },
          payload: { channel: "phone", code: `11111${i}` },
        });
      }

      // 6th attempt: should be rejected as attempts exceeded
      const finalTry = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone", code: smsProvider.sentMessages[0].code },
      });
      expect(finalTry.statusCode).toBe(400);
      expect(JSON.parse(finalTry.body).error.message).toContain("به پایان رسیده است");
    });

    it("resets phoneVerified when user updates their verified phone number in profile", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("pass12345");
      const user = await userStore.createUser({
        email: "eve@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989125555555",
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "eve@example.com", password: "pass12345" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      // Update phone number
      const updateRes = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { phoneNumber: "09126666666" },
      });
      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.body);
      expect(body.user.phoneNumber).toBe("+989126666666");
      expect(body.user.phoneVerified).toBe(false);

      const updatedUser = await userStore.findById(user.id);
      expect(updatedUser?.phoneVerified).toBe(false);
      expect(updatedUser?.phoneVerifiedAt).toBeNull();
    });

    it("resets emailVerified when user updates their verified email in profile", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("pass12345");
      const user = await userStore.createUser({
        email: "frank@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989127777777",
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "frank@example.com", password: "pass12345" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      const updateRes = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { email: "frank_new@example.com" },
      });
      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.body);
      expect(body.user.email).toBe("frank_new@example.com");
      expect(body.user.emailVerified).toBe(false);

      const updatedUser = await userStore.findById(user.id);
      expect(updatedUser?.emailVerified).toBe(false);
      expect(updatedUser?.emailVerifiedAt).toBeNull();
    });

    it("prevents updating phone number to one already belonging to another account (Conflict 409)", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("pass12345");
      await userStore.createUser({
        email: "user_a@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989128888888",
      });
      await userStore.createUser({
        email: "user_b@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989129999999",
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "user_b@example.com", password: "pass12345" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      const conflictRes = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { phoneNumber: "09128888888" },
      });
      expect(conflictRes.statusCode).toBe(409);
      expect(JSON.parse(conflictRes.body).error.message).toContain("قبلاً برای حساب دیگری");
    });
  });

  describe("Sign In with Phone + Password", () => {
    it("successfully logs in with email and password", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("mypassword123");
      await userStore.createUser({
        email: "emailuser@example.com",
        passwordHash: pwHash,
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "emailuser@example.com", password: "mypassword123" },
      });
      expect(res.statusCode).toBe(200);
      expect(extractSessionToken(res)).toBeDefined();
    });

    it("rejects email login with wrong password", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("mypassword123");
      await userStore.createUser({
        email: "emailuser2@example.com",
        passwordHash: pwHash,
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "emailuser2@example.com", password: "wrongpassword" },
      });
      expect(res.statusCode).toBe(401);
      expect(extractSessionToken(res)).toBeUndefined();
    });

    it("successfully logs in with verified phone and password without sending any SMS", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("phonepass123");
      await userStore.createUser({
        email: "phonesuccess@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989123456789",
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      });

      // Clear any past sms calls
      smsProvider.sentVerificationCodes = [];

      // Test with 09123456789 format in identifier
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09123456789", password: "phonepass123" },
      });
      expect(res1.statusCode).toBe(200);
      const token1 = extractSessionToken(res1);
      expect(token1).toBeDefined();
      expect(JSON.parse(res1.body).user.email).toBe("phonesuccess@example.com");

      // Verify that NO SMS OTP was dispatched during phone + password sign-in!
      expect(smsProvider.sentVerificationCodes).toHaveLength(0);

      // Test with +989123456789 format in email property for backward compat
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "+989123456789", password: "phonepass123" },
      });
      expect(res2.statusCode).toBe(200);

      // Test with Persian digits ۰۹۱۲۳۴۵۶۷۸۹
      const res3 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "۰۹۱۲۳۴۵۶۷۸۹", password: "phonepass123" },
      });
      expect(res3.statusCode).toBe(200);

      // Still no SMS sent
      expect(smsProvider.sentVerificationCodes).toHaveLength(0);
    });

    it("rejects phone login with wrong password", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("phonepass123");
      await userStore.createUser({
        email: "wrongpw@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989123456789",
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09123456789", password: "incorrectpassword" },
      });
      expect(res.statusCode).toBe(401);
      expect(extractSessionToken(res)).toBeUndefined();
    });

    it("prevents phone login when phone number is NOT verified (403 Forbidden)", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("phonepass123");
      await userStore.createUser({
        email: "unverifiedphone@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989123456789",
        phoneVerified: false,
        phoneVerifiedAt: null,
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09123456789", password: "phonepass123" },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error.message).toContain("تأیید نشده است");
      expect(extractSessionToken(res)).toBeUndefined();
    });

    it("rejects phone login for non-existent account without disclosing user existence", async () => {
      const app = await createTestApp();
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09129999999", password: "somepassword" },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.message).toContain("نادرست است");
      expect(extractSessionToken(res)).toBeUndefined();
    });

    it("provides helpful message when account has no password configured", async () => {
      const app = await createTestApp();
      await userStore.createUser({
        email: "nopass@example.com",
        passwordHash: null,
        phoneNumber: "+989123456789",
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09123456789", password: "anypassword" },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.message).toContain("رمز عبور تنظیم نشده است");
    });
  });

  describe("Session Management & Security", () => {
    it("maintains session cookie across /v1/me, and revokes cleanly on /v1/auth/sign-out", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("sessionpass123");
      await userStore.createUser({
        email: "sessiontest@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989123456789",
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      });

      // 1. Log in with phone + password
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09123456789", password: "sessionpass123" },
      });
      expect(loginRes.statusCode).toBe(200);
      const sessionToken = extractSessionToken(loginRes)!;
      expect(sessionToken).toBeDefined();

      // Check cookie flags
      const cookieHeader = loginRes.cookies.find((c) => c.name === "avana_session");
      expect(cookieHeader?.httpOnly).toBe(true);

      // 2. Access /v1/me
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${sessionToken}` },
      });
      expect(meRes.statusCode).toBe(200);
      expect(JSON.parse(meRes.body).user.email).toBe("sessiontest@example.com");

      // 3. Log out via /v1/auth/sign-out
      const logoutRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        headers: { cookie: `avana_session=${sessionToken}` },
      });
      expect(logoutRes.statusCode).toBe(204);

      // 4. Access /v1/me after logout -> should be unauthorized (401)
      const meAfterLogout = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie: `avana_session=${sessionToken}` },
      });
      expect(meAfterLogout.statusCode).toBe(401);
    });

    it("prevents mass assignment tampering of emailVerifiedAt, phoneVerifiedAt, or role via PATCH /v1/auth/profile", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("userpass123");
      const user = await userStore.createUser({
        email: "tamper@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989125555555",
        emailVerified: false,
        phoneVerified: false,
        role: "student",
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { email: "tamper@example.com", password: "userpass123" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      // Attempt to tamper with role and verification timestamps
      const patchRes = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: {
          firstName: "کاربر",
          lastName: "دستکاری",
          role: "platform_admin",
          globalRole: "platform_admin",
          emailVerified: true,
          phoneVerified: true,
          emailVerifiedAt: new Date().toISOString(),
          phoneVerifiedAt: new Date().toISOString(),
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const updatedUser = await userStore.findById(user.id);
      expect(updatedUser?.role).toBe("student");
      expect(updatedUser?.globalRole).toBeFalsy();
      expect(updatedUser?.emailVerifiedAt).toBeNull();
      expect(updatedUser?.phoneVerifiedAt).toBeNull();
    });

    it("rejects profile updates without a valid session (401)", async () => {
      const app = await createTestApp();

      // No cookie
      const resNoCookie = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        payload: { firstName: "تست", lastName: "کاربر" },
      });
      expect(resNoCookie.statusCode).toBe(401);

      // Fake/invalid cookie
      const resBadCookie = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        headers: { cookie: "avana_session=fake_invalid_session_token" },
        payload: { firstName: "تست", lastName: "کاربر" },
      });
      expect(resBadCookie.statusCode).toBe(401);
    });

    it("authenticates verified phone with Persian digits and various prefix formats (+98, 0098, 09) without SMS", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("mySecretPass123");
      await userStore.createUser({
        email: "multiformat@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989129876543",
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      });

      // 1. With standard 09 format
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09129876543", password: "mySecretPass123" },
      });
      expect(res1.statusCode).toBe(200);

      // 2. With +98 format
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "+989129876543", password: "mySecretPass123" },
      });
      expect(res2.statusCode).toBe(200);

      // 3. With 0098 format
      const res3 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "00989129876543", password: "mySecretPass123" },
      });
      expect(res3.statusCode).toBe(200);

      // 4. With Persian digits: ۰۹۱۲۹۸۷۶۵۴۳
      const res4 = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "۰۹۱۲۹۸۷۶۵۴۳", password: "mySecretPass123" },
      });
      expect(res4.statusCode).toBe(200);

      // Crucial: No SMS dispatched across all 4 successful logins
      expect(smsProvider.sentMessages).toHaveLength(0);
    });

    it("resets phoneVerifiedAt to null upon phone update, blocks password login until re-verified, and invalidates previous OTP codes", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("securePass999");
      const user = await userStore.createUser({
        email: "reverify.phone@example.com",
        passwordHash: pwHash,
        phoneNumber: "+989121112233",
        phoneVerified: true,
        phoneVerifiedAt: new Date().toISOString(),
      });

      // Login to get session
      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "+989121112233", password: "securePass999" },
      });
      expect(loginRes.statusCode).toBe(200);
      const sessionToken = extractSessionToken(loginRes)!;

      // Send OTP code to the initial phone number
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone" },
      });
      expect(smsProvider.sentMessages).toHaveLength(1);
      const oldCode = smsProvider.sentMessages[0].code;

      // Update phone number to a new number
      const patchRes = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { phoneNumber: "09129998877" },
      });
      expect(patchRes.statusCode).toBe(200);

      const refreshedUser = await userStore.findById(user.id);
      expect(refreshedUser?.phoneNumber).toBe("+989129998877");
      expect(refreshedUser?.phoneVerifiedAt).toBeNull();
      expect(refreshedUser?.phoneVerified).toBe(false);

      // Attempt login with new phone + password before verifying: MUST return 403 Forbidden
      const unverifiedLoginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09129998877", password: "securePass999" },
      });
      expect(unverifiedLoginRes.statusCode).toBe(403);
      expect(JSON.parse(unverifiedLoginRes.body).error.message).toContain("شماره موبایل شما تأیید نشده است");

      // Attempt to verify with the OLD OTP code: MUST fail because previous codes were invalidated
      const verifyOldCodeRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone", code: oldCode },
      });
      expect(verifyOldCodeRes.statusCode).toBe(400);

      // Now send a fresh code to the new phone number
      const sendNewCodeRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone" },
      });
      expect(sendNewCodeRes.statusCode).toBe(200);
      expect(smsProvider.sentMessages).toHaveLength(2);
      const newCode = smsProvider.sentMessages[1].code;

      // Verify with the new code
      const verifyNewRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "phone", code: newCode },
      });
      expect(verifyNewRes.statusCode).toBe(200);
      expect(verifyNewRes.json().user.phoneVerified).toBe(true);

      // Now password login with new phone MUST succeed
      const verifiedLoginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "09129998877", password: "securePass999" },
      });
      expect(verifiedLoginRes.statusCode).toBe(200);
    });

    it("resets emailVerifiedAt to null upon email update and invalidates prior verification challenges", async () => {
      const app = await createTestApp();
      const pwHash = await hashPassword("emailPass123");
      const user = await userStore.createUser({
        email: "verified.initial@example.com",
        passwordHash: pwHash,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: { identifier: "verified.initial@example.com", password: "emailPass123" },
      });
      const sessionToken = extractSessionToken(loginRes)!;

      // Send code to initial email
      await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email" },
      });
      expect(emailService.sentEmails).toHaveLength(1);
      const oldEmailCode = emailService.sentEmails[0].code;

      // Update email
      const patchRes = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { email: "new.target@example.com" },
      });
      expect(patchRes.statusCode).toBe(200);

      const refreshedUser = await userStore.findById(user.id);
      expect(refreshedUser?.email).toBe("new.target@example.com");
      expect(refreshedUser?.emailVerifiedAt).toBeNull();
      expect(refreshedUser?.emailVerified).toBe(false);

      // Attempt to verify with OLD code: MUST fail
      const verifyOldCodeRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email", code: oldEmailCode },
      });
      expect(verifyOldCodeRes.statusCode).toBe(400);

      // Send new code to new email
      const sendNewRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/send",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email" },
      });
      expect(sendNewRes.statusCode).toBe(200);
      expect(emailService.sentEmails).toHaveLength(2);
      expect(emailService.sentEmails[1].email).toBe("new.target@example.com");
      const newEmailCode = emailService.sentEmails[1].code;

      // Verify with new code: MUST succeed
      const verifyNewRes = await app.inject({
        method: "POST",
        url: "/v1/auth/verification/verify",
        headers: { cookie: `avana_session=${sessionToken}` },
        payload: { channel: "email", code: newEmailCode },
      });
      expect(verifyNewRes.statusCode).toBe(200);
      expect(verifyNewRes.json().user.emailVerified).toBe(true);
    });
  });
});
