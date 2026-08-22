import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { formatPersianDate, useCurrentPersianDate } from "./date.js";

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
});
