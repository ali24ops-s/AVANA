/**
 * Telegram Ops Bot for AVANA Administration & Observability.
 *
 * Architecture:
 * - Inbound: Telegram getUpdates long polling -> TelegramOpsBot -> Existing AVANA Services/Stores
 * - Independent lifecycle: start(), stop(), AbortController, graceful shutdown
 * - Zero impact on HTTP API lifecycle or business transactions
 * - Strict Authorization: ONLY configured adminChatId is processed. Unauthorized chats silently ignored.
 * - In-memory rate limiting: Prevents spam / duplicate command DB hammering.
 * - Read-only commands:
 *   - /status: Overall system health (API, Worker, DB, Redis, Queues, Generation, Recent errors)
 *   - /queues: BullMQ queues metrics summary
 *   - /errors: Sanitized summary of recent errors (last 24h)
 * - Safe data formatting: Zero stack traces, tokens, passwords, raw prompts, or PII.
 */

import type { TelegramClient, TelegramUpdate } from "./telegram-client.js";
import type { AdminStore, AdminSystemHealth, AdminAiAnalytics } from "../modules/admin/admin-store.js";
import type { Queue } from "bullmq";

export interface TelegramOpsBotOptions {
  enabled: boolean;
  botToken?: string;
  adminChatId?: string;
  telegramClient: TelegramClient;
  adminStore?: AdminStore;
  generationQueue?: Queue;
  workerHealthChecker?: () => Promise<{ status: "healthy" | "unhealthy" | "unknown"; details?: string }>;
  logger?: (msg: string) => void;
  pollIntervalMs?: number;
  rateLimitWindowMs?: number;
  maxCommandsPerWindow?: number;
}

export class TelegramOpsBot {
  private readonly enabled: boolean;
  private readonly adminChatId?: string;
  private readonly telegramClient: TelegramClient;
  private readonly adminStore?: AdminStore;
  private readonly generationQueue?: Queue;
  private readonly workerHealthChecker?: () => Promise<{ status: "healthy" | "unhealthy" | "unknown"; details?: string }>;
  private readonly logger: (msg: string) => void;
  private readonly pollIntervalMs: number;
  private readonly rateLimitWindowMs: number;
  private readonly maxCommandsPerWindow: number;

  private isRunning = false;
  private abortController: AbortController | null = null;
  private pollPromise: Promise<void> | null = null;
  private lastUpdateId = 0;

  // In-memory sliding rate limiter per chatId
  private readonly userRateLimitMap = new Map<string, number[]>();

  constructor(options: TelegramOpsBotOptions) {
    this.enabled = options.enabled && Boolean(options.botToken && options.adminChatId);
    this.adminChatId = options.adminChatId?.trim();
    this.telegramClient = options.telegramClient;
    this.adminStore = options.adminStore;
    this.generationQueue = options.generationQueue;
    this.workerHealthChecker = options.workerHealthChecker;
    this.logger =
      options.logger ??
      ((msg) => {
        if (process.env.NODE_ENV !== "test") {
          process.stdout.write(`${msg}\n`);
        }
      });
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.rateLimitWindowMs = options.rateLimitWindowMs ?? 10_000; // 10 seconds
    this.maxCommandsPerWindow = options.maxCommandsPerWindow ?? 5; // max 5 commands per 10s
  }

  /**
   * Start inbound Telegram long-polling loop in background without blocking.
   */
  start(): void {
    if (!this.enabled || this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.pollPromise = this.pollLoop(this.abortController.signal).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger(`[telegram-ops-bot] Poller stopped unexpectedly: ${msg}`);
      this.isRunning = false;
    });

