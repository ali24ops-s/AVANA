import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReactionBlock, ReactionParticipantsRow } from "../ReactionBlock.js";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import { MechanismOverlay, computeMechanismVisuals } from "../MechanismOverlay.js";
import type { MoleculeGeometry } from "../SmilesDrawerGeometryAdapter.js";
import type { ChemicalReaction, ChemicalReactionMechanism } from "@avana/domain";

describe("ReactionBlock & Organic Chemistry Reaction Suite", () => {
  // 1. Alkene Hydrogenation
  const hydrogenationReaction: ChemicalReaction = {
    title: "هیدروژناسیون آلکن (Alkene Hydrogenation)",
    reactionType: "افزایش الکتروفیلی",
    reactants: [
      { smiles: "C=C", name: "اتن (Ethene)", formula: "C2H4" },
      { smiles: "[H][H]", name: "گاز هیدروژن", formula: "H2" },
    ],
    catalysts: ["Pd/C"],
    conditions: ["25 °C", "1 atm"],
    products: [
      { smiles: "CC", name: "اتان (Ethane)", formula: "C2H6" },
    ],
  };

  // 2. SN2 Substitution with Stereochemical Inversion
  const sn2Reaction: ChemicalReaction = {
    title: "جانشینی هسته‌دوستی دو مولکولی (SN2 Substitution)",
    reactionType: "جانشینی آلیفاتیک",
    reactants: [
      { smiles: "CC[C@@H](C)Br", name: "(R)-۲-بروموبوتان", formula: "C4H9Br" },
      { smiles: "[OH-]", name: "یون هیدروکسید" },
    ],
    solvents: ["DMSO"],
    products: [
      { smiles: "CC[C@H](C)O", name: "(S)-بوتان-۲-اول (واژگونی والدن)", formula: "C4H10O" },
      { smiles: "[Br-]", name: "یون برومید" },
    ],
  };

  // 3. E2 Elimination
  const e2Reaction: ChemicalReaction = {
    title: "واکنش حذف دومولکولی (E2 Elimination)",
    reactionType: "واکنش حذف",
    reactants: [
      { smiles: "CC(C)Br", name: "۲-بروموپروپان" },
    ],
    reagents: ["NaOEt"],
    solvents: ["EtOH"],
    conditions: ["Δ"],
    products: [
      { smiles: "CC=C", name: "پروپن (Propene)" },
    ],
  };

  // 4. Fischer Esterification
  const esterificationReaction: ChemicalReaction = {
    title: "استریفیکاسیون فیشر (Fischer Esterification)",
    reactionType: "جانشینی نوکلئوفیلی آسیل",
    reactants: [
      { smiles: "CC(=O)O", name: "استیک اسید", formula: "C2H4O2" },
      { smiles: "CCO", name: "اتانول", formula: "C2H6O" },
    ],
    reagents: ["H2SO4"],
    conditions: ["Δ"],
    products: [
      { smiles: "CC(=O)OCC", name: "اتیل استات", formula: "C4H8O2" },
      { smiles: "O", name: "آب", formula: "H2O" },
    ],
  };

  // 5. Grignard Reaction
  const grignardReaction: ChemicalReaction = {
    title: "واکنش افزایش گرینیارد (Grignard Addition)",
    reactionType: "افزایش کربونیل",
    reactants: [
      { smiles: "C=O", name: "فرمالدئید" },
      { smiles: "C[Mg]Br", name: "متیل منیزیوم برومید" },
    ],
    solvents: ["Et2O"],
    products: [
      { smiles: "CCO", name: "اتانول" },
    ],
  };

  // 6. Aldol Addition
  const aldolReaction: ChemicalReaction = {
    title: "تراکم آلدول (Aldol Addition)",
    reactionType: "افزایش انولات به کربونیل",
    reactants: [
      { smiles: "CC=O", name: "استالدئید (۲ مولکول)", coefficient: 2 },
    ],
    reagents: ["NaOH"],
    conditions: ["0-5 °C"],
    products: [
      { smiles: "CC(O)CC=O", name: "۳-هیدروکسی‌بوتانال" },
    ],
  };

  // 7. Diels-Alder Cycloaddition
  const dielsAlderReaction: ChemicalReaction = {
    title: "واکنش دیلز-آلدر (Diels-Alder Cycloaddition)",
    reactionType: "حلقه‌زایی [4+2]",
    reactants: [
      { smiles: "C=CC=C", name: "۱،۳-بوتادی‌ان (دی‌ان)" },
      { smiles: "C=C", name: "اتیلن (دی‌ان‌دوست)" },
    ],
    conditions: ["150 °C"],
    products: [
      { smiles: "C1=CCCCC1", name: "سیکلوهگزن" },
    ],
  };

  // 8. Alcohol Oxidation
  const oxidationReaction: ChemicalReaction = {
    title: "اکسیداسیون الکل به آلدهید",
    reactionType: "اکسیداسیون",
    reactants: [
      { smiles: "CCO", name: "اتانول" },
    ],
    reagents: ["PCC"],
    solvents: ["CH2Cl2"],
    products: [
      { smiles: "CC=O", name: "استالدئید" },
    ],
  };

  // 9. Carbonyl Reduction
  const reductionReaction: ChemicalReaction = {
    title: "احیای کتون به الکل دوم",
    reactionType: "احیا",
    reactants: [
      { smiles: "CC(=O)C", name: "استون" },
    ],
    reagents: ["NaBH4"],
    solvents: ["MeOH"],
    products: [
      { smiles: "CC(O)C", name: "ایزوپروپانول" },
    ],
  };

  // 10. Multi-step Reaction Sequence
  const multiStepReaction: ChemicalReaction = {
    title: "سنتز چندمرحله‌ای استامینوفن از بنزن",
    reactionType: "مسیر سنتزی چندمرحله‌ای",
    reactants: [{ smiles: "c1ccccc1", name: "بنزن" }],
    products: [{ smiles: "CC(=O)Nc1ccc(O)cc1", name: "استامینوفن (Paracetamol)" }],
    steps: [
      {
        stepNumber: 1,
        title: "نیترودار کردن بنزن",
        reactants: [{ smiles: "c1ccccc1", name: "بنزن" }],
        reagents: ["HNO3", "H2SO4"],
        products: [{ smiles: "c1ccc([N+](=O)[O-])cc1", name: "نیتروبنزن" }],
      },
      {
        stepNumber: 2,
        title: "احیا به آنیلین",
        reactants: [{ smiles: "c1ccc([N+](=O)[O-])cc1", name: "نیتروبنزن" }],
        reagents: ["Fe", "HCl"],
        products: [{ smiles: "c1ccc(N)cc1", name: "آنیلین" }],
      },
    ],
  };

  // 11. Charged / Salt Reaction
  const saltReaction: ChemicalReaction = {
    title: "پروتوناسیون آمین و تشکیل نمک",
    reactants: [
      { smiles: "CCN(CC)CC", name: "تری‌اتیل‌آمین" },
      { smiles: "Cl", name: "هیدروکلریک اسید" },
    ],
    products: [
      { smiles: "CC[N+](CC)(CC)[H].[Cl-]", name: "نمک تری‌اتیل‌آمونیوم کلرید" },
    ],
  };

  it("1. renders Alkene Hydrogenation with catalysts and conditions", () => {
    const { container } = render(<ReactionBlock reaction={hydrogenationReaction} />);

    expect(screen.getByText("هیدروژناسیون آلکن (Alkene Hydrogenation)")).toBeInTheDocument();
    expect(screen.getByText("افزایش الکتروفیلی")).toBeInTheDocument();
    expect(screen.getByText("اتن (Ethene)")).toBeInTheDocument();
    expect(screen.getByText("گاز هیدروژن")).toBeInTheDocument();
    expect(screen.getByText("اتان (Ethane)")).toBeInTheDocument();
    expect(screen.getByText("Pd/C")).toBeInTheDocument();
    expect(screen.getByText("25 °C")).toBeInTheDocument();

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(3); // 2 reactants + 1 product SVGs
  });

  it("2. renders SN2 reaction with stereochemical inversion", () => {
    render(<ReactionBlock reaction={sn2Reaction} />);

    expect(screen.getByText("جانشینی هسته‌دوستی دو مولکولی (SN2 Substitution)")).toBeInTheDocument();
    expect(screen.getByText("(R)-۲-بروموبوتان")).toBeInTheDocument();
    expect(screen.getByText("(S)-بوتان-۲-اول (واژگونی والدن)")).toBeInTheDocument();
    expect(screen.getByText("DMSO")).toBeInTheDocument();
  });

  it("3. renders E2 Elimination with reagent, solvent and heat (Δ)", () => {
    render(<ReactionBlock reaction={e2Reaction} />);

    expect(screen.getByText("واکنش حذف دومولکولی (E2 Elimination)")).toBeInTheDocument();
    expect(screen.getByText("۲-بروموپروپان")).toBeInTheDocument();
    expect(screen.getByText("پروپن (Propene)")).toBeInTheDocument();
    expect(screen.getByText("NaOEt")).toBeInTheDocument();
    expect(screen.getByText("EtOH")).toBeInTheDocument();
    expect(screen.getByText("Δ")).toBeInTheDocument();
  });

  it("4. renders Fischer Esterification (A + B -> C + D)", () => {
    const { container } = render(<ReactionBlock reaction={esterificationReaction} />);

    expect(screen.getByText("استریفیکاسیون فیشر (Fischer Esterification)")).toBeInTheDocument();
    expect(screen.getByText("استیک اسید")).toBeInTheDocument();
    expect(screen.getByText("اتانول")).toBeInTheDocument();
    expect(screen.getByText("اتیل استات")).toBeInTheDocument();
    expect(screen.getByText("H2SO4")).toBeInTheDocument();

    const reactantCards = container.querySelectorAll('[data-testid="rxn-reactant-card"]');
    const productCards = container.querySelectorAll('[data-testid="rxn-product-card"]');
    expect(reactantCards.length).toBe(2);
    expect(productCards.length).toBe(2);
  });

  it("5. renders Grignard Reaction", () => {
    render(<ReactionBlock reaction={grignardReaction} />);
    expect(screen.getByText("واکنش افزایش گرینیارد (Grignard Addition)")).toBeInTheDocument();
    expect(screen.getByText("متیل منیزیوم برومید")).toBeInTheDocument();
    expect(screen.getByText("Et2O")).toBeInTheDocument();
  });

  it("6. renders Aldol Reaction with coefficient 2×", () => {
    render(<ReactionBlock reaction={aldolReaction} />);
    expect(screen.getByText("تراکم آلدول (Aldol Addition)")).toBeInTheDocument();
    expect(screen.getByText("2×")).toBeInTheDocument();
    expect(screen.getByText("۳-هیدروکسی‌بوتانال")).toBeInTheDocument();
  });

  it("7. renders Diels-Alder Cycloaddition", () => {
    render(<ReactionBlock reaction={dielsAlderReaction} />);
    expect(screen.getByText("واکنش دیلز-آلدر (Diels-Alder Cycloaddition)")).toBeInTheDocument();
    expect(screen.getByText("۱،۳-بوتادی‌ان (دی‌ان)")).toBeInTheDocument();
    expect(screen.getByText("سیکلوهگزن")).toBeInTheDocument();
  });

  it("8. renders Oxidation Reaction", () => {
    render(<ReactionBlock reaction={oxidationReaction} />);
    expect(screen.getByText("اکسیداسیون الکل به آلدهید")).toBeInTheDocument();
    expect(screen.getByText("PCC")).toBeInTheDocument();
    expect(screen.getByText("CH2Cl2")).toBeInTheDocument();
  });

  it("9. renders Carbonyl Reduction Reaction", () => {
    render(<ReactionBlock reaction={reductionReaction} />);
    expect(screen.getByText("احیای کتون به الکل دوم")).toBeInTheDocument();
    expect(screen.getByText("NaBH4")).toBeInTheDocument();
    expect(screen.getByText("ایزوپروپانول")).toBeInTheDocument();
  });

  it("10. renders Multi-step Reaction Sequence (A -> B -> C)", () => {
    const { container } = render(<ReactionBlock reaction={multiStepReaction} />);
    expect(screen.getByText("سنتز چندمرحله‌ای استامینوفن از بنزن")).toBeInTheDocument();

    const arrows = container.querySelectorAll('[data-testid="reaction-arrow"]');
    expect(arrows.length).toBe(2);
  });

  it("11. renders Charged / Salt Reaction without errors", () => {
    render(<ReactionBlock reaction={saltReaction} />);
    expect(screen.getByText("پروتوناسیون آمین و تشکیل نمک")).toBeInTheDocument();
    expect(screen.getByText("نمک تری‌اتیل‌آمونیوم کلرید")).toBeInTheDocument();
  });

  it("12. maintains isolated LTR container inside Persian RTL layout", () => {
    const { container } = render(
      <div dir="rtl" className="persian-lesson-context">
        <ReactionBlock reaction={esterificationReaction} />
      </div>,
    );

    const rootBlock = container.querySelector('[data-testid="reaction-block"]');
    expect(rootBlock).toHaveAttribute("dir", "rtl");

    const ltrViewport = rootBlock?.querySelector('[dir="ltr"]');
    expect(ltrViewport).toBeInTheDocument();
  });

  it("13. renders lesson markdown containing ```reaction block via MarkdownRenderer", async () => {
    const lessonMarkdown = [
      "# سنتز ترکیبات آلی",
      "",
      "واکنش استریفیکاسیون فیشر یکی از مهم‌ترین واکنش‌های سنتز استرها است:",
      "",
      "```reaction",
      "title: استریفیکاسیون فیشر",
      "type: جانشینی آسیل",
      "reactants:",
      "  - smiles: CC(=O)O",
      "    name: استیک اسید",
      "  - smiles: CCO",
      "    name: اتانول",
      "reagents:",
      "  - H2SO4",
      "conditions:",
      "  - Δ",
      "products:",
      "  - smiles: CC(=O)OCC",
      "    name: اتیل استات",
      "  - smiles: O",
      "    name: آب",
      "```",
      "",
      "> **نکته کلیدی:** در این واکنش حضور کاتالیزور اسیدی الزامی است.",
    ].join("\n");

    const { container } = render(
      <MarkdownRenderer content={lessonMarkdown} enableLessonCallouts />,
    );

    expect(screen.getByRole("heading", { name: "سنتز ترکیبات آلی" })).toBeInTheDocument();
    expect(await screen.findByText("استریفیکاسیون فیشر")).toBeInTheDocument();
    expect(await screen.findByText("استیک اسید")).toBeInTheDocument();
    expect(await screen.findByText("اتیل استات")).toBeInTheDocument();
    expect(container.querySelector('[data-testid="reaction-block"]')).toBeInTheDocument();
  });

  it("14. gracefully handles invalid participant SMILES without crashing the reaction block", () => {
    const brokenReaction: ChemicalReaction = {
      title: "واکنش حاوی جزء معیوب",
      reactants: [
        { smiles: "INVALID(((SMILES", name: "مولکول خراب" },
        { smiles: "CCO", name: "اتانول" },
      ],
      products: [
        { smiles: "CC=O", name: "استالدئید" },
      ],
    };

    render(<ReactionBlock reaction={brokenReaction} />);

    expect(screen.getByText("واکنش حاوی جزء معیوب")).toBeInTheDocument();
    expect(screen.getByText("نیازمند بازبینی علمی")).toBeInTheDocument();
    expect(screen.getByText("اتانول")).toBeInTheDocument();
    expect(screen.getByText("استالدئید")).toBeInTheDocument();
  });

  it("15. renders SN2 mechanism details section and toggles mechanism view on button click", () => {
    const sn2WithMechanism: ChemicalReaction = {
      title: "واکنش SN2 برومواتان با یون هیدروکسید",
      reactionType: "SN2",
      reactants: [
        { smiles: "CCBr", name: "برومواتان" },
        { smiles: "[OH-]", name: "یون هیدروکسید" },
      ],
      products: [
        { smiles: "CCO", name: "اتانول" },
        { smiles: "[Br-]", name: "یون برومید" },
      ],
      mechanism: {
        reactionType: "SN2",
        notes: "حمله همزمان نوکلئوفیل و خروج یون برومید در یک مرحله هماهنگ (Concerted).",
      },
    };

    render(<ReactionBlock reaction={sn2WithMechanism} />);

    // Toggle button should be visible
    const toggleBtn = screen.getByTestId("toggle-mechanism-btn");
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByText("مکانیزم فعال")).toBeInTheDocument();

    // Mechanism details section should be rendered
    expect(screen.getByTestId("mechanism-details-section")).toBeInTheDocument();
    expect(screen.getByText(/مکانیزم واکنش: SN2/)).toBeInTheDocument();
    expect(screen.getByText(/حمله همزمان نوکلئوفیل/)).toBeInTheDocument();

    // Click to toggle mechanism off
    fireEvent.click(toggleBtn);
    expect(screen.getByText("مکانیزم")).toBeInTheDocument();
    expect(screen.queryByTestId("mechanism-details-section")).not.toBeInTheDocument();

    // Click again to re-enable
    fireEvent.click(toggleBtn);
    expect(screen.getByText("مکانیزم فعال")).toBeInTheDocument();
    expect(screen.getByTestId("mechanism-details-section")).toBeInTheDocument();
  });

  it("16. shows scientific review warning badge when mechanism has invalid reaction centers", () => {
    const invalidMechanismRxn: ChemicalReaction = {
      title: "واکنش با مکانیزم نامعتبر",
      reactants: [
        { smiles: "CCBr", name: "برومواتان" },
        { smiles: "[OH-]", name: "هیدروکسید" },
      ],
      products: [
        { smiles: "CCO", name: "اتانول" },
      ],
      mechanism: {
        reactionType: "SN2",
        reactionCenter: {
          electrophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 99, element: "C" }, // Non-existent!
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 2, element: "Br" },
          nucleophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "O" },
        },
      },
    };

    render(<ReactionBlock reaction={invalidMechanismRxn} />);

    expect(screen.getByText("واکنش با مکانیزم نامعتبر")).toBeInTheDocument();
    expect(screen.getByText("نیازمند بازبینی علمی")).toBeInTheDocument();
    // Mechanism details section should NOT render when unverified
    expect(screen.queryByTestId("mechanism-details-section")).not.toBeInTheDocument();
  });

  it("17. multi-step sequence isolates mechanisms per-step without bleed-through", () => {
    const multiStepWithMixedMechanisms: ChemicalReaction = {
      title: "سنتز چند مرحله‌ای با مکانیزم مختلط",
      reactants: [{ smiles: "CCBr" }],
      products: [{ smiles: "CCC(=O)O" }],
      steps: [
        {
          stepNumber: 1,
          title: "مرحله ۱: جانشینی سیانید (SN2)",
          reactants: [
            { smiles: "CCBr", name: "برومواتان" },
            { smiles: "[C-]#[N]", name: "سیانید" },
          ],
          products: [
            { smiles: "CCC#N", name: "پروپانونیتریل" },
            { smiles: "[Br-]", name: "برومید" },
          ],
          mechanism: {
            reactionType: "SN2",
            notes: "حمله سیانید به کربن الکتروفیل",
          },
        },
        {
          stepNumber: 2,
          title: "مرحله ۲: هیدرولیز اسیدی (بدون مکانیزم اختصاصی)",
          reactants: [
            { smiles: "CCC#N", name: "پروپانونیتریل" },
          ],
          reagents: ["H3O+", "Δ"],
          products: [
            { smiles: "CCC(=O)O", name: "پروپانوئیک اسید" },
            { smiles: "[NH4+]", name: "آمونیوم" },
          ],
          // No mechanism in step 2
        },
        {
          stepNumber: 3,
          title: "مرحله ۳: جانشینی مجدد (SN2)",
          reactants: [
            { smiles: "CC(C)Cl", name: "۲-کلروپروپان" },
            { smiles: "[OH-]", name: "هیدروکسید" },
          ],
          products: [
            { smiles: "CC(C)O", name: "ایزوپروپانول" },
            { smiles: "[Cl-]", name: "کلرید" },
          ],
          mechanism: {
            reactionType: "SN2",
            notes: "جانشینی کلرید با هیدروکسید",
          },
        },
      ],
    };

    render(<ReactionBlock reaction={multiStepWithMixedMechanisms} />);

    // All step titles should be visible in stepped mode
    expect(screen.getByText("مرحله ۱: جانشینی سیانید (SN2)")).toBeInTheDocument();
    expect(screen.getByText("مرحله ۲: هیدرولیز اسیدی (بدون مکانیزم اختصاصی)")).toBeInTheDocument();
    expect(screen.getByText("مرحله ۳: جانشینی مجدد (SN2)")).toBeInTheDocument();

    // Molecules for each step are rendered
    expect(screen.getAllByText("برومواتان").length).toBeGreaterThan(0);
    expect(screen.getAllByText("پروپانونیتریل").length).toBeGreaterThan(0);
    expect(screen.getAllByText("۲-کلروپروپان").length).toBeGreaterThan(0);

    // Primary mechanism details breakdown
    expect(screen.getByTestId("mechanism-details-section")).toBeInTheDocument();
    expect(screen.getByText(/حمله سیانید به کربن الکتروفیل/)).toBeInTheDocument();
  });

  it("18. ensures two independent reaction blocks operate in isolated scopes", () => {
    const rxn1: ChemicalReaction = {
      title: "واکنش اول: متیل برومید + OH",
      reactants: [{ smiles: "CBr" }, { smiles: "[OH-]" }],
      products: [{ smiles: "CO" }, { smiles: "[Br-]" }],
      mechanism: { reactionType: "SN2", notes: "مکانیزم اول" },
    };

    const rxn2: ChemicalReaction = {
      title: "واکنش دوم: اتیل کلرید + I",
      reactants: [{ smiles: "CCCl" }, { smiles: "[I-]" }],
      products: [{ smiles: "CCI" }, { smiles: "[Cl-]" }],
      mechanism: { reactionType: "SN2", notes: "مکانیزم دوم" },
    };

    render(
      <div>
        <div data-testid="rxn-1-wrapper">
          <ReactionBlock reaction={rxn1} />
        </div>
        <div data-testid="rxn-2-wrapper">
          <ReactionBlock reaction={rxn2} />
        </div>
      </div>,
    );

    expect(screen.getByText("واکنش اول: متیل برومید + OH")).toBeInTheDocument();
    expect(screen.getByText("واکنش دوم: اتیل کلرید + I")).toBeInTheDocument();
    expect(screen.getByText(/مکانیزم اول/)).toBeInTheDocument();
    expect(screen.getByText(/مکانیزم دوم/)).toBeInTheDocument();

    const toggleButtons = screen.getAllByTestId("toggle-mechanism-btn");
    expect(toggleButtons).toHaveLength(2);

    // Toggle off the first reaction only
    fireEvent.click(toggleButtons[0]);

    // First should now show deactivated toggle label, second should remain active
    expect(screen.queryByText(/مکانیزم اول/)).not.toBeInTheDocument();
    expect(screen.getByText(/مکانیزم دوم/)).toBeInTheDocument();
  });

  it("19. renders complex branched substrate SN2 without errors", () => {
    const branchedSN2: ChemicalReaction = {
      title: "جانشینی SN2 روی ۲-بروموپنتان شاخه‌دار",
      reactants: [
        { smiles: "CCCC(C)Br", name: "۲-بروموپنتان" },
        { smiles: "[OH-]", name: "هیدروکسید" },
      ],
      products: [
        { smiles: "CCCC(C)O", name: "پنتان-۲-اول" },
        { smiles: "[Br-]", name: "برومید" },
      ],
      mechanism: {
        reactionType: "SN2",
        notes: "مسیر واکنش جانشینی بر روی کربن ثانویه ممانعت‌دار",
      },
    };

    render(<ReactionBlock reaction={branchedSN2} />);
    expect(screen.getByText("جانشینی SN2 روی ۲-بروموپنتان شاخه‌دار")).toBeInTheDocument();
    expect(screen.getByText(/پنتان-۲-اول/)).toBeInTheDocument();
    expect(screen.getByText(/مسیر واکنش جانشینی بر روی کربن ثانویه ممانعت‌دار/)).toBeInTheDocument();
  });

  it("20. renders reversible reaction with ChemDraw reversible dual harpoons", () => {
    const reversibleReaction: ChemicalReaction = {
      title: "تعادل کتو-انول (Keto-Enol Tautomerism)",
      reversible: true,
      arrowType: "reversible",
      reactants: [
        { smiles: "CC(=O)C", name: "استون (فرم کتو)" },
      ],
      products: [
        { smiles: "CC(=C)O", name: "پروپن-۲-اول (فرم انول)" },
      ],
    };

    render(<ReactionBlock reaction={reversibleReaction} />);
    expect(screen.getByText("تعادل کتو-انول (Keto-Enol Tautomerism)")).toBeInTheDocument();
    expect(screen.getByText("استون (فرم کتو)")).toBeInTheDocument();
    expect(screen.getByText("پروپن-۲-اول (فرم انول)")).toBeInTheDocument();

    const arrow = screen.getByTestId("reaction-arrow");
    expect(arrow).toBeInTheDocument();
    // Dual harpoon arrow contains two lines
    const arrowLines = arrow.querySelectorAll("line");
    expect(arrowLines.length).toBe(2);
  });

  it("21. renders resonance structures with resonance double-headed arrow", () => {
    const resonanceReaction: ChemicalReaction = {
      title: "ساختارهای رزونانسی آنیون انولات",
      arrowType: "resonance",
      reactants: [
        { smiles: "[CH2-]C(=O)C", name: "کربانیون" },
      ],
      products: [
        { smiles: "C=C([O-])C", name: "اکسی‌آنیون" },
      ],
    };

    render(<ReactionBlock reaction={resonanceReaction} />);
    expect(screen.getByText("ساختارهای رزونانسی آنیون انولات")).toBeInTheDocument();
    const arrow = screen.getByTestId("reaction-arrow");
    expect(arrow).toBeInTheDocument();
    const paths = arrow.querySelectorAll("path");
    // Two arrowheads (left and right)
    expect(paths.length).toBe(2);
  });

  it("22. renders reaction intermediate with ChemDraw brackets [ ... ]", () => {
    const intermediateReaction: ChemicalReaction = {
      title: "افزایش هسته‌دوستی با تشکیل ماده واسط تتراهدرال",
      reactants: [
        { smiles: "CC(=O)Cl", name: "استیل کلرید" },
      ],
      intermediates: [
        { smiles: "CC([O-])(Cl)O", name: "واسط تتراهدرال", isIntermediate: true },
      ],
      products: [
        { smiles: "CC(=O)O", name: "استیک اسید" },
      ],
    };

    render(<ReactionBlock reaction={intermediateReaction} />);
    expect(screen.getByText("افزایش هسته‌دوستی با تشکیل ماده واسط تتراهدرال")).toBeInTheDocument();
    expect(screen.getByText("واسط تتراهدرال")).toBeInTheDocument();

    const intermediateCard = screen.getByTestId("rxn-intermediate-card");
    expect(intermediateCard).toBeInTheDocument();
    expect(intermediateCard.textContent).toContain("[");
    expect(intermediateCard.textContent).toContain("]");
  });

  // 23. ChemDraw Lone Pairs & No Decorative Badges
  it("23. computeMechanismVisuals computes real lone pair dots without decorative text or dashed circles", () => {
    const mockHydroxideGeom: MoleculeGeometry = {
      atoms: [
        {
          index: 0,
          element: "O",
          x: 100,
          y: 100,
          charge: -1,
          hydrogenCount: 1,
          isAromatic: false,
          lonePairsCount: 3,
          lonePairs: [
            { index: 0, x: 120, y: 100, angle: 0, dot1: { x: 120, y: 96 }, dot2: { x: 120, y: 104 } },
            { index: 1, x: 90, y: 80, angle: 2.09, dot1: { x: 86, y: 78 }, dot2: { x: 94, y: 82 } },
            { index: 2, x: 90, y: 120, angle: 4.18, dot1: { x: 86, y: 122 }, dot2: { x: 94, y: 118 } },
          ],
          neighborIndices: [],
        },
      ],
      bonds: [],
      averageBondLength: 30,
    };

    const mechanism: ChemicalReactionMechanism = {
      reactionType: "SN2",
      isVerified: true,
      reactionCenter: {
        nucleophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 0, element: "O" },
        electrophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "C" },
        leavingGroup: { participantRole: "reactant", participantIndex: 1, atomIndex: 2, element: "Br" },
      },
    };

    const visuals = computeMechanismVisuals(mockHydroxideGeom, mechanism, "reactant", 0);
    // 3 lone pairs * 2 dots = 6 dots
    expect(visuals.lonePairs).toHaveLength(6);
    expect(visuals.lonePairs.every((d) => Number.isFinite(d.cx) && Number.isFinite(d.cy))).toBe(true);

    // Active donating lone pair dots have teal fill (#0d9488)
    const tealDots = visuals.lonePairs.filter((d) => d.fill === "#0d9488");
    expect(tealDots).toHaveLength(2);

    // Spectator lone pair dots have dark slate fill (#334155)
    const slateDots = visuals.lonePairs.filter((d) => d.fill === "#334155");
    expect(slateDots).toHaveLength(4);
  });

  // 24. Arrow Rooting at Active Lone Pair
  it("24. computeMechanismVisuals roots lone_pair_to_atom arrow at active lone pair coordinates", () => {
    const mockNuGeom: MoleculeGeometry = {
      atoms: [
        {
          index: 0,
          element: "O",
          x: 100,
          y: 100,
          charge: -1,
          hydrogenCount: 1,
          isAromatic: false,
          lonePairsCount: 1,
          lonePairs: [
            { index: 0, x: 125, y: 100, angle: 0, dot1: { x: 125, y: 96 }, dot2: { x: 125, y: 104 } },
          ],
          neighborIndices: [],
        },
      ],
      bonds: [],
      averageBondLength: 30,
    };

    const mechanism: ChemicalReactionMechanism = {
      reactionType: "SN2",
      isVerified: true,
      arrows: [
        {
          type: "lone_pair_to_atom",
          from: {
            type: "lone_pair",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 0 },
            lonePairIndex: 0,
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 1, atomIndex: 0 },
          },
        },
      ],
    };

    const visuals = computeMechanismVisuals(mockNuGeom, mechanism, "reactant", 0);
    expect(visuals.arrows).toHaveLength(1);
    const arrow = visuals.arrows[0];
    // Arrow start point M 125.0 100.0 must match active lone pair x: 125, y: 100!
    expect(arrow.d).toMatch(/^M 125\.0 100\.0/);
    expect(arrow.color).toBe("#0d9488");
    expect(arrow.markerEnd).toContain("#electron-arrowhead-teal");
  });

  // 25. Bond Cleavage Arrow Rooting at Bond Midpoint
  it("25. computeMechanismVisuals roots bond_to_atom arrow at bond midpoint and targets leaving group", () => {
    const mockSubstrateGeom: MoleculeGeometry = {
      atoms: [
        { index: 0, element: "C", x: 50, y: 100, charge: 0, hydrogenCount: 3, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [1] },
        {
          index: 1,
          element: "Br",
          x: 90,
          y: 100,
          charge: 0,
          hydrogenCount: 0,
          isAromatic: false,
          lonePairsCount: 3,
          lonePairs: [
            { index: 0, x: 110, y: 100, angle: 0, dot1: { x: 110, y: 96 }, dot2: { x: 110, y: 104 } },
          ],
          neighborIndices: [0],
        },
      ],
      bonds: [
        { atom1: 0, atom2: 1, midpointX: 70, midpointY: 100, order: 1, length: 40 },
      ],
      averageBondLength: 40,
    };

    const mechanism: ChemicalReactionMechanism = {
      reactionType: "SN2",
      isVerified: true,
      arrows: [
        {
          type: "bond_to_atom",
          from: {
            type: "bond",
            bond: { participantRole: "reactant", participantIndex: 0, atom1: 0, atom2: 1 },
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 1 },
          },
        },
      ],
    };

    const visuals = computeMechanismVisuals(mockSubstrateGeom, mechanism, "reactant", 0);
    expect(visuals.arrows).toHaveLength(1);
    const arrow = visuals.arrows[0];
    // Arrow start point M 70.0 100.0 matches bond midpoint!
    expect(arrow.d).toMatch(/^M 70\.0 100\.0/);
    expect(arrow.color).toBe("#e11d48");
    expect(arrow.markerEnd).toContain("#electron-arrowhead-rose");
  });

  // 26. Bond-to-Bond and Lone-Pair-to-Bond Routing
  it("26. computeMechanismVisuals routes bond_to_bond and lone_pair_to_bond to bond midpoints", () => {
    const mockGeom: MoleculeGeometry = {
      atoms: [
        {
          index: 0,
          element: "O",
          x: 20,
          y: 50,
          charge: -1,
          hydrogenCount: 0,
          isAromatic: false,
          lonePairsCount: 1,
          lonePairs: [{ index: 0, x: 20, y: 35, angle: 1.57, dot1: { x: 16, y: 35 }, dot2: { x: 24, y: 35 } }],
          neighborIndices: [1],
        },
        { index: 1, element: "C", x: 50, y: 50, charge: 0, hydrogenCount: 1, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [0, 2] },
        { index: 2, element: "C", x: 80, y: 50, charge: 0, hydrogenCount: 2, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [1] },
      ],
      bonds: [
        { atom1: 0, atom2: 1, midpointX: 35, midpointY: 50, order: 1, length: 30 },
        { atom1: 1, atom2: 2, midpointX: 65, midpointY: 50, order: 1, length: 30 },
      ],
      averageBondLength: 30,
    };

    const mechanism: ChemicalReactionMechanism = {
      reactionType: "Resonance",
      isVerified: true,
      arrows: [
        {
          id: "lp_to_c_bond",
          type: "lone_pair_to_bond",
          from: {
            type: "lone_pair",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 0 },
            lonePairIndex: 0,
          },
          to: {
            type: "bond",
            bond: { participantRole: "reactant", participantIndex: 0, atom1: 0, atom2: 1 },
          },
        },
        {
          id: "bond_to_adjacent_bond",
          type: "bond_to_bond",
          from: {
            type: "bond",
            bond: { participantRole: "reactant", participantIndex: 0, atom1: 0, atom2: 1 },
          },
          to: {
            type: "bond",
            bond: { participantRole: "reactant", participantIndex: 0, atom1: 1, atom2: 2 },
          },
        },
      ],
    };

    const visuals = computeMechanismVisuals(mockGeom, mechanism, "reactant", 0);
    expect(visuals.arrows).toHaveLength(2);
    // lp_to_bond starts at (20, 35) and ends at midpoint (35, 50)
    expect(visuals.arrows[0].d).toMatch(/^M 20\.0 35\.0.*35\.0 50\.0$/);
    // bond_to_bond starts at (35, 50) and ends at midpoint (65, 50)
    expect(visuals.arrows[1].d).toMatch(/^M 35\.0 50\.0.*65\.0 50\.0$/);
  });

  // 27. Fish-Hook 1-Electron Arrowheads
  it("27. computeMechanismVisuals applies fish-hook arrowhead marker for 1-electron pushing", () => {
    const mockGeom: MoleculeGeometry = {
      atoms: [
        { index: 0, element: "C", x: 30, y: 50, charge: 0, hydrogenCount: 2, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [1] },
        { index: 1, element: "C", x: 60, y: 50, charge: 0, hydrogenCount: 2, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [0] },
      ],
      bonds: [
        { atom1: 0, atom2: 1, midpointX: 45, midpointY: 50, order: 1, length: 30 },
      ],
      averageBondLength: 30,
    };

    const mechanism: ChemicalReactionMechanism = {
      reactionType: "Radical",
      isVerified: true,
      arrows: [
        {
          type: "bond_to_atom",
          electronCount: 1, // Single electron / fish-hook!
          from: {
            type: "bond",
            bond: { participantRole: "reactant", participantIndex: 0, atom1: 0, atom2: 1 },
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 1 },
          },
        },
      ],
    };

    const visuals = computeMechanismVisuals(mockGeom, mechanism, "reactant", 0);
    expect(visuals.arrows[0].markerEnd).toBe("url(#electron-arrowhead-fishhook-rose)");
  });

  // 28. MechanismOverlay Component Rendering
  it("28. MechanismOverlay renders valid SVG circles for lone pairs and path for arrows", () => {
    const mockGeom: MoleculeGeometry = {
      atoms: [
        {
          index: 0,
          element: "O",
          x: 50,
          y: 50,
          charge: -1,
          hydrogenCount: 1,
          isAromatic: false,
          lonePairsCount: 1,
          lonePairs: [{ index: 0, x: 70, y: 50, angle: 0, dot1: { x: 70, y: 46 }, dot2: { x: 70, y: 54 } }],
          neighborIndices: [],
        },
      ],
      bonds: [],
      averageBondLength: 30,
    };

    const mechanism: ChemicalReactionMechanism = {
      reactionType: "SN2",
      isVerified: true,
      arrows: [
        {
          id: "test_arrow_react",
          type: "lone_pair_to_atom",
          from: {
            type: "lone_pair",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 0 },
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 1, atomIndex: 0 },
          },
        },
      ],
    };

    const { container } = render(
      <svg>
        <MechanismOverlay
          geometry={mockGeom}
          mechanism={mechanism}
          participantRole="reactant"
          participantIndex={0}
        />
      </svg>,
    );

    const overlay = container.querySelector("[data-testid='mechanism-overlay']");
    expect(overlay).toBeInTheDocument();

    const dots = container.querySelectorAll("[data-testid='mechanism-lone-pairs'] circle");
    expect(dots).toHaveLength(2);

    const arrows = container.querySelectorAll("[data-testid='mechanism-arrows'] path");
    expect(arrows).toHaveLength(1);
    expect(arrows[0].getAttribute("d")).toBeTruthy();
    expect(arrows[0].getAttribute("d")).not.toContain("NaN");

    // Must NOT contain dashed circles or "Nu:" / "LG" text badges
    expect(container.querySelector("text")).toBeNull();
    const dashedCircles = Array.from(container.querySelectorAll("circle")).filter(
      (c) => c.getAttribute("stroke-dasharray"),
    );
    expect(dashedCircles).toHaveLength(0);
  });

  // 29. Intermolecular Mechanism Scheme Layer
  it("29. ReactionParticipantsRow renders unified intermolecular arrow across participants without splitting into disconnected stubs", () => {
    const sn2Rxn: ChemicalReaction = {
      title: "SN2 Reaction Scheme",
      reactants: [
        { smiles: "CCBr", name: "Bromoethane" },
        { smiles: "[OH-]", name: "Hydroxide" },
      ],
      products: [
        { smiles: "CCO", name: "Ethanol" },
        { smiles: "[Br-]", name: "Bromide" },
      ],
      mechanism: {
        reactionType: "SN2",
        isVerified: true,
        reactionCenter: {
          nucleophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "O" },
          electrophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 0, element: "C" },
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 2, element: "Br" },
        },
      },
    };

    const { container } = render(<ReactionBlock reaction={sn2Rxn} />);
    expect(container.querySelector("[data-testid='reaction-block']")).toBeInTheDocument();
    const cards = container.querySelectorAll("[data-testid='rxn-reactant-card']");
    expect(cards).toHaveLength(2);
  });

  // 30. E2 Elimination with Anti-Periplanar Beta-H
  it("30. ReactionBlock renders E2 elimination with anti-periplanar beta-H and unbroken base attack arrow", () => {
    const e2Rxn: ChemicalReaction = {
      title: "E2 Elimination Mechanism Scheme",
      reactants: [
        { smiles: "[OH-]", name: "Base" },
        { smiles: "CCBr", name: "Bromoethane" },
      ],
      products: [
        { smiles: "C=C", name: "Ethene" },
        { smiles: "O", name: "Water" },
        { smiles: "[Br-]", name: "Bromide" },
      ],
      mechanism: {
        reactionType: "E2",
        isVerified: true,
        arrows: [
          {
            id: "arrow_base_h",
            type: "lone_pair_to_atom",
            from: {
              type: "lone_pair",
              atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 0 },
            },
            to: {
              type: "atom",
              atom: { participantRole: "reactant", participantIndex: 1, atomIndex: 0 },
            },
            label: "گرفتن پروتون بتا",
          },
          {
            id: "arrow_pi_bond",
            type: "bond_to_bond",
            from: {
              type: "bond",
              bond: { participantRole: "reactant", participantIndex: 1, atom1: 0, atom2: 1 },
            },
            to: {
              type: "bond",
              bond: { participantRole: "reactant", participantIndex: 1, atom1: 0, atom2: 1 },
            },
            label: "تشکیل پیوند دوگانه",
          },
          {
            id: "arrow_lg_exit",
            type: "bond_to_atom",
            from: {
              type: "bond",
              bond: { participantRole: "reactant", participantIndex: 1, atom1: 1, atom2: 2 },
            },
            to: {
              type: "atom",
              atom: { participantRole: "reactant", participantIndex: 1, atomIndex: 2 },
            },
            label: "خروج گروه ترک‌کننده",
          },
        ],
      },
    };

    const { container } = render(<ReactionBlock reaction={e2Rxn} />);
    expect(container.querySelector("[data-testid='reaction-block']")).toBeInTheDocument();
  });

  // 31. Obstacle Routing in MechanismOverlay
  it("31. computeMechanismVisuals uses obstacle routing engine avoiding bond collisions", () => {
    const mockGeom: MoleculeGeometry = {
      atoms: [
        { index: 0, element: "C", x: 20, y: 50, charge: -1, hydrogenCount: 2, isAromatic: false, lonePairsCount: 1, lonePairs: [{ index: 0, x: 10, y: 50, angle: Math.PI, dot1: { x: 10, y: 46 }, dot2: { x: 10, y: 54 } }], neighborIndices: [1] },
        { index: 1, element: "C", x: 50, y: 50, charge: 0, hydrogenCount: 1, isAromatic: false, lonePairsCount: 0, lonePairs: [], neighborIndices: [0, 2] },
        { index: 2, element: "O", x: 80, y: 50, charge: 0, hydrogenCount: 0, isAromatic: false, lonePairsCount: 2, lonePairs: [], neighborIndices: [1] },
      ],
      bonds: [
        { atom1: 0, atom2: 1, order: 1, x1: 20, y1: 50, x2: 50, y2: 50, midpointX: 35, midpointY: 50, normalX: 0, normalY: 1, length: 30 },
        { atom1: 1, atom2: 2, order: 2, x1: 50, y1: 50, x2: 80, y2: 50, midpointX: 65, midpointY: 50, normalX: 0, normalY: 1, length: 30 },
      ],
      averageBondLength: 30,
    };

    const mechanism: ChemicalReactionMechanism = {
      reactionType: "Resonance",
      isVerified: true,
      arrows: [
        {
          id: "arrow_resonance_attack",
          type: "lone_pair_to_bond",
          from: {
            type: "lone_pair",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 0 },
            lonePairIndex: 0,
          },
          to: {
            type: "bond",
            bond: { participantRole: "reactant", participantIndex: 0, atom1: 0, atom2: 1 },
          },
        },
      ],
    };

    const visuals = computeMechanismVisuals(mockGeom, mechanism, "reactant", 0);
    expect(visuals.arrows).toHaveLength(1);
    expect(visuals.arrows[0].d).toMatch(/^M 10\.0 50\.0 Q/);
    expect(visuals.arrows[0].d).not.toContain("NaN");
  });
});



