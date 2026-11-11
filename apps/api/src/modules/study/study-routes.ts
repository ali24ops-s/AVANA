/**
 * Study HTTP routes (PR6-7) — Student-facing study consumption & analytics.
 *
 * Endpoints (both organization-scoped and direct course-scoped):
 *   GET  .../flashcards
 *        → list all flashcards for a course + due count
 *   GET  .../flashcards/review-queue
 *        → list due flashcards for spaced-repetition review
 *   POST .../flashcards/:flashcardId/review
 *        → submit review rating (again/hard/good/easy) → advances schedule
 *   GET  .../quizzes
 *        → list published quizzes for a course
 *   GET  .../quizzes/:quizId
 *        → get quiz details and questions for attempt
 *   POST .../quizzes/:quizId/attempts
 *        → submit quiz answers, score attempt, return results
 *   GET  .../quizzes/:quizId/attempts/:attemptId
 *        → get specific quiz attempt results
 *   GET  .../study/analytics (and .../study-analytics)
 *        → aggregated study metrics (progress, mastery, weak areas)
 *   GET  .../study/recommendations
 *        → actionable next steps derived from study data
 */

import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type Role,
  type CourseId,
  type ModuleId,
  type LessonId,
  type DocumentId,
  type FlashcardRating,
  type OrganizationId,
  type FlashcardStudySessionRecord,
  type FlashcardStudySessionCardRecord,
  type StudyActivityType,
  type DailyStudyPlan,
  type StudyTask,
  type StudyTaskStatus,
  DomainError,
  defaultPolicy,
  Roles,
  isFlashcardRating,
  parseFlashcardId,
  parseQuizAttemptId,
  parseQuizId,
} from "@avana/domain";
import { StudyService } from "./study-service.js";
import { StudyPlannerService } from "./study-planner-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
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
  DailyStudyPlanStore,
} from "./study-store.js";
import type {
  ModuleStore,
  LessonStore,
  ProgressStore,
  SubCourseGroupStore,
} from "../learning/learning-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { CourseStore, CoursePublicationStore } from "../courses/course-store.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { EntitlementService } from "../commerce/entitlement-service.js";
import { AnnotationService } from "./annotation-service.js";
import { PersonalSummaryService } from "./personal-summary-service.js";
import { MindMapService } from "./mind-map-service.js";
import type {
  LessonAnnotationStore,
  ContentReportStore,
} from "./annotation-store.js";
import type {
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  CreateContentReportRequest,
  StudyTaskResource,
  DailyStudyPlanResource,
} from "@avana/contracts";

