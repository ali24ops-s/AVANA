// @ts-nocheck
/**
 * ArvanCloudModelGateway unit tests.
 *
 * Tests:
 * - Decoupled Machine User API Key and Model Gateway Endpoint
 * - Authorization header formatting ("apikey <MACHINE_USER_KEY>")
 * - Gateway Base URL with /chat/completions suffix
 * - OpenAI chat completions request formatting and response handling
 * - Clean token usage extraction (prompt_tokens, completion_tokens)
 * - Markdown code fence stripping and JSON parsing
 * - Missing ARVANCLOUD_API_KEY handling
 * - API error responses (401, 403, 429 rate limit, 50x server errors)
 * - Controlled retry on transient 50x errors
 * - Timeout handling via AbortController
 * - Zero API key/identifier leakage assertion in error messages, URLs, and network notices
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DomainError } from "@avana/domain";
import {
  ArvanCloudModelGateway,
  DEFAULT_ARVANCLOUD_MODEL,
  DEFAULT_ARVANCLOUD_BASE_URL,
  cleanAndParseArvanCloudJson,
  buildArvanCloudChatUrl,
} from "./arvancloud.js";
import { createModelGateway } from "./index.js";
import type { CompletionRequest } from "./types.js";

const FAKE_MACHINE_USER_KEY = "02d1b6be-b8f9-56d1-bb12-599fe2b53500";
const FAKE_GATEWAY_URL = "https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/gw-ident-abc-123/v1";

function createMockCompletionRequest(
  overrides?: Partial<CompletionRequest>,
): CompletionRequest {
  return {
    promptVersion: "v1",
    messages: [
      { role: "system", content: "You are a medical pharmacology expert." },
      { role: "user", content: "Generate 1 lesson about Beta Blockers." },
    ],
    correlationId: "corr-arvan-1",
    organizationId: "org-test-1" as any,
    documentId: "doc-test-1" as any,
    ...overrides,
  };
}

function mockOpenAIResponse(
  contentString: string,
  model = "DeepSeek-V4-Flash",
  usage = { prompt_tokens: 55, completion_tokens: 120, total_tokens: 175 },
) {
  return {
    id: "chatcmpl-arvan-123",
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: contentString,
        },
        finish_reason: "stop",
      },
    ],
    usage,
  };
}

describe("ArvanCloudModelGateway Unit Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ARVANCLOUD_API_TOKEN;
    delete process.env.ARVANCLOUD_API_KEY;
    delete process.env.ARVANCLOUD_MODEL;
    delete process.env.ARVANCLOUD_BASE_URL;
    delete process.env.ARVANCLOUD_AUTH_SCHEME;
    delete process.env.AI_PRIMARY_PROVIDER;
    delete process.env.AI_CONTENT_PROVIDER;
    delete process.env.AI_PROVIDER;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("throws DomainError if API key is missing", () => {
    delete process.env.ARVANCLOUD_API_KEY;
    expect(() => new ArvanCloudModelGateway({ apiKey: "" })).toThrow(DomainError);
    expect(() => new ArvanCloudModelGateway({ apiKey: "   " })).toThrow(
      "ARVANCLOUD_API_KEY is required when AI_PRIMARY_PROVIDER is 'arvancloud'",
    );
  });

  it("exposes the 'arvancloud' provider identifier and default model", () => {
    const gateway = new ArvanCloudModelGateway({ apiKey: FAKE_MACHINE_USER_KEY });
    expect(gateway.provider).toBe("arvancloud");
    expect(gateway.model).toBe("DeepSeek-V4-Flash");
    expect(DEFAULT_ARVANCLOUD_MODEL).toBe("DeepSeek-V4-Flash");
    expect(DEFAULT_ARVANCLOUD_BASE_URL).toBe(
      "https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash",
    );
  });

  it("builds correct URL by appending /chat/completions to Model Gateway Base URL", () => {
    const url1 = buildArvanCloudChatUrl(FAKE_GATEWAY_URL);
    expect(url1).toBe(
      "https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/gw-ident-abc-123/v1/chat/completions",
    );

    const url2 = buildArvanCloudChatUrl("https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/chat/completions");
    expect(url2).toBe(
      "https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/chat/completions",
    );
  });

  it("sends correct HTTP POST request to ArvanCloud endpoint with apikey auth and decoupled base URL", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      capturedUrl = url;
      capturedMethod = opts.method || "GET";
      capturedHeaders = (opts.headers || {}) as Record<string, string>;
      capturedBody = JSON.parse(opts.body as string);

      const fakeData = mockOpenAIResponse(
        JSON.stringify({
          kind: "lesson",
          title: "Introduction to Beta Blockers",
          contentMarkdown: "# Beta Blockers\nDetails...",
          citationChunkIds: ["chunk-1"],
        }),
      );

      return new Response(JSON.stringify(fakeData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      baseUrl: FAKE_GATEWAY_URL,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const req = createMockCompletionRequest();
    const result = await gateway.complete(req);

    expect(capturedUrl).toBe(
      "https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/gw-ident-abc-123/v1/chat/completions",
    );
    expect(capturedMethod).toBe("POST");
    expect(capturedHeaders["Authorization"]).toBe(`apikey ${FAKE_MACHINE_USER_KEY}`);
    expect(capturedHeaders["Content-Type"]).toBe("application/json");

    expect(capturedBody.model).toBe("DeepSeek-V4-Flash");
    expect(capturedBody.messages).toHaveLength(2);
    expect(capturedBody.messages[0].role).toBe("system");
    expect(capturedBody.messages[1].role).toBe("user");

    expect(result.model).toBe("DeepSeek-V4-Flash");
    expect(result.usage.inputTokens).toBe(55);
    expect(result.usage.outputTokens).toBe(120);
    expect(result.finishReason).toBe("stop");
    expect(result.text).toContain("Introduction to Beta Blockers");
  });

  it("supports Bearer scheme when configured via authScheme", async () => {
    let capturedAuth = "";

    const mockFetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      capturedAuth = (opts.headers as any)["Authorization"];
      return new Response(JSON.stringify(mockOpenAIResponse("output 1")), { status: 200 });
    });

    const gw = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      authScheme: "Bearer",
      fetchFn: mockFetch as any,
    });
    await gw.complete(createMockCompletionRequest());
    expect(capturedAuth).toBe(`Bearer ${FAKE_MACHINE_USER_KEY}`);
  });

  it("applies response_format: { type: 'json_object' } when jsonSchema is requested", async () => {
    let capturedBody: any = null;
    const mockFetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string);
      return new Response(
        JSON.stringify(
          mockOpenAIResponse(
            JSON.stringify({ kind: "lesson", title: "JSON Schema Test" }),
          ),
        ),
        { status: 200 },
      );
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await gateway.complete(
      createMockCompletionRequest({ jsonSchema: { type: "object" } }),
    );

    expect(capturedBody.response_format).toEqual({ type: "json_object" });
  });

  it("handles markdown code fence wrapping in JSON cleaner cleanAndParseArvanCloudJson", () => {
    const rawWithFence = "```json\n{\n  \"kind\": \"lesson\",\n  \"title\": \"Wrapped in Fences\"\n}\n```";
    const parsed = cleanAndParseArvanCloudJson<{ kind: string; title: string }>(rawWithFence);
    expect(parsed.kind).toBe("lesson");
    expect(parsed.title).toBe("Wrapped in Fences");

    const rawWithGenericFence = "```\n{\n  \"kind\": \"lesson\",\n  \"title\": \"Generic Fence\"\n}\n```";
    const parsedGeneric = cleanAndParseArvanCloudJson<{ title: string }>(rawWithGenericFence);
    expect(parsedGeneric.title).toBe("Generic Fence");

    const rawWithTrailingComma = "{\n  \"items\": [1, 2, 3,],\n  \"done\": true,\n}";
    const parsedTrailing = cleanAndParseArvanCloudJson<{ items: number[]; done: boolean }>(rawWithTrailingComma);
    expect(parsedTrailing.items).toEqual([1, 2, 3]);
    expect(parsedTrailing.done).toBe(true);
  });

  it("throws DomainError on empty completion text", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify(mockOpenAIResponse("")), { status: 200 });
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(createMockCompletionRequest())).rejects.toThrow(
      "ArvanCloud API returned an empty completion response",
    );
  });

  it("throws DomainError on HTTP 401 Unauthorized", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: "Invalid API Key" } }),
        { status: 401, statusText: "Unauthorized" },
      );
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(createMockCompletionRequest())).rejects.toThrow(
      "ArvanCloud API authentication failed (401 Unauthorized)",
    );
  });

  it("throws DomainError on HTTP 403 Forbidden", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: "Access forbidden" } }),
        { status: 403, statusText: "Forbidden" },
      );
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(createMockCompletionRequest())).rejects.toThrow(
      "ArvanCloud API access forbidden (403 Forbidden)",
    );
  });

  it("handles HTTP 429 rate limit and parses retry-after header", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: "Rate limit exceeded" } }),
        {
          status: 429,
          statusText: "Too Many Requests",
          headers: {
            "retry-after": "30",
          },
        },
      );
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await gateway.complete(createMockCompletionRequest());
      expect.fail("Should have thrown DomainError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(DomainError);
      expect(err.code).toBe("rate_limit_exceeded");
      expect(err.message).toContain("retry after 30");
    }
  });

  it("retries on transient HTTP 500/503 errors and succeeds on subsequent attempt", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("Internal Gateway Error", {
          status: 503,
          statusText: "Service Unavailable",
        });
      }
      return new Response(
        JSON.stringify(mockOpenAIResponse("Success after retry")),
        { status: 200 },
      );
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(createMockCompletionRequest());
    expect(callCount).toBe(2);
    expect(result.text).toBe("Success after retry");
  });

  it("handles timeout with AbortController", async () => {
    const mockFetch = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      return new Promise((_resolve, reject) => {
        if (opts.signal) {
          opts.signal.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      timeoutMs: 50,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(createMockCompletionRequest())).rejects.toThrow(
      "ArvanCloud API request timed out after 50ms",
    );
  });

  it("redacts API key from all network error messages and logs", async () => {
    let attempts = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      attempts++;
      throw new Error(`Failed to connect to https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/auth/${FAKE_MACHINE_USER_KEY}/v1`);
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: FAKE_MACHINE_USER_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await gateway.complete(createMockCompletionRequest());
      expect.fail("Should have thrown network error");
    } catch (err: any) {
      expect(err.message).toContain("[REDACTED]");
      expect(err.message).not.toContain(FAKE_MACHINE_USER_KEY);
    }
  }, 10000);

  it("instantiates ArvanCloudModelGateway via createModelGateway with AI_PRIMARY_PROVIDER=arvancloud", () => {
    process.env.AI_PRIMARY_PROVIDER = "arvancloud";
    process.env.ARVANCLOUD_API_KEY = FAKE_MACHINE_USER_KEY;
    const gateway = createModelGateway();
    expect(gateway).toBeInstanceOf(ArvanCloudModelGateway);
    expect(gateway.provider).toBe("arvancloud");
    expect(gateway.model).toBe("DeepSeek-V4-Flash");
  });
});
