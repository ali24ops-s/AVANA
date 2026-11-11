import { describe, it, expect, vi } from "vitest";
import type {
  MindMapAiBase,
  MindMapNodeBase,
  MindMapChemicalStructure,
} from "@avana/contracts";
import {
  classifyMindMapNodeChemicalNeed,
  validateEnrichmentStructure,
  enrichMindMapAiBaseChemicals,
  enrichMindMapChemicalsWithReport,
} from "../modules/study/mind-map-chemical-enricher.js";

describe("Mind Map Chemical Enricher Suite (Phase 1 Backend)", () => {
  // Base mock factory
  function createTestTree(nodes: Record<string, Partial<MindMapNodeBase>>): MindMapAiBase {
    const fullNodes: Record<string, MindMapNodeBase> = {};
    for (const [id, partial] of Object.entries(nodes)) {
      fullNodes[id] = {
        id,
        parentId: partial.parentId !== undefined ? partial.parentId : (id === "root" ? null : "root"),
        title: partial.title || "عنوان گره",
        shortDescription: partial.shortDescription || "توضیح علمی گره آموزشی",
        keyPoints: partial.keyPoints ? [...partial.keyPoints] : ["نکته کلیدی آموزشی ۱"],
        examTips: partial.examTips ? [...partial.examTips] : ["نکته آزمونی"],
        examples: partial.examples ? [...partial.examples] : [],
        sortOrder: partial.sortOrder || 0,
        category: partial.category,
        nodeRole: partial.nodeRole,
        structuredDetails: partial.structuredDetails,
        chemicalStructure: partial.chemicalStructure,
        chemicalStatus: partial.chemicalStatus,
      };
    }

    return {
      rootNodeId: "root",
      generatedAt: "2026-11-07T12:00:00.000Z",
      model: "gemini-3.5-flash-lite",
      nodes: fullNodes,
    };
  }

  describe("1. Identification of Core Reference Compounds (Aspirin & Lidocaine)", () => {
    it("1.1 identifies Aspirin by canonical Persian and English aliases and attaches verified structure", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی ضدالتهاب‌ها", parentId: null },
        node_aspirin: {
          parentId: "root",
          title: "آسپرین (Aspirin)",
          shortDescription: "داروی ضدالتهاب غیراستروئیدی مهارکننده سنتز پروستاگلاندین‌ها",
          category: "drug",
          nodeRole: "concept",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      expect(report.metrics.enrichedNodes).toBe(1);

      const aspirinNode = report.enrichedAiBase.nodes.node_aspirin;
      expect(aspirinNode.chemicalStatus).toBe("enriched");
      expect(aspirinNode.chemicalStructure).toBeDefined();
      expect(aspirinNode.chemicalStructure?.smiles).toBe("CC(=O)Oc1ccccc1C(=O)O");
      expect(aspirinNode.chemicalStructure?.formula).toBe("C9H8O4");
      expect(aspirinNode.chemicalStructure?.molecularWeight).toBe(180.16);
      expect(aspirinNode.chemicalStructure?.confidence).toBe("high");
      expect(aspirinNode.chemicalStructure?.isValidated).toBe(true);
    });

    it("1.2 identifies Lidocaine and attaches authoritative amino-amide scaffold", () => {
      const tree = createTestTree({
        root: { title: "بی‌حس‌کننده‌های موضعی", parentId: null },
        node_lidocaine: {
          parentId: "root",
          title: "لیدوکائین",
          shortDescription: "بی‌حس‌کننده موضعی آمیدی مسدودکننده کانال‌های ولتاژی سدیم",
          category: "drug",
          nodeRole: "concept",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);
      const lidoNode = enriched.nodes.node_lidocaine;

      expect(lidoNode.chemicalStatus).toBe("enriched");
      expect(lidoNode.chemicalStructure?.smiles).toBe("CCN(CC)CC(=O)Nc1c(C)cccc1C");
      expect(lidoNode.chemicalStructure?.formula).toBe("C14H22N2O");
      expect(lidoNode.chemicalStructure?.molecularWeight).toBe(234.34);
      expect(lidoNode.chemicalStructure?.isValidated).toBe(true);
      expect(lidoNode.chemicalStructure?.confidence).toBe("high");
    });

    it("1.3 identifies Morphine, Penicillin G, and Paracetamol from benchmark registry", () => {
      const tree = createTestTree({
        root: { title: "فارماکولوژی جامع", parentId: null },
        node_morphine: {
          parentId: "root",
          title: "مورفین",
          shortDescription: "آلکالوئید اپیوئیدی ضد درد قوی آگونیست گیرنده مو",
          category: "drug",
        },
        node_penicillin: {
          parentId: "root",
          title: "پنی‌سیلین G",
          shortDescription: "آنتی‌بیوتیک بتالاکتام مهارکننده ترانس‌پپتیداز دیواره باکتری",
          category: "drug",
        },
        node_paracetamol: {
          parentId: "root",
          title: "استامینوفن (Paracetamol)",
          shortDescription: "داروی مسکن و تب‌بر غیراپیوئیدی",
          category: "drug",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      expect(report.metrics.enrichedNodes).toBe(3);

      expect(report.enrichedAiBase.nodes.node_morphine.chemicalStructure?.isValidated).toBe(true);
      expect(report.enrichedAiBase.nodes.node_penicillin.chemicalStructure?.isValidated).toBe(true);
      expect(report.enrichedAiBase.nodes.node_paracetamol.chemicalStructure?.isValidated).toBe(true);
    });
  });

  describe("2. Non-Attribution to Drug Categories & Pharmacokinetics (False Positive Prevention)", () => {
    it("2.1 strictly prevents attributing Aspirin structure to drug category hubs", () => {
      const tree = createTestTree({
        root: { title: "فارماکولوژی", parentId: null },
        cat_nsaids: {
          parentId: "root",
          title: "دسته‌بندی داروهای ضدالتهاب",
          shortDescription: "کلاس‌های دارویی شامل سالیسیلات‌ها، مشتقات پروپیونیک اسید و مهارکننده‌های COX-2",
          nodeRole: "category",
          category: "general",
        },
        cat_salicylates: {
          parentId: "cat_nsaids",
          title: "گروه سالیسیلات‌ها (آسپرین و مشتقات)",
          shortDescription: "داروهای خانواده اسید سالیسیلیک",
          nodeRole: "category",
          category: "drug",
        },
      });

      const classification1 = classifyMindMapNodeChemicalNeed(tree.nodes.cat_nsaids, tree.nodes, "root");
      const classification2 = classifyMindMapNodeChemicalNeed(tree.nodes.cat_salicylates, tree.nodes, "root");

      expect(classification1.level).toBe("none");
      expect(classification2.level).toBe("none");

      const enriched = enrichMindMapAiBaseChemicals(tree);
      expect(enriched.nodes.cat_nsaids.chemicalStructure).toBeUndefined();
      expect(enriched.nodes.cat_nsaids.chemicalStatus).toBe("not_required");

      // Category safeguard: category hub must NEVER receive primary chemicalStructure
      expect(enriched.nodes.cat_salicylates.chemicalStructure).toBeUndefined();
      // Mention in title ('آسپرین') is attached cleanly as relatedChemicals
      expect(enriched.nodes.cat_salicylates.relatedChemicals).toBeDefined();
      expect(enriched.nodes.cat_salicylates.relatedChemicals?.[0].referenceCompoundId).toBe("aspirin");
      expect(enriched.nodes.cat_salicylates.chemicalStatus).toBe("enriched");
    });

    it("2.2 strictly prevents attributing chemical structure to Pharmacokinetics nodes mentioning a drug", () => {
      const tree = createTestTree({
        root: { title: "فارماکولوژی آسپرین", parentId: null },
        node_aspirin_concept: {
          parentId: "root",
          title: "آسپرین",
          shortDescription: "داروی ضدالتهاب غیراستروئیدی",
          category: "drug",
        },
        node_pk: {
          parentId: "node_aspirin_concept",
          title: "فارماکوکینتیک آسپرین",
          shortDescription: "جذب سریع در معده و روده باریک، اتصال بالا به آلبومین و دفع کلیوی متابولیت‌ها",
          category: "general",
        },
        node_metabolism: {
          parentId: "node_aspirin_concept",
          title: "متابولیسم کبدی لیدوکائین",
          shortDescription: "هیدرولیز پیوند آمیدی توسط سیتوکروم P450 و دهیدروژناسیون",
          category: "cellular_mechanism",
        },
      });

      const classificationPk = classifyMindMapNodeChemicalNeed(tree.nodes.node_pk, tree.nodes, "root");
      const classificationMetab = classifyMindMapNodeChemicalNeed(tree.nodes.node_metabolism, tree.nodes, "root");

      expect(classificationPk.level).toBe("none");
      expect(classificationMetab.level).toBe("none");

      const enriched = enrichMindMapAiBaseChemicals(tree);
      expect(enriched.nodes.node_pk.chemicalStructure).toBeUndefined();
      expect(enriched.nodes.node_pk.chemicalStatus).toBe("not_required");
      expect(enriched.nodes.node_metabolism.chemicalStructure).toBeUndefined();
      expect(enriched.nodes.node_metabolism.chemicalStatus).toBe("not_required");
      // The actual drug node is enriched cleanly
      expect(enriched.nodes.node_aspirin_concept.chemicalStatus).toBe("enriched");
    });

    it("2.3 prevents attributing chemical structure to clinical aspects, adverse effects, or pathology", () => {
      const tree = createTestTree({
        root: { title: "فارماکولوژی", parentId: null },
        node_adverse: {
          parentId: "root",
          title: "عوارض گوارشی آسپرین",
          shortDescription: "خونریزی مخاط معده به علت مهار COX-1",
        },
        node_indication: {
          parentId: "root",
          title: "موارد مصرف بالینی لیدوکائین",
          shortDescription: "بی‌حسی انفیلتراسیون و مهار آریتمی بطنی",
        },
        node_disease: {
          parentId: "root",
          title: "مسمومیت با سالیسیلات‌ها",
          category: "disease",
          shortDescription: "آلکالوز تنفسی و اسیدوز متابولیک",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);
      expect(enriched.nodes.node_adverse.chemicalStructure).toBeUndefined();
      expect(enriched.nodes.node_adverse.chemicalStatus).toBe("not_required");
      expect(enriched.nodes.node_indication.chemicalStructure).toBeUndefined();
      expect(enriched.nodes.node_disease.chemicalStructure).toBeUndefined();
    });
  });

  describe("3. Content-Dependent Structure-Activity Relationship (SAR) Logic", () => {
    it("3.1 classifies generic SAR node as 'probable' and sets 'needs_review' without generating a fake structure", () => {
      const tree = createTestTree({
        root: { title: "مبانی شیمی دارویی", parentId: null },
        node_general_sar: {
          parentId: "root",
          title: "اصول رابطه ساختار و فعالیت (SAR)",
          shortDescription: "تغییرات ساختار شیمیایی و تاثیر آن بر خصوصیات فارماکودینامیک و تمایل به گیرنده به طور کلی",
          category: "general",
        },
      });

      const classification = classifyMindMapNodeChemicalNeed(tree.nodes.node_general_sar, tree.nodes, "root");
      expect(classification.level).toBe("probable");
      expect(classification.matchedReference).toBeUndefined();

      const enriched = enrichMindMapAiBaseChemicals(tree);
      expect(enriched.nodes.node_general_sar.chemicalStructure).toBeUndefined();
      expect(enriched.nodes.node_general_sar.chemicalStatus).toBe("needs_review");
    });

    it("3.2 enriches SAR node when context unambiguously targets a reference drug (Aspirin SAR)", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی سالیسیلات‌ها", parentId: null },
        node_aspirin: {
          parentId: "root",
          title: "آسپرین",
          category: "drug",
        },
        node_aspirin_sar: {
          parentId: "node_aspirin",
          title: "روابط ساختار و فعالیت (SAR) در آسپرین",
          shortDescription: "نقش حیاتی گروه استوکسی در استیلاسیون سرین ۵۲۹ و کربوکسیلات آزاد در برهمکنش با آرژنین ۱۲۰",
          category: "biochemistry",
        },
      });

      const classification = classifyMindMapNodeChemicalNeed(tree.nodes.node_aspirin_sar, tree.nodes, "root");
      expect(classification.level).toBe("probable");
      expect(classification.matchedReference?.id).toBe("aspirin");

      const enriched = enrichMindMapAiBaseChemicals(tree);
      const sarNode = enriched.nodes.node_aspirin_sar;

      expect(sarNode.chemicalStatus).toBe("enriched");
      expect(sarNode.chemicalStructure).toBeDefined();
      expect(sarNode.chemicalStructure?.smiles).toBe("CC(=O)Oc1ccccc1C(=O)O");
      expect(sarNode.chemicalStructure?.educationalNote).toContain("SAR");
    });
  });

  describe("4. Physical & Chemical Invariant Verification & Rejection of Bad Data", () => {
    it("4.1 rejects chemically impossible structures (hypervalent carbon)", () => {
      const impossibleStruct: MindMapChemicalStructure = {
        compoundName: "کربن شش‌پیوندی غیرممکن",
        smiles: "C(=O)(=O)(=O)",
        formula: "CO3",
      };

      const result = validateEnrichmentStructure(impossibleStruct);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("ظرفیت شیمیایی") || e.includes("کربن"))).toBe(true);
    });

    it("4.2 rejects compound identity mismatch when SMILES belongs to a different molecule", () => {
      // Named Aspirin but SMILES is Paracetamol
      const mismatchedStruct: MindMapChemicalStructure = {
        compoundName: "آسپرین (Aspirin)",
        smiles: "CC(=O)Nc1ccc(O)cc1", // Paracetamol
        formula: "C8H9NO2",
      };

      const result = validateEnrichmentStructure(mismatchedStruct);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("با هویت") || e.includes("منطبق نیست"))).toBe(true);
    });
  });

  describe("5. Idempotency & Preservation of Existing Validated Structures", () => {
    it("5.1 preserves existing verified chemical structures without replacing or altering them", () => {
      const existingValidatedStructure: MindMapChemicalStructure = {
        compoundName: "آسپرین اختصاصی استاد",
        smiles: "CC(=O)Oc1ccccc1C(=O)O",
        formula: "C9H8O4",
        molecularWeight: 180.16,
        educationalNote: "یادداشت ویرایش‌شده توسط استاد",
        confidence: "high",
        isValidated: true,
      };

      const tree = createTestTree({
        root: { title: "شیمی دارویی", parentId: null },
        node_aspirin: {
          parentId: "root",
          title: "آسپرین",
          category: "drug",
          chemicalStructure: existingValidatedStructure,
          chemicalStatus: "enriched",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      expect(report.metrics.preservedExistingNodes).toBe(1);
      expect(report.metrics.enrichedNodes).toBe(0);

      const node = report.enrichedAiBase.nodes.node_aspirin;
      expect(node.chemicalStructure?.educationalNote).toBe("یادداشت ویرایش‌شده توسط استاد");
      expect(node.chemicalStructure?.compoundName).toBe("آسپرین اختصاصی استاد");
    });

    it("5.2 produces 100% identical tree on re-running (deterministic idempotency)", () => {
      const tree = createTestTree({
        root: { title: "بی‌حسی و آرام‌بخشی", parentId: null },
        node_lido: {
          parentId: "root",
          title: "لیدوکائین",
          category: "drug",
        },
        node_cat: {
          parentId: "root",
          title: "دسته‌بندی داروها",
          nodeRole: "category",
        },
      });

      const run1 = enrichMindMapAiBaseChemicals(tree);
      const run2 = enrichMindMapAiBaseChemicals(run1);

      expect(JSON.stringify(run1.nodes)).toBe(JSON.stringify(run2.nodes));
      expect(run2.nodes.node_lido.chemicalStatus).toBe("enriched");
      expect(run2.nodes.node_cat.chemicalStatus).toBe("not_required");
    });
  });

  describe("6. Pipeline Failure Isolation & Strict Non-Mutation of Core Content", () => {
    it("6.1 strictly preserves titles, descriptions, keyPoints, examTips, and parentId without modification", () => {
      const tree = createTestTree({
        root: { title: "فارماکولوژی ۱", parentId: null },
        node_aspirin: {
          parentId: "root",
          title: "آسپرین (Aspirin)",
          shortDescription: "توضیح کوتاه دقیق با تمام واژگان علمی",
          keyPoints: ["نکته یک بسیار مهم", "نکته دو"],
          examTips: ["تله تستی جامع"],
          examples: ["مثال بالینی"],
          sortOrder: 4,
          category: "drug",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);
      const asp = enriched.nodes.node_aspirin;

      // Only chemical fields changed
      expect(asp.title).toBe("آسپرین (Aspirin)");
      expect(asp.shortDescription).toBe("توضیح کوتاه دقیق با تمام واژگان علمی");
      expect(asp.keyPoints).toEqual(["نکته یک بسیار مهم", "نکته دو"]);
      expect(asp.examTips).toEqual(["تله تستی جامع"]);
      expect(asp.examples).toEqual(["مثال بالینی"]);
      expect(asp.sortOrder).toBe(4);
      expect(asp.parentId).toBe("root");
    });

    it("6.2 safely catches unexpected exceptions and returns base tree without crashing the pipeline", () => {
      // Mock an unexpected runtime error inside report function
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const brokenTree = {
        rootNodeId: "root",
        nodes: null, // Invalid nodes object that would cause Object.entries() to throw
      } as unknown as MindMapAiBase;

      const result = enrichMindMapAiBaseChemicals(brokenTree);
      expect(result).toBe(brokenTree);

      spy.mockRestore();
    });

    it("6.3 attaches versioned chemicalEnrichment metadata to the tree", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی", parentId: null },
        node_aspirin: {
          parentId: "root",
          title: "آسپرین",
          category: "drug",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);
      expect(enriched.chemicalEnrichment).toBeDefined();
      expect(enriched.chemicalEnrichment?.version).toBe(1);
      expect(enriched.chemicalEnrichment?.enrichedCount).toBe(1);
      expect(enriched.chemicalEnrichment?.totalCandidateCount).toBe(1);
      expect(enriched.chemicalEnrichment?.enrichedAt).toBeDefined();
    });
  });

  describe("7. Real Medicinal Chemistry 1 Comprehensive Scenarios & Prioritization", () => {
    it("7.1 enriches real-world Medicinal Chemistry 1 tree (Aspirin, Lidocaine, Morphine) prioritizing dedicated structure nodes", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی ۱ - فصل داروهای اثرگذار بر اعصاب و التهاب", parentId: null },

        // Section 1: Aspirin with dedicated structure child and process children
        asp_main: {
          parentId: "root",
          title: "آسپرین (Aspirin)",
          shortDescription: "داروی ضدالتهاب غیراستروئیدی و ضدپلاکتی",
          category: "drug",
        },
        asp_structure: {
          parentId: "asp_main",
          title: "ساختار مولکولی",
          shortDescription: "استیل سالیسیلیک اسید با هسته بنزنی و عامل استوکسی",
          category: "biochemistry",
        },
        asp_mech: {
          parentId: "asp_main",
          title: "مکانیسم اثر مهار کوکس",
          shortDescription: "استیلاسیون غیرقابل برگشت آنزیم‌های سیکلواکسیژناز ۱ و ۲",
          category: "cellular_mechanism",
        },
        asp_pk: {
          parentId: "asp_main",
          title: "فارماکوکینتیک آسپرین",
          shortDescription: "جذب معدی-روده‌ای، متابولیسم سالیسیلات و ترشح ادراری",
          category: "general",
        },

        // Section 2: Lidocaine with dedicated structure child repeating drug name
        lido_main: {
          parentId: "root",
          title: "لیدوکائین (Lidocaine)",
          shortDescription: "بی‌حس‌کننده موضعی از گروه آمیدها",
          category: "drug",
        },
        lido_structure: {
          parentId: "lido_main",
          title: "ساختار مولکولی لیدوکائین",
          shortDescription: "مشتق آمینو استانیلید متصل به زنجیره دی‌اتیل آمین",
          category: "biochemistry",
        },
        lido_adverse: {
          parentId: "lido_main",
          title: "عوارض جانبی و سمیت سیستمیک",
          shortDescription: "سرگیجه، وزوز گوش و آریتمی قلبی در دوزهای بالا",
          category: "general",
        },

        // Section 3: Morphine with English dedicated structure title
        morph_main: {
          parentId: "root",
          title: "مورفین (Morphine)",
          shortDescription: "آلکالوئید اپیوئیدی مشتق از تریاک",
          category: "drug",
        },
        morph_structure: {
          parentId: "morph_main",
          title: "Molecular structure of Morphine",
          shortDescription: "هسته پنج‌حلقه‌ای فنانترن با پل اپوکسی و عامل فنولی",
          category: "biochemistry",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);

      // Dedicated structure node for Aspirin is enriched
      const aspStruct = report.enrichedAiBase.nodes.asp_structure;
      expect(aspStruct.chemicalStatus).toBe("enriched");
      expect(aspStruct.chemicalStructure).toBeDefined();
      expect(aspStruct.chemicalStructure?.smiles).toBe("CC(=O)Oc1ccccc1C(=O)O");
      expect(aspStruct.chemicalStructure?.formula).toBe("C9H8O4");
      expect(aspStruct.chemicalStructure?.isValidated).toBe(true);

      // Aspirin main node does NOT receive duplicate structure
      const aspMain = report.enrichedAiBase.nodes.asp_main;
      expect(aspMain.chemicalStatus).toBe("not_required");
      expect(aspMain.chemicalStructure).toBeUndefined();

      // PK and Mechanism nodes NEVER receive chemical structures
      expect(report.enrichedAiBase.nodes.asp_mech.chemicalStatus).toBe("not_required");
      expect(report.enrichedAiBase.nodes.asp_mech.chemicalStructure).toBeUndefined();
      expect(report.enrichedAiBase.nodes.asp_pk.chemicalStatus).toBe("not_required");
      expect(report.enrichedAiBase.nodes.asp_pk.chemicalStructure).toBeUndefined();

      // Lidocaine dedicated structure is enriched
      const lidoStruct = report.enrichedAiBase.nodes.lido_structure;
      expect(lidoStruct.chemicalStatus).toBe("enriched");
      expect(lidoStruct.chemicalStructure?.smiles).toBe("CCN(CC)CC(=O)Nc1c(C)cccc1C");
      expect(lidoStruct.chemicalStructure?.isValidated).toBe(true);

      // Lidocaine main node has NO duplicate structure
      expect(report.enrichedAiBase.nodes.lido_main.chemicalStatus).toBe("not_required");
      expect(report.enrichedAiBase.nodes.lido_main.chemicalStructure).toBeUndefined();
      expect(report.enrichedAiBase.nodes.lido_adverse.chemicalStatus).toBe("not_required");

      // Morphine dedicated structure is enriched
      const morphStruct = report.enrichedAiBase.nodes.morph_structure;
      expect(morphStruct.chemicalStatus).toBe("enriched");
      expect(morphStruct.chemicalStructure?.smiles).toBe("CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O");
      expect(morphStruct.chemicalStructure?.isValidated).toBe(true);

      // Morphine main node has NO duplicate structure
      expect(report.enrichedAiBase.nodes.morph_main.chemicalStatus).toBe("not_required");
      expect(report.enrichedAiBase.nodes.morph_main.chemicalStructure).toBeUndefined();

      // Total enriched nodes = exactly 3 dedicated structure nodes
      expect(report.metrics.enrichedNodes).toBe(3);
    });

    it("7.2 enriches main compound node when no dedicated structure subnode exists", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی ضددردها", parentId: null },
        aspirin_node: {
          parentId: "root",
          title: "آسپرین: مهارکننده سنتز پروستاگلاندین‌ها",
          shortDescription: "NSAID شاخص جهت مهار تجمع پلاکت‌ها و کاهش التهاب",
          category: "drug",
        },
        mech_node: {
          parentId: "aspirin_node",
          title: "مکانیسم اثر",
          shortDescription: "استیلاسیون سرین در جایگاه فعال COX",
          category: "cellular_mechanism",
        },
        pk_node: {
          parentId: "aspirin_node",
          title: "فارماکوکینتیک",
          shortDescription: "نیمه‌عمر کوتاه و تبدیل به اسید سالیسیلیک",
          category: "general",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);

      // Main node gets verified structure because no dedicated structure child exists
      const mainNode = enriched.nodes.aspirin_node;
      expect(mainNode.chemicalStatus).toBe("enriched");
      expect(mainNode.chemicalStructure?.smiles).toBe("CC(=O)Oc1ccccc1C(=O)O");
      expect(mainNode.chemicalStructure?.isValidated).toBe(true);

      // Process subnodes get no structure
      expect(enriched.nodes.mech_node.chemicalStatus).toBe("not_required");
      expect(enriched.nodes.mech_node.chemicalStructure).toBeUndefined();
      expect(enriched.nodes.pk_node.chemicalStatus).toBe("not_required");
      expect(enriched.nodes.pk_node.chemicalStructure).toBeUndefined();
    });

    it("7.3 handles title with hyphen separator and English description ('Aspirin - COX inhibitor')", () => {
      const tree = createTestTree({
        root: { title: "Medicinal Chemistry", parentId: null },
        node_dash: {
          parentId: "root",
          title: "Aspirin - COX inhibitor",
          shortDescription: "Acetylsalicylic acid",
          category: "drug",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);
      const node = enriched.nodes.node_dash;
      expect(node.chemicalStatus).toBe("enriched");
      expect(node.chemicalStructure?.smiles).toBe("CC(=O)Oc1ccccc1C(=O)O");
    });

    it("7.4 prevents duplicate structures when multiple dedicated structure nodes exist in the same compound subbranch", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی", parentId: null },
        node_lido: {
          parentId: "root",
          title: "لیدوکائین",
          category: "drug",
        },
        node_struct1: {
          parentId: "node_lido",
          title: "ساختار مولکولی",
          category: "biochemistry",
        },
        node_struct2: {
          parentId: "node_lido",
          title: "ساختار دو بعدی",
          category: "biochemistry",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);

      // Only one dedicated structure node receives the structure
      expect(report.metrics.enrichedNodes).toBe(1);
      expect(report.enrichedAiBase.nodes.node_struct1.chemicalStatus).toBe("enriched");
      expect(report.enrichedAiBase.nodes.node_struct1.chemicalStructure?.isValidated).toBe(true);

      // Second dedicated structure node is suppressed
      expect(report.enrichedAiBase.nodes.node_struct2.chemicalStatus).toBe("not_required");
      expect(report.enrichedAiBase.nodes.node_struct2.chemicalStructure).toBeUndefined();

      // Main node is also suppressed
      expect(report.enrichedAiBase.nodes.node_lido.chemicalStatus).toBe("not_required");
      expect(report.enrichedAiBase.nodes.node_lido.chemicalStructure).toBeUndefined();
    });

    it("7.5 strictly prevents attributing chemical structure to dedicated structure node without valid compound parent", () => {
      const tree = createTestTree({
        root: { title: "مبانی شیمی دارویی", parentId: null },
        general_concept: {
          parentId: "root",
          title: "مفاهیم پایه ساختار داروها",
          category: "general",
        },
        orphan_struct: {
          parentId: "general_concept",
          title: "ساختار مولکولی",
          shortDescription: "نمایش ساختار مولکولی عمومی بدون ذکر نام داروی مشخص",
          category: "biochemistry",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      expect(report.metrics.enrichedNodes).toBe(0);

      const orphanNode = report.enrichedAiBase.nodes.orphan_struct;
      expect(orphanNode.chemicalStatus).toBe("not_required");
      expect(orphanNode.chemicalStructure).toBeUndefined();
    });

    it("7.6 prevents structure node under a process node from climbing up to drug ancestor", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی", parentId: null },
        drug_node: {
          parentId: "root",
          title: "آسپرین",
          category: "drug",
        },
        process_node: {
          parentId: "drug_node",
          title: "مکانیسم اثر مهار کوکس",
          category: "cellular_mechanism",
        },
        enzyme_struct: {
          parentId: "process_node",
          title: "ساختار آنزیم هدف",
          category: "biochemistry",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);
      // Since enzyme_struct does not resolve to Aspirin (process node blocks upward climb),
      // it does not receive Aspirin's structure.
      expect(enriched.nodes.enzyme_struct.chemicalStatus).toBe("not_required");
      expect(enriched.nodes.enzyme_struct.chemicalStructure).toBeUndefined();
      // Drug node itself gets the structure
      expect(enriched.nodes.drug_node.chemicalStatus).toBe("enriched");
    });

    it("7.7 identifies Morphine with 'ساختار مورفین' title directly", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی اپیوئیدها", parentId: null },
        morph_node: {
          parentId: "root",
          title: "ساختار مورفین (Morphine Structure)",
          shortDescription: "ساختار شیمیایی آلکالوئید اپیوئیدی با اسکلت مرفینان",
          category: "biochemistry",
        },
      });

      const enriched = enrichMindMapAiBaseChemicals(tree);
      const node = enriched.nodes.morph_node;
      expect(node.chemicalStatus).toBe("enriched");
      expect(node.chemicalStructure?.smiles).toBe("CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O");
      expect(node.chemicalStructure?.isValidated).toBe(true);
    });

    it("7.8 maintains strict idempotency when re-enriching a Medicinal Chemistry 1 tree", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی ۱", parentId: null },
        asp: {
          parentId: "root",
          title: "آسپرین",
          category: "drug",
        },
        asp_s: {
          parentId: "asp",
          title: "ساختار مولکولی",
          category: "biochemistry",
        },
      });

      const run1 = enrichMindMapChemicalsWithReport(tree);
      expect(run1.metrics.enrichedNodes).toBe(1);
      expect(run1.enrichedAiBase.nodes.asp_s.chemicalStatus).toBe("enriched");
      expect(run1.enrichedAiBase.nodes.asp.chemicalStatus).toBe("not_required");

      const run2 = enrichMindMapChemicalsWithReport(run1.enrichedAiBase);
      expect(run2.metrics.preservedExistingNodes).toBe(1);
      expect(run2.metrics.enrichedNodes).toBe(0);
      expect(run2.enrichedAiBase.nodes.asp_s.chemicalStatus).toBe("enriched");
      expect(run2.enrichedAiBase.nodes.asp.chemicalStatus).toBe("not_required");
      expect(JSON.stringify(run1.enrichedAiBase.nodes)).toBe(JSON.stringify(run2.enrichedAiBase.nodes));
    });
  });

  describe("8. Related Chemicals Architecture & Chapter 10 Scenarios", () => {
    it("8.1 attaches Penicillin G and Penicillin V as relatedChemicals to a natural penicillins category node without primary structure", () => {
      const tree = createTestTree({
        root: { title: "آنتی‌بیوتیک‌های بتالاکتام", parentId: null },
        node_penicillins_class: {
          parentId: "root",
          title: "پنی‌سیلین‌های طبیعی و مقاوم به اسید",
          shortDescription: "پنی‌سیلین G به صورت تزریقی و پنی‌سیلین V به صورت خوراکی و مقاوم به اسید معده تجویز می‌شود.",
          category: "drug",
          nodeRole: "category",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const catNode = report.enrichedAiBase.nodes.node_penicillins_class;

      // Category safeguard: primary structure is undefined
      expect(catNode.chemicalStructure).toBeUndefined();

      // Related chemicals attached
      expect(catNode.relatedChemicals).toBeDefined();
      expect(catNode.relatedChemicals?.length).toBe(2);

      const compIds = catNode.relatedChemicals?.map((c) => c.referenceCompoundId);
      expect(compIds).toContain("penicillin_g");
      expect(compIds).toContain("penicillin_v");

      // Validated
      expect(catNode.relatedChemicals?.every((c) => c.isValidated && c.confidence === "high")).toBe(true);
      expect(catNode.chemicalStatus).toBe("enriched");
    });

    it("8.2 identifies Levofloxacin in a SAR node without standalone drug node and attaches it as relatedChemical", () => {
      const tree = createTestTree({
        root: { title: "کینولون‌ها و فلوروکینولون‌ها", parentId: null },
        node_quinolones_sar: {
          parentId: "root",
          title: "ارتباط ساختار و فعالیت (SAR)",
          shortDescription: "حضور گروه متیل در حلقه اکسازین لووفلوکساسین سبب افزایش حلالیت و فعالیت آنتی‌باکتریال علیه گرم مثبت‌ها می‌شود.",
          category: "general",
          nodeRole: "concept",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const sarNode = report.enrichedAiBase.nodes.node_quinolones_sar;

      expect(sarNode.chemicalStructure).toBeUndefined();
      expect(sarNode.relatedChemicals).toBeDefined();
      expect(sarNode.relatedChemicals?.length).toBe(1);
      expect(sarNode.relatedChemicals?.[0].referenceCompoundId).toBe("levofloxacin");
      expect(sarNode.relatedChemicals?.[0].drugClass).toBe("Fluoroquinolone Antibacterial / Third Generation");
    });

    it("8.3 prioritizes independent atomic node for Cephalexin and prevents duplicate relatedChemical in parent category", () => {
      const tree = createTestTree({
        root: { title: "سفالوسپورین‌ها", parentId: null },
        node_ceph_gen1: {
          parentId: "root",
          title: "نسل اول و دوم سفالوسپورین‌ها",
          shortDescription: "سفازولین و سفالکسین از نمونه‌های نسل اول هستند؛ سفوروکسیم نسل دوم است.",
          category: "drug",
          nodeRole: "category",
        },
        node_cephalexin: {
          parentId: "node_ceph_gen1",
          title: "سفالکسین (Cephalexin)",
          shortDescription: "سفالوسپورین نسل اول خوراکی مقاوم به اسید معده",
          category: "drug",
          nodeRole: "concept",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const cephNode = report.enrichedAiBase.nodes.node_cephalexin;
      const catNode = report.enrichedAiBase.nodes.node_ceph_gen1;

      // Cephalexin atomic node has primary structure
      expect(cephNode.chemicalStructure).toBeDefined();
      expect(cephNode.chemicalStructure?.referenceCompoundId).toBe("cephalexin");
      expect(cephNode.chemicalStructure?.isValidated).toBe(true);

      // Parent category has Cefazolin and Cefuroxime as relatedChemicals, but NOT Cephalexin (deduplicated!)
      expect(catNode.chemicalStructure).toBeUndefined();
      expect(catNode.relatedChemicals).toBeDefined();
      const parentRelIds = catNode.relatedChemicals?.map((c) => c.referenceCompoundId);
      expect(parentRelIds).toContain("cefazolin");
      expect(parentRelIds).toContain("cefuroxime");
      expect(parentRelIds).not.toContain("cephalexin");
    });

    it("8.4 correctly classifies Piperacillin as antipseudomonal penicillin even when mentioned in a beta-lactamase inhibitors node", () => {
      const tree = createTestTree({
        root: { title: "مهارکننده‌ها و ترکیبات افزاینده اثر", parentId: null },
        node_inhibitors: {
          parentId: "root",
          title: "مهارکننده‌های بتالاکتاماز",
          shortDescription: "کلاوولانیک اسید، سولباکتام و تازوباکتام با بتالاکتاماز متصل می‌شوند. داروی پیپراسیلین در ترکیب با تازوباکتام مصرف می‌شود.",
          category: "drug",
          nodeRole: "category",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const node = report.enrichedAiBase.nodes.node_inhibitors;

      expect(node.relatedChemicals).toBeDefined();
      const piperacillin = node.relatedChemicals?.find((c) => c.referenceCompoundId === "piperacillin");
      expect(piperacillin).toBeDefined();
      // Must NOT be classified as beta-lactamase inhibitor!
      expect(piperacillin?.drugClass).toBe("Beta-Lactam Antibiotic / Antipseudomonal Ureidopenicillin");
      expect(piperacillin?.drugClass).not.toContain("Inhibitor");

      const clav = node.relatedChemicals?.find((c) => c.referenceCompoundId === "clavulanic_acid");
      expect(clav?.drugClass).toBe("Beta-Lactamase Inhibitor / Oxapenam");
    });

    it("8.5 supports the same drug as a related chemical in multiple distinct nodes without collision", () => {
      const tree = createTestTree({
        root: { title: "مرور چندسرفصلی", parentId: null },
        node_topic_a: {
          parentId: "root",
          title: "ترکیبات خوراکی رایج",
          shortDescription: "آموکسی‌سیلین و سفالکسین خوراکی هستند.",
          category: "general",
        },
        node_topic_b: {
          parentId: "root",
          title: "حساسیت به پنی‌سیلین‌ها",
          shortDescription: "آموکسی‌سیلین ممکن است واکنش‌های متقاطع پوستی ایجاد کند.",
          category: "general",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const nodeA = report.enrichedAiBase.nodes.node_topic_a;
      const nodeB = report.enrichedAiBase.nodes.node_topic_b;

      expect(nodeA.relatedChemicals?.some((c) => c.referenceCompoundId === "amoxicillin")).toBe(true);
      expect(nodeB.relatedChemicals?.some((c) => c.referenceCompoundId === "amoxicillin")).toBe(true);
      expect(nodeA.relatedChemicals?.find((c) => c.referenceCompoundId === "amoxicillin")?.smiles).toBe(
        nodeB.relatedChemicals?.find((c) => c.referenceCompoundId === "amoxicillin")?.smiles,
      );
    });

    it("8.6 handles compound mentions and Persian synonyms with Longest-Match prioritization", () => {
      const tree = createTestTree({
        root: { title: "آنتی‌بیوتیک‌ها", parentId: null },
        node_combo: {
          parentId: "root",
          title: "درمان ترکیبی",
          shortDescription: "ترکیب آموکسی‌سیلین/کلاوولانات و پیپراسیلین-تازوباکتام درمان تجربی وسیع‌الطیف است.",
          category: "general",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const node = report.enrichedAiBase.nodes.node_combo;

      const ids = node.relatedChemicals?.map((c) => c.referenceCompoundId);
      expect(ids).toContain("amoxicillin");
      expect(ids).toContain("clavulanic_acid");
      expect(ids).toContain("piperacillin");
      expect(ids).toContain("tazobactam");
    });

    it("8.7 sets needs_review and does NOT invent chemical structure for unregistered drug mentions", () => {
      const tree = createTestTree({
        root: { title: "داروهای نوظهور", parentId: null },
        node_unknown: {
          parentId: "root",
          title: "داروی آزمایشی X-999",
          shortDescription: "مهارکننده آزمایشی پروتئاز با ساختار نامشخص",
          category: "drug",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const node = report.enrichedAiBase.nodes.node_unknown;

      expect(node.chemicalStructure).toBeUndefined();
      expect(node.relatedChemicals).toBeUndefined();
      expect(node.chemicalStatus).toBe("needs_review");
    });

    it("8.8 guarantees 100% idempotency across repeated enrichment passes on the same tree", () => {
      const tree = createTestTree({
        root: { title: "شیمی دارویی ۱ فصل ۱۰", parentId: null },
        node_cat: {
          parentId: "root",
          title: "پنی‌سیلین‌های طبیعی",
          shortDescription: "پنی‌سیلین G و پنی‌سیلین V",
          category: "drug",
          nodeRole: "category",
        },
        node_atomic: {
          parentId: "node_cat",
          title: "سفالکسین",
          category: "drug",
          nodeRole: "concept",
        },
      });

      const pass1 = enrichMindMapChemicalsWithReport(tree);
      const pass2 = enrichMindMapChemicalsWithReport(pass1.enrichedAiBase);

      expect(pass1.metrics.enrichedNodes).toBe(1); // cephalexin
      expect(pass1.metrics.relatedChemicalsCount).toBe(2); // pen g + pen v
      expect(pass2.metrics.enrichedNodes).toBe(0);
      expect(pass2.metrics.preservedExistingNodes).toBe(1);

      expect(JSON.stringify(pass1.enrichedAiBase.nodes)).toBe(JSON.stringify(pass2.enrichedAiBase.nodes));
    });
  });

  describe("9. Scientific Relation Precision & Auditing (Phase 2 & Chapter 10 Scientific Corrections)", () => {
    it("9.1 classifies Clavulanate/Sulbactam/Tazobactam as class_member and Amoxicillin/Piperacillin as combination_component in beta-lactamase inhibitor node", () => {
      const tree = createTestTree({
        root: { title: "آنتی‌بیوتیک‌های بتالاکتام", parentId: null },
        node_penicillins_class_dup3: {
          parentId: "root",
          title: "مهارکننده‌های بتالاکتاماز و ترکیبات حاوی آن‌ها",
          shortDescription:
            "کلاولانیک اسید (ترکیب با آموکسی‌سیلین در کوآموکسی‌کلاو)، سولباکتام (ترکیب با آمپی‌سیلین) و تازوباکتام (ترکیب با پیپراسیلین)",
          category: "drug",
          nodeRole: "category",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const node = report.enrichedAiBase.nodes.node_penicillins_class_dup3;
      expect(node.relatedChemicals).toBeDefined();

      const clav = node.relatedChemicals?.find((c) => c.referenceCompoundId === "clavulanic_acid");
      const sulb = node.relatedChemicals?.find((c) => c.referenceCompoundId === "sulbactam");
      const tazo = node.relatedChemicals?.find((c) => c.referenceCompoundId === "tazobactam");
      const amox = node.relatedChemicals?.find((c) => c.referenceCompoundId === "amoxicillin");
      const pipe = node.relatedChemicals?.find((c) => c.referenceCompoundId === "piperacillin");

      expect(clav).toBeDefined();
      expect(clav?.relationType).toBe("class_member");

      expect(sulb).toBeDefined();
      expect(sulb?.relationType).toBe("class_member");

      expect(tazo).toBeDefined();
      expect(tazo?.relationType).toBe("class_member");

      // Pharmacological combination partners must NOT be classified as class members!
      expect(amox).toBeDefined();
      expect(amox?.relationType).toBe("combination_component");
      expect(amox?.drugClass).toContain("Aminopenicillin");

      expect(pipe).toBeDefined();
      expect(pipe?.relationType).toBe("combination_component");
      expect(pipe?.drugClass).toContain("Antipseudomonal Ureidopenicillin");
    });

    it("9.2 classifies Tazobactam as combination_component and Ceftriaxone/Ceftolozane as class_member in advanced cephalosporins node", () => {
      const tree = createTestTree({
        root: { title: "آنتی‌بیوتیک‌های بتالاکتام", parentId: null },
        node_cephalosporins_class_dup2: {
          parentId: "root",
          title: "سفالوسپورین‌های نسل سوم، چهارم و ترکیبات پیشرفته",
          shortDescription:
            "سفتریاکسون، سفتازیدیم و ترکیب جدید سفتولوزان/تازوباکتام (Zerbaxa) جهت مقابله با باکتری‌های مقاوم به کار می‌روند.",
          category: "drug",
          nodeRole: "category",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const node = report.enrichedAiBase.nodes.node_cephalosporins_class_dup2;
      expect(node.relatedChemicals).toBeDefined();

      const ceftriaxone = node.relatedChemicals?.find((c) => c.referenceCompoundId === "ceftriaxone");
      const ceftolozane = node.relatedChemicals?.find((c) => c.referenceCompoundId === "ceftolozane");
      const tazobactam = node.relatedChemicals?.find((c) => c.referenceCompoundId === "tazobactam");

      expect(ceftriaxone?.relationType).toBe("class_member");
      expect(ceftolozane?.relationType).toBe("class_member");

      // Tazobactam is a beta-lactamase inhibitor, NOT a cephalosporin
      expect(tazobactam?.relationType).toBe("combination_component");
      expect(tazobactam?.drugClass).toContain("Beta-Lactamase Inhibitor");
      expect(tazobactam?.educationalNote).toContain("Zerbaxa");
    });

    it("9.3 distinguishes Penicillin V (acid-stable class member) from Penicillin G (acid-labile example) in natural penicillins node", () => {
      const tree = createTestTree({
        root: { title: "آنتی‌بیوتیک‌های بتالاکتام", parentId: null },
        node_penicillins_class: {
          parentId: "root",
          title: "پنی‌سیلین‌های طبیعی و مقاوم به اسید",
          shortDescription:
            "پنی‌سیلین G به علت ناپایداری در اسید معده فقط تزریقی است، اما پنی‌سیلین V به دلیل گروه الکترون‌کشنده فنوکسی‌متیل مقاوم به اسید بوده و خوراکی مصرف می‌شود.",
          category: "drug",
          nodeRole: "category",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const node = report.enrichedAiBase.nodes.node_penicillins_class;
      expect(node.relatedChemicals).toBeDefined();

      const penV = node.relatedChemicals?.find((c) => c.referenceCompoundId === "penicillin_v");
      const penG = node.relatedChemicals?.find((c) => c.referenceCompoundId === "penicillin_g");

      expect(penV).toBeDefined();
      expect(penV?.relationType).toBe("class_member");
      expect(penV?.educationalNote).toContain("مقاوم به اسید");

      expect(penG).toBeDefined();
      expect(penG?.relationType).toBe("example_of");
      expect(penG?.educationalNote).toContain("Acid-labile");
    });

    it("9.4 extracts Dicloxacillin and Nafcillin using Persian spelling variants and assigns class_member in penicillinase-resistant node", () => {
      const tree = createTestTree({
        root: { title: "آنتی‌بیوتیک‌های بتالاکتام", parentId: null },
        node_penicillins_class_dup2: {
          parentId: "root",
          title: "پنی‌سیلین‌های مقاوم به بتالاکتاماز (پنی‌سیلیناز)",
          shortDescription:
            "دیکلوکساسلین و نافسلین دارای گروه‌های حجیم فضایی هستند که مانع از هیدرولیز توسط بتالاکتاماز می‌شود.",
          category: "drug",
          nodeRole: "category",
        },
      });

      const report = enrichMindMapChemicalsWithReport(tree);
      const node = report.enrichedAiBase.nodes.node_penicillins_class_dup2;
      expect(node.relatedChemicals).toBeDefined();

      const diclox = node.relatedChemicals?.find((c) => c.referenceCompoundId === "dicloxacillin");
      const nafcil = node.relatedChemicals?.find((c) => c.referenceCompoundId === "nafcillin");

      expect(diclox).toBeDefined();
      expect(diclox?.relationType).toBe("class_member");

      expect(nafcil).toBeDefined();
      expect(nafcil?.relationType).toBe("class_member");
    });
  });
});
