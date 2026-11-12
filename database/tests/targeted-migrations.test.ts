/* eslint-disable @typescript-eslint/no-explicit-any, no-secrets/no-secrets */
import { describe, it, expect, vi } from "vitest";
import path from "path";
import {
  TARGETED_MIGRATION_IDS,
  resolveTargetedMigrations,
  parseCliArgs,
  isDirectCliExecution,
} from "../migrate.js";
import { ALL_MIGRATIONS } from "../tracker/registry.js";
import { executeStatefulMigrations } from "../tracker/runner.js";
import { resolveBuildManifest, computeFileSha256 } from "../tracker/checksum.js";
import type { MigrationDefinition } from "../tracker/types.js";

describe("AVANA Targeted Migrations Execution Suite", () => {
  describe("Scope & Registry Whitelist Verification", () => {
    it("contains strictly and exactly the 12 pre-approved migrations", () => {
      expect(TARGETED_MIGRATION_IDS).toEqual([
        "0088_crm_core",
        "0089_crm_segments",
        "0090_course_membership_exam_schedules",
        "0091_backfill_personal_course_exam_schedules",
        "0094_course_publications_unique_version",
        "0095_presentation_assistant_core",
        "0096_user_personal_contents",
        "0097_mind_map_personal_content_type",
        "0098_error_monitoring_core",
        "0099_crm_campaigns",
        "0100_crm_campaign_dispatch",
        "0101_scope_documents_by_course",
      ]);
      expect(TARGETED_MIGRATION_IDS.length).toBe(12);
    });

    it("strictly excludes 0042, 0071, 0092, 0093, and all historical/out-of-scope migrations", () => {
      const targetedSet = new Set<string>(TARGETED_MIGRATION_IDS);
      expect(targetedSet.has("0042_special_exam_entitlements")).toBe(false);
      expect(targetedSet.has("0071_repair_legacy_registration_org_admins")).toBe(false);
      expect(targetedSet.has("0001_init")).toBe(false);
      expect(targetedSet.has("0092_update_question_pattern_instructions_and_examples")).toBe(false);
      expect(targetedSet.has("0093_update_patterns_3_6_8_11_v3")).toBe(false);
      expect(targetedSet.has("0090_course_membership_exam_schedules")).toBe(true);
      expect(targetedSet.has("0091_backfill_personal_course_exam_schedules")).toBe(true);
      expect(targetedSet.has("0094_course_publications_unique_version")).toBe(true);
      expect(targetedSet.has("0095_presentation_assistant_core")).toBe(true);
      expect(targetedSet.has("0098_error_monitoring_core")).toBe(true);
    });

    it("resolves all 12 migrations from ALL_MIGRATIONS in exact registry order", () => {
      const targeted = resolveTargetedMigrations(ALL_MIGRATIONS);
      expect(targeted.length).toBe(12);

      const resolvedIds = targeted.map((m) => m.id);
      expect(resolvedIds).toEqual([...TARGETED_MIGRATION_IDS]);

      const sequences = targeted.map((m) => m.sequence);
      expect(sequences).toEqual([88, 89, 90, 91, 94, 95, 96, 97, 98, 99, 100, 101]);

      // Every targeted migration must have an up function
      for (const m of targeted) {
        expect(typeof m.up).toBe("function");
      }
    });

    it("fails closed if any expected targeted migration is missing from registry", () => {
      const incompleteList: MigrationDefinition[] = ALL_MIGRATIONS.filter(
        (m) => m.id !== "0101_scope_documents_by_course"
      );

      expect(() => resolveTargetedMigrations(incompleteList)).toThrow(
        /\[TARGETED_MIGRATION_ERROR\] Missing expected targeted migration\(s\) in registry: 0101_scope_documents_by_course/
      );
    });
  });

  describe("CLI Argument Parsing & Incompatible Flag Rejection", () => {
    it("parses --only-targeted flag correctly", () => {
      const args = parseCliArgs(["node", "migrate.ts", "--only-targeted"]);
      expect(args.isOnlyTargeted).toBe(true);
      expect(args.isBaseline).toBe(false);
      expect(args.isVerify).toBe(false);
      expect(args.isDryRun).toBe(false);
    });

    it("defaults isOnlyTargeted to false when running standard runner", () => {
      const args = parseCliArgs(["node", "migrate.ts"]);
      expect(args.isOnlyTargeted).toBe(false);
      expect(args.isBaseline).toBe(false);
      expect(args.isVerify).toBe(false);
    });

    it("rejects unknown arguments or arbitrary migration identifiers", () => {
      expect(() => parseCliArgs(["node", "migrate.ts", "--only-targeted=0042"])).toThrow(
        /\[CLI_ERROR\] Unrecognized or invalid argument/
      );

      expect(() => parseCliArgs(["node", "migrate.ts", "--only", "0088_crm_core"])).toThrow(
        /\[CLI_ERROR\] Unrecognized or invalid argument/
      );

      expect(() => parseCliArgs(["node", "migrate.ts", "--migrations", "0088"])).toThrow(
        /\[CLI_ERROR\] Unrecognized or invalid argument/
      );
    });

    it("rejects --only-targeted combined with --baseline", () => {
      expect(() =>
        parseCliArgs(["node", "migrate.ts", "--only-targeted", "--baseline"])
      ).toThrow(/--only-targeted cannot be combined with --baseline/);
    });

    it("rejects --only-targeted combined with --verify", () => {
      expect(() =>
        parseCliArgs(["node", "migrate.ts", "--only-targeted", "--verify"])
      ).toThrow(/--only-targeted cannot be combined with --verify/);
    });

    it("rejects --only-targeted combined with --dry-run", () => {
      expect(() =>
        parseCliArgs(["node", "migrate.ts", "--only-targeted", "--dry-run"])
      ).toThrow(
        /--only-targeted cannot be combined with --dry-run because the current dry-run implementation is not fully read-only/
      );
    });

    it("rejects --only-targeted combined with --mark-not-applicable-0071", () => {
      expect(() =>
        parseCliArgs(["node", "migrate.ts", "--only-targeted", "--mark-not-applicable-0071"])
      ).toThrow(/--only-targeted cannot be combined with --mark-not-applicable-0071/);
    });
  });

  describe("Standard ESM Direct Execution Guard Verification", () => {
    it("returns true only when invoked path matches the module path outside test environment", () => {
      const originalVitest = process.env.VITEST;
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = "production";

      try {
        const dummyModuleUrl = "file:///Users/ops/Desktop/avana-landing-and-onboarding/database/migrate.ts";
        const matchingPath = "/Users/ops/Desktop/avana-landing-and-onboarding/database/migrate.ts";
        const differentPath = "/Users/ops/Desktop/avana-landing-and-onboarding/tools/worker/worker-setup.ts";

        expect(isDirectCliExecution(matchingPath, dummyModuleUrl)).toBe(true);
        expect(isDirectCliExecution(differentPath, dummyModuleUrl)).toBe(false);
        expect(isDirectCliExecution(undefined, dummyModuleUrl)).toBe(false);
      } finally {
        process.env.VITEST = originalVitest;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("returns false inside test runners even if paths match", () => {
      const dummyModuleUrl = "file:///Users/ops/Desktop/avana-landing-and-onboarding/database/migrate.ts";
      const matchingPath = "/Users/ops/Desktop/avana-landing-and-onboarding/database/migrate.ts";
      expect(isDirectCliExecution(matchingPath, dummyModuleUrl)).toBe(false);
    });
  });

  describe("Official Manifest Checksums Integrity", () => {
    it("ensures all 12 targeted migrations exist with valid SHA-256 in official manifest", () => {
      const databaseDir = process.cwd().endsWith("database")
        ? process.cwd()
        : path.join(process.cwd(), "database");
      const manifest = resolveBuildManifest(databaseDir);
      const manifestMap = new Map(manifest.migrations.map((m) => [m.id, m]));

      for (const id of TARGETED_MIGRATION_IDS) {
        const entry = manifestMap.get(id);
        expect(entry).toBeDefined();
        expect(entry?.source_sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(entry?.source_file).toBe(`${id}.ts`);
      }
    });

    it("verifies that actual on-disk migration file SHA-256 matches official manifest source_sha256 for all 12 migrations", () => {
      const databaseDir = process.cwd().endsWith("database")
        ? process.cwd()
        : path.join(process.cwd(), "database");
      const manifest = resolveBuildManifest(databaseDir);
      const manifestMap = new Map(manifest.migrations.map((m) => [m.id, m]));

      for (const id of TARGETED_MIGRATION_IDS) {
        const entry = manifestMap.get(id);
        expect(entry).toBeDefined();

        const sourcePath = path.join(databaseDir, "migrations", `${id}.ts`);
        const actualSha256 = computeFileSha256(sourcePath);

        expect(actualSha256).not.toBeNull();
        expect(actualSha256).toBe(entry?.source_sha256);
      }
    });
  });

  describe("Mock Stateful Runner Execution for Targeted Migrations", () => {
    it("executes ONLY the 12 targeted migrations and ignores all 89 other migrations", async () => {
      const executionLog: string[] = [];
      const dbState = {
        applied: new Set<string>(),
        attempts: [] as Array<{ migration_id: string; status: string }>,
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
            dbState.attempts.push({ migration_id: params?.[0], status: "in_progress" });
            return { rows: [{ id: dbState.attempts.length }] };
          }
          if (sql.includes("UPDATE schema_migration_attempts") && sql.includes("status = 'success'")) {
            const last = dbState.attempts[dbState.attempts.length - 1];
            if (last) last.status = "success";
            return { rowCount: 1 };
          }
          if (sql.includes("INSERT INTO schema_migrations")) {
            dbState.applied.add(params?.[0]);
            return { rows: [] };
          }
          return { rows: [] };
        }),
      } as any;

      // Mock definitions for all migrations
      const mockAllMigrations: MigrationDefinition[] = ALL_MIGRATIONS.map((m) => ({
        id: m.id,
        sequence: m.sequence,
        up: vi.fn().mockImplementation(async () => {
          executionLog.push(m.id);
        }),
      }));

      // Resolve targeted migrations
      const targetedMigrations = resolveTargetedMigrations(mockAllMigrations);

      // Execute targeted migrations with runner
      const res = await executeStatefulMigrations(targetedMigrations, {
        connectionString: "postgres://mock",
        injectedClient: mockClient,
      });

      // 1. Result reports exactly the 12 applied
      expect(res.applied).toEqual([...TARGETED_MIGRATION_IDS]);
      expect(res.skipped).toEqual([]);
      expect(res.failed).toBeNull();

      // 2. Execution log shows only the 12 executed in exact order
      expect(executionLog).toEqual([...TARGETED_MIGRATION_IDS]);

      // 3. Out-of-scope migrations were NEVER called
      expect(executionLog).not.toContain("0042_special_exam_entitlements");
      expect(executionLog).not.toContain("0071_repair_legacy_registration_org_admins");
      expect(executionLog).not.toContain("0001_init");
      expect(executionLog).not.toContain("0092_update_question_pattern_instructions_and_examples");
      expect(executionLog).not.toContain("0093_update_patterns_3_6_8_11_v3");

      // 4. Re-running skips all already-applied targeted migrations
      const res2 = await executeStatefulMigrations(targetedMigrations, {
        connectionString: "postgres://mock",
        injectedClient: mockClient,
      });
      expect(res2.applied).toEqual([]);
      expect(res2.skipped).toEqual([...TARGETED_MIGRATION_IDS]);
      expect(executionLog.length).toBe(12); // No additional up() calls
    });

    it("skips already applied migrations and applies only unapplied ones (Real Production State Simulation)", async () => {
      // In production: 0088, 0089, 0096, 0097, 0099, 0100, 0101 are already applied
      const dbState = {
        applied: new Set<string>([
          "0088_crm_core",
          "0089_crm_segments",
          "0096_user_personal_contents",
          "0097_mind_map_personal_content_type",
          "0099_crm_campaigns",
          "0100_crm_campaign_dispatch",
          "0101_scope_documents_by_course",
        ]),
      };

      const executionLog: string[] = [];

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
            return { rows: [{ id: 1 }] };
          }
          if (sql.includes("INSERT INTO schema_migrations")) {
            dbState.applied.add(params?.[0]);
            return { rows: [] };
          }
          return { rows: [] };
        }),
      } as any;

      const mockMigrations: MigrationDefinition[] = resolveTargetedMigrations(ALL_MIGRATIONS).map((m) => ({
        id: m.id,
        sequence: m.sequence,
        up: vi.fn().mockImplementation(async () => {
          executionLog.push(m.id);
        }),
      }));

      const res = await executeStatefulMigrations(mockMigrations, {
        connectionString: "postgres://mock",
        injectedClient: mockClient,
      });

      expect(res.skipped).toEqual([
        "0088_crm_core",
        "0089_crm_segments",
        "0096_user_personal_contents",
        "0097_mind_map_personal_content_type",
        "0099_crm_campaigns",
        "0100_crm_campaign_dispatch",
        "0101_scope_documents_by_course",
      ]);
      expect(res.applied).toEqual([
        "0090_course_membership_exam_schedules",
        "0091_backfill_personal_course_exam_schedules",
        "0094_course_publications_unique_version",
        "0095_presentation_assistant_core",
        "0098_error_monitoring_core",
      ]);
      expect(executionLog).toEqual([
        "0090_course_membership_exam_schedules",
        "0091_backfill_personal_course_exam_schedules",
        "0094_course_publications_unique_version",
        "0095_presentation_assistant_core",
        "0098_error_monitoring_core",
      ]);
    });

    it("failure isolation: ensures independent transactions and keeps 0090 and 0091 applied when 0094 fails", async () => {
      // Transaction-aware mock client that rigorously simulates PostgreSQL transactional isolation:
      // committedState: persistent state across transactions
      // inTransaction: whether a transaction is currently open
      // stagedMigrations: uncommitted schema_migrations within current transaction
      interface MigrationRecord {
        status: string;
        checksum: string;
        error_message?: string;
      }
      interface AttemptRecord {
        id: number;
        migration_id: string;
        attempt_number: number;
        status: string;
        error_message?: string;
      }

      const committedMigrations = new Map<string, MigrationRecord>([
        ["0088_crm_core", { status: "applied", checksum: "0".repeat(64) }],
        ["0089_crm_segments", { status: "applied", checksum: "0".repeat(64) }],
        ["0096_user_personal_contents", { status: "applied", checksum: "0".repeat(64) }],
        ["0097_mind_map_personal_content_type", { status: "applied", checksum: "0".repeat(64) }],
        ["0099_crm_campaigns", { status: "applied", checksum: "0".repeat(64) }],
        ["0100_crm_campaign_dispatch", { status: "applied", checksum: "0".repeat(64) }],
        ["0101_scope_documents_by_course", { status: "applied", checksum: "0".repeat(64) }],
      ]);

      const committedAttempts: AttemptRecord[] = [];
      let inTransaction = false;
      let stagedMigrations = new Map<string, MigrationRecord>();
      let stagedAttempts = new Map<number, Partial<AttemptRecord>>();

      const transactionAwareClient = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          if (sql.includes("pg_is_in_recovery")) return { rows: [{ in_recovery: false }] };
          if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }] };
          if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };

          if (sql.trim().toUpperCase() === "BEGIN;") {
            inTransaction = true;
            stagedMigrations = new Map(committedMigrations);
            stagedAttempts = new Map<number, Partial<AttemptRecord>>();
            return { rows: [] };
          }

          if (sql.trim().toUpperCase() === "COMMIT;") {
            inTransaction = false;
            // Flush staged migration records to committed state
            for (const [k, v] of stagedMigrations.entries()) {
              committedMigrations.set(k, v);
            }
            // Flush staged attempt updates to committed attempts
            for (const [attId, updates] of stagedAttempts.entries()) {
              const att = committedAttempts.find((a) => a.id === attId);
              if (att) {
                Object.assign(att, updates);
              }
            }
            stagedAttempts.clear();
            return { rows: [] };
          }

          if (sql.trim().toUpperCase() === "ROLLBACK;") {
            inTransaction = false;
            // Discard uncommitted staged changes for both migrations and attempts
            stagedMigrations.clear();
            stagedAttempts.clear();
            return { rows: [] };
          }

          if (sql.includes("SELECT migration_id, status, checksum FROM schema_migrations;")) {
            const source = inTransaction ? stagedMigrations : committedMigrations;
            return {
              rows: Array.from(source.entries()).map(([migration_id, rec]) => ({
                migration_id,
                status: rec.status,
                checksum: rec.checksum,
              })),
            };
          }

          if (sql.includes("SELECT COALESCE(MAX(attempt_number)")) {
            const migrationId = params?.[0];
            const matches = committedAttempts.filter((a) => a.migration_id === migrationId);
            const maxAtt = matches.reduce((max, a) => Math.max(max, a.attempt_number), 0);
            return { rows: [{ next_att: maxAtt + 1 }] };
          }

          if (sql.includes("INSERT INTO schema_migration_attempts")) {
            // Step A: autocommit mode before BEGIN
            const attemptId = committedAttempts.length + 1;
            committedAttempts.push({
              id: attemptId,
              migration_id: params?.[0],
              attempt_number: params?.[1],
              status: "in_progress",
            });
            return { rows: [{ id: attemptId }] };
          }

          if (sql.includes("UPDATE schema_migration_attempts") && sql.includes("status = 'success'")) {
            // Inside transaction: stage attempt success status
            const attemptId = params?.[1];
            if (inTransaction) {
              stagedAttempts.set(attemptId, { status: "success" });
            } else {
              const att = committedAttempts.find((a) => a.id === attemptId);
              if (att) att.status = "success";
            }
            return { rowCount: 1 };
          }

          if (sql.includes("UPDATE schema_migration_attempts") && sql.includes("status = 'failed'")) {
            // Outside transaction (after rollback in autocommit mode): write directly to committed attempts
            const attemptId = params?.[3];
            const errMsg = params?.[1];
            const att = committedAttempts.find((a) => a.id === attemptId);
            if (att) {
              att.status = "failed";
              att.error_message = errMsg;
            }
            return { rowCount: 1 };
          }

          if (sql.includes("INSERT INTO schema_migrations")) {
            const migrationId = params?.[0];
            const checksum = params?.[2] ?? "0".repeat(64);
            const isFailedStatus = sql.includes("'failed'");
            const status = isFailedStatus ? "failed" : "applied";
            const errMsg = isFailedStatus ? params?.[5] : undefined;

            if (inTransaction) {
              stagedMigrations.set(migrationId, { status, checksum, error_message: errMsg });
            } else {
              committedMigrations.set(migrationId, { status, checksum, error_message: errMsg });
            }
            return { rows: [] };
          }

          return { rows: [] };
        }),
      } as any;

      let simulate0094DuplicateError = true;
      const executionHistory: string[] = [];

      const mockMigrations: MigrationDefinition[] = resolveTargetedMigrations(ALL_MIGRATIONS).map((m) => ({
        id: m.id,
        sequence: m.sequence,
        up: vi.fn().mockImplementation(async () => {
          executionHistory.push(m.id);
          if (m.id === "0094_course_publications_unique_version" && simulate0094DuplicateError) {
            // Simulates actual 0094 DO $$ block failure when duplicate course_id, version rows exist
            throw new Error(
              "Migration 0094 aborted: 2 duplicate (course_id, version) groups found in course_publications where deleted_at IS NULL. Manual data remediation required."
            );
          }
        }),
      }));

      // Run 1: Should apply 0090 and 0091, then fail cleanly at 0094
      await expect(
        executeStatefulMigrations(mockMigrations, {
          connectionString: "postgres://mock",
          injectedClient: transactionAwareClient,
        })
      ).rejects.toThrow(/Migration 0094 aborted: 2 duplicate/);

      // Verify that 0090 and 0091 were committed as applied despite 0094 failing
      expect(committedMigrations.get("0090_course_membership_exam_schedules")?.status).toBe("applied");
      expect(committedMigrations.get("0091_backfill_personal_course_exam_schedules")?.status).toBe("applied");

      // Verify that 0094 is recorded as failed in schema_migrations with the exact error message
      const m0094 = committedMigrations.get("0094_course_publications_unique_version");
      expect(m0094?.status).toBe("failed");
      expect(m0094?.error_message).toContain("Migration 0094 aborted: 2 duplicate");

      // Verify that out-of-scope/subsequent migrations (0095, 0098) were NOT executed or recorded
      expect(committedMigrations.has("0095_presentation_assistant_core")).toBe(false);
      expect(committedMigrations.has("0098_error_monitoring_core")).toBe(false);
      expect(executionHistory).not.toContain("0095_presentation_assistant_core");
      expect(executionHistory).not.toContain("0098_error_monitoring_core");

      // Verify attempt log entries
      const att0090 = committedAttempts.find((a) => a.migration_id === "0090_course_membership_exam_schedules");
      expect(att0090?.status).toBe("success");

      const att0091 = committedAttempts.find((a) => a.migration_id === "0091_backfill_personal_course_exam_schedules");
      expect(att0091?.status).toBe("success");

      const att0094 = committedAttempts.find((a) => a.migration_id === "0094_course_publications_unique_version");
      expect(att0094?.status).toBe("failed");
      expect(att0094?.error_message).toContain("Migration 0094 aborted: 2 duplicate");

      // Run 2: Simulate operator remediating data (no duplicates). Re-running runner retries 0094 and completes remaining
      simulate0094DuplicateError = false;
      const resRun2 = await executeStatefulMigrations(mockMigrations, {
        connectionString: "postgres://mock",
        injectedClient: transactionAwareClient,
      });

      // 0090 and 0091 were NOT re-executed (skipped because already applied!)
      expect(resRun2.skipped).toContain("0090_course_membership_exam_schedules");
      expect(resRun2.skipped).toContain("0091_backfill_personal_course_exam_schedules");

      // 0094, 0095, 0098 applied in Run 2
      expect(resRun2.applied).toEqual([
        "0094_course_publications_unique_version",
        "0095_presentation_assistant_core",
        "0098_error_monitoring_core",
      ]);

      // 0094 is now successfully applied in schema_migrations
      expect(committedMigrations.get("0094_course_publications_unique_version")?.status).toBe("applied");
      expect(committedMigrations.get("0095_presentation_assistant_core")?.status).toBe("applied");
      expect(committedMigrations.get("0098_error_monitoring_core")?.status).toBe("applied");
    });
  });
});
