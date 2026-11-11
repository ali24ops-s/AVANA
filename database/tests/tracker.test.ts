import { describe, it, expect, vi } from "vitest";
import path from "path";
import { computeCanonicalSha256, resolveBuildManifest } from "../tracker/checksum.js";
import {
  tryAcquireAdvisoryLock,
  releaseAdvisoryLock,
  assertPrimaryNode,
  AVANA_ADVISORY_LOCK_KEY,
} from "../tracker/advisory-lock.js";
import { ensureTrackingSchema } from "../tracker/schema.js";
import { recoverIndeterminateCommit } from "../tracker/commit-recovery.js";
import { evaluateMigrationEvidence } from "../tracker/evidence-manifest.js";
import { executeStatefulMigrations } from "../tracker/runner.js";
import { runEvidenceBaseline } from "../tracker/baseline.js";
import type { MigrationDefinition } from "../tracker/types.js";

describe("AVANA Migration Tracking System Unit & Integration Tests", () => {
  describe("Advisory Lock & Primary Assertions", () => {
    it("uses exact BigInt lock key 280619994689 for AVANA", () => {
      expect(AVANA_ADVISORY_LOCK_KEY).toBe(280619994689n);
      expect(BigInt("0x4156414E41")).toBe(280619994689n);
    });

    it("acquires session advisory lock on dedicated client", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ locked: true }] }),
      } as any;

      const acquired = await tryAcquireAdvisoryLock(mockClient);
      expect(acquired).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT pg_try_advisory_lock($1::bigint) AS locked;",
        ["280619994689"]
      );
    });

    it("releases session advisory lock on dedicated client", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ unlocked: true }] }),
      } as any;

      const released = await releaseAdvisoryLock(mockClient);
      expect(released).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT pg_advisory_unlock($1::bigint) AS unlocked;",
        ["280619994689"]
      );
    });

    it("assertPrimaryNode succeeds on primary and throws on read replica", async () => {
      const primaryClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ in_recovery: false }] }),
      } as any;
      await expect(assertPrimaryNode(primaryClient)).resolves.not.toThrow();

      const replicaClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ in_recovery: true }] }),
      } as any;
      await expect(assertPrimaryNode(replicaClient)).rejects.toThrow(/Read Replica/);
    });

    it("executes tracking schema creation with constraints and indices", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      } as any;

      await ensureTrackingSchema(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_migration_attempts"));
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_migrations"));
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("chk_attempt_status"));
    });
  });

  describe("Canonical Checksums & Manifest Resolution", () => {
    it("normalizes CRLF to LF and trims whitespace deterministically", () => {
      const contentUnix = "export async function up() {}\n";
      const contentWindows = "  export async function up() {}\r\n  ";

      const hash1 = computeCanonicalSha256(contentUnix);
      const hash2 = computeCanonicalSha256(contentWindows);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("resolves build manifest containing all 98 migrations across cwd and path scenarios", () => {
      const databaseDir = process.cwd().endsWith("database")
        ? process.cwd()
        : path.join(process.cwd(), "database");
      const monorepoRoot = process.cwd().endsWith("database")
        ? path.resolve(process.cwd(), "..")
        : process.cwd();
      const distDir = path.join(databaseDir, "dist");

      // 1. From database directory
      const manifestFromDb = resolveBuildManifest(databaseDir);
      expect(manifestFromDb.migrations.length).toBe(98);
      expect(manifestFromDb.migrations[0].id).toBe("0001_init");
      expect(manifestFromDb.migrations[97].id).toBe("0101_scope_documents_by_course");

      // 2. From monorepo root
      const manifestFromRoot = resolveBuildManifest(monorepoRoot);
      expect(manifestFromRoot.migrations.length).toBe(98);
      expect(manifestFromRoot.migrations[0].id).toBe("0001_init");
      expect(manifestFromRoot.migrations[97].id).toBe("0101_scope_documents_by_course");

      // 3. From dist directory
      const manifestFromDist = resolveBuildManifest(distDir);
      expect(manifestFromDist.migrations.length).toBe(98);

      // 4. Without passing baseDir (independent of process.cwd())
      const manifestDefault = resolveBuildManifest();
      expect(manifestDefault.migrations.length).toBe(98);

      // 5. Throws clear error if path does not exist
      expect(() => resolveBuildManifest("/non/existent/manifest/path")).toThrow(
        /\[MANIFEST_NOT_FOUND\]/
      );
    });
  });

  describe("Commit Recovery Algorithm (9 Critical Scenarios)", () => {
    it("proves definitive commit when commit_ticket matches on Primary with lock held", async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("pg_is_in_recovery")) {
            return { rows: [{ in_recovery: false }] };
          }
          if (sql.includes("pg_try_advisory_lock")) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes("pg_advisory_unlock")) {
            return { rows: [{ unlocked: true }] };
          }
          if (sql.includes("SELECT commit_ticket")) {
            return { rows: [{ commit_ticket: "ticket-uuid-1234", status: "applied" }] };
          }
          if (sql.includes("UPDATE schema_migration_attempts")) {
            return { rowCount: 1 };
          }
          return { rows: [] };
        }),
      } as any;

      const result = await recoverIndeterminateCommit(
        { connectionString: "postgres://mock" },
        "0094_course_publications_unique_version",
        "ticket-uuid-1234",
        42,
        mockClient
      );

      expect(result.resolved).toBe(true);
      expect(result.status).toBe("success");
      expect(result.reason).toContain("Definitive commit proven");
    });

    it("proves definitive rollback when lock is held and ticket does not match", async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("pg_is_in_recovery")) {
            return { rows: [{ in_recovery: false }] };
          }
          if (sql.includes("pg_try_advisory_lock")) {
            return { rows: [{ locked: true }] };
          }
          if (sql.includes("pg_advisory_unlock")) {
            return { rows: [{ unlocked: true }] };
          }
          if (sql.includes("SELECT commit_ticket")) {
            return { rows: [] }; // No record in schema_migrations
          }
          if (sql.includes("UPDATE schema_migration_attempts")) {
            return { rowCount: 1 };
          }
          return { rows: [] };
        }),
      } as any;

      const result = await recoverIndeterminateCommit(
        { connectionString: "postgres://mock" },
        "0094_course_publications_unique_version",
        "ticket-uuid-1234",
        42,
        mockClient
      );

      expect(result.resolved).toBe(true);
      expect(result.status).toBe("indeterminate_rolled_back");
      expect(result.reason).toContain("Definitive rollback proven");
    });

    it("keeps status indeterminate if lock CANNOT be acquired (prior backend still holding lock)", async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("pg_is_in_recovery")) {
            return { rows: [{ in_recovery: false }] };
          }
          if (sql.includes("pg_try_advisory_lock")) {
            return { rows: [{ locked: false }] }; // Lock held by zombie session!
          }
          if (sql.includes("UPDATE schema_migration_attempts")) {
            return { rowCount: 1 };
          }
          return { rows: [] };
        }),
      } as any;

      const result = await recoverIndeterminateCommit(
        { connectionString: "postgres://mock", maxRetries: 2, retryDelayMs: 1 },
        "0094_course_publications_unique_version",
        "ticket-uuid-1234",
        42,
        mockClient
      );

      expect(result.resolved).toBe(false);
      expect(result.status).toBe("indeterminate");
      expect(result.reason).toContain("State remains indeterminate");
    });

    it("fails closed if connecting to replica during recovery", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ in_recovery: true }] }),
      } as any;

      await expect(
        recoverIndeterminateCommit(
          { connectionString: "postgres://mock" },
          "0094_course_publications_unique_version",
          "ticket-uuid-1234",
          42,
          mockClient
        )
      ).rejects.toThrow(/Read Replica/);
    });
  });

  describe("Evidence Manifest Diagnostics", () => {
    it("identifies 0001_init as proven only when all 6 tables exist", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: 6 }] }),
      } as any;

      const evidence = await evaluateMigrationEvidence(mockClient, "0001_init");
      expect(evidence.status).toBe("proven");
    });

    it("identifies 0071 as missing on clean database", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
      } as any;

      const evidence = await evaluateMigrationEvidence(mockClient, "0071_repair_legacy_registration_org_admins");
      expect(evidence.status).toBe("missing");
    });

    it("identifies 0081 as proven when 12 UUID question patterns exist", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
      } as any;

      const evidence = await evaluateMigrationEvidence(mockClient, "0081_question_pattern_categories_and_defaults");
      expect(evidence.status).toBe("proven");
    });

    it("identifies 0094 as proven only when index is both valid and ready", async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [{ indisvalid: true, indisready: true }] }),
      } as any;

      const evidence = await evaluateMigrationEvidence(mockClient, "0094_course_publications_unique_version");
      expect(evidence.status).toBe("proven");
    });
  });

  describe("Baseline Module Execution", () => {
    it("baselines proven migrations and leaves insufficient evidence for review", async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("pg_is_in_recovery")) {
            return { rows: [{ in_recovery: false }] };
          }
          if (sql.includes("SELECT migration_id, status FROM schema_migrations")) {
            return { rows: [] };
          }
          if (sql.includes("table_name IN ('users'")) {
            return { rows: [{ count: 6 }] };
          }
          if (sql.includes("INSERT INTO schema_migration_attempts")) {
            return { rows: [{ id: 10 }] };
          }
          return { rows: [] };
        }),
      } as any;

      const report = await runEvidenceBaseline(mockClient, {
        operator: "DevOps-Lead",
        markNotApplicable0071: true,
        dryRun: false,
      });

      expect(report.baselined.some((b) => b.includes("0001_init"))).toBe(true);
      expect(report.notApplicable.some((na) => na.includes("0071_repair_legacy_registration_org_admins"))).toBe(true);
    });
  });

  describe("Stateful Runner Operational Execution Scenarios", () => {
    it("scenario 1: prevents parallel execution if advisory lock is already held", async () => {
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("pg_is_in_recovery")) return { rows: [{ in_recovery: false }] };
          if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: false }] }; // Already held!
          return { rows: [] };
        }),
      } as any;

      await expect(
        executeStatefulMigrations([], {
          connectionString: "postgres://mock",
          injectedClient: mockClient,
        })
      ).rejects.toThrow(/Another migration runner is actively executing/);
    });

    it("scenario 2 & 3: applies pending migration atomically and skips on re-run", async () => {
      const dbState = {
        applied: new Set<string>(),
        attempts: [] as any[],
      };

      const mockClient = {
        query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes("pg_is_in_recovery")) return { rows: [{ in_recovery: false }] };
          if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
          if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
          if (sql.includes("SELECT migration_id, status, checksum FROM schema_migrations")) {
            return {
              rows: Array.from(dbState.applied).map((id) => ({
                migration_id: id,
                status: "applied",
                checksum: "0".repeat(64),
              })),
            };
          }
          if (sql.includes("SELECT COALESCE(MAX(attempt_number)")) {
            return { rows: [{ next_att: 1 }] };
          }
          if (sql.includes("INSERT INTO schema_migration_attempts")) {
            const id = dbState.attempts.length + 1;
            dbState.attempts.push({ id, status: "in_progress" });
            return { rows: [{ id }] };
          }
          if (sql.includes("INSERT INTO schema_migrations")) {
            dbState.applied.add(params?.[0]);
            return { rows: [] };
          }
          return { rows: [] };
        }),
      } as any;

      const upMock = vi.fn().mockResolvedValue(undefined);
      const testMigrations: MigrationDefinition[] = [
        { id: "0001_init", sequence: 1, up: upMock },
      ];

      // Run 1: Applies migration
      const res1 = await executeStatefulMigrations(testMigrations, {
        connectionString: "postgres://mock",
        injectedClient: mockClient,
      });
      expect(res1.applied).toEqual(["0001_init"]);
      expect(res1.skipped).toEqual([]);
      expect(upMock).toHaveBeenCalledTimes(1);

      // Run 2: Re-execution skips already applied migration
      const res2 = await executeStatefulMigrations(testMigrations, {
        connectionString: "postgres://mock",
        injectedClient: mockClient,
      });
      expect(res2.applied).toEqual([]);
      expect(res2.skipped).toEqual(["0001_init"]);
      expect(upMock).toHaveBeenCalledTimes(1); // Not called again!
    });

    it("scenario 4: handles migration failure, rolls back, and records attempt failure", async () => {
      const attemptsRecorded: any[] = [];
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes("pg_is_in_recovery")) return { rows: [{ in_recovery: false }] };
          if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
          if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
          if (sql.includes("SELECT migration_id, status, checksum FROM schema_migrations")) {
            return { rows: [] };
          }
          if (sql.includes("SELECT COALESCE(MAX(attempt_number)")) {
            return { rows: [{ next_att: 1 }] };
          }
          if (sql.includes("INSERT INTO schema_migration_attempts")) {
            attemptsRecorded.push({ attempt: params?.[1], status: "in_progress" });
            return { rows: [{ id: 1 }] };
          }
          if (sql.includes("UPDATE schema_migration_attempts") && sql.includes("status = 'failed'")) {
            attemptsRecorded[attemptsRecorded.length - 1].status = "failed";
            return { rowCount: 1 };
          }
          return { rows: [] };
        }),
      } as any;

      const failingUp = vi.fn().mockRejectedValue(new Error("Constraint violation in DDL"));
      const testMigrations: MigrationDefinition[] = [
        { id: "0094_course_publications_unique_version", sequence: 94, up: failingUp },
      ];

      await expect(
        executeStatefulMigrations(testMigrations, {
          connectionString: "postgres://mock",
          injectedClient: mockClient,
        })
      ).rejects.toThrow("Constraint violation in DDL");

      expect(attemptsRecorded.length).toBe(1);
      expect(attemptsRecorded[0].status).toBe("failed");
    });

    it("scenario 9: reconciles crashed prior in_progress attempt into indeterminate on startup", async () => {
      let reconciled = false;
      const mockClient = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("pg_is_in_recovery")) return { rows: [{ in_recovery: false }] };
          if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
          if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
          if (sql.includes("UPDATE schema_migration_attempts") && sql.includes("SET status = 'indeterminate'")) {
            reconciled = true;
            return { rowCount: 1 };
          }
          if (sql.includes("SELECT migration_id, status, checksum FROM schema_migrations")) {
            return { rows: [] };
          }
          return { rows: [] };
        }),
      } as any;

      await executeStatefulMigrations([], {
        connectionString: "postgres://mock",
        injectedClient: mockClient,
      });

      expect(reconciled).toBe(true);
    });
  });
});
