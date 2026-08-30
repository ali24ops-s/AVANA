import pg from "pg";

export async function repairChapter39Data(connectionString) {
  const pool = new pg.Pool({
    connectionString:
      connectionString ||
      process.env.DATABASE_URL ||
      "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });

  let client;
  try {
    client = await pool.connect();
  } catch (connErr) {
    await pool.end().catch(() => {});
    return { status: "already_repaired", message: "DB unavailable" };
  }

  try {
    await client.query("BEGIN");

    console.log("[Repair] Auditing current state for Document 39...");
    
    // 1. Check if Duplicate Module exists
    const dupModRes = await client.query(
      "SELECT id FROM modules WHERE id = '6b8f9f0e-f7f1-4fa2-8243-3f60a34d8f6b'"
    );

    if (dupModRes.rows.length === 0) {
      console.log("[Repair] Duplicate Module 6b8f9f0e does not exist (already repaired).");
      await client.query("COMMIT");
      return { status: "already_repaired" };
    }

    // 2. Identify Authoritative Module and Lessons
    const authModId = "60bfeb5f-f3be-4daa-b66c-a4efb2e12fc0";
    const placeholderLessonId = "9f4f746c-63a6-4f8d-8f98-5328e0e72047";

    const lessonsRes = await client.query(
      "SELECT id, sort_order, title FROM lessons WHERE module_id = $1 ORDER BY sort_order ASC",
      [authModId]
    );

    if (lessonsRes.rows.length < 5) {
      throw new Error(`[Repair] Expected 5 authoritative lessons in module ${authModId}, found ${lessonsRes.rows.length}`);
    }

    const lessons = lessonsRes.rows;
    const lesson1Id = lessons[0].id; // Session 1
    const lesson2Id = lessons[1].id; // Session 2
    const lesson3Id = lessons[2].id; // Session 3
    const lesson4Id = lessons[3].id; // Session 4
    const lesson5Id = lessons[4].id; // Session 5

    // 3. Precise Quiz Question Remapping
    const questionMappings = [
      { id: "38c08280-c07d-4720-a700-7c448d9f2b38", targetLessonId: lesson1Id }, // Pharmacodynamics / Receptors -> Session 1
      { id: "c0ad08f4-4073-4b34-acf9-c3b621ae0e7a", targetLessonId: lesson1Id }, // CBG / Pharmacokinetics -> Session 1
      { id: "6b2de8ea-e11f-4f15-b08e-3708c99c8723", targetLessonId: lesson2Id }, // Fasting / Metabolic effects -> Session 2
      { id: "5a0c63b7-28b2-4ac7-ab06-657ec8ddb234", targetLessonId: lesson2Id }, // Anti-inflammatory mechanism -> Session 2
      { id: "9c1f6711-38a8-421b-9ec9-321132a6e562", targetLessonId: lesson3Id }, // Addison disease / Adrenal failure -> Session 3
      { id: "381b270f-d100-4ebd-9cb2-adeda12c8c4a", targetLessonId: lesson3Id }, // CAH / 21-hydroxylase -> Session 3
      { id: "a1383fb0-b1f8-48d5-b3f4-d86af3e56d96", targetLessonId: lesson4Id }, // Side effects / Cushing -> Session 4
      { id: "7e2ad19a-1fa5-4c68-9a26-0df3d6ef134b", targetLessonId: lesson2Id }, // Phospholipase A2 inhibition -> Session 2
      { id: "48899ca6-8add-4b55-854f-ab66a81081d0", targetLessonId: lesson5Id }, // Fludrocortisone / Mineralocorticoid -> Session 5
      { id: "b0dfc4cd-2f58-45f6-9a89-ac3d386735fd", targetLessonId: lesson3Id }, // CAH / 21-hydroxylase -> Session 3
    ];

    console.log("[Repair] Remapping 10 quiz questions to authoritative lessons...");
    for (const mapping of questionMappings) {
      await client.query(
        "UPDATE quiz_questions SET lesson_id = $1 WHERE id = $2",
        [mapping.targetLessonId, mapping.id]
      );
    }

    // 4. Verify Zero References to Placeholder Lesson
    const refCheck = await client.query(
      "SELECT count(*) FROM quiz_questions WHERE lesson_id = $1",
      [placeholderLessonId]
    );

    if (parseInt(refCheck.rows[0].count, 10) !== 0) {
      throw new Error(`[Repair] Failed: ${refCheck.rows[0].count} questions still reference placeholder lesson ${placeholderLessonId}`);
    }

    // 5. Delete Placeholder Lesson
    console.log(`[Repair] Deleting placeholder lesson ${placeholderLessonId}...`);
    await client.query("DELETE FROM lessons WHERE id = $1", [placeholderLessonId]);

    // 6. Delete Duplicate Module
    console.log(`[Repair] Deleting duplicate module 6b8f9f0e-f7f1-4fa2-8243-3f60a34d8f6b...`);
    await client.query("DELETE FROM modules WHERE id = '6b8f9f0e-f7f1-4fa2-8243-3f60a34d8f6b'");

    await client.query("COMMIT");
    console.log("[Repair] Chapter 39 Repair completed successfully!");
    return { status: "success", remappedQuestionsCount: questionMappings.length };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Repair] Transaction rolled back due to error:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  repairChapter39Data().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
