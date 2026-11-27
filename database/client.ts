/**
 * Scoped database access layer for AVANA.
 *
 * Provides a configured Drizzle ORM client bound to a node-postgres pool
 * with environment-driven pool limits, timeouts, and optional SSL settings.
 */

import fs from "node:fs";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

const { Pool } = pg;

export type DbClient = NodePgDatabase<typeof schema>;
export type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
export type DbRunner = DbClient | TransactionClient;

export interface ScopedDb {
  db: DbClient;
  close: () => Promise<void>;
}

export interface DbPoolResolvedConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  idleInTransactionTimeoutMs: number;
  ssl?: false | { rejectUnauthorized: boolean; ca?: string };
}

function parseBoundedInt(
  raw: string | undefined,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") {
    return defaultValue;
  }
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new Error(`[DB_CLIENT_CONFIG] Invalid integer for ${name}: '${raw}'`);
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (parsed < min || parsed > max) {
    throw new Error(
      `[DB_CLIENT_CONFIG] ${name} must be between ${min} and ${max}, got ${parsed}`,
    );
  }
  return parsed;
}

export function resolvePoolConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): DbPoolResolvedConfig {
  // Default max=10 keeps API + Worker well within PostgreSQL default max_connections=100
  const max = parseBoundedInt(env.DB_POOL_MAX, "DB_POOL_MAX", 10, 1, 100);
  const idleTimeoutMillis = parseBoundedInt(
    env.DB_POOL_IDLE_TIMEOUT_MS,
    "DB_POOL_IDLE_TIMEOUT_MS",
    30_000,
    1_000,
    600_000,
  );
  const connectionTimeoutMillis = parseBoundedInt(
    env.DB_POOL_CONNECTION_TIMEOUT_MS,
    "DB_POOL_CONNECTION_TIMEOUT_MS",
    10_000,
    500,
    120_000,
  );
  const statementTimeoutMs = parseBoundedInt(
    env.DB_STATEMENT_TIMEOUT_MS,
    "DB_STATEMENT_TIMEOUT_MS",
    30_000,
    0,
    600_000,
  );
  const lockTimeoutMs = parseBoundedInt(
    env.DB_LOCK_TIMEOUT_MS,
    "DB_LOCK_TIMEOUT_MS",
    10_000,
    0,
    120_000,
  );
  const idleInTransactionTimeoutMs = parseBoundedInt(
    env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS",
    30_000,
    0,
    600_000,
  );

  let ssl: DbPoolResolvedConfig["ssl"];
  const sslMode = env.DB_SSL_MODE?.trim().toLowerCase();
  if (sslMode) {
    if (sslMode === "disable") {
      ssl = false;
    } else if (sslMode === "require") {
      ssl = { rejectUnauthorized: false };
    } else if (sslMode === "verify-full") {
      const caPath = env.DB_SSL_CA_PATH?.trim();
      const ca = caPath ? fs.readFileSync(caPath, "utf8") : undefined;
      ssl = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
    } else {
      throw new Error(
        `[DB_CLIENT_CONFIG] Unsupported DB_SSL_MODE '${env.DB_SSL_MODE}'. Allowed: disable, require, verify-full.`,
      );
    }
  }

  return {
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    statementTimeoutMs,
    lockTimeoutMs,
    idleInTransactionTimeoutMs,
    ...(ssl !== undefined ? { ssl } : {}),
  };
}

export function buildTimeoutConnectionOptions(cfg: DbPoolResolvedConfig): string {
  return [
    `-c statement_timeout=${cfg.statementTimeoutMs}`,
    `-c lock_timeout=${cfg.lockTimeoutMs}`,
    `-c idle_in_transaction_session_timeout=${cfg.idleInTransactionTimeoutMs}`,
  ].join(" ");
}

export function createDbClient(
  connectionString: string,
  env: Record<string, string | undefined> = process.env,
): ScopedDb {
  const cfg = resolvePoolConfigFromEnv(env);
  const timeoutOptions = buildTimeoutConnectionOptions(cfg);

  const pool = new Pool({
    connectionString,
    max: cfg.max,
    idleTimeoutMillis: cfg.idleTimeoutMillis,
    connectionTimeoutMillis: cfg.connectionTimeoutMillis,
    options: timeoutOptions,
    ...(cfg.ssl !== undefined ? { ssl: cfg.ssl } : {}),
  });
  const db = drizzle(pool, { schema }) as DbClient;
  return {
    db,
    close: async () => {
      await pool.end();
    },
  };
}
