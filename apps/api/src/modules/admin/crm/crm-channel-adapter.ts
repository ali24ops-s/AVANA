import { randomUUID } from "node:crypto";
import type {
  CampaignChannel,
  CrmChannelAdapter,
  SendMessagePayload,
  SendMessageResult,
} from "@avana/domain";

export type { CrmChannelAdapter, SendMessagePayload, SendMessageResult };

/**
 * Sanitizes contact information for audit and console logs without exposing sensitive PII.
 */
export function sanitizeContact(contact?: string | null): string {
  if (!contact) return "—";
  const trimmed = contact.trim();
  if (trimmed.includes("@")) {
    const [local, domain] = trimmed.split("@");
    if (!local || !domain) return "***@***";
    const maskedLocal =
      local.length <= 2
        ? `${local[0] || ""}***`
        : `${local.slice(0, 2)}***${local.slice(-1)}`;
    return `${maskedLocal}@${domain}`;
  }
  // Phone number or ID
  if (trimmed.length > 6) {
    return `${trimmed.slice(0, 4)}***${trimmed.slice(-3)}`;
  }
  return "***";
}

/**
 * Normalizes Persian/Arabic digits, strips whitespace and formatting,
 * and validates Iranian mobile phone format.
 */
export function normalizeIranianMobile(phone?: string | null): { isValid: boolean; normalized: string } {
  if (!phone) return { isValid: false, normalized: "" };
  const converted = phone
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  const clean = converted.replace(/[\s\-_()]/g, "");

  let normalized = clean;
  if (clean.startsWith("+98") && clean.length === 13) {
    normalized = "0" + clean.slice(3);
  } else if (clean.startsWith("0098") && clean.length === 14) {
    normalized = "0" + clean.slice(4);
  } else if (clean.startsWith("9") && clean.length === 10) {
    normalized = "0" + clean;
  }

  const isValid = /^09\d{9}$/.test(normalized);
  return { isValid, normalized };
}

/**
 * Lightweight, dependency-free token bucket rate limiter to prevent telecommunication gateway throttling.
 */
export class SimpleRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;

  constructor(requestsPerSecond: number = 25) {
    this.maxTokens = Math.max(1, requestsPerSecond);
    this.tokens = this.maxTokens;
    this.refillRatePerMs = this.maxTokens / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      const elapsed = Math.max(0, now - this.lastRefill);
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs);
      this.lastRefill = now;

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const waitMs = Math.ceil((1 - this.tokens) / this.refillRatePerMs);
      await new Promise((resolve) => setTimeout(resolve, Math.max(5, Math.min(waitMs, 100))));
    }
  }
}

/**
 * Configuration for the CRM SMS Channel Adapter.
 */
export interface CrmSmsAdapterConfig {
  /**
   * Explicit flag to enable live external network delivery.
   * Default MUST BE FALSE.
   */
  liveSendingEnabled?: boolean;
  provider?: "mediana" | "http" | "mock" | "disabled";
  apiUrl?: string;
  apiKey?: string;
  sender?: string;
  timeoutMs?: number;
  rateLimitPerSecond?: number;
  fetchImpl?: typeof globalThis.fetch;
  logger?: (msg: string) => void;
}

/**
 * Production-ready CRM SMS Channel Adapter.
 *
 * Defaults to safe Dry-Run mode with zero external network egress unless liveSendingEnabled is true.
 * Provides:
 * - Pre-flight phone format validation and Persian digit normalization.
 * - Message content validation (non-empty, length check).
 * - Persistent Idempotency Key (executionId:recipientId) transmitted to avoid duplicate sends.
 * - Built-in Token Bucket Rate Limiting.
 * - Separation of transient network/5xx errors from permanent 4xx validation errors.
 * - Complete PII sanitization in logs.
 */
export class CrmSmsChannelAdapter implements CrmChannelAdapter {
  public readonly channel: CampaignChannel = "sms";
  private readonly config: CrmSmsAdapterConfig;
  private readonly rateLimiter: SimpleRateLimiter;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly logger: (msg: string) => void;

  constructor(config?: CrmSmsAdapterConfig) {
    this.config = {
      liveSendingEnabled: false, // Strictly false by default
      provider: "disabled",
      timeoutMs: 10_000,
      rateLimitPerSecond: 25,
      ...config,
    };
    this.rateLimiter = new SimpleRateLimiter(this.config.rateLimitPerSecond ?? 25);
    this.fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    this.logger = this.config.logger ?? ((msg) => process.stdout.write(`${msg}\n`));
  }

