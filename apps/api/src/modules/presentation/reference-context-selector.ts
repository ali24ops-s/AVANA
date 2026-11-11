/**
 * Heuristic Lexical Reference Context Selector (Phase 2A-2.3a).
 *
 * NOTE: This is a DETERMINISTIC HEURISTIC LEXICAL SELECTOR, NOT Semantic Retrieval.
 * It uses exact lexical overlap, heading match, and source relevance with conservative
 * token budgeting. It does not employ vector databases, embeddings, or LLM evaluation.
 *
 * Guarantees:
 * 1. 100% Deterministic: identical inputs always yield identical ranking and output.
 * 2. Deterministic Tie-breaking: multi-level stable sort (score, heading, page, refId, sequence, chunkId).
 * 3. Length Normalization: prevents long chunks from dominating simply due to word count.
 * 4. Relevance Floor: never includes irrelevant chunks merely to fill available budget.
 * 5. Redundancy Mitigation: detects and penalizes near-duplicate chunks from the same source.
 * 6. Full Traceability: every chunk carries human-readable selection reasons and signal scores.
 * 7. Zero Mutation / Truncation: preserves original chunk objects and content without truncation.
 */

import {
  type IntegratedReferenceChunk,
  type ReferenceContextSelectionOptions,
  type ReferenceContextSelectionResult,
  type RejectedReferenceChunk,
  type SelectedReferenceChunk,
  type SlideContextQuery,
  DEFAULT_MAX_CHUNKS_PER_SLIDE,
  DEFAULT_MAX_TOKENS_PER_CHUNK,
  DEFAULT_MAX_TOKENS_PER_SLIDE,
  DEFAULT_REFERENCE_SCORING_WEIGHTS,
  DEFAULT_RELEVANCE_THRESHOLD,
  DEFAULT_SAFETY_MARGIN_MULTIPLIER,
} from "@avana/domain";
import {
  estimateChunkPayloadTokens,
  isChunkOversized,
} from "./token-budget-estimator.js";

// ---------------------------------------------------------------------------
// Stopwords & Linguistic Sets
// ---------------------------------------------------------------------------

const PERSIAN_STOPWORDS = new Set([
  "و", "در", "به", "از", "که", "این", "رو", "را", "با", "است", "شد", "شده",
  "بر", "برای", "آن", "تا", "یا", "یک", "هم", "اگر", "ولی", "اما", "چون",
  "نیز", "پس", "هر", "چه", "های", "ها", "می", "شود", "کند", "کرده", "بود",
  "بودن", "بین", "روی", "زیر", "غیر", "درباره", "مورد", "توسط", "طریق",
  "تمامی", "همه", "باید", "شاید", "دارد", "دارند", "کنند", "گردد", "باشد",
  "باشند", "همچنین", "دیگر", "بوده", "جهت", "وی", "آنها", "آنان",
]);

const ENGLISH_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "as", "is", "was", "are", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should",
  "can", "could", "may", "might", "must", "that", "this", "these", "those",
  "it", "its", "their", "theirs", "we", "our", "ours", "they", "them", "which",
  "who", "whom", "whose", "what", "where", "when", "how", "why", "all", "each",
  "every", "both", "either", "neither", "some", "any", "no", "not", "only",
  "own", "same", "so", "than", "too", "very", "about", "above", "after", "again",
  "against", "between", "into", "through", "during", "before", "under",
]);

/**
 * Generic structural outline titles that must NOT receive the verbatim phrase bonus,
 * preventing unrelated chunks from crossing relevance thresholds purely on generic terms.
 */
export const GENERIC_OUTLINE_TITLES = new Set([
  "مقدمه",
  "کلیات",
  "معرفی",
  "اهداف",
  "هدف",
  "اهداف کلی",
  "اهداف اختصاصی",
  "جمع بندی",
  "نتیجه گیری",
  "نتایج",
  "خلاصه",
  "مرور",
  "فهرست",
  "منابع",
  "مراجع",
  "ضمیمه",
  "پیوست",
  "پرسش و پاسخ",
  "بحث",
  "پیشینه",
  "چکیده",
  "introduction",
  "overview",
  "summary",
  "conclusion",
  "conclusions",
  "references",
  "background",
  "outline",
  "objectives",
  "agenda",
  "abstract",
  "discussion",
  "q and a",
  "q&a",
]);

/**
 * Valid single-letter medical/clinical symbols (e.g. Vitamin K, Factor V, Hepatitis B).
 */
