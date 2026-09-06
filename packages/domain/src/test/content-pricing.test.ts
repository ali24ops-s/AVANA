import { describe, it, expect } from "vitest";
import {
  CONTENT_PRICING_DEFAULTS,
  calculateDefaultContentPrice,
  calculateContentPricingBreakdown,
  isCompleteReviewSummary,
} from "../commerce.js";

describe("Content Default Suggested Pricing Domain Formula", () => {
  it("has correct central constants", () => {
    expect(CONTENT_PRICING_DEFAULTS.lessonBase).toBe(1000);
    expect(CONTENT_PRICING_DEFAULTS.flashcardPer100).toBe(500);
    expect(CONTENT_PRICING_DEFAULTS.questionPer100).toBe(300);
    expect(CONTENT_PRICING_DEFAULTS.reviewSummary).toBe(2000);
  });

  // Mandatory Unit Test 1
  it("Case 1: 0 flashcard / 0 question / no summary -> 1,000", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 0,
      questionCount: 0,
      hasReviewSummary: false,
    });
    expect(price).toBe(1000);
  });

  // Mandatory Unit Test 2
  it("Case 2: 1 flashcard / 1 question / summary -> 3,800", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 1,
      questionCount: 1,
      hasReviewSummary: true,
    });
    expect(price).toBe(3800);
  });

  // Mandatory Unit Test 3
  it("Case 3: 100 flashcard / 100 question / summary -> 3,800", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 100,
      questionCount: 100,
      hasReviewSummary: true,
    });
    expect(price).toBe(3800);
  });

  // Mandatory Unit Test 4
  it("Case 4: 101 flashcard / 101 question / summary -> 4,600", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 101,
      questionCount: 101,
      hasReviewSummary: true,
    });
    expect(price).toBe(4600);
  });

  // Mandatory Unit Test 5
  it("Case 5: 200 flashcard / 200 question / no summary -> 2,600", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 200,
      questionCount: 200,
      hasReviewSummary: false,
    });
    expect(price).toBe(2600);
  });

  // Example 2 from prompt (180 flashcards, 230 questions, summary -> 4,900)
  it("Example 2: 180 flashcards / 230 questions / summary -> 4,900", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 180,
      questionCount: 230,
      hasReviewSummary: true,
    });
    expect(price).toBe(4900);
  });

  // Integration Test case (150 flashcards, 220 questions, summary -> 4,900)
  it("Integration Spec: 150 flashcards / 220 questions / summary -> 4,900", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 150,
      questionCount: 220,
      hasReviewSummary: true,
    });
    expect(price).toBe(4900);
  });

  // Ceil boundary tests
  it("evaluates 201 flashcard / 201 question / summary -> 5,400 (ceil tier 3)", () => {
    const price = calculateDefaultContentPrice({
      flashcardCount: 201,
      questionCount: 201,
      hasReviewSummary: true,
    });
    expect(price).toBe(5400);
  });

  it("returns detailed pricing breakdown matching formula components", () => {
    const breakdown = calculateContentPricingBreakdown({
      lessonCount: 1,
      flashcardCount: 150,
      questionCount: 220,
      hasReviewSummary: true,
    });

    expect(breakdown).toEqual({
      lessonBasePrice: 1000,
      flashcardPrice: 1000,
      questionPrice: 900,
      reviewSummaryPrice: 2000,
      totalSuggestedPrice: 4900,
      lessonCount: 1,
      flashcardCount: 150,
      questionCount: 220,
      hasReviewSummary: true,
    });
  });

  it("handles multiple lessons correctly", () => {
    const price = calculateDefaultContentPrice({
      lessonCount: 3,
      flashcardCount: 50,
      questionCount: 50,
      hasReviewSummary: true,
    });
    // 3*1000 + 500 + 300 + 2000 = 5800
    expect(price).toBe(5800);
  });

  it("handles 0 counts gracefully without undefined or negative values", () => {
    const price = calculateDefaultContentPrice({});
    expect(price).toBe(1000);
  });

  describe("isCompleteReviewSummary", () => {
    it("returns true for a complete, canonical review summary payload", () => {
      const validPayload = {
        kind: "review_summary",
        title: "خلاصه فارماکولوژی",
        overview: "بررسی جامع داروهای آنتی‌بیوتیک و مکانیسم‌های اثر",
        sections: [
          {
            title: "بخش ۱: پنی‌سیلین‌ها",
            keyPoints: ["مهار سنتز دیواره سلولی با اتصال به PBP"],
          },
        ],
        finalTakeaways: ["نکات جمع‌بندی"],
        citationChunkIds: ["chunk-1"],
      };

      expect(isCompleteReviewSummary(validPayload)).toBe(true);
    });

    it("returns false for incomplete payloads (empty overview, no sections, empty keyPoints)", () => {
      expect(isCompleteReviewSummary(null)).toBe(false);
      expect(isCompleteReviewSummary({})).toBe(false);
      expect(isCompleteReviewSummary({ kind: "lesson" })).toBe(false);

      // Empty overview
      expect(
        isCompleteReviewSummary({
          kind: "review_summary",
          title: "Title",
          overview: "   ",
          sections: [{ title: "S1", keyPoints: ["Point 1"] }],
        }),
      ).toBe(false);

      // Empty sections array
      expect(
        isCompleteReviewSummary({
          kind: "review_summary",
          title: "Title",
          overview: "Valid overview",
          sections: [],
        }),
      ).toBe(false);

      // Section missing keyPoints
      expect(
        isCompleteReviewSummary({
          kind: "review_summary",
          title: "Title",
          overview: "Valid overview",
          sections: [{ title: "S1", keyPoints: [] }],
        }),
      ).toBe(false);

      // Section keyPoints with only empty strings
      expect(
        isCompleteReviewSummary({
          kind: "review_summary",
          title: "Title",
          overview: "Valid overview",
          sections: [{ title: "S1", keyPoints: ["", "  "] }],
        }),
      ).toBe(false);
    });
  });
});
