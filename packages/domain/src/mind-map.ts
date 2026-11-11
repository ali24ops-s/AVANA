/**
 * Domain logic & validation for Interactive AI Mind Map.
 */

import { DomainError } from "./errors.js";
import type {
  MindMapAiBase,
  MindMapNodeBase,
  MindMapPayload,
  MindMapUserModifications,
  MindMapNodeUserNote,
  MindMapNodeOverride,
  MindMapCustomEdge,
  MindMapStructuredDetails,
  MindMapNodeSection,
  MindMapNodeCategory,
  MindMapNodeRole,
  MindMapChemicalStructure,
  ChemicalSarHighlight,
  MindMapNodeChemicalStatus,
  MindMapChemicalEnrichmentMetadata,
} from "@avana/contracts";
import { validateMindMapChemicalStructure } from "./chemistry/chemical-validation.js";

export const MAX_MINDMAP_NODES = 120;
export const MIN_MINDMAP_NODES = 2;
export const MAX_MINDMAP_DEPTH = 8;
export const MAX_NODE_TITLE_LENGTH = 120;
export const MAX_SHORT_DESCRIPTION_LENGTH = 600;
export const MAX_DETAILED_EXPLANATION_LENGTH = 4000;
export const MAX_USER_CUSTOM_NODES = 20;
export const MAX_USER_NOTE_LENGTH = 5000;
export const MAX_USER_PAYLOAD_BYTES = 256 * 1024; // 256 KB

export const AVANA_SEMANTIC_PALETTE = [
  "#008080", // Teal (Primary AVANA)
  "#2563eb", // Slate Blue / Royal Blue
  "#7c3aed", // Violet / Purple
  "#d97706", // Amber / Warm Orange
  "#059669", // Emerald / Mint Green
  "#e11d48", // Rose / Crimson
] as const;

export function cleanStructuredDetails(raw: unknown): MindMapStructuredDetails | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const cleanString = (val: unknown, maxLen = 3000): string | undefined => {
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim().slice(0, maxLen);
    }
    return undefined;
  };
  const cleanStringArray = (val: unknown, maxItems = 20, maxLen = 500): string[] | undefined => {
    if (!Array.isArray(val)) return undefined;
    const items = val
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim().slice(0, maxLen));
    return items.length > 0 ? items.slice(0, maxItems) : undefined;
  };

  const details: MindMapStructuredDetails = {
    mechanismOfAction: cleanString(o.mechanismOfAction ?? o.mechanism),
    indications: cleanStringArray(o.indications),
    drugClass: cleanString(o.drugClass, 200),
    pharmacology: cleanString(o.pharmacology ?? o.pharmacokinetics),
    adverseEffects: cleanStringArray(o.adverseEffects),
    contraindications: cleanStringArray(o.contraindications),
    interactions: cleanStringArray(o.interactions),
    clinicalPearls: cleanStringArray(o.clinicalPearls),
    commonPitfalls: cleanStringArray(o.commonPitfalls),
    relatedConcepts: cleanStringArray(o.relatedConcepts),
  };

  const hasContent = Object.values(details).some((v) => v !== undefined);
  return hasContent ? details : undefined;
}

export function cleanSections(raw: unknown): MindMapNodeSection[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const result: MindMapNodeSection[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
      if (!title) continue;
      const content =
        typeof o.content === "string" && o.content.trim().length > 0
          ? o.content.trim().slice(0, 3000)
          : undefined;
      const items = Array.isArray(o.items)
        ? o.items
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim().slice(0, 500))
        : undefined;
      const id =
        typeof o.id === "string" && o.id.trim().length > 0 ? o.id.trim().slice(0, 80) : undefined;
      const category =
        typeof o.category === "string" && o.category.trim().length > 0
          ? (o.category.trim().slice(0, 50) as MindMapNodeCategory)
          : undefined;
      const icon =
        typeof o.icon === "string" && o.icon.trim().length > 0 ? o.icon.trim().slice(0, 50) : undefined;

      result.push({
        id,
        title,
        category,
        content,
        items: items && items.length > 0 ? items : undefined,
        icon,
      });
    }
  }
  return result.length > 0 ? result.slice(0, 30) : undefined;
}

export function cleanChemicalStructure(raw: unknown): MindMapChemicalStructure | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;

  const cleanString = (val: unknown, maxLen = 1000): string | undefined => {
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim().slice(0, maxLen);
    }
    return undefined;
  };

  const compoundName = cleanString(o.compoundName ?? o.name, 200);
  const smiles = cleanString(o.smiles, 1000);

  // If neither compoundName nor smiles is present, it's not a valid chemical structure payload
  if (!compoundName && !smiles) return undefined;

  const formula = cleanString(o.formula, 100);
  const molecularWeight =
    typeof o.molecularWeight === "number" && !isNaN(o.molecularWeight) && o.molecularWeight > 0
      ? Math.round(o.molecularWeight * 100) / 100
      : undefined;
  const iupacName = cleanString(o.iupacName, 300);
  const drugClass = cleanString(o.drugClass, 200);
  const educationalNote = cleanString(o.educationalNote ?? o.note, 2000);

  let sarHighlights: ChemicalSarHighlight[] | undefined;
  if (Array.isArray(o.sarHighlights)) {
    const list: ChemicalSarHighlight[] = [];
    for (const h of o.sarHighlights) {
      if (h && typeof h === "object" && !Array.isArray(h)) {
        const hObj = h as Record<string, unknown>;
        const feature = cleanString(hObj.feature, 150);
        const description = cleanString(hObj.description, 500);
        const color = cleanString(hObj.color, 50);
        if (feature && description) {
          list.push({ feature, description, ...(color ? { color } : {}) });
        }
      }
    }
    if (list.length > 0) {
      sarHighlights = list.slice(0, 10);
    }
  }

  const baseStruct: MindMapChemicalStructure = {
    compoundName: compoundName || "Unknown Compound",
    smiles: smiles || "",
    ...(formula ? { formula } : {}),
    ...(molecularWeight ? { molecularWeight } : {}),
    ...(iupacName ? { iupacName } : {}),
    ...(drugClass ? { drugClass } : {}),
    ...(sarHighlights ? { sarHighlights } : {}),
    ...(educationalNote ? { educationalNote } : {}),
    ...(cleanString(o.referenceCompoundId, 100) ? { referenceCompoundId: cleanString(o.referenceCompoundId, 100) } : {}),
    ...(cleanString(o.canonicalName, 200) ? { canonicalName: cleanString(o.canonicalName, 200) } : {}),
    ...(cleanString(o.displayName, 200) ? { displayName: cleanString(o.displayName, 200) } : {}),
    ...(cleanString(o.chemicalForm, 100) ? { chemicalForm: cleanString(o.chemicalForm, 100) } : {}),
    ...(cleanString(o.sourceNodeId, 100) ? { sourceNodeId: cleanString(o.sourceNodeId, 100) } : {}),
    ...(cleanString(o.provenanceField, 100) ? { provenanceField: cleanString(o.provenanceField, 100) } : {}),
    ...(typeof o.relationType === "string" &&
    [
      "primary_structure",
      "class_member",
      "combination_component",
      "example_of",
      "mechanism_related",
      "sar_related",
      "mentioned_in",
      "related_chemical",
      "sar_reference",
      "generic_scaffold",
      "reference_core_compound",
      "representative_compound",
    ].includes(o.relationType)
      ? { relationType: o.relationType as MindMapChemicalStructure["relationType"] }
      : {}),
  };

  const validation = validateMindMapChemicalStructure(baseStruct);

  return {
    ...baseStruct,
    confidence: validation.confidence,
    isValidated: validation.valid && validation.identityVerified,
    validationErrors: validation.errors.length > 0 ? validation.errors : undefined,
    validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
  };
}

