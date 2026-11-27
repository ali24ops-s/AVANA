/**
 * AVANA Pocket — Clinical Search Text Normalizer & Relevance Ranker (UI-4.1).
 *
 * Implements bidirectional normalization for Persian, Arabic, and English medical terms:
 * 1. Unifies Arabic Kaf (\u0643) to Persian Kaf (ک \u06a9).
 * 2. Unifies Arabic Yeh (\u064a) and Alef Maksura (\u0649) to Persian Yeh (ی \u06cc).
 * 3. Strips Arabic/Persian diacritics (harakat/aerab: fatha, damma, kasra, sukun, tashdid, tanwin).
 * 4. Strips Zero-Width Non-Joiner (ZWNJ \u200c) and invisible zero-width/bidi control characters.
 * 5. Collapses whitespace, trims, and lowercases English characters.
 * 6. Generates SQL TRANSLATE expression string for PostgreSQL queries.
 * 7. Computes deterministic relevance scores for stable search ranking.
 */

/**
 * Normalizes text for resilient bidirectional lexical matching.
 */
export function normalizeClinicalText(text: string | null | undefined): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    // Strip invisible zero-width and bidi characters (ZWNJ \u200c, ZWJ \u200d, ZWSP \u200b, LTR/RTL marks, BOM)
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u200b\u200c\u200d\u200e\u200f\ufeff]/gu, "")
    // Strip Arabic diacritics (Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun, Superscript Alef)
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // Unify Arabic Kaf to Persian Kaf
    .replace(/\u0643/g, "ک")
    // Unify Arabic Yeh and Alef Maksura to Persian Yeh
    .replace(/[\u064a\u0649]/g, "ی")
    // Normalize punctuation and non-alphanumeric separators to single space
    .replace(/[\s\t\r\n\-_/\\,;:()[\]{}'".،؛؟]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Escapes characters with special meaning in SQL LIKE expressions (%, _, and escape char !).
 */
export function escapeSqlLikePattern(str: string): string {
  if (!str) return "";
  return str.replace(/[!%_]/g, "!$&");
}

/**
 * Generates alternate match tokens (e.g. without ZWNJ, and with spaces instead of ZWNJ).
 */
export function tokenizeClinicalText(text: string): string[] {
  const norm = normalizeClinicalText(text);
  if (!norm) return [];
  const words = norm.split(" ").filter((w) => w.length > 0);
  return Array.from(new Set(words));
}

/**
 * Letters to map:
 * Arabic Kaf (\u0643) -> Persian Kaf (\u06A9)
 * Arabic Yeh (\u064A) -> Persian Yeh (\u06CC)
 * Alef Maksura (\u0649) -> Persian Yeh (\u06CC)
 */
export const PG_LETTER_FROM = "كيكى";
export const PG_LETTER_TO = "کیکی";

/**
 * Punctuation characters to map to space:
 * Exactly 22 characters: \t, \r, \n, -, _, /, \, ,, ;, :, (, ), [, ], {, }, ", ', ., ،, ؛, ؟
 */
export const PG_PUNCTUATION_FROM = "\t\r\n-_/\\,;:()[]{}\"'.،؛؟";
export const PG_PUNCTUATION_TO = " ".repeat(PG_PUNCTUATION_FROM.length); // Exactly 22 spaces

/**
 * Characters to delete (diacritics and zero-width/bidi markers):
 * Positioned beyond target length so PostgreSQL TRANSLATE removes them.
 */
export const PG_DELETION_CHARS = "ًٌٍَُِّْٰ\u200C\u200B\u200D\u200E\u200F\uFEFF";

export const PG_NORMALIZATION_FROM = PG_LETTER_FROM + PG_PUNCTUATION_FROM + PG_DELETION_CHARS;
export const PG_NORMALIZATION_TO = PG_LETTER_TO + PG_PUNCTUATION_TO;

/**
 * Calculates deterministic relevance score (10 to 100) for clinical search ranking.
 *
 * Scoring Hierarchy:
 * - 100: Exact title/name match (normalized)
 * - 90: Exact match in brand names or aliases
 * - 80: Title starts with query
 * - 75: Brand name or alias starts with query
 * - 70: A word in title starts with query
 * - 60: Title contains query as substring
 * - 50: Brand name or alias contains query as substring
 * - 40: Classification/Category contains query
 * - 20: Summary/Description contains query
 * - 10: General fallback match
 */
/**
 * Computes a normalized sort key for stable cross-environment collation.
 */
export function getNormalizedTitleSortKey(titleFa: string | null | undefined): string {
  return normalizeClinicalText(titleFa);
}

/**
 * Deterministic Unicode Code Point comparator matching PostgreSQL C collation on UTF-8.
 * Comparing UTF-8 byte streams is monotonically identical to comparing Unicode code points.
 */
export function compareUnicodeCodePoint(a: string, b: string): number {
  if (a === b) return 0;
  const cpA = Array.from(a).map((c) => c.codePointAt(0)!);
  const cpB = Array.from(b).map((c) => c.codePointAt(0)!);
  const minLen = Math.min(cpA.length, cpB.length);
  for (let i = 0; i < minLen; i++) {
    if (cpA[i] !== cpB[i]) {
      return cpA[i] < cpB[i] ? -1 : 1;
    }
  }
  return cpA.length < cpB.length ? -1 : 1;
}

/**
 * Calculates deterministic relevance score (0 to 100) for clinical search ranking.
 *
 * Scoring Hierarchy:
 * - 100: Exact title/name match (normalized)
 * - 90: Exact match in brand names or aliases
 * - 80: Title starts with query
 * - 75: Brand name or alias starts with query
 * - 70: A word in title starts with query
 * - 65: All tokens match within title (independent of word order)
 * - 60: Title contains full query as substring
 * - 50: Brand name or alias contains full query as substring
 * - 45: Cross-field match (at least one token in title, other tokens in secondary fields)
 * - 40: Classification contains query
 * - 35: All tokens match across secondary fields
 * - 20: Summary/Description contains query
 * - 0: Missing at least one required token (excluded from results)
 */
export function calculateClinicalRelevanceScore(params: {
  normalizedQuery: string;
  normalizedTitleFa: string;
  normalizedTitleEn: string;
  normalizedBrandNames?: string[];
  normalizedAliases?: string[];
  normalizedClassification?: string;
  normalizedSummary?: string;
}): { score: number; matchField: "name_fa" | "name_en" | "brand_name" | "alias" | "classification" | "summary"; matchedTerm: string } {
  const {
    normalizedQuery,
    normalizedTitleFa,
    normalizedTitleEn,
    normalizedBrandNames = [],
    normalizedAliases = [],
    normalizedClassification = "",
    normalizedSummary = "",
  } = params;

  if (!normalizedQuery) {
    return { score: 10, matchField: "name_fa", matchedTerm: "" };
  }

  const tokens = tokenizeClinicalText(normalizedQuery);
  if (tokens.length === 0) {
    return { score: 10, matchField: "name_fa", matchedTerm: "" };
  }

  // Multi-token conjunctive check: all tokens must be present across entity's searchable fields
  const allFields = [
    normalizedTitleFa,
    normalizedTitleEn,
    ...normalizedBrandNames,
    ...normalizedAliases,
    normalizedClassification,
    normalizedSummary,
  ];

  for (const token of tokens) {
    const matched = allFields.some((field) => field.includes(token));
    if (!matched) {
      return { score: 0, matchField: "name_fa", matchedTerm: "" };
    }
  }

  // 1. Exact match on title (Persian or English)
  if (normalizedTitleFa === normalizedQuery) {
    return { score: 100, matchField: "name_fa", matchedTerm: normalizedTitleFa };
  }
  if (normalizedTitleEn === normalizedQuery) {
    return { score: 100, matchField: "name_en", matchedTerm: normalizedTitleEn };
  }

  // 2. Exact match in brand names or aliases
  for (const brand of normalizedBrandNames) {
    if (brand === normalizedQuery) {
      return { score: 90, matchField: "brand_name", matchedTerm: brand };
    }
  }
  for (const alias of normalizedAliases) {
    if (alias === normalizedQuery) {
      return { score: 90, matchField: "alias", matchedTerm: alias };
    }
  }

  // 3. Title starts with query
  if (normalizedTitleFa.startsWith(normalizedQuery)) {
    return { score: 80, matchField: "name_fa", matchedTerm: normalizedTitleFa };
  }
  if (normalizedTitleEn.startsWith(normalizedQuery)) {
    return { score: 80, matchField: "name_en", matchedTerm: normalizedTitleEn };
  }

  // 4. Brand name or alias starts with query
  for (const brand of normalizedBrandNames) {
    if (brand.startsWith(normalizedQuery)) {
      return { score: 75, matchField: "brand_name", matchedTerm: brand };
    }
  }
  for (const alias of normalizedAliases) {
    if (alias.startsWith(normalizedQuery)) {
      return { score: 75, matchField: "alias", matchedTerm: alias };
    }
  }

  // 5. Word in title starts with query
  const wordsFa = normalizedTitleFa.split(" ");
  if (wordsFa.some((w) => w.startsWith(normalizedQuery))) {
    return { score: 70, matchField: "name_fa", matchedTerm: normalizedTitleFa };
  }
  const wordsEn = normalizedTitleEn.split(" ");
  if (wordsEn.some((w) => w.startsWith(normalizedQuery))) {
    return { score: 70, matchField: "name_en", matchedTerm: normalizedTitleEn };
  }

  // 6. All tokens in title (independent of word order)
  const allTokensInTitle = tokens.every(
    (t) => normalizedTitleFa.includes(t) || normalizedTitleEn.includes(t),
  );
  if (allTokensInTitle) {
    return {
      score: 65,
      matchField: normalizedTitleFa.includes(tokens[0]) ? "name_fa" : "name_en",
      matchedTerm: normalizedTitleFa || normalizedTitleEn,
    };
  }

  // 7. Title contains full query as substring
  if (normalizedTitleFa.includes(normalizedQuery)) {
    return { score: 60, matchField: "name_fa", matchedTerm: normalizedTitleFa };
  }
  if (normalizedTitleEn.includes(normalizedQuery)) {
    return { score: 60, matchField: "name_en", matchedTerm: normalizedTitleEn };
  }

  // 8. Brand name or alias contains full query as substring
  for (const brand of normalizedBrandNames) {
    if (brand.includes(normalizedQuery)) {
      return { score: 50, matchField: "brand_name", matchedTerm: brand };
    }
  }
  for (const alias of normalizedAliases) {
    if (alias.includes(normalizedQuery)) {
      return { score: 50, matchField: "alias", matchedTerm: alias };
    }
  }

  // 9. Cross-field: at least one token in title and other tokens in secondary fields
  const hasTokenInTitle = tokens.some(
    (t) => normalizedTitleFa.includes(t) || normalizedTitleEn.includes(t),
  );
  if (hasTokenInTitle) {
    return { score: 45, matchField: "name_fa", matchedTerm: normalizedTitleFa };
  }

  // 10. Classification contains query
  if (normalizedClassification && normalizedClassification.includes(normalizedQuery)) {
    return { score: 40, matchField: "classification", matchedTerm: normalizedClassification };
  }

  // 11. All tokens match across secondary fields (brand, alias, classification, summary)
  if (tokens.length > 1) {
    return {
      score: 35,
      matchField: normalizedBrandNames.length > 0 ? "brand_name" : "classification",
      matchedTerm: normalizedBrandNames[0] || normalizedAliases[0] || normalizedClassification,
    };
  }

  // 12. Summary contains query
  if (normalizedSummary && normalizedSummary.includes(normalizedQuery)) {
    return { score: 20, matchField: "summary", matchedTerm: normalizedSummary.slice(0, 80) };
  }

  return { score: 20, matchField: "name_fa", matchedTerm: normalizedTitleFa };
}
