import pg from "pg";

/**
 * AVANA Antibiotics Module & Pharmacology Quiz Relink Engine
 *
 * Transaction-safe, strictly validated apply script.
 * Moves Antibiotics Module (4 lessons, 30 flashcards) and Pharmacology Quiz (8 questions)
 * to فارماکولوژی ۱ (08801321-efe0-47e1-bf85-52d958e52680).
 */

const TARGET_COURSE_ID = "08801321-efe0-47e1-bf85-52d958e52680"; // فارماکولوژی ۱
const ANTIBIOTICS_MODULE_ID = "fc19b187-193a-4bcf-93ca-2a512df08268";
const PHARMACOLOGY_QUIZ_ID = "2d02d4dd-fdbe-4bd1-b997-284d0ef4e83a";

async function main() {
  console.log("==========================================================================");
  console.log("  AVANA ANTIBIOTICS MODULE & QUIZ RELINK ENGINE — TRANSACTIONAL APPLY     ");
  console.log("==========================================================================");

  const connectionString =
    process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // -----------------------------------------------------------------------
    // Step 1: Pre-Mutation Snapshot & State Recording
    // -----------------------------------------------------------------------
    console.log("\n[1/5] Recording Pre-Mutation Baseline State & SRS Values...");

    const beforeCounts = {
      courses: (await client.query("SELECT count(*)::int as c FROM courses WHERE deleted_at IS NULL")).rows[0].c,
      documents: (await client.query("SELECT count(*)::int as c FROM documents WHERE deleted_at IS NULL")).rows[0].c,
      modules: (await client.query("SELECT count(*)::int as c FROM modules WHERE deleted_at IS NULL")).rows[0].c,
      lessons: (await client.query("SELECT count(*)::int as c FROM lessons WHERE deleted_at IS NULL")).rows[0].c,
      flashcards: (await client.query("SELECT count(*)::int as c FROM flashcards WHERE deleted_at IS NULL")).rows[0].c,
      quizzes: (await client.query("SELECT count(*)::int as c FROM quizzes WHERE deleted_at IS NULL")).rows[0].c,
      quiz_questions: (await client.query("SELECT count(*)::int as c FROM quiz_questions")).rows[0].c,
      content_packs: (await client.query("SELECT count(*)::int as c FROM content_packs WHERE deleted_at IS NULL")).rows[0].c,
    };
    console.table(beforeCounts);

    // Pre-snapshot of the 30 flashcards SRS fields
    const preFlashcardsRes = await client.query(
      `SELECT f.id, f.course_id, f.lesson_id, f.due_at, f.interval_days, f.ease_factor
       FROM flashcards f
       JOIN lessons l ON f.lesson_id = l.id
       WHERE l.module_id = $1 AND f.deleted_at IS NULL`,
      [ANTIBIOTICS_MODULE_ID]
    );
    const preFlashcardsMap = new Map(preFlashcardsRes.rows.map((f) => [f.id, f]));
    console.log(`Recorded snapshot for ${preFlashcardsMap.size} flashcards in Antibiotics module.`);

    if (preFlashcardsMap.size !== 30) {
      throw new Error(`Pre-validation Error: Expected 30 flashcards in Antibiotics module, found ${preFlashcardsMap.size}.`);
    }

    // Pre-snapshot of module
    const preModule = (
      await client.query("SELECT id, title, course_id FROM modules WHERE id = $1 AND deleted_at IS NULL", [
        ANTIBIOTICS_MODULE_ID,
      ])
    ).rows[0];
    if (!preModule) {
      throw new Error(`Pre-validation Error: Antibiotics module ${ANTIBIOTICS_MODULE_ID} not found.`);
    }

    // Pre-snapshot of quiz
    const preQuiz = (
      await client.query("SELECT id, title, course_id FROM quizzes WHERE id = $1 AND deleted_at IS NULL", [
        PHARMACOLOGY_QUIZ_ID,
      ])
    ).rows[0];
    if (!preQuiz) {
      throw new Error(`Pre-validation Error: Quiz ${PHARMACOLOGY_QUIZ_ID} not found.`);
    }

    // -----------------------------------------------------------------------
    // Step 2: BEGIN TRANSACTION
    // -----------------------------------------------------------------------
    console.log("\n[2/5] Beginning PostgreSQL Transaction...");
    await client.query("BEGIN");

    const affectedEntities: Array<{ entity: string; id: string; beforeCourse: string; afterCourse: string }> = [];

    try {
      const now = new Date().toISOString();

      // 1. Update Module
      console.log("\n--- [Step A] Updating Antibiotics Module course_id ---");
      const modUpd = await client.query(
        "UPDATE modules SET course_id = $1, updated_at = $2 WHERE id = $3 RETURNING id, course_id",
        [TARGET_COURSE_ID, now, ANTIBIOTICS_MODULE_ID]
      );
      if (modUpd.rows.length !== 1) {
        throw new Error("Failed to update Antibiotics module.");
      }
      affectedEntities.push({
        entity: "module",
        id: ANTIBIOTICS_MODULE_ID,
        beforeCourse: preModule.course_id,
        afterCourse: TARGET_COURSE_ID,
      });
      console.log(`✓ Module ${ANTIBIOTICS_MODULE_ID} ("${preModule.title}") moved to فارماکولوژی ۱.`);

      // 2. Update 30 Flashcards course_id (preserving all other fields)
      console.log("\n--- [Step B] Updating 30 Flashcards course_id (Preserving SRS values) ---");
      const fcUpd = await client.query(
        `UPDATE flashcards f
         SET course_id = $1, updated_at = $2
         FROM lessons l
         WHERE f.lesson_id = l.id AND l.module_id = $3 AND f.deleted_at IS NULL
         RETURNING f.id, f.course_id`,
        [TARGET_COURSE_ID, now, ANTIBIOTICS_MODULE_ID]
      );

      if (fcUpd.rows.length !== 30) {
        throw new Error(`Expected 30 flashcards to be updated, but updated ${fcUpd.rows.length}.`);
      }

      for (const row of fcUpd.rows) {
        const original = preFlashcardsMap.get(row.id);
        affectedEntities.push({
          entity: "flashcard",
          id: row.id,
          beforeCourse: original?.course_id || "unknown",
          afterCourse: TARGET_COURSE_ID,
        });
      }
      console.log(`✓ 30 Flashcards course_id updated to فارماکولوژی ۱.`);

      // 3. Update Quiz course_id
      console.log("\n--- [Step C] Updating Pharmacology Quiz course_id ---");
      const qzUpd = await client.query(
        "UPDATE quizzes SET course_id = $1, updated_at = $2 WHERE id = $3 RETURNING id, course_id",
        [TARGET_COURSE_ID, now, PHARMACOLOGY_QUIZ_ID]
      );
      if (qzUpd.rows.length !== 1) {
        throw new Error("Failed to update Pharmacology quiz.");
      }
      affectedEntities.push({
        entity: "quiz",
        id: PHARMACOLOGY_QUIZ_ID,
        beforeCourse: preQuiz.course_id,
        afterCourse: TARGET_COURSE_ID,
      });
      console.log(`✓ Quiz ${PHARMACOLOGY_QUIZ_ID} ("${preQuiz.title}") moved to فارماکولوژی ۱.`);

      // -----------------------------------------------------------------------
      // Step 3: Mandatory Post-Mutation Validation
      // -----------------------------------------------------------------------
      console.log("\n[3/5] Running Mandatory Integrity & SRS Invariant Validations...");

      // 1. Validate Target Course فارماکولوژی ۱ Content Counts
      const pharm1Check = {
        modules: (await client.query("SELECT count(*)::int as c FROM modules WHERE course_id = $1 AND deleted_at IS NULL", [TARGET_COURSE_ID])).rows[0].c,
        lessons: (await client.query("SELECT count(*)::int as c FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = $1 AND l.deleted_at IS NULL", [TARGET_COURSE_ID])).rows[0].c,
        flashcards: (await client.query("SELECT count(*)::int as c FROM flashcards WHERE course_id = $1 AND deleted_at IS NULL", [TARGET_COURSE_ID])).rows[0].c,
        quizzes: (await client.query("SELECT count(*)::int as c FROM quizzes WHERE course_id = $1 AND deleted_at IS NULL", [TARGET_COURSE_ID])).rows[0].c,
        questions: (await client.query("SELECT count(*)::int as c FROM quiz_questions qq JOIN quizzes q ON qq.quiz_id = q.id WHERE q.course_id = $1", [TARGET_COURSE_ID])).rows[0].c,
      };

      console.log("Validated فارماکولوژی ۱ Content State:", pharm1Check);
      if (pharm1Check.modules !== 1 || pharm1Check.lessons !== 4 || pharm1Check.flashcards !== 30 || pharm1Check.quizzes !== 1 || pharm1Check.questions !== 8) {
        throw new Error(`Validation Error: Content counts in فارماکولوژی ۱ mismatch: ${JSON.stringify(pharm1Check)}`);
      }

      // 2. Validate SRS Fields Invariant for all 30 Flashcards
      const postFlashcardsRes = await client.query(
        `SELECT f.id, f.course_id, f.due_at, f.interval_days, f.ease_factor
         FROM flashcards f
         JOIN lessons l ON f.lesson_id = l.id
         WHERE l.module_id = $1 AND f.deleted_at IS NULL`,
        [ANTIBIOTICS_MODULE_ID]
      );

      for (const postFc of postFlashcardsRes.rows) {
        const preFc = preFlashcardsMap.get(postFc.id);
        if (!preFc) {
          throw new Error(`SRS Validation Error: Flashcard ${postFc.id} missing from snapshot.`);
        }

        const preDue = preFc.due_at ? new Date(preFc.due_at).toISOString() : null;
        const postDue = postFc.due_at ? new Date(postFc.due_at).toISOString() : null;

        if (preDue !== postDue || preFc.interval_days !== postFc.interval_days || preFc.ease_factor !== postFc.ease_factor) {
          throw new Error(
            `SRS Invariant Violation on flashcard ${postFc.id}: pre=(${preDue}, ${preFc.interval_days}, ${preFc.ease_factor}) vs post=(${postDue}, ${postFc.interval_days}, ${postFc.ease_factor})`
          );
        }
      }
      console.log("✓ SRS Invariant Verified: All 30 Flashcards due_at, interval_days, and ease_factor remain 100% identical.");

      // 3. Verify Foreign Key Referential Integrity (Zero Orphans)
      const orphanModules = (await client.query("SELECT count(*)::int as c FROM modules m LEFT JOIN courses c ON m.course_id = c.id WHERE c.id IS NULL")).rows[0].c;
      const orphanFlashcards = (await client.query("SELECT count(*)::int as c FROM flashcards f LEFT JOIN courses c ON f.course_id = c.id WHERE c.id IS NULL")).rows[0].c;
      const orphanQuizzes = (await client.query("SELECT count(*)::int as c FROM quizzes q LEFT JOIN courses c ON q.course_id = c.id WHERE c.id IS NULL")).rows[0].c;

      if (orphanModules > 0 || orphanFlashcards > 0 || orphanQuizzes > 0) {
        throw new Error("Validation Error: Broken foreign keys detected.");
      }

      // 4. Verify Total Record Counts (Zero Inserts, Zero Deletions)
      const postCounts = {
        courses: (await client.query("SELECT count(*)::int as c FROM courses WHERE deleted_at IS NULL")).rows[0].c,
        documents: (await client.query("SELECT count(*)::int as c FROM documents WHERE deleted_at IS NULL")).rows[0].c,
        modules: (await client.query("SELECT count(*)::int as c FROM modules WHERE deleted_at IS NULL")).rows[0].c,
        lessons: (await client.query("SELECT count(*)::int as c FROM lessons WHERE deleted_at IS NULL")).rows[0].c,
        flashcards: (await client.query("SELECT count(*)::int as c FROM flashcards WHERE deleted_at IS NULL")).rows[0].c,
        quizzes: (await client.query("SELECT count(*)::int as c FROM quizzes WHERE deleted_at IS NULL")).rows[0].c,
        quiz_questions: (await client.query("SELECT count(*)::int as c FROM quiz_questions")).rows[0].c,
        content_packs: (await client.query("SELECT count(*)::int as c FROM content_packs WHERE deleted_at IS NULL")).rows[0].c,
      };

      for (const [key, val] of Object.entries(beforeCounts)) {
        if (postCounts[key as keyof typeof postCounts] !== val) {
          throw new Error(`Validation Error: Count for ${key} changed from ${val} to ${postCounts[key as keyof typeof postCounts]}.`);
        }
      }

      // -----------------------------------------------------------------------
      // Step 4: COMMIT
      // -----------------------------------------------------------------------
      await client.query("COMMIT");
      console.log("\n==========================================================================");
      console.log("            ✓ TRANSACTION COMMITTED SUCCESSFULLY                          ");
      console.log("==========================================================================");
    } catch (txErr) {
      await client.query("ROLLBACK");
      console.error("\n[TRANSACTION ROLLED BACK DUE TO ERROR]:", (txErr as Error).message);
      console.log("\nRESULT: HISTORICAL_CONTENT_RELINK_ROLLED_BACK");
      throw txErr;
    }

    // -----------------------------------------------------------------------
    // Step 5: Post-Apply Summary Tables
    // -----------------------------------------------------------------------
    console.log("\n[4/5] Affected Entities Before / After Table:\n");
    console.table(affectedEntities);

    console.log("\n[5/5] Full Courses Content Distribution Table:\n");
    const coursesAuditQuery = await client.query(`
      SELECT 
        c.name as course,
        (SELECT count(*)::int FROM documents d WHERE d.course_id = c.id AND d.deleted_at IS NULL) as documents,
        (SELECT count(*)::int FROM modules m WHERE m.course_id = c.id AND m.deleted_at IS NULL) as modules,
        (SELECT count(*)::int FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = c.id AND l.deleted_at IS NULL) as lessons,
        (SELECT count(*)::int FROM flashcards f WHERE f.course_id = c.id AND f.deleted_at IS NULL) as flashcards,
        (SELECT count(*)::int FROM quizzes q WHERE q.course_id = c.id AND q.deleted_at IS NULL) as quizzes,
        (SELECT count(*)::int FROM quiz_questions qq JOIN quizzes q ON qq.quiz_id = q.id WHERE q.course_id = c.id) as questions
      FROM courses c
      WHERE c.organization_id = 'b4a0b464-16db-4087-92b7-163a1e6f6776' AND c.deleted_at IS NULL
      ORDER BY c.name ASC
    `);
    console.table(coursesAuditQuery.rows);

    console.log("\n==========================================================================");
    console.log("RESULT: HISTORICAL_CONTENT_RELINK_SUCCESS");
    console.log("==========================================================================\n");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
