import { createDbClient } from "../database/client.js";
import { sql } from "drizzle-orm";

const localConnectionString = "postgres://avana:avana@127.0.0.1:5432/avana";
const connectionString = process.env.DATABASE_URL ?? localConnectionString;

async function runRepairPharm2() {
  const { db, close } = createDbClient(connectionString);

  try {
    const courseId = "bb804c1c-d6f5-46ee-9fe5-b78006957cab";

    // 1. Fetch Lessons
    const lessonsRes = await db.execute(sql`
      SELECT l.id, l.title, l.sort_order
      FROM lessons l
      JOIN modules m ON l.module_id = m.id
      WHERE m.course_id = ${courseId}::uuid AND l.deleted_at IS NULL
      ORDER BY l.sort_order ASC, l.created_at ASC
    `);
    const lessons = lessonsRes.rows ?? lessonsRes;

    // 2. Fetch payload cards
    const gcRes = await db.execute(sql`
      SELECT id, payload FROM generated_contents
      WHERE course_id = ${courseId}::uuid AND type = 'flashcard' AND deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    const gcRows = gcRes.rows ?? gcRes;

    const payloadCardsMap = new Map();
    for (const gc of gcRows) {
      if (gc.payload?.cards) {
        for (const c of gc.payload.cards) {
          if (c.question && !payloadCardsMap.has(c.question.trim())) {
            payloadCardsMap.set(c.question.trim(), c);
          }
        }
      }
    }

    // 3. Fetch current DB Flashcards
    const fcRes = await db.execute(sql`
      SELECT id, question, answer, lesson_id FROM flashcards
      WHERE course_id = ${courseId}::uuid AND deleted_at IS NULL
      ORDER BY id ASC
    `);
    const flashcards = fcRes.rows ?? fcRes;

    // Compute mapping plan
    const plan = flashcards.map((fc) => {
      const pc = payloadCardsMap.get((fc.question || "").trim());
      const sIdx = pc ? pc.sessionIndex : undefined;
      let targetLesson = null;
      if (typeof sIdx === "number") {
        targetLesson = lessons.find((l) => l.sort_order === sIdx) || lessons[sIdx] || null;
        if (!targetLesson && sIdx >= lessons.length) {
          targetLesson = lessons[lessons.length - 1]; // Map sessionIndex 10 to Lesson 10 (index 9)
        }
      }
      return {
        id: fc.id,
        question: fc.question,
        answer: fc.answer,
        lessonIdBefore: fc.lesson_id,
        sessionIndex: sIdx,
        targetLessonId: targetLesson ? targetLesson.id : null,
        targetLessonTitle: targetLesson ? targetLesson.title : null,
      };
    });

    const mappable = plan.filter((p) => p.targetLessonId !== null);
    const unmappable = plan.filter((p) => p.targetLessonId === null);
    const withLessonIdBefore = flashcards.filter((fc) => fc.lesson_id !== null).length;
    const withoutLessonIdBefore = flashcards.filter((fc) => fc.lesson_id === null).length;

    console.log("=== BEFORE UPDATE (DRY-RUN) REPORT ===");
    console.log("Total Flashcards:", flashcards.length);
    console.log("Flashcards with lesson_id (Before):", withLessonIdBefore);
    console.log("Flashcards without lesson_id (Before):", withoutLessonIdBefore);
    console.log("Deterministic Mappable Cards:", mappable.length);
    console.log("Unmappable Cards:", unmappable.length);

    const preCountsPerLesson = {};
    lessons.forEach((l) => (preCountsPerLesson[l.title] = 0));
    mappable.forEach((m) => {
      preCountsPerLesson[m.targetLessonTitle] = (preCountsPerLesson[m.targetLessonTitle] || 0) + 1;
    });
    console.log("\nCard counts per Lesson (Plan):");
    console.table(preCountsPerLesson);

    const sampleIndices = [0, 10, 25, 55, 75, 79];
    const samplesToReport = sampleIndices.map((i) => plan[i]);
    console.log("\n--- SAMPLES BEFORE UPDATE ---");
    samplesToReport.forEach((s) => {
      console.log(
        `ID: ${s.id} | Before: ${s.lessonIdBefore} | sessionIndex: ${s.sessionIndex} | Target: ${s.targetLessonTitle}`,
      );
    });

    if (unmappable.length > 0) {
      console.error("ERROR: Unmappable cards exist! Stopping.");
      process.exit(1);
    }

    // EXECUTE UPDATE
    console.log("\n==========================================================================");
    console.log("[Executing Idempotent UPDATE...]");
    console.log("==========================================================================");

    for (const item of plan) {
      await db.execute(sql`
        UPDATE flashcards SET lesson_id = ${item.targetLessonId}::uuid WHERE id = ${item.id}::uuid
      `);
    }

    console.log("[UPDATE Complete]");

    // VERIFICATION AFTER UPDATE
    const postFcRes = await db.execute(sql`
      SELECT id, question, answer, lesson_id FROM flashcards
      WHERE course_id = ${courseId}::uuid AND deleted_at IS NULL
      ORDER BY id ASC
    `);
    const postFlashcards = postFcRes.rows ?? postFcRes;

    const totalPost = postFlashcards.length;
    const withLessonIdPost = postFlashcards.filter((fc) => fc.lesson_id !== null).length;
    const withoutLessonIdPost = postFlashcards.filter((fc) => fc.lesson_id === null).length;

    const postCountsPerLesson = {};
    lessons.forEach((l) => {
      const count = postFlashcards.filter((fc) => fc.lesson_id === l.id).length;
      postCountsPerLesson[l.title] = count;
    });

    const totalSumLessons = Object.values(postCountsPerLesson).reduce((a, b) => a + b, 0);

    let textIntegrityValid = true;
    postFlashcards.forEach((fc, idx) => {
      if (fc.question !== flashcards[idx].question || fc.answer !== flashcards[idx].answer) {
        textIntegrityValid = false;
      }
    });

    console.log("\n=== AFTER UPDATE VERIFICATION REPORT ===");
    console.log("1. Total Flashcards:", totalPost, "(Expected: 80)");
    console.log("2. Flashcards with lesson_id:", withLessonIdPost, "(Expected: 80)");
    console.log("3. Flashcards with lesson_id = null:", withoutLessonIdPost, "(Expected: 0)");
    console.log("4. Card counts per Lesson:");
    console.table(postCountsPerLesson);
    console.log("5. Total Sum of Lesson Cards:", totalSumLessons, "(Expected: 80)");
    console.log(
      "6. Questions / Answers Text Unchanged:",
      textIntegrityValid ? "PASSED (100% Intact)" : "FAILED",
    );

    console.log("\n--- SAMPLES AFTER UPDATE ---");
    samplesToReport.forEach((s) => {
      const updated = postFlashcards.find((fc) => fc.id === s.id);
      const lObj = lessons.find((l) => l.id === updated.lesson_id);
      console.log("Flashcard ID:", s.id);
      console.log("  Lesson ID before:", s.lessonIdBefore);
      console.log("  Lesson ID after :", updated.lesson_id);
      console.log("  sessionIndex    :", s.sessionIndex);
      console.log("  Lesson title    :", lObj ? lObj.title : "NULL");
      console.log("---");
    });
  } catch (err) {
    console.error("Error running repair script:", err);
  } finally {
    await close();
  }
}

runRepairPharm2();
