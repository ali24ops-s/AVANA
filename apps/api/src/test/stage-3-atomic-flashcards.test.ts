/**
 * Stage 3 Atomic Flashcards Mandatory Regression Tests.
 *
 * Verifies:
 * 1. Single-Session Execution: 3 sessions -> exactly 3 model calls.
 * 2. Strict Session Source Grounding: Each model call only receives chunks of that specific session.
 * 3. Empty relevantChunkIds Safeguard: 0 model calls and NO fallback to full document chunks.
 * 4. Citation Sanitization: No invalid or hallucinated citationChunkId enters the output.
 * 5. Full Lesson Content: lessonContent is sent in full without 1800-character truncation.
 * 6. Single Source of Truth: Prompt Registry and Generation Service use the exact same prompt.
 */

import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  Actor,
  CourseId,
  DocumentChunkId,
  DocumentId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import { RoleBasedPolicy } from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import {
  FLASHCARD_GENERATION_SYSTEM_PROMPT,
  buildFlashcardGenerationUserPrompt,
} from "../modules/generation/prompt-registry.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { CompletionRequest, CompletionResult, ModelGateway } from "../modules/generation/gateway/types.js";

function makeDoc(id: DocumentId, orgId: OrganizationId, courseId: CourseId) {
  return {
    id,
    organizationId: orgId,
    courseId,
    uploadedBy: "00000000-0000-0000-0000-000000000001" as UserId,
    filename: "cardiology.pdf",
    originalName: "cardiology.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    pageCount: 10,
    status: "extracted" as const,
    errorCode: null,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}

describe("Stage 3: Atomic Flashcards Mandatory Regression Tests", () => {
  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as UserId,
    role: "organization_admin",
  };

  it("1 & 2: 3 sessions produce exactly 3 model calls, each receiving only chunks of that session", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    await docStore.create(makeDoc(docId, orgId, courseId));

    const chunk1Id = randomUUID() as DocumentChunkId;
    const chunk2Id = randomUUID() as DocumentChunkId;
    const chunk3Id = randomUUID() as DocumentChunkId;

    await chunkStore.createMany([
      {
        id: chunk1Id,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 0,
        heading: "بخش ۱: مسدودکننده‌های بتا",
        content: "متن تخصصی مسدودکننده‌های بتا و مکانیسم کاهش ضربان قلب.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
      {
        id: chunk2Id,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 1,
        heading: "بخش ۲: مسدودکننده‌های کانال کلسیم",
        content: "متن تخصصی وراپامیل و دیلتیازم در کاهش انقباض عضله میوکارد.",
        startPage: 3,
        endPage: 4,
        tokenEstimate: 50,
        contentHash: "hash-2",
        createdAt: new Date().toISOString(),
      },
      {
        id: chunk3Id,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 2,
        heading: "بخش ۳: مهارکننده‌های ACE",
        content: "متن تخصصی کاپتوپریل و انالاپریل و مکانیسم مهار تبدیل آنژیوتانسین.",
        startPage: 5,
        endPage: 6,
        tokenEstimate: 50,
        contentHash: "hash-3",
        createdAt: new Date().toISOString(),
      },
    ]);

    const flashcardCalls: CompletionRequest[] = [];

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === FLASHCARD_GENERATION_SYSTEM_PROMPT) {
          flashcardCalls.push(req);
          const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
          const chunkIdsMatch = userMsg.match(/AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/);
          const chunkIds = chunkIdsMatch ? JSON.parse(chunkIdsMatch[1]) : [];

          return {
            text: JSON.stringify({
              kind: "flashcards",
              cards: [
                {
                  question: "مکانیسم داروی این جلسه چیست؟",
                  answer: "مهار اختصاصی گیرنده هدف.",
                  explanation: "مستند به منبع.",
                  cardType: "mechanism",
                  difficulty: "medium",
                  citationChunkIds: chunkIds,
                },
              ],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning step
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی قلب و عروق",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه ۱: مسدودکننده‌های بتا",
                description: "بررسی بتا بلاکرها",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetFlashcardCount: 5,
              },
              {
                index: 1,
                title: "جلسه ۲: مسدودکننده‌های کلسیم",
                description: "بررسی CCBها",
                coreConcepts: [],
                relevantChunkIds: [chunk2Id],
                targetFlashcardCount: 5,
              },
              {
                index: 2,
                title: "جلسه ۳: مهارکننده‌های ACE",
                description: "بررسی ACEIها",
                coreConcepts: [],
                relevantChunkIds: [chunk3Id],
                targetFlashcardCount: 5,
              },
            ],
            highYieldFacts: [],
            citationChunkIds: [chunk1Id, chunk2Id, chunk3Id],
          }),
          model: "mock-test",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      },
    };

    const service = new GenerationService(
      genStore,
      citStore,
      mockGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["flashcard"],
      promptVersion: "v1",
      courseId,
    });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].type).toBe("flashcard");

    // Assertion 1: 3 sessions -> exactly 3 model calls
    expect(flashcardCalls).toHaveLength(3);

    // Assertion 2: Each model call only receives chunks of that specific session
    const prompt1 = flashcardCalls[0].messages.find((m) => m.role === "user")!.content;
    const prompt2 = flashcardCalls[1].messages.find((m) => m.role === "user")!.content;
    const prompt3 = flashcardCalls[2].messages.find((m) => m.role === "user")!.content;

    // Call 1 contains chunk1 and its content, but NOT chunk2 or chunk3
    expect(prompt1).toContain(chunk1Id);
    expect(prompt1).toContain("متن تخصصی مسدودکننده‌های بتا");
    expect(prompt1).not.toContain(chunk2Id);
    expect(prompt1).not.toContain(chunk3Id);

    // Call 2 contains chunk2 and its content, but NOT chunk1 or chunk3
    expect(prompt2).toContain(chunk2Id);
    expect(prompt2).toContain("متن تخصصی وراپامیل و دیلتیازم");
    expect(prompt2).not.toContain(chunk1Id);
    expect(prompt2).not.toContain(chunk3Id);

    // Call 3 contains chunk3 and its content, but NOT chunk1 or chunk2
    expect(prompt3).toContain(chunk3Id);
    expect(prompt3).toContain("متن تخصصی کاپتوپریل و انالاپریل");
    expect(prompt3).not.toContain(chunk1Id);
    expect(prompt3).not.toContain(chunk2Id);
  });

  it("3: Session with relevantChunkIds: [] skips model call with NO fallback to full document chunks", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    await docStore.create(makeDoc(docId, orgId, courseId));

    const chunk1Id = randomUUID() as DocumentChunkId;
    await chunkStore.createMany([
      {
        id: chunk1Id,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 0,
        heading: "بخش ۱",
        content: "محتوای بخش ۱",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 20,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const flashcardCalls: CompletionRequest[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === FLASHCARD_GENERATION_SYSTEM_PROMPT) {
          flashcardCalls.push(req);
          return {
            text: JSON.stringify({
              kind: "flashcards",
              cards: [
                {
                  question: "سؤال ۱؟",
                  answer: "پاسخ ۱.",
                  cardType: "mechanism",
                  difficulty: "medium",
                  citationChunkIds: [chunk1Id],
                },
              ],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning step with 2 sessions: session 2 has relevantChunkIds: []
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "بررسی ایزولاسیون",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه ۱: معتبر",
                description: "دارای چانک",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetFlashcardCount: 3,
              },
              {
                index: 1,
                title: "جلسه ۲: نامعتبر",
                description: "فاقد چانک",
                coreConcepts: [],
                relevantChunkIds: [],
                targetFlashcardCount: 3,
              },
            ],
            highYieldFacts: [],
            citationChunkIds: [chunk1Id],
          }),
          model: "mock-test",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      },
    };

    const service = new GenerationService(
      genStore,
      citStore,
      mockGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    await service.generateForDocument(actor, orgId, docId, {
      types: ["flashcard"],
      promptVersion: "v1",
      courseId,
    });

    // Exactly 1 call was made (for Session 1). Session 2 was skipped!
    expect(flashcardCalls).toHaveLength(1);

    // Diagnostic warning was emitted for Session 2
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Stage 3 Diagnostic Warning: Session 2/2"),
    );

    stderrSpy.mockRestore();
  });

  it("4: Filters out invalid or hallucinated citationChunkIds per flashcard", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    await docStore.create(makeDoc(docId, orgId, courseId));

    const validChunkId = randomUUID() as DocumentChunkId;
    const fakeChunkId = "fake-hallucinated-chunk-999";

    await chunkStore.createMany([
      {
        id: validChunkId,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 0,
        heading: "بخش معتبر",
        content: "محتوای معتبر چانک.",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 20,
        contentHash: "h1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === FLASHCARD_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "flashcards",
              cards: [
                {
                  question: "سؤال تست اعتبارسنجی ارجاع؟",
                  answer: "پاسخ تست.",
                  cardType: "key_fact",
                  difficulty: "medium",
                  citationChunkIds: [validChunkId, fakeChunkId],
                },
              ],
              citationChunkIds: [validChunkId, fakeChunkId],
            }),
            model: "mock-test",
            usage: { inputTokens: 40, outputTokens: 40 },
            finishReason: "stop",
          };
        }

        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "تست ارجاع",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه تست",
                description: "توضیح",
                coreConcepts: [],
                relevantChunkIds: [validChunkId],
                targetFlashcardCount: 2,
              },
            ],
            highYieldFacts: [],
            citationChunkIds: [validChunkId],
          }),
          model: "mock-test",
          usage: { inputTokens: 40, outputTokens: 40 },
          finishReason: "stop",
        };
      },
    };

    const service = new GenerationService(
      genStore,
      citStore,
      mockGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["flashcard"],
      promptVersion: "v1",
      courseId,
    });

    const flashcard = result.contents.find((c) => c.type === "flashcard");
    expect(flashcard).toBeDefined();

    const payload = flashcard!.payload as {
      cards: Array<{ question: string; citationChunkIds: string[] }>;
      citationChunkIds: string[];
    };

    // The fake hallucinated chunk MUST be filtered out from cards and payload
    expect(payload.cards[0].citationChunkIds).toEqual([validChunkId]);
    expect(payload.cards[0].citationChunkIds).not.toContain(fakeChunkId);
    expect(payload.citationChunkIds).toContain(validChunkId);
    expect(payload.citationChunkIds).not.toContain(fakeChunkId);
  });

  it("5: Sends complete lessonContent without 1800-character truncation", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    await docStore.create(makeDoc(docId, orgId, courseId));

    const chunkId = randomUUID() as DocumentChunkId;
    await chunkStore.createMany([
      {
        id: chunkId,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 0,
        heading: "بخش طولانی",
        content: "محتوای بخش طولانی.",
        startPage: 1,
        endPage: 5,
        tokenEstimate: 100,
        contentHash: "hash-long",
        createdAt: new Date().toISOString(),
      },
    ]);

    // Create long lesson content (>3500 characters)
    const longLessonTail = "این متن انتهای درس است که در کاراکتر شماره ۳۵۰۰ قرار گرفته است و نباید ترانکیت شود.";
    const longLessonMarkdown = `# عنوان درس کامل\n\n${"توضیحات آموزشی میانی درس. ".repeat(150)}\n\n## نکات پایانی\n${longLessonTail}`;
    expect(longLessonMarkdown.length).toBeGreaterThan(3000);

    let capturedPrompt = "";

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === FLASHCARD_GENERATION_SYSTEM_PROMPT) {
          capturedPrompt = req.messages.find((m) => m.role === "user")?.content ?? "";
          return {
            text: JSON.stringify({
              kind: "flashcards",
              cards: [
                {
                  question: "سؤال؟",
                  answer: "پاسخ.",
                  cardType: "key_fact",
                  difficulty: "easy",
                  citationChunkIds: [chunkId],
                },
              ],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        if (req.jsonSchema && (req.jsonSchema as { type: string }).type === "session") {
          return {
            text: JSON.stringify({
              kind: "session",
              title: "جلسه طولانی",
              contentMarkdown: longLessonMarkdown,
              citationChunkIds: [chunkId],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "تست متن کامل",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه ۱",
                description: "درس طولانی",
                coreConcepts: [],
                relevantChunkIds: [chunkId],
                targetFlashcardCount: 2,
              },
            ],
            highYieldFacts: [],
            citationChunkIds: [chunkId],
          }),
          model: "mock-test",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      },
    };

    const service = new GenerationService(
      genStore,
      citStore,
      mockGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson", "flashcard"],
      promptVersion: "v1",
      courseId,
    });

    expect(capturedPrompt).toContain(longLessonTail);
  });

  it("6: GenerationService and PromptRegistry use the exact same prompt with zero drift", async () => {
    const docId = randomUUID() as DocumentId;
    const docStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    const genStore = new InMemoryGeneratedContentStore();
    const citStore = new InMemoryGeneratedContentCitationStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);

    await docStore.create(makeDoc(docId, orgId, courseId));

    const chunkId = randomUUID() as DocumentChunkId;
    await chunkStore.createMany([
      {
        id: chunkId,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 0,
        heading: "سربرگ",
        content: "محتوای چانک استاندارد",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 20,
        contentHash: "hash-exact",
        createdAt: new Date().toISOString(),
      },
    ]);

    let capturedPrompt = "";

    const testLessonMarkdown =
      "# درس جلسه یکپارچه\nمحتوای آزمایشی کامل برای تست تطابق بدون دریفت در سامانه آموزشی آوانا که طول متن آن بیش از صد کاراکتر بوده و به عنوان محتوای جلسه پذیرفته می‌شود.";

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === FLASHCARD_GENERATION_SYSTEM_PROMPT) {
          capturedPrompt = req.messages.find((m) => m.role === "user")?.content ?? "";
          return {
            text: JSON.stringify({
              kind: "flashcards",
              cards: [
                {
                  question: "سؤال؟",
                  answer: "پاسخ.",
                  cardType: "definition",
                  difficulty: "easy",
                  citationChunkIds: [chunkId],
                },
              ],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        if (req.jsonSchema && (req.jsonSchema as { type: string }).type === "session") {
          return {
            text: JSON.stringify({
              kind: "session",
              title: "جلسه یکپارچه",
              contentMarkdown: testLessonMarkdown,
              citationChunkIds: [chunkId],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "تست یکپارچگی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه یکپارچه",
                description: "توضیحات یکپارچه",
                coreConcepts: [],
                relevantChunkIds: [chunkId],
                targetFlashcardCount: 8,
              },
            ],
            highYieldFacts: [],
            citationChunkIds: [chunkId],
          }),
          model: "mock-test",
          usage: { inputTokens: 50, outputTokens: 50 },
          finishReason: "stop",
        };
      },
    };

    const service = new GenerationService(
      genStore,
      citStore,
      mockGateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    await service.generateForDocument(actor, orgId, docId, {
      types: ["lesson", "flashcard"],
      promptVersion: "v1",
      courseId,
    });

    const expectedPrompt = buildFlashcardGenerationUserPrompt({
      documentTitle: "cardiology.pdf",
      sessionBlueprint: JSON.stringify(
        {
          index: 0,
          title: "جلسه یکپارچه",
          description: "توضیحات یکپارچه",
          coreConcepts: [],
          relevantChunkIds: [chunkId],
        },
        null,
        2,
      ),
      targetFlashcardCount: 8,
      lessonContent: testLessonMarkdown,
      chunkContext: `[Chunk ID: ${chunkId}] (Index 1) - سربرگ:\nمحتوای چانک استاندارد`,
      chunkIdList: [chunkId],
    });

    expect(capturedPrompt).toBe(expectedPrompt);
  });
});
