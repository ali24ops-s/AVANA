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
};

function getOptionalString(name: string, fallback: string): string {
  const v = process.env[name];
  return v ?? fallback;
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

  const host = getOptionalString("AVANA_API_HOST", "127.0.0.1");
  const portRaw = getOptionalString("AVANA_API_PORT", "3000");
  const port = parsePort(portRaw);

  const jsonBodyLimitRaw = getOptionalString(
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

  const databaseUrl = getOptionalString("DATABASE_URL", localDatabaseUrl());

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
      cookieName: getOptionalString("AVANA_SESSION_COOKIE", "avana_session"),
      secure: isProd,
      sameSite: "lax",
      maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    },
    csrf: {
      cookieName: getOptionalString("AVANA_CSRF_COOKIE", "avana_csrf"),
      headerName: "x-csrf-token",
      tokenExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
      secure: isProd,
      sameSite: isProd ? "strict" : "lax",
      path: "/",
    },
    database: {
      url: databaseUrl,
    },
  };
}
