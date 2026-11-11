/**
 * Balanced Multi-Directional Hierarchical Tree Layout Algorithm for Interactive Mind Map.
 *
 * Positions the root node at (0, 0) and partitions main branches symmetrically
 * between Left (negative X) and Right (positive X) sides based on subtree weight
 * and height (Greedy LPT balance).
 *
 * Features:
 * - Balances vertical height between both sides to prevent excessive vertical stretching.
 * - Symmetrical positioning around Y = 0 for a balanced rectangular aspect ratio.
 * - Smooth step edges connecting from parent handles to child handles.
 * - Dynamic spacing per depth and subtree size with zero overlap guarantee.
 * - Preserves logical sortOrder within each side.
 * - Full backward compatibility with existing and legacy mind map payloads.
 */

import type { Node, Edge } from "@xyflow/react";
import type { MindMapNodeBase } from "@avana/contracts";
import {
  detectSemanticClusters,
  type SemanticClusterResult,
} from "@avana/domain";

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
  collapsedNodeIds?: Set<string>;
  previousPositions?: Map<string, { x: number; y: number }> | Record<string, { x: number; y: number }>;
  nodePositions?: Record<string, { x: number; y: number }>;
}

let measurementCanvas: HTMLCanvasElement | null = null;

/**
 * Measures text pixel width with high fidelity using an offscreen Canvas context,
 * with deterministic character-ratio estimation for test/SSR environments.
 */
