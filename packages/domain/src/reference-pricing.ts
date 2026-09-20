/**
 * Canonical Reference-Based User Pricing Engine for AVANA Content Generation.
 *
 * Calibration Baseline:
 * - Reference File: Katzung Chapter 40 ("40.pdf") in Course "فارماکولوژی ۳"
 *   (Document ID: "19313b37-8baf-47bb-a80d-3a70e5ed910e")
 * - Usable Extracted Content: 35,572 tokens (across 28 semantic chunks)
 * - Workload Calibrations:
 *   - 11 Generated Lessons -> Baseline Price = 15,000 Toman (for the complete lesson set)
 *   - 138 Generated Flashcards -> Baseline Price = 7,000 Toman (for the complete flashcard set)
 *   - 118 Generated Quiz Questions -> Baseline Price = 9,000 Toman (for the complete quiz set)
 *   - 1 Review Summary -> Fixed Price = 4,000 Toman (flat across all documents)
 *
 * Key Architectural Invariants:
 * 1. AI Infrastructure Cost (DeepSeek Flash V4 tokens) != User Selling Price (Reference Model).
 * 2. Stage Independence: Each stage scales from its own baseline, never derived from each other.
 * 3. Review Summary is completely independent of document volume (always 4,000 Toman).
 * 4. Rounding: Math.round(price / 100) * 100 for Lesson, Flashcard, Exam.
 */

import type { GeneratedContentType } from "./generation.js";
import { toPersianDigits } from "./persian-numbers.js";

/**
 * Reference Document Metadata & Calibration Constants (Katzung Chapter 40).
 */
export const REFERENCE_DOCUMENT_ID = "19313b37-8baf-47bb-a80d-3a70e5ed910e";

export const REFERENCE_DOCUMENT_METRICS = {
  documentId: REFERENCE_DOCUMENT_ID,
  originalName: "40.pdf",
  courseName: "فارماکولوژی ۳",
  moduleTitle: "فصل: هورمون‌های جنسی و مهارکننده‌ها (Gonadal Hormones & Inhibitors)",
  usableExtractedTokens: 35_572,
  pageCount: 28,
  chunkCount: 28,
  lessonsGenerated: 11,
  flashcardsGenerated: 138,
  quizQuestionsGenerated: 118,
  reviewSummaryGenerated: 1,
} as const;

export interface ReferencePricingBaseline {
  /** Reference document usable token baseline (Katzung Chapter 40 = 35,572 tokens). */
  referenceUsableTokens: number;
  /** Baseline selling price for full lesson set of reference document (15,000 Toman). */
  lessonBaselinePriceToman: number;
  /** Baseline selling price for full flashcard set of reference document (7,000 Toman). */
  flashcardBaselinePriceToman: number;
  /** Baseline selling price for full exam/quiz set of reference document (9,000 Toman). */
  examBaselinePriceToman: number;
  /** Fixed flat selling price for review summary across all documents (4,000 Toman). */
  summaryFixedPriceToman: number;
}

/**
 * Canonical default baseline selling prices calibrated against Katzung Chapter 40.
 */
export const DEFAULT_REFERENCE_PRICING: ReferencePricingBaseline = {
  referenceUsableTokens: 35_572,
  lessonBaselinePriceToman: 15_000,
  flashcardBaselinePriceToman: 7_000,
  examBaselinePriceToman: 9_000,
  summaryFixedPriceToman: 4_000,
};

