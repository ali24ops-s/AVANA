/**
 * Deterministic Cost Estimation for AI Content Generation (Pre-Generation Estimator).
 *
 * Models the real generation pipeline:
 * - Stage 1: Content Planning (Topic decomposition & coverage analysis)
 * - Stage 2: Batched Educational Lessons (Batch size = 3)
 * - Stage 3: Batched Atomic Flashcards (Batch size = 3)
 * - Stage 4: Batched Multiple-Choice Quizzes (Batch size = 3)
 * - Stage 5: High-Density Review Summary (1 call)
 *
 * Operates 100% deterministically in-memory without calling external AI providers.
 */

import type { GeneratedContentType } from "./generation.js";
import {
  type GenerationBudgetInput,
  calculateGenerationBudget,
  getReviewSummaryConfig,
} from "./generation-budget.js";
import { toPersianDigits } from "./persian-numbers.js";

/**
 * Model token pricing and currency exchange rate configuration.
 */
export interface ModelPricingConfig {
  /** Price in USD per 1,000,000 input tokens. Defaults to 0.14 (DeepSeek Flash V4). */
  inputPricePerMillionUsd: number;
  /** Price in USD per 1,000,000 output tokens. Defaults to 0.28 (DeepSeek Flash V4). */
  outputPricePerMillionUsd: number;
  /** Exchange rate: 1 USD to Toman. Defaults to 100,000. */
  usdToTomanRate: number;
}

/**
 * Canonical default pricing configuration for DeepSeek Flash V4.
 */
export const DEFAULT_MODEL_PRICING: ModelPricingConfig = {
  inputPricePerMillionUsd: 0.14,
  outputPricePerMillionUsd: 0.28,
  usdToTomanRate: 100_000,
};

export interface CostEstimateInput {
  documentMetrics: GenerationBudgetInput;
  types: GeneratedContentType[];
  pricing?: Partial<ModelPricingConfig>;
}

export interface StageTokenBreakdown {
  planning: { inputTokens: number; outputTokens: number };
  lesson?: { inputTokens: number; outputTokens: number };
  flashcard?: { inputTokens: number; outputTokens: number };
  quiz?: { inputTokens: number; outputTokens: number };
  review_summary?: { inputTokens: number; outputTokens: number };
}

export interface CostEstimateResult {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
  estimatedCostTomanRaw: number;
  /** Final rounded price in Toman for user presentation. */
  estimatedPriceToman: number;
  /** Human-readable Persian string e.g. "۱۸٬۵۰۰ تومان". */
  formattedPrice: string;
  currency: "toman";
  disclaimer: string;
  breakdown: StageTokenBreakdown;
}

/**
 * Calculates realistic input and output token consumption and the corresponding
 * cost in Toman before starting generation.
 */
