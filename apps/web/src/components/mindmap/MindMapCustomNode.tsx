/**
 * Custom Node Component for Interactive AI Mind Map in AVANA.
 *
 * Supports:
 * - RTL handles (Parent on Right, Children on Left).
 * - Estedad Persian typography & Teal styling tokens.
 * - Collapsible toggle with children count.
 * - Indicators for User Notes, Overrides, Custom Nodes, and Exam Tips.
 * - Search match highlight.
 */

import React, { memo, useState, useRef, useEffect, useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Plus,
  Trash2,
  Edit2,
  UserRound,
  FlaskConical,
} from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import type { MindMapChemicalStructure, MindMapNodeChemicalStatus } from "@avana/contracts";

export interface MindMapCustomNodeData {
  id: string;
  title: string;
  shortDescription?: string;
  depth: number;
  nodeRole?: "category" | "concept";
  hasChildren: boolean;
  childrenCount: number;
  isCollapsed: boolean;
  isUserCustom?: boolean;
  isOverridden?: boolean;
  userNote?: string;
  chemicalStructure?: MindMapChemicalStructure;
  relatedChemicals?: MindMapChemicalStructure[];
  chemicalStatus?: MindMapNodeChemicalStatus;
  examTips?: string[];
  keyPoints?: string[];
  side?: "left" | "right" | "root";
  onToggleCollapse?: (nodeId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onEditNode?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  isSearchMatch?: boolean;
  isSelected?: boolean;
  calculatedWidth?: number;
  calculatedHeight?: number;
  isDragging?: boolean;
  onNodePointerDown?: (e: React.PointerEvent, nodeId: string) => void;
  clusterId?: string;
  clusterName?: string;
  clusterColor?: string;
}

export const MindMapCustomNode = memo(({ data }: { data: MindMapCustomNodeData }) => {
  const isRoot = data.depth === 0;

  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, .react-flow__handle, input, textarea, a")) {
      return;
    }
    data.onNodePointerDown?.(e, data.id);
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const isToolbarVisible = isHovered || Boolean(data.isSelected);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onToggleCollapse?.(data.id);
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onAddChild?.(data.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onEditNode?.(data.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onDeleteNode?.(data.id);
  };

  const handleClick = () => {
    data.onSelectNode?.(data.id);
  };

  // Typography scale based on tree depth - strictly centered horizontally with robust wrapping
  const getTypography = () => {
    switch (data.depth) {
      case 0:
        return {
          title: "text-base sm:text-lg font-extrabold text-[#006666] dark:text-teal-300 text-center leading-normal break-words whitespace-pre-wrap select-none w-full",
          desc: "text-xs text-slate-600 dark:text-slate-300 text-center mt-1.5 leading-relaxed w-full",
        };
      case 1:
        return {
          title: "text-sm sm:text-base font-bold text-[#1a2226] dark:text-slate-100 text-center leading-normal break-words whitespace-pre-wrap select-none w-full",
          desc: "text-xs text-slate-600 dark:text-slate-300 text-center mt-1 leading-relaxed w-full",
        };
      case 2:
        return {
          title: "text-[13px] sm:text-sm font-bold text-[#2c3b42] dark:text-slate-200 text-center leading-normal break-words whitespace-pre-wrap select-none w-full",
          desc: "text-[12px] text-slate-600 dark:text-slate-300 text-center mt-1 leading-relaxed w-full",
        };
      case 3:
        return {
          title: "text-xs sm:text-[13px] font-semibold text-[#3d4f55] dark:text-slate-300 text-center leading-normal break-words whitespace-pre-wrap select-none w-full",
          desc: "text-[12px] text-slate-600 dark:text-slate-300 text-center mt-0.5 leading-normal w-full",
        };
      default:
        return {
          title: "text-[11.5px] sm:text-xs font-semibold text-[#4b5563] dark:text-slate-300 text-center leading-normal break-words whitespace-pre-wrap select-none w-full",
          desc: "text-[11.5px] text-slate-600 dark:text-slate-300 text-center mt-0.5 leading-normal w-full",
        };
    }
  };

  // Level-based minimal box styles using AVANA palette with standard symmetric padding
  const getBoxStyle = () => {
    if (isRoot) {
      return "px-6 py-4 rounded-2xl border-2 border-[#008080] bg-teal-50/80 dark:bg-teal-950/40 text-center flex flex-col items-center justify-center shadow-xs transition-colors duration-150 box-border";
    }

    // Allocate additional clearance on the side hosting the toggle button to eliminate any text overlap
    const togglePadding = data.hasChildren
      ? data.side === "right"
        ? "pr-5 pl-3.5"
        : "pl-5 pr-3.5"
      : "px-4";

    const base = `${togglePadding} py-2.5 rounded-2xl transition-colors duration-150 cursor-pointer select-none text-center flex flex-col items-center justify-center box-border`;

    if (data.isSelected) {
      return `${base} bg-[var(--color-surface)] border-2 border-[#008080] shadow-md ring-2 ring-[#008080]/30`;
    }

    if (data.depth === 1) {
      return `${base} bg-[var(--color-surface)] border-[1.5px] border-[#008080]/70 dark:border-teal-500/70 hover:border-[#008080] shadow-xs`;
    }

    if (data.depth === 2) {
      return `${base} bg-[var(--color-surface)] border-[1.5px] border-[#5ba0c4] dark:border-[#5ba0c4]/80 hover:border-[#008080] shadow-xs`;
    }

    return `${base} bg-[var(--color-surface)] border border-slate-300 dark:border-slate-600 hover:border-[#008080]/70 shadow-xs`;
  };

  const typography = getTypography();
  const boxStyle = getBoxStyle();

  // Smart hover & touch-responsive handles:
  // Hidden by default (opacity-0 scale-75), smoothly appear on box hover/proximity or selection.
  const isHandlesVisible = isHovered || Boolean(data.isSelected);
  const handleClasses = `w-2.5 h-2.5 !bg-teal-500 border-2 border-white dark:border-gray-900 rounded-full shadow-xs cursor-crosshair transition-all duration-150 ${
    isHandlesVisible
      ? "opacity-100 pointer-events-auto scale-100 hover:scale-125 hover:!bg-teal-600"
      : "opacity-0 pointer-events-none scale-75 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:scale-100 hover:scale-125 hover:!bg-teal-600"
  }`;


  const hasChemical = Boolean(
    data.chemicalStatus === "enriched" &&
      ((data.chemicalStructure &&
        data.chemicalStructure.isValidated &&
        data.chemicalStructure.confidence === "high") ||
        (Array.isArray(data.relatedChemicals) &&
          data.relatedChemicals.some((c) => c.isValidated && c.confidence === "high"))),
  );

  const chemicalTooltip = useMemo(() => {
    if (data.chemicalStructure) {
      return `ساختار شیمیایی: ${data.chemicalStructure.compoundName || ""}${data.chemicalStructure.formula ? ` (${data.chemicalStructure.formula})` : ""}`;
    }
    if (data.relatedChemicals && data.relatedChemicals.length > 0) {
      const names = data.relatedChemicals.map((c) => c.displayName || c.compoundName).join("، ");
      return `ترکیبات شیمیایی مرتبط: ${names}`;
    }
    return "دارای ساختار شیمیایی";
  }, [data.chemicalStructure, data.relatedChemicals]);

  const hasIndicators = !isRoot && Boolean(data.isUserCustom || data.isOverridden || data.userNote || hasChemical);

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      dir="rtl"
      style={{
        width: data.calculatedWidth ? `${data.calculatedWidth}px` : undefined,
        height: data.calculatedHeight ? `${data.calculatedHeight}px` : undefined,
      }}
      className={`group relative font-sans nopan nodrag touch-none select-none ${boxStyle} before:absolute before:-inset-2 before:rounded-2xl before:pointer-events-auto before:z-[-1] ${
        data.isDragging ? "cursor-grabbing ring-2 ring-[#008080] shadow-xl z-50 select-none scale-102" : ""
      } ${data.isSearchMatch ? "ring-2 ring-amber-500 ring-offset-2 animate-pulse" : ""}`}
    >
      {/* External Floating Toolbar */}
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`absolute -top-10 left-2 flex items-center gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] shadow-md rounded-xl z-30 transition-all duration-150 before:absolute before:inset-x-0 before:-bottom-3 before:h-3 before:content-[''] ${
          isToolbarVisible
            ? "opacity-100 pointer-events-auto translate-y-0"
            : "opacity-0 pointer-events-none translate-y-1"
        }`}
      >
        <button
          type="button"
          onClick={handleAdd}
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
          title="افزودن زیرشاخه"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        {!isRoot && (
          <>
            <button
              type="button"
              onClick={handleEdit}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
              title="ویرایش عنوان"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="حذف شاخه"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* 4-Directional Handles: Top, Right, Bottom, Left (Dual source & target for full flexibility and zero handle lookup errors) */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />

      <Handle
        type="target"
        position={Position.Right}
        id="right"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />

      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="left"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        isConnectable={true}
        className={handleClasses}
        onPointerDown={(e) => e.stopPropagation()}
      />

      {/* Indicators Header (Only shown for non-root nodes when indicators exist) */}
      {hasIndicators && (
        <div className="flex items-center justify-center gap-1.5 mb-1 w-full">
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            {hasChemical && (
              <span
                className="inline-flex items-center gap-0.5 text-[#008080] dark:text-teal-400"
                title={chemicalTooltip}
                aria-label="دارای ساختار شیمیایی"
                data-testid="chemical-node-indicator"
              >
                <FlaskConical className="w-3 h-3 text-[#008080] dark:text-teal-400 shrink-0" />
              </span>
            )}
            {data.isUserCustom && (
              <span
                className="inline-flex items-center gap-0.5 text-[#008080] dark:text-teal-400"
                title="ایجادشده توسط شما"
                aria-label="ایجادشده توسط شما"
              >
                <UserRound className="w-3 h-3 text-[#008080] dark:text-teal-400 shrink-0" />
              </span>
            )}
            {data.isOverridden && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-teal-500"
                title="ویرایش‌شده توسط کاربر"
              />
            )}
            {data.userNote && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                title="دارای یادداشت شخصی"
              >
                <Bookmark className="w-3 h-3 fill-emerald-500 text-emerald-500" />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Node Title: Clean multi-line wrapping with full padding clearance */}
      <h4 className={typography.title}>
        {data.title}
      </h4>

      {/* Short Description: full conceptual visibility without truncation */}
      {data.shortDescription && !isRoot ? (
        <p className={`${typography.desc} break-words whitespace-normal select-text`}>
          {data.shortDescription}
        </p>
      ) : data.isUserCustom && !data.shortDescription && !isRoot && isToolbarVisible ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onEditNode?.(data.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium cursor-pointer"
          title="افزودن توضیح برای این شاخه"
        >
          <Plus className="w-2.5 h-2.5" />
          <span>افزودن توضیح</span>
        </button>
      ) : null}

      {/* Collapse / Expand Toggle on Edge towards children (branches only, not root) */}
      {!isRoot && data.hasChildren && (
        <button
          type="button"
          onClick={handleToggle}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute ${
            data.side === "right" ? "-right-3" : "-left-3"
          } top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all z-10 shadow-xs cursor-pointer ${
            data.isCollapsed
              ? "bg-[#008080] text-white border-[#008080] hover:bg-[#007575] scale-105"
              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[#008080] hover:text-[#008080]"
          }`}
          title={data.isCollapsed ? "باز کردن شاخه‌ها" : "بستن شاخه‌ها"}
        >
          {data.isCollapsed ? (
            <span>+{toPersianDigits(data.childrenCount)}</span>
          ) : data.side === "right" ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
});

MindMapCustomNode.displayName = "MindMapCustomNode";
