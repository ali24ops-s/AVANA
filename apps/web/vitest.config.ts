import path from "path";
import { fileURLToPath } from "url";
import { defineProject } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineProject({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@avana/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      "@avana/contracts": path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      "@avana/domain": path.resolve(__dirname, "../../packages/domain/src/index.ts"),
    },
  },
  test: {
    name: "web",
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
