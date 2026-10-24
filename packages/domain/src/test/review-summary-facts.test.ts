import { describe, expect, it } from "vitest";
import {
  evaluateReviewSummaryDeterministicCoverage,
  validateReviewSummaryPayload,
  getReviewSummaryConfig,
  REVIEW_SUMMARY_CRITICAL_RULES,
  type ReviewSummaryPayload,
} from "../index.js";

describe("Review Summary Deterministic Fact Coverage & Invariants", () => {
  it("exposes critical rule definitions with expected IDs", () => {
    expect(REVIEW_SUMMARY_CRITICAL_RULES.length).toBeGreaterThanOrEqual(6);
    const ruleIds = REVIEW_SUMMARY_CRITICAL_RULES.map((r) => r.id);
    expect(ruleIds).toContain("CRIT-HTN-PREGNANCY");
    expect(ruleIds).toContain("CRIT-HTN-RENAL-STENOSIS");
    expect(ruleIds).toContain("CRIT-HTN-BRADYKININ-COUGH");
    expect(ruleIds).toContain("CRIT-SHOCK-MAP-65");
    expect(ruleIds).toContain("CRIT-SHOCK-VASOPRESSIN-003");
    expect(ruleIds).toContain("CRIT-FOYE-APAP-NAPQI");
  });

  describe("getReviewSummaryConfig with sessionCount", () => {
    it("scales recommendedSections with sessionCount while respecting baseMaxSections and hard cap of 10", () => {
      // 1. Small document without sessionCount
      const small = getReviewSummaryConfig({ chunkCount: 2, totalTokens: 400 });
      expect(small.maxSections).toBe(3);

      // 2. Large document with sessionCount = 12 -> Math.ceil(12 * 0.75) = 9
      const medLarge = getReviewSummaryConfig({ chunkCount: 20, totalTokens: 20000, sessionCount: 12 });
      expect(medLarge.maxSections).toBe(9);

      // 3. Very large document with sessionCount = 20 -> Math.min(10, Math.ceil(20 * 0.75) = 15) = 10
      const large = getReviewSummaryConfig({ chunkCount: 50, totalTokens: 40000, sessionCount: 20 });
      expect(large.maxSections).toBe(10);

      // 4. Document with 0 or undefined sessionCount falls back to baseMaxSections
      const fallback = getReviewSummaryConfig({ chunkCount: 25, totalTokens: 25000 });
      expect(fallback.maxSections).toBe(8);
    });
  });

  describe("Deterministic Rule Evaluation (Positive / Negative / Contradiction)", () => {
    it("evaluates CRIT-HTN-PREGNANCY as covered when drug, pregnancy, and contraindication co-occur", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "داروهای مهارکننده سیستم رنین-آنژیوتانسین (ACEI و ARB)",
        estimatedReadingMinutes: 8,
        overview: "بررسی لوزارتان و کاپتوپریل در فشار خون.",
        sections: [
          {
            title: "موارد منع مصرف",
            keyPoints: [
              "مصرف داروهای ACEI و لوزارتان در بارداری به دلیل خطر تراتوژنیسیته و آسیب شدید کلیوی به جنین کاملاً منع مصرف دارد.",
            ],
            mechanisms: ["مهار تبدیل آنژیوتانسین I به II"],
          },
        ],
        finalTakeaways: ["نکته جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const report = evaluateReviewSummaryDeterministicCoverage(payload);
      const pregRule = report.evaluations.find((e) => e.factId === "CRIT-HTN-PREGNANCY");
      expect(pregRule).toBeDefined();
      expect(pregRule?.status).toBe("covered");
      expect(pregRule?.evidence).toContain("بارداری");
      expect(report.coveredCount).toBeGreaterThanOrEqual(1);
    });

    it("evaluates CRIT-HTN-PREGNANCY as contradiction if text states ACEI/ARB is safe in pregnancy", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "فشار خون و ACEI",
        estimatedReadingMinutes: 5,
        overview: "درمان فشار خون با کاپتوپریل.",
        sections: [
          {
            title: "نکات بالینی",
            keyPoints: ["کاپتوپریل انتخابی ایمن و کاملاً مجاز در بارداری محسوب می‌شود."],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const report = evaluateReviewSummaryDeterministicCoverage(payload);
      const pregRule = report.evaluations.find((e) => e.factId === "CRIT-HTN-PREGNANCY");
      expect(pregRule).toBeDefined();
      expect(pregRule?.status).toBe("contradiction");
      expect(pregRule?.details).toContain("تناقض بالینی");
      expect(report.contradictionCount).toBe(1);
    });

    it("evaluates CRIT-HTN-PREGNANCY as unverified when ACEI mentioned without pregnancy contraindication", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "داروهای فشار خون (کاپتوپریل و لوزارتان)",
        estimatedReadingMinutes: 5,
        overview: "مرور دوزاژ و نحوه مصرف مهارکننده های ACE.",
        sections: [
          {
            title: "دوز مصرفی",
            keyPoints: ["کاپتوپریل روزانه ۲۵ میلی‌گرم تجویز می‌شود."],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const report = evaluateReviewSummaryDeterministicCoverage(payload);
      const pregRule = report.evaluations.find((e) => e.factId === "CRIT-HTN-PREGNANCY");
      expect(pregRule).toBeDefined();
      expect(pregRule?.status).toBe("unverified");
      expect(pregRule?.details).toContain("هشدار");
    });

    it("handles Persian vs English digits seamlessly for CRIT-SHOCK-MAP-65", () => {
      // Test with Persian digits: ۶۵
      const persianPayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "مدیریت شوک سپتیک",
        estimatedReadingMinutes: 6,
        overview: "پروتکل احیای بیماران شوک سپسیس.",
        sections: [
          {
            title: "اهداف همودینامیک",
            keyPoints: ["هدف اولیه فشار متوسط شریانی یا map حداقل ۶۵ میلی‌متر جیوه است."],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const persianReport = evaluateReviewSummaryDeterministicCoverage(persianPayload);
      const mapRulePersian = persianReport.evaluations.find((e) => e.factId === "CRIT-SHOCK-MAP-65");
      expect(mapRulePersian).toBeDefined();
      expect(mapRulePersian?.status).toBe("covered");

      // Test with English digits: 65
      const englishPayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "مدیریت شوک سپتیک",
        estimatedReadingMinutes: 6,
        overview: "پروتکل احیای سپسیس.",
        sections: [
          {
            title: "اهداف همودینامیک",
            keyPoints: ["The target MAP should be maintained >= 65 mmHg using norepinephrine."],
          },
        ],
        finalTakeaways: ["Takeaway"],
        citationChunkIds: ["chunk-1"],
      };

      const englishReport = evaluateReviewSummaryDeterministicCoverage(englishPayload);
      const mapRuleEnglish = englishReport.evaluations.find((e) => e.factId === "CRIT-SHOCK-MAP-65");
      expect(mapRuleEnglish).toBeDefined();
      expect(mapRuleEnglish?.status).toBe("covered");
    });

    it("handles fixed vasopressin dose 0.03 units/min with both Persian and English notation", () => {
      const payloadPersian: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "شوک و وازوپرسورها",
        estimatedReadingMinutes: 5,
        overview: "استفاده از وازوپرسین در شوک مقاوم.",
        sections: [
          {
            title: "وازوپرسین",
            keyPoints: ["دوز وازوپرسین به‌صورت فیکس ۰.۰۳ واحد در دقیقه تجویز می‌شود."],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const reportPersian = evaluateReviewSummaryDeterministicCoverage(payloadPersian);
      const vasoRule = reportPersian.evaluations.find((e) => e.factId === "CRIT-SHOCK-VASOPRESSIN-003");
      expect(vasoRule).toBeDefined();
      expect(vasoRule?.status).toBe("covered");

      const payloadEnglish: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "شوک و وازوپرسورها",
        estimatedReadingMinutes: 5,
        overview: "استفاده از وازوپرسین در شوک مقاوم.",
        sections: [
          {
            title: "وازوپرسین",
            keyPoints: ["Vasopressin is added at a fixed titration of 0.03 units/min."],
          },
        ],
        finalTakeaways: ["Takeaway"],
        citationChunkIds: ["chunk-1"],
      };

      const reportEnglish = evaluateReviewSummaryDeterministicCoverage(payloadEnglish);
      const vasoRuleEng = reportEnglish.evaluations.find((e) => e.factId === "CRIT-SHOCK-VASOPRESSIN-003");
      expect(vasoRuleEng).toBeDefined();
      expect(vasoRuleEng?.status).toBe("covered");
    });

    it("detects CRIT-FOYE-APAP-NAPQI mechanism, toxic metabolite, and glutathione/NAC", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "سم‌شناسی و متابولیسم استامینوفن بر اساس فوئی",
        estimatedReadingMinutes: 8,
        overview: "مسیرهای متابولیک استامینوفن و مسمومیت کبدی.",
        sections: [
          {
            title: "متابولیسم سمی",
            mechanisms: [
              "متابولیسم پاراستامول توسط CYP2E1 به متابولیت فعال و الکتروفیل napqi تبدیل شده که با تخلیه گلوتاتیون موجب نکروز سلول کبدی می‌گردد.",
            ],
            keyPoints: ["پادزهر اختصاصی استیل سیستئین (NAC) است."],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const report = evaluateReviewSummaryDeterministicCoverage(payload);
      const apapRule = report.evaluations.find((e) => e.factId === "CRIT-FOYE-APAP-NAPQI");
      expect(apapRule).toBeDefined();
      expect(apapRule?.status).toBe("covered");
    });

    it("ignores inapplicable rules when document is on a completely different topic", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "مبانی اخلاق پزشکی و حقوق بیمار",
        estimatedReadingMinutes: 5,
        overview: "رضایت آگاهانه و استقلال فردی در طبابت.",
        sections: [
          {
            title: "اصول اخلاق",
            keyPoints: ["چهار اصل اخلاق زیستی شامل اتونومی، سودرسانی، عدم ضرر و عدالت است."],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const report = evaluateReviewSummaryDeterministicCoverage(payload);
      expect(report.evaluatedRulesCount).toBe(0);
      expect(report.coveredCount).toBe(0);
      expect(report.evaluations.length).toBe(0);
      expect(report.warnings.length).toBe(0);
    });
  });

  describe("Integration with validateReviewSummaryPayload", () => {
    it("attaches coverageWarnings and coverageReport to validated payload without throwing errors", () => {
      const rawPayload = {
        kind: "review_summary",
        title: "راهنمای فشار خون",
        estimatedReadingMinutes: 7,
        overview: "مرور لوزارتان و انالاپریل در طب داخلی.",
        sections: [
          {
            title: "مهارکننده های ACE",
            keyPoints: ["کاپتوپریل باعث مهار تولید آنژیوتانسین می‌شود."],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      const validated = validateReviewSummaryPayload(rawPayload);
      expect(validated.coverageReport).toBeDefined();
      expect(validated.coverageReport?.evaluations.length).toBeGreaterThan(0);
      // Because pregnancy and renal stenosis were not mentioned, warnings should be present
      expect(validated.coverageWarnings).toBeDefined();
      expect(validated.coverageWarnings?.length).toBeGreaterThan(0);
      expect(validated.coverageWarnings?.some((w) => w.includes("CRIT-HTN-PREGNANCY"))).toBe(true);
    });
  });

  describe("Historical Audit Document Verification", () => {
    it("evaluates real historical audit payloads accurately with deterministic assertions", () => {
      // Historical fixture data matching production drafts
      const historicalDrafts: Record<string, ReviewSummaryPayload> = {
        "Essential Hypertension": {
          kind: "review_summary",
          title: "فشار خون اولیه و مهارکننده‌های رنین-آنژیوتانسین (ACEI و ARB)",
          estimatedReadingMinutes: 8,
          overview: "بررسی بالینی کاپتوپریل و لوزارتان در کنترل فشار خون اولیه.",
          sections: [
            {
              title: "عوارض جانبی و برادی‌کینین",
              keyPoints: [
                "تجمع برادی‌کینین به علت مهار آنزیم ACE یکی از دلایل اصلی سرفه خشک و آنژیوادم در مصرف کاپتوپریل است.",
              ],
            },
          ],
          finalTakeaways: ["پایش فشار خون و تغییر به ARB در صورت بروز سرفه ناشی از برادی‌کینین."],
          citationChunkIds: ["chunk-htn-1"],
        },
        Shock: {
          kind: "review_summary",
          title: "مدیریت شوک سپتیک و وازوپرسورها",
          estimatedReadingMinutes: 6,
          overview: "پروتکل احیای همودینامیک بیماران مبتلا به شوک سپسیس.",
          sections: [
            {
              title: "اهداف فشار خون و وازوپرسور کمکی",
              keyPoints: [
                "هدف اولیه در احیا حفظ فشار متوسط شریانی (MAP) حداقل ۶۵ میلی‌متر جیوه است.",
                "وازوپرسین با دوز ثابت ۰.۰۳ واحد در دقیقه به عنوان داروی خط دوم به نوراپی‌نفرین اضافه می‌شود.",
              ],
            },
          ],
          finalTakeaways: ["تنظیم دوز بر اساس رسیدن به MAP >= 65 mmHg."],
          citationChunkIds: ["chunk-shock-1"],
        },
        "Foye Xenobiotic Metabolism": {
          kind: "review_summary",
          title: "متابولیسم زنوبیوتیک‌ها و سمیت استامینوفن (بر اساس کتاب فوئی)",
          estimatedReadingMinutes: 7,
          overview: "مسیرهای بیوترانسفورماسیون فاز یک و دو استامینوفن و سمیت هپاتوسیت‌ها.",
          sections: [
            {
              title: "مسیر سمیت کبدی و NAPQI",
              mechanisms: [
                "تبدیل پاراستامول توسط سیتوکروم به متابولیت سمی NAPQI که در صورت کاهش گلوتاتیون موجب پیوند کووالان با پروتئین‌های کبد و نکروز می‌شود.",
              ],
              keyPoints: ["ان استیل سیستئین (NAC) به عنوان پیش‌ساز گلوتاتیون پادزهر انتخابی است."],
            },
          ],
          finalTakeaways: ["تجویز زودهنگام NAC برای خنثی‌سازی NAPQI حیاتی است."],
          citationChunkIds: ["chunk-foye-1"],
        },
      };

      // 1. Essential Hypertension historical draft
      const htnPayload = historicalDrafts["Essential Hypertension"];
      const htnReport = evaluateReviewSummaryDeterministicCoverage(htnPayload);
      expect(htnReport.evaluatedRulesCount).toBe(3);
      // Bradykinin was covered in historical draft
      const bradyRule = htnReport.evaluations.find((e) => e.factId === "CRIT-HTN-BRADYKININ-COUGH");
      expect(bradyRule?.status).toBe("covered");
      // Pregnancy and Renal stenosis were unverified in historical draft (omission identified in audit)
      const pregRule = htnReport.evaluations.find((e) => e.factId === "CRIT-HTN-PREGNANCY");
      expect(pregRule?.status).toBe("unverified");
      const renalRule = htnReport.evaluations.find((e) => e.factId === "CRIT-HTN-RENAL-STENOSIS");
      expect(renalRule?.status).toBe("unverified");
      expect(htnReport.unverifiedCount).toBe(2);

      // 2. Shock historical draft
      const shockPayload = historicalDrafts["Shock"];
      const shockReport = evaluateReviewSummaryDeterministicCoverage(shockPayload);
      expect(shockReport.evaluatedRulesCount).toBe(2);
      const mapRule = shockReport.evaluations.find((e) => e.factId === "CRIT-SHOCK-MAP-65");
      expect(mapRule?.status).toBe("covered");
      const vasoRule = shockReport.evaluations.find((e) => e.factId === "CRIT-SHOCK-VASOPRESSIN-003");
      expect(vasoRule?.status).toBe("covered");
      expect(shockReport.coveredCount).toBe(2);
      expect(shockReport.unverifiedCount).toBe(0);

      // 3. Foye Xenobiotic Metabolism historical draft
      const foyePayload = historicalDrafts["Foye Xenobiotic Metabolism"];
      const foyeReport = evaluateReviewSummaryDeterministicCoverage(foyePayload);
      expect(foyeReport.evaluatedRulesCount).toBe(1);
      const apapRule = foyeReport.evaluations.find((e) => e.factId === "CRIT-FOYE-APAP-NAPQI");
      expect(apapRule?.status).toBe("covered");
      expect(foyeReport.coveredCount).toBe(1);
    });
  });
});
