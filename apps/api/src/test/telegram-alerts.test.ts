import { describe, expect, it, vi, beforeEach } from "vitest";
import { TelegramClient } from "../observability/telegram-client.js";
import { AdminAlertService } from "../observability/admin-alert-service.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import type { AuditEvent } from "@avana/domain";

describe("Telegram Operational Alerts Test Suite", () => {
  // =========================================================================
  // 1. TelegramClient Tests (Transport, Errors, Timeouts, Redaction)
  // =========================================================================
  describe("TelegramClient", () => {
    it("returns sent: true on successful 200 OK from Telegram API", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          result: { message_id: 999 },
        }),
      });

      const client = new TelegramClient({
        botToken: "dummy-token-for-test",
        adminChatId: "629710703",
        fetchImpl: mockFetch as unknown as typeof globalThis.fetch,
      });

      expect(client.isConfigured()).toBe(true);
      const res = await client.sendMessage("تست پیام");
      expect(res.sent).toBe(true);
      expect(res.messageId).toBe(999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, req] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.telegram.org/botdummy-token-for-test/sendMessage");
      const body = JSON.parse(String(req.body));
      expect(body.chat_id).toBe("629710703");
      expect(body.text).toBe("تست پیام");
    });

    it("handles HTTP error status safely without throwing", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          description: "Bad Request: chat not found",
        }),
      });

      const client = new TelegramClient({
        botToken: "dummy-token-for-test",
        adminChatId: "629710703",
        fetchImpl: mockFetch as unknown as typeof globalThis.fetch,
      });

      const res = await client.sendMessage("پیام");
      expect(res.sent).toBe(false);
      expect(res.reason).toContain("chat not found");
    });

    it("handles Telegram json { ok: false } response safely", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: false,
          description: "Forbidden: bot was blocked by user",
        }),
      });

      const client = new TelegramClient({
        botToken: "dummy-token-for-test",
        adminChatId: "629710703",
        fetchImpl: mockFetch as unknown as typeof globalThis.fetch,
      });

      const res = await client.sendMessage("پیام");
      expect(res.sent).toBe(false);
      expect(res.reason).toContain("bot was blocked by user");
    });

    it("handles timeout / AbortController abort cleanly", async () => {
      const mockFetch = vi.fn().mockImplementation((_url, init: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        });
      });

      const client = new TelegramClient({
        botToken: "dummy-token-for-test",
        adminChatId: "629710703",
        timeoutMs: 50,
        fetchImpl: mockFetch as unknown as typeof globalThis.fetch,
      });

      const res = await client.sendMessage("پیام تست");
      expect(res.sent).toBe(false);
      expect(res.reason).toContain("timeout_after_50ms");
    });

    it("returns missing_bot_token when token is not configured", async () => {
      const client = new TelegramClient({
        adminChatId: "629710703",
      });

      expect(client.isConfigured()).toBe(false);
      const res = await client.sendMessage("پیام");
      expect(res.sent).toBe(false);
      expect(res.reason).toBe("missing_bot_token");
    });

    it("returns missing_chat_id when chat id is not configured", async () => {
      const client = new TelegramClient({
        botToken: "dummy-token",
      });

      expect(client.isConfigured()).toBe(false);
      const res = await client.sendMessage("پیام");
      expect(res.sent).toBe(false);
      expect(res.reason).toBe("missing_chat_id");
    });

    it("never exposes the bot token in error returns or message output", async () => {
      const token = "SECRET_TOKEN_DO_NOT_LEAK";
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const client = new TelegramClient({
        botToken: token,
        adminChatId: "629710703",
        fetchImpl: mockFetch as unknown as typeof globalThis.fetch,
      });

      const res = await client.sendMessage("پیام");
      expect(res.sent).toBe(false);
      expect(JSON.stringify(res)).not.toContain(token);
    });
  });

  // =========================================================================
  // 2. AdminAlertService Tests (Disabled config, formatting, cooldowns)
  // =========================================================================
  describe("AdminAlertService", () => {
    it("does not send any message when disabled", async () => {
      const sendMock = vi.fn().mockResolvedValue({ sent: true });
      const mockClient = {
        isConfigured: () => true,
        sendMessage: sendMock,
      } as unknown as TelegramClient;

      const service = new AdminAlertService({
        enabled: false,
        telegramClient: mockClient,
      });

      const sent = await service.notifyCritical("cat", "title");
      expect(sent).toBe(false);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("formats message with Persian operational labels and masks phone numbers", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const service = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await service.notifyCritical("test_cat", "خطای تستی", {
        details: {
          jobId: "job-1234",
          phoneNumber: "09121234567",
        },
        error: new Error("خطای اتصال"),
      });

      expect(sentText).toContain("🔴 هشدار عملیاتی آوانا");
      expect(sentText).toContain("عنوان: خطای تستی");
      expect(sentText).toContain("شناسه جاب: job-1234");
      // Phone number must be masked
      expect(sentText).toContain("0912***67");
      expect(sentText).not.toContain("09121234567");
      expect(sentText).toContain("خطا: خطای اتصال");
    });

    it("enforces sliding-window cooldown for identical alerts", async () => {
      const sendMock = vi.fn().mockResolvedValue({ sent: true });
      const mockClient = {
        isConfigured: () => true,
        sendMessage: sendMock,
      } as unknown as TelegramClient;

      const service = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
        cooldownWindowMs: 5_000,
      });

      const first = await service.notifyCritical("error_cat", "خطای مکرر", {
        cooldownKey: "identical-key",
      });
      const second = await service.notifyCritical("error_cat", "خطای مکرر", {
        cooldownKey: "identical-key",
      });

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 3. Failure Isolation Tests (AuditService & Telegram failure)
  // =========================================================================
  describe("Failure Isolation", () => {
    it("AuditService.emit succeeds even if alert listener throws", async () => {
      const store = new InMemoryAuditStore();
      const auditService = new AuditService(store);

      auditService.addListener(() => {
        throw new Error("Telegram crashed completely");
      });

      const event: AuditEvent = {
        actorId: null,
        organizationId: null,
        action: "generation.failed",
        entityType: "document",
        entityId: "doc-123",
        createdAt: new Date().toISOString(),
      };

      await expect(auditService.emit([event])).resolves.not.toThrow();
      const stored = await auditService.listAll();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.action).toBe("generation.failed");
    });

    it("AuditService.emit succeeds even if alert listener rejects asynchronously", async () => {
      const store = new InMemoryAuditStore();
      const auditService = new AuditService(store);

      auditService.addListener(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("Async Telegram connection refused");
      });

      const event: AuditEvent = {
        actorId: null,
        organizationId: null,
        action: "generation.failed",
        entityType: "document",
        entityId: "doc-999",
        createdAt: new Date().toISOString(),
      };

      await expect(auditService.emit([event])).resolves.not.toThrow();
      const stored = await auditService.listAll();
      expect(stored).toHaveLength(1);
    });
  });

  // =========================================================================
  // 4. Fastify Unhandled 500 Integration Test
  // =========================================================================
  describe("API 500 Error Alerting", () => {
    it("notifies AdminAlertService when Fastify catches an unhandled 500", async () => {
      process.env.NODE_ENV = "test";
      process.env.AVANA_API_PORT = "0";
      const config = loadApiConfig();

      const notifyMock = vi.fn().mockResolvedValue(true);
      const mockAlertService = {
        notifyCritical: notifyMock,
      } as unknown as AdminAlertService;

      const app = createApp({
        config,
        adminAlertService: mockAlertService,
      });

      // Register an endpoint that throws an unhandled error
      app.get("/test-crash", async () => {
        throw new Error("Database crashed unexpectedly");
      });

      const res = await app.inject({
        method: "GET",
        url: "/test-crash",
      });

      expect(res.statusCode).toBe(500);
      expect(notifyMock).toHaveBeenCalledWith(
        "api.unhandled_500",
        "خطای ۵۰۰ غیرمنتظره در سرور API",
        expect.objectContaining({
          error: expect.any(Error),
        }),
      );
    });
  });

  // =========================================================================
  // 5. Generation Failure Alerting Integration Tests
  // =========================================================================
  describe("Generation Failure Alerting", () => {
    it("triggers alert on generation.failed audit action and isolates error", async () => {
      const store = new InMemoryAuditStore();
      const auditService = new AuditService(store);

      const notifyMock = vi.fn().mockResolvedValue(true);
      const mockAlertService = {
        notifyCritical: notifyMock,
      } as unknown as AdminAlertService;

      auditService.addListener((events) => {
        for (const event of events) {
          if (event.action === "generation.failed") {
            void mockAlertService.notifyCritical(
              "generation.failed",
              "شکست نهایی فرآیند تولید محتوا",
              {
                details: {
                  documentId: event.entityId,
                  errorCode: String(event.details?.errorCode ?? "unknown"),
                  retryCount: Number(event.details?.retryCount ?? 0),
                },
                cooldownKey: `generation.failed:${event.entityId}:${event.details?.errorCode}`,
              },
            );
          }
        }
      });

      const event: AuditEvent = {
        actorId: null,
        organizationId: null,
        action: "generation.failed",
        entityType: "document",
        entityId: "doc-failed-001",
        createdAt: new Date().toISOString(),
        details: {
          errorCode: "model_overloaded",
          retryCount: 3,
        },
      };

      await auditService.emit([event]);

      expect(notifyMock).toHaveBeenCalledWith(
        "generation.failed",
        "شکست نهایی فرآیند تولید محتوا",
        expect.objectContaining({
          details: {
            documentId: "doc-failed-001",
            errorCode: "model_overloaded",
            retryCount: 3,
          },
          cooldownKey: "generation.failed:doc-failed-001:model_overloaded",
        }),
      );
    });

    it("does not trigger alert for non-failure audit actions (e.g. content.generated)", async () => {
      const store = new InMemoryAuditStore();
      const auditService = new AuditService(store);

      const notifyMock = vi.fn().mockResolvedValue(true);
      const mockAlertService = {
        notifyCritical: notifyMock,
      } as unknown as AdminAlertService;

      auditService.addListener((events) => {
        for (const event of events) {
          if (event.action === "generation.failed") {
            void mockAlertService.notifyCritical("generation.failed", "شکست نهایی فرآیند تولید محتوا");
          }
        }
      });

      const event: AuditEvent = {
        actorId: null,
        organizationId: null,
        action: "content.generated",
        entityType: "document",
        entityId: "doc-success-001",
        createdAt: new Date().toISOString(),
      };

      await auditService.emit([event]);
      expect(notifyMock).not.toHaveBeenCalled();
    });
  });
});
