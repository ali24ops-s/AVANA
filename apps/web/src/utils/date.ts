import { useEffect, useState } from "react";

export interface PersianDateInfo {
  weekday: string;
  day: string;
  month: string;
  year: string;
  dayMonth: string;
  formattedHeader: string;
  fullDate: string;
}

/**
 * Formats a given Date instance (defaulting to the current local system time)
 * into Persian (Jalali) calendar components using native Intl.DateTimeFormat.
 *
 * Timezone safety:
 * Uses local system time without UTC normalization to guarantee accurate
 * date display around midnight for the user's active timezone.
 */
export function formatPersianDate(date: Date = new Date()): PersianDateInfo {
  try {
    const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      calendar: "persian",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        partMap[part.type] = part.value;
      }
    }

    const weekday = partMap.weekday || "";
    const day = partMap.day || "";
    const month = partMap.month || "";
    const year = partMap.year || "";

    const dayMonth = `${day} ${month}`.trim();
    const formattedHeader = weekday ? `${weekday}، ${dayMonth}` : dayMonth;
    const fullDate = `${formattedHeader} ${year}`.trim();

    return {
      weekday,
      day,
      month,
      year,
      dayMonth,
      formattedHeader,
      fullDate,
    };
  } catch {
    // Fallback if Intl.DateTimeFormat is not supported in the environment
    return {
      weekday: "",
      day: String(date.getDate()),
      month: "",
      year: String(date.getFullYear()),
      dayMonth: String(date.getDate()),
      formattedHeader: String(date.getDate()),
      fullDate: date.toLocaleDateString(),
    };
  }
}

/**
 * React hook that returns dynamic Persian date information for the current day.
 *
 * Automatically updates at local midnight without constant polling or unnecessary re-renders.
 * Also refreshes immediately when the tab becomes active or visible after system sleep.
 */
export function useCurrentPersianDate(): PersianDateInfo {
  const [dateInfo, setDateInfo] = useState<PersianDateInfo>(() => formatPersianDate());

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleMidnightUpdate = () => {
      const now = new Date();
      // Target 1 second after local midnight to ensure the day has flipped
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1,
      );
      const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

      timerId = setTimeout(() => {
        setDateInfo(formatPersianDate());
        scheduleMidnightUpdate();
      }, msUntilMidnight);
    };

    scheduleMidnightUpdate();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        setDateInfo(formatPersianDate());
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
  }, []);

  return dateInfo;
}
