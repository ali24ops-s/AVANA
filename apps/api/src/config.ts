import path from "node:path";
import { loadMonorepoEnv } from "@avana/config";

function resolveStorageDirectory(dir: string): string {
  if (path.isAbsolute(dir)) {
    return dir;
  }
  const cwd = process.cwd();
  if (cwd.endsWith("/apps/api") || cwd.endsWith("/apps/worker")) {
    return path.resolve(cwd, "../..", dir);
  }
  return path.resolve(cwd, dir);
}
export type SessionConfig = {
  cookieName: string;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  maxAgeMs: number;
  path: string;
};

export type SecurityConfig = {
  cors: {
    origin: string[];
    credentials: boolean;
  };
  rateLimit: {
    max: number;
    timeWindowMs: number;
  };
};

export type ApiConfig = {
  nodeEnv: "development" | "test" | "production";
  server: {
    host: string;
    port: number;
  };
  http: {
    jsonBodyLimit: string;
  };
  logging: {
    redactHeaders: string[];
    level: string;
  };
  security: SecurityConfig;
  session: SessionConfig;
  csrf: {
    cookieName: string;
    headerName: string;
    tokenExpiryMs: number;
    secure: boolean;
    sameSite: "lax" | "strict" | "none";
    path: string;
  };
  database: {
    url: string;
  };
  storage: {
    local: {
      directory: string;
    };
  };
  redis: {
    url: string;
  };
  generation: {
    aiProvider: string;
    queueName: string;
    geminiApiKey?: string;
    geminiModel: string;
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    cloudflareAiModel: string;
  };
};

function getOptionalString(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
): string {
  const v = env[name];
  return v !== undefined && v !== "" ? v : fallback;
}

function parsePort(raw: string): number {
  const n = Number(raw);

  // Allow `0` in tests (Fastify inject doesn't use actual listening ports).
  if (n === 0) return 0;

  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    throw new Error(`Invalid port value: ${raw}`);
  }
  return n;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  loadMonorepoEnv();

  const nodeEnvRaw = env.NODE_ENV;
  const nodeEnv = (
    nodeEnvRaw === "production" ||
    nodeEnvRaw === "development" ||
    nodeEnvRaw === "test"
      ? nodeEnvRaw
      : null
  ) as ApiConfig["nodeEnv"] | null;

  if (!nodeEnv) {
    throw new Error(
      `Invalid or missing NODE_ENV. Expected one of: development, test, production`,
    );
  }

  const host = getOptionalString(env, "AVANA_API_HOST", "127.0.0.1");
  const portRaw = getOptionalString(env, "AVANA_API_PORT", "3000");
  const port = parsePort(portRaw);

  const jsonBodyLimitRaw = getOptionalString(
    env,
    "AVANA_HTTP_JSON_BODY_LIMIT",
    "1mb",
  );

  // Fastify v5 expects `bodyLimit` to be an integer (bytes), not a human-readable string.
  const jsonBodyLimitBytes = jsonBodyLimitRaw.endsWith("mb")
    ? Math.floor(Number(jsonBodyLimitRaw.slice(0, -2)) * 1024 * 1024)
    : jsonBodyLimitRaw.endsWith("kb")
      ? Math.floor(Number(jsonBodyLimitRaw.slice(0, -2)) * 1024)
      : Number(jsonBodyLimitRaw);

  if (!Number.isInteger(jsonBodyLimitBytes) || jsonBodyLimitBytes <= 0) {
    throw new Error(
      `Invalid AVANA_HTTP_JSON_BODY_LIMIT value: ${jsonBodyLimitRaw}`,
    );
  }

  const jsonBodyLimit = String(jsonBodyLimitBytes);

  const isProd = nodeEnv === "production";
  const corsOrigins = getOptionalString(
    env,
    "AVANA_CORS_ORIGIN",
    isProd
      ? "https://app.avana.ai"
      : "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174",
  )
    .split(",")
    .map((origin) => origin.trim());

  function localDatabaseUrl(): string {
    const user = "avana";
    const password = "avana";
    const host = "localhost";
    const port = "5432";
    const db = "avana";
    return `postgres://${user}:${password}@${host}:${port}/${db}?sslmode=disable`;
  }

  const databaseUrl = getOptionalString(env, "DATABASE_URL", localDatabaseUrl());

  return {
    nodeEnv,
    server: { host, port },
    http: { jsonBodyLimit },
    logging: {
      redactHeaders: ["authorization", "cookie", "set-cookie"],
      level: nodeEnv === "test" ? "silent" : "info",
    },
    security: {
      cors: {
        origin: corsOrigins,
        credentials: true,
      },
      rateLimit: {
        max: nodeEnv === "test" ? 1000 : 100,
        timeWindowMs: 60_000, // 1 minute
      },
    },
    session: {
      cookieName: getOptionalString(env, "AVANA_SESSION_COOKIE", "avana_session"),
      secure: isProd,
      sameSite: "lax",
      maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    },
    csrf: {
      cookieName: getOptionalString(env, "AVANA_CSRF_COOKIE", "avana_csrf"),
      headerName: "x-csrf-token",
      tokenExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      path: "/",
    },
    database: {
      url: databaseUrl,
    },
    storage: {
      local: {
        directory: resolveStorageDirectory(
          getOptionalString(
            env,
            "AVANA_STORAGE_LOCAL_DIRECTORY",
            "./storage/uploads",
          ),
        ),
      },
    },
    redis: {
      url: getOptionalString(env, "REDIS_URL", "redis://localhost:6379"),
    },
    generation: {
      aiProvider: getOptionalString(env, "AI_PROVIDER", "mock"),
      queueName: getOptionalString(env, "AI_GENERATION_QUEUE", "content_generate"),
      geminiApiKey: env.GEMINI_API_KEY,
      geminiModel: getOptionalString(env, "GEMINI_MODEL", "gemini-3.6-flash"),
      cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
      cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
      cloudflareAiModel: getOptionalString(
        env,
        "CLOUDFLARE_AI_MODEL",
        "@cf/zai-org/glm-4.7-flash",
      ),
    },
  };
}
