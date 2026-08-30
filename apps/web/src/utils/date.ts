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

/**
 * Calculates remaining calendar days between now (or specified base date) and an exam date string.
 * Returns an integer:
 *  > 0 if exam is in the future
 *  = 0 if exam is today
 *  < 0 if exam has passed
 */
export function calculateDaysRemaining(
  examDateStr: string | Date,
  currentDate: Date = new Date(),
): number {
  const examDate = typeof examDateStr === "string" ? new Date(examDateStr) : examDateStr;
  if (isNaN(examDate.getTime())) {
    return 0;
  }

  // Normalize both dates to midnight in local time
  const currentMidnight = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  ).getTime();

  const examMidnight = new Date(
    examDate.getFullYear(),
    examDate.getMonth(),
    examDate.getDate(),
  ).getTime();

  const diffMs = examMidnight - currentMidnight;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Persian (Jalali) month names in standard Persian order (1 to 12).
 */
export const PERSIAN_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/**
 * Short Persian weekday names starting from Saturday (شنبه) to Friday (جمعه).
 */
export const PERSIAN_WEEKDAY_NAMES_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

/**
 * Full Persian weekday names starting from Saturday (شنبه) to Friday (جمعه).
 */
export const PERSIAN_WEEKDAY_NAMES_FULL = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
] as const;

export interface JalaliDateParts {
  jy: number; // e.g. 1405
  jm: number; // 1-12
  jd: number; // 1-31
}

/**
 * Converts a Gregorian Date into Jalali date parts { jy, jm, jd }.
 */
export function gregorianToJalali(dateInput: Date | string | number = new Date()): JalaliDateParts {
  const date = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) {
    const now = new Date();
    return gregorianToJalali(now);
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      calendar: "persian",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(date);
    let jy = 1400;
    let jm = 1;
    let jd = 1;
    for (const part of parts) {
      if (part.type === "year") jy = parseInt(part.value, 10);
      if (part.type === "month") jm = parseInt(part.value, 10);
      if (part.type === "day") jd = parseInt(part.value, 10);
    }
    return { jy, jm, jd };
  } catch {
    return { jy: 1405, jm: 1, jd: 1 };
  }
}

/**
 * Converts Jalali date parts { jy, jm, jd } into a Gregorian Date at local midnight.
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const baseDate = new Date(Date.UTC(jy + 621, 2, 20));
  const daysOffset = (jm <= 6 ? (jm - 1) * 31 : 6 * 31 + (jm - 7) * 30) + (jd - 1);
  baseDate.setUTCDate(baseDate.getUTCDate() + daysOffset);

  const fmt = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  let matchedDate: Date | null = null;
  for (let offset = -4; offset <= 4; offset++) {
    const candidate = new Date(baseDate.getTime() + offset * 86400000);
    const parts = fmt.formatToParts(candidate);
    const p: Record<string, number> = {};
    for (const part of parts) {
      p[part.type] = Number(part.value);
    }
    if (p.year === jy && p.month === jm && p.day === jd) {
      matchedDate = candidate;
      break;
    }
  }

  const targetDate = matchedDate || baseDate;
  // Return Date at local midnight
  return new Date(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate(), 0, 0, 0);
}

/**
 * Returns number of days in a given Jalali month.
 */
export function getJalaliMonthDays(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  // For Esfand (12), check if 30th day exists in Jalali calendar:
  const gDate = jalaliToGregorian(jy, 12, 30);
  const jDate = gregorianToJalali(gDate);
  return jDate.jm === 12 && jDate.jd === 30 ? 30 : 29;
}

/**
 * Returns the weekday index (0 = Saturday, 6 = Friday) for the 1st day of the Jalali month.
 */
export function getJalaliFirstDayOfWeek(jy: number, jm: number): number {
  const firstDayGregorian = jalaliToGregorian(jy, jm, 1);
  // In JS getDay(): 0 is Sunday, 6 is Saturday
  // Persian week: Saturday = 0, Sunday = 1, ..., Friday = 6
  return (firstDayGregorian.getDay() + 1) % 7;
}

/**
 * Formats an exam date into Persian (Jalali) string: e.g. "۲۵ شهریور ۱۴۰۵"
 */
export function formatPersianExamDate(dateInput: string | Date): string {
  try {
    const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      calendar: "persian",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
    return d.toLocaleDateString();
  }
}

