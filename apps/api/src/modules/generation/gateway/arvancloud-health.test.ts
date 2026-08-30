/**
 * Health check & Integration Test for ArvanCloudModelGateway.
 *
 * Design:
 * - Mocked health check runs in all environments (CI / local tests).
 * - Live integration test is conditionally enabled ONLY when RUN_ARVANCLOUD_INTEGRATION_TESTS is true
 *   and ARVANCLOUD_API_KEY / ARVANCLOUD_API_TOKEN is present.
 * - ZERO credential exposure guarantee: API key/token is never logged or exposed in test reports.
 */

import { describe, expect, it, vi } from "vitest";
import { ArvanCloudModelGateway } from "./arvancloud.js";
import type { CompletionRequest } from "./types.js";
import type { OrganizationId, DocumentId } from "@avana/domain";

const rawToken =
  process.env.ARVANCLOUD_API_TOKEN || process.env.ARVANCLOUD_API_KEY || "";
const hasLiveApiKey = Boolean(rawToken && rawToken.trim().length > 0);
const shouldRunLive =
  process.env.RUN_ARVANCLOUD_INTEGRATION_TESTS === "true" && hasLiveApiKey;

describe("ArvanCloud Health Check & Diagnostics", () => {
  it("executes simulated health check roundtrip successfully with zero credential leakage", async () => {
    const fakeKey = "test-health-key";
    let authHeaderValue = "";
    let requestedUrl = "";

    const mockFetch = vi.fn().mockImplementation(async (url: string, opts: RequestInit) => {
      requestedUrl = url;
      authHeaderValue = (opts.headers as Record<string, string>)?.["Authorization"] || "";
      return new Response(
        JSON.stringify({
          id: "chatcmpl-health-check",
          model: "DeepSeek-V4-Flash",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  status: "healthy",
                  provider: "arvancloud",
                  model: "DeepSeek-V4-Flash",
                  timestamp: new Date().toISOString(),
                }),
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const gateway = new ArvanCloudModelGateway({
      apiKey: fakeKey,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const request: CompletionRequest = {
      promptVersion: "v1",
      messages: [{ role: "user", content: "Ping health check" }],
      jsonSchema: { type: "health" },
      correlationId: "corr-health-1",
      organizationId: "00000000-0000-0000-0000-000000000001" as OrganizationId,
      documentId: "00000000-0000-0000-0000-000000000002" as DocumentId,
    };

    const result = await gateway.complete(request);

    expect(result.finishReason).toBe("stop");
    expect(result.usage.inputTokens).toBe(15);
    expect(result.usage.outputTokens).toBe(25);
    expect(authHeaderValue).toBe(`apikey ${fakeKey}`);
    expect(requestedUrl).toBe(
      `https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/chat/completions`,
    );

    const parsed = JSON.parse(result.text);
    expect(parsed.status).toBe("healthy");
    expect(parsed.provider).toBe("arvancloud");
    expect(parsed.model).toBe("DeepSeek-V4-Flash");
  });
});

describe.skipIf(!shouldRunLive)(
  "ArvanCloudModelGateway Live Integration Test (Conditional)",
  () => {
    it(
      "successfully connects to ArvanCloud AI API and returns valid structured output",
      async () => {
        const apiKey = rawToken;
        const model = process.env.ARVANCLOUD_MODEL || "DeepSeek-R1-qwen-7b-awq";
        const baseUrl = process.env.ARVANCLOUD_BASE_URL;

        const gateway = new ArvanCloudModelGateway({
          apiKey,
          modelName: model,
          baseUrl,
          timeoutMs: 30_000,
        });

        const request: CompletionRequest = {
          promptVersion: "v1",
          messages: [
            {
              role: "system",
              content: "You produce structured educational JSON content.",
            },
            {
              role: "user",
              content:
                'Generate a lesson JSON for the topic "Beta-Blocker Mechanism". Return ONLY a JSON object: {"kind":"lesson","title":"Beta Blockers","contentMarkdown":"# Beta Blockers\\n\\nMechanism of action...","citationChunkIds":["chk_1"]}',
            },
          ],
          jsonSchema: { type: "lesson" },
          correlationId: "arvan-live-test-1",
          organizationId: "00000000-0000-0000-0000-000000000001" as OrganizationId,
          documentId: "00000000-0000-0000-0000-000000000002" as DocumentId,
        };

        const result = await gateway.complete(request);

        expect(result.text.length).toBeGreaterThan(0);
        expect(result.usage.inputTokens).toBeGreaterThan(0);
        expect(result.usage.outputTokens).toBeGreaterThan(0);

        const parsed = JSON.parse(result.text);
        expect(parsed.kind).toBe("lesson");
        expect(typeof parsed.title).toBe("string");
        expect(typeof parsed.contentMarkdown).toBe("string");
        expect(Array.isArray(parsed.citationChunkIds)).toBe(true);
      },
      60_000,
    );
  },
);
