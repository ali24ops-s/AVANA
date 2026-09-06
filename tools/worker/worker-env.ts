/**
 * Worker Environment Manager (PR-Worker Bootstrap).
 *
 * Responsibilities:
 * 1. Safely extract and preserve AI configuration from source (.env.worker-ai, .env, process.env).
 * 2. Enforce AI_ENABLE_FALLBACK=false so that errors do not fallback to unintended providers.
 * 3. Enforce strict local-only infrastructure (Postgres 127.0.0.1, Redis 127.0.0.1, local storage).
 * 4. Fail-closed Production Database Blocker: strictly rejects any remote/production DATABASE_URL.
 * 5. Filter out all production-only secrets (Resend, Zarinpal, production DB credentials).
 * 6. Idempotent: Preserves existing worker settings on repeated setups without data loss.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Supported and recognized AI configuration keys.
 * Extracted directly from:
 * - apps/api/src/config.ts
 * - apps/api/src/modules/generation/gateway/index.ts
 */
export const ALLOWED_AI_KEYS = [
  "AI_PRIMARY_PROVIDER",
  "AI_CONTENT_PROVIDER",
  "AI_PROVIDER",
  "AI_ENABLE_FALLBACK",
  "AI_GENERATION_QUEUE",
  "GEMINI_API_KEY",
  "GEMINI_API_KEYS",
  "GEMINI_API_KEY_1",
  "GEMINI_API_KEY_2",
  "GEMINI_API_KEY_3",
  "GEMINI_API_KEY_4",
  "GEMINI_API_KEY_5",
  "GEMINI_API_KEY_6",
  "GEMINI_API_KEY_7",
  "GEMINI_API_KEY_8",
  "GEMINI_API_KEY_9",
  "GEMINI_API_KEY_10",
  "GEMINI_MODEL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_AI_MODEL",
  "GAPGPT_API_KEY",
  "GAPGPT_BASE_URL",
  "GAPGPT_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "ARVANCLOUD_API_KEY",
  "ARVANCLOUD_API_TOKEN",
  "ARVANCLOUD_BASE_URL",
  "ARVANCLOUD_MODEL",
  "ARVANCLOUD_AUTH_SCHEME",
  "ARVANCLOUD_TIMEOUT_MS",
] as const;

export type AllowedAiKey = (typeof ALLOWED_AI_KEYS)[number];

/**
 * Production-only secrets that must NEVER be copied to a Worker environment.
 */
export const PROHIBITED_PRODUCTION_KEYS = [
  "RESEND_API_KEY",
  "ZARINPAL_MERCHANT_ID",
  "CARD_TO_CARD_DESTINATION_NUMBER",
  "CARD_TO_CARD_CARDHOLDER_NAME",
  "CARD_TO_CARD_INSTRUCTIONS",
  "PRODUCTION_DATABASE_URL",
  "PROD_DATABASE_URL",
  "PROD_ADMIN_SECRET",
] as const;

/**
 * Check whether a database URL points to a strictly local host.
 *
 * Permitted hosts:
 * - localhost
 * - 127.0.0.1
 * - ::1 / [::1]
 * - 0.0.0.0
 * - 127.*.*.*
 * - postgres (Docker internal network service name)
 * - host.docker.internal
 *
 * Any remote IP, domain, AWS RDS, Supabase, Neon, Railway, or strings containing
 * 'prod'/'production' are strictly rejected.
 */
