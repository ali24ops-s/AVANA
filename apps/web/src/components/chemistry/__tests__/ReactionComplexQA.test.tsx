import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactionBlock } from "../ReactionBlock.js";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import { parseReactionCodeContent, getMoleculeComplexity } from "@avana/domain";
import type { ChemicalReaction } from "@avana/domain";

describe("Complex Organic Chemistry & Medicinal Reaction Suite (QA)", () => {
  // 1. Simple Reaction (Compact Mode)
  const simpleReaction: ChemicalReaction = {
    title: "هیدراتاسیون ساده اتن",
    layout: "compact",
    reactionType: "افزایش الکتروفیلی",
    reactants: [
      { smiles: "C=C", name: "اتن" },
      { smiles: "O", name: "آب" },
    ],
    catalysts: ["H+"],
    products: [
      { smiles: "CCO", name: "اتانول" },
    ],
  };

  // 2. Two Large Reactants -> One Large Product (Expanded Mode - Suzuki Coupling)
  const suzukiCouplingReaction: ChemicalReaction = {
    title: "کوپلینگ متقاطع سوزوکی-میااورا (Suzuki-Miyaura Coupling)",
    layout: "expanded",
    reactionType: "کوپلینگ متقاطع با کاتالیزور پالادیوم",
    reactants: [
      {
        smiles: "B(O)(O)c1ccc(cc1)c2ccccc2",
        name: "۴-بی‌فنیل بورونیک اسید (Biphenylboronic acid)",
        formula: "C12H11BO2",
      },
      {
        smiles: "Ic1ccc(cc1)C(=O)OCC",
        name: "اتیل ۴-یدوبنزوات (Ethyl 4-iodobenzoate)",
        formula: "C9H9IO2",
      },
    ],
    catalysts: ["Pd(PPh3)4", "Na2CO3"],
    solvents: ["DME", "H2O"],
    temperature: "80 °C",
    yield: "89%",
    products: [
      {
        smiles: "CCOC(=O)c1ccc(cc1)c2ccc(cc2)c3ccccc3",
        name: "اتیل ۴-(۴-فنیل‌فنیل)بنزوات (Terphenyl ester)",
        formula: "C21H18O2",
      },
    ],
  };

  // 3. Multiple Products (Saponification / Cleavage)
  const multiProductReaction: ChemicalReaction = {
    title: "صابونی شدن و هیدرولیز استر پیچیده",
    reactants: [
      { smiles: "CC(=O)Oc1ccccc1C(=O)O", name: "آسپرین (استیل‌سالیسیلیک اسید)" },
      { smiles: "[OH-]", name: "یون هیدروکسید (۲ معادل)", coefficient: 2 },
    ],
    solvents: ["H2O", "MeOH"],
    temperature: "60 °C",
    products: [
      { smiles: "Oc1ccccc1C(=O)[O-]", name: "یون سالیسیلات" },
      { smiles: "CC(=O)[O-]", name: "یون استات" },
      { smiles: "O", name: "آب" },
    ],
  };

  // 4. Very Large Medicinal Molecule (e.g. Atorvastatin & Steroid Core)
  const atorvastatinSynthesis: ChemicalReaction = {
    title: "سنتز داروی آتورواستاتین (Lipitor core)",
    layout: "expanded",
    reactionType: "تراکم هتروسیکل چندجزئی Paal-Knorr",
    reactants: [
      {
        smiles: "CC(C)c1c(C(=O)Nc2ccccc2)c(c3ccccc3)c(c4ccc(F)cc4)n1CCC(O)CC(O)CC(=O)O",
        name: "آتورواستاتین (Atorvastatin core)",
        formula: "C33H35FN2O5",
      },
      {
        smiles: "[Ca+2]",
        name: "یون کلسیم",
      },
    ],
    products: [
      {
        smiles: "CC(C)c1c(C(=O)Nc2ccccc2)c(c3ccccc3)c(c4ccc(F)cc4)n1CCC(O)CC(O)CC(=O)[O-]",
        name: "آتورواستاتین کلسیم (داروی هایپرلیپیدمی)",
      },
    ],
  };

  // 5. 3-Step Synthesis Sequence (Phenol -> Paracetamol)
  const threeStepParacetamolSynthesis: ChemicalReaction = {
    title: "سنتز ۳ مرحله‌ای استامینوفن (Paracetamol Multi-step Synthesis)",
    layout: "stepped",
    reactionType: "سنتز آلی چندمرحله‌ای",
    steps: [
      {
        stepNumber: 1,
        title: "نیتراسیون فنول (Nitration)",
        reactants: [{ smiles: "c1ccc(O)cc1", name: "فنول (Phenol)", formula: "C6H6O" }],
        reagents: ["HNO3"],
        catalysts: ["H2SO4"],
        temperature: "0-5 °C",
        yield: "72%",
        products: [{ smiles: "Oc1ccc(N(=O)=O)cc1", name: "۴-نیتروفنول", formula: "C6H5NO3" }],
        notes: "جداسازی ایزومر پارا از ارتو با تقطیر با بخار آب",
      },
      {
        stepNumber: 2,
        title: "احیای کاتالیزوری گروه نیترو (Reduction)",
        reactants: [{ smiles: "Oc1ccc(N(=O)=O)cc1", name: "۴-نیتروفنول" }],
        catalysts: ["10% Pd/C", "H2"],
        solvents: ["EtOH"],
        temperature: "25 °C",
        yield: "94%",
        products: [{ smiles: "Oc1ccc(N)cc1", name: "۴-آمینوفنول", formula: "C6H7NO" }],
      },
      {
        stepNumber: 3,
        title: "استیلاسیون آمین با انیدرید استیک (Acetylation)",
        reactants: [
          { smiles: "Oc1ccc(N)cc1", name: "۴-آمینوفنول" },
          { smiles: "CC(=O)OC(=O)C", name: "استیک انیدرید" },
        ],
        solvents: ["H2O"],
        temperature: "80 °C",
        yield: "88%",
        products: [
          { smiles: "CC(=O)Nc1ccc(O)cc1", name: "استامینوفن (Paracetamol)", formula: "C8H9NO2" },
          { smiles: "CC(=O)O", name: "استیک اسید" },
        ],
        notes: "استیلاسیون گزینشی آمین به دلیل نوکلئوفیلی بیشتر نیتروژن نسبت به اکسیژن فنولی",
      },
    ],
    reactants: [{ smiles: "c1ccc(O)cc1", name: "فنول" }],
    products: [{ smiles: "CC(=O)Nc1ccc(O)cc1", name: "استامینوفن" }],
  };

  it("1. calculates complexity heuristics accurately without validation errors", () => {
    const ethanolComp = getMoleculeComplexity("CCO");
    expect(ethanolComp.heavyAtomCount).toBe(3);
    expect(ethanolComp.estimatedComplexity).toBe("simple");
    expect(ethanolComp.recommendedScale).toBe(1);

    const terphenylComp = getMoleculeComplexity("CCOC(=O)c1ccc(cc1)c2ccc(cc2)c3ccccc3");
    expect(terphenylComp.heavyAtomCount).toBe(23);
    expect(terphenylComp.ringCount).toBeGreaterThanOrEqual(3);
    expect(terphenylComp.estimatedComplexity).toBe("complex");
    expect(terphenylComp.recommendedScale).toBeGreaterThanOrEqual(1.3);

    const atorvastatinComp = getMoleculeComplexity(
      "CC(C)c1c(C(=O)Nc2ccccc2)c(c3ccccc3)c(c4ccc(F)cc4)n1CCC(O)CC(O)CC(=O)O",
    );
    expect(atorvastatinComp.heavyAtomCount).toBeGreaterThan(35);
    expect(atorvastatinComp.estimatedComplexity).toBe("very-complex");
    expect(atorvastatinComp.recommendedScale).toBe(1.6);
  });

  it("2. renders simple reaction in compact mode with clean layout", () => {
    const { container } = render(<ReactionBlock reaction={simpleReaction} layout="compact" />);

    expect(screen.getByText("هیدراتاسیون ساده اتن")).toBeInTheDocument();
    expect(screen.getByText("افزایش الکتروفیلی")).toBeInTheDocument();
    expect(screen.getByText("اتن")).toBeInTheDocument();
    expect(screen.getByText("آب")).toBeInTheDocument();
    expect(screen.getByText("اتانول")).toBeInTheDocument();
    expect(screen.getByText("H+")).toBeInTheDocument();

    const block = screen.getByTestId("reaction-block");
    expect(block).toHaveAttribute("data-layout-mode", "compact");
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
  });

  it("3. renders two large reactants to one large product in expanded mode with adaptive sizing", () => {
    const { container } = render(<ReactionBlock reaction={suzukiCouplingReaction} layout="expanded" />);

    expect(screen.getByText("کوپلینگ متقاطع سوزوکی-میااورا (Suzuki-Miyaura Coupling)")).toBeInTheDocument();
    expect(screen.getByText("۴-بی‌فنیل بورونیک اسید (Biphenylboronic acid)")).toBeInTheDocument();
    expect(screen.getByText("اتیل ۴-یدوبنزوات (Ethyl 4-iodobenzoate)")).toBeInTheDocument();
    expect(screen.getByText("اتیل ۴-(۴-فنیل‌فنیل)بنزوات (Terphenyl ester)")).toBeInTheDocument();
    expect(screen.getByText("Pd(PPh3)4")).toBeInTheDocument();
    expect(screen.getByText("80 °C")).toBeInTheDocument();
    expect(screen.getAllByText("بازده: 89%").length).toBeGreaterThanOrEqual(1);

    const reactantCards = screen.getAllByTestId("rxn-reactant-card");
    expect(reactantCards).toHaveLength(2);
    const productCards = screen.getAllByTestId("rxn-product-card");
    expect(productCards).toHaveLength(1);
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3);
  });

  it("4. renders reaction with multiple products and coefficient badges", () => {
    render(<ReactionBlock reaction={multiProductReaction} />);

    expect(screen.getByText("آسپرین (استیل‌سالیسیلیک اسید)")).toBeInTheDocument();
    expect(screen.getByText("یون سالیسیلات")).toBeInTheDocument();
    expect(screen.getByText("یون استات")).toBeInTheDocument();
    expect(screen.getByText("2×")).toBeInTheDocument();

    const productCards = screen.getAllByTestId("rxn-product-card");
    expect(productCards).toHaveLength(3);
  });

  it("5. renders very large medicinal structures without squishing or crashing", () => {
    const { container } = render(<ReactionBlock reaction={atorvastatinSynthesis} />);

    expect(screen.getByText("سنتز داروی آتورواستاتین (Lipitor core)")).toBeInTheDocument();
    expect(screen.getByText("آتورواستاتین (Atorvastatin core)")).toBeInTheDocument();
    expect(screen.getByText("C33H35FN2O5")).toBeInTheDocument();
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
  });

  it("6. renders 3-step synthesis with independent step metadata, yields, and notes in stepped layout", () => {
    render(<ReactionBlock reaction={threeStepParacetamolSynthesis} layout="stepped" />);

    expect(
      screen.getByText("سنتز ۳ مرحله‌ای استامینوفن (Paracetamol Multi-step Synthesis)"),
    ).toBeInTheDocument();

    // Verify 3 distinct steps rendered
    expect(screen.getByText("مرحله ۱")).toBeInTheDocument();
    expect(screen.getByText("نیتراسیون فنول (Nitration)")).toBeInTheDocument();
    expect(screen.getByText("بازده: 72%")).toBeInTheDocument();
    expect(screen.getByText("جداسازی ایزومر پارا از ارتو با تقطیر با بخار آب")).toBeInTheDocument();

    expect(screen.getByText("مرحله ۲")).toBeInTheDocument();
    expect(screen.getByText("احیای کاتالیزوری گروه نیترو (Reduction)")).toBeInTheDocument();
    expect(screen.getByText("بازده: 94%")).toBeInTheDocument();

    expect(screen.getByText("مرحله ۳")).toBeInTheDocument();
    expect(screen.getByText("استیلاسیون آمین با انیدرید استیک (Acetylation)")).toBeInTheDocument();
    expect(screen.getByText("بازده: 88%")).toBeInTheDocument();

    // Verify reactants and products across steps
    expect(screen.getAllByText("فنول (Phenol)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("۴-نیتروفنول").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("۴-آمینوفنول").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("استامینوفن (Paracetamol)").length).toBeGreaterThanOrEqual(1);
  });

  it("7. allows interactive toggle between Stepped and Continuous Horizontal Chain views", () => {
    render(<ReactionBlock reaction={threeStepParacetamolSynthesis} />);

    const steppedBtn = screen.getByTitle("نمایش مرحله‌به‌مرحله");
    const chainBtn = screen.getByTitle("نمایش زنجیره‌ای افقی");

    expect(steppedBtn).toBeInTheDocument();
    expect(chainBtn).toBeInTheDocument();

    // Switch to continuous horizontal chain view
    fireEvent.click(chainBtn);
    const block = screen.getByTestId("reaction-block");
    expect(block).toHaveAttribute("data-layout-mode", "expanded");

    // Switch back to stepped view
    fireEvent.click(steppedBtn);
    expect(block).toHaveAttribute("data-layout-mode", "stepped");
  });

  it("8. parses and renders multi-step and layout-annotated YAML from MarkdownRenderer", async () => {
    const yamlMarkdown = [
      "# درسنامه پیشرفته شیمی آلی: سنتز استامینوفن",
      "",
      "```reaction",
      "title: سنتز چندمرحله‌ای استامینوفن",
      "layout: stepped",
      "steps:",
      "  - step: 1",
      "    title: نیتراسیون فنول",
      "    reactants:",
      "      - smiles: c1ccc(O)cc1",
      "        name: فنول",
      "    reagents:",
      "      - HNO3",
      "    catalysts:",
      "      - H2SO4",
      "    yield: 75%",
      "    products:",
      "      - smiles: Oc1ccc(N(=O)=O)cc1",
      "        name: ۴-نیتروفنول",
      "  - step: 2",
      "    title: احیای کاتالیزوری",
      "    reactants:",
      "      - smiles: Oc1ccc(N(=O)=O)cc1",
      "        name: ۴-نیتروفنول",
      "    catalysts:",
      "      - H2 / Pd-C",
      "    yield: 90%",
      "    products:",
      "      - smiles: Oc1ccc(N)cc1",
      "        name: ۴-آمینوفنول",
      "```",
    ].join("\n");

    const parsed = parseReactionCodeContent(
      yamlMarkdown.split("```reaction\n")[1].split("\n```")[0],
      "reaction",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.steps).toHaveLength(2);
    expect(parsed?.layout).toBe("stepped");

    render(<MarkdownRenderer content={yamlMarkdown} />);

    expect(await screen.findByText("سنتز چندمرحله‌ای استامینوفن")).toBeInTheDocument();
    expect(await screen.findByText("مرحله ۱")).toBeInTheDocument();
    expect(await screen.findByText("مرحله ۲")).toBeInTheDocument();
  });

  it("9. guarantees strict LTR isolation for chemical coordinates inside Persian RTL context", () => {
    const { container } = render(
      <div dir="rtl" className="persian-context">
        <ReactionBlock reaction={suzukiCouplingReaction} />
      </div>,
    );

    // Header has RTL text
    const block = screen.getByTestId("reaction-block");
    expect(block).toHaveAttribute("dir", "rtl");

    // Molecule cards and arrows strictly have dir="ltr"
    const cards = container.querySelectorAll('[data-testid="rxn-reactant-card"], [data-testid="rxn-product-card"]');
    for (const card of cards) {
      expect(card).toHaveAttribute("dir", "ltr");
    }

    const arrow = screen.getByTestId("reaction-arrow");
    expect(arrow).toHaveAttribute("dir", "ltr");
  });

  it("10. verifies viewport responsiveness across 320, 375, 414, 768, and 1280px", () => {
    const viewports = [320, 375, 414, 768, 1280];

    for (const width of viewports) {
      const { container, unmount } = render(
        <div style={{ width: `${width}px`, maxWidth: `${width}px`, overflow: "hidden" }}>
          <ReactionBlock reaction={threeStepParacetamolSynthesis} layout="stepped" />
        </div>,
      );

      // Verify no crashes, containers render smoothly with overflow protection
      expect(screen.getByText("سنتز ۳ مرحله‌ای استامینوفن (Paracetamol Multi-step Synthesis)")).toBeInTheDocument();
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(3);

      unmount();
    }
  });

  it("11. renders real seeded SN2 demonstration lesson with both simple and chiral reactions", async () => {
    const seededLessonMarkdown = `# مکانیزم واکنش جانشینی هسته‌دوستی دومولکولی ($S_N2$)

واکنش جانشینی هسته‌دوستی دو مولکولی (**$S_N2$**) یکی از بنیادی‌ترین واکنش‌های شیمی آلی است.

\`\`\`reaction
{
  "title": "جانشینی برومومتان با یون هیدروکسید (SN2)",
  "reactionType": "SN2",
  "reactants": [
    { "smiles": "CBr", "name": "برومومتان (متیل برومید)" },
    { "smiles": "[OH-]", "name": "یون هیدروکسید" }
  ],
  "products": [
    { "smiles": "CO", "name": "متانول" },
    { "smiles": "[Br-]", "name": "یون برومید" }
  ],
  "mechanism": {
    "reactionType": "SN2",
    "reactionCenter": {
      "electrophile": { "participantRole": "reactant", "participantIndex": 0, "atomIndex": 0, "element": "C" },
      "leavingGroup": { "participantRole": "reactant", "participantIndex": 0, "atomIndex": 1, "element": "Br" },
      "nucleophile": { "participantRole": "reactant", "participantIndex": 1, "atomIndex": 0, "element": "O" }
    },
    "atomMapping": {
      "0:0": "0:0",
      "0:1": "1:0",
      "1:0": "0:1"
    },
    "notes": "حمله مستقیم جفت‌الکترون هیدروکسید به کربن و خروج همزمان یون برومید."
  }
}
\`\`\`

\`\`\`reaction
{
  "title": "SN2 روی یک مولکول بزرگتر (وارونگی والدن)",
  "reactionType": "SN2",
  "reactants": [
    { "smiles": "CC[C@@H](C)Br", "name": "(R)-۲-بروموبوتان" },
    { "smiles": "[OH-]", "name": "یون هیدروکسید" }
  ],
  "products": [
    { "smiles": "CC[C@H](C)O", "name": "(S)-بوتان-۲-اول" },
    { "smiles": "[Br-]", "name": "یون برومید" }
  ],
  "mechanism": {
    "reactionType": "SN2",
    "reactionCenter": {
      "electrophile": { "participantRole": "reactant", "participantIndex": 0, "atomIndex": 2, "element": "C" },
      "leavingGroup": { "participantRole": "reactant", "participantIndex": 0, "atomIndex": 4, "element": "Br" },
      "nucleophile": { "participantRole": "reactant", "participantIndex": 1, "atomIndex": 0, "element": "O" }
    },
    "notes": "حمله هسته‌دوست از پشت پیوند C-Br با وارونگی کامل پیکربندی فضایی."
  }
}
\`\`\`
`;

    render(<MarkdownRenderer content={seededLessonMarkdown} />);

    // Check headings
    expect(await screen.findByText("جانشینی برومومتان با یون هیدروکسید (SN2)")).toBeInTheDocument();
    expect(await screen.findByText("SN2 روی یک مولکول بزرگتر (وارونگی والدن)")).toBeInTheDocument();

    // Check mechanism toggle buttons
    const toggleBtns = await screen.findAllByTestId("toggle-mechanism-btn");
    expect(toggleBtns).toHaveLength(2);
    expect(screen.getAllByText("مکانیزم فعال")).toHaveLength(2);

    // Check reaction details sections
    expect(screen.getByText(/حمله مستقیم جفت‌الکترون هیدروکسید/)).toBeInTheDocument();
    expect(screen.getByText(/حمله هسته‌دوست از پشت پیوند C-Br/)).toBeInTheDocument();

    // Zero scientific review warnings
    expect(screen.queryByText("نیازمند بازبینی علمی")).not.toBeInTheDocument();
  });
});
