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
import { DomainError, type Role } from "@avana/domain";

export type AuthMiddlewareDeps = {
  sessionService: SessionService;
  userStore: UserStore;
};

/**
 * Factory that creates a Fastify preHandler which enforces authentication.
 *
 * Usage in routes:
 * ```ts
 * const { requireAuth, requireRole } = makeAuthMiddleware({ sessionService, userStore });
 * app.get("/v1/some-resource", { preHandler: [requireAuth] }, handler);
 * app.get("/v1/admin-resource", { preHandler: [requireAuth, requireRole('platform_admin')] }, handler);
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
    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : undefined;

    const token = sessionCookie || bearerToken;
    if (!token) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const details = await sessionService.validateSessionDetails(token);
    if (details.revoked) {
      if (
        details.revocationReason === "session_takeover" ||
        details.revocationReason === "admin_reset"
      ) {
        throw new DomainError(
          "SESSION_REVOKED",
          "این نشست به دلیل ورود جدید از دستگاه دیگر یا بازنشانی توسط مدیر نامعتبر شده است.",
          {
            code: "SESSION_REVOKED",
            reason: details.revocationReason,
          },
        );
      }
      throw new DomainError("unauthorized", "Not signed in");
    }

    if (!details.valid || !details.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const user = details.user;

    // Resolve full user record to get role
    const userRecord = await userStore.findById(user.userId);
    if (!userRecord) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const effectiveRole =
      userRecord.globalRole === "platform_admin" || userRecord.role === "platform_admin"
        ? "platform_admin"
        : userRecord.globalRole === "content_worker" || userRecord.role === "content_worker"
          ? "content_worker"
          : userRecord.role;

    // Attach authenticated user to request for downstream handlers
    const reqAny = request as unknown as {
      user?: { userId: string; email: string; role: string; globalRole?: string | null };
    };
    reqAny.user = {
      userId: userRecord.id,
      email: userRecord.email,
      role: effectiveRole,
      globalRole: userRecord.globalRole,
    };
  }

  /**
   * Fastify preHandler hook generator for role-based authorization.
   * Must be used AFTER `requireAuth`.
   */
  function requireRole(requiredRole: Role) {
    return async function (
      request: FastifyRequest,
      _reply: FastifyReply,
    ): Promise<void> {
      const reqAny = request as unknown as {
        user?: { userId: string; email: string; role: string; globalRole?: string | null };
      };

      if (!reqAny.user) {
        throw new DomainError("unauthorized", "Not signed in");
      }

      if (
        reqAny.user.role !== requiredRole &&
        reqAny.user.globalRole !== "platform_admin" &&
        reqAny.user.role !== "platform_admin"
      ) {
        throw new DomainError("forbidden", "Access denied. Insufficient permissions.");
      }
    };
  }

  /**
   * Fastify preHandler hook for optional authentication.
   * Attaches `request.user` if valid token/session exists; does not throw if absent.
   */
  async function optionalAuth(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const sessionCookie = request.cookies?.["avana_session"];
    const authHeader = request.headers.authorization;
    const bearerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : undefined;

    const token = sessionCookie || bearerToken;
    if (!token) {
      return;
    }

    try {
      const details = await sessionService.validateSessionDetails(token);
      if (details.valid && details.user && !details.revoked) {
        const userRecord = await userStore.findById(details.user.userId);
        if (userRecord) {
          const effectiveRole =
            userRecord.globalRole === "platform_admin" || userRecord.role === "platform_admin"
              ? "platform_admin"
              : userRecord.globalRole === "content_worker" || userRecord.role === "content_worker"
                ? "content_worker"
                : userRecord.role;

          const reqAny = request as unknown as {
            user?: { userId: string; email: string; role: string; globalRole?: string | null };
          };
          reqAny.user = {
            userId: userRecord.id,
            email: userRecord.email,
            role: effectiveRole,
            globalRole: userRecord.globalRole,
          };
        }
      }
    } catch {
      // Ignore errors in optional auth
    }
  }

  return { requireAuth, optionalAuth, requireRole };
}
