import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asUserId,
} from "@avana/domain";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { PromotionService } from "../modules/commerce/promotion-service.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";

describe("Admin Promotions & Coupon Management Service", () => {
  let adminStore: InMemoryAdminStore;
  let walletStore: InMemoryWalletStore;
  let walletService: WalletService;
  let promotionService: PromotionService;
  let adminService: AdminService;

  const adminActor: Actor = {
    userId: asUserId(randomUUID()),
    role: "admin",
  };

  beforeEach(() => {
    adminStore = new InMemoryAdminStore();
    walletStore = new InMemoryWalletStore();
    walletService = new WalletService(walletStore);
    promotionService = new PromotionService(adminStore, walletService);

    adminService = new AdminService(
      adminStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined, // commerceService
      undefined,
      walletService,
      promotionService,
    );
  });

  it("1. Creates, retrieves, lists, updates, toggles and deletes a promotion", async () => {
    // 1. Create
    const created = await adminService.createCommercePromotion(adminActor.userId, {
      name: "تخفیف ویژه تابستان",
      description: "جشنواره تابستانه",
      benefitType: "percentage_discount",
      benefitValue: 30,
      maxDiscountAmount: 50_000,
      minOrderAmount: 100_000,
      totalUsageLimit: 500,
      perUserUsageLimit: 2,
      active: true,
      code: "SUMMER30",
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("تخفیف ویژه تابستان");
    expect(created.codes.length).toBe(1);
    expect(created.codes[0].code).toBe("SUMMER30");

    // 2. Get
    const fetched = await adminService.getCommercePromotion(created.id);
    expect(fetched.name).toBe("تخفیف ویژه تابستان");
    expect(fetched.benefitValue).toBe(30);

    // 3. List
    const list = await adminService.listCommercePromotions({ page: 1, pageSize: 20, search: "تابستان" });
    expect(list.items.length).toBe(1);
    expect(list.items[0].name).toBe("تخفیف ویژه تابستان");

    // 4. Update
    const updated = await adminService.updateCommercePromotion(adminActor.userId, created.id, {
      name: "تخفیف شگفت‌انگیز تابستان",
      benefitValue: 35,
    });
    expect(updated.name).toBe("تخفیف شگفت‌انگیز تابستان");
    expect(updated.benefitValue).toBe(35);

    // 5. Toggle Active
    const toggled = await adminService.toggleCommercePromotionActive(adminActor.userId, created.id, false);
    expect(toggled.active).toBe(false);

    // 6. Delete
    const deleted = await adminService.deleteCommercePromotion(adminActor.userId, created.id);
    expect(deleted.success).toBe(true);

    const afterDeleteList = await adminService.listCommercePromotions({ page: 1, pageSize: 20 });
    expect(afterDeleteList.items.length).toBe(0);
  });

  it("2. Bulk generates unique promotion codes with prefix and custom maxUses", async () => {
    const promo = await adminService.createCommercePromotion(adminActor.userId, {
      name: "کدهای هدیه سمینار",
      benefitType: "fixed_discount",
      benefitValue: 20_000,
      active: true,
    });

    const bulkRes = await adminService.bulkGenerateCommercePromotionCodes(adminActor.userId, promo.id, {
      count: 25,
      prefix: "SEMINAR-",
      length: 6,
      maxUses: 5,
    });

    expect(bulkRes.count).toBe(25);
    expect(bulkRes.codes.length).toBe(25);

    // Check all start with prefix and are unique
    const uniqueSet = new Set(bulkRes.codes);
    expect(uniqueSet.size).toBe(25);
    for (const c of bulkRes.codes) {
      expect(c.startsWith("SEMINAR-")).toBe(true);
    }

    // Verify detail reflects the new codes and maxUses
    const detail = await adminService.getCommercePromotion(promo.id);
    expect(detail.codes.length).toBe(25);
    expect(detail.codes[0].maxUses).toBe(5);
  });

  it("3. Validates inputs and rejects invalid promotion payloads", async () => {
    // Empty name
    await expect(
      adminService.createCommercePromotion(adminActor.userId, {
        name: "   ",
        benefitType: "percentage_discount",
        benefitValue: 10,
      }),
    ).rejects.toThrow("نام پروموشن الزامی است.");

    // Negative benefitValue
    await expect(
      adminService.createCommercePromotion(adminActor.userId, {
        name: "تخفیف منفی",
        benefitType: "fixed_discount",
        benefitValue: -500,
      }),
    ).rejects.toThrow("مقدار تخفیف باید بیشتر از صفر باشد.");

    // Percentage > 100
    await expect(
      adminService.createCommercePromotion(adminActor.userId, {
        name: "تخفیف نجومی",
        benefitType: "percentage_discount",
        benefitValue: 120,
      }),
    ).rejects.toThrow("درصد تخفیف یا کش‌بک نمی‌تواند بیشتر از 100 باشد.");
  });

  it("4. Accurately tracks timesUsed per code and lists global redemptions", async () => {
    const promo = await adminService.createCommercePromotion(adminActor.userId, {
      name: "پروموشن تست مصرف کد",
      benefitType: "percentage_cashback",
      benefitValue: 15,
      code: "CASH15",
    });

    const promoDetailBefore = await adminService.getCommercePromotion(promo.id);
    expect(promoDetailBefore.codes[0].timesUsed).toBe(0);

    // Simulate completed redemptions in store
    const codeId = promoDetailBefore.codes[0].id;
    adminStore.memoryPromotionRedemptions.push({
      id: randomUUID(),
      promotionId: promo.id,
      codeId,
      code: "CASH15",
      userId: randomUUID(),
      orderId: randomUUID(),
      orderNumber: "ORD-9999",
      benefitType: "percentage_cashback",
      benefitValue: 15,
      discountAmount: 0,
      cashbackAmount: 15_000,
      orderOriginalAmount: 100_000,
      orderFinalAmount: 100_000,
      status: "completed",
      redeemedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    // Verify timesUsed is now 1
    const promoDetailAfter = await adminService.getCommercePromotion(promo.id);
    expect(promoDetailAfter.codes[0].timesUsed).toBe(1);

    // Verify global redemptions listing (when promoId is undefined)
    const globalRedemptions = await adminService.listCommercePromotionRedemptions(undefined, {
      page: 1,
      pageSize: 50,
    });
    expect(globalRedemptions.totalCount).toBe(1);
    expect(globalRedemptions.items[0].code).toBe("CASH15");
    expect(globalRedemptions.items[0].cashbackAmount).toBe(15_000);

    // Verify specific promo redemptions listing
    const specificRedemptions = await adminService.listCommercePromotionRedemptions(promo.id, {
      page: 1,
      pageSize: 50,
    });
    expect(specificRedemptions.totalCount).toBe(1);
    expect(specificRedemptions.items[0].orderNumber).toBe("ORD-9999");
  });
});
