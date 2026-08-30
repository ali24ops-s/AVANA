/**
 * Study Session and Active Study Time Tracking domain primitives.
 *
 * Provides pure domain logic for:
 * - Active study session lifecycle
 * - Activity types (lesson, flashcard, exam, ai_tutor, pdf)
 * - Server-side heartbeat and idle duration calculation
 * - Timezone-aware weekly aggregation (Iranian/Persian week starting Saturday)
 * - Persian duration formatting
 */

// ---------------------------------------------------------------------------
// Activity Types & Config
// ---------------------------------------------------------------------------

export type StudyActivityType =
  | "lesson"
  | "flashcard"
  | "exam"
  | "ai_tutor"
  | "pdf";

export const STUDY_ACTIVITY_TYPES: readonly StudyActivityType[] = [
  "lesson",
  "flashcard",
  "exam",
  "ai_tutor",
  "pdf",
];

export function isStudyActivityType(value: string): value is StudyActivityType {
  return (STUDY_ACTIVITY_TYPES as readonly string[]).includes(value);
}

export const STUDY_SESSION_CONFIG = {
  /** Recommended interval for client heartbeats (in ms) */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** Recommended interval for client heartbeats (in seconds) */
  HEARTBEAT_INTERVAL_SECONDS: 30,
  /** Maximum duration added in a single heartbeat step (in seconds) */
  MAX_HEARTBEAT_GAP_SECONDS: 60,
  /** Time without interaction/heartbeat after which user is considered idle (in seconds) */
  IDLE_TIMEOUT_SECONDS: 120, // 2 minutes
  /** Default fallback timezone */
  DEFAULT_TIMEZONE: "Asia/Tehran",
} as const;

// ---------------------------------------------------------------------------
// Study Session Model
// ---------------------------------------------------------------------------

