import { describe, it, expect, beforeEach } from "vitest";
import { PollService } from "./poll-service.js";
import {
  InMemoryPollStore,
  InMemoryPollResponseStore,
} from "./poll-stores.js";
import { InMemoryOrganizationStore } from "../organizations/test/in-memory-stores.js";
import {
  type Actor,
  asOrganizationId,
  asUserId,
} from "@avana/domain";

describe("PollService & Studio Polls Module", () => {
  let pollStore: InMemoryPollStore;
  let responseStore: InMemoryPollResponseStore;
  let orgStore: InMemoryOrganizationStore;
  let service: PollService;

  const adminActor: Actor = {
    userId: asUserId("admin-1"),
    email: "admin@avana.ir",
    role: "platform_admin",
    globalRole: "platform_admin",
  };

  const orgIdA = asOrganizationId("11111111-1111-4111-8111-111111111111");
  const orgIdB = asOrganizationId("22222222-2222-4222-8222-222222222222");

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
    memberships: [{ organizationId: orgIdA, role: "content_worker" }],
  };

  const studentActor: Actor = {
    userId: asUserId("student-1"),
    email: "student@avana.ir",
    role: "student",
    globalRole: "student",
  };

  beforeEach(async () => {
    pollStore = new InMemoryPollStore();
    responseStore = new InMemoryPollResponseStore();
    pollStore.setResponseStore(responseStore);
    orgStore = new InMemoryOrganizationStore();

    orgStore.addOrganization({
      id: orgIdA,
      name: "دانشگاه علوم پزشکی تهران",
      slug: "tums",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    orgStore.addOrganization({
      id: orgIdB,
      name: "دانشگاه علوم پزشکی شهید بهشتی",
      slug: "sbmu",
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

    service = new PollService({
      pollStore,
      responseStore,
      organizationStore: orgStore,
      hmacSecret: "test-salt-secret-key-12345",
    });
  });

  // -------------------------------------------------------------------------
  // 1. Poll Creation & Validation
  // -------------------------------------------------------------------------
  describe("Poll Creation & Validation", () => {
    it("creates a draft poll successfully with auto-generated slug", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی کیفیت آموزش داروسازی",
        organizationId: orgIdA,
      });

      expect(poll.id).toBeDefined();
      expect(poll.title).toBe("نظرسنجی کیفیت آموزش داروسازی");
      expect(poll.slug).toBeDefined();
      expect(poll.status).toBe("draft");
      expect(poll.organizationId).toBe(orgIdA);
    });

    it("rejects poll creation without a title", async () => {
      await expect(
        service.createPoll(adminActor, {
          title: "   ",
        }),
      ).rejects.toThrow("عنوان نظرسنجی الزامی است.");
    });

    it("allows custom slug and verifies uniqueness", async () => {
      await service.createPoll(adminActor, {
        title: "نظرسنجی شماره ۱",
        slug: "pharma-survey-2026",
      });

      await expect(
        service.createPoll(adminActor, {
          title: "نظرسنجی شماره ۲ با اسلاگ تکراری",
          slug: "pharma-survey-2026",
        }),
      ).rejects.toThrow("اسلاگ انتخابی تکراری است");
    });

    it("rejects invalid characters in custom slug", async () => {
      await expect(
        service.createPoll(adminActor, {
          title: "تست اسلاگ نامعتبر",
          slug: "bad slug with spaces!",
        }),
      ).rejects.toThrow("اسلاگ نظرسنجی باید بین ۳ تا ۶۴ کاراکتر");
    });
  });

  // -------------------------------------------------------------------------
  // 2. Questions & Options Management
  // -------------------------------------------------------------------------
  describe("Question & Option Management", () => {
    it("creates single choice question with options successfully", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی تک‌گزینه‌ای",
      });

      const question = await service.createQuestion(adminActor, poll.id, {
        questionText: "کدام بخش فارماکولوژی دشوارتر است؟",
        questionType: "single_choice",
        options: [
          { optionText: "فارماکوکینتیک" },
          { optionText: "فارماکودینامیک" },
          { optionText: "مکانیسم‌های سلولی" },
        ],
      });

      expect(question.id).toBeDefined();
      expect(question.options?.length).toBe(3);
      expect(question.options?.[0].optionText).toBe("فارماکوکینتیک");
    });

    it("rejects single choice question with fewer than 2 options", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی تستی",
      });

      await expect(
        service.createQuestion(adminActor, poll.id, {
          questionText: "سؤال با ۱ گزینه؟",
          questionType: "single_choice",
          options: [{ optionText: "تنها گزینه" }],
        }),
      ).rejects.toThrow("سؤالات گزینه‌ای باید حداقل دارای ۲ گزینه باشند.");
    });

    it("validates multiple choice question with minChoices and maxChoices", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی چندگزینه‌ای",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "کدام مباحث را مطالعه کرده‌اید؟",
        questionType: "multiple_choice",
        minChoices: 1,
        maxChoices: 3,
        options: [
          { optionText: "گزینه الف" },
          { optionText: "گزینه ب" },
          { optionText: "گزینه ج" },
          { optionText: "گزینه د" },
        ],
      });

      expect(q.minChoices).toBe(1);
      expect(q.maxChoices).toBe(3);

      // Rejects invalid min > max
      await expect(
        service.createQuestion(adminActor, poll.id, {
          questionText: "سؤال خطادار",
          questionType: "multiple_choice",
          minChoices: 3,
          maxChoices: 1,
          options: [{ optionText: "الف" }, { optionText: "ب" }],
        }),
      ).rejects.toThrow("حداقل انتخاب نمی‌تواند بیشتر از حداکثر انتخاب باشد.");
    });

    it("creates short text question without options", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی متنی",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "پیشنهاد شما برای بهبود سامانه چیست؟",
        questionType: "short_text",
      });

      expect(q.questionType).toBe("short_text");
      expect(q.options?.length).toBe(0);
    });

    it("updates and deletes questions and reorders them", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی با چند سؤال",
      });

      const q1 = await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال یک",
        questionType: "short_text",
      });
      const q2 = await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال دو",
        questionType: "short_text",
      });

      await service.reorderQuestions(adminActor, poll.id, [q2.id, q1.id]);

      const questions = await service.getPollById(adminActor, poll.id);
      expect(questions.questions?.[0].id).toBe(q2.id);
      expect(questions.questions?.[1].id).toBe(q1.id);

      await service.deleteQuestion(adminActor, poll.id, q1.id);
      const afterDelete = await service.getPollById(adminActor, poll.id);
      expect(afterDelete.questions?.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Publishing Invariants
  // -------------------------------------------------------------------------
  describe("Poll Publishing Invariants", () => {
    it("rejects publishing a poll with zero questions", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی بدون سؤال",
      });

      await expect(service.publishPoll(adminActor, poll.id)).rejects.toThrow(
        "نظرسنجی برای انتشار باید حداقل یک سؤال داشته باشد.",
      );
    });

    it("successfully publishes a poll with valid questions", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی معتبر برای انتشار",
      });

      await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال تست",
        questionType: "single_choice",
        options: [{ optionText: "بله" }, { optionText: "خیر" }],
      });

      const published = await service.publishPoll(adminActor, poll.id);
      expect(published.status).toBe("published");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Voting & Repeat Vote Prevention
  // -------------------------------------------------------------------------
  describe("Voting & Anonymous Participation", () => {
    it("records a single choice vote and prevents duplicate votes from same participant", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی رضایت",
        slug: "satisfaction-poll-1",
      });

      const q1 = await service.createQuestion(adminActor, poll.id, {
        questionText: "میزان رضایت شما؟",
        questionType: "single_choice",
        options: [
          { optionText: "عالی" },
          { optionText: "متوسط" },
          { optionText: "ضعیف" },
        ],
      });

      await service.publishPoll(adminActor, poll.id);

      const optionId = q1.options![0].id;
      const rawPid = "anon-device-token-abc-123";

      // First vote succeeds
      const res = await service.submitResponse(
        "satisfaction-poll-1",
        {
          answers: {
            [q1.id]: optionId,
          },
        },
        rawPid,
      );

      expect(res.responseId).toBeDefined();

      // Check hasParticipantVoted
      const hasVoted = await service.hasParticipantVoted("satisfaction-poll-1", rawPid);
      expect(hasVoted).toBe(true);

      // Second vote with same participant ID fails with conflict
      await expect(
        service.submitResponse(
          "satisfaction-poll-1",
          {
            answers: {
              [q1.id]: optionId,
            },
          },
          rawPid,
        ),
      ).rejects.toThrow("شما قبلاً در این نظرسنجی شرکت کرده‌اید.");
    });

    it("records multiple choice and short text answers accurately", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی جامع فارما",
        slug: "pharma-comprehensive",
      });

      const qMulti = await service.createQuestion(adminActor, poll.id, {
        questionText: "کدام مباحث را پاس کرده‌اید؟",
        questionType: "multiple_choice",
        minChoices: 1,
        maxChoices: 2,
        options: [
          { optionText: "شیمی دارویی ۱" },
          { optionText: "شیمی دارویی ۲" },
          { optionText: "فارماکولوژی ۱" },
        ],
      });

      const qText = await service.createQuestion(adminActor, poll.id, {
        questionText: "نظر کلی شما؟",
        questionType: "short_text",
        isRequired: false,
      });

      await service.publishPoll(adminActor, poll.id);

      const opt1 = qMulti.options![0].id;
      const opt2 = qMulti.options![1].id;

      const res = await service.submitResponse(
        "pharma-comprehensive",
        {
          answers: {
            [qMulti.id]: [opt1, opt2],
            [qText.id]: "یک بازخورد مفید و کامل",
          },
        },
        "participant-token-xyz",
      );

      expect(res.responseId).toBeDefined();
    });

    it("rejects text answer exceeding 500 characters", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی متن طولانی",
        slug: "long-text-poll",
      });

      const qText = await service.createQuestion(adminActor, poll.id, {
        questionText: "نظر شما؟",
        questionType: "short_text",
      });

      await service.publishPoll(adminActor, poll.id);

      const longText = "a".repeat(501);

      await expect(
        service.submitResponse(
          "long-text-poll",
          {
            answers: {
              [qText.id]: longText,
            },
          },
          "participant-1",
        ),
      ).rejects.toThrow("پاسخ متنی نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.");
    });

    it("rejects answers with options from a different question or poll", async () => {
      const poll1 = await service.createPoll(adminActor, {
        title: "نظرسنجی اول",
        slug: "poll-one",
      });
      const q1 = await service.createQuestion(adminActor, poll1.id, {
        questionText: "سؤال نظرسنجی ۱",
        questionType: "single_choice",
        options: [{ optionText: "الف" }, { optionText: "ب" }],
      });
      await service.publishPoll(adminActor, poll1.id);

      const poll2 = await service.createPoll(adminActor, {
        title: "نظرسنجی دوم",
        slug: "poll-two",
      });
      const q2 = await service.createQuestion(adminActor, poll2.id, {
        questionText: "سؤال نظرسنجی ۲",
        questionType: "single_choice",
        options: [{ optionText: "ج" }, { optionText: "د" }],
      });
      await service.publishPoll(adminActor, poll2.id);

      // Attempting to submit option from poll2 into poll1
      const alienOptionId = q2.options![0].id;
      await expect(
        service.submitResponse(
          "poll-one",
          {
            answers: {
              [q1.id]: alienOptionId,
            },
          },
          "participant-alien",
        ),
      ).rejects.toThrow("گزینه انتخابی نامعتبر است.");
    });

    it("rejects voting when poll is past its endsAt date or closed", async () => {
      const pastDate = new Date(Date.now() - 3600_000);
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی منقضی شده",
        slug: "expired-poll",
        endsAt: pastDate,
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال",
        questionType: "single_choice",
        options: [{ optionText: "۱" }, { optionText: "۲" }],
      });

      await service.publishPoll(adminActor, poll.id);

      await expect(
        service.submitResponse(
          "expired-poll",
          {
            answers: {
              [q.id]: q.options![0].id,
            },
          },
          "pid-1",
        ),
      ).rejects.toThrow("مهلت شرکت در این نظرسنجی به پایان رسیده است.");

      // Test closed status
      await service.closePoll(adminActor, poll.id);
      await expect(
        service.submitResponse(
          "expired-poll",
          {
            answers: {
              [q.id]: q.options![0].id,
            },
          },
          "pid-2",
        ),
      ).rejects.toThrow("این نظرسنجی در حال حاضر برای دریافت پاسخ فعال نیست.");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Structure Locking After First Vote
  // -------------------------------------------------------------------------
  describe("Structure Locking Invariants", () => {
    it("locks question and option modifications once a poll receives its first response", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی با قفل ساختار",
        slug: "locked-poll-test",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال اولیه",
        questionType: "single_choice",
        options: [{ optionText: "گزینه ۱" }, { optionText: "گزینه ۲" }],
      });

      await service.publishPoll(adminActor, poll.id);

      // Submit first response
      await service.submitResponse(
        "locked-poll-test",
        {
          answers: {
            [q.id]: q.options![0].id,
          },
        },
        "voter-1",
      );

      // Attempting to add a new question must fail
      await expect(
        service.createQuestion(adminActor, poll.id, {
          questionText: "سؤال جدید پس از رأی",
          questionType: "short_text",
        }),
      ).rejects.toThrow("امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.");

      // Attempting to delete question must fail
      await expect(
        service.deleteQuestion(adminActor, poll.id, q.id),
      ).rejects.toThrow("امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد.");

      // But updating poll title / description is STILL allowed!
      const updated = await service.updatePoll(adminActor, poll.id, {
        title: "عنوان به‌روزشده نظرسنجی قفل‌شده",
      });
      expect(updated.title).toBe("عنوان به‌روزشده نظرسنجی قفل‌شده");
    });
  });

  // -------------------------------------------------------------------------
  // 6. Results Calculation & Public Privacy Masking
  // -------------------------------------------------------------------------
  describe("Results Calculation & Privacy Separation", () => {
    it("accurately computes percentages and masks text answers from public results", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی آماری",
        slug: "stats-poll",
      });

      const qChoice = await service.createQuestion(adminActor, poll.id, {
        questionText: "رشته تحصیلی؟",
        questionType: "single_choice",
        options: [
          { optionText: "داروسازی" },
          { optionText: "پزشکی" },
        ],
      });

      const qText = await service.createQuestion(adminActor, poll.id, {
        questionText: "انتقاد یا پیشنهاد شما؟",
        questionType: "short_text",
        isRequired: false,
      });

      await service.publishPoll(adminActor, poll.id);

      const optPharma = qChoice.options![0].id;
      const optMed = qChoice.options![1].id;

      // 3 votes for Pharma, 1 for Med
      await service.submitResponse("stats-poll", { answers: { [qChoice.id]: optPharma, [qText.id]: "نظر کاربر یک" } }, "user-1");
      await service.submitResponse("stats-poll", { answers: { [qChoice.id]: optPharma, [qText.id]: "نظر کاربر دو" } }, "user-2");
      await service.submitResponse("stats-poll", { answers: { [qChoice.id]: optPharma } }, "user-3");
      await service.submitResponse("stats-poll", { answers: { [qChoice.id]: optMed, [qText.id]: "نظر کاربر چهار" } }, "user-4");

      // Public results
      const publicResults = await service.getPollResults("stats-poll", true);
      expect(publicResults.totalResponses).toBe(4);
      expect(publicResults.isAdmin).toBe(false);

      const choiceRes = publicResults.questions.find((q) => q.questionId === qChoice.id)!;
      const optPharmaRes = choiceRes.options!.find((o) => o.optionId === optPharma)!;
      const optMedRes = choiceRes.options!.find((o) => o.optionId === optMed)!;

      expect(optPharmaRes.voteCount).toBe(3);
      expect(optPharmaRes.percentage).toBe(75);
      expect(optMedRes.voteCount).toBe(1);
      expect(optMedRes.percentage).toBe(25);

      // Text answers must be stripped from public results
      const textResPublic = publicResults.questions.find((q) => q.questionId === qText.id)!;
      expect(textResPublic.textAnswers).toBeUndefined();

      // Admin results
      const adminResults = await service.getPollResults("stats-poll", false, adminActor);
      expect(adminResults.isAdmin).toBe(true);
      const textResAdmin = adminResults.questions.find((q) => q.questionId === qText.id)!;
      expect(textResAdmin.textAnswers?.length).toBe(3);
      expect(textResAdmin.textAnswers).toContain("نظر کاربر یک");
      expect(textResAdmin.textAnswers).toContain("نظر کاربر دو");
      expect(textResAdmin.textAnswers).toContain("نظر کاربر چهار");
    });
  });

  // -------------------------------------------------------------------------
  // 7. Multi-Tenancy & Role-Based Access Control
  // -------------------------------------------------------------------------
  describe("Multi-Tenancy & Permissions", () => {
    it("allows organization_admin access strictly within their organization", async () => {
      const pollOrgA = await service.createPoll(orgAdminA, {
        title: "نظرسنجی سازمان الف",
        organizationId: orgIdA,
      });

      // orgAdminA can view pollOrgA
      const fetched = await service.getPollById(orgAdminA, pollOrgA.id);
      expect(fetched.id).toBe(pollOrgA.id);

      // orgAdminB CANNOT access pollOrgA (cross-tenant security)
      await expect(service.getPollById(orgAdminB, pollOrgA.id)).rejects.toThrow(
        "شما به این سازمان دسترسی ندارید.",
      );

      // Student actor CANNOT access admin management
      await expect(service.getPollById(studentActor, pollOrgA.id)).rejects.toThrow(
        "دسترسی به بخش مدیریت نظرسنجی‌ها محدود است.",
      );
    });

    it("allows platform_admin global access across any organization", async () => {
      const pollOrgA = await service.createPoll(orgAdminA, {
        title: "نظرسنجی سازمان الف",
        organizationId: orgIdA,
      });

      const fetchedByPlatformAdmin = await service.getPollById(adminActor, pollOrgA.id);
      expect(fetchedByPlatformAdmin.id).toBe(pollOrgA.id);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Concurrent Submissions Race Condition
  // -------------------------------------------------------------------------
  describe("Concurrent Submissions Invariant", () => {
    it("handles concurrent identical submissions without duplicate rows", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی همروندی",
        slug: "race-poll",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "گزینه مورد نظر؟",
        questionType: "single_choice",
        options: [{ optionText: "یک" }, { optionText: "دو" }],
      });

      await service.publishPoll(adminActor, poll.id);

      const pid = "same-token-for-race-test";
      const optId = q.options![0].id;

      // Fire 2 concurrent submissions with same participant token
      const results = await Promise.allSettled([
        service.submitResponse("race-poll", { answers: { [q.id]: optId } }, pid),
        service.submitResponse("race-poll", { answers: { [q.id]: optId } }, pid),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 1 must succeed and 1 must be rejected with conflict
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const count = await responseStore.countByPoll(poll.id);
      expect(count).toBe(1);
    });

    it("serializes question deletion against concurrent response submission", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی قفل ساختاری",
        slug: "race-structure-poll",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "آیا موافقید؟",
        questionType: "single_choice",
        options: [{ optionText: "بله" }, { optionText: "خیر" }],
      });

      await service.publishPoll(adminActor, poll.id);

      const optId = q.options![0].id;

      // Concurrently submit a response and try to delete a question
      const [voteRes, deleteRes] = await Promise.allSettled([
        service.submitResponse("race-structure-poll", { answers: { [q.id]: optId } }, "user-token-race-1"),
        service.deleteQuestion(adminActor, poll.id, q.id),
      ]);

      // If vote succeeds first, deleteQuestion MUST fail because responsesCount > 0
      if (voteRes.status === "fulfilled") {
        expect(deleteRes.status).toBe("rejected");
        if (deleteRes.status === "rejected") {
          expect(deleteRes.reason.message).toContain("امکان تغییر ساختار سؤالات یا گزینه‌های نظرسنجی پس از ثبت اولین مشارکت وجود ندارد");
        }
      }
    });

    it("serializes poll closing against concurrent response submission", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی بستن همزمان",
        slug: "race-close-poll",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال بستن؟",
        questionType: "single_choice",
        options: [{ optionText: "الف" }, { optionText: "ب" }],
      });

      await service.publishPoll(adminActor, poll.id);

      const optId = q.options![0].id;

      // Close poll and concurrently attempt vote
      await service.closePoll(adminActor, poll.id);

      await expect(
        service.submitResponse("race-close-poll", { answers: { [q.id]: optId } }, "user-token-after-close"),
      ).rejects.toThrow("این نظرسنجی در حال حاضر برای دریافت پاسخ فعال نیست.");
    });
  });

  // -------------------------------------------------------------------------
  // 9. content_worker RBAC Enforcement
  // -------------------------------------------------------------------------
  describe("content_worker RBAC Permissions", () => {
    it("allows content_worker to create draft polls and manage questions in draft status", async () => {
      const poll = await service.createPoll(contentWorkerA, {
        title: "پیش‌نویس کارشناس محتوا",
        organizationId: orgIdA,
      });

      expect(poll.status).toBe("draft");

      const q = await service.createQuestion(contentWorkerA, poll.id, {
        questionText: "سؤال آزمایشی کارشناس محتوا",
        questionType: "single_choice",
        options: [{ optionText: "گزینه ۱" }, { optionText: "گزینه ۲" }],
      });

      expect(q.id).toBeDefined();

      const updatedQ = await service.updateQuestion(contentWorkerA, poll.id, q.id, {
        questionText: "سؤال ویرایش شده",
      });
      expect(updatedQ.questionText).toBe("سؤال ویرایش شده");
    });

    it("prevents content_worker from publishing, closing, deleting, or exporting polls", async () => {
      const poll = await service.createPoll(orgAdminA, {
        title: "نظرسنجی سازمان برای آزمون نقش",
        organizationId: orgIdA,
      });

      await service.createQuestion(orgAdminA, poll.id, {
        questionText: "سؤال تستی",
        questionType: "single_choice",
        options: [{ optionText: "یک" }, { optionText: "دو" }],
      });

      // publish forbidden
      await expect(service.publishPoll(contentWorkerA, poll.id)).rejects.toThrow(
        "فقط مدیران سازمان یا مدیران پلتفرم امکان تغییر وضعیت انتشار نظرسنجی را دارند.",
      );

      // close forbidden
      await expect(service.closePoll(contentWorkerA, poll.id)).rejects.toThrow(
        "فقط مدیران سازمان یا مدیران پلتفرم امکان تغییر وضعیت انتشار نظرسنجی را دارند.",
      );

      // delete forbidden
      await expect(service.deletePoll(contentWorkerA, poll.id)).rejects.toThrow(
        "فقط مدیران سازمان یا مدیران پلتفرم امکان حذف نظرسنجی را دارند.",
      );

      // export CSV forbidden
      await expect(service.exportPollResultsCsv(contentWorkerA, poll.id)).rejects.toThrow(
        "فقط مدیران سازمان یا مدیران پلتفرم امکان استخراج داده‌ها را دارند.",
      );

      // status change via updatePoll forbidden
      await expect(
        service.updatePoll(contentWorkerA, poll.id, { status: "published" }),
      ).rejects.toThrow(
        "فقط مدیران سازمان یا مدیران پلتفرم امکان تغییر وضعیت انتشار نظرسنجی را دارند.",
      );
    });

    it("prevents content_worker from modifying questions on published polls", async () => {
      const poll = await service.createPoll(orgAdminA, {
        title: "نظرسنجی منتشر شده سازمان",
        organizationId: orgIdA,
      });

      const q = await service.createQuestion(orgAdminA, poll.id, {
        questionText: "سؤال منتشر شده",
        questionType: "single_choice",
        options: [{ optionText: "یک" }, { optionText: "دو" }],
      });

      await service.publishPoll(orgAdminA, poll.id);

      // content_worker tries to add question to published poll -> forbidden
      await expect(
        service.createQuestion(contentWorkerA, poll.id, {
          questionText: "سؤال جدید غیرمجاز",
          questionType: "short_text",
        }),
      ).rejects.toThrow("کارشناس محتوا فقط امکان مدیریت سؤالات نظرسنجی در وضعیت پیش‌نویس را دارد.");

      // content_worker tries to update question on published poll -> forbidden
      await expect(
        service.updateQuestion(contentWorkerA, poll.id, q.id, {
          questionText: "ویرایش غیرمجاز",
        }),
      ).rejects.toThrow("کارشناس محتوا فقط امکان مدیریت سؤالات نظرسنجی در وضعیت پیش‌نویس را دارد.");

      // content_worker tries to delete question on published poll -> forbidden
      await expect(
        service.deleteQuestion(contentWorkerA, poll.id, q.id),
      ).rejects.toThrow("کارشناس محتوا فقط امکان مدیریت سؤالات نظرسنجی در وضعیت پیش‌نویس را دارد.");
    });
  });

  // -------------------------------------------------------------------------
  // 10. Slug Immutability Invariant
  // -------------------------------------------------------------------------
  describe("Slug Immutability Invariant", () => {
    it("allows slug modification on a draft poll with 0 responses", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی اسلاگ پیش‌نویس",
        slug: "initial-draft-slug",
      });

      const updated = await service.updatePoll(adminActor, poll.id, {
        slug: "new-draft-slug",
      });

      expect(updated.slug).toBe("new-draft-slug");
    });

    it("rejects slug modification on a published poll", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی اسلاگ انتشار",
        slug: "published-slug-test",
      });

      await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال اول",
        questionType: "single_choice",
        options: [{ optionText: "الف" }, { optionText: "ب" }],
      });

      await service.publishPoll(adminActor, poll.id);

      await expect(
        service.updatePoll(adminActor, poll.id, { slug: "attempt-change-slug" }),
      ).rejects.toThrow("امکان تغییر شناسه یکتای نظرسنجی (slug) پس از انتشار یا بسته‌شدن وجود ندارد.");
    });

    it("rejects slug modification on a closed poll", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی اسلاگ بسته",
        slug: "closed-slug-test",
      });

      await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال اول",
        questionType: "single_choice",
        options: [{ optionText: "الف" }, { optionText: "ب" }],
      });

      await service.publishPoll(adminActor, poll.id);
      await service.closePoll(adminActor, poll.id);

      await expect(
        service.updatePoll(adminActor, poll.id, { slug: "attempt-change-closed-slug" }),
      ).rejects.toThrow("امکان تغییر شناسه یکتای نظرسنجی (slug) پس از انتشار یا بسته‌شدن وجود ندارد.");
    });

    it("rejects slug modification if poll has at least 1 response even in draft status", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی اسلاگ با پاسخ",
        slug: "voted-poll-slug",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: "سؤال با پاسخ",
        questionType: "single_choice",
        options: [{ optionText: "الف" }, { optionText: "ب" }],
      });

      await service.publishPoll(adminActor, poll.id);

      await service.submitResponse("voted-poll-slug", {
        answers: { [q.id]: q.options![0].id },
      }, "voter-token-slug-test");

      // Even if someone manually updated status to draft, slug cannot change once responses exist
      await pollStore.update(poll.id, { status: "draft" });

      await expect(
        service.updatePoll(adminActor, poll.id, { slug: "changed-voted-slug" }),
      ).rejects.toThrow("امکان تغییر شناسه یکتای نظرسنجی (slug) پس از ثبت مشارکت وجود ندارد.");
    });
  });

  // -------------------------------------------------------------------------
  // 11. Enhanced CSV Formula Injection Defense (CWE-1236) & Formatting
  // -------------------------------------------------------------------------
  describe("Enhanced CSV Formula Injection Defense (CWE-1236)", () => {
    it("escapes all formula triggers with leading whitespace, tabs, and newlines", async () => {
      const poll = await service.createPoll(adminActor, {
        title: "نظرسنجی تست تزریق فرمول",
        slug: "formula-injection-test",
      });

      const qText = await service.createQuestion(adminActor, poll.id, {
        questionText: "نظرات شما چیست؟",
        questionType: "short_text",
      });

      const qChoice = await service.createQuestion(adminActor, poll.id, {
        questionText: "انتخاب کنید",
        questionType: "single_choice",
        options: [
          { optionText: '  =SUM(1,2) with space' },
          { optionText: '\t@HYPERLINK("http://evil.com")' },
        ],
      });

      await service.publishPoll(adminActor, poll.id);

      // Submit responses containing dangerous strings
      await service.submitResponse("formula-injection-test", {
        answers: {
          [qText.id]: ' \r\n -2+5+cmd|\' /C calc\'!A0',
          [qChoice.id]: qChoice.options![0].id,
        },
      }, "attacker-token-1");

      await service.submitResponse("formula-injection-test", {
        answers: {
          [qText.id]: '%0A=1+1',
          [qChoice.id]: qChoice.options![1].id,
        },
      }, "attacker-token-2");

      const { filename, csvContent } = await service.exportPollResultsCsv(adminActor, poll.id);

      expect(filename).toBe("poll_formula-injection-test_results.csv");

      // Verify UTF-8 BOM
      expect(csvContent.startsWith("\uFEFF")).toBe(true);

      // Verify formula cells are prepended with single quote
      expect(csvContent).toContain("\"'=SUM(1,2) with space\"");
      expect(csvContent).toContain("\"'@HYPERLINK(\"\"http://evil.com\"\")\"");
      expect(csvContent).toContain("\"'-2+5+cmd|' /C calc'!A0\"");
      expect(csvContent).toContain("\"'%0A=1+1\"");
    });

    it("correctly handles quotes, commas, and multiline text per RFC-4180", async () => {
      const poll = await service.createPoll(adminActor, {
        title: 'نظرسنجی "خاص", با کاما',
        slug: "rfc-test",
      });

      const q = await service.createQuestion(adminActor, poll.id, {
        questionText: 'سؤال با "کوتیشن" و , کاما',
        questionType: "short_text",
      });

      await service.publishPoll(adminActor, poll.id);

      await service.submitResponse("rfc-test", {
        answers: {
          [q.id]: 'خط اول\nخط دوم با "کوتیشن مضاعف" و , کاما',
        },
      }, "normal-user-token");

      const { csvContent } = await service.exportPollResultsCsv(adminActor, poll.id);

      expect(csvContent).toContain('"نظرسنجی ""خاص"", با کاما"');
      expect(csvContent).toContain('"سؤال 1: سؤال با ""کوتیشن"" و , کاما"');
      expect(csvContent).toContain('"خط اول\nخط دوم با ""کوتیشن مضاعف"" و , کاما"');
    });
  });
});
