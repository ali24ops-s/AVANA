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

  describe("Step 0 / Phase 7 Comprehensive Regression Tests", () => {
    it("Case A: safely parses JSON with raw unescaped LaTeX backslashes without syntax error or corruption", () => {
      // Raw single-backslash LaTeX commands that usually cause JSON SyntaxError (bad escape)
      const rawModelOutput = `{
  "kind": "flashcards",
  "cards": [
    {
      "question": "واکنش تبدیل با آنتالپی \\Delta H و ثابت \\alpha و دمای 37^\\circ C چیست؟",
      "answer": "فرمول \\ce{A -> B} با سرعت \\frac{d[A]}{dt} و زاویه \\theta و ضریب \\Gamma و ضریب \\epsilon و \\to و \\xrightarrow[cat]{\\Delta}",
      "explanation": "مقدار \\beta و \\rho و \\tau و \\nabla f و \\neq 0 به همراه واحد \\pu{10 J/mol} و \\degree C بررسی شد.",
      "cardType": "mechanism",
      "difficulty": "medium",
      "citationChunkIds": ["chunk-1"]
    }
  ]
}`;
      const result = cleanAndParseJson<{
        kind: string;
        cards: Array<{
          question: string;
          answer: string;
          explanation: string;
          cardType: string;
          difficulty: string;
          citationChunkIds: string[];
        }>;
      }>(rawModelOutput, "flashcard");

      expect(result.cards).toHaveLength(1);
      const card = result.cards[0];
      expect(card.question).toContain("\\Delta H");
      expect(card.question).toContain("\\alpha");
      expect(card.question).toContain("37^\\circ C");
      expect(card.answer).toContain("\\ce{A -> B}");
      expect(card.answer).toContain("\\frac{d[A]}{dt}");
      expect(card.answer).toContain("\\Gamma");
      expect(card.answer).toContain("\\epsilon");
      expect(card.answer).toContain("\\xrightarrow[cat]{\\Delta}");
      expect(card.explanation).toContain("\\beta");
      expect(card.explanation).toContain("\\rho");
      expect(card.explanation).toContain("\\nabla f");
      expect(card.explanation).toContain("\\pu{10 J/mol}");
      // Verify no formfeed or backspace control characters
      expect(card.answer).not.toContain("\x0Crac");
      expect(card.explanation).not.toContain("\x08eta");
    });

    it("Case B: safely handles Persian and English quotes without breaking parsing", () => {
      const rawModelOutput = `{
  "kind": "flashcards",
  "cards": [
    {
      "question": "آیا داروی «پروپرانولول» یک داروی \\"بتابلاکر\\" غیراختصاصی است؟",
      "answer": "بله، داروی «پروپرانولول» گیرنده‌های \\"Beta-1\\" و \\"Beta-2\\" را مهار می‌کند.",
      "explanation": "In English: \\"Propranolol is a non-selective beta blocker\\".",
      "cardType": "definition",
      "difficulty": "easy",
      "citationChunkIds": ["chunk-1"]
    }
  ]
}`;
      const result = cleanAndParseJson<{
        kind: string;
        cards: Array<{ question: string; answer: string; explanation: string }>;
      }>(rawModelOutput, "flashcard");

      expect(result.cards[0].question).toContain("«پروپرانولول»");
      expect(result.cards[0].question).toContain('"بتابلاکر"');
      expect(result.cards[0].answer).toContain('"Beta-1"');
      expect(result.cards[0].explanation).toContain('English: "Propranolol');
    });

    it("Case C: safely parses Chemistry SMILES and reactions without modification", () => {
      const smilesJson = `{
  "kind": "flashcards",
  "cards": [
    {
      "question": "ساختار SMILES آسپرین چیست؟",
      "answer": "CC(=O)Oc1ccccc1C(=O)O",
      "explanation": "بنزن: C1=CC=CC=C1 و واکنش: \\ce{C6H6 + HNO3 -> C6H5NO2 + H2O}",
      "cardType": "key_fact",
      "difficulty": "medium",
      "citationChunkIds": ["chunk-chem-1"]
    }
  ]
}`;
      const result = cleanAndParseJson<{
        kind: string;
        cards: Array<{ question: string; answer: string; explanation: string }>;
      }>(smilesJson, "flashcard");

      expect(result.cards[0].answer).toBe("CC(=O)Oc1ccccc1C(=O)O");
      expect(result.cards[0].explanation).toContain("C1=CC=CC=C1");
      expect(result.cards[0].explanation).toContain("\\ce{C6H6 + HNO3 -> C6H5NO2 + H2O}");
    });

    it("Case D: safely parses nested chart data structures", () => {
      const chartJson = `{
  "kind": "session",
  "title": "فارماکوکینتیک",
  "contentMarkdown": "نمودار غلظت پلاسمایی:\\n\`\`\`mermaid\\ngraph TD; A-->B;\\n\`\`\`",
  "chartData": {
    "type": "line",
    "points": [
      { "time": 0, "concentration": 0 },
      { "time": 1, "concentration": 10.5 },
      { "time": 2, "concentration": 8.2 }
    ]
  },
  "citationChunkIds": ["chunk-1"]
}`;
      const result = cleanAndParseJson<{
        kind: string;
        title: string;
        contentMarkdown: string;
        chartData: { type: string; points: Array<{ time: number; concentration: number }> };
      }>(chartJson, "session");

      expect(result.title).toBe("فارماکوکینتیک");
      expect(result.chartData.type).toBe("line");
      expect(result.chartData.points).toHaveLength(3);
      expect(result.chartData.points[1].concentration).toBe(10.5);
    });

    it("Case E & Flashcard Fallback: recovers flashcards from malformed output with citationChunkIds and arbitrary property order", () => {
      // Malformed JSON: unclosed array/object at the end, citationChunkIds first, question/answer order reversed
      const malformedFlashcards = `{
  "kind": "flashcards",
  "cards": [
    {
      "citationChunkIds": ["chk-99"],
      "difficulty": "hard",
      "answer": "مهار آنزیم HMG-CoA ردوکتاز با آنتالپی \\Delta H",
      "cardType": "mechanism",
      "question": "مکانیسم عمل آتورواستاتین چیست؟",
      "explanation": "کاهش کلسترول با فرمول \\frac{A}{B}",
      "sessionIndex": 3
    },
    {
      "question": "عارضه شایع متفورمین چیست؟",
      "answer": "عوارض گوارشی (تهوع و اسهال)",
      "citationChunkIds": ["chk-100"]
    }
  ]
}`;
      const result = cleanAndParseJson<{
        kind: string;
        cards: Array<{
          sessionIndex?: number;
          question: string;
          answer: string;
          explanation?: string;
          cardType: string;
          difficulty: string;
          citationChunkIds?: string[];
        }>;
      }>(malformedFlashcards, "flashcard");

      expect(result.cards).toHaveLength(2);
      expect(result.cards[0].question).toBe("مکانیسم عمل آتورواستاتین چیست؟");
      expect(result.cards[0].answer).toContain("\\Delta H");
      expect(result.cards[0].explanation).toContain("\\frac{A}{B}");
      expect(result.cards[0].sessionIndex).toBe(3);
      expect(result.cards[0].citationChunkIds).toEqual(["chk-99"]);

      expect(result.cards[1].question).toBe("عارضه شایع متفورمین چیست؟");
      expect(result.cards[1].answer).toBe("عوارض گوارشی (تهوع و اسهال)");
      expect(result.cards[1].citationChunkIds).toEqual(["chk-100"]);
    });

    it("distinguishes syntax errors (repaired) from domain schema errors", () => {
      // Syntax error is successfully repaired into valid object
      const syntaxErrorJson = `{\n  "kind": "session",\n  "title": "درس اول",\n  "contentMarkdown": "متن \\Delta",\n}`;
      const parsed = cleanAndParseJson<{ kind: string; title: string; contentMarkdown: string }>(syntaxErrorJson, "session");
      expect(parsed.kind).toBe("session");
      expect(parsed.contentMarkdown).toBe("متن \\Delta");

      // An unparseable non-JSON garbage string throws DomainError
      expect(() => cleanAndParseJson("Some completely non-json text with no braces", "lesson")).toThrow(DomainError);
    });
  });
});


