/**
 * Fastify HTTP routes for AVANA Pocket Safety Override Management (Phase D.3).
 *
 * Implements administrative endpoints under `/v1/pocket/safety-overrides`:
 * - POST /v1/pocket/safety-overrides            (platform_admin only)
 * - POST /v1/pocket/safety-overrides/:id/clear  (platform_admin only)
 * - GET  /v1/pocket/safety-overrides            (platform_admin only)
 * - GET  /v1/pocket/safety-overrides/:id        (platform_admin only)
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { DomainError } from "@avana/domain";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { extractActor } from "./reviewer-routes.js";
import type { SafetyOverrideService } from "./safety-override-service.js";
import type { SafetyOverrideTargetType } from "./safety-override-store.js";

export interface SafetyOverrideRouteOptions {
  safetyOverrideService: SafetyOverrideService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface ActivateBody {
  targetEntityType: string;
  targetEntityId: string;
  reason: string;
}

interface ClearBody {
  reason: string;
}

interface OverrideParams {
  id: string;
}

interface ListQuery {
  targetEntityType?: string;
  targetEntityId?: string;
  isActive?: string | boolean;
  limit?: string | number;
  offset?: string | number;
}

export const pocketSafetyOverrideRoutes: FastifyPluginAsync<SafetyOverrideRouteOptions> = async (
  app,
  opts,
) => {
  const { safetyOverrideService, sessionService, userStore } = opts;
  const { requireAuth, requireRole } = makeAuthMiddleware({ sessionService, userStore });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    reply.header("Pragma", "no-cache");
  });

  // POST /v1/pocket/safety-overrides
  app.post<{ Body: ActivateBody }>(
    "/v1/pocket/safety-overrides",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const body = request.body;

      if (!body) {
        throw new DomainError("bad_request", "Request body is required");
      }

      const result = await safetyOverrideService.activateOverride(actor, {
        targetEntityType: body.targetEntityType,
        targetEntityId: body.targetEntityId,
        reason: body.reason,
      });

      return reply.code(201).send({
        success: true,
        data: result,
      });
    },
  );

  // POST /v1/pocket/safety-overrides/:id/clear
  app.post<{ Params: OverrideParams; Body: ClearBody }>(
    "/v1/pocket/safety-overrides/:id/clear",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      if (!body) {
        throw new DomainError("bad_request", "Request body is required");
      }

      const result = await safetyOverrideService.clearOverride(actor, {
        overrideId: id,
        reason: body.reason,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // GET /v1/pocket/safety-overrides
  app.get<{ Querystring: ListQuery }>(
    "/v1/pocket/safety-overrides",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const q = request.query;

      const isActive =
        q.isActive === "true" || q.isActive === true
          ? true
          : q.isActive === "false" || q.isActive === false
            ? false
            : undefined;

      const list = await safetyOverrideService.listOverrides(actor, {
        targetEntityType: q.targetEntityType as SafetyOverrideTargetType | undefined,
        targetEntityId: q.targetEntityId,
        isActive,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });

      return reply.code(200).send({
        success: true,
        data: list,
      });
    },
  );

  // GET /v1/pocket/safety-overrides/:id
  app.get<{ Params: OverrideParams }>(
    "/v1/pocket/safety-overrides/:id",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;

      const result = await safetyOverrideService.getOverrideWithHistory(actor, id);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );
};