export interface ContentGenerationPricingConfig extends ReferencePricingBaseline {
  referenceDocumentId: string;
  referenceFileName: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface UpdateContentGenerationPricingInput {
  lessonBaselinePriceToman?: number;
  flashcardBaselinePriceToman?: number;
  examBaselinePriceToman?: number;
  summaryFixedPriceToman?: number;
}

export const DEFAULT_CONTENT_GENERATION_PRICING_CONFIG: ContentGenerationPricingConfig = {
  referenceDocumentId: REFERENCE_DOCUMENT_ID,
  referenceFileName: REFERENCE_DOCUMENT_METRICS.originalName,
  referenceUsableTokens: REFERENCE_DOCUMENT_METRICS.usableExtractedTokens,
  lessonBaselinePriceToman: DEFAULT_REFERENCE_PRICING.lessonBaselinePriceToman,
  flashcardBaselinePriceToman: DEFAULT_REFERENCE_PRICING.flashcardBaselinePriceToman,
  examBaselinePriceToman: DEFAULT_REFERENCE_PRICING.examBaselinePriceToman,
  summaryFixedPriceToman: DEFAULT_REFERENCE_PRICING.summaryFixedPriceToman,
};

export interface CalculateUserPriceInput {
  /** Usable extracted token count of target document (sum of chunk token_estimates). */
  targetUsableTokens: number;
  /** Selected generation types to price. */
  types: GeneratedContentType[];
  /** Optional custom baseline configuration override. */
  baseline?: Partial<ReferencePricingBaseline>;
}

export interface StagePriceDetails {
  stage: GeneratedContentType;
  rawPriceToman: number;
  roundedPriceToman: number;
  formattedPrice: string;
}

export interface ReferenceBasedUserPriceResult {
  targetUsableTokens: number;
  referenceUsableTokens: number;
  volumeRatio: number;
  totalPriceToman: number;
  formattedTotalPrice: string;
  currency: "toman";
  disclaimer: string;
  stagePrices: {
    lesson?: StagePriceDetails;
    flashcard?: StagePriceDetails;
    quiz?: StagePriceDetails;
    review_summary?: StagePriceDetails;
  };
}

/**
 * Rounds a Toman price to the nearest 100 Toman using standard financial rounding.
 * Formula: Math.round(price / 100) * 100
 */
export function roundToNearest100Toman(price: number): number {
  return Math.round(price / 100) * 100;
}

/**
 * Calculates user-facing selling prices for content generation based on volume ratio
 * relative to the Katzung Chapter 40 reference document.
 */
export function calculateReferenceBasedUserPrice(
  input: CalculateUserPriceInput,
): ReferenceBasedUserPriceResult {
  const baseline: ReferencePricingBaseline = {
    ...DEFAULT_REFERENCE_PRICING,
    ...input.baseline,
  };

  const targetTokens = Math.max(0, input.targetUsableTokens);
  const volumeRatio =
    baseline.referenceUsableTokens > 0
      ? targetTokens / baseline.referenceUsableTokens
      : 0;

  const typesToPrice = new Set(input.types);
  const stagePrices: ReferenceBasedUserPriceResult["stagePrices"] = {};
  let totalRoundedToman = 0;

  // 1. Lesson Stage (15,000 * volume_ratio)
  if (typesToPrice.has("lesson")) {
    const raw = baseline.lessonBaselinePriceToman * volumeRatio;
    const rounded = roundToNearest100Toman(raw);
    stagePrices.lesson = {
      stage: "lesson",
      rawPriceToman: raw,
      roundedPriceToman: rounded,
      formattedPrice: `${toPersianDigits(rounded.toLocaleString("en-US"))} تومان`,
    };
    totalRoundedToman += rounded;
  }

  // 2. Flashcard Stage (7,000 * volume_ratio)
  if (typesToPrice.has("flashcard")) {
    const raw = baseline.flashcardBaselinePriceToman * volumeRatio;
    const rounded = roundToNearest100Toman(raw);
    stagePrices.flashcard = {
      stage: "flashcard",
      rawPriceToman: raw,
      roundedPriceToman: rounded,
      formattedPrice: `${toPersianDigits(rounded.toLocaleString("en-US"))} تومان`,
    };
    totalRoundedToman += rounded;
  }

  // 3. Exam / Quiz Stage (9,000 * volume_ratio)
  if (typesToPrice.has("quiz")) {
    const raw = baseline.examBaselinePriceToman * volumeRatio;
    const rounded = roundToNearest100Toman(raw);
    stagePrices.quiz = {
      stage: "quiz",
      rawPriceToman: raw,
      roundedPriceToman: rounded,
      formattedPrice: `${toPersianDigits(rounded.toLocaleString("en-US"))} تومان`,
    };
    totalRoundedToman += rounded;
  }

  // 4. Review Summary (Flat 4,000 Toman across all documents)
  if (typesToPrice.has("review_summary")) {
    const raw = baseline.summaryFixedPriceToman;
    const rounded = baseline.summaryFixedPriceToman;
    stagePrices.review_summary = {
      stage: "review_summary",
      rawPriceToman: raw,
      roundedPriceToman: rounded,
      formattedPrice: `${toPersianDigits(rounded.toLocaleString("en-US"))} تومان`,
    };
    totalRoundedToman += rounded;
  }

  const formattedTotalPrice = `${toPersianDigits(
    totalRoundedToman.toLocaleString("en-US"),
  )} تومان`;

  return {
    targetUsableTokens: targetTokens,
    referenceUsableTokens: baseline.referenceUsableTokens,
    volumeRatio,
    totalPriceToman: totalRoundedToman,
    formattedTotalPrice,
    currency: "toman",
    disclaimer: "هزینه نهایی ممکن است بر اساس خروجی واقعی کمی متفاوت باشد.",
    stagePrices,
  };
}
