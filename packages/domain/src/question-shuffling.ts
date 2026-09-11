/**
 * Pure domain utilities for question option shuffling, answer key synchronization,
 * and invariant validation.
 *
 * Requirements:
 * 1. Shuffle happens at the single canonical point (materialize/save to Quiz/Exam).
 * 2. Position bias removal: correct answer randomly distributed across all choice positions.
 * 3. Invariant: exactly 4 distinct, non-empty choices; exactly one correct choice.
 * 4. Correct answer is synchronized after shuffle so answer key points to the exact correct option.
 * 5. Deterministic session replay: persisted in DB, unchanged on resume/refresh.
 */

export interface QuestionOptionInput {
  question?: string;
  choices?: string[] | null;
  correctAnswer?: unknown;
  explanation?: string | null;
  [key: string]: unknown;
}

export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Resolves a raw answer value (string, letter, index, or prefix) to the actual
 * string text of the matching option in the provided choices array.
 */
export function resolveCorrectChoiceText(
  choices: readonly string[],
  rawAnswer: unknown,
  options: { strict: true },
): string | null;
export function resolveCorrectChoiceText(
  choices: readonly string[],
  rawAnswer: unknown,
  options?: { strict?: false },
): string;
export function resolveCorrectChoiceText(
  choices: readonly string[],
  rawAnswer: unknown,
  options?: { strict?: boolean },
): string | null {
  if (!choices || choices.length === 0) {
    if (options?.strict) return null;
    return typeof rawAnswer === "string" ? rawAnswer : "گزینه ۱";
  }

  const cleanedChoices = choices.map((c) => String(c).trim());

  // 1. Exact string match
  if (typeof rawAnswer === "string") {
    const trimmedRaw = rawAnswer.trim();
    const exactIdx = cleanedChoices.indexOf(trimmedRaw);
    if (exactIdx !== -1) {
      return choices[exactIdx];
    }
  }

  // 2. Numeric index (0, 1, 2, 3 or "0", "1", "2", "3")
  if (typeof rawAnswer === "number" && Number.isInteger(rawAnswer)) {
    if (rawAnswer >= 0 && rawAnswer < choices.length) {
      return choices[rawAnswer];
    }
  }
  if (typeof rawAnswer === "string" && /^[0-3]$/.test(rawAnswer.trim())) {
    const idx = parseInt(rawAnswer.trim(), 10);
    if (idx >= 0 && idx < choices.length) {
      return choices[idx];
    }
  }

  // 3. Letter matching (A/B/C/D, a/b/c/d, الف/ب/ج/د, گزینه ۱..۴)
  if (typeof rawAnswer === "string") {
    const normalized = rawAnswer.trim().toLowerCase();

    // English letters
    if (normalized === "a" || normalized === "option a" || normalized === "option 1") {
      if (choices.length > 0) return choices[0];
    }
    if (normalized === "b" || normalized === "option b" || normalized === "option 2") {
      if (choices.length > 1) return choices[1];
    }
    if (normalized === "c" || normalized === "option c" || normalized === "option 3") {
      if (choices.length > 2) return choices[2];
    }
    if (normalized === "d" || normalized === "option d" || normalized === "option 4") {
      if (choices.length > 3) return choices[3];
    }

    // Persian letters / labels
    if (normalized === "الف" || normalized === "گزینه ۱" || normalized === "گزینه 1" || normalized === "گزینه اول") {
      if (choices.length > 0) return choices[0];
    }
    if (normalized === "ب" || normalized === "گزینه ۲" || normalized === "گزینه 2" || normalized === "گزینه دوم") {
      if (choices.length > 1) return choices[1];
    }
    if (normalized === "ج" || normalized === "گزینه ۳" || normalized === "گزینه 3" || normalized === "گزینه سوم") {
      if (choices.length > 2) return choices[2];
    }
    if (normalized === "د" || normalized === "گزینه ۴" || normalized === "گزینه 4" || normalized === "گزینه چهارم") {
      if (choices.length > 3) return choices[3];
    }

    // Prefix patterns like "A) Metoprolol", "1. Metoprolol", "الف) متوپرولول"
    const strippedPrefix = normalized.replace(/^(?:[a-d1-4]|الف|ب|ج|د)[\s).:\-–—]+\s*/iu, "").trim();
    if (strippedPrefix) {
      const matchIdx = cleanedChoices.findIndex(
        (c) => c.toLowerCase() === strippedPrefix || c.toLowerCase().includes(strippedPrefix) || strippedPrefix.includes(c.toLowerCase()),
      );
      if (matchIdx !== -1) {
        return choices[matchIdx];
      }
    }

    // Partial substring match
    const subIdx = cleanedChoices.findIndex(
      (c) => c.toLowerCase().includes(normalized) || normalized.includes(c.toLowerCase()),
    );
    if (subIdx !== -1) {
      return choices[subIdx];
    }
  }

  // Fallback to first choice (or null if strict mode enabled)
  if (options?.strict) {
    return null;
  }
  return choices[0];
}

/**
 * Pure Fisher-Yates shuffle algorithm.
 * Accepts an optional deterministic/seeded RNG function for testing.
 */