export const VALID_SINGLE_LETTER_MEDICAL_SYMBOLS = new Set([
  "a", "b", "c", "d", "e", "k", "v", "x", "t", "m", "h", "o", "p", "s", "n", "l", "r",
  "آ", "ا", "ب", "د", "ک", "ث", "م", "ت", "ه", "پ", "س",
]);

/**
 * Medical trigger words adjacent to single-letter symbols providing clinical context.
 */
export const MEDICAL_CONTEXT_TRIGGERS = new Set([
  "vitamin", "vit", "ویتامین",
  "factor", "فاکتور",
  "hepatitis", "هپاتیت",
  "type", "تیپ", "نوع",
  "stage", "استیج", "مرحله",
  "grade", "گرید", "درجه",
  "class", "کلاس", "طبقه",
  "cell", "cells", "سلول", "سلولهای",
  "group", "گروه",
]);

// ---------------------------------------------------------------------------
// Pure Text Normalization Functions
// ---------------------------------------------------------------------------

/**
 * Normalize Persian and Arabic text for reliable lexical matching:
 * - Unifies Arabic Yeh (ي, ى) to Persian Yeh (ی)
 * - Unifies Arabic Kaf (ك) to Persian Kaf (ک)
 * - Unifies Heh with Hamza (ۀ, هٔ) to Heh (ه)
 * - Removes Arabic diacritics / harakat (َ ِ ُ ً ٍ ٌ ّ ْ)
 * - Unifies Arabic-Indic digits (٠-٩) and Persian digits (۰-۹) to ASCII digits (0-9)
 * - Replaces Zero-Width Non-Joiner (ZWNJ: \u200C) with space to bridge segmented compounds
 */
