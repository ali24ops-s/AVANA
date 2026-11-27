/**
 * AVANA Exam Studio — AI Prompt Builder for Multi-Chapter Batch Generation.
 *
 * Reuses the user-facing MCQ prompt engineering core (`prompt-registry.ts`):
 * 1. Grounded lesson chunks of the selected module (scoped to avoid context dilution).
 * 2. Immutable pattern snapshots mapped to each specific missing question slot.
 * 3. Unified MCQ anti-bias, anti-leakage, and few-shot standards.
 */

import type { StudioExamPatternSnapshot } from "@avana/domain";
import {
  QUIZ_GENERATION_SYSTEM_PROMPT,
  MCQ_LANGUAGE_REQUIREMENT_PROMPT,
  QUIZ_DISTRACTOR_ENGINEERING_LINES,
  QUIZ_FEW_SHOT_EXAMPLE,
} from "../generation/prompt-registry.js";

export interface MissingSlotInstruction {
  questionIndex: number; // 1-based index within the batch (1..targetCount)
  pattern: StudioExamPatternSnapshot;
}

export interface StudioLessonChunkInput {
  id: string;
  title: string;
  contentMarkdown: string;
  sortOrder: number;
}

export interface BuildStudioExamPromptParams {
  lessonMarkdown: string;
  lessons?: StudioLessonChunkInput[];
  missingSlots: MissingSlotInstruction[];
  difficulty?: string;
  instructions?: string;
  existingQuestionStems?: string[];
}

export const STUDIO_EXAM_SYSTEM_PROMPT = QUIZ_GENERATION_SYSTEM_PROMPT;

const MAX_FULL_MODULE_CONTEXT_CHARS = 24_000;

/**
 * Builds a clean, chunk-scoped lesson context for Studio Exam batches.
 * When a module has multiple lessons exceeding MAX_FULL_MODULE_CONTEXT_CHARS,
 * selects the relevant lesson chunks for the batch's slot indices to prevent context dilution.
 */
export function buildScopedStudioLessonContext(
  lessonMarkdown: string,
  lessons?: StudioLessonChunkInput[],
  missingSlots?: MissingSlotInstruction[],
): string {
  const nonEmptyLessons = (lessons ?? []).filter(
    (l) => l.contentMarkdown && l.contentMarkdown.trim().length > 0,
  );
  if (nonEmptyLessons.length === 0) {
    return lessonMarkdown;
  }

  const formatChunk = (l: StudioLessonChunkInput, idx: number) =>
    `[Lesson Chunk ${idx + 1}: "${l.title}"]\n${l.contentMarkdown.trim()}`;

  const totalChars = nonEmptyLessons.reduce((sum, l) => sum + l.contentMarkdown.length, 0);
  if (totalChars <= MAX_FULL_MODULE_CONTEXT_CHARS || nonEmptyLessons.length === 1) {
    return nonEmptyLessons.map(formatChunk).join("\n\n---\n\n");
  }

  // Distribute requested slots across lesson chunks so each batch stays focused on relevant chunks
  const slots = missingSlots && missingSlots.length > 0 ? missingSlots : [{ questionIndex: 1 }];
  const selectedIndices = new Set<number>();
  for (const slot of slots) {
    const lessonIdx = (Math.max(1, slot.questionIndex) - 1) % nonEmptyLessons.length;
    selectedIndices.add(lessonIdx);
  }

  // Include adjacent chunk if budget allows
  if (selectedIndices.size < nonEmptyLessons.length && totalChars / nonEmptyLessons.length < 10_000) {
    const first = Math.min(...selectedIndices);
    const next = (first + 1) % nonEmptyLessons.length;
    selectedIndices.add(next);
  }

  return Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map((idx) => formatChunk(nonEmptyLessons[idx], idx))
    .join("\n\n---\n\n");
}

