/**
 * CLI Tool: Import Content Package
 *
 * Validates and executes two-phase transactional import of a .zip content package
 * into the local database and filesystem.
 *
 * Usage:
 *   npx tsx scripts/import-course-package.ts <package.zip> [organizationId] [actorUserId]
 *   npm run content:import -- <package.zip>
 */

import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { ContentImportService } from "../apps/api/src/modules/admin/content-import-service.js";
import { LocalStorageProvider } from "../apps/api/src/modules/storage/local-storage.js";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

const storageDir = path.resolve(
  process.env.AVANA_STORAGE_LOCAL_DIRECTORY || "./storage/uploads",
);

async function main() {
  const args = process.argv.slice(2);
  const packagePath = args[0];

  if (!packagePath) {
    console.error("Usage: npx tsx scripts/import-course-package.ts <package.zip> [organizationId] [actorUserId]");
    process.exit(1);
  }

  const resolvedPath = path.resolve(packagePath);
  const zipBuffer = await fs.readFile(resolvedPath);

  const { db, close } = createDbClient(connectionString);
  const storageProvider = new LocalStorageProvider(storageDir);
  const importService = new ContentImportService(db, storageProvider);

  try {
    // Resolve organization
    let orgId = args[1] || process.env.SYSTEM_ORGANIZATION_ID;
    if (!orgId) {
      const org = await db.select().from(schema.organizations).limit(1).then((rows) => rows[0]);
      if (org) {
        orgId = org.id;
      } else {
        console.error("Error: No organization found in local database. Run worker:setup first.");
        process.exit(1);
      }
    }

    // Resolve actor (admin / worker user)
    let actorId = args[2];
    if (!actorId) {
      const user = await db.select().from(schema.users).limit(1).then((rows) => rows[0]);
      if (user) {
        actorId = user.id;
      } else {
        actorId = "00000000-0000-0000-0000-000000000001";
      }
    }

    console.log(`Validating package: ${path.basename(resolvedPath)} (${zipBuffer.length} bytes)...`);
    console.log(`Target Organization ID: ${orgId}`);
    console.log(`Actor User ID: ${actorId}`);

    const plan = await importService.validatePackage(zipBuffer, actorId, orgId);

    console.log("\n--- Import Preview Summary ---");
    console.log(`Courses:            ${plan.summary.courses.new} new, ${plan.summary.courses.existing} existing, ${plan.summary.courses.conflict} conflict`);
    console.log(`Modules:            ${plan.summary.modules.new} new, ${plan.summary.modules.existing} existing`);
    console.log(`Lessons:            ${plan.summary.lessons.new} new, ${plan.summary.lessons.existing} existing, ${plan.summary.lessons.conflict} conflict`);
    console.log(`Documents:          ${plan.summary.documents.new} new, ${plan.summary.documents.existing} existing`);
    console.log(`Files (Binary):     ${plan.summary.files.new} new, ${plan.summary.files.existing} existing`);
    console.log(`Generated Contents: ${plan.summary.generatedContents.new} new, ${plan.summary.generatedContents.existing} existing`);
    console.log(`Flashcards:         ${plan.summary.flashcards.new} new, ${plan.summary.flashcards.existing} existing`);
    console.log(`Quizzes:            ${plan.summary.quizzes.new} new, ${plan.summary.quizzes.existing} existing`);
    console.log(`Quiz Questions:     ${plan.summary.questions.new} new, ${plan.summary.questions.existing} existing`);
    console.log(`Total Conflicts:    ${plan.summary.totalConflicts}`);

    if (plan.conflicts.length > 0) {
      console.warn("\nWarnings / Conflicts detected:");
      for (const c of plan.conflicts) {
        console.warn(`  - [${c.entityType}] ${c.titleOrName}: ${c.reason}`);
      }
    }

    console.log("\nExecuting import inside PostgreSQL transaction...");
    const result = await importService.executeImport(plan.planId, actorId, orgId, {
      onConflict: "skip",
    });

    console.log(`\n✓ Import completed successfully in ${result.durationMs}ms!`);
    console.log(`  Created records: ${result.counts.created}`);
    console.log(`  Skipped records: ${result.counts.skipped}`);
    console.log(`  Batch ID:        ${result.batchId}`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error("Import failed with error:", err);
  process.exit(1);
});
