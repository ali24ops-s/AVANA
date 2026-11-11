import type { FastifyReply } from "fastify";
import type { SessionConfig } from "../../config.js";
import { generateBoundCsrfToken } from "./csrf.js";

/**
 * Attach or renew the CSRF cookie on a Fastify reply bound to the sessionToken.
 * Does NOT touch or alter the session token or its expiration.
 */
export function attachCsrfCookie(
  reply: FastifyReply,
  sessionToken: string,
  config: SessionConfig,
  csrfToken?: string,
): string {
  const csrfValue =
    csrfToken ?? generateBoundCsrfToken(sessionToken);

  reply.setCookie("avana_csrf", csrfValue, {
    path: "/",
    domain: config.domain,
    httpOnly: false,
    secure: config.secure,
    sameSite: config.sameSite,
    maxAge: Math.floor(config.maxAgeMs / 1000),
  });

  return csrfValue;
}

/**
 * Attach or renew authenticated session and CSRF cookies on a Fastify reply.
 * Ensures identical cookie flags and maxAge across initial login, takeover,
 * and rolling renewals.
 *
 * NOTE: avana_csrf contains a cryptographically bound CSRF token and NEVER
 * exposes the raw session token.
 */
export function attachSessionCookies(
  reply: FastifyReply,
  sessionToken: string,
  config: SessionConfig,
  csrfToken?: string,
): string {
  reply.setCookie(config.cookieName, sessionToken, {
    path: config.path,
    domain: config.domain,
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    maxAge: Math.floor(config.maxAgeMs / 1000),
  });

  return attachCsrfCookie(reply, sessionToken, config, csrfToken);
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
