import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "eslint-boundaries",
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
