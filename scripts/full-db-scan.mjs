import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

async function main() {
  const gcs = await pool.query(`
    SELECT gc.id, gc.document_id, gc.course_id, gc.type, gc.status, gc.model, gc.created_at,
           gc.payload, d.original_name as doc_name, c.name as course_name
    FROM generated_contents gc
    LEFT JOIN documents d ON d.id = gc.document_id
    LEFT JOIN courses c ON c.id = gc.course_id
    ORDER BY gc.created_at ASC
  `);

  console.log(`Auditing all ${gcs.rows.length} generated_contents in database...`);

  const biochemAffected = [];
  const biochemHealthy = [];
  const otherAffected = [];
  const otherHealthy = [];

  for (const row of gcs.rows) {
    const isBiochem = row.course_id === 'fea34a39-cd2b-4f92-a83a-c53a18eacd5a';
    const payload = row.payload || {};
    const issues = [];

    function check(val, path) {
      if (typeof val !== "string") return;
      const tabCmds = [...val.matchAll(/(?:\\?\t|\b\t)\s*(ext|imes|heta|au|an)\b/g)];
      for (const t of tabCmds) {
        issues.push({ type: "tab", path, matched: t[0], fix: "\\" + (t[1] === "ext" ? "text" : t[1]) });
      }
      const crCmds = [...val.matchAll(/(?:\r|\b)ight(leftharpoons|arrow)\b/g)];
      for (const c of crCmds) {
        issues.push({ type: "cr", path, matched: c[0], fix: "\\right" + c[1] });
      }
      const dblSup = [...val.matchAll(/\\Delta\s*G\s*\^\\circ\s*'/g)];
      for (const ds of dblSup) {
        issues.push({ type: "dbl_sup", path, matched: ds[0], fix: "\\Delta G^{\\circ\\prime}" });
      }
    }

    function traverse(obj, path = "payload") {
      if (!obj) return;
      if (typeof obj === "string") check(obj, path);
      else if (Array.isArray(obj)) obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      else if (typeof obj === "object") Object.entries(obj).forEach(([k, v]) => traverse(v, `${path}.${k}`));
    }

    traverse(payload);

    const recordSummary = {
      id: row.id,
      type: row.type,
      status: row.status,
      courseId: row.course_id,
      courseName: row.course_name,
      docId: row.document_id,
      docName: row.doc_name,
      totalIssues: issues.length,
      issues,
    };

    if (issues.length > 0) {
      if (isBiochem) biochemAffected.push(recordSummary);
      else otherAffected.push(recordSummary);
    } else {
      if (isBiochem) biochemHealthy.push(row.id);
      else otherHealthy.push(row.id);
    }
  }

  console.log("\n==========================================");
  console.log("=== BIOCHEMISTRY COURSE (fea34a39) ===");
  console.log(`Total Biochemistry GCs: ${biochemAffected.length + biochemHealthy.length}`);
  console.log(`Affected (Corrupted): ${biochemAffected.length}`);
  console.log(`Healthy: ${biochemHealthy.length}`);

  console.log("\nList of Affected Biochemistry Records:");
  for (const b of biochemAffected) {
    const types = {};
    b.issues.forEach(i => types[i.type] = (types[i.type] || 0) + 1);
    console.log(`- ID: ${b.id} | Type: ${b.type} | Doc: ${b.docName} | Issues: ${b.totalIssues} (${JSON.stringify(types)})`);
  }

  console.log("\n==========================================");
  console.log("=== ENTIRE DATABASE OVERALL ===");
  console.log(`Total Scanned: ${gcs.rows.length}`);
  console.log(`Total Affected: ${biochemAffected.length + otherAffected.length}`);
  console.log(`Total Healthy: ${biochemHealthy.length + otherHealthy.length}`);

  await pool.end();
}

main().catch(console.error);
