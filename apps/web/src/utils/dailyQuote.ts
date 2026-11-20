import { useEffect, useState } from "react";
import {
  CURATED_DAILY_QUOTES,
  DAILY_QUOTE_CYCLE_PERMUTATION,
  type DailyQuote,
  type QuoteCategory,
  type AttributionType,
} from "./dailyQuotesData.js";

export {
  CURATED_DAILY_QUOTES,
  DAILY_QUOTE_CYCLE_PERMUTATION,
  type DailyQuote,
  type QuoteCategory,
  type AttributionType,
};

/**
 * Backward-compatible array of quote texts for any legacy references.
 */
export const MOTIVATIONAL_QUOTES: readonly string[] =
  CURATED_DAILY_QUOTES.map((q) => q.text);

/**
 * Returns a deterministic date key (YYYY-MM-DD) based on Asia/Tehran timezone.
 * This guarantees all users across any geographic location resolve to the exact
 * same calendar day in Iran.
 */
export function getTehranDateKey(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(date);
    let year = "";
    let month = "";
    let day = "";

    for (const part of parts) {
      if (part.type === "year") year = part.value;
      if (part.type === "month") month = part.value;
      if (part.type === "day") day = part.value;
    }

    if (year && month && day) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const partsMap: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        partsMap[part.type] = part.value;
      }
    }
    if (partsMap.year && partsMap.month && partsMap.day) {
      return `${partsMap.year}-${partsMap.month.padStart(2, "0")}-${partsMap.day.padStart(2, "0")}`;
    }

    return date.toISOString().split("T")[0]!;
  } catch {
    // Fallback for environments without Intl timezone support
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

/**
 * 32-bit FNV-1a non-cryptographic hash function.
 * Produces a stable, deterministic integer for a given string key.
 */
export function hashString(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Converts a Tehran date (or Date object) into consecutive days since epoch.
 * Monotonically increments by 1 for each successive calendar day in Tehran.
 */
export function getTehranDaysSinceEpoch(date: Date = new Date()): number {
  const dateKey = getTehranDateKey(date);
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10);
    const day = parseInt(match[3]!, 10);
    return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
  }
  // Graceful fallback
  return Math.floor(date.getTime() / 86400000);
}

/**
 * Calculates a deterministic zero-based index for the day's quote.
 *
 * Algorithm guarantees:
 * 1. Successive calendar days are mathematically guaranteed to never repeat.
 * 2. All users and tabs on the same day resolve to the identical index.
 * 3. The cycle repeats from the start every 100 days (or totalQuotes count).
 * 4. Indices are mapped through DAILY_QUOTE_CYCLE_PERMUTATION for an alternating,
 *    richly mixed experience across books, cinema, and philosophy.
 */
export function getDailyQuoteIndex(
  dateOrKey: Date | string = new Date(),
  totalQuotes: number = CURATED_DAILY_QUOTES.length,
): number {
  if (totalQuotes <= 0) return 0;

  let daysCount: number;
  if (typeof dateOrKey === "string") {
    const match = dateOrKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = parseInt(match[1]!, 10);
      const month = parseInt(match[2]!, 10);
      const day = parseInt(match[3]!, 10);
      daysCount = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
    } else {
      daysCount = hashString(dateOrKey);
    }
  } else {
    daysCount = getTehranDaysSinceEpoch(dateOrKey);
  }

  const cycleDay = ((daysCount % totalQuotes) + totalQuotes) % totalQuotes;

  if (
    totalQuotes === DAILY_QUOTE_CYCLE_PERMUTATION.length &&
    DAILY_QUOTE_CYCLE_PERMUTATION[cycleDay] !== undefined
  ) {
    return DAILY_QUOTE_CYCLE_PERMUTATION[cycleDay]!;
  }

  return cycleDay;
}

/**
 * Retrieves the daily quote for a given date in Asia/Tehran timezone.
 * Pure and deterministic: identical date input always produces the identical quote.
 */
