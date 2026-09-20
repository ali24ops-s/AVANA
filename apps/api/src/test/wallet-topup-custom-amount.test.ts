import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asUserId,
  parseUUID,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";

describe("Wallet Top-up Decoupling from Subscription Pricing", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let commerceService: CommerceService;
  let adminStore: InMemoryAdminStore;
  let adminService: AdminService;

  const testUser: Actor = {
    userId: asUserId(parseUUID(randomUUID())),
    role: "student",
  };

  const adminUser: Actor = {
    userId: asUserId(parseUUID(randomUUID())),
    role: "platform_admin",
  };

  const c2cConfig = {
    enabled: true,
    destinationCardNumber: "5894631131738239",
    cardholderName: "علی محمدلو",
    instructions: "لطفاً مبلغ را به شماره کارت فوق واریز کرده و اطلاعات را ثبت کنید.",
  };

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore, undefined, commerceStore);

    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      walletService,
      c2cConfig,
    );

    adminStore = new InMemoryAdminStore();
    adminStore.setCommerceStore(commerceStore);
    adminService = new AdminService(adminStore, walletService, commerceStore);
  });

  it("1. Top-up with minimum allowed amount (10,000 Tomans)", async () => {
    const topupProduct = (await commerceService.listActiveProducts()).find(
      (p) => p.type === "wallet_topup",
    )!;

    const res = await commerceService.submitCardToCardPayment(
      testUser,
      {
        productId: topupProduct.id,
        amount: 10_000,
        trackingNumber: "TRK-MIN-10K",
        sourceCardLast4: "1111",
      },
      "req-1",
    );

    expect(res.success).toBe(true);

    const payment = await commerceService.getPayment(testUser, res.paymentId);
    expect(payment.amount).toBe(10_000);

    adminStore.memoryPayments.push({
      id: res.paymentId,
      orderId: res.orderId,
      orderNumber: "C2C-10K",
      userId: testUser.userId,
      userEmail: "student@test.com",
      userName: "Student",
      productTitle: "شارژ کیف پول",
      amount: 10_000,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: "TRK-MIN-10K",
      status: "pending_admin_review",
      trackingNumber: "TRK-MIN-10K",
      sourceCardLast4: "1111",
      payerName: "Student",
      receiptUrl: null,
      initialValidationResult: { valid: true },
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // Admin approves payment -> exactly 10,000 credited
    await adminService.approvePayment(adminUser.userId, res.paymentId);
    const wallet = await walletService.getMyWallet(testUser);
    expect(wallet.balance).toBe(10_000);
  });

  it("2. Top-up with standard amount (50,000 Tomans)", async () => {
    const topupProduct = (await commerceService.listActiveProducts()).find(
      (p) => p.type === "wallet_topup",
    )!;

    const res = await commerceService.submitCardToCardPayment(
      testUser,
      {
        productId: topupProduct.id,
        amount: 50_000,
        trackingNumber: "TRK-50K",
        sourceCardLast4: "2222",
      },
      "req-2",
    );

    const payment = await commerceService.getPayment(testUser, res.paymentId);
    expect(payment.amount).toBe(50_000);

    adminStore.memoryPayments.push({
      id: res.paymentId,
      orderId: res.orderId,
      orderNumber: "C2C-50K",
      userId: testUser.userId,
      userEmail: "student@test.com",
      userName: "Student",
      productTitle: "شارژ کیف پول",
      amount: 50_000,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: "TRK-50K",
      status: "pending_admin_review",
      trackingNumber: "TRK-50K",
      sourceCardLast4: "2222",
      payerName: "Student",
      receiptUrl: null,
      initialValidationResult: { valid: true },
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await adminService.approvePayment(adminUser.userId, res.paymentId);
    const wallet = await walletService.getMyWallet(testUser);
    expect(wallet.balance).toBe(50_000);
  });

  it("3. Top-up with amount less than subscription price (e.g. 15,000 Tomans vs 299,000 subscription)", async () => {
    const products = await commerceService.listActiveProducts();
    const monthlySub = products.find((p) => p.code === "sub_monthly")!;
    const topupProduct = products.find((p) => p.type === "wallet_topup")!;

    expect(monthlySub.price).toBeGreaterThan(15_000);

    const res = await commerceService.submitCardToCardPayment(
      testUser,
      {
        productId: topupProduct.id,
        amount: 15_000,
        trackingNumber: "TRK-LESS-THAN-SUB",
        sourceCardLast4: "3333",
      },
      "req-3",
    );

    const payment = await commerceService.getPayment(testUser, res.paymentId);
    expect(payment.amount).toBe(15_000);
    expect(payment.amount).not.toBe(monthlySub.price);

    adminStore.memoryPayments.push({
      id: res.paymentId,
      orderId: res.orderId,
      orderNumber: "C2C-15K",
      userId: testUser.userId,
      userEmail: "student@test.com",
      userName: "Student",
      productTitle: "شارژ کیف پول",
      amount: 15_000,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: "TRK-LESS-THAN-SUB",
      status: "pending_admin_review",
      trackingNumber: "TRK-LESS-THAN-SUB",
      sourceCardLast4: "3333",
      payerName: "Student",
      receiptUrl: null,
      initialValidationResult: { valid: true },
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await adminService.approvePayment(adminUser.userId, res.paymentId);
    const wallet = await walletService.getMyWallet(testUser);
    expect(wallet.balance).toBe(15_000);
  });

  it("4. Top-up with amount exactly equal to subscription price (e.g. 299,000 Tomans) behaves purely as wallet topup", async () => {
    const products = await commerceService.listActiveProducts();
    const monthlySub = products.find((p) => p.code === "sub_monthly")!;
    const topupProduct = products.find((p) => p.type === "wallet_topup")!;

    const res = await commerceService.submitCardToCardPayment(
      testUser,
      {
        productId: topupProduct.id,
        amount: monthlySub.price,
        trackingNumber: "TRK-EQ-SUB",
        sourceCardLast4: "4444",
      },
      "req-4",
    );

    // Order/Payment is created for wallet topup, NO subscription is created
    expect(res.subscriptionId).toBeUndefined();

    adminStore.memoryPayments.push({
      id: res.paymentId,
      orderId: res.orderId,
      orderNumber: "C2C-EQ",
      userId: testUser.userId,
      userEmail: "student@test.com",
      userName: "Student",
      productTitle: "شارژ کیف پول",
      amount: monthlySub.price,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: "TRK-EQ-SUB",
      status: "pending_admin_review",
      trackingNumber: "TRK-EQ-SUB",
      sourceCardLast4: "4444",
      payerName: "Student",
      receiptUrl: null,
      initialValidationResult: { valid: true },
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await adminService.approvePayment(adminUser.userId, res.paymentId);
    const wallet = await walletService.getMyWallet(testUser);
    expect(wallet.balance).toBe(monthlySub.price);

    // User should have zero active subscriptions from this topup
    const activeSub = await commerceStore.findActiveSubscription(testUser.userId);
    expect(activeSub).toBeNull();
  });

  it("5. Top-up with amount greater than subscription price (e.g. 1,000,000 Tomans)", async () => {
    const products = await commerceService.listActiveProducts();
    const topupProduct = products.find((p) => p.type === "wallet_topup")!;

    const res = await commerceService.submitCardToCardPayment(
      testUser,
      {
        productId: topupProduct.id,
        amount: 1_000_000,
        trackingNumber: "TRK-1M",
        sourceCardLast4: "5555",
      },
      "req-5",
    );

    const payment = await commerceService.getPayment(testUser, res.paymentId);
    expect(payment.amount).toBe(1_000_000);

    adminStore.memoryPayments.push({
      id: res.paymentId,
      orderId: res.orderId,
      orderNumber: "C2C-1M",
      userId: testUser.userId,
      userEmail: "student@test.com",
      userName: "Student",
      productTitle: "شارژ کیف پول",
      amount: 1_000_000,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: "TRK-1M",
      status: "pending_admin_review",
      trackingNumber: "TRK-1M",
      sourceCardLast4: "5555",
      payerName: "Student",
      receiptUrl: null,
      initialValidationResult: { valid: true },
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await adminService.approvePayment(adminUser.userId, res.paymentId);
    const wallet = await walletService.getMyWallet(testUser);
    expect(wallet.balance).toBe(1_000_000);
  });

  it("6. Sequential top-ups with distinct custom amounts accumulate accurately", async () => {
    const topupProduct = (await commerceService.listActiveProducts()).find(
      (p) => p.type === "wallet_topup",
    )!;

    const amounts = [12_500, 350_000, 80_000, 1_200_000];
    let expectedTotal = 0;

    for (let i = 0; i < amounts.length; i++) {
      const amt = amounts[i];
      expectedTotal += amt;

      const res = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: amt,
          trackingNumber: `TRK-SEQ-${i}`,
          sourceCardLast4: `990${i}`,
        },
        `req-seq-${i}`,
      );

      adminStore.memoryPayments.push({
        id: res.paymentId,
        orderId: res.orderId,
        orderNumber: `C2C-SEQ-${i}`,
        userId: testUser.userId,
        userEmail: "student@test.com",
        userName: "Student",
        productTitle: "شارژ کیف پول",
        amount: amt,
        currency: "toman",
        gateway: "card_to_card",
        authority: null,
        transactionId: `TRK-SEQ-${i}`,
        status: "pending_admin_review",
        trackingNumber: `TRK-SEQ-${i}`,
        sourceCardLast4: `990${i}`,
        payerName: "Student",
        receiptUrl: null,
        initialValidationResult: { valid: true },
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      await adminService.approvePayment(adminUser.userId, res.paymentId);
    }

    const wallet = await walletService.getMyWallet(testUser);
    expect(wallet.balance).toBe(expectedTotal);
  });

  it("7. Changing subscription catalog prices has ZERO effect on wallet top-up amounts", async () => {
    const topupProduct = (await commerceService.listActiveProducts()).find(
      (p) => p.type === "wallet_topup",
    )!;

    // Mutate subscription price in store
    const monthlySub = (await commerceService.listActiveProducts()).find(
      (p) => p.code === "sub_monthly",
    )!;
    monthlySub.price = 999_999;

    const topupAmount = 75_000;
    const res = await commerceService.submitCardToCardPayment(
      testUser,
      {
        productId: topupProduct.id,
        amount: topupAmount,
        trackingNumber: "TRK-PRICE-INDEP",
        sourceCardLast4: "6666",
      },
      "req-indep",
    );

    const payment = await commerceService.getPayment(testUser, res.paymentId);
    expect(payment.amount).toBe(75_000);
    expect(payment.amount).not.toBe(999_999);

    adminStore.memoryPayments.push({
      id: res.paymentId,
      orderId: res.orderId,
      orderNumber: "C2C-INDEP",
      userId: testUser.userId,
      userEmail: "student@test.com",
      userName: "Student",
      productTitle: "شارژ کیف پول",
      amount: 75_000,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: "TRK-PRICE-INDEP",
      status: "pending_admin_review",
      trackingNumber: "TRK-PRICE-INDEP",
      sourceCardLast4: "6666",
      payerName: "Student",
      receiptUrl: null,
      initialValidationResult: { valid: true },
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    await adminService.approvePayment(adminUser.userId, res.paymentId);
    const wallet = await walletService.getMyWallet(testUser);
    expect(wallet.balance).toBe(75_000);
  });

  it("8. Subscription purchases still strictly enforce their own product catalog pricing", async () => {
    const monthlySub = (await commerceService.listActiveProducts()).find(
      (p) => p.code === "sub_monthly",
    )!;

    // Attempting to pay an arbitrary amount for subscription fails
    await expect(
      commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: monthlySub.id,
          amount: 50_000, // Mismatched price
          trackingNumber: "TRK-SUB-MISMATCH",
          sourceCardLast4: "7777",
        },
        "req-sub-mismatch",
      ),
    ).rejects.toThrow(/با مبلغ پلن انتخابی.*مطابقت ندارد/);

    // Paying exact subscription price succeeds
    const subRes = await commerceService.submitCardToCardPayment(
      testUser,
      {
        productId: monthlySub.id,
        amount: monthlySub.price,
        trackingNumber: "TRK-SUB-EXACT",
        sourceCardLast4: "7777",
      },
      "req-sub-exact",
    );

    expect(subRes.success).toBe(true);
    expect(subRes.subscriptionId).toBeDefined();
  });

  it("9. Validation rejects 0, negative, floating-point, and below-minimum (<10,000) top-up amounts", async () => {
    const topupProduct = (await commerceService.listActiveProducts()).find(
      (p) => p.type === "wallet_topup",
    )!;

    // 0
    await expect(
      commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: 0,
          trackingNumber: "TRK-VAL-0",
          sourceCardLast4: "8888",
        },
        "req-val-0",
      ),
    ).rejects.toThrow();

    // Negative
    await expect(
      commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: -50_000,
          trackingNumber: "TRK-VAL-NEG",
          sourceCardLast4: "8888",
        },
        "req-val-neg",
      ),
    ).rejects.toThrow();

    // Float
    await expect(
      commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: 25_000.75,
          trackingNumber: "TRK-VAL-FLOAT",
          sourceCardLast4: "8888",
        },
        "req-val-float",
      ),
    ).rejects.toThrow();

    // Below 10,000
    await expect(
      commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: 9_999,
          trackingNumber: "TRK-VAL-9999",
          sourceCardLast4: "8888",
        },
        "req-val-9999",
      ),
    ).rejects.toThrow(/حداقل مبلغ شارژ کیف پول ۱۰,۰۰۰ تومان است/);
  });
});
