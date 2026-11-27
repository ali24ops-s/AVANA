/**
 * Fastify HTTP routes for AVANA Pocket Clinical Verification (Phase 2C-2).
 *
 * Implements endpoints under `/v1/pocket/assertions`:
 * - POST /v1/pocket/assertions/:id/verify
 * - POST /v1/pocket/assertions/:id/reject-verification
 * - POST /v1/pocket/assertions/conflicts
 * - GET  /v1/pocket/assertions/:id/verifications
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { DomainError } from "@avana/domain";
import type { AssertionVerificationService } from "./assertion-verification-service.js";
import { makeAuthMiddleware, type AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { extractActor } from "./reviewer-routes.js";

export interface AssertionVerificationRouteOptions {
  assertionVerificationService: AssertionVerificationService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

interface AssertionParams {
  id: string;
}

interface VerifyBody {
  clinicalReviewNotes: string;
  parentVerificationId?: string | null;
}

interface RejectVerificationBody {
  clinicalReviewNotes: string;
  parentVerificationId?: string | null;
}

interface ConflictBody {
  assertionAId: string;
  assertionBId: string;
  conflictSubject: string;
  discrepancyDescription: string;
}

interface ResolveConflictParams {
  conflictId: string;
}

interface ResolveConflictBody {
  outcome: "resolved" | "dismissed";
  resolutionNotes: string;
}

export const pocketAssertionVerificationRoutes: FastifyPluginAsync<AssertionVerificationRouteOptions> = async (
  app,
  opts,
) => {
  const { assertionVerificationService, sessionService, userStore } = opts;
  const { requireAuth, requireRole } = makeAuthMiddleware({ sessionService, userStore });

  // Enforce strict no-cache/no-store policy on all verification endpoints
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    reply.header("Pragma", "no-cache");
  });

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/:id/verify
  // ---------------------------------------------------------------------------
  app.post<{ Params: AssertionParams; Body: VerifyBody }>(
    "/v1/pocket/assertions/:id/verify",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      if (!body?.clinicalReviewNotes) {
        throw new DomainError("bad_request", "Clinical review notes are required");
      }

      const result = await assertionVerificationService.verifyAssertion(actor, {
        assertionId: id,
        clinicalReviewNotes: body.clinicalReviewNotes,
        parentVerificationId: body.parentVerificationId,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/:id/reject-verification
  // ---------------------------------------------------------------------------
  app.post<{ Params: AssertionParams; Body: RejectVerificationBody }>(
    "/v1/pocket/assertions/:id/reject-verification",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;
      const body = request.body;

      if (!body?.clinicalReviewNotes) {
        throw new DomainError("bad_request", "Clinical review critique notes are required");
      }

      const result = await assertionVerificationService.rejectAssertionVerification(actor, {
        assertionId: id,
        clinicalReviewNotes: body.clinicalReviewNotes,
        parentVerificationId: body.parentVerificationId,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/conflicts
  // ---------------------------------------------------------------------------
  app.post<{ Body: ConflictBody }>(
    "/v1/pocket/assertions/conflicts",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const body = request.body;

      if (!body) {
        throw new DomainError("bad_request", "Conflict payload is required");
      }

      const conflict = await assertionVerificationService.recordClinicalConflict(actor, {
        assertionAId: body.assertionAId,
        assertionBId: body.assertionBId,
        conflictSubject: body.conflictSubject,
        discrepancyDescription: body.discrepancyDescription,
      });

      return reply.code(201).send({
        success: true,
        data: conflict,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/pocket/assertions/conflicts/:conflictId/resolve (platform_admin only)
  // ---------------------------------------------------------------------------
  app.post<{ Params: ResolveConflictParams; Body: ResolveConflictBody }>(
    "/v1/pocket/assertions/conflicts/:conflictId/resolve",
    {
      preHandler: [requireAuth, requireRole("platform_admin")],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { conflictId } = request.params;
      const body = request.body;

      if (!body) {
        throw new DomainError("bad_request", "Resolution payload is required");
      }

      const resolved = await assertionVerificationService.resolveConflict(actor, {
        conflictId,
        outcome: body.outcome,
        resolutionNotes: body.resolutionNotes,
      });

      return reply.code(200).send({
        success: true,
        data: resolved,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/pocket/assertions/:id/verifications
  // ---------------------------------------------------------------------------
  app.get<{ Params: AssertionParams }>(
    "/v1/pocket/assertions/:id/verifications",
    {
      preHandler: [requireAuth],
    },
    async (request, reply: FastifyReply) => {
      const actor = extractActor(request);
      const { id } = request.params;

      const result = await assertionVerificationService.getAssertionVerifications(actor, id);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    },
  );
};
