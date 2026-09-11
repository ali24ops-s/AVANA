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
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type QuizAttemptId,
  type QuizId,
  type QuizQuestionId,
  type ResourceAccessResult,
  type StudySessionRecord,
  type StartStudySessionInput,
  type WeeklyStudyTimeSummary,
  type DashboardStatsSummary,
  DomainError,
  nextReviewInterval,
  nextDueAt,
  auditFlashcardReviewed,
  auditQuizAttempted,
  isStudyActivityType,
  STUDY_SESSION_CONFIG,
  validateTimezone,
  getPersianWeekDates,
  calculateWeeklyStudyTimeSummary,
  calculateStreakSummary,
  evaluateQuestionAnswer,
  type QuestionEvaluationResult,
  seededRandomShuffle,
} from "@avana/domain";
import type {
  FlashcardRating,
  QuizAttemptInput,
  QuizAttemptResult,
  QuizAttemptRecord,
  ExamHistoryItem,
  StudyAnalytics,
  StudyRecommendation,
  FlashcardStudySessionRecord,
  FlashcardStudySessionCardRecord,
  ExamCoverageCourse,
} from "@avana/domain";
import type {
  FlashcardStore,
  FlashcardReviewStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
  StudySessionStore,
  FlashcardStudySessionStore,
  FlashcardRecord,
  QuizRecord,
  QuizQuestionRecord,
} from "./study-store.js";
import type { CourseStore, CourseRecord } from "../courses/course-store.js";
import type { ModuleStore, LessonStore, ProgressStore, LessonRecord, ModuleRecord } from "../learning/learning-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { EntitlementService } from "../commerce/entitlement-service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXAM_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXAM_INTERNAL_ID_REGEX = /^(course|mod|les|quiz|q|doc|chk|user|org|att|attempt)-[0-9a-z_-]+$/i;

function isInternalIdentifier(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const s = val.trim();
  if (s.length === 0) return false;
  if (EXAM_UUID_REGEX.test(s)) return true;
  if (EXAM_INTERNAL_ID_REGEX.test(s)) return true;
  if (s === "course-unassigned" || s === "mod-unassigned") return true;
  return false;
}

/**
 * Truncate/compose attempt topic string so it fits safely within database column limits (max 250 chars)
 * without cutting words abruptly or overflowing PostgreSQL varchar limits.
 */
