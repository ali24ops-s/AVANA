import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [];

  constructor(
    _callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}

  disconnect(): void {}
  observe(_target: Element): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  unobserve(_target: Element): void {}
}

globalThis.IntersectionObserver = TestIntersectionObserver;

if (typeof window !== "undefined") {
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = function (contextId: string) {
      if (contextId === "2d") {
        return {
          font: "",
          measureText: (text: string) => ({
            width: (text?.length ?? 0) * 8,
            actualBoundingBoxAscent: 10,
            actualBoundingBoxDescent: 2,
          }),
          fillRect: () => {},
          clearRect: () => {},
          getImageData: () => ({ data: new Array(4) }),
          putImageData: () => {},
          createImageData: () => [],
          setTransform: () => {},
          drawImage: () => {},
          save: () => {},
          fillText: () => {},
          restore: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          stroke: () => {},
          translate: () => {},
          scale: () => {},
          rotate: () => {},
          arc: () => {},
          fill: () => {},
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  }

  if (!window.PointerEvent) {
    class PointerEvent extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
        this.pointerType = params.pointerType ?? "mouse";
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.PointerEvent = PointerEvent as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.PointerEvent = PointerEvent as any;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
}
