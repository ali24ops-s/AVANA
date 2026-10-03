import { describe, it, expect } from "vitest";
import { gradeAttempt, sanitizeQuestionsForStudent } from "./grading.js";
import {
  calculateRuntimeExamState,
  assertQuestionMutationAllowed,
  type ExamSnapshotQuestion,
  TRUE_FALSE_FIXED_PROMPT,
} from "./types.js";
import {
  validateTeacherQuestionInput,
  validateSaveAnswerInput,
  validateGradeDescriptiveAnswerInput,
} from "./schemas.js";

describe("Teacher Platform — Multi-Statement True/False Question Authoring & Validation", () => {
  it("validates multi-statement true_false question with 1 to 8 statements and enforces fixed prompt", () => {
    const valid = validateTeacherQuestionInput({
      prompt: "متن دلخواه استاد که باید نادیده گرفته شود",
      questionType: "true_false",
      points: 4,
      statements: [
        { id: "stmt-1", text: "آسپرین یک داروی ضدپلاکت است.", correctAnswer: true },
        { id: "stmt-2", text: "مورفین یک آنتاگونیست اوپیوئیدی است.", correctAnswer: false },
        { id: "stmt-3", text: "آتروپین مهارکننده گیرنده موسکارینی است.", correctAnswer: true },
      ],
      explanation: "آسپرین ضدپلاکت، مورفین آگونیست و آتروپین آنتاگونیست موسکارینی است.",
    });

    expect(valid.questionType).toBe("true_false");
    expect(valid.prompt).toBe(TRUE_FALSE_FIXED_PROMPT);
    expect(valid.points).toBe(4);
    expect(valid.statements).toEqual([
      { id: "stmt-1", text: "آسپرین یک داروی ضدپلاکت است.", correctAnswer: true },
      { id: "stmt-2", text: "مورفین یک آنتاگونیست اوپیوئیدی است.", correctAnswer: false },
      { id: "stmt-3", text: "آتروپین مهارکننده گیرنده موسکارینی است.", correctAnswer: true },
    ]);
    expect(valid.options).toEqual([]);
    expect(valid.correctOptionId).toBeNull();
  });

  it("validates boundary limits (1 statement minimum, 8 statements maximum)", () => {
    // 1 statement - valid
    const validMin = validateTeacherQuestionInput({
      questionType: "true_false",
      statements: [{ id: "s1", text: "گزاره اول", correctAnswer: true }],
    });
    expect(validMin.statements).toHaveLength(1);

    // 8 statements - valid
    const validMax = validateTeacherQuestionInput({
      questionType: "true_false",
      statements: Array.from({ length: 8 }, (_, i) => ({
        id: `s-${i + 1}`,
        text: `گزاره شماره ${i + 1}`,
        correctAnswer: i % 2 === 0,
      })),
    });
    expect(validMax.statements).toHaveLength(8);
  });

  it("rejects 0 statements and more than 8 statements", () => {
    // 0 statements
    expect(() =>
      validateTeacherQuestionInput({
        questionType: "true_false",
        statements: [],
      }),
    ).toThrowError(/حداقل ۱ و حداکثر ۸ گزاره/);

    // 9 statements
    expect(() =>
      validateTeacherQuestionInput({
        questionType: "true_false",
        statements: Array.from({ length: 9 }, (_, i) => ({
          id: `s-${i + 1}`,
          text: `گزاره شماره ${i + 1}`,
          correctAnswer: true,
        })),
      }),
    ).toThrowError(/حداقل ۱ و حداکثر ۸ گزاره/);
  });

  it("rejects invalid statements (empty text, non-boolean answer, duplicate id)", () => {
    // Empty text
    expect(() =>
      validateTeacherQuestionInput({
        questionType: "true_false",
        statements: [{ id: "s1", text: "   ", correctAnswer: true }],
      }),
    ).toThrowError(/متن گزاره نمی‌تواند خالی باشد/);

    // Non-boolean answer
    expect(() =>
      validateTeacherQuestionInput({
        questionType: "true_false",
        statements: [{ id: "s1", text: "متن گزاره", correctAnswer: null as unknown as boolean }],
      }),
    ).toThrowError(/پاسخ صحیح هر گزاره باید مشخص باشد/);

    // Duplicate IDs
    expect(() =>
      validateTeacherQuestionInput({
        questionType: "true_false",
        statements: [
          { id: "duplicate-id", text: "گزاره یک", correctAnswer: true },
          { id: "duplicate-id", text: "گزاره دو", correctAnswer: false },
        ],
      }),
    ).toThrowError(/شناسه گزاره تکراری است: duplicate-id/);
  });

  it("validates save answer payload with booleanAnswers record", () => {
    const saveInput = validateSaveAnswerInput({
      questionId: "11111111-1111-1111-1111-111111111111",
      booleanAnswers: {
        "stmt-1": true,
        "stmt-2": false,
      },
    });
    expect(saveInput.textAnswer).toBe(JSON.stringify({ "stmt-1": true, "stmt-2": false }));
  });
});

