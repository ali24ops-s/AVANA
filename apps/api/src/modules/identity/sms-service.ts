/**
 * SMS Provider Abstraction & Implementations for Avana Authentication.
 *
 * Provides a pluggable, decoupled interface for sending SMS verification OTPs:
 * - ConsoleSmsProvider: Safe development logging
 * - MockSmsProvider: In-memory store for automated unit/integration tests
 * - HttpSmsProvider: Configurable production adapter driven by Environment Variables
 */

export interface SmsProvider {
  sendVerificationCode(input: {
    phoneNumber: string;
    code: string;
  }): Promise<void>;
}

/**
 * Console SMS Provider for Local Development.
 * Logs OTP in the terminal without transmitting actual SMS.
 */
export class ConsoleSmsProvider implements SmsProvider {
  constructor(private readonly logger: (msg: string) => void = (msg) => process.stdout.write(`${msg}\n`)) {}

  async sendVerificationCode(input: {
    phoneNumber: string;
    code: string;
  }): Promise<void> {
    this.logger(
      `[SMS:DEV] Verification code for ${input.phoneNumber}: ${input.code} (Valid for 10 minutes)`,
    );
  }
}

/**
 * Mock SMS Provider for Unit & Integration Testing.
 */
export class MockSmsProvider implements SmsProvider {
  public sentMessages: Array<{
    phoneNumber: string;
    code: string;
    sentAt: Date;
  }> = [];

  async sendVerificationCode(input: {
    phoneNumber: string;
    code: string;
  }): Promise<void> {
    this.sentMessages.push({
      phoneNumber: input.phoneNumber.trim(),
      code: input.code.trim(),
      sentAt: new Date(),
    });
  }

  getLastCodeFor(phoneNumber: string): string | undefined {
    const norm = phoneNumber.trim();
    const matches = this.sentMessages.filter((m) => m.phoneNumber === norm);
    return matches[matches.length - 1]?.code;
  }

  clear(): void {
    this.sentMessages = [];
  }
}

export interface HttpSmsProviderOptions {
  apiUrl?: string;
  apiKey?: string;
  username?: string;
  password?: string;
  sender?: string;
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * Generic HTTP SMS Provider for Production.
 * Connects to an external SMS gateway API using environment variables.
 */
export class HttpSmsProvider implements SmsProvider {
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly sender?: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: HttpSmsProviderOptions) {
    if (!options.apiUrl) {
      throw new Error(
        "HttpSmsProvider configuration error: SMS_API_URL is required for HTTP SMS Provider.",
      );
    }
    this.apiUrl = options.apiUrl;
    this.apiKey = options.apiKey;
    this.username = options.username;
    this.password = options.password;
    this.sender = options.sender;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async sendVerificationCode(input: {
    phoneNumber: string;
    code: string;
  }): Promise<void> {
    const text = `کد تأیید ورود شما به آوانا: ${input.code}\nاعتبار: ۱۰ دقیقه`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
      headers["X-API-KEY"] = this.apiKey;
    }

    const payload: Record<string, unknown> = {
      receptor: input.phoneNumber,
      to: input.phoneNumber,
      phoneNumber: input.phoneNumber,
      message: text,
      code: input.code,
      sender: this.sender ?? "AVANA",
    };

    if (this.username) payload["username"] = this.username;
    if (this.password) payload["password"] = this.password;
    if (this.apiKey) payload["apiKey"] = this.apiKey;

    const response = await this.fetchImpl(this.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(
        `SMS gateway delivery failed (${response.status}): ${errorBody}`,
      );
    }
  }
}

export interface MedianaSmsProviderOptions {
  apiKey: string;
  patternCode: string;
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof globalThis.fetch;
}

interface MedianaErrorItem {
  key?: string;
  errors?: string[];
  errorCode?: number;
}

interface MedianaApiResponse {
  meta?: {
    code?: string;
    errorMessage?: string | null;
    errors?: Array<MedianaErrorItem | string>;
  };
  data?: {
    Succeed?: boolean;
    RequestId?: number;
    RequestCode?: string;
    Message?: string;
    Status?: string;
    SmsItems?: Array<{
      SmsItemId?: string;
      Recipient?: string;
    }>;
  } | null;
}

/**
 * Helper to mask phone numbers for safe diagnostics without leaking PII.
 */
export function maskPhoneNumberForLogs(phone: string): string {
  const sanitized = phone.trim();
  if (sanitized.length <= 5) return "***";
  if (sanitized.startsWith("+98") && sanitized.length === 13) {
    return `${sanitized.slice(0, 6)}***${sanitized.slice(-2)}`;
  }
  if (sanitized.startsWith("09") && sanitized.length === 11) {
    return `${sanitized.slice(0, 4)}***${sanitized.slice(-2)}`;
  }
  return `${sanitized.slice(0, 3)}***${sanitized.slice(-2)}`;
}

