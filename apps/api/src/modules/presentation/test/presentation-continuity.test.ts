import { describe, it, expect } from "vitest";
import {
  PresentationPromptBuilder,
  SPEAKER_GENERATION_PROMPT_VERSION,
} from "../presentation-prompt-builder.js";
import type { SlideReferenceContextSnapshot } from "@avana/domain";

describe("Presentation Speech Continuity & Bounded Context", () => {
  const emptySnapshot: SlideReferenceContextSnapshot = {
    status: "valid_empty",
    chunks: [],
    totalChunks: 0,
    referenceIds: [],
  };

  const dummySlide = {
    slideIndex: 1,
    title: "مقدمه بر نارسایی قلبی و پاتوفیزیولوژی",
    rawText: "تعریف نارسایی قلبی\nشیوع بیماری\nدسته‌بندی بالینی NYHA",
    speakerNotes: "با نام خدا شروع شود",
    visualSummary: null,
  };

  const projectContext = {
    title: "مدیریت جامع نارسایی قلبی در بالین",
    academicLevel: "advanced" as const,
    tone: "formal_scientific" as const,
    elaborationDepth: "balanced" as const,
    targetDurationMinutes: 30,
    totalSlides: 15,
  };

  it("Slide 1 (First Slide): enables concise greeting and topic introduction", () => {
    const { userPrompt, promptVersion } = PresentationPromptBuilder.buildSpeakerPrompt({
      slide: dummySlide,
      project: projectContext,
      snapshot: emptySnapshot,
      allSlidesOutline: [
        { slideIndex: 1, title: "مقدمه بر نارسایی قلبی" },
        { slideIndex: 2, title: "اتیولوژی و ریسک‌فاکتورها" },
        { slideIndex: 15, title: "جمع‌بندی و نتیجه‌گیری" },
      ],
    });

    expect(promptVersion).toBe(SPEAKER_GENERATION_PROMPT_VERSION);
    expect(userPrompt).toContain("[Position: FIRST / OPENING]");
    expect(userPrompt).toContain("شروع: در صورت تناسب با لحن، با سلام و خوشامدگویی رسمی و کوتاه به مخاطبان آغاز کنید");
    expect(userPrompt).toContain("موضوع اصلی ارائه («مدیریت جامع نارسایی قلبی در بالین») و هدف کلی تدریس را در ابتدای کلام معرفی نمایید");
    expect(userPrompt).not.toContain("ممنوعیت اکید سلام");
  });

  it("Slide 2..14 (Middle Slides): strictly forbids greetings, lecturer re-intro, and clichés", () => {
    const middleSlide = {
      ...dummySlide,
      slideIndex: 5,
      title: "درمان‌های دارویی خط اول نارسایی قلبی",
      rawText: "مهارکننده‌های SGLT2\nبتابلوکرها\nآنتاگونیست‌های گیرنده آلدوسترون",
    };

    const { userPrompt } = PresentationPromptBuilder.buildSpeakerPrompt({
      slide: middleSlide,
      project: projectContext,
      snapshot: emptySnapshot,
      previousSlideSummary: "اسلاید ۴: مهارکننده‌های ACE و ARNI در بهبود پیش‌آگهی بیماران HFrEF",
      coveredKeyConcepts: ["تعریف NYHA", "کاهش کسر تخلیه‌ای EF", "مهارکننده‌های RAAS"],
      nextSlideTitle: "روش‌های پایش دوز دارو و عوارض جانبی",
      allSlidesOutline: [
        { slideIndex: 1, title: "مقدمه" },
        { slideIndex: 4, title: "مهارکننده‌های ACE و ARNI" },
        { slideIndex: 5, title: "درمان‌های دارویی خط اول" },
        { slideIndex: 6, title: "پایش دوز دارو" },
      ],
    });

    expect(userPrompt).toContain("[Position: MIDDLE / CONTINUATION]");
    expect(userPrompt).toContain("ممنوعیت اکید سلام: هرگز مجدداً با سلام («سلام»، «درود»، «عرض ادب»، «خوش آمدید») شروع نکنید");
    expect(userPrompt).toContain("ممنوعیت معرفی مجدد: نام خود، نام مدرس، یا معرفی تکراری موضوع را ابداً بازگو نکنید");
    expect(userPrompt).toContain("پرهیز از عبارات تکراری و کلیشه‌ای: از تکرار فرمول‌های قالبی مانند «در ادامه به بررسی...» یا «حال می‌پردازیم به...» در همه اسلایدها اکیداً اجتناب کنید");
    expect(userPrompt).toContain("Previous Slide Context: اسلاید ۴: مهارکننده‌های ACE و ARNI");
    expect(userPrompt).toContain("Next Slide Topic (for transitionSentence): روش‌های پایش دوز دارو و عوارض جانبی");
    expect(userPrompt).toContain("Preceding Concepts Already Covered (DO NOT REPEAT DEFINITIONS): تعریف NYHA | کاهش کسر تخلیه‌ای EF | مهارکننده‌های RAAS");
  });

  it("Slide 15 (Final Slide): provides overarching synthesis and polite closing", () => {
    const finalSlide = {
      ...dummySlide,
      slideIndex: 15,
      title: "جمع‌بندی، نکات کلیدی و نتیجه‌گیری",
      rawText: "مرور نکات بالینی مهم\nتوصیه‌های آینده‌پژوهانه",
    };

    const { userPrompt } = PresentationPromptBuilder.buildSpeakerPrompt({
      slide: finalSlide,
      project: projectContext,
      snapshot: emptySnapshot,
      previousSlideSummary: "اسلاید ۱۴: افق‌های جدید در درمان دارویی نارسایی قلبی",
      allSlidesOutline: [
        { slideIndex: 1, title: "مقدمه" },
        { slideIndex: 15, title: "جمع‌بندی و نتیجه‌گیری" },
      ],
    });

    expect(userPrompt).toContain("[Position: FINAL / CONCLUDING]");
    expect(userPrompt).toContain("ممنوعیت سلام یا شروع جدید: هرگز با سلام یا طرح مبحث جدید آغاز نکنید");
    expect(userPrompt).toContain("پیام کلیدی، دستاوردها و نتیجه‌گیری نهایی کل مباحث تدریس‌شده را به شکل منسجم و اثرگذار جمع‌بندی کنید");
    expect(userPrompt).toContain("تشکر موقر از توجه مخاطبان و در صورت تناسب، دعوت به پرسش و پاسخ، سخنرانی را پایان دهید");
  });

  it("Bounded Context: enforces strict truncation on previous slide speech and concepts to avoid token ballooning", () => {
    const veryLongPreviousExcerpt = "الف".repeat(1500);
    const manyConcepts = Array.from({ length: 30 }, (_, i) => `مفهوم کلیدی شماره ${i + 1}`);

    const middleSlide = {
      ...dummySlide,
      slideIndex: 8,
      title: "تست کنترل حجم کانتکست ورودی",
    };

    const { userPrompt } = PresentationPromptBuilder.buildSpeakerPrompt({
      slide: middleSlide,
      project: { ...projectContext, totalSlides: 20 },
      snapshot: emptySnapshot,
      previousSlideSummary: veryLongPreviousExcerpt,
      coveredKeyConcepts: manyConcepts,
    });

    // The raw 1500-char string is truncated to 350 chars with '...'
    expect(userPrompt).not.toContain(veryLongPreviousExcerpt);
    expect(userPrompt).toContain(veryLongPreviousExcerpt.slice(0, 350) + "...");

    // Verify concepts are limited to top 6
    expect(userPrompt).toContain("مفهوم کلیدی شماره 1");
    expect(userPrompt).toContain("مفهوم کلیدی شماره 6");
    expect(userPrompt).not.toContain("مفهوم کلیدی شماره 10");
  });
});
