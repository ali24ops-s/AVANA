import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "database",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
