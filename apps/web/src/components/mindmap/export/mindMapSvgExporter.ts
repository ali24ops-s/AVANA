/**
 * Standalone High-Fidelity Vector SVG Exporter for AVANA Mind Map.
 *
 * Guarantees:
 * - Uses computeRtlTreeLayout directly without modifying existing layout engine.
 * - Always exports the complete tree (all branches expanded, zero permanent clipping).
 * - Preserves user custom edges alongside tree hierarchy edges.
 * - Embeds Estedad font WOFF2 in Base64 for pixel-perfect offline rendering.
 * - Scalable vector elements (<svg>, <rect>, <path>, <text>) with crisp typography.
 */

import type { MindMapPayload } from "@avana/contracts";
import { computeEffectiveMindMap } from "@avana/domain";
import { computeRtlTreeLayout, getOptimalHandles } from "../treeLayout.js";
import { getSmoothStepPath, Position } from "@xyflow/react";
import { escapeXml } from "./mindMapExportUtils.js";
import { ESTEDAD_REGULAR_WOFF2_BASE64, ESTEDAD_BOLD_WOFF2_BASE64 } from "./estedadFontBase64.js";

function toFlowPosition(posStr: string): Position {
  switch (posStr) {
    case "left":
      return Position.Left;
    case "right":
      return Position.Right;
    case "top":
      return Position.Top;
    case "bottom":
      return Position.Bottom;
    default:
      return Position.Left;
  }
}

function getHandleCoordinates(
  pos: { x: number; y: number },
  dim: { width: number; height: number },
  handle: string,
): { x: number; y: number } {
  switch (handle) {
    case "left":
      return { x: pos.x, y: pos.y + dim.height / 2 };
    case "right":
      return { x: pos.x + dim.width, y: pos.y + dim.height / 2 };
    case "top":
      return { x: pos.x + dim.width / 2, y: pos.y };
    case "bottom":
      return { x: pos.x + dim.width / 2, y: pos.y + dim.height };
    default:
      return { x: pos.x, y: pos.y + dim.height / 2 };
  }
}

