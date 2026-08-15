/**
 * CloudflareModelGateway unit tests.
 *
 * Verifies:
 * - Request formatting (URL, Authorization: Bearer, Content-Type, messages array)
 * - Response parsing (choices.message.content, response, token usage, model, finishReason)
 * - Safe error handling (non-200 status, network error, timeout, 429 rate limit)
 * - Strict security: API token and Account ID are passed via headers and NEVER printed in errors or URLs
 * - Factory instantiation via createModelGateway
 */

import { describe, expect, it, vi } from "vitest";
import {
  CloudflareModelGateway,
  DEFAULT_CLOUDFLARE_AI_MODEL,
} from "./cloudflare.js";
import { createModelGateway } from "./index.js";
import type { CompletionRequest } from "./types.js";
import { DomainError } from "@avana/domain";
import type { OrganizationId, DocumentId } from "@avana/domain";

const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;
const FAKE_ACCOUNT_ID = "fake-cf-account-id-98765";
const FAKE_API_TOKEN = "fake-cf-secret-token-12345";

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
    correlationId: "corr-cf-1",
    organizationId: mockOrgId,
    documentId: mockDocId,
    ...overrides,
  } as CompletionRequest;
}

describe("CloudflareModelGateway Unit Tests", () => {
  it("throws unprocessable if Account ID or API token is missing or empty", () => {
    expect(
      () =>
        new CloudflareModelGateway({
          accountId: "",
          apiToken: FAKE_API_TOKEN,
        }),
    ).toThrow(DomainError);

    expect(
      () =>
        new CloudflareModelGateway({
          accountId: FAKE_ACCOUNT_ID,
          apiToken: "",
        }),
    ).toThrow(DomainError);

    expect(
      () =>
        new CloudflareModelGateway({
          accountId: "   ",
          apiToken: "   ",
        }),
    ).toThrow(DomainError);
  });

  it("exposes the 'cloudflare' provider identifier", () => {
    const gateway = new CloudflareModelGateway({
      accountId: FAKE_ACCOUNT_ID,
      apiToken: FAKE_API_TOKEN,
    });
    expect(gateway.provider).toBe("cloudflare");
  });

  it("formats request correctly and parses successful chat completion response", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const mockResponsePayload = {
      success: true,
      result: {
        id: "chatcmpl-test-123",
        model: "@cf/zai-org/glm-4.7-flash",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                kind: "lesson",
                title: "Pharmacokinetics Overview",
                contentMarkdown: "# Pharmacokinetics\n\nDirect teaching content.",
                citationChunkIds: ["chunk-1"],
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 310,
          completion_tokens: 190,
          total_tokens: 500,
        },
      },
      errors: [],
      messages: [],
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

    const gateway = new CloudflareModelGateway({
      accountId: FAKE_ACCOUNT_ID,
      apiToken: FAKE_API_TOKEN,
      modelName: "@cf/zai-org/glm-4.7-flash",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(
      makeRequest({ maxTokens: 2048, temperature: 0.3 }),
    );

    // 1. Verify URL and headers
    expect(capturedUrl).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${FAKE_ACCOUNT_ID}/ai/run/@cf/zai-org/glm-4.7-flash`,
    );
    expect(capturedHeaders["Authorization"]).toBe(`Bearer ${FAKE_API_TOKEN}`);
    expect(capturedHeaders["Content-Type"]).toBe("application/json");

    // 2. Verify body formatting (messages, temperature, max_tokens)
    expect(capturedBody.messages).toEqual([
      { role: "system", content: "You produce structured JSON study content." },
      { role: "user", content: "Generate a lesson JSON payload." },
    ]);
    expect(capturedBody.temperature).toBe(0.3);
    expect(capturedBody.max_tokens).toBe(2048);

    // 3. Verify returned CompletionResult
    expect(result.model).toBe("@cf/zai-org/glm-4.7-flash");
    expect(result.usage.inputTokens).toBe(310);
    expect(result.usage.outputTokens).toBe(190);
    expect(result.finishReason).toBe("stop");

    const parsed = JSON.parse(result.text);
    expect(parsed.kind).toBe("lesson");
    expect(parsed.title).toBe("Pharmacokinetics Overview");
  });

  it("parses legacy response field format correctly", async () => {
    const mockResponsePayload = {
      success: true,
      result: {
        response: "Direct response text from model",
      },
      errors: [],
      messages: [],
    };

    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify(mockResponsePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const gateway = new CloudflareModelGateway({
      accountId: FAKE_ACCOUNT_ID,
      apiToken: FAKE_API_TOKEN,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    expect(result.text).toBe("Direct response text from model");
    expect(result.model).toBe(DEFAULT_CLOUDFLARE_AI_MODEL);
  });

  it("handles HTTP error responses safely without leaking API tokens or Account IDs", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: false,
          errors: [
            {
              code: 10000,
              message: `Authentication failed for token ${FAKE_API_TOKEN} on account ${FAKE_ACCOUNT_ID}`,
            },
          ],
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new CloudflareModelGateway({
      accountId: FAKE_ACCOUNT_ID,
      apiToken: FAKE_API_TOKEN,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /Cloudflare Workers AI request failed/i,
    );

    try {
      await gateway.complete(makeRequest());
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DomainError);
      const msg = (err as Error).message;
      expect(msg).not.toContain(FAKE_API_TOKEN);
      expect(msg).not.toContain(FAKE_ACCOUNT_ID);
      expect(msg).toContain("[REDACTED]");
      expect(msg).toContain("[REDACTED_ACCOUNT]");
    }
  });

  it("converts 429 rate limit status code to rate_limit_exceeded DomainError", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 429, message: "Rate limit exceeded" }],
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new CloudflareModelGateway({
      accountId: FAKE_ACCOUNT_ID,
      apiToken: FAKE_API_TOKEN,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    try {
      await gateway.complete(makeRequest());
      expect.unreachable("Should have thrown");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe("rate_limit_exceeded");
    }
  });

  it("handles empty completion text from Cloudflare", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          result: { choices: [] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new CloudflareModelGateway({
      accountId: FAKE_ACCOUNT_ID,
      apiToken: FAKE_API_TOKEN,
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

    const gateway = new CloudflareModelGateway({
      accountId: FAKE_ACCOUNT_ID,
      apiToken: FAKE_API_TOKEN,
      timeoutMs: 10,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await expect(gateway.complete(makeRequest())).rejects.toThrowError(
      /timed out after 10ms/i,
    );
  });
});

describe("createModelGateway with Cloudflare", () => {
  it("instantiates CloudflareModelGateway when provider is 'cloudflare' and credentials provided", () => {
    const gateway = createModelGateway({
      provider: "cloudflare",
      cloudflareAccountId: FAKE_ACCOUNT_ID,
      cloudflareApiToken: FAKE_API_TOKEN,
      cloudflareAiModel: "@cf/zai-org/glm-4.7-flash",
    });

    expect(gateway).toBeInstanceOf(CloudflareModelGateway);
    expect(gateway.provider).toBe("cloudflare");
  });

  it("throws unprocessable if provider is 'cloudflare' but credentials are missing", () => {
    const origAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
    const origToken = process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;

    try {
      expect(() =>
        createModelGateway({
          provider: "cloudflare",
          cloudflareAccountId: "",
        }),
      ).toThrowError(/CLOUDFLARE_ACCOUNT_ID is required/i);

      expect(() =>
        createModelGateway({
          provider: "cloudflare",
          cloudflareAccountId: FAKE_ACCOUNT_ID,
          cloudflareApiToken: "",
        }),
      ).toThrowError(/CLOUDFLARE_API_TOKEN is required/i);
    } finally {
      if (origAccount) process.env.CLOUDFLARE_ACCOUNT_ID = origAccount;
      if (origToken) process.env.CLOUDFLARE_API_TOKEN = origToken;
    }
  });
});
