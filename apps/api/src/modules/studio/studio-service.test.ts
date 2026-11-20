import { describe, it, expect, beforeEach } from "vitest";
import { StudioService } from "./studio-service.js";
import { StudioAiService } from "./studio-ai-service.js";
import {
  InMemoryMarketingQuizStore,
  InMemoryMarketingQuestionBankStore,
  InMemoryMarketingQuizAttemptStore,
  DrizzleMarketingQuizAttemptStore,
} from "./studio-stores.js";
import { AttemptRateLimiter } from "./public-quiz-routes.js";
import { InMemoryOrganizationStore } from "../organizations/test/in-memory-stores.js";
import { type Actor, DomainError, asOrganizationId, asUserId } from "@avana/domain";
import type { ModelGateway, CompletionRequest, CompletionResponse } from "../generation/gateway/types.js";

describe("StudioService & Marketing Quizzes Module", () => {
  let quizStore: InMemoryMarketingQuizStore;
  let bankStore: InMemoryMarketingQuestionBankStore;
  let attemptStore: InMemoryMarketingQuizAttemptStore;
  let orgStore: InMemoryOrganizationStore;
  let service: StudioService;

  const adminActor: Actor = {
    userId: asUserId("admin-1"),
    email: "admin@avana.ir",
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const orgIdA = asOrganizationId("org-a");
  const orgIdB = asOrganizationId("org-b");

  const orgAdminA: Actor = {
    userId: asUserId("admin-a"),
    email: "adminA@test.com",
    role: "organization_admin",
    memberships: [{ organizationId: orgIdA, role: "organization_admin" }],
  };

  const orgAdminB: Actor = {
    userId: asUserId("admin-b"),
    email: "adminB@test.com",
    role: "organization_admin",
    memberships: [{ organizationId: orgIdB, role: "organization_admin" }],
  };

  const contentWorkerA: Actor = {
    userId: asUserId("worker-a"),
    email: "workerA@test.com",
    role: "content_worker",
    globalRole: "content_worker",
    memberships: [{ organizationId: orgIdA, role: "content_worker" }],
  };

  const studentActor: Actor = {
    userId: asUserId("student-1"),
    email: "student@avana.ir",
    role: "student",
    globalRole: "student",
  };

  beforeEach(() => {
    quizStore = new InMemoryMarketingQuizStore();
    bankStore = new InMemoryMarketingQuestionBankStore();
    attemptStore = new InMemoryMarketingQuizAttemptStore();
    orgStore = new InMemoryOrganizationStore();

    orgStore.addOrganization({
      id: orgIdA,
      name: "Org Alpha",
      slug: "org-alpha",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    orgStore.addOrganization({
      id: orgIdB,
      name: "Org Beta",
      slug: "org-beta",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    orgStore.addMembership({
      id: "mem-a",
      organizationId: orgIdA,
      userId: asUserId("admin-a"),
      role: "organization_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    orgStore.addMembership({
      id: "mem-b",
      organizationId: orgIdB,
      userId: asUserId("admin-b"),
      role: "organization_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    orgStore.addMembership({
      id: "mem-worker-a",
      organizationId: orgIdA,
      userId: asUserId("worker-a"),
      role: "content_worker",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    service = new StudioService(quizStore, bankStore, attemptStore, undefined, orgStore);
  });

  describe("Role and Permission Enforcement", () => {
    it("allows platform_admin full access to create, update, publish and delete", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون فارماکولوژی آنتی‌بیوتیک‌ها",
      });
      expect(quiz.id).toBeDefined();
      expect(quiz.status).toBe("draft");

      const published = await service.updateQuiz(adminActor, quiz.id, {
        status: "published",
      });
      expect(published.status).toBe("published");

      await service.deleteQuiz(adminActor, quiz.id);
      const deleted = await quizStore.getById(quiz.id);
      expect(deleted).toBeNull();
    });

    it("allows content_worker to create and edit drafts, but BLOCKS publish, disable, and delete", async () => {
      const quiz = await service.createQuiz(contentWorkerA, {
        title: "پیش‌نویس بازاریابی",
      });
      expect(quiz.status).toBe("draft");

      // Edit draft title: allowed
      const edited = await service.updateQuiz(contentWorkerA, quiz.id, {
        title: "عنوان ویرایش شده",
      });
      expect(edited.title).toBe("عنوان ویرایش شده");

      // Try to publish: forbidden
      await expect(
        service.updateQuiz(contentWorkerA, quiz.id, {
          status: "published",
        }),
      ).rejects.toThrowError(DomainError);

      // Try to disable: forbidden
      await expect(
        service.updateQuiz(contentWorkerA, quiz.id, {
          status: "disabled",
        }),
      ).rejects.toThrowError(DomainError);

      // Try to delete: forbidden
      await expect(service.deleteQuiz(contentWorkerA, quiz.id)).rejects.toThrowError(
        DomainError,
      );
    });

    it("rejects unauthorized users (e.g. students) from accessing Studio", async () => {
      await expect(
        service.createQuiz(studentActor, { title: "تست غیرمجاز" }),
      ).rejects.toThrowError(DomainError);

      await expect(service.listQuizzes(studentActor)).rejects.toThrowError(
        DomainError,
      );
    });
  });

  describe("Multi-Tenancy & Cross-Organization Security", () => {
    it("prevents organization_admin of Org A from viewing Org B quiz", async () => {
      const quizB = await service.createQuiz(orgAdminB, {
        title: "کوییز محرمانه سازمان ب",
        organizationId: orgIdB,
      });

      await expect(
        service.getQuizById(orgAdminA, quizB.id),
      ).rejects.toThrowError(DomainError);
    });

    it("prevents organization_admin of Org A from updating or deleting Org B quiz", async () => {
      const quizB = await service.createQuiz(orgAdminB, {
        title: "کوییز سازمان ب",
        organizationId: orgIdB,
      });

      await expect(
        service.updateQuiz(orgAdminA, quizB.id, { title: "تلاش برای نفوذ" }),
      ).rejects.toThrowError(DomainError);

      await expect(
        service.deleteQuiz(orgAdminA, quizB.id),
      ).rejects.toThrowError(DomainError);
    });

    it("prevents content_worker of Org A from accessing Org B quizzes", async () => {
      const quizB = await service.createQuiz(orgAdminB, {
        title: "کوییز سازمان ب",
        organizationId: orgIdB,
      });

      await expect(
        service.getQuizById(contentWorkerA, quizB.id),
      ).rejects.toThrowError(DomainError);
    });

    it("scopes listQuizzes without organizationId strictly to the user's organization", async () => {
      await service.createQuiz(orgAdminA, {
        title: "کوییز سازمان الف",
        organizationId: orgIdA,
      });
      await service.createQuiz(orgAdminB, {
        title: "کوییز سازمان ب",
        organizationId: orgIdB,
      });

      // OrgAdminA requests list WITHOUT passing organizationId
      const listForA = await service.listQuizzes(orgAdminA);
      expect(listForA.length).toBe(1);
      expect(listForA[0].organizationId).toBe(orgIdA);

      // OrgAdminB requests list WITHOUT passing organizationId
      const listForB = await service.listQuizzes(orgAdminB);
      expect(listForB.length).toBe(1);
      expect(listForB[0].organizationId).toBe(orgIdB);
    });

    it("scopes listQuestionBank without organizationId strictly to the user's organization", async () => {
      await service.createQuestionBankItem(orgAdminA, {
        organizationId: orgIdA,
        sourceType: "manual",
        question: "سؤال الف",
        choices: [
          { id: "1", text: "گزینه ۱" },
          { id: "2", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "1" },
        difficulty: "easy",
        questionType: "multiple_choice",
        tags: [],
      });

      const itemB = await service.createQuestionBankItem(orgAdminB, {
        organizationId: orgIdB,
        sourceType: "manual",
        question: "سؤال ب",
        choices: [
          { id: "1", text: "گزینه ۱" },
          { id: "2", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "1" },
        difficulty: "easy",
        questionType: "multiple_choice",
        tags: [],
      });

      const bankForA = await service.listQuestionBank(orgAdminA);
      expect(bankForA.length).toBe(1);
      expect(bankForA.some((item) => item.id === itemB.id)).toBe(false);
    });

    it("allows platform_admin global access across all organizations", async () => {
      await service.createQuiz(orgAdminA, {
        title: "کوییز سازمان الف",
        organizationId: orgIdA,
      });
      await service.createQuiz(orgAdminB, {
        title: "کوییز سازمان ب",
        organizationId: orgIdB,
      });

      const allQuizzes = await service.listQuizzes(adminActor);
      expect(allQuizzes.length).toBe(2);
    });
  });

  describe("Question Snapshots and Independence", () => {
    it("creates independent snapshot when question is added to quiz", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون کاتزونگ",
      });

      const question = await service.addManualQuestion(adminActor, quiz.id, {
        question: "کدام دارو مهارکننده سنتز دیواره سلولی باکتری است؟",
        choices: [
          { id: "1", text: "آمپی‌سیلین" },
          { id: "2", text: "جنتامایسین" },
          { id: "3", text: "داکسی‌سایکلین" },
          { id: "4", text: "سیپروفلوکساسین" },
        ],
        correctAnswer: { choiceId: "1" },
        explanation: "آمپی‌سیلین با مهار آنزیم ترانس‌پپتیداز دیواره سلولی را تخریب می‌کند.",
        difficulty: "medium",
        addToQuestionBank: true,
      });

      expect(question.id).toBeDefined();
      expect(question.question).toContain("مهارکننده سنتز دیواره");

      // Verify it was added to question bank as well
      const bankList = await service.listQuestionBank(adminActor);
      expect(bankList.length).toBe(1);
      expect(bankList[0].question).toBe(question.question);

      // Editing the question in the quiz does not alter the question bank
      await service.updateQuestionSnapshot(adminActor, quiz.id, question.id, {
        question: "متن ویرایش‌شده در آزمون",
      });

      const bankItem = await service.listQuestionBank(adminActor);
      expect(bankItem[0].question).toContain("مهارکننده سنتز دیواره");
    });
  });

  describe("Public Quiz Taking & Answer Masking", () => {
    it("never exposes correctAnswer or explanation in public quiz payload", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون عمومی فارماکولوژی",
      });

      await service.addManualQuestion(adminActor, quiz.id, {
        question: "داروی خط اول درمان آنافیلاکسی چیست؟",
        choices: [
          { id: "1", text: "اپی‌نفرین" },
          { id: "2", text: "دیفن هیدرامین" },
          { id: "3", text: "هیدروکورتیزون" },
          { id: "4", text: "سالبوتامول" },
        ],
        correctAnswer: { choiceId: "1" },
        explanation: "اپی‌نفرین با اثر بر گیرنده‌های آلفا و بتا سریع‌ترین اثر نجات‌بخش را دارد.",
      });

      // While in draft, public quiz is not accessible
      await expect(service.getPublicQuizBySlug(quiz.slug)).rejects.toThrowError(
        DomainError,
      );

      // Publish quiz
      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      const publicPayload = await service.getPublicQuizBySlug(quiz.slug);
      expect(publicPayload.title).toBe(quiz.title);
      expect(publicPayload.questions.length).toBe(1);

      // CRITICAL: verify correctAnswer and explanation do NOT exist on the question
      const q = publicPayload.questions[0] as unknown as Record<string, unknown>;
      expect(q["correctAnswer"]).toBeUndefined();
      expect(q["explanation"]).toBeUndefined();
      expect(q["choices"]).toBeDefined();
    });

    it("evaluates answers in backend and calculates accurate score", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون سنجش اطلاعات دارویی",
      });

      const q1 = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال ۱",
        choices: [
          { id: "c1", text: "درست" },
          { id: "c2", text: "غلط" },
        ],
        correctAnswer: { choiceId: "c1" },
      });

      const q2 = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال ۲",
        choices: [
          { id: "c1", text: "درست" },
          { id: "c2", text: "غلط" },
        ],
        correctAnswer: { choiceId: "c2" },
      });

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      // Participant answers q1 correctly, q2 incorrectly
      const result = await service.submitQuizAttempt(quiz.slug, {
        answers: {
          [q1.id]: "c1",
          [q2.id]: "c1", // wrong
        },
      });

      expect(result.score).toBe(50);
      expect(result.correctCount).toBe(1);
      expect(result.wrongCount).toBe(1);
      expect(result.totalQuestions).toBe(2);
      expect(result.attemptToken).toBeDefined();

      // Retrieve result via attemptToken
      const lookedUp = await service.getAttemptResult(result.attemptToken);
      expect(lookedUp.score).toBe(50);
      expect(lookedUp.correctCount).toBe(1);
    });

    it("sanitizes answers: purges invalid question IDs and extra malicious keys before storing in DB", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون اعتبارسنجی ورودی",
      });

      const q1 = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال استاندارد",
        choices: [
          { id: "opt1", text: "صحیح" },
          { id: "opt2", text: "غلط" },
        ],
        correctAnswer: { choiceId: "opt1" },
      });

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      const result = await service.submitQuizAttempt(quiz.slug, {
        answers: {
          [q1.id]: "opt1",
          "fake-non-existent-question": "optX",
          "injection_key": "some_payload",
        },
      });

      expect(result.score).toBe(100);
      expect(result.correctCount).toBe(1);

      // Verify the saved attempt in store strictly does NOT contain fake keys
      const savedAttempt = await attemptStore.getByToken(result.attemptToken);
      expect(savedAttempt?.answers[q1.id]).toBe("opt1");
      expect(savedAttempt?.answers["fake-non-existent-question"]).toBeUndefined();
      expect(savedAttempt?.answers["injection_key"]).toBeUndefined();
    });

    it("throws not_found when looking up an invalid attempt token", async () => {
      await expect(
        service.getAttemptResult("completely-non-existent-attempt-token"),
      ).rejects.toThrowError(DomainError);
    });

    it("supports idempotency key to prevent double submissions", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون آیدمپوتنت",
      });

      const q1 = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال تست",
        choices: [
          { id: "c1", text: "الف" },
          { id: "c2", text: "ب" },
        ],
        correctAnswer: { choiceId: "c1" },
      });

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      const idempotencyKey = "client-unique-request-12345";
      const firstSubmit = await service.submitQuizAttempt(quiz.slug, {
        idempotencyKey,
        answers: { [q1.id]: "c1" },
      });

      // Second identical submit with same idempotencyKey
      const secondSubmit = await service.submitQuizAttempt(quiz.slug, {
        idempotencyKey,
        answers: { [q1.id]: "c1" },
      });

      // Must return identical attemptToken and NOT duplicate records
      expect(secondSubmit.attemptToken).toBe(firstSubmit.attemptToken);
      expect(await attemptStore.countByQuiz(quiz.id)).toBe(1);
    });

    it("maintains idempotency during concurrent identical submissions", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون آیدمپوتنت همزمان",
      });

      const q = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال",
        choices: [{ id: "1", text: "الف" }],
        correctAnswer: { choiceId: "1" },
      });

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      const idempotencyKey = "concurrent-idem-key-777";
      const [res1, res2] = await Promise.all([
        service.submitQuizAttempt(quiz.slug, { idempotencyKey, answers: { [q.id]: "1" } }),
        service.submitQuizAttempt(quiz.slug, { idempotencyKey, answers: { [q.id]: "1" } }),
      ]);

      expect(res1.attemptToken).toBe(res2.attemptToken);
      expect(await attemptStore.countByQuiz(quiz.id)).toBe(1);
    });

    it("keeps previous attempts viewable when quiz is disabled, but blocks new attempts", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون غیرفعال شونده",
      });

      const q = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال",
        choices: [{ id: "1", text: "الف" }],
        correctAnswer: { choiceId: "1" },
      });

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      const submit = await service.submitQuizAttempt(quiz.slug, {
        answers: { [q.id]: "1" },
      });

      // Disable quiz
      await service.updateQuiz(adminActor, quiz.id, { status: "disabled" });

      // New attempt must be blocked
      await expect(
        service.submitQuizAttempt(quiz.slug, { answers: { [q.id]: "1" } }),
      ).rejects.toThrowError(DomainError);

      // Existing attempt result must remain viewable
      const previousResult = await service.getAttemptResult(submit.attemptToken);
      expect(previousResult.score).toBe(100);
    });
  });

  describe("Draft Quiz Preview & Evaluation", () => {
    it("allows authorized creator / org admin to load draft quiz with preview=true and includes id & isPreview", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون پیش‌نویس ارگ الف",
        organizationId: orgIdA,
      });

      await service.addManualQuestion(orgAdminA, quiz.id, {
        question: "سؤال آزمایشی پیش‌نویس",
        choices: [
          { id: "1", text: "گزینه ۱" },
          { id: "2", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "1" },
        explanation: "پاسخ تشریحی مخفی",
      });

      // Fetch with preview=true as authorized org admin
      const previewPayload = await service.getPublicQuizBySlug(quiz.slug, orgAdminA, true);
      expect(previewPayload.title).toBe("آزمون پیش‌نویس ارگ الف");
      expect(previewPayload.id).toBe(quiz.id);
      expect(previewPayload.isPreview).toBe(true);
      expect(previewPayload.questions.length).toBe(1);

      // Verify answers and canViewAnswerKey are granted to authorized org admin in preview
      expect(previewPayload.canViewAnswerKey).toBe(true);
      const q = previewPayload.questions[0] as unknown as Record<string, unknown>;
      expect(q["correctAnswer"]).toEqual({ choiceId: "1" });
      expect(q["explanation"]).toBe("پاسخ تشریحی مخفی");

      // Platform admin can also preview
      const adminPreview = await service.getPublicQuizBySlug(quiz.slug, adminActor, true);
      expect(adminPreview.id).toBe(quiz.id);

      // Content worker of same org can also preview
      const workerPreview = await service.getPublicQuizBySlug(quiz.slug, contentWorkerA, true);
      expect(workerPreview.id).toBe(quiz.id);
    });

    it("rejects draft quiz access if preview=false or omitted even if user is the creator", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون پیش‌نویس بدون پارامتر",
        organizationId: orgIdA,
      });

      // No preview flag passed (default false)
      await expect(service.getPublicQuizBySlug(quiz.slug, orgAdminA, false)).rejects.toThrowError(
        DomainError,
      );
      await expect(service.getPublicQuizBySlug(quiz.slug)).rejects.toThrowError(DomainError);
    });

    it("rejects draft quiz access if preview=true but actor is guest or unauthorized student", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون پیش‌نویس مهمان",
        organizationId: orgIdA,
      });

      // Guest (no actor)
      await expect(service.getPublicQuizBySlug(quiz.slug, undefined, true)).rejects.toThrowError(
        DomainError,
      );

      // Student actor
      await expect(service.getPublicQuizBySlug(quiz.slug, studentActor, true)).rejects.toThrowError(
        DomainError,
      );
    });

    it("rejects draft quiz access if actor belongs to a different organization (multi-tenant safety)", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون ارگ الف برای بررسی ارگ ب",
        organizationId: orgIdA,
      });

      // Org B admin trying to preview Org A draft quiz
      await expect(service.getPublicQuizBySlug(quiz.slug, orgAdminB, true)).rejects.toThrowError(
        DomainError,
      );
      try {
        await service.getPublicQuizBySlug(quiz.slug, orgAdminB, true);
      } catch (err) {
        expect((err as DomainError).code).toBe("forbidden");
      }
    });

    it("blocks disabled quiz even when preview=true is passed", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون غیرفعال شده",
        organizationId: orgIdA,
      });
      await service.updateQuiz(orgAdminA, quiz.id, { status: "disabled" });

      await expect(service.getPublicQuizBySlug(quiz.slug, orgAdminA, true)).rejects.toThrowError(
        DomainError,
      );
      try {
        await service.getPublicQuizBySlug(quiz.slug, orgAdminA, true);
      } catch (err) {
        expect((err as DomainError).code).toBe("bad_request");
      }
    });

    it("evaluates draft quiz preview attempts without saving to attempt store or modifying quiz stats and sets isDraftPreview: true", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون ارزیابی پیش‌نمایش",
        organizationId: orgIdA,
      });

      const q1 = await service.addManualQuestion(orgAdminA, quiz.id, {
        question: "سؤال اول",
        choices: [
          { id: "c1", text: "گزینه ۱" },
          { id: "c2", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "c1" },
      });

      const q2 = await service.addManualQuestion(orgAdminA, quiz.id, {
        question: "سؤال دوم",
        choices: [
          { id: "c1", text: "گزینه ۱" },
          { id: "c2", text: "گزینه ۲" },
        ],
        correctAnswer: { choiceId: "c2" },
      });

      // Submit attempt in preview mode
      const result = await service.submitQuizAttempt(
        quiz.slug,
        {
          answers: {
            [q1.id]: "c1", // correct
            [q2.id]: "c1", // wrong
          },
        },
        undefined,
        orgAdminA,
        true,
      );

      // Verify accurate evaluation and internal flag
      expect(result.score).toBe(50);
      expect(result.correctCount).toBe(1);
      expect(result.wrongCount).toBe(1);
      expect(result.totalQuestions).toBe(2);
      expect(result.isDraftPreview).toBe(true);

      // Verify NO record was written to the attempt store
      const attemptCount = await attemptStore.countByQuiz(quiz.id);
      expect(attemptCount).toBe(0);

      // Verify quiz statistics were NOT altered
      const allAttempts = await attemptStore.listByQuiz(quiz.id);
      expect(allAttempts.length).toBe(0);
    });

    it("published quiz with preview=true behaves strictly as a normal public quiz (no isPreview flag, saves attempt)", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون منتشر شده عمومی",
        organizationId: orgIdA,
      });

      const q = await service.addManualQuestion(orgAdminA, quiz.id, {
        question: "سؤال پابلیک",
        choices: [
          { id: "opt1", text: "الف" },
          { id: "opt2", text: "ب" },
        ],
        correctAnswer: { choiceId: "opt1" },
      });

      await service.updateQuiz(orgAdminA, quiz.id, { status: "published" });

      // 1. GET with preview=true on published quiz must NOT set isPreview or id
      const publicPayload = await service.getPublicQuizBySlug(quiz.slug, undefined, true);
      expect(publicPayload.title).toBe("آزمون منتشر شده عمومی");
      expect(publicPayload.isPreview).toBeUndefined();
      expect(publicPayload.id).toBeUndefined();

      // 2. POST with preview=true on published quiz must record REAL attempt and NOT set isDraftPreview
      const result = await service.submitQuizAttempt(
        quiz.slug,
        { answers: { [q.id]: "opt1" } },
        undefined,
        undefined,
        true, // preview=true passed by public user
      );
      expect(result.score).toBe(100);
      expect(result.isDraftPreview).toBeUndefined();

      // Must be saved in attemptStore!
      expect(await attemptStore.countByQuiz(quiz.id)).toBe(1);
    });

    it("rejects preview attempt if actor is not authorized or from another organization", async () => {
      const quiz = await service.createQuiz(orgAdminA, {
        title: "آزمون پیش‌نمایش غیرمجاز",
        organizationId: orgIdA,
      });

      // No actor
      await expect(
        service.submitQuizAttempt(quiz.slug, { answers: {} }, undefined, undefined, true),
      ).rejects.toThrowError(DomainError);

      // Student actor
      await expect(
        service.submitQuizAttempt(quiz.slug, { answers: {} }, undefined, studentActor, true),
      ).rejects.toThrowError(DomainError);

      // Cross-organization admin
      await expect(
        service.submitQuizAttempt(quiz.slug, { answers: {} }, undefined, orgAdminB, true),
      ).rejects.toThrowError(DomainError);
    });
  });

  describe("Analytics & Statistics", () => {
    it("accurately calculates total attempts via countByQuiz even with > 1000 records", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون پرتعداد",
      });

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      // Simulate 1,050 attempts in attemptStore
      for (let i = 0; i < 1050; i++) {
        await attemptStore.create({
          marketingQuizId: quiz.id,
          attemptToken: `token-${i}`,
          idempotencyKey: null,
          userId: null,
          status: "completed",
          score: 80,
          correctCount: 4,
          wrongCount: 1,
          totalQuestions: 5,
          answers: {},
          questionSnapshots: [],
        });
      }

      const analytics = await service.getQuizAnalytics(adminActor, quiz.id);
      expect(analytics.totalAttempts).toBe(1050);
      expect(analytics.averageScore).toBe(80);
    });
  });

  describe("Gemini AI Service Error Handling", () => {
    it("properly catches and transforms invalid JSON from model into DomainError", async () => {
      const mockGateway: ModelGateway = {
        complete: async (_req: CompletionRequest): Promise<CompletionResponse> => {
          return {
            text: "متاسفانه نمی‌توانم این درخواست را پردازش کنم. (پاسخ غیر از JSON)",
            usage: { promptTokens: 10, outputTokens: 10, totalTokens: 20 },
            model: "gemini-1.5-pro",
            finishReason: "STOP",
          };
        },
      };

      const aiService = new StudioAiService(mockGateway);

      await expect(
        aiService.generateQuestions({
          topic: "تداخلات دارویی",
          questionType: "drug_interactions",
          difficulty: "medium",
          count: 2,
        }),
      ).rejects.toThrowError(DomainError);
    });
  });

  describe("Final Security Audit Remediations", () => {
    it("1. allows the same idempotency key across two independent quizzes without collision", async () => {
      const quiz1 = await service.createQuiz(adminActor, { title: "آزمون مستقل ۱" });
      const q1 = await service.addManualQuestion(adminActor, quiz1.id, {
        question: "سؤال ۱",
        choices: [{ id: "c1", text: "الف" }],
        correctAnswer: { choiceId: "c1" },
      });
      await service.updateQuiz(adminActor, quiz1.id, { status: "published" });

      const quiz2 = await service.createQuiz(adminActor, { title: "آزمون مستقل ۲" });
      const q2 = await service.addManualQuestion(adminActor, quiz2.id, {
        question: "سؤال ۲",
        choices: [{ id: "c2", text: "ب" }],
        correctAnswer: { choiceId: "c2" },
      });
      await service.updateQuiz(adminActor, quiz2.id, { status: "published" });

      const sharedKey = "cross-quiz-shared-idempotency-key";

      const res1 = await service.submitQuizAttempt(quiz1.slug, {
        idempotencyKey: sharedKey,
        answers: { [q1.id]: "c1" },
      });

      const res2 = await service.submitQuizAttempt(quiz2.slug, {
        idempotencyKey: sharedKey,
        answers: { [q2.id]: "c2" },
      });

      expect(res1.quizTitle).toBe("آزمون مستقل ۱");
      expect(res2.quizTitle).toBe("آزمون مستقل ۲");
      expect(res1.attemptToken).not.toBe(res2.attemptToken);
      expect(await attemptStore.countByQuiz(quiz1.id)).toBe(1);
      expect(await attemptStore.countByQuiz(quiz2.id)).toBe(1);
    });

    it("2. handles concurrent submissions across two independent service instances sharing store", async () => {
      const quiz = await service.createQuiz(adminActor, { title: "آزمون همزمانی دو اینستنس" });
      const q = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال همزمانی",
        choices: [{ id: "1", text: "الف" }],
        correctAnswer: { choiceId: "1" },
      });
      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      // Service instance 2 sharing the same underlying stores
      const service2 = new StudioService(quizStore, bankStore, attemptStore, undefined, orgStore);

      const idemKey = "multi-instance-idem-key-888";
      const [resA, resB] = await Promise.all([
        service.submitQuizAttempt(quiz.slug, { idempotencyKey: idemKey, answers: { [q.id]: "1" } }),
        service2.submitQuizAttempt(quiz.slug, { idempotencyKey: idemKey, answers: { [q.id]: "1" } }),
      ]);

      expect(resA.attemptToken).toBe(resB.attemptToken);
      expect(await attemptStore.countByQuiz(quiz.id)).toBe(1);
    });

    it("3. DrizzleMarketingQuizAttemptStore recovers and returns existing attempt on 23505 unique error for uq_marketing_quiz_attempts_quiz_idempotency", async () => {
      const existingAttempt = {
        id: "existing-uuid-1",
        marketingQuizId: "quiz-123",
        attemptToken: "token-already-saved",
        idempotencyKey: "duplicate-key-456",
        userId: null,
        status: "completed",
        score: "100.00",
        correctCount: 1,
        wrongCount: 0,
        totalQuestions: 1,
        answers: {},
        questionSnapshots: [],
        startedAt: new Date(),
        completedAt: new Date(),
      };

      const mockDb: any = {
        insert: () => ({
          values: () => ({
            returning: () => Promise.reject({
              code: "23505",
              constraint: "uq_marketing_quiz_attempts_quiz_idempotency",
              message: 'duplicate key value violates unique constraint "uq_marketing_quiz_attempts_quiz_idempotency"',
            }),
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([existingAttempt]),
            }),
          }),
        }),
      };

      const drizzleStore = new DrizzleMarketingQuizAttemptStore(mockDb);
      const result = await drizzleStore.create({
        marketingQuizId: "quiz-123",
        attemptToken: "new-token-attempted",
        idempotencyKey: "duplicate-key-456",
        userId: null,
        status: "completed",
        score: 100,
        correctCount: 1,
        wrongCount: 0,
        totalQuestions: 1,
        answers: {},
        questionSnapshots: [],
      });

      expect(result.attemptToken).toBe("token-already-saved");
      expect(result.id).toBe("existing-uuid-1");
    });

    it("4. DrizzleMarketingQuizAttemptStore re-throws 23505 error when caused by attempt_token (not idempotency)", async () => {
      const mockDb: any = {
        insert: () => ({
          values: () => ({
            returning: () => Promise.reject({
              code: "23505",
              constraint: "marketing_quiz_attempts_attempt_token_key",
              message: 'duplicate key value violates unique constraint "marketing_quiz_attempts_attempt_token_key"',
            }),
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        }),
      };

      const drizzleStore = new DrizzleMarketingQuizAttemptStore(mockDb);
      await expect(
        drizzleStore.create({
          marketingQuizId: "quiz-123",
          attemptToken: "colliding-token",
          idempotencyKey: "some-key",
          userId: null,
          status: "completed",
          score: 100,
          correctCount: 1,
          wrongCount: 0,
          totalQuestions: 1,
          answers: {},
          questionSnapshots: [],
        }),
      ).rejects.toThrow();
    });

    it("5. DrizzleMarketingQuizAttemptStore re-throws genuine non-unique database errors", async () => {
      const mockDb: any = {
        insert: () => ({
          values: () => ({
            returning: () => Promise.reject(new Error("Database connection timeout")),
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([]),
            }),
          }),
        }),
      };

      const drizzleStore = new DrizzleMarketingQuizAttemptStore(mockDb);
      await expect(
        drizzleStore.create({
          marketingQuizId: "quiz-123",
          attemptToken: "any-token",
          idempotencyKey: "any-key",
          userId: null,
          status: "completed",
          score: 100,
          correctCount: 1,
          wrongCount: 0,
          totalQuestions: 1,
          answers: {},
          questionSnapshots: [],
        }),
      ).rejects.toThrow("Database connection timeout");
    });

    it("6. prevents adding Question Bank question from Org B into Quiz of Org A", async () => {
      const quizA = await service.createQuiz(orgAdminA, {
        title: "آزمون سازمان آلفا",
        organizationId: "org-a",
      });

      const bankB = await service.createQuestionBankItem(orgAdminB, {
        organizationId: "org-b",
        question: "سؤال محرمانه سازمان بتا",
        choices: [{ id: "1", text: "گزینه ۱" }, { id: "2", text: "گزینه ۲" }],
        correctAnswer: { choiceId: "1" },
        sourceType: "manual",
        sourceQuestionId: null,
        sourceCourseId: null,
        explanation: null,
        difficulty: "medium",
        topic: null,
        questionType: "multiple_choice",
        tags: [],
      });

      await expect(
        service.addQuestionFromBank(orgAdminA, quizA.id, bankB.id),
      ).rejects.toThrowError(DomainError);
    });

    it("7. denies Studio access for members of soft-deleted organizations", async () => {
      const deletedOrgId = asOrganizationId("org-deleted");
      orgStore.addOrganization({
        id: deletedOrgId,
        name: "Deleted Org",
        slug: "deleted-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(),
      });

      orgStore.addMembership({
        id: "mem-del",
        organizationId: deletedOrgId,
        userId: asUserId("user-del"),
        role: "organization_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const userDelActor: Actor = {
        userId: asUserId("user-del"),
        email: "del@test.com",
        role: "organization_admin",
        memberships: [{ organizationId: deletedOrgId, role: "organization_admin" }],
      };

      await expect(
        service.assertStudioAccess(userDelActor, deletedOrgId),
      ).rejects.toThrow("سازمان مورد نظر غیرفعال یا حذف شده است.");
    });

    it("8. AttemptRateLimiter correctly prunes expired records when capacity is reached", () => {
      const limiter = new AttemptRateLimiter(10, 60_000, 2);
      try {
        // Manually populate 1 active and 1 expired record
        const store = (limiter as any).store as Map<string, { count: number; resetAt: number }>;
        store.set("active_key", { count: 3, resetAt: Date.now() + 60_000 });
        store.set("expired_key", { count: 5, resetAt: Date.now() - 5000 });

        expect(limiter.size).toBe(2);

        // When a new key arrives at full capacity, pruneExpired prunes the expired entry
        limiter.record("new_key");

        expect(store.has("expired_key")).toBe(false);
        expect(store.has("active_key")).toBe(true);
        expect(store.has("new_key")).toBe(true);
        expect(limiter.size).toBe(2);
      } finally {
        limiter.destroy();
      }
    });

    it("9. AttemptRateLimiter does NOT evict active blocked records to make room for new keys", () => {
      const maxCapacity = 3;
      const limiter = new AttemptRateLimiter(10, 60_000, maxCapacity);
      try {
        const store = (limiter as any).store as Map<string, { count: number; resetAt: number }>;
        // Fill capacity with 3 active BLOCKED records (count >= 10)
        store.set("blocked_ip_1", { count: 10, resetAt: Date.now() + 50_000 });
        store.set("blocked_ip_2", { count: 12, resetAt: Date.now() + 50_000 });
        store.set("blocked_ip_3", { count: 15, resetAt: Date.now() + 50_000 });

        expect(limiter.size).toBe(3);

        // Flooding with new keys must NOT evict blocked IPs
        for (let i = 0; i < 20; i++) {
          limiter.record(`attacker_random_key_${i}`);
        }

        // All 3 blocked IPs must strictly remain in store and remain blocked
        expect(store.has("blocked_ip_1")).toBe(true);
        expect(store.has("blocked_ip_2")).toBe(true);
        expect(store.has("blocked_ip_3")).toBe(true);
        expect(limiter.checkLimit("blocked_ip_1")).toBe(true);
        expect(limiter.checkLimit("blocked_ip_2")).toBe(true);
        expect(limiter.checkLimit("blocked_ip_3")).toBe(true);
      } finally {
        limiter.destroy();
      }
    });

    it("10. AttemptRateLimiter fails closed for new keys when capacity is completely saturated with active blocked entries", () => {
      const maxCapacity = 2;
      const limiter = new AttemptRateLimiter(10, 60_000, maxCapacity);
      try {
        const store = (limiter as any).store as Map<string, { count: number; resetAt: number }>;
        // Saturated with active blocked entries
        store.set("blocked_1", { count: 10, resetAt: Date.now() + 60_000 });
        store.set("blocked_2", { count: 10, resetAt: Date.now() + 60_000 });

        // A new incoming key cannot allocate space and fails closed (returns true -> 429)
        const isLimited = limiter.checkLimit("brand_new_incoming_user");
        expect(isLimited).toBe(true);
      } finally {
        limiter.destroy();
      }
    });

    it("11. cleans up inFlightAttempts when database throws an error, allowing subsequent retry", async () => {
      const quiz = await service.createQuiz(adminActor, { title: "آزمون تلاش مجدد پس از خطا" });
      const q = await service.addManualQuestion(adminActor, quiz.id, {
        question: "سؤال ۱",
        choices: [{ id: "1", text: "الف" }],
        correctAnswer: { choiceId: "1" },
      });
      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      const idemKey = "retry-after-failure-key-999";

      // Mock attemptStore.create to throw on first attempt
      const originalCreate = attemptStore.create.bind(attemptStore);
      let failedOnce = false;
      attemptStore.create = async (attempt) => {
        if (!failedOnce) {
          failedOnce = true;
          throw new Error("Simulated database failure during attempt insert");
        }
        return originalCreate(attempt);
      };

      // First call throws
      await expect(
        service.submitQuizAttempt(quiz.slug, { idempotencyKey: idemKey, answers: { [q.id]: "1" } }),
      ).rejects.toThrow("Simulated database failure during attempt insert");

      // Verify second call with same idempotency key succeeds, proving inFlightAttempts was evicted
      const retryResult = await service.submitQuizAttempt(quiz.slug, {
        idempotencyKey: idemKey,
        answers: { [q.id]: "1" },
      });
      expect(retryResult.attemptToken).toBeDefined();
      expect(retryResult.score).toBe(100);
    });
  });

  describe("Unified Question Bank & Batch Import", () => {
    it("1. normalizeQuestionPayload normalizes string[] choices and diverse correct answers", () => {
      const normalized = service.normalizeQuestionPayload({
        question: "  سؤال تستی نرمال‌سازی   ",
        choices: ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم"],
        correctAnswer: 2,
        explanation: "  توضیح تستی  ",
        difficulty: "hard",
        topic: "فارماکولوژی",
        questionType: "conceptual",
      });

      expect(normalized.question).toBe("سؤال تستی نرمال‌سازی");
      expect(normalized.choices).toEqual([
        { id: "1", text: "گزینه اول" },
        { id: "2", text: "گزینه دوم" },
        { id: "3", text: "گزینه سوم" },
        { id: "4", text: "گزینه چهارم" },
      ]);
      expect(normalized.correctAnswer).toEqual({ choiceId: "2" });
      expect(normalized.explanation).toBe("توضیح تستی");
      expect(normalized.difficulty).toBe("hard");
      expect(normalized.topic).toBe("فارماکولوژی");
      expect(normalized.questionType).toBe("conceptual");
    });

    it("2. searches available questions across bank with deduplication", async () => {
      const bankItem = await service.createQuestionBankItem(adminActor, {
        question: "داروی انتخابی در درمان شوک آنافیلاکسی چیست؟",
        choices: [
          { id: "1", text: "اپی‌نفرین" },
          { id: "2", text: "آتروپین" },
        ],
        correctAnswer: { choiceId: "1" },
        topic: "اورژانس",
        difficulty: "medium",
        questionType: "clinical_pharmacology",
        tags: [],
        createdBy: adminActor.userId,
      });

      const res = await service.searchAvailableQuestions(adminActor, {
        search: "آنافیلاکسی",
        limit: 10,
      });

      expect(res.questions.length).toBeGreaterThanOrEqual(1);
      expect(res.questions[0].question).toContain("آنافیلاکسی");
      expect(res.questions[0].sourceId).toBe(bankItem.id);
    });

    it("3. batch adds questions into quiz as independent immutable snapshots", async () => {
      const quiz = await service.createQuiz(adminActor, { title: "آزمون بچ ایمپورت" });

      const bankItem = await service.createQuestionBankItem(adminActor, {
        question: "سؤال بانکی شماره ۱",
        choices: [
          { id: "1", text: "الف" },
          { id: "2", text: "ب" },
        ],
        correctAnswer: { choiceId: "1" },
        difficulty: "easy",
        createdBy: adminActor.userId,
      });

      const batchResult = await service.addQuestionsBatch(adminActor, quiz.id, [
        {
          sourceType: "bank",
          sourceId: bankItem.id,
        },
        {
          sourceType: "manual",
          question: "سؤال دستی مستقیم",
          choices: [
            { id: "1", text: "یک" },
            { id: "2", text: "دو" },
          ],
          correctAnswer: { choiceId: "2" },
        },
      ]);

      expect(batchResult.addedCount).toBe(2);
      expect(batchResult.questions.length).toBe(2);
      expect(batchResult.questions[0].sourceBankQuestionId).toBe(bankItem.id);
      expect(batchResult.questions[1].question).toBe("سؤال دستی مستقیم");

      // Verify Snapshot isolation: modifying question snapshot in quiz does NOT alter bank item
      const snapshotId = batchResult.questions[0].id;
      await service.updateQuestionSnapshot(adminActor, quiz.id, snapshotId, {
        question: "متن تغییریافته در آزمون مقصد",
      });

      const originalBankItem = await bankStore.getById(bankItem.id);
      expect(originalBankItem?.question).toBe("سؤال بانکی شماره ۱");

      // Verify Snapshot isolation: deleting question snapshot from quiz does NOT delete bank item
      await service.deleteQuestionSnapshot(adminActor, quiz.id, snapshotId);
      const remainingQuizQuestions = await quizStore.getQuestions(quiz.id);
      expect(remainingQuizQuestions.length).toBe(1);

      const stillExistingBankItem = await bankStore.getById(bankItem.id);
      expect(stillExistingBankItem).not.toBeNull();
      expect(stillExistingBankItem?.deletedAt).toBeNull();
    });
  });

  describe("Comprehensive 12-Scenario Validation Suite", () => {
    it("Scenario 1: Question transfer with option text correctly resolves choice ID", () => {
      const normalized = service.normalizeQuestionPayload({
        question: "داروی خط اول دیابت نوع ۲ چیست؟",
        choices: ["گلی‌بن‌کلامید", "متفورمین", "انسولین", "پیوگلیتازون"],
        correctAnswer: "متفورمین",
      });

      expect(normalized.choices[1].text).toBe("متفورمین");
      expect(normalized.correctAnswer).toEqual({ choiceId: "2" });
    });

    it("Scenario 2: Question transfer with existing choice ID preserves choice ID", () => {
      const normalized = service.normalizeQuestionPayload({
        question: "آزمون با شناسه از پیش تعیین‌شده",
        choices: [
          { id: "choice_a", text: "گزینه الف" },
          { id: "choice_b", text: "گزینه ب" },
        ],
        correctAnswer: { choiceId: "choice_b" },
      });

      expect(normalized.correctAnswer).toEqual({ choiceId: "choice_b" });
    });

    it("Scenario 3: Question transfer with Persian letters strictly respects choice order", () => {
      const choices = ["پنی‌سیلین", "سفتریاکسون", "وانکومایسین", "آزیترومایسین"];

      const qAlef = service.normalizeQuestionPayload({
        question: "سؤال الف",
        choices,
        correctAnswer: "الف",
      });
      expect(qAlef.correctAnswer).toEqual({ choiceId: "1" });

      const qJim = service.normalizeQuestionPayload({
        question: "سؤال ج",
        choices,
        correctAnswer: "ج",
      });
      expect(qJim.correctAnswer).toEqual({ choiceId: "3" });
    });

    it("Scenario 4: Question transfer with English letters strictly respects choice order", () => {
      const choices = ["Alpha", "Beta", "Gamma", "Delta"];

      const qB = service.normalizeQuestionPayload({
        question: "Question B",
        choices,
        correctAnswer: "B",
      });
      expect(qB.correctAnswer).toEqual({ choiceId: "2" });

      const qD = service.normalizeQuestionPayload({
        question: "Question D",
        choices,
        correctAnswer: "d",
      });
      expect(qD.correctAnswer).toEqual({ choiceId: "4" });
    });

    it("Scenario 5: Multi-select question transfer preserves all correct choices", () => {
      const normalized = service.normalizeQuestionPayload({
        question: "کدام داروها مهارکننده بتا هستند؟",
        choices: ["متوپرولول", "آتنولول", "لوزارتان", "آملودیپین"],
        correctAnswer: ["متوپرولول", "آتنولول"],
        questionType: "multi_select",
      });

      expect(normalized.questionType).toBe("multi_select");
      expect(normalized.correctAnswer).toEqual({
        choiceId: "1",
        choiceIds: ["1", "2"],
      });
    });

    it("Scenario 6: True/False question transfer explicitly maps boolean answer", () => {
      const qTrue = service.normalizeQuestionPayload({
        question: "آسپرین ضدپلاکت است.",
        choices: ["درست", "نادرست"],
        correctAnswer: true,
        questionType: "true_false",
      });

      expect(qTrue.correctAnswer).toEqual({
        choiceId: "1",
        booleanAnswer: true,
      });

      const qFalse = service.normalizeQuestionPayload({
        question: "متفورمین باعث هیپوگلیسمی شدید می‌شود.",
        choices: ["درست", "نادرست"],
        correctAnswer: "نادرست",
        questionType: "true_false",
      });

      expect(qFalse.correctAnswer).toEqual({
        choiceId: "2",
        booleanAnswer: false,
      });
    });

    it("Scenario 7: Ambiguous or invalid answer does NOT arbitrarily assign to option 1", () => {
      const qAmbiguous = service.normalizeQuestionPayload({
        question: "سؤال با پاسخ مبهم",
        choices: ["گزینه اول", "گزینه دوم"],
        correctAnswer: "گزینه کاملاً ناموجود و بی‌ربط",
      });

      expect(qAmbiguous.correctAnswer).toEqual({
        choiceId: null,
        ambiguous: true,
        raw: "گزینه کاملاً ناموجود و بی‌ربط",
      });

      const qNull = service.normalizeQuestionPayload({
        question: "سؤال با پاسخ نال",
        choices: ["گزینه ۱", "گزینه ۲"],
        correctAnswer: null,
      });

      expect(qNull.correctAnswer).toEqual({
        choiceId: null,
        ambiguous: true,
        raw: null,
      });
    });

    it("Scenario 8: Save and reload quiz preserves question snapshots and correct answer mapping", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون ذخیره و بازخوانی",
        organizationId: "org-1",
      });

      const bankItem = await service.createQuestionBankItem(adminActor, {
        question: "سؤال بانکی با پاسخ متنی دقیق",
        choices: ["پاسخ غلط ۱", "پاسخ صحیح ۲", "پاسخ غلط ۳"],
        correctAnswer: "پاسخ صحیح ۲",
        topic: "فارما",
      });

      const addRes = await service.addQuestionsBatch(adminActor, quiz.id, [
        {
          sourceType: "bank",
          sourceId: bankItem.id,
        },
      ]);

      expect(addRes.addedCount).toBe(1);
      const reloadedQuiz = await service.getQuizById(adminActor, quiz.id);
      expect(reloadedQuiz.questions).toBeDefined();
      expect(reloadedQuiz.questions!.length).toBe(1);
      expect(reloadedQuiz.questions![0].correctAnswer).toEqual({ choiceId: "2" });
    });

    it("Scenario 9: Student answer scoring correctly evaluates answers across types", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون تصحیح نهایی",
        organizationId: "org-1",
      });

      const addRes = await service.addQuestionsBatch(adminActor, quiz.id, [
        {
          sourceType: "manual",
          question: "سؤال شماره ۱",
          choices: [
            { id: "1", text: "گزینه ۱" },
            { id: "2", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "2" },
        },
      ]);

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      // Student picks correct choice "2"
      const resCorrect = await service.submitQuizAttempt(quiz.slug, {
        answers: {
          [addRes.questions[0].id]: "2",
        },
      });
      expect(resCorrect.score).toBe(100);
      expect(resCorrect.correctCount).toBe(1);

      // Student picks wrong choice "1"
      const resWrong = await service.submitQuizAttempt(quiz.slug, {
        answers: {
          [addRes.questions[0].id]: "1",
        },
      });
      expect(resWrong.score).toBe(0);
      expect(resWrong.wrongCount).toBe(1);
    });

    it("Scenario 10: Public API masking strictly prevents leaking correctAnswer to participants", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون امنیت عمومی",
        organizationId: "org-1",
      });

      await service.addQuestionsBatch(adminActor, quiz.id, [
        {
          sourceType: "manual",
          question: "سؤال محرمانه",
          choices: [
            { id: "1", text: "پاسخ درست" },
            { id: "2", text: "پاسخ نادرست" },
          ],
          correctAnswer: { choiceId: "1" },
          explanation: "توضیحات نباید به دانشجو لو برود",
        },
      ]);

      await service.updateQuiz(adminActor, quiz.id, { status: "published" });

      // Public call without studio auth
      const publicData = await service.getPublicQuizBySlug(quiz.slug, null, false);
      const q = publicData.questions[0] as unknown as Record<string, unknown>;
      expect(q["correctAnswer"]).toBeUndefined();
      expect(q["explanation"]).toBeUndefined();
    });

    it("Scenario 11: Pagination with > 150 items accurately returns totals and page slices", async () => {
      // Seed 160 items in question bank store
      for (let i = 1; i <= 160; i++) {
        await bankStore.create({
          question: `سؤال بانک برای تست پیجینیشن شماره ${i}`,
          choices: [
            { id: "1", text: "گزینه ۱" },
            { id: "2", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "1" },
          sourceType: "manual",
          difficulty: "medium",
          questionType: "multiple_choice",
          tags: [],
          organizationId: "org-1",
        });
      }

      // Page 1 (limit 50, offset 0)
      const page1 = await service.searchAvailableQuestions(adminActor, {
        limit: 50,
        offset: 0,
        organizationId: "org-1",
      });
      expect(page1.total).toBeGreaterThanOrEqual(160);
      expect(page1.questions.length).toBe(50);

      // Page 4 (offset 150, limit 50) -> questions past 150
      const page4 = await service.searchAvailableQuestions(adminActor, {
        limit: 50,
        offset: 150,
        organizationId: "org-1",
      });
      expect(page4.total).toBe(page1.total);
      expect(page4.questions.length).toBeGreaterThanOrEqual(10);
    });

    it("Scenario 12: Selection retention across pages allows batch adding from multiple pages", async () => {
      const quiz = await service.createQuiz(adminActor, {
        title: "آزمون افزودن از چند صفحه",
        organizationId: "org-1",
      });

      // Ensure at least 4 items in bank for org-1
      for (let i = 1; i <= 4; i++) {
        await bankStore.create({
          question: `سؤال انتخابی برای سناریو ۱۲ شماره ${i}`,
          choices: [
            { id: "1", text: "گزینه ۱" },
            { id: "2", text: "گزینه ۲" },
          ],
          correctAnswer: { choiceId: "1" },
          sourceType: "manual",
          difficulty: "medium",
          questionType: "multiple_choice",
          tags: [],
          organizationId: "org-1",
        });
      }

      // Page 1 questions
      const page1Res = await service.searchAvailableQuestions(adminActor, {
        limit: 2,
        offset: 0,
        organizationId: "org-1",
      });
      expect(page1Res.questions.length).toBe(2);

      // Page 2 questions
      const page2Res = await service.searchAvailableQuestions(adminActor, {
        limit: 2,
        offset: 2,
        organizationId: "org-1",
      });
      expect(page2Res.questions.length).toBe(2);

      // User selects 1 from page 1, 1 from page 2
      const selected = [
        { sourceType: "bank" as const, sourceId: page1Res.questions[0].sourceId },
        { sourceType: "bank" as const, sourceId: page2Res.questions[0].sourceId },
      ];

      const batchAdd = await service.addQuestionsBatch(adminActor, quiz.id, selected);
      expect(batchAdd.addedCount).toBe(2);
      expect(batchAdd.questions.length).toBe(2);
    });
  });
});
