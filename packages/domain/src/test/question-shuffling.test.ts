import { describe, it, expect } from "vitest";
import {
  resolveCorrectChoiceText,
  shuffleChoices,
  canonicalizeAndShuffleQuestion,
  validateQuestionIntegrity,
  validateQuestionQuality,
  detectAnswerLeakage,
  normalizeQuestionOptions,
  repairQuestionBias,
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
      expect(res.errors.some((e) => e.includes("longer than distractors") || e.includes("brief stubs"))).toBe(true);
    });

    it("treats moderate natural length variations with balanced terminology as valid", () => {
      const moderateVariationQ = {
        question: "مکانیسم عمل کدام است؟",
        choices: [
          "مهار اختصاصی پمپ پروتون اسید معده",
          "بلوک گیرنده‌های هیستامینی",
          "خنثی‌سازی اسید ترشحی معده",
          "محافظت از سد دفاعی موکوس",
        ],
        correctAnswer: "مهار اختصاصی پمپ پروتون اسید معده",
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

  describe("7. Information & Explanation Leakage Detection (Option-to-Option Parity across 13 dimensions)", () => {
    it("rejects question when ONLY correct choice has English equivalent (English asymmetry leakage)", () => {
      const q = {
        question: "کدام دارو در دسته بتابلاکرها قرار دارد؟",
        choices: [
          "پروپرانولول (Propranolol)",
          "لوزارتان",
          "آملودیپین",
          "کاپتوپریل",
        ],
        correctAnswer: "پروپرانولول (Propranolol)",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("English terminology") || e.includes("Answer Leakage"))).toBe(true);
      expect(res.metrics?.leakageReport?.features.englishAsymmetry).toBe(true);
    });

    it("accepts question when ALL choices consistently include English equivalents (symmetric convention)", () => {
      const q = {
        question: "کدام دارو بتابلاکر اختصاصی گیرنده بتا-۱ است؟",
        choices: [
          "بیزوپرولول (Bisoprolol)",
          "پروپرانولول (Propranolol)",
          "تیمولول (Timolol)",
          "کارودیلول (Carvedilol)",
        ],
        correctAnswer: "بیزوپرولول (Bisoprolol)",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.metrics?.leakageReport?.features.englishAsymmetry).toBe(false);
    });

    it("accepts question when ALL choices are in Persian without any English (symmetric baseline)", () => {
      const q = {
        question: "کدام رده دارویی در درمان پرفشاری خون خط اول است؟",
        choices: [
          "مهارکننده‌های آنزیم مبدل آنژیوتانسین",
          "مسدودکننده‌های کانال کلسیم",
          "دیورتیک‌های تیازیدی",
          "مسدودکننده‌های گیرنده بتا",
        ],
        correctAnswer: "مهارکننده‌های آنزیم مبدل آنژیوتانسین",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.metrics?.leakageReport?.hasLeakage).toBe(false);
    });

    it("rejects question when ONLY correct choice contains an explanatory marker ('به دلیل...')", () => {
      const q = {
        question: "مکانیسم اثر داروی انتخابی چیست؟",
        choices: [
          "مهار آنزیم COX-2، به دلیل کاهش سنتز پروستاگلاندین‌های التهابی در بافت آسیب‌دیده",
          "مهار گیرنده هیستامین",
          "مهار کانال کلسیمی",
          "تحریک گیرنده آلفا",
        ],
        correctAnswer: "مهار آنزیم COX-2، به دلیل کاهش سنتز پروستاگلاندین‌های التهابی در بافت آسیب‌دیده",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("explanatory/justification clauses") || e.includes("longer than distractors"))).toBe(true);
      expect(res.metrics?.leakageReport?.features.explanatoryClauseAsymmetry).toBe(true);
    });

    it("rejects question when ONLY correct choice has parenthetical qualification", () => {
      const q = {
        question: "کدام دارو جهت القای بی‌هوشی ترجیح داده می‌شود؟",
        choices: [
          "پروپوفول (شروع اثر سریع و ریکاوری کوتاه)",
          "کتامین",
          "اتومیدات",
          "میدازولام",
        ],
        correctAnswer: "پروپوفول (شروع اثر سریع و ریکاوری کوتاه)",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("parenthetical annotations") || e.includes("Formatting Leakage"))).toBe(true);
      expect(res.metrics?.leakageReport?.features.parenthesesAsymmetry).toBe(true);
    });

    it("rejects question when ONLY correct choice has acronym/abbreviation (e.g. ACEI)", () => {
      const q = {
        question: "کدام رده دارویی در درمان نارسایی قلبی خط اول است؟",
        choices: [
          "مهارکننده‌های رده ACEI",
          "بلوک‌کننده‌های آلفا",
          "وازودیلاتورهای مستقیم",
          "نیترات‌های وریدی",
        ],
        correctAnswer: "مهارکننده‌های رده ACEI",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("English terminology") || e.includes("acronym/abbreviation"))).toBe(true);
      expect(res.metrics?.leakageReport?.hasLeakage).toBe(true);
    });

    it("rejects question when ONLY correct choice contains synonym / alias marker ('یا ...')", () => {
      const q = {
        question: "کدام دارو دی‌هیدروپیریدینی است؟",
        choices: [
          "آملودیپین یا نورواسک",
          "وراپامیل",
          "دیلتیازم",
          "پروپرانولول",
        ],
        correctAnswer: "آملودیپین یا نورواسک",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.metrics?.leakageReport?.features.synonymAsymmetry).toBe(true);
    });

    it("rejects question when ONLY correct choice contains Latin / scientific binomial name", () => {
      const q = {
        question: "کدام داروی گیاهی برای بهبود حافظه به کار می‌رود؟",
        choices: [
          "عصاره گیاه جینکو (Ginkgo biloba)",
          "عصاره گل گاوزبان",
          "عصاره سنبل الطیب",
          "عصاره بابونه",
        ],
        correctAnswer: "عصاره گیاه جینکو (Ginkgo biloba)",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.metrics?.leakageReport?.features.scientificNameAsymmetry || res.metrics?.leakageReport?.features.englishAsymmetry).toBe(true);
    });

    it("rejects question when ONLY correct choice contains descriptive qualifier ('با اثر انتخابی ...')", () => {
      const q = {
        question: "کدام آگونیست در آسم ارجح است؟",
        choices: [
          "سالبوتامول - با اثر اختصاصی بر مجاری تنفسی",
          "اپی‌نفرین",
          "ایزوپروترنول",
          "افدرین",
        ],
        correctAnswer: "سالبوتامول - با اثر اختصاصی بر مجاری تنفسی",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.metrics?.leakageReport?.features.qualifierAsymmetry || res.metrics?.leakageReport?.features.punctuationAsymmetry).toBe(true);
    });

    it("rejects question when ONLY correct choice gives concrete examples ('مانند ...')", () => {
      const q = {
        question: "کدام دسته دارویی اثر آنابولیک بر استخوان دارد؟",
        choices: [
          "آنالوگ‌های هورمون پاراتیروئید مانند ترپاراتید",
          "بیس‌فسفونات‌های آمین‌دار خوراکی",
          "آنتی‌بادی‌های مونوکلونال ضد RANKL",
          "کلسیتونین سینتتیک نوترکیب",
        ],
        correctAnswer: "آنالوگ‌های هورمون پاراتیروئید مانند ترپاراتید",
      };

      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(false);
      expect(res.metrics?.leakageReport?.features.exampleAsymmetry).toBe(true);
    });

    it("does NOT reject question when correct option is only slightly longer without any leakage clues", () => {
      const q = {
        question: "کدام داروی بتابلاکر برای نارسایی قلبی تایید شده است؟",
        choices: [
          "سوکسینات متوپرولول", // 18 chars, 2 words
          "تیمولول",           // 7 chars, 1 word
          "آتنولول",           // 7 chars, 1 word
          "پیندولول",          // 8 chars, 1 word
        ],
        correctAnswer: "سوکسینات متوپرولول",
      };

      // Gap is 11 chars (below 18 char threshold), no English, no parens, no qualifier -> VALID!
      const res = validateQuestionQuality(q);
      expect(res.valid).toBe(true);
      expect(res.metrics?.leakageReport?.hasLeakage).toBe(false);
    });
  });

  describe("8. Safe Option Normalization (normalizeQuestionOptions & repairQuestionBias)", () => {
    it("safely normalizes redundant English parentheticals when distractors have no English", () => {
      const biasedQ = {
        question: "کدام دارو بتابلاکر است؟",
        choices: [
          "پروپرانولول (Propranolol)",
          "لوزارتان",
          "آملودیپین",
          "کاپتوپریل",
        ],
        correctAnswer: "پروپرانولول (Propranolol)",
      };

      const norm = normalizeQuestionOptions(biasedQ);
      expect(norm.repaired).toBe(true);
      expect(norm.canBeRepaired).toBe(true);
      expect(norm.normalized.correctAnswer).toBe("پروپرانولول");
      expect(norm.normalized.choices).toEqual([
        "پروپرانولول",
        "لوزارتان",
        "آملودیپین",
        "کاپتوپریل",
      ]);

      const postValidation = validateQuestionQuality(norm.normalized);
      expect(postValidation.valid).toBe(true);
    });

    it("safely normalizes trailing explanatory phrases when remaining text is a standard drug entity", () => {
      const biasedQ = {
        question: "داروی خط اول در این بیماری کدام است؟",
        choices: [
          "پروپرانولول، به دلیل مهار گیرنده‌های قلبی",
          "متوپرولول",
          "آتنولول",
          "بیزوپرولول",
        ],
        correctAnswer: "پروپرانولول، به دلیل مهار گیرنده‌های قلبی",
      };

      const norm = normalizeQuestionOptions(biasedQ);
      expect(norm.repaired).toBe(true);
      expect(norm.canBeRepaired).toBe(true);
      expect(norm.normalized.correctAnswer).toBe("پروپرانولول");
      expect(norm.normalized.choices).toContain("پروپرانولول");
      expect(norm.repairedFields).toContain("removed_trailing_explanation");

      const postValidation = validateQuestionQuality(norm.normalized);
      expect(postValidation.valid).toBe(true);
    });

    it("does NOT alter questions that cannot be safely normalized without losing scientific meaning", () => {
      const complexBiasedQ = {
        question: "مکانیسم دقیق فارماکولوژی کدام است؟",
        choices: [
          "مهار انتخابی و رقابتی و برگشت‌پذیر آنزیم در بافت میوکارد بطن چپ",
          "کاهش درد",
          "تسکین تب",
          "اثر محیطی",
        ],
        correctAnswer: "مهار انتخابی و رقابتی و برگشت‌پذیر آنزیم در بافت میوکارد بطن چپ",
      };

      const norm = normalizeQuestionOptions(complexBiasedQ);
      expect(norm.repaired).toBe(false);
      expect(norm.canBeRepaired).toBe(false);
      expect(norm.question).toBeNull();
    });

    it("preserves correct answer mapping and invariants after normalization and shuffling", () => {
      const rawQuestion = {
        question: "کدام دارو مهارکننده ACE است؟",
        choices: [
          "کاپتوپریل (Captopril)",
          "لوزارتان",
          "آملودیپین",
          "پروپرانولول",
        ],
        correctAnswer: "کاپتوپریل (Captopril)",
      };

      const directLeakage = detectAnswerLeakage(rawQuestion);
      expect(directLeakage.hasLeakage).toBe(true);
      expect(directLeakage.features.englishAsymmetry).toBe(true);

      const legacyRepair = repairQuestionBias(rawQuestion);
      expect(legacyRepair.repaired).toBe(true);
      expect(legacyRepair.repairedCorrectAnswer).toBe("کاپتوپریل");

      const normalized = normalizeQuestionOptions(rawQuestion);
      expect(normalized.repaired).toBe(true);

      const shuffled = canonicalizeAndShuffleQuestion(normalized.normalized);
      expect(shuffled.choices).toHaveLength(4);
      expect(shuffled.correctAnswer).toBe("کاپتوپریل");
      expect(shuffled.choices).toContain("کاپتوپریل");
      expect(isStudentAnswerCorrect("کاپتوپریل", shuffled)).toBe(true);
      expect(validateQuestionQuality(shuffled).valid).toBe(true);
    });
  });

  describe("9. Persian Language & Text Normalization", () => {
    it("handles Persian half-space (نیم‌فاصله) and Persian numerals correctly without false positives", () => {
      const persianQ = {
        question: "کدام دارو مهارکننده اختصاصی گیرنده بتا-۱ است؟",
        choices: [
          "مهارکننده‌های انتخابی بتا-۱",
          "مهارکننده‌های غیرانتخابی بتا",
          "آگونیست‌های گیرنده‌های آلفا-۲",
          "مسدودکننده‌های کانال کلسیمی",
        ],
        correctAnswer: "مهارکننده‌های انتخابی بتا-۱",
      };

      const res = validateQuestionQuality(persianQ, { requireFourChoices: true });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });
  });

  describe("10. High-Volume Statistical Distribution & Invariant Guarantees (1,000 Questions)", () => {
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

    it("shuffles 10,000 Option-A biased questions with high-precision uniform distribution across A, B, C, D (~25% each)", () => {
      const N = 10000;
      const positionCounts = { A: 0, B: 0, C: 0, D: 0 };

      for (let i = 0; i < N; i++) {
        const correctText = `گزینه هدف ${i}`;
        const input = {
          question: `سوال آزمون شماره ${i}؟`,
          choices: [
            correctText, // 100% position 0
            `گزینه گمراه‌کننده ۱-${i}`,
            `گزینه گمراه‌کننده ۲-${i}`,
            `گزینه گمراه‌کننده ۳-${i}`,
          ],
          correctAnswer: correctText,
        };

        const result = canonicalizeAndShuffleQuestion(input);
        const pos = result.choices?.indexOf(correctText) ?? -1;
        expect(pos).toBeGreaterThanOrEqual(0);
        expect(pos).toBeLessThan(4);

        const letter = String.fromCharCode(65 + pos) as "A" | "B" | "C" | "D";
        positionCounts[letter]++;
      }

      // Expected ~2500 per slot; verify within ~250 (2.5% tolerance)
      expect(positionCounts.A).toBeGreaterThan(2250);
      expect(positionCounts.A).toBeLessThan(2750);

      expect(positionCounts.B).toBeGreaterThan(2250);
      expect(positionCounts.B).toBeLessThan(2750);

      expect(positionCounts.C).toBeGreaterThan(2250);
      expect(positionCounts.C).toBeLessThan(2750);

      expect(positionCounts.D).toBeGreaterThan(2250);
      expect(positionCounts.D).toBeLessThan(2750);

      expect(positionCounts.A + positionCounts.B + positionCounts.C + positionCounts.D).toBe(10000);
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

  describe("11. False Positive Protection & Scientific Integrity Tests", () => {
    it("accepts naturally longer scientific/pharmacological options when all choices share balanced structure without leakage", () => {
      const legitimateSciQ = {
        question: "کدام گروه دارویی برای بیمار دیابتی با پروتئینوری اولویت خط اول است؟",
        choices: [
          "مهارکننده‌های آنزیم مبدل آنژیوتانسین",
          "مسدودکننده‌های کانال کلسیم دی‌هیدروپیریدینی",
          "آگونیست‌های گیرنده آلفا-۲ آدرنرژیک",
          "دیورتیک‌های لوپ هنله",
        ],
        correctAnswer: "مهارکننده‌های آنزیم مبدل آنژیوتانسین",
      };

      const res = validateQuestionQuality(legitimateSciQ, {
        requireFourChoices: true,
        rejectAnswerLeakage: true,
      });

      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("accepts consistent English medical nomenclature when applied symmetrically across all options", () => {
      const symmetricEnglishQ = {
        question: "کدام بتابلاکر برای نارسایی قلبی تاییدیه بالینی دارد؟",
        choices: [
          "متوپرولول سوکسینات (Metoprolol Succinate)",
          "پروپرانولول هیدروکلراید (Propranolol HCl)",
          "آتنولول خوراکی (Atenolol Oral)",
          "سوتالول وریدی (Sotalol IV)",
        ],
        correctAnswer: "متوپرولول سوکسینات (Metoprolol Succinate)",
      };

      const res = validateQuestionQuality(symmetricEnglishQ, {
        requireFourChoices: true,
        rejectAnswerLeakage: true,
      });

      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it("does not artificially force correct != longest if length difference is minor and choices are balanced", () => {
      const slightlyLongerCorrectQ = {
        question: "خط اول درمان دارویی هیپرتانسیون اولیه چیست؟",
        choices: [
          "مهارکننده آنزیم مبدل", // 20 chars (correct)
          "بتابلاکر انتخابی", // 16 chars
          "وازودیلاتور مستقیم", // 17 chars
          "آلفابلاکر محیطی", // 15 chars
        ],
        correctAnswer: "مهارکننده آنزیم مبدل",
      };

      const res = validateQuestionQuality(slightlyLongerCorrectQ, {
        requireFourChoices: true,
        rejectAnswerLeakage: true,
      });

      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });
  });
});


