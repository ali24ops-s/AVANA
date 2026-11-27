/**
 * Hierarchical-First MindMap Architecture Helpers.
 *
 * Implements:
 * - Nested Skeleton Contract & Server-Owned Stable ID Flattening
 * - Source Outline Extraction (zero AI cost)
 * - Structural & Semantic Anomaly Detection (Refiner — no heuristic re-parenting!)
 * - Token-Budgeted Hydration Batching
 * - Grounded Content Hydration & Source Coverage Validation types
 */

import type {
  MindMapNodeBase,
  MindMapNodeCategory,
  MindMapNodeRole,
  MindMapStructuredDetails,
} from "@avana/contracts";
import { MAX_MINDMAP_DEPTH, MAX_MINDMAP_NODES } from "@avana/domain";

export interface MindMapSkeletonNode {
  id: string;
  title: string;
  nodeRole: MindMapNodeRole;
  category?: MindMapNodeCategory;
  children: MindMapSkeletonNode[];
}

export interface MindMapSkeletonPayload {
  root: MindMapSkeletonNode;
}

export interface StructuralAnomaly {
  type:
    | "root_spillover"
    | "misplaced_dependent_attribute"
    | "empty_category"
    | "artificial_category"
    | "duplicate_title"
    | "redundant_single_child_wrapper"
    | "excessive_depth";
  nodeId: string;
  title: string;
  detail: string;
}

export interface SkeletonRefinementReport {
  anomalies: StructuralAnomaly[];
  needsAiRepair: boolean;
  rootBranchCount: number;
  totalNodes: number;
  maxDepth: number;
  emptyCategoryCount: number;
  misplacedDependentCount: number;
}

export interface HydrationNodeInput {
  id: string;
  title: string;
  nodeRole: MindMapNodeRole;
  category?: MindMapNodeCategory;
  parentId: string | null;
  parentTitle: string | null;
  ancestorPath: string[];
  siblingTitles: string[];
}

export interface HydrationBatch {
  batchIndex: number;
  nodes: HydrationNodeInput[];
  estimatedPromptChars: number;
  branchSummary: string;
}

export interface HydrationNodeResult {
  id: string;
  shortDescription?: string;
  keyPoints?: string[];
  examTips?: string[];
  category?: MindMapNodeCategory;
  structuredDetails?: MindMapStructuredDetails;
}

export interface SourceCoverageReport {
  overallCoverageScore: number;
  missingConcepts: Array<{
    title: string;
    suggestedParentId: string;
    nodeRole: MindMapNodeRole;
    category?: MindMapNodeCategory;
    shortDescription: string;
    keyPoints?: string[];
    examTips?: string[];
  }>;
  ungroundedNodeIds?: string[];
}

export interface FlatteningMetrics {
  inputNodeCount: number;
  acceptedNodeCount: number;
  droppedNodeCount: number;
  warnings: string[];
}

const VALID_CATEGORIES = new Set<string>([
  "drug",
  "disease",
  "cellular_mechanism",
  "biochemistry",
  "general",
]);

