/**
 * GapGPTModelGateway unit tests.
 *
 * Verifies:
 * - GapGPT gateway creation and default configuration
 * - Correct API URL and Bearer Authorization header
 * - Model configuration (defaults to gpt-5.6-luna, supports overrides)
 * - OpenAI-compatible message mapping
 * - Structured JSON response parsing and token usage extraction
 * - Fenced JSON parsing (```json ... ``` and ``` ... ```)
 * - Empty response handling (throws DomainError)
 * - Invalid JSON response handling (throws DomainError)
 * - HTTP error handling: 401 Unauthorized, 403 Forbidden, 429 Rate Limit, 5xx server error transient retries
 * - Request timeout with AbortController
 * - Missing GAPGPT_API_KEY handling
 * - Secret sanitization: API key is never leaked in errors or logs
 * - Factory instantiation via createModelGateway
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  GapGPTModelGateway,
  DEFAULT_GAPGPT_MODEL,
  DEFAULT_GAPGPT_BASE_URL,
  GAPGPT_API_CHAT_URL,
  cleanAndParseGapGPTJson,
} from "./gapgpt.js";
import { createModelGateway } from "./index.js";
import type { CompletionRequest } from "./types.js";
import { DomainError } from "@avana/domain";
import type { OrganizationId, DocumentId } from "@avana/domain";

const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;
const FAKE_GAPGPT_KEY = "gap_test_secret_key_123456789";

function makeRequest(
  overrides: Partial<CompletionRequest> = {},
): NoInfer<CompletionRequest> {
  return {
    promptVersion: "v1",
    messages: [
      { role: "system", content: "You produce structured JSON study content." },
      { role: "user", content: "Generate a lesson JSON payload." },
    ],
    jsonSchema: { type: "lesson" },
    correlationId: "corr-gapgpt-1",
    organizationId: mockOrgId,
    documentId: mockDocId,
    ...overrides,
  } as CompletionRequest;
}

function makeSuccessResponse(
  content = JSON.stringify({ kind: "lesson", title: "Test Lesson" }),
  model = "gpt-5.6-luna",
) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-gapgpt-123",
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 60,
        total_tokens: 180,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("GapGPTModelGateway Unit Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("throws DomainError if API key is missing or empty", () => {
    delete process.env.GAPGPT_API_KEY;
    expect(() => new GapGPTModelGateway({ apiKey: "" })).toThrow(DomainError);
    expect(() => new GapGPTModelGateway({ apiKey: "   " })).toThrow(
      "GAPGPT_API_KEY is required when AI_PROVIDER is 'gapgpt'",
    );
  });

  it("exposes the 'gapgpt' provider identifier and default model", () => {
    const gateway = new GapGPTModelGateway({ apiKey: FAKE_GAPGPT_KEY });
    expect(gateway.provider).toBe("gapgpt");
    expect(gateway.model).toBe("gpt-5.6-luna");
    expect(DEFAULT_GAPGPT_MODEL).toBe("gpt-5.6-luna");
    expect(DEFAULT_GAPGPT_BASE_URL).toBe("https://api.gapgpt.app/v1");
    expect(GAPGPT_API_CHAT_URL).toBe("https://api.gapgpt.app/v1/chat/completions");
  });

  it("sends correct HTTP POST request to GapGPT endpoint with Bearer auth and OpenAI chat format", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return makeSuccessResponse();
    });

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());

    expect(capturedUrl).toBe("https://api.gapgpt.app/v1/chat/completions");
    expect(capturedInit?.method).toBe("POST");

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${FAKE_GAPGPT_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");

    const parsedBody = JSON.parse(capturedInit?.body as string);
    expect(parsedBody.model).toBe("gpt-5.6-luna");
    expect(parsedBody.messages).toEqual([
      { role: "system", content: "You produce structured JSON study content." },
      { role: "user", content: "Generate a lesson JSON payload." },
    ]);
    expect(parsedBody.response_format).toEqual({ type: "json_object" });

    expect(result.model).toBe("gpt-5.6-luna");
    expect(result.usage.inputTokens).toBe(120);
    expect(result.usage.outputTokens).toBe(60);
    expect(result.finishReason).toBe("stop");
    expect(JSON.parse(result.text)).toEqual({
      kind: "lesson",
      title: "Test Lesson",
    });
  });

  it("supports custom model name and custom base URL overrides", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> | undefined;

    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init.body as string);
      return makeSuccessResponse(
        JSON.stringify({ kind: "lesson", title: "Custom Model Lesson" }),
        "gpt-5.6-custom",
      );
    });

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      modelName: "gpt-5.6-custom",
      baseUrl: "https://custom.gapgpt.app/v1/",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());

    expect(capturedUrl).toBe("https://custom.gapgpt.app/v1/chat/completions");
    expect(capturedBody?.model).toBe("gpt-5.6-custom");
    expect(result.model).toBe("gpt-5.6-custom");
  });

  it("correctly parses structured JSON returned inside ```json ... ``` markdown code fences", async () => {
    const jsonInsideFence = "```json\n{\n  \"kind\": \"lesson\",\n  \"title\": \"Fenced Lesson\"\n}\n```";

    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse(jsonInsideFence));

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    const parsed = JSON.parse(result.text);
    expect(parsed.kind).toBe("lesson");
    expect(parsed.title).toBe("Fenced Lesson");
  });

  it("cleanAndParseGapGPTJson helper strips code fences and trailing commas", () => {
    const rawFenced = "```json\n{\n  \"title\": \"Sample\",\n  \"items\": [1, 2, ],\n}\n```";
    const parsed = cleanAndParseGapGPTJson<{ title: string; items: number[] }>(rawFenced);
    expect(parsed.title).toBe("Sample");
    expect(parsed.items).toEqual([1, 2]);

    const rawPlain = "{\"key\": \"value\"}";
    expect(cleanAndParseGapGPTJson(rawPlain)).toEqual({ key: "value" });
  });

  it("throws DomainError on empty completion content", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeSuccessResponse(""));

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrow(
      "GapGPT API returned an empty completion response",
    );
  });

  it("throws DomainError on invalid JSON response body from upstream", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("<html>502 Bad Gateway</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrow(
      /Failed to parse GapGPT response JSON/i,
    );
  });

  it("handles 401 Unauthorized error with sanitized message", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: `Invalid API key ${FAKE_GAPGPT_KEY}` },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrow(
      "GapGPT API authentication failed (401 Unauthorized): Invalid API key [REDACTED]",
    );
  });

  it("handles 403 Forbidden error with sanitized message", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Account suspended or insufficient permissions" },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrow(
      "GapGPT API access forbidden (403 Forbidden): Account suspended or insufficient permissions",
    );
  });

  it("handles 429 Rate Limit error with DomainError code rate_limit_exceeded", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "Rate limit reached for requests per minute" },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "retry-after": "5",
          },
        },
      ),
    );

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await gateway.complete(makeRequest());
      expect.unreachable("Should have thrown rate_limit_exceeded DomainError");
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe("rate_limit_exceeded");
      expect((err as DomainError).message).toContain("GapGPT API rate limit exceeded");
      expect((err as DomainError).message).toContain("(retry after 5)");
    }
  });

  it("retries on transient HTTP 500/503 errors and succeeds on subsequent attempt", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: { message: "Service Unavailable" } }),
          { status: 503 },
        );
      }
      return makeSuccessResponse();
    });

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    expect(callCount).toBe(2);
    expect(result.model).toBe("gpt-5.6-luna");
  });

  it("handles request timeout cleanly with AbortController", async () => {
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      timeoutMs: 50,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrow(
      "GapGPT API request timed out after 50ms",
    );
  });

  it("redacts API key from all network error messages", async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      new Error(`Failed to connect with token ${FAKE_GAPGPT_KEY}`),
    );

    const gateway = new GapGPTModelGateway({
      apiKey: FAKE_GAPGPT_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await gateway.complete(makeRequest());
      expect.unreachable("Should have thrown DomainError");
    } catch (err) {
      expect((err as Error).message).not.toContain(FAKE_GAPGPT_KEY);
      expect((err as Error).message).toContain("[REDACTED]");
    }
  }, 10000);
});

describe("createModelGateway with GapGPT", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_CONTENT_PROVIDER;
    delete process.env.AI_PROVIDER;
    delete process.env.GAPGPT_API_KEY;
    delete process.env.GAPGPT_MODEL;
    delete process.env.GAPGPT_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("instantiates GapGPTModelGateway when options.provider = 'gapgpt'", () => {
    const gateway = createModelGateway({
      provider: "gapgpt",
      gapgptApiKey: FAKE_GAPGPT_KEY,
    });

    expect(gateway).toBeInstanceOf(GapGPTModelGateway);
    expect(gateway.provider).toBe("gapgpt");
    expect(gateway.model).toBe("gpt-5.6-luna");
  });

  it("instantiates GapGPTModelGateway when AI_PROVIDER=gapgpt in process.env", () => {
    process.env.AI_PROVIDER = "gapgpt";
    process.env.GAPGPT_API_KEY = FAKE_GAPGPT_KEY;

    const gateway = createModelGateway();
    expect(gateway).toBeInstanceOf(GapGPTModelGateway);
    expect(gateway.provider).toBe("gapgpt");
  });

  it("instantiates GapGPTModelGateway when AI_CONTENT_PROVIDER=gapgpt in process.env", () => {
    process.env.AI_CONTENT_PROVIDER = "gapgpt";
    process.env.AI_PROVIDER = "gemini";
    process.env.GAPGPT_API_KEY = FAKE_GAPGPT_KEY;

    const gateway = createModelGateway();
    expect(gateway).toBeInstanceOf(GapGPTModelGateway);
    expect(gateway.provider).toBe("gapgpt");
  });

  it("instantiates GapGPTModelGateway when AI_PRIMARY_PROVIDER=gapgpt is configured in process.env", () => {
    process.env.AI_PRIMARY_PROVIDER = "gapgpt";
    process.env.GAPGPT_API_KEY = FAKE_GAPGPT_KEY;

    const gateway = createModelGateway();
    expect(gateway).toBeInstanceOf(GapGPTModelGateway);
    expect(gateway.provider).toBe("gapgpt");
    expect(gateway.model).toBe("gpt-5.6-luna");
  });

  it("throws DomainError if AI_PROVIDER=gapgpt but GAPGPT_API_KEY is missing", () => {
    process.env.AI_PROVIDER = "gapgpt";
    expect(() => createModelGateway()).toThrow(
      "GAPGPT_API_KEY is required when AI_PROVIDER is 'gapgpt'",
    );
  });
});