export function getDailyMotivationalQuote(
  date: Date = new Date(),
  quotes: readonly DailyQuote[] = CURATED_DAILY_QUOTES,
): DailyQuote {
  if (!quotes || quotes.length === 0) {
    return {
      id: "q-fallback",
      text: "هر قدم کوچک امروز، موفقیت بزرگ فردای توست.",
      category: "original",
      attributionType: "original",
    };
  }
  const index = getDailyQuoteIndex(date, quotes.length);
  return quotes[index] ?? quotes[0]!;
}

/**
 * Formats attribution source line for a quote according to its category and metadata:
 * - Book: «نام کتاب — نویسنده»
 * - Movie: «نام فیلم — شخصیت» (یا فقط «نام فیلم»)
 * - Philosophy: «نام متفکر — اثر» (یا فقط «نام متفکر»)
 * - Inspired: «با الهام از [نام اثر یا نویسنده]»
 * - Original: «آوانا»
 */
export function formatQuoteAttribution(quote: DailyQuote): string {
  if (!quote) return "";

  if (quote.category === "original" || quote.attributionType === "original") {
    return "آوانا";
  }

  let baseSource = "";
  switch (quote.category) {
    case "book":
      if (quote.sourceTitle && quote.author) {
        baseSource = `${quote.sourceTitle} — ${quote.author}`;
      } else {
        baseSource = quote.sourceTitle || quote.author || "";
      }
      break;

    case "movie":
      if (quote.sourceTitle && quote.speaker) {
        baseSource = `${quote.sourceTitle} — ${quote.speaker}`;
      } else if (quote.sourceTitle && quote.author) {
        baseSource = `${quote.sourceTitle} — ${quote.author}`;
      } else {
        baseSource = quote.sourceTitle || quote.author || quote.speaker || "";
      }
      break;

    case "philosophy":
      if (quote.author && quote.sourceTitle) {
        baseSource = `${quote.author} — ${quote.sourceTitle}`;
      } else {
        baseSource = quote.author || quote.sourceTitle || "";
      }
      break;

    default:
      baseSource = quote.author || quote.sourceTitle || "";
      break;
  }

  if (quote.attributionType === "inspired" && baseSource) {
    return `با الهام از ${baseSource}`;
  }

  return baseSource;
}

/**
 * Computes milliseconds remaining until next midnight in Asia/Tehran timezone.
 * Useful for scheduling automatic daily quote transitions when a tab stays open.
 */
export function getMsUntilNextTehranMidnight(now: Date = new Date()): number {
  try {
    const tehranFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = tehranFormatter.formatToParts(now);
    const partMap: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") {
        partMap[p.type] = parseInt(p.value, 10);
      }
    }
    const h = partMap.hour ?? now.getHours();
    const m = partMap.minute ?? now.getMinutes();
    const s = partMap.second ?? now.getSeconds();

    const secondsPassed = (h % 24) * 3600 + m * 60 + s;
    const secondsRemaining = 86400 - secondsPassed;
    // Add 1 second buffer after midnight to ensure date has fully turned
    return Math.max(1000, (secondsRemaining + 1) * 1000);
  } catch {
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
    );
    return Math.max(1000, nextMidnight.getTime() - now.getTime());
  }
}

/**
 * React hook that returns the curated DailyQuote for the current day.
 *
 * Automatically updates at Tehran midnight without polling or unnecessary re-renders.
 * Also refreshes immediately when the tab becomes active or visible.
 */
export function useDailyMotivationalQuote(
  quotes: readonly DailyQuote[] = CURATED_DAILY_QUOTES,
): DailyQuote {
  const [quote, setQuote] = useState<DailyQuote>(() =>
    getDailyMotivationalQuote(new Date(), quotes),
  );

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleMidnightUpdate = () => {
      const now = new Date();
      const msUntilMidnight = getMsUntilNextTehranMidnight(now);

      timerId = setTimeout(() => {
        setQuote(getDailyMotivationalQuote(new Date(), quotes));
        scheduleMidnightUpdate();
      }, msUntilMidnight);
    };

    scheduleMidnightUpdate();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        setQuote(getDailyMotivationalQuote(new Date(), quotes));
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleVisibilityOrFocus);
    }

    return () => {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleVisibilityOrFocus);
      }
    };
  }, [quotes]);

  return quote;
}
