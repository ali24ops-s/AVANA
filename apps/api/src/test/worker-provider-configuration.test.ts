import { describe, expect, it } from "vitest";
import { validateWorkerConfig } from "../../../worker/src/index.js";
import { composeWorker } from "../../../worker/src/compose.js";
import { loadApiConfig } from "../config.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { FallbackModelGateway } from "../modules/generation/gateway/index.js";

describe("Worker Provider Configuration & Isolation", () => {
  it("validates successfully when GEMINI_API_KEY is present", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      AI_PRIMARY_PROVIDER: "gemini",
      GEMINI_API_KEY: "AIzaSy-test-gemini-key",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).not.toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  it("validates successfully when indexed GEMINI_API_KEY_1 is present", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      AI_PRIMARY_PROVIDER: "gemini",
      GEMINI_API_KEY: "",
      GEMINI_API_KEY_1: "AIzaSyIndexedGeminiKey456",
      GEMINI_PROJECT_ID_1: "project-core",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).not.toThrow();
    } finally {
      process.env = originalEnv;
    }
  });

  it("throws a clear startup configuration error when Gemini keys are missing", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      AI_PRIMARY_PROVIDER: "gemini",
      GEMINI_API_KEY: "",
      GEMINI_API_KEYS: "",
      GEMINI_API_KEY_1: "",
      GEMINI_API_KEY_2: "",
      GEMINI_API_KEY_3: "",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).toThrow(
        "Configuration error: GEMINI_API_KEY or GEMINI_API_KEY_1..10 is missing or empty. Cannot start worker.",
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("throws a clear error when GEMINI_API_KEY is whitespace only", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      AI_PRIMARY_PROVIDER: "gemini",
      GEMINI_API_KEY: "   ",
      GEMINI_API_KEYS: "  ",
      GEMINI_API_KEY_1: "",
      GEMINI_API_KEY_2: "",
      GEMINI_API_KEY_3: "",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).toThrow(
        "Configuration error: GEMINI_API_KEY or GEMINI_API_KEY_1..10 is missing or empty. Cannot start worker.",
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("composeWorker constructs GeminiModelGateway for both admin and user gateways with zero fallback", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      AI_PRIMARY_PROVIDER: "gemini",
      GEMINI_API_KEY: "AIzaSyDummyGeminiWorkerKey",
      AI_ENABLE_FALLBACK: "false",
    };

    try {
      const config = loadApiConfig();
      const deps = await composeWorker(config);
      try {
        expect(deps.gateway).toBeInstanceOf(GeminiModelGateway);
        expect(deps.adminGateway).toBeInstanceOf(GeminiModelGateway);
        expect(deps.gateway).toBe(deps.adminGateway);
        expect(deps.gateway).not.toBeInstanceOf(FallbackModelGateway);
        expect(deps.gateway.provider).toBe("gemini");
      } finally {
        await deps.close();
      }
    } finally {
      process.env = originalEnv;
    }
  });

  it("validates successfully without keys when aiProvider is mock", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      AI_PRIMARY_PROVIDER: "mock",
      GEMINI_API_KEY: "",
      GEMINI_API_KEYS: "",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).not.toThrow();
    } finally {
      process.env = originalEnv;
    }
  });
});
