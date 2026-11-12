/* eslint-disable no-console, no-secrets/no-secrets */
import { loadMonorepoEnv } from "@avana/config";
import pg from "pg";
import { ALL_MIGRATIONS } from "./tracker/registry.js";
import { executeStatefulMigrations } from "./tracker/runner.js";
import { runEvidenceBaseline } from "./tracker/baseline.js";
import { evaluateMigrationEvidence } from "./tracker/evidence-manifest.js";
import { resolveBuildManifest } from "./tracker/checksum.js";

import { fileURLToPath } from "url";
import path from "path";
import type { MigrationDefinition } from "./tracker/types.js";

/**
 * Detects whether the current ESM file is invoked directly as CLI entrypoint.
 * Evaluates the resolved path against import.meta.url and guards against
 * test runners or secondary module imports.
 */
export function isDirectCliExecution(argv1?: string, importMetaUrl?: string): boolean {
  if (!argv1 || !importMetaUrl) return false;
  if (process.env.VITEST || process.env.NODE_ENV === "test") return false;

  try {
    const invokedPath = path.resolve(argv1);
    const modulePath = path.resolve(fileURLToPath(importMetaUrl));
    return invokedPath === modulePath;
  } catch {
    return false;
  }
}

const { Client } = pg;

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

loadMonorepoEnv();
const connectionString = process.env.DATABASE_URL ?? localConnectionString();

export const TARGETED_MIGRATION_IDS = [
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
] as const;

export type TargetedMigrationId = (typeof TARGETED_MIGRATION_IDS)[number];

export function resolveTargetedMigrations(allMigrations: MigrationDefinition[]): MigrationDefinition[] {
  const allowedSet = new Set<string>(TARGETED_MIGRATION_IDS);
  const targeted = allMigrations.filter((m) => allowedSet.has(m.id));

  if (targeted.length !== TARGETED_MIGRATION_IDS.length) {
    const foundIds = new Set(targeted.map((m) => m.id));
    const missing = TARGETED_MIGRATION_IDS.filter((id) => !foundIds.has(id));
    throw new Error(
      `[TARGETED_MIGRATION_ERROR] Missing expected targeted migration(s) in registry: ${missing.join(", ")}`
    );
  }

  return targeted;
}

export interface CliArgs {
  isBaseline: boolean;
  isVerify: boolean;
  isDryRun: boolean;
  isOnlyTargeted: boolean;
  operator?: string;
  markNotApplicable0071: boolean;
  reason?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  let isBaseline = false;
  let isVerify = false;
  let isDryRun = false;
  let isOnlyTargeted = false;
  let operator: string | undefined;
  let markNotApplicable0071 = false;
  let reason: string | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--baseline") {
      isBaseline = true;
    } else if (arg === "--verify") {
      isVerify = true;
    } else if (arg === "--dry-run") {
      isDryRun = true;
    } else if (arg === "--only-targeted") {
      isOnlyTargeted = true;
    } else if (arg === "--operator" && i + 1 < argv.length) {
      operator = argv[++i];
    } else if (arg === "--mark-not-applicable-0071") {
      markNotApplicable0071 = true;
    } else if (arg === "--reason" && i + 1 < argv.length) {
      reason = argv[++i];
    } else {
      throw new Error(`[CLI_ERROR] Unrecognized or invalid argument: "${arg}"`);
    }
  }

  if (isOnlyTargeted) {
    if (isDryRun) {
      throw new Error(
        "[CLI_ERROR] Incompatible arguments: --only-targeted cannot be combined with --dry-run because the current dry-run implementation is not fully read-only."
      );
    }
    if (isBaseline) {
      throw new Error("[CLI_ERROR] Incompatible arguments: --only-targeted cannot be combined with --baseline.");
    }
    if (isVerify) {
      throw new Error("[CLI_ERROR] Incompatible arguments: --only-targeted cannot be combined with --verify.");
    }
    if (markNotApplicable0071) {
      throw new Error("[CLI_ERROR] Incompatible arguments: --only-targeted cannot be combined with --mark-not-applicable-0071 (0071 is strictly out of scope).");
    }
  }

  return {
    isBaseline,
    isVerify,
    isDryRun,
    isOnlyTargeted,
    operator,
    markNotApplicable0071,
    reason,
  };
}

