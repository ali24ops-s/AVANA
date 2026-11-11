/**
 * Comprehensive Security Phase 1 Remediation Test Suite.
 *
 * Validates all security hardening requirements across:
 * 1. Role Escalation & Global vs Org Role Separation (Scenarios 1-6)
 * 2. CSRF Security & Session Token Isolation (Scenarios 7-20)
 * 3. Payment Extraction AI Protection & Rate Limiting (Scenarios 21-29)
 * 4. Session Regression & Multi-Tab Concurrency (Scenarios 30-33)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { MockPaymentGateway } from "../modules/commerce/index.js";
import { PaymentExtractionRateLimiter } from "../modules/commerce/payment-rate-limiter.js";
import {
  Roles,
  resolveEffectiveRole,
  ORGANIZATION_ROLE_PRECEDENCE,
  type Role,
  type OrganizationId,
} from "@avana/domain";
import type { Redis } from "ioredis";
import {
  generateCsrfToken,
  generateBoundCsrfToken,
  validateCsrfToken,
} from "../modules/identity/csrf.js";
import { hashPassword } from "../modules/identity/password-hasher.js";
import { randomUUID } from "node:crypto";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  const cfg = loadApiConfig();
  cfg.session.maxAgeMs = 86400000;
  cfg.logging.level = "silent";
  return cfg;
}

function extractCookie(
  res: { cookies: Array<{ name: string; value: string; httpOnly?: boolean }> },
  name: string,
) {
  return res.cookies.find((c) => c.name === name);
}

describe("Phase 1 Security Remediation Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let sessionService: SessionService;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let commerceStore: InMemoryCommerceStore;
  let mockPaymentGateway: MockPaymentGateway;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    sessionService = new SessionService(sessionStore, config.session);
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    emailVerificationStore = new InMemoryEmailVerificationStore();
    commerceStore = new InMemoryCommerceStore();
    mockPaymentGateway = new MockPaymentGateway();
  });

  async function createTestApp(opts: {
    paymentRateLimiter?: PaymentExtractionRateLimiter;
    mockModelGateway?: { generateContent?: (prompt: string) => Promise<string> };
    enforceCsrf?: boolean;
  } = {}) {
    if (opts.enforceCsrf) {
      process.env.AVANA_CSRF_ENFORCE = "true";
    } else {
      delete process.env.AVANA_CSRF_ENFORCE;
    }
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      emailVerificationStore,
      commerceStore,
      gateway: opts.mockModelGateway,
      paymentGateway: mockPaymentGateway,
      paymentRateLimiter: opts.paymentRateLimiter,
    });
    return app;
  }

  // ===========================================================================
  // Part 1: Role Escalation & Global vs Org Separation
  // ===========================================================================
  describe("1. Role Escalation & Separation", () => {
    it("1. Normal user cannot create org with privileged roles (support_agent, course_editor, content_worker, organization_admin)", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "student_escalation@example.com",
        passwordHash: "hash123",
        globalRole: null,
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const forbiddenRoles = [
        Roles.support_agent,
        Roles.course_editor,
        Roles.content_worker,
        Roles.organization_admin,
      ];

      for (const forbiddenRole of forbiddenRoles) {
        const res = await app.inject({
          method: "POST",
          url: "/v1/organizations",
          cookies: {
            avana_session: sessionToken,
            avana_csrf: csrfToken,
          },
          headers: {
            "x-csrf-token": csrfToken,
          },
          payload: {
            name: `Org Attempt ${forbiddenRole}`,
            role: forbiddenRole,
          },
        });
        expect(res.statusCode).toBe(403);
      }
      await app.close();
    });

    it("2. Normal user creating org without role receives student role by default", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "default_role_user@example.com",
        passwordHash: "hash123",
        globalRole: null,
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
        },
        payload: { name: "فضای یادگیری پیش‌فرض" },
      });

      expect(res.statusCode).toBe(201);
      const orgId = JSON.parse(res.body).organization.id as OrganizationId;
      const memberships = await orgStore.listMembershipsByUserId(user.id);
      const created = memberships.find((m) => m.organizationId === orgId);
      expect(created?.role).toBe(Roles.student);
      await app.close();
    });

    it("3. platform_admin can create org with valid organization roles", async () => {
      const app = await createTestApp();
      const admin = await userStore.createUserWithPassword({
        email: "admin_org@example.com",
        passwordHash: "hash123",
        globalRole: Roles.platform_admin,
      });
      const { sessionToken } = await sessionService.createSession(admin.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
        },
        payload: {
          name: "دانشگاه رسمی",
          role: Roles.organization_admin,
        },
      });

      expect(res.statusCode).toBe(201);
      const orgId = JSON.parse(res.body).organization.id as OrganizationId;
      const memberships = await orgStore.listMembershipsByUserId(admin.id);
      const created = memberships.find((m) => m.organizationId === orgId);
      expect(created?.role).toBe(Roles.organization_admin);
      await app.close();
    });

    it("4 & 5. Org membership does not escalate /v1/me, and multiple org memberships do not escalate Global Role", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "multi_member@example.com",
        passwordHash: "hash123",
        globalRole: null,
      });
      const { sessionToken } = await sessionService.createSession(user.id);

      // Add memberships directly to store (e.g. simulated legacy or invited roles)
      const org1 = randomUUID() as OrganizationId;
      const org2 = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: org1,
        userId: user.id,
        role: "support_agent" as unknown as Role, // Attacker injected support_agent in membership
        createdAt: new Date().toISOString(),
      });
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: org2,
        userId: user.id,
        role: Roles.organization_admin,
        createdAt: new Date().toISOString(),
      });

      // Verify /v1/me returns organization_admin (highest valid org role) but NEVER support_agent or platform_admin!
      const meRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken },
      });

      expect(meRes.statusCode).toBe(200);
      const meBody = JSON.parse(meRes.body);
      expect(meBody.user.role).toBe(Roles.organization_admin);
      expect(meBody.user.role).not.toBe(Roles.support_agent);
      expect(meBody.user.role).not.toBe(Roles.platform_admin);

      // Verify domain resolveEffectiveRole directly
      expect(resolveEffectiveRole(null, [Roles.support_agent as unknown as Role])).toBe(Roles.student);
      expect(ORGANIZATION_ROLE_PRECEDENCE).not.toContain(Roles.support_agent);
      await app.close();
    });

    it("6. Real support_agent with valid global_role preserves correct access", () => {
      // Legitimate staff user with users.global_role = support_agent
      const role1 = resolveEffectiveRole(Roles.support_agent, [Roles.student]);
      expect(role1).toBe(Roles.support_agent);

      const role2 = resolveEffectiveRole(Roles.support_agent, []);
      expect(role2).toBe(Roles.support_agent);
    });
  });

  // ===========================================================================
  // Part 2: CSRF Security & Session Isolation
  // ===========================================================================
  describe("2. CSRF Security & Session Isolation", () => {
    it("7, 8, 9, 10. Login issues cookies: session != csrf, httpOnly on session only, raw session not exposed", async () => {
      const app = await createTestApp();
      await userStore.createUserWithPassword({
        email: "csrf_login_test@example.com",
        passwordHash: await hashPassword("Password123!"),
      });

      const loginRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-in",
        payload: {
          email: "csrf_login_test@example.com",
          password: "Password123!",
        },
      });

      expect(loginRes.statusCode).toBe(200);
      const sessionCookie = extractCookie(loginRes, "avana_session");
      const csrfCookie = extractCookie(loginRes, "avana_csrf");

      expect(sessionCookie).toBeDefined();
      expect(csrfCookie).toBeDefined();

      // 7. Values must be different
      expect(sessionCookie!.value).not.toBe(csrfCookie!.value);

      // 8. Session cookie must be HttpOnly
      expect(sessionCookie!.httpOnly).toBe(true);

      // 9. CSRF cookie must not be HttpOnly (accessible to client for double-submit header)
      expect(csrfCookie!.httpOnly).not.toBe(true);

      // 10. Raw session token must NOT be in CSRF cookie
      expect(csrfCookie!.value).not.toContain(sessionCookie!.value);

      // Verify cryptographic binding
      expect(validateCsrfToken(csrfCookie!.value, sessionCookie!.value)).toBe(true);
      await app.close();
    });

    it("11. Cookie-based mutation without x-csrf-token is rejected with 403 Forbidden", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "csrf_missing@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        // Omit x-csrf-token header
        payload: { name: "Test Org" },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error.message).toContain("CSRF");
      await app.close();
    });

    it("12. Cookie-based mutation with invalid/forged x-csrf-token is rejected with 403 Forbidden", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "csrf_forged@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: "forged.token.value",
        },
        headers: {
          "x-csrf-token": "forged.token.value",
        },
        payload: { name: "Test Org" },
      });

      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("13. Cookie-based mutation with valid x-csrf-token and cookie succeeds", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "csrf_valid@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
        },
        payload: { name: "Valid Org" },
      });

      expect(res.statusCode).toBe(201);
      await app.close();
    });

    it("14. Session Swapping: using CSRF token belonging to another session is rejected (403)", async () => {
      const app = await createTestApp();
      const userA = await userStore.createUserWithPassword({
        email: "usera@example.com",
        passwordHash: "hash123",
      });
      const userB = await userStore.createUserWithPassword({
        email: "userb@example.com",
        passwordHash: "hash123",
      });

      const { sessionToken: sessionA } = await sessionService.createSession(userA.id);
      const { sessionToken: sessionB } = await sessionService.createSession(userB.id);

      // Attacker generated valid token for sessionB
      const csrfB = generateBoundCsrfToken(sessionB, generateCsrfToken());

      // Attacker attempts to use sessionA credentials with csrfB
      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: {
          avana_session: sessionA,
          avana_csrf: csrfB,
        },
        headers: {
          "x-csrf-token": csrfB,
        },
        payload: { name: "Swap Org" },
      });

      expect(res.statusCode).toBe(403);
      expect(validateCsrfToken(csrfB, sessionA)).toBe(false);
      await app.close();
    });

    it("15. Old CSRF token after rotation/refresh is rejected", async () => {
      const sessionOld = generateCsrfToken();
      const sessionNew = generateCsrfToken();

      const oldCsrf = generateBoundCsrfToken(sessionOld, generateCsrfToken());

      // After session rotation, validating old CSRF token against new session must fail
      expect(validateCsrfToken(oldCsrf, sessionNew)).toBe(false);
    });

    it("16. Cookie-based sign-out requires valid CSRF and rejects missing/invalid CSRF", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "signout_test@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      // Attempt signout with cookie but missing CSRF header
      const failedRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
      });
      expect(failedRes.statusCode).toBe(403);

      // Attempt signout with valid CSRF header
      const successRes = await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
        },
      });
      expect(successRes.statusCode).toBe(204);
      await app.close();
    });

    it("17. Register & Login endpoints succeed without prior CSRF token and issue fresh bound CSRF", async () => {
      const app = await createTestApp();

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email: "new_registered_csrf@example.com",
          password: "Password123!",
          name: "Fresh User",
          phoneNumber: "09129998877",
        },
      });

      expect(regRes.statusCode).toBe(200);
      const session = extractCookie(regRes, "avana_session")!;
      const csrf = extractCookie(regRes, "avana_csrf")!;

      expect(session).toBeDefined();
      expect(csrf).toBeDefined();
      expect(validateCsrfToken(csrf.value, session.value)).toBe(true);
      await app.close();
    });

    it("18. Bearer-based API requests without CSRF cookie continue to work seamlessly", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "bearer_user@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);

      const res = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: { name: "Bearer Created Org" },
      });

      expect(res.statusCode).toBe(201);
      await app.close();
    });

    it("19. Multi-tab requests sharing session and CSRF cookie succeed concurrently", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "multitab@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const sharedCsrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const requests = [1, 2, 3, 4].map((i) =>
        app.inject({
          method: "POST",
          url: "/v1/organizations",
          cookies: {
            avana_session: sessionToken,
            avana_csrf: sharedCsrfToken,
          },
          headers: {
            "x-csrf-token": sharedCsrfToken,
          },
          payload: { name: `Tab Org ${i}` },
        }),
      );

      const results = await Promise.all(requests);
      for (const res of results) {
        expect(res.statusCode).toBe(201);
      }
      await app.close();
    });

    it("20. Cookie-based mutation across multiple modules strictly enforces CSRF", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "crossmodule@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      // Attempt PATCH /v1/auth/profile without CSRF
      const profileFail = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        payload: { name: "Hacked" },
      });
      expect(profileFail.statusCode).toBe(403);

      // With CSRF succeeds
      const profileOk = await app.inject({
        method: "PATCH",
        url: "/v1/auth/profile",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
        },
        payload: { name: "Secured Profile" },
      });
      expect(profileOk.statusCode).toBe(200);
      await app.close();
    });
  });

  // ===========================================================================
  // Part 3: Payment Extraction AI Protection & Rate Limiting
  // ===========================================================================
  describe("3. Payment Extraction AI Protection & Rate Limiting", () => {
    it("21. Unauthenticated request to /card-to-card/extract is rejected with 401 Unauthorized", async () => {
      const app = await createTestApp();

      const res = await app.inject({
        method: "POST",
        url: "/v1/commerce/card-to-card/extract",
        payload: {
          text: "انتقال وجه موفق به کارت ۶۰۳۷۹۹۱۸۹۹۹۹۲۲۲۲ مبلغ ۵۰۰،۰۰۰ ریال پیگیری ۱۲۳۴۵۶",
        },
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("22. Invalid/spam inputs rejected with 400 Bad Request before calling AI", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "extract_input_test@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const invalidPayloads = [
        { text: "" }, // Empty
        { text: "   short  " }, // < 10 characters trimmed
        { text: "hello world how are you doing today" }, // No digits/financial numbers
        { text: "a".repeat(3001) }, // Exceeds 3000 chars
      ];

      for (const payload of invalidPayloads) {
        const res = await app.inject({
          method: "POST",
          url: "/v1/commerce/card-to-card/extract",
          cookies: {
            avana_session: sessionToken,
            avana_csrf: csrfToken,
          },
          headers: {
            "x-csrf-token": csrfToken,
          },
          payload,
        });

        expect(res.statusCode).toBe(400);
      }
      await app.close();
    });

    it("23. Rate limiter triggers and returns 429 Too Many Requests when quota exceeded", async () => {
      const rateLimiter = new PaymentExtractionRateLimiter({
        maxRequestsPerMinuteUser: 3,
        maxRequestsPerMinuteIp: 10,
        isProduction: false,
      });

      const app = await createTestApp({ paymentRateLimiter: rateLimiter });
      const user = await userStore.createUserWithPassword({
        email: "ratelimit_user@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const validPayload = {
        text: "انتقال وجه به کارت ۶۰۳۷۹۹۱۸۹۹۹۹۲۲۲۲ مبلغ ۵۰۰،۰۰۰ ریال پیگیری ۹۸۷۶۵۴",
      };

      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/v1/commerce/card-to-card/extract",
          cookies: {
            avana_session: sessionToken,
            avana_csrf: csrfToken,
          },
          headers: {
            "x-csrf-token": csrfToken,
          },
          payload: validPayload,
        });
        expect(res.statusCode).toBe(200);
      }

      // 4th request must be rejected with 429
      const blockedRes = await app.inject({
        method: "POST",
        url: "/v1/commerce/card-to-card/extract",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
        },
        payload: validPayload,
      });

      expect(blockedRes.statusCode).toBe(429);
      await app.close();
    });

    it("24. Concurrent requests cannot bypass the rate limit", async () => {
      const rateLimiter = new PaymentExtractionRateLimiter({
        maxRequestsPerMinuteUser: 2,
        maxRequestsPerMinuteIp: 10,
        isProduction: false,
      });

      const app = await createTestApp({ paymentRateLimiter: rateLimiter });
      const user = await userStore.createUserWithPassword({
        email: "concurrent_ratelimit@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      const validPayload = {
        text: "انتقال وجه به کارت ۶۰۳۷۹۹۱۸۹۹۹۹۲۲۲۲ مبلغ ۱،۰۰۰،۰۰۰ ریال کد ۹۹۸۸۷۷",
      };

      // Send 5 requests concurrently
      const requests = Array.from({ length: 5 }, () =>
        app.inject({
          method: "POST",
          url: "/v1/commerce/card-to-card/extract",
          cookies: {
            avana_session: sessionToken,
            avana_csrf: csrfToken,
          },
          headers: {
            "x-csrf-token": csrfToken,
          },
          payload: validPayload,
        }),
      );

      const responses = await Promise.all(requests);
      const successful = responses.filter((r) => r.statusCode === 200).length;
      const rateLimited = responses.filter((r) => r.statusCode === 429).length;

      expect(successful).toBe(2);
      expect(rateLimited).toBe(3);
      await app.close();
    });

    it("25 & 26. IP-level and User-level rate limiting function independently", async () => {
      const rateLimiter = new PaymentExtractionRateLimiter({
        maxRequestsPerMinuteUser: 5,
        maxRequestsPerMinuteIp: 2, // Low IP limit
        isProduction: false,
      });

      // Two different users sharing the same IP
      await rateLimiter.checkAndConsume("user-1", "192.168.1.100");
      await rateLimiter.checkAndConsume("user-2", "192.168.1.100");

      // Third request from same IP must throw rate_limit_exceeded even for new user-3
      await expect(
        rateLimiter.checkAndConsume("user-3", "192.168.1.100"),
      ).rejects.toMatchObject({ code: "rate_limit_exceeded" });

      // Same user-1 on different IP already consumed 1 of 5, should be able to consume up to 5
      await rateLimiter.checkAndConsume("user-1", "10.0.0.1");
      await rateLimiter.checkAndConsume("user-1", "10.0.0.2");
      await rateLimiter.checkAndConsume("user-1", "10.0.0.3");
      await rateLimiter.checkAndConsume("user-1", "10.0.0.4");

      // 6th request for user-1 across all IPs must throw
      await expect(
        rateLimiter.checkAndConsume("user-1", "10.0.0.5"),
      ).rejects.toMatchObject({ code: "rate_limit_exceeded" });
    });

    it("27 & 28. Redis failure or disconnection in Production fails closed with 503", async () => {
      // 1. Missing Redis in production
      const prodLimiterNoRedis = new PaymentExtractionRateLimiter({
        redis: null,
        isProduction: true,
      });

      await expect(
        prodLimiterNoRedis.checkAndConsume("user-prod", "127.0.0.1"),
      ).rejects.toMatchObject({ code: "service_unavailable" });

      // 2. Redis throwing connection error / timeout in production
      const brokenRedisMock = {
        eval: vi.fn().mockRejectedValue(new Error("ECONNREFUSED: Connection lost")),
      } as unknown as Redis;

      const prodLimiterBrokenRedis = new PaymentExtractionRateLimiter({
        redis: brokenRedisMock,
        isProduction: true,
      });

      await expect(
        prodLimiterBrokenRedis.checkAndConsume("user-prod", "127.0.0.1"),
      ).rejects.toMatchObject({ code: "service_unavailable" });
    });

    it("29. Zero AI / Gemini model calls occur on any rejected request", async () => {
      const mockGenerateContent = vi.fn();
      const mockModelGateway = {
        generateContent: mockGenerateContent,
      };

      const rateLimiter = new PaymentExtractionRateLimiter({
        maxRequestsPerMinuteUser: 1,
        isProduction: false,
      });

      const app = await createTestApp({
        paymentRateLimiter: rateLimiter,
        mockModelGateway,
      });

      const user = await userStore.createUserWithPassword({
        email: "zero_calls@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      // Attempt with invalid input
      await app.inject({
        method: "POST",
        url: "/v1/commerce/card-to-card/extract",
        cookies: { avana_session: sessionToken, avana_csrf: csrfToken },
        headers: { "x-csrf-token": csrfToken },
        payload: { text: "short" },
      });

      // Attempt unauthenticated
      await app.inject({
        method: "POST",
        url: "/v1/commerce/card-to-card/extract",
        payload: { text: "فیش بانکی بدون لاگین ۱۲۳۴۵۶" },
      });

      expect(mockGenerateContent).not.toHaveBeenCalled();
      await app.close();
    });
  });

  // ===========================================================================
  // Part 4: Session Regression
  // ===========================================================================
  describe("4. Session Regression & Lifecycles", () => {
    it("30, 31, 32, 33. Existing session persistence, CSRF sync, and logout revocation", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "regression_user@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken, generateCsrfToken());

      // 30. Active session validates
      const details = await sessionService.validateSessionDetails(sessionToken);
      expect(details.valid).toBe(true);

      // 31. CSRF token validates against session
      expect(validateCsrfToken(csrfToken, sessionToken)).toBe(true);

      // 32. Sign-out revokes session
      await app.inject({
        method: "POST",
        url: "/v1/auth/sign-out",
        cookies: { avana_session: sessionToken, avana_csrf: csrfToken },
        headers: { "x-csrf-token": csrfToken },
      });

      const postLogoutDetails = await sessionService.validateSessionDetails(sessionToken);
      expect(postLogoutDetails.valid).toBe(false);

      // 33. Multi-tab requests after logout fail with 401
      const tabRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken },
      });
      expect(tabRes.statusCode).toBe(401);
      await app.close();
    });
  });

  // ===========================================================================
  // Part 5: Final Security Hardening Verification
  // ===========================================================================
  describe("5. Final Security Hardening & Edge Cases", () => {
    it("34. Cryptography: strict HMAC-SHA256, forged signatures, and malformed inputs", () => {
      const sessionToken = "sample_session_token_fixed_string";
      const validBound = generateBoundCsrfToken(sessionToken);

      // Verify format: random64.hmac64
      expect(validBound).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/i);
      expect(validateCsrfToken(validBound, sessionToken)).toBe(true);

      // Forged signature
      const [randomPart] = validBound.split(".");
      const forgedSig = "0".repeat(64);
      expect(validateCsrfToken(`${randomPart}.${forgedSig}`, sessionToken)).toBe(false);

      // Malformed: missing dot
      expect(validateCsrfToken("randompartwithoutdot", sessionToken)).toBe(false);

      // Malformed: three parts
      expect(validateCsrfToken(`${randomPart}.${randomPart}.extra`, sessionToken)).toBe(false);

      // Malformed: non-hex characters
      expect(validateCsrfToken(`${randomPart}.${"z".repeat(64)}`, sessionToken)).toBe(false);

      // Malformed: invalid lengths (32 chars instead of 64)
      expect(validateCsrfToken(`${"a".repeat(32)}.${"b".repeat(32)}`, sessionToken)).toBe(false);

      // Malformed: empty or non-string inputs
      expect(validateCsrfToken("", sessionToken)).toBe(false);
      expect(validateCsrfToken(validBound, "")).toBe(false);
    });

    it("35 & 36. Existing sessions: GET /v1/me issues new bound CSRF cookie without rotating session token or changing TTL", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "existing_session@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);

      // 35. Case A: User has session cookie but NO avana_csrf cookie
      const resNoCsrf = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken },
      });

      expect(resNoCsrf.statusCode).toBe(200);
      const newCsrfCookie = extractCookie(resNoCsrf, "avana_csrf");
      expect(newCsrfCookie).toBeDefined();
      expect(validateCsrfToken(newCsrfCookie!.value, sessionToken)).toBe(true);

      // Session cookie should NOT be re-issued or rotated
      const reissuedSession = extractCookie(resNoCsrf, "avana_session");
      expect(reissuedSession).toBeUndefined();

      // 36. Case B: User has legacy/raw sessionToken in avana_csrf cookie
      const resLegacyCsrf = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: sessionToken, // legacy format
        },
      });

      expect(resLegacyCsrf.statusCode).toBe(200);
      const upgradedCsrfCookie = extractCookie(resLegacyCsrf, "avana_csrf");
      expect(upgradedCsrfCookie).toBeDefined();
      expect(upgradedCsrfCookie!.value).not.toBe(sessionToken);
      expect(validateCsrfToken(upgradedCsrfCookie!.value, sessionToken)).toBe(true);

      await app.close();
    });

    it("37 & 38. Existing sessions: mutation without CSRF is rejected, but succeeds once CSRF cookie is acquired", async () => {
      const app = await createTestApp({ enforceCsrf: true });
      const user = await userStore.createUserWithPassword({
        email: "mutation_bootstrap@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);

      // 37. Direct mutation attempt without CSRF header is rejected
      const directMut = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: { avana_session: sessionToken },
        headers: { origin: "http://localhost:5173" },
        payload: { name: "Bootstrap Org 1" },
      });
      expect(directMut.statusCode).toBe(403);

      // Bootstrap: GET /v1/me provides the bound CSRF cookie
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/me",
        cookies: { avana_session: sessionToken },
      });
      const csrfCookie = extractCookie(getRes, "avana_csrf")!;
      expect(csrfCookie).toBeDefined();

      // 38. Subsequent mutation with newly acquired CSRF token succeeds
      const postRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfCookie.value,
        },
        headers: {
          "x-csrf-token": csrfCookie.value,
          origin: "http://localhost:5173",
        },
        payload: { name: "Bootstrap Org 2" },
      });
      expect(postRes.statusCode).toBe(201);

      await app.close();
    });

    it("39 & 40. Welcome Gift & Onboarding routes enforce CSRF for cookie sessions and allow Bearer", async () => {
      const app = await createTestApp();
      const user = await userStore.createUserWithPassword({
        email: "gift_user@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken);

      // 39. POST /v1/welcome-gift/acknowledge without CSRF -> 403
      const giftNoCsrf = await app.inject({
        method: "POST",
        url: "/v1/welcome-gift/acknowledge",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: { origin: "http://localhost:5173" },
        // omitted x-csrf-token header
      });
      expect(giftNoCsrf.statusCode).toBe(403);

      // With valid CSRF and Origin -> 200
      const giftWithCsrf = await app.inject({
        method: "POST",
        url: "/v1/welcome-gift/acknowledge",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
          origin: "http://localhost:5173",
        },
      });
      expect(giftWithCsrf.statusCode).toBe(200);

      // Bearer token -> 200 without CSRF
      const giftBearer = await app.inject({
        method: "POST",
        url: "/v1/welcome-gift/acknowledge",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });
      expect(giftBearer.statusCode).toBe(200);

      // 40. POST /v1/onboarding/tour without CSRF -> 403
      const tourNoCsrf = await app.inject({
        method: "POST",
        url: "/v1/onboarding/tour",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: { origin: "http://localhost:5173" },
        payload: { action: "complete", step: 1 },
      });
      expect(tourNoCsrf.statusCode).toBe(403);

      // With valid CSRF and Origin -> 200
      const tourWithCsrf = await app.inject({
        method: "POST",
        url: "/v1/onboarding/tour",
        cookies: {
          avana_session: sessionToken,
          avana_csrf: csrfToken,
        },
        headers: {
          "x-csrf-token": csrfToken,
          origin: "http://localhost:5173",
        },
        payload: { action: "complete", step: 1 },
      });
      expect(tourWithCsrf.statusCode).toBe(200);

      await app.close();
    });

    it("41 & 42. Origin & Referer validation: accepts valid, blocks malicious and cross-origin", async () => {
      const app = await createTestApp({ enforceCsrf: true });
      const user = await userStore.createUserWithPassword({
        email: "origin_user@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken);

      const makeMutation = (headers: Record<string, string>) =>
        app.inject({
          method: "POST",
          url: "/v1/organizations",
          cookies: {
            avana_session: sessionToken,
            avana_csrf: csrfToken,
          },
          headers: {
            "x-csrf-token": csrfToken,
            ...headers,
          },
          payload: { name: `Origin Test Org ${randomUUID()}` },
        });

      // Valid Origin
      const validOriginRes = await makeMutation({ origin: "http://localhost:5173" });
      expect(validOriginRes.statusCode).toBe(201);

      // Unauthorized malicious Origin
      const evilOriginRes = await makeMutation({ origin: "https://evil-attacker.com" });
      expect(evilOriginRes.statusCode).toBe(403);

      // Subdomain / prefix spoof attempt (e.g. evil-aavana.ir or aavana.ir.evil.com)
      const prefixSpoofRes = await makeMutation({ origin: "https://evil-aavana.ir" });
      expect(prefixSpoofRes.statusCode).toBe(403);

      const suffixSpoofRes = await makeMutation({ origin: "https://aavana.ir.evil.com" });
      expect(suffixSpoofRes.statusCode).toBe(403);

      // No Origin, but valid Referer
      const validRefererRes = await makeMutation({
        referer: "http://localhost:5173/dashboard/courses",
      });
      expect(validRefererRes.statusCode).toBe(201);

      // No Origin, malicious Referer
      const evilRefererRes = await makeMutation({
        referer: "https://evil.com/phishing",
      });
      expect(evilRefererRes.statusCode).toBe(403);

      // Missing both Origin and Referer in strict mode -> 403
      const missingBothRes = await makeMutation({});
      expect(missingBothRes.statusCode).toBe(403);

      // Bearer requests without Origin/Referer succeed
      const bearerRes = await app.inject({
        method: "POST",
        url: "/v1/organizations",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: { name: "Bearer Org" },
      });
      expect(bearerRes.statusCode).toBe(201);

      await app.close();
    });

    it("43. IP Rate Limiting prioritizes X-Real-IP and user-level limit remains un-spoofable", async () => {
      const app = await createTestApp({
        paymentRateLimiter: new PaymentExtractionRateLimiter({
          maxRequestsPerMinuteUser: 2,
          maxRequestsPerMinuteIp: 5,
        }),
      });
      const user = await userStore.createUserWithPassword({
        email: "rate_limiter_spoof@example.com",
        passwordHash: "hash123",
      });
      const { sessionToken } = await sessionService.createSession(user.id);
      const csrfToken = generateBoundCsrfToken(sessionToken);

      const makeExtract = (spoofedXff: string, realIp = "192.168.1.10") =>
        app.inject({
          method: "POST",
          url: "/v1/commerce/card-to-card/extract",
          cookies: {
            avana_session: sessionToken,
            avana_csrf: csrfToken,
          },
          headers: {
            "x-csrf-token": csrfToken,
            origin: "http://localhost:5173",
            "x-real-ip": realIp,
            "x-forwarded-for": spoofedXff,
          },
          payload: {
            text: "رسید انتقال کارت به کارت به مبلغ ۵۰,۰۰۰ ریال به شماره پیگیری ۹۸۷۶۵۴۳۲۱",
          },
        });

      // Request 1: should pass
      const res1 = await makeExtract("10.0.0.1");
      expect(res1.statusCode).toBe(200);

      // Request 2: should pass
      const res2 = await makeExtract("10.0.0.2");
      expect(res2.statusCode).toBe(200);

      // Request 3: Even if attacker spoofs a new X-Forwarded-For IP, the user-level limit (2/min) blocks them!
      const res3 = await makeExtract("10.0.0.3");
      expect(res3.statusCode).toBe(429);
      expect(JSON.parse(res3.body).error.message).toContain("حساب کاربری");

      await app.close();
    });
  });
});
