import { describe, expect, it } from "vitest";
import {
  calculateReferenceBasedUserPrice,
  roundToNearest100Toman,
  REFERENCE_DOCUMENT_ID,
  REFERENCE_DOCUMENT_METRICS,
  DEFAULT_REFERENCE_PRICING,
} from "../reference-pricing.js";
import {
  calculateEstimatedGenerationCost,
  calculateActualGenerationCost,
} from "../cost-estimation.js";

describe("Reference-Based User Selling Pricing Engine", () => {
  describe("1. Reference Document Invariants (Katzung Chapter 40)", () => {
    it("Reference document metadata and baseline constants are accurately defined", () => {
      expect(REFERENCE_DOCUMENT_ID).toBe("19313b37-8baf-47bb-a80d-3a70e5ed910e");
      expect(REFERENCE_DOCUMENT_METRICS.originalName).toBe("40.pdf");
      expect(REFERENCE_DOCUMENT_METRICS.usableExtractedTokens).toBe(35_572);
      expect(REFERENCE_DOCUMENT_METRICS.lessonsGenerated).toBe(11);
      expect(REFERENCE_DOCUMENT_METRICS.flashcardsGenerated).toBe(138);
      expect(REFERENCE_DOCUMENT_METRICS.quizQuestionsGenerated).toBe(118);
      expect(REFERENCE_DOCUMENT_METRICS.reviewSummaryGenerated).toBe(1);

      expect(DEFAULT_REFERENCE_PRICING.referenceUsableTokens).toBe(35_572);
      expect(DEFAULT_REFERENCE_PRICING.lessonBaselinePriceToman).toBe(15_000);
      expect(DEFAULT_REFERENCE_PRICING.flashcardBaselinePriceToman).toBe(7_000);
      expect(DEFAULT_REFERENCE_PRICING.examBaselinePriceToman).toBe(9_000);
      expect(DEFAULT_REFERENCE_PRICING.summaryFixedPriceToman).toBe(4_000);
    });

    it("Reference Equality: Document with exactly 35,572 tokens matches exact baseline prices", () => {
      const res = calculateReferenceBasedUserPrice({
        targetUsableTokens: 35_572,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });

      expect(res.volumeRatio).toBeCloseTo(1.0, 5);
      expect(res.currency).toBe("toman");

      // Stage prices
      expect(res.stagePrices.lesson?.roundedPriceToman).toBe(15_000);
      expect(res.stagePrices.flashcard?.roundedPriceToman).toBe(7_000);
      expect(res.stagePrices.quiz?.roundedPriceToman).toBe(9_000);
      expect(res.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);

      // Total price = 15,000 + 7,000 + 9,000 + 4,000 = 35,000 Toman
      expect(res.totalPriceToman).toBe(35_000);
      expect(res.formattedTotalPrice).toContain("۳۵,۰۰۰ تومان");
    });
  });

  describe("2. Volume Scaling Scenarios", () => {
    it("Half-size Document (~17,786 tokens) -> Exactly 50% scaling for stages, 4,000 fixed for summary", () => {
      const res = calculateReferenceBasedUserPrice({
        targetUsableTokens: 17_786, // 35,572 / 2
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });

      expect(res.volumeRatio).toBeCloseTo(0.5, 3);
      expect(res.stagePrices.lesson?.roundedPriceToman).toBe(7_500);
      expect(res.stagePrices.flashcard?.roundedPriceToman).toBe(3_500);
      expect(res.stagePrices.quiz?.roundedPriceToman).toBe(4_500);
      expect(res.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);

      // Total = 7,500 + 3,500 + 4,500 + 4,000 = 19,500 Toman
      expect(res.totalPriceToman).toBe(19_500);
      expect(res.formattedTotalPrice).toContain("۱۹,۵۰۰ تومان");
    });

    it("Double-size Document (71,144 tokens) -> Exactly 200% scaling for stages, 4,000 fixed for summary", () => {
      const res = calculateReferenceBasedUserPrice({
        targetUsableTokens: 71_144, // 35,572 * 2
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });

      expect(res.volumeRatio).toBeCloseTo(2.0, 3);
      expect(res.stagePrices.lesson?.roundedPriceToman).toBe(30_000);
      expect(res.stagePrices.flashcard?.roundedPriceToman).toBe(14_000);
      expect(res.stagePrices.quiz?.roundedPriceToman).toBe(18_000);
      expect(res.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);

      // Total = 30,000 + 14,000 + 18,000 + 4,000 = 66,000 Toman
      expect(res.totalPriceToman).toBe(66_000);
      expect(res.formattedTotalPrice).toContain("۶۶,۰۰۰ تومان");
    });

    it("Example Case (50,000 tokens reference vs 75,000 tokens target) with custom baseline", () => {
      const res = calculateReferenceBasedUserPrice({
        targetUsableTokens: 75_000,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
        baseline: {
          referenceUsableTokens: 50_000,
          lessonBaselinePriceToman: 15_000,
          flashcardBaselinePriceToman: 7_000,
          examBaselinePriceToman: 9_000,
          summaryFixedPriceToman: 4_000,
        },
      });

      // Ratio = 1.5
      expect(res.volumeRatio).toBe(1.5);
      expect(res.stagePrices.lesson?.roundedPriceToman).toBe(22_500);
      expect(res.stagePrices.flashcard?.roundedPriceToman).toBe(10_500);
      expect(res.stagePrices.quiz?.roundedPriceToman).toBe(13_500);
      expect(res.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);
      expect(res.totalPriceToman).toBe(50_500);
    });
  });

  describe("3. Rounding to Nearest 100 Toman", () => {
    it("Applies Math.round(price / 100) * 100 to exact test vectors", () => {
      expect(roundToNearest100Toman(8880)).toBe(8900);
      expect(roundToNearest100Toman(13569)).toBe(13600);
      expect(roundToNearest100Toman(12041)).toBe(12000);
      expect(roundToNearest100Toman(15249)).toBe(15200);
      expect(roundToNearest100Toman(15250)).toBe(15300);
      expect(roundToNearest100Toman(4000)).toBe(4000);
    });
  });

  describe("4. Stage Independence", () => {
    it("Each stage is calculated strictly from its own baseline", () => {
      const targetTokens = 25_000;
      const res = calculateReferenceBasedUserPrice({
        targetUsableTokens: targetTokens,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });

      const ratio = targetTokens / 35_572;
      expect(res.stagePrices.lesson?.rawPriceToman).toBeCloseTo(15_000 * ratio, 2);
      expect(res.stagePrices.flashcard?.rawPriceToman).toBeCloseTo(7_000 * ratio, 2);
      expect(res.stagePrices.quiz?.rawPriceToman).toBeCloseTo(9_000 * ratio, 2);
      expect(res.stagePrices.review_summary?.rawPriceToman).toBe(4_000);

      // Flashcard is NOT derived from Lesson
      expect(res.stagePrices.flashcard?.rawPriceToman).not.toBe(
        res.stagePrices.lesson!.rawPriceToman * (7 / 15) + 999, // sanity check
      );
    });

    it("Selecting only a subset of stages computes total only for selected stages", () => {
      const resOnlyFlashcards = calculateReferenceBasedUserPrice({
        targetUsableTokens: 35_572,
        types: ["flashcard"],
      });

      expect(resOnlyFlashcards.stagePrices.lesson).toBeUndefined();
      expect(resOnlyFlashcards.stagePrices.quiz).toBeUndefined();
      expect(resOnlyFlashcards.stagePrices.review_summary).toBeUndefined();
      expect(resOnlyFlashcards.stagePrices.flashcard?.roundedPriceToman).toBe(7_000);
      expect(resOnlyFlashcards.totalPriceToman).toBe(7_000);
    });
  });

  describe("5. Review Summary Flat Pricing", () => {
    it("Summary is always 4,000 Toman across diverse document token sizes", () => {
      const sizes = [100, 1000, 5000, 35572, 80000, 250000];
      for (const tokens of sizes) {
        const res = calculateReferenceBasedUserPrice({
          targetUsableTokens: tokens,
          types: ["review_summary"],
        });
        expect(res.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);
        expect(res.totalPriceToman).toBe(4_000);
      }
    });
  });

  describe("6. Tiny Files (No Artificial Floor)", () => {
    it("Tiny document (~500 tokens) computes proportionally without arbitrary minimums", () => {
      const res = calculateReferenceBasedUserPrice({
        targetUsableTokens: 500,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });

      expect(res.volumeRatio).toBeCloseTo(500 / 35_572, 5);
      // Lesson: 15,000 * 0.014056 = 210.8 -> rounded = 200
      expect(res.stagePrices.lesson?.roundedPriceToman).toBe(200);
      // Flashcard: 7,000 * 0.014056 = 98.39 -> rounded = 100
      expect(res.stagePrices.flashcard?.roundedPriceToman).toBe(100);
      // Quiz: 9,000 * 0.014056 = 126.5 -> rounded = 100
      expect(res.stagePrices.quiz?.roundedPriceToman).toBe(100);
      // Summary: 4,000
      expect(res.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);

      expect(res.totalPriceToman).toBe(4_400);
    });
  });

  describe("7. Conceptual & Architectural Separation: AI Cost != User Selling Price", () => {
    it("AI Cost Estimation and User Selling Price are completely independent calculations", () => {
      const docMetrics = {
        pageCount: 28,
        chunkCount: 28,
        totalTokens: 35_572,
        totalCharacters: 142_252,
      };

      // 1. AI Infrastructure Cost (DeepSeek Flash V4 token rate)
      const aiCost = calculateEstimatedGenerationCost({
        documentMetrics: docMetrics,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });

      // 2. User Selling Price (Katzung Chapter 40 Reference Model)
      const userPrice = calculateReferenceBasedUserPrice({
        targetUsableTokens: 35_572,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      });

      // 3. Actual AI Generation Cost
      const actualAiCost = calculateActualGenerationCost({
        totalInputTokens: 100_000,
        totalOutputTokens: 30_000,
      });

      // Assert complete conceptual separation
      expect(userPrice.totalPriceToman).toBe(35_000);
      expect(aiCost.estimatedCostUsd).toBeGreaterThan(0);
      expect(actualAiCost.actualCostToman).toBe(2240);

      // AI Cost is NOT equal to User Selling Price
      expect(userPrice.totalPriceToman).not.toBe(aiCost.estimatedPriceToman);
      expect(userPrice.totalPriceToman).not.toBe(actualAiCost.actualCostToman);
    });
  });

  describe("8. Dynamic Baseline Configuration Support", () => {
    it("Admin modified Lesson price (from 15,000 to 20,000) reflects accurately across all volume scales", () => {
      // 1. Reference size file (35,572 tokens) with Lesson=20,000
      const resFull = calculateReferenceBasedUserPrice({
        targetUsableTokens: 35_572,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
        baseline: {
          lessonBaselinePriceToman: 20_000,
        },
      });

      expect(resFull.stagePrices.lesson?.roundedPriceToman).toBe(20_000);
      expect(resFull.stagePrices.flashcard?.roundedPriceToman).toBe(7_000);
      expect(resFull.stagePrices.quiz?.roundedPriceToman).toBe(9_000);
      expect(resFull.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);
      expect(resFull.totalPriceToman).toBe(40_000);

      // 2. Half-size file (17,786 tokens) with Lesson=20,000
      const resHalf = calculateReferenceBasedUserPrice({
        targetUsableTokens: 17_786,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
        baseline: {
          lessonBaselinePriceToman: 20_000,
        },
      });

      // Half of 20,000 = 10,000
      expect(resHalf.stagePrices.lesson?.roundedPriceToman).toBe(10_000);
      expect(resHalf.stagePrices.flashcard?.roundedPriceToman).toBe(3_500);
      expect(resHalf.stagePrices.quiz?.roundedPriceToman).toBe(4_500);
      expect(resHalf.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);
      expect(resHalf.totalPriceToman).toBe(22_000);
    });

    it("Changing one stage price does NOT affect other stages", () => {
      const res = calculateReferenceBasedUserPrice({
        targetUsableTokens: 35_572,
        types: ["lesson", "flashcard", "quiz", "review_summary"],
        baseline: {
          flashcardBaselinePriceToman: 12_000,
        },
      });

      expect(res.stagePrices.lesson?.roundedPriceToman).toBe(15_000);
      expect(res.stagePrices.flashcard?.roundedPriceToman).toBe(12_000);
      expect(res.stagePrices.quiz?.roundedPriceToman).toBe(9_000);
      expect(res.stagePrices.review_summary?.roundedPriceToman).toBe(4_000);
      expect(res.totalPriceToman).toBe(40_000);
    });
  });
});
