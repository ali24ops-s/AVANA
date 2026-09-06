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

async function main() {
  const connectionString = process.env.DATABASE_URL || localConnectionString();
  const { db, close } = createDbClient(connectionString);

  try {
    console.log("================================================================================");
    console.log("POST-BACKFILL LIVE DATABASE VERIFICATION & AUDIT");
    console.log("================================================================================\n");

    const EMOJI_AUDIT_REGEX =
      /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE0F]/u;

    const CALLOUT_SEARCH_REGEX =
      /\*\*(?:اشتباه[\s\u200C]+رایج|هشدار|اخطار|منع[\s\u200C]+مصرف|نکته[\s\u200C]+بالینی|نکته[\s\u200C]+مهم|کاربرد[\s\u200C]+دارویی|نکته[\s\u200C]+کلیدی|نکته[\s\u200C]+آموزشی|برای[\s\u200C]+فهم[\s\u200C]+بهتر|توضیح[\s\u200C]+تکمیلی|نکته|توصیه)\s*:\*\*/;

    // 1. Lessons Table Audit
    const allLessons = await db.select().from(schema.lessons);
    let lessonsWithEmoji = 0;
    let lessonsWithStructuredCallouts = 0;
    let unnormalizedLessons = 0;

    for (const l of allLessons) {
      if (!l.contentMarkdown) continue;
      if (EMOJI_AUDIT_REGEX.test(l.contentMarkdown)) {
        lessonsWithEmoji++;
      }
      if (CALLOUT_SEARCH_REGEX.test(l.contentMarkdown)) {
        lessonsWithStructuredCallouts++;
      }
      if (normalizeEducationalContent(l.contentMarkdown) !== l.contentMarkdown) {
        unnormalizedLessons++;
      }
    }

    console.log(`1. Lessons Table:`);
    console.log(`   - Total Records: ${allLessons.length}`);
    console.log(`   - Records with Structured Callouts: ${lessonsWithStructuredCallouts}`);
    console.log(`   - Records with Remaining Emojis: ${lessonsWithEmoji}`);
    console.log(`   - Unnormalized Records Requiring Fix: ${unnormalizedLessons}\n`);

    // 2. Generated Contents Table Audit
    const allGenerated = await db.select().from(schema.generatedContents);
    let generatedWithEmoji = 0;
    let unnormalizedGenerated = 0;

    for (const gc of allGenerated) {
      const payloadStr = JSON.stringify(gc.payload || {});
      if (EMOJI_AUDIT_REGEX.test(payloadStr)) {
        generatedWithEmoji++;
      }
      const rawPayload = gc.payload as any;
      if (rawPayload && typeof rawPayload === "object") {
        if (rawPayload.content_markdown && typeof rawPayload.content_markdown === "string") {
          if (normalizeEducationalContent(rawPayload.content_markdown) !== rawPayload.content_markdown) {
            unnormalizedGenerated++;
          }
        }
      }
    }

    console.log(`2. Generated Contents Table:`);
    console.log(`   - Total Records: ${allGenerated.length}`);
    console.log(`   - Records with Remaining Emojis: ${generatedWithEmoji}`);
    console.log(`   - Unnormalized Records Requiring Fix: ${unnormalizedGenerated}\n`);

    // 3. Generation Chunks Table Audit
    const allChunks = await db.select().from(schema.generationChunks);
    let chunksWithEmoji = 0;
    let unnormalizedChunks = 0;

    for (const ch of allChunks) {
      const payloadStr = JSON.stringify(ch.payload || {});
      if (EMOJI_AUDIT_REGEX.test(payloadStr)) {
        chunksWithEmoji++;
      }
      const rawPayload = ch.payload as any;
      if (rawPayload && typeof rawPayload === "object") {
        if (rawPayload.contentMarkdown && typeof rawPayload.contentMarkdown === "string") {
          if (normalizeEducationalContent(rawPayload.contentMarkdown) !== rawPayload.contentMarkdown) {
            unnormalizedChunks++;
          }
        }
      }
    }

    console.log(`3. Generation Chunks Table:`);
    console.log(`   - Total Records: ${allChunks.length}`);
    console.log(`   - Records with Remaining Emojis: ${chunksWithEmoji}`);
    console.log(`   - Unnormalized Records Requiring Fix: ${unnormalizedChunks}\n`);

    // 4. Inspect Sample Lessons for Medical/Formula Preservation
    console.log("================================================================================");
    console.log("REAL SAMPLE INSPECTIONS (Checking Medical Integrity & Callout Structure)");
    console.log("================================================================================\n");

    const sample = allLessons.filter((l) => l.contentMarkdown && CALLOUT_SEARCH_REGEX.test(l.contentMarkdown)).slice(0, 5);
    for (const s of sample) {
      console.log(`📋 Title: ${s.title}`);
      const lines = (s.contentMarkdown || "").split("\n").filter((l) => CALLOUT_SEARCH_REGEX.test(l));
      for (const line of lines.slice(0, 3)) {
        console.log(`   ${line}`);
      }
      console.log("--------------------------------------------------------------------------------");
    }

  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
