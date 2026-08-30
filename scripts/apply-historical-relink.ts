import pg from "pg";

/**
 * AVANA Historical Courses Restoration & Evidence-Based Relinking Engine
 *
 * Transaction-safe, strictly validated apply script.
 * Restores 7 historical courses with original UUIDs and relinks verified documents.
 */

interface CourseMetadata {
  id: string;
  name: string;
  subject: string;
  organizationId: string;
  createdAt: string;
}

const HISTORICAL_COURSES: CourseMetadata[] = [
  {
    id: "08801321-efe0-47e1-bf85-52d958e52680",
    name: "فارماکولوژی ۱",
    subject: "فارماکولوژی",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    createdAt: "2026-08-16T21:46:15.729Z",
  },
  {
    id: "bb804c1c-d6f5-46ee-9fe5-b78006957cab",
    name: "فارماکولوژی ۲",
    subject: "فارماکولوژی",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    createdAt: "2026-08-16T21:46:15.739Z",
  },
  {
    id: "5b0f6697-5964-44f8-b404-d306ad592ea0",
    name: "فارماکولوژی ۳",
    subject: "فارماکولوژی",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    createdAt: "2026-08-16T21:46:15.741Z",
  },
  {
    id: "18fc9969-038e-4c68-874b-5369b9da301a",
    name: "دارودرمانی ۱",
    subject: "دارودرمانی",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    createdAt: "2026-08-16T21:46:15.742Z",
  },
  {
    id: "95713085-dc4f-4f7d-8f69-b2774eb71d2b",
    name: "دارودرمانی ۲",
    subject: "دارودرمانی",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    createdAt: "2026-08-16T21:46:15.743Z",
  },
  {
    id: "073f2ceb-0a91-4325-acbf-a66d0f4fe284",
    name: "دارودرمانی ۳",
    subject: "دارودرمانی",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    createdAt: "2026-08-16T21:46:15.744Z",
  },
  {
    id: "ac92b339-2501-48cf-ad62-24c257be77d4",
    name: "دارودرمانی ۴",
    subject: "دارودرمانی",
    organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
    createdAt: "2026-08-16T21:46:15.745Z",
  },
];