export function shuffleChoices<T>(
  items: readonly T[],
  rng: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * Validates the core question invariants:
 * - Exactly 4 choices (or >= 2 choices for generic multiple choice)
 * - All choices are non-empty strings
 * - Choices are distinct (no duplicate choices)
 * - Exactly one choice matches correctAnswer
 */
export function validateQuestionIntegrity(
  question: QuestionOptionInput,
): QuestionValidationResult {
  const errors: string[] = [];

  if (!question.question || typeof question.question !== "string" || !question.question.trim()) {
    errors.push("Question text is required");
  }

  const choices = question.choices;
  if (!Array.isArray(choices) || choices.length < 2) {
    errors.push("Question must have at least 2 choices");
  } else {
    // Check for empty / whitespace choices
    const hasEmpty = choices.some((c) => typeof c !== "string" || !c.trim());
    if (hasEmpty) {
      errors.push("All choices must be non-empty strings");
    }

    // Check for distinct choices
    const trimmedChoices = choices.map((c) => String(c).trim());
    const uniqueSet = new Set(trimmedChoices);
    if (uniqueSet.size !== trimmedChoices.length) {
      errors.push("All choices must be distinct");
    }

    // Check correctAnswer exists and matches exactly one choice
    const correctAnsStr = typeof question.correctAnswer === "string"
      ? question.correctAnswer.trim()
      : question.correctAnswer !== undefined && question.correctAnswer !== null
      ? String(question.correctAnswer).trim()
      : "";

    if (!correctAnsStr) {
      errors.push("Correct answer is required");
    } else {
      const matchCount = trimmedChoices.filter((c) => c === correctAnsStr).length;
      if (matchCount === 0) {
        errors.push(`Correct answer "${correctAnsStr}" is not among the choices`);
      } else if (matchCount > 1) {
        errors.push(`Correct answer matches multiple choices (${matchCount} matches)`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detailed length metrics for a multiple choice question.
 */
// ============================================================================
// Question Quality & Distractor Engineering Thresholds
// ============================================================================
export const LEAKAGE_THRESHOLDS = {
  /** Maximum allowable length ratio between correct answer and median distractor before flagging */
  MAX_LENGTH_RATIO: 2.2,
  /** Absolute character difference required to flag length disparity (prevents flagging 14 vs 18 chars) */
  MIN_SIGNIFICANT_CHAR_DIFF: 18,
  /** Absolute character gap above which any strict longest option is flagged if ratio > 1.8 */
  CRITICAL_CHAR_GAP: 25,
  /** Maximum word count ratio between correct answer and median distractor */
  MAX_WORD_COUNT_RATIO: 2.0,
  /** Minimum word count difference required to flag word count disparity */
  MIN_SIGNIFICANT_WORD_DIFF: 4,
  /** Median distractor length considered a 'brief stub' */
  STUB_DISTRACTOR_MAX_LEN: 15,
  /** Correct length considered 'detailed' when distractors are stubs */
  DETAILED_CORRECT_MIN_LEN: 40,
} as const;

/**
 * Detailed length metrics for a multiple choice question.
 */
export interface QuestionLengthMetrics {
  choiceCount: number;
  correctLength: number;
  distractorLengths: number[];
  medianDistractorLength: number;
  maxDistractorLength: number;
  minDistractorLength: number;
  absoluteLengthGap: number;
  lengthRatio: number;
  isCorrectStrictLongest: boolean;
  isCorrectTiedLongest: boolean;
  isCorrectShortest: boolean;
}

/**
 * Feature-based Answer Leakage / Clue Bias Report.
 * Compares correct option with distractors across 13 distinct feature dimensions.
 */
export interface AnswerLeakageReport {
  hasLeakage: boolean;
  leakageReasons: string[];
  features: {
    englishAsymmetry: boolean;
    parenthesesAsymmetry: boolean;
    abbreviationAsymmetry: boolean;
    synonymAsymmetry: boolean;
    scientificNameAsymmetry: boolean;
    explanatoryClauseAsymmetry: boolean;
    qualifierAsymmetry: boolean;
    exampleAsymmetry: boolean;
    punctuationAsymmetry: boolean;
    lengthAsymmetry: boolean;
    wordCountAsymmetry: boolean;
    technicalDensityAsymmetry: boolean;
  };
  metrics: {
    correctLength: number;
    medianDistractorLength: number;
    lengthRatio: number;
    correctWordCount: number;
    medianDistractorWordCount: number;
    wordCountRatio: number;
    correctEnglishCount: number;
    distractorsWithEnglishCount: number;
    correctParensCount: number;
    distractorsWithParensCount: number;
    correctAbbrevCount: number;
    distractorsWithAbbrevCount: number;
  };
}

/**
 * Information & Explanation Leakage analysis for backwards compatibility.
 */
export interface QuestionInformationLeakageAnalysis {
  hasInformationLeakage: boolean;
  correctHasExclusiveEnglish: boolean;
  correctHasExclusiveParenthetical: boolean;
  correctHasExclusiveAbbreviation: boolean;
  correctHasExclusiveExplanatoryMarker: boolean;
  reasons: string[];
}

/**
 * Quality validation result providing fine-grained diagnostics for question engineering.
 */
export interface QuestionQualityValidationResult extends QuestionValidationResult {
  warnings: string[];
  metrics?: {
    choiceCount: number;
    minLength: number;
    maxLength: number;
    lengthRatio: number;
    hasPlaceholders: boolean;
    hasForbiddenOmnibus: boolean;
    hasClueLeakage: boolean;
    lengthMetrics?: QuestionLengthMetrics;
    informationLeakage?: QuestionInformationLeakageAnalysis;
    leakageReport?: AnswerLeakageReport;
  };
}

/**
 * Result of attempting safe deterministic normalization / repair on a question.
 */
export interface QuestionNormalizationResult {
  repaired: boolean;
  canBeRepaired: boolean;
  question: QuestionOptionInput | null;
  normalized: QuestionOptionInput;
  repairedFields: string[];
  repairedCorrectAnswer?: string;
  reason?: string;
}

export type QuestionRepairResult = {
  repaired: boolean;
  question: QuestionOptionInput | null;
  repairedFields: string[];
  repairedCorrectAnswer?: string;
};

// Regex patterns for placeholder choices
const PLACEHOLDER_CHOICE_REGEX =
  /^(?:گزینه\s*انحرافی|گزینه\s*(?:[1-4]|[\u06F1-\u06F4]|الف|ب|ج|د)|گزینه\s*تستی|پاسخ\s*نمونه|distractor|option\s*[a-d1-4]|placeholder|dummy|sample\s*choice)\b/iu;
const PLACEHOLDER_INNER_REGEX =
  /(?:گزینه\s*انحرافی(?:\s*(?:[1-4]|[\u06F1-\u06F4]|الف|ب|ج|د))?|انحرافی\s*(?:[1-4]|[\u06F1-\u06F4]|الف|ب|ج|د)|distractor\s*[1-4a-d])/iu;

// Regex patterns for forbidden lazy / omnibus choices
const FORBIDDEN_CHOICE_REGEX =
  /^(?:(?:همه|تمام)(?:\s*ی)?\s*(?:موارد|گزینه‌ها)(?:\s*فوق)?(?:\s*صحیح\s*است)?|هیچ[\s‌]*(?:کدام|یک)(?:\s*از\s*(?:موارد|گزینه‌ها))?|(?:موارد|گزینه(?:\s*های?)?)\s*(?:الف|ب|ج|د|[1-4]|[\u06F1-\u06F4]|[\u0661-\u0664]|اول|دوم)\s*و\s*(?:الف|ب|ج|د|[1-4]|[\u06F1-\u06F4]|[\u0661-\u0664]|اول|دوم|سوم|چهارم)(?:\s*هر\s*دو)?|all\s*of\s*the\s*above|none\s*of\s*the\s*above)$/iu;

// Regex pattern for explanatory & justification markers in Persian options (using Unicode-safe word boundaries)
const EXPLANATORY_MARKER_REGEX =
  /(?:[،,;\-–—:\s]|^)(?:به دلیل|زیرا|چون|به علت|ناشی از|در نتیجه|که منجر به|به‌طوری‌که|به طوری که|به منظور|یعنی|به عبارت دیگر|از طریق)(?:[\s،,;\-–—:؛؟?!]|$|[()（）])/iu;

// Regex pattern for trailing explanatory tail (used for detection and safe repair)
const TRAILING_EXPLANATION_REGEX =
  /(?:[،,;\-–—:\s]+)(?:به دلیل|زیرا|چون|به علت|ناشی از|در نتیجه|که منجر به|به‌طوری‌که|به طوری که|به منظور|یعنی|به عبارت دیگر)[\s\S]*$/iu;

// Explanatory punctuation (dashes or colons with qualifying descriptions)
const EXPLANATORY_PUNCTUATION_REGEX =
  /(?:\s+[\-–—]\s+|\s*:\s*)[^\s]+/u;

// Synonym markers (e.g. "یا", "مترادف:", "همان", "نام دیگر", "/")
const SYNONYM_MARKER_REGEX =
  /(?:[()（）\s]|^)(?:یا|مترادف[:\s]|نام دیگر[:\s]|همان|موسوم به|\/)\s+[^\s]+/iu;

// Qualifier markers (e.g. "با اثر انتخابی", "دارای فعالیت ...", "با شروع اثر ...", "به عنوان داروی خط اول")
const QUALIFIER_MARKER_REGEX =
  /(?:با اثر|به صورت اختصاصی|به عنوان داروی خط اول|با شروع اثر|با نیمه‌عمر|دارای فعالیت|فاقد اثر|بدون ایجاد|به طور انتخابی|به طور اختصاصی)/iu;

// Example markers (e.g. "مانند ...", "نظیر ...", "از جمله ...")
const EXAMPLE_MARKER_REGEX =
  /(?:مانند|نظیر|از جمله|به عنوان مثال|e\.g\.|for example)\s+[^\s]+/iu;

// Latin / Scientific binomial name (e.g. "Ginkgo biloba", "Staphylococcus aureus", "Hypericum perforatum")
const SCIENTIFIC_LATIN_NAME_REGEX =
  /\b[A-Z][a-z]{2,}\s+[a-z]{3,}\b/;

// Acronym / Abbreviation (2+ uppercase letters/digits or standard acronym forms like ACE, CaSR, RANKL, cAMP, mRNA, COX-2, GFR, COPD, CCB, ARB, NSAID, Beta-1)
const ABBREVIATION_REGEX =
  /\b(?:[A-Z]{2,}|[A-Z][a-z0-9]*[A-Z][a-z0-9]*|[A-Z]+-[0-9]+)\b/;

// Helper to compute median of a number array
function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Helper to count words
function countWords(str: string): number {
  if (!str || !str.trim()) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calculates multi-signal length distribution metrics for a question's choices.
 */
export function calculateQuestionLengthMetrics(
  cleanedChoices: readonly string[],
  correctChoiceText: string,
): QuestionLengthMetrics {
  const correctLength = correctChoiceText.length;
  const distractorLengths = cleanedChoices
    .filter((c) => c !== correctChoiceText)
    .map((c) => c.length);

  const medianDistractorLength = computeMedian(distractorLengths);
  const maxDistractorLength = distractorLengths.length > 0 ? Math.max(...distractorLengths) : 0;
  const minDistractorLength = distractorLengths.length > 0 ? Math.min(...distractorLengths) : 0;
  const absoluteLengthGap = correctLength - medianDistractorLength;
  const lengthRatio =
    medianDistractorLength > 0 ? correctLength / medianDistractorLength : correctLength;

  const isCorrectStrictLongest = distractorLengths.length > 0 && correctLength > maxDistractorLength;
  const isCorrectTiedLongest =
    distractorLengths.length > 0 &&
    correctLength === maxDistractorLength &&
    cleanedChoices.filter((c) => c.length === correctLength).length > 1;
  const isCorrectShortest = distractorLengths.length > 0 && correctLength <= minDistractorLength;

  return {
    choiceCount: cleanedChoices.length,
    correctLength,
    distractorLengths,
    medianDistractorLength,
    maxDistractorLength,
    minDistractorLength,
    absoluteLengthGap,
    lengthRatio,
    isCorrectStrictLongest,
    isCorrectTiedLongest,
    isCorrectShortest,
  };
}

/**
 * Detects Answer Leakage / Clue Bias across 13 feature dimensions by comparing
 * the correct answer against the distractors of the same question.
 *
 * Invariant Guarantees:
 * 1. Feature presence alone is NOT penalized (e.g. English, parentheses, or acronyms in all options are valid).
 * 2. Asymmetric information uniquely favoring the correct answer is detected and flagged.
 * 3. Length bias is evaluated distinctly and combinatorially with explanatory/qualifier markers.
 */
export function detectAnswerLeakage(
  question: QuestionOptionInput,
): AnswerLeakageReport {
  const rawChoices = question.choices;
  const emptyReport: AnswerLeakageReport = {
    hasLeakage: false,
    leakageReasons: [],
    features: {
      englishAsymmetry: false,
      parenthesesAsymmetry: false,
      abbreviationAsymmetry: false,
      synonymAsymmetry: false,
      scientificNameAsymmetry: false,
      explanatoryClauseAsymmetry: false,
      qualifierAsymmetry: false,
      exampleAsymmetry: false,
      punctuationAsymmetry: false,
      lengthAsymmetry: false,
      wordCountAsymmetry: false,
      technicalDensityAsymmetry: false,
    },
    metrics: {
      correctLength: 0,
      medianDistractorLength: 0,
      lengthRatio: 1,
      correctWordCount: 0,
      medianDistractorWordCount: 0,
      wordCountRatio: 1,
      correctEnglishCount: 0,
      distractorsWithEnglishCount: 0,
      correctParensCount: 0,
      distractorsWithParensCount: 0,
      correctAbbrevCount: 0,
      distractorsWithAbbrevCount: 0,
    },
  };

  if (!Array.isArray(rawChoices) || rawChoices.length < 2) {
    return emptyReport;
  }

  const cleanedChoices = rawChoices.map((c) => String(c).trim()).filter(Boolean);
  if (cleanedChoices.length < 2) {
    return emptyReport;
  }

  const correctChoiceText = resolveCorrectChoiceText(
    cleanedChoices,
    question.correctAnswer,
    { strict: true },
  );

  if (!correctChoiceText) {
    return emptyReport;
  }

  const distractors = cleanedChoices.filter((c) => c !== correctChoiceText);
  if (distractors.length === 0) {
    return emptyReport;
  }

  const leakageReasons: string[] = [];

  // Helper feature tests
  const hasEnglish = (s: string) => /[a-zA-Z]{2,}/.test(s);
  const hasParenthetical = (s: string) => /[（(][^）)]+[）)]/.test(s);
  const hasAbbreviation = (s: string) => ABBREVIATION_REGEX.test(s);
  const hasSynonym = (s: string) => SYNONYM_MARKER_REGEX.test(s);
  const hasScientificName = (s: string) => SCIENTIFIC_LATIN_NAME_REGEX.test(s);
  const hasExplanatoryClause = (s: string) => EXPLANATORY_MARKER_REGEX.test(s);
  const hasQualifier = (s: string) => QUALIFIER_MARKER_REGEX.test(s);
  const hasExample = (s: string) => EXAMPLE_MARKER_REGEX.test(s);
  const hasPunctuation = (s: string) => EXPLANATORY_PUNCTUATION_REGEX.test(s);

  // 1. English text asymmetry
  const correctHasEnglish = hasEnglish(correctChoiceText);
  const distractorsWithEnglishCount = distractors.filter(hasEnglish).length;
  const englishAsymmetry = correctHasEnglish && distractorsWithEnglishCount === 0;
  if (englishAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely contains English terminology while distractors have none (Answer Leakage)",
    );
  }

  // 2. Parenthetical asymmetry
  const correctHasParenthetical = hasParenthetical(correctChoiceText);
  const distractorsWithParensCount = distractors.filter(hasParenthetical).length;
  const parenthesesAsymmetry = correctHasParenthetical && distractorsWithParensCount === 0;
  if (parenthesesAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely contains parenthetical annotations while distractors have none (Formatting Leakage)",
    );
  }

  // 3. Abbreviation / Acronym asymmetry
  const correctHasAbbrev = hasAbbreviation(correctChoiceText);
  const distractorsWithAbbrevCount = distractors.filter(hasAbbreviation).length;
  const abbreviationAsymmetry = correctHasAbbrev && distractorsWithAbbrevCount === 0 && !englishAsymmetry;
  if (abbreviationAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely contains an acronym/abbreviation while distractors have none (Abbreviation Leakage)",
    );
  }

  // 4. Synonym asymmetry
  const correctHasSynonym = hasSynonym(correctChoiceText);
  const distractorsWithSynonymCount = distractors.filter(hasSynonym).length;
  const synonymAsymmetry = correctHasSynonym && distractorsWithSynonymCount === 0;
  if (synonymAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely contains synonym / alias annotations while distractors have none (Synonym Leakage)",
    );
  }

  // 5. Scientific / Latin name asymmetry
  const correctHasSciName = hasScientificName(correctChoiceText);
  const distractorsWithSciNameCount = distractors.filter(hasScientificName).length;
  const scientificNameAsymmetry = correctHasSciName && distractorsWithSciNameCount === 0;
  if (scientificNameAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely contains a scientific / Latin binomial name while distractors have none (Terminology Leakage)",
    );
  }

  // 6. Explanatory clause asymmetry
  const correctHasExplClause = hasExplanatoryClause(correctChoiceText);
  const distractorsWithExplClauseCount = distractors.filter(hasExplanatoryClause).length;
  const explanatoryClauseAsymmetry = correctHasExplClause && distractorsWithExplClauseCount === 0;
  if (explanatoryClauseAsymmetry) {
    leakageReasons.push(
      "Correct choice contains explanatory/justification clauses (e.g. 'به دلیل / زیرا / ناشی از') while distractors do not",
    );
  }

  // 7. Qualifier asymmetry
  const correctHasQualifier = hasQualifier(correctChoiceText);
  const distractorsWithQualifierCount = distractors.filter(hasQualifier).length;
  const qualifierAsymmetry = correctHasQualifier && distractorsWithQualifierCount === 0;
  if (qualifierAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely contains descriptive clinical/pharmacological qualifiers while distractors do not",
    );
  }

  // 8. Example asymmetry
  const correctHasExample = hasExample(correctChoiceText);
  const distractorsWithExampleCount = distractors.filter(hasExample).length;
  const exampleAsymmetry = correctHasExample && distractorsWithExampleCount === 0;
  if (exampleAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely provides illustrative examples while distractors do not",
    );
  }

  // 9. Punctuation-based explanation asymmetry
  const correctHasPunctuation = hasPunctuation(correctChoiceText);
  const distractorsWithPunctuationCount = distractors.filter(hasPunctuation).length;
  const punctuationAsymmetry = correctHasPunctuation && distractorsWithPunctuationCount === 0 && !explanatoryClauseAsymmetry;
  if (punctuationAsymmetry) {
    leakageReasons.push(
      "Correct choice uniquely contains explanatory punctuation (dashes/colons) with additional details",
    );
  }

  // 10 & 11. Length & Word Count Asymmetry
  const lengthMetrics = calculateQuestionLengthMetrics(cleanedChoices, correctChoiceText);
  const correctWordCount = countWords(correctChoiceText);
  const distractorWordCounts = distractors.map(countWords);
  const medianDistractorWordCount = computeMedian(distractorWordCounts);
  const wordCountRatio =
    medianDistractorWordCount > 0 ? correctWordCount / medianDistractorWordCount : correctWordCount;

  let lengthAsymmetry = false;
  let wordCountAsymmetry = false;

  if (lengthMetrics.isCorrectStrictLongest) {
    // Condition A: Critical Gap & High Ratio
    if (
      lengthMetrics.absoluteLengthGap > LEAKAGE_THRESHOLDS.CRITICAL_CHAR_GAP &&
      lengthMetrics.lengthRatio > 1.8
    ) {
      lengthAsymmetry = true;
      leakageReasons.push(
        `Correct answer is conspicuously longer than distractors (${lengthMetrics.correctLength} chars vs median ${lengthMetrics.medianDistractorLength} chars, ratio: ${lengthMetrics.lengthRatio.toFixed(1)}x, gap: ${lengthMetrics.absoluteLengthGap} chars)`,
      );
    }
    // Condition B: Stubs vs Detailed
    else if (
      lengthMetrics.medianDistractorLength <= LEAKAGE_THRESHOLDS.STUB_DISTRACTOR_MAX_LEN &&
      lengthMetrics.correctLength >= LEAKAGE_THRESHOLDS.DETAILED_CORRECT_MIN_LEN &&
      lengthMetrics.lengthRatio > LEAKAGE_THRESHOLDS.MAX_LENGTH_RATIO
    ) {
      lengthAsymmetry = true;
      leakageReasons.push(
        `Distractors are brief stubs while correct answer is detailed (${lengthMetrics.correctLength} chars vs median ${lengthMetrics.medianDistractorLength} chars)`,
      );
    }
    // Condition C: Word count disparity
    else if (
      correctWordCount - medianDistractorWordCount >= LEAKAGE_THRESHOLDS.MIN_SIGNIFICANT_WORD_DIFF &&
      wordCountRatio >= LEAKAGE_THRESHOLDS.MAX_WORD_COUNT_RATIO &&
      correctWordCount >= 6
    ) {
      wordCountAsymmetry = true;
      leakageReasons.push(
        `Correct answer contains significantly more words than distractors (${correctWordCount} words vs median ${medianDistractorWordCount} words)`,
      );
    }
  }

  // 12. Technical density asymmetry
  const countTechTokens = (s: string) =>
    (s.match(/[A-Za-z0-9-]{3,}|[$][^$]+[$]/g) || []).length;
  const correctTechCount = countTechTokens(correctChoiceText);
  const distractorTechCounts = distractors.map(countTechTokens);
  const medianDistractorTechCount = computeMedian(distractorTechCounts);
  const technicalDensityAsymmetry =
    correctTechCount >= 3 && medianDistractorTechCount === 0 && !englishAsymmetry && !abbreviationAsymmetry;
  if (technicalDensityAsymmetry) {
    leakageReasons.push(
      "Correct choice has a significantly higher concentration of technical/chemical notation than distractors",
    );
  }

  const hasLeakage = leakageReasons.length > 0;

  return {
    hasLeakage,
    leakageReasons,
    features: {
      englishAsymmetry,
      parenthesesAsymmetry,
      abbreviationAsymmetry,
      synonymAsymmetry,
      scientificNameAsymmetry,
      explanatoryClauseAsymmetry,
      qualifierAsymmetry,
      exampleAsymmetry,
      punctuationAsymmetry,
      lengthAsymmetry,
      wordCountAsymmetry,
      technicalDensityAsymmetry,
    },
    metrics: {
      correctLength: lengthMetrics.correctLength,
      medianDistractorLength: lengthMetrics.medianDistractorLength,
      lengthRatio: lengthMetrics.lengthRatio,
      correctWordCount,
      medianDistractorWordCount,
      wordCountRatio,
      correctEnglishCount: correctHasEnglish ? 1 : 0,
      distractorsWithEnglishCount,
      correctParensCount: correctHasParenthetical ? 1 : 0,
      distractorsWithParensCount,
      correctAbbrevCount: correctHasAbbrev ? 1 : 0,
      distractorsWithAbbrevCount,
    },
  };
}