export interface StudyRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  organizationStore?: OrganizationStore;
  courseStore?: CourseStore;
  flashcardStore: FlashcardStore;
  flashcardReviewStore: FlashcardReviewStore;
  userFlashcardScheduleStore?: UserFlashcardScheduleStore;
  quizStore: QuizStore;
  quizQuestionStore: QuizQuestionStore;
  quizAttemptStore: QuizAttemptStore;
  moduleStore: ModuleStore;
  lessonStore: LessonStore;
  progressStore: ProgressStore;
  auditService?: AuditService;
  systemOrganizationId?: OrganizationId;
  studySessionStore?: StudySessionStore;
  flashcardStudySessionStore?: FlashcardStudySessionStore;
  entitlementService?: EntitlementService;
  studyService?: StudyService;
  subCourseGroupStore?: SubCourseGroupStore;
  annotationStore?: LessonAnnotationStore;
  reportStore?: ContentReportStore;
  annotationService?: AnnotationService;
  dailyPlanStore?: DailyStudyPlanStore;
  studyPlannerService?: StudyPlannerService;
  coursePublicationStore?: CoursePublicationStore;
  personalSummaryService?: PersonalSummaryService;
  mindMapService?: MindMapService;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const studyRoutes: FastifyPluginAsync<StudyRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    organizationStore,
    courseStore,
    flashcardStore,
    flashcardReviewStore,
    userFlashcardScheduleStore,
    quizStore,
    quizQuestionStore,
    quizAttemptStore,
    moduleStore,
    lessonStore,
    progressStore,
    auditService,
    systemOrganizationId,
    studySessionStore,
    flashcardStudySessionStore,
    entitlementService,
    studyService,
    subCourseGroupStore,
    annotationStore,
    reportStore,
    annotationService: customAnnotationService,
    dailyPlanStore,
    studyPlannerService,
    coursePublicationStore,
    personalSummaryService,
    mindMapService,
  } = opts;

  const { requireAuth, requireRole } = makeAuthMiddleware({ sessionService, userStore });
  const service =
    studyService ??
    new StudyService(
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      defaultPolicy,
      auditService,
      organizationStore,
      userFlashcardScheduleStore,
      courseStore,
      systemOrganizationId,
      studySessionStore,
      flashcardStudySessionStore,
      entitlementService,
      subCourseGroupStore,
      coursePublicationStore,
    );

  const plannerService =
    studyPlannerService ??
    (dailyPlanStore &&
    userFlashcardScheduleStore &&
    courseStore
      ? new StudyPlannerService({
          dailyPlanStore,
          userFlashcardScheduleStore,
          flashcardStore,
          progressStore,
          lessonStore,
          moduleStore,
          courseStore,
          quizStore,
          quizAttemptStore,
          quizQuestionStore,
          studySessionStore,
          entitlementService,
          systemOrganizationId,
        })
      : undefined);

  const getPlannerService = () => {
    if (!plannerService) {
      throw new DomainError("bad_request", "Study planner service not configured");
    }
    return plannerService;
  };

  const annotationService =
    customAnnotationService ??
    (annotationStore &&
    reportStore &&
    courseStore &&
    organizationStore
      ? new AnnotationService(
          annotationStore,
          reportStore,
          lessonStore,
          moduleStore,
          courseStore,
          organizationStore,
          defaultPolicy,
          systemOrganizationId,
        )
      : undefined);

  /** Helper to extract actor from authenticated request. */
  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: { userId: string; email: string; role: string; globalRole?: string | null };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: reqAny.user.userId as Actor["userId"],
      role: reqAny.user.role as Actor["role"],
      globalRole: (reqAny.user.globalRole as Role) ?? null,
    };
  }

  /** Helper to validate and extract course ID from params. */
  function getCourseId(params: { courseId: string }): CourseId {
    if (!params.courseId || !UUID_RE.test(params.courseId)) {
      throw new DomainError("bad_request", "Invalid course ID");
    }
    return params.courseId as CourseId;
  }

  /** Helper to resolve organization ID from params or course store. */
  async function resolveOrganizationId(
    actor: Actor,
    params: { organizationId?: string; courseId?: string },
  ): Promise<OrganizationId> {
    if (params.organizationId && UUID_RE.test(params.organizationId)) {
      return params.organizationId as OrganizationId;
    }
    if (courseStore && params.courseId) {
      const course = await courseStore.findByIdForUser(
        params.courseId as CourseId,
        actor.userId,
        systemOrganizationId,
      );
      if (course) {
        return course.organizationId;
      }
    }
    if (params.organizationId) {
      if (!UUID_RE.test(params.organizationId)) {
        throw new DomainError("bad_request", "Invalid organization ID");
      }
      return params.organizationId as OrganizationId;
    }
    throw new DomainError("bad_request", "Organization ID required");
  }

  function formatFlashcardStudySession(s: FlashcardStudySessionRecord) {
    return {
      id: s.id,
      user_id: s.userId,
      organization_id: s.organizationId,
      course_id: s.courseId ?? null,
      title: s.title,
      mode: s.mode,
      custom_mode: s.customMode ?? null,
      status: s.status,
      total_cards: s.totalCards,
      completed_cards: s.completedCards,
      current_index: s.currentIndex,
      current_card_id: s.currentCardId ?? null,
      started_at: s.startedAt,
      last_activity_at: s.lastActivityAt,
      completed_at: s.completedAt ?? null,
    };
  }

  function formatFlashcardStudySessionCard(sc: FlashcardStudySessionCardRecord) {
    return {
      id: sc.id,
      session_id: sc.sessionId,
      flashcard_id: sc.flashcardId ?? null,
      sort_order: sc.sortOrder,
      status: sc.status,
      rating: sc.rating ?? null,
      reviewed_at: sc.reviewedAt ?? null,
    };
  }

  function formatFlashcardResource(f: FlashcardRecord) {
    return {
      id: f.id,
      organization_id: f.organizationId,
      course_id: f.courseId,
      document_id: f.documentId,
      generated_content_id: f.generatedContentId ?? null,
      question: f.question,
      answer: f.answer,
      explanation: f.explanation ?? null,
      card_type: f.cardType ?? "definition",
      difficulty: f.difficulty ?? "medium",
      due_at: f.dueAt,
      interval_days: f.intervalDays,
      ease_factor: f.easeFactor,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
    };
  }

  // -------------------------------------------------------------------------
  // 1. Flashcard Summary Handler
  // -------------------------------------------------------------------------
  const handleGetFlashcardSummary = async (request: unknown) => {
    const req = request as { params: { organizationId: string }; id: string };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    if (
      flashcardStore.getCardCountsByCourseLesson &&
      userFlashcardScheduleStore?.getUserScheduleAggregates
    ) {
      const [cardCounts, scheduleAggregates, coursesInfo] = await Promise.all([
        flashcardStore.getCardCountsByCourseLesson(organizationId, systemOrganizationId),
        userFlashcardScheduleStore.getUserScheduleAggregates(actor.userId),
        courseStore?.listByOrganization(organizationId, actor.userId, systemOrganizationId) || Promise.resolve([]),
      ]);

      const courseModulesList = await Promise.all(
        coursesInfo.map((c) => moduleStore.listByCourse(c.id as CourseId)),
      );
      const allModuleIds = courseModulesList.flat().map((m) => m.id);
      const allLessons = allModuleIds.length > 0 ? await lessonStore.listByModules(allModuleIds) : [];

      const scheduleAggMap = new Map<
        string,
        {
          dueCards: number;
          overdueCards: number;
          learningCards: number;
          reviewedCards: number;
        }
      >();
      for (const s of scheduleAggregates) {
        const key = `${s.courseId}:${s.lessonId ?? ""}:${s.documentId ?? ""}`;
        scheduleAggMap.set(key, s);
      }

      let totalDue = 0;
      let totalOverdue = 0;
      let totalNew = 0;
      let totalLearning = 0;
      let totalCards = 0;

      const validCourseSummaries = [];

      for (let i = 0; i < coursesInfo.length; i++) {
        const course = coursesInfo[i];
        const courseModules = courseModulesList[i];
        const courseLessons = allLessons.filter((l) =>
          courseModules.some((m) => m.id === l.moduleId),
        );

        const lessonToModuleMap = new Map<string, string>();
        const lessonMap = new Map<
          string,
          {
            lesson_id: string;
            title: string;
            total_cards: number;
            due_cards: number;
            new_cards: number;
            learning_cards: number;
            overdue_cards: number;
          }
        >();

        for (const les of courseLessons) {
          lessonToModuleMap.set(les.id, les.moduleId);
          lessonMap.set(les.id, {
            lesson_id: les.id,
            title: les.title,
            total_cards: 0,
            due_cards: 0,
            new_cards: 0,
            learning_cards: 0,
            overdue_cards: 0,
          });
        }

        const docToModuleMap = new Map<string, string>();
        const moduleStatsMap = new Map<
          string,
          {
            module_id: string;
            title: string;
            total_cards: number;
            due_cards: number;
            new_cards: number;
            learning_cards: number;
            overdue_cards: number;
          }
        >();

        for (const m of courseModules) {
          if (m.documentId) {
            docToModuleMap.set(m.documentId, m.id);
          }
          moduleStatsMap.set(m.id, {
            module_id: m.id,
            title: m.title,
            total_cards: 0,
            due_cards: 0,
            new_cards: 0,
            learning_cards: 0,
            overdue_cards: 0,
          });
        }

        let cTotal = 0, cDue = 0, cOverdue = 0, cNew = 0, cLearning = 0;

        const courseCardCounts = cardCounts.filter((c) => c.courseId === course.id);

        for (const countRow of courseCardCounts) {
          let targetModuleId: string | null = null;
          const matchedLessonId: string | null = countRow.lessonId ?? null;
          if (matchedLessonId && lessonToModuleMap.has(matchedLessonId)) {
            targetModuleId = lessonToModuleMap.get(matchedLessonId)!;
          } else if (countRow.documentId && docToModuleMap.has(countRow.documentId)) {
            targetModuleId = docToModuleMap.get(countRow.documentId)!;
          } else if (courseModules.length === 1) {
            targetModuleId = courseModules[0].id;
          }

          const mStats = targetModuleId ? moduleStatsMap.get(targetModuleId) : null;
          const lStats = matchedLessonId ? lessonMap.get(matchedLessonId) : null;

          const schedKey = `${countRow.courseId}:${countRow.lessonId ?? ""}:${countRow.documentId ?? ""}`;
          const sched = scheduleAggMap.get(schedKey);

          const totalRowCards = countRow.totalCards;
          const dueCards = sched ? sched.dueCards : 0;
          const overdueCards = sched ? sched.overdueCards : 0;
          const learningCards = sched ? sched.learningCards : 0;
          const reviewedCards = sched ? sched.reviewedCards : 0;
          const newCards = Math.max(0, totalRowCards - reviewedCards);

          cTotal += totalRowCards;
          cNew += newCards;
          cDue += dueCards;
          cOverdue += overdueCards;
          cLearning += learningCards;

          if (mStats) {
            mStats.total_cards += totalRowCards;
            mStats.new_cards += newCards;
            mStats.due_cards += dueCards;
            mStats.overdue_cards += overdueCards;
            mStats.learning_cards += learningCards;
          }
          if (lStats) {
            lStats.total_cards += totalRowCards;
            lStats.new_cards += newCards;
            lStats.due_cards += dueCards;
            lStats.overdue_cards += overdueCards;
            lStats.learning_cards += learningCards;
          }
        }

        const modulesSummaries = Array.from(moduleStatsMap.values())
          .map((m) => {
            const moduleLessons = Array.from(lessonMap.values()).filter(
              (l) => lessonToModuleMap.get(l.lesson_id) === m.module_id && l.total_cards > 0,
            );
            return {
              ...m,
              lessons: moduleLessons,
            };
          })
          .filter((m) => m.total_cards > 0);

        if (cTotal > 0) {
          totalCards += cTotal;
          totalDue += cDue;
          totalOverdue += cOverdue;
          totalNew += cNew;
          totalLearning += cLearning;

          validCourseSummaries.push({
            course_id: course.id,
            title: course.name,
            total_cards: cTotal,
            due_cards: cDue,
            new_cards: cNew,
            learning_cards: cLearning,
            overdue_cards: cOverdue,
            modules: modulesSummaries,
          });
        }
      }

      return {
        request_id: req.id,
        courses: validCourseSummaries,
        total_due: totalDue,
        total_overdue: totalOverdue,
        total_new: totalNew,
        total_learning: totalLearning,
        total_cards: totalCards,
      };
    }

    // Fallback path when stores don't implement aggregation
    const [allFlashcards, userSchedules, userReviews, coursesInfo] = await Promise.all([
      flashcardStore.listByOrganization(organizationId, systemOrganizationId),
      userFlashcardScheduleStore
        ? userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
      flashcardReviewStore.listByUser(actor.userId),
      courseStore?.listByOrganization(organizationId, actor.userId, systemOrganizationId) || Promise.resolve([]),
    ]);

    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const reviewedCardIds = new Set(userReviews.map((r) => r.flashcardId));
    const now = new Date();

    let totalDue = 0;
    let totalOverdue = 0;
    let totalNew = 0;
    let totalLearning = 0;
    let totalCards = 0;

    const courseSummaries = await Promise.all(
      coursesInfo.map(async (course) => {
        const courseModules = await moduleStore.listByCourse(course.id as CourseId);
        const moduleIds = courseModules.map((m) => m.id);
        const courseLessons = await lessonStore.listByModules(moduleIds);

        const lessonToModuleMap = new Map<string, string>();
        const lessonMap = new Map<
          string,
          {
            lesson_id: string;
            title: string;
            total_cards: number;
            due_cards: number;
            new_cards: number;
            learning_cards: number;
            overdue_cards: number;
          }
        >();

        for (const les of courseLessons) {
          lessonToModuleMap.set(les.id, les.moduleId);
          lessonMap.set(les.id, {
            lesson_id: les.id,
            title: les.title,
            total_cards: 0,
            due_cards: 0,
            new_cards: 0,
            learning_cards: 0,
            overdue_cards: 0,
          });
        }

        const docToModuleMap = new Map<string, string>();
        const moduleStatsMap = new Map<
          string,
          {
            module_id: string;
            title: string;
            total_cards: number;
            due_cards: number;
            new_cards: number;
            learning_cards: number;
            overdue_cards: number;
            lessons: Array<{
              lesson_id: string;
              title: string;
              total_cards: number;
              due_cards: number;
              new_cards: number;
              learning_cards: number;
              overdue_cards: number;
            }>;
          }
        >();

        for (const m of courseModules) {
          if (m.documentId) {
            docToModuleMap.set(m.documentId, m.id);
          }
          moduleStatsMap.set(m.id, {
            module_id: m.id,
            title: m.title,
            total_cards: 0,
            due_cards: 0,
            new_cards: 0,
            learning_cards: 0,
            overdue_cards: 0,
            lessons: [] as Array<{
              lesson_id: string;
              title: string;
              total_cards: number;
              due_cards: number;
              new_cards: number;
              learning_cards: number;
              overdue_cards: number;
            }>,
          });
        }

        let cTotal = 0, cDue = 0, cOverdue = 0, cNew = 0, cLearning = 0;

        for (const f of allFlashcards) {
          if (f.courseId !== course.id) continue;

          let targetModuleId: string | null = null;
          const matchedLessonId: string | null = f.lessonId ?? null;
          if (matchedLessonId && lessonToModuleMap.has(matchedLessonId)) {
            targetModuleId = lessonToModuleMap.get(matchedLessonId)!;
          } else if (f.documentId && docToModuleMap.has(f.documentId)) {
            targetModuleId = docToModuleMap.get(f.documentId)!;
          } else if (courseModules.length === 1) {
            targetModuleId = courseModules[0].id;
          }

          const mStats = targetModuleId ? moduleStatsMap.get(targetModuleId) : null;
          const lStats = matchedLessonId ? lessonMap.get(matchedLessonId) : null;

          const schedule = scheduleMap.get(f.id);
          const isReviewed = schedule ? schedule.reviewCount > 0 : reviewedCardIds.has(f.id);
          const rawDueAt = schedule ? schedule.dueAt : f.dueAt;
          const intervalDays = schedule ? schedule.intervalDays : f.intervalDays;

          const hasDueAt = rawDueAt != null && !isNaN(new Date(rawDueAt).getTime());
          const dueAt = hasDueAt ? new Date(rawDueAt) : null;
          const isDue = isReviewed && dueAt !== null && dueAt <= now;

          cTotal += 1;
          if (mStats) mStats.total_cards += 1;
          if (lStats) lStats.total_cards += 1;

          if (!isReviewed) {
            cNew += 1;
            if (mStats) mStats.new_cards += 1;
            if (lStats) lStats.new_cards += 1;
          } else if (isDue) {
            cDue += 1;
            if (mStats) mStats.due_cards += 1;
            if (lStats) lStats.due_cards += 1;
            if (intervalDays >= 1 && dueAt !== null && now.getTime() - dueAt.getTime() > 24 * 60 * 60 * 1000) {
              cOverdue += 1;
              if (mStats) mStats.overdue_cards += 1;
              if (lStats) lStats.overdue_cards += 1;
            }
          } else if (intervalDays === 0) {
            cLearning += 1;
            if (mStats) mStats.learning_cards += 1;
            if (lStats) lStats.learning_cards += 1;
          }
        }

        const modulesSummaries = Array.from(moduleStatsMap.values())
          .map((m) => {
            const moduleLessons = Array.from(lessonMap.values()).filter(
              (l) => lessonToModuleMap.get(l.lesson_id) === m.module_id && l.total_cards > 0,
            );
            return {
              ...m,
              lessons: moduleLessons,
            };
          })
          .filter((m) => m.total_cards > 0);

        if (cTotal === 0) {
          return null;
        }

        totalCards += cTotal;
        totalDue += cDue;
        totalOverdue += cOverdue;
        totalNew += cNew;
        totalLearning += cLearning;

        return {
          course_id: course.id,
          title: course.name,
          total_cards: cTotal,
          due_cards: cDue,
          new_cards: cNew,
          learning_cards: cLearning,
          overdue_cards: cOverdue,
          modules: modulesSummaries,
        };
      }),
    );

    const validCourseSummaries = courseSummaries.filter(
      (c): c is NonNullable<typeof c> => c !== null,
    );

    return {
      request_id: req.id,
      courses: validCourseSummaries,
      total_due: totalDue,
      total_overdue: totalOverdue,
      total_new: totalNew,
      total_learning: totalLearning,
      total_cards: totalCards,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/flashcard-summary",
    { preHandler: [requireAuth] },
    handleGetFlashcardSummary,
  );

  // -------------------------------------------------------------------------
  // 2. Flashcards List Handler
  // -------------------------------------------------------------------------
  const handleListFlashcards = async (request: unknown) => {
    const req = request as {
      params: { organizationId?: string; courseId: string };
      query?: { moduleId?: string; previewSessionId?: string; limit?: string };
      id: string;
    };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const query = req.query || {};

    let targetOrgId = organizationId;
    if (courseStore) {
      const course = await courseStore.findByIdForUser(
        courseId,
        actor.userId,
        systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;
    }

    await service.authorize(actor, targetOrgId, "study:read", courseId);

    if (entitlementService) {
      const access = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: courseId,
        moduleId: (query.moduleId as ModuleId) ?? undefined,
        previewSessionId: query.previewSessionId,
      });
      if (!access.granted) {
        const previewLimit = query.limit ? parseInt(query.limit, 10) : (query.moduleId ? 15 : 5);
        const previewCards = await service.getPreviewFlashcards(actor, targetOrgId, courseId, {
          moduleId: query.moduleId,
          previewSessionId: query.previewSessionId,
          limit: previewLimit,
        });
        return {
          request_id: req.id,
          is_preview: true,
          preview_limit: previewLimit,
          preview_lesson_id: previewCards.preview_lesson_id,
          flashcards: previewCards.flashcards,
          items: previewCards.flashcards,
          next_review_count: previewCards.flashcards.length,
        };
      }
    }

    const [allFlashcards, userSchedules, userReviews] = await Promise.all([
      flashcardStore.listByCourse(courseId, targetOrgId, systemOrganizationId),
      userFlashcardScheduleStore
        ? userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
      flashcardReviewStore.listByUser(actor.userId),
    ]);
    const scheduleMap = new Map(userSchedules.map((s) => [s.flashcardId, s]));
    const reviewedCardIds = new Set(userReviews.map((r) => r.flashcardId));
    const now = new Date();
    const mappedCards = allFlashcards.map((f) => {
      const schedule = scheduleMap.get(f.id);
      if (!schedule) return f;
      return {
        ...f,
        dueAt: schedule.dueAt,
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor,
      };
    });

    const nextReviewCount = mappedCards.filter((f) => {
      if (!reviewedCardIds.has(f.id)) return false;
      if (!f.dueAt) return false;
      const dueAt = new Date(f.dueAt);
      if (isNaN(dueAt.getTime())) return false;
      return dueAt <= now;
    }).length;

    return {
      request_id: req.id,
      flashcards: mappedCards.map(formatFlashcardResource),
      items: mappedCards.map(formatFlashcardResource),
      next_review_count: nextReviewCount,
    };
  };

  const handleGetPreviewFlashcards = async (request: unknown) => {
    const req = request as {
      params: { organizationId?: string; courseId: string };
      query?: { moduleId?: string; previewSessionId?: string; limit?: string };
      id: string;
    };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const query = req.query || {};

    let targetOrgId = organizationId;
    if (courseStore) {
      const course = await courseStore.findByIdForUser(
        courseId,
        actor.userId,
        systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;
    }

    await service.authorize(actor, targetOrgId, "study:read", courseId);

    const previewLimit = query.limit ? parseInt(query.limit, 10) : (query.moduleId ? 15 : 5);
    const previewCards = await service.getPreviewFlashcards(actor, targetOrgId, courseId, {
      moduleId: query.moduleId,
      previewSessionId: query.previewSessionId,
      limit: previewLimit,
    });
    return {
      request_id: req.id,
      is_preview: true,
      preview_limit: previewLimit,
      preview_lesson_id: previewCards.preview_lesson_id,
      flashcards: previewCards.flashcards,
      items: previewCards.flashcards,
      next_review_count: previewCards.flashcards.length,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/flashcards/preview",
    { preHandler: [requireAuth] },
    handleGetPreviewFlashcards,
  );
  app.get(
    "/v1/courses/:courseId/flashcards/preview",
    { preHandler: [requireAuth] },
    handleGetPreviewFlashcards,
  );

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/flashcards",
    { preHandler: [requireAuth] },
    handleListFlashcards,
  );
  app.get(
    "/v1/courses/:courseId/flashcards",
    { preHandler: [requireAuth] },
    handleListFlashcards,
  );

  // -------------------------------------------------------------------------
  // 2. Flashcards Review Queue Handler
  // -------------------------------------------------------------------------
  const handleFlashcardReviewQueue = async (request: unknown) => {
    const req = request as { params: { organizationId?: string; courseId: string }; id: string };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);

    const dueCards = await service.listFlashcardsForReview(
      actor,
      organizationId,
      courseId,
    );

    const formatted = dueCards.map(formatFlashcardResource);
    return {
      request_id: req.id,
      due_cards: formatted,
      items: formatted,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/flashcards/review-queue",
    { preHandler: [requireAuth] },
    handleFlashcardReviewQueue,
  );
  app.get(
    "/v1/courses/:courseId/flashcards/review-queue",
    { preHandler: [requireAuth] },
    handleFlashcardReviewQueue,
  );

  // -------------------------------------------------------------------------
  // 3. Flashcards Multi-Course Review Queue Handler
  // -------------------------------------------------------------------------
  const handleFlashcardReviewQueueMulti = async (request: unknown) => {
    const req = request as { params: { organizationId: string }; query: { courseIds?: string; documentIds?: string }; id: string };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const courseIds = req.query.courseIds ? req.query.courseIds.split(",").map(id => id.trim() as CourseId) : undefined;
    const documentIds = req.query.documentIds ? req.query.documentIds.split(",").map(id => id.trim()) : undefined;

    const dueCards = await service.listFlashcardsForReviewMulti(
      actor,
      organizationId,
      courseIds,
      documentIds,
    );

    const formatted = dueCards.map(formatFlashcardResource);
    return {
      request_id: req.id,
      due_cards: formatted,
      items: formatted,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/flashcards/review-queue",
    { preHandler: [requireAuth] },
    handleFlashcardReviewQueueMulti,
  );

  // -------------------------------------------------------------------------
  // 4. Flashcards Exam Mode Queue Handler
  // -------------------------------------------------------------------------
  const handleFlashcardExamQueue = async (request: unknown) => {
    const req = request as { params: { organizationId: string }; query: { courseIds?: string; documentIds?: string; limit?: string }; id: string };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const courseIds = req.query.courseIds ? req.query.courseIds.split(",").map(id => id.trim() as CourseId) : undefined;
    const documentIds = req.query.documentIds ? req.query.documentIds.split(",").map(id => id.trim()) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;

    const dueCards = await service.getExamModeFlashcards(
      actor,
      organizationId,
      courseIds,
      limit,
      documentIds,
    );

    const formatted = dueCards.map(formatFlashcardResource);
    return {
      request_id: req.id,
      due_cards: formatted,
      items: formatted,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/flashcards/exam-queue",
    { preHandler: [requireAuth] },
    handleFlashcardExamQueue,
  );

  // -------------------------------------------------------------------------
  // 4b. Flashcards Custom Study Queue Handler
  // -------------------------------------------------------------------------
  const handleFlashcardCustomQueue = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string };
      query: {
        courseIds?: string;
        documentIds?: string;
        moduleIds?: string;
        lessonIds?: string;
        limit?: string;
        mode?: string;
        aheadDays?: string;
        onlyStudied?: string;
      };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const courseIds = req.query.courseIds ? req.query.courseIds.split(",").map(id => id.trim() as CourseId) : undefined;
    const documentIds = req.query.documentIds ? req.query.documentIds.split(",").map(id => id.trim()) : undefined;
    const moduleIds = req.query.moduleIds ? req.query.moduleIds.split(",").map(id => id.trim()) : undefined;
    const lessonIds = req.query.lessonIds ? req.query.lessonIds.split(",").map(id => id.trim()) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const aheadDays = req.query.aheadDays ? parseInt(req.query.aheadDays, 10) : 3;
    const mode = (req.query.mode || "weak") as "weak" | "forgotten" | "overdue" | "review_ahead" | "new" | "due" | "learned";
    const onlyStudied = req.query.onlyStudied !== undefined ? req.query.onlyStudied === "true" || req.query.onlyStudied === "1" : undefined;

    const result = await service.getCustomStudyFlashcardsWithMeta(
      actor,
      organizationId,
      mode,
      courseIds,
      limit,
      aheadDays,
      documentIds,
      moduleIds,
      lessonIds,
      onlyStudied,
    );

    const formatted = result.cards.map(formatFlashcardResource);
    return {
      request_id: req.id,
      due_cards: formatted,
      items: formatted,
      total_new_in_scope: result.totalNewInScope,
      learned_today: result.learnedToday,
      remaining_quota: result.remainingQuota,
      completed_lessons_count: result.completedLessonsCount,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/flashcards/custom-queue",
    { preHandler: [requireAuth] },
    handleFlashcardCustomQueue,
  );

  // -------------------------------------------------------------------------
  // 4c. Flashcard Study Sessions (Persistence & Resume) Handlers
  // -------------------------------------------------------------------------

  const handleCreateFlashcardSession = async (request: unknown, reply: { code: (c: number) => void }) => {
    const req = request as {
      params: { organizationId: string };
      body: {
        courseId?: string;
        courseIds?: string[];
        moduleIds?: string[];
        lessonIds?: string[];
        documentIds?: string[];
        mode?: "daily" | "exam" | "custom" | "normal";
        customMode?: "weak" | "forgotten" | "overdue" | "review_ahead" | "new" | "due" | "learned";
        limit?: number;
        aheadDays?: number;
        title?: string;
      };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const session = await service.createFlashcardStudySession(
      actor,
      organizationId,
      {
        courseId: req.body?.courseId as CourseId,
        courseIds: req.body?.courseIds as CourseId[],
        moduleIds: req.body?.moduleIds,
        lessonIds: req.body?.lessonIds,
        documentIds: req.body?.documentIds,
        mode: req.body?.mode,
        customMode: req.body?.customMode,
        limit: req.body?.limit,
        aheadDays: req.body?.aheadDays,
        title: req.body?.title,
      },
    );

    reply.code(201);
    return {
      request_id: req.id,
      session: formatFlashcardStudySession(session),
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/flashcard-sessions",
    { preHandler: [requireAuth] },
    (req, reply) => handleCreateFlashcardSession(req, reply),
  );

  const handleListActiveFlashcardSessions = async (request: unknown) => {
    const req = request as { params: { organizationId: string }; id: string };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const sessions = await service.listActiveFlashcardStudySessions(actor, organizationId);

    const formatted = sessions.map(formatFlashcardStudySession);
    return {
      request_id: req.id,
      sessions: formatted,
      items: formatted,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/flashcard-sessions",
    { preHandler: [requireAuth] },
    handleListActiveFlashcardSessions,
  );

  const handleGetFlashcardSessionDetail = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; sessionId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const res = await service.getFlashcardStudySession(actor, organizationId, req.params.sessionId);

    return {
      request_id: req.id,
      session: formatFlashcardStudySession(res.session),
      cards: res.cards.map(formatFlashcardResource),
      session_cards: res.sessionCards.map(formatFlashcardStudySessionCard),
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/flashcard-sessions/:sessionId",
    { preHandler: [requireAuth] },
    handleGetFlashcardSessionDetail,
  );

  const handleUpdateFlashcardSessionProgress = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; sessionId: string };
      body: {
        current_index?: number;
        completed_cards?: number;
        current_card_id?: string;
        card_id?: string;
        rating?: FlashcardRating;
        reaction_ms?: number;
      };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const session = await service.updateFlashcardStudySessionProgress(
      actor,
      organizationId,
      req.params.sessionId,
      {
        currentIndex: req.body?.current_index ?? 0,
        completedCards: req.body?.completed_cards,
        currentCardId: req.body?.current_card_id,
        cardId: req.body?.card_id,
        rating: req.body?.rating,
        reactionMs: req.body?.reaction_ms,
      },
    );

    return {
      request_id: req.id,
      session: formatFlashcardStudySession(session),
    };
  };

  app.patch(
    "/v1/organizations/:organizationId/study/flashcard-sessions/:sessionId/progress",
    { preHandler: [requireAuth] },
    handleUpdateFlashcardSessionProgress,
  );

  const handleCompleteFlashcardSession = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; sessionId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const session = await service.completeFlashcardStudySession(
      actor,
      organizationId,
      req.params.sessionId,
    );

    return {
      request_id: req.id,
      session: formatFlashcardStudySession(session),
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/flashcard-sessions/:sessionId/complete",
    { preHandler: [requireAuth] },
    handleCompleteFlashcardSession,
  );

  const handleCancelFlashcardSession = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; sessionId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });


    const session = await service.cancelFlashcardStudySession(
      actor,
      organizationId,
      req.params.sessionId,
    );

    return {
      request_id: req.id,
      session: formatFlashcardStudySession(session),
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/flashcard-sessions/:sessionId/cancel",
    { preHandler: [requireAuth] },
    handleCancelFlashcardSession,
  );

  // -------------------------------------------------------------------------
  // 5. Flashcard Review Submission Handler
  // -------------------------------------------------------------------------
  const handleSubmitFlashcardReview = async (request: unknown) => {
    const req = request as {
      params: { organizationId?: string; courseId: string; flashcardId: string };
      body: unknown;
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const flashcardId = parseFlashcardId(req.params.flashcardId, "flashcardId");

    const body = req.body as {
      rating?: string;
      reaction_ms?: number;
      is_exam_mode?: boolean;
    } | null;

    if (!body || !body.rating || !isFlashcardRating(body.rating)) {
      throw new DomainError(
        "bad_request",
        "Valid rating (again, hard, good, easy) is required",
      );
    }

    await service.submitFlashcardReview(actor, organizationId, {
      flashcardId,
      rating: body.rating as FlashcardRating,
      reactionMs: body.reaction_ms,
      isExamMode: body.is_exam_mode,
      courseId: req.params.courseId ? (req.params.courseId as any) : undefined,
    });

    return {
      request_id: req.id,
      success: true,
    };
  };

  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/flashcards/:flashcardId/review",
    { preHandler: [requireAuth] },
    handleSubmitFlashcardReview,
  );
  app.post(
    "/v1/courses/:courseId/flashcards/:flashcardId/review",
    { preHandler: [requireAuth] },
    handleSubmitFlashcardReview,
  );

  // -------------------------------------------------------------------------
  // 5b. Exam Configuration & Custom Exam Attempt Handlers
  // -------------------------------------------------------------------------
  const handleGetExamTopics = async (request: unknown) => {
    const req = request as { params: { organizationId: string }; id: string };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const summary = await service.getExamTopicSummary(actor, organizationId);

    // Format 3-level courses structure (Course -> Module -> Lesson) for complete Exam taxonomy
    const courses3Level = (summary.courses || []).map((c) => ({
      courseId: c.courseId,
      courseTitle: c.courseTitle,
      hasAccess: c.hasAccess,
      questionCount: c.questionCount,
      easyCount: c.easyCount,
      mediumCount: c.mediumCount,
      hardCount: c.hardCount,
      modules: (c.modules || []).map((m) => ({
        moduleId: m.moduleId,
        moduleTitle: m.moduleTitle,
        sortOrder: (m as { sortOrder?: number }).sortOrder ?? 0,
        questionCount: m.questionCount,
        easyCount: m.easyCount,
        mediumCount: m.mediumCount,
        hardCount: m.hardCount,
        lessons: (m.lessons || [])
          .filter((l) => l.questionCount > 0)
          .map((l) => ({
            lessonId: l.lessonId,
            lessonTitle: l.lessonTitle,
            questionCount: l.questionCount,
            easyCount: l.easyCount,
            mediumCount: l.mediumCount,
            hardCount: l.hardCount,
          })),
      })),
    }));

    return {
      request_id: req.id,
      courses: courses3Level,
      sections: summary.sections,
      topics: summary.topics,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/exams/topics",
    { preHandler: [requireAuth] },
    handleGetExamTopics,
  );

  const handleStartExamAttempt = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string };
      body: {
        sections?: string[];
        chapters?: string[];
        topics?: string[];
        questionCount?: number;
        difficulty?: string;
      };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const result = await service.startConfiguredExamAttempt(actor, organizationId, {
      sections: req.body?.sections,
      chapters: req.body?.chapters,
      topics: req.body?.topics,
      questionCount: req.body?.questionCount ?? 10,
      difficulty: req.body?.difficulty ?? "medium",
    });

    return {
      request_id: req.id,
      ...result,
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/exams/start",
    { preHandler: [requireAuth] },
    handleStartExamAttempt,
  );

  const handleGetExamAttemptDetail = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; attemptId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });
    const attemptId = parseQuizAttemptId(req.params.attemptId, "attemptId");

    const res = await service.getExamAttempt(actor, organizationId, attemptId);
    return {
      request_id: req.id,
      attempt: res.attempt,
      questions: res.questions,
      coverage: res.coverage,
      isCompleted: res.isCompleted,
      answers: res.answers ?? res.attempt.answers,
      questionResults: res.questionResults,
      correct: res.correct,
      incorrect: res.incorrect,
      unanswered: res.unanswered,
      partial: res.partial,
    };
  };

  const handleListExamHistory = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string };
      query?: { limit?: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });
    const limit = req.query?.limit ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : 50;

    const result = await service.listExamHistory(actor, organizationId, limit);
    return {
      request_id: req.id,
      ...result,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/exams/history",
    { preHandler: [requireAuth] },
    handleListExamHistory,
  );

  const handleHideExamHistory = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; attemptId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });
    const attemptId = parseQuizAttemptId(req.params.attemptId, "attemptId");

    const result = await service.hideExamAttemptFromHistory(actor, organizationId, attemptId);
    return {
      request_id: req.id,
      ...result,
    };
  };

  app.delete(
    "/v1/organizations/:organizationId/study/exams/history/:attemptId",
    { preHandler: [requireAuth] },
    handleHideExamHistory,
  );

  app.get(
    "/v1/organizations/:organizationId/study/exams/attempts/:attemptId",
    { preHandler: [requireAuth] },
    handleGetExamAttemptDetail,
  );

  const handleSaveExamAttemptAnswers = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; attemptId: string };
      body: {
        answers?: Array<{
          questionId?: string;
          answer?: unknown;
          selectedChoice?: unknown;
          revision?: number;
          clientUpdatedAt?: string;
        }>;
        elapsedSeconds?: number;
      };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });
    const attemptId = parseQuizAttemptId(req.params.attemptId, "attemptId");

    const answersInput = Array.isArray(req.body?.answers) ? req.body.answers : [];
    if (!req.body || (!Array.isArray(req.body.answers) && typeof req.body.elapsedSeconds !== "number")) {
      throw new DomainError("bad_request", "Answers array or elapsedSeconds is required");
    }

    const formattedAnswers = answersInput.map((a) => {
      if (!a.questionId) {
        throw new DomainError("bad_request", "questionId is required in answers");
      }
      return {
        questionId: a.questionId,
        answer: a.answer ?? a.selectedChoice,
        revision: typeof a.revision === "number" ? a.revision : undefined,
        clientUpdatedAt: typeof a.clientUpdatedAt === "string" ? a.clientUpdatedAt : undefined,
      };
    });

    const elapsedSeconds =
      typeof req.body?.elapsedSeconds === "number" && req.body.elapsedSeconds >= 0
        ? req.body.elapsedSeconds
        : undefined;

    const res = await service.saveExamAttemptAnswer(
      actor,
      organizationId,
      attemptId,
      formattedAnswers,
      elapsedSeconds,
    );

    return {
      request_id: req.id,
      success: true,
      acknowledged: res.acknowledged,
      answers: res.answers,
      elapsedSeconds: res.elapsedSeconds,
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/exams/attempts/:attemptId/answers",
    { preHandler: [requireAuth] },
    handleSaveExamAttemptAnswers,
  );

  const handleSubmitExamAttempt = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; attemptId: string };
      body: {
        answers?: Array<{ questionId?: string; answer?: unknown; selectedChoice?: unknown }>;
        elapsedSeconds?: number;
      };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });
    const attemptId = parseQuizAttemptId(req.params.attemptId, "attemptId");

    if (!req.body || !Array.isArray(req.body.answers)) {
      throw new DomainError("bad_request", "Answers array is required");
    }

    const formattedAnswers = req.body.answers.map((a) => {
      if (!a.questionId) {
        throw new DomainError("bad_request", "questionId is required in answers");
      }
      return {
        questionId: a.questionId,
        answer: a.answer ?? a.selectedChoice,
      };
    });

    const elapsedSeconds =
      typeof req.body?.elapsedSeconds === "number" && req.body.elapsedSeconds >= 0
        ? req.body.elapsedSeconds
        : undefined;

    const result = await service.submitConfiguredExamAttempt(
      actor,
      organizationId,
      attemptId,
      formattedAnswers,
      elapsedSeconds,
    );

    const scorePct = result.score;
    const passed = scorePct >= 60;

    return {
      request_id: req.id,
      attempt: {
        id: result.attemptId,
        score: result.score,
        correct: result.correct,
        total: result.total,
        answers: result.answers,
        completedAt: result.completedAt,
      },
      attemptId: result.attemptId,
      score: result.score,
      correct: result.correct,
      incorrect: result.incorrect,
      unanswered: result.unanswered,
      partial: result.partial,
      total: result.total,
      passed,
      completedAt: result.completedAt,
      answers: result.answers,
      questionResults: result.questionResults,
      questions: result.questions,
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/exams/attempts/:attemptId/submit",
    { preHandler: [requireAuth] },
    handleSubmitExamAttempt,
  );

  const handleRetakeExamAttempt = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; attemptId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });
    const attemptId = parseQuizAttemptId(req.params.attemptId, "attemptId");

    const result = await service.retakeExamAttempt(actor, organizationId, attemptId);
    return {
      request_id: req.id,
      ...result,
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/exams/attempts/:attemptId/retake",
    { preHandler: [requireAuth] },
    handleRetakeExamAttempt,
  );

  // -------------------------------------------------------------------------
  // 6. Quizzes List Handler
  // -------------------------------------------------------------------------
  const handleListQuizzes = async (request: unknown) => {
    const req = request as {
      params: { organizationId?: string; courseId: string };
      query?: { limit?: string; offset?: string };
      id: string;
    };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const limit = req.query?.limit ? Math.max(1, Math.min(100, parseInt(req.query.limit, 10))) : 15;
    const offset = req.query?.offset ? Math.max(0, parseInt(req.query.offset, 10)) : 0;

    let targetOrgId = organizationId;
    if (courseStore) {
      const course = await courseStore.findByIdForUser(
        courseId,
        actor.userId,
        systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;
    }

    if (entitlementService) {
      const access = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: courseId,
      });
      if (!access.granted) {
        const preview = await service.getPreviewQuiz(actor, targetOrgId, courseId);
        const previewItems = preview.quiz ? [{
          ...preview.quiz,
          question_count: preview.quiz.questions.length,
          questions: preview.quiz.questions.map((qn) => ({
            ...qn,
            question_type: qn.questionType,
          })),
        }] : [];
        return {
          request_id: req.id,
          is_preview: true,
          preview_limit: 5,
          quizzes: previewItems,
          items: previewItems,
          total: previewItems.length,
          limit,
          offset,
          has_more: false,
        };
      }
    }

    const result = await service.listQuizzes(
      actor,
      targetOrgId,
      courseId,
      { limit, offset },
    );

    const formattedQuizzes = result.items.map((q) => ({
      id: q.id,
      organization_id: q.organizationId,
      course_id: q.courseId,
      document_id: q.documentId,
      title: q.title,
      topic: q.topic,
      difficulty: q.difficulty,
      status: q.status,
      question_count: q.question_count ?? q.questionCount ?? 0,
      created_at: q.createdAt,
      updated_at: q.updatedAt,
    }));

    return {
      request_id: req.id,
      quizzes: formattedQuizzes,
      items: formattedQuizzes,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      has_more: result.has_more,
    };
  };

  const handleGetPreviewQuiz = async (request: unknown) => {
    const req = request as {
      params: { organizationId?: string; courseId: string };
      query?: { moduleId?: string; previewLessonId?: string; previewSessionId?: string; limit?: string };
      id: string;
    };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const query = req.query || {};
    const limit = query.limit ? parseInt(query.limit, 10) : 5;

    const preview = await service.getPreviewQuiz(actor, organizationId, courseId, {
      moduleId: query.moduleId,
      previewLessonId: query.previewLessonId,
      previewSessionId: query.previewSessionId,
      limit,
    });
    return {
      request_id: req.id,
      is_preview: true,
      preview_limit: limit,
      preview_lesson_id: preview.preview_lesson_id,
      quiz: preview.quiz ? {
        ...preview.quiz,
        questions: preview.quiz.questions.map((qn) => ({
          ...qn,
          question_type: qn.questionType,
        })),
      } : null,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/quizzes/preview",
    { preHandler: [requireAuth] },
    handleGetPreviewQuiz,
  );
  app.get(
    "/v1/courses/:courseId/quizzes/preview",
    { preHandler: [requireAuth] },
    handleGetPreviewQuiz,
  );

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/quizzes",
    { preHandler: [requireAuth] },
    handleListQuizzes,
  );
  app.get(
    "/v1/courses/:courseId/quizzes",
    { preHandler: [requireAuth] },
    handleListQuizzes,
  );

  // -------------------------------------------------------------------------
  // 7. Quiz Detail Handler
  // -------------------------------------------------------------------------
  const handleGetQuiz = async (request: unknown) => {
    const req = request as {
      params: { organizationId?: string; courseId: string; quizId: string };
      query?: { moduleId?: string; previewLessonId?: string; previewSessionId?: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const quizId = parseQuizId(req.params.quizId, "quizId");
    const query = req.query || {};

    let targetOrgId = organizationId;
    if (courseStore && req.params.courseId) {
      const course = await courseStore.findByIdForUser(
        req.params.courseId as CourseId,
        actor.userId,
        systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;
    }

    const quiz = await service.getQuizForAttempt(
      actor,
      targetOrgId,
      quizId,
      {
        moduleId: query.moduleId,
        previewLessonId: query.previewLessonId,
        previewSessionId: query.previewSessionId,
      },
    );

    return {
      request_id: req.id,
      quiz: {
        ...quiz,
        questions: quiz.questions.map((qn) => ({
          ...qn,
          question_type: qn.questionType,
        })),
      },
    };
  };

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId",
    { preHandler: [requireAuth] },
    handleGetQuiz,
  );
  app.get(
    "/v1/courses/:courseId/quizzes/:quizId",
    { preHandler: [requireAuth] },
    handleGetQuiz,
  );

  // -------------------------------------------------------------------------
  // 8. Submit Quiz Attempt Handler
  // -------------------------------------------------------------------------
  const handleSubmitQuizAttempt = async (request: unknown, reply: { code: (c: number) => void }) => {
    const req = request as {
      params: { organizationId?: string; courseId: string; quizId: string };
      body: unknown;
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const quizId = parseQuizId(req.params.quizId, "quizId");

    const body = req.body as {
      answers?: Array<{ questionId?: string; answer?: unknown; selectedChoice?: unknown }>;
      questionIds?: string[];
    } | null;

    if (!body || !Array.isArray(body.answers)) {
      throw new DomainError("bad_request", "Answers array is required");
    }

    const formattedAnswers = body.answers.map((a) => {
      if (!a.questionId) {
        throw new DomainError("bad_request", "questionId is required in answers");
      }
      return {
        questionId: a.questionId,
        answer: a.answer ?? a.selectedChoice,
      };
    });

    if (body.questionIds !== undefined && !Array.isArray(body.questionIds)) {
      throw new DomainError("bad_request", "questionIds must be an array of strings");
    }

    const attempt = await service.submitQuizAttempt(actor, organizationId, {
      quizId,
      answers: formattedAnswers,
      questionIds: body.questionIds !== undefined ? body.questionIds : undefined,
    });

    if (!req.params.organizationId) {
      reply.code(201);
    } else {
      reply.code(200);
    }
    const passed =
      attempt.score >= 50 ||
      (formattedAnswers.length > 0 && attempt.correct === formattedAnswers.length);

    return {
      request_id: req.id,
      attempt,
      attempt_id: (attempt as { attemptId?: string; id?: string }).attemptId || (attempt as { attemptId?: string; id?: string }).id,
      score: attempt.correct,
      score_percent: attempt.score,
      maxScore: formattedAnswers.length,
      passed,
      correct_count: attempt.correct,
      incorrect_count: attempt.incorrect,
      answers: attempt.answers,
      questionResults: attempt.questionResults,
      questions: attempt.questions,
    };
  };

  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId/attempts",
    { preHandler: [requireAuth] },
    (req, reply) => handleSubmitQuizAttempt(req, reply),
  );
  app.post(
    "/v1/courses/:courseId/quizzes/:quizId/attempts",
    { preHandler: [requireAuth] },
    (req, reply) => handleSubmitQuizAttempt(req, reply),
  );

  // -------------------------------------------------------------------------
  // 9. Get Quiz Attempt Handler
  // -------------------------------------------------------------------------
  const handleGetQuizAttempt = async (request: unknown) => {
    const req = request as {
      params: {
        organizationId?: string;
        courseId: string;
        quizId: string;
        attemptId: string;
      };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const attemptId = parseQuizAttemptId(req.params.attemptId, "attemptId");

    const attempt = await service.getQuizAttempt(
      actor,
      organizationId,
      attemptId,
    );

    return {
      request_id: req.id,
      attempt,
      answers: attempt.answers,
      questions: attempt.questions,
      questionResults: attempt.questionResults,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId/attempts/:attemptId",
    { preHandler: [requireAuth] },
    handleGetQuizAttempt,
  );
  app.get(
    "/v1/courses/:courseId/quizzes/:quizId/attempts/:attemptId",
    { preHandler: [requireAuth] },
    handleGetQuizAttempt,
  );

  // -------------------------------------------------------------------------
  // 10. Study Analytics Handler
  // -------------------------------------------------------------------------
  const handleGetStudyAnalytics = async (request: unknown) => {
    const req = request as { params: { organizationId?: string; courseId: string }; id: string };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);

    const analytics = await service.getStudyAnalytics(
      actor,
      organizationId,
      courseId,
    );

    return {
      request_id: req.id,
      analytics,
      summary: analytics,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/study/analytics",
    { preHandler: [requireAuth] },
    handleGetStudyAnalytics,
  );
  app.get(
    "/v1/courses/:courseId/study-analytics",
    { preHandler: [requireAuth] },
    handleGetStudyAnalytics,
  );
  app.get(
    "/v1/courses/:courseId/study/analytics",
    { preHandler: [requireAuth] },
    handleGetStudyAnalytics,
  );

  // -------------------------------------------------------------------------
  // 11. Study Recommendations Handler
  // -------------------------------------------------------------------------
  const handleGetStudyRecommendations = async (request: unknown) => {
    const req = request as { params: { organizationId?: string; courseId: string }; id: string };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);

    const recommendations = await service.getStudyRecommendations(
      actor,
      organizationId,
      courseId,
    );

    return {
      request_id: req.id,
      recommendations,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/study/recommendations",
    { preHandler: [requireAuth] },
    handleGetStudyRecommendations,
  );
  app.get(
    "/v1/courses/:courseId/study/recommendations",
    { preHandler: [requireAuth] },
    handleGetStudyRecommendations,
  );

  // -------------------------------------------------------------------------
  // 12. Delete Flashcards by Document Handler
  // -------------------------------------------------------------------------
  const handleDeleteFlashcardsByDocument = async (
    request: unknown,
    reply: { code: (c: number) => void },
  ) => {
    const req = request as {
      params: { organizationId?: string; courseId?: string; documentId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const documentId = req.params.documentId;

    await service.authorize(actor, organizationId, "study:read");
    await flashcardStore.deleteByDocument(documentId as DocumentId, organizationId);
    service.invalidateFlashcardSummaryCache(organizationId);

    reply.code(204);
    return;
  };

  app.delete(
    "/v1/organizations/:organizationId/courses/:courseId/documents/:documentId/flashcards",
    { preHandler: [requireAuth] },
    handleDeleteFlashcardsByDocument,
  );
  app.delete(
    "/v1/organizations/:organizationId/documents/:documentId/flashcards",
    { preHandler: [requireAuth] },
    handleDeleteFlashcardsByDocument,
  );

  // -------------------------------------------------------------------------
  // 13. Delete Quizzes by Document Handler
  // -------------------------------------------------------------------------
  const handleDeleteQuizzesByDocument = async (
    request: unknown,
    reply: { code: (c: number) => void },
  ) => {
    const req = request as {
      params: { organizationId?: string; courseId?: string; documentId: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const documentId = req.params.documentId;

    await service.authorize(actor, organizationId, "study:read");
    await quizStore.deleteByDocument(documentId as DocumentId, organizationId);
    service.invalidateTopicSummaryCache(organizationId);

    reply.code(204);
    return;
  };

  app.delete(
    "/v1/organizations/:organizationId/courses/:courseId/documents/:documentId/quizzes",
    { preHandler: [requireAuth] },
    handleDeleteQuizzesByDocument,
  );
  app.delete(
    "/v1/organizations/:organizationId/documents/:documentId/quizzes",
    { preHandler: [requireAuth] },
    handleDeleteQuizzesByDocument,
  );

  // -------------------------------------------------------------------------
  // 14. Study Sessions & Active Time Tracking Handlers (PR6-10)
  // -------------------------------------------------------------------------

  /**
   * POST /v1/study-sessions/start
   * Starts a new active study session for an educational activity.
   */
  app.post(
    "/v1/study-sessions/start",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const req = request as {
        body: {
          activityType?: string;
          courseId?: string;
          moduleId?: string;
          lessonId?: string;
        };
        id: string;
      };
      const actor = getActor(req);

      if (!req.body || !req.body.activityType) {
        throw new DomainError("bad_request", "Missing required field: activityType");
      }

      const session = await service.startStudySession(actor, {
        activityType: req.body.activityType as StudyActivityType,
        courseId: req.body.courseId,
        moduleId: req.body.moduleId,
        lessonId: req.body.lessonId,
      });

      reply.code(201);
      return {
        request_id: req.id,
        session,
      };
    },
  );

  /**
   * POST /v1/study-sessions/heartbeat
   * Records active heartbeat for a study session.
   */
  app.post(
    "/v1/study-sessions/heartbeat",
    { preHandler: [requireAuth] },
    async (request) => {
      const req = request as {
        body: {
          sessionId?: string;
        };
        id: string;
      };
      const actor = getActor(req);

      if (!req.body || !req.body.sessionId) {
        throw new DomainError("bad_request", "Missing required field: sessionId");
      }

      const result = await service.recordHeartbeat(actor, req.body.sessionId);
      return {
        request_id: req.id,
        ...result,
      };
    },
  );

  /**
   * POST /v1/study-sessions/end
   * Ends an active study session.
   */
  app.post(
    "/v1/study-sessions/end",
    { preHandler: [requireAuth] },
    async (request) => {
      const req = request as {
        body: {
          sessionId?: string;
        };
        id: string;
      };
      const actor = getActor(req);

      if (!req.body || !req.body.sessionId) {
        throw new DomainError("bad_request", "Missing required field: sessionId");
      }

      const result = await service.endStudySession(actor, req.body.sessionId);
      return {
        request_id: req.id,
        ...result,
      };
    },
  );

  /**
   * GET /v1/dashboard/stats, GET /v1/dashboard/study-time and GET /v1/study-sessions/weekly-summary
   * Returns:
   * - stats: { completedLessons, completedExams, currentStreak, longestStreak, todayIsActive, todayStudySeconds }
   * - thisWeek, lastWeek, changePercent, daily study time breakdowns
   */
  const handleGetDashboardStats = async (request: unknown) => {
    const req = request as {
      query: { timezone?: string };
      headers: { "x-timezone"?: string };
      id: string;
    };
    const actor = getActor(req);
    const timezone =
      req.query?.timezone || req.headers?.["x-timezone"] || undefined;

    const data = await service.getDashboardStats(actor, timezone);
    return {
      request_id: req.id,
      ...data,
    };
  };

  app.get(
    "/v1/dashboard/stats",
    { preHandler: [requireAuth] },
    handleGetDashboardStats,
  );

  app.get(
    "/v1/dashboard/study-time",
    { preHandler: [requireAuth] },
    handleGetDashboardStats,
  );

  app.get(
    "/v1/study-sessions/weekly-summary",
    { preHandler: [requireAuth] },
    handleGetDashboardStats,
  );

  // ---------------------------------------------------------------------------
  // Lesson Annotations & Text Interactions (Highlights, Notes & Content Reports)
  // ---------------------------------------------------------------------------

  const getAnnotationService = () => {
    if (!annotationService) {
      throw new DomainError("bad_request", "Annotation service not configured");
    }
    return annotationService;
  };

  /**
   * GET /v1/lessons/:lessonId/annotations & GET /v1/courses/:courseId/lessons/:lessonId/annotations
   */
  const handleListAnnotations = async (request: unknown) => {
    const req = request as {
      params: { lessonId: string };
      id: string;
    };
    const actor = getActor(req);
    const lessonId = req.params.lessonId as LessonId;
    const items = await getAnnotationService().listAnnotations(actor, lessonId);
    return {
      request_id: req.id,
      items,
    };
  };

  app.get(
    "/v1/lessons/:lessonId/annotations",
    { preHandler: [requireAuth] },
    handleListAnnotations,
  );

  app.get(
    "/v1/courses/:courseId/lessons/:lessonId/annotations",
    { preHandler: [requireAuth] },
    handleListAnnotations,
  );

  /**
   * POST /v1/lessons/:lessonId/annotations & POST /v1/courses/:courseId/lessons/:lessonId/annotations
   */
  const handleCreateAnnotation = async (request: unknown) => {
    const req = request as {
      params: { lessonId: string };
      body: CreateAnnotationRequest;
      id: string;
    };
    const actor = getActor(req);
    const lessonId = req.params.lessonId as LessonId;
    const created = await getAnnotationService().createAnnotation(
      actor,
      lessonId,
      req.body,
    );
    return {
      request_id: req.id,
      ...created,
    };
  };

  app.post(
    "/v1/lessons/:lessonId/annotations",
    { preHandler: [requireAuth] },
    handleCreateAnnotation,
  );

  app.post(
    "/v1/courses/:courseId/lessons/:lessonId/annotations",
    { preHandler: [requireAuth] },
    handleCreateAnnotation,
  );

  /**
   * PATCH /v1/lessons/:lessonId/annotations/:annotationId & PATCH /v1/lessons/annotations/:annotationId
   */
  const handleUpdateAnnotation = async (request: unknown) => {
    const req = request as {
      params: { lessonId?: string; annotationId: string };
      body: UpdateAnnotationRequest;
      id: string;
    };
    const actor = getActor(req);
    const updated = await getAnnotationService().updateAnnotation(
      actor,
      req.params.annotationId,
      req.body,
    );
    return {
      request_id: req.id,
      ...updated,
    };
  };

  app.patch(
    "/v1/lessons/:lessonId/annotations/:annotationId",
    { preHandler: [requireAuth] },
    handleUpdateAnnotation,
  );

  app.patch(
    "/v1/lessons/annotations/:annotationId",
    { preHandler: [requireAuth] },
    handleUpdateAnnotation,
  );

  /**
   * DELETE /v1/lessons/:lessonId/annotations/:annotationId & DELETE /v1/lessons/annotations/:annotationId
   */
  const handleDeleteAnnotation = async (request: unknown) => {
    const req = request as {
      params: { lessonId?: string; annotationId: string };
      id: string;
    };
    const actor = getActor(req);
    const deleted = await getAnnotationService().deleteAnnotation(
      actor,
      req.params.annotationId,
    );
    return {
      request_id: req.id,
      ok: deleted,
    };
  };

  app.delete(
    "/v1/lessons/:lessonId/annotations/:annotationId",
    { preHandler: [requireAuth] },
    handleDeleteAnnotation,
  );

  app.delete(
    "/v1/lessons/annotations/:annotationId",
    { preHandler: [requireAuth] },
    handleDeleteAnnotation,
  );

  /**
   * POST /v1/lessons/:lessonId/reports & POST /v1/courses/:courseId/lessons/:lessonId/reports
   */
  const handleCreateReport = async (request: unknown) => {
    const req = request as {
      params: { lessonId: string; courseId?: string };
      body: CreateContentReportRequest;
      id: string;
    };
    const actor = getActor(req);
    const lessonId = req.params.lessonId as LessonId;
    const body: CreateContentReportRequest = {
      ...req.body,
      courseId: req.body.courseId || req.params.courseId,
    };
    const report = await getAnnotationService().createReport(
      actor,
      lessonId,
      body,
    );
    return {
      request_id: req.id,
      ...report,
    };
  };

  app.post(
    "/v1/lessons/:lessonId/reports",
    { preHandler: [requireAuth] },
    handleCreateReport,
  );

  app.post(
    "/v1/courses/:courseId/lessons/:lessonId/reports",
    { preHandler: [requireAuth] },
    handleCreateReport,
  );

  // ---------------------------------------------------------------------------
  // 16. Daily Study Planner Handlers (Phase 3)
  // ---------------------------------------------------------------------------

  function formatStudyTaskResource(t: StudyTask): StudyTaskResource {
    return {
      id: t.id,
      planId: t.planId,
      userId: t.userId,
      taskType: t.taskType,
      status: t.status,
      title: t.title,
      description: t.description ?? null,
      priority: t.priority,
      estimatedMinutes: t.estimatedMinutes,
      completedAt: t.completedAt ?? null,
      courseId: t.courseId ?? null,
      moduleId: t.moduleId ?? null,
      lessonId: t.lessonId ?? null,
      quizId: t.quizId ?? null,
      metadata: t.metadata ?? {},
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  function formatDailyStudyPlanResource(
    plan: DailyStudyPlan,
    tasks: StudyTask[],
  ): DailyStudyPlanResource {
    const remainingDurationMinutes = Math.max(
      0,
      plan.targetDurationMinutes - plan.completedDurationMinutes,
    );
    return {
      id: plan.id,
      userId: plan.userId,
      planDate: plan.planDate,
      status: plan.status,
      targetDurationMinutes: plan.targetDurationMinutes,
      completedDurationMinutes: plan.completedDurationMinutes,
      remainingDurationMinutes,
      tasks: tasks.map(formatStudyTaskResource),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  /**
   * GET /v1/study/daily-plan
   * Returns (or lazily creates) the daily study plan for the authenticated user for today.
   */
  app.get(
    "/v1/study/daily-plan",
    { preHandler: [requireAuth] },
    async (request) => {
      const req = request as {
        query?: { timezone?: string; targetMinutes?: string };
        headers?: { "x-timezone"?: string };
        id: string;
      };
      const actor = getActor(req);
      const timeZone =
        req.query?.timezone || req.headers?.["x-timezone"] || undefined;
      const rawMinutes = req.query?.targetMinutes;
      const targetMinutes =
        rawMinutes !== undefined ? parseInt(rawMinutes, 10) : undefined;

      if (
        targetMinutes !== undefined &&
        (isNaN(targetMinutes) || targetMinutes <= 0)
      ) {
        throw new DomainError("bad_request", "Invalid targetMinutes parameter");
      }

      const { plan, tasks } = await getPlannerService().getOrCreateDailyPlan(
        actor,
        undefined,
        {
          timeZone,
          targetMinutes,
        },
      );

      return {
        request_id: req.id,
        plan: formatDailyStudyPlanResource(plan, tasks),
      };
    },
  );

  /**
   * POST /v1/study/daily-plan/regenerate
   * Regenerates today's uncompleted tasks for the authenticated user while preserving completed tasks.
   */
  app.post(
    "/v1/study/daily-plan/regenerate",
    { preHandler: [requireAuth] },
    async (request) => {
      const req = request as {
        body?: { timezone?: string; targetMinutes?: number };
        headers?: { "x-timezone"?: string };
        id: string;
      };
      const actor = getActor(req);
      const timeZone =
        req.body?.timezone || req.headers?.["x-timezone"] || undefined;
      const targetMinutes = req.body?.targetMinutes;

      if (
        targetMinutes !== undefined &&
        (typeof targetMinutes !== "number" ||
          isNaN(targetMinutes) ||
          targetMinutes <= 0)
      ) {
        throw new DomainError("bad_request", "Invalid targetMinutes parameter");
      }

      const { plan, tasks } = await getPlannerService().regenerateDailyPlan(
        actor,
        undefined,
        {
          timeZone,
          targetMinutes,
        },
      );

      return {
        request_id: req.id,
        plan: formatDailyStudyPlanResource(plan, tasks),
      };
    },
  );

  /**
   * PATCH /v1/study/daily-plan/tasks/:taskId
   * Updates status of an individual study task (pending | in_progress | completed | skipped).
   */
  app.patch(
    "/v1/study/daily-plan/tasks/:taskId",
    { preHandler: [requireAuth] },
    async (request) => {
      const req = request as {
        params: { taskId: string };
        body?: { status?: string };
        id: string;
      };
      const actor = getActor(req);
      const { taskId } = req.params;

      if (!taskId || !UUID_RE.test(taskId)) {
        throw new DomainError("bad_request", "Invalid task ID");
      }

      const validStatuses: StudyTaskStatus[] = [
        "pending",
        "in_progress",
        "completed",
        "skipped",
      ];
      const status = req.body?.status as StudyTaskStatus | undefined;

      if (!status || !validStatuses.includes(status)) {
        throw new DomainError(
          "bad_request",
          `Invalid task status. Must be one of: ${validStatuses.join(", ")}`,
        );
      }

      const updated = await getPlannerService().updateTaskStatus(
        actor,
        taskId,
        status,
      );

      return {
        request_id: req.id,
        task: formatStudyTaskResource(updated),
      };
    },
  );

  // ---------------------------------------------------------------------------
  // Personal Summaries (Generated from User's Own Highlights & Notes)
  // ---------------------------------------------------------------------------

  if (personalSummaryService) {
    const getPersonalSummaryService = () => personalSummaryService;

    /**
     * GET /v1/study/modules/:moduleId/personal-summary & GET /v1/courses/:courseId/modules/:moduleId/personal-summary
     */
    const handleGetPersonalSummary = async (request: unknown) => {
      const req = request as {
        params: { moduleId: string; courseId?: string };
        id: string;
      };
      const actor = getActor(req);
      const { moduleId } = req.params;

      if (!moduleId || !UUID_RE.test(moduleId)) {
        throw new DomainError("bad_request", "Invalid module ID");
      }

      const res = await getPersonalSummaryService().getPersonalSummary(actor, moduleId);
      return {
        request_id: req.id,
        ...res,
      };
    };

    app.get(
      "/v1/study/modules/:moduleId/personal-summary",
      { preHandler: [requireAuth] },
      handleGetPersonalSummary,
    );

    app.get(
      "/v1/courses/:courseId/modules/:moduleId/personal-summary",
      { preHandler: [requireAuth] },
      handleGetPersonalSummary,
    );

    /**
     * POST /v1/study/modules/:moduleId/personal-summary/generate & POST /v1/courses/:courseId/modules/:moduleId/personal-summary/generate
     */
    const handleGeneratePersonalSummary = async (request: unknown) => {
      const req = request as {
        params: { moduleId: string; courseId?: string };
        id: string;
      };
      const actor = getActor(req);
      const { moduleId } = req.params;

      if (!moduleId || !UUID_RE.test(moduleId)) {
        throw new DomainError("bad_request", "Invalid module ID");
      }

      const res = await getPersonalSummaryService().generatePersonalSummary(actor, moduleId);
      return {
        request_id: req.id,
        ...res,
      };
    };

    app.post(
      "/v1/study/modules/:moduleId/personal-summary/generate",
      { preHandler: [requireAuth] },
      handleGeneratePersonalSummary,
    );

    app.post(
      "/v1/courses/:courseId/modules/:moduleId/personal-summary/generate",
      { preHandler: [requireAuth] },
      handleGeneratePersonalSummary,
    );
  }

  // ---------------------------------------------------------------------------
  // Interactive AI Mind Map
  // ---------------------------------------------------------------------------

  if (mindMapService) {
    const getMindMapService = () => mindMapService;

    /**
     * GET /v1/study/modules/:moduleId/personal-summary/mind-map & GET /v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map
     */
    const handleGetMindMap = async (request: unknown) => {
      const req = request as {
        params: { moduleId: string; courseId?: string };
        id: string;
      };
      const actor = getActor(req);
      const { moduleId } = req.params;

      if (!moduleId || !UUID_RE.test(moduleId)) {
        throw new DomainError("bad_request", "Invalid module ID");
      }

      const res = await getMindMapService().getMindMap(actor, moduleId, req.params.courseId);
      return {
        request_id: req.id,
        ...res,
      };
    };

    app.get(
      "/v1/study/modules/:moduleId/personal-summary/mind-map",
      { preHandler: [requireAuth] },
      handleGetMindMap,
    );

    app.get(
      "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map",
      { preHandler: [requireAuth] },
      handleGetMindMap,
    );

    /**
     * POST /v1/study/modules/:moduleId/personal-summary/mind-map/generate & POST /v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/generate
     */
  const handleGenerateMindMap = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; courseId?: string };
      id: string;
    };
    const actor = getActor(req);
    const { moduleId } = req.params;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }

    const res = await getMindMapService().generateMindMap(actor, moduleId, req.id, req.params.courseId);
    return {
      request_id: req.id,
      ...res,
    };
  };

  app.post(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/generate",
    { preHandler: [requireAuth] },
    handleGenerateMindMap,
  );

  app.post(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/generate",
    { preHandler: [requireAuth] },
    handleGenerateMindMap,
  );

  /**
   * PUT /v1/study/modules/:moduleId/personal-summary/mind-map & PUT /v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map
   */
  const handleUpdateMindMap = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; courseId?: string };
      body: import("@avana/contracts").UpdateMindMapRequest;
      id: string;
    };
    const actor = getActor(req);
    const { moduleId } = req.params;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new DomainError("bad_request", "Request body is required and must be an object");
    }

    const res = await getMindMapService().updateMindMap(actor, moduleId, req.body, req.params.courseId);
    return {
      request_id: req.id,
      mind_map: res,
    };
  };

  app.put(
    "/v1/study/modules/:moduleId/personal-summary/mind-map",
    { preHandler: [requireAuth] },
    handleUpdateMindMap,
  );

  app.patch(
    "/v1/study/modules/:moduleId/personal-summary/mind-map",
    { preHandler: [requireAuth] },
    handleUpdateMindMap,
  );

  app.put(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map",
    { preHandler: [requireAuth] },
    handleUpdateMindMap,
  );

  app.patch(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map",
    { preHandler: [requireAuth] },
    handleUpdateMindMap,
  );

  /**
   * POST /v1/study/modules/:moduleId/personal-summary/mind-map/nodes/:nodeId/expand
   */
  const handleExpandMindMapNode = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; nodeId: string; courseId?: string };
      id: string;
    };
    const actor = getActor(req);
    const { moduleId, nodeId } = req.params;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }
    if (!nodeId) {
      throw new DomainError("bad_request", "Invalid node ID");
    }

    const res = await getMindMapService().expandNode(actor, moduleId, nodeId, req.params.courseId);
    return {
      request_id: req.id,
      ...res,
    };
  };

  app.post(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/nodes/:nodeId/expand",
    { preHandler: [requireAuth] },
    handleExpandMindMapNode,
  );

  app.post(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/nodes/:nodeId/expand",
    { preHandler: [requireAuth] },
    handleExpandMindMapNode,
  );

  /**
   * POST /v1/study/modules/:moduleId/personal-summary/mind-map/reset
   */
  const handleResetMindMap = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; courseId?: string };
      id: string;
    };
    const actor = getActor(req);
    const { moduleId } = req.params;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }

    const res = await getMindMapService().resetToAiBase(actor, moduleId, req.params.courseId);
    return {
      request_id: req.id,
      mind_map: res,
    };
  };

  app.post(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/reset",
    { preHandler: [requireAuth] },
    handleResetMindMap,
  );

  app.post(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/reset",
    { preHandler: [requireAuth] },
    handleResetMindMap,
  );

  /**
   * GET /v1/study/modules/:moduleId/personal-summary/mind-map/versions
   */
  const handleListMindMapVersions = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; courseId?: string };
      id: string;
    };
    const actor = getActor(req);
    const { moduleId } = req.params;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }

    const res = await getMindMapService().listVersions(actor, moduleId, req.params.courseId);
    return {
      request_id: req.id,
      ...res,
    };
  };

  app.get(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/versions",
    { preHandler: [requireAuth] },
    handleListMindMapVersions,
  );

  app.get(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/versions",
    { preHandler: [requireAuth] },
    handleListMindMapVersions,
  );

  /**
   * GET /v1/study/modules/:moduleId/personal-summary/mind-map/versions/:version
   */
  const handleGetMindMapVersion = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; version: string; courseId?: string };
      id: string;
    };
    const actor = getActor(req);
    const { moduleId, version: versionStr } = req.params;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version) || version < 1) {
      throw new DomainError("bad_request", "Invalid version number");
    }

    const res = await getMindMapService().getVersion(actor, moduleId, version, req.params.courseId);
    return {
      request_id: req.id,
      ...res,
    };
  };

  app.get(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/versions/:version",
    { preHandler: [requireAuth] },
    handleGetMindMapVersion,
  );

  app.get(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/versions/:version",
    { preHandler: [requireAuth] },
    handleGetMindMapVersion,
  );

  /**
   * POST /v1/study/modules/:moduleId/personal-summary/mind-map/versions/:version/restore
   */
  const handleRestoreMindMapVersion = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; version: string; courseId?: string };
      id: string;
    };
    const actor = getActor(req);
    const { moduleId, version: versionStr } = req.params;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }

    const version = parseInt(versionStr, 10);
    if (isNaN(version) || version < 1) {
      throw new DomainError("bad_request", "Invalid version number");
    }

    const res = await getMindMapService().restoreVersion(actor, moduleId, version, req.params.courseId);
    return {
      request_id: req.id,
      ...res,
    };
  };

  app.post(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/versions/:version/restore",
    { preHandler: [requireAuth] },
    handleRestoreMindMapVersion,
  );

  app.post(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/versions/:version/restore",
    { preHandler: [requireAuth] },
    handleRestoreMindMapVersion,
  );

  /**
   * GET /v1/study/modules/:moduleId/personal-summary/mind-map/export & GET /v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/export
   * Strictly restricted to platform_admin role.
   */
  const handleExportMindMap = async (request: unknown) => {
    const req = request as {
      params: { moduleId: string; courseId?: string };
      query?: { format?: string };
      id: string;
    };
    const actor = getActor(req);
    const { moduleId, courseId } = req.params;
    const format = req.query?.format;

    if (!moduleId || !UUID_RE.test(moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }
    if (courseId && !UUID_RE.test(courseId)) {
      throw new DomainError("bad_request", "Invalid course ID");
    }
    if (!format || (format !== "svg" && format !== "html")) {
      throw new DomainError("bad_request", "فرمت خروجی نامعتبر است (svg یا html مجاز است).");
    }

    const res = await getMindMapService().getMindMap(actor, moduleId, courseId);
    if (!res.has_mind_map || !res.mind_map) {
      throw new DomainError("not_found", "مایندمپ یافت نشد.");
    }

    return {
      request_id: req.id,
      success: true,
      authorized: true,
      moduleId,
      courseId: courseId ?? null,
      format,
      exportedAt: new Date().toISOString(),
    };
  };

  app.get(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/export",
    { preHandler: [requireAuth, requireRole(Roles.platform_admin)] },
    handleExportMindMap,
  );

  app.get(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/export",
    { preHandler: [requireAuth, requireRole(Roles.platform_admin)] },
    handleExportMindMap,
  );

  /**
   * POST /v1/study/mind-maps/:id/enrich-chemicals
   * POST /v1/study/modules/:moduleId/personal-summary/mind-map/enrich-chemicals
   * POST /v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/enrich-chemicals
   *
   * Retroactively executes chemical enrichment on an existing mind map.
   */
  const handleEnrichMindMapChemicals = async (request: unknown) => {
    const req = request as {
      params: { id?: string; moduleId?: string; courseId?: string };
      body?: { clientUpdatedAt?: string };
      id: string;
    };
    const actor = getActor(req);
    const targetId = req.params.id || req.params.moduleId;

    if (!targetId) {
      throw new DomainError("bad_request", "شناسه مایندمپ یا سرفصل الزامی است.");
    }

    const res = await getMindMapService().enrichMindMapChemicals(actor, targetId, {
      courseId: req.params.courseId,
      expectedUpdatedAt: req.body?.clientUpdatedAt,
    });

    return {
      request_id: req.id,
      ...res,
    };
  };

  app.post(
    "/v1/study/mind-maps/:id/enrich-chemicals",
    { preHandler: [requireAuth] },
    handleEnrichMindMapChemicals,
  );

  app.post(
    "/v1/study/modules/:moduleId/personal-summary/mind-map/enrich-chemicals",
    { preHandler: [requireAuth] },
    handleEnrichMindMapChemicals,
  );

  app.post(
    "/v1/courses/:courseId/modules/:moduleId/personal-summary/mind-map/enrich-chemicals",
    { preHandler: [requireAuth] },
    handleEnrichMindMapChemicals,
  );
  }
};


