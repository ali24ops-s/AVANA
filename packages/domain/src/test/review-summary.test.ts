import { describe, expect, it } from "vitest";
import {
  getReviewSummaryConfig,
  type ReviewSummaryPayload,
  type ReviewSummarySection,
  type ReviewSummaryComparison,
  isGenerationTypeEnabled,
  ALL_GENERATION_TYPES,
  ENABLED_GENERATION_TYPES,
  validateReviewSummaryPayload,
  validateAndGroundReviewSummaryCitations,
  consolidateReviewSummarySections,
  flattenReviewSummarySections,
  cleanReviewSectionTitle,
  DomainError,
  isLessonChunkSetCurrent,
  isContentPlanChunkSetCurrent,
} from "../index.js";

describe("Review Summary Domain & Budgeting", () => {
  it("enables review_summary in ALL_GENERATION_TYPES and ENABLED_GENERATION_TYPES", () => {
    expect(ALL_GENERATION_TYPES).toContain("review_summary");
    expect(ENABLED_GENERATION_TYPES).toContain("review_summary");
    expect(isGenerationTypeEnabled("review_summary")).toBe(true);
  });

  it("calculates adaptive review budget with dense Persian reading speed", () => {
    const config = getReviewSummaryConfig({
      chunkCount: 10,
      totalTokens: 12000,
    });

    expect(config.targetReadingMinutes).toBe(10);
    expect(config.minReadingMinutes).toBe(8);
    expect(config.maxReadingMinutes).toBe(13);
    expect(config.wordsPerMinute).toBe(120);
    expect(config.targetWordBudget).toBe(1250); 
    expect(config.minWordBudget).toBe(1000);    
    expect(config.maxWordBudget).toBe(1500);    
    expect(config.maxSections).toBe(6);
  });

  it("adapts maxSections based on document chunk count and size category", () => {
    const smallConfig = getReviewSummaryConfig({
      chunkCount: 2,
      totalTokens: 400,
    });
    expect(smallConfig.maxSections).toBe(3);

    const largeConfig = getReviewSummaryConfig({
      chunkCount: 25,
      totalTokens: 25000,
    });
    expect(largeConfig.maxSections).toBe(8);
  });

  it("validates structured ReviewSummaryPayload and section typings", () => {
    const comparison: ReviewSummaryComparison = {
      conceptA: "داروی A",
      conceptB: "داروی B",
      keyDifferences: "تفاوت در نیمه‌عمر و مسیر متابولیسم",
    };

    const section: ReviewSummarySection = {
      title: "فارماکوکینتیک و مکانیسم اثر",
      keyPoints: ["نکته اول", "نکته دوم"],
      mechanisms: ["مهار انتخابی گیرنده X"],
      classifications: ["دسته اول دارویی"],
      comparisons: [comparison],
      memorizationPoints: ["دوز معمول: ۱۰ میلی‌گرم روزانه"],
      examPoints: ["نکته تستی پرتکرار در مورد کنترااندیکاسیون در بارداری"],
      citationChunkIds: ["chunk-1", "chunk-2"],
    };

    const payload: ReviewSummaryPayload = {
      kind: "review_summary",
      title: "خلاصه مروری فارماکولوژی قلبی",
      estimatedReadingMinutes: 12,
      overview: "خلاصه فوق‌العاده فشرده از داروهای قلبی عروقی.",
      sections: [section],
      finalTakeaways: ["جمع‌بندی طلایی ۱", "جمع‌بندی طلایی ۲"],
      citationChunkIds: ["chunk-1", "chunk-2"],
      targetReadingMinutes: 12,
    };

    expect(payload.kind).toBe("review_summary");
    expect(payload.sections.length).toBe(1);
    expect(payload.sections[0].comparisons?.[0]).toEqual(comparison);
    expect(payload.estimatedReadingMinutes).toBe(12);
  });

  describe("validateReviewSummaryPayload (C3 Enforcement)", () => {
    it("rejects non-object or null input", () => {
      expect(() => validateReviewSummaryPayload(null)).toThrow(DomainError);
      expect(() => validateReviewSummaryPayload(null)).toThrow("STAGE5_INVALID_MODEL_JSON");
      expect(() => validateReviewSummaryPayload("string")).toThrow("STAGE5_INVALID_MODEL_JSON");
      expect(() => validateReviewSummaryPayload([])).toThrow("STAGE5_INVALID_MODEL_JSON");
    });

    it("rejects missing or empty title", () => {
      expect(() =>
        validateReviewSummaryPayload({
          title: "",
          overview: "بررسی کلی",
          sections: [{ title: "بخش ۱", keyPoints: ["نکته ۱"] }],
        }),
      ).toThrow("STAGE5_INVALID_MODEL_JSON");
    });

    it("rejects missing or empty overview", () => {
      expect(() =>
        validateReviewSummaryPayload({
          title: "خلاصه مبحث",
          overview: "   ",
          sections: [{ title: "بخش ۱", keyPoints: ["نکته ۱"] }],
        }),
      ).toThrow("STAGE5_INVALID_MODEL_JSON");
    });

    it("rejects empty sections array (no placeholder sections manufactured)", () => {
      expect(() =>
        validateReviewSummaryPayload({
          title: "خلاصه مبحث",
          overview: "بررسی کلی",
          sections: [],
        }),
      ).toThrow("STAGE5_INVALID_MODEL_JSON");
    });

    it("rejects section with missing or empty title", () => {
      expect(() =>
        validateReviewSummaryPayload({
          title: "خلاصه مبحث",
          overview: "بررسی کلی",
          sections: [{ title: "", keyPoints: ["نکته ۱"] }],
        }),
      ).toThrow("STAGE5_INVALID_MODEL_JSON");
    });

    it("rejects section with missing or empty keyPoints", () => {
      expect(() =>
        validateReviewSummaryPayload({
          title: "خلاصه مبحث",
          overview: "بررسی کلی",
          sections: [{ title: "بخش اول", keyPoints: [] }],
        }),
      ).toThrow("STAGE5_INVALID_MODEL_JSON");

      expect(() =>
        validateReviewSummaryPayload({
          title: "خلاصه مبحث",
          overview: "بررسی کلی",
          sections: [{ title: "بخش اول", keyPoints: ["   "] }],
        }),
      ).toThrow("STAGE5_INVALID_MODEL_JSON");
    });

    it("accepts valid payload and preserves exact content", () => {
      const valid = {
        title: "فارماکولوژی مبحث قلب",
        overview: "بررسی ساختار و عملکرد داروهای قلبی",
        sections: [
          {
            title: "مهارکننده‌های آنزیم ACE",
            keyPoints: ["کاپتوپریل و انالاپریل", "کاهش مقاومت عروقی"],
          },
        ],
        finalTakeaways: ["نکات جمع‌بندی مهم"],
        citationChunkIds: ["chunk-1"],
      };

      const result = validateReviewSummaryPayload(valid);
      expect(result.title).toBe("فارماکولوژی مبحث قلب");
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].title).toBe("مهارکننده‌های آنزیم ACE");
      expect(result.sections[0].keyPoints).toEqual([
        "کاپتوپریل و انالاپریل",
        "کاهش مقاومت عروقی",
      ]);
      expect(result.finalTakeaways).toEqual(["نکات جمع‌بندی مهم"]);
    });
  });

  describe("validateAndGroundReviewSummaryCitations (I1 Enforcement)", () => {
    const availableChunks = ["chunk-1", "chunk-2", "chunk-3"];

    it("A. Valid section citations: preserves section citations and builds union", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه معتبر",
        estimatedReadingMinutes: 10,
        overview: "توضیح کلی",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-1"],
          },
          {
            title: "بخش ۲",
            keyPoints: ["نکته ۲"],
            citationChunkIds: ["chunk-2"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      };

      const grounded = validateAndGroundReviewSummaryCitations(payload, availableChunks);
      expect(grounded.sections[0].citationChunkIds).toEqual(["chunk-1"]);
      expect(grounded.sections[1].citationChunkIds).toEqual(["chunk-2"]);
      expect(grounded.citationChunkIds).toEqual(["chunk-1", "chunk-2"]);
    });

    it("B. Unknown section citation: fails explicitly", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه معتبر",
        estimatedReadingMinutes: 10,
        overview: "توضیح کلی",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-that-does-not-exist"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      };

      expect(() => validateAndGroundReviewSummaryCitations(payload, availableChunks)).toThrow(
        "STAGE5_INVALID_SECTION_CITATION",
      );
    });

    it("C. Empty citation: section with empty citations fails explicitly", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه معتبر",
        estimatedReadingMinutes: 10,
        overview: "توضیح کلی",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته ۱"],
            citationChunkIds: [],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      };

      expect(() => validateAndGroundReviewSummaryCitations(payload, availableChunks)).toThrow(
        "STAGE5_INVALID_SECTION_CITATION",
      );
    });

    it("D. Mixed valid/invalid citations: fails explicitly without silently keeping only valid", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه معتبر",
        estimatedReadingMinutes: 10,
        overview: "توضیح کلی",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-1", "fake-chunk"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      };

      expect(() => validateAndGroundReviewSummaryCitations(payload, availableChunks)).toThrow(
        "STAGE5_INVALID_SECTION_CITATION",
      );
    });

    it("E. Multiple sections: preserves section-specific mapping and does not merge into sections", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه معتبر",
        estimatedReadingMinutes: 10,
        overview: "توضیح کلی",
        sections: [
          {
            title: "Section A",
            keyPoints: ["نکته A"],
            citationChunkIds: ["chunk-1"],
          },
          {
            title: "Section B",
            keyPoints: ["نکته B"],
            citationChunkIds: ["chunk-2"],
          },
          {
            title: "Section C",
            keyPoints: ["نکته C"],
            citationChunkIds: ["chunk-3"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      };

      const grounded = validateAndGroundReviewSummaryCitations(payload, availableChunks);
      expect(grounded.sections[0].citationChunkIds).toEqual(["chunk-1"]);
      expect(grounded.sections[1].citationChunkIds).toEqual(["chunk-2"]);
      expect(grounded.sections[2].citationChunkIds).toEqual(["chunk-3"]);
      expect(grounded.citationChunkIds).toEqual(["chunk-1", "chunk-2", "chunk-3"]);
    });

    it("F. No fallback-to-all-chunks: section citing chunk-1 does not receive all chunks", () => {
      const allFiveChunks = ["chunk-1", "chunk-2", "chunk-3", "chunk-4", "chunk-5"];
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه معتبر",
        estimatedReadingMinutes: 10,
        overview: "توضیح کلی",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-1"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: [],
      };

      const grounded = validateAndGroundReviewSummaryCitations(payload, allFiveChunks);
      expect(grounded.sections[0].citationChunkIds).toEqual(["chunk-1"]);
      expect(grounded.citationChunkIds).toEqual(["chunk-1"]);
      expect(grounded.citationChunkIds).not.toEqual(allFiveChunks);
    });

    it("G. Unknown top-level citation fails explicitly", () => {
      const payload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه معتبر",
        estimatedReadingMinutes: 10,
        overview: "توضیح کلی",
        sections: [
          {
            title: "بخش ۱",
            keyPoints: ["نکته ۱"],
            citationChunkIds: ["chunk-1"],
          },
        ],
        finalTakeaways: ["جمع‌بندی"],
        citationChunkIds: ["unknown-chunk"],
      };

      expect(() => validateAndGroundReviewSummaryCitations(payload, availableChunks)).toThrow(
        "STAGE5_INVALID_CHUNK_REFERENCE",
      );
    });
  });

  describe("Review Summary Consolidation (Presentation Merge Engine)", () => {
    it("cleans generator prefix numbers and section markers", () => {
      expect(cleanReviewSectionTitle("بخش ۱: مهارکننده‌های ACE")).toBe("مهارکننده‌های ACE");
      expect(cleanReviewSectionTitle("فصل ۲ - بتا بلاکرها")).toBe("بتا بلاکرها");
      expect(cleanReviewSectionTitle("جلسه ۳: دیورتیک‌ها")).toBe("دیورتیک‌ها");
      expect(cleanReviewSectionTitle("1. مهارکننده کانال کلسیم")).toBe("مهارکننده کانال کلسیم");
      expect(cleanReviewSectionTitle("۲- آریتمی قلبی")).toBe("آریتمی قلبی");
      expect(cleanReviewSectionTitle("Section 4: Pharmacology")).toBe("Pharmacology");
      expect(cleanReviewSectionTitle("فارماکولوژی قلب (بخش ۱)")).toBe("فارماکولوژی قلب");
    });

    it("Requirement 7: consolidates Section A (pts 1, 2) + Section B (pts 3, 4) + Section C (pt 5) with shared session into 1 unified topic with all 5 points in exact order", () => {
      const fragmentedSections: ReviewSummarySection[] = [
        {
          title: "بخش ۱: مهارکننده‌های آنزیم مبدل آنژیوتانسین (ACEIs) - مقدمه",
          keyPoints: ["نکته ۱: کاپتوپریل و انالاپریل", "نکته ۲: مهار سنتز آنژیوتانسین ۲"],
          mechanisms: ["مکانیسم ۱: کاهش مقاومت عروقی"],
          relatedSessionIds: ["session-cardio-1"],
        },
        {
          title: "بخش ۲: مهارکننده‌های ACE - عوارض و تداخلات",
          keyPoints: ["نکته ۳: سرفه خشک به علت تجمع برادی‌کینین", "نکته ۴: افزایش خطر هیپرکالمی"],
          classifications: ["طبقه‌بندی: مهارکننده‌های سیستم رنین-آنژیوتانسین"],
          memorizationPoints: ["کنترااندیکاسیون: بارداری"],
          relatedSessionIds: ["session-cardio-1"],
        },
        {
          title: "بخش ۳: مهارکننده‌های ACE - نکات آزمونی",
          keyPoints: ["نکته ۵: عدم مصرف همزمان با مکمل پتاسیم"],
          examPoints: ["نکته طلایی تست: پایش کراتینین سرم در شروع درمان"],
          relatedSessionIds: ["session-cardio-1"],
        },
      ];

      const consolidated = consolidateReviewSummarySections(fragmentedSections);

      // Must result in exactly ONE cohesive topic section
      expect(consolidated).toHaveLength(1);

      const unified = consolidated[0];
      // All 5 key points preserved in strict sequence
      expect(unified.keyPoints).toEqual([
        "نکته ۱: کاپتوپریل و انالاپریل",
        "نکته ۲: مهار سنتز آنژیوتانسین ۲",
        "نکته ۳: سرفه خشک به علت تجمع برادی‌کینین",
        "نکته ۴: افزایش خطر هیپرکالمی",
        "نکته ۵: عدم مصرف همزمان با مکمل پتاسیم",
      ]);

      // Mechanisms, classifications, memorization, exam points preserved
      expect(unified.mechanisms).toEqual(["مکانیسم ۱: کاهش مقاومت عروقی"]);
      expect(unified.classifications).toEqual(["طبقه‌بندی: مهارکننده‌های سیستم رنین-آنژیوتانسین"]);
      expect(unified.memorizationPoints).toEqual(["کنترااندیکاسیون: بارداری"]);
      expect(unified.examPoints).toEqual(["نکته طلایی تست: پایش کراتینین سرم در شروع درمان"]);
      expect(unified.originalSectionTitles).toHaveLength(3);
    });

    it("Requirement 7: ensures two truly independent topics with different sessions are NOT falsely merged (Anti-Overmerging)", () => {
      const independentSections: ReviewSummarySection[] = [
        {
          title: "فارماکولوژی سیستم قلبی عروقی",
          keyPoints: ["مطلب قلبی ۱", "مطلب قلبی ۲"],
          relatedSessionIds: ["session-cardio"],
        },
        {
          title: "آنتی‌بیوتیک‌های مهارکننده دیواره سلولی",
          keyPoints: ["مطلب آنتی‌بیوتیک ۱", "مطلب آنتی‌بیوتیک ۲"],
          relatedSessionIds: ["session-microbiology"],
        },
      ];

      const consolidated = consolidateReviewSummarySections(independentSections);

      // Must remain 2 separate distinct topic groups
      expect(consolidated).toHaveLength(2);
      expect(consolidated[0].title).toBe("فارماکولوژی سیستم قلبی عروقی");
      expect(consolidated[0].keyPoints).toEqual(["مطلب قلبی ۱", "مطلب قلبی ۲"]);
      expect(consolidated[1].title).toBe("آنتی‌بیوتیک‌های مهارکننده دیواره سلولی");
      expect(consolidated[1].keyPoints).toEqual(["مطلب آنتی‌بیوتیک ۱", "مطلب آنتی‌بیوتیک ۲"]);
    });

    it("merges sections sharing an explicit root topic prefix even without session IDs", () => {
      const prefixSections: ReviewSummarySection[] = [
        {
          title: "مهارکننده‌های کانال کلسیم: دی‌هیدروپیریدین‌ها (آملودیپین)",
          keyPoints: ["نکته آملودیپین"],
        },
        {
          title: "مهارکننده‌های کانال کلسیم: غیر دی‌هیدروپیریدین‌ها (وراپامیل و دیلتیازم)",
          keyPoints: ["نکته وراپامیل"],
        },
      ];

      const consolidated = consolidateReviewSummarySections(prefixSections);
      expect(consolidated).toHaveLength(1);
      expect(consolidated[0].title).toBe("مهارکننده‌های کانال کلسیم");
      expect(consolidated[0].keyPoints).toEqual(["نکته آملودیپین", "نکته وراپامیل"]);
    });

    it("Requirement 5: deduplicates only strictly exact duplicate strings and preserves distinct scientific points", () => {
      const sectionsWithDups: ReviewSummarySection[] = [
        {
          title: "بتا بلاکرها - بخش اول",
          keyPoints: ["پروپرانولول غیرانتخابی است.", "متوپرولول بتا ۱ انتخابی است."],
          relatedSessionIds: ["session-beta"],
        },
        {
          title: "بتا بلاکرها - بخش دوم",
          keyPoints: [
            "پروپرانولول غیرانتخابی است.", // Exact duplicate - should be filtered
            "پروپرانولول در بیماران آسم ممنوع است.", // Distinct scientific point - must be preserved!
          ],
          relatedSessionIds: ["session-beta"],
        },
      ];

      const consolidated = consolidateReviewSummarySections(sectionsWithDups);
      expect(consolidated).toHaveLength(1);
      expect(consolidated[0].keyPoints).toEqual([
        "پروپرانولول غیرانتخابی است.",
        "متوپرولول بتا ۱ انتخابی است.",
        "پروپرانولول در بیماران آسم ممنوع است.",
      ]);
    });

    it("handles empty or null inputs gracefully", () => {
      expect(consolidateReviewSummarySections(undefined)).toEqual([]);
      expect(consolidateReviewSummarySections(null)).toEqual([]);
      expect(consolidateReviewSummarySections([])).toEqual([]);
    });
  });

  describe("Flattened Review Summary Categories (Category-First Presentation Architecture)", () => {
    it("aggregates comparisons from 3 distinct sections into a SINGLE unified comparisons category", () => {
      const threeSectionsWithComparisons: ReviewSummarySection[] = [
        {
          title: "بخش ۱: داروهای سمپاتومیمتیک",
          keyPoints: ["نکته ۱"],
          comparisons: [
            {
              conceptA: "اپی‌نفرین",
              conceptB: "نوراپی‌نفرین",
              keyDifferences: "اپی‌نفرین روی گیرنده‌های بتا۲ نیز موثر است ولی نوراپی‌نفرین اثر بتا۲ ناچیزی دارد.",
            },
          ],
        },
        {
          title: "بخش ۲: مسدودکننده‌های بتا",
          keyPoints: ["نکته ۲"],
          comparisons: [
            {
              conceptA: "پروپرانولول",
              conceptB: "متوپرولول",
              keyDifferences: "پروپرانولول غیرانتخابی و متوپرولول بتا ۱ انتخابی است.",
            },
          ],
        },
        {
          title: "بخش ۳: مهارکننده‌های ACE و ARB",
          keyPoints: ["نکته ۳"],
          comparisons: [
            {
              conceptA: "ACEIs",
              conceptB: "ARBs",
              keyDifferences: "ACEIs سرفه خشک ایجاد می‌کنند ولی ARBs این عارضه را ندارند.",
            },
          ],
        },
      ];

      const flattened = flattenReviewSummarySections(threeSectionsWithComparisons);

      // Comparisons should be aggregated into exactly 1 list with all 3 comparisons in order
      expect(flattened.comparisons).toHaveLength(3);
      expect((flattened.comparisons[0] as ReviewSummaryComparison).conceptA).toBe("اپی‌نفرین");
      expect((flattened.comparisons[1] as ReviewSummaryComparison).conceptA).toBe("پروپرانولول");
      expect((flattened.comparisons[2] as ReviewSummaryComparison).conceptA).toBe("ACEIs");

      // Key points aggregated in sequential order
      expect(flattened.keyPoints).toEqual(["نکته ۱", "نکته ۲", "نکته ۳"]);
    });

    it("aggregates keyPoints, mechanisms, classifications, memorizationPoints and examPoints into unified single categories", () => {
      const sections: ReviewSummarySection[] = [
        {
          title: "بخش الف",
          keyPoints: ["نکته الف ۱", "نکته الف ۲"],
          mechanisms: ["مکانیسم ۱"],
          classifications: ["دسته ۱"],
          memorizationPoints: ["حفظی ۱"],
          examPoints: ["آزمونی ۱"],
        },
        {
          title: "بخش ب",
          keyPoints: ["نکته ب ۱"],
          mechanisms: ["مکانیسم ۲"],
          classifications: ["دسته ۲"],
          memorizationPoints: ["حفظی ۲"],
          examPoints: ["آزمونی ۲"],
        },
      ];

      const flattened = flattenReviewSummarySections(sections);

      expect(flattened.keyPoints).toEqual(["نکته الف ۱", "نکته الف ۲", "نکته ب ۱"]);
      expect(flattened.mechanisms).toEqual(["مکانیسم ۱", "مکانیسم ۲"]);
      expect(flattened.classifications).toEqual(["دسته ۱", "دسته ۲"]);
      expect(flattened.memorizationPoints).toEqual(["حفظی ۱", "حفظی ۲"]);
      expect(flattened.examPoints).toEqual(["آزمونی ۱", "آزمونی ۲"]);
    });

    it("returns empty arrays for categories with no items across all sections", () => {
      const simpleSections: ReviewSummarySection[] = [
        {
          title: "بخش ساده",
          keyPoints: ["فقط نکته کلیدی"],
        },
      ];

      const flattened = flattenReviewSummarySections(simpleSections);

      expect(flattened.keyPoints).toEqual(["فقط نکته کلیدی"]);
      expect(flattened.mechanisms).toEqual([]);
      expect(flattened.classifications).toEqual([]);
      expect(flattened.comparisons).toEqual([]);
      expect(flattened.memorizationPoints).toEqual([]);
      expect(flattened.examPoints).toEqual([]);
    });

    it("handles exact duplicate string removal across flattened sections while preserving distinct points", () => {
      const sectionsWithDups: ReviewSummarySection[] = [
        {
          title: "بخش ۱",
          keyPoints: ["نکته یکسان", "نکته مجزا ۱"],
        },
        {
          title: "بخش ۲",
          keyPoints: ["نکته یکسان", "نکته مجزا ۲"],
        },
      ];

      const flattened = flattenReviewSummarySections(sectionsWithDups);
      expect(flattened.keyPoints).toEqual(["نکته یکسان", "نکته مجزا ۱", "نکته مجزا ۲"]);
    });
  });

  describe("isLessonChunkSetCurrent & isContentPlanChunkSetCurrent Invariant Checkers", () => {
    it("returns true when lesson citations match current document chunk set", () => {
      const lessonPayload = {
        kind: "lesson",
        title: "درس فارماکولوژی",
        sessions: [
          {
            title: "جلسه ۱",
            contentMarkdown: "محتوا",
            citationChunkIds: ["chunk-1", "chunk-2"],
          },
        ],
        citationChunkIds: ["chunk-1", "chunk-2"],
      };

      expect(isLessonChunkSetCurrent(lessonPayload, new Set(["chunk-1", "chunk-2", "chunk-3"]))).toBe(true);
      expect(isLessonChunkSetCurrent(lessonPayload, ["chunk-1", "chunk-2"])).toBe(true);
    });

    it("returns false when any session or lesson citation references unknown/stale chunk", () => {
      const lessonPayload = {
        kind: "lesson",
        title: "درس فارماکولوژی",
        sessions: [
          {
            title: "جلسه ۱",
            contentMarkdown: "محتوا",
            citationChunkIds: ["chunk-1", "stale-chunk"],
          },
        ],
        citationChunkIds: ["chunk-1"],
      };

      expect(isLessonChunkSetCurrent(lessonPayload, new Set(["chunk-1", "chunk-2"]))).toBe(false);
    });

    it("returns false for empty or malformed lesson payloads", () => {
      expect(isLessonChunkSetCurrent(null, new Set(["chunk-1"]))).toBe(false);
      expect(isLessonChunkSetCurrent({}, new Set(["chunk-1"]))).toBe(false);
      expect(isLessonChunkSetCurrent({ sessions: [] }, new Set(["chunk-1"]))).toBe(false);
    });

    it("returns true when contentPlan sessions match current chunk set", () => {
      const contentPlan = {
        moduleTitle: "فارماکولوژی",
        sourceTopics: [
          {
            id: "t1",
            title: "مبحث ۱",
            relevantChunkIds: ["chunk-1"],
          },
        ],
        sessions: [
          {
            index: 0,
            title: "جلسه ۱",
            relevantChunkIds: ["chunk-1", "chunk-2"],
          },
        ],
      };

      expect(isContentPlanChunkSetCurrent(contentPlan, new Set(["chunk-1", "chunk-2"]))).toBe(true);
    });

    it("returns false when contentPlan references stale chunk", () => {
      const contentPlan = {
        moduleTitle: "فارماکولوژی",
        sessions: [
          {
            index: 0,
            title: "جلسه ۱",
            relevantChunkIds: ["chunk-1", "stale-chunk"],
          },
        ],
      };

      expect(isContentPlanChunkSetCurrent(contentPlan, new Set(["chunk-1", "chunk-2"]))).toBe(false);
    });
  });
});