describe("Teacher Platform — Pure Grading Engine", () => {
  const sampleSnapshot: ExamSnapshotQuestion[] = [
    {
      id: "q-1",
      orderIndex: 0,
      prompt: "کدام دارو مخدر است؟",
      options: [
        { id: "opt-1a", text: "مورفین" },
        { id: "opt-1b", text: "استامینوفن" },
      ],
      correctOptionId: "opt-1a",
      points: 2,
      explanation: "مورفین یک آگونیست قوی اوپیوئیدی است.",
    },
    {
      id: "q-2",
      orderIndex: 1,
      prompt: "کدام دارو ضدالتهاب غیراستروئیدی است؟",
      options: [
        { id: "opt-2a", text: "ایبوپروفن" },
        { id: "opt-2b", text: "دیازپام" },
      ],
      correctOptionId: "opt-2a",
      points: 3,
      explanation: "ایبوپروفن مهارکننده COX است.",
    },
  ];

  it("grades correctly when all answers are correct", () => {
    const answers = [
      { questionId: "q-1", selectedOptionId: "opt-1a" },
      { questionId: "q-2", selectedOptionId: "opt-2a" },
    ];

    const result = gradeAttempt(sampleSnapshot, answers, 60);

    expect(result.totalScore).toBe(5);
    expect(result.maxScore).toBe(5);
    expect(result.percentage).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.perQuestion).toEqual([
      {
        questionId: "q-1",
        selectedOptionId: "opt-1a",
        textAnswer: null,
        teacherFeedback: null,
        gradingStatus: "auto_graded",
        isCorrect: true,
        pointsEarned: 2,
        maxPoints: 2,
      },
      {
        questionId: "q-2",
        selectedOptionId: "opt-2a",
        textAnswer: null,
        teacherFeedback: null,
        gradingStatus: "auto_graded",
        isCorrect: true,
        pointsEarned: 3,
        maxPoints: 3,
      },
    ]);
  });

  it("grades correctly with partial credit and wrong answers", () => {
    const answers = [
      { questionId: "q-1", selectedOptionId: "opt-1a" }, // Correct (2 pts)
      { questionId: "q-2", selectedOptionId: "opt-2b" }, // Wrong (0 pts)
    ];

    const result = gradeAttempt(sampleSnapshot, answers, 60);

    expect(result.totalScore).toBe(2);
    expect(result.maxScore).toBe(5);
    expect(result.percentage).toBe(40);
    expect(result.passed).toBe(false);
  });

  it("handles unanswered questions gracefully without crashing", () => {
    const answers = [
      { questionId: "q-1", selectedOptionId: "opt-1a" }, // Correct (2 pts)
      // q-2 is completely missing
    ];

    const result = gradeAttempt(sampleSnapshot, answers, 40);

    expect(result.totalScore).toBe(2);
    expect(result.maxScore).toBe(5);
    expect(result.percentage).toBe(40);
    expect(result.passed).toBe(true); // >= 40%

    const q2Detail = result.perQuestion.find((q) => q.questionId === "q-2");
    expect(q2Detail).toBeDefined();
    expect(q2Detail?.isCorrect).toBe(false);
    expect(q2Detail?.selectedOptionId).toBeNull();
    expect(q2Detail?.pointsEarned).toBe(0);
  });

  it("handles questions with differing points weights", () => {
    const weightedSnapshot: ExamSnapshotQuestion[] = [
      {
        id: "q-hard",
        orderIndex: 0,
        prompt: "سوال سخت",
        options: [{ id: "opt-h1", text: "الف" }],
        correctOptionId: "opt-h1",
        points: 8.5,
      },
      {
        id: "q-easy",
        orderIndex: 1,
        prompt: "سوال آسان",
        options: [{ id: "opt-e1", text: "ب" }],
        correctOptionId: "opt-e1",
        points: 1.5,
      },
    ];

    const answers = [{ questionId: "q-hard", selectedOptionId: "opt-h1" }];
    const result = gradeAttempt(weightedSnapshot, answers, 80);

    expect(result.totalScore).toBe(8.5);
    expect(result.maxScore).toBe(10);
    expect(result.percentage).toBe(85);
    expect(result.passed).toBe(true);
  });

  it("evaluates strictly against snapshot rather than external state", () => {
    // Suppose live question changed correctOptionId to 'opt-1b', but student's snapshot has 'opt-1a'
    const snapshotWithOriginalKey: ExamSnapshotQuestion[] = [
      {
        id: "q-1",
        orderIndex: 0,
        prompt: "صورت سوال در لحظه شروع",
        options: [
          { id: "opt-1a", text: "کلید زمان شروع" },
          { id: "opt-1b", text: "کلید اصلاح‌شده بعدی" },
        ],
        correctOptionId: "opt-1a", // The snapshot keeps opt-1a!
        points: 1,
      },
    ];

    const answers = [{ questionId: "q-1", selectedOptionId: "opt-1a" }];
    const result = gradeAttempt(snapshotWithOriginalKey, answers);

    expect(result.totalScore).toBe(1);
    expect(result.perQuestion[0].isCorrect).toBe(true);
  });

  it("grades mixed exams and sets status to needs_manual_review when descriptive questions are ungraded", () => {
    const mixedSnapshot: ExamSnapshotQuestion[] = [
      {
        id: "q-1",
        orderIndex: 0,
        prompt: "سوال تستی",
        questionType: "single_choice",
        options: [
          { id: "opt-1a", text: "درست" },
          { id: "opt-1b", text: "غلط" },
        ],
        correctOptionId: "opt-1a",
        points: 4,
      },
      {
        id: "q-2",
        orderIndex: 1,
        prompt: "مکانیسم اثر دارو را شرح دهید.",
        questionType: "descriptive",
        points: 6,
      },
    ];

    const answers = [
      { questionId: "q-1", selectedOptionId: "opt-1a" },
      { questionId: "q-2", textAnswer: "این دارو کانال کلسیم را مهار می‌کند." },
    ];

    const result = gradeAttempt(mixedSnapshot, answers, 50);

    expect(result.autoScore).toBe(4);
    expect(result.manualScore).toBe(0);
    expect(result.totalScore).toBe(4);
    expect(result.maxScore).toBe(10);
    expect(result.gradingStatus).toBe("needs_manual_review");
    // While needs_manual_review, passed and percentage are null because grading is incomplete
    expect(result.passed).toBeNull();
    expect(result.percentage).toBeNull();

    const q2 = result.perQuestion.find((q) => q.questionId === "q-2");
    expect(q2?.gradingStatus).toBe("ungraded");
    expect(q2?.textAnswer).toBe("این دارو کانال کلسیم را مهار می‌کند.");
    expect(q2?.pointsEarned).toBeNull();
  });

  it("handles manually graded descriptive answers correctly in mixed exams", () => {
    const mixedSnapshot: ExamSnapshotQuestion[] = [
      {
        id: "q-1",
        orderIndex: 0,
        prompt: "سوال تستی",
        questionType: "single_choice",
        options: [{ id: "opt-1", text: "الف" }],
        correctOptionId: "opt-1",
        points: 5,
      },
      {
        id: "q-2",
        orderIndex: 1,
        prompt: "سوال تشریحی",
        questionType: "descriptive",
        points: 5,
      },
    ];

    const answers = [
      { questionId: "q-1", selectedOptionId: "opt-1" },
      {
        questionId: "q-2",
        textAnswer: "پاسخ کامل دانشجو",
        pointsEarned: 4.5,
        teacherFeedback: "عالی، فقط یک نکته جا ماند.",
        gradingStatus: "graded" as const,
      },
    ];

    const result = gradeAttempt(mixedSnapshot, answers, 80);

    expect(result.autoScore).toBe(5);
    expect(result.manualScore).toBe(4.5);
    expect(result.totalScore).toBe(9.5);
    expect(result.maxScore).toBe(10);
    expect(result.percentage).toBe(95);
    expect(result.gradingStatus).toBe("fully_graded");
    expect(result.passed).toBe(true);

    const q2 = result.perQuestion.find((q) => q.questionId === "q-2");
    expect(q2?.gradingStatus).toBe("graded");
    expect(q2?.pointsEarned).toBe(4.5);
    expect(q2?.teacherFeedback).toBe("عالی، فقط یک نکته جا ماند.");
  });

  it("grades multi-statement true_false questions with partial scores proportional to correct statements", () => {
    const tfSnapshot: ExamSnapshotQuestion[] = [
      {
        id: "q-tf-1",
        orderIndex: 0,
        prompt: TRUE_FALSE_FIXED_PROMPT,
        questionType: "true_false",
        points: 4,
        statements: [
          { id: "s1", text: "گزاره ۱", correctAnswer: true },
          { id: "s2", text: "گزاره ۲", correctAnswer: false },
          { id: "s3", text: "گزاره ۳", correctAnswer: true },
          { id: "s4", text: "گزاره ۴", correctAnswer: false },
        ],
      },
    ];

    // Case 1: 4/4 correct (100% -> 4 pts)
    const resAllCorrect = gradeAttempt(tfSnapshot, [
      {
        questionId: "q-tf-1",
        textAnswer: JSON.stringify({ s1: true, s2: false, s3: true, s4: false }),
      },
    ]);
    expect(resAllCorrect.totalScore).toBe(4);
    expect(resAllCorrect.maxScore).toBe(4);
    expect(resAllCorrect.percentage).toBe(100);
    expect(resAllCorrect.perQuestion[0].isCorrect).toBe(true);
    expect(resAllCorrect.perQuestion[0].pointsEarned).toBe(4);

    // Case 2: 3/4 correct (75% -> 3 pts)
    const resThreeCorrect = gradeAttempt(tfSnapshot, [
      {
        questionId: "q-tf-1",
        textAnswer: JSON.stringify({ s1: true, s2: false, s3: true, s4: true }), // s4 is wrong
      },
    ]);
    expect(resThreeCorrect.totalScore).toBe(3);
    expect(resThreeCorrect.percentage).toBe(75);
    expect(resThreeCorrect.perQuestion[0].isCorrect).toBe(false);
    expect(resThreeCorrect.perQuestion[0].pointsEarned).toBe(3);

    // Case 3: 2/4 correct with 2 unanswered (50% -> 2 pts)
    const resTwoCorrect = gradeAttempt(tfSnapshot, [
      {
        questionId: "q-tf-1",
        textAnswer: JSON.stringify({ s1: true, s2: false }), // s3 and s4 omitted
      },
    ]);
    expect(resTwoCorrect.totalScore).toBe(2);
    expect(resTwoCorrect.percentage).toBe(50);
    expect(resTwoCorrect.perQuestion[0].pointsEarned).toBe(2);

    // Case 4: 0/4 correct (0% -> 0 pts)
    const resZeroCorrect = gradeAttempt(tfSnapshot, [
      {
        questionId: "q-tf-1",
        textAnswer: JSON.stringify({ s1: false, s2: true, s3: false, s4: true }),
      },
    ]);
    expect(resZeroCorrect.totalScore).toBe(0);
    expect(resZeroCorrect.percentage).toBe(0);
    expect(resZeroCorrect.perQuestion[0].pointsEarned).toBe(0);

    // Case 5: Unanswered question
    const resUnanswered = gradeAttempt(tfSnapshot, []);
    expect(resUnanswered.totalScore).toBe(0);
    expect(resUnanswered.percentage).toBe(0);
    expect(resUnanswered.perQuestion[0].pointsEarned).toBe(0);
  });

  it("sanitizes multi-statement questions for students, stripping correctAnswer from statements", () => {
    const tfSnapshot: ExamSnapshotQuestion[] = [
      {
        id: "q-tf-1",
        orderIndex: 0,
        prompt: TRUE_FALSE_FIXED_PROMPT,
        questionType: "true_false",
        points: 4,
        statements: [
          { id: "s1", text: "گزاره ۱", correctAnswer: true },
          { id: "s2", text: "گزاره ۲", correctAnswer: false },
        ],
      },
    ];

    const sanitized = sanitizeQuestionsForStudent(tfSnapshot);

    expect(sanitized).toHaveLength(1);
    const q = sanitized[0];
    expect(q.prompt).toBe(TRUE_FALSE_FIXED_PROMPT);
    expect(q.statements).toEqual([
      { id: "s1", text: "گزاره ۱" },
      { id: "s2", text: "گزاره ۲" },
    ]);
    expect(q.statements?.[0]).not.toHaveProperty("correctAnswer");
    expect(q.statements?.[1]).not.toHaveProperty("correctAnswer");
  });
});

