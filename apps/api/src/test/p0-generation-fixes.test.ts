import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { extractPdfText } from "../modules/documents/extraction/pdf-extractor.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import type { ModelGateway, CompletionRequest, CompletionResult } from "../modules/generation/gateway/types.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import type {
  DocumentChunkRecord,
  DocumentRecord,
} from "../modules/learning/learning-store.js";
import {
  defaultPolicy,
  type CourseId,
  type DocumentChunkId,
  type DocumentId,
  type OrganizationId,
  type UserId,
} from "@avana/domain";

function makeTestDoc(
  id: DocumentId,
  orgId: OrganizationId,
  courseId: CourseId,
  pageCount = 2,
): DocumentRecord {
  const now = new Date().toISOString();
  return {
    id,
    organizationId: orgId,
    courseId,
    ownerUserId: "00000000-0000-0000-0000-000000000099" as UserId,
    originalName: "cardio_pharmacology.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    storageKey: `uploads/${id}.pdf`,
    pageCount,
    status: "extracted",
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

describe("AVANA Generation Pipeline P0 Fixes", () => {
  describe("P0-1: PDF Extraction Font Alias & CMap Resolution", () => {
    it("successfully extracts non-empty text from real Persian PDF with embedded CMap fonts", () => {
      const pdfPath = path.resolve("./storage/uploads/uploads/feabfc3b-7fd7-4c0d-b689-45681df48ffa.pdf");
      if (!fs.existsSync(pdfPath)) {
        console.warn("Skipping real PDF file test: file not found at", pdfPath);
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const result = extractPdfText(buffer);

      expect(result.pages.length).toBeGreaterThan(1);
      const totalChars = result.pages.reduce((acc, p) => acc + p.characterCount, 0);

      // Previously this returned 0 characters due to missing /F1, /F2 alias mapping
      expect(totalChars).toBeGreaterThan(1000);
      expect(result.pages[0].rawText.length).toBeGreaterThan(100);
    });

    it("successfully extracts text across multi-page clinical PDFs in storage", () => {
      const pdfPath = path.resolve("./storage/uploads/uploads/5d8bc2e1-b2a7-4419-afbf-4d0558f62b85.pdf");
      if (!fs.existsSync(pdfPath)) {
        return;
      }

      const buffer = fs.readFileSync(pdfPath);
      const result = extractPdfText(buffer);

      expect(result.pages.length).toBe(17);
      const totalChars = result.pages.reduce((acc, p) => acc + p.characterCount, 0);
      expect(totalChars).toBeGreaterThan(50000);
    });
  });

  describe("P0-2 & P0-3 & P0-4: Flashcard & Quiz Context and Source Grounding", () => {
    it("ensures Flashcard and Quiz prompts contain the complete topic Lesson content and topic source chunks", async () => {
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const genStore = new InMemoryGeneratedContentStore();
      const citStore = new InMemoryGeneratedContentCitationStore();

      const recordedPrompts: Array<{ type: string; prompt: string }> = [];

      const mockGateway: ModelGateway = {
        provider: "mock",
        async complete(req: CompletionRequest): Promise<CompletionResult> {
          const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
          const reqType = (req.jsonSchema as { type?: string })?.type ?? "unknown";
          recordedPrompts.push({ type: reqType, prompt: userMsg });

          if (reqType === "outline") {
            return {
              text: JSON.stringify({
                kind: "outline",
                moduleTitle: "فصل اول: فارماکولوژی داروهای قلبی",
                outline: [
                  {
                    title: "جلسه ۱: داروهای مسدودکننده بتا",
                    description: "بررسی مکانیسم سلولی مهار گیرنده بتا و موارد مصرف در نارسایی قلبی",
                    relevantChunkIds: ["chunk-1", "chunk-2"],
                  },
                ],
                citationChunkIds: ["chunk-1", "chunk-2"],
              }),
              model: "test-model",
              usage: { inputTokens: 50, outputTokens: 50 },
              finishReason: "stop",
            };
          }

          if (reqType === "session") {
            return {
              text: JSON.stringify({
                kind: "session",
                title: "جلسه ۱: داروهای مسدودکننده بتا",
                contentMarkdown:
                  "# جلسه ۱: داروهای مسدودکننده بتا\n\n## مکانیسم اثر\nداروهای بتا بلاکر با مهار رقابتی اثر کاتکول‌آمین‌ها بر گیرنده‌های بتا-۱ سبب کاهش ضربان و کاهش برون‌ده قلبی می‌شوند.\n\n## نکات پرتکرار آزمون\nدر بیماران آسم و برونکواسپاسم، بتا بلاکرهای غیراختصاصی مانند پروپرانولول کنتراندیکه مطلق هستند.",
                citationChunkIds: ["chunk-1", "chunk-2"],
              }),
              model: "test-model",
              usage: { inputTokens: 100, outputTokens: 100 },
              finishReason: "stop",
            };
          }

          if (reqType === "flashcard_topic") {
            return {
              text: JSON.stringify({
                kind: "flashcard",
                cards: [
                  {
                    question: "مکانیسم اثر داروهای بتا بلاکر چیست؟",
                    answer: "مهار رقابتی اثر کاتکول‌آمین‌ها بر گیرنده‌های بتا-۱.",
                    explanation: "بر اساس درس تدوین‌شده.",
                    cardType: "mechanism",
                    difficulty: "medium",
                  },
                ],
                citationChunkIds: ["chunk-1", "chunk-2"],
              }),
              model: "test-model",
              usage: { inputTokens: 80, outputTokens: 80 },
              finishReason: "stop",
            };
          }

          if (reqType === "quiz_topic") {
            return {
              text: JSON.stringify({
                kind: "quiz",
                questions: [
                  {
                    question: "کدام دارو در بیماران با سابقه برونکواسپاسم کنتراندیکه است؟",
                    questionType: "multiple_choice",
                    choices: ["پروپرانولول", "متوپرولول", "آتنولول", "اسمولول"],
                    correctAnswer: "پروپرانولول",
                    explanation: "به علت غیراختصاصی بودن مهار بتا.",
                  },
                ],
                citationChunkIds: ["chunk-1", "chunk-2"],
              }),
              model: "test-model",
              usage: { inputTokens: 80, outputTokens: 80 },
              finishReason: "stop",
            };
          }

          return {
            text: JSON.stringify({ kind: "recommendation", summary: "Test", topics: [] }),
            model: "test-model",
            usage: { inputTokens: 10, outputTokens: 10 },
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
        defaultPolicy,
      );

      const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
      const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
      const docId = "00000000-0000-0000-0000-000000000003" as DocumentId;
      const actor = { userId: "00000000-0000-0000-0000-000000000099" as UserId, role: "organization_admin" as const };

      await docStore.create(makeTestDoc(docId, orgId, courseId, 2));

      await chunkStore.createMany([
        {
          id: "chunk-1" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 0,
          heading: "مقدمه بتا بلاکرها",
          content: "متن منبع چانک شماره یک در ارتباط با گیرنده‌های بتا و سیستم سمپاتیک.",
          startPage: 1,
          endPage: 1,
          tokenEstimate: 20,
          contentHash: "h1",
          createdAt: new Date().toISOString(),
        },
        {
          id: "chunk-2" as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: 1,
          heading: "فارماکوکینتیک",
          content: "متن منبع چانک شماره دو در ارتباط با عوارض جانبی و موارد منع مصرف.",
          startPage: 2,
          endPage: 2,
          tokenEstimate: 20,
          contentHash: "h2",
          createdAt: new Date().toISOString(),
        },
      ]);

      const result = await service.generateForDocument(actor, orgId, docId, {
        types: ["lesson", "flashcard", "quiz"],
        promptVersion: "v1",
        courseId,
      });

      expect(result.contents.length).toBe(3);

      // Verify Flashcard Prompt
      const flashcardPrompt = recordedPrompts.find((p) => p.type === "flashcard_topic");
      expect(flashcardPrompt).toBeDefined();
      expect(flashcardPrompt!.prompt).toContain("TOPIC LESSON CONTENT:");
      expect(flashcardPrompt!.prompt).toContain("در بیماران آسم و برونکواسپاسم، بتا بلاکرهای غیراختصاصی");
      expect(flashcardPrompt!.prompt).toContain("SOURCE CHUNKS FOR THIS TOPIC:");
      expect(flashcardPrompt!.prompt).toContain("متن منبع چانک شماره یک در ارتباط با گیرنده‌های بتا");

      // Verify Quiz Prompt
      const quizPrompt = recordedPrompts.find((p) => p.type === "quiz_topic");
      expect(quizPrompt).toBeDefined();
      expect(quizPrompt!.prompt).toContain("TOPIC LESSON CONTENT:");
      expect(quizPrompt!.prompt).toContain("داروهای بتا بلاکر با مهار رقابتی اثر کاتکول‌آمین‌ها");
      expect(quizPrompt!.prompt).toContain("SOURCE CHUNKS FOR THIS TOPIC:");
      expect(quizPrompt!.prompt).toContain("متن منبع چانک شماره دو در ارتباط با عوارض جانبی");
    });

    it("Test 4: Later Chunks (Chunk 9-12) are correctly routed to Topic Flashcards/Quizzes and never sliced out", async () => {
      const docStore = new InMemoryDocumentStore();
      const chunkStore = new InMemoryDocumentChunkStore();
      const genStore = new InMemoryGeneratedContentStore();
      const citStore = new InMemoryGeneratedContentCitationStore();
      const recordedPrompts: Array<{ type: string; prompt: string }> = [];

      const mockGateway: ModelGateway = {
        provider: "mock",
        async complete(req: CompletionRequest): Promise<CompletionResult> {
          const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
          const reqType = (req.jsonSchema as { type?: string })?.type ?? "unknown";
          recordedPrompts.push({ type: reqType, prompt: userMsg });

          if (reqType === "outline") {
            return {
              text: JSON.stringify({
                kind: "outline",
                moduleTitle: "کتاب جامع پزشکی",
                outline: [
                  {
                    title: "جلسه پایانی: مباحث پیشرفته بخش چهارم",
                    description: "بررسی اختصاصی فصول انتهای کتاب",
                    relevantChunkIds: ["chunk-9", "chunk-10", "chunk-11", "chunk-12"],
                  },
                ],
                citationChunkIds: ["chunk-9", "chunk-10", "chunk-11", "chunk-12"],
              }),
              model: "test-model",
              usage: { inputTokens: 50, outputTokens: 50 },
              finishReason: "stop",
            };
          }

          if (reqType === "session") {
            return {
              text: JSON.stringify({
                kind: "session",
                title: "جلسه پایانی: مباحث پیشرفته بخش چهارم",
                contentMarkdown: "# جلسه پایانی\n\nمتن تفصیلی آموزش مباحث پیشرفته چانک‌های ۹ تا ۱۲.",
                citationChunkIds: ["chunk-9", "chunk-10", "chunk-11", "chunk-12"],
              }),
              model: "test-model",
              usage: { inputTokens: 100, outputTokens: 100 },
              finishReason: "stop",
            };
          }

          if (reqType === "flashcard_topic") {
            return {
              text: JSON.stringify({
                kind: "flashcard",
                cards: [
                  {
                    question: "نکته کلیدی در چانک ۱۰ چیست؟",
                    answer: "پاسخ از چانک ۱۰.",
                    explanation: "مستند به چانک ۱۰.",
                    cardType: "key_fact",
                    difficulty: "medium",
                  },
                ],
                citationChunkIds: ["chunk-9", "chunk-10", "chunk-11", "chunk-12"],
              }),
              model: "test-model",
              usage: { inputTokens: 80, outputTokens: 80 },
              finishReason: "stop",
            };
          }

          if (reqType === "quiz_topic") {
            return {
              text: JSON.stringify({
                kind: "quiz",
                questions: [
                  {
                    question: "یافته کلیدی در صفحه ۱۱ کدام است؟",
                    questionType: "multiple_choice",
                    choices: ["الف", "ب", "ج", "د"],
                    correctAnswer: "الف",
                    explanation: "طبق چانک ۱۱.",
                  },
                ],
                citationChunkIds: ["chunk-9", "chunk-10", "chunk-11", "chunk-12"],
              }),
              model: "test-model",
              usage: { inputTokens: 80, outputTokens: 80 },
              finishReason: "stop",
            };
          }

          return {
            text: JSON.stringify({ kind: "recommendation", summary: "Test", topics: [] }),
            model: "test-model",
            usage: { inputTokens: 10, outputTokens: 10 },
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
        defaultPolicy,
      );

      const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
      const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
      const docId = "00000000-0000-0000-0000-000000000004" as DocumentId;
      const actor = { userId: "00000000-0000-0000-0000-000000000099" as UserId, role: "organization_admin" as const };

      await docStore.create(makeTestDoc(docId, orgId, courseId, 14));

      // Create 14 chunks
      const testChunks: DocumentChunkRecord[] = [];
      for (let i = 1; i <= 14; i++) {
        testChunks.push({
          id: `chunk-${i}` as DocumentChunkId,
          documentId: docId,
          organizationId: orgId,
          sequence: i - 1,
          heading: `بخش شماره ${i}`,
          content: `محتوای اختصاصی و فکت‌های علمی مربوط به چانک شماره ${i} در صفحه ${i}`,
          startPage: i,
          endPage: i,
          tokenEstimate: 50,
          contentHash: `hash-${i}`,
          createdAt: new Date().toISOString(),
        });
      }
      await chunkStore.createMany(testChunks);

      const result = await service.generateForDocument(actor, orgId, docId, {
        types: ["flashcard", "quiz"],
        promptVersion: "v1",
        courseId,
      });

      expect(result.contents.length).toBe(2);

      // Verify Flashcard Prompt includes Chunk 9-12 and NOT restricted to Chunk 0-7
      const flashcardPrompt = recordedPrompts.find((p) => p.type === "flashcard_topic");
      expect(flashcardPrompt).toBeDefined();
      expect(flashcardPrompt!.prompt).toContain("محتوای اختصاصی و فکت‌های علمی مربوط به چانک شماره 10");
      expect(flashcardPrompt!.prompt).toContain("محتوای اختصاصی و فکت‌های علمی مربوط به چانک شماره 12");
      expect(flashcardPrompt!.prompt).not.toContain("محتوای اختصاصی و فکت‌های علمی مربوط به چانک شماره 1 در صفحه 1");

      // Verify Quiz Prompt includes Chunk 9-12
      const quizPrompt = recordedPrompts.find((p) => p.type === "quiz_topic");
      expect(quizPrompt).toBeDefined();
      expect(quizPrompt!.prompt).toContain("محتوای اختصاصی و فکت‌های علمی مربوط به چانک شماره 9");
      expect(quizPrompt!.prompt).toContain("محتوای اختصاصی و فکت‌های علمی مربوط به چانک شماره 11");
      expect(quizPrompt!.prompt).not.toContain("محتوای اختصاصی و فکت‌های علمی مربوط به چانک شماره 2 در صفحه 2");

      // Verify Citations include chunk-9 .. chunk-12
      const flashcardContent = result.contents.find((c) => c.type === "flashcard");
      expect(flashcardContent).toBeDefined();
      expect(flashcardContent!.citations).toEqual(
        expect.arrayContaining(["chunk-9", "chunk-10", "chunk-11", "chunk-12"]),
      );
    });
  });
});
