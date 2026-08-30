#!/usr/bin/env node
/**
 * scripts/backfill-shuffle-quiz-questions.mjs
 *
 * Production-Safe, Transaction-Safe & Rollback-Capable Backfill Script
 * for Shuffling Existing quiz_questions and Balancing Choice Positions.
 *
 * Usage:
 *   node scripts/backfill-shuffle-quiz-questions.mjs --dry-run   # Default safe simulation
 *   node scripts/backfill-shuffle-quiz-questions.mjs --apply     # Execute inside a transaction
 */

import pg from "pg";
import {
  canonicalizeAndShuffleQuestion,
  isStudentAnswerCorrect,
} from "@avana/domain";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

const isApplyMode = process.argv.includes("--apply");
const isDryRun = !isApplyMode || process.argv.includes("--dry-run");

function getPosition(choices, correctAnswer) {
  if (!choices || !Array.isArray(choices) || choices.length === 0) {
    return { pos: "UNKNOWN", index: -1 };
  }
  const cleanAns =
    typeof correctAnswer === "string"
      ? correctAnswer.trim()
      : correctAnswer
      ? String(correctAnswer).trim()
      : "";

  const exactIdx = choices.findIndex((c) => String(c).trim() === cleanAns);
  if (exactIdx !== -1) {
    return { pos: String.fromCharCode(65 + exactIdx), index: exactIdx };
  }

  const lowerAns = cleanAns.toLowerCase();
  const partialIdx = choices.findIndex(
    (c) =>
      String(c).toLowerCase().includes(lowerAns) ||
      lowerAns.includes(String(c).toLowerCase()),
  );
  if (partialIdx !== -1) {
    return { pos: String.fromCharCode(65 + partialIdx), index: partialIdx };
  }

  return { pos: "MISMATCH", index: -1 };
}

