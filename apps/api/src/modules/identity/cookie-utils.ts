import type { FastifyReply } from "fastify";
import type { SessionConfig } from "../../config.js";

/**
 * Attach or renew authenticated session and CSRF cookies on a Fastify reply.
 * Ensures identical cookie flags and maxAge across initial login, takeover,
 * and rolling renewals.
 */
export function attachSessionCookies(
  reply: FastifyReply,
  sessionToken: string,
  config: SessionConfig,
): void {
  reply.setCookie(config.cookieName, sessionToken, {
    path: config.path,
    domain: config.domain,
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    maxAge: Math.floor(config.maxAgeMs / 1000),
  });

  reply.setCookie("avana_csrf", sessionToken, {
    path: "/",
    domain: config.domain,
    httpOnly: false,
    secure: config.secure,
    sameSite: config.sameSite,
    maxAge: Math.floor(config.maxAgeMs / 1000),
  });
}

/**
 * Clear authenticated session and CSRF cookies on sign-out or session revocation.
 * Strictly respects the configured cookie domain so browsers remove cookies properly.
 */
export function clearSessionCookies(
  reply: FastifyReply,
  config: SessionConfig,
): void {
  reply.clearCookie(config.cookieName, {
    path: config.path,
    domain: config.domain,
  });

  reply.clearCookie("avana_csrf", {
    path: "/",
    domain: config.domain,
  });
}
