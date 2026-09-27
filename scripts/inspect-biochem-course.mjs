import pg from "pg";
import katex from "katex";

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
    WHERE gc.course_id = 'fea34a39-cd2b-4f92-a83a-c53a18eacd5a'
    ORDER BY gc.created_at ASC
  `);

  console.log(`Found ${gcs.rows.length} generated_contents in Biochemistry course.`);

  for (const row of gcs.rows) {
    console.log(`\n======================================================`);
    console.log(`GC ID: ${row.id} | Type: ${row.type} | Status: ${row.status}`);
    console.log(`Doc: ${row.doc_name} (${row.document_id})`);

    const payload = row.payload || {};
    
    // Check for any tab, CR, ight..., or KaTeX issues in this record
    function checkStr(str, path) {
      if (typeof str !== "string") return;
      
      // Look for literal tab, CR, etc.
      const hasTab = str.includes("\t");
      const hasCR = str.includes("\r");
      const hasIght = /ightleftharpoons|ightarrow/.test(str);
      const mathBlocks = [...str.matchAll(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)];
      
      const kErrors = [];
      for (const mb of mathBlocks) {
        const rawMath = mb[0];
        const isDisplay = rawMath.startsWith("$$");
        const content = isDisplay ? rawMath.slice(2, -2) : rawMath.slice(1, -1);
        try {
          katex.renderToString(content, { displayMode: isDisplay, throwOnError: true });
        } catch (e) {
          kErrors.push({ rawMath, error: e.message });
        }
      }

      if (hasTab || hasCR || hasIght || kErrors.length > 0) {
        console.log(`  Issue in field: ${path}`);
        console.log(`    hasTab: ${hasTab}, hasCR: ${hasCR}, hasIght: ${hasIght}, kErrors: ${kErrors.length}`);
        if (kErrors.length > 0) {
          kErrors.forEach(k => console.log(`      Error: ${k.error} in math: ${JSON.stringify(k.rawMath)}`));
        }
        // Print snippets of tabs or ights
        if (hasTab) {
          const tabIdx = str.indexOf("\t");
          console.log(`      Tab snippet: ${JSON.stringify(str.slice(Math.max(0, tabIdx - 20), Math.min(str.length, tabIdx + 30)))}`);
        }
        if (hasIght) {
          const match = str.match(/ight(leftharpoons|arrow)/);
          if (match) {
            console.log(`      Ight snippet: ${JSON.stringify(str.slice(Math.max(0, match.index - 20), Math.min(str.length, match.index + 30)))}`);
          }
        }
      }
    }

    function traverse(obj, path = "payload") {
      if (!obj) return;
      if (typeof obj === "string") checkStr(obj, path);
      else if (Array.isArray(obj)) obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      else if (typeof obj === "object") Object.entries(obj).forEach(([k, v]) => traverse(v, `${path}.${k}`));
    }

    traverse(payload);
  }

  await pool.end();
}

main().catch(console.error);
