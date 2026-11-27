/**
 * AVANA Exam Studio — Question Validation & Normalization Engine (Phase 2).
 *
 * Validates generated question outputs against:
 * 1. Mandatory slot index constraints (strictly 1..targetCount and requested missing slots).
 * 2. 4-choice structure and distractor validity.
 * 3. Correct answer alignment with choices.
 * 4. Grounded explanation requirement.
 * 5. Stem length, format, and internal batch duplication checks.
 */

import { DomainError } from "@avana/domain";
import type { SaveQuestionInput } from "./studio-exam-store.js";
import {
  evaluateStudioQuestionQuality,
  type CriticRepairItem,
} from "./studio-question-quality.js";

export interface QuestionPatternMeta {
  patternId: string;
  patternVersion: number;
}

export interface ValidateGeneratedQuestionsParams {
  rawQuestions: unknown;
  expectedSlotIndices: number[];
  targetCount: number;
  patternMap: Map<number, QuestionPatternMeta>;
  defaultDifficulty?: string;
  existingQuestionStems?: string[];
}

export interface ValidationResult {
  validQuestions: SaveQuestionInput[];
  suspiciousItems: CriticRepairItem[];
  rejectedIndices: number[];
  errors: string[];
}

function normalizeStem(text: string): string {
  return text
    .replace(/[«»""''`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function validateStudioExamQuestions(
  params: ValidateGeneratedQuestionsParams,
): ValidationResult {
  const {
    rawQuestions,
    expectedSlotIndices,
    targetCount,
    patternMap,
    defaultDifficulty = "medium",
    existingQuestionStems = [],
  } = params;

  if (!Array.isArray(rawQuestions)) {
    throw new DomainError(
      "bad_request",
      "خروجی هوش مصنوعی باید شامل آرایه معتبر questions باشد.",
      { type: typeof rawQuestions },
    );
  }

  const validQuestions: SaveQuestionInput[] = [];
  const suspiciousItems: CriticRepairItem[] = [];
  const rejectedIndices: number[] = [];
  const errors: string[] = [];
  const seenStems = new Set<string>(existingQuestionStems.map((s) => normalizeStem(s)));
  const seenIndices = new Set<number>();

  for (const item of rawQuestions) {
    if (!item || typeof item !== "object") {
      errors.push("عنصر نامعتبر در آرایه سؤالات دریافتی.");
      continue;
    }

    const q = item as Record<string, unknown>;
    const slotIndex = Number(q.questionIndex);

    // 1. Strict Boundary Check: must be an integer, within 1..targetCount, and in expectedSlotIndices
    if (
      !Number.isInteger(slotIndex) ||
      slotIndex < 1 ||
      slotIndex > targetCount ||
      !expectedSlotIndices.includes(slotIndex)
    ) {
      errors.push(
        `اندیس سؤال (${q.questionIndex}) خارج از اسلات‌های درخواستی یا خارج از محدوده ۱ تا ${targetCount} است.`,
      );
      if (Number.isInteger(slotIndex)) rejectedIndices.push(slotIndex);
      continue;
    }

    // 2. Prevent duplicate slot index in same response
    if (seenIndices.has(slotIndex)) {
      errors.push(`اندیس تکراری در خروجی پاسخ مدل: ${slotIndex}.`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    // 3. Question stem validation
    const questionText = typeof q.question === "string" ? q.question.trim() : "";
    if (questionText.length < 10) {
      errors.push(`متن سؤال برای اسلات ${slotIndex} بیش از حد کوتاه یا نامعتبر است.`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    // 4. Duplicate question stem check
    const normalized = normalizeStem(questionText);
    if (seenStems.has(normalized)) {
      errors.push(`سؤال تکراری در این بسته شناسایی شد: "${questionText.slice(0, 40)}..."`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    // 5. Choices validation
    const questionType =
      typeof q.questionType === "string" && q.questionType.trim().length > 0
        ? q.questionType.trim()
        : "multiple_choice";

    if (!Array.isArray(q.choices) || q.choices.length < 2) {
      errors.push(`گزینه‌های سؤال برای اسلات ${slotIndex} باید حداقل ۲ گزینه معتبر داشته باشد.`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    const cleanChoices = q.choices
      .map((c) => {
        if (typeof c === "string") return c.trim();
        if (typeof c === "object" && c !== null && "text" in c) {
          return String((c as { text: unknown }).text ?? "").trim();
        }
        return String(c ?? "").trim();
      })
      .filter((c) => c.length > 0);

    if (cleanChoices.length !== q.choices.length || cleanChoices.length < 2) {
      errors.push(`برخی گزینه‌ها برای اسلات ${slotIndex} خالی یا نامعتبر هستند.`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    if (questionType === "multiple_choice") {
      if (cleanChoices.length !== 4) {
        errors.push(`سؤال چندگزینه‌ای برای اسلات ${slotIndex} باید دقیقاً ۴ گزینه معتبر داشته باشد.`);
        rejectedIndices.push(slotIndex);
        continue;
      }

      const uniqueNormalizedChoices = new Set(cleanChoices.map((c) => normalizeStem(c)));
      if (uniqueNormalizedChoices.size !== cleanChoices.length) {
        errors.push(`گزینه‌های تکراری برای اسلات ${slotIndex} مجاز نیستند.`);
        rejectedIndices.push(slotIndex);
        continue;
      }
    }

    // 6. Correct answer validation
    let correctAnswer: unknown = q.correctAnswer;
    if (typeof correctAnswer === "string") {
      correctAnswer = correctAnswer.trim();
    } else if (
      typeof correctAnswer === "object" &&
      correctAnswer !== null &&
      "choiceId" in correctAnswer &&
      typeof (correctAnswer as { choiceId: unknown }).choiceId === "string"
    ) {
      const cid = (correctAnswer as { choiceId: string }).choiceId.trim();
      const idx = parseInt(cid, 10);
      if (/^\d+$/.test(cid) && idx >= 1 && idx <= cleanChoices.length) {
        correctAnswer = cleanChoices[idx - 1];
      } else {
        correctAnswer = cid;
      }
    }

    if (!correctAnswer || typeof correctAnswer !== "string") {
      errors.push(`پاسخ صحیح برای اسلات ${slotIndex} مشخص نشده یا نامعتبر است.`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    const directMatch = cleanChoices.some(
      (c) => c.trim().toLowerCase() === (correctAnswer as string).trim().toLowerCase(),
    );
    if (!directMatch) {
      // Check if it's an option index e.g. "1", "2", "3", "4"
      const numericIndex = /^\d+$/.test(correctAnswer) ? parseInt(correctAnswer, 10) : NaN;
      if (
        !Number.isNaN(numericIndex) &&
        numericIndex >= 1 &&
        numericIndex <= cleanChoices.length
      ) {
        correctAnswer = cleanChoices[numericIndex - 1];
      } else {
        errors.push(
          `پاسخ صحیح "${correctAnswer}" در بین گزینه‌های اسلات ${slotIndex} یافت نشد.`,
        );
        rejectedIndices.push(slotIndex);
        continue;
      }
    }

    // 7. Explanation validation
    const explanation = typeof q.explanation === "string" ? q.explanation.trim() : null;
    if (!explanation || explanation.length < 5) {
      errors.push(`توضیح پاسخ (Explanation) برای اسلات ${slotIndex} الزامی و ناکافی است.`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    // 8. Pattern metadata lookup
    const patternMeta = patternMap.get(slotIndex);
    if (!patternMeta) {
      errors.push(`الگوی متناظر برای اسلات ${slotIndex} در نقشه الگوها یافت نشد.`);
      rejectedIndices.push(slotIndex);
      continue;
    }

    const distractorRationales =
      q.distractorRationales &&
      typeof q.distractorRationales === "object" &&
      !Array.isArray(q.distractorRationales)
        ? (q.distractorRationales as Record<string, string>)
        : undefined;

    const resolvedCorrectAnswer = String(correctAnswer);

    if (questionType === "multiple_choice") {
      const qualityEval = evaluateStudioQuestionQuality({
        questionIndex: slotIndex,
        question: questionText,
        choices: cleanChoices,
        correctAnswer: resolvedCorrectAnswer,
        explanation,
        difficulty: typeof q.difficulty === "string" ? q.difficulty : defaultDifficulty,
        topic: typeof q.topic === "string" ? q.topic.trim() : null,
        questionType,
      });

      if (qualityEval.status !== "pass") {
        errors.push(...qualityEval.issues);
        rejectedIndices.push(slotIndex);
        seenStems.add(normalized);
        seenIndices.add(slotIndex);
        continue;
      }

      seenStems.add(normalized);
      seenIndices.add(slotIndex);

      validQuestions.push({
        questionIndex: slotIndex,
        patternId: patternMeta.patternId,
        patternVersion: patternMeta.patternVersion,
        question: qualityEval.normalizedQuestion.question,
        choices: qualityEval.normalizedQuestion.choices,
        correctAnswer: qualityEval.normalizedQuestion.correctAnswer,
        explanation: qualityEval.normalizedQuestion.explanation,
        difficulty: typeof q.difficulty === "string" ? q.difficulty : defaultDifficulty,
        topic: typeof q.topic === "string" ? q.topic.trim() : null,
        questionType,
        metadata: {
          validatedAt: new Date().toISOString(),
          qualityGate: "pass",
          repairedByNormalizer: qualityEval.repairedByDeterministicNormalizer,
        },
      });
      continue;
    }

    seenStems.add(normalized);
    seenIndices.add(slotIndex);

    validQuestions.push({
      questionIndex: slotIndex,
      patternId: patternMeta.patternId,
      patternVersion: patternMeta.patternVersion,
      question: questionText,
      choices: cleanChoices,
      correctAnswer: resolvedCorrectAnswer,
      explanation,
      difficulty: typeof q.difficulty === "string" ? q.difficulty : defaultDifficulty,
      topic: typeof q.topic === "string" ? q.topic.trim() : null,
      questionType,
      metadata: {
        validatedAt: new Date().toISOString(),
        ...(distractorRationales ? { distractorRationales } : {}),
      },
    });
  }

  return {
    validQuestions,
    suspiciousItems,
    rejectedIndices,
    errors,
  };
}
