/**
 * Fastify HTTP routes for AVANA Pocket Clinical Assertion Consumption (Phase 2C-4A).
 *
 * Implements endpoints under `/v1/pocket/aggregates`:
 * - GET /v1/pocket/aggregates/:type/:id/assertions (Published clinical assertions with ETag support)
 * - GET /v1/pocket/aggregates/:type/:id/version    (Lightweight entity version probe with ETag)
 */

import { createHash } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { AssertionConsumptionService } from "./assertion-consumption-service.js";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";

export interface AssertionConsumptionRouteOptions {
  assertionConsumptionService: AssertionConsumptionService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface AggregateParams {
  type: string;
  id: string;
}

export function formatEntityETag(
  aggregateType: string,
  aggregateId: string,
  currentVersion: number,
  validAssertionIds?: readonly string[],
): string {
  if (!validAssertionIds) {
    return `W/"${aggregateType}-${aggregateId}-v${currentVersion}"`;
  }
  const digest = createHash("sha256")
    .update(validAssertionIds.join(","))
    .digest("hex")
    .slice(0, 12);
  return `W/"${aggregateType}-${aggregateId}-v${currentVersion}-${digest}"`;
}

export function matchesETag(clientHeader: string | undefined, expectedEtag: string): boolean {
  if (!clientHeader) return false;
  const rawExpected = expectedEtag.replace(/^W\//, "");
  const unquotedExpected = rawExpected.replace(/^"|"$/g, "");
  const tokens = clientHeader.split(",").map((t) => t.trim());

  return tokens.some((token) => {
    // RFC 7232 Section 3.2: Wildcard match for existing resource (exact unquoted asterisk only)
    if (token === "*") {
      return true;
    }
    const cleanToken = token.replace(/^W\//, "").replace(/^"|"$/g, "");
    return (
      token === expectedEtag ||
      token === rawExpected ||
      token === `"${unquotedExpected}"` ||
      cleanToken === unquotedExpected
    );
  });
}

export const pocketAssertionConsumptionRoutes: FastifyPluginAsync<AssertionConsumptionRouteOptions> = async (
  app,
  opts,
) => {
  const { assertionConsumptionService, sessionService, userStore } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/aggregates/:type/:id/assertions
  // ---------------------------------------------------------------------------
  app.get<{ Params: AggregateParams }>(
    "/v1/pocket/aggregates/:type/:id/assertions",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { type, id } = request.params;

      const result = await assertionConsumptionService.getPublishedAssertionsByAggregate(type, id);
      const etag = formatEntityETag(
        result.aggregateType,
        result.aggregateId,
        result.currentVersion,
        result.assertions.map((a) => a.id),
      );

      // Check If-None-Match for cache validation (304 Not Modified)
      const ifNoneMatch = request.headers["if-none-match"];
      if (matchesETag(ifNoneMatch, etag)) {
        return reply
          .status(304)
          .header("ETag", etag)
          .header("Cache-Control", "private, no-cache")
          .send();
      }

      return reply
        .code(200)
        .header("ETag", etag)
        .header("Cache-Control", "private, no-cache")
        .header("X-Entity-Version", String(result.currentVersion))
        .send({
          success: true,
          data: result,
        });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/aggregates/:type/:id/version
  // ---------------------------------------------------------------------------
  app.get<{ Params: AggregateParams }>(
    "/v1/pocket/aggregates/:type/:id/version",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { type, id } = request.params;

      const result = await assertionConsumptionService.getCurrentVersion(type, id);
      const etag = formatEntityETag(result.aggregateType, result.aggregateId, result.currentVersion);

      const ifNoneMatch = request.headers["if-none-match"];
      if (matchesETag(ifNoneMatch, etag)) {
        return reply
          .status(304)
          .header("ETag", etag)
          .header("Cache-Control", "private, no-cache")
          .send();
      }

      return reply
        .code(200)
        .header("ETag", etag)
        .header("Cache-Control", "private, no-cache")
        .header("X-Entity-Version", String(result.currentVersion))
        .send({
          success: true,
          data: result,
        });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/assertions/:id (Public Published Assertion Read API)
  // ---------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    "/v1/pocket/assertions/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { id } = request.params;
      const result = await assertionConsumptionService.getPublishedAssertionById(id);

      return reply
        .code(200)
        .header("Cache-Control", "private, no-cache, no-store, must-revalidate")
        .header("Pragma", "no-cache")
        .send({
          success: true,
          data: result,
        });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/aggregates/:type/:id/metadata (Unified Aggregate Metadata)
  // ---------------------------------------------------------------------------
  app.get<{ Params: AggregateParams }>(
    "/v1/pocket/aggregates/:type/:id/metadata",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const { type, id } = request.params;
      const result = await assertionConsumptionService.getAggregateMetadata(type, id);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );
};
