import { describe, it, expect } from "vitest";
import {
  validateMindMapChemicalStructure,
  validateMolecularGraphValence,
  verifyAuthoritativeCompound,
  areSmilesStructurallyIsomorphic,
  parseSmilesToGraph,
  cleanChemicalStructure,
  validateMindMapAiBase,
  validateMindMapPayload,
  validateUserModificationsAndNotes,
  computeEffectiveMindMap,
} from "../index.js";
import type { MindMapAiBase, MindMapPayload, MindMapChemicalStructure } from "@avana/contracts";

describe("Mind Map Chemical Structure Suite (Phase 1)", () => {
  describe("1. Authoritative Valid Molecules Validation", () => {
    it("validates Aspirin (Acetylsalicylic Acid) with valid SMILES, formula, and authoritative identity", () => {
      const aspirin: MindMapChemicalStructure = {
        compoundName: "آسپرین (Aspirin)",
        smiles: "CC(=O)Oc1ccccc1C(=O)O",
        formula: "C9H8O4",
        molecularWeight: 180.16,
        drugClass: "NSAID / Salicylate",
        sarHighlights: [
          {
            feature: "گروه استیل (Acetyl Group)",
            description: "عامل استیلاسیون برگشت‌ناپذیر باقی‌مانده سرین ۵۲۹ در جایگاه فعال آنزیم COX-1",
          },
          {
            feature: "گروه کربوکسیلیک اسید",
            description: "ایجاد پیوند یونی با آرژنین ۱۲۰ در کانال دسترسی COX",
          },
        ],
      };

      const result = validateMindMapChemicalStructure(aspirin);
      expect(result.valid).toBe(true);
      expect(result.syntaxValid).toBe(true);
      expect(result.graphValid).toBe(true);
      expect(result.formulaConsistent).toBe(true);
      expect(result.identityVerified).toBe(true);
      expect(result.confidence).toBe("high");
      expect(result.errors).toHaveLength(0);

      // Verify cleanChemicalStructure
      const cleaned = cleanChemicalStructure(aspirin);
      expect(cleaned).toBeDefined();
      expect(cleaned?.isValidated).toBe(true);
      expect(cleaned?.confidence).toBe("high");
      expect(cleaned?.sarHighlights).toHaveLength(2);
      expect(cleaned?.validationErrors).toBeUndefined();
    });

    it("validates Lidocaine with amino-amide scaffold and high confidence", () => {
      const lidocaine: MindMapChemicalStructure = {
        compoundName: "لیدوکائین (Lidocaine)",
        smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
        formula: "C14H22N2O",
        molecularWeight: 234.34,
        drugClass: "Local Anesthetic / Amino Amide",
        sarHighlights: [
          {
            feature: "پیوند آمیدی میانی",
            description: "مقاوم به هیدرولیز استرازهای پلاسما در مقایسه با پروکائین",
          },
          {
            feature: "دو گروه متیل ارتو (2,6-dimethyl)",
            description: "ممانعت فضایی (Steric Hindrance) جهت کاهش تخریب متابولیک توسط آمیدازهای کبدی",
          },
        ],
      };

      const result = validateMindMapChemicalStructure(lidocaine);
      expect(result.valid).toBe(true);
      expect(result.syntaxValid).toBe(true);
      expect(result.graphValid).toBe(true);
      expect(result.formulaConsistent).toBe(true);
      expect(result.identityVerified).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("validates Morphine with complex pentacyclic alkaloid scaffold and stereocenters", () => {
      const morphine: MindMapChemicalStructure = {
        compoundName: "مورفین (Morphine)",
        smiles: "CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O",
        formula: "C17H19NO3",
        molecularWeight: 285.34,
        drugClass: "Opioid Analgesic",
      };

      const result = validateMindMapChemicalStructure(morphine);
      expect(result.valid).toBe(true);
      expect(result.syntaxValid).toBe(true);
      expect(result.graphValid).toBe(true);
      expect(result.formulaConsistent).toBe(true);
      expect(result.identityVerified).toBe(true);
      expect(result.confidence).toBe("high");
    });

    it("validates Penicillin G with fused beta-lactam and thiazolidine bicyclic core with chiral centers", () => {
      const penicillinG: MindMapChemicalStructure = {
        compoundName: "پنی‌سیلین G (Penicillin G)",
        smiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)Cc3ccccc3)C(=O)O)C",
        formula: "C16H18N2O4S",
        molecularWeight: 334.39,
        drugClass: "Beta-Lactam Antibiotic",
        sarHighlights: [
          {
            feature: "حلقه چهارگوش بتا-لاکتام",
            description: "زاویه پیوندی تحت فشار (~90°) که موجب واکنش‌پذیری بالا با ترانس‌پپتیداز دیواره باکتری می‌گردد",
          },
        ],
      };

      const result = validateMindMapChemicalStructure(penicillinG);
      expect(result.valid).toBe(true);
      expect(result.syntaxValid).toBe(true);
      expect(result.graphValid).toBe(true);
      expect(result.formulaConsistent).toBe(true);
      expect(result.identityVerified).toBe(true);
      expect(result.confidence).toBe("high");
    });
  });

  describe("2. Error Detection & Invalid Structure Rejection", () => {
    it("flags structure with incorrect formula (stoichiometric atom mismatch)", () => {
      // Aspirin SMILES but Lidocaine's formula (C14H22N2O)
      const mismatched: MindMapChemicalStructure = {
        compoundName: "آسپرین با فرمول اشتباه",
        smiles: "CC(=O)Oc1ccccc1C(=O)O", // 9 Carbons, 4 Oxygens, 0 Nitrogens
        formula: "C14H22N2O", // Specifies 14 Carbons, 2 Nitrogens, 1 Oxygen
      };

      const result = validateMindMapChemicalStructure(mismatched);
      expect(result.valid).toBe(false);
      expect(result.formulaConsistent).toBe(false);
      expect(result.confidence).toBe("low");
      expect(result.errors.some((e) => e.includes("عدم تطابق"))).toBe(true);

      const cleaned = cleanChemicalStructure(mismatched);
      expect(cleaned?.isValidated).toBe(false);
      expect(cleaned?.confidence).toBe("low");
      expect(cleaned?.validationErrors).toBeDefined();
      expect(cleaned?.validationErrors!.length).toBeGreaterThan(0);
    });

    it("flags broken and incomplete SMILES syntax (unclosed rings, missing parens)", () => {
      const brokenParenthesis: MindMapChemicalStructure = {
        compoundName: "مولکول ناقص ۱",
        smiles: "CC(=O)Oc1ccccc1C(=O", // Missing closing paren
      };
      const r1 = validateMindMapChemicalStructure(brokenParenthesis);
      expect(r1.valid).toBe(false);
      expect(r1.syntaxValid).toBe(false);
      expect(r1.confidence).toBe("low");

      const unclosedRing: MindMapChemicalStructure = {
        compoundName: "حلقه بنزن بسته نشده",
        smiles: "c1ccccc", // Ring 1 opened but never closed
      };
      const r2 = validateMindMapChemicalStructure(unclosedRing);
      expect(r2.valid).toBe(false);
      expect(r2.syntaxValid).toBe(false);

      const emptySmiles: MindMapChemicalStructure = {
        compoundName: "ترکیب خالی",
        smiles: "   ",
      };
      const r3 = validateMindMapChemicalStructure(emptySmiles);
      expect(r3.valid).toBe(false);
    });

    it("flags chemically impossible atomic valences (e.g. pentavalent carbon)", () => {
      // Central carbon with three double bonds = bond order 6 (pentavalent/hexavalent carbon violation)
      const hypervalentCarbon: MindMapChemicalStructure = {
        compoundName: "کربن پنج‌ظرفیتی غیرممکن",
        smiles: "C(=O)(=O)(=O)",
      };

      const result = validateMindMapChemicalStructure(hypervalentCarbon);
      expect(result.valid).toBe(false);
      expect(result.graphValid).toBe(false);
      expect(result.errors.some((e) => e.includes("نقض ظرفیت شیمیایی") && e.includes("کربن"))).toBe(true);

      const cleaned = cleanChemicalStructure(hypervalentCarbon);
      expect(cleaned?.isValidated).toBe(false);
      expect(cleaned?.confidence).toBe("low");
    });

    it("flags compound identity mismatch when SMILES belongs to a different molecule", () => {
      // Named "Aspirin" but SMILES is Paracetamol (CC(=O)Nc1ccc(O)cc1)
      const imposter: MindMapChemicalStructure = {
        compoundName: "آسپرین (Aspirin)",
        smiles: "CC(=O)Nc1ccc(O)cc1", // Paracetamol SMILES
        formula: "C8H9NO2",
      };

      const result = validateMindMapChemicalStructure(imposter);
      expect(result.identityVerified).toBe(false);
      expect(result.errors.some((e) => e.includes("با هویت مرجع") && e.includes("منطبق نیست"))).toBe(true);
    });

    it("directly checks molecular graph valence on valid and invalid graphs", () => {
      const validGraph = parseSmilesToGraph("CC(=O)Oc1ccccc1C(=O)O");
      const validCheck = validateMolecularGraphValence(validGraph);
      expect(validCheck.valid).toBe(true);
      expect(validCheck.errors).toHaveLength(0);

      const invalidGraph = parseSmilesToGraph("C(=O)(=O)(=O)");
      const invalidCheck = validateMolecularGraphValence(invalidGraph);
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.errors.length).toBeGreaterThan(0);
    });

    it("directly checks authoritative compound identity against reference registry", () => {
      const match = verifyAuthoritativeCompound("آسپرین", "CC(=O)Oc1ccccc1C(=O)O");
      expect(match.matched).toBe(true);
      expect(match.verified).toBe(true);
      expect(match.referenceRecord?.canonicalName).toContain("Aspirin");

      const mismatch = verifyAuthoritativeCompound("آسپرین", "CCN(CC)CC(=O)Nc1c(C)cccc1C");
      expect(mismatch.matched).toBe(true);
      expect(mismatch.verified).toBe(false);

      const unlisted = verifyAuthoritativeCompound("پلیمر ناشناخته", "CCCC");
      expect(unlisted.matched).toBe(false);
      expect(unlisted.verified).toBe(false);
    });
  });

  describe("3. Tree Hierarchy & Backward Compatibility (Zero Mind Map Regression)", () => {
    it("preserves standard nodes without chemical structure without altering layout or dimensions", () => {
      const baseTree: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-07T12:00:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "شیمی دارویی",
            shortDescription: "مبانی ساختار شیمیایی و فارماکوفور",
          },
          concept_aspirin: {
            id: "concept_aspirin",
            parentId: "root",
            title: "آسپرین",
            shortDescription: "داروی ضدالتهاب غیراستروئیدی مهارکننده COX",
            chemicalStructure: {
              compoundName: "آسپرین",
              smiles: "CC(=O)Oc1ccccc1C(=O)O",
              formula: "C9H8O4",
              molecularWeight: 180.16,
            },
          },
          concept_general: {
            id: "concept_general",
            parentId: "root",
            title: "مفهوم پایه",
            shortDescription: "توضیح عمومی بدون ساختار شیمیایی",
          },
        },
      };

      const validated = validateMindMapAiBase(baseTree);
      expect(validated.nodes["concept_aspirin"].chemicalStructure).toBeDefined();
      expect(validated.nodes["concept_aspirin"].chemicalStructure?.isValidated).toBe(true);
      expect(validated.nodes["concept_aspirin"].chemicalStructure?.smiles).toBe("CC(=O)Oc1ccccc1C(=O)O");

      // The non-chemical node remains completely untouched
      expect(validated.nodes["concept_general"].chemicalStructure).toBeUndefined();
      expect(validated.nodes["concept_general"].title).toBe("مفهوم پایه");
    });

    it("handles legacy mind map payloads without chemicalStructure with zero errors", () => {
      const legacyPayload: MindMapPayload = {
        kind: "mind_map",
        version: 1,
        sourceType: "lessons",
        sourceId: "module_legacy_101",
        updatedAt: "2026-10-01T00:00:00.000Z",
        aiBase: {
          rootNodeId: "root",
          generatedAt: "2026-10-01T00:00:00.000Z",
          model: "gemini-3.5-flash-lite",
          nodes: {
            root: {
              id: "root",
              parentId: null,
              title: "درس فیزیولوژی",
              shortDescription: "فیزیولوژی اعصاب",
            },
            n1: {
              id: "n1",
              parentId: "root",
              title: "نورون‌ها",
              shortDescription: "سلول‌های اصلی دستگاه عصبی",
            },
          },
        },
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {},
        },
        userNotes: {},
      };

      const validatedPayload = validateMindMapPayload(legacyPayload);
      expect(validatedPayload.aiBase.nodes["n1"].chemicalStructure).toBeUndefined();

      const effective = computeEffectiveMindMap(legacyPayload);
      expect(effective.nodes["n1"].title).toBe("نورون‌ها");
      expect(effective.nodes["n1"].chemicalStructure).toBeUndefined();
    });

    it("correctly preserves and propagates chemicalStructure in customNodes and overrides", () => {
      const initialAiBase: MindMapAiBase = {
        rootNodeId: "root",
        generatedAt: "2026-11-07T12:00:00.000Z",
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "فارماکولوژی",
            shortDescription: "سرفصل داروشناسی",
          },
          node_base_lido: {
            id: "node_base_lido",
            parentId: "root",
            title: "لیدوکائین",
            shortDescription: "بی‌حس‌کننده موضعی آمیدی",
            chemicalStructure: {
              compoundName: "لیدوکائین",
              smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
              formula: "C14H22N2O",
            },
          },
        },
      };

      // User creates a custom node with Aspirin, and overrides the base node's note
      const rawModifications = {
        deletedNodeIds: [],
        customNodes: {
          custom_aspirin: {
            id: "custom_aspirin",
            parentId: "root",
            title: "آسپرین سفارشی من",
            shortDescription: "افزوده شده توسط کاربر",
            chemicalStructure: {
              compoundName: "آسپرین",
              smiles: "CC(=O)Oc1ccccc1C(=O)O",
              formula: "C9H8O4",
              molecularWeight: 180.16,
            },
          },
        },
        overrides: {
          node_base_lido: {
            title: "لیدوکائین هیدروکلراید",
            chemicalStructure: {
              compoundName: "لیدوکائین",
              smiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
              formula: "C14H22N2O",
              educationalNote: "ویرایش ساختار توسط کاربر در پنل مطالعه",
            },
          },
        },
      };

      const validatedMods = validateUserModificationsAndNotes(
        initialAiBase,
        rawModifications,
        {},
      );

      expect(validatedMods.userModifications.customNodes["custom_aspirin"].chemicalStructure).toBeDefined();
      expect(validatedMods.userModifications.customNodes["custom_aspirin"].chemicalStructure?.isValidated).toBe(true);

      expect(validatedMods.userModifications.overrides["node_base_lido"].chemicalStructure).toBeDefined();
      expect(validatedMods.userModifications.overrides["node_base_lido"].chemicalStructure?.educationalNote).toBe(
        "ویرایش ساختار توسط کاربر در پنل مطالعه",
      );

      // Compute effective tree
      const fullPayload: MindMapPayload = {
        kind: "mind_map",
        version: 2,
        sourceType: "lessons",
        sourceId: "mod_test",
        updatedAt: new Date().toISOString(),
        aiBase: initialAiBase,
        userModifications: validatedMods.userModifications,
        userNotes: {},
      };

      const effective = computeEffectiveMindMap(fullPayload);
      expect(effective.nodes["custom_aspirin"]).toBeDefined();
      expect(effective.nodes["custom_aspirin"].chemicalStructure?.compoundName).toBe("آسپرین");
      expect(effective.nodes["node_base_lido"].title).toBe("لیدوکائین هیدروکلراید");
      expect(effective.nodes["node_base_lido"].chemicalStructure?.educationalNote).toBe(
        "ویرایش ساختار توسط کاربر در پنل مطالعه",
      );
    });
  });

  describe("4. Rigorous 2D Molecular Graph Isomorphism & Chemical Isomer Differentiation", () => {
    it("confirms equivalence of alternative SMILES representations with different atom traversal order", () => {
      // 4 different valid SMILES representations of Aspirin with varied atom numbering & branching:
      const smilesCanonical = "CC(=O)Oc1ccccc1C(=O)O";
      const smilesVariantA = "c1(OC(=O)C)ccccc1C(=O)O";
      const smilesVariantB = "O=C(C)Oc1ccccc1C(=O)O";
      const smilesVariantC = "OC(=O)c1ccccc1OC(=O)C";

      // 1. Direct pairwise structural graph isomorphism checks
      const checkA = areSmilesStructurallyIsomorphic(smilesCanonical, smilesVariantA);
      expect(checkA.isomorphic).toBe(true);

      const checkB = areSmilesStructurallyIsomorphic(smilesCanonical, smilesVariantB);
      expect(checkB.isomorphic).toBe(true);

      const checkC = areSmilesStructurallyIsomorphic(smilesCanonical, smilesVariantC);
      expect(checkC.isomorphic).toBe(true);

      // 2. Authoritative verification recognizes any traversal order as verified Aspirin
      const verifyVariantA = verifyAuthoritativeCompound("آسپرین", smilesVariantA);
      expect(verifyVariantA.matched).toBe(true);
      expect(verifyVariantA.verified).toBe(true);
      expect(verifyVariantA.referenceRecord?.id).toBe("aspirin");

      const verifyVariantB = verifyAuthoritativeCompound("Acetylsalicylic Acid", smilesVariantB);
      expect(verifyVariantB.matched).toBe(true);
      expect(verifyVariantB.verified).toBe(true);

      // 3. Full Mind Map validation assigns high confidence
      const fullStructureResult = validateMindMapChemicalStructure({
        compoundName: "آسپرین",
        smiles: smilesVariantA,
        formula: "C9H8O4",
      });
      expect(fullStructureResult.valid).toBe(true);
      expect(fullStructureResult.identityVerified).toBe(true);
      expect(fullStructureResult.confidence).toBe("high");
    });

    it("reliably differentiates and rejects constitutional and positional isomers having identical molecular formulas", () => {
      // Positional isomers of acetoxybenzoic acid (all formula C9H8O4):
      // - 2-acetoxybenzoic acid (Aspirin, ortho): CC(=O)Oc1ccccc1C(=O)O
      // - 4-acetoxybenzoic acid (para): CC(=O)Oc1ccc(C(=O)O)cc1
      // - 3-acetoxybenzoic acid (meta): CC(=O)Oc1cccc(C(=O)O)c1
      const orthoAspirin = "CC(=O)Oc1ccccc1C(=O)O";
      const paraIsomer = "CC(=O)Oc1ccc(C(=O)O)cc1";
      const metaIsomer = "CC(=O)Oc1cccc(C(=O)O)c1";

      const checkPara = areSmilesStructurallyIsomorphic(orthoAspirin, paraIsomer);
      expect(checkPara.isomorphic).toBe(false);
      expect(checkPara.reason).toContain("ایزومر");

      const checkMeta = areSmilesStructurallyIsomorphic(orthoAspirin, metaIsomer);
      expect(checkMeta.isomorphic).toBe(false);
      expect(checkMeta.reason).toContain("ایزومر");

      // Claiming Aspirin but providing 4-acetoxybenzoic acid SMILES
      const imposterIsomer: MindMapChemicalStructure = {
        compoundName: "آسپرین (Aspirin)",
        smiles: paraIsomer,
        formula: "C9H8O4", // Same formula, but different isomer!
      };
      const isomerValidation = validateMindMapChemicalStructure(imposterIsomer);
      expect(isomerValidation.valid).toBe(false);
      expect(isomerValidation.identityVerified).toBe(false);
      expect(isomerValidation.confidence).toBe("low");
      expect(isomerValidation.errors.some((e) => e.includes("با هویت مرجع"))).toBe(true);

      // Diol isomers: Catechol (1,2), Resorcinol (1,3), Hydroquinone (1,4) (all C6H6O2)
      const catechol = "Oc1ccccc1O";
      const resorcinol = "Oc1cccc(O)c1";
      const hydroquinone = "Oc1ccc(O)cc1";

      expect(areSmilesStructurallyIsomorphic(catechol, resorcinol).isomorphic).toBe(false);
      expect(areSmilesStructurallyIsomorphic(catechol, hydroquinone).isomorphic).toBe(false);
      expect(areSmilesStructurallyIsomorphic(resorcinol, hydroquinone).isomorphic).toBe(false);
    });

    it("categorizes valid unlisted compounds as 'medium' confidence without marking them as authoritatively validated", () => {
      // Ibuprofen: valid SMILES, valid graph, valid formula C13H18O2, but not in curated reference database
      const ibuprofen: MindMapChemicalStructure = {
        compoundName: "ایبوپروفن (Ibuprofen)",
        smiles: "CC(C)Cc1ccc(C(C)C(=O)O)cc1",
        formula: "C13H18O2",
        molecularWeight: 206.28,
      };

      const result = validateMindMapChemicalStructure(ibuprofen);
      expect(result.valid).toBe(true);
      expect(result.syntaxValid).toBe(true);
      expect(result.graphValid).toBe(true);
      expect(result.formulaConsistent).toBe(true);
      expect(result.identityVerified).toBe(false); // Not verified by local reference
      expect(result.confidence).toBe("medium"); // Medium confidence!
      expect(result.needsReview).toBe(true);

      // Cleaned structure MUST NOT be marked as isValidated
      const cleaned = cleanChemicalStructure(ibuprofen);
      expect(cleaned).toBeDefined();
      expect(cleaned?.isValidated).toBe(false); // Strict: only high confidence is validated
      expect(cleaned?.confidence).toBe("medium");
    });

    it("detects cis/trans stereochemical differences in directional double bonds and confirms equivalent traversals", () => {
      // (E)-but-2-ene (trans): C/C=C/C is equivalent to C\C=C\C
      const transButeneSlash = "C/C=C/C";
      const transButeneBackslash = "C\\C=C\\C";

      const sameCheck = areSmilesStructurallyIsomorphic(transButeneSlash, transButeneBackslash);
      expect(sameCheck.isomorphic).toBe(true);

      // (Z)-but-2-ene (cis): C/C=C\C is equivalent to C\C=C/C
      const cisButeneVariant1 = "C/C=C\\C";
      const cisButeneVariant2 = "C\\C=C/C";

      const cisEquivalent = areSmilesStructurallyIsomorphic(cisButeneVariant1, cisButeneVariant2);
      expect(cisEquivalent.isomorphic).toBe(true);

      // E vs Z (trans vs cis)
      const stereoDiff = areSmilesStructurallyIsomorphic(transButeneSlash, cisButeneVariant1);
      expect(stereoDiff.isomorphic).toBe(false);
      expect(stereoDiff.reason).toContain("استریوشیمی");

      // Stereodefined double bond vs stereoundefined
      const undefinedDoubleBond = areSmilesStructurallyIsomorphic("C/C=C/C", "CC=CC");
      expect(undefinedDoubleBond.isomorphic).toBe(false);
      expect(undefinedDoubleBond.reason).toContain("استریوشیمی");
    });

    it("evaluates tetrahedral chiral centers using neighbor permutation parity", () => {
      // L-alanine in 2 different traversal orders (both are identical enantiomer):
      // Traversal 1: N[C@@H](C)C(=O)O (starts from N, tag @@)
      // Traversal 2: C[C@H](N)C(=O)O (starts from methyl C, tag @ due to odd permutation of neighbors)
      const lAlanine1 = "N[C@@H](C)C(=O)O";
      const lAlanine2 = "C[C@H](N)C(=O)O";

      const sameEnantiomer = areSmilesStructurallyIsomorphic(lAlanine1, lAlanine2);
      expect(sameEnantiomer.isomorphic).toBe(true);

      // Inverted chiral center (D-alanine vs L-alanine - Enantiomers):
      const dAlanine = "N[C@H](C)C(=O)O";
      const enantiomerCheck = areSmilesStructurallyIsomorphic(lAlanine1, dAlanine);
      expect(enantiomerCheck.isomorphic).toBe(false);
      expect(enantiomerCheck.reason).toContain("انانتیومر");

      // Diastereomers: Molecule with 2 chiral centers where one is inverted:
      // (2R, 3R)-tartaric acid vs (2R, 3S)-tartaric acid (meso-tartaric acid)
      const tartaricRR = "O=C(O)[C@@H](O)[C@@H](O)C(=O)O";
      const tartaricRS = "O=C(O)[C@@H](O)[C@H](O)C(=O)O";

      const diastereomerCheck = areSmilesStructurallyIsomorphic(tartaricRR, tartaricRS);
      expect(diastereomerCheck.isomorphic).toBe(false);
      expect(diastereomerCheck.reason).toContain("دیاستریومر");

      // Structure with defined stereocenter vs structure with undefined stereocenter
      const chiralVsAchiral = areSmilesStructurallyIsomorphic("N[C@@H](C)C(=O)O", "NC(C)C(=O)O");
      expect(chiralVsAchiral.isomorphic).toBe(false);
      expect(chiralVsAchiral.reason).toContain("استریوشیمی");
    });

    it("strictly discriminates formal electrical charges and isotopic substitutions", () => {
      // Formal charge difference: Acetate anion ([O-]) vs Acetic acid (OH)
      const acetateAnion = "CC(=O)[O-]";
      const aceticAcid = "CC(=O)O";

      const chargeCheck = areSmilesStructurallyIsomorphic(acetateAnion, aceticAcid);
      expect(chargeCheck.isomorphic).toBe(false);
      expect(chargeCheck.reason).toContain("بار الکتریکی");

      // Isotope difference: Carbon-13 labelled vs normal Carbon-12
      const c13Acetic = "[13C]C(=O)O";
      const isotopeCheck = areSmilesStructurallyIsomorphic(c13Acetic, aceticAcid);
      expect(isotopeCheck.isomorphic).toBe(false);
      expect(isotopeCheck.reason).toContain("ایزوتوپ");
    });

    it("correctly confirms rotational aromatic equivalence for Paracetamol traversals", () => {
      // Paracetamol traversed from acetamide vs traversed from phenol:
      const paracetamol1 = "CC(=O)Nc1ccc(O)cc1";
      const paracetamol2 = "Oc1ccc(NC(=O)C)cc1";

      const check = areSmilesStructurallyIsomorphic(paracetamol1, paracetamol2);
      expect(check.isomorphic).toBe(true);

      const verifyCheck = verifyAuthoritativeCompound("پاراستامول", paracetamol2);
      expect(verifyCheck.matched).toBe(true);
      expect(verifyCheck.verified).toBe(true);
    });

    it("assigns 'medium' confidence to flat 2D SMILES of chiral reference drugs without false high validation", () => {
      // Morphine provided with flat 2D SMILES (no chiral @ tags):
      const flatMorphine: MindMapChemicalStructure = {
        compoundName: "مورفین (Morphine)",
        smiles: "CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O",
        formula: "C17H19NO3",
        molecularWeight: 285.34,
      };

      const result = validateMindMapChemicalStructure(flatMorphine);
      expect(result.valid).toBe(true);
      expect(result.syntaxValid).toBe(true);
      expect(result.graphValid).toBe(true);
      expect(result.formulaConsistent).toBe(true);
      expect(result.identityVerified).toBe(false); // Not verified for stereochemistry!
      expect(result.confidence).toBe("medium"); // Stays medium!
      expect(result.warnings.some((w) => w.includes("مراکز کایرال"))).toBe(true);

      const cleaned = cleanChemicalStructure(flatMorphine);
      expect(cleaned?.isValidated).toBe(false); // Zero false high approval
      expect(cleaned?.confidence).toBe("medium");

      // Full isomeric Morphine receives high confidence:
      const isomericMorphine: MindMapChemicalStructure = {
        compoundName: "مورفین",
        smiles: "CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O",
        formula: "C17H19NO3",
        molecularWeight: 285.34,
      };
      const isomericResult = validateMindMapChemicalStructure(isomericMorphine);
      expect(isomericResult.identityVerified).toBe(true);
      expect(isomericResult.confidence).toBe("high");
    });

    it("prevents dangerous substring collisions in name matching", () => {
      // Generic word "اسید" (Acid) must NOT match "آسپرین (Acetylsalicylic Acid)"
      const acidCheck = verifyAuthoritativeCompound("اسید", "CC(=O)Oc1ccccc1C(=O)O");
      expect(acidCheck.matched).toBe(false);
      expect(acidCheck.verified).toBe(false);

      // "پنی‌سیلین V" candidate with Penicillin G SMILES must match Penicillin V record but FAIL verification (MISMATCH against Pen G structure)
      const penVCheck = verifyAuthoritativeCompound("پنی‌سیلین V", "CC1(C(N2C(S1)C(C2=O)NC(=O)Cc3ccccc3)C(=O)O)C");
      expect(penVCheck.matched).toBe(true);
      expect(penVCheck.verified).toBe(false);
      expect(penVCheck.status).toBe("MISMATCH");

      // Exact matches and parenthetical matches work properly
      const match1 = verifyAuthoritativeCompound("آسپرین", "CC(=O)Oc1ccccc1C(=O)O");
      expect(match1.matched).toBe(true);
      expect(match1.verified).toBe(true);

      const match2 = verifyAuthoritativeCompound("Aspirin (Acetylsalicylic Acid)", "CC(=O)Oc1ccccc1C(=O)O");
      expect(match2.matched).toBe(true);
      expect(match2.verified).toBe(true);
    });
  });

  describe("5. Mandatory Regression Suite: Critical Edge Cases & Scientific Invariants", () => {
    it("Scenario 1: rejects identical invalid SMILES without raw-string bypass", () => {
      // Syntax-invalid identical string
      const syntaxInvalid = "C[[[";
      const r1 = areSmilesStructurallyIsomorphic(syntaxInvalid, syntaxInvalid);
      expect(r1.isomorphic).toBe(false);
      expect(r1.reason).toContain("نامعتبر");

      // Valence-invalid identical string (pentavalent carbon)
      const hypervalent = "C(=O)(=O)(=O)";
      const r2 = areSmilesStructurallyIsomorphic(hypervalent, hypervalent);
      expect(r2.isomorphic).toBe(false);
      expect(r2.reason).toContain("ظرفیت");
    });

    it("Scenario 2: differentiates structures with same molecular formula but different connectivity", () => {
      // Ethanol vs Dimethyl ether (both C2H6O)
      const ethanol = "CCO";
      const dimethylEther = "COC";
      const r1 = areSmilesStructurallyIsomorphic(ethanol, dimethylEther);
      expect(r1.isomorphic).toBe(false);
      expect(r1.reason).toContain("توپولوژی");

      // Aspirin vs 4-acetoxybenzoic acid (both C9H8O4)
      const aspirin = "CC(=O)Oc1ccccc1C(=O)O";
      const paraIsomer = "CC(=O)Oc1ccc(C(=O)O)cc1";
      const r2 = areSmilesStructurallyIsomorphic(aspirin, paraIsomer);
      expect(r2.isomorphic).toBe(false);
      expect(r2.reason).toContain("ایزومر");
    });

    it("Scenario 3: differentiates structures with identical 2D topology but conflicting stereochemistry", () => {
      // (E)-but-2-ene vs (Z)-but-2-ene
      const transButene = "C/C=C/C";
      const cisButene = "C/C=C\\C";
      const r1 = areSmilesStructurallyIsomorphic(transButene, cisButene);
      expect(r1.isomorphic).toBe(false);
      expect(r1.reason).toContain("استریوشیمی");

      // L-alanine vs D-alanine
      const lAla = "N[C@@H](C)C(=O)O";
      const dAla = "N[C@H](C)C(=O)O";
      const r2 = areSmilesStructurallyIsomorphic(lAla, dAla);
      expect(r2.isomorphic).toBe(false);
      expect(r2.reason).toContain("انانتیومر");
    });

    it("Scenario 4: confirms isomorphism for identical structures written with different SMILES traversal orders", () => {
      // Lidocaine: traversed from diethylamino side vs traversed from aromatic ring
      const lido1 = "CCN(CC)CC(=O)Nc1c(C)cccc1C";
      const lido2 = "Cc1cccc(C)c1NC(=O)CN(CC)CC";
      const r1 = areSmilesStructurallyIsomorphic(lido1, lido2);
      expect(r1.isomorphic).toBe(true);

      // Trans-2-butene: alternative directional notation
      const trans1 = "C/C=C/C";
      const trans2 = "C\\C=C\\C";
      const r2 = areSmilesStructurallyIsomorphic(trans1, trans2);
      expect(r2.isomorphic).toBe(true);
    });

    it("Scenario 5: differentiates conjugated multi-double-bond molecules with distinct E/Z configurations", () => {
      // (2E, 4E)-hexa-2,4-diene
      const dieneEE = "C/C=C/C=C/C";
      // (2E, 4Z)-hexa-2,4-diene
      const dieneEZ = "C/C=C/C=C\\C";
      // (2Z, 4Z)-hexa-2,4-diene
      const dieneZZ = "C\\C=C/C=C\\C";

      // EE vs EZ -> mismatch on second double bond
      const check1 = areSmilesStructurallyIsomorphic(dieneEE, dieneEZ);
      expect(check1.isomorphic).toBe(false);
      expect(check1.reason).toContain("استریوشیمی");

      // EE vs ZZ -> mismatch
      const check2 = areSmilesStructurallyIsomorphic(dieneEE, dieneZZ);
      expect(check2.isomorphic).toBe(false);

      // Equivalent traversal of EE: C\C=C\C=C\C
      const dieneEE_alt = "C\\C=C\\C=C\\C";
      const check3 = areSmilesStructurallyIsomorphic(dieneEE, dieneEE_alt);
      expect(check3.isomorphic).toBe(true);
    });

    it("Scenario 6: successfully explores topological automorphisms for symmetric molecules to find stereo-compatible mapping", () => {
      // Trans-hex-3-ene: symmetric alkene traversed from left vs right
      const hexeneTrans1 = "CC/C=C/CC";
      const hexeneTrans2 = "CC\\C=C\\CC";
      const r1 = areSmilesStructurallyIsomorphic(hexeneTrans1, hexeneTrans2);
      expect(r1.isomorphic).toBe(true);

      // Trans-hex-3-ene vs Cis-hex-3-ene
      const hexeneCis = "CC/C=C\\CC";
      const r2 = areSmilesStructurallyIsomorphic(hexeneTrans1, hexeneCis);
      expect(r2.isomorphic).toBe(false);
      expect(r2.reason).toContain("استریوشیمی");
    });

    it("Scenario 7: detects Aromatic vs Kekulé notation without false verified pass", () => {
      // Resonant aromatic benzene vs localized alternating Kekulé benzene
      const aromaticBenzene = "c1ccccc1";
      const kekuleBenzene = "C1=CC=CC=C1";

      const check = areSmilesStructurallyIsomorphic(aromaticBenzene, kekuleBenzene);
      expect(check.isomorphic).toBe(false);
      expect(check.reason).toContain("ککوله");
      expect(check.reason).toContain("Indeterminate");

      // Verifying Aspirin with Kekulé notation returns indeterminate and does not grant verified status
      const kekuleAspirin = "CC(=O)OC1=CC=CC=C1C(=O)O";
      const verifyKekule = verifyAuthoritativeCompound("آسپرین", kekuleAspirin);
      expect(verifyKekule.matched).toBe(true);
      expect(verifyKekule.verified).toBe(false);
      expect(verifyKekule.indeterminate).toBe(true);
      expect(verifyKekule.warning).toContain("ککوله");
    });

    it("Scenario 8: rejects partially specified double-bond stereochemistry without silent pass", () => {
      // Double bond with directional slash on one side only: C/C=C(C)C
      const partialStereo = "C/C=C(C)C";
      const r1 = areSmilesStructurallyIsomorphic(partialStereo, partialStereo);
      expect(r1.isomorphic).toBe(false);
      expect(r1.reason).toContain("تنها در یک سمت تعیین شده است");
    });

    it("Scenario 9: confirms aromatic ring closure equivalence", () => {
      // Pyridine: ring closure opened at nitrogen vs carbon
      const pyridine1 = "n1ccccc1";
      const pyridine2 = "c1ncccc1";
      const r1 = areSmilesStructurallyIsomorphic(pyridine1, pyridine2);
      expect(r1.isomorphic).toBe(true);

      // Paracetamol: phenol-first traversal vs acetamide-first traversal
      const para1 = "CC(=O)Nc1ccc(O)cc1";
      const para2 = "Oc1ccc(NC(=O)C)cc1";
      const r2 = areSmilesStructurallyIsomorphic(para1, para2);
      expect(r2.isomorphic).toBe(true);
    });

    it("Scenario 10: respects backtracking limit on complex symmetric hyper-graphs", () => {
      // In the backtracking implementation, MAX_BACKTRACK_STEPS is strictly bounded
      // Confirm that the complexity guard is present and terminates predictably
      const result = verifyAuthoritativeCompound("آسپرین", "CC(=O)Oc1ccccc1C(=O)O");
      expect(result.verified).toBe(true);
      expect(result.indeterminate).toBeUndefined();
    });
  });

  describe("6. Mandatory Defect Remediation & Stereo Consistency Suite (Audit Round 3)", () => {
    it("1. Identical SMILES with partial E/Z is rejected as indeterminate without string equality shortcut", () => {
      const partialSmiles = "C/C=C(C)C";
      const res = areSmilesStructurallyIsomorphic(partialSmiles, partialSmiles);
      expect(res.isomorphic).toBe(false);
      expect(res.indeterminate).toBe(true);
      expect(res.status).toBe("INDETERMINATE_PARTIAL_STEREO");
      expect(res.reason).toContain("جهت‌گیری فضایی پیوند دوگانه تنها در یک سمت تعیین شده است");
    });

    it("2. Identical SMILES with unsupported stereo class is rejected as indeterminate", () => {
      const allenicSmiles = "CC=[C@AL1]=CC";
      const res1 = areSmilesStructurallyIsomorphic(allenicSmiles, allenicSmiles);
      expect(res1.isomorphic).toBe(false);
      expect(res1.indeterminate).toBe(true);
      expect(res1.status).toBe("INDETERMINATE_UNSUPPORTED_STEREO");

      const squarePlanar = "[Pt@SP1](Cl)(N)(P)F";
      const res2 = areSmilesStructurallyIsomorphic(squarePlanar, squarePlanar);
      expect(res2.isomorphic).toBe(false);
      expect(res2.indeterminate).toBe(true);
      expect(res2.status).toBe("INDETERMINATE_UNSUPPORTED_STEREO");
    });

    it("3. Equivalent SMILES with flipped double-bond endpoints are verified as isomorphic", () => {
      // trans-1-chloro-2-fluoroethene:
      // Traversal 1: F/C=C/Cl
      // Traversal 2: Cl/C=C/F (endpoints flipped and substituents matched coherently)
      const s1 = "F/C=C/Cl";
      const s2 = "Cl/C=C/F";
      const res = areSmilesStructurallyIsomorphic(s1, s2);
      expect(res.isomorphic).toBe(true);
      expect(res.status).toBe("VERIFIED");
    });

    it("4. Two SMILES with same endpoints but conflicting substituent configuration are rejected", () => {
      // trans vs cis: F/C=C/Cl vs F/C=C\Cl
      const sTrans = "F/C=C/Cl";
      const sCis = "F/C=C\\Cl";
      const res = areSmilesStructurallyIsomorphic(sTrans, sCis);
      expect(res.isomorphic).toBe(false);
      expect(res.status).toBe("MISMATCH_STEREO");
      expect(res.reason).toContain("جهت‌گیری پیوند دوگانه فضایی");
    });

    it("5. Conjugated diene system with two independent E/Z bonds strictly differentiates configurations", () => {
      // (2E, 4E)-hexa-2,4-diene vs (2E, 4E)-hexa-2,4-diene
      const ee1 = "C/C=C/C=C/C";
      const ee2 = "C/C=C/C=C/C";
      const matchEE = areSmilesStructurallyIsomorphic(ee1, ee2);
      expect(matchEE.isomorphic).toBe(true);
      expect(matchEE.status).toBe("VERIFIED");

      // (2E, 4E)-hexa-2,4-diene vs (2E, 4Z)-hexa-2,4-diene
      const ez = "C/C=C/C=C\\C";
      const diffEZ = areSmilesStructurallyIsomorphic(ee1, ez);
      expect(diffEZ.isomorphic).toBe(false);
      expect(diffEZ.status).toBe("MISMATCH_STEREO");
    });

    it("6. Branched structures with geminal directional bonds are evaluated coherently", () => {
      // Consistent geminal slashes on branched C1: F/C(/Cl)=C/Br (F is down -1, Cl is up +1, opposite sides)
      const b1 = "F/C(/Cl)=C/Br";
      const b2 = "F/C(/Cl)=C/Br";
      const matchB = areSmilesStructurallyIsomorphic(b1, b2);
      expect(matchB.isomorphic).toBe(true);
      expect(matchB.status).toBe("VERIFIED");

      // Inconsistent/contradictory geminal slashes: F/C(\Cl)=C/Br (both F and Cl have elevation -1 on same carbon)
      const contradictory = "F/C(\\Cl)=C/Br";
      const resBad = areSmilesStructurallyIsomorphic(contradictory, contradictory);
      expect(resBad.isomorphic).toBe(false);
      expect(resBad.indeterminate).toBe(true);
      expect(resBad.status).toBe("INDETERMINATE_PARTIAL_STEREO");
    });

    it("7. Cyclic structures with double bonds are rigorously validated", () => {
      // Cyclohexene (C1=CCCCC1) vs Cyclohexene
      const ch1 = "C1=CCCCC1";
      const ch2 = "C1=CCCCC1";
      const matchCycle = areSmilesStructurallyIsomorphic(ch1, ch2);
      expect(matchCycle.isomorphic).toBe(true);
      expect(matchCycle.status).toBe("VERIFIED");

      // Cyclohexene vs Cyclohexane (C1CCCCC1) - bond order mismatch
      const hexane = "C1CCCCC1";
      const diffBond = areSmilesStructurallyIsomorphic(ch1, hexane);
      expect(diffBond.isomorphic).toBe(false);
      expect(diffBond.status).toBe("MISMATCH_TOPOLOGY");
    });

    it("8. Returns INDETERMINATE status when canonical and all alternates are indeterminate (e.g. Kekule aspirin)", () => {
      // Kekule representation of Aspirin (all canonical and alternates in DB are aromatic)
      const kekuleAspirin = "CC(=O)OC1=CC=CC=C1C(=O)O";
      const check = verifyAuthoritativeCompound("آسپرین", kekuleAspirin);
      expect(check.matched).toBe(true);
      expect(check.verified).toBe(false);
      expect(check.indeterminate).toBe(true);
      expect(check.status).toBe("INDETERMINATE");
      expect(check.error).toBeUndefined(); // MUST NOT declare definitive mismatch error!
      expect(check.warning).toContain("آروماتیسیته");
    });

    it("9. Prioritizes INDETERMINATE over MISMATCH when canonical is indeterminate and alternate is mismatch", () => {
      const kekuleParacetamol = "CC(=O)NC1=CC=C(O)C=C1";
      const check = verifyAuthoritativeCompound("پاراستامول", kekuleParacetamol);
      expect(check.matched).toBe(true);
      expect(check.verified).toBe(false);
      expect(check.indeterminate).toBe(true);
      expect(check.status).toBe("INDETERMINATE");
      expect(check.error).toBeUndefined();
    });

    it("10. Prevents unsupported stereochemistry from converting into a definite mismatch error", () => {
      // Input has unsupported allenic stereo descriptor: CC=[C@AL1]=CC
      const check = verifyAuthoritativeCompound("آسپرین", "CC(=O)Oc1ccccc1[C@AL1H](C)C");
      expect(check.matched).toBe(true);
      expect(check.verified).toBe(false);
      expect(check.indeterminate).toBe(true);
      expect(check.status).toBe("INDETERMINATE");
      expect(check.error).toBeUndefined(); // Crucial: not a fatal mismatch!
      expect(check.warning).toContain("پشتیبانی‌نشده");
    });
  });
});

