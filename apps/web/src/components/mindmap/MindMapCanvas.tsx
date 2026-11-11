/**
 * Interactive AI Mind Map Canvas.
 *
 * Implements:
 * - Full interactive canvas with Zoom, Pan, FitView, Reset View, and Fullscreen.
 * - RTL Hierarchical Tree Layout with smooth bezier curves.
 * - Branch Collapse/Expand and Search highlighting.
 * - Adding, editing, and deleting nodes with Undo/Redo.
 * - Integration with MindMapDetailDrawer for deep notes and AI expansion.
 */

import React, { Component, useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  ConnectionMode,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type Edge,
  type EdgeProps,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Undo2,
  Redo2,
  Sparkles,
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  FolderTree,
  History,
  X,
  Trash2,
  Link2Off,
  Download,
  FileCode,
  Globe,
} from "lucide-react";
import { Button, Card, Badge } from "@avana/ui";
import type { MindMapNodeBase, MindMapCustomEdge } from "@avana/contracts";
import { toPersianDigits } from "@avana/domain";
import {
  computeRtlTreeLayout,
  getDescendantNodeIds,
  getOptimalHandles,
  createOrthogonalPath,
} from "./treeLayout.js";
import { MindMapCustomNode } from "./MindMapCustomNode.js";
import { MindMapDetailDrawer } from "./MindMapDetailDrawer.js";
import type { useMindMap } from "../../hooks/useMindMap.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { exportMindMapToSvg } from "./export/mindMapSvgExporter.js";
import { exportMindMapToHtml } from "./export/mindMapHtmlExporter.js";
import { downloadBlob, sanitizeFilename } from "./export/mindMapExportUtils.js";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createMindMapApi } from "../../lib/api/mind-map.js";

interface MindMapErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface MindMapErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class MindMapErrorBoundary extends Component<
  MindMapErrorBoundaryProps,
  MindMapErrorBoundaryState
> {
  constructor(props: MindMapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): MindMapErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("MindMap Canvas caught runtime error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[400px] flex items-center justify-center p-6 bg-[var(--color-surface)]">
          <div className="max-w-md w-full p-6 rounded-2xl border border-[var(--color-border)] shadow-lg bg-[var(--color-surface)] text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <FolderTree className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              خطا در بارگذاری یا نمایش مایندمپ
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              مشکلی در محاسبه مختصات یا رندر گرافیکی رخ داده است. با زدن دکمه زیر نمایش به حالت اولیه بازمی‌گردد.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="mt-2 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 ml-1.5" />
              بازیابی نمایش مایندمپ
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MindMapTreeEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  if (
    !Number.isFinite(sourceX) ||
    !Number.isFinite(sourceY) ||
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetY)
  ) {
    return null;
  }

  const customPath = (data as any)?.path as string | undefined;
  const trunkX = (data as any)?.trunkX as number | undefined;
  const edgePath = customPath || createOrthogonalPath(sourceX, sourceY, targetX, targetY, trunkX, 12);
  if (!edgePath) return null;

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
      }}
    />
  );
}

export function MindMapCustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  if (
    !Number.isFinite(sourceX) ||
    !Number.isFinite(sourceY) ||
    !Number.isFinite(targetX) ||
    !Number.isFinite(targetY)
  ) {
    return null;
  }

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
    offset: 24,
  });

  const onDelete = data?.onDelete as ((id: string) => void) | undefined;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? "#0f766e" : "#0d9488",
          strokeWidth: selected ? 2.5 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan z-20"
        >
          {selected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(id);
              }}
              className="p-1 rounded-full bg-rose-500 hover:bg-rose-600 text-white shadow-md transition-all hover:scale-110 flex items-center justify-center cursor-pointer"
              title="حذف اتصال سفارشی"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = {
  mindMapNode: MindMapCustomNode,
};

const edgeTypes = {
  mindMapTree: MindMapTreeEdgeComponent,
  smoothstep: MindMapTreeEdgeComponent,
  customConnection: MindMapCustomEdgeComponent,
};

interface MindMapCanvasInnerProps {
  mindMapHook: ReturnType<typeof useMindMap>;
  chapterTitle?: string;
}

