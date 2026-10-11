import { describe, it, expect } from "vitest";
import {
  buildQuizGenerationUserPrompt,
  type QuizGenerationPromptParams,
} from "../prompt-registry.js";
import {
  asQuestionPatternId,
  asQuestionPatternExampleId,
  type UUID,
  type QuestionPatternDefinition,
} from "@avana/domain";

// eslint-disable-next-line no-secrets/no-secrets
describe("buildQuizGenerationUserPrompt Pattern Compatibility", () => {
  const baseParams: QuizGenerationPromptParams = {
    documentTitle: "فارماکولوژی قلب و عروق",
    sessionBlueprint: JSON.stringify({ index: 0, title: "بتابلاکرها", coreConcepts: ["گیرنده‌های بتا"] }),
    targetQuizCount: 5,
    lessonContent: "درسنامه کامل بتابلاکرها...",
    chunkContext: "[Chunk ID: c1] متن منبع...",
    chunkIdList: ["c1", "c2"],
  };

  it("produces character-by-character identical prompt when pattern is undefined or null", () => {
    const promptNoPattern = buildQuizGenerationUserPrompt({
      ...baseParams,
    });

    const promptNullPattern = buildQuizGenerationUserPrompt({
      ...baseParams,
      pattern: null,
    });

    // Character-by-character equality
    expect(promptNullPattern).toBe(promptNoPattern);
    expect(promptNullPattern.length).toBe(promptNoPattern.length);
    expect(promptNoPattern).not.toContain("QUESTION PATTERN — STRUCTURAL & COGNITIVE GUIDANCE");
  });

  it("appends structural guidance, few-shot examples, and strict grounding rules when pattern is provided", () => {
    const patternId = asQuestionPatternId("11111111-1111-1111-1111-111111111111" as UUID);
    const exampleId = asQuestionPatternExampleId("22222222-2222-2222-2222-222222222222" as UUID);
    const mockPattern: QuestionPatternDefinition = {
      id: patternId,
      title: "الگوی سناریوی بالینی دو‌مرحله‌ای",
      description: "سؤالاتی با شرح حال بیمار و تصمیم‌گیری درمانی",
      cognitiveLevel: "analyze",
      skills: ["clinical_reasoning", "scenario_analysis"],
      systemInstructions: "سؤال باید با یک سناریوی بالینی کوتاه آغاز شود و تمرکز بر انتخاب داروی خط اول باشد.",
      isActive: true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      examples: [
        {
          id: exampleId,
          questionPatternId: patternId,
          question: "بیمار مرد ۵۵ ساله با سابقه آسم به علت فشار خون بالا مراجعه کرده است. کدام دارو انتخاب اول است؟",
          choices: ["متوپرولول", "پروپرانولول", "تیمولول", "نادولول"],
          correctAnswer: "متوپرولول",
          explanation: "متوپرولول بتابلاکر کاردیوسلکتیو است و اسپاسم برونش کمتری ایجاد می‌کند.",
          clinicalContext: "بیمار سرپایی مبتلا به برونکواسپاسم",
          sortOrder: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const promptWithPattern = buildQuizGenerationUserPrompt({
      ...baseParams,
      pattern: mockPattern,
    });

    expect(promptWithPattern).toContain("QUESTION PATTERN — STRUCTURAL & COGNITIVE GUIDANCE:");
    expect(promptWithPattern).toContain("Pattern Title: \"الگوی سناریوی بالینی دو‌مرحله‌ای\"");
    expect(promptWithPattern).toContain("Cognitive Level: analyze");
    expect(promptWithPattern).toContain("Target Skills: clinical_reasoning, scenario_analysis");
    expect(promptWithPattern).toContain("Structural Instructions:\nسؤال باید با یک سناریوی بالینی کوتاه آغاز شود");
    expect(promptWithPattern).toContain("STRICT ANTI-HALLUCINATION & GROUNDING INVARIANT:");
    expect(promptWithPattern).toContain("Do NOT copy, transfer, or introduce any facts, scenarios, patient cases, drugs, or clinical details from the pattern examples into the generated questions.");
    expect(promptWithPattern).toContain("[Reference Example 1]");
    expect(promptWithPattern).toContain("بیمار سرپایی مبتلا به برونکواسپاسم");
    expect(promptWithPattern).toContain("متوپرولول");

    // Must still retain original base sections and output instructions
    expect(promptWithPattern).toContain("TASK: GENERATE HIGH-QUALITY MULTIPLE-CHOICE QUESTIONS FOR EXACTLY ONE EDUCATIONAL SESSION.");
    expect(promptWithPattern).toContain("OUTPUT INSTRUCTIONS:");
  });
});
