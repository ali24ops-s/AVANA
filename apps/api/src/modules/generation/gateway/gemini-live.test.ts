/**
 * Isolated Live Integration Test for GeminiModelGateway.
 *
 * This test is completely isolated from standard test suites:
 * - Only runs when live testing flag is enabled and live key is present.
 * - Skips automatically when running standard test suites (e.g. in CI or local dev).
 * - Never prints, logs, or exposes any credentials.
 */

import { describe, expect, it } from "vitest";
import { GeminiModelGateway } from "./gemini.js";
import type { CompletionRequest } from "./types.js";
import type { OrganizationId, DocumentId } from "@avana/domain";

const hasLiveApiKey = Boolean(
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0,
);
const shouldRunLive = process.env.RUN_LIVE_GEMINI_TESTS === "true" && hasLiveApiKey;

describe.skipIf(!shouldRunLive)("GeminiModelGateway Live API Integration", () => {
  it(
    "successfully calls Google Gemini API and receives valid structured JSON",
    async () => {
    const apiKey = process.env.GEMINI_API_KEY!;
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";

    const gateway = new GeminiModelGateway({
      apiKey,
      modelName: model,
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
      correlationId: "live-test-1",
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
});
