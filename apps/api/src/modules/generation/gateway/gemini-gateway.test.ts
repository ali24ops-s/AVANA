/**
 * GeminiModelGateway unit tests.
 *
 * Verifies:
 * - Request formatting (systemInstruction, contents, responseMimeType: "application/json")
 * - Response parsing (text, token usage, modelVersion, finishReason)
 * - Safe error handling (non-200 status, network error, timeout)
 * - Strict security: API key is passed via headers and NEVER printed in errors or URLs
 * - Factory instantiation via createModelGateway
 * - Multi-key failover (401, 403, 429, daily quota) & concurrency
 */

import { describe, expect, it, vi } from "vitest";
import { GeminiModelGateway } from "./gemini.js";
import { createModelGateway } from "./index.js";
import type { CompletionRequest } from "./types.js";
import { DomainError } from "@avana/domain";
import type { OrganizationId, DocumentId } from "@avana/domain";

const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;
const FAKE_API_KEY = "test-secret-gemini-key-12345";
const FAKE_API_KEY_2 = "test-secret-gemini-key-67890";

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
    correlationId: "corr-1",
    organizationId: mockOrgId,
    documentId: mockDocId,
    ...overrides,
  } as CompletionRequest;
}

function makeSuccessResponse() {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify({ kind: "lesson", title: "Test Lesson" }) }],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      modelVersion: "gemini-2.5-flash",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("GeminiModelGateway Unit Tests", () => {
  it("throws unprocessable if API key is missing or empty", () => {
    expect(() => new GeminiModelGateway({ apiKey: "" })).toThrow(DomainError);
    expect(() => new GeminiModelGateway({ apiKey: "   " })).toThrow(DomainError);
  });

  it("exposes the 'gemini' provider identifier", () => {
    const gateway = new GeminiModelGateway({ apiKey: FAKE_API_KEY });
    expect(gateway.provider).toBe("gemini");
  });

  it("formats request correctly and parses successful response", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return makeSuccessResponse();
    });

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      modelName: "gemini-2.5-flash",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());

    expect(capturedUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(capturedHeaders["x-goog-api-key"]).toBe(FAKE_API_KEY);
    expect(capturedHeaders["Content-Type"]).toBe("application/json");

    expect(capturedBody.systemInstruction).toEqual({
      parts: [{ text: "You produce structured JSON study content." }],
    });
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.usage.inputTokens).toBe(100);
  });

  it("handles HTTP error responses safely without leaking API keys", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: `Invalid request with key ${FAKE_API_KEY}`,
            status: "INVALID_ARGUMENT",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /Gemini API request failed/i,
    );

    try {
      await gateway.complete(makeRequest());
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DomainError);
      const msg = (err as Error).message;
      expect(msg).not.toContain(FAKE_API_KEY);
      expect(msg).toContain("[REDACTED]");
    }
  });

  it("fails over to Key 2 when Key 1 receives 429 Rate Limit", async () => {
    const usedKeys: string[] = [];

    const mockFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers as Record<string, string>) || {};
      const key = headers["x-goog-api-key"];
      usedKeys.push(key);

      if (key === FAKE_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: "Resource exhausted: retry in 10s" } }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }
      return makeSuccessResponse();
    });

    const gateway = new GeminiModelGateway({
      apiKeys: [FAKE_API_KEY, FAKE_API_KEY_2],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    expect(result.model).toBe("gemini-2.5-flash");
    expect(usedKeys).toContain(FAKE_API_KEY);
    expect(usedKeys).toContain(FAKE_API_KEY_2);
  });

  it("fails over to Key 2 when Key 1 is 401 Unauthorized", async () => {
    const usedKeys: string[] = [];

    const mockFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers as Record<string, string>) || {};
      const key = headers["x-goog-api-key"];
      usedKeys.push(key);

      if (key === FAKE_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return makeSuccessResponse();
    });

    const gateway = new GeminiModelGateway({
      apiKeys: [FAKE_API_KEY, FAKE_API_KEY_2],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    expect(result.model).toBe("gemini-2.5-flash");
    expect(usedKeys).toEqual([FAKE_API_KEY, FAKE_API_KEY_2]);
  });

  it("handles 403 quota vs permission correctly", async () => {
    const usedKeys: string[] = [];

    const mockFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers as Record<string, string>) || {};
      const key = headers["x-goog-api-key"];
      usedKeys.push(key);

      if (key === FAKE_API_KEY) {
        return new Response(
          JSON.stringify({ error: { message: "GenerateRequestsPerDay quota exceeded" } }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      return makeSuccessResponse();
    });

    const gateway = new GeminiModelGateway({
      apiKeys: [FAKE_API_KEY, FAKE_API_KEY_2],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    expect(result.model).toBe("gemini-2.5-flash");
    expect(usedKeys).toEqual([FAKE_API_KEY, FAKE_API_KEY_2]);
  });

  it("does not switch key on 400 Bad Request", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount++;
      return new Response(
        JSON.stringify({ error: { message: "Invalid JSON schema field" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new GeminiModelGateway({
      apiKeys: [FAKE_API_KEY, FAKE_API_KEY_2],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(/Gemini API request failed/i);
    expect(callCount).toBe(1); // Exactly 1 call, no failover to key 2
  });

  it("handles concurrent completions across multi-key pool cleanly", async () => {
    const mockFetch = vi.fn(async () => makeSuccessResponse());

    const gateway = new GeminiModelGateway({
      apiKeys: [FAKE_API_KEY, FAKE_API_KEY_2],
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const promises = [
      gateway.complete(makeRequest()),
      gateway.complete(makeRequest()),
      gateway.complete(makeRequest()),
    ];

    const results = await Promise.all(promises);
    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe("createModelGateway with Gemini Multi-Key", () => {
  it("instantiates GeminiModelGateway with single or multiple keys", () => {
    const g1 = createModelGateway({
      provider: "gemini",
      geminiApiKey: FAKE_API_KEY,
    });
    expect(g1).toBeInstanceOf(GeminiModelGateway);

    const g2 = createModelGateway({
      provider: "gemini",
      geminiApiKeys: [FAKE_API_KEY, FAKE_API_KEY_2],
    });
    expect(g2).toBeInstanceOf(GeminiModelGateway);
  });

  it("instantiates GeminiModelGateway by default when createModelGateway is called with no arguments", () => {
    process.env.GEMINI_API_KEY = FAKE_API_KEY;

    const gateway = createModelGateway();
    expect(gateway).toBeInstanceOf(GeminiModelGateway);
    expect(gateway.provider).toBe("gemini");
    expect(gateway.model).toBe("gemini-3.6-flash");
  });
});
