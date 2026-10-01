import { describe, it, expect } from "vitest";
import { gradeAttempt, sanitizeQuestionsForStudent } from "./grading.js";
import {
  calculateRuntimeExamState,
  assertQuestionMutationAllowed,
  type ExamSnapshotQuestion,
} from "./types.js";

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

  it("sanitizes questions for students, stripping correctOptionId and explanation", () => {
    const sanitized = sanitizeQuestionsForStudent(sampleSnapshot);

    expect(sanitized).toHaveLength(2);
    for (const q of sanitized) {
      expect(q).not.toHaveProperty("correctOptionId");
      expect(q).not.toHaveProperty("explanation");
      expect(q).toHaveProperty("id");
      expect(q).toHaveProperty("prompt");
      expect(q).toHaveProperty("options");
      expect(q).toHaveProperty("points");
    }
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
