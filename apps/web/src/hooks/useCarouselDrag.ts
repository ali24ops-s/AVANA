import { useRef, useState, useCallback } from "react";

export interface UseCarouselDragOptions {
  onNext: () => void;
  onPrev: () => void;
  /** Distance in pixels to trigger slide transition (default: 40) */
  threshold?: number;
  /** Min movement in pixels to consider as dragging and suppress click (default: 8) */
  dragDetectionThreshold?: number;
  /** Whether drag gesture is enabled (e.g. false if only 1 item) */
  enabled?: boolean;
  /** Callback when drag starts/stops (useful to pause auto-advance) */
  onDragStateChange?: (isDragging: boolean) => void;
}

export function useCarouselDrag({
  onNext,
  onPrev,
  threshold = 40,
  dragDetectionThreshold = 8,
  enabled = true,
  onDragStateChange,
}: UseCarouselDragOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isPointerDownRef = useRef<boolean>(false);
  const directionRef = useRef<"horizontal" | "vertical" | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const pointerIdRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      // Only react to primary mouse button or touch/pen
      if (e.pointerType === "mouse" && e.button !== 0) return;

      // Do NOT initiate drag if the click started directly on an interactive button or control
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, [role='button'], input, textarea, select")) {
        return;
      }

      isPointerDownRef.current = true;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      directionRef.current = null;
      hasDraggedRef.current = false;
    },
    [enabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !isPointerDownRef.current) return;

      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Determine initial direction if not yet decided
      if (!directionRef.current) {
        if (absDx < dragDetectionThreshold && absDy < dragDetectionThreshold) {
          return;
        }

        if (absDy >= absDx) {
          // Dominant vertical movement -> allow native page scrolling
          directionRef.current = "vertical";
          return;
        }

        // Dominant horizontal movement -> activate carousel drag
        directionRef.current = "horizontal";
        hasDraggedRef.current = true;
        setIsDragging(true);
        onDragStateChange?.(true);

        // Capture pointer only after horizontal drag is confirmed (improves desktop drag reliability)
        if (e.pointerType === "mouse") {
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            // Safe fallback if target doesn't support capture
          }
        }
      }

      if (directionRef.current === "horizontal") {
        hasDraggedRef.current = true;
      }
    },
    [enabled, dragDetectionThreshold, onDragStateChange],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent, shouldEvaluate: boolean) => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;

      // Release pointer capture if held
      if (pointerIdRef.current !== null) {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(pointerIdRef.current);
        } catch {
          // Ignore if capture was not set or already released
        }
        pointerIdRef.current = null;
      }

      const wasHorizontal = directionRef.current === "horizontal";
      directionRef.current = null;

      if (isDragging) {
        setIsDragging(false);
        onDragStateChange?.(false);
      }

      if (shouldEvaluate && wasHorizontal) {
        const dx = e.clientX - startXRef.current;
        // In Persian / RTL layout:
        // Drag to left (dx <= -threshold): advance to NEXT slide
        // Drag to right (dx >= threshold): return to PREV slide
        if (dx <= -threshold) {
          onNext();
        } else if (dx >= threshold) {
          onPrev();
        }
      }

      // If we performed a genuine drag, keep hasDraggedRef true for one frame
      // so any synthetic click event dispatched by the browser is caught and cancelled.
      if (hasDraggedRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            hasDraggedRef.current = false;
          }, 50);
        });
      }
    },
    [isDragging, threshold, onNext, onPrev, onDragStateChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      endDrag(e, true);
    },
    [endDrag],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      endDrag(e, false);
      hasDraggedRef.current = false;
    },
    [endDrag],
  );

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      hasDraggedRef.current = false;
    }
  }, []);

  return {
    isDragging,
    dragProps: enabled
      ? {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerCancel,
          onClickCapture: handleClickCapture,
          style: { touchAction: "pan-y" as const },
        }
      : {},
    cursorClass: enabled
      ? isDragging
        ? "cursor-grabbing select-none"
        : "cursor-grab"
      : "",
  };
}
