/**
 * Idempotent Backfill & Migration Script for Educational Content Callouts & Zero-Emoji Normalization.
 *
 * Usage:
 *   Dry run (default, safe, read-only):
 *     npx tsx scripts/backfill-normalize-lesson-callouts.ts
 *
 *   Live backfill (applies changes to database):
 *     npx tsx scripts/backfill-normalize-lesson-callouts.ts --live
 */

import { eq, sql } from "drizzle-orm";
import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { normalizeEducationalContent } from "@avana/domain";

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

const connectionString = process.env.DATABASE_URL ?? localConnectionString();
const isLive = process.argv.includes("--live") || process.argv.includes("--apply");

interface ModifiedRecordDetail {
  table: string;
  id: string;
  title?: string;
  patternsFound: string[];
  sampleOriginalSnippet: string;
  sampleNormalizedSnippet: string;
}

async function main() {
  console.log("================================================================================");
  console.log(`AVANA Educational Content Normalization & Callout Migration [${isLive ? "LIVE EXECUTION" : "DRY-RUN MODE"}]`);
  console.log("================================================================================\n");

  const { db, close } = createDbClient(connectionString);

  try {
    // 1. Scan Lessons Table
    console.log("🔍 Scanning `lessons` table...");
    const allLessons = await db.select().from(schema.lessons);
    console.log(`Total lessons in database: ${allLessons.length}`);

    const affectedLessons: ModifiedRecordDetail[] = [];
    const lessonsToUpdate: Array<{ id: string; original: string; normalized: string }> = [];

    for (const lesson of allLessons) {
      if (!lesson.contentMarkdown) continue;
      const normalized = normalizeEducationalContent(lesson.contentMarkdown);
      if (normalized !== lesson.contentMarkdown) {
        const patterns: string[] = [];
        if (/⚠️|⚠/.test(lesson.contentMarkdown)) patterns.push("Warning/CommonMistake Emoji (⚠️)");
        if (/💡/.test(lesson.contentMarkdown)) patterns.push("Tip/Supplementary Emoji (💡)");
        if (/🧠/.test(lesson.contentMarkdown)) patterns.push("Understanding Emoji (🧠)");
        if (/📌/.test(lesson.contentMarkdown)) patterns.push("Educational Tip/Pin Emoji (📌)");
        if (/💊/.test(lesson.contentMarkdown)) patterns.push("Pill/Clinical Emoji (💊)");
        if (/🚨|❗/.test(lesson.contentMarkdown)) patterns.push("Alert/Exclamation Emoji (🚨/❗)");
        if (/⛔|🚫/.test(lesson.contentMarkdown)) patterns.push("Contraindication Emoji (⛔/🚫)");
        if (/🔑|✅/.test(lesson.contentMarkdown)) patterns.push("Key Point Emoji (🔑/✅)");

        // Extract a snippet showing the change
        const origLines = lesson.contentMarkdown.split("\n");
        const normLines = normalized.split("\n");
        let origSnippet = "";
        let normSnippet = "";
        for (let i = 0; i < origLines.length; i++) {
          if (origLines[i] !== normLines[i]) {
            origSnippet = origLines[i];
            normSnippet = normLines[i];
            break;
          }
        }

        affectedLessons.push({
          table: "lessons",
          id: lesson.id,
          title: lesson.title,
          patternsFound: patterns.length > 0 ? patterns : ["Decorative Emoji/Formatting"],
          sampleOriginalSnippet: origSnippet,
          sampleNormalizedSnippet: normSnippet,
        });

        lessonsToUpdate.push({
          id: lesson.id,
          original: lesson.contentMarkdown,
          normalized,
        });
      }
    }

    console.log(`Affected lessons found: ${affectedLessons.length} / ${allLessons.length}\n`);

    // 2. Scan Generated Contents Table
    console.log("🔍 Scanning `generated_contents` table...");
    const allGenerated = await db.select().from(schema.generatedContents);
    console.log(`Total generated_contents in database: ${allGenerated.length}`);

    const affectedGenerated: ModifiedRecordDetail[] = [];
    const generatedToUpdate: Array<{ id: string; newPayload: unknown }> = [];

    for (const gc of allGenerated) {
      if (!gc.payload || typeof gc.payload !== "object") continue;
      const rawPayload = gc.payload as any;
      let hasChanged = false;
      let updatedPayload = JSON.parse(JSON.stringify(rawPayload));

      if (gc.type === "lesson") {
        if (typeof rawPayload.contentMarkdown === "string") {
          const norm = normalizeEducationalContent(rawPayload.contentMarkdown);
          if (norm !== rawPayload.contentMarkdown) {
            hasChanged = true;
            updatedPayload.contentMarkdown = norm;
          }
        }
        if (Array.isArray(rawPayload.outline)) {
          updatedPayload.outline = rawPayload.outline.map((o: any) => {
            let outlineChanged = false;
            const newO = { ...o };
            if (typeof o.description === "string") {
              const norm = normalizeEducationalContent(o.description);
              if (norm !== o.description) {
                newO.description = norm;
                outlineChanged = true;
              }
            }
            if (outlineChanged) hasChanged = true;
            return outlineChanged ? newO : o;
          });
        }
        if (Array.isArray(rawPayload.sessions)) {
          updatedPayload.sessions = rawPayload.sessions.map((s: any) => {
            if (s.contentMarkdown) {
              const norm = normalizeEducationalContent(s.contentMarkdown);
              if (norm !== s.contentMarkdown) {
                hasChanged = true;
                return { ...s, contentMarkdown: norm };
              }
            }
            return s;
          });
        }
      } else if (gc.type === "flashcard" || gc.type === "flashcards") {
        if (Array.isArray(rawPayload.items)) {
          updatedPayload.items = rawPayload.items.map((it: any) => {
            let itemChanged = false;
            const newItem = { ...it };
            if (typeof it.question === "string") {
              const norm = normalizeEducationalContent(it.question);
              if (norm !== it.question) {
                newItem.question = norm;
                itemChanged = true;
              }
            }
            if (typeof it.answer === "string") {
              const norm = normalizeEducationalContent(it.answer);
              if (norm !== it.answer) {
                newItem.answer = norm;
                itemChanged = true;
              }
            }
            if (typeof it.explanation === "string") {
              const norm = normalizeEducationalContent(it.explanation);
              if (norm !== it.explanation) {
                newItem.explanation = norm;
                itemChanged = true;
              }
            }
            if (itemChanged) hasChanged = true;
            return itemChanged ? newItem : it;
          });
        }
      } else if (gc.type === "quiz") {
        if (Array.isArray(rawPayload.questions)) {
          updatedPayload.questions = rawPayload.questions.map((q: any) => {
            let qChanged = false;
            const newQ = { ...q };
            if (typeof q.question === "string") {
              const norm = normalizeEducationalContent(q.question);
              if (norm !== q.question) {
                newQ.question = norm;
                qChanged = true;
              }
            }
            if (typeof q.explanation === "string") {
              const norm = normalizeEducationalContent(q.explanation);
              if (norm !== q.explanation) {
                newQ.explanation = norm;
                qChanged = true;
              }
            }
            if (qChanged) hasChanged = true;
            return qChanged ? newQ : q;
          });
        }
      } else if (gc.type === "review_summary") {
        if (rawPayload.overview) {
          const norm = normalizeEducationalContent(rawPayload.overview);
          if (norm !== rawPayload.overview) {
            hasChanged = true;
            updatedPayload.overview = norm;
          }
        }
        if (Array.isArray(rawPayload.finalTakeaways)) {
          updatedPayload.finalTakeaways = rawPayload.finalTakeaways.map((ft: string) => {
            const norm = normalizeEducationalContent(ft);
            if (norm !== ft) {
              hasChanged = true;
              return norm;
            }
            return ft;
          });
        }
        if (Array.isArray(rawPayload.sections)) {
          updatedPayload.sections = rawPayload.sections.map((sec: any) => {
            let secChanged = false;
            const newSec = { ...sec };
            if (Array.isArray(sec.keyPoints)) {
              newSec.keyPoints = sec.keyPoints.map((kp: string) => {
                const norm = normalizeEducationalContent(kp);
                if (norm !== kp) {
                  hasChanged = true;
                  secChanged = true;
                  return norm;
                }
                return kp;
              });
            }
            if (Array.isArray(sec.mechanisms)) {
              newSec.mechanisms = sec.mechanisms.map((m: string) => {
                const norm = normalizeEducationalContent(m);
                if (norm !== m) {
                  hasChanged = true;
                  secChanged = true;
                  return norm;
                }
                return m;
              });
            }
            if (Array.isArray(sec.memorizationPoints)) {
              newSec.memorizationPoints = sec.memorizationPoints.map((mp: string) => {
                const norm = normalizeEducationalContent(mp);
                if (norm !== mp) {
                  hasChanged = true;
                  secChanged = true;
                  return norm;
                }
                return mp;
              });
            }
            if (Array.isArray(sec.examPoints)) {
              newSec.examPoints = sec.examPoints.map((ep: string) => {
                const norm = normalizeEducationalContent(ep);
                if (norm !== ep) {
                  hasChanged = true;
                  secChanged = true;
                  return norm;
                }
                return ep;
              });
            }
            return secChanged ? newSec : sec;
          });
        }
      } else if (typeof rawPayload.contentMarkdown === "string") {
        const norm = normalizeEducationalContent(rawPayload.contentMarkdown);
        if (norm !== rawPayload.contentMarkdown) {
          hasChanged = true;
          updatedPayload.contentMarkdown = norm;
        }
      }

      if (hasChanged) {
        affectedGenerated.push({
          table: "generated_contents",
          id: gc.id,
          title: `Type: ${gc.type} (Doc: ${gc.documentId || "none"})`,
          patternsFound: ["AI Payload Educational Content Normalization"],
          sampleOriginalSnippet: JSON.stringify(rawPayload).slice(0, 150) + "...",
          sampleNormalizedSnippet: JSON.stringify(updatedPayload).slice(0, 150) + "...",
        });
        generatedToUpdate.push({
          id: gc.id,
          newPayload: updatedPayload,
        });
      }
    }

    console.log(`Affected generated_contents found: ${affectedGenerated.length} / ${allGenerated.length}\n`);

    // 3. Scan Generation Chunks Table
    console.log("🔍 Scanning `generation_chunks` table...");
    const allChunks = await db.select().from(schema.generationChunks);
    console.log(`Total generation_chunks in database: ${allChunks.length}`);

    const affectedChunks: ModifiedRecordDetail[] = [];
    const chunksToUpdate: Array<{ id: string; newPayload: unknown }> = [];

    for (const chunk of allChunks) {
      if (!chunk.payload || typeof chunk.payload !== "object") continue;
      const rawPayload = chunk.payload as any;
      let hasChanged = false;
      let updatedPayload = JSON.parse(JSON.stringify(rawPayload));

      if (chunk.stage === "lesson" && typeof rawPayload.contentMarkdown === "string") {
        const norm = normalizeEducationalContent(rawPayload.contentMarkdown);
        if (norm !== rawPayload.contentMarkdown) {
          hasChanged = true;
          updatedPayload.contentMarkdown = norm;
        }
      }

      if (hasChanged) {
        affectedChunks.push({
          table: "resumable_generation_chunks",
          id: chunk.id,
          title: `Chunk ${chunk.chunkKey} (${chunk.stage})`,
          patternsFound: ["Chunk Stage 2 Normalization"],
          sampleOriginalSnippet: (rawPayload.contentMarkdown || "").slice(0, 150) + "...",
          sampleNormalizedSnippet: (updatedPayload.contentMarkdown || "").slice(0, 150) + "...",
        });
        chunksToUpdate.push({
          id: chunk.id,
          newPayload: updatedPayload,
        });
      }
    }

    console.log(`Affected resumable chunks found: ${affectedChunks.length} / ${allChunks.length}\n`);

    // 4. Sample Inspection Report
    console.log("================================================================================");
    console.log("INSPECTION & DIFF SAMPLES");
    console.log("================================================================================\n");

    const sampleLessons = affectedLessons.slice(0, 5);
    if (sampleLessons.length === 0) {
      console.log("✨ No legacy emoji / unnormalized patterns detected in current database.");
    } else {
      for (const item of sampleLessons) {
        console.log(`📋 Record ID: [${item.id}] "${item.title}"`);
        console.log(`   Patterns: ${item.patternsFound.join(", ")}`);
        console.log(`   🔴 Before: ${item.sampleOriginalSnippet}`);
        console.log(`   🟢 After:  ${item.sampleNormalizedSnippet}`);
        console.log("--------------------------------------------------------------------------------");
      }
    }

    // 5. Execution Summary
    const totalAffected = affectedLessons.length + affectedGenerated.length + affectedChunks.length;
    console.log("\n================================================================================");
    console.log("MIGRATION SUMMARY");
    console.log("================================================================================");
    console.log(`- Affected Lessons:            ${affectedLessons.length} / ${allLessons.length}`);
    console.log(`- Affected Generated Contents: ${affectedGenerated.length} / ${allGenerated.length}`);
    console.log(`- Affected Resumable Chunks:   ${affectedChunks.length} / ${allChunks.length}`);
    console.log(`- Total Records to Update:     ${totalAffected}`);
    console.log("================================================================================\n");

    if (!isLive) {
      console.log("ℹ️  DRY-RUN COMPLETE: No database modifications were made.");
      console.log("ℹ️  To apply these changes live, run with the `--live` flag.");
    } else {
      if (totalAffected === 0) {
        console.log("✅ Database is already 100% up to date. Zero updates needed.");
      } else {
        console.log("🚀 Applying updates to database within an atomic transaction...");
        const now = new Date();

        await db.transaction(async (tx) => {
          for (const item of lessonsToUpdate) {
            await tx
              .update(schema.lessons)
              .set({ contentMarkdown: item.normalized, updatedAt: now })
              .where(eq(schema.lessons.id, item.id));
          }

          for (const item of generatedToUpdate) {
            await tx
              .update(schema.generatedContents)
              .set({ payload: item.newPayload as any, updatedAt: now })
              .where(eq(schema.generatedContents.id, item.id));
          }

          for (const item of chunksToUpdate) {
            await tx
              .update(schema.generationChunks)
              .set({ payload: item.newPayload as any, updatedAt: now })
              .where(eq(schema.generationChunks.id, item.id));
          }
        });

        console.log(`✅ Successfully updated ${totalAffected} records in database:`);
        console.log(`   - Lessons:            ${lessonsToUpdate.length}`);
        console.log(`   - Generated Contents: ${generatedToUpdate.length}`);
        console.log(`   - Resumable Chunks:   ${chunksToUpdate.length}`);
      }
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
