/**
 * AVANA Exam Studio — Unified Question Quality, Anti-Cueing, Critic & Shuffle Engine.
 *
 * Shared across BOTH Studio AI generation paths:
 * 1. Multi-Chapter Exam Generation (`studio-exam-processor.ts` / `studio-exam-validator.ts`)
 * 2. Quick Topic AI Generation (`POST /v1/studio/ai/generate` in `studio-ai-service.ts`)
 *
 * Architecture:
 * - Reuses `@avana/domain` quality & shuffling primitives (`validateQuestionQuality`,
 *   `detectAnswerLeakage`, `normalizeQuestionOptions`, `canonicalizeAndShuffleQuestion`,
 *   `resolveCorrectChoiceText`) without duplicating core leakage logic.
 * - Adds Studio-specific deterministic checks (unbalanced absolute/certainty words,
 *   near-duplicate/overlapping options, grammatical/structural outlier detection).
 * - Provides a single-retry Gemini Quality Critic & Repair pass ONLY for suspicious/invalid items.
 * - Enforces atomic Fisher-Yates option shuffling and batch-level key position balancing.
 */

import {
  validateQuestionQuality,
  detectAnswerLeakage,
  normalizeQuestionOptions,
  canonicalizeAndShuffleQuestion,
  resolveCorrectChoiceText,
  shuffleChoices,
  type QuestionOptionInput,
  type QuestionQualityValidationResult,
  type AnswerLeakageReport,
  type OrganizationId,
  type DocumentId,
} from "@avana/domain";
import type { ModelGateway } from "../generation/gateway/types.js";
import { cleanAndParseJson } from "../generation/engine/resilient-json-parser.js";

// ---------------------------------------------------------------------------
// Shared Prompt Standards (Anti-Cueing, Plausible Distractors, Parity)
// ---------------------------------------------------------------------------

export const STUDIO_MCQ_QUALITY_RULES_PROMPT = [
  `MANDATORY UNIFIED 4-CHOICE DESIGN & ANSWER CUE NEUTRALITY STANDARD:`,
  `NEVER write a full explanatory correct answer first and then invent 3 short/weak distractors.`,
  `You MUST design all 4 choices together as ONE cohesive, cue-neutral set using this 5-step process:`,
  `1. Identify the exact scientific concept tested and define the single, unambiguous correct answer in its SHORTEST scientifically accurate, standalone form (no teaching prose inside the choice).`,
  `2. Lock a SHARED structural template and conceptual space for all 4 choices (e.g., same grammatical form, same proposition count, same specificity level, same receptor/enzyme/drug/PK/clinical axis).`,
  `3. Design 3 independent, scientifically plausible, definitively FALSE distractors from that SAME conceptual space, each targeting one real student error:`,
  `   - Common student misconception or parameter/lab misinterpretation`,
  `   - Confusing two closely related mechanisms, signaling pathways, or sites of action`,
  `   - Confusing two drugs, formulations, or drug classes (or indication vs adverse effect)`,
  `   - Reversing cause-and-effect or misgeneralizing a clinical finding`,
  `4. Verify every distractor is scientifically defensible at first glance (NEVER use absurd exaggerations like "بلوک کامل همه گیرنده‌ها", fabricated numbers, lay wording, or vague stubs) and that ONLY ONE choice is ever correct.`,
  `5. Perform an ANSWER CUE NEUTRALITY self-check across all 4 choices before outputting JSON: verify parity in length, scientific proposition count, information density, specificity, and grammatical structure — NEVER pad distractors with meaningless filler words and NEVER strip essential scientific identifiers (e.g. Beta-1, COX-2, B12, SGLT2, ACE, cAMP).`,
  ``,
  `A. CHOICE PURITY & ANSWER CUE NEUTRALITY (STRICTLY FORBIDDEN):`,
  `- Choices are NOT for teaching. Move ALL teaching details, drug examples, mechanisms, and clinical consequences into "explanation".`,
  `- NEVER include illustrative examples ("مانند...", "نظیر...", "از جمله...", "به عنوان مثال...", "مثلاً...") inside ANY choice (e.g. write "مهارکننده‌های SGLT2", NOT "مهارکننده‌های SGLT2 (مانند امپاگلیفلوزین و داپاگلیفلوزین)").`,
  `- NEVER include parenthetical clarifications, extra explanations, mechanisms, clinical outcomes, or justifications ("به دلیل...", "زیرا...", "از طریق...", "ناشی از...", "جهت...", "که باعث...", "که موجب...") in choices unless the stem explicitly asks for a mechanism and ALL 4 choices share the exact same parallel structure.`,
  `- NEVER include English translations or acronyms in choices unless they are inseparable scientific identifiers (e.g. SGLT2, Beta-1, COX-2) or used uniformly across ALL 4 comparable choices. Note: the English-in-parentheses rule in LANGUAGE_REQUIREMENT_PROMPT applies ONLY to "explanation" prose, NOT to MCQ choices.`,
  `- NEVER make the correct choice noticeably longer, more detailed, more specific, or higher in information density (more scientific propositions, clauses, or qualifiers joined by "و/یا", "به همراه", "ناشی از") than the distractors.`,
  `- NEVER use more specialized/technical vocabulary only in the correct choice while distractors use vague or lay wording.`,
  `- NEVER use an unbalanced grammatical structure (e.g., 1 full sentence vs 3 short noun phrases).`,
  `- NEVER use parentheses, dashes, colons, or abbreviations asymmetrically.`,
  `- NEVER use absolute/certainty or unrealistic exaggerated words ("همیشه", "هرگز", "فقط", "تنها", "منحصراً", "قطعاً", "مطلقاً", "همواره", "بلوک کامل همه", "۱۰۰ درصد") asymmetrically or to make a distractor trivially eliminable.`,
  `- NEVER use lazy omnibus options like "همه موارد", "هیچ‌کدام", "گزینه ۱ و ۲", or placeholder text.`,
  `- Priority order when balancing: (1) Scientific accuracy, (2) Semantic clarity, (3) Answer Cue Neutrality, (4) Natural parity. If balance is impossible without harming scientific accuracy, redesign or reject the question.`,
  ``,
  `B. CONCEPTUAL PROXIMITY, PLAUSIBILITY & SINGLE-KEY INVARIANT:`,
  `- All 4 choices MUST belong to the exact same conceptual space and detail level (if the key names a receptor + direction + tissue, all 3 distractors must also name a plausible receptor/target + direction + tissue).`,
  `- Generic, vague, or obviously eliminable distractors (e.g., "بدون تغییر", "اختلال عمومی", "کاهش اثر", "مورد خاص") are STRICTLY FORBIDDEN.`,
  `- Each distractor MUST be unambiguously false upon careful scientific inspection so that ONLY ONE choice can ever be defended as correct.`,
  `- Record the conceptual space in "conceptualSpace" and map each wrong choice in "distractorRationales" to the exact, scientifically defensible reason it is false (consistent with "explanation" and without fabricated facts).`,
  ``,
  `C. STRUCTURAL PARITY & EXPLANATION:`,
  `- All 4 choices MUST be parallel in phrase type, clause count, detail level, grammatical form, and terminology level.`,
  `- The "explanation" field MUST clearly explain in fluent Persian: (1) why the correct choice is right, AND (2) why each of the other 3 choices is wrong, grounded in the lesson/scientific source.`,
  `- Distribute the correct choice position across slots 1..4 without any predictable pattern.`,
].join("\n");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StudioQualityCandidate {
  questionIndex: number;
  question: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  difficulty?: string;
  topic?: string | null;
  questionType?: string;
  distractorRationales?: Record<string, string>;
}

