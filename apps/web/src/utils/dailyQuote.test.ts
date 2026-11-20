import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  CURATED_DAILY_QUOTES,
  DAILY_QUOTE_CYCLE_PERMUTATION,
  MOTIVATIONAL_QUOTES,
  getTehranDateKey,
  getTehranDaysSinceEpoch,
  hashString,
  getDailyMotivationalQuote,
  formatQuoteAttribution,
  getMsUntilNextTehranMidnight,
  useDailyMotivationalQuote,
} from "./dailyQuote.js";

describe("Curated Daily Quote & Dashboard Motivational Utility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Dataset Validation (Phase 2 - 100 Curated Quotes)", () => {
    it("contains exactly 100 curated quotes", () => {
      expect(CURATED_DAILY_QUOTES.length).toBe(100);
      expect(MOTIVATIONAL_QUOTES.length).toBe(100);
    });

    it("has unique IDs for all 100 quotes", () => {
      const ids = CURATED_DAILY_QUOTES.map((q) => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });

    it("has no duplicate quote texts", () => {
      const texts = CURATED_DAILY_QUOTES.map((q) => q.text.trim());
      const uniqueTexts = new Set(texts);
      expect(uniqueTexts.size).toBe(100);
    });

    it("maintains the exact category breakdown: 40 books, 40 movies, 20 philosophy/original", () => {
      const books = CURATED_DAILY_QUOTES.filter((q) => q.category === "book");
      const movies = CURATED_DAILY_QUOTES.filter((q) => q.category === "movie");
      const philosophy = CURATED_DAILY_QUOTES.filter((q) => q.category === "philosophy");
      const original = CURATED_DAILY_QUOTES.filter((q) => q.category === "original");

      expect(books.length).toBe(40);
      expect(movies.length).toBe(40);
      expect(philosophy.length).toBe(16);
      expect(original.length).toBe(4);
      expect(philosophy.length + original.length).toBe(20);
    });

    it("ensures all quotes adhere to verification and attribution rules", () => {
      for (const quote of CURATED_DAILY_QUOTES) {
        expect(quote.text.trim().length).toBeGreaterThan(5);
        expect(["book", "movie", "philosophy", "original"]).toContain(quote.category);
        expect(["verified", "free_translation", "inspired", "original"]).toContain(
          quote.attributionType,
        );

        if (quote.category === "book") {
          expect(quote.sourceTitle).toBeDefined();
          expect(quote.author).toBeDefined();
        } else if (quote.category === "movie") {
          expect(quote.sourceTitle || quote.author).toBeDefined();
        } else if (quote.category === "philosophy") {
          expect(quote.author || quote.sourceTitle).toBeDefined();
        } else if (quote.category === "original") {
          expect(quote.attributionType).toBe("original");
        }
      }
    });

    it("formats quote attribution appropriately for all categories", () => {
      const bookQuote = CURATED_DAILY_QUOTES.find(
        (q) => q.category === "book" && q.attributionType === "verified",
      )!;
      const movieQuote = CURATED_DAILY_QUOTES.find(
        (q) => q.category === "movie" && q.speaker && q.attributionType === "verified",
      )!;
      const philosophyQuote = CURATED_DAILY_QUOTES.find(
        (q) => q.category === "philosophy" && q.attributionType === "verified",
      )!;
      const inspiredQuote = CURATED_DAILY_QUOTES.find(
        (q) => q.attributionType === "inspired",
      )!;
      const originalQuote = CURATED_DAILY_QUOTES.find(
        (q) => q.category === "original",
      )!;

      expect(formatQuoteAttribution(bookQuote)).toContain(bookQuote.sourceTitle!);
      expect(formatQuoteAttribution(bookQuote)).toContain(bookQuote.author!);
      expect(formatQuoteAttribution(movieQuote)).toContain(movieQuote.sourceTitle!);
      expect(formatQuoteAttribution(movieQuote)).toContain(movieQuote.speaker!);
      expect(formatQuoteAttribution(philosophyQuote)).toContain(
        philosophyQuote.author || philosophyQuote.sourceTitle!,
      );
      // Inspired quotes must be prefixed with "با الهام از"
      expect(formatQuoteAttribution(inspiredQuote)).toMatch(/^با الهام از/);
      // Original quotes must display "آوانا"
      expect(formatQuoteAttribution(originalQuote)).toBe("آوانا");
    });
  });

  describe("Daily Selection Algorithm & Permutation Guarantees", () => {
    it("defines a valid permutation of 0..99 with exactly 100 elements", () => {
      expect(DAILY_QUOTE_CYCLE_PERMUTATION.length).toBe(100);
      const permSet = new Set(DAILY_QUOTE_CYCLE_PERMUTATION);
      expect(permSet.size).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(permSet.has(i)).toBe(true);
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

    it("monotonically increments Tehran days count by 1 for successive calendar days", () => {
      const d1 = new Date("2026-08-28T12:00:00+03:30");
      const d2 = new Date("2026-08-29T12:00:00+03:30");
      const c1 = getTehranDaysSinceEpoch(d1);
      const c2 = getTehranDaysSinceEpoch(d2);
      expect(c2 - c1).toBe(1);
    });

    it("guarantees mathematical impossibility of repetition in two consecutive days", () => {
      // Test over 365 consecutive days
      const startDate = new Date("2026-01-01T12:00:00+03:30");
      for (let i = 0; i < 365; i++) {
        const dayA = new Date(startDate.getTime() + i * 86400000);
        const dayB = new Date(startDate.getTime() + (i + 1) * 86400000);

        const quoteA = getDailyMotivationalQuote(dayA);
        const quoteB = getDailyMotivationalQuote(dayB);

        expect(quoteA.id).not.toBe(quoteB.id);
        expect(quoteA.text).not.toBe(quoteB.text);
      }
    });

    it("repeats the exact cycle sequence after 100 days", () => {
      const baseDate = new Date("2026-05-10T12:00:00+03:30");
      const quoteDay0 = getDailyMotivationalQuote(baseDate);

      // Exactly 100 days later
      const day100Later = new Date(baseDate.getTime() + 100 * 86400000);
      const quoteDay100 = getDailyMotivationalQuote(day100Later);

      expect(quoteDay100.id).toBe(quoteDay0.id);
      expect(quoteDay100.text).toBe(quoteDay0.text);

      // And 101 days later is day 1
      const day1Later = new Date(baseDate.getTime() + 1 * 86400000);
      const day101Later = new Date(baseDate.getTime() + 101 * 86400000);
      expect(getDailyMotivationalQuote(day101Later).id).toBe(
        getDailyMotivationalQuote(day1Later).id,
      );
    });

    it("guarantees all users and page refreshes on the same day see the exact same quote", () => {
      const fixedDate = new Date("2026-11-18T14:30:00+03:30");
      const expectedQuote = getDailyMotivationalQuote(fixedDate);

      for (let i = 0; i < 100; i++) {
        const userQuote = getDailyMotivationalQuote(fixedDate);
        expect(userQuote.id).toBe(expectedQuote.id);
        expect(userQuote.text).toBe(expectedQuote.text);
      }
    });

    it("produces deterministic hash values for arbitrary strings", () => {
      const h1 = hashString("2026-08-28");
      const h2 = hashString("2026-08-28");
      expect(h1).toBe(h2);
      expect(h1).toBeGreaterThanOrEqual(0);
    });

    it("calculates positive milliseconds until next Tehran midnight", () => {
      const testDate = new Date("2026-08-28T12:00:00+03:30");
      const ms = getMsUntilNextTehranMidnight(testDate);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(86401 * 1000);
    });
  });

  describe("useDailyMotivationalQuote React Hook", () => {
    it("returns the DailyQuote object for the current day immediately", () => {
      const { result } = renderHook(() => useDailyMotivationalQuote());
      expect(result.current).toBeDefined();
      expect(typeof result.current.id).toBe("string");
      expect(typeof result.current.text).toBe("string");
      expect(CURATED_DAILY_QUOTES.some((q) => q.id === result.current.id)).toBe(true);
    });

    it("does not change quote on simple re-renders", () => {
      const { result, rerender } = renderHook(() => useDailyMotivationalQuote());
      const initialId = result.current.id;

      rerender();
      expect(result.current.id).toBe(initialId);

      rerender();
      expect(result.current.id).toBe(initialId);
    });

    it("refreshes quote when document becomes visible", () => {
      const { result } = renderHook(() => useDailyMotivationalQuote());
      const initialId = result.current.id;

      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(result.current.id).toBe(initialId);
    });

    it("automatically updates quote when Tehran midnight timer fires", () => {
      vi.useFakeTimers();
      const initialDate = new Date("2026-08-28T23:59:58+03:30");
      vi.setSystemTime(initialDate);

      const { result } = renderHook(() => useDailyMotivationalQuote());
      const day1Quote = getDailyMotivationalQuote(initialDate);
      expect(result.current.id).toBe(day1Quote.id);

      // Fast-forward past midnight
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      const nextDayDate = new Date();
      const day2Quote = getDailyMotivationalQuote(nextDayDate);
      expect(result.current.id).toBe(day2Quote.id);
      expect(result.current.id).not.toBe(day1Quote.id);
    });
  });
});