/**
 * Analyzes option-to-option Information Leakage (backwards-compatibility bridge).
 */
export function analyzeQuestionInformationLeakage(
  cleanedChoices: readonly string[],
  correctChoiceText: string,
): QuestionInformationLeakageAnalysis {
  const dummyQ = {
    choices: [...cleanedChoices],
    correctAnswer: correctChoiceText,
  };
  const report = detectAnswerLeakage(dummyQ);

  return {
    hasInformationLeakage: report.hasLeakage,
    correctHasExclusiveEnglish: report.features.englishAsymmetry,
    correctHasExclusiveParenthetical: report.features.parenthesesAsymmetry,
    correctHasExclusiveAbbreviation: report.features.abbreviationAsymmetry,
    correctHasExclusiveExplanatoryMarker: report.features.explanatoryClauseAsymmetry,
    reasons: report.leakageReasons,
  };
}

/**
 * Validates deep distractor & question quality invariants:
 * 1. Structural Integrity (at least 2 distinct choices, non-empty, one matching correct answer).
 * 2. Placeholder Detection (rejects "گزینه انحرافی ۱", "Option A", "Placeholder", etc.).
 * 3. Forbidden Lazy Options (rejects "همه موارد", "هیچ‌کدام", "All of the above", etc.).
 * 4. Meaningful option length (rejects single punctuation or 1-character dummy options).
 * 5. Multi-Signal Length Bias Detection (flags when correct answer is conspicuous via length/detail disparity).
 * 6. Information & Explanation Leakage Detection across 13 feature dimensions.
 * 7. Obvious Answer Leakage detection (stem verbatim identical to choice).
 */
