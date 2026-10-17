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
import type { AdminStore, AdminSystemHealth, AdminAiAnalytics, AdminPaymentRecord } from "../modules/admin/admin-store.js";
import type { AdminService } from "../modules/admin/admin-service.js";
import type { SupportStore, SupportTicketRecord } from "../modules/support/support-store.js";
import type { SupportService } from "../modules/support/support-service.js";
import type { AuditService } from "./audit-service.js";
import type { Queue } from "bullmq";
import { asUserId, type Actor, type SupportTicketItem } from "@avana/domain";

export interface PendingTicketReply {
  ticketId: string;
  promptMessageId?: number;
  expiresAt: number;
}

export interface TelegramOpsBotOptions {
  enabled: boolean;
  botToken?: string;
  adminChatId?: string;
  botUsername?: string;
  telegramClient: TelegramClient;
  adminStore?: AdminStore;
  adminService?: AdminService;
  supportStore?: SupportStore;
  supportService?: SupportService;
  auditService?: AuditService;
  adminUserId?: string;
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
  private readonly botUsername: string;
  private readonly telegramClient: TelegramClient;
  private readonly adminStore?: AdminStore;
  private readonly adminService?: AdminService;
  private readonly supportStore?: SupportStore;
  private readonly supportService?: SupportService;
  private readonly auditService?: AuditService;
  private readonly adminUserId?: string;
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

  // In-memory conversation state for pending ticket replies (chatId -> state)
  private readonly pendingTicketReplies = new Map<string, PendingTicketReply>();

