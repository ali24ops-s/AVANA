/**
 * AVANA Central Error Message Mapper
 *
 * Single Source of Truth for resolving user-friendly, respectful, and safe Persian error messages.
 *
 * Guarantees:
 * 1. Zero circular dependency with `errors.ts` (uses structural Duck Typing).
 * 2. Absolute fallback hardening: Never leaks raw Error.message, stack traces, service names, or URLs to the UI.
 * 3. Deep Gemini classification: Strict differentiation between Overloaded (503), Rate Limit (RPM 429),
 *    Quota Exceeded (RPD 429/403), Invalid Key (401), Timeout, and Malformed Output.
 * 4. Honest generation feedback: Explains state truthfully based on verified partial content availability.
 * 5. Realistic payment feedback: Distinct messages based on gateway state without unconfirmed refund timelines.
 * 6. Request ID extraction: Preserves tracking code for user-support communication without leaking technical data.
 */

export type ErrorCategory =
  | "network"
  | "ai_service"
  | "auth"
  | "permission"
  | "not_found"
  | "conflict"
  | "validation"
  | "file"
  | "payment"
  | "server"
  | "timeout";

export interface UserFriendlyError {
  category: ErrorCategory;
  userMessage: string;
  suggestedAction?: "retry" | "reauth" | "check_connection" | "reduce_file" | "charge_wallet" | "none";
  isTransient: boolean;
  preservesUserData: boolean;
  requestId?: string;
  originalCode?: string;
}

export interface ErrorContext {
  /** Component or workflow where the error occurred */
  scope?: "generation" | "upload" | "chat" | "auth" | "payment" | "mindmap" | "general";
  /** Explicit request ID if available from caller */
  requestId?: string;
  /** Whether prior verified content has been persisted (e.g., partial generation chunks) */
  hasVerifiedSavedContent?: boolean;
  /** Field name for validation errors */
  fieldName?: string;
  /** Optional custom fallback message if error resolution fails */
  fallbackMessage?: string;
  /** Alias for fallbackMessage */
  fallback?: string;
}

/**
 * Structural duck-typing interface for API error envelopes to prevent circular import.
 */
export interface ApiErrorLike {
  name?: string;
  code?: string;
  statusCode?: number;
  status?: number;
  requestId?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Common regex patterns for sanitizing sensitive tokens out of any diagnostic text.
 */
const SENSITIVE_PATTERNS = [
  /AIza[0-9A-Za-z-_]{25,45}/g, // Google / Gemini API keys
  /re_[A-Za-z0-9_]{20,}/g,    // Resend API keys
  /sk-[A-Za-z0-9]{20,}/g,     // OpenAI / other LLM keys
  /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, // JWT tokens
  /(?:password|token|secret|api_key|apikey)=([^&;]+)/gi,
];

export function sanitizeDiagnosticText(text: string): string {
  if (!text) return "";
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[محرمانه]");
  }
  return result;
}

export const sanitizeErrorDetails = sanitizeDiagnosticText;

/**
 * Safe fallback messages in approved Persian standard.
 */