function MindMapCanvasInner({ mindMapHook, chapterTitle }: MindMapCanvasInnerProps) {
  const {
    payload,
    effectiveTree,
    isGenerating,
    isSaving,
    saveStatus,
    isDirty,
    retrySave,
    isExpanding,
    isResetting,
    generateMindMap,
    expandNode,
    resetToAiBase,
    applyModification,
    undo,
    redo,
    canUndo,
    canRedo,
    versions,
    currentVersion,
    restoreVersion,
    isRestoring,
    isLoadingVersions,
    selectedNodeId,
    setSelectedNodeId,
    searchTerm,
    setSearchTerm,
  } = mindMapHook;

  const { fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);
  const [viewportChangeCount, setViewportChangeCount] = useState(0);

  // User interaction & dynamic container sizing refs
  const hasInitialFitRef = useRef(false);
  const userInteractedRef = useRef(false);
  const prevDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set of collapsed node IDs
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  // Currently selected custom edge (for deletion and highlight)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const selectedEdgeIdRef = useRef<string | null>(null);
  selectedEdgeIdRef.current = selectedEdgeId;

  // Edit / Add modal state
  const [activeModal, setActiveModal] = useState<{
    type: "add" | "edit";
    targetNodeId: string;
    initialTitle?: string;
    initialDescription?: string;
  } | null>(null);
  const [modalTitleInput, setModalTitleInput] = useState("");
  const [modalDescInput, setModalDescInput] = useState("");

  // Manual Box Dragging with 1.5s hold gesture & Shift group drag
  const [isPanOnDragEnabled, setIsPanOnDragEnabled] = useState(true);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [liveDragPositions, setLiveDragPositions] = useState<Record<string, { x: number; y: number }> | null>(null);

  // Auth & role check: strictly platform_admin
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === "platform_admin" || (user as any)?.globalRole === "platform_admin";

  // Export states
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as unknown as HTMLElement)) {
        setShowExportMenu(false);
      }
    }
    if (showExportMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showExportMenu]);

  const handleExport = useCallback(async (format: "svg" | "html") => {
    if (isExporting || !payload) return;
    setShowExportMenu(false);
    setIsExporting(true);

    try {
      const targetModuleId = mindMapHook.mindMapDto?.moduleId;
      const targetCourseId = mindMapHook.mindMapDto?.courseId;
      if (targetModuleId) {
        const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
        const mindMapApi = createMindMapApi(apiClient);
        await mindMapApi.exportMindMap(targetModuleId, format, targetCourseId);
      }

      await new Promise((resolve) => setTimeout(resolve, 40));

      const title = effectiveTree?.nodes[effectiveTree.rootNodeId]?.title || chapterTitle || "مایندمپ AVANA";

      if (format === "svg") {
        const svgContent = exportMindMapToSvg(payload, title);
        const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
        const filename = sanitizeFilename(title, "mindmap.svg");
        downloadBlob(blob, filename);
      } else {
        const htmlContent = exportMindMapToHtml(payload, collapsedNodeIds, title, chapterTitle);
        const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
        const filename = sanitizeFilename(title, "mindmap.html");
        downloadBlob(blob, filename);
      }
    } catch (err: unknown) {
      console.error("[MindMap Export Error]:", err);
      const msg = err instanceof Error ? err.message : "خطا در آماده‌سازی خروجی مایندمپ رخ داد.";
      alert(`خطا در دریافت خروجی: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, payload, mindMapHook.mindMapDto, effectiveTree, chapterTitle, collapsedNodeIds]);

  const nodePosMapRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const pendingHoldRef = useRef<{
    nodeId: string;
    isShift: boolean;
    startScreenX: number;
    startScreenY: number;
    timerId: ReturnType<typeof setTimeout>;
  } | null>(null);

  const activeDragSessionRef = useRef<{
    nodeId: string;
    isShift: boolean;
    startScreenX: number;
    startScreenY: number;
    initialZoom: number;
    initialPositions: Map<string, { x: number; y: number }>;
    targetNodeIds: string[];
    currentPositions: Record<string, { x: number; y: number }>;
  } | null>(null);

  const wasDraggingRef = useRef(false);
  const committedLivePositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);

  // Clear committedLivePositionsRef once the query cache payload reflects all committed positions
  useEffect(() => {
    if (!committedLivePositionsRef.current || !payload?.userModifications?.nodePositions) return;
    const committed = committedLivePositionsRef.current;
    const current = payload.userModifications.nodePositions;
    const allSynced = Object.keys(committed).every(
      (id) => current[id] && current[id].x === committed[id].x && current[id].y === committed[id].y,
    );
    if (allSynced) {
      committedLivePositionsRef.current = null;
    }
  }, [payload?.userModifications?.nodePositions]);

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (wasDraggingRef.current || activeDragSessionRef.current) return;
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId],
  );

  const handleCancelDrag = useCallback(() => {
    if (pendingHoldRef.current) {
      clearTimeout(pendingHoldRef.current.timerId);
      pendingHoldRef.current = null;
    }
    if (activeDragSessionRef.current) {
      activeDragSessionRef.current = null;
      setDraggingNodeId(null);
      setLiveDragPositions(null);
      setIsPanOnDragEnabled(true);
    }
  }, []);

  // Sync fullscreen state with native browser events (e.g. Escape key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const handleDeleteCustomEdgeRef = useRef<(id: string) => void>(() => {});

  // Keyboard navigation & Shortcuts: Arrow keys for panning, Delete/Backspace for selected custom edge, Escape for cancel drag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key cancels any ongoing drag or pending hold gesture
      if (e.key === "Escape") {
        if (activeDragSessionRef.current || pendingHoldRef.current) {
          e.preventDefault();
          handleCancelDrag();
          return;
        }
      }

      // Do not capture if typing in input, textarea, contenteditable, dialog, or drawer
      const target = e.target as Element | null;
      if (
        target &&
        typeof target.closest === "function" &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as HTMLElement).isContentEditable ||
          target.closest("input, textarea, [contenteditable='true']") ||
          target.closest("[role='dialog']"))
      ) {
        return;
      }

      // Do not capture if an edit/add modal is currently open
      if (activeModal) return;

      // Handle custom edge deletion with Delete or Backspace
      const currentSelectedEdge = selectedEdgeIdRef.current;
      if ((e.key === "Delete" || e.key === "Backspace") && currentSelectedEdge) {
        e.preventDefault();
        handleDeleteCustomEdgeRef.current(currentSelectedEdge);
        return;
      }

      const PAN_STEP = 50;
      let dx = 0;
      let dy = 0;

      if (e.key === "ArrowUp") {
        dy = -PAN_STEP; // Canvas content translates up
      } else if (e.key === "ArrowDown") {
        dy = PAN_STEP; // Canvas content translates down
      } else if (e.key === "ArrowLeft") {
        dx = -PAN_STEP; // Canvas content translates left
      } else if (e.key === "ArrowRight") {
        dx = PAN_STEP; // Canvas content translates right
      } else {
        return;
      }

      e.preventDefault();
      userInteractedRef.current = true;
      const vp = getViewport();
      setViewport(
        {
          x: vp.x + dx,
          y: vp.y + dy,
          zoom: vp.zoom,
        },
        { duration: 80 },
      );
      setViewportChangeCount((c) => c + 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [getViewport, setViewport, activeModal, handleCancelDrag]);

  // Manual Box Dragging gesture logic
  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      // Only capture primary button (button 0) for mouse or touch
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (activeModal) return;

      if (pendingHoldRef.current) {
        clearTimeout(pendingHoldRef.current.timerId);
        pendingHoldRef.current = null;
      }

      const vp = getViewport();
      if (
        !vp ||
        !Number.isFinite(vp.zoom) ||
        vp.zoom <= 0 ||
        !Number.isFinite(vp.x) ||
        !Number.isFinite(vp.y)
      ) {
        // Viewport not ready or invalid zoom: abort gesture without fallback
        return;
      }

      const startScreenX = e.clientX;
      const startScreenY = e.clientY;
      if (!Number.isFinite(startScreenX) || !Number.isFinite(startScreenY)) return;
      const isShift = e.shiftKey;

      const timerId = setTimeout(() => {
        // 1.5s threshold reached!
        const currentVp = getViewport();
        const validZoom =
          currentVp && Number.isFinite(currentVp.zoom) && currentVp.zoom > 0
            ? currentVp.zoom
            : vp.zoom;
        if (!Number.isFinite(validZoom) || validZoom <= 0) {
          pendingHoldRef.current = null;
          return;
        }

        let targetNodeIds = [nodeId];
        if (isShift || nodeId === effectiveTree?.rootNodeId) {
          // Recursively include all descendants, even if currently collapsed/hidden
          const descendants = getDescendantNodeIds(nodeId, effectiveTree?.nodes || {});
          targetNodeIds = [nodeId, ...descendants];
        }

        // Compute baseline full layout if any descendant is not currently visible in nodePosMapRef
        let fullLayoutPositions: Map<string, { x: number; y: number }> | null = null;
        const missingFromVisible = targetNodeIds.some(
          (id) => !nodePosMapRef.current.has(id) && !payload?.userModifications?.nodePositions?.[id],
        );
        if (missingFromVisible && effectiveTree) {
          const fullLayout = computeRtlTreeLayout(effectiveTree.rootNodeId, effectiveTree.nodes, {
            nodePositions: payload?.userModifications?.nodePositions,
          });
          fullLayoutPositions = new Map(fullLayout.nodes.map((n) => [n.id, n.position]));
        }

        const initialPositions = new Map<string, { x: number; y: number }>();
        const initialCurrentPositions: Record<string, { x: number; y: number }> = {};
        let anyInvalid = false;

        for (const id of targetNodeIds) {
          const existingPos =
            nodePosMapRef.current.get(id) ||
            payload?.userModifications?.nodePositions?.[id] ||
            fullLayoutPositions?.get(id);

          if (!existingPos || !Number.isFinite(existingPos.x) || !Number.isFinite(existingPos.y)) {
            anyInvalid = true;
            break;
          }

          initialPositions.set(id, { x: existingPos.x, y: existingPos.y });
          initialCurrentPositions[id] = { x: existingPos.x, y: existingPos.y };
        }

        if (anyInvalid) {
          pendingHoldRef.current = null;
          return;
        }

        setIsPanOnDragEnabled(false);

        activeDragSessionRef.current = {
          nodeId,
          isShift,
          startScreenX,
          startScreenY,
          initialZoom: validZoom,
          initialPositions,
          targetNodeIds,
          currentPositions: initialCurrentPositions,
        };

        userInteractedRef.current = true;
        setDraggingNodeId(nodeId);
        setLiveDragPositions(initialCurrentPositions);
        pendingHoldRef.current = null;
      }, 1500);

      pendingHoldRef.current = {
        nodeId,
        isShift,
        startScreenX,
        startScreenY,
        timerId,
      };
    },
    [activeModal, effectiveTree, payload, getViewport],
  );

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      // Check pending hold gesture (< 1.5s)
      if (pendingHoldRef.current) {
        const dx = e.clientX - pendingHoldRef.current.startScreenX;
        const dy = e.clientY - pendingHoldRef.current.startScreenY;
        // Movement > 5px cancels hold, converting interaction to click/selection
        if (Math.hypot(dx, dy) > 5) {
          clearTimeout(pendingHoldRef.current.timerId);
          pendingHoldRef.current.timerId = null as any;
        }
        return;
      }

      // Check active drag session
      if (activeDragSessionRef.current) {
        const session = activeDragSessionRef.current;
        const screenDx = e.clientX - session.startScreenX;
        const screenDy = e.clientY - session.startScreenY;
        if (!Number.isFinite(screenDx) || !Number.isFinite(screenDy)) return;

        const deltaX = screenDx / session.initialZoom;
        const deltaY = screenDy / session.initialZoom;
        if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

        const nextPositions: Record<string, { x: number; y: number }> = {};
        for (const id of session.targetNodeIds) {
          const init = session.initialPositions.get(id);
          if (init && Number.isFinite(init.x) && Number.isFinite(init.y)) {
            nextPositions[id] = {
              x: Math.round(init.x + deltaX),
              y: Math.round(init.y + deltaY),
            };
          }
        }

        session.currentPositions = nextPositions;
        setLiveDragPositions(nextPositions);
      }
    };

    const handleGlobalPointerUp = () => {
      // Clear pending hold timer & open drawer if clicked or moved before 1.5s
      if (pendingHoldRef.current) {
        const hold = pendingHoldRef.current;
        if (hold.timerId) {
          clearTimeout(hold.timerId);
        }
        pendingHoldRef.current = null;
        handleSelectNode(hold.nodeId);
        return;
      }

      // Finalize active drag session in ONE single atomic operation
      if (activeDragSessionRef.current) {
        const session = activeDragSessionRef.current;
        const finalPositions = session.currentPositions;

        const sanitizedFinal: Record<string, { x: number; y: number }> = {};
        let didActuallyMove = false;
        for (const [id, pos] of Object.entries(finalPositions)) {
          if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
            sanitizedFinal[id] = pos;
            const init = session.initialPositions.get(id);
            if (init && (pos.x !== init.x || pos.y !== init.y)) {
              didActuallyMove = true;
            }
          }
        }

        if (didActuallyMove && payload) {
          const nextNodePositions: Record<string, { x: number; y: number }> = {
            ...(payload.userModifications?.nodePositions || {}),
            ...sanitizedFinal,
          };

          committedLivePositionsRef.current = sanitizedFinal;

          applyModification(
            {
              ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
              nodePositions: nextNodePositions,
            },
            payload.userNotes || {},
          );
        }

        activeDragSessionRef.current = null;
        setDraggingNodeId(null);
        setLiveDragPositions(null);
        setIsPanOnDragEnabled(true);

        wasDraggingRef.current = true;
        setTimeout(() => {
          wasDraggingRef.current = false;
        }, 200);
      }
    };

    const handleGlobalPointerCancel = () => {
      handleCancelDrag();
    };

    const handleWindowBlur = () => {
      handleCancelDrag();
    };

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerCancel);
    window.addEventListener("lostpointercapture", handleGlobalPointerCancel);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      if (pendingHoldRef.current?.timerId) {
        clearTimeout(pendingHoldRef.current.timerId);
        pendingHoldRef.current = null;
      }
      activeDragSessionRef.current = null;
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerCancel);
      window.removeEventListener("lostpointercapture", handleGlobalPointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [payload, applyModification, handleCancelDrag, handleSelectNode]);

  // Toggle Collapse
  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = () => {
    setCollapsedNodeIds(new Set());
    setTimeout(() => fitView({ duration: 300 }), 50);
  };

  const handleCollapseAll = () => {
    if (!effectiveTree) return;
    const allParentIds = new Set<string>();
    for (const node of Object.values(effectiveTree.nodes)) {
      if (node.id !== effectiveTree.rootNodeId) {
        allParentIds.add(node.id);
      }
    }
    setCollapsedNodeIds(allParentIds);
    setTimeout(() => fitView({ duration: 300 }), 50);
  };

  // Node editing actions
  const handleAddChild = useCallback((parentId: string) => {
    setActiveModal({ type: "add", targetNodeId: parentId, initialTitle: "", initialDescription: "" });
    setModalTitleInput("");
    setModalDescInput("");
  }, []);

  const handleEditNode = useCallback(
    (nodeId: string) => {
      const node = effectiveTree?.nodes[nodeId];
      if (!node) return;
      setActiveModal({
        type: "edit",
        targetNodeId: nodeId,
        initialTitle: node.title,
        initialDescription: node.shortDescription || "",
      });
      setModalTitleInput(node.title);
      setModalDescInput(node.shortDescription || "");
    },
    [effectiveTree],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!payload || !effectiveTree) return;
      if (confirm("آیا از حذف این شاخه و تمام زیرشاخه‌های آن اطمینان دارید؟")) {
        const descendantIds = getDescendantNodeIds(nodeId, effectiveTree.nodes);
        const allToDelete = new Set([
          ...(payload.userModifications?.deletedNodeIds || []),
          nodeId,
          ...descendantIds,
        ]);

        // If currently selected node or any of its subtree is deleted, close the popup immediately
        if (selectedNodeId && allToDelete.has(selectedNodeId)) {
          setSelectedNodeId(null);
        }

        // Prune manual custom edges attached to any of the deleted nodes
        const existingCustom = payload.userModifications?.customEdges || [];
        const nextCustomEdges = existingCustom.filter(
          (e) => !allToDelete.has(e.source) && !allToDelete.has(e.target),
        );

        applyModification(
          {
            ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
            deletedNodeIds: Array.from(allToDelete),
            customEdges: nextCustomEdges,
          },
          payload.userNotes || {},
        );
      }
    },
    [payload, effectiveTree, selectedNodeId, setSelectedNodeId, applyModification],
  );

  // Delete a single custom connection (does NOT delete connected nodes)
  const handleDeleteCustomEdge = useCallback(
    (edgeId: string) => {
      if (!payload) return;
      const existingCustom = payload.userModifications?.customEdges || [];
      const nextCustomEdges = existingCustom.filter((e) => e.id !== edgeId);
      if (nextCustomEdges.length === existingCustom.length) return;

      applyModification(
        {
          ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
          customEdges: nextCustomEdges,
        },
        payload.userNotes || {},
      );
      setSelectedEdgeId((curr) => (curr === edgeId ? null : curr));
      selectedEdgeIdRef.current = null;
    },
    [payload, applyModification],
  );
  handleDeleteCustomEdgeRef.current = handleDeleteCustomEdge;

  // Batch delete custom edges (from ReactFlow onEdgesDelete)
  const handleDeleteCustomEdges = useCallback(
    (edgeIds: string[]) => {
      if (!payload || edgeIds.length === 0) return;
      const toDeleteSet = new Set(edgeIds);
      const existingCustom = payload.userModifications?.customEdges || [];
      const nextCustomEdges = existingCustom.filter((e) => !toDeleteSet.has(e.id));
      if (nextCustomEdges.length === existingCustom.length) return;

      applyModification(
        {
          ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
          customEdges: nextCustomEdges,
        },
        payload.userNotes || {},
      );
      setSelectedEdgeId((curr) => (curr && toDeleteSet.has(curr) ? null : curr));
    },
    [payload, applyModification],
  );

  // Custom edges count
  const customEdgesCount = payload?.userModifications?.customEdges?.length || 0;

  // Reset all custom connections back to original clean tree
  const handleResetCustomEdges = useCallback(() => {
    if (!payload) return;
    const count = payload.userModifications?.customEdges?.length || 0;
    if (count === 0) return; // Prevent unnecessary dirty state / operations

    if (
      confirm(
        `آیا از بازگردانی تمام ${toPersianDigits(count)} ارتباط سفارشی به حالت اولیه اطمینان دارید؟\n(ارتباطات اصلی درخت و یادداشت‌های شما بدون تغییر حفظ می‌شوند)`,
      )
    ) {
      applyModification(
        {
          ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
          customEdges: [],
        },
        payload.userNotes || {},
      );
      setSelectedEdgeId(null);
    }
  }, [payload, applyModification]);

  const handleRecoverCanvas = useCallback(() => {
    setLiveDragPositions(null);
    setDraggingNodeId(null);
    setIsPanOnDragEnabled(true);
    try {
      fitView({ padding: 0.15, duration: 300 });
    } catch {
      // ignore
    }
  }, [fitView]);

  // Manual Connection creation between any two handles (Top, Right, Bottom, Left)
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target || !payload) return;

      const existingCustom = payload.userModifications?.customEdges || [];
      const isDuplicate = existingCustom.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          (e.sourceHandle || "left") === (connection.sourceHandle || "left") &&
          (e.targetHandle || "right") === (connection.targetHandle || "right"),
      );
      if (isDuplicate) return;

      const newCustomEdge: MindMapCustomEdge = {
        id: `ce_${connection.source}_${connection.sourceHandle || "left"}_${connection.target}_${connection.targetHandle || "right"}_${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      };

      applyModification(
        {
          ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
          customEdges: [...existingCustom, newCustomEdge],
        },
        payload.userNotes || {},
      );
    },
    [payload, applyModification],
  );

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModal || !payload || !modalTitleInput.trim()) return;

    const trimmedTitle = modalTitleInput.trim();
    const trimmedDesc = modalDescInput.trim();

    if (activeModal.type === "add") {
      const newCustomId = `custom_${Date.now()}`;
      const newCustomNode: MindMapNodeBase = {
        id: newCustomId,
        parentId: activeModal.targetNodeId,
        title: trimmedTitle,
        shortDescription: trimmedDesc,
      };
      const nextCustomNodes = {
        ...(payload.userModifications?.customNodes || {}),
        [newCustomId]: newCustomNode,
      };
      applyModification(
        {
          ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
          customNodes: nextCustomNodes,
        },
        payload.userNotes || {},
      );
    } else if (activeModal.type === "edit") {
      const isCustom = Boolean(payload.userModifications?.customNodes?.[activeModal.targetNodeId]);
      if (isCustom) {
        const existingCustom = payload.userModifications!.customNodes![activeModal.targetNodeId];
        const nextCustomNodes = {
          ...payload.userModifications!.customNodes,
          [activeModal.targetNodeId]: {
            ...existingCustom,
            title: trimmedTitle,
            shortDescription: trimmedDesc,
          },
        };
        applyModification(
          {
            ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
            customNodes: nextCustomNodes,
          },
          payload.userNotes || {},
        );
      } else {
        const nextOverrides = {
          ...(payload.userModifications?.overrides || {}),
          [activeModal.targetNodeId]: {
            ...(payload.userModifications?.overrides?.[activeModal.targetNodeId] || {}),
            title: trimmedTitle,
            shortDescription: trimmedDesc,
          },
        };
        applyModification(
          {
            ...(payload.userModifications || { deletedNodeIds: [], customNodes: {}, overrides: {} }),
            overrides: nextOverrides,
          },
          payload.userNotes || {},
        );
      }
    }

    setActiveModal(null);
  };

  // User Note saving
  const handleSaveNote = useCallback(
    (nodeId: string, noteText: string) => {
      if (!payload) return;
      const nextNotes = {
        ...(payload.userNotes || {}),
        [nodeId]: {
          noteText,
          updatedAt: new Date().toISOString(),
        },
      };
      applyModification(payload.userModifications, nextNotes);
    },
    [payload, applyModification],
  );

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Preserve previous node positions across layout updates for seamless stability
  const previousPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const previousRootIdRef = useRef<string | null>(null);

  // Clear previous positions and reset camera state if root changes (e.g. switched chapter)
  if (effectiveTree?.rootNodeId !== previousRootIdRef.current) {
    previousRootIdRef.current = effectiveTree?.rootNodeId ?? null;
    previousPositionsRef.current.clear();
    hasInitialFitRef.current = false;
    userInteractedRef.current = false;
  }

  // Base Tree Layout (expensive: only recalculates on tree changes, collapse toggle, or saved positions)
  const baseLayout = useMemo(() => {
    if (!effectiveTree) return { nodes: [], edges: [] };

    const effectiveNodePositions = {
      ...(payload?.userModifications?.nodePositions || {}),
      ...(committedLivePositionsRef.current || {}),
    };

    const layout = computeRtlTreeLayout(effectiveTree.rootNodeId, effectiveTree.nodes, {
      collapsedNodeIds,
      previousPositions: previousPositionsRef.current,
      nodePositions: effectiveNodePositions,
    });

    const nextPosMap = new Map<string, { x: number; y: number }>();
    for (const n of layout.nodes) {
      nextPosMap.set(n.id, n.position);
    }
    previousPositionsRef.current = nextPosMap;
    nodePosMapRef.current = nextPosMap;

    return layout;
  }, [
    effectiveTree,
    collapsedNodeIds,
    payload?.userModifications?.nodePositions,
  ]);

  // Compute Live Flow Elements (lightweight live updates during drag)
  const { nodes, edges } = useMemo(() => {
    if (!effectiveTree || !baseLayout) return { nodes: [], edges: [] };

    const visibleNodeIds = new Set(baseLayout.nodes.map((n) => n.id));

    const enrichedNodes = baseLayout.nodes.map((n) => {
      const isSearchMatch =
        searchTerm.trim().length > 1 &&
        String(n.data?.title ?? "").toLowerCase().includes(searchTerm.trim().toLowerCase());

      const livePos = liveDragPositions?.[n.id];
      const position =
        livePos && Number.isFinite(livePos.x) && Number.isFinite(livePos.y)
          ? livePos
          : n.position;

      return {
        ...n,
        position,
        data: {
          ...n.data,
          onToggleCollapse: handleToggleCollapse,
          onSelectNode: handleSelectNode,
          onAddChild: handleAddChild,
          onEditNode: handleEditNode,
          onDeleteNode: handleDeleteNode,
          onNodePointerDown: handleNodePointerDown,
          isDragging: n.id === draggingNodeId,
          isSearchMatch,
          isSelected: n.id === selectedNodeId,
        },
      };
    });

    const nodePosMap = new Map<string, { x: number; y: number }>();
    for (const n of enrichedNodes) {
      nodePosMap.set(n.id, n.position);
    }

    // Custom edges manually created by the user between any handles
    const userEdges: Edge[] = (payload?.userModifications?.customEdges || [])
      .filter((ce) => visibleNodeIds.has(ce.source) && visibleNodeIds.has(ce.target))
      .map((ce) => {
        let sourceHandle = ce.sourceHandle;
        let targetHandle = ce.targetHandle;

        if (!sourceHandle || !targetHandle) {
          const sPos = nodePosMap.get(ce.source);
          const tPos = nodePosMap.get(ce.target);
          if (sPos && tPos) {
            const optimal = getOptimalHandles(sPos, tPos);
            sourceHandle = sourceHandle || optimal.sourceHandle;
            targetHandle = targetHandle || optimal.targetHandle;
          }
        }

        return {
          id: ce.id,
          source: ce.source,
          target: ce.target,
          sourceHandle: sourceHandle || undefined,
          targetHandle: targetHandle || undefined,
          type: "customConnection",
          animated: true,
          selected: ce.id === selectedEdgeId,
          deletable: true,
          selectable: true,
          style: {
            stroke: ce.id === selectedEdgeId ? "#008080" : "#5ba0c4",
            strokeWidth: ce.id === selectedEdgeId ? 2.5 : 2,
            strokeDasharray: "5 3",
          },
          data: {
            onDelete: handleDeleteCustomEdge,
          },
        };
      });

    return { nodes: enrichedNodes, edges: [...baseLayout.edges, ...userEdges] };
  }, [
    effectiveTree,
    baseLayout,
    searchTerm,
    selectedNodeId,
    selectedEdgeId,
    payload?.userModifications?.customEdges,
    liveDragPositions,
    draggingNodeId,
    handleToggleCollapse,
    handleSelectNode,
    handleAddChild,
    handleEditNode,
    handleDeleteNode,
    handleDeleteCustomEdge,
    handleNodePointerDown,
  ]);

  const selectedNode = selectedNodeId && effectiveTree ? effectiveTree.nodes[selectedNodeId] ?? null : null;

  // Intelligent Container ResizeObserver & Initial Render Lifecycle
  // Fixes initial narrow rendering on tab switch/first entry (e.g. flexbox layout delay) by re-fitting
  // as soon as container dimensions are valid (>100px), while strictly preserving user camera/zoom if userInteractedRef is true.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof ResizeObserver === "undefined") {
      if (!hasInitialFitRef.current && nodes.length > 0) {
        hasInitialFitRef.current = true;
        try {
          fitView({ padding: 0.15, maxZoom: 1.2, duration: 0 });
        } catch {
          // ignore
        }
      }
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width < 100 || height < 100) continue;

        if (!hasInitialFitRef.current && nodes.length > 0) {
          hasInitialFitRef.current = true;
          requestAnimationFrame(() => {
            fitView({ padding: 0.15, maxZoom: 1.2, duration: 0 });
          });
        } else if (hasInitialFitRef.current && !userInteractedRef.current) {
          const dw = Math.abs(width - prevDimensionsRef.current.width);
          const dh = Math.abs(height - prevDimensionsRef.current.height);
          if (dw > 50 || dh > 50) {
            if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
            resizeTimerRef.current = setTimeout(() => {
              if (!userInteractedRef.current) {
                fitView({ padding: 0.15, maxZoom: 1.2, duration: 150 });
              }
            }, 150);
          }
        }
        prevDimensionsRef.current = { width, height };
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [fitView, nodes.length]);

  // Persian typography (Estedad font) async readiness
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    let isMounted = true;
    document.fonts.ready.then(() => {
      if (!isMounted) return;
      if (!userInteractedRef.current && hasInitialFitRef.current) {
        requestAnimationFrame(() => {
          fitView({ padding: 0.15, maxZoom: 1.2, duration: 0 });
        });
      }
    });
    return () => {
      isMounted = false;
    };
  }, [fitView]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col font-sans ${
        isFullscreen ? "fixed inset-0 z-50 h-screen rounded-none" : "h-[620px] sm:h-[700px]"
      }`}
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
        {/* Search & Status */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در شاخه‌ها..."
              className="w-full ps-8 pe-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-primary"
            />
          </div>
          {chapterTitle && (
            <span
              className="hidden lg:inline-block text-[11px] font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg truncate max-w-[180px]"
              title={chapterTitle}
            >
              {chapterTitle}
            </span>
          )}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span>در حال ذخیره...</span>
            </span>
          )}
          {saveStatus === "conflict_retrying" && (
            <span className="flex items-center gap-1 text-[11px] text-amber-500 shrink-0">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>همگام‌سازی تعارض...</span>
            </span>
          )}
          {saveStatus === "conflict_manual" && (
            <button
              type="button"
              onClick={retrySave}
              className="flex items-center gap-1 text-[11px] text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 transition-colors shrink-0"
              title="تلاش مجدد برای رفع تعارض"
            >
              <RefreshCw className="w-3 h-3" />
              <span>تعارض هم‌زمانی (تلاش مجدد)</span>
            </button>
          )}
          {saveStatus === "error" && (
            <button
              type="button"
              onClick={retrySave}
              className="flex items-center gap-1 text-[11px] text-rose-600 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-0.5 rounded-lg border border-rose-500/30 transition-colors shrink-0"
              title="تلاش مجدد برای ذخیره"
            >
              <RefreshCw className="w-3 h-3" />
              <span>خطا در ذخیره (تلاش مجدد)</span>
            </button>
          )}
          {saveStatus === "saved" && !isDirty && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>ذخیره شد</span>
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Undo / Redo */}
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 transition-colors"
            title="بازگشت (Undo)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-30 transition-colors"
            title="انجام مجدد (Redo)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />

          {/* Expand / Collapse all */}
          <button
            type="button"
            onClick={handleExpandAll}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors text-xs flex items-center gap-1"
            title="باز کردن تمام شاخه‌ها"
          >
            <ChevronDown className="w-4 h-4" />
            <span className="hidden sm:inline text-[11px]">باز کردن همه</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors text-xs flex items-center gap-1"
            title="بستن تمام شاخه‌ها"
          >
            <ChevronUp className="w-4 h-4" />
            <span className="hidden sm:inline text-[11px]">بستن همه</span>
          </button>

          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />

          {/* Reset to AI */}
          <button
            type="button"
            onClick={() => {
              if (confirm("آیا مطمئن هستید که می‌خواهید تمام تغییرات خود را پاک کرده و به ساختار اولیه هوش مصنوعی برگردید؟")) {
                resetToAiBase();
              }
            }}
            disabled={isResetting}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:bg-[var(--color-surface-warm)] transition-colors text-xs flex items-center gap-1"
            title="بازنشانی تغییرات به نسخه اولیه AI"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
            <span className="hidden md:inline text-[11px]">بازنشانی به AI</span>
          </button>

          {/* Reset Custom Connections */}
          <button
            type="button"
            onClick={handleResetCustomEdges}
            disabled={customEdgesCount === 0}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-amber-600 dark:hover:text-amber-400 hover:bg-[var(--color-surface-warm)] disabled:opacity-30 disabled:pointer-events-none transition-colors text-xs flex items-center gap-1 cursor-pointer"
            title="بازگردانی ارتباطات سفارشی به حالت اولیه"
          >
            <Link2Off className="w-3.5 h-3.5" />
            <span className="hidden xl:inline text-[11px]">بازگردانی ارتباطات</span>
          </button>

          {/* Version History */}
          <button
            type="button"
            onClick={() => setShowVersionsModal(true)}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:bg-[var(--color-surface-warm)] transition-colors text-xs flex items-center gap-1"
            title="تاریخچه نسخه‌ها و بازیابی"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden md:inline text-[11px]">نسخه‌ها</span>
          </button>

          {/* Regenerate AI */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("آیا مایل به بازتولید مایندمپ با هوش مصنوعی هستید؟ (تغییرات و یادداشت‌های شما حفظ خواهند شد)")) {
                generateMindMap();
              }
            }}
            disabled={isGenerating}
            leftIcon={
              isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              )
            }
          >
            <span className="text-xs">بازتولید با AI</span>
          </Button>

          {/* Export Dropdown (Only for platform_admin) */}
          {isPlatformAdmin && (
            <div className="relative" ref={exportDropdownRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu((prev) => !prev)}
                disabled={isExporting || !payload}
                className="p-1.5 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                title="دریافت خروجی مایندمپ (مخصوص مدیر پلتفرم)"
                data-testid="mindmap-export-button"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-primary" />
                )}
                <span className="font-medium text-[11px]">دریافت خروجی</span>
                <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" />
              </button>

              {showExportMenu && (
                <div
                  dir="rtl"
                  className="absolute start-0 mt-1.5 w-52 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 py-1 flex flex-col text-xs font-sans animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    onClick={() => handleExport("svg")}
                    disabled={isExporting}
                    className="flex items-center gap-2.5 px-3 py-2 text-start text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-primary transition-colors cursor-pointer"
                    data-testid="export-svg-option"
                  >
                    <FileCode className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-bold text-[11px]">دریافت SVG</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">خروجی برداری باکیفیت و بدون افت</span>
                    </div>
                  </button>

                  <div className="w-full h-px bg-[var(--color-border)] my-0.5" />

                  <button
                    type="button"
                    onClick={() => handleExport("html")}
                    disabled={isExporting}
                    className="flex items-center gap-2.5 px-3 py-2 text-start text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-primary transition-colors cursor-pointer"
                    data-testid="export-html-option"
                  >
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-bold text-[11px]">دریافت HTML آفلاین</span>
                      <span className="text-[10px] text-[var(--color-text-muted)]">کاملاً مستقل، تعاملی و بدون اینترنت</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
            title={isFullscreen ? "خروج از تمام‌صفحه" : "نمایش تمام‌صفحه"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 w-full h-full relative bg-[#f9fafb] dark:bg-[#0c1315]">
        <style>{`
          .react-flow--connecting .react-flow__handle {
            opacity: 0.8 !important;
            pointer-events: auto !important;
            transform: scale(1.1) !important;
          }
        `}</style>
        <MindMapErrorBoundary onReset={handleRecoverCanvas}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
            minZoom={0.1}
            maxZoom={2}
            panOnDrag={isPanOnDragEnabled}
            nodesDraggable={false}
            connectionMode={ConnectionMode.Loose}
            onConnect={handleConnect}
            onEdgeClick={(_, edge) => {
              if (edge.type === "customConnection" || !edge.id.startsWith("e-")) {
                setSelectedEdgeId(edge.id);
                selectedEdgeIdRef.current = edge.id;
              }
            }}
            onPaneClick={() => {
              setSelectedEdgeId(null);
              selectedEdgeIdRef.current = null;
            }}
            onEdgesDelete={(deleted) => handleDeleteCustomEdges(deleted.map((e) => e.id))}
            onMoveStart={(event) => {
              if (event) {
                userInteractedRef.current = true;
              }
            }}
            onMove={(event) => {
              if (event) {
                userInteractedRef.current = true;
              }
              setViewportChangeCount((c) => c + 1);
            }}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            className="w-full h-full"
          />
        </MindMapErrorBoundary>

        {/* Floating Canvas Controls */}
        <div className="absolute start-4 bottom-4 z-10 flex flex-col gap-1.5 bg-[var(--color-surface)] p-1.5 rounded-xl border border-[var(--color-border)] shadow-md">
          <button
            type="button"
            onClick={() => {
              userInteractedRef.current = true;
              zoomIn({ duration: 200 });
            }}
            className="p-2 rounded-lg text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
            title="بزرگ‌نمایی"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              userInteractedRef.current = true;
              zoomOut({ duration: 200 });
            }}
            className="p-2 rounded-lg text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
            title="کوچک‌نمایی"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => fitView({ duration: 300 })}
            className="p-2 rounded-lg text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
            title="تطبیق با صفحه (Fit to Screen)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Node Details Drawer / Smart Information Popup */}
      <MindMapDetailDrawer
        node={selectedNode}
        isOpen={Boolean(selectedNodeId)}
        onClose={() => setSelectedNodeId(null)}
        onSaveNote={handleSaveNote}
        viewportChangeCount={viewportChangeCount}
      />

      {/* Add / Edit Node Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            dir="rtl"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4 font-sans animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-[var(--color-text)]">
                {activeModal.type === "add" ? "افزودن زیرشاخه جدید" : "ویرایش شاخه"}
              </h4>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">عنوان شاخه:</label>
                <input
                  type="text"
                  autoFocus
                  value={modalTitleInput}
                  onChange={(e) => setModalTitleInput(e.target.value)}
                  placeholder="مثال: مکانیسم اثر دارویی..."
                  className="w-full p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] text-xs text-[var(--color-text)] focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">
                  توضیحات مختصر (اختیاری):
                </label>
                <textarea
                  value={modalDescInput}
                  onChange={(e) => setModalDescInput(e.target.value)}
                  placeholder="توضیح کوتاه درباره این مفهوم یا نکته..."
                  rows={2}
                  className="w-full p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setActiveModal(null)}>
                  انصراف
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={!modalTitleInput.trim()}>
                  ثبت تغییر
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            dir="rtl"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 font-sans animate-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <h4 className="font-bold text-sm text-[var(--color-text)]">
                  تاریخچه نسخه‌های مایندمپ
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowVersionsModal(false)}
                className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pe-1">
              {isLoadingVersions ? (
                <div className="flex items-center justify-center py-8 text-xs text-[var(--color-text-muted)] gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>در حال دریافت تاریخچه نسخه‌ها...</span>
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--color-text-muted)]">
                  هیچ نسخه‌ای برای این مایندمپ ثبت نشده است.
                </div>
              ) : (
                versions.map((ver) => {
                  const isCurrent = ver.version === currentVersion;
                  return (
                    <div
                      key={ver.version}
                      className={`p-3 rounded-xl border transition-all ${
                        isCurrent
                          ? "border-primary/40 bg-primary/5"
                          : "border-[var(--color-border)] bg-[var(--color-surface-warm)]"
                      } flex items-center justify-between gap-3`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[var(--color-text)]">
                            نسخه {toPersianDigits(ver.version)}
                          </span>
                          {isCurrent && (
                            <Badge variant="primary" size="sm">
                              نسخه فعلی
                            </Badge>
                          )}
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            {new Date(ver.createdAt).toLocaleDateString("fa-IR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                          <span>{toPersianDigits(ver.nodesCount)} شاخه کل</span>
                          {ver.customNodesCount > 0 && (
                            <span>{toPersianDigits(ver.customNodesCount)} دستی</span>
                          )}
                          {ver.notesCount > 0 && (
                            <span>{toPersianDigits(ver.notesCount)} یادداشت</span>
                          )}
                        </div>
                      </div>

                      {!isCurrent && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isRestoring}
                          onClick={async () => {
                            if (
                              confirm(
                                `آیا مایل به بازیابی نسخه ${toPersianDigits(
                                  ver.version,
                                )} هستید؟ این کار یک نسخه جدید بر اساس آن ایجاد می‌کند.`,
                              )
                            ) {
                              await restoreVersion(ver.version);
                              setShowVersionsModal(false);
                            }
                          }}
                        >
                          بازیابی این نسخه
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-[var(--color-border)] flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowVersionsModal(false)}>
                بستن
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MindMapCanvas(props: MindMapCanvasInnerProps) {
  return (
    <ReactFlowProvider>
      <MindMapErrorBoundary>
        <MindMapCanvasInner {...props} />
      </MindMapErrorBoundary>
    </ReactFlowProvider>
  );
}
