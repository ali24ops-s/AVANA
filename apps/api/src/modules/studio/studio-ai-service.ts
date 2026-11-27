import crypto from "node:crypto";
import type { ModelGateway } from "../generation/gateway/types.js";
import { cleanAndParseJson } from "../generation/engine/resilient-json-parser.js";
import {
  QUIZ_GENERATION_SYSTEM_PROMPT,
  MCQ_LANGUAGE_REQUIREMENT_PROMPT,
  QUIZ_DISTRACTOR_ENGINEERING_LINES,
  QUIZ_FEW_SHOT_EXAMPLE,
} from "../generation/prompt-registry.js";
import { DomainError, asOrganizationId, asDocumentId, resolveCorrectChoiceText } from "@avana/domain";
import type {
  StudioAiGenerateInput,
  StudioAiGeneratedQuestion,
} from "./types.js";
import {
  evaluateStudioQuestionQuality,
  shuffleAndBalanceStudioQuestions,
  type StudioQualityCandidate,
} from "./studio-question-quality.js";

const QUESTION_TYPE_LABELS: Record<string, string> = {
  conceptual: "مفهومی و اصول پایه",
  mechanism_of_action: "مکانیسم اثر دارو",
  clinical_pharmacology: "فارماکولوژی بالینی و کاربرد درمانی",
  adverse_effects: "عوارض ناخواسته و سمیت دارویی",
  drug_comparison: "مقایسه داروها و انتخاب بهینه",
  drug_interactions: "تداخلات دارویی مهم",
  dosage_calculations: "محاسبات دارویی و دوزینگ",
  clinical_scenario: "سناریوی بالینی و کیس پزشکی",
};

export class StudioAiService {
  constructor(private readonly modelGateway: ModelGateway) {}