export const DEFAULT_PERSIAN_MESSAGES = {
  general_error: "مشکلی در انجام درخواست پیش آمده است. نگران نباشید، لطفاً کمی بعد دوباره تلاش کنید.",
  network_offline: "ارتباط با اینترنت برقرار نیست. لطفاً اتصال شبکه خود را بررسی کنید.",
  network_server: "ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت خود را بررسی کرده و دوباره امتحان کنید.",
  timeout: "انجام این درخواست بیش از حد معمول طول کشید. لطفاً دوباره تلاش کنید.",
  bad_gateway: "ارتباط با سرورهای پردازشی موقتاً برقرار نشد. کمی دیگر دوباره امتحان کنید.",
  service_unavailable: "سرویس موردنظر موقتاً در دسترس نیست. لطفاً دقایقی دیگر دوباره امتحان کنید.",
  unauthorized: "برای ادامه، لطفاً دوباره وارد حساب کاربری خود شوید.",
  forbidden: "به این بخش دسترسی ندارید یا حساب شما مجوز لازم را ندارد.",
  not_found: "موردی که به دنبال آن بودید پیدا نشد؛ ممکن است حذف شده یا تغییر کرده باشد.",
  conflict_active_job: "این سند در حال حاضر در حال پردازش است. لطفاً تا پایان عملیات فعلی صبر کنید.",
  conflict_general: "این عملیات با پردازش دیگری همزمان شده است. لطفاً لحظاتی دیگر دوباره امتحان کنید.",
  file_too_large: "حجم فایل بیشتر از سقف مجاز (۵۰ مگابایت) است. لطفاً فایل کم‌حجم‌تری انتخاب کنید.",
  file_empty: "فایل انتخاب‌شده خالی یا فاقد محتواست. لطفاً یک فایل معتبر انتخاب کنید.",
  file_unsupported: "این فرمت فایل پشتیبانی نمی‌شود. لطفاً فایل PDF، Word یا PowerPoint بارگذاری کنید.",
  file_name_invalid: "نام فایل نامعتبر است یا طول آن بیش از حد مجاز می‌باشد.",
  wallet_insufficient: "موجودی کیف پول شما برای این عملیات کافی نیست. لطفاً ابتدا کیف پول خود را شارژ فرمایید.",
  payment_cancelled: "پرداخت توسط شما متوقف شد.",
  payment_failed: "تراکنش پرداخت تکمیل نشد. در صورت کسر وجه از حساب، وضعیت بازگشت وجه طبق قوانین شبکه بانکی بررسی می‌شود.",
  ai_overloaded: "در حال حاضر سرویس هوش مصنوعی شلوغ است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.",
  ai_rate_limited: "تعداد درخواست‌ها در مدت کوتاهی زیاد بوده است. لطفاً یک دقیقه صبر کرده و دوباره امتحان کنید.",
  ai_quota_exhausted: "سهمیه سرویس هوش مصنوعی در حال حاضر تکمیل شده است. لطفاً کمی بعد مراجعه کنید.",
  ai_auth_error: "ارتباط با سرویس هوش مصنوعی موقتاً برقرار نیست. موضوع به تیم فنی گزارش شد؛ لطفاً کمی بعد امتحان کنید.",
  ai_malformed_output: "سرویس هوش مصنوعی نتوانست خروجی کاملی تولید کند. لطفاً دوباره دکمه تولید را بزنید.",
  ai_timeout: "زمان پردازش هوش مصنوعی بیش از حد طول کشید و کامل نشد. لطفاً دوباره تلاش کنید.",
} as const;

/**
 * Resolve a structured, user-friendly error object from any thrown error or response.
 */
