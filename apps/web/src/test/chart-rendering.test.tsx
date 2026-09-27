import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { ChartBlock } from "../components/chart/ChartBlock.js";
import { ChartFallbackBlock } from "../components/chart/ChartFallbackBlock.js";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import type { EducationalChart } from "@avana/domain";

describe("Educational Chart Web Rendering Suite", () => {
  describe("ChartBlock Direct SVG Rendering", () => {
    it("renders a bar chart with title, unit, and bars", () => {
      const barChart: EducationalChart = {
        type: "bar",
        title: "کاهش فشار خون سیستولیک",
        description: "مقایسه داروهای خط اول بر حسب mmHg",
        yAxis: { label: "فشار خون", unit: "mmHg" },
        series: [
          {
            name: "سیستولیک",
            data: [
              { label: "لوزارتان", value: 16 },
              { label: "آملودیپین", value: 20 },
            ],
          },
        ],
      };

      const { container } = render(<ChartBlock chart={barChart} />);

      expect(screen.getByText("کاهش فشار خون سیستولیک")).toBeDefined();
      expect(screen.getByText("مقایسه داروهای خط اول بر حسب mmHg")).toBeDefined();
      expect(screen.getByText("لوزارتان")).toBeDefined();
      expect(screen.getByText("آملودیپین")).toBeDefined();
      expect(screen.getByText("(mmHg)")).toBeDefined();

      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      const rects = container.querySelectorAll("rect");
      expect(rects.length).toBeGreaterThanOrEqual(2);
    });

    it("renders a scientific line chart with straight segments and markers", () => {
      const lineChart: EducationalChart = {
        type: "line",
        title: "پروفایل غلظت دارویی",
        xAxis: { label: "زمان", unit: "ساعت" },
        yAxis: { label: "غلظت", unit: "mg/L" },
        series: [
          {
            name: "دوز خوراکی",
            data: [
              { x: 0, y: 0 },
              { x: 2, y: 15.5 },
              { x: 4, y: 7.2 },
            ],
          },
        ],
      };

      const { container } = render(<ChartBlock chart={lineChart} />);

      expect(screen.getByText("پروفایل غلظت دارویی")).toBeDefined();
      expect(screen.getByText("(mg/L)")).toBeDefined();
      expect(screen.getByText("(ساعت)")).toBeDefined();

      const svg = container.querySelector("svg[role='img']");
      expect(svg).not.toBeNull();

      const path = svg?.querySelector("path");
      expect(path).not.toBeNull();
      // Verifies straight line commands M ... L ... L ...
      expect(path?.getAttribute("d")).toContain("M");
      expect(path?.getAttribute("d")).toContain("L");

      // Verify circle marker dots
      const circles = svg?.querySelectorAll("circle");
      expect(circles?.length).toBe(3);
    });

    it("renders a pie / donut chart with percentage and legend", () => {
      const pieChart: EducationalChart = {
        type: "pie",
        title: "توزیع مرحله بیماری",
        unit: "%",
        series: [
          {
            name: "مراحل",
            data: [
              { label: "مرحله خفیف", value: 60 },
              { label: "مرحله شدید", value: 40 },
            ],
          },
        ],
      };

      const { container } = render(<ChartBlock chart={pieChart} />);

      expect(screen.getByText("توزیع مرحله بیماری")).toBeDefined();
      expect(screen.getByText("مرحله خفیف")).toBeDefined();
      expect(screen.getByText("مرحله شدید")).toBeDefined();

      const svg = container.querySelector("svg[role='img']");
      expect(svg).not.toBeNull();
      const paths = svg?.querySelectorAll("path");
      expect(paths?.length).toBe(2);
    });

    it("renders a scatter plot with Cartesian (x, y) coordinates", () => {
      const scatterChart: EducationalChart = {
        type: "scatter",
        title: "همبستگی دوز و پاسخ",
        xAxis: { label: "دوز", unit: "mg" },
        yAxis: { label: "اثر درمانی", unit: "%" },
        series: [
          {
            name: "گروه تست",
            data: [
              { x: 10, y: 25 },
              { x: 20, y: 50 },
              { x: 30, y: 75 },
            ],
          },
        ],
      };

      const { container } = render(<ChartBlock chart={scatterChart} />);

      expect(screen.getByText("همبستگی دوز و پاسخ")).toBeDefined();
      const svg = container.querySelector("svg[role='img']");
      expect(svg).not.toBeNull();
      const circles = svg?.querySelectorAll("circle");
      expect(circles?.length).toBe(3);
    });
  });

  describe("ChartFallbackBlock", () => {
    it("renders fallback message and toggleable raw code without crashing", () => {
      render(
        <ChartFallbackBlock
          rawContent='{"type": "invalid"}'
          title="نمودار خراب"
          reason="خطا در ساختار داده‌ای نمودار"
        />,
      );

      expect(screen.getByText("نمودار خراب")).toBeDefined();
      expect(screen.getByText("خطا در ساختار داده‌ای نمودار")).toBeDefined();
      expect(screen.getByTestId("chart-fallback-toggle")).toBeDefined();
    });
  });

  describe("MarkdownRenderer Integration & Block Sequence", () => {
    it("renders Markdown containing text, chart, text, table, and formula in exact order", async () => {
      const lessonMarkdown = `
# فارماکوکینتیک داروی لیدوکائین

متن مقدماتی در مورد جذب و توزیع دارو در بدن بیمار.

\`\`\`chart
{
  "type": "line",
  "title": "منحنی غلظت بر حسب زمان",
  "xAxis": { "label": "زمان", "unit": "ساعت" },
  "yAxis": { "label": "غلظت", "unit": "mg/L" },
  "series": [
    {
      "name": "لیدوکائین",
      "data": [
        { "x": 0, "y": 0 },
        { "x": 1, "y": 12 },
        { "x": 3, "y": 6 }
      ]
    }
  ]
}
\`\`\`

متن تحلیلی پس از نمودار و بررسی نیمه‌عمر دارویی.

| پارامتر | مقدار | واحد |
|---|---|---|
| نیمه‌عمر ($t_{1/2}$) | ۱.۶ | ساعت |
| کلیرانس ($CL$) | ۰.۶ | L/h/kg |

معادله محاسبه دوز بارگیری:
$$Dose = V_d \\times C_{target}$$

متن پایانی درسنامه.
`;

      const { container } = render(<MarkdownRenderer content={lessonMarkdown} />);

      // Verify text elements
      expect(screen.getByText(/فارماکوکینتیک داروی لیدوکائین/)).toBeDefined();
      expect(screen.getByText(/متن مقدماتی در مورد جذب و توزیع/)).toBeDefined();
      expect(screen.getByText(/متن تحلیلی پس از نمودار/)).toBeDefined();
      expect(screen.getByText(/متن پایانی درسنامه/)).toBeDefined();

      // Verify table rendered
      const table = container.querySelector("table");
      expect(table).not.toBeNull();
      expect(screen.getByText("پارامتر")).toBeDefined();

      // Wait for chart lazy component to render
      await waitFor(() => {
        expect(screen.getByText("منحنی غلظت بر حسب زمان")).toBeDefined();
      });

      // Verify chart block rendered
      expect(screen.getByTestId("chart-block")).toBeDefined();
    });

    it("renders fallback block gracefully when chart block in Markdown has invalid JSON without breaking rest of lesson", async () => {
      const lessonWithBrokenChart = `
# درسنامه با نمودار نامعتبر

پاراگراف اول درسنامه.

\`\`\`chart
{
  "type": "bar",
  "title": "نمودار شکسته",
  "data": [
    { "label": "دسته اول", "value": "not_a_valid_number" }
  ]
}
\`\`\`

پاراگراف دوم درسنامه که باید بدون مشکل نمایش داده شود.
`;

      render(<MarkdownRenderer content={lessonWithBrokenChart} />);

      expect(screen.getByText("پاراگراف اول درسنامه.")).toBeDefined();
      expect(screen.getByText("پاراگراف دوم درسنامه که باید بدون مشکل نمایش داده شود.")).toBeDefined();

      await waitFor(() => {
        expect(screen.getByTestId("chart-fallback-block")).toBeDefined();
      });
    });

    it("handles all required invalid chart invariants without crashing the lesson", async () => {
      const invalidCases = [
        { name: "invalid JSON", code: "```chart\n{not_valid_json}\n```" },
        { name: "missing type", code: "```chart\n{\"title\": \"بدون نوع\"}\n```" },
        { name: "unknown type", code: "```chart\n{\"type\": \"radar\", \"title\": \"نوع ناشناخته\"}\n```" },
        { name: "empty data", code: "```chart\n{\"type\": \"bar\", \"title\": \"بدون داده\", \"data\": []}\n```" },
        { name: "NaN", code: "```chart\n{\"type\": \"line\", \"title\": \"NaN\", \"data\": [{\"x\": 0, \"y\": \"NaN\"}]}\n```" },
        { name: "Infinity", code: "```chart\n{\"type\": \"line\", \"title\": \"Infinity\", \"data\": [{\"x\": 0, \"y\": \"Infinity\"}]}\n```" },
        { name: "negative pie value", code: "```chart\n{\"type\": \"pie\", \"title\": \"پای منفی\", \"data\": [{\"label\": \"الف\", \"value\": -10}]}\n```" },
        { name: "invalid scatter coordinates", code: "```chart\n{\"type\": \"scatter\", \"title\": \"اسکتر ناقص\", \"data\": [{\"x\": \"bad\"}]}\n```" },
        {
          name: ">250 data points",
          code: `\`\`\`chart\n${JSON.stringify({
            type: "line",
            title: "بیش از ۲۵۰ نقطه",
            data: Array.from({ length: 260 }, (_, i) => ({ x: i, y: i })),
          })}\n\`\`\``,
        },
      ];

      for (const { name, code } of invalidCases) {
        const md = `# آزمون ${name}\n\nمتن درس قبل\n\n${code}\n\nمتن درس بعد`;
        const { unmount } = render(<MarkdownRenderer content={md} />);
        expect(screen.getByText("متن درس قبل")).toBeDefined();
        expect(screen.getByText("متن درس بعد")).toBeDefined();
        await waitFor(() => {
          expect(screen.getByTestId("chart-fallback-block")).toBeDefined();
        });
        unmount();
      }
    });

    it("verifies security: prevents script, raw HTML, and event handler injection from chart JSON", () => {
      const maliciousChart: EducationalChart = {
        type: "bar",
        title: "<script>window.pwned=true;</script>",
        description: "<img src=x onerror=window.pwned=true />",
        unit: "javascript:alert(1)",
        series: [
          {
            name: "<svg onload=alert(1)>",
            data: [
              { label: "<div id='injected'></div>", value: 10 },
            ],
          },
        ],
      };

      const { container } = render(<ChartBlock chart={maliciousChart} />);

      // Verify no executable script or injected div exists in DOM
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("#injected")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect((window as unknown as Record<string, unknown>).pwned).toBeUndefined();

      // Verify dangerous strings are rendered strictly as escaped plain text
      expect(screen.getByText("<script>window.pwned=true;</script>")).toBeDefined();
      expect(screen.getByText("<img src=x onerror=window.pwned=true />")).toBeDefined();
    });

    it("renders the exact seed course content sequence: text -> Line Chart -> text -> Bar Chart -> text -> Table -> Formula", async () => {
      const { CHARTS_TEST_LESSON_MARKDOWN } = await import("../../../../database/seeds/seed-charts.js");
      const { container } = render(<MarkdownRenderer content={CHARTS_TEST_LESSON_MARKDOWN} />);

      // 1. Text (Section 1)
      expect(screen.getByText(/مقدمه و فارماکوکینتیک بالینی/)).toBeDefined();

      // 2. Line Chart
      await waitFor(() => {
        expect(screen.getByText("پروفایل غلظت پلاسمایی بر حسب زمان")).toBeDefined();
      });

      // 3. Text (Section 2)
      expect(screen.getByText(/تحلیل فارماکودینامیک و پاسخ بالینی/)).toBeDefined();

      // 4. Bar Chart
      await waitFor(() => {
        expect(screen.getByText("کاهش میانگین فشار خون در گروه‌های درمانی")).toBeDefined();
      });

      // 5. Text (Section 3)
      expect(screen.getByText(/جدول مقایسه‌ای پارامترهای فارماکوکینتیک/)).toBeDefined();

      // 6. Table
      const table = container.querySelector("table");
      expect(table).not.toBeNull();
      expect(screen.getByText("انالاپریل (Enalapril)")).toBeDefined();

      // 7. Formula (Section 4)
      expect(screen.getByText(/روابط ریاضی و محاسبات کلیرانس/)).toBeDefined();
      expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);

      // Verify both chart blocks exist in container
      const chartBlocks = container.querySelectorAll('[data-testid="chart-block"]');
      expect(chartBlocks.length).toBe(2);
      expect(chartBlocks[0].getAttribute("data-chart-type")).toBe("line");
      expect(chartBlocks[1].getAttribute("data-chart-type")).toBe("bar");
    });
  });

  describe("Interactive & Bidi Features", () => {
    it("copies valid JSON payload to clipboard on Copy button click", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const sampleChart: EducationalChart = {
        type: "bar",
        title: "تست کپی JSON",
        series: [
          {
            name: "سری ۱",
            data: [{ label: "دسته الف", value: 10 }],
          },
        ],
      };

      const { fireEvent } = await import("@testing-library/react");
      render(<ChartBlock chart={sampleChart} />);

      const copyBtn = screen.getByRole("button", { name: "کپی داده‌های نمودار" });
      expect(copyBtn).toBeDefined();

      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copiedPayload = JSON.parse(writeTextMock.mock.calls[0][0]);
      expect(copiedPayload.title).toBe("تست کپی JSON");
      expect(copiedPayload.type).toBe("bar");
      expect(copiedPayload.series[0].data[0].value).toBe(10);

      // Verify button feedback state
      await waitFor(() => {
        expect(screen.getByText("کپی شد")).toBeDefined();
      });
    });

    it("correctly isolates mixed Persian and English scientific units (Metformin, mg/L, 12.5)", () => {
      const bidiChart: EducationalChart = {
        type: "line",
        title: "بررسی غلظت داروی متفورمین در پلاسما",
        yAxis: { label: "غلظت سرمی", unit: "mg/L" },
        series: [
          {
            name: "Metformin",
            data: [{ x: 1, y: 12.5 }],
          },
        ],
      };

      render(<ChartBlock chart={bidiChart} />);

      expect(screen.getByText("بررسی غلظت داروی متفورمین در پلاسما")).toBeDefined();
      expect(screen.getByText("Metformin")).toBeDefined();
      expect(screen.getByText("(mg/L)")).toBeDefined();

      // Check unit badge has dir="ltr"
      const unitBadge = screen.getByText("(mg/L)");
      expect(unitBadge.getAttribute("dir")).toBe("ltr");
    });
  });
});
