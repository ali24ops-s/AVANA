import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type https from "node:https";
import { GeminiModelGateway } from "./gemini.js";
import { createModelGateway } from "./index.js";
import type { CompletionRequest } from "./types.js";
import { DomainError } from "@avana/domain";
import type { OrganizationId, DocumentId } from "@avana/domain";

const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;
const FAKE_API_KEY = "test-secret-gemini-key-12345";
const FAKE_PROXIED_URL = "socks5://gemini-proxy-user:gemini-secret-password@127.0.0.1:1080";

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
    correlationId: "corr-1",
    organizationId: mockOrgId,
    documentId: mockDocId,
    ...overrides,
  } as CompletionRequest;
}

interface MockTransportOptions {
  method?: string;
  headers?: Record<string, string>;
  agent?: unknown;
  signal?: AbortSignal;
}

interface MockReq extends EventEmitter {
  write: (chunk: string | Buffer) => boolean;
  end: () => void;
  destroy: () => void;
}

interface MockRes extends EventEmitter {
  statusCode?: number;
  statusMessage?: string;
  headers?: Record<string, string>;
}

describe("Gemini SOCKS5 Proxy Transport & Architecture", () => {
  it("1. custom fetchFn takes precedence over socksProxyUrl", async () => {
    let mockFetchCalled = false;
    const mockFetch = vi.fn(async () => {
      mockFetchCalled = true;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify({ kind: "lesson", title: "Custom Fetch" }) }] },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      socksProxyUrl: "socks5://127.0.0.1:1080",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await gateway.complete(makeRequest());
    expect(mockFetchCalled).toBe(true);
    expect(result.text).toContain("Custom Fetch");
    gateway.destroy();
  });

  it("2. without proxy, default direct behavior is preserved (isProxyConfigured = false)", () => {
    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
    });
    expect(gateway.isProxyConfigured()).toBe(false);
    gateway.destroy();
  });

  it("3. with proxy, isProxyConfigured is true and transport passes through agent", async () => {
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
        req.destroy = vi.fn();
        req.end = vi.fn().mockImplementation(() => {
          const res = new EventEmitter() as MockRes;
          res.statusCode = 200;
          res.statusMessage = "OK";
          res.headers = { "content-type": "application/json" };
          if (callback) callback(res);
          queueMicrotask(() => {
            res.emit(
              "data",
              Buffer.from(
                JSON.stringify({
                  candidates: [
                    {
                      content: { parts: [{ text: JSON.stringify({ kind: "lesson", title: "Proxied Title" }) }] },
                      finishReason: "STOP",
                    },
                  ],
                }),
              ),
            );
            res.emit("end");
          });
        });
        return req;
      }) as unknown as typeof https.request,
    };

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      socksProxyUrl: "socks5://127.0.0.1:1080",
      customTransport,
    });

    expect(gateway.isProxyConfigured()).toBe(true);
    const result = await gateway.complete(makeRequest());
    expect(result.text).toContain("Proxied Title");
    expect(capturedUrl?.hostname).toBe("generativelanguage.googleapis.com");
    expect(capturedOptions?.method).toBe("POST");
    expect(capturedOptions?.agent).toBeDefined();
    expect(capturedOptions?.headers?.["x-goog-api-key"]).toBe(FAKE_API_KEY);
    expect(capturedBody).toContain("Generate a lesson JSON payload.");
    gateway.destroy();
  });

  it("4. complete and checkHealth use the exact same proxy transport", async () => {
    const urlsCalled: string[] = [];

    const customTransport = {
      request: ((url: URL, options: MockTransportOptions, callback?: (res: MockRes) => void) => {
        urlsCalled.push(`${options.method || "GET"} ${url.pathname}`);
        const req = new EventEmitter() as MockReq;
        req.write = vi.fn();
        req.destroy = vi.fn();
        req.end = vi.fn().mockImplementation(() => {
          const res = new EventEmitter() as MockRes;
          res.statusCode = 200;
          res.statusMessage = "OK";
          res.headers = { "content-type": "application/json" };
          if (callback) callback(res);
          queueMicrotask(() => {
            if (options.method === "POST") {
              res.emit(
                "data",
                Buffer.from(
                  JSON.stringify({
                    candidates: [
                      {
                        content: { parts: [{ text: JSON.stringify({ kind: "lesson", title: "Lesson Title" }) }] },
                        finishReason: "STOP",
                      },
                    ],
                  }),
                ),
              );
            } else {
              res.emit("data", Buffer.from(JSON.stringify({ name: "models/gemini-3.5-flash-lite" })));
            }
            res.emit("end");
          });
        });
        return req;
      }) as unknown as typeof https.request,
    };

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      socksProxyUrl: "socks5://127.0.0.1:1080",
      customTransport,
    });

    await gateway.complete(makeRequest());
    const health = await gateway.checkHealth();

    expect(health.status).toBe("healthy");
    expect(urlsCalled).toHaveLength(2);
    expect(urlsCalled[0]).toContain("POST /v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(urlsCalled[1]).toContain("GET /v1beta/models/gemini-3.5-flash-lite");
    gateway.destroy();
  });

  it("5. proxy failure does NOT fallback to direct fetch and throws DomainError", async () => {
    let callCount = 0;

    const customTransport = {
      request: ((_url: URL, _options: MockTransportOptions) => {
        callCount++;
        const req = new EventEmitter() as MockReq;
        req.write = vi.fn();
        req.destroy = vi.fn();
        req.end = vi.fn().mockImplementation(() => {
          queueMicrotask(() => {
            req.emit("error", new Error("SOCKS connection failed: ECONNREFUSED 127.0.0.1:1080"));
          });
        });
        return req;
      }) as unknown as typeof https.request,
    };

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      socksProxyUrl: "socks5://127.0.0.1:1080",
      customTransport,
      sleepFn: () => Promise.resolve(),
    });

    await expect(gateway.complete(makeRequest())).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(DomainError);
      const domErr = err as DomainError;
      expect(domErr.code).toBe("service_unavailable");
      expect(domErr.message).toContain("Gemini API network error");
      return true;
    });

    // Bounded retries: 3 attempts executed against the proxy, zero unproxied direct fallback
    expect(callCount).toBe(3);
    gateway.destroy();
  });

  it("6. AbortSignal cleanly aborts proxy request", async () => {
    let reqDestroyed = false;

    const customTransport = {
      request: ((_url: URL, _options: MockTransportOptions) => {
        const req = new EventEmitter() as MockReq;
        req.write = vi.fn();
        req.destroy = vi.fn().mockImplementation(() => {
          reqDestroyed = true;
        });
        req.end = vi.fn().mockImplementation(() => {
          // Intentionally do not settle to simulate hang
        });
        return req;
      }) as unknown as typeof https.request,
    };

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      socksProxyUrl: "socks5://127.0.0.1:1080",
      customTransport,
      timeoutMs: 50,
      sleepFn: () => Promise.resolve(),
    });

    await expect(gateway.complete(makeRequest())).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe("service_unavailable");
      return true;
    });

    expect(reqDestroyed).toBe(true);
    gateway.destroy();
  });

  it("7. resource cleanup via destroy() destroys the underlying agent", () => {
    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      socksProxyUrl: "socks5://127.0.0.1:1080",
    });

    const agent = (gateway as unknown as { proxyAgent?: { destroy: () => void } }).proxyAgent;
    expect(agent).toBeDefined();
    const spy = vi.spyOn(agent!, "destroy");

    gateway.destroy();
    expect(spy).toHaveBeenCalled();
  });

  it("8. credentials in socksProxyUrl are redacted and never leaked in errors or logs", async () => {
    const customTransport = {
      request: ((_url: URL, _options: MockTransportOptions) => {
        const req = new EventEmitter() as MockReq;
        req.write = vi.fn();
        req.destroy = vi.fn();
        req.end = vi.fn().mockImplementation(() => {
          queueMicrotask(() => {
            req.emit(
              "error",
              new Error(
                "Proxy error connecting to socks5://gemini-proxy-user:gemini-secret-password@127.0.0.1:1080",
              ),
            );
          });
        });
        return req;
      }) as unknown as typeof https.request,
    };

    const gateway = new GeminiModelGateway({
      apiKey: FAKE_API_KEY,
      socksProxyUrl: FAKE_PROXIED_URL,
      customTransport,
      sleepFn: () => Promise.resolve(),
    });

    try {
      await gateway.complete(makeRequest());
      expect.fail("Expected gateway.complete to fail");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DomainError);
      const msg = (err as Error).message;
      expect(msg).not.toContain("gemini-secret-password");
      expect(msg).toContain("[REDACTED_PROXY_PASSWORD]");
    }

    gateway.destroy();
  });

  it("9. createModelGateway instantiates GeminiModelGateway with socksProxyUrl from options", () => {
    const gateway = createModelGateway({
      provider: "gemini",
      geminiApiKey: FAKE_API_KEY,
      geminiSocksProxyUrl: "socks5://127.0.0.1:1080",
    });

    expect(gateway).toBeInstanceOf(GeminiModelGateway);
    expect((gateway as GeminiModelGateway).isProxyConfigured()).toBe(true);
    gateway.destroy?.();
  });

  it("10. createModelGateway respects GEMINI_SOCKS_PROXY_URL env when options omit it", () => {
    const prev = process.env.GEMINI_SOCKS_PROXY_URL;
    process.env.GEMINI_SOCKS_PROXY_URL = "socks5://127.0.0.1:1080";
    try {
      const gateway = createModelGateway({
        provider: "gemini",
        geminiApiKey: FAKE_API_KEY,
      });

      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect((gateway as GeminiModelGateway).isProxyConfigured()).toBe(true);
      gateway.destroy?.();
    } finally {
      process.env.GEMINI_SOCKS_PROXY_URL = prev;
    }
  });

  it("11. verifies production configuration with GEMINI_SOCKS_PROXY_URL=socks5://127.0.0.1:10808", () => {
    const prev = process.env.GEMINI_SOCKS_PROXY_URL;
    process.env.GEMINI_SOCKS_PROXY_URL = "socks5://127.0.0.1:10808";
    try {
      const gateway = createModelGateway({
        provider: "gemini",
        geminiApiKey: FAKE_API_KEY,
      });

      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect((gateway as GeminiModelGateway).isProxyConfigured()).toBe(true);
      gateway.destroy?.();
    } finally {
      process.env.GEMINI_SOCKS_PROXY_URL = prev;
    }
  });
});
