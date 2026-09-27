/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
import {
  parseChartCodeContent,
  validateEducationalChart,
  extractEducationalChartsFromMarkdown,
  parseFlexibleNumber,
} from "./chart-validation.js";

describe("Educational Chart Domain & Validation Suite", () => {
  describe("parseFlexibleNumber", () => {
    it("parses standard numbers", () => {
      expect(parseFlexibleNumber(42)).toBe(42);
      expect(parseFlexibleNumber(0)).toBe(0);
      expect(parseFlexibleNumber(-15.5)).toBe(-15.5);
    });

    it("parses valid numeric strings", () => {
      expect(parseFlexibleNumber("120")).toBe(120);
      expect(parseFlexibleNumber("7.4")).toBe(7.4);
      expect(parseFlexibleNumber("-3.14")).toBe(-3.14);
      expect(parseFlexibleNumber(" 50 ")).toBe(50);
      expect(parseFlexibleNumber("1,250.50")).toBe(1250.5);
    });

    it("normalizes Persian and Arabic digits", () => {
      expect(parseFlexibleNumber("۱۲.۵")).toBe(12.5);
      expect(parseFlexibleNumber("۱۲۰")).toBe(120);
      expect(parseFlexibleNumber("٠.٧٥")).toBe(0.75);
      expect(parseFlexibleNumber(" -۳۰ ")).toBe(-30);
    });

    it("rejects NaN, Infinity, and malformed strings", () => {
      expect(parseFlexibleNumber(NaN)).toBeNull();
      expect(parseFlexibleNumber(Infinity)).toBeNull();
      expect(parseFlexibleNumber(-Infinity)).toBeNull();
      expect(parseFlexibleNumber("abc")).toBeNull();
      expect(parseFlexibleNumber("")).toBeNull();
      expect(parseFlexibleNumber(null)).toBeNull();
      expect(parseFlexibleNumber(undefined)).toBeNull();
      expect(parseFlexibleNumber({})).toBeNull();
    });
  });

  describe("parseChartCodeContent & JSON Validation", () => {
    it("parses a valid line chart with series and scientific units", () => {
      const json = JSON.stringify({
        type: "line",
        title: "غلظت پلاسمایی داروی پروپرانولول",
        description: "بررسی فارماکوکینتیک بر حسب زمان",
        xAxis: { label: "زمان پس از مصرف", unit: "ساعت" },
        yAxis: { label: "غلظت سرمی", unit: "mg/L" },
        series: [
          {
            name: "دوز ۴۰ میلی‌گرم",
            data: [
              { x: 0, y: 0 },
              { x: 1, y: 15.2 },
              { x: 2, y: 30.5 },
              { x: 4, y: 18.0 },
              { x: 8, y: 5.1 },
            ],
          },
        ],
      });

      const parsed = parseChartCodeContent(json, "chart");
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("line");
      expect(parsed?.title).toBe("غلظت پلاسمایی داروی پروپرانولول");
      expect(parsed?.xAxis?.unit).toBe("ساعت");
      expect(parsed?.yAxis?.unit).toBe("mg/L");
      expect(parsed?.series).toHaveLength(1);
      expect(parsed?.series[0].data).toHaveLength(5);
      expect(parsed?.series[0].data[1].y).toBe(15.2);

      const validation = validateEducationalChart(parsed!);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("parses a valid grouped bar chart", () => {
      const json = JSON.stringify({
        type: "bar",
        title: "کاهش فشار خون با داروهای مختلف",
        xAxis: { label: "دارو" },
        yAxis: { label: "کاهش فشار خون", unit: "mmHg" },
        series: [
          {
            name: "سیستولیک",
            data: [
              { label: "کاپتوپریل", value: 18 },
              { label: "لوزارتان", value: 16 },
              { label: "آملودیپین", value: 20 },
            ],
          },
          {
            name: "دیاستولیک",
            data: [
              { label: "کاپتوپریل", value: 10 },
              { label: "لوزارتان", value: 9 },
              { label: "آملودیپین", value: 12 },
            ],
          },
        ],
      });

      const parsed = parseChartCodeContent(json, "chart");
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("bar");
      expect(parsed?.series).toHaveLength(2);

      const validation = validateEducationalChart(parsed!);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("parses a valid pie chart using flat data format", () => {
      const json = JSON.stringify({
        type: "pie",
        title: "توزیع بیماران بر اساس شدت بیماری کلیوی",
        unit: "%",
        data: [
          { label: "مرحله ۱", value: 35 },
          { label: "مرحله ۲", value: 28 },
          { label: "مرحله ۳", value: 22 },
          { label: "مرحله ۴ و ۵", value: 15 },
        ],
      });

      const parsed = parseChartCodeContent(json, "chart");
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("pie");
      expect(parsed?.series[0].data).toHaveLength(4);

      const validation = validateEducationalChart(parsed!);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("parses a valid scatter plot with Cartesian (x, y) coordinates", () => {
      const json = JSON.stringify({
        type: "scatter",
        title: "همبستگی سن و کلیرانس کراتینین",
        xAxis: { label: "سن", unit: "سال" },
        yAxis: { label: "CrCl", unit: "mL/min" },
        series: [
          {
            name: "بیماران مرد",
            data: [
              { x: 25, y: 120 },
              { x: 45, y: 95 },
              { x: 65, y: 65 },
              { x: 80, y: 40 },
            ],
          },
        ],
      });

      const parsed = parseChartCodeContent(json, "chart");
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("scatter");
      expect(parsed?.series[0].data).toHaveLength(4);
      expect(parsed?.series[0].data[0].x).toBe(25);
      expect(parsed?.series[0].data[0].y).toBe(120);

      const validation = validateEducationalChart(parsed!);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("normalizes Persian digits inside JSON data fields seamlessly", () => {
      const json = JSON.stringify({
        type: "bar",
        title: "غلظت داروها",
        data: [
          { label: "آتنولول", value: "۱۲.۵" },
          { label: "پروپرانولول", value: "۲۵" },
          { label: "متوپرولول", value: "۳۷.۸" },
        ],
      });

      const parsed = parseChartCodeContent(json, "chart");
      expect(parsed).not.toBeNull();
      expect(parsed?.series[0].data[0].value).toBe(12.5);
      expect(parsed?.series[0].data[1].value).toBe(25);
      expect(parsed?.series[0].data[2].value).toBe(37.8);

      const validation = validateEducationalChart(parsed!);
      expect(validation.valid).toBe(true);
    });

    it("rejects invalid chart type", () => {
      const json = JSON.stringify({
        type: "radar",
        title: "نمودار راداری",
        data: [{ label: "A", value: 10 }],
      });

      const parsed = parseChartCodeContent(json, "chart");
      expect(parsed).toBeNull();
    });

    it("rejects malformed JSON without throwing exceptions", () => {
      const malformedJson = "{ type: bar, title: missing quotes }";
      expect(() => parseChartCodeContent(malformedJson, "chart")).not.toThrow();
      expect(parseChartCodeContent(malformedJson, "chart")).toBeNull();
    });

    it("rejects non-matching language", () => {
      const json = JSON.stringify({ type: "bar", title: "تست", data: [{ label: "A", value: 10 }] });
      expect(parseChartCodeContent(json, "python")).toBeNull();
      expect(parseChartCodeContent(json, "reaction")).toBeNull();
    });
  });

  describe("validateEducationalChart Invariant Checks", () => {
    it("rejects empty datasets", () => {
      const emptyChart = {
        type: "line" as const,
        title: "نمودار بدون داده",
        series: [],
      };

      const result = validateEducationalChart(emptyChart);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("نمودار فاقد سری داده (series) است.");
    });

    it("rejects series with empty data points", () => {
      const chartWithEmptySeries = {
        type: "bar" as const,
        title: "تست سری خالی",
        series: [{ name: "سری ۱", data: [] }],
      };

      const result = validateEducationalChart(chartWithEmptySeries);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("فاقد نقطه داده معتبر است");
    });

    it("rejects NaN or non-finite numbers in points", () => {
      const chartWithNan = {
        type: "bar" as const,
        title: "نمودار با داده نامعتبر",
        series: [
          {
            name: "سری ۱",
            data: [
              { label: "نقطه ۱", value: 10 },
              { label: "نقطه ۲", value: NaN },
            ],
          },
        ],
      };

      const result = validateEducationalChart(chartWithNan);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("مقدار عددی در سری 1 نقطه 2 نامعتبر است.");
    });

    it("rejects negative values in pie charts", () => {
      const negativePie = {
        type: "pie" as const,
        title: "سهم‌ها با مقدار منفی",
        series: [
          {
            data: [
              { label: "بخش ۱", value: 60 },
              { label: "بخش ۲", value: -10 },
            ],
          },
        ],
      };

      const result = validateEducationalChart(negativePie);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("نمی‌تواند منفی باشد"))).toBe(true);
    });

    it("rejects pie charts where the sum of slices is 0", () => {
      const zeroPie = {
        type: "pie" as const,
        title: "سهم‌های صفر",
        series: [
          {
            data: [
              { label: "بخش ۱", value: 0 },
              { label: "بخش ۲", value: 0 },
            ],
          },
        ],
      };

      const result = validateEducationalChart(zeroPie);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("بزرگ‌تر از صفر باشد"))).toBe(true);
    });

    it("rejects scatter points with missing or non-numeric x or y coordinates", () => {
      const invalidScatter = {
        type: "scatter" as const,
        title: "اسکاتر نامعتبر",
        series: [
          {
            data: [
              { x: 10, y: 20 },
              { x: "not-a-number" as unknown as number, y: 30 },
            ],
          },
        ],
      };

      const result = validateEducationalChart(invalidScatter);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("مختصات x در سری 1 نقطه 2 نامعتبر یا خالی است.");
    });
  });

  describe("extractEducationalChartsFromMarkdown", () => {
    it("extracts valid charts from lesson markdown while ignoring malformed ones", () => {
      const markdown = `
# درس فارماکولوژی قلب و عروق

در این درس به بررسی اثرات آتنولول بر فشار خون می‌پردازیم.

\`\`\`chart
{
  "type": "bar",
  "title": "فشار خون سیستولیک",
  "data": [
    { "label": "پایه", "value": 150 },
    { "label": "هفته ۴", "value": 130 }
  ]
}
\`\`\`

توضیحات میانی درسنامه و بررسی غلظت خونی:

\`\`\`chart
{
  "type": "invalid_type",
  "title": "نمودار خراب"
}
\`\`\`

\`\`\`chart
{
  "type": "line",
  "title": "تغییرات غلظت دارویی",
  "data": [
    { "x": 0, "y": 0 },
    { "x": 2, "y": 12.5 }
  ]
}
\`\`\`

جمع‌بندی پایانی جلسه.
`;

      const extracted = extractEducationalChartsFromMarkdown(markdown);
      expect(extracted).toHaveLength(2);
      expect(extracted[0].type).toBe("bar");
      expect(extracted[0].title).toBe("فشار خون سیستولیک");
      expect(extracted[1].type).toBe("line");
      expect(extracted[1].title).toBe("تغییرات غلظت دارویی");
    });
  });

  describe("Scientific Data Fidelity & Resource Protection", () => {
    it("preserves high-precision scientific decimals without rounding or truncation", () => {
      const parsedVal = parseFlexibleNumber("0.003525");
      expect(parsedVal).toBe(0.003525);

      // Verify exact user-specified decimal test cases
      const exactCases = [0.0035, 0.0125, 12.5, 125.123456];
      for (const val of exactCases) {
        expect(parseFlexibleNumber(val)).toBe(val);
        expect(parseFlexibleNumber(String(val))).toBe(val);
      }

      const chart = parseChartCodeContent(
        JSON.stringify({
          type: "line",
          title: "غلظت داروی نانوگرم",
          data: [
            { x: 0, y: 0.0035 },
            { x: 1, y: 0.0125 },
            { x: 2, y: 12.5 },
            { x: 3, y: 125.123456 },
          ],
        }),
      );
      expect(chart).not.toBeNull();
      const validation = validateEducationalChart(chart!);
      expect(validation.valid).toBe(true);
      expect(validation.chart?.series[0].data[0].y).toBe(0.0035);
      expect(validation.chart?.series[0].data[1].y).toBe(0.0125);
      expect(validation.chart?.series[0].data[2].y).toBe(12.5);
      expect(validation.chart?.series[0].data[3].y).toBe(125.123456);
    });

    it("rejects charts exceeding maximum allowed points to prevent browser freeze", () => {
      const hugeData = Array.from({ length: 300 }, (_, i) => ({
        x: i,
        y: Math.random() * 10,
      }));

      const chart = parseChartCodeContent(
        JSON.stringify({
          type: "line",
          title: "داده‌های عظیم غیرمجاز",
          data: hugeData,
        }),
      );
      expect(chart).not.toBeNull();
      const validation = validateEducationalChart(chart!);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain("بیشتر است");
    });
  });
});

