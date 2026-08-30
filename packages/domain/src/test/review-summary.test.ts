import { describe, expect, it } from "vitest";
import {
  getReviewSummaryConfig,
  type ReviewSummaryPayload,
  type ReviewSummarySection,
  type ReviewSummaryComparison,
  isGenerationTypeEnabled,
  ALL_GENERATION_TYPES,
  ENABLED_GENERATION_TYPES,
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
});
