import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer, RichContent, normalizeRichContent } from "../MarkdownRenderer.js";
import { normalizeEducationalContent } from "@avana/domain";

describe("RichContent & MarkdownRenderer Math & Markdown Suite", () => {
  it("renders basic Markdown elements (headings, bold, lists)", () => {
    const markdown = `# عنوان اصلی\n\nمتن با فرمت **پررنگ** و *ایتالیک*.\n\n- مورد ۱\n- مورد ۲`;
    const { container } = render(<RichContent content={markdown} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("عنوان اصلی");
    expect(screen.getByText("پررنگ")).toBeInTheDocument();
    expect(screen.getByText("مورد ۱")).toBeInTheDocument();
    expect(container.querySelector("ul")).toBeInTheDocument();
  });

  it("renders inline math ($T_4$ and $T_3$) using KaTeX without raw dollar signs", () => {
    const text = "نسبت $T_4$ به $T_3$ در تیروگلوبولین حدود ۵ به ۱ است.";
    const { container } = render(<RichContent content={text} />);

    // Must not contain raw unparsed $T_4$ or $T_3$ in text
    expect(container.textContent).not.toContain("$T_4$");
    expect(container.textContent).not.toContain("$T_3$");

    // KaTeX spans must be rendered
    const katexElements = container.querySelectorAll(".katex");
    expect(katexElements.length).toBe(2);
  });

  it("renders superscript ($Ca^{2+}$) and subscript ($H_2O$)", () => {
    const text = "غلظت یون $Ca^{2+}$ و مولکول $H_2O$ در سلول مهم است.";
    const { container } = render(<RichContent content={text} />);

    expect(container.textContent).not.toContain("$Ca^{2+}$");
    expect(container.textContent).not.toContain("$H_2O$");
    expect(container.querySelectorAll(".katex").length).toBe(2);
  });

  it("renders Greek letters ($\\alpha_1$ and $\\beta_1$)", () => {
    const text = "گیرنده $\\beta_1$ و $\\alpha_1$ در تنظیم فشار خون نقش دارند.";
    const { container } = render(<RichContent content={text} />);

    expect(container.textContent).not.toContain("$\\beta_1$");
    expect(container.textContent).not.toContain("$\\alpha_1$");
    expect(container.querySelectorAll(".katex").length).toBe(2);
  });

  it("renders fractions in inline and block math ($\frac{CL}{V_d}$ and $$\\frac{CL}{V_d}$$)", () => {
    const text = "کسر خطی $\\frac{CL}{V_d}$ و فرمول بلوکی:\n\n$$\nCL = \\frac{U \\times V}{P}\n$$";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
  });

  it("safely supports alternative delimiters \\(...\\) and \\[...\\]", () => {
    const text = "فرمول خطی \\(T_4\\) و بلوکی:\n\n\\[ \\frac{a}{b} \\]";
    const { container } = render(<RichContent content={text} />);

    expect(container.textContent).not.toContain("\\(T_4\\)");
    expect(container.querySelectorAll(".katex").length).toBe(2);
  });

  it("does NOT render math inside inline code or code blocks", () => {
    const text = "کد درون‌خطی `$T_4$` و بلوک کد:\n\n```text\n$T_4$\n$$\\frac{a}{b}$$\n```";
    const { container } = render(<RichContent content={text} />);

    // The code elements should contain literal text without katex processing
    const codeElements = container.querySelectorAll("code");
    expect(codeElements.length).toBe(2);
    expect(codeElements[0].textContent).toBe("$T_4$");
    expect(codeElements[1].textContent).toContain("$T_4$");
    expect(container.querySelectorAll(".katex").length).toBe(0);
  });

  it("does NOT treat single currency dollar amounts as math ($100)", () => {
    const text = "قیمت محصول $100 است و همچنین The price is $100.";
    const { container } = render(<RichContent content={text} />);

    expect(container.textContent).toContain("$100");
    expect(container.querySelectorAll(".katex").length).toBe(0);
  });

  it("handles malformed LaTeX gracefully without crashing the UI", () => {
    const text = "فرمول ناقص $T_4 و متن پس از آن.";
    expect(() => {
      render(<RichContent content={text} />);
    }).not.toThrow();
  });

  it("handles null, undefined, and empty string safely", () => {
    const { container: c1 } = render(<RichContent content={null} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(<RichContent content={undefined} />);
    expect(c2).toBeEmptyDOMElement();

    const { container: c3 } = render(<RichContent content="" />);
    expect(c3).toBeEmptyDOMElement();
  });

  it("renders inline mode properly without wrapping in a block paragraph", () => {
    const text = "گزینه اول با فرمول $T_4$";
    const { container } = render(<RichContent content={text} inline />);

    const inlineSpan = container.querySelector(".rich-content-inline");
    expect(inlineSpan).toBeInTheDocument();
    // Inline mode should not contain a <p> tag
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelectorAll(".katex").length).toBe(1);
  });

  it("supports MarkdownRenderer as a backward-compatible alias", () => {
    const text = "هورمون $T_4$ از تیروئید آزاد می‌شود.";
    const { container } = render(<MarkdownRenderer content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(1);
    expect(container.textContent).not.toContain("$T_4$");
  });

  it("verifies the exact primary user sample with multiple inline occurrences", () => {
    const exactUserText =
      "نسبت $T_4$ به $T_3$ در تیروگلوبولین حدود ۵ به ۱ است؛ بنابراین عمده هورمون آزادشده از تیروئید، تیروکسین ($T_4$) است.";
    const { container } = render(<RichContent content={exactUserText} />);

    // Must not contain raw unparsed $T_4$ or $T_3$
    expect(container.textContent).not.toContain("$T_4$");
    expect(container.textContent).not.toContain("$T_3$");

    // Exactly 3 KaTeX elements (T_4, T_3, and second T_4)
    const katexEls = container.querySelectorAll(".katex");
    expect(katexEls.length).toBe(3);

    // Verify KaTeX internal DOM structure exists
    expect(container.querySelector(".katex-html")).toBeInTheDocument();
    expect(container.querySelectorAll(".msupsub").length).toBeGreaterThanOrEqual(3);
  });

  it("verifies combined medical and pharmacology formulas", () => {
    const pharmaText = [
      "گیرنده $\\beta_1$ باعث افزایش cAMP میشود.",
      "غلظت یون $Ca^{2+}$ افزایش مییابد.",
      "غلظت دارو $C_p$ با زمان کاهش مییابد.",
      "حجم توزیع از رابطه $V_d = \\frac{Dose}{C_0}$ بهدست میآید.",
      "کلیرانس دارو:",
      "$$",
      "CL = \\frac{U \\times V}{P}",
      "$$",
      "دوز مؤثر $10^{-3}$ mol/L است.",
      "در فارماکوکینتیک، رابطه $V_d = \\frac{Dose}{C_0}$ اهمیت زیادی دارد.",
    ].join("\n\n");

    const { container } = render(<RichContent content={pharmaText} />);

    // No raw unparsed syntax
    expect(container.textContent).not.toContain("$\\beta_1$");
    expect(container.textContent).not.toContain("$Ca^{2+}$");
    expect(container.textContent).not.toContain("$C_p$");
    expect(container.textContent).not.toContain("$V_d = \\frac{Dose}{C_0}$");
    expect(container.textContent).not.toContain("$10^{-3}$");

    // KaTeX block formula must exist
    expect(container.querySelector(".katex-display")).toBeInTheDocument();
    // At least 7 KaTeX elements
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(7);
  });

  it("verifies multiple currency values ($50, $100) alongside math ($T_4)", () => {
    const text = "قیمت دارو $100 است و هزینه حدود $50 تا $100 است ولی هورمون $T_4$ رایگان است.";
    const { container } = render(<RichContent content={text} />);

    // Currency must remain visible as plain dollar amount
    expect(container.textContent).toContain("$100");
    expect(container.textContent).toContain("$50");

    // $T_4$ must be rendered as math
    expect(container.textContent).not.toContain("$T_4$");
    expect(container.querySelectorAll(".katex").length).toBe(1);
  });

  it("verifies long complex formula rendering and container overflow structure", () => {
    const longFormula = "$$\nCL = \\frac{Dose}{AUC} = \\frac{k_e \\times V_d \\times \\text{Bioavailability}}{\\text{Clearance}_{\\text{renal}} + \\text{Clearance}_{\\text{hepatic}}}\n$$";
    const { container } = render(<RichContent content={longFormula} />);

    const displayBlock = container.querySelector(".katex-display");
    expect(displayBlock).toBeInTheDocument();
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(1);
  });

  it("renders math seamlessly inside custom-colored parent containers without hardcoded color overrides", () => {
    const text = "نسبت $T_4$ به $T_3$ در تیروگلوبولین حدود ۵ به ۱ است.";
    const { container } = render(
      <div className="text-amber-300">
        <RichContent content={text} />
      </div>
    );

    const katexEls = container.querySelectorAll(".katex");
    expect(katexEls.length).toBe(2);
    // KaTeX spans must NOT have hardcoded text-teal or green color classes
    katexEls.forEach((el) => {
      expect(el.className).not.toContain("text-teal");
      expect(el.className).not.toContain("text-emerald");
      expect(el.className).not.toContain("text-green");
    });
  });

  it("renders display math $$E = mc^2$$ with katex-display structure", () => {
    const text = "$$\nE = mc^2\n$$";
    const { container } = render(<RichContent content={text} />);

    const displayBlock = container.querySelector(".katex-display");
    expect(displayBlock).toBeInTheDocument();
    const katex = container.querySelector(".katex");
    expect(katex).toBeInTheDocument();
    expect(container.textContent).not.toContain("$$");
  });

  it("renders plain scientific identifiers (hsp40, hsp70, FKBP5, ACTH, GH, COX-2) without code blocks or math", () => {
    const text = "پروتئین‌های hsp40، hsp70 و FKBP5 و هورمون‌های ACTH، GH، TSH و LH و آنزیم COX-2 تنظیم می‌شوند.";
    const { container } = render(<RichContent content={text} />);

    expect(container.textContent).toContain("hsp40، hsp70 و FKBP5");
    expect(container.textContent).toContain("ACTH، GH، TSH و LH");
    expect(container.textContent).toContain("COX-2");
    expect(container.querySelectorAll("code").length).toBe(0);
    expect(container.querySelectorAll(".katex").length).toBe(0);
  });

  it("renders text inside mathematical expressions ($V_{\\text{max}}$) with KaTeX text mode", () => {
    const text = "سرعت بیشینه واکنش $V_{\\text{max}}$ و کلیرانس $\\text{CL} = \\frac{\\text{Dose}}{\\text{AUC}}$ است.";
    const { container } = render(<RichContent content={text} />);

    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.textContent).not.toContain("extmax");
    expect(container.textContent).not.toContain("extCL");
  });

  it("safely recovers legacy tab-corrupted acronyms (\\t ext{ACTH}, \\t ext{GH}, \\t ext{COX-2}) outside math into clean plain text", () => {
    const legacyText = "هورمون‌های \text{ACTH}، هورمون رشد (\text{GH})، \text{TSH}، \text{LH} و مهارکننده \text{COX-2} را بررسی کنید.";
    const { container } = render(<RichContent content={legacyText} />);

    expect(container.textContent).toContain("هورمون‌های ACTH، هورمون رشد (GH)، TSH، LH و مهارکننده COX-2");
    expect(container.textContent).not.toContain("extACTH");
    expect(container.textContent).not.toContain("extGH");
    expect(container.textContent).not.toContain("extCOX");
    expect(container.textContent).not.toContain("extTSH");
    expect(container.textContent).not.toContain("extLH");
    expect(container.querySelectorAll(".katex").length).toBe(0);
  });

  it("unwraps biomedical tokens in backticks (`hsp40`, `hsp70`, `FKBP5`, `ACTH`, `cAMP`, `COX-2`) to plain text", () => {
    const text = "پروتئین‌های `hsp40`، `hsp70` و `FKBP5` و هورمون‌های `ACTH`، `GH`، `TSH` و `LH` و آنزیم `COX-2` و پیام‌رسان `cAMP` و آنزیم `ACE` نقش دارند.";
    const { container } = render(<RichContent content={text} />);

    expect(container.textContent).toContain("hsp40، hsp70 و FKBP5");
    expect(container.textContent).toContain("ACTH، GH، TSH و LH");
    expect(container.textContent).toContain("COX-2 و پیام‌رسان cAMP و آنزیم ACE");
    // All of these should be unwrapped to plain text, so NO <code> tags should exist
    expect(container.querySelectorAll("code").length).toBe(0);
  });

  it("strictly preserves real programming code and commands in backticks (`npm install`, `JSON.parse()`, `useState()`, `const x = 10`)", () => {
    const text = "دستور `npm install` را بزنید و از `JSON.parse(data)` یا هووک `useState()` و مقدار `const x = 10` استفاده کنید.";
    const { container } = render(<RichContent content={text} />);

    const codeElements = container.querySelectorAll("code");
    expect(codeElements.length).toBe(4);
    expect(codeElements[0].textContent).toBe("npm install");
    expect(codeElements[1].textContent).toBe("JSON.parse(data)");
    expect(codeElements[2].textContent).toBe("useState()");
    expect(codeElements[3].textContent).toBe("const x = 10");
  });

  it("strictly preserves fenced code blocks (```ts ... ```) and math alongside unwrapped scientific terms", () => {
    const text = [
      "پروتئین `hsp70` و فرمول $T_4$ و $V_{\\text{max}}$ در کد زیر استفاده شده‌اند:",
      "",
      "```ts",
      "const x = 10;",
      "```",
    ].join("\n");

    const { container } = render(<RichContent content={text} />);

    // `hsp70` is unwrapped to plain text, so code block inside pre is the only code tag
    const codeTags = container.querySelectorAll("code");
    expect(codeTags.length).toBe(1);
    expect(codeTags[0].textContent).toContain("const x = 10;");

    // Math is properly rendered
    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.textContent).toContain("hsp70");
  });

  describe("Lesson Callouts Parsing & Rendering Suite", () => {
    it("renders all 4 callout types correctly when enableLessonCallouts is true", () => {
      const lessonMarkdown = [
        "⚠️ اشتباه رایج: این دارو نباید در بیماران آسمی مصرف شود.",
        "",
        "🧠 برای فهم بهتر: نیمه‌عمر بیولوژیکی با کلیرانس رابطه معکوس دارد.",
        "",
        "📌 نکته آموزشی: جذب دارو با معده خالی افزایش می‌یابد.",
        "",
        "💊 کاربرد دارویی نوین: مهارکننده‌های SGLT2 در نارسایی قلبی کاربرد دارند.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={lessonMarkdown} enableLessonCallouts />
      );

      const callouts = container.querySelectorAll(".lesson-callout");
      expect(callouts.length).toBe(4);

      // Verify all 4 types
      expect(container.querySelector('[data-callout-type="common-mistake"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="understanding"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="educational-tip"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="drug-application"]')).toBeInTheDocument();

      // Verify titles are clean text without emojis
      expect(screen.getByText("اشتباه رایج")).toBeInTheDocument();
      expect(screen.getByText("برای فهم بهتر")).toBeInTheDocument();
      expect(screen.getByText("نکته آموزشی")).toBeInTheDocument();
      expect(screen.getByText("کاربرد دارویی نوین")).toBeInTheDocument();

      // Verify no raw emojis exist in the rendered DOM text
      expect(container.textContent).not.toContain("⚠️");
      expect(container.textContent).not.toContain("🧠");
      expect(container.textContent).not.toContain("📌");
      expect(container.textContent).not.toContain("💊");

      // Verify body content is preserved
      expect(screen.getByText("این دارو نباید در بیماران آسمی مصرف شود.")).toBeInTheDocument();
      expect(screen.getByText("نیمه‌عمر بیولوژیکی با کلیرانس رابطه معکوس دارد.")).toBeInTheDocument();
      expect(screen.getByText("جذب دارو با معده خالی افزایش می‌یابد.")).toBeInTheDocument();
      expect(screen.getByText("مهارکننده‌های SGLT2 در نارسایی قلبی کاربرد دارند.")).toBeInTheDocument();
    });

    it("does NOT parse callouts when enableLessonCallouts is false or omitted (default scope)", () => {
      const text = "⚠️ اشتباه رایج: این یک اشتباه متداول است.";
      const { container } = render(<MarkdownRenderer content={text} />);

      // Must not render a lesson-callout container
      expect(container.querySelector(".lesson-callout")).not.toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="common-mistake"]')).not.toBeInTheDocument();

      // Text is rendered as normal paragraph text
      expect(container.textContent).toContain("اشتباه رایج");
    });

    it("prevents false positives when trigger appears in the middle of a sentence", () => {
      const text = "در این درس درباره ⚠️ اشتباه رایج: مصرف خودسرانه آنتی‌بیوتیک‌ها صحبت می‌کنیم.";
      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      // Must NOT be converted to a callout box
      expect(container.querySelector(".lesson-callout")).not.toBeInTheDocument();
      expect(container.textContent).toContain("در این درس درباره");
    });

    it("prevents false positives when phrase is part of natural speech without emoji or colon", () => {
      const text = "اشتباه رایج دانشجویان در محاسبه دوز داروها ناشی از عدم توجه به وزن بیمار است.";
      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      // Must NOT be converted to a callout box
      expect(container.querySelector(".lesson-callout")).not.toBeInTheDocument();
      expect(container.textContent).toContain("اشتباه رایج دانشجویان");
    });

    it("handles whitespace and punctuation variations in callout triggers", () => {
      const text = [
        "⚠️  اشتباه رایج : متن تستی اول",
        "",
        "🧠   برای فهم بهتر: متن تستی دوم",
        "",
        "📌 نکته آموزشی: متن تستی سوم",
        "",
        "💊 کاربرد دارویی نوین : متن تستی چهارم",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      const callouts = container.querySelectorAll(".lesson-callout");
      expect(callouts.length).toBe(4);
      expect(screen.getByText("متن تستی اول")).toBeInTheDocument();
      expect(screen.getByText("متن تستی دوم")).toBeInTheDocument();
      expect(screen.getByText("متن تستی سوم")).toBeInTheDocument();
      expect(screen.getByText("متن تستی چهارم")).toBeInTheDocument();
    });

    it("handles bold formatting around callout triggers (**⚠️ اشتباه رایج:**)", () => {
      const text = [
        "**⚠️ اشتباه رایج:** بسیاری از دانشجویان پروپرانولول را اشتباه می‌گیرند.",
        "",
        "⚠️ **برای فهم بهتر:** این مفهوم را با نمودار یاد بگیرید.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      const callouts = container.querySelectorAll(".lesson-callout");
      expect(callouts.length).toBe(2);
      expect(container.querySelector('[data-callout-type="common-mistake"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="understanding"]')).toBeInTheDocument();
      expect(screen.getByText("بسیاری از دانشجویان پروپرانولول را اشتباه می‌گیرند.")).toBeInTheDocument();
      expect(screen.getByText("این مفهوم را با نمودار یاد بگیرید.")).toBeInTheDocument();
    });

    it("handles standalone title line followed by explanation paragraph", () => {
      const text = [
        "⚠️ اشتباه رایج:",
        "",
        "بسیاری از دانشجویان فرمول کلیرانس را با حجم توزیع اشتباه محاسبه می‌کنند.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="common-mistake"]');
      expect(callout).toBeInTheDocument();
      expect(screen.getByText("اشتباه رایج")).toBeInTheDocument();
      expect(screen.getByText("بسیاری از دانشجویان فرمول کلیرانس را با حجم توزیع اشتباه محاسبه می‌کنند.")).toBeInTheDocument();
    });

    it("supports blockquote callout format (> ⚠️ اشتباه رایج: ...)", () => {
      const text = [
        "> ⚠️ اشتباه رایج:",
        "> این مورد را با داروی دیگر اشتباه نگیرید.",
        ">",
        "> نکته دیگر اینکه دوز نگهدارنده باید تعدیل شود.",
      ].join("\n");

      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="common-mistake"]');
      expect(callout).toBeInTheDocument();
      expect(screen.getByText("این مورد را با داروی دیگر اشتباه نگیرید.")).toBeInTheDocument();
      expect(screen.getByText("نکته دیگر اینکه دوز نگهدارنده باید تعدیل شود.")).toBeInTheDocument();
    });

    it("preserves rich markdown (bold, italic, lists, code, links) and LaTeX inside Callout", () => {
      const text = [
        "🧠 برای فهم بهتر: بررسی دقیق داروی **پروپرانولول** با فرمول $T_4$ و $CL = \\frac{V_d}{t_{1/2}}$:",
        "",
        "- نکته ۱: اثر بر گیرنده $\\beta_1$",
        "- نکته ۲: به دستور `npm test` یا لینک [راهنما](https://example.com) دقت کنید.",
        "",
        "$$\\text{AUC} = \\frac{D}{CL}$$",
      ].join("\n");

      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="understanding"]');
      expect(callout).toBeInTheDocument();

      // Bold inside callout
      const strongEl = callout?.querySelector("strong");
      expect(strongEl?.textContent).toBe("پروپرانولول");

      // Math rendered with KaTeX inside callout
      const katexElements = callout?.querySelectorAll(".katex");
      expect(katexElements && katexElements.length).toBeGreaterThanOrEqual(3);

      // Code inside callout
      const codeEl = callout?.querySelector("code");
      expect(codeEl?.textContent).toBe("npm test");

      // Link inside callout
      const linkEl = callout?.querySelector("a");
      expect(linkEl).toHaveAttribute("href", "https://example.com");
      expect(linkEl?.textContent).toBe("راهنما");

      // List inside callout
      const listEl = callout?.querySelector("ul");
      expect(listEl).toBeInTheDocument();
    });

    it("does not break standard blockquotes or normal markdown when enableLessonCallouts is true", () => {
      const text = [
        "# سرتیتر اصلی",
        "",
        "> این یک نقل‌قول معمولی است و نباید به کال‌اوت تبدیل شود.",
        "",
        "متن عادی پاراگراف با فرمول $T_3$.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      expect(container.querySelector(".lesson-callout")).not.toBeInTheDocument();
      expect(container.querySelector("blockquote")).toBeInTheDocument();
      expect(container.querySelector("h1")?.textContent).toBe("سرتیتر اصلی");
      expect(container.querySelectorAll(".katex").length).toBe(1);
    });

    it("ensures RTL direction, compact container classes, and no horizontal overflow classes", () => {
      const text = "💊 کاربرد دارویی نوین: داروی جدید در درمان آریتمی قلبی موثر است.";
      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="drug-application"]');
      expect(callout).toHaveAttribute("dir", "rtl");
      expect(callout).toHaveClass("w-full");
      expect(callout).toHaveClass("overflow-hidden");
      expect(callout).toHaveClass("rounded-2xl");
      // Compact density & spacing
      expect(callout).toHaveClass("px-3.5");
      expect(callout).toHaveClass("py-2.5");
      expect(callout).toHaveClass("my-3.5");
      // Compact title and icon
      const icon = callout?.querySelector("svg");
      expect(icon).toHaveClass("w-4");
      expect(icon).toHaveClass("h-4");
      // Compact body typography
      const bodyWrapper = callout?.querySelector("div:last-child");
      expect(bodyWrapper).toHaveClass("text-[13.5px]");
      expect(bodyWrapper).toHaveClass("leading-[1.8]");
      expect(bodyWrapper).toHaveClass("space-y-2");
      expect(bodyWrapper).toHaveClass("[&>p]:!mb-0");
      expect(bodyWrapper).toHaveClass("[&>*:last-child]:!mb-0");
    });

    it("ensures balanced top-and-bottom vertical spacing in single and multi-paragraph callouts", () => {
      const multiParagraphCallout = [
        "> **نکته کلیدی:** پاراگراف اول از توضیحات آموزشی درباره مکانیسم دارو.",
        ">",
        "> پاراگراف دوم برای شفاف‌سازی بیشتر و جمع‌بندی موضوع.",
      ].join("\n");

      const { container } = render(
        <MarkdownRenderer content={multiParagraphCallout} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="key-point"]');
      expect(callout).toBeInTheDocument();
      // Equal vertical padding top and bottom (py-2.5 sm:py-3)
      expect(callout).toHaveClass("py-2.5");
      expect(callout).toHaveClass("sm:py-3");
      // Paragraph margin reset and last-child bottom margin elimination
      const bodyWrapper = callout?.querySelector("div:last-child");
      expect(bodyWrapper).toHaveClass("[&>*:first-child]:!mt-0");
      expect(bodyWrapper).toHaveClass("[&>*:last-child]:!mb-0");
      expect(bodyWrapper).toHaveClass("[&>p]:!mb-0");
    });

    it("handles Persian zero-width non-joiner (ZWNJ / نیم‌فاصله) correctly", () => {
      const text = [
        "⚠️ اشتباه‌رایج: نیم‌فاصله در عنوان نباید مانع تشخیص شود.",
        "",
        "🧠 برای‌فهم‌بهتر: مفهوم دوم با نیم‌فاصله.",
        "",
        "📌 نکته‌آموزشی: مفهوم سوم با نیم‌فاصله.",
        "",
        "💊 کاربرد‌دارویی‌نوین: مفهوم چهارم با نیم‌فاصله.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={text} enableLessonCallouts />
      );

      const callouts = container.querySelectorAll(".lesson-callout");
      expect(callouts.length).toBe(4);
    });

    it("renders multiple interleaved callouts and headings in a full lesson structure", () => {
      const fullLesson = [
        "# فصل اول: فارماکولوژی قلب",
        "",
        "متن مقدماتی درسنامه برای دانشجویان.",
        "",
        "⚠️ اشتباه رایج: اشتباه گرفتن بتابلوکرها با مهارکننده‌های ACE.",
        "",
        "## بخش دوم: مکانیسم اثر",
        "",
        "توضیحات مربوط به آنزیم مبدل آنژیوتانسین.",
        "",
        "🧠 برای فهم بهتر:",
        "مهار آنزیم سبب اتساع عروق می‌شود.",
        "",
        "📌 نکته آموزشی: قرص کاپتوپریل نیم ساعت قبل از غذا مصرف شود.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={fullLesson} enableLessonCallouts />
      );

      expect(container.querySelectorAll("h1").length).toBe(1);
      expect(container.querySelectorAll("h2").length).toBe(1);
      expect(container.querySelectorAll(".lesson-callout").length).toBe(3);
    });

    it("safely handles inline mode when content has callout text", () => {
      const text = "⚠️ اشتباه رایج: متن تستی در حالت این‌لاین";
      const { container } = render(<MarkdownRenderer content={text} inline />);
      expect(container.querySelector(".rich-content-inline")).toBeInTheDocument();
    });

    it("correctly fixes Bug 1: eliminates extra stray closing parenthesis after inline math in callouts", () => {
      const bug1Input = "📌 نکته آموزشی: فرم فعال ویتامین D یعنی $1,25(OH)_2D$) است.";
      const { container } = render(
        <MarkdownRenderer content={bug1Input} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="educational-tip"]');
      expect(callout).toBeInTheDocument();
      expect(callout?.querySelector(".katex")).toBeInTheDocument();
      // Must not contain stray closing parenthesis outside math
      expect(callout?.textContent).not.toContain("D$)");
      expect(callout?.textContent).not.toContain("D)");
      expect(callout?.textContent).toContain("فرم فعال ویتامین D یعنی");
    });

    it("preserves intentional outer parentheses enclosing math expressions", () => {
      const parenthesizedInput = "📌 نکته آموزشی: فرم فعال (یعنی $1,25(OH)_2D$) در کلیه ساخته می‌شود.";
      const { container } = render(
        <MarkdownRenderer content={parenthesizedInput} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="educational-tip"]');
      expect(callout).toBeInTheDocument();
      expect(callout?.querySelector(".katex")).toBeInTheDocument();
      expect(callout?.textContent).toContain("(یعنی");
      expect(callout?.textContent).toContain("در کلیه ساخته می‌شود.");
    });

    it("correctly fixes Bug 2: renders 💡 توضیح تکمیلی and variants as supplementary callout box", () => {
      const variants = [
        "💡 توضیح تکمیلی: این یک نکته اضافی برای درک بهتر مکانیسم است.",
        "توضیح تکمیلی: نکته تکمیلی بدون ایموجی.",
        "💡 اطلاعات تکمیلی: اطلاعات دارویی بیشتر.",
        "نکته تکمیلی: نکته جانبی.",
      ];

      for (const text of variants) {
        const { container } = render(
          <MarkdownRenderer content={text} enableLessonCallouts />
        );

        const callout = container.querySelector('[data-callout-type="supplementary"]');
        expect(callout).toBeInTheDocument();
        expect(container.textContent).not.toContain("💡");
        expect(callout?.textContent).toContain("توضیح تکمیلی");
      }
    });

    it("correctly fixes Bug 3: parses LaTeX formulas with comma decimals and text commands inside parenthetical paragraphs", () => {
      const bug3Input =
        "ویتامین D (از طریق متابولیت فعال خود، یعنی $1,25\\text{-dihydroxyvitamin D}$ یا همان کلسیتریول) به جذب کلسیم کمک می‌کند.";
      const { container } = render(
        <MarkdownRenderer content={bug3Input} enableLessonCallouts />
      );

      // Must render KaTeX for the formula
      expect(container.querySelector(".katex")).toBeInTheDocument();
      // Must not leave raw unrendered dollar syntax
      expect(container.textContent).not.toContain("$1,25");
      expect(container.textContent).not.toContain("\\$1,25");
      // Outer parentheses must be intact
      expect(container.textContent).toContain("ویتامین D (از طریق متابولیت فعال خود، یعنی");
      expect(container.textContent).toContain("یا همان کلسیتریول) به جذب کلسیم کمک می‌کند.");
    });

    it("verifies all 5 Callout types render clean Persian titles without emojis", () => {
      const allFive = [
        "⚠️ اشتباه رایج: نباید با داروی بتا بلوکر مصرف شود.",
        "🧠 برای فهم بهتر: مسیر سیگنالینگ وابسته به کلسیم است.",
        "📌 نکته آموزشی: دوز دارو صبح‌ها میل شود.",
        "💊 کاربرد دارویی نوین: در درمان بیماری‌های خودایمنی کاربرد دارد.",
        "💡 توضیح تکمیلی: متابولیت ثانویه در کبد غیرفعال می‌شود.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={allFive} enableLessonCallouts />
      );

      const callouts = container.querySelectorAll(".lesson-callout");
      expect(callouts.length).toBe(5);

      expect(screen.getByText("اشتباه رایج")).toBeInTheDocument();
      expect(screen.getByText("برای فهم بهتر")).toBeInTheDocument();
      expect(screen.getByText("نکته آموزشی")).toBeInTheDocument();
      expect(screen.getByText("کاربرد دارویی نوین")).toBeInTheDocument();
      expect(screen.getByText("توضیح تکمیلی")).toBeInTheDocument();

      expect(container.textContent).not.toContain("⚠️");
      expect(container.textContent).not.toContain("🧠");
      expect(container.textContent).not.toContain("📌");
      expect(container.textContent).not.toContain("💊");
      expect(container.textContent).not.toContain("💡");
    });

    describe("Regression: Callout Extra Asterisks (**) Elimination", () => {
      it("renders Sample 1 'درباره سناریوی بالینی (Case Study)' without extra ** in textContent", () => {
        const rawInput = "> **نکته بالینی: درباره سناریوی بالینی (Case Study):** در بیمار با نارسایی قلبی و برونکواسپاسم، تجویز بتابلاکر غیراختصاصی منع مصرف دارد.";
        const normalized = normalizeEducationalContent(rawInput);

        const { container } = render(
          <MarkdownRenderer content={normalized} enableLessonCallouts />
        );

        const callout = container.querySelector('[data-callout-type="clinical-point"]');
        expect(callout).toBeInTheDocument();
        expect(screen.getByText("نکته بالینی")).toBeInTheDocument();
        expect(container.textContent).not.toContain("**");
        expect(container.textContent).not.toContain("Study):**");
        expect(container.textContent).toContain("درباره سناریوی بالینی (Case Study): در بیمار با نارسایی قلبی");
      });

      it("renders Sample 2 'در ارتباط با کمبود آنزیمی' without extra ** in textContent", () => {
        const rawInput = "**نکته آموزشی: در ارتباط با کمبود آنزیمی:** کمبود آنزیم G6PD باعث حساسیت به داروهای اکسیدان می‌شود.";
        const normalized = normalizeEducationalContent(rawInput);

        const { container } = render(
          <MarkdownRenderer content={normalized} enableLessonCallouts />
        );

        const callout = container.querySelector('[data-callout-type="educational-tip"]');
        expect(callout).toBeInTheDocument();
        expect(screen.getByText("نکته آموزشی")).toBeInTheDocument();
        expect(container.textContent).not.toContain("**");
        expect(container.textContent).not.toContain("آنزیمی:**");
        expect(container.textContent).toContain("در ارتباط با کمبود آنزیمی: کمبود آنزیم G6PD");
      });

      it("renders Sample 3 '(آندروژنهای آدرنال)' without extra ** in textContent", () => {
        const rawInput1 = "> **نکته کلیدی: (آندروژنهای آدرنال):** ترشح DHEA توسط ACTH کنترل می‌شود.";
        const rawInput2 = "> **نکته کلیدی (آندروژنهای آدرنال):** ترشح DHEA توسط ACTH کنترل می‌شود.";

        const norm1 = normalizeEducationalContent(rawInput1);
        const norm2 = normalizeEducationalContent(rawInput2);

        const { container: c1 } = render(
          <MarkdownRenderer content={norm1} enableLessonCallouts />
        );
        expect(c1.querySelector('[data-callout-type="key-point"]')).toBeInTheDocument();
        expect(c1.textContent).not.toContain("**");
        expect(c1.textContent).not.toContain("آدرنال):**");
        expect(c1.textContent).toContain("(آندروژنهای آدرنال): ترشح DHEA توسط ACTH کنترل می‌شود.");

        const { container: c2 } = render(
          <MarkdownRenderer content={norm2} enableLessonCallouts />
        );
        expect(c2.querySelector('[data-callout-type="key-point"]')).toBeInTheDocument();
        expect(c2.textContent).not.toContain("**");
        expect(c2.textContent).not.toContain("آدرنال):**");
        expect(c2.textContent).toContain("(آندروژنهای آدرنال): ترشح DHEA توسط ACTH کنترل می‌شود.");
      });

      it("renders canonical Callout (> **نکته مهم:** متن) cleanly with zero ** artifacts", () => {
        const canonical = "> **نکته مهم:** این یک متن آموزشی استاندارد است.";
        const normalized = normalizeEducationalContent(canonical);

        const { container } = render(
          <MarkdownRenderer content={normalized} enableLessonCallouts />
        );

        const callout = container.querySelector('[data-callout-type="important"]');
        expect(callout).toBeInTheDocument();
        expect(screen.getByText("نکته مهم")).toBeInTheDocument();
        expect(container.textContent).not.toContain("**");
        expect(container.textContent).toContain("این یک متن آموزشی استاندارد است.");
      });

      it("preserves legitimate Markdown bold tags inside Callout body", () => {
        const input = "> **نکته بالینی: درباره سناریوی بالینی (Case Study):** داروی **پروپرانولول** یک **بتابلاکر غیراختصاصی** است.";
        const normalized = normalizeEducationalContent(input);

        const { container } = render(
          <MarkdownRenderer content={normalized} enableLessonCallouts />
        );

        const callout = container.querySelector('[data-callout-type="clinical-point"]');
        expect(callout).toBeInTheDocument();
        expect(container.textContent).not.toContain("**");

        const strongElements = callout?.querySelectorAll("strong");
        expect(strongElements && strongElements.length).toBeGreaterThanOrEqual(2);
        expect(callout?.textContent).toContain("پروپرانولول");
        expect(callout?.textContent).toContain("بتابلاکر غیراختصاصی");
      });

      it("Rule 1 & 2: bolds title before colon, leaves normal text after colon as plain text", () => {
        const input = "نکته بالینی: این یک متن توضیحی کاملاً عادی است.";
        const { container } = render(
          <MarkdownRenderer content={input} enableLessonCallouts />
        );

        const callout = container.querySelector('[data-callout-type="clinical-point"]');
        expect(callout).toBeInTheDocument();

        // 1. Title before colon is bold (header has font-bold and title text)
        const titleSpan = callout?.querySelector("span.font-bold");
        expect(titleSpan).toBeInTheDocument();
        expect(titleSpan?.textContent).toBe("نکته بالینی");

        // 2. Body text after colon is normal (NO <strong> tags in body)
        const bodyWrapper = callout?.querySelector("div:last-child");
        expect(bodyWrapper?.querySelectorAll("strong").length).toBe(0);
        expect(bodyWrapper?.textContent).toContain("این یک متن توضیحی کاملاً عادی است.");
      });

      it("Rule 3 & 4: preserves single and multiple independent bold tags after colon", () => {
        const singleBold = "نکته بالینی: این دارو برای **بیماران پرخطر** توصیه میشود.";
        const { container: c1 } = render(
          <MarkdownRenderer content={singleBold} enableLessonCallouts />
        );
        const callout1 = c1.querySelector('[data-callout-type="clinical-point"]');
        const body1 = callout1?.querySelector("div:last-child");
        const strongs1 = body1?.querySelectorAll("strong");
        expect(strongs1?.length).toBe(1);
        expect(strongs1?.[0].textContent).toBe("بیماران پرخطر");
        expect(body1?.textContent).toContain("این دارو برای بیماران پرخطر توصیه میشود.");
        expect(c1.textContent).not.toContain("**");

        const multipleBolds = "> **نکته بالینی:** داروی **پروپرانولول** یک **بتابلاکر غیراختصاصی** است و برای **آسم** منع مصرف دارد.";
        const { container: c2 } = render(
          <MarkdownRenderer content={multipleBolds} enableLessonCallouts />
        );
        const callout2 = c2.querySelector('[data-callout-type="clinical-point"]');
        const body2 = callout2?.querySelector("div:last-child");
        const strongs2 = body2?.querySelectorAll("strong");
        expect(strongs2?.length).toBe(3);
        expect(strongs2?.[0].textContent).toBe("پروپرانولول");
        expect(strongs2?.[1].textContent).toBe("بتابلاکر غیراختصاصی");
        expect(strongs2?.[2].textContent).toBe("آسم");
        expect(c2.textContent).not.toContain("**");
      });

      it("Rule 5 & 6: pre-bolded titles (**نکته بالینی:** or **نکته بالینی: متن**) do not create nested bold and zero raw ** leaks", () => {
        const preBolded1 = "**نکته بالینی: متن توضیحی**";
        const { container: c1 } = render(
          <MarkdownRenderer content={preBolded1} enableLessonCallouts />
        );
        const callout1 = c1.querySelector('[data-callout-type="clinical-point"]');
        expect(callout1).toBeInTheDocument();
        expect(c1.textContent).not.toContain("**");
        expect(c1.textContent).not.toContain("****");
        const body1 = callout1?.querySelector("div:last-child");
        // Body text was not explicitly bolded, so it should be plain text
        expect(body1?.querySelectorAll("strong").length).toBe(0);
        expect(body1?.textContent).toContain("متن توضیحی");

        const preBoldedWithInnerBold = "**نکته بالینی: این دارو برای **بیماران پرخطر** توصیه میشود.**";
        const { container: c2 } = render(
          <MarkdownRenderer content={preBoldedWithInnerBold} enableLessonCallouts />
        );
        const callout2 = c2.querySelector('[data-callout-type="clinical-point"]');
        expect(callout2).toBeInTheDocument();
        expect(c2.textContent).not.toContain("**");
        const body2 = callout2?.querySelector("div:last-child");
        expect(body2?.textContent).toContain("این دارو برای بیماران پرخطر توصیه میشود.");
      });
    });
  });

  describe("Scientific Content & Notation Invariant Suite ($T_4$, $T_3$, Formulas)", () => {
    it("preserves exact semantic tokens in normalizeRichContent: $T_4$, $T_3$, $C_{max}$, $1,25(OH)_2D$", () => {
      const input = "م تبدیل محیطی $T_4$ به $T_3$ را مهار میکنند";
      const normalized = normalizeRichContent(input);
      expect(normalized).toBe("م تبدیل محیطی $T_4$ به $T_3$ را مهار میکنند");

      expect(normalizeRichContent("$T_4$")).toBe("$T_4$");
      expect(normalizeRichContent("$T_3$")).toBe("$T_3$");
      expect(normalizeRichContent("$T_4 \\to T_3$")).toBe("$T_4 \\to T_3$");
      expect(normalizeRichContent("$T_4$ به $T_3$ تبدیل میشود.")).toBe("$T_4$ به $T_3$ تبدیل میشود.");
      expect(normalizeRichContent("$C_{max}$")).toBe("$C_{max}$");
      expect(normalizeRichContent("$T_4/T_3$")).toBe("$T_4/T_3$");
      expect(normalizeRichContent("$1,25(OH)_2D$")).toBe("$1,25(OH)_2D$");
    });

    it("renders 'م تبدیل محیطی $T_4$ به $T_3$ را مهار میکنند' preserving both $T_4$ and $T_3$ as distinct KaTeX elements", () => {
      const input = "م تبدیل محیطی $T_4$ به $T_3$ را مهار میکنند";
      const { container } = render(<MarkdownRenderer content={input} />);

      const katexElements = container.querySelectorAll(".katex");
      expect(katexElements.length).toBe(2);

      // Verify the first KaTeX element is T_4
      expect(katexElements[0].textContent).toContain("T");
      expect(katexElements[0].textContent).toContain("4");

      // Verify the second KaTeX element is T_3
      expect(katexElements[1].textContent).toContain("T");
      expect(katexElements[1].textContent).toContain("3");

      // Verify text around the formulas is preserved
      expect(container.textContent).toContain("م تبدیل محیطی");
      expect(container.textContent).toContain("به");
      expect(container.textContent).toContain("را مهار میکنند");
    });

    it("renders isolated $T_4$ and $T_3$ without cross-contamination or semantic alteration", () => {
      const { container: c4 } = render(<MarkdownRenderer content="$T_4$" />);
      const k4 = c4.querySelectorAll(".katex");
      expect(k4.length).toBe(1);
      expect(k4[0].textContent).toContain("4");
      expect(k4[0].textContent).not.toContain("3");

      const { container: c3 } = render(<MarkdownRenderer content="$T_3$" />);
      const k3 = c3.querySelectorAll(".katex");
      expect(k3.length).toBe(1);
      expect(k3[0].textContent).toContain("3");
      expect(k3[0].textContent).not.toContain("4");
    });

    it("renders $T_4 \\to T_3$ and $T_4/T_3$ formulas accurately in KaTeX", () => {
      const { container: cArrow } = render(<MarkdownRenderer content="$T_4 \\to T_3$" />);
      expect(cArrow.querySelectorAll(".katex").length).toBe(1);
      expect(cArrow.textContent).not.toContain("$T_4 \\to T_3$");

      const { container: cRatio } = render(<MarkdownRenderer content="نسبت $T_4/T_3$ در تیروئید" />);
      expect(cRatio.querySelectorAll(".katex").length).toBe(1);
      expect(cRatio.textContent).toContain("نسبت");
      expect(cRatio.textContent).toContain("در تیروئید");
    });
  });

  describe("Zero-Emoji Semantic Callout & Canonical Variant Suite", () => {
    it("renders all canonical zero-emoji callout variants with correct UI box and data attributes", () => {
      const canonicalMarkdown = [
        "> **هشدار:** در بیماران با سابقه برونکواسپاسم شدید با احتیاط مصرف شود.",
        "",
        "> **اشتباه رایج:** این دارو نباید با مهارکننده‌های ACE اشتباه گرفته شود.",
        "",
        "> **نکته مهم:** پایش عملکرد کلیه پیش از آغاز درمان الزامی است.",
        "",
        "> **نکته بالینی:** دوز اولیه باید با کمترین مقدار ممکن شروع شود.",
        "",
        "> **منع مصرف:** در شوک قلبی (Cardiogenic shock) منع مصرف مطلق دارد.",
        "",
        "> **نکته کلیدی:** انتخابی بودن گیرنده بتا-۱ در دوزهای بالا کاهش می‌یابد.",
        "",
        "> **نکته آموزشی:** جهت کاهش عوارض گوارشی بعد از غذا میل شود.",
        "",
        "> **برای فهم بهتر:** این اثر مشابه ترمز گرفتن در سراشیبی تند است.",
        "",
        "> **توضیح تکمیلی:** این اثرات در مدل‌های حیوانی نیز مشاهده شده است.",
      ].join("\n\n");

      const { container } = render(
        <MarkdownRenderer content={canonicalMarkdown} enableLessonCallouts />
      );

      const callouts = container.querySelectorAll(".lesson-callout");
      expect(callouts.length).toBe(9);

      expect(container.querySelector('[data-callout-type="warning"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="common-mistake"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="important"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="clinical-point"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="contraindication"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="key-point"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="educational-tip"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="understanding"]')).toBeInTheDocument();
      expect(container.querySelector('[data-callout-type="supplementary"]')).toBeInTheDocument();

      // Ensure zero emojis exist anywhere in the rendered container
      expect(container.textContent).not.toMatch(/[⚠️🚨❗❌✅💡📌💊⛔🚫🔑⭐🧠✨🔴🟢]/);
    });

    it("recovers user bug scenario with full medical text and no emoji in rendered output", () => {
      const bugScenario =
        "⚠️ اشتباه رایج در بیماران مبتلا به آسم یا نارسایی قلبی شدید: اگر بتابلاکرها به دلیل برونکواسپاسم یا نارسایی قلبی شدید منع مصرف داشته باشند، برای کنترل تاکیکاردی و فشارخون میتوان از دیلتیازم (Diltiazem) استفاده کرد.";

      const { container } = render(
        <MarkdownRenderer content={bugScenario} enableLessonCallouts />
      );

      const callout = container.querySelector('[data-callout-type="common-mistake"]');
      expect(callout).toBeInTheDocument();
      expect(screen.getByText("اشتباه رایج")).toBeInTheDocument();
      expect(container.textContent).toContain("دیلتیازم (Diltiazem)");
      expect(container.textContent).not.toContain("⚠️");
    });
  });
});