function normalizeTextForComparison(text: string): string {
  return (text || "")
    .replace(/\u200c/g, "")
    .replace(/\u0643/g, "ک")
    .replace(/[\u064a\u0649]/g, "ی")
    .replace(/[\s\t\r\n]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Extracts markdown headings and chunk headings from source text (zero AI cost)
 * to provide a structural overview to the Skeleton generator.
 */
export function extractSourceOutline(sourceText: string): string {
  if (!sourceText || sourceText.trim().length === 0) return "";
  const lines = sourceText.split(/\r?\n/);
  const headings: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Markdown headings (#, ##, ###)
    const mdMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (mdMatch) {
      const title = mdMatch[2].trim().slice(0, 120);
      const norm = normalizeTextForComparison(title);
      if (title.length >= 3 && !seen.has(norm)) {
        seen.add(norm);
        headings.push(`${"  ".repeat(mdMatch[1].length - 1)}- ${title}`);
      }
      continue;
    }

    // Lesson / Chunk headers from resolveEducationalSource (supports ASCII and Persian digits)
    const lessonMatch = line.match(/^---\s*درسنامه\s*[\d۰-۹]+:\s*«([^»]+)»\s*---$/);
    if (lessonMatch) {
      const title = lessonMatch[1].trim().slice(0, 120);
      const norm = normalizeTextForComparison(title);
      if (!seen.has(norm)) {
        seen.add(norm);
        headings.push(`- ${title}`);
      }
      continue;
    }

    const chunkHeadingMatch = line.match(/^---\s*بخش مرجع[^|]*\|[^|]*\|\s*([^\]\n]+)\]/);
    if (chunkHeadingMatch) {
      const title = chunkHeadingMatch[1].trim().slice(0, 120);
      const norm = normalizeTextForComparison(title);
      if (title.length >= 3 && !seen.has(norm)) {
        seen.add(norm);
        headings.push(`  - ${title}`);
      }
    }
  }

  return headings.slice(0, 50).join("\n");
}

/**
 * Parses a raw Gemini skeleton response into a normalized MindMapSkeletonNode tree.
 */
export function parseSkeletonResponse(raw: unknown): MindMapSkeletonNode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const rootRaw = obj.root && typeof obj.root === "object" ? obj.root : obj;

  const parseNode = (candidate: unknown, depth: number): MindMapSkeletonNode | null => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    if (depth > MAX_MINDMAP_DEPTH) return null;

    const c = candidate as Record<string, unknown>;
    const title = typeof c.title === "string" ? c.title.trim().slice(0, 120) : "";
    if (!title) return null;

    const rawId = typeof c.id === "string" ? c.id.trim() : "";
    const rawRole = c.nodeRole === "category" || c.nodeRole === "concept" ? c.nodeRole : undefined;
    const rawCat = typeof c.category === "string" && VALID_CATEGORIES.has(c.category.trim())
      ? (c.category.trim() as MindMapNodeCategory)
      : "general";

    const rawChildren = Array.isArray(c.children) ? c.children : [];
    const children: MindMapSkeletonNode[] = [];
    for (const childRaw of rawChildren) {
      const parsedChild = parseNode(childRaw, depth + 1);
      if (parsedChild) children.push(parsedChild);
    }

    const nodeRole: MindMapNodeRole =
      depth === 0
        ? "category"
        : rawRole ?? (children.length > 0 ? "category" : "concept");

    return {
      id: rawId || (depth === 0 ? "root" : "node_concept"),
      title,
      nodeRole,
      category: rawCat,
      children,
    };
  };

  return parseNode(rootRaw, 0);
}

/**
 * Generates a server-owned stable, unique ID for a node based on its title/slug,
 * never trusting raw LLM IDs blindly as final.
 */
