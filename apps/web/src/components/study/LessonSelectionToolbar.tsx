/**
 * Floating Selection Toolbar for AVANA Lesson Reading experience.
 *
 * Renders contextual actions when student selects text in a lesson:
 * 1. «از آوانا بپرس» (Ask Avana)
 * 2. «توضیح ساده» (Explain Simply)
 * 3. «هایلایت» (Highlight with 5-color smart palette)
 * 4. «یادداشت» (Note — shown only on unhighlighted text)
 * 5. «گزارش مشکل» (Report Issue)
 *
 * Conforms to AVANA Design System tokens, Lucide icons, full dark/light mode and mobile responsiveness.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Sparkles,
  Lightbulb,
  Highlighter,
  StickyNote,
  Flag,
  Loader2,
  ChevronUp,
} from "lucide-react";
import type { TextSelectionData } from "../../hooks/useTextSelection.js";
import {
  HIGHLIGHT_COLORS,
  type HighlightColorId,
  getStoredHighlightColor,
  setStoredHighlightColor,
} from "./highlightColors.js";
import { HighlightColorPalette } from "./HighlightColorPalette.js";

export interface LessonSelectionToolbarProps {
  selectionData: TextSelectionData | null;
  onAskAvana: (selection: TextSelectionData) => void;
  onExplainSimply: (selection: TextSelectionData) => void;
  onHighlight: (selection: TextSelectionData, color?: string) => void;
  onAddNote: (selection: TextSelectionData) => void;
  onReportIssue: (selection: TextSelectionData) => void;
  onClose: () => void;
  isHighlighting?: boolean;
  canAddNote?: boolean;
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
  canAddNote = true,
}: LessonSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const highlightBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileHighlightContainerRef = useRef<HTMLDivElement | null>(null);

  const [position, setPosition] = useState<{ top: number; left: number; isBottomBar: boolean }>({
    top: 0,
    left: 0,
    isBottomBar: false,
  });

  const [selectedColor, setSelectedColor] = useState<HighlightColorId>(() => getStoredHighlightColor());
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleCloseTimer = useCallback((delay = 200) => {
    cancelCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsPaletteOpen(false);
      closeTimerRef.current = null;
    }, delay);
  }, [cancelCloseTimer]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

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

  const handleAction = (e: React.MouseEvent, action: () => void, _actionName?: string) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  const handleColorSelect = (color: HighlightColorId) => {
    setSelectedColor(color);
    setStoredHighlightColor(color);
    setIsPaletteOpen(false);
    onHighlight(selectionData, color);
  };

  const handleDirectHighlight = (e: React.MouseEvent) => {
    cancelCloseTimer();
    setIsPaletteOpen(false);
    handleAction(e, () => onHighlight(selectionData, selectedColor), "highlight");
  };

  const handleHighlightMouseEnter = () => {
    cancelCloseTimer();
    if (highlightBtnRef.current) {
      setAnchorRect(highlightBtnRef.current.getBoundingClientRect());
      setIsPaletteOpen(true);
    }
  };

  const handleHighlightMouseLeave = () => {
    scheduleCloseTimer(220);
  };

  const handleMobileColorTrigger = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cancelCloseTimer();
    const anchor = mobileHighlightContainerRef.current || highlightBtnRef.current;
    if (anchor) {
      setAnchorRect(anchor.getBoundingClientRect());
    }
    setIsPaletteOpen((prev) => !prev);
  };

  const currentColorDef =
    HIGHLIGHT_COLORS.find((c) => c.id === selectedColor) || HIGHLIGHT_COLORS[0];

  if (position.isBottomBar) {
    // Mobile Compact Action Bar fixed at bottom
    return (
      <>
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="ابزارهای متن انتخاب‌شده"
          dir="rtl"
          onMouseDown={(e) => e.preventDefault()}
          className="fixed bottom-20 sm:bottom-4 inset-x-3 z-[1350] max-w-lg mx-auto flex items-center justify-between p-1.5 sm:p-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-modal backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200 touch-manipulation select-none"
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => handleAction(e, () => onAskAvana(selectionData))}
            className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="text-[11px] leading-tight truncate">از آوانا بپرس</span>
          </button>

          <div className="w-[1px] h-6 bg-[var(--color-border)] shrink-0" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => handleAction(e, () => onExplainSimply(selectionData))}
            className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center cursor-pointer"
          >
            <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-[11px] leading-tight truncate">توضیح ساده</span>
          </button>

          <div className="w-[1px] h-6 bg-[var(--color-border)] shrink-0" />

          {/* Highlight with Color Trigger on Mobile */}
          <div
            ref={mobileHighlightContainerRef}
            className="flex-1 min-h-[44px] flex items-center justify-center relative"
          >
            <button
              ref={highlightBtnRef}
              type="button"
              disabled={isHighlighting}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDirectHighlight}
              className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center disabled:opacity-50 cursor-pointer"
            >
              {isHighlighting ? (
                <Loader2 className="w-4 h-4 animate-spin text-teal-600 shrink-0" />
              ) : (
                <div className="relative flex items-center justify-center">
                  <Highlighter className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span
                    style={{ backgroundColor: currentColorDef.dotColor }}
                    className="absolute -bottom-0.5 -right-1 w-2.5 h-2.5 rounded-full ring-1 ring-white dark:ring-gray-900 shrink-0"
                  />
                </div>
              )}
              <span className="text-[11px] leading-tight truncate">هایلایت</span>
            </button>

            {/* Touch color palette toggle trigger */}
            <button
              type="button"
              data-testid="mobile-color-trigger"
              aria-label="تغییر رنگ هایلایت"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleMobileColorTrigger}
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-teal-600 dark:hover:text-teal-400 active:scale-90 transition-all cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {canAddNote && (
            <>
              <div className="w-[1px] h-6 bg-[var(--color-border)] shrink-0" />

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => handleAction(e, () => onAddNote(selectionData))}
                className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-xl text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] active:scale-95 transition-all text-center cursor-pointer"
              >
                <StickyNote className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="text-[11px] leading-tight truncate">یادداشت</span>
              </button>
            </>
          )}

          <div className="w-[1px] h-6 bg-[var(--color-border)] shrink-0" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => handleAction(e, () => onReportIssue(selectionData))}
            className="flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 py-1 px-1 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all text-center cursor-pointer"
          >
            <Flag className="w-4 h-4 shrink-0" />
            <span className="text-[11px] leading-tight truncate">گزارش مشکل</span>
          </button>
        </div>

        {/* Floating 5-color palette */}
        <HighlightColorPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          selectedColor={selectedColor}
          onSelectColor={handleColorSelect}
          anchorRect={anchorRect}
          onMouseEnter={cancelCloseTimer}
          onMouseLeave={() => scheduleCloseTimer(200)}
        />
      </>
    );
  }

  // Desktop Floating Context Toolbar
  return (
    <>
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
        className="flex items-center gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full shadow-modal backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none"
      >
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => handleAction(e, () => onAskAvana(selectionData))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-teal-600 dark:hover:text-teal-400 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          <span>از آوانا بپرس</span>
        </button>

        <div className="w-[1px] h-4 bg-[var(--color-border)]" />

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => handleAction(e, () => onExplainSimply(selectionData))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-amber-500 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>توضیح ساده</span>
        </button>

        <div className="w-[1px] h-4 bg-[var(--color-border)]" />

        {/* Desktop Highlight Button with Hover Palette & Direct Click */}
        <div
          className="relative inline-flex items-center"
          onMouseEnter={handleHighlightMouseEnter}
          onMouseLeave={handleHighlightMouseLeave}
        >
          <button
            ref={highlightBtnRef}
            type="button"
            disabled={isHighlighting}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={handleDirectHighlight}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-teal-600 dark:hover:text-teal-400 active:scale-95 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {isHighlighting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600 shrink-0" />
            ) : (
              <div className="relative flex items-center justify-center">
                <Highlighter className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span
                  style={{ backgroundColor: currentColorDef.dotColor }}
                  className="absolute -bottom-0.5 -right-1 w-2 h-2 rounded-full ring-1 ring-white dark:ring-gray-900 shrink-0"
                />
              </div>
            )}
            <span>هایلایت</span>
          </button>
        </div>

        {canAddNote && (
          <>
            <div className="w-[1px] h-4 bg-[var(--color-border)]" />

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => handleAction(e, () => onAddNote(selectionData))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-sky-600 dark:hover:text-sky-400 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              <StickyNote className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>یادداشت</span>
            </button>
          </>
        )}

        <div className="w-[1px] h-4 bg-[var(--color-border)]" />

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => handleAction(e, () => onReportIssue(selectionData))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          <Flag className="w-3.5 h-3.5 shrink-0" />
          <span>گزارش مشکل</span>
        </button>
      </div>

      {/* Floating 5-color palette */}
      <HighlightColorPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        selectedColor={selectedColor}
        onSelectColor={handleColorSelect}
        anchorRect={anchorRect}
        onMouseEnter={cancelCloseTimer}
        onMouseLeave={() => scheduleCloseTimer(200)}
      />
    </>
  );
}
