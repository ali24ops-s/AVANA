/**
 * Organization and membership HTTP routes.
 *
 * Per PR-8 acceptance criteria:
 * - POST /v1/organizations — Create organization (first user becomes admin)
 * - GET  /v1/organizations — List organizations for the actor
 * - GET  /v1/organizations/:organizationId — Get org (scoped resolution)
 * - GET  /v1/organizations/:organizationId/members — List memberships
 *
 * All routes require authentication.
 * Authorization decisions are delegated to the domain policy layer.
 */

import type { FastifyPluginAsync } from "fastify";
import { DomainError, type Actor, type OrganizationId } from "@avana/domain";
import { OrganizationService } from "./organization-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { OrganizationStore } from "./organization-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface OrganizationRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  organizationStore: OrganizationStore;
  auditService?: AuditService;
}

export const organizationRoutes: FastifyPluginAsync<
  OrganizationRouteOptions
> = async (app, opts) => {
  const { sessionService, userStore, organizationStore, auditService } = opts;

  // Build auth middleware and service
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const orgService = new OrganizationService(
    organizationStore,
    undefined,
    auditService,
  );

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

  /**
   * POST /v1/organizations — Create a new organization.
   * The first user becomes organization_admin.
   */
  app.post(
    "/v1/organizations",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body as { name?: string };

      if (
        !body.name ||
        typeof body.name !== "string" ||
        body.name.trim().length === 0
      ) {
        throw new DomainError("bad_request", "Organization name is required");
      }

      if (body.name.trim().length > 255) {
        throw new DomainError(
          "bad_request",
          "Organization name must not exceed 255 characters",
        );
      }

      const org = await orgService.createOrganization(actor, body.name.trim());
      reply.code(201);

      return {
        request_id: request.id,
        organization: {
          id: org.id,
          name: org.name,
        },
      };
    },
  );

  /**
   * GET /v1/organizations — List organizations visible to the actor.
   */
  app.get(
    "/v1/organizations",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const orgs = await orgService.listOrganizations(actor);

      return {
        request_id: request.id,
        items: orgs.map((org: { id: string; name: string }) => ({
          id: org.id,
          name: org.name,
        })),
        pagination: {
          limit: Math.max(1, orgs.length),
          next_cursor: null,
        },
      };
    },
  );

  /**
   * GET /v1/organizations/:organizationId — Get organization (scoped).
   * Uses org-scoped resolution to prevent ID-only lookups.
   */
  app.get(
    "/v1/organizations/:organizationId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };

      if (
        !params.organizationId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          params.organizationId,
        )
      ) {
        throw new DomainError("bad_request", "Invalid organization ID");
      }

      const organizationId = params.organizationId as OrganizationId;

      // Scoped resolution: actor must have membership
      const org = await orgService.resolveScopedOrganization(
        actor,
        organizationId,
      );

      return {
        request_id: request.id,
        organization: {
          id: org.id,
          name: org.name,
        },
      };
    },
  );

  /**
   * GET /v1/organizations/:organizationId/members — List memberships.
   * Only organization admins can list members.
   */
  app.get(
    "/v1/organizations/:organizationId/members",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };

      if (
        !params.organizationId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          params.organizationId,
        )
      ) {
        throw new DomainError("bad_request", "Invalid organization ID");
      }

      const organizationId = params.organizationId as OrganizationId;

      const memberships = await orgService.listMemberships(
        actor,
        organizationId,
      );

      return {
        request_id: request.id,
        items: memberships.map(
          (m: { id: string; userId: string; role: string }) => ({
            id: m.id,
            user_id: m.userId,
            role: m.role,
          }),
        ),
        pagination: {
          limit: Math.max(1, memberships.length),
          next_cursor: null,
        },
      };
    },
  );
};