export function buildStudioExamUserPrompt(params: BuildStudioExamPromptParams): string {
  const {
    lessonMarkdown,
    lessons,
    missingSlots,
    difficulty = "medium",
    instructions,
    existingQuestionStems = [],
  } = params;

  const scopedLessonContext = buildScopedStudioLessonContext(
    lessonMarkdown,
    lessons,
    missingSlots,
  );

  const slotDescriptions = missingSlots.map((slot) => {
    const p = slot.pattern;
    const examples = Array.isArray(p.examples) ? p.examples.slice(0, 3) : [];
    const examplesText = examples.length > 0
      ? examples.map((ex, idx) => [
          `    [Reference Example ${idx + 1}]`,
          ex.clinicalContext ? `    Scenario: ${ex.clinicalContext}` : "",
          `    Question: ${ex.question}`,
          `    Choices: ${JSON.stringify(ex.choices)}`,
          `    Correct Answer: ${typeof ex.correctAnswer === "string" ? ex.correctAnswer : JSON.stringify(ex.correctAnswer)}`,
          ex.explanation ? `    Explanation: ${ex.explanation}` : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "    (No specific example provided)";

    return [
      `================================================================================`,
      `QUESTION SLOT INDEX: ${slot.questionIndex}`,
      `PATTERN: "${p.title}" (Pattern ID: ${p.patternId}, Version: ${p.patternVersion})`,
      p.category ? `CATEGORY: ${p.category}` : "",
      p.cognitiveLevel ? `COGNITIVE LEVEL: ${p.cognitiveLevel}` : "",
      p.skills && p.skills.length > 0 ? `REQUIRED SKILLS: ${p.skills.join(", ")}` : "",
      `PATTERN SYSTEM INSTRUCTIONS:`,
      p.systemInstructions,
      ``,
      `REFERENCE EXAMPLES FOR THIS PATTERN (Structure & Cognitive Depth ONLY — DO NOT copy facts):`,
      examplesText,
      `================================================================================`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const exampleJson = JSON.stringify(
    {
      questions: [
        {
          questionIndex: missingSlots[0]?.questionIndex ?? 1,
          ...QUIZ_FEW_SHOT_EXAMPLE,
          topic: "فارماکولوژی قلب و عروق",
        },
        {
          questionIndex: missingSlots[1]?.questionIndex ?? (missingSlots[0]?.questionIndex ?? 1) + 1,
          question:
            "بیماری ۶۲ ساله با نارسایی قلبی (LVEF 30%) تحت درمان با انالاپریل است. پزشک تصمیم به تغییر رژیم به ساکوبیتریل-والسارتان می‌گیرد. کدام اقدام ایمنی پیش از شروع داروی جدید ضروری است؟",
          questionType: "multiple_choice",
          difficulty: "medium",
          category: "contraindication_nuance",
          choices: [
            "قطع انالاپریل و شروع هم‌زمان ساکوبیتریل-والسارتان در همان روز برای حفظ پایداری فشار خون",
            "ایجاد فاصله ۳۶ ساعته پس از آخرین دوز انالاپریل پیش از شروع ساکوبیتریل-والسارتان",
            "افزایش دوز دیورتیک لوپ به دو برابر و پایش پتاسیم سرم در چهل‌وهشت ساعت نخست",
            "تجویز هم‌زمان هر دو دارو با نصف دوز استاندارد به مدت یک هفته و سپس قطع انالاپریل",
          ],
          correctAnswer:
            "ایجاد فاصله ۳۶ ساعته پس از آخرین دوز انالاپریل پیش از شروع ساکوبیتریل-والسارتان",
          explanation:
            "برای کاهش خطر آنژیوادم ناشی از مهار هم‌زمان ACE و نپری‌لیسین، باید حداقل ۳۶ ساعت بین قطع ACEI و شروع ARNI فاصله (Washout) رعایت شود.",
          topic: "نارسایی قلبی",
        },
      ].slice(0, Math.min(2, Math.max(1, missingSlots.length))),
    },
    null,
    2,
  );

  return [
    `You are AVANA's Expert Educational AI Content Engine.`,
    `TASK: GENERATE STRICTLY ${missingSlots.length} HIGH-DISCRIMINATION MULTIPLE-CHOICE QUESTION(S) FOR THE EMPTY SLOTS INDICATED BELOW.`,
    ``,
    MCQ_LANGUAGE_REQUIREMENT_PROMPT,
    ``,
    `QUIZ & DISTRACTOR ENGINEERING REQUIREMENTS (High Discrimination Policy):`,
    ...QUIZ_DISTRACTOR_ENGINEERING_LINES,
    ``,
    `STUDIO CHOICE BALANCE & NATURAL LENGTH DIVERSITY RULES:`,
    `- NO SYSTEMATIC LENGTH BIAS: The correct choice must NOT systematically be the longest choice. Across a question set, the correct choice can naturally be short, medium, or long depending strictly on the scientific concept.`,
    `- VALID LONG DISTRACTORS PERMITTED: A distractor may naturally be the longest choice when it represents a scientifically plausible, detailed misconception — NEVER pad distractors with filler words, extra clauses, or fabricated details just to make them longer.`,
    `- SHARED STEM / NO REPEATED PREFIXES: Place any shared clinical context, condition, or repeated introductory phrase into the question stem, NOT inside the choices.`,
    `- SINGLE PROPOSITION & EQUAL DEPTH: Each choice must express ONE focused, independent scientific proposition. Match all 4 choices in scientific depth, specificity, and grammatical structure rather than trying to equalize character counts artificially.`,
    `- PRESERVE ESSENTIAL SCIENCE IN KEY: NEVER omit essential scientific qualifiers, receptor subtypes, or clinical conditions from the correct choice just to shorten it; move only non-essential secondary explanations and reasoning strictly into "explanation".`,
    ``,
    `TARGET DIFFICULTY: ${difficulty}`,
    instructions ? `ADDITIONAL INSTRUCTIONS: ${instructions}` : "",
    existingQuestionStems.length > 0
      ? [
          ``,
          `PREVIOUSLY GENERATED QUESTIONS IN THIS BATCH (DO NOT DUPLICATE OR PARAPHRASE THESE):`,
          ...existingQuestionStems.map((s, idx) => `${idx + 1}. ${s}`),
        ].join("\n")
      : "",
    ``,
    `SCIENTIFIC GROUND TRUTH (LESSON CHUNKS):`,
    `Every question stem, distractor, correct answer, and explanation MUST be strictly grounded in the lesson chunks below. Do NOT invent facts or copy clinical details from pattern examples.`,
    `--------------------------------------------------------------------------------`,
    scopedLessonContext,
    `--------------------------------------------------------------------------------`,
    ``,
    `REQUIRED QUESTION SLOTS AND THEIR MANDATORY PATTERNS:`,
    slotDescriptions,
    ``,
    `OUTPUT INSTRUCTIONS:`,
    `Return ONLY valid JSON matching this schema (with EXACTLY ${missingSlots.length} item(s) matching the requested questionIndex values):`,
    exampleJson,
  ].filter(Boolean).join("\n");
}
