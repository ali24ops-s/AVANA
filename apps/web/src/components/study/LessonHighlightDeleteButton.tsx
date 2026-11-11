/**
 * LessonHighlightDeleteButton — Floating quick-delete action for lesson text highlights.
 *
 * Responsibilities:
 * - Floating Lucide X icon anchored to the upper corner of the highlighted text.
 * - Single click deletes the highlight immediately without extra confirmations.
 * - mousedown & click prevent default and stop propagation to preserve text selection.
 * - Dynamic repositioning on window scroll and resize.
 * - Automatically respects RTL vs LTR and clamps within viewport margins (mobile safe).
 * - Closes on click outside or Escape key.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface HighlightRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface LessonHighlightDeleteButtonProps {
  annotationId: string;
  targetRect: HighlightRect;
  isRtl?: boolean;
  onDelete: (annotationId: string) => void | Promise<void>;
  onClose: () => void;
  getLatestRect?: () => HighlightRect | null;
}

const BTN_WIDTH = 24;
const BTN_HEIGHT = 24;

export const computeDeleteButtonCoords = (
  rect: HighlightRect,
  isRtl = true,
  btnWidth = BTN_WIDTH,
  btnHeight = BTN_HEIGHT,
) => {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  // Vertical: float near upper edge of the highlight without obstructing reading line
  let top = rect.top - btnHeight / 2 - 2;

  // Horizontal: in RTL, place near top-left (end of Persian reading flow); in LTR, near top-right
  let left: number;
  if (isRtl) {
    left = rect.left - btnWidth / 2;
  } else {
    left = rect.right - btnWidth / 2;
  }

  // Safety clamps within viewport margins (prevents overflowing off screen on mobile)
  left = Math.max(8, Math.min(viewportWidth - btnWidth - 8, left));
  top = Math.max(8, Math.min(viewportHeight - btnHeight - 8, top));

  return { top, left };
};

export function LessonHighlightDeleteButton({
  annotationId,
  targetRect,
  isRtl = true,
  onDelete,
  onClose,
  getLatestRect,
}: LessonHighlightDeleteButtonProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [currentRect, setCurrentRect] = useState<HighlightRect>(targetRect);
  const [coords, setCoords] = useState<{ top: number; left: number }>(() =>
    computeDeleteButtonCoords(targetRect, isRtl),
  );

  // Keep rect updated if targetRect prop changes
  useEffect(() => {
    setCurrentRect(targetRect);
    setCoords(computeDeleteButtonCoords(targetRect, isRtl));
  }, [targetRect, isRtl]);

  // Dynamic positioning on scroll & resize
  const updatePosition = useCallback(() => {
    let rectToUse = currentRect;
    if (getLatestRect) {
      const freshRect = getLatestRect();
      if (freshRect) {
        rectToUse = freshRect;
        setCurrentRect(freshRect);
      }
    }

    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
    // If scrolled completely out of view, close
    if (rectToUse.bottom < 10 || rectToUse.top > viewportHeight - 10) {
      onClose();
      return;
    }

    setCoords(computeDeleteButtonCoords(rectToUse, isRtl));
  }, [currentRect, isRtl, getLatestRect, onClose]);

  useEffect(() => {
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  // Click outside listener
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore if clicking the button itself
      if (btnRef.current && btnRef.current.contains(target)) {
        return;
      }

      // Ignore if clicking the highlight mark itself (which toggles or re-anchors)
      const clickedMark = target.closest("mark[data-avana-annotation]");
      if (
        clickedMark &&
        clickedMark.getAttribute("data-avana-annotation") === annotationId
      ) {
        return;
      }

      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [annotationId, onClose]);

  // Escape key dismiss listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleDelete = (e: React.MouseEvent) => {
    // Crucial: preserve selection & avoid triggering selection toolbar
    e.preventDefault();
    e.stopPropagation();
    onDelete(annotationId);
  };

  const content = (
    <button
      ref={btnRef}
      type="button"
      data-testid="delete-highlight-button"
      data-annotation-id={annotationId}
      aria-label="حذف هایلایت"
      title="حذف هایلایت"
      onMouseDown={(e) => {
        // Prevent loss of browser selection or event bubbling
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={handleDelete}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 1350,
      }}
      className="w-6 h-6 min-w-[24px] min-h-[24px] p-0 flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xs hover:shadow-sm text-gray-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-300 dark:hover:border-rose-800 transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1 select-none animate-in fade-in zoom-in-90"
    >
      <X className="w-3.5 h-3.5 stroke-[2.2]" />
    </button>
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(content, document.body);
}
