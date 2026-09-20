import { describe, it, expect } from "vitest";
import {
  formatToman,
  formatAmountOnly,
  formatPersianDate,
  getOrderStatusBadge,
  getPaymentStatusBadge,
  getSubscriptionStatusBadge,
  getSourceTypeBadge,
  getResourceTypeLabel,
} from "../commerceUtils.js";

describe("Admin commerceUtils", () => {
  describe("getPaymentStatusBadge", () => {
    it("returns canonical readable emerald badge for paid status", () => {
      const badge = getPaymentStatusBadge("paid");
      expect(badge.label).toBe("موفق (درگاه)");
      expect(badge.className).toBe("bg-emerald-500/10 text-emerald-400 border border-emerald-500/20");
    });

    it("returns canonical readable emerald badge for admin_approved status with matching color/contrast", () => {
      const paidBadge = getPaymentStatusBadge("paid");
      const approvedBadge = getPaymentStatusBadge("admin_approved");
      expect(approvedBadge.label).toBe("تأیید شده ادمین");
      expect(approvedBadge.className).toBe("bg-emerald-500/10 text-emerald-400 border border-emerald-500/20");
      // Must match paid badge class exactly for visual consistency and contrast
      expect(approvedBadge.className).toBe(paidBadge.className);
    });

    it("preserves distinct pending_admin_review status badge", () => {
      const badge = getPaymentStatusBadge("pending_admin_review");
      expect(badge.label).toBe("در انتظار بررسی ادمین");
      expect(badge.className).toContain("amber-500");
    });

    it("preserves admin_rejected status badge", () => {
      const badge = getPaymentStatusBadge("admin_rejected");
      expect(badge.label).toBe("رد شده ادمین");
      expect(badge.className).toContain("rose-500");
    });

    it("preserves standard pending, failed, and cancelled badges", () => {
      expect(getPaymentStatusBadge("pending").className).toContain("amber-500");
      expect(getPaymentStatusBadge("failed").className).toContain("rose-500");
      expect(getPaymentStatusBadge("cancelled").className).toContain("slate-500");
    });

    it("falls back gracefully for unknown status", () => {
      const badge = getPaymentStatusBadge("unknown_status");
      expect(badge.label).toBe("unknown_status");
      expect(badge.className).toContain("slate-800");
    });
  });

  describe("getOrderStatusBadge", () => {
    it("resolves paid order badge to emerald-400 canonical style", () => {
      const badge = getOrderStatusBadge("paid");
      expect(badge.label).toBe("پرداخت شده");
      expect(badge.className).toBe("bg-emerald-500/10 text-emerald-400 border border-emerald-500/20");
    });
  });

  describe("getSubscriptionStatusBadge", () => {
    it("resolves active subscription badge", () => {
      const badge = getSubscriptionStatusBadge("active");
      expect(badge.label).toBe("فعال");
      expect(badge.className).toContain("teal-500");
    });
  });

  describe("getSourceTypeBadge and getResourceTypeLabel", () => {
    it("resolves source type badge and resource labels", () => {
      expect(getSourceTypeBadge("purchase").label).toBe("خرید مستقیم");
      expect(getResourceTypeLabel("subscription")).toBe("اشتراک سراسری");
    });
  });

  describe("formatters", () => {
    it("formats toman amount correctly", () => {
      expect(formatToman(null)).toBe("۰ تومان");
      expect(formatToman(100000)).toContain("تومان");
    });

    it("formats amount only correctly", () => {
      expect(formatAmountOnly(null)).toBe("۰");
      expect(formatAmountOnly(50000)).toBe((50000).toLocaleString("fa-IR"));
    });

    it("formats persian date safely", () => {
      expect(formatPersianDate(null)).toBe("—");
    });
  });
});