export function exportMindMapToSvg(
  payload: MindMapPayload,
  title = "مایندمپ AVANA",
): string {
  // 1. Compute effective mind map (merges AI base, overrides, custom nodes, user notes, and nodePositions)
  const effective = computeEffectiveMindMap(payload);

  // 2. Compute full tree layout with empty collapsed set to include ALL branches in export
  const fullLayout = computeRtlTreeLayout(effective.rootNodeId, effective.nodes, {
    collapsedNodeIds: new Set<string>(),
    nodePositions: payload.userModifications?.nodePositions,
  });

  const nodePosMap = new Map<string, { x: number; y: number }>();
  const nodeDimMap = new Map<string, { width: number; height: number }>();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of fullLayout.nodes) {
    const w = (node.style?.width as number) || 180;
    const h = (node.style?.height as number) || 56;
    nodePosMap.set(node.id, node.position);
    nodeDimMap.set(node.id, { width: w, height: h });

    if (node.position.x < minX) minX = node.position.x;
    if (node.position.y < minY) minY = node.position.y;
    if (node.position.x + w > maxX) maxX = node.position.x + w;
    if (node.position.y + h > maxY) maxY = node.position.y + h;
  }

  // Handle empty or fallback bounds
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 600;
  }

  const PADDING = 60;
  const boxMinX = Math.round(minX - PADDING);
  const boxMinY = Math.round(minY - PADDING);
  const boxWidth = Math.max(400, Math.round(maxX - minX + PADDING * 2));
  const boxHeight = Math.max(300, Math.round(maxY - minY + PADDING * 2));

  // 3. Tree hierarchy edges
  const treeEdgesSvg = fullLayout.edges
    .map((edge) => {
      const pathData = (edge.data as any)?.path as string | undefined;
      if (!pathData) return "";
      const strokeColor = edge.style?.stroke || "#008080";
      const strokeW = edge.style?.strokeWidth || 2;
      return `<path d="${escapeXml(pathData)}" stroke="${strokeColor}" stroke-width="${strokeW}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("\n    ");

  // 4. Custom user connections
  const customEdgesList = payload.userModifications?.customEdges || [];
  const customEdgesSvg = customEdgesList
    .map((ce) => {
      const sPos = nodePosMap.get(ce.source);
      const tPos = nodePosMap.get(ce.target);
      if (!sPos || !tPos) return "";

      const sDim = nodeDimMap.get(ce.source) ?? { width: 160, height: 50 };
      const tDim = nodeDimMap.get(ce.target) ?? { width: 160, height: 50 };

      const optimal = getOptimalHandles(sPos, tPos, sDim, tDim);
      const sHandle = ce.sourceHandle || optimal.sourceHandle;
      const tHandle = ce.targetHandle || optimal.targetHandle;

      const sCoord = getHandleCoordinates(sPos, sDim, sHandle);
      const tCoord = getHandleCoordinates(tPos, tDim, tHandle);

      const [edgePath] = getSmoothStepPath({
        sourceX: sCoord.x,
        sourceY: sCoord.y,
        sourcePosition: toFlowPosition(sHandle),
        targetX: tCoord.x,
        targetY: tCoord.y,
        targetPosition: toFlowPosition(tHandle),
        borderRadius: 16,
        offset: 24,
      });

      if (!edgePath) return "";
      return `<path d="${escapeXml(edgePath)}" stroke="#0d9488" stroke-width="2" stroke-dasharray="6,4" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .filter(Boolean)
    .join("\n    ");

  // 5. Node elements
  const nodesSvg = fullLayout.nodes
    .map((node) => {
      const data = node.data as any;
      const depth = typeof data?.depth === "number" ? data.depth : 0;
      const isRoot = depth === 0;
      const w = (node.style?.width as number) || 180;
      const h = (node.style?.height as number) || 56;
      const x = node.position.x;
      const y = node.position.y;

      let fill = "#ffffff";
      let stroke = "#cbd5e1";
      let strokeWidth = 1.2;
      let rx = 12;
      let titleFill = "#2c3b42";
      let titleWeight = "600";
      let titleSize = 12.5;

      if (isRoot) {
        fill = "#f0fdfa";
        stroke = "#008080";
        strokeWidth = 2.5;
        rx = 16;
        titleFill = "#006666";
        titleWeight = "800";
        titleSize = 16;
      } else if (depth === 1) {
        stroke = "#008080";
        strokeWidth = 1.8;
        rx = 14;
        titleFill = "#1a2226";
        titleWeight = "700";
        titleSize = 14;
      } else if (depth === 2) {
        stroke = "#5ba0c4";
        strokeWidth = 1.5;
        rx = 12;
        titleFill = "#2c3b42";
        titleWeight = "600";
        titleSize = 13;
      }

      if (data?.isUserCustom) {
        stroke = "#008080";
      }

      const hasDesc = Boolean(!isRoot && data?.shortDescription);
      const titleY = hasDesc ? y + 24 : y + h / 2 + 1;
      const cx = x + w / 2;

      return `
    <!-- Node: ${escapeXml(data?.title || node.id)} -->
    <g class="mindmap-node" data-id="${escapeXml(node.id)}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" filter="url(#nodeShadow)" />
      <text x="${cx}" y="${titleY}" text-anchor="middle" dominant-baseline="central" font-family="'Estedad', system-ui, -apple-system, sans-serif" font-weight="${titleWeight}" font-size="${titleSize}" fill="${titleFill}" direction="rtl">${escapeXml(data?.title || "")}</text>
      ${
        hasDesc
          ? `<text x="${cx}" y="${y + 42}" text-anchor="middle" dominant-baseline="central" font-family="'Estedad', system-ui, -apple-system, sans-serif" font-weight="400" font-size="11" fill="#64748b" direction="rtl">${escapeXml(data.shortDescription)}</text>`
          : ""
      }
    </g>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${boxMinX} ${boxMinY} ${boxWidth} ${boxHeight}" width="${boxWidth}" height="${boxHeight}" direction="rtl" style="background-color: #f9fafb; font-family: 'Estedad', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif;">
  <title>${escapeXml(title)}</title>
  <defs>
    <style type="text/css">
      @font-face {
        font-family: 'Estedad';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('data:font/woff2;charset=utf-8;base64,${ESTEDAD_REGULAR_WOFF2_BASE64}') format('woff2');
      }
      @font-face {
        font-family: 'Estedad';
        font-style: normal;
        font-weight: 700 800;
        font-display: swap;
        src: url('data:font/woff2;charset=utf-8;base64,${ESTEDAD_BOLD_WOFF2_BASE64}') format('woff2');
      }
      text {
        user-select: none;
      }
    </style>
    <filter id="nodeShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.06" />
    </filter>
  </defs>

  <!-- Background Grid Texture (Subtle) -->
  <g class="mindmap-background" opacity="0.3">
    <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="0.5" />
    </pattern>
    <rect x="${boxMinX}" y="${boxMinY}" width="${boxWidth}" height="${boxHeight}" fill="url(#smallGrid)" />
  </g>

  <!-- Hierarchy Structural Edges -->
  <g class="mindmap-tree-edges">
    ${treeEdgesSvg}
  </g>

  <!-- Custom User Edges -->
  <g class="mindmap-custom-edges">
    ${customEdgesSvg}
  </g>

  <!-- Nodes Layer -->
  <g class="mindmap-nodes">
    ${nodesSvg}
  </g>
</svg>`;
}