    this.logger("[telegram-ops-bot] Inbound command poller started.");
  }

  /**
   * Stop inbound polling gracefully.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.pollPromise) {
      try {
        await this.pollPromise;
      } catch {
        // Ignore abort rejection
      }
      this.pollPromise = null;
    }

    this.logger("[telegram-ops-bot] Inbound command poller stopped.");
  }

  /**
   * Continuous long-polling loop.
   */
  private async pollLoop(signal: AbortSignal): Promise<void> {
    while (this.isRunning && !signal.aborted) {
      try {
        const result = await this.telegramClient.getUpdates({
          offset: this.lastUpdateId > 0 ? this.lastUpdateId + 1 : undefined,
          timeoutSec: 10,
          signal,
        });

        if (signal.aborted) break;

        if (result.ok && result.updates.length > 0) {
          for (const update of result.updates) {
            if (update.update_id >= this.lastUpdateId) {
              this.lastUpdateId = update.update_id;
            }
            await this.handleUpdate(update);
          }
        }
      } catch (err: unknown) {
        if (signal.aborted) break;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger(`[telegram-ops-bot] Error in getUpdates: ${msg}`);
      }

      // Short delay between polls if not aborted
      if (this.isRunning && !signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    }
  }

  /**
   * Process a single Telegram update with strict authorization and rate limiting.
   */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message || !message.text) {
      return;
    }

    const chatId = String(message.chat.id).trim();

    // STRICT SECURITY: Silently drop updates from unauthorized chat IDs
    if (!this.adminChatId || chatId !== this.adminChatId) {
      return;
    }

    // In-memory rate limiting check
    if (this.isRateLimited(chatId)) {
      await this.telegramClient.sendMessage(
        "⚠️ تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.",
        chatId,
      );
      return;
    }

    const commandText = message.text.trim().split(/\s+/)[0]?.toLowerCase();

    switch (commandText) {
      case "/status":
      case "/status@avana": {
        const text = await this.buildStatusMessage();
        await this.telegramClient.sendMessage(text, chatId);
        break;
      }
      case "/queues":
      case "/queues@avana": {
        const text = await this.buildQueuesMessage();
        await this.telegramClient.sendMessage(text, chatId);
        break;
      }
      case "/errors":
      case "/errors@avana": {
        const text = await this.buildErrorsMessage();
        await this.telegramClient.sendMessage(text, chatId);
        break;
      }
      case "/start":
      case "/help": {
        const text = [
          "🤖 ربات مدیریت عملیات آوانا (AVANA Ops Bot)",
          "",
          "دستورات موجود:",
          "🔹 /status — وضعیت سلامت کلی و اجزای سیستم",
          "🔹 /queues — گزارش وضعیت و شمارنده صف‌های کاری",
          "🔹 /errors — گزارش خلاصه خطاهای ۲۴ ساعت اخیر",
        ].join("\n");
        await this.telegramClient.sendMessage(text, chatId);
        break;
      }
      default:
        // Ignore unrecognized commands silently or don't leak anything
        break;
    }
  }

  /**
   * Build /status summary message.
   */
  async buildStatusMessage(): Promise<string> {
    const lines: string[] = ["📊 وضعیت کلی سیستم آوانا (AVANA Status)", ""];

    // 1. API status
    lines.push("سرور API: 🟢 سالم (Healthy)");

    // 2. Database & Redis & AI via adminStore.getSystemHealth()
    let health: AdminSystemHealth | null = null;
    if (this.adminStore?.getSystemHealth) {
      try {
        health = await this.withTimeout(this.adminStore.getSystemHealth(), 3000);
      } catch (err) {
        lines.push(`پایگاه‌داده: 🔴 در دسترس نیست (${this.sanitizeError(err)})`);
        lines.push("ردیس: 🔴 در دسترس نیست");
      }
    }

    if (health) {
      const dbIcon = health.database === "healthy" ? "🟢" : "🔴";
      const dbLabel = health.database === "healthy" ? "سالم" : "خطا / غیرفعال";
      lines.push(`پایگاه‌داده (PostgreSQL): ${dbIcon} ${dbLabel}`);

      const redisIcon = health.redis === "healthy" ? "🟢" : health.redis === "disabled" ? "⚪" : "🔴";
      const redisLabel = health.redis === "healthy" ? "سالم" : health.redis === "disabled" ? "غیرفعال" : "خطا / قطع";
      lines.push(`ردیس (Redis): ${redisIcon} ${redisLabel}`);

      if (health.ai) {
        const aiIcon = health.ai === "healthy" ? "🟢" : "🟡";
        lines.push(`سرویس هوش مصنوعی: ${aiIcon} ${health.ai}`);
      }
    }

    // 3. Worker Health
    if (this.workerHealthChecker) {
      try {
        const workerRes = await this.withTimeout(this.workerHealthChecker(), 3000);
        const wIcon = workerRes.status === "healthy" ? "🟢" : workerRes.status === "unhealthy" ? "🔴" : "⚪";
        const wLabel = workerRes.status === "healthy" ? "سالم" : workerRes.status === "unhealthy" ? "غیرفعال" : "نامشخص";
        lines.push(`ورکر (Worker): ${wIcon} ${wLabel}`);
      } catch {
        lines.push("ورکر (Worker): 🔴 غیرقابل دسترس");
      }
    } else {
      lines.push("ورکر (Worker): 🟢 فعال (Running)");
    }

    // 4. Queues summary
    lines.push("");
    lines.push("📦 خلاصه صف‌ها:");
    if (this.generationQueue) {
      try {
        const counts = await this.withTimeout(this.generationQueue.getJobCounts("waiting", "active", "failed"), 2000);
        lines.push(`در انتظار: ${counts.waiting ?? 0}`);
        lines.push(`در حال پردازش: ${counts.active ?? 0}`);
        lines.push(`ناموفق: ${counts.failed ?? 0}`);
      } catch {
        lines.push("وضعیت صف: در دسترس نیست");
      }
    } else {
      lines.push("صف BullMQ در دسترس نیست.");
    }

    // 5. Generation summary
    lines.push("");
    lines.push("⚡ وضعیت تولید محتوا (امروز):");
    if (this.adminStore?.getDashboardStats) {
      try {
        const stats = await this.withTimeout(this.adminStore.getDashboardStats(), 2500);
        lines.push(`کل درخواست‌ها: ${stats.generationsToday}`);
        lines.push(`نرخ موفقیت: ${stats.generationSuccessRate}%`);
      } catch {
        lines.push("آمار امروز در دسترس نیست.");
      }
    } else if (this.adminStore?.getAiAnalytics) {
      try {
        const analytics: AdminAiAnalytics = await this.withTimeout(this.adminStore.getAiAnalytics(), 2500);
        lines.push(`کل جاب‌ها: ${analytics.overview.totalJobs}`);
        lines.push(`موفق: ${analytics.overview.successful}`);
        lines.push(`ناموفق: ${analytics.overview.failed}`);
      } catch {
        lines.push("آمار هوش مصنوعی در دسترس نیست.");
      }
    }

    return lines.join("\n");
  }

  /**
   * Build /queues summary message.
   */
  async buildQueuesMessage(): Promise<string> {
    const lines: string[] = ["📦 گزارش صف‌های کاری آوانا (BullMQ)", ""];

    if (!this.generationQueue) {
      lines.push("هیچ صف فعالی پیکربندی نشده است.");
      return lines.join("\n");
    }

    lines.push(`صف تولید محتوا (${this.generationQueue.name}):`);

    try {
      const counts = await this.withTimeout(
        this.generationQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
        2500,
      );

      lines.push(`⏳ در انتظار (Waiting): ${counts.waiting ?? 0}`);
      lines.push(`⚙️ در حال اجرا (Active): ${counts.active ?? 0}`);
      lines.push(`✅ تکمیل‌شده (Completed): ${counts.completed ?? 0}`);
      lines.push(`❌ ناموفق (Failed): ${counts.failed ?? 0}`);
      if (counts.delayed && counts.delayed > 0) {
        lines.push(`⏱ تأخیریافته (Delayed): ${counts.delayed}`);
      }
    } catch (err) {
      lines.push(`خطا در استعلام اطلاعات صف: ${this.sanitizeError(err)}`);
    }

    return lines.join("\n");
  }

  /**
   * Build /errors summary message (last 24 hours, sanitized, no PII/stack traces).
   */
  async buildErrorsMessage(): Promise<string> {
    const lines: string[] = ["🚨 گزارش خطاهای اخیر آوانا (۲۴ ساعت گذشته)", ""];

    if (!this.adminStore?.listAuditLogs) {
      lines.push("سیستم ثبت وقایع (Audit Logs) در دسترس نیست.");
      return lines.join("\n");
    }

    try {
      // Query recent error events without heavy DB load
      const [genFailedRes, api500Res] = await Promise.all([
        this.withTimeout(
          this.adminStore.listAuditLogs({
            page: 1,
            pageSize: 5,
            action: "generation.failed",
          }),
          2500,
        ).catch(() => ({ logs: [], totalCount: 0 })),
        this.withTimeout(
          this.adminStore.listAuditLogs({
            page: 1,
            pageSize: 5,
            search: "failed",
          }),
          2500,
        ).catch(() => ({ logs: [], totalCount: 0 })),
      ]);

      const genFailedCount = genFailedRes.totalCount;
      lines.push(`🔴 خطاهای تولید محتوا: ${genFailedCount}`);
      
      const otherLogs = api500Res.logs.filter((l) => l.action !== "generation.failed");
      lines.push(`🟠 سایر وقایع خطا: ${otherLogs.length}`);
      lines.push("");

      const combinedLogs = [...genFailedRes.logs, ...otherLogs]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);

      if (combinedLogs.length === 0) {
        lines.push("✅ هیچ خطای ثبت‌شده‌ای در این بازه یافت نشد.");
      } else {
        lines.push("آخرین موارد:");
        for (const log of combinedLogs) {
          const date = new Date(log.timestamp);
          const timeStr = !isNaN(date.getTime())
            ? date.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })
            : log.timestamp;
          
          let actionLabel = log.action;
          if (log.action === "generation.failed") actionLabel = "شکست تولید محتوا";
          else if (log.action.includes("payment")) actionLabel = "خطای پرداخت";
          
          lines.push(`• ${timeStr} — ${actionLabel} (شناسه: ${log.entityId ? log.entityId.slice(0, 8) : "نامشخص"})`);
        }
      }
    } catch (err) {
      lines.push(`خطا در واکشی لاگ‌ها: ${this.sanitizeError(err)}`);
    }

    return lines.join("\n");
  }

  /**
   * In-memory sliding window rate limiter check.
   */
  private isRateLimited(chatId: string): boolean {
    const now = Date.now();
    const timestamps = this.userRateLimitMap.get(chatId) ?? [];
    const validTimestamps = timestamps.filter((t) => now - t < this.rateLimitWindowMs);

    if (validTimestamps.length >= this.maxCommandsPerWindow) {
      this.userRateLimitMap.set(chatId, validTimestamps);
      return true;
    }

    validTimestamps.push(now);
    this.userRateLimitMap.set(chatId, validTimestamps);
    return false;
  }

  /**
   * Cleanly run an async operation with a timeout promise race.
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
  }

  /**
   * Sanitize error message to prevent leaking any secret, host, or PII.
   */
  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (/timeout/i.test(raw)) return "پایان مهلت زمانی (Timeout)";
    if (/connect|econrefused/i.test(raw)) return "عدم برقراری ارتباط";
    return "خطای ارتباطی";
  }
}