function buildSafeAttemptTopic(titles: string[], maxLength: number = 250): string {
  if (titles.length === 0) return "آزمون جامع";

  const fittingTitles: string[] = [];
  let currentLen = 0;

  for (const title of titles) {
    const clean = title.trim();
    if (!clean) continue;

    const additionalLen = (fittingTitles.length > 0 ? 2 : 0) + clean.length;
    if (currentLen + additionalLen <= maxLength) {
      fittingTitles.push(clean);
      currentLen += additionalLen;
    } else {
      break;
    }
  }

  if (fittingTitles.length === 0) {
    return titles[0].slice(0, maxLength).trim();
  }

  const remaining = titles.length - fittingTitles.length;
  if (remaining > 0) {
    const suffix = ` (و ${remaining} مبحث دیگر)`;
    if (fittingTitles.join("، ").length + suffix.length <= maxLength) {
      return fittingTitles.join("، ") + suffix;
    }
  }

  return fittingTitles.join("، ");
}

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
    private readonly userFlashcardScheduleStore?: UserFlashcardScheduleStore,
    private readonly courseStore?: CourseStore,
    private readonly systemOrganizationId?: OrganizationId,
    private readonly studySessionStore?: StudySessionStore,
    private readonly flashcardStudySessionStore?: FlashcardStudySessionStore,
    private readonly entitlementService?: EntitlementService,
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
    const isSystemOrg =
      !!this.systemOrganizationId && organizationId === this.systemOrganizationId;
    if (this.organizationStore && !isSystemOrg) {
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

  public getEntitlementService(): EntitlementService | undefined {
    return this.entitlementService;
  }

  /**
   * Get preview flashcards for a course.
   * Prioritizes flashcards from the resolved preview lesson / first module,
   * returning up to limit (default 5) real flashcards without leaking the full deck.
   */
  async getPreviewFlashcards(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    options?: { moduleId?: string; previewLessonId?: string; previewSessionId?: string; limit?: number },
  ): Promise<{
    flashcards: FlashcardRecord[];
    total_count: number;
    is_preview: true;
    preview_lesson_id?: string;
  }> {
    await this.authorizeRead(actor, organizationId);
    const limit = options?.limit ?? (options?.moduleId ? 15 : 5);

    let targetOrgId = organizationId;
    if (this.courseStore) {
      const course = await this.courseStore.findByIdForUser(
        courseId,
        actor.userId,
        this.systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;
    }

    let selectedCards: FlashcardRecord[] = [];
    if (this.entitlementService) {
      selectedCards = await this.entitlementService
        .getPreviewResolver()
        .resolvePreviewFlashcards(courseId, targetOrgId, limit, {
          moduleId: options?.moduleId,
          previewLessonId: options?.previewLessonId,
          previewSessionId: options?.previewSessionId,
        });
    } else {
      const allCards = await this.flashcardStore.listByCourse(courseId, targetOrgId);
      selectedCards = allCards.filter((c) => c.deletedAt === null).slice(0, limit);
    }

    let resolvedPreviewLessonId = options?.previewLessonId;
    if (this.entitlementService && options?.moduleId && !resolvedPreviewLessonId) {
      const canonicalLesson = await this.entitlementService.getPreviewResolver().resolvePreviewLesson(options.moduleId);
      resolvedPreviewLessonId = canonicalLesson?.id;
    } else if (!resolvedPreviewLessonId && selectedCards.length > 0 && selectedCards[0].lessonId) {
      resolvedPreviewLessonId = selectedCards[0].lessonId;
    }

    return {
      flashcards: selectedCards,
      total_count: selectedCards.length,
      is_preview: true,
      preview_lesson_id: resolvedPreviewLessonId,
    };
  }

  // -------------------------------------------------------------------------
  // Flashcards
  // -------------------------------------------------------------------------

  /**
   * List flashcards that are due for review for the current student in a course.
   * Filters by user per-user schedule AND due_at column: only cards reviewed at least once
   * by the user where due_at <= now are returned. Unread cards are never returned.
   * For unentitled users, seamlessly returns the preview flashcards.
   */
  async listFlashcardsForReview(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<FlashcardRecord[]> {
    await this.authorizeRead(actor, organizationId);

    if (this.entitlementService) {
      const access = await this.entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: courseId,
      });
      if (!access.granted) {
        const preview = await this.getPreviewFlashcards(actor, organizationId, courseId);
        return preview.flashcards;
      }
    }

    const [allFlashcards, userSchedules] = await Promise.all([
      this.flashcardStore.listByCourse(courseId, organizationId),
      this.userFlashcardScheduleStore
        ? this.userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
    ]);

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const now = new Date();

    return allFlashcards
      .filter((f) => {
        const schedule = scheduleMap.get(f.id);
        const rawDueAt = schedule ? schedule.dueAt : f.dueAt;
        if (!rawDueAt) return false;
        const dueAt = new Date(rawDueAt);
        return !isNaN(dueAt.getTime()) && dueAt <= now;
      })
      .map((f) => {
        const schedule = scheduleMap.get(f.id);
        if (!schedule) return f;
        return {
          ...f,
          dueAt: schedule.dueAt,
          intervalDays: schedule.intervalDays,
          easeFactor: schedule.easeFactor,
        };
      });
  }

  /**
   * Submit a flashcard review.
   * Persists the review record and advances the per-user scheduling state (due_at, interval_days, ease_factor).
   */
  async submitFlashcardReview(
    actor: Actor,
    organizationId: OrganizationId,
    input: { flashcardId: FlashcardId; rating: FlashcardRating; reactionMs?: number; isExamMode?: boolean },
  ): Promise<void> {
    await this.authorizeFlashcardReview(actor, organizationId);

    if (this.entitlementService) {
      const access = await this.entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "flashcard",
        resourceId: input.flashcardId,
      });
      if (!access.granted) {
        throw new DomainError(
          "forbidden",
          "برای ثبت مرور فلش‌کارت، فعال‌سازی اشتراک یا خرید دوره الزامی است.",
        );
      }
    }

    const flashcard = await this.flashcardStore.findByIdForOrganization(
      input.flashcardId,
      organizationId,
    );
    if (!flashcard) {
      throw new DomainError("not_found", "Flashcard not found");
    }

    const existingSchedule = this.userFlashcardScheduleStore
      ? await this.userFlashcardScheduleStore.getByUserAndCard(actor.userId, input.flashcardId)
      : undefined;

    const previousState = existingSchedule
      ? { intervalDays: existingSchedule.intervalDays, easeFactor: existingSchedule.easeFactor }
      : { intervalDays: flashcard.intervalDays, easeFactor: flashcard.easeFactor };

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

    // Persist updated scheduling state on per-user schedule table (if not in Exam Mode).
    if (!input.isExamMode && this.userFlashcardScheduleStore) {
      await this.userFlashcardScheduleStore.upsertSchedule({
        userId: actor.userId,
        flashcardId: input.flashcardId,
        dueAt: newDueAt,
        intervalDays: nextState.intervalDays,
        easeFactor: nextState.easeFactor,
        lastReviewedAt: now,
        reviewCount: (existingSchedule?.reviewCount ?? 0) + 1,
      });
    }

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

  /**
   * Get an organization-wide summary of flashcard queues, grouped by course.
   */
  async getFlashcardSummary(actor: Actor, organizationId: OrganizationId) {
    await this.authorizeRead(actor, organizationId);

    const [allFlashcards, userSchedules, userReviews] = await Promise.all([
      this.flashcardStore.listByOrganization(organizationId, this.systemOrganizationId),
      this.userFlashcardScheduleStore
        ? this.userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
      this.flashcardReviewStore.listByUser(actor.userId),
    ]);

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const reviewedCardIds = new Set(userReviews.map((r) => r.flashcardId));
    const now = new Date();

    const courseMap = new Map<
      string,
      {
        total: number;
        due: number;
        overdue: number;
        newCards: number;
        learningCards: number;
        topics: Map<
          string,
          { total: number; due: number; overdue: number; newCards: number; learningCards: number }
        >;
      }
    >();

    for (const f of allFlashcards) {
      const courseId = f.courseId;
      // Effective topic key: use documentId if valid, otherwise fallback to cardType or default topic key
      const docId = f.documentId && f.documentId !== "00000000-0000-0000-0000-000000000000"
        ? f.documentId
        : `topic-${f.cardType || "general"}`;

      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, {
          total: 0,
          due: 0,
          overdue: 0,
          newCards: 0,
          learningCards: 0,
          topics: new Map(),
        });
      }
      const courseStats = courseMap.get(courseId)!;
      courseStats.total += 1;

      if (!courseStats.topics.has(docId)) {
        courseStats.topics.set(docId, {
          total: 0,
          due: 0,
          overdue: 0,
          newCards: 0,
          learningCards: 0,
        });
      }

      const topicStats = courseStats.topics.get(docId)!;

      const schedule = scheduleMap.get(f.id);
      const isReviewed = schedule ? true : reviewedCardIds.has(f.id);
      const rawDueAt = schedule ? schedule.dueAt : f.dueAt;
      const intervalDays = schedule ? schedule.intervalDays : f.intervalDays;

      const hasDueAt = rawDueAt != null && !isNaN(new Date(rawDueAt).getTime());
      const dueAt = hasDueAt ? new Date(rawDueAt) : null;
      const isDue = isReviewed && dueAt !== null && dueAt <= now;

      if (!isReviewed) {
        // Unread card: strictly count as newCard, never as due or overdue
        courseStats.newCards += 1;
        if (topicStats) topicStats.newCards += 1;
      } else {
        // Reviewed card
        if (isDue) {
          courseStats.due += 1;
          if (topicStats) topicStats.due += 1;

          // Overdue: due >= 24 hours ago with interval >= 1
          if (intervalDays >= 1 && dueAt !== null && now.getTime() - dueAt.getTime() > 24 * 60 * 60 * 1000) {
            courseStats.overdue += 1;
            if (topicStats) topicStats.overdue += 1;
          }
        } else if (intervalDays === 0) {
          // Learning: reviewed card with interval 0 (e.g. rated 'again')
          courseStats.learningCards += 1;
          if (topicStats) topicStats.learningCards += 1;
        }
      }

      if (topicStats) {
        topicStats.total += 1;
      }
    }

    return { courseMap };
  }

  /**
   * Restrict candidate flashcards across courses to respect entitlements.
   * If a user is not entitled to a course, only the deterministic preview subset (max 5 cards)
   * is allowed for that course.
   */
  private async filterFlashcardsByEntitlement(
    actor: Actor,
    organizationId: OrganizationId,
    flashcards: FlashcardRecord[],
  ): Promise<{
    allowedCards: FlashcardRecord[];
    unentitledCourseIds: Set<CourseId>;
    previewCardIds: Set<string>;
  }> {
    if (!this.entitlementService) {
      return {
        allowedCards: flashcards,
        unentitledCourseIds: new Set(),
        previewCardIds: new Set(),
      };
    }

    const uniqueCourseIds = Array.from(new Set(flashcards.map((f) => f.courseId)));
    if (uniqueCourseIds.length === 0) {
      return {
        allowedCards: flashcards,
        unentitledCourseIds: new Set(),
        previewCardIds: new Set(),
      };
    }

    const unentitledCourseIds = new Set<CourseId>();
    const previewCardIds = new Set<string>();
    const allowedCardIds = new Set<string>();

    await Promise.all(
      uniqueCourseIds.map(async (courseId) => {
        try {
          const access = await this.entitlementService!.checkAccess(actor, {
            userId: actor.userId,
            resourceType: "course",
            resourceId: courseId,
          });

          if (access.granted) {
            for (const card of flashcards) {
              if (card.courseId === courseId) {
                allowedCardIds.add(card.id);
              }
            }
          } else {
            unentitledCourseIds.add(courseId);
            const preview = await this.getPreviewFlashcards(actor, organizationId, courseId, { limit: 5 });
            for (const pCard of preview.flashcards) {
              previewCardIds.add(pCard.id);
              allowedCardIds.add(pCard.id);
            }
          }
        } catch {
          unentitledCourseIds.add(courseId);
        }
      }),
    );

    const allowedCards = flashcards.filter((f) => allowedCardIds.has(f.id));
    return {
      allowedCards,
      unentitledCourseIds,
      previewCardIds,
    };
  }

  /**
   * List flashcards for normal review across multiple courses.
   */
  async listFlashcardsForReviewMulti(
    actor: Actor,
    organizationId: OrganizationId,
    courseIds?: CourseId[],
    documentIds?: string[],
  ): Promise<FlashcardRecord[]> {
    await this.authorizeRead(actor, organizationId);

    const [allFlashcards, userSchedules] = await Promise.all([
      this.flashcardStore.listByOrganization(organizationId, this.systemOrganizationId),
      this.userFlashcardScheduleStore
        ? this.userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
    ]);

    const { allowedCards, unentitledCourseIds, previewCardIds } =
      await this.filterFlashcardsByEntitlement(actor, organizationId, allFlashcards);

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const now = new Date();
    const courseSet = courseIds && courseIds.length > 0 ? new Set(courseIds) : null;
    const docSet = documentIds && documentIds.length > 0 ? new Set(documentIds) : null;

    return allowedCards
      .filter((f) => {
        if (courseSet && !courseSet.has(f.courseId)) return false;
        if (docSet && (!f.documentId || !docSet.has(f.documentId))) return false;
        if (unentitledCourseIds.has(f.courseId)) {
          return previewCardIds.has(f.id);
        }
        const schedule = scheduleMap.get(f.id);
        const rawDueAt = schedule ? schedule.dueAt : f.dueAt;
        if (!rawDueAt) return false;
        const dueAt = new Date(rawDueAt);
        return !isNaN(dueAt.getTime()) && dueAt <= now;
      })
      .map((f) => {
        const schedule = scheduleMap.get(f.id);
        if (!schedule) return f;
        return {
          ...f,
          dueAt: schedule.dueAt,
          intervalDays: schedule.intervalDays,
          easeFactor: schedule.easeFactor,
        };
      });
  }

  /**
   * List flashcards for Exam Mode across multiple courses.
   * Priority: 1. Overdue, 2. Lowest ease factor, 3. Due, 4. New.
   */
  async getExamModeFlashcards(
    actor: Actor,
    organizationId: OrganizationId,
    courseIds?: CourseId[],
    limit: number = 50,
    documentIds?: string[],
  ): Promise<FlashcardRecord[]> {
    await this.authorizeRead(actor, organizationId);

    const [allFlashcards, userSchedules] = await Promise.all([
      this.flashcardStore.listByOrganization(organizationId, this.systemOrganizationId),
      this.userFlashcardScheduleStore
        ? this.userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
    ]);

    const { allowedCards } =
      await this.filterFlashcardsByEntitlement(actor, organizationId, allFlashcards);

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const now = new Date();
    const courseSet = courseIds && courseIds.length > 0 ? new Set(courseIds) : null;
    const docSet = documentIds && documentIds.length > 0 ? new Set(documentIds) : null;

    let filtered = allowedCards.map((f) => {
      const schedule = scheduleMap.get(f.id);
      if (!schedule) return f;
      return {
        ...f,
        dueAt: schedule.dueAt,
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor,
      };
    });

    if (courseSet) {
      filtered = filtered.filter((f) => courseSet.has(f.courseId));
    }
    if (docSet) {
      filtered = filtered.filter((f) => Boolean(f.documentId && docSet.has(f.documentId)));
    }

    // Sorting heuristic for Exam Mode
    filtered.sort((a, b) => {
      const aDue = new Date(a.dueAt) <= now;
      const bDue = new Date(b.dueAt) <= now;
      const aOverdue = aDue && a.intervalDays > 0 && now.getTime() - new Date(a.dueAt).getTime() > 86400000;
      const bOverdue = bDue && b.intervalDays > 0 && now.getTime() - new Date(b.dueAt).getTime() > 86400000;
      const aNew = a.intervalDays === 0;
      const bNew = b.intervalDays === 0;

      // 1. Overdue cards first
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // 2. Sort by ease factor (hardest first)
      if (a.easeFactor !== b.easeFactor) {
        return a.easeFactor - b.easeFactor;
      }

      // 3. Due cards
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;

      // 4. New cards
      if (aNew && !bNew) return -1;
      if (!aNew && bNew) return 1;

      return 0;
    });

    const maxLimit = Math.min(limit, 500);
    return filtered.slice(0, maxLimit);
  }

  /**
   * List flashcards for Custom Study (Filtered queue: weak, forgotten, overdue, review_ahead, new).
   */
  async getCustomStudyFlashcards(
    actor: Actor,
    organizationId: OrganizationId,
    mode: "weak" | "forgotten" | "overdue" | "review_ahead" | "new",
    courseIds?: CourseId[],
    limit: number = 50,
    aheadDays: number = 3,
    documentIds?: string[],
  ): Promise<FlashcardRecord[]> {
    await this.authorizeRead(actor, organizationId);

    const [allFlashcards, userSchedules, userReviews] = await Promise.all([
      this.flashcardStore.listByOrganization(organizationId, this.systemOrganizationId),
      this.userFlashcardScheduleStore
        ? this.userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
      this.flashcardReviewStore.listByUser(actor.userId),
    ]);

    const { allowedCards } =
      await this.filterFlashcardsByEntitlement(actor, organizationId, allFlashcards);

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const reviewedCardIds = new Set(userReviews.map((r) => r.flashcardId));
    const now = new Date();
    const courseSet = courseIds && courseIds.length > 0 ? new Set(courseIds) : null;
    const docSet = documentIds && documentIds.length > 0 ? new Set(documentIds) : null;

    const mapped = allowedCards.map((f) => {
      const schedule = scheduleMap.get(f.id);
      if (!schedule) return f;
      return {
        ...f,
        dueAt: schedule.dueAt,
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor,
      };
    });

    let filtered = mapped.filter(
      (f) =>
        (!courseSet || courseSet.has(f.courseId)) &&
        (!docSet || Boolean(f.documentId && docSet.has(f.documentId))),
    );

    if (mode === "weak" || mode === "forgotten") {
      filtered = filtered.filter((f) => Number(f.easeFactor) < 2.3 || f.intervalDays === 0);
      filtered.sort((a, b) => Number(a.easeFactor) - Number(b.easeFactor));
    } else if (mode === "overdue") {
      filtered = filtered.filter((f) => {
        const isReviewed = this.userFlashcardScheduleStore ? scheduleMap.has(f.id) : reviewedCardIds.has(f.id);
        if (!isReviewed) return false;
        if (!f.dueAt) return false;
        const dueAt = new Date(f.dueAt);
        if (isNaN(dueAt.getTime())) return false;
        return dueAt <= now && f.intervalDays >= 1 && (now.getTime() - dueAt.getTime() > 86400000);
      });
    } else if (mode === "review_ahead") {
      const cutoff = new Date(now.getTime() + aheadDays * 86400000);
      filtered = filtered.filter((f) => {
        const isReviewed = this.userFlashcardScheduleStore ? scheduleMap.has(f.id) : reviewedCardIds.has(f.id);
        if (!isReviewed) return false;
        if (!f.dueAt) return false;
        const dueAt = new Date(f.dueAt);
        if (isNaN(dueAt.getTime())) return false;
        return dueAt <= cutoff;
      });
      filtered.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    } else if (mode === "new") {
      filtered = filtered.filter((f) => {
        const isReviewed = this.userFlashcardScheduleStore ? scheduleMap.has(f.id) : reviewedCardIds.has(f.id);
        return !isReviewed || f.intervalDays === 0;
      });
    }

    const maxLimit = Math.min(limit, 500);
    return filtered.slice(0, maxLimit);
  }

  // -------------------------------------------------------------------------
  // Flashcard Study Sessions (Persistence & Resume)
  // -------------------------------------------------------------------------

  /**
   * Create a new flashcard study session snapshot with exact card ordering.
   */
  async createFlashcardStudySession(
    actor: Actor,
    organizationId: OrganizationId,
    input: {
      courseId?: CourseId;
      courseIds?: CourseId[];
      moduleIds?: string[];
      lessonIds?: string[];
      documentIds?: string[];
      mode?: "daily" | "exam" | "custom" | "normal";
      customMode?: "weak" | "forgotten" | "overdue" | "review_ahead" | "new";
      limit?: number;
      aheadDays?: number;
      title?: string;
    },
  ): Promise<FlashcardStudySessionRecord> {
    await this.authorizeRead(actor, organizationId);
    if (!this.flashcardStudySessionStore) {
      throw new DomainError("bad_request", "Flashcard study session store not configured");
    }

    const mode = input.mode || "daily";
    let cards: FlashcardRecord[] = [];

    // Resolve documentIds from moduleIds if provided and documentIds not explicitly given
    const effectiveDocIds = input.documentIds ? [...input.documentIds] : [];
    if (input.moduleIds && input.moduleIds.length > 0 && this.moduleStore) {
      for (const modId of input.moduleIds) {
        const mod = await this.moduleStore.findById(modId as ModuleId).catch(() => undefined);
        if (mod && mod.documentId) {
          effectiveDocIds.push(mod.documentId);
        }
      }
    }
    const resolvedDocIds = effectiveDocIds.length > 0 ? effectiveDocIds : undefined;

    if (mode === "exam") {
      cards = await this.getExamModeFlashcards(
        actor,
        organizationId,
        input.courseIds,
        input.limit ?? 50,
        resolvedDocIds,
      );
    } else if (mode === "custom" && input.customMode) {
      cards = await this.getCustomStudyFlashcards(
        actor,
        organizationId,
        input.customMode,
        input.courseIds,
        input.limit ?? 50,
        input.aheadDays ?? 3,
        resolvedDocIds,
      );
    } else {
      cards = await this.listFlashcardsForReviewMulti(
        actor,
        organizationId,
        input.courseIds,
        resolvedDocIds,
      );
      // Fallback: If no cards are due by timestamp but user explicitly requested study,
      // return all cards within the selected course/document scope so a session is reliably created
      if (cards.length === 0) {
        const allOrgCards = await this.flashcardStore.listByOrganization(
          organizationId,
          this.systemOrganizationId,
        );
        const courseSet = input.courseIds && input.courseIds.length > 0 ? new Set(input.courseIds) : null;
        const docSet = resolvedDocIds && resolvedDocIds.length > 0 ? new Set(resolvedDocIds) : null;
        cards = allOrgCards.filter((f) => {
          if (courseSet && !courseSet.has(f.courseId)) return false;
          if (docSet && (!f.documentId || !docSet.has(f.documentId))) return false;
          return !f.deletedAt;
        });
      }
    }

    if (cards.length === 0) {
      throw new DomainError("bad_request", "هیچ فلش‌کارتی برای مطالعه یافت نشد");
    }

    // Determine a descriptive Persian title
    let sessionTitle = input.title;
    if (!sessionTitle) {
      if (input.courseIds && input.courseIds.length === 1 && this.courseStore) {
        const course = await this.courseStore.findByIdForUser(
          input.courseIds[0],
          actor.userId,
          this.systemOrganizationId,
        );
        if (course) {
          sessionTitle = `مطالعه ${course.name}`;
        }
      }
      if (!sessionTitle) {
        if (mode === "exam") {
          sessionTitle = "مطالعه مرور آزمون";
        } else if (mode === "custom") {
          const modeLabels: Record<string, string> = {
            weak: "مطالعه کارت‌های ضعیف",
            forgotten: "مطالعه کارت‌های فراموش‌شده",
            overdue: "مطالعه کارت‌های به‌تعویق‌افتاده",
            review_ahead: "مطالعه پیش‌رو",
            new: "مطالعه کارت‌های جدید",
          };
          sessionTitle = modeLabels[input.customMode || ""] || "مطالعه سفارشی";
        } else {
          sessionTitle = "مرور روزانه فلش‌کارت‌ها";
        }
      }
    }

    const now = new Date().toISOString();
    const sessionId = randomUUID();

    const sessionRecord = await this.flashcardStudySessionStore.createSessionWithCards(
      {
        id: sessionId,
        userId: actor.userId,
        organizationId,
        courseId: input.courseId || (input.courseIds && input.courseIds.length === 1 ? input.courseIds[0] : null),
        title: sessionTitle,
        mode,
        customMode: input.customMode ?? null,
        status: "in_progress",
        totalCards: cards.length,
        completedCards: 0,
        currentIndex: 0,
        currentCardId: cards[0]?.id ?? null,
        startedAt: now,
        lastActivityAt: now,
        completedAt: null,
        metadata: {
          courseIds: input.courseIds ?? [],
          moduleIds: input.moduleIds ?? [],
          lessonIds: input.lessonIds ?? [],
          documentIds: input.documentIds ?? [],
          limit: input.limit,
          aheadDays: input.aheadDays,
        },
      },
      cards.map((c, idx) => ({
        flashcardId: c.id,
        sortOrder: idx,
      })),
    );

    return sessionRecord;
  }

  /**
   * List all in-progress flashcard study sessions for the user.
   */
  async listActiveFlashcardStudySessions(
    actor: Actor,
    organizationId: OrganizationId,
  ): Promise<FlashcardStudySessionRecord[]> {
    await this.authorizeRead(actor, organizationId);
    if (!this.flashcardStudySessionStore) {
      return [];
    }

    return this.flashcardStudySessionStore.listActiveByUser(
      actor.userId,
      organizationId,
    );
  }

  /**
   * Get flashcard study session detail including snapshotted card ordering and flashcard resources.
   * Handles deleted flashcards safely.
   */
  async getFlashcardStudySession(
    actor: Actor,
    organizationId: OrganizationId,
    sessionId: string,
  ): Promise<{
    session: FlashcardStudySessionRecord;
    cards: FlashcardRecord[];
    sessionCards: FlashcardStudySessionCardRecord[];
  }> {
    await this.authorizeRead(actor, organizationId);
    if (!this.flashcardStudySessionStore) {
      throw new DomainError("not_found", "Flashcard study session store not configured");
    }

    const session = await this.flashcardStudySessionStore.findById(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw new DomainError("not_found", "مطالعه یافت نشد");
    }

    if (session.userId !== actor.userId) {
      throw new DomainError("forbidden", "دسترسی به این مطالعه مجاز نیست");
    }

    const sessionCards = await this.flashcardStudySessionStore.listSessionCards(sessionId);
    const allOrgCards = await this.flashcardStore.listByOrganization(
      organizationId,
      this.systemOrganizationId,
    );
    const cardMap = new Map(allOrgCards.map((c) => [c.id, c]));

    // Preserve the snapshotted sortOrder and skip deleted cards safely
    const orderedCards: FlashcardRecord[] = [];
    for (const sc of sessionCards) {
      if (sc.flashcardId) {
        const found = cardMap.get(sc.flashcardId as FlashcardId);
        if (found && !found.deletedAt) {
          orderedCards.push(found);
        }
      }
    }

    return {
      session,
      cards: orderedCards,
      sessionCards,
    };
  }

  /**
   * Update flashcard study session progress atomically.
   */
  async updateFlashcardStudySessionProgress(
    actor: Actor,
    organizationId: OrganizationId,
    sessionId: string,
    data: {
      currentIndex: number;
      completedCards?: number;
      currentCardId?: string;
      cardId?: string;
      rating?: FlashcardRating;
      reactionMs?: number;
    },
  ): Promise<FlashcardStudySessionRecord> {
    await this.authorizeFlashcardReview(actor, organizationId);
    if (!this.flashcardStudySessionStore) {
      throw new DomainError("bad_request", "Flashcard study session store not configured");
    }

    const session = await this.flashcardStudySessionStore.findById(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw new DomainError("not_found", "مطالعه یافت نشد");
    }

    if (session.userId !== actor.userId) {
      throw new DomainError("forbidden", "دسترسی به این مطالعه مجاز نیست");
    }

    if (session.status !== "in_progress") {
      return session;
    }

    const now = new Date().toISOString();
    let completedCards = data.completedCards ?? session.completedCards;
    if (data.cardId && data.completedCards === undefined) {
      completedCards = Math.min(session.totalCards, completedCards + 1);
    }

    const cardUpdate = data.cardId
      ? {
          flashcardId: data.cardId,
          status: "reviewed" as const,
          rating: data.rating ?? null,
          reactionMs: data.reactionMs ?? null,
          reviewedAt: now,
        }
      : undefined;

    const updated = await this.flashcardStudySessionStore.updateProgress(sessionId, {
      currentIndex: data.currentIndex,
      completedCards,
      currentCardId: data.currentCardId ?? null,
      lastActivityAt: now,
      cardUpdate,
    });

    if (!updated) {
      throw new DomainError("not_found", "مطالعه یافت نشد");
    }

    // If reached end, auto-mark completed
    if (updated.currentIndex >= updated.totalCards || updated.completedCards >= updated.totalCards) {
      const completed = await this.flashcardStudySessionStore.updateStatus(
        sessionId,
        "completed",
        now,
        now,
      );
      return completed || updated;
    }

    return updated;
  }

  /**
   * Explicitly mark a study session as completed.
   */
  async completeFlashcardStudySession(
    actor: Actor,
    organizationId: OrganizationId,
    sessionId: string,
  ): Promise<FlashcardStudySessionRecord> {
    await this.authorizeFlashcardReview(actor, organizationId);
    if (!this.flashcardStudySessionStore) {
      throw new DomainError("bad_request", "Flashcard study session store not configured");
    }

    const session = await this.flashcardStudySessionStore.findById(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw new DomainError("not_found", "مطالعه یافت نشد");
    }

    if (session.userId !== actor.userId) {
      throw new DomainError("forbidden", "دسترسی به این مطالعه مجاز نیست");
    }

    const now = new Date().toISOString();
    const updated = await this.flashcardStudySessionStore.updateStatus(
      sessionId,
      "completed",
      now,
      now,
    );

    if (!updated) {
      throw new DomainError("not_found", "مطالعه یافت نشد");
    }

    return updated;
  }

  /**
   * Cancel/abandon a study session (sets status = cancelled, soft delete only).
   */
  async cancelFlashcardStudySession(
    actor: Actor,
    organizationId: OrganizationId,
    sessionId: string,
  ): Promise<FlashcardStudySessionRecord> {
    await this.authorizeFlashcardReview(actor, organizationId);
    if (!this.flashcardStudySessionStore) {
      throw new DomainError("bad_request", "Flashcard study session store not configured");
    }

    const session = await this.flashcardStudySessionStore.findById(sessionId);
    if (!session || session.organizationId !== organizationId) {
      throw new DomainError("not_found", "مطالعه یافت نشد");
    }

    if (session.userId !== actor.userId) {
      throw new DomainError("forbidden", "دسترسی به این مطالعه مجاز نیست");
    }

    const now = new Date().toISOString();
    const updated = await this.flashcardStudySessionStore.updateStatus(
      sessionId,
      "cancelled",
      null,
      now,
    );

    if (!updated) {
      throw new DomainError("not_found", "مطالعه یافت نشد");
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // Quizzes
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Quizzes & Exam Configuration
  // -------------------------------------------------------------------------

  /** List published quizzes for a course. */
  async listQuizzes(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<QuizRecord[]> {
    await this.authorizeRead(actor, organizationId);
    let targetOrgId = organizationId;
    if (this.courseStore) {
      const course = await this.courseStore.findByIdForUser(
        courseId,
        actor.userId,
        this.systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;
    }
    const quizzes = await this.quizStore.listByCourse(courseId, targetOrgId);
    return quizzes.filter((q) => q.status === "published");
  }

  /**
   * Get preview quiz for a course.
   * Returns a published quiz with at most limit (default 5) real questions
   * prioritizing questions from the preview lesson, with secret answer keys stripped.
   */
  async getPreviewQuiz(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    options?: { quizId?: QuizId; moduleId?: string; previewLessonId?: string; previewSessionId?: string; limit?: number },
  ): Promise<{
    quiz: (QuizRecord & {
      questions: Array<Omit<QuizQuestionRecord, "correctAnswer" | "explanation">>;
    }) | null;
    total_questions: number;
    is_preview: true;
    preview_lesson_id?: string;
  }> {
    await this.authorizeRead(actor, organizationId);
    const limit = options?.limit ?? 5;

    let targetOrgId = organizationId;
    if (this.courseStore) {
      const course = await this.courseStore.findByIdForUser(
        courseId,
        actor.userId,
        this.systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;
    }

    const quizzes = await this.quizStore.listByCourse(courseId, targetOrgId);
    const publishedQuizzes = quizzes.filter((q) => q.status === "published");
    if (publishedQuizzes.length === 0) {
      return {
        quiz: null,
        total_questions: 0,
        is_preview: true,
      };
    }

    const selectedQuiz = options?.quizId
      ? (publishedQuizzes.find((q) => q.id === options.quizId) ?? publishedQuizzes[0])
      : publishedQuizzes[0];

    const allQuestions = await this.quizQuestionStore.listByQuiz(selectedQuiz.id);

    // Resolve allowed lessons for the module or previewLessonId
    let previewLessonId = options?.previewLessonId;

    if (options?.moduleId && this.entitlementService) {
      const canonicalPreview = await this.entitlementService
        .getPreviewResolver()
        .resolvePreviewLesson(options.moduleId);
      // Security: canonical preview lesson of this module always takes precedence
      previewLessonId = canonicalPreview?.id;
    } else if (options?.moduleId && this.lessonStore && !previewLessonId) {
      const modLessons = await this.lessonStore.listByModule(options.moduleId as ModuleId);
      const activeLessons = modLessons.filter(
        (l) => l.deletedAt === null && (!l.publicationStatus || l.publicationStatus === "published"),
      );
      if (activeLessons.length > 0) {
        previewLessonId = activeLessons[0].id;
      }
    }

    if (!previewLessonId && !options?.moduleId && this.entitlementService && this.moduleStore && this.lessonStore) {
      const modules = await this.moduleStore.listByCourse(courseId);
      const activeModules = modules.filter((m) => m.deletedAt === null).sort((a, b) => a.sortOrder - b.sortOrder);
      const allLessons = await this.lessonStore.listByModules(activeModules.map((m) => m.id));
      const activeLessons = allLessons.filter(
        (l) => l.deletedAt === null && l.publicationStatus === "published",
      ).sort((a, b) => a.sortOrder - b.sortOrder);
      previewLessonId = (await this.entitlementService.resolveCoursePreviewLessonId(courseId, activeLessons)) ?? undefined;
    }

    // Filter questions: strictly from the canonical preview lesson when scoped to module
    let eligibleQuestions: QuizQuestionRecord[] = [];
    if (options?.moduleId) {
      if (previewLessonId) {
        eligibleQuestions = allQuestions.filter((q) => q.lessonId === previewLessonId);
      }
    } else {
      if (previewLessonId) {
        const matchingQuestions = allQuestions.filter((q) => q.lessonId === previewLessonId);
        const otherQuestions = allQuestions.filter((q) => q.lessonId !== previewLessonId);
        eligibleQuestions = [...matchingQuestions, ...otherQuestions];
      } else {
        eligibleQuestions = allQuestions;
      }
    }

    // Shuffle deterministically
    const seed = `${options?.previewSessionId || options?.moduleId || previewLessonId || selectedQuiz.id}:quiz`;
    const shuffled = seededRandomShuffle(eligibleQuestions, seed);
    const selectedQuestions = shuffled.slice(0, Math.min(limit, eligibleQuestions.length));

    // Strip correctAnswer prior to submission
    const sanitized = selectedQuestions.map(
      ({ correctAnswer: _ca, explanation: _exp, ...q }) => q,
    );

    return {
      quiz: {
        ...selectedQuiz,
        questions: sanitized,
      },
      total_questions: eligibleQuestions.length,
      is_preview: true,
      preview_lesson_id: previewLessonId,
    };
  }

  /** Get a published quiz with its questions for attempt. Supports preview mode for prospective students. */
  async getQuizForAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    quizId: QuizId,
    options?: { moduleId?: string; previewSessionId?: string },
  ): Promise<
    QuizRecord & {
      questions: Array<Omit<QuizQuestionRecord, "correctAnswer" | "explanation">>;
      is_preview?: boolean;
    }
  > {
    await this.authorizeRead(actor, organizationId);
    const quiz = await this.quizStore.findByIdForOrganization(
      quizId,
      organizationId,
      this.systemOrganizationId,
    );
    if (!quiz) throw new DomainError("not_found", "Quiz not found");
    if (quiz.status !== "published") throw new DomainError("not_found", "Quiz not found");

    let access: ResourceAccessResult | undefined;
    if (this.entitlementService) {
      access = await this.entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "quiz",
        resourceId: quizId,
        courseId: quiz.courseId ?? undefined,
        moduleId: (options?.moduleId as ModuleId) ?? undefined,
        previewSessionId: options?.previewSessionId,
      });
      if (!access.granted) {
        throw new DomainError(
          "forbidden",
          "برای دسترسی به این آزمون، ابتدا باید دوره یا اشتراک را خریداری کنید.",
        );
      }
    }

    if (this.courseStore && quiz.courseId) {
      const course = await this.courseStore.findByIdForUser(
        quiz.courseId,
        actor.userId,
        this.systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Quiz not found");
      }
    }

    let questions = await this.quizQuestionStore.listByQuiz(quizId);
    if (access?.reason === "free_preview") {
      try {
        const preview = await this.getPreviewQuiz(
          actor,
          organizationId,
          (quiz.courseId ?? (quiz as any).course_id) as CourseId,
          {
            quizId,
            moduleId: options?.moduleId,
            previewSessionId: options?.previewSessionId,
            limit: 5,
          },
        );
        if (preview.quiz && preview.quiz.questions.length > 0) {
          const previewIds = new Set(preview.quiz.questions.map((q) => q.id));
          questions = questions.filter((q) => previewIds.has(q.id));
        } else {
          questions = questions.slice(0, 5);
        }
      } catch {
        questions = questions.slice(0, 5);
      }
    }
    // Security: strip correctAnswer and explanation from questions response prior to submission
    const sanitized = questions.map(
      ({ correctAnswer: _correctAnswer, explanation: _explanation, ...q }) => q,
    );
    return { ...quiz, questions: sanitized, is_preview: access?.reason === "free_preview" };
  }
  /**
   * Get dynamic topic & section/chapter hierarchy summary with question counts from DB.
   * Reads real Learning Core hierarchy (Course -> Module [Section] -> Lesson [Chapter]) from DB.
   * Aggregates question counts per Section -> Chapter -> Difficulty dynamically from DB.
   */
  async getExamTopicSummary(actor: Actor, organizationId: OrganizationId) {
    await this.authorizeRead(actor, organizationId);

    const [coursesInfo, allQuestions, allQuizzes] = await Promise.all([
      this.courseStore
        ? this.courseStore.listByOrganization(organizationId, actor.userId, this.systemOrganizationId)
        : Promise.resolve([]),
      this.quizQuestionStore.listByFilter({
        organizationId,
        systemOrganizationId: this.systemOrganizationId,
      }),
      this.quizStore
        ? this.quizStore.listByOrganization(organizationId, this.systemOrganizationId)
        : Promise.resolve([]),
    ]);

    const quizMap = new Map(allQuizzes.map((q) => [q.id, q]));
    const allProcessedQuestionIds = new Set<string>();

    type LessonSummary = {
      lessonId: string;
      lessonTitle: string;
      questionCount: number;
      easyCount: number;
      mediumCount: number;
      hardCount: number;
    };

    type ModuleSummary = {
      moduleId: string;
      moduleTitle: string;
      questionCount: number;
      easyCount: number;
      mediumCount: number;
      hardCount: number;
      lessons: LessonSummary[];
    };

    type CourseSummary = {
      courseId: string;
      courseTitle: string;
      questionCount: number;
      easyCount: number;
      mediumCount: number;
      hardCount: number;
      modules: ModuleSummary[];
    };

    const coursesResult: CourseSummary[] = [];
    const legacySections: Array<{
      id: string;
      title: string;
      topic: string;
      questionCount: number;
      easyCount: number;
      mediumCount: number;
      hardCount: number;
      chapters: Array<{
        id: string;
        title: string;
        topic: string;
        questionCount: number;
        easyCount: number;
        mediumCount: number;
        hardCount: number;
      }>;
    }> = [];

    for (const c of coursesInfo) {
      const courseModules = this.moduleStore
        ? await this.moduleStore.listByCourse(c.id as CourseId)
        : [];
      const moduleIds = courseModules.map((m) => m.id);
      const courseLessons = this.lessonStore
        ? await this.lessonStore.listByModules(moduleIds)
        : [];

      // Map documentId to authoritative Module for this course
      const docToModuleMap = new Map<string, ModuleRecord>();
      for (const m of courseModules) {
        if (m.documentId) {
          docToModuleMap.set(m.documentId, m);
        }
      }

      const lessonMap = new Map<string, LessonSummary>();
      for (const les of courseLessons) {
        lessonMap.set(les.id, {
          lessonId: les.id,
          lessonTitle: les.title,
          questionCount: 0,
          easyCount: 0,
          mediumCount: 0,
          hardCount: 0,
        });
      }

      // Track unmapped questions (lessonId = null) per module
      const unmappedModuleCounts = new Map<
        string,
        { total: number; easy: number; med: number; hard: number }
      >();
      for (const m of courseModules) {
        unmappedModuleCounts.set(m.id, { total: 0, easy: 0, med: 0, hard: 0 });
      }

      for (const q of allQuestions) {
        if (allProcessedQuestionIds.has(q.id)) continue;

        // Path A: Question -> lessonId -> Lesson -> Module
        let matchedLessonId: string | null = q.lessonId ?? null;
        if (!matchedLessonId && q.topic) {
          const found = courseLessons.find((l) => l.title === q.topic);
          if (found) matchedLessonId = found.id;
        }

        if (matchedLessonId && lessonMap.has(matchedLessonId)) {
          allProcessedQuestionIds.add(q.id);
          const lSummary = lessonMap.get(matchedLessonId)!;
          lSummary.questionCount += 1;
          const diff = (q.difficulty || "medium").toLowerCase();
          if (diff === "easy" || diff === "آسان") lSummary.easyCount += 1;
          else if (diff === "hard" || diff === "سخت") lSummary.hardCount += 1;
          else lSummary.mediumCount += 1;
          continue;
        }

        // Path B: Question -> Quiz -> Document -> Authoritative Module (when lessonId is null)
        const parentQuiz = quizMap.get(q.quizId);
        if (parentQuiz && parentQuiz.documentId) {
          const targetModule = docToModuleMap.get(parentQuiz.documentId);
          if (targetModule && unmappedModuleCounts.has(targetModule.id)) {
            allProcessedQuestionIds.add(q.id);
            const mObj = unmappedModuleCounts.get(targetModule.id)!;
            mObj.total += 1;
            const diff = (q.difficulty || "medium").toLowerCase();
            if (diff === "easy" || diff === "آسان") mObj.easy += 1;
            else if (diff === "hard" || diff === "سخت") mObj.hard += 1;
          }
        }

        // Path C: Questions belonging to Course c without explicit lesson/document module mapping
        if (parentQuiz && parentQuiz.courseId === c.id) {
          allProcessedQuestionIds.add(q.id);
          const tName = q.topic || c.name;
          let mObj = unmappedModuleCounts.get(`course-topic-${tName}`);
          if (!mObj) {
            mObj = { total: 0, easy: 0, med: 0, hard: 0 };
            unmappedModuleCounts.set(`course-topic-${tName}`, mObj);
          }
          mObj.total += 1;
          const diff = (q.difficulty || "medium").toLowerCase();
          if (diff === "easy" || diff === "آسان") mObj.easy += 1;
          else if (diff === "hard" || diff === "سخت") mObj.hard += 1;
          else mObj.med += 1;
        }
      }

      const modulesResult: ModuleSummary[] = courseModules.map((m) => {
        const modLessons = courseLessons
          .filter((l) => l.moduleId === m.id)
          .map((l) => lessonMap.get(l.id)!);

        const unmapped = unmappedModuleCounts.get(m.id) ?? {
          total: 0,
          easy: 0,
          med: 0,
          hard: 0,
        };

        let mQ = unmapped.total;
        let mEasy = unmapped.easy;
        let mMed = unmapped.med;
        let mHard = unmapped.hard;

        for (const l of modLessons) {
          mQ += l.questionCount;
          mEasy += l.easyCount;
          mMed += l.mediumCount;
          mHard += l.hardCount;
        }

        return {
          moduleId: m.id,
          moduleTitle: m.title,
          questionCount: mQ,
          easyCount: mEasy,
          mediumCount: mMed,
          hardCount: mHard,
          lessons: modLessons,
        };
      });

      // Add modules derived from unmapped course-level topics
      for (const [key, val] of unmappedModuleCounts.entries()) {
        if (key.startsWith("course-topic-") && val.total > 0) {
          const topicName = key.replace("course-topic-", "");
          modulesResult.push({
            moduleId: `mod-${c.id}-${topicName}`,
            moduleTitle: topicName,
            questionCount: val.total,
            easyCount: val.easy,
            mediumCount: val.med,
            hardCount: val.hard,
            lessons: [
              {
                lessonId: `lesson-${c.id}-${topicName}`,
                lessonTitle: topicName,
                questionCount: val.total,
                easyCount: val.easy,
                mediumCount: val.med,
                hardCount: val.hard,
              },
            ],
          });
        }
      }

      const filteredModules: ModuleSummary[] = modulesResult.filter((m) => m.questionCount > 0);

      let cQ = 0, cEasy = 0, cMed = 0, cHard = 0;
      for (const m of filteredModules) {
        cQ += m.questionCount;
        cEasy += m.easyCount;
        cMed += m.mediumCount;
        cHard += m.hardCount;

        legacySections.push({
          id: m.moduleId,
          title: m.moduleTitle,
          topic: m.moduleTitle,
          questionCount: m.questionCount,
          easyCount: m.easyCount,
          mediumCount: m.mediumCount,
          hardCount: m.hardCount,
          chapters: m.lessons.map((l) => ({
            id: l.lessonId,
            title: l.lessonTitle,
            topic: l.lessonTitle,
            questionCount: l.questionCount,
            easyCount: l.easyCount,
            mediumCount: l.mediumCount,
            hardCount: l.hardCount,
          })),
        });
      }

      if (cQ > 0 && filteredModules.length > 0) {
        coursesResult.push({
          courseId: c.id,
          courseTitle: c.name,
          questionCount: cQ,
          easyCount: cEasy,
          mediumCount: cMed,
          hardCount: cHard,
          modules: filteredModules,
        });
      }
    }

    // Fallback for questions unassigned to any course/module: group by actual topic title (never placeholder titles)
    const unassignedQuestions = allQuestions.filter(
      (q) => !allProcessedQuestionIds.has(q.id),
    );
    if (unassignedQuestions.length > 0) {
      const topicGroupMap = new Map<
        string,
        { title: string; count: number; easy: number; med: number; hard: number }
      >();
      for (const q of unassignedQuestions) {
        const tName = q.topic || "مباحث آموزشی";
        if (!topicGroupMap.has(tName)) {
          topicGroupMap.set(tName, { title: tName, count: 0, easy: 0, med: 0, hard: 0 });
        }
        const tObj = topicGroupMap.get(tName)!;
        tObj.count += 1;
        const diff = (q.difficulty || "medium").toLowerCase();
        if (diff === "easy" || diff === "آسان") tObj.easy += 1;
        else if (diff === "hard" || diff === "سخت") tObj.hard += 1;
        else tObj.med += 1;
      }

      for (const [tName, tObj] of topicGroupMap.entries()) {
        const modId = `mod-top-${tName}`;
        const lesId = `lesson-top-${tName}`;
        const orphanModule: ModuleSummary = {
          moduleId: modId,
          moduleTitle: tName,
          questionCount: tObj.count,
          easyCount: tObj.easy,
          mediumCount: tObj.med,
          hardCount: tObj.hard,
          lessons: [
            {
              lessonId: lesId,
              lessonTitle: tName,
              questionCount: tObj.count,
              easyCount: tObj.easy,
              mediumCount: tObj.med,
              hardCount: tObj.hard,
            },
          ],
        };

        coursesResult.push({
          courseId: `course-top-${tName}`,
          courseTitle: tName,
          questionCount: tObj.count,
          easyCount: tObj.easy,
          mediumCount: tObj.med,
          hardCount: tObj.hard,
          modules: [orphanModule],
        });

        legacySections.push({
          id: modId,
          title: tName,
          topic: tName,
          questionCount: tObj.count,
          easyCount: tObj.easy,
          mediumCount: tObj.med,
          hardCount: tObj.hard,
          chapters: [
            {
              id: lesId,
              title: tName,
              topic: tName,
              questionCount: tObj.count,
              easyCount: tObj.easy,
              mediumCount: tObj.med,
              hardCount: tObj.hard,
            },
          ],
        });
      }
    }

    const topicsFlatList: Array<{
      topic: string;
      title: string;
      questionCount: number;
      easyCount: number;
      mediumCount: number;
      hardCount: number;
    }> = [];

    for (const s of legacySections) {
      for (const ch of s.chapters) {
        topicsFlatList.push({
          topic: ch.topic,
          title: ch.title,
          questionCount: ch.questionCount,
          easyCount: ch.easyCount,
          mediumCount: ch.mediumCount,
          hardCount: ch.hardCount,
        });
      }
    }

    return {
      courses: coursesResult,
      sections: legacySections,
      topics: topicsFlatList,
    };
  }

  /**
   * Resolve hierarchical Course -> Module coverage from selected exam questions.
   * Derives exact courses and modules from question provenance (lessonId, quizId, documentId).
   * Ensures only courses and modules with questionCount >= 1 are included.
   * Strictly suppresses any Lesson IDs, Lesson titles, or internal UUIDs from display titles.
   */
  async resolveExamCoverage(
    questions: QuizQuestionRecord[],
    organizationId?: OrganizationId,
  ): Promise<ExamCoverageCourse[]> {
    if (!questions || questions.length === 0) {
      return [];
    }

    const quizIds = Array.from(new Set(questions.map((q) => q.quizId).filter(Boolean)));
    const lessonIds = Array.from(
      new Set(questions.map((q) => q.lessonId).filter(Boolean)),
    ) as LessonId[];

    const allQuizzes =
      this.quizStore && organizationId
        ? await this.quizStore.listByOrganization(organizationId, this.systemOrganizationId).catch(() => [])
        : [];
    const quizMap = new Map(allQuizzes.map((q) => [q.id, q]));

    for (const qzId of quizIds) {
      if (!quizMap.has(qzId) && this.quizStore) {
        const qz = await this.quizStore
          .findByIdForOrganization(qzId, organizationId, this.systemOrganizationId)
          .catch(() => undefined);
        if (qz) quizMap.set(qz.id, qz);
      }
    }

    const lessonMap = new Map<string, LessonRecord>();
    const moduleIds = new Set<ModuleId>();

    for (const lesId of lessonIds) {
      if (this.lessonStore) {
        const les = await this.lessonStore.findById(lesId).catch(() => undefined);
        if (les) {
          lessonMap.set(les.id, les);
          if (les.moduleId) moduleIds.add(les.moduleId as ModuleId);
        }
      }
    }

    for (const qz of quizMap.values()) {
      if (qz.documentId && this.moduleStore) {
        const mod = await this.moduleStore.findByDocument(qz.documentId).catch(() => undefined);
        if (mod) moduleIds.add(mod.id);
      }
    }

    const moduleMap = new Map<string, ModuleRecord>();
    const courseIds = new Set<CourseId>();

    for (const modId of moduleIds) {
      if (this.moduleStore) {
        const mod = await this.moduleStore.findById(modId).catch(() => undefined);
        if (mod) {
          moduleMap.set(mod.id, mod);
          if (mod.courseId) courseIds.add(mod.courseId as CourseId);
        }
      }
    }

    for (const qz of quizMap.values()) {
      if (qz.courseId) {
        courseIds.add(qz.courseId as CourseId);
      }
    }

    const courseMap = new Map<string, CourseRecord>();
    for (const cId of courseIds) {
      if (this.courseStore) {
        const course = await this.courseStore.findById(cId).catch(() => undefined);
        if (course) {
          courseMap.set(course.id, course);
        }
      }
    }

    type ResolvedModuleEntry = {
      id: string;
      title: string;
      sortOrder: number;
      questionCount: number;
    };
    type ResolvedCourseEntry = {
      id: string;
      title: string;
      sortOrder: number;
      questionCount: number;
      modules: Map<string, ResolvedModuleEntry>;
    };

    const courseEntries = new Map<string, ResolvedCourseEntry>();

    for (const q of questions) {
      let resolvedModule: ModuleRecord | undefined;
      let resolvedCourse: CourseRecord | undefined;

      if (q.lessonId && lessonMap.has(q.lessonId)) {
        const les = lessonMap.get(q.lessonId)!;
        if (les.moduleId && moduleMap.has(les.moduleId)) {
          resolvedModule = moduleMap.get(les.moduleId);
        }
      }

      const parentQuiz = quizMap.get(q.quizId);

      if (!resolvedModule && parentQuiz?.documentId) {
        for (const m of moduleMap.values()) {
          if (m.documentId === parentQuiz.documentId) {
            resolvedModule = m;
            break;
          }
        }
      }

      if (resolvedModule?.courseId && courseMap.has(resolvedModule.courseId)) {
        resolvedCourse = courseMap.get(resolvedModule.courseId);
      } else if (parentQuiz?.courseId && courseMap.has(parentQuiz.courseId)) {
        resolvedCourse = courseMap.get(parentQuiz.courseId);
      }

      if (resolvedCourse && !resolvedModule && this.moduleStore) {
        const cModules = await this.moduleStore.listByCourse(resolvedCourse.id as CourseId).catch(() => []);
        if (q.topic) {
          resolvedModule = cModules.find((m) => m.title === q.topic);
        }
        if (!resolvedModule && cModules.length > 0) {
          resolvedModule = cModules[0];
        }
      }

      const rawCourseTitle = (resolvedCourse as { title?: string })?.title || resolvedCourse?.name || parentQuiz?.topic || "آزمون جامع";
      const courseTitle = isInternalIdentifier(rawCourseTitle) ? "آزمون جامع" : rawCourseTitle;
      const courseId = resolvedCourse?.id || "course-default";

      let rawModuleTitle = resolvedModule?.title;
      if (!rawModuleTitle && q.topic && !isInternalIdentifier(q.topic) && !q.topic.includes("جلسه")) {
        rawModuleTitle = q.topic;
      }
      if (!rawModuleTitle) {
        rawModuleTitle = "مباحث آزمون";
      }
      const moduleTitle = isInternalIdentifier(rawModuleTitle) ? "مباحث آزمون" : rawModuleTitle;
      const moduleId = resolvedModule?.id || `mod-${moduleTitle}`;

      if (!courseEntries.has(courseId)) {
        courseEntries.set(courseId, {
          id: courseId,
          title: courseTitle,
          sortOrder: courseEntries.size,
          questionCount: 0,
          modules: new Map(),
        });
      }

      const cEntry = courseEntries.get(courseId)!;
      cEntry.questionCount += 1;

      if (!cEntry.modules.has(moduleId)) {
        cEntry.modules.set(moduleId, {
          id: moduleId,
          title: moduleTitle,
          sortOrder: resolvedModule?.sortOrder ?? cEntry.modules.size,
          questionCount: 0,
        });
      }

      const mEntry = cEntry.modules.get(moduleId)!;
      mEntry.questionCount += 1;
    }

    const result: ExamCoverageCourse[] = Array.from(courseEntries.values())
      .filter((c) => c.questionCount > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      .map((c) => ({
        id: c.id,
        title: c.title,
        questionCount: c.questionCount,
        modules: Array.from(c.modules.values())
          .filter((m) => m.questionCount > 0)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
          .map((m) => ({
            id: m.id,
            title: m.title,
            questionCount: m.questionCount,
          })),
      }));

    return result;
  }

  /**
   * Start a custom-configured exam attempt.
   * Resolves selected Module/Lesson IDs and topics, filters Questions by difficulty,
   * validates available count, and persists the snapshot to DB.
   */
  async startConfiguredExamAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    input: {
      sections?: string[];
      chapters?: string[];
      topics?: string[];
      questionCount?: number;
      difficulty?: string;
    },
  ) {
    await this.authorizeQuizAttempt(actor, organizationId);

    const requestedCount = input.questionCount ?? 10;
    const difficulty = input.difficulty ?? "medium";

    const rawSelection = [
      ...(input.chapters ?? []),
      ...(input.sections ?? []),
      ...(input.topics ?? []),
    ].filter(Boolean);

    // 1. Internal selection primitives for query, filtering, and database lookup
    const selectedLessonIds = new Set<string>();
    const selectedDocumentIds = new Set<string>();
    const selectedModuleIds = new Set<string>();
    const selectedCourseIds = new Set<string>();

    // 2. Candidate keywords/topics for question matching
    const freeTextTopics = new Set<string>();
    const matchTopics = new Set<string>();

    // 3. Clean, human-readable display titles for UI/attempt presentation (preserving order)
    const displayTitles = new Set<string>();

    for (const rawItem of rawSelection) {
      const item = typeof rawItem === "string" ? rawItem.trim() : String(rawItem).trim();
      if (!item) continue;
      const isId = isInternalIdentifier(item);

      // A. Try resolving as Lesson
      if (this.lessonStore) {
        const lesson = await this.lessonStore.findById(item as LessonId).catch(() => undefined);
        if (lesson) {
          selectedLessonIds.add(lesson.id);
          matchTopics.add(lesson.title);
          if (lesson.title && !isInternalIdentifier(lesson.title)) {
            displayTitles.add(lesson.title);
          }
          continue;
        }
      }

      // B. Try resolving as Module
      if (this.moduleStore) {
        const mod = await this.moduleStore.findById(item as ModuleId).catch(() => undefined);
        if (mod) {
          selectedModuleIds.add(mod.id);
          if (mod.documentId) {
            selectedDocumentIds.add(mod.documentId);
          }
          matchTopics.add(mod.title);
          if (mod.title && !isInternalIdentifier(mod.title)) {
            displayTitles.add(mod.title);
          }
          if (this.lessonStore) {
            const lessons = await this.lessonStore.listByModule(mod.id).catch(() => []);
            for (const l of lessons) {
              selectedLessonIds.add(l.id);
              matchTopics.add(l.title);
            }
          }
          continue;
        }
      }

      // C. Try resolving as Course
      if (this.courseStore) {
        const course =
          (await this.courseStore.findById(item as CourseId).catch(() => undefined)) ||
          (await this.courseStore.findByIdForUser(item as CourseId, actor.userId, this.systemOrganizationId).catch(() => undefined));
        if (course) {
          selectedCourseIds.add(course.id);
          const courseTitle = (course as { title?: string }).title || course.name;
          if (courseTitle) {
            matchTopics.add(courseTitle);
            if (!isInternalIdentifier(courseTitle)) {
              displayTitles.add(courseTitle);
            }
          }
          // Expand course modules and lessons for question selection
          if (this.moduleStore) {
            const courseModules = await this.moduleStore.listByCourse(course.id).catch(() => []);
            for (const mod of courseModules) {
              selectedModuleIds.add(mod.id);
              if (mod.documentId) {
                selectedDocumentIds.add(mod.documentId);
              }
              matchTopics.add(mod.title);
              if (this.lessonStore) {
                const lessons = await this.lessonStore.listByModule(mod.id).catch(() => []);
                for (const l of lessons) {
                  selectedLessonIds.add(l.id);
                  matchTopics.add(l.title);
                }
              }
            }
          }
          continue;
        }
      }

      // D. If not resolved as an entity in database:
      // If it is NOT an internal ID/UUID, it is a human-readable topic name passed directly (e.g. "Pharmacology")
      if (!isId) {
        freeTextTopics.add(item);
        matchTopics.add(item);
        displayTitles.add(item);
      }
    }

    // Fetch candidate questions from DB
    const allQuestions = await this.quizQuestionStore.listByFilter({
      organizationId,
      systemOrganizationId: this.systemOrganizationId,
      difficulty: "all",
    });

    const allQuizzes = this.quizStore
      ? await this.quizStore.listByOrganization(organizationId, this.systemOrganizationId)
      : [];
    const quizMap = new Map(allQuizzes.map((q) => [q.id, q]));

    const hasHierarchySelection =
      selectedLessonIds.size > 0 ||
      selectedModuleIds.size > 0 ||
      selectedCourseIds.size > 0 ||
      selectedDocumentIds.size > 0;

    const matchesSelection = (q: QuizQuestionRecord): boolean => {
      // If no selection criteria were specified at all, all questions are candidates
      if (rawSelection.length === 0) return true;

      const parentQuiz = quizMap.get(q.quizId);

      // 1. If explicit hierarchy entities (Lessons, Modules, Courses, Documents) were selected:
      if (hasHierarchySelection) {
        // If question is explicitly assigned to a lesson:
        if (q.lessonId) {
          if (selectedLessonIds.has(q.lessonId)) return true;
          // If the question's lesson is NOT in selectedLessonIds, check if free-text topic matches
          if (freeTextTopics.size > 0 && q.topic) {
            if (freeTextTopics.has(q.topic)) return true;
            for (const ft of freeTextTopics) {
              if (ft.length >= 3 && (q.topic.includes(ft) || ft.includes(q.topic))) return true;
            }
          }
          return false;
        }

        // If question is NOT assigned to a lesson (e.g. quiz-level question without lessonId):
        if (parentQuiz) {
          if (parentQuiz.courseId && selectedCourseIds.has(parentQuiz.courseId)) return true;
          if (parentQuiz.documentId && selectedDocumentIds.has(parentQuiz.documentId)) return true;
        }

        if (q.topic) {
          if (matchTopics.has(q.topic)) return true;
          for (const t of matchTopics) {
            if (t.length >= 3 && (q.topic.includes(t) || t.includes(q.topic))) return true;
          }
        }

        if (freeTextTopics.size > 0 && parentQuiz) {
          if (parentQuiz.topic && freeTextTopics.has(parentQuiz.topic)) return true;
          if (parentQuiz.title && freeTextTopics.has(parentQuiz.title)) return true;
          for (const ft of freeTextTopics) {
            if (ft.length >= 3) {
              if (parentQuiz.topic && (parentQuiz.topic.includes(ft) || ft.includes(parentQuiz.topic))) return true;
              if (parentQuiz.title && (parentQuiz.title.includes(ft) || ft.includes(parentQuiz.title))) return true;
            }
          }
        }

        return false;
      }

      // 2. If ONLY free-text topics were selected (no hierarchy entity IDs):
      if (freeTextTopics.size > 0) {
        if (q.topic) {
          if (freeTextTopics.has(q.topic)) return true;
          for (const ft of freeTextTopics) {
            if (ft.length >= 3 && (q.topic.includes(ft) || ft.includes(q.topic))) return true;
          }
        }
        if (parentQuiz) {
          if (parentQuiz.topic && freeTextTopics.has(parentQuiz.topic)) return true;
          if (parentQuiz.title && freeTextTopics.has(parentQuiz.title)) return true;
          for (const ft of freeTextTopics) {
            if (ft.length >= 3) {
              if (parentQuiz.topic && (parentQuiz.topic.includes(ft) || ft.includes(parentQuiz.topic))) return true;
              if (parentQuiz.title && (parentQuiz.title.includes(ft) || ft.includes(parentQuiz.title))) return true;
            }
          }
        }
        return false;
      }

      return false;
    };

    const matchesDifficulty = (q: QuizQuestionRecord): boolean => {
      if (difficulty === "all") return true;
      const qDiff = (q.difficulty || "medium").toLowerCase();
      const reqDiff = difficulty.toLowerCase();
      return qDiff === reqDiff || qDiff === (reqDiff === "easy" ? "آسان" : reqDiff === "hard" ? "سخت" : "متوسط");
    };

    const matchingQuestions = allQuestions.filter(
      (q) => matchesDifficulty(q) && matchesSelection(q),
    );

    let candidateQuestions = matchingQuestions;
    if (candidateQuestions.length < requestedCount && difficulty !== "all") {
      const relaxedQuestions = allQuestions.filter((q) => matchesSelection(q));
      if (relaxedQuestions.length >= candidateQuestions.length) {
        candidateQuestions = relaxedQuestions;
      }
    }

    if (candidateQuestions.length < requestedCount) {
      throw new DomainError(
        "bad_request",
        `فقط ${candidateQuestions.length} سؤال برای سرفصل‌ها و سطح دشواری انتخاب‌شده در دسترس است. حداقل تعداد درخواستی (${requestedCount}) تأمین نمی‌شود.`,
      );
    }

    // Shuffle & snapshot exact question IDs for this attempt
    const shuffled = [...candidateQuestions].sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, requestedCount);
    const questionIds = selectedQuestions.map((q) => q.id);

    const attemptId = randomUUID() as QuizAttemptId;
    const now = new Date().toISOString();

    // Derive structured Course -> Module coverage strictly from selected questions
    const coverage = await this.resolveExamCoverage(selectedQuestions, organizationId);
    const courseTitles = coverage.map((c) => c.title).filter((t) => t && !isInternalIdentifier(t));
    const safeTopic = courseTitles.length > 0 ? buildSafeAttemptTopic(courseTitles, 250) : "آزمون جامع";

    const attempt: QuizAttemptRecord = {
      id: attemptId,
      quizId: null,
      userId: actor.userId,
      score: 0,
      answers: {},
      questionIds,
      questionSnapshot: selectedQuestions,
      topic: safeTopic,
      difficulty,
      status: "in_progress",
      startedAt: now,
      completedAt: null,
    };

    await this.quizAttemptStore.create(attempt);

    // Security: return questions with correctAnswer and explanation hidden during attempt
    const sanitizedQuestions = selectedQuestions.map(
      ({ correctAnswer: _correctAnswer, explanation: _explanation, ...q }) => q,
    );

    return {
      attemptId,
      topic: safeTopic,
      topics: courseTitles.length > 0 ? courseTitles : ["آزمون جامع"],
      difficulty,
      requestedCount,
      questions: sanitizedQuestions,
      coverage,
      startedAt: now,
    };
  }

  /**
   * Save user answers during an in-progress exam attempt.
   * Merges partial or full answers into the attempt record for real-time persistence and refresh resilience.
   */
  async saveExamAttemptAnswer(
    actor: Actor,
    organizationId: OrganizationId,
    attemptId: QuizAttemptId,
    inputAnswers: Array<{ questionId: string; answer: unknown }>,
  ) {
    await this.authorizeQuizAttempt(actor, organizationId);

    const attempt = await this.quizAttemptStore.findById(attemptId);
    if (!attempt || attempt.userId !== actor.userId) {
      throw new DomainError("not_found", "Quiz attempt not found");
    }

    if (attempt.status === "completed" || attempt.completedAt != null) {
      throw new DomainError("bad_request", "امکان تغییر پاسخ‌های آزمون پایان‌یافته وجود ندارد.");
    }

    const updatedAnswers = { ...(attempt.answers as Record<string, unknown> || {}) };
    for (const item of inputAnswers) {
      if (item.questionId) {
        updatedAnswers[item.questionId] = item.answer;
      }
    }

    const updatedAttempt: QuizAttemptRecord = {
      ...attempt,
      answers: updatedAnswers,
    };

    await this.quizAttemptStore.update(updatedAttempt);
    return {
      attemptId,
      answers: updatedAnswers,
    };
  }

  /**
   * Retrieve an attempt and its locked question snapshot.
   * If in_progress, strips correctAnswer and explanation. If completed, returns full answers & explanations.
   * Resolves Course -> Module coverage hierarchy for active or completed attempt.
   */
  async getExamAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    attemptId: QuizAttemptId,
  ) {
    await this.authorizeRead(actor, organizationId);
    const attempt = await this.quizAttemptStore.findById(attemptId);
    if (!attempt || attempt.userId !== actor.userId) {
      throw new DomainError("not_found", "Quiz attempt not found");
    }

    let questions: QuizQuestionRecord[] = [];
    if (attempt.questionSnapshot && Array.isArray(attempt.questionSnapshot) && attempt.questionSnapshot.length > 0) {
      questions = attempt.questionSnapshot as QuizQuestionRecord[];
    } else {
      const questionIds = (attempt.questionIds as QuizQuestionId[]) || [];
      if (questionIds.length > 0) {
        questions = await this.quizQuestionStore.listByIds(questionIds);
      } else if (attempt.quizId) {
        questions = await this.quizQuestionStore.listByQuiz(attempt.quizId as QuizId);
      }
    }

    const isCompleted = attempt.status === "completed" || attempt.completedAt != null;
    const coverage = await this.resolveExamCoverage(questions, organizationId);

    if (!isCompleted) {
      // In-progress: security mask correctAnswer and explanation
      const sanitizedQuestions = questions.map(
        ({ correctAnswer: _correctAnswer, explanation: _explanation, ...q }) => q,
      );
      return {
        attempt,
        questions: sanitizedQuestions,
        coverage,
        isCompleted: false,
      };
    }

    // Completed: return full questions with answers, explanations, and canonical evaluations
    const answersMap = (attempt.answers as Record<string, unknown>) || {};
    const questionResults: Record<string, QuestionEvaluationResult> = {};
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let partialCount = 0;

    for (const q of questions) {
      const val = answersMap[q.id] ?? null;
      const evaluation = evaluateQuestionAnswer(val, q);
      questionResults[q.id] = evaluation;
      if (evaluation.status === "correct") correctCount++;
      else if (evaluation.status === "partial") partialCount++;
      else if (evaluation.status === "unanswered") unansweredCount++;
      else incorrectCount++;
    }

    return {
      attempt,
      questions,
      answers: answersMap,
      questionResults,
      correct: correctCount,
      incorrect: incorrectCount,
      unanswered: unansweredCount,
      partial: partialCount,
      coverage,
      isCompleted: true,
    };
  }

  /**
   * Submit answers for a configured exam or quiz attempt.
   * Evaluates user answers against the locked attempt snapshot questions,
   * calculates score, updates attempt status to 'completed', and returns breakdown.
   */
  async submitConfiguredExamAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    attemptId: QuizAttemptId,
    inputAnswers: Array<{ questionId: string; answer: unknown }>,
  ): Promise<QuizAttemptResult & { questions?: QuizQuestionRecord[]; questionResults?: Record<string, QuestionEvaluationResult> }> {
    await this.authorizeQuizAttempt(actor, organizationId);

    const attempt = await this.quizAttemptStore.findById(attemptId);
    if (!attempt || attempt.userId !== actor.userId) {
      throw new DomainError("not_found", "Quiz attempt not found");
    }

    let questions: QuizQuestionRecord[] = [];
    if (attempt.questionSnapshot && Array.isArray(attempt.questionSnapshot) && attempt.questionSnapshot.length > 0) {
      questions = attempt.questionSnapshot as QuizQuestionRecord[];
    } else {
      const questionIds = (attempt.questionIds as QuizQuestionId[]) || [];
      if (questionIds.length > 0) {
        questions = await this.quizQuestionStore.listByIds(questionIds);
      } else if (attempt.quizId) {
        questions = await this.quizQuestionStore.listByQuiz(attempt.quizId as QuizId);
      }
    }

    if (questions.length === 0) {
      throw new DomainError("unprocessable", "Quiz attempt has no questions");
    }

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let partialCount = 0;
    let earnedPoints = 0;

    const answersMap: Record<string, unknown> = {};
    const questionResults: Record<string, QuestionEvaluationResult> = {};

    for (const q of questions) {
      const studentAns = inputAnswers.find((a) => a.questionId === q.id);
      const val = studentAns?.answer ?? null;
      answersMap[q.id] = val;

      const evaluation = evaluateQuestionAnswer(val, q);
      questionResults[q.id] = evaluation;

      if (evaluation.status === "correct") {
        correctCount++;
        earnedPoints += 1;
      } else if (evaluation.status === "partial") {
        partialCount++;
        earnedPoints += evaluation.scoreRatio;
      } else if (evaluation.status === "unanswered") {
        unansweredCount++;
      } else {
        incorrectCount++;
      }
    }

    const score = Math.round((earnedPoints / questions.length) * 100 * 100) / 100;
    const now = new Date().toISOString();

    const metrics = {
      correct: correctCount,
      incorrect: incorrectCount,
      unanswered: unansweredCount,
      partial: partialCount,
      total: questions.length,
    };

    const updatedAttempt: QuizAttemptRecord = {
      ...attempt,
      score,
      answers: answersMap,
      questionSnapshot: questions,
      metrics,
      status: "completed",
      completedAt: now,
    };

    await this.quizAttemptStore.update(updatedAttempt);

    if (this.auditService && attempt.quizId) {
      await this.auditService.emit([
        auditQuizAttempted(actor.userId, organizationId, attempt.quizId as QuizId, {
          courseId: "configured-exam" as CourseId,
          attemptId: attempt.id,
          score,
          correct: correctCount,
          total: questions.length,
        }),
      ]);
    }

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId || "configured-exam",
      score,
      correct: correctCount,
      incorrect: incorrectCount,
      unanswered: unansweredCount,
      partial: partialCount,
      total: questions.length,
      answers: answersMap,
      questionResults,
      completedAt: now,
      questions,
    };
  }

  /**
   * Retrieve list of past exam attempts for the authenticated student.
   * Returns metadata including topic, score, question counts, status, and timestamps.
   */
  async listExamHistory(
    actor: Actor,
    organizationId: OrganizationId,
    limit = 50,
  ): Promise<{ items: ExamHistoryItem[] }> {
    await this.authorizeRead(actor, organizationId);

    const attempts = await this.quizAttemptStore.listByUser(actor.userId);
    const sortedAttempts = attempts.slice(0, limit);

    const items: ExamHistoryItem[] = sortedAttempts.map((a) => {
      const metrics = (a.metrics as {
        correct?: number;
        incorrect?: number;
        unanswered?: number;
        partial?: number;
        total?: number;
      }) || {};

      const snapshotLen = Array.isArray(a.questionSnapshot) ? a.questionSnapshot.length : 0;
      const idsLen = Array.isArray(a.questionIds) ? a.questionIds.length : 0;
      const answersKeys = Object.keys((a.answers as Record<string, unknown>) || {});
      const totalQuestions = metrics.total ?? (snapshotLen || idsLen || answersKeys.length || 0);

      const isCompleted = a.status === "completed" || a.completedAt != null;

      let correct = metrics.correct ?? 0;
      let incorrect = metrics.incorrect ?? 0;
      const unanswered = metrics.unanswered ?? 0;
      const partial = metrics.partial ?? 0;

      if (isCompleted && metrics.correct === undefined && totalQuestions > 0) {
        correct = Math.round((a.score / 100) * totalQuestions);
        incorrect = Math.max(0, totalQuestions - correct);
      }

      return {
        attemptId: a.id,
        quizId: a.quizId ?? null,
        topic: a.topic ?? (a.quizId ? "آزمون دوره" : "آزمون جامع"),
        difficulty: a.difficulty ?? null,
        score: a.score,
        totalQuestions,
        correct,
        incorrect,
        unanswered,
        partial,
        status: a.status ?? (isCompleted ? "completed" : "in_progress"),
        startedAt: a.startedAt,
        completedAt: a.completedAt ?? null,
      };
    });

    return { items };
  }

  /** Submit a quiz attempt. Scores the answers and persists the result. */
  async submitQuizAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    input: QuizAttemptInput,
  ): Promise<QuizAttemptResult> {
    await this.authorizeQuizAttempt(actor, organizationId);

    let isPreviewAttempt = false;
    if (this.entitlementService) {
      const access = await this.entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "quiz",
        resourceId: input.quizId,
      });
      if (!access.granted || access.reason === "free_preview") {
        isPreviewAttempt = true;
      }
    }

    const quiz = await this.quizStore.findByIdForOrganization(
      input.quizId as QuizId,
      organizationId,
      this.systemOrganizationId,
    );
    if (!quiz) throw new DomainError("not_found", "Quiz not found");

    if (this.courseStore && quiz.courseId) {
      const course = await this.courseStore.findByIdForUser(
        quiz.courseId,
        actor.userId,
        this.systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Quiz not found");
      }
    }

    let questions = await this.quizQuestionStore.listByQuiz(input.quizId as QuizId);
    if (questions.length === 0) {
      throw new DomainError("unprocessable", "Quiz has no questions");
    }

    if (isPreviewAttempt) {
      // In preview mode, restrict attempt strictly to the preview questions
      const preview = await this.getPreviewQuiz(actor, organizationId, quiz.courseId as CourseId, { quizId: input.quizId as QuizId });
      const previewIds = new Set(preview.quiz?.questions.map((q) => q.id) ?? []);
      questions = questions.filter((q) => previewIds.has(q.id));
      for (const a of input.answers) {
        if (!previewIds.has(a.questionId)) {
          throw new DomainError(
            "forbidden",
            "برای شرکت در آزمون کامل، فعال‌سازی اشتراک یا خرید دوره الزامی است.",
          );
        }
      }
    }

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let partialCount = 0;
    let earnedPoints = 0;

    const answersMap: Record<string, unknown> = {};
    const questionResults: Record<string, QuestionEvaluationResult> = {};

    for (const q of questions) {
      const studentAnswer = input.answers.find((a: { questionId: string }) => a.questionId === q.id);
      const val = studentAnswer?.answer ?? null;
      answersMap[q.id] = val;

      const evaluation = evaluateQuestionAnswer(val, q);
      questionResults[q.id] = evaluation;

      if (evaluation.status === "correct") {
        correctCount++;
        earnedPoints += 1;
      } else if (evaluation.status === "partial") {
        partialCount++;
        earnedPoints += evaluation.scoreRatio;
      } else if (evaluation.status === "unanswered") {
        unansweredCount++;
      } else {
        incorrectCount++;
      }
    }

    const score = Math.round((earnedPoints / questions.length) * 100 * 100) / 100;
    const attemptId = randomUUID();
    const now = new Date().toISOString();

    const questionSnapshot = questions.map((q) => ({
      id: q.id,
      quizId: q.quizId,
      question: q.question,
      choices: q.choices,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      topic: q.topic,
      difficulty: q.difficulty,
      questionType: q.questionType,
      sortOrder: q.sortOrder,
    }));

    const metrics = {
      correct: correctCount,
      incorrect: incorrectCount,
      unanswered: unansweredCount,
      partial: partialCount,
      total: questions.length,
    };

    if (isPreviewAttempt) {
      return {
        attemptId,
        quizId: input.quizId,
        score,
        correct: correctCount,
        incorrect: incorrectCount,
        unanswered: unansweredCount,
        partial: partialCount,
        total: questions.length,
        answers: answersMap,
        questionResults,
        completedAt: now,
        questions,
        is_preview: true,
      } as any;
    }

    const attempt: QuizAttemptRecord = {
      id: attemptId,
      quizId: input.quizId,
      userId: actor.userId,
      score,
      answers: answersMap,
      questionSnapshot,
      metrics,
      topic: quiz.title ?? (questions[0]?.topic ?? "آزمون دوره"),
      status: "completed",
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
      incorrect: incorrectCount,
      unanswered: unansweredCount,
      partial: partialCount,
      total: questions.length,
      answers: answersMap,
      questionResults,
      completedAt: now,
      questions,
    };
  }

  /** Get a specific quiz attempt by ID. Non-disclosing for other users. */
  async getQuizAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    attemptId: QuizAttemptId,
  ): Promise<QuizAttemptRecord & { questions?: QuizQuestionRecord[]; questionResults?: Record<string, QuestionEvaluationResult> }> {
    await this.authorizeRead(actor, organizationId);
    const attempt = await this.quizAttemptStore.findById(attemptId);
    if (!attempt || attempt.userId !== actor.userId) {
      throw new DomainError("not_found", "Quiz attempt not found");
    }

    let questions: QuizQuestionRecord[] = [];
    if (attempt.questionSnapshot && Array.isArray(attempt.questionSnapshot) && attempt.questionSnapshot.length > 0) {
      questions = attempt.questionSnapshot as QuizQuestionRecord[];
    } else if (attempt.quizId) {
      questions = await this.quizQuestionStore.listByQuiz(attempt.quizId as QuizId);
    }
    const answersMap = (attempt.answers as Record<string, unknown>) || {};
    const questionResults: Record<string, QuestionEvaluationResult> = {};
    for (const q of questions) {
      const val = answersMap[q.id] ?? null;
      questionResults[q.id] = evaluateQuestionAnswer(val, q);
    }

    return {
      ...attempt,
      questions,
      questionResults,
    };
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
    const [modules, flashcards, courseAttempts, progressRecords, allUserAttempts, course] = await Promise.all([
      this.moduleStore.listByCourse(courseId),
      this.flashcardStore.listByCourse(courseId, organizationId),
      this.quizAttemptStore.listByUserAndCourse(actor.userId, courseId),
      this.progressStore.listByUserAndCourse(actor.userId, courseId),
      this.quizAttemptStore.listByUser(actor.userId),
      this.courseStore ? this.courseStore.findById(courseId).catch(() => undefined) : Promise.resolve(undefined),
    ]);

    // Include completed configured exam attempts (quizId = null) alongside course quizzes
    const courseTitle = course?.name?.trim().toLowerCase();
    const configuredAttempts = allUserAttempts.filter((a) => {
      if (a.quizId !== null) return false;
      const isCompleted = a.status === "completed" || a.completedAt != null;
      if (!isCompleted) return false;
      if (!courseTitle) return true;
      const topic = (a.topic || "").toLowerCase();
      return topic.includes(courseTitle) || topic.includes("آزمون جامع") || topic.includes("جامع");
    });

    const attempts = [...courseAttempts, ...configuredAttempts];

    // Batch-load lessons for all modules.
    const moduleIds = modules.map((m: ModuleRecord) => m.id);
    const lessons = moduleIds.length > 0
      ? await this.lessonStore.listByModules(moduleIds)
      : [];

    const publishedLessons = lessons.filter((l: LessonRecord) => l.publicationStatus === "published");
    const completedLessonIds = new Set(
      progressRecords
        .filter((p: { completed?: boolean; lessonId: string }) => p.completed)
        .map((p: { lessonId: string }) => p.lessonId),
    );

    const totalLessons = publishedLessons.length;
    const completedLessons = publishedLessons.filter((l: LessonRecord) =>
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

    const userSchedules = this.userFlashcardScheduleStore
      ? await this.userFlashcardScheduleStore.listByUser(actor.userId)
      : [];
    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));

    const reviewedFlashcards = flashcards.filter((f: FlashcardRecord) => {
      const schedule = scheduleMap.get(f.id);
      if (schedule) {
        return schedule.reviewCount > 0 || schedule.intervalDays > 0;
      }
      return f.intervalDays > 0;
    }).length;

    const masteredFlashcards = flashcards.filter((f: FlashcardRecord) => {
      const schedule = scheduleMap.get(f.id);
      if (schedule) {
        const dueAt = new Date(schedule.dueAt);
        return dueAt.getTime() - now.getTime() > masteryThresholdMs || schedule.intervalDays >= 7;
      }
      const dueAt = new Date(f.dueAt);
      return dueAt.getTime() - now.getTime() > masteryThresholdMs;
    }).length;

    const flashcardMasteryPercent =
      totalFlashcards > 0
        ? Math.round((masteredFlashcards / totalFlashcards) * 100)
        : 0;

    // Quiz analytics.
    const quizzes = await this.quizStore.listByCourse(courseId, organizationId);
    const totalQuizzes = quizzes.filter((q: QuizRecord) => q.status === "published").length;
    const attemptsTaken = attempts.length;
    const averageQuizScore =
      attemptsTaken > 0
        ? Math.round(
            (attempts.reduce((sum: number, a: QuizAttemptRecord) => sum + a.score, 0) / attemptsTaken) * 100,
          ) / 100
        : 0;

    // Weak areas: quizzes where the last attempt scored below 70%.
    const attemptsByQuiz = new Map<string, QuizAttemptRecord>();
    for (const a of attempts) {
      if (a.quizId) {
        const existing = attemptsByQuiz.get(a.quizId);
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const existingTime = existing?.completedAt ? new Date(existing.completedAt).getTime() : 0;
        if (!existing || aTime > existingTime) {
          attemptsByQuiz.set(a.quizId, a);
        }
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

  // -------------------------------------------------------------------------
  // Study Sessions & Active Time Tracking (PR6-10)
  // -------------------------------------------------------------------------

  /**
   * Starts a new educational study session for an active learning activity
   * (lesson, flashcard, exam, ai_tutor, pdf).
   *
   * Enforces single active educational session policy: automatically finalizes
   * any open active session for the same user to prevent double counting across tabs.
   */
  async startStudySession(
    actor: Actor,
    input: StartStudySessionInput,
  ): Promise<StudySessionRecord> {
    if (!this.studySessionStore) {
      throw new DomainError("bad_request", "Study session store not configured");
    }

    if (!isStudyActivityType(input.activityType)) {
      throw new DomainError("bad_request", `Invalid study activity type: ${input.activityType}`);
    }

    const now = new Date().toISOString();

    // Finalize any previous open session for this user to avoid double counting
    await this.studySessionStore.closeActiveSessionsForUser(actor.userId, now);

    const id = randomUUID();
    const record = await this.studySessionStore.create({
      id,
      userId: actor.userId,
      activityType: input.activityType,
      courseId: input.courseId ? (input.courseId as CourseId) : null,
      moduleId: input.moduleId ?? null,
      lessonId: input.lessonId ? (input.lessonId as LessonId) : null,
      startedAt: now,
      lastActivityAt: now,
      endedAt: null,
      durationSeconds: 0,
    });

    return record;
  }

  /**
   * Records a heartbeat for an active study session.
   *
   * Duration calculation rules (Server-side validation):
   * - Calculates elapsed time between now and lastActivityAt.
   * - If elapsed <= IDLE_TIMEOUT_SECONDS (120s): user was active, adds elapsed time (capped by MAX_HEARTBEAT_GAP_SECONDS).
   * - If elapsed > IDLE_TIMEOUT_SECONDS: idle period detected, do NOT add idle gap; resume tracking from now.
   * - Client duration or client timestamps are never accepted or trusted.
   */
  async recordHeartbeat(
    actor: Actor,
    sessionId: string,
  ): Promise<{ sessionId: string; durationSeconds: number; lastActivityAt: string }> {
    if (!this.studySessionStore) {
      throw new DomainError("bad_request", "Study session store not configured");
    }

    const session = await this.studySessionStore.findById(sessionId);
    if (!session || session.userId !== actor.userId) {
      throw new DomainError("not_found", "Study session not found");
    }

    if (session.endedAt) {
      throw new DomainError("bad_request", "Study session has already ended");
    }

    const now = new Date();
    const lastActivity = new Date(session.lastActivityAt);
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now.getTime() - lastActivity.getTime()) / 1000),
    );

    let addedSeconds = 0;
    if (elapsedSeconds <= STUDY_SESSION_CONFIG.IDLE_TIMEOUT_SECONDS) {
      // User was active within idle timeout
      addedSeconds = Math.min(
        elapsedSeconds,
        STUDY_SESSION_CONFIG.MAX_HEARTBEAT_GAP_SECONDS,
      );
    } else {
      // User was idle for > 2 minutes. Do NOT credit idle time.
      addedSeconds = 0;
    }

    const updatedDuration = session.durationSeconds + addedSeconds;
    const updatedRecord = await this.studySessionStore.update({
      ...session,
      lastActivityAt: now.toISOString(),
      durationSeconds: updatedDuration,
      updatedAt: now.toISOString(),
    });

    return {
      sessionId: updatedRecord.id,
      durationSeconds: updatedRecord.durationSeconds,
      lastActivityAt: updatedRecord.lastActivityAt,
    };
  }

  /**
   * Ends an active study session (e.g. on navigation departure, lesson switch, modal close).
   * Best-effort finalization that bounds elapsed time.
   */
  async endStudySession(
    actor: Actor,
    sessionId: string,
  ): Promise<{ sessionId: string; durationSeconds: number; endedAt: string | null }> {
    if (!this.studySessionStore) {
      throw new DomainError("bad_request", "Study session store not configured");
    }

    const session = await this.studySessionStore.findById(sessionId);
    if (!session || session.userId !== actor.userId) {
      throw new DomainError("not_found", "Study session not found");
    }

    if (session.endedAt) {
      return {
        sessionId: session.id,
        durationSeconds: session.durationSeconds,
        endedAt: session.endedAt,
      };
    }

    const now = new Date();
    const lastActivity = new Date(session.lastActivityAt);
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now.getTime() - lastActivity.getTime()) / 1000),
    );

    let addedSeconds = 0;
    if (elapsedSeconds <= STUDY_SESSION_CONFIG.IDLE_TIMEOUT_SECONDS) {
      addedSeconds = Math.min(
        elapsedSeconds,
        STUDY_SESSION_CONFIG.MAX_HEARTBEAT_GAP_SECONDS,
      );
    }

    const finalDuration = session.durationSeconds + addedSeconds;
    const nowIso = now.toISOString();

    const updatedRecord = await this.studySessionStore.update({
      ...session,
      lastActivityAt: nowIso,
      endedAt: nowIso,
      durationSeconds: finalDuration,
      updatedAt: nowIso,
    });

    return {
      sessionId: updatedRecord.id,
      durationSeconds: updatedRecord.durationSeconds,
      endedAt: updatedRecord.endedAt ?? null,
    };
  }

  /**
   * Aggregates active study time for this week, comparison with last week,
   * and 7-day daily breakdown for the dashboard.
   *
   * Computes week boundaries based on the validated user timezone (with Asia/Tehran fallback)
   * where the Iranian/Persian week starts on Saturday (شنبه).
   */
  async getWeeklyStudyTimeSummary(
    actor: Actor,
    timezone?: string,
  ): Promise<WeeklyStudyTimeSummary> {
    if (!this.studySessionStore) {
      throw new DomainError("bad_request", "Study session store not configured");
    }

    const validTz = validateTimezone(timezone);
    const now = new Date();
    const weekRange = getPersianWeekDates(now, validTz);

    // Query all sessions from the start of last week until now
    const sessions = await this.studySessionStore.listByUserAndDateRange(
      actor.userId,
      `${weekRange.earliestDate}T00:00:00.000Z`,
      now.toISOString(),
    );

    return calculateWeeklyStudyTimeSummary(sessions, now, validTz);
  }

  /**
   * Aggregates all dashboard metrics for the authenticated user:
   * - completedLessons: Total unique completed lessons (from lesson_progress)
   * - completedExams: Total completed/submitted exams & quizzes (from quiz_attempts)
   * - currentStreak & longestStreak: Based on study days with >= 5 min active study time (from study_sessions)
   * - todayIsActive & todayStudySeconds: Real-time status for today
   * - thisWeek & lastWeek study time summary: Persian week breakdown
   *
   * All metrics are scoped strictly to the authenticated actor's userId.
   * Concurrently queries stores with zero N+1 queries.
   */
  async getDashboardStats(
    actor: Actor,
    timezone?: string,
  ): Promise<{
    stats: DashboardStatsSummary;
    thisWeek: WeeklyStudyTimeSummary["thisWeek"];
    lastWeek: WeeklyStudyTimeSummary["lastWeek"];
    changePercent: WeeklyStudyTimeSummary["changePercent"];
    daily: WeeklyStudyTimeSummary["daily"];
  }> {
    const validTz = validateTimezone(timezone);
    const now = new Date();

    const [completedLessons, completedExams, allUserSessions] =
      await Promise.all([
        this.progressStore.countCompletedByUser(actor.userId),
        this.quizAttemptStore.countCompletedByUser(actor.userId),
        this.studySessionStore
          ? this.studySessionStore.listByUser(actor.userId)
          : Promise.resolve([]),
      ]);

    const weeklySummary = calculateWeeklyStudyTimeSummary(
      allUserSessions,
      now,
      validTz,
    );
    const streakSummary = calculateStreakSummary(
      allUserSessions,
      now,
      validTz,
    );

    return {
      stats: {
        completedLessons,
        completedExams,
        currentStreak: streakSummary.currentStreak,
        longestStreak: streakSummary.longestStreak,
        todayIsActive: streakSummary.todayIsActive,
        todayStudySeconds: streakSummary.todayStudySeconds,
      },
      thisWeek: weeklySummary.thisWeek,
      lastWeek: weeklySummary.lastWeek,
      changePercent: weeklySummary.changePercent,
      daily: weeklySummary.daily,
    };
  }
}

