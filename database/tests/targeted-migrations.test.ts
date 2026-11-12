/* eslint-disable @typescript-eslint/no-explicit-any */
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
    it("contains strictly and exactly the 7 pre-approved migrations", () => {
      expect(TARGETED_MIGRATION_IDS).toEqual([
        "0088_crm_core",
        "0089_crm_segments",
        "0096_user_personal_contents",
        "0097_mind_map_personal_content_type",
        "0099_crm_campaigns",
        "0100_crm_campaign_dispatch",
        "0101_scope_documents_by_course",
      ]);
      expect(TARGETED_MIGRATION_IDS.length).toBe(7);
    });

    it("strictly excludes 0042, 0071, and all historical/out-of-scope migrations", () => {
      const targetedSet = new Set<string>(TARGETED_MIGRATION_IDS);
      expect(targetedSet.has("0042_special_exam_entitlements")).toBe(false);
      expect(targetedSet.has("0071_repair_legacy_registration_org_admins")).toBe(false);
      expect(targetedSet.has("0001_init")).toBe(false);
      expect(targetedSet.has("0090_course_membership_exam_schedules")).toBe(false);
      expect(targetedSet.has("0098_error_monitoring_core")).toBe(false);
    });

    it("resolves all 7 migrations from ALL_MIGRATIONS in exact registry order", () => {
      const targeted = resolveTargetedMigrations(ALL_MIGRATIONS);
      expect(targeted.length).toBe(7);

      const resolvedIds = targeted.map((m) => m.id);
      expect(resolvedIds).toEqual([...TARGETED_MIGRATION_IDS]);

      const sequences = targeted.map((m) => m.sequence);
      expect(sequences).toEqual([88, 89, 96, 97, 99, 100, 101]);

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
    it("ensures all 7 targeted migrations exist with valid SHA-256 in official manifest", () => {
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

    it("verifies that actual on-disk migration file SHA-256 matches official manifest source_sha256 for all 7 migrations", () => {
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
    it("executes ONLY the 7 targeted migrations and ignores all 91 other migrations", async () => {
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

      // 1. Result reports exactly the 7 applied
      expect(res.applied).toEqual([...TARGETED_MIGRATION_IDS]);
      expect(res.skipped).toEqual([]);
      expect(res.failed).toBeNull();

      // 2. Execution log shows only the 7 executed in exact order
      expect(executionLog).toEqual([...TARGETED_MIGRATION_IDS]);

      // 3. Out-of-scope migrations were NEVER called
      expect(executionLog).not.toContain("0042_special_exam_entitlements");
      expect(executionLog).not.toContain("0071_repair_legacy_registration_org_admins");
      expect(executionLog).not.toContain("0001_init");
      expect(executionLog).not.toContain("0090_course_membership_exam_schedules");
      expect(executionLog).not.toContain("0098_error_monitoring_core");

      // 4. Re-running skips all already-applied targeted migrations
      const res2 = await executeStatefulMigrations(targetedMigrations, {
        connectionString: "postgres://mock",
        injectedClient: mockClient,
      });
      expect(res2.applied).toEqual([]);
      expect(res2.skipped).toEqual([...TARGETED_MIGRATION_IDS]);
      expect(executionLog.length).toBe(7); // No additional up() calls
    });

    it("skips already applied or baselined migrations among the targeted list", async () => {
      // Suppose 0088 and 0089 were already applied in production
      const dbState = {
        applied: new Set<string>(["0088_crm_core", "0089_crm_segments"]),
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

      expect(res.skipped).toEqual(["0088_crm_core", "0089_crm_segments"]);
      expect(res.applied).toEqual([
        "0096_user_personal_contents",
        "0097_mind_map_personal_content_type",
        "0099_crm_campaigns",
        "0100_crm_campaign_dispatch",
        "0101_scope_documents_by_course",
      ]);
      expect(executionLog).toEqual([
        "0096_user_personal_contents",
        "0097_mind_map_personal_content_type",
        "0099_crm_campaigns",
        "0100_crm_campaign_dispatch",
        "0101_scope_documents_by_course",
      ]);
    });
  });
});
