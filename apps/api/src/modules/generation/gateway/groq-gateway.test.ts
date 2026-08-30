/**
 * GroqModelGateway unit tests.
 *
 * Verifies:
 * - Request formatting (OpenAI-compatible chat completions with messages and response_format)
 * - Strict Structured Outputs (response_format: { type: "json_schema", json_schema: { name, strict: true, schema } })
 * - adaptToGroqJsonSchema adapter for all AVANA well-known schemas (content_plan, sessions_batch, session/lesson, flashcards_batch, quizzes_batch)
 * - Response parsing (text, token usage, model, finishReason)
 * - Safe error handling (401 Unauthorized, 429 Rate Limit, 500 Transient Retry, Timeout, Network Error)
 * - Strict secret sanitization: API key is never leaked in errors, logs, or outputs
 * - Factory instantiation via createModelGateway
 */

import { describe, expect, it, vi } from "vitest";
import {
  GroqModelGateway,
  DEFAULT_GROQ_MODEL,
  adaptToGroqJsonSchema,
} from "./groq.js";
import { createModelGateway } from "./index.js";
import type { CompletionRequest } from "./types.js";
import { DomainError } from "@avana/domain";
import type { OrganizationId, DocumentId } from "@avana/domain";

const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;
const FAKE_GROQ_KEY = "gsk_test_fake_secret_key_123456789";

function makeRequest(
  overrides: Partial<CompletionRequest> = {},
): NoInfer<CompletionRequest> {
  return {
    promptVersion: "v1",
    messages: [
      { role: "system", content: "You produce structured JSON study content." },
      {
        role: "user",
        content: "Generate a lesson JSON payload.",
      },
    ],
    jsonSchema: { type: "lesson" },
    correlationId: "corr-groq-1",
    organizationId: mockOrgId,
    documentId: mockDocId,
    ...overrides,
  } as CompletionRequest;
}

function makeSuccessResponse(content = JSON.stringify({ kind: "lesson", title: "Test Lesson" })) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test-123",
      model: "openai/gpt-oss-120b",
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
        prompt_tokens: 150,
        completion_tokens: 75,
        total_tokens: 225,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("adaptToGroqJsonSchema Adapter Unit Tests", () => {
  it("adapts 'content_plan' to strict JSON Schema", () => {
    const adapted = adaptToGroqJsonSchema({ type: "content_plan" });
    expect(adapted).not.toBeNull();
    expect(adapted?.name).toBe("content_plan");
    expect(adapted?.strict).toBe(true);
    expect(adapted?.schema.additionalProperties).toBe(false);
    expect(adapted?.schema.required).toContain("moduleTitle");
  });

  it("adapts 'sessions_batch' to strict JSON Schema", () => {
    const adapted = adaptToGroqJsonSchema({ type: "sessions_batch" });
    expect(adapted?.name).toBe("sessions_batch");
    expect(adapted?.strict).toBe(true);
    expect(adapted?.schema.additionalProperties).toBe(false);
  });

  it("adapts 'flashcards_batch' to strict JSON Schema", () => {
    const adapted = adaptToGroqJsonSchema({ type: "flashcards_batch" });
    expect(adapted?.name).toBe("flashcards_batch");
    expect(adapted?.strict).toBe(true);
    expect(adapted?.schema.additionalProperties).toBe(false);
  });

  it("adapts 'quizzes_batch' to strict JSON Schema", () => {
    const adapted = adaptToGroqJsonSchema({ type: "quizzes_batch" });
    expect(adapted?.name).toBe("quizzes_batch");
    expect(adapted?.strict).toBe(true);
    expect(adapted?.schema.additionalProperties).toBe(false);
  });

  it("adapts custom object schema to strict JSON Schema with required keys", () => {
    const custom = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    };
    const adapted = adaptToGroqJsonSchema(custom);
    expect(adapted?.strict).toBe(true);
    expect(adapted?.schema.additionalProperties).toBe(false);
    expect(adapted?.schema.required).toEqual(["name", "age"]);
  });

  it("returns null for non-object schemas", () => {
    expect(adaptToGroqJsonSchema(null)).toBeNull();
    expect(adaptToGroqJsonSchema(undefined)).toBeNull();
  });
});