  isLive(): boolean {
    return this.config.liveSendingEnabled === true;
  }

  async send(payload: SendMessagePayload): Promise<SendMessageResult> {
    const rawContact = payload.recipientContact?.trim();

    // 1. Validate Phone Number (Permanent error if invalid)
    const { isValid, normalized } = normalizeIranianMobile(rawContact);
    if (!isValid) {
      return {
        success: false,
        error: {
          code: "INVALID_PHONE_NUMBER",
          message: `فرمت شماره موبایل نامعتبر است: ${sanitizeContact(rawContact)}`,
          isTransient: false,
        },
      };
    }

    // 2. Validate Message Content (Permanent error if empty or too long)
    const content = payload.messageContent?.trim();
    if (!content || content.length === 0) {
      return {
        success: false,
        error: {
          code: "EMPTY_MESSAGE",
          message: "متن پیامک ارسالی نمی‌تواند خالی باشد.",
          isTransient: false,
        },
      };
    }

    if (content.length > 1000) {
      return {
        success: false,
        error: {
          code: "MESSAGE_TOO_LONG",
          message: "طول متن پیامک بیش از سقف مجاز (۱۰۰۰ کاراکتر) است.",
          isTransient: false,
        },
      };
    }

    // 3. Persistent Idempotency Key (executionId:recipientId)
    const idempotencyKey = `${payload.executionId}:${payload.recipientId}`;

    // 4. Default Dry-Run Guard: Zero network egress if liveSendingEnabled is not explicitly true
    if (!this.config.liveSendingEnabled) {
      this.logger(
        `[CrmSms:DryRun] Simulated SMS delivery to ${sanitizeContact(normalized)} (idempotencyKey=${idempotencyKey})`,
      );
      return {
        success: true,
        providerMessageId: `dryrun-sms-${randomUUID().slice(0, 8)}`,
      };
    }

    // 5. Fail-Closed check for live mode: Explicit apiUrl and apiKey required.
    // Never fallback to a guessed endpoint or send unauthenticated requests.
    if (!this.config.apiUrl || !this.config.apiKey) {
      return {
        success: false,
        error: {
          code: "SMS_PROVIDER_CONFIG_INCOMPLETE",
          message: "تنظیمات درگاه پیامک برای ارسال زنده کمپین (URL اختصاصی و API Key) ناقص یا تعریف نشده است. جهت حفظ امنیت و جلوگیری از ارسال به آدرس فرضی، ارسال مسدود شد (Fail-Closed).",
          isTransient: false,
        },
      };
    }

    // 6. Rate Limiting Protection
    await this.rateLimiter.acquire();

    // 7. Network Dispatch to SMS Gateway
    const apiUrl = this.config.apiUrl;
    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs && this.config.timeoutMs > 0 ? this.config.timeoutMs : 10_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      headers["X-API-KEY"] = this.config.apiKey;
    }

    const requestBody = {
      recipient: normalized,
      to: normalized,
      phoneNumber: normalized,
      message: content,
      sender: this.config.sender ?? "AVANA",
      idempotencyKey,
      clientMessageId: idempotencyKey,
    };

    try {
      const response = await this.fetchImpl(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        const status = response.status;

        if (status >= 400 && status < 500) {
          // Client or validation error (4xx) -> Permanent failure
          return {
            success: false,
            error: {
              code: "SMS_PROVIDER_REJECTED",
              message: `درخواست توسط درگاه پیامک رد شد (${status}): ${errorText.slice(0, 150)}`,
              isTransient: false,
            },
          };
        } else {
          // Server error (5xx) -> Transient failure
          return {
            success: false,
            error: {
              code: "SMS_PROVIDER_UNAVAILABLE",
              message: `درگاه پیامک موقتاً پاسخگو نیست (${status})`,
              isTransient: true,
            },
          };
        }
      }

      // Success (2xx)
      let parsed: any = null;
      try {
        const raw = await response.text();
        if (raw && raw.trim().startsWith("{")) {
          parsed = JSON.parse(raw);
        }
      } catch {
        parsed = null;
      }

      const providerMessageId =
        parsed?.messageId ||
        parsed?.data?.SmsItems?.[0]?.SmsItemId ||
        parsed?.data?.RequestId ||
        `live-sms-${randomUUID().slice(0, 8)}`;

      return {
        success: true,
        providerMessageId: String(providerMessageId),
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (controller.signal.aborted) {
        return {
          success: false,
          error: {
            code: "DELIVERY_UNCONFIRMED_TIMEOUT",
            message: `ارتباط با درگاه پیامک پس از ${timeoutMs} میلی‌ثانیه با وقفه زمانی (Timeout) مواجه شد. وضعیت تحویل پیامک نامشخص است؛ جهت جلوگیری از ارسال تکراری ناخواسته به مخاطب، تلاش مجدد خودکار غیرفعال شد (Non-Transient).`,
            isTransient: false,
          },
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: {
          code: "SMS_NETWORK_ERROR",
          message: `خطای شبکه در ارتباط با درگاه پیامک: ${message}`,
          isTransient: true,
        },
      };
    }
  }
}

/**
 * Disabled Dry-Run Channel Adapter (Default Boundary).
 *
 * Strictly prohibits and prevents real SMS, email, telegram, or in-app external delivery.
 * Simulates execution for delivery tracking, lifecycle validation, and queue verification.
 */
export class DisabledDryRunChannelAdapter implements CrmChannelAdapter {
  constructor(public readonly channel: CampaignChannel) {}

