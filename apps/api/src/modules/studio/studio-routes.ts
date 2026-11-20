import type { FastifyPluginAsync } from "fastify";
import { DomainError, asUserId, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { StudioService } from "./studio-service.js";
import type { StudioAiService } from "./studio-ai-service.js";
import type {
  CreateMarketingQuizInput,
  UpdateMarketingQuizInput,
  MarketingQuizStatus,
  StudioAiGenerateInput,
  BatchAddQuestionsInput,
  SearchQuestionBankFilters,
  QuestionSourceType,
} from "./types.js";

export interface StudioRouteOptions extends AuthMiddlewareDeps {
  studioService: StudioService;
  studioAiService?: StudioAiService;
}

export const studioRoutes: FastifyPluginAsync<StudioRouteOptions> = async (
  app,
  opts,
) => {
  const { requireAuth } = makeAuthMiddleware(opts);
  const { studioService, studioAiService } = opts;

  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: {
        userId: string;
        email: string;
        role: string;
        globalRole?: string | null;
      };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: asUserId(reqAny.user.userId),
      role: reqAny.user.role as Actor["role"],
      globalRole: (reqAny.user.globalRole as Actor["globalRole"]) ?? undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Marketing Quizzes Endpoints
  // -------------------------------------------------------------------------

  // List quizzes
  app.get(
    "/v1/studio/quizzes",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const query = (request.query as Record<string, string | undefined>) ?? {};
      const quizzes = await studioService.listQuizzes(actor, {
        organizationId: query.organizationId,
        status: query.status as MarketingQuizStatus | undefined,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });
      return { quizzes };
    },
  );

  // Create quiz
  app.post(
    "/v1/studio/quizzes",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = (request.body as CreateMarketingQuizInput) ?? {};
      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        throw new DomainError("bad_request", "عنوان آزمون الزامی است.");
      }
      const quiz = await studioService.createQuiz(actor, body);
      reply.status(201);
      return { quiz };
    },
  );

  // Get quiz details with questions
  app.get(
    "/v1/studio/quizzes/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const quiz = await studioService.getQuizById(actor, id);
      return { quiz };
    },
  );

  // Update quiz
  app.patch(
    "/v1/studio/quizzes/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = (request.body as UpdateMarketingQuizInput) ?? {};
      const quiz = await studioService.updateQuiz(actor, id, body);
      return { quiz };
    },
  );

  // Delete quiz (soft delete)
  app.delete(
    "/v1/studio/quizzes/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      await studioService.deleteQuiz(actor, id);
      reply.status(204);
      return;
    },
  );

  // -------------------------------------------------------------------------
  // Question Snapshot Management inside Quiz
  // -------------------------------------------------------------------------

  // Add manual question
  app.post(
    "/v1/studio/quizzes/:id/questions/manual",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = request.body as {
        question: string;
        choices: Array<{ id: string; text: string }>;
        correctAnswer: { choiceId: string } | string;
        explanation?: string;
        difficulty?: "easy" | "medium" | "hard";
        topic?: string;
        questionType?: string;
        addToQuestionBank?: boolean;
      };

      if (!body.question || !Array.isArray(body.choices) || body.choices.length < 2) {
        throw new DomainError("bad_request", "متن سؤال و حداقل ۲ گزینه الزامی است.");
      }
      if (!body.correctAnswer) {
        throw new DomainError("bad_request", "تعیین پاسخ صحیح الزامی است.");
      }

      const question = await studioService.addManualQuestion(actor, id, body);
      reply.status(201);
      return { question };
    },
  );

  // Add question from existing AVANA course
  app.post(
    "/v1/studio/quizzes/:id/questions/from-course",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const { sourceQuestionId } = request.body as { sourceQuestionId: string };
      if (!sourceQuestionId) {
        throw new DomainError("bad_request", "شناسه سؤال مبدأ الزامی است.");
      }

      const question = await studioService.addQuestionFromCourse(
        actor,
        id,
        sourceQuestionId,
      );
      reply.status(201);
      return { question };
    },
  );

  // Add question from Question Bank
  app.post(
    "/v1/studio/quizzes/:id/questions/from-bank",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const { bankQuestionId } = request.body as { bankQuestionId: string };
      if (!bankQuestionId) {
        throw new DomainError("bad_request", "شناسه سؤال بانک الزامی است.");
      }

      const question = await studioService.addQuestionFromBank(
        actor,
        id,
        bankQuestionId,
      );
      reply.status(201);
      return { question };
    },
  );

  // Update question snapshot in quiz
  app.patch(
    "/v1/studio/quizzes/:id/questions/:questionId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id, questionId } = request.params as {
        id: string;
        questionId: string;
      };
      const body = request.body as Record<string, unknown>;
      const question = await studioService.updateQuestionSnapshot(
        actor,
        id,
        questionId,
        body,
      );
      return { question };
    },
  );

  // Delete question snapshot from quiz
  app.delete(
    "/v1/studio/quizzes/:id/questions/:questionId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id, questionId } = request.params as {
        id: string;
        questionId: string;
      };
      await studioService.deleteQuestionSnapshot(actor, id, questionId);
      reply.status(204);
      return;
    },
  );

  // Reorder questions in quiz
  app.put(
    "/v1/studio/quizzes/:id/questions/reorder",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const { orderedQuestionIds } = request.body as {
        orderedQuestionIds: string[];
      };
      if (!Array.isArray(orderedQuestionIds)) {
        throw new DomainError("bad_request", "آرایه ترتیب سؤالات نامعتبر است.");
      }
      await studioService.reorderQuizQuestions(actor, id, orderedQuestionIds);
      return { success: true };
    },
  );

  // Batch add questions to quiz (independent snapshots)
  app.post(
    "/v1/studio/quizzes/:id/questions/batch",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = request.body as BatchAddQuestionsInput;

      if (!body || !Array.isArray(body.items) || body.items.length === 0) {
        throw new DomainError("bad_request", "لیست سؤالات جهت افزودن الزامی است.");
      }

      const result = await studioService.addQuestionsBatch(actor, id, body.items);
      reply.status(201);
      return result;
    },
  );

  // Quiz analytics
  app.get(
    "/v1/studio/quizzes/:id/analytics",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const analytics = await studioService.getQuizAnalytics(actor, id);
      return { analytics };
    },
  );

  // -------------------------------------------------------------------------
  // Question Bank Endpoints
  // -------------------------------------------------------------------------

  // Get taxonomy sources (courses -> modules -> lessons) for Question Bank filters
  app.get(
    "/v1/studio/question-bank/sources",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const sources = await studioService.getQuestionBankSources(actor);
      return sources;
    },
  );

  // Unified search across Course Quizzes, Marketing Question Bank, and Studio Quizzes
  app.get(
    "/v1/studio/question-bank/search",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const query = (request.query as Record<string, string | undefined>) ?? {};

      const filters: SearchQuestionBankFilters = {
        organizationId: query.organizationId,
        search: query.search,
        sourceType: query.sourceType as "all" | QuestionSourceType | undefined,
        courseId: query.courseId,
        moduleId: query.moduleId,
        lessonId: query.lessonId,
        difficulty: query.difficulty as "all" | "easy" | "medium" | "hard" | undefined,
        questionType: query.questionType,
        limit: query.limit ? parseInt(query.limit, 10) : 20,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
        excludeQuizId: query.excludeQuizId,
      };

      const result = await studioService.searchAvailableQuestions(actor, filters);
      return result;
    },
  );

  app.get(
    "/v1/studio/question-bank",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const query = (request.query as Record<string, string | undefined>) ?? {};
      const questions = await studioService.listQuestionBank(actor, {
        organizationId: query.organizationId,
        topic: query.topic,
        difficulty: query.difficulty,
        questionType: query.questionType,
        search: query.search,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });
      return { questions };
    },
  );

  app.post(
    "/v1/studio/question-bank",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body as {
        organizationId?: string;
        sourceType?: "course" | "manual" | "ai";
        sourceQuestionId?: string;
        sourceCourseId?: string;
        question: string;
        choices: Array<{ id: string; text: string }>;
        correctAnswer: { choiceId: string } | string;
        explanation?: string;
        difficulty?: "easy" | "medium" | "hard";
        topic?: string;
        questionType?: string;
        tags?: string[];
      };

      if (!body.question || !Array.isArray(body.choices) || body.choices.length < 2) {
        throw new DomainError("bad_request", "متن سؤال و حداقل ۲ گزینه الزامی است.");
      }

      const item = await studioService.createQuestionBankItem(actor, {
        organizationId: body.organizationId ?? null,
        sourceType: body.sourceType ?? "manual",
        sourceQuestionId: body.sourceQuestionId ?? null,
        sourceCourseId: body.sourceCourseId ?? null,
        question: body.question.trim(),
        choices: body.choices,
        correctAnswer: body.correctAnswer,
        explanation: body.explanation?.trim() ?? null,
        difficulty: body.difficulty ?? "medium",
        topic: body.topic?.trim() ?? null,
        questionType: body.questionType ?? "multiple_choice",
        tags: body.tags ?? [],
      });
      reply.status(201);
      return { item };
    },
  );

  app.patch(
    "/v1/studio/question-bank/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const item = await studioService.updateQuestionBankItem(actor, id, body);
      return { item };
    },
  );

  app.delete(
    "/v1/studio/question-bank/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      await studioService.deleteQuestionBankItem(actor, id);
      reply.status(204);
      return;
    },
  );

  // -------------------------------------------------------------------------
  // Gemini AI Question Generation
  // -------------------------------------------------------------------------

  app.post(
    "/v1/studio/ai/generate",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      await studioService.assertStudioAccess(actor);

      if (!studioAiService) {
        throw new DomainError(
          "bad_request",
          "سرویس هوش مصنوعی در این محیط در دسترس نیست.",
        );
      }

      const body = request.body as StudioAiGenerateInput;
      if (!body.topic || !body.questionType) {
        throw new DomainError("bad_request", "موضوع و نوع سؤال الزامی است.");
      }

      const questions = await studioAiService.generateQuestions(body);
      return { questions };
    },
  );
};
