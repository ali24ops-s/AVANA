import { describe, it, expect } from "vitest";
import {
  validateTeacherQuestionInput,
  gradeAttempt,
  canonicalizeAndShuffleQuestion,
  evaluateQuestionAnswer,
  resolveChoiceText,
  resolveCorrectChoiceText,
  type ExamSnapshotQuestion,
  type TeacherQuestionInput,
} from "../index.js";

describe("Teacher Platform — MCQ 4, 5, 6 Options Comprehensive Test Suite", () => {
  // =========================================================================
  // 1. Validation Tests (validateTeacherQuestionInput)
  // =========================================================================
  describe("MCQ Option Count & Schema Validation", () => {
    it("1. accepts single_choice question with exactly 4 valid options (Default)", () => {
      const input: TeacherQuestionInput = {
        prompt: "کدام دارو مهارکننده اختصاصی COX-2 است؟",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "سلکوکسیب" },
          { id: "opt-2", text: "ایبوپروفن" },
          { id: "opt-3", text: "ناپروکسن" },
          { id: "opt-4", text: "آسپرین" },
        ],
        correctOptionId: "opt-1",
        points: 2,
        explanation: "سلکوکسیب مهارکننده اختصاصی COX-2 است.",
      };

      const result = validateTeacherQuestionInput(input);
      expect(result.options?.length).toBe(4);
      expect(result.correctOptionId).toBe("opt-1");
      expect(result.points).toBe(2);
      expect(result.explanation).toBe("سلکوکسیب مهارکننده اختصاصی COX-2 است.");
    });

    it("2. accepts single_choice question with exactly 5 valid options", () => {
      const input: TeacherQuestionInput = {
        prompt: "کدام یک از داروهای زیر بتابلاکر است؟",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "متوپرولول" },
          { id: "opt-2", text: "کاپتوپریل" },
          { id: "opt-3", text: "لوزارتان" },
          { id: "opt-4", text: "آملودیپین" },
          { id: "opt-5", text: "فوروزماید" },
        ],
        correctOptionId: "opt-1",
        points: 1.5,
      };

      const result = validateTeacherQuestionInput(input);
      expect(result.options?.length).toBe(5);
      expect(result.correctOptionId).toBe("opt-1");
    });

    it("3. accepts single_choice question with exactly 6 valid options", () => {
      const input: TeacherQuestionInput = {
        prompt: "کدام گزینه از عوارض جانبی عمده وارفارین است؟",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "خونریزی گوارشی" },
          { id: "opt-2", text: "افزایش فشار خون" },
          { id: "opt-3", text: "هیپوگلیسمی" },
          { id: "opt-4", text: "سرفه‌های خشک" },
          { id: "opt-5", text: "ادم مچ پا" },
          { id: "opt-6", text: "برونکواسپاسم" },
        ],
        correctOptionId: "opt-1",
        points: 3,
      };

      const result = validateTeacherQuestionInput(input);
      expect(result.options?.length).toBe(6);
      expect(result.correctOptionId).toBe("opt-1");
    });

    it("4. rejects single_choice question with 3 options (< 4)", () => {
      const input: TeacherQuestionInput = {
        prompt: "سوال با ۳ گزینه",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
        ],
        correctOptionId: "opt-1",
      };

      expect(() => validateTeacherQuestionInput(input)).toThrowError(
        "سوال تستی باید دارای ۴، ۵ یا ۶ گزینه باشد",
      );
    });

    it("5. rejects single_choice question with 2 options (< 4)", () => {
      const input: TeacherQuestionInput = {
        prompt: "سوال با ۲ گزینه",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
        ],
        correctOptionId: "opt-1",
      };

      expect(() => validateTeacherQuestionInput(input)).toThrowError(
        "سوال تستی باید دارای ۴، ۵ یا ۶ گزینه باشد",
      );
    });

    it("6. rejects single_choice question with 7 options (> 6)", () => {
      const input: TeacherQuestionInput = {
        prompt: "سوال با ۷ گزینه",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-4", text: "گزینه ۴" },
          { id: "opt-5", text: "گزینه ۵" },
          { id: "opt-6", text: "گزینه ۶" },
          { id: "opt-7", text: "گزینه ۷" },
        ],
        correctOptionId: "opt-1",
      };

      expect(() => validateTeacherQuestionInput(input)).toThrowError(
        "سوال تستی باید دارای ۴، ۵ یا ۶ گزینه باشد",
      );
    });

    it("7. rejects single_choice question without correctOptionId", () => {
      const input: TeacherQuestionInput = {
        prompt: "سوال بدون کلید صحیح",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-4", text: "گزینه ۴" },
        ],
        correctOptionId: undefined,
      };

      expect(() => validateTeacherQuestionInput(input)).toThrowError(
        "شناسه گزینه صحیح باید دقیقاً یکی از گزینه‌های همان سوال باشد",
      );
    });

    it("8. rejects single_choice question when correctOptionId is not in options", () => {
      const input: TeacherQuestionInput = {
        prompt: "سوال با کلید نامعتبر",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-4", text: "گزینه ۴" },
          { id: "opt-5", text: "گزینه ۵" },
        ],
        correctOptionId: "opt-999", // non-existent
      };

      expect(() => validateTeacherQuestionInput(input)).toThrowError(
        "شناسه گزینه صحیح باید دقیقاً یکی از گزینه‌های همان سوال باشد",
      );
    });

    it("9. rejects duplicate option IDs", () => {
      const input: TeacherQuestionInput = {
        prompt: "سوال با شناسه تکراری",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-1", text: "گزینه ۴ تکراری" }, // duplicate ID
        ],
        correctOptionId: "opt-1",
      };

      expect(() => validateTeacherQuestionInput(input)).toThrowError(
        "شناسه گزینه تکراری است",
      );
    });

    it("10. rejects empty option text", () => {
      const input: TeacherQuestionInput = {
        prompt: "سوال با متن گزینه خالی",
        questionType: "single_choice",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "   " }, // whitespace only
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-4", text: "گزینه ۴" },
        ],
        correctOptionId: "opt-1",
      };

      expect(() => validateTeacherQuestionInput(input)).toThrowError(
        "متن گزینه نمی‌تواند خالی باشد",
      );
    });

    it("11. keeps true_false validation completely distinct and unaffected", () => {
      const tfInput: TeacherQuestionInput = {
        questionType: "true_false",
        statements: [
          {
            id: "s-1",
            text: "آسپرین یک داروی ضدالتهاب غیراستروئیدی است.",
            correctAnswer: true,
          },
        ],
        points: 1,
      };

      const result = validateTeacherQuestionInput(tfInput);
      expect(result.questionType).toBe("true_false");
      expect(result.statements?.length).toBe(1);
      expect(result.statements?.[0].correctAnswer).toBe(true);
    });
  });

  // =========================================================================
  // 2. Grading Tests (gradeAttempt) for 4, 5, 6 Options
  // =========================================================================
  describe("Grading Suite for 4, 5, and 6 Options", () => {
    const questionsSnapshot: ExamSnapshotQuestion[] = [
      {
        id: "q-4opt",
        orderIndex: 0,
        questionType: "single_choice",
        prompt: "سوال ۴ گزینه‌ای",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-4", text: "گزینه ۴" },
        ],
        correctOptionId: "opt-4", // 4th option is correct
        points: 4,
      },
      {
        id: "q-5opt",
        orderIndex: 1,
        questionType: "single_choice",
        prompt: "سوال ۵ گزینه‌ای",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-4", text: "گزینه ۴" },
          { id: "opt-5", text: "گزینه ۵" },
        ],
        correctOptionId: "opt-5", // 5th option is correct
        points: 5,
      },
      {
        id: "q-6opt",
        orderIndex: 2,
        questionType: "single_choice",
        prompt: "سوال ۶ گزینه‌ای",
        options: [
          { id: "opt-1", text: "گزینه ۱" },
          { id: "opt-2", text: "گزینه ۲" },
          { id: "opt-3", text: "گزینه ۳" },
          { id: "opt-4", text: "گزینه ۴" },
          { id: "opt-5", text: "گزینه ۵" },
          { id: "opt-6", text: "گزینه ۶" },
        ],
        correctOptionId: "opt-6", // 6th option is correct
        points: 6,
      },
    ];

    it("12. correctly grades 4th option as correct", () => {
      const answers = [{ questionId: "q-4opt", selectedOptionId: "opt-4" }];
      const result = gradeAttempt([questionsSnapshot[0]], answers);

      expect(result.perQuestion[0].isCorrect).toBe(true);
      expect(result.perQuestion[0].pointsEarned).toBe(4);
      expect(result.totalScore).toBe(4);
      expect(result.percentage).toBe(100);
    });

    it("13. correctly grades 5th option as correct", () => {
      const answers = [{ questionId: "q-5opt", selectedOptionId: "opt-5" }];
      const result = gradeAttempt([questionsSnapshot[1]], answers);

      expect(result.perQuestion[0].isCorrect).toBe(true);
      expect(result.perQuestion[0].pointsEarned).toBe(5);
      expect(result.totalScore).toBe(5);
      expect(result.percentage).toBe(100);
    });

    it("14. correctly grades 6th option as correct", () => {
      const answers = [{ questionId: "q-6opt", selectedOptionId: "opt-6" }];
      const result = gradeAttempt([questionsSnapshot[2]], answers);

      expect(result.perQuestion[0].isCorrect).toBe(true);
      expect(result.perQuestion[0].pointsEarned).toBe(6);
      expect(result.totalScore).toBe(6);
      expect(result.percentage).toBe(100);
    });

    it("15. correctly marks incorrect answers on 5th and 6th option questions", () => {
      const answers = [
        { questionId: "q-5opt", selectedOptionId: "opt-2" }, // wrong (expected opt-5)
        { questionId: "q-6opt", selectedOptionId: "opt-3" }, // wrong (expected opt-6)
      ];
      const result = gradeAttempt([questionsSnapshot[1], questionsSnapshot[2]], answers);

      expect(result.perQuestion[0].isCorrect).toBe(false);
      expect(result.perQuestion[0].pointsEarned).toBe(0);
      expect(result.perQuestion[1].isCorrect).toBe(false);
      expect(result.perQuestion[1].pointsEarned).toBe(0);
      expect(result.totalScore).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it("16. grades mixed exam with 4, 5, 6 options perfectly", () => {
      const answers = [
        { questionId: "q-4opt", selectedOptionId: "opt-4" }, // 4 pts
        { questionId: "q-5opt", selectedOptionId: "opt-5" }, // 5 pts
        { questionId: "q-6opt", selectedOptionId: "opt-1" }, // 0 pts (wrong)
      ];
      const result = gradeAttempt(questionsSnapshot, answers, 60);

      expect(result.maxScore).toBe(15);
      expect(result.totalScore).toBe(9);
      expect(result.percentage).toBe(60);
      expect(result.passed).toBe(true);
    });
  });

  // =========================================================================
  // 3. Shuffling & Resolution Tests (question-shuffling.ts)
  // =========================================================================
  describe("Option Shuffling & Resolution for 4, 5, 6 Choices", () => {
    it("17. shuffles 5-choice question while strictly preserving correct option", () => {
      const q = {
        question: "داروی انتخابی در حمله حاد نقرس کدام است؟",
        choices: ["کلشی‌سین", "آلوپورینول", "فبوکسوستات", "پروبنسید", "پگلوتیکاز"],
        correctAnswer: "کلشی‌سین",
      };

      const shuffled = canonicalizeAndShuffleQuestion(q, () => 0.42);
      expect(shuffled.choices.length).toBe(5);
      expect(shuffled.choices).toContain("کلشی‌سین");
      expect(shuffled.choices).toContain("پگلوتیکاز");
      expect(shuffled.correctAnswer).toBe("کلشی‌سین");

      // Verify evaluation
      const evalRes = evaluateQuestionAnswer("کلشی‌سین", shuffled);
      expect(evalRes.status).toBe("correct");
    });

    it("18. shuffles 6-choice question while strictly preserving correct option", () => {
      const q = {
        question: "کدام گروه عاملی قطبی‌ترین است؟",
        choices: ["هیدروکسیل", "کربوکسیل", "آمید", "متیل", "فنیل", "استر"],
        correctAnswer: "آمید",
      };

      const shuffled = canonicalizeAndShuffleQuestion(q, () => 0.73);
      expect(shuffled.choices.length).toBe(6);
      expect(shuffled.choices).toContain("آمید");
      expect(shuffled.choices).toContain("استر");
      expect(shuffled.correctAnswer).toBe("آمید");

      const evalRes = evaluateQuestionAnswer("آمید", shuffled);
      expect(evalRes.status).toBe("correct");
    });

    it("19. resolves choice tokens for 5th and 6th options (e/f, هـ/و, گزینه ۵/۶, index 4/5)", () => {
      const choices = ["گزینه اول", "گزینه دوم", "گزینه سوم", "گزینه چهارم", "گزینه پنجم", "گزینه ششم"];

      // Numeric index
      expect(resolveChoiceText(4, choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText(5, choices)).toBe("گزینه ششم");
      expect(resolveChoiceText("4", choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText("5", choices)).toBe("گزینه ششم");

      // Persian letters
      expect(resolveChoiceText("ه", choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText("هـ", choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText("و", choices)).toBe("گزینه ششم");

      // Persian labels
      expect(resolveChoiceText("گزینه ۵", choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText("گزینه 5", choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText("گزینه ۶", choices)).toBe("گزینه ششم");
      expect(resolveChoiceText("گزینه 6", choices)).toBe("گزینه ششم");

      // English letters
      expect(resolveChoiceText("e", choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText("f", choices)).toBe("گزینه ششم");
      expect(resolveChoiceText("E", choices)).toBe("گزینه پنجم");
      expect(resolveChoiceText("F", choices)).toBe("گزینه ششم");

      // resolveCorrectChoiceText
      expect(resolveCorrectChoiceText(choices, "هـ")).toBe("گزینه پنجم");
      expect(resolveCorrectChoiceText(choices, "و")).toBe("گزینه ششم");
      expect(resolveCorrectChoiceText(choices, "4")).toBe("گزینه پنجم");
      expect(resolveCorrectChoiceText(choices, "5")).toBe("گزینه ششم");
    });
  });
});
