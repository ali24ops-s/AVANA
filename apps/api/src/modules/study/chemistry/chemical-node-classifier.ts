/**
 * Chemical Node Classifier using Gemini and Deterministic Rules.
 *
 * Responsibilities:
 * - Semantic classification of Mind Map nodes into 6 categories:
 *   1. specific_drug (e.g. Aspirin, 5-FU, Ara-C, Lidocaine, Morphine, Zidovudine)
 *   2. specific_compound (e.g. Clavulanic Acid, Citric Acid)
 *   3. drug_class (e.g. Beta-lactam antibiotics, NSAIDs)
 *   4. pharmacological_concept (e.g. Pharmacokinetics, Bioavailability)
 *   5. chemical_concept (e.g. Structure Activity Relationship, Pharmacophore)
 *   6. unknown (ambiguous or unrelated)
 *
 * Strict Rule:
 * Gemini is ONLY used for semantic understanding and extracting canonical English drug names.
 * Gemini NEVER generates SMILES strings.
 */

import type { CandidateNodeContext, ChemicalNodeClassificationResult, ChemicalNodeClassificationType } from "./types.js";
import type { ModelGateway } from "../../generation/gateway/types.js";
import { cleanAndParseJson } from "../../generation/engine/resilient-json-parser.js";
import {
  AUTHORITATIVE_REFERENCE_COMPOUNDS,
  matchCompoundAlias,
  findMatchingScaffold,
  hasGenericScaffold,
} from "@avana/domain";
import { randomUUID } from "crypto";

const KNOWN_ABBREVIATIONS: Record<string, { name: string; type: ChemicalNodeClassificationType }> = {
  "5 fu": { name: "Fluorouracil", type: "specific_drug" },
  "5-fu": { name: "Fluorouracil", type: "specific_drug" },
  "5-fluorouracil": { name: "Fluorouracil", type: "specific_drug" },
  "5 fluorouracil": { name: "Fluorouracil", type: "specific_drug" },
  "ara c": { name: "Cytarabine", type: "specific_drug" },
  "ara-c": { name: "Cytarabine", type: "specific_drug" },
  "cytarabine": { name: "Cytarabine", type: "specific_drug" },
  "azt": { name: "Zidovudine", type: "specific_drug" },
  "zidovudine": { name: "Zidovudine", type: "specific_drug" },
  "nevirapine": { name: "Nevirapine", type: "specific_drug" },
  "physostigmine": { name: "Physostigmine", type: "specific_drug" },
  "فسوستیگمین": { name: "Physostigmine", type: "specific_drug" },
  "زیدوودین": { name: "Zidovudine", type: "specific_drug" },
  "نویراپین": { name: "Nevirapine", type: "specific_drug" },
  "سیتارابین": { name: "Cytarabine", type: "specific_drug" },
  "فلوئورویوراسیل": { name: "Fluorouracil", type: "specific_drug" },
  "۵-اف یو": { name: "Fluorouracil", type: "specific_drug" },
  "۵اف یو": { name: "Fluorouracil", type: "specific_drug" },
  "کلاوولانیک اسید": { name: "Clavulanic Acid", type: "specific_compound" },
  "کلاولانیک اسید": { name: "Clavulanic Acid", type: "specific_compound" },
  "clavulanic acid": { name: "Clavulanic Acid", type: "specific_compound" },
};

/**
 * Standard authoritative generic drug names dictionary for instant registry-independent recognition.
 */