export function cleanRelatedChemicals(raw: unknown): MindMapChemicalStructure[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: MindMapChemicalStructure[] = [];
  const seenCompoundIds = new Set<string>();

  for (const item of raw) {
    const cleaned = cleanChemicalStructure(item);
    if (!cleaned) continue;

    // Deduplicate by referenceCompoundId or canonical compoundName
    const dedupeKey = (cleaned.referenceCompoundId || cleaned.compoundName).toLowerCase().trim();
    if (seenCompoundIds.has(dedupeKey)) continue;
    seenCompoundIds.add(dedupeKey);

    list.push(cleaned);
    if (list.length >= 15) break; // Reasonable bound per node
  }

  return list.length > 0 ? list : undefined;
}

/**
 * Validates and cleans a raw MindMapAiBase object returned by the AI gateway.
 *
 * Enforces:
 * - Structural validity of nodes dictionary
 * - Exactly one valid root node (parentId === null)
 * - All child nodes point to a valid existing parent
 * - No cycles or self-referencing loops
 * - Maximum depth limit (<= 6)
 * - Maximum node count (2 <= count <= 60)
 * - Reachability of every node from root (no disconnected subgraphs)
 * - Text length constraints on titles and descriptions
 */
export function validateMindMapAiBase(raw: unknown): MindMapAiBase {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DomainError("bad_request", "ساختار پاسخ مایندمپ هوش مصنوعی نامعتبر است (آبجکت مورد نیاز است).");
  }

  const obj = raw as Record<string, unknown>;
  const rootNodeId = typeof obj.rootNodeId === "string" ? obj.rootNodeId.trim() : "";
  if (!rootNodeId) {
    throw new DomainError("bad_request", "گره ریشه (rootNodeId) در ساختار مایندمپ مشخص نشده است.");
  }

  let nodesRaw = obj.nodes;
  // Fallback: If Gemini returned nodes as an array, convert to dictionary keyed by id
  if (Array.isArray(nodesRaw)) {
    const dict: Record<string, unknown> = {};
    for (const item of nodesRaw) {
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string") {
        dict[(item as Record<string, unknown>).id as string] = item;
      }
    }
    nodesRaw = dict;
  }

  if (!nodesRaw || typeof nodesRaw !== "object" || Array.isArray(nodesRaw)) {
    throw new DomainError("bad_request", "فیلد nodes در ساختار مایندمپ نامعتبر است.");
  }

  const rawNodeEntries = Object.entries(nodesRaw as Record<string, unknown>);
  if (rawNodeEntries.length < MIN_MINDMAP_NODES) {
    throw new DomainError(
      "bad_request",
      `تعداد گره‌های مایندمپ (${rawNodeEntries.length}) کمتر از حداقل مجاز (${MIN_MINDMAP_NODES}) است.`,
    );
  }

  if (rawNodeEntries.length > MAX_MINDMAP_NODES) {
    throw new DomainError(
      "bad_request",
      `تعداد گره‌های مایندمپ (${rawNodeEntries.length}) بیشتر از حداکثر مجاز (${MAX_MINDMAP_NODES}) است.`,
    );
  }

  const cleanedNodes: Record<string, MindMapNodeBase> = {};

  for (const [key, nodeVal] of rawNodeEntries) {
    if (!nodeVal || typeof nodeVal !== "object") {
      throw new DomainError("bad_request", `گره با شناسه "${key}" نامعتبر است.`);
    }

    const n = nodeVal as Record<string, unknown>;
    const rawId = typeof n.id === "string" && n.id.trim().length > 0 ? n.id.trim() : key.trim();
    if (!rawId) {
      throw new DomainError("bad_request", "شناسه گره نمی‌تواند خالی باشد.");
    }

    const title = typeof n.title === "string" ? n.title.trim() : "";
    if (!title) {
      throw new DomainError("bad_request", `عنوان گره "${rawId}" خالی است.`);
    }
    if (title.length > MAX_NODE_TITLE_LENGTH) {
      throw new DomainError(
        "bad_request",
        `طول عنوان گره "${rawId}" بیش از حد مجاز (${MAX_NODE_TITLE_LENGTH} کاراکتر) است.`,
      );
    }

    const shortDesc = typeof n.shortDescription === "string" ? n.shortDescription.trim() : "";
    if (shortDesc.length > MAX_SHORT_DESCRIPTION_LENGTH) {
      throw new DomainError(
        "bad_request",
        `طول توضیح کوتاه گره "${rawId}" بیش از حد مجاز (${MAX_SHORT_DESCRIPTION_LENGTH} کاراکتر) است.`,
      );
    }

    let detailedExplanation = typeof n.detailedExplanation === "string" ? n.detailedExplanation.trim() : undefined;
    if (detailedExplanation && detailedExplanation.length > MAX_DETAILED_EXPLANATION_LENGTH) {
      detailedExplanation = detailedExplanation.slice(0, MAX_DETAILED_EXPLANATION_LENGTH);
    }

    const parentId =
      typeof n.parentId === "string" && n.parentId.trim().length > 0
        ? n.parentId.trim()
        : null;

    const keyPoints = Array.isArray(n.keyPoints)
      ? n.keyPoints.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim())
      : [];

    const examples = Array.isArray(n.examples)
      ? n.examples.filter((e): e is string => typeof e === "string" && e.trim().length > 0).map((e) => e.trim())
      : [];

    const examTips = Array.isArray(n.examTips)
      ? n.examTips.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim())
      : [];

    const sourceReferences = Array.isArray(n.sourceReferences)
      ? n.sourceReferences
          .filter((s): s is Record<string, unknown> => s && typeof s === "object")
          .map((s) => ({
            chunkId: typeof s.chunkId === "string" ? s.chunkId : undefined,
            pageNumber: typeof s.pageNumber === "number" ? s.pageNumber : undefined,
            lessonTitle: typeof s.lessonTitle === "string" ? s.lessonTitle : undefined,
          }))
      : [];

    const semanticGroup =
      typeof n.semanticGroup === "string" && n.semanticGroup.trim().length > 0
        ? n.semanticGroup.trim().slice(0, 100)
        : undefined;

    const category =
      typeof n.category === "string" && n.category.trim().length > 0
        ? (n.category.trim().slice(0, 50) as MindMapNodeCategory)
        : undefined;

    const nodeRole =
      n.nodeRole === "category" || n.nodeRole === "concept"
        ? (n.nodeRole as MindMapNodeRole)
        : undefined;

    const structuredDetails = cleanStructuredDetails(n.structuredDetails);
    const sections = cleanSections(n.sections);
    const chemicalStructure = cleanChemicalStructure(n.chemicalStructure);
    const relatedChemicals = cleanRelatedChemicals(n.relatedChemicals);
    const validChemicalStatuses = ["not_checked", "not_required", "pending", "enriched", "needs_review", "failed"];
    const chemicalStatus =
      typeof n.chemicalStatus === "string" && validChemicalStatuses.includes(n.chemicalStatus)
        ? (n.chemicalStatus as MindMapNodeChemicalStatus)
        : undefined;

    cleanedNodes[rawId] = {
      id: rawId,
      parentId,
      title,
      shortDescription: shortDesc,
      detailedExplanation,
      keyPoints,
      examples,
      examTips,
      sourceReferences,
      sortOrder: typeof n.sortOrder === "number" ? n.sortOrder : 0,
      semanticGroup,
      category,
      nodeRole,
      structuredDetails,
      sections,
      ...(chemicalStructure ? { chemicalStructure } : {}),
      ...(relatedChemicals ? { relatedChemicals } : {}),
      ...(chemicalStatus ? { chemicalStatus } : {}),
    };
  }

  // 1. Root node existence
  const rootNode = cleanedNodes[rootNodeId];
  if (!rootNode) {
    throw new DomainError("bad_request", `گره ریشه مشخص‌شده با شناسه "${rootNodeId}" در لیست گره‌ها وجود ندارد.`);
  }
  if (rootNode.parentId !== null) {
    throw new DomainError("bad_request", "گره ریشه نباید والد (parentId) داشته باشد.");
  }

  // 2. Exactly one root node
  const nodesWithNullParent = Object.values(cleanedNodes).filter((n) => n.parentId === null);
  if (nodesWithNullParent.length !== 1) {
    throw new DomainError(
      "bad_request",
      `درخت مایندمپ باید دقیقا یک گره ریشه داشته باشد، اما ${nodesWithNullParent.length} گره بدون والد یافت شد.`,
    );
  }

  // 3. Parent existence check
  for (const node of Object.values(cleanedNodes)) {
    if (node.parentId !== null) {
      if (!cleanedNodes[node.parentId]) {
        throw new DomainError(
          "bad_request",
          `والد گره "${node.id}" با شناسه "${node.parentId}" یافت نشد.`,
        );
      }
      if (node.parentId === node.id) {
        throw new DomainError("bad_request", `گره "${node.id}" نمی‌تواند والد خودش باشد.`);
      }
    }
  }

  // 4. Cycle detection & depth limit check & reachability using DFS from root
  const childrenMap = new Map<string, string[]>();
  for (const node of Object.values(cleanedNodes)) {
    if (node.parentId) {
      const existing = childrenMap.get(node.parentId) || [];
      existing.push(node.id);
      childrenMap.set(node.parentId, existing);
    }
  }

  const visited = new Set<string>();
  let maxEncounteredDepth = 1;

  function traverse(nodeId: string, currentDepth: number, currentPath: Set<string>) {
    if (currentPath.has(nodeId)) {
      throw new DomainError("bad_request", `حلقه (Cycle) در ساختار درخت در گره "${nodeId}" شناسایی شد.`);
    }

    if (currentDepth > MAX_MINDMAP_DEPTH) {
      throw new DomainError(
        "bad_request",
        `عمق درخت (${currentDepth}) بیش از حداکثر مجاز (${MAX_MINDMAP_DEPTH}) است.`,
      );
    }

    maxEncounteredDepth = Math.max(maxEncounteredDepth, currentDepth);
    visited.add(nodeId);
    currentPath.add(nodeId);

    const children = childrenMap.get(nodeId) || [];
    for (const childId of children) {
      traverse(childId, currentDepth + 1, currentPath);
    }

    currentPath.delete(nodeId);
  }

  traverse(rootNodeId, 1, new Set<string>());

  // 5. Reachability check (ensure no disconnected orphan subtrees)
  if (visited.size !== Object.keys(cleanedNodes).length) {
    const unreachable = Object.keys(cleanedNodes).filter((id) => !visited.has(id));
    throw new DomainError(
      "bad_request",
      `تعدادی از گره‌ها به ریشه متصل نیستند و در درخت شناورند: ${unreachable.slice(0, 3).join(", ")}`,
    );
  }

  let chemicalEnrichment: MindMapChemicalEnrichmentMetadata | undefined;
  if (obj.chemicalEnrichment && typeof obj.chemicalEnrichment === "object" && !Array.isArray(obj.chemicalEnrichment)) {
    const ce = obj.chemicalEnrichment as Record<string, unknown>;
    chemicalEnrichment = {
      enrichedAt: typeof ce.enrichedAt === "string" ? ce.enrichedAt : new Date().toISOString(),
      version: typeof ce.version === "number" ? ce.version : 1,
      enrichedCount: typeof ce.enrichedCount === "number" ? ce.enrichedCount : 0,
      totalCandidateCount: typeof ce.totalCandidateCount === "number" ? ce.totalCandidateCount : 0,
    };
  }

  return {
    rootNodeId,
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : new Date().toISOString(),
    model: typeof obj.model === "string" ? obj.model : "gemini-3.5-flash-lite",
    nodes: cleanedNodes,
    ...(chemicalEnrichment ? { chemicalEnrichment } : {}),
  };
}

