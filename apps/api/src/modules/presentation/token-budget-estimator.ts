/**
 * Token Budget Estimator for Presentation Reference Integration (Phase 2A-2.3a).
 *
 * Provides conservative, deterministic token estimation for Google Gemini models (gemini-3.5-flash-lite).
 *
 * Guarantees & Principles:
 * 1. Independent subword estimation for Persian/Arabic, Latin/English, and numerical/scientific symbols.
 * 2. Conservative ratios designed to avoid prompt truncation:
 *    - Persian/Arabic (UTF-8 multi-byte script): ~1.8 chars/token
 *    - Latin/English: ~3.5 chars/token
 *    - Numbers, math, units, punctuation, whitespace: ~2.5 chars/token
 * 3. Configurable safety margin multiplier (default: 1.25x).
 * 4. 100% Deterministic: identical inputs always yield identical token estimates.
 * 5. Full accounting: counts chunk content, citation labels, reference titles, chunk IDs, and prompt XML envelopes.
 * 6. Explicit Oversized Policy: identifies oversized chunks without mutating or truncating source text.
 */

import {
  type IntegratedReferenceChunk,
  type SlideContextQuery,
  type TokenEstimationBreakdown,
  DEFAULT_SAFETY_MARGIN_MULTIPLIER,
} from "@avana/domain";

/**
 * Character-to-token heuristic ratios for conservative Gemini token budgeting.
 */
export const CHARS_PER_TOKEN_PERSIAN = 1.8;
export const CHARS_PER_TOKEN_LATIN = 3.5;
export const CHARS_PER_TOKEN_OTHER = 2.5;

/** Fixed overhead in tokens for formatting a reference chunk envelope in prompt XML */
export const REFERENCE_CHUNK_TAG_OVERHEAD_TOKENS = 25;

/** Fixed overhead in tokens for system reference context instructions */
export const SYSTEM_REFERENCE_INSTRUCTIONS_OVERHEAD_TOKENS = 350;

/**
 * Perform detailed character-by-character token estimation across language scripts.
 */
export function estimateTextTokensDetailed(
  text: string | null | undefined,
  safetyMarginMultiplier = DEFAULT_SAFETY_MARGIN_MULTIPLIER,
): TokenEstimationBreakdown {
  const multiplier =
    typeof safetyMarginMultiplier === "number" &&
    !Number.isNaN(safetyMarginMultiplier) &&
    safetyMarginMultiplier > 0
      ? safetyMarginMultiplier
      : DEFAULT_SAFETY_MARGIN_MULTIPLIER;

  if (!text || text.trim().length === 0) {
    return {
      persianTokens: 0,
      latinTokens: 0,
      otherTokens: 0,
      rawTotal: 0,
      safetyMultiplier: multiplier,
      finalTotal: 0,
    };
  }

  let persianCharCount = 0;
  let latinCharCount = 0;
  let otherCharCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    // 1. Arabic & Persian Unicode Blocks:
    // Basic Arabic: 0x0600 - 0x06FF
    // Arabic Supplement: 0x0750 - 0x077F
    // Arabic Presentation Forms-A: 0xFB50 - 0xFDFF
    // Arabic Presentation Forms-B: 0xFE70 - 0xFEFC
    // Zero-Width Non-Joiner (ZWNJ): 0x200C
    if (
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0x0750 && code <= 0x077f) ||
      (code >= 0xfb50 && code <= 0xfefc) ||
      code === 0x200c
    ) {
      persianCharCount++;
    }
    // 2. Latin / English ASCII characters (A-Z, a-z)
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      latinCharCount++;
    }
    // 3. Numbers, punctuation, math, Greek letters, whitespace, symbols
    else {
      otherCharCount++;
    }
  }

  const persianTokens = persianCharCount / CHARS_PER_TOKEN_PERSIAN;
  const latinTokens = latinCharCount / CHARS_PER_TOKEN_LATIN;
  const otherTokens = otherCharCount / CHARS_PER_TOKEN_OTHER;

  const rawTotal = persianTokens + latinTokens + otherTokens;
  const finalTotal = Math.ceil(rawTotal * multiplier);

  return {
    persianTokens: Math.ceil(persianTokens),
    latinTokens: Math.ceil(latinTokens),
    otherTokens: Math.ceil(otherTokens),
    rawTotal: Math.ceil(rawTotal),
    safetyMultiplier: multiplier,
    finalTotal,
  };
}

