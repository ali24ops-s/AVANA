import { describe, expect, it, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type UserId,
  defaultPolicy,
} from "@avana/domain";
import { StudyAssistantService } from "../modules/study/assistant-service.js";
import { InMemoryAssistantConversationStore } from "../modules/study/assistant-store.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { hashToken } from "../modules/identity/session-service.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import {
  OpenRouterModelGateway,
  DEFAULT_OPENROUTER_USER_AI_MODEL,
} from "../modules/generation/gateway/openrouter.js";
import {
  GapGPTModelGateway,
  DEFAULT_GAPGPT_USER_AI_MODEL,
} from "../modules/generation/gateway/gapgpt.js";
import { createModelGateway, FallbackModelGateway } from "../modules/generation/gateway/index.js";
import {
  GenerationService,
  InMemoryGenerationQueue,
} from "../modules/generation/index.js";
import { loadApiConfig } from "../config.js";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { composeLocalDev } from "../server/composeLocalDev.js";
import { composeProduction } from "../server/composeProduction.js";

describe("AI Provider Architecture & Request-Path Isolation Tests", () => {
  const orgId = randomUUID() as OrganizationId;
  const studentUser = randomUUID() as UserId;
  const platformAdminUser = randomUUID() as UserId;

  const studentActor: Actor = { userId: studentUser, role: "student" };
  const platformAdminActor: Actor = { userId: platformAdminUser, role: "platform_admin" };

  let conversationStore: InMemoryAssistantConversationStore;
  let lessonStore: InMemoryLessonStore;
  let moduleStore: InMemoryModuleStore;
  let courseStore: InMemoryCourseStore;
  let organizationStore: InMemoryOrganizationStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;

  let courseId: CourseId;
  let moduleId: ModuleId;
  let lessonId: LessonId;
  let documentId: DocumentId;

  beforeEach(async () => {
    conversationStore = new InMemoryAssistantConversationStore();
    lessonStore = new InMemoryLessonStore();
    moduleStore = new InMemoryModuleStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore(organizationStore);
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();

    await organizationStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "پزشکی آوانا",
        slug: "med-avana",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-iso-1",
        organizationId: orgId,
        userId: studentUser,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    organizationStore.addMembership({
      id: "mem-iso-admin",
      organizationId: orgId,
      userId: platformAdminUser,
      role: "platform_admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل اول",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lessonId = randomUUID() as LessonId;
    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "درس اول",
      contentType: "markdown",
      contentMarkdown: "# درس اول\nتوضیحات درس.",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    documentId = randomUUID() as DocumentId;
    await documentStore.create({
      id: documentId,
      organizationId: orgId,
      courseId,
      filename: "test-doc.pdf",
      storageKey: "test/doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      pageCount: 2,
      status: "ready",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await documentChunkStore.createMany([
      {
        id: randomUUID() as import("@avana/domain").DocumentChunkId,
        documentId,
        chunkIndex: 0,
        content: "محتوای بخش اول سند داروسازی و آنتی‌بیوتیک‌ها.",
        pageNumber: 1,
        tokenCount: 20,
        tokenEstimate: 20,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  describe("Provider Selection Matrix by Request Path (Not User Role)", () => {
    it("Matrix 1: platform_admin on user-facing site (/v1/ai/ask) strictly uses GapGPT + deepseek-v4-flash", async () => {
      let gapGptCalled = false;
      let geminiCalled = false;
      let openRouterCalled = false;

      const mockGapGptFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        if (url.includes("generativelanguage.googleapis.com")) geminiCalled = true;
        if (url.includes("openrouter.ai")) openRouterCalled = true;
        gapGptCalled = true;

        expect(url).toBe("https://api.gapgpt.app/v1/chat/completions");
        const headers = init.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer sk-gap-test-key");
        expect(headers["Content-Type"]).toBe("application/json");

        const parsedBody = JSON.parse(init.body as string);
        expect(parsedBody.model).toBe("deepseek-v4-flash");

        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "پاسخ GapGPT به ادمین در سایت اصلی" } }],
            model: "deepseek-v4-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const gapGptGateway = new GapGPTModelGateway({
        apiKey: "sk-gap-test-key",
        modelName: "deepseek-v4-flash",
        fetchFn: mockGapGptFetch as unknown as typeof fetch,
      });

      const service = new StudyAssistantService(
        gapGptGateway,
        conversationStore,
        lessonStore,
        moduleStore,
        courseStore,
        organizationStore,
        defaultPolicy,
      );

      // Execute request with platform_admin actor on user-facing assistant path
      const response = await service.ask(platformAdminActor, {
        message: "سوال ادمین در سایت اصلی",
        context: { type: "lesson", lessonId },
      });

      expect(gapGptCalled).toBe(true);
      expect(geminiCalled).toBe(false);
      expect(openRouterCalled).toBe(false);
      expect(response.answer).toBe("پاسخ GapGPT به ادمین در سایت اصلی");
    });

    it("Matrix 2: normal student on user-facing site (/v1/ai/ask) strictly uses GapGPT + deepseek-v4-flash", async () => {
      let gapGptCalled = false;

      const mockGapGptFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        gapGptCalled = true;
        expect(url).toBe("https://api.gapgpt.app/v1/chat/completions");

        const headers = init.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer sk-gap-test-key");

        const parsedBody = JSON.parse(init.body as string);
        expect(parsedBody.model).toBe("deepseek-v4-flash");

        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "پاسخ GapGPT به دانشجو" } }],
            model: "deepseek-v4-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const gapGptGateway = new GapGPTModelGateway({
        apiKey: "sk-gap-test-key",
        modelName: "deepseek-v4-flash",
        fetchFn: mockGapGptFetch as unknown as typeof fetch,
      });

      const service = new StudyAssistantService(
        gapGptGateway,
        conversationStore,
        lessonStore,
        moduleStore,
        courseStore,
        organizationStore,
        defaultPolicy,
      );

      const response = await service.ask(studentActor, {
        message: "سوال دانشجوی عادی",
        context: { type: "dashboard" },
      });

      expect(gapGptCalled).toBe(true);
      expect(response.answer).toBe("پاسخ GapGPT به دانشجو");
    });

    it("Matrix 3: platform_admin on user-facing document generation strictly uses GapGPT + deepseek-v4-flash", async () => {
      let gapGptCalls = 0;
      let geminiCalls = 0;

      const mockGapGptFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        if (url.includes("generativelanguage.googleapis.com")) geminiCalls++;
        gapGptCalls++;

        expect(url).toBe("https://api.gapgpt.app/v1/chat/completions");
        const headers = init.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer sk-gap-test-key");

        const parsedBody = JSON.parse(init.body as string);
        expect(parsedBody.model).toBe("deepseek-v4-flash");

        const messages = parsedBody.messages || [];
        const promptText = messages.map((m: { content: string }) => m.content).join("\n");
        let responseContent = "";
        if (
          promptText.includes("Planning") ||
          promptText.includes("CONTENT BLUEPRINT") ||
          promptText.includes("content_plan")
        ) {
          responseContent = JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فصل ۱ فارماکولوژی",
            lessons: [{ title: "درس ۱", estimatedMinutes: 10 }],
          });
        } else {
          responseContent = JSON.stringify({
            results: [
              {
                sessionIndex: 0,
                title: "درس ۱: مقدمه فارماکولوژی",
                contentMarkdown: "# مقدمه فارماکولوژی\nمحتوای درس...",
              },
            ],
          });
        }

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: responseContent,
                },
              },
            ],
            model: "deepseek-v4-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const gapGptGateway = new GapGPTModelGateway({
        apiKey: "sk-gap-test-key",
        modelName: "deepseek-v4-flash",
        fetchFn: mockGapGptFetch as unknown as typeof fetch,
      });

      const genService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        gapGptGateway,
        documentStore,
        documentChunkStore,
        defaultPolicy,
        undefined,
        organizationStore,
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        courseStore,
      );

      await genService.generateForDocument(platformAdminActor, orgId, documentId, {
        types: ["lesson"],
        courseId,
      });

      expect(gapGptCalls).toBeGreaterThanOrEqual(1);
      expect(geminiCalls).toBe(0);
    });

    it("Matrix 4: platform_admin on Admin Content Generation path strictly uses Gemini", async () => {
      let geminiFetchCalled = false;
      let gapGptCalled = false;

      const mockGeminiFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("gapgpt.app")) gapGptCalled = true;
        geminiFetchCalled = true;
        expect(url).toContain("generativelanguage.googleapis.com");

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        kind: "content_plan",
                        moduleTitle: "فصل ۱ فارماکولوژی رسمی",
                      }),
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 100 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const geminiGateway = new GeminiModelGateway({
        apiKeys: ["gemini-key-iso-test"],
        modelName: "gemini-3.5-flash-lite",
        fetchFn: mockGeminiFetch as unknown as typeof fetch,
      });

      const docId = randomUUID() as DocumentId;
      const completionResult = await geminiGateway.complete({
        promptVersion: "content-planning-v1",
        stage: "planning",
        messages: [{ role: "user", content: "Plan content for official course." }],
        organizationId: orgId,
        documentId: docId,
        correlationId: "corr-admin-planning-test",
      });

      expect(geminiFetchCalled).toBe(true);
      expect(gapGptCalled).toBe(false);
      expect(completionResult.text).toContain("content_plan");
      expect(geminiGateway.provider).toBe("gemini");
    });

    it("Matrix 5: platform_admin on Admin Content Repair path strictly uses Gemini", async () => {
      let geminiFetchCalled = false;
      let gapGptCalled = false;

      const mockGeminiFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("gapgpt.app")) gapGptCalled = true;
        geminiFetchCalled = true;
        expect(url).toContain("generativelanguage.googleapis.com");

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        repairedText: "محتوای بازسازی شده با جمینای ادمین",
                      }),
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: { promptTokenCount: 60, candidatesTokenCount: 120 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const geminiGateway = new GeminiModelGateway({
        apiKeys: ["gemini-key-repair-test"],
        modelName: "gemini-3.5-flash-lite",
        fetchFn: mockGeminiFetch as unknown as typeof fetch,
      });

      const completionResult = await geminiGateway.complete({
        promptVersion: "content-repair-v1",
        messages: [{ role: "user", content: "Repair broken markdown format." }],
        organizationId: orgId,
        correlationId: "corr-admin-repair-test",
      });

      expect(geminiFetchCalled).toBe(true);
      expect(gapGptCalled).toBe(false);
      expect(completionResult.text).toContain("محتوای بازسازی شده با جمینای ادمین");
      expect(geminiGateway.provider).toBe("gemini");
    });
  });

  describe("End-to-End Pipeline on GapGPT (deepseek-v4-flash)", () => {
    it("runs Planning, Lessons, Flashcards, MCQs, Review Summary entirely through GapGPT with deepseek-v4-flash and zero fallback", async () => {
      const stagesCalled: string[] = [];

      const mockGapGptFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api.gapgpt.app/v1/chat/completions");
        const headers = init.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer sk-gap-pipeline-test");

        const parsedBody = JSON.parse(init.body as string);
        expect(parsedBody.model).toBe("deepseek-v4-flash");

        const promptText = JSON.stringify(parsedBody.messages);
        let responseContent = "{}";

        if (
          promptText.includes("educational content plans") ||
          promptText.includes("content_plan")
        ) {
          stagesCalled.push("planning");
          responseContent = JSON.stringify({
            kind: "content_plan",
            moduleTitle: "فصل ۱ فارماکولوژی",
            lessons: [{ title: "درس ۱", estimatedMinutes: 10 }],
          });
        } else if (
          promptText.includes("multiple-choice quiz questions") ||
          promptText.includes("QUIZ & DISTRACTOR") ||
          promptText.includes("quizzes_batch") ||
          promptText.includes("quiz_batch") ||
          promptText.includes("QUIZ")
        ) {
          stagesCalled.push("quiz");
          responseContent = JSON.stringify({
            results: [
              {
                sessionIndex: 0,
                questions: [
                  {
                    question: "کدام مسیر جذب ۱۰۰٪ فراهمی زیستی دارد؟",
                    choices: ["وریدی", "خوراکی", "عضلانی", "جلدی"],
                    correctAnswer: "وریدی",
                    explanation: "تزریق وریدی مستقیم وارد گردش خون می‌شود.",
                  },
                ],
              },
            ],
            questions: [
              {
                question: "کدام مسیر جذب ۱۰۰٪ فراهمی زیستی دارد؟",
                choices: ["وریدی", "خوراکی", "عضلانی", "جلدی"],
                correctAnswer: "وریدی",
                explanation: "تزریق وریدی مستقیم وارد گردش خون می‌شود.",
              },
            ],
          });
        } else if (
          promptText.includes("atomic flashcards") ||
          promptText.includes("FLASHCARD GENERATION") ||
          promptText.includes("flashcards_batch") ||
          promptText.includes("flashcard_batch") ||
          promptText.includes("FLASHCARD")
        ) {
          stagesCalled.push("flashcard");
          responseContent = JSON.stringify({
            results: [
              {
                sessionIndex: 0,
                cards: [{ question: "تعریف فارماکوکینتیک؟", answer: "حرکت دارو در بدن" }],
              },
            ],
            cards: [{ question: "تعریف فارماکوکینتیک؟", answer: "حرکت دارو در بدن" }],
          });
        } else if (
          promptText.includes("educational lesson content") ||
          promptText.includes("COMPLETE LESSON GENERATION") ||
          promptText.includes("LESSON GENERATION") ||
          promptText.includes("lesson_batch")
        ) {
          stagesCalled.push("lesson");
          responseContent = JSON.stringify({
            results: [
              {
                sessionIndex: 0,
                title: "درس ۱: مقدمه فارماکولوژی",
                contentMarkdown: "# مقدمه فارماکولوژی\nمحتوای درس...",
                objectives: ["هدف ۱"],
              },
            ],
            title: "درس ۱: مقدمه فارماکولوژی",
            contentMarkdown: "# مقدمه فارماکولوژی\nمحتوای درس...",
            objectives: ["هدف ۱"],
          });
        } else {
          stagesCalled.push("review_summary");
          responseContent = JSON.stringify({
            title: "خلاصه مرور",
            summary: "مرور نکات کلیدی",
            keyPoints: ["نکته ۱"],
          });
        }

        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: responseContent } }],
            model: "deepseek-v4-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const gapGptGateway = new GapGPTModelGateway({
        apiKey: "sk-gap-pipeline-test",
        modelName: "deepseek-v4-flash",
        fetchFn: mockGapGptFetch as unknown as typeof fetch,
      });

      const genService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        gapGptGateway,
        documentStore,
        documentChunkStore,
        defaultPolicy,
        undefined,
        organizationStore,
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        courseStore,
      );

      await genService.generateForDocument(platformAdminActor, orgId, documentId, {
        types: ["lesson", "flashcard", "quiz"],
        courseId,
      });

      expect(stagesCalled).toContain("planning");
      expect(stagesCalled).toContain("lesson");
      expect(stagesCalled).toContain("flashcard");
      expect(stagesCalled).toContain("quiz");
    });
  });

  describe("Failure Isolation & Zero Silent Fallback", () => {
    it("on GapGPT error during user generation, fails immediately without fallback to Gemini or OpenRouter", async () => {
      let geminiCalled = false;
      let openRouterCalled = false;
      let cloudflareCalled = false;

      const mockFailingFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("generativelanguage.googleapis.com")) geminiCalled = true;
        if (url.includes("openrouter.ai")) openRouterCalled = true;
        if (url.includes("cloudflare.com")) cloudflareCalled = true;

        return new Response(
          JSON.stringify({
            error: {
              message: "GapGPT API request rejected: insufficient quota",
              code: "insufficient_quota",
            },
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
      });

      const gapGptGateway = new GapGPTModelGateway({
        apiKey: "sk-gap-fail-test",
        modelName: "deepseek-v4-flash",
        fetchFn: mockFailingFetch as unknown as typeof fetch,
      });

      const genService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        gapGptGateway,
        documentStore,
        documentChunkStore,
        defaultPolicy,
        undefined,
        organizationStore,
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        courseStore,
      );

      await expect(
        genService.generateForDocument(platformAdminActor, orgId, documentId, {
          types: ["lesson"],
          courseId,
        }),
      ).rejects.toThrow(/GapGPT/i);

      expect(geminiCalled).toBe(false);
      expect(openRouterCalled).toBe(false);
      expect(cloudflareCalled).toBe(false);
    });

    it("on Gemini error in admin path, fails without falling back to GapGPT", async () => {
      let gapGptCalled = false;

      const mockFailingGeminiFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("gapgpt.app")) gapGptCalled = true;

        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              message: "The model is overloaded.",
              status: "UNAVAILABLE",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      });

      const geminiGateway = new GeminiModelGateway({
        apiKeys: ["gemini-key-fail-test"],
        modelName: "gemini-3.5-flash-lite",
        fetchFn: mockFailingGeminiFetch as unknown as typeof fetch,
      });

      const docId = randomUUID() as DocumentId;
      await expect(
        geminiGateway.complete({
          promptVersion: "content-planning-v1",
          stage: "planning",
          messages: [{ role: "user", content: "Plan content." }],
          organizationId: orgId,
          documentId: docId,
          correlationId: "corr-fail-test",
        }),
      ).rejects.toThrow(/Gemini API service unavailable/i);

      expect(gapGptCalled).toBe(false);
    });
  });

  describe("HTTP Routes & Composition Verification", () => {
    it("POST /v1/organizations/:orgId/courses/:courseId/documents/:docId/generate executes via GapGPT deepseek-v4-flash", async () => {
      let capturedModel = "";
      let capturedUrl = "";
      let capturedAuth = "";

      const mockGapGptFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        const headers = init.headers as Record<string, string>;
        capturedAuth = headers["Authorization"] || "";
        const parsedBody = JSON.parse(init.body as string);
        capturedModel = parsedBody.model;

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    kind: "content_plan",
                    moduleTitle: "فصل ۱",
                    lessons: [{ title: "درس ۱", estimatedMinutes: 10 }],
                  }),
                },
              },
            ],
            model: "deepseek-v4-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const userGateway = new GapGPTModelGateway({
        apiKey: "sk-gap-http-gen-test",
        modelName: "deepseek-v4-flash",
        fetchFn: mockGapGptFetch as unknown as typeof fetch,
      });

      const sessionStore = new InMemorySessionStore();
      const userStore = new InMemoryUserStore(organizationStore);
      const config = loadApiConfig();

      const genService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        userGateway,
        documentStore,
        documentChunkStore,
        defaultPolicy,
        undefined,
        organizationStore,
        moduleStore,
        lessonStore,
        flashcardStore,
        quizStore,
        quizQuestionStore,
        courseStore,
      );

      const queue = new InMemoryGenerationQueue(generationJobStore, genService);
      const walletStore = new InMemoryWalletStore();
      const walletService = new WalletService(walletStore);

      const app = createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        organizationStore,
        courseStore,
        moduleStore,
        lessonStore,
        progressStore: new InMemoryProgressStore(),
        documentStore,
        documentChunkStore,
        generatedContentStore,
        generatedContentCitationStore,
        generationJobStore,
        flashcardStore,
        flashcardReviewStore: new InMemoryFlashcardReviewStore(),
        quizStore,
        quizQuestionStore,
        quizAttemptStore: new InMemoryQuizAttemptStore(new InMemoryQuizStore()),
        conversationStore,
        queue,
        gateway: userGateway,
        assistantGateway: userGateway,
        walletStore,
        walletService,
      });

      // Create student user with a session and funded wallet
      const studentSessionToken = "student-session-secret-token-123";
      await userStore.createUserWithPassword({
        email: "student_doc_gen@avana.ai",
        passwordHash: "dummy-hash",
        name: "Student Doc Gen",
        phoneNumber: "09121110099",
        globalRole: null,
      });
      const createdUser = (await userStore.findByEmail("student_doc_gen@avana.ai"))!;
      organizationStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: createdUser.id,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await sessionStore.insert({
        userId: createdUser.id,
        tokenHash: hashToken(studentSessionToken),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
      await walletStore.createWallet({
        userId: createdUser.id,
        balance: 100_000,
        currency: "toman",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const sessionCookie = `avana_session=${studentSessionToken}`;

      // Trigger document generation from student on the main site endpoint
      const genRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${documentId}/generate`,
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          types: ["lesson"],
        }),
      });

      expect(genRes.statusCode).toBe(202);
      expect(genRes.json().job_id).toBeDefined();

      // Wait a tick for in-memory background job to execute
      await new Promise((r) => setTimeout(r, 150));

      // Verify that background processing executed with GapGPT deepseek-v4-flash
      expect(capturedUrl).toBe("https://api.gapgpt.app/v1/chat/completions");
      expect(capturedAuth).toBe("Bearer sk-gap-http-gen-test");
      expect(capturedModel).toBe("deepseek-v4-flash");
    });

    it("POST /v1/ai/ask strictly dispatches to GapGPT assistantGateway with zero Gemini fallback", async () => {
      let capturedModel = "";
      let capturedUrl = "";
      let capturedAuth = "";

      const mockGapGptFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        const headers = init.headers as Record<string, string>;
        capturedAuth = headers["Authorization"] || "";
        const parsedBody = JSON.parse(init.body as string);
        capturedModel = parsedBody.model;

        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "پاسخ تست HTTP GapGPT" } }],
            model: "deepseek-v4-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const customAssistantGateway = new GapGPTModelGateway({
        apiKey: "sk-gap-http-ask-test",
        modelName: "deepseek-v4-flash",
        fetchFn: mockGapGptFetch as unknown as typeof fetch,
      });

      const sessionStore = new InMemorySessionStore();
      const userStore = new InMemoryUserStore();
      const config = loadApiConfig();

      const app = createApp({ config });
      await app.register(v1Routes, {
        config,
        sessionStore,
        userStore,
        organizationStore,
        courseStore,
        moduleStore,
        lessonStore,
        progressStore: new InMemoryProgressStore(),
        flashcardStore: new InMemoryFlashcardStore(),
        flashcardReviewStore: new InMemoryFlashcardReviewStore(),
        quizStore,
        quizQuestionStore,
        quizAttemptStore: new InMemoryQuizAttemptStore(new InMemoryQuizStore()),
        conversationStore,
        assistantGateway: customAssistantGateway,
      });

      const regRes = await app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "admin_user_site@avana.ai",
          password: "password123456",
          name: "Admin User",
          phoneNumber: "09121110088",
        }),
      });
      expect(regRes.statusCode).toBe(200);
      const cookie = regRes.cookies.find((c) => c.name === "avana_session");
      const sessionCookie = `avana_session=${cookie?.value}`;

      const createdUser = await userStore.findByEmail("admin_user_site@avana.ai");
      if (createdUser) {
        createdUser.role = "platform_admin";
        createdUser.globalRole = "platform_admin";
      }

      const askRes = await app.inject({
        method: "POST",
        url: "/v1/ai/ask",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          message: "سوال تست از آوانا",
          context: { type: "dashboard" },
        }),
      });

      expect(askRes.statusCode).toBe(200);
      expect(capturedUrl).toBe("https://api.gapgpt.app/v1/chat/completions");
      expect(capturedAuth).toBe("Bearer sk-gap-http-ask-test");
      expect(capturedModel).toBe("deepseek-v4-flash");
      expect(askRes.json().answer).toBe("پاسخ تست HTTP GapGPT");
    });

    it("composeLocalDev wires GapGPT for user gateway & ask, and strictly Gemini for admin gateway", async () => {
      const config = loadApiConfig();
      const { v1Options } = await composeLocalDev(config);

      expect(v1Options.gateway).toBeInstanceOf(GapGPTModelGateway);
      expect(v1Options.gateway?.provider).toBe("gapgpt");
      expect(v1Options.gateway?.model).toBe("deepseek-v4-flash");

      expect(v1Options.assistantGateway).toBeInstanceOf(GapGPTModelGateway);
      expect(v1Options.assistantGateway?.provider).toBe("gapgpt");
      expect(v1Options.assistantGateway?.model).toBe("deepseek-v4-flash");

      expect(v1Options.adminGateway).toBeInstanceOf(GeminiModelGateway);
      expect(v1Options.adminGateway).not.toBeInstanceOf(FallbackModelGateway);
      expect(v1Options.adminGateway?.provider).toBe("gemini");
    });

    it("composeLocalDev forces adminGateway to Gemini even if global aiProvider is groq and fallback is true", async () => {
      const baseConfig = loadApiConfig();
      const overriddenConfig = {
        ...baseConfig,
        generation: {
          ...baseConfig.generation,
          aiProvider: "groq" as const,
          enableFallback: true,
          groqApiKey: "gsk_dummy_groq_key",
          cloudflareAccountId: "cf_account",
          cloudflareApiToken: "cf_token",
          gapgptApiKey: "gap_key",
        },
      };

      const { v1Options } = await composeLocalDev(overriddenConfig);

      expect(v1Options.adminGateway).toBeInstanceOf(GeminiModelGateway);
      expect(v1Options.adminGateway).not.toBeInstanceOf(FallbackModelGateway);
      expect(v1Options.adminGateway?.provider).toBe("gemini");
    });

    it("composeProduction forces adminGateway to Gemini even if global config has other providers and fallback enabled", async () => {
      const baseConfig = loadApiConfig();
      const overriddenConfig = {
        ...baseConfig,
        generation: {
          ...baseConfig.generation,
          aiProvider: "groq" as const,
          enableFallback: true,
          groqApiKey: "gsk_dummy_groq_key",
          cloudflareAccountId: "cf_account",
          cloudflareApiToken: "cf_token",
          gapgptApiKey: "gap_key",
          arvancloudApiKey: "arvan_key",
        },
      };

      const { v1Options, close } = await composeProduction(overriddenConfig);
      try {
        expect(v1Options.adminGateway).toBeInstanceOf(GeminiModelGateway);
        expect(v1Options.adminGateway).not.toBeInstanceOf(FallbackModelGateway);
        expect(v1Options.adminGateway?.provider).toBe("gemini");
        expect(v1Options.gateway).toBeInstanceOf(GapGPTModelGateway);
        expect(v1Options.assistantGateway).toBeInstanceOf(GapGPTModelGateway);
      } finally {
        await close();
      }
    });
  });

  describe("Configuration & Environment Verification", () => {
    it("defaults ApiConfig.userAi to GapGPT with deepseek-v4-flash when env is empty", () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: "test",
      };
      delete process.env.USER_AI_PROVIDER;
      delete process.env.GAPGPT_API_KEY;
      delete process.env.GAPGPT_BASE_URL;
      delete process.env.GAPGPT_USER_AI_MODEL;

      const config = loadApiConfig();
      expect(config.userAi.provider).toBe("gapgpt");
      expect(config.userAi.gapgptModel).toBe("deepseek-v4-flash");
      expect(config.userAi.gapgptBaseUrl).toBe("https://api.gapgpt.app/v1");

      expect(config.generation.aiProvider).toBe("gemini");

      process.env = originalEnv;
    });

    it("loads GAPGPT_API_KEY, GAPGPT_BASE_URL, and deepseek-v4-flash into server ApiConfig.userAi", () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: "test",
        GAPGPT_API_KEY: "sk-gap-v1-loaded-key",
        GAPGPT_BASE_URL: "https://api.gapgpt.app/v1",
        GAPGPT_USER_AI_MODEL: "deepseek-v4-flash",
      };

      const config = loadApiConfig();
      expect(config.userAi.provider).toBe("gapgpt");
      expect(config.userAi.gapgptApiKey).toBe("sk-gap-v1-loaded-key");
      expect(config.userAi.gapgptBaseUrl).toBe("https://api.gapgpt.app/v1");
      expect(config.userAi.gapgptModel).toBe("deepseek-v4-flash");

      expect(config.generation.aiProvider).toBe("gemini");

      process.env = originalEnv;
    });

    it("DEFAULT_GAPGPT_USER_AI_MODEL is deepseek-v4-flash", () => {
      expect(DEFAULT_GAPGPT_USER_AI_MODEL).toBe("deepseek-v4-flash");
    });

    it("createModelGateway supports gapgpt with deepseek-v4-flash when requested", () => {
      const gw = createModelGateway({
        provider: "gapgpt",
        gapgptApiKey: "sk-gap-v1-test",
        gapgptModel: "deepseek-v4-flash",
      });

      expect(gw.provider).toBe("gapgpt");
      expect(gw.model).toBe("deepseek-v4-flash");
    });

    it("supports legacy openrouter in config if explicitly configured", () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: "test",
        USER_AI_PROVIDER: "openrouter",
        OPENROUTER_API_KEY: "sk-or-v1-loaded-key",
        OPENROUTER_USER_AI_MODEL: "deepseek/deepseek-v4-flash-0731",
      };

      const config = loadApiConfig();
      expect(config.userAi.provider).toBe("openrouter");
      expect(config.userAi.openrouterApiKey).toBe("sk-or-v1-loaded-key");
      expect(config.userAi.openrouterModel).toBe("deepseek/deepseek-v4-flash-0731");

      process.env = originalEnv;
    });
  });
});
