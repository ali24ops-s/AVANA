import { describe, expect, it } from "vitest";
import {
  isLocalDatabaseUrl,
  validateDatabaseUrlForWorker,
  extractAiConfig,
  generateWorkerEnv,
  parseEnvContent,
  ALLOWED_AI_KEYS,
  PROHIBITED_PRODUCTION_KEYS,
} from "../worker-env.js";

describe("Worker Environment & Security Tests", () => {
  describe("Production Database Blocker (isLocalDatabaseUrl)", () => {
    it("permits standard localhost and loopback IPv4/IPv6 connections", () => {
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@localhost:5432/avana?sslmode=disable"),
      ).toBe(true);
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable"),
      ).toBe(true);
      expect(
        isLocalDatabaseUrl("postgresql://avana:avana@127.0.0.2:5433/avana"),
      ).toBe(true);
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@[::1]:5432/avana"),
      ).toBe(true);
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@0.0.0.0:5432/avana"),
      ).toBe(true);
    });

    it("permits docker internal and container hostnames", () => {
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@postgres:5432/avana"),
      ).toBe(true);
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@host.docker.internal:5432/avana"),
      ).toBe(true);
    });

    it("STRICTLY REJECTS remote production databases", () => {
      // AWS RDS
      expect(
        isLocalDatabaseUrl(
          "postgres://admin:secret@prod-db.c7xyz.us-east-1.rds.amazonaws.com:5432/avana",
        ),
      ).toBe(false);

      // Supabase
      expect(
        isLocalDatabaseUrl(
          "postgres://postgres:secret@db.xyzcompany.supabase.co:5432/postgres",
        ),
      ).toBe(false);

      // Neon Tech
      expect(
        isLocalDatabaseUrl(
          "postgres://user:pass@ep-cool-fog-123.us-east-2.aws.neon.tech/neondb",
        ),
      ).toBe(false);

      // Railway
      expect(
        isLocalDatabaseUrl(
          "postgres://user:pass@containers-us-west-1.railway.app:5432/railway",
        ),
      ).toBe(false);

      // Public Remote IP
      expect(
        isLocalDatabaseUrl("postgres://user:pass@194.163.150.22:5432/avana"),
      ).toBe(false);

      // Domain containing 'prod'
      expect(
        isLocalDatabaseUrl("postgres://user:pass@api.avana.ir:5432/avana"),
      ).toBe(false);
    });

    it("STRICTLY REJECTS local URLs with production database names", () => {
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@127.0.0.1:5432/avana_production"),
      ).toBe(false);
      expect(
        isLocalDatabaseUrl("postgres://avana:avana@localhost:5432/prod_db"),
      ).toBe(false);
    });

    it("rejects invalid URLs and non-postgres schemes", () => {
      expect(isLocalDatabaseUrl("")).toBe(false);
      expect(isLocalDatabaseUrl("invalid-string")).toBe(false);
      expect(isLocalDatabaseUrl("mysql://127.0.0.1:3306/db")).toBe(false);
      expect(isLocalDatabaseUrl("http://127.0.0.1:5432")).toBe(false);
    });

    it("validateDatabaseUrlForWorker throws descriptive error on remote DB", () => {
      expect(() => {
        validateDatabaseUrlForWorker(
          "postgres://admin:secret@remote-db.example.com:5432/avana",
        );
      }).toThrow(/Security Violation: Production or remote DATABASE_URL detected/);
    });
  });

  describe("AI Configuration Preservation & Fallback Enforcement", () => {
    it("extracts recognized AI keys accurately", () => {
      const source = {
        AI_PRIMARY_PROVIDER: "gemini",
        GEMINI_API_KEY: "test-gemini-key",
        GEMINI_MODEL: "gemini-2.5-pro",
        CLOUDFLARE_ACCOUNT_ID: "cf-acc-123",
        CLOUDFLARE_API_TOKEN: "cf-token-abc",
        GROQ_API_KEY: "groq-key-xyz",
        UNRELATED_KEY: "should-not-be-in-ai-config",
      };

      const aiConfig = extractAiConfig(source);

      expect(aiConfig.GEMINI_API_KEY).toBe("test-gemini-key");
      expect(aiConfig.GEMINI_MODEL).toBe("gemini-2.5-pro");
      expect(aiConfig.CLOUDFLARE_ACCOUNT_ID).toBe("cf-acc-123");
      expect(aiConfig.CLOUDFLARE_API_TOKEN).toBe("cf-token-abc");
      expect(aiConfig.GROQ_API_KEY).toBe("groq-key-xyz");
      expect(aiConfig.UNRELATED_KEY).toBeUndefined();
    });

    it("STRICTLY ENFORCES AI_ENABLE_FALLBACK=false even if input specifies true", () => {
      const source = {
        AI_PRIMARY_PROVIDER: "gemini",
        AI_ENABLE_FALLBACK: "true",
        GEMINI_API_KEY: "test-key",
      };

      const aiConfig = extractAiConfig(source);
      expect(aiConfig.AI_ENABLE_FALLBACK).toBe("false");
    });
  });

  describe("generateWorkerEnv", () => {
    it("generates a complete, isolated local environment", () => {
      const { envData, envContent } = generateWorkerEnv({
        rootDir: "/mock/workspace",
        workerId: "worker-042",
        aiConfig: {
          AI_PRIMARY_PROVIDER: "gemini",
          GEMINI_API_KEY: "my-secret-gemini-key",
        },
      });

      // Identity
      expect(envData.WORKER_MODE).toBe("true");
      expect(envData.WORKER_ID).toBe("worker-042");

      // Local Infrastructure
      expect(envData.DATABASE_URL).toBe(
        "postgres://avana:avana@127.0.0.1:55432/avana?sslmode=disable",
      );
      expect(envData.REDIS_URL).toBe("redis://127.0.0.1:56379");
      expect(envData.AVANA_STORAGE_LOCAL_DIRECTORY).toBe("./storage/uploads");

      // Mocks
      expect(envData.EMAIL_PROVIDER).toBe("mock");
      expect(envData.PAYMENT_PROVIDER).toBe("mock");

      // AI Settings
      expect(envData.AI_PRIMARY_PROVIDER).toBe("gemini");
      expect(envData.AI_ENABLE_FALLBACK).toBe("false");
      expect(envData.GEMINI_API_KEY).toBe("my-secret-gemini-key");

      // Formatted text output verification
      expect(envContent).toContain("WORKER_ID=worker-042");
      expect(envContent).toContain("AI_ENABLE_FALLBACK=false");
      expect(envContent).toContain("EMAIL_PROVIDER=mock");
    });

    it("NEVER includes prohibited production secrets", () => {
      const dirtySource: Record<string, string> = {
        RESEND_API_KEY: "re_prod_secret_key_123",
        ZARINPAL_MERCHANT_ID: "00000000-0000-0000-0000-000000000000",
        PRODUCTION_DATABASE_URL: "postgres://prod:secret@aws.rds.com:5432/db",
        GEMINI_API_KEY: "valid-key",
      };

      const { envData, envContent } = generateWorkerEnv({
        rootDir: "/mock/workspace",
        workerId: "worker-001",
        aiConfig: dirtySource,
      });

      for (const prohibited of PROHIBITED_PRODUCTION_KEYS) {
        expect(envData[prohibited]).toBeUndefined();
        expect(envContent).not.toContain(prohibited);
      }
    });

    it("is idempotent and preserves existing worker adjustments", () => {
      const existing = {
        WORKER_ID: "worker-custom",
        AVANA_API_PORT: "3005",
        DATABASE_PORT: "5433",
        GEMINI_API_KEY: "existing-gemini-key",
      };

      const { envData } = generateWorkerEnv({
        rootDir: "/mock/workspace",
        existingEnv: existing,
      });

      expect(envData.WORKER_ID).toBe("worker-custom");
      expect(envData.AVANA_API_PORT).toBe("3005");
      expect(envData.DATABASE_URL).toContain(":5433/");
      expect(envData.GEMINI_API_KEY).toBe("existing-gemini-key");
    });
  });

  describe("parseEnvContent", () => {
    it("correctly parses key=value strings and strips quotes", () => {
      const raw = `
        # Comment line
        KEY1=simple_value
        KEY2="quoted value"
        KEY3='single quoted'
        KEY_WITH_EQUALS="abc=123"
      `;
      const parsed = parseEnvContent(raw);
      expect(parsed.KEY1).toBe("simple_value");
      expect(parsed.KEY2).toBe("quoted value");
      expect(parsed.KEY3).toBe("single quoted");
      expect(parsed.KEY_WITH_EQUALS).toBe("abc=123");
    });
  });
});