export type StudySessionRecord = {
  id: string;
  userId: string;
  activityType: StudyActivityType;
  courseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  startedAt: string;
  lastActivityAt: string;
  endedAt?: string | null;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type StartStudySessionInput = {
  activityType: StudyActivityType;
  courseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
};

export type DailyStudyTime = {
  date: string; // YYYY-MM-DD in user's timezone
  seconds: number;
  minutes: number;
};

export type WeeklyStudyTimeSummary = {
  thisWeek: {
    seconds: number;
    minutes: number;
    formatted: string;
  };
  lastWeek: {
    seconds: number;
    minutes: number;
    formatted: string;
  };
  changePercent: number | null;
  daily: DailyStudyTime[];
};

// ---------------------------------------------------------------------------
// Persian Formatting Helpers
// ---------------------------------------------------------------------------

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

/**
 * Formats a duration in seconds into a friendly Persian string.
 * Examples:
 *   0      -> "۰ دقیقه"
 *   180    -> "۳ دقیقه"
 *   3600   -> "۱ ساعت"
 *   16500  -> "۴ ساعت و ۳۵ دقیقه"
 */
export function formatStudyDurationPersian(seconds: number): string {
  if (seconds <= 0) {
    return `${toPersianDigits(0)} دقیقه`;
  }

  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes === 0) {
    // If under 60 seconds but active, show 1 minute for user feedback
    return `${toPersianDigits(1)} دقیقه`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${toPersianDigits(hours)} ساعت و ${toPersianDigits(minutes)} دقیقه`;
  }
  if (hours > 0) {
    return `${toPersianDigits(hours)} ساعت`;
  }
  return `${toPersianDigits(minutes)} دقیقه`;
}

// ---------------------------------------------------------------------------
// Timezone & Weekly Boundaries Helpers
// ---------------------------------------------------------------------------

/**
 * Validates whether an IANA timezone string is valid.
 * Falls back to Asia/Tehran if invalid or empty.
 */
export function validateTimezone(tz?: string | null): string {
  if (!tz || typeof tz !== "string" || tz.trim() === "") {
    return STUDY_SESSION_CONFIG.DEFAULT_TIMEZONE;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return STUDY_SESSION_CONFIG.DEFAULT_TIMEZONE;
  }
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string; // 'Sat' | 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri'
}

export function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      partMap[p.type] = p.value;
    }
  }

  return {
    year: parseInt(partMap.year, 10),
    month: parseInt(partMap.month, 10),
    day: parseInt(partMap.day, 10),
    hour: parseInt(partMap.hour, 10),
    minute: parseInt(partMap.minute, 10),
    second: parseInt(partMap.second, 10),
    weekday: partMap.weekday || "Sat",
  };
}

export function formatLocalDateString(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDaysSinceSaturday(weekday: string): number {
  switch (weekday) {
    case "Sat":
      return 0;
    case "Sun":
      return 1;
    case "Mon":
      return 2;
    case "Tue":
      return 3;
    case "Wed":
      return 4;
    case "Thu":
      return 5;
    case "Fri":
      return 6;
    default:
      return 0;
  }
}

export interface WeekRange {
  thisWeekStartDate: string; // YYYY-MM-DD
  thisWeekDailyDates: string[]; // 7 days: [Saturday, ..., Friday]
  lastWeekDailyDates: string[]; // 7 days of previous week
  earliestDate: string; // Start of last week YYYY-MM-DD
}

/**
 * Calculates the 7 dates of current Persian week (Saturday to Friday)
 * and 7 dates of previous week in the user's timezone.
 */
export function getPersianWeekDates(referenceDate: Date, timeZone: string): WeekRange {
  const validTz = validateTimezone(timeZone);
  const parts = getLocalDateParts(referenceDate, validTz);
  const daysSinceSat = getDaysSinceSaturday(parts.weekday);

  // Use date arithmetic on a local calendar representation
  // Find date of this week's Saturday
  const currentSatDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day - daysSinceSat, 12, 0, 0),
  );

  const thisWeekDailyDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(currentSatDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dayParts = getLocalDateParts(day, "UTC");
    thisWeekDailyDates.push(
      formatLocalDateString(dayParts.year, dayParts.month, dayParts.day),
    );
  }

  const lastWeekDailyDates: string[] = [];
  for (let i = 7; i > 0; i--) {
    const day = new Date(currentSatDate.getTime() - i * 24 * 60 * 60 * 1000);
    const dayParts = getLocalDateParts(day, "UTC");
    lastWeekDailyDates.push(
      formatLocalDateString(dayParts.year, dayParts.month, dayParts.day),
    );
  }

  return {
    thisWeekStartDate: thisWeekDailyDates[0],
    thisWeekDailyDates,
    lastWeekDailyDates,
    earliestDate: lastWeekDailyDates[0],
  };
}

// ---------------------------------------------------------------------------
// Study Time Aggregation Engine
// ---------------------------------------------------------------------------

/**
 * Aggregates a user's study sessions into weekly summary metrics:
 * - This week's total seconds/minutes/formatted string
 * - Last week's total seconds/minutes/formatted string
 * - Percentage change vs last week (null if last week was 0)
 * - 7-day daily breakdown for this week
 */
export function calculateWeeklyStudyTimeSummary(
  sessions: StudySessionRecord[],
  referenceDate: Date = new Date(),
  timeZone: string = STUDY_SESSION_CONFIG.DEFAULT_TIMEZONE,
): WeeklyStudyTimeSummary {
  const validTz = validateTimezone(timeZone);
  const weekRange = getPersianWeekDates(referenceDate, validTz);

  const thisWeekSet = new Set(weekRange.thisWeekDailyDates);
  const lastWeekSet = new Set(weekRange.lastWeekDailyDates);

  const dailySecondsMap = new Map<string, number>();
  for (const d of weekRange.thisWeekDailyDates) {
    dailySecondsMap.set(d, 0);
  }

  let thisWeekTotalSeconds = 0;
  let lastWeekTotalSeconds = 0;

  for (const session of sessions) {
    const duration = Math.max(0, session.durationSeconds);
    if (duration === 0) continue;

    const sessionStart = new Date(session.startedAt);
    if (isNaN(sessionStart.getTime())) continue;

    const startParts = getLocalDateParts(sessionStart, validTz);
    const dateStr = formatLocalDateString(
      startParts.year,
      startParts.month,
      startParts.day,
    );

    if (thisWeekSet.has(dateStr)) {
      thisWeekTotalSeconds += duration;
      const current = dailySecondsMap.get(dateStr) ?? 0;
      dailySecondsMap.set(dateStr, current + duration);
    } else if (lastWeekSet.has(dateStr)) {
      lastWeekTotalSeconds += duration;
    }
  }

  // Calculate percentage change only when this week > 0 and last week > 0
  let changePercent: number | null = null;
  if (thisWeekTotalSeconds > 0 && lastWeekTotalSeconds > 0) {
    const diff = thisWeekTotalSeconds - lastWeekTotalSeconds;
    changePercent = Math.round((diff / lastWeekTotalSeconds) * 100);
  } else {
    changePercent = null;
  }

  const daily: DailyStudyTime[] = weekRange.thisWeekDailyDates.map((date) => {
    const sec = dailySecondsMap.get(date) ?? 0;
    return {
      date,
      seconds: sec,
      minutes: Math.round(sec / 60),
    };
  });

  return {
    thisWeek: {
      seconds: thisWeekTotalSeconds,
      minutes: Math.round(thisWeekTotalSeconds / 60),
      formatted: formatStudyDurationPersian(thisWeekTotalSeconds),
    },
    lastWeek: {
      seconds: lastWeekTotalSeconds,
      minutes: Math.round(lastWeekTotalSeconds / 60),
      formatted: formatStudyDurationPersian(lastWeekTotalSeconds),
    },
    changePercent,
    daily,
  };
}

export type StudyTimeComparisonResult =
  | {
      type: "increase";
      changePercent: number;
      text: string;
    }
  | {
      type: "decrease";
      changePercent: number;
      text: string;
    }
  | {
      type: "same";
      text: string;
    }
  | {
      type: "last_week_reference";
      formattedLastWeek: string;
      text: string;
    }
  | {
      type: "new_start";
      text: string;
    }
  | {
      type: "no_data";
      text: string;
    };

/**
 * Determines the comparison presentation between this week's and last week's study times.
 *
 * Rules:
 * 1. If lastWeek has 0 study time:
 *    - If thisWeek > 0: "شروع شد 🌱" (prevents division by zero, NaN, Infinity)
 *    - If thisWeek === 0: "هفته قبل: هنوز مطالعه‌ای ثبت نشده"
 * 2. If thisWeek < lastWeek * 0.5 (strictly less than 50% of last week):
 *    - Do NOT show percentage decrease (↓ X%).
 *    - Instead, display last week's study time: "هفته قبل: {lastWeekFormatted}".
 * 3. If thisWeek >= lastWeek * 0.5 and thisWeek < lastWeek:
 *    - Display actual percentage decrease: "↓ X٪ نسبت به هفته قبل".
 * 4. If thisWeek === lastWeek:
 *    - "مشابه هفته قبل".
 * 5. If thisWeek > lastWeek:
 *    - Display actual percentage increase: "↑ X٪ نسبت به هفته قبل".
 */
export function getWeeklyStudyComparison(
  thisWeekSeconds: number,
  lastWeekSeconds: number,
  lastWeekFormatted?: string,
): StudyTimeComparisonResult {
  const formattedLast =
    lastWeekFormatted || formatStudyDurationPersian(lastWeekSeconds);

  const effectiveThisWeekSeconds = Math.max(0, thisWeekSeconds);
  const effectiveLastWeekSeconds = Math.max(0, lastWeekSeconds);

  // When last week has 0 study time
  if (effectiveLastWeekSeconds === 0) {
    if (effectiveThisWeekSeconds > 0) {
      return {
        type: "new_start",
        text: "شروع شد 🌱",
      };
    }
    return {
      type: "no_data",
      text: "هفته قبل: هنوز مطالعه‌ای ثبت نشده",
    };
  }

  // When this week is strictly less than 50% of last week:
  // Do NOT show negative percentage reduction; show last week reference instead.
  if (effectiveThisWeekSeconds < effectiveLastWeekSeconds * 0.5) {
    return {
      type: "last_week_reference",
      formattedLastWeek: formattedLast,
      text: `هفته قبل: ${formattedLast}`,
    };
  }

  // When this week is >= 50% of last week:
  if (effectiveThisWeekSeconds > effectiveLastWeekSeconds) {
    const diff = effectiveThisWeekSeconds - effectiveLastWeekSeconds;
    const changePercent = Math.round((diff / effectiveLastWeekSeconds) * 100);
    return {
      type: "increase",
      changePercent,
      text: `↑ ${toPersianDigits(changePercent)}٪ نسبت به هفته قبل`,
    };
  }

  if (effectiveThisWeekSeconds === effectiveLastWeekSeconds) {
    return {
      type: "same",
      text: "مشابه هفته قبل",
    };
  }

  // effectiveThisWeekSeconds >= 50% of lastWeek and < lastWeek:
  const diff = effectiveLastWeekSeconds - effectiveThisWeekSeconds;
  const changePercent = Math.round((diff / effectiveLastWeekSeconds) * 100);
  return {
    type: "decrease",
    changePercent,
    text: `↓ ${toPersianDigits(changePercent)}٪ نسبت به هفته قبل`,
  };
}

// ---------------------------------------------------------------------------
// Streak & Dashboard Stats Engine
// ---------------------------------------------------------------------------

export const MIN_STUDY_DAY_SECONDS = 300; // 5 minutes for MVP

export type StreakSummary = {
  currentStreak: number;
  longestStreak: number;
  todayIsActive: boolean;
  todayStudySeconds: number;
  studyDaysCount: number;
};

export type DashboardStatsSummary = {
  completedLessons: number;
  completedExams: number;
  currentStreak: number;
  longestStreak: number;
  todayIsActive: boolean;
  todayStudySeconds: number;
};

export function getPreviousDateString(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  const parts = getLocalDateParts(prev, "UTC");
  return formatLocalDateString(parts.year, parts.month, parts.day);
}

export function getDaysBetween(dateStrA: string, dateStrB: string): number {
  const [yA, mA, dA] = dateStrA.split("-").map((n) => parseInt(n, 10));
  const [yB, mB, dB] = dateStrB.split("-").map((n) => parseInt(n, 10));
  const tA = Date.UTC(yA, mA - 1, dA, 12, 0, 0);
  const tB = Date.UTC(yB, mB - 1, dB, 12, 0, 0);
  return Math.round((tB - tA) / (24 * 60 * 60 * 1000));
}

/**
 * Calculates a user's current and longest streak based on valid active study sessions.
 *
 * Rules:
 * - A calendar day in the user's timezone is a Study Day if active study time >= 300s (5 min).
 * - If today has >= 5 min, the streak sequence ends today.
 * - If today has < 5 min but yesterday was a study day, the streak is kept active ending yesterday.
 * - If neither today nor yesterday was a study day, currentStreak = 0.
 * - longestStreak is the maximum consecutive study days across the user's entire history.
 */
export function calculateStreakSummary(
  sessions: StudySessionRecord[],
  referenceDate: Date = new Date(),
  timeZone: string = STUDY_SESSION_CONFIG.DEFAULT_TIMEZONE,
): StreakSummary {
  const validTz = validateTimezone(timeZone);
  const todayParts = getLocalDateParts(referenceDate, validTz);
  const todayStr = formatLocalDateString(
    todayParts.year,
    todayParts.month,
    todayParts.day,
  );
  const yesterdayStr = getPreviousDateString(todayStr);

  // Group study seconds by local calendar day (YYYY-MM-DD)
  const dailySecondsMap = new Map<string, number>();
  for (const session of sessions) {
    const duration = Math.max(0, session.durationSeconds);
    if (duration === 0) continue;

    const sessionStart = new Date(session.startedAt);
    if (isNaN(sessionStart.getTime())) continue;

    const startParts = getLocalDateParts(sessionStart, validTz);
    const dateStr = formatLocalDateString(
      startParts.year,
      startParts.month,
      startParts.day,
    );

    dailySecondsMap.set(dateStr, (dailySecondsMap.get(dateStr) ?? 0) + duration);
  }

  // Determine study days (days with at least 5 minutes = 300 seconds)
  const studyDaysSet = new Set<string>();
  for (const [dateStr, secs] of dailySecondsMap.entries()) {
    if (secs >= MIN_STUDY_DAY_SECONDS) {
      studyDaysSet.add(dateStr);
    }
  }

  const todayStudySeconds = dailySecondsMap.get(todayStr) ?? 0;
  const todayIsActive = todayStudySeconds >= MIN_STUDY_DAY_SECONDS;

  // 1. Calculate current streak
  let currentStreak = 0;
  let cursorDate: string | null = null;

  if (studyDaysSet.has(todayStr)) {
    cursorDate = todayStr;
  } else if (studyDaysSet.has(yesterdayStr)) {
    // Today not yet a study day, but streak from yesterday is still intact
    cursorDate = yesterdayStr;
  }

  if (cursorDate) {
    let curr = cursorDate;
    while (studyDaysSet.has(curr)) {
      currentStreak++;
      curr = getPreviousDateString(curr);
    }
  }

  // 2. Calculate longest streak across all history
  let longestStreak = 0;
  const sortedStudyDays = Array.from(studyDaysSet).sort();

  if (sortedStudyDays.length > 0) {
    let currentRun = 1;
    longestStreak = 1;

    for (let i = 1; i < sortedStudyDays.length; i++) {
      const prevDate = sortedStudyDays[i - 1];
      const currDate = sortedStudyDays[i];
      const diffDays = getDaysBetween(prevDate, currDate);

      if (diffDays === 1) {
        currentRun++;
      } else if (diffDays > 1) {
        currentRun = 1;
      }
      if (currentRun > longestStreak) {
        longestStreak = currentRun;
      }
    }
  }

  longestStreak = Math.max(longestStreak, currentStreak);

  return {
    currentStreak,
    longestStreak,
    todayIsActive,
    todayStudySeconds,
    studyDaysCount: studyDaysSet.size,
  };
}

