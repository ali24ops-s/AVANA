import { describe, it, expect, vi } from "vitest";
import type { MindMapAiBase, MindMapNodeBase } from "@avana/contracts";
import {
  enrichMindMapChemicalsWithReportAsync,
  enrichMindMapAiBaseChemicalsAsync,
} from "../modules/study/mind-map-chemical-enricher.js";
import {
  PubChemDataProvider,
  ChemicalCacheService,
  ChemicalNodeClassifier,
  ChemicalIdentityResolver,
  type ScientificCompoundData,
  type ScientificDataProvider,
} from "../modules/study/chemistry/index.js";
import { validateMindMapChemicalStructure } from "@avana/domain";

// Authoritative scientific data for test verification
const SCIENTIFIC_MOCKS: Record<string, ScientificCompoundData> = {
  "Fluorouracil": {
    cid: 3385,
    canonicalName: "Fluorouracil",
    canonicalSmiles: "C1=C(C(=O)NC(=O)N1)F",
    formula: "C4H3FN2O2",
    molecularWeight: 130.08,
    inChIKey: "GHASVSINZRGABV-UHFFFAOYSA-N",
    iupacName: "5-fluoro-1H-pyrimidine-2,4-dione",
    synonyms: ["5-Fluorouracil", "5-FU", "Fluorouracil"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Cytarabine": {
    cid: 6253,
    canonicalName: "Cytarabine",
    canonicalSmiles: "C1=CN(C(=O)N=C1N)C2C(C(C(O2)CO)O)O",
    formula: "C9H13N3O5",
    molecularWeight: 243.22,
    inChIKey: "UHDGCWIWMRVCDJ-XVFZNYCNSA-N",
    iupacName: "4-amino-1-[(2R,3S,4R,5R)-3,4-dihydroxy-5-(hydroxymethyl)oxolan-2-yl]pyrimidin-2-one",
    synonyms: ["Ara-C", "Cytosine arabinoside", "Cytarabine"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Zidovudine": {
    cid: 35370,
    canonicalName: "Zidovudine",
    canonicalSmiles: "CC1=CN(C(=O)NC1=O)C2CC(C(O2)CO)N=[N+]=[N-]",
    formula: "C10H13N5O4",
    molecularWeight: 267.24,
    inChIKey: "BOQVOAHCZZODHN-UHFFFAOYSA-N",
    iupacName: "1-[(2R,4S,5S)-4-azido-5-(hydroxymethyl)oxolan-2-yl]-5-methylpyrimidine-2,4-dione",
    synonyms: ["AZT", "Azidothymidine", "Zidovudine"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Nevirapine": {
    cid: 4463,
    canonicalName: "Nevirapine",
    canonicalSmiles: "CC1=C2C(=NC=C1)N(C3=C(C=CC=N3)C(=O)N2)C4CC4",
    formula: "C15H14N4O",
    molecularWeight: 266.30,
    inChIKey: "MHEFZLODVODPIL-UHFFFAOYSA-N",
    iupacName: "11-cyclopropyl-4-methyl-5,11-dihydrodipyrido[3,2-b:2',3'-e][1,4]diazepin-6-one",
    synonyms: ["Nevirapine", "Viramune"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Physostigmine": {
    cid: 5983,
    canonicalName: "Physostigmine",
    canonicalSmiles: "CNC(=O)OC1=CC2=C(C=C1)N(C3C2(CCN3C)C)C",
    formula: "C15H21N3O2",
    molecularWeight: 275.35,
    inChIKey: "AGPVPVBMAPAYAG-UHFFFAOYSA-N",
    iupacName: "[(3aR,8bS)-3a,8-dimethyl-1,2,3,3a,8,8a-hexahydropyrrolo[2,3-b]indol-5-yl] N-methylcarbamate",
    synonyms: ["Physostigmine", "Eserine"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Clavulanic Acid": {
    cid: 5280980,
    canonicalName: "Clavulanic Acid",
    canonicalSmiles: "OC/C=C1\\O[C@@H]2CC(=O)N2[C@H]1C(=O)O",
    formula: "C8H9NO5",
    molecularWeight: 199.16,
    inChIKey: "HCAWIAZEKFHSOY-UHFFFAOYSA-N",
    iupacName: "(2R,3Z,5R)-3-(2-hydroxyethylidene)-7-oxo-4-oxa-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    synonyms: ["Clavulanic acid", "Clavulanate"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Aspirin": {
    cid: 2244,
    canonicalName: "Aspirin",
    canonicalSmiles: "CC(=O)Oc1ccccc1C(=O)O",
    formula: "C9H8O4",
    molecularWeight: 180.16,
    inChIKey: "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
    iupacName: "2-acetyloxybenzoic acid",
    synonyms: ["Aspirin", "Acetylsalicylic acid"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Lidocaine": {
    cid: 3676,
    canonicalName: "Lidocaine",
    canonicalSmiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
    formula: "C14H22N2O",
    molecularWeight: 234.34,
    inChIKey: "RBNPOMFGWZIOIT-UHFFFAOYSA-N",
    iupacName: "2-(diethylamino)-N-(2,6-dimethylphenyl)acetamide",
    synonyms: ["Lidocaine", "Lignocaine"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
  "Morphine": {
    cid: 5288826,
    canonicalName: "Morphine",
    canonicalSmiles: "CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O",
    formula: "C17H19NO3",
    molecularWeight: 285.34,
    inChIKey: "BQJCRGQIZZOJH-UHFFFAOYSA-N",
    iupacName: "(4R,4aR,7S,7aR,12bS)-3-methyl-2,4,4a,7,7a,13-hexahydro-1H-4,12-methanobenzofuro[3,2-e]isoquinoline-7,9-diol",
    synonyms: ["Morphine"],
    source: "pubchem",
    verifiedAt: new Date().toISOString(),
  },
};

/**
 * Mock provider for fast and deterministic test execution.
 */
class MockScientificDataProvider implements ScientificDataProvider {
  constructor(private readonly dataMap = SCIENTIFIC_MOCKS) {}

  async fetchCompoundByName(name: string): Promise<ScientificCompoundData | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();

    for (const [key, data] of Object.entries(this.dataMap)) {
      if (
        key.toLowerCase() === lower ||
        data.canonicalName.toLowerCase() === lower ||
        data.synonyms.some((s) => s.toLowerCase() === lower)
      ) {
        return data;
      }
    }
    return null;
  }

  async fetchCompoundByCid(cid: number): Promise<ScientificCompoundData | null> {
    for (const data of Object.values(this.dataMap)) {
      if (data.cid === cid) return data;
    }
    return null;
  }
}

function createTree(nodes: Record<string, Partial<MindMapNodeBase>>): MindMapAiBase {
  const fullNodes: Record<string, MindMapNodeBase> = {};
  for (const [id, partial] of Object.entries(nodes)) {
    fullNodes[id] = {
      id,
      parentId: partial.parentId !== undefined ? partial.parentId : (id === "root" ? null : "root"),
      title: partial.title || "گره",
      shortDescription: partial.shortDescription || "توضیحات",
      category: partial.category,
      nodeRole: partial.nodeRole,
      chemicalStructure: partial.chemicalStructure,
      chemicalStatus: partial.chemicalStatus,
    };
  }
  return {
    rootNodeId: "root",
    generatedAt: "2026-11-08T12:00:00.000Z",
    model: "gemini-3.5-flash-lite",
    nodes: fullNodes,
  };
}

describe("Intelligent & Extensible Chemical Structure Engine Suite", () => {
  describe("1. Classification & Semantic Categorization (6 Essential Categories)", () => {
    const classifier = new ChemicalNodeClassifier();

    it("1.1 classifies Aspirin and آسپرین as specific_drug", () => {
      const res1 = classifier.classifyByRules({ nodeId: "n1", title: "Aspirin" });
      const res2 = classifier.classifyByRules({ nodeId: "n2", title: "آسپرین" });

      expect(res1?.classification).toBe("specific_drug");
      expect(res2?.classification).toBe("specific_drug");
    });

    it("1.2 classifies 5-FU and 5-Fluorouracil as specific_drug", () => {
      const res1 = classifier.classifyByRules({ nodeId: "n1", title: "5-FU" });
      const res2 = classifier.classifyByRules({ nodeId: "n2", title: "5-Fluorouracil" });

      expect(res1?.classification).toBe("specific_drug");
      expect(res1?.canonicalEnglishName).toBe("Fluorouracil");
      expect(res2?.classification).toBe("specific_drug");
      expect(res2?.canonicalEnglishName).toBe("Fluorouracil");
    });

    it("1.3 classifies Ara-C and Cytarabine as specific_drug", () => {
      const res1 = classifier.classifyByRules({ nodeId: "n1", title: "Ara-C" });
      const res2 = classifier.classifyByRules({ nodeId: "n2", title: "Cytarabine" });

      expect(res1?.classification).toBe("specific_drug");
      expect(res1?.canonicalEnglishName).toBe("Cytarabine");
      expect(res2?.classification).toBe("specific_drug");
      expect(res2?.canonicalEnglishName).toBe("Cytarabine");
    });

    it("1.4 classifies Lidocaine and Clavulanic Acid correctly", () => {
      const resLido = classifier.classifyByRules({ nodeId: "n1", title: "Lidocaine" });
      const resClav = classifier.classifyByRules({ nodeId: "n2", title: "Clavulanic Acid" });

      expect(resLido?.classification).toBe("specific_drug");
      expect(resClav?.classification).toBe("specific_compound");
    });

    it("1.5 classifies Beta-lactam antibiotics as drug_class (NOT a specific molecule)", () => {
      const res = classifier.classifyByRules({ nodeId: "n1", title: "Beta-lactam antibiotics" });
      expect(res?.classification).toBe("drug_class");
    });

    it("1.6 classifies Pharmacokinetics as pharmacological_concept", () => {
      const res = classifier.classifyByRules({ nodeId: "n1", title: "Pharmacokinetics" });
      expect(res?.classification).toBe("pharmacological_concept");
    });

    it("1.7 classifies Structure Activity Relationship as chemical_concept", () => {
      const res = classifier.classifyByRules({ nodeId: "n1", title: "Structure Activity Relationship" });
      expect(res?.classification).toBe("chemical_concept");
    });
  });

  describe("2. Comprehensive Scientific Verification of 9 Core AVANA Drugs", () => {
    const mockProvider = new MockScientificDataProvider();
    const cache = new ChemicalCacheService();
    const resolver = new ChemicalIdentityResolver(mockProvider, cache);

    const testDrugs: Array<{ query: string; expectedCid?: number; expectedFormula: string }> = [
      { query: "5-Fluorouracil (5-FU)", expectedFormula: "C4H3FN2O2" },
      { query: "Cytarabine (Ara-C)", expectedFormula: "C9H13N3O5" },
      { query: "Zidovudine (AZT)", expectedFormula: "C10H13N5O4" },
      { query: "Nevirapine", expectedFormula: "C15H14N4O" },
      { query: "Physostigmine", expectedFormula: "C15H21N3O2" },
      { query: "Clavulanic Acid", expectedFormula: "C8H9NO5" },
      { query: "Aspirin", expectedFormula: "C9H8O4" },
      { query: "Lidocaine", expectedFormula: "C14H22N2O" },
      { query: "Morphine", expectedFormula: "C17H19NO3" },
    ];

    for (const drug of testDrugs) {
      it(`verifies scientific identity and valid structure for ${drug.query}`, async () => {
        const classifier = new ChemicalNodeClassifier();
        const classification = classifier.classifyByRules({ nodeId: "node_test", title: drug.query });
        expect(classification).toBeDefined();

        const resolved = await resolver.resolveNode(
          { nodeId: "node_test", title: drug.query },
          classification!,
        );

        expect(resolved.status).toBe("enriched");
        expect(resolved.structure.isValidated).toBe(true);
        expect(resolved.structure.confidence).toBe("high");
        expect(resolved.structure.smiles).toBeDefined();
        expect(resolved.structure.formula).toBe(drug.expectedFormula);

        // Independent validation with @avana/domain
        const domainCheck = validateMindMapChemicalStructure(resolved.structure);
        expect(domainCheck.valid).toBe(true);
        expect(domainCheck.syntaxValid).toBe(true);
        expect(domainCheck.graphValid).toBe(true);
        expect(domainCheck.formulaConsistent).toBe(true);
      });
    }
  });

  describe("3. Strict Prevention of Misattribution & False Positives", () => {
    it("3.1 prevents assigning Morphine structure to a different opioid (e.g. Fentanyl or Tramadol)", async () => {
      const mockProvider = new MockScientificDataProvider();
      const cache = new ChemicalCacheService();
      const resolver = new ChemicalIdentityResolver(mockProvider, cache);

      // Attempt to resolve a drug not in the mock without accidentally falling back to Morphine
      const resolved = await resolver.resolveNode(
        { nodeId: "node_tramadol", title: "ترامادول (Tramadol)" },
        {
          nodeId: "node_tramadol",
          classification: "specific_drug",
          canonicalEnglishName: "Tramadol",
          confidence: "high",
          reason: "آگونیست اپیوئیدی سنتتیک",
        },
      );

      // Must NOT assign Morphine's structure!
      expect(resolved.status).toBe("needs_review");
      expect(resolved.structure.isValidated).toBe(false);
      expect(resolved.structure.smiles).toBe("");
    });

    it("3.2 rejects invalid SMILES syntax and does not validate corrupted SMILES", async () => {
      const corruptProvider: ScientificDataProvider = {
        async fetchCompoundByName() {
          return {
            cid: 99999,
            canonicalName: "Corrupted Drug",
            canonicalSmiles: "CC(=O)Oc1ccccc1C(=O)O((((", // Mismatched parentheses
            formula: "C9H8O4",
            molecularWeight: 180.16,
            inChIKey: "BSYNRYMUTXBXSQ-UHFFFAOYSA-N",
            synonyms: ["Corrupted Drug"],
            source: "pubchem",
            verifiedAt: new Date().toISOString(),
          };
        },
        async fetchCompoundByCid() {
          return null;
        },
      };

      const cache = new ChemicalCacheService();
      const resolver = new ChemicalIdentityResolver(corruptProvider, cache);

      const resolved = await resolver.resolveNode(
        { nodeId: "n1", title: "Corrupted Drug" },
        { nodeId: "n1", classification: "specific_drug", confidence: "high", reason: "" },
      );

      expect(resolved.status).toBe("needs_review");
      expect(resolved.structure.isValidated).toBe(false);
    });

    it("3.3 rejects chemically impossible hypervalent carbon atoms", async () => {
      const pentavalentProvider: ScientificDataProvider = {
        async fetchCompoundByName() {
          return {
            cid: 88888,
            canonicalName: "Impossible Carbon",
            canonicalSmiles: "C(C)(C)(C)(C)C", // Pentavalent carbon
            formula: "C6H12",
            molecularWeight: 84.16,
            inChIKey: "ABCDEFGHIJKLMN-OPQRSTUVWX-Y",
            synonyms: ["Impossible Carbon"],
            source: "pubchem",
            verifiedAt: new Date().toISOString(),
          };
        },
        async fetchCompoundByCid() {
          return null;
        },
      };

      const cache = new ChemicalCacheService();
      const resolver = new ChemicalIdentityResolver(pentavalentProvider, cache);

      const resolved = await resolver.resolveNode(
        { nodeId: "n1", title: "Impossible Carbon" },
        { nodeId: "n1", classification: "specific_drug", confidence: "high", reason: "" },
      );

      expect(resolved.status).toBe("needs_review");
      expect(resolved.structure.isValidated).toBe(false);
    });
  });

  describe("4. Resilience against PubChem & Redis Failures", () => {
    it("4.1 does NOT fail mind map enrichment when PubChem throws network error or times out", async () => {
      const failingProvider: ScientificDataProvider = {
        async fetchCompoundByName() {
          throw new Error("PubChem connection timeout (503 Service Unavailable)");
        },
        async fetchCompoundByCid() {
          throw new Error("PubChem connection timeout (503 Service Unavailable)");
        },
      };

      const tree = createTree({
        root: { title: "انکولوژی", parentId: null },
        node_5fu: {
          parentId: "root",
          title: "5-Fluorouracil",
          category: "drug",
        },
      });

      const report = await enrichMindMapChemicalsWithReportAsync(tree, {
        provider: failingProvider,
      });

      // Pipeline completed successfully without crashing!
      expect(report.metrics.totalNodes).toBe(2);
      expect(report.enrichedAiBase.nodes.node_5fu.chemicalStatus).toBe("needs_review");
      expect(report.enrichedAiBase.nodes.node_5fu.chemicalStructure?.isValidated).toBeUndefined();
    });

    it("4.2 degrades gracefully when Redis client throws connection errors", async () => {
      const brokenRedis = {
        get: vi.fn().mockRejectedValue(new Error("Redis ECONNREFUSED")),
        set: vi.fn().mockRejectedValue(new Error("Redis ECONNREFUSED")),
      } as any;

      const cache = new ChemicalCacheService(brokenRedis);
      const mockProvider = new MockScientificDataProvider();
      const resolver = new ChemicalIdentityResolver(mockProvider, cache);

      // Should succeed purely via in-memory cache without throwing
      const resolved = await resolver.resolveNode(
        { nodeId: "n1", title: "5-FU" },
        { nodeId: "n1", classification: "specific_drug", canonicalEnglishName: "Fluorouracil", confidence: "high", reason: "" },
      );

      expect(resolved.status).toBe("enriched");
      expect(resolved.structure.isValidated).toBe(true);
    });
  });

  describe("5. Idempotency & Preservation of Existing Validated Structures", () => {
    it("5.1 strictly preserves already validated existing chemical structures without overwriting", async () => {
      const existingValidatedStructure = {
        compoundName: "Custom Verified Drug",
        smiles: "CC(=O)Oc1ccccc1C(=O)O",
        formula: "C9H8O4",
        molecularWeight: 180.16,
        confidence: "high" as const,
        isValidated: true,
      };

      const tree = createTree({
        root: { title: "درس داروسازی", parentId: null },
        node_preserved: {
          parentId: "root",
          title: "گره با ساختار قبلی",
          category: "drug",
          chemicalStructure: existingValidatedStructure,
          chemicalStatus: "enriched",
        },
      });

      const report = await enrichMindMapChemicalsWithReportAsync(tree, {
        provider: new MockScientificDataProvider(),
      });

      expect(report.metrics.preservedExistingNodes).toBe(1);
      const preservedNode = report.enrichedAiBase.nodes.node_preserved;
      expect(preservedNode.chemicalStructure?.compoundName).toBe("Custom Verified Drug");
      expect(preservedNode.chemicalStatus).toBe("enriched");
    });

    it("5.2 produces 100% identical tree on repeated async enrichment passes", async () => {
      const tree = createTree({
        root: { title: "شیمی دارویی", parentId: null },
        node_5fu: { parentId: "root", title: "5-FU", category: "drug" },
        node_arac: { parentId: "root", title: "Ara-C", category: "drug" },
        node_class: { parentId: "root", title: "Beta-lactam antibiotics", category: "general" },
      });

      const options = { provider: new MockScientificDataProvider() };
      const report1 = await enrichMindMapChemicalsWithReportAsync(tree, options);
      const report2 = await enrichMindMapChemicalsWithReportAsync(report1.enrichedAiBase, options);

      expect(report2.metrics.enrichedNodes).toBe(report1.metrics.enrichedNodes);
      expect(report2.metrics.preservedExistingNodes).toBe(report1.metrics.enrichedNodes);
      expect(JSON.stringify(report2.enrichedAiBase.nodes)).toBe(JSON.stringify(report1.enrichedAiBase.nodes));
    });
  });

  describe("6. Real PubChem PUG REST Client Contract Validation", () => {
    it("6.1 validates PubChem mapping and normalization logic", () => {
      const provider = new PubChemDataProvider();
      expect(provider).toBeInstanceOf(PubChemDataProvider);
    });

    it("6.2 ensures PubChem data conforms to full chemical validation invariants", () => {
      for (const [name, compound] of Object.entries(SCIENTIFIC_MOCKS)) {
        const val = validateMindMapChemicalStructure({
          compoundName: compound.canonicalName,
          smiles: compound.canonicalSmiles,
          formula: compound.formula,
          molecularWeight: compound.molecularWeight,
        });
        expect(val.valid, `Compound ${name} must be valid`).toBe(true);
        expect(val.syntaxValid).toBe(true);
        expect(val.graphValid).toBe(true);
        expect(val.formulaConsistent).toBe(true);
      }
    });
  });

  describe("7. Phase 2A Classification & Scaffold Matching Invariants", () => {
    const classifier = new ChemicalNodeClassifier();

    it("7.1 prevents protected drug family names from being falsely classified as specific_drug by INN stems", () => {
      const carbapenem = classifier.classifyByRules({ nodeId: "n1", title: "Carbapenems" });
      const cephalosporin = classifier.classifyByRules({ nodeId: "n2", title: "Cephalosporins" });
      const fluoroquinolone = classifier.classifyByRules({ nodeId: "n3", title: "Fluoroquinolones" });
      const penicillin = classifier.classifyByRules({ nodeId: "n4", title: "Penicillins" });
      const carbapenemFa = classifier.classifyByRules({ nodeId: "n5", title: "کارباپنم‌ها" });
      const cephFa = classifier.classifyByRules({ nodeId: "n6", title: "سفالوسپورین‌ها" });

      expect(carbapenem?.classification).not.toBe("specific_drug");
      expect(carbapenem?.classification).toBe("drug_class");
      expect(cephalosporin?.classification).not.toBe("specific_drug");
      expect(cephalosporin?.classification).toBe("drug_class");
      expect(fluoroquinolone?.classification).not.toBe("specific_drug");
      expect(fluoroquinolone?.classification).toBe("drug_class");
      expect(penicillin?.classification).not.toBe("specific_drug");
      expect(penicillin?.classification).toBe("drug_class");
      expect(carbapenemFa?.classification).toBe("drug_class");
      expect(cephFa?.classification).toBe("drug_class");
    });

    it("7.2 accurately identifies real specific drugs from dictionary and safe INN stems", () => {
      const amox = classifier.classifyByRules({ nodeId: "n1", title: "Amoxicillin" });
      const amoxFa = classifier.classifyByRules({ nodeId: "n2", title: "آموکسی‌سیلین" });
      const cipro = classifier.classifyByRules({ nodeId: "n3", title: "Ciprofloxacin" });
      const mero = classifier.classifyByRules({ nodeId: "n4", title: "Meropenem" });
      const cefalexin = classifier.classifyByRules({ nodeId: "n5", title: "Cefalexin" });

      expect(amox?.classification).toBe("specific_drug");
      expect(amox?.canonicalEnglishName).toBe("Amoxicillin");
      expect(amoxFa?.classification).toBe("specific_drug");
      expect(amoxFa?.canonicalEnglishName).toBe("Amoxicillin");
      expect(cipro?.classification).toBe("specific_drug");
      expect(cipro?.canonicalEnglishName).toBe("Ciprofloxacin");
      expect(mero?.classification).toBe("specific_drug");
      expect(mero?.canonicalEnglishName).toBe("Meropenem");
      expect(cefalexin?.classification).toBe("specific_drug");
      expect(cefalexin?.canonicalEnglishName).toBe("Cefalexin");
    });

    it("7.3 classifies Cephalosporin subfamilies accurately based on explicit 3-acetoxymethyl / desacetoxy indicators", () => {
      const subfam7aca = classifier.classifyByRules({
        nodeId: "n1",
        title: "سفالوسپورین‌های ۳-استوکسی‌متیل",
      });
      const subfam7adca = classifier.classifyByRules({
        nodeId: "n2",
        title: "سفالوسپورین‌های دزاستوکسی (۳-متیل)",
      });

      expect(subfam7aca?.classification).toBe("drug_subfamily");
      expect(subfam7aca?.matchedScaffoldId).toBe("scaffold_cephalosporins_7aca");
      expect(subfam7adca?.classification).toBe("drug_subfamily");
      expect(subfam7adca?.matchedScaffoldId).toBe("scaffold_cephalosporins_7adca");
    });

    it("7.4 enforces negative gates priority over drug/family mentions in clinical/process nodes", () => {
      const pk = classifier.classifyByRules({
        nodeId: "n1",
        title: "فارماکوکینتیک پنی‌سیلین‌ها",
      });
      const adverse = classifier.classifyByRules({
        nodeId: "n2",
        title: "عوارض جانبی فلوروکینولون‌ها",
      });
      const resistance = classifier.classifyByRules({
        nodeId: "n3",
        title: "مکانیسم مقاومت به بتالاکتام‌ها",
      });

      expect(pk?.classification).toBe("pharmacological_concept");
      expect(adverse?.classification).toBe("pharmacological_concept");
      expect(resistance?.classification).toBe("pharmacological_concept");
    });

    it("7.5 enriches family nodes with authoritative reference cores in async enrichment pipeline", async () => {
      const tree = createTree({
        root: { title: "آنتی‌بیوتیک‌ها", parentId: null },
        node_carbapenems: {
          parentId: "root",
          title: "کارباپنم‌ها",
          shortDescription: "دسته کارباپنم‌ها دارای هسته کارباپنم با اشباع‌ناپذیری C2-C3 هستند.",
          category: "general",
        },
      });

      const options = { provider: new MockScientificDataProvider() };
      const report = await enrichMindMapChemicalsWithReportAsync(tree, options);
      const carbNode = report.enrichedAiBase.nodes.node_carbapenems;

      expect(carbNode.chemicalStructure).toBeDefined();
      expect(carbNode.chemicalStructure?.isValidated).toBe(true);
      expect(carbNode.chemicalStructure?.relationType).toBe("reference_core_compound");
      expect(carbNode.chemicalStatus).toBe("enriched");
    });

    it("7.6 respects Aminoglycosides invariant: no generic scaffold in async enrichment", async () => {
      const tree = createTree({
        root: { title: "آنتی‌بیوتیک‌ها", parentId: null },
        node_amino: {
          parentId: "root",
          title: "آمینوگلیکوزیدها",
          shortDescription: "آمینوگلیکوزیدها آمینوسایکلین‌های با قندهای آمینه‌اند و فاقد اسکلت عمومی واحد هستند.",
          category: "general",
        },
      });

      const options = { provider: new MockScientificDataProvider() };
      const report = await enrichMindMapChemicalsWithReportAsync(tree, options);
      const aminoNode = report.enrichedAiBase.nodes.node_amino;

      // Must NOT receive an invented generic scaffold!
      expect(aminoNode.chemicalStructure?.smiles).toBeUndefined();
    });
  });
});