const COMMON_SPECIFIC_DRUGS: Record<string, string> = {
  amoxicillin: "Amoxicillin",
  amoxicilline: "Amoxicillin",
  "آموکسی‌سیلین": "Amoxicillin",
  "آموکسی سیلین": "Amoxicillin",
  ampicillin: "Ampicillin",
  "آمپی‌سیلین": "Ampicillin",
  "آمپی سیلین": "Ampicillin",
  piperacillin: "Piperacillin",
  "پیپراسیلین": "Piperacillin",
  ciprofloxacin: "Ciprofloxacin",
  "سیپروفلوکساسین": "Ciprofloxacin",
  levofloxacin: "Levofloxacin",
  "لووفلوکساسین": "Levofloxacin",
  ofloxacin: "Ofloxacin",
  "افلوکساسین": "Ofloxacin",
  meropenem: "Meropenem",
  "مروپنم": "Meropenem",
  imipenem: "Imipenem",
  "ایمی‌پنم": "Imipenem",
  ertapenem: "Ertapenem",
  "ارتاپنم": "Ertapenem",
  cefalexin: "Cefalexin",
  cephalexin: "Cefalexin",
  "سفالکسین": "Cefalexin",
  ceftriaxone: "Ceftriaxone",
  "سفتریاکسون": "Ceftriaxone",
  cefotaxime: "Cefotaxime",
  "سفوتاکسیم": "Cefotaxime",
  ceftazidime: "Ceftazidime",
  "سفتازیدیم": "Ceftazidime",
  cefazoline: "Cefazolin",
  cefazolin: "Cefazolin",
  "سفازولین": "Cefazolin",
  cefaclor: "Cefaclor",
  "سفاکلور": "Cefaclor",
  cefuroxime: "Cefuroxime",
  "سفورروکسیم": "Cefuroxime",
  cefepime: "Cefepime",
  "سفپیم": "Cefepime",
  ceftaroline: "Ceftaroline",
  "سفتارولین": "Ceftaroline",
  ceftolozane: "Ceftolozane",
  "سفطولوزان": "Ceftolozane",
  azithromycin: "Azithromycin",
  "آزیترومایسین": "Azithromycin",
  clarithromycin: "Clarithromycin",
  "کلاریترومایسین": "Clarithromycin",
  erythromycin: "Erythromycin",
  "اریترومایسین": "Erythromycin",
  doxycycline: "Doxycycline",
  "داکسی‌سایکلین": "Doxycycline",
  gentamicin: "Gentamicin",
  "جنتامایسین": "Gentamicin",
  amikacin: "Amikacin",
  "آمیکاسین": "Amikacin",
  tobramycin: "Tobramycin",
  "توبرامایسین": "Tobramycin",
  streptomycin: "Streptomycin",
  "استرپتومایسین": "Streptomycin",
  vancomycin: "Vancomycin",
  "ونکومایسین": "Vancomycin",
};

/**
 * Drug family names that must NEVER be classified as specific_drug even if matching word stems.
 */
const PROTECTED_DRUG_FAMILIES = [
  "carbapenem",
  "carbapenems",
  "کارباپنم",
  "کارباپنم ها",
  "کارباپنم‌ها",
  "cephalosporin",
  "cephalosporins",
  "سفالوسپورین",
  "سفالوسپورین ها",
  "سفالوسپورین‌ها",
  "fluoroquinolone",
  "fluoroquinolones",
  "فلوروکینولون",
  "فلوروکینولون ها",
  "فلوروکینولون‌ها",
  "quinolone",
  "quinolones",
  "کینولون",
  "کینولون ها",
  "کینولون‌ها",
  "penicillin",
  "penicillins",
  "پنی سیلین",
  "پنی سیلین ها",
  "پنی‌سیلین",
  "پنی‌سیلین‌ها",
  "sulfonamide",
  "sulfonamides",
  "سولفونامید",
  "سولفونامید ها",
  "سولفونامید‌ها",
  "macrolide",
  "macrolides",
  "ماکرولید",
  "ماکرولید ها",
  "ماکرولید‌ها",
  "tetracycline",
  "tetracyclines",
  "تتراسایکلین",
  "تتراسایکلین ها",
  "تتراسایکلین‌ها",
  "aminoglycoside",
  "aminoglycosides",
  "آمینوگلیکوزید",
  "آمینوگلیکوزید ها",
  "آمینوگلیکوزید‌ها",
];

const CATEGORY_TERMS = [
  "دسته",
  "دسته بندی",
  "گروه",
  "کلاس",
  "طبقه بندی",
  "شاخه",
  "رده",
  "خانواده",
  "انواع",
  "category",
  "class",
  "classes",
  "types",
  "groups",
  "antibiotics",
  "آنتی بیوتیک ها",
  "آنتی‌بیوتیک‌ها",
  "بتالاکتام ها",
  "بتالاکتام‌ها",
  "beta lactam",
  "beta-lactam",
];

