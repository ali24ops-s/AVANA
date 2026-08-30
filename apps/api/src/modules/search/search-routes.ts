/**
 * Search HTTP Routes.
 *
 * Provides:
 * - GET /v1/search — Search across user-accessible courses and published shared content.
 */

import type { FastifyPluginAsync } from "fastify";
import { DomainError, type Actor, type OrganizationId } from "@avana/domain";
import { SearchService } from "./search-service.js";
import type { SearchStore } from "./search-store.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";

export interface SearchRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  searchStore: SearchStore;
  systemOrganizationId?: OrganizationId;
}

export const searchRoutes: FastifyPluginAsync<SearchRouteOptions> = async (
  app,
  opts,
) => {
  const { sessionService, userStore, searchStore, systemOrganizationId } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const searchService = new SearchService(searchStore, systemOrganizationId);

  /**
   * Helper to extract actor from authenticated request.
   */
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

  // ---------------------------------------------------------------------------
  // GET /v1/search — Global search across courses and shared content
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/search",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const query = (request.query ?? {}) as {
        q?: string;
        limit?: string;
      };

      const rawQ = query.q ?? "";
      if (!rawQ || typeof rawQ !== "string" || rawQ.trim().length === 0) {
        throw new DomainError("bad_request", "Search query is required");
      }

      const limit = query.limit ? parseInt(query.limit, 10) : 10;
      const safeLimit = isNaN(limit) ? 10 : limit;

      const result = await searchService.search(
        actor,
        rawQ,
        request.id,
        safeLimit,
      );

      return result;
    },
  );
};