export function measureTextWidth(
  text: string,
  font = "700 14px Estedad, system-ui, sans-serif",
  charRatioFallback = 0.62,
  fontSize = 14,
): number {
  const safeText = String(text ?? "");
  if (!safeText) return 0;

  if (typeof document !== "undefined") {
    try {
      if (!measurementCanvas) {
        measurementCanvas = document.createElement("canvas");
      }
      const ctx = measurementCanvas.getContext("2d");
      if (ctx) {
        ctx.font = font;
        const metrics = ctx.measureText(safeText);
        if (metrics && metrics.width > 0) {
          return Math.ceil(metrics.width);
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for SSR and headless test environments
  let estimated = 0;
  for (let i = 0; i < safeText.length; i++) {
    const code = safeText.charCodeAt(i);
    if (code >= 0x0600 && code <= 0x06ff) {
      // Persian / Arabic character
      estimated += fontSize * charRatioFallback;
    } else if (code >= 48 && code <= 57) {
      // Digits
      estimated += fontSize * 0.55;
    } else if (code <= 32) {
      // Space
      estimated += fontSize * 0.32;
    } else if (code < 128) {
      // Latin
      estimated += fontSize * 0.52;
    } else {
      estimated += fontSize * 0.6;
    }
  }
  return Math.ceil(estimated);
}

/**
 * Computes individual node dimensions based on title length, depth typography scale,
 * and optional descriptions. Compactly adapts dimensions removing unnecessary empty spaces.
 */
/**
 * Computes individual node dimensions based on title length, depth typography scale,
 * multiline wrapping, and optional descriptions. Ensures standard internal padding
 * from all 4 sides with zero border collision.
 */
export function calculateNodeDimensions(
  title: string,
  depth: number,
  options?:
    | {
        hasDescription?: boolean;
        description?: string;
        hasIndicators?: boolean;
        isRoot?: boolean;
        baseNodeWidth?: number;
        baseNodeHeight?: number;
        hasChildren?: boolean;
      }
    | string
    | boolean,
): { width: number; height: number } {
  const opts =
    typeof options === "string"
      ? { description: options }
      : typeof options === "boolean"
        ? { hasDescription: options }
        : options;

  const isRoot = depth === 0 || opts?.isRoot;
  const descText = (opts?.description || "").trim();
  const hasDesc = Boolean(descText || opts?.hasDescription);
  const cleanTitle = String(title ?? "").trim() || "گروه";

  // Root node dimensions
  if (isRoot) {
    const rootFont = "800 18px Estedad, system-ui, sans-serif";
    const rootLineHeight = 26;
    const paddingX = 56; // 28px each side
    const paddingY = 36; // 18px top and bottom

    const titleLines = cleanTitle.split(/\r?\n/);
    let maxTitleLineWidth = 0;
    for (const line of titleLines) {
      const lineW = measureTextWidth(line, rootFont, 0.65, 18);
      if (lineW > maxTitleLineWidth) maxTitleLineWidth = lineW;
    }

    const minRootWidth = opts?.baseNodeWidth ?? 180;
    let width = Math.max(minRootWidth, maxTitleLineWidth + paddingX);

    // Dynamic height based on multiline title or long wrapped title
    let effectiveTitleLines = titleLines.length;
    if (width > 480 && effectiveTitleLines === 1) {
      width = 440;
      const contentW = Math.max(160, width - paddingX);
      effectiveTitleLines = Math.max(1, Math.ceil((maxTitleLineWidth * 1.05) / contentW));
    }

    let height = opts?.baseNodeHeight ?? Math.max(64, paddingY + effectiveTitleLines * rootLineHeight);

    if (descText && !opts?.baseNodeHeight) {
      const descWidth = measureTextWidth(descText, "400 13px Estedad, system-ui, sans-serif", 0.58, 13);
      width = Math.max(width, Math.min(420, Math.max(220, Math.ceil(descWidth / 2))));
      const contentW = Math.max(140, width - paddingX);
      const estLines = Math.max(1, Math.ceil((descWidth * 1.08) / contentW));
      height = Math.max(height, paddingY + effectiveTitleLines * rootLineHeight + 8 + estLines * 20);
    }
    return { width, height };
  }

  // Branch and child nodes typography scale
  let fontSize = 12;
  let fontWeight = "600";
  let fontPaddingX = 44; // 18px each side + 8px handle clearance
  let paddingY = 22; // 11px top and bottom
  let titleLineHeight = 20;

  if (depth === 1) {
    fontSize = 15;
    fontWeight = "700";
    fontPaddingX = 52; // 20px each side + 12px handle/toggle clearance
    paddingY = 28; // 14px top and bottom
    titleLineHeight = 24;
  } else if (depth === 2) {
    fontSize = 13.5;
    fontWeight = "700";
    fontPaddingX = 48;
    paddingY = 24;
    titleLineHeight = 22;
  } else if (depth === 3) {
    fontSize = 12.5;
    fontWeight = "600";
    fontPaddingX = 46;
    paddingY = 22;
    titleLineHeight = 20;
  } else {
    fontSize = 12;
    fontWeight = "600";
    fontPaddingX = 44;
    paddingY = 22;
    titleLineHeight = 19;
  }

  const titleFont = `${fontWeight} ${fontSize}px Estedad, system-ui, sans-serif`;
  const rawTitleLines = cleanTitle.split(/\r?\n/);
  let maxTitleLineWidth = 0;
  for (const line of rawTitleLines) {
    const lineW = measureTextWidth(line, titleFont, 0.62, fontSize);
    if (lineW > maxTitleLineWidth) maxTitleLineWidth = lineW;
  }

  // Base width is measured from actual text length + symmetric padding
  const minWidth = opts?.baseNodeWidth ?? Math.max(110, Math.ceil(fontSize * 7.5));
  let width = Math.max(minWidth, maxTitleLineWidth + fontPaddingX);

  // When title is exceptionally long (exceeds 600px), wrap it nicely into multiple lines
  let totalTitleLines = rawTitleLines.length;
  const maxAllowedSingleLineWidth = 600;
  if (!opts?.baseNodeWidth && width > maxAllowedSingleLineWidth && totalTitleLines === 1) {
    const targetWrappedWidth = depth === 1 ? 380 : 320;
    width = targetWrappedWidth;
    const contentW = Math.max(120, width - fontPaddingX);
    totalTitleLines = Math.max(2, Math.ceil((maxTitleLineWidth * 1.05) / contentW));
  } else if (opts?.baseNodeWidth) {
    const contentW = Math.max(80, opts.baseNodeWidth - fontPaddingX);
    totalTitleLines = Math.max(totalTitleLines, Math.ceil((maxTitleLineWidth * 1.02) / contentW));
  }

  // Smart base width when descriptions exist
  if (hasDesc) {
    const descCharLen = descText.length;
    let descTargetWidth = 175;
    if (descCharLen > 120) {
      descTargetWidth = 275;
    } else if (descCharLen > 60) {
      descTargetWidth = 240;
    } else if (descCharLen > 25) {
      descTargetWidth = 195;
    }
    width = Math.max(width, descTargetWidth);
    if (opts?.baseNodeWidth) {
      width = Math.max(width, opts.baseNodeWidth);
    }
    width = Math.min(width, 320);
  }

  // Height calculation with strict padding preservation
  let height: number;
  if (opts?.baseNodeHeight) {
    height = opts.baseNodeHeight;
  } else if (hasDesc) {
    const descFontSize = depth === 1 ? 12 : 11.5;
    const descLineHeight = depth === 1 ? 19 : 17.5;
    const gap = 6;
    const indicatorsHeight = opts?.hasIndicators ? 16 : 0;

    let estLines = 2;
    if (descText) {
      const descTotalWidth = measureTextWidth(
        descText,
        `400 ${descFontSize}px Estedad, system-ui, sans-serif`,
        0.58,
        descFontSize,
      );
      const availableW = Math.max(100, width - 28);
      estLines = Math.max(1, Math.ceil((descTotalWidth * 1.08) / availableW));
    }

    const calculatedTitleHeight = totalTitleLines * titleLineHeight;
    height = paddingY + indicatorsHeight + calculatedTitleHeight + gap + Math.round(estLines * descLineHeight);
  } else {
    // Dynamic height based on actual title line count, indicators, and symmetric top/bottom padding
    const indicatorsHeight = opts?.hasIndicators ? 14 : 0;
    const calculatedTitleHeight = totalTitleLines * titleLineHeight;
    height = paddingY + indicatorsHeight + calculatedTitleHeight;
  }

  return { width, height };
}

/**
 * Generates an SVG path for orthogonal edge routing with clean 90-degree rounded corners.
 */
export function createOrthogonalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  trunkXOverride?: number,
  borderRadius = 12,
): string {
  if (
    !Number.isFinite(sourceX) ||
    !Number.isFinite(sourceY) ||
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetY)
  ) {
    return "";
  }

  // If source and target are virtually on the exact same horizontal plane, route straight
  if (Math.abs(sourceY - targetY) <= 1) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  // Determine trunkX (vertical segment X position)
  let trunkX =
    trunkXOverride !== undefined && Number.isFinite(trunkXOverride)
      ? trunkXOverride
      : (sourceX + targetX) / 2;

  if (!Number.isFinite(trunkX)) {
    trunkX = (sourceX + targetX) / 2;
  }
  if (!Number.isFinite(trunkX)) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  }

  // Clamp trunkX so it leaves at least 16px of horizontal exit and entry clearance
  const minOffset = 16;
  if (sourceX > targetX) {
    // Going left
    if (trunkX > sourceX - minOffset) trunkX = sourceX - minOffset;
    if (trunkX < targetX + minOffset) trunkX = targetX + minOffset;
  } else {
    // Going right
    if (trunkX < sourceX + minOffset) trunkX = sourceX + minOffset;
    if (trunkX > targetX - minOffset) trunkX = targetX - minOffset;
  }

  const dx1 = trunkX > sourceX ? 1 : -1;
  const dy = targetY > sourceY ? 1 : -1;
  const dx2 = targetX > trunkX ? 1 : -1;

  const maxR = Math.min(
    borderRadius,
    Math.abs(trunkX - sourceX) / 2,
    Math.abs(targetX - trunkX) / 2,
    Math.abs(targetY - sourceY) / 2,
  );
  const r = Number.isFinite(maxR) ? Math.max(0, maxR) : 0;

  if (r < 1) {
    return `M ${sourceX} ${sourceY} L ${trunkX} ${sourceY} L ${trunkX} ${targetY} L ${targetX} ${targetY}`;
  }

  const p0 = `M ${sourceX} ${sourceY}`;
  const p1 = `L ${trunkX - dx1 * r} ${sourceY}`;
  const c1 = `Q ${trunkX} ${sourceY}, ${trunkX} ${sourceY + dy * r}`;
  const p2 = `L ${trunkX} ${targetY - dy * r}`;
  const c2 = `Q ${trunkX} ${targetY}, ${trunkX + dx2 * r} ${targetY}`;
  const p3 = `L ${targetX} ${targetY}`;

  return `${p0} ${p1} ${c1} ${p2} ${c2} ${p3}`;
}

/**
 * Checks if a 2D line segment between (x1, y1) and (x2, y2) intersects the strict interior
 * of an axis-aligned box [bx, by, bw, bh], with an interior margin epsilon to allow touching boundaries.
 */
export function lineSegmentIntersectsBoxInterior(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  epsilon = 2,
): boolean {
  const minBoxX = bx + epsilon;
  const maxBoxX = bx + bw - epsilon;
  const minBoxY = by + epsilon;
  const maxBoxY = by + bh - epsilon;

  if (minBoxX >= maxBoxX || minBoxY >= maxBoxY) return false;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  // If segment bounding box does not overlap box interior
  if (maxX <= minBoxX || minX >= maxBoxX || maxY <= minBoxY || minY >= maxBoxY) {
    return false;
  }

  // Horizontal segment
  if (Math.abs(y1 - y2) <= 0.001) {
    const y = y1;
    return y > minBoxY && y < maxBoxY && maxX > minBoxX && minX < maxBoxX;
  }

  // Vertical segment
  if (Math.abs(x1 - x2) <= 0.001) {
    const x = x1;
    return x > minBoxX && x < maxBoxX && maxY > minBoxY && minY < maxBoxY;
  }

  return false;
}

/**
 * Validates that an orthogonal edge path (3 segments: H1, V, H2) does not penetrate
 * the interior of any node box other than legitimate connections at boundary handles.
 */
export function doesOrthogonalEdgeIntersectNode(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  trunkX: number,
  box: { x: number; y: number; width: number; height: number },
  isSourceOrTarget = false,
  epsilon = 2,
): boolean {
  const eps = isSourceOrTarget ? Math.max(epsilon, 3) : epsilon;

  // Segment 1: (sourceX, sourceY) -> (trunkX, sourceY)
  if (lineSegmentIntersectsBoxInterior(sourceX, sourceY, trunkX, sourceY, box.x, box.y, box.width, box.height, eps)) {
    return true;
  }
  // Segment 2: (trunkX, sourceY) -> (trunkX, targetY)
  if (lineSegmentIntersectsBoxInterior(trunkX, sourceY, trunkX, targetY, box.x, box.y, box.width, box.height, eps)) {
    return true;
  }
  // Segment 3: (trunkX, targetY) -> (targetX, targetY)
  if (lineSegmentIntersectsBoxInterior(trunkX, targetY, targetX, targetY, box.x, box.y, box.width, box.height, eps)) {
    return true;
  }

  return false;
}

/**
 * Generates an SVG path for multi-point orthogonal paths with smooth 90-degree rounded corners.
 */
export function createWaypointOrthogonalPath(
  points: Array<{ x: number; y: number }>,
  borderRadius = 12,
): string {
  if (!points || points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  // Remove consecutive duplicates
  const cleanPoints: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = cleanPoints[cleanPoints.length - 1];
    const cur = points[i];
    if (Math.abs(cur.x - prev.x) > 0.5 || Math.abs(cur.y - prev.y) > 0.5) {
      cleanPoints.push(cur);
    }
  }

  // Remove redundant intermediate collinear points
  const nonCollinear: Array<{ x: number; y: number }> = [cleanPoints[0]];
  for (let i = 1; i < cleanPoints.length - 1; i++) {
    const prev = nonCollinear[nonCollinear.length - 1];
    const curr = cleanPoints[i];
    const next = cleanPoints[i + 1];
    const isCollinearX = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
    const isCollinearY = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
    if (!isCollinearX && !isCollinearY) {
      nonCollinear.push(curr);
    }
  }
  nonCollinear.push(cleanPoints[cleanPoints.length - 1]);

  if (nonCollinear.length < 2) return "";
  if (nonCollinear.length === 2) {
    return `M ${nonCollinear[0].x} ${nonCollinear[0].y} L ${nonCollinear[1].x} ${nonCollinear[1].y}`;
  }

  let d = `M ${nonCollinear[0].x} ${nonCollinear[0].y}`;

  for (let i = 1; i < nonCollinear.length - 1; i++) {
    const pPrev = nonCollinear[i - 1];
    const pCurr = nonCollinear[i];
    const pNext = nonCollinear[i + 1];

    const dxIn = pCurr.x - pPrev.x;
    const dyIn = pCurr.y - pPrev.y;
    const lenIn = Math.hypot(dxIn, dyIn);

    const dxOut = pNext.x - pCurr.x;
    const dyOut = pNext.y - pCurr.y;
    const lenOut = Math.hypot(dxOut, dyOut);

    if (lenIn < 1 || lenOut < 1) {
      d += ` L ${pCurr.x} ${pCurr.y}`;
      continue;
    }

    const maxR = Math.min(borderRadius, lenIn / 2, lenOut / 2);
    const r = Math.max(0, maxR);

    if (r < 1) {
      d += ` L ${pCurr.x} ${pCurr.y}`;
      continue;
    }

    const unitInX = dxIn / lenIn;
    const unitInY = dyIn / lenIn;
    const unitOutX = dxOut / lenOut;
    const unitOutY = dyOut / lenOut;

    const cornerStartX = pCurr.x - unitInX * r;
    const cornerStartY = pCurr.y - unitInY * r;
    const cornerEndX = pCurr.x + unitOutX * r;
    const cornerEndY = pCurr.y + unitOutY * r;

    d += ` L ${cornerStartX} ${cornerStartY} Q ${pCurr.x} ${pCurr.y}, ${cornerEndX} ${cornerEndY}`;
  }

  const pLast = nonCollinear[nonCollinear.length - 1];
  d += ` L ${pLast.x} ${pLast.y}`;
  return d;
}

/**
 * Checks if a polyline given by points intersects the strict interior of any box in obstacleBoxes.
 */
export function isPathIntersectingAnyBox(
  points: Array<{ x: number; y: number }>,
  obstacleBoxes: Array<{ x: number; y: number; width: number; height: number; id?: string }>,
  epsilon = 2,
): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    for (const box of obstacleBoxes) {
      if (lineSegmentIntersectsBoxInterior(p1.x, p1.y, p2.x, p2.y, box.x, box.y, box.width, box.height, epsilon)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Calculates adaptive branch lane assignment to distribute main branches into a balanced
 * rectangular envelope (Width > Height) rather than stacking all branches in a single column.
 * Adapts based on branch count, subtree height, and branch depth.
 */
export function getBranchLane(
  index: number,
  totalBranches: number,
  branchHeight?: number,
  branchDepth?: number,
): number {
  if (totalBranches <= 1) return 0;

  if (totalBranches === 2) {
    return branchHeight && branchHeight > 240 && index === 1 ? 1 : 0;
  }

  if (totalBranches === 3) {
    if (branchDepth && branchDepth >= 3 && index !== 1) return 0;
    return index === 1 ? 0 : 1;
  }

  if (totalBranches === 4) {
    return index === 0 || index === 3 ? 1 : 0;
  }

  if (totalBranches === 5) {
    const distFromCenter = Math.abs(index - 2);
    return Math.min(2, distFromCenter);
  }

  if (totalBranches === 6) {
    const distFromCenter = Math.abs(index - 2.5);
    if (distFromCenter > 2) return 2;
    if (distFromCenter > 1) return 1;
    return 0;
  }

  // For totalBranches >= 7: smooth symmetrical fanning up to 3 lanes
  const center = (totalBranches - 1) / 2;
  const normalizedDist = Math.abs(index - center) / center;
  let lane = Math.round(normalizedDist * (totalBranches >= 9 ? 3 : 2));
  if (branchDepth && branchDepth >= 4 && lane > 0) {
    lane--;
  }
  return Math.max(0, Math.min(3, lane));
}

export interface RoutedEdgeResult {
  path: string;
  trunkX?: number;
}

/**
 * Computes a collision-free orthogonal path between source and target boxes.
 * Evaluates candidate trunk corridors for a standard 3-segment orthogonal path,
 * and falls back to a multi-segment detour if an obstacle box obstructs the corridor.
 */
export function routeCollisionFreeEdge(
  sourceBox: { x: number; y: number; width: number; height: number },
  targetBox: { x: number; y: number; width: number; height: number },
  sourceHandle: "left" | "right" | "top" | "bottom" | string,
  targetHandle: "left" | "right" | "top" | "bottom" | string,
  obstacleBoxes: Array<{ id?: string; x: number; y: number; width: number; height: number }>,
  preferredTrunkX?: number,
): RoutedEdgeResult {
  let sourceX = sourceBox.x + sourceBox.width / 2;
  let sourceY = sourceBox.y + sourceBox.height / 2;
  if (sourceHandle === "left") sourceX = sourceBox.x;
  else if (sourceHandle === "right") sourceX = sourceBox.x + sourceBox.width;
  else if (sourceHandle === "top") sourceY = sourceBox.y;
  else if (sourceHandle === "bottom") sourceY = sourceBox.y + sourceBox.height;

  let targetX = targetBox.x + targetBox.width / 2;
  let targetY = targetBox.y + targetBox.height / 2;
  if (targetHandle === "left") targetX = targetBox.x;
  else if (targetHandle === "right") targetX = targetBox.x + targetBox.width;
  else if (targetHandle === "top") targetY = targetBox.y;
  else if (targetHandle === "bottom") targetY = targetBox.y + targetBox.height;

  // Filter obstacle boxes to exclude source and target boxes
  const obstacles = obstacleBoxes.filter((b) => {
    const isSource =
      Math.abs(b.x - sourceBox.x) < 1 &&
      Math.abs(b.y - sourceBox.y) < 1 &&
      Math.abs(b.width - sourceBox.width) < 1;
    const isTarget =
      Math.abs(b.x - targetBox.x) < 1 &&
      Math.abs(b.y - targetBox.y) < 1 &&
      Math.abs(b.width - targetBox.width) < 1;
    return !isSource && !isTarget;
  });

  // Direct straight line if on virtually same Y plane
  if (Math.abs(sourceY - targetY) <= 1) {
    const isBlocked = obstacles.some((b) =>
      lineSegmentIntersectsBoxInterior(sourceX, sourceY, targetX, targetY, b.x, b.y, b.width, b.height, 2),
    );
    if (!isBlocked) {
      return {
        path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
        trunkX: (sourceX + targetX) / 2,
      };
    }
  }

  // 1. Evaluate candidate trunkX positions for standard 3-segment orthogonal routing
  const candidateTrunkXs: number[] = [];
  if (preferredTrunkX !== undefined && Number.isFinite(preferredTrunkX)) {
    candidateTrunkXs.push(preferredTrunkX);
  }
  const midX = Math.round((sourceX + targetX) / 2);
  if (!candidateTrunkXs.includes(midX)) {
    candidateTrunkXs.push(midX);
  }

  const ratios = [0.4, 0.6, 0.25, 0.75, 0.15, 0.85];
  for (const r of ratios) {
    const tx = Math.round(sourceX + (targetX - sourceX) * r);
    if (!candidateTrunkXs.includes(tx)) {
      candidateTrunkXs.push(tx);
    }
  }

  for (const tx of candidateTrunkXs) {
    let collides = false;
    for (const obs of obstacles) {
      if (doesOrthogonalEdgeIntersectNode(sourceX, sourceY, targetX, targetY, tx, obs, false, 2)) {
        collides = true;
        break;
      }
    }
    if (!collides) {
      return {
        path: createOrthogonalPath(sourceX, sourceY, targetX, targetY, tx, 12),
        trunkX: tx,
      };
    }
  }

  // 2. 5-segment waypoint detour if standard 3-segment path collides
  const blockingObs = obstacles.filter((obs) =>
    doesOrthogonalEdgeIntersectNode(sourceX, sourceY, targetX, targetY, midX, obs, false, 2),
  );

  if (blockingObs.length > 0) {
    const primary = blockingObs[0];
    const topDetourY = primary.y - 18;
    const bottomDetourY = primary.y + primary.height + 18;

    const goingLeft = sourceX > targetX;
    const x1 = goingLeft
      ? Math.max(sourceX - 24, primary.x + primary.width + 16)
      : Math.min(sourceX + 24, primary.x - 16);
    const x2 = goingLeft
      ? Math.min(targetX + 24, primary.x - 16)
      : Math.max(targetX - 24, primary.x + primary.width + 16);

    const detourCandidates = [
      [
        { x: sourceX, y: sourceY },
        { x: x1, y: sourceY },
        { x: x1, y: topDetourY },
        { x: x2, y: topDetourY },
        { x: x2, y: targetY },
        { x: targetX, y: targetY },
      ],
      [
        { x: sourceX, y: sourceY },
        { x: x1, y: sourceY },
        { x: x1, y: bottomDetourY },
        { x: x2, y: bottomDetourY },
        { x: x2, y: targetY },
        { x: targetX, y: targetY },
      ],
    ];

    for (const pts of detourCandidates) {
      if (!isPathIntersectingAnyBox(pts, obstacles, 2)) {
        return {
          path: createWaypointOrthogonalPath(pts, 12),
          trunkX: midX,
        };
      }
    }
  }

  // Fallback to preferred or midX
  const fallbackTrunkX =
    preferredTrunkX !== undefined && Number.isFinite(preferredTrunkX) ? preferredTrunkX : midX;
  return {
    path: createOrthogonalPath(sourceX, sourceY, targetX, targetY, fallbackTrunkX, 12),
    trunkX: fallbackTrunkX,
  };
}

export interface SharedBranchChild {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clusterInfo?: SemanticClusterResult;
  isManual?: boolean;
}

export interface SharedBranchEdgeResult {
  childId: string;
  path: string;
  trunkX: number;
  sourceHandle: string;
  targetHandle: string;
}

/**
 * Computes collision-free shared branch routing for a parent node and its visible children on a specific side.
 * - Creates a single unified vertical trunk (spine) shared by all siblings.
 * - Positions the shared vertical trunk close to the child destination boxes, leaving a short dedicated connection.
 * - Non-overlapping path partitioning: the parent horizontal stem and each vertical trunk segment are drawn
 *   strictly ONCE across the sibling edge set, completely eliminating dark, double-stroked, or overlapping lines.
 */
export function routeSharedBranchGroup(
  parent: { id: string; x: number; y: number; width: number; height: number },
  children: SharedBranchChild[],
  side: "left" | "right",
  obstacleBoxes: Array<{ id?: string; x: number; y: number; width: number; height: number }>,
  borderRadius = 12,
): SharedBranchEdgeResult[] {
  if (!children || children.length === 0) return [];

  const sourceHandle = side === "left" ? "left" : "right";
  const targetHandle = side === "left" ? "right" : "left";
  const sourceX = side === "left" ? parent.x : parent.x + parent.width;
  const sourceY = Math.round(parent.y + parent.height / 2);

  // If single child, route collision-free orthogonal path
  if (children.length === 1) {
    const c = children[0];
    const targetX = side === "left" ? c.x + c.width : c.x;
    const targetY = Math.round(c.y + c.height / 2);
    const corridorW = Math.abs(sourceX - targetX);
    const stub = Math.min(34, Math.max(22, Math.round(corridorW * 0.28)));
    const preferredTrunkX = side === "left" ? targetX + stub : targetX - stub;

    const routed = routeCollisionFreeEdge(
      parent,
      c,
      sourceHandle,
      targetHandle,
      obstacleBoxes,
      preferredTrunkX,
    );
    return [
      {
        childId: c.id,
        path: routed.path,
        trunkX: routed.trunkX ?? preferredTrunkX,
        sourceHandle,
        targetHandle,
      },
    ];
  }

  // 1. Sort children ascending by target Y (top to bottom)
  const sorted = [...children].sort((a, b) => {
    const aY = a.y + a.height / 2;
    const bY = b.y + b.height / 2;
    return aY - bY;
  });

  // 2. Determine shared trunkX position close to the children column
  let trunkX: number;
  if (side === "left") {
    const maxChildRightEdge = Math.max(...sorted.map((c) => c.x + c.width));
    const corridorW = sourceX - maxChildRightEdge;
    const stub = Math.min(34, Math.max(22, Math.round(corridorW * 0.28)));
    let tx = maxChildRightEdge + stub;
    if (tx > sourceX - 20) tx = Math.round((sourceX + maxChildRightEdge) / 2);
    if (tx < maxChildRightEdge + 14) tx = maxChildRightEdge + 14;
    trunkX = tx;
  } else {
    const minChildLeftEdge = Math.min(...sorted.map((c) => c.x));
    const corridorW = minChildLeftEdge - sourceX;
    const stub = Math.min(34, Math.max(22, Math.round(corridorW * 0.28)));
    let tx = minChildLeftEdge - stub;
    if (tx < sourceX + 20) tx = Math.round((sourceX + minChildLeftEdge) / 2);
    if (tx > minChildLeftEdge - 14) tx = minChildLeftEdge - 14;
    trunkX = tx;
  }

  // Check obstacles against candidate trunkX
  const obstacles = obstacleBoxes.filter(
    (b) => b.id !== parent.id && !children.some((c) => c.id === b.id),
  );
  const minY = Math.min(sourceY, ...sorted.map((c) => Math.round(c.y + c.height / 2)));
  const maxY = Math.max(sourceY, ...sorted.map((c) => Math.round(c.y + c.height / 2)));

  const isTrunkBlocked = (tx: number) => {
    return obstacles.some((obs) => {
      return (
        lineSegmentIntersectsBoxInterior(tx, minY, tx, maxY, obs.x, obs.y, obs.width, obs.height, 2) ||
        lineSegmentIntersectsBoxInterior(sourceX, sourceY, tx, sourceY, obs.x, obs.y, obs.width, obs.height, 2)
      );
    });
  };

  if (isTrunkBlocked(trunkX)) {
    const midX = Math.round(
      (sourceX +
        (side === "left"
          ? Math.max(...sorted.map((c) => c.x + c.width))
          : Math.min(...sorted.map((c) => c.x)))) /
        2,
    );
    const candidateXs = [
      midX,
      trunkX + (side === "left" ? 16 : -16),
      trunkX + (side === "left" ? -16 : 16),
    ];
    for (const cx of candidateXs) {
      if (!isTrunkBlocked(cx)) {
        trunkX = cx;
        break;
      }
    }
  }

  // 3. Partition children into collinear, upper (above sourceY), and lower (below sourceY)
  const collinear = sorted.filter(
    (c) => Math.abs(Math.round(c.y + c.height / 2) - sourceY) <= 1,
  );
  const upper = sorted.filter(
    (c) => Math.round(c.y + c.height / 2) < sourceY - 1,
  );
  // Sort upper descending: closest to sourceY first, highest up last
  upper.sort((a, b) => Math.round(b.y + b.height / 2) - Math.round(a.y + a.height / 2));

  const lower = sorted.filter(
    (c) => Math.round(c.y + c.height / 2) > sourceY + 1,
  );
  // Sort lower ascending: closest to sourceY first, lowest down last
  lower.sort((a, b) => Math.round(a.y + a.height / 2) - Math.round(b.y + b.height / 2));

  const results: SharedBranchEdgeResult[] = [];
  const stemDx = side === "left" ? -1 : 1;
  const dx = side === "left" ? -1 : 1;

  // Track whether the root horizontal stem has been drawn by any edge
  let stemDrawn = false;

  // A. Handle collinear child if present
  if (collinear.length > 0) {
    const c0 = collinear[0];
    const targetX = side === "left" ? c0.x + c0.width : c0.x;
    const targetY = Math.round(c0.y + c0.height / 2);
    results.push({
      childId: c0.id,
      path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      trunkX,
      sourceHandle,
      targetHandle,
    });
    stemDrawn = true;

    for (let i = 1; i < collinear.length; i++) {
      const ci = collinear[i];
      const ciX = side === "left" ? ci.x + ci.width : ci.x;
      const ciY = Math.round(ci.y + ci.height / 2);
      results.push({
        childId: ci.id,
        path: `M ${trunkX} ${ciY} L ${ciX} ${ciY}`,
        trunkX,
        sourceHandle,
        targetHandle,
      });
    }
  }

  // B. Route upper children (above parent)
  for (let i = 0; i < upper.length; i++) {
    const c = upper[i];
    const tX = side === "left" ? c.x + c.width : c.x;
    const tY = Math.round(c.y + c.height / 2);

    if (i === 0 && !stemDrawn) {
      // First edge draws the horizontal stem from parent and curves up the trunk to target
      const r = Math.max(
        0,
        Math.min(
          borderRadius,
          Math.abs(trunkX - sourceX) / 2,
          Math.abs(sourceY - tY) / 2,
          Math.abs(tX - trunkX) / 2,
        ),
      );
      let path = `M ${sourceX} ${sourceY}`;
      if (r < 1) {
        path += ` L ${trunkX} ${sourceY} L ${trunkX} ${tY} L ${tX} ${tY}`;
      } else {
        path += ` L ${trunkX - stemDx * r} ${sourceY} Q ${trunkX} ${sourceY}, ${trunkX} ${sourceY - r}`;
        path += ` L ${trunkX} ${tY + r} Q ${trunkX} ${tY}, ${trunkX + dx * r} ${tY} L ${tX} ${tY}`;
      }
      results.push({ childId: c.id, path, trunkX, sourceHandle, targetHandle });
      stemDrawn = true;
    } else {
      // Starts from trunk at previous Y and extends upward without redrawing earlier trunk segments
      const prevY = i === 0 ? sourceY : Math.round(upper[i - 1].y + upper[i - 1].height / 2);
      const r = Math.max(
        0,
        Math.min(borderRadius, Math.abs(prevY - tY) / 2, Math.abs(tX - trunkX) / 2),
      );
      let path = `M ${trunkX} ${prevY}`;
      if (r < 1) {
        path += ` L ${trunkX} ${tY} L ${tX} ${tY}`;
      } else {
        path += ` L ${trunkX} ${tY + r} Q ${trunkX} ${tY}, ${trunkX + dx * r} ${tY} L ${tX} ${tY}`;
      }
      results.push({ childId: c.id, path, trunkX, sourceHandle, targetHandle });
    }
  }

  // C. Route lower children (below parent)
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    const tX = side === "left" ? c.x + c.width : c.x;
    const tY = Math.round(c.y + c.height / 2);

    if (i === 0 && !stemDrawn) {
      // First edge draws the horizontal stem from parent and curves down the trunk to target
      const r = Math.max(
        0,
        Math.min(
          borderRadius,
          Math.abs(trunkX - sourceX) / 2,
          Math.abs(tY - sourceY) / 2,
          Math.abs(tX - trunkX) / 2,
        ),
      );
      let path = `M ${sourceX} ${sourceY}`;
      if (r < 1) {
        path += ` L ${trunkX} ${sourceY} L ${trunkX} ${tY} L ${tX} ${tY}`;
      } else {
        path += ` L ${trunkX - stemDx * r} ${sourceY} Q ${trunkX} ${sourceY}, ${trunkX} ${sourceY + r}`;
        path += ` L ${trunkX} ${tY - r} Q ${trunkX} ${tY}, ${trunkX + dx * r} ${tY} L ${tX} ${tY}`;
      }
      results.push({ childId: c.id, path, trunkX, sourceHandle, targetHandle });
      stemDrawn = true;
    } else {
      // Starts from trunk at previous Y (or at stem tangent point if lower[0]) and extends downward
      const prevY = i === 0 ? sourceY : Math.round(lower[i - 1].y + lower[i - 1].height / 2);
      const r = Math.max(
        0,
        Math.min(borderRadius, Math.abs(tY - prevY) / 2, Math.abs(tX - trunkX) / 2),
      );
      let path = `M ${trunkX} ${prevY}`;
      if (i === 0 && upper.length > 0) {
        // Smoothly curve down from the tangent point at stem junction
        path = `M ${trunkX - stemDx * r} ${sourceY} Q ${trunkX} ${sourceY}, ${trunkX} ${sourceY + r}`;
      }
      if (r < 1) {
        path += ` L ${trunkX} ${tY} L ${tX} ${tY}`;
      } else {
        path += ` L ${trunkX} ${tY - r} Q ${trunkX} ${tY}, ${trunkX + dx * r} ${tY} L ${tX} ${tY}`;
      }
      results.push({ childId: c.id, path, trunkX, sourceHandle, targetHandle });
    }
  }

  return results;
}

export function computeRtlTreeLayout(
  rootNodeId: string,
  nodesDict: Record<string, MindMapNodeBase & { isUserCustom?: boolean; isOverridden?: boolean; userNote?: string }>,
  options: LayoutOptions = {},
): { nodes: Node[]; edges: Edge[] } {
  const horizontalSpacing = options.horizontalSpacing ?? 105;
  const verticalSpacing = options.verticalSpacing ?? 28;
  const collapsedNodeIds = options.collapsedNodeIds ?? new Set<string>();

  // Helper to safely read previous position
  function getPreviousPos(id: string): { x: number; y: number } | undefined {
    if (!options.previousPositions) return undefined;
    if (options.previousPositions instanceof Map) {
      return options.previousPositions.get(id);
    }
    return (options.previousPositions as Record<string, { x: number; y: number }>)[id];
  }

  // 1. Build adjacency hierarchy & cluster siblings
  const childrenMap = new Map<string, string[]>();
  for (const node of Object.values(nodesDict)) {
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(node.id);
      childrenMap.set(node.parentId, list);
    }
  }

  // Detect semantic clusters and sort siblings by cluster then sortOrder
  const siblingClustersMap = new Map<string, Map<string, SemanticClusterResult>>();
  for (const [pId, list] of childrenMap.entries()) {
    const clusterMap = detectSemanticClusters(list, nodesDict);
    siblingClustersMap.set(pId, clusterMap);

    list.sort((a, b) => {
      const cA = clusterMap.get(a)?.clusterIndex ?? 999;
      const cB = clusterMap.get(b)?.clusterIndex ?? 999;
      if (cA !== cB) return cA - cB;
      const nodeA = nodesDict[a];
      const nodeB = nodesDict[b];
      return (nodeA?.sortOrder ?? 0) - (nodeB?.sortOrder ?? 0);
    });
  }

  const rootData = nodesDict[rootNodeId];
  if (!rootData) {
    return { nodes: [], edges: [] };
  }

  // 2. Compute tree depths for all nodes
  const nodeDepths = new Map<string, number>();
  nodeDepths.set(rootNodeId, 0);
  const queue = [rootNodeId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currDepth = nodeDepths.get(curr) ?? 0;
    const children = childrenMap.get(curr) || [];
    for (const childId of children) {
      nodeDepths.set(childId, currDepth + 1);
      queue.push(childId);
    }
  }

  // 3. Precompute individual node dimensions based on title & depth
  const dimensionsMap = new Map<string, { width: number; height: number }>();
  for (const [id, node] of Object.entries(nodesDict)) {
    const depth = nodeDepths.get(id) ?? (id === rootNodeId ? 0 : 1);
    dimensionsMap.set(
      id,
      calculateNodeDimensions(node.title, depth, {
        hasDescription: Boolean(node.shortDescription),
        description: node.shortDescription,
        hasIndicators: Boolean(
          node.isUserCustom ||
            node.isOverridden ||
            node.userNote,
        ),
        isRoot: id === rootNodeId,
        baseNodeWidth: options.nodeWidth,
        baseNodeHeight: options.nodeHeight,
      }),
    );
  }

  const manualPositions = options.nodePositions || {};
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  // Helper to calculate total height of subtree with current collapse state
  function getSubtreeHeight(nodeId: string): number {
    const nodeDim = dimensionsMap.get(nodeId) ?? { width: 240, height: 68 };
    if (collapsedNodeIds.has(nodeId)) {
      return nodeDim.height;
    }
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      return nodeDim.height;
    }

    const cClusters = siblingClustersMap.get(nodeId);
    let total = 0;
    for (let i = 0; i < children.length; i++) {
      total += getSubtreeHeight(children[i]);
      if (i < children.length - 1) {
        const c1 = cClusters?.get(children[i])?.clusterId;
        const c2 = cClusters?.get(children[i + 1])?.clusterId;
        const extraGap = c1 !== c2 && (Boolean(c1) || Boolean(c2)) ? 16 : 0;
        total += verticalSpacing + extraGap;
      }
    }
    return Math.max(nodeDim.height, total);
  }

  // Helper to calculate FULL subtree height (ignoring collapse state) for deterministic side partitioning
  function getFullSubtreeHeight(nodeId: string): number {
    const nodeDim = dimensionsMap.get(nodeId) ?? { width: 240, height: 68 };
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      return nodeDim.height;
    }

    const cClusters = siblingClustersMap.get(nodeId);
    let total = 0;
    for (let i = 0; i < children.length; i++) {
      total += getFullSubtreeHeight(children[i]);
      if (i < children.length - 1) {
        const c1 = cClusters?.get(children[i])?.clusterId;
        const c2 = cClusters?.get(children[i + 1])?.clusterId;
        const extraGap = c1 !== c2 && (Boolean(c1) || Boolean(c2)) ? 16 : 0;
        total += verticalSpacing + extraGap;
      }
    }
    return Math.max(nodeDim.height, total);
  }

  // Helper to count total nodes in subtree
  function getSubtreeNodeCount(nodeId: string): number {
    const children = childrenMap.get(nodeId) || [];
    let count = 1;
    for (const cId of children) {
      count += getSubtreeNodeCount(cId);
    }
    return count;
  }

  // Helper to calculate max depth of subtree
  function getSubtreeMaxDepth(nodeId: string, currentDepth = 1): number {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0 || collapsedNodeIds.has(nodeId)) return currentDepth;
    let maxD = currentDepth;
    for (const c of children) {
      maxD = Math.max(maxD, getSubtreeMaxDepth(c, currentDepth + 1));
    }
    return maxD;
  }

  // Full subtree weight combining recursive height and node breadth
  function getFullSubtreeWeight(nodeId: string): number {
    return getFullSubtreeHeight(nodeId) + getSubtreeNodeCount(nodeId) * 16;
  }

  const mainBranchIds = childrenMap.get(rootNodeId) || [];

  // Partition main branches between left and right sides
  let leftBranchIds: string[] = [];
  let rightBranchIds: string[] = [];

  if (mainBranchIds.length === 1) {
    // Single child: check previous position or default to left (primary RTL direction)
    const prev = getPreviousPos(mainBranchIds[0]);
    if (prev && prev.x > 0) {
      rightBranchIds = [mainBranchIds[0]];
    } else {
      leftBranchIds = [mainBranchIds[0]];
    }
  } else if (mainBranchIds.length > 1) {
    const leftSet = new Set<string>();
    const rightSet = new Set<string>();
    const unassigned: string[] = [];

    // 1. Check if branches have an established side from previous positions
    for (const bId of mainBranchIds) {
      const prev = getPreviousPos(bId);
      if (prev) {
        if (prev.x < 0) {
          leftSet.add(bId);
        } else if (prev.x > 0) {
          rightSet.add(bId);
        } else {
          unassigned.push(bId);
        }
      } else {
        unassigned.push(bId);
      }
    }

    // 2. For unassigned branches, partition deterministically using subtree weight (height + count)
    if (unassigned.length > 0) {
      let leftAccumWeight = 0;
      for (const bId of leftSet) {
        leftAccumWeight += getFullSubtreeWeight(bId) + verticalSpacing;
      }
      let rightAccumWeight = 0;
      for (const bId of rightSet) {
        rightAccumWeight += getFullSubtreeWeight(bId) + verticalSpacing;
      }

      // Sort unassigned by FULL tree weight so collapse/expand never alters the partition
      const sortedByFullWeight = [...unassigned].sort(
        (a, b) => getFullSubtreeWeight(b) - getFullSubtreeWeight(a),
      );

      for (const bId of sortedByFullWeight) {
        const w = getFullSubtreeWeight(bId);
        if (leftAccumWeight <= rightAccumWeight) {
          leftSet.add(bId);
          leftAccumWeight += w + verticalSpacing;
        } else {
          rightSet.add(bId);
          rightAccumWeight += w + verticalSpacing;
        }
      }
    }

    // Preserve original sortOrder on each respective side
    leftBranchIds = mainBranchIds.filter((id) => leftSet.has(id));
    rightBranchIds = mainBranchIds.filter((id) => rightSet.has(id));
  }

  const rootDim = dimensionsMap.get(rootNodeId) ?? { width: 240, height: 84 };

  // Helper to check ancestry
  function isAncestor(potentialAncestorId: string, nodeId: string): boolean {
    let curr = nodesDict[nodeId]?.parentId;
    while (curr) {
      if (curr === potentialAncestorId) return true;
      curr = nodesDict[curr]?.parentId;
    }
    return false;
  }

  // Mutable working positions and sides for nodes
  const nodePositions = new Map<string, { x: number; y: number }>();
  const nodeSides = new Map<string, "left" | "right" | "root">();

  // Root node position
  const isRootCollapsed = collapsedNodeIds.has(rootNodeId);
  const rawRootManual = manualPositions[rootNodeId];
  const rootPos =
    rawRootManual && Number.isFinite(rawRootManual.x) && Number.isFinite(rawRootManual.y)
      ? { x: Math.round(rawRootManual.x), y: Math.round(rawRootManual.y) }
      : { x: 0, y: -Math.round(rootDim.height / 2) };

  nodePositions.set(rootNodeId, rootPos);
  nodeSides.set(rootNodeId, "root");

  // Helper to shift an entire subtree by (dx, dy)
  function shiftSubtree(rootId: string, dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;
    const allIds = [rootId, ...getDescendantNodeIds(rootId, nodesDict)];
    for (const id of allIds) {
      const pos = nodePositions.get(id);
      if (pos) {
        pos.x += dx;
        pos.y += dy;
      }
    }
  }

  // Helper to get actual node boxes for a subtree
  function getSubtreeBoxes(rootId: string): Array<{ id: string; x: number; y: number; width: number; height: number }> {
    const allIds = [rootId, ...getDescendantNodeIds(rootId, nodesDict)];
    const boxes: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    for (const id of allIds) {
      const pos = nodePositions.get(id);
      const dim = dimensionsMap.get(id) ?? { width: 140, height: 48 };
      if (pos) {
        boxes.push({ id, x: pos.x, y: pos.y, width: dim.width, height: dim.height });
      }
    }
    return boxes;
  }

  // Recursive layout for a subtree with adaptive lane offset and true parent vertical centering
  function layoutSubtree(
    nodeId: string,
    depth: number,
    parentX: number,
    startY: number,
    side: "left" | "right",
    laneOffset = 0,
  ): { minY: number; maxY: number } {
    const nodeDim = dimensionsMap.get(nodeId) ?? { width: 240, height: 68 };
    const children = childrenMap.get(nodeId) || [];
    const isCollapsed = collapsedNodeIds.has(nodeId);
    const visibleChildren = isCollapsed ? [] : children;

    nodeSides.set(nodeId, side);

    // Compute node X coordinate relative to parent
    let nodeX = 0;
    if (depth === 1) {
      nodeX =
        side === "left"
          ? -(nodeDim.width + horizontalSpacing + laneOffset)
          : rootDim.width + horizontalSpacing + laneOffset;
    } else {
      if (side === "left") {
        nodeX = parentX - horizontalSpacing - nodeDim.width;
      } else {
        const pId = nodesDict[nodeId]?.parentId || "";
        const parentDim = dimensionsMap.get(pId) ?? { width: 240, height: 68 };
        nodeX = parentX + parentDim.width + horizontalSpacing;
      }
    }

    if (visibleChildren.length === 0) {
      nodePositions.set(nodeId, { x: nodeX, y: startY });
      return { minY: startY, maxY: startY + nodeDim.height };
    }

    // Place children with strict top-to-bottom packing
    let currentChildY = startY;
    let minChildY = Number.POSITIVE_INFINITY;
    let maxChildY = Number.NEGATIVE_INFINITY;

    const childBounds: { id: string; minY: number; maxY: number }[] = [];
    const cClusters = siblingClustersMap.get(nodeId);

    for (let i = 0; i < visibleChildren.length; i++) {
      const childId = visibleChildren[i];
      const childRes = layoutSubtree(childId, depth + 1, nodeX, currentChildY, side, 0);
      childBounds.push({ id: childId, ...childRes });

      minChildY = Math.min(minChildY, childRes.minY);
      maxChildY = Math.max(maxChildY, childRes.maxY);

      let gap = verticalSpacing;
      if (i < visibleChildren.length - 1) {
        const c1 = cClusters?.get(visibleChildren[i])?.clusterId;
        const c2 = cClusters?.get(visibleChildren[i + 1])?.clusterId;
        if (c1 !== c2 && (Boolean(c1) || Boolean(c2))) {
          gap += 16;
        }
      }
      currentChildY = childRes.maxY + gap;
    }

    // True Geometric Parent Centering relative to children span and actual box dimensions
    const firstChild = childBounds[0];
    const lastChild = childBounds[childBounds.length - 1];
    const firstChildDim = dimensionsMap.get(visibleChildren[0]) ?? { width: 140, height: 48 };
    const lastChildDim = dimensionsMap.get(visibleChildren[visibleChildren.length - 1]) ?? { width: 140, height: 48 };

    const firstChildCenterY = firstChild.minY + firstChildDim.height / 2;
    const lastChildCenterY = lastChild.minY + lastChildDim.height / 2;
    const childrenGeometricCenterY = (firstChildCenterY + lastChildCenterY) / 2;

    const parentY = Math.round(childrenGeometricCenterY - nodeDim.height / 2);

    nodePositions.set(nodeId, { x: nodeX, y: parentY });
    return {
      minY: Math.min(parentY, minChildY),
      maxY: Math.max(parentY + nodeDim.height, maxChildY),
    };
  }

  // Skyline Profile Packing for branches on a single side
  function packBranchesOnSide(branchIds: string[], side: "left" | "right") {
    if (branchIds.length === 0) return;

    // 1. Initial adaptive lane layout for each branch
    const totalBranches = branchIds.length;
    for (let i = 0; i < branchIds.length; i++) {
      const bId = branchIds[i];
      const bHeight = getSubtreeHeight(bId);
      const bDepth = getSubtreeMaxDepth(bId);
      const lane = getBranchLane(i, totalBranches, bHeight, bDepth);
      const laneOffset = lane * Math.round(horizontalSpacing * 1.1);
      layoutSubtree(bId, 1, 0, 0, side, laneOffset);
    }

    // 2. Monotone downward sweep with true node-to-node skyline clearance
    const placedBoxes: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    const interBranchGapY = verticalSpacing + 16;
    const hClearanceMargin = 16;

    for (let i = 0; i < branchIds.length; i++) {
      const bId = branchIds[i];
      const currentBoxes = getSubtreeBoxes(bId);

      if (i === 0) {
        placedBoxes.push(...currentBoxes);
        continue;
      }

      // Compute minimal deltaY needed to clear all previously placed boxes in overlapping X corridors
      let requiredShiftY = 0;
      for (const cur of currentBoxes) {
        for (const prev of placedBoxes) {
          const xOverlap =
            cur.x < prev.x + prev.width + hClearanceMargin &&
            cur.x + cur.width + hClearanceMargin > prev.x;
          if (xOverlap) {
            const overlapY = prev.y + prev.height + interBranchGapY - cur.y;
            if (overlapY > requiredShiftY) {
              requiredShiftY = overlapY;
            }
          }
        }
      }

      // If no horizontal overlap with any previous node, ensure natural top-to-bottom reading order
      if (requiredShiftY === 0 && placedBoxes.length > 0) {
        const prevBranchBox = placedBoxes.find((p) => p.id === branchIds[i - 1]);
        if (prevBranchBox) {
          const curBranchBox = currentBoxes.find((c) => c.id === bId);
          if (curBranchBox && curBranchBox.y < prevBranchBox.y + 24) {
            requiredShiftY = prevBranchBox.y + 24 - curBranchBox.y;
          }
        }
      }

      shiftSubtree(bId, 0, requiredShiftY);
      placedBoxes.push(...getSubtreeBoxes(bId));
    }

    // 3. Visual Centering around Y = 0 (root level) or Anchor to previous position
    if (placedBoxes.length > 0) {
      const hasPrevious = branchIds.some((id) => {
        const prev = getPreviousPos(id);
        return prev !== undefined && Number.isFinite(prev.y);
      });

      if (hasPrevious) {
        const anchorBranch = branchIds.find((id) => {
          const prev = getPreviousPos(id);
          return prev !== undefined && Number.isFinite(prev.y);
        });
        if (anchorBranch) {
          const prevY = getPreviousPos(anchorBranch)!.y;
          const curY = nodePositions.get(anchorBranch)?.y ?? 0;
          const shiftY = prevY - curY;
          for (const bId of branchIds) {
            shiftSubtree(bId, 0, shiftY);
          }
        }
      } else {
        const allBoxes = branchIds.flatMap((id) => getSubtreeBoxes(id));
        const minY = Math.min(...allBoxes.map((b) => b.y));
        const maxY = Math.max(...allBoxes.map((b) => b.y + b.height));
        const sideHeight = maxY - minY;
        const targetCenterShift = Math.round(-minY - sideHeight / 2);
        for (const bId of branchIds) {
          shiftSubtree(bId, 0, targetCenterShift);
        }
      }
    }
  }

  // Pack both sides
  packBranchesOnSide(leftBranchIds, "left");
  packBranchesOnSide(rightBranchIds, "right");

  // Apply manual positions and check for mutual manual anchor conflicts
  const manualSet = new Set(Object.keys(manualPositions));
  for (const [mId, mPos] of Object.entries(manualPositions)) {
    if (Number.isFinite(mPos.x) && Number.isFinite(mPos.y)) {
      nodePositions.set(mId, { x: Math.round(mPos.x), y: Math.round(mPos.y) });
    }
  }

  // Check manual anchor conflicts
  const manualIds = Array.from(manualSet);
  for (let i = 0; i < manualIds.length; i++) {
    const idA = manualIds[i];
    const posA = nodePositions.get(idA);
    const dimA = dimensionsMap.get(idA) ?? { width: 140, height: 48 };
    if (!posA) continue;
    for (let j = i + 1; j < manualIds.length; j++) {
      const idB = manualIds[j];
      const posB = nodePositions.get(idB);
      const dimB = dimensionsMap.get(idB) ?? { width: 140, height: 48 };
      if (!posB) continue;
      const overlap =
        posA.x < posB.x + dimB.width + 12 &&
        posA.x + dimA.width + 12 > posB.x &&
        posA.y < posB.y + dimB.height + 12 &&
        posA.y + dimA.height + 12 > posB.y;
      if (overlap) {
        console.warn(
          `[MindMap Layout] Manual anchor conflict detected between "${idA}" and "${idB}". Preserving both without auto-shift.`,
        );
      }
    }
  }

  // Helper to check 2D bounding box overlap
  function boxesOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
    gapX = 16,
    gapY = 16,
  ): boolean {
    return (
      a.x < b.x + b.width + gapX &&
      a.x + a.width + gapX > b.x &&
      a.y < b.y + b.height + gapY &&
      a.y + a.height + gapY > b.y
    );
  }

  // Global 2D Conflict Resolution Pass (Bounded by MAX_RESOLVE_ITERATIONS)
  const MAX_RESOLVE_ITERATIONS = 20;

  for (let iter = 0; iter < MAX_RESOLVE_ITERATIONS; iter++) {
    let collisionFound = false;
    const allNodeIds = Array.from(nodePositions.keys());

    for (let i = 0; i < allNodeIds.length; i++) {
      const idA = allNodeIds[i];
      const posA = nodePositions.get(idA)!;
      const dimA = dimensionsMap.get(idA) ?? { width: 140, height: 48 };
      const boxA = { id: idA, x: posA.x, y: posA.y, width: dimA.width, height: dimA.height };

      for (let j = i + 1; j < allNodeIds.length; j++) {
        const idB = allNodeIds[j];
        if (manualSet.has(idA) && manualSet.has(idB)) continue;
        if (isAncestor(idA, idB) || isAncestor(idB, idA)) continue;

        const posB = nodePositions.get(idB)!;
        const dimB = dimensionsMap.get(idB) ?? { width: 140, height: 48 };
        const boxB = { id: idB, x: posB.x, y: posB.y, width: dimB.width, height: dimB.height };

        if (boxesOverlap(boxA, boxB, 16, 16)) {
          collisionFound = true;
          let targetId = idB;
          let obstacleBox = boxA;
          let mobileBox = boxB;

          if (manualSet.has(idB)) {
            targetId = idA;
            obstacleBox = boxB;
            mobileBox = boxA;
          } else if (!manualSet.has(idA) && !manualSet.has(idB)) {
            const depthA = nodeDepths.get(idA) ?? 1;
            const depthB = nodeDepths.get(idB) ?? 1;
            if (depthB > depthA || (depthB === depthA && posB.y > posA.y)) {
              targetId = idB;
              obstacleBox = boxA;
              mobileBox = boxB;
            } else {
              targetId = idA;
              obstacleBox = boxB;
              mobileBox = boxA;
            }
          }

          // Find the independent branch or subtree root of targetId
          let targetRootId = targetId;
          let p = nodesDict[targetId]?.parentId;
          while (p && p !== rootNodeId) {
            targetRootId = p;
            p = nodesDict[p]?.parentId;
          }

          // Compute minimal vertical shift to clear obstacle
          const deltaY = (obstacleBox.y + obstacleBox.height + 20) - mobileBox.y;
          if (deltaY > 0) {
            shiftSubtree(targetRootId, 0, deltaY);
          } else {
            const sideDir = nodeSides.get(targetId) === "left" ? -1 : 1;
            const deltaX = ((obstacleBox.x + obstacleBox.width + 20) - mobileBox.x) * sideDir;
            shiftSubtree(targetRootId, Math.max(24, Math.abs(deltaX)) * sideDir, 0);
          }
          break;
        }
      }
      if (collisionFound) break;
    }

    if (!collisionFound) break;
  }

  // Populate flowNodes from resolved nodePositions
  for (const [nId, pos] of nodePositions.entries()) {
    const nodeData = nodesDict[nId];
    const nodeDim = dimensionsMap.get(nId) ?? { width: 140, height: 48 };
    if (!nodeData) continue;

    const children = childrenMap.get(nId) || [];
    const isCollapsed = collapsedNodeIds.has(nId);
    const side = nodeSides.get(nId) || (nId === rootNodeId ? "root" : "left");
    const clusterInfo = nodeData.parentId
      ? siblingClustersMap.get(nodeData.parentId)?.get(nId)
      : undefined;

    flowNodes.push({
      id: nId,
      type: "mindMapNode",
      position: { x: pos.x, y: pos.y },
      style: {
        width: nodeDim.width,
        height: nodeDim.height,
      },
      data: {
        ...nodeData,
        hasChildren: children.length > 0,
        childrenCount: children.length,
        isCollapsed,
        depth: nodeDepths.get(nId) ?? 0,
        side,
        calculatedWidth: nodeDim.width,
        calculatedHeight: nodeDim.height,
        clusterId: clusterInfo?.clusterId,
        clusterName: clusterInfo?.clusterName,
        clusterColor: clusterInfo?.color,
      },
    });
  }

  // Map node positions for geometric edge routing
  const nodePositionMap = new Map<string, { x: number; y: number }>();
  for (const fn of flowNodes) {
    nodePositionMap.set(fn.id, fn.position);
  }

  // Obstacle boxes for collision-free routing
  const allGraphBoxes = flowNodes.map((fn) => ({
    id: fn.id,
    x: fn.position.x,
    y: fn.position.y,
    width: (fn.style?.width as number) || dimensionsMap.get(fn.id)?.width || 140,
    height: (fn.style?.height as number) || dimensionsMap.get(fn.id)?.height || 48,
  }));

  // Connect Root to visible main branches with shared branch routing
  if (!isRootCollapsed) {
    const rootBox = { id: rootNodeId, x: rootPos.x, y: rootPos.y, width: rootDim.width, height: rootDim.height };

    // Left side root branches
    const leftChildren: SharedBranchChild[] = [];
    for (const bId of leftBranchIds) {
      const childPos = nodePositionMap.get(bId);
      if (!childPos) continue;
      const childDim = dimensionsMap.get(bId) ?? { width: 140, height: 48 };
      leftChildren.push({
        id: bId,
        x: childPos.x,
        y: childPos.y,
        width: childDim.width,
        height: childDim.height,
        clusterInfo: siblingClustersMap.get(rootNodeId)?.get(bId),
        isManual: manualSet.has(rootNodeId) || manualSet.has(bId),
      });
    }

    const leftRouted = routeSharedBranchGroup(rootBox, leftChildren, "left", allGraphBoxes, 12);
    for (const r of leftRouted) {
      const clusterInfo = siblingClustersMap.get(rootNodeId)?.get(r.childId);
      const edgeStroke = clusterInfo ? clusterInfo.color : "#008080";
      const edgeWidth = clusterInfo ? 2.5 : 2;

      flowEdges.push({
        id: `e-${rootNodeId}-${r.childId}`,
        source: rootNodeId,
        target: r.childId,
        sourceHandle: r.sourceHandle,
        targetHandle: r.targetHandle,
        type: "mindMapTree",
        animated: false,
        deletable: false,
        selectable: false,
        data: {
          path: r.path,
          trunkX: r.trunkX,
          side: "left",
          clusterId: clusterInfo?.clusterId,
          clusterColor: clusterInfo?.color,
        },
        style: {
          stroke: edgeStroke,
          strokeWidth: edgeWidth,
        },
      });
    }

    // Right side root branches
    const rightChildren: SharedBranchChild[] = [];
    for (const bId of rightBranchIds) {
      const childPos = nodePositionMap.get(bId);
      if (!childPos) continue;
      const childDim = dimensionsMap.get(bId) ?? { width: 140, height: 48 };
      rightChildren.push({
        id: bId,
        x: childPos.x,
        y: childPos.y,
        width: childDim.width,
        height: childDim.height,
        clusterInfo: siblingClustersMap.get(rootNodeId)?.get(bId),
        isManual: manualSet.has(rootNodeId) || manualSet.has(bId),
      });
    }

    const rightRouted = routeSharedBranchGroup(rootBox, rightChildren, "right", allGraphBoxes, 12);
    for (const r of rightRouted) {
      const clusterInfo = siblingClustersMap.get(rootNodeId)?.get(r.childId);
      const edgeStroke = clusterInfo ? clusterInfo.color : "#008080";
      const edgeWidth = clusterInfo ? 2.5 : 2;

      flowEdges.push({
        id: `e-${rootNodeId}-${r.childId}`,
        source: rootNodeId,
        target: r.childId,
        sourceHandle: r.sourceHandle,
        targetHandle: r.targetHandle,
        type: "mindMapTree",
        animated: false,
        deletable: false,
        selectable: false,
        data: {
          path: r.path,
          trunkX: r.trunkX,
          side: "right",
          clusterId: clusterInfo?.clusterId,
          clusterColor: clusterInfo?.color,
        },
        style: {
          stroke: edgeStroke,
          strokeWidth: edgeWidth,
        },
      });
    }
  }

  // Connect non-root parent nodes to their visible children with shared branch routing
  for (const node of flowNodes) {
    if (node.id === rootNodeId) continue;
    const isCollapsed = collapsedNodeIds.has(node.id);
    if (isCollapsed) continue;

    const children = childrenMap.get(node.id) || [];
    if (children.length === 0) continue;

    const nodeDataObj = node.data as Record<string, unknown> | undefined;
    const depth = typeof nodeDataObj?.depth === "number" ? nodeDataObj.depth : 1;
    const defaultSide = (nodeDataObj?.side as "left" | "right") || "left";
    const parentPos = nodePositionMap.get(node.id) ?? node.position;
    const parentDim = dimensionsMap.get(node.id) ?? { width: 240, height: 68 };
    const parentBox = { id: node.id, x: parentPos.x, y: parentPos.y, width: parentDim.width, height: parentDim.height };

    // Group children by direction relative to parent (handles manual drag cases cleanly)
    const leftChildren: SharedBranchChild[] = [];
    const rightChildren: SharedBranchChild[] = [];

    for (const childId of children) {
      const childPos = nodePositionMap.get(childId);
      if (!childPos) continue; // Child is hidden/collapsed

      const childDim = dimensionsMap.get(childId) ?? { width: 240, height: 68 };
      const clusterInfo = siblingClustersMap.get(node.id)?.get(childId);
      const isManual = manualSet.has(node.id) || manualSet.has(childId);
      const childSide = isManual
        ? childPos.x < parentPos.x ? "left" : "right"
        : defaultSide;

      const childObj: SharedBranchChild = {
        id: childId,
        x: childPos.x,
        y: childPos.y,
        width: childDim.width,
        height: childDim.height,
        clusterInfo,
        isManual,
      };

      if (childSide === "left") {
        leftChildren.push(childObj);
      } else {
        rightChildren.push(childObj);
      }
    }

    const routeAndPushEdges = (group: SharedBranchChild[], s: "left" | "right") => {
      const routedEdges = routeSharedBranchGroup(parentBox, group, s, allGraphBoxes, 12);
      for (const r of routedEdges) {
        const clusterInfo = siblingClustersMap.get(node.id)?.get(r.childId);
        const defaultStroke = depth === 0 ? "#008080" : "#94a3b8";
        const edgeStroke = clusterInfo ? clusterInfo.color : defaultStroke;
        const edgeStrokeWidth = clusterInfo ? 2 : (depth === 0 ? 2 : 1.5);

        flowEdges.push({
          id: `e-${node.id}-${r.childId}`,
          source: node.id,
          target: r.childId,
          sourceHandle: r.sourceHandle,
          targetHandle: r.targetHandle,
          type: "mindMapTree",
          animated: false,
          deletable: false,
          selectable: false,
          data: {
            path: r.path,
            trunkX: r.trunkX,
            side: s,
            clusterId: clusterInfo?.clusterId,
            clusterColor: clusterInfo?.color,
          },
          style: {
            stroke: edgeStroke,
            strokeWidth: edgeStrokeWidth,
          },
        });
      }
    };

    if (leftChildren.length > 0) routeAndPushEdges(leftChildren, "left");
    if (rightChildren.length > 0) routeAndPushEdges(rightChildren, "right");
  }

  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * Calculates optimal source and target handles based on real relative geometric positions.
 * Ensures clean horizontal routing without diagonal crossing or unnecessary bends.
 */
