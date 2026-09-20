/**
 * PR6-7: Study consumption domain primitives.
 *
 * Tests:
 * - Flashcard rating validation and rating scale
 * - Spaced-repetition scheduling algorithm (nextReviewInterval, nextDueAt)
 * - Policy actions (flashcard:review, quiz:attempt, study:read)
 * - Audit event helpers (flashcard.reviewed, quiz.attempted)
 */

import { describe, expect, it } from "vitest";
import {
  FLASHCARD_RATINGS,
  isFlashcardRating,
  DEFAULT_FLASHCARD_SCHEDULE,
  nextReviewInterval,
  nextDueAt,
  formatReviewIntervalHint,
  isFlashcardGraduatedInSession,
} from "../study.js";
import {
  auditFlashcardReviewed,
  auditQuizAttempted,
} from "../authorization/audit.js";
import { RoleBasedPolicy } from "../authorization/policy.js";
import type { Actor, AuthContext } from "../authorization/policy.js";
import type {
  FlashcardId,
  QuizId,
  UserId,
  OrganizationId,
} from "../ids.js";

const mockUserId = "00000000-0000-0000-0000-000000000001" as UserId;
const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockFlashcardId = "00000000-0000-0000-0000-000000000020" as FlashcardId;
const mockQuizId = "00000000-0000-0000-0000-000000000030" as QuizId;

function makeActor(role: string): Actor {
  return {
    userId: mockUserId,
    role: role as Actor["role"],
  };
}

const defaultContext: AuthContext = {
  organizationId: mockOrgId,
};

describe("PR6-7 Flashcard Ratings & Validation", () => {
  it("defines the 4 FSRS rating scales", () => {
    expect(FLASHCARD_RATINGS).toEqual(["again", "hard", "good", "easy"]);
  });

  it("validates valid flashcard ratings", () => {
    expect(isFlashcardRating("again")).toBe(true);
    expect(isFlashcardRating("hard")).toBe(true);
    expect(isFlashcardRating("good")).toBe(true);
    expect(isFlashcardRating("easy")).toBe(true);
    expect(isFlashcardRating("unknown")).toBe(false);
    expect(isFlashcardRating("")).toBe(false);
  });
});

