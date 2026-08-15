import pg from "pg";

async function inspect() {
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });

  console.log("=== ORGANIZATIONS ===");
  const orgs = await pool.query("SELECT * FROM organizations");
  console.log(orgs.rows);

  console.log("=== COURSES ===");
  const courses = await pool.query("SELECT * FROM courses");
  console.log(
    courses.rows.map((c) => ({
      id: c.id,
      organizationId: c.organization_id,
      name: c.name,
      createdAt: c.created_at,
    })),
  );

  console.log("=== DOCUMENTS ===");
  const docs = await pool.query(
    "SELECT d.id, d.original_name, d.status, d.course_id, d.organization_id, d.created_at, (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count FROM documents d WHERE d.deleted_at IS NULL ORDER BY d.created_at DESC",
  );
  console.log(docs.rows);

  console.log("=== RECENT GENERATION JOBS ===");
  const jobs = await pool.query(
    "SELECT id, organization_id, document_id, course_id, type, status, attempts, error_code, error_message, created_at, started_at, completed_at FROM generation_jobs ORDER BY created_at DESC LIMIT 10",
  );
  console.log(jobs.rows);

  console.log("=== RECENT GENERATED CONTENTS ===");
  const contents = await pool.query(
    "SELECT id, document_id, course_id, type, status, model, created_at FROM generated_contents ORDER BY created_at DESC LIMIT 10",
  );
  console.log(contents.rows);

  await pool.end();
}

inspect().catch(console.error);
