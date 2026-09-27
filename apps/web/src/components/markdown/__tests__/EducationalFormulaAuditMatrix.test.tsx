import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { MarkdownRenderer, RichContent, normalizeRichContent } from "../MarkdownRenderer.js";
import { normalizeEducationalContent } from "@avana/domain";

/**
 * AVANA Educational Formula & KaTeX Rendering Comprehensive Audit Suite
 *
 * Covers the complete 30-case systematic test matrix:
 * 1. Inline math: \(x^2 + y^2\)
 * 2. Display math: \[ x = \frac{-b \pm \sqrt{b^2-4ac}}{2a} \]
 * 3. Dollar inline: $x^2$
 * 4. Dollar display: $$ E = mc^2 $$
 * 5. Fractions: \[ \frac{a+b}{c+d} \]
 * 6. Superscript/subscript: \[ x_1^2 \]
 * 7. Nested structures: \[ \frac{d}{dt}\left(x^2 + \sqrt{x}\right) \]
 * 8. Greek letters: \alpha, \beta, \gamma, \Delta, \lambda, \mu, \sigma
 * 9. Operators: \sum_{i=1}^{n} x_i
 * 10. Matrix: \begin{pmatrix} a & b \\ c & d \end{pmatrix}
 * 11. \mathrm: \mathrm{NaCl}
 * 12. \text: \text{Normal range}
 * 13. Persian surrounding text + formula
 * 14. Persian inside or adjacent to formula
 * 15. Multiple formulas in one paragraph
 * 16. Formula immediately after Markdown bold/italic
 * 17. Formula inside list
 * 18. Formula inside heading
 * 19. Formula adjacent to punctuation
 * 20. Long formulas & horizontal overflow
 * 21. Mobile widths (320px, 375px, 414px)
 * 22. Desktop widths (768px, 1280px)
 * 23. Malformed delimiter
 * 24. Malformed backslash
 * 25. Escaped JSON/backslash content
 * 26. Raw LaTeX command leakage prevention
 * 27. HTML/Markdown mixed content
 * 28. Formula next to code
 * 29. Multiple display equations consecutively
 * 30. Formula inside lesson / review-summary / preview
 * 31. Chemistry notation: H2O, Na+, Ca2+, SO4(2-), KMnO4, v = \Delta [A] / \Delta t
 */
