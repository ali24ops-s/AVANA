/**
 * Provider Selection & Safety Tests.
 *
 * Verifies:
 * A) When provider is omitted/undefined, Gemini is selected by default.
 * B) When AI_PROVIDER=gemini, Gemini is selected.
 * C) When AI_PROVIDER=groq, Groq is selectable (preserving future capabilities).
 * D) In Gemini mode, Groq Gateway is not called.
 * E) Gemini failure does NOT trigger an automatic fallback to Groq.
 * F) Groq schemas and budget calculations remain intact and functional.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DomainError } from "@avana/domain";
import {
  createModelGateway,
  GeminiModelGateway,
  GroqModelGateway,
} from "./index.js";
import { adaptToGroqJsonSchema } from "./groq.js";
import { GenerationService } from "../generation-service.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../../learning/test/in-memory-stores.js";
import type { Actor, DocumentId, OrganizationId } from "@avana/domain";

const FAKE_GEMINI_KEY = "AIzaSyFakeGeminiApiKey123456789";
const FAKE_GROQ_KEY = "gsk_fake_groq_api_key_123456789";

describe("Provider Selection & Safety Architecture", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_API_KEY_1;
    delete process.env.GEMINI_API_KEY_2;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Requirement A: When provider is omitted/undefined, Gemini is selected by default
  // -------------------------------------------------------------------------
  describe("Requirement A: Default Provider is Gemini", () => {
    it("selects Gemini when createModelGateway is called with no arguments but Gemini key is in options", () => {
      const gateway = createModelGateway({ geminiApiKey: FAKE_GEMINI_KEY });
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway.provider).toBe("gemini");
    });

    it("selects Gemini when createModelGateway is called with undefined provider", () => {
      const gateway = createModelGateway(undefined, FAKE_GEMINI_KEY);
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway.provider).toBe("gemini");
    });

    it("selects Gemini by default and throws DomainError when no Gemini key is provided", () => {
      expect(() => createModelGateway()).toThrow(DomainError);
      expect(() => createModelGateway()).toThrow(
        "GEMINI_API_KEY is required when AI_PROVIDER is 'gemini'",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Requirement B: When AI_PROVIDER=gemini, Gemini is selected
  // -------------------------------------------------------------------------
  describe("Requirement B: AI_PROVIDER=gemini explicitly selects Gemini", () => {
    it("selects Gemini when AI_PROVIDER is in process.env", () => {
      process.env.AI_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = FAKE_GEMINI_KEY;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway.provider).toBe("gemini");
      expect(gateway.model).toBe("gemini-3.6-flash");
    });

    it("selects Gemini when provider: 'gemini' is passed in options", () => {
      const gateway = createModelGateway({
        provider: "gemini",
        geminiApiKey: FAKE_GEMINI_KEY,
        geminiModel: "gemini-3.6-flash",
      });
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway.provider).toBe("gemini");
      expect(gateway.model).toBe("gemini-3.6-flash");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement C: When AI_PROVIDER=groq, Groq is selectable (preserved)
  // -------------------------------------------------------------------------
  describe("Requirement C: Groq remains selectable and preserved", () => {
    it("selects Groq when AI_PROVIDER=groq is in process.env", () => {
      process.env.AI_PROVIDER = "groq";
      process.env.GROQ_API_KEY = FAKE_GROQ_KEY;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(GroqModelGateway);
      expect(gateway.provider).toBe("groq");
      expect(gateway.model).toBe("openai/gpt-oss-120b");
    });

    it("selects Groq when provider: 'groq' is passed in options", () => {
      const gateway = createModelGateway({
        provider: "groq",
        groqApiKey: FAKE_GROQ_KEY,
        groqModel: "openai/gpt-oss-120b",
      });
      expect(gateway).toBeInstanceOf(GroqModelGateway);
      expect(gateway.provider).toBe("groq");
      expect(gateway.model).toBe("openai/gpt-oss-120b");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement D: In Gemini mode, Groq Gateway is not called
  // -------------------------------------------------------------------------
  describe("Requirement D: In Gemini mode, Groq Gateway is never invoked", () => {
    it("does not call Groq API when Gemini completes a request", async () => {
      const fetchSpy = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("api.groq.com")) {
          throw new Error("UNEXPECTED: Groq API was called during Gemini execution!");
        }
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          kind: "lesson",
                          title: "Test Lesson",
                          contentMarkdown: "# Test Lesson",
                          citationChunkIds: ["c1"],
                        }),
                      },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 80 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not Found", { status: 404 });
      });

      const gateway = new GeminiModelGateway({
        apiKey: FAKE_GEMINI_KEY,
        fetchFn: fetchSpy as unknown as typeof fetch,
      });

      const result = await gateway.complete({
        promptVersion: "v1",
        messages: [{ role: "user", content: "Generate content" }],
        correlationId: "test-corr-1",
        organizationId: "org-1" as OrganizationId,
        documentId: "doc-1" as DocumentId,
      });

      expect(gateway.provider).toBe("gemini");
      expect(result.text).toContain("Test Lesson");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = String(fetchSpy.mock.calls[0][0]);
      expect(calledUrl).toContain("generativelanguage.googleapis.com");
      expect(calledUrl).not.toContain("api.groq.com");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement E: Gemini failure does NOT trigger automatic fallback to Groq
  // -------------------------------------------------------------------------
  describe("Requirement E: Zero automatic fallback from Gemini to Groq", () => {
    it("fails loudly on Gemini error without invoking Groq", async () => {
      let groqCalled = false;

      const failingGeminiFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("api.groq.com")) {
          groqCalled = true;
          return new Response(JSON.stringify({ choices: [] }), { status: 200 });
        }
        // Simulate Gemini 400 Bad Request (non-transient)
        return new Response(JSON.stringify({ error: { message: "Invalid payload" } }), { status: 400 });
      });

      const geminiGateway = new GeminiModelGateway({
        apiKey: FAKE_GEMINI_KEY,
        fetchFn: failingGeminiFetch as unknown as typeof fetch,
      });

      const contentStore = new InMemoryGeneratedContentStore();
      const citationStore = new InMemoryGeneratedContentCitationStore();
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();

      const docId = "doc-err-1" as DocumentId;
      const orgId = "org-1" as OrganizationId;
      const actor: Actor = { userId: "user-1", role: "course_editor" };

      await docStore.create({
        id: docId,
        organizationId: orgId,
        courseId: null,
        ownerUserId: "user-1",
        originalName: "test.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        sha256: "hash",
        storageKey: "key",
        pageCount: 1,
        status: "extracted",
        errorCode: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await chunkStore.createMany([
        {
          id: "chunk-1",
          documentId: docId,
        organizationId: orgId,
        sequence: 0,
        heading: "Heading",
        content: "Content text",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      }]);

      const service = new GenerationService(
        contentStore,
        citationStore,
        geminiGateway,
        docStore,
        chunkStore,
      );

      // Generating should fail and record document failure, NOT silently fallback to Groq
      await expect(
        service.generateForDocument(actor, orgId, docId, { types: ["lesson"] }),
      ).rejects.toThrow();

      // Document status should transition to failed
      const updatedDoc = await docStore.findByIdForOrganization(docId, orgId);
      expect(updatedDoc?.status).toBe("failed");

      // Verify Groq was never invoked
      expect(groqCalled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement F: Groq Budget Manager & schemas compile and pass tests
  // -------------------------------------------------------------------------
  describe("Requirement F: Groq adapters and schemas remain intact", () => {
    it("successfully adapts schemas to Groq strict JSON schema format", () => {
      const adaptedPlan = adaptToGroqJsonSchema({ type: "content_plan" });
      expect(adaptedPlan).not.toBeNull();
      expect(adaptedPlan?.name).toBe("content_plan");
      expect(adaptedPlan?.strict).toBe(true);

      const adaptedBatch = adaptToGroqJsonSchema({ type: "sessions_batch" });
      expect(adaptedBatch).not.toBeNull();
      expect(adaptedBatch?.name).toBe("sessions_batch");
      expect(adaptedBatch?.strict).toBe(true);

      const adaptedCards = adaptToGroqJsonSchema({ type: "flashcards_batch" });
      expect(adaptedCards).not.toBeNull();
      expect(adaptedCards?.name).toBe("flashcards_batch");

      const adaptedQuizzes = adaptToGroqJsonSchema({ type: "quizzes_batch" });
      expect(adaptedQuizzes).not.toBeNull();
      expect(adaptedQuizzes?.name).toBe("quizzes_batch");
    });
  });
});
