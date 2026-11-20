import type { FastifyPluginAsync } from "fastify";
import { DomainError, asUserId, asOrganizationId, type Actor } from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { PollService } from "./poll-service.js";
import type {
  CreatePollInput,
  UpdatePollInput,
  CreatePollQuestionInput,
  UpdatePollQuestionInput,
  PollStatus,
} from "./poll-types.js";

export interface StudioPollRouteOptions extends AuthMiddlewareDeps {
  pollService: PollService;
}

export const studioPollRoutes: FastifyPluginAsync<StudioPollRouteOptions> = async (
  app,
  opts,
) => {
  const { requireAuth } = makeAuthMiddleware(opts);
  const { pollService } = opts;

  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: {
        userId: string;
        email: string;
        role: string;
        globalRole?: string | null;
        memberships?: Array<{ organizationId: string; role: string }>;
      };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: asUserId(reqAny.user.userId),
      role: reqAny.user.role as Actor["role"],
      globalRole: (reqAny.user.globalRole as Actor["globalRole"]) ?? undefined,
      memberships: reqAny.user.memberships?.map((m) => ({
        organizationId: asOrganizationId(m.organizationId),
        role: m.role as Actor["role"],
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Poll CRUD Endpoints
  // ---------------------------------------------------------------------------

  // List polls
  app.get(
    "/v1/studio/polls",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const query = (request.query as Record<string, string | undefined>) ?? {};
      const polls = await pollService.listPolls(actor, {
        organizationId: query.organizationId,
        status: query.status as PollStatus | undefined,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
      });
      return { polls };
    },
  );

  // Create poll
  app.post(
    "/v1/studio/polls",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = (request.body as CreatePollInput) ?? {};
      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        throw new DomainError("bad_request", "عنوان نظرسنجی الزامی است.");
      }
      const poll = await pollService.createPoll(actor, body);
      reply.status(201);
      return { poll };
    },
  );

  // Get poll details with questions
  app.get(
    "/v1/studio/polls/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const poll = await pollService.getPollById(actor, id);
      return { poll };
    },
  );

  // Update poll
  app.patch(
    "/v1/studio/polls/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = (request.body as UpdatePollInput) ?? {};
      const poll = await pollService.updatePoll(actor, id, body);
      return { poll };
    },
  );

  // Delete poll (soft delete)
  app.delete(
    "/v1/studio/polls/:id",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      await pollService.deletePoll(actor, id);
      return { success: true };
    },
  );

  // Publish poll
  app.post(
    "/v1/studio/polls/:id/publish",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const poll = await pollService.publishPoll(actor, id);
      return { poll };
    },
  );

  // Close poll
  app.post(
    "/v1/studio/polls/:id/close",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const poll = await pollService.closePoll(actor, id);
      return { poll };
    },
  );

  // ---------------------------------------------------------------------------
  // Question & Option Management
  // ---------------------------------------------------------------------------

  // Add question to poll
  app.post(
    "/v1/studio/polls/:id/questions",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = (request.body as CreatePollQuestionInput) ?? {};
      const question = await pollService.createQuestion(actor, id, body);
      reply.status(201);
      return { question };
    },
  );

  // Update question
  app.patch(
    "/v1/studio/polls/:id/questions/:questionId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id, questionId } = request.params as { id: string; questionId: string };
      const body = (request.body as UpdatePollQuestionInput) ?? {};
      const question = await pollService.updateQuestion(actor, id, questionId, body);
      return { question };
    },
  );

  // Delete question
  app.delete(
    "/v1/studio/polls/:id/questions/:questionId",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id, questionId } = request.params as { id: string; questionId: string };
      await pollService.deleteQuestion(actor, id, questionId);
      return { success: true };
    },
  );

  // Reorder questions
  app.put(
    "/v1/studio/polls/:id/questions/reorder",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const body = (request.body as { questionIds?: string[] }) ?? {};
      if (!body.questionIds || !Array.isArray(body.questionIds)) {
        throw new DomainError("bad_request", "لیست شناسه‌های سؤال نامعتبر است.");
      }
      await pollService.reorderQuestions(actor, id, body.questionIds);
      return { success: true };
    },
  );

  // ---------------------------------------------------------------------------
  // Results & Analytics & CSV Export
  // ---------------------------------------------------------------------------

  // Get full poll results for management
  app.get(
    "/v1/studio/polls/:id/results",
    { preHandler: [requireAuth] },
    async (request) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const results = await pollService.getPollResultsById(id, actor);
      return { results };
    },
  );

  // Export results as CSV
  app.get(
    "/v1/studio/polls/:id/export",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const { id } = request.params as { id: string };
      const { filename, csvContent } = await pollService.exportPollResultsCsv(actor, id);

      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      return reply.send(csvContent);
    },
  );
};
