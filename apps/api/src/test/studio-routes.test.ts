import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryMarketingQuizStore,
  InMemoryMarketingQuestionBankStore,
  InMemoryMarketingQuizAttemptStore,
  StudioService,
} from "../modules/studio/index.js";
import { InMemoryStudioExamStore } from "../modules/studio/studio-exam-store.js";
import type {
  StudioExamQueue,
  StudioExamBatchJobPayload,
} from "../modules/studio/studio-exam-queue.js";
import { v1Routes } from "../routes/v1.js";
import type { FastifyInstance } from "fastify";
import { asOrganizationId } from "@avana/domain";
import { generateBoundCsrfToken } from "../modules/identity/csrf.js";
import crypto from "node:crypto";

class MockStudioExamQueue implements StudioExamQueue {
  readonly queueName = "studio_exam_batch_generate";
  public jobs: Array<{
    name: string;
    data: StudioExamBatchJobPayload;
    opts?: { jobId?: string };
  }> = [];

  async add(
    name: string,
    data: StudioExamBatchJobPayload,
    opts?: { jobId?: string },
  ): Promise<void> {
    this.jobs.push({ name, data, opts });
  }

  async getWaitingCount(): Promise<number> {
    return this.jobs.length;
  }

  async close(): Promise<void> {}
}

