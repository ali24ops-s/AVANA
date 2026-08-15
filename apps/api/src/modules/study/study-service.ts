/**
 * StudyService (PR6-7) — Student-facing study consumption.
 *
 * Implements the student-facing study module:
 *  - Flashcard reviews (spaced-repetition scheduling via FSRS-inspired algorithm).
 *  - Quiz attempts and scoring.
 *  - Study analytics and recommendations.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type FlashcardId,
  type OrganizationId,
  type QuizAttemptId,
  type QuizId,
  DomainError,
  nextReviewInterval,
  nextDueAt,
  auditFlashcardReviewed,
  auditQuizAttempted,
} from "@avana/domain";
import type {
  FlashcardRating,
  QuizAttemptInput,
  QuizAttemptResult,
  QuizAttemptRecord,
  StudyAnalytics,
  StudyRecommendation,
} from "@avana/domain";
import type {
  FlashcardStore,
  FlashcardReviewStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
  FlashcardRecord,
  QuizRecord,
} from "./study-store.js";
import type { ModuleStore, LessonStore, ProgressStore } from "../learning/learning-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { AuditService } from "../../observability/audit-service.js";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class StudyService {
  constructor(
    private readonly flashcardStore: FlashcardStore,
    private readonly flashcardReviewStore: FlashcardReviewStore,
    private readonly quizStore: QuizStore,
    private readonly quizQuestionStore: QuizQuestionStore,
    private readonly quizAttemptStore: QuizAttemptStore,
    private readonly moduleStore: ModuleStore,
    private readonly lessonStore: LessonStore,
    private readonly progressStore: ProgressStore,
    private readonly policy: AuthorizationPolicy,
    private readonly auditService?: AuditService,
    private readonly organizationStore?: OrganizationStore,
  ) {}

  // -------------------------------------------------------------------------
  // Authorization helpers
  // -------------------------------------------------------------------------

  /** Authorize a study consumption action with tenant isolation (non-disclosing 404). */
  async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: "study:read" | "flashcard:review" | "quiz:attempt",
  ): Promise<void> {
    if (this.organizationStore) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Organization not found");
      }
    }
    const context: AuthContext = { organizationId };
    this.policy.require(action, actor, context);
  }

  private async authorizeRead(actor: Actor, organizationId: OrganizationId): Promise<void> {
    await this.authorize(actor, organizationId, "study:read");
  }

  private async authorizeFlashcardReview(actor: Actor, organizationId: OrganizationId): Promise<void> {
    await this.authorize(actor, organizationId, "flashcard:review");
  }

  private async authorizeQuizAttempt(actor: Actor, organizationId: OrganizationId): Promise<void> {
    await this.authorize(actor, organizationId, "quiz:attempt");
  }

  // -------------------------------------------------------------------------
  // Flashcards
  // -------------------------------------------------------------------------

  /**
   * List flashcards that are due for review for the current student in a course.
   * Filters by the persisted due_at column: only cards where due_at <= now are returned.
   */
  async listFlashcardsForReview(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<FlashcardRecord[]> {
    await this.authorizeRead(actor, organizationId);

    const allFlashcards = await this.flashcardStore.listByCourse(courseId, organizationId);
    const now = new Date();

    return allFlashcards.filter((f) => {
      const dueAt = new Date(f.dueAt);
      return dueAt <= now;
    });
  }

  /**
   * Submit a flashcard review.
   * Persists the review record and advances the scheduling state (due_at, interval_days, ease_factor).
   */
  async submitFlashcardReview(
    actor: Actor,
    organizationId: OrganizationId,
    input: { flashcardId: FlashcardId; rating: FlashcardRating; reactionMs?: number },
  ): Promise<void> {
    await this.authorizeFlashcardReview(actor, organizationId);

    const flashcard = await this.flashcardStore.findByIdForOrganization(
      input.flashcardId,
      organizationId,
    );
    if (!flashcard) {
      throw new DomainError("not_found", "Flashcard not found");
    }

    // Compute next scheduling state from current persisted state.
    const previousState = {
      intervalDays: flashcard.intervalDays,
      easeFactor: flashcard.easeFactor,
    };
    const nextState = nextReviewInterval(input.rating, previousState);
    const newDueAt = nextDueAt(input.rating, previousState);
    const now = new Date().toISOString();

    // Persist review event.
    await this.flashcardReviewStore.create({
      id: randomUUID(),
      flashcardId: input.flashcardId,
      userId: actor.userId,
      rating: input.rating,
      reviewedAt: now,
      reactionMs: input.reactionMs ?? null,
    });

    // Persist updated scheduling state on the flashcard row.
    await this.flashcardStore.updateSchedule(input.flashcardId, {
      dueAt: newDueAt,
      intervalDays: nextState.intervalDays,
      easeFactor: nextState.easeFactor,
      updatedAt: now,
    });

    if (this.auditService) {
      await this.auditService.emit([
        auditFlashcardReviewed(actor.userId, organizationId, input.flashcardId, {
          courseId: flashcard.courseId,
          rating: input.rating,
          reactionMs: input.reactionMs ?? null,
        }),
      ]);
    }
  }

  // -------------------------------------------------------------------------
  // Quizzes
  // -------------------------------------------------------------------------

  /** List published quizzes for a course. */
  async listQuizzes(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<QuizRecord[]> {
    await this.authorizeRead(actor, organizationId);
    const quizzes = await this.quizStore.listByCourse(courseId, organizationId);
    return quizzes.filter((q) => q.status === "published");
  }

  /** Get a published quiz with its questions for attempt. */
  async getQuizForAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    quizId: QuizId,
  ): Promise<QuizRecord & { questions: Awaited<ReturnType<QuizQuestionStore["listByQuiz"]>> }> {
    await this.authorizeRead(actor, organizationId);
    const quiz = await this.quizStore.findByIdForOrganization(quizId, organizationId);
    if (!quiz) throw new DomainError("not_found", "Quiz not found");
    if (quiz.status !== "published") throw new DomainError("not_found", "Quiz not found");

    const questions = await this.quizQuestionStore.listByQuiz(quizId);
    return { ...quiz, questions };
  }

  /** Submit a quiz attempt. Scores the answers and persists the result. */
  async submitQuizAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    input: QuizAttemptInput,
  ): Promise<QuizAttemptResult> {
    await this.authorizeQuizAttempt(actor, organizationId);

    const quiz = await this.quizStore.findByIdForOrganization(input.quizId as QuizId, organizationId);
    if (!quiz) throw new DomainError("not_found", "Quiz not found");

    const questions = await this.quizQuestionStore.listByQuiz(input.quizId as QuizId);
    if (questions.length === 0) {
      throw new DomainError("unprocessable", "Quiz has no questions");
    }

    let correctCount = 0;
    const answersMap: Record<string, unknown> = {};

    for (const q of questions) {
      const studentAnswer = input.answers.find((a: { questionId: string }) => a.questionId === q.id);
      answersMap[q.id] = studentAnswer?.answer ?? null;
      if (JSON.stringify(studentAnswer?.answer) === JSON.stringify(q.correctAnswer)) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / questions.length) * 100 * 100) / 100;
    const attemptId = randomUUID();
    const now = new Date().toISOString();

    const attempt: QuizAttemptRecord = {
      id: attemptId,
      quizId: input.quizId,
      userId: actor.userId,
      score,
      answers: answersMap,
      startedAt: now,
      completedAt: now,
    };

    await this.quizAttemptStore.create(attempt);

    if (this.auditService) {
      await this.auditService.emit([
        auditQuizAttempted(actor.userId, organizationId, input.quizId as QuizId, {
          courseId: quiz.courseId,
          attemptId,
          score,
          correct: correctCount,
          total: questions.length,
        }),
      ]);
    }

    return {
      attemptId,
      quizId: input.quizId,
      score,
      correct: correctCount,
      total: questions.length,
      answers: answersMap,
      completedAt: now,
    };
  }

  /** Get a specific quiz attempt by ID. Non-disclosing for other users. */
  async getQuizAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    attemptId: QuizAttemptId,
  ): Promise<QuizAttemptRecord> {
    await this.authorizeRead(actor, organizationId);
    const attempt = await this.quizAttemptStore.findById(attemptId);
    // Non-disclosing: return not_found if the attempt belongs to another user.
    if (!attempt || attempt.userId !== actor.userId) {
      throw new DomainError("not_found", "Quiz attempt not found");
    }
    return attempt;
  }

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  /**
   * Get study analytics for a user in a course.
   * Derived from real persisted data: lesson progress, flashcard reviews, quiz attempts.
   */
  async getStudyAnalytics(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<StudyAnalytics> {
    await this.authorizeRead(actor, organizationId);

    // Fetch all data in parallel.
    const [modules, flashcards, attempts, progressRecords] = await Promise.all([
      this.moduleStore.listByCourse(courseId),
      this.flashcardStore.listByCourse(courseId, organizationId),
      this.quizAttemptStore.listByUserAndCourse(actor.userId, courseId),
      this.progressStore.listByUserAndCourse(actor.userId, courseId),
    ]);

    // Batch-load lessons for all modules.
    const moduleIds = modules.map((m) => m.id);
    const lessons = moduleIds.length > 0
      ? await this.lessonStore.listByModules(moduleIds)
      : [];

    const publishedLessons = lessons.filter((l) => l.publicationStatus === "published");
    const completedLessonIds = new Set(
      progressRecords.filter((p) => p.completed).map((p) => p.lessonId),
    );

    const totalLessons = publishedLessons.length;
    const completedLessons = publishedLessons.filter((l) =>
      completedLessonIds.has(l.id),
    ).length;
    const lessonProgressPercent =
      totalLessons > 0
        ? Math.round((completedLessons / totalLessons) * 100)
        : 0;

    // Flashcard mastery heuristic: cards where due_at is > 7 days from now are counted
    // as "mastered" for progress overview. Note: this is a lightweight heuristic based
    // on review intervals rather than a formal cognitive/probabilistic mastery model.
    const totalFlashcards = flashcards.length;
    const now = new Date();
    const masteryThresholdMs = 7 * 24 * 60 * 60 * 1000;
    const reviewedFlashcards = flashcards.filter((f) => {
      // A card has been reviewed if its interval > 0.
      return f.intervalDays > 0;
    }).length;
    const masteredFlashcards = flashcards.filter((f) => {
      const dueAt = new Date(f.dueAt);
      return dueAt.getTime() - now.getTime() > masteryThresholdMs;
    }).length;
    const flashcardMasteryPercent =
      totalFlashcards > 0
        ? Math.round((masteredFlashcards / totalFlashcards) * 100)
        : 0;

    // Quiz analytics.
    const quizzes = await this.quizStore.listByCourse(courseId, organizationId);
    const totalQuizzes = quizzes.filter((q) => q.status === "published").length;
    const attemptsTaken = attempts.length;
    const averageQuizScore =
      attemptsTaken > 0
        ? Math.round(
            (attempts.reduce((sum, a) => sum + a.score, 0) / attemptsTaken) * 100,
          ) / 100
        : 0;

    // Weak areas: quizzes where the last attempt scored below 70%.
    const attemptsByQuiz = new Map<string, QuizAttemptRecord>();
    for (const a of attempts) {
      const existing = attemptsByQuiz.get(a.quizId);
      if (!existing || new Date(a.completedAt) > new Date(existing.completedAt)) {
        attemptsByQuiz.set(a.quizId, a);
      }
    }
    const weakAreas: string[] = [];
    for (const quiz of quizzes) {
      const lastAttempt = attemptsByQuiz.get(quiz.id);
      if (lastAttempt && lastAttempt.score < 70) {
        weakAreas.push(quiz.title);
      }
    }

    const recommendedNextSteps: string[] = [];
    if (completedLessons < totalLessons) {
      recommendedNextSteps.push("Continue reading lesson content");
    }
    if (reviewedFlashcards < totalFlashcards) {
      recommendedNextSteps.push("Review due flashcards");
    }
    if (weakAreas.length > 0) {
      recommendedNextSteps.push("Retry quizzes in weak areas");
    }
    if (totalFlashcards > 0 && flashcardMasteryPercent < 50) {
      recommendedNextSteps.push("Focus on flashcard mastery");
    }

    return {
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
      lesson_progress_percent: lessonProgressPercent,
      total_flashcards: totalFlashcards,
      reviewed_flashcards: reviewedFlashcards,
      flashcard_mastery_percent: flashcardMasteryPercent,
      total_quizzes: totalQuizzes,
      attempts_taken: attemptsTaken,
      average_quiz_score: averageQuizScore,
      weak_areas: weakAreas,
      recommended_next_steps: recommendedNextSteps,
    };
  }

  /**
   * Get study recommendations for a user in a course.
   * Derived from analytics: surfaces actionable next steps as structured records.
   */
  async getStudyRecommendations(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<StudyRecommendation[]> {
    await this.authorizeRead(actor, organizationId);

    const analytics = await this.getStudyAnalytics(actor, organizationId, courseId);
    const recommendations: StudyRecommendation[] = [];

    if (analytics.reviewed_flashcards < analytics.total_flashcards) {
      const dueCount = analytics.total_flashcards - analytics.reviewed_flashcards;
      recommendations.push({
        id: randomUUID(),
        summary: `You have ${dueCount} flashcard(s) due for review.`,
        topics: ["Flashcard Review"],
        source: "flashcard_review",
      });
    }

    if (analytics.weak_areas.length > 0) {
      recommendations.push({
        id: randomUUID(),
        summary: `Retry quizzes in weak areas: ${analytics.weak_areas.join(", ")}.`,
        topics: analytics.weak_areas,
        source: "quiz_attempt",
      });
    }

    if (analytics.completed_lessons < analytics.total_lessons) {
      recommendations.push({
        id: randomUUID(),
        summary: `Complete ${analytics.total_lessons - analytics.completed_lessons} remaining lesson(s).`,
        topics: ["Lesson Reading"],
        source: "accepted_lesson",
      });
    }

    return recommendations;
  }
}
