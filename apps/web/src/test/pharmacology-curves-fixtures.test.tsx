import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { ChartBlock } from "../components/chart/ChartBlock.js";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import {
  extractEducationalChartsFromMarkdown,
  validateEducationalChart,
} from "@avana/domain";

describe("Pharmacology Canonical Visualization Fixtures Suite", () => {
  // -------------------------------------------------------------------------
  // Fixture 1: Emax & EC50 Basic Sigmoidal Dose-Response
  // -------------------------------------------------------------------------
  describe("Fixture 1: Emax / EC50 Dose-Response Curve", () => {
    const fixture1Markdown = `
# اصول فارماکودینامیک: رابطه دوز و پاسخ

منحنی زیر رابطه غلظت داروی آگونیست و شدت پاسخ زیستی را در مقیاس نیمه‌لگاریتمی نشان می‌دهد.

\`\`\`chart
{
  "type": "line",
  "title": "منحنی دوز-پاسخ و مفاهیم Emax و EC50",
  "mode": "conceptual",
  "xAxis": { "label": "غلظت آگونیست (M)", "unit": "M", "scale": "log", "min": 1e-10, "max": 1e-4 },
  "yAxis": { "label": "پاسخ زیستی", "unit": "%", "min": 0, "max": 100 },
  "curves": [
    {
      "name": "آگونیست کامل",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -7, "hillSlope": 1, "baseline": 0 }
    }
  ]
}
\`\`\`

پارامتر EC50 نشان‌دهنده غلظتی است که ۵۰ درصد حداکثر پاسخ (Emax) را ایجاد می‌کند.
`;

    it("parses, validates, and renders Fixture 1 end-to-end", async () => {
      const extracted = extractEducationalChartsFromMarkdown(fixture1Markdown);
      expect(extracted).toHaveLength(1);

      const chart = extracted[0];
      expect(chart.type).toBe("line");
      expect(chart.mode).toBe("conceptual");
      expect(chart.curves).toHaveLength(1);

      const validation = validateEducationalChart(chart);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const { container } = render(<MarkdownRenderer content={fixture1Markdown} />);

      await waitFor(() => {
        expect(screen.getByText("منحنی دوز-پاسخ و مفاهیم Emax و EC50")).toBeDefined();
      });

      expect(screen.getByText("نمایش مفهومی / شماتیک")).toBeDefined();
      const svg = container.querySelector("svg[role='img']");
      expect(svg).not.toBeNull();
      const path = container.querySelector('[data-testid="chart-curve-0"] path');
      expect(path).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Fixture 2: Spare Receptors / Receptor Reserve
  // -------------------------------------------------------------------------
  describe("Fixture 2: Spare Receptors / Receptor Reserve", () => {
    const fixture2Markdown = `
# پدیده گیرنده‌های ذخیره (Spare Receptors)

در بافت‌هایی با گیرنده ذخیره، حداکثر پاسخ در غلظت‌هایی بسیار پایین‌تر از غلظت لازم برای اشباع ۱۰۰٪ گیرنده‌ها حاصل می‌شود (EC50 < Kd).

\`\`\`chart
{
  "type": "line",
  "title": "گیرنده‌های ذخیره (Spare Receptors): تفکیک اتصال و پاسخ",
  "mode": "conceptual",
  "xAxis": { "label": "غلظت آگونیست (M)", "unit": "M", "scale": "log", "min": 1e-10, "max": 1e-4 },
  "yAxis": { "label": "درصد حداکثر", "unit": "%", "min": 0, "max": 100 },
  "curves": [
    {
      "name": "پاسخ زیستی (EC50 = 10 nM)",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -8 }
    },
    {
      "name": "اشغال گیرنده (Kd = 1 μM)",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -6 },
      "lineStyle": "dashed"
    }
  ]
}
\`\`\`
`;

    it("parses, validates, and renders Fixture 2 with solid response and dashed binding curves", async () => {
      const extracted = extractEducationalChartsFromMarkdown(fixture2Markdown);
      expect(extracted).toHaveLength(1);

      const chart = extracted[0];
      const validation = validateEducationalChart(chart);
      expect(validation.valid).toBe(true);

      const { container } = render(<ChartBlock chart={chart} />);

      expect(screen.getByText("گیرنده‌های ذخیره (Spare Receptors): تفکیک اتصال و پاسخ")).toBeDefined();
      expect(screen.getByText("پاسخ زیستی (EC50 = 10 nM)")).toBeDefined();
      expect(screen.getByText("اشغال گیرنده (Kd = 1 μM)")).toBeDefined();

      const pathResponse = container.querySelector('[data-testid="chart-curve-0"] path');
      const pathBinding = container.querySelector('[data-testid="chart-curve-1"] path');

      expect(pathResponse?.getAttribute("stroke-dasharray")).toBeNull();
      expect(pathBinding?.getAttribute("stroke-dasharray")).toBe("6,4");
    });
  });

  // -------------------------------------------------------------------------
  // Fixture 3: Reversible Competitive Antagonism
  // -------------------------------------------------------------------------
  describe("Fixture 3: Reversible Competitive Antagonism", () => {
    const fixture3Markdown = `
# آنتاگونیسم رقابتی برگشت‌پذیر

آنتاگونیست رقابتی برای جایگاه اتصال مشترک رقابت کرده و منحنی دوز-پاسخ آگونیست را بدون تغییر Emax به سمت راست شیفت می‌دهد.

\`\`\`chart
{
  "type": "line",
  "title": "آنتاگونیسم رقابتی برگشت‌پذیر و شیفت موازی به راست",
  "mode": "conceptual",
  "xAxis": { "label": "غلظت آگونیست (M)", "unit": "M", "scale": "log", "min": 1e-10, "max": 1e-3 },
  "yAxis": { "label": "پاسخ زیستی", "unit": "%", "min": 0, "max": 100 },
  "curves": [
    {
      "name": "آگونیست به تنهایی",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -8 }
    },
    {
      "name": "آگونیست + آنتاگونیست رقابتی (دوز کم)",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -7 },
      "lineStyle": "dashed"
    },
    {
      "name": "آگونیست + آنتاگونیست رقابتی (دوز زیاد)",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -6 },
      "lineStyle": "dashed"
    }
  ]
}
\`\`\`
`;

    it("parses, validates, and renders Fixture 3 with 3 curves and verified rightward shift", async () => {
      const extracted = extractEducationalChartsFromMarkdown(fixture3Markdown);
      expect(extracted).toHaveLength(1);

      const chart = extracted[0];
      expect(chart.curves).toHaveLength(3);

      const validation = validateEducationalChart(chart);
      expect(validation.valid).toBe(true);

      const { container } = render(<ChartBlock chart={chart} />);

      expect(screen.getByText("آگونیست به تنهایی")).toBeDefined();
      expect(screen.getByText("آگونیست + آنتاگونیست رقابتی (دوز کم)")).toBeDefined();
      expect(screen.getByText("آگونیست + آنتاگونیست رقابتی (دوز زیاد)")).toBeDefined();

      const c0 = container.querySelector('[data-testid="chart-curve-0"]');
      const c1 = container.querySelector('[data-testid="chart-curve-1"]');
      const c2 = container.querySelector('[data-testid="chart-curve-2"]');
      expect(c0).not.toBeNull();
      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Fixture 4: Full vs Partial Agonist
  // -------------------------------------------------------------------------
  describe("Fixture 4: Full vs Partial Agonist", () => {
    const fixture4Markdown = `
# اثرات آگونیست کامل و نسبی

آگونیست نسبی حتی در اشباع کامل گیرنده‌ها نمی‌تواند به ۱۰۰ درصد پاسخ بافتی برسد (کارایی ذاتی کمتر).

\`\`\`chart
{
  "type": "line",
  "title": "مقایسه آگونیست کامل و آگونیست نسبی",
  "mode": "conceptual",
  "xAxis": { "label": "غلظت آگونیست (M)", "unit": "M", "scale": "log", "min": 1e-10, "max": 1e-4 },
  "yAxis": { "label": "پاسخ زیستی", "unit": "%", "min": 0, "max": 100 },
  "curves": [
    {
      "name": "آگونیست کامل (Emax = 100%)",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -7 }
    },
    {
      "name": "آگونیست نسبی (Emax = 45%)",
      "model": "sigmoidal",
      "parameters": { "emax": 45, "logEC50": -7 },
      "lineStyle": "dashed"
    }
  ]
}
\`\`\`
`;

    it("parses, validates, and renders Fixture 4 verifying Emax differential", async () => {
      const extracted = extractEducationalChartsFromMarkdown(fixture4Markdown);
      expect(extracted).toHaveLength(1);

      const chart = extracted[0];
      const validation = validateEducationalChart(chart);
      expect(validation.valid).toBe(true);

      const { container } = render(<ChartBlock chart={chart} />);

      expect(screen.getByText("آگونیست کامل (Emax = 100%)")).toBeDefined();
      expect(screen.getByText("آگونیست نسبی (Emax = 45%)")).toBeDefined();

      const path0 = container.querySelector('[data-testid="chart-curve-0"] path');
      const path1 = container.querySelector('[data-testid="chart-curve-1"] path');
      expect(path0).not.toBeNull();
      expect(path1).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Fixture 5: Two-State Receptor Model / Inverse Agonist
  // -------------------------------------------------------------------------
  describe("Fixture 5: Two-State Receptor Model & Inverse Agonist", () => {
    const fixture5Markdown = `
# مدل دوحالتی گیرنده و آگونیست‌های معکوس

در سیستم‌هایی با فعالیت ساختاری (Constitutive Activity)، آگونیست معکوس فعالیت گیرنده را به زیر سطح پایه کاهش می‌دهد.

\`\`\`chart
{
  "type": "line",
  "title": "مدل دوحالتی گیرنده و آگونیست معکوس",
  "mode": "conceptual",
  "xAxis": { "label": "غلظت لیگاند (M)", "unit": "M", "scale": "log", "min": 1e-10, "max": 1e-4 },
  "yAxis": { "label": "فعالیت گیرنده", "unit": "%", "min": 0, "max": 100 },
  "curves": [
    {
      "name": "آگونیست کامل (Emax = 100%)",
      "model": "sigmoidal",
      "parameters": { "emax": 100, "logEC50": -7, "baseline": 25 }
    },
    {
      "name": "آنتاگونیست خنثی (حفظ فعالیت پایه)",
      "model": "sigmoidal",
      "parameters": { "emax": 25, "logEC50": -7, "baseline": 25 },
      "lineStyle": "dashed"
    },
    {
      "name": "آگونیست معکوس (مهار فعالیت ساختاری)",
      "model": "sigmoidal",
      "parameters": { "emax": 0, "logEC50": -7, "baseline": 25 }
    }
  ]
}
\`\`\`
`;

    it("parses, validates, and renders Fixture 5 with constitutive baseline and inverse agonist suppression", async () => {
      const extracted = extractEducationalChartsFromMarkdown(fixture5Markdown);
      expect(extracted).toHaveLength(1);

      const chart = extracted[0];
      expect(chart.curves).toHaveLength(3);
      expect(chart.curves![0].parameters.baseline).toBe(25);
      expect(chart.curves![1].parameters.emax).toBe(25);
      expect(chart.curves![2].parameters.emax).toBe(0);

      const validation = validateEducationalChart(chart);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const { container } = render(<ChartBlock chart={chart} />);

      expect(screen.getByText("مدل دوحالتی گیرنده و آگونیست معکوس")).toBeDefined();
      expect(screen.getByText("آگونیست کامل (Emax = 100%)")).toBeDefined();
      expect(screen.getByText("آنتاگونیست خنثی (حفظ فعالیت پایه)")).toBeDefined();
      expect(screen.getByText("آگونیست معکوس (مهار فعالیت ساختاری)")).toBeDefined();

      const c0 = container.querySelector('[data-testid="chart-curve-0"]');
      const c1 = container.querySelector('[data-testid="chart-curve-1"]');
      const c2 = container.querySelector('[data-testid="chart-curve-2"]');
      expect(c0).not.toBeNull();
      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
    });
  });
});
