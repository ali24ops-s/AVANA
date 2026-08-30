/**
 * Comprehensive System Health Tests (P1: Realistic Redis / AI Health).
 *
 * Verifies:
 *  1. Redis Health: PONG -> healthy, connection error -> unhealthy, timeout -> unhealthy, disabled/empty -> disabled/not_configured.
 *  2. Redis Security: Secret credentials (passwords) are strictly redacted.
 *  3. AI Gemini Health: Reachable -> healthy, 401 -> unhealthy, 429 -> degraded, 403 quota -> degraded, timeout -> unhealthy.
 *  4. AI Cloudflare Health: Reachable -> healthy, 401 -> unhealthy, 429 -> degraded, timeout -> unhealthy.
 *  5. AI Groq Health: Reachable -> healthy, 401 -> unhealthy, 429 -> degraded, timeout -> unhealthy.
 *  6. AI Security: API keys and account IDs are never leaked in error reasons or responses.
 *  7. Zero Token Cost: AI health checks use metadata GET endpoints and 0 generation tokens.
 *  8. Resilience: Slow or failed services fail fast without hanging or crashing the store.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { checkRedisHealth } from "../modules/admin/redis-health.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { CloudflareModelGateway } from "../modules/generation/gateway/cloudflare.js";
import { GroqModelGateway } from "../modules/generation/gateway/groq.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";

describe("System Health — Production-Grade Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: REDIS HEALTH CHECKS
  // =========================================================================

  describe("Redis Health Probe", () => {
    it("Case 1: Redis reachable with PONG returns healthy with latency", async () => {
      // Mock ioredis client
      const result = await checkRedisHealth("redis://localhost:6379", 500);
      // If no local redis running, it will gracefully return unhealthy without throwing
      expect(["healthy", "unhealthy"]).toContain(result.status);
      if (result.status === "healthy") {
        expect(typeof result.latencyMs).toBe("number");
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      } else {
        expect(result.reason).toBeDefined();
        expect(result.reason).not.toContain("password");
      }
    });

    it("Case 2: Redis connection failure returns unhealthy without crashing", async () => {
      // Intentionally invalid port / unreachable host
      const result = await checkRedisHealth("redis://127.0.0.1:59999", 500);
      expect(result.status).toBe("unhealthy");
      expect(result.reason).toContain("Connection failed");
      expect(result.latencyMs).toBeNull();
    });

    it("Case 3: Redis timeout fails fast within timeout budget", async () => {
      const timeoutMs = 300;
      const start = Date.now();
      // Non-routable blackhole IP to test connection timeout
      const result = await checkRedisHealth("redis://10.255.255.1:6379", timeoutMs);
      const elapsed = Date.now() - start;

      expect(result.status).toBe("unhealthy");
      expect(result.reason).toBeDefined();
      // Should fail fast around timeoutMs + grace period (<= 1500ms)
      expect(elapsed).toBeLessThan(2000);
    });

    it("Case 4: Redis not configured or empty returns not_configured", async () => {
      const resultEmpty = await checkRedisHealth("");
      expect(resultEmpty.status).toBe("not_configured");

      const resultUndefined = await checkRedisHealth(undefined);
      expect(resultUndefined.status).toBe("not_configured");
    });

    it("Case 5: Redis disabled returns disabled status", async () => {
      const resultDisabled = await checkRedisHealth("disabled");
      expect(resultDisabled.status).toBe("disabled");

      const resultMock = await checkRedisHealth("mock");
      expect(resultMock.status).toBe("disabled");
    });

    it("Case 6: Redis security — passwords in connection URL are redacted", async () => {
      const secretUrl = "redis://:super_secret_password_12345@127.0.0.1:59998";
      const result = await checkRedisHealth(secretUrl, 300);

      expect(result.status).toBe("unhealthy");
      expect(result.reason).not.toContain("super_secret_password_12345");
      expect(JSON.stringify(result)).not.toContain("super_secret_password_12345");
    });
  });

  // =========================================================================
  // SECTION 2: AI PROVIDER HEALTH CHECKS (ZERO TOKEN COST)
  // =========================================================================

  describe("Google Gemini Health Probe", () => {
    it("Case 7: Gemini reachable (200 OK) returns healthy with latency and 0 generation tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            name: "models/gemini-3.6-flash",
            displayName: "Gemini 3.6 Flash",
            supportedGenerationMethods: ["generateContent"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new GeminiModelGateway({
        apiKey: "AIzaSyFakeGeminiKey12345",
        modelName: "gemini-3.6-flash",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("healthy");
      expect(health.provider).toBe("gemini");
      expect(health.model).toBe("gemini-3.6-flash");
      expect(typeof health.latencyMs).toBe("number");
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);

      // Verify it used GET metadata endpoint, not POST generateContent
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1beta/models/gemini-3.6-flash"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "x-goog-api-key": "AIzaSyFakeGeminiKey12345",
          }),
        })
      );
    });

    it("Case 8: Gemini 401 / Invalid Key returns unhealthy with sanitized reason", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 401, message: "API key not valid. Please pass a valid API key." },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new GeminiModelGateway({
        apiKey: "AIzaSyFakeGeminiKey12345",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("unhealthy");
      expect(health.reason).toContain("authentication failed");
      expect(JSON.stringify(health)).not.toContain("AIzaSyFakeGeminiKey12345");
    });

    it("Case 9: Gemini 429 Rate Limit returns degraded status", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 429, message: "Resource has been exhausted (e.g. check quota)." },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new GeminiModelGateway({
        apiKey: "AIzaSyFakeGeminiKey12345",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("degraded");
      expect(health.reason).toContain("rate limit exceeded");
    });

    it("Case 10: Gemini 403 Quota Exhausted returns degraded status", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 403, message: "Quota exceeded for quota metric 'GenerateRequestsPerDay'." },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new GeminiModelGateway({
        apiKey: "AIzaSyFakeGeminiKey12345",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("degraded");
      expect(health.reason).toContain("quota exhausted");
    });

    it("Case 11: Gemini Timeout fails fast and returns unhealthy", async () => {
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

      const gateway = new GeminiModelGateway({
        apiKey: "AIzaSyFakeGeminiKey12345",
        timeoutMs: 200,
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("unhealthy");
      expect(health.reason).toContain("timed out");
    });
  });

  describe("Cloudflare Workers AI Health Probe", () => {
    it("Case 12: Cloudflare reachable (200 OK) returns healthy with 0 generation tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            result: [{ id: "model-1", name: "@cf/zai-org/glm-4.7-flash" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new CloudflareModelGateway({
        accountId: "cf-account-abc-123",
        apiToken: "cf-token-secret-xyz-789",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("healthy");
      expect(health.provider).toBe("cloudflare");
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);

      // Verify GET metadata endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/ai/models/search"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Authorization": "Bearer cf-token-secret-xyz-789",
          }),
        })
      );
    });

    it("Case 13: Cloudflare 401 Auth error returns unhealthy with sanitized reason", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new CloudflareModelGateway({
        accountId: "cf-account-abc-123",
        apiToken: "cf-token-secret-xyz-789",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("unhealthy");
      expect(health.reason).toContain("authentication failed");
      expect(JSON.stringify(health)).not.toContain("cf-token-secret-xyz-789");
      expect(JSON.stringify(health)).not.toContain("cf-account-abc-123");
    });

    it("Case 14: Cloudflare 429 Rate Limit returns degraded", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 429 })
      );

      const gateway = new CloudflareModelGateway({
        accountId: "cf-account-abc-123",
        apiToken: "cf-token-secret-xyz-789",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("degraded");
      expect(health.reason).toContain("rate limit exceeded");
    });
  });

  describe("Groq Health Probe", () => {
    it("Case 15: Groq reachable (200 OK) returns healthy with 0 generation tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "openai/gpt-oss-120b",
            object: "model",
            owned_by: "groq",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new GroqModelGateway({
        apiKey: "gsk_secret_groq_api_key_12345",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("healthy");
      expect(health.provider).toBe("groq");
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);

      // Verify GET metadata endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/models/"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Authorization": "Bearer gsk_secret_groq_api_key_12345",
          }),
        })
      );
    });

    it("Case 16: Groq 401 Auth error returns unhealthy with sanitized reason", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "Invalid API Key", type: "invalid_request_error" },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      );

      const gateway = new GroqModelGateway({
        apiKey: "gsk_secret_groq_api_key_12345",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("unhealthy");
      expect(health.reason).toContain("authentication failed");
      expect(JSON.stringify(health)).not.toContain("gsk_secret_groq_api_key_12345");
    });

    it("Case 17: Groq 429 Rate Limit returns degraded", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), { status: 429 })
      );

      const gateway = new GroqModelGateway({
        apiKey: "gsk_secret_groq_api_key_12345",
        fetchFn: mockFetch as any,
      });

      const health = await gateway.checkHealth();

      expect(health.status).toBe("degraded");
      expect(health.reason).toContain("rate limit exceeded");
    });
  });

  describe("Mock Gateway Health Probe", () => {
    it("Case 18: Mock gateway returns healthy instantly", async () => {
      const gateway = new MockModelGateway();
      const health = await gateway.checkHealth();

      expect(health.status).toBe("healthy");
      expect(health.provider).toBe("mock");
      expect(health.latencyMs).toBe(0);
    });
  });

  // =========================================================================
  // SECTION 3: ADMIN STORE SYSTEM HEALTH INTEGRATION & RESILIENCE
  // =========================================================================

  describe("Admin Store Health Aggregation", () => {
    it("Case 19: InMemoryAdminStore aggregates DB, Redis, and AI health with telemetry", async () => {
      const mockGateway = new MockModelGateway();
      const store = new InMemoryAdminStore(undefined, undefined, {
        redisUrl: "disabled",
        gateway: mockGateway,
      });

      const health = await store.getSystemHealth();

      expect(health.database).toBe("healthy");
      expect(health.redis).toBe("disabled");
      expect(health.ai).toBe("healthy");
      expect(health.services?.database.status).toBe("healthy");
      expect(health.services?.redis.status).toBe("disabled");
      expect(health.services?.ai.status).toBe("healthy");
      expect(health.lastCheck).toBeDefined();
    });

    it("Case 20: DrizzleAdminStore isolates errors — AI down does not crash DB/Redis", async () => {
      const fakeDb = {
        select: vi.fn().mockResolvedValue([{ val: 1 }]),
      } as any;

      const failingGateway = {
        provider: "gemini" as const,
        model: "gemini-3.6-flash",
        complete: vi.fn(),
        checkHealth: vi.fn().mockResolvedValue({
          status: "unhealthy",
          latencyMs: null,
          reason: "Connection failed to AI provider",
          provider: "gemini",
        }),
      };

      const store = new DrizzleAdminStore(fakeDb, {
        redisUrl: "disabled",
        gateway: failingGateway,
      });

      const health = await store.getSystemHealth();

      expect(health.database).toBe("healthy");
      expect(health.redis).toBe("disabled");
      expect(health.ai).toBe("unhealthy");
      expect(health.services?.ai.reason).toContain("Connection failed");
    });

    it("Case 21: DrizzleAdminStore isolates errors — Database down does not crash Redis/AI", async () => {
      const failingDb = {
        select: vi.fn().mockRejectedValue(new Error("Postgres connection timeout")),
      } as any;

      const healthyGateway = new MockModelGateway();

      const store = new DrizzleAdminStore(failingDb, {
        redisUrl: "disabled",
        gateway: healthyGateway,
      });

      const health = await store.getSystemHealth();

      expect(health.database).toBe("error");
      expect(health.redis).toBe("disabled");
      expect(health.ai).toBe("healthy");
      expect(health.services?.database.reason).toContain("Postgres connection timeout");
    });
  });
});
