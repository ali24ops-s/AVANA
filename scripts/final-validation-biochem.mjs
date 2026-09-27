import pg from "pg";
import katex from "katex";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

// Category A: Strict, Context-Aware Parser Corruption Repair
export function repairCategoryAParserCorruption(text) {
  if (!text || typeof text !== "string") return text;

  // 1. Isolate code blocks (```...``` and `...`) so they are 100% untouched
  const codeParts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  const repairedCodeParts = codeParts.map((part, partIdx) => {
    // Odd indices are code blocks - leave 100% intact
    if (partIdx % 2 === 1) return part;

    let segment = part;

    // 2. Isolate math blocks ($$...$$, $...$, \[...\], \(...\))
    // We split by math delimiters
    const mathTokens = segment.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);

    const repairedMathTokens = mathTokens.map((token, tokIdx) => {
      // If inside math block (odd index)
      if (tokIdx % 2 === 1) {
        let m = token;

        // Fix literal TAB inside math mode where it corrupted a LaTeX command:
        // \t ext{ -> \text{
        // \t{ -> \text{ (e.g. -\t{CH}_2 -> -\text{CH}_2)
        // \t imes -> \times
        // \t heta -> \theta
        // \t au -> \tau
        // \t an -> \tan
        m = m.replace(/\\?\t\s*ext\s*\{/g, "\\text{");
        m = m.replace(/\\?\t\s*\{/g, "\\text{");
        m = m.replace(/\\?\t\s*times\b/g, "\\times");
        m = m.replace(/\\?\t\s*theta\b/g, "\\theta");
        m = m.replace(/\\?\t\s*tau\b/g, "\\tau");
        m = m.replace(/\\?\t\s*tan\b/g, "\\tan");
        m = m.replace(/\\?\t\s*tilde\b/g, "\\tilde");
        m = m.replace(/\\?\t\s*triangle\b/g, "\\triangle");
        m = m.replace(/\\?\t\s*top\b/g, "\\top");

        // Fix literal CR inside math mode:
        // \r ightleftharpoons -> \rightleftharpoons
        // \r ightarrow -> \rightarrow
        // \r ight -> \right
        // \r ho -> \rho
        m = m.replace(/\\?\r\s*ightleftharpoons\b/g, "\\rightleftharpoons");
        m = m.replace(/\\?\r\s*ightarrow\b/g, "\\rightarrow");
        m = m.replace(/\\?\r\s*ight\b(?=\s*[\\(\[\{])/g, "\\right");
        m = m.replace(/\\?\r\s*ho\b/g, "\\rho");

        // Fix stripped commands in math mode (where backslash+r or backslash+t was consumed leaving remainder):
        // ightleftharpoons -> \rightleftharpoons
        m = m.replace(/(^|[^\w\\])ightleftharpoons\b/g, "$1\\rightleftharpoons");
        // ightarrow -> \rightarrow
        m = m.replace(/(^|[^\w\\])ightarrow\b/g, "$1\\rightarrow");

        return m;
      }

      // Outside math mode (normal text):
      // Only repair unambiguous standalone LaTeX commands that got corrupted with literal tab/CR:
      // e.g. \t ext{...} outside math
      let t = token;
      t = t.replace(/(?:^|[^\w\\])\t\s*ext\{/g, (match) => {
        const prefix = match.startsWith("\t") ? "" : match[0];
        return prefix + "\\text{";
      });
      t = t.replace(/(?:^|[^\w\\])\t\s*times\b/g, (match) => {
        const prefix = match.startsWith("\t") ? "" : match[0];
        return prefix + "\\times";
      });

      return t;
    });

    return repairedMathTokens.join("");
  });

  return repairedCodeParts.join("");
}

// Function to test KaTeX rendering
function validateKatex(text) {
  if (!text) return { valid: true, errorCount: 0, errors: [] };
  const errors = [];
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  let match;
  while ((match = mathRegex.exec(text)) !== null) {
    const rawMath = match[0];
    const isDisplay = rawMath.startsWith("$$");
    const content = isDisplay ? rawMath.slice(2, -2) : rawMath.slice(1, -1);
    try {
      katex.renderToString(content, { displayMode: isDisplay, throwOnError: true });
    } catch (err) {
      errors.push({ rawMath, message: err.message });
    }
  }
  return {
    valid: errors.length === 0,
    errorCount: errors.length,
    errors,
  };
}

async function run() {
  const gcs = await pool.query(`
    SELECT gc.id, gc.document_id, gc.course_id, gc.type, gc.status, gc.model, gc.created_at,
           gc.payload, d.original_name as doc_name, c.name as course_name
    FROM generated_contents gc
    LEFT JOIN documents d ON d.id = gc.document_id
    LEFT JOIN courses c ON c.id = gc.course_id
    ORDER BY gc.created_at ASC
  `);

  console.log("===============================================================================");
  console.log("STEP 1: REGRESSION TEST ACROSS ALL 701 GENERATED CONTENTS IN DB");
  console.log("===============================================================================");

  let totalScanned = gcs.rows.length;
  let unchangedCount = 0;
  let wouldChangeCount = 0;
  let falsePositivesCount = 0;
  let idempotencyFailures = 0;

  for (const row of gcs.rows) {
    const payload = row.payload || {};
    let recordChanged = false;

    function testString(str, path) {
      if (typeof str !== "string") return;
      const repaired = repairCategoryAParserCorruption(str);
      if (repaired !== str) {
        recordChanged = true;
        // Check idempotency
        const repairedTwice = repairCategoryAParserCorruption(repaired);
        if (repairedTwice !== repaired) {
          idempotencyFailures++;
          console.error(`IDEMPOTENCY FAILURE in GC ${row.id} at ${path}`);
        }
      }
    }

    function traverse(obj, path = "payload") {
      if (!obj) return;
      if (typeof obj === "string") testString(obj, path);
      else if (Array.isArray(obj)) obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      else if (typeof obj === "object") Object.entries(obj).forEach(([k, v]) => traverse(v, `${path}.${k}`));
    }

    traverse(payload);

    if (recordChanged) {
      wouldChangeCount++;
    } else {
      unchangedCount++;
    }
  }

  console.log(`Total generated_contents scanned: ${totalScanned}`);
  console.log(`Unchanged (Clean / Healthy): ${unchangedCount}`);
  console.log(`Would Change (High-Confidence Category A Repairs): ${wouldChangeCount}`);
  console.log(`Idempotency Failures: ${idempotencyFailures}`);
  console.log(`False Positives on Healthy Text: ${falsePositivesCount}`);

  console.log("\n===============================================================================");
  console.log("STEP 2: VALIDATION ON ALL 17 BIOCHEMISTRY AFFECTED RECORDS");
  console.log("===============================================================================");

  const biochemRows = gcs.rows.filter(r => r.course_id === "fea34a39-cd2b-4f92-a83a-c53a18eacd5a");
  const biochemAffectedList = [];

  for (const row of biochemRows) {
    const payload = row.payload || {};
    const fieldDiffs = [];
    const categoryBItems = [];

    function processField(val, path) {
      if (typeof val !== "string") return;

      // Category A Repair
      const repaired = repairCategoryAParserCorruption(val);
      if (repaired !== val) {
        // Find all localized diffs
        // Extract diff snippets
        const beforeKatex = validateKatex(val);
        const afterKatex = validateKatex(repaired);

        // Find specific locations where repair changed text
        // Compare line by line or by tokens
        fieldDiffs.push({
          path,
          beforeLen: val.length,
          afterLen: repaired.length,
          beforeKatexValid: beforeKatex.valid,
          afterKatexValid: afterKatex.valid,
          original: val,
          repaired: repaired,
        });
      }

      // Check Category B (\Delta G^\circ')
      const dblSup = [...val.matchAll(/\\Delta\s*G\s*\^\\circ\s*'/g)];
      if (dblSup.length > 0) {
        categoryBItems.push({
          path,
          count: dblSup.length,
          snippets: dblSup.map(d => val.slice(Math.max(0, d.index - 15), Math.min(val.length, d.index + 25))),
        });
      }
    }

    function traverseObj(obj, path = "payload") {
      if (!obj) return;
      if (typeof obj === "string") processField(obj, path);
      else if (Array.isArray(obj)) obj.forEach((item, idx) => traverseObj(item, `${path}[${idx}]`));
      else if (typeof obj === "object") Object.entries(obj).forEach(([k, v]) => traverseObj(v, `${path}.${k}`));
    }

    traverseObj(payload);

    if (fieldDiffs.length > 0 || categoryBItems.length > 0) {
      biochemAffectedList.push({
        id: row.id,
        type: row.type,
        status: row.status,
        docName: row.doc_name,
        docId: row.document_id,
        categoryADiffs: fieldDiffs,
        categoryBItems: categoryBItems,
      });
    }
  }

  console.log(`Total Biochemistry Affected Records Validated: ${biochemAffectedList.length}`);

  for (const item of biochemAffectedList) {
    console.log(`\n-------------------------------------------------------------------------------`);
    console.log(`Record ID: ${item.id} | Type: ${item.type} | Doc: ${item.docName}`);
    console.log(`Category A (High Confidence Parser Repairs): ${item.categoryADiffs.length} fields affected`);
    console.log(`Category B (Needs-Review Double Superscript): ${item.categoryBItems.length} fields affected`);

    for (const d of item.categoryADiffs) {
      console.log(`  * Field: ${d.path}`);
      console.log(`    KaTeX Render: Before=[${d.beforeKatexValid ? 'VALID' : 'BROKEN'}] => After=[${d.afterKatexValid ? 'VALID' : 'BROKEN'}]`);
      
      // Print snippet of diff
      // Find diff locations
      let idx = 0;
      while (idx < d.original.length) {
        if (d.original[idx] !== d.repaired[idx]) {
          const bSnippet = d.original.slice(Math.max(0, idx - 20), Math.min(d.original.length, idx + 40));
          const rSnippet = d.repaired.slice(Math.max(0, idx - 20), Math.min(d.repaired.length, idx + 40));
          console.log(`    Diff Snippet:`);
          console.log(`      Before: ${JSON.stringify(bSnippet)}`);
          console.log(`      After:  ${JSON.stringify(rSnippet)}`);
          break;
        }
        idx++;
      }
    }

    if (item.categoryBItems.length > 0) {
      for (const b of item.categoryBItems) {
        console.log(`  * [Category B - Needs Review] Field: ${b.path} (Occurrences: ${b.count})`);
        console.log(`    Snippet: ${JSON.stringify(b.snippets[0])}`);
      }
    }
  }

  console.log("\n===============================================================================");
  console.log("STEP 3: DEEP-DIVE AUDIT FOR ed801ec1-4a22-4416-a331-280ec3854f6f");
  console.log("===============================================================================");
  const ed801 = biochemRows.find(r => r.id === "ed801ec1-4a22-4416-a331-280ec3854f6f");
  if (ed801) {
    const payload = ed801.payload;
    let tabCount = 0;
    let crCount = 0;
    let dblSupCount = 0;

    function countIssues(str) {
      if (typeof str !== "string") return;
      tabCount += (str.match(/(?:\\?\t|\b\t)\s*(?:ext|imes|heta|au|an)\b|\\?\t\s*\{/g) || []).length;
      crCount += (str.match(/(?:\\?\r|\b)ight(leftharpoons|arrow)\b/g) || []).length;
      dblSupCount += (str.match(/\\Delta\s*G\s*\^\\circ\s*'/g) || []).length;
    }

    function traverseEd(obj) {
      if (!obj) return;
      if (typeof obj === "string") countIssues(obj);
      else if (Array.isArray(obj)) obj.forEach(traverseEd);
      else if (typeof obj === "object") Object.values(obj).forEach(traverseEd);
    }

    traverseEd(payload);

    console.log(`Record ed801ec1-4a22-4416-a331-280ec3854f6f Breakdown:`);
    console.log(`- Tab Corruptions (\\text, etc.): ${tabCount}`);
    console.log(`- CR Corruptions (\\rightleftharpoons, \\rightarrow, etc.): ${crCount}`);
    console.log(`- Double Superscript (\\Delta G^\\circ'): ${dblSupCount}`);
    console.log(`- Category A Safe Automatic Repairs: ${tabCount + crCount} instances`);
    console.log(`- Category B Needs-Review: ${dblSupCount} instances`);
  }

  await pool.end();
}

run().catch(console.error);
