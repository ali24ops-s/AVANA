import { describe, it, expect } from "vitest";
import {
  ACADEMIC_FIELDS,
  isValidAcademicField,
  getAcademicFieldLabel,
  normalizeAcademicFields,
  scoreCourseRelevance,
  isSpecificAcademicField,
} from "../academic-fields.js";

describe("Academic Fields Domain Unit Tests", () => {
  it("contains all 14 standard academic fields including other and undecided", () => {
    expect(ACADEMIC_FIELDS.length).toBe(14);
    const ids = ACADEMIC_FIELDS.map((f) => f.id);
    expect(ids).toContain("pharmacy");
    expect(ids).toContain("medicine");
    expect(ids).toContain("dentistry");
    expect(ids).toContain("nursing");
    expect(ids).toContain("medical_laboratory");
    expect(ids).toContain("operating_room");
    expect(ids).toContain("anesthesia");
    expect(ids).toContain("midwifery");
    expect(ids).toContain("physiotherapy");
    expect(ids).toContain("occupational_therapy");
    expect(ids).toContain("nutrition");
    expect(ids).toContain("public_health");
    expect(ids).toContain("other");
    expect(ids).toContain("undecided");
  });

  it("validates valid and invalid academic field ids correctly", () => {
    expect(isValidAcademicField("pharmacy")).toBe(true);
    expect(isValidAcademicField("medicine")).toBe(true);
    expect(isValidAcademicField("other")).toBe(true);
    expect(isValidAcademicField("undecided")).toBe(true);
    expect(isValidAcademicField("invalid_field")).toBe(false);
    expect(isValidAcademicField("")).toBe(false);
    expect(isValidAcademicField(null)).toBe(false);
    expect(isValidAcademicField(undefined)).toBe(false);
    expect(isValidAcademicField(123)).toBe(false);
  });

  it("returns correct Persian labels", () => {
    expect(getAcademicFieldLabel("pharmacy")).toBe("داروسازی");
    expect(getAcademicFieldLabel("medicine")).toBe("پزشکی");
    expect(getAcademicFieldLabel("undecided")).toBe("هنوز انتخاب نکرده‌ام");
    expect(getAcademicFieldLabel("unknown")).toBe("سایر");
    expect(getAcademicFieldLabel(null)).toBe("نامشخص");
  });

  it("normalizes academic field arrays safely", () => {
    expect(normalizeAcademicFields(["pharmacy", "medicine", "invalid", "pharmacy"])).toEqual([
      "pharmacy",
      "medicine",
    ]);
    expect(normalizeAcademicFields(null)).toEqual([]);
    expect(normalizeAcademicFields(undefined)).toEqual([]);
    expect(normalizeAcademicFields("not-an-array")).toEqual([]);
  });

  it("distinguishes specific disciplines from other and undecided", () => {
    expect(isSpecificAcademicField("medicine")).toBe(true);
    expect(isSpecificAcademicField("pharmacy")).toBe(true);
    expect(isSpecificAcademicField("other")).toBe(false);
    expect(isSpecificAcademicField("undecided")).toBe(false);
    expect(isSpecificAcademicField(null)).toBe(false);
    expect(isSpecificAcademicField(undefined)).toBe(false);
  });

  describe("scoreCourseRelevance Soft Ranking Rules", () => {
    it("assigns 100 (direct_match) when course targets the student's specific major", () => {
      const res = scoreCourseRelevance(["pharmacy", "medicine"], "pharmacy");
      expect(res.tier).toBe("direct_match");
      expect(res.score).toBe(100);
    });

    it("assigns 50 (general) when course has no target academic fields (universal course)", () => {
      const res = scoreCourseRelevance([], "pharmacy");
      expect(res.tier).toBe("general");
      expect(res.score).toBe(50);

      const resNull = scoreCourseRelevance(null, "pharmacy");
      expect(resNull.tier).toBe("general");
      expect(resNull.score).toBe(50);
    });

    it("assigns 10 (unrelated) when course targets other disciplines exclusively", () => {
      const res = scoreCourseRelevance(["dentistry", "nursing"], "pharmacy");
      expect(res.tier).toBe("unrelated");
      expect(res.score).toBe(10);
    });

    it("assigns 50 (general) for students with undecided, other, or null major across all courses", () => {
      // Undecided student
      expect(scoreCourseRelevance(["pharmacy"], "undecided")).toEqual({
        score: 50,
        tier: "general",
      });
      // Other student
      expect(scoreCourseRelevance(["pharmacy"], "other")).toEqual({
        score: 50,
        tier: "general",
      });
      // Legacy student with null/undefined major
      expect(scoreCourseRelevance(["pharmacy"], null)).toEqual({
        score: 50,
        tier: "general",
      });
      expect(scoreCourseRelevance([], null)).toEqual({
        score: 50,
        tier: "general",
      });
    });
  });
});
