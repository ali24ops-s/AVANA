/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { asUserId, asOrganizationId, type Actor, type UserId } from "@avana/domain";
import { errorHandlerPlugin } from "../http/errorHandler.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryPollStore,
  InMemoryPollResponseStore,
} from "../modules/studio/poll-stores.js";
import { PollService } from "../modules/studio/poll-service.js";
import { studioPollRoutes } from "../modules/studio/studio-poll-routes.js";
import { publicPollRoutes } from "../modules/studio/public-poll-routes.js";

describe("Studio Polls & Public Polls API Integration Tests", () => {
  let app: FastifyInstance;
  let pollStore: InMemoryPollStore;
  let responseStore: InMemoryPollResponseStore;
  let orgStore: InMemoryOrganizationStore;
  let pollService: PollService;

  const orgIdA = asOrganizationId("11111111-1111-4111-8111-111111111111");
  const orgIdB = asOrganizationId("22222222-2222-4222-8222-222222222222");

  const platformAdmin: Actor = {
    userId: asUserId("usr-platform-admin"),
    email: "platform-admin@avana.ir",
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const orgAdminA: Actor = {
    userId: asUserId("usr-org-admin-a"),
    email: "admin-a@avana.ir",
    role: "organization_admin",
    memberships: [{ organizationId: orgIdA, role: "organization_admin" }],
  };

  const orgAdminB: Actor = {
    userId: asUserId("usr-org-admin-b"),
    email: "admin-b@avana.ir",
    role: "organization_admin",
    memberships: [{ organizationId: orgIdB, role: "organization_admin" }],
  };

  const contentWorkerA: Actor = {
    userId: asUserId("usr-worker-a"),
    email: "worker-a@avana.ir",
    role: "content_worker",
    memberships: [{ organizationId: orgIdA, role: "content_worker" }],
  };

  const studentUser: Actor = {
    userId: asUserId("usr-student"),
    email: "student@avana.ir",
    role: "student",
    globalRole: "student",
  };

  const usersMap: Record<string, Actor> = {
    "token-platform-admin": platformAdmin,
    "token-org-admin-a": orgAdminA,
    "token-org-admin-b": orgAdminB,
    "token-worker-a": contentWorkerA,
    "token-student": studentUser,
  };

  beforeEach(async () => {
    pollStore = new InMemoryPollStore();
    responseStore = new InMemoryPollResponseStore();
    orgStore = new InMemoryOrganizationStore();

    orgStore.addOrganization({
      id: orgIdA,
      name: "Alpha Org",
      slug: "alpha",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orgStore.addOrganization({
      id: orgIdB,
      name: "Beta Org",
      slug: "beta",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    orgStore.addMembership({
      id: "mem-a",
      organizationId: orgIdA,
      userId: orgAdminA.userId,
      role: "organization_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orgStore.addMembership({
      id: "mem-b",
      organizationId: orgIdB,
      userId: orgAdminB.userId,
      role: "organization_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orgStore.addMembership({
      id: "mem-worker-a",
      organizationId: orgIdA,
      userId: contentWorkerA.userId,
      role: "content_worker",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    pollService = new PollService({
      pollStore,
      responseStore,
      organizationStore: orgStore,
      hmacSecret: "test-secret-salt-12345",
    });

    app = fastify({ trustProxy: true });
    await app.register(fastifyCookie);
    await app.register(errorHandlerPlugin);

    // Mock session service & user store for Fastify authMiddleware
    const mockSessionService = {
      validateSessionDetails: async (token: string) => {
        const actor = usersMap[token];
        if (!actor) {
          return { valid: false, revoked: false, user: null };
        }
        return {
          valid: true,
          revoked: false,
          user: {
            id: actor.userId,
            userId: actor.userId,
            role: actor.role,
            globalRole: actor.globalRole ?? null,
            memberships: actor.memberships?.map((m) => ({
              organizationId: String(m.organizationId),
              role: m.role,
            })),
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
    } as unknown as import("../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

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
    } as unknown as import("../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

    // Register Studio Management Poll routes
    await app.register(studioPollRoutes, {
      pollService,
      sessionService: mockSessionService,
      userStore: mockUserStore,
    });

    // Register Public Poll routes
    await app.register(publicPollRoutes, {
      pollService,
      allowedOrigins: ["https://aavana.ir", "http://localhost:5173"],
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ===========================================================================
  // 1. Studio Management API Tests
  // ===========================================================================
  describe("Studio Management Endpoints (/v1/studio/polls)", () => {
    it("1.1 enforces authentication on all management routes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/studio/polls",
      });
      expect(res.statusCode).toBe(401);
    });

    it("1.2 denies access to users without studio roles (e.g. regular student)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-student" },
        payload: { title: "Student Poll" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("1.3 allows organization_admin to create poll in their organization", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "نظرسنجی رضایت کاربران الف",
          organizationId: String(orgIdA),
          description: "بررسی میزان رضایت از خدمات",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.poll.id).toBeDefined();
      expect(data.poll.title).toBe("نظرسنجی رضایت کاربران الف");
      expect(data.poll.status).toBe("draft");
      expect(data.poll.slug).toBeDefined();
    });

    it("1.4 prevents organization_admin from creating poll in another organization", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "نظرسنجی سازمان ب",
          organizationId: String(orgIdB),
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("1.5 allows platform_admin global access across any organization", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-platform-admin" },
        payload: {
          title: "نظرسنجی سراسری پلتفرم",
          organizationId: String(orgIdB),
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.poll.title).toBe("نظرسنجی سراسری پلتفرم");
    });

    it("1.6 validates required title upon poll creation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "   ",
          organizationId: String(orgIdA),
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("1.7 performs full CRUD lifecycle on questions (add, update, reorder, delete)", async () => {
      // Create poll
      const pollRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "نظرسنجی خدمات مشتریان",
          organizationId: String(orgIdA),
        },
      });
      const pollId = pollRes.json().poll.id;

      // Add single-choice question
      const q1Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "کیفیت پاسخگویی چطور بود؟",
          questionType: "single_choice",
          isRequired: true,
          options: [{ optionText: "عالی" }, { optionText: "متوسط" }, { optionText: "ضعیف" }],
        },
      });
      expect(q1Res.statusCode).toBe(201);
      const q1Id = q1Res.json().question.id;

      // Add short-text question
      const q2Res = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "پیشنهاد شما برای بهبود:",
          questionType: "short_text",
          isRequired: false,
        },
      });
      expect(q2Res.statusCode).toBe(201);
      const q2Id = q2Res.json().question.id;

      // Reorder questions
      const reorderRes = await app.inject({
        method: "PUT",
        url: `/v1/studio/polls/${pollId}/questions/reorder`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: { questionIds: [q2Id, q1Id] },
      });
      expect(reorderRes.statusCode).toBe(200);

      // Verify reordered sequence
      const getPollRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${pollId}`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(getPollRes.statusCode).toBe(200);
      const questions = getPollRes.json().poll.questions;
      expect(questions[0].id).toBe(q2Id);
      expect(questions[1].id).toBe(q1Id);

      // Update question text
      const patchQRes = await app.inject({
        method: "PATCH",
        url: `/v1/studio/polls/${pollId}/questions/${q1Id}`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: { questionText: "کیفیت پاسخگویی پشتیبانی چطور بود؟" },
      });
      expect(patchQRes.statusCode).toBe(200);
      expect(patchQRes.json().question.questionText).toBe("کیفیت پاسخگویی پشتیبانی چطور بود؟");

      // Delete question
      const delQRes = await app.inject({
        method: "DELETE",
        url: `/v1/studio/polls/${pollId}/questions/${q2Id}`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(delQRes.statusCode).toBe(200);
    });

    it("1.8 enforces publishing invariants and state transitions (publish / close)", async () => {
      // Create empty poll
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: { title: "نظرسنجی بدون سؤال", organizationId: String(orgIdA) },
      });
      const pollId = createRes.json().poll.id;

      // Attempt to publish without questions
      const failPub = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(failPub.statusCode).toBe(400);

      // Add question
      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "سؤال اول",
          questionType: "single_choice",
          options: [{ optionText: "بله" }, { optionText: "خیر" }],
        },
      });

      // Now publish successfully
      const pubRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(pubRes.statusCode).toBe(200);
      expect(pubRes.json().poll.status).toBe("published");

      // Close poll
      const closeRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/close`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(closeRes.statusCode).toBe(200);
      expect(closeRes.json().poll.status).toBe("closed");
    });

    it("1.9 exports results as CSV with UTF-8 BOM and formula injection protection", async () => {
      // Create and publish poll
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: { title: "بررسی فرمول‌ها و اکسل", organizationId: String(orgIdA) },
      });
      const poll = createRes.json().poll;
      const pollId = poll.id;

      const qRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "نظر شما چیست؟",
          questionType: "short_text",
        },
      });
      const qId = qRes.json().question.id;

      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });

      // Submit a response with a malicious formula string
      await app.inject({
        method: "POST",
        url: `/v1/public/polls/${poll.slug}/vote`,
        payload: {
          answers: {
            [qId]: "=SUM(1,2)",
          },
        },
      });

      // Export CSV
      const exportRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${pollId}/export`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });

      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(exportRes.headers["content-disposition"]).toContain("attachment; filename=");

      const csv = exportRes.body;
      // Check UTF-8 BOM
      expect(csv.startsWith("\uFEFF")).toBe(true);
      // Check formula defense: '=SUM(1,2)' must be sanitized to start with single quote
      expect(csv).toContain("\"'=SUM(1,2)\"");
    });
  });

  // ===========================================================================
  // 2. Public Taking, Voting & Privacy API Tests
  // ===========================================================================
  describe("Public Polls Endpoints (/v1/public/polls)", () => {
    let publishedSlug: string;
    let publishedPollId: string;
    let choiceQId: string;
    let textQId: string;
    let opt1Id: string;
    let opt2Id: string;

    beforeEach(async () => {
      // Setup a published poll with 1 choice and 1 text question
      const poll = await pollService.createPoll(orgAdminA, {
        title: "نظرسنجی همایش سالانه",
        organizationId: String(orgIdA),
        settings: {
          allowAnonymous: true,
          showResultsAfterVote: true,
        },
      });
      publishedPollId = poll.id;
      publishedSlug = poll.slug;

      const q1 = await pollService.createQuestion(orgAdminA, publishedPollId, {
        questionText: "نحوه برگزاری همایش چگونه بود؟",
        questionType: "single_choice",
        isRequired: true,
        options: [{ optionText: "بسیار خوب" }, { optionText: "نیازمند بهبود" }],
      });
      choiceQId = q1.id;
      opt1Id = q1.options![0].id;
      opt2Id = q1.options![1].id;

      const q2 = await pollService.createQuestion(orgAdminA, publishedPollId, {
        questionText: "دیدگاه تکمیلی:",
        questionType: "short_text",
        isRequired: false,
      });
      textQId = q2.id;

      await pollService.publishPoll(orgAdminA, publishedPollId);
    });

    it("2.1 retrieves sanitized public poll structure without sensitive admin fields", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/public/polls/${publishedSlug}`,
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.poll.slug).toBe(publishedSlug);
      expect(data.poll.title).toBe("نظرسنجی همایش سالانه");
      expect(data.poll.questions.length).toBe(2);
      expect(data.poll.userVoted).toBe(false);

      // Sensitive administrative properties must be completely absent
      expect((data.poll as Record<string, unknown>).organizationId).toBeUndefined();
      expect((data.poll as Record<string, unknown>).createdBy).toBeUndefined();
      expect((data.poll as Record<string, unknown>).deletedAt).toBeUndefined();
    });

    it("2.2 issues avana_poll_pid HTTP-only cookie and records anonymous vote", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        payload: {
          answers: {
            [choiceQId]: opt1Id,
            [textQId]: "تجربه بسیار مفیدی بود.",
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.success).toBe(true);
      expect(data.responseId).toBeDefined();

      // Check cookie issuance
      const setCookieHeader = res.headers["set-cookie"];
      expect(setCookieHeader).toBeDefined();
      expect(String(setCookieHeader)).toContain("avana_poll_pid=");
      expect(String(setCookieHeader)).toContain("HttpOnly");
      expect(String(setCookieHeader)).toContain("SameSite=Lax");
    });

    it("2.3 prevents double voting from the same participant cookie (409 Conflict)", async () => {
      const pidCookie = "avana_poll_pid=test_participant_token_unique_12345";

      // Vote 1
      const vote1 = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        headers: { cookie: pidCookie },
        payload: {
          answers: {
            [choiceQId]: opt1Id,
          },
        },
      });
      expect(vote1.statusCode).toBe(201);

      // Verify that get poll now reports userVoted: true
      const checkPoll = await app.inject({
        method: "GET",
        url: `/v1/public/polls/${publishedSlug}`,
        headers: { cookie: pidCookie },
      });
      expect(checkPoll.json().poll.userVoted).toBe(true);

      // Vote 2 (Duplicate)
      const vote2 = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        headers: { cookie: pidCookie },
        payload: {
          answers: {
            [choiceQId]: opt2Id,
          },
        },
      });
      expect(vote2.statusCode).toBe(409);
      const vote2Err = vote2.json().error?.message ?? vote2.json().message;
      expect(vote2Err).toContain("قبلاً در این نظرسنجی شرکت کرده‌اید");
    });

    it("2.4 locks poll structure from further modifications once first vote is cast", async () => {
      // Cast first vote
      await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        payload: {
          answers: { [choiceQId]: opt1Id },
        },
      });

      // Studio admin attempts to add a question
      const addQ = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${publishedPollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "سؤال جدید پس از ثبت رأی",
          questionType: "short_text",
        },
      });
      expect(addQ.statusCode).toBe(400);
      const addQErr = addQ.json().error?.message ?? addQ.json().message;
      expect(addQErr).toContain("امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد");

      // Studio admin attempts to delete an existing question
      const delQ = await app.inject({
        method: "DELETE",
        url: `/v1/studio/polls/${publishedPollId}/questions/${choiceQId}`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(delQ.statusCode).toBe(400);
    });

    it("2.5 enforces public results privacy: masks short_text responses from public view", async () => {
      // Cast votes
      await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        headers: { cookie: "avana_poll_pid=cookie_user_1_abcdef" },
        payload: {
          answers: {
            [choiceQId]: opt1Id,
            [textQId]: "پاسخ متنی خصوصی ۱",
          },
        },
      });

      // Public results view
      const pubResultsRes = await app.inject({
        method: "GET",
        url: `/v1/public/polls/${publishedSlug}/results`,
      });
      expect(pubResultsRes.statusCode).toBe(200);
      const pubResults = pubResultsRes.json().results;
      expect(pubResults.totalResponses).toBe(1);
      expect(pubResults.isAdmin).toBe(false);

      // Verify choice stats exist
      const choiceStat = pubResults.questions.find((q: { questionId: string }) => q.questionId === choiceQId);
      expect(choiceStat.options[0].voteCount).toBe(1);

      // Verify text answers are strictly stripped for public
      const textStat = pubResults.questions.find((q: { questionId: string }) => q.questionId === textQId);
      expect(textStat.textAnswers).toBeUndefined();

      // Admin results view must include unmasked text answers
      const adminResultsRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${publishedPollId}/results`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(adminResultsRes.statusCode).toBe(200);
      const adminResults = adminResultsRes.json().results;
      expect(adminResults.isAdmin).toBe(true);
      const adminTextStat = adminResults.questions.find((q: { questionId: string }) => q.questionId === textQId);
      expect(adminTextStat.textAnswers).toContain("پاسخ متنی خصوصی ۱");
    });

    it("2.6 blocks public results when showResultsAfterVote is disabled (403 Forbidden)", async () => {
      // Update poll settings to disable public results
      await app.inject({
        method: "PATCH",
        url: `/v1/studio/polls/${publishedPollId}`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          settings: { showResultsAfterVote: false },
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/v1/public/polls/${publishedSlug}/results`,
      });
      expect(res.statusCode).toBe(403);
    });

    it("2.7 blocks requests with invalid or untrusted Origin header (CSRF defense)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        headers: {
          origin: "https://evil-attacker-site.com",
        },
        payload: {
          answers: { [choiceQId]: opt1Id },
        },
      });
      expect(res.statusCode).toBe(403);
      const resErr = res.json().error?.message ?? res.json().message;
      expect(resErr).toContain("مبدا ناشناخته");
    });

    it("2.8 allows requests with legitimate Origin header", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        headers: {
          origin: "https://aavana.ir",
        },
        payload: {
          answers: { [choiceQId]: opt1Id },
        },
      });
      expect(res.statusCode).toBe(201);
    });

    it("2.9 rate limits excessive vote submissions (429 Too Many Requests)", async () => {
      const ip = "192.168.10.99";
      // Perform 10 submissions (each with different participant cookie)
      for (let i = 0; i < 10; i++) {
        const voteRes = await app.inject({
          method: "POST",
          url: `/v1/public/polls/${publishedSlug}/vote`,
          headers: {
            "x-forwarded-for": ip,
            cookie: `avana_poll_pid=rate_test_user_${i}_${Date.now()}`,
          },
          payload: {
            answers: { [choiceQId]: opt1Id },
          },
        });
        expect(voteRes.statusCode).toBe(201);
      }

      // 11th submission from the same IP must be rate-limited
      const blockedRes = await app.inject({
        method: "POST",
        url: `/v1/public/polls/${publishedSlug}/vote`,
        headers: {
          "x-forwarded-for": ip,
          cookie: `avana_poll_pid=rate_test_user_blocked_${Date.now()}`,
        },
        payload: {
          answers: { [choiceQId]: opt1Id },
        },
      });
      expect(blockedRes.statusCode).toBe(429);
      const blockedErr = blockedRes.json().error?.message ?? blockedRes.json().message;
      expect(blockedErr).toContain("بیش از حد مجاز است");
    });
  });

  // =========================================================================
  // 3. Pre-Frontend Security Hardening & Authorization API Tests
  // =========================================================================
  describe("3. Pre-Frontend Security Hardening & Authorization API Tests", () => {
    it("3.1 content_worker can create draft polls and add questions, but is 403 Forbidden from publish, close, delete, and export", async () => {
      // 1. Worker creates draft poll
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-worker-a" },
        payload: {
          title: "نظرسنجی پیش‌نویس کارشناس محتوا",
          organizationId: String(orgIdA),
        },
      });
      expect(createRes.statusCode).toBe(201);
      const pollId = createRes.json().poll.id;

      // 2. Worker adds question
      const qRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-worker-a" },
        payload: {
          questionText: "سؤال ایجاد شده توسط کارشناس",
          questionType: "single_choice",
          options: [{ optionText: "الف" }, { optionText: "ب" }],
        },
      });
      expect(qRes.statusCode).toBe(201);

      // 3. Worker attempts to publish -> 403 Forbidden
      const pubRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-worker-a" },
      });
      expect(pubRes.statusCode).toBe(403);
      expect(pubRes.json().error.message).toContain("فقط مدیران سازمان یا مدیران پلتفرم");

      // 4. Worker attempts to close -> 403 Forbidden
      const closeRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/close`,
        headers: { authorization: "Bearer token-worker-a" },
      });
      expect(closeRes.statusCode).toBe(403);
      expect(closeRes.json().error.message).toContain("فقط مدیران سازمان یا مدیران پلتفرم");

      // 5. Worker attempts to delete -> 403 Forbidden
      const delRes = await app.inject({
        method: "DELETE",
        url: `/v1/studio/polls/${pollId}`,
        headers: { authorization: "Bearer token-worker-a" },
      });
      expect(delRes.statusCode).toBe(403);
      expect(delRes.json().error.message).toContain("فقط مدیران سازمان یا مدیران پلتفرم");

      // 6. Worker attempts to export CSV -> 403 Forbidden
      const exportRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${pollId}/export`,
        headers: { authorization: "Bearer token-worker-a" },
      });
      expect(exportRes.statusCode).toBe(403);
      expect(exportRes.json().error.message).toContain("فقط مدیران سازمان یا مدیران پلتفرم");

      // 7. Worker attempts status change via PATCH -> 403 Forbidden
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/studio/polls/${pollId}`,
        headers: { authorization: "Bearer token-worker-a" },
        payload: { status: "published" },
      });
      expect(patchRes.statusCode).toBe(403);
      expect(patchRes.json().error.message).toContain("فقط مدیران سازمان یا مدیران پلتفرم");
    });

    it("3.2 API rejects slug modification once a poll is published (400 Bad Request)", async () => {
      // 1. Admin creates poll
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "نظرسنجی تست قفل اسلاگ",
          slug: "locked-slug-test",
          organizationId: String(orgIdA),
        },
      });
      expect(createRes.statusCode).toBe(201);
      const pollId = createRes.json().poll.id;

      // Add question and publish
      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "سؤال تست",
          questionType: "single_choice",
          options: [{ optionText: "گزینه ۱" }, { optionText: "گزینه ۲" }],
        },
      });

      const pubRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });
      expect(pubRes.statusCode).toBe(200);

      // Attempt slug modification on published poll
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/studio/polls/${pollId}`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: { slug: "attempt-new-slug-on-published" },
      });

      expect(patchRes.statusCode).toBe(400);
      expect(patchRes.json().error.message).toContain("امکان تغییر شناسه یکتای نظرسنجی (slug) پس از انتشار یا بسته‌شدن وجود ندارد");
    });

    it("3.3 CSV export endpoint applies formula injection defenses and RFC-4180 escaping", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "نظرسنجی تست خروجی اکسل امن",
          slug: "safe-excel-poll",
          organizationId: String(orgIdA),
        },
      });
      expect(createRes.statusCode).toBe(201);
      const pollId = createRes.json().poll.id;

      const qRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "نظر شما",
          questionType: "short_text",
        },
      });
      expect(qRes.statusCode).toBe(201);
      const questionId = qRes.json().question.id;

      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });

      // Submit an answer with dangerous spreadsheet injection syntax
      await app.inject({
        method: "POST",
        url: "/v1/public/polls/safe-excel-poll/vote",
        headers: { cookie: "avana_poll_pid=attacker_device_test" },
        payload: {
          answers: {
            [questionId]: "=cmd|'/C calc'!A0",
          },
        },
      });

      // Export CSV as Admin
      const exportRes = await app.inject({
        method: "GET",
        url: `/v1/studio/polls/${pollId}/export`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });

      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(exportRes.headers["content-disposition"]).toContain("attachment; filename=");
      expect(exportRes.body.startsWith("\uFEFF")).toBe(true);
      expect(exportRes.body).toContain("\"'=cmd|'/C calc'!A0\"");
    });
  });

  describe("Regression Tests: 500 Internal Server Error & 22P02 Prevention", () => {
    it("returns 404 domain error (never 500) when non-UUID is passed to studio routes expecting UUID", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/v1/studio/polls/not-a-valid-uuid",
        headers: { authorization: "Bearer token-platform-admin" },
      });
      expect(getRes.statusCode).toBe(404);
      expect(getRes.json().error.code).toBe("not_found");

      const resultsRes = await app.inject({
        method: "GET",
        url: "/v1/studio/polls/not-a-valid-uuid/results",
        headers: { authorization: "Bearer token-platform-admin" },
      });
      expect(resultsRes.statusCode).toBe(404);
      expect(resultsRes.json().error.code).toBe("not_found");
    });

    it("handles public results correctly: 200 for valid slug, 404 for non-existent slug (never 500)", async () => {
      // 1. Valid published poll with slug and question
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "Public Slug Poll",
          slug: "public-slug-poll",
          type: "single_choice",
        },
      });
      const pollId = createRes.json().poll.id;

      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "کدام گزینه؟",
          questionType: "single_choice",
          options: [{ optionText: "الف" }, { optionText: "ب" }],
        },
      });

      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });

      // Call public results with slug -> 200
      const pubRes = await app.inject({
        method: "GET",
        url: "/v1/public/polls/public-slug-poll/results",
      });
      expect(pubRes.statusCode).toBe(200);
      expect(pubRes.json().results.pollId).toBe(pollId);

      // Call public results with non-existent slug -> 404 (not 500)
      const notFoundRes = await app.inject({
        method: "GET",
        url: "/v1/public/polls/does-not-exist-slug/results",
      });
      expect(notFoundRes.statusCode).toBe(404);
      expect(notFoundRes.json().error.code).toBe("not_found");
    });

    it("returns 404 (never 500) when voting on non-existent slug", async () => {
      const voteRes = await app.inject({
        method: "POST",
        url: "/v1/public/polls/non-existent-poll-slug/vote",
        payload: { answers: {} },
      });
      expect(voteRes.statusCode).toBe(404);
      expect(voteRes.json().error.code).toBe("not_found");
    });

    it("returns 400 bad_request (never 500) when organizationId is an invalid non-UUID string in createPoll", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-platform-admin" },
        payload: {
          title: "Invalid Org Poll",
          type: "single_choice",
          organizationId: "not-a-valid-uuid",
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("bad_request");
    });

    it("returns 400 bad_request when invalid dates are passed to startsAt / endsAt", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-platform-admin" },
        payload: {
          title: "Invalid Date Poll",
          type: "single_choice",
          startsAt: "invalid-date-string",
        },
      });
      expect(createRes.statusCode).toBe(400);
      expect(createRes.json().error.code).toBe("bad_request");

      // Valid poll first
      const validCreate = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-platform-admin" },
        payload: {
          title: "Valid Date Poll",
          type: "single_choice",
        },
      });
      const validId = validCreate.json().poll.id;

      // Update with invalid endsAt
      const updateRes = await app.inject({
        method: "PATCH",
        url: `/v1/studio/polls/${validId}`,
        headers: { authorization: "Bearer token-platform-admin" },
        payload: {
          endsAt: "not-a-date",
        },
      });
      expect(updateRes.statusCode).toBe(400);
      expect(updateRes.json().error.code).toBe("bad_request");
    });

    it("allows null or empty string for startsAt / endsAt to clear dates", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-platform-admin" },
        payload: {
          title: "Null Date Poll",
          type: "single_choice",
          startsAt: null,
          endsAt: null,
        },
      });
      expect(createRes.statusCode).toBe(201);
      expect(createRes.json().poll.startsAt).toBeNull();
      expect(createRes.json().poll.endsAt).toBeNull();
    });

    it("returns 400 bad_request when voting with invalid non-UUID userId", async () => {
      // Create and publish a poll
      const createRes = await app.inject({
        method: "POST",
        url: "/v1/studio/polls",
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          title: "Auth Vote Poll",
          slug: "auth-vote-poll",
          type: "single_choice",
        },
      });
      const pollId = createRes.json().poll.id;
      const qRes = await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/questions`,
        headers: { authorization: "Bearer token-org-admin-a" },
        payload: {
          questionText: "کدام گزینه؟",
          questionType: "single_choice",
          options: [{ optionText: "الف" }, { optionText: "ب" }],
        },
      });
      const qId = qRes.json().question.id;
      const optId = qRes.json().question.options[0].id;

      await app.inject({
        method: "POST",
        url: `/v1/studio/polls/${pollId}/publish`,
        headers: { authorization: "Bearer token-org-admin-a" },
      });

      // Submit vote directly via pollService with invalid userId
      await expect(
        pollService.submitResponse("auth-vote-poll", { answers: { [qId]: optId } }, "test-device-pid", {
          userId: "not-a-valid-uuid" as any,
          ip: "127.0.0.1",
        })
      ).rejects.toThrow("شناسه کاربر نامعتبر است");
    });

    it("strictly returns empty list when organizationIds filter has no valid UUIDs (prevents tenant leakage)", async () => {
      const listResult = await pollStore.list({
        organizationIds: ["not-a-uuid", "also-invalid"],
      });
      expect(listResult).toEqual([]);
    });

    describe("Question Options Security & Cross-Question Isolation (updateQuestion)", () => {
      it("rejects non-UUID option ID with 400 bad_request (never 500 / 22P02)", async () => {
        const createRes = await app.inject({
          method: "POST",
          url: "/v1/studio/polls",
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: { title: "Opt UUID Test Poll", type: "single_choice" },
        });
        const pollId = createRes.json().poll.id;

        const qRes = await app.inject({
          method: "POST",
          url: `/v1/studio/polls/${pollId}/questions`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            questionText: "سؤال اصلی",
            questionType: "single_choice",
            options: [{ optionText: "گزینه ۱" }, { optionText: "گزینه ۲" }],
          },
        });
        const qId = qRes.json().question.id;

        // Try to update with a non-UUID option ID
        const updateRes = await app.inject({
          method: "PATCH",
          url: `/v1/studio/polls/${pollId}/questions/${qId}`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            options: [
              { id: "invalid-not-a-uuid", optionText: "گزینه معیوب" },
              { optionText: "گزینه جدید ۲" },
            ],
          },
        });

        expect(updateRes.statusCode).toBe(400);
        expect(updateRes.json().error.code).toBe("bad_request");
        expect(updateRes.json().error.message).toContain("شناسه گزینه نامعتبر است");
      });

      it("rejects valid UUID option ID that belongs to another question in the same poll", async () => {
        const createRes = await app.inject({
          method: "POST",
          url: "/v1/studio/polls",
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: { title: "Cross-Question Poll", type: "single_choice" },
        });
        const pollId = createRes.json().poll.id;

        const q1Res = await app.inject({
          method: "POST",
          url: `/v1/studio/polls/${pollId}/questions`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            questionText: "سؤال اول",
            questionType: "single_choice",
            options: [{ optionText: "گزینه ۱-الف" }, { optionText: "گزینه ۱-ب" }],
          },
        });
        const q1Id = q1Res.json().question.id;

        const q2Res = await app.inject({
          method: "POST",
          url: `/v1/studio/polls/${pollId}/questions`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            questionText: "سؤال دوم",
            questionType: "single_choice",
            options: [{ optionText: "گزینه ۲-الف" }, { optionText: "گزینه ۲-ب" }],
          },
        });
        const q2OptId = q2Res.json().question.options[0].id;

        // Attempt to pass q2's option ID into q1's update
        const updateRes = await app.inject({
          method: "PATCH",
          url: `/v1/studio/polls/${pollId}/questions/${q1Id}`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            options: [
              { id: q2OptId, optionText: "گزینه دزدی از سؤال ۲" },
              { optionText: "گزینه جدید" },
            ],
          },
        });

        expect(updateRes.statusCode).toBe(400);
        expect(updateRes.json().error.code).toBe("bad_request");
        expect(updateRes.json().error.message).toContain("گزینه ارسالی متعلق به این سؤال نیست");
      });

      it("rejects valid UUID option ID that belongs to a different poll", async () => {
        // Poll A
        const pollARes = await app.inject({
          method: "POST",
          url: "/v1/studio/polls",
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: { title: "Poll A", type: "single_choice" },
        });
        const pollAId = pollARes.json().poll.id;
        const qARes = await app.inject({
          method: "POST",
          url: `/v1/studio/polls/${pollAId}/questions`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            questionText: "سؤال نظرسنجی الف",
            questionType: "single_choice",
            options: [{ optionText: "گزینه الف-۱" }, { optionText: "گزینه الف-۲" }],
          },
        });
        const qAId = qARes.json().question.id;

        // Poll B
        const pollBRes = await app.inject({
          method: "POST",
          url: "/v1/studio/polls",
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: { title: "Poll B", type: "single_choice" },
        });
        const pollBId = pollBRes.json().poll.id;
        const qBRes = await app.inject({
          method: "POST",
          url: `/v1/studio/polls/${pollBId}/questions`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            questionText: "سؤال نظرسنجی ب",
            questionType: "single_choice",
            options: [{ optionText: "گزینه ب-۱" }, { optionText: "گزینه ب-۲" }],
          },
        });
        const optBId = qBRes.json().question.options[0].id;

        // Attempt to pass Poll B's option ID into Poll A's question update
        const updateRes = await app.inject({
          method: "PATCH",
          url: `/v1/studio/polls/${pollAId}/questions/${qAId}`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            options: [
              { id: optBId, optionText: "گزینه از نظرسنجی دیگر" },
              { optionText: "گزینه دوم" },
            ],
          },
        });

        expect(updateRes.statusCode).toBe(400);
        expect(updateRes.json().error.code).toBe("bad_request");
        expect(updateRes.json().error.message).toContain("گزینه ارسالی متعلق به این سؤال نیست");
      });

      it("successfully updates existing option and adds new option without ID", async () => {
        const createRes = await app.inject({
          method: "POST",
          url: "/v1/studio/polls",
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: { title: "Poll Update Valid", type: "single_choice" },
        });
        const pollId = createRes.json().poll.id;

        const qRes = await app.inject({
          method: "POST",
          url: `/v1/studio/polls/${pollId}/questions`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            questionText: "سؤال معتبر",
            questionType: "single_choice",
            options: [{ optionText: "گزینه اصلی ۱" }, { optionText: "گزینه اصلی ۲" }],
          },
        });
        const qId = qRes.json().question.id;
        const opt1Id = qRes.json().question.options[0].id;

        // Update option 1 and add new option 3 (without ID)
        const updateRes = await app.inject({
          method: "PATCH",
          url: `/v1/studio/polls/${pollId}/questions/${qId}`,
          headers: { authorization: "Bearer token-org-admin-a" },
          payload: {
            options: [
              { id: opt1Id, optionText: "گزینه اصلی ۱ (ویرایش‌شده)" },
              { optionText: "گزینه ۳ جدید" },
            ],
          },
        });

        expect(updateRes.statusCode).toBe(200);
        const updatedOptions = updateRes.json().question.options;
        expect(updatedOptions.length).toBe(2);
        expect(updatedOptions[0].id).toBe(opt1Id);
        expect(updatedOptions[0].optionText).toBe("گزینه اصلی ۱ (ویرایش‌شده)");
        expect(updatedOptions[1].id).toBeDefined();
        expect(updatedOptions[1].optionText).toBe("گزینه ۳ جدید");
      });
    });
  });
});