async function runBackfill() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  console.log("================================================================================");
  console.log(`AVANA QUIZ QUESTIONS POSITION BIAS BACKFILL`);
  console.log(`Mode: ${isApplyMode ? "⚡ APPLY (LIVE UPDATE)" : "🛡️  DRY-RUN (SIMULATION ONLY)"}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("================================================================================\n");

  const timestampSuffix = new Date()
    .toISOString()
    .replace(/[-:T.]/g, "")
    .slice(0, 14);
  const backupTableName = `quiz_questions_backup_${timestampSuffix}`;

  try {
    await client.query("BEGIN;");
    console.log("1. Transaction started (BEGIN).");

    if (isApplyMode) {
      console.log(`2. Creating snapshot backup table: ${backupTableName}...`);
      await client.query(
        `CREATE TABLE "${backupTableName}" AS SELECT * FROM quiz_questions;`,
      );
      console.log(`   ✅ Backup table "${backupTableName}" successfully created.`);
    } else {
      console.log(`2. [DRY-RUN] Skipping snapshot backup table creation.`);
    }

    console.log("3. Fetching all quiz_questions with row-level lock (FOR UPDATE)...");
    const fetchRes = await client.query(`
      SELECT id, quiz_id, question, choices, correct_answer, explanation, topic, sort_order
      FROM quiz_questions
      ORDER BY id ASC
      FOR UPDATE;
    `);

    const allQuestions = fetchRes.rows;
    const totalCount = allQuestions.length;
    console.log(`   Found ${totalCount} questions in database.\n`);

    const statsBefore = { A: 0, B: 0, C: 0, D: 0, Other: 0, Mismatch: 0 };
    const statsAfter = { A: 0, B: 0, C: 0, D: 0, Other: 0, Mismatch: 0 };
    const updates = [];
    const validationErrors = [];

    for (let i = 0; i < totalCount; i++) {
      const q = allQuestions[i];
      const posBefore = getPosition(q.choices, q.correct_answer);

      if (["A", "B", "C", "D"].includes(posBefore.pos)) {
        statsBefore[posBefore.pos]++;
      } else {
        statsBefore.Mismatch++;
      }

      // Execute canonicalization and Fisher-Yates shuffle
      const shuffled = canonicalizeAndShuffleQuestion({
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correct_answer,
      });

      const posAfter = getPosition(shuffled.choices, shuffled.correctAnswer);
      if (["A", "B", "C", "D"].includes(posAfter.pos)) {
        statsAfter[posAfter.pos]++;
      } else {
        statsAfter.Mismatch++;
      }

      // Assert post-shuffle validation invariants
      const postChoices = shuffled.choices || [];
      const postAns = shuffled.correctAnswer;
      const cleanPostAns = String(postAns).trim();
      const matchCountInChoices = postChoices.filter(
        (c) => String(c).trim() === cleanPostAns,
      ).length;

      const isTextMatchValid = isStudentAnswerCorrect(postAns, shuffled);
      const isLetterMatchValid =
        posAfter.pos !== "MISMATCH" && posAfter.pos !== "UNKNOWN"
          ? isStudentAnswerCorrect(posAfter.pos, shuffled)
          : false;

      let rowValid = true;
      const rowIssues = [];

      if (postChoices.length < 2) {
        rowValid = false;
        rowIssues.push(`Invalid choices length (${postChoices.length})`);
      }

      if (matchCountInChoices !== 1) {
        rowValid = false;
        rowIssues.push(`Correct answer match count in choices is ${matchCountInChoices} (expected 1)`);
      }

      if (!isTextMatchValid) {
        rowValid = false;
        rowIssues.push("Text grading assertion failed");
      }

      if (!isLetterMatchValid) {
        rowValid = false;
        rowIssues.push(`Letter (${posAfter.pos}) grading assertion failed`);
      }

      if (!rowValid) {
        validationErrors.push({
          id: q.id,
          question: q.question,
          issues: rowIssues,
        });
      } else {
        updates.push({
          id: q.id,
          choices: JSON.stringify(shuffled.choices),
          correctAnswer: JSON.stringify(shuffled.correctAnswer),
        });
      }
    }

    console.log("================================================================================");
    console.log("STATISTICAL DISTRIBUTION REPORT");
    console.log("================================================================================");
    console.log("BEFORE (Current DB State):");
    console.log(`  Option A: ${statsBefore.A.toString().padStart(4)} (${((statsBefore.A / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Option B: ${statsBefore.B.toString().padStart(4)} (${((statsBefore.B / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Option C: ${statsBefore.C.toString().padStart(4)} (${((statsBefore.C / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Option D: ${statsBefore.D.toString().padStart(4)} (${((statsBefore.D / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Mismatch: ${statsBefore.Mismatch.toString().padStart(4)} (${((statsBefore.Mismatch / totalCount) * 100).toFixed(2)}%)`);

    console.log("\nAFTER (Shuffled State):");
    console.log(`  Option A: ${statsAfter.A.toString().padStart(4)} (${((statsAfter.A / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Option B: ${statsAfter.B.toString().padStart(4)} (${((statsAfter.B / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Option C: ${statsAfter.C.toString().padStart(4)} (${((statsAfter.C / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Option D: ${statsAfter.D.toString().padStart(4)} (${((statsAfter.D / totalCount) * 100).toFixed(2)}%)`);
    console.log(`  Mismatch: ${statsAfter.Mismatch.toString().padStart(4)} (${((statsAfter.Mismatch / totalCount) * 100).toFixed(2)}%)`);

    console.log("\nVALIDATION RESULT:");
    console.log(`  Total Evaluated:  ${totalCount}`);
    console.log(`  Valid Records:    ${updates.length}`);
    console.log(`  Invalid Records:  ${validationErrors.length}`);

    if (validationErrors.length > 0) {
      console.error("\n❌ VALIDATION FAILED! Aborting backfill without changes.");
      console.error(JSON.stringify(validationErrors, null, 2));
      await client.query("ROLLBACK;");
      console.log("Transaction safely rolled back (ROLLBACK).");
      process.exit(1);
    }

    if (isApplyMode) {
      console.log("\n4. Applying batch updates to quiz_questions...");
      for (const u of updates) {
        await client.query(
          `UPDATE quiz_questions
           SET choices = $1::jsonb,
               correct_answer = $2::jsonb,
               updated_at = NOW()
           WHERE id = $3;`,
          [u.choices, u.correctAnswer, u.id],
        );
      }
      await client.query("COMMIT;");
      console.log(`\n🎉 SUCCESS: ${updates.length} questions updated and committed.`);
      console.log(`   Backup preserved in table: "${backupTableName}".`);
    } else {
      await client.query("ROLLBACK;");
      console.log("\n🛡️  DRY-RUN COMPLETE: 0 rows modified. Transaction safely rolled back.");
      console.log("   To execute live changes, run with: --apply");
    }
  } catch (err) {
    console.error("\n❌ UNEXPECTED ERROR DURING BACKFILL:", err);
    try {
      await client.query("ROLLBACK;");
      console.log("Transaction safely rolled back (ROLLBACK).");
    } catch (rbErr) {
      console.error("Rollback error:", rbErr);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runBackfill();