export interface StudioQuestionQualityEvaluation {
  status: "pass" | "needs_critic";
  issues: string[];
  normalizedQuestion: StudioQualityCandidate;
  domainValidation: QuestionQualityValidationResult;
  leakageReport: AnswerLeakageReport;
  repairedByDeterministicNormalizer: boolean;
}

// ---------------------------------------------------------------------------
// Studio-Specific Deterministic Checks (Complementing @avana/domain)
// ---------------------------------------------------------------------------

const CONTRASTIVE_SCIENTIFIC_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["افزایش", "کاهش"],
  ["تحریک", "مهار"],
  ["برگشت‌پذیر", "برگشت‌ناپذیر"],
  ["برگشتپذیر", "برگشتناپذیر"],
  ["آگونیست", "آنتاگونیست"],
  ["مثبت", "منفی"],
  ["بیشتر", "کمتر"],
  ["بالا", "پایین"],
  ["صعودی", "نزولی"],
  ["اولیه", "ثانویه"],
  ["فعال", "غیرفعال"],
  ["داخلی", "خارجی"],
  ["کوتاه", "طولانی"],
];

function hasContrastiveScientificDifference(a: Set<string>, b: Set<string>): boolean {
  for (const [left, right] of CONTRASTIVE_SCIENTIFIC_PAIRS) {
    if ((a.has(left) && b.has(right)) || (a.has(right) && b.has(left))) {
      return true;
    }
  }
  return false;
}

