import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

async function main() {
  const allGcs = await pool.query(`SELECT count(*) FROM generated_contents`);
  const biochemGcs = await pool.query(`SELECT count(*) FROM generated_contents WHERE course_id = 'fea34a39-cd2b-4f92-a83a-c53a18eacd5a'`);
  const f16Gcs = await pool.query(`SELECT count(*) FROM generated_contents WHERE document_id = '579fde92-ac1b-43f8-854c-7e201a936c85'`);

  console.log("Total GCs in DB:", allGcs.rows[0].count);
  console.log("Biochemistry course GCs:", biochemGcs.rows[0].count);
  console.log("Document 16 GCs:", f16Gcs.rows[0].count);

  const f16List = await pool.query(`
    SELECT id, type, status, created_at, (payload->>'title') as title 
    FROM generated_contents 
    WHERE document_id = '579fde92-ac1b-43f8-854c-7e201a936c85'
    ORDER BY created_at ASC
  `);
  console.log("F16 GCs list:", f16List.rows);

  await pool.end();
}

main().catch(console.error);
