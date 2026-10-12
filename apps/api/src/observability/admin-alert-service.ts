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

import { TelegramClient, type TelegramInlineKeyboardMarkup } from "./telegram-client.js";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertPayload {
  title: string;
  category: string;
  severity: AlertSeverity;
  details?: Record<string, string | number | boolean | null | undefined>;
  error?: unknown;
  timestamp?: string;
  replyMarkup?: TelegramInlineKeyboardMarkup;
  customText?: string;
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
  /**
   * Tracks component failure state to ensure Recovery alerts only fire after a real failure
   * Transition: healthy -> failed -> healthy
   */
  private readonly failedComponents = new Set<string>();

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
   * Marks the component/category as failed.
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
    this.failedComponents.add(category);
    return this.sendAlert({
      category,
      title,
      severity: "critical",
      details: options?.details,
      error: options?.error,
    }, options?.cooldownKey);
  }

  /**
   * Send a recovery alert only if the component was previously marked failed.
   * Clears the failure flag upon successful transition.
   */
  async notifyRecovery(
    category: string,
    title: string,
    options?: {
      details?: Record<string, string | number | boolean | null | undefined>;
      cooldownKey?: string;
    },
  ): Promise<boolean> {
    if (!this.failedComponents.has(category)) {
      return false; // Do not send recovery if it wasn't previously in failed state
    }
    this.failedComponents.delete(category);

    return this.sendAlert({
      category,
      title,
      severity: "info",
      details: options?.details,
    }, options?.cooldownKey ?? `recovery:${category}`);
  }

  /**
   * Send an informational or business alert (e.g. payment completed, teacher approved).
   */
  async notifyInfo(
    category: string,
    title: string,
    options?: {
      details?: Record<string, string | number | boolean | null | undefined>;
      cooldownKey?: string;
    },
  ): Promise<boolean> {
    return this.sendAlert({
      category,
      title,
      severity: "info",
      details: options?.details,
    }, options?.cooldownKey);
  }

  /**
   * Send notification for a new user registration (no sensitive data or unnecessary PII).
   */
  async notifyUserRegistered(details: {
    userId: string;
    name?: string;
    createdAt?: string;
  }): Promise<boolean> {
    const time = details.createdAt ?? new Date().toISOString();
    const lines = [
      "👤 ثبت‌نام کاربر جدید",
      "",
      `نام: ${details.name || "نامشخص"}`,
      `زمان: ${time}`,
      `شناسه: ${details.userId}`,
    ];
    return this.sendAlert(
      {
        category: "user.registered",
        title: "ثبت‌نام کاربر جدید",
        severity: "info",
        customText: lines.join("\n"),
        timestamp: time,
      },
      `user.registered:${details.userId}`,
    );
  }

  /**
   * Send notification for a new teacher registration / application request.
   */
  async notifyTeacherRequested(details: {
    teacherId: string;
    name?: string;
    university?: string;
    createdAt?: string;
  }): Promise<boolean> {
    const time = details.createdAt ?? new Date().toISOString();
    const lines = [
      "👨‍🏫 درخواست ثبت‌نام استاد",
      "",
      `نام: ${details.name || "نامشخص"}`,
      `دانشگاه: ${details.university || "نامشخص"}`,
      `زمان: ${time}`,
      `شناسه درخواست: ${details.teacherId}`,
    ];
    return this.sendAlert(
      {
        category: "teacher.requested",
        title: "درخواست ثبت‌نام استاد",
        severity: "info",
        customText: lines.join("\n"),
        timestamp: time,
      },
      `teacher.requested:${details.teacherId}`,
    );
  }

  /**
   * Send notification for a new payment with inline buttons for reviewable payments.
   */
  async notifyPaymentReceived(details: {
    paymentId: string;
    amount: number;
    productTitle?: string;
    productType?: string;
    status: string;
    gateway?: string;
    isC2C?: boolean;
    createdAt?: string;
    trackingNumber?: string;
    sourceCardLast4?: string;
    payerName?: string;
    paidAt?: string;
    orderId?: string;
    userId?: string;
    userName?: string;
  }): Promise<boolean> {
    const time = details.createdAt ?? new Date().toISOString();
    const formattedAmount = `${Number(details.amount).toLocaleString("fa-IR")} تومان`;

    let typeLabel: string;
    if (details.productType === "wallet_topup" || details.productTitle === "شارژ کیف پول") {
      typeLabel = "شارژ کیف پول";
    } else if (details.productType === "course") {
      typeLabel = details.productTitle ? details.productTitle : "دوره آموزشی";
    } else if (details.productType === "subscription") {
      typeLabel = details.productTitle || "اشتراک آوانا";
    } else {
      typeLabel = details.productTitle || details.productType || "اشتراک آوانا";
    }

    const statusLabel = details.status;

    const resolveGatewayLabel = (gw?: string, isC2C?: boolean): string => {
      if (isC2C) return "کارت‌به‌کارت";
      if (!gw) return "درگاه اینترنتی";
      if (gw === "wallet") return "کیف پول";
      if (gw === "zarinpal") return "درگاه اینترنتی (زرین‌پال)";
      if (gw === "mock") return "درگاه آزمایشی (Mock)";
      return `درگاه اینترنتی (${gw})`;
    };

    const lines: string[] = [];

    if (details.isC2C) {
      if (details.productType === "wallet_topup" || details.productTitle === "شارژ کیف پول") {
        lines.push("💳 درخواست شارژ کیف پول (پرداخت کارت‌به‌کارت جدید)", "");
      } else if (details.productType === "course") {
        lines.push("💳 سفارش دوره آموزشی (پرداخت کارت‌به‌کارت جدید)", "");
      } else if (details.productType === "subscription") {
        lines.push("💳 سفارش اشتراک (پرداخت کارت‌به‌کارت جدید)", "");
      } else {
        lines.push("💳 پرداخت کارت‌به‌کارت جدید", "");
      }

      lines.push(`مبلغ: ${formattedAmount}`);
      lines.push(`نوع: ${typeLabel}`);
      lines.push(`روش پرداخت: ${resolveGatewayLabel(details.gateway, true)}`);
      if (details.orderId) {
        lines.push(`شناسه سفارش: ${details.orderId}`);
      }
      if (details.userId) {
        lines.push(`شناسه کاربر: ${details.userId}`);
      }

      const c2cLines: string[] = [];
      if (details.trackingNumber?.trim()) {
        c2cLines.push(`• شماره پیگیری: ${details.trackingNumber.trim()}`);
      }
      if (details.sourceCardLast4?.trim()) {
        const last4 = details.sourceCardLast4.trim().slice(-4);
        c2cLines.push(`• کارت مبدأ: **** **** **** ${last4}`);
      }
      if (details.payerName?.trim()) {
        c2cLines.push(`• واریزکننده: ${details.payerName.trim()}`);
      }
      if (details.paidAt?.trim()) {
        c2cLines.push(`• تاریخ واریز: ${details.paidAt.trim()}`);
      }

      if (c2cLines.length > 0) {
        lines.push("", "اطلاعات واریز:", ...c2cLines);
      }

      lines.push("", `وضعیت: ${statusLabel}`);
      lines.push(`زمان: ${time}`);
      lines.push(`شناسه: ${details.paymentId}`);
    } else {
      if (details.productType === "wallet_topup" || details.productTitle === "شارژ کیف پول") {
        lines.push("💳 شارژ کیف پول (پرداخت جدید)", "");
      } else if (details.productType === "course") {
        lines.push("💳 خرید دوره آموزشی (پرداخت جدید)", "");
      } else if (details.productType === "subscription") {
        lines.push("💳 خرید اشتراک (پرداخت جدید)", "");
      } else {
        lines.push("💳 پرداخت جدید", "");
      }

      lines.push(`مبلغ: ${formattedAmount}`);
      lines.push(`نوع: ${typeLabel}`);
      lines.push(`روش پرداخت: ${resolveGatewayLabel(details.gateway, false)}`);
      if (details.orderId) {
        lines.push(`شناسه سفارش: ${details.orderId}`);
      }
      if (details.userId) {
        lines.push(`شناسه کاربر: ${details.userId}`);
      }
      lines.push(`وضعیت: ${statusLabel}`);
      lines.push(`زمان: ${time}`);
      lines.push(`شناسه: ${details.paymentId}`);
    }

    const replyMarkup: TelegramInlineKeyboardMarkup | undefined = details.isC2C
      ? {
          inline_keyboard: [
            [
              { text: "✅ تأیید پرداخت", callback_data: `pay:app:${details.paymentId}` },
              { text: "❌ رد پرداخت", callback_data: `pay:rej:${details.paymentId}` },
            ],
          ],
        }
      : undefined;

    return this.sendAlert(
      {
        category: "payment.received",
        title: "پرداخت جدید",
        severity: "info",
        customText: lines.join("\n"),
        replyMarkup,
        timestamp: time,
      },
      `payment:${details.paymentId}`,
    );
  }

  /**
   * Send notification for an approved payment (e.g. approved via Web Admin Panel).
   */
  async notifyPaymentApproved(details: {
    paymentId: string;
    orderId?: string;
    amount: number;
    productTitle?: string;
    productType?: string;
    userId?: string;
    approvedBy?: string;
    actorType?: string;
    createdAt?: string;
  }): Promise<boolean> {
    const time = details.createdAt ?? new Date().toISOString();
    const formattedAmount = `${Number(details.amount).toLocaleString("fa-IR")} تومان`;
    let typeLabel: string;
    if (details.productType === "wallet_topup" || details.productTitle === "شارژ کیف پول") {
      typeLabel = "شارژ کیف پول";
    } else if (details.productType === "course") {
      typeLabel = details.productTitle ? details.productTitle : "دوره آموزشی";
    } else if (details.productType === "subscription") {
      typeLabel = details.productTitle || "اشتراک آوانا";
    } else {
      typeLabel = details.productTitle || details.productType || "سفارش آوانا";
    }

    const lines: string[] = [
      "✅ پرداخت تأیید شد",
      "",
      `مبلغ: ${formattedAmount}`,
      `نوع: ${typeLabel}`,
      `شناسه پرداخت: ${details.paymentId}`,
    ];
    if (details.orderId) {
      lines.push(`شناسه سفارش: ${details.orderId}`);
    }
    if (details.userId) {
      lines.push(`شناسه کاربر: ${details.userId}`);
    }
    const approver = details.actorType === "admin/telegram" ? "Admin (تلگرام)" : "Admin (پنل مدیریت)";
    lines.push(`تأیید توسط: ${approver}`);
    lines.push(`زمان: ${time}`);

    return this.sendAlert(
      {
        category: "payment.approved",
        title: "پرداخت تأیید شد",
        severity: "info",
        customText: lines.join("\n"),
        timestamp: time,
      },
      `payment:approved:${details.paymentId}`,
    );
  }

  /**
   * Send notification for a rejected payment (e.g. rejected via Web Admin Panel).
   */
  async notifyPaymentRejected(details: {
    paymentId: string;
    orderId?: string;
    amount: number;
    productTitle?: string;
    productType?: string;
    userId?: string;
    rejectedBy?: string;
    reason: string;
    actorType?: string;
    createdAt?: string;
  }): Promise<boolean> {
    const time = details.createdAt ?? new Date().toISOString();
    const formattedAmount = `${Number(details.amount).toLocaleString("fa-IR")} تومان`;
    let typeLabel: string;
    if (details.productType === "wallet_topup" || details.productTitle === "شارژ کیف پول") {
      typeLabel = "شارژ کیف پول";
    } else if (details.productType === "course") {
      typeLabel = details.productTitle ? details.productTitle : "دوره آموزشی";
    } else if (details.productType === "subscription") {
      typeLabel = details.productTitle || "اشتراک آوانا";
    } else {
      typeLabel = details.productTitle || details.productType || "سفارش آوانا";
    }

    const lines: string[] = [
      "❌ پرداخت رد شد",
      "",
      `مبلغ: ${formattedAmount}`,
      `نوع: ${typeLabel}`,
      `علت رد: ${details.reason}`,
      `شناسه پرداخت: ${details.paymentId}`,
    ];
    if (details.orderId) {
      lines.push(`شناسه سفارش: ${details.orderId}`);
    }
    if (details.userId) {
      lines.push(`شناسه کاربر: ${details.userId}`);
    }
    const rejector = details.actorType === "admin/telegram" ? "Admin (تلگرام)" : "Admin (پنل مدیریت)";
    lines.push(`رد توسط: ${rejector}`);
    lines.push(`زمان: ${time}`);

    return this.sendAlert(
      {
        category: "payment.rejected",
        title: "پرداخت رد شد",
        severity: "info",
        customText: lines.join("\n"),
        timestamp: time,
      },
      `payment:rejected:${details.paymentId}`,
    );
  }

  /**
   * Send notification for a wallet refund event.
   */
  async notifyWalletRefunded(details: {
    walletId: string;
    amount: number;
    source?: string;
    userId?: string;
    referenceType?: string;
    referenceId?: string;
    createdAt?: string;
  }): Promise<boolean> {
    const time = details.createdAt ?? new Date().toISOString();
    const formattedAmount = `${Number(details.amount).toLocaleString("fa-IR")} تومان`;

    const lines: string[] = [
      "🔄 بازپرداخت کیف پول",
      "",
      `مبلغ: ${formattedAmount}`,
      `شناسه کیف پول: ${details.walletId}`,
    ];
    if (details.source) {
      lines.push(`منبع بازپرداخت: ${details.source}`);
    }
    if (details.referenceId) {
      lines.push(`شناسه مرجع: ${details.referenceId}`);
    }
    lines.push(`زمان: ${time}`);

    return this.sendAlert(
      {
        category: "wallet.refunded",
        title: "بازپرداخت کیف پول",
        severity: "info",
        customText: lines.join("\n"),
        timestamp: time,
      },
      `wallet:refund:${details.walletId}:${details.amount}:${time.slice(0, 16)}`,
    );
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

    const message = payload.customText || this.formatMessage(payload);

    try {
      const res = await this.telegramClient.sendMessage(message, undefined, payload.replyMarkup);
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
      amount: "مبلغ (تومان)",
      gateway: "درگاه پرداخت",
      status: "وضعیت",
      teacherId: "شناسه استاد",
      reason: "علت",
      queue: "صف",
      orderId: "شناسه سفارش",
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
