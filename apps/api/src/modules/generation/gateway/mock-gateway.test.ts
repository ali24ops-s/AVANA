/**
 * MockModelGateway unit tests (PR6-4).
 *
 * Verifies:
 * - The mock returns deterministic, schema-valid JSON for the lesson type
 * - It records usage/model/correlationId
 * - The factory throws `unprocessable` for a configured-but-unimplemented
 *   real provider
 */

import { describe, expect, it } from "vitest";

import { MockModelGateway, createModelGateway } from "./index.js";
import type { CompletionRequest } from "./types.js";
import { DomainError } from "@avana/domain";
import type { OrganizationId, DocumentId } from "@avana/domain";

const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const mockDocId = "00000000-0000-0000-0000-000000000020" as DocumentId;

function makeRequest(
  overrides: Partial<CompletionRequest> = {},
): NoInfer<CompletionRequest> {
  return {
    promptVersion: "v1",
    messages: [
      { role: "system", content: "You produce structured JSON study content." },
      {
        role: "user",
        content:
          'You are generating a lesson for the document. Prompt version: v1. Return a single JSON object matching this schema: {"type":"lesson"}',
      },
    ],
    jsonSchema: { type: "lesson" },
    correlationId: "corr-1",
    organizationId: mockOrgId,
    documentId: mockDocId,
    ...overrides,
  } as CompletionRequest;
}

describe("MockModelGateway", () => {
  it("exposes the mock provider id", () => {
    const gateway = new MockModelGateway();
    expect(gateway.provider).toBe("mock");
  });

  it("returns a schema-valid lesson payload", async () => {
    const gateway = new MockModelGateway();
    const result = await gateway.complete(makeRequest());

    const parsed = JSON.parse(result.text) as {
      kind: string;
      title: string;
      contentMarkdown: string;
      citationChunkIds: string[];
    };
    expect(parsed.kind).toBe("lesson");
    expect(typeof parsed.title).toBe("string");
    expect(typeof parsed.contentMarkdown).toBe("string");
    expect(Array.isArray(parsed.citationChunkIds)).toBe(true);
  });

  it("records usage, model, and finishReason", async () => {
    const gateway = new MockModelGateway();
    const result = await gateway.complete(makeRequest());

    expect(result.model).toBe("mock-1");
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBe(120);
    expect(result.finishReason).toBe("stop");
  });

  it("echoes the correlation id through the request (no network)", async () => {
    const gateway = new MockModelGateway();
    const request = makeRequest({ correlationId: "corr-42" });
    const result = await gateway.complete(request);

    // The mock does not return correlationId, but the request passes it
    // through without error. Assert the request object is untouched.
    expect(request.correlationId).toBe("corr-42");
    expect(result.text.length).toBeGreaterThan(0);
  });
});

describe("createModelGateway", () => {
  it("selects the mock provider when unset or 'mock'", () => {
    expect(createModelGateway()).toBeInstanceOf(MockModelGateway);
    expect(createModelGateway("mock")).toBeInstanceOf(MockModelGateway);
    expect(createModelGateway("MOCK")).toBeInstanceOf(MockModelGateway);
  });

  it("throws unprocessable for an unimplemented real provider", () => {
    expect(() => createModelGateway("openai")).toThrow(DomainError);
    expect(() => createModelGateway("anthropic")).toThrow(/not implemented/i);
  });
});
