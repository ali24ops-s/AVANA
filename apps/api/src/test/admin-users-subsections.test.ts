import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asUserId,
  asOrderId,
  asPaymentId,
  type UUID,
} from "@avana/domain";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";

describe("Admin Users Subsections — Backend Payment Classification", () => {
  let adminStore: InMemoryAdminStore;
  let commerceStore: InMemoryCommerceStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let adminService: AdminService;

  const testUserId = asUserId(randomUUID() as unknown as UUID);

  beforeEach(() => {
    adminStore = new InMemoryAdminStore();
    commerceStore = new InMemoryCommerceStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore, undefined, commerceStore);
    adminStore.setCommerceStore(commerceStore);
    adminService = new AdminService(adminStore, walletService, commerceStore);

    // Setup 3 distinct transactions for the same test user:
    // 1. Subscription Payment
    adminStore.memoryPayments.push({
      id: asPaymentId(randomUUID() as unknown as UUID),
      orderId: asOrderId(randomUUID() as unknown as UUID),
      orderNumber: "ORD-SUB-901",
      userId: testUserId,
      userEmail: "testuser@avana.test",
      userName: "کاربر آزمایشی",
      productId: "prod_sub_monthly",
      productTitle: "اشتراک ماهانه آوانا",
      productType: "subscription",
      amount: 99000,
      currency: "toman",
      gateway: "zarinpal",
      authority: "AUTH-SUB-1",
      transactionId: "TX-SUB-1",
      status: "paid",
      trackingNumber: null,
      sourceCardLast4: null,
      payerName: null,
      receiptUrl: null,
      initialValidationResult: null,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 2. Product Purchase Payment (Course)
    adminStore.memoryPayments.push({
      id: asPaymentId(randomUUID() as unknown as UUID),
      orderId: asOrderId(randomUUID() as unknown as UUID),
      orderNumber: "ORD-CRS-902",
      userId: testUserId,
      userEmail: "testuser@avana.test",
      userName: "کاربر آزمایشی",
      productId: "prod_course_biology",
      productTitle: "دوره زیست‌شناسی جامع",
      productType: "course",
      amount: 320000,
      currency: "toman",
      gateway: "zarinpal",
      authority: "AUTH-CRS-1",
      transactionId: "TX-CRS-1",
      status: "paid",
      trackingNumber: null,
      sourceCardLast4: null,
      payerName: null,
      receiptUrl: null,
      initialValidationResult: null,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 3. Wallet Top-up Payment (Custom variable amount, e.g. 75,000 Tomans)
    adminStore.memoryPayments.push({
      id: asPaymentId(randomUUID() as unknown as UUID),
      orderId: asOrderId(randomUUID() as unknown as UUID),
      orderNumber: "ORD-WAL-903",
      userId: testUserId,
      userEmail: "testuser@avana.test",
      userName: "کاربر آزمایشی",
      productId: "prod_wallet_topup",
      productTitle: "شارژ کیف پول",
      productType: "wallet_topup",
      amount: 75000,
      currency: "toman",
      gateway: "card_to_card",
      authority: null,
      transactionId: null,
      trackingNumber: "TRK-WAL-75",
      sourceCardLast4: "5566",
      payerName: "کاربر آزمایشی",
      receiptUrl: "https://r2.avana.test/receipts/wal75.jpg",
      status: "pending_admin_review",
      createdAt: new Date().toISOString(),
      paidAt: null,
    });
  });

  it("1. listCommercePayments with category='subscription' returns ONLY subscription payments", async () => {
    const result = await adminService.listCommercePayments({
      page: 1,
      pageSize: 20,
      category: "subscription",
    });

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].orderNumber).toBe("ORD-SUB-901");
    expect(result.payments[0].productType).toBe("subscription");
    expect(result.payments[0].amount).toBe(99000);
  });

  it("2. listCommercePayments with category='product' returns ONLY product purchases", async () => {
    const result = await adminService.listCommercePayments({
      page: 1,
      pageSize: 20,
      category: "product",
    });

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].orderNumber).toBe("ORD-CRS-902");
    expect(result.payments[0].productType).toBe("course");
    expect(result.payments[0].amount).toBe(320000);
  });

  it("3. listCommercePayments with category='wallet_topup' returns ONLY wallet top-ups", async () => {
    const result = await adminService.listCommercePayments({
      page: 1,
      pageSize: 20,
      category: "wallet_topup",
    });

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].orderNumber).toBe("ORD-WAL-903");
    expect(result.payments[0].productType).toBe("wallet_topup");
    expect(result.payments[0].amount).toBe(75000);
  });

  it("4. Cross-check: No overlap or duplicate payments across categories for same user", async () => {
    const [subRes, prodRes, walRes] = await Promise.all([
      adminService.listCommercePayments({ page: 1, pageSize: 20, category: "subscription" }),
      adminService.listCommercePayments({ page: 1, pageSize: 20, category: "product" }),
      adminService.listCommercePayments({ page: 1, pageSize: 20, category: "wallet_topup" }),
    ]);

    const subIds = subRes.payments.map((p) => p.id);
    const prodIds = prodRes.payments.map((p) => p.id);
    const walIds = walRes.payments.map((p) => p.id);

    // Assert disjoint sets (intersection is empty)
    const subProdOverlap = subIds.filter((id) => prodIds.includes(id));
    const subWalOverlap = subIds.filter((id) => walIds.includes(id));
    const prodWalOverlap = prodIds.filter((id) => walIds.includes(id));

    expect(subProdOverlap).toHaveLength(0);
    expect(subWalOverlap).toHaveLength(0);
    expect(prodWalOverlap).toHaveLength(0);
  });
});
