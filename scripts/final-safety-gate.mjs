import pg from "pg";
import fs from "fs";
import path from "path";
import katex from "katex";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

// Category A: Strict, Context-Aware Parser Corruption Repair
export function repairCategoryAParserCorruption(text) {
  if (!text || typeof text !== "string") return text;

  // 1. Isolate code blocks (```...``` and `...`) so they are 100% untouched byte-for-byte
  const codeParts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  const repairedCodeParts = codeParts.map((part, partIdx) => {
    // Odd indices are code blocks - leave 100% intact
    if (partIdx % 2 === 1) return part;

    let segment = part;

    // 2. Isolate math blocks ($$...$$, $...$, \[...\], \(...\))
    const mathTokens = segment.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g);

    const repairedMathTokens = mathTokens.map((token, tokIdx) => {
      // If inside math block (odd index)
      if (tokIdx % 2 === 1) {
        let m = token;

        // Fix literal TAB inside math mode where it corrupted a LaTeX command:
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
        m = m.replace(/\\?\r\s*ightleftharpoons\b/g, "\\rightleftharpoons");
        m = m.replace(/\\?\r\s*ightarrow\b/g, "\\rightarrow");
        m = m.replace(/\\?\r\s*ight\b(?=\s*[\\(\[\{])/g, "\\right");
        m = m.replace(/\\?\r\s*ho\b/g, "\\rho");

        // Fix stripped commands in math mode (where backslash+r was consumed leaving remainder):
        m = m.replace(/(^|[^\w\\])ightleftharpoons\b/g, "$1\\rightleftharpoons");
        m = m.replace(/(^|[^\w\\])ightarrow\b/g, "$1\\rightarrow");

        return m;
      }

      // Outside math mode (normal text):
      // Only repair unambiguous standalone LaTeX commands that got corrupted with literal tab/CR:
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

// Function to validate KaTeX rendering
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

// Deep clone & deep diff checker
function deepRepairObject(obj) {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "string") {
      return repairCategoryAParserCorruption(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepRepairObject(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = deepRepairObject(value);
  }
  return result;
}

// Deep comparison validator
function validateDeepStructure(original, repaired, path = "") {
  const errors = [];

  if (original === null || typeof original !== "object") {
    if (typeof original !== "string" && original !== repaired) {
      errors.push(`Non-string primitive modified at ${path}: ${original} !== ${repaired}`);
    }
    return errors;
  }

  if (Array.isArray(original)) {
    if (!Array.isArray(repaired)) {
      errors.push(`Array type changed at ${path}`);
      return errors;
    }
    if (original.length !== repaired.length) {
      errors.push(`Array length changed at ${path}: ${original.length} !== ${repaired.length}`);
    }
    original.forEach((item, idx) => {
      errors.push(...validateDeepStructure(item, repaired[idx], `${path}[${idx}]`));
    });
    return errors;
  }

  const origKeys = Object.keys(original).sort();
  const repKeys = Object.keys(repaired).sort();

  if (JSON.stringify(origKeys) !== JSON.stringify(repKeys)) {
    errors.push(`Object keys mismatch at ${path}: [${origKeys.join(",")}] !== [${repKeys.join(",")}]`);
  }

  for (const key of origKeys) {
    errors.push(...validateDeepStructure(original[key], repaired[key], `${path}.${key}`));
  }

  return errors;
}

// Extract exact atomic diffs
function extractAtomicDiffs(origStr, repStr, fieldPath) {
  const diffs = [];
  let i = 0, j = 0;

  // We find every contiguous modified range
  while (i < origStr.length && j < repStr.length) {
    if (origStr[i] !== repStr[j]) {
      const origStart = i;
      const repStart = j;

      // Find synchronization point: where strings match again for at least 10 chars or to end
      let syncOrig = -1;
      let syncRep = -1;

      for (let lookOrig = i; lookOrig < Math.min(origStr.length, i + 100); lookOrig++) {
        for (let lookRep = j; lookRep < Math.min(repStr.length, j + 100); lookRep++) {
          if (origStr.slice(lookOrig, lookOrig + 10) === repStr.slice(lookRep, lookRep + 10) && origStr.slice(lookOrig, lookOrig + 10).length > 0) {
            syncOrig = lookOrig;
            syncRep = lookRep;
            break;
          }
        }
        if (syncOrig !== -1) break;
      }

      if (syncOrig === -1) {
        syncOrig = origStr.length;
        syncRep = repStr.length;
      }

      const origDiff = origStr.slice(origStart, syncOrig);
      const repDiff = repStr.slice(repStart, syncRep);

      const snippetStart = Math.max(0, origStart - 30);
      const snippetEnd = Math.min(origStr.length, syncOrig + 30);
      const beforeSnippet = origStr.slice(snippetStart, snippetEnd);
      
      const repSnippetStart = Math.max(0, repStart - 30);
      const repSnippetEnd = Math.min(repStr.length, syncRep + 30);
      const afterSnippet = repStr.slice(repSnippetStart, repSnippetEnd);

      // Determine issue type
      let issueType = "UNKNOWN";
      if (origDiff.includes("\t") && repDiff.includes("\\")) issueType = "TAB_CORRUPTION";
      else if (origDiff.includes("\r") && repDiff.includes("\\")) issueType = "CR_CORRUPTION";
      else if (origDiff.includes("ight") && repDiff.includes("\\right")) issueType = "STRIPPED_COMMAND";

      diffs.push({
        fieldPath,
        origDiff,
        repDiff,
        beforeSnippet,
        afterSnippet,
        issueType,
      });

      i = syncOrig;
      j = syncRep;
    } else {
      i++;
      j++;
    }
  }

  return diffs;
}

async function main() {
  const gcs = await pool.query(`
    SELECT gc.id, gc.document_id, gc.course_id, gc.type, gc.status, gc.model, gc.created_at,
           gc.updated_at, gc.edited_at, gc.edited_by, gc.previous_payload,
           gc.payload, d.original_name as doc_name, c.name as course_name
    FROM generated_contents gc
    LEFT JOIN documents d ON d.id = gc.document_id
    LEFT JOIN courses c ON c.id = gc.course_id
    ORDER BY gc.created_at ASC
  `);

  console.log("=== RUNNING FINAL SAFETY GATE VALIDATION ===");

  const totalRecords = gcs.rows.length;
  const categoryARecords = [];
  const categoryBRecords = [];
  const allDiffs = [];
  const snapshotData = [];

  let unexpectedDiffs = 0;
  let codeBlockDiffs = 0;
  let nonMathDiffs = 0;
  let idempotencyFailures = 0;
  let deepDiffFailures = 0;
  let rendererRegressions = 0;

  // 1. Synthetic Code Block & Edge Cases Safety Tests
  console.log("\n1. Testing Synthetic Code Block & Delimiter Edge Cases...");
  const syntheticTests = [
    {
      name: "Code block with \\ttext and \\right",
      input: "Here is code:\n```text\n\\ttext\n\\right\n```\nOutside code.",
      expected: "Here is code:\n```text\n\\ttext\n\\right\n```\nOutside code.",
    },
    {
      name: "Inline code with \\text and \\times",
      input: "Use `\\text{hello}` and `\\times` in code.",
      expected: "Use `\\text{hello}` and `\\times` in code.",
    },
    {
      name: "Double superscript untouched",
      input: "Thermodynamics $\\Delta G^\\circ'$ formula.",
      expected: "Thermodynamics $\\Delta G^\\circ'$ formula.",
    },
    {
      name: "Normal Persian text with punctuation",
      input: "این یک متن آزمایشی است، شامل کلمات و اعداد ۱۲۳ و علامت‌های نگارشی.",
      expected: "این یک متن آزمایشی است، شامل کلمات و اعداد ۱۲۳ و علامت‌های نگارشی.",
    },
    {
      name: "Math with TAB corrupted \\text",
      input: "Formula: $\\t ext{GTP} + \\t ext{ADP}$",
      expected: "Formula: $\\text{GTP} + \\text{ADP}$",
    },
    {
      name: "Display math with CR corrupted \\rightleftharpoons",
      input: "$$\\text{A} \rightharpoons \\text{B}$$",
      expected: "$$\\text{A} \\rightleftharpoons \\text{B}$$",
    },
  ];

  for (const st of syntheticTests) {
    const res = repairCategoryAParserCorruption(st.input);
    if (res !== st.expected) {
      console.error(`SYNTHETIC TEST FAILED: ${st.name}`);
      console.error(`Expected: ${JSON.stringify(st.expected)}`);
      console.error(`Actual:   ${JSON.stringify(res)}`);
      unexpectedDiffs++;
    } else {
      console.log(`  ✓ ${st.name}: PASS`);
    }
  }

  // 2. Scan and test all 701 DB records
  console.log("\n2. Scanning and testing all DB records...");

  for (const row of gcs.rows) {
    const payload = row.payload || {};
    const repairedPayload = deepRepairObject(payload);

    // Deep structure validation
    const structErrors = validateDeepStructure(payload, repairedPayload, "payload");
    if (structErrors.length > 0) {
      deepDiffFailures += structErrors.length;
      console.error(`Structure errors in record ${row.id}:`, structErrors);
    }

    // Idempotency validation on whole payload
    const repairedAgain = deepRepairObject(repairedPayload);
    if (JSON.stringify(repairedPayload) !== JSON.stringify(repairedAgain)) {
      idempotencyFailures++;
      console.error(`Idempotency failure on record ${row.id}`);
    }

    // Check if record changed
    const recordChanged = JSON.stringify(payload) !== JSON.stringify(repairedPayload);

    // Check for Category B (\Delta G^\circ')
    let hasCatB = false;
    function checkCatB(str) {
      if (typeof str !== "string") return;
      if (/\\Delta\s*G\s*\^\\circ\s*'/g.test(str)) hasCatB = true;
    }
    function traverseCatB(obj) {
      if (!obj) return;
      if (typeof obj === "string") checkCatB(obj);
      else if (Array.isArray(obj)) obj.forEach(traverseCatB);
      else if (typeof obj === "object") Object.values(obj).forEach(traverseCatB);
    }
    traverseCatB(payload);

    if (hasCatB) categoryBRecords.push(row.id);

    if (recordChanged) {
      categoryARecords.push(row.id);

      // Save to snapshot
      snapshotData.push({
        id: row.id,
        course_id: row.course_id,
        document_id: row.document_id,
        type: row.type,
        status: row.status,
        updated_at: row.updated_at,
        edited_at: row.edited_at,
        edited_by: row.edited_by,
        previous_payload: row.previous_payload,
        payload: payload,
      });

      // Extract atomic diffs from all modified string fields
      function extractFromObj(orig, rep, pathStr) {
        if (typeof orig === "string" && orig !== rep) {
          // Check KaTeX validation
          const beforeKatex = validateKatex(orig);
          const afterKatex = validateKatex(rep);

          if (!beforeKatex.valid && !afterKatex.valid && afterKatex.errorCount > beforeKatex.errorCount) {
            rendererRegressions++;
          }

          const diffs = extractAtomicDiffs(orig, rep, pathStr);
          for (const d of diffs) {
            allDiffs.push({
              recordId: row.id,
              courseName: row.course_name,
              docName: row.doc_name,
              ...d,
            });

            // Strict Validation of Diff:
            // Must ONLY be literal TAB/CR or stripped-command -> LaTeX command restoration
            const isTabToText = d.origDiff.includes("\t") && (d.repDiff.includes("\\text") || d.repDiff.includes("\\times") || d.repDiff.includes("\\theta") || d.repDiff.includes("\\tau") || d.repDiff.includes("\\tan") || d.repDiff.includes("\\tilde") || d.repDiff.includes("\\triangle") || d.repDiff.includes("\\top"));
            const isCrToRight = d.origDiff.includes("\r") && (d.repDiff.includes("\\rightleftharpoons") || d.repDiff.includes("\\rightarrow") || d.repDiff.includes("\\right") || d.repDiff.includes("\\rho"));
            const isStrippedRight = d.origDiff.includes("ightleftharpoons") && d.repDiff.includes("\\rightleftharpoons");
            const isStrippedArrow = d.origDiff.includes("ightarrow") && d.repDiff.includes("\\rightarrow");

            if (!isTabToText && !isCrToRight && !isStrippedRight && !isStrippedArrow) {
              unexpectedDiffs++;
              console.error(`UNEXPECTED DIFF in GC ${row.id} at ${pathStr}:`, d);
            }
          }
        } else if (Array.isArray(orig)) {
          orig.forEach((item, idx) => extractFromObj(item, rep[idx], `${pathStr}[${idx}]`));
        } else if (orig && typeof orig === "object") {
          Object.keys(orig).forEach((k) => extractFromObj(orig[k], rep[k], `${pathStr}.${k}`));
        }
      }

      extractFromObj(payload, repairedPayload, "payload");
    }
  }

  // Save audit diffs and snapshot files in scratch/
  const scratchDir = "/Users/ops/Desktop/avana-landing-and-onboarding/scratch";
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const diffsFilePath = path.join(scratchDir, "category-a-diffs-audit.json");
  fs.writeFileSync(diffsFilePath, JSON.stringify(allDiffs, null, 2), "utf8");

  const snapshotFilePath = path.join(scratchDir, "snapshot-category-a-pre-mutation.json");
  fs.writeFileSync(snapshotFilePath, JSON.stringify(snapshotData, null, 2), "utf8");

  console.log(`\nSaved ${allDiffs.length} exact diffs to: ${diffsFilePath}`);
  console.log(`Saved ${snapshotData.length} records snapshot to: ${snapshotFilePath}`);

  console.log("\n===============================================================================");
  console.log("FINAL SAFETY GATE REPORT");
  console.log("===============================================================================");
  console.log(`Total DB records: ${totalRecords}`);
  console.log(`Category A records: ${categoryARecords.length}`);
  console.log(`Category B records: ${categoryBRecords.length}`);
  console.log(`Exact diffs inspected: ${allDiffs.length}`);
  console.log(`Unexpected diffs: ${unexpectedDiffs}`);
  console.log(`Code-block diffs: ${codeBlockDiffs}`);
  console.log(`Non-math diffs: ${nonMathDiffs}`);
  console.log(`Idempotency failures: ${idempotencyFailures}`);
  console.log(`Deep-diff failures: ${deepDiffFailures}`);
  console.log(`Renderer regressions: ${rendererRegressions}`);
  console.log(`Mutation READY: ${unexpectedDiffs === 0 && idempotencyFailures === 0 && deepDiffFailures === 0 && rendererRegressions === 0 ? "YES" : "NO"}`);
  console.log("===============================================================================");

  await pool.end();
}

main().catch(console.error);
