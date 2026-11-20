import crypto from "node:crypto";
import type { ModelGateway } from "../generation/gateway/types.js";
import { DomainError, asOrganizationId, asDocumentId } from "@avana/domain";
import type {
  StudioAiGenerateInput,
  StudioAiGeneratedQuestion,
} from "./types.js";

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
   * Generates multiple-choice marketing/educational questions using Gemini.
   */
  async generateQuestions(
    input: StudioAiGenerateInput,
  ): Promise<StudioAiGeneratedQuestion[]> {
    const count = Math.min(Math.max(input.count || 1, 1), 10);
    const typeLabel = QUESTION_TYPE_LABELS[input.questionType] || input.questionType;

    const systemPrompt = `تو متخصص ارشد طراحی آزمون‌های تخصصی داروسازی، پزشکی و فارماکولوژی در پلتفرم آموزشی AVANA هستی.
وظیفه تو تولید آزمون‌های چهارگزینه‌ای دقیق، استاندارد و جذاب به زبان فارسی برای بازاریابی و جذب مخاطبان پزشکی است.

قوانین الزامی:
۱. سؤالات کاملاً مستند و مبتنی بر منابع معتبر فارماکولوژی (مانند کاتزونگ، گودمن و گیلمن) باشند.
۲. هر سؤال دقیقاً دارای ۴ گزینه مشخص باشد.
۳. گزینه‌های انحرافی (Distractors) باید کاملاً منطقی، چالش‌برانگیز و باورپذیر باشند؛ از گزینه‌های بدیهی و بی‌ارتباط خودداری کن.
۴. فیلد correctAnswer باید شناسه گزینه صحیح (مثلاً "1" یا "2" یا "3" یا "4") را درون شیء { "choiceId": "..." } مشخص کند.
۵. تشریح پاسخ (explanation) باید روان، آموزنده و شامل دلیل درستی گزینه صحیح و رد گزینه‌های دیگر باشد.
۶. خروجی باید منحصراً یک آرایه JSON معتبر از اشیاء بدون هیچ توضیح اضافه یا Markdown کد بلاک در خارج از JSON باشد.`;

    let userPrompt = `لطفاً تعداد ${count} سؤال چهارگزینه‌ای با مشخصات زیر تولید کن:
- موضوع: ${input.topic}
- نوع سؤال: ${typeLabel} (${input.questionType})
- سطح دشواری: ${input.difficulty}
`;

    if (input.instructions?.trim()) {
      userPrompt += `- دستورالعمل و تأکیدات مدیر: ${input.instructions.trim()}\n`;
    }

    if (input.sampleQuestions && input.sampleQuestions.length > 0) {
      userPrompt += `\nنمونه سؤالات مبنا (الگوی نگارش، عمق استدلال و سطح گزینه‌ها را از این نمونه‌ها یاد بگیر، اما سؤالات جدید و غیرتکراری خلق کن):\n`;
      input.sampleQuestions.forEach((s, idx) => {
        userPrompt += `نمونه ${idx + 1}:\nسؤال: ${s.question}\n`;
        if (s.choices) {
          userPrompt += `گزینه‌ها: ${s.choices.join(" | ")}\n`;
        }
        if (s.explanation) {
          userPrompt += `توضیح: ${s.explanation}\n`;
        }
      });
    }

    userPrompt += `
فرمت پاسخ JSON مورد انتظار:
[
  {
    "question": "متن سؤال به زبان فارسی...",
    "choices": [
      { "id": "1", "text": "گزینه اول..." },
      { "id": "2", "text": "گزینه دوم..." },
      { "id": "3", "text": "گزینه سوم..." },
      { "id": "4", "text": "گزینه چهارم..." }
    ],
    "correctAnswer": { "choiceId": "1" },
    "explanation": "تشریح علمی دلیل درستی گزینه...",
    "difficulty": "${input.difficulty}",
    "topic": "${input.topic}",
    "questionType": "${input.questionType}"
  }
]`;

    try {
      const response = await this.modelGateway.complete({
        promptVersion: "1.0",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        correlationId: crypto.randomUUID(),
        organizationId: asOrganizationId(crypto.randomUUID()),
        documentId: asDocumentId(crypto.randomUUID()),
        stage: "marketing_quiz",
      });

      const text = response.text?.trim() || "";
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned) as StudioAiGeneratedQuestion[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("پاسخ مدل ساختار آرایه مورد نظر را ندارد");
      }

      return parsed.map((item, idx) => ({
        question: item.question || `سؤال ${idx + 1}`,
        choices: Array.isArray(item.choices) && item.choices.length >= 2
          ? item.choices.map((c, cIdx) => ({
              id: c.id ? String(c.id) : String(cIdx + 1),
              text: c.text || `گزینه ${cIdx + 1}`,
            }))
          : [
              { id: "1", text: "گزینه ۱" },
              { id: "2", text: "گزینه ۲" },
              { id: "3", text: "گزینه ۳" },
              { id: "4", text: "گزینه ۴" },
            ],
        correctAnswer:
          typeof item.correctAnswer === "object" && item.correctAnswer !== null && "choiceId" in item.correctAnswer
            ? { choiceId: String(item.correctAnswer.choiceId) }
            : { choiceId: typeof item.correctAnswer === "string" ? item.correctAnswer : "1" },
        explanation: item.explanation || "",
        difficulty: input.difficulty,
        topic: input.topic,
        questionType: input.questionType,
      }));
    } catch (err) {
      throw new DomainError(
        "bad_request",
        `خطا در تولید هوشمند سؤالات با هوش مصنوعی: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
