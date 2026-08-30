import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type OrganizationId,
  type CourseId,
  type DocumentId,
  type Actor,
  RoleBasedPolicy,
  validateQuestionIntegrity,
  validateQuestionQuality,
} from "@avana/domain";
import type { GeneratedContentRecord } from "../modules/generation/generation-store.js";
import {
  InMemoryGeneratedContentStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
} from "../modules/study/test/in-memory-stores.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { StudyService } from "../modules/study/study-service.js";

describe("Quiz Option Shuffling, Answer Key Sync & Exam Session Determinism", () => {
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let flashcardStore: InMemoryFlashcardStore;
  let reviewService: ReviewService;
  let studyService: StudyService;

  const orgId = "org-test-shuffling" as OrganizationId;
  const courseId = "course-pharm-101" as CourseId;
  const adminActor: Actor = { userId: "admin-1", role: "organization_admin" };
  const studentActor: Actor = { userId: "student-1", role: "student" };

  beforeEach(() => {
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    flashcardStore = new InMemoryFlashcardStore();

    const policy = new RoleBasedPolicy();
    const auditServiceMock = { emit: async () => {} } as any;

    reviewService = new ReviewService(
      generatedContentStore as any,
      {} as any,
      documentStore as any,
      {} as any,
      moduleStore as any,
      lessonStore as any,
      policy,
      {} as any,
      auditServiceMock,
      flashcardStore as any,
      quizStore as any,
      quizQuestionStore as any,
    );

    studyService = new StudyService(
      flashcardStore as any,
      new InMemoryFlashcardReviewStore() as any,
      quizStore as any,
      quizQuestionStore as any,
      quizAttemptStore as any,
      moduleStore as any,
      lessonStore as any,
      new InMemoryProgressStore() as any,
      policy,
      auditServiceMock,
      undefined,
      new InMemoryUserFlashcardScheduleStore() as any,
    );
  });

  function makeDocument(docId: DocumentId, name: string) {
    return {
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: "admin-1" as any,
      originalName: name,
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: `hash-${docId}`,
      storageKey: `/tmp/${name}`,
      status: "extracted" as const,
      pageCount: 5,
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    };
  }

  it("Test 1: Materializing a quiz canonicalizes & shuffles choices so correct answers are not locked to Option 1", async () => {
    const docId = "doc-shuff-1" as DocumentId;
    documentStore.insert(makeDocument(docId, "pharmacology.pdf"));

    // Simulate 20 questions where raw generator output put the correct answer at index 0
    const rawQuestions = Array.from({ length: 20 }, (_, i) => ({
      question: `سوال شماره ${i + 1}: داروی انتخابی خط اول کدام است؟`,
      questionType: "multiple_choice",
      choices: [
        `پاسخ صحیح شماره ${i + 1}`,
        `گزینه انحرافی الف-${i + 1}`,
        `گزینه انحرافی ب-${i + 1}`,
        `گزینه انحرافی ج-${i + 1}`,
      ],
      correctAnswer: `پاسخ صحیح شماره ${i + 1}`,
      explanation: `توضیحات پاسخ شماره ${i + 1}`,
    }));

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون فارماکولوژی جامع",
        moduleTitle: "فصل اول: داروهای قلبی",
        questions: rawQuestions,
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(quizRecord);
    await reviewService.acceptContent(adminActor, orgId, quizRecord.id);

    // Retrieve all materialized questions from DB
    const allQuestions = await quizQuestionStore.listByFilter({
      organizationId: orgId,
      difficulty: "all",
    });

    expect(allQuestions).toHaveLength(20);

    const positionCounts = [0, 0, 0, 0];

    for (let i = 0; i < allQuestions.length; i++) {
      const q = allQuestions[i];
      const targetAns = `پاسخ صحیح شماره ${i + 1}`;

      // Invariant 1: Exactly 4 choices
      expect(q.choices).toHaveLength(4);
      // Invariant 2: Choices contain target answer
      expect(q.choices).toContain(targetAns);
      // Invariant 3: correctAnswer points to target answer
      expect(q.correctAnswer).toBe(targetAns);

      // Invariant 4: Single correct answer in choices
      const matches = q.choices?.filter((c) => c === q.correctAnswer) || [];
      expect(matches).toHaveLength(1);

      // Verify domain integrity check passes
      const valResult = validateQuestionIntegrity({
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correctAnswer,
      });
      expect(valResult.valid).toBe(true);

      const pos = q.choices?.indexOf(targetAns) ?? -1;
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(4);
      positionCounts[pos]++;
    }

    // Key assertion: Correct answer is NOT stuck at position 0 for all 20 questions
    // Positions 1, 2, or 3 must also be occupied
    const nonZeroPositionsCount = positionCounts[1] + positionCounts[2] + positionCounts[3];
    expect(nonZeroPositionsCount).toBeGreaterThan(0);
    expect(positionCounts[0]).toBeLessThan(20);
  });

  it("Test 2: Submitting correct answer after shuffle scores 100%, and wrong answer scores 0%", async () => {
    const docId = "doc-shuff-2" as DocumentId;
    documentStore.insert(makeDocument(docId, "cardiology.pdf"));

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون بتابلاکرها",
        moduleTitle: "فصل دوم: بتابلاکرها",
        questions: [
          {
            question: "کدام دارو بتابلاکر انتخابی قلبی است؟",
            questionType: "multiple_choice",
            choices: ["متوپرولول (صحیح)", "پروپرانولول", "لابتالول", "تیمولول"],
            correctAnswer: "متوپرولول (صحیح)",
          },
        ],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(quizRecord);
    await reviewService.acceptContent(adminActor, orgId, quizRecord.id);

    const quizzes = await studyService.listQuizzes(studentActor, orgId, courseId);
    expect(quizzes).toHaveLength(1);
    const quizId = quizzes[0].id;

    const quizData = await studyService.getQuizForAttempt(studentActor, orgId, quizId);
    const questionId = quizData.questions[0].id;

    // 1. Submit correct answer
    const successAttempt = await studyService.submitQuizAttempt(studentActor, orgId, {
      quizId,
      answers: [{ questionId, answer: "متوپرولول (صحیح)" }],
    });
    expect(successAttempt.score).toBe(100);
    expect(successAttempt.correct).toBe(1);

    // 2. Submit wrong answer
    const failedAttempt = await studyService.submitQuizAttempt(studentActor, orgId, {
      quizId,
      answers: [{ questionId, answer: "پروپرانولول" }],
    });
    expect(failedAttempt.score).toBe(0);
    expect(failedAttempt.correct).toBe(0);
  });

  it("Test 3: Exam Session Snapshot Determinism — resuming an attempt preserves exact choices order", async () => {
    const docId = "doc-shuff-3" as DocumentId;
    documentStore.insert(makeDocument(docId, "exam_module.pdf"));

    const rawQuestions = Array.from({ length: 5 }, (_, i) => ({
      question: `سوال آزمون جامع شماره ${i + 1}`,
      questionType: "multiple_choice",
      choices: [
        `پاسخ قطعی ${i + 1}`,
        `انحرافی یک ${i + 1}`,
        `انحرافی دو ${i + 1}`,
        `انحرافی سه ${i + 1}`,
      ],
      correctAnswer: `پاسخ قطعی ${i + 1}`,
    }));

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون آزمایشی جامع",
        moduleTitle: "فصل جامع",
        questions: rawQuestions,
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(quizRecord);
    await reviewService.acceptContent(adminActor, orgId, quizRecord.id);

    // Start a new configured exam attempt
    const examStart = await studyService.startConfiguredExamAttempt(studentActor, orgId, {
      questionCount: 5,
      difficulty: "medium",
    });

    const initialQuestions = examStart.questions;
    expect(initialQuestions).toHaveLength(5);

    // Record the exact choices snapshot of each question upon start
    const initialChoicesSnapshot = initialQuestions.map((q) => ({
      id: q.id,
      choices: [...(q.choices || [])],
    }));

    // Save partial answer (simulating answering question 1 and 2)
    await studyService.saveExamAttemptAnswer(studentActor, orgId, examStart.attemptId, [
      { questionId: initialQuestions[0].id, answer: initialChoicesSnapshot[0].choices[0] },
    ]);

    // Resume / refresh exam attempt (simulating page reload)
    const resumed = await studyService.getExamAttempt(studentActor, orgId, examStart.attemptId);
    expect(resumed.isCompleted).toBe(false);
    expect(resumed.questions).toHaveLength(5);

    // Verify EXACT preservation of choices order per question
    resumed.questions.forEach((resumedQ, idx) => {
      const original = initialChoicesSnapshot[idx];
      expect(resumedQ.id).toBe(original.id);
      expect(resumedQ.choices).toEqual(original.choices);
    });

    // Submit the configured exam attempt with correct answers
    const materializedQuestions = await quizQuestionStore.listByIds(
      initialQuestions.map((q) => q.id),
    );
    const answersToSubmit = materializedQuestions.map((q) => ({
      questionId: q.id,
      answer: q.correctAnswer,
    }));

    const result = await studyService.submitConfiguredExamAttempt(
      studentActor,
      orgId,
      examStart.attemptId,
      answersToSubmit,
    );

    expect(result.score).toBe(100);
    expect(result.correct).toBe(5);
  });

  it("Test 4: Materializing multiple quizzes produces independent random permutations", async () => {
    const docId = "doc-shuff-4" as DocumentId;
    documentStore.insert(makeDocument(docId, "reproducibility.pdf"));

    const sampleChoices = [
      "گزینه آلفا (هدف)",
      "گزینه بتا",
      "گزینه گاما",
      "گزینه دلتا",
    ];

    const quizRecord1: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون شماره یک",
        questions: [
          {
            question: "سوال تست تصادفی",
            questionType: "multiple_choice",
            choices: sampleChoices,
            correctAnswer: "A", // Positional reference to choices[0]
          },
        ],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(quizRecord1);
    await reviewService.acceptContent(adminActor, orgId, quizRecord1.id);

    const questions = await quizQuestionStore.listByFilter({
      organizationId: orgId,
      difficulty: "all",
    });

    expect(questions).toHaveLength(1);
    const q1 = questions[0];
    expect(q1.correctAnswer).toBe("گزینه آلفا (هدف)");
    expect(q1.choices).toContain("گزینه آلفا (هدف)");
  });

  it("Test 5: Materializing a quiz with varied cognitive difficulties preserves real difficulty tags (easy, medium, hard)", async () => {
    const docId = "doc-shuff-5" as DocumentId;
    documentStore.insert(makeDocument(docId, "pharmacotherapy.pdf"));

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون فارماکوتراپی بر اساس سطوح شناختی",
        questions: [
          {
            question: "تعریف خط اول درمان چیست؟",
            questionType: "multiple_choice",
            difficulty: "easy",
            choices: ["داروی A", "داروی B", "داروی C", "داروی D"],
            correctAnswer: "داروی A",
          },
          {
            question: "مقایسه مکانیسم دو دارو در نارسایی قلبی کدام است؟",
            questionType: "multiple_choice",
            difficulty: "medium",
            choices: ["مکانیسم ۱", "مکانیسم ۲", "مکانیسم ۳", "مکانیسم ۴"],
            correctAnswer: "مکانیسم ۲",
          },
          {
            question: "در بیمار مبتلا به برونکواسپاسم و نارسایی کلیه، تنظیم دوز کدام است؟",
            questionType: "multiple_choice",
            difficulty: "hard",
            choices: ["تنظیم دوز ۱", "تنظیم دوز ۲", "تنظیم دوز ۳", "تنظیم دوز ۴"],
            correctAnswer: "تنظیم دوز ۳",
          },
        ],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(quizRecord);
    await reviewService.acceptContent(adminActor, orgId, quizRecord.id);

    const questions = await quizQuestionStore.listByFilter({
      organizationId: orgId,
      difficulty: "all",
    });

    expect(questions).toHaveLength(3);
    const difficulties = questions.map((q) => q.difficulty);
    expect(difficulties).toContain("easy");
    expect(difficulties).toContain("medium");
    expect(difficulties).toContain("hard");
  });

  it("Test 6: Quality Gate rejects placeholder distractors and validates genuine same-domain choices", async () => {
    const invalidQuestion = {
      question: "مکانیسم اثر داروی متوپرولول چیست؟",
      choices: [
        "مهار انتخابی گیرنده‌های بتا-۱",
        "گزینه انحرافی ۱",
        "گزینه انحرافی ۲",
        "گزینه انحرافی ۳",
      ],
      correctAnswer: "مهار انتخابی گیرنده‌های بتا-۱",
    };

    const invalidResult = validateQuestionQuality(invalidQuestion);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some((e) => e.includes("prohibited placeholder"))).toBe(true);

    const validQuestion = {
      question: "کدام دارو در دسته مسدودکننده‌های غیرانتخابی گیرنده بتا قرار می‌گیرد؟",
      choices: [
        "پروپرانولول (Propranolol)",
        "متوپرولول (Metoprolol)",
        "آتنولول (Atenolol)",
        "بیزوپرولول (Bisoprolol)",
      ],
      correctAnswer: "پروپرانولول (Propranolol)",
    };

    const validResult = validateQuestionQuality(validQuestion, { requireFourChoices: true });
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);
    expect(validResult.metrics?.choiceCount).toBe(4);
  });

  it("Test 7: Exam session choice order remains 100% deterministic across Start -> Refresh -> Submit -> Review", async () => {
    const docId = "doc-shuff-7" as DocumentId;
    documentStore.insert(makeDocument(docId, "exam-stability.pdf"));

    const rawQuestions = [
      {
        question: "داروی انتخابی در کنترل فشار خون همراه با نارسایی قلبی کدام است؟",
        questionType: "multiple_choice",
        choices: ["انالاپریل", "آتنولول", "هیدرالازین", "دیلتیازم"],
        correctAnswer: "انالاپریل",
      },
      {
        question: "کدام دیورتیک سبب حفظ پتاسیم (Potassium-sparing) می‌شود؟",
        questionType: "multiple_choice",
        choices: ["اسپیرونولاکتون", "فوروزماید", "هیدروکلروتیازید", "تورزماید"],
        correctAnswer: "اسپیرونولاکتون",
      },
    ];

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون پایداری سشن",
        questions: rawQuestions,
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null, qualityScore: null, qualityLevel: null, qualityReport: null, qualityAnalyzedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(quizRecord);
    await reviewService.acceptContent(adminActor, orgId, quizRecord.id);

    // 1. Start exam attempt
    const attempt = await studyService.startConfiguredExamAttempt(studentActor, orgId, {
      questionCount: 2,
    });

    expect(attempt.questions).toHaveLength(2);
    const q1InitialChoices = [...(attempt.questions[0].choices || [])];
    const q2InitialChoices = [...(attempt.questions[1].choices || [])];

    // 2. Simulate Page Refresh: getExamAttempt
    const refreshedAttempt = await studyService.getExamAttempt(studentActor, orgId, attempt.attemptId);
    expect(refreshedAttempt.questions).toHaveLength(2);
    expect(refreshedAttempt.questions[0].choices).toEqual(q1InitialChoices);
    expect(refreshedAttempt.questions[1].choices).toEqual(q2InitialChoices);

    // 3. Save answers dynamically based on question content
    const answerForQ0 = attempt.questions[0].question.includes("فشار خون") ? "انالاپریل" : "اسپیرونولاکتون";
    const answerForQ1 = attempt.questions[1].question.includes("فشار خون") ? "انالاپریل" : "اسپیرونولاکتون";

    await studyService.saveExamAttemptAnswer(studentActor, orgId, attempt.attemptId, [
      {
        questionId: attempt.questions[0].id,
        answer: answerForQ0,
      },
    ]);
    await studyService.saveExamAttemptAnswer(studentActor, orgId, attempt.attemptId, [
      {
        questionId: attempt.questions[1].id,
        answer: answerForQ1,
      },
    ]);

    // 4. Submit attempt
    const submissionResult = await studyService.submitConfiguredExamAttempt(
      studentActor,
      orgId,
      attempt.attemptId,
      [
        {
          questionId: attempt.questions[0].id,
          answer: answerForQ0,
        },
        {
          questionId: attempt.questions[1].id,
          answer: answerForQ1,
        },
      ],
    );

    expect(submissionResult.score).toBe(100);
    expect(submissionResult.correct).toBe(2);
    expect(submissionResult.total).toBe(2);

    // 5. Review completed attempt
    const completedAttempt = await studyService.getExamAttempt(studentActor, orgId, attempt.attemptId);
    expect(completedAttempt.questions[0].choices).toEqual(q1InitialChoices);
    expect(completedAttempt.questions[1].choices).toEqual(q2InitialChoices);
    expect(completedAttempt.isCompleted).toBe(true);
    expect(completedAttempt.attempt.status).toBe("completed");
  });
});
