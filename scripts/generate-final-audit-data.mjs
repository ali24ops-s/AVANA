import pg from "pg";
import katex from "katex";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

async function run() {
  const gcs = await pool.query(`
    SELECT gc.id, gc.document_id, gc.course_id, gc.type, gc.status, gc.model, gc.created_at,
           gc.payload, d.original_name as doc_name, c.name as course_name
    FROM generated_contents gc
    LEFT JOIN documents d ON d.id = gc.document_id
    LEFT JOIN courses c ON c.id = gc.course_id
    ORDER BY gc.created_at ASC
  `);

  console.log("Total generated contents:", gcs.rows.length);

  const definiteCorrupted = [];
  const needsReview = [];
  const healthy = [];

  for (const row of gcs.rows) {
    const payload = row.payload || {};
    const issues = [];

    function checkField(val, path) {
      if (typeof val !== "string") return;

      // Check 1: tab before LaTeX command: \text, \times, \theta, etc.
      const tabCmds = [...val.matchAll(/(?:\\?\t|\b\t)\s*(ext|imes|heta|au|an)\b/g)];
      for (const t of tabCmds) {
        issues.push({
          type: "tab_corrupted_command",
          path,
          matched: t[0],
          snippet: val.slice(Math.max(0, t.index - 25), Math.min(val.length, t.index + 35)),
          fix: "\\" + (t[1] === "ext" ? "text" : t[1]),
        });
      }

      // Check 2: CR before LaTeX command: \r + ightleftharpoons, \r + ightarrow
      const crCmds = [...val.matchAll(/(?:\r|\b)ight(leftharpoons|arrow)\b/g)];
      for (const c of crCmds) {
        issues.push({
          type: "cr_corrupted_command",
          path,
          matched: c[0],
          snippet: val.slice(Math.max(0, c.index - 25), Math.min(val.length, c.index + 35)),
          fix: "\\right" + c[1],
        });
      }

      // Check 3: Double superscript in KaTeX: \Delta G^\circ'
      const dblSup = [...val.matchAll(/\\Delta\s*G\s*\^\\circ\s*'/g)];
      for (const ds of dblSup) {
        issues.push({
          type: "double_superscript_gcirc",
          path,
          matched: ds[0],
          snippet: val.slice(Math.max(0, ds.index - 25), Math.min(val.length, ds.index + 35)),
          fix: "\\Delta G^{\\circ\\prime}",
        });
      }

      // Check 4: Unbalanced $$ or $
      const dollars = (val.match(/(?<!\\)\$/g) || []).length;
      if (dollars % 2 !== 0) {
        issues.push({
          type: "unbalanced_dollar_delimiters",
          path,
          matched: `${dollars} dollars`,
          snippet: val.slice(0, 100) + "...",
          needsReview: true,
        });
      }
    }

    function traverse(obj, path = "payload") {
      if (!obj) return;
      if (typeof obj === "string") checkField(obj, path);
      else if (Array.isArray(obj)) obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      else if (typeof obj === "object") Object.entries(obj).forEach(([k, v]) => traverse(v, `${path}.${k}`));
    }

    traverse(payload);

    if (issues.length > 0) {
      const hasNeedsReview = issues.some(i => i.needsReview);
      const definiteIssues = issues.filter(i => !i.needsReview);

      if (definiteIssues.length > 0) {
        definiteCorrupted.push({
          id: row.id,
          type: row.type,
          status: row.status,
          courseId: row.course_id,
          courseName: row.course_name,
          docId: row.document_id,
          docName: row.doc_name,
          issuesCount: definiteIssues.length,
          issues: definiteIssues,
        });
      }
      if (hasNeedsReview) {
        needsReview.push({
          id: row.id,
          type: row.type,
          status: row.status,
          courseId: row.course_id,
          courseName: row.course_name,
          docId: row.document_id,
          docName: row.doc_name,
          issues: issues.filter(i => i.needsReview),
        });
      }
    } else {
      healthy.push(row.id);
    }
  }

  console.log("\n=== AUDIT COUNTS ===");
  console.log(`Total scanned: ${gcs.rows.length}`);
  console.log(`Healthy records: ${healthy.length}`);
  console.log(`Definite corrupted records: ${definiteCorrupted.length}`);
  console.log(`Needs review records: ${needsReview.length}`);

  console.log("\n=== DEFINITE CORRUPTED RECORDS ===");
  for (const d of definiteCorrupted) {
    console.log(`\nID: ${d.id}`);
    console.log(`Type: ${d.type} | Course: ${d.courseName} | Doc: ${d.docName}`);
    console.log(`Corruptions count: ${d.issuesCount}`);
    const types = {};
    d.issues.forEach(i => types[i.type] = (types[i.type] || 0) + 1);
    console.log(`Issue types:`, types);
    console.log(`Sample issue:`, d.issues[0]);
  }

  console.log("\n=== NEEDS REVIEW RECORDS ===");
  for (const nr of needsReview) {
    console.log(`\nID: ${nr.id}`);
    console.log(`Type: ${nr.type} | Course: ${nr.courseName} | Doc: ${nr.docName}`);
    console.log(`Issues:`, nr.issues);
  }

  await pool.end();
}

run().catch(console.error);
