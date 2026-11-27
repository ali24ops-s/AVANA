/**
 * Fastify HTTP routes for AVANA Pocket Clinical Search & Discovery (UI-4.1).
 *
 * Implements endpoints:
 * - GET /v1/pocket/search               (Unified Search across all 4 pillars)
 * - GET /v1/pocket/search/suggestions   (Typeahead suggestions)
 * - GET /v1/pocket/discovery            (Category/pillar browsing without search query)
 * - GET /v1/pocket/aggregates/:type/:id/related (Related clinical entities)
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { PocketSearchService } from "./pocket-search-service.js";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";

export interface PocketSearchRouteOptions {
  pocketSearchService: PocketSearchService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface SearchQueryParams {
  q?: string;
  type?: string;
  limit?: string;
  offset?: string;
}

interface SuggestionsQueryParams {
  q?: string;
  type?: string;
  limit?: string;
}

interface DiscoveryQueryParams {
  type?: string;
  category?: string;
  sort?: string;
  limit?: string;
  offset?: string;
}

interface AggregateParams {
  type: string;
  id: string;
}

export const pocketSearchRoutes: FastifyPluginAsync<PocketSearchRouteOptions> = async (
  app,
  opts,
) => {
  const { pocketSearchService, sessionService, userStore } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  // Prevent stale caching of clinically-gated search/discovery responses
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    reply.header("Pragma", "no-cache");
  });

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/search
  // ---------------------------------------------------------------------------
  app.get<{ Querystring: SearchQueryParams }>(
    "/v1/pocket/search",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { q, type, limit, offset } = request.query;

      const result = await pocketSearchService.search({
        q,
        type,
        limit,
        offset,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/search/suggestions
  // ---------------------------------------------------------------------------
  app.get<{ Querystring: SuggestionsQueryParams }>(
    "/v1/pocket/search/suggestions",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { q, type, limit } = request.query;

      const result = await pocketSearchService.getSuggestions({
        q,
        type,
        limit,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/discovery
  // ---------------------------------------------------------------------------
  app.get<{ Querystring: DiscoveryQueryParams }>(
    "/v1/pocket/discovery",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { type, category, sort, limit, offset } = request.query;

      const result = await pocketSearchService.getDiscovery({
        type,
        category,
        sort,
        limit,
        offset,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/aggregates/:type/:id/related
  // ---------------------------------------------------------------------------
  app.get<{ Params: AggregateParams }>(
    "/v1/pocket/aggregates/:type/:id/related",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { type, id } = request.params;

      const result = await pocketSearchService.getRelatedEntities(type, id);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );
};
