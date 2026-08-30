import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { documents, documentChunks } from "../database/schema/index.js";
import { eq, isNull } from "drizzle-orm";
import { QualityAnalyzer } from "../apps/api/src/modules/documents/extraction/quality-analyzer.js";

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana";
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log("Starting backfill for Document Quality Scores...");

  // Find all documents that have no quality score
  const docsToUpdate = await db.select()
    .from(documents)
    .where(isNull(documents.qualityScore));

  console.log(`Found ${docsToUpdate.length} documents with quality_score IS NULL.`);

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const doc of docsToUpdate) {
    try {
      // Get chunks to reconstruct extracted pages
      const chunks = await db.select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, doc.id))
        .orderBy(documentChunks.sequence);

      if (chunks.length === 0) {
        // Skip document without extracted chunks to avoid generating fake scores
        skippedCount++;
        continue;
      }

      // Convert chunks to a pseudo ExtractionResult
      const pages = chunks.map((chunk, index) => ({
        pageNumber: chunk.startPage || index + 1,
        rawText: chunk.content || "",
        characterCount: (chunk.content || "").length,
      }));

      const qualityReport = QualityAnalyzer.analyze({ pages });

      await db.update(documents)
        .set({
          qualityScore: qualityReport.score,
          qualityLevel: qualityReport.level,
          qualityReport: qualityReport,
          qualityAnalyzedAt: new Date(),
        })
        .where(eq(documents.id, doc.id));
        
      processedCount++;
    } catch (err) {
      console.error(`[ERROR] Failed to backfill document ${doc.id}:`, err);
      errorCount++;
    }
  }

  console.log("Backfill complete.");
  console.log(`Successfully processed: ${processedCount}`);
  console.log(`Skipped (no extracted content): ${skippedCount}`);
  console.log(`Failed: ${errorCount}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error during backfill:", err);
  process.exit(1);
});
