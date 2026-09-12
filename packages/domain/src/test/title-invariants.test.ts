import { describe, expect, it } from "vitest";
import {
  isFilenameLike,
  isSuspiciousTitle,
  cleanEducationalTitle,
  formatModuleTitle,
  resolveCanonicalContentTitle,
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
});