const PHARMACOLOGY_PROCESS_TERMS = [
  "فارماکوکینتیک",
  "فارماکودینامیک",
  "متابولیسم",
  "دفع",
  "جذب",
  "توزیع",
  "نیمه عمر",
  "کلیرنس",
  "زیست فراهمی",
  "pharmacokinetics",
  "pharmacodynamics",
  "bioavailability",
  "clearance",
  "half-life",
  "side effects",
  "عوارض",
  "عوارض جانبی",
  "تداخل",
  "تداخلات",
  "اندیکاسیون",
  "منع مصرف",
  "دوز",
  "پاتولوژی",
  "مقاومت",
  "مقاومت دارویی",
  "مکانیسم",
  "مکانیسم اثر",
  "مکانیسم عمل",
  "حساسیت",
  "سمیت",
  "مسمومیت",
  "mechanism",
  "mechanism of action",
  "resistance",
  "drug resistance",
  "allergy",
  "hypersensitivity",
  "toxicity",
];

const CHEMICAL_CONCEPT_TERMS = [
  "sar",
  "رابطه ساختار و فعالیت",
  "رابطه ساختار فعالیت",
  "روابط ساختار و فعالیت",
  "فارماکوفور",
  "pharmacophore",
  "بیوایزوستر",
  "bioisostere",
  "structure activity relationship",
];

export class ChemicalNodeClassifier {
  constructor(private readonly gateway?: ModelGateway) {}

