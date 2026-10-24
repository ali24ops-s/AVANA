import { describe, it, expect, beforeAll, vi } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import { CHEMISTRY_REACTIONS_LESSON_MARKDOWN } from "../../../../database/seeds/seed-chemistry-reactions.js";
import { PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN } from "./chemical-production-validation.test.js";
import { ChemicalStructureBlock } from "../components/chemistry/ChemicalStructureBlock.js";
import { ReactionBlock } from "../components/chemistry/ReactionBlock.js";
import { extractChemicalStructuresFromMarkdown, extractChemicalReactionsFromMarkdown } from "@avana/domain";

const NORMAL_LESSON_MARKDOWN = `# فیزیولوژی قلب و عروق: چرخه قلبی و مکانیک پمپاژ بطن‌ها

در این درسنامه عملکرد الکتریکی و مکانیکی قلب، پتانسیل عمل سلول‌های ضربان‌ساز و میوسیت‌های قلبی بررسی می‌شود.

## ۱. مراحل سیستول و دیاستول بطنی
چرخه قلبی از انقباض دهلیزها آغاز شده و با انقباض ایزوولومتریک بطن‌ها و خروج خون ادامه می‌یابد.

* فاز ۱: پر شدن غیرفعال بطن‌ها (۸۰٪ حجم دیاستولی نهایی)
* فاز ۲: انقباض دهلیزی (۲۰٪ باقی‌مانده پر شدن)
* فاز ۳: انقباض ایزوولومتریک (بسته شدن دریچه‌های دهلیزی-بطنی $S_1$)
* فاز ۴: تخلیه سریع و آهسته بطنی به آئورت و شریان ریوی
* فاز ۵: استراحت ایزوولومتریک (بسته شدن دریچه‌های هلالی $S_2$)

## ۲. روابط فشار-حجم بطن چپ
معادله کار ضربه‌ای بطن به صورت زیر تعریف می‌شود:
$$W = \\int P \\, dV$$

کسر تخلیه قلبی (Ejection Fraction):
$$EF = \\frac{EDV - ESV}{EDV} \\times 100$$
در افراد طبیعی کسر تخلیه بین ۵۵٪ تا ۷۰٪ است.
`;

const statsLog: Record<string, unknown> = {};

function countDomStats(container: HTMLElement) {
  const allElements = container.querySelectorAll("*");
  const svgElements = container.querySelectorAll("svg");
  const svgShapes = container.querySelectorAll("svg path, svg line, svg polygon, svg circle, svg rect, svg text");
  const htmlSize = container.innerHTML.length;
  return {
    totalElements: allElements.length,
    svgCount: svgElements.length,
    svgShapesCount: svgShapes.length,
    htmlSizeBytes: htmlSize,
  };
}

