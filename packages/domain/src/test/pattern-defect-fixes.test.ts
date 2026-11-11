import { describe, it, expect } from "vitest";
import {
  validatePatternSemanticCompliance,
} from "../pattern-validation.js";
import {
  validateQuestionQuality,
  detectAnswerLeakage,
  normalizeQuestionOptions,
  sanitizeQuestionTypographicalGlitch,
} from "../question-shuffling.js";

describe("Pattern Defect Fixes & Regression Test Suite", () => {
  const P6_ID = "10000000-0000-4000-a000-000000000006";
  const P8_ID = "10000000-0000-4000-a000-000000000008";
  const P11_ID = "10000000-0000-4000-a000-000000000011";

  // -------------------------------------------------------------------------
  // 1. Fixing Explanatory Marker: "از طریق" & P11 Q4 Regression
  // -------------------------------------------------------------------------
  describe("1. Explanatory Marker vs Physiological Excretion Routes (P11 Q4)", () => {
    it("accepts P11 Q4 where correct choice uses physiological excretion route 'از طریق کلیه‌ها'", () => {
      const p11q4 = {
        question: "درباره ویژگی‌های فارماکوکینتیک و بالینی مهارکننده‌های آنزیم DPP-4، کدام عبارت غلط است؟",
        choices: [
          "مهارکننده‌های DPP-4 با مهار تخریب GIP و GLP-1 سطح این اینکرتین‌های درون‌زا را به صورت فیزیولوژیک افزایش می‌دهند.",
          "این داروها برخلاف آگونیست‌های گیرنده GLP-1 تأثیر قابل توجهی بر سیری و تأخیر در تخلیه معده ندارند.",
          "سیتاگلیپتین به میزان زیادی به صورت داروی تغییرنیافته از راه کلیه دفع می‌شود.",
          "لیناگلیپتین از طریق کلیه‌ها دفع می‌شود و در بیماران با آسیب کلیوی نیازمند کاهش دوز جدی است.",
        ],
        correctAnswer: "لیناگلیپتین از طریق کلیه‌ها دفع می‌شود و در بیماران با آسیب کلیوی نیازمند کاهش دوز جدی است.",
        explanation: "بر اساس درسنامه، لیناگلیپتین برخلاف سایر مهارکننده‌های DPP-4 عمدتاً از طریق صفرا و مدفوع دفع می‌شود و نیازی به تعدیل دوز در آسیب کلیوی ندارد.",
      };

      const qualityResult = validateQuestionQuality(p11q4, {
        requireFourChoices: true,
        rejectAnswerLeakage: true,
      });

      expect(qualityResult.valid).toBe(true);
      expect(qualityResult.errors).toEqual([]);
      expect(qualityResult.metrics?.leakageReport?.hasLeakage).toBe(false);

      const semanticResult = validatePatternSemanticCompliance(p11q4, P11_ID);
      expect(semanticResult.valid).toBe(true);
      expect(semanticResult.passedChecks).toContain("صورت سؤال دارای لید-این منفی صریح است");
    });

    it("does NOT flag physiological excretion or administration routes as explanatory leakage", () => {
      const routes = [
        "از طریق کلیه‌ها",
        "از طریق صفرا",
        "از طریق کبد",
        "از طریق پوست",
        "از طریق ورید",
        "از طریق مجرای صفراوی و مدفوع",
      ];

      for (const route of routes) {
        const q = {
          question: "مسیر اصلی دفع این متابولیت کدام است؟",
          choices: [
            `دفع عمده ${route} صورت می‌گیرد`,
            "تجمع در بافت چربی",
            "تبخیر از راه ریه",
            "اتصال برگشت‌ناپذیر به پروتئین",
          ],
          correctAnswer: `دفع عمده ${route} صورت می‌گیرد`,
        };

        const leakage = detectAnswerLeakage(q);
        expect(leakage.features.explanatoryClauseAsymmetry).toBe(false);
      }
    });

    it("STILL correctly flags causal/mechanistic explanatory clauses using 'از طریق'", () => {
      const mechanisticExplanations = [
        "از طریق مهار آنزیم فسفودی‌استراز",
        "از طریق تحریک ترشح انسولین از بتا سلول‌ها",
        "از طریق فعال‌سازی گیرنده‌های هسته‌ای",
        "از طریق کاهش مقاومت به انسولین در بافت هدف",
        "از طریق مسدود ساختن کانال‌های کلسیمی وابسته به ولتاژ",
      ];

      for (const mech of mechanisticExplanations) {
        const q = {
          question: "کدام دارو بیشترین اثر را در این بیماری دارد؟",
          choices: [
            `داروی الف، ${mech}`,
            "داروی ب",
            "داروی ج",
            "داروی د",
          ],
          correctAnswer: `داروی الف، ${mech}`,
        };

        const leakage = detectAnswerLeakage(q);
        expect(leakage.hasLeakage).toBe(true);
        expect(leakage.features.explanatoryClauseAsymmetry).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Pattern 8: Acronym Numbers & Computational Problem Solving
  // -------------------------------------------------------------------------
  describe("2. Pattern 8 Computational Detection & Acronym Stripping", () => {
    it("REJECTS P8 Q6 from being qualified as computational (Negative Test)", () => {
      const p8q6 = {
        question: "کدام دارو از گروه مهارکننده‌های DPP-4 برخلاف سایر اعضای هم‌دسته، به طور عمده از طریق صفرا و مدفوع دفع شده و نیازی به تعدیل دوز در بیماران مبتلا به نارسایی کلیوی ندارد؟",
        choices: ["لیناگلیپتین", "سیتاگلیپتین", "ساکساگلیپتین", "آلوگلیپتین"],
        correctAnswer: "لیناگلیپتین",
        explanation: "لیناگلیپتین دفع عمدتاً غیرکلیوی دارد.",
      };

      const result = validatePatternSemanticCompliance(p8q6, P8_ID);
      expect(result.score).toBeLessThan(100);
      expect(result.warnings).toContain("سؤال فاقد شاخص‌های بارز محاسباتی یا معیارهای عددی حل مسئله است.");
      expect(result.passedChecks).not.toContain("انطباق با الگوی ۸ (محاسبات کمی یا حل مسئله بالینی داده‌محور)");
    });

    it("does not allow clinical acronym numbers (GLP-1, SGLT-2, MEN-2, B12, Type 1/2) to fake numerical problems", () => {
      const acronymQuestions = [
        {
          question: "کدام آگونیست گیرنده GLP-1 نیمه‌عمر طولانی‌تری دارد؟",
          choices: ["دولاگلوتاید", "لیراگلوتاید", "اگزماتاید", "لیکسیسناتاید"],
        },
        {
          question: "کدام مهارکننده SGLT-2 بیشترین محافظت قلبی را نشان داده است؟",
          choices: ["امپاگلیفلوزین", "داپاگلیفلوزین", "کاناگلیفلوزین", "اروتوگلیفلوزین"],
        },
        {
          question: "در مبتلایان به سندرم MEN-2 کدام دارو منع مصرف دارد؟",
          choices: ["لیراگلوتاید", "متفورمین", "گلی‌بن‌کلامید", "پیوگلیتازون"],
        },
        {
          question: "در دیابت نوع ۲ کدام رده دارویی خط اول است؟",
          choices: ["بیگوانیدها", "سولفونیل‌اوره‌ها", "تیازولیدین‌دیون‌ها", "مهارکننده‌های آلفاگلوکوزیداز"],
        },
      ];

      for (const item of acronymQuestions) {
        const q = {
          ...item,
          correctAnswer: item.choices[0],
          explanation: "توضیح...",
        };
        const result = validatePatternSemanticCompliance(q, P8_ID);
        expect(result.warnings).toContain("سؤال فاقد شاخص‌های بارز محاسباتی یا معیارهای عددی حل مسئله است.");
      }
    });

    it("ACCEPTS P8 Q1 as genuine computational problem solving (Positive Test)", () => {
      const p8q1 = {
        question: "بیمار مبتلا به دیابت نوع ۲ با سطح پایه هموگلوبین A1c معادل ۹.۰٪، تحت درمان مونوتراپی با متفورمین قرار می‌گیرد. با فرض کاهش ۱.۳٪ تا ۲.۰٪ در HbA1c توسط متفورمین، سطح A1c مورد انتظار پس از دوره درمان در چه محدوده‌ای قرار خواهد گرفت؟",
        choices: [
          "بین ۷.۰٪ تا ۷.۷٪",
          "بین ۷.۸٪ تا ۸.۵٪",
          "بین ۸.۶٪ تا ۹.۰٪",
          "بین ۶.۰٪ تا ۶.۹٪",
        ],
        correctAnswer: "بین ۷.۰٪ تا ۷.۷٪",
        explanation: "سطح اولیه ۹.۰ منهای ۱.۳ تا ۲.۰ درصد کاهش، دامنه ۷.۰٪ تا ۷.۷٪ را نتیجه می‌دهد.",
      };

      const result = validatePatternSemanticCompliance(p8q1, P8_ID);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.passedChecks).toContain("انطباق با الگوی ۸ (محاسبات کمی یا حل مسئله بالینی داده‌محور)");
      expect(result.warnings).not.toContain("سؤال فاقد شاخص‌های بارز محاسباتی یا معیارهای عددی حل مسئله است.");
    });

    it("ACCEPTS P8 Q2 as genuine quantitative clinical threshold problem solving (Positive Test)", () => {
      const p8q2 = {
        question: "در یک بیمار دیابتی با مقدار eGFR معادل ۳۸ میلی‌لیتر در دقیقه بر ۱.۷۳ متر مربع، بر اساس دستورالعمل تطبیق دوز متفورمین در نارسایی کلیوی، تصمیم بالینی صحیح در خصوص تنظیم دوز روزانه کدام است؟",
        choices: [
          "قطع کامل مصرف دارو به دلیل منع مصرف قطعی",
          "محدود کردن حداکثر دوز روزانه به ۱۰۰۰ میلی‌گرم",
          "ادامه درمان با حداکثر دوز ۲۵۵۰ میلی‌گرم بدون تغییر",
          "افزایش دوز روزانه تا سقف ۳۰۰۰ میلی‌گرم",
        ],
        correctAnswer: "محدود کردن حداکثر دوز روزانه به ۱۰۰۰ میلی‌گرم",
        explanation: "در بیماران با eGFR بین ۳۰ تا ۴۴ میلی‌لیتر بر دقیقه، دوز متفورمین به حداکثر ۱۰۰۰ میلی‌گرم در روز محدود می‌شود.",
      };

      const result = validatePatternSemanticCompliance(p8q2, P8_ID);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.passedChecks).toContain("انطباق با الگوی ۸ (محاسبات کمی یا حل مسئله بالینی داده‌محور)");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Typographical Glitch Sanitizer
  // -------------------------------------------------------------------------
  describe("3. Typographical Glitch Sanitization (sanitizeQuestionTypographicalGlitch)", () => {
    it("corrects 'انسارین' to 'انسولین' in question stem, choices, and explanation", () => {
      const textWithTypo = "مکانیزم اثر سلولی سولفونیل‌اوره‌ها در تحریک ترشح انسارین از سلول‌های بتا پانکراس چیست؟";
      const sanitized = sanitizeQuestionTypographicalGlitch(textWithTypo);
      expect(sanitized).toBe("مکانیزم اثر سلولی سولفونیل‌اوره‌ها در تحریک ترشح انسولین از سلول‌های بتا پانکراس چیست؟");
    });

    it("corrects 'اکرام eGFR' and related lab metrics to 'مقدار'", () => {
      const textWithTypo = "بیمار ۶۸ ساله‌ای با بیماری مزمن کلیوی و اکرام eGFR برابر با ۴۰ میلی‌لیتر بر دقیقه تحت درمان است.";
      const sanitized = sanitizeQuestionTypographicalGlitch(textWithTypo);
      expect(sanitized).toContain("مقدار eGFR");
      expect(sanitized).not.toContain("اکرام eGFR");
    });

    it("does not alter legitimate Persian usages of 'اکرام'", () => {
      const legitimateText = "اکرام بیمار و حفظ کرامت انسانی وی در اولویت کادر درمان است.";
      const sanitized = sanitizeQuestionTypographicalGlitch(legitimateText);
      expect(sanitized).toBe(legitimateText);
    });

    it("fixes glued plural suffixes 'های' without space before subsequent word", () => {
      const gluedText = "درباره مکانیسم اثر و ویژگی‌هایارتباطی سولفونیل‌اوره‌ها در درمان دیابت نوع ۲، کدام گزینه اشتباه است؟";
      const sanitized = sanitizeQuestionTypographicalGlitch(gluedText);
      expect(sanitized).toContain("ویژگی‌های ارتباطی");
      expect(sanitized).not.toContain("ویژگی‌هایارتباطی");
    });

    it("integrates seamlessly into normalizeQuestionOptions", () => {
      const rawQ = {
        question: "تحریک ترشح انسارین با کدام دارو رخ می‌دهد؟",
        choices: ["گلی‌بن‌کلامید", "متفورمین", "آکاربوز", "پیوگلیتازون"],
        correctAnswer: "گلی‌بن‌کلامید",
        explanation: "سولفونیل‌اوره‌ها ترشح انسارین را افزایش می‌دهند.",
      };

      const norm = normalizeQuestionOptions(rawQ);
      expect(norm.repaired).toBe(true);
      expect(norm.normalized.question).toBe("تحریک ترشح انسولین با کدام دارو رخ می‌دهد؟");
      expect(norm.normalized.explanation).toBe("سولفونیل‌اوره‌ها ترشح انسولین را افزایش می‌دهند.");
      expect(norm.repairedFields).toContain("sanitized_typographical_glitches");
    });
  });

  // -------------------------------------------------------------------------
  // 4. Pattern 6: Reasoning Context vs Pseudo-step Rote Recall
  // -------------------------------------------------------------------------
  describe("4. Pattern 6 Multi-Step Reasoning Validation", () => {
    it("WARNS on P6 Q4: Single-step mechanism recall with cosmetic 'گام ۱/گام ۲' labels", () => {
      const p6q4 = {
        question: "مکانیزم اثر سلولی سولفونیل‌اوره‌ها در تحریک ترشح انسولین از سلول‌های بتا پانکراس شامل کدام فرآیند اصلی است؟",
        choices: [
          "اتصال به گیرنده SUR1، بستن کانال‌های پتاسیم حساس به ATP، دپلاریزاسیون غشاء و باز شدن کانال‌های کلسیمی",
          "فعال‌سازی گیرنده PPAR-gamma و تحریک ترنسلوکاسیون GLUT4 به غشای سلولی",
          "مهار آنزیم DPP-4 و افزایش نیمه‌عمر اینکرتین‌های درون‌زا در گردش خون",
          "مهار انتقال‌دهنده سدیم-گلوکز در توبول پروگزیمال و افزایش دفع ادراری",
        ],
        correctAnswer: "اتصال به گیرنده SUR1، بستن کانال‌های پتاسیم حساس به ATP، دپلاریزاسیون غشاء و باز شدن کانال‌های کلسیمی",
        explanation: "گام ۱: سولفونیل‌اوره‌ها به زیرواحد SUR1 متصل می‌شوند. گام ۲: کانال پتاسیمی بسته شده، غشا دپلاریزه و ترشح انسولین تحریک می‌شود.",
      };

      const result = validatePatternSemanticCompliance(p6q4, P6_ID);
      expect(result.score).toBeLessThan(100);
      expect(result.warnings).toContain("سؤال و پاسخ تشریحی ممکن است تک‌مرحله‌ای یا حافظه‌محور باشند (تفکیک دو گام استنتاجی مشاهده نشد).");
      expect(result.passedChecks).not.toContain("پشتیبانی از زنجیره استدلال تحلیلی چندمرحله‌ای");
    });

    it("WARNS on P6 Q10: Direct FDA regulatory warning recall with cosmetic steps", () => {
      const p6q10 = {
        question: "کدام هشدار نظارتی جدید توسط سازمان غذا و داروی آمریکا (FDA) در ارتباط با مصرف برخی از مهارکننده‌های DPP-4 صادر شده است؟",
        choices: [
          "هشدار افزایش خطر نارسایی قلبی به خصوص با ساکساگلیپتین و آلوگلیپتین",
          "خطر بروز کارسینوم مدولاری تیروئید و تومورهای سلول C",
          "خطر کتواسیدوز دیابتی ائوگلیسمیک",
          "خطر بروز هیپوگلیسمی شدید در تک‌درمانی",
        ],
        correctAnswer: "هشدار افزایش خطر نارسایی قلبی به خصوص با ساکساگلیپتین و آلوگلیپتین",
        explanation: "گام ۱: سازمان غذا و دارو شواهد کارآزمایی‌های بالینی را ارزیابی نمود. گام ۲: بر این اساس هشدار نارسایی قلبی اضافه شد.",
      };

      const result = validatePatternSemanticCompliance(p6q10, P6_ID);
      expect(result.score).toBeLessThan(100);
      expect(result.warnings).toContain("سؤال و پاسخ تشریحی ممکن است تک‌مرحله‌ای یا حافظه‌محور باشند (تفکیک دو گام استنتاجی مشاهده نشد).");
      expect(result.passedChecks).not.toContain("پشتیبانی از زنجیره استدلال تحلیلی چندمرحله‌ای");
    });

    it("ACCEPTS genuine clinical multi-step reasoning question (e.g. P6 Q1)", () => {
      const p6q1 = {
        question: "بیمار ۶۲ ساله مبتلا به دیابت نوع ۲ با کراتینین سرم بالا و eGFR معادل ۲۲ میلی‌لیتر بر دقیقه که دچار احتباس مایعات شده است مراجعه می‌کند. مناسب‌ترین اقدام درمانی در خصوص داروی متفورمین بیمار کدام است؟",
        choices: [
          "قطع فوری متفورمین به دلیل منع مصرف در eGFR کمتر از ۳۰",
          "کاهش دوز متفورمین به ۵۰۰ میلی‌گرم در روز و پایش ماهیانه",
          "ادامه مصرف متفورمین با دوز ۱۰۰۰ میلی‌گرم همراه با هیدراتاسیون",
          "جایگزینی متفورمین با فن‌فورمین جهت حفظ کنترل قند",
        ],
        correctAnswer: "قطع فوری متفورمین به دلیل منع مصرف در eGFR کمتر از ۳۰",
        explanation: "گام ۱: ارزیابی آزمایشگاهی نشان می‌دهد که eGFR بیمار به ۲۲ رسیده است که پایین‌تر از آستانه قطع مصرف (۳۰ میلی‌لیتر در دقیقه) است. گام ۲: با توجه به خطر تجمع دارو و بروز اسیدوز لاکتیک تهدیدکننده حیات، اقدام درمانی استاندارد قطع فوری دارو است.",
      };

      const result = validatePatternSemanticCompliance(p6q1, P6_ID);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.passedChecks).toContain("پشتیبانی از زنجیره استدلال تحلیلی چندمرحله‌ای");
    });

    it("ACCEPTS non-clinical multi-step reasoning question with conditional / mechanistic deduction chain", () => {
      const nonClinicalP6 = {
        question: "در صورت مهار انتخابی کانال‌های پتاسیم حساس به ATP توسط یک ترکیب دارویی جدید، کدام زنجیره از تغییرات الکتروفیزیولوژیک درون‌سلولی رخ داده و در نتیجه ترشح هورمون چگونه تغییر خواهد کرد؟",
        choices: [
          "دپلاریزاسیون غشاء، ورود یون‌های کلسیم و افزایش ترشح هورمون",
          "هایپرپلاریزاسیون غشاء، مهار ورود کلسیم و سرکوب ترشح",
          "فعال‌سازی آدنیلات سیکلاز، تولید cAMP و ترشح بدون کلسیم",
          "خروج پتاسیم، کاهش پتانسیل عمل و عدم تغییر در ترشح هورمون",
        ],
        correctAnswer: "دپلاریزاسیون غشاء، ورود یون‌های کلسیم و افزایش ترشح هورمون",
        explanation: "گام ۱: مهار کانال‌های پتاسیم مانع خروج K+ شده و پتانسیل غشا را مثبت‌تر (دپلاریزه) می‌کند. گام ۲: دپلاریزاسیون موجب باز شدن کانال‌های وابسته به ولتاژ کلسیم و اگزوسیتوز وزیکول‌های هورمونی می‌گردد.",
      };

      const result = validatePatternSemanticCompliance(nonClinicalP6, P6_ID);
      expect(result.valid).toBe(true);
      expect(result.score).toBe(100);
      expect(result.passedChecks).toContain("پشتیبانی از زنجیره استدلال تحلیلی چندمرحله‌ای");
    });
  });
});