/**
 * Convenient shorthand returning the final integer conservative token estimate.
 */
export function estimateTextTokens(
  text: string | null | undefined,
  safetyMarginMultiplier = DEFAULT_SAFETY_MARGIN_MULTIPLIER,
): number {
  return estimateTextTokensDetailed(text, safetyMarginMultiplier).finalTotal;
}

export interface ChunkPayloadTokenOptions {
  includeMetadata?: boolean;
  safetyMarginMultiplier?: number;
}

/**
 * Estimate the total token footprint of an integrated reference chunk as it would be injected into the prompt.
 *
 * Accounts for:
 * - Raw chunk content
 * - Metadata (if enabled): source title, citation label, chunk ID, page location
 * - XML delimiter formatting overhead
 */
export function estimateChunkPayloadTokens(
  chunk: IntegratedReferenceChunk,
  options: ChunkPayloadTokenOptions = {},
): number {
  const { includeMetadata = true, safetyMarginMultiplier } = options;

  const contentTokens = estimateTextTokens(
    chunk.chunk.content,
    safetyMarginMultiplier,
  );

  if (!includeMetadata) {
    return contentTokens;
  }

  // Build the metadata text that wraps the chunk
  const title = chunk.source.title || "";
  const citationLabel = chunk.source.citationLabel || "";
  const chunkId = chunk.id || "";
  const startPage = chunk.location.startPage ?? "";
  const endPage = chunk.location.endPage ?? "";
  const headingPath = chunk.chunk.headingPath.join(" > ");

  const metadataString = `${title} ${citationLabel} ${chunkId} ${startPage} ${endPage} ${headingPath}`;
  const metadataTokens = estimateTextTokens(metadataString, safetyMarginMultiplier);

  return contentTokens + metadataTokens + REFERENCE_CHUNK_TAG_OVERHEAD_TOKENS;
}

/**
 * Estimate the token footprint of slide query fields.
 */
export function estimateSlideQueryTokens(
  query: SlideContextQuery,
  safetyMarginMultiplier = DEFAULT_SAFETY_MARGIN_MULTIPLIER,
): number {
  let combined = query.title || "";

  if (query.keyPoints && query.keyPoints.length > 0) {
    combined += " " + query.keyPoints.join(" ");
  }
  if (query.slideType) {
    combined += " " + query.slideType;
  }
  if (query.intendedLearningOutcome) {
    combined += " " + query.intendedLearningOutcome;
  }
  if (query.existingText) {
    combined += " " + query.existingText;
  }

  return estimateTextTokens(combined, safetyMarginMultiplier);
}

export interface OversizedCheckResult {
  isOversized: boolean;
  estimatedTokens: number;
  maxAllowed: number;
}

/**
 * Check whether a chunk exceeds the maximum permissible token limit for a single chunk.
 *
 * NOTE: Does NOT mutate or truncate the chunk.
 */
export function isChunkOversized(
  chunk: IntegratedReferenceChunk,
  maxTokensPerChunk: number,
  safetyMarginMultiplier = DEFAULT_SAFETY_MARGIN_MULTIPLIER,
): OversizedCheckResult {
  const estimatedTokens = estimateChunkPayloadTokens(chunk, {
    includeMetadata: true,
    safetyMarginMultiplier,
  });

  return {
    isOversized: estimatedTokens > maxTokensPerChunk,
    estimatedTokens,
    maxAllowed: maxTokensPerChunk,
  };
}

export class TokenBudgetEstimator {
  constructor(
    private readonly defaultSafetyMultiplier = DEFAULT_SAFETY_MARGIN_MULTIPLIER,
  ) {}

  estimateText(text: string | null | undefined): number {
    return estimateTextTokens(text, this.defaultSafetyMultiplier);
  }

  estimateTextDetailed(
    text: string | null | undefined,
  ): TokenEstimationBreakdown {
    return estimateTextTokensDetailed(text, this.defaultSafetyMultiplier);
  }

  estimateChunk(
    chunk: IntegratedReferenceChunk,
    includeMetadata = true,
  ): number {
    return estimateChunkPayloadTokens(chunk, {
      includeMetadata,
      safetyMarginMultiplier: this.defaultSafetyMultiplier,
    });
  }

  checkOversized(
    chunk: IntegratedReferenceChunk,
    maxTokensPerChunk: number,
  ): OversizedCheckResult {
    return isChunkOversized(
      chunk,
      maxTokensPerChunk,
      this.defaultSafetyMultiplier,
    );
  }
}