export function isLocalDatabaseUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") {
    return false;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("postgres://") && !trimmed.startsWith("postgresql://")) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    // Check for explicit production indicators in database name or path
    if (parsed.pathname.toLowerCase().includes("prod")) {
      return false;
    }

    // Explicitly allowed local hosts
    const allowedLocalHosts = new Set([
      "localhost",
      "127.0.0.1",
      "::1",
      "[::1]",
      "0.0.0.0",
      "postgres",
      "host.docker.internal",
    ]);

    if (allowedLocalHosts.has(hostname)) {
      return true;
    }

    // Check 127.0.0.0/8 subnet
    if (/^127\.\d+\.\d+\.\d+$/.test(hostname)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Validate that a database URL is safe for Worker usage.
 * Throws a descriptive error if a remote/production URL is detected.
 */
export function validateDatabaseUrlForWorker(url: string): void {
  if (!isLocalDatabaseUrl(url)) {
    let hostname = "unknown";
    try {
      hostname = new URL(url).hostname;
    } catch {
      // ignore parse error
    }
    throw new Error(
      `❌ Security Violation: Production or remote DATABASE_URL detected (${hostname}). ` +
        `Workers are strictly prohibited from connecting to remote/production databases. ` +
        `Worker setup has been aborted to protect production data.`,
    );
  }
}

/**
 * Parse a standard key=value .env file content.
 */
export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

/**
 * Parse an .env file from disk if it exists.
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf8");
  return parseEnvContent(content);
}

/**
 * Filter and extract valid AI configuration variables from a dictionary.
 * Strictly enforces AI_ENABLE_FALLBACK=false.
 */
export function extractAiConfig(
  source: Record<string, string | undefined>,
): Record<string, string> {
  const aiConfig: Record<string, string> = {};

  for (const key of ALLOWED_AI_KEYS) {
    const val = source[key];
    if (val !== undefined && val.trim().length > 0) {
      aiConfig[key] = val.trim();
    }
  }

  // Set canonical defaults if not specified
  if (!aiConfig.AI_PRIMARY_PROVIDER) {
    aiConfig.AI_PRIMARY_PROVIDER =
      source.AI_CONTENT_PROVIDER || source.AI_PROVIDER || "gemini";
  }

  // MANDATORY REQUIREMENT: Fallback must NEVER be enabled on Worker
  aiConfig.AI_ENABLE_FALLBACK = "false";

  if (!aiConfig.AI_GENERATION_QUEUE) {
    aiConfig.AI_GENERATION_QUEUE = "content_generate";
  }

  return aiConfig;
}

export interface WorkerEnvOptions {
  rootDir: string;
  workerId?: string;
  workerName?: string;
  dbName?: string;
  dbPort?: number;
  redisPort?: number;
  redisDb?: number;
  apiPort?: number;
  apiHost?: string;
  webPort?: number;
  aiConfig?: Record<string, string>;
  existingEnv?: Record<string, string>;
}

export interface GeneratedWorkerEnv {
  envData: Record<string, string>;
  envContent: string;
}

/**
 * Generate a complete, secure, local-only .env configuration for a Worker.
 */
export function generateWorkerEnv(options: WorkerEnvOptions): GeneratedWorkerEnv {
  const workerId = options.workerId || options.existingEnv?.WORKER_ID || "worker-001";
  const workerName =
    options.workerName ||
    options.existingEnv?.WORKER_NAME ||
    `Content Worker (${workerId})`;

  const dbName = options.dbName || options.existingEnv?.DATABASE_NAME || "avana";
  const dbPort = options.dbPort || (options.existingEnv?.DATABASE_PORT ? Number(options.existingEnv.DATABASE_PORT) : 5432);
  const redisPort = options.redisPort || (options.existingEnv?.REDIS_PORT ? Number(options.existingEnv.REDIS_PORT) : 6379);
  const redisDbSuffix = options.redisDb !== undefined ? `/${options.redisDb}` : "";
  const apiPort = options.apiPort || (options.existingEnv?.AVANA_API_PORT ? Number(options.existingEnv.AVANA_API_PORT) : 3000);
  const apiHost = options.apiHost || options.existingEnv?.AVANA_API_HOST || "127.0.0.1";
  const webPort = options.webPort || 5173;

  // Local database URL with credentials matching infra/local/compose.yaml
  const localDbUrl = `postgres://avana:avana@127.0.0.1:${dbPort}/${dbName}?sslmode=disable`;
  validateDatabaseUrlForWorker(localDbUrl);

  const localRedisUrl = `redis://127.0.0.1:${redisPort}${redisDbSuffix}`;
  const localStorageDir = "./storage/uploads";

  // Base local worker environment
  const envData: Record<string, string> = {
    NODE_ENV: "development",
    WORKER_MODE: "true",
    WORKER_ID: workerId,
    WORKER_NAME: workerName,
    AVANA_API_HOST: apiHost,
    AVANA_API_PORT: String(apiPort),
    AVANA_CORS_ORIGIN: `http://localhost:${webPort},http://127.0.0.1:${webPort}`,
    AVANA_SESSION_COOKIE: "avana_session",
    AVANA_CSRF_COOKIE: "avana_csrf",
    DATABASE_URL: localDbUrl,
    REDIS_URL: localRedisUrl,
    SYSTEM_ORGANIZATION_ID:
      options.existingEnv?.SYSTEM_ORGANIZATION_ID ||
      "b4a0b464-16db-4087-92b7-163a1e6f6776",
    AVANA_STORAGE_LOCAL_DIRECTORY: localStorageDir,
    EMAIL_PROVIDER: "mock",
    EMAIL_FROM: "AVANA Worker <worker@avana.local>",
    PAYMENT_PROVIDER: "mock",
  };

  // Merge AI Configuration
  const aiSource = options.aiConfig || {};
  const extractedAi = extractAiConfig(aiSource);

  // If no AI keys found in provided aiConfig, try extracting from existingEnv
  if (Object.keys(extractedAi).filter(k => k.endsWith("_KEY") || k.endsWith("_TOKEN")).length === 0 && options.existingEnv) {
    const fromExisting = extractAiConfig(options.existingEnv);
    Object.assign(envData, fromExisting);
  } else {
    Object.assign(envData, extractedAi);
  }

  // Absolute guarantee: AI_ENABLE_FALLBACK is false
  envData.AI_ENABLE_FALLBACK = "false";

  // Build readable .env file content
  const lines: string[] = [
    "# =============================================================================",
    `# AVANA Worker Environment Configuration — Worker ID: ${workerId}`,
    "# Automatically managed by `npm run worker:setup`. DO NOT COMMIT TO GIT.",
    "# =============================================================================",
    "",
    "# Worker Identity",
    `WORKER_MODE=${envData.WORKER_MODE}`,
    `WORKER_ID=${envData.WORKER_ID}`,
    `WORKER_NAME="${envData.WORKER_NAME}"`,
    "",
    "# Server Environment",
    `NODE_ENV=${envData.NODE_ENV}`,
    `AVANA_API_HOST=${envData.AVANA_API_HOST}`,
    `AVANA_API_PORT=${envData.AVANA_API_PORT}`,
    `AVANA_CORS_ORIGIN=${envData.AVANA_CORS_ORIGIN}`,
    "",
    "# Session & Cookies",
    `AVANA_SESSION_COOKIE=${envData.AVANA_SESSION_COOKIE}`,
    `AVANA_CSRF_COOKIE=${envData.AVANA_CSRF_COOKIE}`,
    "",
    "# Local Isolated Infrastructure (NEVER points to Production DB)",
    `DATABASE_URL=${envData.DATABASE_URL}`,
    `REDIS_URL=${envData.REDIS_URL}`,
    `AVANA_STORAGE_LOCAL_DIRECTORY=${envData.AVANA_STORAGE_LOCAL_DIRECTORY}`,
    `SYSTEM_ORGANIZATION_ID=${envData.SYSTEM_ORGANIZATION_ID}`,
    "",
    "# Mock Providers for Local Worker",
    `EMAIL_PROVIDER=${envData.EMAIL_PROVIDER}`,
    `EMAIL_FROM="${envData.EMAIL_FROM}"`,
    `PAYMENT_PROVIDER=${envData.PAYMENT_PROVIDER}`,
    "",
    "# AI Engine Configuration (Matched to Main System, Fallback strictly disabled)",
    `AI_PRIMARY_PROVIDER=${envData.AI_PRIMARY_PROVIDER || "gemini"}`,
    `AI_ENABLE_FALLBACK=false`,
    `AI_GENERATION_QUEUE=${envData.AI_GENERATION_QUEUE || "content_generate"}`,
    "",
  ];

  // Append all active AI provider keys
  for (const key of ALLOWED_AI_KEYS) {
    if (
      key !== "AI_PRIMARY_PROVIDER" &&
      key !== "AI_ENABLE_FALLBACK" &&
      key !== "AI_GENERATION_QUEUE" &&
      key !== "AI_CONTENT_PROVIDER" &&
      key !== "AI_PROVIDER" &&
      envData[key]
    ) {
      lines.push(`${key}=${envData[key]}`);
    }
  }

  lines.push("");

  return {
    envData,
    envContent: lines.join("\n"),
  };
}

/**
 * Writes the worker .env file safely to the monorepo root.
 */
export function writeWorkerEnvFile(rootDir: string, envContent: string): void {
  const targetPath = path.join(rootDir, ".env");
  fs.writeFileSync(targetPath, envContent, { encoding: "utf8", mode: 0o600 });
}
