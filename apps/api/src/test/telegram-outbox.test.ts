import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InMemoryTelegramOutboxStore,
} from "../observability/telegram-outbox-store.js";
import { TelegramOutboxDispatcher } from "../observability/telegram-outbox-dispatcher.js";
import { TelegramClient } from "../observability/telegram-client.js";
import { AdminAlertService } from "../observability/admin-alert-service.js";
import { TelegramOpsBot } from "../observability/telegram-ops-bot.js";
import type { AdminService } from "../modules/admin/admin-service.js";
import type { AdminStore } from "../modules/admin/admin-store.js";

describe("Durable Telegram Outbox Test Suite", () => {
  let store: InMemoryTelegramOutboxStore;
  let mockTelegramClient: TelegramClient;
  let sentCalls: Array<{ text: string; chatId?: string; replyMarkup?: unknown }>;

  beforeEach(() => {
    store = new InMemoryTelegramOutboxStore();
    sentCalls = [];

    mockTelegramClient = {
      isConfigured: vi.fn().mockReturnValue(true),
      getAdminChatId: vi.fn().mockReturnValue("-100999999999"),
      sendMessage: vi.fn().mockImplementation((text: string, chatId?: string, replyMarkup?: unknown) => {
        sentCalls.push({ text, chatId, replyMarkup });
        return Promise.resolve({ sent: true, messageId: 101 });
      }),
      answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
      editMessageText: vi.fn().mockResolvedValue({ ok: true }),
      destroy: vi.fn(),
    } as unknown as TelegramClient;
  });

  afterEach(() => {
    store.clear();
  });

  // 1. درج پیام و جلوگیری از کلید تکراری
  it("1. enqueues message and strictly dedupes on duplicate idempotency_key", async () => {
    const item1 = await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-100",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "پرداخت کارت به کارت ۱۰۰" },
    });

    expect(item1).not.toBeNull();
    expect(item1?.status).toBe("pending");
    expect(item1?.idempotencyKey).toBe("c2c:submitted:pay-100");

    // Second enqueue with identical idempotencyKey
    const item2 = await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-100",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "تلاش مجدد برای همان پرداخت" },
    });

    expect(item2?.id).toBe(item1?.id);
    const all = await store.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.payload.text).toBe("پرداخت کارت به کارت ۱۰۰");
  });

  // 2. ارسال موفق
  it("2. processes and delivers pending message successfully", async () => {
    await store.enqueue({
      idempotencyKey: "payment:completed:pay-200",
      chatId: "-100999999999",
      category: "payment.completed",
      payload: { text: "پرداخت آنلاین ۲۰۰ موفق" },
    });

    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
    });

    const processed = await dispatcher.processNextBatch();
    expect(processed).toBe(1);
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0]?.text).toBe("پرداخت آنلاین ۲۰۰ موفق");

    const record = await store.findByIdempotencyKey("payment:completed:pay-200");
    expect(record?.status).toBe("sent");
    expect(record?.sentAt).not.toBeNull();
    expect(record?.leaseToken).toBeNull();
  });

  // 3. قطع پراکسی و بازگشت اتصال
  it("3. handles proxy failure with retry scheduling and succeeds upon proxy recovery", async () => {
    const item = await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-300",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "پرداخت ۳۰۰" },
    });

    // Simulate SOCKS5 proxy down
    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValueOnce({
      sent: false,
      reason: "network_error: socks5 connect ECONNREFUSED 127.0.0.1:1080",
      isPermanentError: false,
    });

    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
      baseDelayMs: 500,
    });

    await dispatcher.processNextBatch();

    let record = await store.findByIdempotencyKey("c2c:submitted:pay-300");
    expect(record?.status).toBe("retry_scheduled");
    expect(record?.attempts).toBe(1);
    expect(record?.lastError).toContain("ECONNREFUSED");

    // Fast-forward nextAttemptAt in store
    store.updateRecordForTest(item!.id, {
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    // Proxy is now back online
    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValueOnce({
      sent: true,
      messageId: 301,
    });

    await dispatcher.processNextBatch();

    record = await store.findByIdempotencyKey("c2c:submitted:pay-300");
    expect(record?.status).toBe("sent");
    expect(record?.sentAt).toBeDefined();
  });

  // 4. HTTP 429 و retry_after
  it("4. parses HTTP 429 retry_after and delays next attempt accordingly", async () => {
    await store.enqueue({
      idempotencyKey: "payment:completed:pay-400",
      chatId: "-100999999999",
      category: "payment.completed",
      payload: { text: "پرداخت ۴۰۰" },
    });

    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValueOnce({
      sent: false,
      statusCode: 429,
      retryAfterSeconds: 15,
      reason: "telegram_api_error: Too Many Requests: retry after 15",
      isPermanentError: false,
    });

    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
    });

    await dispatcher.processNextBatch();

    const record = await store.findByIdempotencyKey("payment:completed:pay-400");
    expect(record?.status).toBe("retry_scheduled");
    expect(record?.lastError).toContain("telegram_rate_limited");
    // Verify nextAttemptAt is at least 14 seconds in future
    const diffSec = (record!.nextAttemptAt.getTime() - Date.now()) / 1000;
    expect(diffSec).toBeGreaterThanOrEqual(14);
  });

  // 5. خطای شبکه و HTTP 5xx
  it("5. retries transient HTTP 5xx server errors with exponential backoff", async () => {
    await store.enqueue({
      idempotencyKey: "payment:completed:pay-500",
      chatId: "-100999999999",
      category: "payment.completed",
      payload: { text: "پرداخت ۵۰۰" },
    });

    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValueOnce({
      sent: false,
      statusCode: 502,
      reason: "telegram_api_error: HTTP 502 Bad Gateway",
      isPermanentError: false,
    });

    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
      baseDelayMs: 2000,
    });

    await dispatcher.processNextBatch();

    const record = await store.findByIdempotencyKey("payment:completed:pay-500");
    expect(record?.status).toBe("retry_scheduled");
    expect(record?.attempts).toBe(1);
    expect(record?.lastError).toContain("HTTP 502 Bad Gateway");
  });

  // 6. خطای دائمی و dead_letter
  it("6. routes permanent errors (invalid chat ID / bot blocked) to dead_letter immediately", async () => {
    await store.enqueue({
      idempotencyKey: "payment:completed:pay-600",
      chatId: "invalid_chat",
      category: "payment.completed",
      payload: { text: "پرداخت ۶۰۰" },
    });

    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValueOnce({
      sent: false,
      statusCode: 400,
      reason: "telegram_api_error: Bad Request: chat not found",
      isPermanentError: true,
    });

    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
    });

    await dispatcher.processNextBatch();

    const record = await store.findByIdempotencyKey("payment:completed:pay-600");
    expect(record?.status).toBe("dead_letter");
    expect(record?.lastError).toContain("permanent_error");
    expect(record?.lastError).toContain("chat not found");
  });

  // 7. بازیابی پس از Restart
  it("7. recovers pending and retry_scheduled records left from prior API shutdown", async () => {
    await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-700",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "پیام بازمانده از ری‌استارت" },
    });

    const newDispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
    });

    const processed = await newDispatcher.processNextBatch();
    expect(processed).toBe(1);

    const record = await store.findByIdempotencyKey("c2c:submitted:pay-700");
    expect(record?.status).toBe("sent");
  });

  // 8. بازیابی Lease منقضی
  it("8. recovers abandoned sending records with expired leases back into retry_scheduled", async () => {
    const item = await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-800",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "پیام با لیس منقضی" },
    });

    // Simulate worker that claimed and died while processing (lease expired 10 seconds ago)
    await store.claimBatch(1, 30, "dead_worker_token");
    store.updateRecordForTest(item!.id, {
      leaseExpiresAt: new Date(Date.now() - 10_000),
    });

    const recoveredCount = await store.recoverExpiredLeases();
    expect(recoveredCount).toBe(1);

    const afterRecover = await store.findById(item!.id);
    expect(afterRecover?.status).toBe("retry_scheduled");
    expect(afterRecover?.leaseToken).toBeNull();
  });

  // 9. دو Dispatcher همزمان و جلوگیری از Claim همزمان یک رکورد
  it("9. prevents concurrent dispatchers from claiming the same record (SKIP LOCKED isolation)", async () => {
    await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-900",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "پیام رقابتی" },
    });

    const batch1 = await store.claimBatch(10, 30, "token_dispatcher_1");
    expect(batch1).toHaveLength(1);

    const batch2 = await store.claimBatch(10, 30, "token_dispatcher_2");
    expect(batch2).toHaveLength(0);
  });

  // 10. جلوگیری از بازنویسی نتیجه توسط مالک Lease قدیمی
  it("10. rejects result updates from a stale lease owner after lease expiration", async () => {
    const item = await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-1000",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "پیام لیس سرقت شده" },
    });

    // Worker 1 claims
    await store.claimBatch(1, 1, "worker_1_token");

    // Time passes, lease expires, Worker 2 claims
    store.updateRecordForTest(item!.id, {
      leaseExpiresAt: new Date(Date.now() - 1000),
    });
    await store.recoverExpiredLeases();
    await store.claimBatch(1, 30, "worker_2_token");

    // Worker 1 belatedly tries to markSent with old token
    const staleResult = await store.markSent(item!.id, "worker_1_token");
    expect(staleResult).toBe(false);

    // Record remains sending under worker_2_token
    const updated = await store.findById(item!.id);
    expect(updated?.leaseToken).toBe("worker_2_token");

    // Worker 2 correctly completes
    const validResult = await store.markSent(item!.id, "worker_2_token");
    expect(validResult).toBe(true);
    const finalRecord = await store.findById(item!.id);
    expect(finalRecord?.status).toBe("sent");
  });

  // 11. خطای دیتابیس هنگام ثبت نتیجه
  it("11. handles unexpected store errors without crashing the dispatcher loop", async () => {
    const failingStore = {
      claimBatch: vi.fn().mockRejectedValue(new Error("Postgres connection lost")),
      recoverExpiredLeases: vi.fn().mockResolvedValue(0),
      enqueue: vi.fn(),
      markSent: vi.fn(),
      scheduleRetry: vi.fn(),
      markDeadLetter: vi.fn(),
      findById: vi.fn(),
      findByIdempotencyKey: vi.fn(),
      listAll: vi.fn(),
    };

    const logs: string[] = [];
    const dispatcher = new TelegramOutboxDispatcher({
      store: failingStore,
      telegramClient: mockTelegramClient,
      logger: (msg) => logs.push(msg),
    });

    const processed = await dispatcher.processNextBatch();
    expect(processed).toBe(0);
    expect(logs.some((l) => l.includes("Failed to claim batch"))).toBe(true);
  });

  // 12. Shutdown کنترل‌شده
  it("12. stops dispatcher loop gracefully without lingering timers", async () => {
    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
      pollIntervalMs: 1000,
    });

    dispatcher.start();
    expect(dispatcher.isActive()).toBe(true);

    await dispatcher.stop();
    expect(dispatcher.isActive()).toBe(false);
  });

  // 13. جلوگیری از Drop اعلان مالی در Cooldown
  it("13. ensures distinct financial payments are never dropped by cooldown", async () => {
    const alertService = new AdminAlertService({
      enabled: true,
      telegramClient: mockTelegramClient,
      outboxStore: store,
    });

    // Alert for Payment 1
    const res1 = await alertService.notifyPaymentReceived({
      paymentId: "pay-c2c-uuid-1",
      amount: 500_000,
      isC2C: true,
      productTitle: "طرح طلایی",
    });

    // Alert for Payment 2 (different ID, sent 10ms later)
    const res2 = await alertService.notifyPaymentReceived({
      paymentId: "pay-c2c-uuid-2",
      amount: 750_000,
      isC2C: true,
      productTitle: "طرح نقره‌ای",
    });

    expect(res1).toBe(true);
    expect(res2).toBe(true);

    const records = await store.listAll();
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.idempotencyKey)).toContain("c2c:submitted:pay-c2c-uuid-1");
    expect(records.map((r) => r.idempotencyKey)).toContain("c2c:submitted:pay-c2c-uuid-2");
  });

  // 14. عدم اجرای مجدد عملیات مالی هنگام Retry اعلان
  it("14. verifies TelegramOpsBot callback rejects duplicate execution if already settled", async () => {
    const paymentUuid = "550e8400-e29b-41d4-a716-446655440000";
    const mockAdminStore = {
      getCommercePayment: vi.fn().mockResolvedValue({
        id: paymentUuid,
        status: "approved", // already approved
        gateway: "card_to_card",
        amount: 500_000,
      }),
    };

    const mockAdminService = {
      approvePayment: vi.fn(),
      rejectPayment: vi.fn(),
    } as unknown as AdminService;

    const opsBot = new TelegramOpsBot({
      enabled: true,
      botToken: "test_token",
      adminChatId: "-100999999999",
      telegramClient: mockTelegramClient,
      adminService: mockAdminService,
      adminStore: mockAdminStore as unknown as AdminStore,
    });

    // Simulate clicking approve on a duplicate/retried message
    await opsBot.handleCallbackQuery({
      id: "cb-query-999",
      data: `pay:app:${paymentUuid}`,
      from: { id: 123456 },
      message: { chat: { id: -100999999999 }, message_id: 888 },
    });

    // Critical financial safety check: approvePayment must NOT be called again
    expect(mockAdminService.approvePayment).not.toHaveBeenCalled();
    // Telegram answers immediately and informs operator message is already settled
    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith({
      callbackQueryId: "cb-query-999",
    });
    expect(mockTelegramClient.editMessageText).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 888,
        text: expect.stringContaining("این پرداخت قبلاً تعیین تکلیف شده است"),
      }),
    );
  });

  // 15. باقی ماندن اعلان‌های حل‌نشده پس از رسیدن به سقف تلاش‌ها برای دسته‌های عمومی
  it("15. moves permanently unresolved messages to dead_letter after maxAttempts without deleting row", async () => {
    const item = await store.enqueue({
      idempotencyKey: "info:general:notice-1",
      chatId: "-100999999999",
      category: "general.notification",
      payload: { text: "پیام بیش از حد مجاز تلاش عمومی" },
      maxAttempts: 3,
    });

    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValue({
      sent: false,
      reason: "network_error: Gateway unreachable",
      isPermanentError: false,
    });

    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
      maxAttempts: 3,
      baseDelayMs: 10,
    });

    // Attempt 1
    await dispatcher.processNextBatch();
    let r = await store.findByIdempotencyKey("info:general:notice-1");
    expect(r?.status).toBe("retry_scheduled");
    expect(r?.attempts).toBe(1);

    // Fast-forward in store
    store.updateRecordForTest(item!.id, {
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    // Attempt 2
    await dispatcher.processNextBatch();
    r = await store.findByIdempotencyKey("info:general:notice-1");
    expect(r?.status).toBe("retry_scheduled");
    expect(r?.attempts).toBe(2);

    // Fast-forward in store
    store.updateRecordForTest(item!.id, {
      nextAttemptAt: new Date(Date.now() - 1000),
    });

    // Attempt 3 (Reaches maxAttempts)
    await dispatcher.processNextBatch();
    r = await store.findByIdempotencyKey("info:general:notice-1");
    expect(r?.status).toBe("dead_letter");
    expect(r?.attempts).toBe(3);
    expect(r?.lastError).toContain("max_attempts_exceeded");

    // Row is strictly preserved in database, NEVER deleted
    const all = await store.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("dead_letter");
  });

  // 16. حفظ رفتار تعاملی TelegramOpsBot
  it("16. ensures interactive TelegramOpsBot commands & callbacks bypass Outbox directly", async () => {
    const paymentUuid = "660e8400-e29b-41d4-a716-446655440000";
    const mockAdminStore = {
      getCommercePayment: vi.fn().mockResolvedValue({
        id: paymentUuid,
        status: "pending_admin_review",
        gateway: "card_to_card",
        amount: 250_000,
      }),
    };

    const mockAdminService = {
      approvePayment: vi.fn().mockResolvedValue(undefined),
    } as unknown as AdminService;

    const opsBot = new TelegramOpsBot({
      enabled: true,
      botToken: "test_token",
      adminChatId: "-100999999999",
      telegramClient: mockTelegramClient,
      adminService: mockAdminService,
      adminStore: mockAdminStore as unknown as AdminStore,
    });

    // 1. Inbound command (/status)
    await opsBot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        text: "/status",
        chat: { id: -100999999999 },
        from: { id: 123456 },
      },
    });

    expect(mockTelegramClient.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining("AVANA Status"),
      "-100999999999",
    );

    // 2. Button click response (answerCallbackQuery & editMessageText)
    await opsBot.handleCallbackQuery({
      id: "cb-direct-1",
      data: `pay:app:${paymentUuid}`,
      from: { id: 123456 },
      message: { chat: { id: -100999999999 }, message_id: 777 },
    });

    expect(mockTelegramClient.answerCallbackQuery).toHaveBeenCalledWith({
      callbackQueryId: "cb-direct-1",
    });
    expect(mockTelegramClient.editMessageText).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 777,
        text: expect.stringContaining("پرداخت تأیید شد"),
      }),
    );

    // Outbox should be completely empty since interactive actions are synchronous direct calls
    const outboxRecords = await store.listAll();
    expect(outboxRecords).toHaveLength(0);
  });

  // 17. استمرار تلاش در خطای گذرا برای اعلان‌های مالی و حیاتی (عدم توقف خاموش در قطعی SOCKS5)
  it("17. persists retry for critical/financial categories across prolonged transient outages", async () => {
    const item = await store.enqueue({
      idempotencyKey: "c2c:submitted:pay-critical-resilience",
      chatId: "-100999999999",
      category: "payment.c2c_submitted",
      payload: { text: "پرداخت کارت به کارت حساس مالی" },
      maxAttempts: 3,
    });

    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValue({
      sent: false,
      reason: "network_error: SOCKS5 proxy connection refused",
      isPermanentError: false,
    });

    const dispatcher = new TelegramOutboxDispatcher({
      store,
      telegramClient: mockTelegramClient,
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 60_000,
    });

    // Run 3 attempts
    for (let i = 0; i < 3; i++) {
      store.updateRecordForTest(item!.id, {
        nextAttemptAt: new Date(Date.now() - 1000),
      });
      await dispatcher.processNextBatch();
    }

    // Attempt 3: for non-critical it would be dead_letter; for critical it MUST remain retry_scheduled
    let r = await store.findByIdempotencyKey("c2c:submitted:pay-critical-resilience");
    expect(r?.status).toBe("retry_scheduled");
    expect(r?.attempts).toBe(3);
    expect(r?.lastError).toContain("persistent_retry");

    // Attempt 4: continue persistent background retries
    store.updateRecordForTest(item!.id, {
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    await dispatcher.processNextBatch();

    r = await store.findByIdempotencyKey("c2c:submitted:pay-critical-resilience");
    expect(r?.status).toBe("retry_scheduled");
    expect(r?.attempts).toBe(4);

    // Now SOCKS5 comes back online: message sends successfully!
    vi.mocked(mockTelegramClient.sendMessage).mockResolvedValueOnce({
      sent: true,
      messageId: 888,
    });

    store.updateRecordForTest(item!.id, {
      nextAttemptAt: new Date(Date.now() - 1000),
    });
    await dispatcher.processNextBatch();

    r = await store.findByIdempotencyKey("c2c:submitted:pay-critical-resilience");
    expect(r?.status).toBe("sent");
    expect(r?.sentAt).not.toBeNull();
  });

  // 18. مسیر عملیاتی بازیابی ایمن Dead Letter
  it("18. selectively requeues dead_letter record to pending while preserving idempotency and audit trail", async () => {
    const item = await store.enqueue({
      idempotencyKey: "alert:ops:dead-letter-test",
      chatId: "-100999999999",
      category: "general.notification",
      payload: { text: "پیام خطای دائمی تستی" },
    });

    // Artificially put in dead_letter
    const lease = "lease_dl_1";
    await store.claimBatch(10, 30, lease);
    await store.markDeadLetter(item!.id, lease, "permanent_error: invalid_chat");

    let record = await store.findById(item!.id);
    expect(record?.status).toBe("dead_letter");
    expect(record?.lastError).toBe("permanent_error: invalid_chat");

    // Requeue
    const requeued = await store.requeueDeadLetter(item!.id, { resetAttempts: true });
    expect(requeued).toBe(true);

    record = await store.findById(item!.id);
    expect(record?.status).toBe("pending");
    expect(record?.attempts).toBe(0);
    expect(record?.lastError).toContain("[requeued]");
    expect(record?.idempotencyKey).toBe("alert:ops:dead-letter-test");

    // Requeue on non-dead_letter returns false
    const secondRequeue = await store.requeueDeadLetter(item!.id);
    expect(secondRequeue).toBe(false);
  });
});
