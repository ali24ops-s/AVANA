import { describe, expect, it } from "vitest";
import {
  calculateEstimatedGenerationCost,
  calculateActualGenerationCost,
  DEFAULT_MODEL_PRICING,
} from "../cost-estimation.js";

describe("Deterministic Cost Estimation (Pre-Generation Estimator)", () => {
  it("Scenario 1: Small document (2 pages, 2 chunks, 600 tokens) -> Realistic estimation and rounding", () => {
    const res = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: 2,
        chunkCount: 2,
        totalTokens: 600,
        totalCharacters: 2400,
      },
      types: ["lesson", "flashcard", "quiz", "review_summary"],
    });

    expect(res.currency).toBe("toman");
    expect(res.estimatedPriceToman).toBeGreaterThanOrEqual(500);
    // Price is rounded to multiple of 500
    expect(res.estimatedPriceToman % 500).toBe(0);
    expect(res.formattedPrice).toContain("تومان");
    expect(res.disclaimer).toBe("هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.");

    // Check that breakdown contains planning and selected stages
    expect(res.breakdown.planning).toBeDefined();
    expect(res.breakdown.lesson).toBeDefined();
    expect(res.breakdown.flashcard).toBeDefined();
    expect(res.breakdown.quiz).toBeDefined();
    expect(res.breakdown.review_summary).toBeDefined();

    expect(res.estimatedInputTokens).toBeGreaterThan(600);
    expect(res.estimatedOutputTokens).toBeGreaterThan(500);
  });

  it("Scenario 2: Medium document (~18 pages, 18 chunks, 12,000 tokens) -> Proportional scaling", () => {
    const res = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: 18,
        chunkCount: 18,
        totalTokens: 12000,
      },
      types: ["lesson", "flashcard", "quiz"],
    });

    expect(res.breakdown.planning.inputTokens).toBe(800 + 12000);
    expect(res.breakdown.lesson).toBeDefined();
    expect(res.breakdown.flashcard).toBeDefined();
    expect(res.breakdown.quiz).toBeDefined();
    expect(res.breakdown.review_summary).toBeUndefined();

    expect(res.estimatedPriceToman).toBeGreaterThanOrEqual(1000);
    expect(res.estimatedPriceToman % 500).toBe(0);
  });

  it("Scenario 3: Selective generation (e.g. only flashcards and quiz) does not charge for lessons or summary", () => {
    const fullRes = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: 10,
        chunkCount: 10,
        totalTokens: 5000,
      },
      types: ["lesson", "flashcard", "quiz", "review_summary"],
    });

    const selectiveRes = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: 10,
        chunkCount: 10,
        totalTokens: 5000,
      },
      types: ["flashcard", "quiz"],
    });

    expect(selectiveRes.breakdown.lesson).toBeUndefined();
    expect(selectiveRes.breakdown.review_summary).toBeUndefined();
    expect(selectiveRes.breakdown.flashcard).toBeDefined();
    expect(selectiveRes.breakdown.quiz).toBeDefined();

    expect(selectiveRes.estimatedCostUsd).toBeLessThan(fullRes.estimatedCostUsd);
    expect(selectiveRes.estimatedPriceToman).toBeLessThanOrEqual(fullRes.estimatedPriceToman);
  });

  it("Scenario 4: Custom pricing configuration override", () => {
    const standardRes = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: 50,
        chunkCount: 50,
        totalTokens: 30000,
      },
      types: ["lesson", "flashcard", "quiz", "review_summary"],
      pricing: DEFAULT_MODEL_PRICING,
    });

    const doubleRateRes = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: 50,
        chunkCount: 50,
        totalTokens: 30000,
      },
      types: ["lesson", "flashcard", "quiz", "review_summary"],
      pricing: {
        ...DEFAULT_MODEL_PRICING,
        usdToTomanRate: 200_000,
      },
    });

    expect(doubleRateRes.estimatedCostUsd).toBe(standardRes.estimatedCostUsd);
    expect(doubleRateRes.estimatedCostTomanRaw).toBeCloseTo(
      standardRes.estimatedCostTomanRaw * 2,
      2,
    );
    expect(doubleRateRes.estimatedPriceToman).toBeGreaterThanOrEqual(
      standardRes.estimatedPriceToman * 1.5,
    );
  });

  it("Scenario 5: Persian digit formatting in formattedPrice", () => {
    const res = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: 10,
        chunkCount: 10,
        totalTokens: 5000,
      },
      types: ["lesson"],
    });

    // Contains Persian numerals (۰-۹) and comma separator (٬)
    expect(res.formattedPrice).toMatch(/[۰-۹]+٬?[۰-۹]* تومان/);
    expect(res.formattedPrice).not.toMatch(/[0-9]/);
  });

  describe("Actual Cost Calculation & Invariant (Actual vs Estimated)", () => {
    it("Calculates exact actual cost: Actual Cost = (Σ Input Tokens × Input Price) + (Σ Output Tokens × Output Price)", () => {
      const actualRes = calculateActualGenerationCost({
        totalInputTokens: 100_000,
        totalOutputTokens: 30_000,
      });

      // 100,000 * 0.14 / 1,000,000 = $0.0140
      // 30,000 * 0.28 / 1,000,000 = $0.0084
      // Total USD = $0.0224
      // Total Toman = 0.0224 * 100,000 = 2,240 Toman
      expect(actualRes.actualCostUsd).toBeCloseTo(0.0224, 6);
      expect(actualRes.actualCostTomanRaw).toBeCloseTo(2240, 2);
      expect(actualRes.actualCostToman).toBe(2240);
      expect(actualRes.formattedActualPrice).toContain("۲,۲۴۰ تومان");
    });

    it("Invariant: Comparing Estimated Cost vs Actual Cost produces valid delta and ratio", () => {
      const estimated = calculateEstimatedGenerationCost({
        documentMetrics: {
          pageCount: 15,
          chunkCount: 15,
          totalTokens: 8000,
        },
        types: ["lesson", "flashcard", "quiz"],
      });

      // Assume actual usage tracked from DB / pipeline
      const actual = calculateActualGenerationCost({
        totalInputTokens: Math.round(estimated.estimatedInputTokens * 0.95),
        totalOutputTokens: Math.round(estimated.estimatedOutputTokens * 1.05),
      });

      expect(actual.totalTokens).toBeGreaterThan(0);
      expect(actual.actualCostUsd).toBeGreaterThan(0);
      expect(actual.actualCostToman).toBeGreaterThan(0);

      const deltaUsd = Math.abs(estimated.estimatedCostUsd - actual.actualCostUsd);
      expect(deltaUsd).toBeLessThan(0.05); // within 5 cents
    });
  });
});