export function validateQuestionQuality(
  question: QuestionOptionInput,
  options?: {
    maxDistractorLengthRatio?: number;
    requireFourChoices?: boolean;
    rejectAnswerLeakage?: boolean;
  },
): QuestionQualityValidationResult {
  const integrity = validateQuestionIntegrity(question);
  const errors = [...integrity.errors];
  const warnings: string[] = [];

  const choices = question.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  const cleanedChoices = choices.map((c) => String(c).trim());
  const lengths = cleanedChoices.map((c) => c.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const lengthRatio = minLength > 0 ? maxLength / minLength : maxLength;

  let hasPlaceholders = false;
  let hasForbiddenOmnibus = false;

  // 1. Require exactly 4 choices if specified
  if (options?.requireFourChoices && cleanedChoices.length !== 4) {
    errors.push(
      `Multiple-choice questions must have exactly 4 choices (received ${cleanedChoices.length})`,
    );
  }

  // 2. Check each choice for placeholders, forbidden omnibus, and minimum length
  for (let i = 0; i < cleanedChoices.length; i++) {
    const choiceText = cleanedChoices[i];

    if (choiceText.length < 2) {
      errors.push(`Choice "${choiceText}" is too short (minimum 2 characters required)`);
    }

    if (PLACEHOLDER_CHOICE_REGEX.test(choiceText) || PLACEHOLDER_INNER_REGEX.test(choiceText)) {
      hasPlaceholders = true;
      errors.push(`Choice "${choiceText}" contains prohibited placeholder text`);
    }

    if (FORBIDDEN_CHOICE_REGEX.test(choiceText)) {
      hasForbiddenOmnibus = true;
      errors.push(`Choice "${choiceText}" is a forbidden lazy option (e.g. "همه موارد" / "هیچ‌کدام")`);
    }
  }

  // 3. Resolve correct answer text
  const correctChoiceText = resolveCorrectChoiceText(
    cleanedChoices,
    question.correctAnswer,
  );

  // 4. Calculate multi-signal length metrics
  const lengthMetrics = calculateQuestionLengthMetrics(cleanedChoices, correctChoiceText);

  // 5. Calculate information & explanation leakage
  const leakageReport = detectAnswerLeakage(question);
  const informationLeakage = analyzeQuestionInformationLeakage(cleanedChoices, correctChoiceText);

  // Register leakage errors if rejectAnswerLeakage is not explicitly false
  const shouldRejectLeakage = options?.rejectAnswerLeakage !== false;
  if (leakageReport.hasLeakage) {
    for (const reason of leakageReport.leakageReasons) {
      if (shouldRejectLeakage) {
        errors.push(reason);
      } else {
        warnings.push(reason);
      }
    }
  }

  // 6. Additional length warning if disparity is noticeable but not fatal
  if (
    lengthMetrics.isCorrectStrictLongest &&
    !leakageReport.features.lengthAsymmetry &&
    (lengthMetrics.lengthRatio > 1.4 || lengthMetrics.absoluteLengthGap > 18)
  ) {
    warnings.push(
      `Noticeable length disparity between choices (ratio: ${lengthMetrics.lengthRatio.toFixed(1)}, gap: ${lengthMetrics.absoluteLengthGap} chars)`,
    );
  }

  // 7. Obvious Clue Leakage: Check if choice is verbatim identical to question
  let hasClueLeakage = false;
  if (question.question && typeof question.question === "string") {
    const qClean = question.question.trim().toLowerCase();
    if (cleanedChoices.some((c) => c.toLowerCase() === qClean)) {
      hasClueLeakage = true;
      errors.push("Choice is identical to the question text");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      choiceCount: cleanedChoices.length,
      minLength,
      maxLength,
      lengthRatio,
      hasPlaceholders,
      hasForbiddenOmnibus,
      hasClueLeakage,
      lengthMetrics,
      informationLeakage,
      leakageReport,
    },
  };
}

/**
 * Option Normalization and Balancing.
 *
 * Invariant 1: Scientific integrity has absolute priority.
 * Normalizes cosmetic/redundant formatting ONLY:
 * 1. Safe redundant English parenthetical removal (when distractors have NO English and the Persian term is self-contained).
 * 2. Safe redundant Persian explanatory parenthetical removal (when distractors have NO parentheticals).
 * 3. Safe trailing explanation removal («، زیرا...», «، به دلیل...»).
 *
 * Invariant: If removing an element would reduce scientific specificity or alter meaning (e.g. receptor subtype Beta-1),
 * it is NOT stripped; the question is marked as un-normalizable so it can be safely rejected/regenerated.
 */
export function normalizeQuestionOptions(
  question: QuestionOptionInput,
): QuestionNormalizationResult {
  const initialValidation = validateQuestionQuality(question, { requireFourChoices: true });
  if (initialValidation.valid) {
    return {
      repaired: false,
      canBeRepaired: true,
      question,
      normalized: { ...question },
      repairedFields: [],
    };
  }

  const rawChoices = question.choices;
  if (!Array.isArray(rawChoices) || rawChoices.length < 2) {
    return {
      repaired: false,
      canBeRepaired: false,
      question: null,
      normalized: { ...question },
      repairedFields: [],
      reason: "Invalid choices array",
    };
  }

  const cleanedChoices = rawChoices.map((c) => String(c).trim()).filter(Boolean);
  const correctChoiceText = resolveCorrectChoiceText(
    cleanedChoices,
    question.correctAnswer,
    { strict: true },
  );

  if (!correctChoiceText) {
    return {
      repaired: false,
      canBeRepaired: false,
      question: null,
      normalized: { ...question },
      repairedFields: [],
      reason: "Correct answer could not be strictly resolved",
    };
  }

  const distractors = cleanedChoices.filter((c) => c !== correctChoiceText);
  let candidateCorrectText = correctChoiceText;
  const repairedFields: string[] = [];

  // Step 1: Trailing Explanation Removal
  if (TRAILING_EXPLANATION_REGEX.test(candidateCorrectText)) {
    const trimmed = candidateCorrectText
      .replace(TRAILING_EXPLANATION_REGEX, "")
      .replace(/[،,;\-–—:\s]+$/, "")
      .trim();
    if (trimmed.length >= 2 && trimmed !== candidateCorrectText && !distractors.includes(trimmed)) {
      candidateCorrectText = trimmed;
      repairedFields.push("removed_trailing_explanation");
    }
  }

  // Step 2: Exclusive English Parenthetical Removal (when distractors have NO English)
  const distractorsHaveEnglish = distractors.some((d) => /[a-zA-Z]{2,}/.test(d));
  if (!distractorsHaveEnglish && /[（(][a-zA-Z0-9\s.,/\-+]+[）)]/.test(candidateCorrectText)) {
    // Check if stripping English loses the ONLY scientific entity (e.g. "گیرنده (Beta-1)" vs "پروپرانولول (Propranolol)")
    const persianBase = candidateCorrectText.replace(/\s*[（(][a-zA-Z0-9\s.,/\-+]+[）)]\s*/g, " ").trim();
    // If Persian base is a substantive term (>= 3 chars and not a bare generic noun)
    if (persianBase.length >= 3 && persianBase !== candidateCorrectText && !distractors.includes(persianBase)) {
      candidateCorrectText = persianBase;
      repairedFields.push("removed_exclusive_english_parenthetical");
    }
  }

  // Step 3: Exclusive Persian Explanatory Parenthetical Removal (when distractors have NO parentheticals)
  const distractorsHaveParenthetical = distractors.some((d) => /[（(][^）)]+[）)]/.test(d));
  if (!distractorsHaveParenthetical && /[（(][^）)]+[）)]/.test(candidateCorrectText)) {
    const persianBase = candidateCorrectText.replace(/\s*[（(][^）)]+[）)]\s*/g, " ").trim();
    if (persianBase.length >= 3 && persianBase !== candidateCorrectText && !distractors.includes(persianBase)) {
      candidateCorrectText = persianBase;
      repairedFields.push("removed_exclusive_parenthetical");
    }
  }

  // If any safe normalization was applied, construct candidate and re-validate
  if (repairedFields.length > 0 && candidateCorrectText !== correctChoiceText) {
    const candidateChoices = cleanedChoices.map((c) =>
      c === correctChoiceText ? candidateCorrectText : c,
    );

    const candidateQuestion: QuestionOptionInput = {
      ...question,
      choices: candidateChoices,
      correctAnswer: candidateCorrectText,
    };

    const revalidation = validateQuestionQuality(candidateQuestion, {
      requireFourChoices: true,
      rejectAnswerLeakage: true,
    });

    if (revalidation.valid) {
      return {
        repaired: true,
        canBeRepaired: true,
        question: candidateQuestion,
        normalized: candidateQuestion,
        repairedFields,
        repairedCorrectAnswer: candidateCorrectText,
      };
    }
  }

  // Could not safely repair without violating invariants -> trigger regeneration
  return {
    repaired: false,
    canBeRepaired: false,
    question: null,
    normalized: { ...question },
    repairedFields,
    reason: "Cannot safely normalize without risking scientific integrity; regeneration required",
  };
}

