/**
 * Shared Fail-Closed PostgreSQL Integration Test Guard.
 *
 * Centralizes isolated test database profiles with strict allowlists for:
 * - Environment variable name (no fallback to DATABASE_URL or STAGING_DATABASE_URL)
 * - Database name
 * - Least-privilege database user
 * - Localhost-only hostnames
 *
 * Also guards all destructive test operations (migrations, seed, delete, truncate,
 * drop, reset, cleanup) prior to execution.
 */

export const REQUIRED_TEST_DB_NAME = "avana_exam_test";
export const REQUIRED_TEST_DB_USER = "avana_exam_test_user";

export type PostgresTestProfileName = "default" | "crm" | "poll_e2e";

export interface PostgresTestProfile {
  readonly name: PostgresTestProfileName;
  readonly envVar: string;
  readonly allowedDatabases: readonly string[];
  readonly allowedUsers: readonly string[];
  readonly allowedHosts: readonly string[];
}

export const POSTGRES_TEST_PROFILES: Readonly<Record<PostgresTestProfileName, PostgresTestProfile>> = {
  default: {
    name: "default",
    envVar: "TEST_DATABASE_URL",
    allowedDatabases: [REQUIRED_TEST_DB_NAME],
    allowedUsers: [REQUIRED_TEST_DB_USER],
    allowedHosts: ["127.0.0.1", "localhost"],
  },
  crm: {
    name: "crm",
    envVar: "TEST_CRM_DATABASE_URL",
    allowedDatabases: ["avana_crm_test_pg"],
    allowedUsers: ["avana_crm_test_user"],
    allowedHosts: ["127.0.0.1", "localhost"],
  },
  poll_e2e: {
    name: "poll_e2e",
    envVar: "TEST_POLL_E2E_DATABASE_URL",
    allowedDatabases: ["avana_poll_e2e_test_pg"],
    allowedUsers: ["avana_poll_e2e_test_user"],
    allowedHosts: ["127.0.0.1", "localhost"],
  },
};

function getProfile(profileName: PostgresTestProfileName): PostgresTestProfile {
  const profile = POSTGRES_TEST_PROFILES[profileName];
  if (!profile) {
    throw new Error(`[PG_TEST_GUARD] Unknown PostgreSQL test profile '${String(profileName)}'.`);
  }
  return profile;
}

/**
 * Validates an explicit test database URL against the specified profile's allowlists.
 * Throws a clear Error if any check fails.
 */
export function assertSafePostgresTestUrl(
  rawUrl: string | undefined,
  profileName: PostgresTestProfileName = "default",
): string {
  const profile = getProfile(profileName);

  if (!rawUrl || !rawUrl.trim()) {
    throw new Error(
      `[PG_TEST_GUARD:${profile.name}] ${profile.envVar} is required for PostgreSQL integration tests and must target [${profile.allowedDatabases.join(", ")}] as [${profile.allowedUsers.join(", ")}]. Refusing to fall back to DATABASE_URL or STAGING_DATABASE_URL.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`[PG_TEST_GUARD:${profile.name}] ${profile.envVar} is not a valid URL.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(
      `[PG_TEST_GUARD:${profile.name}] Unsupported protocol '${parsed.protocol}'. Expected 'postgres:' or 'postgresql:'.`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!profile.allowedHosts.includes(hostname)) {
    throw new Error(
      `[PG_TEST_GUARD:${profile.name}] Refusing to connect to non-allowed host '${parsed.hostname}'. Allowed hosts: [${profile.allowedHosts.join(", ")}].`,
    );
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!profile.allowedDatabases.includes(dbName)) {
    throw new Error(
      `[PG_TEST_GUARD:${profile.name}] Refusing to connect to database '${dbName}'. Allowed databases: [${profile.allowedDatabases.join(", ")}].`,
    );
  }

  const dbUser = decodeURIComponent(parsed.username);
  if (!dbUser || !profile.allowedUsers.includes(dbUser)) {
    throw new Error(
      `[PG_TEST_GUARD:${profile.name}] Refusing to connect as database user '${dbUser || "(empty)"}'. Allowed users: [${profile.allowedUsers.join(", ")}].`,
    );
  }

  return rawUrl.trim();
}

/**
 * Resolves and validates the dedicated test env var for the given profile.
 * Strictly ignores `DATABASE_URL` and `STAGING_DATABASE_URL`.
 */
export function resolveSafePostgresTestUrl(
  env: Record<string, string | undefined> = process.env,
  profileName: PostgresTestProfileName = "default",
): string {
  const profile = getProfile(profileName);
  return assertSafePostgresTestUrl(env[profile.envVar], profileName);
}

/**
 * Pre-flight guard for destructive test operations (migrations, seed, delete, truncate,
 * drop, reset, cleanup). Verifies the target URL matches the profile allowlist before execution.
 */
export function assertSafeDestructiveTestOperation(
  operationName: string,
  rawUrl: string | undefined,
  profileName: PostgresTestProfileName = "default",
): string {
  try {
    return assertSafePostgresTestUrl(rawUrl, profileName);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[PG_TEST_GUARD] Blocked destructive test operation '${operationName}': ${reason}`,
    );
  }
}
