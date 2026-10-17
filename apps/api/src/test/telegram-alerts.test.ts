import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type https from "node:https";
import { TelegramClient, type TelegramInlineKeyboardMarkup } from "../observability/telegram-client.js";
import { AdminAlertService } from "../observability/admin-alert-service.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { randomUUID } from "node:crypto";
import { type Actor, asUserId } from "@avana/domain";
import type { AuditEvent } from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { InMemorySupportStore } from "../modules/support/in-memory-stores.js";
import { SupportService } from "../modules/support/support-service.js";

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

  describe("TelegramClient - SOCKS5 Proxy Support", () => {
    interface MockTransportOptions {
      method?: string;
      headers?: Record<string, string>;
      agent?: unknown;
      signal?: AbortSignal;
    }

    interface MockReq extends EventEmitter {
      write: (chunk: string | Buffer) => boolean;
      end: () => void;
    }

    interface MockRes extends EventEmitter {
      statusCode?: number;
      statusMessage?: string;
      headers?: Record<string, string>;
    }

    it("reports proxy status correctly via isProxyConfigured", () => {
      const clientWithoutProxy = new TelegramClient({
        botToken: "dummy-token",
        adminChatId: "123456",
      });
      expect(clientWithoutProxy.isProxyConfigured()).toBe(false);

      const clientWithProxy = new TelegramClient({
        botToken: "dummy-token",
        adminChatId: "123456",
        socksProxyUrl: "socks5://127.0.0.1:1080",
      });
      expect(clientWithProxy.isProxyConfigured()).toBe(true);
      clientWithProxy.destroy();
    });

    it("executes sendMessage through SOCKS proxy transport with POST body and headers", async () => {
      let capturedUrl: URL | null = null;
      let capturedOptions: MockTransportOptions | null = null;
      let capturedBody = "";

      const customTransport = {
        request: ((url: URL, options: MockTransportOptions, callback?: (res: MockRes) => void) => {
          capturedUrl = url;
          capturedOptions = options;
          const req = new EventEmitter() as MockReq;
          req.write = vi.fn().mockImplementation((chunk: string) => {
            capturedBody += chunk;
            return true;
          });
          req.end = vi.fn().mockImplementation(() => {
            const res = new EventEmitter() as MockRes;
            res.statusCode = 200;
            res.statusMessage = "OK";
            res.headers = { "content-type": "application/json" };
            if (callback) callback(res);
            queueMicrotask(() => {
              res.emit(
                "data",
                Buffer.from(JSON.stringify({ ok: true, result: { message_id: 101 } })),
              );
              res.emit("end");
            });
          });
          return req;
        }) as unknown as typeof https.request,
      };

      const client = new TelegramClient({
        botToken: "token123",
        adminChatId: "admin_chat",
        socksProxyUrl: "socks5://127.0.0.1:1080",
        customTransport,
      });

      const res = await client.sendMessage("پیام تست از پراکسی");
      expect(res.sent).toBe(true);
      expect(res.messageId).toBe(101);
      expect(capturedUrl?.pathname).toBe("/bottoken123/sendMessage");
      expect(capturedOptions?.method).toBe("POST");
      expect(capturedOptions?.agent).toBeDefined();
      expect(capturedOptions?.headers?.["Content-Type"]).toBe("application/json");

      const parsedBody = JSON.parse(capturedBody) as { chat_id: string; text: string };
      expect(parsedBody.chat_id).toBe("admin_chat");
      expect(parsedBody.text).toBe("پیام تست از پراکسی");
      client.destroy();
    });

    it("executes editMessageText, answerCallbackQuery, and getUpdates through proxy transport", async () => {
      const endpointsCalled: string[] = [];

      const customTransport = {
        request: ((url: URL, _options: MockTransportOptions, callback?: (res: MockRes) => void) => {
          endpointsCalled.push(url.pathname);
          const req = new EventEmitter() as MockReq;
          req.write = vi.fn();
          req.end = vi.fn().mockImplementation(() => {
            const res = new EventEmitter() as MockRes;
            res.statusCode = 200;
            res.statusMessage = "OK";
            res.headers = { "content-type": "application/json" };
            if (callback) callback(res);
            queueMicrotask(() => {
              if (url.pathname.includes("getUpdates")) {
                res.emit(
                  "data",
                  Buffer.from(
                    JSON.stringify({
                      ok: true,
                      result: [{ update_id: 1, message: { text: "/status" } }],
                    }),
                  ),
                );
              } else {
                res.emit(
                  "data",
                  Buffer.from(JSON.stringify({ ok: true, result: true })),
                );
              }
              res.emit("end");
            });
          });
          return req;
        }) as unknown as typeof https.request,
      };

      const client = new TelegramClient({
        botToken: "token123",
        adminChatId: "admin_chat",
        socksProxyUrl: "socks5://127.0.0.1:1080",
        customTransport,
      });

      const editRes = await client.editMessageText({
        messageId: 50,
        text: "ویرایش پیام",
      });
      expect(editRes.ok).toBe(true);
      expect(endpointsCalled).toContain("/bottoken123/editMessageText");

      const ansRes = await client.answerCallbackQuery({
        callbackQueryId: "cb_99",
      });
      expect(ansRes.ok).toBe(true);
      expect(endpointsCalled).toContain("/bottoken123/answerCallbackQuery");

      const updatesRes = await client.getUpdates();
      expect(updatesRes.ok).toBe(true);
      expect(updatesRes.updates).toHaveLength(1);
      expect(endpointsCalled).toContain("/bottoken123/getUpdates");
      client.destroy();
    });

    it("handles connection error in proxy transport safely without throwing", async () => {
      const customTransport = {
        request: ((_url: URL, _options: MockTransportOptions) => {
          const req = new EventEmitter() as MockReq;
          req.write = vi.fn();
          req.end = vi.fn().mockImplementation(() => {
            queueMicrotask(() => {
              req.emit("error", new Error("connect ECONNREFUSED 127.0.0.1:1080"));
            });
          });
          return req;
        }) as unknown as typeof https.request,
      };

      const client = new TelegramClient({
        botToken: "token123",
        adminChatId: "admin_chat",
        socksProxyUrl: "socks5://127.0.0.1:1080",
        customTransport,
      });

      const res = await client.sendMessage("تست خطای شبکه");
      expect(res.sent).toBe(false);
      expect(res.reason).toContain("network_error");
      expect(res.reason).toContain("ECONNREFUSED");
      client.destroy();
    });

    it("handles timeout correctly when proxy transport hangs", async () => {
      const customTransport = {
        request: ((_url: URL, options: MockTransportOptions) => {
          const req = new EventEmitter() as MockReq;
          req.write = vi.fn();
          req.end = vi.fn(); // Never responds
          if (options.signal) {
            options.signal.addEventListener(
              "abort",
              () => {
                req.emit("error", new Error("The operation was aborted"));
              },
              { once: true },
            );
          }
          return req;
        }) as unknown as typeof https.request,
      };

      const client = new TelegramClient({
        botToken: "token123",
        adminChatId: "admin_chat",
        timeoutMs: 50, // Short 50ms timeout
        socksProxyUrl: "socks5://127.0.0.1:1080",
        customTransport,
      });

      const res = await client.sendMessage("تست تایم‌اوت");
      expect(res.sent).toBe(false);
      expect(res.reason).toBe("timeout_after_50ms");
      client.destroy();
    });

    it("handles external AbortSignal cancellation in getUpdates", async () => {
      const customTransport = {
        request: ((_url: URL, options: MockTransportOptions) => {
          const req = new EventEmitter() as MockReq;
          req.write = vi.fn();
          req.end = vi.fn();
          if (options.signal) {
            options.signal.addEventListener(
              "abort",
              () => {
                req.emit("error", new Error("The operation was aborted"));
              },
              { once: true },
            );
          }
          return req;
        }) as unknown as typeof https.request,
      };

      const client = new TelegramClient({
        botToken: "token123",
        adminChatId: "admin_chat",
        socksProxyUrl: "socks5://127.0.0.1:1080",
        customTransport,
      });

      const controller = new AbortController();
      controller.abort(); // pre-aborted

      const res = await client.getUpdates({ signal: controller.signal });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe("aborted");
      client.destroy();
    });

    it("strictly redacts bot token and proxy credentials from network error strings", async () => {
      const secretToken = "BOT_SECRET_TOKEN_998877";
      const secretPassword = "SUPER_SECRET_PROXY_PASS_XYZ";
      const secretUser = "proxy_admin_user";

      const customTransport = {
        request: ((_url: URL, _options: MockTransportOptions) => {
          const req = new EventEmitter() as MockReq;
          req.write = vi.fn();
          req.end = vi.fn().mockImplementation(() => {
            queueMicrotask(() => {
              req.emit(
                "error",
                new Error(
                  `Proxy auth failure for socks5://${secretUser}:${secretPassword}@127.0.0.1:1080 requesting /bot${secretToken}/sendMessage: invalid credentials`,
                ),
              );
            });
          });
          return req;
        }) as unknown as typeof https.request,
      };

      const client = new TelegramClient({
        botToken: secretToken,
        adminChatId: "admin_chat",
        socksProxyUrl: `socks5://${secretUser}:${secretPassword}@127.0.0.1:1080`,
        customTransport,
      });

      const res = await client.sendMessage("تست نشت نکردن اطلاعات");
      expect(res.sent).toBe(false);
      expect(res.reason).toBeDefined();

      const reasonString = res.reason ?? "";
      expect(reasonString).not.toContain(secretPassword);
      expect(reasonString).not.toContain(secretToken);
      expect(reasonString).not.toContain(secretUser);
      expect(reasonString).toContain("[REDACTED_PROXY_PASSWORD]");
      expect(reasonString).toContain("[REDACTED_BOT_TOKEN]");
      expect(reasonString).toContain("[REDACTED_PROXY_USER]");
      client.destroy();
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

  // =========================================================================
  // 5. Recovery Alerting & Component Failure Transitions
  // =========================================================================
  describe("Recovery Alerting (healthy -> failed -> healthy)", () => {
    it("does not send recovery alert if component was never in a failed state", async () => {
      const mockClient = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockResolvedValue({ sent: true }),
      } as unknown as TelegramClient;

      const service = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      const recovered = await service.notifyRecovery("worker.queue_error", "ورکر سالم شد");
      expect(recovered).toBe(false);
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });

    it("sends recovery alert when transitioning from failed back to healthy", async () => {
      const sentMessages: string[] = [];
      const mockClient = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentMessages.push(text);
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const service = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      // 1. Component fails
      await service.notifyCritical("worker.queue_error", "خطای صف ورکر");
      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0]).toContain("خطای صف ورکر");

      // 2. Component recovers
      const recovered = await service.notifyRecovery("worker.queue_error", "بازیابی ورکر");
      expect(recovered).toBe(true);
      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1]).toContain("بازیابی ورکر");

      // 3. Second recovery attempt does not fire (already cleared failure state)
      const secondRecovery = await service.notifyRecovery("worker.queue_error", "بازیابی مجدد");
      expect(secondRecovery).toBe(false);
      expect(sentMessages.length).toBe(2);
    });
  });

  // =========================================================================
  // 6. Business Alerts (Payment & Teacher)
  // =========================================================================
  describe("Business Events Alerting", () => {
    it("sends informational alert for payment.completed and teacher events", async () => {
      const sentMessages: string[] = [];
      const mockClient = {
        isConfigured: () => true,
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentMessages.push(text);
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const service = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await service.notifyInfo("payment.completed", "تکمیل پرداخت", {
        details: {
          orderId: "ord-1234",
          amount: 250000,
          gateway: "zarinpal",
          status: "موفق",
        },
      });

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0]).toContain("تکمیل پرداخت");
      expect(sentMessages[0]).toContain("250000");
      expect(sentMessages[0]).not.toContain("password");
      expect(sentMessages[0]).not.toContain("token");

      await service.notifyInfo("teacher.approved", "تأیید استاد", {
        details: {
          teacherId: "teacher-uuid-1",
          status: "تأیید شده",
        },
      });

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1]).toContain("تأیید استاد");
    });
  });

  // =========================================================================
  // 7. TelegramOpsBot Inbound Commands (/status, /queues, /errors)
  // =========================================================================
  describe("TelegramOpsBot Inbound Commands & Security", () => {
    const adminChatId = "629710703";

    it("silently drops updates from unauthorized chat IDs", async () => {
      const mockClient = {
        sendMessage: vi.fn().mockResolvedValue({ sent: true }),
        getUpdates: vi.fn().mockResolvedValue({ ok: true, updates: [] }),
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
      });

      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 10,
          chat: { id: 999999999, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/status",
        },
      });

      expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });

    it("responds to /status for authorized adminChatId and sanitizes health check", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
        getUpdates: vi.fn().mockResolvedValue({ ok: true, updates: [] }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        getSystemHealth: vi.fn().mockResolvedValue({
          database: "healthy",
          redis: "healthy",
          ai: "healthy",
          services: {
            database: { status: "healthy" },
            redis: { status: "healthy" },
            ai: { status: "healthy" },
          },
        }),
        getDashboardStats: vi.fn().mockResolvedValue({
          generationsToday: 42,
          generationSuccessRate: 95,
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const mockQueue = {
        name: "content_generate",
        getJobCounts: vi.fn().mockResolvedValue({
          waiting: 3,
          active: 1,
          failed: 0,
        }),
      } as unknown as import("bullmq").Queue;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
        generationQueue: mockQueue,
      });

      await bot.handleUpdate({
        update_id: 2,
        message: {
          message_id: 20,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/status",
        },
      });

      expect(mockClient.sendMessage).toHaveBeenCalledWith(expect.any(String), adminChatId);
      expect(sentText).toContain("AVANA Status");
      expect(sentText).toContain("سالم (Healthy)");
      expect(sentText).toContain("PostgreSQL");
      expect(sentText).toContain("ورکر (Worker): ⚪ نامشخص (عدم تنظیم پروب)");
      expect(sentText).toContain("در انتظار: 3");
      expect(sentText).toContain("42");
    });

    it("reports Worker healthy when active jobs exist and heartbeat is fresh", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        workerHealthChecker: vi.fn().mockResolvedValue({
          status: "healthy",
          details: "در حال پردازش ۲ جاب (ضربان قلب ورکر تازه است)",
        }),
      });

      await bot.handleUpdate({
        update_id: 21,
        message: {
          message_id: 21,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/status",
        },
      });

      expect(sentText).toContain("ورکر (Worker): 🟢 سالم (در حال پردازش ۲ جاب (ضربان قلب ورکر تازه است))");
    });

    it("reports Worker unhealthy when active jobs exist but heartbeat is stale", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        workerHealthChecker: vi.fn().mockResolvedValue({
          status: "unhealthy",
          details: "دارای ۱ جاب متوقف‌شده (ضربان قلب ورکر دریافت نمی‌شود)",
        }),
      });

      await bot.handleUpdate({
        update_id: 22,
        message: {
          message_id: 22,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/status",
        },
      });

      expect(sentText).toContain("ورکر (Worker): 🔴 غیرفعال (دارای ۱ جاب متوقف‌شده (ضربان قلب ورکر دریافت نمی‌شود))");
    });

    it("reports Worker unknown when no active jobs and no process-level heartbeat signal", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        workerHealthChecker: vi.fn().mockResolvedValue({
          status: "unknown",
          details: "بدون جاب فعال (ورکر در وضعیت انتظار / آماده)",
        }),
      });

      await bot.handleUpdate({
        update_id: 23,
        message: {
          message_id: 23,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/status",
        },
      });

      expect(sentText).toContain("ورکر (Worker): ⚪ نامشخص (بدون جاب فعال (ورکر در وضعیت انتظار / آماده))");
    });

    it("supports checkWorkerHealth helper logic for fresh, stale, and idle queue", async () => {
      const { checkWorkerHealth } = await import("../observability/worker-health-probe.js");

      // 1. Idle queue (activeCount === 0) -> strictly returns unknown to avoid false positive
      const mockIdleQueue = {
        getActiveCount: vi.fn().mockResolvedValue(0),
      } as unknown as import("bullmq").Queue;

      const idleRes = await checkWorkerHealth({ queue: mockIdleQueue });
      expect(idleRes.status).toBe("unknown");
      expect(idleRes.details).toContain("بدون جاب فعال");

      // 2. Active jobs with fresh heartbeat -> healthy
      const mockActiveQueue = {
        getActiveCount: vi.fn().mockResolvedValue(2),
      } as unknown as import("bullmq").Queue;

      const freshDate = new Date(Date.now() - 30_000); // 30s ago
      const mockDbFresh = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ heartbeatAt: freshDate, updatedAt: freshDate }]),
              }),
            }),
          }),
        }),
      } as unknown as import("@avana/database/client").DbClient;

      const freshRes = await checkWorkerHealth({ queue: mockActiveQueue, db: mockDbFresh });
      expect(freshRes.status).toBe("healthy");
      expect(freshRes.details).toContain("ضربان قلب ورکر تازه است");

      // 3. Active jobs with stale heartbeat (>5 min) -> unhealthy
      const staleDate = new Date(Date.now() - 600_000); // 10m ago
      const mockDbStale = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ heartbeatAt: staleDate, updatedAt: staleDate }]),
              }),
            }),
          }),
        }),
      } as unknown as import("@avana/database/client").DbClient;

      const staleRes = await checkWorkerHealth({ queue: mockActiveQueue, db: mockDbStale });
      expect(staleRes.status).toBe("unhealthy");
      expect(staleRes.details).toContain("متوقف‌شده");
    });

    it("handles command parsing with username case-insensitively and rejects other bots", async () => {
      const mockSendMessage = vi.fn().mockResolvedValue({ sent: true });
      const mockClient = {
        sendMessage: mockSendMessage,
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        botUsername: "avana_alerts_bot",
        telegramClient: mockClient,
      });

      // 1. /status without username -> processed
      await bot.handleUpdate({
        update_id: 31,
        message: { message_id: 31, chat: { id: 629710703, type: "private" }, date: 1, text: "/status" },
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      // 2. /status@avana_alerts_bot exact -> processed
      await bot.handleUpdate({
        update_id: 32,
        message: { message_id: 32, chat: { id: 629710703, type: "private" }, date: 2, text: "/status@avana_alerts_bot" },
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(2);

      // 3. /STATUS@AVANA_ALERTS_BOT uppercase -> processed
      await bot.handleUpdate({
        update_id: 33,
        message: { message_id: 33, chat: { id: 629710703, type: "private" }, date: 3, text: "/STATUS@AVANA_ALERTS_BOT" },
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(3);

      // 4. /queues@avana_alerts_bot -> processed
      await bot.handleUpdate({
        update_id: 34,
        message: { message_id: 34, chat: { id: 629710703, type: "private" }, date: 4, text: "/queues@avana_alerts_bot" },
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(4);

      // 5. /errors@avana_alerts_bot -> processed
      await bot.handleUpdate({
        update_id: 35,
        message: { message_id: 35, chat: { id: 629710703, type: "private" }, date: 5, text: "/errors@avana_alerts_bot" },
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(5);

      // 6. /status@other_bot -> ignored
      await bot.handleUpdate({
        update_id: 36,
        message: { message_id: 36, chat: { id: 629710703, type: "private" }, date: 6, text: "/status@other_bot" },
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(5);

      // 7. /status@avana (old hardcoded tag) -> ignored
      await bot.handleUpdate({
        update_id: 37,
        message: { message_id: 37, chat: { id: 629710703, type: "private" }, date: 7, text: "/status@avana" },
      });
      expect(mockSendMessage).toHaveBeenCalledTimes(5);
    });

    it("filters errors strictly to last 24h, uses totalCount independent of page length, and deduplicates logs", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const now = Date.now();
      const recentTimestamp = new Date(now - 10 * 60 * 1000).toISOString(); // 10 mins ago

      const mockListAuditLogs = vi.fn().mockImplementation(async (params: { action?: string; search?: string; from?: string }) => {
        expect(params.from).toBeDefined();

        if (params.action === "generation.failed") {
          return {
            totalCount: 14, // 14 total failures in 24h
            logs: [
              {
                id: "shared-log-1",
                action: "generation.failed",
                entity: "document",
                entityId: "doc-1",
                timestamp: recentTimestamp,
                metadata: {},
              },
              {
                id: "gen-log-2",
                action: "generation.failed",
                entity: "document",
                entityId: "doc-2",
                timestamp: new Date(now - 20 * 60 * 1000).toISOString(),
                metadata: {},
              },
            ],
          };
        }

        if (params.search === "failed") {
          return {
            totalCount: 19, // 19 total search matches
            logs: [
              // Duplicate id from genFailedRes to test deduplication
              {
                id: "shared-log-1",
                action: "generation.failed",
                entity: "document",
                entityId: "doc-1",
                timestamp: recentTimestamp,
                metadata: {},
              },
              {
                id: "payment-log-3",
                action: "payment.failed",
                entity: "order",
                entityId: "order-3",
                timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
                metadata: {},
              },
            ],
          };
        }

        return { logs: [], totalCount: 0 };
      });

      const mockAdminStore = {
        listAuditLogs: mockListAuditLogs,
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 40,
        message: {
          message_id: 40,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/errors",
        },
      });

      expect(mockListAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.any(String),
        }),
      );

      // Verifies totalCount is accurately reported, NOT logs.length
      expect(sentText).toContain("خطاهای تولید محتوا: 14");
      expect(sentText).toContain("سایر وقایع خطا: 5"); // 19 - 14

      // Verifies shared-log-1 is only listed once (deduplicated)
      const matches = sentText.match(/doc-1/g);
      expect(matches).not.toBeNull();
      expect(matches?.length).toBe(1);

      // Verifies descending chronological order: payment-log-3 (5m ago) before shared-log-1 (10m ago)
      const paymentPos = sentText.indexOf("خطای پرداخت");
      const genPos = sentText.indexOf("شکست تولید محتوا");
      expect(paymentPos).toBeLessThan(genPos);
    });

    it("handles dependency failure in /status without throwing", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        getSystemHealth: vi.fn().mockRejectedValue(new Error("DB connection timeout password=supersecret")),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 3,
        message: {
          message_id: 30,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/status",
        },
      });

      expect(mockClient.sendMessage).toHaveBeenCalled();
      expect(sentText).toContain("AVANA Status");
      expect(sentText).toContain("در دسترس نیست");
      // Must NOT leak database password
      expect(sentText).not.toContain("supersecret");
    });

    it("executes /queues command and returns BullMQ metrics", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const mockQueue = {
        name: "content_generate",
        getJobCounts: vi.fn().mockResolvedValue({
          waiting: 5,
          active: 2,
          completed: 120,
          failed: 1,
          delayed: 0,
        }),
      } as unknown as import("bullmq").Queue;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        generationQueue: mockQueue,
      });

      await bot.handleUpdate({
        update_id: 4,
        message: {
          message_id: 40,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/queues",
        },
      });

      expect(mockClient.sendMessage).toHaveBeenCalled();
      expect(sentText).toContain("BullMQ");
      expect(sentText).toContain("content_generate");
      expect(sentText).toContain("Waiting");
      expect(sentText).toContain("5");
    });

    it("executes /errors command and sanitizes output", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        listAuditLogs: vi.fn().mockResolvedValue({
          totalCount: 2,
          logs: [
            {
              id: "log-1",
              action: "generation.failed",
              entity: "document",
              entityId: "doc-failed-uuid-long",
              timestamp: new Date().toISOString(),
              metadata: { secret: "12345" },
            },
          ],
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 5,
        message: {
          message_id: 50,
          chat: { id: 629710703, type: "private" },
          date: Math.floor(Date.now() / 1000),
          text: "/errors",
        },
      });

      expect(mockClient.sendMessage).toHaveBeenCalled();
      expect(sentText).toContain("گزارش خطاهای اخیر");
      expect(sentText).toContain("شکست تولید محتوا");
      expect(sentText).not.toContain("12345"); // Sanitized details
    });

    it("enforces in-memory rate limiting against command flooding", async () => {
      const mockClient = {
        sendMessage: vi.fn().mockResolvedValue({ sent: true }),
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        rateLimitWindowMs: 10_000,
        maxCommandsPerWindow: 2,
      });

      // Send 2 allowed commands
      await bot.handleUpdate({
        update_id: 10,
        message: { message_id: 1, chat: { id: 629710703, type: "private" }, date: 1, text: "/help" },
      });
      await bot.handleUpdate({
        update_id: 11,
        message: { message_id: 2, chat: { id: 629710703, type: "private" }, date: 2, text: "/help" },
      });

      // Third command triggers rate limit warning
      await bot.handleUpdate({
        update_id: 12,
        message: { message_id: 3, chat: { id: 629710703, type: "private" }, date: 3, text: "/help" },
      });

      expect(mockClient.sendMessage).toHaveBeenLastCalledWith(
        expect.stringContaining("بیش از حد مجاز"),
        adminChatId,
      );
    });

    it("supports start and stop lifecycle gracefully", async () => {
      const mockGetUpdates = vi.fn().mockResolvedValue({ ok: true, updates: [] });
      const mockClient = {
        sendMessage: vi.fn().mockResolvedValue({ sent: true }),
        getUpdates: mockGetUpdates,
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        pollIntervalMs: 50,
      });

      bot.start();
      await new Promise((resolve) => setTimeout(resolve, 80));
      await bot.stop();

      expect(mockGetUpdates).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7.1. TelegramOpsBot /payments Command & Verification
  // =========================================================================
  describe("TelegramOpsBot /payments Command", () => {
    const adminChatId = "629710703";

    it("1. lists pending card-to-card payments with correct approve and reject buttons", async () => {
      const sentPayloads: Array<{ text: string; replyMarkup?: any }> = [];
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string, _chatId?: string, replyMarkup?: any) => {
          sentPayloads.push({ text, replyMarkup });
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const p1Id = "11111111-1111-4111-8111-111111111111";
      const p2Id = "22222222-2222-4222-8222-222222222222";

      const mockAdminStore = {
        listCommercePayments: vi.fn().mockResolvedValue({
          totalCount: 2,
          payments: [
            {
              id: p1Id,
              orderId: "ord-1",
              orderNumber: "ORD-101",
              userId: "u-1",
              userEmail: "user1@example.com",
              productTitle: "بسته طلایی زیست",
              productType: "content_pack",
              amount: 250000,
              currency: "IRR",
              gateway: "card_to_card",
              status: "pending_admin_review",
              trackingNumber: "TRK-98765",
              sourceCardLast4: "5432",
              payerName: "علی رضایی",
              createdAt: "2026-10-13T10:00:00.000Z",
            },
            {
              id: p2Id,
              orderId: "ord-2",
              orderNumber: "ORD-102",
              userId: "u-2",
              userEmail: "user2@example.com",
              productTitle: "شارژ کیف پول",
              productType: "wallet_topup",
              amount: 100000,
              currency: "IRR",
              gateway: "card_to_card",
              status: "pending_admin_review",
              trackingNumber: "TRK-54321",
              sourceCardLast4: "1234",
              payerName: "سارا حسینی",
              createdAt: "2026-10-13T11:00:00.000Z",
            },
          ],
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 20,
        message: {
          message_id: 100,
          chat: { id: 629710703, type: "private" },
          date: 1000,
          text: "/payments",
        },
      });

      expect(mockAdminStore.listCommercePayments).toHaveBeenCalledWith({
        page: 1,
        pageSize: 5,
        status: "pending_admin_review",
      });

      // 2 payments returned -> 2 separate messages sent
      expect(sentPayloads.length).toBe(2);

      // Verify payload 1
      expect(sentPayloads[0].text).toContain("پرداخت در انتظار بررسی");
      expect(sentPayloads[0].text).toContain("۲۵۰٬۰۰۰ تومان");
      expect(sentPayloads[0].text).toContain("بسته طلایی زیست");
      expect(sentPayloads[0].text).toContain("کد پیگیری: TRK-98765");
      expect(sentPayloads[0].text).toContain("کارت مبدأ: ****5432");
      expect(sentPayloads[0].text).toContain("پرداخت‌کننده: علی رضایی");
      expect(sentPayloads[0].text).toContain(`شناسه: ${p1Id}`);
      expect(sentPayloads[0].replyMarkup).toEqual({
        inline_keyboard: [
          [
            { text: "✅ تأیید پرداخت", callback_data: `pay:app:${p1Id}` },
            { text: "❌ رد پرداخت", callback_data: `pay:rej:${p1Id}` },
          ],
        ],
      });

      // Verify payload 2 (wallet topup)
      expect(sentPayloads[1].text).toContain("۱۰۰٬۰۰۰ تومان");
      expect(sentPayloads[1].text).toContain("شارژ کیف پول");
      expect(sentPayloads[1].text).toContain("کد پیگیری: TRK-54321");
      expect(sentPayloads[1].text).toContain(`شناسه: ${p2Id}`);
      expect(sentPayloads[1].replyMarkup).toEqual({
        inline_keyboard: [
          [
            { text: "✅ تأیید پرداخت", callback_data: `pay:app:${p2Id}` },
            { text: "❌ رد پرداخت", callback_data: `pay:rej:${p2Id}` },
          ],
        ],
      });
    });

    it("2. displays appropriate Persian message when pending payments list is empty", async () => {
      const sentPayloads: Array<{ text: string }> = [];
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentPayloads.push({ text });
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        listCommercePayments: vi.fn().mockResolvedValue({
          totalCount: 0,
          payments: [],
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 21,
        message: {
          message_id: 101,
          chat: { id: 629710703, type: "private" },
          date: 1001,
          text: "/payments",
        },
      });

      expect(sentPayloads.length).toBe(1);
      expect(sentPayloads[0].text).toContain("هیچ پرداختی در انتظار بررسی نیست");
    });

    it("3. caps display to 5 payments per request and informs admin if total exceeds 5", async () => {
      const sentPayloads: Array<{ text: string; replyMarkup?: any }> = [];
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string, _chatId?: string, replyMarkup?: any) => {
          sentPayloads.push({ text, replyMarkup });
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const mockPayments = Array.from({ length: 5 }, (_, i) => ({
        id: `00000000-0000-4000-8000-00000000000${i + 1}`,
        orderId: `ord-${i + 1}`,
        userId: `u-${i + 1}`,
        amount: 50000 * (i + 1),
        productTitle: "خرید دوره",
        productType: "course",
        gateway: "card_to_card",
        status: "pending_admin_review",
        createdAt: new Date().toISOString(),
      }));

      const mockAdminStore = {
        listCommercePayments: vi.fn().mockResolvedValue({
          totalCount: 12, // 12 pending payments in total
          payments: mockPayments,
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 22,
        message: {
          message_id: 102,
          chat: { id: 629710703, type: "private" },
          date: 1002,
          text: "/payments",
        },
      });

      // 1 header message + 5 payment messages = 6 messages
      expect(sentPayloads.length).toBe(6);
      expect(sentPayloads[0].text).toContain("۵ مورد از مجموع ۱۲ پرداخت در انتظار بررسی");
      expect(sentPayloads.slice(1).length).toBe(5);
    });

    it("4. silently drops /payments command from unauthorized chat IDs", async () => {
      const mockClient = {
        sendMessage: vi.fn().mockResolvedValue({ sent: true }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        listCommercePayments: vi.fn().mockResolvedValue({ totalCount: 0, payments: [] }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 23,
        message: {
          message_id: 103,
          chat: { id: 999999999, type: "private" }, // Unauthorized
          date: 1003,
          text: "/payments",
        },
      });

      expect(mockClient.sendMessage).not.toHaveBeenCalled();
      expect(mockAdminStore.listCommercePayments).not.toHaveBeenCalled();
    });

    it("5. sanitizes database error and timeout without exposing internal secrets or stack traces", async () => {
      const sentPayloads: Array<{ text: string }> = [];
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentPayloads.push({ text });
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        listCommercePayments: vi.fn().mockRejectedValue(
          new Error("connect ECONNREFUSED postgres://postgres:superSecretPass123@10.0.0.5:5432/avana_db"),
        ),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
      });

      await bot.handleUpdate({
        update_id: 24,
        message: {
          message_id: 104,
          chat: { id: 629710703, type: "private" },
          date: 1004,
          text: "/payments",
        },
      });

      expect(sentPayloads.length).toBe(1);
      expect(sentPayloads[0].text).toContain("خطا در دریافت اطلاعات پرداخت‌ها");
      expect(sentPayloads[0].text).not.toContain("superSecretPass123");
      expect(sentPayloads[0].text).not.toContain("postgres");
      expect(sentPayloads[0].text).not.toContain("10.0.0.5");
    });

    it("6. updates /help and /start command list with /payments", async () => {
      let sentText = "";
      const mockClient = {
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
      });

      await bot.handleUpdate({
        update_id: 25,
        message: {
          message_id: 105,
          chat: { id: 629710703, type: "private" },
          date: 1005,
          text: "/help",
        },
      });

      expect(sentText).toContain("/payments");
      expect(sentText).toContain("/status");
      expect(sentText).toContain("/queues");
      expect(sentText).toContain("/errors");
    });
  });

  // =========================================================================
  // 8. Telegram New Registrations, Payments & Callback Actions (Approve / Reject)
  // =========================================================================
  describe("Telegram Registrations, Payments & Callback Actions", () => {
    const adminChatId = "629710703";

    it("notifies on user.registered and teacher.requested", async () => {
      const sentPayloads: Array<{ text: string; replyMarkup?: any }> = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string, _chatId?: string, replyMarkup?: any) => {
          sentPayloads.push({ text, replyMarkup });
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await alertService.notifyUserRegistered({
        userId: "user-123",
        name: "علی رضایی",
      });

      expect(sentPayloads.length).toBe(1);
      expect(sentPayloads[0].text).toContain("ثبت‌نام کاربر جدید");
      expect(sentPayloads[0].text).toContain("علی رضایی");
      expect(sentPayloads[0].text).toContain("user-123");

      await alertService.notifyTeacherRequested({
        teacherId: "teacher-456",
        name: "دکتر اکبری",
        university: "دانشگاه تهران",
      });

      expect(sentPayloads.length).toBe(2);
      expect(sentPayloads[1].text).toContain("درخواست ثبت‌نام استاد");
      expect(sentPayloads[1].text).toContain("دکتر اکبری");
      expect(sentPayloads[1].text).toContain("دانشگاه تهران");
      expect(sentPayloads[1].text).toContain("teacher-456");
    });

    it("sends payment notification with inline buttons for C2C and dedupes multiple triggers", async () => {
      const sentPayloads: Array<{ text: string; replyMarkup?: any }> = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string, _chatId?: string, replyMarkup?: any) => {
          sentPayloads.push({ text, replyMarkup });
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      const paymentId = "c2c-pay-789";

      // First trigger: c2c_submitted
      const sentFirst = await alertService.notifyPaymentReceived({
        paymentId,
        amount: 350000,
        productTitle: "اشتراک طلایی",
        status: "در انتظار بررسی ادمین",
        isC2C: true,
        trackingNumber: "TRK-987654",
        sourceCardLast4: "6037991812345678",
        payerName: "علی رضایی",
        paidAt: "2026-10-08T12:00:00.000Z",
      });

      expect(sentFirst).toBe(true);
      expect(sentPayloads.length).toBe(1);
      const text = sentPayloads[0].text;
      expect(text).toContain("پرداخت کارت‌به‌کارت جدید");
      expect(text).toContain("۳۵۰٬۰۰۰ تومان");
      expect(text).toContain("اشتراک طلایی");
      expect(text).toContain("شماره پیگیری: TRK-987654");
      expect(text).toContain("کارت مبدأ: **** **** **** 5678");
      expect(text).toContain("واریزکننده: علی رضایی");
      expect(text).toContain("تاریخ واریز: 2026-10-08T12:00:00.000Z");
      expect(text).toContain("وضعیت: در انتظار بررسی ادمین");
      expect(text).toContain(`شناسه: ${paymentId}`);
      expect(sentPayloads[0].replyMarkup).toBeDefined();
      expect(sentPayloads[0].replyMarkup.inline_keyboard[0][0].callback_data).toBe(`pay:app:${paymentId}`);
      expect(sentPayloads[0].replyMarkup.inline_keyboard[0][1].callback_data).toBe(`pay:rej:${paymentId}`);

      // Second trigger for identical payment (deduplication check)
      const sentSecond = await alertService.notifyPaymentReceived({
        paymentId,
        amount: 350000,
        status: "موفق",
        isC2C: false,
      });

      expect(sentSecond).toBe(false);
      expect(sentPayloads.length).toBe(1); // Deduped via cooldownKey
    });

    it("formats C2C payment alerts properly when optional fields are omitted or empty", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await alertService.notifyPaymentReceived({
        paymentId: "c2c-pay-minimal",
        amount: 100000,
        status: "در انتظار بررسی ادمین",
        isC2C: true,
        trackingNumber: "TRK-111",
      });

      expect(sentText).toContain("پرداخت کارت‌به‌کارت جدید");
      expect(sentText).toContain("۱۰۰٬۰۰۰ تومان");
      expect(sentText).toContain("شماره پیگیری: TRK-111");
      expect(sentText).not.toContain("واریزکننده:");
      expect(sentText).not.toContain("کارت مبدأ:");
      expect(sentText).not.toContain("تاریخ واریز:");
      expect(sentText).toContain("وضعیت: در انتظار بررسی ادمین");
    });

    it("strictly preserves security boundaries in C2C payment alerts without exposing secrets or raw receipts", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await alertService.notifyPaymentReceived({
        paymentId: "c2c-pay-security",
        amount: 200000,
        status: "در انتظار بررسی ادمین",
        isC2C: true,
        trackingNumber: "TRK-SEC-123",
        sourceCardLast4: "5022291098761234",
        payerName: "سارا حسینی",
      });

      // Validates last 4 digits masking
      expect(sentText).toContain("**** **** **** 1234");
      // Full 16-digit card number must NEVER appear in the message
      expect(sentText).not.toContain("5022291098761234");
      // Sensitive tokens, CVV, passwords must not be present
      expect(sentText).not.toContain("cvv");
      expect(sentText).not.toContain("password");
      expect(sentText).not.toContain("token");
      expect(sentText).not.toContain("receiptUrl");
      expect(sentText).not.toContain("rawPaymentText");
    });

    it("preserves original format for non-C2C payments (payment.completed)", async () => {
      let sentText = "";
      let capturedMarkup: import("../observability/telegram-client.js").TelegramInlineKeyboardMarkup | undefined = undefined;
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string, _chatId?: string, markup?: import("../observability/telegram-client.js").TelegramInlineKeyboardMarkup) => {
          sentText = text;
          capturedMarkup = markup;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await alertService.notifyPaymentReceived({
        paymentId: "gateway-pay-456",
        amount: 500000,
        productTitle: "آزمون ویژه",
        status: "موفق",
        isC2C: false,
      });

      expect(sentText).toContain("💳 پرداخت جدید");
      expect(sentText).not.toContain("پرداخت کارت‌به‌کارت جدید");
      expect(sentText).not.toContain("اطلاعات واریز:");
      expect(sentText).toContain("مبلغ: ۵۰۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: آزمون ویژه");
      expect(sentText).toContain("وضعیت: موفق");
      expect(capturedMarkup).toBeUndefined();
    });

    it("silently ignores callback queries from unauthorized chat IDs", async () => {
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
        editMessageText: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as TelegramClient;

      const mockAdminService = {
        approvePayment: vi.fn(),
        rejectPayment: vi.fn(),
      } as unknown as import("../modules/admin/admin-service.js").AdminService;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminService: mockAdminService,
      });

      await bot.handleUpdate({
        update_id: 100,
        callback_query: {
          id: "cb-unauth",
          from: { id: 888888, is_bot: false, first_name: "Attacker" },
          message: {
            message_id: 55,
            chat: { id: 888888, type: "private" },
            date: 1000,
            text: "پرداخت جدید",
          },
          data: "pay:app:00000000-0000-4000-8000-000000000001",
        },
      });

      expect(mockClient.answerCallbackQuery).not.toHaveBeenCalled();
      expect(mockAdminService.approvePayment).not.toHaveBeenCalled();
    });

    it("rejects callback queries with invalid UUID format", async () => {
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
        editMessageText: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as TelegramClient;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
      });

      await bot.handleUpdate({
        update_id: 101,
        callback_query: {
          id: "cb-invalid-uuid",
          from: { id: 629710703, is_bot: false, first_name: "Admin" },
          message: {
            message_id: 56,
            chat: { id: 629710703, type: "private" },
            date: 1000,
            text: "پرداخت جدید",
          },
          data: "pay:app:invalid-uuid-format",
        },
      });

      expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith({
        callbackQueryId: "cb-invalid-uuid",
      });
      expect(mockClient.editMessageText).not.toHaveBeenCalled();
    });

    it("approves C2C payment canonically, edits telegram message and removes buttons", async () => {
      const validPaymentId = "11111111-1111-4111-8111-111111111111";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
        editMessageText: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        getCommercePayment: vi.fn().mockResolvedValue({
          id: validPaymentId,
          amount: 100000,
          status: "pending_admin_review",
          gateway: "card_to_card",
        }),
        listUsers: vi.fn().mockResolvedValue({
          users: [{ id: "admin-uuid-1", role: "platform_admin" }],
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const mockAdminService = {
        approvePayment: vi.fn().mockResolvedValue({
          success: true,
          message: "پرداخت کارت‌به‌کارت با موفقیت تأیید شد.",
        }),
      } as unknown as import("../modules/admin/admin-service.js").AdminService;

      const mockAuditService = {
        emit: vi.fn().mockResolvedValue(undefined),
      } as unknown as AuditService;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
        adminService: mockAdminService,
        auditService: mockAuditService,
        adminUserId: "admin-uuid-1",
      });

      await bot.handleUpdate({
        update_id: 102,
        callback_query: {
          id: "cb-approve-1",
          from: { id: 629710703, is_bot: false, first_name: "Admin" },
          message: {
            message_id: 60,
            chat: { id: 629710703, type: "private" },
            date: 1000,
            text: "💳 پرداخت جدید\nمبلغ: ۱۰۰٬۰۰۰ تومان",
          },
          data: `pay:app:${validPaymentId}`,
        },
      });

      expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith({ callbackQueryId: "cb-approve-1" });
      expect(mockAdminService.approvePayment).toHaveBeenCalledWith("admin-uuid-1", validPaymentId);
      expect(mockClient.editMessageText).toHaveBeenCalledWith({
        messageId: 60,
        text: expect.stringContaining("💳 پرداخت تأیید شد"),
        overrideChatId: adminChatId,
      });
      expect(mockAuditService.emit).toHaveBeenCalledWith([
        expect.objectContaining({
          action: "payment.approved",
          entityId: validPaymentId,
        }),
      ]);
    });

    it("rejects C2C payment canonically with exact reason, edits telegram message and removes buttons", async () => {
      const validPaymentId = "22222222-2222-4222-8222-222222222222";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
        editMessageText: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        getCommercePayment: vi.fn().mockResolvedValue({
          id: validPaymentId,
          amount: 200000,
          status: "pending_admin_review",
          gateway: "card_to_card",
        }),
        listUsers: vi.fn().mockResolvedValue({
          users: [{ id: "admin-uuid-1", role: "platform_admin" }],
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const mockAdminService = {
        rejectPayment: vi.fn().mockResolvedValue({
          success: true,
          message: "پرداخت کارت‌به‌کارت رد شد.",
        }),
      } as unknown as import("../modules/admin/admin-service.js").AdminService;

      const mockAuditService = {
        emit: vi.fn().mockResolvedValue(undefined),
      } as unknown as AuditService;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
        adminService: mockAdminService,
        auditService: mockAuditService,
        adminUserId: "admin-uuid-1",
      });

      await bot.handleUpdate({
        update_id: 103,
        callback_query: {
          id: "cb-reject-1",
          from: { id: 629710703, is_bot: false, first_name: "Admin" },
          message: {
            message_id: 61,
            chat: { id: 629710703, type: "private" },
            date: 1000,
            text: "💳 پرداخت جدید\nمبلغ: ۲۰۰٬۰۰۰ تومان",
          },
          data: `pay:rej:${validPaymentId}`,
        },
      });

      expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith({ callbackQueryId: "cb-reject-1" });
      expect(mockAdminService.rejectPayment).toHaveBeenCalledWith(
        "admin-uuid-1",
        validPaymentId,
        "رد پرداخت از طریق Telegram Ops Bot",
      );
      expect(mockClient.editMessageText).toHaveBeenCalledWith({
        messageId: 61,
        text: expect.stringContaining("❌ پرداخت رد شد"),
        overrideChatId: adminChatId,
      });
      expect(mockAuditService.emit).toHaveBeenCalledWith([
        expect.objectContaining({
          action: "payment.rejected",
          entityId: validPaymentId,
        }),
      ]);
    });

    it("prevents double-action conflict when payment is already settled", async () => {
      const validPaymentId = "33333333-3333-4333-8333-333333333333";
      const mockClient = {
        answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
        editMessageText: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as TelegramClient;

      const mockAdminStore = {
        getCommercePayment: vi.fn().mockResolvedValue({
          id: validPaymentId,
          status: "admin_approved", // Already settled
          gateway: "card_to_card",
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const mockAdminService = {
        approvePayment: vi.fn(),
        rejectPayment: vi.fn(),
      } as unknown as import("../modules/admin/admin-service.js").AdminService;

      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: mockAdminStore,
        adminService: mockAdminService,
      });

      await bot.handleUpdate({
        update_id: 104,
        callback_query: {
          id: "cb-settled",
          from: { id: 629710703, is_bot: false, first_name: "Admin" },
          message: {
            message_id: 62,
            chat: { id: 629710703, type: "private" },
            date: 1000,
            text: "💳 پرداخت جدید",
          },
          data: `pay:rej:${validPaymentId}`,
        },
      });

      expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith({ callbackQueryId: "cb-settled" });
      expect(mockClient.editMessageText).toHaveBeenCalledWith({
        messageId: 62,
        text: "⚠️ این پرداخت قبلاً تعیین تکلیف شده است.",
        overrideChatId: adminChatId,
      });
      expect(mockAdminService.rejectPayment).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 9. Financial Alerting Enhancements & Multi-Product Verification
  // =========================================================================
  describe("Financial Alerting Enhancements & Multi-Product Verification", () => {
    it("formats wallet top-up payment alert accurately (C2C and Online Gateway)", async () => {
      let sentTextC2C = "";
      let sentTextOnline = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          if (!sentTextC2C) {
            sentTextC2C = text;
          } else {
            sentTextOnline = text;
          }
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      // 1. C2C Wallet Top-up
      await alertService.notifyPaymentReceived({
        paymentId: "topup-c2c-1",
        amount: 500000,
        productType: "wallet_topup",
        productTitle: "شارژ کیف پول",
        isC2C: true,
        sourceCardLast4: "5894",
        trackingNumber: "TRK-TOP-99",
        status: "در انتظار بررسی ادمین",
      });

      expect(sentTextC2C).toContain("💳 درخواست شارژ کیف پول (پرداخت کارت‌به‌کارت جدید)");
      expect(sentTextC2C).toContain("نوع: شارژ کیف پول");
      expect(sentTextC2C).not.toContain("اشتراک آوانا");
      expect(sentTextC2C).toContain("۵۰۰٬۰۰۰ تومان");
      expect(sentTextC2C).toContain("**** **** **** 5894");

      // 2. Online Gateway Wallet Top-up
      await alertService.notifyPaymentReceived({
        paymentId: "topup-online-1",
        amount: 1000000,
        productType: "wallet_topup",
        productTitle: "شارژ کیف پول",
        gateway: "zarinpal",
        isC2C: false,
        status: "موفق",
      });

      expect(sentTextOnline).toContain("💳 شارژ کیف پول (پرداخت جدید)");
      expect(sentTextOnline).toContain("نوع: شارژ کیف پول");
      expect(sentTextOnline).toContain("درگاه اینترنتی (زرین‌پال)");
      expect(sentTextOnline).not.toContain("اشتراک آوانا");
    });

    it("formats standalone course purchase accurately (C2C and Online Gateway)", async () => {
      let sentTextC2C = "";
      let sentTextOnline = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          if (!sentTextC2C) {
            sentTextC2C = text;
          } else {
            sentTextOnline = text;
          }
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      // C2C Course
      await alertService.notifyPaymentReceived({
        paymentId: "course-c2c-1",
        amount: 850000,
        productType: "course",
        productTitle: "آموزش جامع فلاتر",
        isC2C: true,
        sourceCardLast4: "6037",
        trackingNumber: "TRK-CRS-1",
        status: "در انتظار بررسی ادمین",
      });

      expect(sentTextC2C).toContain("💳 سفارش دوره آموزشی (پرداخت کارت‌به‌کارت جدید)");
      expect(sentTextC2C).toContain("نوع: آموزش جامع فلاتر");
      expect(sentTextC2C).not.toContain("اشتراک آوانا");

      // Online Course
      await alertService.notifyPaymentReceived({
        paymentId: "course-online-1",
        amount: 850000,
        productType: "course",
        productTitle: "آموزش جامع فلاتر",
        gateway: "zarinpal",
        isC2C: false,
        status: "موفق",
      });

      expect(sentTextOnline).toContain("💳 خرید دوره آموزشی (پرداخت جدید)");
      expect(sentTextOnline).toContain("نوع: آموزش جامع فلاتر");
      expect(sentTextOnline).toContain("درگاه اینترنتی (زرین‌پال)");
    });

    it("formats subscription purchase with specific subscription plan title", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await alertService.notifyPaymentReceived({
        paymentId: "sub-plan-1",
        amount: 350000,
        productType: "subscription",
        productTitle: "اشتراک آوانا (سه‌ماهه)",
        gateway: "zarinpal",
        isC2C: false,
        status: "موفق",
      });

      expect(sentText).toContain("💳 خرید اشتراک (پرداخت جدید)");
      expect(sentText).toContain("نوع: اشتراک آوانا (سه‌ماهه)");
    });

    it("formats wallet debit payment method (gateway=wallet) correctly", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      await alertService.notifyPaymentReceived({
        paymentId: "wallet-deb-1",
        amount: 200000,
        productType: "course",
        productTitle: "دوره فیزیک کوانتوم",
        gateway: "wallet",
        isC2C: false,
        status: "موفق",
      });

      expect(sentText).toContain("روش پرداخت: کیف پول");
      expect(sentText).toContain("نوع: دوره فیزیک کوانتوم");
    });

    it("sends wallet refund alert with proper formatting and cooldown deduplication", async () => {
      let sentMessages: string[] = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentMessages.push(text);
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      const firstSent = await alertService.notifyWalletRefunded({
        walletId: "w-ref-001",
        amount: 150000,
        source: "admin_adjustment",
        userId: "usr-ref-99",
        referenceType: "order",
        referenceId: "ord-ref-12",
      });

      expect(firstSent).toBe(true);
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toContain("🔄 بازپرداخت کیف پول");
      expect(sentMessages[0]).toContain("۱۵۰٬۰۰۰ تومان");
      expect(sentMessages[0]).toContain("منبع بازپرداخت: admin_adjustment");

      // Repeated trigger within cooldown window should be deduped
      const secondSent = await alertService.notifyWalletRefunded({
        walletId: "w-ref-001",
        amount: 150000,
        source: "admin_adjustment",
        userId: "usr-ref-99",
      });

      expect(secondSent).toBe(false);
      expect(sentMessages).toHaveLength(1);
    });

    it("sends payment.approved and payment.rejected alerts from web admin with cooldown", async () => {
      let sentMessages: string[] = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentMessages.push(text);
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      // Approved alert
      const approvedSent = await alertService.notifyPaymentApproved({
        paymentId: "pay-app-test-1",
        amount: 400000,
        productTitle: "شارژ کیف پول",
        productType: "wallet_topup",
        approvedBy: "admin-uuid-1",
        actorType: "admin/web",
      });

      expect(approvedSent).toBe(true);
      expect(sentMessages[0]).toContain("✅ پرداخت تأیید شد");
      expect(sentMessages[0]).toContain("۴۰۰٬۰۰۰ تومان");
      expect(sentMessages[0]).toContain("تأیید توسط: Admin (پنل مدیریت)");

      // Dedupe check for approve
      const approvedDuplicate = await alertService.notifyPaymentApproved({
        paymentId: "pay-app-test-1",
        amount: 400000,
      });
      expect(approvedDuplicate).toBe(false);

      // Rejected alert
      const rejectedSent = await alertService.notifyPaymentRejected({
        paymentId: "pay-rej-test-1",
        amount: 400000,
        productTitle: "شارژ کیف پول",
        productType: "wallet_topup",
        rejectedBy: "admin-uuid-1",
        reason: "شماره پیگیری نامعتبر است",
        actorType: "admin/web",
      });

      expect(rejectedSent).toBe(true);
      expect(sentMessages[1]).toContain("❌ پرداخت رد شد");
      expect(sentMessages[1]).toContain("علت رد: شماره پیگیری نامعتبر است");
      expect(sentMessages[1]).toContain("رد توسط: Admin (پنل مدیریت)");

      // Dedupe check for reject
      const rejectedDuplicate = await alertService.notifyPaymentRejected({
        paymentId: "pay-rej-test-1",
        reason: "تکرار",
      });
      expect(rejectedDuplicate).toBe(false);
    });

    it("composition verification: AdminService properly credits user wallet balance when approving wallet top-up", async () => {
      const commerceStore = new InMemoryCommerceStore();
      const mockGateway = new MockPaymentGateway();
      const walletStore = new InMemoryWalletStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const walletService = new WalletService(walletStore, auditService, commerceStore);

      const commerceService = new CommerceService(
        commerceStore,
        mockGateway,
        undefined,
        undefined,
        walletService,
        {
          enabled: true,
          destinationCardNumber: "5894631131738239",
          cardholderName: "آوانا",
          instructions: "انتقال کارت به کارت",
        },
      );

      const adminStore = new InMemoryAdminStore();
      adminStore.setCommerceStore(commerceStore);

      // Wired as in composeProduction.ts
      const adminService = new AdminService(
        adminStore,
        walletService,
        commerceStore,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        auditService,
      );

      const testUser: Actor = {
        userId: asUserId(randomUUID() as any),
        role: "student",
      };
      const adminUser: Actor = {
        userId: asUserId(randomUUID() as any),
        role: "platform_admin",
      };

      // 1. Initial wallet balance is 0
      const initialWallet = await walletService.getMyWallet(testUser);
      expect(initialWallet.balance).toBe(0);

      // 2. Discover wallet_topup product
      const products = await commerceService.listActiveProducts();
      const topupProduct = products.find((p) => p.type === "wallet_topup")!;
      expect(topupProduct).toBeDefined();

      const topupAmount = 750000;

      // 3. Submit C2C payment for wallet top-up
      const submission = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: topupAmount,
          trackingNumber: "TRK-TOPUP-VERIFY-1",
          sourceCardLast4: "5022",
        },
        "idempotency-key-topup-verify",
      );

      expect(submission.success).toBe(true);
      const paymentId = submission.paymentId;

      // Balance remains 0 before admin approval
      const midWallet = await walletService.getMyWallet(testUser);
      expect(midWallet.balance).toBe(0);

      // 4. Admin approves payment
      const approveResult = await adminService.approvePayment(
        adminUser.userId,
        paymentId,
        { actorType: "admin/web" },
      );

      expect(approveResult.success).toBe(true);
      expect(approveResult.payment.status).toBe("admin_approved");

      // 5. User wallet balance is now credited!
      const finalWallet = await walletService.getMyWallet(testUser);
      expect(finalWallet.balance).toBe(topupAmount);

      // Verify transaction ledger
      const txs = await walletService.listMyTransactions(testUser);
      expect(txs.total).toBe(1);
      expect(txs.transactions[0].type).toBe("credit");
      expect(txs.transactions[0].amount).toBe(topupAmount);
      expect(txs.transactions[0].source).toBe("wallet_topup");

      // Verify audit event was recorded
      const events = await auditStore.listAll();
      const approveEvent = events.find((e) => e.action === "payment.approved");
      expect(approveEvent).toBeDefined();
      expect(approveEvent?.details?.productType).toBe("wallet_topup");
    });
  });

  // =========================================================================
  // 10. Supplementary Audit & Real-World Invariance Tests
  // =========================================================================
  describe("10. Supplementary Audit & Real-World Invariance Tests", () => {
    it("TelegramOpsBot E2E: approves wallet top-up, credits ledger atomically, and rejects duplicate re-clicks", async () => {
      const commerceStore = new InMemoryCommerceStore();
      const mockGateway = new MockPaymentGateway();
      const walletStore = new InMemoryWalletStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const walletService = new WalletService(walletStore, auditService, commerceStore);

      const commerceService = new CommerceService(
        commerceStore,
        mockGateway,
        undefined,
        undefined,
        walletService,
        {
          enabled: true,
          destinationCardNumber: "5894631131738239",
          cardholderName: "آوانا",
          instructions: "کارت به کارت",
        },
      );

      const adminStore = new InMemoryAdminStore();
      adminStore.setCommerceStore(commerceStore);

      const adminService = new AdminService(
        adminStore,
        walletService,
        commerceStore,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        auditService,
      );

      let editMessageCalls: { messageId: number; text: string }[] = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
        editMessageText: vi.fn().mockImplementation((opts: any) => {
          editMessageCalls.push({ messageId: opts.messageId, text: opts.text });
          return Promise.resolve({ ok: true });
        }),
      } as unknown as TelegramClient;

      const adminChatId = "629710703";
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        adminService,
        auditService,
        adminUserId: "admin-uuid-ops",
      });

      const testUser: Actor = {
        userId: asUserId(randomUUID() as any),
        role: "student",
      };

      // 1. Initial State: Balance is 0, zero ledger transactions
      const initialWallet = await walletService.getMyWallet(testUser);
      expect(initialWallet.balance).toBe(0);
      const initialTxs = await walletService.listMyTransactions(testUser);
      expect(initialTxs.total).toBe(0);

      // 2. User submits wallet top-up request
      const products = await commerceService.listActiveProducts();
      const topupProduct = products.find((p) => p.type === "wallet_topup")!;
      const topupAmount = 350000;

      const submission = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: topupAmount,
          trackingNumber: "TRK-OPS-TOPUP-01",
          sourceCardLast4: "6037",
        },
        "idempotency-ops-01",
      );
      expect(submission.success).toBe(true);
      const paymentId = submission.paymentId;

      // Ensure pre-approval balance is still strictly 0
      const preApprovalWallet = await walletService.getMyWallet(testUser);
      expect(preApprovalWallet.balance).toBe(0);

      // 3. Admin clicks approve button in TelegramOpsBot
      await bot.handleCallbackQuery({
        id: "cq-approve-first",
        from: { id: 629710703, is_bot: false, first_name: "Admin" },
        message: {
          message_id: 110,
          chat: { id: 629710703, type: "private" },
          date: 1000,
          text: "💳 درخواست شارژ کیف پول",
        },
        data: `pay:app:${paymentId}`,
      });

      // Verify telegram message edited with confirmation
      expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith({ callbackQueryId: "cq-approve-first" });
      expect(editMessageCalls.length).toBe(1);
      expect(editMessageCalls[0].text).toContain("💳 پرداخت تأیید شد");

      // Verify wallet balance is credited
      const postApprovalWallet = await walletService.getMyWallet(testUser);
      expect(postApprovalWallet.balance).toBe(topupAmount);

      // Verify ledger transaction
      const postApprovalTxs = await walletService.listMyTransactions(testUser);
      expect(postApprovalTxs.total).toBe(1);
      expect(postApprovalTxs.transactions[0].type).toBe("credit");
      expect(postApprovalTxs.transactions[0].amount).toBe(topupAmount);
      expect(postApprovalTxs.transactions[0].source).toBe("wallet_topup");

      // 4. DUPLICATE RE-CLICK TEST: Click approve button a second time
      await bot.handleCallbackQuery({
        id: "cq-approve-duplicate",
        from: { id: 629710703, is_bot: false, first_name: "Admin" },
        message: {
          message_id: 110,
          chat: { id: 629710703, type: "private" },
          date: 1000,
          text: "💳 درخواست شارژ کیف پول",
        },
        data: `pay:app:${paymentId}`,
      });

      // Telegram warns that payment is already settled
      expect(editMessageCalls.length).toBe(2);
      expect(editMessageCalls[1].text).toContain("⚠️ این پرداخت قبلاً تعیین تکلیف شده است.");

      // CRITICAL INVARIANCE: Wallet balance MUST NOT increase again!
      const afterDuplicateWallet = await walletService.getMyWallet(testUser);
      expect(afterDuplicateWallet.balance).toBe(topupAmount);

      // Ledger must still have only 1 transaction
      const afterDuplicateTxs = await walletService.listMyTransactions(testUser);
      expect(afterDuplicateTxs.total).toBe(1);
    });

    it("prevents double crediting when web panel approves first then telegram button is clicked", async () => {
      const commerceStore = new InMemoryCommerceStore();
      const mockGateway = new MockPaymentGateway();
      const walletStore = new InMemoryWalletStore();
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const walletService = new WalletService(walletStore, auditService, commerceStore);

      const commerceService = new CommerceService(
        commerceStore,
        mockGateway,
        undefined,
        undefined,
        walletService,
        {
          enabled: true,
          destinationCardNumber: "5894631131738239",
          cardholderName: "آوانا",
          instructions: "کارت به کارت",
        },
      );

      const adminStore = new InMemoryAdminStore();
      adminStore.setCommerceStore(commerceStore);

      const adminService = new AdminService(
        adminStore,
        walletService,
        commerceStore,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        auditService,
      );

      let editMessageCalls: { messageId: number; text: string }[] = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        answerCallbackQuery: vi.fn().mockResolvedValue({ ok: true }),
        editMessageText: vi.fn().mockImplementation((opts: any) => {
          editMessageCalls.push({ messageId: opts.messageId, text: opts.text });
          return Promise.resolve({ ok: true });
        }),
      } as unknown as TelegramClient;

      const adminChatId = "629710703";
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");
      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        adminService,
        auditService,
        adminUserId: "admin-uuid-ops",
      });

      const testUser: Actor = {
        userId: asUserId(randomUUID() as any),
        role: "student",
      };

      const products = await commerceService.listActiveProducts();
      const topupProduct = products.find((p) => p.type === "wallet_topup")!;
      const topupAmount = 200000;

      const submission = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: topupProduct.id,
          amount: topupAmount,
          trackingNumber: "TRK-RACE-01",
          sourceCardLast4: "5022",
        },
        "idempotency-race-01",
      );
      const paymentId = submission.paymentId;

      // 1. Web panel approves first
      const webResult = await adminService.approvePayment("admin-web-id", paymentId, { actorType: "admin/web" });
      expect(webResult.success).toBe(true);

      const walletAfterWeb = await walletService.getMyWallet(testUser);
      expect(walletAfterWeb.balance).toBe(topupAmount);

      // 2. Admin clicks button on Telegram afterwards
      await bot.handleCallbackQuery({
        id: "cq-race-tg",
        from: { id: 629710703, is_bot: false, first_name: "Admin" },
        message: {
          message_id: 111,
          chat: { id: 629710703, type: "private" },
          date: 1000,
          text: "💳 درخواست شارژ کیف پول",
        },
        data: `pay:app:${paymentId}`,
      });

      expect(editMessageCalls[0].text).toContain("⚠️ این پرداخت قبلاً تعیین تکلیف شده است.");

      // Wallet balance must stay 200,000 (NOT 400,000!)
      const walletAfterTg = await walletService.getMyWallet(testUser);
      expect(walletAfterTg.balance).toBe(topupAmount);

      const txs = await walletService.listMyTransactions(testUser);
      expect(txs.total).toBe(1);
    });

    // Dedicated Purchase & Alert Verification Tests for Each Specific Scenario
    it("Purchase Alert Scenario 1: Wallet Top-up via Card-to-Card", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      await alertService.notifyPaymentReceived({
        paymentId: "pay-topup-c2c-audit",
        orderId: "ord-topup-c2c-audit",
        amount: 500000,
        productType: "wallet_topup",
        productTitle: "شارژ کیف پول",
        isC2C: true,
        sourceCardLast4: "5894",
        trackingNumber: "TRK-TOP-AUDIT",
        status: "در انتظار بررسی ادمین",
      });

      expect(sentText).toContain("💳 درخواست شارژ کیف پول (پرداخت کارت‌به‌کارت جدید)");
      expect(sentText).toContain("مبلغ: ۵۰۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: شارژ کیف پول");
      expect(sentText).toContain("روش پرداخت: کارت‌به‌کارت");
      expect(sentText).toContain("شناسه سفارش: ord-topup-c2c-audit");
    });

    it("Purchase Alert Scenario 2: Standalone Course Purchase via Card-to-Card", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      await alertService.notifyPaymentReceived({
        paymentId: "pay-course-c2c-audit",
        orderId: "ord-course-c2c-audit",
        amount: 850000,
        productType: "course",
        productTitle: "آموزش جامع فلاتر",
        isC2C: true,
        sourceCardLast4: "6037",
        trackingNumber: "TRK-CRS-AUDIT",
        status: "در انتظار بررسی ادمین",
      });

      expect(sentText).toContain("💳 سفارش دوره آموزشی (پرداخت کارت‌به‌کارت جدید)");
      expect(sentText).toContain("مبلغ: ۸۵۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: آموزش جامع فلاتر");
      expect(sentText).toContain("روش پرداخت: کارت‌به‌کارت");
      expect(sentText).toContain("شناسه سفارش: ord-course-c2c-audit");
    });

    it("Purchase Alert Scenario 3: Standalone Course Purchase via Online Gateway", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      await alertService.notifyPaymentReceived({
        paymentId: "pay-course-online-audit",
        orderId: "ord-course-online-audit",
        amount: 950000,
        productType: "course",
        productTitle: "آموزش جامع معماری نرم‌افزار",
        gateway: "zarinpal",
        isC2C: false,
        status: "موفق",
      });

      expect(sentText).toContain("💳 خرید دوره آموزشی (پرداخت جدید)");
      expect(sentText).toContain("مبلغ: ۹۵۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: آموزش جامع معماری نرم‌افزار");
      expect(sentText).toContain("روش پرداخت: درگاه اینترنتی (زرین‌پال)");
      expect(sentText).toContain("شناسه سفارش: ord-course-online-audit");
    });

    it("Purchase Alert Scenario 4: Course Purchase via Wallet Debit", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      await alertService.notifyPaymentReceived({
        paymentId: "pay-course-wallet-audit",
        orderId: "ord-course-wallet-audit",
        amount: 300000,
        productType: "course",
        productTitle: "دوره فیزیک کوانتوم",
        gateway: "wallet",
        isC2C: false,
        status: "موفق",
      });

      expect(sentText).toContain("💳 خرید دوره آموزشی (پرداخت جدید)");
      expect(sentText).toContain("مبلغ: ۳۰۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: دوره فیزیک کوانتوم");
      expect(sentText).toContain("روش پرداخت: کیف پول");
      expect(sentText).toContain("شناسه سفارش: ord-course-wallet-audit");
    });

    it("Purchase Alert Scenario 5: Monthly Subscription Purchase", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      await alertService.notifyPaymentReceived({
        paymentId: "pay-sub-monthly-audit",
        orderId: "ord-sub-monthly-audit",
        amount: 150000,
        productType: "subscription",
        productTitle: "اشتراک ماهانه آوانا",
        gateway: "zarinpal",
        isC2C: false,
        status: "موفق",
      });

      expect(sentText).toContain("💳 خرید اشتراک (پرداخت جدید)");
      expect(sentText).toContain("مبلغ: ۱۵۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: اشتراک ماهانه آوانا");
      expect(sentText).toContain("روش پرداخت: درگاه اینترنتی (زرین‌پال)");
      expect(sentText).toContain("شناسه سفارش: ord-sub-monthly-audit");
    });

    it("Purchase Alert Scenario 6: Quarterly Subscription Purchase", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      await alertService.notifyPaymentReceived({
        paymentId: "pay-sub-quarterly-audit",
        orderId: "ord-sub-quarterly-audit",
        amount: 390000,
        productType: "subscription",
        productTitle: "اشتراک سه‌ماهه آوانا",
        gateway: "zarinpal",
        isC2C: false,
        status: "موفق",
      });

      expect(sentText).toContain("💳 خرید اشتراک (پرداخت جدید)");
      expect(sentText).toContain("مبلغ: ۳۹۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: اشتراک سه‌ماهه آوانا");
      expect(sentText).toContain("روش پرداخت: درگاه اینترنتی (زرین‌پال)");
      expect(sentText).toContain("شناسه سفارش: ord-sub-quarterly-audit");
    });

    it("Purchase Alert Scenario 7: Yearly Subscription Purchase", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      await alertService.notifyPaymentReceived({
        paymentId: "pay-sub-yearly-audit",
        orderId: "ord-sub-yearly-audit",
        amount: 1200000,
        productType: "subscription",
        productTitle: "اشتراک یک‌ساله آوانا",
        gateway: "zarinpal",
        isC2C: false,
        status: "موفق",
      });

      expect(sentText).toContain("💳 خرید اشتراک (پرداخت جدید)");
      expect(sentText).toContain("مبلغ: ۱٬۲۰۰٬۰۰۰ تومان");
      expect(sentText).toContain("نوع: اشتراک یک‌ساله آوانا");
      expect(sentText).toContain("روش پرداخت: درگاه اینترنتی (زرین‌پال)");
      expect(sentText).toContain("شناسه سفارش: ord-sub-yearly-audit");
    });

    it("Purchase Alert Scenario 8: Wallet Refund Alert", async () => {
      let sentText = "";
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation((text: string) => {
          sentText = text;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });

      const sent = await alertService.notifyWalletRefunded({
        walletId: "w-refund-audit-01",
        amount: 180000,
        source: "admin_adjustment",
        userId: "usr-ref-42",
        referenceType: "order",
        referenceId: "ord-ref-99",
      });

      expect(sent).toBe(true);
      expect(sentText).toContain("🔄 بازپرداخت کیف پول");
      expect(sentText).toContain("مبلغ: ۱۸۰٬۰۰۰ تومان");
      expect(sentText).toContain("شناسه کیف پول: w-refund-audit-01");
      expect(sentText).toContain("منبع بازپرداخت: admin_adjustment");
    });

    it("AuditService duplicate event handling & distinction between alert cooldown and financial idempotency", async () => {
      let sentCount = 0;
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        sendMessage: vi.fn().mockImplementation(() => {
          sentCount++;
          return Promise.resolve({ sent: true });
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({ enabled: true, telegramClient: mockClient });
      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);

      // Wire audit listener as in composeProduction
      auditService.addListener((events) => {
        for (const event of events) {
          if (event.action === "payment.completed") {
            const paymentId = String(event.details?.paymentId ?? event.entityId);
            void alertService.notifyPaymentReceived({
              paymentId,
              orderId: typeof event.details?.orderId === "string" ? event.details.orderId : undefined,
              amount: Number(event.details?.amount ?? 0),
              productTitle: typeof event.details?.productTitle === "string" ? event.details.productTitle : undefined,
              productType: typeof event.details?.productType === "string" ? event.details.productType : undefined,
              gateway: typeof event.details?.gateway === "string" ? event.details.gateway : undefined,
              status: "موفق",
              isC2C: false,
            });
          }
        }
      });

      const duplicatePaymentId = "pay-dup-audit-test";
      const sampleEvent: AuditEvent = {
        actorId: asUserId("usr-dup-1" as any),
        organizationId: null,
        action: "payment.completed",
        entityType: "payment",
        entityId: duplicatePaymentId,
        createdAt: new Date().toISOString(),
        details: {
          paymentId: duplicatePaymentId,
          orderId: "ord-dup-1",
          amount: 500000,
          productTitle: "دوره فیزیک",
          productType: "course",
          gateway: "zarinpal",
        },
      };

      // Emit event first time
      await auditService.emit([sampleEvent]);
      expect(sentCount).toBe(1);

      // Emit exact duplicate event (e.g. from network retry or duplicate hook)
      await auditService.emit([sampleEvent]);
      // Cooldown in AdminAlertService suppressed duplicate Telegram alert!
      expect(sentCount).toBe(1);
    });
  });

  // =========================================================================
  // 11. Support Ticket Management in TelegramOpsBot & Alerts
  // =========================================================================
  describe("Support Ticket Management in TelegramOpsBot", () => {
    const adminChatId = "629710703";
    const unauthorizedChatId = "999888777";
    const adminUserId = asUserId("00000000-0000-0000-0000-000000000001");
    const normalUserId = asUserId("00000000-0000-0000-0000-000000000002");

    function setupSupportTestEnv() {
      const sentMessages: Array<{ text: string; chatId?: string; replyMarkup?: any }> = [];
      const answeredCallbacks: Array<{ id: string; text?: string }> = [];

      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        getAdminChatId: vi.fn().mockReturnValue(adminChatId),
        sendMessage: vi.fn().mockImplementation(async (text: string, overrideChatId?: string, replyMarkup?: any) => {
          sentMessages.push({ text, chatId: overrideChatId ?? adminChatId, replyMarkup });
          return { sent: true, messageId: sentMessages.length };
        }),
        editMessageText: vi.fn().mockImplementation(async (opts: any) => {
          sentMessages.push({ text: opts.text, chatId: opts.overrideChatId ?? adminChatId, replyMarkup: opts.replyMarkup });
          return { ok: true };
        }),
        answerCallbackQuery: vi.fn().mockImplementation(async (opts: any) => {
          answeredCallbacks.push({ id: opts.callbackQueryId, text: opts.text });
          return { ok: true };
        }),
        setMyCommands: vi.fn().mockResolvedValue({ ok: true }),
      } as unknown as TelegramClient;

      const adminStore = {
        listUsers: vi.fn().mockImplementation(async (params?: any) => {
          if (params?.role === "platform_admin" || params?.search === adminUserId || !params) {
            return {
              totalCount: 1,
              users: [
                {
                  id: adminUserId,
                  email: "admin@avana.test",
                  name: "مدیر سیستم",
                  role: "platform_admin",
                },
              ],
            };
          }
          return { totalCount: 0, users: [] };
        }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const auditStore = new InMemoryAuditStore();
      const auditService = new AuditService(auditStore);
      const supportStore = new InMemorySupportStore();
      const supportService = new SupportService(supportStore, undefined, auditService);

      return {
        mockClient,
        adminStore,
        supportStore,
        supportService,
        auditService,
        sentMessages,
        answeredCallbacks,
      };
    }

    type BotWithPending = { pendingTicketReplies: Map<string, { expiresAt: number; ticketId: string }> };

    it("1. displays ticket counts by status and action buttons on /tickets", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      // Seed 2 open tickets, 1 closed ticket
      const userActor: Actor = { userId: normalUserId, role: "student" };
      await supportService.createTicket(userActor, {
        title: "مشکل در ثبت‌نام",
        category: "account",
        priority: "high",
        description: "سلام، من نمی‌توانم ثبت‌نام کنم.",
      });
      const t2 = await supportService.createTicket(userActor, {
        title: "سوال درباره آزمون",
        category: "exams",
        priority: "medium",
        description: "آیا آزمون جامع نمره منفی دارد؟",
      });
      const adminActor: Actor = { userId: adminUserId, role: "platform_admin" };
      await supportService.updateTicketStatus(adminActor, t2.id, "closed");

      // Send /tickets command
      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 101,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "/tickets",
        },
      });

      expect(sentMessages.length).toBe(1);
      const msg = sentMessages[0];
      expect(msg.text).toContain("مدیریت تیکت‌های پشتیبانی آوانا");
      expect(msg.text).toContain("نیازمند بررسی اولیه (جدید): ۱");
      expect(msg.text).toContain("بسته‌شده: ۱");

      // Check inline buttons
      const buttons = msg.replyMarkup?.inline_keyboard;
      expect(buttons).toBeDefined();
      expect(buttons[0][0].callback_data).toBe("tkt:l:open:1");
      expect(buttons[1][0].callback_data).toBe("tkt:l:closed:1");
    });

    it("2. renders paginated list of tickets and supports page switching", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      // Create 6 tickets to have 2 pages (5 per page)
      for (let i = 1; i <= 6; i++) {
        await supportService.createTicket(userActor, {
          title: `تیکت شماره ${i}`,
          category: "courses",
          description: `متن تیکت پشتیبانی شماره ${i}`,
        });
      }

      // Click open tickets list page 1
      await bot.handleUpdate({
        update_id: 2,
        callback_query: {
          id: "cq-1",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          message: {
            message_id: 102,
            date: Math.floor(Date.now() / 1000),
            chat: { id: Number(adminChatId), type: "private" },
            text: "menu",
          },
          data: "tkt:l:open:1",
        },
      });

      expect(sentMessages.length).toBe(1);
      const page1Msg = sentMessages[0];
      expect(page1Msg.text).toContain("فهرست تیکت‌های باز");
      expect(page1Msg.text).toContain("صفحه ۱ از ۲");
      expect(page1Msg.text).toContain("تیکت شماره");

      // Check next page button is present
      const navRow = page1Msg.replyMarkup?.inline_keyboard?.find((r: Array<{ callback_data?: string }>) =>
        r.some((b: { callback_data?: string }) => b.callback_data === "tkt:l:open:2"),
      );
      expect(navRow).toBeDefined();

      // Click page 2
      await bot.handleUpdate({
        update_id: 3,
        callback_query: {
          id: "cq-2",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          message: {
            message_id: 103,
            date: Math.floor(Date.now() / 1000),
            chat: { id: Number(adminChatId), type: "private" },
            text: "page1",
          },
          data: "tkt:l:open:2",
        },
      });

      expect(sentMessages.length).toBe(2);
      const page2Msg = sentMessages[1];
      expect(page2Msg.text).toContain("صفحه ۲ از ۲");
    });

    it("3. renders empty state when no tickets in selected status", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      // No tickets in closed status
      await bot.handleUpdate({
        update_id: 4,
        callback_query: {
          id: "cq-empty",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          message: {
            message_id: 104,
            date: Math.floor(Date.now() / 1000),
            chat: { id: Number(adminChatId), type: "private" },
            text: "list",
          },
          data: "tkt:l:closed:1",
        },
      });

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].text).toContain("هیچ تیکتی در این وضعیت وجود ندارد");
    });

    it("4. displays ticket details with chronological conversation history without duplicating initial description", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const initialDesc = "این متن پیام اولیه کاربر است.";
      const ticket = await supportService.createTicket(userActor, {
        title: "بررسی قطعی دسترسی",
        category: "technical",
        priority: "high",
        description: initialDesc,
      });

      // Admin replies from web
      const adminActor: Actor = { userId: adminUserId, role: "platform_admin" };
      await supportService.sendAdminMessage(adminActor, ticket.id, {
        body: "پاسخ پشتیبانی: دسترسی بررسی شد.",
      });

      // User replies
      await supportService.sendUserMessage(userActor, ticket.id, {
        body: "ممنون، مشکل حل شد.",
      });

      // Click to view ticket details: tkt:v:<id>
      await bot.handleUpdate({
        update_id: 5,
        callback_query: {
          id: "cq-view",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          message: {
            message_id: 105,
            date: Math.floor(Date.now() / 1000),
            chat: { id: Number(adminChatId), type: "private" },
            text: "ticket-item",
          },
          data: `tkt:v:${ticket.id}`,
        },
      });

      expect(sentMessages.length).toBe(1);
      const detailsMsg = sentMessages[0].text;
      expect(detailsMsg).toContain("جزئیات تیکت پشتیبانی");
      expect(detailsMsg).toContain("بررسی قطعی دسترسی");
      expect(detailsMsg).toContain("این متن پیام اولیه کاربر است.");
      expect(detailsMsg).toContain("پاسخ پشتیبانی: دسترسی بررسی شد.");
      expect(detailsMsg).toContain("ممنون، مشکل حل شد.");

      // Verify that initial description appears only once in conversation history
      const occurrences = (detailsMsg.match(/این متن پیام اولیه کاربر است/g) || []).length;
      expect(occurrences).toBe(1);
    });

    it("5. truncates very long conversation history to respect Telegram 4096 character limit", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const longText = "الف".repeat(1000);
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت با متون طولانی",
        category: "technical",
        description: longText,
      });

      // Add 4 more long messages
      for (let i = 0; i < 4; i++) {
        await supportService.sendUserMessage(userActor, ticket.id, {
          body: `پیام طولانی ${i}: ${"ب".repeat(800)}`,
        });
      }

      await bot.handleUpdate({
        update_id: 6,
        callback_query: {
          id: "cq-long",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:v:${ticket.id}`,
        },
      });

      expect(sentMessages.length).toBe(1);
      // Ensure delivered message length is strictly <= 4096 (under safety threshold of 3900)
      expect(sentMessages[0].text.length).toBeLessThanOrEqual(4000);
    });

    it("6. starts reply session and successfully sends admin response via supportService.sendAdminMessage", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "نیاز به راهنمایی",
        category: "account",
        description: "لطفاً حساب من را فعال کنید.",
      });

      // 1. Admin clicks Reply button: tkt:r:<id>
      await bot.handleUpdate({
        update_id: 7,
        callback_query: {
          id: "cq-reply-click",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          message: {
            message_id: 107,
            date: Math.floor(Date.now() / 1000),
            chat: { id: Number(adminChatId), type: "private" },
            text: "view",
          },
          data: `tkt:r:${ticket.id}`,
        },
      });

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].text).toContain("ارسال پاسخ به تیکت پشتیبانی");
      expect(sentMessages[0].text).toContain("مهلت ارسال: ۱۰ دقیقه");
      expect(sentMessages[0].replyMarkup?.inline_keyboard[0][0].callback_data).toBe("tkt:cr");

      // 2. Admin sends response text
      const replyBody = "حساب کاربری شما با موفقیت فعال گردید.";
      await bot.handleUpdate({
        update_id: 8,
        message: {
          message_id: 108,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: replyBody,
        },
      });

      // Two more messages sent: success notification, and refreshed ticket details
      expect(sentMessages.length).toBe(3);
      expect(sentMessages[1].text).toContain("پاسخ شما با موفقیت ثبت شد");
      expect(sentMessages[2].text).toContain("جزئیات تیکت پشتیبانی");
      expect(sentMessages[2].text).toContain(replyBody);

      // Verify canonical state in supportService: ticket status is now answered
      const adminActor: Actor = { userId: adminUserId, role: "platform_admin" };
      const refreshed = await supportService.getTicketDetails(adminActor, ticket.id);
      expect(refreshed.status).toBe("answered");
      expect(refreshed.messages?.some((m) => m.body === replyBody && m.senderRole === "admin")).toBe(true);
    });

    it("7. fails reply if non-text message is sent and retains pending session", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت تست فایل",
        category: "payment",
        description: "رسید پرداخت ضمیمه شد.",
      });

      // Start reply session
      await bot.handleUpdate({
        update_id: 9,
        callback_query: {
          id: "cq-r-2",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:r:${ticket.id}`,
        },
      });

      // Send non-text message (e.g. photo or empty text)
      await bot.handleUpdate({
        update_id: 10,
        message: {
          message_id: 110,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "", // empty text
        },
      });

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].text).toContain("لطفاً پاسخ خود را فقط به صورت متن");

      // Verify pending session was NOT lost: next text message should successfully submit
      await bot.handleUpdate({
        update_id: 11,
        message: {
          message_id: 111,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "پاسخ متنی اصلاح‌شده",
        },
      });

      expect(sentMessages.length).toBe(4);
      expect(sentMessages[2].text).toContain("پاسخ شما با موفقیت ثبت شد");
    });

    it("8. cleans up expired reply session after 10 minutes TTL", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت انقضا",
        category: "other",
        description: "متن توضیحات تیکت آزمایشی",
      });

      await bot.handleUpdate({
        update_id: 12,
        callback_query: {
          id: "cq-exp",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:r:${ticket.id}`,
        },
      });

      // Manually simulate expiration by setting expiresAt in the past
      const pendingMap = (bot as unknown as BotWithPending).pendingTicketReplies;
      const pending = pendingMap.get(adminChatId);
      expect(pending).toBeDefined();
      if (pending) {
        pending.expiresAt = Date.now() - 1000; // Expired 1 second ago
      }

      // Try sending message after expiration
      await bot.handleUpdate({
        update_id: 13,
        message: {
          message_id: 113,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "متن دیررسیده",
        },
      });

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].text).toContain("مهلت زمانی پاسخ به این تیکت (۱۰ دقیقه) به پایان رسیده است");
      expect(pendingMap.has(adminChatId)).toBe(false);
    });

    it("9. cancels reply session explicitly with /cancel command and with tkt:cr button", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت لغو",
        category: "other",
        description: "متن توضیحات تیکت آزمایشی",
      });

      // 1. Cancel via /cancel command
      await bot.handleUpdate({
        update_id: 14,
        callback_query: {
          id: "cq-cancel-1",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:r:${ticket.id}`,
        },
      });

      await bot.handleUpdate({
        update_id: 15,
        message: {
          message_id: 115,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "/cancel",
        },
      });

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].text).toContain("عملیات پاسخ به تیکت لغو شد");

      // 2. Cancel via tkt:cr inline button
      await bot.handleUpdate({
        update_id: 16,
        callback_query: {
          id: "cq-cancel-2",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:r:${ticket.id}`,
        },
      });

      await bot.handleUpdate({
        update_id: 17,
        callback_query: {
          id: "cq-cancel-btn",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: "tkt:cr",
        },
      });

      expect(sentMessages.length).toBe(4);
      expect(sentMessages[3].text).toContain("عملیات پاسخ به تیکت لغو شد");
      expect((bot as unknown as BotWithPending).pendingTicketReplies.has(adminChatId)).toBe(false);
    });

    it("10. cancels pending reply session when a new command like /status or /tickets is invoked", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت تست جابجایی دستور",
        category: "courses",
        description: "متن توضیحات تیکت آزمایشی",
      });

      // Start reply
      await bot.handleUpdate({
        update_id: 18,
        callback_query: {
          id: "cq-new-cmd",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:r:${ticket.id}`,
        },
      });
      expect((bot as unknown as BotWithPending).pendingTicketReplies.has(adminChatId)).toBe(true);

      // Invoke /status command instead of replying
      await bot.handleUpdate({
        update_id: 19,
        message: {
          message_id: 119,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "/status",
        },
      });

      // Pending reply session was cleared and /status was rendered
      expect((bot as unknown as BotWithPending).pendingTicketReplies.has(adminChatId)).toBe(false);
      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].text).toContain("وضعیت کلی سیستم آوانا");
    });

    it("11. retains pending session and provides clear error when recording admin response fails", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      // Spy and make sendAdminMessage reject once
      vi.spyOn(supportService, "sendAdminMessage").mockRejectedValueOnce(new Error("Database connection lost"));

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت تست خطا",
        category: "payment",
        description: "متن توضیحات تیکت آزمایشی",
      });

      // Start reply
      await bot.handleUpdate({
        update_id: 20,
        callback_query: {
          id: "cq-err",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:r:${ticket.id}`,
        },
      });

      // Send text
      await bot.handleUpdate({
        update_id: 21,
        message: {
          message_id: 121,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "پاسخ اول ناموفق",
        },
      });

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[1].text).toContain("خطا در ثبت پاسخ");
      expect(sentMessages[1].text).toContain("وضعیت پاسخگویی برای این تیکت همچنان فعال است");

      // State is still active
      expect((bot as unknown as BotWithPending).pendingTicketReplies.has(adminChatId)).toBe(true);

      // Now retry, and it succeeds
      await bot.handleUpdate({
        update_id: 22,
        message: {
          message_id: 122,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(adminChatId), type: "private" },
          text: "پاسخ دوم موفق",
        },
      });

      expect(sentMessages.length).toBe(4);
      expect(sentMessages[2].text).toContain("پاسخ شما با موفقیت ثبت شد");
      expect((bot as unknown as BotWithPending).pendingTicketReplies.has(adminChatId)).toBe(false);
    });

    it("12. supports independent reply session state for different chats", async () => {
      const { mockClient, adminStore, supportStore, supportService } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const map = (bot as unknown as BotWithPending).pendingTicketReplies;
      map.set("chat-1", { ticketId: "uuid-1", expiresAt: Date.now() + 60000 });
      map.set("chat-2", { ticketId: "uuid-2", expiresAt: Date.now() + 60000 });

      expect(map.get("chat-1")?.ticketId).toBe("uuid-1");
      expect(map.get("chat-2")?.ticketId).toBe("uuid-2");

      map.delete("chat-1");
      expect(map.has("chat-1")).toBe(false);
      expect(map.has("chat-2")).toBe(true);
    });

    it("13. silently ignores unauthorized chats for /tickets and ticket callbacks", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      // Unauthorized chat sends /tickets
      await bot.handleUpdate({
        update_id: 23,
        message: {
          message_id: 123,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(unauthorizedChatId), type: "private" },
          text: "/tickets",
        },
      });

      // Unauthorized chat sends callback
      await bot.handleUpdate({
        update_id: 24,
        callback_query: {
          id: "cq-unauth",
          from: { id: Number(unauthorizedChatId), is_bot: false, first_name: "Hacker" },
          message: {
            message_id: 124,
            date: Math.floor(Date.now() / 1000),
            chat: { id: Number(unauthorizedChatId), type: "private" },
            text: "view",
          },
          data: "tkt:l:open:1",
        },
      });

      // Zero messages sent to unauthorized chat
      expect(sentMessages.length).toBe(0);
    });

    it("14. safely handles invalid/forged UUID and callback data", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages, answeredCallbacks } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      // Forged non-UUID callback: tkt:v:not-a-valid-uuid
      await bot.handleUpdate({
        update_id: 25,
        callback_query: {
          id: "cq-forged",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: "tkt:v:not-a-valid-uuid",
        },
      });

      expect(answeredCallbacks.some((c) => c.id === "cq-forged")).toBe(true);
      expect(sentMessages.length).toBe(0); // Safely dropped
    });

    it("15. closes ticket canonically via supportService.updateTicketStatus and explains invalid transition", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت برای بستن",
        category: "account",
        description: "این تیکت باید بسته شود.",
      });

      // Click Close ticket button: tkt:c:<id>
      await bot.handleUpdate({
        update_id: 26,
        callback_query: {
          id: "cq-close",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:c:${ticket.id}`,
        },
      });

      expect(sentMessages.length).toBe(2);
      expect(sentMessages[0].text).toContain("با موفقیت بسته شد");
      expect(sentMessages[1].text).toContain("بسته شده");

      // Verify canonical state
      const adminActor: Actor = { userId: adminUserId, role: "platform_admin" };
      const closed = await supportService.getTicketDetails(adminActor, ticket.id);
      expect(closed.status).toBe("closed");

      // Clicking close again informs admin it is already closed
      await bot.handleUpdate({
        update_id: 27,
        callback_query: {
          id: "cq-close-again",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:c:${ticket.id}`,
        },
      });

      expect(sentMessages.length).toBe(3);
      expect(sentMessages[2].text).toContain("این تیکت قبلاً بسته شده است");
    });

    it("16. blocks sending replies to closed tickets", async () => {
      const { mockClient, adminStore, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore,
        supportStore,
        supportService,
        adminUserId,
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت بسته شده",
        category: "technical",
        description: "متن توضیحات تیکت آزمایشی",
      });
      const adminActor: Actor = { userId: adminUserId, role: "platform_admin" };
      await supportService.updateTicketStatus(adminActor, ticket.id, "closed");

      // Attempt to reply to closed ticket
      await bot.handleUpdate({
        update_id: 28,
        callback_query: {
          id: "cq-rep-closed",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:r:${ticket.id}`,
        },
      });

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].text).toContain("این تیکت بسته شده است و امکان ارسال پاسخ به آن وجود ندارد");
      expect((bot as unknown as BotWithPending).pendingTicketReplies.has(adminChatId)).toBe(false);
    });

    it("17. sends alert on support ticket creation with inline button to view ticket", async () => {
      const sentAlerts: Array<{ text: string; replyMarkup?: TelegramInlineKeyboardMarkup }> = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        getAdminChatId: vi.fn().mockReturnValue(adminChatId),
        sendMessage: vi.fn().mockImplementation(async (text: string, _override?: string, replyMarkup?: TelegramInlineKeyboardMarkup) => {
          sentAlerts.push({ text, replyMarkup });
          return { sent: true };
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      const ticketId = randomUUID();
      const res = await alertService.notifySupportTicketCreated({
        ticketId,
        title: "خطا در بارگذاری دوره‌ها",
        category: "courses",
        priority: "high",
        userName: "محمد رضایی",
      });

      expect(res).toBe(true);
      expect(sentAlerts.length).toBe(1);
      expect(sentAlerts[0].text).toContain("تیکت پشتیبانی جدید");
      expect(sentAlerts[0].text).toContain("خطا در بارگذاری دوره‌ها");
      expect(sentAlerts[0].text).toContain("محمد رضایی");
      expect(sentAlerts[0].text).toContain("دوره‌های آموزشی");
      expect(sentAlerts[0].replyMarkup?.inline_keyboard[0][0].callback_data).toBe(`tkt:v:${ticketId}`);
    });

    it("18. sends alert on support ticket reply with inline button to view ticket", async () => {
      const sentAlerts: Array<{ text: string; replyMarkup?: TelegramInlineKeyboardMarkup }> = [];
      const mockClient = {
        isConfigured: vi.fn().mockReturnValue(true),
        getAdminChatId: vi.fn().mockReturnValue(adminChatId),
        sendMessage: vi.fn().mockImplementation(async (text: string, _override?: string, replyMarkup?: TelegramInlineKeyboardMarkup) => {
          sentAlerts.push({ text, replyMarkup });
          return { sent: true };
        }),
      } as unknown as TelegramClient;

      const alertService = new AdminAlertService({
        enabled: true,
        telegramClient: mockClient,
      });

      const ticketId = randomUUID();
      const res = await alertService.notifySupportTicketUserReplied({
        ticketId,
        title: "مشکل ورود به سایت",
        userName: "سارا احمدی",
        snippet: "کد تأیید پیامک نمی‌شود.",
      });

      expect(res).toBe(true);
      expect(sentAlerts.length).toBe(1);
      expect(sentAlerts[0].text).toContain("پاسخ جدید در تیکت پشتیبانی");
      expect(sentAlerts[0].text).toContain("سارا احمدی");
      expect(sentAlerts[0].text).toContain("کد تأیید پیامک نمی‌شود.");
      expect(sentAlerts[0].replyMarkup?.inline_keyboard[0][0].callback_data).toBe(`tkt:v:${ticketId}`);
    });

    it("19. failure in alerting does not fail ticket creation in supportService", async () => {
      const { auditService, supportStore } = setupSupportTestEnv();

      // Listen to auditService and simulate a crashing alert handler
      auditService.addListener(() => {
        throw new Error("Telegram API Network Failure");
      });

      const service = new SupportService(supportStore, undefined, auditService);
      const userActor: Actor = { userId: normalUserId, role: "student" };

      // Ticket creation MUST succeed even if audit listener fails
      const ticket = await service.createTicket(userActor, {
        title: "تیکت مقاوم به خطای اعلان",
        category: "technical",
        description: "این تیکت حتی اگر تلگرام قطع باشد باید با موفقیت ثبت شود.",
      });

      expect(ticket).toBeDefined();
      expect(ticket.id).toBeDefined();
      expect(ticket.title).toBe("تیکت مقاوم به خطای اعلان");
    });

    it("20. strictly requires valid platform_admin actor and denies execution if no admin exists", async () => {
      const { mockClient, supportStore, supportService, sentMessages } = setupSupportTestEnv();
      const { TelegramOpsBot } = await import("../observability/telegram-ops-bot.js");

      // Empty adminStore with no platform_admin user
      const emptyAdminStore = {
        listUsers: vi.fn().mockResolvedValue({ totalCount: 0, users: [] }),
      } as unknown as import("../modules/admin/admin-store.js").AdminStore;

      const bot = new TelegramOpsBot({
        enabled: true,
        botToken: "test-token",
        adminChatId,
        telegramClient: mockClient,
        adminStore: emptyAdminStore,
        supportStore,
        supportService,
        adminUserId: undefined, // No admin user configured or in DB
      });

      const userActor: Actor = { userId: normalUserId, role: "student" };
      const ticket = await supportService.createTicket(userActor, {
        title: "تیکت تست دسترسی",
        category: "other",
        description: "متن توضیحات تیکت آزمایشی",
      });

      // Attempt to view ticket
      await bot.handleUpdate({
        update_id: 29,
        callback_query: {
          id: "cq-no-admin",
          from: { id: Number(adminChatId), is_bot: false, first_name: "Admin" },
          data: `tkt:v:${ticket.id}`,
        },
      });

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].text).toContain("هیچ حساب کاربری معتبری با نقش مدیر ارشد (platform_admin)");
    });
  });
});