/**
 * Backwards compatibility alias for repairQuestionBias.
 */
export function repairQuestionBias(
  question: QuestionOptionInput,
): QuestionRepairResult {
  const norm = normalizeQuestionOptions(question);
  return {
    repaired: norm.repaired,
    question: norm.repaired ? norm.normalized : null,
    repairedFields: norm.repairedFields,
    repairedCorrectAnswer: norm.repairedCorrectAnswer,
  };
}

/**
 * Canonicalizer & Shuffler for multiple-choice questions.
 *
 * Performs:
 * 1. Identifies authoritative correct answer text independently of option position.
 * 2. Cleans & deduplicates choices if needed.
 * 3. Shuffles choices using Fisher-Yates algorithm.
 * 4. Re-synchronizes correctAnswer so it points directly to the correct choice in its new position.
 * 5. Enforces the exact-one-correct invariant.
 */
export function canonicalizeAndShuffleQuestion<T extends QuestionOptionInput>(
  question: T,
  rng: () => number = Math.random,
): T {
  const rawChoices = question.choices;

  if (!Array.isArray(rawChoices) || rawChoices.length <= 1) {
    return { ...question };
  }

  // 1. Clean choices strings
  const cleanedChoices = rawChoices.map((c) => String(c).trim()).filter(Boolean);

  // Fallback if not enough non-empty choices
  if (cleanedChoices.length <= 1) {
    return { ...question };
  }

  // 2. Resolve authoritative correct choice text BEFORE shuffling
  const correctChoiceText = resolveCorrectChoiceText(
    cleanedChoices,
    question.correctAnswer,
  );

  // 3. Ensure correctChoiceText is in choices
  let distinctChoices = Array.from(new Set(cleanedChoices));
  if (!distinctChoices.includes(correctChoiceText)) {
    distinctChoices[0] = correctChoiceText;
  }

  // If choices became fewer than 4 due to duplicates, keep original distinct or pad if needed
  if (distinctChoices.length < 2) {
    distinctChoices = cleanedChoices;
  }

  // 4. Shuffle choices array
  const shuffledChoices = shuffleChoices(distinctChoices, rng);

  // 5. Ensure correctAnswer is set to the exact authoritative string
  return {
    ...question,
    choices: shuffledChoices,
    correctAnswer: correctChoiceText,
  };
}

