/**
 * Mind Map Chemical Enricher — High-Reliability Independent Enrichment Engine.
 *
 * Responsibilities:
 * 1. Multi-factor intelligent node classification:
 *    - Definite chemical compound need ('definite')
 *    - Context-dependent need ('probable', e.g. SAR)
 *    - No chemical structure need ('none', e.g. category hubs, PK/PD, general pathology)
 * 2. Deterministic lookup against authoritative university benchmark compounds:
 *    - Uses AUTHORITATIVE_REFERENCE_COMPOUNDS (Aspirin, Lidocaine, Morphine, Penicillin G, Paracetamol)
 *    - Zero hallucination: Zero Gemini calls for new SMILES in Phase 1
 *    - Safe whole-phrase alias matching
 * 3. Rigorous physical/chemical validation:
 *    - parseSmilesToGraph
 *    - validateMolecularGraphValence
 *    - verifyAuthoritativeCompound (isomorphism & isomer differentiation)
 *    - validateMindMapChemicalStructure
 * 4. Tracking and node lifecycle status:
 *    - 'not_checked' | 'not_required' | 'pending' | 'enriched' | 'needs_review' | 'failed'
 * 5. Strictly idempotent and non-destructive:
 *    - Never mutates title, shortDescription, keyPoints, examTips, parentId, sortOrder, or tree topology
 *    - Never replaces previously verified structures
 */

import type {
  MindMapAiBase,
  MindMapNodeBase,
  MindMapChemicalStructure,
  MindMapNodeChemicalStatus,
  MindMapChemicalEnrichmentMetadata,
  ChemicalRelationType,
} from "@avana/contracts";
import {
  AUTHORITATIVE_REFERENCE_COMPOUNDS,
  type AuthoritativeReferenceCompound,
  matchCompoundAlias,
  verifyAuthoritativeCompound,
  validateMindMapChemicalStructure,
  parseSmilesToGraph,
  validateMolecularGraphValence,
  extractNodeChemicalMentions,
  findMatchingScaffold,
  hasGenericScaffold,
  type AuthoritativeScaffoldRecord,
} from "@avana/domain";
import {
  PubChemDataProvider,
  ChemicalCacheService,
  ChemicalNodeClassifier,
  ChemicalIdentityResolver,
  type ScientificDataProvider,
  type CandidateNodeContext,
} from "./chemistry/index.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type { Redis } from "ioredis";

export interface ChemicalEnrichmentOptions {
  gateway?: ModelGateway;
  redisClient?: Redis | null;
  provider?: ScientificDataProvider;
  cache?: ChemicalCacheService;
  mindMapTopic?: string;
  correlationId?: string;
  organizationId?: string;
  documentId?: string;
  signal?: AbortSignal;
}

export type ChemicalNeedLevel = "definite" | "probable" | "none";
export type ChemicalNodeRole = "dedicated_structure" | "compound_main" | "family_scaffold" | "sar" | "general";

export interface NodeChemicalClassification {
  level: ChemicalNeedLevel;
  matchedReference?: AuthoritativeReferenceCompound;
  matchedScaffold?: AuthoritativeScaffoldRecord;
  reason: string;
  role?: ChemicalNodeRole;
}

export interface MindMapChemicalEnrichmentResult {
  enrichedAiBase: MindMapAiBase;
  metrics: {
    totalNodes: number;
    definiteCandidates: number;
    probableCandidates: number;
    noNeedNodes: number;
    enrichedNodes: number;
    preservedExistingNodes: number;
    skippedNodes: number;
    failedNodes: number;
    relatedChemicalsCount?: number;
  };
  details: Array<{
    nodeId: string;
    title: string;
    level: ChemicalNeedLevel;
    status: MindMapNodeChemicalStatus;
    compoundId?: string;
    reason: string;
  }>;
}

/**
 * Normalized token patterns indicating a node represents a category, class, or grouping hub.
 */
const CATEGORY_DISQUALIFYING_PATTERNS = [
  "دسته",
  "دسته بندی",
  "گروه",
  "گروه ها",
  "کلاس",
  "طبقه بندی",
  "شاخه",
  "رده",
  "خانواده",
  "انواع",
  "سرفصل",
  "مجموعه",
  "category",
  "class",
  "classes",
  "types",
  "groups",
];

/**
 * Normalized token patterns indicating pharmacological, clinical, or biological processes rather than an atomic compound.
 */
const PROCESS_DISQUALIFYING_PATTERNS = [
  // Pharmacokinetics & Pharmacodynamics
  "فارماکوکینتیک",
  "فارماکودینامیک",
  "فارماکوکینتیکی",
  "فارماکودینامیکی",
  "متابولیسم",
  "متابولیت",
  "دفع",
  "جذب",
  "توزیع",
  "نیمه عمر",
  "کلیرنس",
  "زیست فراهمی",
  "pharmacokinetics",
  "pharmacodynamics",
  "metabolism",
  "elimination",
  "absorption",
  "distribution",
  "clearance",
  "bioavailability",

  // Clinical & therapeutic aspects
  "کاربرد",
  "کاربردهای بالینی",
  "موارد مصرف",
  "اندیکاسیون",
  "اندیکاسیون ها",
  "عوارض",
  "عوارض جانبی",
  "اثرات جانبی",
  "تداخل",
  "تداخلات",
  "تداخل دارویی",
  "منع مصرف",
  "موارد منع مصرف",
  "احتیاط",
  "پایش",
  "مسمومیت",
  "دوز",
  "دوزاژ",
  "تجویز",
  "مصرف",
  "indications",
  "adverse",
  "side effects",
  "toxicity",
  "contraindications",
  "interactions",
  "dosage",

  // Mechanism & cellular pathways
  "مکانیسم",
  "مکانیسم اثر",
  "مکانیسم سلولی",
  "مکانیسم مولکولی",
  "مسیر سیگنال",
  "مسیر بیوشیمیایی",
  "گیرنده",
  "گیرنده ها",
  "کانال یونی",
  "پمپ یونی",
  "آنزیم",
  "mechanism",
  "mechanism of action",
  "pathway",
  "receptor",

  // Pathology & General
  "بیماری",
  "اختلال",
  "سندرم",
  "پاتولوژی",
  "فیزیولوژی",
  "پاتوفیزیولوژی",
  "disease",
  "syndrome",
  "pathology",
  "physiology",
];

/**
 * Patterns indicating Structure-Activity Relationship (SAR) or pharmacophore analysis.
 */
const SAR_PATTERNS = [
  "رابطه ساختار و فعالیت",
  "رابطه ساختار فعالیت",
  "روابط ساختار فعالیت",
  "روابط ساختار و فعالیت",
  "ساختار فعالیت",
  "ساختار و فعالیت",
  "فارماکوفور",
  "گروه عاملی",
  "گروه های عاملی",
  "تغییر ساختاری",
  "مشتقات ساختاری",
  "sar",
  "structure activity",
  "pharmacophore",
];

/**
 * Normalizes title for robust lexical matching.
 */
function cleanNodeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/\u200c/g, " ") // ZWNJ to space for token separation
    .replace(/[\u0643]/g, "ک")
    .replace(/[\u064a\u0649]/g, "ی")
    .replace(/[-_.,;:/()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Patterns indicating a node is specifically dedicated to representing a chemical or molecular structure.
 */
export const DEDICATED_STRUCTURE_PATTERNS: string[] = [
  "ساختار مولکولی",
  "ساختار شیمیایی",
  "ساختار ۲ بعدی",
  "ساختار ۲بعدی",
  "ساختار دوبعدی",
  "ساختار 2d",
  "ساختار 2D",
  "فرمول ساختاری",
  "فرمول مولکولی",
  "اسکلت کربنی",
  "ساختار و فرمول",
  "ویژگی های ساختاری",
  "ویژگی‌های ساختاری",
  "molecular structure",
  "chemical structure",
  "2d structure",
  "skeletal structure",
  "structural formula",
  "chemical formula",
];

/**
 * Checks whether a node is explicitly dedicated to displaying a molecular or chemical structure.
 */
export function isDedicatedStructureNode(title: string, shortDesc?: string): boolean {
  if (!title) return false;
  const normTitle = cleanNodeText(title);
  if (DEDICATED_STRUCTURE_PATTERNS.some((p) => normTitle.includes(cleanNodeText(p)))) {
    return true;
  }
  if (normTitle === "ساختار" || normTitle === "structure") {
    return true;
  }
  if (shortDesc) {
    const normDesc = cleanNodeText(shortDesc);
    if (
      normDesc.startsWith("ساختار مولکولی") ||
      normDesc.startsWith("ساختار شیمیایی") ||
      normDesc.startsWith("فرمول ساختاری") ||
      normDesc.startsWith("molecular structure")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves whether a candidate name or title matches an authoritative reference compound.
 * Leverages multi-segment and affix-stripping alias matching.
 */
export function findMatchingReferenceCompound(
  title: string,
): AuthoritativeReferenceCompound | undefined {
  if (!title) return undefined;
  for (const ref of AUTHORITATIVE_REFERENCE_COMPOUNDS) {
    if (matchCompoundAlias(title, ref)) {
      return ref;
    }
  }
  return undefined;
}

/**
 * Evaluates whether a node represents a Structure-Activity Relationship (SAR) concept.
 */
function isSarNode(title: string, shortDesc?: string): boolean {
  const normTitle = cleanNodeText(title);
  const normDesc = shortDesc ? cleanNodeText(shortDesc) : "";

  return (
    SAR_PATTERNS.some((p) => normTitle.includes(p)) ||
    (normDesc.length > 0 && SAR_PATTERNS.some((p) => normDesc.includes(p)))
  );
}

/**
 * Classifies a node's requirement for a chemical structure based on multi-factor analysis:
 * 1. Topology & Role (root, parentId, nodeRole, children count)
 * 2. Category & Semantic Domain
 * 3. Lexical Aspect Filtering (PK/PD, Class, Adverse Effects, Pathology)
 * 4. Dedicated Molecular Structure node resolution (own title or parent context)
 * 5. Direct Authoritative Reference Compound Registry matching
 * 6. Content-dependent SAR context evaluation
 */
export function classifyMindMapNodeChemicalNeed(
  node: MindMapNodeBase,
  allNodes: Record<string, MindMapNodeBase>,
  rootNodeId: string,
): NodeChemicalClassification {
  // 1. Root node: Zero chemical structure need
  if (node.id === rootNodeId || node.parentId === null) {
    return {
      level: "none",
      role: "general",
      reason: "گره ریشه نقشه مفهومی فاقد ماهیت ترکیب شیمیایی اتمیک است.",
    };
  }

  const normTitle = cleanNodeText(node.title);
  const normDesc = cleanNodeText(node.shortDescription || "");
  const isSar = isSarNode(node.title, node.shortDescription);

  // 2. Negative Gates First: Pharmacological, clinical, and physiological process keywords
  // Strict precedence: never attribute structure to PK/PD, adverse effects, dosing, disease or pathway
  if (!isSar && PROCESS_DISQUALIFYING_PATTERNS.some((p) => normTitle.includes(p))) {
    return {
      level: "none",
      role: "general",
      reason: `گره نمایانگر جنبه‌های فرآیندی (فارماکوکینتیک، عوارض، مکانیسم، پاتولوژی) است: «${node.title}».`,
    };
  }

  // 3. Explicit non-chemical categories
  if (node.category === "disease") {
    return {
      level: "none",
      role: "general",
      reason: "گره‌های مربوط به بیماری و پاتولوژی نیازی به ساختار شیمیایی ندارند.",
    };
  }

  // 4. Dedicated Molecular Structure Node (Priority Target)
  if (isDedicatedStructureNode(node.title, node.shortDescription)) {
    // 4.1 First check if the title itself mentions a reference compound (e.g. "ساختار مولکولی آسپرین")
    let structRef = findMatchingReferenceCompound(node.title);

    // 4.2 If not directly in title, resolve from parent or ancestor chain (e.g. Parent "آسپرین" -> Child "ساختار مولکولی")
    if (!structRef) {
      let currParentId = node.parentId;
      while (currParentId && allNodes[currParentId]) {
        const parentNode = allNodes[currParentId];
        if (parentNode.id === rootNodeId || parentNode.parentId === null) break;
        const pRef = findMatchingReferenceCompound(parentNode.title);
        if (pRef) {
          structRef = pRef;
          break;
        }
        // If parent is a process node, do not climb further
        const normPTitle = cleanNodeText(parentNode.title);
        if (PROCESS_DISQUALIFYING_PATTERNS.some((p) => normPTitle.includes(p))) break;
        currParentId = parentNode.parentId;
      }
    }

    if (structRef) {
      return {
        level: "definite",
        matchedReference: structRef,
        role: "dedicated_structure",
        reason: `گره اختصاصی ساختار مولکولی ترکیب مرجع «${structRef.canonicalName}».`,
      };
    }

    return {
      level: "none",
      role: "general",
      reason: "گره ساختار مولکولی فاقد ترکیب مرجع دارویی مشخص در عنوان یا گره‌های والد است.",
    };
  }

  // 5. Direct Authoritative Reference Compound Match (Definite Need)
  const matchedRef = findMatchingReferenceCompound(node.title);
  if (matchedRef) {
    const hasDisqualifier = [...CATEGORY_DISQUALIFYING_PATTERNS, ...PROCESS_DISQUALIFYING_PATTERNS].some((p) =>
      normTitle.includes(p),
    );

    if (!hasDisqualifier) {
      return {
        level: "definite",
        matchedReference: matchedRef,
        role: "compound_main",
        reason: `تطابق قطعی با ترکیب مرجع «${matchedRef.canonicalName}» در رجیستری معتبر.`,
      };
    }
  }

  // 6. SAR Analysis (Probable / Context-Dependent Need)
  // Dual SAR pathway: only inherits structure if parent node is an authoritative validated drug!
  if (isSar) {
    let contextRef: AuthoritativeReferenceCompound | undefined;

    if (node.parentId && allNodes[node.parentId]) {
      const parentNode = allNodes[node.parentId];
      contextRef = findMatchingReferenceCompound(parentNode.title);
    }

    if (contextRef) {
      return {
        level: "probable",
        matchedReference: contextRef,
        role: "sar",
        reason: `گره تحلیل رابطه ساختار-فعالیت (SAR) وابسته به ترکیب مرجع «${contextRef.canonicalName}».`,
      };
    }

    // Generic SAR without direct drug parent: Level probable without reference -> stays needs_review
    return {
      level: "probable",
      role: "general",
      reason: "گره تحلیل ساختار-فعالیت (SAR) عمومی است و ترکیب مرجع مشخصی برای آن در متن تعیین نشده است.",
    };
  }

  // 7. Explicit category node role without reference match: Hubs with nodeRole === "category" must never get primary structures
  if (node.nodeRole === "category") {
    return {
      level: "none",
      role: "general",
      reason: "گره‌های با نقش دسته‌بندی (category) چتر مفهومی هستند و ترکیب مولکولی مستقل نیستند.",
    };
  }

  // 8. Contextual Scaffold / Subfamily / Family Matching
  // Check if title or explicit text in title/shortDescription matches an authoritative scaffold record
  const scaffold = findMatchingScaffold(node.title);
  if (scaffold) {
    const isAminoglycosides = hasGenericScaffold(node.title) === false && (normTitle.includes("aminoglycoside") || normTitle.includes("آمینوگلیکوزید"));
    if (!isAminoglycosides) {
      // Stringent Cephalosporin Subfamily check: Title and description must explicitly indicate the subfamily
      // A single child mention does NOT generalize 7-ACA or 7-ADCA to an entire family!
      if (scaffold.id === "scaffold_cephalosporins_7aca") {
        const isExplicit7aca = normTitle.includes("استوکسی") || normTitle.includes("acetoxymethyl") || normDesc.includes("استوکسی متیل") || normDesc.includes("acetoxymethyl");
        if (isExplicit7aca) {
          return {
            level: "definite",
            matchedScaffold: scaffold,
            role: "family_scaffold",
            reason: `تطابق زیرخانواده سفالوسپورین‌های ۳-استوکسی‌متیل با هسته مرجع «${scaffold.canonicalName}».`,
          };
        }
      } else if (scaffold.id === "scaffold_cephalosporins_7adca") {
        const isExplicit7adca = normTitle.includes("دزاستوکسی") || normTitle.includes("desacetoxy") || normTitle.includes("3 متیل") || normTitle.includes("۳ متیل") || normDesc.includes("دزاستوکسی") || normDesc.includes("desacetoxy");
        if (isExplicit7adca) {
          return {
            level: "definite",
            matchedScaffold: scaffold,
            role: "family_scaffold",
            reason: `تطابق زیرخانواده سفالوسپورین‌های ۳-متیل/دزاستوکسی با هسته مرجع «${scaffold.canonicalName}».`,
          };
        }
      } else {
        // General Family Scaffold (e.g. Penicillins 6-APA, Sulfanilamide, Sancycline, Fluoroquinolone core, Carbapenem nucleus, Erythronolide B)
        return {
          level: "definite",
          matchedScaffold: scaffold,
          role: "family_scaffold",
          reason: `تطابق رده دارویی با هسته/ترکیب مرجع «${scaffold.canonicalName}».`,
        };
      }
    }
  }

  // 8. General Category grouping keywords without scaffold match
  if (CATEGORY_DISQUALIFYING_PATTERNS.some((p) => normTitle.includes(p))) {
    return {
      level: "none",
      role: "general",
      reason: `عنوان گره شامل واژگان دسته‌بندی کلان («${node.title}») است و نباید ساختار مولکولی دریافت کند.`,
    };
  }

  // 9. Drug category without local reference match
  if (node.category === "drug") {
    return {
      level: "definite",
      role: "general",
      reason: `گره دارویی است اما در رجیستری ۵ ترکیب مرجع فاز ۱ ثبت نشده است: «${node.title}».`,
    };
  }

  // 10. All other concepts
  return {
    level: "none",
    role: "general",
    reason: "مفهوم عمومی فاقد نیاز به ساختار شیمیایی.",
  };
}

/**
 * Validates candidate chemical structure against full scientific invariants.
 */
export function validateEnrichmentStructure(
  candidate: MindMapChemicalStructure,
): { valid: boolean; errors: string[] } {
  // 1. Syntax check
  const graph = parseSmilesToGraph(candidate.smiles);
  if (!graph.valid) {
    return { valid: false, errors: graph.errors };
  }

  // 2. Valence & Graph check
  const valence = validateMolecularGraphValence(graph);
  if (!valence.valid) {
    return { valid: false, errors: valence.errors };
  }

  // 3. Authoritative Compound Identity Verification
  const idVerification = verifyAuthoritativeCompound(
    candidate.compoundName,
    candidate.smiles,
  );
  if (idVerification.matched && !idVerification.verified) {
    return {
      valid: false,
      errors: [
        idVerification.error ||
          `ساختار ارائه‌شده با هویت ترکیب مرجع «${candidate.compoundName}» مطابقت ندارد.`,
      ],
    };
  }

  // 4. Mind Map Chemical Structure Validation
  const mindMapValidation = validateMindMapChemicalStructure(candidate);
  if (!mindMapValidation.valid) {
    return { valid: false, errors: mindMapValidation.errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Resolves the precise scientific relation between a reference compound and a mind map node.
 * Strictly distinguishes class members from combination partners, mechanism examples, and SAR.
 */
export function resolveNodeChemicalRelation(
  node: MindMapNodeBase,
  ref: AuthoritativeReferenceCompound,
  _mention: { mentionText: string; provenanceField: string },
): {
  relationType: ChemicalRelationType;
  educationalNote?: string;
} {
  const normNodeTitle = cleanNodeText(node.title);
  const normNodeDesc = cleanNodeText(node.shortDescription || "");
  const normNodeId = (node.id || "").toLowerCase();
  const isSar = isSarNode(node.title, node.shortDescription);

  // 1. SAR context
  if (isSar) {
    return {
      relationType: "sar_related",
      educationalNote: `تحلیل رابطه ساختار و فعالیت (SAR) و فارماکوفور داروی ${ref.canonicalName}.`,
    };
  }

  // 2. Beta-Lactamase Inhibitor Node (e.g. "مهارکننده‌های بتالاکتاماز")
  const isBetaLactamaseInhibitorTopic =
    normNodeTitle.includes("مهارکننده های بتالاکتاماز") ||
    normNodeTitle.includes("مهارکننده بتالاکتاماز") ||
    normNodeTitle.includes("مهار کننده های بتا لاکتاماز") ||
    normNodeId.includes("beta_lactamase");

  if (isBetaLactamaseInhibitorTopic) {
    // True beta-lactamase inhibitors: Clavulanic Acid, Sulbactam, Tazobactam
    if (
      ref.id === "clavulanic_acid" ||
      ref.id === "sulbactam" ||
      ref.id === "tazobactam" ||
      ref.drugClass?.toLowerCase().includes("beta-lactamase inhibitor")
    ) {
      return {
        relationType: "class_member",
        educationalNote: "مهارکننده سوبسترای انتحاری بتالاکتاماز با اتصال کووالانسی به سرین فعال آنزیم.",
      };
    }

    // Partner penicillins in fixed-dose combinations (Co-amoxiclav, Zosyn, etc.)
    if (ref.id === "amoxicillin" || ref.id === "piperacillin" || ref.id === "ampicillin" || ref.id === "ticarcillin") {
      return {
        relationType: "combination_component",
        educationalNote:
          ref.id === "amoxicillin"
            ? "جزء آنتی‌بیوتیکی پنی‌سیلینی (آمینوپنی‌سیلین) در ترکیب دارویی با کلاولانیک اسید (کو-آموکسی‌کلاو)."
            : ref.id === "piperacillin"
              ? "جزء آنتی‌بیوتیکی پنی‌سیلینی وسیع‌الطیف (اورئیدوپنی‌سیلین ضد سودوموناس) در ترکیب دارویی با تازوباکتام (زوسین)."
              : `جزء آنتی‌بیوتیکی پنی‌سیلینی در ترکیب با مهارکننده بتالاکتاماز.`,
      };
    }
  }

  // 3. Cephalosporin Category Node (e.g. "نسل سوم، چهارم و ترکیبات پیشرفته" or "نسل اول و دوم سفالوسپورین‌ها")
  const isCephalosporinTopic =
    normNodeTitle.includes("سفالوسپورین") ||
    normNodeTitle.includes("cephalosporin") ||
    normNodeId.includes("cephalosporin") ||
    normNodeTitle.includes("نسل سوم") ||
    normNodeTitle.includes("نسل چهارم") ||
    normNodeDesc.includes("سفالوسپورین");

  if (isCephalosporinTopic) {
    // Tazobactam is a beta-lactamase inhibitor, NOT a cephalosporin.
    // Present in combination with Ceftolozane (Zerbaxa).
    if (ref.id === "tazobactam" || ref.id === "sulbactam" || ref.id === "clavulanic_acid") {
      return {
        relationType: "combination_component",
        educationalNote:
          ref.id === "tazobactam"
            ? "مهارکننده بتالاکتاماز مورد استفاده در ترکیب دارویی با سفطولوزان (Zerbaxa) جهت مقابله با باکتری‌های گرم‌منفی مقاوم."
            : "مهارکننده بتالاکتاماز کمکی در ترکیب با سفالوسپورین‌ها.",
      };
    }

    if (ref.drugClass?.toLowerCase().includes("cephalosporin") || ref.id.startsWith("cef")) {
      return {
        relationType: "class_member",
        educationalNote: `عضو رده دارویی سفالوسپورین‌ها: ${ref.canonicalName}.`,
      };
    }
  }

  // 4. Natural & Acid-Stable Penicillins Node ("پنی‌سیلین‌های طبیعی و مقاوم به اسید")
  const isNaturalPenicillinsTopic =
    normNodeTitle.includes("طبیعی") &&
    (normNodeTitle.includes("پنی سیلین") || normNodeTitle.includes("پنی‌سیلین"));

  if (isNaturalPenicillinsTopic) {
    if (ref.id === "penicillin_v") {
      return {
        relationType: "class_member",
        educationalNote: "پنی‌سیلین طبیعی مقاوم به اسید معده (Acid-stable) به دلیل حضور گروه فنوکسی الکترون‌کش؛ مناسب برای مصرف خوراکی.",
      };
    }
    if (ref.id === "penicillin_g") {
      return {
        relationType: "example_of",
        educationalNote: "پنی‌سیلین طبیعی ناپایدار در برابر اسید معده (Acid-labile) به دلیل هیدرولیز اسیدی حلقه بتا-لاکتام؛ تجویز اختصاصی به فرم تزریقی.",
      };
    }
  }

  // 5. Penicillinase-Resistant & Aminopenicillins Node ("مقاوم به بتالاکتاماز و آمینوبنی‌سیلین‌ها")
  const isPenicillinaseOrAminoTopic =
    (normNodeTitle.includes("مقاوم به بتالاکتاماز") || normNodeTitle.includes("امینو") || normNodeTitle.includes("آمینوبنی سیلین") || normNodeTitle.includes("آمینوبنی‌سیلین")) &&
    (normNodeTitle.includes("پنی سیلین") || normNodeTitle.includes("پنی‌سیلین") || normNodeTitle.includes("بنی سیلین"));

  if (isPenicillinaseOrAminoTopic) {
    if (["methicillin", "oxacillin", "cloxacillin", "dicloxacillin", "nafcillin"].includes(ref.id)) {
      return {
        relationType: "class_member",
        educationalNote: "پنی‌سیلین مقاوم به پنی‌سیلیناز از طریق ممانعت فضایی (Steric Hindrance) زنجیره جانبی آروماتیک حجیم.",
      };
    }
    if (["ampicillin", "amoxicillin"].includes(ref.id)) {
      return {
        relationType: "class_member",
        educationalNote: "آمینوپنی‌سیلین با گروه باردار آمینو جهت عبور از کانال‌های پورین دیواره باکتری‌های گرم‌منفی.",
      };
    }
  }

  // 6. First and Second Generation Cephalosporins Node ("نسل اول و دوم سفالوسپورین‌ها")
  if (normNodeTitle.includes("نسل اول") || normNodeTitle.includes("نسل دوم")) {
    if (ref.drugClass?.toLowerCase().includes("cephalosporin")) {
      return {
        relationType: "class_member",
        educationalNote: `عضو سفالوسپورین‌های نسل پایه: ${ref.canonicalName}.`,
      };
    }
  }

  // 7. Nitroimidazoles & Fosfomycin Node ("نیترویمیدازول‌ها و فسفومایسین")
  if (normNodeTitle.includes("نیترویمیدازول") || normNodeTitle.includes("فسفومایسین")) {
    if (ref.id === "fosfomycin" || ref.id === "metronidazole" || ref.id === "tinidazole") {
      return {
        relationType: "class_member",
        educationalNote:
          ref.id === "fosfomycin"
            ? "مهارکننده اختصاصی ترانسفراز MurA در مراحل بیوسنتز اولیه پپتیدوگلیکان."
            : "ضدباکتری بی‌هوازی و ضدتک‌یاخته از خانواده ۵-نیترویمیدازول‌ها با فعال‌سازی احیایی داخل سلولی.",
      };
    }
  }

  // 8. Cellular mechanism / PBPs / Cross-link nodes
  if (
    node.category === "cellular_mechanism" ||
    node.category === "biochemistry" ||
    normNodeTitle.includes("دیواره سلولی") ||
    normNodeTitle.includes("کراس لینک") ||
    normNodeTitle.includes("pbps")
  ) {
    return {
      relationType: "mechanism_related",
      educationalNote: `نمونه ترکیب مرتبط با مکانیسم اثر بیوشیمیایی و سلولی: ${ref.canonicalName}.`,
    };
  }

  // 9. Generic umbrella categories (e.g. "عوامل ضدباکتری متفرقه")
  if (normNodeTitle.includes("متفرقه") || normNodeTitle.includes("خانواده") || normNodeTitle.includes("اصول")) {
    return {
      relationType: "example_of",
      educationalNote: `نمونه دارویی مطرح‌شده در این مبحث: ${ref.canonicalName}.`,
    };
  }

  // 10. Default fallback
  return {
    relationType: "mentioned_in",
    educationalNote: `ترکیب دارویی مطرح‌شده در متن گره: ${ref.canonicalName}.`,
  };
}

/**
 * Enriches a MindMapAiBase with chemical structures and processing statuses.
 *
 * Guarantees:
 * - 100% idempotent: Re-running does not replace verified structures or mutate original node content
 * - Failure-tolerant: Errors in chemical enrichment will not crash the mind map pipeline
 * - Strict non-mutation of titles, descriptions, keyPoints, examTips, and tree topology
 */
export function enrichMindMapChemicalsWithReport(
  aiBase: MindMapAiBase,
): MindMapChemicalEnrichmentResult {
  const totalNodes = Object.keys(aiBase.nodes).length;
  let definiteCandidates = 0;
  let probableCandidates = 0;
  let noNeedNodes = 0;
  let enrichedNodes = 0;
  let preservedExistingNodes = 0;
  let skippedNodes = 0;
  let failedNodes = 0;

  const enrichedNodesDict: Record<string, MindMapNodeBase> = {};
  const details: MindMapChemicalEnrichmentResult["details"] = [];

  // Pass 0: Identify nodes that are already validated (Idempotency)
  const alreadyEnrichedCompounds = new Set<string>();
  for (const origNode of Object.values(aiBase.nodes)) {
    if (origNode.chemicalStructure?.isValidated === true && origNode.chemicalStructure?.confidence === "high") {
      const ref =
        findMatchingReferenceCompound(origNode.chemicalStructure.compoundName) ||
        AUTHORITATIVE_REFERENCE_COMPOUNDS.find(
          (r) => r.canonicalSmiles === origNode.chemicalStructure?.smiles,
        );
      if (ref) {
        alreadyEnrichedCompounds.add(ref.id);
      }
    }
  }

  // Pass 1: Build base copies and classify chemical need for all nodes
  type NodePlan = {
    nodeId: string;
    origNode: MindMapNodeBase;
    nodeCopy: MindMapNodeBase;
    isPreserved: boolean;
    classification: NodeChemicalClassification;
  };

  const nodePlans: Record<string, NodePlan> = {};

  for (const [nodeId, origNode] of Object.entries(aiBase.nodes)) {
    const nodeCopy: MindMapNodeBase = {
      ...origNode,
      keyPoints: Array.isArray(origNode.keyPoints) ? [...origNode.keyPoints] : [],
      examTips: Array.isArray(origNode.examTips) ? [...origNode.examTips] : [],
      examples: Array.isArray(origNode.examples) ? [...origNode.examples] : [],
      sourceReferences: Array.isArray(origNode.sourceReferences)
        ? origNode.sourceReferences.map((r) => ({ ...r }))
        : [],
    };

    // Idempotency: preserve already validated structures completely
    if (nodeCopy.chemicalStructure?.isValidated === true && nodeCopy.chemicalStructure?.confidence === "high") {
      nodePlans[nodeId] = {
        nodeId,
        origNode,
        nodeCopy,
        isPreserved: true,
        classification: {
          level: "definite",
          role: "compound_main",
          reason: "ساختار شیمیایی معتبر قبلی بدون تغییر حفظ شد (Idempotent).",
        },
      };
      continue;
    }

    const classification = classifyMindMapNodeChemicalNeed(
      origNode,
      aiBase.nodes,
      aiBase.rootNodeId,
    );

    nodePlans[nodeId] = {
      nodeId,
      origNode,
      nodeCopy,
      isPreserved: false,
      classification,
    };
  }

  // Pass 2: Whole-Tree Prioritization & Deduplication per Compound
  // Group unvalidated candidate nodes by compound ID
  const compoundCandidates: Record<
    string,
    {
      dedicated: NodePlan[];
      main: NodePlan[];
      sar: NodePlan[];
    }
  > = {};

  for (const plan of Object.values(nodePlans)) {
    if (plan.isPreserved) continue;
    const ref = plan.classification.matchedReference;
    if (!ref) continue;

    if (!compoundCandidates[ref.id]) {
      compoundCandidates[ref.id] = { dedicated: [], main: [], sar: [] };
    }

    if (plan.classification.role === "dedicated_structure") {
      compoundCandidates[ref.id].dedicated.push(plan);
    } else if (plan.classification.role === "compound_main") {
      compoundCandidates[ref.id].main.push(plan);
    } else if (plan.classification.role === "sar") {
      compoundCandidates[ref.id].sar.push(plan);
    }
  }

  // Apply Whole-Tree Prioritization rules
  for (const [refId, groups] of Object.entries(compoundCandidates)) {
    const refName =
      groups.dedicated[0]?.classification.matchedReference?.canonicalName ||
      groups.main[0]?.classification.matchedReference?.canonicalName ||
      groups.sar[0]?.classification.matchedReference?.canonicalName ||
      refId;

    // If an existing validated node already exists in the tree for this compound, suppress duplicate assignments
    if (alreadyEnrichedCompounds.has(refId)) {
      for (const plan of [...groups.dedicated, ...groups.main]) {
        plan.classification = {
          level: "none",
          role: "general",
          reason: `جهت جلوگیری از انتساب ساختارهای تکراری به گره‌های متعدد ترکیب «${refName}»، ساختار قبلاً در گره دیگری از درخت ثبت شده است.`,
        };
      }
      continue;
    }

    if (groups.dedicated.length > 0) {
      // Pick the primary dedicated structure node
      const primaryDedicated = groups.dedicated[0];

      // Suppress secondary dedicated structure nodes (prevent duplicates in same subbranch/tree)
      for (let i = 1; i < groups.dedicated.length; i++) {
        const secPlan = groups.dedicated[i];
        secPlan.classification = {
          level: "none",
          role: "general",
          reason: `جهت جلوگیری از انتساب ساختارهای تکراری به گره‌های متعدد ترکیب «${refName}»، ساختار به گره «${primaryDedicated.origNode.title}» اختصاص داده شد.`,
        };
      }

      // Suppress compound_main nodes because a dedicated structure node exists
      for (const mainPlan of groups.main) {
        mainPlan.classification = {
          level: "none",
          role: "general",
          reason: `ساختار مولکولی به گره اختصاصی ساختار «${primaryDedicated.origNode.title}» متصل شد؛ جهت جلوگیری از تکرار در گره اصلی درج نشد.`,
        };
      }
    } else if (groups.main.length > 1) {
      // Multiple main nodes for the same compound: keep first, suppress rest
      const primaryMain = groups.main[0];
      for (let i = 1; i < groups.main.length; i++) {
        const secMain = groups.main[i];
        secMain.classification = {
          level: "none",
          role: "general",
          reason: `جهت جلوگیری از انتساب ساختارهای تکراری به گره‌های متعدد ترکیب «${refName}»، ساختار به گره «${primaryMain.origNode.title}» اختصاص داده شد.`,
        };
      }
    }

    // Deduplicate SAR nodes if multiple exist for the same compound
    if (groups.sar.length > 1) {
      const primarySar = groups.sar[0];
      for (let i = 1; i < groups.sar.length; i++) {
        const secSar = groups.sar[i];
        secSar.classification = {
          level: "none",
          role: "general",
          reason: `جهت جلوگیری از انتساب ساختارهای تکراری SAR ترکیب «${refName}»، ساختار به گره «${primarySar.origNode.title}» اختصاص داده شد.`,
        };
      }
    }
  }

  // Pass 3: Process and enrich nodes according to final classifications
  for (const [nodeId, plan] of Object.entries(nodePlans)) {
    const { origNode, nodeCopy, isPreserved, classification } = plan;

    if (isPreserved) {
      preservedExistingNodes++;
      nodeCopy.chemicalStatus = "enriched";
      enrichedNodesDict[nodeId] = nodeCopy;
      details.push({
        nodeId,
        title: origNode.title,
        level: "definite",
        status: "enriched",
        compoundId: nodeCopy.chemicalStructure?.compoundName,
        reason: classification.reason,
      });
      continue;
    }

    if (classification.level === "none") {
      noNeedNodes++;
      nodeCopy.chemicalStatus = "not_required";
      // Ensure no dangling invalid structure is retained on non-chemical nodes
      if (nodeCopy.chemicalStructure && !nodeCopy.chemicalStructure.isValidated) {
        delete nodeCopy.chemicalStructure;
      }
      enrichedNodesDict[nodeId] = nodeCopy;
      details.push({
        nodeId,
        title: origNode.title,
        level: "none",
        status: "not_required",
        reason: classification.reason,
      });
      continue;
    }

    if (classification.level === "probable") {
      probableCandidates++;

      if (classification.matchedReference) {
        const ref = classification.matchedReference;
        const candidateStructure: MindMapChemicalStructure = {
          compoundName: ref.canonicalName,
          smiles: ref.canonicalSmiles,
          formula: ref.formula,
          molecularWeight: ref.molecularWeight,
          iupacName: ref.iupacName,
          drugClass: ref.drugClass,
          educationalNote: `ساختار مرجع جهت تحلیل رابطه ساختار و فعالیت (SAR) داروی ${ref.canonicalName}.`,
        };

        const validation = validateEnrichmentStructure(candidateStructure);
        if (validation.valid) {
          nodeCopy.chemicalStructure = {
            ...candidateStructure,
            confidence: "high",
            isValidated: true,
          };
          nodeCopy.chemicalStatus = "enriched";
          enrichedNodes++;
          enrichedNodesDict[nodeId] = nodeCopy;
          details.push({
            nodeId,
            title: origNode.title,
            level: "probable",
            status: "enriched",
            compoundId: ref.id,
            reason: classification.reason,
          });
          continue;
        }
      }

      // Ambiguous SAR or no verified reference compound -> Do NOT generate structure in Phase 1
      nodeCopy.chemicalStatus = "needs_review";
      if (nodeCopy.chemicalStructure && !nodeCopy.chemicalStructure.isValidated) {
        delete nodeCopy.chemicalStructure;
      }
      skippedNodes++;
      enrichedNodesDict[nodeId] = nodeCopy;
      details.push({
        nodeId,
        title: origNode.title,
        level: "probable",
        status: "needs_review",
        reason: classification.reason,
      });
      continue;
    }

    // level === 'definite'
    definiteCandidates++;

    if (classification.matchedReference) {
      const ref = classification.matchedReference;
      const candidateStructure: MindMapChemicalStructure = {
        compoundName: ref.canonicalName,
        smiles: ref.canonicalSmiles,
        formula: ref.formula,
        molecularWeight: ref.molecularWeight,
        iupacName: ref.iupacName,
        drugClass: ref.drugClass,
        referenceCompoundId: ref.id,
        canonicalName: ref.canonicalName,
        displayName: ref.canonicalName,
        chemicalForm: "free_base",
        sourceNodeId: nodeId,
        provenanceField: "title",
        matchedMention: origNode.title,
        relationType: "primary_structure",
      };

      const validation = validateEnrichmentStructure(candidateStructure);
      if (validation.valid) {
        nodeCopy.chemicalStructure = {
          ...candidateStructure,
          confidence: "high",
          isValidated: true,
        };
        nodeCopy.chemicalStatus = "enriched";
        enrichedNodes++;
        enrichedNodesDict[nodeId] = nodeCopy;
        details.push({
          nodeId,
          title: origNode.title,
          level: "definite",
          status: "enriched",
          compoundId: ref.id,
          reason: classification.reason,
        });
      } else {
        nodeCopy.chemicalStatus = "failed";
        failedNodes++;
        enrichedNodesDict[nodeId] = nodeCopy;
        details.push({
          nodeId,
          title: origNode.title,
          level: "definite",
          status: "failed",
          compoundId: ref.id,
          reason: `اعتبارسنجی ساختار شکست خورد: ${validation.errors.join("; ")}`,
        });
      }
    } else if (classification.matchedScaffold) {
      const scaffold = classification.matchedScaffold;
      const scaffoldSmiles = scaffold.isomericSmiles || scaffold.canonicalSmiles;
      const candidateStructure: MindMapChemicalStructure = {
        compoundName: scaffold.canonicalName,
        smiles: scaffoldSmiles,
        formula: scaffold.formula,
        molecularWeight: scaffold.molecularWeight,
        iupacName: scaffold.iupacName,
        drugClass: scaffold.applicableFamily,
        referenceCompoundId: scaffold.id,
        canonicalName: scaffold.canonicalName,
        displayName: scaffold.canonicalName,
        chemicalForm: "free_base",
        sourceNodeId: nodeId,
        provenanceField: "title",
        matchedMention: origNode.title,
        relationType: scaffold.relationType,
        educationalNote: scaffold.scientificNotes,
      };

      const validation = validateEnrichmentStructure(candidateStructure);
      if (validation.valid) {
        nodeCopy.chemicalStructure = {
          ...candidateStructure,
          confidence: "high",
          isValidated: true,
        };
        nodeCopy.chemicalStatus = "enriched";
        enrichedNodes++;
        enrichedNodesDict[nodeId] = nodeCopy;
        details.push({
          nodeId,
          title: origNode.title,
          level: "definite",
          status: "enriched",
          compoundId: scaffold.id,
          reason: classification.reason,
        });
      } else {
        nodeCopy.chemicalStatus = "failed";
        failedNodes++;
        enrichedNodesDict[nodeId] = nodeCopy;
        details.push({
          nodeId,
          title: origNode.title,
          level: "definite",
          status: "failed",
          compoundId: scaffold.id,
          reason: `اعتبارسنجی ساختار اسکلت شکست خورد: ${validation.errors.join("; ")}`,
        });
      }
    } else {
      // Definite candidate (e.g. category === 'drug') but NOT in benchmark registry
      nodeCopy.chemicalStatus = "needs_review";
      if (nodeCopy.chemicalStructure && !nodeCopy.chemicalStructure.isValidated) {
        delete nodeCopy.chemicalStructure;
      }
      skippedNodes++;
      enrichedNodesDict[nodeId] = nodeCopy;
      details.push({
        nodeId,
        title: origNode.title,
        level: "definite",
        status: "needs_review",
        reason: classification.reason,
      });
    }
  }

  // Pass 4: Related Chemicals Extraction for Category & Concept Nodes
  // Collect all compounds that have primary/atomic node structures in the tree
  const primaryCompoundIds = new Set<string>();
  for (const node of Object.values(enrichedNodesDict)) {
    if (node.chemicalStructure?.isValidated && node.chemicalStructure?.referenceCompoundId) {
      primaryCompoundIds.add(node.chemicalStructure.referenceCompoundId);
    }
  }

  let totalRelatedChemicalsAttached = 0;

  for (const [nodeId, node] of Object.entries(enrichedNodesDict)) {
    // If node already has a validated primary chemical structure, skip adding related chemicals to avoid clutter
    if (node.chemicalStructure?.isValidated) {
      continue;
    }

    // Do NOT attach related chemicals to purely process, PK/PD, clinical adverse effects, or disease nodes
    const normTitle = cleanNodeText(node.title);
    if (node.category === "disease" || PROCESS_DISQUALIFYING_PATTERNS.some((p) => normTitle.includes(p))) {
      continue;
    }

    // Extract all mentions across title, shortDescription, detailedExplanation, keyPoints, examTips, examples
    const mentions = extractNodeChemicalMentions(node);
    if (mentions.length === 0) {
      continue;
    }

    const relatedList: MindMapChemicalStructure[] = [];
    const seenCompoundIdsInNode = new Set<string>();

    for (const mention of mentions) {
      const ref = mention.referenceRecord;

      // Rule: Atomic Node Prioritization
      // If a dedicated/atomic node for this compound already exists in the tree, do not duplicate as relatedChemical
      if (primaryCompoundIds.has(ref.id)) {
        continue;
      }

      if (seenCompoundIdsInNode.has(ref.id)) {
        continue;
      }
      seenCompoundIdsInNode.add(ref.id);

      const resolved = resolveNodeChemicalRelation(node, ref, mention);

      const relatedStruct: MindMapChemicalStructure = {
        compoundName: ref.canonicalName,
        smiles: ref.canonicalSmiles,
        formula: ref.formula,
        molecularWeight: ref.molecularWeight,
        iupacName: ref.iupacName,
        drugClass: ref.drugClass, // Drug class strictly from authoritative registry
        referenceCompoundId: ref.id,
        canonicalName: ref.canonicalName,
        displayName: ref.canonicalName,
        chemicalForm: "free_base",
        sourceNodeId: nodeId,
        provenanceField: mention.provenanceField,
        matchedMention: mention.mentionText,
        relationType: resolved.relationType,
        educationalNote: resolved.educationalNote,
        confidence: "high",
        isValidated: true,
      };

      const val = validateEnrichmentStructure(relatedStruct);
      if (val.valid) {
        relatedList.push(relatedStruct);
      }
    }

    if (relatedList.length > 0) {
      node.relatedChemicals = relatedList;
      totalRelatedChemicalsAttached += relatedList.length;

      // If node did not have chemical status or was needs_review, elevate to enriched so UI displays badge
      if (!node.chemicalStatus || node.chemicalStatus === "not_required" || node.chemicalStatus === "not_checked" || node.chemicalStatus === "needs_review") {
        node.chemicalStatus = "enriched";
      }
    }
  }

  const enrichmentMetadata: MindMapChemicalEnrichmentMetadata = {
    enrichedAt: new Date().toISOString(),
    version: 1,
    enrichedCount: enrichedNodes + preservedExistingNodes + totalRelatedChemicalsAttached,
    totalCandidateCount: definiteCandidates + probableCandidates + totalRelatedChemicalsAttached,
  };

  const enrichedAiBase: MindMapAiBase = {
    ...aiBase,
    nodes: enrichedNodesDict,
    chemicalEnrichment: enrichmentMetadata,
  };

  return {
    enrichedAiBase,
    metrics: {
      totalNodes,
      definiteCandidates,
      probableCandidates,
      noNeedNodes,
      enrichedNodes,
      preservedExistingNodes,
      skippedNodes,
      failedNodes,
      relatedChemicalsCount: totalRelatedChemicalsAttached,
    },
    details,
  };
}

/**
 * Standard entry point for pipeline chemical enrichment pass.
 * Guarantees that any unexpected exception returns the unmodified base tree safely.
 */
export function enrichMindMapAiBaseChemicals(
  aiBase: MindMapAiBase,
): MindMapAiBase {
  try {
    if (!aiBase || !aiBase.nodes || typeof aiBase.nodes !== "object") {
      return aiBase;
    }
    const result = enrichMindMapChemicalsWithReport(aiBase);
    return result.enrichedAiBase;
  } catch (err) {
    process.stderr.write(
      `[MIND_MAP_CHEMICAL_ENRICHER_SAFE_GUARD] Enrichment error safely caught without crashing pipeline: ${String(err)}\n`,
    );
    return aiBase;
  }
}

/**
 * Asynchronous, Intelligent Mind Map Chemical Enricher.
 *
 * Expands beyond the seed benchmark registry to dynamically identify ANY valid drug or compound
 * from scientific data providers (PubChem PUG REST) while preserving 100% of existing validated structures,
 * avoiding misattribution, strictly preventing Gemini from inventing SMILES, and gracefully tolerating
 * external API / Redis outages.
 */
export async function enrichMindMapChemicalsWithReportAsync(
  aiBase: MindMapAiBase,
  options?: ChemicalEnrichmentOptions,
): Promise<MindMapChemicalEnrichmentResult> {
  if (!aiBase || !aiBase.nodes || typeof aiBase.nodes !== "object") {
    return {
      enrichedAiBase: aiBase,
      metrics: {
        totalNodes: 0,
        definiteCandidates: 0,
        probableCandidates: 0,
        noNeedNodes: 0,
        enrichedNodes: 0,
        preservedExistingNodes: 0,
        skippedNodes: 0,
        failedNodes: 0,
        relatedChemicalsCount: 0,
      },
      details: [],
    };
  }

  // 1. Run baseline synchronous enricher for L1 reference registry & tree prioritization
  const syncReport = enrichMindMapChemicalsWithReport(aiBase);

  const provider = options?.provider ?? new PubChemDataProvider();
  const cache = options?.cache ?? new ChemicalCacheService(options?.redisClient);
  const classifier = new ChemicalNodeClassifier(options?.gateway);
  const resolver = new ChemicalIdentityResolver(provider, cache);

  const enrichedAiBase = { ...syncReport.enrichedAiBase };
  const currentNodes = { ...enrichedAiBase.nodes };
  const rootNodeId = enrichedAiBase.rootNodeId;

  // 2. Identify candidate nodes that are NOT yet verified/enriched
  const candidateContexts: CandidateNodeContext[] = [];
  for (const [nodeId, node] of Object.entries(currentNodes)) {
    if (nodeId === rootNodeId || node.parentId === null) continue;
    // Strictly preserve already validated structures
    if (node.chemicalStructure?.isValidated === true && node.chemicalStructure?.confidence === "high") {
      continue;
    }

    const childrenTitles = Object.values(currentNodes)
      .filter((n) => n.parentId === nodeId)
      .map((n) => n.title);

    candidateContexts.push({
      nodeId,
      title: node.title,
      shortDescription: node.shortDescription,
      parentTitle: node.parentId ? currentNodes[node.parentId]?.title : undefined,
      parentDescription: node.parentId ? currentNodes[node.parentId]?.shortDescription : undefined,
      childrenTitles,
      category: node.category,
      nodeRole: node.nodeRole,
    });
  }

  if (candidateContexts.length === 0) {
    return syncReport;
  }

  // 3. Classify candidate nodes (Fast-path rules + Gemini for remaining)
  const classifications = await classifier.classifyNodes(candidateContexts, {
    mindMapTopic: options?.mindMapTopic,
    correlationId: options?.correlationId,
    organizationId: options?.organizationId,
    documentId: options?.documentId,
  });

  const newDetails: MindMapChemicalEnrichmentResult["details"] = [];

  // 4. Resolve and validate structures for specific drugs & compounds
  for (const candidate of candidateContexts) {
    const nodeId = candidate.nodeId;
    const nodeCopy = { ...currentNodes[nodeId] };
    const classification = classifications[nodeId];

    if (!classification) continue;

    if (
      (classification.classification === "drug_class" || classification.classification === "drug_subfamily") &&
      classification.matchedScaffold
    ) {
      const scaffold = classification.matchedScaffold;
      const scaffoldSmiles = scaffold.isomericSmiles || scaffold.canonicalSmiles;
      const scaffoldStruct: MindMapChemicalStructure = {
        compoundName: scaffold.canonicalName,
        smiles: scaffoldSmiles,
        formula: scaffold.formula,
        molecularWeight: scaffold.molecularWeight,
        iupacName: scaffold.iupacName,
        drugClass: scaffold.applicableFamily,
        referenceCompoundId: scaffold.id,
        canonicalName: scaffold.canonicalName,
        displayName: scaffold.canonicalName,
        chemicalForm: "free_base",
        sourceNodeId: nodeId,
        provenanceField: "title",
        matchedMention: nodeCopy.title,
        relationType: scaffold.relationType,
        educationalNote: scaffold.scientificNotes,
      };

      const val = validateEnrichmentStructure(scaffoldStruct);
      if (val.valid) {
        nodeCopy.chemicalStructure = {
          ...scaffoldStruct,
          confidence: "high",
          isValidated: true,
        };
        nodeCopy.chemicalStatus = "enriched";
        currentNodes[nodeId] = nodeCopy;
        newDetails.push({
          nodeId,
          title: nodeCopy.title,
          level: "definite",
          status: "enriched",
          compoundId: scaffold.id,
          reason: classification.reason,
        });
        continue;
      }
    }

    if (
      classification.classification === "drug_class" ||
      classification.classification === "drug_subfamily" ||
      classification.classification === "pharmacological_concept" ||
      classification.classification === "chemical_concept" ||
      (classification.classification === "unknown" && candidate.category !== "drug")
    ) {
      nodeCopy.chemicalStatus = "not_required";
      if (nodeCopy.chemicalStructure && !nodeCopy.chemicalStructure.isValidated) {
        delete nodeCopy.chemicalStructure;
      }
      currentNodes[nodeId] = nodeCopy;
      newDetails.push({
        nodeId,
        title: nodeCopy.title,
        level: "none",
        status: "not_required",
        reason: classification.reason,
      });
      continue;
    }

    if (
      classification.classification === "specific_drug" ||
      classification.classification === "specific_compound"
    ) {
      const resolved = await resolver.resolveNode(candidate, classification, {
        signal: options?.signal,
      });

      if (resolved.status === "enriched" && resolved.structure.isValidated) {
        nodeCopy.chemicalStructure = {
          ...resolved.structure,
          confidence: "high",
          isValidated: true,
        };
        nodeCopy.chemicalStatus = "enriched";
        currentNodes[nodeId] = nodeCopy;
        newDetails.push({
          nodeId,
          title: nodeCopy.title,
          level: "definite",
          status: "enriched",
          compoundId: resolved.structure.referenceCompoundId || resolved.structure.compoundName,
          reason: `تأیید ساختار از منبع علمی: ${classification.reason}`,
        });
      } else {
        nodeCopy.chemicalStatus = "needs_review";
        if (nodeCopy.chemicalStructure && !nodeCopy.chemicalStructure.isValidated) {
          delete nodeCopy.chemicalStructure;
        }
        currentNodes[nodeId] = nodeCopy;
        newDetails.push({
          nodeId,
          title: nodeCopy.title,
          level: "definite",
          status: "needs_review",
          reason: `ساختار علمی تأیید نشد یا در دسترس نبود: ${resolved.validationErrors?.join("; ") || classification.reason}`,
        });
      }
    } else if (candidate.category === "drug") {
      // Unresolved drug candidate remains in needs_review
      nodeCopy.chemicalStatus = "needs_review";
      if (nodeCopy.chemicalStructure && !nodeCopy.chemicalStructure.isValidated) {
        delete nodeCopy.chemicalStructure;
      }
      currentNodes[nodeId] = nodeCopy;
      newDetails.push({
        nodeId,
        title: nodeCopy.title,
        level: "definite",
        status: "needs_review",
        reason: classification.reason || "گره دارویی نامشخص نیازمند بررسی ساختار است.",
      });
    }
  }

  // Combine details
  const combinedDetailsMap = new Map<string, MindMapChemicalEnrichmentResult["details"][0]>();
  for (const d of syncReport.details) {
    combinedDetailsMap.set(d.nodeId, d);
  }
  for (const d of newDetails) {
    combinedDetailsMap.set(d.nodeId, d);
  }

  const finalDetails = Array.from(combinedDetailsMap.values());

  let finalEnrichedNodes = 0;
  let finalNoNeedNodes = 0;
  let finalSkippedNodes = 0;
  let finalFailedNodes = 0;
  let finalDefiniteCandidates = 0;
  let finalPreservedNodes = 0;

  for (const [nodeId, node] of Object.entries(currentNodes)) {
    if (nodeId === rootNodeId || node.parentId === null) {
      finalNoNeedNodes++;
      continue;
    }
    const orig = aiBase.nodes[nodeId];
    const isPreserved = Boolean(
      orig?.chemicalStructure?.isValidated === true && orig?.chemicalStructure?.confidence === "high",
    );
    if (isPreserved) {
      finalPreservedNodes++;
    }

    if (node.chemicalStatus === "enriched" && node.chemicalStructure?.isValidated) {
      finalEnrichedNodes++;
      finalDefiniteCandidates++;
    } else if (node.chemicalStatus === "needs_review") {
      finalSkippedNodes++;
      finalDefiniteCandidates++;
    } else if (node.chemicalStatus === "failed") {
      finalFailedNodes++;
      finalDefiniteCandidates++;
    } else {
      finalNoNeedNodes++;
    }
  }

  const enrichmentMetadata: MindMapChemicalEnrichmentMetadata = {
    enrichedAt: new Date().toISOString(),
    version: 2,
    enrichedCount: finalEnrichedNodes + (syncReport.metrics.relatedChemicalsCount || 0),
    totalCandidateCount: finalDefiniteCandidates + (syncReport.metrics.relatedChemicalsCount || 0),
  };

  enrichedAiBase.nodes = currentNodes;
  enrichedAiBase.chemicalEnrichment = enrichmentMetadata;

  return {
    enrichedAiBase,
    metrics: {
      totalNodes: syncReport.metrics.totalNodes,
      definiteCandidates: finalDefiniteCandidates,
      probableCandidates: syncReport.metrics.probableCandidates,
      noNeedNodes: finalNoNeedNodes,
      enrichedNodes: finalEnrichedNodes,
      preservedExistingNodes: finalPreservedNodes,
      skippedNodes: finalSkippedNodes,
      failedNodes: finalFailedNodes,
      relatedChemicalsCount: syncReport.metrics.relatedChemicalsCount,
    },
    details: finalDetails,
  };
}

/**
 * Asynchronous entry point for mind map generation pipeline.
 * Guarantees that any unexpected exception returns the base tree safely.
 */
export async function enrichMindMapAiBaseChemicalsAsync(
  aiBase: MindMapAiBase,
  options?: ChemicalEnrichmentOptions,
): Promise<MindMapAiBase> {
  try {
    if (!aiBase || !aiBase.nodes || typeof aiBase.nodes !== "object") {
      return aiBase;
    }
    const result = await enrichMindMapChemicalsWithReportAsync(aiBase, options);
    return result.enrichedAiBase;
  } catch (err) {
    process.stderr.write(
      `[MIND_MAP_CHEMICAL_ENRICHER_ASYNC_SAFE_GUARD] Non-fatal async enrichment error caught: ${String(err)}\n`,
    );
    return enrichMindMapAiBaseChemicals(aiBase);
  }
}

