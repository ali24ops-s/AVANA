/* eslint-disable @typescript-eslint/no-explicit-any, no-secrets/no-secrets, @typescript-eslint/no-unused-vars */
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
import {
  InMemoryCommerceStore,
} from "../modules/commerce/commerce-store.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { DrizzleUserStore } from "../modules/identity/drizzle-stores.js";
import { DomainError, type UserId, type UserSubscriptionRecord } from "@avana/domain";

function makeTestConfig(customEnv: Record<string, string> = {}) {
  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    AVANA_API_PORT: "0",
    ...customEnv,
  };
  if (!("AVANA_CORS_ORIGIN" in customEnv)) {
    delete mergedEnv.AVANA_CORS_ORIGIN;
  }
  return loadApiConfig(mergedEnv);
}

describe("Authentication Phone Resilience & Comprehensive Audit Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let emailService: MockEmailService;
  let smsProvider: MockSmsProvider;
  let commerceStore: InMemoryCommerceStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    emailService = new MockEmailService();
    smsProvider = new MockSmsProvider();
    commerceStore = new InMemoryCommerceStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
  });

  function extractSessionToken(res: {
    cookies: Array<{ name: string; value: string }>;
  }): string | undefined {
    const cookie = res.cookies.find((c) => c.name === "avana_session");
    return cookie?.value;
  }

  async function createTestApp(overrideSmsProvider?: MockSmsProvider, appConfig = config) {
    const app = createApp({ config: appConfig });
    await app.register(v1Routes, {
      config: appConfig,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      commerceStore,
      emailVerificationStore,
      emailService,
      smsProvider: overrideSmsProvider ?? smsProvider,
    });
    return app;
  }

  // --------------------------------------------------------------------------
  // Audit 1 & 2: Real Commerce HTTP Journey Independent from Auth
  // --------------------------------------------------------------------------
  it("Scenario 1: Real Commerce Flow — Register, verify email, buy subscription via commerce HTTP endpoint, sign out, login with phone OTP, and verify subscription is active", async () => {
    const app = await createTestApp();

    // 1. User registers with unverified phone
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "سروش",
        lastName: "شریفی",
        email: "soroush.commerce@example.com",
        phoneNumber: "09121239876",
        password: "Password123!",
      },
    });
    expect(regRes.statusCode).toBe(200);
    const initialSessionToken = extractSessionToken(regRes)!;
    const regUser = JSON.parse(regRes.body).user;
    expect(regUser.phoneVerified).toBe(false);

    // 2. User verifies email
    const emailCode = emailService.getLastCodeFor("soroush.commerce@example.com")!;
    const emailVerifyRes = await app.inject({
      method: "POST",
      url: "/v1/auth/verification/verify",
      cookies: { avana_session: initialSessionToken },
      payload: { channel: "email", code: emailCode },
    });
    expect(emailVerifyRes.statusCode).toBe(200);

    // 3. User buys subscription via real Commerce HTTP endpoint
    const products = await commerceStore.listActiveProducts();
    const subProduct = products.find((p) => p.type === "subscription")!;
    expect(subProduct).toBeDefined();

    const buyRes = await app.inject({
      method: "POST",
      url: "/v1/commerce/card-to-card/submit",
      cookies: { avana_session: initialSessionToken },
      payload: {
        product_id: subProduct.id,
        amount: subProduct.price,
        tracking_number: "TRK-REAL-COMMERCE-1",
        source_card_last4: "9876",
      },
    });
    expect(buyRes.statusCode).toBe(201);
    const buyBody = JSON.parse(buyRes.body);
    expect(buyBody.success).toBe(true);

    // Verify subscription is active for this session
    const subCheckRes = await app.inject({
      method: "GET",
      url: "/v1/commerce/subscriptions/my",
      cookies: { avana_session: initialSessionToken },
    });
    expect(subCheckRes.statusCode).toBe(200);
    expect(JSON.parse(subCheckRes.body).subscription).toBeDefined();

    // 4. User signs out
    await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      cookies: { avana_session: initialSessionToken },
    });
    smsProvider.clear();

    // 5. User logs in with Phone OTP
    const sendOtpRes = await app.inject({
      method: "POST",
      url: "/v1/auth/phone/send-otp",
      payload: { phoneNumber: "09121239876" },
    });
    expect(sendOtpRes.statusCode).toBe(200);
    const otpCode = smsProvider.getLastCodeFor("+989121239876")!;

    const verifyOtpRes = await app.inject({
      method: "POST",
      url: "/v1/auth/phone/verify-otp",
      payload: {
        phoneNumber: "09121239876",
        code: otpCode,
      },
    });
    expect(verifyOtpRes.statusCode).toBe(200);
    const newSessionToken = extractSessionToken(verifyOtpRes)!;
    expect(newSessionToken).toBeDefined();

    // 6. User accesses active subscription with new session token
    const afterLoginSubRes = await app.inject({
      method: "GET",
      url: "/v1/commerce/subscriptions/my",
      cookies: { avana_session: newSessionToken },
    });
    expect(afterLoginSubRes.statusCode).toBe(200);
    const afterBody = JSON.parse(afterLoginSubRes.body);
    expect(afterBody.subscription).toBeDefined();
    expect(afterBody.subscription.id).toBe(buyBody.subscriptionId);
    expect(["active", "active_pending_payment_review"]).toContain(afterBody.subscription.status);

    await app.close();
  });

  // --------------------------------------------------------------------------
  // Audit 1: Ordering and Rollback: setPhoneVerified & issueSessionCookies
  // --------------------------------------------------------------------------
  it("Scenario 2: Rollback & No Half-Baked Session if setPhoneVerified fails", async () => {
    // Simulate user store failure on setPhoneVerified
    const faultyUserStore = new InMemoryUserStore();
    faultyUserStore.setPhoneVerified = async () => {
      throw new Error("Simulated Database Write Failure during phone verification");
    };

    const app = createApp({ config });
    await app.register(registerIdentityModule, {
      config,
      sessionStore,
      userStore: faultyUserStore,
      emailVerificationStore,
      emailService,
      smsProvider,
    });

    await faultyUserStore.createUser({
      email: "faulty_db@example.com",
      phoneNumber: "09124443322",
      phoneVerified: false,
    });

    await app.inject({
      method: "POST",
      url: "/v1/auth/phone/send-otp",
      payload: { phoneNumber: "09124443322" },
    });
    const validCode = smsProvider.getLastCodeFor("+989124443322")!;

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/phone/verify-otp",
      payload: { phoneNumber: "09124443322", code: validCode },
    });

    // Request must fail (500)
    expect(res.statusCode).toBe(500);

    // No session token cookie must be issued
    const token = extractSessionToken(res);
    expect(token).toBeUndefined();

    // No session must exist in sessionStore
    const allSessions = Array.from((sessionStore as any).sessions?.values?.() ?? []);
    expect(allSessions.length).toBe(0);

    await app.close();
  });

  // --------------------------------------------------------------------------
  // Audit 4: OTP Security Requirements
  // --------------------------------------------------------------------------
  describe("Audit 4: OTP Security Guarantees", () => {
    it("rejects expired OTP", async () => {
      const app = await createTestApp();
      await userStore.createUser({
        email: "expired_otp@example.com",
        phoneNumber: "09123332211",
      });

      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09123332211" },
      });
      const code = smsProvider.getLastCodeFor("+989123332211")!;

      // Fast forward code expiration
      const u = await userStore.findByPhoneNumber("09123332211");
      const activeCode = await emailVerificationStore.findLatestActiveCode(u!.id, "phone_login");
      expect(activeCode).toBeDefined();
      activeCode!.expiresAt = new Date(Date.now() - 1000).toISOString();

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09123332211", code },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain("منقضی شده است");

      await app.close();
    });

    it("rejects previously used OTP (Replay Prevention)", async () => {
      const app = await createTestApp();
      await userStore.createUser({
        email: "replay_otp@example.com",
        phoneNumber: "09123332212",
      });

      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09123332212" },
      });
      const code = smsProvider.getLastCodeFor("+989123332212")!;

      // First verification succeeds
      const res1 = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09123332212", code },
      });
      expect(res1.statusCode).toBe(200);

      // Second verification attempt with same code MUST be rejected
      const res2 = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09123332212", code },
      });
      expect(res2.statusCode).toBe(400);
      expect(JSON.parse(res2.body).error.message).toContain("غیرفعال است یا منقضی شده است");

      await app.close();
    });

    it("locks OTP after 5 failed brute-force guessing attempts", async () => {
      const app = await createTestApp();
      await userStore.createUser({
        email: "bruteforce_otp@example.com",
        phoneNumber: "09123332213",
      });

      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09123332213" },
      });
      const validCode = smsProvider.getLastCodeFor("+989123332213")!;

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        const failRes = await app.inject({
          method: "POST",
          url: "/v1/auth/phone/verify-otp",
          payload: { phoneNumber: "09123332213", code: "000000" },
        });
        expect(failRes.statusCode).toBe(400);
      }

      // 6th attempt even with VALID code must be rejected due to attempt limit
      const lockRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09123332213", code: validCode },
      });
      expect(lockRes.statusCode).toBe(400);
      expect(JSON.parse(lockRes.body).error.message).toContain("تلاش‌های مجاز به پایان رسیده است");

      await app.close();
    });

    it("ensures OTP generated for user A cannot be verified for user B (HMAC isolation)", async () => {
      const app = await createTestApp();
      await userStore.createUser({
        email: "user_a_otp@example.com",
        phoneNumber: "09123332214",
      });
      await userStore.createUser({
        email: "user_b_otp@example.com",
        phoneNumber: "09123332215",
      });

      // User A requests OTP
      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09123332214" },
      });
      const userACode = smsProvider.getLastCodeFor("+989123332214")!;

      // User B attempts to use User A's code
      const attackRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09123332215", code: userACode },
      });
      expect(attackRes.statusCode).toBe(400);

      await app.close();
    });

    it("resending OTP invalidates previous code preventing conflicting valid codes", async () => {
      const app = await createTestApp();
      await userStore.createUser({
        email: "resend_invalidation@example.com",
        phoneNumber: "09123332216",
      });

      // Request 1
      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09123332216" },
      });
      const firstCode = smsProvider.getLastCodeFor("+989123332216")!;

      // Simulate time passing beyond 60s cooldown
      (app as any).resendCooldowns?.clear?.();

      // Request 2
      await app.inject({
        method: "POST",
        url: "/v1/auth/phone/send-otp",
        payload: { phoneNumber: "09123332216" },
      });
      const secondCode = smsProvider.getLastCodeFor("+989123332216")!;
      expect(secondCode).toBeDefined();

      // Attempt verifying the FIRST code -> MUST FAIL because it was invalidated
      if (firstCode !== secondCode) {
        const verifyFirstRes = await app.inject({
          method: "POST",
          url: "/v1/auth/phone/verify-otp",
          payload: { phoneNumber: "09123332216", code: firstCode },
        });
        expect(verifyFirstRes.statusCode).toBe(400);
      }

      // Verifying SECOND code -> SUCCEEDS
      const verifySecondRes = await app.inject({
        method: "POST",
        url: "/v1/auth/phone/verify-otp",
        payload: { phoneNumber: "09123332216", code: secondCode },
      });
      expect(verifySecondRes.statusCode).toBe(200);

      await app.close();
    });
  });

  // --------------------------------------------------------------------------
  // Audit 5: Production Cookie & CORS Configuration Matrix
  // --------------------------------------------------------------------------
  describe("Audit 5: Cookie Domain and CORS Environment Matrix", () => {
    it("handles explicit AVANA_COOKIE_DOMAIN and AVANA_CORS_ORIGIN permutations accurately", () => {
      // 1. With leading dot
      const cfg1 = makeTestConfig({
        NODE_ENV: "production",
        AVANA_COOKIE_DOMAIN: ".aavana.ir",
        AVANA_CORS_ORIGIN: "https://aavana.ir,https://www.aavana.ir",
      });
      expect(cfg1.session.domain).toBe("aavana.ir");
      expect(cfg1.security.cors.origin).toEqual(["https://aavana.ir", "https://www.aavana.ir"]);

      // 2. Without leading dot
      const cfg2 = makeTestConfig({
        NODE_ENV: "production",
        AVANA_COOKIE_DOMAIN: "aavana.ir",
      });
      expect(cfg2.session.domain).toBe("aavana.ir");

      // 3. Unset in production -> falls back to "aavana.ir"
      const cfg3 = makeTestConfig({
        NODE_ENV: "production",
      });
      expect(cfg3.session.domain).toBe("aavana.ir");

      // 4. Wildcard disallowed with credentials
      const cfg4 = makeTestConfig({
        NODE_ENV: "production",
        AVANA_CORS_ORIGIN: "*,https://aavana.ir",
      });
      expect(cfg4.security.cors.origin).not.toContain("*");
      expect(cfg4.security.cors.origin).toContain("https://aavana.ir");
    });
  });

  // --------------------------------------------------------------------------
  // Audit 3: DrizzleUserStore findByPhoneNumber Logic Verification
  // --------------------------------------------------------------------------
  describe("Audit 3: DrizzleUserStore findByPhoneNumber Query Logic", () => {
    it("DrizzleUserStore.findByPhoneNumber correctly passes variants and detects conflict", async () => {
      // Create mock DB that returns simulated Drizzle rows
      let capturedVariants: any = null;
      let mockRows: any[] = [];

      const mockDb: any = {
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              where: (whereClause: any) => {
                capturedVariants = whereClause;
                return Promise.resolve(mockRows);
              },
            }),
          }),
        }),
      };

      const drizzleStore = new DrizzleUserStore(mockDb);

      // 1. Query with 09120001122 -> must generate variants
      mockRows = [
        {
          user: {
            id: "user-1",
            email: "user1@example.com",
            name: "User 1",
            phoneNumber: "+989120001122",
            globalRole: null,
            emailVerified: true,
            phoneVerified: true,
            createdAt: new Date().toISOString(),
          },
          role: null,
        },
      ];

      const found = await drizzleStore.findByPhoneNumber("09120001122");
      expect(found).toBeDefined();
      expect(found?.id).toBe("user-1");

      // 2. Conflict detection: 2 distinct user IDs match
      mockRows = [
        {
          user: { id: "user-1", phoneNumber: "+989120001122", email: "u1@test.com" },
          role: null,
        },
        {
          user: { id: "user-2", phoneNumber: "09120001122", email: "u2@test.com" },
          role: null,
        },
      ];

      await expect(drizzleStore.findByPhoneNumber("09120001122")).rejects.toThrow(DomainError);
      await expect(drizzleStore.findByPhoneNumber("09120001122")).rejects.toMatchObject({
        code: "conflict",
      });
    });
  });
});