  async send(payload: SendMessagePayload): Promise<SendMessageResult> {
    const contact = payload.recipientContact?.trim();

    // Validate contact existence
    if (!contact) {
      return {
        success: false,
        error: {
          code: "INVALID_CONTACT",
          message: "اطلاعات تماس مخاطب (شماره موبایل یا ایمیل) برای این کانال یافت نشد.",
          isTransient: false,
        },
      };
    }

    // Validate channel-specific contact format basics
    if (this.channel === "sms" && !/^(09\d{9}|\+989\d{9})$/.test(contact.replace(/\s+/g, ""))) {
      return {
        success: false,
        error: {
          code: "INVALID_PHONE_NUMBER",
          message: `فرمت شماره موبایل نامعتبر است: ${sanitizeContact(contact)}`,
          isTransient: false,
        },
      };
    }

    if (this.channel === "email" && (!contact.includes("@") || !contact.includes("."))) {
      return {
        success: false,
        error: {
          code: "INVALID_EMAIL_ADDRESS",
          message: `فرمت آدرس ایمیل نامعتبر است: ${sanitizeContact(contact)}`,
          isTransient: false,
        },
      };
    }

    // Default simulation: strictly dry-run without real network dispatch
    const simulatedMessageId = `dryrun-${this.channel}-${randomUUID().slice(0, 8)}`;
    return {
      success: true,
      providerMessageId: simulatedMessageId,
    };
  }
}

/**
 * Mock Channel Adapter for testing transient vs permanent failure recovery,
 * timeout simulation, and worker resilience.
 */
export class MockCrmChannelAdapter implements CrmChannelAdapter {
  private customHandler?: (payload: SendMessagePayload) => Promise<SendMessageResult>;
  public readonly sentPayloads: SendMessagePayload[] = [];

  constructor(
    public readonly channel: CampaignChannel,
    handler?: (payload: SendMessagePayload) => Promise<SendMessageResult>,
  ) {
    this.customHandler = handler;
  }

  setHandler(handler: (payload: SendMessagePayload) => Promise<SendMessageResult>): void {
    this.customHandler = handler;
  }

  async send(payload: SendMessagePayload): Promise<SendMessageResult> {
    this.sentPayloads.push(payload);
    if (this.customHandler) {
      return this.customHandler(payload);
    }
    return {
      success: true,
      providerMessageId: `mock-${this.channel}-${randomUUID().slice(0, 8)}`,
    };
  }

  clear(): void {
    this.sentPayloads.length = 0;
  }
}

/**
 * Registry holding channel adapters for campaign dispatch.
 */
export class CrmChannelAdapterRegistry {
  private readonly adapters = new Map<CampaignChannel, CrmChannelAdapter>();

  constructor(options?: { smsAdapter?: CrmChannelAdapter }) {
    // Register SMS adapter (or default to CrmSmsChannelAdapter with liveSendingEnabled: false)
    this.register(options?.smsAdapter ?? new CrmSmsChannelAdapter({ liveSendingEnabled: false }));
    this.register(new DisabledDryRunChannelAdapter("email"));
    this.register(new DisabledDryRunChannelAdapter("telegram"));
    this.register(new DisabledDryRunChannelAdapter("in_app"));
  }

  register(adapter: CrmChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: CampaignChannel): CrmChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      return new DisabledDryRunChannelAdapter(channel);
    }
    return adapter;
  }
}