export function calculateEstimatedGenerationCost(
  input: CostEstimateInput,
): CostEstimateResult {
  const pricing: ModelPricingConfig = {
    inputPricePerMillionUsd:
      input.pricing?.inputPricePerMillionUsd ??
      DEFAULT_MODEL_PRICING.inputPricePerMillionUsd,
    outputPricePerMillionUsd:
      input.pricing?.outputPricePerMillionUsd ??
      DEFAULT_MODEL_PRICING.outputPricePerMillionUsd,
    usdToTomanRate:
      input.pricing?.usdToTomanRate ?? DEFAULT_MODEL_PRICING.usdToTomanRate,
  };

  const budget = calculateGenerationBudget(input.documentMetrics);
  const { topicBudget, flashcardBudget, quizBudget, documentMetrics } = budget;

  const sessionsCount = topicBudget.targetTopicCount;
  const batchCount = Math.max(1, Math.ceil(sessionsCount / 3));
  const safeTokens = documentMetrics.estimatedInputTokens;

  const typesToEstimate = new Set(input.types);

  // 1. Stage 1: Content Planning (Always runs if any stage is requested)
  // Input: Prompt template overhead + source chunks text
  // Output: Structured JSON containing moduleTitle, outline, and session blueprints
  const planningInputTokens = 800 + safeTokens;
  const planningOutputTokens = 200 + sessionsCount * 80;

  const breakdown: StageTokenBreakdown = {
    planning: {
      inputTokens: planningInputTokens,
      outputTokens: planningOutputTokens,
    },
  };

  let totalInputTokens = planningInputTokens;
  let totalOutputTokens = planningOutputTokens;

  // 2. Stage 2: Lessons
  if (typesToEstimate.has("lesson")) {
    // Input: Batch instructions per batch + distributed source chunks across sessions
    const lessonInput = batchCount * 850 + Math.round(safeTokens * 1.15);
    // Output: Comprehensive educational markdown lessons (~1400 tokens per session)
    const lessonOutput = sessionsCount * 1400;

    breakdown.lesson = {
      inputTokens: lessonInput,
      outputTokens: lessonOutput,
    };
    totalInputTokens += lessonInput;
    totalOutputTokens += lessonOutput;
  }

  // 3. Stage 3: Flashcards
  if (typesToEstimate.has("flashcard")) {
    // Input: Batch instructions + session context summaries
    const flashcardInput = batchCount * 750 + sessionsCount * 300;
    // Output: Atomic flashcard items (~65 tokens per card)
    const flashcardOutput =
      sessionsCount * flashcardBudget.targetCardsPerTopic * 65;

    breakdown.flashcard = {
      inputTokens: flashcardInput,
      outputTokens: flashcardOutput,
    };
    totalInputTokens += flashcardInput;
    totalOutputTokens += flashcardOutput;
  }

  // 4. Stage 4: Quizzes / MCQs
  if (typesToEstimate.has("quiz")) {
    // Input: Batch instructions + session context summaries
    const quizInput = batchCount * 800 + sessionsCount * 300;
    // Output: 4-choice questions with full rationale (~130 tokens per question)
    const quizOutput =
      sessionsCount * quizBudget.targetQuestionsPerTopic * 130;

    breakdown.quiz = {
      inputTokens: quizInput,
      outputTokens: quizOutput,
    };
    totalInputTokens += quizInput;
    totalOutputTokens += quizOutput;
  }

  // 5. Stage 5: High-Density Review Summary
  if (typesToEstimate.has("review_summary")) {
    const reviewConfig = getReviewSummaryConfig(documentMetrics);
    // Input: Template instructions + aggregated session outlines
    const reviewInput = 1000 + Math.min(5000, 1000 + sessionsCount * 250);
    // Output: High-yield summary sections based on word budget (~1.35 tokens/word)
    const reviewOutput = Math.round(reviewConfig.targetWordBudget * 1.35);

    breakdown.review_summary = {
      inputTokens: reviewInput,
      outputTokens: reviewOutput,
    };
    totalInputTokens += reviewInput;
    totalOutputTokens += reviewOutput;
  }

  // Calculate Cost in USD
  const inputCostUsd =
    (totalInputTokens * pricing.inputPricePerMillionUsd) / 1_000_000;
  const outputCostUsd =
    (totalOutputTokens * pricing.outputPricePerMillionUsd) / 1_000_000;
  const estimatedCostUsd = inputCostUsd + outputCostUsd;

  // Convert to Toman
  const estimatedCostTomanRaw = estimatedCostUsd * pricing.usdToTomanRate;

  // Round to nearest 500 Toman for clean user presentation
  const estimatedPriceToman = Math.max(
    500,
    Math.ceil(estimatedCostTomanRaw / 500) * 500,
  );

  const formattedPrice = `${toPersianDigits(
    estimatedPriceToman.toLocaleString("en-US"),
  )} تومان`;

  return {
    estimatedInputTokens: totalInputTokens,
    estimatedOutputTokens: totalOutputTokens,
    estimatedTotalTokens: totalInputTokens + totalOutputTokens,
    estimatedCostUsd,
    estimatedCostTomanRaw,
    estimatedPriceToman,
    formattedPrice,
    currency: "toman",
    disclaimer: "هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.",
    breakdown,
  };
}

export interface ActualCostInput {
  totalInputTokens: number;
  totalOutputTokens: number;
  pricingConfig?: Partial<ModelPricingConfig>;
}

export interface ActualCostResult {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  actualCostUsd: number;
  actualCostTomanRaw: number;
  actualCostToman: number;
  formattedActualPrice: string;
}

/**
 * Calculates the exact actual cost of a completed generation run based on actual token usage.
 *
 * Invariant:
 * Actual Cost = (Σ Input Tokens × Input Price) + (Σ Output Tokens × Output Price)
 */
export function calculateActualGenerationCost(
  input: ActualCostInput,
): ActualCostResult {
  const pricing: ModelPricingConfig = {
    ...DEFAULT_MODEL_PRICING,
    ...input.pricingConfig,
  };
  const inputCostUsd =
    (input.totalInputTokens * pricing.inputPricePerMillionUsd) / 1_000_000;
  const outputCostUsd =
    (input.totalOutputTokens * pricing.outputPricePerMillionUsd) / 1_000_000;
  const actualCostUsd = inputCostUsd + outputCostUsd;
  const actualCostTomanRaw = actualCostUsd * pricing.usdToTomanRate;
  const actualCostToman = Math.round(actualCostTomanRaw);

  const formattedActualPrice = `${toPersianDigits(
    actualCostToman.toLocaleString("en-US"),
  )} تومان`;

  return {
    totalInputTokens: input.totalInputTokens,
    totalOutputTokens: input.totalOutputTokens,
    totalTokens: input.totalInputTokens + input.totalOutputTokens,
    actualCostUsd,
    actualCostTomanRaw,
    actualCostToman,
    formattedActualPrice,
  };
}
