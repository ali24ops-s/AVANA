import pg from "pg";
import { randomUUID } from "node:crypto";

const TARGET_COURSES = [
  { name: "شیمی دارویی ۱", subject: "شیمی دارویی" },
  { name: "شیمی دارویی ۲", subject: "شیمی دارویی" },
  { name: "شیمی دارویی ۳", subject: "شیمی دارویی" },
  { name: "فارماسیوتیکس ۱", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۲", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۳", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۴", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۵", subject: "فارماسیوتیکس" },
  { name: "بافت شناسی", subject: "علوم پایه" },
  { name: "بیولوژی", subject: "علوم پایه" },
  { name: "سم شناسی", subject: "سم‌شناسی" },
];

const TARGET_NAMES = new Set(TARGET_COURSES.map((c) => c.name));

async function main() {
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });

  try {
    console.log("=== STARTING COURSE CLEANUP & SEEDING ===");

    const orgsRes = await pool.query("SELECT id, name, slug FROM organizations WHERE deleted_at IS NULL");
    console.log(`Found ${orgsRes.rows.length} organizations.`);

    for (const org of orgsRes.rows) {
      // Find all courses in this organization
      const coursesRes = await pool.query(
        "SELECT id, name FROM courses WHERE organization_id = $1",
        [org.id]
      );

      const toDeleteCourseIds: string[] = [];

      for (const course of coursesRes.rows) {
        if (!TARGET_NAMES.has(course.name)) {
          toDeleteCourseIds.push(course.id);
        }
      }

      if (toDeleteCourseIds.length > 0) {
        console.log(`Deleting ${toDeleteCourseIds.length} old/test courses in org "${org.name}" (${org.id})...`);

        // Course Memberships
        await pool.query("DELETE FROM course_memberships WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);

        // Content Packs
        await pool.query("DELETE FROM content_pack_usages WHERE target_course_id = ANY($1::uuid[])", [toDeleteCourseIds]);
        await pool.query("DELETE FROM content_pack_items WHERE content_pack_id IN (SELECT id FROM content_packs WHERE source_document_id IN (SELECT id FROM documents WHERE course_id = ANY($1::uuid[])))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM content_packs WHERE source_document_id IN (SELECT id FROM documents WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);

        // Study sessions & conversations
        await pool.query("DELETE FROM study_conversation_messages WHERE conversation_id IN (SELECT id FROM study_conversations WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM study_conversations WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);
        await pool.query("DELETE FROM study_sessions WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);

        // Quizzes
        await pool.query("DELETE FROM quiz_attempts WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM quiz_questions WHERE quiz_id IN (SELECT id FROM quizzes WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM quizzes WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);

        // Flashcards
        await pool.query("DELETE FROM flashcard_study_session_cards WHERE session_id IN (SELECT id FROM flashcard_study_sessions WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM flashcard_study_sessions WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);
        await pool.query("DELETE FROM flashcard_reviews WHERE flashcard_id IN (SELECT id FROM flashcards WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM user_flashcard_schedules WHERE flashcard_id IN (SELECT id FROM flashcards WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM flashcards WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);

        // Lessons & modules
        await pool.query("DELETE FROM lesson_progress WHERE lesson_id IN (SELECT l.id FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM modules WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);

        // Documents & generation
        await pool.query("DELETE FROM generated_content_citations WHERE generated_content_id IN (SELECT gc.id FROM generated_contents gc JOIN documents d ON gc.document_id = d.id WHERE d.course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM generated_contents WHERE document_id IN (SELECT id FROM documents WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM generation_jobs WHERE document_id IN (SELECT id FROM documents WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM document_chunks WHERE document_id IN (SELECT id FROM documents WHERE course_id = ANY($1::uuid[]))", [toDeleteCourseIds]);
        await pool.query("DELETE FROM documents WHERE course_id = ANY($1::uuid[])", [toDeleteCourseIds]);

        // Courses
        await pool.query("DELETE FROM courses WHERE id = ANY($1::uuid[])", [toDeleteCourseIds]);
        console.log(`✓ Deleted ${toDeleteCourseIds.length} courses and cascaded data in org "${org.name}".`);
      }

      // Also clean up any duplicate entries for the target courses if any exist
      for (const target of TARGET_COURSES) {
        const dupRes = await pool.query(
          "SELECT id FROM courses WHERE organization_id = $1 AND name = $2 ORDER BY created_at ASC",
          [org.id, target.name]
        );
        if (dupRes.rows.length > 1) {
          const keepId = dupRes.rows[0].id;
          const dupIds = dupRes.rows.slice(1).map((r) => r.id);
          console.log(`Removing ${dupIds.length} duplicates for "${target.name}" in "${org.name}"...`);
          await pool.query("DELETE FROM course_memberships WHERE course_id = ANY($1::uuid[])", [dupIds]);
          await pool.query("DELETE FROM courses WHERE id = ANY($1::uuid[])", [dupIds]);
        }
      }

      // Insert target courses if missing
      const now = new Date().toISOString();
      const existingAfterCleanup = await pool.query(
        "SELECT name FROM courses WHERE organization_id = $1",
        [org.id]
      );
      const existingSet = new Set(existingAfterCleanup.rows.map((r) => r.name));

      for (const target of TARGET_COURSES) {
        if (!existingSet.has(target.name)) {
          const newId = randomUUID();
          await pool.query(
            "INSERT INTO courses (id, organization_id, name, subject, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
            [newId, org.id, target.name, target.subject, now]
          );
        }
      }
    }

    // Also delete any orphaned courses not belonging to valid organizations
    await pool.query("DELETE FROM courses WHERE organization_id NOT IN (SELECT id FROM organizations)");

    console.log("\n=== POST-CLEANUP AUDIT FOR AVANA Demo Organization ===");
    const finalRes = await pool.query(`
      SELECT c.id, c.name, c.subject, c.created_at 
      FROM courses c 
      JOIN organizations o ON c.organization_id = o.id 
      WHERE o.slug = 'avana-demo-organization' OR o.name = 'AVANA Demo Organization'
      ORDER BY c.created_at ASC
    `);
    console.log(`Total courses in AVANA Demo Organization: ${finalRes.rows.length}`);
    for (const r of finalRes.rows) {
      console.log(`- "${r.name}" (${r.subject}) [${r.id}]`);
    }

    console.log("\n=== COMPLETED SUCCESSFULLY ===");
  } catch (err) {
    console.error("Error executing cleanup:", err);
  } finally {
    await pool.end();
  }
}

main();
