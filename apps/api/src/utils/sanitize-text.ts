/**
 * Central text sanitizer for AVANA.
 *
 * Pure and robust sanitizer for any arbitrary string (error messages, titles, stack traces, URLs).
 * Redacts secrets, tokens, API keys, credentials, and sensitive query strings without destroying diagnostic context.
 *
 * Zero external dependencies. Safe to import anywhere in backend or worker.
 */

export function sanitizeText(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";

  return (
    text
      // 1. Database & Cache URI credentials with username (e.g. postgres://user:secret@host) or empty username (e.g. redis://:secret@host)
      .replace(
        /\b((?:postgres|postgresql|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/(?:[^\s:@/]+)?:)[^@\s/]+(@)/gi,
        "$1[REDACTED]$2",
      )
      // 2. Google / Gemini API Keys (AIza followed by 35 alphanumeric/dash/underscore chars)
      .replace(/\bAIza[0-9A-Za-z-_]{35}\b/g, "[REDACTED_GEMINI_KEY]")
      // 3. Resend API Keys (re_ followed by 24+ alphanumeric/dash/underscore chars)
      .replace(/\bre_[0-9A-Za-z_-]{24,}\b/g, "[REDACTED_RESEND_KEY]")
      // 4. OpenAI / generic API keys (sk- followed by 20+ chars)
      .replace(/\bsk-[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_API_KEY]")
      // 5. AWS Access Key IDs (AKIA followed by 16 uppercase alphanumeric chars)
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
      // 6. GitHub Tokens (classic ghp_... and fine-grained github_pat_...)
      .replace(/\b(?:gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]")
      // 7. PEM Private Key blocks (multiline or single-line escaped)
      .replace(
        /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g,
        "[REDACTED_PRIVATE_KEY]",
      )
      // 8. JWT tokens (three base64 segments separated by dots: eyJ...)
      .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
      // 9. Authorization Bearer header: Authorization: Bearer <token>
      .replace(/\b(Authorization\s*:\s*Bearer\s+)[a-zA-Z0-9_.-]+/gi, "$1[REDACTED]")
      // 10. Generic Bearer tokens: Bearer <token>
      .replace(/\b(Bearer\s+)[a-zA-Z0-9_.-]+/gi, "$1[REDACTED]")
      // 11. Non-Bearer Authorization headers: Authorization: Basic <xyz> or Authorization: <secret>
      .replace(/\b(Authorization\s*:\s*)(?!Bearer)[^\s,;]+/gi, "$1[REDACTED]")
      // 12. Sensitive query string parameters in URLs (e.g. ?token=... or &api_key=... or ?password=...)
      .replace(
        /([?&](?:token|access_token|refresh_token|accessToken|refreshToken|apiKey|api_key|key|password|secret|otp|code|auth|private_key|privateKey)=)[^&\s#]+/gi,
        "$1[REDACTED]",
      )
      // 13. Key-Value credential pairs (handles quoted strings with spaces or unquoted tokens)
      .replace(
        /\b((?:password|passwd|secret|token|api[_-]?key|gemini[_-]?api[_-]?key|resend[_-]?api[_-]?key|accessToken|refreshToken|otp|credential|private[_-]?key)\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^'"\s,;&]+)/gi,
        "$1[REDACTED]",
      )
      // 14. Cookie and Session headers (e.g. Cookie: session=123, Cookie: foo=bar)
      .replace(
        /\b((?:cookie|set-cookie|session)\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^'"\s,;&]+)/gi,
        "$1[REDACTED]",
      )
  );
}
