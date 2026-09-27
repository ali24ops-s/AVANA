import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type ProductId,
  type UUID,
  asProductId,
  asUserId,
  asUserSubscriptionId,
  verifyLedgerInvariant,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { InMemoryWalletStore, WalletService } from "../modules/wallet/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { SessionService } from "../modules/identity/index.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

describe("Avana Credits — Phase 2: Subscription Gift Credits Test Suite", () => {
  let commerceStore: InMemoryCommerceStore;
  let walletStore: InMemoryWalletStore;
  let adminStore: InMemoryAdminStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let walletService: WalletService;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let adminService: AdminService;

  const studentUser: Actor = {
    userId: asUserId(randomUUID() as UUID),
    role: "student",
  };

  const otherUser: Actor = {
    userId: asUserId(randomUUID() as UUID),
    role: "student",
  };

  const adminUser: Actor = {
    userId: asUserId(randomUUID() as UUID),
    role: "platform_admin",
  };

  const c2cConfig = {
    enabled: true,
    destinationCardNumber: "5894631131738239",
    cardholderName: "علی محمدلو",
    instructions: "واریز به شماره کارت",
  };

  let monthlyPlanId: ProductId;
  let quarterlyPlanId: ProductId;
  let annualPlanId: ProductId;
  let nonSubscriptionProductId: ProductId;

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    walletStore = new InMemoryWalletStore();
    adminStore = new InMemoryAdminStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    walletService = new WalletService(walletStore, auditService);
    adminStore.setCommerceStore(commerceStore);

    mockGateway = new MockPaymentGateway({ enabled: true });

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      auditService,
      undefined,
      c2cConfig,
      undefined,
      { onlinePaymentEnabled: true, mockPaymentEnabled: true },
      undefined,
      undefined,
      walletService,
      () => adminStore.getSubscriptionCreditBonuses(),
    );

    adminService = new AdminService(adminStore, walletService, commerceStore);

    const products = await commerceStore.listActiveProducts();
    const monthly = products.find((p) => p.code === "sub_monthly");
    const quarterly = products.find((p) => p.code === "sub_quarterly");
    const yearly = products.find((p) => p.code === "sub_yearly");

    if (!monthly || !quarterly || !yearly) {
      throw new Error("Default subscription products not initialized in commerceStore");
    }

    monthlyPlanId = monthly.id;
    quarterlyPlanId = quarterly.id;
    annualPlanId = yearly.id;

    // Create a non-subscription product (e.g. Course)
    const courseProduct = await commerceStore.createProduct({
      id: asProductId(randomUUID() as UUID),
      code: "course_anatomy",
      type: "course",
      title: "دوره آناتومی عمومی",
      description: null,
      price: 150_000,
      currency: "toman",
      targetType: "course",
      targetId: randomUUID(),
      durationDays: null,
      active: true,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    nonSubscriptionProductId = courseProduct.id;
  });

  // -------------------------------------------------------------------------
  // 1. Configuration Lifecycle & Defaults
  // -------------------------------------------------------------------------
  describe("1. Configuration Defaults & Admin Editability", () => {
    it("1. returns default values (monthly=40,000, quarterly=100,000, annual=200,000)", async () => {
      const config = await adminStore.getSubscriptionCreditBonuses();
      expect(config.monthly).toBe(40_000);
      expect(config.quarterly).toBe(100_000);
      expect(config.annual).toBe(200_000);
    });

    it("2. allows Admin to update bonuses and reflects on future grants", async () => {
      const updated = await adminService.updateSubscriptionCreditBonuses(adminUser.userId, {
        monthly: 55_000,
        quarterly: 130_000,
        annual: 300_000,
      });

      expect(updated.monthly).toBe(55_000);
      expect(updated.quarterly).toBe(130_000);
      expect(updated.annual).toBe(300_000);

      // Verify future checkout + verify gets updated amount (55,000)
      const checkout = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });
      await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-verify-1",
      );

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(55_000);
    });

    it("3. rejects invalid / negative configuration amounts", async () => {
      await expect(
        adminService.updateSubscriptionCreditBonuses(adminUser.userId, {
          monthly: -5000,
        }),
      ).rejects.toThrow();

      await expect(
        adminService.updateSubscriptionCreditBonuses(adminUser.userId, {
          quarterly: 100.5,
        }),
      ).rejects.toThrow();
    });

    it("4. historical transactions preserve their granted snapshot amount after configuration changes", async () => {
      // 1. Initial grant under default config (40,000)
      const checkout = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });
      await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-hist-1",
      );

      let txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].amount).toBe(40_000);

      // 2. Admin changes monthly bonus to 70,000
      await adminService.updateSubscriptionCreditBonuses(adminUser.userId, {
        monthly: 70_000,
      });

      // 3. Historical transaction in ledger MUST STILL BE 40,000
      txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].amount).toBe(40_000);

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(40_000);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Online Payment Gateway Integration
  // -------------------------------------------------------------------------
  describe("2. Online Payment Gateway Integration (verifyPayment)", () => {
    it("5. grants 40,000 Tomans for monthly subscription upon successful verification", async () => {
      const checkout = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });

      const verifyRes = await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-online-m",
      );

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.subscription).toBeDefined();

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(40_000);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].type).toBe("credit");
      expect(txs.transactions[0].source).toBe("subscription_bonus");
      expect(txs.transactions[0].amount).toBe(40_000);
      expect(txs.transactions[0].balance_before).toBe(0);
      expect(txs.transactions[0].balance_after).toBe(40_000);
      expect(txs.transactions[0].reference_type).toBe("user_subscription");
      expect(txs.transactions[0].reference_id).toBe(verifyRes.subscription!.id);
    });

    it("6. grants 100,000 Tomans for quarterly subscription upon successful verification", async () => {
      const checkout = await commerceService.checkout(studentUser, {
        productId: quarterlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });

      const verifyRes = await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-online-q",
      );

      expect(verifyRes.success).toBe(true);
      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(100_000);
    });

    it("7. grants 200,000 Tomans for annual subscription upon successful verification", async () => {
      const checkout = await commerceService.checkout(studentUser, {
        productId: annualPlanId,
        callbackUrl: "https://avana.app/callback",
      });

      const verifyRes = await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-online-a",
      );

      expect(verifyRes.success).toBe(true);
      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(200_000);
    });

    it("8. does not grant credit if payment verification fails or is cancelled", async () => {
      const checkout = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });

      // Gateway returns cancel
      const verifyRes = await commerceService.verifyPayment(
        { authority: checkout.authority, status: "NOK" },
        "req-online-fail",
      );

      expect(verifyRes.success).toBe(false);

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(0);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(0);
    });

    it("9. does not grant credit for non-subscription product purchases (courses)", async () => {
      const checkout = await commerceService.checkout(studentUser, {
        productId: nonSubscriptionProductId,
        callbackUrl: "https://avana.app/callback",
      });

      const verifyRes = await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-online-course",
      );

      expect(verifyRes.success).toBe(true);
      expect(verifyRes.entitlement?.resource_type).toBe("course");

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(0);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Card-to-Card Payment Integration
  // -------------------------------------------------------------------------
  describe("3. Card-to-Card Payment Lifecycle & Admin Approval", () => {
    it("10. gives ZERO credit upon initial C2C submission (pending review)", async () => {
      const submission = await commerceService.submitCardToCardPayment(
        studentUser,
        {
          productId: monthlyPlanId,
          amount: 99_000,
          trackingNumber: "11223344",
          sourceCardLast4: "1234",
        },
        "req-c2c-sub",
      );

      expect(submission.success).toBe(true);
      expect(submission.status).toBe("pending_admin_review");
      expect(submission.subscriptionStatus).toBe("active_pending_payment_review");

      // Balance MUST still be 0
      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(0);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(0);
    });

    it("11. gives ZERO credit when admin rejects a C2C payment", async () => {
      const submission = await commerceService.submitCardToCardPayment(
        studentUser,
        {
          productId: monthlyPlanId,
          amount: 99_000,
          trackingNumber: "99887766",
          sourceCardLast4: "5678",
        },
        "req-c2c-rej",
      );

      await adminService.rejectPayment(
        adminUser.userId,
        submission.paymentId,
        "رسید نامعتبر و ناخوانا",
      );

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(0);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(0);
    });

    it("12. grants gift credit exactly once upon admin approval", async () => {
      const submission = await commerceService.submitCardToCardPayment(
        studentUser,
        {
          productId: quarterlyPlanId,
          amount: 199_000,
          trackingNumber: "44556677",
          sourceCardLast4: "9012",
        },
        "req-c2c-app",
      );

      // Before approval: 0
      let wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(0);

      // Admin Approves
      const approveRes = await adminService.approvePayment(
        adminUser.userId,
        submission.paymentId,
      );
      expect(approveRes.success).toBe(true);

      // After approval: +100,000
      wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(100_000);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].type).toBe("credit");
      expect(txs.transactions[0].source).toBe("subscription_bonus");
      expect(txs.transactions[0].amount).toBe(100_000);
      expect(txs.transactions[0].balance_before).toBe(0);
      expect(txs.transactions[0].balance_after).toBe(100_000);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Renewal & Multiple Subscriptions
  // -------------------------------------------------------------------------
  describe("4. Renewal & Multiple Subscriptions per User", () => {
    it("13. does NOT award subsequent gift credits for sequential subscription purchases / renewals (first purchase only)", async () => {
      // 1. User buys monthly subscription -> +40,000
      const checkout1 = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });
      const verify1 = await commerceService.verifyPayment(
        { authority: checkout1.authority },
        "req-sub-1",
      );
      expect(verify1.success).toBe(true);

      let wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(40_000);

      // 2. User renews / extends subscription with quarterly plan -> NO second gift
      const checkout2 = await commerceService.checkout(studentUser, {
        productId: quarterlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });
      const verify2 = await commerceService.verifyPayment(
        { authority: checkout2.authority },
        "req-sub-2",
      );
      expect(verify2.success).toBe(true);

      // 3. User still has only the initial 40,000
      wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(40_000);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(1);
      const amounts = txs.transactions.map((t) => t.amount);
      expect(amounts).toEqual([40_000]);

      const allTxs = await walletStore.listTransactionsByUserId(studentUser.userId);
      expect(verifyLedgerInvariant(allTxs.transactions, 40_000)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Idempotency & Concurrency
  // -------------------------------------------------------------------------
  describe("5. Idempotency & Repeat Protection", () => {
    it("14. duplicate verifyPayment calls do not grant double credit", async () => {
      const checkout = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });

      // First call
      await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-dup-1",
      );

      // Second call (simulating page refresh or duplicate webhook)
      await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-dup-2",
      );

      // Third call
      await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-dup-3",
      );

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(40_000);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(1);
    });

    it("15. repeated admin approval does not grant double credit", async () => {
      const submission = await commerceService.submitCardToCardPayment(
        studentUser,
        {
          productId: annualPlanId,
          amount: 599_000,
          trackingNumber: "77889900",
          sourceCardLast4: "3456",
        },
        "req-c2c-dup",
      );

      // First approval
      await adminService.approvePayment(adminUser.userId, submission.paymentId);

      // Repeated approval
      await adminService.approvePayment(adminUser.userId, submission.paymentId);

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(200_000);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(1);
    });

    it("16. concurrent duplicate activations execute safely and credit exactly once", async () => {
      const subId = randomUUID() as UUID;

      const creditOps = Array.from({ length: 5 }, () =>
        walletService.credit(
          {
            userId: studentUser.userId,
            amount: 40_000,
            source: "subscription_bonus",
            referenceType: "user_subscription",
            referenceId: subId,
            idempotencyKey: `subscription-gift:${subId}`,
            metadata: { subscriptionId: subId },
          },
          studentUser,
        ),
      );

      const results = await Promise.all(creditOps);
      const newCredits = results.filter((r) => !r.isDuplicate);
      const duplicates = results.filter((r) => r.isDuplicate);

      expect(newCredits.length).toBe(1);
      expect(duplicates.length).toBe(4);

      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(40_000);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Isolation & Security
  // -------------------------------------------------------------------------
  describe("6. User Isolation & Security", () => {
    it("17. User A cannot receive User B's gift credit", async () => {
      const checkoutA = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });
      await commerceService.verifyPayment(
        { authority: checkoutA.authority },
        "req-user-a",
      );

      const walletA = await walletService.getMyWallet(studentUser);
      const walletB = await walletService.getMyWallet(otherUser);

      expect(walletA.balance).toBe(40_000);
      expect(walletB.balance).toBe(0);
    });

    it("18. client cannot influence or tamper with gift credit amount", async () => {
      // Client calls checkout with tampered metadata or body
      const checkout = await commerceService.checkout(studentUser, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
        metadata: { creditAmount: 999_999_999, giftCredit: 1_000_000 },
      });

      await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-tamper-verify",
      );

      // Server strictly resolved 40,000 from product duration and system configuration
      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(40_000);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Fastify Admin API Endpoints
  // -------------------------------------------------------------------------
  describe("7. Fastify Admin API Endpoints for Subscription Bonuses", () => {
    it("19. GET /v1/admin/commerce/subscription-bonuses returns active config", async () => {
      const config = makeTestConfig();
      const sessionStore = new InMemorySessionStore();
      const orgStore = new InMemoryOrganizationStore();
      const userStore = new InMemoryUserStore(orgStore);
      const sessionService = new SessionService(sessionStore, config.session);

      const adminUserRecord = await userStore.createUserWithPassword({
        email: "admin@avana.app",
        passwordHash: "hash123",
        globalRole: "platform_admin",
        name: "Admin User",
      });

      const app = await createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        adminStore,
        commerceStore,
        walletStore,
        auditService,
      });
      await app.ready();

      const session = await sessionService.createSession(adminUserRecord.id);

      const res = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: session.sessionToken },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.monthly).toBe(40_000);
      expect(body.quarterly).toBe(100_000);
      expect(body.annual).toBe(200_000);

      await app.close();
    });

    it("20. PUT /v1/admin/commerce/subscription-bonuses updates config via API", async () => {
      const config = makeTestConfig();
      const sessionStore = new InMemorySessionStore();
      const orgStore = new InMemoryOrganizationStore();
      const userStore = new InMemoryUserStore(orgStore);
      const sessionService = new SessionService(sessionStore, config.session);

      const adminUserRecord = await userStore.createUserWithPassword({
        email: "admin2@avana.app",
        passwordHash: "hash123",
        globalRole: "platform_admin",
        name: "Admin User 2",
      });

      const app = await createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        adminStore,
        commerceStore,
        walletStore,
        auditService,
      });
      await app.ready();

      const session = await sessionService.createSession(adminUserRecord.id);

      const updateRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: session.sessionToken },
        payload: {
          monthly: 60_000,
          quarterly: 150_000,
          annual: 350_000,
        },
      });

      expect(updateRes.statusCode).toBe(200);
      const body = JSON.parse(updateRes.body);
      expect(body.success).toBe(true);
      expect(body.bonuses.monthly).toBe(60_000);
      expect(body.bonuses.quarterly).toBe(150_000);
      expect(body.bonuses.annual).toBe(350_000);

      // Re-read via GET
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: session.sessionToken },
      });
      const getBody = JSON.parse(getRes.body);
      expect(getBody.monthly).toBe(60_000);

      await app.close();
    });

    it("21. RBAC: blocks unauthenticated and non-admin roles (student, teacher) from accessing bonuses endpoints", async () => {
      const config = makeTestConfig();
      const sessionStore = new InMemorySessionStore();
      const orgStore = new InMemoryOrganizationStore();
      const userStore = new InMemoryUserStore(orgStore);
      const sessionService = new SessionService(sessionStore, config.session);

      const studentRecord = await userStore.createUserWithPassword({
        email: "student@avana.app",
        passwordHash: "hash123",
        globalRole: "student",
        name: "Student User",
      });

      const teacherRecord = await userStore.createUserWithPassword({
        email: "teacher@avana.app",
        passwordHash: "hash123",
        globalRole: "teacher",
        name: "Teacher User",
      });

      const app = await createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        adminStore,
        commerceStore,
        walletStore,
        auditService,
      });
      await app.ready();

      // 1. Unauthenticated -> 401
      const unauthRes = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/subscription-bonuses",
      });
      expect(unauthRes.statusCode).toBe(401);

      // 2. Student role -> 403
      const studentSession = await sessionService.createSession(studentRecord.id);
      const studentRes = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: studentSession.sessionToken },
      });
      expect(studentRes.statusCode).toBe(403);

      // 3. Teacher role PUT -> 403
      const teacherSession = await sessionService.createSession(teacherRecord.id);
      const teacherRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: teacherSession.sessionToken },
        payload: { monthly: 50_000 },
      });
      expect(teacherRes.statusCode).toBe(403);

      await app.close();
    });

    it("22. Validation: rejects invalid, negative, decimal, and malformed bonus inputs on PUT endpoint", async () => {
      const config = makeTestConfig();
      const sessionStore = new InMemorySessionStore();
      const orgStore = new InMemoryOrganizationStore();
      const userStore = new InMemoryUserStore(orgStore);
      const sessionService = new SessionService(sessionStore, config.session);

      const adminUserRecord = await userStore.createUserWithPassword({
        email: "admin_val@avana.app",
        passwordHash: "hash123",
        globalRole: "platform_admin",
        name: "Admin Val",
      });

      const app = await createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        adminStore,
        commerceStore,
        walletStore,
        auditService,
      });
      await app.ready();

      const session = await sessionService.createSession(adminUserRecord.id);

      // 1. Negative amount
      const negRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: session.sessionToken },
        payload: { monthly: -10_000 },
      });
      expect(negRes.statusCode).toBe(400);

      // 2. Decimal / float amount
      const decRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: session.sessionToken },
        payload: { quarterly: 99.99 },
      });
      expect(decRes.statusCode).toBe(400);

      // 3. String / malformed amount
      const strRes = await app.inject({
        method: "PUT",
        url: "/v1/admin/commerce/subscription-bonuses",
        cookies: { avana_session: session.sessionToken },
        payload: { annual: "invalid_string" },
      });
      expect(strRes.statusCode).toBe(400);

      await app.close();
    });

    it("23. Plan Resolution: returns null and awards 0 credits for unknown or unsupported subscription durations", async () => {
      // 1. Unknown custom duration (e.g. 15 days or 500 days)
      const customSubProduct = await commerceStore.createProduct({
        id: asProductId(randomUUID() as UUID),
        code: "sub_unknown_custom",
        type: "subscription",
        title: "پلن نامعتبر",
        description: null,
        price: 50_000,
        currency: "toman",
        targetType: "subscription",
        targetId: randomUUID(),
        durationDays: 15, // neither monthly (30), quarterly (90), nor annual (365)
        active: true,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const checkout = await commerceService.checkout(studentUser, {
        productId: customSubProduct.id,
        callbackUrl: "https://avana.app/callback",
      });

      const verifyRes = await commerceService.verifyPayment(
        { authority: checkout.authority },
        "req-unknown-plan",
      );

      expect(verifyRes.success).toBe(true);

      // No fallback to monthly: balance MUST remain 0
      const wallet = await walletService.getMyWallet(studentUser);
      expect(wallet.balance).toBe(0);

      const txs = await walletService.listMyTransactions(studentUser);
      expect(txs.transactions.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 8. First-Purchase Only Invariant Enforcement (Scenarios A through M)
  // -------------------------------------------------------------------------
  describe("8. First-Purchase Only Invariant Enforcement (Scenarios A through M)", () => {
    // Scenario A: First purchase of subscription -> bonus granted
    it("Scenario A: First purchase of subscription grants activation bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      const checkout = await commerceService.checkout(user, {
        productId: monthlyPlanId,
        callbackUrl: "https://avana.app/callback",
      });
      const verify = await commerceService.verifyPayment({ authority: checkout.authority }, "req-scen-a");
      expect(verify.success).toBe(true);

      const wallet = await walletService.getMyWallet(user);
      expect(wallet.balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].source).toBe("subscription_bonus");
    });

    // Scenario B: Second purchase of same plan -> no bonus
    it("Scenario B: Second purchase of same plan does not grant bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      // 1st purchase
      const c1 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c1.authority }, "req-scen-b-1");
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);

      // 2nd purchase of same plan
      const c2 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c2.authority }, "req-scen-b-2");

      // Balance remains 40,000
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
    });

    // Scenario C: Renewal -> no bonus
    it("Scenario C: Renewal of existing active subscription does not grant bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      const c1 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c1.authority }, "req-scen-c-1");
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);

      // Renewal
      const c2 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c2.authority }, "req-scen-c-2");

      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
    });

    // Scenario D: Different plan (monthly then annual) -> no bonus
    it("Scenario D: Switching or purchasing a different plan after having subscription history does not grant bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      const c1 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c1.authority }, "req-scen-d-1");
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);

      // Second purchase with annual plan (which normally gives 200,000 for 1st purchase)
      const c2 = await commerceService.checkout(user, { productId: annualPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c2.authority }, "req-scen-d-2");

      // Balance is STILL 40,000, NOT 240,000
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
    });

    // Scenario E: Repurchase after expiration -> no bonus
    it("Scenario E: Repurchase after subscription expiration does not grant bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      const c1 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c1.authority }, "req-scen-e-1");
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);

      // Manually set existing subscription to expired
      const subs = await commerceStore.listSubscriptionsByUser(user.userId);
      expect(subs.length).toBe(1);
      subs[0].status = "expired";
      subs[0].expiresAt = new Date(Date.now() - 1000).toISOString();

      // User repurchases after expiration
      const c2 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c2.authority }, "req-scen-e-2");

      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
    });

    // Scenario F: Repurchase after cancellation -> no bonus
    it("Scenario F: Repurchase after subscription cancellation does not grant bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      const c1 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c1.authority }, "req-scen-f-1");
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);

      // Manually cancel existing subscription
      const subs = await commerceStore.listSubscriptionsByUser(user.userId);
      expect(subs.length).toBe(1);
      subs[0].status = "cancelled";

      // User repurchases after cancellation
      const c2 = await commerceService.checkout(user, { productId: quarterlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c2.authority }, "req-scen-f-2");

      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
    });

    // Scenario G: Failed payment prior -> first successful purchase gets bonus
    it("Scenario G: Previous failed payment does not prevent first successful purchase from receiving bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      // 1. Failed payment
      const c1 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      const v1 = await commerceService.verifyPayment({ authority: c1.authority, status: "NOK" }, "req-scen-g-1");
      expect(v1.success).toBe(false);
      expect((await walletService.getMyWallet(user)).balance).toBe(0);

      // 2. Successful payment
      const c2 = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });
      const v2 = await commerceService.verifyPayment({ authority: c2.authority }, "req-scen-g-2");
      expect(v2.success).toBe(true);

      // Balance receives bonus
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].source).toBe("subscription_bonus");
    });

    // Scenario H: C2C rejected prior -> first successful purchase gets bonus
    it("Scenario H: Previous rejected C2C submission does not prevent subsequent approved purchase from receiving bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      // 1. C2C submitted and rejected
      const sub1 = await commerceService.submitCardToCardPayment(
        user,
        {
          productId: monthlyPlanId,
          amount: 99_000,
          trackingNumber: "00112233",
          sourceCardLast4: "1111",
        },
        "req-scen-h-1",
      );
      await adminService.rejectPayment(adminUser.userId, sub1.paymentId, "نامعتبر");
      expect((await walletService.getMyWallet(user)).balance).toBe(0);

      // 2. Second C2C submitted and approved
      const sub2 = await commerceService.submitCardToCardPayment(
        user,
        {
          productId: monthlyPlanId,
          amount: 99_000,
          trackingNumber: "44556677",
          sourceCardLast4: "2222",
        },
        "req-scen-h-2",
      );
      const appRes = await adminService.approvePayment(adminUser.userId, sub2.paymentId);
      expect(appRes.success).toBe(true);

      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].source).toBe("subscription_bonus");
    });

    // Scenario I: Non-subscription purchase prior (course) -> first subscription gets bonus
    it("Scenario I: Prior non-subscription purchase (course) does not disqualify first subscription bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      // 1. User buys course
      const c1 = await commerceService.checkout(user, { productId: nonSubscriptionProductId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c1.authority }, "req-scen-i-1");
      expect((await walletService.getMyWallet(user)).balance).toBe(0);

      // 2. User buys first subscription
      const c2 = await commerceService.checkout(user, { productId: quarterlyPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c2.authority }, "req-scen-i-2");

      expect((await walletService.getMyWallet(user)).balance).toBe(100_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].source).toBe("subscription_bonus");
    });

    // Scenario J: Manual/free subscription (orderId: null) prior -> first paid purchase gets bonus
    it("Scenario J: Prior manual or free subscription without an order does not disqualify first paid purchase bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      // 1. Directly create active subscription with orderId: null
      await commerceStore.createSubscription({
        id: asUserSubscriptionId(randomUUID() as UUID),
        userId: user.userId,
        productId: monthlyPlanId,
        orderId: null,
        status: "active",
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        metadata: { grantType: "admin_manual_grant" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect((await walletService.getMyWallet(user)).balance).toBe(0);

      // 2. User buys their first PAID subscription
      const c1 = await commerceService.checkout(user, { productId: annualPlanId, callbackUrl: "https://avana.app/cb" });
      await commerceService.verifyPayment({ authority: c1.authority }, "req-scen-j-1");

      expect((await walletService.getMyWallet(user)).balance).toBe(200_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].source).toBe("subscription_bonus");
    });

    // Scenario K: Retry on same payment -> exactly one bonus
    it("Scenario K: Retry/resubmission on same payment records grants bonus exactly once", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      const checkout = await commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" });

      const res1 = await commerceService.verifyPayment({ authority: checkout.authority }, "req-scen-k-1");
      const res2 = await commerceService.verifyPayment({ authority: checkout.authority }, "req-scen-k-2");

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect((await walletService.getMyWallet(user)).balance).toBe(40_000);

      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
    });

    // Scenario L: Duplicate callback / webhook -> exactly one bonus
    it("Scenario L: Duplicate callback or concurrent verify for same order grants bonus exactly once", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      const checkout = await commerceService.checkout(user, { productId: quarterlyPlanId, callbackUrl: "https://avana.app/cb" });

      // Run 3 verification calls concurrently for the same authority
      await Promise.all([
        commerceService.verifyPayment({ authority: checkout.authority }, "req-scen-l-1"),
        commerceService.verifyPayment({ authority: checkout.authority }, "req-scen-l-2"),
        commerceService.verifyPayment({ authority: checkout.authority }, "req-scen-l-3"),
      ]);

      expect((await walletService.getMyWallet(user)).balance).toBe(100_000);
      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
    });

    // Scenario M: Concurrent first purchases -> exactly one bonus credited
    it("Scenario M: Concurrent first purchases for the same user grant exactly one bonus", async () => {
      const user: Actor = { userId: asUserId(randomUUID() as UUID), role: "student" };
      // User creates two checkout orders concurrently
      const [c1, c2] = await Promise.all([
        commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" }),
        commerceService.checkout(user, { productId: monthlyPlanId, callbackUrl: "https://avana.app/cb" }),
      ]);

      // Both verifications fire concurrently
      const [v1, v2] = await Promise.all([
        commerceService.verifyPayment({ authority: c1.authority }, "req-scen-m-1"),
        commerceService.verifyPayment({ authority: c2.authority }, "req-scen-m-2"),
      ]);

      expect(v1.success).toBe(true);
      expect(v2.success).toBe(true);

      // Exactly ONE bonus (40,000) is credited to the wallet
      const wallet = await walletService.getMyWallet(user);
      expect(wallet.balance).toBe(40_000);

      const txs = await walletService.listMyTransactions(user);
      expect(txs.transactions.length).toBe(1);
      expect(txs.transactions[0].source).toBe("subscription_bonus");

      const allTxs = await walletStore.listTransactionsByUserId(user.userId);
      expect(verifyLedgerInvariant(allTxs.transactions, 40_000)).toBe(true);
    });
  });
});