/**
 * Validates the complete structure of a MindMapPayload.
 * Ensures that kind, aiBase, rootNodeId, and nodes meet domain rules.
 */
export function validateMindMapPayload(raw: unknown): MindMapPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DomainError("bad_request", "داده‌های مایندمپ نامعتبر است (شیء معتبر الزامی است).");
  }

  const p = raw as Record<string, unknown>;

  if (!p.aiBase || typeof p.aiBase !== "object" || Array.isArray(p.aiBase)) {
    throw new DomainError("bad_request", "ساختار مایندمپ فاقد لایه هوش مصنوعی (aiBase) است.");
  }

  const aiBaseObj = p.aiBase as Record<string, unknown>;
  const rootNodeId = typeof aiBaseObj.rootNodeId === "string" ? aiBaseObj.rootNodeId.trim() : "";
  if (!rootNodeId) {
    throw new DomainError("bad_request", "گره ریشه (rootNodeId) در لایه هوش مصنوعی مایندمپ مشخص نشده است.");
  }

  if (!aiBaseObj.nodes || typeof aiBaseObj.nodes !== "object" || Array.isArray(aiBaseObj.nodes)) {
    throw new DomainError("bad_request", "گره‌های هوش مصنوعی (aiBase.nodes) در ساختار مایندمپ نامعتبر است.");
  }

  const aiBase = validateMindMapAiBase(p.aiBase);

  let userModifications: MindMapUserModifications = {
    deletedNodeIds: [],
    customNodes: {},
    overrides: {},
  };
  let userNotes: Record<string, MindMapNodeUserNote> = {};

  if (p.userModifications !== undefined && p.userModifications !== null) {
    const validatedMods = validateUserModificationsAndNotes(aiBase, p.userModifications, p.userNotes ?? {});
    userModifications = validatedMods.userModifications;
    userNotes = validatedMods.userNotes;
  } else if (p.userNotes !== undefined && p.userNotes !== null) {
    const validatedMods = validateUserModificationsAndNotes(aiBase, {}, p.userNotes);
    userNotes = validatedMods.userNotes;
  }

  return {
    kind: "mind_map",
    version: typeof p.version === "number" ? p.version : 1,
    sourceType: (p.sourceType === "reference_document" || p.sourceType === "lessons") ? p.sourceType : "lessons",
    sourceId: typeof p.sourceId === "string" ? p.sourceId : "",
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : new Date().toISOString(),
    aiBase,
    userModifications,
    userNotes,
  };
}

