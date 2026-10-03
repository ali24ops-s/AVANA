import { describe, it, expect } from "vitest";
import {
  TEACHING_UNIVERSITIES,
  ACADEMIC_DEPARTMENTS,
  validateTeacherAcademicProfile,
} from "../teacher-academic-profile.js";

describe("Teacher Academic Profile Domain Tests", () => {
  it("provides canonical Iranian medical universities and academic departments", () => {
    expect(TEACHING_UNIVERSITIES.length).toBeGreaterThan(40);
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی تهران");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی شهید بهشتی");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی اردبیل");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی ارومیه");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی تبریز");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی اصفهان");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی شیراز");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی مشهد");
    expect(TEACHING_UNIVERSITIES).toContain("دانشگاه علوم پزشکی اهواز (جندی‌شاپور)");

    expect(ACADEMIC_DEPARTMENTS.length).toBeGreaterThan(25);
    expect(ACADEMIC_DEPARTMENTS).toContain("فارماکولوژی");
    expect(ACADEMIC_DEPARTMENTS).toContain("شیمی دارویی");
    expect(ACADEMIC_DEPARTMENTS).toContain("فارماسیوتیکس");
    expect(ACADEMIC_DEPARTMENTS).toContain("دارودرمانی و داروسازی بالینی");
    expect(ACADEMIC_DEPARTMENTS).toContain("بیماری‌های داخلی");
    expect(ACADEMIC_DEPARTMENTS).toContain("دندانپزشکی ترمیمی و زیبایی");
    expect(ACADEMIC_DEPARTMENTS).toContain("پرستاری داخلی - جراحی");
  });

  it("validates valid teacher academic profile input", () => {
    const result = validateTeacherAcademicProfile({
      university: "دانشگاه علوم پزشکی تهران",
      faculty: "دانشکده داروسازی",
      department: "فارماکولوژی",
    });

    expect(result.valid).toBe(true);
    expect(result.normalized).toEqual({
      university: "دانشگاه علوم پزشکی تهران",
      faculty: "دانشکده داروسازی",
      department: "فارماکولوژی",
    });
  });

  it("supports custom university and department entries (open taxonomy)", () => {
    const result = validateTeacherAcademicProfile({
      university: "دانشگاه علوم پزشکی بقیه‌الله",
      faculty: "دانشکده پزشکی",
      department: "طب اورژانس",
    });

    expect(result.valid).toBe(true);
    expect(result.normalized?.university).toBe("دانشگاه علوم پزشکی بقیه‌الله");
    expect(result.normalized?.department).toBe("طب اورژانس");
  });

  it("enforces required validation when isRequired is true", () => {
    const missingResult = validateTeacherAcademicProfile(
      { university: "", department: "" },
      { isRequired: true },
    );
    expect(missingResult.valid).toBe(false);
    expect(missingResult.error).toContain("دانشگاه");

    const missingDeptResult = validateTeacherAcademicProfile(
      { university: "دانشگاه تهران", department: "" },
      { isRequired: true },
    );
    expect(missingDeptResult.valid).toBe(false);
    expect(missingDeptResult.error).toContain("گروه آموزشی");
  });

  it("handles null/undefined gracefully for non-required scenarios", () => {
    const nullResult = validateTeacherAcademicProfile(null);
    expect(nullResult.valid).toBe(true);
    expect(nullResult.normalized).toEqual({
      university: null,
      faculty: null,
      department: null,
    });
  });
});
