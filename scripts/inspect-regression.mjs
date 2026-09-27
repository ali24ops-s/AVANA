import fs from "fs";
import { repairCategoryAParserCorruption } from "./final-safety-gate.mjs";
import katex from "katex";

// Let's find which record had renderer regression
import pg from "pg";
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

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

async function check() {
  const gcs = await pool.query(`SELECT id, payload FROM generated_contents`);
  for (const row of gcs.rows) {
    function traverse(obj, path) {
      if (!obj) return;
      if (typeof obj === "string") {
        const rep = repairCategoryAParserCorruption(obj);
        if (rep !== obj) {
          const bK = validateKatex(obj);
          const aK = validateKatex(rep);
          if (aK.errorCount > bK.errorCount) {
            console.log(`Regression in GC ${row.id} at ${path}:`);
            console.log(`Before errors (${bK.errorCount}):`, bK.errors);
            console.log(`After errors (${aK.errorCount}):`, aK.errors);
          }
        }
      } else if (Array.isArray(obj)) obj.forEach((item, idx) => traverse(item, `${path}[${idx}]`));
      else if (typeof obj === "object") Object.entries(obj).forEach(([k, v]) => traverse(v, `${path}.${k}`));
    }
    traverse(row.payload, "payload");
  }
  await pool.end();
}
check().catch(console.error);
