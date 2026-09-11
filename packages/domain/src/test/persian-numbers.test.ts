import { describe, it, expect } from "vitest";
import { toPersianDigits, formatPersianOf } from "../persian-numbers.js";

describe("Persian Numbers & Counters Canonical Formatter", () => {
  describe("toPersianDigits - Requirement 7 Exact Regressions", () => {
    it("converts '2 از 4' to '۲ از ۴'", () => {
      expect(toPersianDigits("2 از 4")).toBe("۲ از ۴");
    });

    it("converts '2 از ۴' (mixed english/persian) to '۲ از ۴'", () => {
      expect(toPersianDigits("2 از ۴")).toBe("۲ از ۴");
    });

    it("converts '۲ از 4' (mixed persian/english) to '۲ از ۴'", () => {
      expect(toPersianDigits("۲ از 4")).toBe("۲ از ۴");
    });

    it("converts '12 از 20' to '۱۲ از ۲۰'", () => {
      expect(toPersianDigits("12 از 20")).toBe("۱۲ از ۲۰");
    });
  });

  describe("toPersianDigits - Types and Edge Cases", () => {
    it("handles standard numeric values", () => {
      expect(toPersianDigits(0)).toBe("۰");
      expect(toPersianDigits(1)).toBe("۱");
      expect(toPersianDigits(42)).toBe("۴۲");
      expect(toPersianDigits(1234567890)).toBe("۱۲۳۴۵۶۷۸۹۰");
    });

    it("handles null and undefined safely without returning 'null'", () => {
      expect(toPersianDigits(null)).toBe("");
      expect(toPersianDigits(undefined)).toBe("");
    });

    it("handles empty string", () => {
      expect(toPersianDigits("")).toBe("");
    });

    it("converts Arabic-Indic digits to Persian digits", () => {
      // Arabic digits: ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩ (U+0660..U+0669)
      // Persian digits: ۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹ (U+06F0..U+06F9)
      expect(toPersianDigits("١٢٣")).toBe("۱۲۳");
      expect(toPersianDigits("٢ از ٤")).toBe("۲ از ۴");
    });

    it("preserves non-digit text", () => {
      expect(toPersianDigits("Score: 95%")).toBe("Score: ۹۵%");
      expect(toPersianDigits("مرحله 3")).toBe("مرحله ۳");
      expect(toPersianDigits("جلسه 10: فارماکولوژی")).toBe("جلسه ۱۰: فارماکولوژی");
    });
  });

  describe("formatPersianOf - Canonical 'X از Y' Composite Formatter", () => {
    it("formats pure numbers to 'X از Y'", () => {
      expect(formatPersianOf(2, 4)).toBe("۲ از ۴");
      expect(formatPersianOf(12, 20)).toBe("۱۲ از ۲۰");
      expect(formatPersianOf(0, 10)).toBe("۰ از ۱۰");
    });

    it("formats mixed number/string inputs", () => {
      expect(formatPersianOf("2", "۴")).toBe("۲ از ۴");
      expect(formatPersianOf(2, "۴")).toBe("۲ از ۴");
      expect(formatPersianOf("۲", 4)).toBe("۲ از ۴");
      expect(formatPersianOf("2", 4)).toBe("۲ از ۴");
    });

    it("supports prefix option (مرحله, جلسه, سوال, صفحه, دوره, گام)", () => {
      expect(formatPersianOf(2, 6, { prefix: "مرحله" })).toBe("مرحله ۲ از ۶");
      expect(formatPersianOf(1, 5, { prefix: "مرحله" })).toBe("مرحله ۱ از ۵");
      expect(formatPersianOf(1, 10, { prefix: "جلسه" })).toBe("جلسه ۱ از ۱۰");
      expect(formatPersianOf(3, 20, { prefix: "سوال" })).toBe("سوال ۳ از ۲۰");
      expect(formatPersianOf(1, 4, { prefix: "صفحه" })).toBe("صفحه ۱ از ۴");
      expect(formatPersianOf(1, 3, { prefix: "دوره" })).toBe("دوره ۱ از ۳");
      expect(formatPersianOf(2, 5, { prefix: "گام" })).toBe("گام ۲ از ۵");
    });

    it("supports suffix option (درس, کارت, صحیح, بسته)", () => {
      expect(formatPersianOf(9, 20, { suffix: "درس تکمیل شده" })).toBe("۹ از ۲۰ درس تکمیل شده");
      expect(formatPersianOf(15, 30, { suffix: "کارت مرور شده" })).toBe("۱۵ از ۳۰ کارت مرور شده");
      expect(formatPersianOf(8, 10, { suffix: "صحیح" })).toBe("۸ از ۱۰ صحیح");
    });

    it("handles prefix and suffix together", () => {
      expect(
        formatPersianOf(5, 10, { prefix: "نمایش", suffix: "بسته آموزشی" })
      ).toBe("نمایش ۵ از ۱۰ بسته آموزشی");
    });

    it("handles null or undefined current / total safely", () => {
      expect(formatPersianOf(null, 10)).toBe("۰ از ۱۰");
      expect(formatPersianOf(undefined, undefined)).toBe("۰ از ۰");
    });
  });
});
