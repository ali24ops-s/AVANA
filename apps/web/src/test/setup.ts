import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Default test environment to full authentication mode
import.meta.env.VITE_AUTH_ENABLED = "true";

beforeEach(() => {
  import.meta.env.VITE_AUTH_ENABLED = "true";
});

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
