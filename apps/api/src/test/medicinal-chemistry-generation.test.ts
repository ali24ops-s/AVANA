import { describe, it, expect } from "vitest";
import {
  buildLessonGenerationUserPrompt,
  buildLessonBatchGenerationUserPrompt,
  getLessonGenerationTemplate,
  LANGUAGE_REQUIREMENT_PROMPT,
} from "../modules/generation/prompt-registry.js";
import {
  validateChemicalStructure,
  parseChemicalCodeContent,
  extractChemicalStructuresFromMarkdown,
  type ChemicalStructure,
} from "@avana/domain";

describe("Medicinal Chemistry Generation & Chemical Structure Suite", () => {
  describe("1. Prompt Registry Policy Verification", () => {
    it("ensures LANGUAGE_REQUIREMENT_PROMPT contains the medicinal chemistry policy and anti-hallucination guard", () => {
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("MEDICINAL CHEMISTRY & CHEMICAL STRUCTURE POLICY");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("Mandatory Chemical Structure Generation for Named Compounds");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("Contextual Placement & Deduplication");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("Strict Anti-Hallucination & Verifiability Guard");
      expect(LANGUAGE_REQUIREMENT_PROMPT).toContain("TRIGGER to attempt providing its verified structure");
    });

    it("ensures buildLessonGenerationUserPrompt contains Section 12.1 with chemical policy", () => {
      const prompt = buildLessonGenerationUserPrompt({
        documentTitle: "هستامین‌ها و آنتی‌هیستامین‌ها",
        sessionBlueprint: JSON.stringify({ index: 0, title: "مبانی هیستامین", coreConcepts: [] }),
        chunkContext: "[Chunk 1]: مبانی هیستامین و ساختار",
        chunkIdList: ["chunk-1"],
      });

      expect(prompt).toContain("12.1. MEDICINAL CHEMISTRY & CHEMICAL STRUCTURE POLICY");
      expect(prompt).toContain("Whenever a specific drug or chemical compound is mentioned by name");
      expect(prompt).toContain("```chemical");
      expect(prompt).toContain("smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C");
    });

    it("ensures batch lesson generation user prompt contains Section 12.1 with identical chemical policy", () => {
      const batchPrompt = buildLessonBatchGenerationUserPrompt({
        documentTitle: "هستامین‌ها و آنتی‌هیستامین‌ها",
        sessions: [
          {
            sessionIndex: 0,
            sessionTitle: "جلسه ۱: مبانی هیستامین",
            sessionBlueprint: "blueprint-1",
            chunkContext: "chunk-context-1",
            chunkIdList: ["chunk-1"],
          },
        ],
      });

      expect(batchPrompt).toContain("12.1. MEDICINAL CHEMISTRY & CHEMICAL STRUCTURE POLICY");
      expect(batchPrompt).toContain("Whenever a specific drug or chemical compound is mentioned by name");
      expect(batchPrompt).toContain("```chemical");
    });

    it("ensures getLessonGenerationTemplate contains Section 12.1", () => {
      const tmpl = getLessonGenerationTemplate();
      expect(tmpl).toContain("12.1. MEDICINAL CHEMISTRY & CHEMICAL STRUCTURE POLICY");
      expect(tmpl).toContain("Whenever a specific drug or chemical compound is mentioned by name");
    });
  });

  describe("2. Histamine & Antihistamines SMILES Validation & Brackets", () => {
    it("validates Histamine with [nH] heteroaromatic imidazole atom with high confidence", () => {
      const histamine: ChemicalStructure = {
        compoundName: "هیستامین (Histamine)",
        smiles: "NCCc1c[nH]cn1",
        formula: "C5H9N3",
        molecularWeight: 111.15,
        drugClass: "آگونیست گیرنده هیستامینی",
        sarHighlights: [
          {
            feature: "حلقه ایمیدازول",
            description: "توتومریسم بین فرم‌های تائو و پای جهت اتصال انتخابی به گیرنده‌های H1 و H2",
          },
        ],
      };

      const result = validateChemicalStructure(histamine);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("validates Cimetidine (H2 antagonist prototype) with cyanoguanidine group", () => {
      const cimetidine: ChemicalStructure = {
        compoundName: "سایمتیدین (Cimetidine)",
        smiles: "Cc1c(CSCCNC(=NC#N)NC)[nH]cn1",
        formula: "C10H16N6S",
        molecularWeight: 252.34,
        drugClass: "آنتاگونیست گیرنده H2",
        sarHighlights: [
          {
            feature: "گروه سیانوگوانیدین",
            description: "کاهش خاصیت بازی و جلوگیری از پروتوناسیون بدون کاهش خصلت قطبی",
          },
        ],
      };

      const result = validateChemicalStructure(cimetidine);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
    });

    it("validates Ranitidine (Furan bioisostere replacement)", () => {
      const ranitidine: ChemicalStructure = {
        compoundName: "رانیتیدین (Ranitidine)",
        smiles: "CNC(=C/[N+](=O)[O-])/NCCSCc1ccc(o1)CN(C)C",
        formula: "C13H22N4O3S",
        molecularWeight: 314.40,
        drugClass: "آنتاگونیست گیرنده H2 نسل دوم",
        sarHighlights: [
          {
            feature: "حلقه فوران",
            description: "جایگزینی بیوایزوستر ایمیدازول جهت حذف توتومریسم و افزایش پایداری",
          },
        ],
      };

      const result = validateChemicalStructure(ranitidine);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
    });

    it("validates Diphenhydramine (H1 ethanolamine ether prototype)", () => {
      const diphenhydramine: ChemicalStructure = {
        compoundName: "دیفن‌هیدرامین (Diphenhydramine)",
        smiles: "CN(C)CCOC(c1ccccc1)c2ccccc2",
        formula: "C17H21NO",
        molecularWeight: 255.35,
        drugClass: "آنتی‌هیستامین H1 نسل اول",
        sarHighlights: [
          {
            feature: "پل اتری و دو حلقه فنیل",
            description: "ایجاد برهم‌کنش‌های چارج ترانسفر و لیپوفیل با پاکت گیرنده",
          },
        ],
      };

      const result = validateChemicalStructure(diphenhydramine);
      expect(result.valid).toBe(true);
      expect(result.needsReview).toBe(false);
      expect(result.confidence).toBe("high");
    });

    it("handles charged and bracketed atoms without false positives", () => {
      const chargedStruct = parseChemicalCodeContent(
        "name: نمک پیریدیلوکسی\nsmiles: C[N+](C)(C)CC[OH].[Cl-]\n",
        "chemical",
      );
      expect(chargedStruct).not.toBeNull();
      expect(chargedStruct?.compoundName).toBe("نمک پیریدیلوکسی");
      const validation = validateChemicalStructure(chargedStruct!);
      expect(validation.valid).toBe(true);
    });
  });

  describe("3. Markdown Extraction & Single Source of Truth Invariant", () => {
    it("extracts multiple structures from comprehensive medicinal chemistry lesson markdown", () => {
      const lessonMarkdown = [
        "# شیمی دارویی هیستامین و آنتی‌هیستامین‌ها",
        "",
        "## بخش اول: هیستامین و آگونیست‌ها",
        "هیستامین دارای توتومریسم حلقه ایمیدازول است:",
        "",
        "```chemical",
        "name: هیستامین (Histamine)",
        "smiles: NCCc1c[nH]cn1",
        "formula: C5H9N3",
        "weight: 111.15",
        "class: آگونیست طبیعی",
        "sar:",
        "  - حلقه ایمیدازول: برهم‌کنش توتومریسم فرم‌های تائو و پای",
        "```",
        "",
        "## بخش دوم: آنتاگونیست‌های H2",
        "روند تکاملی از سایمتیدین به رانیتیدین:",
        "",
        "```chemical",
        "name: سایمتیدین (Cimetidine)",
        "smiles: Cc1c(CSCCNC(=NC#N)NC)[nH]cn1",
        "formula: C10H16N6S",
        "weight: 252.34",
        "class: آنتاگونیست H2",
        "sar:",
        "  - گروه سیانوگوانیدین: کاهش اثرات جانبی ناشی از گوانییدین بازی",
        "```",
        "",
        "سپس رانیتیدین با جایگزینی حلقه فوران معرفی شد:",
        "",
        "```chemical",
        "name: رانیتیدین (Ranitidine)",
        "smiles: CNC(=C/[N+](=O)[O-])/NCCSCc1ccc(o1)CN(C)C",
        "formula: C13H22N4O3S",
        "weight: 314.40",
        "class: آنتاگونیست H2",
        "```",
      ].join("\n");

      const extracted = extractChemicalStructuresFromMarkdown(lessonMarkdown);
      expect(extracted).toHaveLength(3);

      expect(extracted[0].compoundName).toBe("هیستامین (Histamine)");
      expect(extracted[0].smiles).toBe("NCCc1c[nH]cn1");
      expect(extracted[0].confidence).toBe("high");
      expect(extracted[0].needsReview).toBe(false);

      expect(extracted[1].compoundName).toBe("سایمتیدین (Cimetidine)");
      expect(extracted[1].confidence).toBe("high");

      expect(extracted[2].compoundName).toBe("رانیتیدین (Ranitidine)");
      expect(extracted[2].confidence).toBe("high");
    });

    it("marks uncertain/mismatched SMILES as needsReview: true without crashing", () => {
      const markdownWithDiscrepancy = [
        "# مبحث دارویی",
        "```chemical",
        "name: داروی فرضی نامطمئن",
        "smiles: CCN(CC)CC(=O)Nc1c(C)cccc1C",
        "formula: C4H4",
        "weight: 50.0",
        "```",
      ].join("\n");

      const extracted = extractChemicalStructuresFromMarkdown(markdownWithDiscrepancy);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].needsReview).toBe(true);
      expect(extracted[0].confidence).toBe("low");
      expect(extracted[0].validationWarnings && extracted[0].validationWarnings.length > 0).toBe(true);
    });

    it("returns empty array for standard lessons without chemical blocks (zero regression)", () => {
      const nonChemicalMarkdown = "# فیزیولوژی کلیه\n\nنفرون‌ها واحدهای عملکردی کلیه هستند.";
      const extracted = extractChemicalStructuresFromMarkdown(nonChemicalMarkdown);
      expect(extracted).toHaveLength(0);
    });
  });
});
