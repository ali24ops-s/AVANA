import { describe, expect, it } from "vitest";
import { validateWorkerConfig } from "../../../worker/src/index.js";
import { composeWorker } from "../../../worker/src/compose.js";
import { loadApiConfig } from "../config.js";
import { GapGPTModelGateway } from "../modules/generation/gateway/gapgpt.js";
import { OpenRouterModelGateway } from "../modules/generation/gateway/openrouter.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { FallbackModelGateway } from "../modules/generation/gateway/index.js";

describe("Worker Provider Configuration & Isolation", () => {
  it("validates successfully when GAPGPT_API_KEY is present, even without GEMINI_API_KEY", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      USER_AI_PROVIDER: "gapgpt",
      GAPGPT_API_KEY: "sk-gap-v1-valid-key",
      GAPGPT_USER_AI_MODEL: "deepseek-v4-flash",
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

  it("throws a clear startup configuration error when GAPGPT_API_KEY is missing", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      USER_AI_PROVIDER: "gapgpt",
      GAPGPT_API_KEY: "",
      GEMINI_API_KEY: "dummy-gemini-key",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).toThrow(
        "Configuration error: GAPGPT_API_KEY is missing or empty. Cannot start worker.",
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("throws a clear error when GAPGPT_API_KEY is whitespace only", () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      USER_AI_PROVIDER: "gapgpt",
      GAPGPT_API_KEY: "   ",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).toThrow(
        "Configuration error: GAPGPT_API_KEY is missing or empty. Cannot start worker.",
      );
    } finally {
      process.env = originalEnv;
    }
  });

  it("composeWorker constructs GapGPTModelGateway with deepseek-v4-flash and zero fallback", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      USER_AI_PROVIDER: "gapgpt",
      GAPGPT_API_KEY: "sk-gap-v1-worker-key",
      GAPGPT_USER_AI_MODEL: "deepseek-v4-flash",
      GEMINI_API_KEY: "dummy-gemini-key",
      AI_PRIMARY_PROVIDER: "gemini",
      AI_ENABLE_FALLBACK: "true",
    };

    try {
      const config = loadApiConfig();
      const deps = await composeWorker(config);
      try {
        expect(deps.gateway).toBeInstanceOf(GapGPTModelGateway);
        expect(deps.gateway).not.toBeInstanceOf(GeminiModelGateway);
        expect(deps.gateway).not.toBeInstanceOf(FallbackModelGateway);
        expect(deps.gateway.provider).toBe("gapgpt");
        expect(deps.gateway.model).toBe("deepseek-v4-flash");
      } finally {
        await deps.close();
      }
    } finally {
      process.env = originalEnv;
    }
  });

  it("validates and constructs OpenRouterModelGateway when USER_AI_PROVIDER is explicitly openrouter", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      USER_AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "sk-or-v1-worker-key",
      OPENROUTER_USER_AI_MODEL: "deepseek/deepseek-v4-flash-0731",
      GEMINI_API_KEY: "dummy-gemini-key",
    };

    try {
      const config = loadApiConfig();
      expect(() => validateWorkerConfig(config)).not.toThrow();
      const deps = await composeWorker(config);
      try {
        expect(deps.gateway).toBeInstanceOf(OpenRouterModelGateway);
        expect(deps.gateway.provider).toBe("openrouter");
        expect(deps.gateway.model).toBe("deepseek/deepseek-v4-flash-0731");
      } finally {
        await deps.close();
      }
    } finally {
      process.env = originalEnv;
    }
  });
});
