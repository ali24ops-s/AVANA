import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  RoleBasedPolicy,
} from "@avana/domain";
import { GenerationService } from "./generation-service.js";
import type { ModelGateway, CompletionRequest, CompletionResponse } from "./gateway/types.js";
import { isDeepSeekProvider } from "./gateway/types.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationChunkStore,
} from "./test/in-memory-stores.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
} from "../learning/learning-store.js";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";

function makeDocument(
  overrides: Partial<DocumentRecord> & { id: DocumentId },
  organizationId: OrganizationId,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    organizationId,
    courseId: randomUUID() as CourseId,
    ownerUserId: randomUUID() as DocumentRecord["ownerUserId"],
    originalName: "medical_textbook.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    sha256: "b".repeat(64),
    storageKey: `uploads/${overrides.id}.pdf`,
    pageCount: 15,
    status: "extracted",
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeChunks(
  documentId: DocumentId,
  organizationId: OrganizationId,
  count = 6,
): DocumentChunkRecord[] {
  const now = new Date().toISOString();
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i + 1}` as DocumentChunkRecord["id"],
    documentId,
    organizationId,
    chunkIndex: i,
    sequence: i + 1,
    heading: `فصل ${i + 1}`,
    content: `محتوای متنی فصل ${i + 1} درباره مباحث پزشکی و دارویی.`,
    startPage: i + 1,
    endPage: i + 1,
    characterCount: 300,
    tokenEstimate: 60,
    sha256: "c".repeat(64),
    contentHash: `hash-${i}`,
    createdAt: now,
  }));
}

/**
 * Flexible Mock Gateway configured for DeepSeek or Gemini with custom session count support.
 */
class FlexibleMockGateway implements ModelGateway {
  public calls: CompletionRequest[] = [];
  public customHandler?: (req: CompletionRequest) => CompletionResponse | Promise<CompletionResponse>;

  constructor(
    public readonly provider: string,
    public readonly model: string,
    public targetSessionCount: number = 3,
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(req);
    if (this.customHandler) {
      const customRes = await this.customHandler(req);
      if (customRes) return customRes;
    }

    const stage = req.stage;
    const schemaType = (req.jsonSchema as { type?: string } | undefined)?.type;
    const userPrompt = req.messages.find((m) => m.role === "user")?.content || "";

    if (stage === "planning" || schemaType === "content_plan" || userPrompt.includes("CONTENT PLANNING")) {
      const sessions = Array.from({ length: this.targetSessionCount }, (_, i) => ({
        index: i,
        title: `جلسه ${i + 1}: مبحث پزشکی شماره ${i + 1}`,
        description: `توضیحات تکمیلی جلسه ${i + 1}`,
        relevantChunkIds: ["chunk-1"],
        targetFlashcardCount: 2,
        targetQuizCount: 2,
      }));

      return {
        text: JSON.stringify({
          kind: "content_plan",
          moduleTitle: "فارماکولوژی بالینی",
          outline: sessions.map((s) => ({ title: s.title, description: s.description })),
          sourceTopics: sessions.map((s) => ({ id: `top-${s.index}`, title: s.title, description: s.description, relevantChunkIds: ["chunk-1"] })),
          sessions,
          highYieldFacts: [{ id: "f1", fact: "نکته ۱", sessionIndex: 0 }],
          citationChunkIds: ["chunk-1"],
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    }

    if (
      stage === "review_summary" ||
      schemaType === "review_summary" ||
      userPrompt.includes("REVIEW SUMMARY") ||
      userPrompt.includes("خلاصه مروری")
    ) {
      return {
        text: JSON.stringify({
          kind: "review_summary",
          title: "خلاصه مروری جامع",
          estimatedReadingMinutes: 12,
          overview: "خلاصه فوق‌العاده متمرکز و فشرده از هسته اصلی مبحث و مفاهیم پایه‌ای.",
          sections: [
            {
              title: "بخش ۱: اصول پایه و مکانیسم‌های کلیدی",
              keyPoints: [
                "نکته کلیدی اول در مورد مکانیسم عمل و پاتوفیزیولوژی",
                "نکته کلیدی دوم در مورد فارماکوکینتیک و متابولیسم",
              ],
              mechanisms: ["مکانیسم دقیق مهار و فعال‌سازی گیرنده‌ها"],
              classifications: ["طبقه‌بندی ساختاری و دارویی"],
              comparisons: [
                {
                  conceptA: "داروی گروه اول",
                  conceptB: "داروی گروه دوم",
                  keyDifferences: "تفاوت در نیمه‌عمر و شدت اثر مهاری",
                },
              ],
              memorizationPoints: ["دوز معمول و نسبت‌های طلایی"],
              examPoints: ["نکته پرتکرار آزمون‌های جامع"],
              citationChunkIds: ["chunk-1"],
            },
          ],
          finalTakeaways: [
            "جمع‌بندی نهایی و نکات طلایی جهت مرور سریع قبل از آزمون",
          ],
          citationChunkIds: ["chunk-1"],
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 80 },
      };
    }

    if (
      schemaType === "flashcards_batch" ||
      (stage === "flashcard" && isDeepSeekProvider({ provider: this.provider, model: this.model })) ||
      userPrompt.includes("BATCH FLASHCARD GENERATION")
    ) {
      const sessionIndicesMatch = [
        ...new Set([...userPrompt.matchAll(/SESSION INDEX:\s*(\d+)/g)].map((m) => parseInt(m[1], 10))),
      ];
      const fallbackIndices = [
        ...new Set([...userPrompt.matchAll(/"sessionIndex"\s*:\s*(\d+)/g)].map((m) => parseInt(m[1], 10))),
      ];
      const allIndices = sessionIndicesMatch.length > 0 ? sessionIndicesMatch : fallbackIndices;
      const indices = allIndices.length > 0 ? allIndices : [0];

      return {
        text: JSON.stringify({
          kind: "flashcards_batch",
          results: indices.map((idx) => ({
            sessionIndex: idx,
            cards: [
              {
                question: `پرسش فلش‌کارت جلسه ${idx + 1}`,
                answer: `پاسخ فلش‌کارت جلسه ${idx + 1}`,
                cardType: "mechanism",
                difficulty: "medium",
                citationChunkIds: ["chunk-1"],
              },
            ],
          })),
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 120, outputTokens: 150 },
      };
    }

    if (stage === "flashcard" || schemaType === "flashcards") {
      return {
        text: JSON.stringify({
          kind: "flashcards",
          cards: [
            {
              question: "پرسش تکی",
              answer: "پاسخ تکی",
              cardType: "mechanism",
              difficulty: "medium",
              citationChunkIds: ["chunk-1"],
            },
          ],
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 80, outputTokens: 50 },
      };
    }

    if (
      schemaType === "quizzes_batch" ||
      (stage === "quiz" && isDeepSeekProvider({ provider: this.provider, model: this.model })) ||
      userPrompt.includes("BATCH MULTIPLE-CHOICE QUIZ GENERATION")
    ) {
      const sessionIndicesMatch = [
        ...new Set([...userPrompt.matchAll(/SESSION INDEX:\s*(\d+)/g)].map((m) => parseInt(m[1], 10))),
      ];
      const fallbackIndices = [
        ...new Set([...userPrompt.matchAll(/"sessionIndex"\s*:\s*(\d+)/g)].map((m) => parseInt(m[1], 10))),
      ];
      const allIndices = sessionIndicesMatch.length > 0 ? sessionIndicesMatch : fallbackIndices;
      const indices = allIndices.length > 0 ? allIndices : [0];

      return {
        text: JSON.stringify({
          kind: "quizzes_batch",
          results: indices.map((idx) => ({
            sessionIndex: idx,
            questions: [
              {
                question: `سوال تستی استاندارد ۴ گزینه‌ای برای جلسه ${idx + 1} چیست؟`,
                choices: ["گزینه اول صحیح", "گزینه دوم نادرست", "گزینه سوم نادرست", "گزینه چهارم نادرست"],
                correctAnswer: "گزینه اول صحیح",
                explanation: `توضیح تفصیلی بالینی تست جلسه ${idx + 1} مستند به رفرنس منبع.`,
                difficulty: "medium",
                category: "mechanism",
                citationChunkIds: ["chunk-1"],
              },
            ],
          })),
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 140, outputTokens: 160 },
      };
    }

    if (stage === "quiz" || schemaType === "quizzes") {
      return {
        text: JSON.stringify({
          kind: "quizzes",
          questions: [
            {
              question: "سوال تستی استاندارد ۴ گزینه‌ای چیست؟",
              choices: ["گزینه اول صحیح", "گزینه دوم نادرست", "گزینه سوم نادرست", "گزینه چهارم نادرست"],
              correctAnswer: "گزینه اول صحیح",
              explanation: "توضیح تفصیلی تکی",
              difficulty: "medium",
              category: "mechanism",
              citationChunkIds: ["chunk-1"],
            },
          ],
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 90, outputTokens: 60 },
      };
    }

    if (
      schemaType === "sessions_batch" ||
      (stage === "lesson" && isDeepSeekProvider({ provider: this.provider, model: this.model })) ||
      userPrompt.includes("BATCH LESSON GENERATION")
    ) {
      const sessionIndicesMatch = [...userPrompt.matchAll(/SESSION INDEX:\s*(\d+)/g)].map((m) =>
        parseInt(m[1], 10),
      );
      const fallbackIndices = [...userPrompt.matchAll(/"index"\s*:\s*(\d+)/g)].map((m) =>
        parseInt(m[1], 10),
      );
      const allIndices = sessionIndicesMatch.length > 0 ? sessionIndicesMatch : fallbackIndices;
      const indices = allIndices.length > 0 ? [...new Set(allIndices)] : [0];

      return {
        text: JSON.stringify({
          kind: "sessions_batch",
          results: indices.map((idx) => ({
            sessionIndex: idx,
            sessionTitle: `جلسه ${idx + 1}: مبحث پزشکی شماره ${idx + 1}`,
            contentMarkdown: `# جلسه ${idx + 1}: مبحث پزشکی شماره ${idx + 1}\n\n## ۱. تعاریف و مبانی جامع\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و پروتکل‌های درمانی می‌پردازد.\n\n## ۲. جدول مقایسه‌ای داروها و دوز درمانی\n| نام دارو | دوز استاندارد | مکانیسم اثر | عوارض |\n|---|---|---|---|\n| داروی شماره ${idx + 1} | 10mg روزانه | مهار انتخابی گیرنده | سردرد خفیف |\n\n## ۳. تحلیل بالینی و نکات کلیدی آزمون\nبر اساس رفرنس‌های آموزشی و مستندات ارائه شده در منبع.`,
            citationChunkIds: ["chunk-1"],
          })),
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 150, outputTokens: 200 },
      };
    }

    if (stage === "lesson" || schemaType === "session") {
      return {
        text: JSON.stringify({
          kind: "session",
          title: "جلسه تکی",
          contentMarkdown: "# جلسه تکی فارماکولوژی جامع\n\n## ۱. مبانی و مکانیسم‌های سلولی\nبررسی جامع مفاهیم و فارماکودینامیک داروها در بیماران مبتلا.\n\n## ۲. جدول مقایسه‌ای داروها\n| دارو | دوز | مکانیسم |\n|---|---|---|\n| داروی A | 10mg | مهار گیرنده |\n\n## ۳. جمع‌بندی بالینی\nنکات تشخیصی و درمانی منطبق بر رفرنس.",
          citationChunkIds: ["chunk-1"],
        }),
        model: this.model,
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 100 },
      };
    }

    return {
      text: JSON.stringify({ result: "ok" }),
      model: this.model,
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 10 },
    };
  }
}

