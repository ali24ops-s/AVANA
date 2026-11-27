import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import {
  resolvePoolConfigFromEnv,
  buildTimeoutConnectionOptions,
  createDbClient,
} from "../client.js";
import { resolveSafeDatabaseTestUrl } from "./pg-test-guard.js";

describe("Database Client Pool & Timeout Configuration", () => {
  it("provides safe defaults when env vars are unset", () => {
    const cfg = resolvePoolConfigFromEnv({});
    expect(cfg).toEqual({
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statementTimeoutMs: 30_000,
      lockTimeoutMs: 10_000,
      idleInTransactionTimeoutMs: 30_000,
    });
    expect(buildTimeoutConnectionOptions(cfg)).toBe(
      "-c statement_timeout=30000 -c lock_timeout=10000 -c idle_in_transaction_session_timeout=30000",
    );
  });

  it("explicitly emits 0 in PostgreSQL connection options when timeouts are set to 0", () => {
    const cfg = resolvePoolConfigFromEnv({
      DB_STATEMENT_TIMEOUT_MS: "0",
      DB_LOCK_TIMEOUT_MS: "0",
      DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "0",
    });
    expect(cfg.statementTimeoutMs).toBe(0);
    expect(cfg.lockTimeoutMs).toBe(0);
    expect(cfg.idleInTransactionTimeoutMs).toBe(0);
    expect(buildTimeoutConnectionOptions(cfg)).toBe(
      "-c statement_timeout=0 -c lock_timeout=0 -c idle_in_transaction_session_timeout=0",
    );
  });

  it("accepts valid positive overrides and SSL modes", () => {
    const cfg = resolvePoolConfigFromEnv({
      DB_POOL_MAX: "20",
      DB_POOL_IDLE_TIMEOUT_MS: "15000",
      DB_POOL_CONNECTION_TIMEOUT_MS: "5000",
      DB_STATEMENT_TIMEOUT_MS: "45000",
      DB_LOCK_TIMEOUT_MS: "2500",
      DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "12000",
      DB_SSL_MODE: "require",
    });
    expect(cfg.max).toBe(20);
    expect(cfg.statementTimeoutMs).toBe(45_000);
    expect(cfg.lockTimeoutMs).toBe(2500);
    expect(cfg.idleInTransactionTimeoutMs).toBe(12_000);
    expect(cfg.ssl).toEqual({ rejectUnauthorized: false });
    expect(buildTimeoutConnectionOptions(cfg)).toBe(
      "-c statement_timeout=45000 -c lock_timeout=2500 -c idle_in_transaction_session_timeout=12000",
    );
  });

  it("rejects negative, out-of-bounds, non-integer values, and unknown SSL modes", () => {
    expect(() => resolvePoolConfigFromEnv({ DB_POOL_MAX: "0" })).toThrow(/DB_POOL_MAX/);
    expect(() => resolvePoolConfigFromEnv({ DB_POOL_MAX: "101" })).toThrow(/DB_POOL_MAX/);
    expect(() => resolvePoolConfigFromEnv({ DB_STATEMENT_TIMEOUT_MS: "-1" })).toThrow(
      /DB_STATEMENT_TIMEOUT_MS/,
    );
    expect(() => resolvePoolConfigFromEnv({ DB_LOCK_TIMEOUT_MS: "-5" })).toThrow(
      /DB_LOCK_TIMEOUT_MS/,
    );
    expect(() =>
      resolvePoolConfigFromEnv({ DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "-10" }),
    ).toThrow(/DB_IDLE_IN_TRANSACTION_TIMEOUT_MS/);
    expect(() => resolvePoolConfigFromEnv({ DB_STATEMENT_TIMEOUT_MS: "abc" })).toThrow(
      /DB_STATEMENT_TIMEOUT_MS/,
    );
    expect(() => resolvePoolConfigFromEnv({ DB_SSL_MODE: "allow" })).toThrow(/DB_SSL_MODE/);
  });

  it("applies explicit 0 and positive timeouts to real PostgreSQL sessions on isolated test DB", async () => {
    const dbUrl = resolveSafeDatabaseTestUrl("default");

    const zeroClient = createDbClient(dbUrl, {
      DB_STATEMENT_TIMEOUT_MS: "0",
      DB_LOCK_TIMEOUT_MS: "0",
      DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "0",
    });
    try {
      const res = await zeroClient.db.execute(
        sql`SELECT current_setting('statement_timeout') AS st, current_setting('lock_timeout') AS lt, current_setting('idle_in_transaction_session_timeout') AS it;`,
      );
      expect(res.rows[0]).toEqual({ st: "0", lt: "0", it: "0" });
    } finally {
      await zeroClient.close();
    }

    const posClient = createDbClient(dbUrl, {
      DB_STATEMENT_TIMEOUT_MS: "15000",
      DB_LOCK_TIMEOUT_MS: "5000",
      DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: "20000",
    });
    try {
      const res = await posClient.db.execute(
        sql`SELECT current_setting('statement_timeout') AS st, current_setting('lock_timeout') AS lt, current_setting('idle_in_transaction_session_timeout') AS it;`,
      );
      expect(res.rows[0]).toEqual({ st: "15s", lt: "5s", it: "20s" });
    } finally {
      await posClient.close();
    }
  });
});