/**
 * Merges the three layers (AI Base, User Modifications, User Notes)
 * into an effective visual tree suitable for rendering or exporting.
 */
export function computeEffectiveMindMap(payload: MindMapPayload): {
  rootNodeId: string;
  nodes: Record<
    string,
    MindMapNodeBase & {
      isUserCustom?: boolean;
      isOverridden?: boolean;
      userNote?: string;
      manualPosition?: { x: number; y: number };
    }
  >;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new DomainError("bad_request", "ساختار داده‌های مایندمپ نامعتبر است (شیء معتبر الزامی است).");
  }

  if (!payload.aiBase || typeof payload.aiBase !== "object" || Array.isArray(payload.aiBase)) {
    throw new DomainError("bad_request", "ساختار مایندمپ فاقد بخش هوش مصنوعی (aiBase) است.");
  }

  const rootId = typeof payload.aiBase.rootNodeId === "string" ? payload.aiBase.rootNodeId.trim() : "";
  if (!rootId) {
    throw new DomainError("bad_request", "گره ریشه (rootNodeId) در لایه هوش مصنوعی مایندمپ نامعتبر یا تعریف نشده است.");
  }

  if (!payload.aiBase.nodes || typeof payload.aiBase.nodes !== "object" || Array.isArray(payload.aiBase.nodes)) {
    throw new DomainError("bad_request", "گره‌های هوش مصنوعی (aiBase.nodes) نامعتبر است.");
  }

  const effectiveNodes: Record<
    string,
    MindMapNodeBase & {
      isUserCustom?: boolean;
      isOverridden?: boolean;
      userNote?: string;
      manualPosition?: { x: number; y: number };
    }
  > = {};

  const deletedSet = new Set(payload.userModifications?.deletedNodeIds || []);
  const baseNodes = payload.aiBase.nodes;
  const overrides = payload.userModifications?.overrides || {};
  const customNodes = payload.userModifications?.customNodes || {};
  const userNotes = payload.userNotes || {};
  const nodePositions = payload.userModifications?.nodePositions || {};

  // 1. Add AI Base nodes (unless marked deleted by user)
  for (const [id, baseNode] of Object.entries(baseNodes)) {
    if (deletedSet.has(id)) continue;

    const ovr = overrides[id];
    const isOverridden = Boolean(ovr);
    const note = userNotes[id]?.noteText;

    effectiveNodes[id] = {
      ...baseNode,
      title: ovr?.title ?? baseNode.title,
      shortDescription: ovr?.shortDescription ?? baseNode.shortDescription,
      detailedExplanation: ovr?.detailedExplanation ?? baseNode.detailedExplanation,
      parentId: ovr?.parentId !== undefined ? ovr.parentId : baseNode.parentId,
      sortOrder: ovr?.sortOrder !== undefined ? ovr.sortOrder : baseNode.sortOrder,
      semanticGroup: ovr?.semanticGroup ?? baseNode.semanticGroup,
      category: ovr?.category ?? baseNode.category,
      nodeRole: ovr?.nodeRole ?? baseNode.nodeRole,
      structuredDetails: ovr?.structuredDetails ?? baseNode.structuredDetails,
      sections: ovr?.sections ?? baseNode.sections,
      chemicalStructure: ovr?.chemicalStructure !== undefined ? ovr.chemicalStructure : baseNode.chemicalStructure,
      relatedChemicals: ovr?.relatedChemicals !== undefined ? ovr.relatedChemicals : baseNode.relatedChemicals,
      chemicalStatus: ovr?.chemicalStatus !== undefined ? ovr.chemicalStatus : baseNode.chemicalStatus,
      isOverridden,
      userNote: note,
      manualPosition: nodePositions[id],
    };
  }

  // 2. Add User Custom nodes (unless marked deleted)
  for (const [id, customNode] of Object.entries(customNodes)) {
    if (deletedSet.has(id)) continue;

    const ovr = overrides[id];
    const isOverridden = Boolean(ovr);
    const note = userNotes[id]?.noteText;

    effectiveNodes[id] = {
      ...customNode,
      title: ovr?.title ?? customNode.title,
      shortDescription: ovr?.shortDescription ?? customNode.shortDescription,
      detailedExplanation: ovr?.detailedExplanation ?? customNode.detailedExplanation,
      parentId: ovr?.parentId !== undefined ? ovr.parentId : customNode.parentId,
      sortOrder: ovr?.sortOrder !== undefined ? ovr.sortOrder : customNode.sortOrder,
      semanticGroup: ovr?.semanticGroup ?? customNode.semanticGroup,
      category: ovr?.category ?? customNode.category,
      nodeRole: ovr?.nodeRole ?? customNode.nodeRole,
      structuredDetails: ovr?.structuredDetails ?? customNode.structuredDetails,
      sections: ovr?.sections ?? customNode.sections,
      chemicalStructure: ovr?.chemicalStructure !== undefined ? ovr.chemicalStructure : customNode.chemicalStructure,
      relatedChemicals: ovr?.relatedChemicals !== undefined ? ovr.relatedChemicals : customNode.relatedChemicals,
      chemicalStatus: ovr?.chemicalStatus !== undefined ? ovr.chemicalStatus : customNode.chemicalStatus,
      isUserCustom: true,
      isOverridden,
      userNote: note,
      manualPosition: nodePositions[id],
    };
  }

  // 3. Prune orphaned nodes: A node is included only if it is reachable from rootNodeId
  const reachable = new Set<string>();
  if (effectiveNodes[rootId]) {
    reachable.add(rootId);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const [id, node] of Object.entries(effectiveNodes)) {
        if (!reachable.has(id) && node.parentId && reachable.has(node.parentId)) {
          reachable.add(id);
          expanded = true;
        }
      }
    }
  }

  for (const id of Object.keys(effectiveNodes)) {
    if (!reachable.has(id)) {
      delete effectiveNodes[id];
    }
  }

  return {
    rootNodeId: rootId,
    nodes: effectiveNodes,
  };
}

