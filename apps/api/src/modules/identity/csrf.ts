/**
 * CSRF protection utilities.
 *
 * Per the Technical Blueprint, CSRF tokens are bound to the session
 * for replay protection. Uses SHA-256 HMAC-like binding.
 */

import { randomBytes, createHash } from "node:crypto";

/** Generate a cryptographically random CSRF token. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a CSRF token bound to a session.
 * Format: `csrfRandom.hmac256(sessionToken + csrfRandom)`
 */
export function generateBoundCsrfToken(
  sessionToken: string,
  csrfToken: string,
): string {
  const hash = createHash("sha256")
    .update(sessionToken + csrfToken)
    .digest("hex");
  return `${csrfToken}.${hash}`;
}

/**
 * Validate a session-bound CSRF token.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function validateCsrfToken(
  boundToken: string,
  sessionToken: string,
): boolean {
  const parts = boundToken.split(".");
  if (parts.length !== 2) return false;
  const [csrfToken, expectedHash] = parts;

  const hash = createHash("sha256")
    .update(sessionToken + csrfToken)
    .digest("hex");

  if (hash.length !== expectedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i++) {
    result |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return result === 0;
}
