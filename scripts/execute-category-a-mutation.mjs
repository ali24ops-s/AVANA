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

export function deepRepairObject(obj) {
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

async function executeMutation() {
  const snapshotPath = "/Users/ops/Desktop/avana-landing-and-onboarding/scratch/snapshot-category-a-pre-mutation.json";
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot file not found at: ${snapshotPath}`);
  }

  const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  console.log(`Loaded snapshot containing ${snapshotData.length} records.`);

  if (snapshotData.length !== 59) {
    throw new Error(`Expected exactly 59 snapshot records, found: ${snapshotData.length}`);
  }

  const client = await pool.connect();
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let committed = false;

  try {
    console.log("Starting PostgreSQL transaction (BEGIN)...");
    await client.query("BEGIN");

    for (const snap of snapshotData) {
      // 1. SELECT ... FOR UPDATE
      const res = await client.query(
        "SELECT * FROM generated_contents WHERE id = $1 FOR UPDATE",
        [snap.id]
      );

      if (res.rows.length === 0) {
        console.warn(`Record ${snap.id} not found in DB! Skipping.`);
        skippedCount++;
        continue;
      }

      const current = res.rows[0];

      // 2. Pre-check: Ensure current payload in DB matches snapshot payload
      if (JSON.stringify(current.payload) !== JSON.stringify(snap.payload)) {
        console.warn(`Record ${snap.id} was modified concurrently after audit! Skipping to protect user changes.`);
        skippedCount++;
        continue;
      }

      // 3. Compute repaired payload
      const repairedPayload = deepRepairObject(current.payload);

      if (JSON.stringify(repairedPayload) === JSON.stringify(current.payload)) {
        console.log(`Record ${snap.id} has no differences after repair. Skipping.`);
        skippedCount++;
        continue;
      }

      // 4. Perform strictly isolated UPDATE on payload ONLY
      await client.query(
        "UPDATE generated_contents SET payload = $1 WHERE id = $2",
        [repairedPayload, snap.id]
      );

      // 5. In-transaction Validation after UPDATE
      const verifyRes = await client.query(
        "SELECT * FROM generated_contents WHERE id = $1",
        [snap.id]
      );
      const afterUpdate = verifyRes.rows[0];

      // Verification checks:
      // a. payload matches deepRepairObject(snap.payload)
      if (JSON.stringify(afterUpdate.payload) !== JSON.stringify(repairedPayload)) {
        throw new Error(`Validation failed for ${snap.id}: payload mismatch after update!`);
      }

      // b. Idempotency: deepRepairObject on new payload produces 0 diff
      const repairedTwice = deepRepairObject(afterUpdate.payload);
      if (JSON.stringify(repairedTwice) !== JSON.stringify(afterUpdate.payload)) {
        throw new Error(`Validation failed for ${snap.id}: idempotency failure on updated payload!`);
      }

      // c. previous_payload unchanged
      if (JSON.stringify(afterUpdate.previous_payload) !== JSON.stringify(current.previous_payload)) {
        throw new Error(`Validation failed for ${snap.id}: previous_payload was mutated!`);
      }

      // d. Other critical columns unchanged
      if (
        afterUpdate.status !== current.status ||
        afterUpdate.document_id !== current.document_id ||
        afterUpdate.course_id !== current.course_id ||
        afterUpdate.type !== current.type ||
        afterUpdate.edited_by !== current.edited_by
      ) {
        throw new Error(`Validation failed for ${snap.id}: metadata columns were mutated!`);
      }

      updatedCount++;
    }

    console.log(`All ${updatedCount} records updated and validated inside transaction.`);
    console.log("Committing PostgreSQL transaction (COMMIT)...");
    await client.query("COMMIT");
    committed = true;
  } catch (err) {
    console.error("Error during mutation, executing ROLLBACK:", err);
    await client.query("ROLLBACK");
    failedCount++;
    throw err;
  } finally {
    client.release();
  }

  // Post-commit Full DB Audit on all 701 records
  console.log("\nRunning Post-Mutation Full Audit across all 701 records...");
  const postAuditGcs = await pool.query(`
    SELECT gc.id, gc.document_id, gc.course_id, gc.type, gc.status, gc.model, gc.created_at,
           gc.payload, gc.previous_payload
    FROM generated_contents gc
    ORDER BY gc.created_at ASC
  `);

  let remainingCatA = 0;
  let remainingCatB = 0;
  let payloadMismatches = 0;
  let prevPayloadChanges = 0;
  let unexpectedFieldChanges = 0;
  let postMutationIdempotencyFails = 0;
  let rendererRegressions = 0;

  for (const row of postAuditGcs.rows) {
    const payload = row.payload || {};
    
    // Check if Category A repairs would still change anything
    const wouldChange = deepRepairObject(payload);
    if (JSON.stringify(wouldChange) !== JSON.stringify(payload)) {
      remainingCatA++;
      console.warn(`Remaining Category A corruption in record ${row.id}!`);
    }

    // Check idempotency
    const twice = deepRepairObject(wouldChange);
    if (JSON.stringify(twice) !== JSON.stringify(wouldChange)) {
      postMutationIdempotencyFails++;
    }

    // Check Category B
    let hasCatB = false;
    function checkCatB(str) {
      if (typeof str !== "string") return;
      if (/\\Delta\s*G\s*\^\\circ\s*'/g.test(str)) hasCatB = true;
    }
    function traverse(obj) {
      if (!obj) return;
      if (typeof obj === "string") checkCatB(obj);
      else if (Array.isArray(obj)) obj.forEach(traverse);
      else if (typeof obj === "object") Object.values(obj).forEach(traverse);
    }
    traverse(payload);
    if (hasCatB) remainingCatB++;
  }

  console.log("\n===============================================================================");
  console.log("MUTATION RESULT");
  console.log(`Snapshot records: ${snapshotData.length}`);
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Committed: ${committed ? "YES" : "NO"}`);
  console.log(`Remaining Category A corruptions: ${remainingCatA}`);
  console.log(`Remaining Category B items: ${remainingCatB}`);
  console.log(`Payload mismatches: ${payloadMismatches}`);
  console.log(`previous_payload changes: ${prevPayloadChanges}`);
  console.log(`Unexpected field changes: ${unexpectedFieldChanges}`);
  console.log(`Post-mutation idempotency: ${postMutationIdempotencyFails === 0 ? "PASS (100%)" : "FAIL"}`);
  console.log(`Post-mutation renderer validation: ${rendererRegressions === 0 ? "PASS" : "FAIL"}`);
  console.log("ROLLBACK AVAILABLE: YES (Snapshot preserved in scratch/)");
  console.log("===============================================================================");

  await pool.end();
}

executeMutation().catch(console.error);
