/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
import {
  buildLessonGenerationUserPrompt,
  buildLessonBatchGenerationUserPrompt,
  getLessonGenerationTemplate,
  EDUCATIONAL_CHART_POLICY,
} from "../modules/generation/prompt-registry.js";
import {
  extractEducationalChartsFromMarkdown,
  parseChartCodeContent,
  validateEducationalChart,
} from "@avana/domain";

describe("Educational Chart AI Prompt & Pipeline Policy Suite", () => {
  it("ensures EDUCATIONAL_CHART_POLICY defines strict anti-hallucination and decision framework", () => {
    expect(EDUCATIONAL_CHART_POLICY).toContain("12.3. SCIENTIFIC & EDUCATIONAL CHART POLICY");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Condition A (Chart in Reference)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Condition B (Quantitative Data in Reference)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Condition C (Insufficient or Missing Data)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Strict Anti-Hallucination & Scientific Fidelity Rules");
    expect(EDUCATIONAL_CHART_POLICY).toContain("NEVER invent numbers, percentages, values, data points");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Supported types: \"bar\", \"line\", \"pie\", \"scatter\"");
  });

  it("ensures buildLessonGenerationUserPrompt contains Section 12.3 Chart Policy", () => {
    const prompt = buildLessonGenerationUserPrompt({
      documentTitle: "فارماکولوژی قلب و عروق",
      sessionBlueprint: "{}",
      chunkContext: "اطلاعات مربوط به داروی متوپرولول",
      chunkIdList: ["chunk-1", "chunk-2"],
    });

    expect(prompt).toContain("12.3. SCIENTIFIC & EDUCATIONAL CHART POLICY");
    expect(prompt).toContain("NEVER invent numbers, percentages, values, data points");
    expect(prompt).toContain("```chart");
  });

  it("ensures buildLessonBatchGenerationUserPrompt contains Section 12.3 Chart Policy", () => {
    const batchPrompt = buildLessonBatchGenerationUserPrompt({
      documentTitle: "فارماکولوژی",
      sessions: [
        {
          sessionIndex: 0,
          sessionTitle: "جلسه اول",
          sessionBlueprint: "{}",
          chunkContext: "چانک ۱",
          chunkIdList: ["chunk-1"],
        },
      ],
    });

    expect(batchPrompt).toContain("12.3. SCIENTIFIC & EDUCATIONAL CHART POLICY");
  });

  it("ensures getLessonGenerationTemplate contains Section 12.3 Chart Policy", () => {
    const template = getLessonGenerationTemplate();
    expect(template).toContain("12.3. SCIENTIFIC & EDUCATIONAL CHART POLICY");
  });

  it("extracts and validates charts from generated lesson markdown", () => {
    const simulatedGeneratedMarkdown = `
# مبحث فارماکوکینتیک بالینی

در این جلسه تغییرات غلظت داروی دیگوکسین پس از مصرف خوراکی بررسی می‌شود.

\`\`\`chart
{
  "type": "line",
  "title": "منحنی غلظت سرمی دیگوکسین",
  "xAxis": { "label": "زمان", "unit": "h" },
  "yAxis": { "label": "غلظت", "unit": "ng/mL" },
  "series": [
    {
      "name": "دوز 0.25mg",
      "data": [
        { "x": 0, "y": 0 },
        { "x": 1, "y": 2.5 },
        { "x": 2, "y": 1.8 },
        { "x": 6, "y": 1.1 }
      ]
    }
  ]
}
\`\`\`

نکات بالینی در رابطه با محدوده درمانی باریک دارو (0.8 - 2.0 ng/mL).
`;

    const extracted = extractEducationalChartsFromMarkdown(simulatedGeneratedMarkdown);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].type).toBe("line");
    expect(extracted[0].title).toBe("منحنی غلظت سرمی دیگوکسین");
    expect(extracted[0].series[0].data).toHaveLength(4);
  });

  it("gracefully tolerates malformed AI chart generation without corrupting the lesson", () => {
    const malformedChartMarkdown = `
# درسنامه

متن قبل

\`\`\`chart
{
  "type": "scatter",
  "title": "داده ناقص",
  "series": [
    { "name": "تست", "data": [{ "x": 10 }] }
  ]
}
\`\`\`

متن بعد
`;

    // parseChartCodeContent parses the JSON
    const parsed = parseChartCodeContent(
      `{\n  "type": "scatter",\n  "title": "داده ناقص",\n  "series": [\n    { "name": "تست", "data": [{ "x": 10 }] }\n  ]\n}`,
      "chart",
    );
    expect(parsed).not.toBeNull();

    // validateEducationalChart detects missing 'y' coordinate
    const validation = validateEducationalChart(parsed!);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);

    // Extraction ignores invalid charts, preserving system stability
    const extracted = extractEducationalChartsFromMarkdown(malformedChartMarkdown);
    expect(extracted).toHaveLength(0);
  });

  it("verifies LANGUAGE_REQUIREMENT_PROMPT and LESSON_GENERATION_SYSTEM_PROMPT are connected", async () => {
    const { LANGUAGE_REQUIREMENT_PROMPT, LESSON_GENERATION_SYSTEM_PROMPT } = await import(
      "../modules/generation/prompt-registry.js"
    );
    expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("SCIENTIFIC & EDUCATIONAL CHART POLICY");
    expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("Anti-Hallucination Guard: NEVER invent numbers");
    expect(LESSON_GENERATION_SYSTEM_PROMPT).toBe("You produce structured JSON educational lesson content.");
  });
});

