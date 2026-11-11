/**
 * LessonInteractiveContent — Domain Wrapper for interactive lesson reading in AVANA.
 *
 * Coordinates:
 * - Markdown & KaTeX rendering via MarkdownRenderer
 * - Real-time text selection detection & floating selection toolbar
 * - Resilient text highlight and note restoration
 * - 5 contextual actions: Ask Avana, Explain Simply, Highlight, Note, Report Issue
 */

import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { BookOpen } from "lucide-react";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import { useTextSelection, type TextSelectionData } from "../../hooks/useTextSelection.js";
import { useLessonAnnotations } from "../../hooks/useLessonAnnotations.js";
import { LessonSelectionToolbar } from "./LessonSelectionToolbar.js";
import { AskAvanaSelectionDialog } from "./AskAvanaSelectionDialog.js";
import { ExplainSimplyDialog } from "./ExplainSimplyDialog.js";
import { LessonNoteDialog } from "./LessonNoteDialog.js";
import { LessonNoteHoverCard } from "./LessonNoteHoverCard.js";
import { LessonHighlightDeleteButton } from "./LessonHighlightDeleteButton.js";
import { ReportIssueDialog } from "./ReportIssueDialog.js";
import { getTextNodeEntries } from "../../utils/selectionNormalization.js";
import {
  isValidHighlightColor,
  getStoredHighlightColor,
  normalizeHighlightColor,
} from "./highlightColors.js";
import type { LessonAnnotationResource, ContentReportCategory } from "@avana/contracts";

export interface LessonInteractiveContentProps {
  lessonId: string;
  courseId?: string;
  lessonTitle: string;
  moduleTitle?: string;
  courseTitle?: string;
  content: string;
  reference?: string | null;
  className?: string;
  onAskAvana?: (selection: TextSelectionData) => void;
  onExplainSimply?: (selection: TextSelectionData) => void;
}

