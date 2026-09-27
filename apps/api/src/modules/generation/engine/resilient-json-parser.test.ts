import { describe, it, expect } from "vitest";
import { cleanAndParseJson } from "./resilient-json-parser.js";
import { DomainError } from "@avana/domain";

describe("ResilientJsonParser (cleanAndParseJson)", () => {
  it("parses valid raw JSON directly", () => {
    const input = JSON.stringify({ key: "value", num: 42 });
    const result = cleanAndParseJson<{ key: string; num: number }>(input, "generic");
    expect(result).toEqual({ key: "value", num: 42 });
  });

  it("strips markdown json fences", () => {
    const input = "```json\n{\"title\": \"Lesson 1\", \"content\": \"text\"}\n```";
    const result = cleanAndParseJson<{ title: string; content: string }>(input, "generic");
    expect(result).toEqual({ title: "Lesson 1", content: "text" });
  });

  it("extracts JSON object when surrounded by conversational chatter", () => {
    const input = "Here is the requested output:\n{\"status\": \"ok\"}\nHope this helps!";
    const result = cleanAndParseJson<{ status: string }>(input, "generic");
    expect(result).toEqual({ status: "ok" });
  });

  it("safely preserves LaTeX backslashes without turning them into control characters", () => {
    const input = "{\"formula\": \"The value of \\\\frac{a}{b} and \\\\beta with \\\\text{label} is \\\\neq 0\"}";
    const result = cleanAndParseJson<{ formula: string }>(input, "generic");
    expect(result.formula).toContain("frac");
    expect(result.formula).toContain("beta");
  });

  it("removes trailing commas before closing braces/brackets", () => {
    const input = "{\n  \"items\": [1, 2, 3,],\n  \"name\": \"test\",\n}";
    const result = cleanAndParseJson<{ items: number[]; name: string }>(input, "generic");
    expect(result).toEqual({ items: [1, 2, 3], name: "test" });
  });

  it("normalizes raw arrays into typed batch structures", () => {
    const fcInput = "[{\"question\": \"Q1\", \"answer\": \"A1\"}]";
    const fcResult = cleanAndParseJson<{ kind: string; cards: unknown[] }>(fcInput, "flashcard");
    expect(fcResult.kind).toBe("flashcards_batch");
    expect(fcResult.cards).toHaveLength(1);

    const qzInput = "[{\"question\": \"Q1\", \"choices\": [\"A\", \"B\", \"C\", \"D\"], \"correctAnswer\": \"A\"}]";
    const qzResult = cleanAndParseJson<{ kind: string; questions: unknown[] }>(qzInput, "quiz");
    expect(qzResult.kind).toBe("quizzes_batch");
    expect(qzResult.questions).toHaveLength(1);
  });

  it("recovers sessions_batch via regex fallback when JSON is malformed", () => {
    const malformed = "{\n  \"sessions\": [\n    { \"index\": 0, \"title\": \"مقدمه\", \"contentMarkdown\": \"متن درس اول\" },\n    { \"index\": 1, \"title\": \"فارماکولوژی\", \"contentMarkdown\": \"متن درس دوم\"";
    const result = cleanAndParseJson<{ kind: string; sessions: Array<{ index: number; title: string; contentMarkdown: string }> }>(
      malformed,
      "sessions_batch"
    );
    expect(result.kind).toBe("sessions_batch");
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe("مقدمه");
  });

  it("throws specialized STAGE5 error for empty review_summary response", () => {
    expect(() => cleanAndParseJson("", "review_summary")).toThrowError(
      /STAGE5_INVALID_MODEL_JSON: Model returned an empty response/
    );
  });

  it("throws specialized STAGE5 error for malformed review_summary response", () => {
    expect(() => cleanAndParseJson("not a json at all", "review_summary")).toThrowError(
      /STAGE5_INVALID_MODEL_JSON: Model returned malformed or unparseable JSON/
    );
  });

  it("safely preserves \\mathrm, \\text, and chemical formulas without turning \\t into tabs", () => {
    const json = "{\"kind\": \"session\", \"title\": \"Alkyne\", \"contentMarkdown\": \"واکنش: \\\\text{CaC}_2 + 2\\\\text{H}_2\\\\text{O} \\\\longrightarrow \\\\text{HC}\\\\equiv\\\\text{CH} + \\\\text{Ca(OH)}_2\"}";
    const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(json, "session");
    expect(result.contentMarkdown).toContain("\\text{CaC}_2");
    expect(result.contentMarkdown).toContain("\\longrightarrow");
    expect(result.contentMarkdown).not.toContain("\text");
  });

  it("extracts session content without falling back to raw JSON string", () => {
    const rawInput = "Here is the session output:\n{\n  \"kind\": \"session\",\n  \"title\": \"جلسه ۲: خواص فیزیکی و اهمیت تجاری آلکین‌ها\",\n  \"contentMarkdown\": \"# جلسه ۲: خواص فیزیکی و اهمیت تجاری آلکین‌ها\\n\\nمتن درسنامه شیمی.\",\n  \"citationChunkIds\": [\"6945baa6-20b8-4ea3-89f8-8ba26f731440\"]\n}\nHope this helps!";
    const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(rawInput, "session");
    expect(result.title).toBe("جلسه ۲: خواص فیزیکی و اهمیت تجاری آلکین‌ها");
    expect(result.contentMarkdown).toBe("# جلسه ۲: خواص فیزیکی و اهمیت تجاری آلکین‌ها\n\nمتن درسنامه شیمی.");
    expect(result.contentMarkdown).not.toContain("citationChunkIds");
    expect(result.contentMarkdown).not.toContain("6945baa6-20b8-4ea3-89f8-8ba26f731440");
  });

  it("throws standard DomainError for empty response on other types", () => {
    expect(() => cleanAndParseJson("", "lesson")).toThrowError(DomainError);
    expect(() => cleanAndParseJson("   ", "flashcard")).toThrowError(/Model returned an empty response/);
  });

  describe("Attempt 5 safe LaTeX and JSON unescaping", () => {
    it("preserves LaTeX commands (\\text, \\rightleftharpoons, \\rightarrow, \\rho, \\tau, \\theta, \\times, \\nabla, \\neq) in malformed fallback", () => {
      // Malformed JSON (unclosed citation bracket) triggers Attempt 5 regex extraction
      const malformedJson = `{
  "kind": "session",
  "title": "بیوشیمی پایه ف ۱۶",
  "contentMarkdown": "واکنش برگشت‌پذیر:\\n$$\\\\text{GTP} + \\\\text{ADP} \\\\rightleftharpoons \\\\text{GDP} + \\\\text{ATP}$$\\nفرمول دیگر:\\n$$\\\\tau = \\\\theta \\\\times \\\\rho \\\\rightarrow \\\\nabla f \\\\quad (\\\\neq 0)$$\\n\\\\frac{a}{b} + \\\\beta + \\\\begin{aligned} x \\\\end{aligned}",
  "citationChunkIds": [
`;
      const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(malformedJson, "session");

      // Verify all LaTeX commands are strictly preserved
      expect(result.contentMarkdown).toContain("\\text{GTP}");
      expect(result.contentMarkdown).toContain("\\text{ADP}");
      expect(result.contentMarkdown).toContain("\\rightleftharpoons");
      expect(result.contentMarkdown).toContain("\\text{GDP}");
      expect(result.contentMarkdown).toContain("\\text{ATP}");
      expect(result.contentMarkdown).toContain("\\tau");
      expect(result.contentMarkdown).toContain("\\theta");
      expect(result.contentMarkdown).toContain("\\times");
      expect(result.contentMarkdown).toContain("\\rho");
      expect(result.contentMarkdown).toContain("\\rightarrow");
      expect(result.contentMarkdown).toContain("\\nabla");
      expect(result.contentMarkdown).toContain("\\neq");
      expect(result.contentMarkdown).toContain("\\frac{a}{b}");
      expect(result.contentMarkdown).toContain("\\beta");
      expect(result.contentMarkdown).toContain("\\begin{aligned}");

      // Verify NO unwanted control characters (TAB U+0009 or CR U+000D) corrupt LaTeX commands
      for (let i = 0; i < result.contentMarkdown.length; i++) {
        const code = result.contentMarkdown.charCodeAt(i);
        expect(code).not.toBe(13); // No CR (0x0D)
      }
      expect(result.contentMarkdown).not.toContain("\text");
      expect(result.contentMarkdown).not.toContain("\right");
    });

    it("correctly decodes genuine JSON escapes (\\n, \\t, \\\", \\\\) while preserving LaTeX", () => {
      const malformedJson = '{\n  "kind": "session",\n  "title": "تست اسکیپ",\n  "contentMarkdown": "Line 1\\nLine 2\\n# تیتر\\n- مورد اول\\t مورد دوم\\nنقل قول: \\"متن معتبر\\"\\nفرمول: $\\\\text{ATP} \\\\neq 0$",\n  "citationChunkIds": [\n';
      const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(malformedJson, "session");
      expect(result.contentMarkdown).toContain("Line 1\nLine 2\n# تیتر\n- مورد اول\t مورد دوم\nنقل قول: \"متن معتبر\"\nفرمول: $\\text{ATP} \\neq 0$");
    });

    it("preserves arbitrary/unknown LaTeX commands (\\newcommand, \\newenvironment, \\notin, \\operatorname, \\overline, \\underline, \\rtau)", () => {
      const malformedJson = `{
  "kind": "session",
  "title": "فرمول‌های پیشرفته",
  "contentMarkdown": "متن ابتدایی:\\n$$\\\\newcommand{\\\\myvec}[1]{\\\\vec{#1}} \\\\newenvironment{custom} \\\\notin \\\\operatorname{diag}(A) \\\\overline{x+y} \\\\underline{z} \\\\rtau$$\\nپایان",
  "citationChunkIds": [
`;
      const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(malformedJson, "session");

      expect(result.contentMarkdown).toContain("\\newcommand{\\myvec}[1]{\\vec{#1}}");
      expect(result.contentMarkdown).toContain("\\newenvironment{custom}");
      expect(result.contentMarkdown).toContain("\\notin");
      expect(result.contentMarkdown).toContain("\\operatorname{diag}(A)");
      expect(result.contentMarkdown).toContain("\\overline{x+y}");
      expect(result.contentMarkdown).toContain("\\underline{z}");
      expect(result.contentMarkdown).toContain("\\rtau");

      // Verify no control character corruptions
      for (let i = 0; i < result.contentMarkdown.length; i++) {
        const code = result.contentMarkdown.charCodeAt(i);
        expect(code).not.toBe(13); // No CR (0x0D)
      }
    });

    it("preserves LaTeX double backslash (\\\\) line breaks in aligned and matrix environments", () => {
      const malformedJson = `{
  "kind": "session",
  "title": "ماتریس و هم‌ترازی",
  "contentMarkdown": "خط اول\\n$$\\\\begin{aligned}\\n a &= b \\\\\\\\ c &= d \\\\\\\\ e &= f\\n\\\\end{aligned}$$\\nفرمول ساده: $$ a \\\\\\\\ b $$\\nخط آخر",
  "citationChunkIds": [
`;
      const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(malformedJson, "session");

      expect(result.contentMarkdown).toContain("a &= b \\\\ c &= d \\\\ e &= f");
      expect(result.contentMarkdown).toContain("$$ a \\\\ b $$");
      expect(result.contentMarkdown).toContain("خط اول\n");
      expect(result.contentMarkdown).toContain("\nخط آخر");
    });

    it("preserves LaTeX in all 4 math delimiter styles ($, $$, \\(, \\])", () => {
      const malformedJson = `{
  "kind": "session",
  "title": "سبک‌های ریاضی",
  "contentMarkdown": "1: $ \\\\text{ATP} \\\\neq 0 $\\n2: $$ \\\\text{ATP} \\\\neq 0 $$\\n3: \\\\( \\\\text{ATP} \\\\neq 0 \\\\)\\n4: \\\\[ \\\\text{ATP} \\\\neq 0 \\\\]",
  "citationChunkIds": [
`;
      const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(malformedJson, "session");

      expect(result.contentMarkdown).toContain("1: $ \\text{ATP} \\neq 0 $");
      expect(result.contentMarkdown).toContain("2: $$ \\text{ATP} \\neq 0 $$");
      expect(result.contentMarkdown).toContain("3: \\( \\text{ATP} \\neq 0 \\)");
      expect(result.contentMarkdown).toContain("4: \\[ \\text{ATP} \\neq 0 \\]");
    });

    it("strictly preserves raw text inside code blocks without unescaping", () => {
      const malformedJson = `{
  "kind": "session",
  "title": "بلوک کد",
  "contentMarkdown": "متن قبل\\n\`\`\`text\\n\\\\text{ATP}\\n\\\\nabla\\n\\\\t\\n\\\\r\\n\`\`\`\\nمتن بعد",
  "citationChunkIds": [
`;
      const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(malformedJson, "session");

      expect(result.contentMarkdown).toContain("```text\n\\text{ATP}\n\\nabla\n\\t\n\\r\n```");
    });

    describe("Category A Parser Repair & Delimiter Safety Regression Tests", () => {
      it("safely handles corrupted and healthy LaTeX across multiple math styles", () => {
        const input = `{
  "kind": "session",
  "title": "تست جامع",
  "contentMarkdown": "# جلسه بیوشیمی\\nمتن فارسی همراه با فرمول خطی $\\\\text{GTP} + \\\\text{ADP} \\\\rightleftharpoons \\\\text{GDP} + \\\\text{ATP}$ و فرمول بلوکی:\\n$$\\\\begin{aligned}\\n\\\\text{A} &= \\\\frac{1}{2}\\\\beta \\\\\\\\\\n\\\\text{B} &= \\\\nabla \\\\cdot \\\\vec{F}\\n\\\\end{aligned}$$\\nفرمول پرانتزی \\\\(\\\\theta \\\\times \\\\tau \\\\neq 0\\\\) و کروشه‌ای \\\\[\\\\Delta G^{\\\\circ\\\\prime}\\\\]\\n\`\`\`python\\n# Real code\\nprint(\\"\\\\ttext\\\\n\\")\\n\`\`\`\\nپایان درس.",
  "citationChunkIds": [
`;
        const result = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(input, "session");

        expect(result.contentMarkdown).toContain("$\\text{GTP} + \\text{ADP} \\rightleftharpoons \\text{GDP} + \\text{ATP}$");
        expect(result.contentMarkdown).toContain("\\begin{aligned}\n\\text{A} &= \\frac{1}{2}\\beta \\\\\n\\text{B} &= \\nabla \\cdot \\vec{F}\n\\end{aligned}");
        expect(result.contentMarkdown).toContain("\\(\\theta \\times \\tau \\neq 0\\)");
        expect(result.contentMarkdown).toContain("\\[\\Delta G^{\\circ\\prime}\\]");
        expect(result.contentMarkdown).toContain("print(\"\\ttext\\n\")");
        expect(result.contentMarkdown).toContain("متن فارسی همراه با فرمول خطی");
      });
    });
  });
});


