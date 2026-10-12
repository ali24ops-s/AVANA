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
import { Roles, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";

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
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: platformAdminUser.id as UserId,
      role: Roles.platform_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const adminSession = await sessionService.createSession(platformAdminUser.id);
    const workerSession = await sessionService.createSession(workerUser.id);
    const studentSession = await sessionService.createSession(studentUser.id);

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
    });

    return {
      app,
      questionPatternStore,
      adminSessionToken: adminSession.sessionToken,
      workerSessionToken: workerSession.sessionToken,
      studentSessionToken: studentSession.sessionToken,
      orgId,
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
      config.database?.url ||
      "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

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
});
