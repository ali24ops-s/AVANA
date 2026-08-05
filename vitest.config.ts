import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "apps/web/vitest.config.ts",
      "apps/api/vitest.config.ts",
      "packages/domain/vitest.config.ts",
      "tools/eslint-boundaries/vitest.config.ts",
      "database/vitest.config.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
