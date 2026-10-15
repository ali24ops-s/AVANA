import { describe, expect, it, vi } from "vitest";
import {
  DomainError,
  type Actor,
  type CourseId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type UserId,
} from "@avana/domain";
import { StudyAssistantService } from "../modules/study/assistant-service.js";
import { InMemoryAssistantConversationStore } from "../modules/study/assistant-store.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
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
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { hashToken } from "../modules/identity/session-service.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { GeminiRateLimiter } from "../modules/generation/gateway/gemini-rate-limiter.js";
import { GeminiKeyPool } from "../modules/generation/gateway/gemini-key-pool.js";
import { composeProduction } from "../server/composeProduction.js";
import { composeWorker } from "../../../worker/src/compose.js";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { loadApiConfig } from "../config.js";
import { PaymentInfoExtractionService } from "../modules/commerce/payment-extraction-service.js";

describe("Gemini Unified User AI Architecture & Rate Limiter Tests", () => {
  const fakeOrgId = "11111111-1111-4111-a111-111111111111" as OrganizationId;
  const fakeUserId = "22222222-2222-4222-a222-222222222222" as UserId;
  const fakeCourseId = "33333333-3333-4333-a333-333333333333" as CourseId;
  const fakeModuleId = "44444444-4444-4444-a444-444444444444" as ModuleId;
  const fakeLessonId = "55555555-5555-4555-a555-555555555555" as LessonId;

  const studentActor: Actor = {
    userId: fakeUserId,
    role: "student",
  };

  it("Scenario 1: StudyAssistantService.ask passes stage 'interactive' and receives natural Persian Markdown from Gemini", async () => {
    let capturedBody: { generationConfig?: { responseMimeType?: string; responseSchema?: unknown } } | null = null;
    let capturedHeaders: Record<string, string> | null = null;

    const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedHeaders = opts?.headers as Record<string, string>;
      capturedBody = JSON.parse(opts?.body as string);
      return {
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: "## راهنمای مطالعه\n\nبرای درک بهتر فارماکولوژی، مکانیسم اثر گیرنده‌ها را مرور کنید.",
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 120,
              candidatesTokenCount: 45,
            },
          }),
      };
    });

    const keyPool = new GeminiKeyPool({
      keyConfigs: [{ id: "key-1", apiKey: "test-gemini-key-1", projectId: "proj-1" }],
    });

    const gateway = new GeminiModelGateway({
      apiKey: "test-gemini-key-1",
      keyPool,
      fetchFn: mockFetch,
    });

    const conversationStore = new InMemoryAssistantConversationStore();
    const lessonStore = new InMemoryLessonStore();
    const moduleStore = new InMemoryModuleStore();
    const courseStore = new InMemoryCourseStore();
    const organizationStore = new InMemoryOrganizationStore();

    await organizationStore.createWithAdminMembership({
      organization: {
        id: fakeOrgId,
        name: "دانشگاه تست",
        slug: "test-uni",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-test-1",
        organizationId: fakeOrgId,
        userId: fakeUserId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: fakeCourseId,
        organizationId: fakeOrgId,
        title: "فارماکولوژی پایه",
        slug: "basic-pharm",
        level: "introductory",
        status: "published",
        visibility: "public",
        subject: "Medical",
        description: "",
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: fakeModuleId,
      courseId: fakeCourseId,
      title: "دستگاه عصبی خودکار",
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: fakeLessonId,
      moduleId: fakeModuleId,
      title: "داروهای آدرنرژیک",
      sortOrder: 0,
      contentMarkdown: "# داروهای آدرنرژیک\nآگونیست‌های بتا یک ضربان قلب را افزایش می‌دهند.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const service = new StudyAssistantService(
      gateway,
      conversationStore,
      lessonStore,
      moduleStore,
      courseStore,
      organizationStore,
    );

    const result = await service.ask(studentActor, {
      message: "تأثیر آگونیست‌های بتا یک چیست؟",
      context: {
        type: "lesson",
        lessonId: fakeLessonId,
        courseId: fakeCourseId,
      },
    });

    expect(result.answer).toContain("راهنمای مطالعه");
    expect(result.answer).toContain("فارماکولوژی");
    expect(result.sources?.lessonTitle).toBe("داروهای آدرنرژیک");

    // Verify Gemini payload does NOT have forced responseMimeType: "application/json"
    expect(capturedBody.generationConfig?.responseMimeType).toBeUndefined();
    expect(capturedHeaders["x-goog-api-key"]).toBe("test-gemini-key-1");
  });

  it("Scenario 2: Exam Mentor prompt via POST /v1/ai/ask receives natural text guidance from Gemini", async () => {
    let capturedBody: { contents?: unknown } | null = null;

    const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = JSON.parse(opts?.body as string);
      return {
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: "راهنمایی منتور: به گیرنده هدف پروپرانولول در قلب و عروق توجه کنید. [بر اساس محتوای درس]",
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 210,
              candidatesTokenCount: 60,
            },
          }),
      };
    });

    const keyPool = new GeminiKeyPool({
      keyConfigs: [{ id: "key-1", apiKey: "test-gemini-key-1", projectId: "proj-1" }],
    });

    const gateway = new GeminiModelGateway({
      apiKey: "test-gemini-key-1",
      keyPool,
      fetchFn: mockFetch,
    });

    const sessionStore = new InMemorySessionStore();
    const userStore = new InMemoryUserStore();
    const token = "student-test-token";
    const user = await userStore.createUserWithPassword({
      email: "student@avana.ir",
      passwordHash: "hash",
      name: "دانشجو",
    });
    await sessionStore.insert({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const config = loadApiConfig();
    const app = createApp({ config });

    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      gateway,
      assistantGateway: gateway,
      conversationStore: new InMemoryAssistantConversationStore(),
      lessonStore: new InMemoryLessonStore(),
      moduleStore: new InMemoryModuleStore(),
      courseStore: new InMemoryCourseStore(),
      organizationStore: new InMemoryOrganizationStore(),
      flashcardStore: new InMemoryFlashcardStore(),
      flashcardReviewStore: new InMemoryFlashcardReviewStore(),
      quizStore: new InMemoryQuizStore(),
      quizQuestionStore: new InMemoryQuizQuestionStore(),
      quizAttemptStore: new InMemoryQuizAttemptStore(),
    });

    const examMentorPrompt = `شما در حال راهنمایی آموزشی یک دانشجو در حین برگزاری آزمون هستید.
دانشجو برای سوال شماره ۱ راهنمایی می‌خواهد.
متن سوال: کدام دارو یک بتابلوکر غیرانتخابی است؟
گزینه‌ها: ۱) متوپرولول ۲) پروپرانولول ۳) آتنولول ۴) اسمولول
دستورالعمل مهم: هرگز پاسخ صحیح را مستقیماً لو ندهید. پاسخ را کوتاه و به زبان فارسی بنویسید.`;

    const response = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: {
        message: examMentorPrompt,
        context: {
          type: "dashboard",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.answer).toContain("راهنمایی منتور");
    expect(body.answer).toContain("پروپرانولول");
    expect(capturedBody.generationConfig?.responseMimeType).toBeUndefined();
  });

  it("Scenario 3: Interactive mentor queries tap into reserved 10% capacity pool during rate limit pressure", async () => {
    // Set 10 RPM limit with 10% reserved for interactive
    // Non-interactive requests can use at most 9 requests (90% via math.floor)
    // The 10th non-interactive request will be rejected, but an interactive request will succeed!
    const rateLimiter = new GeminiRateLimiter({
      defaultRpm: 10,
      defaultTpm: 100000,
      interactiveReservedPercent: 10,
    });

    const keyPool = new GeminiKeyPool({
      keyConfigs: [{ id: "slot-1", apiKey: "gemini-key-1", projectId: "proj-1" }],
      rateLimiter,
    });

    // 1. Consume 9 non-interactive requests (reaches 90% limit)
    for (let i = 0; i < 9; i++) {
      const res = await keyPool.acquireKeySlotAsync({
        model: "gemini-3.5-flash-lite",
        isInteractive: false,
        estimatedTokens: 100,
      });
      expect(res.slot.id).toBe("slot-1");
    }

    // 2. 10th non-interactive request (batch generation) must be rejected
    await expect(
      keyPool.acquireKeySlotAsync({
        model: "gemini-3.5-flash-lite",
        isInteractive: false,
        estimatedTokens: 100,
      }),
    ).rejects.toThrow(DomainError);

    // 3. BUT an interactive request (Study Assistant / Mentor) CAN still acquire capacity from the reserved 10%!
    const interactiveRes = await keyPool.acquireKeySlotAsync({
      model: "gemini-3.5-flash-lite",
      isInteractive: true,
      estimatedTokens: 100,
    });
    expect(interactiveRes.slot.id).toBe("slot-1");
    expect(interactiveRes.reservationId).toBeDefined();
  });

  it("Scenario 4: PaymentExtractionService successfully extracts receipt details using Gemini structured JSON mode", async () => {
    let capturedBody: { generationConfig?: { responseMimeType?: string; responseSchema?: unknown } } | null = null;

    const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
      capturedBody = JSON.parse(opts?.body as string);
      return {
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        amount: 500000,
                        currency: "toman",
                        trackingNumber: "TRX-987654321",
                        sourceCardLast4: "1234",
                        paymentDate: "1404/12/15",
                        paymentTime: "14:30",
                        payerName: "علی رضایی",
                      }),
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 150,
              candidatesTokenCount: 70,
            },
          }),
      };
    });

    const keyPool = new GeminiKeyPool({
      keyConfigs: [{ id: "key-1", apiKey: "test-gemini-key-1", projectId: "proj-1" }],
    });

    const gateway = new GeminiModelGateway({
      apiKey: "test-gemini-key-1",
      keyPool,
      fetchFn: mockFetch,
    });

    const service = new PaymentInfoExtractionService(
      gateway,
      "5894631131738239",
    );

    const smsText = `انتقال کارت به کارت به مبلغ ۵۰۰,۰۰۰ تومان به شماره کارت ۵۸۹۴۶۳۱۱... از کارت ۱۲۳۴ با پیگیری ۹۸۷۶۵۴۳۲۱ در ساعت ۱۴:۳۰ مورخ ۱۴۰۴/۱۲/۱۵ به نام علی رضایی`;

    const extracted = await service.extract(smsText, {
      destinationCardNumber: "5894631131738239",
    });

    expect(extracted).not.toBeNull();
    expect(extracted.data.amount).toBe(500000);
    expect(extracted.data.trackingNumber).toBe("TRX-987654321");
    expect(extracted.data.sourceCardLast4).toBe("1234");
    expect(extracted.data.payerName).toBe("علی رضایی");

    // Verify Gemini payload DID include responseMimeType: "application/json" and schema
    expect(capturedBody?.generationConfig?.responseMimeType).toBe("application/json");
    expect(capturedBody?.generationConfig?.responseSchema).toBeDefined();
  });

  it("Scenario 5: 429 Rate Limit throws rate_limit_exceeded and Fastify formats friendly Persian message", async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return {
        status: 429,
        statusText: "Too Many Requests",
        text: async () =>
          JSON.stringify({
            error: {
              code: 429,
              message: "Resource has been exhausted (e.g. check quota).",
              status: "RESOURCE_EXHAUSTED",
            },
          }),
      };
    });

    const keyPool = new GeminiKeyPool({
      keyConfigs: [{ id: "key-1", apiKey: "test-gemini-key-1", projectId: "proj-1" }],
    });

    const gateway = new GeminiModelGateway({
      apiKey: "test-gemini-key-1",
      keyPool,
      fetchFn: mockFetch,
    });

    const sessionStore = new InMemorySessionStore();
    const userStore = new InMemoryUserStore();
    const token = "quota-test-token";
    const user = await userStore.createUserWithPassword({
      email: "quota@avana.ir",
      passwordHash: "hash",
      name: "دانشجو",
    });
    await sessionStore.insert({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const config = loadApiConfig();
    const app = createApp({ config });

    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      gateway,
      assistantGateway: gateway,
      conversationStore: new InMemoryAssistantConversationStore(),
      lessonStore: new InMemoryLessonStore(),
      moduleStore: new InMemoryModuleStore(),
      courseStore: new InMemoryCourseStore(),
      organizationStore: new InMemoryOrganizationStore(),
      flashcardStore: new InMemoryFlashcardStore(),
      flashcardReviewStore: new InMemoryFlashcardReviewStore(),
      quizStore: new InMemoryQuizStore(),
      quizQuestionStore: new InMemoryQuizQuestionStore(),
      quizAttemptStore: new InMemoryQuizAttemptStore(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: {
        message: "سوال با شبیه‌سازی اتمام سهمیه",
        context: { type: "dashboard" },
      },
    });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.error?.code).toBe("rate_limit_exceeded");
    expect(body.error?.message).toContain("سهمیه هوش مصنوعی");
  });

  it("Scenario 6: composeWorker and composeProduction share central Gemini gateway without parallel pools", async () => {
    const config = loadApiConfig();
    const prod = await composeProduction(config);
    try {
      expect(prod.v1Options.adminGateway).toBeInstanceOf(GeminiModelGateway);
      expect(prod.v1Options.gateway).toBe(prod.v1Options.adminGateway);
      expect(prod.v1Options.assistantGateway).toBe(prod.v1Options.adminGateway);
    } finally {
      await prod.close();
    }

    const worker = await composeWorker(config);
    try {
      expect(worker.adminGateway).toBeInstanceOf(GeminiModelGateway);
      expect(worker.userGateway).toBe(worker.adminGateway);
      expect(worker.gateway).toBe(worker.adminGateway);
    } finally {
      await worker.close();
    }
  });

  it("Scenario 7: Small capacity rounding ensures background never exceeds 90% and reserves capacity for interactive", async () => {
    // When RPM = 1, math.floor(1 * 0.9) = 0. Background can do 0 requests, reserving the 1 request for interactive!
    const rateLimiter = new GeminiRateLimiter({
      defaultRpm: 1,
      defaultTpm: 100000,
      interactiveReservedPercent: 10,
    });

    const keyPool = new GeminiKeyPool({
      keyConfigs: [{ id: "slot-small", apiKey: "key-small", projectId: "proj-small" }],
      rateLimiter,
    });

    // Non-interactive is denied immediately
    await expect(
      keyPool.acquireKeySlotAsync({
        model: "gemini-3.5-flash-lite",
        isInteractive: false,
        estimatedTokens: 100,
      }),
    ).rejects.toThrow(DomainError);

    // Interactive is allowed
    const res = await keyPool.acquireKeySlotAsync({
      model: "gemini-3.5-flash-lite",
      isInteractive: true,
      estimatedTokens: 100,
    });
    expect(res.slot.id).toBe("slot-small");
  });

  it("Scenario 8: Multiple keys belonging to the same project share quota without multiplying capacity", async () => {
    const rateLimiter = new GeminiRateLimiter({
      defaultRpm: 2,
      defaultTpm: 100000,
      interactiveReservedPercent: 0,
    });

    const keyPool = new GeminiKeyPool({
      keyConfigs: [
        { id: "key-a", apiKey: "key-a-token", projectId: "shared-gcp-project" },
        { id: "key-b", apiKey: "key-b-token", projectId: "shared-gcp-project" },
      ],
      rateLimiter,
    });

    const acq1 = await keyPool.acquireKeySlotAsync({ model: "gemini-3.5-flash-lite", isInteractive: true });
    expect(acq1.slot.id).toBe("key-a");

    const acq2 = await keyPool.acquireKeySlotAsync({ model: "gemini-3.5-flash-lite", isInteractive: true });
    expect(acq2.slot.id).toBe("key-b");

    // 3rd request is blocked: project quota (2 RPM) is exhausted across both keys
    await expect(
      keyPool.acquireKeySlotAsync({ model: "gemini-3.5-flash-lite", isInteractive: true }),
    ).rejects.toThrow(DomainError);
  });

  it("Scenario 9: Canonical model is strictly gemini-3.5-flash-lite and rejects invalid GEMINI_MODEL", () => {
    const originalEnv = process.env;
    try {
      process.env = { ...originalEnv, NODE_ENV: "test", GEMINI_API_KEY: "AIzaSy-test-key" };
      delete process.env.GEMINI_MODEL;
      const config1 = loadApiConfig();
      expect(config1.generation.geminiModel).toBe("gemini-3.5-flash-lite");

      process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
      const config2 = loadApiConfig();
      expect(config2.generation.geminiModel).toBe("gemini-3.5-flash-lite");

      process.env.GEMINI_MODEL = "gemini-2.5-flash";
      expect(() => loadApiConfig()).toThrow(/Invalid GEMINI_MODEL/);
    } finally {
      process.env = originalEnv;
    }
  });
});
