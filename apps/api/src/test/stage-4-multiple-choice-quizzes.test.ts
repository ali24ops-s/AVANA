/**
 * Stage 4 Multiple-Choice Quiz Generation Regression Tests.
 *
 * Verifies:
 * 1. Single-Session Execution: 3 sessions -> exactly 3 model calls (BATCH_SIZE removed).
 * 2. Strict Session Source Grounding: Each model call receives only chunks of that specific session.
 * 3. Empty/Invalid relevantChunkIds Safeguard: 0 model calls and NO fallback to full document chunks.
 * 4. Full Lesson Content: lessonContent is sent in full without 1800-character truncation.
 * 5. Single Source of Truth: Prompt Registry and Generation Service use the exact same prompt.
 * 6. Strict Correct Answer: Question is rejected if correctAnswer does not match any choice (never falls back to choices[0]).
 * 7. Duplicate Choices: Question is rejected if choices contain duplicates or correctAnswer matches multiple choices.
 * 8. Forbidden Distractor Patterns: Questions with "همه موارد", "هیچ‌کدام", "گزینه ۱ و ۲", or placeholder text are rejected.
 * 9. Exactly 4 Choices Enforcement: Questions with != 4 choices are rejected.
 * 10. Near-Duplicate Detection: Questions with high lexical/token similarity (Jaccard >= 0.75) are eliminated.
 * 11. Deterministic sessionIndex Association: sessionIndex is bound from execution context (blueprint.index).
 * 12. Question-Level Citation Sanitization: Hallucinated chunk IDs are filtered out.
 * 13. Difficulty & Category Preservation: Real difficulty and category are retained in the payload.
 * 14. Full End-to-End Quiz Generation Pipeline: generateForDocument succeeds with structured quiz payload.
 */

import { describe, expect, it } from "vitest";
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
  QUIZ_GENERATION_SYSTEM_PROMPT,
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
    filename: "pharmacology.pdf",
    originalName: "pharmacology.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    pageCount: 12,
    status: "extracted" as const,
    errorCode: null,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}