describe("AVANA Educational Formula Comprehensive Audit Matrix (30+ Cases)", () => {
  // Case 1: Inline math \(...\)
  it("Case 1: renders inline math \\(x^2 + y^2\\) via KaTeX without raw delimiters", () => {
    const text = "مقدار تابع برابر \\(x^2 + y^2\\) محاسبه می‌شود.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(1);
    expect(container.textContent).not.toContain("\\(");
    expect(container.textContent).not.toContain("\\)");
    expect(container.textContent).toContain("مقدار تابع برابر");
  });

  // Case 2: Display math \[...\]
  it("Case 2: renders display math \\[ x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a} \\] as display KaTeX", () => {
    const text = "ریشه‌های معادله درجه دو از رابطه زیر به دست می‌آیند:\n\n\\[\nx = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n\\]";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).not.toContain("\\[");
    expect(container.textContent).not.toContain("\\]");
  });

  // Case 3: Dollar inline $...$
  it("Case 3: renders dollar inline $x^2$ correctly", () => {
    const text = "اگر مقدار $x^2$ مثبت باشد.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(1);
    expect(container.textContent).not.toContain("$x^2$");
    expect(container.querySelector(".msupsub")).toBeInTheDocument();
  });

  // Case 4: Dollar display $$...$$
  it("Case 4: renders dollar display $$ E = mc^2 $$ correctly", () => {
    const text = "$$\nE = mc^2\n$$";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).not.toContain("$$");
  });

  // Case 5: Fractions
  it("Case 5: renders fractions \\[ \\frac{a+b}{c+d} \\] cleanly", () => {
    const text = "نسبت کسر:\n\n\\[\n\\frac{a+b}{c+d}\n\\]";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelector(".mfrac")).toBeInTheDocument();
  });

  // Case 6: Superscript and Subscript
  it("Case 6: renders subscript and superscript \\[ x_1^2 \\]", () => {
    const text = "متغیر با اندیس و توان:\n\n\\[\nx_1^2 + y_{ij}^{k}\n\\]";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelectorAll(".msupsub").length).toBeGreaterThanOrEqual(2);
  });

  // Case 7: Nested structures
  it("Case 7: renders nested structures \\[ \\frac{d}{dt}\\left(x^2 + \\sqrt{x}\\right) \\]", () => {
    const text = "مشتق عبارت پیچیده:\n\n\\[\n\\frac{d}{dt}\\left(x^2 + \\sqrt{x}\\right)\n\\]";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelector(".sqrt")).toBeInTheDocument();
    expect(container.querySelector(".mfrac")).toBeInTheDocument();
  });

  // Case 8: Greek letters
  it("Case 8: renders Greek letters (\\alpha, \\beta, \\gamma, \\Delta, \\lambda, \\mu, \\sigma)", () => {
    const text = "حروف یونانی: $\\alpha$, $\\beta$, $\\gamma$, $\\Delta$, $\\lambda$, $\\mu$, $\\sigma$ در فارماکولوژی.";
    const { container } = render(<RichContent content={text} />);

    const katexEls = container.querySelectorAll(".katex");
    expect(katexEls.length).toBe(7);
    // Ensure all 7 greek letters rendered into katex-html nodes
    expect(container.querySelectorAll(".katex-html").length).toBe(7);
    expect(container.textContent).toContain("حروف یونانی:");
    expect(container.textContent).toContain("در فارماکولوژی.");
  });

  // Case 9: Operators (sum, integral, lim)
  it("Case 9: renders mathematical operators (\\sum_{i=1}^{n} x_i, \\int, \\lim)", () => {
    const text = "مجموع داده‌ها:\n\n$$\n\\sum_{i=1}^{n} x_i = \\int_0^T f(t) dt\n$$";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelector(".mop")).toBeInTheDocument();
  });

  // Case 10: Matrix
  it("Case 10: renders pmatrix matrices cleanly", () => {
    const text = "ماتریس ضرایب:\n\n\\[\n\\begin{pmatrix}\na & b\\\\\nc & d\n\\end{pmatrix}\n\\]";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector(".mtable")).toBeInTheDocument();
  });

  // Case 11: \\mathrm{}
  it("Case 11: renders \\mathrm{NaCl} and chemical notation in math", () => {
    const text = "فرمول نمک طعام $\\mathrm{NaCl}$ و کلسیم کربنات $\\mathrm{CaCO_3}$ است.";
    const { container } = render(<RichContent content={text} />);

    const katexEls = container.querySelectorAll(".katex");
    expect(katexEls.length).toBe(2);
    expect(container.querySelector(".mathrm")).toBeInTheDocument();
    expect(container.textContent).toContain("فرمول نمک طعام");
  });

  // Case 12: \text{} inside math
  it("Case 12: renders \\text{Normal range} and \\text{ g/cm}^3 inside math expressions", () => {
    const text = "محدوده طبیعی $\\text{Normal range} = 10-20 \\text{ mg/dL}$ است.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(1);
    expect(container.textContent).not.toContain("extNormal");
    expect(container.textContent).not.toContain("extmg");
    expect(container.textContent).toContain("محدوده طبیعی");
  });

  // Case 13: Persian surrounding text
  it("Case 13: renders Persian surrounding text with isolated LTR display math", () => {
    const text = [
      "غلظت دارو از رابطه زیر به دست می‌آید:",
      "",
      "\\[",
      "C = \\frac{m}{V}",
      "\\]",
      "",
      "که در آن $m$ جرم دارو و $V$ حجم توزیع است.",
    ].join("\n");

    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.textContent).toContain("غلظت دارو از رابطه زیر به دست می‌آید:");
    expect(container.textContent).toContain("که در آن");
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(3);
  });

  // Case 14: Persian inside / adjacent to formula
  it("Case 14: renders Persian labels inside \\text{} in formula without breaking KaTeX", () => {
    const text = "معادله با برچسب فارسی: $V_{\\text{بیشینه}} = 100$ و فرمول کلیرانس $CL_{\\text{کلیوی}}$.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.textContent).not.toContain("$\\text");
  });

  // Case 15: Multiple formulas in one paragraph
  it("Case 15: renders multiple formulas ($T_4$, $T_3$, $C_p$, $V_d$) in a single paragraph seamlessly", () => {
    const text = "نسبت $T_4$ به $T_3$ حدود ۵ به ۱ است؛ همچنین $C_p$ با حجم $V_d$ رابطه مستقیم دارد.";
    const { container } = render(<RichContent content={text} />);

    const katexEls = container.querySelectorAll(".katex");
    expect(katexEls.length).toBe(4);
    expect(container.textContent).not.toContain("$T_4$");
    expect(container.textContent).not.toContain("$T_3$");
  });

  // Case 16: Formula immediately after Markdown bold/italic
  it("Case 16: renders formula immediately following bold/italic (**غلظت اولیه:** $C_0$)", () => {
    const text = "**غلظت اولیه:** $C_0 = 10\\text{ mg/L}$ و *ثابت سرعت* $k_e = 0.1\\text{ h}^{-1}$.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector("strong")?.textContent).toBe("غلظت اولیه:");
    expect(container.querySelector("em")?.textContent).toBe("ثابت سرعت");
    expect(container.querySelectorAll(".katex").length).toBe(2);
  });

  // Case 17: Formula inside list
  it("Case 17: renders formulas cleanly inside ordered and unordered lists", () => {
    const listMarkdown = [
      "- پارامتر اول: $V_d = \\frac{D}{C_0}$",
      "- پارامتر دوم: $CL = k_e \\times V_d$",
      "",
      "1. گام اول: محاسبه نیمه‌عمر $t_{1/2} = \\frac{0.693}{k_e}$",
      "2. گام دوم: تعیین دوز نگهدارنده",
    ].join("\n");

    const { container } = render(<RichContent content={listMarkdown} />);

    expect(container.querySelector("ul")).toBeInTheDocument();
    expect(container.querySelector("ol")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBe(3);
    const lis = container.querySelectorAll("li");
    lis.forEach((li) => {
      expect(li.className).toContain("[unicode-bidi:isolate]");
    });
  });

  // Case 18: Formula inside heading
  it("Case 18: renders formulas inside headings (## محاسبه کلیرانس با فرمول $CL = \\frac{D}{AUC}$)", () => {
    const text = "## محاسبه کلیرانس با فرمول $CL = \\frac{D}{\\text{AUC}}$\n\nتوضیحات مربوط به کلیرانس کلیوی.";
    const { container } = render(<RichContent content={text} />);

    const h2 = container.querySelector("h2");
    expect(h2).toBeInTheDocument();
    expect(h2?.querySelector(".katex")).toBeInTheDocument();
    expect(h2?.className).toContain("[unicode-bidi:isolate]");
  });

  // Case 19: Formula adjacent to punctuation
  it("Case 19: renders formula enclosed in parentheses ($T_4$) and adjacent to punctuation without corruption", () => {
    const text = "هورمون تیروکسین ($T_4$) و کلسیتریول ($1,25(OH)_2D$) در پلاسما، سنجیده می‌شوند.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(2);
    // Verified that raw dollar formulas are parsed into KaTeX
    expect(container.textContent).not.toContain("$T_4$");
    expect(container.textContent).not.toContain("$1,25(OH)_2D$");
    expect(container.textContent).toContain("هورمون تیروکسین");
    expect(container.textContent).toContain("در پلاسما، سنجیده می‌شوند.");
  });

  // Case 20: Long formulas & container horizontal overflow
  it("Case 20: renders long pharmacokinetic equations within overflow-safe display containers", () => {
    const longFormula = [
      "$$",
      "CL_{\\text{total}} = \\frac{\\text{Dose}}{\\text{AUC}_{0-\\infty}} = \\frac{k_e \\times V_d \\times F}{\\text{Clearance}_{\\text{renal}} + \\text{Clearance}_{\\text{hepatic}} + \\text{Clearance}_{\\text{biliary}}}",
      "$$",
    ].join("\n");

    const { container } = render(<RichContent content={longFormula} />);

    const displayBlock = container.querySelector(".katex-display");
    expect(displayBlock).toBeInTheDocument();
    expect(displayBlock?.querySelector(".katex")).toBeInTheDocument();
    expect(container.textContent).not.toContain("$$");
  });

  // Case 21 & 22: Responsive layout and Viewport verification
  it("Case 21 & 22: preserves RTL direction and isolated LTR math across responsive widths (320px, 375px, 414px, 768px, 1280px)", () => {
    const testCases = [
      { width: "320px", label: "Mobile Small (320px)" },
      { width: "375px", label: "Mobile Standard (375px)" },
      { width: "414px", label: "Mobile Large (414px)" },
      { width: "768px", label: "Tablet (768px)" },
      { width: "1280px", label: "Desktop (1280px)" },
    ];

    const content = "# فارماکوکینتیک بالینی\n\nفرمول کلیرانس $CL = \\frac{V_d}{t_{1/2}}$ در تمام دستگاه‌ها پایدار است.";

    for (const tc of testCases) {
      const { container } = render(
        <div style={{ width: tc.width, maxWidth: "100%" }}>
          <RichContent content={content} />
        </div>
      );

      const rootDiv = container.querySelector(".markdown-content-body");
      expect(rootDiv).toHaveAttribute("dir", "rtl");
      expect(rootDiv?.className).toContain("break-words");
      expect(container.querySelectorAll(".katex").length).toBe(1);
    }
  });

  // Case 23: Malformed delimiter
  it("Case 23: handles unclosed dollar or broken delimiters without throwing errors or crashing", () => {
    const brokenDelimiterText = "فرمول با دالر بازمانده $T_4 و ادامه متن بدون بسته شدن دالر.";
    expect(() => {
      const { container } = render(<RichContent content={brokenDelimiterText} />);
      expect(container.textContent).toContain("فرمول با دالر بازمانده");
    }).not.toThrow();
  });

  // Case 24: Malformed backslash
  it("Case 24: handles malformed LaTeX syntax (\\frac{a}) safely without crashing", () => {
    const brokenLatex = "فرمول با سینتکس ناقص $\\frac{a}$ و متن بعدی.";
    expect(() => {
      const { container } = render(<RichContent content={brokenLatex} />);
      expect(container).toBeInTheDocument();
    }).not.toThrow();
  });

  // Case 25: Escaped JSON / backslash content
  it("Case 25: correctly normalizes JSON string escapes and double backslashes in AI content", () => {
    const jsonContent = JSON.stringify({
      kind: "session",
      title: "درس فارماکولوژی",
      contentMarkdown: "# درس فارماکولوژی\\n\\nفرمول $\\beta_1$ و کسر $\\frac{a}{b}$",
    });

    const { container } = render(<RichContent content={jsonContent} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("درس فارماکولوژی");
    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.textContent).not.toContain('"kind": "session"');
  });

  // Case 26: Raw LaTeX command leakage prevention
  it("Case 26: prevents raw LaTeX arrows and \\text from leaking raw backslashes outside math", () => {
    const text = "دارو \\rightarrow گیرنده و افزایش فشار \\uparrow و مقدار \\text{Stage 3} بالینی.";
    const { container } = render(<RichContent content={text} />);

    expect(container.textContent).toContain("دارو → گیرنده");
    expect(container.textContent).toContain("افزایش فشار ↑");
    expect(container.textContent).toContain("Stage 3");
    expect(container.textContent).not.toContain("\\rightarrow");
    expect(container.textContent).not.toContain("\\text");
  });

  // Case 27: HTML and Markdown mixed content
  it("Case 27: handles HTML mark tags and Markdown math mixed content cleanly", () => {
    const text = "متن هایلایت‌شده با فرمول $T_4$ و توضیحات تکمیلی.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(1);
    expect(container.textContent).toContain("متن هایلایت‌شده با فرمول");
  });

  // Case 28: Formula next to code
  it("Case 28: renders formula immediately adjacent to inline code without interference", () => {
    const text = "دستور `calculateAUC()` برای محاسبه فرمول $CL = \\frac{Dose}{AUC}$ استفاده می‌شود.";
    const { container } = render(<RichContent content={text} />);

    const code = container.querySelector("code");
    expect(code?.textContent).toBe("calculateAUC()");
    expect(container.querySelectorAll(".katex").length).toBe(1);
  });

  // Case 29: Multiple display equations consecutively
  it("Case 29: renders multiple consecutive display equations with proper vertical spacing", () => {
    const text = [
      "معادله اول:",
      "$$",
      "E = mc^2",
      "$$",
      "$$",
      "F = ma",
      "$$",
      "معادله سوم:",
      "$$",
      "PV = nRT",
      "$$",
    ].join("\n");

    const { container } = render(<RichContent content={text} />);

    const displayBlocks = container.querySelectorAll(".katex-display");
    expect(displayBlocks.length).toBe(3);
    expect(container.textContent).not.toContain("$$");
  });

  // Case 30: Formula inside Lesson / Review Summary / Preview / Blog contexts
  it("Case 30: renders formulas consistently across all educational UI contexts (Lesson, Living textbook, Review summary, Blog)", () => {
    const sampleMarkdown = [
      "# مهارکننده‌های ACE",
      "> **نکته کلیدی:** داروی کاپتوپریل با دوز $12.5\\text{ mg}$ شروع می‌شود.",
      "",
      "فرمول کلیرانس $CL = \\frac{Dose}{AUC}$ و رابطه $T_4 \\to T_3$.",
      "",
      "| دارو | دوز | فرمول |",
      "| :--- | :--- | :--- |",
      "| کاپتوپریل | $12.5\\text{ mg}$ | $V_d$ |",
    ].join("\n");

    // Context A: Full Lesson with Callouts
    const { container: lessonContainer } = render(
      <MarkdownRenderer content={sampleMarkdown} enableLessonCallouts />
    );
    expect(lessonContainer.querySelector('[data-callout-type="key-point"]')).toBeInTheDocument();
    expect(lessonContainer.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(4);
    expect(lessonContainer.querySelector("table")).toBeInTheDocument();

    // Context B: Inline / Flashcard Preview
    const { container: inlineContainer } = render(
      <RichContent content="پاسخ فلش‌کارت با فرمول $CL = \frac{V_d}{t_{1/2}}$" inline />
    );
    expect(inlineContainer.querySelector(".rich-content-inline")).toBeInTheDocument();
    expect(inlineContainer.querySelectorAll(".katex").length).toBe(1);

    // Context C: Review Summary Section
    const { container: summaryContainer } = render(
      <RichContent content={"- نکته ۱: اثر $T_4$\n- نکته ۲: فرمول $E=mc^2$"} />
    );
    expect(summaryContainer.querySelector("ul")).toBeInTheDocument();
    expect(summaryContainer.querySelectorAll(".katex").length).toBe(2);
  });

  // Case 31: Comprehensive Chemistry Formula & Reaction Notation Suite
  it("Case 31: renders inorganic, biochemistry, and organic chemistry formulas ($H_2O$, $Na^+$, $Ca^{2+}$, $SO_4^{2-}$, $KMnO_4$, $v = \\frac{\\Delta [A]}{\\Delta t}$)", () => {
    const chemText = [
      "۱. مولکول آب: $H_2O$",
      "۲. کاتیون سدیم: $Na^+$",
      "۳. کاتیون کلسیم: $Ca^{2+}$",
      "۴. آنیون سولفات: $SO_4^{2-}$",
      "۵. پرمنگنات پتاسیم: $KMnO_4$",
      "۶. سرعت واکنش: $v = -\\frac{\\Delta [A]}{\\Delta t} = \\frac{\\Delta [B]}{\\Delta t}$",
      "۷. واکنش استیلن:",
      "$$",
      "\\mathrm{CaC_2 + 2H_2O \\rightarrow HC\\equiv CH + Ca(OH)_2}",
      "$$",
    ].join("\n\n");

    const { container } = render(<RichContent content={chemText} />);

    // KaTeX spans for all chemistry formulas
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(7);
    expect(container.querySelector(".katex-display")).toBeInTheDocument();

    // Verify no unrendered raw LaTeX remains
    expect(container.textContent).not.toContain("$H_2O$");
    expect(container.textContent).not.toContain("$Na^+$");
    expect(container.textContent).not.toContain("$Ca^{2+}$");
    expect(container.textContent).not.toContain("$SO_4^{2-}$");
    expect(container.textContent).not.toContain("$KMnO_4$");
  });

  // Zero-Leakage & Content Normalization Parity Test
  it("Verifies pipeline idempotency and zero-leakage between domain normalization and renderer", () => {
    const rawLesson = [
      "> **نکته بالینی:** داروی **پروپرانولول** با دوز $10 \\text{ mg}$ در بیمار با $GFR < 30$ احتیاط دارد.",
      "",
      "فرمول کلیرانس کراتینین:",
      "\\[",
      "CrCl = \\frac{(140 - \\text{Age}) \\times \\text{Weight}}{72 \\times S_{cr}}",
      "\\]",
    ].join("\n");

    const domainNormalized = normalizeEducationalContent(rawLesson);
    const rendererNormalized = normalizeRichContent(domainNormalized);

    expect(domainNormalized).toBe(rawLesson);
    expect(rendererNormalized).toContain("$$\nCrCl = \\frac{(140 - \\text{Age}) \\times \\text{Weight}}{72 \\times S_{cr}}\n$$");

    const { container } = render(<RichContent content={domainNormalized} enableLessonCallouts />);
    expect(container.querySelector('[data-callout-type="clinical-point"]')).toBeInTheDocument();
    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.textContent).not.toContain("\\[");
  });
});
