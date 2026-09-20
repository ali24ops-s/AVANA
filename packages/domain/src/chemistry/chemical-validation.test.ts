import { describe, it, expect } from "vitest";
import {
  validateChemicalStructure,
  parseMolecularFormula,
  parseSmilesStructure,
  parseChemicalCodeContent,
  extractChemicalStructuresFromMarkdown,
} from "./chemical-validation.js";
import type { ChemicalStructure } from "./types.js";
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
});
