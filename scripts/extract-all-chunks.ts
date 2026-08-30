import pg from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { selectExtractor } from "../apps/api/src/modules/documents/extraction/extractor-registry.js";
import { buildChunks } from "../apps/api/src/modules/documents/extraction/chunker.js";

async function run() {
  console.log("Starting document chunk extraction...");
  const client = new pg.Client({
    connectionString: "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });
  await client.connect();

  const docs = await client.query(
    "SELECT id, organization_id, storage_key, mime_type, original_name FROM documents WHERE deleted_at IS NULL"
  );
  console.log(`Processing text extraction for ${docs.rows.length} documents...`);

  let totalChunks = 0;
  let successCount = 0;

  for (const doc of docs.rows) {
    try {
      const filePath = path.resolve("storage/uploads", doc.storage_key);
      const fileBuf = await fs.readFile(filePath);
      const extractor = selectExtractor(doc.mime_type);
      if (!extractor) {
        console.log(`No extractor for mime-type ${doc.mime_type} (${doc.original_name})`);
        continue;
      }

      const result = await extractor.extract({
        data: fileBuf,
        originalName: doc.original_name,
        mimeType: doc.mime_type,
      });

      if (result.pages && result.pages.length > 0) {
        const chunks = buildChunks(doc.id, doc.organization_id, result.pages, 1);

        const now = new Date().toISOString();
        for (const ch of chunks) {
          if (!ch.content || ch.content.trim().length === 0) continue;

          await client.query(
            `INSERT INTO document_chunks (
              id, document_id, organization_id, sequence, heading,
              content, start_page, end_page, token_estimate, content_hash, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO NOTHING`,
            [
              ch.id,
              doc.id,
              doc.organization_id,
              ch.sequence,
              ch.heading,
              ch.content,
              ch.startPage,
              ch.endPage,
              ch.tokenEstimate,
              ch.contentHash,
              now,
            ]
          );
          totalChunks++;
        }
        successCount++;
        console.log(`✓ Extracted ${chunks.length} chunks from "${doc.original_name}"`);
      }
    } catch (err: any) {
      console.log(`⚠️ Note on extraction for "${doc.original_name}":`, err.message);
    }
  }

  console.log(`\nCompleted! Successfully extracted ${totalChunks} chunks across ${successCount} documents.`);
  const finalChunkCount = await client.query("SELECT count(*)::int as c FROM document_chunks");
  console.log(`Total document_chunks in PostgreSQL: ${finalChunkCount.rows[0].c}`);

  await client.end();
}

run().catch(console.error);