describe("PR6-7 Spaced Repetition Scheduling Algorithm", () => {
  it("provides default flashcard schedule", () => {
    expect(DEFAULT_FLASHCARD_SCHEDULE).toEqual({
      intervalDays: 0,
      easeFactor: 2.5,
    });
  });

  it("handles 'again' rating by resetting interval to 0 and decreasing ease factor", () => {
    const previous = { intervalDays: 10, easeFactor: 2.5 };
    const next = nextReviewInterval("again", previous);
    expect(next.intervalDays).toBe(0);
    expect(next.easeFactor).toBe(2.3);
  });

  it("never reduces ease factor below 1.3", () => {
    const previous = { intervalDays: 1, easeFactor: 1.4 };
    const next = nextReviewInterval("again", previous);
    expect(next.intervalDays).toBe(0);
    expect(next.easeFactor).toBe(1.3);
  });

  it("handles 'hard' rating on fresh card vs previously reviewed card", () => {
    const freshNext = nextReviewInterval("hard", DEFAULT_FLASHCARD_SCHEDULE);
    // New card Hard is intraday (10 minutes -> 0 days)
    expect(freshNext.intervalDays).toBe(0);
    expect(freshNext.easeFactor).toBe(2.35);

    const reviewedNext = nextReviewInterval("hard", {
      intervalDays: 10,
      easeFactor: 2.0,
    });
    expect(reviewedNext.intervalDays).toBe(12);
    expect(reviewedNext.easeFactor).toBe(1.85);
  });

  it("handles 'good' rating by growing interval by ease factor", () => {
    const freshNext = nextReviewInterval("good", DEFAULT_FLASHCARD_SCHEDULE);
    expect(freshNext.intervalDays).toBe(1);
    expect(freshNext.easeFactor).toBe(2.5);

    const reviewedNext = nextReviewInterval("good", {
      intervalDays: 4,
      easeFactor: 2.5,
    });
    expect(reviewedNext.intervalDays).toBe(10);
    expect(reviewedNext.easeFactor).toBe(2.5);
  });

  it("handles 'easy' rating by growing interval faster and increasing ease factor", () => {
    const freshNext = nextReviewInterval("easy", DEFAULT_FLASHCARD_SCHEDULE);
    expect(freshNext.intervalDays).toBe(2);
    expect(freshNext.easeFactor).toBe(2.65);

    const reviewedNext = nextReviewInterval("easy", {
      intervalDays: 4,
      easeFactor: 2.5,
    });
    // 4 * 2.5 * 1.3 = 13
    expect(reviewedNext.intervalDays).toBe(13);
    expect(reviewedNext.easeFactor).toBe(2.65);
  });

  it("calculates nextDueAt correctly for New Cards (Again: 3m, Hard: 10m, Good: 1d, Easy: 2d)", () => {
    const fixedNow = new Date("2026-08-12T12:00:00.000Z");
    
    // New Card Again -> 3 minutes
    const dueAgain = nextDueAt("again", DEFAULT_FLASHCARD_SCHEDULE, fixedNow);
    expect(dueAgain).toBe("2026-08-12T12:03:00.000Z");

    // New Card Hard -> 10 minutes
    const dueHard = nextDueAt("hard", DEFAULT_FLASHCARD_SCHEDULE, fixedNow);
    expect(dueHard).toBe("2026-08-12T12:10:00.000Z");

    // New Card Good -> 1 day (24 hours)
    const dueGood = nextDueAt("good", DEFAULT_FLASHCARD_SCHEDULE, fixedNow);
    expect(dueGood).toBe("2026-08-13T12:00:00.000Z");

    // New Card Easy -> 2 days (48 hours)
    const dueEasy = nextDueAt("easy", DEFAULT_FLASHCARD_SCHEDULE, fixedNow);
    expect(dueEasy).toBe("2026-08-14T12:00:00.000Z");
  });

  it("calculates nextDueAt correctly for Review Cards (Again: 10m lapse, Good: days interval)", () => {
    const fixedNow = new Date("2026-08-12T12:00:00.000Z");
    // "again" on reviewed card schedules 10 minutes lapse
    const dueAgain = nextDueAt("again", { intervalDays: 5, easeFactor: 2.5 }, fixedNow);
    expect(dueAgain).toBe("2026-08-12T12:10:00.000Z");

    // "good" with previous interval 4 -> interval 10 days
    const dueGood = nextDueAt("good", { intervalDays: 4, easeFactor: 2.5 }, fixedNow);
    expect(dueGood).toBe("2026-08-22T12:00:00.000Z");
  });

  it("formats human-readable review interval hints for New Cards vs Review Cards", () => {
    // New Cards
    expect(formatReviewIntervalHint("again", DEFAULT_FLASHCARD_SCHEDULE)).toBe("۳ دقیقه");
    expect(formatReviewIntervalHint("hard", DEFAULT_FLASHCARD_SCHEDULE)).toBe("۱۰ دقیقه");
    expect(formatReviewIntervalHint("good", DEFAULT_FLASHCARD_SCHEDULE)).toBe("۱ روز");
    expect(formatReviewIntervalHint("easy", DEFAULT_FLASHCARD_SCHEDULE)).toBe("۲ روز");

    // Review Cards (interval: 4, ease: 2.5)
    expect(formatReviewIntervalHint("again", { intervalDays: 4, easeFactor: 2.5 })).toBe("< ۱۰ دقیقه");
    expect(formatReviewIntervalHint("hard", { intervalDays: 4, easeFactor: 2.5 })).toBe("۵ روز");
    expect(formatReviewIntervalHint("good", { intervalDays: 4, easeFactor: 2.5 })).toBe("۱۰ روز");
    expect(formatReviewIntervalHint("easy", { intervalDays: 4, easeFactor: 2.5 })).toBe("۱۳ روز");
  });
});

describe("PR6-7 Policy Authorization", () => {
  const policy = new RoleBasedPolicy();

  it("allows student, course_editor, and org_admin to review flashcards", () => {
    expect(policy.check("flashcard:review", makeActor("student"), defaultContext)).toBe(true);
    expect(policy.check("flashcard:review", makeActor("course_editor"), defaultContext)).toBe(true);
    expect(policy.check("flashcard:review", makeActor("organization_admin"), defaultContext)).toBe(true);
  });

  it("allows student, course_editor, and org_admin to attempt quizzes", () => {
    expect(policy.check("quiz:attempt", makeActor("student"), defaultContext)).toBe(true);
    expect(policy.check("quiz:attempt", makeActor("course_editor"), defaultContext)).toBe(true);
    expect(policy.check("quiz:attempt", makeActor("organization_admin"), defaultContext)).toBe(true);
  });

  it("allows student, course_editor, and org_admin to read study content and analytics", () => {
    expect(policy.check("study:read", makeActor("student"), defaultContext)).toBe(true);
    expect(policy.check("study:read", makeActor("course_editor"), defaultContext)).toBe(true);
    expect(policy.check("study:read", makeActor("organization_admin"), defaultContext)).toBe(true);
  });
});