export type QuestionEvaluationStatus =
  | "correct"
  | "incorrect"
  | "unanswered"
  | "partial";

export interface QuestionEvaluationResult {
  status: QuestionEvaluationStatus;
  scoreRatio: number;
  selectedValues: string[];
  correctValues: string[];
}

const LETTER_INDEX_MAP: Record<string, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  "الف": 0,
  "ب": 1,
  "ج": 2,
  "د": 3,
  "گزینه ۱": 0,
  "گزینه 1": 0,
  "گزینه ۲": 1,
  "گزینه 2": 1,
  "گزینه ۳": 2,
  "گزینه 3": 2,
  "گزینه ۴": 3,
  "گزینه 4": 3,
};

function parseBooleanValue(val: unknown): boolean | null {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "true" || s === "درست" || s === "صحیح" || s === "yes" || s === "بله") return true;
    if (s === "false" || s === "نادرست" || s === "غلط" || s === "no" || s === "خیر") return false;
  }
  return null;
}

/**
 * Resolves a single answer token (text, numeric index, letter, or boolean)
 * to its authoritative choice string from the question's choices list.
 */
export function resolveChoiceText(
  value: unknown,
  choices?: string[] | null,
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const trimmedChoices = Array.isArray(choices)
    ? choices.map((c) => String(c).trim())
    : [];

  // 1. Check if value is boolean
  const boolVal = parseBooleanValue(value);
  if (boolVal !== null && trimmedChoices.length > 0) {
    for (const c of trimmedChoices) {
      if (parseBooleanValue(c) === boolVal) {
        return c;
      }
    }
  }

  // 2. Check if numeric index (e.g. 0, 1, 2 or "0", "1", "2")
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 0 && value < trimmedChoices.length) {
      return trimmedChoices[value];
    }
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d+$/.test(s)) {
      const idx = parseInt(s, 10);
      if (idx >= 0 && idx < trimmedChoices.length) {
        return trimmedChoices[idx];
      }
    }

    // 3. Check letter map (A..D, الف..د, گزینه ۱..۴)
    const norm = s.toLowerCase();
    if (norm in LETTER_INDEX_MAP) {
      const idx = LETTER_INDEX_MAP[norm];
      if (idx >= 0 && idx < trimmedChoices.length) {
        return trimmedChoices[idx];
      }
    }

    // 4. Check direct match in choices
    if (trimmedChoices.length > 0) {
      const found = trimmedChoices.find((c) => c === s || c.toLowerCase() === norm);
      if (found) return found;
    }

    return s;
  }

  return String(value).trim();
}

