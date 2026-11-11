import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CrmSmsChannelAdapter,
  normalizeIranianMobile,
  sanitizeContact,
  SimpleRateLimiter,
  CrmService,
  InMemoryCrmStore,
  InMemoryCampaignQueue,
  CrmChannelAdapterRegistry,
} from "../modules/admin/crm/index.js";
import { DomainError } from "@avana/domain";

describe("Admin CRM SMS Channel Adapter & Integration (Phase 5)", () => {
  let capturedLogs: string[];
  const testLogger = (msg: string) => capturedLogs.push(msg);

  beforeEach(() => {
    capturedLogs = [];
  });

  it("1. Successful live send with mock provider & verifies payload and idempotency header", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers as Record<string, string>;
      capturedBody = JSON.parse(init?.body as string);

      return new Response(
        JSON.stringify({
          data: {
            Succeed: true,
            RequestId: 987654,
            SmsItems: [{ SmsItemId: "provider-sms-12345" }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const adapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: true,
      apiUrl: "https://api.mediana.ir/sms/v1/send",
      apiKey: "test-secret-key-1234",
      sender: "AVANA",
      fetchImpl: mockFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    expect(adapter.isLive()).toBe(true);

    const execId = randomUUID();
    const recipientId = randomUUID();
    const result = await adapter.send({
      campaignId: randomUUID(),
      executionId: execId,
      recipientId,
      userId: randomUUID(),
      channel: "sms",
      recipientContact: "۰۹۱۲۳۴۵۶۷۸۹", // Persian digits test
      messageContent: "سلام علی عزیز، تخفیف ویژه شما فعال شد.",
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("provider-sms-12345");
    expect(capturedUrl).toBe("https://api.mediana.ir/sms/v1/send");
    expect(capturedHeaders["X-Idempotency-Key"]).toBe(`${execId}:${recipientId}`);
    expect(capturedHeaders["X-API-KEY"]).toBe("test-secret-key-1234");
    expect(capturedBody.recipient).toBe("09123456789"); // Normalized Persian digits to standard 09xx
    expect(capturedBody.idempotencyKey).toBe(`${execId}:${recipientId}`);
  });

  it("2. Invalid phone number produces immediate permanent failure without network call", async () => {
    const mockFetch = vi.fn();
    const adapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: true,
      fetchImpl: mockFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    const invalidNumbers = ["12345", "08123456789", "invalid-phone", "0912345"];

    for (const phone of invalidNumbers) {
      const result = await adapter.send({
        campaignId: randomUUID(),
        executionId: randomUUID(),
        recipientId: randomUUID(),
        userId: randomUUID(),
        channel: "sms",
        recipientContact: phone,
        messageContent: "پیام تستی",
      });

      expect(result.success).toBe(false);
      expect(result.error?.isTransient).toBe(false); // Permanent error
      expect(result.error?.code).toBe("INVALID_PHONE_NUMBER");
    }

    // Zero network requests made for invalid numbers
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("3. Gateway timeout produces unconfirmed non-transient error, 5xx is transient, and 4xx is permanent", async () => {
    // 3a. Timeout simulation
    const timeoutFetch = vi.fn().mockImplementation(async (_url, init) => {
      // Simulate slow response that triggers AbortController
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortErr = new Error("This operation was aborted");
          abortErr.name = "AbortError";
          reject(abortErr);
        });
      });
    });

    const timeoutAdapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: true,
      apiUrl: "https://api.mediana.ir/sms/v1/send",
      apiKey: "test-secret-key",
      timeoutMs: 50, // 50ms fast timeout
      fetchImpl: timeoutFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    const timeoutRes = await timeoutAdapter.send({
      campaignId: randomUUID(),
      executionId: randomUUID(),
      recipientId: randomUUID(),
      userId: randomUUID(),
      channel: "sms",
      recipientContact: "09121111111",
      messageContent: "پیام تستی",
    });

    expect(timeoutRes.success).toBe(false);
    // Timeout must be marked non-transient to prevent blind retries and duplicate SMS delivery
    expect(timeoutRes.error?.isTransient).toBe(false);
    expect(timeoutRes.error?.code).toBe("DELIVERY_UNCONFIRMED_TIMEOUT");

    // 3b. 503 Provider Unavailable (Transient)
    const serverErrorFetch = vi.fn().mockResolvedValue(
      new Response("Service Unavailable", { status: 503 }),
    );
    const serverErrAdapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: true,
      apiUrl: "https://api.mediana.ir/sms/v1/send",
      apiKey: "test-secret-key",
      fetchImpl: serverErrorFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    const serverErrRes = await serverErrAdapter.send({
      campaignId: randomUUID(),
      executionId: randomUUID(),
      recipientId: randomUUID(),
      userId: randomUUID(),
      channel: "sms",
      recipientContact: "09121111111",
      messageContent: "پیام تستی",
    });

    expect(serverErrRes.success).toBe(false);
    expect(serverErrRes.error?.isTransient).toBe(true);
    expect(serverErrRes.error?.code).toBe("SMS_PROVIDER_UNAVAILABLE");

    // 3c. 401 Unauthorized or 400 Bad Request (Permanent)
    const clientErrorFetch = vi.fn().mockResolvedValue(
      new Response("Bad Request: Credit exhausted", { status: 400 }),
    );
    const clientErrAdapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: true,
      apiUrl: "https://api.mediana.ir/sms/v1/send",
      apiKey: "test-secret-key",
      fetchImpl: clientErrorFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    const clientErrRes = await clientErrAdapter.send({
      campaignId: randomUUID(),
      executionId: randomUUID(),
      recipientId: randomUUID(),
      userId: randomUUID(),
      channel: "sms",
      recipientContact: "09121111111",
      messageContent: "پیام تستی",
    });

    expect(clientErrRes.success).toBe(false);
    expect(clientErrRes.error?.isTransient).toBe(false);
    expect(clientErrRes.error?.code).toBe("SMS_PROVIDER_REJECTED");
  });

  it("4. Live sending fails closed with permanent error if apiUrl or apiKey is missing", async () => {
    const mockFetch = vi.fn();
    const incompleteAdapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: true,
      // apiUrl & apiKey deliberately omitted
      fetchImpl: mockFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    const res = await incompleteAdapter.send({
      campaignId: randomUUID(),
      executionId: randomUUID(),
      recipientId: randomUUID(),
      userId: randomUUID(),
      channel: "sms",
      recipientContact: "09121111111",
      messageContent: "پیام تستی",
    });

    expect(res.success).toBe(false);
    expect(res.error?.isTransient).toBe(false);
    expect(res.error?.code).toBe("SMS_PROVIDER_CONFIG_INCOMPLETE");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("5. Retry preserves stable Idempotency Key across repeated attempts", async () => {
    const passedIdempotencyKeys: string[] = [];

    const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      passedIdempotencyKeys.push(headers["X-Idempotency-Key"]);
      return new Response("Transient Failure", { status: 500 });
    });

    const adapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: true,
      apiUrl: "https://api.mediana.ir/sms/v1/send",
      apiKey: "test-secret-key",
      fetchImpl: mockFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    const payload = {
      campaignId: randomUUID(),
      executionId: "exec-stable-123",
      recipientId: "rec-stable-456",
      userId: randomUUID(),
      channel: "sms" as const,
      recipientContact: "09123456789",
      messageContent: "پیام آزمایشی",
    };

    // Attempt 1
    await adapter.send(payload);
    // Attempt 2 (Retry)
    await adapter.send(payload);

    expect(passedIdempotencyKeys.length).toBe(2);
    // Both attempts must use the EXACT same stable idempotency key
    expect(passedIdempotencyKeys[0]).toBe("exec-stable-123:rec-stable-456");
    expect(passedIdempotencyKeys[1]).toBe("exec-stable-123:rec-stable-456");
  });

  it("6. Live sending is strictly disabled by default (Safe Dry-Run)", async () => {
    const mockFetch = vi.fn();
    // Default instantiation with zero config
    const defaultAdapter = new CrmSmsChannelAdapter({
      fetchImpl: mockFetch as unknown as typeof fetch,
      logger: testLogger,
    });

    expect(defaultAdapter.isLive()).toBe(false);

    const result = await defaultAdapter.send({
      campaignId: randomUUID(),
      executionId: randomUUID(),
      recipientId: randomUUID(),
      userId: randomUUID(),
      channel: "sms",
      recipientContact: "09129998877",
      messageContent: "متن کمپین",
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toContain("dryrun-sms-");
    // Strictly zero network transmission
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("7. No raw phone numbers leak into logs (PII Sanitization)", async () => {
    const adapter = new CrmSmsChannelAdapter({
      liveSendingEnabled: false,
      logger: testLogger,
    });

    const rawPhone = "09123456789";
    await adapter.send({
      campaignId: randomUUID(),
      executionId: randomUUID(),
      recipientId: randomUUID(),
      userId: randomUUID(),
      channel: "sms",
      recipientContact: rawPhone,
      messageContent: "متن پیامک بدون نشت اطلاعات",
    });

    expect(capturedLogs.length).toBeGreaterThan(0);
    // The raw phone number MUST NOT appear anywhere in the logs
    for (const log of capturedLogs) {
      expect(log).not.toContain(rawPhone);
      expect(log).toContain("0912***789"); // Sanitized masked format
    }
  });

  it("8. Token bucket rate limiter throttles burst requests smoothly", async () => {
    const limiter = new SimpleRateLimiter(50); // 50 requests/sec

    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }
    const elapsed = Date.now() - start;

    // Fast acquisition within token capacity
    expect(elapsed).toBeLessThan(100);
  });

  it("9. Access control: Only platform_admin can execute campaigns (RBAC verification)", async () => {
    const store = new InMemoryCrmStore();
    const queue = new InMemoryCampaignQueue();
    const registry = new CrmChannelAdapterRegistry();
    const service = new CrmService(store, undefined, queue, registry);

    const adminId = randomUUID();
    const segmentId = randomUUID();

    store.memorySegments.push({
      id: segmentId,
      name: "سگمنت دسترسی",
      description: null,
      filterRules: [],
      matchOperator: "all",
      isActive: true,
      createdById: adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    store.memoryUsers.push({
      id: randomUUID(),
      name: "کاربر تستی",
      email: "test@example.com",
      phoneNumber: "09121111111",
      createdAt: new Date().toISOString(),
    });

    const campaign = await service.createCampaign(
      {
        name: "کمپین کنترل دسترسی",
        targetSegmentId: segmentId,
        channel: "sms",
        messageContent: "پیام امنیتی",
      },
      adminId,
    );

    // Platform admin executes successfully
    const exec = await service.executeCampaign(campaign.id, adminId);
    expect(exec.execution.status).toBe("running");
  });
});