describe("PR6-7 Audit Helpers", () => {
  it("creates valid auditFlashcardReviewed event", () => {
    const event = auditFlashcardReviewed(mockUserId, mockOrgId, mockFlashcardId, {
      courseId: "course-1",
      rating: "good",
      reactionMs: 1200,
    });

    expect(event.action).toBe("flashcard.reviewed");
    expect(event.entityType).toBe("flashcard_review");
    expect(event.entityId).toBe(mockFlashcardId);
    expect(event.actorId).toBe(mockUserId);
    expect(event.organizationId).toBe(mockOrgId);
    expect(event.details).toEqual({
      course_id: "course-1",
      rating: "good",
      reaction_ms: 1200,
    });
  });

  it("creates valid auditQuizAttempted event", () => {
    const event = auditQuizAttempted(mockUserId, mockOrgId, mockQuizId, {
      courseId: "course-1",
      attemptId: "attempt-1",
      score: 85,
      correct: 4,
      total: 5,
    });

    expect(event.action).toBe("quiz.attempted");
    expect(event.entityType).toBe("quiz_attempt");
    expect(event.entityId).toBe(mockQuizId);
    expect(event.actorId).toBe(mockUserId);
    expect(event.organizationId).toBe(mockOrgId);
    expect(event.details).toEqual({
      course_id: "course-1",
      attempt_id: "attempt-1",
      score: 85,
      correct: 4,
      total: 5,
    });
  });
});

describe("Flashcard Session Graduation Logic (isFlashcardGraduatedInSession)", () => {
  it("never graduates an empty or 'again' rating", () => {
    expect(isFlashcardGraduatedInSession([])).toBe(false);
    expect(isFlashcardGraduatedInSession(["again"])).toBe(false);
    expect(isFlashcardGraduatedInSession(["good", "again"])).toBe(false);
    expect(isFlashcardGraduatedInSession(["hard", "hard", "hard", "again"])).toBe(false);
  });

  it("handles Hard ratings (Scenario 1-4: exactly 4 evaluations required to graduate)", () => {
    // 1st Hard -> Not completed
    expect(isFlashcardGraduatedInSession(["hard"])).toBe(false);
    // 2nd Hard -> Not completed
    expect(isFlashcardGraduatedInSession(["hard", "hard"])).toBe(false);
    // 3rd Hard -> Not completed
    expect(isFlashcardGraduatedInSession(["hard", "hard", "hard"])).toBe(false);
    // 4th Hard -> Completed!
    expect(isFlashcardGraduatedInSession(["hard", "hard", "hard", "hard"])).toBe(true);
    // 5th Hard -> Completed
    expect(isFlashcardGraduatedInSession(["hard", "hard", "hard", "hard", "hard"])).toBe(true);
  });

  it("handles Good ratings (Scenario 5: 1st Good is NOT completed, 2nd Good graduates)", () => {
    // 1st Good -> Not completed, stays in session
    expect(isFlashcardGraduatedInSession(["good"])).toBe(false);
    // 2nd Good -> Completed!
    expect(isFlashcardGraduatedInSession(["good", "good"])).toBe(true);
    // Again followed by Good -> 2 evaluations, completes!
    expect(isFlashcardGraduatedInSession(["again", "good"])).toBe(true);
    // Hard followed by Good -> 2 evaluations, completes!
    expect(isFlashcardGraduatedInSession(["hard", "good"])).toBe(true);
  });

  it("handles Easy ratings (graduates immediately on 1st evaluation)", () => {
    expect(isFlashcardGraduatedInSession(["easy"])).toBe(true);
    expect(isFlashcardGraduatedInSession(["again", "easy"])).toBe(true);
    expect(isFlashcardGraduatedInSession(["hard", "easy"])).toBe(true);
  });
});
