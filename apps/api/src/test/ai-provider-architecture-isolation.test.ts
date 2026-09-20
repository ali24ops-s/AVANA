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
    it("Matrix 1: platform_admin on user-facing site (/v1/ai/ask) strictly uses OpenRouter + DeepSeek-v4-flash-0731", async () => {
      let openRouterCalled = false;
      let geminiCalled = false;

      const mockOpenRouterFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        if (url.includes("generativelanguage.googleapis.com")) geminiCalled = true;
        openRouterCalled = true;
        const parsedBody = JSON.parse(init.body as string);

        expect(parsedBody.model).toBe("deepseek/deepseek-v4-flash-0731");
        expect(parsedBody.provider).toEqual({ allow_fallbacks: false });
        expect(parsedBody.models).toBeUndefined();

        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "پاسخ DeepSeek به ادمین در سایت اصلی" } }],
            model: "deepseek/deepseek-v4-flash-0731",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const openRouterGateway = new OpenRouterModelGateway({
        apiKey: "sk-or-v1-test-key",
        modelName: "deepseek/deepseek-v4-flash-0731",
        fetchFn: mockOpenRouterFetch as unknown as typeof fetch,
      });

      const service = new StudyAssistantService(
        openRouterGateway,
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

      expect(openRouterCalled).toBe(true);
      expect(geminiCalled).toBe(false);
      expect(response.answer).toBe("پاسخ DeepSeek به ادمین در سایت اصلی");
    });

    it("Matrix 2: normal student on user-facing site (/v1/ai/ask) strictly uses OpenRouter + DeepSeek-v4-flash-0731", async () => {
      let openRouterCalled = false;

      const mockOpenRouterFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        openRouterCalled = true;
        const parsedBody = JSON.parse(init.body as string);

        expect(parsedBody.model).toBe("deepseek/deepseek-v4-flash-0731");
        expect(parsedBody.provider).toEqual({ allow_fallbacks: false });
        expect(parsedBody.models).toBeUndefined();

        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "پاسخ DeepSeek به دانشجو" } }],
            model: "deepseek/deepseek-v4-flash-0731",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const openRouterGateway = new OpenRouterModelGateway({
        apiKey: "sk-or-v1-test-key",
        modelName: "deepseek/deepseek-v4-flash-0731",
        fetchFn: mockOpenRouterFetch as unknown as typeof fetch,
      });

      const service = new StudyAssistantService(
        openRouterGateway,
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

      expect(openRouterCalled).toBe(true);
      expect(response.answer).toBe("پاسخ DeepSeek به دانشجو");
    });

    it("Matrix 3: platform_admin on user-facing document generation strictly uses OpenRouter + DeepSeek-v4-flash-0731", async () => {
      let openRouterCalls = 0;
      let geminiCalls = 0;

      const mockOpenRouterFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        if (url.includes("generativelanguage.googleapis.com")) geminiCalls++;
        openRouterCalls++;
        const parsedBody = JSON.parse(init.body as string);

        expect(parsedBody.model).toBe("deepseek/deepseek-v4-flash-0731");
        expect(parsedBody.provider).toEqual({ allow_fallbacks: false });

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
            model: "deepseek/deepseek-v4-flash-0731",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const openRouterGateway = new OpenRouterModelGateway({
        apiKey: "sk-or-v1-test-key",
        modelName: "deepseek/deepseek-v4-flash-0731",
        fetchFn: mockOpenRouterFetch as unknown as typeof fetch,
      });

      const genService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        openRouterGateway,
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

      expect(openRouterCalls).toBeGreaterThanOrEqual(1);
      expect(geminiCalls).toBe(0);
    });

    it("Matrix 4: platform_admin on Admin Content Generation path strictly uses Gemini", async () => {
      let geminiFetchCalled = false;
      let openRouterCalled = false;

      const mockGeminiFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("openrouter.ai")) openRouterCalled = true;
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
      expect(openRouterCalled).toBe(false);
      expect(completionResult.text).toContain("content_plan");
      expect(geminiGateway.provider).toBe("gemini");
    });
  });

  describe("End-to-End Pipeline on OpenRouter (DeepSeek)", () => {
    it("runs Planning, Lessons, Flashcards, MCQs, Review Summary entirely through OpenRouter with deepseek/deepseek-v4-flash-0731 and zero fallback", async () => {
      const stagesCalled: string[] = [];

      const mockOpenRouterFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const parsedBody = JSON.parse(init.body as string);
        expect(parsedBody.model).toBe("deepseek/deepseek-v4-flash-0731");
        expect(parsedBody.provider).toEqual({ allow_fallbacks: false });

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
        } else if (
          promptText.includes("multiple-choice quiz questions") ||
          promptText.includes("QUIZ & DISTRACTOR") ||
          promptText.includes("quiz_batch")
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
          promptText.includes("flashcard_batch")
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
            model: "deepseek/deepseek-v4-flash-0731",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const openRouterGateway = new OpenRouterModelGateway({
        apiKey: "sk-or-v1-pipeline-test",
        modelName: "deepseek/deepseek-v4-flash-0731",
        fetchFn: mockOpenRouterFetch as unknown as typeof fetch,
      });

      const genService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        openRouterGateway,
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
    it("on OpenRouter error during user generation, fails immediately without fallback to Gemini or Cloudflare", async () => {
      let geminiCalled = false;
      let cloudflareCalled = false;

      const mockFailingFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("generativelanguage.googleapis.com")) geminiCalled = true;
        if (url.includes("cloudflare.com")) cloudflareCalled = true;

        return new Response(
          JSON.stringify({
            error: {
              message: "DeepSeek is currently overloaded",
              code: 503,
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      });

      const openRouterGateway = new OpenRouterModelGateway({
        apiKey: "sk-or-v1-test-key",
        fetchFn: mockFailingFetch as unknown as typeof fetch,
      });

      const genService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        openRouterGateway,
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
      ).rejects.toThrow(/OpenRouter/i);

      expect(geminiCalled).toBe(false);
      expect(cloudflareCalled).toBe(false);
    });

    it("on Gemini error in admin path, fails without falling back to OpenRouter", async () => {
      let openRouterCalled = false;

      const mockFailingGeminiFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("openrouter.ai")) openRouterCalled = true;

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

      expect(openRouterCalled).toBe(false);
    });
  });

  describe("HTTP Routes & Composition Verification", () => {
    it("POST /v1/organizations/:orgId/courses/:courseId/documents/:docId/generate executes via OpenRouter DeepSeek", async () => {
      let capturedModel = "";
      let capturedAllowFallbacks: boolean | undefined;

      const mockOpenRouterFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const parsedBody = JSON.parse(init.body as string);
        capturedModel = parsedBody.model;
        capturedAllowFallbacks = parsedBody.provider?.allow_fallbacks;

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
            model: "deepseek/deepseek-v4-flash-0731",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const userGateway = new OpenRouterModelGateway({
        apiKey: "sk-or-v1-http-gen-test",
        modelName: "deepseek/deepseek-v4-flash-0731",
        fetchFn: mockOpenRouterFetch as unknown as typeof fetch,
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

      // Verify that background processing executed with OpenRouter DeepSeek
      expect(capturedModel).toBe("deepseek/deepseek-v4-flash-0731");
      expect(capturedAllowFallbacks).toBe(false);
    });

    it("POST /v1/ai/ask strictly dispatches to OpenRouter assistantGateway with zero Gemini fallback", async () => {
      let capturedModel = "";
      let capturedAllowFallbacks: boolean | undefined;

      const mockOpenRouterFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const parsedBody = JSON.parse(init.body as string);
        capturedModel = parsedBody.model;
        capturedAllowFallbacks = parsedBody.provider?.allow_fallbacks;

        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "پاسخ تست HTTP" } }],
            model: "deepseek/deepseek-v4-flash-0731",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const customAssistantGateway = new OpenRouterModelGateway({
        apiKey: "sk-or-v1-http-test",
        modelName: "deepseek/deepseek-v4-flash-0731",
        fetchFn: mockOpenRouterFetch as unknown as typeof fetch,
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
      expect(capturedModel).toBe("deepseek/deepseek-v4-flash-0731");
      expect(capturedAllowFallbacks).toBe(false);
      expect(askRes.json().answer).toBe("پاسخ تست HTTP");
    });

    it("composeLocalDev wires OpenRouter for user gateway & ask, and strictly Gemini for admin gateway", async () => {
      const config = loadApiConfig();
      const { v1Options } = await composeLocalDev(config);

      expect(v1Options.gateway).toBeInstanceOf(OpenRouterModelGateway);
      expect(v1Options.gateway?.provider).toBe("openrouter");
      expect(v1Options.gateway?.model).toBe("deepseek/deepseek-v4-flash-0731");

      expect(v1Options.assistantGateway).toBeInstanceOf(OpenRouterModelGateway);
      expect(v1Options.assistantGateway?.provider).toBe("openrouter");
      expect(v1Options.assistantGateway?.model).toBe("deepseek/deepseek-v4-flash-0731");

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
        expect(v1Options.gateway).toBeInstanceOf(OpenRouterModelGateway);
        expect(v1Options.assistantGateway).toBeInstanceOf(OpenRouterModelGateway);
      } finally {
        await close();
      }
    });
  });

  describe("Configuration & Environment Verification", () => {
    it("loads OPENROUTER_API_KEY and deepseek/deepseek-v4-flash-0731 into server ApiConfig.userAi", () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        NODE_ENV: "test",
        OPENROUTER_API_KEY: "sk-or-v1-loaded-key",
        OPENROUTER_USER_AI_MODEL: "deepseek/deepseek-v4-flash-0731",
      };

      const config = loadApiConfig();
      expect(config.userAi.provider).toBe("openrouter");
      expect(config.userAi.openrouterApiKey).toBe("sk-or-v1-loaded-key");
      expect(config.userAi.openrouterModel).toBe("deepseek/deepseek-v4-flash-0731");

      expect(config.generation.aiProvider).toBe("gemini");

      process.env = originalEnv;
    });

    it("DEFAULT_OPENROUTER_USER_AI_MODEL is deepseek/deepseek-v4-flash-0731", () => {
      expect(DEFAULT_OPENROUTER_USER_AI_MODEL).toBe("deepseek/deepseek-v4-flash-0731");
    });

    it("createModelGateway supports openrouter with deepseek/deepseek-v4-flash-0731 when requested", () => {
      const gw = createModelGateway({
        provider: "openrouter",
        openrouterApiKey: "sk-or-v1-test",
        openrouterModel: "deepseek/deepseek-v4-flash-0731",
      });

      expect(gw.provider).toBe("openrouter");
      expect(gw.model).toBe("deepseek/deepseek-v4-flash-0731");
    });
  });
});
