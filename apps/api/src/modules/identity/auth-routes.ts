/**
 * Authentication routes.
 *
 * Implements:
 *   POST /v1/auth/sign-in  - Authenticate and create session
 *   POST /v1/auth/sign-out - Revoke session
 *   GET  /v1/me            - Current user (session-based)
 */

import type { FastifyPluginAsync } from "fastify";
import type { IdentityAdapter } from "@avana/domain";
import { DomainError } from "@avana/domain";
import type { SessionService } from "./session-service.js";
import type { UserStore } from "./user-store.js";

export interface AuthRouteOptions {
  identityAdapter: IdentityAdapter;
  sessionService: SessionService;
  userStore: UserStore;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (
  app,
  opts,
) => {
  const { identityAdapter, sessionService, userStore } = opts;

  /**
   * GET /v1/me — Returns the current authenticated user.
   * If no valid session, returns 401 with standard error envelope.
   */
  app.get("/v1/me", async (request, _reply) => {
    const sessionCookie = request.cookies?.["avana_session"];
    if (!sessionCookie) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const user = await sessionService.validateSession(sessionCookie);
    if (!user) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    // Resolve full user record from store
    const userRecord = await userStore.findById(user.userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        role: userRecord.role,
      },
    };
  });

  /**
   * POST /v1/auth/sign-in — Authenticate and create session.
   */
  app.post("/v1/auth/sign-in", async (request, reply) => {
    const body = request.body as { email?: string; name?: string };

    if (!body.email) {
      throw new DomainError("bad_request", "Email is required");
    }

    // Verify identity through adapter
    const identity = await identityAdapter.verifyIdentity({
      email: body.email,
      name: body.name,
    });

    // Find or create local user
    let userRecord = await userStore.findByEmail(identity.email);

    if (!userRecord) {
      // First login — create local user
      userRecord = await userStore.createFromVerifiedIdentity(identity);
    }

    // Create session
    const { sessionToken } = await sessionService.createSession(userRecord.id);

    // Set session cookie
    const config = sessionService.getConfig();
    reply.setCookie("avana_session", sessionToken, {
      path: "/",
      httpOnly: true,
      secure: config.secure,
      sameSite: config.sameSite,
      maxAge: config.maxAgeMs / 1000,
    });

    // Set CSRF token cookie
    reply.setCookie("avana_csrf", sessionToken, {
      path: "/",
      httpOnly: false,
      secure: config.secure,
      sameSite: config.sameSite,
      maxAge: config.maxAgeMs / 1000,
    });

    return {
      request_id: request.id,
      user: {
        id: userRecord.id,
        email: userRecord.email,
        role: userRecord.role,
      },
    };
  });

  /**
   * POST /v1/auth/sign-out — Revoke session.
   * Returns 204 No Content per OpenAPI contract.
   */
  app.post("/v1/auth/sign-out", async (request, reply) => {
    const sessionCookie = request.cookies?.["avana_session"];
    if (sessionCookie) {
      await sessionService.revokeSession(sessionCookie);
    }

    // Clear cookies regardless
    reply.clearCookie("avana_session", { path: "/" });
    reply.clearCookie("avana_csrf", { path: "/" });

    reply.code(204);
    return;
  });
};
