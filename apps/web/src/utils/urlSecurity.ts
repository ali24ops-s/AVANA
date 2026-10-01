/**
 * URL security and open redirect prevention utilities.
 */

/**
 * Validates and sanitizes a redirect URL to prevent Open Redirect attacks.
 * Only internal, relative paths starting with a single '/' are permitted.
 * Protocols, scheme-relative URLs ('//'), backslashes, and malicious schemes are rejected.
 */
export function getSafeInternalRedirect(
  redirectUrl: string | null | undefined,
  fallback = "/home",
): string {
  if (!redirectUrl || typeof redirectUrl !== "string") {
    return fallback;
  }

  const trimmed = redirectUrl.trim();

  // Must start with '/' and NOT '//' (scheme-relative)
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  // Reject backslashes, protocol schemes (http:, https:, javascript:, data:)
  if (
    trimmed.includes("\\") ||
    trimmed.includes("://") ||
    /^\/[\\/]/i.test(trimmed) ||
    /^[a-z0-9+.-]+:/i.test(trimmed) ||
    trimmed.toLowerCase().includes("javascript:")
  ) {
    return fallback;
  }

  return trimmed;
}