describe("DeepSeek vs Gemini Content Generation Batching Tests", () => {
  const orgId = randomUUID() as OrganizationId;
  const adminActor: Actor = {
    userId: randomUUID() as any,
    organizationId: orgId,
    role: "student",
  };
  const policy = new RoleBasedPolicy();

  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let contentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let chunkRecordStore: InMemoryGenerationChunkStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  beforeEach(() => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    contentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    chunkRecordStore = new InMemoryGenerationChunkStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  function setupService(gateway: ModelGateway) {
    return new GenerationService(
      contentStore,
      citationStore,
      gateway,
      docStore,
      chunkStore,
      policy,
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chunkRecordStore,
    );
  }

  it("isDeepSeekProvider correctly classifies providers", () => {
    expect(isDeepSeekProvider({ provider: "deepseek" })).toBe(true);
    expect(isDeepSeekProvider({ provider: "openrouter", model: "deepseek/deepseek-chat" })).toBe(true);
    expect(isDeepSeekProvider({ provider: "arvancloud" })).toBe(true);
    expect(isDeepSeekProvider({ provider: "gemini" })).toBe(false);
    expect(isDeepSeekProvider({ provider: "gapgpt", model: "gpt-4o" })).toBe(false);
    expect(isDeepSeekProvider({ provider: "mock" })).toBe(false);
    expect(isDeepSeekProvider(undefined)).toBe(false);
  });

  describe("DeepSeek Batch Request Count: ceil(N / 3) for all stages", () => {
    const testCases = [
      { sessionCount: 1, expectedDeepSeekBatches: 1, expectedGeminiRequests: 1 },
      { sessionCount: 2, expectedDeepSeekBatches: 1, expectedGeminiRequests: 2 },
      { sessionCount: 3, expectedDeepSeekBatches: 1, expectedGeminiRequests: 3 },
      { sessionCount: 4, expectedDeepSeekBatches: 2, expectedGeminiRequests: 4 },
      { sessionCount: 5, expectedDeepSeekBatches: 2, expectedGeminiRequests: 5 },
      { sessionCount: 6, expectedDeepSeekBatches: 2, expectedGeminiRequests: 6 },
      { sessionCount: 7, expectedDeepSeekBatches: 3, expectedGeminiRequests: 7 },
      { sessionCount: 11, expectedDeepSeekBatches: 4, expectedGeminiRequests: 11 },
    ];

    for (const { sessionCount, expectedDeepSeekBatches, expectedGeminiRequests } of testCases) {
      it(`handles N = ${sessionCount} sessions: DeepSeek sends ${expectedDeepSeekBatches} batch requests, Gemini sends ${expectedGeminiRequests} requests`, async () => {
        const docId = randomUUID() as DocumentId;
        const doc = makeDocument({ id: docId, pageCount: sessionCount <= 2 ? 1 : sessionCount * 2 }, orgId);
        await docStore.create(doc);
        await chunkStore.createMany(makeChunks(docId, orgId, Math.max(1, sessionCount)));

        // 1. DeepSeek Test
        const deepseekGateway = new FlexibleMockGateway("deepseek", "deepseek-chat", sessionCount);
        const deepseekService = setupService(deepseekGateway);

        const deepseekResult = await deepseekService.generateForDocument(adminActor, orgId, docId, {
          generationKey: `deepseek-test-n-${sessionCount}`,
          types: ["lesson", "flashcard", "quiz", "review_summary"],
        });

        expect(deepseekResult.document_status).toBe("review_pending");

        // Breakdown of DeepSeek requests:
        // 1 Outline request (Stage 1)
        // expectedDeepSeekBatches for Lessons (Stage 2)
        // expectedDeepSeekBatches for Flashcards (Stage 3)
        // expectedDeepSeekBatches for Quizzes (Stage 4)
        // 1 Review Summary request (Stage 5)
        const deepseekTotalCalls = deepseekGateway.calls.length;
        const deepseekExpectedTotal = 1 + (expectedDeepSeekBatches * 3) + 1;
        expect(deepseekTotalCalls).toBe(deepseekExpectedTotal);

        // Verify individual chunk persistence in generation_chunk_records
        for (let sIdx = 0; sIdx < sessionCount; sIdx++) {
          const lessonChunk = await chunkRecordStore.findByDocumentAndKey(docId, `lesson:${sIdx}`, orgId);
          expect(lessonChunk).toBeDefined();
          expect(lessonChunk?.stage).toBe("lesson");

          const flashcardChunk = await chunkRecordStore.findByDocumentAndKey(docId, `flashcard:${sIdx}`, orgId);
          expect(flashcardChunk).toBeDefined();
          expect(flashcardChunk?.stage).toBe("flashcard");

          const quizChunk = await chunkRecordStore.findByDocumentAndKey(docId, `quiz:${sIdx}`, orgId);
          expect(quizChunk).toBeDefined();
          expect(quizChunk?.stage).toBe("quiz");
        }

        // 2. Gemini Test (Zero batching: 1 request per session per stage)
        const geminiDocId = randomUUID() as DocumentId;
        const geminiDoc = makeDocument({ id: geminiDocId, pageCount: sessionCount <= 2 ? 1 : sessionCount * 2 }, orgId);
        await docStore.create(geminiDoc);
        await chunkStore.createMany(makeChunks(geminiDocId, orgId, Math.max(1, sessionCount)));

        const geminiGateway = new FlexibleMockGateway("gemini", "gemini-2.5-flash", sessionCount);
        const geminiService = setupService(geminiGateway);

        const geminiResult = await geminiService.generateForDocument(adminActor, orgId, geminiDocId, {
          generationKey: `gemini-test-n-${sessionCount}`,
          types: ["lesson", "flashcard", "quiz", "review_summary"],
        });

        expect(geminiResult.document_status).toBe("review_pending");

        // Breakdown of Gemini requests:
        // 1 Outline request (Stage 1)
        // expectedGeminiRequests for Lessons (Stage 2)
        // expectedGeminiRequests for Flashcards (Stage 3)
        // expectedGeminiRequests for Quizzes (Stage 4)
        // 1 Review Summary request (Stage 5)
        const geminiTotalCalls = geminiGateway.calls.length;
        const geminiExpectedTotal = 1 + (expectedGeminiRequests * 3) + 1;
        expect(geminiTotalCalls).toBe(geminiExpectedTotal);
      });
    }
  });

  describe("Deterministic Mapping & Edge Cases with DeepSeek Batches", () => {
    it("correctly maps responses returned out-of-order (e.g. session indices [2, 0, 1])", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, orgId);
      await docStore.create(doc);
      await chunkStore.createMany(makeChunks(docId, orgId, 6));

      const deepseekGateway = new FlexibleMockGateway("deepseek", "deepseek-chat", 3);
      deepseekGateway.customHandler = async (req: CompletionRequest) => {
        const prompt = req.messages.find((m) => m.role === "user")?.content || "";
        if (prompt.includes("BATCH LESSON GENERATION") || prompt.includes("BATCHED LESSON SESSIONS")) {
          return {
            text: JSON.stringify({
              results: [
                {
                  sessionIndex: 2,
                  sessionTitle: "جلسه ۳: مبحث پیشرفته",
                  contentMarkdown: "# جلسه ۳: مبحث پیشرفته فارماکولوژی\n\n## ۱. تعاریف و اصول پایه\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و پروتکل‌های درمانی می‌پردازد.\n\n## ۲. جدول مقایسه‌ای داروها\n| دارو | دوز |\n|---|---|\n| داروی C | 30mg |\n\nمحتوای کامل جلسه ۳",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 0,
                  sessionTitle: "جلسه ۱: مبحث پایه",
                  contentMarkdown: "# جلسه ۱: مبحث پایه فارماکولوژی\n\n## ۱. تعاریف و اصول پایه\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و پروتکل‌های درمانی می‌پردازد.\n\n## ۲. جدول مقایسه‌ای داروها\n| دارو | دوز |\n|---|---|\n| داروی A | 10mg |\n\nمحتوای کامل جلسه ۱",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 1,
                  sessionTitle: "جلسه ۲: مبحث بالینی",
                  contentMarkdown: "# جلسه ۲: مبحث بالینی فارماکولوژی\n\n## ۱. تعاریف و اصول پایه\nاین مبحث به بررسی مکانیسم‌های سلولی، فیزیولوژیک و پروتکل‌های درمانی می‌پردازد.\n\n## ۲. جدول مقایسه‌ای داروها\n| دارو | دوز |\n|---|---|\n| داروی B | 20mg |\n\nمحتوای کامل جلسه ۲",
                  citationChunkIds: ["chunk-1"],
                },
              ],
            }),
            model: "deepseek-chat",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }
        if (prompt.includes("BATCH FLASHCARD GENERATION") || prompt.includes("BATCHED ATOMIC FLASHCARDS")) {
          return {
            text: JSON.stringify({
              results: [
                {
                  sessionIndex: 2,
                  cards: [
                    { question: "پرسش جلسه ۳؟", answer: "پاسخ جلسه ۳", cardType: "mechanism", difficulty: "hard", citationChunkIds: ["chunk-1"] },
                  ],
                },
                {
                  sessionIndex: 0,
                  cards: [
                    { question: "پرسش جلسه ۱؟", answer: "پاسخ جلسه ۱", cardType: "mechanism", difficulty: "easy", citationChunkIds: ["chunk-1"] },
                  ],
                },
                {
                  sessionIndex: 1,
                  cards: [
                    { question: "پرسش جلسه ۲؟", answer: "پاسخ جلسه ۲", cardType: "mechanism", difficulty: "medium", citationChunkIds: ["chunk-1"] },
                  ],
                },
              ],
            }),
            model: "deepseek-chat",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }
        if (prompt.includes("BATCH MULTIPLE-CHOICE QUIZ GENERATION") || prompt.includes("BATCHED MULTIPLE-CHOICE QUIZZES")) {
          return {
            text: JSON.stringify({
              results: [
                {
                  sessionIndex: 2,
                  questions: [
                    {
                      question: "تست جلسه ۳؟",
                      choices: ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
                      correctAnswer: "گزینه اول",
                      explanation: "توضیح ۳",
                      difficulty: "medium",
                      category: "mechanism",
                      citationChunkIds: ["chunk-1"],
                    },
                  ],
                },
                {
                  sessionIndex: 0,
                  questions: [
                    {
                      question: "تست جلسه ۱؟",
                      choices: ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
                      correctAnswer: "گزینه اول",
                      explanation: "توضیح ۱",
                      difficulty: "medium",
                      category: "mechanism",
                      citationChunkIds: ["chunk-1"],
                    },
                  ],
                },
                {
                  sessionIndex: 1,
                  questions: [
                    {
                      question: "تست جلسه ۲؟",
                      choices: ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
                      correctAnswer: "گزینه اول",
                      explanation: "توضیح ۲",
                      difficulty: "medium",
                      category: "mechanism",
                      citationChunkIds: ["chunk-1"],
                    },
                  ],
                },
              ],
            }),
            model: "deepseek-chat",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }

        return undefined as any;
      };

      const deepseekService = setupService(deepseekGateway);
      const result = await deepseekService.generateForDocument(adminActor, orgId, docId, {
        generationKey: "shuffled-test",
        types: ["lesson", "flashcard", "quiz"],
      });

      expect(result.document_status).toBe("review_pending");

      // Verify Session 0 content
      const chunk0 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:0", orgId);
      expect((chunk0?.payload as any)?.contentMarkdown).toContain("جلسه ۱");

      // Verify Session 1 content
      const chunk1 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:1", orgId);
      expect((chunk1?.payload as any)?.contentMarkdown).toContain("جلسه ۲");

      // Verify Session 2 content
      const chunk2 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:2", orgId);
      expect((chunk2?.payload as any)?.contentMarkdown).toContain("جلسه ۳");

      // Verify Flashcards mapped accurately
      const fc0 = await chunkRecordStore.findByDocumentAndKey(docId, "flashcard:0", orgId);
      expect((fc0?.payload as any)?.cards[0].question).toContain("پرسش جلسه ۱");

      const fc1 = await chunkRecordStore.findByDocumentAndKey(docId, "flashcard:1", orgId);
      expect((fc1?.payload as any)?.cards[0].question).toContain("پرسش جلسه ۲");

      const fc2 = await chunkRecordStore.findByDocumentAndKey(docId, "flashcard:2", orgId);
      expect((fc2?.payload as any)?.cards[0].question).toContain("پرسش جلسه ۳");

      // Verify Quizzes mapped accurately
      const qz0 = await chunkRecordStore.findByDocumentAndKey(docId, "quiz:0", orgId);
      expect((qz0?.payload as any)?.questions[0].question).toContain("تست جلسه ۱");

      const qz1 = await chunkRecordStore.findByDocumentAndKey(docId, "quiz:1", orgId);
      expect((qz1?.payload as any)?.questions[0].question).toContain("تست جلسه ۲");

      const qz2 = await chunkRecordStore.findByDocumentAndKey(docId, "quiz:2", orgId);
      expect((qz2?.payload as any)?.questions[0].question).toContain("تست جلسه ۳");
    });

    it("handles partial/missing items by recording status 'failed' without fake completion", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, orgId);
      await docStore.create(doc);
      await chunkStore.createMany(makeChunks(docId, orgId, 6));

      const deepseekGateway = new FlexibleMockGateway("deepseek", "deepseek-chat", 3);
      let attempt = 1;
      deepseekGateway.customHandler = async (req: CompletionRequest) => {
        const prompt = req.messages.find((m) => m.role === "user")?.content || "";
        if (prompt.includes("BATCH LESSON GENERATION") || prompt.includes("BATCHED LESSON SESSIONS")) {
          if (attempt === 1) {
            // Attempt 1: Only sessionIndex 0 and 2 returned (sessionIndex 1 is missing)
            return {
              text: JSON.stringify({
                results: [
                  {
                    sessionIndex: 0,
                    sessionTitle: "جلسه ۱",
                    contentMarkdown: "# جلسه ۱ کامل با جدول و توضیحات تشریحی رفرنس\n\n## ۱. تعاریف و مبانی\nاین جلسه شامل توضیحات جامع و کامل درباره ساختارها و مفاهیم است.\n\n## ۲. جدول مقایسه‌ای\n| دارو | دوز |\n|---|---|\n| A | 10mg |",
                    citationChunkIds: ["chunk-1"],
                  },
                  {
                    sessionIndex: 2,
                    sessionTitle: "جلسه ۳",
                    contentMarkdown: "# جلسه ۳ کامل با جدول و توضیحات تشریحی رفرنس\n\n## ۱. تعاریف و مبانی\nاین جلسه شامل توضیحات جامع و کامل درباره ساختارها و مفاهیم است.\n\n## ۲. جدول مقایسه‌ای\n| دارو | دوز |\n|---|---|\n| C | 30mg |",
                    citationChunkIds: ["chunk-1"],
                  },
                ],
              }),
              model: "deepseek-chat",
              finishReason: "stop",
              usage: { inputTokens: 100, outputTokens: 200 },
            };
          } else {
            // Attempt 2 (Retry): DeepSeek now returns the missing sessionIndex 1
            return {
              text: JSON.stringify({
                results: [
                  {
                    sessionIndex: 1,
                    sessionTitle: "جلسه ۲",
                    contentMarkdown: "# جلسه ۲ کامل پس از تلاش مجدد با جدول و مستندات\n\n## ۱. تعاریف و مبانی\nتوضیحات جلسه دوم.\n\n## ۲. جدول\n| دارو | دوز |\n|---|---|\n| B | 20mg |",
                    citationChunkIds: ["chunk-1"],
                  },
                ],
              }),
              model: "deepseek-chat",
              finishReason: "stop",
              usage: { inputTokens: 50, outputTokens: 100 },
            };
          }
        }
        return undefined as any;
      };

      const deepseekService = setupService(deepseekGateway);

      // Attempt 1 fails because session 1 was missing from model response
      await expect(
        deepseekService.generateForDocument(adminActor, orgId, docId, {
          generationKey: "missing-item-test",
          types: ["lesson"],
        }),
      ).rejects.toThrow("DeepSeek batch generation failed to produce valid lessons for session indices: 1");

      // Chunks 0 and 2 must have completed status and actual content from DeepSeek
      const chunk0 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:0", orgId);
      expect(chunk0?.status).toBe("completed");
      expect((chunk0?.payload as any)?.contentMarkdown).toContain("جلسه ۱ کامل با جدول");

      const chunk2 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:2", orgId);
      expect(chunk2?.status).toBe("completed");
      expect((chunk2?.payload as any)?.contentMarkdown).toContain("جلسه ۳ کامل با جدول");

      // Chunk 1 must be marked as 'failed' with STAGE2_BATCH_LESSON_MISSING and null payload (NO fake/synthetic completion)
      const chunk1 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:1", orgId);
      expect(chunk1).toBeDefined();
      expect(chunk1?.status).toBe("failed");
      expect(chunk1?.errorCode).toBe("STAGE2_BATCH_LESSON_MISSING");
      expect(chunk1?.payload).toBeNull();

      // Attempt 2 (Retry): Resumes cleanly using cached chunks 0 & 2 and generating only chunk 1
      attempt = 2;
      const retryResult = await deepseekService.generateForDocument(adminActor, orgId, docId, {
        generationKey: "missing-item-test",
        types: ["lesson"],
      });
      expect(retryResult.document_status).toBe("review_pending");

      const chunk1AfterRetry = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:1", orgId);
      expect(chunk1AfterRetry?.status).toBe("completed");
      expect((chunk1AfterRetry?.payload as any)?.contentMarkdown).toContain("جلسه ۲ کامل پس از تلاش مجدد");
    });

    it("strictly maps by sessionIndex even when sessionTitle differs completely (no title fallback)", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, orgId);
      await docStore.create(doc);
      await chunkStore.createMany(makeChunks(docId, orgId, 6));

      const deepseekGateway = new FlexibleMockGateway("deepseek", "deepseek-chat", 2);
      deepseekGateway.customHandler = async (req: CompletionRequest) => {
        const prompt = req.messages.find((m) => m.role === "user")?.content || "";
        if (prompt.includes("BATCH LESSON GENERATION") || prompt.includes("BATCHED LESSON SESSIONS")) {
          return {
            text: JSON.stringify({
              results: [
                {
                  sessionIndex: 0,
                  sessionTitle: "یک عنوان کاملاً متفاوت و تغییر یافته توسط مدل",
                  contentMarkdown: "# عنوان بازنویسی شده\n\nمحتوای درس جلسه ۰ با رفرنس دقیق.",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 1,
                  sessionTitle: "عنوان دوم کاملاً بازنویسی شده",
                  contentMarkdown: "# عنوان دوم\n\nمحتوای درس جلسه ۱ با رفرنس دقیق.",
                  citationChunkIds: ["chunk-1"],
                },
              ],
            }),
            model: "deepseek-chat",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }
        return undefined as any;
      };

      const deepseekService = setupService(deepseekGateway);
      await deepseekService.generateForDocument(adminActor, orgId, docId, {
        generationKey: "title-mismatch-test",
        types: ["lesson"],
      });

      const chunk0 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:0", orgId);
      expect(chunk0?.status).toBe("completed");
      expect((chunk0?.payload as any)?.contentMarkdown).toContain("محتوای درس جلسه ۰");

      const chunk1 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:1", orgId);
      expect(chunk1?.status).toBe("completed");
      expect((chunk1?.payload as any)?.contentMarkdown).toContain("محتوای درس جلسه ۱");
    });

    it("accurately maps duplicate titles across sessions using sessionIndex without collision", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, orgId);
      await docStore.create(doc);
      await chunkStore.createMany(makeChunks(docId, orgId, 6));

      const deepseekGateway = new FlexibleMockGateway("deepseek", "deepseek-chat", 2);
      deepseekGateway.customHandler = async (req: CompletionRequest) => {
        const prompt = req.messages.find((m) => m.role === "user")?.content || "";
        if (prompt.includes("CONTENT PLANNING")) {
          return {
            text: JSON.stringify({
              kind: "content_plan",
              moduleTitle: "فارماکولوژی بالینی",
              outline: [{ title: "مبحث مشترک", description: "بخش ۱" }, { title: "مبحث مشترک", description: "بخش ۲" }],
              sourceTopics: [{ id: "t1", title: "مبحث مشترک", description: "بخش ۱", relevantChunkIds: ["chunk-1"] }],
              sessions: [
                { index: 0, title: "مبحث مشترک", description: "بخش ۱", relevantChunkIds: ["chunk-1"] },
                { index: 1, title: "مبحث مشترک", description: "بخش ۲", relevantChunkIds: ["chunk-1"] },
              ],
              highYieldFacts: [],
              citationChunkIds: ["chunk-1"],
            }),
            model: "deepseek-chat",
            finishReason: "stop",
            usage: { inputTokens: 50, outputTokens: 50 },
          };
        }
        if (prompt.includes("BATCH LESSON GENERATION") || prompt.includes("BATCHED LESSON SESSIONS")) {
          return {
            text: JSON.stringify({
              results: [
                {
                  sessionIndex: 0,
                  sessionTitle: "مبحث مشترک",
                  contentMarkdown: "# مبحث مشترک - پارت ۱\n\nمحتوای پارت ۱",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 1,
                  sessionTitle: "مبحث مشترک",
                  contentMarkdown: "# مبحث مشترک - پارت ۲\n\nمحتوای پارت ۲",
                  citationChunkIds: ["chunk-1"],
                },
              ],
            }),
            model: "deepseek-chat",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }
        return undefined as any;
      };

      const deepseekService = setupService(deepseekGateway);
      await deepseekService.generateForDocument(adminActor, orgId, docId, {
        generationKey: "duplicate-title-test",
        types: ["lesson"],
      });

      const chunk0 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:0", orgId);
      expect((chunk0?.payload as any)?.contentMarkdown).toContain("پارت ۱");

      const chunk1 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:1", orgId);
      expect((chunk1?.payload as any)?.contentMarkdown).toContain("پارت ۲");
    });

    it("ignores unknown or duplicate session indices safely", async () => {
      const docId = randomUUID() as DocumentId;
      const doc = makeDocument({ id: docId }, orgId);
      await docStore.create(doc);
      await chunkStore.createMany(makeChunks(docId, orgId, 6));

      const deepseekGateway = new FlexibleMockGateway("deepseek", "deepseek-chat", 3);
      deepseekGateway.customHandler = async (req: CompletionRequest) => {
        const prompt = req.messages.find((m) => m.role === "user")?.content || "";
        if (prompt.includes("BATCH LESSON GENERATION") || prompt.includes("BATCHED LESSON SESSIONS")) {
          return {
            text: JSON.stringify({
              results: [
                {
                  sessionIndex: 0,
                  sessionTitle: "جلسه ۱ - اولیه",
                  contentMarkdown: "# جلسه ۱ - نسخه اول جامع با جدول مقایسه‌ای کامل\n\n## ۱. مبانی اصلی\nشرح دقیق مکانیسم و فارماکودینامیک بر اساس رفرنس منبع آموزشی.\n\n## ۲. جدول\n| دارو | دوز |\n|---|---|\n| A | 10mg |",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 0, // Duplicate
                  sessionTitle: "جلسه ۱ - تکراری",
                  contentMarkdown: "# جلسه ۱ - نسخه دوم تکراری با جدول مقایسه‌ای\n\n## ۱. مبانی اصلی\nشرح دقیق مکانیسم و فارماکودینامیک بر اساس رفرنس منبع آموزشی.\n\n## ۲. جدول\n| دارو | دوز |\n|---|---|\n| B | 20mg |",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 999, // Unknown index
                  sessionTitle: "جلسه نامعتبر",
                  contentMarkdown: "# نامعتبر\n\nمحتوای نامعتبر",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 1,
                  sessionTitle: "جلسه ۲",
                  contentMarkdown: "# جلسه ۲ با جدول مقایسه‌ای کامل و تحلیل مفاهیم\n\n## ۱. مبانی اصلی\nشرح دقیق مکانیسم و فارماکودینامیک بر اساس رفرنس منبع آموزشی.\n\n## ۲. جدول\n| دارو | دوز |\n|---|---|\n| C | 30mg |",
                  citationChunkIds: ["chunk-1"],
                },
                {
                  sessionIndex: 2,
                  sessionTitle: "جلسه ۳",
                  contentMarkdown: "# جلسه ۳ با جدول مقایسه‌ای کامل و تحلیل مفاهیم\n\n## ۱. مبانی اصلی\nشرح دقیق مکانیسم و فارماکودینامیک بر اساس رفرنس منبع آموزشی.\n\n## ۲. جدول\n| دارو | دوز |\n|---|---|\n| D | 40mg |",
                  citationChunkIds: ["chunk-1"],
                },
              ],
            }),
            model: "deepseek-chat",
            finishReason: "stop",
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        }
        return undefined as any;
      };

      const deepseekService = setupService(deepseekGateway);
      const result = await deepseekService.generateForDocument(adminActor, orgId, docId, {
        generationKey: "duplicate-unknown-test",
        types: ["lesson"],
      });

      expect(result.document_status).toBe("review_pending");

      // Session 0 takes the first match
      const chunk0 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:0", orgId);
      expect((chunk0?.payload as any)?.contentMarkdown).toContain("جلسه ۱ - نسخه اول");

      // Unknown index 999 is never created in chunkRecordStore
      const chunk999 = await chunkRecordStore.findByDocumentAndKey(docId, "lesson:999", orgId);
      expect(chunk999).toBeUndefined();
    });
  });
});
