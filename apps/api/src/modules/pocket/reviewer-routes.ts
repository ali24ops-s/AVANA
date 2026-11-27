/**
 * Fastify HTTP routes for AVANA Pocket Clinical Reviewer Governance.
 *
 * Implements endpoints under `/v1/pocket/reviewers`:
 * - POST /v1/pocket/reviewers/credentials             (platform_admin only)
 * - POST /v1/pocket/reviewers/credentials/:id/suspend (platform_admin only)
 * - POST /v1/pocket/reviewers/credentials/:id/revoke  (platform_admin only)
 * - GET  /v1/pocket/reviewers/credentials             (authenticated users; self or admin)
 * - GET  /v1/pocket/reviewers/credentials/:id         (authenticated users; self or admin)
 * - GET  /v1/pocket/reviewers/me                      (authenticated users; self check)
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { DomainError, type Actor } from "@avana/domain";
import type { ReviewerService } from "./reviewer-service.js";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";

export interface ReviewerRouteOptions {
  reviewerService: ReviewerService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface GrantBody {
  userId: string;
  medicalLicenseNumber: string;
  specialty: string;
  licensingAuthority: string;
  licenseExpiresAt: string;
  reason?: string;
}

interface SuspendBody {
  reason: string;
}

interface ReactivateBody {
  reason?: string;
}

interface RevokeBody {
  reason: string;
}

interface CredentialParams {
  id: string;
}

interface ListQuery {
  userId?: string;
  isActive?: string | boolean;
  limit?: string | number;
  offset?: string | number;
}

export function extractActor(request: FastifyRequest): Actor {
  const reqAny = request as unknown as {
    user?: {
      userId: string;
      email: string;
      role: string;
      globalRole?: string | null;
      teacherStatus?: "pending" | "approved" | "rejected";
    };
  };

  if (!reqAny.user) {
    throw new DomainError("unauthorized", "Not signed in");
  }

  return {
    userId: reqAny.user.userId as Actor["userId"],
    role: reqAny.user.role as Actor["role"],
    globalRole: reqAny.user.globalRole as Actor["globalRole"],
    teacherStatus: reqAny.user.teacherStatus ?? null,
  };
}

export const pocketReviewerRoutes: FastifyPluginAsync<ReviewerRouteOptions> = async (
  app,
  opts,
) => {
  const { reviewerService, sessionService, userStore } = opts;
  const { requireAuth, requireRole } = makeAuthMiddleware({ sessionService, userStore });

  // Enforce strict no-cache/no-store policy on all reviewer governance endpoints
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    reply.header("Pragma", "no-cache");
  });

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/reviewers/credentials (Grant - platform_admin only)
  // ---------------------------------------------------------------------------
  app.post<{ Body: GrantBody }>(
    "/v1/pocket/reviewers/credentials",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const body = request.body;

      if (!body) {
        throw new DomainError("bad_request", "Request body is required");
      }

      const cred = await reviewerService.grantCredential(actor, {
        userId: body.userId,
        medicalLicenseNumber: body.medicalLicenseNumber,
        specialty: body.specialty,
        licensingAuthority: body.licensingAuthority,
        licenseExpiresAt: new Date(body.licenseExpiresAt),
        reason: body.reason,
      });

      return reply.code(201).send({
        success: true,
        data: cred,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/reviewers/credentials/:id/suspend (Suspend - platform_admin only)
  // ---------------------------------------------------------------------------
  app.post<{ Params: CredentialParams; Body: SuspendBody }>(
    "/v1/pocket/reviewers/credentials/:id/suspend",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      if (!body?.reason) {
        throw new DomainError("bad_request", "Suspension reason is required");
      }

      const updated = await reviewerService.suspendCredential(actor, {
        credentialId: id,
        reason: body.reason,
      });

      return reply.code(200).send({
        success: true,
        data: updated,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/reviewers/credentials/:id/revoke (Revoke - platform_admin only)
  // ---------------------------------------------------------------------------
  app.post<{ Params: CredentialParams; Body: RevokeBody }>(
    "/v1/pocket/reviewers/credentials/:id/revoke",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      const updated = await reviewerService.revokeCredential(actor, {
        credentialId: id,
        reason: body?.reason ?? "",
      });

      return reply.code(200).send({
        success: true,
        data: updated,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/reviewers/credentials/:id/reactivate (Reactivate - platform_admin only)
  // ---------------------------------------------------------------------------
  app.post<{ Params: CredentialParams; Body: ReactivateBody }>(
    "/v1/pocket/reviewers/credentials/:id/reactivate",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      const updated = await reviewerService.reactivateCredential(actor, {
        credentialId: id,
        reason: body?.reason,
      });

      return reply.code(200).send({
        success: true,
        data: updated,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/reviewers/credentials/:id/events (Event History - platform_admin only)
  // ---------------------------------------------------------------------------
  app.get<{ Params: CredentialParams }>(
    "/v1/pocket/reviewers/credentials/:id/events",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;

      const events = await reviewerService.listCredentialEvents(actor, id);

      return reply.code(200).send({
        success: true,
        data: events,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/reviewers/me (Current caller's active reviewer status)
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/pocket/reviewers/me",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const activeCred = await reviewerService.getActiveCredentialForUser(actor);

      return reply.code(200).send({
        success: true,
        data: {
          isReviewer: activeCred !== null,
          credential: activeCred,
        },
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/reviewers/credentials (List credentials)
  // ---------------------------------------------------------------------------
  app.get<{ Querystring: ListQuery }>(
    "/v1/pocket/reviewers/credentials",
    {
      preHandler: [requireAuth],
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

      const limit = q.limit ? Number(q.limit) : undefined;
      const offset = q.offset ? Number(q.offset) : undefined;

      const list = await reviewerService.listCredentials(actor, {
        userId: q.userId,
        isActive,
        limit,
        offset,
      });

      return reply.code(200).send({
        success: true,
        data: list,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/reviewers/credentials/:id (Get credential by ID)
  // ---------------------------------------------------------------------------
  app.get<{ Params: CredentialParams }>(
    "/v1/pocket/reviewers/credentials/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;

      const cred = await reviewerService.getCredential(actor, id);

      return reply.code(200).send({
        success: true,
        data: cred,
      });
    },
  );
};
