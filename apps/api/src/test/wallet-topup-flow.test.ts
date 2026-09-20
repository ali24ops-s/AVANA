import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asUserId,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { InMemoryNotificationStore } from "../modules/notifications/drizzle-stores.js";
import { NotificationService } from "../modules/notifications/notification-service.js";

describe("Wallet Top-up End-to-End System (شارژ کیف پول با کارت‌به‌کارت و تأیید ادمین)", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let commerceService: CommerceService;
  let adminStore: InMemoryAdminStore;
  let adminService: AdminService;
  let notificationStore: InMemoryNotificationStore;
  let notificationService: NotificationService;

  const testUser: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "student",
  };

  const secondUser: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "student",
  };

  const adminUser: Actor = {
    userId: asUserId(randomUUID() as any),
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
    notificationStore = new InMemoryNotificationStore();
    notificationService = new NotificationService(notificationStore);

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
    adminService = new AdminService(
      adminStore,
      walletService,
      commerceStore,
      notificationService,
    );
  });

  describe("1. Top-up Product Discovery & Validation", () => {
    it("has canonical wallet_topup product registered with targetType=wallet", async () => {
      const products = await commerceService.listActiveProducts();
      const topupProduct = products.find((p) => p.type === "wallet_topup");
      expect(topupProduct).toBeDefined();
      expect(topupProduct?.code).toBe("wallet_topup");
      expect(topupProduct?.targetType).toBe("wallet");
    });

    it("enforces minimum top-up amount of 10,000 Tomans", async () => {
      const topupProduct = (await commerceService.listActiveProducts()).find(
        (p) => p.type === "wallet_topup",
      )!;

      // Below minimum
      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: topupProduct.id,
            amount: 5000,
            trackingNumber: "TRK-TOPUP-MIN",
            sourceCardLast4: "1234",
          },
          "req-min-1",
        ),
      ).rejects.toThrow("حداقل مبلغ شارژ کیف پول ۱۰,۰۰۰ تومان است");

      // Negative amount
      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: topupProduct.id,
            amount: -10000,
            trackingNumber: "TRK-TOPUP-NEG",
            sourceCardLast4: "1234",
          },
          "req-min-2",
        ),
      ).rejects.toThrow();

      // Non-integer amount
      await expect(
        commerceService.submitCardToCardPayment(
          testUser,
          {
            productId: topupProduct.id,
            amount: 10000.5,
            trackingNumber: "TRK-TOPUP-FLOAT",
            sourceCardLast4: "1234",
          },
          "req-min-3",
        ),
      ).rejects.toThrow();
    });
  });

  describe("2. Top-up Submission & Zero Immediate Balance Guarantee", () => {
    it("creates pending order and payment with zero immediate wallet balance increase and no subscription/entitlement", async () => {
      // 1. Initial wallet balance is 0
      const initialWallet = await walletService.getMyWallet(testUser);
      expect(initialWallet.balance).toBe(0);

      const topupProduct = (await commerceService.listActiveProducts()).find(
        (p) => p.type === "wallet_topup",
      )!;

      const topupAmount = 150_000;

      // 2. Submit top-up request
      const result = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: topupAmount,
          trackingNumber: "TRK-TOPUP-001",
          sourceCardLast4: "6037",
          payerName: "کاربر تست شارژ",
        },
        "req-topup-1",
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe("pending_admin_review");
      expect(result.message).toContain("شارژ کیف پول");

      // 3. CRITICAL INVARIANT: Wallet balance MUST REMAIN 0 before admin approval
      const afterSubmitWallet = await walletService.getMyWallet(testUser);
      expect(afterSubmitWallet.balance).toBe(0);

      // 4. Verify no subscription was created
      const sub = await commerceService.getMySubscription(testUser.userId);
      expect(sub).toBeNull();

      // 5. Verify no wallet transactions logged yet
      const txs = await walletService.listMyTransactions(testUser);
      expect(txs.total).toBe(0);
      expect(txs.transactions).toHaveLength(0);

      // 6. Verify top-up appears in user's top-up requests list with status pending_admin_review
      const topupsRes = await walletService.listMyTopupRequests(testUser);
      expect(topupsRes.topups).toHaveLength(1);
      expect(topupsRes.topups[0].amount).toBe(topupAmount);
      expect(topupsRes.topups[0].status).toBe("pending_admin_review");
      expect(topupsRes.topups[0].tracking_number).toBe("TRK-TOPUP-001");
      expect(topupsRes.topups[0].source_card_last4).toBe("6037");
    });
  });

  describe("3. Admin Approval & Wallet Crediting", () => {
    it("credits wallet atomically upon admin approval, updates ledger, and ensures idempotency", async () => {
      const topupAmount = 50_000;
      const topupProduct = (await commerceService.listActiveProducts()).find(
        (p) => p.type === "wallet_topup",
      )!;

      const submission = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: topupAmount,
          trackingNumber: "TRK-TOPUP-APP",
          sourceCardLast4: "5022",
        },
        "req-topup-app-1",
      );
      const paymentId = submission.paymentId;
      const orderId = submission.orderId;

      // Wallet before approval
      const preWallet = await walletService.getMyWallet(testUser);
      expect(preWallet.balance).toBe(0);

      // Verify top-up list shows pending_admin_review before approval
      const userTopupsBefore = await walletService.listMyTopupRequests(testUser);
      expect(userTopupsBefore.topups).toHaveLength(1);
      expect(userTopupsBefore.topups[0].status).toBe("pending_admin_review");

      // Admin Approves payment
      const approveResult = await adminService.approvePayment(adminUser.userId, paymentId);
      expect(approveResult.success).toBe(true);
      expect(approveResult.payment.status).toBe("admin_approved");

      // Verify top-up list shows admin_approved status to the user
      const userTopupsAfterApprove = await walletService.listMyTopupRequests(testUser);
      expect(userTopupsAfterApprove.topups).toHaveLength(1);
      expect(userTopupsAfterApprove.topups[0].status).toBe("admin_approved");

      // Verify wallet balance increased by exactly topupAmount
      const postWallet = await walletService.getMyWallet(testUser);
      expect(postWallet.balance).toBe(topupAmount);

      // Verify ledger entry
      const txs = await walletService.listMyTransactions(testUser);
      expect(txs.total).toBe(1);
      const tx = txs.transactions[0];
      expect(tx.type).toBe("credit");
      expect(tx.amount).toBe(topupAmount);
      expect(tx.balance_before).toBe(0);
      expect(tx.balance_after).toBe(topupAmount);
      expect(tx.source).toBe("wallet_topup");
      expect(tx.reference_type).toBe("order");
      expect(tx.reference_id).toBe(orderId);

      // Verify notification sent to user for approval
      const userNotifs = await notificationService.listForUser(testUser.userId);
      expect(userNotifs.items).toHaveLength(1);
      expect(userNotifs.items[0].type).toBe("wallet_topup_approved");
      expect(userNotifs.items[0].title).toBe("شارژ کیف پول تأیید شد");
      expect(userNotifs.items[0].message).toContain("۵۰,۰۰۰ تومان");
      expect(userNotifs.items[0].action?.url).toBe("/account/wallet");

      // IDEMPOTENCY: Repeating approval must NOT increase balance again and NOT duplicate notification
      const repeatResult = await adminService.approvePayment(adminUser.userId, paymentId);
      expect(repeatResult.success).toBe(true);
      expect(repeatResult.message).toContain("قبلاً تأیید شده");

      const postRepeatWallet = await walletService.getMyWallet(testUser);
      expect(postRepeatWallet.balance).toBe(topupAmount);

      const repeatTxs = await walletService.listMyTransactions(testUser);
      expect(repeatTxs.total).toBe(1);

      const userNotifsAfterRepeat = await notificationService.listForUser(testUser.userId);
      expect(userNotifsAfterRepeat.items).toHaveLength(1);
    });
  });

  describe("4. Admin Rejection Flow", () => {
    it("does not credit wallet when payment is rejected, records rejection reason, and sends rejection notification", async () => {
      const topupAmount = 75_000;
      const topupProduct = (await commerceService.listActiveProducts()).find(
        (p) => p.type === "wallet_topup",
      )!;

      const submission = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: topupAmount,
          trackingNumber: "TRK-TOPUP-REJ",
          sourceCardLast4: "9999",
        },
        "req-topup-rej-1",
      );
      const paymentId = submission.paymentId;
      const orderId = submission.orderId;

      // Admin Rejects
      const rejectionReason = "کد رهگیری در سامانه پایا بانک یافت نشد.";
      const rejectResult = await adminService.rejectPayment(
        adminUser.userId,
        paymentId,
        rejectionReason,
      );

      expect(rejectResult.success).toBe(true);
      expect(rejectResult.payment.status).toBe("admin_rejected");
      expect(rejectResult.payment.rejectionReason).toBe(rejectionReason);

      // Verify top-up list shows admin_rejected status with reason to the user
      const userTopupsAfterReject = await walletService.listMyTopupRequests(testUser);
      expect(userTopupsAfterReject.topups).toHaveLength(1);
      expect(userTopupsAfterReject.topups[0].status).toBe("admin_rejected");
      expect(userTopupsAfterReject.topups[0].rejection_reason).toBe(rejectionReason);

      // Wallet balance remains 0
      const wallet = await walletService.getMyWallet(testUser);
      expect(wallet.balance).toBe(0);

      // No ledger entry created
      const txs = await walletService.listMyTransactions(testUser);
      expect(txs.total).toBe(0);

      // Order status updated to cancelled
      const order = commerceStore.orders.find((o) => o.id === orderId);
      expect(order?.status).toBe("cancelled");

      // Verify rejection notification sent to user
      const userNotifs = await notificationService.listForUser(testUser.userId);
      expect(userNotifs.items).toHaveLength(1);
      expect(userNotifs.items[0].type).toBe("wallet_topup_rejected");
      expect(userNotifs.items[0].title).toBe("شارژ کیف پول رد شد");
      expect(userNotifs.items[0].message).toContain("۷۵,۰۰۰ تومان");
      expect(userNotifs.items[0].message).toContain(rejectionReason);
      expect(userNotifs.items[0].action?.url).toBe("/account/wallet");

      // IDEMPOTENCY: Repeating rejection must NOT duplicate notification
      const repeatRejectResult = await adminService.rejectPayment(
        adminUser.userId,
        paymentId,
        rejectionReason,
      );
      expect(repeatRejectResult.success).toBe(true);
      const userNotifsAfterRepeat = await notificationService.listForUser(testUser.userId);
      expect(userNotifsAfterRepeat.items).toHaveLength(1);
    });
  });

  describe("5. Multi-User Isolation & Concurrency", () => {
    it("handles multiple users charging wallet independently without crosstalk", async () => {
      // User 1 submits 100,000
      const paymentId1 = `pay_usr1_${Date.now()}`;
      const orderId1 = `ord_usr1_${Date.now()}`;
      adminStore.memoryOrders.push({
        id: orderId1,
        orderNumber: "ORD-U1",
        userId: testUser.userId,
        userEmail: "u1@test.com",
        userName: "User 1",
        productId: "prod_wallet_topup",
        productTitle: "شارژ کیف پول",
        productType: "wallet_topup",
        amount: 100_000,
        currency: "toman",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      adminStore.memoryPayments.push({
        id: paymentId1,
        orderId: orderId1,
        orderNumber: "ORD-U1",
        userId: testUser.userId,
        userEmail: "u1@test.com",
        userName: "User 1",
        productTitle: "شارژ کیف پول",
        amount: 100_000,
        currency: "toman",
        gateway: "card_to_card",
        authority: null,
        transactionId: "TRK-U1",
        status: "pending_admin_review",
        trackingNumber: "TRK-U1",
        sourceCardLast4: "1111",
        payerName: "User 1",
        receiptUrl: null,
        initialValidationResult: { valid: true },
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      // User 2 submits 300,000
      const paymentId2 = `pay_usr2_${Date.now()}`;
      const orderId2 = `ord_usr2_${Date.now()}`;
      adminStore.memoryOrders.push({
        id: orderId2,
        orderNumber: "ORD-U2",
        userId: secondUser.userId,
        userEmail: "u2@test.com",
        userName: "User 2",
        productId: "prod_wallet_topup",
        productTitle: "شارژ کیف پول",
        productType: "wallet_topup",
        amount: 300_000,
        currency: "toman",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      adminStore.memoryPayments.push({
        id: paymentId2,
        orderId: orderId2,
        orderNumber: "ORD-U2",
        userId: secondUser.userId,
        userEmail: "u2@test.com",
        userName: "User 2",
        productTitle: "شارژ کیف پول",
        amount: 300_000,
        currency: "toman",
        gateway: "card_to_card",
        authority: null,
        transactionId: "TRK-U2",
        status: "pending_admin_review",
        trackingNumber: "TRK-U2",
        sourceCardLast4: "2222",
        payerName: "User 2",
        receiptUrl: null,
        initialValidationResult: { valid: true },
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        paidAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      // Approve User 1
      await adminService.approvePayment(adminUser.userId, paymentId1);

      // Verify User 1 has 100,000 and User 2 still has 0
      const u1Wallet = await walletService.getMyWallet(testUser);
      const u2Wallet = await walletService.getMyWallet(secondUser);
      expect(u1Wallet.balance).toBe(100_000);
      expect(u2Wallet.balance).toBe(0);

      // Approve User 2
      await adminService.approvePayment(adminUser.userId, paymentId2);

      // Verify User 2 has 300,000
      const u2WalletFinal = await walletService.getMyWallet(secondUser);
      expect(u2WalletFinal.balance).toBe(300_000);
    });
  });
});

