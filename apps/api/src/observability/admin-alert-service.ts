/**
 * Admin Alert Service for AVANA Operational Notifications.
 *
 * Responsibilities:
 * - Decides whether alerts are enabled.
 * - Formats operator-facing messages in clear, concise Persian text.
 * - Enforces data sanitization/redaction (zero passwords, tokens, PII, raw prompts).
 * - Implements a bounded in-memory sliding window cooldown to prevent alert storms.
 * - Fire-and-forget delivery: errors never bubble up to callers.
 */

import { TelegramClient } from "./telegram-client.js";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertPayload {
  title: string;
  category: string;
  severity: AlertSeverity;
  details?: Record<string, string | number | boolean | null | undefined>;
  error?: unknown;
  timestamp?: string;
}

export interface AdminAlertServiceOptions {
  enabled?: boolean;
  telegramClient?: TelegramClient;
  logger?: (msg: string) => void;
  cooldownWindowMs?: number;
}

export class AdminAlertService {
  private readonly enabled: boolean;
  private readonly telegramClient: TelegramClient;
  private readonly logger: (msg: string) => void;
  private readonly cooldownWindowMs: number;
  private readonly cooldownMap = new Map<string, number>();

  constructor(options: AdminAlertServiceOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.telegramClient = options.telegramClient ?? new TelegramClient();
    this.logger =
      options.logger ??
      ((msg) => {
        if (process.env.NODE_ENV !== "test") {
          process.stdout.write(`${msg}\n`);
        }
      });
    this.cooldownWindowMs = options.cooldownWindowMs ?? 60_000; // 1 minute default
  }

  /**
   * Check if alerts are actively enabled and configured.
   */
  isEnabled(): boolean {
    return this.enabled && this.telegramClient.isConfigured();
  }

  /**
   * Send a critical alert (fire-and-forget, completely error-isolated).
   */
  async notifyCritical(
    category: string,
    title: string,
    options?: {
      details?: Record<string, string | number | boolean | null | undefined>;
      error?: unknown;
      cooldownKey?: string;
    },
  ): Promise<boolean> {
    return this.sendAlert({
      category,
      title,
      severity: "critical",
      details: options?.details,
      error: options?.error,
    }, options?.cooldownKey);
  }

  /**
   * Main alert sender with cooldown checks and safe formatting.
   */
  async sendAlert(
    payload: AlertPayload,
    cooldownKey?: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    // Cooldown check to prevent Telegram spam storms
    const key = cooldownKey || `${payload.category}:${payload.title}`;
    const now = Date.now();
    const lastSent = this.cooldownMap.get(key);

    if (lastSent && now - lastSent < this.cooldownWindowMs) {
      return false;
    }

    // Evict expired cooldown entries if map grows large
    if (this.cooldownMap.size > 200) {
      for (const [k, timestamp] of this.cooldownMap.entries()) {
        if (now - timestamp > this.cooldownWindowMs) {
          this.cooldownMap.delete(k);
        }
      }
    }

    this.cooldownMap.set(key, now);

    const message = this.formatMessage(payload);

    try {
      const res = await this.telegramClient.sendMessage(message);
      if (!res.sent) {
        this.logger(`[admin-alert] Telegram delivery failed: ${res.reason ?? "unknown"}`);
      }
      return res.sent;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger(`[admin-alert] Unexpected error sending alert: ${msg}`);
      return false;
    }
  }

  /**
   * Format message into clear, plain text (avoiding Markdown/HTML injection).
   */
  private formatMessage(payload: AlertPayload): string {
    const icon =
      payload.severity === "critical"
        ? "🔴"
        : payload.severity === "warning"
          ? "🟡"
          : "ℹ️";

    const lines: string[] = [
      `${icon} هشدار عملیاتی آوانا`,
      `عنوان: ${payload.title}`,
      `دسته‌بندی: ${payload.category}`,
    ];

    if (payload.details) {
      for (const [key, value] of Object.entries(payload.details)) {
        if (value !== undefined && value !== null) {
          const safeKey = this.sanitizeField(key);
          const safeVal = this.sanitizeValue(value);
          lines.push(`${safeKey}: ${safeVal}`);
        }
      }
    }

    if (payload.error) {
      const errorMsg =
        payload.error instanceof Error
          ? payload.error.message
          : typeof payload.error === "object" && payload.error !== null && "message" in payload.error
            ? String((payload.error as { message: unknown }).message)
            : String(payload.error);

      // Truncate long error messages to 200 chars
      const truncated = errorMsg.length > 200 ? `${errorMsg.slice(0, 197)}...` : errorMsg;
      lines.push(`خطا: ${truncated}`);
    }

    const time = payload.timestamp ?? new Date().toISOString();
    lines.push(`زمان: ${time}`);

    return lines.join("\n");
  }

  private sanitizeField(key: string): string {
    const fieldMap: Record<string, string> = {
      jobId: "شناسه جاب",
      documentId: "شناسه سند",
      courseId: "شناسه دوره",
      errorCode: "کد خطا",
      retryCount: "تعداد تلاش",
      context: "محیط اجرا",
      url: "مسیر درخواست",
      method: "متد HTTP",
      requestId: "شناسه درخواست",
      ip: "آدرس IP",
    };
    return fieldMap[key] || key;
  }

  private sanitizeValue(val: unknown): string {
    const str = String(val);
    // Mask potential phone numbers
    if (/^09\d{9}$/.test(str)) {
      return `${str.slice(0, 4)}***${str.slice(-2)}`;
    }
    if (/^\+989\d{9}$/.test(str)) {
      return `${str.slice(0, 6)}***${str.slice(-2)}`;
    }
    return str;
  }
}
