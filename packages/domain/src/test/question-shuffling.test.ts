import { describe, it, expect } from "vitest";
import {
  resolveCorrectChoiceText,
  shuffleChoices,
  canonicalizeAndShuffleQuestion,
  validateQuestionIntegrity,
  validateQuestionQuality,
  isStudentAnswerCorrect,
} from "../question-shuffling.js";

describe("Question Option Shuffling & Invariant Validation (Domain)", () => {
  const sampleChoices = [
    "Metoprolol (Beta blocker)",
    "Lisinopril (ACE inhibitor)",
    "Amlodipine (CCB)",
    "Hydrochlorothiazide (Diuretic)",
  ];

  describe("1. resolveCorrectChoiceText", () => {
    it("resolves exact string matches", () => {
      const resolved = resolveCorrectChoiceText(sampleChoices, "Amlodipine (CCB)");
      expect(resolved).toBe("Amlodipine (CCB)");
    });

    it("resolves numeric 0-based indices", () => {
      expect(resolveCorrectChoiceText(sampleChoices, 0)).toBe(sampleChoices[0]);
      expect(resolveCorrectChoiceText(sampleChoices, 1)).toBe(sampleChoices[1]);
      expect(resolveCorrectChoiceText(sampleChoices, 2)).toBe(sampleChoices[2]);
      expect(resolveCorrectChoiceText(sampleChoices, 3)).toBe(sampleChoices[3]);
      expect(resolveCorrectChoiceText(sampleChoices, "2")).toBe(sampleChoices[2]);
    });

    it("resolves English letters A, B, C, D (case-insensitive)", () => {
      expect(resolveCorrectChoiceText(sampleChoices, "A")).toBe(sampleChoices[0]);
      expect(resolveCorrectChoiceText(sampleChoices, "b")).toBe(sampleChoices[1]);
      expect(resolveCorrectChoiceText(sampleChoices, "C")).toBe(sampleChoices[2]);
      expect(resolveCorrectChoiceText(sampleChoices, "d")).toBe(sampleChoices[3]);
    });

    it("resolves Persian letters and labels (الف، ب، ج، د / گزینه ۱ تا ۴)", () => {
      expect(resolveCorrectChoiceText(sampleChoices, "الف")).toBe(sampleChoices[0]);
      expect(resolveCorrectChoiceText(sampleChoices, "ب")).toBe(sampleChoices[1]);
      expect(resolveCorrectChoiceText(sampleChoices, "ج")).toBe(sampleChoices[2]);
      expect(resolveCorrectChoiceText(sampleChoices, "د")).toBe(sampleChoices[3]);
      expect(resolveCorrectChoiceText(sampleChoices, "گزینه ۲")).toBe(sampleChoices[1]);
      expect(resolveCorrectChoiceText(sampleChoices, "گزینه سوم")).toBe(sampleChoices[2]);
    });

    it("resolves prefixed option strings like 'A) ...' or '1. ...'", () => {
      expect(
        resolveCorrectChoiceText(sampleChoices, "B) Lisinopril (ACE inhibitor)"),
      ).toBe("Lisinopril (ACE inhibitor)");
      expect(
        resolveCorrectChoiceText(sampleChoices, "3. Amlodipine (CCB)"),
      ).toBe("Amlodipine (CCB)");
    });
  });

  describe("2. shuffleChoices (Fisher-Yates)", () => {
    it("preserves all original elements without mutation", () => {
      const original = ["A", "B", "C", "D"];
      const shuffled = shuffleChoices(original);
      expect(shuffled).toHaveLength(original.length);
      expect(new Set(shuffled)).toEqual(new Set(original));
      // Original array must not be mutated
      expect(original).toEqual(["A", "B", "C", "D"]);
    });

    it("uses deterministic RNG when provided", () => {
      // Mock deterministic RNG that reverses positions
      const mockRngSequence = [0.99, 0.99, 0.99];
      let callCount = 0;
      const rng = () => mockRngSequence[callCount++] ?? 0.5;

      const items = ["A", "B", "C", "D"];
      const shuffled = shuffleChoices(items, rng);
      expect(shuffled).toHaveLength(4);
      expect(new Set(shuffled)).toEqual(new Set(items));
    });

    it("helper statistical sanity test: distributes items across positions over multiple runs", () => {
      const items = ["Target", "Wrong1", "Wrong2", "Wrong3"];
      const positionCounts = [0, 0, 0, 0];
      const runs = 200;

      for (let i = 0; i < runs; i++) {
        const shuffled = shuffleChoices(items);
        const idx = shuffled.indexOf("Target");
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(4);
        positionCounts[idx]++;
      }

      // Every position should be hit at least once in 200 runs
      for (let pos = 0; pos < 4; pos++) {
        expect(positionCounts[pos]).toBeGreaterThan(10);
      }
    });
  });

  describe("3. canonicalizeAndShuffleQuestion", () => {
    it("preserves correct answer text and sets it as the authoritative string", () => {
      const input = {
        question: "داروی انتخابی کدام است؟",
        choices: ["پروپرانولول", "متوپرولول", "آتنولول", "کارودیلول"],
        correctAnswer: "متوپرولول",
      };

      const result = canonicalizeAndShuffleQuestion(input);

      expect(result.choices).toHaveLength(4);
      expect(result.choices).toContain("متوپرولول");
      expect(result.correctAnswer).toBe("متوپرولول");
      // The correctAnswer must match exactly one choice in result.choices
      expect(result.choices?.filter((c) => c === result.correctAnswer)).toHaveLength(1);
    });

    it("correctly resolves and synchronizes positional correctAnswer 'A' before shuffling", () => {
      const input = {
        question: "کدام گزینه صحیح است؟",
        choices: ["پاسخ الف (درست)", "پاسخ ب (غلط)", "پاسخ ج (غلط)", "پاسخ د (غلط)"],
        correctAnswer: "A", // Positional reference
      };

      const result = canonicalizeAndShuffleQuestion(input);

      expect(result.correctAnswer).toBe("پاسخ الف (درست)");
      expect(result.choices).toContain("پاسخ الف (درست)");
      expect(result.choices?.filter((c) => c === result.correctAnswer)).toHaveLength(1);
    });

    it("correctly resolves Persian letter 'ج' to choice index 2 before shuffling", () => {
      const input = {
        question: "کدام گزینه صحیح است؟",
        choices: ["غلط ۱", "غلط ۲", "پاسخ ج (هدف)", "غلط ۴"],
        correctAnswer: "ج",
      };

      const result = canonicalizeAndShuffleQuestion(input);

      expect(result.correctAnswer).toBe("پاسخ ج (هدف)");
      expect(result.choices).toContain("پاسخ ج (هدف)");
    });

    it("handles non-array or single-item choices gracefully", () => {
      const single = {
        question: "سوال تک گزینه‌ای",
        choices: ["فقط یک گزینه"],
        correctAnswer: "فقط یک گزینه",
      };
      expect(canonicalizeAndShuffleQuestion(single)).toEqual(single);

      const empty = {
        question: "سوال بدون گزینه",
        choices: null,
        correctAnswer: "پاسخ تشریحی",
      };
      expect(canonicalizeAndShuffleQuestion(empty)).toEqual(empty);
    });
  });

  describe("4. validateQuestionIntegrity", () => {
    it("validates a standard 4-choice question with single correct answer", () => {
      const validQ = {
        question: "سوال استاندارد",
        choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه ۲",
      };

      const res = validateQuestionIntegrity(validQ);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("rejects questions with duplicate choices", () => {
      const duplicateQ = {
        question: "سوال با گزینه تکراری",
        choices: ["گزینه الف", "گزینه الف", "گزینه ب", "گزینه ج"],
        correctAnswer: "گزینه الف",
      };

      const res = validateQuestionIntegrity(duplicateQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("distinct"))).toBe(true);
    });

    it("rejects questions with empty string choices", () => {
      const emptyChoiceQ = {
        question: "سوال با گزینه خالی",
        choices: ["گزینه ۱", "", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه ۱",
      };

      const res = validateQuestionIntegrity(emptyChoiceQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("non-empty"))).toBe(true);
    });

    it("rejects questions where correctAnswer is not in choices", () => {
      const missingAnsQ = {
        question: "سوال بدون پاسخ منطبق",
        choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        correctAnswer: "گزینه‌ای که وجود ندارد",
      };

      const res = validateQuestionIntegrity(missingAnsQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("not among the choices"))).toBe(true);
    });
  });

  describe("5. isStudentAnswerCorrect", () => {
    const question = {
      choices: ["داروی الف", "داروی ب (صحیح)", "داروی ج", "داروی د"],
      correctAnswer: "داروی ب (صحیح)",
    };

    it("matches exact text answers", () => {
      expect(isStudentAnswerCorrect("داروی ب (صحیح)", question)).toBe(true);
      expect(isStudentAnswerCorrect("داروی الف", question)).toBe(false);
    });

    it("matches numeric indices matching the correct choice position", () => {
      // "داروی ب (صحیح)" is at index 1
      expect(isStudentAnswerCorrect(1, question)).toBe(true);
      expect(isStudentAnswerCorrect("1", question)).toBe(true);
      expect(isStudentAnswerCorrect(0, question)).toBe(false);
      expect(isStudentAnswerCorrect(2, question)).toBe(false);
    });

    it("matches English/Persian letters matching the correct choice position", () => {
      // index 1 corresponds to 'B' or 'ب'
      expect(isStudentAnswerCorrect("B", question)).toBe(true);
      expect(isStudentAnswerCorrect("b", question)).toBe(true);
      expect(isStudentAnswerCorrect("ب", question)).toBe(true);
      expect(isStudentAnswerCorrect("گزینه ۲", question)).toBe(true);

      expect(isStudentAnswerCorrect("A", question)).toBe(false);
      expect(isStudentAnswerCorrect("الف", question)).toBe(false);
      expect(isStudentAnswerCorrect("C", question)).toBe(false);
    });

    it("returns false for null / undefined answers", () => {
      expect(isStudentAnswerCorrect(null, question)).toBe(false);
      expect(isStudentAnswerCorrect(undefined, question)).toBe(false);
    });
  });

  describe("6. validateQuestionQuality (Quality Gate & Distractor Engineering)", () => {
    it("accepts high-quality same-domain medical multiple-choice question", () => {
      const validMedicalQ = {
        question: "در بیمار مبتلا به پرفشاری خون همراه با برونکواسپاسم، کدام بتابلاکر به دلیل کاردیوسلکتیویتی بر Beta-1 ارجح است؟",
        choices: [
          "بیزوپرولول (Bisoprolol)",
          "پروپرانولول (Propranolol)",
          "کارودیلول (Carvedilol)",
          "تیمولول (Timolol)",
        ],
        correctAnswer: "بیزوپرولول (Bisoprolol)",
      };

      const res = validateQuestionQuality(validMedicalQ, { requireFourChoices: true });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.metrics?.choiceCount).toBe(4);
      expect(res.metrics?.hasPlaceholders).toBe(false);
      expect(res.metrics?.hasForbiddenOmnibus).toBe(false);
    });

    it("rejects placeholder choices like 'گزینه انحرافی ۱'", () => {
      const placeholderQ = {
        question: "کدام مورد مکانیسم اثر داروی خط اول در این مبحث است؟",
        choices: [
          "گزینه صحیح بر اساس شواهد منبع",
          "گزینه انحرافی ۱",
          "گزینه انحرافی ۲",
          "گزینه انحرافی ۳",
        ],
        correctAnswer: "گزینه صحیح بر اساس شواهد منبع",
      };

      const res = validateQuestionQuality(placeholderQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("prohibited placeholder"))).toBe(true);
      expect(res.metrics?.hasPlaceholders).toBe(true);
    });

    it("rejects forbidden lazy options like 'همه موارد' or 'هیچ‌کدام'", () => {
      const lazyQ = {
        question: "کدام عارضه با مصرف داروی دیگوکسین مرتبط است؟",
        choices: [
          "آریتمی‌های بطنی",
          "اختلال دید زرد-سبز (Xanthopsia)",
          "تهوع و بی‌اشتهایی",
          "همه موارد",
        ],
        correctAnswer: "همه موارد",
      };

      const res = validateQuestionQuality(lazyQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("forbidden lazy option"))).toBe(true);
      expect(res.metrics?.hasForbiddenOmnibus).toBe(true);
    });

    it("rejects dummy choices shorter than 2 characters", () => {
      const shortChoiceQ = {
        question: "کدام گزینه صحیح است؟",
        choices: ["داروی الف", "داروی ب", "داروی ج", "x"],
        correctAnswer: "داروی الف",
      };

      const res = validateQuestionQuality(shortChoiceQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("too short"))).toBe(true);
    });

    it("rejects extreme length asymmetry giveaways where correct answer is heavily detailed and distractors are tiny stubs", () => {
      const extremeAsymmetryQ = {
        question: "مکانیسم دقیق فارماکولوژیک داروی انتخابی در کنترل بحران قلبی-عروقی کدام است؟",
        choices: [
          "مهار انتخابی و رقابتی گیرنده‌های Beta-1 با کاهش خودکاری گره سینوسی، کاهش اینوتروپی و مهار آزادسازی رنین از دستگاه جوکستاگلومرولار کلیه",
          "کاهش درد",
          "تسکین تب",
          "اثر ساده",
        ],
        correctAnswer: "مهار انتخابی و رقابتی گیرنده‌های Beta-1 با کاهش خودکاری گره سینوسی، کاهش اینوتروپی و مهار آزادسازی رنین از دستگاه جوکستاگلومرولار کلیه",
      };

      const res = validateQuestionQuality(extremeAsymmetryQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("disproportionately longer than distractors"))).toBe(true);
    });

    it("treats moderate natural length variations as warnings rather than hard rejects", () => {
      const moderateVariationQ = {
        question: "مکانیسم عمل کدام است؟",
        choices: [
          "مهار اختصاصی پمپ پروتون (H+/K+-ATPase)",
          "بلوک گیرنده‌های H2 هیستامینی",
          "خنثی‌سازی اسید معده",
          "محافظت از موکوس مخاط",
        ],
        correctAnswer: "مهار اختصاصی پمپ پروتون (H+/K+-ATPase)",
      };

      const res = validateQuestionQuality(moderateVariationQ);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("rejects clue leakage when choice is verbatim identical to question", () => {
      const clueLeakQ = {
        question: "بیزوپرولول",
        choices: ["بیزوپرولول", "پروپرانولول", "آتنولول", "تیمولول"],
        correctAnswer: "بیزوپرولول",
      };

      const res = validateQuestionQuality(clueLeakQ);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("identical to the question text"))).toBe(true);
    });
  });

  describe("7. High-Volume Statistical Distribution & Invariant Guarantees (1,000 Questions)", () => {
    it("shuffles 1,000 Option-A biased questions into a statistically balanced distribution across A, B, C, D", () => {
      const N = 1000;
      const positionCounts = { A: 0, B: 0, C: 0, D: 0 };

      for (let i = 0; i < N; i++) {
        const correctText = `داروی صحیح شماره ${i}`;
        const input = {
          question: `سوال شماره ${i}: کدام دارو در خط اول قرار دارد؟`,
          choices: [
            correctText, // Initially 100% in Option A
            `داروی غلط ۱-${i}`,
            `داروی غلط ۲-${i}`,
            `داروی غلط ۳-${i}`,
          ],
          correctAnswer: correctText,
        };

        const result = canonicalizeAndShuffleQuestion(input);

        // 1. Invariant: Exactly 4 choices
        expect(result.choices).toHaveLength(4);
        // 2. Invariant: Exact answer preservation
        expect(result.correctAnswer).toBe(correctText);
        // 3. Invariant: Single occurrence of answer in choices
        expect(result.choices?.filter((c) => c === correctText)).toHaveLength(1);
        // 4. Invariant: Distinct choices
        expect(new Set(result.choices).size).toBe(4);
        // 5. Invariant: Grading validity
        expect(isStudentAnswerCorrect(result.correctAnswer, result)).toBe(true);

        const newPosIdx = result.choices?.indexOf(correctText) ?? -1;
        expect(newPosIdx).toBeGreaterThanOrEqual(0);
        expect(newPosIdx).toBeLessThan(4);

        const letter = String.fromCharCode(65 + newPosIdx) as "A" | "B" | "C" | "D";
        positionCounts[letter]++;
      }

      // Statistical assertions:
      // Option A must NOT dominate (should be far from 100%, near ~25%)
      expect(positionCounts.A).toBeLessThan(350);
      expect(positionCounts.A).toBeGreaterThan(150);

      expect(positionCounts.B).toBeLessThan(350);
      expect(positionCounts.B).toBeGreaterThan(150);

      expect(positionCounts.C).toBeLessThan(350);
      expect(positionCounts.C).toBeGreaterThan(150);

      expect(positionCounts.D).toBeLessThan(350);
      expect(positionCounts.D).toBeGreaterThan(150);

      const total = positionCounts.A + positionCounts.B + positionCounts.C + positionCounts.D;
      expect(total).toBe(1000);
    });

    it("maintains strict answer preservation across multiple consecutive shuffles", () => {
      const initial = {
        question: "داروی کاهنده قند خون از دسته بیگوانیدها کدام است؟",
        choices: ["متفورمین (صحیح)", "گلی‌بن‌کلامید", "پیوگلیتازون", "سیتاگلیپتین"],
        correctAnswer: "متفورمین (صحیح)",
      };

      let current = initial;
      for (let run = 0; run < 10; run++) {
        current = canonicalizeAndShuffleQuestion(current);
        expect(current.correctAnswer).toBe("متفورمین (صحیح)");
        expect(current.choices).toContain("متفورمین (صحیح)");
        expect(current.choices?.filter((c) => c === "متفورمین (صحیح)")).toHaveLength(1);
        expect(isStudentAnswerCorrect("متفورمین (صحیح)", current)).toBe(true);
      }
    });
  });
});