/**
 * Format any valid Iranian phone number to canonical E.164-style format (+989xxxxxxxxx)
 * as produced by the domain layer.
 */
export function formatMedianaRecipient(phone: string): string {
  const converted = phone
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  const sanitized = converted.replace(/[\s\-_()]/g, "");

  if (sanitized.startsWith("09") && sanitized.length === 11) {
    return `+98${sanitized.slice(1)}`;
  }
  if (sanitized.startsWith("0098") && sanitized.length === 14) {
    return `+${sanitized.slice(2)}`;
  }
  if (sanitized.startsWith("9") && sanitized.length === 10) {
    return `+98${sanitized}`;
  }
  return sanitized;
}

/**
 * Mediana SMS Provider for Production OTP verification.
 * Implements Mediana OpenAPI 3.0 specification for endpoint:
 * POST https://api.mediana.ir/sms/v1/send/otp
 */
export class MedianaSmsProvider implements SmsProvider {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly patternCode: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: MedianaSmsProviderOptions) {
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new Error(
        "MedianaSmsProvider configuration error: MEDIANA_API_KEY is required.",
      );
    }
    if (!options.patternCode || options.patternCode.trim().length === 0) {
      throw new Error(
        "MedianaSmsProvider configuration error: MEDIANA_PATTERN_CODE is required for OTP pattern sending.",
      );
    }

    this.apiKey = options.apiKey.trim();
    this.patternCode = options.patternCode.trim();
    this.apiUrl = (options.apiUrl ?? "https://api.mediana.ir").trim().replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 10_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async sendVerificationCode(input: {
    phoneNumber: string;
    code: string;
  }): Promise<void> {
    if (!input.phoneNumber || !input.phoneNumber.trim()) {
      throw new Error("MedianaSmsProvider error: Phone number is required.");
    }
    if (!input.code || !input.code.trim()) {
      throw new Error("MedianaSmsProvider error: OTP code is required.");
    }

    const recipient = formatMedianaRecipient(input.phoneNumber);
    const endpoint = `${this.apiUrl}/sms/v1/send/otp`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-API-KEY": this.apiKey,
    };

    const payload = {
      patternCode: this.patternCode,
      recipient,
      otpCode: input.code.trim(),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        throw new Error(
          `Mediana SMS delivery timed out after ${this.timeoutMs}ms for ${maskPhoneNumberForLogs(recipient)}`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Mediana SMS delivery network error for ${maskPhoneNumberForLogs(recipient)}: ${message}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    let parsedBody: MedianaApiResponse | null = null;
    let rawText = "";
    try {
      rawText = await response.text();
      if (rawText && rawText.trim().startsWith("{")) {
        parsedBody = JSON.parse(rawText) as MedianaApiResponse;
      }
    } catch {
      parsedBody = null;
    }

    // Handle non-2xx HTTP responses
    if (!response.ok) {
      const metaError = parsedBody?.meta?.errorMessage;
      const metaCode = parsedBody?.meta?.code;
      const detailedErrors = parsedBody?.meta?.errors
        ?.map((e) => (typeof e === "string" ? e : e.errors?.join(", ") || e.key))
        .filter(Boolean)
        .join("; ");

      const errorDescription =
        metaError ||
        detailedErrors ||
        (metaCode ? `Error code ${metaCode}` : "") ||
        (rawText && rawText.length < 200 ? rawText : `HTTP ${response.status} ${response.statusText}`);

      throw new Error(
        `Mediana SMS delivery failed (${response.status}) for ${maskPhoneNumberForLogs(recipient)}: ${errorDescription}`,
      );
    }

    // Handle 200 OK responses with business failure in body
    if (parsedBody) {
      const isFailed =
        parsedBody.data?.Succeed === false ||
        parsedBody.data?.Status === "Failed" ||
        (parsedBody.meta?.errorMessage && parsedBody.meta.errorMessage.trim().length > 0);

      if (isFailed) {
        const errorDescription =
          parsedBody.meta?.errorMessage ||
          parsedBody.data?.Message ||
          `Status: ${parsedBody.data?.Status ?? "Failed"}`;
        throw new Error(
          `Mediana SMS delivery rejected for ${maskPhoneNumberForLogs(recipient)}: ${errorDescription}`,
        );
      }
    } else if (!rawText || rawText.trim().length === 0) {
      throw new Error(
        `Mediana SMS delivery failed: Empty response from server for ${maskPhoneNumberForLogs(recipient)}`,
      );
    }
  }
}