describe("Stage 4: Multiple-Choice Quiz Generation Mandatory Regression Tests", () => {
  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as UserId,
    role: "organization_admin",
  };

  it("1 & 2: 3 sessions produce exactly 3 quiz model calls, each receiving only chunks of that session", async () => {
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
        heading: "بخش ۱: داروهای بتابلاکر",
        content: "محتوای تخصصی بتا بلاکرها شامل بیزوپرولول و متوپرولول و کارودیلول.",
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
        heading: "بخش ۲: داروهای مهارکننده ACE",
        content: "محتوای تخصصی مهارکننده‌های آنزیم مبدل آنژیوتانسین مانند کاپتوپریل.",
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
        heading: "بخش ۳: دیورتیک‌های تیازیدی",
        content: "محتوای تخصصی هیدروکلروتیازید و اثرات آن بر لوله پیچیده دور کلیه.",
        startPage: 5,
        endPage: 6,
        tokenEstimate: 50,
        contentHash: "hash-3",
        createdAt: new Date().toISOString(),
      },
    ]);

    const quizCalls: CompletionRequest[] = [];

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          quizCalls.push(req);
          const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
          const chunkIdsMatch = userMsg.match(/AVAILABLE CHUNK IDs:\s*(\[[^\]]*\])/);
          const chunkIds = chunkIdsMatch ? JSON.parse(chunkIdsMatch[1]) : [];

          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: `کدام گزینه داروی خط اول بر اساس منبع این جلسه است؟`,
                  questionType: "multiple_choice",
                  difficulty: "medium",
                  category: "clinical_reasoning",
                  choices: [
                    "گزینه اول بر اساس فارماکوپه",
                    "گزینه دوم با مکانیسم متفاوت",
                    "گزینه سوم برای بیماران مزمن",
                    "گزینه چهارم برای درمان حمایتی",
                  ],
                  correctAnswer: "گزینه اول بر اساس فارماکوپه",
                  explanation: "توضیح علمی درستی گزینه بر اساس مستندات آموزشی منبع.",
                  citationChunkIds: chunkIds,
                },
              ],
              citationChunkIds: chunkIds,
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
                title: "جلسه ۱: داروهای بتابلاکر",
                description: "بررسی بتا بلاکرها",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
              },
              {
                index: 1,
                title: "جلسه ۲: مهارکننده‌های ACE",
                description: "بررسی ACEIها",
                coreConcepts: [],
                relevantChunkIds: [chunk2Id],
                targetQuizCount: 5,
              },
              {
                index: 2,
                title: "جلسه ۳: دیورتیک‌های تیازیدی",
                description: "بررسی تیازیدها",
                coreConcepts: [],
                relevantChunkIds: [chunk3Id],
                targetQuizCount: 5,
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
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].type).toBe("quiz");

    // Assertion 1: 3 sessions produce EXACTLY 3 quiz model calls (no BATCH_SIZE = 5 grouping)
    expect(quizCalls).toHaveLength(3);

    // Assertion 2: Strict Session Source Grounding - each call receives ONLY its own chunks
    const call1UserPrompt = quizCalls[0].messages.find((m) => m.role === "user")?.content ?? "";
    expect(call1UserPrompt).toContain(chunk1Id);
    expect(call1UserPrompt).not.toContain(chunk2Id);
    expect(call1UserPrompt).not.toContain(chunk3Id);

    const call2UserPrompt = quizCalls[1].messages.find((m) => m.role === "user")?.content ?? "";
    expect(call2UserPrompt).not.toContain(chunk1Id);
    expect(call2UserPrompt).toContain(chunk2Id);
    expect(call2UserPrompt).not.toContain(chunk3Id);

    const call3UserPrompt = quizCalls[2].messages.find((m) => m.role === "user")?.content ?? "";
    expect(call3UserPrompt).not.toContain(chunk1Id);
    expect(call3UserPrompt).not.toContain(chunk2Id);
    expect(call3UserPrompt).toContain(chunk3Id);
  });

  it("3: Empty or invalid relevantChunkIds skips quiz model call without fallback to full document", async () => {
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

    await chunkStore.createMany([
      {
        id: chunk1Id,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 0,
        heading: "بخش معتبر ۱",
        content: "محتوای بخش معتبر.",
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
        heading: "بخش معتبر ۲",
        content: "محتوای بخش معتبر دوم.",
        startPage: 3,
        endPage: 4,
        tokenEstimate: 50,
        contentHash: "hash-2",
        createdAt: new Date().toISOString(),
      },
    ]);

    const quizCalls: CompletionRequest[] = [];

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          quizCalls.push(req);
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال جلسه معتبر",
                  questionType: "multiple_choice",
                  choices: ["گزینه الف معتبر", "گزینه ب معتبر", "گزینه ج معتبر", "گزینه د معتبر"],
                  correctAnswer: "گزینه الف معتبر",
                  explanation: "توضیح جلسه معتبر.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning step: session 0 has valid chunk, session 1 has NO valid chunks
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه ۱: معتبر",
                description: "دارای چانک معتبر",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
              },
              {
                index: 1,
                title: "جلسه ۲: بدون چانک",
                description: "فاقد چانک در منبع",
                coreConcepts: [],
                relevantChunkIds: ["non-existent-chunk-id"],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    expect(result.contents).toHaveLength(1);
    // Only Session 0 is executed; Session 1 is skipped without calling model
    expect(quizCalls).toHaveLength(1);

    const quizPayload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ sessionIndex?: number; question: string }>;
    };

    expect(quizPayload.questions).toHaveLength(1);
    expect(quizPayload.questions[0].sessionIndex).toBe(0);
    expect(quizPayload.questions[0].question).toBe("سؤال جلسه معتبر");
  });

  it("4: Full lessonContent is sent without 1800-character truncation", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const longSentinel = "SENTINEL_VERY_LONG_CONTENT_AT_CHARACTER_3000_SHOULD_NEVER_BE_TRUNCATED";
    // Build 3500-char lesson content
    const longLessonMarkdown = "مقدمه مبحث قلب و عروق با جزئیات بالینی. ".repeat(80) + "\n" + longSentinel;
    expect(longLessonMarkdown.length).toBeGreaterThan(2500);

    let capturedQuizPrompt = "";

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          capturedQuizPrompt = req.messages.find((m) => m.role === "user")?.content ?? "";
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال تست برای متن طولانی",
                  questionType: "multiple_choice",
                  choices: ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
                  correctAnswer: "گزینه اول",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Lesson generation step returns the long markdown
        if (req.jsonSchema && (req.jsonSchema as { type: string }).type === "session") {
          return {
            text: JSON.stringify({
              kind: "session",
              title: "جلسه با متن طولانی",
              contentMarkdown: longLessonMarkdown,
              citationChunkIds: [chunk1Id],
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
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه با متن طولانی",
                description: "بررسی لیسون طولانی",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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
      types: ["lesson", "quiz"],
      promptVersion: "v1",
      courseId,
    });

    expect(capturedQuizPrompt).toContain(longSentinel);
  });

  it("5: Single Source of Truth: GenerationService uses QUIZ_GENERATION_SYSTEM_PROMPT and prompt-registry", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    let capturedSysPrompt = "";
    let capturedUserPrompt = "";

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          capturedSysPrompt = sys;
          capturedUserPrompt = req.messages.find((m) => m.role === "user")?.content ?? "";
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال آزمون ثبت پرامپت",
                  questionType: "multiple_choice",
                  choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
                  correctAnswer: "گزینه الف",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه آزمون",
                description: "توضیح جلسه",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    expect(capturedSysPrompt).toBe(QUIZ_GENERATION_SYSTEM_PROMPT);
    expect(capturedUserPrompt).toContain(
      "TASK: GENERATE HIGH-QUALITY MULTIPLE-CHOICE QUESTIONS FOR EXACTLY ONE EDUCATIONAL SESSION.",
    );
    expect(capturedUserPrompt).toContain("QUIZ & DISTRACTOR ENGINEERING REQUIREMENTS");
    expect(capturedUserPrompt).toContain("ONE QUESTION = ONE PRIMARY LEARNING POINT");
    expect(capturedUserPrompt).toContain("RELEVANT SOURCE CHUNKS FOR THIS SESSION (Ground truth):");
  });

  it("6: Strict Correct Answer: Question is rejected if correctAnswer does not match any choice", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال دارای کلید پاسخ ناموجود در گزینه‌ها",
                  questionType: "multiple_choice",
                  choices: [
                    "گزینه شماره یک واقعی",
                    "گزینه شماره دو واقعی",
                    "گزینه شماره سه واقعی",
                    "گزینه شماره چهار واقعی",
                  ],
                  // Hallucinated answer not matching any choice
                  correctAnswer: "گزینه‌ای که در لیست چهارگانه اصلاً وجود ندارد",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال معتبر دوم با کلید پاسخ صحیح و همخوان",
                  questionType: "multiple_choice",
                  choices: [
                    "گزینه اول معتبر",
                    "گزینه دوم معتبر",
                    "گزینه سوم معتبر",
                    "گزینه چهارم معتبر",
                  ],
                  correctAnswer: "گزینه اول معتبر",
                  explanation: "توضیح کامل.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه تست کلید پاسخ",
                description: "توضیح جلسه",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ question: string; correctAnswer: string }>;
    };

    // The invalid question MUST be rejected, never defaulted to choices[0]!
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].question).toBe("سؤال معتبر دوم با کلید پاسخ صحیح و همخوان");
    expect(payload.questions[0].correctAnswer).toBe("گزینه اول معتبر");
  });

  it("7: Duplicate Choices: Question is rejected if choices contain duplicates", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال دارای گزینه‌های تکراری",
                  questionType: "multiple_choice",
                  choices: [
                    "گزینه الف مشترک",
                    "گزینه الف مشترک",
                    "گزینه ب مستقل",
                    "گزینه ج مستقل",
                  ],
                  correctAnswer: "گزینه الف مشترک",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال دارای ۴ گزینه متمایز و صحیح",
                  questionType: "multiple_choice",
                  choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
                  correctAnswer: "گزینه الف",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه گزینه‌های تکراری",
                description: "توضیح",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ question: string }>;
    };

    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].question).toBe("سؤال دارای ۴ گزینه متمایز و صحیح");
  });

  it("8: Forbidden Distractor Patterns: Questions with 'همه موارد', 'هیچ‌کدام', 'گزینه ۱ و ۲', or placeholder text are rejected", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال دارای همه موارد",
                  questionType: "multiple_choice",
                  choices: ["گزینه اول", "گزینه دوم", "گزینه سوم", "همه موارد فوق"],
                  correctAnswer: "همه موارد فوق",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال دارای هیچ کدام",
                  questionType: "multiple_choice",
                  choices: ["گزینه اول", "گزینه دوم", "گزینه سوم", "هیچ‌کدام از گزینه‌ها"],
                  correctAnswer: "گزینه اول",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال دارای گزینه ۱ و ۲",
                  questionType: "multiple_choice",
                  choices: ["گزینه اول", "گزینه دوم", "گزینه ۱ و ۲ هر دو", "گزینه چهارم"],
                  correctAnswer: "گزینه اول",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال دارای گزینه انحرافی فیک",
                  questionType: "multiple_choice",
                  choices: ["گزینه صحیح", "گزینه انحرافی ۱", "گزینه انحرافی ۲", "گزینه انحرافی ۳"],
                  correctAnswer: "گزینه صحیح",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال معتبر بدون الگوهای ممنوعه",
                  questionType: "multiple_choice",
                  choices: ["داروی اول", "داروی دوم", "داروی سوم", "داروی چهارم"],
                  correctAnswer: "داروی اول",
                  explanation: "توضیح کاملاً معتبر.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه الگوهای ممنوعه",
                description: "توضیح",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ question: string }>;
    };

    // All 4 questions with forbidden patterns must be rejected!
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].question).toBe("سؤال معتبر بدون الگوهای ممنوعه");
  });

  it("9: Exactly 4 Choices Enforcement: Questions with != 4 choices are rejected", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال دارای ۳ گزینه",
                  questionType: "multiple_choice",
                  choices: ["گزینه اول", "گزینه دوم", "گزینه سوم"],
                  correctAnswer: "گزینه اول",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال دارای ۵ گزینه",
                  questionType: "multiple_choice",
                  choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴", "گزینه ۵"],
                  correctAnswer: "گزینه ۱",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال استاندارد ۴ گزینه‌ای",
                  questionType: "multiple_choice",
                  choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
                  correctAnswer: "گزینه الف",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه تعداد گزینه",
                description: "توضیح",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ question: string; choices: string[] }>;
    };

    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].question).toBe("سؤال استاندارد ۴ گزینه‌ای");
    expect(payload.questions[0].choices).toHaveLength(4);
  });

  it("10: Near-Duplicate Detection: Questions with high token similarity (Jaccard >= 0.75) are eliminated", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "مکانیسم اصلی اثر داروی بتابلاکر در کاهش فشار خون چیست؟",
                  questionType: "multiple_choice",
                  choices: ["کاهش برون‌ده قلبی", "مهار کانال کلسیم", "اتساع وریدها", "ترشح آلدوسترون"],
                  correctAnswer: "کاهش برون‌ده قلبی",
                  explanation: "توضیح اول.",
                  citationChunkIds: [chunk1Id],
                },
                // Near duplicate with nearly identical tokens
                {
                  question: "مکانیسم اصلی اثر داروی بتابلاکر در کاهش فشار خون سرخرگی چیست؟",
                  questionType: "multiple_choice",
                  choices: ["کاهش برون‌ده قلبی", "مهار کانال کلسیم", "اتساع وریدها", "ترشح آلدوسترون"],
                  correctAnswer: "کاهش برون‌ده قلبی",
                  explanation: "توضیح دوم.",
                  citationChunkIds: [chunk1Id],
                },
                // Distinct non-duplicate question
                {
                  question: "شایع‌ترین عارضه جانبی داروی کاپتوپریل در بیماران قلبی کدام است؟",
                  questionType: "multiple_choice",
                  choices: ["سرفه خشک مداوم", "برونکواسپاسم حاد", "هایپوگلیسمی", "افزایش هدایت قلبی"],
                  correctAnswer: "سرفه خشک مداوم",
                  explanation: "توضیح سوم.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه عدم تکرار",
                description: "توضیح",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ question: string }>;
    };

    // The near-duplicate question is dropped! Exactly 2 questions remain.
    expect(payload.questions).toHaveLength(2);
    expect(payload.questions[0].question).toBe("مکانیسم اصلی اثر داروی بتابلاکر در کاهش فشار خون چیست؟");
    expect(payload.questions[1].question).toBe("شایع‌ترین عارضه جانبی داروی کاپتوپریل در بیماران قلبی کدام است؟");
  });

  it("11: Deterministic sessionIndex Association: stamped from execution context (blueprint.index)", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  // Notice: Model omits sessionIndex entirely or outputs wrong index (999)
                  sessionIndex: 999,
                  question: "سؤال با ایندکس اختصاصی",
                  questionType: "multiple_choice",
                  choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
                  correctAnswer: "گزینه الف",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 4, // Blueprint index is 4
                title: "جلسه شماره ۴",
                description: "توضیح جلسه چهارم",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ sessionIndex?: number }>;
    };

    expect(payload.questions[0].sessionIndex).toBe(4);
  });

  it("12: Question-Level Citation Filtering: Hallucinated chunk IDs are filtered against session chunks", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const hallucinatedChunkId = randomUUID();

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال با چانک‌های نامعتبر",
                  questionType: "multiple_choice",
                  choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
                  correctAnswer: "گزینه الف",
                  explanation: "توضیح.",
                  citationChunkIds: [chunk1Id, hallucinatedChunkId, "invalid-id-xyz"],
                },
              ],
              citationChunkIds: [chunk1Id, hallucinatedChunkId],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه چانک‌ها",
                description: "توضیح",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ citationChunkIds?: string[] }>;
      citationChunkIds: string[];
    };

    expect(payload.questions[0].citationChunkIds).toEqual([chunk1Id]);
    expect(payload.citationChunkIds).toContain(chunk1Id);
    expect(payload.citationChunkIds).not.toContain(hallucinatedChunkId);
  });

  it("13: Difficulty & Category Preservation: Real difficulty and category are retained in payload", async () => {
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
        content: "محتوای بخش ۱.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                {
                  question: "سؤال سخت با دسته‌بندی تفکیک مکانیسم",
                  questionType: "multiple_choice",
                  difficulty: "hard",
                  category: "mechanism_discrimination",
                  choices: [
                    "گیرنده بتا یک قلبی اختصاصی",
                    "گیرنده بتا دو ریوی عمومی",
                    "گیرنده آلفا یک عروقی محیطی",
                    "گیرنده دوپامینی کلیوی",
                  ],
                  correctAnswer: "گیرنده بتا یک قلبی اختصاصی",
                  explanation: "توضیح تفصیلی.",
                  citationChunkIds: [chunk1Id],
                },
                {
                  question: "سؤال آسان با دسته‌بندی بازخوانی مفاهیم",
                  questionType: "multiple_choice",
                  difficulty: "easy",
                  category: "recall",
                  choices: [
                    "تعریف استاندارد فارماکوپه‌ای",
                    "تعریف متناقض فیزیولوژیک",
                    "فرضیه اثبات‌نشده بالینی",
                    "رویکرد غیراختصاصی دارویی",
                  ],
                  correctAnswer: "تعریف استاندارد فارماکوپه‌ای",
                  explanation: "توضیح بازخوانی.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه دسته‌بندی و سختی",
                description: "توضیح",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ difficulty?: string; category?: string }>;
    };

    expect(payload.questions).toHaveLength(2);
    expect(payload.questions[0].difficulty).toBe("hard");
    expect(payload.questions[0].category).toBe("mechanism_discrimination");

    expect(payload.questions[1].difficulty).toBe("easy");
    expect(payload.questions[1].category).toBe("recall");
  });

  it("14: Full end-to-end quiz generation pipeline with default mock gateway", async () => {
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

    await chunkStore.createMany([
      {
        id: chunk1Id,
        documentId: docId,
        organizationId: orgId,
        chunkIndex: 0,
        heading: "بخش ۱",
        content: "محتوای تخصصی بخش اول سند جهت پردازش در آزمون.",
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
        heading: "بخش ۲",
        content: "محتوای تخصصی بخش دوم سند جهت پردازش در آزمون.",
        startPage: 3,
        endPage: 4,
        tokenEstimate: 50,
        contentHash: "hash-2",
        createdAt: new Date().toISOString(),
      },
    ]);

    // Use MockModelGateway from the system
    const { MockModelGateway } = await import("../modules/generation/gateway/mock.js");
    const gateway = new MockModelGateway();

    const service = new GenerationService(
      genStore,
      citStore,
      gateway,
      docStore,
      chunkStore,
      new RoleBasedPolicy(),
      auditService,
    );

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    expect(result.contents).toHaveLength(1);
    const quizContent = result.contents[0];
    expect(quizContent.type).toBe("quiz");
    expect(quizContent.status).toBe("draft");

    const payload = quizContent.payload as {
      kind: "quiz";
      title: string;
      questions: Array<{
        sessionIndex?: number;
        question: string;
        questionType: string;
        choices: string[];
        correctAnswer: string;
        explanation: string;
        difficulty?: string;
        category?: string;
        citationChunkIds?: string[];
      }>;
      citationChunkIds: string[];
    };

    expect(payload.kind).toBe("quiz");
    expect(payload.questions.length).toBeGreaterThanOrEqual(1);

    for (const q of payload.questions) {
      expect(q.question).toBeTypeOf("string");
      expect(q.choices).toHaveLength(4);
      // Correct answer MUST be in choices
      expect(q.choices).toContain(q.correctAnswer);
      // No forbidden patterns
      expect(q.choices.some((c) => c.includes("همه موارد"))).toBe(false);
      expect(q.choices.some((c) => c.includes("گزینه انحرافی"))).toBe(false);
      expect(q.explanation.length).toBeGreaterThan(5);
      expect(["easy", "medium", "hard"]).toContain(q.difficulty);
      expect(q.citationChunkIds?.length).toBeGreaterThanOrEqual(1);
    }

    // Verify citations are saved
    const savedCitations = await citStore.listByGeneratedContent(quizContent.id);
    expect(savedCitations.length).toBeGreaterThanOrEqual(1);
  });

  it("15: Answer Leakage / Information Parity: Pipeline normalizes cosmetic English parentheticals and rejects irreparable clue leakage", async () => {
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
        heading: "فارماکولوژی",
        content: "اطلاعات مربوط به داروهای قلبی عروقی.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-1",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                // Q1: Cosmetic English parenthetical in correct answer -> should be safely normalized to "پروپرانولول"
                {
                  question: "داروی ضدآریتمی غیراختصاصی کدام است؟",
                  questionType: "multiple_choice",
                  choices: ["پروپرانولول (Propranolol)", "متوپرولول", "آتنولول", "بیزوپرولول"],
                  correctAnswer: "پروپرانولول (Propranolol)",
                  explanation: "پروپرانولول داروی غیراختصاصی است.",
                  citationChunkIds: [chunk1Id],
                },
                // Q2: Irreparable extreme clue leakage with complex explanatory clause -> should be REJECTED
                {
                  question: "مکانیسم دقیق دارو چیست؟",
                  questionType: "multiple_choice",
                  choices: [
                    "مهار کامل پمپ پروتون اسید معده به صورت برگشت‌ناپذیر و طولانی‌مدت در سلول‌های پاریتال",
                    "کاهش اسید",
                    "اثر موضعی",
                    "خنثی‌سازی",
                  ],
                  correctAnswer: "مهار کامل پمپ پروتون اسید معده به صورت برگشت‌ناپذیر و طولانی‌مدت در سلول‌های پاریتال",
                  explanation: "توضیح مهار کامل پمپ.",
                  citationChunkIds: [chunk1Id],
                },
                // Q3: Balanced question with full symmetric Persian choices -> should be ACCEPTED
                {
                  question: "کدام دارو مهارکننده مستقیم ترومبین است؟",
                  questionType: "multiple_choice",
                  choices: ["دابیگاتران", "ریواروکسابان", "آپیکسابان", "ادوکسابان"],
                  correctAnswer: "دابیگاتران",
                  explanation: "دابیگاتران مهارکننده مستقیم فاکتور IIa است.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه تست نشتی پاسخ",
                description: "بررسی نشتی",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ question: string; choices: string[]; correctAnswer: string }>;
    };

    // Q1 was repaired (normalized to "پروپرانولول"), Q2 was rejected (leakage), Q3 was accepted as-is
    expect(payload.questions).toHaveLength(2);

    const repairedQ = payload.questions.find((q) => q.question.includes("غیراختصاصی"));
    expect(repairedQ).toBeDefined();
    expect(repairedQ?.correctAnswer).toBe("پروپرانولول");
    expect(repairedQ?.choices).toContain("پروپرانولول");
    expect(repairedQ?.choices.some((c) => c.includes("Propranolol"))).toBe(false);

    const balancedQ = payload.questions.find((q) => q.question.includes("ترومبین"));
    expect(balancedQ).toBeDefined();
    expect(balancedQ?.correctAnswer).toBe("دابیگاتران");
  });

  it("16: Stage 4 Generation Pipeline: Safe normalization of trailing explanations and parentheticals across full service workflow", async () => {
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
        heading: "فارماکولوژی غدد",
        content: "اطلاعات کامل در مورد داروهای تیروئید و دیابت.",
        startPage: 1,
        endPage: 2,
        tokenEstimate: 50,
        contentHash: "hash-thyroid",
        createdAt: new Date().toISOString(),
      },
    ]);

    const mockGateway: ModelGateway = {
      provider: "mock",
      model: "mock-test",
      async complete(req: CompletionRequest): Promise<CompletionResult> {
        const sys = req.messages.find((m) => m.role === "system")?.content;
        if (sys === QUIZ_GENERATION_SYSTEM_PROMPT) {
          return {
            text: JSON.stringify({
              kind: "quizzes",
              questions: [
                // Q1: Trailing explanation "، زیرا مانع..." -> should be safely normalized to "متی‌مازول"
                {
                  question: "داروی ضد تیروئید ترجیحی در سه‌ماهه دوم بارداری کدام است؟",
                  questionType: "multiple_choice",
                  choices: [
                    "متی‌مازول، زیرا سمیت کبدی کمتری نسبت به پروپیل‌تیواوراسیل دارد",
                    "پروپیل‌تیواوراسیل",
                    "ید رادیواکتیو",
                    "لووتیروکسین",
                  ],
                  correctAnswer: "متی‌مازول، زیرا سمیت کبدی کمتری نسبت به پروپیل‌تیواوراسیل دارد",
                  explanation: "متی‌مازول در سه‌ماهه دوم و سوم داروی انتخابی است.",
                  citationChunkIds: [chunk1Id],
                },
                // Q2: Exclusive Persian parenthetical "(فرم فعال هورمون)" -> should be safely normalized to "تری‌یدوتیرونین"
                {
                  question: "کدام هورمون تیروئیدی فعالیت بیولوژیک قوی‌تری دارد؟",
                  questionType: "multiple_choice",
                  choices: [
                    "تری‌یدوتیرونین (فرم فعال هورمون)",
                    "تیروکسین",
                    "تیروزین",
                    "دی‌یدوتیروزین",
                  ],
                  correctAnswer: "تری‌یدوتیرونین (فرم فعال هورمون)",
                  explanation: "T3 فرم فعال و اصلی هورمون تیروئید در سطح گیرنده‌های هسته‌ای است.",
                  citationChunkIds: [chunk1Id],
                },
                // Q3: Symmetrical Persian choices -> accepted as-is
                {
                  question: "مهم‌ترین عارضه تهدیدکننده حیات تیوآمیدها کدام است؟",
                  questionType: "multiple_choice",
                  choices: [
                    "آگرانولوسیتوز حاد",
                    "هیپوکالمی شدید",
                    "نارسایی حاد تنفسی",
                    "افزایش شدید فشار خون",
                  ],
                  correctAnswer: "آگرانولوسیتوز حاد",
                  explanation: "آگرانولوسیتوز خطرناک‌ترین عارضه نادر متی‌مازول و PTU است.",
                  citationChunkIds: [chunk1Id],
                },
              ],
              citationChunkIds: [chunk1Id],
            }),
            model: "mock-test",
            usage: { inputTokens: 50, outputTokens: 50 },
            finishReason: "stop",
          };
        }

        // Planning
        return {
          text: JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فارماکولوژی غدد",
            sourceTopics: [],
            sessions: [
              {
                index: 0,
                title: "جلسه تیروئید",
                description: "بررسی داروهای تیروئید",
                coreConcepts: [],
                relevantChunkIds: [chunk1Id],
                targetQuizCount: 5,
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

    const result = await service.generateForDocument(actor, orgId, docId, {
      types: ["quiz"],
      promptVersion: "v1",
      courseId,
    });

    const payload = result.contents[0].payload as {
      kind: "quiz";
      questions: Array<{ question: string; choices: string[]; correctAnswer: string }>;
    };

    expect(payload.questions).toHaveLength(3);

    // Verify Q1 normalized trailing explanation
    const q1 = payload.questions.find((q) => q.question.includes("سه‌ماهه دوم"));
    expect(q1).toBeDefined();
    expect(q1?.correctAnswer).toBe("متی‌مازول");
    expect(q1?.choices).toContain("متی‌مازول");
    expect(q1?.choices.some((c) => c.includes("زیرا"))).toBe(false);

    // Verify Q2 normalized parenthetical
    const q2 = payload.questions.find((q) => q.question.includes("فعالیت بیولوژیک"));
    expect(q2).toBeDefined();
    expect(q2?.correctAnswer).toBe("تری‌یدوتیرونین");
    expect(q2?.choices).toContain("تری‌یدوتیرونین");
    expect(q2?.choices.some((c) => c.includes("فرم فعال"))).toBe(false);

    // Verify Q3 accepted as-is
    const q3 = payload.questions.find((q) => q.question.includes("حیات تیوآمیدها"));
    expect(q3).toBeDefined();
    expect(q3?.correctAnswer).toBe("آگرانولوسیتوز حاد");
  });
});

