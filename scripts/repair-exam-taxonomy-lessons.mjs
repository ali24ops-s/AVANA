#!/usr/bin/env node
/**
 * Repair Script: Exam Questions Lesson ID, Module Titles, and Question Topics Repair
 *
 * Requirements:
 * 1. Inspects and maps quiz_questions to their correct lesson_id in DB.
 * 2. Upgrades raw filename module titles (e.g. "فصل: 39", "فصل: 40") to extracted AI titles.
 * 3. Backfills and cleans quiz_questions.topic & quizzes.topic with clean lesson/module titles.
 * 4. Audits before and after.
 * 5. Transaction-safe database update.
 */

import pg from "pg";

const connectionString =
  process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana";

async function repairExamTaxonomy() {
  console.log("==========================================================================");
  console.log("[AVANA Repair Engine: Exam Questions, Module Titles & Topics]");
  console.log("==========================================================================");

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");

    // 1. Module Title Upgrades
    console.log("\n[1/3 Upgrading Module Titles from Raw Filenames to Extracted AI Topics]");
    
    // Explicit known educational topic titles for key modules
    await client.query(`
      UPDATE modules 
      SET title = 'فصل: هورمون‌های قشر غده فوق کلیوی و آدرنال (Adrenocortical Hormones)'
      WHERE course_id = 'bb804c1c-d6f5-46ee-9fe5-b78006957cab' AND (title = 'فصل: 39' OR title = '39')
    `);

    await client.query(`
      UPDATE modules 
      SET title = 'فصل: هورمون‌های جنسی و مهارکننده‌ها (Gonadal Hormones & Inhibitors)'
      WHERE course_id = '5b0f6697-5964-44f8-b404-d306ad592ea0' AND (title = 'فصل: 40' OR title = '40')
    `);

    // Upgrade titles for other modules if generated_content payload contains clean titles
    const modulesWithGenRes = await client.query(`
      SELECT DISTINCT m.id as module_id, m.title as current_title, gc.payload
      FROM modules m
      JOIN generated_contents gc ON gc.document_id = m.document_id
      WHERE gc.deleted_at IS NULL AND m.deleted_at IS NULL
    `);

    for (const mRow of modulesWithGenRes.rows) {
      const p = mRow.payload || {};
      const extTitle = p.moduleTitle || p.topic || (p.title ? p.title.replace(/^آزمون (ارزیابی آموخته‌ها: |ارزیابی: |)/, "").trim() : null);
      
      const isFilename = /^فصل:\s*(\d+|\w+\.(pdf|docx|pptx|txt))$/i.test(mRow.current_title) || /^\d+$/.test(mRow.current_title);
      if (isFilename && extTitle && !extTitle.includes("undefined")) {
        const newTitle = extTitle.startsWith("فصل:") ? extTitle : `فصل: ${extTitle}`;
        await client.query("UPDATE modules SET title = $1 WHERE id = $2", [newTitle, mRow.module_id]);
        console.log(`Updated Module ${mRow.module_id}: "${mRow.current_title}" -> "${newTitle}"`);
      }
    }

    // 2. Audit before question repair
    const beforeRes = await client.query(`
      SELECT 
        q.course_id, 
        c.name as course_name,
        COUNT(qq.id) as total_questions,
        COUNT(qq.lesson_id) as mapped_questions,
        COUNT(CASE WHEN qq.lesson_id IS NULL THEN 1 END) as null_questions
      FROM quizzes q
      JOIN quiz_questions qq ON qq.quiz_id = q.id
      JOIN courses c ON q.course_id = c.id
      WHERE q.deleted_at IS NULL
      GROUP BY q.course_id, c.name
      ORDER BY c.name ASC
    `);

    console.log("\n[Audit Before Question Repair]");
    console.table(beforeRes.rows);

    // Fetch all active quizzes
    const quizzesRes = await client.query(`
      SELECT q.id as quiz_id, q.course_id, q.document_id, c.name as course_name
      FROM quizzes q
      JOIN courses c ON q.course_id = c.id
      WHERE q.deleted_at IS NULL
    `);

    let totalUpdated = 0;

    for (const quiz of quizzesRes.rows) {
      const { quiz_id, course_id, course_name } = quiz;

      // Fetch lessons for this course
      const lessonsRes = await client.query(`
        SELECT l.id, l.title, l.sort_order
        FROM lessons l
        JOIN modules m ON l.module_id = m.id
        WHERE m.course_id = $1 AND l.deleted_at IS NULL
        ORDER BY l.sort_order ASC
      `, [course_id]);

      const lessons = lessonsRes.rows;
      if (lessons.length === 0) continue;

      // Fetch questions for this quiz
      const questionsRes = await client.query(`
        SELECT qq.id, qq.generated_content_id, qq.sort_order, qq.question, qq.lesson_id, qq.topic
        FROM quiz_questions qq
        WHERE qq.quiz_id = $1
        ORDER BY qq.sort_order ASC, qq.created_at ASC
      `, [quiz_id]);

      const questions = questionsRes.rows;
      if (questions.length === 0) continue;

      // Get generated_contents payload if available
      const genId = questions[0]?.generated_content_id;
      let payloadQuestions = [];
      if (genId) {
        const gcRes = await client.query("SELECT payload FROM generated_contents WHERE id = $1", [genId]);
        payloadQuestions = gcRes.rows[0]?.payload?.questions || [];
      }

      for (let i = 0; i < questions.length; i++) {
        const qq = questions[i];
        const pQ = payloadQuestions[i] || {};
        let targetLessonId = null;

        // Strategy 1: sessionIndex in payload
        const s = pQ.sessionIndex;
        if (typeof s === "number" && !isNaN(s)) {
          const match = lessons.find(l => l.sort_order === s || l.sort_order === s - 1);
          if (match) {
            targetLessonId = match.id;
          }
        }

        // Strategy 2: Sequential block distribution
        if (!targetLessonId && lessons.length > 0) {
          const blockIdx = Math.min(
            lessons.length - 1,
            Math.floor((i / questions.length) * lessons.length)
          );
          targetLessonId = lessons[blockIdx]?.id;
        }

        if (targetLessonId && qq.lesson_id !== targetLessonId) {
          await client.query("UPDATE quiz_questions SET lesson_id = $1 WHERE id = $2", [
            targetLessonId,
            qq.id,
          ]);
          totalUpdated++;
        }
      }
    }

    console.log(`\nTotal quiz_questions updated with lesson_id: ${totalUpdated}`);

    // 3. Question & Quiz Topic Cleaning & Backfill
    console.log("\n[3/3 Backfilling and Cleaning Question Topics from Raw Filenames]");
    
    // Update quiz_questions.topic with the mapped lesson title or module title if topic is a raw filename number
    await client.query(`
      UPDATE quiz_questions qq
      SET topic = l.title
      FROM lessons l
      WHERE qq.lesson_id = l.id
        AND (qq.topic IS NULL OR qq.topic ~ '^\\d+$' OR qq.topic ~ '^فصل:\\s*\\d+$' OR qq.topic ~ '\\.(pdf|docx|pptx|txt)$')
    `);

    // Update remaining quiz_questions.topic with module title if lesson title is not set
    await client.query(`
      UPDATE quiz_questions qq
      SET topic = m.title
      FROM lessons l
      JOIN modules m ON l.module_id = m.id
      WHERE qq.lesson_id = l.id
        AND (qq.topic IS NULL OR qq.topic ~ '^\\d+$' OR qq.topic ~ '^فصل:\\s*\\d+$' OR qq.topic ~ '\\.(pdf|docx|pptx|txt)$')
    `);

    // Update quizzes.topic if it contains raw filename numbers
    await client.query(`
      UPDATE quizzes q
      SET topic = m.title
      FROM modules m
      WHERE q.course_id = m.course_id
        AND (q.topic IS NULL OR q.topic ~ '^\\d+$' OR q.topic ~ '^فصل:\\s*\\d+$' OR q.topic ~ '\\.(pdf|docx|pptx|txt)$')
    `);

    await client.query("COMMIT");

    // Audit after
    const afterRes = await client.query(`
      SELECT 
        c.name as course_name,
        m.title as module_title,
        COUNT(qq.id) as total_questions,
        COUNT(qq.lesson_id) as mapped_questions,
        COUNT(DISTINCT qq.topic) as distinct_topics_sample
      FROM quizzes q
      JOIN quiz_questions qq ON qq.quiz_id = q.id
      JOIN lessons l ON qq.lesson_id = l.id
      JOIN modules m ON l.module_id = m.id
      JOIN courses c ON m.course_id = c.id
      WHERE q.deleted_at IS NULL
      GROUP BY c.name, m.title
      ORDER BY c.name ASC
    `);

    console.log("\n[Audit After Repair - Module Titles, Questions & Topics]");
    console.table(afterRes.rows);

    console.log("\nREPAIR COMPLETED SUCCESSFULLY!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error during repair, transaction rolled back:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

repairExamTaxonomy().catch(console.error);
