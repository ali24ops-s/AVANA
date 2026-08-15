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
    expect(freshNext.intervalDays).toBe(1);
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

  it("calculates nextDueAt correctly for again vs days interval", () => {
    const fixedNow = new Date("2026-08-12T12:00:00.000Z");
    // "again" schedules 10 minutes in the future
    const dueAgain = nextDueAt("again", { intervalDays: 5, easeFactor: 2.5 }, fixedNow);
    expect(dueAgain).toBe("2026-08-12T12:10:00.000Z");

    // "good" with previous interval 4 -> interval 10 days
    const dueGood = nextDueAt("good", { intervalDays: 4, easeFactor: 2.5 }, fixedNow);
    expect(dueGood).toBe("2026-08-22T12:00:00.000Z");
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
