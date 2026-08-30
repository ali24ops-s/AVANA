#!/usr/bin/env node
/**
 * Repair script to update existing flashcards.lesson_id using sessionIndex from generated_contents.payload.cards.
 *
 * Usage:
 *   npx tsx scripts/repair-flashcard-lessons.mjs --dry-run
 *   npx tsx scripts/repair-flashcard-lessons.mjs --commit
 */

import { createDbClient } from "../database/client.js";
import { sql } from "drizzle-orm";

const localConnectionString = "postgres://avana:avana@127.0.0.1:5432/avana";
const connectionString = process.env.DATABASE_URL ?? localConnectionString;

const isCommit = process.argv.includes("--commit");
const isDryRun = !isCommit;

async function runRepair() {
  console.log("==========================================================================");
  console.log(`[AVANA Flashcard Lesson Repair Script] Mode: ${isDryRun ? "DRY-RUN (Audit Only)" : "LIVE COMMIT"}`);
  console.log("==========================================================================");

  const { db, close } = createDbClient(connectionString);

  try {
    // Target courses: فارماکولوژی ۲ and فارماکولوژی ۳
    const coursesRes = await db.execute(sql`
      SELECT id, name FROM courses WHERE name IN ('فارماکولوژی ۲', 'فارماکولوژی ۳')
    `);
    const courses = coursesRes.rows ?? coursesRes;

    for (const course of courses) {
      console.log(`\n==========================================================================`);
      console.log(`[Course Audit] ${course.name} (${course.id})`);
      console.log(`==========================================================================`);

      // 1. Fetch lessons for course
      const lessonsRes = await db.execute(sql`
        SELECT l.id, l.title, l.sort_order, l.module_id
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        WHERE m.course_id = ${course.id}::uuid AND l.deleted_at IS NULL
        ORDER BY l.sort_order ASC, l.created_at ASC
      `);
      const lessons = lessonsRes.rows ?? lessonsRes;
      console.log(`[Lessons] Found ${lessons.length} lessons.`);
      lessons.forEach((l, idx) => {
        console.log(`  Lesson [sort_order: ${l.sort_order}, index: ${idx}]: ${l.id} - ${l.title}`);
      });

      // 2. Fetch all flashcards for course
      const flashcardsRes = await db.execute(sql`
        SELECT id, question, lesson_id, document_id, generated_content_id
        FROM flashcards
        WHERE course_id = ${course.id}::uuid AND deleted_at IS NULL
      `);
      const flashcards = flashcardsRes.rows ?? flashcardsRes;
      console.log(`[Flashcards] Found ${flashcards.length} total flashcards in DB.`);

      // 3. Fetch generated_contents payloads for this course
      const gcRes = await db.execute(sql`
        SELECT id, payload FROM generated_contents
        WHERE course_id = ${course.id}::uuid AND type = 'flashcard' AND deleted_at IS NULL
      `);
      const gcRows = gcRes.rows ?? gcRes;

      const cardPayloadMap = new Map();
      for (const gc of gcRows) {
        const cards = gc.payload?.cards || [];
        for (const card of cards) {
          if (card.question) {
            cardPayloadMap.set(card.question.trim(), card);
          }
        }
      }

      let mappableCount = 0;
      let unmappableCount = 0;
      const lessonMappings = new Map(); // lessonId -> count
      const updatePlan = []; // { flashcardId, lessonId, question }

      for (const fc of flashcards) {
        const matchedPayloadCard = cardPayloadMap.get((fc.question || "").trim());
        let targetLesson = null;

        if (matchedPayloadCard && typeof matchedPayloadCard.sessionIndex === "number") {
          const sIdx = matchedPayloadCard.sessionIndex;
          targetLesson = lessons.find((l) => l.sort_order === sIdx) || lessons[sIdx] || null;
        }

        if (targetLesson) {
          mappableCount++;
          lessonMappings.set(targetLesson.id, (lessonMappings.get(targetLesson.id) || 0) + 1);
          updatePlan.push({
            flashcardId: fc.id,
            lessonId: targetLesson.id,
            question: fc.question,
          });
        } else {
          unmappableCount++;
        }
      }

      console.log(`\n--- PRE-UPDATE REPORT FOR ${course.name} ---`);
      console.log(`Total Flashcards: ${flashcards.length}`);
      console.log(`Mappable Cards (Deterministic): ${mappableCount}`);
      console.log(`Unmappable Cards (No valid sessionIndex/Lesson match): ${unmappableCount}`);
      console.log(`\nMapping per Lesson:`);
      for (const l of lessons) {
        const count = lessonMappings.get(l.id) || 0;
        console.log(`  - [${l.title}]: ${count} cards`);
      }

      if (isCommit && updatePlan.length > 0) {
        console.log(`\n[Executing UPDATEs...]`);
        for (const item of updatePlan) {
          await db.execute(sql`
            UPDATE flashcards SET lesson_id = ${item.lessonId}::uuid WHERE id = ${item.flashcardId}::uuid
          `);
        }
        console.log(`[UPDATE Complete] Updated ${updatePlan.length} flashcards.`);

        // Post-update verification
        const postRes = await db.execute(sql`
          SELECT count(*) as total, count(lesson_id) as with_lesson_id
          FROM flashcards
          WHERE course_id = ${course.id}::uuid AND deleted_at IS NULL
        `);
        const postStats = postRes.rows[0] ?? postRes[0];
        console.log(`\n--- POST-UPDATE VERIFICATION FOR ${course.name} ---`);
        console.log(`Total Flashcards: ${postStats.total}`);
        console.log(`Flashcards with lesson_id: ${postStats.with_lesson_id}`);
      }
    }
  } catch (err) {
    console.error("Error during repair script execution:", err);
  } finally {
    await close();
  }
}

runRepair();
