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

export interface TextSelectionData {
  selectedText: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  rect: DOMRect;
}

/**
 * Calculates the character offset of a node + offset relative to a root container.
 */
function getCharacterOffsetInContainer(
  container: Node,
  targetNode: Node,
  targetOffset: number,
): number {
  let charCount = 0;
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode === targetNode) {
      return charCount + targetOffset;
    }
    charCount += currentNode.textContent?.length || 0;
    currentNode = walker.nextNode();
  }

  // Target node might be an element containing text nodes
  if (container.contains(targetNode) && targetNode !== container) {
    let offset = 0;
    const innerWalker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let innerNode = innerWalker.nextNode();
    while (innerNode) {
      if (
        targetNode.contains(innerNode) ||
        targetNode.compareDocumentPosition(innerNode) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        return offset;
      }
      offset += innerNode.textContent?.length || 0;
      innerNode = innerWalker.nextNode();
    }
    return offset;
  }

  return charCount;
}

export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>) {
  const [selectionData, setSelectionData] = useState<TextSelectionData | null>(null);
  const isMouseDownRef = useRef(false);

  const updateSelection = useCallback(() => {
    if (isMouseDownRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      setSelectionData(null);
      return;
    }

    const container = containerRef.current;
    if (!container) {
      setSelectionData(null);
      return;
    }

    const range = sel.getRangeAt(0);

    // Ensure the selection intersects or is inside the container
    if (
      !container.contains(range.commonAncestorContainer) &&
      !range.intersectsNode(container)
    ) {
      setSelectionData(null);
      return;
    }

    const text = sel.toString().trim();
    if (!text || text.length === 0) {
      setSelectionData(null);
      return;
    }

    // Get Bounding Client Rect for positioning
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelectionData(null);
      return;
    }

    // Compute canonical offsets and surrounding context
    const fullText = container.textContent || "";
    const startOffset = getCharacterOffsetInContainer(
      container,
      range.startContainer,
      range.startOffset,
    );
    const endOffset = startOffset + text.length;

    const prefix = fullText.slice(Math.max(0, startOffset - 40), startOffset);
    const suffix = fullText.slice(endOffset, Math.min(fullText.length, endOffset + 40));

    setSelectionData({
      selectedText: text,
      prefix,
      suffix,
      startOffset,
      endOffset,
      rect,
    });
  }, [containerRef]);

  const clearSelection = useCallback(() => {
    setSelectionData(null);
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      sel.removeAllRanges();
    }
  }, []);

  useEffect(() => {
    const handleMouseDown = () => {
      isMouseDownRef.current = true;
    };

    const handleMouseUp = () => {
      isMouseDownRef.current = false;
      // Slight delay to allow browser native selection to finalize
      setTimeout(updateSelection, 10);
    };

    const handleTouchEnd = () => {
      setTimeout(updateSelection, 100);
    };

    const handleSelectionChange = () => {
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