function buildServerNodeId(
  rawId: string,
  title: string,
  parentId: string | null,
  usedIds: Set<string>,
  isRoot: boolean,
): string {
  if (isRoot) {
    usedIds.add("root");
    return "root";
  }

  // Extract ASCII slug from rawId if clean, otherwise build deterministic hash-slug
  let slug = rawId
    .toLowerCase()
    .replace(/^node_/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

  if (!slug || slug === "root" || slug === "concept") {
    // Deterministic compact hash from normalized title + parentId
    const basis = `${parentId ?? "root"}:${normalizeTextForComparison(title)}`;
    let hash = 2166136261;
    for (let i = 0; i < basis.length; i++) {
      hash ^= basis.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    slug = `item_${(hash >>> 0).toString(36)}`;
  }

  const candidate = `node_${slug}`;
  if (!usedIds.has(candidate)) {
    usedIds.add(candidate);
    return candidate;
  }

  let counter = 2;
  while (usedIds.has(`${candidate}_${counter}`)) {
    counter++;
  }
  const uniqueId = `${candidate}_${counter}`;
  usedIds.add(uniqueId);
  return uniqueId;
}

/**
 * Converts a nested MindMapSkeletonNode tree into the flat Record<string, MindMapNodeBase>
 * expected by MindMapAiBase, assigning server-owned stable IDs and preserving sortOrder.
 *
 * Uses level-order (BFS) budget allocation when total nodes exceed MAX_MINDMAP_NODES
 * so major branches and categories are preserved before deep leaves, and never drops
 * nodes silently (always returns traceable FlatteningMetrics).
 */
export function flattenSkeletonToAiBaseNodes(
  root: MindMapSkeletonNode,
  fallbackRootTitle = "موضوع اصلی",
): {
  rootNodeId: string;
  nodes: Record<string, MindMapNodeBase>;
  idMapping: Map<string, string>;
  metrics: FlatteningMetrics;
} {
  const nodes: Record<string, MindMapNodeBase> = {};
  const usedIds = new Set<string>();
  const idMapping = new Map<string, string>();
  const warnings: string[] = [];

  // Count total input nodes first
  let inputNodeCount = 0;
  const countNodes = (n: MindMapSkeletonNode) => {
    inputNodeCount++;
    for (const c of n.children) countNodes(c);
  };
  countNodes(root);

  // Determine allowed node set via BFS if inputNodeCount > MAX_MINDMAP_NODES
  const allowedSkeletonRefs = new Set<MindMapSkeletonNode>();
  if (inputNodeCount <= MAX_MINDMAP_NODES) {
    const addAll = (n: MindMapSkeletonNode, depth: number) => {
      if (depth >= MAX_MINDMAP_DEPTH) {
        warnings.push(`depth_truncated:${n.title}:depth=${depth}`);
        return;
      }
      allowedSkeletonRefs.add(n);
      for (const c of n.children) addAll(c, depth + 1);
    };
    addAll(root, 0);
  } else {
    const queue: Array<{ node: MindMapSkeletonNode; depth: number }> = [{ node: root, depth: 0 }];
    while (queue.length > 0 && allowedSkeletonRefs.size < MAX_MINDMAP_NODES) {
      const { node, depth } = queue.shift()!;
      if (depth >= MAX_MINDMAP_DEPTH) {
        warnings.push(`depth_truncated:${node.title}:depth=${depth}`);
        continue;
      }
      allowedSkeletonRefs.add(node);
      for (const c of node.children) {
        queue.push({ node: c, depth: depth + 1 });
      }
    }
  }

  const visit = (
    skel: MindMapSkeletonNode,
    parentId: string | null,
    sortOrder: number,
    depth: number,
  ) => {
    if (!allowedSkeletonRefs.has(skel)) return;

    const isRoot = parentId === null;
    const serverId = buildServerNodeId(skel.id, skel.title, parentId, usedIds, isRoot);
    if (skel.id) {
      idMapping.set(skel.id, serverId);
    }

    const title = (skel.title || (isRoot ? fallbackRootTitle : "مفهوم")).trim().slice(0, 120);
    const acceptedChildren = skel.children.filter((c) => allowedSkeletonRefs.has(c));
    const hasChildren = acceptedChildren.length > 0 && depth + 1 < MAX_MINDMAP_DEPTH;

    // A leaf node cannot remain role "category" in the final flattened output unless it's root
    const effectiveRole: MindMapNodeRole = isRoot
      ? "category"
      : skel.nodeRole === "category" && !hasChildren
        ? "concept"
        : skel.nodeRole;

    nodes[serverId] = {
      id: serverId,
      parentId,
      title,
      shortDescription: isRoot ? `نقشه مفهومی جامع ${title}` : "",
      keyPoints: [],
      examples: [],
      examTips: [],
      sourceReferences: [],
      sortOrder,
      category: skel.category ?? "general",
      nodeRole: effectiveRole,
    };

    for (let i = 0; i < acceptedChildren.length; i++) {
      visit(acceptedChildren[i], serverId, i, depth + 1);
    }
  };

  visit(root, null, 0, 0);

  const acceptedNodeCount = Object.keys(nodes).length;
  const droppedNodeCount = Math.max(0, inputNodeCount - acceptedNodeCount);
  if (droppedNodeCount > 0) {
    warnings.push(
      `node_budget_exceeded:input=${inputNodeCount},accepted=${acceptedNodeCount},dropped=${droppedNodeCount}`,
    );
  }

  return {
    rootNodeId: "root",
    nodes,
    idMapping,
    metrics: {
      inputNodeCount,
      acceptedNodeCount,
      droppedNodeCount,
      warnings,
    },
  };
}

const DEPENDENT_ATTRIBUTE_PATTERNS = [
  /^(مکانیسم اثر|مکانیسم عمل|سازوکار اثر|فارماکودینامیک)/i,
  /^(موارد مصرف|اندیکاسیون|کاربردهای بالینی|کاربرد بالینی)/i,
  /^(عوارض جانبی|عوارض|اثرات جانبی|مسمومیت|تداخلات دارویی|منع مصرف|کنترااندیکاسیون|نکات پایش)/i,
  /^(فارماکوکینتیک|جذب و توزیع|متابولیسم و دفع)/i,
];

const ARTIFICIAL_CATEGORY_PATTERNS = [
  /^(سایر موارد|متفرقه|موارد دیگر|نکات متفرقه|مباحث متفرقه|سایر نکات|بخش دیگر)$/i,
];

const SINGLE_DRUG_ROOT_HINTS = /(فلو|متفورمین|وارفارین|هپارین|آسپرین|پردنیزولون|دگزامتازون|فنی‌توئین|کاربامازپین|اسپیرونولاکتون|فلودروکورتیزون|انسولین|دیگوکسین|پروپرانولول)/i;

/**
 * Deterministic Semantic & Structural Anomaly Detector (Refiner).
 *
 * Strictly obeys the architectural rule:
 * - Detects structural anomalies, suspicious root branches, misplaced dependent attributes,
 *   artificial categories, duplicate nodes, and empty categories.
 * - NEVER guesses or fabricates scientific parent-child links via regex/suffix heuristics.
 * - When scientific grouping is ambiguous, flags `needsAiRepair: true` for Gemini to decide.
 */
export function analyzeSkeletonAnomalies(
  root: MindMapSkeletonNode,
): SkeletonRefinementReport {
  const anomalies: StructuralAnomaly[] = [];
  const titleCounts = new Map<string, number>();
  let totalNodes = 0;
  let maxDepth = 0;
  let emptyCategoryCount = 0;
  let misplacedDependentCount = 0;

  const isSingleEntityRoot = SINGLE_DRUG_ROOT_HINTS.test(normalizeTextForComparison(root.title));

  const walk = (node: MindMapSkeletonNode, depth: number, parent: MindMapSkeletonNode | null) => {
    totalNodes++;
    if (depth > maxDepth) maxDepth = depth;

    const normTitle = normalizeTextForComparison(node.title);
    titleCounts.set(normTitle, (titleCounts.get(normTitle) ?? 0) + 1);

    // 1. Artificial category check
    if (
      node.nodeRole === "category" &&
      ARTIFICIAL_CATEGORY_PATTERNS.some((p) => p.test(normTitle))
    ) {
      anomalies.push({
        type: "artificial_category",
        nodeId: node.id,
        title: node.title,
        detail: `دسته مصنوعی «${node.title}» مجاز نیست.`,
      });
    }

    // 2. Empty category check (excluding root)
    if (depth > 0 && node.nodeRole === "category" && node.children.length === 0) {
      emptyCategoryCount++;
      anomalies.push({
        type: "empty_category",
        nodeId: node.id,
        title: node.title,
        detail: `گره دسته‌بندی «${node.title}» فاقد زیرشاخه است.`,
      });
    }

    // 3. Misplaced dependent attributes directly under root (unless topic is a single drug)
    if (
      depth === 1 &&
      !isSingleEntityRoot &&
      DEPENDENT_ATTRIBUTE_PATTERNS.some((p) => p.test(normTitle))
    ) {
      misplacedDependentCount++;
      anomalies.push({
        type: "misplaced_dependent_attribute",
        nodeId: node.id,
        title: node.title,
        detail: `ویژگی وابسته «${node.title}» نباید مستقیماً زیر ریشه قرار گیرد.`,
      });
    }

    // 4. Redundant single-child wrapper where wrapper and child are nearly identical
    if (
      depth > 0 &&
      node.nodeRole === "category" &&
      node.children.length === 1 &&
      normalizeTextForComparison(node.children[0].title) === normTitle
    ) {
      anomalies.push({
        type: "redundant_single_child_wrapper",
        nodeId: node.id,
        title: node.title,
        detail: `لایه زائد تک‌فرزند هم‌نام برای «${node.title}».`,
      });
    }

    // 5. Depth bound check
    if (depth >= MAX_MINDMAP_DEPTH) {
      anomalies.push({
        type: "excessive_depth",
        nodeId: node.id,
        title: node.title,
        detail: `عمق گره «${node.title}» به سقف مجاز (${MAX_MINDMAP_DEPTH}) رسیده است.`,
      });
    }

    void parent;
    for (const child of node.children) {
      walk(child, depth + 1, node);
    }
  };

  walk(root, 0, null);

  // 6. Duplicate titles
  for (const [normTitle, count] of titleCounts.entries()) {
    if (count > 1 && normTitle.length >= 4) {
      anomalies.push({
        type: "duplicate_title",
        nodeId: "multiple",
        title: normTitle,
        detail: `عنوان «${normTitle}» ${count} بار در اسکلت تکرار شده است.`,
      });
    }
  }

  // 7. Root spillover detection (structural ratio, NOT a hardcoded max branch count)
  const rootBranchCount = root.children.length;
  const rootLeafConcepts = root.children.filter(
    (c) => c.nodeRole === "concept" && c.children.length === 0,
  ).length;

  const hasRootSpillover =
    totalNodes >= 10 &&
    ((rootBranchCount >= 9 && rootLeafConcepts >= 4) ||
      (rootBranchCount / Math.max(1, totalNodes) > 0.45 && maxDepth <= 2));

  if (hasRootSpillover) {
    anomalies.push({
      type: "root_spillover",
      nodeId: "root",
      title: root.title,
      detail: `${rootBranchCount} شاخه سطح اول (شامل ${rootLeafConcepts} مفهوم برگ) مستقیماً به ریشه متصل شده‌اند.`,
    });
  }

  const needsAiRepair =
    hasRootSpillover ||
    misplacedDependentCount > 0 ||
    emptyCategoryCount >= 2 ||
    anomalies.some((a) => a.type === "artificial_category");

  return {
    anomalies,
    needsAiRepair,
    rootBranchCount,
    totalNodes,
    maxDepth,
    emptyCategoryCount,
    misplacedDependentCount,
  };
}

/**
 * Performs ONLY deterministic, safe structural cleanups on a skeleton
 * (removing identical single-child wrappers and deduplicating exact sibling duplicates).
 * Never guesses or invents new parent-child relationships.
 */
export function cleanDeterministicSkeletonDefects(
  root: MindMapSkeletonNode,
): MindMapSkeletonNode {
  const cleanNode = (node: MindMapSkeletonNode, depth: number): MindMapSkeletonNode => {
    // Deduplicate exact identical siblings
    const seenSiblingTitles = new Set<string>();
    const dedupedChildren: MindMapSkeletonNode[] = [];

    for (const child of node.children) {
      const norm = normalizeTextForComparison(child.title);
      if (seenSiblingTitles.has(norm)) {
        continue;
      }
      seenSiblingTitles.add(norm);

      let cleanedChild = cleanNode(child, depth + 1);

      // Collapse redundant single-child wrapper ONLY when parent & child have identical normalized title
      if (
        cleanedChild.nodeRole === "category" &&
        cleanedChild.children.length === 1 &&
        normalizeTextForComparison(cleanedChild.children[0].title) === norm
      ) {
        cleanedChild = cleanedChild.children[0];
      }

      dedupedChildren.push(cleanedChild);
    }

    return {
      ...node,
      children: dedupedChildren,
    };
  };

  return cleanNode(root, 0);
}

/**
 * Builds token-budgeted batches for Phase 2 Content Hydration.
 * Splits by BOTH maxNodesPerBatch AND estimated prompt+output character budget
 * while keeping sibling groups & subtrees coherent.
 */
export function buildHydrationBatches(
  nodes: Record<string, MindMapNodeBase>,
  rootNodeId: string,
  maxNodesPerBatch = 35,
  maxBatchInputAndOutputChars = 18_000,
): HydrationBatch[] {
  const childrenMap = new Map<string, string[]>();
  for (const node of Object.values(nodes)) {
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(node.id);
      childrenMap.set(node.parentId, list);
    }
  }

  for (const list of childrenMap.values()) {
    list.sort((a, b) => (nodes[a]?.sortOrder ?? 0) - (nodes[b]?.sortOrder ?? 0));
  }

  const getAncestorPath = (nodeId: string): string[] => {
    const path: string[] = [];
    let curr: string | null = nodeId;
    const visited = new Set<string>();
    while (curr && !visited.has(curr)) {
      visited.add(curr);
      const n: MindMapNodeBase | undefined = nodes[curr];
      if (!n) break;
      path.unshift(n.title);
      curr = n.parentId;
    }
    return path;
  };

  const toHydrationInput = (nodeId: string): HydrationNodeInput => {
    const n = nodes[nodeId];
    const parent = n.parentId ? nodes[n.parentId] : null;
    const siblings = n.parentId
      ? (childrenMap.get(n.parentId) || [])
          .filter((id) => id !== nodeId)
          .map((id) => nodes[id]?.title)
          .filter((t): t is string => Boolean(t))
      : [];

    return {
      id: n.id,
      title: n.title,
      nodeRole: n.nodeRole ?? "concept",
      category: n.category,
      parentId: n.parentId,
      parentTitle: parent ? parent.title : null,
      ancestorPath: getAncestorPath(nodeId),
      siblingTitles: siblings.slice(0, 8),
    };
  };

  // Estimate input JSON size + expected output size (~450 chars per node)
  const estimateBatchBudgetChars = (list: HydrationNodeInput[]): number => {
    let chars = 0;
    for (const item of list) {
      chars += item.title.length + item.ancestorPath.join(" ").length + 550;
    }
    return chars;
  };

  // Collect ordered subtrees under root so related nodes stay in the same batch
  const rootChildren = childrenMap.get(rootNodeId) || [];
  const collectSubtree = (startId: string): string[] => {
    const res = [startId];
    const kids = childrenMap.get(startId) || [];
    for (const k of kids) {
      res.push(...collectSubtree(k));
    }
    return res;
  };

  const orderedSubtrees = rootChildren.map((branchId) => ({
    branchTitle: nodes[branchId]?.title ?? branchId,
    ids: collectSubtree(branchId),
  }));

  const batches: HydrationBatch[] = [];
  let currentNodes: HydrationNodeInput[] = [toHydrationInput(rootNodeId)];
  let currentBranches: string[] = [];

  for (const subtree of orderedSubtrees) {
    const subtreeInputs = subtree.ids.map(toHydrationInput);
    const projectedCount = currentNodes.length + subtreeInputs.length;
    const projectedChars = estimateBatchBudgetChars([...currentNodes, ...subtreeInputs]);

    if (
      currentNodes.length > 1 &&
      (projectedCount > maxNodesPerBatch || projectedChars > maxBatchInputAndOutputChars)
    ) {
      batches.push({
        batchIndex: batches.length,
        nodes: currentNodes,
        estimatedPromptChars: estimateBatchBudgetChars(currentNodes),
        branchSummary: currentBranches.join("، "),
      });
      currentNodes = [];
      currentBranches = [];
    }

    for (const input of subtreeInputs) {
      currentNodes.push(input);
      if (
        currentNodes.length >= maxNodesPerBatch ||
        estimateBatchBudgetChars(currentNodes) >= maxBatchInputAndOutputChars
      ) {
        batches.push({
          batchIndex: batches.length,
          nodes: currentNodes,
          estimatedPromptChars: estimateBatchBudgetChars(currentNodes),
          branchSummary: [...currentBranches, subtree.branchTitle].join("، "),
        });
        currentNodes = [];
        currentBranches = [];
      }
    }

    if (currentNodes.length > 0) {
      currentBranches.push(subtree.branchTitle);
    }
  }

  if (currentNodes.length > 0) {
    batches.push({
      batchIndex: batches.length,
      nodes: currentNodes,
      estimatedPromptChars: estimateBatchBudgetChars(currentNodes),
      branchSummary: currentBranches.join("، "),
    });
  }

  return batches;
}

/**
 * Selects the most relevant sections of a long sourceText for a specific HydrationBatch,
 * ensuring concepts located anywhere in the source (including the very end) are never
 * truncated away by a naive `slice(0, N)`.
 */
export function selectRelevantSourceForBatch(
  sourceText: string,
  nodes: Array<Pick<HydrationNodeInput, "title" | "ancestorPath">>,
  sourceOutline: string,
  maxChars = 22_000,
): string {
  if (!sourceText || sourceText.length <= maxChars) {
    return sourceText;
  }

  // Split into coherent sections by lesson/chunk headers, markdown headings, or paragraphs
  const rawSections = sourceText
    .split(/(?=\n---\s*(?:درسنامه|بخش مرجع)|\n#{1,3}\s+)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If source has no headings/headers, split into overlapping ~2500-char chunks
  const sections: string[] =
    rawSections.length >= 2
      ? rawSections
      : (() => {
          const chunks: string[] = [];
          const step = 2200;
          const size = 2500;
          for (let i = 0; i < sourceText.length; i += step) {
            chunks.push(sourceText.slice(i, i + size));
          }
          return chunks;
        })();

  const queryTerms = new Set<string>();
  for (const n of nodes) {
    const normTitle = normalizeTextForComparison(n.title);
    if (normTitle.length >= 3) queryTerms.add(normTitle);
    for (const token of normTitle.split(/\s+/)) {
      if (token.length >= 3) queryTerms.add(token);
    }
    for (const anc of n.ancestorPath) {
      const normAnc = normalizeTextForComparison(anc);
      if (normAnc.length >= 3) queryTerms.add(normAnc);
    }
  }

  const scored = sections.map((sec, idx) => {
    const normSec = normalizeTextForComparison(sec);
    let score = idx === 0 ? 5 : 0; // slight preference for opening overview
    for (const term of queryTerms) {
      if (normSec.includes(term)) {
        score += term.includes(" ") ? 20 : 8;
      }
    }
    return { idx, sec, score };
  });

  // Sort by relevance descending, pick sections up to maxChars, then restore chronological order
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  const selected: Array<{ idx: number; sec: string }> = [];
  let usedChars = sourceOutline ? sourceOutline.length + 100 : 0;

  for (const item of scored) {
    if (usedChars + item.sec.length + 4 > maxChars && selected.length >= 1) {
      continue;
    }
    const clipped =
      usedChars + item.sec.length > maxChars
        ? item.sec.slice(0, Math.max(500, maxChars - usedChars))
        : item.sec;
    selected.push({ idx: item.idx, sec: clipped });
    usedChars += clipped.length + 4;
    if (usedChars >= maxChars) break;
  }

  selected.sort((a, b) => a.idx - b.idx);
  const joined = selected.map((s) => s.sec).join("\n\n");
  return sourceOutline ? `ساختار کلی منبع:\n${sourceOutline}\n\n${joined}` : joined;
}
