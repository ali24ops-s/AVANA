import { describe, expect, it, vi } from "vitest";
import {
  OpenRouterModelGateway,
  DEFAULT_OPENROUTER_USER_AI_MODEL,
  OPENROUTER_API_CHAT_URL,
} from "./openrouter.js";
import {
  DomainError,
  type OrganizationId,
  type DocumentId,
} from "@avana/domain";
import type { CompletionRequest } from "./types.js";

function makeCompletionRequest(overrides?: Partial<CompletionRequest>): CompletionRequest {
  return {
    promptVersion: "study-assistant-v1",
    messages: [
      { role: "system", content: "You are AVANA study assistant." },
      { role: "user", content: "Explain mechanism of propranolol." },
    ],
    temperature: 0.3,
    correlationId: "corr-openrouter-test",
    organizationId: "00000000-0000-0000-0000-000000000001" as OrganizationId,
    documentId: "00000000-0000-0000-0000-000000000002" as DocumentId,
    ...overrides,
  };
}

describe("OpenRouterModelGateway Unit Tests", () => {
  const secretApiKey = "sk-or-v1-secret-test-key-1234567890abcdef";

  it("initializes with default DeepSeek model and provider identifier", () => {
    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
    });

    expect(gateway.provider).toBe("openrouter");
    expect(gateway.model).toBe(DEFAULT_OPENROUTER_USER_AI_MODEL);
  });

  it("throws clear error when apiKey is missing", async () => {
    const gateway = new OpenRouterModelGateway({
      apiKey: "",
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toThrow(DomainError);
    await expect(gateway.complete(makeCompletionRequest())).rejects.toThrow(
      /OPENROUTER_API_KEY is required/i,
    );
  });

  it("sends request with provider.allow_fallbacks === false and strictly NO models array", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;

      return new Response(
        JSON.stringify({
          id: "gen-123",
          model: "deepseek/deepseek-v4-flash-0731",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Propranolol is a non-selective beta blocker.",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 42,
            completion_tokens: 18,
            total_tokens: 60,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      modelName: "deepseek/deepseek-v4-flash-0731",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeCompletionRequest());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedUrl).toBe(OPENROUTER_API_CHAT_URL);
    expect(capturedInit?.method).toBe("POST");

    const parsedBody = JSON.parse(capturedInit?.body as string);
    // 1. Model must be the configured DeepSeek model
    expect(parsedBody.model).toBe("deepseek/deepseek-v4-flash-0731");
    // 2. provider.allow_fallbacks must be strictly false
    expect(parsedBody.provider).toEqual({ allow_fallbacks: false });
    // 3. NO models fallback array
    expect(parsedBody.models).toBeUndefined();
    // 4. Messages match
    expect(parsedBody.messages).toHaveLength(2);
    expect(parsedBody.temperature).toBe(0.3);

    // Verify result
    expect(result.text).toBe("Propranolol is a non-selective beta blocker.");
    expect(result.model).toBe("deepseek/deepseek-v4-flash-0731");
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 18 });
    expect(result.finishReason).toBe("stop");
  });

  it("sets Authorization and X-Title headers, and omits HTTP-Referer if not configured", async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "OK" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await gateway.complete(makeCompletionRequest());

    expect(capturedHeaders["Authorization"]).toBe(`Bearer ${secretApiKey}`);
    expect(capturedHeaders["Content-Type"]).toBe("application/json");
    expect(capturedHeaders["X-Title"]).toBe("AVANA");
    // Must NOT guess domain; HTTP-Referer omitted when not configured
    expect(capturedHeaders["HTTP-Referer"]).toBeUndefined();
  });

  it("includes HTTP-Referer only when explicitly configured from environment", async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "OK" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      httpReferer: "https://custom-domain.example.com",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    await gateway.complete(makeCompletionRequest());

    expect(capturedHeaders["HTTP-Referer"]).toBe("https://custom-domain.example.com");
  });

  it("redacts API key and propagates 401 unauthorized directly without fallback", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: `Invalid API key provided: ${secretApiKey}`,
            code: 401,
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    let thrownError: unknown;
    try {
      await gateway.complete(makeCompletionRequest());
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(DomainError);
    const domainErr = thrownError as DomainError;
    expect(domainErr.code).toBe("unauthorized");
    expect(domainErr.message).not.toContain(secretApiKey);
    expect(domainErr.message).toContain("[REDACTED_OPENROUTER_API_KEY]");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on 400 bad request without retry (exactly 1 request)", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: { message: "Invalid model parameters", code: 400 },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on 403 unauthorized without retry (exactly 1 request)", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: { message: "Forbidden key scope", code: 403 },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on 422 unprocessable request without retry (exactly 1 request)", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: { message: "Unprocessable entity", code: 422 },
        }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on 429 rate limit without retry (exactly 1 request)", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "Rate limit exceeded. Please try again later.",
            code: 429,
          },
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
      code: "rate_limit_exceeded",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on malformed non-JSON response (exactly 1 request)", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return new Response("Not valid json", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
      code: "unprocessable",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("succeeds on retry after initial 502 Bad Gateway (exactly 2 requests)", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("Bad Gateway", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "Recovered successfully" },
              finish_reason: "stop",
            },
          ],
          model: "deepseek/deepseek-v4-flash-0731",
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    const result = await gateway.complete(makeCompletionRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Recovered successfully");
  });

  it("succeeds on retry after initial 503 Service Unavailable (exactly 2 requests)", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: { message: "Overloaded", code: 503 } }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "Answer from DeepSeek" },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    const result = await gateway.complete(makeCompletionRequest());

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Answer from DeepSeek");
  });

  it.each([500, 502, 503, 504])(
    "exhausts 3 attempts on persistent HTTP %i and throws service_unavailable (no 4th attempt)",
    async (statusCode) => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({ error: { message: `Gateway error ${statusCode}`, code: statusCode } }),
          { status: statusCode, headers: { "Content-Type": "application/json" } },
        );
      });

      const gateway = new OpenRouterModelGateway({
        apiKey: secretApiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
        sleepFn: async () => {},
      });

      await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
        code: "service_unavailable",
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    },
  );

  it("exhausts 3 attempts on repeated timeouts and throws service_unavailable", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      const timeoutErr = new Error("The operation was aborted");
      timeoutErr.name = "AbortError";
      throw timeoutErr;
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
      code: "service_unavailable",
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("exhausts 3 attempts on repeated transient network failures and throws service_unavailable", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      throw new TypeError("fetch failed: ECONNRESET");
    });

    const gateway = new OpenRouterModelGateway({
      apiKey: secretApiKey,
      fetchFn: mockFetch as unknown as typeof fetch,
      sleepFn: async () => {},
    });

    await expect(gateway.complete(makeCompletionRequest())).rejects.toMatchObject({
      code: "service_unavailable",
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
