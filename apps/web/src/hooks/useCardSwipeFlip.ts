import { useRef, useCallback } from "react";

export interface UseCardSwipeFlipOptions {
  onFlip: () => void;
  /** Distance in pixels to trigger card flip (default: 40) */
  threshold?: number;
  /** Min movement in pixels to consider as horizontal swipe and suppress click (default: 8) */
  dragDetectionThreshold?: number;
  /** Whether swipe gesture is enabled (default: true) */
  enabled?: boolean;
}

export function useCardSwipeFlip({
  onFlip,
  threshold = 40,
  dragDetectionThreshold = 8,
  enabled = true,
}: UseCardSwipeFlipOptions) {
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isPointerDownRef = useRef<boolean>(false);
  const directionRef = useRef<"horizontal" | "vertical" | null>(null);
  const hasSwipedRef = useRef<boolean>(false);
  const pointerIdRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      // Do NOT initiate swipe gesture if pointer down started on interactive controls
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, [role='button']:not(#flashcard), input, textarea, select, a")) {
        return;
      }

      isPointerDownRef.current = true;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      startYRef.current = e.clientY;
      directionRef.current = null;
      hasSwipedRef.current = false;
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

      if (!directionRef.current) {
        if (absDx < dragDetectionThreshold && absDy < dragDetectionThreshold) {
          return;
        }

        if (absDy >= absDx) {
          // Dominant vertical gesture -> leave to browser vertical scrolling
          directionRef.current = "vertical";
          return;
        }

        // Dominant horizontal gesture -> activate card swipe
        directionRef.current = "horizontal";
        hasSwipedRef.current = true;

        if (e.pointerType === "mouse") {
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            // Safe fallback
          }
        }
      }

      if (directionRef.current === "horizontal") {
        hasSwipedRef.current = true;
      }
    },
    [enabled, dragDetectionThreshold],
  );

  const endSwipe = useCallback(
    (e: React.PointerEvent, shouldEvaluate: boolean) => {
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;

      if (pointerIdRef.current !== null) {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(pointerIdRef.current);
        } catch {
          // Ignore
        }
        pointerIdRef.current = null;
      }

      const wasHorizontal = directionRef.current === "horizontal";
      directionRef.current = null;

      if (shouldEvaluate && wasHorizontal) {
        const dx = e.clientX - startXRef.current;
        // Either swipe left or swipe right beyond threshold flips the card
        if (Math.abs(dx) >= threshold) {
          onFlip();
        }
      }

      // Suppress subsequent synthetic click if a swipe gesture occurred
      if (hasSwipedRef.current) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            hasSwipedRef.current = false;
          }, 50);
        });
      }
    },
    [threshold, onFlip],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      endSwipe(e, true);
    },
    [endSwipe],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      endSwipe(e, false);
      hasSwipedRef.current = false;
    },
    [endSwipe],
  );

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (hasSwipedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      hasSwipedRef.current = false;
    }
  }, []);

  return {
    swipeProps: enabled
      ? {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerCancel,
          onClickCapture: handleClickCapture,
          style: { touchAction: "pan-y" as const },
        }
      : {},
  };
}
