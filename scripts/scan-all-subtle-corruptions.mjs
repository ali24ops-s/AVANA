import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

// Patterns of corruption caused by JSON parse / unescape of single-backslash LaTeX commands
const CORRUPTION_PATTERNS = [
  // 1. Tab-corrupted commands (Tab char 0x09 before command or tab followed by remainder)
  { id: "tab_ext", regex: /(?:\\?\t|\b\t)\s*ext\s*\{/g, name: "\\text corrupted to Tab+ext{", fix: "\\text{" },
  { id: "tab_imes", regex: /(?:\\?\t|\b\t)\s*imes\b/g, name: "\\times corrupted to Tab+imes", fix: "\\times" },
  { id: "tab_heta", regex: /(?:\\?\t|\b\t)\s*heta\b/g, name: "\\theta corrupted to Tab+heta", fix: "\\theta" },
  { id: "tab_au", regex: /(?:\\?\t|\b\t)\s*au\b/g, name: "\\tau corrupted to Tab+au", fix: "\\tau" },
  { id: "tab_an", regex: /(?:\\?\t|\b\t)\s*an\b/g, name: "\\tan corrupted to Tab+an", fix: "\\tan" },

  // 2. Carriage-return corrupted commands (CR char 0x0D or stripped \r)
  { id: "cr_ightleftharpoons", regex: /(?:\\?\r|\b)ightleftharpoons\b/g, name: "\\rightleftharpoons corrupted to CR+ightleftharpoons", fix: "\\rightleftharpoons" },
  { id: "cr_ightarrow", regex: /(?:\\?\r|\b)ightarrow\b/g, name: "\\rightarrow corrupted to CR+ightarrow", fix: "\\rightarrow" },
  { id: "cr_ight", regex: /(?:\\?\r|\b)ight\b(?=\s*[\\(\[\{])/g, name: "\\right corrupted to CR+ight", fix: "\\right" },
  { id: "cr_ho", regex: /(?:\\?\r|\b)ho\b(?=\s*[\^_{}\+\-=\*\/\)])/g, name: "\\rho corrupted to CR+ho", fix: "\\rho" },

  // 3. Backspace corrupted commands (0x08 or stripped \b in math)
  { id: "bs_eta", regex: /(?:\x08|\b)eta\b(?=\s*[\^_{}\+\-=\*\/\)])/g, name: "\\beta corrupted to BS+eta", fix: "\\beta" },
  { id: "bs_inom", regex: /(?:\x08|\b)inom\s*\{/g, name: "\\binom corrupted to BS+inom{", fix: "\\binom{" },

  // 4. Formfeed corrupted commands (0x0C or stripped \f in math)
  { id: "ff_rac", regex: /(?:\x0c|\b)rac\s*\{/g, name: "\\frac corrupted to FF+rac{", fix: "\\frac{" },

  // 5. Newline corrupted commands in math
  { id: "nl_abla", regex: /(?:\n|\r\n|\b)abla\b/g, name: "\\nabla corrupted to NL+abla", fix: "\\nabla" },

  // 6. Double superscript in KaTeX (\Delta G^\circ' or \Delta G^{\circ}')
  { id: "double_superscript_gcirc", regex: /\\Delta\s*G\s*\^\\circ\s*'/g, name: "Double superscript \\Delta G^\\circ'", fix: "\\Delta G^{\\circ\\prime}" },
  { id: "double_superscript_generic", regex: /\^([a-zA-Z0-9\\]+|\{[^}]+\})\s*'/g, name: "Double superscript ^...'", fix: "^{\\prime}" },
];

async function scan() {
  const gcs = await pool.query(`
    SELECT gc.id, gc.document_id, gc.course_id, gc.type, gc.status, gc.model, gc.created_at,
           gc.payload, d.original_name as doc_name, c.name as course_name
    FROM generated_contents gc
    LEFT JOIN documents d ON d.id = gc.document_id
    LEFT JOIN courses c ON c.id = gc.course_id
    ORDER BY gc.created_at ASC
  `);

  console.log(`Auditing all ${gcs.rows.length} generated_contents records for subtle LaTeX corruptions...\n`);

  const results = [];

  for (const row of gcs.rows) {
    const payload = row.payload || {};
    const recordMatches = [];

    function checkString(str, path) {
      if (typeof str !== "string") return;

      // Extract math blocks
      const mathBlocks = [...str.matchAll(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)];
      
      for (const mb of mathBlocks) {
        const mathStr = mb[0];
        for (const pat of CORRUPTION_PATTERNS) {
          const matches = [...mathStr.matchAll(pat.regex)];
          for (const m of matches) {
            recordMatches.push({
              path,
              patternId: pat.id,
              patternName: pat.name,
              suggestedFix: pat.fix,
              rawMath: mathStr,
              matchSnippet: m[0],
              index: m.index,
            });
          }
        }
      }

      // Also check outside math for tab-corrupted \text or \times
      for (const pat of [CORRUPTION_PATTERNS[0], CORRUPTION_PATTERNS[1], CORRUPTION_PATTERNS[2]]) {
        const matches = [...str.matchAll(pat.regex)];
        for (const m of matches) {
          // If not already inside math
          const idx = m.index;
          recordMatches.push({
            path,
            patternId: pat.id,
            patternName: pat.name,
            suggestedFix: pat.fix,
            rawMath: "OUTSIDE_MATH",
            matchSnippet: str.slice(Math.max(0, idx - 15), Math.min(str.length, idx + 25)),
            index: idx,
          });
        }
      }
    }

    function traverse(obj, path = "payload") {
      if (!obj) return;
      if (typeof obj === "string") checkString(obj, path);
      else if (Array.isArray(obj)) obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      else if (typeof obj === "object") Object.entries(obj).forEach(([k, v]) => traverse(v, `${path}.${k}`));
    }

    traverse(payload);

    if (recordMatches.length > 0) {
      results.push({
        id: row.id,
        type: row.type,
        status: row.status,
        courseId: row.course_id,
        courseName: row.course_name,
        docId: row.document_id,
        docName: row.doc_name,
        matchCount: recordMatches.length,
        matches: recordMatches,
      });
    }
  }

  console.log(`Found ${results.length} generated_contents with corruption patterns:\n`);
  for (const r of results) {
    console.log(`================================================================`);
    console.log(`GC ID: ${r.id} | Type: ${r.type} | Status: ${r.status}`);
    console.log(`Course: ${r.courseName} (${r.courseId})`);
    console.log(`Doc: ${r.docName} (${r.docId})`);
    console.log(`Matches (${r.matchCount}):`);
    for (const m of r.matches) {
      console.log(`  - [${m.patternName}] in ${m.path}`);
      console.log(`    Snippet: ${JSON.stringify(m.matchSnippet)}`);
      console.log(`    Math: ${JSON.stringify(m.rawMath)}`);
    }
  }

  await pool.end();
}

scan().catch(console.error);
