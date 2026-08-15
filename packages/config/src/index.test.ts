import { describe, expect, it } from "vitest";
import path from "node:path";
import { findMonorepoRoot, loadMonorepoEnv } from "./index.js";

describe("packages/config env loader", () => {
  it("finds the monorepo root directory correctly", () => {
    const root = findMonorepoRoot();
    expect(root).toBeDefined();
    expect(root.length).toBeGreaterThan(0);
    // When called from apps/worker or packages/config, should find the root
    const fromNested = findMonorepoRoot(path.join(root, "apps", "worker"));
    expect(fromNested).toBe(root);
  });

  it("loads environment variables safely without error", () => {
    expect(() => loadMonorepoEnv()).not.toThrow();
  });
});
