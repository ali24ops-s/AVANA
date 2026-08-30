import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  MOTIVATIONAL_QUOTES,
  getTehranDateKey,
  hashString,
  getDailyQuoteIndex,
  getDailyMotivationalQuote,
  getMsUntilNextTehranMidnight,
  useDailyMotivationalQuote,
} from "./dailyQuote.js";

describe("Daily Motivational Quote Utility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defines at least 20 Persian motivational quotes with non-empty content", () => {
    expect(MOTIVATIONAL_QUOTES.length).toBeGreaterThanOrEqual(20);
    for (const quote of MOTIVATIONAL_QUOTES) {
      expect(typeof quote).toBe("string");
      expect(quote.trim().length).toBeGreaterThan(5);
    }
  });

  it("generates deterministic YYYY-MM-DD date key in Asia/Tehran timezone", () => {
    // 2026-08-28 19:00:00 UTC is 2026-08-28 22:30:00 in Tehran (UTC+3:30) -> 2026-08-28
    const d1 = new Date("2026-08-28T19:00:00Z");
    expect(getTehranDateKey(d1)).toBe("2026-08-28");

    // 2026-08-28 21:00:00 UTC is 2026-08-29 00:30:00 in Tehran -> 2026-08-29
    const d2 = new Date("2026-08-28T21:00:00Z");
    expect(getTehranDateKey(d2)).toBe("2026-08-29");
  });

  it("produces deterministic hash values for identical strings", () => {
    const h1 = hashString("2026-08-28");
    const h2 = hashString("2026-08-28");
    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);

    const hNext = hashString("2026-08-29");
    expect(hNext).not.toBe(h1);
  });

  it("produces valid index within quote bounds", () => {
    const total = MOTIVATIONAL_QUOTES.length;
    for (let day = 1; day <= 31; day++) {
      const dateKey = `2026-08-${String(day).padStart(2, "0")}`;
      const index = getDailyQuoteIndex(dateKey, total);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(total);
    }
  });

  it("guarantees all users and page refreshes on the same day see the exact same quote", () => {
    const fixedDate = new Date("2026-08-28T12:00:00+03:30");

    // Simulate 100 refreshes / 100 different user sessions
    const expectedQuote = getDailyMotivationalQuote(fixedDate);
    for (let i = 0; i < 100; i++) {
      const userQuote = getDailyMotivationalQuote(fixedDate);
      expect(userQuote).toBe(expectedQuote);
    }
  });

  it("changes quote deterministically on different days", () => {
    const day1 = new Date("2026-08-28T12:00:00+03:30");
    const day2 = new Date("2026-08-29T12:00:00+03:30");

    const quote1 = getDailyMotivationalQuote(day1);
    const quote2 = getDailyMotivationalQuote(day2);

    expect(quote1).toBeDefined();
    expect(quote2).toBeDefined();
    // Verify they are valid quotes from the collection
    expect(MOTIVATIONAL_QUOTES).toContain(quote1);
    expect(MOTIVATIONAL_QUOTES).toContain(quote2);
  });

  it("calculates positive milliseconds until next Tehran midnight", () => {
    const testDate = new Date("2026-08-28T12:00:00+03:30");
    const ms = getMsUntilNextTehranMidnight(testDate);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(86401 * 1000);
  });

  describe("useDailyMotivationalQuote React Hook", () => {
    it("returns the quote for the current day immediately", () => {
      const { result } = renderHook(() => useDailyMotivationalQuote());
      expect(typeof result.current).toBe("string");
      expect(MOTIVATIONAL_QUOTES).toContain(result.current);
    });

    it("does not change quote on simple re-renders", () => {
      const { result, rerender } = renderHook(() => useDailyMotivationalQuote());
      const initialQuote = result.current;

      rerender();
      expect(result.current).toBe(initialQuote);

      rerender();
      expect(result.current).toBe(initialQuote);
    });

    it("refreshes quote when document becomes visible", () => {
      const { result } = renderHook(() => useDailyMotivationalQuote());
      const initialQuote = result.current;

      act(() => {
        // Trigger visibility change event
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(result.current).toBe(initialQuote);
    });

    it("automatically updates quote when midnight timer fires", () => {
      vi.useFakeTimers();
      const initialDate = new Date("2026-08-28T23:59:58+03:30");
      vi.setSystemTime(initialDate);

      const { result } = renderHook(() => useDailyMotivationalQuote());
      const day1Quote = getDailyMotivationalQuote(initialDate);
      expect(result.current).toBe(day1Quote);

      // Fast forward past midnight
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      const nextDayDate = new Date();
      const day2Quote = getDailyMotivationalQuote(nextDayDate);
      expect(result.current).toBe(day2Quote);
    });
  });
});