function tokenizeForOverlap(text: string): Set<string> {
  const cleaned = text
    .toLowerCase()
    // Preserve ZWNJ (\u200c) inside Persian compound words like برگشت‌ناپذیر
    .replace(/[^\p{L}\p{N}\u200c\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return new Set(cleaned.split(" ").filter((t) => t.length >= 2));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) {
    if (b.has(tok)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

const GENERIC_VAGUE_DISTRACTOR_REGEX =
  /^(?:بدون تغییر|بدون اثر|بی‌تأثیر|بی تاثیر|تغییر نامشخص|اختلال عمومی|مورد خاص|سایر موارد|افزایش عوارض|کاهش اثر|افزایش اثر|کاهش عوارض|عدم تغییر|عدم اثر)(?:[.!؟]?)$/iu;

const UNREALISTIC_ABSURD_DISTRACTOR_REGEX =
  /(?:بلوک کامل همه|مهار کامل تمام|توقف کامل تمام|حذف ۱۰۰ درصد|حذف کامل همه|بدون هیچ[‌\s]?گونه اثر|در تمامی بیماران به[‌\s]?طور یکسان|همیشه در همه افراد)/iu;

function detectAdditionalStudioIssues(
  choices: readonly string[],
  correctChoiceText: string,
): string[] {
  const issues: string[] = [];
  const distractors = choices.filter((c) => c !== correctChoiceText);
  if (distractors.length === 0) return issues;

  // 1. Near-duplicate / high-overlap choices (ignores valid scientific contrasts)
  const tokenSets = choices.map((c) => tokenizeForOverlap(c));
  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      if (hasContrastiveScientificDifference(tokenSets[i], tokenSets[j])) {
        continue;
      }
      const sim = jaccardSimilarity(tokenSets[i], tokenSets[j]);
      if (sim >= 0.85 && Math.min(tokenSets[i].size, tokenSets[j].size) >= 4) {
        issues.push(
          `هم‌پوشانی یا شباهت بیش از حد بین دو گزینه: "${choices[i].slice(0, 30)}" و "${choices[j].slice(0, 30)}"`,
        );
        break;
      }
    }
  }

  // 2. Overly generic / vague or unrealistic absurd distractor phrases
  const correctWords = correctChoiceText.trim().split(/\s+/).filter(Boolean).length;
  const correctLen = correctChoiceText.length;
  if (correctWords >= 3 || correctLen >= 18) {
    const vagueDistractors = distractors.filter((d) => GENERIC_VAGUE_DISTRACTOR_REGEX.test(d.trim()));
    if (vagueDistractors.length > 0) {
      issues.push(
        `وجود گزینه انحرافی بیش‌ازحد عمومی یا مبهم (${vagueDistractors.join("، ")}) در کنار گزینه صحیح تخصصی`,
      );
    }
  }

  const absurdDistractors = distractors.filter((d) =>
    UNREALISTIC_ABSURD_DISTRACTOR_REGEX.test(d.trim()),
  );
  if (absurdDistractors.length > 0) {
    issues.push(
      `گزینه انحرافی غیرمنطقی یا مبالغه‌آمیز که به راحتی قابل حذف است (${absurdDistractors.join("، ")})`,
    );
  }

  // 3. Studio-specific symmetric severe length asymmetry check.
  //    Detects unnatural length outliers on EITHER side (bloated correct answer OR artificially padded/multi-part distractor)
  //    without using rank alone as a quality criterion and without rewriting choices.
  const distractorLens = distractors.map((d) => d.length).sort((a, b) => a - b);
  const medianDistractorLen = distractorLens[Math.floor(distractorLens.length / 2)] ?? 0;
  const maxDistractorLen = distractorLens[distractorLens.length - 1] ?? 0;
  const isStrictLongest = correctLen > maxDistractorLen;
  const gapFromMedian = correctLen - medianDistractorLen;
  const gapFromMax = correctLen - maxDistractorLen;
  const ratioToMax = maxDistractorLen > 0 ? correctLen / maxDistractorLen : 1;
  const ratioToMedian = medianDistractorLen > 0 ? correctLen / medianDistractorLen : 1;

  if (
    isStrictLongest &&
    ((gapFromMedian >= 35 && ratioToMax >= 1.2) || (gapFromMax >= 30 && ratioToMedian >= 1.4))
  ) {
    issues.push(
      `عدم تقارن شدید طول به نفع گزینه صحیح (${correctLen} کاراکتر در برابر میانه ${medianDistractorLen} و بلندترین گزینه غلط ${maxDistractorLen} کاراکتر؛ نسبت ${ratioToMax.toFixed(2)}x) — نیازمند بازتولید گزینه‌های هم‌سطح`,
    );
  }

  // Prevent reverse bias: detect an unnaturally bloated / multi-clause distractor outlier
  if (maxDistractorLen > correctLen) {
    const otherLens = choices
      .filter((_, idx) => idx !== choices.findIndex((c) => c.length === maxDistractorLen))
      .map((c) => c.length)
      .sort((a, b) => a - b);
    const medianOtherLen = otherLens[Math.floor(otherLens.length / 2)] ?? 0;
    const maxOtherLen = otherLens[otherLens.length - 1] ?? 0;
    const distractorGapFromMedian = maxDistractorLen - medianOtherLen;
    const distractorRatioToMedian = medianOtherLen > 0 ? maxDistractorLen / medianOtherLen : 1;
    const distractorRatioToSecond = maxOtherLen > 0 ? maxDistractorLen / maxOtherLen : 1;

    if (
      distractorGapFromMedian >= 45 &&
      distractorRatioToMedian >= 1.5 &&
      distractorRatioToSecond >= 1.35
    ) {
      issues.push(
        `عدم تقارن شدید و غیرطبیعی در طول یکی از گزینه‌های انحرافی (${maxDistractorLen} کاراکتر در برابر میانه سایر گزینه‌ها ${medianOtherLen} کاراکتر) — احتمال طولانی‌سازی مصنوعی یا چندبخشی بودن گزینه غلط`,
      );
    }
  }

  return issues;
}

const RATIONALE_SELF_CONTRADICTION_REGEX =
  /(?:این گزینه\s+(?:نیز\s+)?(?:صحیح|درست)\s+است|پاسخ صحیح است|هر دو گزینه صحیح|قابل اثبات نیست که غلط)/iu;

function validateDistractorRationales(
  distractors: readonly string[],
  rawRationales: Record<string, unknown>,
): { valid: boolean; normalized: Record<string, string>; error?: string } {
  const distractorSet = new Set(distractors);
  const normalized: Record<string, string> = {};

  for (const [rawKey, rawVal] of Object.entries(rawRationales)) {
    const trimmedKey = rawKey.trim();
    if (!distractorSet.has(trimmedKey) || trimmedKey in normalized) {
      return {
        valid: false,
        normalized: {},
        error: "دلایل گزینه‌های انحرافی (distractorRationales) با گزینه‌های غلط منطبق نیست",
      };
    }
    if (typeof rawVal !== "string") {
      return {
        valid: false,
        normalized: {},
        error: "دلیل علمی گزینه انحرافی نامعتبر است",
      };
    }
    const trimmedVal = rawVal.trim();
    if (trimmedVal.length < 5) {
      return {
        valid: false,
        normalized: {},
        error: "دلیل علمی نادرستی یکی از گزینه‌های انحرافی بیش از حد کوتاه است",
      };
    }
    if (RATIONALE_SELF_CONTRADICTION_REGEX.test(trimmedVal)) {
      return {
        valid: false,
        normalized: {},
        error: "دلیل علمی گزینه انحرافی با نادرست بودن آن در تناقض است (احتمال وجود چند پاسخ صحیح)",
      };
    }
    normalized[trimmedKey] = trimmedVal;
  }

  if (Object.keys(normalized).length !== distractors.length) {
    return {
      valid: false,
      normalized: {},
      error: "برای تمام گزینه‌های انحرافی دلیل علمی مشخص ثبت نشده است",
    };
  }

  const uniqueValues = new Set(distractors.map((d) => normalized[d].toLowerCase()));
  if (uniqueValues.size !== distractors.length) {
    return {
      valid: false,
      normalized: {},
      error: "دلایل علمی گزینه‌های انحرافی تکراری هستند",
    };
  }

  return { valid: true, normalized };
}

// ---------------------------------------------------------------------------
// Deterministic Quality Gate
// ---------------------------------------------------------------------------

/**
 * Evaluates a multiple-choice question using @avana/domain's quality & leakage engine
 * plus Studio-specific structural parity checks.
 * Attempts safe deterministic normalization (`normalizeQuestionOptions`) before flagging for Critic.
 */
export function evaluateStudioQuestionQuality(
  candidate: StudioQualityCandidate,
): StudioQuestionQualityEvaluation {
  let working: StudioQualityCandidate = {
    ...candidate,
    choices: candidate.choices.map((c) => c.trim()).filter(Boolean),
    correctAnswer: candidate.correctAnswer.trim(),
    explanation: candidate.explanation.trim(),
  };

  let domainInput: QuestionOptionInput = {
    question: working.question,
    choices: working.choices,
    correctAnswer: working.correctAnswer,
    explanation: working.explanation,
  };

  let domainValidation = validateQuestionQuality(domainInput, {
    requireFourChoices: true,
    rejectAnswerLeakage: true,
  });
  let repairedByDeterministicNormalizer = false;

  // Attempt safe deterministic normalization from @avana/domain if initial check failed
  if (!domainValidation.valid) {
    const norm = normalizeQuestionOptions(domainInput);
    if (norm.repaired && norm.canBeRepaired && norm.question) {
      const normChoices = Array.isArray(norm.question.choices)
        ? norm.question.choices.map((c) => String(c).trim())
        : working.choices;
      const normCorrect =
        typeof norm.question.correctAnswer === "string"
          ? norm.question.correctAnswer.trim()
          : working.correctAnswer;

      working = {
        ...working,
        question:
          typeof norm.question.question === "string"
            ? norm.question.question
            : working.question,
        explanation:
          typeof norm.question.explanation === "string"
            ? norm.question.explanation
            : working.explanation,
        choices: normChoices,
        correctAnswer: normCorrect,
      };
      domainInput = {
        question: working.question,
        choices: working.choices,
        correctAnswer: working.correctAnswer,
        explanation: working.explanation,
      };
      domainValidation = validateQuestionQuality(domainInput, {
        requireFourChoices: true,
        rejectAnswerLeakage: true,
      });
      repairedByDeterministicNormalizer = true;
    }
  }

  const leakageReport = detectAnswerLeakage(domainInput);
  const resolvedCorrect = resolveCorrectChoiceText(
    working.choices,
    working.correctAnswer,
    { strict: true },
  );

  const additionalIssues = resolvedCorrect
    ? detectAdditionalStudioIssues(working.choices, resolvedCorrect)
    : ["پاسخ صحیح به صورت قطعی با یکی از گزینه‌ها منطبق نیست"];

  // Non-blocking warnings from @avana/domain are kept in domainValidation.warnings
  // and must NOT cause rejection or trigger option rewriting.
  const allIssues = [
    ...domainValidation.errors,
    ...additionalIssues,
  ];

  return {
    status: allIssues.length === 0 ? "pass" : "needs_critic",
    issues: allIssues,
    normalizedQuestion: {
      ...working,
      correctAnswer: resolvedCorrect ?? working.correctAnswer,
    },
    domainValidation,
    leakageReport,
    repairedByDeterministicNormalizer,
  };
}

// ---------------------------------------------------------------------------
// Gemini Quality Critic & Repair (Max 1 Retry)
// ---------------------------------------------------------------------------

export interface CriticRepairItem {
  candidate: StudioQualityCandidate;
  issues: string[];
}

export interface CriticRepairContext {
  lessonMarkdown?: string;
  topic?: string;
  difficulty?: string;
  stage: string;
  organizationId: OrganizationId;
  documentId: DocumentId;
  correlationId: string;
  jobId?: string;
  signal?: AbortSignal;
}

export interface CriticRepairResult {
  repaired: StudioQualityCandidate[];
  rejectedIndices: number[];
  criticCalled: boolean;
}

export const STUDIO_CRITIC_SYSTEM_PROMPT = [
  "You are AVANA's Senior Psychometric & Medical Exam Quality Critic.",
  "Your job is to evaluate ALL 4 choices as a unified set and eliminate Answer Length Bias, Information Density Bias, and Explanation/Example/English Leakage from defective multiple-choice questions by:",
  "1) Condensing correctAnswer into its shortest scientifically exact, standalone form — removing unnecessary inline explanations, examples ('مانند...', 'از جمله...'), parenthetical clarifications, and redundant English translations, and moving those educational details into explanation while strictly preserving scientific meaning and all essential identifiers (e.g. SGLT2, Beta-1, COX-2, B12, ACE, cAMP),",
  "2) Rewriting/replacing distractors so all 4 choices form a cohesive, misconception-based set with matching proposition count, information density, specificity, and grammatical structure — NEVER padding distractors with filler words, and",
  "3) Rejecting ('rejected': true) any question that cannot be balanced without changing scientific meaning or dropping essential identifiers.",
  "The question stem is FIXED and IMMUTABLE — you must NEVER alter it.",
  "Return ONLY a valid JSON object matching the requested schema. No markdown fences or extra text.",
].join(" ");

const SCIENTIFIC_ID_TOKEN_REGEX =
  /[A-Za-z]+-\d+|\b[A-Za-z]*\d+[A-Za-z0-9-]*\b|\b[A-Z]{2,}(?:-[0-9A-Za-z]+)*\b/g;

/**
 * Verifies that a cleaned correctAnswer strictly preserves all scientific identifiers
 * and core Persian concept tokens of the original correctAnswer without lengthening or concept drift.
 */
function isSafeKeyCleaning(originalKey: string, cleanedKey: string): boolean {
  const orig = originalKey.trim();
  const cleaned = cleanedKey.trim();
  if (cleaned === orig) return true;
  if (cleaned.length < 3 || cleaned.length > orig.length) return false;

  // 1. Every scientific identifier (e.g. Beta-1, COX-2, B12, SGLT2, ACE, cAMP) must be preserved
  const origIds = orig.match(SCIENTIFIC_ID_TOKEN_REGEX) ?? [];
  for (const id of origIds) {
    if (!cleaned.includes(id)) {
      return false;
    }
  }

  // 2. Core Persian scientific tokens in cleanedKey must come from originalKey (>= 70% overlap)
  const extractPersianTokens = (s: string) =>
    (s.toLowerCase().match(/[\u0600-\u06FF\u200c]{3,}/g) ?? []).filter(
      (t) => !["است", "هست", "نیست", "می‌شود", "می‌کند", "دارد", "برای", "جهت", "زیرا"].includes(t),
    );

  const origTokens = new Set(extractPersianTokens(orig));
  const cleanedTokens = extractPersianTokens(cleaned);
  if (cleanedTokens.length === 0 && origTokens.size > 0) return false;
  if (cleanedTokens.length > 0) {
    const preserved = cleanedTokens.filter((t) => origTokens.has(t)).length;
    if (preserved / cleanedTokens.length < 0.7) {
      return false;
    }
  }

  return true;
}

/**
 * Sends ONLY suspicious/invalid questions to Gemini for a single Critic & Repair pass.
 * Re-validates every repaired question deterministically; questions that still fail are rejected.
 */
export async function criticAndRepairStudioQuestions(
  items: CriticRepairItem[],
  gateway: ModelGateway,
  context: CriticRepairContext,
): Promise<CriticRepairResult> {
  if (items.length === 0) {
    return { repaired: [], rejectedIndices: [], criticCalled: false };
  }

  const itemsPayload = items.map((item) => ({
    questionIndex: item.candidate.questionIndex,
    question: item.candidate.question,
    choices: item.candidate.choices,
    correctAnswer: item.candidate.correctAnswer,
    explanation: item.candidate.explanation,
    difficulty: item.candidate.difficulty ?? context.difficulty ?? "medium",
    topic: item.candidate.topic ?? context.topic ?? null,
    detectedIssues: item.issues,
  }));

  const groundTruthSection = context.lessonMarkdown
    ? [
        `SCIENTIFIC GROUND TRUTH (LESSON CONTENT):`,
        context.lessonMarkdown.slice(0, 12000),
      ].join("\n")
    : context.topic
      ? `TOPIC: ${context.topic}`
      : "";

  const userPrompt = [
    `TASK: AUDIT AND REPAIR ${items.length} MULTIPLE-CHOICE QUESTION(S) THAT FAILED QUALITY CHECKS.`,
    ``,
    STUDIO_MCQ_QUALITY_RULES_PROMPT,
    ``,
    `QUALITY CRITIC CHECKLIST (EVALUATE ALL 4 CHOICES AS A UNIFIED SET):`,
    `Verify ALL 7 criteria across the 4-choice set:`,
    `1. Choice Purity: NO choice contains unnecessary examples ("مانند...", "از جمله...", "به عنوان مثال..."), parenthetical clarifications, redundant English translations, or explanatory clauses ("که باعث...", "ناشی از...", "جهت...").`,
    `2. Information Density Parity: All 4 choices carry comparable scientific proposition count, mechanism depth, qualifiers, and specificity (not 3 propositions in key vs 1 short phrase in distractors).`,
    `3. Direct scientific relevance of every distractor to the question stem and topic.`,
    `4. Plausibility at first glance for a student with moderate knowledge (targets a real misconception).`,
    `5. Conceptual proximity to the correct answer (same receptor/enzyme/PK/clinical space).`,
    `6. Parity in length and grammatical structure — NEVER pad distractors with meaningless filler words.`,
    `7. Unambiguous single key: ONLY the correctAnswer is scientifically defensible.`,
    ``,
    `REPAIR RULES (CRITICAL — STRICTLY ENFORCED):`,
    `- The "question" stem is FIXED and IMMUTABLE. Do NOT modify or rewrite it.`,
    `- PRIORITY 1 (Clean bloated key first): If the original "correctAnswer" contains extra propositions, inline explanations, examples ("مانند..."), mechanisms not asked for, parentheticals, or redundant English translations, return a concise "cleanedCorrectAnswer" in its shortest scientifically accurate standalone form and move ALL removed educational details/examples into "explanation". You MUST preserve the exact scientific meaning and all essential identifiers (e.g. Beta-1, COX-2, B12, SGLT2, ACE, cAMP). If "correctAnswer" is already clean, omit "cleanedCorrectAnswer" or return it unchanged.`,
    `- PRIORITY 2 (Align distractors naturally): Return 3 scientifically grounded, misconception-based "distractors" that match the conceptual space, proposition count, length, detail level, and grammatical structure of the (cleaned) correctAnswer. NEVER artificially lengthen or pad distractors just to match a bloated key.`,
    `- PRIORITY 3 (Reject when unsafe): If the original "correctAnswer" is scientifically incompatible with the source content, OR if shortening/cleaning it would alter scientific meaning or drop an essential identifier, OR if 3 balanced unambiguous distractors cannot be constructed, set "rejected": true.`,
    ``,
    groundTruthSection,
    ``,
    `QUESTIONS TO REPAIR:`,
    JSON.stringify(itemsPayload, null, 2),
    ``,
    `MANDATORY JSON OUTPUT FORMAT (DO NOT include "question"):`,
    `{`,
    `  "questions": [`,
    `    {`,
    `      "questionIndex": number,`,
    `      "rejected": false,`,
    `      "cleanedCorrectAnswer": "(اختیاری) نسخه پاکسازی‌شده گزینه صحیح بدون توضیح اضافه یا ترجمه انگلیسی غیرضروری...",`,
    `      "distractors": ["گزینه غلط ۱", "گزینه غلط ۲", "گزینه غلط ۳"],`,
    `      "distractorRationales": {`,
    `        "گزینه غلط ۱": "دلیل علمی سوءبرداشت دانشجو...",`,
    `        "گزینه غلط ۲": "دلیل علمی سوءبرداشت دانشجو...",`,
    `        "گزینه غلط ۳": "دلیل علمی سوءبرداشت دانشجو..."`,
    `      },`,
    `      "explanation": "توضیح کامل شامل نکات آموزشی منتقل‌شده از گزینه، دلیل درستی پاسخ صحیح و نادرستی تک‌تک گزینه‌های دیگر..."`,
    `    }`,
    `  ]`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await gateway.complete({
    promptVersion: "studio_exam_critic_v1",
    messages: [
      { role: "system", content: STUDIO_CRITIC_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 4000,
    correlationId: `${context.correlationId}_critic`,
    jobId: context.jobId,
    organizationId: context.organizationId,
    documentId: context.documentId,
    stage: `${context.stage}_critic`,
    signal: context.signal,
  });

  const parsed = cleanAndParseJson<{ questions?: unknown }>(completion.text, "quiz");
  const rawRepaired = Array.isArray(parsed?.questions) ? parsed.questions : [];

  const originalByIndex = new Map(items.map((i) => [i.candidate.questionIndex, i.candidate]));
  const repairedByIndex = new Map<number, StudioQualityCandidate>();

  for (const raw of rawRepaired) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Record<string, unknown>;
    const idx = Number(q.questionIndex);
    const original = originalByIndex.get(idx);
    if (!Number.isInteger(idx) || !original || repairedByIndex.has(idx)) {
      continue;
    }

    // Explicit rejection by Critic (e.g. incompatible key with ground truth or impossible to build 3 valid distractors)
    if (q.rejected === true) {
      continue;
    }

    // Strictly require 3 non-empty distractors; ignore any `question` or `correctAnswer` fields from Critic
    const rawDistractors = Array.isArray(q.distractors)
      ? q.distractors
          .map((d) => {
            if (typeof d === "string") return d.trim();
            if (typeof d === "object" && d !== null && "text" in d) {
              return String((d as { text: unknown }).text ?? "").trim();
            }
            return String(d ?? "").trim();
          })
          .filter(Boolean)
      : [];

    if (rawDistractors.length !== 3) continue;

    // Allow safe key cleaning ONLY via `cleanedCorrectAnswer` (ignore `question` and `correctAnswer` fields)
    const lockedQuestion = original.question;
    const rawCleanedKey =
      typeof q.cleanedCorrectAnswer === "string" && q.cleanedCorrectAnswer.trim().length > 0
        ? q.cleanedCorrectAnswer.trim()
        : original.correctAnswer;

    if (!isSafeKeyCleaning(original.correctAnswer, rawCleanedKey)) {
      continue;
    }
    const targetCorrectAnswer = rawCleanedKey;

    const uniqueChoiceSet = new Set([
      targetCorrectAnswer.toLowerCase(),
      ...rawDistractors.map((d) => d.toLowerCase()),
    ]);
    if (uniqueChoiceSet.size !== 4) continue;

    const explanationRaw = typeof q.explanation === "string" ? q.explanation.trim() : "";
    const explanation = explanationRaw.length >= 5 ? explanationRaw : original.explanation;
    if (explanation.length < 5) continue;

    const rawRationales =
      q.distractorRationales &&
      typeof q.distractorRationales === "object" &&
      !Array.isArray(q.distractorRationales)
        ? (q.distractorRationales as Record<string, unknown>)
        : null;
    if (!rawRationales) continue;

    const candidate: StudioQualityCandidate = {
      questionIndex: idx,
      question: lockedQuestion,
      choices: [targetCorrectAnswer, ...rawDistractors],
      correctAnswer: targetCorrectAnswer,
      explanation,
      difficulty: original.difficulty,
      topic: original.topic ?? null,
      questionType: "multiple_choice",
    };

    // Strict re-validation after single Critic & Repair pass, ensuring locked stem & safe key remain intact
    const recheck = evaluateStudioQuestionQuality(candidate);
    if (
      recheck.status !== "pass" ||
      recheck.normalizedQuestion.question !== lockedQuestion ||
      !isSafeKeyCleaning(original.correctAnswer, recheck.normalizedQuestion.correctAnswer)
    ) {
      continue;
    }

    // Enforce 1-to-1 independent, non-empty (>= 5 chars), non-duplicate rationale for each final distractor
    const finalKey = recheck.normalizedQuestion.correctAnswer;
    const finalDistractors = recheck.normalizedQuestion.choices.filter(
      (c) => c !== finalKey,
    );
    if (finalDistractors.length !== 3) continue;

    const rationaleCheck = validateDistractorRationales(finalDistractors, rawRationales);
    if (!rationaleCheck.valid) {
      continue;
    }

    repairedByIndex.set(idx, {
      ...recheck.normalizedQuestion,
      distractorRationales: rationaleCheck.normalized,
    });
  }

  const repaired: StudioQualityCandidate[] = [];
  const rejectedIndices: number[] = [];

  for (const item of items) {
    const idx = item.candidate.questionIndex;
    const fixed = repairedByIndex.get(idx);
    if (fixed) {
      repaired.push(fixed);
    } else {
      rejectedIndices.push(idx);
    }
  }

  return { repaired, rejectedIndices, criticCalled: true };
}

// ---------------------------------------------------------------------------
// Phase 2: Blind Option Evaluation, Independent Explanation Audit & Pipeline
// ---------------------------------------------------------------------------

export const SEMANTIC_AUDIT_CHUNK_SIZE = 5;

export type BlindVerdictStatus = "correct" | "incorrect" | "ambiguous";

export interface BlindChoiceVerdict {
  choice: string;
  status: BlindVerdictStatus;
  reason: string;
}

export interface BlindEvaluationItemResult {
  questionIndex: number;
  outcome: "passed_key_match" | "semantic_failed" | "contract_error";
  verdicts: BlindChoiceVerdict[];
  blindCorrectChoice: string | null;
  correctCount: number;
  incorrectCount: number;
  ambiguousCount: number;
  issues: string[];
}

export interface ExplanationAuditItemResult {
  questionIndex: number;
  outcome: "passed" | "semantic_failed" | "contract_error";
  explanationScientificallyCorrect: boolean;
  consistentWithContext: boolean;
  consistentWithBlindKey: boolean;
  allDistractorRationalesDefensible: boolean;
  issues: string[];
}

export interface StudioSemanticPipelineResult {
  accepted: StudioQualityCandidate[];
  rejectedIndices: number[];
  auditCalled: boolean;
  criticCalled: boolean;
}

export const BLIND_OPTION_EVALUATION_SYSTEM_PROMPT = [
  "You are AVANA's Independent Medical & Academic Blind Option Evaluator.",
  "You are given ONLY a question stem, 4 shuffled options with opaque temporary IDs (e.g. c1..c4), and optional lesson/topic context.",
  "You are NOT given any Answer Key or Explanation — evaluate each option independently from first principles.",
  "For EACH option, assign exactly one status:",
  "- 'correct': scientifically accurate and fully answers the question stem.",
  "- 'incorrect': scientifically false or does not answer the question stem.",
  "- 'ambiguous': partially true, unclear, or depends on unstated assumptions in the stem.",
  "Return ONLY valid JSON matching the schema. No markdown fences or extra text.",
].join(" ");

export const EXPLANATION_AUDIT_SYSTEM_PROMPT = [
  "You are AVANA's Independent Medical & Educational Explanation Auditor.",
  "You are given a question, its 4 options, the verified Blind Correct Choice, the Explanation, and optional Distractor Rationales.",
  "Verify scientifically:",
  "1) Whether the explanation is scientifically accurate and sufficiently reasoned.",
  "2) Whether it is consistent with the provided context (lesson text if provided, or topic/scientific knowledge).",
  "3) Whether it is consistent with the verified Blind Correct Choice.",
  "4) Whether every distractor rationale (or explanation of wrong options) is scientifically defensible and non-contradictory.",
  "Return ONLY valid JSON matching the schema. No markdown fences or extra text.",
].join(" ");

function chunkItems<T>(items: readonly T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function validateStrictQuestionIndexMap(
  rawQuestions: readonly unknown[],
  expectedIndices: ReadonlySet<number>,
): { ok: true; map: Map<number, Record<string, unknown>> } | { ok: false; reason: string } {
  const map = new Map<number, Record<string, unknown>>();
  for (const entry of rawQuestions) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, reason: "عنصر نامعتبر در آرایه سؤالات Audit (Fail-Closed)" };
    }
    const obj = entry as Record<string, unknown>;
    const qIdx = Number(obj.questionIndex);
    if (!Number.isInteger(qIdx)) {
      return { ok: false, reason: "شناسه سؤال (questionIndex) نامعتبر در خروجی Audit (Fail-Closed)" };
    }
    if (!expectedIndices.has(qIdx)) {
      return {
        ok: false,
        reason: `شناسه سؤال ناشناخته (${qIdx}) در خروجی Audit — رد کامل پاسخ فراخوانی (Fail-Closed)`,
      };
    }
    if (map.has(qIdx)) {
      return {
        ok: false,
        reason: `شناسه سؤال تکراری (${qIdx}) در خروجی Audit — رد کامل پاسخ فراخوانی (Fail-Closed)`,
      };
    }
    map.set(qIdx, obj);
  }

  if (map.size !== expectedIndices.size) {
    return {
      ok: false,
      reason: "خروجی Audit ناقص است و یک یا چند سؤال ارسالی مفقود هستند — رد کامل پاسخ فراخوانی (Fail-Closed)",
    };
  }

  return { ok: true, map };
}

/**
 * Step A: Blind Option Evaluation (max 5 questions per Gemini call).
 * Strictly strips correctAnswer, explanation, distractorRationales, and detectedIssues.
 * Shuffles choices and assigns opaque server-side temporary IDs (c1..c4) before sending.
 * Infrastructure errors (Gemini failure, timeout, invalid JSON) propagate immediately (Fail-Closed).
 */
export async function blindEvaluateOptions(
  candidates: readonly StudioQualityCandidate[],
  gateway: ModelGateway,
  context: CriticRepairContext,
  rng: () => number = Math.random,
): Promise<Map<number, BlindEvaluationItemResult>> {
  const results = new Map<number, BlindEvaluationItemResult>();
  if (candidates.length === 0) return results;

  const contextSection = context.lessonMarkdown
    ? `SCIENTIFIC GROUND TRUTH (LESSON CONTENT):\n${context.lessonMarkdown.slice(0, 12000)}`
    : `TOPIC: ${context.topic ?? "عمومی"} (توجه: متن منبع درسی در اختیار نیست؛ ارزیابی را صرفاً بر پایه موضوع و دانش علمی معتبر انجام بده و ادعای تطبیق با متن درس نداشته باش.)`;

  const chunks = chunkItems(candidates, SEMANTIC_AUDIT_CHUNK_SIZE);

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const idMapByQuestion = new Map<number, Map<string, string>>();

    const blindPayload = chunk.map((c) => {
      const shuffled = shuffleChoices(c.choices, rng);
      const idMap = new Map<string, string>();
      const taggedChoices = shuffled.map((text, idx) => {
        const tempId = `c${idx + 1}`;
        idMap.set(tempId, text);
        return { id: tempId, text };
      });
      idMapByQuestion.set(c.questionIndex, idMap);

      return {
        questionIndex: c.questionIndex,
        question: c.question,
        choices: taggedChoices,
      };
    });

    const userPrompt = [
      `TASK: INDEPENDENTLY EVALUATE ALL 4 OPTIONS FOR ${chunk.length} MULTIPLE-CHOICE QUESTION(S).`,
      ``,
      contextSection,
      ``,
      `QUESTIONS (BLIND — NO ANSWER KEY PROVIDED):`,
      JSON.stringify(blindPayload, null, 2),
      ``,
      `MANDATORY JSON OUTPUT FORMAT:`,
      `{`,
      `  "questions": [`,
      `    {`,
      `      "questionIndex": number,`,
      `      "verdicts": [`,
      `        { "choiceId": "c1", "status": "correct" | "incorrect" | "ambiguous", "reason": "دلیل علمی..." }`,
      `      ]`,
      `    }`,
      `  ]`,
      `}`,
    ].join("\n");

    const completion = await gateway.complete({
      promptVersion: "studio_blind_option_eval_v1",
      messages: [
        { role: "system", content: BLIND_OPTION_EVALUATION_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      maxTokens: 4000,
      correlationId: `${context.correlationId}_blind_eval_${chunkIdx + 1}`,
      jobId: context.jobId,
      organizationId: context.organizationId,
      documentId: context.documentId,
      stage: `${context.stage}_blind_eval`,
      signal: context.signal,
    });

    const parsed = cleanAndParseJson<{ questions?: unknown }>(completion.text, "quiz");
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.questions)) {
      throw new Error("Blind Option Evaluation returned invalid JSON structure (missing questions array)");
    }

    const expectedIndices = new Set(chunk.map((c) => c.questionIndex));
    const indexCheck = validateStrictQuestionIndexMap(parsed.questions, expectedIndices);
    if (!indexCheck.ok) {
      for (const candidate of chunk) {
        results.set(candidate.questionIndex, {
          questionIndex: candidate.questionIndex,
          outcome: "contract_error",
          verdicts: [],
          blindCorrectChoice: null,
          correctCount: 0,
          incorrectCount: 0,
          ambiguousCount: 0,
          issues: [indexCheck.reason],
        });
      }
      continue;
    }
    const rawByIndex = indexCheck.map;

    for (const candidate of chunk) {
      const qIdx = candidate.questionIndex;
      const idMap = idMapByQuestion.get(qIdx)!;
      const raw = rawByIndex.get(qIdx);

      if (!raw || !Array.isArray(raw.verdicts) || raw.verdicts.length !== 4) {
        results.set(qIdx, {
          questionIndex: qIdx,
          outcome: "contract_error",
          verdicts: [],
          blindCorrectChoice: null,
          correctCount: 0,
          incorrectCount: 0,
          ambiguousCount: 0,
          issues: ["خروجی Blind Option Evaluation ناقص است یا تعداد Verdictها ۴ نیست (Fail-Closed)"],
        });
        continue;
      }

      const seenIds = new Set<string>();
      const mappedVerdicts: BlindChoiceVerdict[] = [];
      let hasContractError = false;

      for (const v of raw.verdicts) {
        if (!v || typeof v !== "object") {
          hasContractError = true;
          break;
        }
        const vObj = v as Record<string, unknown>;
        const cid = typeof vObj.choiceId === "string" ? vObj.choiceId.trim() : "";
        const status = typeof vObj.status === "string" ? vObj.status.trim() : "";
        const reason = typeof vObj.reason === "string" ? vObj.reason.trim() : "";

        if (
          !cid ||
          !idMap.has(cid) ||
          seenIds.has(cid) ||
          (status !== "correct" && status !== "incorrect" && status !== "ambiguous")
        ) {
          hasContractError = true;
          break;
        }
        seenIds.add(cid);
        mappedVerdicts.push({
          choice: idMap.get(cid)!,
          status,
          reason: reason || "بدون توضیح",
        });
      }

      if (hasContractError || seenIds.size !== 4) {
        results.set(qIdx, {
          questionIndex: qIdx,
          outcome: "contract_error",
          verdicts: [],
          blindCorrectChoice: null,
          correctCount: 0,
          incorrectCount: 0,
          ambiguousCount: 0,
          issues: ["شناسه گزینه نامعتبر، تکراری یا وضعیت Verdict نامعتبر در Blind Evaluation (Fail-Closed)"],
        });
        continue;
      }

      const correctVerdicts = mappedVerdicts.filter((v) => v.status === "correct");
      const incorrectVerdicts = mappedVerdicts.filter((v) => v.status === "incorrect");
      const ambiguousVerdicts = mappedVerdicts.filter((v) => v.status === "ambiguous");
      const blindCorrectChoice = correctVerdicts.length === 1 ? correctVerdicts[0].choice : null;

      const semanticIssues: string[] = [];
      if (ambiguousVerdicts.length > 0) {
        semanticIssues.push(
          `ارزیابی مستقل ${ambiguousVerdicts.length} گزینه مبهم (ambiguous) شناسایی کرد`,
        );
      }
      if (correctVerdicts.length === 0) {
        semanticIssues.push("در ارزیابی علمی مستقل هیچ گزینه‌ای صحیح تشخیص داده نشد");
      } else if (correctVerdicts.length > 1) {
        semanticIssues.push(
          `در ارزیابی علمی مستقل بیش از یک گزینه صحیح تشخیص داده شد (${correctVerdicts.length} گزینه)`,
        );
      } else if (blindCorrectChoice !== candidate.correctAnswer) {
        semanticIssues.push(
          `عدم تطابق پاسخ صحیح اولیه با ارزیابی علمی مستقل (کلید مستقل: "${blindCorrectChoice}")`,
        );
      }

      results.set(qIdx, {
        questionIndex: qIdx,
        outcome: semanticIssues.length === 0 ? "passed_key_match" : "semantic_failed",
        verdicts: mappedVerdicts,
        blindCorrectChoice,
        correctCount: correctVerdicts.length,
        incorrectCount: incorrectVerdicts.length,
        ambiguousCount: ambiguousVerdicts.length,
        issues: semanticIssues,
      });
    }
  }

  return results;
}

/**
 * Step B: Independent Explanation & Distractor Rationale Audit (max 5 questions per Gemini call).
 * Runs ONLY after Blind Option Evaluation passes key consistency; NEVER modifies Step A verdicts.
 * Infrastructure errors propagate immediately (Fail-Closed).
 */
export async function auditQuestionExplanations(
  items: ReadonlyArray<{ candidate: StudioQualityCandidate; blindCorrectChoice: string }>,
  gateway: ModelGateway,
  context: CriticRepairContext,
): Promise<Map<number, ExplanationAuditItemResult>> {
  const results = new Map<number, ExplanationAuditItemResult>();
  if (items.length === 0) return results;

  const isLessonGrounded = Boolean(context.lessonMarkdown);
  const contextSection = context.lessonMarkdown
    ? `SCIENTIFIC GROUND TRUTH (LESSON CONTENT):\n${context.lessonMarkdown.slice(0, 12000)}`
    : `TOPIC: ${context.topic ?? "عمومی"} (ارزیابی بر پایه موضوع و دانش علمی معتبر است؛ هیچ متنی از منبع درسی ارائه نشده و نباید ادعای تطبیق با متن درس شود.)`;

  const chunks = chunkItems(items, SEMANTIC_AUDIT_CHUNK_SIZE);

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    const chunk = chunks[chunkIdx];
    const payload = chunk.map(({ candidate, blindCorrectChoice }) => ({
      questionIndex: candidate.questionIndex,
      question: candidate.question,
      choices: candidate.choices,
      blindCorrectChoice,
      explanation: candidate.explanation,
      ...(candidate.distractorRationales
        ? { distractorRationales: candidate.distractorRationales }
        : {}),
    }));

    const userPrompt = [
      `TASK: AUDIT EXPLANATION AND DISTRACTOR RATIONALES FOR ${chunk.length} QUESTION(S).`,
      `Evaluation Basis: ${isLessonGrounded ? "Lesson Content (Ground Truth)" : "Topic & Scientific Knowledge (Quick AI — no lesson source text)"}`,
      ``,
      contextSection,
      ``,
      `QUESTIONS TO AUDIT:`,
      JSON.stringify(payload, null, 2),
      ``,
      `MANDATORY JSON OUTPUT FORMAT:`,
      `{`,
      `  "questions": [`,
      `    {`,
      `      "questionIndex": number,`,
      `      "explanationScientificallyCorrect": boolean,`,
      `      "consistentWithContext": boolean,`,
      `      "consistentWithBlindKey": boolean,`,
      `      "allDistractorRationalesDefensible": boolean,`,
      `      "issues": ["شرح مشکل در صورت وجود..."]`,
      `    }`,
      `  ]`,
      `}`,
    ].join("\n");

    const completion = await gateway.complete({
      promptVersion: "studio_explanation_audit_v1",
      messages: [
        { role: "system", content: EXPLANATION_AUDIT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      maxTokens: 4000,
      correlationId: `${context.correlationId}_expl_audit_${chunkIdx + 1}`,
      jobId: context.jobId,
      organizationId: context.organizationId,
      documentId: context.documentId,
      stage: `${context.stage}_expl_audit`,
      signal: context.signal,
    });

    const parsed = cleanAndParseJson<{ questions?: unknown }>(completion.text, "quiz");
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.questions)) {
      throw new Error("Explanation Audit returned invalid JSON structure (missing questions array)");
    }

    const expectedIndices = new Set(chunk.map((c) => c.candidate.questionIndex));
    const indexCheck = validateStrictQuestionIndexMap(parsed.questions, expectedIndices);
    if (!indexCheck.ok) {
      for (const { candidate } of chunk) {
        results.set(candidate.questionIndex, {
          questionIndex: candidate.questionIndex,
          outcome: "contract_error",
          explanationScientificallyCorrect: false,
          consistentWithContext: false,
          consistentWithBlindKey: false,
          allDistractorRationalesDefensible: false,
          issues: [indexCheck.reason],
        });
      }
      continue;
    }
    const rawByIndex = indexCheck.map;

    for (const { candidate } of chunk) {
      const qIdx = candidate.questionIndex;
      const raw = rawByIndex.get(qIdx);

      if (
        !raw ||
        typeof raw.explanationScientificallyCorrect !== "boolean" ||
        typeof raw.consistentWithContext !== "boolean" ||
        typeof raw.consistentWithBlindKey !== "boolean" ||
        typeof raw.allDistractorRationalesDefensible !== "boolean"
      ) {
        results.set(qIdx, {
          questionIndex: qIdx,
          outcome: "contract_error",
          explanationScientificallyCorrect: false,
          consistentWithContext: false,
          consistentWithBlindKey: false,
          allDistractorRationalesDefensible: false,
          issues: ["خروجی Explanation Audit ناقص یا نامعتبر است (Fail-Closed)"],
        });
        continue;
      }

      const allPassed =
        raw.explanationScientificallyCorrect &&
        raw.consistentWithContext &&
        raw.consistentWithBlindKey &&
        raw.allDistractorRationalesDefensible;

      const rawIssues = Array.isArray(raw.issues)
        ? raw.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
        : [];

      const issues = allPassed
        ? []
        : rawIssues.length > 0
          ? rawIssues
          : ["توضیح علمی یا دلایل گزینه‌های انحرافی با کلید مستقل یا زمینه علمی سازگار نیست"];

      results.set(qIdx, {
        questionIndex: qIdx,
        outcome: allPassed ? "passed" : "semantic_failed",
        explanationScientificallyCorrect: raw.explanationScientificallyCorrect,
        consistentWithContext: raw.consistentWithContext,
        consistentWithBlindKey: raw.consistentWithBlindKey,
        allDistractorRationalesDefensible: raw.allDistractorRationalesDefensible,
        issues,
      });
    }
  }

  return results;
}

