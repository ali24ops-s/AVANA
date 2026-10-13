import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "apps-worker",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
