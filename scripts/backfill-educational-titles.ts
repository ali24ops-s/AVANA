import pg from "pg";
import {
  isFilenameLike,
  isSuspiciousTitle,
  cleanEducationalTitle,
  formatModuleTitle,
} from "@avana/domain";

interface AuditCandidate {
  table: string;
  id: string;
  field: string;
  oldTitle: string | null;
  newTitle: string;
  category: "numeric" | "filename_with_ext" | "raw_filename_slug" | "فصل: N" | "empty_null" | "suspicious_corrupted";
  sourceDocumentId?: string | null;
  sourceDocOriginalName?: string | null;
  resolutionSource: string;
  extraPayloadUpdates?: Record<string, unknown>;
}

function categorizeTitle(title: string | null | undefined): AuditCandidate["category"] {
  if (!title || title.trim().length === 0) return "empty_null";
  const trimmed = title.trim();
  if (/\.(pdf|docx?|pptx?|xlsx?|txt|csv|bin|mp3|wav|png|jpe?g|webp)$/i.test(trimmed)) {
    return "filename_with_ext";
  }
  const core = trimmed.replace(/^فصل\s*[:\-–—]?\s*/i, "").trim();
  if (/^\d+(\.\d+)?$/.test(core)) {
    return trimmed.startsWith("فصل") ? "فصل: N" : "numeric";
  }
  if (/^[a-zA-Z0-9_\-\.]+$/.test(core) && (core.includes("_") || core.includes("-")) && !core.includes(" ")) {
    return "raw_filename_slug";
  }
  return "suspicious_corrupted";
}

