import { describe, it, expect } from "vitest";
import {
  calculatePromotionBenefit,
  validatePromotionEligibility,
  normalizePromotionCode,
  generateRandomCode,
  generateBulkPromotionCodes,
  isWalletTopupProduct,
  type PromotionRecord,
  type PromotionCodeRecord,
  asPromotionId,
  asPromotionCodeId,
  asUserId,
  asProductId,
} from "../index.js";

describe("Promotions Domain Primitives & Invariants", () => {
  const basePromotion: PromotionRecord = {
    id: asPromotionId("11111111-1111-4111-8111-111111111111"),
    name: "تخفیف نوروزی",
    description: "۲۰ درصد تخفیف ویژه",
    benefitType: "percentage_discount",
    benefitValue: 20,
    maxDiscountAmount: 100_000,
    minOrderAmount: 200_000,
    totalUsageLimit: 100,
    perUserUsageLimit: 1,
    active: true,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2026-12-31T23:59:59.000Z",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  const baseCode: PromotionCodeRecord = {
    id: asPromotionCodeId("22222222-2222-4222-8222-222222222222"),
    promotionId: basePromotion.id,
    code: "NOWRUZ20",
    maxUses: null,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  const sampleUser = asUserId("33333333-3333-4333-8333-333333333333");
  const sampleProduct = asProductId("55555555-5555-4555-8555-555555555555");

  describe("1. Pure Benefit Calculations", () => {
    it("calculates 20% discount on 300,000 correctly (60,000 discount, 240,000 payable)", () => {
      const res = calculatePromotionBenefit({
        benefitType: "percentage_discount",
        benefitValue: 20,
        maxDiscountAmount: 100_000,
        eligibleSubtotal: 300_000,
        orderTotal: 300_000,
      });

      expect(res.discountAmount).toBe(60_000);
      expect(res.cashbackAmount).toBe(0);
      expect(res.payableAmount).toBe(240_000);
    });

    it("caps percentage discount at maxDiscountAmount (100,000 cap on 1,000,000 order)", () => {
      const res = calculatePromotionBenefit({
        benefitType: "percentage_discount",
        benefitValue: 20,
        maxDiscountAmount: 100_000,
        eligibleSubtotal: 1_000_000,
        orderTotal: 1_000_000,
      });

      expect(res.discountAmount).toBe(100_000); // 20% would be 200k, capped at 100k
      expect(res.payableAmount).toBe(900_000);
    });

    it("calculates fixed discount (50,000 on 300,000)", () => {
      const res = calculatePromotionBenefit({
        benefitType: "fixed_discount",
        benefitValue: 50_000,
        eligibleSubtotal: 300_000,
        orderTotal: 300_000,
      });

      expect(res.discountAmount).toBe(50_000);
      expect(res.cashbackAmount).toBe(0);
      expect(res.payableAmount).toBe(250_000);
    });

    it("ensures fixed discount greater than eligible subtotal does not make payable negative", () => {
      const res = calculatePromotionBenefit({
        benefitType: "fixed_discount",
        benefitValue: 500_000,
        eligibleSubtotal: 300_000,
        orderTotal: 300_000,
      });

      expect(res.discountAmount).toBe(300_000);
      expect(res.payableAmount).toBe(0);
    });

    it("calculates percentage cashback without reducing payable amount (20% on 500,000)", () => {
      const res = calculatePromotionBenefit({
        benefitType: "percentage_cashback",
        benefitValue: 20,
        eligibleSubtotal: 500_000,
        orderTotal: 500_000,
      });

      expect(res.discountAmount).toBe(0);
      expect(res.cashbackAmount).toBe(100_000);
      expect(res.payableAmount).toBe(500_000); // Payable remains full price
    });

    it("calculates fixed cashback without reducing payable amount (100,000 on 500,000)", () => {
      const res = calculatePromotionBenefit({
        benefitType: "fixed_cashback",
        benefitValue: 100_000,
        eligibleSubtotal: 500_000,
        orderTotal: 500_000,
      });

      expect(res.discountAmount).toBe(0);
      expect(res.cashbackAmount).toBe(100_000);
      expect(res.payableAmount).toBe(500_000);
    });

    it("handles multi-item subtotal (discount applies only to eligible portions)", () => {
      // Order total = 1,000,000, but eligible subtotal = 500,000
      const res = calculatePromotionBenefit({
        benefitType: "percentage_discount",
        benefitValue: 20,
        eligibleSubtotal: 500_000,
        orderTotal: 1_000_000,
      });

      expect(res.discountAmount).toBe(100_000); // 20% of 500k
      expect(res.payableAmount).toBe(900_000); // 1,000,000 - 100,000
    });
  });

  describe("2. Pure Eligibility Validation", () => {
    it("validates a standard eligible promotion successfully", () => {
      const res = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 300_000 }],
        now: new Date("2026-06-01T12:00:00.000Z"),
      });

      expect(res.valid).toBe(true);
      expect(res.eligibleSubtotal).toBe(300_000);
      expect(res.benefit?.discountAmount).toBe(60_000);
      expect(res.benefit?.payableAmount).toBe(240_000);
    });

    it("rejects inactive promotion", () => {
      const res = validatePromotionEligibility(
        { ...basePromotion, active: false },
        baseCode,
        {
          userId: sampleUser,
          items: [{ productId: sampleProduct, price: 300_000 }],
        },
      );

      expect(res.valid).toBe(false);
      expect(res.reason).toContain("غیرفعال");
    });

    it("rejects expired promotion (after endsAt)", () => {
      const res = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 300_000 }],
        now: new Date("2027-01-01T00:00:00.000Z"),
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain("پایان رسیده");
    });

    it("rejects promotion before startsAt", () => {
      const res = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 300_000 }],
        now: new Date("2025-12-31T23:59:59.000Z"),
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain("فرا نرسیده");
    });

    it("rejects when order does not meet minOrderAmount", () => {
      const res = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 150_000 }], // minOrderAmount is 200,000
        now: new Date("2026-06-01T12:00:00.000Z"),
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain("حداقل مبلغ خرید");
    });

    it("rejects when total usage limit is reached", () => {
      const res = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 300_000 }],
        totalActiveRedemptionsCount: 100, // limit is 100
        now: new Date("2026-06-01T12:00:00.000Z"),
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain("سقف استفاده");
    });

    it("rejects when per-user usage limit is reached", () => {
      const res = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 300_000 }],
        userActiveRedemptionsCount: 1, // per user limit is 1
        now: new Date("2026-06-01T12:00:00.000Z"),
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain("قبلاً از این کد تخفیف استفاده کرده‌اید");
    });

    it("strictly rejects wallet_topup product from using coupon", () => {
      const res = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: "wallet_topup", productType: "wallet_topup", price: 300_000 }],
        now: new Date("2026-06-01T12:00:00.000Z"),
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain("کیف پول");
      expect(isWalletTopupProduct({ productType: "wallet_topup" })).toBe(true);
      expect(isWalletTopupProduct({ productId: "wallet_topup" })).toBe(true);
    });

    it("enforces user restriction whitelist", () => {
      const allowedUserId = asUserId("99999999-9999-4999-8999-999999999999");
      const userRestrictions = [
        { id: "1", promotionId: basePromotion.id, userId: allowedUserId, createdAt: "" },
      ];

      // Whitelisted user
      const validRes = validatePromotionEligibility(basePromotion, baseCode, {
        userId: allowedUserId,
        items: [{ productId: sampleProduct, price: 300_000 }],
        userRestrictions,
        now: new Date("2026-06-01T12:00:00.000Z"),
      });
      expect(validRes.valid).toBe(true);

      // Non-whitelisted user
      const invalidRes = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 300_000 }],
        userRestrictions,
        now: new Date("2026-06-01T12:00:00.000Z"),
      });
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.reason).toContain("حساب کاربری شما مجاز نیست");
    });

    it("enforces product restriction whitelist", () => {
      const allowedProduct = asProductId("77777777-7777-4777-8777-777777777777");
      const productRestrictions = [
        { id: "1", promotionId: basePromotion.id, productId: allowedProduct, productType: null, createdAt: "" },
      ];

      // Whitelisted product
      const validRes = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: allowedProduct, price: 300_000 }],
        productRestrictions,
        now: new Date("2026-06-01T12:00:00.000Z"),
      });
      expect(validRes.valid).toBe(true);

      // Non-whitelisted product
      const invalidRes = validatePromotionEligibility(basePromotion, baseCode, {
        userId: sampleUser,
        items: [{ productId: sampleProduct, price: 300_000 }],
        productRestrictions,
        now: new Date("2026-06-01T12:00:00.000Z"),
      });
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.reason).toContain("محصولات انتخابی شما معتبر نیست");
    });
  });

  describe("3. Code Normalization & Bulk Generation", () => {
    it("normalizes promotion codes to trimmed uppercase", () => {
      expect(normalizePromotionCode("  nowruz20  ")).toBe("NOWRUZ20");
      expect(normalizePromotionCode("  ava-special-100  ")).toBe("AVA-SPECIAL-100");
    });

    it("generates random codes with specified prefix and length", () => {
      const code = generateRandomCode(8, "AVA");
      expect(code.startsWith("AVA")).toBe(true);
      expect(code.length).toBe(8);
      expect(/^[A-Z0-9_-]+$/.test(code)).toBe(true);
    });

    it("generates bulk unique codes without internal collision", () => {
      const existing = new Set<string>(["AVA12345", "AVA67890"]);
      const codes = generateBulkPromotionCodes({
        count: 100,
        prefix: "AVA",
        length: 8,
        existingCodes: existing,
      });

      expect(codes.length).toBe(100);
      const uniqueSet = new Set(codes);
      expect(uniqueSet.size).toBe(100);

      // Verify no intersection with existing codes
      for (const c of codes) {
        expect(existing.has(c)).toBe(false);
      }
    });
  });
});
