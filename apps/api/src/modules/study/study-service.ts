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
  type OrganizationId,
  type QuizAttemptId,
  type QuizId,
  type QuizQuestionId,
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
} from "@avana/domain";
import type {
  FlashcardRating,
  QuizAttemptInput,
  QuizAttemptResult,
  QuizAttemptRecord,
  StudyAnalytics,
  StudyRecommendation,
  FlashcardStudySessionRecord,
  FlashcardStudySessionCardRecord,
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
import type { CourseStore } from "../courses/course-store.js";
import type { ModuleStore, LessonStore, ProgressStore, LessonRecord, ModuleRecord } from "../learning/learning-store.js";
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
    private readonly userFlashcardScheduleStore?: UserFlashcardScheduleStore,
    private readonly courseStore?: CourseStore,
    private readonly systemOrganizationId?: OrganizationId,
    private readonly studySessionStore?: StudySessionStore,
    private readonly flashcardStudySessionStore?: FlashcardStudySessionStore,
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
   * Filters by user per-user schedule AND due_at column: only cards reviewed at least once
   * by the user where due_at <= now are returned. Unread cards are never returned.
   */
  async listFlashcardsForReview(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<FlashcardRecord[]> {
    await this.authorizeRead(actor, organizationId);

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

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const now = new Date();
    const courseSet = courseIds && courseIds.length > 0 ? new Set(courseIds) : null;
    const docSet = documentIds && documentIds.length > 0 ? new Set(documentIds) : null;

    return allFlashcards
      .filter((f) => {
        if (courseSet && !courseSet.has(f.courseId)) return false;
        if (docSet && !docSet.has(f.documentId)) return false;
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

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const now = new Date();
    const courseSet = courseIds && courseIds.length > 0 ? new Set(courseIds) : null;
    const docSet = documentIds && documentIds.length > 0 ? new Set(documentIds) : null;

    let filtered = allFlashcards.map((f) => {
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
      filtered = filtered.filter((f) => docSet.has(f.documentId));
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

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const reviewedCardIds = new Set(userReviews.map((r) => r.flashcardId));
    const now = new Date();
    const courseSet = courseIds && courseIds.length > 0 ? new Set(courseIds) : null;
    const docSet = documentIds && documentIds.length > 0 ? new Set(documentIds) : null;

    const mapped = allFlashcards.map((f) => {
      const schedule = scheduleMap.get(f.id);
      if (!schedule) return f;
      return {
        ...f,
        dueAt: schedule.dueAt,
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor,
      };
    });

    let filtered = mapped.filter((f) => (!courseSet || courseSet.has(f.courseId)) && (!docSet || docSet.has(f.documentId)));

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
    let effectiveDocIds = input.documentIds ? [...input.documentIds] : [];
    if (input.moduleIds && input.moduleIds.length > 0 && this.moduleStore) {
      for (const modId of input.moduleIds) {
        const mod = await this.moduleStore.findById(modId as any).catch(() => undefined);
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
          if (docSet && !docSet.has(f.documentId)) return false;
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
    let missingCount = 0;
    for (const sc of sessionCards) {
      if (sc.flashcardId) {
        const found = cardMap.get(sc.flashcardId as FlashcardId);
        if (found && !found.deletedAt) {
          orderedCards.push(found);
        } else {
          missingCount++;
        }
      } else {
        missingCount++;
      }
    }

    console.log("[FLASHCARD_SESSION_DEBUG] SNAPSHOT", {
      sessionId,
      requestedCards: sessionCards.length,
      missingCards: missingCount,
      orderedCards: orderedCards.length,
      currentIndex: session.currentIndex,
    });

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
    const quizzes = await this.quizStore.listByCourse(courseId, organizationId);
    return quizzes.filter((q) => q.status === "published");
  }

  /** Get a published quiz with its questions for attempt. */
  async getQuizForAttempt(
    actor: Actor,
    organizationId: OrganizationId,
    quizId: QuizId,
  ): Promise<QuizRecord & { questions: Array<Omit<QuizQuestionRecord, "correctAnswer">> }> {
    await this.authorizeRead(actor, organizationId);
    const quiz = await this.quizStore.findByIdForOrganization(quizId, organizationId);
    if (!quiz) throw new DomainError("not_found", "Quiz not found");
    if (quiz.status !== "published") throw new DomainError("not_found", "Quiz not found");

    const questions = await this.quizQuestionStore.listByQuiz(quizId);
    // Security: strip correctAnswer from questions response prior to submission
    const sanitized = questions.map(({ correctAnswer, ...q }) => q);
    return { ...quiz, questions: sanitized };
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

    const candidateTopics = new Set<string>();
    const selectedDocumentIds = new Set<string>();
    const selectedLessonIds = new Set<string>();

    for (const item of rawSelection) {
      candidateTopics.add(item);
      if (this.lessonStore) {
        const les = await this.lessonStore.findById(item as any).catch(() => undefined);
        if (les) {
          candidateTopics.add(les.title);
          candidateTopics.add(les.id);
          selectedLessonIds.add(les.id);
        }
      }
      if (this.moduleStore) {
        const mod = await this.moduleStore.findById(item as any).catch(() => undefined);
        if (mod) {
          candidateTopics.add(mod.title);
          candidateTopics.add(mod.id);
          if (mod.documentId) {
            selectedDocumentIds.add(mod.documentId);
          }
          if (this.lessonStore) {
            const lessons = await this.lessonStore.listByModule(mod.id).catch(() => []);
            for (const l of lessons) {
              candidateTopics.add(l.title);
              candidateTopics.add(l.id);
              selectedLessonIds.add(l.id);
            }
          }
        }
      }
    }

    const topicsArray = Array.from(candidateTopics);

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

    // Filter questions matching selected Module (via lessonId OR quiz.documentId OR topic match)
    const matchingQuestions = allQuestions.filter((q) => {
      // 1. Difficulty check
      if (difficulty !== "all") {
        const qDiff = (q.difficulty || "medium").toLowerCase();
        const reqDiff = difficulty.toLowerCase();
        if (qDiff !== reqDiff && qDiff !== (reqDiff === "easy" ? "آسان" : reqDiff === "hard" ? "سخت" : "متوسط")) {
          return false;
        }
      }

      // 2. Selection criteria check
      if (rawSelection.length === 0) return true;

      // Check if question's lessonId is selected
      if (q.lessonId && selectedLessonIds.has(q.lessonId)) {
        return true;
      }

      // Check topic match (exact or substring)
      if (q.topic) {
        if (candidateTopics.has(q.topic)) return true;
        for (const t of candidateTopics) {
          if (t.length >= 3 && (q.topic.includes(t) || t.includes(q.topic))) return true;
        }
      }

      // Check if question's parent quiz belongs to selected documentId/module or matches topic/title
      const parentQuiz = quizMap.get(q.quizId);
      if (parentQuiz) {
        if (parentQuiz.documentId && selectedDocumentIds.has(parentQuiz.documentId)) {
          return true;
        }
        if (parentQuiz.topic) {
          if (candidateTopics.has(parentQuiz.topic)) return true;
          for (const t of candidateTopics) {
            if (t.length >= 3 && (parentQuiz.topic.includes(t) || t.includes(parentQuiz.topic))) return true;
          }
        }
        if (parentQuiz.title) {
          if (candidateTopics.has(parentQuiz.title)) return true;
          for (const t of candidateTopics) {
            if (t.length >= 3 && (parentQuiz.title.includes(t) || t.includes(parentQuiz.title))) return true;
          }
        }
      }

      return false;
    });

    let candidateQuestions = matchingQuestions;
    if (candidateQuestions.length < requestedCount && difficulty !== "all") {
      // Relax difficulty filter if needed
      const relaxedQuestions = allQuestions.filter((q) => {
        if (rawSelection.length === 0) return true;
        if (q.lessonId && selectedLessonIds.has(q.lessonId)) return true;
        if (q.topic && candidateTopics.has(q.topic)) return true;
        const parentQuiz = quizMap.get(q.quizId);
        if (parentQuiz) {
          if (parentQuiz.documentId && selectedDocumentIds.has(parentQuiz.documentId)) return true;
          if (parentQuiz.topic && candidateTopics.has(parentQuiz.topic)) return true;
        }
        return false;
      });
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

    const attempt: QuizAttemptRecord = {
      id: attemptId,
      quizId: null,
      userId: actor.userId,
      score: 0,
      answers: {},
      questionIds,
      topic: topicsArray.slice(0, 5).join(", ") || "آزمون جامع",
      difficulty,
      status: "in_progress",
      startedAt: now,
      completedAt: null,
    };

    await this.quizAttemptStore.create(attempt);

    // Security: return questions with correctAnswer hidden
    const sanitizedQuestions = selectedQuestions.map(({ correctAnswer, ...q }) => q);

    return {
      attemptId,
      topics: topicsArray,
      difficulty,
      requestedCount,
      questions: sanitizedQuestions,
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
   * If in_progress, strips correctAnswer. If completed, returns full answers & explanations.
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

    const questionIds = (attempt.questionIds as QuizQuestionId[]) || [];
    let questions: QuizQuestionRecord[] = [];
    if (questionIds.length > 0) {
      questions = await this.quizQuestionStore.listByIds(questionIds);
    } else if (attempt.quizId) {
      questions = await this.quizQuestionStore.listByQuiz(attempt.quizId as QuizId);
    }

    const isCompleted = attempt.status === "completed" || attempt.completedAt != null;

    if (!isCompleted) {
      // In-progress: security mask correctAnswer
      const sanitizedQuestions = questions.map(({ correctAnswer, ...q }) => q);
      return {
        attempt,
        questions: sanitizedQuestions,
        isCompleted: false,
      };
    }

    // Completed: return full questions with answers & explanations
    return {
      attempt,
      questions,
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
  ): Promise<QuizAttemptResult & { questions?: QuizQuestionRecord[] }> {
    await this.authorizeQuizAttempt(actor, organizationId);

    const attempt = await this.quizAttemptStore.findById(attemptId);
    if (!attempt || attempt.userId !== actor.userId) {
      throw new DomainError("not_found", "Quiz attempt not found");
    }

    const questionIds = (attempt.questionIds as QuizQuestionId[]) || [];
    let questions: QuizQuestionRecord[] = [];
    if (questionIds.length > 0) {
      questions = await this.quizQuestionStore.listByIds(questionIds);
    } else if (attempt.quizId) {
      questions = await this.quizQuestionStore.listByQuiz(attempt.quizId as QuizId);
    }

    if (questions.length === 0) {
      throw new DomainError("unprocessable", "Quiz attempt has no questions");
    }

    let correctCount = 0;
    const answersMap: Record<string, unknown> = {};

    for (const q of questions) {
      const studentAns = inputAnswers.find((a) => a.questionId === q.id);
      const val = studentAns?.answer ?? null;
      answersMap[q.id] = val;

      if (val !== null && val !== undefined) {
        if (
          JSON.stringify(val) === JSON.stringify(q.correctAnswer) ||
          String(val) === String(q.correctAnswer)
        ) {
          correctCount++;
        }
      }
    }

    const score = Math.round((correctCount / questions.length) * 100 * 100) / 100;
    const now = new Date().toISOString();

    const updatedAttempt: QuizAttemptRecord = {
      ...attempt,
      score,
      answers: answersMap,
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
      total: questions.length,
      answers: answersMap,
      completedAt: now,
      questions,
    };
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
    const moduleIds = modules.map((m: ModuleRecord) => m.id);
    const lessons = moduleIds.length > 0
      ? await this.lessonStore.listByModules(moduleIds)
      : [];

    const publishedLessons = lessons.filter((l: LessonRecord) => l.publicationStatus === "published");
    const completedLessonIds = new Set(
      progressRecords.filter((p: any) => p.completed).map((p: any) => p.lessonId),
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
    const reviewedFlashcards = flashcards.filter((f: FlashcardRecord) => {
      // A card has been reviewed if its interval > 0.
      return f.intervalDays > 0;
    }).length;
    const masteredFlashcards = flashcards.filter((f: FlashcardRecord) => {
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