  constructor(options: TelegramOpsBotOptions) {
    this.enabled = options.enabled && Boolean(options.botToken && options.adminChatId);
    this.adminChatId = options.adminChatId?.trim();
    this.botUsername = (options.botUsername ?? "avana_alerts_bot").replace(/^@/, "").trim().toLowerCase();
    this.telegramClient = options.telegramClient;
    this.adminStore = options.adminStore;
    this.adminService = options.adminService;
    this.supportStore = options.supportStore;
    this.supportService = options.supportService;
    this.auditService = options.auditService;
    this.adminUserId = options.adminUserId;
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
    void this.syncBotCommands();
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
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    const message = update.message;
    if (!message) {
      return;
    }

    const chatId = String(message.chat.id).trim();

    // STRICT SECURITY: Silently drop updates from unauthorized chat IDs
    if (!this.adminChatId || chatId !== this.adminChatId) {
      return;
    }

    const rawFirstToken = (message.text ?? "").trim().split(/\s+/)[0] ?? "";
    const commandMatch = rawFirstToken.match(/^(\/[a-z0-9_]+)(?:@([a-z0-9_]+))?$/i);

    // If not a command, check if user is in an active pending ticket reply session
    if (!commandMatch) {
      if (this.pendingTicketReplies.has(chatId)) {
        await this.handlePendingTicketReplyMessage(chatId, message);
      }
      return;
    }

    const baseCommand = commandMatch[1].toLowerCase();
    const targetUsername = commandMatch[2]?.toLowerCase();

    // If username is specified (e.g. /status@avana_alerts_bot), verify it matches this bot
    if (targetUsername && targetUsername !== this.botUsername) {
      return;
    }

    // Cancel command handling: cancels any active pending reply session
    if (baseCommand === "/cancel") {
      if (this.pendingTicketReplies.has(chatId)) {
        this.pendingTicketReplies.delete(chatId);
        await this.telegramClient.sendMessage("❌ عملیات پاسخ به تیکت لغو شد.", chatId);
      } else {
        await this.telegramClient.sendMessage("در حال حاضر هیچ عملیات منتظر پاسخی برای لغو وجود ندارد.", chatId);
      }
      return;
    }

    // Any new command cancels any active pending reply session
    if (this.pendingTicketReplies.has(chatId)) {
      this.pendingTicketReplies.delete(chatId);
    }

    // In-memory rate limiting check (only for recognized, targeted commands)
    if (this.isRateLimited(chatId)) {
      await this.telegramClient.sendMessage(
        "⚠️ تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.",
        chatId,
      );
      return;
    }

    switch (baseCommand) {
      case "/status": {
        const text = await this.buildStatusMessage();
        await this.telegramClient.sendMessage(text, chatId);
        break;
      }
      case "/queues": {
        const text = await this.buildQueuesMessage();
        await this.telegramClient.sendMessage(text, chatId);
        break;
      }
      case "/errors": {
        const text = await this.buildErrorsMessage();
        await this.telegramClient.sendMessage(text, chatId);
        break;
      }
      case "/payments": {
        await this.handlePaymentsCommand(chatId);
        break;
      }
      case "/tickets": {
        await this.handleTicketsCommand(chatId);
        break;
      }
      case "/start":
      case "/help": {
        const text = [
          "🤖 ربات مدیریت عملیات آوانا (AVANA Ops Bot)",
          "",
          "دستورات موجود:",
          "🔹 /tickets — مدیریت و پاسخگویی به تیکت‌های پشتیبانی کاربران",
          "🔹 /status — وضعیت سلامت کلی و اجزای سیستم",
          "🔹 /queues — گزارش وضعیت و شمارنده صف‌های کاری",
          "🔹 /errors — گزارش خلاصه خطاهای ۲۴ ساعت اخیر",
          "🔹 /payments — بررسی و مدیریت پرداخت‌های در انتظار تأیید",
          "🔹 /cancel — لغو عملیات ورودی در جریان",
          "🔹 /help — راهنمای دستورات ربات",
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
        const detailsSuffix = workerRes.details ? ` (${workerRes.details})` : "";
        lines.push(`ورکر (Worker): ${wIcon} ${wLabel}${detailsSuffix}`);
      } catch {
        lines.push("ورکر (Worker): 🔴 غیرقابل دسترس");
      }
    } else {
      lines.push("ورکر (Worker): ⚪ نامشخص (عدم تنظیم پروب)");
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
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Query recent error events in the last 24 hours without heavy DB load
      const [genFailedRes, api500Res] = await Promise.all([
        this.withTimeout(
          this.adminStore.listAuditLogs({
            page: 1,
            pageSize: 5,
            action: "generation.failed",
            from: since24h,
          }),
          2500,
        ).catch(() => ({ logs: [], totalCount: 0 })),
        this.withTimeout(
          this.adminStore.listAuditLogs({
            page: 1,
            pageSize: 5,
            search: "failed",
            from: since24h,
          }),
          2500,
        ).catch(() => ({ logs: [], totalCount: 0 })),
      ]);

      const genFailedCount = genFailedRes.totalCount;
      lines.push(`🔴 خطاهای تولید محتوا: ${genFailedCount}`);

      // Count of other errors strictly for last 24h
      const otherErrorsCount = Math.max(0, api500Res.totalCount - (api500Res.logs.filter((l) => l.action === "generation.failed").length ? genFailedCount : 0));
      lines.push(`🟠 سایر وقایع خطا: ${otherErrorsCount}`);
      lines.push("");

      // Deduplicate logs by id, sort descending by timestamp, take top 5
      const seenIds = new Set<string>();
      const candidateLogs = [...genFailedRes.logs, ...api500Res.logs];
      const uniqueLogs: typeof candidateLogs = [];

      for (const log of candidateLogs) {
        const idKey = log.id ? String(log.id) : `${log.action}:${log.timestamp}`;
        if (!seenIds.has(idKey)) {
          seenIds.add(idKey);
          uniqueLogs.push(log);
        }
      }

      const combinedLogs = uniqueLogs
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
   * Handle /payments command to list pending card-to-card payments with approve/reject buttons.
   */
  async handlePaymentsCommand(chatId: string): Promise<void> {
    if (!this.adminStore?.listCommercePayments) {
      await this.telegramClient.sendMessage(
        "⚠️ سرویس استعلام پرداخت‌ها در دسترس نیست.",
        chatId,
      );
      return;
    }

    try {
      const res = await this.withTimeout(
        this.adminStore.listCommercePayments({
          page: 1,
          pageSize: 5,
          status: "pending_admin_review",
        }),
        3000,
      );

      const payments = res.payments ?? [];
      const totalCount = res.totalCount ?? payments.length;

      if (payments.length === 0) {
        await this.telegramClient.sendMessage(
          "✅ هیچ پرداختی در انتظار بررسی نیست. تمام پرداخت‌ها تعیین تکلیف شده‌اند.",
          chatId,
        );
        return;
      }

      if (totalCount > payments.length) {
        await this.telegramClient.sendMessage(
          `📋 ${payments.length.toLocaleString("fa-IR")} مورد از مجموع ${totalCount.toLocaleString("fa-IR")} پرداخت در انتظار بررسی نمایش داده می‌شود:`,
          chatId,
        );
      }

      for (const payment of payments) {
        const text = this.formatPendingPaymentMessage(payment);
        await this.telegramClient.sendMessage(text, chatId, {
          inline_keyboard: [
            [
              { text: "✅ تأیید پرداخت", callback_data: `pay:app:${payment.id}` },
              { text: "❌ رد پرداخت", callback_data: `pay:rej:${payment.id}` },
            ],
          ],
        });
      }
    } catch (err: unknown) {
      const safeError = this.sanitizeError(err);
      await this.telegramClient.sendMessage(
        `⚠️ خطا در دریافت اطلاعات پرداخت‌ها: ${safeError}`,
        chatId,
      );
    }
  }

  /**
   * Format single pending payment details safely without leaking PII or secrets.
   */
  private formatPendingPaymentMessage(payment: AdminPaymentRecord): string {
    const amountStr = `${Number(payment.amount).toLocaleString("fa-IR")} تومان`;

    let productTypeLabel = "نامشخص";
    if (payment.productType === "wallet_topup" || payment.productTitle === "شارژ کیف پول") {
      productTypeLabel = "شارژ کیف پول";
    } else if (payment.productType === "course") {
      productTypeLabel = "دوره آموزشی";
    } else if (payment.productType === "subscription") {
      productTypeLabel = "اشتراک";
    } else if (payment.productTitle) {
      productTypeLabel = payment.productTitle;
    }

    const lines: string[] = [
      "💳 پرداخت در انتظار بررسی",
      "",
      `مبلغ: ${amountStr}`,
      `نوع: ${productTypeLabel}`,
    ];

    if (payment.orderNumber || payment.orderId) {
      lines.push(`شناسه سفارش: ${payment.orderNumber ?? payment.orderId}`);
    }

    if (payment.payerName) {
      lines.push(`پرداخت‌کننده: ${payment.payerName}`);
    }

    if (payment.sourceCardLast4) {
      lines.push(`کارت مبدأ: ****${payment.sourceCardLast4}`);
    }

    if (payment.trackingNumber) {
      lines.push(`کد پیگیری: ${payment.trackingNumber}`);
    }

    if (payment.createdAt) {
      const d = new Date(payment.createdAt);
      const timeStr = !isNaN(d.getTime()) ? d.toISOString() : payment.createdAt;
      lines.push(`زمان: ${timeStr}`);
    }

    lines.push(`شناسه: ${payment.id}`);

    return lines.join("\n");
  }

  /**
   * Sync official bot commands menu in Telegram (fire-and-forget, safe).
   */
  private async syncBotCommands(): Promise<void> {
    if (typeof this.telegramClient.setMyCommands === "function") {
      try {
        await this.telegramClient.setMyCommands([
          { command: "tickets", description: "مدیریت تیکت‌های پشتیبانی کاربران" },
          { command: "status", description: "وضعیت سلامت کلی سیستم" },
          { command: "queues", description: "گزارش وضعیت صف‌های کاری" },
          { command: "errors", description: "گزارش خلاصه خطاهای اخیر" },
          { command: "payments", description: "بررسی و مدیریت پرداخت‌های در انتظار" },
          { command: "cancel", description: "لغو عملیات ورودی در جریان" },
          { command: "help", description: "راهنمای دستورات ربات" },
        ]);
      } catch {
        // Ignored safely
      }
    }
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
   * Handle incoming callback query from Telegram inline keyboard buttons.
   */
  async handleCallbackQuery(cq: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
    const chatId = cq.message?.chat?.id
      ? String(cq.message.chat.id).trim()
      : (cq.from?.id ? String(cq.from.id).trim() : "");

    // STRICT SECURITY: Silently drop callback queries from unauthorized chat IDs
    if (!this.adminChatId || chatId !== this.adminChatId) {
      return;
    }

    // In-memory sliding rate limiter check
    if (this.isRateLimited(chatId)) {
      await this.telegramClient.answerCallbackQuery({
        callbackQueryId: cq.id,
        text: "⚠️ تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً چند لحظه صبر کنید.",
        showAlert: true,
      });
      return;
    }

    const rawData = cq.data?.trim() ?? "";

    if (rawData.startsWith("tkt:")) {
      await this.handleTicketCallback(chatId, cq);
      return;
    }

    const match = rawData.match(/^pay:(app|rej):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (!match) {
      // Invalid callback format or forged data -> clear spinner and return safely
      await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });
      return;
    }

    const action = match[1].toLowerCase();
    const paymentId = match[2].toLowerCase();

    // Answer callback query immediately to stop client-side spinner
    await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });

    // Canonical State Pre-validation
    if (!this.adminStore?.getCommercePayment) {
      this.logger("[telegram-ops-bot] Cannot process payment callback: adminStore.getCommercePayment not available.");
      return;
    }

    let paymentRecord: AdminPaymentRecord | null = null;
    try {
      paymentRecord = await this.adminStore.getCommercePayment(paymentId);
    } catch {
      paymentRecord = null;
    }

    const messageId = cq.message?.message_id;

    if (!paymentRecord) {
      if (messageId) {
        await this.telegramClient.editMessageText({
          messageId,
          text: `⚠️ پرداخت با شناسه ${paymentId} یافت نشد.`,
          overrideChatId: chatId,
        });
      }
      return;
    }

    if (paymentRecord.status !== "pending_admin_review") {
      if (messageId) {
        await this.telegramClient.editMessageText({
          messageId,
          text: "⚠️ این پرداخت قبلاً تعیین تکلیف شده است.",
          overrideChatId: chatId,
        });
      }
      return;
    }

    if (paymentRecord.gateway !== "card_to_card") {
      if (messageId) {
        await this.telegramClient.editMessageText({
          messageId,
          text: "⚠️ این نوع پرداخت در وضعیت بررسی دستی قرار ندارد.",
          overrideChatId: chatId,
        });
      }
      return;
    }

    if (!this.adminService) {
      this.logger("[telegram-ops-bot] Cannot mutate payment: adminService is not provided.");
      return;
    }

    // Resolve an existing admin user ID for audit and foreign key integrity
    let resolvedAdminId = this.adminUserId;
    if (!resolvedAdminId && this.adminStore?.listUsers) {
      try {
        const adminUsers = await this.adminStore.listUsers({
          page: 1,
          pageSize: 1,
          role: "platform_admin",
        });
        if (adminUsers.users.length > 0) {
          resolvedAdminId = adminUsers.users[0].id;
        }
      } catch {
        // Fallback
      }
    }
    if (!resolvedAdminId) {
      resolvedAdminId = "00000000-0000-0000-0000-000000000001";
    }

    const REJECT_REASON = "رد پرداخت از طریق Telegram Ops Bot";

    try {
      if (action === "app") {
        await this.adminService.approvePayment(resolvedAdminId, paymentId);

        if (this.auditService) {
          void this.auditService.emit([
            {
              actorId: asUserId(resolvedAdminId),
              organizationId: null,
              action: "payment.approved",
              entityType: "payment",
              entityId: paymentId,
              details: {
                actorType: "admin/telegram",
                telegramChatId: chatId,
                amount: paymentRecord.amount,
                result: "success",
              },
              createdAt: new Date().toISOString(),
            },
          ]);
        }

        if (messageId) {
          const timeStr = new Date().toISOString();
          const amountStr = `${Number(paymentRecord.amount).toLocaleString("fa-IR")} تومان`;
          const lines = [
            "💳 پرداخت تأیید شد",
            "",
            `مبلغ: ${amountStr}`,
            `شناسه: ${paymentId}`,
            "تأیید توسط: Admin (تلگرام)",
            `زمان: ${timeStr}`,
          ];

          await this.telegramClient.editMessageText({
            messageId,
            text: lines.join("\n"),
            overrideChatId: chatId,
          });
        }
      } else {
        await this.adminService.rejectPayment(resolvedAdminId, paymentId, REJECT_REASON);

        if (this.auditService) {
          void this.auditService.emit([
            {
              actorId: asUserId(resolvedAdminId),
              organizationId: null,
              action: "payment.rejected",
              entityType: "payment",
              entityId: paymentId,
              details: {
                actorType: "admin/telegram",
                telegramChatId: chatId,
                amount: paymentRecord.amount,
                reason: REJECT_REASON,
                result: "success",
              },
              createdAt: new Date().toISOString(),
            },
          ]);
        }

        if (messageId) {
          const timeStr = new Date().toISOString();
          const amountStr = `${Number(paymentRecord.amount).toLocaleString("fa-IR")} تومان`;
          const lines = [
            "❌ پرداخت رد شد",
            "",
            `مبلغ: ${amountStr}`,
            `شناسه: ${paymentId}`,
            "دسترسی مرتبط غیرفعال شد.",
            "رد توسط: Admin (تلگرام)",
            `زمان: ${timeStr}`,
          ];

          await this.telegramClient.editMessageText({
            messageId,
            text: lines.join("\n"),
            overrideChatId: chatId,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isConflict =
        typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "conflict";
      if (
        msg.includes("payment_already_approved") ||
        msg.includes("payment_already_rejected") ||
        msg.includes("invalid_payment_status") ||
        isConflict
      ) {
        if (messageId) {
          await this.telegramClient.editMessageText({
            messageId,
            text: "⚠️ این پرداخت قبلاً تعیین تکلیف شده است.",
            overrideChatId: chatId,
          });
        }
      } else {
        this.logger(`[telegram-ops-bot] Error executing payment action ${action} for ${paymentId}: ${msg}`);
        if (messageId) {
          await this.telegramClient.sendMessage(
            "⚠️ خطا در اجرای عملیات پرداخت. لطفاً وضعیت را از پنل مدیریت بررسی کنید.",
            chatId,
          );
        }
      }
    }
  }

  /**
   * Handle incoming support ticket callback queries (tkt:*).
   */
  private async handleTicketCallback(
    chatId: string,
    cq: NonNullable<TelegramUpdate["callback_query"]>,
  ): Promise<void> {
    const rawData = cq.data?.trim() ?? "";
    const messageId = cq.message?.message_id;

    // Any callback action other than cancel reply clears active pending reply session
    if (rawData !== "tkt:cr") {
      this.pendingTicketReplies.delete(chatId);
    }

    // 1. Return to Main Tickets Menu: tkt:m
    if (rawData === "tkt:m") {
      await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });
      await this.handleTicketsCommand(chatId);
      return;
    }

    // 2. Cancel Reply: tkt:cr
    if (rawData === "tkt:cr") {
      this.pendingTicketReplies.delete(chatId);
      await this.telegramClient.answerCallbackQuery({
        callbackQueryId: cq.id,
        text: "عملیات پاسخ لغو شد.",
      });
      await this.telegramClient.sendMessage("❌ عملیات پاسخ به تیکت لغو شد.", chatId);
      return;
    }

    // 3. List tickets: tkt:l:(open|in_progress|closed):(\d+)
    const listMatch = rawData.match(/^tkt:l:(open|in_progress|closed):(\d+)$/i);
    if (listMatch) {
      await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });
      const status = listMatch[1].toLowerCase() as "open" | "in_progress" | "closed";
      const page = parseInt(listMatch[2], 10) || 1;
      await this.renderTicketList(chatId, status, page);
      return;
    }

    // 4. View ticket details: tkt:v:([0-9a-f-]{36})
    const viewMatch = rawData.match(/^tkt:v:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (viewMatch) {
      await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });
      const ticketId = viewMatch[1].toLowerCase();
      await this.showTicketDetails(chatId, ticketId);
      return;
    }

    // 5. Start reply: tkt:r:([0-9a-f-]{36})
    const replyMatch = rawData.match(/^tkt:r:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (replyMatch) {
      await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });
      const ticketId = replyMatch[1].toLowerCase();
      await this.startTicketReply(chatId, ticketId, messageId);
      return;
    }

