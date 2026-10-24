import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asUserId,
  asUserSubscriptionId,
  asUserEntitlementId,
  asProductId,
  type UserId,
  type UUID,
} from "@avana/domain";
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
import { InMemoryWalletStore } from "../modules/wallet/index.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  InMemoryWelcomeGiftStore,
  WelcomeGiftService,
  SessionService,
} from "../modules/identity/index.js";
import { NotificationService } from "../modules/notifications/notification-service.js";
import { walletRoutes } from "../modules/wallet/wallet-routes.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Welcome Gift Feature — Comprehensive Test Suite", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let emailVerificationStore: InMemoryEmailVerificationStore;
  let emailService: MockEmailService;
  let smsProvider: MockSmsProvider;
  let walletStore: InMemoryWalletStore;
  let commerceStore: InMemoryCommerceStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let welcomeGiftStore: InMemoryWelcomeGiftStore;
  let welcomeGiftService: WelcomeGiftService;
  let notificationService: NotificationService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    emailVerificationStore = new InMemoryEmailVerificationStore();
    emailService = new MockEmailService();
    smsProvider = new MockSmsProvider();
    walletStore = new InMemoryWalletStore();
    commerceStore = new InMemoryCommerceStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    welcomeGiftStore = new InMemoryWelcomeGiftStore(walletStore, commerceStore);
    notificationService = new NotificationService();
    welcomeGiftService = new WelcomeGiftService({
      store: welcomeGiftStore,
      userStore,
      notificationService,
      auditService,
    });
  });

  async function createTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes);

    const identityOpts: IdentityPluginOptions = {
      config,
      sessionStore,
      userStore,
      emailVerificationStore,
      emailService,
      smsProvider,
      welcomeGiftStore,
      welcomeGiftService,
      notificationService,
      auditService,
    };
    await app.register(registerIdentityModule, identityOpts);

    const sessionService = new SessionService(
      sessionStore,
      config.session,
    );
    await app.register(walletRoutes, {
      sessionService,
      userStore,
      walletStore,
      commerceStore,
      auditService,
    });

    return app;
  }

  describe("Service Layer Unit Tests", () => {
    it("provisions a pending gift on signup and atomically completes it on dashboard entry", async () => {
      const userId = asUserId(randomUUID() as UUID);
      await userStore.createUser({
        id: userId,
        email: "student@avana.ir",
        displayName: "Student",
        role: "student",
        passwordHash: "hash",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 1. Register on signup
      const pendingRecord = await welcomeGiftService.registerOnSignup(userId);
      expect(pendingRecord).not.toBeNull();
      expect(pendingRecord?.status).toBe("pending");
      expect(pendingRecord?.userId).toBe(userId);
      expect(pendingRecord?.walletAmount).toBe(20000);
      expect(pendingRecord?.subscriptionDays).toBe(7);

      // 2. User enters dashboard -> getOrActivateStatus
      const status = await welcomeGiftService.getOrActivateStatus(userId);
      expect(status.eligible).toBe(true);
      expect(status.granted).toBe(true);
      expect(status.popup_seen).toBe(false);
      expect(status.gift).toMatchObject({
        wallet_amount: 20000,
        subscription_days: 7,
      });

      // 3. Verify wallet credited
      const wallet = await walletStore.findWalletByUserId(userId);
      expect(wallet).not.toBeNull();
      expect(wallet?.balance).toBe(20000);

      const txRes = await walletStore.listTransactionsByUserId(userId);
      expect(txRes.transactions).toHaveLength(1);
      expect(txRes.transactions[0].source).toBe("welcome_gift");
      expect(txRes.transactions[0].amount).toBe(20000);
      expect(txRes.transactions[0].type).toBe("credit");

      // 4. Verify subscription and entitlement
      const activeSub = await commerceStore.findActiveSubscription(userId);
      expect(activeSub).not.toBeNull();
      expect(activeSub?.status).toBe("active");

      const entitlements = await commerceStore.listActiveEntitlements(userId);
      expect(entitlements.length).toBeGreaterThanOrEqual(1);
      expect(entitlements.some((e) => e.sourceType === "gift")).toBe(true);
    });

    it("is strictly idempotent: repeated activations do not duplicate wallet balance or subscriptions", async () => {
      const userId = asUserId(randomUUID() as UUID);
      await userStore.createUser({
        id: userId,
        email: "repeat@avana.ir",
        displayName: "Repeat Student",
        role: "student",
        passwordHash: "hash",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await welcomeGiftService.registerOnSignup(userId);

      // Call activation multiple times concurrently
      const [res1, res2, res3] = await Promise.all([
        welcomeGiftService.getOrActivateStatus(userId),
        welcomeGiftService.getOrActivateStatus(userId),
        welcomeGiftService.getOrActivateStatus(userId),
      ]);

      expect(res1.granted).toBe(true);
      expect(res2.granted).toBe(true);
      expect(res3.granted).toBe(true);

      const wallet = await walletStore.findWalletByUserId(userId);
      expect(wallet?.balance).toBe(20000); // Not 60000!

      const txRes = await walletStore.listTransactionsByUserId(userId);
      expect(txRes.transactions).toHaveLength(1);
    });

    it("extends existing active subscription without truncating already paid days", async () => {
      const userId = asUserId(randomUUID() as UUID);
      await userStore.createUser({
        id: userId,
        email: "stacking@avana.ir",
        displayName: "Stacking User",
        role: "student",
        passwordHash: "hash",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // User already has an existing active subscription expiring 10 days from now
      const now = new Date();
      const existingExpiry = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      await commerceStore.createSubscription({
        id: asUserSubscriptionId(randomUUID() as UUID),
        userId,
        productId: asProductId(randomUUID() as UUID),
        orderId: null,
        status: "active",
        startedAt: now.toISOString(),
        expiresAt: existingExpiry.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      await welcomeGiftService.registerOnSignup(userId);
      await welcomeGiftService.getOrActivateStatus(userId, now);

      // Verify new subscription expires 10 + 7 = 17 days from now
      const sub = await commerceStore.findActiveSubscription(userId, now);
      expect(sub).not.toBeNull();
      const expectedExpiry = new Date(existingExpiry.getTime() + 7 * 24 * 60 * 60 * 1000);
      const actualExpiry = new Date(sub!.expiresAt);
      expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(5000);
    });

    it("rejects legacy users created before the feature launch cutoff", async () => {
      const userId = asUserId(randomUUID() as UUID);
      // User created far in the past (e.g. 2024)
      const pastDate = new Date("2024-01-01T00:00:00Z").toISOString();
      await userStore.createUser({
        id: userId,
        email: "legacy@avana.ir",
        displayName: "Legacy User",
        role: "student",
        passwordHash: "hash",
        isActive: true,
        createdAt: pastDate,
        updatedAt: pastDate,
      });

      // Old user logging in and opening dashboard
      const status = await welcomeGiftService.getOrActivateStatus(userId);
      expect(status.eligible).toBe(false);
      expect(status.granted).toBe(false);
      expect(status.popup_seen).toBe(true);

      const wallet = await walletStore.findWalletByUserId(userId);
      expect(wallet).toBeNull();
    });

    it("acknowledges popup and remembers status idempotently", async () => {
      const userId = asUserId(randomUUID() as UUID);
      await userStore.createUser({
        id: userId,
        email: "ack@avana.ir",
        displayName: "Ack User",
        role: "student",
        passwordHash: "hash",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await welcomeGiftService.registerOnSignup(userId);
      await welcomeGiftService.getOrActivateStatus(userId);

      const ack1 = await welcomeGiftService.acknowledgePopup(userId);
      expect(ack1.success).toBe(true);
      expect(ack1.popup_seen_at).toBeDefined();

      const statusAfter = await welcomeGiftService.getOrActivateStatus(userId);
      expect(statusAfter.popup_seen).toBe(true);

      // Second acknowledge call
      const ack2 = await welcomeGiftService.acknowledgePopup(userId);
      expect(ack2.success).toBe(true);
      expect(ack2.popup_seen_at).toBeDefined();
    });
  });

  describe("API Endpoints & Integration Flow", () => {
    it("full registration, status check, popup acknowledge, and wallet verification", async () => {
      const app = await createTestApp();

      // 1. Register new user
      const registerRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          firstName: "دانش‌آموز",
          lastName: "جدید",
          email: "newstudent@avana.ir",
          phoneNumber: "09121234567",
          password: "SecurePassword123!",
        },
      });

      expect(registerRes.statusCode).toBe(200);
      const sessionToken = extractSessionToken(registerRes);
      expect(sessionToken).toBeDefined();

      const headers = {
        cookie: `avana_session=${sessionToken}`,
        authorization: `Bearer ${sessionToken}`,
      };

      // 2. Query welcome gift status on dashboard entry
      const statusRes = await app.inject({
        method: "GET",
        url: "/v1/welcome-gift/status",
        headers,
      });

      expect(statusRes.statusCode).toBe(200);
      const statusBody = JSON.parse(statusRes.payload);
      expect(statusBody.eligible).toBe(true);
      expect(statusBody.granted).toBe(true);
      expect(statusBody.popup_seen).toBe(false);
      expect(statusBody.gift).toMatchObject({
        wallet_amount: 20000,
        subscription_days: 7,
      });

      // 3. Verify wallet balance via /v1/wallet/me
      const walletRes = await app.inject({
        method: "GET",
        url: "/v1/wallet/me",
        headers,
      });
      expect(walletRes.statusCode).toBe(200);
      const walletBody = JSON.parse(walletRes.payload);
      expect(walletBody.balance).toBe(20000);

      // 4. Verify transaction list
      const txsRes = await app.inject({
        method: "GET",
        url: "/v1/wallet/transactions",
        headers,
      });
      expect(txsRes.statusCode).toBe(200);
      const txsBody = JSON.parse(txsRes.payload);
      expect(txsBody.transactions).toHaveLength(1);
      expect(txsBody.transactions[0].source).toBe("welcome_gift");
      expect(txsBody.transactions[0].amount).toBe(20000);

      // 5. Acknowledge popup via POST /v1/welcome-gift/acknowledge
      const ackRes = await app.inject({
        method: "POST",
        url: "/v1/welcome-gift/acknowledge",
        headers,
      });
      expect(ackRes.statusCode).toBe(200);
      const ackBody = JSON.parse(ackRes.payload);
      expect(ackBody.success).toBe(true);
      expect(ackBody.popup_seen_at).toBeDefined();

      // 6. Query status again -> popup_seen should now be true
      const statusAfterRes = await app.inject({
        method: "GET",
        url: "/v1/welcome-gift/status",
        headers,
      });
      const statusAfterBody = JSON.parse(statusAfterRes.payload);
      expect(statusAfterBody.popup_seen).toBe(true);
      expect(statusAfterBody.granted).toBe(true);
    });

    it("returns 401 when unauthenticated requests access welcome gift endpoints", async () => {
      const app = await createTestApp();

      const resStatus = await app.inject({
        method: "GET",
        url: "/v1/welcome-gift/status",
      });
      expect(resStatus.statusCode).toBe(401);

      const resAck = await app.inject({
        method: "POST",
        url: "/v1/welcome-gift/acknowledge",
      });
      expect(resAck.statusCode).toBe(401);
    });
  });
});