/**
 * Recursively collects all descendant node IDs for a given target node ID.
 */
export function getDescendantNodeIds(
  targetNodeId: string,
  nodes: Record<string, { id: string; parentId: string | null }>,
): string[] {
  const childrenMap = new Map<string, string[]>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(id);
      childrenMap.set(node.parentId, list);
    }
  }

  const result: string[] = [];
  const queue = [...(childrenMap.get(targetNodeId) || [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    const children = childrenMap.get(current) || [];
    queue.push(...children);
  }

  return result;
}

/**
 * Validates user modifications and user notes submitted via API.
 *
 * Enforces:
 * - Structural and type validity of userModifications and userNotes
 * - Maximum custom nodes count (<= 20)
 * - Maximum note length (<= 5000 chars per note)
 * - Maximum payload size (<= 256 KB)
 * - Valid parent references for custom nodes
 * - Cycle/loop detection across AI Base + Custom Nodes + Overrides
 * - Depth constraint (<= 6)
 * - Reachability of all custom nodes from root
 */
export function validateUserModificationsAndNotes(
  aiBase: MindMapAiBase,
  rawModifications: unknown,
  rawNotes: unknown,
): {
  userModifications: MindMapUserModifications;
  userNotes: Record<string, MindMapNodeUserNote>;
} {
  if (!aiBase || typeof aiBase !== "object" || Array.isArray(aiBase)) {
    throw new DomainError("bad_request", "ساختار پایه هوش مصنوعی (aiBase) نامعتبر است.");
  }
  const rootNodeId = typeof aiBase.rootNodeId === "string" ? aiBase.rootNodeId.trim() : "";
  if (!rootNodeId) {
    throw new DomainError("bad_request", "گره ریشه (rootNodeId) در لایه پایه هوش مصنوعی تعریف نشده است.");
  }
  if (!aiBase.nodes || typeof aiBase.nodes !== "object" || Array.isArray(aiBase.nodes)) {
    throw new DomainError("bad_request", "گره‌های پایه هوش مصنوعی (aiBase.nodes) نامعتبر است.");
  }

  // 1. Check raw payload serializability and size
  let jsonString: string;
  try {
    jsonString = JSON.stringify({ rawModifications, rawNotes });
  } catch {
    throw new DomainError("bad_request", "اطلاعات ارسالی قابل پردازش نیست (ساختار نامعتبر یا دارای ارجاع حلقوی).");
  }

  if (Buffer.byteLength(jsonString, "utf8") > MAX_USER_PAYLOAD_BYTES) {
    throw new DomainError(
      "bad_request",
      `حجم تغییرات ارسالی بیش از سقف مجاز (${Math.round(MAX_USER_PAYLOAD_BYTES / 1024)} کیلوبایت) است.`,
    );
  }

  if (!rawModifications || typeof rawModifications !== "object" || Array.isArray(rawModifications)) {
    throw new DomainError("bad_request", "ساختار تغییرات کاربر (userModifications) نامعتبر است.");
  }

  const modsObj = rawModifications as Record<string, unknown>;

  // 2. Validate deletedNodeIds
  const deletedNodeIds: string[] = [];
  if (modsObj.deletedNodeIds !== undefined) {
    if (!Array.isArray(modsObj.deletedNodeIds)) {
      throw new DomainError("bad_request", "فیلد deletedNodeIds باید آرایه‌ای از شناسه‌ها باشد.");
    }
    for (const item of modsObj.deletedNodeIds) {
      if (typeof item === "string" && item.trim().length > 0) {
        if (item.trim() === aiBase.rootNodeId) {
          throw new DomainError("bad_request", "گره ریشه مایندمپ قابل حذف نیست.");
        }
        deletedNodeIds.push(item.trim());
      }
    }
  }

  // 3. Validate customNodes
  const customNodesRaw = modsObj.customNodes;
  const customNodes: Record<string, MindMapNodeBase> = {};

  if (customNodesRaw !== undefined) {
    if (!customNodesRaw || typeof customNodesRaw !== "object" || Array.isArray(customNodesRaw)) {
      throw new DomainError("bad_request", "فیلد customNodes باید یک آبجکت باشد.");
    }

    const customEntries = Object.entries(customNodesRaw as Record<string, unknown>);
    if (customEntries.length > MAX_USER_CUSTOM_NODES) {
      throw new DomainError(
        "bad_request",
        `تعداد گره‌های سفارشی (${customEntries.length}) بیش از حد مجاز (${MAX_USER_CUSTOM_NODES} گره) است.`,
      );
    }

    for (const [key, nodeVal] of customEntries) {
      if (!nodeVal || typeof nodeVal !== "object" || Array.isArray(nodeVal)) {
        throw new DomainError("bad_request", `گره سفارشی با شناسه "${key}" نامعتبر است.`);
      }
      const cn = nodeVal as Record<string, unknown>;
      const rawId = typeof cn.id === "string" && cn.id.trim().length > 0 ? cn.id.trim() : key.trim();
      if (!rawId) {
        throw new DomainError("bad_request", "شناسه گره سفارشی نمی‌تواند خالی باشد.");
      }

      const title = typeof cn.title === "string" ? cn.title.trim() : "";
      if (!title) {
        throw new DomainError("bad_request", `عنوان گره سفارشی "${rawId}" الزامی است.`);
      }
      if (title.length > MAX_NODE_TITLE_LENGTH) {
        throw new DomainError(
          "bad_request",
          `طول عنوان گره سفارشی "${rawId}" بیش از حد مجاز (${MAX_NODE_TITLE_LENGTH} کاراکتر) است.`,
        );
      }

      const shortDesc = typeof cn.shortDescription === "string" ? cn.shortDescription.trim() : "";
      if (shortDesc.length > MAX_SHORT_DESCRIPTION_LENGTH) {
        throw new DomainError(
          "bad_request",
          `طول توضیح گره سفارشی "${rawId}" بیش از حد مجاز (${MAX_SHORT_DESCRIPTION_LENGTH} کاراکتر) است.`,
        );
      }

      const parentId = typeof cn.parentId === "string" ? cn.parentId.trim() : null;
      if (!parentId) {
        throw new DomainError("bad_request", `گره سفارشی "${rawId}" باید حتما دارای والد (parentId) باشد.`);
      }
      if (parentId === rawId) {
        throw new DomainError("bad_request", `گره سفارشی "${rawId}" نمی‌تواند والد خودش باشد.`);
      }

      const nodeRole =
        cn.nodeRole === "category" || cn.nodeRole === "concept"
          ? (cn.nodeRole as MindMapNodeRole)
          : undefined;

      const chemicalStructure = cleanChemicalStructure(cn.chemicalStructure);
      const relatedChemicals = cleanRelatedChemicals(cn.relatedChemicals);
      const validChemicalStatuses = ["not_checked", "not_required", "pending", "enriched", "needs_review", "failed"];
      const chemicalStatus =
        typeof cn.chemicalStatus === "string" && validChemicalStatuses.includes(cn.chemicalStatus)
          ? (cn.chemicalStatus as MindMapNodeChemicalStatus)
          : undefined;

      customNodes[rawId] = {
        id: rawId,
        parentId,
        title,
        shortDescription: shortDesc,
        nodeRole,
        sortOrder: typeof cn.sortOrder === "number" ? cn.sortOrder : 0,
        ...(chemicalStructure ? { chemicalStructure } : {}),
        ...(relatedChemicals ? { relatedChemicals } : {}),
        ...(chemicalStatus ? { chemicalStatus } : {}),
      };
    }
  }

  // 4. Validate overrides
  const overridesRaw = modsObj.overrides;
  const overrides: Record<string, MindMapNodeOverride> = {};

  if (overridesRaw !== undefined) {
    if (!overridesRaw || typeof overridesRaw !== "object" || Array.isArray(overridesRaw)) {
      throw new DomainError("bad_request", "فیلد overrides باید یک آبجکت باشد.");
    }

    for (const [key, ovrVal] of Object.entries(overridesRaw as Record<string, unknown>)) {
      if (!ovrVal || typeof ovrVal !== "object" || Array.isArray(ovrVal)) continue;
      const ovr = ovrVal as Record<string, unknown>;
      const cleanedOvr: MindMapNodeOverride = {};

      if (typeof ovr.title === "string") {
        const trimmedTitle = ovr.title.trim();
        if (!trimmedTitle) {
          throw new DomainError("bad_request", `عنوان ویرایش‌شده برای گره "${key}" نمی‌تواند خالی باشد.`);
        }
        if (trimmedTitle.length > MAX_NODE_TITLE_LENGTH) {
          throw new DomainError(
            "bad_request",
            `طول عنوان ویرایش‌شده برای گره "${key}" بیش از حد مجاز است.`,
          );
        }
        cleanedOvr.title = trimmedTitle;
      }

      if (typeof ovr.shortDescription === "string") {
        if (ovr.shortDescription.length > MAX_SHORT_DESCRIPTION_LENGTH) {
          throw new DomainError(
            "bad_request",
            `طول توضیح ویرایش‌شده برای گره "${key}" بیش از حد مجاز است.`,
          );
        }
        cleanedOvr.shortDescription = ovr.shortDescription.trim();
      }

      if (ovr.nodeRole === "category" || ovr.nodeRole === "concept") {
        cleanedOvr.nodeRole = ovr.nodeRole as MindMapNodeRole;
      }

      if (ovr.parentId !== undefined) {
        if (typeof ovr.parentId === "string" && ovr.parentId.trim().length > 0) {
          if (ovr.parentId.trim() === key) {
            throw new DomainError("bad_request", `گره "${key}" نمی‌تواند والد خودش باشد.`);
          }
          cleanedOvr.parentId = ovr.parentId.trim();
        } else if (ovr.parentId === null && key !== aiBase.rootNodeId) {
          throw new DomainError("bad_request", `فقط گره ریشه می‌تواند والد null داشته باشد.`);
        }
      }

      if (typeof ovr.sortOrder === "number") {
        cleanedOvr.sortOrder = ovr.sortOrder;
      }

      if (ovr.chemicalStructure !== undefined) {
        cleanedOvr.chemicalStructure = cleanChemicalStructure(ovr.chemicalStructure);
      }

      if (ovr.relatedChemicals !== undefined) {
        cleanedOvr.relatedChemicals = cleanRelatedChemicals(ovr.relatedChemicals);
      }

      if (ovr.chemicalStatus !== undefined) {
        const validStatuses = ["not_checked", "not_required", "pending", "enriched", "needs_review", "failed"];
        cleanedOvr.chemicalStatus =
          typeof ovr.chemicalStatus === "string" && validStatuses.includes(ovr.chemicalStatus)
            ? (ovr.chemicalStatus as MindMapNodeChemicalStatus)
            : undefined;
      }

      overrides[key] = cleanedOvr;
    }
  }

  // 5. Validate customEdges (optional user-created connections)
  const customEdgesRaw = modsObj.customEdges;
  const customEdges: MindMapCustomEdge[] = [];
  if (customEdgesRaw !== undefined && Array.isArray(customEdgesRaw)) {
    const seenEdges = new Set<string>();
    const validNodeIdSet = new Set<string>([
      ...Object.keys(aiBase.nodes),
      ...Object.keys(customNodes),
    ]);
    const deletedIdSet = new Set<string>(deletedNodeIds);

    for (const edgeVal of customEdgesRaw) {
      if (!edgeVal || typeof edgeVal !== "object") continue;
      const e = edgeVal as Record<string, unknown>;
      const source = typeof e.source === "string" ? e.source.trim() : "";
      const target = typeof e.target === "string" ? e.target.trim() : "";
      const sourceHandle = typeof e.sourceHandle === "string" ? e.sourceHandle.trim() : undefined;
      const targetHandle = typeof e.targetHandle === "string" ? e.targetHandle.trim() : undefined;

      // Ensure valid endpoints, not deleted, not self-loop, and both endpoints exist
      if (!source || !target || source === target) continue;
      if (deletedIdSet.has(source) || deletedIdSet.has(target)) continue;
      if (!validNodeIdSet.has(source) || !validNodeIdSet.has(target)) continue;

      const dedupeKey = `${source}_${sourceHandle || ""}_${target}_${targetHandle || ""}`;
      if (seenEdges.has(dedupeKey)) continue;
      seenEdges.add(dedupeKey);

      const id = typeof e.id === "string" && e.id.trim().length > 0 ? e.id.trim() : `ce_${source}_${target}_${seenEdges.size}`;
      customEdges.push({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
      });

      if (customEdges.length >= 60) break;
    }
  }

  // 6. Validate nodePositions (manual coordinates)
  const nodePositionsRaw = modsObj.nodePositions;
  const nodePositions: Record<string, { x: number; y: number }> = {};
  if (nodePositionsRaw && typeof nodePositionsRaw === "object" && !Array.isArray(nodePositionsRaw)) {
    const validNodeIdSet = new Set<string>([
      ...Object.keys(aiBase.nodes),
      ...Object.keys(customNodes),
    ]);
    const deletedIdSet = new Set<string>(deletedNodeIds);

    for (const [key, posVal] of Object.entries(nodePositionsRaw as Record<string, unknown>)) {
      if (!posVal || typeof posVal !== "object" || Array.isArray(posVal)) continue;
      const posObj = posVal as Record<string, unknown>;
      if (typeof posObj.x !== "number" || typeof posObj.y !== "number") continue;
      if (!Number.isFinite(posObj.x) || !Number.isFinite(posObj.y)) continue;
      if (deletedIdSet.has(key) || !validNodeIdSet.has(key)) continue;

      // Clamp coordinates to safe canvas boundaries (-50000 to +50000)
      const clampedX = Math.max(-50000, Math.min(50000, Math.round(posObj.x)));
      const clampedY = Math.max(-50000, Math.min(50000, Math.round(posObj.y)));
      nodePositions[key] = { x: clampedX, y: clampedY };
    }
  }

  // 7. Validate userNotes
  const userNotes: Record<string, MindMapNodeUserNote> = {};
  if (rawNotes !== undefined && rawNotes !== null) {
    if (typeof rawNotes !== "object" || Array.isArray(rawNotes)) {
      throw new DomainError("bad_request", "فیلد userNotes باید یک آبجکت باشد.");
    }

    for (const [nodeId, noteVal] of Object.entries(rawNotes as Record<string, unknown>)) {
      if (!noteVal || typeof noteVal !== "object" || Array.isArray(noteVal)) continue;
      const n = noteVal as Record<string, unknown>;
      const noteText = typeof n.noteText === "string" ? n.noteText : "";

      if (noteText.length > MAX_USER_NOTE_LENGTH) {
        throw new DomainError(
          "bad_request",
          `طول یادداشت برای گره "${nodeId}" بیش از حد مجاز (${MAX_USER_NOTE_LENGTH} کاراکتر) است.`,
        );
      }

      userNotes[nodeId] = {
        noteText,
        updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
      };
    }
  }

  // 6. Tree Topology Validation: Cycle & Reachability check across base + custom + overrides
  const allNodes: Record<string, { id: string; parentId: string | null }> = {};
  for (const [id, bn] of Object.entries(aiBase.nodes)) {
    allNodes[id] = {
      id,
      parentId: overrides[id]?.parentId !== undefined ? overrides[id].parentId! : bn.parentId,
    };
  }
  for (const [id, cn] of Object.entries(customNodes)) {
    allNodes[id] = {
      id,
      parentId: overrides[id]?.parentId !== undefined ? overrides[id].parentId! : cn.parentId,
    };
  }

  // Validate parent existence and check for cycles
  for (const [id, node] of Object.entries(allNodes)) {
    if (id === aiBase.rootNodeId) {
      if (node.parentId !== null) {
        throw new DomainError("bad_request", "گره ریشه نمی‌تواند والد داشته باشد.");
      }
      continue;
    }

    if (!node.parentId) {
      throw new DomainError("bad_request", `گره "${id}" فاقد والد است.`);
    }

    if (!allNodes[node.parentId]) {
      throw new DomainError(
        "bad_request",
        `والد مشخص‌شده ("${node.parentId}") برای گره "${id}" در ساختار مایندمپ وجود ندارد.`,
      );
    }

    // Traverse upwards to detect cycles and calculate depth
    const visited = new Set<string>([id]);
    let curr: string | null = node.parentId;
    let depth = 1;

    while (curr !== null) {
      if (visited.has(curr)) {
        throw new DomainError("bad_request", `ساختار مایندمپ شامل حلقه (Cycle) در مسیر گره "${id}" است.`);
      }
      visited.add(curr);

      const parentNode: { id: string; parentId: string | null } | undefined = allNodes[curr];
      if (!parentNode) {
        throw new DomainError(
          "bad_request",
          `والد مشخص‌شده ("${curr}") در مسیر گره "${id}" وجود ندارد.`,
        );
      }

      curr = parentNode.parentId;
      depth++;

      if (depth > MAX_MINDMAP_DEPTH) {
        throw new DomainError(
          "bad_request",
          `عمق گره "${id}" از حداکثر مجاز (${MAX_MINDMAP_DEPTH} سطح) فراتر رفته است.`,
        );
      }
    }

    // Verify root reachability
    if (!visited.has(aiBase.rootNodeId)) {
      throw new DomainError(
        "bad_request",
        `گره "${id}" به گره ریشه ("${aiBase.rootNodeId}") متصل نیست.`,
      );
    }
  }

  return {
    userModifications: {
      deletedNodeIds: Array.from(new Set(deletedNodeIds)),
      customNodes,
      overrides,
      customEdges,
      nodePositions,
    },
    userNotes,
  };
}

export interface SemanticClusterResult {
  clusterId: string;
  clusterName?: string;
  clusterIndex: number;
  color: string;
}

export function getSemanticClusterColor(clusterIndex: number, defaultColor = "#94a3b8"): string {
  if (clusterIndex < 0 || !Number.isFinite(clusterIndex)) return defaultColor;
  return AVANA_SEMANTIC_PALETTE[clusterIndex % AVANA_SEMANTIC_PALETTE.length];
}

/**
 * Normalizes text for semantic lexical comparisons.
 */
function normalizeForClustering(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u200c/g, "")
    .replace(/\u0643/g, "ک")
    .replace(/[\u064a\u0649]/g, "ی")
    .replace(/[\s\t\r\n]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Standard conservative semantic clustering algorithm for sibling nodes under a parent:
 * 1. Explicit semanticGroup property provided by AI/source.
 * 2. Explicit category or drugClass in structuredDetails.
 * 3. Conservative pharmacological/medical taxonomy heuristic (shared prefix or suffix patterns).
 * 4. Nodes without strong scientific evidence remain unclustered (clusterId: undefined).
 */
export function detectSemanticClusters(
  siblingNodeIds: string[],
  nodesDict: Record<string, MindMapNodeBase>,
): Map<string, SemanticClusterResult> {
  const result = new Map<string, SemanticClusterResult>();
  if (!siblingNodeIds || siblingNodeIds.length <= 1) {
    return result;
  }

  // Raw cluster buckets: clusterKey -> nodeIds[]
  const rawClusters = new Map<string, { label?: string; nodeIds: string[] }>();
  const assigned = new Set<string>();

  // 1. Explicit semanticGroup
  for (const id of siblingNodeIds) {
    const node = nodesDict[id];
    const sg = node?.semanticGroup?.trim();
    if (sg) {
      const normKey = `sg_${normalizeForClustering(sg)}`;
      const existing = rawClusters.get(normKey) || { label: sg, nodeIds: [] };
      existing.nodeIds.push(id);
      rawClusters.set(normKey, existing);
      assigned.add(id);
    }
  }

  // 2. Explicit drugClass in structuredDetails for unassigned nodes
  const classBuckets = new Map<string, string[]>();
  for (const id of siblingNodeIds) {
    if (assigned.has(id)) continue;
    const node = nodesDict[id];
    const dc = node?.structuredDetails?.drugClass?.trim();
    if (dc && dc.length >= 2) {
      const normKey = `dc_${normalizeForClustering(dc)}`;
      const list = classBuckets.get(normKey) || [];
      list.push(id);
      classBuckets.set(normKey, list);
    }
  }

  for (const [normKey, ids] of classBuckets.entries()) {
    if (ids.length >= 2) {
      const node = nodesDict[ids[0]];
      const label = node?.structuredDetails?.drugClass || normKey;
      rawClusters.set(normKey, { label, nodeIds: ids });
      for (const id of ids) assigned.add(id);
    }
  }

  // 3. Conservative medical & pharmacological taxonomy heuristics for remaining unassigned siblings
  const unassignedIds = siblingNodeIds.filter((id) => !assigned.has(id));
  if (unassignedIds.length >= 2) {
    const medicalTaxonomyPatterns = [
      // Pharmacological functional prefixes
      { pattern: /^(مهارکننده|مهارکننده\u200cهای|مهارکننده\u200cها|اینهیبیتور)/i, key: "tax_inhibitor", label: "مهارکننده‌ها" },
      { pattern: /^(آگونیست|اگونیست|آگونیست\u200cهای|آگونیست\u200cها)/i, key: "tax_agonist", label: "آگونیست‌ها" },
      { pattern: /^(آنتاگونیست|انتاگونیست|آنتاگونیست\u200cهای|آنتاگونیست\u200cها)/i, key: "tax_antagonist", label: "آنتاگونیست‌ها" },
      { pattern: /^(مسدودکننده|بلوک\u200cکننده|بلوکر)/i, key: "tax_blocker", label: "مسدودکننده‌ها" },
      { pattern: /^(عوارض|اثرات جانبی|عوارض جانبی|toxicity)/i, key: "tax_adverse", label: "عوارض جانبی" },
      { pattern: /^(کاربرد|موارد مصرف|اندیکاسیون|کاربردهای بالینی)/i, key: "tax_indication", label: "کاربردهای درمانی" },
      { pattern: /^(مکانیسم|سازوکار|مکانیسم اثر|فارماکودینامیک)/i, key: "tax_mechanism", label: "مکانیسم اثر" },
      { pattern: /^(تشخیص|روش\u200cهای تشخیص|تظاهرات بالینی)/i, key: "tax_diagnosis", label: "تشخیص و نشانه‌ها" },
      { pattern: /^(درمان|راهبردهای درمانی|راهکارهای درمانی)/i, key: "tax_treatment", label: "راهبردهای درمانی" },
      // Pharmacological chemical suffixes / drug stems
      { pattern: /(استاتین|statin)$/i, key: "stem_statin", label: "استاتین‌ها" },
      { pattern: /(پرازول|prazole)$/i, key: "stem_prazole", label: "مهارکننده‌های پمپ پروتون" },
      { pattern: /(سارتان|sartan)$/i, key: "stem_sartan", label: "بلوک‌کننده‌های گیرنده آنژیوتانسین" },
      { pattern: /(دیپین|dipine)$/i, key: "stem_dipine", label: "مسدودکننده‌های کانال کلسیم" },
      { pattern: /(لول|olol)$/i, key: "stem_olol", label: "بتامسدودکننده‌ها" },
      { pattern: /(پریل|pril)$/i, key: "stem_pril", label: "مهارکننده‌های آنزیم ACE" },
      { pattern: /(مایسین|mycin|micin)$/i, key: "stem_mycin", label: "آنتی‌بیوتیک‌ها" },
      { pattern: /(سیلین|cillin)$/i, key: "stem_cillin", label: "پنی‌سیلین‌ها" },
      { pattern: /(سیکلوویر|clovir)$/i, key: "stem_clovir", label: "آنالوگ‌های نوکلئوزیدی ضد ویروس" },
      { pattern: /(ماب|mab)$/i, key: "stem_mab", label: "آنتی‌بادی‌های مونوکلونال" },
      { pattern: /(نیب|nib)$/i, key: "stem_nib", label: "مهارکننده‌های تیروزین کیناز" },
    ];

    const matchedTaxonomy = new Map<string, { label: string; ids: string[] }>();

    for (const id of unassignedIds) {
      const node = nodesDict[id];
      if (!node) continue;
      const title = normalizeForClustering(node.title || "");
      if (!title) continue;

      for (const tax of medicalTaxonomyPatterns) {
        if (tax.pattern.test(title)) {
          const list = matchedTaxonomy.get(tax.key) || { label: tax.label, ids: [] };
          list.ids.push(id);
          matchedTaxonomy.set(tax.key, list);
          break; // First matching taxonomy rule
        }
      }
    }

    // Only accept clusters with 2 or more members
    for (const [key, { label, ids }] of matchedTaxonomy.entries()) {
      if (ids.length >= 2) {
        rawClusters.set(key, { label, nodeIds: ids });
        for (const id of ids) assigned.add(id);
      }
    }
  }

  // 4. Filter only valid clusters with at least 2 members (or explicit single group if marked)
  const validClusters = Array.from(rawClusters.entries()).filter(
    ([_, data]) => data.nodeIds.length >= 2,
  );

  // Deterministic sorting of clusters by key to guarantee stable color indexing
  validClusters.sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

  for (let idx = 0; idx < validClusters.length; idx++) {
    const [clusterKey, { label, nodeIds }] = validClusters[idx];
    const color = getSemanticClusterColor(idx);
    for (const id of nodeIds) {
      result.set(id, {
        clusterId: clusterKey,
        clusterName: label,
        clusterIndex: idx,
        color,
      });
    }
  }

  return result;
}