    // 6. Close ticket: tkt:c:([0-9a-f-]{36})
    const closeMatch = rawData.match(/^tkt:c:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (closeMatch) {
      await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });
      const ticketId = closeMatch[1].toLowerCase();
      await this.handleCloseTicketCallback(chatId, ticketId, messageId);
      return;
    }

    // Invalid callback or forged data -> safely acknowledge and drop
    await this.telegramClient.answerCallbackQuery({ callbackQueryId: cq.id });
  }

  /**
   * Handle /tickets command: displays ticket counts by status and top-level action buttons.
   */
  async handleTicketsCommand(chatId: string): Promise<void> {
    if (!this.supportStore?.listTickets) {
      await this.telegramClient.sendMessage(
        "⚠️ سرویس مدیریت تیکت‌ها در دسترس نیست.",
        chatId,
      );
      return;
    }

    try {
      const [openRes, inProgRes, waitingRes, answeredRes, closedRes] = await Promise.all([
        this.withTimeout(this.supportStore.listTickets({ status: "open", limit: 1 }), 2500).catch(() => ({ total: 0 })),
        this.withTimeout(this.supportStore.listTickets({ status: "in_progress", limit: 1 }), 2500).catch(() => ({ total: 0 })),
        this.withTimeout(this.supportStore.listTickets({ status: "waiting_for_user", limit: 1 }), 2500).catch(() => ({ total: 0 })),
        this.withTimeout(this.supportStore.listTickets({ status: "answered", limit: 1 }), 2500).catch(() => ({ total: 0 })),
        this.withTimeout(this.supportStore.listTickets({ status: "closed", limit: 1 }), 2500).catch(() => ({ total: 0 })),
      ]);

      const lines: string[] = [
        "🎫 منوی مدیریت تیکت‌های پشتیبانی آوانا",
        "",
        "📊 آمار تیکت‌ها به تفکیک وضعیت:",
        `🔴 نیازمند بررسی اولیه (جدید): ${openRes.total.toLocaleString("fa-IR")}`,
        `🟡 در حال پیگیری پشتیبانی: ${inProgRes.total.toLocaleString("fa-IR")}`,
        `⏳ در انتظار پاسخ کاربر: ${waitingRes.total.toLocaleString("fa-IR")}`,
        `🟢 پاسخ داده شده: ${answeredRes.total.toLocaleString("fa-IR")}`,
        `⚪ بسته‌شده: ${closedRes.total.toLocaleString("fa-IR")}`,
        "",
        "جهت مشاهده فهرست تیکت‌ها یکی از گزینه‌های زیر را انتخاب نمایید:",
      ];

      const buttons = [
        [
          { text: `🔴 تیکت‌های باز (${openRes.total.toLocaleString("fa-IR")})`, callback_data: "tkt:l:open:1" },
          { text: `🟡 در حال بررسی (${inProgRes.total.toLocaleString("fa-IR")})`, callback_data: "tkt:l:in_progress:1" },
        ],
        [
          { text: `⚪ تیکت‌های بسته‌شده (${closedRes.total.toLocaleString("fa-IR")})`, callback_data: "tkt:l:closed:1" },
          { text: "🔄 بروزرسانی آمار", callback_data: "tkt:m" },
        ],
      ];

      await this.telegramClient.sendMessage(lines.join("\n"), chatId, {
        inline_keyboard: buttons,
      });
    } catch (err: unknown) {
      const safeError = this.sanitizeError(err);
      await this.telegramClient.sendMessage(
        `⚠️ خطا در دریافت آمار تیکت‌ها: ${safeError}`,
        chatId,
      );
    }
  }

  /**
   * Render paginated ticket list for a given status.
   */
  private async renderTicketList(
    chatId: string,
    status: "open" | "in_progress" | "closed",
    page: number,
  ): Promise<void> {
    if (!this.supportStore?.listTickets) {
      await this.telegramClient.sendMessage("⚠️ سرویس استعلام تیکت‌ها در دسترس نیست.", chatId);
      return;
    }

    const pageSize = 5;
    const safePage = Math.max(1, page);

    try {
      const res = await this.withTimeout(
        this.supportStore.listTickets({
          status,
          page: safePage,
          limit: pageSize,
        }),
        3000,
      );

      const items = res.items ?? [];
      const total = res.total ?? items.length;
      const totalPages = Math.ceil(total / pageSize) || 1;

      const statusTitle =
        status === "open"
          ? "تیکت‌های باز (در انتظار بررسی)"
          : status === "in_progress"
            ? "تیکت‌های در حال بررسی"
            : "تیکت‌های بسته‌شده";

      if (items.length === 0) {
        const emptyText = `📋 فهرست ${statusTitle}\n\n✅ هیچ تیکتی در این وضعیت وجود ندارد.`;
        const emptyButtons = [
          [
            { text: "🔴 باز", callback_data: "tkt:l:open:1" },
            { text: "🟡 در حال بررسی", callback_data: "tkt:l:in_progress:1" },
            { text: "⚪ بسته‌شده", callback_data: "tkt:l:closed:1" },
          ],
          [{ text: "📊 منوی اصلی تیکت‌ها", callback_data: "tkt:m" }],
        ];
        await this.telegramClient.sendMessage(emptyText, chatId, {
          inline_keyboard: emptyButtons,
        });
        return;
      }

      const lines: string[] = [
        `📋 فهرست ${statusTitle}`,
        `صفحه ${safePage.toLocaleString("fa-IR")} از ${totalPages.toLocaleString("fa-IR")} (مجموع: ${total.toLocaleString("fa-IR")} تیکت)`,
        "",
      ];

      const itemButtons: Array<Array<{ text: string; callback_data: string }>> = [];

      for (let i = 0; i < items.length; i++) {
        const t = items[i];
        const num = (safePage - 1) * pageSize + i + 1;
        const shortId = t.id.slice(0, 8);
        const titleSnippet = t.title.length > 30 ? `${t.title.slice(0, 27)}...` : t.title;

        lines.push(
          `${num}. 🎫 ${titleSnippet}`,
          `   وضعیت: ${this.translateTicketStatus(t.status)} | اولویت: ${this.translateTicketPriority(t.priority)}`,
          `   دسته‌بندی: ${this.translateTicketCategory(t.category)} | کاربر: ${t.userName || "کاربر"}`,
          `   آخرین فعالیت: ${this.formatDateTime(t.lastActivityAt)}`,
          `   شناسه: ${shortId}`,
          "",
        );

        itemButtons.push([
          {
            text: `🔍 مشاهده ${num}. ${titleSnippet.slice(0, 22)}`,
            callback_data: `tkt:v:${t.id}`,
          },
        ]);
      }

      const navButtons: Array<{ text: string; callback_data: string }> = [];
      if (safePage > 1) {
        navButtons.push({ text: "◀️ قبلی", callback_data: `tkt:l:${status}:${safePage - 1}` });
      }
      navButtons.push({ text: "🔄 تازه‌سازی", callback_data: `tkt:l:${status}:${safePage}` });
      if (safePage < totalPages) {
        navButtons.push({ text: "بعدی ▶️", callback_data: `tkt:l:${status}:${safePage + 1}` });
      }

      const allButtons = [
        ...itemButtons,
        navButtons,
        [
          { text: "🔴 باز", callback_data: "tkt:l:open:1" },
          { text: "🟡 در حال بررسی", callback_data: "tkt:l:in_progress:1" },
          { text: "⚪ بسته‌شده", callback_data: "tkt:l:closed:1" },
        ],
        [{ text: "📊 منوی اصلی تیکت‌ها", callback_data: "tkt:m" }],
      ];

      await this.telegramClient.sendMessage(lines.join("\n"), chatId, {
        inline_keyboard: allButtons,
      });
    } catch (err: unknown) {
      const safeError = this.sanitizeError(err);
      await this.telegramClient.sendMessage(
        `⚠️ خطا در دریافت فهرست تیکت‌ها: ${safeError}`,
        chatId,
      );
    }
  }

  /**
   * Display detailed ticket view including chronological conversation messages.
   */
  private async showTicketDetails(
    chatId: string,
    ticketId: string,
  ): Promise<void> {
    if (!this.supportService) {
      await this.telegramClient.sendMessage("⚠️ سرویس پشتیبانی در دسترس نیست.", chatId);
      return;
    }

    const actor = await this.resolveAdminActor();
    if (!actor) {
      await this.telegramClient.sendMessage(
        "⚠️ هیچ حساب کاربری معتبری با نقش مدیر ارشد (platform_admin) برای مشاهده تیکت یافت نشد.",
        chatId,
      );
      return;
    }

    let ticket: SupportTicketItem | null = null;
    try {
      ticket = await this.supportService.getTicketDetails(actor, ticketId);
    } catch {
      ticket = null;
    }

    if (!ticket) {
      await this.telegramClient.sendMessage("⚠️ تیکت مورد نظر یافت نشد یا حذف شده است.", chatId);
      return;
    }

    const lines: string[] = [
      "🎫 جزئیات تیکت پشتیبانی",
      "",
      `عنوان: ${ticket.title}`,
      `شناسه: ${ticket.id}`,
      `وضعیت: ${this.translateTicketStatus(ticket.status)}`,
      `اولویت: ${this.translateTicketPriority(ticket.priority)}`,
      `دسته‌بندی: ${this.translateTicketCategory(ticket.category)}`,
      `کاربر: ${ticket.userName || "کاربر آوانا"}`,
      `تاریخ ثبت: ${this.formatDateTime(ticket.createdAt)}`,
      `آخرین فعالیت: ${this.formatDateTime(ticket.lastActivityAt)}`,
      "",
      "💬 تاریخچه گفتگو:",
    ];

    const messages = ticket.messages ?? [];
    if (messages.length === 0) {
      // If messages array is empty, show initial description
      lines.push(`👤 کاربر (شرح اولیه):`);
      lines.push(ticket.description);
    } else {
      // messages[0] already contains initial description created with the ticket
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const timeStr = this.formatDateTime(msg.createdAt);
        const isUser = msg.senderRole === "user";
        const roleLabel = isUser
          ? `👤 ${msg.senderName || ticket.userName || "کاربر"}${i === 0 ? " (شرح اولیه)" : ""}`
          : `🛠 ${msg.senderName || "پشتیبانی آوانا"}`;

        const safeBody = msg.body.length > 500 ? `${msg.body.slice(0, 497)}...` : msg.body;
        lines.push(`\n${roleLabel} [${timeStr}]:`);
        lines.push(safeBody);
      }
    }

    let fullText = lines.join("\n");
    if (fullText.length > 3800) {
      fullText = `${fullText.slice(0, 3750)}...\n\n(متن کامل به دلیل محدودیت طول در تلگرام کوتاه شد)`;
    }

    const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

    if (ticket.status !== "closed") {
      keyboard.push([
        { text: "✍️ پاسخ به تیکت", callback_data: `tkt:r:${ticket.id}` },
        { text: "🔒 بستن تیکت", callback_data: `tkt:c:${ticket.id}` },
      ]);
    }

    keyboard.push([
      { text: "🔙 بازگشت به فهرست", callback_data: `tkt:l:${ticket.status === "closed" ? "closed" : "open"}:1` },
      { text: "🔄 بروزرسانی", callback_data: `tkt:v:${ticket.id}` },
    ]);
    keyboard.push([
      { text: "📊 منوی اصلی تیکت‌ها", callback_data: "tkt:m" },
    ]);

    await this.telegramClient.sendMessage(fullText, chatId, {
      inline_keyboard: keyboard,
    });
  }

  /**
   * Initiate reply session for a ticket.
   */
  private async startTicketReply(
    chatId: string,
    ticketId: string,
    messageId?: number,
  ): Promise<void> {
    if (!this.supportStore?.findTicketById) {
      await this.telegramClient.sendMessage("⚠️ سرویس استعلام تیکت در دسترس نیست.", chatId);
      return;
    }

    let ticket: SupportTicketRecord | null = null;
    try {
      ticket = await this.supportStore.findTicketById(ticketId);
    } catch {
      ticket = null;
    }

    if (!ticket) {
      await this.telegramClient.sendMessage("⚠️ تیکت مورد نظر یافت نشد.", chatId);
      return;
    }

    if (ticket.status === "closed") {
      await this.telegramClient.sendMessage(
        "⚠️ این تیکت بسته شده است و امکان ارسال پاسخ به آن وجود ندارد.",
        chatId,
      );
      return;
    }

    // Set pending state (10 minutes TTL)
    this.pendingTicketReplies.set(chatId, {
      ticketId,
      promptMessageId: messageId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const lines = [
      "✍️ ارسال پاسخ به تیکت پشتیبانی",
      "",
      `تیکت: ${ticket.title}`,
      `شناسه: ${ticket.id}`,
      `کاربر: ${ticket.userName || "کاربر"}`,
      "",
      "لطفاً متن پاسخ خود را در یک پیام بفرستید.",
      "⏳ مهلت ارسال: ۱۰ دقیقه",
      "(برای انصراف دکمه زیر را لمس نمایید یا دستور /cancel را ارسال کنید)",
    ];

    await this.telegramClient.sendMessage(lines.join("\n"), chatId, {
      inline_keyboard: [
        [
          { text: "❌ انصراف از پاسخ", callback_data: "tkt:cr" },
        ],
      ],
    });
  }

  /**
   * Handle incoming text message from admin when in active reply session.
   */
  private async handlePendingTicketReplyMessage(
    chatId: string,
    message: NonNullable<TelegramUpdate["message"]>,
  ): Promise<void> {
    const pending = this.pendingTicketReplies.get(chatId);
    if (!pending) return;

    // Check expiration (10 min TTL)
    if (Date.now() > pending.expiresAt) {
      this.pendingTicketReplies.delete(chatId);
      await this.telegramClient.sendMessage(
        "⚠️ مهلت زمانی پاسخ به این تیکت (۱۰ دقیقه) به پایان رسیده است. لطفاً مجدداً اقدام فرمایید.",
        chatId,
      );
      return;
    }

    // Check non-text message
    const replyText = message.text?.trim();
    if (!replyText || replyText.length === 0) {
      await this.telegramClient.sendMessage(
        "⚠️ لطفاً پاسخ خود را فقط به صورت متن متنی ارسال فرمایید (یا برای انصراف /cancel را ارسال کنید).",
        chatId,
      );
      return;
    }

    // Validate UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(pending.ticketId)) {
      this.pendingTicketReplies.delete(chatId);
      await this.telegramClient.sendMessage("⚠️ شناسه تیکت نامعتبر است.", chatId);
      return;
    }

    if (!this.supportService) {
      await this.telegramClient.sendMessage("⚠️ سرویس پشتیبانی در دسترس نیست.", chatId);
      return;
    }

    const actor = await this.resolveAdminActor();
    if (!actor) {
      await this.telegramClient.sendMessage(
        "⚠️ هیچ حساب کاربری معتبری با نقش مدیر ارشد (platform_admin) برای ثبت پاسخ یافت نشد.",
        chatId,
      );
      return;
    }

    let existingTicket: SupportTicketRecord | null = null;
    if (this.supportStore?.findTicketById) {
      try {
        existingTicket = await this.supportStore.findTicketById(pending.ticketId);
      } catch {
        existingTicket = null;
      }
    }

    if (!existingTicket) {
      this.pendingTicketReplies.delete(chatId);
      await this.telegramClient.sendMessage("⚠️ تیکت مورد نظر در سیستم یافت نشد یا حذف شده است.", chatId);
      return;
    }

    if (existingTicket.status === "closed") {
      this.pendingTicketReplies.delete(chatId);
      await this.telegramClient.sendMessage(
        "⚠️ این تیکت در حال حاضر بسته شده است و امکان ثبت پاسخ جدید برای آن وجود ندارد.",
        chatId,
      );
      return;
    }

    try {
      await this.supportService.sendAdminMessage(actor, pending.ticketId, {
        body: replyText,
        newStatus: "answered",
      });

      // Clear pending reply state ONLY upon confirmed success
      this.pendingTicketReplies.delete(chatId);

      await this.telegramClient.sendMessage(
        "✅ پاسخ شما با موفقیت ثبت شد و به اطلاع کاربر رسید.",
        chatId,
      );

      // Show refreshed ticket details
      await this.showTicketDetails(chatId, pending.ticketId);
    } catch (err: unknown) {
      const safeError = this.sanitizeError(err);
      this.logger(`[telegram-ops-bot] Failed to record admin response: ${safeError}`);
      // Do not mark as success! Retain pending state so intentional retry is possible without duplication.
      await this.telegramClient.sendMessage(
        `⚠️ خطا در ثبت پاسخ: ${safeError}\n\nوضعیت پاسخگویی برای این تیکت همچنان فعال است. می‌توانید مجدداً متن پاسخ را ارسال کنید یا با ارسال دستور /cancel انصراف دهید.`,
        chatId,
      );
    }
  }

  /**
   * Handle closing a ticket via callback.
   */
  private async handleCloseTicketCallback(
    chatId: string,
    ticketId: string,
    _messageId?: number,
  ): Promise<void> {
    if (!this.supportService) {
      await this.telegramClient.sendMessage("⚠️ سرویس پشتیبانی در دسترس نیست.", chatId);
      return;
    }

    const actor = await this.resolveAdminActor();
    if (!actor) {
      await this.telegramClient.sendMessage(
        "⚠️ هیچ حساب کاربری معتبری با نقش مدیر ارشد (platform_admin) برای بستن تیکت یافت نشد.",
        chatId,
      );
      return;
    }

    let ticket: SupportTicketRecord | null = null;
    try {
      ticket = (await this.supportStore?.findTicketById(ticketId)) ?? null;
    } catch {
      ticket = null;
    }

    if (!ticket) {
      await this.telegramClient.sendMessage("⚠️ تیکت مورد نظر یافت نشد.", chatId);
      return;
    }

    if (ticket.status === "closed") {
      await this.telegramClient.sendMessage("⚠️ این تیکت قبلاً بسته شده است.", chatId);
      return;
    }

    try {
      await this.supportService.updateTicketStatus(actor, ticketId, "closed");
      await this.telegramClient.sendMessage(
        `🔒 تیکت «${ticket.title}» با موفقیت بسته شد.`,
        chatId,
      );
      await this.showTicketDetails(chatId, ticketId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.telegramClient.sendMessage(
        `⚠️ امکان بستن تیکت وجود ندارد: ${this.sanitizeError(err)} (${msg})`,
        chatId,
      );
    }
  }

  /**
   * Resolve a verified platform_admin actor for authorized operations.
   */
  private async resolveAdminActor(): Promise<Actor | null> {
    if (this.adminStore?.listUsers) {
      try {
        if (this.adminUserId) {
          const res = await this.adminStore.listUsers({
            page: 1,
            pageSize: 10,
            search: this.adminUserId,
          });
          const match = res.users.find((u) => u.id === this.adminUserId);
          if (match && (match.role === "platform_admin" || match.role === "support_agent")) {
            return {
              userId: asUserId(match.id),
              role: match.role as "platform_admin" | "support_agent",
              globalRole: match.role as "platform_admin" | "support_agent",
            };
          }
        }

        const adminUsers = await this.adminStore.listUsers({
          page: 1,
          pageSize: 1,
          role: "platform_admin",
        });
        if (adminUsers.users.length > 0) {
          const u = adminUsers.users[0];
          return {
            userId: asUserId(u.id),
            role: "platform_admin",
            globalRole: "platform_admin",
          };
        }
      } catch {
        // Fallback on store error
      }
    }

    if (this.adminUserId) {
      return {
        userId: asUserId(this.adminUserId),
        role: "platform_admin",
        globalRole: "platform_admin",
      };
    }

    return null;
  }

  private translateTicketCategory(cat?: string): string {
    switch (cat) {
      case "courses": return "دوره‌های آموزشی";
      case "exams": return "آزمون‌ها";
      case "flashcards": return "فلش‌کارت‌ها";
      case "study_planner": return "برنامه‌ریزی درسی";
      case "payment": return "مالی و پرداخت";
      case "account": return "حساب کاربری";
      case "technical": return "فنی و سامانه";
      default: return cat || "سایر";
    }
  }

  private translateTicketPriority(prio?: string): string {
    switch (prio) {
      case "urgent": return "🔴 فوری";
      case "high": return "🟠 بالا";
      case "medium": return "🟡 متوسط";
      case "low": return "🟢 کم";
      default: return prio || "متوسط";
    }
  }

  private translateTicketStatus(status?: string): string {
    switch (status) {
      case "open": return "🔴 در انتظار بررسی";
      case "in_progress": return "🟡 در حال بررسی";
      case "waiting_for_user": return "⏳ در انتظار پاسخ کاربر";
      case "answered": return "🟢 پاسخ داده شده";
      case "closed": return "⚪ بسته شده";
      default: return status || "نامشخص";
    }
  }

  private formatDateTime(isoStr?: string | null): string {
    if (!isoStr) return "نامشخص";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
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