export function getOptimalHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
  sourceDim?: { width: number; height: number },
  targetDim?: { width: number; height: number },
): { sourceHandle: string; targetHandle: string } {
  const sW = sourceDim?.width ?? 160;
  const sH = sourceDim?.height ?? 50;
  const tW = targetDim?.width ?? 160;
  const tH = targetDim?.height ?? 50;

  const sCenterX = sourcePos.x + sW / 2;
  const sCenterY = sourcePos.y + sH / 2;
  const tCenterX = targetPos.x + tW / 2;
  const tCenterY = targetPos.y + tH / 2;

  const dx = tCenterX - sCenterX;
  const dy = tCenterY - sCenterY;

  // Primarily horizontal
  if (Math.abs(dx) >= Math.abs(dy) * 0.75) {
    if (dx < 0) {
      return { sourceHandle: "left", targetHandle: "right" };
    } else {
      return { sourceHandle: "right", targetHandle: "left" };
    }
  } else {
    // Primarily vertical
    if (dy < 0) {
      return { sourceHandle: "top", targetHandle: "bottom" };
    } else {
      return { sourceHandle: "bottom", targetHandle: "top" };
    }
  }
}

/**
 * Returns all descendant IDs for a given node using BFS traversal.
 */
export function getDescendantNodeIds(
  rootId: string,
  nodes: Record<string, { parentId?: string | null }>,
): string[] {
  const result: string[] = [];
  const queue = [rootId];

  const childrenMap = new Map<string, string[]>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(id);
      childrenMap.set(node.parentId, list);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenMap.get(current) || [];
    for (const childId of children) {
      result.push(childId);
      queue.push(childId);
    }
  }

  return result;
}

