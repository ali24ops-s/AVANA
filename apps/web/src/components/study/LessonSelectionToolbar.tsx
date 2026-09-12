/**
 * Floating Selection Toolbar for AVANA Lesson Reading experience.
 *
 * Renders contextual actions when student selects text in a lesson:
 * 1. «از آوانا بپرس» (Ask Avana)
 * 2. «توضیح ساده» (Explain Simply)
 * 3. «هایلایت» (Highlight)
 * 4. «یادداشت» (Note)
 * 5. «گزارش مشکل» (Report Issue)
 *
 * Conforms to AVANA Design System tokens, Lucide icons, full dark/light mode and mobile responsiveness.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Lightbulb,
  Highlighter,
  StickyNote,
  Flag,
  Loader2,
} from "lucide-react";
import type { TextSelectionData } from "../../hooks/useTextSelection.js";

export interface LessonSelectionToolbarProps {
  selectionData: TextSelectionData | null;
  onAskAvana: (selection: TextSelectionData) => void;
  onExplainSimply: (selection: TextSelectionData) => void;
  onHighlight: (selection: TextSelectionData) => void;
  onAddNote: (selection: TextSelectionData) => void;
  onReportIssue: (selection: TextSelectionData) => void;
  onClose: () => void;
  isHighlighting?: boolean;
}

export function LessonSelectionToolbar({
  selectionData,
  onAskAvana,
  onExplainSimply,
  onHighlight,
  onAddNote,
  onReportIssue,
  onClose: _onClose,
  isHighlighting = false,
}: LessonSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; isBottomBar: boolean }>({
    top: 0,
    left: 0,
    isBottomBar: false,
  });

  useEffect(() => {
    if (!selectionData || !selectionData.rect) return;

    const updatePosition = () => {
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        setPosition({ top: 0, left: 0, isBottomBar: true });
        return;
      }

      const rect = selectionData.rect;
      const toolbarHeight = 44;
      const toolbarWidth = 430;

      // Position centered horizontally relative to selection
      let left = rect.left + rect.width / 2 - toolbarWidth / 2;
      // Clamp horizontally within screen
      left = Math.max(16, Math.min(window.innerWidth - toolbarWidth - 16, left));

      // Position above selection by default; if not enough room, position below
      let top = rect.top - toolbarHeight - 10;
      if (top < 70) {
        // Not enough space above (e.g. below sticky header)
        top = rect.bottom + 10;
      }

      setPosition({ top, left, isBottomBar: false });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [selectionData]);

  if (!selectionData) return null;

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  if (position.isBottomBar) {
    // Mobile Compact Action Bar fixed at bottom
    return (
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="ابزارهای متن انتخاب‌شده"
        dir="rtl"
        onMouseDown={(e) => e.preventDefault()}
        className="fixed bottom-4 inset-x-3 z-[1350] flex items-center justify-between p-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-modal backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200"
      >
        <button
          type="button"
          onClick={(e) => handleAction(e, () => onAskAvana(selectionData))}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center"
        >
          <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span className="text-[11px] truncate">از آوانا بپرس</span>
        </button>

        <div className="w-[1px] h-6 bg-[var(--color-border)]" />

        <button
          type="button"
          onClick={(e) => handleAction(e, () => onExplainSimply(selectionData))}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center"
        >
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span className="text-[11px] truncate">توضیح ساده</span>
        </button>

        <div className="w-[1px] h-6 bg-[var(--color-border)]" />

        <button
          type="button"
          disabled={isHighlighting}
          onClick={(e) => handleAction(e, () => onHighlight(selectionData))}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center disabled:opacity-50"
        >
          {isHighlighting ? (
            <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
          ) : (
            <Highlighter className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          )}
          <span className="text-[11px] truncate">هایلایت</span>
        </button>

        <div className="w-[1px] h-6 bg-[var(--color-border)]" />

        <button
          type="button"
          onClick={(e) => handleAction(e, () => onAddNote(selectionData))}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center"
        >
          <StickyNote className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          <span className="text-[11px] truncate">یادداشت</span>
        </button>

        <div className="w-[1px] h-6 bg-[var(--color-border)]" />

        <button
          type="button"
          onClick={(e) => handleAction(e, () => onReportIssue(selectionData))}
          className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all text-center"
        >
          <Flag className="w-4 h-4" />
          <span className="text-[11px] truncate">گزارش مشکل</span>
        </button>
      </div>
    );
  }

  // Desktop Floating Context Toolbar
  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="ابزارهای متن انتخاب‌شده"
      dir="rtl"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1350,
      }}
      className="flex items-center gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full shadow-modal backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
    >
      <button
        type="button"
        onClick={(e) => handleAction(e, () => onAskAvana(selectionData))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-teal-600 dark:hover:text-teal-400 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
      >
        <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
        <span>از آوانا بپرس</span>
      </button>

      <div className="w-[1px] h-4 bg-[var(--color-border)]" />

      <button
        type="button"
        onClick={(e) => handleAction(e, () => onExplainSimply(selectionData))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-amber-500 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
      >
        <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span>توضیح ساده</span>
      </button>

      <div className="w-[1px] h-4 bg-[var(--color-border)]" />

      <button
        type="button"
        disabled={isHighlighting}
        onClick={(e) => handleAction(e, () => onHighlight(selectionData))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-teal-600 dark:hover:text-teal-400 active:scale-95 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
      >
        {isHighlighting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 shrink-0" />
        ) : (
          <Highlighter className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
        )}
        <span>هایلایت</span>
      </button>

      <div className="w-[1px] h-4 bg-[var(--color-border)]" />

      <button
        type="button"
        onClick={(e) => handleAction(e, () => onAddNote(selectionData))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-sky-600 dark:hover:text-sky-400 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
      >
        <StickyNote className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
        <span>یادداشت</span>
      </button>

      <div className="w-[1px] h-4 bg-[var(--color-border)]" />

      <button
        type="button"
        onClick={(e) => handleAction(e, () => onReportIssue(selectionData))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
      >
        <Flag className="w-3.5 h-3.5 shrink-0" />
        <span>گزارش مشکل</span>
      </button>
    </div>
  );
}
