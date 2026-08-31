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
  email: {
    provider: string;
    resendApiKey?: string;
    from: string;
  };
  systemOrganizationId: string;
  generation: {
    aiProvider: string;
    enableFallback: boolean;
    queueName: string;
    geminiApiKey?: string;
    geminiApiKeys: string[];
    geminiModel: string;
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    cloudflareAiModel: string;
    groqApiKey?: string;
    groqModel: string;
    gapgptApiKey?: string;
    gapgptBaseUrl?: string;
    gapgptModel: string;
    arvancloudApiKey?: string;
    arvancloudApiToken?: string;
    arvancloudBaseUrl?: string;
    arvancloudModel: string;
    arvancloudAuthScheme?: string;
  };
  auth: {
    enabled: boolean;
    demoUserEmail: string;
  };
};

function parseGeminiApiKeys(env: NodeJS.ProcessEnv): string[] {
  const keys: string[] = [];

  if (env.GEMINI_API_KEYS && env.GEMINI_API_KEYS.trim().length > 0) {
    const splitKeys = env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    keys.push(...splitKeys);
  }

  for (let i = 1; i <= 10; i++) {
    const key = env[`GEMINI_API_KEY_${i}`];
    if (key && key.trim().length > 0) {
      const trimmed = key.trim();
      if (!keys.includes(trimmed)) {
        keys.push(trimmed);
      }
    }
  }

  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0) {
    const trimmed = env.GEMINI_API_KEY.trim();
    if (!keys.includes(trimmed)) {
      keys.push(trimmed);
    }
  }

  return keys;
}

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
    email: {
      provider: getOptionalString(
        env,
        "EMAIL_PROVIDER",
        env.RESEND_API_KEY ? "resend" : "mock",
      ),
      resendApiKey: env.RESEND_API_KEY,
      from: getOptionalString(env, "EMAIL_FROM", "AVANA <onboarding@resend.dev>"),
    },
    systemOrganizationId: getOptionalString(
      env,
      "SYSTEM_ORGANIZATION_ID",
      "b4a0b464-16db-4087-92b7-163a1e6f6776",
    ),
    generation: {
      aiProvider: getOptionalString(
        env,
        "AI_PRIMARY_PROVIDER",
        getOptionalString(
          env,
          "AI_CONTENT_PROVIDER",
          getOptionalString(env, "AI_PROVIDER", "gemini"),
        ),
      ),
      enableFallback: env.AI_ENABLE_FALLBACK === "true",
      queueName: getOptionalString(env, "AI_GENERATION_QUEUE", "content_generate"),
      geminiApiKey: env.GEMINI_API_KEY,
      geminiApiKeys: parseGeminiApiKeys(env),
      geminiModel: getOptionalString(env, "GEMINI_MODEL", "gemini-3.6-flash"),
      cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
      cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
      cloudflareAiModel: getOptionalString(
        env,
        "CLOUDFLARE_AI_MODEL",
        "@cf/zai-org/glm-4.7-flash",
      ),
      groqApiKey: env.GROQ_API_KEY,
      groqModel: getOptionalString(
        env,
        "GROQ_MODEL",
        "openai/gpt-oss-120b",
      ),
      gapgptApiKey: env.GAPGPT_API_KEY,
      gapgptBaseUrl: env.GAPGPT_BASE_URL,
      gapgptModel: getOptionalString(env, "GAPGPT_MODEL", "gpt-5.6-luna"),
      arvancloudApiKey: env.ARVANCLOUD_API_KEY,
      arvancloudApiToken: env.ARVANCLOUD_API_TOKEN || env.ARVANCLOUD_API_KEY,
      arvancloudBaseUrl: getOptionalString(
        env,
        "ARVANCLOUD_BASE_URL",
        "https://arvancloudai.ir/gateway/models/DeepSeek-R1-qwen-7b-awq",
      ),
      arvancloudModel: getOptionalString(
        env,
        "ARVANCLOUD_MODEL",
        "DeepSeek-R1-qwen-7b-awq",
      ),
      arvancloudAuthScheme: env.ARVANCLOUD_AUTH_SCHEME,
    },
    auth: {
      enabled:
        env.AUTH_ENABLED !== undefined
          ? env.AUTH_ENABLED.trim().toLowerCase() === "true" ||
            env.AUTH_ENABLED.trim() === "1"
          : true,
      demoUserEmail: getOptionalString(
        env,
        "DEMO_USER_EMAIL",
        "ali1383mohammadlo@gmail.com",
      ),
    },
  };
}