// 30 Verified Documents for Relinking based on Audit Log Evidence
const DOCUMENT_RELINKS: Array<{ id: string; targetCourseId: string; expectedName: string }> = [
  // دارودرمانی ۱ (22 documents)
  { id: "bc486307-8ddd-4ada-aae6-1c9fd6b2682f", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "bc486307-8ddd-4ada-aae6-1c9fd6b2682f.docx" },
  { id: "c6f77659-6faa-4378-a663-c0873be9cce4", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "c6f77659-6faa-4378-a663-c0873be9cce4.docx" },
  { id: "cc821dbf-75c1-4a6d-9e14-9bdec3aff1ed", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "cc821dbf-75c1-4a6d-9e14-9bdec3aff1ed.pdf" },
  { id: "d3e5c045-133b-4e01-8a80-efd618293298", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "d3e5c045-133b-4e01-8a80-efd618293298.pdf" },
  { id: "d454eaf8-2a05-456f-842a-422e78174660", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "d454eaf8-2a05-456f-842a-422e78174660.pdf" },
  { id: "da7ce831-3de7-4952-932b-867ad4788a2a", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "da7ce831-3de7-4952-932b-867ad4788a2a.pdf" },
  { id: "dfc18433-1fe0-4ea5-b1f8-16aca47794c1", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "dfc18433-1fe0-4ea5-b1f8-16aca47794c1.pdf" },
  { id: "0094ca46-9715-4b41-8536-7858b5c1e3a5", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "0094ca46-9715-4b41-8536-7858b5c1e3a5.docx" },
  { id: "023e06de-8663-4889-8070-7cad8b8ad290", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "023e06de-8663-4889-8070-7cad8b8ad290.pdf" },
  { id: "0775c405-7e2c-45cf-ba7b-40e51480c268", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "0775c405-7e2c-45cf-ba7b-40e51480c268.pdf" },
  { id: "124d2a46-46db-4a82-9d61-98ac18e9a309", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "124d2a46-46db-4a82-9d61-98ac18e9a309.pdf" },
  { id: "25fb8514-4313-4f10-98ed-29734d83a9ab", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "25fb8514-4313-4f10-98ed-29734d83a9ab.pdf" },
  { id: "47bbacc5-3663-48b6-961f-0f075f37009f", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "47bbacc5-3663-48b6-961f-0f075f37009f.pptx" },
  { id: "54387870-c772-410a-86ca-6c251a8c2016", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "54387870-c772-410a-86ca-6c251a8c2016.pdf" },
  { id: "57ac3c89-8d8f-4e33-9ba2-0c8d36090a99", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "57ac3c89-8d8f-4e33-9ba2-0c8d36090a99.pdf" },
  { id: "65a3e644-ec7a-4265-84cc-216c6001d63a", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "65a3e644-ec7a-4265-84cc-216c6001d63a.pdf" },
  { id: "65e6bcd9-b196-4112-92e4-a235914b69b7", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "65e6bcd9-b196-4112-92e4-a235914b69b7.pdf" },
  { id: "708b6ee0-1cb3-465c-97f6-87cf4e542092", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "708b6ee0-1cb3-465c-97f6-87cf4e542092.pdf" },
  { id: "752f15ce-68e4-4c56-9c0b-c3fb020a0ab1", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "752f15ce-68e4-4c56-9c0b-c3fb020a0ab1.pdf" },
  { id: "9a8340f7-56b4-4bf9-a80a-9b14d4f48285", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "9a8340f7-56b4-4bf9-a80a-9b14d4f48285.pdf" },
  { id: "a52baa06-cd9a-46ab-bd92-ae659adedfc6", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "a52baa06-cd9a-46ab-bd92-ae659adedfc6.pdf" },
  { id: "b67d6742-399e-413e-96a6-2f50d67ab9a9", targetCourseId: "18fc9969-038e-4c68-874b-5369b9da301a", expectedName: "b67d6742-399e-413e-96a6-2f50d67ab9a9.pptx" },

  // فارماکولوژی ۲ (1 document)
  { id: "c729017a-f2ea-4b1a-978c-ef3e8962313c", targetCourseId: "bb804c1c-d6f5-46ee-9fe5-b78006957cab", expectedName: "c729017a-f2ea-4b1a-978c-ef3e8962313c.pdf" },

  // فارماکولوژی ۳ (2 documents)
  { id: "6a577dc4-3689-4df9-b531-f8597d125b87", targetCourseId: "5b0f6697-5964-44f8-b404-d306ad592ea0", expectedName: "6a577dc4-3689-4df9-b531-f8597d125b87.pdf" },
  { id: "5c674d2a-d9ed-4e4d-9902-d01ec097f25b", targetCourseId: "5b0f6697-5964-44f8-b404-d306ad592ea0", expectedName: "5c674d2a-d9ed-4e4d-9902-d01ec097f25b.pdf" },

  // فارماکولوژی ۱ (5 documents)
  { id: "075a1514-8f11-40c9-8dfa-8753ff66a8b2", targetCourseId: "08801321-efe0-47e1-bf85-52d958e52680", expectedName: "075a1514-8f11-40c9-8dfa-8753ff66a8b2.pptx" },
  { id: "1d36a907-4e4d-4c05-9e0f-4f41379d9241", targetCourseId: "08801321-efe0-47e1-bf85-52d958e52680", expectedName: "1d36a907-4e4d-4c05-9e0f-4f41379d9241.pdf" },
  { id: "5adf5696-49ec-4e6a-b033-7c838daf766e", targetCourseId: "08801321-efe0-47e1-bf85-52d958e52680", expectedName: "5adf5696-49ec-4e6a-b033-7c838daf766e.pdf" },
  { id: "93b886c0-df77-4322-908e-8fab6ee85dfb", targetCourseId: "08801321-efe0-47e1-bf85-52d958e52680", expectedName: "93b886c0-df77-4322-908e-8fab6ee85dfb.pdf" },
  { id: "f9f18e1b-7889-499f-8fd3-ef49bc4cf439", targetCourseId: "08801321-efe0-47e1-bf85-52d958e52680", expectedName: "f9f18e1b-7889-499f-8fd3-ef49bc4cf439.txt" },
];

