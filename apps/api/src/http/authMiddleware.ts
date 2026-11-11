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
import { DomainError, type Role, resolveEffectiveRole } from "@avana/domain";
import { attachSessionCookies, attachCsrfCookie } from "../modules/identity/cookie-utils.js";
import { validateCsrfToken } from "../modules/identity/csrf.js";

export type AuthMiddlewareDeps = {
  sessionService: SessionService;
  userStore: UserStore;
  enforceCsrf?: boolean;
  allowedOrigins?: string[];
};

function parseOriginKey(originStr: string): string | null {
  try {
    const u = new URL(originStr);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

export function isValidOriginOrReferer(
  request: FastifyRequest,
  allowedOrigins: readonly string[],
): { valid: boolean; reason?: string } {
  const originHeader = request.headers["origin"] as string | undefined;
  const refererHeader = request.headers["referer"] as string | undefined;

  const allowedSet = new Set<string>();
  for (const o of allowedOrigins) {
    const k = parseOriginKey(o);
    if (k) allowedSet.add(k);
  }

  // Standard platform origins
  allowedSet.add("https://aavana.ir");
  allowedSet.add("http://localhost:5173");
  allowedSet.add("http://localhost:5174");
  allowedSet.add("http://127.0.0.1:5173");
  allowedSet.add("http://127.0.0.1:5174");

  if (originHeader) {
    const originKey = parseOriginKey(originHeader);
    if (!originKey || !allowedSet.has(originKey)) {
      return { valid: false, reason: `Origin ${originHeader} not allowed` };
    }
    return { valid: true };
  }

  if (refererHeader) {
    const refererKey = parseOriginKey(refererHeader);
    if (!refererKey || !allowedSet.has(refererKey)) {
      return { valid: false, reason: `Referer ${refererHeader} not allowed` };
    }
    return { valid: true };
  }

  return { valid: false, reason: "Missing Origin and Referer headers" };
}

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
    reply: FastifyReply,
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

    if (details.renewed) {
      attachSessionCookies(reply, token, sessionService.getConfig());
    } else if (sessionCookie) {
      // -----------------------------------------------------------------------
      // Existing Sessions CSRF Bootstrap / Sync
      // If user has a valid session but missing or old-format CSRF cookie,
      // issue a fresh bound CSRF cookie immediately without rotating session token.
      // -----------------------------------------------------------------------
      const csrfCookie = request.cookies?.["avana_csrf"];
      const hasValidCsrf = csrfCookie && validateCsrfToken(csrfCookie, token);
      if (!hasValidCsrf) {
        attachCsrfCookie(reply, token, sessionService.getConfig());
      }
    }

    // -------------------------------------------------------------------------
    // CSRF & Origin Protection for Cookie-based State-Changing Requests (POST/PUT/PATCH/DELETE)
    // -------------------------------------------------------------------------
    const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    if (sessionCookie && isStateChanging) {
      const csrfCookie = request.cookies?.["avana_csrf"];
      const csrfHeader = (request.headers["x-csrf-token"] ??
        request.headers["X-CSRF-Token"]) as string | undefined;

      const isProd = process.env.NODE_ENV === "production";
      const shouldEnforce =
        isProd ||
        Boolean(csrfCookie) ||
        Boolean(csrfHeader) ||
        Boolean(deps.enforceCsrf) ||
        process.env.AVANA_CSRF_ENFORCE === "true";

      if (shouldEnforce) {
        // 1. Origin / Referer Validation
        const originCheck = isValidOriginOrReferer(
          request,
          deps.allowedOrigins ?? [],
        );
        const hasOriginOrReferer = Boolean(request.headers["origin"] || request.headers["referer"]);

        if (hasOriginOrReferer && !originCheck.valid) {
          throw new DomainError("forbidden", `CSRF Origin blocked: ${originCheck.reason}`);
        }

        // Fail-closed when Origin/Referer is missing in Production or when strict enforcement requested
        if (!hasOriginOrReferer && (isProd || Boolean(deps.enforceCsrf) || process.env.AVANA_CSRF_ENFORCE === "true")) {
          throw new DomainError("forbidden", "Origin or Referer header required for state-changing requests");
        }

        // 2. CSRF Token Validation
        if (!csrfHeader) {
          throw new DomainError("forbidden", "CSRF token missing");
        }
        if (csrfCookie && csrfHeader !== csrfCookie) {
          throw new DomainError("forbidden", "CSRF token mismatch");
        }
        if (!validateCsrfToken(csrfHeader, token)) {
          throw new DomainError("forbidden", "Invalid CSRF token");
        }
      }
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
        : resolveEffectiveRole(userRecord.globalRole, [userRecord.role]);

    // Attach authenticated user to request for downstream handlers
    const reqAny = request as unknown as {
      user?: {
        userId: string;
        email: string;
        role: string;
        globalRole?: string | null;
        teacherStatus?: "pending" | "approved" | "rejected";
      };
    };
    reqAny.user = {
      userId: userRecord.id,
      email: userRecord.email,
      role: effectiveRole,
      globalRole: userRecord.globalRole,
      teacherStatus: userRecord.teacherStatus,
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
    reply: FastifyReply,
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
        if (details.renewed) {
          attachSessionCookies(reply, token, sessionService.getConfig());
        } else if (sessionCookie) {
          const csrfCookie = request.cookies?.["avana_csrf"];
          const hasValidCsrf = csrfCookie && validateCsrfToken(csrfCookie, token);
          if (!hasValidCsrf) {
            attachCsrfCookie(reply, token, sessionService.getConfig());
          }
        }
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