  /**
   * Generates multiple-choice questions using the unified user-facing MCQ prompt,
   * Gemini JSON schema, and deterministic quality/normalization pipeline.
   */
  async generateQuestions(
    input: StudioAiGenerateInput,
  ): Promise<StudioAiGeneratedQuestion[]> {
    const count = Math.min(Math.max(input.count || 1, 1), 10);
    const typeLabel = QUESTION_TYPE_LABELS[input.questionType] || input.questionType;

    const systemPrompt = QUIZ_GENERATION_SYSTEM_PROMPT;

    const sampleSection =
      input.sampleQuestions && input.sampleQuestions.length > 0
        ? [
            ``,
            `QUESTION TEMPLATE SAMPLES (Style, Difficulty, and Pattern Guidance — generate NEW non-duplicate questions):`,
            ...input.sampleQuestions.map((s, idx) =>
              [
                `[Sample ${idx + 1}]`,
                `Question: ${s.question}`,
                s.choices ? `Choices: ${s.choices.join(" | ")}` : "",
                s.explanation ? `Explanation: ${s.explanation}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
            ),
          ].join("\n")
        : "";

    const userPrompt = [
      `You are AVANA's Expert Educational AI Content Engine in Pharmacy, Medicine, and Pharmacology.`,
      `TASK: GENERATE ${count} HIGH-DISCRIMINATION MULTIPLE-CHOICE QUESTION(S) IN ACADEMIC PERSIAN.`,
      ``,
      `SPECIFICATIONS:`,
      `- Topic: ${input.topic}`,
      `- Question Type: ${typeLabel} (${input.questionType})`,
      `- Difficulty: ${input.difficulty}`,
      ...(input.instructions?.trim()
        ? [`- Admin Instructions: ${input.instructions.trim()}`]
        : []),
      ``,
      MCQ_LANGUAGE_REQUIREMENT_PROMPT,
      ``,
      `QUIZ & DISTRACTOR ENGINEERING REQUIREMENTS (High Discrimination Policy):`,
      ...QUIZ_DISTRACTOR_ENGINEERING_LINES,
      ``,
      `STUDIO CHOICE BALANCE & NATURAL LENGTH DIVERSITY RULES:`,
      `- The correct choice must NOT systematically be the longest choice; it can naturally be short, medium, or long depending on the scientific concept.`,
      `- A distractor may naturally be the longest choice if scientifically plausible; NEVER add filler or fabricated details to pad distractors.`,
      `- Place shared context in the stem, keep each choice focused on ONE scientific proposition, and move secondary explanations to "explanation" without stripping essential scientific qualifiers from the correct choice.`,
      sampleSection,
      ``,
      `OUTPUT INSTRUCTIONS:`,
      `Return ONLY valid JSON matching this schema:`,
      JSON.stringify(
        {
          kind: "quizzes",
          questions: [
            {
              ...QUIZ_FEW_SHOT_EXAMPLE,
              difficulty: input.difficulty,
            },
          ],
        },
        null,
        2,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const correlationId = crypto.randomUUID();
    const organizationId = asOrganizationId(crypto.randomUUID());
    const documentId = asDocumentId(crypto.randomUUID());

    try {
      const response = await this.modelGateway.complete({
        promptVersion: "2.0",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        jsonSchema: { type: "quizzes" },
        temperature: 0.2,
        correlationId,
        organizationId,
        documentId,
        stage: "marketing_quiz",
      });

      const parsed = cleanAndParseJson<unknown>(response.text, "quizzes");
      const rawArray = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "questions" in parsed && Array.isArray((parsed as { questions: unknown }).questions)
          ? (parsed as { questions: unknown[] }).questions
          : null;

      if (!rawArray || rawArray.length === 0) {
        throw new Error("پاسخ مدل ساختار آرایه مورد نظر را ندارد");
      }

      const normalizeStem = (text: string) =>
        text
          .replace(/[«»""''`]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const seenStems = new Set<string>();
      const finalCandidates: StudioQualityCandidate[] = [];

      rawArray.forEach((rawItem, idx) => {
        if (!rawItem || typeof rawItem !== "object") return;
        const item = rawItem as Record<string, unknown>;
        const questionText = typeof item.question === "string" ? item.question.trim() : "";
        if (questionText.length < 10) return;

        const normalizedStem = normalizeStem(questionText);
        if (seenStems.has(normalizedStem)) return;

        const rawChoices = Array.isArray(item.choices) ? item.choices : [];
        const choiceObjs = rawChoices
          .map((c, cIdx) => {
            if (typeof c === "string") {
              return { id: String(cIdx + 1), text: c.trim() };
            }
            if (typeof c === "object" && c !== null) {
              const obj = c as { id?: unknown; text?: unknown };
              return {
                id: obj.id ? String(obj.id).trim() : String(cIdx + 1),
                text: typeof obj.text === "string" ? obj.text.trim() : String(obj.text ?? "").trim(),
              };
            }
            return { id: String(cIdx + 1), text: "" };
          })
          .filter((c) => c.text.length > 0);

        if (choiceObjs.length !== 4) return;
        const choiceTexts = choiceObjs.map((c) => c.text);

        // Resolve correctAnswer from { choiceId } or string text strictly
        let rawCorrectToken: unknown = item.correctAnswer;
        if (
          typeof rawCorrectToken === "object" &&
          rawCorrectToken !== null &&
          "choiceId" in rawCorrectToken
        ) {
          const cid = String((rawCorrectToken as { choiceId: unknown }).choiceId).trim();
          const matchedById = choiceObjs.find((c) => c.id === cid);
          rawCorrectToken = matchedById ? matchedById.text : cid;
        }

        const resolvedCorrectText = resolveCorrectChoiceText(choiceTexts, rawCorrectToken, {
          strict: true,
        });
        if (!resolvedCorrectText) return;

        const explanation = typeof item.explanation === "string" ? item.explanation.trim() : "";
        if (explanation.length < 5) return;

        const candidate: StudioQualityCandidate = {
          questionIndex: idx + 1,
          question: questionText,
          choices: choiceTexts,
          correctAnswer: resolvedCorrectText,
          explanation,
          difficulty: input.difficulty,
          topic: input.topic,
          questionType: input.questionType,
        };

        // Unified Quality Gate: validate -> normalizeQuestionOptions (if needed) -> re-validate -> Accept or Drop
        const qualityEval = evaluateStudioQuestionQuality(candidate);
        if (qualityEval.status !== "pass") {
          return;
        }

        seenStems.add(normalizedStem);
        finalCandidates.push(qualityEval.normalizedQuestion);
      });

      if (finalCandidates.length === 0) {
        throw new Error("هیچ سؤال معتبری مطابق با استاندارد کیفیت گزینه‌ها تولید نشد.");
      }

      // Preserve original generation order before atomic shuffling
      finalCandidates.sort((a, b) => a.questionIndex - b.questionIndex);

      // Atomic shuffle + batch-level key position balancing
      const balanced = shuffleAndBalanceStudioQuestions(finalCandidates);

      return balanced.map((q) => {
        const choices = q.choices.map((text, cIdx) => ({
          id: String(cIdx + 1),
          text,
        }));
        const correctIdx = q.choices.indexOf(q.correctAnswer);
        if (correctIdx < 0) {
          throw new DomainError(
            "bad_request",
            "پاسخ صحیح با هیچ‌یک از گزینه‌های نهایی منطبق نیست.",
            { question: q.question.slice(0, 60) },
          );
        }
        const choiceId = String(correctIdx + 1);

        return {
          question: q.question,
          choices,
          correctAnswer: { choiceId },
          explanation: q.explanation,
          difficulty: input.difficulty,
          topic: input.topic,
          questionType: input.questionType,
        };
      });
    } catch (err) {
      throw new DomainError(
        "bad_request",
        `خطا در تولید هوشمند سؤالات با هوش مصنوعی: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