export function resolveUserFriendlyError(
  err: unknown,
  context?: ErrorContext,
): UserFriendlyError {
  // Extract Request ID if available
  let resolvedRequestId: string | undefined = context?.requestId;
  let code: string | undefined;
  let statusCode: number | undefined;
  let rawMessage = "";

  if (typeof err === "object" && err !== null) {
    const errorObj = err as Record<string, unknown> & {
      code?: unknown;
      statusCode?: unknown;
      status?: unknown;
      requestId?: unknown;
      message?: unknown;
      envelope?: {
        request_id?: unknown;
        error?: { code?: unknown; message?: unknown };
      };
      response?: {
        status?: unknown;
        data?: {
          code?: unknown;
          message?: unknown;
          request_id?: unknown;
        };
      };
      error?: {
        message?: unknown;
      };
    };
    code =
      typeof errorObj.code === "string"
        ? errorObj.code
        : typeof errorObj.envelope?.error?.code === "string"
        ? errorObj.envelope.error.code
        : typeof errorObj.response?.data?.code === "string"
        ? errorObj.response.data.code
        : undefined;

    statusCode =
      typeof errorObj.statusCode === "number"
        ? errorObj.statusCode
        : typeof errorObj.status === "number"
        ? errorObj.status
        : typeof errorObj.response?.status === "number"
        ? errorObj.response.status
        : undefined;

    resolvedRequestId =
      resolvedRequestId ||
      (typeof errorObj.requestId === "string"
        ? errorObj.requestId
        : typeof errorObj.envelope?.request_id === "string"
        ? errorObj.envelope.request_id
        : typeof errorObj.response?.data?.request_id === "string"
        ? errorObj.response.data.request_id
        : undefined);

    rawMessage =
      typeof errorObj.message === "string" && errorObj.message.trim().length > 0
        ? errorObj.message
        : typeof errorObj.envelope?.error?.message === "string"
        ? errorObj.envelope.error.message
        : typeof errorObj.response?.data?.message === "string"
        ? errorObj.response.data.message
        : typeof errorObj.error?.message === "string"
        ? errorObj.error.message
        : "";
  } else if (typeof err === "string") {
    rawMessage = err;
  }

  const lower = rawMessage.toLowerCase();
  const hasPersianChars = /[\u0600-\u06FF]/.test(rawMessage);
  const isRawEnglishError = /^(error|failed|cannot|request failed|internal error|http \d{3}|exception)/i.test(rawMessage.trim());
  const isCleanPersian = hasPersianChars && !isRawEnglishError;

  // 1. Check Offline status first
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      category: "network",
      userMessage: DEFAULT_PERSIAN_MESSAGES.network_offline,
      suggestedAction: "check_connection",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "offline",
    };
  }

  // 2. Fetch / Network drop failures
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("net::err_") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("socket hang up")
  ) {
    return {
      category: "network",
      userMessage: DEFAULT_PERSIAN_MESSAGES.network_server,
      suggestedAction: "check_connection",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "network_error",
    };
  }

  // 3. Timeout failures
  if (
    code === "timeout" ||
    statusCode === 408 ||
    statusCode === 504 ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError")
  ) {
    if (context?.scope === "generation" || lower.includes("gemini")) {
      return {
        category: "timeout",
        userMessage: DEFAULT_PERSIAN_MESSAGES.ai_timeout,
        suggestedAction: "retry",
        isTransient: true,
        preservesUserData: Boolean(context?.hasVerifiedSavedContent),
        requestId: resolvedRequestId,
        originalCode: "timeout",
      };
    }
    return {
      category: "timeout",
      userMessage: DEFAULT_PERSIAN_MESSAGES.timeout,
      suggestedAction: "retry",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "timeout",
    };
  }

  // 4. Gemini and AI-specific errors
  const isAiContext =
    context?.scope === "generation" ||
    context?.scope === "chat" ||
    context?.scope === "mindmap" ||
    lower.includes("gemini") ||
    lower.includes("model");

  if (isAiContext) {
    const isExplicitRateLimit =
      code === "rate_limit_exceeded" ||
      code === "too_many_requests" ||
      lower.includes("rate_limit") ||
      lower.includes("rate limit");

    // 4.1 Daily Quota Exceeded (RPD / Resource Exhausted)
    if (
      !isExplicitRateLimit &&
      (code === "quota_exhausted" ||
        code === "resource_exhausted" ||
        lower.includes("quota_exhausted") ||
        lower.includes("resource_exhausted") ||
        lower.includes("quota exceeded") ||
        lower.includes("generaterequestsperday") ||
        lower.includes("daily quota") ||
        (statusCode === 429 && lower.includes("quota")) ||
        (statusCode === 403 && lower.includes("quota")))
    ) {
      return {
        category: "ai_service",
        userMessage: DEFAULT_PERSIAN_MESSAGES.ai_quota_exhausted,
        suggestedAction: "none",
        isTransient: false,
        preservesUserData: Boolean(context?.hasVerifiedSavedContent),
        requestId: resolvedRequestId,
        originalCode: "quota_exhausted",
      };
    }

    // 4.2 Rate Limit (RPM / TPM short-term burst)
    if (
      isExplicitRateLimit ||
      statusCode === 429
    ) {
      return {
        category: "ai_service",
        userMessage: isCleanPersian
          ? sanitizeDiagnosticText(rawMessage.trim())
          : DEFAULT_PERSIAN_MESSAGES.ai_rate_limited,
        suggestedAction: "retry",
        isTransient: true,
        preservesUserData: Boolean(context?.hasVerifiedSavedContent),
        requestId: resolvedRequestId,
        originalCode: "rate_limit_exceeded",
      };
    }

    // 4.3 AI Server Overload / 503 / 502
    if (
      statusCode === 503 ||
      statusCode === 502 ||
      lower.includes("503") ||
      lower.includes("overloaded") ||
      lower.includes("service unavailable")
    ) {
      return {
        category: "ai_service",
        userMessage: DEFAULT_PERSIAN_MESSAGES.ai_overloaded,
        suggestedAction: "retry",
        isTransient: true,
        preservesUserData: Boolean(context?.hasVerifiedSavedContent),
        requestId: resolvedRequestId,
        originalCode: "service_unavailable",
      };
    }

    // 4.4 AI Key Authentication / Permission
    if (
      statusCode === 401 ||
      (statusCode === 403 && (lower.includes("api key") || lower.includes("invalid") || lower.includes("key-"))) ||
      lower.includes("api key not valid") ||
      lower.includes("api_key_invalid")
    ) {
      return {
        category: "ai_service",
        userMessage: DEFAULT_PERSIAN_MESSAGES.ai_auth_error,
        suggestedAction: "none",
        isTransient: true,
        preservesUserData: Boolean(context?.hasVerifiedSavedContent),
        requestId: resolvedRequestId,
        originalCode: "ai_auth_error",
      };
    }

    // 4.5 Malformed AI JSON or Empty Response
    if (
      code === "unprocessable" ||
      lower.includes("syntaxerror") ||
      lower.includes("json") ||
      lower.includes("empty response") ||
      lower.includes("no response generated") ||
      lower.includes("parse")
    ) {
      return {
        category: "ai_service",
        userMessage: DEFAULT_PERSIAN_MESSAGES.ai_malformed_output,
        suggestedAction: "retry",
        isTransient: true,
        preservesUserData: Boolean(context?.hasVerifiedSavedContent),
        requestId: resolvedRequestId,
        originalCode: "malformed_output",
      };
    }
  }

  // 5. Payment and Commerce errors
  if (context?.scope === "payment" || code === "INSUFFICIENT_FUNDS" || code === "insufficient_balance" || statusCode === 402) {
    if (code === "INSUFFICIENT_FUNDS" || code === "insufficient_balance" || lower.includes("موجودی") || lower.includes("insufficient")) {
      return {
        category: "payment",
        userMessage: DEFAULT_PERSIAN_MESSAGES.wallet_insufficient,
        suggestedAction: "charge_wallet",
        isTransient: false,
        preservesUserData: true,
        requestId: resolvedRequestId,
        originalCode: "insufficient_funds",
      };
    }
    if (lower.includes("cancel") || lower.includes("انصراف") || lower.includes("لغو")) {
      return {
        category: "payment",
        userMessage: DEFAULT_PERSIAN_MESSAGES.payment_cancelled,
        suggestedAction: "retry",
        isTransient: false,
        preservesUserData: true,
        requestId: resolvedRequestId,
        originalCode: "payment_cancelled",
      };
    }
    if (isCleanPersian) {
      return {
        category: "payment",
        userMessage: sanitizeDiagnosticText(rawMessage.trim()),
        suggestedAction: "none",
        isTransient: false,
        preservesUserData: true,
        requestId: resolvedRequestId,
        originalCode: code || "payment_error",
      };
    }
    return {
      category: "payment",
      userMessage: DEFAULT_PERSIAN_MESSAGES.payment_failed,
      suggestedAction: "retry",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "payment_failed",
    };
  }

  // 6. File Upload and Extraction errors
  if (
    context?.scope === "upload" ||
    statusCode === 413 ||
    lower.includes("file exceeds") ||
    lower.includes("too large") ||
    lower.includes("حجم فایل") ||
    lower.includes("unsupported file type") ||
    lower.includes("فرمت فایل") ||
    lower.includes("پسوند فایل")
  ) {
    if (statusCode === 413 || lower.includes("too large") || lower.includes("50 mb") || lower.includes("حجم فایل") || lower.includes("حجم بیش")) {
      return {
        category: "file",
        userMessage: isCleanPersian
          ? sanitizeDiagnosticText(rawMessage.trim())
          : DEFAULT_PERSIAN_MESSAGES.file_too_large,
        suggestedAction: "reduce_file",
        isTransient: false,
        preservesUserData: false,
        requestId: resolvedRequestId,
        originalCode: "file_too_large",
      };
    }
    if (lower.includes("unsupported") || lower.includes("فرمت فایل") || lower.includes("پسوند") || lower.includes("mime")) {
      return {
        category: "file",
        userMessage: isCleanPersian
          ? sanitizeDiagnosticText(rawMessage.trim())
          : DEFAULT_PERSIAN_MESSAGES.file_unsupported,
        suggestedAction: "reduce_file",
        isTransient: false,
        preservesUserData: false,
        requestId: resolvedRequestId,
        originalCode: "unsupported_file_type",
      };
    }
    if (lower.includes("empty file") || lower.includes("فایل خالی") || (context?.scope === "upload" && lower.includes("خالی"))) {
      return {
        category: "file",
        userMessage: isCleanPersian
          ? sanitizeDiagnosticText(rawMessage.trim())
          : DEFAULT_PERSIAN_MESSAGES.file_empty,
        suggestedAction: "reduce_file",
        isTransient: false,
        preservesUserData: false,
        requestId: resolvedRequestId,
        originalCode: "empty_file",
      };
    }
  }

  // 7. Conflict errors (409)
  if (code === "conflict" || statusCode === 409) {
    const isJobActive = lower.includes("پردازش") || lower.includes("دوره") || lower.includes("اجرا");
    return {
      category: "conflict",
      userMessage: isJobActive
        ? DEFAULT_PERSIAN_MESSAGES.conflict_active_job
        : DEFAULT_PERSIAN_MESSAGES.conflict_general,
      suggestedAction: "none",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "conflict",
    };
  }

  // 8. Auth & Permission errors
  if (
    code === "unauthorized" ||
    code === "UNAUTHORIZED" ||
    code === "SESSION_REVOKED" ||
    statusCode === 401
  ) {
    return {
      category: "auth",
      userMessage: isCleanPersian
        ? sanitizeDiagnosticText(rawMessage.trim())
        : DEFAULT_PERSIAN_MESSAGES.unauthorized,
      suggestedAction: "reauth",
      isTransient: false,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: code || "unauthorized",
    };
  }

  if (
    code === "forbidden" ||
    code === "DEVICE_LIMIT_REACHED" ||
    code === "SUBSCRIPTION_REQUIRED" ||
    code === "SUBSCRIPTION_NOT_ACTIVE" ||
    statusCode === 403
  ) {
    return {
      category: "permission",
      userMessage: isCleanPersian
        ? sanitizeDiagnosticText(rawMessage.trim())
        : DEFAULT_PERSIAN_MESSAGES.forbidden,
      suggestedAction: "none",
      isTransient: false,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: code || "forbidden",
    };
  }

  // 9. Not Found errors (404)
  if (code === "not_found" || statusCode === 404) {
    return {
      category: "not_found",
      userMessage: isCleanPersian
        ? sanitizeDiagnosticText(rawMessage.trim())
        : DEFAULT_PERSIAN_MESSAGES.not_found,
      suggestedAction: "none",
      isTransient: false,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "not_found",
    };
  }

  // 9.5 General Rate Limit (429)
  if (code === "rate_limit_exceeded" || code === "too_many_requests" || statusCode === 429) {
    return {
      category: "server",
      userMessage: isCleanPersian
        ? sanitizeDiagnosticText(rawMessage.trim())
        : DEFAULT_PERSIAN_MESSAGES.ai_rate_limited,
      suggestedAction: "retry",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "rate_limit_exceeded",
    };
  }

  // 10. Persian validation messages already set in server/domain
  // If the message is already in Persian and has no English error prefixes, preserve it safely.
  if (isCleanPersian) {
    return {
      category: "validation",
      userMessage: sanitizeDiagnosticText(rawMessage.trim()),
      suggestedAction: "none",
      isTransient: false,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: code || "validation_error",
    };
  }

  // 11. Gateway / Server errors
  if (statusCode === 502) {
    return {
      category: "server",
      userMessage: DEFAULT_PERSIAN_MESSAGES.bad_gateway,
      suggestedAction: "retry",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "bad_gateway",
    };
  }

  if (statusCode === 503) {
    return {
      category: "server",
      userMessage: DEFAULT_PERSIAN_MESSAGES.service_unavailable,
      suggestedAction: "retry",
      isTransient: true,
      preservesUserData: true,
      requestId: resolvedRequestId,
      originalCode: "service_unavailable",
    };
  }

  // 12. Absolute Default Fallback (never returns raw Error string or stack trace)
  return {
    category: "server",
    userMessage: DEFAULT_PERSIAN_MESSAGES.general_error,
    suggestedAction: "retry",
    isTransient: true,
    preservesUserData: true,
    requestId: resolvedRequestId,
    originalCode: code || "internal_error",
  };
}

/**
 * Convenience helper to directly obtain the safe, user-friendly Persian string.
 */
export function getUserFriendlyErrorMessage(
  err: unknown,
  contextOrFallback?: ErrorContext | string,
): string {
  const context =
    typeof contextOrFallback === "object"
      ? contextOrFallback
      : undefined;

  const fallback =
    typeof contextOrFallback === "string"
      ? contextOrFallback
      : (context?.fallbackMessage || context?.fallback);

  try {
    const resolved = resolveUserFriendlyError(err, context);
    if (resolved?.userMessage) {
      return resolved.userMessage;
    }
  } catch {
    // If mapper encounters an unexpected failure, return hardened fallback
  }

  return fallback || DEFAULT_PERSIAN_MESSAGES.general_error;
}
