/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect } from "vitest";
import {
  assertSafeDestructiveTestOperation,
  assertSafePostgresTestUrl,
  resolveSafePostgresTestUrl,
} from "./pg-test-guard.js";

describe("PostgreSQL Integration Test Safety Guard (Profiles & Fail-Closed)", () => {
  const validDefaultUrl =
    "postgres://avana_exam_test_user:avana_exam_test_user@127.0.0.1:5432/avana_exam_test?sslmode=disable";
  const validCrmUrl =
    "postgres://avana_crm_test_user:pass@localhost:5432/avana_crm_test_pg?sslmode=disable";
  const validPollE2eUrl =
    "postgres://avana_poll_e2e_test_user:pass@127.0.0.1:5432/avana_poll_e2e_test_pg?sslmode=disable";

  it("allows default profile (avana_exam_test + avana_exam_test_user) and ignores DATABASE_URL/STAGING_DATABASE_URL", () => {
    expect(assertSafePostgresTestUrl(validDefaultUrl)).toBe(validDefaultUrl);
    expect(
      resolveSafePostgresTestUrl({
        TEST_DATABASE_URL: validDefaultUrl,
        DATABASE_URL: "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
        STAGING_DATABASE_URL: "postgres://avana:avana@127.0.0.1:5432/avana_staging",
      }),
    ).toBe(validDefaultUrl);
  });

  it("validates dedicated CRM and Poll E2E profiles independently", () => {
    expect(
      resolveSafePostgresTestUrl({ TEST_CRM_DATABASE_URL: validCrmUrl }, "crm"),
    ).toBe(validCrmUrl);
    expect(
      resolveSafePostgresTestUrl({ TEST_POLL_E2E_DATABASE_URL: validPollE2eUrl }, "poll_e2e"),
    ).toBe(validPollE2eUrl);

    // Cross-profile isolation: avana_exam_test cannot be used as CRM or Poll E2E profile
    expect(() => assertSafePostgresTestUrl(validDefaultUrl, "crm")).toThrow(
      /Refusing to connect to database 'avana_exam_test'/,
    );
    expect(() => assertSafePostgresTestUrl(validCrmUrl, "default")).toThrow(
      /Refusing to connect to database 'avana_crm_test_pg'/,
    );
    expect(() => assertSafePostgresTestUrl(validPollE2eUrl, "default")).toThrow(
      /Refusing to connect to database 'avana_poll_e2e_test_pg'/,
    );
  });

  it("rejects main development database 'avana' and production databases", () => {
    expect(() =>
      assertSafePostgresTestUrl(
        "postgres://avana_exam_test_user:pass@127.0.0.1:5432/avana?sslmode=disable",
      ),
    ).toThrow(/Refusing to connect to database 'avana'/);

    expect(() =>
      assertSafePostgresTestUrl(
        "postgres://avana_exam_test_user:pass@127.0.0.1:5432/avana_production",
      ),
    ).toThrow(/Refusing to connect to database 'avana_production'/);
  });

  it("rejects unauthorized hosts (remote/production hosts)", () => {
    expect(() =>
      assertSafePostgresTestUrl(
        "postgres://avana_exam_test_user:pass@prod.db.internal:5432/avana_exam_test",
      ),
    ).toThrow(/Refusing to connect to non-allowed host/);
  });

  it("rejects unauthorized or privileged database users", () => {
    expect(() =>
      assertSafePostgresTestUrl(
        "postgres://avana:avana@127.0.0.1:5432/avana_exam_test?sslmode=disable",
      ),
    ).toThrow(/Refusing to connect as database user 'avana'/);

    expect(() =>
      assertSafePostgresTestUrl(
        "postgres://postgres:postgres@127.0.0.1:5432/avana_exam_test",
      ),
    ).toThrow(/Refusing to connect as database user 'postgres'/);

    expect(() =>
      assertSafePostgresTestUrl("postgres://127.0.0.1:5432/avana_exam_test"),
    ).toThrow(/Refusing to connect as database user '\(empty\)'/);

    expect(() =>
      assertSafePostgresTestUrl(
        "postgres://ops@localhost:5432/avana_crm_test_pg",
        "crm",
      ),
    ).toThrow(/Refusing to connect as database user 'ops'/);
  });

  it("rejects empty or missing env vars without falling back to DATABASE_URL or STAGING_DATABASE_URL", () => {
    expect(() => resolveSafePostgresTestUrl({})).toThrow(/TEST_DATABASE_URL is required/);
    expect(() => resolveSafePostgresTestUrl({ TEST_DATABASE_URL: "   " })).toThrow(
      /TEST_DATABASE_URL is required/,
    );
    expect(() =>
      resolveSafePostgresTestUrl({
        DATABASE_URL: "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
        STAGING_DATABASE_URL: "postgres://avana:avana@127.0.0.1:5432/avana_staging",
      }),
    ).toThrow(/Refusing to fall back to DATABASE_URL/);
    expect(() => resolveSafePostgresTestUrl({}, "crm")).toThrow(
      /TEST_CRM_DATABASE_URL is required/,
    );
    expect(() => resolveSafePostgresTestUrl({}, "poll_e2e")).toThrow(
      /TEST_POLL_E2E_DATABASE_URL is required/,
    );
  });

  it("blocks destructive operations (migrations, cleanup, truncate) on non-test databases", () => {
    expect(() =>
      assertSafeDestructiveTestOperation(
        "run_migrations",
        "postgres://avana:avana@127.0.0.1:5432/avana",
      ),
    ).toThrow(/Blocked destructive test operation 'run_migrations'/);

    expect(() =>
      assertSafeDestructiveTestOperation(
        "afterAll_cleanup",
        "postgres://postgres:postgres@127.0.0.1:5432/avana_production",
      ),
    ).toThrow(/Blocked destructive test operation 'afterAll_cleanup'/);

    expect(
      assertSafeDestructiveTestOperation("run_migrations", validDefaultUrl),
    ).toBe(validDefaultUrl);
    expect(
      assertSafeDestructiveTestOperation("crm_cleanup", validCrmUrl, "crm"),
    ).toBe(validCrmUrl);
  });
});
