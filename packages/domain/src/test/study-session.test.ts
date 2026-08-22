import { describe, it, expect } from "vitest";
import {
  isStudyActivityType,
  toPersianDigits,
  formatStudyDurationPersian,
  validateTimezone,
  getPersianWeekDates,
  calculateWeeklyStudyTimeSummary,
  calculateStreakSummary,
  type StudySessionRecord,
} from "../study-session.js";

describe("Study Session Domain Primitives", () => {
  describe("Activity Types", () => {
    it("validates recognized study activity types", () => {
      expect(isStudyActivityType("lesson")).toBe(true);
      expect(isStudyActivityType("flashcard")).toBe(true);
      expect(isStudyActivityType("exam")).toBe(true);
      expect(isStudyActivityType("ai_tutor")).toBe(true);
      expect(isStudyActivityType("pdf")).toBe(true);
      expect(isStudyActivityType("dashboard")).toBe(false);
      expect(isStudyActivityType("random")).toBe(false);
    });
  });

  describe("Persian Formatting", () => {
    it("converts english digits to Persian digits correctly", () => {
      expect(toPersianDigits(1234567890)).toBe("۱۲۳۴۵۶۷۸۹۰");
      expect(toPersianDigits("Score: 95%")).toBe("Score: ۹۵%");
    });

    it("formats durations into idiomatic Persian strings", () => {
      expect(formatStudyDurationPersian(0)).toBe("۰ دقیقه");
      expect(formatStudyDurationPersian(45)).toBe("۱ دقیقه");
      expect(formatStudyDurationPersian(300)).toBe("۵ دقیقه");
      expect(formatStudyDurationPersian(3600)).toBe("۱ ساعت");
      expect(formatStudyDurationPersian(3660)).toBe("۱ ساعت و ۱ دقیقه");
      expect(formatStudyDurationPersian(16500)).toBe("۴ ساعت و ۳۵ دقیقه");
    });
  });

  describe("Timezone Validation", () => {
    it("accepts valid IANA timezones and falls back to Asia/Tehran for invalid ones", () => {
      expect(validateTimezone("Asia/Tehran")).toBe("Asia/Tehran");
      expect(validateTimezone("UTC")).toBe("UTC");
      expect(validateTimezone("America/New_York")).toBe("America/New_York");
      expect(validateTimezone("Invalid/Timezone")).toBe("Asia/Tehran");
      expect(validateTimezone(null)).toBe("Asia/Tehran");
      expect(validateTimezone("")).toBe("Asia/Tehran");
    });
  });

  describe("Persian Week Dates Computation", () => {
    it("computes 7-day week starting on Saturday in user's timezone", () => {
      // 2026-08-21 is a Friday
      const refDate = new Date("2026-08-21T12:00:00Z");
      const weekDates = getPersianWeekDates(refDate, "Asia/Tehran");

      // The week of 2026-08-21 starts on Saturday 2026-08-15 and ends on Friday 2026-08-21
      expect(weekDates.thisWeekDailyDates).toHaveLength(7);
      expect(weekDates.thisWeekStartDate).toBe("2026-08-15");
      expect(weekDates.thisWeekDailyDates[0]).toBe("2026-08-15"); // Sat
      expect(weekDates.thisWeekDailyDates[6]).toBe("2026-08-21"); // Fri

      expect(weekDates.lastWeekDailyDates).toHaveLength(7);
      expect(weekDates.lastWeekDailyDates[0]).toBe("2026-08-08"); // Last Sat
      expect(weekDates.lastWeekDailyDates[6]).toBe("2026-08-14"); // Last Fri
    });
  });

  describe("Weekly Aggregation Engine", () => {
    it("aggregates study sessions into thisWeek, lastWeek and daily breakdown", () => {
      const refDate = new Date("2026-08-21T12:00:00Z");
      const timeZone = "Asia/Tehran";

      const mockSessions: StudySessionRecord[] = [
        // This week sessions (2026-08-15 to 2026-08-21)
        {
          id: "s1",
          userId: "u1",
          activityType: "lesson",
          startedAt: "2026-08-15T08:00:00Z",
          lastActivityAt: "2026-08-15T08:30:00Z",
          durationSeconds: 1800, // 30 mins
          createdAt: "2026-08-15T08:00:00Z",
          updatedAt: "2026-08-15T08:30:00Z",
        },
        {
          id: "s2",
          userId: "u1",
          activityType: "flashcard",
          startedAt: "2026-08-16T10:00:00Z",
          lastActivityAt: "2026-08-16T10:40:00Z",
          durationSeconds: 2400, // 40 mins
          createdAt: "2026-08-16T10:00:00Z",
          updatedAt: "2026-08-16T10:40:00Z",
        },
        // Last week sessions (2026-08-08 to 2026-08-14)
        {
          id: "s3",
          userId: "u1",
          activityType: "exam",
          startedAt: "2026-08-10T14:00:00Z",
          lastActivityAt: "2026-08-10T14:30:00Z",
          durationSeconds: 1800, // 30 mins
          createdAt: "2026-08-10T14:00:00Z",
          updatedAt: "2026-08-10T14:30:00Z",
        },
      ];

      const summary = calculateWeeklyStudyTimeSummary(mockSessions, refDate, timeZone);

      // This week total: 1800 + 2400 = 4200 seconds (70 minutes = 1 hr 10 min)
      expect(summary.thisWeek.seconds).toBe(4200);
      expect(summary.thisWeek.minutes).toBe(70);
      expect(summary.thisWeek.formatted).toBe("۱ ساعت و ۱۰ دقیقه");

      // Last week total: 1800 seconds (30 minutes)
      expect(summary.lastWeek.seconds).toBe(1800);
      expect(summary.lastWeek.minutes).toBe(30);
      expect(summary.lastWeek.formatted).toBe("۳۰ دقیقه");

      // Percentage change: ((4200 - 1800) / 1800) * 100 = 133%
      expect(summary.changePercent).toBe(133);

      // Daily breakdown check
      expect(summary.daily).toHaveLength(7);
      expect(summary.daily[0].date).toBe("2026-08-15");
      expect(summary.daily[0].seconds).toBe(1800);
      expect(summary.daily[1].date).toBe("2026-08-16");
      expect(summary.daily[1].seconds).toBe(2400);
      expect(summary.daily[2].seconds).toBe(0);
    });

    it("returns null changePercent when last week has 0 activity but this week has activity", () => {
      const refDate = new Date("2026-08-21T12:00:00Z");
      const mockSessions: StudySessionRecord[] = [
        {
          id: "s1",
          userId: "u1",
          activityType: "lesson",
          startedAt: "2026-08-15T08:00:00Z",
          lastActivityAt: "2026-08-15T08:30:00Z",
          durationSeconds: 1800,
          createdAt: "2026-08-15T08:00:00Z",
          updatedAt: "2026-08-15T08:30:00Z",
        },
      ];

      const summary = calculateWeeklyStudyTimeSummary(mockSessions, refDate, "Asia/Tehran");
      expect(summary.thisWeek.seconds).toBe(1800);
      expect(summary.lastWeek.seconds).toBe(0);
      expect(summary.changePercent).toBeNull();
    });

    it("returns 0 changePercent and 0 time when there is no activity at all", () => {
      const summary = calculateWeeklyStudyTimeSummary([]);
      expect(summary.thisWeek.seconds).toBe(0);
      expect(summary.thisWeek.minutes).toBe(0);
      expect(summary.thisWeek.formatted).toBe("۰ دقیقه");
      expect(summary.lastWeek.seconds).toBe(0);
      expect(summary.lastWeek.minutes).toBe(0);
      expect(summary.lastWeek.formatted).toBe("۰ دقیقه");
      expect(summary.changePercent).toBe(0);
    });
  });

  describe("Streak Calculation Engine", () => {
    it("returns 0 streaks when user has no study sessions", () => {
      const result = calculateStreakSummary([], new Date("2026-08-21T12:00:00Z"), "Asia/Tehran");
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.todayIsActive).toBe(false);
      expect(result.todayStudySeconds).toBe(0);
      expect(result.studyDaysCount).toBe(0);
    });

    it("treats < 300s (5 min) as NOT a study day, but >= 300s as a study day", () => {
      const refDate = new Date("2026-08-21T12:00:00Z"); // 2026-08-21 in Tehran (UTC+3:30)
      const underThresholdSessions: StudySessionRecord[] = [
        {
          id: "s1",
          userId: "u1",
          activityType: "lesson",
          startedAt: "2026-08-21T08:00:00Z",
          lastActivityAt: "2026-08-21T08:04:59Z",
          durationSeconds: 299, // 4m 59s
          createdAt: "2026-08-21T08:00:00Z",
          updatedAt: "2026-08-21T08:04:59Z",
        },
      ];

      const underResult = calculateStreakSummary(underThresholdSessions, refDate, "Asia/Tehran");
      expect(underResult.todayIsActive).toBe(false);
      expect(underResult.todayStudySeconds).toBe(299);
      expect(underResult.currentStreak).toBe(0);
      expect(underResult.studyDaysCount).toBe(0);

      const validSessions: StudySessionRecord[] = [
        {
          id: "s2",
          userId: "u1",
          activityType: "lesson",
          startedAt: "2026-08-21T08:00:00Z",
          lastActivityAt: "2026-08-21T08:05:00Z",
          durationSeconds: 300, // exactly 5 minutes
          createdAt: "2026-08-21T08:00:00Z",
          updatedAt: "2026-08-21T08:05:00Z",
        },
      ];

      const validResult = calculateStreakSummary(validSessions, refDate, "Asia/Tehran");
      expect(validResult.todayIsActive).toBe(true);
      expect(validResult.todayStudySeconds).toBe(300);
      expect(validResult.currentStreak).toBe(1);
      expect(validResult.longestStreak).toBe(1);
      expect(validResult.studyDaysCount).toBe(1);
    });

    it("calculates 3 consecutive study days ending today", () => {
      const refDate = new Date("2026-08-21T12:00:00Z"); // Today: 2026-08-21
      const sessions: StudySessionRecord[] = [
        {
          id: "s1",
          userId: "u1",
          activityType: "lesson",
          startedAt: "2026-08-19T08:00:00Z", // Day -2
          lastActivityAt: "2026-08-19T08:10:00Z",
          durationSeconds: 600,
          createdAt: "2026-08-19T08:00:00Z",
          updatedAt: "2026-08-19T08:10:00Z",
        },
        {
          id: "s2",
          userId: "u1",
          activityType: "flashcard",
          startedAt: "2026-08-20T08:00:00Z", // Yesterday
          lastActivityAt: "2026-08-20T08:10:00Z",
          durationSeconds: 600,
          createdAt: "2026-08-20T08:00:00Z",
          updatedAt: "2026-08-20T08:10:00Z",
        },
        {
          id: "s3",
          userId: "u1",
          activityType: "exam",
          startedAt: "2026-08-21T08:00:00Z", // Today
          lastActivityAt: "2026-08-21T08:10:00Z",
          durationSeconds: 600,
          createdAt: "2026-08-21T08:00:00Z",
          updatedAt: "2026-08-21T08:10:00Z",
        },
      ];

      const result = calculateStreakSummary(sessions, refDate, "Asia/Tehran");
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
      expect(result.todayIsActive).toBe(true);
      expect(result.studyDaysCount).toBe(3);
    });

    it("does not reset current streak if user was active yesterday but has not studied today yet", () => {
      const refDate = new Date("2026-08-21T12:00:00Z"); // Today: 2026-08-21 (0 study time today)
      const sessions: StudySessionRecord[] = [
        {
          id: "s1",
          userId: "u1",
          activityType: "lesson",
          startedAt: "2026-08-19T08:00:00Z", // Day -2
          lastActivityAt: "2026-08-19T08:10:00Z",
          durationSeconds: 600,
          createdAt: "2026-08-19T08:00:00Z",
          updatedAt: "2026-08-19T08:10:00Z",
        },
        {
          id: "s2",
          userId: "u1",
          activityType: "flashcard",
          startedAt: "2026-08-20T08:00:00Z", // Yesterday
          lastActivityAt: "2026-08-20T08:10:00Z",
          durationSeconds: 600,
          createdAt: "2026-08-20T08:00:00Z",
          updatedAt: "2026-08-20T08:10:00Z",
        },
      ];

      const result = calculateStreakSummary(sessions, refDate, "Asia/Tehran");
      // Yesterday completed a 2-day streak; today is still open -> streak is 2
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
      expect(result.todayIsActive).toBe(false);
      expect(result.todayStudySeconds).toBe(0);
    });

    it("correctly computes broken streak and preserves historic longest streak", () => {
      const refDate = new Date("2026-08-21T12:00:00Z");
      // Historical streak of 4 days: Aug 10, 11, 12, 13
      // Missed: Aug 14
      // New streak of 2 days: Aug 20, 21
      const sessions: StudySessionRecord[] = [
        { id: "1", userId: "u1", activityType: "lesson", startedAt: "2026-08-10T10:00:00Z", lastActivityAt: "2026-08-10T10:10:00Z", durationSeconds: 600, createdAt: "", updatedAt: "" },
        { id: "2", userId: "u1", activityType: "lesson", startedAt: "2026-08-11T10:00:00Z", lastActivityAt: "2026-08-11T10:10:00Z", durationSeconds: 600, createdAt: "", updatedAt: "" },
        { id: "3", userId: "u1", activityType: "lesson", startedAt: "2026-08-12T10:00:00Z", lastActivityAt: "2026-08-12T10:10:00Z", durationSeconds: 600, createdAt: "", updatedAt: "" },
        { id: "4", userId: "u1", activityType: "lesson", startedAt: "2026-08-13T10:00:00Z", lastActivityAt: "2026-08-13T10:10:00Z", durationSeconds: 600, createdAt: "", updatedAt: "" },
        // Missed Aug 14-19
        { id: "5", userId: "u1", activityType: "lesson", startedAt: "2026-08-20T10:00:00Z", lastActivityAt: "2026-08-20T10:10:00Z", durationSeconds: 600, createdAt: "", updatedAt: "" },
        { id: "6", userId: "u1", activityType: "lesson", startedAt: "2026-08-21T10:00:00Z", lastActivityAt: "2026-08-21T10:10:00Z", durationSeconds: 600, createdAt: "", updatedAt: "" },
      ];

      const result = calculateStreakSummary(sessions, refDate, "Asia/Tehran");
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(4);
      expect(result.studyDaysCount).toBe(6);
    });

    it("respects timezone boundaries near midnight", () => {
      // 2026-08-21 14:45 UTC is 23:45 on Aug 21 in Tokyo (UTC+9)
      const sessionInTokyo: StudySessionRecord[] = [
        {
          id: "s1",
          userId: "u1",
          activityType: "lesson",
          startedAt: "2026-08-21T14:45:00Z", // 23:45 on Aug 21 in Tokyo
          lastActivityAt: "2026-08-21T14:55:00Z",
          durationSeconds: 600,
          createdAt: "2026-08-21T14:45:00Z",
          updatedAt: "2026-08-21T14:55:00Z",
        },
      ];

      // A) In Tokyo at 14:55 UTC (23:55 on Aug 21 in Tokyo): today is Aug 21 -> active today!
      const refDateTokyoSameDay = new Date("2026-08-21T14:55:00Z");
      const resultTokyoSameDay = calculateStreakSummary(sessionInTokyo, refDateTokyoSameDay, "Asia/Tokyo");
      expect(resultTokyoSameDay.todayIsActive).toBe(true);
      expect(resultTokyoSameDay.currentStreak).toBe(1);

      // B) In Tokyo at 15:10 UTC (00:10 on Aug 22 in Tokyo): today is Aug 22 -> today not active yet, but streak preserved from yesterday (Aug 21)!
      const refDateTokyoNextDay = new Date("2026-08-21T15:10:00Z");
      const resultTokyoNextDay = calculateStreakSummary(sessionInTokyo, refDateTokyoNextDay, "Asia/Tokyo");
      expect(resultTokyoNextDay.todayIsActive).toBe(false);
      expect(resultTokyoNextDay.currentStreak).toBe(1);

      // C) In Los Angeles (UTC-7) at 15:10 UTC (08:10 AM on Aug 21): today is still Aug 21 -> active today!
      const refDateLA = new Date("2026-08-21T15:10:00Z");
      const resultLA = calculateStreakSummary(sessionInTokyo, refDateLA, "America/Los_Angeles");
      expect(resultLA.todayIsActive).toBe(true);
      expect(resultLA.currentStreak).toBe(1);
    });
  });
});