/**
 * Normalizes an answer input (which might be a scalar or an array) into a string array of choice texts.
 */
function normalizeAnswerTokens(
  rawAnswer: unknown,
  choices?: string[] | null,
): string[] {
  if (rawAnswer === null || rawAnswer === undefined || rawAnswer === "") {
    return [];
  }

  const rawList = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
  const results: string[] = [];

  for (const item of rawList) {
    const resolved = resolveChoiceText(item, choices);
    if (resolved && !results.includes(resolved)) {
      results.push(resolved);
    }
  }

  return results;
}

/**
 * Canonical source of truth for question evaluation across the AVANA platform.
 * Evaluates single-select, multi-select, and true/false deterministically.
 *
 * Statuses:
 * - correct: All required correct choices (and only them) were selected.
 * - partial: For multi-select, a subset of the correct choices was selected with no wrong choices.
 * - incorrect: A wrong choice was selected.
 * - unanswered: Student did not provide any answer.
 */
export function evaluateQuestionAnswer(
  studentAnswer: unknown,
  question: {
    choices?: string[] | null;
    correctAnswer?: unknown;
    questionType?: string;
  },
): QuestionEvaluationResult {
  const choices = question.choices;
  const isMultiSelect =
    question.questionType === "multi_select" ||
    Array.isArray(question.correctAnswer) ||
    (Array.isArray(studentAnswer) && studentAnswer.length > 1);

  const correctValues = normalizeAnswerTokens(question.correctAnswer, choices);
  const selectedValues = normalizeAnswerTokens(studentAnswer, choices);

  // 1. Unanswered check
  if (
    studentAnswer === null ||
    studentAnswer === undefined ||
    studentAnswer === "" ||
    selectedValues.length === 0
  ) {
    return {
      status: "unanswered",
      scoreRatio: 0,
      selectedValues: [],
      correctValues,
    };
  }

  // 2. True / False deterministic boolean comparison
  const studentBool = parseBooleanValue(studentAnswer);
  const correctBool = parseBooleanValue(question.correctAnswer);
  if (
    (question.questionType === "true_false" || (studentBool !== null && correctBool !== null)) &&
    studentBool !== null &&
    correctBool !== null
  ) {
    const isBoolCorrect = studentBool === correctBool;
    return {
      status: isBoolCorrect ? "correct" : "incorrect",
      scoreRatio: isBoolCorrect ? 1 : 0,
      selectedValues: [studentBool ? "درست" : "نادرست"],
      correctValues: [correctBool ? "درست" : "نادرست"],
    };
  }

  // 3. Multi-select evaluation
  if (isMultiSelect) {
    const correctSet = new Set(correctValues);

    const truePositives = selectedValues.filter((v) => correctSet.has(v));
    const falsePositives = selectedValues.filter((v) => !correctSet.has(v));

    if (falsePositives.length === 0 && truePositives.length === correctSet.size) {
      return {
        status: "correct",
        scoreRatio: 1,
        selectedValues,
        correctValues,
      };
    }

    if (falsePositives.length === 0 && truePositives.length > 0) {
      return {
        status: "partial",
        scoreRatio: Math.round((truePositives.length / Math.max(1, correctSet.size)) * 100) / 100,
        selectedValues,
        correctValues,
      };
    }

    return {
      status: "incorrect",
      scoreRatio: 0,
      selectedValues,
      correctValues,
    };
  }

  // 4. Single-choice evaluation
  const primarySelected = selectedValues[0];
  const primaryCorrect = correctValues[0];

  const isMatch =
    primarySelected === primaryCorrect ||
    JSON.stringify(studentAnswer) === JSON.stringify(question.correctAnswer) ||
    String(studentAnswer).trim() === String(question.correctAnswer).trim();

  return {
    status: isMatch ? "correct" : "incorrect",
    scoreRatio: isMatch ? 1 : 0,
    selectedValues,
    correctValues,
  };
}