describe("Teacher Platform — Runtime State & Mutation Invariants", () => {
  it("calculates runtime states correctly across the time spectrum", () => {
    const baseExam = {
      status: "published" as const,
      startsAt: "2026-03-30T10:00:00.000Z",
      endsAt: "2026-03-30T12:00:00.000Z",
      closedAt: null,
    };

    // Before startsAt -> upcoming
    const tUpcoming = new Date("2026-03-30T09:30:00.000Z");
    expect(calculateRuntimeExamState(baseExam, tUpcoming)).toBe("upcoming");

    // During exam -> active
    const tActive = new Date("2026-03-30T10:30:00.000Z");
    expect(calculateRuntimeExamState(baseExam, tActive)).toBe("active");

    // After endsAt -> closed
    const tEnded = new Date("2026-03-30T12:05:00.000Z");
    expect(calculateRuntimeExamState(baseExam, tEnded)).toBe("closed");

    // Manually closed during active period -> closed
    const manuallyClosedExam = {
      ...baseExam,
      closedAt: "2026-03-30T10:15:00.000Z",
    };
    expect(calculateRuntimeExamState(manuallyClosedExam, tActive)).toBe("closed");

    // Draft exam is not active even within dates
    const draftExam = {
      ...baseExam,
      status: "draft" as const,
    };
    expect(calculateRuntimeExamState(draftExam, tActive)).toBe("closed");
  });

  it("enforces question mutation invariant", () => {
    expect(() => assertQuestionMutationAllowed("draft")).not.toThrow();

    expect(() => assertQuestionMutationAllowed("published")).toThrowError(
      /Questions cannot be modified on an exam with status 'published'/,
    );

    expect(() => assertQuestionMutationAllowed("archived")).toThrowError(
      /Questions cannot be modified on an exam with status 'archived'/,
    );
  });
});