describe("GroqModelGateway Unit Tests", () => {
  it("throws unprocessable if API key is missing or empty", () => {
    expect(() => new GroqModelGateway({ apiKey: "" })).toThrow(DomainError);
    expect(() => new GroqModelGateway({ apiKey: "   " })).toThrow(DomainError);
  });

  it("exposes the 'groq' provider identifier and default model", () => {
    const gateway = new GroqModelGateway({ apiKey: FAKE_GROQ_KEY });
    expect(gateway.provider).toBe("groq");
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("formats request correctly with response_format: json_schema strict mode when jsonSchema is provided", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return makeSuccessResponse();
    });

    const gateway = new GroqModelGateway({
      apiKey: FAKE_GROQ_KEY,
      modelName: "openai/gpt-oss-120b",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());

    expect(capturedUrl).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(capturedHeaders["Authorization"]).toBe(`Bearer ${FAKE_GROQ_KEY}`);
    expect(capturedHeaders["Content-Type"]).toBe("application/json");

    expect(capturedBody.model).toBe("openai/gpt-oss-120b");
    expect(capturedBody.messages).toEqual([
      { role: "system", content: "You produce structured JSON study content." },
      { role: "user", content: "Generate a lesson JSON payload." },
    ]);
    expect(capturedBody.response_format.type).toBe("json_schema");
    expect(capturedBody.response_format.json_schema.strict).toBe(true);
    expect(capturedBody.response_format.json_schema.name).toBe("session_lesson");
    expect(capturedBody.response_format.json_schema.schema.additionalProperties).toBe(false);

    expect(result.model).toBe("openai/gpt-oss-120b");
    expect(result.usage.inputTokens).toBe(150);
    expect(result.usage.outputTokens).toBe(75);
    expect(result.finishReason).toBe("stop");
  });

  it("omits response_format when jsonSchema is not provided", async () => {
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return makeSuccessResponse("Plain text response");
    });

    const gateway = new GroqModelGateway({
      apiKey: FAKE_GROQ_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const reqWithoutSchema = makeRequest({ jsonSchema: undefined });
    const result = await gateway.complete(reqWithoutSchema);

    expect(capturedBody.response_format).toBeUndefined();
    expect(result.text).toBe("Plain text response");
  });

  it("handles HTTP 401 Unauthorized safely without leaking API key", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: `Invalid API Key provided: ${FAKE_GROQ_KEY}`,
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new GroqModelGateway({
      apiKey: FAKE_GROQ_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /Groq API authentication failed/i,
    );

    try {
      await gateway.complete(makeRequest());
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DomainError);
      const msg = (err as Error).message;
      expect(msg).not.toContain(FAKE_GROQ_KEY);
      expect(msg).toContain("[REDACTED]");
    }
  });

  it("handles HTTP 429 Rate Limit and parses retry notice", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "Rate limit reached for model `openai/gpt-oss-120b` in organization org-123 on tokens per minute (TPM): Limit 6000, Used 5800, Requested 500. Please try again in 5.2s.",
            type: "tokens",
            code: "rate_limit_exceeded",
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "retry-after": "6",
          },
        },
      );
    });

    const gateway = new GroqModelGateway({
      apiKey: FAKE_GROQ_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /Groq API rate limit exceeded/i,
    );

    try {
      await gateway.complete(makeRequest());
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe("rate_limit_exceeded");
      expect((err as Error).message).toContain("retry after 6");
    }
  });

  it("retries on transient HTTP 500/503 errors and succeeds", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: { message: "Internal server error" } }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return makeSuccessResponse();
    });

    const gateway = new GroqModelGateway({
      apiKey: FAKE_GROQ_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    expect(callCount).toBe(2);
    expect(result.model).toBe("openai/gpt-oss-120b");
  });

  it("handles timeout safely", async () => {
    const mockFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const abortError = new Error("The operation was aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }
      });
    });

    const gateway = new GroqModelGateway({
      apiKey: FAKE_GROQ_KEY,
      timeoutMs: 50,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /Groq API request timed out after 50ms/i,
    );
  });
});

describe("createModelGateway with Groq", () => {
  it("instantiates GroqModelGateway via factory with groqApiKey option", () => {
    const gateway = createModelGateway({
      provider: "groq",
      groqApiKey: FAKE_GROQ_KEY,
      groqModel: "openai/gpt-oss-20b",
    });

    expect(gateway).toBeInstanceOf(GroqModelGateway);
    expect(gateway.provider).toBe("groq");
  });

  it("throws if provider is 'groq' but no API key is provided", () => {
    const originalKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      expect(() =>
        createModelGateway({
          provider: "groq",
          groqApiKey: "",
        }),
      ).toThrow(DomainError);
    } finally {
      if (originalKey) process.env.GROQ_API_KEY = originalKey;
    }
  });
});
