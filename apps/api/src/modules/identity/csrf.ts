/**
 * CSRF protection utilities.
 *
 * Implements Session-Bound Double-Submit CSRF tokens using HMAC-SHA256.
 *
 * Algorithm Architecture:
 * 1. Entropy: CSRF token consists of a 256-bit (32 bytes) cryptographically
 *    random hex string (`csrfRandom`).
 * 2. Key Binding: The active, authenticated `sessionToken` serves as the HMAC secret key.
 * 3. Signature: `HMAC-SHA256(key = sessionToken, message = csrfRandom)`
 * 5. Verification: Constant-time comparison using timingSafeEqual over Buffer instances.
 */

import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

/** Generate a cryptographically random CSRF token with at least 256 bits of entropy. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a CSRF token cryptographically bound to a session via HMAC-SHA256.
 * Format: `${csrfRandom}.${hmacSha256(sessionToken, csrfRandom)}`
 */
export function generateBoundCsrfToken(
  sessionToken: string,
  csrfToken: string = generateCsrfToken(),
): string {
  const hmac = createHmac("sha256", sessionToken)
    .update(csrfToken)
    .digest("hex");
  return `${csrfToken}.${hmac}`;
}

/**
 * Validate a session-bound CSRF token.
 *
 * Security checks:
 * 1. String and non-empty checks for both inputs.
 * 2. Delimiter verification (exactly two segments separated by dot).
 * 3. Exact 64 hex characters for both `csrfRandom` and `signature`.
 * 4. Recomputation of HMAC-SHA256 using the request's active `sessionToken`.
 * 5. Constant-time comparison (`timingSafeEqual`) on byte Buffers of identical length (32 bytes).
 */
export function validateCsrfToken(
  boundToken: string,
  sessionToken: string,
): boolean {
  if (
    typeof boundToken !== "string" ||
    typeof sessionToken !== "string" ||
    !boundToken ||
    !sessionToken
  ) {
    return false;
  }

  const parts = boundToken.split(".");
  if (parts.length !== 2) return false;
  const [csrfToken, signature] = parts;

  // Strict format check: exactly 64 hex characters each (32 bytes entropy + 32 bytes SHA-256 output)
  if (!csrfToken || !signature) return false;
  if (csrfToken.length !== 64 || signature.length !== 64) return false;
  if (!/^[0-9a-f]{64}$/i.test(csrfToken) || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }

  const expectedSignature = createHmac("sha256", sessionToken)
    .update(csrfToken)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");

  if (sigBuf.length !== 32 || expectedBuf.length !== 32) {
    return false;
  }

  return timingSafeEqual(sigBuf, expectedBuf);
}
