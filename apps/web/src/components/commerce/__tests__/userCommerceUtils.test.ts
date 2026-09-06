import { describe, it, expect } from "vitest";
import {
  calculateRemainingTime,
  calculateSubscriptionProgress,
  formatToman,
  formatPersianDate,
  getOrderStatusBadge,
  getSubscriptionStatusBadge,
  getUrgencyBadge,
  getUserChipSubscriptionInfo,
} from "../userCommerceUtils.js";

describe("userCommerceUtils", () => {
  describe("calculateRemainingTime", () => {
    const fixedNow = new Date("2026-09-01T12:00:00Z");

    it("handles null / undefined / empty expiresAt", () => {
      const resNull = calculateRemainingTime(null, fixedNow);
      expect(resNull.isExpired).toBe(true);
      expect(resNull.urgency).toBe("expired");
      expect(resNull.days).toBe(0);
      expect(resNull.hours).toBe(0);

      const resUndef = calculateRemainingTime(undefined, fixedNow);
      expect(resUndef.isExpired).toBe(true);
      expect(resUndef.urgency).toBe("expired");
    });

    it("handles past expiration dates (expired)", () => {
      const pastDate = new Date("2026-08-30T12:00:00Z").toISOString();
      const res = calculateRemainingTime(pastDate, fixedNow);
      expect(res.isExpired).toBe(true);
      expect(res.urgency).toBe("expired");
      expect(res.text).toContain("منقضی");
    });

    it("calculates >7 days as normal urgency", () => {
      // 20 days and 4 hours in the future
      const futureDate = new Date("2026-09-21T16:00:00Z").toISOString();
      const res = calculateRemainingTime(futureDate, fixedNow);
      expect(res.isExpired).toBe(false);
      expect(res.urgency).toBe("normal");
      expect(res.days).toBe(20);
      expect(res.hours).toBe(4);
      expect(res.text).toContain("روز");
      expect(res.text).toContain("ساعت");
    });

    it("calculates 3-7 days as warning urgency", () => {
      // 5 days and 2 hours in future
      const futureDate = new Date("2026-09-06T14:00:00Z").toISOString();
      const res = calculateRemainingTime(futureDate, fixedNow);
      expect(res.isExpired).toBe(false);
      expect(res.urgency).toBe("warning");
      expect(res.days).toBe(5);
      expect(res.hours).toBe(2);
    });

    it("calculates 1-3 days as serious urgency", () => {
      // 2 days in future
      const futureDate = new Date("2026-09-03T12:00:00Z").toISOString();
      const res = calculateRemainingTime(futureDate, fixedNow);
      expect(res.isExpired).toBe(false);
      expect(res.urgency).toBe("serious");
      expect(res.days).toBe(2);
    });

    it("calculates <1 day (hours only) as critical urgency", () => {
      // 6 hours in future
      const futureDate = new Date("2026-09-01T18:00:00Z").toISOString();
      const res = calculateRemainingTime(futureDate, fixedNow);
      expect(res.isExpired).toBe(false);
      expect(res.urgency).toBe("critical");
      expect(res.days).toBe(0);
      expect(res.hours).toBe(6);
      expect(res.text).toContain("ساعت باقی‌مانده");
    });
  });

  describe("calculateSubscriptionProgress", () => {
    const start = "2026-09-01T00:00:00Z";
    const end = "2026-09-11T00:00:00Z"; // 10 days total

    it("returns 0% when now is at or before start", () => {
      const now = new Date("2026-09-01T00:00:00Z");
      expect(calculateSubscriptionProgress(start, end, now)).toBe(0);
    });

    it("returns 50% when halfway through", () => {
      const now = new Date("2026-09-06T00:00:00Z");
      expect(calculateSubscriptionProgress(start, end, now)).toBe(50);
    });

    it("returns 100% when at or past expiration", () => {
      const now = new Date("2026-09-15T00:00:00Z");
      expect(calculateSubscriptionProgress(start, end, now)).toBe(100);
    });

    it("handles invalid or null dates safely", () => {
      expect(calculateSubscriptionProgress(null, end)).toBe(0);
      expect(calculateSubscriptionProgress(start, null)).toBe(0);
      expect(calculateSubscriptionProgress("invalid", end)).toBe(0);
    });
  });

  describe("formatToman", () => {
    it("formats integer amounts in Tomans", () => {
      const res = formatToman(199000);
      expect(res).toContain("تومان");
      expect(formatToman(0)).toBe("۰ تومان");
      expect(formatToman(null)).toBe("۰ تومان");
    });
  });

  describe("formatPersianDate", () => {
    it("formats ISO string into Persian date", () => {
      const res = formatPersianDate("2026-09-01T12:00:00Z");
      expect(res).not.toBe("—");
      expect(typeof res).toBe("string");
    });

    it("returns placeholder for empty / null date", () => {
      expect(formatPersianDate(null)).toBe("—");
      expect(formatPersianDate(undefined)).toBe("—");
    });
  });

  describe("getOrderStatusBadge", () => {
    it("resolves paid badge", () => {
      const badge = getOrderStatusBadge("paid");
      expect(badge.label).toBe("پرداخت شده");
      expect(badge.className).toContain("emerald");
    });

    it("resolves pending badge", () => {
      const badge = getOrderStatusBadge("pending");
      expect(badge.label).toBe("در انتظار پرداخت");
      expect(badge.className).toContain("amber");
    });

    it("resolves failed badge", () => {
      const badge = getOrderStatusBadge("failed");
      expect(badge.label).toBe("ناموفق");
      expect(badge.className).toContain("rose");
    });
  });

  describe("getSubscriptionStatusBadge", () => {
    it("resolves active badge", () => {
      const badge = getSubscriptionStatusBadge("active");
      expect(badge.label).toBe("اشتراک فعال");
      expect(badge.className).toContain("teal");
    });

    it("resolves expired badge", () => {
      const badge = getSubscriptionStatusBadge("expired");
      expect(badge.label).toBe("منقضی شده");
      expect(badge.className).toContain("rose");
    });
  });

  describe("getUrgencyBadge", () => {
    it("returns correct urgency classes", () => {
      expect(getUrgencyBadge("critical").className).toContain("animate-pulse");
      expect(getUrgencyBadge("warning").className).toContain("amber");
      expect(getUrgencyBadge("normal").className).toContain("teal");
    });
  });

  describe("getUserChipSubscriptionInfo", () => {
    const fixedNow = new Date("2026-09-01T12:00:00Z");

    it("handles null / undefined subscription (no subscription)", () => {
      const resNull = getUserChipSubscriptionInfo(null, fixedNow);
      expect(resNull.status).toBe("none");
      expect(resNull.badgeLabel).toBeNull();
      expect(resNull.tooltip).toContain("مشاهده و خرید اشتراک");

      const resUndef = getUserChipSubscriptionInfo(undefined, fixedNow);
      expect(resUndef.status).toBe("none");
      expect(resUndef.badgeLabel).toBeNull();
    });

    it("handles missing / null expiration date on subscription record", () => {
      const res = getUserChipSubscriptionInfo(
        { status: "active", expires_at: null },
        fixedNow,
      );
      expect(res.status).toBe("expired");
      expect(res.badgeLabel).toBe("منقضی شده");

      const resUndef = getUserChipSubscriptionInfo(
        { status: "active", expires_at: undefined },
        fixedNow,
      );
      expect(resUndef.status).toBe("expired");
      expect(resUndef.badgeLabel).toBe("منقضی شده");
    });

    it("handles explicit expired or cancelled status", () => {
      const resExpired = getUserChipSubscriptionInfo(
        { status: "expired", expires_at: "2026-09-10T12:00:00Z" },
        fixedNow,
      );
      expect(resExpired.status).toBe("expired");
      expect(resExpired.badgeLabel).toBe("منقضی شده");

      const resCancelled = getUserChipSubscriptionInfo(
        { status: "cancelled", expires_at: "2026-09-10T12:00:00Z" },
        fixedNow,
      );
      expect(resCancelled.status).toBe("expired");
      expect(resCancelled.badgeLabel).toBe("منقضی شده");
    });

    it("handles past expiration date (naturally expired)", () => {
      const pastDate = new Date("2026-08-31T12:00:00Z").toISOString();
      const res = getUserChipSubscriptionInfo(
        { status: "active", expires_at: pastDate },
        fixedNow,
      );
      expect(res.status).toBe("expired");
      expect(res.badgeLabel).toBe("منقضی شده");
      expect(res.tooltip).toContain("منقضی شده است");
    });

    it("handles active with > 5 days remaining (shows 'فعال')", () => {
      // 10 days in future
      const futureDate10 = new Date("2026-09-11T12:00:00Z").toISOString();
      const res10 = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDate10 },
        fixedNow,
      );
      expect(res10.status).toBe("active");
      expect(res10.badgeLabel).toBe("فعال");
      expect(res10.tooltip).toContain("اشتراک فعال");

      // 6 days in future
      const futureDate6 = new Date("2026-09-07T14:00:00Z").toISOString();
      const res6 = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDate6 },
        fixedNow,
      );
      expect(res6.status).toBe("active");
      expect(res6.badgeLabel).toBe("فعال");
    });

    it("handles exactly 5 days remaining (shows '۵ روز باقیمانده')", () => {
      // exactly 5 days in future (5 * 24h = 120h)
      const futureDate5 = new Date("2026-09-06T12:00:00Z").toISOString();
      const res5 = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDate5 },
        fixedNow,
      );
      expect(res5.status).toBe("expiring_soon");
      expect(res5.badgeLabel).toBe("۵ روز باقیمانده");
      expect(res5.tooltip).toContain("اشتراک رو به پایان");
    });

    it("handles 4 days remaining (shows '۴ روز باقیمانده')", () => {
      const futureDate4 = new Date("2026-09-05T14:00:00Z").toISOString();
      const res4 = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDate4 },
        fixedNow,
      );
      expect(res4.status).toBe("expiring_soon");
      expect(res4.badgeLabel).toBe("۴ روز باقیمانده");
    });

    it("handles 3 days remaining (shows '۳ روز باقیمانده')", () => {
      const futureDate3 = new Date("2026-09-04T12:00:00Z").toISOString();
      const res3 = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDate3 },
        fixedNow,
      );
      expect(res3.status).toBe("expiring_soon");
      expect(res3.badgeLabel).toBe("۳ روز باقیمانده");
    });

    it("handles 2 days remaining (shows '۲ روز باقیمانده')", () => {
      const futureDate2 = new Date("2026-09-03T12:00:00Z").toISOString();
      const res2 = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDate2 },
        fixedNow,
      );
      expect(res2.status).toBe("expiring_soon");
      expect(res2.badgeLabel).toBe("۲ روز باقیمانده");
    });

    it("handles 1 day remaining (shows '۱ روز باقیمانده')", () => {
      const futureDate1 = new Date("2026-09-02T16:00:00Z").toISOString();
      const res1 = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDate1 },
        fixedNow,
      );
      expect(res1.status).toBe("expiring_soon");
      expect(res1.badgeLabel).toBe("۱ روز باقیمانده");
    });

    it("handles less than 24 hours remaining (shows 'کمتر از ۱ روز')", () => {
      // 8 hours in future
      const futureDateHours = new Date("2026-09-01T20:00:00Z").toISOString();
      const resHours = getUserChipSubscriptionInfo(
        { status: "active", expires_at: futureDateHours },
        fixedNow,
      );
      expect(resHours.status).toBe("expiring_soon");
      expect(resHours.badgeLabel).toBe("کمتر از ۱ روز");
      expect(resHours.tooltip).toContain("۸ ساعت باقی‌مانده");
    });
  });
});
