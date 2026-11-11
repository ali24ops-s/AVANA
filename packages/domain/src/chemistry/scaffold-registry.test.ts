import { describe, it, expect } from "vitest";
import {
  AUTHORITATIVE_SCAFFOLD_REGISTRY,
  PENDING_SCAFFOLD_REGISTRY,
  AMINO_CYCLITOL_SUBFAMILY_CORES,
  hasGenericScaffold,
  findMatchingScaffold,
  getScaffoldsForFamily,
  getAllActiveScaffolds,
  type AuthoritativeScaffoldRecord,
} from "./scaffold-registry.js";
import {
  parseSmilesToGraph,
  validateMolecularGraphValence,
  parseMolecularFormula,
} from "./chemical-validation.js";
import { cleanChemicalStructure } from "../mind-map.js";
import { verifyAuthoritativeCompound } from "./reference-compounds.js";
import type { MindMapChemicalStructure } from "@avana/contracts";

describe("Authoritative Generic Scaffold & Reference Core Registry Suite (Phase 1 Refinement)", () => {
  describe("1. Contract & Domain Sanitizer (cleanChemicalStructure) Invariants", () => {
    it("accepts 'generic_scaffold' as a valid relationType", () => {
      const input: MindMapChemicalStructure = {
        compoundName: "اسکلت انتزاعی",
        smiles: "C1=CC2=C(C=C1F)C(=O)C(=CN2)C(=O)O",
        relationType: "generic_scaffold",
      };
      const cleaned = cleanChemicalStructure(input);
      expect(cleaned).toBeDefined();
      expect(cleaned?.relationType).toBe("generic_scaffold");
    });

    it("accepts 'reference_core_compound' as a valid relationType", () => {
      const input: MindMapChemicalStructure = {
        compoundName: "6-APA",
        smiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)N)C(=O)O)C",
        relationType: "reference_core_compound",
      };
      const cleaned = cleanChemicalStructure(input);
      expect(cleaned).toBeDefined();
      expect(cleaned?.relationType).toBe("reference_core_compound");
    });

    it("accepts 'representative_compound' as a valid relationType", () => {
      const input: MindMapChemicalStructure = {
        compoundName: "Sancycline",
        smiles: "CN(C)[C@H]1[C@@H]2C[C@@H]3CC4=C(C(=CC=C4)O)C(=C3C(=O)[C@@]2(C(=C(C1=O)C(=O)N)O)O)O",
        relationType: "representative_compound",
      };
      const cleaned = cleanChemicalStructure(input);
      expect(cleaned).toBeDefined();
      expect(cleaned?.relationType).toBe("representative_compound");
    });

    it("rejects and strips unrecognized/bogus relationTypes without throwing errors", () => {
      const input = {
        compoundName: "Test Compound",
        smiles: "CC(=O)O",
        relationType: "bogus_unrecognized_relation_type",
      } as unknown as MindMapChemicalStructure;
      const cleaned = cleanChemicalStructure(input);
      expect(cleaned).toBeDefined();
      expect(cleaned?.relationType).toBeUndefined();
    });

    it("preserves legacy chemical structures with existing relationTypes with zero regression", () => {
      const legacyTypes = [
        "primary_structure",
        "class_member",
        "combination_component",
        "example_of",
        "mechanism_related",
        "sar_related",
        "mentioned_in",
        "related_chemical",
        "sar_reference",
      ] as const;

      for (const relType of legacyTypes) {
        const input: MindMapChemicalStructure = {
          compoundName: "Acetaminophen",
          smiles: "CC(=O)Nc1ccc(O)cc1",
          relationType: relType,
        };
        const cleaned = cleanChemicalStructure(input);
        expect(cleaned?.relationType).toBe(relType);
      }
    });
  });

  describe("2. Conceptual Separation & Rigorous Record Classification Invariants", () => {
    it("classifies Sancycline as a representative_compound (NOT a universal generic scaffold)", () => {
      const sancycline = findMatchingScaffold("Sancycline");
      expect(sancycline).toBeDefined();
      expect(sancycline?.relationType).toBe("representative_compound");
      expect(sancycline?.applicableFamily).toBe("Tetracyclines");
      expect(sancycline?.scientificNotes).toContain("representative");
      expect(sancycline?.scientificNotes).toContain("NOT an abstract universal scaffold");
    });

    it("restricts (-)-Erythronolide B strictly to 14-membered macrolides", () => {
      const erythronolide = findMatchingScaffold("Erythronolide B");
      expect(erythronolide).toBeDefined();
      expect(erythronolide?.relationType).toBe("reference_core_compound");
      expect(erythronolide?.applicableFamily).toBe("Macrolides");
      expect(erythronolide?.applicableSubfamily).toContain("14-membered");
      expect(erythronolide?.scientificNotes).toContain("Does NOT represent 15-membered");
    });

    it("restricts 7-ACA and 7-ADCA to their specific cephalosporin subfamilies", () => {
      const aca = findMatchingScaffold("7-ACA");
      expect(aca).toBeDefined();
      expect(aca?.applicableSubfamily).toContain("3-acetoxymethyl");

      const adca = findMatchingScaffold("7-ADCA");
      expect(adca).toBeDefined();
      expect(adca?.applicableSubfamily).toContain("3-methyl");
    });

    it("restricts Sulfanilamide strictly to antibacterial sulfonamides (DHPS inhibitors)", () => {
      const sulf = findMatchingScaffold("Sulfanilamide");
      expect(sulf).toBeDefined();
      expect(sulf?.applicableSubfamily).toContain("Antibacterial");
      expect(sulf?.scientificNotes).toContain("does NOT represent non-antibacterial sulfonamide drugs");
    });

    it("classifies Fluoroquinolone core and Carbapenem core as real reference_core_compounds with explicit substitution sites", () => {
      const fq = findMatchingScaffold("Fluoroquinolone core");
      expect(fq?.relationType).toBe("reference_core_compound");
      expect(fq?.pubChemCid).toBe(721205);
      expect(fq?.substitutionSites).toBeDefined();
      expect(fq?.substitutionSites?.map((s) => s.position)).toContain("N-1");
      expect(fq?.substitutionSites?.map((s) => s.position)).toContain("C-7");

      const carb = findMatchingScaffold("Carbapenem nucleus");
      expect(carb?.relationType).toBe("reference_core_compound");
      expect(carb?.pubChemCid).toBe(441133);
      expect(carb?.substitutionSites).toBeDefined();
      expect(carb?.substitutionSites?.map((s) => s.position)).toContain("C-6");
      expect(carb?.substitutionSites?.map((s) => s.position)).toContain("C-2");
    });
  });

  describe("3. Authoritative Scaffold Registry Structural & Scientific Validation", () => {
    it("contains exactly 8 actively verified records", () => {
      expect(AUTHORITATIVE_SCAFFOLD_REGISTRY).toHaveLength(8);
      expect(getAllActiveScaffolds()).toHaveLength(8);
    });

    it.each(AUTHORITATIVE_SCAFFOLD_REGISTRY)(
      "rigorously validates $canonicalName ($pubChemCid)",
      (record: AuthoritativeScaffoldRecord) => {
        // PubChem CID validity
        expect(record.pubChemCid).toBeGreaterThan(0);
        expect(Number.isInteger(record.pubChemCid)).toBe(true);

        // Verification Status & Explicit Provenance Level
        expect(record.verificationStatus).toBe("VERIFIED");
        expect(record.identityVerificationLevel).toBe("PUBCHEM_CURATED_AND_GRAPH_VALIDATED");

        // Relation Type validity
        expect(["generic_scaffold", "reference_core_compound", "representative_compound"]).toContain(
          record.relationType
        );

        // InChIKey validity (standard 27-character format: 14 chars + '-' + 10 chars + '-' + 1 char)
        expect(record.inChIKey).toMatch(/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/);

        // Provenance metadata
        expect(record.sourceDatabase).toBe("PubChem");
        expect(record.sourceId).toBe(record.pubChemCid);
        expect(record.sourceUrl).toContain(String(record.pubChemCid));
        expect(record.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(record.sourceIdentityStatus).toBe("PUBCHEM_CROSS_VERIFIED");
        expect(record.graphValidationStatus).toBe("SYNTAX_AND_VALENCE_VALID");

        // Parse formula & verify heavy atom composition
        const formulaResult = parseMolecularFormula(record.formula);
        expect(formulaResult).not.toBeNull();

        // Parse SMILES to molecular graph
        const isomericGraph = parseSmilesToGraph(record.isomericSmiles);
        expect(isomericGraph).not.toBeNull();
        expect(isomericGraph!.atoms.length).toBeGreaterThan(0);

        // Valence check
        const valenceCheck = validateMolecularGraphValence(isomericGraph!);
        expect(valenceCheck.valid).toBe(true);
        expect(valenceCheck.errors).toHaveLength(0);

        // Heavy atom count correspondence: non-H atoms in formula == graph atoms
        let expectedHeavyAtoms = 0;
        for (const [element, count] of Object.entries(formulaResult!.counts)) {
          if (element !== "H") {
            expectedHeavyAtoms += count;
          }
        }
        expect(isomericGraph!.atoms.length).toBe(expectedHeavyAtoms);

        // Canonical SMILES must also parse cleanly
        const canonicalGraph = parseSmilesToGraph(record.canonicalSmiles);
        expect(canonicalGraph).not.toBeNull();
        expect(canonicalGraph!.atoms.length).toBe(expectedHeavyAtoms);

        // Scientific notes and aliases check
        expect(record.scientificNotes.length).toBeGreaterThan(15);
        expect(record.aliases.length).toBeGreaterThan(0);
      }
    );
  });

  describe("4. Aminoglycosides & Subfamily Invariant Validation", () => {
    it("strictly returns false for hasGenericScaffold on Aminoglycosides (Persian & English)", () => {
      expect(hasGenericScaffold("Aminoglycosides")).toBe(false);
      expect(hasGenericScaffold("aminoglycosides")).toBe(false);
      expect(hasGenericScaffold("aminoglycoside")).toBe(false);
      expect(hasGenericScaffold("آمینوگلیکوزیدها")).toBe(false);
      expect(hasGenericScaffold("آمینوگلیکوزید")).toBe(false);
    });

    it("verifies the sub-family representative aminocyclitol cores (2-Deoxystreptamine and Streptidine)", () => {
      expect(AMINO_CYCLITOL_SUBFAMILY_CORES).toHaveLength(2);

      for (const core of AMINO_CYCLITOL_SUBFAMILY_CORES) {
        expect(["reference_core_compound", "representative_compound"]).toContain(core.relationType);
        expect(core.applicableFamily).toBe("Aminoglycosides");
        expect(core.verificationStatus).toBe("VERIFIED");
        expect(core.identityVerificationLevel).toBe("PUBCHEM_CURATED_AND_GRAPH_VALIDATED");
        expect(core.sourceDatabase).toBe("PubChem");
        expect(core.sourceIdentityStatus).toBe("PUBCHEM_CROSS_VERIFIED");
        expect(core.graphValidationStatus).toBe("SYNTAX_AND_VALENCE_VALID");
        expect(core.inChIKey).toMatch(/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/);

        const graph = parseSmilesToGraph(core.isomericSmiles);
        expect(graph).not.toBeNull();

        const valence = validateMolecularGraphValence(graph!);
        expect(valence.valid).toBe(true);
        expect(valence.errors).toHaveLength(0);

        const formulaResult = parseMolecularFormula(core.formula);
        expect(formulaResult).not.toBeNull();
        let expectedHeavyAtoms = 0;
        for (const [elem, cnt] of Object.entries(formulaResult!.counts)) {
          if (elem !== "H") expectedHeavyAtoms += cnt;
        }
        expect(graph!.atoms.length).toBe(expectedHeavyAtoms);
      }
    });
  });

  describe("5. Benzodiazepine Quarantined Status Invariant", () => {
    it("keeps Benzodiazepine core in PENDING_SCAFFOLD_REGISTRY and out of active registry", () => {
      const activeCids = AUTHORITATIVE_SCAFFOLD_REGISTRY.map((r) => r.pubChemCid);
      expect(activeCids).not.toContain(140137);

      expect(PENDING_SCAFFOLD_REGISTRY).toHaveLength(1);
      const bzd = PENDING_SCAFFOLD_REGISTRY[0];
      expect(bzd.pubChemCid).toBe(140137);
      expect(bzd.verificationStatus).toBe("PENDING_VERIFICATION");
      expect(bzd.identityVerificationLevel).toBe("PENDING_INDEPENDENT_AUDIT");
      expect(bzd.sourceIdentityStatus).toBe("PENDING_EXTERNAL_AUDIT");
      expect(bzd.graphValidationStatus).toBe("SYNTAX_AND_VALENCE_VALID");
      expect(bzd.applicableFamily).toBe("Benzodiazepines");
    });

    it("returns false for hasGenericScaffold on Benzodiazepines until promoted", () => {
      expect(hasGenericScaffold("Benzodiazepines")).toBe(false);
      expect(hasGenericScaffold("benzodiazepine")).toBe(false);
      expect(hasGenericScaffold("بنزودیازپین‌ها")).toBe(false);
      expect(hasGenericScaffold("بنزودیازپین")).toBe(false);
    });

    it("findMatchingScaffold does not return quarantined pending scaffolds", () => {
      expect(findMatchingScaffold("140137")).toBeUndefined();
      expect(findMatchingScaffold("1H-1,4-Benzodiazepine")).toBeUndefined();
    });
  });

  describe("6. Scaffold Lookup & Retrieval Helper Functions", () => {
    it("correctly identifies families with active generic scaffolds / reference cores", () => {
      expect(hasGenericScaffold("Penicillins")).toBe(true);
      expect(hasGenericScaffold("پنی‌سیلین‌ها")).toBe(true);
      expect(hasGenericScaffold("Cephalosporins")).toBe(true);
      expect(hasGenericScaffold("سفالوسپورین‌ها")).toBe(true);
      expect(hasGenericScaffold("Sulfonamides")).toBe(true);
      expect(hasGenericScaffold("سولفونامیدها")).toBe(true);
      expect(hasGenericScaffold("Tetracyclines")).toBe(true);
      expect(hasGenericScaffold("تتراسایکلین‌ها")).toBe(true);
      expect(hasGenericScaffold("Fluoroquinolones")).toBe(true);
      expect(hasGenericScaffold("فلوروکینولون‌ها")).toBe(true);
      expect(hasGenericScaffold("Carbapenems")).toBe(true);
      expect(hasGenericScaffold("کارباپنم‌ها")).toBe(true);
      expect(hasGenericScaffold("Macrolides")).toBe(true);
      expect(hasGenericScaffold("ماکرولیدها")).toBe(true);
    });

    it("finds matching scaffolds by alias, canonical name, and PubChem CID", () => {
      // By alias
      const pen = findMatchingScaffold("6-APA");
      expect(pen).toBeDefined();
      expect(pen?.pubChemCid).toBe(11082);

      // By Persian name
      const ceph = findMatchingScaffold("سفالوسپورین‌ها");
      expect(ceph).toBeDefined();
      expect(ceph?.applicableFamily).toBe("Cephalosporins");

      // By CID
      const fq = findMatchingScaffold("721205");
      expect(fq).toBeDefined();
      expect(fq?.canonicalName).toBe("6-Fluoro-4-oxo-1,4-dihydroquinoline-3-carboxylic acid");

      // By Carbapenem
      const carb = findMatchingScaffold("کارباپنم‌ها");
      expect(carb).toBeDefined();
      expect(carb?.pubChemCid).toBe(441133);

      // By Macrolides / Erythronolide B
      const mac = findMatchingScaffold("Erythronolide B");
      expect(mac).toBeDefined();
      expect(mac?.pubChemCid).toBe(441113);
    });

    it("retrieves multiple scaffolds for families with subfamilies (Cephalosporins: 7-ACA and 7-ADCA)", () => {
      const cephScaffolds = getScaffoldsForFamily("Cephalosporins");
      expect(cephScaffolds).toHaveLength(2);
      const names = cephScaffolds.map((s) => s.canonicalName);
      expect(names).toContain("7-Aminocephalosporanic acid");
      expect(names).toContain("7-Aminodesacetoxycephalosporanic acid");
    });

    it("returns empty array for unknown or unmatched family names", () => {
      expect(getScaffoldsForFamily("UnknownNonexistentDrugFamily")).toEqual([]);
      expect(findMatchingScaffold("UnknownMolecule123")).toBeUndefined();
    });
  });

  describe("7. Separation of PubChem Reference Compounds from Abstract Generic Scaffolds & Provenance Decoupling", () => {
    it("ensures real PubChem compounds are never mistaken for abstract un-substituted scaffolds", () => {
      for (const record of AUTHORITATIVE_SCAFFOLD_REGISTRY) {
        // Must have real molecular formula and positive molecular weight
        expect(record.formula).toMatch(/^[A-Z][A-Za-z0-9]*$/);
        expect(record.molecularWeight).toBeGreaterThan(50);

        // If it defines variable substitution sites, it must NOT be classified as generic_scaffold
        if (record.substitutionSites && record.substitutionSites.length > 0) {
          expect(["reference_core_compound", "representative_compound"]).toContain(record.relationType);
          expect(record.relationType).not.toBe("generic_scaffold");
          for (const site of record.substitutionSites) {
            expect(site.position).toBeTruthy();
            expect(site.description).toBeTruthy();
          }
        }
      }
    });

    it("preserves exact PubChem reference identifiers (CID, SMILES, InChIKey, formula) for all records", () => {
      const fq = findMatchingScaffold("721205");
      expect(fq?.canonicalSmiles).toBe("C1=CC2=C(C=C1F)C(=O)C(=CN2)C(=O)O");
      expect(fq?.inChIKey).toBe("KCEJQAATYWQMMQ-UHFFFAOYSA-N");
      expect(fq?.formula).toBe("C10H6FNO3");

      const carb = findMatchingScaffold("441133");
      expect(carb?.isomericSmiles).toBe("C1C=C(N2[C@H]1CC2=O)C(=O)O");
      expect(carb?.inChIKey).toBe("BSIMZHVOQZIAOY-SCSAIBSYSA-N");
      expect(carb?.formula).toBe("C7H7NO3");
    });

    it("demonstrates independence of Source Identity from Graph Validation", () => {
      // 1. Fully verified record has BOTH source identity confirmed AND graph validated
      const activeRecord = AUTHORITATIVE_SCAFFOLD_REGISTRY[0];
      expect(activeRecord.sourceIdentityStatus).toBe("PUBCHEM_CROSS_VERIFIED");
      expect(activeRecord.graphValidationStatus).toBe("SYNTAX_AND_VALENCE_VALID");

      // 2. Quarantined record (Benzodiazepine CID 140137) has graph validated, but source identity pending audit
      const pendingRecord = PENDING_SCAFFOLD_REGISTRY[0];
      expect(pendingRecord.graphValidationStatus).toBe("SYNTAX_AND_VALENCE_VALID");
      expect(pendingRecord.sourceIdentityStatus).toBe("PENDING_EXTERNAL_AUDIT");
      expect(pendingRecord.identityVerificationLevel).toBe("PENDING_INDEPENDENT_AUDIT");

      // Neither status substitutes for the other: graph validity alone does NOT grant PUBCHEM_CROSS_VERIFIED
      expect(pendingRecord.sourceIdentityStatus).not.toBe("PUBCHEM_CROSS_VERIFIED");
    });

    it("retains backward compatibility: legacy records without new fields remain validly processed", () => {
      const legacyPayload: MindMapChemicalStructure = {
        compoundName: "Ciprofloxacin",
        smiles: "C1CC1N2C=C(C(=O)C3=CC(=C(C=C32)N4CCNCC4)F)C(=O)O",
        formula: "C17H18FN3O3",
        molecularWeight: 331.34,
        relationType: "primary_structure",
      };

      const cleaned = cleanChemicalStructure(legacyPayload);
      expect(cleaned).toBeDefined();
      expect(cleaned?.compoundName).toBe("Ciprofloxacin");
      expect(cleaned?.relationType).toBe("primary_structure");
      expect(cleaned?.formula).toBe("C17H18FN3O3");
    });

    it("cleans and preserves valid reference compounds with relationType without data loss", () => {
      const corePayload: MindMapChemicalStructure = {
        compoundName: "اسکلت فلوروکینولون (ترکیب مرجع)",
        smiles: "C1=CC2=C(C=C1F)C(=O)C(=CN2)C(=O)O",
        relationType: "reference_core_compound",
        formula: "C10H6FNO3",
        molecularWeight: 207.16,
      };

      const cleaned = cleanChemicalStructure(corePayload);
      expect(cleaned).toBeDefined();
      expect(cleaned?.relationType).toBe("reference_core_compound");
      expect(cleaned?.smiles).toBe("C1=CC2=C(C=C1F)C(=O)C(=CN2)C(=O)O");
      expect(cleaned?.formula).toBe("C10H6FNO3");
    });
  });

  describe("8. Phase 2A Stereochemistry Guard & Source Identity Decoupling Invariants", () => {
    it("rigorously verifies 6-APA, 7-ACA, and 7-ADCA with full isomeric stereochemistry as VERIFIED", () => {
      // 6-APA Isomeric
      const verify6apa = verifyAuthoritativeCompound("6-APA", "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)N)C(=O)O)C");
      expect(verify6apa.matched).toBe(true);
      expect(verify6apa.verified).toBe(true);
      expect(verify6apa.status).toBe("VERIFIED");
      expect(verify6apa.scaffoldRecord?.id).toBe("scaffold_penicillins_6apa");

      // 7-ACA Isomeric
      const verify7aca = verifyAuthoritativeCompound("7-ACA", "CC(=O)OCC1=C(N2[C@@H]([C@@H](C2=O)N)SC1)C(=O)O");
      expect(verify7aca.matched).toBe(true);
      expect(verify7aca.verified).toBe(true);
      expect(verify7aca.status).toBe("VERIFIED");
      expect(verify7aca.scaffoldRecord?.id).toBe("scaffold_cephalosporins_7aca");

      // 7-ADCA Isomeric
      const verify7adca = verifyAuthoritativeCompound("7-ADCA", "CC1=C(N2[C@@H]([C@@H](C2=O)N)SC1)C(=O)O");
      expect(verify7adca.matched).toBe(true);
      expect(verify7adca.verified).toBe(true);
      expect(verify7adca.status).toBe("VERIFIED");
      expect(verify7adca.scaffoldRecord?.id).toBe("scaffold_cephalosporins_7adca");
    });

    it("strictly returns MEDIUM_CONFIDENCE_FLAT_2D (verified: false) for Flat SMILES of chiral cores (6-APA, 7-ACA, 7-ADCA)", () => {
      // 6-APA Flat
      const flat6apa = verifyAuthoritativeCompound("6-APA", "CC1(C(N2C(S1)C(C2=O)N)C(=O)O)C");
      expect(flat6apa.matched).toBe(true);
      expect(flat6apa.verified).toBe(false);
      expect(flat6apa.status).toBe("MEDIUM_CONFIDENCE_FLAT_2D");

      // 7-ACA Flat
      const flat7aca = verifyAuthoritativeCompound("7-ACA", "CC(=O)OCC1=C(N2C(C(C2=O)N)SC1)C(=O)O");
      expect(flat7aca.matched).toBe(true);
      expect(flat7aca.verified).toBe(false);
      expect(flat7aca.status).toBe("MEDIUM_CONFIDENCE_FLAT_2D");

      // 7-ADCA Flat
      const flat7adca = verifyAuthoritativeCompound("7-ADCA", "CC1=C(N2C(C(C2=O)N)SC1)C(=O)O");
      expect(flat7adca.matched).toBe(true);
      expect(flat7adca.verified).toBe(false);
      expect(flat7adca.status).toBe("MEDIUM_CONFIDENCE_FLAT_2D");
    });

    it("strictly prevents MEDIUM_CONFIDENCE_FLAT_2D from receiving isValidated: true in cleanChemicalStructure", () => {
      const flatPayload: MindMapChemicalStructure = {
        compoundName: "6-APA",
        smiles: "CC1(C(N2C(S1)C(C2=O)N)C(=O)O)C",
        relationType: "reference_core_compound",
      };

      const cleaned = cleanChemicalStructure(flatPayload);
      expect(cleaned).toBeDefined();
      expect(cleaned?.isValidated).toBe(false);
      expect(cleaned?.confidence).toBe("medium");
    });

    it("enforces Source Identity independence: isomorphic candidate with mismatched name must be rejected", () => {
      // Sulfanilamide SMILES sent under an unregistered name
      const result = verifyAuthoritativeCompound("ترکیب ناشناخته غیرثبت‌شده", "C1=CC(=CC=C1N)S(=O)(=O)N");
      expect(result.matched).toBe(false);
      expect(result.verified).toBe(false);
      expect(result.status).toBe("UNREGISTERED");
    });

    it("verifies achiral scaffold cores (Fluoroquinolone core) with canonical SMILES as VERIFIED", () => {
      const result = verifyAuthoritativeCompound("Fluoroquinolone core", "C1=CC2=C(C=C1F)C(=O)C(=CN2)C(=O)O");
      expect(result.matched).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.status).toBe("VERIFIED");
      expect(result.scaffoldRecord?.id).toBe("scaffold_fluoroquinolones_core");
    });
  });
});