async function main() {
  console.log("==========================================================================");
  console.log("   AVANA HISTORICAL COURSES RESTORATION & ATOMIC RELINK ENGINE            ");
  console.log("==========================================================================");

  const connectionString =
    process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // -----------------------------------------------------------------------
    // Step 1: Pre-Change Counts Snapshot
    // -----------------------------------------------------------------------
    console.log("\n[1/5] Recording Pre-Mutation Baseline State...");
    const beforeCounts = {
      courses: (await client.query("SELECT count(*)::int as c FROM courses WHERE deleted_at IS NULL")).rows[0].c,
      documents: (await client.query("SELECT count(*)::int as c FROM documents WHERE deleted_at IS NULL")).rows[0].c,
      modules: (await client.query("SELECT count(*)::int as c FROM modules WHERE deleted_at IS NULL")).rows[0].c,
      lessons: (await client.query("SELECT count(*)::int as c FROM lessons WHERE deleted_at IS NULL")).rows[0].c,
      flashcards: (await client.query("SELECT count(*)::int as c FROM flashcards WHERE deleted_at IS NULL")).rows[0].c,
      quizzes: (await client.query("SELECT count(*)::int as c FROM quizzes WHERE deleted_at IS NULL")).rows[0].c,
      quiz_questions: (await client.query("SELECT count(*)::int as c FROM quiz_questions")).rows[0].c,
      content_packs: (await client.query("SELECT count(*)::int as c FROM content_packs WHERE deleted_at IS NULL")).rows[0].c,
    };

    console.table(beforeCounts);

    // -----------------------------------------------------------------------
    // Step 2: BEGIN TRANSACTION
    // -----------------------------------------------------------------------
    console.log("\n[2/5] Beginning PostgreSQL Transaction...");
    await client.query("BEGIN");

    let coursesInserted = 0;
    let documentsUpdated = 0;
    let modulesUpdated = 0;
    let flashcardsUpdated = 0;
    let quizzesUpdated = 0;

    try {
      // Step A: Insert 7 Historical Courses
      console.log("\n--- [Step A] Inserting 7 Historical Courses (with original UUIDs) ---");
      const now = new Date().toISOString();

      for (const c of HISTORICAL_COURSES) {
        const insRes = await client.query(
          `INSERT INTO courses (id, organization_id, name, subject, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, NULL)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [c.id, c.organizationId, c.name, c.subject, c.createdAt, now]
        );
        if (insRes.rows.length > 0) {
          coursesInserted++;
          console.log(`✓ Inserted Course: "${c.name}" [${c.id}]`);
        } else {
          console.log(`- Course already exists: "${c.name}" [${c.id}]`);
        }
      }

      // Step B: Validate & Relink 30 Documents
      console.log("\n--- [Step B] Validating & Relinking 30 Documents to Historical Courses ---");
      for (const d of DOCUMENT_RELINKS) {
        const docRes = await client.query(
          "SELECT id, original_name, course_id, sha256 FROM documents WHERE id = $1 AND deleted_at IS NULL",
          [d.id]
        );

        if (docRes.rows.length === 0) {
          throw new Error(`Document verification failed: Document ${d.id} not found in database.`);
        }

        const docRecord = docRes.rows[0];
        if (docRecord.original_name !== d.expectedName) {
          throw new Error(
            `Document name mismatch for ${d.id}: Expected "${d.expectedName}", got "${docRecord.original_name}".`
          );
        }

        const updateRes = await client.query(
          "UPDATE documents SET course_id = $1, updated_at = $2 WHERE id = $3 RETURNING id",
          [d.targetCourseId, now, d.id]
        );

        if (updateRes.rows.length > 0) {
          documentsUpdated++;
        }
      }
      console.log(`✓ Successfully relinked ${documentsUpdated} documents with verified metadata.`);

      // Step C: Relink Associated Modules & Quizzes
      console.log("\n--- [Step C] Relinking Associated Modules and Quizzes ---");
      const relinkedDocIds = DOCUMENT_RELINKS.map((d) => d.id);

      // Relink modules referencing these documents
      const modRes = await client.query(
        `UPDATE modules m
         SET course_id = d.course_id, updated_at = $1
         FROM documents d
         WHERE m.document_id = d.id AND d.id = ANY($2::uuid[])
         RETURNING m.id`,
        [now, relinkedDocIds]
      );
      modulesUpdated = modRes.rows.length;

      // Relink quizzes referencing these documents
      const qzRes = await client.query(
        `UPDATE quizzes q
         SET course_id = d.course_id, updated_at = $1
         FROM documents d
         WHERE q.document_id = d.id AND d.id = ANY($2::uuid[])
         RETURNING q.id`,
        [now, relinkedDocIds]
      );
      quizzesUpdated = qzRes.rows.length;

      console.log(`✓ Relinked ${modulesUpdated} modules and ${quizzesUpdated} quizzes directly tied to relinked documents.`);

      // -----------------------------------------------------------------------
      // Step 3: Comprehensive Post-Mutation Validation
      // -----------------------------------------------------------------------
      console.log("\n[3/5] Running Mandatory Integrity & Constraint Validations...");

      // 1. Verify all 7 historical courses exist in DB
      for (const c of HISTORICAL_COURSES) {
        const checkC = await client.query("SELECT id, name FROM courses WHERE id = $1 AND deleted_at IS NULL", [c.id]);
        if (checkC.rows.length === 0) {
          throw new Error(`Validation Error: Historical Course ${c.name} (${c.id}) is missing after insert.`);
        }
      }

      // 2. Verify document counts per historical course
      const docCounts = {
        daroodarmani1: (await client.query("SELECT count(*)::int as c FROM documents WHERE course_id = '18fc9969-038e-4c68-874b-5369b9da301a' AND deleted_at IS NULL")).rows[0].c,
        pharm1: (await client.query("SELECT count(*)::int as c FROM documents WHERE course_id = '08801321-efe0-47e1-bf85-52d958e52680' AND deleted_at IS NULL")).rows[0].c,
        pharm2: (await client.query("SELECT count(*)::int as c FROM documents WHERE course_id = 'bb804c1c-d6f5-46ee-9fe5-b78006957cab' AND deleted_at IS NULL")).rows[0].c,
        pharm3: (await client.query("SELECT count(*)::int as c FROM documents WHERE course_id = '5b0f6697-5964-44f8-b404-d306ad592ea0' AND deleted_at IS NULL")).rows[0].c,
      };

      console.log("Validated Document Counts in Historical Courses:", docCounts);
      if (docCounts.daroodarmani1 !== 22 || docCounts.pharm1 !== 5 || docCounts.pharm2 !== 1 || docCounts.pharm3 !== 2) {
        throw new Error(`Validation Error: Document distribution mismatch in historical courses: ${JSON.stringify(docCounts)}`);
      }

      // 3. Verify Foreign Key Referential Integrity (Zero Orphans)
      const orphanModules = (await client.query("SELECT count(*)::int as c FROM modules m LEFT JOIN courses c ON m.course_id = c.id WHERE c.id IS NULL")).rows[0].c;
      const orphanLessons = (await client.query("SELECT count(*)::int as c FROM lessons l LEFT JOIN modules m ON l.module_id = m.id WHERE m.id IS NULL")).rows[0].c;
      const orphanFlashcards = (await client.query("SELECT count(*)::int as c FROM flashcards f LEFT JOIN courses c ON f.course_id = c.id WHERE c.id IS NULL")).rows[0].c;
      const orphanQuizzes = (await client.query("SELECT count(*)::int as c FROM quizzes q LEFT JOIN courses c ON q.course_id = c.id WHERE c.id IS NULL")).rows[0].c;
      const orphanQuestions = (await client.query("SELECT count(*)::int as c FROM quiz_questions qq LEFT JOIN quizzes q ON qq.quiz_id = q.id WHERE q.id IS NULL")).rows[0].c;
      const orphanDocs = (await client.query("SELECT count(*)::int as c FROM documents d LEFT JOIN courses c ON d.course_id = c.id WHERE d.course_id IS NOT NULL AND c.id IS NULL")).rows[0].c;

      if (orphanModules > 0 || orphanLessons > 0 || orphanFlashcards > 0 || orphanQuizzes > 0 || orphanQuestions > 0 || orphanDocs > 0) {
        throw new Error(`Validation Error: Broken foreign keys detected!`);
      }

      // 4. Verify Content Packs remain untouched
      const postPacksCount = (await client.query("SELECT count(*)::int as c FROM content_packs WHERE deleted_at IS NULL")).rows[0].c;
      if (postPacksCount !== beforeCounts.content_packs) {
        throw new Error(`Validation Error: Content packs count changed from ${beforeCounts.content_packs} to ${postPacksCount}.`);
      }

      // -----------------------------------------------------------------------
      // Step 4: COMMIT
      // -----------------------------------------------------------------------
      await client.query("COMMIT");
      console.log("\n==========================================================================");
      console.log("            ✓ TRANSACTION COMMITTED SUCCESSFULLY                          ");
      console.log("==========================================================================");
    } catch (txErr) {
      await client.query("ROLLBACK");
      console.error("\n[TRANSACTION ROLLED BACK DUE TO ERROR]:", (txErr as Error).message);
      console.log("\nRESULT: HISTORICAL_RESTORE_ROLLED_BACK");
      throw txErr;
    }

    // -----------------------------------------------------------------------
    // Step 5: Final Post-Mutation Audit & Tables
    // -----------------------------------------------------------------------
    console.log("\n[4/5] Generating After-Mutation Audit Tables...\n");

    const afterCounts = {
      courses: (await client.query("SELECT count(*)::int as c FROM courses WHERE deleted_at IS NULL")).rows[0].c,
      documents: (await client.query("SELECT count(*)::int as c FROM documents WHERE deleted_at IS NULL")).rows[0].c,
      modules: (await client.query("SELECT count(*)::int as c FROM modules WHERE deleted_at IS NULL")).rows[0].c,
      lessons: (await client.query("SELECT count(*)::int as c FROM lessons WHERE deleted_at IS NULL")).rows[0].c,
      flashcards: (await client.query("SELECT count(*)::int as c FROM flashcards WHERE deleted_at IS NULL")).rows[0].c,
      quizzes: (await client.query("SELECT count(*)::int as c FROM quizzes WHERE deleted_at IS NULL")).rows[0].c,
      quiz_questions: (await client.query("SELECT count(*)::int as c FROM quiz_questions")).rows[0].c,
      content_packs: (await client.query("SELECT count(*)::int as c FROM content_packs WHERE deleted_at IS NULL")).rows[0].c,
    };

    const deltaTable = [
      { table: "courses", before: beforeCounts.courses, after: afterCounts.courses, inserted: coursesInserted, updated: 0, deleted: 0 },
      { table: "documents", before: beforeCounts.documents, after: afterCounts.documents, inserted: 0, updated: documentsUpdated, deleted: 0 },
      { table: "modules", before: beforeCounts.modules, after: afterCounts.modules, inserted: 0, updated: modulesUpdated, deleted: 0 },
      { table: "lessons", before: beforeCounts.lessons, after: afterCounts.lessons, inserted: 0, updated: 0, deleted: 0 },
      { table: "flashcards", before: beforeCounts.flashcards, after: afterCounts.flashcards, inserted: 0, updated: flashcardsUpdated, deleted: 0 },
      { table: "quizzes", before: beforeCounts.quizzes, after: afterCounts.quizzes, inserted: 0, updated: quizzesUpdated, deleted: 0 },
      { table: "quiz_questions", before: beforeCounts.quiz_questions, after: afterCounts.quiz_questions, inserted: 0, updated: 0, deleted: 0 },
      { table: "content_packs", before: beforeCounts.content_packs, after: afterCounts.content_packs, inserted: 0, updated: 0, deleted: 0 },
    ];
    console.table(deltaTable);

    console.log("\n[5/5] Content Breakdown by Historical & Key Canonical Courses:\n");
    const coursesAuditQuery = await client.query(`
      SELECT 
        c.name as course,
        (SELECT count(*)::int FROM documents d WHERE d.course_id = c.id AND d.deleted_at IS NULL) as documents,
        (SELECT count(*)::int FROM modules m WHERE m.course_id = c.id AND m.deleted_at IS NULL) as modules,
        (SELECT count(*)::int FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = c.id AND l.deleted_at IS NULL) as lessons,
        (SELECT count(*)::int FROM flashcards f WHERE f.course_id = c.id AND f.deleted_at IS NULL) as flashcards,
        (SELECT count(*)::int FROM quizzes q WHERE q.course_id = c.id AND q.deleted_at IS NULL) as quizzes,
        (SELECT count(*)::int FROM quiz_questions qq JOIN quizzes q ON qq.quiz_id = q.id WHERE q.course_id = c.id) as questions
      FROM courses c
      WHERE c.organization_id = 'b4a0b464-16db-4087-92b7-163a1e6f6776' AND c.deleted_at IS NULL
      ORDER BY c.name ASC
    `);
    console.table(coursesAuditQuery.rows);

    console.log("\n==========================================================================");
    console.log("RESULT: HISTORICAL_RESTORE_SUCCESS");
    console.log("==========================================================================\n");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Apply execution terminated:", err);
  process.exit(1);
});
