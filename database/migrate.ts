/* eslint-disable no-console */
import { loadMonorepoEnv } from "@avana/config";
import pg from "pg";
import { ALL_MIGRATIONS } from "./tracker/registry.js";
import { executeStatefulMigrations } from "./tracker/runner.js";
import { runEvidenceBaseline } from "./tracker/baseline.js";
import { evaluateMigrationEvidence } from "./tracker/evidence-manifest.js";
import { resolveBuildManifest } from "./tracker/checksum.js";

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

interface CliArgs {
  isBaseline: boolean;
  isVerify: boolean;
  isDryRun: boolean;
  operator?: string;
  markNotApplicable0071: boolean;
  reason?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  let isBaseline = false;
  let isVerify = false;
  let isDryRun = false;
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
    } else if (arg === "--operator" && i + 1 < argv.length) {
      operator = argv[++i];
    } else if (arg === "--mark-not-applicable-0071") {
      markNotApplicable0071 = true;
    } else if (arg === "--reason" && i + 1 < argv.length) {
      reason = argv[++i];
    }
  }

  return {
    isBaseline,
    isVerify,
    isDryRun,
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

await main();
