import pg from "pg";
import { randomUUID } from "node:crypto";

const CANONICAL_COURSES = [
  "شیمی دارویی ۱",
  "شیمی دارویی ۲",
  "شیمی دارویی ۳",
  "فارماسیوتیکس ۱",
  "فارماسیوتیکس ۲",
  "فارماسیوتیکس ۳",
  "فارماسیوتیکس ۴",
  "فارماسیوتیکس ۵",
  "بافت شناسی",
  "بیولوژی",
  "سم شناسی",
];

async function sync() {
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });

  // Find AVANA Demo Organization
  const orgRes = await pool.query(
    "SELECT id, name FROM organizations WHERE id = 'b4a0b464-16db-4087-92b7-163a1e6f6776' OR name = 'AVANA Demo Organization' LIMIT 1"
  );
  if (orgRes.rows.length === 0) {
    console.error("AVANA Demo Organization not found in DB.");
    await pool.end();
    return;
  }

  const orgId = orgRes.rows[0].id;
  console.log(`Syncing courses for Organization: ${orgRes.rows[0].name} (${orgId})`);

  // Step 1: Rename "Pharmacology Basics" to "فارماکولوژی ۱" if present
  const pharmBasicsRes = await pool.query(
    "SELECT id FROM courses WHERE organization_id = $1 AND name = 'Pharmacology Basics' AND deleted_at IS NULL",
    [orgId]
  );
  if (pharmBasicsRes.rows.length > 0) {
    console.log(`Renaming Pharmacology Basics (${pharmBasicsRes.rows[0].id}) to "فارماکولوژی ۱"...`);
    await pool.query(
      "UPDATE courses SET name = 'فارماکولوژی ۱', updated_at = NOW() WHERE id = $1",
      [pharmBasicsRes.rows[0].id]
    );

    // Delete any empty duplicate "فارماکولوژی ۱" that has 0 modules and 0 docs
    await pool.query(
      `DELETE FROM courses 
       WHERE organization_id = $1 AND name = 'فارماکولوژی ۱' AND id != $2 
         AND (SELECT count(*) FROM modules WHERE course_id = courses.id) = 0
         AND (SELECT count(*) FROM documents WHERE course_id = courses.id) = 0`,
      [orgId, pharmBasicsRes.rows[0].id]
    );
  }

  // Step 2: Fetch existing active courses for this org
  const existingCoursesRes = await pool.query(
    "SELECT id, name FROM courses WHERE organization_id = $1 AND deleted_at IS NULL",
    [orgId]
  );
  const existingNamesMap = new Map(existingCoursesRes.rows.map((r) => [r.name, r.id]));

  // Step 3: Insert missing canonical courses
  const now = new Date().toISOString();
  for (const name of CANONICAL_COURSES) {
    if (!existingNamesMap.has(name)) {
      const id = randomUUID();
      const subject = name.startsWith("فارماکولوژی") ? "Pharmacy" : null;
      console.log(`Inserting missing canonical course "${name}" (${id})...`);
      await pool.query(
        "INSERT INTO courses (id, organization_id, name, subject, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
        [id, orgId, name, subject, now]
      );
    } else {
      console.log(`Course "${name}" already exists (${existingNamesMap.get(name)}).`);
    }
  }

  console.log("\n=== POST-SYNC AUDIT FOR ORG ===");
  const finalCoursesRes = await pool.query(
    `SELECT 
      c.id, 
      c.name, 
      (SELECT count(*) FROM modules m WHERE m.course_id = c.id) as modules, 
      (SELECT count(*) FROM documents d WHERE d.course_id = c.id) as docs, 
      (SELECT count(*) FROM quizzes q WHERE q.course_id = c.id) as quizzes, 
      (SELECT count(*) FROM flashcards f WHERE f.course_id = c.id) as flashcards 
     FROM courses c 
     WHERE c.organization_id = $1 AND c.deleted_at IS NULL 
     ORDER BY c.created_at ASC`,
    [orgId]
  );
  console.log(JSON.stringify(finalCoursesRes.rows, null, 2));

  await pool.end();
}

sync().catch(console.error);