async function main() {
  const args = parseCliArgs(process.argv);

  if (args.isVerify) {
    console.log("=== AVANA Database Migration Verification ===");
    const client = new Client({ connectionString });
    await client.connect();
    try {
      const manifest = resolveBuildManifest(process.cwd());
      console.log(`Auditing evidence across ${manifest.migrations.length} registered migrations...`);

      let provenCount = 0;
      let missingCount = 0;
      let insufficientCount = 0;

      for (const m of manifest.migrations) {
        const { status, description } = await evaluateMigrationEvidence(client, m.id);
        if (status === "proven") provenCount++;
        else if (status === "missing") missingCount++;
        else insufficientCount++;

        console.log(`[${status.toUpperCase()}] ${m.id}: ${description}`);
      }

      console.log("\nSummary:");
      console.log(`- Proven: ${provenCount}`);
      console.log(`- Missing: ${missingCount}`);
      console.log(`- Insufficient Evidence: ${insufficientCount}`);
    } finally {
      await client.end().catch(() => {});
    }
    return;
  }

  if (args.isBaseline) {
    console.log("=== Running AVANA Evidence-Based Migration Baseline ===");
    if (args.markNotApplicable0071 && !args.operator) {
      console.error("[ERROR] --operator <name> is strictly required when marking 0071 as not_applicable.");
      process.exit(1);
    }

    const client = new Client({ connectionString });
    await client.connect();
    try {
      const report = await runEvidenceBaseline(client, {
        operator: args.operator,
        markNotApplicable0071: args.markNotApplicable0071,
        notApplicableReason: args.reason,
        dryRun: args.isDryRun,
      });

      console.log("\nBaseline Execution Report:");
      console.log(`- Successfully Baselined: ${report.baselined.length}`);
      report.baselined.forEach((b) => console.log(`  ✓ ${b}`));
      console.log(`- Already Recorded / Skipped: ${report.skipped.length}`);
      console.log(`- Not Applicable (Signed Off): ${report.notApplicable.length}`);
      report.notApplicable.forEach((na) => console.log(`  ⊘ ${na}`));
      console.log(`- Insufficient Evidence (Requires Operator Audit): ${report.insufficient.length}`);
      report.insufficient.forEach((ins) => console.log(`  ⚠ ${ins}`));
    } finally {
      await client.end().catch(() => {});
    }
    return;
  }

  if (args.isOnlyTargeted) {
    console.log("=== Running AVANA Targeted Migrations Execution ===");
    console.log(`Allowed scope restricted strictly to ${TARGETED_MIGRATION_IDS.length} migrations:`);
    TARGETED_MIGRATION_IDS.forEach((id) => console.log(`  * ${id}`));

    const migrationsToRun = resolveTargetedMigrations(ALL_MIGRATIONS);

    try {
      const res = await executeStatefulMigrations(migrationsToRun, {
        connectionString,
        dryRun: args.isDryRun,
      });

      console.log(`\nTargeted Migration Execution Finished:`);
      console.log(`- Applied: ${res.applied.length}`);
      res.applied.forEach((id) => console.log(`  ✓ ${id}`));
      console.log(`- Skipped (Already applied/baselined): ${res.skipped.length}`);
      res.skipped.forEach((id) => console.log(`  ⊘ ${id}`));

      if (res.failed) {
        console.error(`- Failed: ${res.failed}`);
        process.exit(1);
      }
    } catch (error) {
      console.error("Targeted migration execution failed:", error);
      process.exit(1);
    }
    return;
  }

  console.log("Running AVANA stateful database migrations...");
  try {
    const res = await executeStatefulMigrations(ALL_MIGRATIONS, {
      connectionString,
      dryRun: args.isDryRun,
    });

    console.log(`\nStateful Migration Execution Finished:`);
    console.log(`- Applied: ${res.applied.length}`);
    console.log(`- Skipped (Already applied/baselined): ${res.skipped.length}`);
    if (res.failed) {
      console.error(`- Failed: ${res.failed}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Migration execution failed:", error);
    process.exit(1);
  }
}

if (isDirectCliExecution(process.argv?.[1], import.meta.url)) {
  await main();
}


