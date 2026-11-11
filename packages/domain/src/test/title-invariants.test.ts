import { describe, expect, it } from "vitest";
import {
  isFilenameLike,
  isSuspiciousTitle,
  isPollutedModuleTitle,
  stripContentTypePrefix,
  cleanEducationalTitle,
  formatModuleTitle,
  resolveCanonicalContentTitle,
  isFilenameOrPlaceholderDescription,
  cleanEducationalDescription,
  cleanQuizChapterTitle,
  buildPdfFilename,
  extractSessionNumberFromTitle,
  resolveChapterSessionNumbers,
} from "../title-invariants.js";

describe("AVANA Content Title Invariants", () => {
  describe("isFilenameLike", () => {
    it("identifies filenames with extensions as filename-like", () => {
      expect(isFilenameLike("pharmacology_chapter_1.pdf")).toBe(true);
      expect(isFilenameLike("24.pdf")).toBe(true);
      expect(isFilenameLike("slide_deck_v2.pptx")).toBe(true);
      expect(isFilenameLike("notes.docx")).toBe(true);
      expect(isFilenameLike("data.txt")).toBe(true);
    });

    it("identifies raw numeric indices and numeric module patterns as filename-like", () => {
      expect(isFilenameLike("24")).toBe(true);
      expect(isFilenameLike("31.2")).toBe(true);
      expect(isFilenameLike("فصل: 24")).toBe(true);
      expect(isFilenameLike("فصل: 6")).toBe(true);
      expect(isFilenameLike("فصل - 41")).toBe(true);
      expect(isFilenameLike("فصل: 31.2")).toBe(true);
    });

    it("identifies raw filename slugs without spaces as filename-like", () => {
      expect(isFilenameLike("pharma_lecture_03_v2")).toBe(true);
      expect(isFilenameLike("anemia-Therapeutics2023")).toBe(true);
      expect(isFilenameLike("ch04_cardiovascular_part1")).toBe(true);
    });

    it("identifies generic placeholder strings as filename-like", () => {
      expect(isFilenameLike("سرفصل آموزشی استخراج‌شده")).toBe(true);
      expect(isFilenameLike("محتوای استخراج‌شده")).toBe(true);
      expect(isFilenameLike("null")).toBe(true);
      expect(isFilenameLike("undefined")).toBe(true);
      expect(isFilenameLike("")).toBe(true);
      expect(isFilenameLike(null)).toBe(true);
      expect(isFilenameLike(undefined)).toBe(true);
    });

    it("accepts valid educational titles as non-filename-like", () => {
      expect(isFilenameLike("داروهای ضد تشنج و ضد صرع")).toBe(false);
      expect(isFilenameLike("فصل: فارماکولوژی جامع بی‌حس‌کننده‌های موضعی (Local Anesthetics)")).toBe(false);
      expect(isFilenameLike("اصول فارماکوتراپی و مدیریت بالینی انواع کم‌خونی")).toBe(false);
      expect(isFilenameLike("مدیریت دارویی پارکینسونیسم")).toBe(false);
      expect(isFilenameLike("مبانی فیزیولوژی تنفس و تهویه ریوی")).toBe(false);
    });
  });

  describe("isSuspiciousTitle", () => {
    it("flags empty, filename-like, or overly short titles", () => {
      expect(isSuspiciousTitle("24.pdf")).toBe(true);
      expect(isSuspiciousTitle("a")).toBe(true);
      expect(isSuspiciousTitle("فصل: ")).toBe(true);
      expect(isSuspiciousTitle(null)).toBe(true);
    });

    it("passes valid scholarly Persian titles", () => {
      expect(isSuspiciousTitle("فارماکولوژی داروهای قلب و عروق")).toBe(false);
      expect(isSuspiciousTitle("فصل: داروهای ضد افسردگی")).toBe(false);
    });
  });

  describe("cleanEducationalTitle", () => {
    it("returns default fallback if input is filename-like", () => {
      expect(cleanEducationalTitle("24.pdf")).toBe("مبحث آموزشی جامع");
      expect(cleanEducationalTitle("فصل: 25")).toBe("مبحث آموزشی جامع");
      expect(cleanEducationalTitle("", "سرفصل پیش‌فرض")).toBe("سرفصل پیش‌فرض");
    });

    it("strips quotation marks and duplicate فصل prefixes", () => {
      expect(cleanEducationalTitle('«فارماکولوژی بالینی»')).toBe("فارماکولوژی بالینی");
      expect(cleanEducationalTitle('"فارماکولوژی بالینی"')).toBe("فارماکولوژی بالینی");
      expect(cleanEducationalTitle('فصل: فصل: مبحث خون')).toBe("فصل: مبحث خون");
    });
  });

  describe("formatModuleTitle", () => {
    it("ensures module starts cleanly with 'فصل: '", () => {
      expect(formatModuleTitle("فارماکولوژی دستگاه گوارش")).toBe("فصل: فارماکولوژی دستگاه گوارش");
      expect(formatModuleTitle("فصل: فارماکولوژی دستگاه گوارش")).toBe("فصل: فارماکولوژی دستگاه گوارش");
      expect(formatModuleTitle("فصل فارماکولوژی دستگاه گوارش")).toBe("فصل: فارماکولوژی دستگاه گوارش");
    });

    it("uses fallback if title is filename-like", () => {
      expect(formatModuleTitle("24.pdf")).toBe("فصل: مبحث آموزشی جامع");
      expect(formatModuleTitle("فصل: 41")).toBe("فصل: مبحث آموزشی جامع");
    });
  });

  describe("resolveCanonicalContentTitle", () => {
    it("resolves lesson title from moduleTitle or payload title", () => {
      const title = resolveCanonicalContentTitle({
        type: "lesson",
        payload: {
          title: "جلسه اول: مکانیسم داروها",
          moduleTitle: "فارماکولوژی بالینی قلب",
        },
      });
      expect(title).toBe("فارماکولوژی بالینی قلب");
    });

    it("ignores filename-like moduleTitle and falls back to clean title", () => {
      const title = resolveCanonicalContentTitle({
        type: "lesson",
        payload: {
          title: "مکانیسم اثر داروهای آرام‌بخش",
          moduleTitle: "22.pdf",
        },
      });
      expect(title).toBe("مکانیسم اثر داروهای آرام‌بخش");
    });

    it("resolves flashcard title with canonical prefix", () => {
      const title = resolveCanonicalContentTitle({
        type: "flashcard",
        payload: {
          moduleTitle: "داروهای ضد صرع",
        },
      });
      expect(title).toBe("فلش‌کارت‌های آموزشی: داروهای ضد صرع");
    });

    it("resolves quiz title with canonical prefix", () => {
      const title = resolveCanonicalContentTitle({
        type: "quiz",
        payload: {
          title: "داروهای ضد تشنج",
        },
      });
      expect(title).toBe("آزمون ارزیابی آموخته‌ها: داروهای ضد تشنج");
    });

    it("resolves review summary title with canonical prefix and never allows filename", () => {
      const title = resolveCanonicalContentTitle({
        type: "review_summary",
        payload: {
          title: "24.pdf",
          moduleTitle: "داروهای ضد تشنج و صرع",
        },
      });
      expect(title).toBe("خلاصه مروری: داروهای ضد تشنج و صرع");
    });
  });

  describe("Description and Extracted File Sanitizers", () => {
    it("identifies 'مباحث و جلسات آموزشی استخراجشده از 32.pdf' as filename-like and placeholder", () => {
      const dirtyStr1 = "مباحث و جلسات آموزشی استخراجشده از 32.pdf";
      const dirtyStr2 = "مباحث و جلسات آموزشی استخراج‌شده از 32.pdf";
      const dirtyStr3 = "مباحث و جلسات آموزشی استخراج شده از 32.pdf";
      const dirtyStr4 = "مباحث و جلسات آموزشی استخراج‌شده";

      expect(isFilenameLike(dirtyStr1)).toBe(true);
      expect(isFilenameLike(dirtyStr2)).toBe(true);
      expect(isFilenameLike(dirtyStr3)).toBe(true);
      expect(isFilenameLike(dirtyStr4)).toBe(true);

      expect(isFilenameOrPlaceholderDescription(dirtyStr1)).toBe(true);
      expect(isFilenameOrPlaceholderDescription(dirtyStr2)).toBe(true);
      expect(isFilenameOrPlaceholderDescription(dirtyStr3)).toBe(true);
      expect(isFilenameOrPlaceholderDescription(dirtyStr4)).toBe(true);

      expect(cleanEducationalTitle(dirtyStr1)).toBe("مبحث آموزشی جامع");
      expect(cleanEducationalDescription(dirtyStr1)).toBe(
        "بسته آموزشی جامع فصل شامل درسنامه ساختاریافته، خلاصه نکات کلیدی، فلش‌کارت‌های مرور فعال و آزمون تستی.",
      );
    });

    it("identifies 'مباحث و جلسات آموزشی جامع' and generic extraction placeholders as placeholder descriptions", () => {
      const genericStr1 = "مباحث و جلسات آموزشی جامع";
      const genericStr2 = "مباحث و جلسات آموزشی";
      const genericStr3 = "سرفصل آموزشی جامع";
      const genericStr4 = "فصل آموزشی جامع";

      expect(isFilenameOrPlaceholderDescription(genericStr1)).toBe(true);
      expect(isFilenameOrPlaceholderDescription(genericStr2)).toBe(true);
      expect(isFilenameOrPlaceholderDescription(genericStr3)).toBe(true);
      expect(isFilenameOrPlaceholderDescription(genericStr4)).toBe(true);
    });

    it("preserves real scholarly descriptions", () => {
      const realDesc = "این فصل به بررسی دقیق پاتوفیزیولوژی، علائم بالینی و پروتکل‌های درمانی آریتمی‌های قلبی می‌پردازد.";
      expect(isFilenameOrPlaceholderDescription(realDesc)).toBe(false);
      expect(cleanEducationalDescription(realDesc)).toBe(realDesc);
    });
  });

  describe("Anti-Pollution Invariants: Content Type Prefixes", () => {
    it("isPollutedModuleTitle detects flashcard, quiz, and summary prefixes", () => {
      expect(isPollutedModuleTitle("فصل: فلش‌کارت‌های آموزشی: تنظیم کلیوی الکترولیت‌ها")).toBe(true);
      expect(isPollutedModuleTitle("فصل: فلش کارتهای آموزشی: تنظیم کلیوی")).toBe(true);
      expect(isPollutedModuleTitle("فلش‌کارت‌های آموزشی: فیزیولوژی اعصاب")).toBe(true);
      expect(isPollutedModuleTitle("مجموعه ۱۰ فلش‌کارت آموزشی: قلب")).toBe(true);
      expect(isPollutedModuleTitle("فصل: آزمون ارزیابی آموخته‌ها: قلب و عروق")).toBe(true);
      expect(isPollutedModuleTitle("فصل: خلاصه مروری: غدد درون‌ریز")).toBe(true);
      expect(isPollutedModuleTitle("")).toBe(true);
      expect(isPollutedModuleTitle(null)).toBe(true);

      // Clean titles must NOT be flagged as polluted
      expect(isPollutedModuleTitle("فصل: تنظیم فیزیولوژیک تعادل اسید و باز")).toBe(false);
      expect(isPollutedModuleTitle("مقدمه‌ای بر فارماکولوژی دستگاه عصبی")).toBe(false);
      expect(isPollutedModuleTitle("فصل ۱: فیزیولوژی سلول")).toBe(false);
    });

    it("stripContentTypePrefix cleanly removes content-type prefixes", () => {
      expect(
        stripContentTypePrefix("فصل: فلش‌کارت‌های آموزشی: تنظیم کلیوی الکترولیت‌ها"),
      ).toBe("تنظیم کلیوی الکترولیت‌ها");
      expect(
        stripContentTypePrefix("فلش‌کارت‌های آموزشی: فیزیولوژی اعصاب مرکزی"),
      ).toBe("فیزیولوژی اعصاب مرکزی");
      expect(
        stripContentTypePrefix("فصل: آزمون ارزیابی آموخته‌ها: قلب و عروق"),
      ).toBe("قلب و عروق");
      expect(
        stripContentTypePrefix("فصل: خلاصه مروری: غدد درون‌ریز"),
      ).toBe("غدد درون‌ریز");
    });

    it("formatModuleTitle never creates a module title with flashcard prefix", () => {
      // Even if flashcard-polluted string is passed to formatModuleTitle, it must sanitize it
      expect(
        formatModuleTitle("فصل: فلش‌کارت‌های آموزشی: تنظیم کلیوی الکترولیت‌ها"),
      ).toBe("فصل: تنظیم کلیوی الکترولیت‌ها");
      expect(
        formatModuleTitle("فلش‌کارت‌های آموزشی: مقدمه‌ای بر غدد درون‌ریز"),
      ).toBe("فصل: مقدمه‌ای بر غدد درون‌ریز");
      expect(
        formatModuleTitle("مجموعه فلش‌کارت آموزشی"),
      ).toBe("فصل: مبحث آموزشی جامع");
      expect(
        formatModuleTitle("فصل: فلش‌کارت‌های آموزشی:"),
      ).toBe("فصل: مبحث آموزشی جامع");
    });

    it("isSuspiciousTitle flags polluted titles as suspicious", () => {
      expect(isSuspiciousTitle("فصل: فلش‌کارت‌های آموزشی: تنظیم کلیوی")).toBe(true);
      expect(isSuspiciousTitle("فصل: آزمون ارزیابی: فیزیولوژی")).toBe(true);
      expect(isSuspiciousTitle("فصل: خلاصه مروری: کلیه")).toBe(true);
      // Valid title remains unsuspicious
      expect(isSuspiciousTitle("فصل: تنظیم کلیوی الکترولیت‌ها")).toBe(false);
    });

    it("cleanQuizChapterTitle strips آزمون ارزیابی آموخته‌ها: static prefix", () => {
      expect(
        cleanQuizChapterTitle("آزمون ارزیابی آموخته‌ها: فیزیولوژی کلیه و تعادل مایعات"),
      ).toBe("فیزیولوژی کلیه و تعادل مایعات");
      expect(
        cleanQuizChapterTitle("آزمون ارزیابی آموختهها: فیزیولوژی کلیه"),
      ).toBe("فیزیولوژی کلیه");
      expect(
        cleanQuizChapterTitle("آزمون ارزیابی آموخته‌ها : فارماکولوژی قلب و عروق"),
      ).toBe("فارماکولوژی قلب و عروق");
      expect(
        cleanQuizChapterTitle("آزمون ارزیابی آموخته‌ها- داروهای ضد صرع"),
      ).toBe("داروهای ضد صرع");
      expect(
        cleanQuizChapterTitle("فصل اول: آناتومی سیستم عصبی"),
      ).toBe("فصل اول: آناتومی سیستم عصبی");
      expect(
        cleanQuizChapterTitle("Cardiovascular Pharmacology"),
      ).toBe("Cardiovascular Pharmacology");
      expect(
        cleanQuizChapterTitle("آزمون ارزیابی آموخته‌ها"),
      ).toBe("آزمون ارزیابی آموخته‌ها");
      expect(cleanQuizChapterTitle("")).toBe("");
      expect(cleanQuizChapterTitle(null)).toBe("");
    });
  });

  describe("buildPdfFilename", () => {
    it("prevents duplicate 'فصل' prefix when title already contains it", () => {
      expect(buildPdfFilename("chapter", "فصل اول")).toBe("فصل اول.pdf");
      expect(buildPdfFilename("chapter", "فصل ۱: فیزیولوژی سلول")).toBe("فصل ۱ - فیزیولوژی سلول.pdf");
      expect(buildPdfFilename("chapter", "فصل اول - فیزیولوژی")).toBe("فصل اول - فیزیولوژی.pdf");
      expect(buildPdfFilename("chapter", "فصل - کلیات فارماکولوژی")).toBe("فصل - کلیات فارماکولوژی.pdf");
    });

    it("deduplicates repeated chapter segments like 'فصل اول - فصل اول'", () => {
      expect(buildPdfFilename("chapter", "فصل اول - فصل اول")).toBe("فصل اول.pdf");
      expect(buildPdfFilename("chapter", "فصل دوم - فصل دوم")).toBe("فصل دوم.pdf");
      expect(buildPdfFilename("chapter", "فصل ۱ - فصل ۱")).toBe("فصل ۱.pdf");
    });

    it("adds standard prefix when title does NOT start with chapter prefix", () => {
      expect(buildPdfFilename("chapter", "فیزیولوژی کلیه")).toBe("فصل - فیزیولوژی کلیه.pdf");
      expect(buildPdfFilename("chapter", "آناتومی قلب و عروق")).toBe("فصل - آناتومی قلب و عروق.pdf");
    });

    it("correctly formats lesson filenames", () => {
      expect(buildPdfFilename("lesson", "درسنامه فیزیولوژی غشا")).toBe("درسنامه فیزیولوژی غشا.pdf");
      expect(buildPdfFilename("lesson", "فیزیولوژی غشا")).toBe("درسنامه - فیزیولوژی غشا.pdf");
      expect(buildPdfFilename("lesson", "درسنامه - درسنامه فیزیولوژی")).toBe("درسنامه فیزیولوژی.pdf");
    });

    it("correctly formats review summary filenames", () => {
      expect(buildPdfFilename("review_summary", "خلاصه مرور مبحث دیابت")).toBe("خلاصه مرور مبحث دیابت.pdf");
      expect(buildPdfFilename("review_summary", "مبحث دیابت")).toBe("خلاصه مرور - مبحث دیابت.pdf");
    });

    it("handles fallback and invalid characters safely", () => {
      expect(buildPdfFilename("chapter", null, "mod-123")).toBe("chapter-mod-123.pdf");
      expect(buildPdfFilename("lesson", "", "les-456")).toBe("lesson-les-456.pdf");
      expect(buildPdfFilename("chapter", "فصل / اول: تست *?")).toBe("فصل - اول - تست.pdf");
    });
  });

  describe("extractSessionNumberFromTitle", () => {
    it("extracts numbers from Persian ordinals", () => {
      expect(extractSessionNumberFromTitle("جلسه اول: مقدمات")).toBe(1);
      expect(extractSessionNumberFromTitle("جلسه دوم: فیزیولوژی غشا")).toBe(2);
      expect(extractSessionNumberFromTitle("جلسه سوم")).toBe(3);
      expect(extractSessionNumberFromTitle("جلسه دهم")).toBe(10);
      expect(extractSessionNumberFromTitle("درس اول")).toBe(1);
      expect(extractSessionNumberFromTitle("قسمت دوم")).toBe(2);
    });

    it("extracts numbers from Persian digits", () => {
      expect(extractSessionNumberFromTitle("جلسه ۱: پتانسیل عمل")).toBe(1);
      expect(extractSessionNumberFromTitle("جلسه ۲")).toBe(2);
      expect(extractSessionNumberFromTitle("جلسه ۱۲")).toBe(12);
    });

    it("extracts numbers from English digits", () => {
      expect(extractSessionNumberFromTitle("جلسه 1: مقدمه")).toBe(1);
      expect(extractSessionNumberFromTitle("جلسه 2")).toBe(2);
    });

    it("returns null when no session number is present", () => {
      expect(extractSessionNumberFromTitle("فارماکولوژی غشا")).toBeNull();
      expect(extractSessionNumberFromTitle("مقدمه بر بیوشیمی")).toBeNull();
      expect(extractSessionNumberFromTitle(null)).toBeNull();
      expect(extractSessionNumberFromTitle("")).toBeNull();
    });
  });

  describe("resolveChapterSessionNumbers", () => {
    it("resolves 0-based sortOrder to 1-based sequential numbers (Defect 2 root cause)", () => {
      const sessions = [
        { id: "s-0", title: "ماده زمینه‌ای", sortOrder: 0 },
        { id: "s-1", title: "سلول‌های بافت همبند", sortOrder: 1 },
        { id: "s-2", title: "الیاف کلاژن", sortOrder: 2 },
      ];
      // Under the old bug: session 0 became 1, session 1 became 1! Both were 1!
      // Under the fix: [1, 2, 3]
      const numbers = resolveChapterSessionNumbers(sessions);
      expect(numbers).toEqual([1, 2, 3]);
    });

    it("extracts valid session numbers from ordinals when consistent", () => {
      const sessions = [
        { id: "s-1", title: "جلسه اول: مقدمه", sortOrder: 0 },
        { id: "s-2", title: "جلسه دوم: ادامه", sortOrder: 1 },
      ];
      const numbers = resolveChapterSessionNumbers(sessions);
      expect(numbers).toEqual([1, 2]);
    });

    it("falls back to sequential order if titles contain duplicate session numbers", () => {
      const sessions = [
        { id: "s-1", title: "جلسه ۱: مقدمه", sortOrder: 0 },
        { id: "s-2", title: "جلسه ۱: بخش دوم", sortOrder: 1 },
      ];
      const numbers = resolveChapterSessionNumbers(sessions);
      expect(numbers).toEqual([1, 2]);
    });

    it("falls back to sequential order if titles contain disordered or non-monotonic numbers", () => {
      const sessions = [
        { id: "s-1", title: "جلسه ۳: مقدمه", sortOrder: 0 },
        { id: "s-2", title: "جلسه ۱: بخش دوم", sortOrder: 1 },
      ];
      const numbers = resolveChapterSessionNumbers(sessions);
      expect(numbers).toEqual([1, 2]);
    });

    it("restarts numbering at 1 independently for each chapter regardless of global sortOrder", () => {
      // Chapter 2 sessions where global DB sortOrder might be 15, 16, 17
      const chapter2Sessions = [
        { id: "s-10", title: "فارماکودینامیک", sortOrder: 15 },
        { id: "s-11", title: "فارماکوکینتیک", sortOrder: 16 },
      ];
      const numbers = resolveChapterSessionNumbers(chapter2Sessions);
      expect(numbers).toEqual([1, 2]);
    });
  });
});

