import { describe, expect, it } from "vitest";
import {
  resolveUserFriendlyError,
  getUserFriendlyErrorMessage,
  sanitizeDiagnosticText,
  DEFAULT_PERSIAN_MESSAGES,
} from "../lib/api/error-mapper.js";
import { ApiError } from "../lib/api/errors.js";

describe("AVANA Central Error Mapper & Persian Localization", () => {
  describe("Category 1: Network & Offline Failures", () => {
    it("classifies offline network states", () => {
      // Mock navigator.onLine = false
      const originalOnLine = navigator.onLine;
      try {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        const res = resolveUserFriendlyError(new Error("Failed to fetch"));
        expect(res.category).toBe("network");
        expect(res.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.network_offline);
        expect(res.suggestedAction).toBe("check_connection");
        expect(res.isTransient).toBe(true);
      } finally {
        Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
      }
    });

    it("classifies server disconnect / fetch drop errors", () => {
      const res = resolveUserFriendlyError(new Error("Failed to fetch"));
      expect(res.category).toBe("network");
      expect(res.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.network_server);
      expect(res.suggestedAction).toBe("check_connection");
      expect(res.isTransient).toBe(true);
    });
  });

  describe("Category 2: Timeout Failures", () => {
    it("handles general HTTP 408 / 504 timeouts", () => {
      const res408 = resolveUserFriendlyError({ statusCode: 408, message: "Request Timeout" });
      expect(res408.category).toBe("timeout");
      expect(res408.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.timeout);
      expect(res408.suggestedAction).toBe("retry");

      const res504 = resolveUserFriendlyError({ statusCode: 504, message: "Gateway Timeout" });
      expect(res504.category).toBe("timeout");
      expect(res504.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.timeout);
    });

    it("handles AI generation timeout with honest data-preservation flag", () => {
      const resNoSaved = resolveUserFriendlyError(
        { code: "timeout", message: "Gemini deadline exceeded" },
        { scope: "generation", hasVerifiedSavedContent: false },
      );
      expect(resNoSaved.category).toBe("timeout");
      expect(resNoSaved.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.ai_timeout);
      expect(resNoSaved.preservesUserData).toBe(false);

      const resWithSaved = resolveUserFriendlyError(
        { code: "timeout", message: "Gemini deadline exceeded" },
        { scope: "generation", hasVerifiedSavedContent: true },
      );
      expect(resWithSaved.preservesUserData).toBe(true);
    });
  });

  describe("Category 3: Gemini & AI Model Failures", () => {
    it("differentiates 503 Overload vs 429 Rate Limit vs Daily Quota", () => {
      // 503 Overloaded
      const res503 = resolveUserFriendlyError(
        { statusCode: 503, message: "The model is overloaded. Please try again later." },
        { scope: "generation" },
      );
      expect(res503.category).toBe("ai_service");
      expect(res503.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.ai_overloaded);
      expect(res503.suggestedAction).toBe("retry");

      // 429 Short-term burst (RPM)
      const res429Burst = resolveUserFriendlyError(
        { statusCode: 429, message: "Resource has been exhausted (e.g. check quota): rate limit reached" },
        { scope: "generation" },
      );
      expect(res429Burst.category).toBe("ai_service");
      expect(res429Burst.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.ai_rate_limited);

      // 429 / 403 Daily Quota Exhausted (RPD)
      const resDailyQuota = resolveUserFriendlyError(
        { statusCode: 429, message: "Quota exceeded for quota metric 'GenerateRequestsPerDayPerProject'" },
        { scope: "generation" },
      );
      expect(resDailyQuota.category).toBe("ai_service");
      expect(resDailyQuota.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.ai_quota_exhausted);
      expect(resDailyQuota.isTransient).toBe(false);
      expect(resDailyQuota.suggestedAction).toBe("none");
    });

    it("handles AI auth/key errors without leaking keys", () => {
      const resKey = resolveUserFriendlyError(
        { statusCode: 401, message: "API key not valid. Please pass a valid API key (AIzaSyD84kd93jf84kd938fj38d)." },
        { scope: "generation" },
      );
      expect(resKey.category).toBe("ai_service");
      expect(resKey.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.ai_auth_error);
      expect(resKey.userMessage).not.toContain("AIzaSy");
    });

    it("handles AI malformed JSON / unparsable output", () => {
      const resMalformed = resolveUserFriendlyError(
        { message: "Invalid JSON response from AI: Unterminated string in JSON at position 420" },
        { scope: "generation" },
      );
      expect(resMalformed.category).toBe("ai_service");
      expect(resMalformed.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.ai_malformed_output);
      expect(resMalformed.suggestedAction).toBe("retry");
    });
  });

  describe("Category 4: Payment & Commerce Failures", () => {
    it("handles user-cancelled payment", () => {
      const resCancel = resolveUserFriendlyError(
        { message: "Payment cancelled by user" },
        { scope: "payment" },
      );
      expect(resCancel.category).toBe("payment");
      expect(resCancel.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.payment_cancelled);
    });

    it("handles insufficient wallet balance", () => {
      const resFunds = resolveUserFriendlyError(
        { code: "INSUFFICIENT_FUNDS", message: "User balance is not sufficient" },
        { scope: "payment" },
      );
      expect(resFunds.category).toBe("payment");
      expect(resFunds.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.wallet_insufficient);
      expect(resFunds.suggestedAction).toBe("charge_wallet");
    });

    it("avoids unconfirmed 72-hour refund promises in payment failure messages", () => {
      const resFail = resolveUserFriendlyError(
        { message: "Transaction failed at bank gateway" },
        { scope: "payment" },
      );
      expect(resFail.category).toBe("payment");
      expect(resFail.userMessage).not.toContain("۷۲ ساعت");
      expect(resFail.userMessage).toContain("بانک");
    });
  });

  describe("Category 5: File Upload & Processing Failures", () => {
    it("handles file too large (413 or >50MB message)", () => {
      const res413 = resolveUserFriendlyError({ statusCode: 413, message: "Payload Too Large" });
      expect(res413.category).toBe("file");
      expect(res413.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.file_too_large);
      expect(res413.userMessage).toContain("۵۰ مگابایت");
    });

    it("handles unsupported file extensions", () => {
      const resUnsupported = resolveUserFriendlyError(
        { message: "Unsupported file type: .exe" },
        { scope: "upload" },
      );
      expect(resUnsupported.category).toBe("file");
      expect(resUnsupported.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.file_unsupported);
      expect(resUnsupported.userMessage).toContain("PDF");
    });
  });

  describe("Category 6: Conflict & Active Jobs (409)", () => {
    it("differentiates active processing job conflict vs general conflict", () => {
      const resActive = resolveUserFriendlyError(
        { statusCode: 409, message: "یک پردازش فعال برای این دوره در حال اجرا است" },
      );
      expect(resActive.category).toBe("conflict");
      expect(resActive.userMessage).toContain("در حال پردازش است");

      const resGeneral = resolveUserFriendlyError(
        { statusCode: 409, message: "Conflict detected" },
      );
      expect(resGeneral.category).toBe("conflict");
      expect(resGeneral.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.conflict_general);
    });
  });

  describe("Category 7: Authentication & Permissions (401, 403)", () => {
    it("provides clean Persian messages for 401 unauthorized", () => {
      const res401 = resolveUserFriendlyError({ statusCode: 401, message: "Unauthorized" });
      expect(res401.category).toBe("auth");
      expect(res401.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.unauthorized);
    });

    it("preserves explicit domain Persian error on 401", () => {
      const resDomain401 = resolveUserFriendlyError(
        new ApiError({
          error: {
            code: "unauthorized",
            message: "ایمیل یا رمز عبور نادرست است.",
          },
        }),
      );
      expect(resDomain401.category).toBe("auth");
      expect(resDomain401.userMessage).toBe("ایمیل یا رمز عبور نادرست است.");
    });

    it("handles 403 forbidden without exposing internal roles", () => {
      const res403 = resolveUserFriendlyError({ statusCode: 403, message: "Forbidden: role required" });
      expect(res403.category).toBe("permission");
      expect(res403.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.forbidden);
    });
  });

  describe("Category 8: Not Found (404)", () => {
    it("handles 404 not found cleanly", () => {
      const res404 = resolveUserFriendlyError({ statusCode: 404, message: "Not Found" });
      expect(res404.category).toBe("not_found");
      expect(res404.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.not_found);
    });
  });

  describe("Category 9: Diagnostic Sanitization & Sensitive Token Protection", () => {
    it("sanitizes Google Gemini keys, OpenAI keys, Resend keys, and JWT tokens", () => {
      const rawWithTokens =
        "Failed request with token AIzaSyBk_948jfkdls_94837584kdlskdjfh and OpenAI sk-abc12345678901234567890 and Resend re_12345678901234567890 and JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis";

      const sanitized = sanitizeDiagnosticText(rawWithTokens);

      expect(sanitized).not.toContain("AIzaSy");
      expect(sanitized).not.toContain("sk-abc");
      expect(sanitized).not.toContain("re_123");
      expect(sanitized).not.toContain("eyJhbGci");
      expect(sanitized).toContain("[محرمانه]");
    });

    it("preserves allowed brand terms without accidental redaction", () => {
      const textWithBrands = "فایل‌های مجاز: PDF، Word و PowerPoint در سامانه آوانا (AVANA).";
      const sanitized = sanitizeDiagnosticText(textWithBrands);

      expect(sanitized).toContain("PDF");
      expect(sanitized).toContain("Word");
      expect(sanitized).toContain("PowerPoint");
      expect(sanitized).toContain("آوانا");
      expect(sanitized).toContain("AVANA");
    });
  });

  describe("Category 10: Request ID Propagation", () => {
    it("extracts and propagates Request ID for user support reference", () => {
      const res = resolveUserFriendlyError({
        requestId: "req-987654321",
        message: "Internal server error occurred",
        statusCode: 500,
      });

      expect(res.requestId).toBe("req-987654321");
      expect(res.userMessage).toBe(DEFAULT_PERSIAN_MESSAGES.general_error);
    });

    it("getUserFriendlyErrorMessage returns clean string directly", () => {
      const msg = getUserFriendlyErrorMessage(
        new ApiError({
          error: {
            code: "bad_request",
            message: "فرمت نام درس صحیح نیست.",
          },
        }),
      );
      expect(msg).toBe("فرمت نام درس صحیح نیست.");
    });
  });
});
