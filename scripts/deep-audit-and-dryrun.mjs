import pg from "pg";
import katex from "katex";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

// Current frontend normalizeRichContent implementation
function currentNormalizeRichContent(text) {
  if (!text) return text;
  let raw = text;
  raw = raw
    .replace(/,?\s*"citationChunkIds"\s*:\s*\[[\s\S]*?\]\s*}?$/s, "")
    .replace(/,?\s*"kind"\s*:\s*"[^"]*"\s*}?$/s, "")
    .replace(
      /(?:\n|^)\s*(?:"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"\s*,?\s*)+$/s,
      ""
    )
    .trimEnd();

  const parts = raw.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      let processed = part;
      if (processed.includes("\\[")) {
        processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_m, eq) => `$$${eq}$$`);
      }
      if (processed.includes("\\(")) {
        processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_m, eq) => `$${eq}$`);
      }
      processed = processed.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (mathBlock) => {
        return mathBlock
          .replace(/\\?text\{/g, "\\text{")
          .replace(/\text\{/g, "\\text{")
          .replace(/\t\s*ext\{/g, "\\text{");
      });
      return processed;
    })
    .join("");
}

// Conservative repair function for database text
// Reuses the safe unescape and single/double backslash restoration principles
function repairCorruptedContent(text) {
  if (!text || typeof text !== "string") return text;

  // Protect code blocks (```...``` and inline `...`)
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  const repairedParts = parts.map((part, index) => {
    // Odd index is code block - strictly untouched
    if (index % 2 === 1) return part;

    let chunk = part;

    // 1. Fix literal TAB before LaTeX commands: \t ext -> \text, \t heta -> \theta, \t imes -> \times, etc.
    // Also \	ext (backslash + tab + ext) -> \text
    chunk = chunk.replace(/\\?\t\s*ext\{/g, "\\text{");
    chunk = chunk.replace(/\\?\t\s*theta\b/g, "\\theta");
    chunk = chunk.replace(/\\?\t\s*times\b/g, "\\times");
    chunk = chunk.replace(/\\?\t\s*tau\b/g, "\\tau");
    chunk = chunk.replace(/\\?\t\s*tan\b/g, "\\tan");

    // 2. Fix known single-char control char stripping inside Math blocks ($...$ and $$...$$)
    chunk = chunk.replace(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g, (math) => {
      let m = math;
      // Fix \t inside math (e.g. \t{CH}_2 -> \text{CH}_2, or literal tab in \text)
      m = m.replace(/\\?\t\s*ext\{/g, "\\text{");
      m = m.replace(/\\?\t\s*\{/g, "\\text{"); // e.g. \t{CH}_2 -> \text{CH}_2
      m = m.replace(/\\?\t\s*times\b/g, "\\times");
      m = m.replace(/\\?\t\s*theta\b/g, "\\theta");

      // Fix \r stripped: ightleftharpoons -> \rightleftharpoons, ightarrow -> \rightarrow, etc.
      // Make sure we only match when preceded by whitespace, operator, or start of math
      m = m.replace(/(^|[^a-zA-Z\\])ightleftharpoons\b/g, "$1\\rightleftharpoons");
      m = m.replace(/(^|[^a-zA-Z\\])ightarrow\b/g, "$1\\rightarrow");
      m = m.replace(/(^|[^a-zA-Z\\])ightarrow\b/g, "$1\\rightarrow");
      m = m.replace(/(^|[^a-zA-Z\\])ho\b(?!\s*=[a-zA-Z])/g, (match, prefix, offset) => {
        // Only if it looks like LaTeX rho in math context
        return match;
      });

      // Fix \\\\ inside math that got collapsed or single backslash before commands:
      // Note: KaTeX accepts \text or \\text inside JSON, but in KaTeX string \text is standard.
      // If there is \\text in the raw string, it renders as \text in KaTeX.
      return m;
    });

    return chunk;
  });

  return repairedParts.join("");
}

function testKatex(text) {
  if (!text) return { success: true, count: 0, errors: [] };
  const errors = [];
  const mathBlocks = [...text.matchAll(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)];
  for (const match of mathBlocks) {
    const rawMath = match[0];
    const isDisplay = rawMath.startsWith("$$");
    const mathContent = isDisplay ? rawMath.slice(2, -2) : rawMath.slice(1, -1);
    try {
      katex.renderToString(mathContent, {
        displayMode: isDisplay,
        throwOnError: true,
      });
    } catch (err) {
      errors.push({ rawMath, error: err.message });
    }
  }
  return {
    success: errors.length === 0,
    count: mathBlocks.length,
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

  console.log(`=== AUDIT & DRY RUN ON ${gcs.rows.length} GENERATED CONTENTS ===\n`);

  let affectedCount = 0;
  let healthyCount = 0;
  let needsReviewCount = 0;
  const dryRunResults = [];

  for (const row of gcs.rows) {
    const payload = row.payload || {};
    let isAffected = false;
    const diffs = [];

    // Traverse and test repair on all string fields
    function processObject(obj, path = "") {
      if (!obj) return;
      if (typeof obj === "string") {
        const original = obj;
        const repaired = repairCorruptedContent(original);
        if (original !== repaired) {
          isAffected = true;
          const kBefore = testKatex(original);
          const kAfter = testKatex(repaired);
          const kNormBefore = testKatex(currentNormalizeRichContent(original));
          const kNormAfter = testKatex(currentNormalizeRichContent(repaired));
          
          // Test idempotency
          const repairedTwice = repairCorruptedContent(repaired);
          const isIdempotent = (repaired === repairedTwice);

          diffs.push({
            path,
            original,
            repaired,
            isIdempotent,
            katexBefore: kBefore,
            katexAfter: kAfter,
            katexNormBefore: kNormBefore,
            katexNormAfter: kNormAfter,
          });
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, idx) => processObject(item, `${path}[${idx}]`));
      } else if (typeof obj === "object") {
        Object.entries(obj).forEach(([k, v]) => processObject(v, `${path}.${k}`));
      }
    }

    processObject(payload, "payload");

    if (isAffected) {
      affectedCount++;
      dryRunResults.push({
        id: row.id,
        type: row.type,
        status: row.status,
        courseId: row.course_id,
        courseName: row.course_name,
        docId: row.document_id,
        docName: row.doc_name,
        diffsCount: diffs.length,
        diffs,
      });
    } else {
      healthyCount++;
    }
  }

  console.log(`Summary:`);
  console.log(`Total Scanned: ${gcs.rows.length}`);
  console.log(`Healthy (Unchanged): ${healthyCount}`);
  console.log(`Affected (Repaired in Dry Run): ${affectedCount}`);
  console.log(`Needs Review: ${needsReviewCount}\n`);

  console.log(`=== DETAILED DRY RUN RESULTS ===`);
  for (const res of dryRunResults) {
    console.log(`\n======================================================`);
    console.log(`Generated Content ID: ${res.id}`);
    console.log(`Type: ${res.type} | Status: ${res.status}`);
    console.log(`Course: ${res.courseName} (${res.courseId})`);
    console.log(`Document: ${res.docName} (${res.docId})`);
    console.log(`Total Corruptions Found: ${res.diffsCount}`);
    
    for (const d of res.diffs) {
      console.log(`\n--- Field: ${d.path} ---`);
      console.log(`Idempotent: ${d.isIdempotent}`);
      console.log(`KaTeX before repair: ${d.katexBefore.success ? "PASS" : "FAIL (" + d.katexBefore.errors.length + " errors)"}`);
      if (!d.katexBefore.success) {
        d.katexBefore.errors.forEach(e => console.log(`  Raw: ${e.rawMath} => Error: ${e.error}`));
      }
      console.log(`KaTeX after repair: ${d.katexAfter.success ? "PASS" : "FAIL (" + d.katexAfter.errors.length + " errors)"}`);
      if (!d.katexAfter.success) {
        d.katexAfter.errors.forEach(e => console.log(`  Raw: ${e.rawMath} => Error: ${e.error}`));
      }
      console.log(`KaTeX with normalizeRichContent before: ${d.katexNormBefore.success ? "PASS" : "FAIL"}`);
      console.log(`KaTeX with normalizeRichContent after: ${d.katexNormAfter.success ? "PASS" : "FAIL"}`);
    }
  }

  await pool.end();
}

run().catch(console.error);
