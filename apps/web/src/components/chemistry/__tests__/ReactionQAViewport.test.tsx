import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";

describe("Organic Chemistry Reaction Real Lesson QA & Viewport Suite", () => {
  const comprehensiveLessonMarkdown = [
    "# شیمی آلی: سنتز و واکنش‌های کلیدی ترکیبات کربونیل و آلکن‌ها",
    "",
    "در این درسنامه، واکنش‌های شاخص شیمی آلی با ساختار ۲بعدی بررسی می‌شوند.",
    "",
    "## ۱. واکنش نوع اول: تبدیل تک‌ماده‌ای (A → B)",
    "اکسیداسیون اتانول به استالدئید در مجاورت پیریدینیوم کلروکرومات (PCC):",
    "",
    "```reaction",
    "title: اکسیداسیون الکل به آلدئید",
    "type: اکسیداسیون ملایم",
    "reactants:",
    "  - smiles: CCO",
    "    name: اتانول",
    "reagents:",
    "  - PCC",
    "solvents:",
    "  - CH2Cl2",
    "products:",
    "  - smiles: CC=O",
    "    name: استالدئید",
    "```",
    "",
    "## ۲. واکنش نوع دوم: ترکیب دو جزء به یک فرآورده (A + B → C)",
    "واکنش حلقه‌زایی دیلز-آلدر میان ۱،۳-بوتادی‌ان و اتیلن:",
    "",
    "```reaction",
    "title: واکنش دیلز-آلدر (Diels-Alder)",
    "type: حلقه‌زایی [4+2]",
    "reactants:",
    "  - smiles: C=CC=C",
    "    name: ۱،۳-بوتادی‌ان",
    "  - smiles: C=C",
    "    name: اتیلن",
    "conditions:",
    "  - 150 °C",
    "products:",
    "  - smiles: C1=CCCCC1",
    "    name: سیکلوهگزن",
    "```",
    "",
    "## ۳. واکنش نوع سوم: دو واکنش‌دهنده به دو فرآورده با شرایط (A + B → C + D)",
    "استریفیکاسیون فیشر میان اسید کربوکسیلیک و الکل در محیط اسیدی و گرمایی:",
    "",
    "```reaction",
    "title: استریفیکاسیون فیشر (Fischer Esterification)",
    "type: جانشینی آسیل",
    "reactants:",
    "  - smiles: CC(=O)O",
    "    name: استیک اسید",
    "  - smiles: CCO",
    "    name: اتانول",
    "reagents:",
    "  - H2SO4",
    "conditions:",
    "  - Δ (حرارت)",
    "products:",
    "  - smiles: CC(=O)OCC",
    "    name: اتیل استات",
    "  - smiles: O",
    "    name: آب",
    "```",
    "",
    "## ۴. واکنش نوع چهارم: واکنش دارای استریوشیمی کایرال (Stereochemistry)",
    "واکنش جانشینی هسته‌دوستی SN2 همراه با واژگونی کامل پیکربندی فضایی (Inversion of Configuration):",
    "",
    "```reaction",
    "title: واکنش SN2 با واژگونی والدن",
    "type: جانشینی هسته‌دوستی دومولکولی",
    "reactants:",
    "  - smiles: CC[C@@H](C)Br",
    "    name: (R)-۲-بروموبوتان",
    "  - smiles: '[OH-]'",
    "    name: یون هیدروکسید",
    "solvents:",
    "  - DMSO",
    "products:",
    "  - smiles: CC[C@H](C)O",
    "    name: (S)-بوتان-۲-اول",
    "  - smiles: '[Br-]'",
    "    name: یون برومید",
    "```",
    "",
    "## ۵. واکنش نوع پنجم: مسیر سنتزی چندمرحله‌ای (A → B → C)",
    "سنتز چندمرحله‌ای نیتراسیون و سپس احیا برای تولید آمین آروماتیک:",
    "",
    "```reaction",
    "title: سنتز چندمرحله‌ای آنیلین از بنزن",
    "type: مسیر سنتزی متوالی",
    "steps:",
    "  - stepNumber: 1",
    "    title: نیتراسیون بنزن",
    "    reactants:",
    "      - smiles: c1ccccc1",
    "        name: بنزن",
    "    reagents:",
    "      - HNO3",
    "      - H2SO4",
    "    products:",
    "      - smiles: c1ccc([N+](=O)[O-])cc1",
    "        name: نیتروبنزن",
    "  - stepNumber: 2",
    "    title: احیای گروه نیترو",
    "    reactants:",
    "      - smiles: c1ccc([N+](=O)[O-])cc1",
    "        name: نیتروبنزن",
    "    reagents:",
    "      - Fe",
    "      - HCl",
    "    products:",
    "      - smiles: c1ccc(N)cc1",
    "        name: آنیلین",
    "```",
    "",
    "## ۶. واکنش نوع ششم: مولکول بسیار بزرگ دارویی (Atorvastatin Core)",
    "سنتز و نمک‌زایی داروی آتورواستاتین کلسیم:",
    "",
    "```reaction",
    "title: سنتز داروی آتورواستاتین کلسیم (Lipitor)",
    "type: نمک‌زایی و فرمولاسیون دارویی",
    "layout: expanded",
    "reactants:",
    "  - smiles: CC(C)c1c(C(=O)Nc2ccccc2)c(c3ccccc3)c(c4ccc(F)cc4)n1CCC(O)CC(O)CC(=O)O",
    "    name: آتورواستاتین آزاد",
    "    formula: C33H35FN2O5",
    "  - smiles: '[Ca+2]'",
    "    name: کاتیون کلسیم",
    "products:",
    "  - smiles: CC(C)c1c(C(=O)Nc2ccccc2)c(c3ccccc3)c(c4ccc(F)cc4)n1CCC(O)CC(O)CC(=O)[O-]",
    "    name: آتورواستاتین کلسیم",
    "```",
    "",
    "> **نکته بالینی و آموزشی:** در تمام مراحل فوق، شرایط واکنش تعیین‌کننده مسیر گزینش‌پذیری فرآورده است.",
  ].join("\n");

  it("1. renders all 6 organic and medicinal chemistry reaction archetypes in a single Persian lesson without collision", async () => {
    const { container } = render(
      <MarkdownRenderer content={comprehensiveLessonMarkdown} enableLessonCallouts />,
    );

    // Verify main headings
    expect(screen.getByRole("heading", { name: "شیمی آلی: سنتز و واکنش‌های کلیدی ترکیبات کربونیل و آلکن‌ها" })).toBeInTheDocument();

    // Verify 1: A -> B
    expect(await screen.findByText("اکسیداسیون الکل به آلدئید")).toBeInTheDocument();
    expect((await screen.findAllByText("اتانول")).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText("استالدئید")).length).toBeGreaterThanOrEqual(1);

    // Verify 2: A + B -> C
    expect(await screen.findByText("واکنش دیلز-آلدر (Diels-Alder)")).toBeInTheDocument();
    expect(await screen.findByText("۱،۳-بوتادی‌ان")).toBeInTheDocument();
    expect(await screen.findByText("سیکلوهگزن")).toBeInTheDocument();

    // Verify 3: A + B -> C + D
    expect(await screen.findByText("استریفیکاسیون فیشر (Fischer Esterification)")).toBeInTheDocument();
    expect(await screen.findByText("اتیل استات")).toBeInTheDocument();

    // Verify 4: Stereochemistry SN2
    expect(await screen.findByText("واکنش SN2 با واژگونی والدن")).toBeInTheDocument();
    expect(await screen.findByText("(R)-۲-بروموبوتان")).toBeInTheDocument();
    expect(await screen.findByText("(S)-بوتان-۲-اول")).toBeInTheDocument();

    // Verify 5: Multi-step A -> B -> C
    expect(await screen.findByText("سنتز چندمرحله‌ای آنیلین از بنزن")).toBeInTheDocument();

    // Verify 6: Very large drug molecule Atorvastatin
    expect(await screen.findByText("سنتز داروی آتورواستاتین کلسیم (Lipitor)")).toBeInTheDocument();
    expect(await screen.findByText("آتورواستاتین آزاد")).toBeInTheDocument();
    expect(await screen.findByText("C33H35FN2O5")).toBeInTheDocument();

    // Verify total rendered reaction blocks
    const reactionBlocks = container.querySelectorAll('[data-testid="reaction-block"]');
    expect(reactionBlocks.length).toBe(6);
  });

  const viewports = [
    { name: "320px (Ultra-narrow Mobile)", width: 320 },
    { name: "375px (Standard iPhone)", width: 375 },
    { name: "414px (Large Mobile)", width: 414 },
    { name: "768px (Tablet)", width: 768 },
    { name: "1280px (Desktop Display)", width: 1280 },
  ];

  viewports.forEach(({ name, width }) => {
    it(`2. verifies layout and horizontal overflow isolation at viewport: ${name}`, async () => {
      const { container } = render(
        <div style={{ width: `${width}px`, maxWidth: `${width}px` }} className="viewport-simulation-wrapper">
          <MarkdownRenderer content={comprehensiveLessonMarkdown} enableLessonCallouts />
        </div>,
      );

      const blocks = container.querySelectorAll('[data-testid="reaction-block"]');
      expect(blocks.length).toBe(6);

      blocks.forEach((block) => {
        // Must maintain RTL for Persian outer shell
        expect(block).toHaveAttribute("dir", "rtl");

        // Must maintain strict LTR for chemical reaction equation
        const ltrInner = block.querySelector('[dir="ltr"]');
        expect(ltrInner).toBeInTheDocument();

        // Must have horizontal overflow protection container
        const scrollableContainer = block.querySelector(".overflow-x-auto");
        expect(scrollableContainer).toBeInTheDocument();
      });
    });
  });
});
