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
): string {
  if (!choices || choices.length === 0) {
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

  // Fallback to first choice
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
  };
}

// Regex patterns for placeholder choices
const PLACEHOLDER_CHOICE_REGEX =
  /^(?:گزینه\s*انحرافی|گزینه\s*(?:[1-4]|[\u06F1-\u06F4]|الف|ب|ج|د)|گزینه\s*تستی|پاسخ\s*نمونه|distractor|option\s*[a-d1-4]|placeholder|dummy|sample\s*choice)\b/iu;
const PLACEHOLDER_INNER_REGEX =
  /(?:گزینه\s*انحرافی(?:\s*(?:[1-4]|[\u06F1-\u06F4]|الف|ب|ج|د))?|انحرافی\s*(?:[1-4]|[\u06F1-\u06F4]|الف|ب|ج|د)|distractor\s*[1-4a-d])/iu;

// Regex patterns for forbidden lazy / omnibus choices
const FORBIDDEN_CHOICE_REGEX =
  /^(?:همه\s*(?:موارد|گزینه‌ها|ی\s*موارد)|هیچ[\s‌]*(?:کدام|یک)|تمام\s*موارد\s*فوق|موارد\s*(?:الف|ب|ج|د|[1-4]|[\u06F1-\u06F4])\s*و\s*(?:الف|ب|ج|د|[1-4]|[\u06F1-\u06F4])|all\s*of\s*the\s*above|none\s*of\s*the\s*above)$/iu;

/**
 * Validates deep distractor & question quality invariants:
 * 1. Structural Integrity (at least 2 distinct choices, non-empty, one matching correct answer).
 * 2. Placeholder Detection (rejects "گزینه انحرافی ۱", "Option A", "Placeholder", etc.).
 * 3. Forbidden Lazy Options (rejects "همه موارد", "هیچ‌کدام", "All of the above", etc.).
 * 4. Meaningful option length (rejects single punctuation or 1-character dummy options).
 * 5. Length Symmetry (flags extreme asymmetry where correct answer is heavily qualified while distractors are tiny stubs).
 * 6. Obvious Answer Leakage detection.
 */
export function validateQuestionQuality(
  question: QuestionOptionInput,
  options?: {
    maxDistractorLengthRatio?: number;
    requireFourChoices?: boolean;
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
    errors.push(`Multiple-choice questions must have exactly 4 choices (received ${cleanedChoices.length})`);
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
  const correctLength = correctChoiceText.length;
  const distractorLengths = cleanedChoices
    .filter((c) => c !== correctChoiceText)
    .map((c) => c.length);

  const avgDistractorLength =
    distractorLengths.length > 0
      ? distractorLengths.reduce((a, b) => a + b, 0) / distractorLengths.length
      : 0;

  // 4. Length Symmetry Signal:
  // Reject only if correct answer is overwhelmingly longer than all distractors combined (e.g. correct is 4.5x average distractors AND distractors are very short stubs)
  if (
    avgDistractorLength > 0 &&
    correctLength > 50 &&
    avgDistractorLength < 12 &&
    correctLength / avgDistractorLength > 4.5
  ) {
    errors.push(
      `Correct answer is disproportionately longer than distractors (${correctLength} chars vs avg ${Math.round(avgDistractorLength)} chars)`,
    );
  } else if (
    avgDistractorLength > 0 &&
    (correctLength / avgDistractorLength > 3.0 || avgDistractorLength / correctLength > 3.0)
  ) {
    warnings.push(
      `Noticeable length disparity between choices (ratio: ${(correctLength / avgDistractorLength).toFixed(1)})`,
    );
  }

  // 5. Obvious Clue Leakage: Check if question is very short and choice verbatim equals question
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
    },
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

/**
 * Evaluates whether a student's submitted answer matches the question's correct answer.
 * Handles:
 * - Direct string / JSON equality
 * - Letter selection (A, B, C, D / الف, ب, ج, د) resolved against question.choices
 * - Index selection (0, 1, 2, 3) resolved against question.choices
 */
export function isStudentAnswerCorrect(
  studentAnswer: unknown,
  question: { choices?: string[] | null; correctAnswer: unknown },
): boolean {
  if (studentAnswer === null || studentAnswer === undefined) {
    return false;
  }

  const correctVal = question.correctAnswer;
  if (correctVal === null || correctVal === undefined) {
    return false;
  }

  // 1. Exact string / JSON equality
  if (
    JSON.stringify(studentAnswer) === JSON.stringify(correctVal) ||
    String(studentAnswer).trim() === String(correctVal).trim()
  ) {
    return true;
  }

  // 2. If choices exist, check if studentAnswer is an index (0..3) or letter (A..D / الف..د)
  const choices = question.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const trimmedChoices = choices.map((c) => String(c).trim());
    const correctIdx = trimmedChoices.findIndex(
      (c) => c === String(correctVal).trim(),
    );

    if (correctIdx !== -1) {
      // Check numeric index
      if (
        studentAnswer === correctIdx ||
        String(studentAnswer).trim() === String(correctIdx)
      ) {
        return true;
      }

      // Check letter selection
      if (typeof studentAnswer === "string") {
        const studentNorm = studentAnswer.trim().toLowerCase();
        const letterMap: Record<string, number> = {
          a: 0,
          b: 1,
          c: 2,
          d: 3,
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

        if (letterMap[studentNorm] === correctIdx) {
          return true;
        }
      }
    }
  }

  return false;
}
