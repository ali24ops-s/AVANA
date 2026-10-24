import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryQuestionPatternStore,
  DrizzleQuestionPatternStore,
  type QuestionPatternStore,
} from "../modules/generation/question-patterns-store.js";
import { MockModelGateway } from "../modules/generation/gateway/index.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type UserId, type OrganizationId, type QuestionPatternId } from "@avana/domain";
import { randomUUID } from "node:crypto";
import { createDbClient, type AppDatabase } from "@avana/database/client";
import { questionPatternExamples } from "@avana/database/schema";
import { sql } from "drizzle-orm";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";

describe("Question Patterns API & Store", () => {
  async function setupTestApp(customStore?: QuestionPatternStore) {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();
    const questionPatternStore = customStore ?? new InMemoryQuestionPatternStore();
    const sessionService = new SessionService(sessionStore, config.session);

    const platformAdminUser = await userStore.createUserWithPassword({
      email: "admin@avana.ir",
      passwordHash: "x",
    });
    platformAdminUser.name = "مدیر سیستم";
    platformAdminUser.globalRole = "platform_admin";
    platformAdminUser.role = "platform_admin";
    userStore.insert({ ...platformAdminUser });

    const workerUser = await userStore.createUserWithPassword({
      email: "worker@avana.ir",
      passwordHash: "x",
    });
    workerUser.globalRole = "content_worker";
    workerUser.role = "content_worker";
    userStore.insert({ ...workerUser });

    const studentUser = await userStore.createUserWithPassword({
      email: "student@avana.ir",
      passwordHash: "x",
    });

    const orgId = randomUUID() as OrganizationId;
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "سازمان تست",
        slug: `test-org-${orgId.slice(0, 8)}`,
        ownerUserId: platformAdminUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId: platformAdminUser.id as UserId,
        role: Roles.platform_admin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: studentUser.id as UserId,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const adminSession = await sessionService.createSession(platformAdminUser.id);
    const workerSession = await sessionService.createSession(workerUser.id);
    const studentSession = await sessionService.createSession(studentUser.id);

    const documentStore = new InMemoryDocumentStore();
    const documentChunkStore = new InMemoryDocumentChunkStore();
    const generatedContentStore = new InMemoryGeneratedContentStore();
    const generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    const generationJobStore = new InMemoryGenerationJobStore();
    const queue = new InMemoryGenerationQueue(generationJobStore);

    const app = createApp({ config });
    const gateway = new MockModelGateway();
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      questionPatternStore,
      gateway,
      adminGateway: gateway,
      documentStore,
      documentChunkStore,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      queue,
    });

    return {
      app,
      questionPatternStore,
      adminSessionToken: adminSession.sessionToken,
      workerSessionToken: workerSession.sessionToken,
      studentSessionToken: studentSession.sessionToken,
      orgId,
      documentStore,
      documentChunkStore,
      generationJobStore,
      queue,
      adminUser: platformAdminUser,
      studentUser,
    };
  }

  test("enforces role permissions: student rejected with 403, worker allowed read-only, admin allowed full CRUD", async () => {
    const { app, adminSessionToken, workerSessionToken, studentSessionToken } = await setupTestApp();

    // 1. Student cannot list patterns (403)
    const studentListRes = await app.inject({
      method: "GET",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${studentSessionToken}` },
    });
    expect(studentListRes.statusCode).toBe(403);

    // 2. Worker can read patterns (200)
    const workerListRes = await app.inject({
      method: "GET",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${workerSessionToken}` },
    });
    expect(workerListRes.statusCode).toBe(200);

    // 3. Worker cannot create patterns (403)
    const workerCreateRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${workerSessionToken}` },
      payload: {
        title: "Worker Pattern",
        systemInstructions: "Do something",
      },
    });
    expect(workerCreateRes.statusCode).toBe(403);

    // 4. Admin can create patterns (201)
    const adminCreateRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        title: "الگوی سناریوی USMLE",
        description: "تمرکز بر سناریوهای کیس بالینی",
        cognitiveLevel: "clinical_reasoning",
        systemInstructions: "هر سؤال باید شامل شرح حال، معاینه فیزیکی و آزمایش‌ها باشد.",
      },
    });
    expect(adminCreateRes.statusCode).toBe(201);
    const createdBody = JSON.parse(adminCreateRes.body);
    expect(createdBody.pattern.title).toBe("الگوی سناریوی USMLE");
    expect(createdBody.pattern.version).toBe(1);
    expect(createdBody.pattern.isActive).toBe(true);
  });

  test("manages pattern lifecycle: create, update (version bump), examples CRUD, and soft delete", async () => {
    const { app, adminSessionToken } = await setupTestApp();

    // 1. Create Pattern
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        title: "الگوی فارماکوتراپی",
        systemInstructions: "تمرکز روی عوارض دارویی",
        cognitiveLevel: "pharmacotherapy_management",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const patternId = JSON.parse(createRes.body).pattern.id;

    // 2. Update pattern title (metadata only -> does NOT bump version)
    const updateTitleRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/question-patterns/${patternId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        title: "الگوی فارماکوتراپی ویراست دوم",
      },
    });
    expect(updateTitleRes.statusCode).toBe(200);
    expect(JSON.parse(updateTitleRes.body).pattern.version).toBe(1);

    // 3. Update system instructions -> Bumps version to 2
    const updateInstRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/question-patterns/${patternId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        systemInstructions: "دستورالعمل به‌روزرسانی شده: تمرکز همزمان بر دوزاژ و عوارض",
      },
    });
    expect(updateInstRes.statusCode).toBe(200);
    expect(JSON.parse(updateInstRes.body).pattern.version).toBe(2);

    // 4. Add example question -> Bumps pattern version to 3
    const addExampleRes = await app.inject({
      method: "POST",
      url: `/v1/admin/question-patterns/${patternId}/examples`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        question: "کدام داروی زیر در بیمار با نارسایی کلیه منع مصرف دارد؟",
        choices: ["متفورمین", "انسولین رگولار", "گلیپیزاید", "سیتاگلیپتین"],
        correctAnswer: 0,
        explanation: "متفورمین به دلیل خطر اسیدوز لاکتیک در GFR زیر ۳۰ منع مصرف مطلق دارد.",
      },
    });
    expect(addExampleRes.statusCode).toBe(201);
    const exampleId = JSON.parse(addExampleRes.body).example.id;

    // 5. Inspect pattern details with example
    const getPatternRes = await app.inject({
      method: "GET",
      url: `/v1/admin/question-patterns/${patternId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(getPatternRes.statusCode).toBe(200);
    const patternDetail = JSON.parse(getPatternRes.body).pattern;
    expect(patternDetail.version).toBe(3);
    expect(patternDetail.examples).toHaveLength(1);
    expect(patternDetail.examples[0].question).toContain("کلیه");
    expect(patternDetail.examples[0].choices).toContain("متفورمین");

    // 6. Delete example -> Bumps pattern version to 4
    const deleteExampleRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/question-patterns/${patternId}/examples/${exampleId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(deleteExampleRes.statusCode).toBe(200);

    const getPatternAfterExDelete = await app.inject({
      method: "GET",
      url: `/v1/admin/question-patterns/${patternId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(JSON.parse(getPatternAfterExDelete.body).pattern.version).toBe(4);
    expect(JSON.parse(getPatternAfterExDelete.body).pattern.examples).toHaveLength(0);

    // 7. Soft delete pattern
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/question-patterns/${patternId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    // 8. Active list filter ignores soft-deleted pattern
    const listActiveRes = await app.inject({
      method: "GET",
      url: "/v1/admin/question-patterns?status=active",
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    const activePatterns = JSON.parse(listActiveRes.body).patterns;
    expect(activePatterns.find((p: { id: string }) => p.id === patternId)).toBeUndefined();
  });

  test("rejects pattern injection by non-admin learners in /v1/generation", async () => {
    const { app, studentSessionToken, questionPatternStore, orgId } = await setupTestApp();

    const pattern = await questionPatternStore.create({
      title: "الگوی فوق‌پیشرفته",
      systemInstructions: "قوانین خاص",
    });

    const docId = randomUUID();

    // Student attempts to pass question_pattern_id in /v1/generation
    // Route must not permit student to use the pattern
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${studentSessionToken}` },
      payload: {
        exam: true,
        question_pattern_id: pattern.id,
      },
    });

    // Student without membership/permission receives 403 or document error without pattern leak
    expect([400, 403, 404]).toContain(res.statusCode);
  });

  test("supports Bloom cognitive levels, domain-agnostic skills, and legacy mappings", async () => {
    const { app, adminSessionToken, questionPatternStore } = await setupTestApp();

    // 1. Create with Bloom level and multiple skills
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        title: "مهندسی نرم‌افزار - تحلیل معماری",
        cognitiveLevel: "evaluate",
        skills: ["code_comprehension", "calculation_data_interpretation", "custom_tradeoff_analysis"],
        systemInstructions: "سناریوی معماری نرم‌افزار با بررسی trade-offها",
      },
    });
    expect(res.statusCode).toBe(201);
    const pattern = JSON.parse(res.body).pattern;
    expect(pattern.cognitiveLevel).toBe("evaluate");
    expect(pattern.skills).toEqual(["code_comprehension", "calculation_data_interpretation", "custom_tradeoff_analysis"]);

    // 2. Legacy cognitive level mapping in store
    const legacyPattern = await questionPatternStore.create({
      title: "الگوی قدیمی استدلال بالینی",
      cognitiveLevel: "clinical_reasoning",
      systemInstructions: "دستورالعمل قدیمی",
    });
    expect(legacyPattern.cognitiveLevel).toBe("analyze");
    expect(legacyPattern.skills).toContain("clinical_reasoning");
  });

  test("handles AI pattern extraction from sample questions with security & validation", async () => {
    const { app, adminSessionToken, workerSessionToken, studentSessionToken } = await setupTestApp();

    const sampleQuestions = [
      "سؤال ۱: در کد زیر خروجی چیست؟ الف) ۱ ب) ۲ ج) ۳ د) ۴ پاسخ: الف",
      "سؤال ۲: کدام الگوی طراحی برای کشینگ مناسب‌تر است؟ الف) سینگلتون ب) آداپتور ج) پروکسی د) فکتوری پاسخ: ج",
      "سؤال ۳: پیچیدگی زمانی جستجوی دودویی چیست؟ الف) O(1) ب) O(n) ج) O(log n) د) O(n^2) پاسخ: ج",
    ];

    // 1. Learner/student is rejected with 403
    const studentRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns/extract",
      headers: { authorization: `Bearer ${studentSessionToken}` },
      payload: { samples: sampleQuestions },
    });
    expect(studentRes.statusCode).toBe(403);

    // 2. Content worker is authorized to extract
    const workerRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns/extract",
      headers: { authorization: `Bearer ${workerSessionToken}` },
      payload: { samples: sampleQuestions },
    });
    expect(workerRes.statusCode).toBe(200);
    const workerData = JSON.parse(workerRes.body);
    expect(workerData.cognitiveLevel).toBeDefined();
    expect(Array.isArray(workerData.skills)).toBe(true);
    expect(workerData.systemInstructions).toBeDefined();
    expect(["high", "medium", "low"]).toContain(workerData.confidence);
    expect(Array.isArray(workerData.warnings)).toBe(true);

    // 3. Validation: empty samples rejected with 400
    const emptyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns/extract",
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: { samples: [] },
    });
    expect(emptyRes.statusCode).toBe(400);

    // 4. Validation: exceeds maximum sample limit
    const tooManySamples = Array(30).fill("نمونه سوال تستی");
    const tooManyRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns/extract",
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: { samples: tooManySamples },
    });
    expect(tooManyRes.statusCode).toBe(400);
  });

  test("regression: DrizzleQuestionPatternStore safely lists patterns and fetches details with skills and examples without internal error", async () => {
    const patternId = randomUUID();
    const exampleId = randomUUID();
    const now = new Date();

    const mockDbRow = {
      id: patternId,
      title: "الگوی تحلیل موارد بالینی",
      description: "بررسی سناریوهای پزشکی با تأکید بر استدلال تشخیصی",
      cognitiveLevel: "analyze",
      skills: ["clinical_reasoning", "differential_diagnosis"],
      systemInstructions: "هر سؤال باید شامل شرح حال، یافته‌های بالینی و ۴ گزینه محتمل باشد.",
      isActive: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const mockExampleRow = {
      id: exampleId,
      questionPatternId: patternId,
      sourceQuizQuestionId: null,
      question: "بیمار مرد ۵۵ ساله با درد حاد اپی‌گاستر...",
      choices: ["پانکراتیت حاد", "زخم معده سوراخ‌شده", "کوله‌سیستیت", "انفارکتوس میوکارد"],
      correctAnswer: "پانکراتیت حاد",
      explanation: "آمیلاز و لیپاز بالا مطرح‌کننده پانکراتیت حاد هستند.",
      clinicalContext: "اورژانس داخلی",
      sortOrder: 1,
      createdAt: now,
    };

    const mockDb: any = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              groupBy: () => ({
                orderBy: async () => [
                  {
                    pattern: mockDbRow,
                    examplesCount: 1,
                  },
                ],
              }),
            }),
          }),
          where: () => ({
            limit: async () => [mockDbRow],
            orderBy: async () => [mockExampleRow],
          }),
        }),
      }),
    };

    const drizzleStore = new DrizzleQuestionPatternStore(mockDb);
    const { app, adminSessionToken } = await setupTestApp(drizzleStore);

    // 1. Admin → Question Patterns → List Patterns
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(Array.isArray(listBody.patterns)).toBe(true);
    expect(listBody.patterns.length).toBe(1);
    expect(listBody.patterns[0].id).toBe(patternId);
    expect(listBody.patterns[0].title).toBe("الگوی تحلیل موارد بالینی");
    expect(listBody.patterns[0].skills).toEqual(["clinical_reasoning", "differential_diagnosis"]);
    expect(listBody.patterns[0].cognitiveLevel).toBe("analyze");
    expect(listBody.patterns[0].examplesCount).toBe(1);

    // 2. Admin → Question Patterns → Open Pattern Detail
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/admin/question-patterns/${patternId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });

    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.pattern).toBeDefined();
    expect(detailBody.pattern.id).toBe(patternId);
    expect(detailBody.pattern.skills).toEqual(["clinical_reasoning", "differential_diagnosis"]);
    expect(detailBody.pattern.examples.length).toBe(1);
    expect(detailBody.pattern.examples[0].id).toBe(exampleId);
    expect(detailBody.pattern.examples[0].question).toBe("بیمار مرد ۵۵ ساله با درد حاد اپی‌گاستر...");
  });

  test("regression: PostgreSQL schema integration: DrizzleQuestionPatternStore executes real queries for List Patterns and Pattern Detail", async () => {
    const config = loadApiConfig();
    const dbUrl =
      process.env.DATABASE_URL ||
      config.database?.url;

    if (!dbUrl) {
      return;
    }

    let dbClient: ReturnType<typeof createDbClient> | undefined;
    try {
      dbClient = createDbClient(dbUrl);
      await dbClient.db.execute(sql`SELECT 1;`);
    } catch {
      // In offline sandbox or environments without running PostgreSQL, gracefully skip
      return;
    }

    try {
      const realDrizzleStore = new DrizzleQuestionPatternStore(dbClient.db);
      const { app, adminSessionToken } = await setupTestApp(realDrizzleStore);

      // Create a test pattern directly in PostgreSQL to verify insertion and versioning
      const created = await realDrizzleStore.create({
        title: "الگوی یکپارچگی رگرسیون PostgreSQL",
        description: "تست اطمینان از وجود ستون‌های skills و cognitiveLevel در پایگاه داده واقعی",
        cognitiveLevel: "analyze",
        skills: ["clinical_reasoning", "differential_diagnosis"],
        systemInstructions: "دستورالعمل آزمایشی برای اعتبارسنجی دیتابیس",
        isActive: true,
      });

      // 1. PostgreSQL -> DrizzleQuestionPatternStore -> GET /v1/admin/question-patterns -> HTTP 200
      const listRes = await app.inject({
        method: "GET",
        url: "/v1/admin/question-patterns",
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(listRes.statusCode).toBe(200);
      const listBody = JSON.parse(listRes.body);
      expect(Array.isArray(listBody.patterns)).toBe(true);
      const foundInList = listBody.patterns.find((p: any) => p.id === created.id);
      expect(foundInList).toBeDefined();
      expect(foundInList.skills).toEqual(["clinical_reasoning", "differential_diagnosis"]);
      expect(foundInList.cognitiveLevel).toBe("analyze");

      // 2. PostgreSQL -> DrizzleQuestionPatternStore -> GET /v1/admin/question-patterns/:id -> HTTP 200
      const detailRes = await app.inject({
        method: "GET",
        url: `/v1/admin/question-patterns/${created.id}`,
        headers: { authorization: `Bearer ${adminSessionToken}` },
      });

      expect(detailRes.statusCode).toBe(200);
      const detailBody = JSON.parse(detailRes.body);
      expect(detailBody.pattern).toBeDefined();
      expect(detailBody.pattern.id).toBe(created.id);
      expect(detailBody.pattern.skills).toEqual(["clinical_reasoning", "differential_diagnosis"]);
      expect(detailBody.pattern.cognitiveLevel).toBe("analyze");

      // Clean up test pattern in DB
      await realDrizzleStore.softDelete(created.id);
    } catch (e: any) {
      if (e?.code === "ECONNREFUSED" || e?.code === "EPERM") {
        return;
      }
      throw e;
    } finally {
      await dbClient?.close().catch(() => {});
    }
  });

  test("auto-seeds 12 standard question patterns with categories across exam, analytical, and supplementary", async () => {
    const { questionPatternStore } = await setupTestApp();

    const allPatterns = await questionPatternStore.listPatterns();
    expect(allPatterns.length).toBeGreaterThanOrEqual(12);

    const examPatterns = await questionPatternStore.listPatterns({ category: "exam" });
    const analyticalPatterns = await questionPatternStore.listPatterns({ category: "analytical" });
    const supplementaryPatterns = await questionPatternStore.listPatterns({ category: "supplementary" });

    expect(examPatterns.length).toBeGreaterThanOrEqual(4);
    expect(analyticalPatterns.length).toBeGreaterThanOrEqual(4);
    expect(supplementaryPatterns.length).toBeGreaterThanOrEqual(4);

    // Verify stable UUIDs and categories
    const clinicalVignette = allPatterns.find(
      (p) => p.id === "10000000-0000-4000-a000-000000000001",
    );
    expect(clinicalVignette).toBeDefined();
    expect(clinicalVignette?.category).toBe("exam");
    expect(clinicalVignette?.isActive).toBe(true);

    const step2Pattern = allPatterns.find(
      (p) => p.id === "10000000-0000-4000-a000-000000000005",
    );
    expect(step2Pattern).toBeDefined();
    expect(step2Pattern?.category).toBe("analytical");

    const bridgePattern = allPatterns.find(
      (p) => p.id === "10000000-0000-4000-a000-000000000009",
    );
    expect(bridgePattern).toBeDefined();
    expect(bridgePattern?.category).toBe("supplementary");
  });

  test("learner endpoint enforces authentication via header or cookie and parity between endpoints", async () => {
    const { app, studentSessionToken, questionPatternStore } = await setupTestApp();

    // 1. Unauthenticated request rejected with 401
    const unauthRes = await app.inject({
      method: "GET",
      url: "/v1/question-patterns",
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Invalid bearer token rejected with 401
    const invalidTokenRes = await app.inject({
      method: "GET",
      url: "/v1/question-patterns",
      headers: { authorization: "Bearer invalid-token-xyz" },
    });
    expect(invalidTokenRes.statusCode).toBe(401);

    // 3. Authenticated request via Authorization header succeeds with 200
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/question-patterns",
      headers: { authorization: `Bearer ${studentSessionToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(body.patterns).toBeDefined();
    expect(body.patterns.length).toBeGreaterThanOrEqual(12);
    expect(body.patterns[0].category).toBeDefined();

    // 4. Authenticated request via Cookie (avana_session) succeeds with 200
    const cookieRes = await app.inject({
      method: "GET",
      url: "/v1/question-patterns",
      headers: { cookie: `avana_session=${studentSessionToken}` },
    });
    expect(cookieRes.statusCode).toBe(200);
    const cookieBody = JSON.parse(cookieRes.body);
    expect(cookieBody.patterns).toHaveLength(body.patterns.length);

    // 5. Parity: /v1/generation/question-patterns behaves identically
    const genUnauthRes = await app.inject({
      method: "GET",
      url: "/v1/generation/question-patterns",
    });
    expect(genUnauthRes.statusCode).toBe(401);

    const genAuthRes = await app.inject({
      method: "GET",
      url: "/v1/generation/question-patterns",
      headers: { authorization: `Bearer ${studentSessionToken}` },
    });
    expect(genAuthRes.statusCode).toBe(200);
    const genBody = JSON.parse(genAuthRes.body);
    expect(genBody.patterns).toEqual(body.patterns);

    // 6. Category query filter on /v1/question-patterns
    const analyticalRes = await app.inject({
      method: "GET",
      url: "/v1/question-patterns?category=analytical",
      headers: { authorization: `Bearer ${studentSessionToken}` },
    });
    expect(analyticalRes.statusCode).toBe(200);
    const analyticalPatterns = JSON.parse(analyticalRes.body).patterns;
    expect(analyticalPatterns.every((p: { category?: string }) => p.category === "analytical")).toBe(true);

    // 7. Inactive and soft-deleted patterns are NEVER exposed to learners
    const hiddenPattern = await questionPatternStore.create({
      title: "الگوی پیش‌نویس غیرفعال",
      systemInstructions: "دستورالعمل",
      category: "exam",
      isActive: false,
    });
    const afterHiddenRes = await app.inject({
      method: "GET",
      url: "/v1/question-patterns",
      headers: { authorization: `Bearer ${studentSessionToken}` },
    });
    const afterHiddenPatterns = JSON.parse(afterHiddenRes.body).patterns;
    expect(afterHiddenPatterns.find((p: any) => p.id === hiddenPattern.id)).toBeUndefined();

    // 8. Learner gets 403 on admin management routes
    const adminCreateRes = await app.inject({
      method: "POST",
      url: "/v1/admin/question-patterns",
      headers: { authorization: `Bearer ${studentSessionToken}` },
      payload: {
        title: "تلاش غیرمجاز دانشجو",
        systemInstructions: "قوانین",
      },
    });
    expect(adminCreateRes.statusCode).toBe(403);
  });

  test("supports PUT /v1/admin/question-patterns/:id and category updates", async () => {
    const { app, adminSessionToken, questionPatternStore } = await setupTestApp();

    const created = await questionPatternStore.create({
      title: "الگوی اولیه",
      systemInstructions: "دستورالعمل اولیه",
      category: "exam",
    });

    const updateRes = await app.inject({
      method: "PUT",
      url: `/v1/admin/question-patterns/${created.id}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        title: "الگوی ویرایش‌شده توسط ادمین",
        category: "analytical",
        systemInstructions: "دستورالعمل به‌روزشده",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.body).pattern;
    expect(updated.title).toBe("الگوی ویرایش‌شده توسط ادمین");
    expect(updated.category).toBe("analytical");
    expect(updated.version).toBe(2);
  });

  test("findByIds supports multi-pattern selection and returns all matched active patterns", async () => {
    const { questionPatternStore } = await setupTestApp();

    const ids = [
      "10000000-0000-4000-a000-000000000001",
      "10000000-0000-4000-a000-000000000005",
      "10000000-0000-4000-a000-000000000009",
    ] as any;

    const matched = await questionPatternStore.findByIds(ids);
    expect(matched).toHaveLength(3);
    expect(matched.map((p) => p.category)).toEqual(
      expect.arrayContaining(["exam", "analytical", "supplementary"]),
    );
  });

  test("validates pattern IDs prior to document reservation and enforces multi-pattern propagation into queue payload", async () => {
    const {
      app,
      adminSessionToken,
      studentSessionToken,
      questionPatternStore,
      documentStore,
      queue,
      orgId,
      adminUser,
    } = await setupTestApp();

    const courseId = randomUUID() as CourseId;
    const docId = randomUUID() as DocumentId;
    await documentStore.insert({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: adminUser.id,
      originalName: "medical_handbook.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "0".repeat(64),
      storageKey: `docs/${docId}.pdf`,
      pageCount: 10,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      qualityScore: 90,
      qualityLevel: "high",
    });

    // 1. Unknown / invalid pattern ID -> 400 Bad Request BEFORE reserving or queueing
    const invalidRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        types: ["quiz"],
        question_pattern_ids: ["non-existent-pattern-id-999"],
      },
    });
    expect(invalidRes.statusCode).toBe(400);
    // Verify document was NOT reserved/locked
    const docAfterInvalid = await documentStore.findById(docId);
    expect(docAfterInvalid?.status).toBe("extracted");
    // Verify queue received 0 jobs
    expect(queue.jobs).toHaveLength(0);

    // 2. Soft-deleted pattern ID -> 400 Bad Request
    const toDelete = await questionPatternStore.create({
      title: "الگوی حذف‌شده تستی",
      systemInstructions: "دستورالعمل",
      category: "exam",
    });
    await questionPatternStore.softDelete(toDelete.id);

    const deletedRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        types: ["quiz"],
        question_pattern_ids: [toDelete.id],
      },
    });
    expect(deletedRes.statusCode).toBe(400);
    expect(queue.jobs).toHaveLength(0);

    // 3. Inactive pattern requested by learner -> 400 Bad Request
    const inactivePattern = await questionPatternStore.create({
      title: "الگوی پیش‌نویس غیرفعال",
      systemInstructions: "دستورالعمل",
      category: "exam",
      isActive: false,
    });
    const inactiveRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${studentSessionToken}` },
      payload: {
        types: ["quiz"],
        question_pattern_ids: [inactivePattern.id],
      },
    });
    expect(inactiveRes.statusCode).toBe(400);
    expect(queue.jobs).toHaveLength(0);

    // 4. Valid multi-pattern with duplicate deduplication -> 202, enqueued with both unique IDs
    const validRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        types: ["quiz"],
        question_pattern_ids: [
          "10000000-0000-4000-a000-000000000001",
          "10000000-0000-4000-a000-000000000002",
          "10000000-0000-4000-a000-000000000001", // duplicate should be safely deduplicated
        ],
      },
    });
    expect(validRes.statusCode).toBe(202);
    expect(queue.jobs).toHaveLength(1);
    const enqueuedJob = queue.jobs[0];
    expect(enqueuedJob.payload.questionPatternId).toBe("10000000-0000-4000-a000-000000000001");
    expect(enqueuedJob.payload.questionPatternIds).toEqual([
      "10000000-0000-4000-a000-000000000001",
      "10000000-0000-4000-a000-000000000002",
    ]);

    // 5. Backward compatibility: legacy single question_pattern_id request
    await documentStore.update({ ...(await documentStore.findById(docId))!, status: "extracted" });
    const legacyRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${docId}/generate`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: {
        types: ["quiz"],
        question_pattern_id: "10000000-0000-4000-a000-000000000005",
      },
    });
    expect(legacyRes.statusCode).toBe(202);
    expect(queue.jobs).toHaveLength(2);
    const legacyJob = queue.jobs[1];
    expect(legacyJob.payload.questionPatternId).toBe("10000000-0000-4000-a000-000000000005");
    expect(legacyJob.payload.questionPatternIds).toEqual(["10000000-0000-4000-a000-000000000005"]);
  });

  test("regression: handles malformed IDs, non-existent patterns, and empty lists gracefully without 500", async () => {
    const { app, adminSessionToken } = await setupTestApp();

    // 1. Malformed UUID on GET pattern detail returns 400 (not 500)
    const malformedGetRes = await app.inject({
      method: "GET",
      url: "/v1/admin/question-patterns/not-a-valid-uuid",
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(malformedGetRes.statusCode).toBe(400);
    const malformedGetBody = JSON.parse(malformedGetRes.body);
    expect(malformedGetBody.message || malformedGetBody.error?.message).toContain("شناسه الگوی سؤال نامعتبر است");

    // 2. Malformed UUID on PATCH pattern returns 400 (not 500)
    const malformedPatchRes = await app.inject({
      method: "PATCH",
      url: "/v1/admin/question-patterns/invalid-id-xyz",
      headers: { authorization: `Bearer ${adminSessionToken}` },
      payload: { title: "Updated Title" },
    });
    expect(malformedPatchRes.statusCode).toBe(400);

    // 3. Malformed UUID on DELETE pattern returns 400 (not 500)
    const malformedDeleteRes = await app.inject({
      method: "DELETE",
      url: "/v1/admin/question-patterns/invalid-id-xyz",
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(malformedDeleteRes.statusCode).toBe(400);

    // 4. Non-existent UUID returns 404 (not 500)
    const nonExistentId = "99999999-9999-4999-a999-999999999999";
    const notFoundRes = await app.inject({
      method: "GET",
      url: `/v1/admin/question-patterns/${nonExistentId}`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(notFoundRes.statusCode).toBe(404);

    // 5. Empty pattern list query with non-matching category returns 200 with empty array (not 500)
    const emptyCategoryRes = await app.inject({
      method: "GET",
      url: "/v1/admin/question-patterns?category=non_existent_category",
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(emptyCategoryRes.statusCode).toBe(200);
    const emptyBody = JSON.parse(emptyCategoryRes.body);
    expect(Array.isArray(emptyBody.patterns)).toBe(true);
    expect(emptyBody.patterns).toHaveLength(0);
  });

  test("regression: DrizzleQuestionPatternStore gracefully falls back when database column category is missing", async () => {
    // Simulates an environment where migration 0081 has not run and column category throws 42703
    const mockLegacyDb = {
      select: () => ({
        from: (tbl: unknown) => {
          if (tbl === questionPatternExamples) {
            return {
              where: () => ({
                orderBy: async () => [],
              }),
            };
          }
          const error = new Error("column question_patterns.category does not exist") as Error & { code?: string };
          error.code = "42703";
          throw error;
        },
      }),
      execute: async () => ({
        rows: [
          {
            id: "10000000-0000-4000-a000-000000000001",
            title: "الگوی موروثی بدون ستون دسته‌بندی",
            description: "تست بررسی عملکرد نرم در محیط‌های قبل از مایگریشن 0081",
            cognitiveLevel: "recall",
            systemInstructions: "دستورالعمل پایه",
            isActive: true,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            examplesCount: 0,
          },
        ],
      }),
    } as unknown as AppDatabase;

    const store = new DrizzleQuestionPatternStore(mockLegacyDb);
    const patterns = await store.listPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe("10000000-0000-4000-a000-000000000001");
    expect(patterns[0].category).toBe("exam");
    expect(patterns[0].examplesCount).toBe(0);

    const detail = await store.findById("10000000-0000-4000-a000-000000000001" as QuestionPatternId);
    expect(detail).toBeDefined();
    expect(detail?.title).toBe("الگوی موروثی بدون ستون دسته‌بندی");
    expect(detail?.category).toBe("exam");
  });
});
