import { describe, expect, it } from "vitest";
import {
  validateAndNormalizeIranPhone,
  normalizeIranPhone,
  isValidIranPhone,
  convertEasternToAsciiDigits,
} from "../auth/phone-validation.js";

describe("Iranian Mobile Phone Validation & Canonical Normalization", () => {
  describe("Valid Iranian Phone Numbers", () => {
    it("accepts 09xxxxxxxxx and normalizes to +989xxxxxxxxx", () => {
      const result = validateAndNormalizeIranPhone("09123456789");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("+989123456789");
      expect(normalizeIranPhone("09123456789")).toBe("+989123456789");
      expect(isValidIranPhone("09123456789")).toBe(true);
    });

    it("accepts +989xxxxxxxxx and retains +989xxxxxxxxx", () => {
      const result = validateAndNormalizeIranPhone("+989123456789");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("+989123456789");
    });

    it("accepts 00989xxxxxxxxx and normalizes to +989xxxxxxxxx", () => {
      const result = validateAndNormalizeIranPhone("00989123456789");
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe("+989123456789");
    });

    it("handles spaces, hyphens, and parentheses", () => {
      expect(normalizeIranPhone("0912-345-6789")).toBe("+989123456789");
      expect(normalizeIranPhone("0912 345 6789")).toBe("+989123456789");
      expect(normalizeIranPhone("(0912) 3456789")).toBe("+989123456789");
      expect(normalizeIranPhone("+98 912 345 6789")).toBe("+989123456789");
      expect(normalizeIranPhone("0098-912-345-6789")).toBe("+989123456789");
    });

    it("converts Persian and Arabic digits correctly", () => {
      expect(convertEasternToAsciiDigits("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
      expect(convertEasternToAsciiDigits("٠٩١٢٣٤٥٦٧٨٩")).toBe("09123456789");
      expect(normalizeIranPhone("۰۹۱۲۳۴۵۶۷۸۹")).toBe("+989123456789");
      expect(normalizeIranPhone("٠٩١٢٣٤٥٦٧٨٩")).toBe("+989123456789");
    });

    it("accepts various Iranian mobile prefixes (MCI, Irancell, Rightel, etc.)", () => {
      // MCI: 0912, 0919, 0990
      expect(isValidIranPhone("09121112233")).toBe(true);
      expect(isValidIranPhone("09191112233")).toBe(true);
      expect(isValidIranPhone("09901112233")).toBe(true);
      // MTN Irancell: 0935, 0936, 0937, 0938, 0939, 0901, 0902, 0903
      expect(isValidIranPhone("09351112233")).toBe(true);
      expect(isValidIranPhone("09021112233")).toBe(true);
      // Rightel: 0920, 0921, 0922
      expect(isValidIranPhone("09211112233")).toBe(true);
      // Shatel Mobile: 0998
      expect(isValidIranPhone("09981112233")).toBe(true);
    });
  });

  describe("Invalid Iranian Phone Numbers (Rejections)", () => {
    it("rejects standalone 9xxxxxxxxx (missing leading 0 or country code)", () => {
      const result = validateAndNormalizeIranPhone("9123456789");
      expect(result.valid).toBe(false);
      expect(result.normalized).toBeUndefined();
      expect(isValidIranPhone("9123456789")).toBe(false);
    });

    it("rejects numbers that are too short", () => {
      expect(isValidIranPhone("0912345678")).toBe(false); // 10 digits
      expect(isValidIranPhone("+98912345678")).toBe(false);
      expect(isValidIranPhone("0912")).toBe(false);
    });

    it("rejects numbers that are too long", () => {
      expect(isValidIranPhone("091234567890")).toBe(false); // 12 digits
      expect(isValidIranPhone("+9891234567890")).toBe(false);
      expect(isValidIranPhone("009891234567890")).toBe(false);
    });

    it("rejects non-Iranian country codes", () => {
      expect(isValidIranPhone("+19123456789")).toBe(false);
      expect(isValidIranPhone("+449123456789")).toBe(false);
      expect(isValidIranPhone("0019123456789")).toBe(false);
      expect(isValidIranPhone("+971501234567")).toBe(false);
    });

    it("rejects Iranian landline prefixes (e.g. 021, 031, 051)", () => {
      expect(isValidIranPhone("02188776655")).toBe(false);
      expect(isValidIranPhone("+982188776655")).toBe(false);
    });

    it("rejects alphabetic and non-numeric inputs", () => {
      expect(isValidIranPhone("0912345678a")).toBe(false);
      expect(isValidIranPhone("phone_number")).toBe(false);
      expect(isValidIranPhone("0912345678@")).toBe(false);
    });

    it("rejects empty or null/undefined inputs", () => {
      expect(isValidIranPhone("")).toBe(false);
      expect(isValidIranPhone("   ")).toBe(false);
      expect(isValidIranPhone(null as unknown as string)).toBe(false);
      expect(isValidIranPhone(undefined as unknown as string)).toBe(false);
    });
  });
});