/**
 * Evaluates whether a student's submitted answer matches the question's correct answer.
 * Delegates to canonical evaluateQuestionAnswer.
 */
export function isStudentAnswerCorrect(
  studentAnswer: unknown,
  question: { choices?: string[] | null; correctAnswer?: unknown; questionType?: string },
): boolean {
  return evaluateQuestionAnswer(studentAnswer, question).status === "correct";
}

/**
 * Normalizes question text for lexical duplicate detection.
 * Strips punctuation, multiple spaces, and normalizes casing.
 */
export function normalizeQuestionText(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[؟?.,!;:،؛()«»"'\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if two questions are duplicates or near-duplicates.
 * Uses exact match on normalized text and conservative Jaccard token similarity (default threshold: 0.75).
 * Only tokens with length >= 2 are considered to prevent noise from single-character tokens.
 */
export function isNearDuplicateQuestion(
  q1: string,
  q2: string,
  threshold = 0.75,
): boolean {
  const norm1 = normalizeQuestionText(q1);
  const norm2 = normalizeQuestionText(q2);

  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  const tokens1 = new Set(norm1.split(" ").filter((t) => t.length >= 2));
  const tokens2 = new Set(norm2.split(" ").filter((t) => t.length >= 2));

  if (tokens1.size === 0 || tokens2.size === 0) return false;

  let intersectionCount = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersectionCount++;
    }
  }

  const unionCount = tokens1.size + tokens2.size - intersectionCount;
  if (unionCount === 0) return false;

  const jaccard = intersectionCount / unionCount;
  return jaccard >= threshold;
}
