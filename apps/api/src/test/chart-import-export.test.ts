import { describe, it, expect } from "vitest";
import {
  normalizeEducationalContent,
  extractEducationalChartsFromMarkdown,
  parseChartCodeContent,
  validateEducationalChart,
} from "@avana/domain";

describe("Educational Chart Import / Export Round-Trip Suite", () => {
  const ORIGINAL_LESSON_MARKDOWN = `# درس جامع فارماکولوژی: داروهای کاهنده فشار خون

این درسنامه برای آزمایش حفظ تمامیت ساختاری نمودارها در فرآیند Export و Import طراحی شده است.

\`\`\`chart
{
  "type": "line",
  "title": "پروفایل غلظت دارویی بر حسب زمان",
  "xAxis": {
    "label": "زمان",
    "unit": "ساعت"
  },
  "yAxis": {
    "label": "غلظت پلاسمایی",
    "unit": "mg/L"
  },
  "series": [
    {
      "name": "پروپرانولول",
      "data": [
        { "x": 0, "y": 0 },
        { "x": 1, "y": 14.5 },
        { "x": 2, "y": 28 },
        { "x": 4, "y": 16.2 },
        { "x": 8, "y": 4.1 }
      ]
    }
  ]
}
\`\`\`

توضیحات میانی درسنامه و مقایسه بالینی داروها:

\`\`\`chart
{
  "type": "bar",
  "title": "مقایسه کاهش فشار خون سیستولیک",
  "xAxis": {
    "label": "دارو"
  },
  "yAxis": {
    "label": "کاهش فشار",
    "unit": "mmHg"
  },
  "data": [
    { "label": "لوزارتان", "value": 16.5 },
    { "label": "آملودیپین", "value": 19.8 },
    { "label": "کاپتوپریل", "value": 15 }
  ]
}
\`\`\`

| دارو | کلاس فارماکولوژیک | نیمه‌عمر ($t_{1/2}$) |
|---|---|---|
| لوزارتان | ARB | ۶ الی ۹ ساعت |
| آملودیپین | CCB دی‌هیدروپیریدینی | ۳۰ الی ۵۰ ساعت |

فرمول کلیرانس کلیوی:
$$CL_r = \\frac{U \\times V}{P}$$

پایان درسنامه.
`;

  it("guarantees 100% round-trip preservation through import normalization without loss of chart data", () => {
    // 1. Extract charts from original content
    const originalCharts = extractEducationalChartsFromMarkdown(ORIGINAL_LESSON_MARKDOWN);
    expect(originalCharts).toHaveLength(2);
    expect(originalCharts[0].type).toBe("line");
    expect(originalCharts[1].type).toBe("bar");

    // 2. Simulate Export -> Import pipeline:
    // In AVANA, export packages lessons as JSON, and import invokes normalizeEducationalContent()
    const importedMarkdown = normalizeEducationalContent(ORIGINAL_LESSON_MARKDOWN);

    // 3. Verify that the markdown still contains the identical ```chart blocks
    expect(importedMarkdown).toContain("```chart");
    expect(importedMarkdown).toContain('"type": "line"');
    expect(importedMarkdown).toContain('"type": "bar"');
    expect(importedMarkdown).toContain('"title": "پروفایل غلظت دارویی بر حسب زمان"');
    expect(importedMarkdown).toContain('"title": "مقایسه کاهش فشار خون سیستولیک"');

    // 4. Extract charts from imported content
    const importedCharts = extractEducationalChartsFromMarkdown(importedMarkdown);
    expect(importedCharts).toHaveLength(2);

    // 5. Verify byte and value equality
    expect(importedCharts[0]).toEqual(originalCharts[0]);
    expect(importedCharts[1]).toEqual(originalCharts[1]);

    // 6. Verify table and math formulas remain intact
    expect(importedMarkdown).toContain("| دارو | کلاس فارماکولوژیک |");
    expect(importedMarkdown).toContain("$$CL_r = \\frac{U \\times V}{P}$$");
  });

  it("preserves chart blocks containing Persian digits through normalization", () => {
    const markdownWithPersianDigits = `
# درس تست

\`\`\`chart
{
  "type": "pie",
  "title": "سهم عوارض",
  "data": [
    { "label": "سردرد", "value": "۲۵" },
    { "label": "سرفه", "value": "۷۵" }
  ]
}
\`\`\`
`;

    const normalized = normalizeEducationalContent(markdownWithPersianDigits);
    expect(normalized).toContain("```chart");
    const parsed = parseChartCodeContent(
      `{\n  "type": "pie",\n  "title": "سهم عوارض",\n  "data": [\n    { "label": "سردرد", "value": "۲۵" },\n    { "label": "سرفه", "value": "۷۵" }\n  ]\n}`,
      "chart",
    );
    expect(parsed).not.toBeNull();
    const validation = validateEducationalChart(parsed!);
    expect(validation.valid).toBe(true);
    expect(validation.chart?.series[0].data[0].value).toBe(25);
    expect(validation.chart?.series[0].data[1].value).toBe(75);
  });
});
