/**
 * Fastify HTTP routes for AVANA Pocket Assertion Publishing (Phase 2C-3: Atomic Publishing Workflow).
 *
 * Implements endpoints under `/v1/pocket/assertions`:
 * - POST /v1/pocket/assertions/:id/publish
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { AssertionPublishingService } from "./assertion-publishing-service.js";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { extractActor } from "./reviewer-routes.js";

export interface AssertionPublishingRouteOptions {
  assertionPublishingService: AssertionPublishingService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface AssertionParams {
  id: string;
}

interface PublishBody {
  notes?: string;
}

export const pocketAssertionPublishingRoutes: FastifyPluginAsync<AssertionPublishingRouteOptions> = async (
  app,
  opts,
) => {
  const { assertionPublishingService, sessionService, userStore } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/:id/publish
  // ---------------------------------------------------------------------------
  app.post<{ Params: AssertionParams; Body?: PublishBody }>(
    "/v1/pocket/assertions/:id/publish",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      const result = await assertionPublishingService.publishAssertion(actor, {
        assertionId: id,
        notes: body?.notes,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );
};