export function normalizeForLexicalMatching(text: string | null | undefined): string {
  if (!text) return "";

  return (
    text
      // Arabic Yeh variants -> Persian Yeh
      .replace(/[\u064A\u0649]/g, "\u06CC")
      // Arabic Kaf -> Persian Kaf
      .replace(/\u0643/g, "\u06A9")
      // Heh with Hamza -> Heh
      .replace(/[\u06C0\u0629]/g, "\u0647")
      .replace(/\u0647\u0654/g, "\u0647")
      // Remove Arabic diacritics / tashkeel / tanwin
      .replace(/[\u064B-\u0653\u0655-\u065F]/g, "")
      // Convert Persian digits to ASCII
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      // Convert Arabic-Indic digits to ASCII
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      // ZWNJ to space
      .replace(/\u200C/g, " ")
      // Lowercase Latin characters
      .toLowerCase()
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Tokenize text into distinct, non-stopword lexical tokens.
 * Single characters are discarded UNLESS they represent valid medical symbols
 * in recognized clinical contexts (e.g. "Vitamin K", "Factor V", "Hepatitis B", "ویتامین D").
 */
export function extractLexicalKeywords(text: string | null | undefined): string[] {
  const normalized = normalizeForLexicalMatching(text);
  if (!normalized) return [];

  // Split on any character that is not a Persian/Arabic letter, Latin letter, or digit
  // Retains: \u0600-\u06FF, a-z, 0-9
  const rawTokens = normalized
    .split(/[^a-z0-9\u0600-\u06ff]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const keywords: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const trimmed = rawTokens[i];

    if (trimmed.length < 2) {
      // Retain single characters ONLY if they are valid medical symbols in a medical trigger context
      if (VALID_SINGLE_LETTER_MEDICAL_SYMBOLS.has(trimmed)) {
        const prevToken = i > 0 ? rawTokens[i - 1] : "";
        const nextToken = i < rawTokens.length - 1 ? rawTokens[i + 1] : "";
        const hasMedicalContext =
          MEDICAL_CONTEXT_TRIGGERS.has(prevToken) ||
          MEDICAL_CONTEXT_TRIGGERS.has(nextToken);

        if (hasMedicalContext) {
          keywords.push(trimmed);
        }
      }
      continue;
    }

    // Skip pure numbers unless they appear with scientific context
    if (/^\d+$/.test(trimmed) && trimmed.length > 4) continue;

    if (PERSIAN_STOPWORDS.has(trimmed) || ENGLISH_STOPWORDS.has(trimmed)) {
      continue;
    }

    keywords.push(trimmed);
  }

  return keywords;
}

/**
 * Create a term frequency map from a list of tokens.
 */
function createTermFrequencyMap(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tokens) {
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return map;
}

/**
 * Compute Jaccard similarity between two token arrays.
 */
function computeJaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ---------------------------------------------------------------------------
// Candidate Evaluation & Scoring
// ---------------------------------------------------------------------------

interface ScoredCandidate {
  chunk: IntegratedReferenceChunk;
  score: number;
  reasons: string[];
  estimatedTokens: number;
  titleContentScore: number;
  keyPointsContentScore: number;
  titleHeadingScore: number;
  referenceTitleScore: number;
  matchedKeywords: string[];
  tokens: string[];
}

export class HeuristicLexicalContextSelector {
  /**
   * Select the most relevant reference chunks for a given slide query within token budget limits.
   */
  selectChunksForSlide(
    allChunks: IntegratedReferenceChunk[],
    slideQuery: SlideContextQuery,
    options: ReferenceContextSelectionOptions = {},
  ): ReferenceContextSelectionResult {
    const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS_PER_SLIDE;
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS_PER_SLIDE;
    const maxTokensPerChunk =
      options.maxTokensPerChunk ?? DEFAULT_MAX_TOKENS_PER_CHUNK;
    const minRelevanceScore =
      options.minRelevanceScore ?? DEFAULT_RELEVANCE_THRESHOLD;
    const safetyMarginMultiplier =
      options.safetyMarginMultiplier ?? DEFAULT_SAFETY_MARGIN_MULTIPLIER;
    const includeMetadataTokens = options.includeMetadataTokens ?? true;

    const weights = {
      titleContentWeight:
        options.scoringWeights?.titleContentWeight ??
        DEFAULT_REFERENCE_SCORING_WEIGHTS.titleContentWeight,
      keyPointsContentWeight:
        options.scoringWeights?.keyPointsContentWeight ??
        DEFAULT_REFERENCE_SCORING_WEIGHTS.keyPointsContentWeight,
      titleHeadingWeight:
        options.scoringWeights?.titleHeadingWeight ??
        DEFAULT_REFERENCE_SCORING_WEIGHTS.titleHeadingWeight,
      referenceTitleWeight:
        options.scoringWeights?.referenceTitleWeight ??
        DEFAULT_REFERENCE_SCORING_WEIGHTS.referenceTitleWeight,
    };

    if (!Array.isArray(allChunks) || allChunks.length === 0) {
      return {
        slideIndex: slideQuery.slideIndex,
        selectedChunks: [],
        rejectedChunks: [],
        evaluatedCount: 0,
        totalSelectedTokens: 0,
        budgetLimitTokens: maxTokens,
        remainingTokens: maxTokens,
      };
    }

    // 1. Extract query keywords
    const titleKeywords = extractLexicalKeywords(slideQuery.title);
    const keyPointKeywords = extractLexicalKeywords(
      (slideQuery.keyPoints || []).join(" ") +
        " " +
        (slideQuery.intendedLearningOutcome || "") +
        " " +
        (slideQuery.existingText || ""),
    );

    const allQueryKeywords = Array.from(
      new Set([...titleKeywords, ...keyPointKeywords]),
    );

    const rejectedChunks: RejectedReferenceChunk[] = [];
    const validCandidates: ScoredCandidate[] = [];

    // 2. Evaluate and score each chunk
    for (const chunk of allChunks) {
      // Check oversized chunk policy
      const oversizedCheck = isChunkOversized(
        chunk,
        maxTokensPerChunk,
        safetyMarginMultiplier,
      );

      if (oversizedCheck.isOversized) {
        rejectedChunks.push({
          chunk,
          score: 0,
          reason: "oversized_chunk",
          detail: `Chunk estimated at ${oversizedCheck.estimatedTokens} tokens exceeds single-chunk limit of ${maxTokensPerChunk} tokens. Preserved unmutated without silent truncation.`,
          estimatedTokens: oversizedCheck.estimatedTokens,
        });
        continue;
      }

      const chunkTokens = extractLexicalKeywords(chunk.chunk.content);
      const headingTokens = extractLexicalKeywords(
        chunk.chunk.headingPath.join(" "),
      );
      const sourceTitleTokens = extractLexicalKeywords(chunk.source.title);

      const chunkTf = createTermFrequencyMap(chunkTokens);
      const reasons: string[] = [];
      const matchedKeywordsSet = new Set<string>();

      // Signal 1: Title match against chunk content
      let titleContentScore = 0;
      if (titleKeywords.length > 0) {
        let matchedTitleTerms = 0;
        for (const kw of titleKeywords) {
          if (chunkTf.has(kw)) {
            matchedTitleTerms++;
            matchedKeywordsSet.add(kw);
          }
        }
        titleContentScore = matchedTitleTerms / titleKeywords.length;
        if (matchedTitleTerms > 0) {
          reasons.push(
            `Matched ${matchedTitleTerms}/${titleKeywords.length} title keywords`,
          );
        }
      }

      // Signal 2: KeyPoints match against chunk content
      let keyPointsContentScore = 0;
      if (keyPointKeywords.length > 0) {
        let matchedKpTerms = 0;
        for (const kw of keyPointKeywords) {
          if (chunkTf.has(kw)) {
            matchedKpTerms++;
            matchedKeywordsSet.add(kw);
          }
        }
        keyPointsContentScore = matchedKpTerms / keyPointKeywords.length;
        if (matchedKpTerms > 0) {
          reasons.push(
            `Matched ${matchedKpTerms}/${keyPointKeywords.length} keypoint keywords`,
          );
        }
      }

      // Signal 3: Slide title/keywords match against headingPath
      let titleHeadingScore = 0;
      if (headingTokens.length > 0 && allQueryKeywords.length > 0) {
        let matchedHeadingTerms = 0;
        const headingTf = createTermFrequencyMap(headingTokens);
        for (const kw of allQueryKeywords) {
          if (headingTf.has(kw)) {
            matchedHeadingTerms++;
            matchedKeywordsSet.add(kw);
          }
        }
        titleHeadingScore = matchedHeadingTerms / headingTokens.length;
        if (matchedHeadingTerms > 0) {
          reasons.push(
            `Matched heading path: "${chunk.chunk.headingPath.join(" > ")}" (${matchedHeadingTerms} keywords)`,
          );
        }
      }

      // Signal 4: Slide topic match against reference source title
      let referenceTitleScore = 0;
      if (sourceTitleTokens.length > 0 && allQueryKeywords.length > 0) {
        let matchedSourceTerms = 0;
        const sourceTf = createTermFrequencyMap(sourceTitleTokens);
        for (const kw of allQueryKeywords) {
          if (sourceTf.has(kw)) {
            matchedSourceTerms++;
          }
        }
        referenceTitleScore = matchedSourceTerms / sourceTitleTokens.length;
        if (matchedSourceTerms > 0) {
          reasons.push(
            `Matched source title: "${chunk.source.title}" (${matchedSourceTerms} keywords)`,
          );
        }
      }

      // Signal 5: Verbatim phrase bonus (exact continuous word-boundary phrase match)
      let phraseBonus = 0;
      const normalizedTitle = normalizeForLexicalMatching(slideQuery.title);
      const isGenericTitle = GENERIC_OUTLINE_TITLES.has(normalizedTitle);

      if (normalizedTitle && !isGenericTitle && normalizedTitle.length >= 3) {
        // Enforce word boundaries by padding normalized strings with single spaces
        const paddedChunk = ` ${normalizeForLexicalMatching(chunk.chunk.content)} `;
        const paddedTitle = ` ${normalizedTitle} `;

        if (paddedChunk.includes(paddedTitle)) {
          phraseBonus = 0.15;
          reasons.push(
            "Verbatim slide title phrase found in chunk content (+0.15 bonus)",
          );
        }
      }

      // Length Normalization Factor:
      // Dampen raw word count advantage so a 1000-token chunk does not outscore a 150-token chunk
      // that is concentrated and highly relevant.
      const estimatedPayloadTokens = estimateChunkPayloadTokens(chunk, {
        includeMetadata: includeMetadataTokens,
        safetyMarginMultiplier,
      });

      const effectiveTokenSize = Math.max(50, chunk.chunk.tokenEstimate || 100);
      const lengthDampeningFactor = Math.min(
        1.0,
        Math.sqrt(250 / effectiveTokenSize),
      );

      const rawCompositeScore =
        weights.titleContentWeight * titleContentScore +
        weights.keyPointsContentWeight * keyPointsContentScore +
        weights.titleHeadingWeight * titleHeadingScore +
        weights.referenceTitleWeight * referenceTitleScore +
        phraseBonus;

      // Final normalized score between 0 and 1
      const finalScore = Math.min(
        1.0,
        Math.max(0.0, rawCompositeScore * (0.7 + 0.3 * lengthDampeningFactor)),
      );

      // Check relevance floor
      if (finalScore < minRelevanceScore) {
        rejectedChunks.push({
          chunk,
          score: Number(finalScore.toFixed(6)),
          reason: "below_relevance_threshold",
          detail: `Score ${finalScore.toFixed(4)} is below relevance threshold of ${minRelevanceScore}.`,
          estimatedTokens: estimatedPayloadTokens,
        });
        continue;
      }

      validCandidates.push({
        chunk,
        score: Number(finalScore.toFixed(6)),
        reasons,
        estimatedTokens: estimatedPayloadTokens,
        titleContentScore,
        keyPointsContentScore,
        titleHeadingScore,
        referenceTitleScore,
        matchedKeywords: Array.from(matchedKeywordsSet),
        tokens: chunkTokens,
      });
    }

    // 3. Multi-level Deterministic Tie-Breaking Sort
    validCandidates.sort((a, b) => {
      // Primary: Score descending
      if (Math.abs(b.score - a.score) > 1e-6) {
        return b.score - a.score;
      }
      // Tie-break 1: Heading match score descending
      if (Math.abs(b.titleHeadingScore - a.titleHeadingScore) > 1e-6) {
        return b.titleHeadingScore - a.titleHeadingScore;
      }
      // Tie-break 2: Physical page confidence (exact PDF layout with startPage preferred)
      const aHasPage = a.chunk.location.startPage !== null ? 1 : 0;
      const bHasPage = b.chunk.location.startPage !== null ? 1 : 0;
      if (bHasPage !== aHasPage) {
        return bHasPage - aHasPage;
      }
      // Tie-break 3: Source reference ID ascending (lexicographical)
      const refCompare = a.chunk.source.referenceId.localeCompare(
        b.chunk.source.referenceId,
      );
      if (refCompare !== 0) {
        return refCompare;
      }
      // Tie-break 4: Chunk sequence ascending (original document flow)
      if (a.chunk.chunk.sequence !== b.chunk.chunk.sequence) {
        return a.chunk.chunk.sequence - b.chunk.chunk.sequence;
      }
      // Tie-break 5: Unique chunk composite ID ascending (guaranteed 100% uniqueness)
      return a.chunk.id.localeCompare(b.chunk.id);
    });

    // 4. Redundancy Filtering and Selection against Token Budget
    const selectedChunks: SelectedReferenceChunk[] = [];
    let currentTokensSpent = 0;

    for (const candidate of validCandidates) {
      // Guard against identical duplicate chunk IDs
      if (selectedChunks.some((s) => s.chunk.id === candidate.chunk.id)) {
        rejectedChunks.push({
          chunk: candidate.chunk,
          score: candidate.score,
          reason: "redundant_near_duplicate",
          detail: `Chunk ID ${candidate.chunk.id} has already been selected.`,
          estimatedTokens: candidate.estimatedTokens,
        });
        continue;
      }

      // Check near-duplicate redundancy against already selected chunks
      let isRedundant = false;
      for (const sel of selectedChunks) {
        if (sel.chunk.source.referenceId === candidate.chunk.source.referenceId) {
          const similarity = computeJaccardSimilarity(
            candidate.tokens,
            extractLexicalKeywords(sel.chunk.chunk.content),
          );
          if (similarity > 0.70) {
            isRedundant = true;
            rejectedChunks.push({
              chunk: candidate.chunk,
              score: candidate.score,
              reason: "redundant_near_duplicate",
              detail: `Chunk shares ${(similarity * 100).toFixed(1)}% lexical overlap with already-selected chunk from the same reference (${sel.chunk.id}).`,
              estimatedTokens: candidate.estimatedTokens,
            });
            break;
          }
        }
      }

      if (isRedundant) continue;

      // Check max chunks limit
      if (selectedChunks.length >= maxChunks) {
        rejectedChunks.push({
          chunk: candidate.chunk,
          score: candidate.score,
          reason: "exceeds_max_chunks",
          detail: `Maximum chunk limit of ${maxChunks} already reached.`,
          estimatedTokens: candidate.estimatedTokens,
        });
        continue;
      }

      // Check token budget limit
      if (currentTokensSpent + candidate.estimatedTokens > maxTokens) {
        rejectedChunks.push({
          chunk: candidate.chunk,
          score: candidate.score,
          reason: "exceeds_token_budget",
          detail: `Adding ${candidate.estimatedTokens} tokens would exceed budget of ${maxTokens} (current spent: ${currentTokensSpent}).`,
          estimatedTokens: candidate.estimatedTokens,
        });
        continue;
      }

      // Accept candidate!
      currentTokensSpent += candidate.estimatedTokens;
      selectedChunks.push({
        chunk: candidate.chunk,
        score: candidate.score,
        reasons: candidate.reasons,
        estimatedTokens: candidate.estimatedTokens,
        rank: selectedChunks.length + 1,
      });
    }

    return {
      slideIndex: slideQuery.slideIndex,
      selectedChunks,
      rejectedChunks,
      evaluatedCount: allChunks.length,
      totalSelectedTokens: currentTokensSpent,
      budgetLimitTokens: maxTokens,
      remainingTokens: maxTokens - currentTokensSpent,
    };
  }
}
