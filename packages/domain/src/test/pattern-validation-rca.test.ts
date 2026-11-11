import { describe, it, expect } from "vitest";
import { validatePatternSemanticCompliance } from "../pattern-validation.js";
import { validateQuestionQuality } from "../question-shuffling.js";

describe("Pattern Validation RCA Test Suite", () => {
  describe("Pattern 8: Multilingual Numerals & Clinical Problem Solving", () => {
    const P8_ID = "10000000-0000-4000-a000-000000000008";

    it("accepts Persian digits in clinical threshold scenario (Q2 bug repro)", () => {
      const q = {
        question: "در یک بیمار دیابتی با مقدار eGFR معادل ۳۸ میلی‌لیتر در دقیقه، دوز متفورمین چگونه تنظیم می‌شود؟",
        choices: [
          "مصرف دارو کاملاً بلامانع است",
          "تجویز دارو منع مصرف دارد",
          "دوز کل روزانه نباید از ۱۰۰۰ میلی‌گرم تجاوز کند",
          "دوز دارو باید به حداکثر ۲۵۵۰ میلی‌گرم افزایش یابد",
        ],
        correctAnswer: "دوز کل روزانه نباید از ۱۰۰۰ میلی‌گرم تجاوز کند",
        explanation: "در محدوده eGFR بین ۳۰ تا ۴۴ دوز روزانه متفورمین باید حداکثر تا ۱۰۰۰ میلی‌گرم در روز تنظیم شود.",
      };

      const result = validatePatternSemanticCompliance(q, P8_ID);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.passedChecks).toContain("انطباق با الگوی ۸ (محاسبات کمی یا حل مسئله بالینی داده‌محور)");
      expect(result.warnings).not.toContain("سؤال فاقد شاخص‌های بارز محاسباتی یا معیارهای عددی حل مسئله است.");
    });

    it("accepts Arabic digits and decimals in calculations", () => {
      const q = {
        question: "اگر میزان افت هموگلوبین گلیکوزیله با متفورمین معادل ١.٥ درصد باشد، چه اثری بر قند خون دارد؟",
        choices: ["١٠ درصد", "٢٠ درصد", "٣٠ درصد", "٤٠ درصد"],
        correctAnswer: "٢٠ درصد",
        explanation: "کاهش ١.٥ درصدی منجر به افت ٢٠ درصدی می‌شود.",
      };

      const result = validatePatternSemanticCompliance(q, P8_ID);
      expect(result.valid).toBe(true);
      expect(result.passedChecks).toContain("انطباق با الگوی ۸ (محاسبات کمی یا حل مسئله بالینی داده‌محور)");
    });

    it("accepts English digits and dosages", () => {
      const q = {
        question: "در صورت eGFR معادل 35 ml/min دوز مجاز چند میلی‌گرم است؟",
        choices: ["500 mg", "1000 mg", "1500 mg", "2000 mg"],
        correctAnswer: "1000 mg",
        explanation: "بر اساس گایدلاین دوز باید 1000 mg باشد.",
      };

      const result = validatePatternSemanticCompliance(q, P8_ID);
      expect(result.valid).toBe(true);
      expect(result.passedChecks).toContain("انطباق با الگوی ۸ (محاسبات کمی یا حل مسئله بالینی داده‌محور)");
    });

    it("warns when question lacks numerical markers or clinical thresholds", () => {
      const q = {
        question: "کدام مکانیسم به عنوان اثر اصلی متفورمین در کاهش گلوکوز شناخته می‌شود؟",
        choices: ["مهار گلوکونئوژنز", "تحریک انسولین", "مهار آلفاگلوکوزیداز", "افزایش اشتها"],
        correctAnswer: "مهار گلوکونئوژنز",
        explanation: "متفورمین گلوکونئوژنز کبدی را مهار می‌کند.",
      };

      const result = validatePatternSemanticCompliance(q, P8_ID);
      expect(result.warnings).toContain("سؤال فاقد شاخص‌های بارز محاسباتی یا معیارهای عددی حل مسئله است.");
      expect(result.score).toBeLessThan(100);
    });
  });

  describe("Pattern 11: Negative Lead-in vs Positive Substrings & Agonist False Positive", () => {
    const P11_ID = "10000000-0000-4000-a000-000000000011";

    it("REJECTS positive questions containing the word آگونیست (Agonist False Positive Bug)", () => {
      const q = {
        question: "در رابطه با ممنوعیت‌های مصرف، هشدارها و عوارض جانبی آگونیست‌های گیرنده GLP-1، کدام گزینه از نظر بالینی درست است؟",
        choices: [
          "این داروها هشدار جعبه‌ای دارند",
          "باعث تخلیه سریع معده می‌شوند",
          "ریسک هیپوگلیسمی در مونوتراپی بسیار بالاست",
          "در پانکراتیت حاد خط اول درمان هستند",
        ],
        correctAnswer: "این داروها هشدار جعبه‌ای دارند",
        explanation: "آگونیست‌های GLP-1 هشدار جعبه‌ای دارند.",
      };

      const result = validatePatternSemanticCompliance(q, P11_ID);
      expect(result.valid).toBe(false);
      expect(result.failedChecks.some((f) => f.includes("فاقد عبارات منفی صریح"))).toBe(true);
    });

    it("REJECTS positive phrasing ending with کدام گزینه صحیح است", () => {
      const q = {
        question: "کدام یک از موارد زیر در ارتباط با مکانیسم اثر مهارکننده‌های آنزیم DPP-4 صحیح است؟",
        choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
        correctAnswer: "گزینه الف",
        explanation: "توضیح...",
      };

      const result = validatePatternSemanticCompliance(q, P11_ID);
      expect(result.valid).toBe(false);
      expect(result.failedChecks.some((f) => f.includes("فاقد عبارات منفی صریح"))).toBe(true);
    });

    it("ACCEPTS genuine negative lead-ins with نادرست, غلط, به‌جز, صحیح نیست", () => {
      const negativeStems = [
        "در خصوص آگونیست‌های گیرنده GLP-1، کدام عبارت نادرست است؟",
        "کدام مورد در خصوص داروی متفورمین غلط است؟",
        "تمام موارد زیر از عوارض جانبی این دارو هستند به‌جز:",
        "کدام گزینه در رابطه با مهارکننده‌های DPP-4 صحیح نیست؟",
        "کدام ویژگی در مورد این دسته دارویی صادق نیست؟",
      ];

      for (const stem of negativeStems) {
        const q = {
          question: stem,
          choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
          correctAnswer: "گزینه ۱",
          explanation: "گزینه ۱ نادرست است زیرا...",
        };
        const result = validatePatternSemanticCompliance(q, P11_ID);
        expect(result.valid).toBe(true);
        expect(result.passedChecks).toContain("صورت سؤال دارای لید-این منفی صریح است");
      }
    });
  });

  describe("Pattern 3: Comparative Analysis & Discrimination", () => {
    const P3_ID = "10000000-0000-4000-a000-000000000003";

    it("accepts morphological variants like متمایز می‌سازد (Q1 bug repro)", () => {
      const q = {
        question: "کدام ویژگی فارماکولوژیک اصلی متفورمین را از دسته سولفونیل‌اوره‌ها متمایز می‌سازد؟",
        choices: [
          "کاهش گلوکونئوژنز بدون هیپوگلیسمی",
          "تحریک ترشح انسولین با بستن کانال‌ها",
          "افزایش وزن قابل توجه",
          "دفع صرفاً از طریق سیتوکروم P450",
        ],
        correctAnswer: "کاهش گلوکونئوژنز بدون هیپوگلیسمی",
        explanation: "متفورمین بر خلاف سولفونیل‌اوره‌ها هیپوگلیسمی نمی‌دهد.",
      };

      const result = validatePatternSemanticCompliance(q, P3_ID);
      expect(result.valid).toBe(true);
      expect(result.passedChecks).toContain("وجود عبارات نشان‌دهنده مقایسه و تمایز در صورت سؤال یا گزینه‌ها");
    });

    it("accepts comparative structure in choices (در حالی که)", () => {
      const q = {
        question: "تأثیر رده‌های دارویی اینکرتین بر وزن بیمار چگونه ارزیابی می‌شود؟",
        choices: [
          "آگونیست‌های GLP-1 وزن را کاهش می‌دهند در حالی که مهارکننده‌های DPP-4 خنثی هستند",
          "هر دو دسته باعث کاهش وزن شدید می‌شوند",
          "هر دو دسته باعث افزایش وزن می‌شوند",
          "هیچ‌کدام اثری بر اشتها ندارند",
        ],
        correctAnswer: "آگونیست‌های GLP-1 وزن را کاهش می‌دهند در حالی که مهارکننده‌های DPP-4 خنثی هستند",
        explanation: "توضیح...",
      };

      const result = validatePatternSemanticCompliance(q, P3_ID);
      expect(result.valid).toBe(true);
      expect(result.passedChecks).toContain("وجود عبارات نشان‌دهنده مقایسه و تمایز در صورت سؤال یا گزینه‌ها");
    });

    it("warns when question is a single-concept recall without comparison", () => {
      const q = {
        question: "میانگین انتظار کاهش هموگلوبین گلیکوزیله با مصرف متفورمین چقدر است؟",
        choices: ["۰.۳ تا ۰.۵ درصد", "۰.۷ تا ۱.۰ درصد", "۱.۳ تا ۲.۰ درصد", "۲.۵ تا ۳.۵ درصد"],
        correctAnswer: "۱.۳ تا ۲.۰ درصد",
        explanation: "متفورمین ۱.۳ تا ۲.۰ درصد کاهش می‌دهد.",
      };

      const result = validatePatternSemanticCompliance(q, P3_ID);
      expect(result.warnings.some((w) => w.includes("فاقد کلمات کلیدی و ساختار صریح مقایسه"))).toBe(true);
    });
  });

  describe("Pattern 6: Multi-step Reasoning", () => {
    const P6_ID = "10000000-0000-4000-a000-000000000006";

    it("accepts questions with explicit 2-step reasoning in explanation", () => {
      const q = {
        question: "در یک بیمار دیابتی مبتلا به نارسایی کلیوی با eGFR=25، رویکرد درمانی ارجح کدام است؟",
        choices: [
          "قطع متفورمین و جایگزینی با لیناگلیپتین",
          "افزایش دوز متفورمین به ۲۰۰۰ میلی‌گرم",
          "تجویز سولفونیل‌اوره با دوز حداکثر",
          "ادامه درمان قبلی بدون تغییر",
        ],
        correctAnswer: "قطع متفورمین و جایگزینی با لیناگلیپتین",
        explanation: "گام ۱: با توجه به eGFR کمتر از ۳۰، متفورمین منع مصرف مطلق دارد. گام ۲: از میان گزینه‌ها، لیناگلیپتین به دلیل دفع صفراوی نیازی به تعدیل دوز کلیوی ندارد.",
      };

      const result = validatePatternSemanticCompliance(q, P6_ID);
      expect(result.valid).toBe(true);
      expect(result.passedChecks).toContain("پشتیبانی از زنجیره استدلال تحلیلی چندمرحله‌ای");
    });

    it("warns on pure rote recall questions", () => {
      const q = {
        question: "کدام دارو جزو دسته بیگوانیدها است؟",
        choices: ["متفورمین", "سیتاگلیپتین", "گلی‌بن‌کلامید", "پیوگلیتازون"],
        correctAnswer: "متفورمین",
        explanation: "متفورمین بیگوانید است.",
      };

      const result = validatePatternSemanticCompliance(q, P6_ID);
      expect(result.warnings.some((w) => w.includes("تفکیک دو گام استنتاجی مشاهده نشد"))).toBe(true);
    });
  });

  describe("Distractor Engineering: Short Options False Warning & Quality Gates", () => {
    it("does NOT warn on short option length disparity with small character gap (e.g. 10 vs 24 chars, 8 char gap)", () => {
      const q = {
        question: "کدام گروه از داروهای ضددیابت دارای هشدار جعبه‌ای هستند؟",
        choices: [
          "بیگوانیدها",
          "سولفونیل‌اوره‌ها",
          "آگونیست‌های گیرنده GLP-1",
          "مهارکننده‌های DPP-4",
        ],
        correctAnswer: "آگونیست‌های گیرنده GLP-1",
      };

      const quality = validateQuestionQuality(q);
      expect(quality.valid).toBe(true);
      expect(quality.warnings).toEqual([]);
    });

    it("REJECTS forbidden lazy option هیچ‌کدام از موارد", () => {
      const q = {
        question: "کدام دارو دارای هشدار نارسایی قلبی است؟",
        choices: ["سیتاگلیپتین", "ساکساگلیپتین", "لیناگلیپتین", "هیچ‌کدام از موارد"],
        correctAnswer: "ساکساگلیپتین",
      };

      const quality = validateQuestionQuality(q);
      expect(quality.valid).toBe(false);
      expect(quality.errors.some((e) => e.includes("forbidden lazy option"))).toBe(true);
    });

    it("REJECTS exclusive explanatory markers in correct choice", () => {
      const q = {
        question: "مکانیسم سولفونیل‌اوره‌ها کدام است؟",
        choices: [
          "فعال‌سازی گیرنده‌های اینکرتینی در سلول‌های آلفا",
          "اتصال به گیرنده SUR1 به منظور دپلاریزاسیون غشا",
          "مهار آنزیم مبدل آنژیوتانسین در بافت جزایر",
          "تحریک مستقیم آنزیم آدنیلات سیکلاز",
        ],
        correctAnswer: "اتصال به گیرنده SUR1 به منظور دپلاریزاسیون غشا",
      };

      const quality = validateQuestionQuality(q);
      expect(quality.valid).toBe(false);
      expect(quality.errors.some((e) => e.includes("explanatory/justification clauses"))).toBe(true);
    });
  });
});
