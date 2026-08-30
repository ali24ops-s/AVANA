import js from "@eslint/js";
import noSecrets from "eslint-plugin-no-secrets";
import tseslint from "typescript-eslint";
import avanaBoundaries from "./tools/eslint-boundaries/index.js";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/migrations/**",
      "**/scripts/**",
      "storage/**",
      "scratch/**",
      "*.mjs",
      "apps/api/*.mjs",
      "apps/api/scratch-*.ts",
      "test-quality*.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "avana-boundaries": avanaBoundaries,
      "no-secrets": noSecrets,
    },
    rules: {
      "avana-boundaries/imports": "error",
      "no-console": "error",
      "no-secrets/no-secrets": [
        "error",
        { ignoreContent: ["Cardiovascular_Pharmacology_Week12.pdf"] },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "**/test/**", "**/seeds/**"],
    rules: { "no-console": "off" },
  },
);
