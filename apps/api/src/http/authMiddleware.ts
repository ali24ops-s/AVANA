/**
 * Authentication middleware for Fastify.
 *
 * Reusable prehandler that extracts the session from the cookie,
 * validates it, and attaches the authenticated user to the request
 * context. Routes that require authentication use this as a preHandler.
 *
 * Reuses PR-7 session infrastructure (SessionService, SessionStore).
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { SessionService } from "../modules/identity/session-service.js";
import type { UserStore } from "../modules/identity/user-store.js";
import { DomainError } from "@avana/domain";

export type AuthMiddlewareDeps = {
  sessionService: SessionService;
  userStore: UserStore;
};

/**
 * Factory that creates a Fastify preHandler which enforces authentication.
 *
 * Usage in routes:
 * ```ts
 * const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
 * app.get("/v1/some-resource", { preHandler: [requireAuth] }, handler);
 * ```
 */
export function makeAuthMiddleware(deps: AuthMiddlewareDeps) {
  const { sessionService, userStore } = deps;

  /**
   * Fastify preHandler hook.
   *
   * On success, attaches `request.user` with `{ userId, email, role }`.
   * On failure, throws DomainError("unauthorized").
   */
  async function requireAuth(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const sessionCookie = request.cookies?.["avana_session"];
    if (!sessionCookie) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const user = await sessionService.validateSession(sessionCookie);
    if (!user) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    // Resolve full user record to get role
    const userRecord = await userStore.findById(user.userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    // Attach authenticated user to request for downstream handlers
    const reqAny = request as unknown as {
      user?: { userId: string; email: string; role: string };
    };
    reqAny.user = {
      userId: userRecord.id,
      email: userRecord.email,
      role: userRecord.role,
    };
  }

  return { requireAuth };
}
