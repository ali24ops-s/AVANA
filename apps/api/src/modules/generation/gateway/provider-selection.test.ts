// @ts-nocheck
/**
 * Provider Selection & Safety Tests.
 *
 * Verifies:
 * A) Default Provider is Gemini (Priority #1) with Fallback Disabled by default (Strict Single Provider).
 * B) Strict Single Primary Execution (AI_ENABLE_FALLBACK=false / default):
 *    - Gemini success -> returns response from Gemini.
 *    - Gemini failure -> returns exact Gemini error.
 *    - Gemini failure -> GapGPT is NOT called.
 *    - Gemini failure -> Groq is NOT called.
 *    - Gemini failure -> ArvanCloud is NOT called.
 *    - Gemini failure -> Cloudflare is NOT called.
 *    - When fallback is disabled, no other provider executes even if all keys are present.
 * C) Configurable Fallback Chain (AI_ENABLE_FALLBACK=true / enableFallback: true):
 *    - Gemini is called first; if it succeeds, GapGPT/Groq/Arvan/CF are never contacted.
 *    - If Gemini fails, fallback to GapGPT happens seamlessly.
 *    - If GapGPT also fails, fallback to Groq happens seamlessly.
 *    - If all fail, error is thrown.
 * D) Individual provider selections (Gemini, GapGPT, Groq, ArvanCloud, Cloudflare, Mock).
 * E) Precedence hierarchy: AI_PRIMARY_PROVIDER > AI_CONTENT_PROVIDER > AI_PROVIDER.
 * F) Groq schemas and adaptors remain intact and functional.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DomainError } from "@avana/domain";
import {
  createModelGateway,
  ArvanCloudModelGateway,
  GeminiModelGateway,
  GroqModelGateway,
  GapGPTModelGateway,
  CloudflareModelGateway,
  FallbackModelGateway,
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

const FAKE_ARVAN_KEY = "arvan_fake_secret_key_123456789";
const FAKE_GEMINI_KEY = "AIzaSyFakeGeminiApiKey123456789";
const FAKE_GROQ_KEY = "gsk_fake_groq_api_key_123456789";
const FAKE_GAPGPT_KEY = "gap_fake_gapgpt_api_key_123456789";
const FAKE_CF_ACCOUNT = "cf_account_123456789";
const FAKE_CF_TOKEN = "cf_token_123456789";

describe("Provider Selection & Safety Architecture", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PRIMARY_PROVIDER;
    delete process.env.AI_CONTENT_PROVIDER;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_ENABLE_FALLBACK;
    delete process.env.GAPGPT_API_KEY;
    delete process.env.GAPGPT_MODEL;
    delete process.env.GAPGPT_BASE_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_API_KEY_1;
    delete process.env.GEMINI_API_KEY_2;
    delete process.env.GROQ_API_KEY;
    delete process.env.ARVANCLOUD_API_KEY;
    delete process.env.ARVANCLOUD_API_TOKEN;
    delete process.env.ARVANCLOUD_MODEL;
    delete process.env.ARVANCLOUD_BASE_URL;
    delete process.env.ARVANCLOUD_AUTH_SCHEME;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Requirement 1: Default Provider is Gemini with Fallback Disabled by default
  // -------------------------------------------------------------------------
  describe("Requirement 1: Default Provider is Gemini (Priority #1)", () => {
    it("selects Gemini directly (not wrapped in FallbackModelGateway) when keys for all providers exist in env", () => {
      process.env.GEMINI_API_KEY = FAKE_GEMINI_KEY;
      process.env.GAPGPT_API_KEY = FAKE_GAPGPT_KEY;
      process.env.GROQ_API_KEY = FAKE_GROQ_KEY;
      process.env.ARVANCLOUD_API_KEY = FAKE_ARVAN_KEY;
      process.env.CLOUDFLARE_ACCOUNT_ID = FAKE_CF_ACCOUNT;
      process.env.CLOUDFLARE_API_TOKEN = FAKE_CF_TOKEN;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway.provider).toBe("gemini");
      expect(gateway.model).toBe("gemini-3.6-flash");
    });

    it("selects Gemini when createModelGateway is called with options and undefined provider", () => {
      const gateway = createModelGateway({ geminiApiKey: FAKE_GEMINI_KEY });
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway.provider).toBe("gemini");
    });

    it("throws DomainError when Gemini key is missing and Gemini is requested/default", () => {
      expect(() => createModelGateway()).toThrow(DomainError);
      expect(() => createModelGateway()).toThrow(
        "GEMINI_API_KEY is required when AI_PROVIDER is 'gemini'",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 2: Strict Gemini Execution with No Fallback (AI_ENABLE_FALLBACK=false)
  // -------------------------------------------------------------------------
  describe("Requirement 2: Strict Gemini Execution with Fallback Disabled", () => {
    it("Gemini success -> returns response directly from Gemini", async () => {
      let geminiCalls = 0;
      let gapgptCalls = 0;
      let groqCalls = 0;
      let arvanCalls = 0;
      let cfCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          geminiCalls++;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          kind: "lesson",
                          title: "Strict Gemini Lesson",
                          contentMarkdown: "# Gemini Only",
                          citationChunkIds: ["c1"],
                        }),
                      },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 60 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("api.gapgpt.app")) gapgptCalls++;
        if (urlStr.includes("api.groq.com")) groqCalls++;
        if (urlStr.includes("arvancloudai.ir")) arvanCalls++;
        if (urlStr.includes("api.cloudflare.com")) cfCalls++;
        return new Response("Not Found", { status: 404 });
      });

      const gateway = new GeminiModelGateway({
        apiKeys: [FAKE_GEMINI_KEY],
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await gateway.complete({
        promptVersion: "v1",
        messages: [{ role: "user", content: "Generate" }],
        correlationId: "test-strict-ok",
        organizationId: "org-1" as OrganizationId,
        documentId: "doc-1" as DocumentId,
      });

      expect(result.text).toContain("Strict Gemini Lesson");
      expect(geminiCalls).toBe(1);
      expect(gapgptCalls).toBe(0);
      expect(groqCalls).toBe(0);
      expect(arvanCalls).toBe(0);
      expect(cfCalls).toBe(0);
    });

    it("Gemini failure -> returns exact Gemini error and NEVER calls GapGPT, Groq, ArvanCloud, or Cloudflare", async () => {
      let geminiCalls = 0;
      let gapgptCalls = 0;
      let groqCalls = 0;
      let arvanCalls = 0;
      let cfCalls = 0;

      // Provide ALL keys in environment to prove that none are triggered when fallback is disabled
      process.env.GEMINI_API_KEY = FAKE_GEMINI_KEY;
      process.env.GAPGPT_API_KEY = FAKE_GAPGPT_KEY;
      process.env.GROQ_API_KEY = FAKE_GROQ_KEY;
      process.env.ARVANCLOUD_API_KEY = FAKE_ARVAN_KEY;
      process.env.CLOUDFLARE_ACCOUNT_ID = FAKE_CF_ACCOUNT;
      process.env.CLOUDFLARE_API_TOKEN = FAKE_CF_TOKEN;
      process.env.AI_ENABLE_FALLBACK = "false";

      const mockFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          geminiCalls++;
          return new Response(
            JSON.stringify({
              error: {
                message: "Resource has been exhausted (e.g. check quota).",
                code: 429,
                status: "RESOURCE_EXHAUSTED",
              },
            }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("api.gapgpt.app")) gapgptCalls++;
        if (urlStr.includes("api.groq.com")) groqCalls++;
        if (urlStr.includes("arvancloudai.ir")) arvanCalls++;
        if (urlStr.includes("api.cloudflare.com")) cfCalls++;
        return new Response("Not Found", { status: 404 });
      });

      const gateway = createModelGateway({
        geminiApiKey: FAKE_GEMINI_KEY,
        enableFallback: false,
      });

      // Verify that createModelGateway created a standalone Gemini gateway
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway).not.toBeInstanceOf(FallbackModelGateway);

      // Inject mock fetch directly into gateway instance for network interception
      (gateway as any).fetchFn = mockFetch;

      let caughtError: any;
      try {
        await gateway.complete({
          promptVersion: "v1",
          messages: [{ role: "user", content: "Generate" }],
          correlationId: "test-strict-fail",
          organizationId: "org-1" as OrganizationId,
          documentId: "doc-1" as DocumentId,
        });
      } catch (err) {
        caughtError = err;
      }

      // Assertions: exact Gemini error is thrown, and zero other providers were called
      expect(caughtError).toBeDefined();
      expect(caughtError).toBeInstanceOf(DomainError);
      expect(caughtError.message).toContain("Gemini API request failed");
      expect(geminiCalls).toBeGreaterThanOrEqual(1);
      expect(gapgptCalls).toBe(0);
      expect(groqCalls).toBe(0);
      expect(arvanCalls).toBe(0);
      expect(cfCalls).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 3: Configurable Multi-Provider Fallback Chain (enableFallback: true)
  // -------------------------------------------------------------------------
  describe("Requirement 3: Multi-Provider Fallback Chain (when enableFallback: true)", () => {
    it("instantiates FallbackModelGateway when enableFallback: true and multiple keys exist", () => {
      const gateway = createModelGateway({
        geminiApiKey: FAKE_GEMINI_KEY,
        gapgptApiKey: FAKE_GAPGPT_KEY,
        groqApiKey: FAKE_GROQ_KEY,
        enableFallback: true,
      });
      expect(gateway).toBeInstanceOf(FallbackModelGateway);
    });

    it("calls Gemini first and does NOT call GapGPT or Groq when Gemini succeeds", async () => {
      let geminiCalls = 0;
      let gapgptCalls = 0;
      let groqCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          geminiCalls++;
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          kind: "lesson",
                          title: "Gemini Success Lesson",
                          contentMarkdown: "# Gemini Content",
                          citationChunkIds: ["c1"],
                        }),
                      },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 80 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("api.gapgpt.app")) gapgptCalls++;
        if (urlStr.includes("api.groq.com")) groqCalls++;
        return new Response("Not Found", { status: 404 });
      });

      const gemini = new GeminiModelGateway({
        apiKeys: [FAKE_GEMINI_KEY],
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const gapgpt = new GapGPTModelGateway({
        apiKey: FAKE_GAPGPT_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const groq = new GroqModelGateway({
        apiKey: FAKE_GROQ_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const fallbackGateway = new FallbackModelGateway([gemini, gapgpt, groq]);

      const result = await fallbackGateway.complete({
        promptVersion: "v1",
        messages: [{ role: "user", content: "Generate content" }],
        correlationId: "test-corr-gemini-first",
        organizationId: "org-1" as OrganizationId,
        documentId: "doc-1" as DocumentId,
      });

      expect(result.text).toContain("Gemini Success Lesson");
      expect(geminiCalls).toBe(1);
      expect(gapgptCalls).toBe(0);
      expect(groqCalls).toBe(0);
    });

    it("falls back to GapGPT when Gemini fails, without calling Groq", async () => {
      let geminiCalls = 0;
      let gapgptCalls = 0;
      let groqCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          geminiCalls++;
          return new Response(
            JSON.stringify({ error: { message: "Gemini quota exhausted", code: 429 } }),
            { status: 429 },
          );
        }
        if (urlStr.includes("api.gapgpt.app")) {
          gapgptCalls++;
          return new Response(
            JSON.stringify({
              id: "chatcmpl-gapgpt-fb",
              model: "gpt-5.6-luna",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: JSON.stringify({
                      kind: "lesson",
                      title: "GapGPT Fallback Lesson",
                      contentMarkdown: "# GapGPT Content",
                      citationChunkIds: ["c1"],
                    }),
                  },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes("api.groq.com")) groqCalls++;
        return new Response("Not Found", { status: 404 });
      });

      const gemini = new GeminiModelGateway({
        apiKeys: [FAKE_GEMINI_KEY],
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const gapgpt = new GapGPTModelGateway({
        apiKey: FAKE_GAPGPT_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const groq = new GroqModelGateway({
        apiKey: FAKE_GROQ_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const fallbackGateway = new FallbackModelGateway([gemini, gapgpt, groq]);

      const result = await fallbackGateway.complete({
        promptVersion: "v1",
        messages: [{ role: "user", content: "Generate content" }],
        correlationId: "test-corr-fallback-gapgpt",
        organizationId: "org-1" as OrganizationId,
        documentId: "doc-1" as DocumentId,
      });

      expect(result.text).toContain("GapGPT Fallback Lesson");
      expect(geminiCalls).toBeGreaterThanOrEqual(1);
      expect(gapgptCalls).toBe(1);
      expect(groqCalls).toBe(0);
    });

    it("falls back to Groq when both Gemini and GapGPT fail", async () => {
      let geminiCalls = 0;
      let gapgptCalls = 0;
      let groqCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          geminiCalls++;
          return new Response(
            JSON.stringify({ error: { message: "Gemini quota exhausted", code: 429 } }),
            { status: 429 },
          );
        }
        if (urlStr.includes("api.gapgpt.app")) {
          gapgptCalls++;
          return new Response(
            JSON.stringify({ error: { message: "GapGPT rate limit exceeded" } }),
            { status: 429 },
          );
        }
        if (urlStr.includes("api.groq.com")) {
          groqCalls++;
          return new Response(
            JSON.stringify({
              id: "chatcmpl-groq-1",
              model: "openai/gpt-oss-120b",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: JSON.stringify({
                      kind: "lesson",
                      title: "Groq Fallback Lesson",
                      contentMarkdown: "# Groq Content",
                      citationChunkIds: ["c1"],
                    }),
                  },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 35, completion_tokens: 70, total_tokens: 105 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not Found", { status: 404 });
      });

      const gemini = new GeminiModelGateway({
        apiKeys: [FAKE_GEMINI_KEY],
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const gapgpt = new GapGPTModelGateway({
        apiKey: FAKE_GAPGPT_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const groq = new GroqModelGateway({
        apiKey: FAKE_GROQ_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const fallbackGateway = new FallbackModelGateway([gemini, gapgpt, groq]);

      const result = await fallbackGateway.complete({
        promptVersion: "v1",
        messages: [{ role: "user", content: "Generate content" }],
        correlationId: "test-corr-fallback-groq",
        organizationId: "org-1" as OrganizationId,
        documentId: "doc-1" as DocumentId,
      });

      expect(result.text).toContain("Groq Fallback Lesson");
      expect(geminiCalls).toBeGreaterThanOrEqual(1);
      expect(gapgptCalls).toBe(1);
      expect(groqCalls).toBe(1);
    });

    it("throws when all configured providers in fallback chain fail", async () => {
      const failingFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          return new Response(JSON.stringify({ error: { message: "Gemini down", code: 429 } }), { status: 429 });
        }
        return new Response(JSON.stringify({ error: { message: "GapGPT down" } }), { status: 401 });
      });

      const gemini = new GeminiModelGateway({
        apiKeys: [FAKE_GEMINI_KEY],
        fetchFn: failingFetch as unknown as typeof fetch,
      });
      const gapgpt = new GapGPTModelGateway({
        apiKey: FAKE_GAPGPT_KEY,
        fetchFn: failingFetch as unknown as typeof fetch,
      });

      const fallbackGateway = new FallbackModelGateway([gemini, gapgpt]);

      await expect(
        fallbackGateway.complete({
          promptVersion: "v1",
          messages: [{ role: "user", content: "Generate content" }],
          correlationId: "test-corr-all-fail",
          organizationId: "org-1" as OrganizationId,
          documentId: "doc-1" as DocumentId,
        }),
      ).rejects.toThrow();
    });

    it("integrates seamlessly into GenerationService", async () => {
      let geminiCalls = 0;
      let gapgptCalls = 0;

      const mockFetch = vi.fn().mockImplementation(async (url: string | URL) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com")) {
          geminiCalls++;
          return new Response(
            JSON.stringify({ error: { message: "Temporary quota limit", code: 429 } }),
            { status: 429 },
          );
        }
        if (urlStr.includes("api.gapgpt.app")) {
          gapgptCalls++;
          return new Response(
            JSON.stringify({
              id: "chatcmpl-service-fb",
              model: "gpt-5.6-luna",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: JSON.stringify({
                      kind: "lesson",
                      title: "Service Generated Lesson",
                      contentMarkdown: "# Service Content",
                      citationChunkIds: ["chunk-1"],
                    }),
                  },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not Found", { status: 404 });
      });

      const gemini = new GeminiModelGateway({
        apiKeys: [FAKE_GEMINI_KEY],
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const gapgpt = new GapGPTModelGateway({
        apiKey: FAKE_GAPGPT_KEY,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const fallbackGateway = new FallbackModelGateway([gemini, gapgpt]);

      const contentStore = new InMemoryGeneratedContentStore();
      const citationStore = new InMemoryGeneratedContentCitationStore();
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();

      const docId = "doc-fb-1" as DocumentId;
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
        },
      ]);

      const service = new GenerationService(
        contentStore,
        citationStore,
        fallbackGateway,
        docStore,
        chunkStore,
      );

      const res = await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson"],
      });

      expect(res.contents).toBeDefined();
      expect(res.contents.length).toBeGreaterThan(0);
      expect(res.contents[0].type).toBe("lesson");
      expect(geminiCalls).toBeGreaterThanOrEqual(1);
      expect(gapgptCalls).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 4: Individual Provider Selections
  // -------------------------------------------------------------------------
  describe("Requirement 4: Individual Provider Selections", () => {
    it("selects Gemini when AI_PRIMARY_PROVIDER=gemini", () => {
      process.env.AI_PRIMARY_PROVIDER = "gemini";
      process.env.GEMINI_API_KEY = FAKE_GEMINI_KEY;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(GeminiModelGateway);
      expect(gateway.provider).toBe("gemini");
    });

    it("selects GapGPT when AI_PRIMARY_PROVIDER=gapgpt", () => {
      process.env.AI_PRIMARY_PROVIDER = "gapgpt";
      process.env.GAPGPT_API_KEY = FAKE_GAPGPT_KEY;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(GapGPTModelGateway);
      expect(gateway.provider).toBe("gapgpt");
    });

    it("selects Groq when AI_PRIMARY_PROVIDER=groq", () => {
      process.env.AI_PRIMARY_PROVIDER = "groq";
      process.env.GROQ_API_KEY = FAKE_GROQ_KEY;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(GroqModelGateway);
      expect(gateway.provider).toBe("groq");
    });

    it("selects ArvanCloud when AI_PRIMARY_PROVIDER=arvancloud", () => {
      process.env.AI_PRIMARY_PROVIDER = "arvancloud";
      process.env.ARVANCLOUD_API_KEY = FAKE_ARVAN_KEY;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(ArvanCloudModelGateway);
      expect(gateway.provider).toBe("arvancloud");
      expect(gateway.model).toBe("DeepSeek-V4-Flash");
    });

    it("selects Cloudflare when AI_PRIMARY_PROVIDER=cloudflare", () => {
      process.env.AI_PRIMARY_PROVIDER = "cloudflare";
      process.env.CLOUDFLARE_ACCOUNT_ID = FAKE_CF_ACCOUNT;
      process.env.CLOUDFLARE_API_TOKEN = FAKE_CF_TOKEN;

      const gateway = createModelGateway();
      expect(gateway).toBeInstanceOf(CloudflareModelGateway);
      expect(gateway.provider).toBe("cloudflare");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 5: Precedence hierarchy
  // -------------------------------------------------------------------------
  describe("Requirement 5: Provider selection precedence hierarchy", () => {
    it("AI_PRIMARY_PROVIDER takes precedence over AI_CONTENT_PROVIDER and AI_PROVIDER", () => {
      process.env.AI_PRIMARY_PROVIDER = "gemini";
      process.env.AI_CONTENT_PROVIDER = "gapgpt";
      process.env.AI_PROVIDER = "groq";
      process.env.GEMINI_API_KEY = FAKE_GEMINI_KEY;

      const gateway = createModelGateway();
      expect(gateway.provider).toBe("gemini");
    });

    it("AI_CONTENT_PROVIDER takes precedence over AI_PROVIDER when AI_PRIMARY_PROVIDER is unset", () => {
      process.env.AI_CONTENT_PROVIDER = "gemini";
      process.env.AI_PROVIDER = "groq";
      process.env.GEMINI_API_KEY = FAKE_GEMINI_KEY;

      const gateway = createModelGateway();
      expect(gateway.provider).toBe("gemini");
    });

    it("AI_PROVIDER is used when AI_PRIMARY_PROVIDER and AI_CONTENT_PROVIDER are unset", () => {
      process.env.AI_PROVIDER = "gapgpt";
      process.env.GAPGPT_API_KEY = FAKE_GAPGPT_KEY;

      const gateway = createModelGateway();
      expect(gateway.provider).toBe("gapgpt");
    });
  });

  // -------------------------------------------------------------------------
  // Requirement 6: Groq adapters and schemas remain intact
  // -------------------------------------------------------------------------
  describe("Requirement 6: Groq adapters and schemas remain intact", () => {
    it("successfully adapts schemas to Groq strict JSON schema format", () => {
      const adaptedPlan = adaptToGroqJsonSchema({ type: "content_plan" });
      expect(adaptedPlan).not.toBeNull();
      expect(adaptedPlan?.name).toBe("content_plan");
      expect(adaptedPlan?.strict).toBe(true);

      const adaptedBatch = adaptToGroqJsonSchema({ type: "sessions_batch" });
      expect(adaptedBatch).not.toBeNull();
      expect(adaptedBatch?.name).toBe("sessions_batch");
      expect(adaptedBatch?.strict).toBe(true);
    });
  });
});
