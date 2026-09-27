import { describe, it, expect } from "vitest";

import {
  validateChemicalStructure,
  parseMolecularFormula,
  parseSmilesStructure,
  parseChemicalCodeContent,
  extractChemicalStructuresFromMarkdown,
  parseReactionCodeContent,
  parseReactionSmiles,
  validateChemicalReaction,
  extractChemicalReactionsFromMarkdown,
  parseSmilesToGraph,
  detectBondChanges,
  validateSN2Mechanism,
  validateReactionMechanism,
  validateCustomMechanismArrows,
  validateE2Mechanism,
  sanitizeChemicalToken,
} from "./chemical-validation.js";
import type { ChemicalStructure, ChemicalReaction, ChemicalReactionMechanism, MechanismArrow } from "./types.js";
import type { LessonPayload } from "../generation.js";



describe("Chemical Structure Validation Suite", () => {
  describe("Level 1: Syntactic & Structural Validation (Valid Compounds)", () => {
    it("validates Lidocaine with high confidence when metadata is consistent", () => {
      const lidocaine: ChemicalStructure = {
        id: "lidocaine",
        compoundName: "لیدوکائین (Lidocaine)",
        smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
        formula: "C14H22N2O",
        molecularWeight: 234.34,
        drugClass: "Local Anesthetic / Amide",
        sarHighlights: [
          {
            feature: "پیوند آمیدی",
            description: "موجب پایداری در برابر هیدرولیز استرازهای پلاسما",
          },
        ],
      };

      const result = validateChemicalStructure(lidocaine);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("validates Procaine with high confidence", () => {
      const procaine: ChemicalStructure = {
        id: "procaine",
        compoundName: "پروکائین (Procaine)",
        smiles: "CCN(CC)CCOC(=O)c1ccc(N)cc1",
        formula: "C13H20N2O2",
        molecularWeight: 236.31,
        drugClass: "Local Anesthetic / Ester",
      };

      const result = validateChemicalStructure(procaine);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
      expect(result.errors).toHaveLength(0);
    });

    it("validates Aspirin (Acetylsalicylic Acid)", () => {
      const aspirin: ChemicalStructure = {
        id: "aspirin",
        compoundName: "آسپرین (Aspirin)",
        smiles: "CC(=O)Oc1ccccc1C(=O)O",
        formula: "C9H8O4",
        molecularWeight: 180.16,
        drugClass: "NSAID",
      };

      const result = validateChemicalStructure(aspirin);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Level 1: Structural Invalidation (Broken SMILES)", () => {
    it("flags empty or whitespace SMILES as invalid", () => {
      const emptyStruct: ChemicalStructure = {
        compoundName: "Unknown",
        smiles: "   ",
      };

      const result = validateChemicalStructure(emptyStruct);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("flags unmatched opening parenthesis as invalid", () => {
      const brokenParen: ChemicalStructure = {
        compoundName: "Broken Paren Molecule",
        smiles: "CCN(CC(=O)Nc1c(C)cccc1C",
      };

      const result = validateChemicalStructure(brokenParen);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
      expect(result.errors.some((e) => e.includes("parentheses"))).toBe(true);
    });

    it("flags unmatched closing parenthesis as invalid", () => {
      const brokenParen: ChemicalStructure = {
        compoundName: "Broken Paren Molecule",
        smiles: "CCN(CC))CC(=O)Nc1c(C)cccc1C",
      };

      const result = validateChemicalStructure(brokenParen);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
    });

    it("flags unclosed square bracket as invalid", () => {
      const brokenBracket: ChemicalStructure = {
        compoundName: "Broken Bracket Molecule",
        smiles: "CC[NH+(CC)CC",
      };

      const result = validateChemicalStructure(brokenBracket);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
    });

    it("flags unclosed ring digits (e.g. c1ccccc without matching 1) as invalid", () => {
      const unclosedRing: ChemicalStructure = {
        compoundName: "Unclosed Ring",
        smiles: "c1ccccc",
      };

      const result = validateChemicalStructure(unclosedRing);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
      expect(result.errors.some((e) => e.includes("ring identifier '1'"))).toBe(true);
    });

    it("flags invalid / unknown characters in SMILES as invalid", () => {
      const invalidChars: ChemicalStructure = {
        compoundName: "Bad Chars",
        smiles: "CC$!@#XYZ",
      };

      const result = validateChemicalStructure(invalidChars);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
    });
  });

  describe("Level 4: Pure Code Parsing & Extraction Helpers", () => {
    it("parses YAML-like chemical code block", () => {
      const code = `
name: لیدوکائین
smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C
formula: C14H22N2O
weight: 234.34
sar:
  - پیوند آمیدی: پایداری بیشتر
`;
      const struct = parseChemicalCodeContent(code, "chemical");
      expect(struct).not.toBeNull();
      expect(struct?.compoundName).toBe("لیدوکائین");
      expect(struct?.smiles).toBe("CCN(CC)CC(=O)Nc1c(C)cccc1C");
      expect(struct?.formula).toBe("C14H22N2O");
      expect(struct?.sarHighlights?.length).toBe(1);
    });

    it("parses JSON chemical code block", () => {
      const code = JSON.stringify({
        compoundName: "هیستامین",
        smiles: "NCCc1c[nH]cn1",
      });
      const struct = parseChemicalCodeContent(code, "chemical");
      expect(struct?.compoundName).toBe("هیستامین");
      expect(struct?.smiles).toBe("NCCc1c[nH]cn1");
    });
  });

  describe("Level 5: Real-World Histamine Document Invariants", () => {
    it("flags formula atom count mismatch with needsReview: true and low confidence", () => {
      // SMILES has 14 carbons (Lidocaine), but formula says C8H10N4O2
      const mismatchStruct: ChemicalStructure = {
        compoundName: "Lidocaine with wrong formula",
        smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
        formula: "C8H10N4O2",
        molecularWeight: 194.19,
      };

      const result = validateChemicalStructure(mismatchStruct);
      expect(result.valid).toBe(true); // SMILES syntax is technically valid
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
      expect(result.warnings.some((w) => w.includes("Atom count mismatch for element C"))).toBe(true);
    });

    it("flags significant molecular weight mismatch with needsReview: true and low confidence", () => {
      const mwMismatchStruct: ChemicalStructure = {
        compoundName: "Lidocaine with wrong MW",
        smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
        formula: "C14H22N2O",
        molecularWeight: 500.5, // Real is ~234.34
      };

      const result = validateChemicalStructure(mwMismatchStruct);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
      expect(result.warnings.some((w) => w.includes("differs significantly"))).toBe(true);
    });

    it("accepts valid structure without optional formula or MW with medium confidence without errors", () => {
      const minimalStruct: ChemicalStructure = {
        compoundName: "Lidocaine minimal",
        smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
      };

      const result = validateChemicalStructure(minimalStruct);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("medium");
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("Formula & SMILES Helpers", () => {
    it("parses Hill system formulas correctly", () => {
      const parsed = parseMolecularFormula("C14H22N2O");
      expect(parsed).not.toBeNull();
      expect(parsed?.counts).toEqual({ C: 14, H: 22, N: 2, O: 1 });
      expect(parsed?.molecularWeight).toBeCloseTo(234.34, 1);
    });

    it("parses formulas with multi-letter elements correctly", () => {
      const parsed = parseMolecularFormula("C13H18Cl2N2O");
      expect(parsed?.counts).toEqual({ C: 13, H: 18, Cl: 2, N: 2, O: 1 });
    });

    it("handles two-letter halogens in SMILES (Cl, Br)", () => {
      const parsed = parseSmilesStructure("CC(Cl)C(=O)O");
      expect(parsed.valid).toBe(true);
      expect(parsed.atomCounts["Cl"]).toBe(1);
      expect(parsed.atomCounts["C"]).toBe(3);
      expect(parsed.atomCounts["O"]).toBe(2);
    });

    it("handles bracket atoms correctly ([nH], [NH+], [OH], [CH2], [Cl-], [Na+]) without false-positive element parsing", () => {
      const parsedHistamine = parseSmilesStructure("NCCc1c[nH]cn1");
      expect(parsedHistamine.valid).toBe(true);
      expect(parsedHistamine.atomCounts["N"]).toBe(3);
      expect(parsedHistamine.atomCounts["C"]).toBe(5);
      expect(parsedHistamine.atomCounts["Nh"]).toBeUndefined();

      const parsedProtonated = parseSmilesStructure("[NH+]CCc1c[nH]cn1");
      expect(parsedProtonated.valid).toBe(true);
      expect(parsedProtonated.atomCounts["N"]).toBe(3);

      const parsedHydroxyl = parseSmilesStructure("CC[OH]");
      expect(parsedHydroxyl.valid).toBe(true);
      expect(parsedHydroxyl.atomCounts["O"]).toBe(1);
      expect(parsedHydroxyl.atomCounts["Oh"]).toBeUndefined();

      const parsedMethylene = parseSmilesStructure("C[CH2]C");
      expect(parsedMethylene.valid).toBe(true);
      expect(parsedMethylene.atomCounts["C"]).toBe(3);

      const parsedSalt = parseSmilesStructure("[Na+].[Cl-]");
      expect(parsedSalt.valid).toBe(true);
      expect(parsedSalt.atomCounts["Na"]).toBe(1);
      expect(parsedSalt.atomCounts["Cl"]).toBe(1);
    });

    it("validates Histamine and Antihistamine structures with high confidence", () => {
      const histamine: ChemicalStructure = {
        compoundName: "هیستامین (Histamine)",
        smiles: "NCCc1c[nH]cn1",
        formula: "C5H9N3",
        molecularWeight: 111.15,
        drugClass: "آگونیست طبیعی گیرنده‌های هیستامینی",
      };
      const histResult = validateChemicalStructure(histamine);
      expect(histResult.valid).toBe(true);
      expect(histResult.needsReview).toBe(false);
      expect(histResult.confidence).toBe("high");

      const cimetidine: ChemicalStructure = {
        compoundName: "سایمتیدین (Cimetidine)",
        smiles: "Cc1c(CSCCNC(=NC#N)NC)[nH]cn1",
        formula: "C10H16N6S",
        molecularWeight: 252.34,
        drugClass: "آنتاگونیست گیرنده H2",
      };
      const cimResult = validateChemicalStructure(cimetidine);
      expect(cimResult.valid).toBe(true);
      expect(cimResult.needsReview).toBe(false);
      expect(cimResult.confidence).toBe("high");

      const diphenhydramine: ChemicalStructure = {
        compoundName: "دیفن‌هیدرامین (Diphenhydramine)",
        smiles: "CN(C)CCOC(c1ccccc1)c2ccccc2",
        formula: "C17H21NO",
        molecularWeight: 255.35,
        drugClass: "آنتی‌هیستامین H1 نسل اول",
      };
      const dipResult = validateChemicalStructure(diphenhydramine);
      expect(dipResult.valid).toBe(true);
      expect(dipResult.needsReview).toBe(false);
      expect(dipResult.confidence).toBe("high");
    });
  });

  describe("Markdown Chemical Structure Extraction Projection", () => {
    it("extracts and validates chemical code blocks from lesson markdown", () => {
      const markdown = `# شیمی دارویی هیستامین\n\nهیستامین دارای توتومریسم است:\n\n\`\`\`chemical\nname: هیستامین\nsmiles: NCCc1c[nH]cn1\nformula: C5H9N3\nweight: 111.15\nsar:\n  - حلقه ایمیدازول: مسئول برهم‌کنش توتومریسم\n\`\`\`\n\nسپس سایمتیدین ساخته شد:\n\n\`\`\`chemical\nname: سایمتیدین\nsmiles: Cc1c(CSCCNC(=NC#N)NC)[nH]cn1\nformula: C10H16N6S\nweight: 252.34\n\`\`\`\n\nنکات پایانی...`;

      const structures = extractChemicalStructuresFromMarkdown(markdown);
      expect(structures).toHaveLength(2);
      expect(structures[0].compoundName).toBe("هیستامین");
      expect(structures[0].smiles).toBe("NCCc1c[nH]cn1");
      expect(structures[0].confidence).toBe("high");
      expect(structures[0].needsReview).toBe(false);
      expect(structures[0].sarHighlights?.[0].feature).toBe("حلقه ایمیدازول");

      expect(structures[1].compoundName).toBe("سایمتیدین");
      expect(structures[1].confidence).toBe("high");
    });

    it("extracts smiles-only blocks with fallback naming", () => {
      const markdown = "ساختار:\n```smiles\nCN(C)CCOC(c1ccccc1)c2ccccc2 # دیفن‌هیدرامین\n```";
      const structures = extractChemicalStructuresFromMarkdown(markdown);
      expect(structures).toHaveLength(1);
      expect(structures[0].compoundName).toBe("دیفن‌هیدرامین");
      expect(structures[0].smiles).toBe("CN(C)CCOC(c1ccccc1)c2ccccc2");
    });
  });

  describe("Zero Regression for Non-Chemical Lesson Payload", () => {
    it("allows standard lesson payload without chemicalStructures", () => {
      const standardLesson: LessonPayload = {
        kind: "lesson",
        title: "فیزیولوژی قلب و گردش خون",
        contentMarkdown: "# فیزیولوژی قلب\n\nمتن درسنامه استاندارد...",
        citationChunkIds: ["chunk-1", "chunk-2"],
      };

      expect(standardLesson.chemicalStructures).toBeUndefined();
      expect(standardLesson.title).toBe("فیزیولوژی قلب و گردش خون");
    });
  });

  describe("Chemical Reaction Validation Suite (Organic Chemistry)", () => {
    it("1. validates a classic esterification reaction (A + B -> C + D) with reagents and conditions", () => {
      const esterification: ChemicalReaction = {
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

      const result = validateChemicalReaction(esterification);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
      expect(result.errors).toHaveLength(0);
      expect(result.participantValidations).toHaveLength(4);
    });

    it("2. parses YAML-like ```reaction code block into ChemicalReaction", () => {
      const rawYaml = [
        "title: هیدروژناسیون اتن",
        "type: افزایش الکتروفیلی",
        "reactants:",
        "  - smiles: C=C",
        "    name: اتن",
        "  - smiles: '[H][H]'",
        "    name: هیدروژن",
        "catalysts:",
        "  - Pd/C",
        "conditions:",
        "  - 25 °C",
        "  - 1 atm",
        "products:",
        "  - smiles: CC",
        "    name: اتان",
      ].join("\n");

      const parsed = parseReactionCodeContent(rawYaml, "reaction");
      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe("هیدروژناسیون اتن");
      expect(parsed?.reactionType).toBe("افزایش الکتروفیلی");
      expect(parsed?.reactants).toHaveLength(2);
      expect(parsed?.reactants[0].smiles).toBe("C=C");
      expect(parsed?.reactants[0].name).toBe("اتن");
      expect(parsed?.catalysts).toContain("Pd/C");
      expect(parsed?.conditions).toContain("25 °C");
      expect(parsed?.products).toHaveLength(1);
      expect(parsed?.products[0].smiles).toBe("CC");
    });

    it("3. parses JSON-formatted ```reaction code block", () => {
      const jsonStr = JSON.stringify({
        title: "واکنش دیلز-آلدر",
        type: "حلقه‌زایی",
        reactants: [
          { smiles: "C=CC=C", name: "۱،۳-بوتادی‌ان" },
          { smiles: "C=C", name: "اتیلن" },
        ],
        conditions: ["150 °C"],
        products: [
          { smiles: "C1=CCCCC1", name: "سیکلوهگزن" },
        ],
      });

      const parsed = parseReactionCodeContent(jsonStr, "reaction");
      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe("واکنش دیلز-آلدر");
      expect(parsed?.reactants).toHaveLength(2);
      expect(parsed?.products).toHaveLength(1);
      expect(parsed?.products[0].smiles).toBe("C1=CCCCC1");
    });

    it("4. parses inline Reaction SMILES (A.B>reagent>C) without leaking '>' to molecule validator", () => {
      const rxnSmiles = "CC(=O)O.CCO>[H+].heat>CC(=O)OCC.O";
      const parsed = parseReactionSmiles(rxnSmiles);

      expect(parsed).not.toBeNull();
      expect(parsed?.reactants).toHaveLength(2);
      expect(parsed?.reactants[0].smiles).toBe("CC(=O)O");
      expect(parsed?.reactants[1].smiles).toBe("CCO");
      expect(parsed?.reagents).toEqual(["[H+]", "heat"]);
      expect(parsed?.products).toHaveLength(2);
      expect(parsed?.products[0].smiles).toBe("CC(=O)OCC");
      expect(parsed?.products[1].smiles).toBe("O");
    });

    it("5. validates multi-step reaction sequence (A -> B -> C)", () => {
      const multiStepReaction: ChemicalReaction = {
        title: "سنتز ۲ مرحله‌ای استر",
        reactants: [{ smiles: "CC(=O)Cl", name: "استیل کلرید" }],
        products: [{ smiles: "CC(=O)OCC", name: "اتیل استات" }],
        steps: [
          {
            stepNumber: 1,
            title: "تشکیل نمک حدواسط",
            reactants: [{ smiles: "CC(=O)Cl", name: "استیل کلرید" }],
            reagents: ["NEt3"],
            products: [{ smiles: "CC(=O)[O-]", name: "استات" }],
          },
          {
            stepNumber: 2,
            title: "آلکیلاسیون نهایی",
            reactants: [{ smiles: "CC(=O)[O-]", name: "استات" }],
            reagents: ["EtBr"],
            products: [{ smiles: "CC(=O)OCC", name: "اتیل استات" }],
          },
        ],
      };

      const result = validateChemicalReaction(multiStepReaction);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
    });

    it("6. flags empty reactants or products as invalid with clear errors", () => {
      const emptyReactants: ChemicalReaction = {
        title: "واکنش ناقص",
        reactants: [],
        products: [{ smiles: "CCO" }],
      };

      const res1 = validateChemicalReaction(emptyReactants);
      expect(res1.valid).toBe(false);
      expect(res1.needsReview).toBe(true);
      expect(res1.errors.some((e) => e.includes("must have at least one reactant"))).toBe(true);

      const emptyProducts: ChemicalReaction = {
        title: "واکنش بدون فرآورده",
        reactants: [{ smiles: "CCO" }],
        products: [],
      };

      const res2 = validateChemicalReaction(emptyProducts);
      expect(res2.valid).toBe(false);
      expect(res2.needsReview).toBe(true);
      expect(res2.errors.some((e) => e.includes("must have at least one product"))).toBe(true);
    });

    it("7. flags invalid participant SMILES with needsReview: true without crashing", () => {
      const invalidParticipantReaction: ChemicalReaction = {
        title: "واکنش با SMILES نامعتبر",
        reactants: [{ smiles: "INVALID(((SMILES" }],
        products: [{ smiles: "CCO" }],
      };

      const result = validateChemicalReaction(invalidParticipantReaction);
      expect(result.valid).toBe(false);
      expect(result.needsReview).toBe(true);
      expect(result.confidence).toBe("low");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("8. extracts chemical reactions from lesson markdown", () => {
      const markdown = [
        "# شیمی آلی: سنتز استرها",
        "",
        "واکنش استریفیکاسیون به صورت زیر انجام می‌شود:",
        "",
        "```reaction",
        "title: استریفیکاسیون فیشر",
        "reactants:",
        "  - smiles: CC(=O)O",
        "    name: اسید",
        "  - smiles: CCO",
        "    name: الکل",
        "reagents:",
        "  - H2SO4",
        "products:",
        "  - smiles: CC(=O)OCC",
        "    name: استر",
        "```",
        "",
        "توضیحات تکمیلی...",
      ].join("\n");

      const reactions = extractChemicalReactionsFromMarkdown(markdown);
      expect(reactions).toHaveLength(1);
      expect(reactions[0].title).toBe("استریفیکاسیون فیشر");
      expect(reactions[0].reactants).toHaveLength(2);
      expect(reactions[0].products).toHaveLength(1);
      expect(reactions[0].reagents).toContain("H2SO4");
      expect(reactions[0].needsReview).toBe(false);
    });
  });

  describe("Reaction Mechanism (SN2) Validation & Bond Changes Suite", () => {
    it("1. parseSmilesToGraph parses SMILES into atoms and topological bonds", () => {
      const graph = parseSmilesToGraph("CC(C)Br");
      expect(graph.valid).toBe(true);
      expect(graph.atoms).toHaveLength(4);
      expect(graph.atoms[0].element).toBe("C");
      expect(graph.atoms[1].element).toBe("C");
      expect(graph.atoms[2].element).toBe("C");
      expect(graph.atoms[3].element).toBe("Br");

      expect(graph.bonds).toHaveLength(3);
      // Br (atom 3) is connected to C (atom 1)
      const cBrBond = graph.bonds.find(
        (b) => (b.atom1 === 1 && b.atom2 === 3) || (b.atom1 === 3 && b.atom2 === 1),
      );
      expect(cBrBond).toBeDefined();
    });

    it("2. detectBondChanges deterministically detects broken and formed bonds via atomMapping", () => {
      // SN2: CH3Br (r:0) + OH- (r:1) -> CH3OH (p:0) + Br- (p:1)
      const reactants = [
        { smiles: "CBr" }, // 0: C, 1: Br
        { smiles: "[OH-]" }, // 0: O
      ];
      const products = [
        { smiles: "CO" }, // 0: C, 1: O
        { smiles: "[Br-]" }, // 0: Br
      ];

      const atomMapping: Record<string, string> = {
        "0:0": "0:0", // C -> C
        "0:1": "1:0", // Br -> Br-
        "1:0": "0:1", // O -> O
      };

      const changes = detectBondChanges(reactants, products, atomMapping);
      expect(changes.mappingErrors).toHaveLength(0);
      expect(changes.brokenBonds).toHaveLength(1);
      expect(changes.brokenBonds[0].atom1.element).toBe("C");
      expect(changes.brokenBonds[0].atom2.element).toBe("Br");

      expect(changes.formedBonds).toHaveLength(1);
      expect(changes.formedBonds[0].atom1.element).toBe("C");
      expect(changes.formedBonds[0].atom2.element).toBe("O");
    });

    it("3. validateSN2Mechanism validates valid SN2 reaction with electron-pushing arrows", () => {
      const reactants = [
        { smiles: "CCBr", name: "برومواتان" },
        { smiles: "[OH-]", name: "هیدروکسید" },
      ];
      const products = [
        { smiles: "CCO", name: "اتانول" },
        { smiles: "[Br-]", name: "برومید" },
      ];

      const mechanism: ChemicalReactionMechanism = {
        reactionType: "SN2",
        reactionCenter: {
          electrophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 1, element: "C" },
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 2, element: "Br" },
          nucleophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "O" },
        },
      };

      const res = validateSN2Mechanism(reactants, products, mechanism);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.arrows).toHaveLength(2);

      // Arrow 1: Nu: -> E+
      expect(res.arrows[0].type).toBe("lone_pair_to_atom");
      expect(res.arrows[0].from.atom?.element).toBe("O");
      expect(res.arrows[0].to.atom?.element).toBe("C");

      // Arrow 2: C-Br -> Br
      expect(res.arrows[1].type).toBe("bond_to_atom");
      expect(res.arrows[1].from.bond?.atom1).toBe(1);
      expect(res.arrows[1].from.bond?.atom2).toBe(2);
      expect(res.arrows[1].to.atom?.element).toBe("Br");
    });

    it("4. validateSN2Mechanism catches invalid leaving group not bonded to electrophile (Conservative rejection)", () => {
      // CCBr: atom 0 is C1, atom 1 is C2, atom 2 is Br. Atom 0 is NOT bonded to atom 2.
      const reactants = [
        { smiles: "CCBr" },
        { smiles: "[OH-]" },
      ];
      const products = [
        { smiles: "CCO" },
        { smiles: "[Br-]" },
      ];

      const invalidMechanism: ChemicalReactionMechanism = {
        reactionType: "SN2",
        reactionCenter: {
          electrophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 0, element: "C" }, // Non-bonded C!
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 2, element: "Br" },
          nucleophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "O" },
        },
      };

      const res = validateSN2Mechanism(reactants, products, invalidMechanism);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("not bonded to electrophile"))).toBe(true);
    });

    it("5. validateSN2Mechanism catches atom index out of bounds", () => {
      const reactants = [{ smiles: "CBr" }, { smiles: "[OH-]" }];
      const products = [{ smiles: "CO" }, { smiles: "[Br-]" }];

      const outOfBoundsMechanism: ChemicalReactionMechanism = {
        reactionType: "SN2",
        reactionCenter: {
          electrophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 99, element: "C" },
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 1, element: "Br" },
          nucleophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "O" },
        },
      };

      const res = validateSN2Mechanism(reactants, products, outOfBoundsMechanism);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("does not exist"))).toBe(true);
    });

    it("6. validateReactionMechanism integrates with validateChemicalReaction and handles complex SN2", () => {
      const complexSN2: ChemicalReaction = {
        title: "جانشینی SN2 روی سوبسترای دارویی استروئیدی",
        reactionType: "SN2",
        reactants: [
          { smiles: "CC[C@@H](C)Br", name: "۲-بروموبوتان" },
          { smiles: "[OH-]", name: "هیدروکسید" },
        ],
        products: [
          { smiles: "CC[C@H](C)O", name: "بوتان-۲-اول" },
          { smiles: "[Br-]", name: "برومید" },
        ],
        mechanism: {
          reactionType: "SN2",
          notes: "وارونگی والدن با حمله نوکلئوفیل از پشت پیوند C-Br رخ می‌دهد.",
        },
      };

      const mechRes = validateReactionMechanism(complexSN2.reactants, complexSN2.products, complexSN2.mechanism);
      expect(mechRes.valid).toBe(true);
      expect(mechRes.validatedMechanism?.isVerified).toBe(true);

      const res = validateChemicalReaction(complexSN2);
      expect(res.valid).toBe(true);
      expect(res.needsReview).toBe(false);
      expect(complexSN2.mechanism?.isVerified).toBe(true);
      expect(complexSN2.mechanism?.arrows).toHaveLength(2);
      expect(complexSN2.mechanism?.bondChanges).toHaveLength(2);
    });

    it("7. detectBondChanges rejects duplicate reactant atom mapping keys", () => {
      const reactants = [{ smiles: "CBr" }];
      const products = [{ smiles: "CO" }];
      const collisionMapping: Record<string, string> = {
        "0:0": "0:0",
        "0:1": "0:0", // Collision on product 0:0!
      };
      const changes = detectBondChanges(reactants, products, collisionMapping);
      expect(changes.mappingErrors.length).toBeGreaterThan(0);
      expect(changes.mappingErrors.some((e) => e.includes("Duplicate mapping"))).toBe(true);
    });

    it("8. validateSN2Mechanism catches ambiguous participant index in multi-reactant reaction", () => {
      const reactants = [
        { smiles: "CCBr", name: "سوبسترا ۱" },
        { smiles: "CCCBr", name: "سوبسترا ۲" },
        { smiles: "[OH-]", name: "نوکلئوفیل" },
      ];
      const products = [
        { smiles: "CCO" },
        { smiles: "CCCBr" },
        { smiles: "[Br-]" },
      ];

      // Missing participantIndex in a 3-reactant mixture
      const ambiguousMech: ChemicalReactionMechanism = {
        reactionType: "SN2",
        reactionCenter: {
          electrophile: { participantRole: "reactant", atomIndex: 1, element: "C" }, // participantIndex omitted!
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 2, element: "Br" },
          nucleophile: { participantRole: "reactant", participantIndex: 2, atomIndex: 0, element: "O" },
        },
      };

      const res = validateSN2Mechanism(reactants, products, ambiguousMech);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("participantIndex is ambiguous"))).toBe(true);
    });

    it("9. validateSN2Mechanism rejects if electrophile element is invalid (e.g. Oxygen)", () => {
      const reactants = [{ smiles: "CO" }, { smiles: "[Cl-]" }];
      const products = [{ smiles: "CCl" }, { smiles: "[OH-]" }];

      const invalidElemMech: ChemicalReactionMechanism = {
        reactionType: "SN2",
        reactionCenter: {
          electrophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 1, element: "O" }, // O cannot be electrophile in SN2
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 0, element: "C" },
          nucleophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "Cl" },
        },
      };

      const res = validateSN2Mechanism(reactants, products, invalidElemMech);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("not a recognized electrophilic element"))).toBe(true);
    });

    it("10. validateSN2Mechanism validates invariant that broken bond is actually cleaved in product mapping", () => {
      const reactants = [
        { smiles: "CBr" },
        { smiles: "[OH-]" },
      ];
      const products = [
        { smiles: "CBr" }, // Intact C-Br in product!
        { smiles: "[OH-]" },
      ];

      const bogusMechanism: ChemicalReactionMechanism = {
        reactionType: "SN2",
        reactionCenter: {
          electrophile: { participantRole: "reactant", participantIndex: 0, atomIndex: 0, element: "C" },
          leavingGroup: { participantRole: "reactant", participantIndex: 0, atomIndex: 1, element: "Br" },
          nucleophile: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "O" },
        },
        atomMapping: {
          "0:0": "0:0", // C -> C
          "0:1": "0:1", // Br -> Br (still bonded!)
          "1:0": "1:0", // O -> O
        },
      };

      const res = validateSN2Mechanism(reactants, products, bogusMechanism);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("is not cleaved in the product atom mapping"))).toBe(true);
    });

    it("11. validates reversible reaction indicators (<=> and <->) in parseReactionSmiles", () => {
      const rxn1 = parseReactionSmiles("CC(=O)O.CCO<=>H2SO4>CC(=O)OCC.O");
      expect(rxn1).not.toBeNull();
      expect(rxn1?.reversible).toBe(true);
      expect(rxn1?.reactants).toHaveLength(2);
      expect(rxn1?.products).toHaveLength(2);

      const rxn2 = parseReactionSmiles("c1ccccc1<->FeBr3>c1ccccc1");
      expect(rxn2).not.toBeNull();
      expect(rxn2?.reversible).toBe(true);
    });

    it("12. parses YAML with reversible, arrowType, and intermediates", () => {
      const yamlContent = [
        "title: تعادل اسید و باز",
        "reversible: true",
        "arrow_type: reversible",
        "reactants:",
        "  - smiles: CC(=O)O",
        "    name: استیک اسید",
        "  - smiles: O",
        "    name: آب",
        "intermediates:",
        "  - smiles: CC(=O)[O-]",
        "    name: یون استات",
        "products:",
        "  - smiles: '[OH-].[H+]'",
        "    name: یون‌های تعادلی",
      ].join("\n");

      const rxn = parseReactionCodeContent(yamlContent, "reaction");
      expect(rxn).not.toBeNull();
      expect(rxn?.reversible).toBe(true);
      expect(rxn?.arrowType).toBe("reversible");
      expect(rxn?.intermediates).toHaveLength(1);
      expect(rxn?.intermediates?.[0].smiles).toBe("CC(=O)[O-]");
      expect(rxn?.intermediates?.[0].isIntermediate).toBe(true);

      const validation = validateChemicalReaction(rxn!);
      expect(validation.valid).toBe(true);
      expect(validation.participantValidations.some((p) => p.role === "intermediate")).toBe(true);
    });

    it("13. parses JSON reaction format with intermediates and arrowType", () => {
      const jsonContent = JSON.stringify({
        title: "مسیر واکنش با ماده واسط",
        arrowType: "resonance",
        reactants: [{ smiles: "C=CC=C", name: "بوتادی‌ان" }],
        intermediates: [{ smiles: "C[CH-]C=C", name: "کربانیون واسط", isIntermediate: true }],
        products: [{ smiles: "CC=CC", name: "۲-بوتن" }],
      });

      const rxn = parseReactionCodeContent(jsonContent, "reaction");
      expect(rxn).not.toBeNull();
      expect(rxn?.arrowType).toBe("resonance");
      expect(rxn?.intermediates).toHaveLength(1);
      expect(rxn?.intermediates?.[0].smiles).toBe("C[CH-]C=C");

      const validation = validateChemicalReaction(rxn!);
      expect(validation.valid).toBe(true);
    });

    it("14. validateCustomMechanismArrows verifies valid E2 mechanism arrows and enables isVerified", () => {
      // E2 reaction: [OH-] (react 0) + CCBr (react 1: C0, C1, Br2) -> CC=C + H2O + Br-
      const reactants = [
        { smiles: "[OH-]", name: "هیدروکسید (باز)" },
        { smiles: "CCBr", name: "برومواتان" },
      ];
      const products = [
        { smiles: "C=C", name: "اتن" },
        { smiles: "O", name: "آب" },
        { smiles: "[Br-]", name: "برومید" },
      ];

      const e2Arrows: MechanismArrow[] = [
        {
          id: "arrow_base_attack",
          type: "lone_pair_to_atom",
          from: {
            type: "lone_pair",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 0, element: "O" },
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 1, atomIndex: 0, element: "C" },
          },
          label: "گرفتن پروتون بتا",
        },
        {
          id: "arrow_bond_elimination",
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
          id: "arrow_leaving_group",
          type: "bond_to_atom",
          from: {
            type: "bond",
            bond: { participantRole: "reactant", participantIndex: 1, atom1: 1, atom2: 2 },
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 1, atomIndex: 2, element: "Br" },
          },
          label: "خروج گروه ترک‌کننده",
        },
      ];

      const res = validateCustomMechanismArrows(reactants, products, [], e2Arrows);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);

      const mechRes = validateReactionMechanism(reactants, products, {
        reactionType: "E2",
        arrows: e2Arrows,
      });
      expect(mechRes.valid).toBe(true);
      expect(mechRes.validatedMechanism?.isVerified).toBe(true);

      const directE2 = validateE2Mechanism(reactants, products, {
        reactionType: "E2",
        arrows: e2Arrows,
      });
      expect(directE2.valid).toBe(true);
    });

    it("15. validateCustomMechanismArrows rejects invalid atom, bond, and participant references", () => {
      const reactants = [{ smiles: "CCBr" }]; // C0, C1, Br2
      const products = [{ smiles: "C=C" }, { smiles: "[Br-]" }];

      // Test A: non-existent atom index
      const badAtomArrow: MechanismArrow[] = [
        {
          type: "lone_pair_to_atom",
          from: {
            type: "lone_pair",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 99 },
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 1 },
          },
        },
      ];
      const resA = validateCustomMechanismArrows(reactants, products, [], badAtomArrow);
      expect(resA.valid).toBe(false);
      expect(resA.errors.some((e) => e.includes("Atom index 99 does not exist"))).toBe(true);

      // Test B: bond between atoms that are not bonded
      const badBondArrow: MechanismArrow[] = [
        {
          type: "bond_to_atom",
          from: {
            type: "bond",
            // Atom 0 (C) and Atom 2 (Br) are NOT directly bonded (C0-C1-Br2)
            bond: { participantRole: "reactant", participantIndex: 0, atom1: 0, atom2: 2 },
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 2 },
          },
        },
      ];
      const resB = validateCustomMechanismArrows(reactants, products, [], badBondArrow);
      expect(resB.valid).toBe(false);
      expect(resB.errors.some((e) => e.includes("No chemical bond exists between atom 0 and atom 2"))).toBe(true);

      // Test C: element mismatch
      const badElementArrow: MechanismArrow[] = [
        {
          type: "lone_pair_to_atom",
          from: {
            type: "lone_pair",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 2, element: "O" }, // atom 2 is Br, not O
          },
          to: {
            type: "atom",
            atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 1 },
          },
        },
      ];
      const resC = validateCustomMechanismArrows(reactants, products, [], badElementArrow);
      expect(resC.valid).toBe(false);
      expect(resC.errors.some((e) => e.includes("Element mismatch"))).toBe(true);
    });

    it("16. supports lone_pair_to_bond and 1-electron radical arrows", () => {
      // Radical allylic cleavage or resonance: C=C-C.
      const reactants = [{ smiles: "C=CC" }]; // C0=C1-C2
      const products = [{ smiles: "C=CC" }];

      const radicalArrow: MechanismArrow = {
        type: "lone_pair_to_bond",
        electronCount: 1,
        from: {
          type: "lone_pair",
          atom: { participantRole: "reactant", participantIndex: 0, atomIndex: 2, element: "C" },
        },
        to: {
          type: "bond",
          bond: { participantRole: "reactant", participantIndex: 0, atom1: 1, atom2: 2 },
        },
        label: "حرکت تک‌الکترونی (Fish-hook)",
      };

      const res = validateCustomMechanismArrows(reactants, products, [], [radicalArrow]);
      expect(res.valid).toBe(true);

      const badElectronArrow: MechanismArrow = {
        ...radicalArrow,
        electronCount: 3 as any,
      };
      const resBad = validateCustomMechanismArrows(reactants, products, [], [badElectronArrow]);
      expect(resBad.valid).toBe(false);
      expect(resBad.errors.some((e) => e.includes("electronCount must be either 1 or 2"))).toBe(true);
    });

    it("17. parses YAML reaction block containing mechanism with reactionCenter and arrows", () => {
      const yamlContent = [
        "title: مکانیزم واکنش حذف دومولکولی E2",
        "type: E2",
        "reactants:",
        "  - smiles: '[OH-]'",
        "    name: باز",
        "  - smiles: CCBr",
        "    name: برومواتان",
        "products:",
        "  - smiles: C=C",
        "    name: اتن",
        "  - smiles: O",
        "    name: آب",
        "  - smiles: '[Br-]'",
        "    name: برومید",
        "mechanism:",
        "  reactionType: E2",
        "  arrows:",
        "    - id: arrow_base_h",
        "      type: lone_pair_to_atom",
        "      electronCount: 2",
        "      from:",
        "        type: lone_pair",
        "        atom:",
        "          participantRole: reactant",
        "          participantIndex: 0",
        "          atomIndex: 0",
        "          element: O",
        "      to:",
        "        type: atom",
        "        atom:",
        "          participantRole: reactant",
        "          participantIndex: 1",
        "          atomIndex: 0",
        "          element: C",
        "      label: گرفتن پروتون بتا",
        "    - id: arrow_pi_bond",
        "      type: bond_to_bond",
        "      from:",
        "        type: bond",
        "        bond:",
        "          participantRole: reactant",
        "          participantIndex: 1",
        "          atom1: 0",
        "          atom2: 1",
        "      to:",
        "        type: bond",
        "        bond:",
        "          participantRole: reactant",
        "          participantIndex: 1",
        "          atom1: 0",
        "          atom2: 1",
        "      label: تشکیل پیوند دوگانه",
        "    - id: arrow_lg_exit",
        "      type: bond_to_atom",
        "      from:",
        "        type: bond",
        "        bond:",
        "          participantRole: reactant",
        "          participantIndex: 1",
        "          atom1: 1",
        "          atom2: 2",
        "      to:",
        "        type: atom",
        "        atom:",
        "          participantRole: reactant",
        "          participantIndex: 1",
        "          atomIndex: 2",
        "          element: Br",
        "      label: خروج گروه ترک‌کننده",
        "  notes: مکانیزم هماهنگ تک‌مرحله‌ای E2",
      ].join("\n");

      const rxn = parseReactionCodeContent(yamlContent, "reaction");
      expect(rxn).not.toBeNull();
      expect(rxn?.mechanism).toBeDefined();
      expect(rxn?.mechanism?.reactionType).toBe("E2");
      expect(rxn?.mechanism?.arrows).toHaveLength(3);
      expect(rxn?.mechanism?.arrows?.[0].type).toBe("lone_pair_to_atom");
      expect(rxn?.mechanism?.arrows?.[1].type).toBe("bond_to_bond");
      expect(rxn?.mechanism?.arrows?.[2].type).toBe("bond_to_atom");
      expect(rxn?.mechanism?.notes).toBe("مکانیزم هماهنگ تک‌مرحله‌ای E2");

      const val = validateChemicalReaction(rxn!);
      expect(val.valid).toBe(true);
      expect(rxn?.mechanism?.isVerified).toBe(true);
    });
  });

  describe("Token Sanitization & Resilient Chemical Parsing Suite (Guardrail 7)", () => {
    it("preserves stereochemistry directional bonds / and \\ strictly without corruption", () => {
      const trans = sanitizeChemicalToken("C/C=C/C");
      expect(trans).toBe("C/C=C/C");

      const cis = sanitizeChemicalToken("C/C=C\\C");
      expect(cis).toBe("C/C=C\\C");

      // With quotes and spaces
      expect(sanitizeChemicalToken('  "C/C=C/C"  ')).toBe("C/C=C/C");
      expect(sanitizeChemicalToken("  'C/C=C\\C'  ")).toBe("C/C=C\\C");
    });

    it("preserves tetrahedral chiral stereocenters @ and @@ strictly", () => {
      const rButanol = sanitizeChemicalToken("CC[C@H](O)C");
      expect(rButanol).toBe("CC[C@H](O)C");

      const sButanol = sanitizeChemicalToken("CC[C@@H](O)C");
      expect(sButanol).toBe("CC[C@@H](O)C");
    });

    it("preserves brackets and formal charges [NH3+], [O-], [Cl-], [nH]", () => {
      expect(sanitizeChemicalToken("[NH3+]")).toBe("[NH3+]");
      expect(sanitizeChemicalToken("[O-]")).toBe("[O-]");
      expect(sanitizeChemicalToken("[Cl-]")).toBe("[Cl-]");
      expect(sanitizeChemicalToken("[nH]")).toBe("[nH]");
      expect(sanitizeChemicalToken("[Na+]")).toBe("[Na+]");
    });

    it("preserves lowercase aromatic characters and benzene rings", () => {
      expect(sanitizeChemicalToken("c1ccccc1")).toBe("c1ccccc1");
      expect(sanitizeChemicalToken("c1ccncc1")).toBe("c1ccncc1");
      expect(sanitizeChemicalToken("c1ccoc1")).toBe("c1ccoc1");
    });

    it("strips Persian ZWNJ (\\u200c) and bidi marks (\\u200e, \\u200f) without affecting SMILES", () => {
      const contaminated = "\u200eNCCc1c\u200c[nH]cn1\u200f";
      expect(sanitizeChemicalToken(contaminated)).toBe("NCCc1c[nH]cn1");
    });

    it("parses chemical block with quotes around values and key aliases cleanly", () => {
      const yamlWithQuotes = [
        'molecule: "استیک اسید"',
        'structure: "CC(=O)O"',
        'formula: "C2H4O2"',
        'weight: "60.05"',
        'category: "اسید آلی"',
      ].join("\n");

      const parsed = parseChemicalCodeContent(yamlWithQuotes, "chemical");
      expect(parsed).not.toBeNull();
      expect(parsed?.compoundName).toBe("استیک اسید");
      expect(parsed?.smiles).toBe("CC(=O)O");
      expect(parsed?.formula).toBe("C2H4O2");
      expect(parsed?.molecularWeight).toBe(60.05);
      expect(parsed?.drugClass).toBe("اسید آلی");
    });

    it("parses reaction block with key aliases (substrate, product, condition) and quotes cleanly", () => {
      const yamlReaction = [
        'title: "هیدرولیز استر"',
        'substrates:',
        '  - structure: "CC(=O)OCC"',
        '    name: "اتیل استات"',
        '  - structure: "O"',
        '    name: "آب"',
        'conditions:',
        '  - "H2SO4, Δ"',
        'products:',
        '  - structure: "CC(=O)O"',
        '    name: "استیک اسید"',
        '  - structure: "CCO"',
        '    name: "اتانول"',
      ].join("\n");

      const parsed = parseReactionCodeContent(yamlReaction, "reaction");
      expect(parsed).not.toBeNull();
      expect(parsed?.title).toBe("هیدرولیز استر");
      expect(parsed?.reactants).toHaveLength(2);
      expect(parsed?.reactants[0].smiles).toBe("CC(=O)OCC");
      expect(parsed?.reactants[0].name).toBe("اتیل استات");
      expect(parsed?.products).toHaveLength(2);
      expect(parsed?.products[0].smiles).toBe("CC(=O)O");
    });
  });
});



