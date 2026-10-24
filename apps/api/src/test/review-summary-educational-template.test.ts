import { describe, expect, it } from "vitest";
import {
  buildReviewSummaryUserPrompt,
  REVIEW_SUMMARY_SYSTEM_PROMPT,
} from "../modules/generation/prompt-registry.js";
import {
  validateReviewSummaryPayload,
  evaluateReviewSummaryDeterministicCoverage,
  getReviewSummaryConfig,
  type ReviewSummaryPayload,
} from "@avana/domain";

describe("Review Summary Standard Educational Template - Acceptance Scenarios", () => {
  it("includes all 8 standard educational dimensions and subject-adaptive guidance in compiled prompts", () => {
    const prompt = buildReviewSummaryUserPrompt({
      docName: "فارماکولوژی سیستم قلبی عروقی",
      targetReadingMinutes: 12,
      minReadingMinutes: 10,
      maxReadingMinutes: 15,
      chunkContext: "[CHUNK c1]: مهارکننده‌های ACE مانند کاپتوپریل و انالاپریل...",
      chunkIdList: ["c1"],
    });

    // Check System Prompt properties
    expect(REVIEW_SUMMARY_SYSTEM_PROMPT).toContain("JSON");
    expect(REVIEW_SUMMARY_SYSTEM_PROMPT).toContain("LaTeX");

    // Check 8 Dimensions in compiled prompt
    expect(prompt).toContain("STANDARD EDUCATIONAL REVIEW STRUCTURE (8 CORE DIMENSIONS)");
    expect(prompt).toContain("1. Title & Overview");
    expect(prompt).toContain("2. Conceptual Explanation");
    expect(prompt).toContain("3. Sequential Mechanisms & Processes");
    expect(prompt).toContain("4. Clinical Applications");
    expect(prompt).toContain("5. Common Misconceptions");
    expect(prompt).toContain("6. Comparisons");
    expect(prompt).toContain("7. Golden Exam Pearls");
    expect(prompt).toContain("8. Final Takeaways");

    // Check Subject-Adaptive Guidance
    expect(prompt).toContain("SUBJECT-ADAPTIVE GUIDANCE");
    expect(prompt).toContain("Pharmacology");
    expect(prompt).toContain("Biochemistry");
    expect(prompt).toContain("Physiology");
    expect(prompt).toContain("Pathology");
    // Check Table Mandate for Pharmacology and Markdown Table in Schema
    expect(REVIEW_SUMMARY_SYSTEM_PROMPT).toContain("synthesize them into at least one comprehensive, dense Markdown table inside keyPoints");
    expect(prompt).toContain("MANDATORY PHARMACOLOGY COMPARISON TABLE");
    expect(prompt).toContain("| نام دارو یا رده | مکانیسم اثر |");

    // Check Anti-Cliché principles
    expect(prompt).toContain("PREVENTING CLICHÉS");
  });

  // سناریوی اول: یک مبحث فارماکولوژی شامل مکانیسم اثر، کاربرد، عارضه و تداخل دارویی
  describe("Scenario 1: Pharmacology (Mechanism, Indications, Adverse Effects, Exam Points)", () => {
    it("validates and evaluates a pharmacology review summary conforming to standard dimensions", () => {
      const pharmaPayload = {
        kind: "review_summary",
        title: "مهارکننده‌های سیستم رنین-آنژیوتانسین (ACEIs & ARBs)",
        estimatedReadingMinutes: 10,
        overview:
          "این مبحث به بررسی مکانیسم اثر، تفاوت‌های فارماکولوژیک، عوارض جانبی شاخص و کاربرد بالینی داروهای کاهنده فشار خون گروه ACEI و ARB می‌پردازد.",
        sections: [
          {
            title: "مهارکننده‌های آنزیم مبدل آنژیوتانسین (ACEIs)",
            keyPoints: [
              "کاپتوپریل و انالاپریل با مهار رقابتی آنزیم ACE، مانع تبدیل آنژیوتانسین I به آنژیوتانسین II می‌گردند.",
              "کاربرد بالینی: داروی انتخابی خط اول در بیماران مبتلا به نارسایی قلبی و نفروپاتی دیابتی به دلیل کاهش پیشرفت پروتئینوری.",
              "اشتباه رایج: سرفه خشک ناشی از ACEI به دلیل حساسیت هیستامینی است ← این باور اشتباه است زیرا سرفه ناشی از تجمع برادی‌کینین و ماده P است ← آنتی‌هیستامین بی‌اثر بوده و درمان جایگزینی با لوزارتان (ARB) است.",
            ],
            mechanisms: [
              "مهار آنزیم ACE ← کاهش آنژیوتانسین II ← مهار ترشح آلدوسترون ← اتساع عروق محیطی و کاهش بار پس‌بار (Afterload)",
            ],
            classifications: ["داروهای سولفیدریل (کاپتوپریل)، پیش‌داروهای دی‌کربوکسیلات (انالاپریل)"],
            comparisons: [
              {
                conceptA: "انالاپریل (ACEI)",
                conceptB: "لوزارتان (ARB)",
                keyDifferences:
                  "انالاپریل مانع تجزیه برادی‌کینین می‌شود و ریسک سرفه و آنژیوادم دارد، در حالی که لوزارتان گیرنده AT1 را مسدود کرده و فاقد عارضه سرفه است.",
              },
            ],
            memorizationPoints: ["نیمه‌عمر کاپتوپریل کوتاه (۲ ساعت) و انالاپریل طولانی‌تر (۱۱ ساعت) است."],
            examPoints: [
              "نکته آزمونی: مصرف همزمان مهارکننده‌های ACE با دیورتیک‌های نگهدارنده پتاسیم (اسپیرونولاکتون) ریسک هیپرکالمی شدید دارد.",
              "نکته آزمونی: منع مصرف مطلق داروهای ACEI و ARB در بارداری به دلیل اثرات تراتوژن و همچنین در تنگی دوطرفه شریان کلیه.",
            ],
            citationChunkIds: ["chunk-pharma-1"],
          },
        ],
        finalTakeaways: [
          "مهارکننده‌های ACE باعث اتساع عروق و کاهش آلدوسترون شده و داروی انتخابی در نارسایی قلبی و دیابت هستند.",
          "سرفه خشک شاخص‌ترین عارضه ACEI ناشی از برادی‌کینین است که با ARBها دیده نمی‌شود.",
        ],
        citationChunkIds: ["chunk-pharma-1"],
      };

      const validated = validateReviewSummaryPayload(pharmaPayload);
      expect(validated.title).toContain("ACEIs & ARBs");
      expect(validated.sections.length).toBe(1);
      expect(validated.sections[0].mechanisms?.[0]).toContain("←");

      // Verify deterministic coverage assertions
      const coverage = evaluateReviewSummaryDeterministicCoverage(validated);
      expect(coverage.evaluations.find((e) => e.factId === "CRIT-HTN-PREGNANCY")?.status).toBe("covered");
      expect(coverage.evaluations.find((e) => e.factId === "CRIT-HTN-BRADYKININ-COUGH")?.status).toBe("covered");
      expect(coverage.evaluations.find((e) => e.factId === "CRIT-HTN-RENAL-STENOSIS")?.status).toBe("covered");
    });
  });

  // سناریوی دوم: یک مبحث بیوشیمی شامل مسیر متابولیکی و چند آنزیم
  describe("Scenario 2: Biochemistry (Multi-step Pathway, Rate-limiting Enzymes, Regulation)", () => {
    it("validates a biochemistry summary with sequential steps and metabolic regulation without fake tables", () => {
      const biochemPayload = {
        kind: "review_summary",
        title: "مسیر گلیکولیز و تنظیم آنزیمی (Glycolytic Pathway)",
        estimatedReadingMinutes: 8,
        overview:
          "گلیکولیز مسیر اصلی کاتابولیسم بی‌هوازی گلوکز در سیتوزول سلول است که منجر به تولید پیرووات، ATP و NADH می‌گردد.",
        sections: [
          {
            title: "مسیر ده مرحله‌ای و آنزیم‌های کلیدی گلیکولیز",
            keyPoints: [
              "گلیکولیز دارای ۱۰ مرحله آنزیمی است که مراحل ۱، ۳ و ۱۰ برگشت‌ناپذیر بوده و نقاط اصلی تنظیم مسیر محسوب می‌شوند.",
              "آنزیم PFK-1 (فسفوفروکتوکیناز-۱) اصلی‌ترین آنزیم تنظیم‌کننده و تعیین‌کننده سرعت کل مسیر است.",
            ],
            mechanisms: [
              "گلوکز ← (هگزوکیناز / مصرف ATP) ← گلوکز-۶-فسفات ← فروکتوز-۶-فسفات ← (PFK-1 / مصرف ATP) ← فروکتوز-۱و۶-بیس‌فسفات ← ... ← فسفوانول‌پیرووات ← (پیرووات کیناز / تولید ATP) ← پیرووات",
              "تنظیم آلوستریک PFK-1: فعال‌سازی قوی توسط فروکتوز-۲و۶-بیس‌فسفات و AMP ← مهار آلوستریک توسط ATP و سیترات",
            ],
            examPoints: [
              "نکته آزمونی: مرحله تولید اولین ATP در گلیکولیز واکنش کاتالیزشده توسط فسفوگلیسرات کیناز (فسفوریلاسیون در سطح پیش‌ماده) است.",
              "نکته آزمونی: آرسنات با گلیسرآلدئید ۳-فسفات رقابت کرده و تولید ATP را بدون توقف مسیر صفر می‌کند.",
            ],
            citationChunkIds: ["chunk-biochem-1"],
          },
        ],
        finalTakeaways: [
          "گلیکولیز به ازای هر مولکول گلوکز، بازده خالص ۲ مولکول ATP و ۲ مولکول NADH دارد.",
          "تنظیم‌کننده اصلی مسیر، آنزیم PFK-1 است که مهم‌ترین فعال‌کننده آن F-2,6-BP می‌باشد.",
        ],
        citationChunkIds: ["chunk-biochem-1"],
      };

      const validated = validateReviewSummaryPayload(biochemPayload);
      expect(validated.title).toBe("مسیر گلیکولیز و تنظیم آنزیمی (Glycolytic Pathway)");
      expect(validated.sections[0].mechanisms?.[0]).toContain("گلوکز ←");
      expect(validated.sections[0].comparisons).toBeUndefined(); // Omitted cleanly without empty array errors
    });
  });

  // سناریوی سوم: یک مبحث نظری که نیازی به جدول یا توضیح بالینی ندارد
  describe("Scenario 3: Theoretical / General Topic (No Decorative Tables or Fake Misconceptions)", () => {
    it("validates a purely conceptual/theoretical topic with only keyPoints, clean categories, and takeaways", () => {
      const theoreticalPayload = {
        kind: "review_summary",
        title: "اصول اخلاق زیستی در مراقبت‌های سلامت (Bioethics Principles)",
        estimatedReadingMinutes: 6,
        overview:
          "این مبحث به تبیین چهار اصل بنیادی اخلاق زیست‌پزشکی بوچامپ و چایلدرس در هدایت تصمیم‌گیری‌های بالینی می‌پردازد.",
        sections: [
          {
            title: "اصول چهارگانه بوچامپ و چایلدرس",
            keyPoints: [
              "اصل استقلال فردی (Autonomy): احترام به حق بیمار برای تصمیم‌گیری آگاهانه و داوطلبانه درباره درمان.",
              "اصل سودرسانی (Beneficence): تعهد کادر درمان به اقدام در جهت بیشترین منفعت بیمار.",
              "اصل عدم آسیب‌رسانی (Non-maleficence): پرهیز از آسیب عمدی یا بی‌مورد به بیمار (Primum non nocere).",
              "اصل عدالت (Justice): توزیع منصفانه منابع و خدمات سلامت بدون تبعیض.",
            ],
            classifications: ["اصول اخلاق بالینی", "حقوق بیمار"],
            examPoints: [
              "نکته آزمونی: در تعارض بین اصل خودمختاری بیمار هشیار و اصل سودرسانی پزشک، رضایت آگاهانه و استقلال بیمار اولویت قانونی و اخلاقی دارد.",
            ],
            citationChunkIds: ["chunk-ethics-1"],
          },
        ],
        finalTakeaways: [
          "چهار اصل اخلاق زیستی پایه‌های قضاوت در دوراهی‌های دشوار تصمیم‌گیری بالینی هستند.",
        ],
        citationChunkIds: ["chunk-ethics-1"],
      };

      const validated = validateReviewSummaryPayload(theoreticalPayload);
      expect(validated.title).toContain("Bioethics");
      expect(validated.sections[0].mechanisms).toBeUndefined();
      expect(validated.sections[0].comparisons).toBeUndefined();
      expect(validated.sections[0].memorizationPoints).toBeUndefined();
      expect(validated.sections[0].keyPoints.length).toBe(4);
    });
  });

  // سناریوی چهارم: منبعی که اطلاعات محدودی دارد و نباید با اطلاعات حدسی تکمیل شود
  describe("Scenario 4: Short Source with Limited Info (No Hallucinations / Strict Grounding)", () => {
    it("handles sparse source material cleanly without manufacturing filler", () => {
      const sparsePayload = {
        kind: "review_summary",
        title: "آشنایی با داروی بداکوئیلین در سل مقاوم",
        estimatedReadingMinutes: 4,
        overview:
          "مرور اجمالی داروی بداکوئیلین به عنوان درمان کمکی در سل مقاوم به چند دارو بر اساس اطلاعات محدود موجود در منبع.",
        sections: [
          {
            title: "ویژگی‌های اصلی بداکوئیلین",
            keyPoints: [
              "بداکوئیلین برای درمان سل ریوی مقاوم به چند دارو (MDR-TB) در بزرگسالان استفاده می‌شود.",
              "مکانیسم اصلی: مهار آنزیم سنتاز ATP مایکوباکتریوم توبرکلوزیس.",
            ],
            examPoints: [
              "نکته آزمونی: هشدار افزایش فاصله QT در نوار قلب نیازمند پایش مستمر همزمان با سایر داروهای طولانی‌کننده QT.",
            ],
            citationChunkIds: ["chunk-bed-1"],
          },
        ],
        finalTakeaways: [
          "بداکوئیلین مهارکننده اختصاصی ATP سنتاز در باکتری مایکوباکتریوم است و نیازمند مانیتورینگ نوار قلب است.",
        ],
        citationChunkIds: ["chunk-bed-1"],
      };

      const validated = validateReviewSummaryPayload(sparsePayload);
      expect(validated.sections[0].keyPoints.length).toBe(2);
      expect(validated.estimatedReadingMinutes).toBe(4);
      expect(validated.sections[0].comparisons).toBeUndefined();
    });
  });

  // سناریوی پنجم: یک مبحث طولانی که باید نکات اصلی آن حفظ شوند، بدون تبدیل به متن هم‌اندازه منبع
  describe("Scenario 5: Long Multi-topic Document with Session Budgeting & Invariant Protection", () => {
    it("verifies budget capping and multi-topic section preservation without truncation", () => {
      // Very large document with 14 sessions
      const budget = getReviewSummaryConfig({
        chunkCount: 30,
        totalTokens: 35000,
        sessionCount: 14,
      });

      // Session budget formula: min(10, max(8, ceil(14 * 0.75) = 11)) -> 10
      expect(budget.maxSections).toBe(10);
      expect(budget.targetReadingMinutes).toBe(13); // Adjusted dense reading minutes

      const longPayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "راهنمای جامع اورژانس‌های غدد و متابولیسم",
        estimatedReadingMinutes: 14,
        overview:
          "این سند خلاصه‌ای فشرده از تشخیص و مدیریت بحران‌های غدد شامل کتواسیدوز دیابتی، طوفان تیروئیدی، و بحران آدرنال ارائه می‌دهد.",
        sections: [
          {
            title: "کتواسیدوز دیابتی (DKA)",
            keyPoints: [
              "سه‌گانه تشخیصی DKA شامل هیپرگلیسمی، اسیدوز متابولیک با آنیون‌گپ بالا، و کتونمی است.",
              "کاربرد بالینی: شروع احیا همواره با مایع‌درمانی سالین نرمال و بررسی سطح پتاسیم قبل از شروع انفوزیون انسولین است.",
            ],
            mechanisms: [
              "کمبود انسولین + افزایش هورمون‌های متقابل ← تحریک لیپولیز ← تولید اسیدهای چرب آزاد ← اکسیداسیون کبدی به استواستات و بتاهیدروکسی‌بوتیرات ← اسیدوز",
            ],
            examPoints: [
              "نکته آزمونی: اگر پتاسیم سرم کمتر از ۳.۳ باشد، انسولین تا زمان اصلاح پتاسیم به تعویق می‌افتد تا از ایست قلبی ناشی از هیپوکالمی حاد جلوگیری شود.",
            ],
            citationChunkIds: ["chunk-dka-1"],
          },
          {
            title: "طوفان تیروئیدی (Thyroid Storm)",
            keyPoints: [
              "حالت حاد و تهدیدکننده حیات ناشی از تیروتوکسیکوز شدید با تب بالا، تاکی‌کاردی و علائم عصبی.",
              "کاربرد بالینی: رژیم درمانی چنددارویی شامل بتابلاکر (پروپرانولول)، تیونامید (PTU)، ید، و کورتیکواستروئید.",
            ],
            examPoints: [
              "نکته آزمونی: تجویز ید باید حداقل ۱ ساعت پس از تجویز PTU انجام گیرد تا از استفاده ید برای سنتز هورمون جدید ممانعت شود (اثر ولف-چایکوف).",
            ],
            citationChunkIds: ["chunk-storm-1"],
          },
        ],
        finalTakeaways: [
          "در DKA اصلاح پتاسیم مقدم بر انفوزیون انسولین است.",
          "در طوفان تیروئید مهار سنتز هورمون مقدم بر تجویز ید جهت جلوگیری از سنتز تشدیدیافته است.",
        ],
        citationChunkIds: ["chunk-dka-1", "chunk-storm-1"],
      };

      const validated = validateReviewSummaryPayload(longPayload);
      expect(validated.sections.length).toBe(2);
      expect(validated.sections[0].keyPoints.some((kp) => kp.includes("کاربرد بالینی:"))).toBe(true);
      expect(validated.sections[1].examPoints?.[0]).toContain("ولف-چایکوف");
    });
  });

  // سناریوهای ارتقای جدول‌های آموزشی جامع
  describe("High-Density Educational Tables Acceptance Scenarios", () => {
    it("Scenario 6: Pharmacology Multi-drug Comprehensive Table with all clinical columns and non-repetition", () => {
      const pharmaTablePayload = {
        kind: "review_summary",
        title: "فارماکولوژی داروهای ادرارآور (دیورتیک‌ها)",
        estimatedReadingMinutes: 12,
        overview: "بررسی جامع و مقایسه‌ای مکانیسم‌ها، کاربردها، عوارض و نکات آزمونی رده‌های اصلی دیورتیک‌ها.",
        sections: [
          {
            title: "جدول جامع مقایسه دیورتیک‌های لوپ، تیازیدی و نگهدارنده پتاسیم",
            keyPoints: [
              "دیورتیک‌ها بر اساس محل اثر در نفرون کلیوی و توان ترشح سدیم به رده‌های متمایز با ویژگی‌های فارماکودینامیک اختصاصی تقسیم می‌شوند:",
              "| نام دارو یا رده | مکانیسم اثر | اثرات فیزیولوژیک | کاربردهای بالینی | عوارض مهم | موارد منع مصرف و احتیاط‌ها | نکته آزمونی / وجه تمایز |\n" +
                "| --- | --- | --- | --- | --- | --- | --- |\n" +
                "| فورزماید (Loop) | مهار هم‌انتقال‌دهنده Na+/K+/2Cl- در بخش صعودی ضخیم لوپ هنله | دفع شدید Na+، Cl-، K+، Ca2+ و Mg2+ | ادم حاد ریوی، نارسایی احتقانی قلب، نارسایی حاد کلیه | هیپوکالمی، اتوتوکسیسیتی، هیپوکلسمی | آلرژی به سولفونامیدها، دهیدراتاسیون شدید | قوی‌ترین دیورتیک؛ برخلاف تیازیدها کلسیم ادرار را افزایش می‌دهد |\n" +
                "| هیدروکلروتیازید (Thiazide) | مهار هم‌انتقال‌دهنده Na+/Cl- در توبول پیچیده دیستال | کاهش بازجذب Na+، احتباس کلسیم در خون | خط اول درمان پرفشاری خون اولیه، سنگ‌های کلسیمی کلیه | هیپوکالمی، هیپراوریسمی، هایپرگلیسمی | اختلال شدید عملکرد کلیه (GFR < 30) | بازجذب کلسیم را افزایش می‌دهد (مفید در پوکی استخوان) |\n" +
                "| اسپیرونولاکتون (K+-Sparing) | آنتاگونیست رقابتی گیرنده آلدوسترون در مجرای جمع‌کننده | مهار بازجذب Na+ و مهار ترشح K+ و H+ | نارسایی مزمن قلب (کاهش مرگ‌ومیر)، آسیت ناشی از سیروز، سندرم کان | هیپرکالمی، ژنیکوماستی (اثر آنتی‌آندروژنیک) | نارسایی مزمن کلیه، مصرف همزمان مکمل پتاسیم یا ACEI | کاهش فیبروز میوکارد در نارسایی قلبی و ایجاد عوارض هورمونی |",
              "نکته تکمیلی: در بیماران دارای اختلال شدید کلیوی با GFR کمتر از ۳۰، تیازیدها بی‌اثر بوده و فورزماید داروی انتخابی است.",
            ],
            examPoints: [
              "نکته آزمونی: تجویز فورزماید همزمان با آمینوگلیکوزیدها ریسک اتوتوکسیسیتی غیرقابل برگشت را به شدت تشدید می‌کند.",
              "نکته آزمونی: تیازیدها به دلیل کاهش دفع کلسیم ادراری در پیشگیری از سنگ‌های مکرر اگزالات کلسیم مؤثرند.",
            ],
            citationChunkIds: ["chunk-diuretics-1"],
          },
        ],
        finalTakeaways: [
          "دیورتیک‌های لوپ کلسیم‌دفع‌کننده و قوی‌ترین هستند، در حالی که تیازیدها کلسیم را در خون حفظ می‌کنند.",
          "اسپیرونولاکتون تنها دیورتیک با مزیت اثبات‌شده در کاهش مرگ‌ومیر نارسایی قلبی است اما خطر هیپرکالمی دارد.",
        ],
        citationChunkIds: ["chunk-diuretics-1"],
      };

      const validated = validateReviewSummaryPayload(pharmaTablePayload);
      expect(validated.title).toContain("دیورتیک‌ها");
      const tableContent = validated.sections[0].keyPoints[1];
      expect(tableContent).toContain("| نام دارو یا رده |");
      expect(tableContent).toContain("فورزماید");
      expect(tableContent).toContain("هیدروکلروتیازید");
      expect(tableContent).toContain("اسپیرونولاکتون");

      // Verify table includes required educational columns
      expect(tableContent).toContain("مکانیسم اثر");
      expect(tableContent).toContain("اثرات فیزیولوژیک");
      expect(tableContent).toContain("کاربردهای بالینی");
      expect(tableContent).toContain("عوارض مهم");
      expect(tableContent).toContain("موارد منع مصرف");
      expect(tableContent).toContain("نکته آزمونی / وجه تمایز");

      // Verify no redundant full-table reproduction in prose
      expect(validated.sections[0].keyPoints[0]).not.toContain("اتوتوکسیسیتی");
      expect(validated.sections[0].keyPoints[2]).not.toContain("مهار هم‌انتقال‌دهنده Na+/K+/2Cl-");
    });

    it("Scenario 7: Biochemistry Multi-step Pathway Table with Enzymes, Substrates and Regulators", () => {
      const biochemTablePayload = {
        kind: "review_summary",
        title: "بیوشیمی مسیر گلیکولیز و تنظیم آنزیمی",
        estimatedReadingMinutes: 8,
        overview: "مرور واکنش‌های کلیدی، آنزیم‌های تنظیم‌کننده و اهمیت بالینی گلیکولیز در سیتوزول.",
        sections: [
          {
            title: "واکنش‌های بازگشت‌ناپذیر و تنظیمی گلیکولیز",
            keyPoints: [
              "سه گام تنظیمی مسیر گلیکولیز به وسیله واکنش‌های ترمودینامیکی برگشت‌ناپذیر کنترل می‌شوند:",
              "| مرحله مسیر | سوبسترا | آنزیم | محصول | محل وقوع سلولی | تنظیم‌کننده‌ها | اهمیت بالینی یا نکته امتحانی |\n" +
                "| --- | --- | --- | --- | --- | --- | --- |\n" +
                "| گام اول (فسفوریلاسیون گلوکز) | گلوکز + ATP | هگزوکیناز / گلوکوکیناز | گلوکز-۶-فسفات + ADP | سیتوزول تمام بافت‌ها (هگزوکیناز) / کبد و بتا پانکراس (گلوکوکیناز) | هگزوکیناز: مهار با G-6-P / گلوکوکیناز: تحریک با انسولین | گلوکوکیناز دارای Km و Vmax بالا جهت تنظیم گلوکز پس از غذا است |\n" +
                "| گام سوم (مرحله متعهدکننده) | فروکتوز-۶-فسفات + ATP | فسفوفروکتوکیناز-۱ (PFK-1) | فروکتوز-۱،۶-بیس‌فسفات + ADP | سیتوزول | فعال‌کننده: AMP و F-2,6-BP / مهارکننده: ATP و سیترات | اصلی‌ترین آنزیم محدودکننده سرعت گلیکولیز؛ فعال‌سازی شدید با F-2,6-BP |\n" +
                "| گام دهم (تولید ATP نهایی) | فسفوانول‌پیرووات (PEP) + ADP | پیرووات کیناز (PK) | پیرووات + ATP | سیتوزول | فعال‌کننده: F-1,6-BP (Feed-forward) / مهارکننده: ATP، آلانین | نقص ژنتیکی پیرووات کیناز دومین علت شایع کم‌خونی همولیتیک غیرایمیون است |",
            ],
            examPoints: [
              "نکته آزمونی: فروکتوز-۲،۶-بیس‌فسفات قوی‌ترین فعال‌کننده آلوستریک PFK-1 در کبد است که سطح آن تحت کنترل متقابل انسولین/گلوکاگون قرار دارد.",
            ],
            citationChunkIds: ["chunk-glycolysis-1"],
          },
        ],
        finalTakeaways: [
          "سه آنزیم تنظیم‌کننده هگزوکیناز، PFK-1 و پیرووات کیناز با واکنش‌های یک‌طرفه سرعت مسیر را تعیین می‌کنند.",
          "نقص پیرووات کیناز منجر به نارسایی تولید ATP در اریتروسیت‌ها و همولیز می‌شود.",
        ],
        citationChunkIds: ["chunk-glycolysis-1"],
      };

      const validated = validateReviewSummaryPayload(biochemTablePayload);
      expect(validated.title).toContain("گلیکولیز");
      const table = validated.sections[0].keyPoints[1];
      expect(table).toContain("فسفوفروکتوکیناز-۱");
      expect(table).toContain("سوبسترا");
      expect(table).toContain("تنظیم‌کننده‌ها");
      expect(table).toContain("کم‌خونی همولیتیک");
    });

    it("Scenario 8: Sparse Source without fabricating columns (Strict Grounding)", () => {
      const sparseTablePayload = {
        kind: "review_summary",
        title: "مرور ویتامین‌های محلول در چربی با اطلاعات محدود منبع",
        estimatedReadingMinutes: 5,
        overview: "خلاصه فشرده ویتامین‌های A و D بر اساس اطلاعات محدود موجود در منبع اولیه.",
        sections: [
          {
            title: "ویژگی‌های اختصاصی ویتامین A و D",
            keyPoints: [
              "اطلاعات موجود در منبع برای مقایسه دو ویتامین به شرح زیر است:",
              "| ویتامین | نقش فیزیولوژیک | پیامد کمبود |\n" +
                "| --- | --- | --- |\n" +
                "| ویتامین A | بینایی در نور کم (رودوپسین) و تمایز سلول‌های اپیتلیال | شب‌کوری و گزروفتالمی |\n" +
                "| ویتامین D | تنظیم جذب کلسیم و فسفات در روده | راشیتیسم در کودکان و استئومالاسی در بزرگسالان |",
            ],
            examPoints: [
              "نکته آزمونی: گزروفتالمی یکی از علل اصلی نابینایی قابل پیشگیری در کودکان کشورهای در حال توسعه است.",
            ],
            citationChunkIds: ["chunk-vit-1"],
          },
        ],
        finalTakeaways: [
          "ویتامین A برای تمایز اپیتلیوم و بینایی، و ویتامین D برای هموستاز کلسیم و استخوان‌سازی ضروری هستند.",
        ],
        citationChunkIds: ["chunk-vit-1"],
      };

      // Successfully validates without requiring fake columns like doses or toxicities not in source
      const validated = validateReviewSummaryPayload(sparseTablePayload);
      expect(validated.sections[0].keyPoints[1]).toContain("| ویتامین |");
      expect(validated.sections[0].keyPoints[1]).not.toContain("دوز روزانه");
    });
  });
});
