/**
 * Fastify HTTP routes for AVANA Pocket Admin Dashboard (Phase 2.1).
 *
 * Implements:
 * - GET /v1/pocket/admin/summary (platform_admin only)
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import type { ClinicalAggregateType } from "./assertion-consumption-store.js";
import { extractActor } from "./reviewer-routes.js";
import type { PocketAdminService } from "./pocket-admin-service.js";

export interface PocketAdminRouteOptions {
  pocketAdminService: PocketAdminService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface AdminAssertionsListQuery {
  status?: string;
  aggregateType?: string;
  q?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: string | number;
  offset?: string | number;
}

export const pocketAdminRoutes: FastifyPluginAsync<PocketAdminRouteOptions> = async (
  app,
  opts,
) => {
  const { pocketAdminService, sessionService, userStore } = opts;
  const { requireAuth, requireRole } = makeAuthMiddleware({ sessionService, userStore });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    reply.header("Pragma", "no-cache");
  });

  // GET /v1/pocket/admin/summary
  app.get(
    "/v1/pocket/admin/summary",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const summary = await pocketAdminService.getDashboardSummary(actor);

      return reply.code(200).send({
        success: true,
        data: summary,
      });
    },
  );

  // GET /v1/pocket/admin/assertions
  app.get<{ Querystring: AdminAssertionsListQuery }>(
    "/v1/pocket/admin/assertions",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const q = request.query;

      const result = await pocketAdminService.listAssertions(actor, {
        status: q.status,
        aggregateType: q.aggregateType as ClinicalAggregateType | undefined,
        q: q.q,
        sortBy: q.sortBy === "createdAt" ? "createdAt" : "updatedAt",
        sortOrder: q.sortOrder === "asc" ? "asc" : "desc",
        limit: q.limit !== undefined ? Number(q.limit) : undefined,
        offset: q.offset !== undefined ? Number(q.offset) : undefined,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // GET /v1/pocket/admin/assertions/:id
  app.get<{ Params: { id: string } }>(
    "/v1/pocket/admin/assertions/:id",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const result = await pocketAdminService.getAssertionDetail(actor, request.params.id);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // GET /v1/pocket/reviewer/assertions (Active Clinical Reviewer Credential required)
  app.get<{ Querystring: AdminAssertionsListQuery }>(
    "/v1/pocket/reviewer/assertions",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const q = request.query;

      const result = await pocketAdminService.listReviewerAssertions(actor, {
        status: q.status,
        aggregateType: q.aggregateType as ClinicalAggregateType | undefined,
        q: q.q,
        sortBy: q.sortBy === "createdAt" ? "createdAt" : "updatedAt",
        sortOrder: q.sortOrder === "asc" ? "asc" : "desc",
        limit: q.limit !== undefined ? Number(q.limit) : undefined,
        offset: q.offset !== undefined ? Number(q.offset) : undefined,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // GET /v1/pocket/reviewer/assertions/:id (Active Clinical Reviewer Credential required)
  app.get<{ Params: { id: string } }>(
    "/v1/pocket/reviewer/assertions/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const result = await pocketAdminService.getReviewerAssertionDetail(
        actor,
        request.params.id,
      );

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );
};
