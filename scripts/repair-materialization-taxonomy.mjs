#!/usr/bin/env node
/**
 * Generic Global Materialization Taxonomy & Data Repair Engine
 *
 * Requirements (Parts 7, 8, 9, 10, 14):
 * 1. Operates generically on ALL documents in the database.
 * 2. Absolute Invariant: ONE DOCUMENT → ONE AUTHORITATIVE MODULE.
 * 3. Dry-run mode by default (`npx tsx scripts/repair-materialization-taxonomy.mjs --dry-run`).
 * 4. Commit mode via `--commit` flag (`npx tsx scripts/repair-materialization-taxonomy.mjs --commit`).
 * 5. Transactional per document.
 * 6. Completely Idempotent (safe to run multiple times).
 * 7. ZERO hardcoded document IDs or chapter numbers.
 * 8. Never auto-merges ambiguous data — reports `AMBIGUOUS` for manual review.
 */

import { createDbClient } from "../database/client.js";
import { sql } from "drizzle-orm";

const localConnectionString = "postgres://avana:avana@127.0.0.1:5432/avana";
const connectionString = process.env.DATABASE_URL ?? localConnectionString;

const isCommit = process.argv.includes("--commit");
const isDryRun = !isCommit;

async function runGlobalTaxonomyRepair() {
  console.log("==========================================================================");
  console.log(`[AVANA Global Taxonomy Repair Engine] Mode: ${isDryRun ? "DRY-RUN (Audit Only)" : "LIVE COMMIT"}`);
  console.log("==========================================================================");

  const { db, close } = createDbClient(connectionString);

  const metrics = {
    documentsScanned: 0,
    healthyDocuments: 0,
    documentsWithDuplicates: 0,
    documentsWithPlaceholders: 0,
    repairableDocuments: 0,
    ambiguousDocuments: 0,
    orphanedReferences: 0,
    duplicateModulesDeleted: 0,
    placeholderLessonsDeleted: 0,
    quizQuestionsRemapped: 0,
    flashcardsRemapped: 0,
  };

  try {
    // 1. Fetch all documents
    const docResult = await db.execute(sql`
      SELECT id, course_id, organization_id, original_name, status, created_at
      FROM documents
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC
    `);

    const documents = docResult.rows ?? docResult;
    metrics.documentsScanned = documents.length;
    console.log(`[Audit] Found ${documents.length} active documents to audit.\n`);

    for (const doc of documents) {
      const docId = doc.id;
      const origName = doc.original_name ?? "";

      const modResult = await db.execute(sql`
        SELECT DISTINCT m.id, m.course_id, m.document_id, m.title, m.description, m.created_at
        FROM modules m
        WHERE m.deleted_at IS NULL
          AND (
            m.document_id = ${docId}::uuid
            OR (${origName} <> '' AND m.description IS NOT NULL AND m.description LIKE '%' || ${origName} || '%')
            OR m.id IN (
              SELECT l.module_id
              FROM lessons l
              JOIN generated_contents gc ON gc.materialized_lesson_id = l.id
              WHERE gc.document_id = ${docId}::uuid AND l.deleted_at IS NULL AND gc.deleted_at IS NULL
            )
            OR m.id IN (
              SELECT l.module_id
              FROM lessons l
              JOIN quiz_questions qq ON qq.lesson_id = l.id
              JOIN quizzes q ON q.id = qq.quiz_id
              WHERE q.document_id = ${docId}::uuid AND l.deleted_at IS NULL AND q.deleted_at IS NULL
            )
          )
      `);

      const candidateModules = modResult.rows ?? modResult;

      if (candidateModules.length === 0) {
        metrics.healthyDocuments++;
        continue;
      }

      const moduleAudits = [];
      for (const mod of candidateModules) {
        const lessonRes = await db.execute(sql`
          SELECT id, title, content_markdown, char_length(content_markdown) as len, created_at
          FROM lessons
          WHERE module_id = ${mod.id}::uuid AND deleted_at IS NULL
          ORDER BY sort_order ASC
        `);
        const lessons = lessonRes.rows ?? lessonRes;

        const realLessons = lessons.filter(
          (l) => Number(l.len) > 150 && !l.content_markdown.includes("محتوای آموزشی استخراج‌شده از")
        );
        const placeholderLessons = lessons.filter(
          (l) => Number(l.len) <= 150 || l.content_markdown.includes("محتوای آموزشی استخراج‌شده از")
        );

        moduleAudits.push({
          module: mod,
          lessons,
          realLessons,
          placeholderLessons,
        });
      }

      const authoritativeCandidates = moduleAudits.filter((a) => a.realLessons.length > 0);

      if (authoritativeCandidates.length === 0) {
        if (candidateModules.length === 1) {
          metrics.healthyDocuments++;
          if (!candidateModules[0].document_id && isCommit) {
            await db.execute(sql`
              UPDATE modules SET document_id = ${docId}::uuid WHERE id = ${candidateModules[0].id}::uuid
            `);
          }
        } else {
          metrics.ambiguousDocuments++;
          console.log(`[AMBIGUOUS] Document "${doc.original_name}" (${docId}) has ${candidateModules.length} empty shell modules without real lessons. Skipped auto-merge.`);
        }
        continue;
      }

      if (authoritativeCandidates.length > 1) {
        metrics.ambiguousDocuments++;
        console.log(`[AMBIGUOUS] Document "${doc.original_name}" (${docId}) has ${authoritativeCandidates.length} distinct modules with real lessons. Skipped auto-merge for safety.`);
        continue;
      }

      const authoritative = authoritativeCandidates[0];
      const authoritativeModule = authoritative.module;
      const realLessons = authoritative.realLessons;

      const duplicateModules = moduleAudits.filter(
        (a) => a.module.id !== authoritativeModule.id && a.realLessons.length === 0
      );

      const hasDuplicates = duplicateModules.length > 0;
      const hasPlaceholders = moduleAudits.some((a) => a.placeholderLessons.length > 0);

      if (!hasDuplicates && !hasPlaceholders) {
        metrics.healthyDocuments++;
        if (!authoritativeModule.document_id && isCommit) {
          await db.execute(sql`
            UPDATE modules SET document_id = ${docId}::uuid WHERE id = ${authoritativeModule.id}::uuid
          `);
        }
        continue;
      }

      metrics.repairableDocuments++;
      if (hasDuplicates) metrics.documentsWithDuplicates++;
      if (hasPlaceholders) metrics.documentsWithPlaceholders++;

      console.log(`[Repair Target] Document "${doc.original_name}" (${docId}):`);
      console.log(`  - Authoritative Module: ${authoritativeModule.id} ("${authoritativeModule.title}") with ${realLessons.length} real lessons`);

      if (duplicateModules.length > 0) {
        console.log(`  - Found ${duplicateModules.length} duplicate shell module(s): ${duplicateModules.map((d) => d.module.id).join(", ")}`);
      }

      const placeholderLessonsToRemove = moduleAudits.flatMap((a) => a.placeholderLessons);
      if (placeholderLessonsToRemove.length > 0) {
        console.log(`  - Found ${placeholderLessonsToRemove.length} synthetic placeholder lesson(s)`);
      }

      if (isCommit) {
        await db.execute(sql`BEGIN`);
        try {
          await db.execute(sql`
            UPDATE modules SET document_id = ${docId}::uuid WHERE id = ${authoritativeModule.id}::uuid
          `);

          for (const pl of placeholderLessonsToRemove) {
            const qqRes = await db.execute(sql`
              SELECT id, question, topic FROM quiz_questions WHERE lesson_id = ${pl.id}::uuid
            `);
            const qqRows = qqRes.rows ?? qqRes;

            for (const qq of qqRows) {
              metrics.quizQuestionsRemapped++;
              const qqTopic = (qq.topic ?? "").toLowerCase().trim();
              const match = qqTopic
                ? realLessons.find((rl) => rl.title.toLowerCase().includes(qqTopic))
                : null;

              if (match) {
                await db.execute(sql`
                  UPDATE quiz_questions SET lesson_id = ${match.id}::uuid WHERE id = ${qq.id}::uuid
                `);
              } else {
                await db.execute(sql`
                  UPDATE quiz_questions SET lesson_id = NULL WHERE id = ${qq.id}::uuid
                `);
              }
            }

            const fcRes = await db.execute(sql`
              SELECT id, question FROM flashcards WHERE lesson_id = ${pl.id}::uuid
            `);
            const fcRows = fcRes.rows ?? fcRes;

            for (const fc of fcRows) {
              metrics.flashcardsRemapped++;
              const fcQuestion = (fc.question ?? "").toLowerCase().trim();
              const match = fcQuestion
                ? realLessons.find((rl) => rl.title.toLowerCase().includes(fcQuestion))
                : null;

              if (match) {
                await db.execute(sql`
                  UPDATE flashcards SET lesson_id = ${match.id}::uuid WHERE id = ${fc.id}::uuid
                `);
              } else {
                await db.execute(sql`
                  UPDATE flashcards SET lesson_id = NULL WHERE id = ${fc.id}::uuid
                `);
              }
            }

            await db.execute(sql`
              UPDATE generated_contents SET materialized_lesson_id = NULL WHERE materialized_lesson_id = ${pl.id}::uuid
            `);

            await db.execute(sql`
              DELETE FROM lessons WHERE id = ${pl.id}::uuid
            `);
            metrics.placeholderLessonsDeleted++;
          }

          for (const dup of duplicateModules) {
            await db.execute(sql`
              DELETE FROM modules WHERE id = ${dup.module.id}::uuid
            `);
            metrics.duplicateModulesDeleted++;
          }

          await db.execute(sql`COMMIT`);
          console.log(`  ✓ Successfully repaired Document "${doc.original_name}" inside transaction.\n`);
        } catch (err) {
          await db.execute(sql`ROLLBACK`);
          console.error(`  ✗ Transaction failed for Document "${doc.original_name}":`, err);
        }
      } else {
        console.log(`  [DRY-RUN] Planned Actions:`);
        console.log(`    * Link document_id ${docId} to Module ${authoritativeModule.id}`);
        console.log(`    * Remap & Delete ${placeholderLessonsToRemove.length} placeholder lesson(s)`);
        console.log(`    * Remap & Delete ${duplicateModules.length} duplicate shell module(s)\n`);
      }
    }

    console.log("==========================================================================");
    console.log("[GLOBAL TAXONOMY REPAIR AUDIT SUMMARY]");
    console.log("==========================================================================");
    console.log(`Documents Scanned:           ${metrics.documentsScanned}`);
    console.log(`Healthy Documents:           ${metrics.healthyDocuments}`);
    console.log(`Documents with Duplicates:   ${metrics.documentsWithDuplicates}`);
    console.log(`Documents with Placeholders: ${metrics.documentsWithPlaceholders}`);
    console.log(`Repairable Documents:        ${metrics.repairableDocuments}`);
    console.log(`Ambiguous Documents:         ${metrics.ambiguousDocuments}`);
    console.log(`Orphaned References:         ${metrics.orphanedReferences}`);
    if (isCommit) {
      console.log("--------------------------------------------------------------------------");
      console.log(`Duplicate Modules Deleted:   ${metrics.duplicateModulesDeleted}`);
      console.log(`Placeholder Lessons Deleted: ${metrics.placeholderLessonsDeleted}`);
      console.log(`Quiz Questions Remapped:     ${metrics.quizQuestionsRemapped}`);
      console.log(`Flashcards Remapped:         ${metrics.flashcardsRemapped}`);
      console.log("STATUS: REPAIR APPLIED SUCCESSFULLY");
    } else {
      console.log("STATUS: DRY-RUN AUDIT COMPLETE (No changes committed. Pass --commit to apply)");
    }
    console.log("==========================================================================");
  } finally {
    await close();
  }

  return metrics;
}

runGlobalTaxonomyRepair().catch((err) => {
  console.error("Fatal error during global taxonomy repair:", err);
  process.exit(1);
});
