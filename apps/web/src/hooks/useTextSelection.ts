/**
 * Robust text selection hook for lesson content.
 *
 * Tracks:
 * - Selected text
 * - Prefix & Suffix context (for resilient anchoring)
 * - Canonical text start & end offsets within container
 * - Screen coordinates (DOMRect) for floating toolbar positioning
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getTextNodeEntries,
  getCharacterOffsetInContainer,
  expandOffsetsToWordBoundaries,
  createRangeFromOffsets,
} from "../utils/selectionNormalization.js";

export interface TextSelectionData {
  selectedText: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [selectionData, setSelectionData] = useState<TextSelectionData | null>(null);
  const isMouseDownRef = useRef(false);
  const isNormalizingRef = useRef(false);
  const lastSelectionRef = useRef<{
    selectedText: string;
    startOffset: number;
    endOffset: number;
    rect: { top: number; left: number; width: number; height: number };
  } | null>(null);

  const updateSelection = useCallback(() => {
    if (isMouseDownRef.current || isNormalizingRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null;
        setSelectionData(null);
      }
      return;
    }

    const container = containerRef.current;
    if (!container) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null;
        setSelectionData(null);
      }
      return;
    }

    const range = sel.getRangeAt(0);

    // Ensure the selection intersects or is inside the container
    if (
      !container.contains(range.commonAncestorContainer) &&
      !range.intersectsNode(container)
    ) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null;
        setSelectionData(null);
      }
      return;
    }

    // Extract canonical text entries and unified content string
    const { entries, fullText } = getTextNodeEntries(container);
    if (!fullText || entries.length === 0) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null;
        setSelectionData(null);
      }
      return;
    }

    // Calculate raw character offsets within container
    const rawStart = getCharacterOffsetInContainer(
      container,
      range.startContainer,
      range.startOffset,
      entries,
    );
    const rawEnd = getCharacterOffsetInContainer(
      container,
      range.endContainer,
      range.endOffset,
      entries,
    );

    if (rawStart === rawEnd) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null;
        setSelectionData(null);
      }
      return;
    }

    // Normalize to full word boundaries
    const { startOffset, endOffset, selectedText } = expandOffsetsToWordBoundaries(
      fullText,
      rawStart,
      rawEnd,
    );

    const trimmed = selectedText.trim();
    if (!trimmed || trimmed.length === 0) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null;
        setSelectionData(null);
      }
      return;
    }

    // Construct snapped DOM Range if boundaries expanded
    let effectiveRange = range;
    let snappedRange: Range | null = null;
    if (startOffset !== rawStart || endOffset !== rawEnd) {
      snappedRange = createRangeFromOffsets(container, startOffset, endOffset, entries);
      if (snappedRange) {
        effectiveRange = snappedRange;
        try {
          isNormalizingRef.current = true;
          sel.removeAllRanges();
          sel.addRange(snappedRange);
        } catch {
          // Gracefully continue in environments where addRange is restricted/mocked
        } finally {
          setTimeout(() => {
            isNormalizingRef.current = false;
          }, 0);
        }
      }
    }

    // Determine bounding rect for floating toolbar positioning
    let rect: DOMRect;
    if (typeof effectiveRange.getBoundingClientRect === "function") {
      rect = effectiveRange.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && typeof range.getBoundingClientRect === "function") {
        rect = range.getBoundingClientRect();
      }
    } else if (typeof range.getBoundingClientRect === "function") {
      rect = range.getBoundingClientRect();
    } else {
      rect = {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect;
    }

    if (rect.width === 0 && rect.height === 0) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null;
        setSelectionData(null);
      }
      return;
    }

    // Check if selection is identical to previous selection
    const prev = lastSelectionRef.current;
    if (
      prev &&
      prev.selectedText === selectedText &&
      prev.startOffset === startOffset &&
      prev.endOffset === endOffset &&
      Math.abs(prev.rect.top - rect.top) < 1 &&
      Math.abs(prev.rect.left - rect.left) < 1 &&
      Math.abs(prev.rect.width - rect.width) < 1 &&
      Math.abs(prev.rect.height - rect.height) < 1
    ) {
      // Unchanged selection: avoid redundant setState and re-renders
      return;
    }

    lastSelectionRef.current = {
      selectedText,
      startOffset,
      endOffset,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    };

    const prefix = fullText.slice(Math.max(0, startOffset - 40), startOffset);
    const suffix = fullText.slice(endOffset, Math.min(fullText.length, endOffset + 40));

    setSelectionData({
      selectedText,
      prefix,
      suffix,
      startOffset,
      endOffset,
      rect,
    });
  }, [containerRef]);

  const clearSelection = useCallback(() => {
    lastSelectionRef.current = null;
    setSelectionData(null);
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      sel.removeAllRanges();
    }
  }, []);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="toolbar"]') || target?.closest('[role="dialog"]')) {
        return;
      }
      isMouseDownRef.current = true;
    };

    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="toolbar"]') || target?.closest('[role="dialog"]')) {
        return;
      }
      isMouseDownRef.current = false;
      // Slight delay to allow browser native selection to finalize
      setTimeout(updateSelection, 10);
    };

    const handleTouchEnd = () => {
      setTimeout(updateSelection, 100);
    };

    const handleSelectionChange = () => {
      if (isNormalizingRef.current) return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl?.closest('[role="toolbar"]') || activeEl?.closest('[role="dialog"]')) {
        return;
      }
      if (!isMouseDownRef.current) {
        updateSelection();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [updateSelection, clearSelection]);

  return {
    selectionData,
    clearSelection,
    refreshSelection: updateSelection,
  };
}