/**
 * Orchestrates Phase 2 Quality Pipeline across both Multi-Chapter & Quick AI:
 * 1. Structural Passed -> Step A (Blind Option Evaluation) -> Key Consistency -> Step B (Explanation Audit).
 * 2. Infrastructure / Contract errors -> Fail-Closed (never routed to Repair).
 * 3. Semantic / Structural failures -> Max 1 Repair -> Mandatory Post-Repair Step A & B Re-Audit.
 * 4. Final Structural Gate (`evaluateStudioQuestionQuality`) on ALL accepted questions.
 */
export async function runBlindSemanticAndRepairPipeline(params: {
  structuralPassed: StudioQualityCandidate[];
  structuralFailed: CriticRepairItem[];
  gateway: ModelGateway;
  context: CriticRepairContext;
  rng?: () => number;
}): Promise<StudioSemanticPipelineResult> {
  const { structuralPassed, structuralFailed, gateway, context, rng = Math.random } = params;

  const preFinalCandidates: StudioQualityCandidate[] = [];
  const repairItems: CriticRepairItem[] = [...structuralFailed];
  const rejectedSet = new Set<number>();
  let auditCalled = false;
  let criticCalled = false;

  // 1. Blind Option Evaluation on structurally passed questions
  if (structuralPassed.length > 0) {
    auditCalled = true;
    const blindResults = await blindEvaluateOptions(structuralPassed, gateway, context, rng);
    const readyForExplAudit: Array<{
      candidate: StudioQualityCandidate;
      blindCorrectChoice: string;
    }> = [];

    for (const candidate of structuralPassed) {
      const blind = blindResults.get(candidate.questionIndex);
      if (!blind || blind.outcome === "contract_error") {
        // Incomplete/invalid output -> Fail-Closed (never enters Repair)
        rejectedSet.add(candidate.questionIndex);
        continue;
      }
      if (blind.outcome === "semantic_failed" || !blind.blindCorrectChoice) {
        repairItems.push({ candidate, issues: blind.issues });
        continue;
      }
      readyForExplAudit.push({
        candidate,
        blindCorrectChoice: blind.blindCorrectChoice,
      });
    }

    // 2. Independent Explanation Audit on Blind-passed questions (Verdicts remain frozen)
    if (readyForExplAudit.length > 0) {
      const explResults = await auditQuestionExplanations(readyForExplAudit, gateway, context);
      for (const { candidate } of readyForExplAudit) {
        const expl = explResults.get(candidate.questionIndex);
        if (!expl || expl.outcome === "contract_error") {
          // Incomplete/invalid output -> Fail-Closed (never enters Repair)
          rejectedSet.add(candidate.questionIndex);
          continue;
        }
        if (expl.outcome === "semantic_failed") {
          repairItems.push({ candidate, issues: expl.issues });
          continue;
        }
        preFinalCandidates.push(candidate);
      }
    }
  }

  // 3. Max 1 Repair + Mandatory Post-Repair Blind Re-Audit & Explanation Re-Audit
  if (repairItems.length > 0) {
    const criticResult = await criticAndRepairStudioQuestions(repairItems, gateway, context);
    criticCalled = criticResult.criticCalled;
    for (const rejIdx of criticResult.rejectedIndices) {
      rejectedSet.add(rejIdx);
    }

    if (criticResult.repaired.length > 0) {
      auditCalled = true;
      const reBlindResults = await blindEvaluateOptions(
        criticResult.repaired,
        gateway,
        { ...context, correlationId: `${context.correlationId}_post_repair` },
        rng,
      );

      const reReadyForExpl: Array<{
        candidate: StudioQualityCandidate;
        blindCorrectChoice: string;
      }> = [];

      for (const fixed of criticResult.repaired) {
        const blind = reBlindResults.get(fixed.questionIndex);
        if (
          !blind ||
          blind.outcome !== "passed_key_match" ||
          !blind.blindCorrectChoice
        ) {
          // Strict Fail-Closed after 1 Repair: NO 2nd Repair loop
          rejectedSet.add(fixed.questionIndex);
          continue;
        }
        reReadyForExpl.push({
          candidate: fixed,
          blindCorrectChoice: blind.blindCorrectChoice,
        });
      }

      if (reReadyForExpl.length > 0) {
        const reExplResults = await auditQuestionExplanations(
          reReadyForExpl,
          gateway,
          { ...context, correlationId: `${context.correlationId}_post_repair` },
        );
        for (const { candidate } of reReadyForExpl) {
          const expl = reExplResults.get(candidate.questionIndex);
          if (!expl || expl.outcome !== "passed") {
            rejectedSet.add(candidate.questionIndex);
            continue;
          }
          preFinalCandidates.push(candidate);
        }
      }
    }
  }

  // 4. Final Structural Gate on ALL accepted questions (initial + repaired)
  const accepted: StudioQualityCandidate[] = [];
  for (const candidate of preFinalCandidates) {
    const finalGate = evaluateStudioQuestionQuality(candidate);
    if (finalGate.status !== "pass") {
      rejectedSet.add(candidate.questionIndex);
      continue;
    }
    accepted.push(finalGate.normalizedQuestion);
  }

  return {
    accepted,
    rejectedIndices: Array.from(rejectedSet),
    auditCalled,
    criticCalled,
  };
}

