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
  type CourseId,
  type FlashcardRating,
  type OrganizationId,
  DomainError,
  defaultPolicy,
  isFlashcardRating,
  parseFlashcardId,
  parseQuizAttemptId,
  parseQuizId,
} from "@avana/domain";
import { StudyService } from "./study-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type {
  FlashcardStore,
  FlashcardReviewStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
} from "./study-store.js";
import type {
  ModuleStore,
  LessonStore,
  ProgressStore,
} from "../learning/learning-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { AuditService } from "../../observability/audit-service.js";

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
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const service = new StudyService(
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
  );

  /** Helper to extract actor from authenticated request. */
  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: { userId: string; email: string; role: string };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: reqAny.user.userId as Actor["userId"],
      role: reqAny.user.role as Actor["role"],
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

  // -------------------------------------------------------------------------
  // 1. Flashcard Summary Handler
  // -------------------------------------------------------------------------
  const handleGetFlashcardSummary = async (request: unknown) => {
    const req = request as { params: { organizationId: string }; id: string };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const [allFlashcards, userSchedules, userReviews, coursesInfo] = await Promise.all([
      flashcardStore.listByOrganization(organizationId),
      userFlashcardScheduleStore
        ? userFlashcardScheduleStore.listByUser(actor.userId)
        : Promise.resolve([]),
      flashcardReviewStore.listByUser(actor.userId),
      courseStore?.listByOrganization(organizationId, actor.userId) || Promise.resolve([]),
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

        let cTotal = 0, cDue = 0, cOverdue = 0, cNew = 0, cLearning = 0;

        for (const f of allFlashcards) {
          if (f.courseId !== course.id) continue;

          let matchedLessonId: string | null = f.lessonId ?? null;
          if (!matchedLessonId && f.documentId) {
            // Check if document maps to a single lesson in courseLessons
            const found = courseLessons.find((l) => l.title.includes(f.documentId.slice(0, 8)));
            if (found) matchedLessonId = found.id;
          }

          const lStats = matchedLessonId ? lessonMap.get(matchedLessonId) : null;

          const schedule = scheduleMap.get(f.id);
          const isReviewed = schedule ? true : reviewedCardIds.has(f.id);
          const rawDueAt = schedule ? schedule.dueAt : f.dueAt;
          const intervalDays = schedule ? schedule.intervalDays : f.intervalDays;

          const hasDueAt = rawDueAt != null && !isNaN(new Date(rawDueAt).getTime());
          const dueAt = hasDueAt ? new Date(rawDueAt) : null;
          const isDue = isReviewed && dueAt !== null && dueAt <= now;

          cTotal += 1;
          if (lStats) lStats.total_cards += 1;

          if (!isReviewed) {
            cNew += 1;
            if (lStats) lStats.new_cards += 1;
          } else if (isDue) {
            cDue += 1;
            if (lStats) lStats.due_cards += 1;
            if (intervalDays >= 1 && dueAt !== null && now.getTime() - dueAt.getTime() > 24 * 60 * 60 * 1000) {
              cOverdue += 1;
              if (lStats) lStats.overdue_cards += 1;
            }
          } else if (intervalDays === 0) {
            cLearning += 1;
            if (lStats) lStats.learning_cards += 1;
          }
        }

        const modulesSummaries = courseModules
          .map((m) => {
            const modLessons = courseLessons
              .filter((l) => l.moduleId === m.id)
              .map((l) => lessonMap.get(l.id)!);

            let mTotal = 0, mDue = 0, mOverdue = 0, mNew = 0, mLearning = 0;
            for (const les of modLessons) {
              mTotal += les.total_cards;
              mDue += les.due_cards;
              mOverdue += les.overdue_cards;
              mNew += les.new_cards;
              mLearning += les.learning_cards;
            }

            return {
              module_id: m.id,
              title: m.title,
              total_cards: mTotal,
              due_cards: mDue,
              new_cards: mNew,
              learning_cards: mLearning,
              overdue_cards: mOverdue,
            };
          })
          .filter((m) => m.total_cards > 0);

        if (cTotal === 0 || modulesSummaries.length === 0) {
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
    const req = request as { params: { organizationId?: string; courseId: string }; id: string };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);

    await service.authorize(actor, organizationId, "study:read");

    const [allFlashcards, userReviews] = await Promise.all([
      flashcardStore.listByCourse(courseId, organizationId),
      flashcardReviewStore.listByUser(actor.userId),
    ]);
    const reviewedCardIds = new Set(userReviews.map((r) => r.flashcardId));
    const now = new Date();
    const nextReviewCount = allFlashcards.filter((f) => {
      if (!reviewedCardIds.has(f.id)) return false;
      if (!f.dueAt) return false;
      const dueAt = new Date(f.dueAt);
      if (isNaN(dueAt.getTime())) return false;
      return dueAt <= now;
    }).length;

    return {
      request_id: req.id,
      flashcards: allFlashcards,
      items: allFlashcards,
      next_review_count: nextReviewCount,
    };
  };

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

    return {
      request_id: req.id,
      due_cards: dueCards,
      items: dueCards,
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

    return {
      request_id: req.id,
      due_cards: dueCards,
      items: dueCards,
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

    return {
      request_id: req.id,
      due_cards: dueCards,
      items: dueCards,
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
      query: { courseIds?: string; documentIds?: string; limit?: string; mode?: string; aheadDays?: string };
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params as { organizationId: string });

    const courseIds = req.query.courseIds ? req.query.courseIds.split(",").map(id => id.trim() as CourseId) : undefined;
    const documentIds = req.query.documentIds ? req.query.documentIds.split(",").map(id => id.trim()) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const aheadDays = req.query.aheadDays ? parseInt(req.query.aheadDays, 10) : 3;
    const mode = (req.query.mode || "weak") as "weak" | "forgotten" | "overdue" | "review_ahead" | "new";

    const dueCards = await service.getCustomStudyFlashcards(
      actor,
      organizationId,
      mode,
      courseIds,
      limit,
      aheadDays,
      documentIds,
    );

    return {
      request_id: req.id,
      due_cards: dueCards,
      items: dueCards,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/flashcards/custom-queue",
    { preHandler: [requireAuth] },
    handleFlashcardCustomQueue,
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

    // Format 2-level courses structure (Course -> Module) without exposing internal lessons array
    const courses2Level = (summary.courses || []).map((c) => ({
      courseId: c.courseId,
      courseTitle: c.courseTitle,
      questionCount: c.questionCount,
      easyCount: c.easyCount,
      mediumCount: c.mediumCount,
      hardCount: c.hardCount,
      modules: (c.modules || []).map((m) => ({
        moduleId: m.moduleId,
        moduleTitle: m.moduleTitle,
        questionCount: m.questionCount,
        easyCount: m.easyCount,
        mediumCount: m.mediumCount,
        hardCount: m.hardCount,
      })),
    }));

    return {
      request_id: req.id,
      courses: courses2Level,
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
      isCompleted: res.isCompleted,
    };
  };

  app.get(
    "/v1/organizations/:organizationId/study/exams/attempts/:attemptId",
    { preHandler: [requireAuth] },
    handleGetExamAttemptDetail,
  );

  const handleSaveExamAttemptAnswers = async (request: unknown) => {
    const req = request as {
      params: { organizationId: string; attemptId: string };
      body: { answers?: Array<{ questionId?: string; answer?: unknown; selectedChoice?: unknown }> };
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

    const res = await service.saveExamAttemptAnswer(
      actor,
      organizationId,
      attemptId,
      formattedAnswers,
    );

    return {
      request_id: req.id,
      success: true,
      answers: res.answers,
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
      body: { answers?: Array<{ questionId?: string; answer?: unknown; selectedChoice?: unknown }> };
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

    const result = await service.submitConfiguredExamAttempt(
      actor,
      organizationId,
      attemptId,
      formattedAnswers,
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
      total: result.total,
      passed,
      questions: result.questions,
    };
  };

  app.post(
    "/v1/organizations/:organizationId/study/exams/attempts/:attemptId/submit",
    { preHandler: [requireAuth] },
    handleSubmitExamAttempt,
  );

  // -------------------------------------------------------------------------
  // 6. Quizzes List Handler
  // -------------------------------------------------------------------------
  const handleListQuizzes = async (request: unknown) => {
    const req = request as { params: { organizationId?: string; courseId: string }; id: string };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);

    const quizzes = await service.listQuizzes(
      actor,
      organizationId,
      courseId,
    );

    const quizzesWithQuestions = await Promise.all(
      quizzes.map(async (q) => {
        const questions = await quizQuestionStore.listByQuiz(q.id);
        return {
          ...q,
          questions: questions.map((qn) => ({
            ...qn,
            correct_answer: qn.correctAnswer,
            question_type: qn.questionType,
          })),
        };
      }),
    );

    return {
      request_id: req.id,
      quizzes: quizzesWithQuestions,
      items: quizzesWithQuestions,
    };
  };

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
      id: string;
    };
    const actor = getActor(req);
    const organizationId = await resolveOrganizationId(actor, req.params);
    const quizId = parseQuizId(req.params.quizId, "quizId");

    const quiz = await service.getQuizForAttempt(
      actor,
      organizationId,
      quizId,
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

    const attempt = await service.submitQuizAttempt(actor, organizationId, {
      quizId,
      answers: formattedAnswers,
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
      score: attempt.correct,
      maxScore: formattedAnswers.length,
      passed,
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
};
