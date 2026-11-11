/**
 * LessonNoteHoverCard — Floating Card displaying personal note content on hover.
 *
 * Responsibilities:
 * - Displays note content in a floating popover positioned near the annotated text.
 * - Preserves formatting, line breaks (whitespace-pre-wrap), and word wrapping (break-words).
 * - Enforces max-height with internal scrollbar for long notes.
 * - Header with Lucide StickyNote icon, "یادداشت شما" title, and accessible "ویرایش" button.
 * - Follows AVANA Design System tokens and dark/light mode compatibility.
 * - Responds to mouse enter/leave to support grace delays.
 * - Renders into document.body via createPortal to prevent clipping by transformed parents.
 * - Immediate initial coordinate computation prevents (0, 0) flicker.
 * - Observes size changes via ResizeObserver for responsive recalculation.
 */

import React, { useLayoutEffect, useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { StickyNote, Pencil } from "lucide-react";
import type { LessonAnnotationResource } from "@avana/contracts";

export interface LessonNoteHoverCardProps {
  annotation: LessonAnnotationResource;
  targetRect: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
  onEdit: (annotation: LessonAnnotationResource) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const computeCardCoords = (
  targetRect: LessonNoteHoverCardProps["targetRect"],
  measuredWidth = 320,
  measuredHeight = 140,
) => {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  // Horizontal centering relative to target, clamped inside viewport margins
  let left = targetRect.left + targetRect.width / 2 - measuredWidth / 2;
  left = Math.max(16, Math.min(viewportWidth - measuredWidth - 16, left));

  // Vertical placement: prefer above target; if space is tight (< 70px), place below
  let top = targetRect.top - measuredHeight - 8;
  if (top < 70) {
    top = targetRect.bottom + 8;
  }

  // Ensure it doesn't overflow the bottom of the viewport
  if (top + measuredHeight > viewportHeight - 16) {
    top = Math.max(16, viewportHeight - measuredHeight - 16);
  }

  return { top, left };
};

export function LessonNoteHoverCard({
  annotation,
  targetRect,
  onEdit,
  onMouseEnter,
  onMouseLeave,
}: LessonNoteHoverCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Compute initial position immediately from targetRect so it never mounts at (0, 0)
  const [coords, setCoords] = useState<{ top: number; left: number }>(() =>
    computeCardCoords(targetRect, 320, 140),
  );

  const updatePosition = useCallback(() => {
    const card = cardRef.current;
    const cardWidth = card?.offsetWidth || 320;
    const cardHeight = card?.offsetHeight || 140;
    const newCoords = computeCardCoords(targetRect, cardWidth, cardHeight);
    setCoords(newCoords);
  }, [targetRect]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, annotation.id, annotation.noteText]);

  // Recalculate when actual content dimensions or fonts change
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updatePosition();
    });

    observer.observe(card);

    return () => {
      observer.disconnect();
    };
  }, [updatePosition]);

  const noteText = annotation.noteText || "";

  const cardElement = (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="یادداشت شما"
      data-testid="lesson-note-hover-card"
      dir="rtl"
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="z-[1300] w-[300px] sm:w-[340px] max-w-[calc(100vw-32px)] p-3.5 sm:p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 pointer-events-auto select-text"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <StickyNote className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-[var(--color-text)] truncate">
            یادداشت شما
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(annotation);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 active:scale-95 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label="ویرایش یادداشت"
        >
          <Pencil className="w-3 h-3" />
          <span>ویرایش</span>
        </button>
      </div>

      {/* Note Content */}
      <div
        data-testid="lesson-note-hover-content"
        className="text-xs sm:text-[13px] text-[var(--color-text)] leading-relaxed font-normal whitespace-pre-wrap break-words max-h-[190px] overflow-y-auto custom-scrollbar"
      >
        {noteText || (
          <span className="text-[var(--color-text-muted)] italic">
            (متن یادداشت خالی است)
          </span>
        )}
      </div>
    </div>
  );

  // Render via portal to body to prevent stacking context clipping
  if (typeof document !== "undefined" && document.body) {
    return createPortal(cardElement, document.body);
  }

  return cardElement;
}