describe("Studio & Public Quiz HTTP Routes E2E", () => {
  let app: FastifyInstance;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionService: SessionService;
  let quizStore: InMemoryMarketingQuizStore;
  let bankStore: InMemoryMarketingQuestionBankStore;
  let attemptStore: InMemoryMarketingQuizAttemptStore;
  let examStore: InMemoryStudioExamStore;
  let examQueue: MockStudioExamQueue;
  let studioService: StudioService;

  let adminCookie: string;
  let studentCookie: string;
  let studentUserId: string;

  beforeEach(async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    sessionService = new SessionService(sessionStore, config.session);

    quizStore = new InMemoryMarketingQuizStore();
    bankStore = new InMemoryMarketingQuestionBankStore();
    attemptStore = new InMemoryMarketingQuizAttemptStore();
    examStore = new InMemoryStudioExamStore();
    examQueue = new MockStudioExamQueue();
    studioService = new StudioService(
      quizStore,
      bankStore,
      attemptStore,
      undefined,
      orgStore,
      undefined,
      examStore,
      examQueue,
    );

    // Create platform admin
    const adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.ir",
      passwordHash: "hash123",
    });
    adminUser.globalRole = "platform_admin";
    adminUser.role = "platform_admin";
    userStore.insert({ ...adminUser });
    const adminSession = await sessionService.createSession(adminUser.id);
    adminCookie = adminSession.sessionToken;

    // Create student
    const studentUser = await userStore.createUserWithPassword({
      email: "student@avana.ir",
      passwordHash: "hash123",
    });
    studentUser.globalRole = "student";
    studentUser.role = "student";
    studentUserId = studentUser.id;
    userStore.insert({ ...studentUser });
    const studentSession = await sessionService.createSession(studentUser.id);
    studentCookie = studentSession.sessionToken;

    app = createApp({ config });

    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      marketingQuizStore: quizStore,
      marketingQuestionBankStore: bankStore,
      marketingQuizAttemptStore: attemptStore,
      studioService,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("Studio Management Endpoints Security", () => {
    it("returns 401 when accessing /v1/studio/quizzes without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/studio/quizzes",
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 when accessing /v1/studio/quizzes with student role", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/studio/quizzes",
        headers: {
          authorization: `Bearer ${studentCookie}`,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("allows platform_admin to create, view, and update marketing quizzes", async () => {
      // 1. Create quiz
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/quizzes",
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          title: "آزمون آمادگی دستیاری داروسازی",
          description: "بررسی جامع فارماکوتراپی",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const { quiz } = createRes.json();
      expect(quiz.id).toBeDefined();
      expect(quiz.status).toBe("draft");

      // 2. Add question
      const addQRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${quiz.id}/questions/manual`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          question: "مکانیسم اثر وارفارین چیست؟",
          choices: [
            { id: "1", text: "مهار ویتامین K اپوکساید ردوکتاز" },
            { id: "2", text: "مهار مستقیم فاکتور Xa" },
            { id: "3", text: "مهار ترومبین" },
            { id: "4", text: "فعال‌سازی آنتی‌ترومبین III" },
          ],
          correctAnswer: { choiceId: "1" },
          explanation: "وارفارین با مهار این آنزیم مانع فعال‌سازی فاکتورهای II, VII, IX, X می‌شود.",
        },
      });
      expect(addQRes.statusCode).toBe(201);

      // 3. Publish quiz
      const publishRes = await app.inject({
        method: "PATCH",
        url: `/v1/studio/quizzes/${quiz.id}`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { status: "published" },
      });
      expect(publishRes.statusCode).toBe(200);
      expect(publishRes.json().quiz.status).toBe("published");
    });
  });

  describe("Public Quiz Taking & Security", () => {
    it("allows guests to take published quiz without auth and masks correct answers", async () => {
      // Create and publish a quiz as admin
      const quiz = await studioService.createQuiz(
        { userId: "admin-1", email: "a@a.ir", role: "platform_admin", globalRole: "platform_admin" },
        { title: "کوییز عمومی" },
      );
      const q = await studioService.addManualQuestion(
        { userId: "admin-1", email: "a@a.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        {
          question: "سؤال پابلیک",
          choices: [
            { id: "opt1", text: "گزینه ۱" },
            { id: "opt2", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "opt1" },
          explanation: "توضیح کاملاً محرمانه",
        },
      );
      await studioService.updateQuiz(
        { userId: "admin-1", email: "a@a.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        { status: "published" },
      );

      // Guest accesses public quiz endpoint (NO AUTH)
      const publicRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${quiz.slug}`,
      });
      expect(publicRes.statusCode).toBe(200);
      const publicData = publicRes.json().quiz;
      expect(publicData.title).toBe("کوییز عمومی");
      expect(publicData.questions.length).toBe(1);

      // MUST NOT have correctAnswer or explanation
      expect(publicData.questions[0].correctAnswer).toBeUndefined();
      expect(publicData.questions[0].explanation).toBeUndefined();

      // Guest submits attempt (NO AUTH)
      const submitRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${quiz.slug}/attempt`,
        payload: {
          answers: { [q.id]: "opt1" },
        },
      });
      expect(submitRes.statusCode).toBe(201);
      const result = submitRes.json().result;
      expect(result.score).toBe(100);
      expect(result.correctCount).toBe(1);
      expect(result.wrongCount).toBe(0);
      expect(result.attemptToken).toBeDefined();

      // Guest views result via attemptToken
      const getResultRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/attempts/${result.attemptToken}`,
      });
      expect(getResultRes.statusCode).toBe(200);
      expect(getResultRes.json().result.score).toBe(100);
    });

    it("returns 404 when querying an invalid or non-existent attempt token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/public/quizzes/attempts/non-existent-token-xyz-123",
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("not_found");
    });

    it("enforces rate limiting on attempt submissions (429 on excessive requests)", async () => {
      const quiz = await studioService.createQuiz(
        { userId: "admin-1", email: "a@a.ir", role: "platform_admin", globalRole: "platform_admin" },
        { title: "کوییز ریت‌لیمیت" },
      );
      await studioService.updateQuiz(
        { userId: "admin-1", email: "a@a.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        { status: "published" },
      );

      // Submit 10 times rapidly from the same client IP
      for (let i = 0; i < 10; i++) {
        const res = await app.inject({
          method: "POST",
          url: `/v1/public/quizzes/${quiz.slug}/attempt`,
          payload: {
            idempotencyKey: `key-${i}-${Date.now()}`,
            answers: {},
          },
        });
        expect(res.statusCode).toBe(201);
      }

      // 11th request from the same IP must be rate-limited (HTTP 429)
      const blockedRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${quiz.slug}/attempt`,
        payload: {
          idempotencyKey: `key-11-${Date.now()}`,
          answers: {},
        },
      });
      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.json().error.code).toBe("too_many_requests");
    });

    it("supports draft quiz preview for authorized studio actors via GET and POST ?preview=true", async () => {
      // Create a draft quiz
      const draftQuiz = await studioService.createQuiz(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        { title: "کوییز پیش‌نویس استودیو" },
      );
      const q = await studioService.addManualQuestion(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        draftQuiz.id,
        {
          question: "سؤال پیش‌نویس ۱",
          choices: [
            { id: "opt1", text: "الف" },
            { id: "opt2", text: "ب" },
          ],
          correctAnswer: { choiceId: "opt1" },
          explanation: "توضیح کاملاً محرمانه پیش‌نویس",
        },
      );

      // 1. Guest access without preview parameter -> 404 Not Found
      const guestRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${draftQuiz.slug}`,
      });
      expect(guestRes.statusCode).toBe(404);

      // 2. Guest access with preview=true -> 404 Not Found
      const guestPreviewRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${draftQuiz.slug}?preview=true`,
      });
      expect(guestPreviewRes.statusCode).toBe(404);

      // 3. Student access with preview=true -> 403 Forbidden (authenticated but lacks studio role)
      const studentPreviewRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${draftQuiz.slug}?preview=true`,
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(studentPreviewRes.statusCode).toBe(403);

      // 4. Authorized admin access without preview=true -> 404 Not Found
      const adminNoFlagRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${draftQuiz.slug}`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(adminNoFlagRes.statusCode).toBe(404);

      // 5. Authorized admin access WITH preview=true -> 200 OK
      const adminPreviewRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${draftQuiz.slug}?preview=true`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(adminPreviewRes.statusCode).toBe(200);
      const previewData = adminPreviewRes.json().quiz;
      expect(previewData.title).toBe("کوییز پیش‌نویس استودیو");
      expect(previewData.id).toBe(draftQuiz.id);
      expect(previewData.isPreview).toBe(true);
      expect(previewData.canViewAnswerKey).toBe(true);
      expect(previewData.questions[0].correctAnswer).toEqual({ choiceId: "opt1" });
      expect(previewData.questions[0].explanation).toBe("توضیح کاملاً محرمانه پیش‌نویس");

      // 6. Guest attempt on draft quiz with preview=true -> 400 Bad Request
      const guestAttemptRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${draftQuiz.slug}/attempt?preview=true`,
        payload: { answers: { [q.id]: "opt1" } },
      });
      expect(guestAttemptRes.statusCode).toBe(400);

      // 7. Student attempt on draft quiz with preview=true -> 403 Forbidden
      const studentAttemptRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${draftQuiz.slug}/attempt?preview=true`,
        headers: { authorization: `Bearer ${studentCookie}` },
        payload: { answers: { [q.id]: "opt1" } },
      });
      expect(studentAttemptRes.statusCode).toBe(403);

      // 8. Authorized admin attempt on draft quiz with preview=true -> 201 Created
      const adminAttemptRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${draftQuiz.slug}/attempt?preview=true`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { answers: { [q.id]: "opt1" } },
      });
      expect(adminAttemptRes.statusCode).toBe(201);
      const attemptResult = adminAttemptRes.json().result;
      expect(attemptResult.score).toBe(100);
      expect(attemptResult.attemptToken).toMatch(/^preview-/);
      // Ensure internal isDraftPreview flag was stripped from the public API response
      expect(attemptResult.isDraftPreview).toBeUndefined();

      // Verify no records in attempt store
      expect(await attemptStore.countByQuiz(draftQuiz.id)).toBe(0);

      // 9. Authorized creator can perform multiple preview submissions without consuming rate limit
      for (let i = 0; i < 12; i++) {
        const repeatRes = await app.inject({
          method: "POST",
          url: `/v1/public/quizzes/${draftQuiz.slug}/attempt?preview=true`,
          headers: { authorization: `Bearer ${adminCookie}` },
          payload: { answers: { [q.id]: "opt1" } },
        });
        expect(repeatRes.statusCode).toBe(201);
      }
      expect(await attemptStore.countByQuiz(draftQuiz.id)).toBe(0);
    });

    it("enforces rate limits and saves real attempts on published quizzes even when preview=true is supplied", async () => {
      // 1. Create and publish a quiz
      const publishedQuiz = await studioService.createQuiz(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        { title: "کوییز ریت لیمیت پابلیش شده" },
      );
      const q = await studioService.addManualQuestion(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        publishedQuiz.id,
        {
          question: "سؤال ۱",
          choices: [{ id: "1", text: "الف" }],
          correctAnswer: { choiceId: "1" },
        },
      );
      await studioService.updateQuiz(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        publishedQuiz.id,
        { status: "published" },
      );

      // 2. GET with preview=true on published quiz must NOT return isPreview: true or id
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${publishedQuiz.slug}?preview=true`,
      });
      expect(getRes.statusCode).toBe(200);
      const quizPayload = getRes.json().quiz;
      expect(quizPayload.title).toBe("کوییز ریت لیمیت پابلیش شده");
      expect(quizPayload.isPreview).toBeUndefined();
      expect(quizPayload.id).toBeUndefined();

      // 3. POST with preview=true must save real attempts and increment rate limiter
      for (let i = 0; i < 10; i++) {
        const postRes = await app.inject({
          method: "POST",
          url: `/v1/public/quizzes/${publishedQuiz.slug}/attempt?preview=true`,
          payload: {
            idempotencyKey: `published-preview-key-${i}-${Date.now()}`,
            answers: { [q.id]: "1" },
          },
        });
        expect(postRes.statusCode).toBe(201);
      }
      // 10 real attempts must be stored in attempt store!
      expect(await attemptStore.countByQuiz(publishedQuiz.id)).toBe(10);

      // 4. 11th request with preview=true must be BLOCKED with 429 too_many_requests!
      const blockedRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${publishedQuiz.slug}/attempt?preview=true`,
        payload: {
          idempotencyKey: `published-preview-key-11-${Date.now()}`,
          answers: { [q.id]: "1" },
        },
      });
      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.json().error.code).toBe("too_many_requests");
    });
  });

  describe("Multi-Tenant Isolation HTTP Security", () => {
    it("strictly prevents organization_admin of Org A from accessing or mutating Org B quiz", async () => {
      // 1. Create Organization A and Organization B
      const orgA = {
        id: "org-alpha",
        name: "Organization Alpha",
        slug: "org-alpha",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const orgB = {
        id: "org-beta",
        name: "Organization Beta",
        slug: "org-beta",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const userA = await userStore.createUserWithPassword({
        email: "adminA@alpha.ir",
        passwordHash: "hash123",
      });
      userA.role = "organization_admin";
      userStore.insert({ ...userA });

      const userB = await userStore.createUserWithPassword({
        email: "adminB@beta.ir",
        passwordHash: "hash123",
      });
      userB.role = "organization_admin";
      userStore.insert({ ...userB });

      await orgStore.createWithAdminMembership({
        organization: orgA,
        membership: {
          id: "mem-alpha",
          organizationId: "org-alpha" as any,
          userId: userA.id,
          role: "organization_admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        auditEvents: [],
      });

      await orgStore.createWithAdminMembership({
        organization: orgB,
        membership: {
          id: "mem-beta",
          organizationId: "org-beta" as any,
          userId: userB.id,
          role: "organization_admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        auditEvents: [],
      });

      const sessionA = await sessionService.createSession(userA.id);
      const sessionB = await sessionService.createSession(userB.id);

      // 2. Org B creates a quiz
      const quizBRes = await app.inject({
        method: "POST",
        url: "/v1/studio/quizzes",
        headers: { authorization: `Bearer ${sessionB.sessionToken}` },
        payload: {
          title: "آزمون محرمانه سازمان بتا",
          organizationId: "org-beta",
        },
      });
      expect(quizBRes.statusCode).toBe(201);
      const quizBId = quizBRes.json().quiz.id;

      // 3. Admin A tries to GET Org B's quiz directly -> 403 Forbidden
      const getRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${quizBId}`,
        headers: { authorization: `Bearer ${sessionA.sessionToken}` },
      });
      expect(getRes.statusCode).toBe(403);

      // 4. Admin A tries to PATCH Org B's quiz -> 403 Forbidden
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/studio/quizzes/${quizBId}`,
        headers: { authorization: `Bearer ${sessionA.sessionToken}` },
        payload: { title: "تلاش هک عنوان" },
      });
      expect(patchRes.statusCode).toBe(403);

      // 5. Admin A tries to DELETE Org B's quiz -> 403 Forbidden
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/v1/studio/quizzes/${quizBId}`,
        headers: { authorization: `Bearer ${sessionA.sessionToken}` },
      });
      expect(deleteRes.statusCode).toBe(403);

      // 6. Admin A lists quizzes without specifying organizationId -> must NOT see Org B's quiz
      const listRes = await app.inject({
        method: "GET",
        url: "/v1/studio/quizzes",
        headers: { authorization: `Bearer ${sessionA.sessionToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const quizzesList = listRes.json().quizzes;
      expect(quizzesList.some((q: any) => q.id === quizBId)).toBe(false);
    });
  });

  describe("Question Bank & Batch Add HTTP Routes", () => {
    it("allows platform_admin to query sources, search questions, and batch add questions to a quiz", async () => {
      // 1. Query sources
      const sourcesRes = await app.inject({
        method: "GET",
        url: "/v1/studio/question-bank/sources",
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(sourcesRes.statusCode).toBe(200);
      expect(sourcesRes.json().questionTypes).toBeDefined();

      // 2. Add question to bank
      const addBankRes = await app.inject({
        method: "POST",
        url: "/v1/studio/question-bank",
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          question: "سؤال تستی روت بانک",
          choices: [
            { id: "1", text: "گزینه ۱" },
            { id: "2", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "1" },
          difficulty: "easy",
          topic: "آزمون روت",
        },
      });
      expect(addBankRes.statusCode).toBe(201);
      const bankItem = addBankRes.json().item;

      // 3. Search questions
      const searchRes = await app.inject({
        method: "GET",
        url: "/v1/studio/question-bank/search?search=تستی",
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(searchRes.statusCode).toBe(200);
      expect(searchRes.json().questions.length).toBeGreaterThanOrEqual(1);

      // 4. Create a quiz
      const createQuizRes = await app.inject({
        method: "POST",
        url: "/v1/studio/quizzes",
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { title: "آزمون تست بچ روت" },
      });
      const quizId = createQuizRes.json().quiz.id;

      // 5. Batch add questions to quiz
      const batchRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${quizId}/questions/batch`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          items: [
            {
              sourceType: "bank",
              sourceId: bankItem.id,
            },
            {
              sourceType: "manual",
              question: "سؤال دستی دوم",
              choices: [
                { id: "1", text: "الف" },
                { id: "2", text: "ب" },
              ],
              correctAnswer: { choiceId: "2" },
            },
          ],
        },
      });
      expect(batchRes.statusCode).toBe(201);
      expect(batchRes.json().addedCount).toBe(2);
      expect(batchRes.json().questions.length).toBe(2);
    });

    it("E2E Integration Flow: Question Bank Import -> Snapshot -> Publish -> Take Exam -> Server Scoring", async () => {
      // 1. Seed Question Bank with option text answer
      const createBankRes = await app.inject({
        method: "POST",
        url: "/v1/studio/question-bank",
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          question: "آنتی‌بیوتیک انتخابی در مننژیت باکتریال چیست؟",
          choices: [
            { id: "opt-1", text: "ونکومایسین" },
            { id: "opt-2", text: "سفتریاکسون" },
            { id: "opt-3", text: "جنتامایسین" },
          ],
          correctAnswer: "سفتریاکسون", // Text-based answer
          explanation: "سفتریاکسون به خوبی از سد خونی-مغزی عبور می‌کند.",
          difficulty: "hard",
          topic: "عفونی",
        },
      });
      expect(createBankRes.statusCode).toBe(201);
      const bankQ = createBankRes.json().item;

      // 2. Creator creates a draft quiz
      const createQuizRes = await app.inject({
        method: "POST",
        url: "/v1/studio/quizzes",
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          title: "آزمون جامع فارماکولوژی مننژیت",
          slug: `meningitis-pharma-${Date.now()}`,
        },
      });
      expect(createQuizRes.statusCode).toBe(201);
      const quiz = createQuizRes.json().quiz;

      // 3. Batch import question from Question Bank
      const batchRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${quiz.id}/questions/batch`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          items: [
            {
              sourceType: "bank",
              sourceId: bankQ.id,
              question: bankQ.question,
              choices: bankQ.choices,
              correctAnswer: bankQ.correctAnswer,
              explanation: bankQ.explanation,
            },
          ],
        },
      });
      expect(batchRes.statusCode).toBe(201);
      const importedQuestion = batchRes.json().questions[0];

      // Verify the text answer "سفتریاکسون" resolved to choice ID "opt-2"
      expect(importedQuestion.correctAnswer).toEqual({ choiceId: "opt-2" });

      // 4. Publish the quiz
      const publishRes = await app.inject({
        method: "PATCH",
        url: `/v1/studio/quizzes/${quiz.id}`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { status: "published" },
      });
      expect(publishRes.statusCode).toBe(200);

      // 5. Public Participant fetches quiz (answers MUST be masked)
      const publicRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/${quiz.slug}`,
      });
      expect(publicRes.statusCode).toBe(200);
      const publicQuiz = publicRes.json().quiz;
      expect(publicQuiz.questions[0].correctAnswer).toBeUndefined();
      expect(publicQuiz.questions[0].explanation).toBeUndefined();

      // 6. Public Participant submits correct answer
      const attemptRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${quiz.slug}/attempt`,
        payload: {
          idempotencyKey: `student-attempt-${Date.now()}`,
          answers: {
            [importedQuestion.id]: "opt-2",
          },
        },
      });
      expect(attemptRes.statusCode).toBe(201);
      const attemptResult = attemptRes.json().result;
      expect(attemptResult.score).toBe(100);
      expect(attemptResult.correctCount).toBe(1);
      expect(attemptResult.wrongCount).toBe(0);
      expect(attemptResult.attemptToken).toBeDefined();

      // 7. Verify result query via token
      const tokenRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}`,
      });
      expect(tokenRes.statusCode).toBe(200);
      expect(tokenRes.json().result.score).toBe(100);
    });
  });

  describe("Marketing Quiz Conversion Funnel: Claim & Solutions Security", () => {
    it("enforces strict privacy, claim ownership, and full solutions unlocking for authenticated user", async () => {
      // 1. Create a published quiz with 2 questions, one correct and one wrong
      const quiz = await studioService.createQuiz(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        { title: "کوییز آزمایشی فارماکولوژی" },
      );
      const q1 = await studioService.addManualQuestion(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        {
          question: "داروی انتخابی در آنافیلاکسی چیست؟",
          choices: [
            { id: "c1", text: "اپی‌نفرین" },
            { id: "c2", text: "آنتی‌هیستامین" },
          ],
          correctAnswer: { choiceId: "c1" },
          explanation: "اپی‌نفرین آگونیست آلفا و بتا بوده و درمان اولیه شوک آنافیلاکسی است.",
        },
      );
      const q2 = await studioService.addManualQuestion(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        {
          question: "کدام دارو مهارکننده پمپ پروتون است؟",
          choices: [
            { id: "c3", text: "رانیتیدین" },
            { id: "c4", text: "امپرازول" },
          ],
          correctAnswer: { choiceId: "c4" },
          explanation: "امپرازول ترشح اسید معده را از طریق مهار H+/K+ ATPase کاهش می‌دهد.",
        },
      );
      await studioService.updateQuiz(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        { status: "published" },
      );

      // 2. Guest takes the quiz (Answer q1 correctly, q2 incorrectly)
      const submitRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/${quiz.slug}/attempt`,
        payload: {
          answers: {
            [q1.id]: "c1",
            [q2.id]: "c3",
          },
        },
      });
      expect(submitRes.statusCode).toBe(201);
      const attemptResult = submitRes.json().result;
      expect(attemptResult.score).toBe(50);
      expect(attemptResult.correctCount).toBe(1);
      expect(attemptResult.wrongCount).toBe(1);
      expect(attemptResult.totalQuestions).toBe(2);
      expect(attemptResult.attemptToken).toBeDefined();

      // Verify questionReviews in guest result: NO correctAnswer and NO explanation leaked!
      expect(attemptResult.questionReviews).toBeDefined();
      expect(attemptResult.questionReviews.length).toBe(2);
      for (const rev of attemptResult.questionReviews) {
        expect(rev.correctAnswer).toBeUndefined();
        expect(rev.explanation).toBeUndefined();
        expect(rev.userAnswer).toBeDefined();
        expect(typeof rev.isCorrect).toBe("boolean");
      }

      // Guest accesses public attempt endpoint (GET /v1/public/quizzes/attempts/:token)
      const guestGetRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}`,
      });
      expect(guestGetRes.statusCode).toBe(200);
      const guestResult = guestGetRes.json().result;
      expect(guestResult.score).toBe(50);
      for (const rev of guestResult.questionReviews) {
        expect(rev.correctAnswer).toBeUndefined();
        expect(rev.explanation).toBeUndefined();
      }

      // 3. Guest tries to access solutions without authentication -> 401
      const unauthSolutionsRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}/solutions`,
      });
      expect(unauthSolutionsRes.statusCode).toBe(401);

      // 4. Guest tries to claim attempt without authentication -> 401
      const unauthClaimRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}/claim`,
      });
      expect(unauthClaimRes.statusCode).toBe(401);

      // 5. User A (student) claims the attempt
      const claimRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}/claim`,
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(claimRes.statusCode).toBe(200);
      expect(claimRes.json()).toEqual({
        success: true,
        attemptToken: attemptResult.attemptToken,
        userId: studentUserId,
        alreadyClaimed: false,
      });

      // 6. User A claims again (Idempotency)
      const reClaimRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}/claim`,
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(reClaimRes.statusCode).toBe(200);
      expect(reClaimRes.json()).toEqual({
        success: true,
        attemptToken: attemptResult.attemptToken,
        userId: studentUserId,
        alreadyClaimed: true,
      });

      // 7. User A accesses solutions -> 200 with full answers and explanations
      const solutionsRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}/solutions`,
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(solutionsRes.statusCode).toBe(200);
      const solutions = solutionsRes.json().solutions;
      expect(solutions.attemptToken).toBe(attemptResult.attemptToken);
      expect(solutions.score).toBe(50);
      expect(solutions.questions.length).toBe(2);

      const solQ1 = solutions.questions.find((q: { id: string }) => q.id === q1.id);
      expect(solQ1).toBeDefined();
      expect(solQ1.userAnswer).toBe("c1");
      expect(solQ1.isCorrect).toBe(true);
      expect(solQ1.correctAnswer).toEqual({ choiceId: "c1" });
      expect(solQ1.explanation).toContain("اپی‌نفرین");

      const solQ2 = solutions.questions.find((q: { id: string }) => q.id === q2.id);
      expect(solQ2).toBeDefined();
      expect(solQ2.userAnswer).toBe("c3");
      expect(solQ2.isCorrect).toBe(false);
      expect(solQ2.correctAnswer).toEqual({ choiceId: "c4" });
      expect(solQ2.explanation).toContain("امپرازول");

      // 8. User B (another registered user) attempts to claim or view User A's attempt -> 403 Forbidden
      const otherUser = await userStore.createUserWithPassword({
        email: "other@avana.ir",
        passwordHash: "hash456",
      });
      otherUser.globalRole = "student";
      otherUser.role = "student";
      userStore.insert({ ...otherUser });
      const otherSession = await sessionService.createSession(otherUser.id);
      const otherCookie = otherSession.sessionToken;

      const userBClaimRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}/claim`,
        headers: { authorization: `Bearer ${otherCookie}` },
      });
      expect(userBClaimRes.statusCode).toBe(403);
      expect(userBClaimRes.json().error.code).toBe("forbidden");

      const userBSolutionsRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/attempts/${attemptResult.attemptToken}/solutions`,
        headers: { authorization: `Bearer ${otherCookie}` },
      });
      expect(userBSolutionsRes.statusCode).toBe(403);
      expect(userBSolutionsRes.json().error.code).toBe("forbidden");
    });

    it("handles legacy attempts without questionSnapshots gracefully without leaking data", async () => {
      // 1. Create a quiz with 1 question
      const quiz = await studioService.createQuiz(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        { title: "کوییز قدیمی بدون اسنپ‌شات" },
      );
      const q = await studioService.addManualQuestion(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        {
          question: "سؤال کوییز قدیمی",
          choices: [
            { id: "opt-1", text: "گزینه ۱" },
            { id: "opt-2", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "opt-1" },
          explanation: "پاسخ تشریحی سؤال کوییز قدیمی",
        },
      );
      await studioService.updateQuiz(
        { userId: "admin-1", email: "admin@avana.ir", role: "platform_admin", globalRole: "platform_admin" },
        quiz.id,
        { status: "published" },
      );

      // 2. Simulate a legacy attempt record where questionSnapshots was null / undefined
      const legacyAttempt = await attemptStore.create({
        marketingQuizId: quiz.id,
        attemptToken: "legacy-attempt-token-12345",
        userId: null,
        status: "completed",
        score: 100,
        correctCount: 1,
        wrongCount: 0,
        totalQuestions: 1,
        answers: { [q.id]: "opt-1" },
        questionSnapshots: null as unknown as [],
      });

      // 3. User claims the legacy attempt
      const claimRes = await app.inject({
        method: "POST",
        url: `/v1/public/quizzes/attempts/${legacyAttempt.attemptToken}/claim`,
        headers: { authorization: `Bearer ${studentCookie}` },
        payload: { userId: "malicious-spoofed-user-id" }, // Injected userId in payload MUST be ignored!
      });
      expect(claimRes.statusCode).toBe(200);
      expect(claimRes.json().userId).toBe(studentUserId); // Strictly uses session actor.userId

      // 4. User retrieves solutions for the legacy attempt
      const solutionsRes = await app.inject({
        method: "GET",
        url: `/v1/public/quizzes/attempts/${legacyAttempt.attemptToken}/solutions`,
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(solutionsRes.statusCode).toBe(200);
      const solutions = solutionsRes.json().solutions;
      expect(solutions.attemptToken).toBe("legacy-attempt-token-12345");
      expect(solutions.quizTitle).toBe("کوییز قدیمی بدون اسنپ‌شات");
      expect(solutions.questions.length).toBe(1);
      expect(solutions.questions[0].id).toBe(q.id);
      expect(solutions.questions[0].question).toBe("سؤال کوییز قدیمی");
      expect(solutions.questions[0].explanation).toBe("پاسخ تشریحی سؤال کوییز قدیمی");
      expect(solutions.questions[0].userAnswer).toBe("opt-1");
      expect(solutions.questions[0].isCorrect).toBe(true);
    });

    it("returns 404 for non-existent attempt token on claim and solutions endpoints", async () => {
      const claimRes = await app.inject({
        method: "POST",
        url: "/v1/public/quizzes/attempts/non-existent-token-xyz/claim",
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(claimRes.statusCode).toBe(404);
      expect(claimRes.json().error.code).toBe("not_found");

      const solutionsRes = await app.inject({
        method: "GET",
        url: "/v1/public/quizzes/attempts/non-existent-token-xyz/solutions",
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(solutionsRes.statusCode).toBe(404);
      expect(solutionsRes.json().error.code).toBe("not_found");
    });
  });

  describe("Multi-Chapter AI Exam Generation Routes E2E", () => {
    let testQuizId: string;
    const module1 = "00000000-0000-0000-0000-000000000001";
    const module2 = "00000000-0000-0000-0000-000000000002";

    beforeEach(async () => {
      const q = await quizStore.create({
        title: "آزمون چندفصلی فارماکولوژی",
        status: "draft",
        settings: {},
      });
      testQuizId = q.id;
    });

    it("creates an exam generation operation successfully with tasks, batches, and queue jobs", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          totalQuestions: 10,
          moduleIds: [module1, module2],
          difficulty: "hard",
          instructions: "سؤالات بالینی همراه سناریو بیمار",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.operation).toBeDefined();
      expect(data.operation.id).toBeDefined();
      expect(data.operation.totalRequestedQuestions).toBe(10);
      expect(data.operation.status).toBe("pending");
      expect(data.tasks.length).toBe(2);
      expect(data.batches.length).toBe(2);
      expect(examQueue.jobs.length).toBe(2);
      expect(examQueue.jobs[0].data.operationId).toBe(data.operation.id);
    });

    it("rejects invalid input with 400 bad_request", async () => {
      // 1. Missing / invalid totalQuestions
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          totalQuestions: 0,
          moduleIds: [module1],
        },
      });
      expect(res1.statusCode).toBe(400);
      expect(res1.json().error.code).toBe("bad_request");

      // 2. totalQuestions exceeding 100
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          totalQuestions: 101,
          moduleIds: [module1],
        },
      });
      expect(res2.statusCode).toBe(400);
      expect(res2.json().error.code).toBe("bad_request");

      // 3. Empty modules / allocations
      const res3 = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          totalQuestions: 10,
          moduleIds: [],
        },
      });
      expect(res3.statusCode).toBe(400);
      expect(res3.json().error.code).toBe("bad_request");

      // 4. Custom chapter allocations sum mismatch
      const res4 = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          totalQuestions: 10,
          chapterAllocations: [
            { moduleId: module1, quota: 4 },
            { moduleId: module2, quota: 4 }, // sum = 8 != 10
          ],
        },
      });
      expect(res4.statusCode).toBe(400);
      expect(res4.json().error.code).toBe("bad_request");

      // 5. Duplicate moduleIds in custom allocations
      const res5 = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: {
          totalQuestions: 10,
          chapterAllocations: [
            { moduleId: module1, quota: 5 },
            { moduleId: module1, quota: 5 },
          ],
        },
      });
      expect(res5.statusCode).toBe(400);
      expect(res5.json().error.code).toBe("bad_request");
    });

    it("enforces authentication and forbids unauthorized roles (students)", async () => {
      // 1. Unauthenticated -> 401
      const noAuthRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      expect(noAuthRes.statusCode).toBe(401);
      expect(noAuthRes.json().error.code).toBe("unauthorized");

      // 2. Student -> 403
      const studentRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${studentCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      expect(studentRes.statusCode).toBe(403);
      expect(studentRes.json().error.code).toBe("forbidden");
    });

    it("prevents cross-tenant access between organizations and ignores spoofed organizationId", async () => {
      // Setup Org Alpha and Org Beta
      const orgAId = "00000000-0000-0000-0000-00000000000a";
      const orgBId = "00000000-0000-0000-0000-00000000000b";

      const userA = await userStore.createUserWithPassword({
        email: "adminA-exam@alpha.ir",
        passwordHash: "hash123",
      });
      userA.role = "organization_admin";
      userStore.insert({ ...userA });

      const userB = await userStore.createUserWithPassword({
        email: "adminB-exam@beta.ir",
        passwordHash: "hash123",
      });
      userB.role = "organization_admin";
      userStore.insert({ ...userB });

      await orgStore.createWithAdminMembership({
        organization: { id: orgAId, name: "Org Alpha", slug: "org-alpha-exam", createdAt: new Date(), updatedAt: new Date() },
        membership: { id: "mem-a", organizationId: asOrganizationId(orgAId), userId: userA.id, role: "organization_admin", createdAt: new Date(), updatedAt: new Date() },
        auditEvents: [],
      });

      await orgStore.createWithAdminMembership({
        organization: { id: orgBId, name: "Org Beta", slug: "org-beta-exam", createdAt: new Date(), updatedAt: new Date() },
        membership: { id: "mem-b", organizationId: asOrganizationId(orgBId), userId: userB.id, role: "organization_admin", createdAt: new Date(), updatedAt: new Date() },
        auditEvents: [],
      });

      const sessionA = await sessionService.createSession(userA.id);
      const sessionB = await sessionService.createSession(userB.id);

      // Quiz belongs to Org Alpha
      const orgAQuiz = await quizStore.create({
        title: "آزمون سازمان آلفا",
        organizationId: orgAId,
        status: "draft",
        settings: {},
      });

      // 1. User B (Org Beta) tries to create operation on Org Alpha's quiz -> 403 Forbidden
      const crossCreateRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${orgAQuiz.id}/exam-operations`,
        headers: { authorization: `Bearer ${sessionB.sessionToken}` },
        payload: {
          totalQuestions: 10,
          moduleIds: [module1],
          organizationId: orgBId, // Spoofed organizationId must NOT be trusted
        },
      });
      expect(crossCreateRes.statusCode).toBe(403);
      expect(crossCreateRes.json().error.code).toBe("forbidden");

      // 2. User A successfully creates operation for Org Alpha
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${orgAQuiz.id}/exam-operations`,
        headers: { authorization: `Bearer ${sessionA.sessionToken}` },
        payload: {
          totalQuestions: 10,
          moduleIds: [module1],
        },
      });
      expect(createRes.statusCode).toBe(201);
      const opId = createRes.json().operation.id;

      // 3. User B cannot read active operation of Org Alpha's quiz -> 403
      const crossActiveRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${orgAQuiz.id}/exam-operations/active`,
        headers: { authorization: `Bearer ${sessionB.sessionToken}` },
      });
      expect(crossActiveRes.statusCode).toBe(403);

      // 4. User B cannot access operation details, progress, or cancel -> 403
      const crossDetailsRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${opId}`,
        headers: { authorization: `Bearer ${sessionB.sessionToken}` },
      });
      expect(crossDetailsRes.statusCode).toBe(403);

      const crossProgressRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${opId}/progress`,
        headers: { authorization: `Bearer ${sessionB.sessionToken}` },
      });
      expect(crossProgressRes.statusCode).toBe(403);

      const crossCancelRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${opId}/cancel`,
        headers: { authorization: `Bearer ${sessionB.sessionToken}` },
      });
      expect(crossCancelRes.statusCode).toBe(403);
    });

    it("retrieves the active exam generation operation for a quiz", async () => {
      // 1. Initially no active operation -> returns null
      const initialRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations/active`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(initialRes.statusCode).toBe(200);
      expect(initialRes.json().operation).toBeNull();

      // 2. Create operation -> returns active operation
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      expect(createRes.statusCode).toBe(201);
      const opId = createRes.json().operation.id;

      const activeRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations/active`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(activeRes.statusCode).toBe(200);
      expect(activeRes.json().operation).not.toBeNull();
      expect(activeRes.json().operation.id).toBe(opId);
      expect(activeRes.json().operation.status).toBe("pending");

      // 3. Mark operation completed in store -> active operation returns null
      const op = examStore.operations.get(opId)!;
      op.status = "completed";

      const completedActiveRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations/active`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(completedActiveRes.statusCode).toBe(200);
      expect(completedActiveRes.json().operation).toBeNull();
    });

    it("retrieves full operation details and sanitizes sensitive errors", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      const opId = createRes.json().operation.id;

      // Simulate a raw internal error with sensitive token in a batch
      const batch = Array.from(examStore.batches.values()).find((b) => b.taskId === createRes.json().tasks[0].id)!;
      batch.status = "failed";
      batch.errorCode = "gemini_internal_error";
      // eslint-disable-next-line no-secrets/no-secrets
      batch.errorMessage = "Failed request to https://generativelanguage.googleapis.com?key=AIzaSySecret123 with error 500";

      const detailsRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${opId}`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(detailsRes.statusCode).toBe(200);
      const details = detailsRes.json();
      expect(details.operation.id).toBe(opId);
      expect(details.tasks.length).toBeGreaterThan(0);
      expect(details.batches.length).toBeGreaterThan(0);

      // Verify that sensitive token and internal URL were sanitized
      const targetBatch = details.batches.find((b: { id: string }) => b.id === batch.id);
      expect(targetBatch.errorMessage).not.toContain("AIzaSySecret123");
      expect(targetBatch.errorMessage).not.toContain("googleapis.com");
      expect(targetBatch.errorMessage).toBe("خطای غیرمنتظره در ارتباط با سرویس هوش مصنوعی.");
    });

    it("provides a lightweight progress contract for realtime polling", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      const opId = createRes.json().operation.id;

      const progressRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${opId}/progress`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });

      expect(progressRes.statusCode).toBe(200);
      const progress = progressRes.json();
      expect(progress.operationId).toBe(opId);
      expect(progress.quizId).toBe(testQuizId);
      expect(progress.totalRequestedQuestions).toBe(10);
      expect(progress.totalGeneratedQuestions).toBe(0);
      expect(progress.progressPercentage).toBe(0);
      expect(Array.isArray(progress.tasks)).toBe(true);
      expect(progress.tasks[0].targetCount).toBe(10);
      // Ensure lightweight payload without raw batches or snapshots
      expect(progress.batches).toBeUndefined();
      expect(progress.patternSnapshots).toBeUndefined();
    });

    it("retrieves and filters staging generated questions", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      const opId = createRes.json().operation.id;
      const taskId = createRes.json().tasks[0].id;
      const batchId = createRes.json().batches[0].id;

      // Seed staging questions directly into examStore
      const q1Id = "00000000-0000-0000-0000-000000000101";
      const q2Id = "00000000-0000-0000-0000-000000000102";
      examStore.questions.set(q1Id, {
        id: q1Id,
        operationId: opId,
        taskId,
        batchId,
        courseId: "00000000-0000-0000-0000-000000000000",
        moduleId: module1,
        questionIndex: 1,
        question: "سؤال اول فارماکولوژی",
        choices: [
          { id: "1", text: "گزینه ۱" },
          { id: "2", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "1" },
        difficulty: "medium",
        questionType: "multiple_choice",
        isAccepted: true,
        createdAt: new Date(),
      });

      examStore.questions.set(q2Id, {
        id: q2Id,
        operationId: opId,
        taskId,
        batchId,
        courseId: "00000000-0000-0000-0000-000000000000",
        moduleId: module1,
        questionIndex: 2,
        question: "سؤال دوم فارماکولوژی (رد شده)",
        choices: [
          { id: "1", text: "گزینه ۱" },
          { id: "2", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "2" },
        difficulty: "hard",
        questionType: "multiple_choice",
        isAccepted: false,
        createdAt: new Date(),
      });

      // 1. Fetch all questions
      const allRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${opId}/questions`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(allRes.statusCode).toBe(200);
      expect(allRes.json().questions.length).toBe(2);

      // 2. Filter by isAccepted=true
      const acceptedRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${opId}/questions?isAccepted=true`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(acceptedRes.statusCode).toBe(200);
      expect(acceptedRes.json().questions.length).toBe(1);
      expect(acceptedRes.json().questions[0].id).toBe(q1Id);

      // 3. Filter by pagination
      const pageRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${opId}/questions?limit=1&offset=1`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(pageRes.statusCode).toBe(200);
      expect(pageRes.json().questions.length).toBe(1);
      expect(pageRes.json().questions[0].id).toBe(q2Id);
    });

    it("cancels an active operation and prevents cancelling finalized operations", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      const opId = createRes.json().operation.id;

      // 1. Cancel in-flight operation -> 200 OK
      const cancelRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${opId}/cancel`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { reason: "توقف توسط ادمین" },
      });
      expect(cancelRes.statusCode).toBe(200);
      expect(cancelRes.json().cancelled).toBe(true);

      const op = examStore.operations.get(opId)!;
      expect(op.status).toBe("cancelled");

      // 2. Attempting to cancel an already-finalized operation -> 400 Bad Request
      const secondCancelRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${opId}/cancel`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(secondCancelRes.statusCode).toBe(400);
      expect(secondCancelRes.json().error.code).toBe("bad_request");
    });

    it("handles non-existent and malformed operation/quiz IDs with 404", async () => {
      const nonExistentUuid = "00000000-0000-0000-0000-999999999999";
      const malformedId = "not-a-valid-uuid";

      // Non-existent quiz
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${nonExistentUuid}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      expect(res1.statusCode).toBe(404);

      // Malformed quizId
      const res2 = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${malformedId}/exam-operations/active`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(res2.statusCode).toBe(404);

      // Non-existent operation
      const res3 = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${nonExistentUuid}`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(res3.statusCode).toBe(404);

      // Malformed operationId on progress
      const res4 = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${malformedId}/progress`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(res4.statusCode).toBe(404);
    });

    it("re-enqueues pending batches via the internal recovery route", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${testQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${adminCookie}` },
        payload: { totalQuestions: 10, moduleIds: [module1] },
      });
      const opId = createRes.json().operation.id;

      // Clear simulated queue to emulate lost jobs
      examQueue.jobs = [];

      const reenqueueRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${opId}/reenqueue`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(reenqueueRes.statusCode).toBe(200);
      expect(reenqueueRes.json().reenqueuedCount).toBe(1);
      expect(examQueue.jobs.length).toBe(1);

      // Calling on a completed operation -> 400
      examStore.operations.get(opId)!.status = "completed";
      const invalidReenqueueRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${opId}/reenqueue`,
        headers: { authorization: `Bearer ${adminCookie}` },
      });
      expect(invalidReenqueueRes.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2.2.3 — Staging Question Review & Transfer HTTP Routes E2E
  // ---------------------------------------------------------------------------
  describe("Multi-Chapter Exam Staging Review & Transfer Routes (Phase 2.2.3)", () => {
    const orgIdA = asOrganizationId("11111111-1111-4111-a111-111111111111");
    const orgIdB = asOrganizationId("22222222-2222-4222-a222-222222222222");
    const module1 = "33333333-3333-4333-a333-333333333333";

    let orgAdminACookie: string;
    let orgAdminBCookie: string;
    let quizAId: string;

    async function seedQuizAndStagedQuestions(count = 3) {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { totalQuestions: count, moduleIds: [module1] },
      });
      expect(createRes.statusCode).toBe(201);
      const { operation, batches } = createRes.json();

      const claim = await examStore.claimBatch(batches[0].id);
      await examStore.saveBatchQuestionsAndFinalize({
        batchId: batches[0].id,
        fencingToken: claim.fencingToken!,
        questions: Array.from({ length: count }, (_, idx) => ({
          questionIndex: idx + 1,
          question: `سؤال مسیر ${idx + 1}`,
          choices: [
            { id: "a", text: "گزینه ۱" },
            { id: "b", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "a" },
          explanation: "توضیح",
          difficulty: "medium",
        })),
      });

      const listRes = await app.inject({
        method: "GET",
        url: `/v1/studio/exam-operations/${operation.id}/questions`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
      });
      return {
        operationId: operation.id as string,
        questions: listRes.json().questions as Array<{
          id: string;
          reviewStatus: string;
          isAccepted: boolean;
          transferredQuestionId?: string | null;
        }>,
      };
    }

    beforeEach(async () => {
      const userA = await userStore.createUserWithPassword({
        email: "org-a-admin@avana.ir",
        passwordHash: "hash123",
      });
      userA.role = "organization_admin";
      userStore.insert({ ...userA });
      await orgStore.createWithAdminMembership({
        organization: { id: orgIdA, name: "Org A", slug: "org-a", createdAt: new Date(), updatedAt: new Date() },
        membership: { id: "mem-review-a", organizationId: orgIdA, userId: userA.id, role: "organization_admin", createdAt: new Date(), updatedAt: new Date() },
        auditEvents: [],
      });
      orgAdminACookie = (await sessionService.createSession(userA.id)).sessionToken;

      const userB = await userStore.createUserWithPassword({
        email: "org-b-admin@avana.ir",
        passwordHash: "hash123",
      });
      userB.role = "organization_admin";
      userStore.insert({ ...userB });
      await orgStore.createWithAdminMembership({
        organization: { id: orgIdB, name: "Org B", slug: "org-b", createdAt: new Date(), updatedAt: new Date() },
        membership: { id: "mem-review-b", organizationId: orgIdB, userId: userB.id, role: "organization_admin", createdAt: new Date(), updatedAt: new Date() },
        auditEvents: [],
      });
      orgAdminBCookie = (await sessionService.createSession(userB.id)).sessionToken;

      const qRes = await app.inject({
        method: "POST",
        url: "/v1/studio/quizzes",
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { title: "آزمون سازمان A", organizationId: orgIdA },
      });
      expect(qRes.statusCode).toBe(201);
      quizAId = qRes.json().quiz.id;
    });

    it("supports batch accept, reject, and reset to pending_review via /questions/review", async () => {
      const { operationId, questions } = await seedQuizAndStagedQuestions(3);
      const [q1, q2, q3] = questions;

      // Batch accept q1 & q2
      const acceptRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q1.id, q2.id], decision: "accepted" },
      });
      expect(acceptRes.statusCode).toBe(200);
      expect(acceptRes.json().updatedCount).toBe(2);
      expect(acceptRes.json().skippedTransferredIds).toEqual([]);
      expect(acceptRes.json().questions.every((q: { isAccepted: boolean; reviewStatus: string }) => q.isAccepted && q.reviewStatus === "accepted")).toBe(true);

      // Batch reject q2 & q3
      const rejectRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q2.id, q3.id], decision: "rejected" },
      });
      expect(rejectRes.statusCode).toBe(200);
      expect(rejectRes.json().updatedCount).toBe(2);

      // Reset q3 to pending_review
      const resetRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q3.id], decision: "pending_review" },
      });
      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.json().updatedCount).toBe(1);
      expect(resetRes.json().questions[0].reviewStatus).toBe("pending_review");
    });

    it("validates /questions/review inputs (decision, UUIDs, empty array, >100 items, unknown operation, cross-operation)", async () => {
      const { operationId, questions } = await seedQuizAndStagedQuestions(2);

      // Invalid decision
      const badDecision = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [questions[0].id], decision: "transferred" },
      });
      expect(badDecision.statusCode).toBe(400);

      // Invalid UUID
      const badUuid = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: ["not-a-uuid"], decision: "accepted" },
      });
      expect(badUuid.statusCode).toBe(400);

      // Empty array
      const emptyArr = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [], decision: "accepted" },
      });
      expect(emptyArr.statusCode).toBe(400);

      // > 100 questions
      const overLimit = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: {
          questionIds: Array.from({ length: 101 }, () => crypto.randomUUID()),
          decision: "accepted",
        },
      });
      expect(overLimit.statusCode).toBe(400);

      // Unknown operationId -> 404
      const missingOp = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${crypto.randomUUID()}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [questions[0].id], decision: "accepted" },
      });
      expect(missingOp.statusCode).toBe(404);

      // Question belonging to another operation -> 400
      const otherOpRes = await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { totalQuestions: 1, moduleIds: [module1] },
      });
      const otherOpId = otherOpRes.json().operation.id;
      const crossOpRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${otherOpId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [questions[0].id], decision: "accepted" },
      });
      expect(crossOpRes.statusCode).toBe(400);
    });

    it("transfers accepted questions, blocks pending/rejected, handles duplicates idempotently, and locks transferred status", async () => {
      const { operationId, questions } = await seedQuizAndStagedQuestions(3);
      const [q1, q2, q3] = questions;

      // Accept q1, reject q2, leave q3 pending_review
      await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q1.id], decision: "accepted" },
      });
      await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q2.id], decision: "rejected" },
      });

      // Reject transferring pending_review q3 -> 400
      const pendingTransfer = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/transfer`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q3.id] },
      });
      expect(pendingTransfer.statusCode).toBe(400);

      // Reject transferring rejected q2 -> 400
      const rejectedTransfer = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/transfer`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q2.id] },
      });
      expect(rejectedTransfer.statusCode).toBe(400);

      // Reject request supplying quizId in body -> 400
      const withQuizIdRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/transfer`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q1.id], quizId: crypto.randomUUID() },
      });
      expect(withQuizIdRes.statusCode).toBe(400);

      // Transfer accepted q1 -> 200
      const okTransfer = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/transfer`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q1.id] },
      });
      expect(okTransfer.statusCode).toBe(200);
      expect(okTransfer.json().transferredCount).toBe(1);
      expect(okTransfer.json().alreadyTransferredIds).toEqual([]);
      expect(okTransfer.json().createdQuestions[0].sourceStagingQuestionId).toBe(q1.id);

      // Retry transfer of q1 (idempotent) -> 200, transferredCount: 0, alreadyTransferredIds: [q1.id]
      const dupTransfer = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/transfer`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q1.id] },
      });
      expect(dupTransfer.statusCode).toBe(200);
      expect(dupTransfer.json().transferredCount).toBe(0);
      expect(dupTransfer.json().alreadyTransferredIds).toEqual([q1.id]);
      expect(dupTransfer.json().existingTransferredQuestionIds.length).toBe(1);

      // Attempting to review transferred q1 -> skippedTransferredIds: [q1.id]
      const reviewTransferred = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { questionIds: [q1.id], decision: "rejected" },
      });
      expect(reviewTransferred.statusCode).toBe(200);
      expect(reviewTransferred.json().updatedCount).toBe(0);
      expect(reviewTransferred.json().skippedTransferredIds).toEqual([q1.id]);
    });

    it("enforces auth, student block, cross-org isolation, CSRF, and Origin protection", async () => {
      const { operationId, questions } = await seedQuizAndStagedQuestions(1);
      const qId = questions[0].id;

      // 1. Unauthenticated -> 401
      const unauthReview = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        payload: { questionIds: [qId], decision: "accepted" },
      });
      expect(unauthReview.statusCode).toBe(401);

      // 2. Student -> 403
      const studentTransfer = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/transfer`,
        headers: { authorization: `Bearer ${studentCookie}` },
        payload: { questionIds: [qId] },
      });
      expect(studentTransfer.statusCode).toBe(403);

      // 3. Cross-organization admin -> 403
      const crossOrgReview = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: { authorization: `Bearer ${orgAdminBCookie}` },
        payload: { questionIds: [qId], decision: "accepted" },
      });
      expect(crossOrgReview.statusCode).toBe(403);

      const crossOrgTransfer = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/transfer`,
        headers: { authorization: `Bearer ${orgAdminBCookie}` },
        payload: { questionIds: [qId] },
      });
      expect(crossOrgTransfer.statusCode).toBe(403);

      // 4. CSRF protection on cookie-based POST (missing x-csrf-token -> 403)
      const validCsrf = generateBoundCsrfToken(orgAdminACookie);
      const missingCsrfRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: {
          cookie: `avana_session=${orgAdminACookie}; avana_csrf=${validCsrf}`,
        },
        payload: { questionIds: [qId], decision: "accepted" },
      });
      expect(missingCsrfRes.statusCode).toBe(403);

      // 5. Disallowed Origin header with cookie session -> 403
      const badOriginRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: {
          cookie: `avana_session=${orgAdminACookie}; avana_csrf=${validCsrf}`,
          "x-csrf-token": validCsrf,
          origin: "https://evil.example.com",
        },
        payload: { questionIds: [qId], decision: "accepted" },
      });
      expect(badOriginRes.statusCode).toBe(403);

      // 6. Valid cookie + CSRF token -> 200
      const validCsrfRes = await app.inject({
        method: "POST",
        url: `/v1/studio/exam-operations/${operationId}/questions/review`,
        headers: {
          cookie: `avana_session=${orgAdminACookie}; avana_csrf=${validCsrf}`,
          "x-csrf-token": validCsrf,
        },
        payload: { questionIds: [qId], decision: "accepted" },
      });
      expect(validCsrfRes.statusCode).toBe(200);
      expect(validCsrfRes.json().updatedCount).toBe(1);
    });

    it("lists persistent quiz-scoped operation history with validation, filtering, pagination, and tenant isolation (Phase 2.7)", async () => {
      const { operationId } = await seedQuizAndStagedQuestions(2);

      // Other quiz in same org
      const otherQuizRes = await app.inject({
        method: "POST",
        url: "/v1/studio/quizzes",
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { title: "آزمون ایزوله", organizationId: orgIdA },
      });
      const otherQuizId = otherQuizRes.json().quiz.id;
      await app.inject({
        method: "POST",
        url: `/v1/studio/quizzes/${otherQuizId}/exam-operations`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
        payload: { totalQuestions: 1, moduleIds: [module1] },
      });

      // Success list for quizAId
      const listRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations?limit=10&offset=0`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().total).toBe(1);
      expect(listRes.json().limit).toBe(10);
      expect(listRes.json().offset).toBe(0);
      expect(listRes.json().operations[0].id).toBe(operationId);
      expect(listRes.json().operations[0].stagingStats).toEqual({
        totalCount: 2,
        pendingReviewCount: 2,
        acceptedCount: 0,
        rejectedCount: 0,
        transferredCount: 0,
      });

      // Invalid status -> 400
      const badStatus = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations?status=invalid_status`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
      });
      expect(badStatus.statusCode).toBe(400);

      // Invalid limit (> 50 or 0) -> 400
      const badLimit = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations?limit=51`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
      });
      expect(badLimit.statusCode).toBe(400);

      // Invalid offset (< 0) -> 400
      const badOffset = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations?offset=-1`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
      });
      expect(badOffset.statusCode).toBe(400);

      // Malformed quizId -> 404
      const badUuid = await app.inject({
        method: "GET",
        url: "/v1/studio/quizzes/not-a-uuid/exam-operations",
        headers: { authorization: `Bearer ${orgAdminACookie}` },
      });
      expect(badUuid.statusCode).toBe(404);

      // Non-existent quizId -> 404
      const missingQuiz = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${crypto.randomUUID()}/exam-operations`,
        headers: { authorization: `Bearer ${orgAdminACookie}` },
      });
      expect(missingQuiz.statusCode).toBe(404);

      // Student -> 403
      const studentRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations`,
        headers: { authorization: `Bearer ${studentCookie}` },
      });
      expect(studentRes.statusCode).toBe(403);

      // Cross-tenant orgAdminB -> 403
      const crossTenantRes = await app.inject({
        method: "GET",
        url: `/v1/studio/quizzes/${quizAId}/exam-operations`,
        headers: { authorization: `Bearer ${orgAdminBCookie}` },
      });
      expect(crossTenantRes.statusCode).toBe(403);
    });
  });
});



