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
    params: { organizationId?: string; courseId: string },
  ): Promise<OrganizationId> {
    if (params.organizationId && UUID_RE.test(params.organizationId)) {
      return params.organizationId as OrganizationId;
    }
    if (courseStore) {
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
  // 1. Flashcards List Handler
  // -------------------------------------------------------------------------
  const handleListFlashcards = async (request: unknown) => {
    const req = request as { params: { organizationId?: string; courseId: string }; id: string };
    const actor = getActor(req);
    const courseId = getCourseId(req.params);
    const organizationId = await resolveOrganizationId(actor, req.params);

    await service.authorize(actor, organizationId, "study:read");

    const allFlashcards = await flashcardStore.listByCourse(
      courseId,
      organizationId,
    );
    const now = new Date();
    const nextReviewCount = allFlashcards.filter((f) => {
      const dueAt = new Date(f.dueAt);
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
  // 3. Flashcard Review Submission Handler
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
  // 4. Quizzes List Handler
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
  // 5. Quiz Detail Handler
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
          correct_answer: qn.correctAnswer,
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
  // 6. Submit Quiz Attempt Handler
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
  // 7. Get Quiz Attempt Handler
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
  // 8. Study Analytics Handler
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
  // 9. Study Recommendations Handler
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
