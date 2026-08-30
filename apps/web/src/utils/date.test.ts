import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  formatPersianDate,
  useCurrentPersianDate,
  calculateDaysRemaining,
  formatPersianExamDate,
  gregorianToJalali,
  jalaliToGregorian,
  getJalaliMonthDays,
  getJalaliFirstDayOfWeek,
} from "./date.js";

describe("Persian Date Utilities (utils/date.ts)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatPersianDate", () => {
    it("correctly formats Gregorian dates into Jalali components with Persian digits and names", () => {
      // 2026-08-20 -> 29 Mordad 1405 (Thursday / پنجشنبه)
      const date1 = new Date(2026, 7, 20, 12, 0, 0);
      const res1 = formatPersianDate(date1);

      expect(res1.year).toBe("۱۴۰۵");
      expect(res1.month).toBe("مرداد");
      expect(res1.day).toBe("۲۹");
      expect(res1.weekday).toBe("پنجشنبه");
      expect(res1.formattedHeader).toBe("پنجشنبه، ۲۹ مرداد");
      expect(res1.fullDate).toBe("پنجشنبه، ۲۹ مرداد ۱۴۰۵");

      // 2026-08-21 -> 30 Mordad 1405 (Friday / جمعه)
      const date2 = new Date(2026, 7, 21, 12, 0, 0);
      const res2 = formatPersianDate(date2);

      expect(res2.year).toBe("۱۴۰۵");
      expect(res2.month).toBe("مرداد");
      expect(res2.day).toBe("۳۰");
      expect(res2.weekday).toBe("جمعه");
      expect(res2.formattedHeader).toBe("جمعه، ۳۰ مرداد");
      expect(res2.fullDate).toBe("جمعه، ۳۰ مرداد ۱۴۰۵");
    });

    it("correctly formats historical and future dates dynamically (not hardcoded)", () => {
      // Nowruz 1404: 2025-03-21 -> 1 Farvardin 1404 (Friday / جمعه)
      const nowruz = new Date(2025, 2, 21, 10, 0, 0);
      const resNowruz = formatPersianDate(nowruz);

      expect(resNowruz.year).toBe("۱۴۰۴");
      expect(resNowruz.month).toBe("فروردین");
      expect(resNowruz.day).toBe("۱");
      expect(resNowruz.weekday).toBe("جمعه");

      // Autumn date: 2024-10-03 -> 12 Mehr 1403 (Thursday / پنجشنبه)
      const autumn = new Date(2024, 9, 3, 10, 0, 0);
      const resAutumn = formatPersianDate(autumn);

      expect(resAutumn.year).toBe("۱۴۰۳");
      expect(resAutumn.month).toBe("مهر");
      expect(resAutumn.day).toBe("۱۲");
      expect(resAutumn.weekday).toBe("پنجشنبه");
    });

    it("is timezone-safe across midnight boundary", () => {
      // 23:59:59 on 2026-08-20 (local time)
      const beforeMidnight = new Date(2026, 7, 20, 23, 59, 59);
      const resBefore = formatPersianDate(beforeMidnight);
      expect(resBefore.day).toBe("۲۹");
      expect(resBefore.weekday).toBe("پنجشنبه");

      // 00:00:01 on 2026-08-21 (local time next day)
      const afterMidnight = new Date(2026, 7, 21, 0, 0, 1);
      const resAfter = formatPersianDate(afterMidnight);
      expect(resAfter.day).toBe("۳۰");
      expect(resAfter.weekday).toBe("جمعه");
    });
  });

  describe("useCurrentPersianDate Hook", () => {
    it("returns dynamic date and automatically rolls over to the next day at local midnight", () => {
      // Set system time to 23:59:50 on 2026-08-20 (10 seconds before midnight)
      const initialTime = new Date(2026, 7, 20, 23, 59, 50);
      vi.setSystemTime(initialTime);

      const { result } = renderHook(() => useCurrentPersianDate());

      expect(result.current.day).toBe("۲۹");
      expect(result.current.weekday).toBe("پنجشنبه");
      expect(result.current.formattedHeader).toBe("پنجشنبه، ۲۹ مرداد");

      // Advance time by 15 seconds (crossing midnight into 2026-08-21)
      act(() => {
        vi.advanceTimersByTime(15 * 1000);
      });

      expect(result.current.day).toBe("۳۰");
      expect(result.current.weekday).toBe("جمعه");
      expect(result.current.formattedHeader).toBe("جمعه، ۳۰ مرداد");
    });

    it("refreshes date when visibility changes to visible", () => {
      const initialTime = new Date(2026, 7, 20, 10, 0, 0);
      vi.setSystemTime(initialTime);

      const { result } = renderHook(() => useCurrentPersianDate());
      expect(result.current.day).toBe("۲۹");

      // Simulate system sleep / time jump by 2 days while inactive
      vi.setSystemTime(new Date(2026, 7, 22, 10, 0, 0));

      act(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(result.current.day).toBe("۳۱");
      expect(result.current.weekday).toBe("شنبه");
    });

    it("cleans up timer on unmount", () => {
      const initialTime = new Date(2026, 7, 20, 12, 0, 0);
      vi.setSystemTime(initialTime);

      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      const { unmount } = renderHook(() => useCurrentPersianDate());

      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe("calculateDaysRemaining", () => {
    it("calculates 0 days for today", () => {
      const now = new Date(2026, 7, 20, 14, 30, 0);
      const examStr = "2026-08-20T09:00:00Z";
      expect(calculateDaysRemaining(examStr, now)).toBe(0);
    });

    it("calculates positive days for future dates", () => {
      const now = new Date(2026, 7, 20, 10, 0, 0);
      const examStr = "2026-08-25T10:00:00Z";
      expect(calculateDaysRemaining(examStr, now)).toBe(5);
    });

    it("calculates negative days for past dates", () => {
      const now = new Date(2026, 7, 20, 10, 0, 0);
      const examStr = "2026-08-15T10:00:00Z";
      expect(calculateDaysRemaining(examStr, now)).toBe(-5);
    });
  });

  describe("formatPersianExamDate", () => {
    it("formats Persian exam dates accurately", () => {
      const date = new Date(2026, 7, 25);
      const formatted = formatPersianExamDate(date);
      expect(formatted).toContain("شهریور");
      expect(formatted).toContain("۱۴۰۵");
    });
  });

  describe("Jalali Conversion & Date Math", () => {
    it("converts Gregorian date to Jalali correctly", () => {
      // 2026-08-20 -> 1405/05/29 (29 Mordad 1405)
      const res = gregorianToJalali(new Date(2026, 7, 20, 12, 0, 0));
      expect(res.jy).toBe(1405);
      expect(res.jm).toBe(5);
      expect(res.jd).toBe(29);
    });

    it("converts Jalali date to Gregorian accurately", () => {
      // 1405/05/29 -> 2026-08-20
      const gDate = jalaliToGregorian(1405, 5, 29);
      expect(gDate.getFullYear()).toBe(2026);
      expect(gDate.getMonth()).toBe(7); // 7 = August (0-indexed)
      expect(gDate.getDate()).toBe(20);
    });

    it("returns correct number of days in Jalali months", () => {
      expect(getJalaliMonthDays(1405, 1)).toBe(31); // Farvardin
      expect(getJalaliMonthDays(1405, 6)).toBe(31); // Shahrivar
      expect(getJalaliMonthDays(1405, 7)).toBe(30); // Mehr
      expect(getJalaliMonthDays(1405, 11)).toBe(30); // Bahman
    });

    it("calculates correct first weekday of Jalali month", () => {
      // 1 Farvardin 1404: 2025-03-21 (Friday -> index 6 in Persian week)
      const firstWeekday = getJalaliFirstDayOfWeek(1404, 1);
      expect(firstWeekday).toBe(6); // Friday
    });
  });
});
