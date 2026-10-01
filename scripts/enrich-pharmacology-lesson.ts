import pg from "pg";
import {
  TARGET_PHARMACOLOGY_LESSON,
  enrichPharmacologyLessonPayload,
  stripEducationalChartBlocks,
  generateStrictDiff,
  PHARMACOLOGY_SESSION_ANCHORS,
} from "@avana/domain";
import { validateEducationalChart } from "@avana/domain";

const { Client } = pg;

interface CommandLineArgs {
  isDryRun: boolean;
  applyChanges: boolean;
}

function parseArgs(): CommandLineArgs {
  const args = process.argv.slice(2);
  const applyChanges = args.includes("--apply");
  // Default to dry-run unless --apply is explicitly specified
  const isDryRun = !applyChanges;
  return { isDryRun, applyChanges };
}

export async function runEnrichmentAudit(options: {
  connectionString?: string;
  isDryRun: boolean;
}) {
  const connStr =
    options.connectionString ||
    process.env.DATABASE_URL ||
    "postgresql://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  console.log("==================================================================");
  console.log(" AVANA Pharmacology Lesson Chart Enrichment Script");
  console.log(` Mode: ${options.isDryRun ? "DRY RUN (READ ONLY - NO DB WRITE)" : "APPLY (TRANSACTIONAL WRITE)"}`);
  console.log("==================================================================");

  const client = new Client({ connectionString: connStr });
  await client.connect();

  try {
    // 1. Audit Target Record Existence & Status
    const queryResult = await client.query(
      `
      SELECT gc.id, gc.course_id, gc.document_id, gc.type, gc.status,
             c.name as course_name, d.original_name as doc_name,
             gc.payload
      FROM generated_contents gc
      JOIN courses c ON gc.course_id = c.id
      JOIN documents d ON gc.document_id = d.id
      WHERE gc.id = $1
    `,
      [TARGET_PHARMACOLOGY_LESSON.generatedContentId],
    );

    if (queryResult.rows.length === 0) {
      throw new Error(
        `Target record ${TARGET_PHARMACOLOGY_LESSON.generatedContentId} not found in database!`,
      );
    }

    const row = queryResult.rows[0];
    console.log(`[OK] Found Target Record:`);
    console.log(`  - Record ID:    ${row.id}`);
    console.log(`  - Course:       ${row.course_name} (ID: ${row.course_id})`);
    console.log(`  - Document:     ${row.doc_name} (ID: ${row.document_id})`);
    console.log(`  - Content Type: ${row.type}`);
    console.log(`  - Status:       ${row.status}`);

    const payload = row.payload as Record<string, unknown>;

    // 2. Verify Session Count
    const sessions = payload.sessions as Array<{
      title: string;
      contentMarkdown: string;
    }>;
    if (!Array.isArray(sessions) || sessions.length !== 10) {
      throw new Error(`Expected 10 sessions, found ${sessions?.length}`);
    }
    console.log(`[OK] Verified 10 sessions in payload structure.`);

    // 3. Perform in-memory enrichment
    const enrichmentResult = enrichPharmacologyLessonPayload(payload);
    console.log(
      `[OK] In-memory enrichment complete: ${enrichmentResult.totalInsertedCharts} charts inserted.`,
    );

    // 4. Validate all 4 canonical charts
    for (const anchor of PHARMACOLOGY_SESSION_ANCHORS) {
      const v = validateEducationalChart(anchor.chart);
      if (!v.valid || v.errors.length > 0) {
        throw new Error(
          `Chart "${anchor.chart.title}" failed validation: ${v.errors.join(", ")}`,
        );
      }
      console.log(`  [Valid Chart] "${anchor.chart.title}" (mode: ${anchor.chart.mode}, type: ${anchor.chart.type})`);
    }

    // 5. Verify semantic preservation across all sessions
    for (let i = 0; i < 10; i++) {
      const origMd = sessions[i].contentMarkdown;
      const enrMd = (
        enrichmentResult.enrichedPayload.sessions as Array<{
          contentMarkdown: string;
        }>
      )[i].contentMarkdown;
      const stripped = stripEducationalChartBlocks(enrMd);
      if (stripped !== origMd) {
        throw new Error(
          `CRITICAL: Semantic preservation violated for session ${i + 1}! Byte mismatch detected.`,
        );
      }
    }
    console.log(
      `[OK] Semantic Preservation Check passed: 100% byte-for-byte equality across all 10 sessions when charts are stripped.`,
    );

    // 6. Verify strict diff on consolidated markdown
    const origConsolidated = payload.contentMarkdown as string;
    const enrConsolidated = enrichmentResult.enrichedPayload
      .contentMarkdown as string;
    const consolidatedDiff = generateStrictDiff(
      origConsolidated,
      enrConsolidated,
    );

    if (consolidatedDiff.hasModificationsOrDeletions) {
      throw new Error(
        `CRITICAL: Raw diff found ${consolidatedDiff.removedLinesCount} removed/modified lines! Only additions are allowed.`,
      );
    }
    console.log(
      `[OK] Raw Diff Check passed: 0 deletions, ${consolidatedDiff.addedLinesCount} added lines (chart blocks only).`,
    );

    // 7. Verify Idempotency
    const idempotencyRun = enrichPharmacologyLessonPayload(
      enrichmentResult.enrichedPayload,
    );
    if (idempotencyRun.totalInsertedCharts !== 0) {
      throw new Error(
        `CRITICAL: Idempotency violated! Second run inserted ${idempotencyRun.totalInsertedCharts} charts.`,
      );
    }
    console.log(`[OK] Idempotency Check passed: enrich(enriched) adds 0 duplicate charts.`);

    // 8. Print Diff Summary Report
    console.log("\n--- CHARTS SUMMARY ---");
    for (const anchor of PHARMACOLOGY_SESSION_ANCHORS) {
      console.log(`Chart in Session ${anchor.sessionIndex + 1}:`);
      console.log(`  Title:  "${anchor.chart.title}"`);
      console.log(`  Anchor: "${anchor.beforeAnchor.slice(0, 60)}..."`);
    }

    console.log("\n--- RAW DIFF PREVIEW (Sample from Consolidated Markdown) ---");
    const previewAdded = consolidatedDiff.diffLines.slice(0, 25);
    for (const line of previewAdded) {
      console.log(line);
    }
    if (consolidatedDiff.diffLines.length > 25) {
      console.log(`... (${consolidatedDiff.diffLines.length - 25} more diff lines)`);
    }

    // 9. Execute DB update or abort according to dry-run mode
    if (options.isDryRun) {
      console.log("\n==================================================================");
      console.log(" [DRY RUN COMPLETE] Zero database writes performed.");
      console.log(" Target record in PostgreSQL remains completely untouched.");
      console.log("==================================================================");
      return { success: true, isDryRun: true, enrichmentResult };
    }

    // Applying mutation (requires explicit --apply flag)
    console.log("\n[APPLY] Committing mutation to PostgreSQL database...");
    const now = new Date().toISOString();
    const updateRes = await client.query(
      `
      UPDATE generated_contents
      SET payload = $1,
          updated_at = $2
      WHERE id = $3
      RETURNING id, updated_at
    `,
      [
        JSON.stringify(enrichmentResult.enrichedPayload),
        now,
        TARGET_PHARMACOLOGY_LESSON.generatedContentId,
      ],
    );

    if (updateRes.rowCount !== 1) {
      throw new Error(`Failed to update target record ${TARGET_PHARMACOLOGY_LESSON.generatedContentId}`);
    }

    console.log(`[APPLIED] Successfully updated record ${updateRes.rows[0].id} at ${updateRes.rows[0].updated_at}`);
    return { success: true, isDryRun: false, enrichmentResult };
  } finally {
    await client.end();
  }
}

// Direct CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  const { isDryRun } = parseArgs();
  runEnrichmentAudit({ isDryRun })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n[FATAL ERROR] Enrichment aborted:", err);
      process.exit(1);
    });
}
