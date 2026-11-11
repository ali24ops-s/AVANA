import crypto from "crypto";
import os from "os";
import type pg from "pg";
import { evaluateMigrationEvidence } from "./evidence-manifest.js";
import { resolveBuildManifest } from "./checksum.js";
import { ensureTrackingSchema } from "./schema.js";
import { assertPrimaryNode } from "./advisory-lock.js";

export interface BaselineOptions {
  operator?: string;
  markNotApplicable0071?: boolean;
  notApplicableReason?: string;
  dryRun?: boolean;
  baseDir?: string;
}

export interface BaselineReport {
  baselined: string[];
  skipped: string[];
  notApplicable: string[];
  insufficient: string[];
}

/**
 * Runs evidence-based baseline with conservative guarantees.
 * Only marks 'baselined' when evidence is rigorously 'proven'.
 */
export async function runEvidenceBaseline(
  client: pg.Client,
  options: BaselineOptions = {}
): Promise<BaselineReport> {
  await assertPrimaryNode(client);
  await ensureTrackingSchema(client);

  const baseDir = options.baseDir ?? process.cwd();
  const manifest = resolveBuildManifest(baseDir);

  const report: BaselineReport = {
    baselined: [],
    skipped: [],
    notApplicable: [],
    insufficient: [],
  };

  // Get currently recorded migrations
  const currentRes = await client.query(
    "SELECT migration_id, status FROM schema_migrations;"
  );
  const recorded = new Map<string, string>();
  for (const r of currentRes.rows) {
    recorded.set(r.migration_id, r.status);
  }

  for (const m of manifest.migrations) {
    if (recorded.has(m.id)) {
      report.skipped.push(m.id);
      continue;
    }

    const { status, description } = await evaluateMigrationEvidence(client, m.id);

    if (status === "proven") {
      if (!options.dryRun) {
        const ticket = crypto.randomUUID();
        const hostname = os.hostname();
        const pid = process.pid;

        // Insert attempt
        const attRes = await client.query(
          `INSERT INTO schema_migration_attempts (
            migration_id, attempt_number, status, commit_ticket,
            started_at, finished_at, runner_pid, hostname, git_commit_hash
          ) VALUES ($1, 1, 'success', $2, NOW(), NOW(), $3, $4, $5)
          RETURNING id;`,
          [m.id, ticket, pid, hostname, manifest.git_commit ?? null]
        );
        const attemptId = attRes.rows[0].id;

        // Insert migration
        await client.query(
          `INSERT INTO schema_migrations (
            migration_id, sequence_number, status, checksum,
            applied_at, last_attempt_id, commit_ticket
          ) VALUES ($1, $2, 'baselined', $3, NOW(), $4, $5);`,
          [m.id, m.sequence, m.source_sha256, attemptId, ticket]
        );
      }
      report.baselined.push(`${m.id} (${description})`);
    } else if (
      m.id === "0071_repair_legacy_registration_org_admins" &&
      options.markNotApplicable0071 &&
      options.operator
    ) {
      if (!options.dryRun) {
        const ticket = crypto.randomUUID();
        const hostname = os.hostname();
        const pid = process.pid;
        const reason = options.notApplicableReason ?? "Legacy org admin repair not applicable to clean database.";

        const attRes = await client.query(
          `INSERT INTO schema_migration_attempts (
            migration_id, attempt_number, status, commit_ticket,
            started_at, finished_at, error_message, runner_pid, hostname, git_commit_hash
          ) VALUES ($1, 1, 'success', $2, NOW(), NOW(), $3, $4, $5, $6)
          RETURNING id;`,
          [m.id, ticket, `Signed-off by operator: ${options.operator}`, pid, hostname, manifest.git_commit ?? null]
        );
        const attemptId = attRes.rows[0].id;

        await client.query(
          `INSERT INTO schema_migrations (
            migration_id, sequence_number, status, checksum,
            applied_at, last_attempt_id, commit_ticket, error_message
          ) VALUES ($1, $2, 'not_applicable', $3, NOW(), $4, $5, $6);`,
          [m.id, m.sequence, m.source_sha256, attemptId, ticket, `Operator ${options.operator}: ${reason}`]
        );
      }
      report.notApplicable.push(`${m.id} (Operator Sign-off: ${options.operator})`);
    } else {
      report.insufficient.push(`${m.id} [status: ${status}] (${description})`);
    }
  }

  return report;
}
