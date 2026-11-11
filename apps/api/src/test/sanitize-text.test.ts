import { describe, expect, it } from "vitest";
import { sanitizeText } from "../utils/sanitize-text.js";

describe("Standalone Text Sanitizer", () => {
  it("redacts Gemini API keys", () => {
    const key = "AIzaSyD" + "0".repeat(32);
    const raw = `Error calling Gemini with key ${key}: Quota exceeded`;
    const sanitized = sanitizeText(raw);
    expect(sanitized).not.toContain("AIzaSyD");
    expect(sanitized).toContain("[REDACTED_GEMINI_KEY]");
  });

  it("redacts OpenAI and Resend API keys", () => {
    const raw = "OpenAI key sk-1234567890abcdef1234567890 and Resend re_1234567890abcdef1234567890 failed";
    const sanitized = sanitizeText(raw);
    expect(sanitized).not.toContain("sk-1234567890");
    expect(sanitized).not.toContain("re_1234567890");
    expect(sanitized).toContain("[REDACTED_API_KEY]");
    expect(sanitized).toContain("[REDACTED_RESEND_KEY]");
  });

  it("redacts database URIs with passwords", () => {
    const raw = "Connection failed to postgres://postgres:supersecretpass@localhost:5432/avana";
    const sanitized = sanitizeText(raw);
    expect(sanitized).not.toContain("supersecretpass");
    expect(sanitized).toContain("postgres://postgres:[REDACTED]@localhost:5432/avana");
  });

  it("redacts Bearer tokens and Auth headers", () => {
    const raw = "Authorization: Bearer my-super-secret-jwt-token-value";
    const sanitized = sanitizeText(raw);
    expect(sanitized).not.toContain("my-super-secret-jwt-token-value");
    expect(sanitized).toContain("Authorization: Bearer [REDACTED]");
  });

  it("handles null and undefined gracefully", () => {
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
  });
});
