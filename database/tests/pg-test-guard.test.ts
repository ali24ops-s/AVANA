import { describe, it, expect } from "vitest";
import {
  resolveSafeDatabaseTestUrl,
  validateDatabaseTestUrl,
  assertSafeDestructiveDatabaseTestOp,
} from "./pg-test-guard.js";

describe("Database Test Guard (Fail-Closed)", () => {
  it("fails closed when TEST_DATABASE_URL is missing", () => {
    expect(() => resolveSafeDatabaseTestUrl("default", {})).toThrow(
      /Missing TEST_DATABASE_URL/,
    );
  });

  it("rejects TEST_DATABASE_URL matching DATABASE_URL", () => {
    const url =
      "postgres://avana_exam_test_user:pass@127.0.0.1:5432/avana_exam_test";
    expect(() =>
      resolveSafeDatabaseTestUrl("default", {
        DATABASE_URL: url,
        TEST_DATABASE_URL: url,
      }),
    ).toThrow(/must not match DATABASE_URL/);
  });

  it("rejects non-allowlisted database names", () => {
    expect(() =>
      validateDatabaseTestUrl(
        "postgres://avana_exam_test_user:pass@127.0.0.1:5432/avana",
        "default",
        {},
      ),
    ).toThrow(/not in allowlist/);
  });

  it("rejects privileged or production roles (avana, postgres, ops)", () => {
    for (const role of ["avana", "postgres", "ops"]) {
      expect(() =>
        validateDatabaseTestUrl(
          `postgres://${role}:pass@127.0.0.1:5432/avana_exam_test`,
          "default",
          {},
        ),
      ).toThrow(/not permitted/);
    }
  });

  it("rejects non-local hosts", () => {
    expect(() =>
      validateDatabaseTestUrl(
        "postgres://avana_exam_test_user:pass@prod.db.internal:5432/avana_exam_test",
        "default",
        {},
      ),
    ).toThrow(/Non-local host/);
  });

  it("rejects destructive operations on unauthorized databases", () => {
    expect(() =>
      assertSafeDestructiveDatabaseTestOp(
        "DROP_TABLE",
        "postgres://avana:pass@127.0.0.1:5432/avana",
        "default",
        {},
      ),
    ).toThrow(/not in allowlist/);
  });

  it("accepts valid isolated test URL and destructive operation", () => {
    const valid =
      "postgres://avana_exam_test_user:pass@127.0.0.1:5432/avana_exam_test?sslmode=disable";
    expect(
      resolveSafeDatabaseTestUrl("default", { TEST_DATABASE_URL: valid }),
    ).toBe(valid);
    expect(
      assertSafeDestructiveDatabaseTestOp("DELETE", valid, "default", {
        TEST_DATABASE_URL: valid,
      }),
    ).toBe(valid);
  });
});
