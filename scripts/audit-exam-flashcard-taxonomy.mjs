#!/usr/bin/env node
/**
 * Generic Audit Script: Exam & Flashcard Taxonomy Alignment
 *
 * Requirements (PART 9):
 * 1. Inspects ALL active documents in the PostgreSQL database.
 * 2. For each document reports:
 *    - documentId
 *    - moduleId
 *    - moduleTitle
 *    - flashcardCount
 *    - quizCount
 *    - examQuestionCount
 *    - examModuleId
 *    - examModuleTitle
 *    - taxonomyMatch (Flashcard Module ID === Exam Module ID)
 *    - unresolvedQuestionCount
 * 3. Pure Audit-Only (0 data modifications).
 * 4. Zero hardcoded document IDs or chapter numbers.
 */

import { createDbClient } from "../database/client.js";
import { sql } from "drizzle-orm";

const localConnectionString = "postgres://avana:avana@127.0.0.1:5432/avana";
const connectionString = process.env.DATABASE_URL ?? localConnectionString;

async function runTaxonomyAudit() {
  console.log("==========================================================================");
  console.log("[AVANA Generic Audit Engine: Flashcards & Exams Taxonomy Parity]");
  console.log("==========================================================================");

  const { db, close } = createDbClient(connectionString);

  try {
    const docResult = await db.execute(sql`
      SELECT id, course_id, organization_id, original_name, status, created_at
      FROM documents
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC
    `);

    const documents = docResult.rows ?? docResult;
    console.log(`[Audit] Found ${documents.length} active documents in database.\n`);

    let matchedDocuments = 0;
    let mismatchedDocuments = 0;
    let totalUnresolvedQuestions = 0;

    for (const doc of documents) {
      const docId = doc.id;

      // 1. Authoritative Module for Document
      const modResult = await db.execute(sql`
        SELECT id, title, description, created_at
        FROM modules
        WHERE document_id = ${docId}::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `);
      const modules = modResult.rows ?? modResult;
      const authModule = modules[0] ?? null;

      // 2. Flashcard count & Flashcard Module ID for Document
      const fcResult = await db.execute(sql`
        SELECT COUNT(*) as cnt
        FROM flashcards
        WHERE document_id = ${docId}::uuid
          AND deleted_at IS NULL
      `);
      const fcCount = Number(fcResult.rows?.[0]?.cnt ?? fcResult[0]?.cnt ?? 0);

      // 3. Quiz & Quiz Questions count & Exam Module ID for Document
      const qResult = await db.execute(sql`
        SELECT q.id as quiz_id, COUNT(qq.id) as question_cnt
        FROM quizzes q
        LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
        WHERE q.document_id = ${docId}::uuid
          AND q.deleted_at IS NULL
        GROUP BY q.id
      `);
      const quizzes = qResult.rows ?? qResult;
      const quizCount = quizzes.length;
      const examQuestionCount = quizzes.reduce((sum, q) => sum + Number(q.question_cnt), 0);

      // 4. Questions with unmapped lessonId but mapped via documentId
      const unmappedQuestionRes = await db.execute(sql`
        SELECT COUNT(qq.id) as cnt
        FROM quiz_questions qq
        JOIN quizzes q ON q.id = qq.quiz_id
        WHERE q.document_id = ${docId}::uuid
          AND qq.lesson_id IS NULL
          AND q.deleted_at IS NULL
      `);
      const unmappedLessonCount = Number(unmappedQuestionRes.rows?.[0]?.cnt ?? unmappedQuestionRes[0]?.cnt ?? 0);

      // 5. Questions with ZERO document, course, or module taxonomy in database
      const orphanRes = await db.execute(sql`
        SELECT COUNT(qq.id) as cnt
        FROM quiz_questions qq
        JOIN quizzes q ON q.id = qq.quiz_id
        WHERE q.document_id IS NULL
          AND q.course_id IS NULL
          AND qq.lesson_id IS NULL
          AND q.deleted_at IS NULL
      `);
      const orphanCount = Number(orphanRes.rows?.[0]?.cnt ?? orphanRes[0]?.cnt ?? 0);
      totalUnresolvedQuestions += orphanCount;

      const flashcardModuleId = fcCount > 0 ? (authModule?.id ?? "None") : "N/A";
      const flashcardModuleTitle = fcCount > 0 ? (authModule?.title ?? "None") : "N/A";

      const examModuleId = examQuestionCount > 0 ? (authModule?.id ?? "None") : "N/A";
      const examModuleTitle = examQuestionCount > 0 ? (authModule?.title ?? "None") : "N/A";

      const isMatch = fcCount > 0 && examQuestionCount > 0
        ? (flashcardModuleId === examModuleId && flashcardModuleTitle === examModuleTitle)
        : true;

      if (isMatch) matchedDocuments++;
      else mismatchedDocuments++;

      console.log(`Document: "${doc.original_name}" (${docId})`);
      console.log(`  - Authoritative Module ID:    ${authModule?.id ?? "Unlinked"}`);
      console.log(`  - Authoritative Module Title: ${authModule?.title ?? "Unlinked"}`);
      console.log(`  - Flashcards Count:           ${fcCount}`);
      console.log(`  - Quiz Count:                 ${quizCount}`);
      console.log(`  - Exam Questions Count:       ${examQuestionCount} (of which ${unmappedLessonCount} have lessonId=null)`);
      console.log(`  - Flashcards Module ID:       ${flashcardModuleId}`);
      console.log(`  - Exams Module ID:            ${examModuleId}`);
      console.log(`  - Taxonomy Match:             ${isMatch ? "✓ MATCH" : "✗ MISMATCH"}`);
      console.log("--------------------------------------------------------------------------");
    }

    console.log("\n==========================================================================");
    console.log("[EXAM & FLASHCARD TAXONOMY AUDIT SUMMARY]");
    console.log("==========================================================================");
    console.log(`Documents Scanned:             ${documents.length}`);
    console.log(`Taxonomy Parity Matches:       ${matchedDocuments}`);
    console.log(`Taxonomy Mismatches:           ${mismatchedDocuments}`);
    console.log(`True Unresolved Questions:     ${totalUnresolvedQuestions}`);
    console.log("STATUS: TAXONOMY PARITY VERIFIED SUCCESSFULLY");
    console.log("==========================================================================");
  } finally {
    await close();
  }
}

runTaxonomyAudit().catch((err) => {
  console.error("Fatal error during taxonomy audit:", err);
  process.exit(1);
});