  /**
   * Normalizes Persian and English text.
   */
  private normalizeText(text: string): string {
    if (!text) return "";
    return text
      .toLowerCase()
      .replace(/[\u200c\u200b\u200e\u200f\ufeff]/g, "")
      .replace(/[\u0643]/g, "ک")
      .replace(/[\u064a\u0649]/g, "ی")
      .replace(/[-_.,;:/[\]()|\\«»""''“”‘’؛،—–−•·*~?!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Fast rule-based classification check enforcing strict priority hierarchy:
   * 1. Negative Gates (PK/PD, adverse effects, dosing, etc.)
   * 2. Chemical concepts (SAR, Pharmacophore)
   * 3. Specific Drug recognition (Registry-independent, dictionary, abbreviations)
   * 4. Scaffold / Subfamily / Family Matching
   * 5. General Category Classification
   */
  classifyByRules(node: CandidateNodeContext): ChemicalNodeClassificationResult | null {
    const normTitle = this.normalizeText(node.title);
    const normDesc = this.normalizeText(node.shortDescription || "");
    const titleTokens = normTitle.split(" ").filter((t) => t.length > 0);

    // 1. Negative Gates First (Absolute priority over partial drug or family matches)
    // Exception: Explicit SAR nodes evaluated under Step 2
    const isSarConcept = CHEMICAL_CONCEPT_TERMS.some(
      (t) => normTitle.includes(this.normalizeText(t)) || normDesc.includes(this.normalizeText(t)),
    );
    if (
      !isSarConcept &&
      PHARMACOLOGY_PROCESS_TERMS.some(
        (t) => normTitle.includes(this.normalizeText(t)) || normDesc.includes(this.normalizeText(t)),
      )
    ) {
      return {
        nodeId: node.nodeId,
        classification: "pharmacological_concept",
        confidence: "high",
        reason: `گره نمایانگر فرآیندهای فارماکولوژیک، بالینی یا پاتوفیزیولوژی است: «${node.title}».`,
      };
    }

    // 2. Chemical concepts (SAR, Pharmacophore, Bioisostere)
    if (isSarConcept) {
      return {
        nodeId: node.nodeId,
        classification: "chemical_concept",
        confidence: "high",
        reason: `گره نمایانگر مفهوم ساختار-فعالیت، بیوایزواستریسم یا فارماکوفور است: «${node.title}».`,
      };
    }

    // Check if title is explicitly a protected family name (Prevent false specific_drug from stems)
    const isProtectedFamily = PROTECTED_DRUG_FAMILIES.some((fam) => {
      const normFam = this.normalizeText(fam);
      return (
        normTitle === normFam ||
        normTitle.includes(` ${normFam}`) ||
        normTitle.startsWith(`${normFam} `) ||
        normTitle.endsWith(` ${normFam}`) ||
        titleTokens.some((t) => t === normFam || t.startsWith(normFam))
      );
    });

    // 3. Specific Drug Priority (Only when NOT a protected family name!)
    if (!isProtectedFamily) {
      // 3.1 Known abbreviations / generic names dictionary
      for (const [abbr, entry] of Object.entries(KNOWN_ABBREVIATIONS)) {
        const normAbbr = this.normalizeText(abbr);
        const isMatch =
          normTitle === normAbbr ||
          normTitle.includes(` ${normAbbr} `) ||
          normTitle.startsWith(`${normAbbr} `) ||
          normTitle.endsWith(` ${normAbbr}`) ||
          normTitle.includes(`(${normAbbr})`);

        if (isMatch) {
          return {
            nodeId: node.nodeId,
            classification: entry.type,
            canonicalEnglishName: entry.name,
            confidence: "high",
            reason: `شناسایی قطعی ترکیب دارویی «${entry.name}» بر اساس نام/مخفف استاندارد «${node.title}».`,
          };
        }
      }

      // 3.2 Registry-independent specific drugs dictionary (Amoxicillin, Ciprofloxacin, Meropenem, Cefalexin, etc.)
      for (const [tokenOrName, canonName] of Object.entries(COMMON_SPECIFIC_DRUGS)) {
        const normTarget = this.normalizeText(tokenOrName);
        const matchesTitle =
          normTitle === normTarget ||
          titleTokens.includes(normTarget) ||
          normTitle.includes(` ${normTarget} `) ||
          normTitle.startsWith(`${normTarget} `) ||
          normTitle.endsWith(` ${normTarget}`);

        if (matchesTitle) {
          return {
            nodeId: node.nodeId,
            classification: "specific_drug",
            canonicalEnglishName: canonName,
            confidence: "high",
            reason: `شناسایی داروی مشخص «${canonName}» بر اساس نام ژنریک استاندارد.`,
          };
        }
      }

      // 3.3 Authoritative reference compounds registry (35 benchmark drugs)
      for (const ref of AUTHORITATIVE_REFERENCE_COMPOUNDS) {
        if (matchCompoundAlias(node.title, ref)) {
          return {
            nodeId: node.nodeId,
            classification: "specific_drug",
            canonicalEnglishName: ref.canonicalName,
            confidence: "high",
            reason: `تطابق قطعی با ترکیب مرجع «${ref.canonicalName}».`,
          };
        }
      }

      // 3.4 Safe INN Token Stem Corroboration (token-exact suffix/prefix, NEVER substring of family names!)
      for (const token of titleTokens) {
        if (token.length >= 6) {
          const isPenFamily = token.includes("penicillin") || token.includes("پنی");
          if (!isPenFamily && (token.endsWith("cillin") || token.endsWith("سیلین"))) {
            const capitalized = token.charAt(0).toUpperCase() + token.slice(1);
            return {
              nodeId: node.nodeId,
              classification: "specific_drug",
              canonicalEnglishName: capitalized,
              confidence: "medium",
              reason: `شناسایی کاندید داروی مشخص پنی‌سیلینی بر اساس پسوند INN (-cillin): «${token}».`,
            };
          }
          const isFqFamily = token.includes("fluoroquinolone") || token.includes("quinolone") || token.includes("کینولون");
          if (!isFqFamily && (token.endsWith("floxacin") || token.endsWith("فلوکساسین"))) {
            const capitalized = token.charAt(0).toUpperCase() + token.slice(1);
            return {
              nodeId: node.nodeId,
              classification: "specific_drug",
              canonicalEnglishName: capitalized,
              confidence: "medium",
              reason: `شناسایی کاندید داروی مشخص فلوروکینولونی بر اساس پسوند INN (-floxacin): «${token}».`,
            };
          }
          const isCarbFamily = token.includes("carbapenem") || token.includes("کارباپنم");
          if (!isCarbFamily && (token.endsWith("penem") || token.endsWith("پنم"))) {
            const capitalized = token.charAt(0).toUpperCase() + token.slice(1);
            return {
              nodeId: node.nodeId,
              classification: "specific_drug",
              canonicalEnglishName: capitalized,
              confidence: "medium",
              reason: `شناسایی کاندید داروی مشخص کارباپنم بر اساس پسوند INN (-penem): «${token}».`,
            };
          }
          const isCephFamily = token.includes("cephalosporin") || token.includes("سفالوسپورین");
          if (!isCephFamily && (token.startsWith("cef") || token.startsWith("ceph") || token.startsWith("سف")) && token.length >= 6) {
            const capitalized = token.charAt(0).toUpperCase() + token.slice(1);
            return {
              nodeId: node.nodeId,
              classification: "specific_drug",
              canonicalEnglishName: capitalized,
              confidence: "medium",
              reason: `شناسایی کاندید داروی مشخص سفالوسپورینی بر اساس پیشوند INN (cef-): «${token}».`,
            };
          }
        }
      }
    }

    // 4. Scaffold / Subfamily / Family Matching
    // Check if title or explicit context matches an authoritative scaffold record
    const scaffold = findMatchingScaffold(node.title);
    if (scaffold) {
      // Check explicit Aminoglycosides invariant: No generic scaffold!
      const isAminoglycosides = hasGenericScaffold(node.title) === false && (normTitle.includes("aminoglycoside") || normTitle.includes("آمینوگلیکوزید"));
      if (isAminoglycosides) {
        return {
          nodeId: node.nodeId,
          classification: "drug_class",
          confidence: "high",
          reason: "گره خانواده آمینوگلیکوزیدها فاقد هسته اسکلتی عمومی واحد در رجیستری معتبر است.",
        };
      }

      // Check whether it is a specific subfamily (e.g. 7-ADCA for 3-methyl cephalosporins or 7-ACA for 3-acetoxymethyl)
      if (scaffold.applicableSubfamily && (normTitle.includes("دزاستوکسی") || normTitle.includes("desacetoxy") || normTitle.includes("استوکسی") || normTitle.includes("acetoxymethyl"))) {
        return {
          nodeId: node.nodeId,
          classification: "drug_subfamily",
          matchedScaffold: scaffold,
          matchedScaffoldId: scaffold.id,
          applicableSubfamily: scaffold.applicableSubfamily,
          confidence: "high",
          reason: `تطابق زیرخانواده دارویی با هسته مرجع «${scaffold.canonicalName}».`,
        };
      }

      return {
        nodeId: node.nodeId,
        classification: "drug_class",
        matchedScaffold: scaffold,
        matchedScaffoldId: scaffold.id,
        confidence: "high",
        reason: `تطابق رده دارویی با هسته/ترکیب مرجع «${scaffold.canonicalName}».`,
      };
    }

    // 5. Explicit Category Groupings without scaffold
    if (CATEGORY_TERMS.some((t) => normTitle.includes(this.normalizeText(t)))) {
      return {
        nodeId: node.nodeId,
        classification: "drug_class",
        confidence: "high",
        reason: `گره نشان‌دهنده رده یا خانواده دارویی است: «${node.title}».`,
      };
    }

    return null;
  }

  /**
   * Classifies a batch of nodes, combining deterministic fast-paths with Gemini for unresolved nodes.
   */
  async classifyNodes(
    nodes: CandidateNodeContext[],
    context?: {
      mindMapTopic?: string;
      correlationId?: string;
      organizationId?: string;
      documentId?: string;
    },
  ): Promise<Record<string, ChemicalNodeClassificationResult>> {
    const results: Record<string, ChemicalNodeClassificationResult> = {};
    const unresolved: CandidateNodeContext[] = [];

    // Pass 1: Deterministic fast-path
    for (const node of nodes) {
      const ruleResult = this.classifyByRules(node);
      if (ruleResult) {
        results[node.nodeId] = ruleResult;
      } else {
        unresolved.push(node);
      }
    }

    if (unresolved.length === 0 || !this.gateway || typeof this.gateway.complete !== "function") {
      // Complete with defaults for remaining if no gateway
      for (const node of unresolved) {
        results[node.nodeId] = {
          nodeId: node.nodeId,
          classification: "unknown",
          confidence: "low",
          reason: "گره فاقد ماهیت شیمیایی محرز در تحلیل قاعده‌محور است.",
        };
      }
      return results;
    }

    // Pass 2: Gemini Semantic Classification for unresolved nodes
    try {
      const systemPrompt = `شما یک متخصص برجسته شیمی دارویی و فارماکولوژی بالینی هستید.
وظیفه شما: بررسی گره‌های یک نقشه مفهومی (Mind Map) و طبقه‌بندی دقیق ماهیت علمی هر گره در یکی از ۶ دسته زیر:

۱. "specific_drug": یک داروی شیمیایی یا بیولوژیک مشخص و تک‌مولکولی (مانند Aspirin, 5-Fluorouracil, Ara-C, Lidocaine, Morphine, Zidovudine, Nevirapine, Physostigmine).
۲. "specific_compound": یک ترکیب شیمیایی مشخص غیردارویی یا کو-فاکتور (مانند Clavulanic Acid, Glucose, Citric Acid).
۳. "drug_class": یک دسته، خانواده، یا رده دارویی کلی (مانند Beta-lactam antibiotics, NSAIDs, Statins, ACE inhibitors, Alkylating agents). توجه: رده‌های دارویی تک‌مولکول نیستند و نباید به عنوان specific_drug طبقه‌بندی شوند!
۴. "pharmacological_concept": مفاهیم فارماکولوژی، مکانیسم اثر، پارامترهای فارماکوکینتیک (مانند Pharmacokinetics, Bioavailability, Half-life, Receptor binding, Adverse effects).
۵. "chemical_concept": مفاهیم کلی شیمی، رابطه ساختار-فعالیت (SAR)، فارماکوفور، رزونانس، بیوایزواستریسم.
۶. "unknown": مفاهیم غیرمرتبط یا نامشخص.

قوانین بسیار مهم:
- اگر گره عنوان مبهم دارد اما توضیحات یا والد آن به یک داروی مشخص اشاره می‌کند، آن را به عنوان specific_drug یا specific_compound شناسایی کنید و canonicalEnglishName آن را استخراج کنید.
- نام انگلیسی دارو را در فیلد canonicalEnglishName به صورت فرم ژنریک بین‌المللی استاندارد (INN/USAN) بنویسید (مثلاً برای آسپرین: "Aspirin"، برای ۵-FU: "Fluorouracil"، برای Ara-C: "Cytarabine").
- تحت هیچ شرایطی ساختار یا رشته SMILES تولید نکنید؛ فقط طبقه‌بندی معنایی و نام انگلیسی دارو را مشخص کنید.`;

      const candidateList = unresolved.map((n) => ({
        nodeId: n.nodeId,
        title: n.title,
        shortDescription: n.shortDescription,
        parentTitle: n.parentTitle,
        parentDescription: n.parentDescription,
        childrenTitles: n.childrenTitles,
        mindMapTopic: context?.mindMapTopic,
      }));

      const userPrompt = `لطفاً گره‌های زیر را با دقت بالا طبقه‌بندی کنید:
${JSON.stringify(candidateList, null, 2)}`;

      const response = await this.gateway.complete({
        promptVersion: "chem-classifier-v1",
        correlationId: context?.correlationId || randomUUID(),
        organizationId: (context?.organizationId || randomUUID()) as any,
        documentId: (context?.documentId || randomUUID()) as any,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        jsonSchema: {
          type: "object",
          properties: {
            classifications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nodeId: { type: "string" },
                  classification: {
                    type: "string",
                    enum: [
                      "specific_drug",
                      "specific_compound",
                      "drug_class",
                      "pharmacological_concept",
                      "chemical_concept",
                      "unknown",
                    ],
                  },
                  canonicalEnglishName: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  reason: { type: "string" },
                },
                required: ["nodeId", "classification", "confidence", "reason"],
              },
            },
          },
          required: ["classifications"],
        },
        stage: "review_summary",
      });

      const parsed = cleanAndParseJson<{
        classifications?: ChemicalNodeClassificationResult[];
      }>(response.text, "chem-classifier");

      if (Array.isArray(parsed?.classifications)) {
        for (const item of parsed.classifications) {
          if (item?.nodeId) {
            results[item.nodeId] = {
              nodeId: item.nodeId,
              classification: item.classification || "unknown",
              canonicalEnglishName: item.canonicalEnglishName?.trim(),
              confidence: item.confidence || "medium",
              reason: item.reason || "طبقه‌بندی بر اساس بافت معنایی Gemini",
            };
          }
        }
      }
    } catch (err) {
      process.stderr.write(
        `[CHEMICAL_NODE_CLASSIFIER_ERROR] Gemini classification failed, using fallbacks: ${String(err)}\n`,
      );
    }

    // Fill in any remaining unresolved nodes
    for (const node of unresolved) {
      if (!results[node.nodeId]) {
        results[node.nodeId] = {
          nodeId: node.nodeId,
          classification: "unknown",
          confidence: "low",
          reason: "تحلیل معنایی برای گره نامشخص باقی ماند.",
        };
      }
    }

    return results;
  }
}
