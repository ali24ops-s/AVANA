/**
 * StudyPlannerService — Orchestration for Daily Study Planner (Phase 2).
 *
 * Implements:
 * - Lazy deterministic daily plan creation and retrieval (getOrCreateDailyPlan)
 * - Candidate collection from real persisted learning state (Flashcards, Lessons, Quizzes)
 * - Deterministic capacity fitting using domain selectCandidatesForDailyPlan
 * - Plan and task synchronization with real user activity
 * - Plan regeneration without clobbering completed tasks
 * - Concurrency & idempotency handling
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type LessonId,
  type OrganizationId,
  type DailyStudyPlan,
  type StudyTask,
  type StudyTaskStatus,
  type PlannerCandidate,
  type ExamScope,
  STUDY_PLANNER_CONFIG,
  resolveExamUrgencyBudget,
  getExamUrgencyPriorityBoost,
  isResourceInExamScope,
  selectCandidatesForDailyPlan,
  validateTimezone,
  getLocalDateParts,
  formatLocalDateString,
  calculateExamDaysRemaining,
  toPersianDigits,
  DomainError,
} from "@avana/domain";
import type {
  DailyStudyPlanStore,
  FlashcardStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
  StudySessionStore,
  FlashcardRecord,
  UserFlashcardScheduleRecord,
} from "./study-store.js";
import type {
  LessonStore,
  ModuleStore,
  ProgressStore,
  LessonRecord,
} from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { EntitlementService } from "../commerce/entitlement-service.js";

export interface StudyPlannerServiceDeps {
  dailyPlanStore: DailyStudyPlanStore;
  userFlashcardScheduleStore: UserFlashcardScheduleStore;
  flashcardStore: FlashcardStore;
  progressStore: ProgressStore;
  lessonStore: LessonStore;
  moduleStore: ModuleStore;
  courseStore: CourseStore;
  quizStore: QuizStore;
  quizAttemptStore: QuizAttemptStore;
  quizQuestionStore?: QuizQuestionStore;
  studySessionStore?: StudySessionStore;
  entitlementService?: EntitlementService;
  systemOrganizationId?: OrganizationId;
}

export class StudyPlannerService {
  constructor(private readonly deps: StudyPlannerServiceDeps) {}

  /**
   * Resolves the calendar date (YYYY-MM-DD) for a given timezone or default.
   */
  resolveLocalDate(referenceDate: Date = new Date(), timeZone?: string): string {
    const validTz = validateTimezone(timeZone);
    const parts = getLocalDateParts(referenceDate, validTz);
    return formatLocalDateString(parts.year, parts.month, parts.day);
  }

  /**
   * Get or lazily create a Daily Study Plan for the authenticated actor.
   *
   * Idempotent & race-condition safe:
   * 1. Checks if plan already exists for (userId, planDate).
   * 2. If exists, synchronizes completion status with latest real activity and returns it.
   * 3. If does not exist, collects candidates from real learning state, packs them into daily capacity,
   *    and persists the plan with tasks.
   */
  async getOrCreateDailyPlan(
    actor: Actor,
    planDate?: string,
    options?: {
      targetMinutes?: number;
      timeZone?: string;
    },
  ): Promise<{ plan: DailyStudyPlan; tasks: StudyTask[] }> {
    const targetDate =
      planDate && /^\d{4}-\d{2}-\d{2}$/.test(planDate)
        ? planDate
        : this.resolveLocalDate(new Date(), options?.timeZone);

    const existingPlan = await this.deps.dailyPlanStore.findByUserAndDate(
      actor.userId,
      targetDate,
    );

    if (existingPlan) {
      return this.syncPlanCompletionInternal(actor, existingPlan);
    }

    // Fetch user's active courses to inspect upcoming exams and determine budget
    const userCourses = await this.deps.courseStore.listUserCourses(
      actor.userId,
      undefined,
      this.deps.systemOrganizationId,
    );
    const activeCourses = userCourses.filter(
      (c) => !c.deletedAt && c.status !== "archived",
    );

    const now = new Date();
    const activeUpcomingExamDays: number[] = [];
    for (const c of activeCourses) {
      if (c.examDate) {
        const days = calculateExamDaysRemaining(c.examDate, now);
        if (days !== null && days >= 0) {
          activeUpcomingExamDays.push(days);
        }
      }
    }

    const nearestExamDays =
      activeUpcomingExamDays.length > 0
        ? Math.min(...activeUpcomingExamDays)
        : null;

    const budget = resolveExamUrgencyBudget(nearestExamDays);

    const targetMinutes =
      nearestExamDays !== null
        ? Math.min(
            STUDY_PLANNER_CONFIG.MAX_TARGET_MINUTES,
            Math.max(
              budget.totalTargetMinutes,
              options?.targetMinutes && options.targetMinutes > 0
                ? options.targetMinutes
                : budget.totalTargetMinutes,
            ),
          )
        : options?.targetMinutes && options.targetMinutes > 0
        ? Math.min(
            STUDY_PLANNER_CONFIG.MAX_TARGET_MINUTES,
            Math.max(
              STUDY_PLANNER_CONFIG.MIN_TARGET_MINUTES,
              options.targetMinutes,
            ),
          )
        : budget.totalTargetMinutes;

    const candidates = await this.collectCandidates(actor, activeCourses, now);
    const capacityResult = selectCandidatesForDailyPlan(
      candidates,
      targetMinutes,
      { allowOversizedFirst: true, budget },
    );

    const planId = randomUUID();
    const newPlan: Omit<DailyStudyPlan, "createdAt" | "updatedAt"> = {
      id: planId,
      userId: actor.userId,
      planDate: targetDate,
      status: capacityResult.selectedCandidates.length === 0 ? "pending" : "in_progress",
      targetDurationMinutes: targetMinutes,
      completedDurationMinutes: 0,
    };

    const newTasks: Array<Omit<StudyTask, "createdAt" | "updatedAt">> =
      capacityResult.selectedCandidates.map((c, index) => ({
        id: randomUUID(),
        planId,
        userId: actor.userId,
        taskType: c.type,
        status: "pending",
        title: c.title,
        description: c.description ?? null,
        courseId: c.courseId ?? null,
        moduleId: c.moduleId ?? null,
        lessonId: c.lessonId ?? null,
        quizId: c.quizId ?? null,
        priority: index + 1,
        estimatedMinutes: c.estimatedMinutes,
        completedAt: null,
        metadata: c.metadata ?? {},
      }));

    const result = await this.deps.dailyPlanStore.createPlanWithTasks(
      newPlan,
      newTasks,
    );

    // Run synchronization to catch any tasks that might already be complete
    return this.syncPlanCompletionInternal(actor, result.plan, result.tasks);
  }

  /**
   * Regenerates a daily study plan:
   * - Preserves already completed tasks.
   * - Computes fresh candidates for the remaining time.
   * - Replaces only the uncompleted tasks.
   */
  async regenerateDailyPlan(
    actor: Actor,
    planDate?: string,
    options?: {
      targetMinutes?: number;
      timeZone?: string;
    },
  ): Promise<{ plan: DailyStudyPlan; tasks: StudyTask[] }> {
    const targetDate =
      planDate && /^\d{4}-\d{2}-\d{2}$/.test(planDate)
        ? planDate
        : this.resolveLocalDate(new Date(), options?.timeZone);

    const existing = await this.deps.dailyPlanStore.findByUserAndDate(
      actor.userId,
      targetDate,
    );

    if (!existing) {
      return this.getOrCreateDailyPlan(actor, targetDate, options);
    }

    const currentTasks = await this.deps.dailyPlanStore.listTasksByPlan(
      existing.id,
    );

    const completedTasks = currentTasks.filter((t) => t.status === "completed");
    const completedMinutes = completedTasks.reduce(
      (sum, t) => sum + t.estimatedMinutes,
      0,
    );

    // Fetch user's active courses to inspect upcoming exams and determine budget
    const userCourses = await this.deps.courseStore.listUserCourses(
      actor.userId,
      undefined,
      this.deps.systemOrganizationId,
    );
    const activeCourses = userCourses.filter(
      (c) => !c.deletedAt && c.status !== "archived",
    );

    const now = new Date();
    const activeUpcomingExamDays: number[] = [];
    for (const c of activeCourses) {
      if (c.examDate) {
        const days = calculateExamDaysRemaining(c.examDate, now);
        if (days !== null && days >= 0) {
          activeUpcomingExamDays.push(days);
        }
      }
    }

    const nearestExamDays =
      activeUpcomingExamDays.length > 0
        ? Math.min(...activeUpcomingExamDays)
        : null;

    const budget = resolveExamUrgencyBudget(nearestExamDays);

    const requestedTarget =
      options?.targetMinutes && options.targetMinutes > 0
        ? options.targetMinutes
        : undefined;
    const baseTarget =
      requestedTarget ??
      (existing.targetDurationMinutes > 0
        ? existing.targetDurationMinutes
        : budget.totalTargetMinutes);
    const targetMinutes =
      nearestExamDays !== null
        ? Math.min(
            STUDY_PLANNER_CONFIG.MAX_TARGET_MINUTES,
            Math.max(budget.totalTargetMinutes, baseTarget),
          )
        : Math.min(
            STUDY_PLANNER_CONFIG.MAX_TARGET_MINUTES,
            Math.max(STUDY_PLANNER_CONFIG.MIN_TARGET_MINUTES, baseTarget),
          );
    const remainingMinutes = Math.max(0, targetMinutes - completedMinutes);

    // Exclude resources already covered by completed tasks today
    const completedLessonIds = new Set(
      completedTasks.map((t) => t.lessonId).filter(Boolean),
    );
    const completedQuizIds = new Set(
      completedTasks.map((t) => t.quizId).filter(Boolean),
    );

    const allCandidates = await this.collectCandidates(actor, activeCourses, now);
    const freshCandidates = allCandidates.filter((c) => {
      if (c.lessonId && completedLessonIds.has(c.lessonId)) return false;
      if (c.quizId && completedQuizIds.has(c.quizId)) return false;
      return true;
    });

    const capacityResult = selectCandidatesForDailyPlan(
      freshCandidates,
      remainingMinutes > 0 ? remainingMinutes : targetMinutes,
      { allowOversizedFirst: true, budget },
    );

    let priorityOffset = completedTasks.length;
    const newTasksToInsert: Array<Omit<StudyTask, "createdAt" | "updatedAt">> =
      capacityResult.selectedCandidates.map((c) => ({
        id: randomUUID(),
        planId: existing.id,
        userId: actor.userId,
        taskType: c.type,
        status: "pending",
        title: c.title,
        description: c.description ?? null,
        courseId: c.courseId ?? null,
        moduleId: c.moduleId ?? null,
        lessonId: c.lessonId ?? null,
        quizId: c.quizId ?? null,
        priority: ++priorityOffset,
        estimatedMinutes: c.estimatedMinutes,
        completedAt: null,
        metadata: c.metadata ?? {},
      }));

    const updatedTasks = await this.deps.dailyPlanStore.replaceTasksForPlan(
      existing.id,
      newTasksToInsert,
    );

    const allTasks = [...completedTasks, ...updatedTasks].sort(
      (a, b) => a.priority - b.priority,
    );

    const totalCompleted = allTasks.filter(
      (t) => t.status === "completed",
    ).length;
    const updatedStatus =
      allTasks.length > 0 && totalCompleted === allTasks.length
        ? "completed"
        : totalCompleted > 0
          ? "in_progress"
          : "pending";

    const updatedPlan = await this.deps.dailyPlanStore.updatePlan({
      ...existing,
      status: updatedStatus,
      targetDurationMinutes: targetMinutes,
      completedDurationMinutes: completedMinutes,
      updatedAt: new Date().toISOString(),
    });

    return {
      plan: updatedPlan,
      tasks: allTasks,
    };
  }

  /**
   * Updates status of an individual study task (e.g. manual toggle or skip).
   */
  async updateTaskStatus(
    actor: Actor,
    taskId: string,
    status: StudyTaskStatus,
  ): Promise<StudyTask> {
    const task = await this.deps.dailyPlanStore.findTaskById(taskId);
    if (!task || task.userId !== actor.userId) {
      throw new DomainError("not_found", "Study task not found");
    }

    const now = new Date().toISOString();
    const completedAt = status === "completed" ? now : null;

    const updated = await this.deps.dailyPlanStore.updateTaskStatus(
      taskId,
      status,
      completedAt,
    );

    if (!updated) {
      throw new DomainError("not_found", "Study task not found");
    }

    // Sync parent plan summary
    const plan = await this.deps.dailyPlanStore.findById(updated.planId);
    if (plan) {
      const allTasks = await this.deps.dailyPlanStore.listTasksByPlan(plan.id);
      const completedTasks = allTasks.filter((t) => t.status === "completed");
      const completedDuration = completedTasks.reduce(
        (sum, t) => sum + t.estimatedMinutes,
        0,
      );
      const isAllCompleted =
        allTasks.length > 0 && completedTasks.length === allTasks.length;

      await this.deps.dailyPlanStore.updatePlan({
        ...plan,
        status: isAllCompleted
          ? "completed"
          : completedTasks.length > 0
            ? "in_progress"
            : "pending",
        completedDurationMinutes: completedDuration,
        updatedAt: now,
      });
    }

    return updated;
  }

  /**
   * Internal synchronization: Checks real user learning activity against plan tasks
   * and auto-advances tasks to 'completed' when real activity is recorded.
   */
  private async syncPlanCompletionInternal(
    actor: Actor,
    plan: DailyStudyPlan,
    providedTasks?: StudyTask[],
  ): Promise<{ plan: DailyStudyPlan; tasks: StudyTask[] }> {
    const tasks =
      providedTasks ??
      (await this.deps.dailyPlanStore.listTasksByPlan(plan.id));

    if (tasks.length === 0) {
      return { plan, tasks: [] };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const [userSchedules, allAttempts] = await Promise.all([
      this.deps.userFlashcardScheduleStore.listByUser(actor.userId),
      this.deps.quizAttemptStore.listByUser(actor.userId),
    ]);

    let planMutated = false;
    const updatedTasks: StudyTask[] = [];

    for (const task of tasks) {
      if (task.status === "completed") {
        updatedTasks.push(task);
        continue;
      }

      let isCompletedNow = false;

      // 1. Sync Lesson Tasks
      if (task.taskType === "read_lesson" && task.lessonId) {
        const progress = await this.deps.progressStore.findByUserAndLesson(
          actor.userId,
          task.lessonId as LessonId,
        );
        if (progress?.completed) {
          isCompletedNow = true;
        }
      }

      // 2. Sync Flashcard Tasks (Due cards reviewed)
      if (task.taskType === "review_flashcards") {
        let dueRemaining = 0;
        let courseCardIds: Set<string> | null = null;
        if (task.courseId) {
          const courseFlashcards = await this.deps.flashcardStore.listByCourse(task.courseId as CourseId);
          courseCardIds = new Set(courseFlashcards.filter((f) => !f.deletedAt).map((f) => f.id));
        }

        for (const schedule of userSchedules) {
          if (schedule.reviewCount > 0 && schedule.dueAt) {
            if (courseCardIds && !courseCardIds.has(schedule.flashcardId)) {
              continue;
            }
            const dueDate = new Date(schedule.dueAt);
            if (!isNaN(dueDate.getTime()) && dueDate <= now) {
              dueRemaining++;
            }
          }
        }

        // If initially there were due cards and now due count is 0
        const initialDue = (task.metadata?.dueCount as number) ?? 0;
        if (initialDue > 0 && dueRemaining === 0) {
          isCompletedNow = true;
        }
      }

      // 3. Sync Quiz Tasks
      if (
        (task.taskType === "take_quiz" ||
          task.taskType === "review_wrong_answers") &&
        task.quizId
      ) {
        const quizAttempts = allAttempts.filter(
          (a) =>
            a.quizId === task.quizId &&
            (a.status === "completed" || a.completedAt != null) &&
            new Date(a.completedAt || a.startedAt) >= new Date(task.createdAt),
        );
        if (quizAttempts.length > 0) {
          const lastAttempt = quizAttempts[quizAttempts.length - 1];
          if (lastAttempt.score >= 70 || task.taskType === "take_quiz") {
            isCompletedNow = true;
          }
        }
      }

      if (isCompletedNow) {
        planMutated = true;
        const updated = await this.deps.dailyPlanStore.updateTaskStatus(
          task.id,
          "completed",
          nowIso,
        );
        updatedTasks.push(updated ?? { ...task, status: "completed", completedAt: nowIso });
      } else {
        updatedTasks.push(task);
      }
    }

    const completedTasks = updatedTasks.filter((t) => t.status === "completed");
    const completedMinutes = completedTasks.reduce(
      (sum, t) => sum + t.estimatedMinutes,
      0,
    );
    const isAllCompleted =
      updatedTasks.length > 0 && completedTasks.length === updatedTasks.length;

    const newStatus = isAllCompleted
      ? "completed"
      : completedTasks.length > 0
        ? "in_progress"
        : plan.status;

    let updatedPlan = plan;
    if (
      planMutated ||
      plan.completedDurationMinutes !== completedMinutes ||
      plan.status !== newStatus
    ) {
      updatedPlan = await this.deps.dailyPlanStore.updatePlan({
        ...plan,
        status: newStatus,
        completedDurationMinutes: completedMinutes,
        updatedAt: nowIso,
      });
    }

    return {
      plan: updatedPlan,
      tasks: updatedTasks,
    };
  }

  /**
   * Collects all candidate study tasks across all active/enrolled courses for a user.
   *
   * Adaptive Learning Loop:
   * 1. SRS Due Flashcards (Maintenance: reviewCount > 0, dueAt <= now)
   * 2. Weak Quiz Remediation Loop (Targeted Lesson Review -> Targeted Flashcards -> Quiz Retake)
   * 3. New Flashcards for Studied Lessons (Post-study: Lesson completed, flashcards not yet reviewed)
   * 4. Sequential Lesson Progression (Consecutive unread lessons in module/lesson order)
   * 5. Staged Quiz Unlocking (Short quiz unlocked only when lesson completed + flashcards reviewed)
   * 6. Comprehensive / Consolidation Quizzes (Unlocked after significant progression >= 50%)
   * 7. Quiz-Only Course Support (Direct quiz proposals when no lessons exist)
   */
  async collectCandidates(
    actor: Actor,
    activeCoursesInput?: Array<{
      id: string;
      name: string;
      examDate?: string | null;
      examScope?: ExamScope | null;
      deletedAt?: string | null;
      status?: string;
    }>,
    referenceDate: Date = new Date(),
  ): Promise<PlannerCandidate[]> {
    const candidates: PlannerCandidate[] = [];
    const now = referenceDate;

    // 1. Fetch user's enrolled / accessible courses if not provided
    const userCourses =
      activeCoursesInput ??
      (await this.deps.courseStore.listUserCourses(
        actor.userId,
        undefined,
        this.deps.systemOrganizationId,
      ));

    const activeCourses = userCourses.filter(
      (c) => !c.deletedAt && c.status !== "archived",
    );

    // Map of active upcoming exams per course (daysRemaining >= 0)
    const upcomingExamsMap = new Map<
      string,
      { daysRemaining: number; examScope?: ExamScope | null; courseName: string }
    >();

    for (const c of activeCourses) {
      if (c.examDate) {
        const days = calculateExamDaysRemaining(c.examDate, now);
        if (days !== null && days >= 0) {
          upcomingExamsMap.set(c.id, {
            daysRemaining: days,
            examScope: c.examScope,
            courseName: c.name,
          });
        }
      }
    }

    // Fetch user flashcard schedules, quiz attempts, and study sessions
    const [userSchedules, allAttempts, allSessions] = await Promise.all([
      this.deps.userFlashcardScheduleStore.listByUser(actor.userId),
      this.deps.quizAttemptStore.listByUser(actor.userId),
      this.deps.studySessionStore
        ? this.deps.studySessionStore.listByUser(actor.userId)
        : Promise.resolve([]),
    ]);

    const userScheduleMap = new Map<string, UserFlashcardScheduleRecord>(
      userSchedules.map((s) => [s.flashcardId, s]),
    );

    // Group attempts by quiz
    const attemptsByQuiz = new Map<string, typeof allAttempts>();
    for (const a of allAttempts) {
      if (a.quizId) {
        const list = attemptsByQuiz.get(a.quizId) ?? [];
        list.push(a);
        attemptsByQuiz.set(a.quizId, list);
      }
    }

    // Set of lessons with active/recent study sessions for partial progress detection
    const activeLessonSessionIds = new Set(
      allSessions
        .filter((s) => s.activityType === "lesson" && s.lessonId)
        .map((s) => s.lessonId as string),
    );

    // -----------------------------------------------------------------------
    // A. Due Flashcards Candidates (Scoped per Course, Valid Review History)
    // -----------------------------------------------------------------------
    const dueSchedules = userSchedules.filter((s) => {
      if (!s.dueAt || s.reviewCount === 0) return false;
      const dueDate = new Date(s.dueAt);
      return !isNaN(dueDate.getTime()) && dueDate <= now;
    });

    const processedDueScheduleIds = new Set<string>();

    for (const course of activeCourses) {
      const courseId = course.id;
      const examInfo = upcomingExamsMap.get(courseId);
      const isExamActive = Boolean(examInfo && examInfo.daysRemaining >= 0);

      // Fetch flashcards for this specific course
      const courseFlashcards = (
        await this.deps.flashcardStore.listByCourse(courseId)
      ).filter((f) => !f.deletedAt);
      const activeCardIds = new Set(courseFlashcards.map((f) => f.id));

      const courseDueSchedules = dueSchedules.filter((s) =>
        activeCardIds.has(s.flashcardId),
      );

      if (courseDueSchedules.length > 0) {
        for (const s of courseDueSchedules) {
          processedDueScheduleIds.add(s.id);
        }
        const courseDueCount = courseDueSchedules.length;
        const estimatedMinutes = Math.max(
          5,
          Math.min(30, Math.ceil(courseDueCount * 0.5)),
        );
        const inExamScope = isExamActive;
        const examUrgencyBoost = inExamScope
          ? getExamUrgencyPriorityBoost(examInfo!.daysRemaining)
          : 0;

        // Fetch modules and map lessons to extract chapter numbers for due flashcards
        const modules = (await this.deps.moduleStore.listByCourse(courseId))
          .filter((m) => !m.deletedAt)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const moduleIds = modules.map((m) => m.id);

        const allLessons =
          moduleIds.length > 0
            ? (await this.deps.lessonStore.listByModules(moduleIds)).filter(
                (l) => !l.deletedAt,
              )
            : [];

        const lessonToModuleMap = new Map<string, string>();
        for (const l of allLessons) {
          lessonToModuleMap.set(l.id, l.moduleId);
        }

        const moduleToChapterMap = new Map<string, number>();
        modules.forEach((m, idx) => {
          let chapNum = idx + 1;
          const match = m.title.match(/(?:فصل|chapter)\s*([0-9۰-۹٠-٩]+)/i);
          if (match) {
            const rawDigits = match[1]
              .replace(/[۰٠]/g, "0")
              .replace(/[۱١]/g, "1")
              .replace(/[۲٢]/g, "2")
              .replace(/[۳٣]/g, "3")
              .replace(/[۴٤]/g, "4")
              .replace(/[۵٥]/g, "5")
              .replace(/[۶٦]/g, "6")
              .replace(/[۷٧]/g, "7")
              .replace(/[۸٨]/g, "8")
              .replace(/[۹٩]/g, "9");
            const parsed = parseInt(rawDigits, 10);
            if (!isNaN(parsed) && parsed > 0) {
              chapNum = parsed;
            }
          }
          moduleToChapterMap.set(m.id, chapNum);
        });

        const dueCardIdSet = new Set(
          courseDueSchedules.map((s) => s.flashcardId),
        );
        const dueCards = courseFlashcards.filter((f) => dueCardIdSet.has(f.id));

        const chapterNumberSet = new Set<number>();
        for (const card of dueCards) {
          if (card.lessonId) {
            const moduleId = lessonToModuleMap.get(card.lessonId);
            if (moduleId) {
              const chapNum = moduleToChapterMap.get(moduleId);
              if (chapNum !== undefined) {
                chapterNumberSet.add(chapNum);
              }
            }
          }
        }

        const chapterNumbers = Array.from(chapterNumberSet).sort((a, b) => a - b);

        let title = `مرور فلش‌کارت‌های ${course.name}`;
        if (chapterNumbers.length === 1) {
          title = `مرور فلش‌کارت‌های فصل ${toPersianDigits(chapterNumbers[0])}`;
        } else if (chapterNumbers.length > 1) {
          title = `مرور فلش‌کارت‌های فصل ${chapterNumbers.map(toPersianDigits).join("، ")}`;
        }

        candidates.push({
          id: `cand:flashcards:due:${courseId}`,
          type: "review_flashcards",
          title,
          description: inExamScope
            ? `${courseDueCount} فلش‌کارت آماده مرور در محدوده امتحان دوره «${course.name}».`
            : `${courseDueCount} فلش‌کارت آماده مرور در دوره «${course.name}».`,
          priority: 1000 + courseDueCount + examUrgencyBoost,
          estimatedMinutes,
          courseId,
          metadata: {
            dueCount: courseDueCount,
            courseName: course.name,
            chapterNumbers,
            learningStage: "SRS_DUE",
            isExamRelated: Boolean(inExamScope && examInfo),
            ...(inExamScope && examInfo
              ? {
                  examDaysRemaining: examInfo.daysRemaining,
                  examCourseName: course.name,
                }
              : {}),
          },
        });
      }
    }

    // Fallback for general / unassigned due flashcards not belonging to active courses
    const remainingDueSchedules = dueSchedules.filter(
      (s) => !processedDueScheduleIds.has(s.id),
    );
    if (remainingDueSchedules.length > 0) {
      const remainingDueCount = remainingDueSchedules.length;
      const estimatedMinutes = Math.max(
        5,
        Math.min(30, Math.ceil(remainingDueCount * 0.5)),
      );

      candidates.push({
        id: `cand:flashcards:due:all`,
        type: "review_flashcards",
        title: "مرور فلش‌کارت‌های سررسیدشده",
        description: `${remainingDueCount} فلش‌کارت آماده مرور است.`,
        priority: 1000 + remainingDueCount,
        estimatedMinutes,
        metadata: {
          dueCount: remainingDueCount,
          learningStage: "SRS_DUE",
        },
      });
    }

    // -----------------------------------------------------------------------
    // B. Course-Specific Adaptive Learning Stages
    // -----------------------------------------------------------------------
    for (const course of activeCourses) {
      const courseId = course.id;
      const examInfo = upcomingExamsMap.get(courseId);
      const isExamActive = Boolean(examInfo && examInfo.daysRemaining >= 0);

      // 1. Fetch modules and published lessons in strict order (moduleOrder, lessonOrder)
      const modules = (await this.deps.moduleStore.listByCourse(courseId))
        .filter((m) => !m.deletedAt)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const moduleIds = modules.map((m) => m.id);
      const allLessons =
        moduleIds.length > 0
          ? await this.deps.lessonStore.listByModules(moduleIds)
          : [];

      const publishedLessons = allLessons
        .filter((l) => !l.deletedAt && l.publicationStatus === "published")
        .sort((a, b) => a.sortOrder - b.sortOrder);

      const moduleOrderMap = new Map(modules.map((m, idx) => [m.id, idx]));
      publishedLessons.sort((a, b) => {
        const modA = moduleOrderMap.get(a.moduleId) ?? 0;
        const modB = moduleOrderMap.get(b.moduleId) ?? 0;
        if (modA !== modB) return modA - modB;
        return a.sortOrder - b.sortOrder;
      });

      const lessonMap = new Map<string, LessonRecord>(
        publishedLessons.map((l) => [l.id, l]),
      );
      const lessonToModuleMap = new Map<string, string>(
        publishedLessons.map((l) => [l.id, l.moduleId]),
      );

      // Group published lessons by module
      const moduleToLessonsMap = new Map<string, LessonRecord[]>();
      for (const m of modules) {
        moduleToLessonsMap.set(
          m.id,
          publishedLessons.filter((l) => l.moduleId === m.id),
        );
      }

      // 2. Fetch flashcards for this course
      const courseFlashcards = (
        await this.deps.flashcardStore.listByCourse(courseId)
      ).filter((f) => !f.deletedAt);

      const flashcardsByLesson = new Map<string, FlashcardRecord[]>();
      const flashcardsByModule = new Map<string, FlashcardRecord[]>();

      for (const card of courseFlashcards) {
        if (card.lessonId) {
          const list = flashcardsByLesson.get(card.lessonId) ?? [];
          list.push(card);
          flashcardsByLesson.set(card.lessonId, list);

          const modId = lessonToModuleMap.get(card.lessonId);
          if (modId) {
            const mList = flashcardsByModule.get(modId) ?? [];
            mList.push(card);
            flashcardsByModule.set(modId, mList);
          }
        }
      }

      // Helper: evaluate flashcard completion/review state for a lesson
      const getLessonFlashcardsState = (lessonId: string) => {
        const cards = flashcardsByLesson.get(lessonId) ?? [];
        if (cards.length === 0) {
          return { count: 0, dueCount: 0, unreviewedCount: 0, isReviewed: true };
        }
        let dueCount = 0;
        let unreviewedCount = 0;
        for (const c of cards) {
          const s = userScheduleMap.get(c.id);
          if (!s || s.reviewCount === 0) {
            unreviewedCount++;
          } else if (s.dueAt && new Date(s.dueAt) <= now) {
            dueCount++;
          }
        }
        return {
          count: cards.length,
          dueCount,
          unreviewedCount,
          isReviewed: unreviewedCount === 0,
        };
      };

      // 3. Progress check for course
      const progressRecords = await this.deps.progressStore.listByUserAndCourse(
        actor.userId,
        courseId,
      );
      const progressMap = new Map(progressRecords.map((p) => [p.lessonId, p]));
      const completedLessonIds = new Set(
        progressRecords.filter((p) => p.completed).map((p) => p.lessonId),
      );
      const completedLessonsCount = publishedLessons.filter((l) =>
        completedLessonIds.has(l.id),
      ).length;
      const totalLessonsCount = publishedLessons.length;
      const courseProgressPercent =
        totalLessonsCount > 0
          ? (completedLessonsCount / totalLessonsCount) * 100
          : 0;

      // 4. Fetch published quizzes for course
      const publishedQuizzes = (
        await this.deps.quizStore.listByCourse(courseId)
      ).filter((q) => !q.deletedAt && q.status === "published");

      // In-scope module titles for exam boost check
      const inScopeModuleTitles = new Set(
        modules
          .filter((m) => examInfo?.examScope?.moduleIds?.includes(m.id))
          .map((m) => m.title.trim().toLowerCase()),
      );

      // ---------------------------------------------------------------------
      // 5. Weak Quiz Remediation Loop (Targeted Review -> Flashcards -> Retake)
      // ---------------------------------------------------------------------
      for (const quiz of publishedQuizzes) {
        const matchesTopic = Boolean(
          quiz.topic && inScopeModuleTitles.has(quiz.topic.trim().toLowerCase()),
        );
        const inExamScope = isExamActive && matchesTopic;
        const examUrgencyBoost = inExamScope
          ? getExamUrgencyPriorityBoost(examInfo!.daysRemaining)
          : 0;

        const quizAttempts = attemptsByQuiz.get(quiz.id) ?? [];
        if (quizAttempts.length === 0) continue;

        // Sort attempts ascending by date
        quizAttempts.sort((a, b) => {
          const timeA = new Date(a.completedAt || a.startedAt).getTime();
          const timeB = new Date(b.completedAt || b.startedAt).getTime();
          return timeA - timeB;
        });

        const latestAttempt = quizAttempts[quizAttempts.length - 1];
        if (latestAttempt.score < 70) {
          const lastScore = Math.round(latestAttempt.score);

          // Resolve weak lesson IDs
          let weakLessonIds: string[] = [];

          if (this.deps.quizQuestionStore) {
            const questions = await this.deps.quizQuestionStore.listByQuiz(
              quiz.id,
            );
            const wrongQuestions = questions.filter((q) => {
              const userAns = latestAttempt.answers?.[q.id];
              if (userAns === undefined) return true;
              return JSON.stringify(userAns) !== JSON.stringify(q.correctAnswer);
            });

            weakLessonIds = Array.from(
              new Set(
                wrongQuestions
                  .map((q) => q.lessonId || q.lesson?.id)
                  .filter(Boolean),
              ),
            ) as string[];
          }

          if (weakLessonIds.length === 0) {
            // Fallback to quiz topic / module matching
            const matchedMod = modules.find((m) => {
              if (
                quiz.topic &&
                m.title.trim().toLowerCase() === quiz.topic.trim().toLowerCase()
              ) {
                return true;
              }
              const modMatch = m.title.match(/(?:فصل|chapter)\s*([0-9۰-۹٠-٩]+)/i);
              const quizMatch = (quiz.topic || quiz.title).match(
                /(?:فصل|chapter)\s*([0-9۰-۹٠-٩]+)/i,
              );
              return modMatch && quizMatch && modMatch[1] === quizMatch[1];
            });

            if (matchedMod) {
              const modLessons = moduleToLessonsMap.get(matchedMod.id) ?? [];
              weakLessonIds = modLessons.map((l) => l.id);
            }
          }

          // A. Targeted Weak Lesson Review Candidates
          for (const weakLessonId of weakLessonIds) {
            const weakLesson = lessonMap.get(weakLessonId);
            if (!weakLesson) continue;

            const prog = progressMap.get(weakLessonId);
            const isRestudied =
              prog?.updatedAt &&
              new Date(prog.updatedAt) >
                new Date(latestAttempt.completedAt || latestAttempt.startedAt);

            if (!isRestudied) {
              const estimatedMinutes =
                weakLesson.estimatedMinutes && weakLesson.estimatedMinutes > 0
                  ? weakLesson.estimatedMinutes
                  : STUDY_PLANNER_CONFIG.DEFAULT_LESSON_MINUTES;

              candidates.push({
                id: `cand:lesson:targeted:${weakLesson.id}:${quiz.id}`,
                type: "read_lesson",
                title: `مرور نقاط ضعف: ${weakLesson.title}`,
                description: `مرور درسنامه به دلیل نیاز به تقویت پس از آزمون «${quiz.title}» (${lastScore}٪).`,
                priority: 800 + (100 - lastScore) + examUrgencyBoost,
                estimatedMinutes,
                courseId,
                moduleId: weakLesson.moduleId,
                lessonId: weakLesson.id,
                metadata: {
                  isTargetedReview: true,
                  lastScore,
                  quizTitle: quiz.title,
                  courseName: course.name,
                  learningStage: "TARGETED_REVIEW",
                  isExamRelated: Boolean(inExamScope && examInfo),
                  ...(inExamScope && examInfo
                    ? {
                        examDaysRemaining: examInfo.daysRemaining,
                        examCourseName: course.name,
                      }
                    : {}),
                },
              });
            }

            // B. Targeted Flashcards for Weak Scope
            const weakCards = flashcardsByLesson.get(weakLessonId) ?? [];
            if (weakCards.length > 0) {
              candidates.push({
                id: `cand:flashcards:weak:${weakLesson.id}`,
                type: "review_flashcards",
                title: `مرور فلش‌کارت‌های نقاط ضعف: ${weakLesson.title}`,
                description: `مرور فلش‌کارت‌های درس «${weakLesson.title}» پس از آزمون.`,
                priority: 780 + examUrgencyBoost,
                estimatedMinutes: 15,
                courseId,
                moduleId: weakLesson.moduleId,
                lessonId: weakLesson.id,
                metadata: {
                  isTargetedReview: true,
                  lastScore,
                  courseName: course.name,
                  learningStage: "TARGETED_FLASHCARDS",
                  isExamRelated: Boolean(inExamScope && examInfo),
                  ...(inExamScope && examInfo
                    ? {
                        examDaysRemaining: examInfo.daysRemaining,
                        examCourseName: course.name,
                      }
                    : {}),
                },
              });
            }
          }

          // C. Quiz Retake Candidate
          candidates.push({
            id: `cand:quiz:weak:${quiz.id}`,
            type: "review_wrong_answers",
            title: `مرور و آزمون مجدد: ${quiz.title}`,
            description: `عملکرد اخیر در این آزمون (${lastScore}٪) نیازمند تمرین است.`,
            priority: 750 + (100 - lastScore) + examUrgencyBoost,
            estimatedMinutes:
              STUDY_PLANNER_CONFIG.DEFAULT_WRONG_ANSWERS_MINUTES,
            courseId,
            quizId: quiz.id,
            metadata: {
              lastScore,
              quizTitle: quiz.title,
              courseName: course.name,
              learningStage: "QUIZ_RETAKE",
              isExamRelated: Boolean(inExamScope && examInfo),
              ...(inExamScope && examInfo
                ? {
                    examDaysRemaining: examInfo.daysRemaining,
                    examCourseName: course.name,
                  }
                : {}),
            },
          });
        }
      }

      // ---------------------------------------------------------------------
      // 6. New Flashcards for Studied Lessons (STUDIED Stage)
      // ---------------------------------------------------------------------
      for (const lesson of publishedLessons) {
        if (!completedLessonIds.has(lesson.id)) continue;

        const fcState = getLessonFlashcardsState(lesson.id);
        if (fcState.unreviewedCount > 0) {
          const inExamScope =
            isExamActive &&
            isResourceInExamScope(examInfo!.examScope, {
              moduleId: lesson.moduleId,
              lessonId: lesson.id,
            });
          const examUrgencyBoost = inExamScope
            ? getExamUrgencyPriorityBoost(examInfo!.daysRemaining)
            : 0;

          const estimatedMinutes = Math.max(
            5,
            Math.min(25, Math.ceil(fcState.unreviewedCount * 0.5)),
          );

          candidates.push({
            id: `cand:flashcards:new:lesson:${lesson.id}`,
            type: "review_flashcards",
            title: `مرور فلش‌کارت‌های ${lesson.title}`,
            description: `${fcState.unreviewedCount} فلش‌کارت جدید پس از مطالعه درس «${lesson.title}» آماده یادگیری است.`,
            priority: 580 + examUrgencyBoost,
            estimatedMinutes,
            courseId,
            moduleId: lesson.moduleId,
            lessonId: lesson.id,
            metadata: {
              isNewLearning: true,
              dueCount: fcState.unreviewedCount,
              courseName: course.name,
              learningStage: "STUDIED_FLASHCARDS",
              isExamRelated: Boolean(inExamScope && examInfo),
              ...(inExamScope && examInfo
                ? {
                    examDaysRemaining: examInfo.daysRemaining,
                    examCourseName: course.name,
                  }
                : {}),
            },
          });
        }
      }

      // ---------------------------------------------------------------------
      // 7. Sequential Lesson Progression (UNSEEN Stage)
      // ---------------------------------------------------------------------
      const uncompletedLessons = publishedLessons.filter(
        (l) => !completedLessonIds.has(l.id),
      );

      // Entitlement check if configured
      const eligibleUncompletedLessons: LessonRecord[] = [];
      for (const lesson of uncompletedLessons) {
        let isEntitled = true;
        if (this.deps.entitlementService) {
          const access = await this.deps.entitlementService.checkAccess(actor, {
            userId: actor.userId,
            resourceType: "lesson",
            resourceId: lesson.id,
            courseId,
          });
          isEntitled = access.granted;
        }
        if (isEntitled) {
          eligibleUncompletedLessons.push(lesson);
        }
      }

      // Generate consecutive uncompleted lessons (up to 6 to pack clean daily capacity)
      const lessonsToGenerate = eligibleUncompletedLessons.slice(0, 6);
      lessonsToGenerate.forEach((lesson, index) => {
        const isPartiallyStudied =
          index === 0 && activeLessonSessionIds.has(lesson.id);
        const estimatedMinutes =
          lesson.estimatedMinutes && lesson.estimatedMinutes > 0
            ? lesson.estimatedMinutes
            : STUDY_PLANNER_CONFIG.DEFAULT_LESSON_MINUTES;

        const inExamScope =
          isExamActive &&
          isResourceInExamScope(examInfo!.examScope, {
            moduleId: lesson.moduleId,
            lessonId: lesson.id,
          });

        const examUrgencyBoost = inExamScope
          ? getExamUrgencyPriorityBoost(examInfo!.daysRemaining)
          : 0;

        const baseLessonPriority = isPartiallyStudied
          ? 600
          : Math.max(400, 500 - index * 10);
        const priority = baseLessonPriority + examUrgencyBoost;

        candidates.push({
          id: `cand:lesson:${lesson.id}`,
          type: "read_lesson",
          title: isPartiallyStudied
            ? `ادامه مطالعه: ${lesson.title}`
            : `مطالعه درس: ${lesson.title}`,
          description: inExamScope
            ? `درس در محدوده امتحان دوره «${course.name}».`
            : `درس در دوره «${course.name}».`,
          priority,
          estimatedMinutes,
          courseId,
          moduleId: lesson.moduleId,
          lessonId: lesson.id,
          metadata: {
            isPartiallyStudied,
            courseName: course.name,
            learningStage: "UNSEEN",
            isExamRelated: Boolean(inExamScope && examInfo),
            ...(inExamScope && examInfo
              ? {
                  examDaysRemaining: examInfo.daysRemaining,
                  examCourseName: course.name,
                }
              : {}),
          },
        });
      });

      // ---------------------------------------------------------------------
      // 8. Staged Quiz Unlocking (Short Topic Quizzes & Comprehensive Quizzes)
      // ---------------------------------------------------------------------
      for (const quiz of publishedQuizzes) {
        const quizAttempts = attemptsByQuiz.get(quiz.id) ?? [];
        const hasPassed = quizAttempts.some((a) => a.score >= 70);
        const latestAttempt =
          quizAttempts.length > 0
            ? quizAttempts[quizAttempts.length - 1]
            : null;
        const isWeak = latestAttempt !== null && latestAttempt.score < 70;

        // If passed with >= 70% or already weak (handled in Stage 5), skip fresh proposal
        if (hasPassed || isWeak) {
          continue;
        }

        // Resolve quiz scope
        let coveredLessons: LessonRecord[] = [];
        let isComprehensive = false;

        if (this.deps.quizQuestionStore) {
          const questions = await this.deps.quizQuestionStore.listByQuiz(
            quiz.id,
          );
          const qLessonIds = Array.from(
            new Set(
              questions.map((q) => q.lessonId || q.lesson?.id).filter(Boolean),
            ),
          ) as string[];

          if (qLessonIds.length > 0) {
            coveredLessons = publishedLessons.filter((l) =>
              qLessonIds.includes(l.id),
            );
            const distinctModules = new Set(
              coveredLessons.map((l) => l.moduleId),
            );
            if (distinctModules.size > 1) {
              isComprehensive = true;
            }
          }
        }

        if (coveredLessons.length === 0) {
          // Check matching module by topic or title
          const matchedMod = modules.find((m) => {
            if (
              quiz.topic &&
              m.title.trim().toLowerCase() === quiz.topic.trim().toLowerCase()
            ) {
              return true;
            }
            const modMatch = m.title.match(/(?:فصل|chapter)\s*([0-9۰-۹٠-٩]+)/i);
            const quizMatch = (quiz.topic || quiz.title).match(
              /(?:فصل|chapter)\s*([0-9۰-۹٠-٩]+)/i,
            );
            return Boolean(
              modMatch && quizMatch && modMatch[1] === quizMatch[1],
            );
          });

          if (matchedMod) {
            coveredLessons = moduleToLessonsMap.get(matchedMod.id) ?? [];
          } else if (
            publishedLessons.length > 0 &&
            (quiz.title.includes("جامع") || !quiz.topic || modules.length > 1)
          ) {
            isComprehensive = true;
            coveredLessons = publishedLessons;
          } else {
            coveredLessons = publishedLessons;
          }
        }

        const matchesTopic = Boolean(
          quiz.topic && inScopeModuleTitles.has(quiz.topic.trim().toLowerCase()),
        );
        const inExamScope = isExamActive && matchesTopic;
        const examUrgencyBoost = inExamScope
          ? getExamUrgencyPriorityBoost(examInfo!.daysRemaining)
          : 0;

        if (isComprehensive) {
          // Comprehensive Quiz Progression check:
          // Unlocks when courseProgressPercent >= 50 or when course has 0 lessons
          const isEligible =
            publishedLessons.length === 0 || courseProgressPercent >= 50;

          if (isEligible) {
            candidates.push({
              id: `cand:quiz:comprehensive:${quiz.id}`,
              type: "take_quiz",
              title: `حل آزمون: ${quiz.title}`,
              description: inExamScope
                ? `آزمون جامع در محدوده امتحان دوره «${course.name}».`
                : `آزمون جامع در دوره «${course.name}».`,
              priority: 320 + examUrgencyBoost,
              estimatedMinutes: STUDY_PLANNER_CONFIG.DEFAULT_QUIZ_MINUTES,
              courseId,
              quizId: quiz.id,
              metadata: {
                quizTitle: quiz.title,
                courseName: course.name,
                learningStage: "COMPREHENSIVE_QUIZ",
                isExamRelated: Boolean(inExamScope && examInfo),
                ...(inExamScope && examInfo
                  ? {
                      examDaysRemaining: examInfo.daysRemaining,
                      examCourseName: course.name,
                    }
                  : {}),
              },
            });
          }
        } else {
          // Single Topic / Module Short Quiz Prerequisite check:
          // 1. All covered lessons must be completed
          // 2. All flashcards for covered lessons must be reviewed
          const isLessonsCompleted =
            publishedLessons.length === 0 ||
            (coveredLessons.length > 0 &&
              coveredLessons.every((l) => completedLessonIds.has(l.id)));

          const isFlashcardsReviewed =
            publishedLessons.length === 0 ||
            (coveredLessons.length > 0 &&
              coveredLessons.every(
                (l) => getLessonFlashcardsState(l.id).isReviewed,
              ));

          const isEligible = isLessonsCompleted && isFlashcardsReviewed;

          if (isEligible) {
            candidates.push({
              id: `cand:quiz:new:${quiz.id}`,
              type: "take_quiz",
              title: `حل آزمون: ${quiz.title}`,
              description: inExamScope
                ? `آزمون مبحثی در محدوده امتحان دوره «${course.name}».`
                : `آزمون مبحثی در دوره «${course.name}».`,
              priority: (publishedLessons.length === 0 ? 300 : 350) + examUrgencyBoost,
              estimatedMinutes: STUDY_PLANNER_CONFIG.DEFAULT_QUIZ_MINUTES,
              courseId,
              quizId: quiz.id,
              metadata: {
                quizTitle: quiz.title,
                courseName: course.name,
                learningStage: "SHORT_QUIZ",
                isExamRelated: Boolean(inExamScope && examInfo),
                ...(inExamScope && examInfo
                  ? {
                      examDaysRemaining: examInfo.daysRemaining,
                      examCourseName: course.name,
                    }
                  : {}),
              },
            });
          }
        }
      }
    }

    return candidates;
  }
}
