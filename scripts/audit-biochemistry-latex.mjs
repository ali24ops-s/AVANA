import pg from "pg";
import katex from "katex";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
});

function testKatexErrors(text) {
  if (!text) return [];
  const errors = [];
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  let match;
  while ((match = mathRegex.exec(text)) !== null) {
    const rawMath = match[0];
    const isDisplay = rawMath.startsWith("$$");
    const mathContent = isDisplay ? rawMath.slice(2, -2) : rawMath.slice(1, -1);
    try {
      katex.renderToString(mathContent, {
        displayMode: isDisplay,
        throwOnError: true,
      });
    } catch (err) {
      errors.push({
        rawMath,
        mathContent,
        error: err.message,
      });
    }
  }
  return errors;
}

function findCorruptions(text, location = "") {
  if (!text || typeof text !== "string") return [];
  const issues = [];

  const tabCommandRegex = /\t\s*(ext|heta|imes|au|an|ilde|riangle|op|woheadrightarrow)\b/g;
  let m;
  while ((m = tabCommandRegex.exec(text)) !== null) {
    issues.push({
      type: "tab_corrupted_command",
      location,
      match: m[0],
      index: m.index,
      snippet: text.slice(Math.max(0, m.index - 20), Math.min(text.length, m.index + 40)),
      suggestedFix: "\\" + (m[1] === "ext" ? "text" : m[1]),
    });
  }

  const mathBlocks = [...text.matchAll(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g)];
  for (const mb of mathBlocks) {
    const mathStr = mb[0];
    if (mathStr.includes("\t")) {
      issues.push({
        type: "tab_in_math_block",
        location,
        snippet: mathStr,
      });
    }
    if (mathStr.includes("\r")) {
      issues.push({
        type: "cr_in_math_block",
        location,
        snippet: mathStr,
      });
    }
    const rStripped = mathStr.match(/(?<![a-zA-Z\\])(ightleftharpoons|ightarrow|ight\b|angle\b|ho\b|adical\b)/g);
    if (rStripped) {
      issues.push({
        type: "r_stripped_command_in_math",
        location,
        matches: rStripped,
        snippet: mathStr,
      });
    }
    const bStripped = mathStr.match(/(?<![a-zA-Z\\])(eta\b|binom\{)/g);
    if (bStripped) {
      issues.push({
        type: "b_stripped_command_in_math",
        location,
        matches: bStripped,
        snippet: mathStr,
      });
    }
    const fStripped = mathStr.match(/(?<![a-zA-Z\\])(rac\{)/g);
    if (fStripped) {
      issues.push({
        type: "f_stripped_command_in_math",
        location,
        matches: fStripped,
        snippet: mathStr,
      });
    }
    const nStripped = mathStr.match(/(?<![a-zA-Z\\])(abla\b|otin\b)/g);
    if (nStripped) {
      issues.push({
        type: "n_stripped_command_in_math",
        location,
        matches: nStripped,
        snippet: mathStr,
      });
    }
  }

  const dollarCount = (text.match(/(?<!\\)\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    issues.push({
      type: "unbalanced_dollar_delimiters",
      location,
      count: dollarCount,
      snippet: text.slice(0, 100) + "...",
    });
  }

  if ((text.match(/\\\[/g) || []).length !== (text.match(/\\\]/g) || []).length) {
    issues.push({
      type: "unbalanced_display_brackets",
      location,
    });
  }

  if ((text.match(/\\\(/g) || []).length !== (text.match(/\\\)/g) || []).length) {
    issues.push({
      type: "unbalanced_inline_parens",
      location,
    });
  }

  return issues;
}

async function runAudit() {
  console.log("=== STARTING DB AUDIT ===");
  
  const gcs = await pool.query(`
    SELECT gc.id, gc.document_id, gc.course_id, gc.type, gc.status, gc.model, gc.created_at,
           gc.payload, gc.previous_payload, gc.materialized_lesson_id,
           d.original_name as doc_name, c.name as course_name
    FROM generated_contents gc
    LEFT JOIN documents d ON d.id = gc.document_id
    LEFT JOIN courses c ON c.id = gc.course_id
    ORDER BY gc.created_at ASC
  `);

  console.log(`Auditing ${gcs.rows.length} generated_contents records...`);

  const report = [];

  for (const row of gcs.rows) {
    const payload = row.payload || {};
    const recordIssues = [];
    const katexFailures = [];

    const checkField = (val, path) => {
      if (typeof val === "string") {
        const issues = findCorruptions(val, path);
        if (issues.length > 0) recordIssues.push(...issues);
        const kErrors = testKatexErrors(val);
        if (kErrors.length > 0) {
          katexFailures.push({ path, kErrors });
        }
      } else if (Array.isArray(val)) {
        val.forEach((item, idx) => checkField(item, `${path}[${idx}]`));
      } else if (val && typeof val === "object") {
        Object.entries(val).forEach(([k, v]) => checkField(v, `${path}.${k}`));
      }
    };

    checkField(payload, "payload");

    if (recordIssues.length > 0 || katexFailures.length > 0) {
      report.push({
        id: row.id,
        type: row.type,
        status: row.status,
        courseId: row.course_id,
        courseName: row.course_name,
        docId: row.document_id,
        docName: row.doc_name,
        materializedLessonId: row.materialized_lesson_id,
        issuesCount: recordIssues.length,
        issues: recordIssues,
        katexFailuresCount: katexFailures.length,
        katexFailures,
      });
    }
  }

  const lessons = await pool.query(`
    SELECT l.id, l.title, l.module_id, l.content_markdown, l.publication_status, l.created_at,
           m.course_id, c.name as course_name
    FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN courses c ON c.id = m.course_id
    ORDER BY l.created_at ASC
  `);

  console.log(`Auditing ${lessons.rows.length} materialized lessons...`);
  const lessonReport = [];

  for (const row of lessons.rows) {
    const recordIssues = [];
    const katexFailures = [];

    const checkText = (text, fieldName) => {
      if (!text) return;
      const issues = findCorruptions(text, fieldName);
      if (issues.length > 0) recordIssues.push(...issues);
      const kErrors = testKatexErrors(text);
      if (kErrors.length > 0) katexFailures.push({ path: fieldName, kErrors });
    };

    checkText(row.title, "title");
    checkText(row.content_markdown, "content_markdown");

    if (recordIssues.length > 0 || katexFailures.length > 0) {
      lessonReport.push({
        id: row.id,
        title: row.title,
        courseId: row.course_id,
        courseName: row.course_name,
        issuesCount: recordIssues.length,
        issues: recordIssues,
        katexFailuresCount: katexFailures.length,
        katexFailures,
      });
    }
  }

  console.log("\n=== AUDIT RESULTS SUMMARY ===");
  console.log(`Total generated_contents scanned: ${gcs.rows.length}`);
  console.log(`Total generated_contents with issues: ${report.length}`);
  console.log(`Total lessons scanned: ${lessons.rows.length}`);
  console.log(`Total lessons with issues: ${lessonReport.length}`);

  console.log("\n=== DETAILED GENERATED CONTENTS ISSUES ===");
  console.log(JSON.stringify(report, null, 2));

  console.log("\n=== DETAILED LESSONS ISSUES ===");
  console.log(JSON.stringify(lessonReport, null, 2));

  await pool.end();
}

runAudit().catch(console.error);
