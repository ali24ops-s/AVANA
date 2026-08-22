/**
 * Study consumption domain primitives (PR6-7).
 *
 * Pure, framework-independent types and functions for the study
 * consumption module: flashcard spaced-repetition review scheduling,
 * quiz attempts, and study analytics/recommendations.
 *
 * Design rules:
 *  - Pure domain logic only (no infrastructure/network/observability).
 *  - Scheduling is intentionally minimal and deterministic — an
 *    "FSRS-inspired" algorithm, NOT a full FSRS engine.
 *  - Reviews and quiz attempts are synchronous (no queue).
 */

// ---------------------------------------------------------------------------
// Flashcard review scheduling
// ---------------------------------------------------------------------------

/**
 * The rating a student gives a flashcard after reviewing it.
 *
 * Mirrors the FSRS rating scale but kept minimal:
 *   again  — did not recall (resets interval)
 *   hard   — recalled with difficulty
 *   good   — recalled correctly
 *   easy   — recalled easily (longer interval)
 */
export type FlashcardRating = "again" | "hard" | "good" | "easy";

export const FLASHCARD_RATINGS: readonly FlashcardRating[] = [
  "again",
  "hard",
  "good",
  "easy",
];

export function isFlashcardRating(value: string): value is FlashcardRating {
  return (FLASHCARD_RATINGS as readonly string[]).includes(value);
}

/**
 * The minimal scheduling state persisted on a flashcard.
 */
export type FlashcardScheduleState = {
  /** Interval length in days produced by the last review. */
  intervalDays: number;
  /** Ease factor (multiplier) used to grow the interval. */
  easeFactor: number;
};

/**
 * Default scheduling state for a newly materialized flashcard.
 */
export const DEFAULT_FLASHCARD_SCHEDULE: Readonly<FlashcardScheduleState> = {
  intervalDays: 0,
  easeFactor: 2.5,
};

/**
 * Compute the next flashcard review interval (in days) from a rating and the
 * previous scheduling state.
 *
 * This is an "FSRS-inspired" minimal algorithm — intentionally simple and
 * deterministic. It is NOT a full FSRS engine.
 *
 * Rules:
 *  - `again` resets the interval to 0 days (due again immediately/soon).
 *  - `hard` sets a short interval (max(1, previous * 1.2)).
 *  - `good` grows the interval by the ease factor.
 *  - `easy` grows the interval faster (good * 1.3).
 *  - Ease factor adjusts slightly per rating (never below 1.3).
 */
export function nextReviewInterval(
  rating: FlashcardRating,
  previous: FlashcardScheduleState = DEFAULT_FLASHCARD_SCHEDULE,
): FlashcardScheduleState {
  const prevInterval = previous.intervalDays;
  const prevEase = previous.easeFactor;

  let intervalDays: number;
  let easeFactor = prevEase;

  switch (rating) {
    case "again":
      intervalDays = 0; // due again now/immediately
      easeFactor = Math.max(1.3, prevEase - 0.2);
      break;
    case "hard":
      intervalDays = prevInterval === 0 ? 1 : Math.max(1, prevInterval * 1.2);
      easeFactor = Math.max(1.3, prevEase - 0.15);
      break;
    case "good":
      intervalDays = prevInterval === 0 ? 1 : prevInterval * prevEase;
      break;
    case "easy":
      intervalDays =
        prevInterval === 0 ? 2 : Math.round(prevInterval * prevEase * 1.3);
      easeFactor = Math.min(3.0, prevEase + 0.15);
      break;
  }

  return {
    intervalDays: Math.round(intervalDays),
    easeFactor: Math.round(easeFactor * 100) / 100,
  };
}

/**
 * Compute the next `due_at` timestamp given a rating and the previous
 * scheduling state. Returns the ISO timestamp of when the card is due again.
 *
 * `again` schedules a very short re-review window (10 minutes) so the card
 * reappears in the near-term review queue rather than being dropped.
 */
export function nextDueAt(
  rating: FlashcardRating,
  previous: FlashcardScheduleState = DEFAULT_FLASHCARD_SCHEDULE,
  now: Date = new Date(),
): string {
  const next = nextReviewInterval(rating, previous);
  const ms =
    next.intervalDays === 0
      ? 10 * 60 * 1000 // 10 minutes for "again"
      : next.intervalDays * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms).toISOString();
}

// ---------------------------------------------------------------------------
// Flashcard review input
// ---------------------------------------------------------------------------

export type FlashcardReviewInput = {
  flashcardId: string;
  rating: FlashcardRating;
  reactionMs?: number;
};

// ---------------------------------------------------------------------------
// Quiz attempts
// ---------------------------------------------------------------------------

export type QuizQuestionAnswerInput = {
  questionId: string;
  /** The student's selected answer (string for MC, boolean for TF, string for fill). */
  answer: unknown;
};

export type QuizAttemptInput = {
  quizId: string;
  answers: QuizQuestionAnswerInput[];
};

/**
 * Result of a quiz attempt: percentage score and per-question correctness.
 */
export type QuizAttemptResult = {
  attemptId: string;
  quizId: string;
  score: number; // 0–100 percentage
  correct: number;
  total: number;
  answers: Record<string, unknown>;
  completedAt: string;
};

/**
 * Immutable quiz attempt record stored in `quiz_attempts`.
 */
export type QuizAttemptRecord = {
  id: string;
  quizId?: string | null;
  userId: string;
  score: number;
  answers: Record<string, unknown>;
  questionIds?: string[] | null;
  topic?: string | null;
  difficulty?: string | null;
  status?: string;
  startedAt: string;
  completedAt?: string | null;
};

// ---------------------------------------------------------------------------
// Study analytics / recommendations
// ---------------------------------------------------------------------------

export type StudyTopicMastery = {
  topic: string;
  mastered: boolean;
  mastery_percent: number;
};

export type StudyAnalytics = {
  total_lessons: number;
  completed_lessons: number;
  lesson_progress_percent: number;
  total_flashcards: number;
  reviewed_flashcards: number;
  flashcard_mastery_percent: number;
  total_quizzes: number;
  attempts_taken: number;
  average_quiz_score: number;
  weak_areas: string[];
  recommended_next_steps: string[];
};

export type StudyRecommendation = {
  id: string;
  summary: string;
  topics: string[];
  source:
    "accepted_lesson" | "flashcard_review" | "quiz_attempt" | "recommendation";
};

// ---------------------------------------------------------------------------
// Flashcard Study Session & Resume Models
// ---------------------------------------------------------------------------

export type FlashcardSessionStatus = "in_progress" | "completed" | "cancelled";
export type FlashcardSessionCardStatus = "unseen" | "reviewed";

export type FlashcardStudySessionRecord = {
  id: string;
  userId: string;
  organizationId: string;
  courseId?: string | null;
  title: string;
  mode: string;
  customMode?: string | null;
  status: FlashcardSessionStatus;
  totalCards: number;
  completedCards: number;
  currentIndex: number;
  currentCardId?: string | null;
  startedAt: string;
  lastActivityAt: string;
  completedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type FlashcardStudySessionCardRecord = {
  id: string;
  sessionId: string;
  flashcardId?: string | null;
  sortOrder: number;
  status: FlashcardSessionCardStatus;
  rating?: string | null;
  reactionMs?: number | null;
  reviewedAt?: string | null;
  createdAt: string;
};
