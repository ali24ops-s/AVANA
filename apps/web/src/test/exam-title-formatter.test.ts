import { describe, expect, it } from "vitest";
import {
  isInternalIdentifier,
  extractCleanTitles,
  formatExamDisplayTitle,
} from "../lib/utils/exam-title-formatter.js";

describe("exam-title-formatter utility", () => {
  describe("isInternalIdentifier", () => {
    it("identifies standard RFC UUIDs as internal identifiers", () => {
      expect(isInternalIdentifier("93b501bf-dc27-4056-9c95-6d6639cc630a")).toBe(true);
      expect(isInternalIdentifier("4326da85-03c2-4ade-bc56-d4da7f304e9a")).toBe(true);
      expect(isInternalIdentifier("13fffea7-a743-4786-91ed-45b36671eca4")).toBe(true);
      expect(isInternalIdentifier("00000000-0000-0000-0000-000000000000")).toBe(true);
    });

    it("identifies internal prefixed IDs and system placeholders as internal identifiers", () => {
      expect(isInternalIdentifier("course-123")).toBe(true);
      expect(isInternalIdentifier("mod-cardio")).toBe(true);
      expect(isInternalIdentifier("les-neuro-4")).toBe(true);
      expect(isInternalIdentifier("quiz-attempt-xyz")).toBe(true);
      expect(isInternalIdentifier("att-12345")).toBe(true);
      expect(isInternalIdentifier("course-unassigned")).toBe(true);
      expect(isInternalIdentifier("mod-unassigned")).toBe(true);
    });

    it("does NOT classify valid human-readable titles (Persian, English, numbers, abbreviations) as IDs", () => {
      expect(isInternalIdentifier("HPA Axis")).toBe(false);
      expect(isInternalIdentifier("جلسه ۱")).toBe(false);
      expect(isInternalIdentifier("جلسه ۱: مبانی فیزیولوژیک و محور آدرنال (HPA Axis)")).toBe(false);
      expect(isInternalIdentifier("Pharmacokinetics")).toBe(false);
      expect(isInternalIdentifier("فارماکولوژی قلب و عروق")).toBe(false);
      expect(isInternalIdentifier("بلوک ۱: مفاهیم پایه (بخش دوم)")).toBe(false);
      expect(isInternalIdentifier("ACE-2 Inhibitor")).toBe(false);
    });
  });

  describe("extractCleanTitles & formatExamDisplayTitle", () => {
    it("cleans the exact user-reported polluted string with interleaved UUIDs and session titles", () => {
      const pollutedString =
        "93b501bf-dc27-4056-9c95-6d6639cc630a, جلسه ۱: مبانی فیزیولوژیک و محور آدرنال (HPA Axis), 4326da85-03c2-4ade-bc56-d4da7f304e9a, جلسه ۲: فارماکوکینتیک و مکانیسم سلولی و مولکولی گلوکوکورتیکوئیدها, 13fffea7-a743-4786-91ed-45b36671eca4";

      const cleanTitles = extractCleanTitles(pollutedString);
      expect(cleanTitles).toEqual([
        "جلسه ۱: مبانی فیزیولوژیک و محور آدرنال (HPA Axis)",
        "جلسه ۲: فارماکوکینتیک و مکانیسم سلولی و مولکولی گلوکوکورتیکوئیدها",
      ]);

      const displayTitle = formatExamDisplayTitle(pollutedString);
      expect(displayTitle).toBe(
        "جلسه ۱: مبانی فیزیولوژیک و محور آدرنال (HPA Axis)، جلسه ۲: فارماکوکینتیک و مکانیسم سلولی و مولکولی گلوکوکورتیکوئیدها",
      );
      expect(displayTitle.includes("93b501bf")).toBe(false);
      expect(displayTitle.includes("4326da85")).toBe(false);
      expect(displayTitle.includes("13fffea7")).toBe(false);
    });

    it("handles a lone UUID by falling back to the default title", () => {
      const loneUuid = "93b501bf-dc27-4056-9c95-6d6639cc630a";
      expect(extractCleanTitles(loneUuid)).toEqual([]);
      expect(formatExamDisplayTitle(loneUuid)).toBe("آزمون جامع");
      expect(formatExamDisplayTitle(loneUuid, "عنوان دلخواه")).toBe("عنوان دلخواه");
    });

    it("handles string arrays containing mixed UUIDs and titles", () => {
      const arr = [
        "93b501bf-dc27-4056-9c95-6d6639cc630a",
        "جلسه ۱: مبانی فیزیولوژیک",
        "4326da85-03c2-4ade-bc56-d4da7f304e9a",
        "جلسه ۲: فارماکوکینتیک",
      ];
      expect(extractCleanTitles(arr)).toEqual([
        "جلسه ۱: مبانی فیزیولوژیک",
        "جلسه ۲: فارماکوکینتیک",
      ]);
      expect(formatExamDisplayTitle(arr)).toBe("جلسه ۱: مبانی فیزیولوژیک، جلسه ۲: فارماکوکینتیک");
    });

    it("handles tuples [[UUID, Title], [UUID, Title]]", () => {
      const tuples = [
        ["93b501bf-dc27-4056-9c95-6d6639cc630a", "جلسه ۱: آناتومی"],
        ["4326da85-03c2-4ade-bc56-d4da7f304e9a", "جلسه ۲: فیزیولوژی"],
      ];
      expect(extractCleanTitles(tuples)).toEqual(["جلسه ۱: آناتومی", "جلسه ۲: فیزیولوژی"]);
      expect(formatExamDisplayTitle(tuples)).toBe("جلسه ۱: آناتومی، جلسه ۲: فیزیولوژی");
    });

    it("handles objects [{ id: UUID, title: Title }]", () => {
      const objects = [
        { id: "93b501bf-dc27-4056-9c95-6d6639cc630a", title: "درس اول: مبانی" },
        { id: "4326da85-03c2-4ade-bc56-d4da7f304e9a", title: "درس دوم: کاربردها" },
      ];
      expect(extractCleanTitles(objects)).toEqual(["درس اول: مبانی", "درس دوم: کاربردها"]);
      expect(formatExamDisplayTitle(objects)).toBe("درس اول: مبانی، درس دوم: کاربردها");
    });

    it("deduplicates identical titles while strictly preserving order", () => {
      const inputWithDuplicates = [
        "فارماکولوژی",
        "93b501bf-dc27-4056-9c95-6d6639cc630a",
        "فارماکولوژی",
        "کاردیولوژی",
      ];
      expect(extractCleanTitles(inputWithDuplicates)).toEqual(["فارماکولوژی", "کاردیولوژی"]);
      expect(formatExamDisplayTitle(inputWithDuplicates)).toBe("فارماکولوژی، کاردیولوژی");
    });

    it("preserves English terms and abbreviations without mangling them", () => {
      const input = "HPA Axis, Pharmacokinetics, 93b501bf-dc27-4056-9c95-6d6639cc630a";
      expect(extractCleanTitles(input)).toEqual(["HPA Axis", "Pharmacokinetics"]);
      expect(formatExamDisplayTitle(input)).toBe("HPA Axis، Pharmacokinetics");
    });

    it("handles empty or null/undefined gracefully", () => {
      expect(extractCleanTitles(null)).toEqual([]);
      expect(extractCleanTitles(undefined)).toEqual([]);
      expect(extractCleanTitles("")).toEqual([]);
      expect(formatExamDisplayTitle(null)).toBe("آزمون جامع");
      expect(formatExamDisplayTitle(undefined)).toBe("آزمون جامع");
    });
  });
});
