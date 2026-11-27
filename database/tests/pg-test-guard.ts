/**
 * Fail-Closed PostgreSQL Test Guard for @avana/database tests.
 *
 * Mirrors apps/api/src/test/pg-test-guard.ts without cross-workspace imports:
 * - Never falls back to DATABASE_URL or STAGING_DATABASE_URL
 * - Enforces explicit test-only env vars, DB names, non-privileged users, and localhost hosts
 * - Guards destructive DDL/DML test operations before execution
 */

export type DatabaseTestProfileName = "default" | "tracker_isolated";

export interface DatabaseTestProfile {
  readonly name: DatabaseTestProfileName;
  readonly envVar: string;
  readonly allowedDatabases: readonly string[];
  readonly allowedUsers: readonly string[];
  readonly forbiddenUsers: readonly string[];
  readonly allowedHosts: readonly string[];
}

export const DATABASE_TEST_PROFILES: Readonly<
  Record<DatabaseTestProfileName, DatabaseTestProfile>
> = {
  default: {
    name: "default",
    envVar: "TEST_DATABASE_URL",
    allowedDatabases: ["avana_exam_test"],
    allowedUsers: ["avana_exam_test_user"],
    forbiddenUsers: ["avana", "postgres", "ops"],
    allowedHosts: ["127.0.0.1", "localhost"],
  },
  tracker_isolated: {
    name: "tracker_isolated",
    envVar: "TEST_TRACKER_DATABASE_URL",
    allowedDatabases: ["avana_test_tracker_isolated"],
    allowedUsers: ["avana_exam_test_user", "avana_tracker_test_user"],
    forbiddenUsers: ["avana", "postgres", "ops"],
    allowedHosts: ["127.0.0.1", "localhost"],
  },
};

export function validateDatabaseTestUrl(
  rawUrl: string | undefined,
  profileName: DatabaseTestProfileName = "default",
  env: Record<string, string | undefined> = process.env,
): string {
  const profile = DATABASE_TEST_PROFILES[profileName];
  if (!profile) {
    throw new Error(`[DB_TEST_GUARD] Unknown test profile '${String(profileName)}'.`);
  }

  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    throw new Error(
      `[DB_TEST_GUARD] Missing ${profile.envVar} for profile '${profile.name}'. ` +
        `Refusing to fall back to DATABASE_URL or default local credentials.`,
    );
  }

  if (env.DATABASE_URL && trimmed === env.DATABASE_URL.trim()) {
    throw new Error(
      `[DB_TEST_GUARD] ${profile.envVar} must not match DATABASE_URL.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`[DB_TEST_GUARD] Invalid URL format in ${profile.envVar}.`);
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`[DB_TEST_GUARD] Unsupported protocol '${parsed.protocol}'.`);
  }

  const host = parsed.hostname.toLowerCase();
  if (!profile.allowedHosts.includes(host)) {
    throw new Error(
      `[DB_TEST_GUARD] Non-local host '${host}' is forbidden for test profile '${profile.name}'.`,
    );
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  if (!profile.allowedDatabases.includes(dbName)) {
    throw new Error(
      `[DB_TEST_GUARD] Database '${dbName}' is not in allowlist [${profile.allowedDatabases.join(", ")}].`,
    );
  }

  const username = decodeURIComponent(parsed.username);
  if (profile.forbiddenUsers.includes(username) || !profile.allowedUsers.includes(username)) {
    throw new Error(
      `[DB_TEST_GUARD] Role '${username || "<empty>"}' is not permitted for test profile '${profile.name}'.`,
    );
  }

  return trimmed;
}

export function resolveSafeDatabaseTestUrl(
  profileName: DatabaseTestProfileName = "default",
  env: Record<string, string | undefined> = process.env,
): string {
  const profile = DATABASE_TEST_PROFILES[profileName];
  return validateDatabaseTestUrl(env[profile.envVar], profileName, env);
}

export function assertSafeDestructiveDatabaseTestOp(
  operation: string,
  url: string | undefined,
  profileName: DatabaseTestProfileName = "default",
  env: Record<string, string | undefined> = process.env,
): string {
  const validated = validateDatabaseTestUrl(url, profileName, env);
  if (!operation || !operation.trim()) {
    throw new Error("[DB_TEST_GUARD] Destructive operation name is required.");
  }
  return validated;
}
