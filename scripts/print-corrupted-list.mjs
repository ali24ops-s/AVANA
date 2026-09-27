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

  console.log("=== SCANNING ALL GENERATED CONTENTS FOR DEFINITE CORRUPTIONS ===");
  let count = 0;
  for (const row of gcs.rows) {
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

    if (issues.length > 0) {
      count++;
      console.log(`\n[${count}] ID: ${row.id}`);
      console.log(`    Type: ${row.type} | Status: ${row.status}`);
      console.log(`    Course: ${row.course_name} (${row.course_id})`);
      console.log(`    Doc: ${row.doc_name} (${row.document_id})`);
      console.log(`    Total Corruptions: ${issues.length}`);
      const summary = {};
      issues.forEach(i => summary[i.type] = (summary[i.type] || 0) + 1);
      console.log(`    Breakdown:`, summary);
    }
  }

  console.log(`\nTotal affected records found: ${count}`);
  await pool.end();
}

main().catch(console.error);