// ---------------------------------------------------------------------------
// Atomic Shuffle & Batch Position Distribution Balancing
// ---------------------------------------------------------------------------

/**
 * Atomically shuffles each MCQ's choices using `@avana/domain`'s `canonicalizeAndShuffleQuestion`
 * and prevents predictable batch-level key position bias (e.g. all answers landing at index 0).
 */
export function shuffleAndBalanceStudioQuestions<
  T extends { choices: string[]; correctAnswer: string; question: string; explanation?: string | null },
>(questions: T[], rng: () => number = Math.random): T[] {
  const shuffled = questions.map((q) => {
    if (q.choices.length !== 4) return q;
    const res = canonicalizeAndShuffleQuestion(
      {
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation ?? undefined,
      },
      rng,
    );
    return {
      ...q,
      choices: (res.choices as string[]) ?? q.choices,
      correctAnswer: String(res.correctAnswer ?? q.correctAnswer),
    };
  });

  // For batches of 2+, prevent skewed key-position concentration (e.g. >50% or all landing on one slot)
  if (shuffled.length >= 2) {
    const counts = [0, 0, 0, 0];
    for (const q of shuffled) {
      const idx = q.choices.indexOf(q.correctAnswer);
      if (idx >= 0 && idx < 4) counts[idx]++;
    }
    const maxAllowed = Math.max(1, Math.ceil(shuffled.length / 2));
    const maxCount = Math.max(...counts);
    const allSame = counts.filter((c) => c > 0).length === 1;

    if (allSame || maxCount > maxAllowed) {
      for (let i = 0; i < shuffled.length; i++) {
        const q = shuffled[i];
        if (q.choices.length !== 4) continue;
        const curIdx = q.choices.indexOf(q.correctAnswer);
        if (curIdx < 0) continue;
        if (counts[curIdx] > maxAllowed || (allSame && i > 0)) {
          // Move correct choice to the least-represented position by rotating choices
          const targetIdx = counts.indexOf(Math.min(...counts));
          if (targetIdx !== curIdx) {
            const shift = (curIdx - targetIdx + 4) % 4;
            const rotated = q.choices.map((_, idx) => q.choices[(idx + shift) % 4]);
            shuffled[i] = { ...q, choices: rotated };
            counts[curIdx]--;
            counts[targetIdx]++;
          }
        }
      }
    }
  }

  return shuffled;
}
