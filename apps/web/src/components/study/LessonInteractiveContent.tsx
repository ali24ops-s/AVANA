/**
 * LessonInteractiveContent — Domain Wrapper for interactive lesson reading in AVANA.
 *
 * Coordinates:
 * - Markdown & KaTeX rendering via MarkdownRenderer
 * - Real-time text selection detection & floating selection toolbar
 * - Resilient text highlight and note restoration
 * - 5 contextual actions: Ask Avana, Explain Simply, Highlight, Note, Report Issue
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
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
  } = useLessonAnnotations(lessonId);

  // Active dialog states
  const [isAskAvanaOpen, setIsAskAvanaOpen] = useState(false);
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<LessonAnnotationResource | null>(null);
  const [activeSelectionForModal, setActiveSelectionForModal] = useState<TextSelectionData | null>(null);

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
      await createAnnotationAsync({
        type: "highlight",
        selectedText: sel.selectedText,
        prefix: sel.prefix,
        suffix: sel.suffix,
        startOffset: sel.startOffset,
        endOffset: sel.endOffset,
        color: "default",
      });
      clearSelection();
    } catch {
      // Ignore or let React Query handle error state
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

  // Restore highlights and notes in the DOM
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

    // 2. Iterate through annotations and highlight matching text nodes
    for (const ann of annotations) {
      const targetText = ann.selectedText.trim();
      if (!targetText) continue;

      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const parent = node.parentElement;
            // Skip code blocks, pre, and script tags
            if (parent && ["PRE", "CODE", "SCRIPT", "STYLE"].includes(parent.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      let textNode = walker.nextNode();
      let matched = false;

      while (textNode && !matched) {
        const nodeVal = textNode.nodeValue || "";
        const index = nodeVal.indexOf(targetText);

        if (index !== -1) {
          try {
            const range = document.createRange();
            range.setStart(textNode, index);
            range.setEnd(textNode, index + targetText.length);

            const mark = document.createElement("mark");
            mark.setAttribute("data-avana-annotation", ann.id);
            mark.setAttribute("data-annotation-type", ann.type);

            if (ann.type === "highlight") {
              mark.className =
                "avana-highlight bg-[var(--avana-highlight-bg)] text-[var(--color-text)] border-b-2 border-[var(--avana-highlight-border)] rounded-[2px] transition-colors hover:bg-[var(--avana-highlight-hover)] cursor-pointer px-0.5";
            } else {
              mark.className =
                "avana-note bg-[var(--avana-note-bg)] text-[var(--color-text)] border-b-2 border-[var(--avana-note-border)] rounded-[2px] transition-colors cursor-pointer px-0.5 relative";
            }

            range.surroundContents(mark);
            matched = true;
          } catch {
            // If surroundContents fails due to cross-node boundary, skip gracefully
            break;
          }
        }
        textNode = walker.nextNode();
      }
    }
  }, [annotations]);

  useEffect(() => {
    // Apply highlights after Markdown has rendered
    const timer = setTimeout(applyAnnotationsToDOM, 50);
    return () => clearTimeout(timer);
  }, [annotations, content, applyAnnotationsToDOM]);

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

  const isAnyDialogOpen =
    isAskAvanaOpen || isExplainOpen || isNoteOpen || isReportOpen;

  return (
    <div className={`relative ${className}`}>
      {/* Lesson Content Container */}
      <div
        ref={containerRef}
        onClick={handleContainerClick}
        className="select-text focus:outline-none"
      >
        <MarkdownRenderer content={content} enableLessonCallouts />
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
