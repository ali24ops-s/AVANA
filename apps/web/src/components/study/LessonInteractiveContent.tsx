/**
 * LessonInteractiveContent — Domain Wrapper for interactive lesson reading in AVANA.
 *
 * Coordinates:
 * - Markdown & KaTeX rendering via MarkdownRenderer
 * - Real-time text selection detection & floating selection toolbar
 * - Resilient text highlight and note restoration
 * - 5 contextual actions: Ask Avana, Explain Simply, Highlight, Note, Report Issue
 */

import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from "react";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import { useTextSelection, type TextSelectionData } from "../../hooks/useTextSelection.js";
import { useLessonAnnotations } from "../../hooks/useLessonAnnotations.js";
import { LessonSelectionToolbar } from "./LessonSelectionToolbar.js";
import { AskAvanaSelectionDialog } from "./AskAvanaSelectionDialog.js";
import { ExplainSimplyDialog } from "./ExplainSimplyDialog.js";
import { LessonNoteDialog } from "./LessonNoteDialog.js";
import { ReportIssueDialog } from "./ReportIssueDialog.js";
import type { LessonAnnotationResource, ContentReportCategory } from "@avana/contracts";

export interface LessonInteractiveContentProps {
  lessonId: string;
  courseId?: string;
  lessonTitle: string;
  moduleTitle?: string;
  courseTitle?: string;
  content: string;
  className?: string;
}

export function LessonInteractiveContent({
  lessonId,
  courseId,
  lessonTitle,
  moduleTitle,
  courseTitle,
  content,
  className = "",
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

  // Handlers from toolbar
  const handleAskAvana = (sel: TextSelectionData) => {
    setActiveSelectionForModal(sel);
    setIsAskAvanaOpen(true);
  };

  const handleExplainSimply = (sel: TextSelectionData) => {
    setActiveSelectionForModal(sel);
    setIsExplainOpen(true);
  };

  const handleHighlight = async (sel: TextSelectionData) => {
    try {
      console.log("[annotation-create-request]", {
        selectedText: sel.selectedText,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
      });
      const res = await createAnnotationAsync({
        type: "highlight",
        selectedText: sel.selectedText,
        prefix: sel.prefix,
        suffix: sel.suffix,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
        color: "default",
      });
      console.log("[annotation-create-response]", res);
      clearSelection();
    } catch (err) {
      console.error("[annotation-create-error]", err);
    }
  };

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
        console.log("[mark-removed]", { id: mark.getAttribute("data-avana-annotation") });
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    });

    console.log("[apply-annotations]", { count: annotations.length, annotations });
    if (!annotations || annotations.length === 0) return;

    // Helper: collect content text nodes and build character index map
    const getTextNodeEntries = () => {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
      );

      const entries: Array<{ node: Text; start: number; end: number }> = [];
      let currentOffset = 0;
      let currentNode = walker.nextNode() as Text | null;

      while (currentNode) {
        const parent = currentNode.parentElement;
        if (parent && ["PRE", "CODE", "SCRIPT", "STYLE"].includes(parent.tagName)) {
          currentNode = walker.nextNode() as Text | null;
          continue;
        }
        const len = currentNode.textContent?.length || 0;
        entries.push({
          node: currentNode,
          start: currentOffset,
          end: currentOffset + len,
        });
        currentOffset += len;
        currentNode = walker.nextNode() as Text | null;
      }

      const fullContentText = entries.map((e) => e.node.textContent || "").join("");
      return { entries, fullContentText };
    };

    // Sort annotations by startOffset descending to safely mutate DOM from bottom to top
    const sortedAnnotations = [...annotations].sort((a, b) => {
      const offA = typeof a.startOffset === "number" ? a.startOffset : 0;
      const offB = typeof b.startOffset === "number" ? b.startOffset : 0;
      return offB - offA;
    });

    for (const ann of sortedAnnotations) {
      const targetText = ann.selectedText;
      if (!targetText || targetText.trim().length === 0) continue;

      const { entries, fullContentText } = getTextNodeEntries();
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

      // Wrap each intersecting text node slice safely using native splitText
      for (const entry of intersecting) {
        const nodeTextLen = entry.node.textContent?.length || 0;
        const nodeSliceStart = Math.max(0, matchStart - entry.start);
        const nodeSliceEnd = Math.min(nodeTextLen, matchEnd - entry.start);

        if (nodeSliceStart >= nodeSliceEnd) continue;

        try {
          const mark = document.createElement("mark");
          mark.setAttribute("data-avana-annotation", ann.id);
          mark.setAttribute("data-annotation-type", ann.type);

          if (ann.type === "highlight") {
            mark.className = "avana-highlight";
          } else {
            mark.className = "avana-note";
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
          console.log("[mark-created]", { id: ann.id, type: ann.type, text: ann.selectedText });
        } catch {
          // Gracefully continue on any single node error
        }
      }
    }
  }, [annotations]);

  useLayoutEffect(() => {
    applyAnnotationsToDOM();
  });

  const memoizedRenderer = React.useMemo(
    () => <MarkdownRenderer content={content} enableLessonCallouts />,
    [content],
  );

  // Click on existing annotation marks
  const handleContainerClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("mark[data-avana-annotation]");
    if (!target) return;

    const annotationId = target.getAttribute("data-avana-annotation");
    if (!annotationId) return;

    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;

    if (ann.type === "note") {
      setSelectedAnnotation(ann);
      setActiveSelectionForModal(null);
      setIsNoteOpen(true);
    } else if (ann.type === "highlight") {
      // Clicking highlight allows removing it or adding a note to it
      setSelectedAnnotation(ann);
      setActiveSelectionForModal({
        selectedText: ann.selectedText,
        prefix: ann.prefix || "",
        suffix: ann.suffix || "",
        startOffset: ann.startOffset || 0,
        endOffset: ann.endOffset || 0,
        rect: target.getBoundingClientRect(),
      });
      setIsNoteOpen(true);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Lesson Content Container */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className="select-text focus:outline-none"
      >
        {memoizedRenderer}
      </div>

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
