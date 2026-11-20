/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { asUserId, type Actor, type UserId } from "@avana/domain";
import { errorHandlerPlugin } from "../http/errorHandler.js";
import {
  DrizzlePollStore,
  DrizzlePollResponseStore,
} from "../modules/studio/poll-stores.js";
import { PollService } from "../modules/studio/poll-service.js";
import { studioPollRoutes } from "../modules/studio/studio-poll-routes.js";
import { publicPollRoutes } from "../modules/studio/public-poll-routes.js";

const TEST_DB_NAME = "avana_poll_e2e_test_pg";
const DB_URL =
  process.env.DATABASE_URL ||
  `postgres://ops@localhost:5432/${TEST_DB_NAME}?sslmode=disable`;

describe("End-to-End Operational Testing: Marketing Studio Polls & Surveys", () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let pollStore: DrizzlePollStore;
  let responseStore: DrizzlePollResponseStore;
  let pollService: PollService;
  let app: FastifyInstance;

  const runId = crypto.randomUUID().slice(0, 8);
  const createdPollIds: string[] = [];

  const platformAdmin: Actor = {
    userId: asUserId("00000000-0000-4000-8000-000000000001"),
    email: `platform-admin-${runId}@avana.test`,
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const usersMap: Record<string, Actor> = {
    "token-platform-admin": platformAdmin,
  };

  beforeAll(async () => {
    // 1. Strict Database Guard: Ensure we NEVER touch the main or production database!
    const parsedUrl = new URL(DB_URL);
    const databaseName = parsedUrl.pathname.replace(/^\//, "");
    if (databaseName !== TEST_DB_NAME) {
      throw new Error(
        `CRITICAL GUARD FAILED: Expected test database ${TEST_DB_NAME}, but connected to "${databaseName}". Execution aborted immediately!`,
      );
    }

    pool = new pg.Pool({ connectionString: DB_URL });
    db = drizzle(pool);

    // Verify DB connectivity
    const checkRes = await pool.query("SELECT current_database(), current_user");
    expect(checkRes.rows[0].current_database).toBe(TEST_DB_NAME);

    // Insert isolated test admin user in test db so foreign key references succeed
    await pool.query(
      `INSERT INTO users (id, email, name, global_role, teacher_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'none', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [platformAdmin.userId, platformAdmin.email, "Test Admin", platformAdmin.globalRole],
    );

    // 2. Initialize Real Drizzle Stores with PostgreSQL
    pollStore = new DrizzlePollStore(db as any);
    responseStore = new DrizzlePollResponseStore(db as any);
    pollService = new PollService({
      pollStore,
      responseStore,
      hmacSecret: "e2e_poll_salt_secret_key_2026",
    });

    // 3. Initialize Real Fastify Server
    app = fastify({ trustProxy: true });
    await app.register(fastifyCookie);
    await app.register(errorHandlerPlugin);

    const mockSessionService = {
      validateSessionDetails: async (token: string) => {
        const actor = usersMap[token];
        if (!actor) return { valid: false, revoked: false, user: null };
        return {
          valid: true,
          revoked: false,
          user: {
            id: actor.userId,
            userId: actor.userId,
            role: actor.role,
            globalRole: actor.globalRole ?? null,
            memberships: [],
          },
        };
      },
      getConfig: () => ({
        cookieName: "avana_session",
        secure: false,
        sameSite: "lax" as const,
        maxAgeMs: 86400000,
        path: "/",
      }),
    } as any;

    const mockUserStore = {
      findById: async (id: UserId) => {
        for (const u of Object.values(usersMap)) {
          if (u.userId === id) {
            return {
              id: u.userId,
              email: u.email,
              role: u.role,
              globalRole: u.globalRole ?? null,
            };
          }
        }
        return null;
      },
    } as any;

    await app.register(studioPollRoutes, {
      pollService,
      sessionService: mockSessionService,
      userStore: mockUserStore,
    });

    await app.register(publicPollRoutes, {
      pollService,
      allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
    });

    await app.ready();
  });

  afterAll(async () => {
    // Isolated Cleanup: Delete ONLY created polls and test user in finally block
    try {
      if (createdPollIds.length > 0) {
        for (const pollId of createdPollIds) {
          // ON DELETE CASCADE cascades to poll_questions, poll_options, poll_responses, poll_answers, poll_answer_options
          await pool.query("DELETE FROM polls WHERE id = $1", [pollId]);
        }
      }
      await pool.query("DELETE FROM users WHERE id = $1", [platformAdmin.userId]);
    } catch (cleanupErr) {
      console.error("Cleanup error in afterAll:", cleanupErr);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  // ===========================================================================
  // Part 1: Main Poll Lifecycle & 10-Participant Operational Test
  // ===========================================================================
  describe("Main Survey Operational Lifecycle (10 Independent Participants)", () => {
    let mainPollId: string;
    let mainPollSlug: string;

    let q1Id: string; // Single choice: Part of AVANA
    let q1Options: Record<string, string>; // label -> optionId

    let q2Id: string; // Multiple choice: Useful features
    let q2Options: Record<string, string>; // label -> optionId

    let q3Id: string; // Short text: Improvement suggestion
    let q4Id: string; // Rating 1 to 5: Satisfaction
    let q4Options: Record<string, string>; // label -> optionId

    it("1.1 Creates the main survey with 4 questions via Admin API", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: {
          Cookie: "avana_session=token-platform-admin",
        },
        payload: {
          title: "بررسی تجربه کاربران از AVANA",
          description:
            "این نظرسنجی با هدف بررسی تجربه استفاده از آوانا و شناسایی امکانات کاربردی‌تر و زمینه‌های بهبود آن طراحی شده است.",
          slug: `test-avana-exp-${runId}`,
          settings: {
            allowAnonymous: true,
            showResultsAfterVote: true,
            requireAllQuestions: true,
          },
        },
      });

      expect(createRes.statusCode).toBe(201);
      const pollData = JSON.parse(createRes.payload).poll;
      expect(pollData.id).toBeDefined();
      expect(pollData.title).toBe("بررسی تجربه کاربران از AVANA");
      expect(pollData.status).toBe("draft");

      mainPollId = pollData.id;
      mainPollSlug = pollData.slug;
      createdPollIds.push(mainPollId);

      // Question 1: Single choice (بخش پرکاربرد)
      const q1Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${mainPollId}/questions`,
        headers: { Cookie: "avana_session=token-platform-admin" },
        payload: {
          questionText: "بیشتر از کدام بخش آوانا استفاده می‌کنید؟",
          questionType: "single_choice",
          isRequired: true,
          sortOrder: 1,
          options: [
            { optionText: "درسنامه‌ها", sortOrder: 1 },
            { optionText: "فلش‌کارت‌ها", sortOrder: 2 },
            { optionText: "آزمون‌ها", sortOrder: 3 },
            { optionText: "خلاصه‌های مرور", sortOrder: 4 },
            { optionText: "نقشه ذهنی", sortOrder: 5 },
          ],
        },
      });
      expect(q1Res.statusCode).toBe(201);
      const q1Data = JSON.parse(q1Res.payload).question;
      q1Id = q1Data.id;
      q1Options = Object.fromEntries(
        q1Data.options.map((o: any) => [o.optionText, o.id]),
      );
      expect(Object.keys(q1Options).length).toBe(5);

      // Question 2: Multiple choice (امکانات کاربردی‌تر)
      const q2Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${mainPollId}/questions`,
        headers: { Cookie: "avana_session=token-platform-admin" },
        payload: {
          questionText: "کدام امکانات آوانا برای شما کاربردی‌تر هستند؟",
          questionType: "multiple_choice",
          isRequired: true,
          sortOrder: 2,
          options: [
            { optionText: "تولید محتوای آموزشی با هوش مصنوعی", sortOrder: 1 },
            { optionText: "فلش‌کارت و مرور هوشمند", sortOrder: 2 },
            { optionText: "آزمون و ارزیابی", sortOrder: 3 },
            { optionText: "خلاصه‌سازی مطالب", sortOrder: 4 },
            { optionText: "نقشه ذهنی", sortOrder: 5 },
            { optionText: "دستیار هوشمند آموزشی", sortOrder: 6 },
          ],
        },
      });
      expect(q2Res.statusCode).toBe(201);
      const q2Data = JSON.parse(q2Res.payload).question;
      q2Id = q2Data.id;
      q2Options = Object.fromEntries(
        q2Data.options.map((o: any) => [o.optionText, o.id]),
      );
      expect(Object.keys(q2Options).length).toBe(6);

      // Question 3: Short text (پیشنهاد بهبود)
      const q3Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${mainPollId}/questions`,
        headers: { Cookie: "avana_session=token-platform-admin" },
        payload: {
          questionText: "به نظر شما چه قابلیتی می‌تواند تجربه یادگیری در آوانا را بهتر کند؟",
          questionType: "short_text",
          isRequired: true,
          sortOrder: 3,
        },
      });
      expect(q3Res.statusCode).toBe(201);
      const q3Data = JSON.parse(q3Res.payload).question;
      q3Id = q3Data.id;

      // Question 4: Single choice scale 1 to 5 (میزان رضایت کلی)
      const q4Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${mainPollId}/questions`,
        headers: { Cookie: "avana_session=token-platform-admin" },
        payload: {
          questionText: "رضایت کلی شما از تجربه استفاده از آوانا چقدر است؟",
          questionType: "single_choice",
          isRequired: true,
          sortOrder: 4,
          options: [
            { optionText: "۱ - خیلی ضعیف", sortOrder: 1 },
            { optionText: "۲ - ضعیف", sortOrder: 2 },
            { optionText: "۳ - متوسط", sortOrder: 3 },
            { optionText: "۴ - خوب", sortOrder: 4 },
            { optionText: "۵ - عالی", sortOrder: 5 },
          ],
        },
      });
      expect(q4Res.statusCode).toBe(201);
      const q4Data = JSON.parse(q4Res.payload).question;
      q4Id = q4Data.id;
      q4Options = Object.fromEntries(
        q4Data.options.map((o: any) => [o.optionText, o.id]),
      );
      expect(Object.keys(q4Options).length).toBe(5);
    });

    it("1.2 Publishes the survey and verifies public accessibility without admin auth", async () => {
      // Publish
      const pubRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${mainPollId}/publish`,
        headers: { Cookie: "avana_session=token-platform-admin" },
      });
      expect(pubRes.statusCode).toBe(200);
      expect(JSON.parse(pubRes.payload).poll.status).toBe("published");

      // Verify public retrieval without any authentication
      const publicRes = await app.inject({
        method: "GET",
        url: `/v1/public/polls/${mainPollSlug}`,
      });
      expect(publicRes.statusCode).toBe(200);
      const pubData = JSON.parse(publicRes.payload).poll;
      expect(pubData.slug).toBe(mainPollSlug);
      expect(pubData.status).toBe("published");
      expect(pubData.questions.length).toBe(4);
      // Stripped admin properties
      expect((pubData as any).createdBy).toBeUndefined();
      expect((pubData as any).organizationId).toBeUndefined();
    });

    it("1.3 Submits 10 independent participant responses with exact statistical distributions", async () => {
      // Matrix of 10 users strictly adhering to approved distributions:
      // Q1: درسنامه‌ها: 3, فلش‌کارت‌ها: 2, آزمون‌ها: 2, خلاصه‌های مرور: 1, نقشه ذهنی: 2 (Sum = 10)
      // Q2: AI Content: 4, Flashcards: 3, Exams: 3, Summaries: 3, Mind Map: 4, AI Assistant: 3 (Sum = 20)
      // Q3: 10 distinct text answers
      // Q4: 5: 3, 4: 3, 3: 2, 2: 1, 1: 1 (Mean = 3.6)
      const testParticipants = [
        {
          name: "TEST_USER_01",
          pid: `pid_user_01_secure_token_${runId}`,
          q1: "درسنامه‌ها",
          q2: ["تولید محتوای آموزشی با هوش مصنوعی", "خلاصه‌سازی مطالب"],
          q3: "افزودن کوئیزهای تعاملی وسط درسنامه‌ها و ویدیوها",
          q4: "۵ - عالی",
        },
        {
          name: "TEST_USER_02",
          pid: `pid_user_02_secure_token_${runId}`,
          q1: "فلش‌کارت‌ها",
          q2: ["فلش‌کارت و مرور هوشمند", "دستیار هوشمند آموزشی"],
          q3: "الگوریتم تکرار فاصله‌دار پیشرفته‌تر برای لغات تخصصی",
          q4: "۴ - خوب",
        },
        {
          name: "TEST_USER_03",
          pid: `pid_user_03_secure_token_${runId}`,
          q1: "آزمون‌ها",
          q2: ["آزمون و ارزیابی", "نقشه ذهنی"],
          q3: "شبیه‌سازی دقیق آزمون‌های جامع با کارنامه تحلیلی تراز",
          q4: "۳ - متوسط",
        },
        {
          name: "TEST_USER_04",
          pid: `pid_user_04_secure_token_${runId}`,
          q1: "خلاصه‌های مرور",
          q2: ["خلاصه‌سازی مطالب", "تولید محتوای آموزشی با هوش مصنوعی"],
          q3: "امکان تبدیل مستقیم بخش‌های هایلایت‌شده خلاصه به فلش‌کارت",
          q4: "۵ - عالی",
        },
        {
          name: "TEST_USER_05",
          pid: `pid_user_05_secure_token_${runId}`,
          q1: "نقشه ذهنی",
          q2: ["نقشه ذهنی", "دستیار هوشمند آموزشی"],
          q3: "قابلیت خروجی برداری SVG با کیفیت بسیار بالا",
          q4: "۴ - خوب",
        },
        {
          name: "TEST_USER_06",
          pid: `pid_user_06_secure_token_${runId}`,
          q1: "درسنامه‌ها",
          q2: ["تولید محتوای آموزشی با هوش مصنوعی", "آزمون و ارزیابی"],
          q3: "بهبود سرعت رندر فرمول‌های ریاضی و نمودارهای علمی در موبایل",
          q4: "۲ - ضعیف",
        },
        {
          name: "TEST_USER_07",
          pid: `pid_user_07_secure_token_${runId}`,
          q1: "فلش‌کارت‌ها",
          q2: ["فلش‌کارت و مرور هوشمند", "نقشه ذهنی"],
          q3: "تلفظ صوتی هوشمند و خودکار برای کارت‌های آموزشی زبان",
          q4: "۴ - خوب",
        },
        {
          name: "TEST_USER_08",
          pid: `pid_user_08_secure_token_${runId}`,
          q1: "آزمون‌ها",
          q2: ["آزمون و ارزیابی", "خلاصه‌سازی مطالب"],
          q3: "دسته‌بندی موضوعی تست‌های دارای پاسخ غلط پس از اتمام آزمون",
          q4: "۵ - عالی",
        },
        {
          name: "TEST_USER_09",
          pid: `pid_user_09_secure_token_${runId}`,
          q1: "نقشه ذهنی",
          q2: ["نقشه ذهنی", "فلش‌کارت و مرور هوشمند"],
          q3: "امکان ترسیم دستی و کشیدن نودهای اختصاصی دلخواه",
          q4: "۳ - متوسط",
        },
        {
          name: "TEST_USER_10",
          pid: `pid_user_10_secure_token_${runId}`,
          q1: "درسنامه‌ها",
          q2: ["دستیار هوشمند آموزشی", "تولید محتوای آموزشی با هوش مصنوعی"],
          q3: "افزایش سهمیه روزانه گفتگو با دستیار هوشمند رفع اشکال",
          q4: "۱ - خیلی ضعیف",
        },
      ];

      for (let i = 0; i < testParticipants.length; i++) {
        const p = testParticipants[i];
        const answersPayload: Record<string, any> = {
          [q1Id]: q1Options[p.q1],
          [q2Id]: p.q2.map((optLabel) => q2Options[optLabel]),
          [q3Id]: p.q3,
          [q4Id]: q4Options[p.q4],
        };

        const voteRes = await app.inject({
          method: "POST",
          url: `/v1/public/polls/${mainPollSlug}/vote`,
          headers: {
            Cookie: `avana_poll_pid=${p.pid}`,
          },
          payload: {
            answers: answersPayload,
          },
        });

        expect(voteRes.statusCode).toBe(201);
        const voteBody = JSON.parse(voteRes.payload);
        expect(voteBody.success).toBe(true);
        expect(voteBody.responseId).toBeDefined();
      }
    });

    it("1.4 Verifies admin results, KPI counts, and statistical calculations", async () => {
      const resultsRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${mainPollId}/results`,
        headers: { Cookie: "avana_session=token-platform-admin" },
      });

      expect(resultsRes.statusCode).toBe(200);
      const { results } = JSON.parse(resultsRes.payload);

      // KPI Check
      expect(results.totalResponses).toBe(10);
      expect(results.questions.length).toBe(4);
      expect(results.isAdmin).toBe(true);

      // Question 1 Verification (Single Choice)
      const resQ1 = results.questions.find((q: any) => q.questionId === q1Id);
      expect(resQ1).toBeDefined();
      expect(resQ1.totalAnswers).toBe(10);
      const q1Map = Object.fromEntries(
        resQ1.options.map((o: any) => [o.optionText, o.voteCount]),
      );
      expect(q1Map["درسنامه‌ها"]).toBe(3);
      expect(q1Map["فلش‌کارت‌ها"]).toBe(2);
      expect(q1Map["آزمون‌ها"]).toBe(2);
      expect(q1Map["خلاصه‌های مرور"]).toBe(1);
      expect(q1Map["نقشه ذهنی"]).toBe(2);

      // Percentages Check (30%, 20%, 20%, 10%, 20%)
      const q1PctMap = Object.fromEntries(
        resQ1.options.map((o: any) => [o.optionText, o.percentage]),
      );
      expect(q1PctMap["درسنامه‌ها"]).toBe(30);
      expect(q1PctMap["فلش‌کارت‌ها"]).toBe(20);
      expect(q1PctMap["آزمون‌ها"]).toBe(20);
      expect(q1PctMap["خلاصه‌های مرور"]).toBe(10);
      expect(q1PctMap["نقشه ذهنی"]).toBe(20);

      // Question 2 Verification (Multiple Choice)
      const resQ2 = results.questions.find((q: any) => q.questionId === q2Id);
      expect(resQ2).toBeDefined();
      expect(resQ2.totalAnswers).toBe(10);
      const q2Map = Object.fromEntries(
        resQ2.options.map((o: any) => [o.optionText, o.voteCount]),
      );
      expect(q2Map["تولید محتوای آموزشی با هوش مصنوعی"]).toBe(4);
      expect(q2Map["فلش‌کارت و مرور هوشمند"]).toBe(3);
      expect(q2Map["آزمون و ارزیابی"]).toBe(3);
      expect(q2Map["خلاصه‌سازی مطالب"]).toBe(3);
      expect(q2Map["نقشه ذهنی"]).toBe(4);
      expect(q2Map["دستیار هوشمند آموزشی"]).toBe(3);

      const totalQ2Selections = Object.values(q2Map).reduce(
        (a: any, b: any) => a + b,
        0,
      );
      expect(totalQ2Selections).toBe(20);

      // Question 3 Verification (Short Text)
      const resQ3 = results.questions.find((q: any) => q.questionId === q3Id);
      expect(resQ3).toBeDefined();
      expect(resQ3.totalAnswers).toBe(10);
      expect(resQ3.textAnswers.length).toBe(10);
      expect(resQ3.textAnswers).toContain("افزودن کوئیزهای تعاملی وسط درسنامه‌ها و ویدیوها");
      expect(resQ3.textAnswers).toContain("افزایش سهمیه روزانه گفتگو با دستیار هوشمند رفع اشکال");

      // Question 4 Verification (Rating Scale 1 to 5)
      const resQ4 = results.questions.find((q: any) => q.questionId === q4Id);
      expect(resQ4).toBeDefined();
      expect(resQ4.totalAnswers).toBe(10);
      const q4Map = Object.fromEntries(
        resQ4.options.map((o: any) => [o.optionText, o.voteCount]),
      );
      expect(q4Map["۵ - عالی"]).toBe(3);
      expect(q4Map["۴ - خوب"]).toBe(3);
      expect(q4Map["۳ - متوسط"]).toBe(2);
      expect(q4Map["۲ - ضعیف"]).toBe(1);
      expect(q4Map["۱ - خیلی ضعیف"]).toBe(1);

      // Mean Satisfaction Calculation: (5*3 + 4*3 + 3*2 + 2*1 + 1*1) / 10 = (15+12+6+2+1)/10 = 36/10 = 3.6
      const weightedSum =
        q4Map["۵ - عالی"] * 5 +
        q4Map["۴ - خوب"] * 4 +
        q4Map["۳ - متوسط"] * 3 +
        q4Map["۲ - ضعیف"] * 2 +
        q4Map["۱ - خیلی ضعیف"] * 1;
      const averageSatisfaction = weightedSum / 10;
      expect(averageSatisfaction).toBe(3.6);
    });

    it("1.5 Validates CSV Export against database responses with UTF-8 BOM", async () => {
      const exportRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${mainPollId}/export`,
        headers: { Cookie: "avana_session=token-platform-admin" },
      });

      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers["content-type"]).toContain("text/csv");
      expect(exportRes.headers["content-disposition"]).toContain(
        `attachment; filename="poll_${mainPollSlug}_results.csv"`,
      );

      const rawCsv = exportRes.payload;
      // UTF-8 BOM Check (\uFEFF)
      expect(rawCsv.charCodeAt(0)).toBe(0xfeff);

      // Check header info
      expect(rawCsv).toContain("بررسی تجربه کاربران از AVANA");
      expect(rawCsv).toContain(mainPollSlug);
      expect(rawCsv).toContain("10"); // totalResponses

      // Check Questions in CSV
      expect(rawCsv).toContain("سؤال 1: بیشتر از کدام بخش آوانا استفاده می‌کنید؟");
      expect(rawCsv).toContain("سؤال 2: کدام امکانات آوانا برای شما کاربردی‌تر هستند؟");
      expect(rawCsv).toContain("سؤال 3: به نظر شما چه قابلیتی می‌تواند تجربه یادگیری در آوانا را بهتر کند؟");
      expect(rawCsv).toContain("سؤال 4: رضایت کلی شما از تجربه استفاده از آوانا چقدر است؟");

      // Verify text answers are in CSV
      expect(rawCsv).toContain("افزودن کوئیزهای تعاملی وسط درسنامه‌ها و ویدیوها");
      expect(rawCsv).toContain("قابلیت خروجی برداری SVG با کیفیت بسیار بالا");
    });
  });

  // ===========================================================================
  // Part 2: Isolated Security & Duplicate Vote Tests (Secondary Poll)
  // ===========================================================================
  describe("Security Hardening & Duplicate Vote Prevention (Secondary Poll)", () => {
    let secPollId: string;
    let secPollSlug: string;
    let secQ1Id: string;
    let secQ1OptId: string;
    let secQ2TextId: string;

    beforeAll(async () => {
      // Create secondary isolated poll strictly for security tests
      const secRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { Cookie: "avana_session=token-platform-admin" },
        payload: {
          title: "Secondary Security Test Poll",
          slug: `test-sec-poll-${runId}`,
          settings: { allowAnonymous: true, requireAllQuestions: false },
        },
      });
      expect(secRes.statusCode).toBe(201);
      const pollData = JSON.parse(secRes.payload).poll;
      secPollId = pollData.id;
      secPollSlug = pollData.slug;
      createdPollIds.push(secPollId);

      // Add choice question
      const q1Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${secPollId}/questions`,
        headers: { Cookie: "avana_session=token-platform-admin" },
        payload: {
          questionText: "Security Choice Question",
          questionType: "single_choice",
          isRequired: false,
          options: [{ optionText: "Safe Option A" }, { optionText: "Safe Option B" }],
        },
      });
      const q1Data = JSON.parse(q1Res.payload).question;
      secQ1Id = q1Data.id;
      secQ1OptId = q1Data.options[0].id;

      // Add text question for formula injection testing
      const q2Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${secPollId}/questions`,
        headers: { Cookie: "avana_session=token-platform-admin" },
        payload: {
          questionText: "Security Text Feedback",
          questionType: "short_text",
          isRequired: false,
        },
      });
      secQ2TextId = JSON.parse(q2Res.payload).question.id;

      // Publish secondary poll
      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${secPollId}/publish`,
        headers: { Cookie: "avana_session=token-platform-admin" },
      });
    });

    it("2.1 Duplicate Vote: Rejects second vote with the SAME cookie token with 409 Conflict", async () => {
      const pid = `repeat_voter_cookie_token_1_${runId}`;

      // First vote: Success
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${secPollSlug}/vote`,
        headers: { Cookie: `avana_poll_pid=${pid}` },
        payload: { answers: { [secQ1Id]: secQ1OptId } },
      });
      expect(res1.statusCode).toBe(201);

      // Second vote with same cookie: Must return 409 Conflict
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${secPollSlug}/vote`,
        headers: { Cookie: `avana_poll_pid=${pid}` },
        payload: { answers: { [secQ1Id]: secQ1OptId } },
      });
      expect(res2.statusCode).toBe(409);
      const errBody = JSON.parse(res2.payload);
      expect(errBody.error.code).toBe("conflict");
      expect(errBody.error.message).toContain("قبلاً در این نظرسنجی شرکت کرده‌اید");
    });

    it("2.2 Duplicate Vote: Direct Participant ID collision triggers DB unique constraint handling", async () => {
      // Direct service call testing the database unique violation branch
      const rawPid = `direct_participant_hash_${runId}`;
      const hashedPid = pollService.hashParticipantId(rawPid);

      // Pre-existing response inserted directly to simulate race condition bypass
      await responseStore.createResponseWithAnswers(
        {
          pollId: secPollId,
          participantId: hashedPid,
        },
        [],
      );

      // Submit via pollService: Must detect either pre-check or handle uq_poll_responses_poll_participant with 409 DomainError
      await expect(
        pollService.submitResponse(secPollSlug, { answers: {} }, rawPid),
      ).rejects.toThrow(/قبلاً در این نظرسنجی شرکت کرده‌اید/);
    });

    it("2.3 Duplicate Vote: Retrying with a NEW distinct cookie succeeds as a new participant", async () => {
      const newPid = `brand_new_fresh_participant_${runId}`;
      const res = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${secPollSlug}/vote`,
        headers: { Cookie: `avana_poll_pid=${newPid}` },
        payload: { answers: { [secQ1Id]: secQ1OptId } },
      });
      expect(res.statusCode).toBe(201);
    });

    it("2.4 Two Independent Participants can vote without interfering with each other", async () => {
      const voterA = `independent_voter_alpha_${runId}`;
      const voterB = `independent_voter_beta_${runId}`;

      const resA = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${secPollSlug}/vote`,
        headers: { Cookie: `avana_poll_pid=${voterA}` },
        payload: { answers: { [secQ1Id]: secQ1OptId } },
      });
      expect(resA.statusCode).toBe(201);

      const resB = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${secPollSlug}/vote`,
        headers: { Cookie: `avana_poll_pid=${voterB}` },
        payload: { answers: { [secQ1Id]: secQ1OptId } },
      });
      expect(resB.statusCode).toBe(201);
    });

    it("2.5 CSV Security: Defends against Formula Injection (CWE-1236) without altering raw DB text", async () => {
      const injectionVoter = `formula_injection_tester_${runId}`;
      const maliciousPayload = "=cmd|' /C calc'!A0";

      // 1. Submit formula injection answer via public vote route
      const voteRes = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${secPollSlug}/vote`,
        headers: { Cookie: `avana_poll_pid=${injectionVoter}` },
        payload: {
          answers: {
            [secQ2TextId]: maliciousPayload,
          },
        },
      });
      expect(voteRes.statusCode).toBe(201);

      // 2. Verify raw text in Database is strictly UNTOUCHED (integrity preserved)
      const rawDbRes = await pool.query(
        "SELECT text_answer FROM poll_answers WHERE question_id = $1 AND text_answer LIKE '%calc%'",
        [secQ2TextId],
      );
      expect(rawDbRes.rows.length).toBe(1);
      expect(rawDbRes.rows[0].text_answer).toBe(maliciousPayload);

      // 3. Export CSV and verify formula character is neutralized with single quote prefix
      const exportRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${secPollId}/export`,
        headers: { Cookie: "avana_session=token-platform-admin" },
      });
      expect(exportRes.statusCode).toBe(200);
      const csv = exportRes.payload;

      // In CSV, cell starting with '=' must be escaped with single quote: "'=cmd|' /C calc'!A0"
      expect(csv).toContain("\"'=cmd|' /C calc'!A0\"");
      // Must NOT contain unescaped executable formula "=cmd|"
      expect(csv).not.toMatch(/"=cmd/);
    });
  });
});
