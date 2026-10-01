/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
import {
  buildLessonGenerationUserPrompt,
  buildLessonBatchGenerationUserPrompt,
  getLessonGenerationTemplate,
  getContentPlanningTemplate,
  EDUCATIONAL_CHART_POLICY,
} from "../modules/generation/prompt-registry.js";
import {
  extractEducationalChartsFromMarkdown,
  parseChartCodeContent,
  validateEducationalChart,
} from "@avana/domain";

describe("Educational Chart AI Prompt & Pipeline Policy Suite", () => {
  it("ensures EDUCATIONAL_CHART_POLICY defines strict anti-hallucination and decision framework including Condition D", () => {
    expect(EDUCATIONAL_CHART_POLICY).toContain("12.3. SCIENTIFIC & EDUCATIONAL CHART POLICY");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Condition A (Chart in Reference)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Condition B (Quantitative Data in Reference)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Condition C (Insufficient or Missing Data)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Condition D (Canonical Scientific & Pharmacological Conceptual Curves)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Strict Anti-Hallucination & Scientific Fidelity Rules");
    expect(EDUCATIONAL_CHART_POLICY).toContain("NEVER invent numbers, percentages, values, data points");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Supported types: \"bar\", \"line\", \"pie\", \"scatter\"");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Supported modes: \"data\" (default, empirical with source citation), \"conceptual\" (theoretical/canonical curves)");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Density Cap: Maximum 1-2 charts per session");
    expect(EDUCATIONAL_CHART_POLICY).toContain("Example 2: Canonical Scientific Conceptual Curve");
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

  it("extracts and validates canonical conceptual charts with parametric curves from generated lesson markdown", () => {
    const lessonWithConceptualChart = `
# فارماکودینامیک: برهم‌کنش دارو-گیرنده

در این بخش، اثر آنتاگونیست رقابتی برگشت‌پذیر بر منحنی دوز-پاسخ آگونیست بررسی می‌شود.

\`\`\`chart
{
  "type": "line",
  "title": "آنتاگونیسم رقابتی برگشت‌پذیر و شیفت به راست",
  "mode": "conceptual",
  "xAxis": { "label": "غلظت آگونیست (M)", "unit": "M", "scale": "log", "min": 1e-10, "max": 1e-4 },
  "yAxis": { "label": "پاسخ زیستی", "unit": "%", "min": 0, "max": 100 },
  "curves": [
    {
      "name": "آگونیست به تنهایی",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -8 }
    },
    {
      "name": "آگونیست + آنتاگونیست رقابتی",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -6 },
      "lineStyle": "dashed"
    }
  ]
}
\`\`\`

آنتاگونیست رقابتی موجب افزایش EC50 و شیفت موازی منحنی به سمت راست می‌شود، بدون آنکه Emax کاهش یابد.
`;

    const extracted = extractEducationalChartsFromMarkdown(lessonWithConceptualChart);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].type).toBe("line");
    expect(extracted[0].mode).toBe("conceptual");
    expect(extracted[0].curves).toHaveLength(2);
    expect(extracted[0].curves![0].parameters.emax).toBe(100);
    expect(extracted[0].curves![0].parameters.logEC50).toBe(-8);
    expect(extracted[0].curves![1].parameters.logEC50).toBe(-6);

    const validation = validateEducationalChart(extracted[0]);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("ensures getContentPlanningTemplate includes advisory suggestedVisualizations in session blueprints", () => {
    const planningTemplate = getContentPlanningTemplate();
    expect(planningTemplate).toContain("suggestedVisualizations");
    expect(planningTemplate).toContain('"mode": "conceptual"');
    expect(planningTemplate).toContain("شیفت به راست در آنتاگونیسم رقابتی");
  });
});

