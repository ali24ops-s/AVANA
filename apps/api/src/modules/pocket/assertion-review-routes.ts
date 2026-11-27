/**
 * Fastify HTTP routes for AVANA Pocket Assertion Review Workflow (Phase 2C-1).
 *
 * Implements endpoints under `/v1/pocket/assertions`:
 * - POST /v1/pocket/assertions/:id/submit-review
 * - POST /v1/pocket/assertions/:id/review-decision
 * - POST /v1/pocket/assertions/:id/withdraw-review
 * - GET  /v1/pocket/assertions/:id/history
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { DomainError } from "@avana/domain";
import type {
  AssertionReviewService,
  ReviewDecision,
} from "./assertion-review-service.js";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { extractActor } from "./reviewer-routes.js";

export interface AssertionReviewRouteOptions {
  assertionReviewService: AssertionReviewService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface AssertionParams {
  id: string;
}

interface SubmitReviewBody {
  notes?: string;
}

interface ReviewDecisionBody {
  decision: ReviewDecision;
  notes?: string;
}

interface WithdrawReviewBody {
  reason?: string;
}

export const pocketAssertionReviewRoutes: FastifyPluginAsync<AssertionReviewRouteOptions> = async (
  app,
  opts,
) => {
  const { assertionReviewService, sessionService, userStore } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/:id/submit-review
  // ---------------------------------------------------------------------------
  app.post<{ Params: AssertionParams; Body: SubmitReviewBody }>(
    "/v1/pocket/assertions/:id/submit-review",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      const result = await assertionReviewService.submitForReview(actor, {
        assertionId: id,
        notes: body?.notes,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/:id/review-decision
  // ---------------------------------------------------------------------------
  app.post<{ Params: AssertionParams; Body: ReviewDecisionBody }>(
    "/v1/pocket/assertions/:id/review-decision",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      if (!body || !body.decision) {
        throw new DomainError("bad_request", "Review decision is required");
      }

      const result = await assertionReviewService.recordReviewDecision(actor, {
        assertionId: id,
        decision: body.decision,
        notes: body.notes,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/:id/withdraw-review
  // ---------------------------------------------------------------------------
  app.post<{ Params: AssertionParams; Body: WithdrawReviewBody }>(
    "/v1/pocket/assertions/:id/withdraw-review",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      const result = await assertionReviewService.withdrawReview(actor, {
        assertionId: id,
        reason: body?.reason,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/assertions/:id/history
  // ---------------------------------------------------------------------------
  app.get<{ Params: AssertionParams }>(
    "/v1/pocket/assertions/:id/history",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;

      const result = await assertionReviewService.getAssertionWithHistory(actor, id);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );
};