describe("Performance & DOM Profiling Benchmark", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("profiles normal lesson without chemical structures", () => {
    const t0 = performance.now();
    const { container } = render(<MarkdownRenderer content={NORMAL_LESSON_MARKDOWN} enableLessonCallouts />);
    const t1 = performance.now();
    const stats = countDomStats(container);
    statsLog["normal_lesson"] = {
      renderTimeMs: +(t1 - t0).toFixed(2),
      ...stats,
    };
    expect(stats.svgCount).toBe(0);
  });

  it("profiles moderate chemical lesson (2 chemical structures, 1 reaction)", async () => {
    const t0 = performance.now();
    const { container } = render(<MarkdownRenderer content={PROD_ORGANIC_CHEM_1_LESSON_MARKDOWN} enableLessonCallouts />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const t1 = performance.now();
    const stats = countDomStats(container);
    statsLog["moderate_chemical_lesson"] = {
      renderTimeMs: +(t1 - t0).toFixed(2),
      ...stats,
    };
    expect(stats.svgCount).toBeGreaterThan(0);
  });

  it("profiles heavy chemical lesson (12 reactions + 1 structure)", async () => {
    const t0 = performance.now();
    const { container } = render(<MarkdownRenderer content={CHEMISTRY_REACTIONS_LESSON_MARKDOWN} enableLessonCallouts />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const t1 = performance.now();
    const stats = countDomStats(container);
    statsLog["heavy_chemical_lesson"] = {
      renderTimeMs: +(t1 - t0).toFixed(2),
      ...stats,
    };
    expect(stats.svgCount).toBeGreaterThan(10);
  });

  it("profiles Admin Content Review dual-rendering pattern", async () => {
    const structures = extractChemicalStructuresFromMarkdown(CHEMISTRY_REACTIONS_LESSON_MARKDOWN);
    const reactions = extractChemicalReactionsFromMarkdown(CHEMISTRY_REACTIONS_LESSON_MARKDOWN);

    const t0 = performance.now();
    const { container, rerender } = render(
      <div>
        <div className="markdown-section">
          <MarkdownRenderer content={CHEMISTRY_REACTIONS_LESSON_MARKDOWN} enableLessonCallouts />
        </div>
        <div className="explicit-structures-section">
          {structures.map((s, idx) => (
            <ChemicalStructureBlock key={idx} structure={s} />
          ))}
        </div>
        <div className="explicit-reactions-section">
          {reactions.map((r, idx) => (
            <ReactionBlock key={idx} reaction={r} />
          ))}
        </div>
      </div>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    const t1 = performance.now();
    const stats = countDomStats(container);

    // Profile re-render cost (e.g. state change in parent like tab click or dialog open)
    const tRe0 = performance.now();
    rerender(
      <div data-dummy-state="updated">
        <div className="markdown-section">
          <MarkdownRenderer content={CHEMISTRY_REACTIONS_LESSON_MARKDOWN} enableLessonCallouts />
        </div>
        <div className="explicit-structures-section">
          {structures.map((s, idx) => (
            <ChemicalStructureBlock key={idx} structure={s} />
          ))}
        </div>
        <div className="explicit-reactions-section">
          {reactions.map((r, idx) => (
            <ReactionBlock key={idx} reaction={r} />
          ))}
        </div>
      </div>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const tRe1 = performance.now();

    statsLog["admin_review_dual_render"] = {
      renderTimeMs: +(t1 - t0).toFixed(2),
      reRenderTimeMs: +(tRe1 - tRe0).toFixed(2),
      ...stats,
    };
  });

  it("profiles Admin Content Review optimized pattern (with collapsed explicit sections)", async () => {
    const structures = extractChemicalStructuresFromMarkdown(CHEMISTRY_REACTIONS_LESSON_MARKDOWN);
    const reactions = extractChemicalReactionsFromMarkdown(CHEMISTRY_REACTIONS_LESSON_MARKDOWN);

    const t0 = performance.now();
    const { container, rerender } = render(
      <div>
        <div className="markdown-section">
          <MarkdownRenderer content={CHEMISTRY_REACTIONS_LESSON_MARKDOWN} enableLessonCallouts />
        </div>
        <details className="explicit-structures-section">
          <summary>ساختارهای شیمیایی استخراج‌شده</summary>
          {structures.map((s, idx) => (
            <ChemicalStructureBlock key={idx} structure={s} />
          ))}
        </details>
        <details className="explicit-reactions-section">
          <summary>واکنش‌های شیمیایی استخراج‌شده</summary>
          {reactions.map((r, idx) => (
            <ReactionBlock key={idx} reaction={r} />
          ))}
        </details>
      </div>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const t1 = performance.now();
    const stats = countDomStats(container);

    const tRe0 = performance.now();
    rerender(
      <div data-dummy-state="updated">
        <div className="markdown-section">
          <MarkdownRenderer content={CHEMISTRY_REACTIONS_LESSON_MARKDOWN} enableLessonCallouts />
        </div>
        <details className="explicit-structures-section">
          <summary>ساختارهای شیمیایی استخراج‌شده</summary>
          {structures.map((s, idx) => (
            <ChemicalStructureBlock key={idx} structure={s} />
          ))}
        </details>
        <details className="explicit-reactions-section">
          <summary>واکنش‌های شیمیایی استخراج‌شده</summary>
          {reactions.map((r, idx) => (
            <ReactionBlock key={idx} reaction={r} />
          ))}
        </details>
      </div>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const tRe1 = performance.now();

    statsLog["admin_review_optimized_collapsed"] = {
      renderTimeMs: +(t1 - t0).toFixed(2),
      reRenderTimeMs: +(tRe1 - tRe0).toFixed(2),
      ...stats,
    };
  });

  it("verifies text selection normalization excludes all SVG chemical atom labels", async () => {
    const { getTextNodeEntries } = await import("../utils/selectionNormalization.js");

    const { container } = render(
      <div id="test-lesson-container">
        <p>مقدمه متن درس شیمی آلی</p>
        <MarkdownRenderer content={CHEMISTRY_REACTIONS_LESSON_MARKDOWN} enableLessonCallouts />
        <p>پایان درس شیمی آلی</p>
      </div>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    const { entries } = getTextNodeEntries(container);
    // Ensure none of the entries are inside an SVG element
    const svgTextEntries = entries.filter((entry) => entry.node.parentElement?.closest("svg"));
    expect(svgTextEntries.length).toBe(0);
    expect(entries.length).toBeGreaterThan(0);
  });
});
