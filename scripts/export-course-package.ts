/**
 * CLI Tool: Export Content Package
 *
 * Exports a course and all associated lessons, flashcards, quizzes, documents,
 * and binary files into an independent .zip package.
 *
 * Usage:
 *   npx tsx scripts/export-course-package.ts <courseId> [outputPath]
 *   npm run content:export -- <courseId> [outputPath]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { ContentExportService } from "../apps/api/src/modules/admin/content-export-service.js";
import { LocalStorageProvider } from "../apps/api/src/modules/storage/local-storage.js";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

const storageDir = path.resolve(
  process.env.AVANA_STORAGE_LOCAL_DIRECTORY || "./storage/uploads",
);

async function main() {
  const args = process.argv.slice(2);
  const courseId = args[0];

  if (!courseId) {
    console.error("Usage: npx tsx scripts/export-course-package.ts <courseId> [output.zip]");
    process.exit(1);
  }

  const { db, close } = createDbClient(connectionString);
  const storageProvider = new LocalStorageProvider(storageDir);
  const exportService = new ContentExportService(db, storageProvider);

  try {
    const course = await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!course) {
      console.error(`Error: Course with ID "${courseId}" not found in database.`);
      process.exit(1);
    }

    console.log(`Exporting Course: "${course.name}" (ID: ${course.id})...`);

    const zipBuffer = await exportService.exportContent(course.organizationId, {
      courseId: course.id,
    });

    const defaultFilename = `avana-course-${course.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "_")}-${Date.now()}.zip`;
    const outputPath = args[1] ? path.resolve(args[1]) : path.resolve(defaultFilename);

    await fs.writeFile(outputPath, zipBuffer);

    console.log(`✓ Export successful!`);
    console.log(`  Package saved to: ${outputPath}`);
    console.log(`  Size: ${zipBuffer.length} bytes`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error("Export failed with error:", err);
  process.exit(1);
});
