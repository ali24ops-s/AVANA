/**
 * GeminiModelGateway unit tests.
 *
 * Verifies:
 * - Request formatting (systemInstruction, contents, responseMimeType: "application/json")
 * - Response parsing (text, token usage, modelVersion, finishReason)
 * - Safe error handling (non-200 status, network error, timeout)
 * - Strict security: API key is passed via headers and NEVER printed in errors or URLs
 * - Factory instantiation via createModelGateway
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

    const mockResponsePayload = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  kind: "lesson",
                  title: "Pharmacokinetics Overview",
                  contentMarkdown: "# Pharmacokinetics\n\nDirect teaching content.",
                  citationChunkIds: ["chunk-1"],
                }),
              },
            ],
            role: "model",
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 250,
        candidatesTokenCount: 180,
        totalTokenCount: 430,
      },
      modelVersion: "gemini-2.5-flash",
    };

    const mockFetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = JSON.parse(String(init?.body || "{}"));

      return new Response(JSON.stringify(mockResponsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      modelName: "gemini-2.5-flash",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());

    // 1. Verify URL and headers
    expect(capturedUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(capturedHeaders["x-goog-api-key"]).toBe(FAKE_API_KEY);
    expect(capturedHeaders["Content-Type"]).toBe("application/json");

    // 2. Verify body formatting (systemInstruction + contents)
    expect(capturedBody.systemInstruction).toEqual({
      parts: [{ text: "You produce structured JSON study content." }],
    });
    expect(capturedBody.contents).toEqual([
      {
        role: "user",
        parts: [{ text: "Generate a lesson JSON payload." }],
      },
    ]);
    expect(capturedBody.generationConfig).toEqual({
      responseMimeType: "application/json",
      temperature: 0.2,
    });

    // 3. Verify returned CompletionResult
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.usage.inputTokens).toBe(250);
    expect(result.usage.outputTokens).toBe(180);
    expect(result.finishReason).toBe("STOP");

    const parsed = JSON.parse(result.text);
    expect(parsed.kind).toBe("lesson");
    expect(parsed.title).toBe("Pharmacokinetics Overview");
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

  it("handles empty candidate text from Gemini", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          candidates: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /empty completion response/i,
    );
  });

  it("handles timeout correctly", async () => {
    const mockFetch = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      timeoutMs: 10,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /timed out after 10ms/i,
    );
  });
});

describe("createModelGateway with Gemini", () => {
  it("instantiates GeminiModelGateway when provider is 'gemini' and key is provided", () => {
    const gateway = createModelGateway({
      provider: "gemini",
      geminiApiKey: FAKE_API_KEY,
      geminiModel: "gemini-2.5-flash",
    });

    expect(gateway).toBeInstanceOf(GeminiModelGateway);
    expect(gateway.provider).toBe("gemini");
  });

  it("throws unprocessable if provider is 'gemini' but key is missing", () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      expect(() =>
        createModelGateway({
          provider: "gemini",
          geminiApiKey: "",
        }),
      ).toThrowError(/GEMINI_API_KEY is required/i);
    } finally {
      if (originalKey) {
        process.env.GEMINI_API_KEY = originalKey;
      }
    }
  });
});