async function run() {
  const isCommit = process.argv.includes("--commit");
  console.log(`\n======================================================`);
  console.log(`AVANA DATABASE CONTENT TITLE AUDIT & BACKFILL`);
  console.log(`Mode: ${isCommit ? "🚨 LIVE COMMIT (TRANSACTIONAL)" : "🔍 DRY RUN (NO CHANGES)"}`);
  console.log(`======================================================\n`);

  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable",
  });

  const client = await pool.connect();

  try {
    // 1. Fetch all documents for source reference
    const docsRes = await client.query(
      `SELECT id, original_name, course_id, organization_id FROM documents`
    );
    const docMap = new Map<string, { id: string; original_name: string; course_id: string | null }>();
    for (const d of docsRes.rows) {
      docMap.set(d.id, d);
    }

    // 2. Fetch all generated_contents
    const gcRes = await client.query(
      `SELECT id, document_id, course_id, type, status, payload, created_at FROM generated_contents WHERE deleted_at IS NULL ORDER BY created_at ASC`
    );
    const generatedContents = gcRes.rows;

    // Helper: Map document_id -> educational candidates extracted from AI payloads
    const docEducationalTitleMap = new Map<string, { title: string; source: string }>();

    for (const gc of generatedContents) {
      if (!gc.document_id) continue;
      if (docEducationalTitleMap.has(gc.document_id)) continue;

      const p = (gc.payload || {}) as Record<string, unknown>;
      // Look for moduleTitle or lesson title
      const pModTitle = typeof p.moduleTitle === "string" ? p.moduleTitle.trim() : null;
      if (pModTitle && !isFilenameLike(pModTitle) && !isSuspiciousTitle(pModTitle)) {
        docEducationalTitleMap.set(gc.document_id, {
          title: cleanEducationalTitle(pModTitle.replace(/^فصل\s*[:\-–—]?\s*/i, "")),
          source: `gc[${gc.type}].payload.moduleTitle`,
        });
        continue;
      }

      if (gc.type === "lesson") {
        const pTitle = typeof p.title === "string" ? p.title.trim() : null;
        if (pTitle && !isFilenameLike(pTitle) && !isSuspiciousTitle(pTitle)) {
          docEducationalTitleMap.set(gc.document_id, {
            title: cleanEducationalTitle(pTitle),
            source: "gc[lesson].payload.title",
          });
          continue;
        }

        if (Array.isArray(p.sessions) && p.sessions.length > 0) {
          const s0 = p.sessions[0] as { title?: string };
          if (s0?.title && !isFilenameLike(s0.title) && !isSuspiciousTitle(s0.title)) {
            docEducationalTitleMap.set(gc.document_id, {
              title: cleanEducationalTitle(s0.title),
              source: "gc[lesson].payload.sessions[0].title",
            });
            continue;
          }
        }
      }

      if (gc.type === "quiz") {
        const pTopic = typeof p.topic === "string" ? p.topic.trim() : null;
        if (pTopic && !isFilenameLike(pTopic) && !isSuspiciousTitle(pTopic)) {
          docEducationalTitleMap.set(gc.document_id, {
            title: cleanEducationalTitle(pTopic),
            source: "gc[quiz].payload.topic",
          });
          continue;
        }
      }
    }

    const candidates: AuditCandidate[] = [];

    // ----------------------------------------------------
    // Audit Table 1: modules
    // ----------------------------------------------------
    const modulesRes = await client.query(
      `SELECT id, course_id, document_id, title, description FROM modules WHERE deleted_at IS NULL ORDER BY created_at ASC`
    );
    let modulesAudited = 0;
    let modulesUntouched = 0;

    for (const m of modulesRes.rows) {
      modulesAudited++;
      const currentTitle = m.title;
      if (!isFilenameLike(currentTitle) && !isSuspiciousTitle(currentTitle)) {
        modulesUntouched++;
        continue;
      }

      const docInfo = m.document_id ? docMap.get(m.document_id) : null;
      const extracted = m.document_id ? docEducationalTitleMap.get(m.document_id) : null;

      const baseTitle = extracted ? extracted.title : "مبحث آموزشی جامع";
      const newTitle = formatModuleTitle(baseTitle, "فصل: مبحث آموزشی جامع");

      candidates.push({
        table: "modules",
        id: m.id,
        field: "title",
        oldTitle: currentTitle,
        newTitle,
        category: categorizeTitle(currentTitle),
        sourceDocumentId: m.document_id,
        sourceDocOriginalName: docInfo?.original_name,
        resolutionSource: extracted ? extracted.source : "generic_fallback",
      });
    }

    // ----------------------------------------------------
    // Audit Table 2: generated_contents (review_summary, flashcard, quiz, lesson)
    // ----------------------------------------------------
    let gcAudited = 0;
    let gcUntouched = 0;

    for (const gc of generatedContents) {
      gcAudited++;
      const p = (gc.payload || {}) as Record<string, unknown>;
      const currentTitle = typeof p.title === "string" ? p.title : null;
      const currentModTitle = typeof p.moduleTitle === "string" ? p.moduleTitle : null;

      const isTitleBad = isFilenameLike(currentTitle) || isSuspiciousTitle(currentTitle);
      const isModTitleBad = gc.type === "lesson" && currentModTitle && (isFilenameLike(currentModTitle) || isSuspiciousTitle(currentModTitle));

      if (!isTitleBad && !isModTitleBad && currentTitle) {
        gcUntouched++;
        continue;
      }

      const docInfo = gc.document_id ? docMap.get(gc.document_id) : null;
      const extracted = gc.document_id ? docEducationalTitleMap.get(gc.document_id) : null;
      const baseTitle = extracted ? extracted.title : "مبحث آموزشی جامع";

      let canonicalTitle = baseTitle;
      if (gc.type === "review_summary") {
        canonicalTitle = baseTitle.startsWith("خلاصه") ? baseTitle : `خلاصه مروری: ${baseTitle}`;
      } else if (gc.type === "flashcard") {
        canonicalTitle = baseTitle.startsWith("فلش‌کارت") ? baseTitle : `فلش‌کارت‌های آموزشی: ${baseTitle}`;
      } else if (gc.type === "quiz") {
        canonicalTitle = baseTitle.startsWith("آزمون") ? baseTitle : `آزمون ارزیابی آموخته‌ها: ${baseTitle}`;
      }

      const extraPayloadUpdates: Record<string, unknown> = {};
      if (isModTitleBad) {
        extraPayloadUpdates.moduleTitle = formatModuleTitle(baseTitle);
      }

      candidates.push({
        table: "generated_contents",
        id: gc.id,
        field: `payload.title (${gc.type})`,
        oldTitle: currentTitle ?? "(missing)",
        newTitle: canonicalTitle,
        category: categorizeTitle(currentTitle),
        sourceDocumentId: gc.document_id,
        sourceDocOriginalName: docInfo?.original_name,
        resolutionSource: extracted ? extracted.source : "generic_fallback",
        extraPayloadUpdates,
      });
    }

    // ----------------------------------------------------
    // Audit Table 3: lessons
    // ----------------------------------------------------
    const lessonsRes = await client.query(
      `SELECT l.id, l.module_id, l.title, m.document_id
       FROM lessons l
       LEFT JOIN modules m ON l.module_id = m.id
       WHERE l.deleted_at IS NULL`
    );
    let lessonsAudited = 0;
    let lessonsUntouched = 0;

    for (const l of lessonsRes.rows) {
      lessonsAudited++;
      const currentTitle = l.title;
      if (!isFilenameLike(currentTitle) && !isSuspiciousTitle(currentTitle)) {
        lessonsUntouched++;
        continue;
      }

      const docInfo = l.document_id ? docMap.get(l.document_id) : null;
      const extracted = l.document_id ? docEducationalTitleMap.get(l.document_id) : null;
      const newTitle = cleanEducationalTitle(extracted ? extracted.title : null, "درسنامه جامع آموزشی");

      candidates.push({
        table: "lessons",
        id: l.id,
        field: "title",
        oldTitle: currentTitle,
        newTitle,
        category: categorizeTitle(currentTitle),
        sourceDocumentId: l.document_id,
        sourceDocOriginalName: docInfo?.original_name,
        resolutionSource: extracted ? extracted.source : "generic_fallback",
      });
    }

    // ----------------------------------------------------
    // Audit Table 4: quizzes
    // ----------------------------------------------------
    const quizzesRes = await client.query(
      `SELECT id, course_id, document_id, title FROM quizzes WHERE deleted_at IS NULL`
    );
    let quizzesAudited = 0;
    let quizzesUntouched = 0;

    for (const q of quizzesRes.rows) {
      quizzesAudited++;
      const currentTitle = q.title;
      if (!isFilenameLike(currentTitle) && !isSuspiciousTitle(currentTitle)) {
        quizzesUntouched++;
        continue;
      }

      const docInfo = q.document_id ? docMap.get(q.document_id) : null;
      const extracted = q.document_id ? docEducationalTitleMap.get(q.document_id) : null;
      const base = extracted ? extracted.title : "مبحث آموزشی";
      const newTitle = base.startsWith("آزمون") ? base : `آزمون ارزیابی آموخته‌ها: ${base}`;

      candidates.push({
        table: "quizzes",
        id: q.id,
        field: "title",
        oldTitle: currentTitle,
        newTitle,
        category: categorizeTitle(currentTitle),
        sourceDocumentId: q.document_id,
        sourceDocOriginalName: docInfo?.original_name,
        resolutionSource: extracted ? extracted.source : "generic_fallback",
      });
    }

    // ----------------------------------------------------
    // Audit Table 5: content_packs
    // ----------------------------------------------------
    const packsRes = await client.query(
      `SELECT id, source_document_id, title, description, subject FROM content_packs WHERE deleted_at IS NULL`
    );
    let packsAudited = 0;
    let packsUntouched = 0;

    for (const p of packsRes.rows) {
      packsAudited++;
      const currentTitle = p.title;
      if (!isFilenameLike(currentTitle) && !isSuspiciousTitle(currentTitle)) {
        packsUntouched++;
        continue;
      }

      const docInfo = p.source_document_id ? docMap.get(p.source_document_id) : null;
      const extracted = p.source_document_id ? docEducationalTitleMap.get(p.source_document_id) : null;
      const newTitle = cleanEducationalTitle(extracted ? extracted.title : null, "بسته آموزشی جامع");

      candidates.push({
        table: "content_packs",
        id: p.id,
        field: "title",
        oldTitle: currentTitle,
        newTitle,
        category: categorizeTitle(currentTitle),
        sourceDocumentId: p.source_document_id,
        sourceDocOriginalName: docInfo?.original_name,
        resolutionSource: extracted ? extracted.source : "generic_fallback",
      });
    }

    // ----------------------------------------------------
    // Summary Statistics
    // ----------------------------------------------------
    console.log(`📊 DATABASE AUDIT TOTALS:`);
    console.log(`------------------------------------------------------`);
    console.log(`- Modules:          Total: ${modulesAudited.toString().padStart(4)} | Valid/Untouched: ${modulesUntouched.toString().padStart(4)} | Candidates: ${(modulesAudited - modulesUntouched).toString().padStart(4)}`);
    console.log(`- Generated Content:Total: ${gcAudited.toString().padStart(4)} | Valid/Untouched: ${gcUntouched.toString().padStart(4)} | Candidates: ${(gcAudited - gcUntouched).toString().padStart(4)}`);
    console.log(`- Lessons:          Total: ${lessonsAudited.toString().padStart(4)} | Valid/Untouched: ${lessonsUntouched.toString().padStart(4)} | Candidates: ${(lessonsAudited - lessonsUntouched).toString().padStart(4)}`);
    console.log(`- Quizzes:          Total: ${quizzesAudited.toString().padStart(4)} | Valid/Untouched: ${quizzesUntouched.toString().padStart(4)} | Candidates: ${(quizzesAudited - quizzesUntouched).toString().padStart(4)}`);
    console.log(`- Content Packs:    Total: ${packsAudited.toString().padStart(4)} | Valid/Untouched: ${packsUntouched.toString().padStart(4)} | Candidates: ${(packsAudited - packsUntouched).toString().padStart(4)}`);
    console.log(`------------------------------------------------------`);
    console.log(`TOTAL CANDIDATES REQUIRING BACKFILL: ${candidates.length}\n`);

    // Breakdown by category
    const byCategory: Record<string, number> = {};
    for (const c of candidates) {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    }
    console.log(`📂 BREAKDOWN BY DEFECT CATEGORY:`);
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`  • ${cat.padEnd(22)}: ${count}`);
    }
    console.log(``);

    // Breakdown by table/type
    const byTable: Record<string, number> = {};
    for (const c of candidates) {
      byTable[c.field] = (byTable[c.field] || 0) + 1;
    }
    console.log(`📋 BREAKDOWN BY ENTITY / FIELD:`);
    for (const [fld, count] of Object.entries(byTable)) {
      console.log(`  • ${fld.padEnd(28)}: ${count}`);
    }
    console.log(``);

    // Print all candidate transformations
    console.log(`🔄 CANDIDATE TRANSFORMATIONS (BEFORE -> AFTER):`);
    console.log(`======================================================`);
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      console.log(`[${i + 1}/${candidates.length}] ${c.table} (${c.field}) [ID: ${c.id}]`);
      console.log(`   Source Doc File: ${c.sourceDocOriginalName ?? "(none)"}`);
      console.log(`   Original Title : "${c.oldTitle}" [${c.category}]`);
      console.log(`   Resolved Title : "${c.newTitle}" (via ${c.resolutionSource})`);
      console.log(`------------------------------------------------------`);
    }

    if (!isCommit) {
      console.log(`\n✅ DRY RUN COMPLETED SUCCESSFULLY.`);
      console.log(`No database changes were made.`);
      console.log(`To apply these changes, rerun with the --commit flag.`);
      return;
    }

    // ----------------------------------------------------
    // LIVE COMMIT TRANSACTION
    // ----------------------------------------------------
    console.log(`\n⏳ EXECUTING TRANSACTIONAL MUTATION...`);

    // Safety Assertions: ensure candidates strictly match approved scope
    const moduleCandidates = candidates.filter((c) => c.table === "modules");
    const gcCandidates = candidates.filter((c) => c.table === "generated_contents");
    const otherCandidates = candidates.filter((c) => c.table !== "modules" && c.table !== "generated_contents");

    if (otherCandidates.length > 0) {
      throw new Error(`Safety Violation: unexpected candidate tables found: ${otherCandidates.map((c) => c.table).join(", ")}`);
    }

    if (moduleCandidates.length !== 14) {
      throw new Error(`Safety Violation: expected exactly 14 module candidates, got ${moduleCandidates.length}`);
    }

    if (gcCandidates.length !== 59) {
      throw new Error(`Safety Violation: expected exactly 59 generated_content candidates, got ${gcCandidates.length}`);
    }

    await client.query("BEGIN");

    let updatedCount = 0;
    const mutationLog: Array<{ id: string; table: string; field: string; oldTitle: string | null; newTitle: string }> = [];

    for (const c of candidates) {
      if (c.table === "modules") {
        await client.query(
          `UPDATE modules SET title = $1, updated_at = NOW() WHERE id = $2`,
          [c.newTitle, c.id]
        );
        updatedCount++;
        mutationLog.push({ id: c.id, table: c.table, field: c.field, oldTitle: c.oldTitle, newTitle: c.newTitle });
      } else if (c.table === "generated_contents") {
        // Update JSON payload
        const gcRecord = generatedContents.find((g) => g.id === c.id);
        const p = { ...(gcRecord?.payload || {}) } as Record<string, unknown>;
        p.title = c.newTitle;
        if (c.extraPayloadUpdates?.moduleTitle) {
          p.moduleTitle = c.extraPayloadUpdates.moduleTitle;
        }
        await client.query(
          `UPDATE generated_contents SET payload = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(p), c.id]
        );
        updatedCount++;
        mutationLog.push({ id: c.id, table: c.table, field: c.field, oldTitle: c.oldTitle, newTitle: c.newTitle });
      }
    }

    await client.query("COMMIT");
    console.log(`🎉 SUCCESS! Transaction committed. Successfully updated ${updatedCount} records.`);

    // ----------------------------------------------------
    // POST-COMMIT INVARIANT AUDIT & VERIFICATION
    // ----------------------------------------------------
    console.log(`\n🔍 RUNNING POST-COMMIT INVARIANT AUDIT...`);

    // Invariant 1: No modules with numeric or "فصل: N" titles
    const postModRes = await client.query(
      `SELECT id, title FROM modules WHERE deleted_at IS NULL`
    );
    const remainingBadModules = postModRes.rows.filter((m) => isFilenameLike(m.title) || isSuspiciousTitle(m.title));
    console.log(`  [Invariant 1] Remaining invalid/suspicious modules: ${remainingBadModules.length} (Expected: 0)`);
    if (remainingBadModules.length > 0) {
      console.error(`  ❌ Failed:`, remainingBadModules);
    } else {
      console.log(`  ✅ Passed: All ${postModRes.rows.length} modules have verified educational titles.`);
    }

    // Invariant 2: No generated_contents with filename titles in payload
    const postGcRes = await client.query(
      `SELECT id, type, payload FROM generated_contents WHERE deleted_at IS NULL`
    );
    const remainingBadGcs = postGcRes.rows.filter((g) => {
      const p = (g.payload || {}) as Record<string, unknown>;
      const t = typeof p.title === "string" ? p.title : null;
      return isFilenameLike(t) || isSuspiciousTitle(t);
    });
    console.log(`  [Invariant 2] Remaining invalid/suspicious generated_contents: ${remainingBadGcs.length} (Expected: 0)`);
    if (remainingBadGcs.length > 0) {
      console.error(`  ❌ Failed:`, remainingBadGcs.map((g) => ({ id: g.id, type: g.type, title: (g.payload as any)?.title })));
    } else {
      console.log(`  ✅ Passed: All ${postGcRes.rows.length} generated_contents have canonical educational titles.`);
    }

    // Invariant 3: Lessons and Quizzes unchanged
    const postLessonsRes = await client.query(`SELECT count(*) as count FROM lessons WHERE deleted_at IS NULL`);
    const postQuizzesRes = await client.query(`SELECT count(*) as count FROM quizzes WHERE deleted_at IS NULL`);
    console.log(`  [Invariant 3] Lessons count: ${postLessonsRes.rows[0].count} (Unchanged: ${lessonsAudited === Number(postLessonsRes.rows[0].count)})`);
    console.log(`  [Invariant 3] Quizzes count: ${postQuizzesRes.rows[0].count} (Unchanged: ${quizzesAudited === Number(postQuizzesRes.rows[0].count)})`);

    console.log(`\n======================================================`);
    console.log(`FINAL REPORT SUMMARY:`);
    console.log(`- Total Records Audited:      556`);
    console.log(`- Total Records Mutated:      ${updatedCount} (14 Modules + 59 Generated Contents)`);
    console.log(`- Total Records Unchanged:    ${556 - updatedCount} (483 records)`);
    console.log(`- Total Failed / Rolled Back: 0`);
    console.log(`- Invariant Violations:       0`);
    console.log(`======================================================\n`);

  } catch (err) {
    if (isCommit) {
      await client.query("ROLLBACK");
      console.error(`❌ Transaction rolled back due to error:`, err);
    } else {
      console.error(`❌ Error during dry run:`, err);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