describe("Teacher Platform — Descriptive Grading & Decimal Precision Suite (0.01 step)", () => {
  describe("validateGradeDescriptiveAnswerInput", () => {
    it("accepts valid score of 0", () => {
      const res = validateGradeDescriptiveAnswerInput({ pointsEarned: 0 }, 1);
      expect(res.pointsEarned).toBe(0);
    });

    it("accepts all required two-decimal test values (0.01, 0.02, 0.13, 0.24, 0.25, 0.26, 0.33, 0.49, 0.51, 0.74, 0.76, 0.99, 1.00)", () => {
      const validSamples = [0.01, 0.02, 0.13, 0.24, 0.25, 0.26, 0.33, 0.49, 0.51, 0.74, 0.76, 0.99, 1.00];
      for (const val of validSamples) {
        const res = validateGradeDescriptiveAnswerInput({ pointsEarned: val }, 1);
        expect(res.pointsEarned).toBe(val);
      }
    });

    it("accepts valid decimal scores up to higher maxPoints (e.g. 5.50)", () => {
      const samples = [1.01, 1.27, 4.33, 5.50];
      for (const val of samples) {
        const res = validateGradeDescriptiveAnswerInput({ pointsEarned: val }, 5.5);
        expect(res.pointsEarned).toBe(val);
      }
    });

    it("rejects score greater than maxPoints", () => {
      expect(() =>
        validateGradeDescriptiveAnswerInput({ pointsEarned: 1.01 }, 1.0),
      ).toThrowError(/نمره داده‌شده نمی‌تواند بیشتر از بارم سؤال/);

      expect(() =>
        validateGradeDescriptiveAnswerInput({ pointsEarned: 5.51 }, 5.5),
      ).toThrowError(/نمره داده‌شده نمی‌تواند بیشتر از بارم سؤال/);
    });

    it("rejects negative scores", () => {
      expect(() =>
        validateGradeDescriptiveAnswerInput({ pointsEarned: -0.01 }, 1),
      ).toThrowError(/نمره داده‌شده باید عددی مثبت یا صفر باشد/);

      expect(() =>
        validateGradeDescriptiveAnswerInput({ pointsEarned: -1 }, 1),
      ).toThrowError(/نمره داده‌شده باید عددی مثبت یا صفر باشد/);
    });

    it("rejects non-numeric, NaN, Infinity, null, or undefined values", () => {
      expect(() =>
        validateGradeDescriptiveAnswerInput({ pointsEarned: NaN }, 1),
      ).toThrowError(/نمره داده‌شده باید عددی مثبت یا صفر باشد/);

      expect(() =>
        validateGradeDescriptiveAnswerInput({ pointsEarned: Infinity }, 1),
      ).toThrowError(/نمره داده‌شده باید عددی مثبت یا صفر باشد/);

      expect(() =>
        validateGradeDescriptiveAnswerInput({ pointsEarned: "0.25" as unknown as number }, 1),
      ).toThrowError(/نمره داده‌شده باید عددی مثبت یا صفر باشد/);

      expect(() =>
        validateGradeDescriptiveAnswerInput(null, 1),
      ).toThrowError(/داده‌های نمره‌دهی معتبر نیست/);
    });

    it("explicitly rejects precision beyond 2 decimal places (e.g. 0.001, 0.009, 0.333, 0.999, 1.001)", () => {
      const invalidHighPrecision = [0.001, 0.009, 0.333, 0.999, 1.001, 0.1234];
      for (const val of invalidHighPrecision) {
        expect(() =>
          validateGradeDescriptiveAnswerInput({ pointsEarned: val }, 2),
        ).toThrowError(/نمره داده‌شده حداکثر می‌تواند ۲ رقم اعشار داشته باشد/);
      }
    });
  });

  describe("gradeAttempt with multiple descriptive questions and decimal scores", () => {
    it("accurately sums decimal descriptive scores and avoids IEEE-754 precision anomalies", () => {
      const snapshot: ExamSnapshotQuestion[] = [
        {
          id: "q-desc-1",
          orderIndex: 0,
          questionType: "descriptive",
          prompt: "توضیح دهید...",
          points: 1,
        },
        {
          id: "q-desc-2",
          orderIndex: 1,
          questionType: "descriptive",
          prompt: "تحلیل کنید...",
          points: 1,
        },
        {
          id: "q-desc-3",
          orderIndex: 2,
          questionType: "descriptive",
          prompt: "مقایسه کنید...",
          points: 2,
        },
      ];

      const answers = [
        {
          questionId: "q-desc-1",
          gradingStatus: "graded" as const,
          pointsEarned: 0.33,
        },
        {
          questionId: "q-desc-2",
          gradingStatus: "graded" as const,
          pointsEarned: 0.67,
        },
        {
          questionId: "q-desc-3",
          gradingStatus: "graded" as const,
          pointsEarned: 1.25,
        },
      ];

      const result = gradeAttempt(snapshot, answers, 50);

      expect(result.gradingStatus).toBe("fully_graded");
      expect(result.maxScore).toBe(4);
      expect(result.manualScore).toBe(2.25);
      expect(result.totalScore).toBe(2.25);
      expect(result.percentage).toBe(56.25);
      expect(result.passed).toBe(true);
    });

    it("maintains non-descriptive grading correctness alongside decimal descriptive questions", () => {
      const snapshot: ExamSnapshotQuestion[] = [
        {
          id: "q-mc",
          orderIndex: 0,
          questionType: "single_choice",
          prompt: "سوال تستی",
          points: 1,
          options: [
            { id: "opt-1", text: "گزینه ۱" },
            { id: "opt-2", text: "گزینه ۲" },
          ],
          correctOptionId: "opt-1",
        },
        {
          id: "q-tf",
          orderIndex: 1,
          questionType: "true_false",
          prompt: TRUE_FALSE_FIXED_PROMPT,
          points: 2,
          statements: [
            { id: "s1", text: "گزاره ۱", correctAnswer: true },
            { id: "s2", text: "گزاره ۲", correctAnswer: false },
          ],
        },
        {
          id: "q-desc",
          orderIndex: 2,
          questionType: "descriptive",
          prompt: "سوال تشریحی",
          points: 2,
        },
      ];

      const answers = [
        {
          questionId: "q-mc",
          selectedOptionId: "opt-1",
        },
        {
          questionId: "q-tf",
          textAnswer: JSON.stringify({ s1: true, s2: true }), // 1 of 2 correct -> 1 point
        },
        {
          questionId: "q-desc",
          gradingStatus: "graded" as const,
          pointsEarned: 0.37,
        },
      ];

      const result = gradeAttempt(snapshot, answers, 50);

      expect(result.gradingStatus).toBe("fully_graded");
      expect(result.maxScore).toBe(5);
      expect(result.autoScore).toBe(2); // 1 + 1
      expect(result.manualScore).toBe(0.37);
      expect(result.totalScore).toBe(2.37); // exactly 2.37, not 2.3700000000000006
      expect(result.percentage).toBe(47.4);
      expect(result.passed).toBe(false);
    });
  });
});