export function LessonInteractiveContent({
  lessonId,
  courseId,
  lessonTitle,
  moduleTitle,
  courseTitle,
  content,
  reference,
  className = "",
  onAskAvana,
  onExplainSimply,
}: LessonInteractiveContentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Hook for text selection
  const { selectionData, clearSelection } = useTextSelection(containerRef);

  // Hook for lesson annotations
  const {
    annotations,
    createAnnotationAsync,
    updateAnnotationAsync,
    deleteAnnotationAsync,
    createReportAsync,
    isCreating,
    isUpdating,
    isDeleting,
  } = useLessonAnnotations(lessonId);

  // Active dialog states
  const [isAskAvanaOpen, setIsAskAvanaOpen] = useState(false);
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<LessonAnnotationResource | null>(null);
  const [activeSelectionForModal, setActiveSelectionForModal] = useState<TextSelectionData | null>(null);

  const isAnyDialogOpen =
    isAskAvanaOpen || isExplainOpen || isNoteOpen || isReportOpen;

  // Hovered Note State for floating note preview
  const [hoveredNote, setHoveredNote] = useState<{
    annotation: LessonAnnotationResource;
    targetRect: {
      top: number;
      bottom: number;
      left: number;
      right: number;
      width: number;
      height: number;
    };
  } | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeNoteMarkRef = useRef<HTMLElement | null>(null);

  // Active Highlight Delete Quick Action State
  const [activeHighlightForDelete, setActiveHighlightForDelete] = useState<{
    annotationId: string;
    targetRect: {
      top: number;
      bottom: number;
      left: number;
      right: number;
      width: number;
      height: number;
    };
    isRtl: boolean;
  } | null>(null);

  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleCloseTimer = useCallback((delayMs = 150) => {
    cancelCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setHoveredNote(null);
      activeNoteMarkRef.current = null;
      closeTimerRef.current = null;
    }, delayMs);
  }, [cancelCloseTimer]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // Dismiss hover card & delete button if any dialog opens or active text selection starts
  useEffect(() => {
    if (isAnyDialogOpen || selectionData) {
      cancelCloseTimer();
      setHoveredNote(null);
      activeNoteMarkRef.current = null;
      setActiveHighlightForDelete(null);
    }
  }, [isAnyDialogOpen, selectionData, cancelCloseTimer]);

  // If the active highlight being deleted was removed, reset active state
  useEffect(() => {
    if (activeHighlightForDelete) {
      const stillExists = annotations.some(
        (a) => a.id === activeHighlightForDelete.annotationId,
      );
      if (!stillExists) {
        setActiveHighlightForDelete(null);
      }
    }
  }, [annotations, activeHighlightForDelete]);

  // Handlers from toolbar
  const handleAskAvana = (sel: TextSelectionData) => {
    if (onAskAvana) {
      const preservedSelection = { ...sel };
      clearSelection();
      onAskAvana(preservedSelection);
      return;
    }
    setActiveSelectionForModal(sel);
    setIsAskAvanaOpen(true);
  };

  const handleExplainSimply = (sel: TextSelectionData) => {
    if (onExplainSimply) {
      const preservedSelection = { ...sel };
      clearSelection();
      onExplainSimply(preservedSelection);
      return;
    }
    setActiveSelectionForModal(sel);
    setIsExplainOpen(true);
  };

  const handleHighlight = async (sel: TextSelectionData, color?: string) => {
    try {
      const colorToUse = isValidHighlightColor(color) ? color : getStoredHighlightColor();
      await createAnnotationAsync({
        type: "highlight",
        selectedText: sel.selectedText,
        prefix: sel.prefix,
        suffix: sel.suffix,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
        color: colorToUse,
      });
      clearSelection();
    } catch (err) {
      /* eslint-disable-next-line no-console */
      console.error("[annotation-create-error]", err);
    }
  };

  // Robust intersection check between current selection and existing highlights
  const isSelectionIntersectingHighlight = useMemo(() => {
    if (!selectionData || !annotations || annotations.length === 0) {
      return false;
    }

    const highlights = annotations.filter((a) => a.type === "highlight");
    if (highlights.length === 0) {
      return false;
    }

    const sStart = selectionData.startOffset;
    const sEnd = selectionData.endOffset;

    // Layer 1: Canonical offset overlap & substring check
    for (const h of highlights) {
      if (typeof h.startOffset === "number" && typeof h.endOffset === "number") {
        if (Math.max(sStart, h.startOffset) < Math.min(sEnd, h.endOffset)) {
          return true;
        }
      } else if (
        h.selectedText &&
        selectionData.selectedText &&
        (h.selectedText.includes(selectionData.selectedText) ||
          selectionData.selectedText.includes(h.selectedText))
      ) {
        return true;
      }
    }

    // Layer 2: Live DOM Range intersection with mark.avana-highlight elements
    if (typeof window !== "undefined") {
      const windowSel = window.getSelection();
      if (windowSel && windowSel.rangeCount > 0 && containerRef.current) {
        const range = windowSel.getRangeAt(0);
        const marks = containerRef.current.querySelectorAll("mark.avana-highlight");
        for (let i = 0; i < marks.length; i++) {
          try {
            if (range.intersectsNode(marks[i])) {
              return true;
            }
          } catch {
            // Ignore edge-case DOM error
          }
        }
      }
    }

    return false;
  }, [selectionData, annotations]);

  const handleAddNote = (sel: TextSelectionData) => {
    setActiveSelectionForModal(sel);
    setSelectedAnnotation(null);
    setIsNoteOpen(true);
  };

  const handleReportIssue = (sel: TextSelectionData) => {
    setActiveSelectionForModal(sel);
    setIsReportOpen(true);
  };

  // Restore highlights and notes in the DOM with resilient multi-node anchoring
  const applyAnnotationsToDOM = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Clean previous mark wrappers without losing text content
    const existingMarks = container.querySelectorAll("mark[data-avana-annotation]");
    existingMarks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    });

    if (!annotations || annotations.length === 0) return;

    // Sort annotations by startOffset descending to safely mutate DOM from bottom to top
    const sortedAnnotations = [...annotations].sort((a, b) => {
      const offA = typeof a.startOffset === "number" ? a.startOffset : 0;
      const offB = typeof b.startOffset === "number" ? b.startOffset : 0;
      return offB - offA;
    });

    for (const ann of sortedAnnotations) {
      const targetText = ann.selectedText;
      if (!targetText || targetText.trim().length === 0) continue;

      const { entries, fullText: fullContentText } = getTextNodeEntries(container);
      if (!fullContentText || entries.length === 0) continue;

      let matchStart = -1;
      let matchEnd = -1;

      // Strategy 1: Check direct startOffset / endOffset match
      if (typeof ann.startOffset === "number") {
        const directSlice = fullContentText.slice(
          ann.startOffset,
          ann.startOffset + targetText.length,
        );
        if (directSlice === targetText) {
          matchStart = ann.startOffset;
          matchEnd = ann.startOffset + targetText.length;
        } else if (
          typeof ann.endOffset === "number" &&
          fullContentText.slice(ann.startOffset, ann.endOffset) === targetText
        ) {
          matchStart = ann.startOffset;
          matchEnd = ann.endOffset;
        }
      }

      // Strategy 2: Prefix + Target + Suffix context anchoring
      if (matchStart === -1) {
        if (ann.prefix && ann.suffix) {
          const contextPattern = ann.prefix + targetText + ann.suffix;
          const idx = fullContentText.indexOf(contextPattern);
          if (idx !== -1) {
            matchStart = idx + ann.prefix.length;
            matchEnd = matchStart + targetText.length;
          }
        }
        if (matchStart === -1 && ann.prefix) {
          const prefPattern = ann.prefix + targetText;
          const idx = fullContentText.indexOf(prefPattern);
          if (idx !== -1) {
            matchStart = idx + ann.prefix.length;
            matchEnd = matchStart + targetText.length;
          }
        }
        if (matchStart === -1 && ann.suffix) {
          const suffPattern = targetText + ann.suffix;
          const idx = fullContentText.indexOf(suffPattern);
          if (idx !== -1) {
            matchStart = idx;
            matchEnd = matchStart + targetText.length;
          }
        }
      }

      // Strategy 3: Target string search with nearest offset proximity
      if (matchStart === -1) {
        const searchStr = targetText.trim();
        let bestIdx = -1;
        let minDiff = Infinity;
        let searchFrom = 0;

        while ((searchFrom = fullContentText.indexOf(searchStr, searchFrom)) !== -1) {
          const diff = Math.abs(searchFrom - (ann.startOffset ?? 0));
          if (diff < minDiff) {
            minDiff = diff;
            bestIdx = searchFrom;
          }
          searchFrom += searchStr.length || 1;
        }

        if (bestIdx !== -1) {
          matchStart = bestIdx;
          matchEnd = bestIdx + searchStr.length;
        }
      }

      if (matchStart === -1 || matchEnd <= matchStart) continue;

      // Find all text node entries that intersect [matchStart, matchEnd]
      const intersecting = entries.filter(
        (e) => e.end > matchStart && e.start < matchEnd,
      );

      // Filter entries that have a valid slice to wrap
      const validEntries = intersecting.filter((entry) => {
        const nodeTextLen = entry.node.textContent?.length || 0;
        const nodeSliceStart = Math.max(0, matchStart - entry.start);
        const nodeSliceEnd = Math.min(nodeTextLen, matchEnd - entry.start);
        return nodeSliceStart < nodeSliceEnd;
      });

      const totalSegments = validEntries.length;

      // Wrap each intersecting text node slice safely using native splitText
      for (let i = 0; i < totalSegments; i++) {
        const entry = validEntries[i];
        const nodeTextLen = entry.node.textContent?.length || 0;
        const nodeSliceStart = Math.max(0, matchStart - entry.start);
        const nodeSliceEnd = Math.min(nodeTextLen, matchEnd - entry.start);

        if (nodeSliceStart >= nodeSliceEnd) continue;

        try {
          const mark = document.createElement("mark");
          mark.setAttribute("data-avana-annotation", ann.id);
          mark.setAttribute("data-annotation-type", ann.type);

          if (totalSegments === 1) {
            mark.setAttribute("data-mark-pos", "single");
          } else if (i === 0) {
            mark.setAttribute("data-mark-pos", "start");
          } else if (i === totalSegments - 1) {
            mark.setAttribute("data-mark-pos", "end");
          } else {
            mark.setAttribute("data-mark-pos", "middle");
          }

          if (ann.type === "highlight") {
            mark.className = "avana-highlight";
            mark.setAttribute("data-color", normalizeHighlightColor(ann.color));
            mark.tabIndex = 0;
            mark.setAttribute("role", "button");
            mark.setAttribute("aria-label", `هایلایت: ${ann.selectedText}`);
          } else {
            mark.className = "avana-note";
            mark.tabIndex = 0;
            mark.setAttribute("role", "button");
            mark.setAttribute(
              "aria-label",
              `یادداشت: ${ann.noteText || ann.selectedText}`,
            );
          }

          const parent = entry.node.parentNode;
          if (!parent) continue;

          let targetNode: Text;
          if (nodeSliceStart > 0) {
            targetNode = entry.node.splitText(nodeSliceStart);
          } else {
            targetNode = entry.node;
          }

          const lengthToWrap = nodeSliceEnd - nodeSliceStart;
          if (targetNode.length > lengthToWrap) {
            targetNode.splitText(lengthToWrap);
          }

          parent.insertBefore(mark, targetNode);
          mark.appendChild(targetNode);
        } catch {
          // Gracefully continue on any single node error
        }
      }
    }
  }, [annotations]);

  useLayoutEffect(() => {
    applyAnnotationsToDOM();
  }, [applyAnnotationsToDOM, content]);

  const memoizedRenderer = React.useMemo(
    () => <MarkdownRenderer content={content} enableLessonCallouts />,
    [content],
  );

  // Hover & Focus Target Detection for Notes
  const handleTargetOver = useCallback(
    (target: HTMLElement, isTouch = false) => {
      if (isTouch) return;
      if (typeof window !== "undefined" && window.matchMedia) {
        const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
        const isTestEnv =
          process.env.NODE_ENV === "test" ||
          typeof (globalThis as Record<string, unknown>).vi !== "undefined";
        if (!mq.matches && !isTestEnv) {
          return;
        }
      }

      const mark = target.closest<HTMLElement>("mark[data-avana-annotation]");
      if (!mark) return;

      const annotationId = mark.getAttribute("data-avana-annotation");
      if (!annotationId) return;

      const ann = annotations.find((a) => a.id === annotationId && a.type === "note");
      if (!ann) return;

      cancelCloseTimer();

      // If moving between segments of the same note, keep active and don't re-trigger
      if (hoveredNote && hoveredNote.annotation.id === ann.id) {
        activeNoteMarkRef.current = mark;
        return;
      }

      activeNoteMarkRef.current = mark;
      const rect = mark.getBoundingClientRect();
      setHoveredNote({
        annotation: ann,
        targetRect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
      });
    },
    [annotations, cancelCloseTimer, hoveredNote],
  );

  const handleContainerPointerOver = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    handleTargetOver(e.target as HTMLElement, false);
  };

  const handleContainerPointerOut = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const currentMark = (e.target as HTMLElement).closest<HTMLElement>(
      "mark[data-avana-annotation]",
    );
    if (!currentMark) return;

    const related = e.relatedTarget as HTMLElement | null;
    if (related) {
      const nextMark = related.closest<HTMLElement>("mark[data-avana-annotation]");
      if (
        nextMark &&
        nextMark.getAttribute("data-avana-annotation") ===
          currentMark.getAttribute("data-avana-annotation")
      ) {
        return;
      }
      if (related.closest("[data-testid='lesson-note-hover-card']")) {
        return;
      }
    }
    scheduleCloseTimer(150);
  };

  const handleContainerMouseOver = (e: React.MouseEvent) => {
    handleTargetOver(e.target as HTMLElement, false);
  };

  const handleContainerMouseOut = (e: React.MouseEvent) => {
    const currentMark = (e.target as HTMLElement).closest<HTMLElement>(
      "mark[data-avana-annotation]",
    );
    if (!currentMark) return;

    const related = e.relatedTarget as HTMLElement | null;
    if (related) {
      const nextMark = related.closest<HTMLElement>("mark[data-avana-annotation]");
      if (
        nextMark &&
        nextMark.getAttribute("data-avana-annotation") ===
          currentMark.getAttribute("data-avana-annotation")
      ) {
        return;
      }
      if (related.closest("[data-testid='lesson-note-hover-card']")) {
        return;
      }
    }
    scheduleCloseTimer(150);
  };

  const handleContainerFocusIn = (e: React.FocusEvent) => {
    handleTargetOver(e.target as HTMLElement, false);
  };

  const handleContainerFocusOut = (e: React.FocusEvent) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && related.closest("[data-testid='lesson-note-hover-card']")) {
      return;
    }
    scheduleCloseTimer(150);
  };

  const handleContainerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      const mark = (e.target as HTMLElement).closest<HTMLElement>(
        "mark[data-avana-annotation]",
      );
      if (!mark) return;
      const annotationId = mark.getAttribute("data-avana-annotation");
      if (!annotationId) return;
      const ann = annotations.find((a) => a.id === annotationId);
      if (!ann) return;
      e.preventDefault();
      cancelCloseTimer();
      setHoveredNote(null);
      if (ann.type === "note") {
        setActiveHighlightForDelete(null);
        setSelectedAnnotation(ann);
        setActiveSelectionForModal(null);
        setIsNoteOpen(true);
      } else if (ann.type === "highlight") {
        const rect = mark.getBoundingClientRect();
        const isRtl =
          typeof window !== "undefined"
            ? window.getComputedStyle(mark).direction === "rtl" ||
              document.documentElement.dir === "rtl" ||
              document.body.dir === "rtl"
            : true;
        setActiveHighlightForDelete({
          annotationId: ann.id,
          targetRect: {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
          isRtl,
        });
      }
    }
  };

  const handleEditFromHoverCard = (ann: LessonAnnotationResource) => {
    cancelCloseTimer();
    setHoveredNote(null);
    setSelectedAnnotation(ann);
    setActiveSelectionForModal(null);
    setIsNoteOpen(true);
  };

  // Reposition or close hover card on scroll / window resize
  useEffect(() => {
    if (!hoveredNote) return;

    const updatePositionOrClose = () => {
      const container = containerRef.current;
      if (!container) return;

      const mark = container.querySelector(
        `mark[data-avana-annotation="${hoveredNote.annotation.id}"]`,
      ) as HTMLElement | null;

      if (!mark) {
        setHoveredNote(null);
        return;
      }

      const rect = mark.getBoundingClientRect();
      const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

      if (rect.bottom < 50 || rect.top > viewportHeight - 50 || rect.width === 0) {
        setHoveredNote(null);
        return;
      }

      setHoveredNote((prev) =>
        prev
          ? {
              ...prev,
              targetRect: {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
              },
            }
          : null,
      );
    };

    window.addEventListener("scroll", updatePositionOrClose, true);
    window.addEventListener("resize", updatePositionOrClose);

    return () => {
      window.removeEventListener("scroll", updatePositionOrClose, true);
      window.removeEventListener("resize", updatePositionOrClose);
    };
  }, [hoveredNote?.annotation.id]);

  // Dismiss hover card on Escape key when active and no modal dialog is open
  useEffect(() => {
    if (!hoveredNote || isAnyDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelCloseTimer();
        setHoveredNote(null);
        activeNoteMarkRef.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hoveredNote, isAnyDialogOpen, cancelCloseTimer]);

  // Click on existing annotation marks
  const handleContainerClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("mark[data-avana-annotation]");
    if (!target) return;

    const annotationId = target.getAttribute("data-avana-annotation");
    if (!annotationId) return;

    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;

    cancelCloseTimer();
    setHoveredNote(null);

    if (ann.type === "note") {
      setActiveHighlightForDelete(null);
      setSelectedAnnotation(ann);
      setActiveSelectionForModal(null);
      setIsNoteOpen(true);
    } else if (ann.type === "highlight") {
      // Quick-delete floating X action — NO dialog/modal!
      const rect = target.getBoundingClientRect();
      const isRtl =
        typeof window !== "undefined"
          ? window.getComputedStyle(target).direction === "rtl" ||
            document.documentElement.dir === "rtl" ||
            document.body.dir === "rtl"
          : true;
      setActiveHighlightForDelete({
        annotationId: ann.id,
        targetRect: {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        },
        isRtl,
      });
    }
  };

  const handleDeleteHighlight = useCallback(
    async (annotationId: string) => {
      setActiveHighlightForDelete(null);
      try {
        await deleteAnnotationAsync(annotationId);
      } catch (err) {
        /* eslint-disable-next-line no-console */
        console.error("[highlight-delete-error]", err);
      }
    },
    [deleteAnnotationAsync],
  );

  const getLatestHighlightRect = useCallback(() => {
    if (!activeHighlightForDelete || !containerRef.current) return null;
    const mark = containerRef.current.querySelector(
      `mark[data-avana-annotation="${activeHighlightForDelete.annotationId}"]`,
    );
    if (!mark) return null;
    const r = mark.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    };
  }, [activeHighlightForDelete]);

  return (
    <div className={`relative ${className}`}>
      {/* Lesson Content Container */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        onPointerOver={handleContainerPointerOver}
        onPointerOut={handleContainerPointerOut}
        onMouseOver={handleContainerMouseOver}
        onMouseOut={handleContainerMouseOut}
        onFocusCapture={handleContainerFocusIn}
        onBlurCapture={handleContainerFocusOut}
        onKeyDown={handleContainerKeyDown}
        className="select-text focus:outline-none"
      >
        {memoizedRenderer}
      </div>

      {/* Lesson Reference Section (Displayed only when reference is provided and non-empty) */}
      {reference && reference.trim().length > 0 && (
        <div
          data-testid="lesson-reference-section"
          className="mt-8 pt-5 border-t border-[var(--color-border)] not-prose"
        >
          <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)] flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary dark:text-teal-300 shrink-0 mt-0.5">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="text-xs font-bold text-[var(--color-text)] block">
                رفرنس
              </span>
              <p
                data-testid="lesson-reference-text"
                className="text-xs text-[var(--color-text-secondary)] leading-relaxed font-medium break-words select-text"
              >
                {reference.trim()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Floating Selection Toolbar */}
      {!isAnyDialogOpen && selectionData && (
        <LessonSelectionToolbar
          selectionData={selectionData}
          onAskAvana={handleAskAvana}
          onExplainSimply={handleExplainSimply}
          onHighlight={handleHighlight}
          onAddNote={handleAddNote}
          onReportIssue={handleReportIssue}
          onClose={clearSelection}
          isHighlighting={isCreating}
          canAddNote={!isSelectionIntersectingHighlight}
        />
      )}

      {/* Floating Note Hover Card */}
      {!isAnyDialogOpen && !selectionData && hoveredNote && (
        <LessonNoteHoverCard
          annotation={hoveredNote.annotation}
          targetRect={hoveredNote.targetRect}
          onEdit={handleEditFromHoverCard}
          onMouseEnter={cancelCloseTimer}
          onMouseLeave={() => scheduleCloseTimer(150)}
        />
      )}

      {/* Floating Highlight Delete Action */}
      {!isAnyDialogOpen && activeHighlightForDelete && (
        <LessonHighlightDeleteButton
          annotationId={activeHighlightForDelete.annotationId}
          targetRect={activeHighlightForDelete.targetRect}
          isRtl={activeHighlightForDelete.isRtl}
          onDelete={handleDeleteHighlight}
          onClose={() => setActiveHighlightForDelete(null)}
          getLatestRect={getLatestHighlightRect}
        />
      )}

      {/* 1. Ask Avana Modal */}
      <AskAvanaSelectionDialog
        isOpen={isAskAvanaOpen}
        onClose={() => {
          setIsAskAvanaOpen(false);
          clearSelection();
        }}
        selectionData={activeSelectionForModal}
        lessonId={lessonId}
        courseId={courseId}
        lessonTitle={lessonTitle}
        moduleTitle={moduleTitle}
        courseTitle={courseTitle}
      />

      {/* 2. Explain Simply Modal */}
      <ExplainSimplyDialog
        isOpen={isExplainOpen}
        onClose={() => {
          setIsExplainOpen(false);
          clearSelection();
        }}
        selectionData={activeSelectionForModal}
        lessonId={lessonId}
        courseId={courseId}
      />

      {/* 3 & 4. Note Modal (Add, View, Edit, Delete) */}
      <LessonNoteDialog
        isOpen={isNoteOpen}
        onClose={() => {
          setIsNoteOpen(false);
          setSelectedAnnotation(null);
          clearSelection();
        }}
        selectionData={activeSelectionForModal}
        existingNote={selectedAnnotation}
        isSaving={isCreating || isUpdating || isDeleting}
        onSave={async (noteText) => {
          if (selectedAnnotation) {
            // Highlights do not accept notes
            if (selectedAnnotation.type === "highlight") {
              return;
            }
            await updateAnnotationAsync({
              annotationId: selectedAnnotation.id,
              request: { noteText },
            });
          } else if (activeSelectionForModal) {
            await createAnnotationAsync({
              type: "note",
              selectedText: activeSelectionForModal.selectedText,
              prefix: activeSelectionForModal.prefix,
              suffix: activeSelectionForModal.suffix,
              startOffset: activeSelectionForModal.startOffset,
              endOffset: activeSelectionForModal.endOffset,
              noteText,
            });
          }
        }}
        onDelete={
          selectedAnnotation
            ? async () => {
                await deleteAnnotationAsync(selectedAnnotation.id);
              }
            : undefined
        }
      />

      {/* 5. Report Issue Modal */}
      <ReportIssueDialog
        isOpen={isReportOpen}
        onClose={() => {
          setIsReportOpen(false);
          clearSelection();
        }}
        selectionData={activeSelectionForModal}
        onSubmit={async ({ category, comment }) => {
          if (!activeSelectionForModal) return;
          await createReportAsync({
            selectedText: activeSelectionForModal.selectedText,
            category: category as ContentReportCategory,
            comment,
            courseId,
          });
        }}
      />
    </div>
  );
}
