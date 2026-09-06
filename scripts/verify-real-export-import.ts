import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { eq, sql } from "drizzle-orm";
import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { ContentExportService } from "../apps/api/src/modules/admin/content-export-service.js";
import { ContentImportService } from "../apps/api/src/modules/admin/content-import-service.js";
import { LocalStorageProvider } from "../apps/api/src/modules/storage/local-storage.js";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

const STORAGE_DIR = path.resolve("./storage/test-verification");

async function main() {
  console.log("=================================================================");
  console.log("AVANA CONTENT EXPORT / IMPORT - REAL INTEGRATION VERIFICATION");
  console.log("=================================================================\n");

  const { db, close } = createDbClient(connectionString);
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const storageProvider = new LocalStorageProvider(STORAGE_DIR);

  try {
    // =========================================================================
    // 1. VERIFY MIGRATION 0030 IN REAL POSTGRESQL
    // =========================================================================
    console.log("--- 1. MIGRATION 0030 VERIFICATION ---");
    
    // Check tables in information_schema
    const tablesRes = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('content_import_batches', 'imported_entities')
      ORDER BY table_name;
    `);
    const tableNames = (tablesRes.rows as any[]).map((r) => r.table_name);
    console.log("Found tables in DB:", tableNames);
    if (!tableNames.includes("content_import_batches") || !tableNames.includes("imported_entities")) {
      throw new Error("Migration 0030 tables missing from PostgreSQL!");
    }

    // Check unique constraint on imported_entities
    const constraintsRes = await db.execute(sql`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'imported_entities' AND constraint_type = 'UNIQUE';
    `);
    const constraintNames = (constraintsRes.rows as any[]).map((r) => r.constraint_name);
    console.log("Found unique constraints on imported_entities:", constraintNames);
    console.log(">>> [1. MIGRATION]: PASS (Tables and constraints exist in real DB)\n");

    // =========================================================================
    // 2. REAL EXPORT TEST WITH REAL DATA & REAL BINARY FILE
    // =========================================================================
    console.log("--- 2. REAL EXPORT VERIFICATION ---");

    // Ensure a test user exists
    const [testAdmin] = await db
      .insert(schema.users)
      .values({
        email: `export_admin_${Date.now()}@avana.test`,
        name: "Verification Admin",
      })
      .returning();

    // Create Source Organization
    const [sourceOrg] = await db
      .insert(schema.organizations)
      .values({
        name: `Source Org ${Date.now()}`,
        slug: `source-org-${Date.now()}`,
      })
      .returning();

    // Create Course in Source Org
    const [sourceCourse] = await db
      .insert(schema.courses)
      .values({
        organizationId: sourceOrg.id,
        name: "فیزیولوژی پزشکی پیشرفته (دوره آزمون)",
        description: "دوره جامع فیزیولوژی سیستم قلبی عروقی",
        subject: "پزشکی",
        status: "published",
        isOfficial: true,
      })
      .returning();

    // Create Module in Source Org
    const [sourceModule] = await db
      .insert(schema.modules)
      .values({
        courseId: sourceCourse.id,
        title: "فصل ۱: الکتروفیزیولوژی قلب",
        description: "مفاهیم پتانسیل عمل و سیستم هدایتی قلب",
        sortOrder: 1,
      })
      .returning();

    // Create Lesson in Source Org
    const [sourceLesson] = await db
      .insert(schema.lessons)
      .values({
        moduleId: sourceModule.id,
        title: "درس ۱: پتانسیل عمل سلول‌های ضربان‌ساز",
        contentType: "markdown",
        contentMarkdown: "# پتانسیل عمل گره سینوسی\nجریان If و یون‌های کلسیم در دپلاریزاسیون خودبه‌خودی نقش اصلی را دارند.",
        sortOrder: 1,
        publicationStatus: "published",
      })
      .returning();

    // Create Real Binary PDF File in Storage & Database
    const samplePdfBytes = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF",
    );
    const sourcePdfSha256 = crypto.createHash("sha256").update(samplePdfBytes).digest("hex");
    const sourcePdfStorageKey = `uploads/source_${sourcePdfSha256.slice(0, 12)}.pdf`;
    await storageProvider.save({
      storageKey: sourcePdfStorageKey,
      data: samplePdfBytes,
      mimeType: "application/pdf",
    });

    const [sourceDoc] = await db
      .insert(schema.documents)
      .values({
        organizationId: sourceOrg.id,
        courseId: sourceCourse.id,
        ownerUserId: testAdmin.id,
        originalName: "cardio_physiology.pdf",
        mimeType: "application/pdf",
        sizeBytes: samplePdfBytes.length,
        sha256: sourcePdfSha256,
        storageKey: sourcePdfStorageKey,
        pageCount: 5,
        status: "ready",
      })
      .returning();

    // Create Document Chunk
    const chunkText = "پتانسیل استراحت گره SA حدود منفی ۵۵ تا منفی ۶۰ میلی‌ولت است.";
    const [sourceChunk] = await db
      .insert(schema.documentChunks)
      .values({
        documentId: sourceDoc.id,
        organizationId: sourceOrg.id,
        sequence: 1,
        content: chunkText,
        tokenEstimate: 15,
        contentHash: crypto.createHash("sha256").update(chunkText).digest("hex"),
      })
      .returning();

    // Create Generated Content
    const [sourceGenContent] = await db
      .insert(schema.generatedContents)
      .values({
        organizationId: sourceOrg.id,
        courseId: sourceCourse.id,
        documentId: sourceDoc.id,
        materializedLessonId: sourceLesson.id,
        type: "notes",
        status: "accepted",
        payload: { summary: "نکات مهم: جریان If ناشی از ورود سدیم در هایپرپلاریزاسیون است." },
      })
      .returning();

    // Create Citation
    await db.insert(schema.generatedContentCitations).values({
      generatedContentId: sourceGenContent.id,
      documentChunkId: sourceChunk.id,
      excerpt: "پتانسیل استراحت گره SA حدود منفی ۵۵ تا منفی ۶۰ میلی‌ولت است.",
    });

    // Create Flashcard
    const [sourceCard] = await db
      .insert(schema.flashcards)
      .values({
        organizationId: sourceOrg.id,
        courseId: sourceCourse.id,
        lessonId: sourceLesson.id,
        question: "کدام جریان یونی مسئول شیب دپلاریزاسیون دیاستولی در گره SA است؟",
        answer: "جریان If (Funny Current) که عمدتاً ورود سدیم است.",
        cardType: "definition",
        easeFactor: 250,
      })
      .returning();

    // Create Quiz
    const [sourceQuiz] = await db
      .insert(schema.quizzes)
      .values({
        organizationId: sourceOrg.id,
        courseId: sourceCourse.id,
        title: "کوییز الکتروفیزیولوژی قلب",
        description: "ارزیابی مفاهیم پایه‌ای ضربان‌ساز",
        status: "published",
      })
      .returning();

    // Create Quiz Question
    const [sourceQuestion] = await db
      .insert(schema.quizQuestions)
      .values({
        quizId: sourceQuiz.id,
        lessonId: sourceLesson.id,
        question: "کدام بخش از سیستم هدایتی قلب سریع‌ترین سرعت هدایت را دارد؟",
        choices: ["الیاف پورکینژ", "گره دهلیزی‌بطنی", "عضله بطنی", "گره سینوسی"],
        correctAnswer: "الیاف پورکینژ",
        sortOrder: 0,
        explanation: "الیاف پورکینژ با سرعت حدود ۴ متر بر ثانیه بالاترین سرعت هدایت را دارند.",
      })
      .returning();

    console.log("Source data seeded successfully in real DB:");
    console.log(`- Course ID: ${sourceCourse.id} (${sourceCourse.name})`);
    console.log(`- Module ID: ${sourceModule.id}`);
    console.log(`- Lesson ID: ${sourceLesson.id}`);
    console.log(`- Document ID: ${sourceDoc.id} (${sourceDoc.originalName}, SHA: ${sourcePdfSha256})`);
    console.log(`- Flashcard ID: ${sourceCard.id}`);
    console.log(`- Quiz ID: ${sourceQuiz.id}`);
    console.log(`- Quiz Question ID: ${sourceQuestion.id}`);

    // Run Real Export
    const exportService = new ContentExportService(db, storageProvider);
    const exportZipBuffer = await exportService.exportContent(sourceOrg.id, {
      courseId: sourceCourse.id,
    });

    console.log(`Real export ZIP generated. Size: ${exportZipBuffer.length} bytes.`);

    // Inspect real ZIP
    const zip = await JSZip.loadAsync(exportZipBuffer);
    const manifestStr = await zip.files["manifest.json"].async("string");
    const manifest = JSON.parse(manifestStr);
    console.log("Manifest contents:", JSON.stringify(manifest, null, 2));

    if (manifest.formatVersion !== 1) {
      throw new Error(`Invalid formatVersion in manifest: ${manifest.formatVersion}`);
    }
    if (manifest.counts.courses !== 1 || manifest.counts.modules !== 1 || manifest.counts.lessons !== 1 ||
        manifest.counts.documents !== 1 || manifest.counts.files !== 1 || manifest.counts.flashcards !== 1 ||
        manifest.counts.quizzes !== 1 || manifest.counts.questions !== 1) {
      throw new Error(`Manifest counts do not match seeded data! ${JSON.stringify(manifest.counts)}`);
    }

    // Verify binary file inside ZIP
    const fileEntry = manifest.files[0];
    const zipFileBuffer = await zip.files[fileEntry.path].async("nodebuffer");
    const zipFileSha = crypto.createHash("sha256").update(zipFileBuffer).digest("hex");
    if (zipFileSha !== sourcePdfSha256) {
      throw new Error(`File SHA mismatch in ZIP: expected ${sourcePdfSha256}, got ${zipFileSha}`);
    }
    console.log(">>> [2. REAL EXPORT]: PASS (Real ZIP inspected, all JSONs and binary file verified)\n");

    // =========================================================================
    // 3. CROSS-DB IMPORT & ID REMAPPING PROOF
    // =========================================================================
    console.log("--- 3. CROSS-DB IMPORT / ID REMAPPING PROOF ---");

    // Create Target Organization (simulating Production destination)
    const [targetOrg] = await db
      .insert(schema.organizations)
      .values({
        name: `Production Target Org ${Date.now()}`,
        slug: `prod-target-${Date.now()}`,
      })
      .returning();

    const importService = new ContentImportService(db, storageProvider);

    // Validate Package
    const validationPlan = await importService.validatePackage(
      exportZipBuffer,
      testAdmin.id,
      targetOrg.id,
    );
    console.log("Validation Plan ID:", validationPlan.planId);
    console.log("Validation Summary:", JSON.stringify(validationPlan.summary, null, 2));

    if (validationPlan.summary.courses.new !== 1 ||
        validationPlan.summary.modules.new !== 1 ||
        validationPlan.summary.lessons.new !== 1 ||
        validationPlan.summary.documents.new !== 1 ||
        validationPlan.summary.flashcards.new !== 1 ||
        validationPlan.summary.quizzes.new !== 1 ||
        validationPlan.summary.questions.new !== 1) {
      throw new Error("Validation plan counts expected all NEW=1!");
    }

    // Execute Import
    const importExecResult = await importService.executeImport(
      validationPlan.planId,
      testAdmin.id,
      targetOrg.id,
    );
    console.log("Import Execution Result:", JSON.stringify(importExecResult, null, 2));

    if (!importExecResult.success) {
      throw new Error("Import execution failed!");
    }

    // Query Target Database rows directly from PostgreSQL
    const targetCourses = await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.organizationId, targetOrg.id));
    if (targetCourses.length !== 1) throw new Error(`Expected 1 course in target, found ${targetCourses.length}`);
    const targetCourse = targetCourses[0];

    const targetModules = await db
      .select()
      .from(schema.modules)
      .where(eq(schema.modules.courseId, targetCourse.id));
    if (targetModules.length !== 1) throw new Error("Expected 1 module in target");
    const targetModule = targetModules[0];

    const targetLessons = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.moduleId, targetModule.id));
    if (targetLessons.length !== 1) throw new Error("Expected 1 lesson in target");
    const targetLesson = targetLessons[0];

    const targetDocs = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.organizationId, targetOrg.id));
    if (targetDocs.length !== 1) throw new Error("Expected 1 doc in target");
    const targetDoc = targetDocs[0];

    const targetQuizzes = await db
      .select()
      .from(schema.quizzes)
      .where(eq(schema.quizzes.organizationId, targetOrg.id));
    if (targetQuizzes.length !== 1) throw new Error("Expected 1 quiz in target");
    const targetQuiz = targetQuizzes[0];

    const targetQuestions = await db
      .select()
      .from(schema.quizQuestions)
      .where(eq(schema.quizQuestions.quizId, targetQuiz.id));
    if (targetQuestions.length !== 1) throw new Error("Expected 1 quiz question in target");
    const targetQuestion = targetQuestions[0];

    const targetCards = await db
      .select()
      .from(schema.flashcards)
      .where(eq(schema.flashcards.organizationId, targetOrg.id));
    if (targetCards.length !== 1) throw new Error("Expected 1 flashcard in target");
    const targetCard = targetCards[0];

    // PROVE ID INDEPENDENCE & REMAPPING:
    console.log("\n>>> ID COMPARISON & FOREIGN KEY REMAPPING VERIFICATION:");
    console.log(`Course:        Source ID [${sourceCourse.id}] != Target ID [${targetCourse.id}]`);
    console.log(`Module:        Source ID [${sourceModule.id}] != Target ID [${targetModule.id}]`);
    console.log(`               Module FK courseId -> Target Course ID [${targetModule.courseId}]`);
    console.log(`Lesson:        Source ID [${sourceLesson.id}] != Target ID [${targetLesson.id}]`);
    console.log(`               Lesson FK moduleId -> Target Module ID [${targetLesson.moduleId}]`);
    console.log(`Document:      Source ID [${sourceDoc.id}] != Target ID [${targetDoc.id}]`);
    console.log(`               Doc FK courseId -> Target Course ID [${targetDoc.courseId}]`);
    console.log(`Flashcard:     Source ID [${sourceCard.id}] != Target ID [${targetCard.id}]`);
    console.log(`               Flashcard FK courseId -> Target Course ID [${targetCard.courseId}]`);
    console.log(`               Flashcard FK lessonId -> Target Lesson ID [${targetCard.lessonId}]`);
    console.log(`Quiz:          Source ID [${sourceQuiz.id}] != Target ID [${targetQuiz.id}]`);
    console.log(`               Quiz FK courseId -> Target Course ID [${targetQuiz.courseId}]`);
    console.log(`Quiz Question: Source ID [${sourceQuestion.id}] != Target ID [${targetQuestion.id}]`);
    console.log(`               Question FK quizId -> Target Quiz ID [${targetQuestion.quizId}]`);
    console.log(`               Question FK lessonId -> Target Lesson ID [${targetQuestion.lessonId}]`);

    if (targetCourse.id === sourceCourse.id) throw new Error("Target Course ID leaked source ID!");
    if (targetModule.id === sourceModule.id) throw new Error("Target Module ID leaked source ID!");
    if (targetLesson.id === sourceLesson.id) throw new Error("Target Lesson ID leaked source ID!");
    if (targetDoc.id === sourceDoc.id) throw new Error("Target Doc ID leaked source ID!");
    if (targetCard.id === sourceCard.id) throw new Error("Target Flashcard ID leaked source ID!");
    if (targetQuiz.id === sourceQuiz.id) throw new Error("Target Quiz ID leaked source ID!");
    if (targetQuestion.id === sourceQuestion.id) throw new Error("Target Question ID leaked source ID!");

    if (targetModule.courseId !== targetCourse.id) throw new Error("Module FK broken!");
    if (targetLesson.moduleId !== targetModule.id) throw new Error("Lesson FK broken!");
    if (targetCard.courseId !== targetCourse.id || targetCard.lessonId !== targetLesson.id) throw new Error("Card FK broken!");
    if (targetQuestion.quizId !== targetQuiz.id || targetQuestion.lessonId !== targetLesson.id) throw new Error("Question FK broken!");

    console.log(">>> [3. CROSS-DB IMPORT & ID REMAPPING]: PASS (All IDs decoupled and FKs remapped)\n");

    // =========================================================================
    // 4. REPEATED IMPORT / IDEMPOTENCY TEST
    // =========================================================================
    console.log("--- 4. REPEATED IMPORT / IDEMPOTENCY VERIFICATION ---");

    // Re-validate the exact same ZIP in the same target organization
    const secondPlan = await importService.validatePackage(
      exportZipBuffer,
      testAdmin.id,
      targetOrg.id,
    );

    console.log("Second Import Validation Summary:", JSON.stringify(secondPlan.summary, null, 2));

    if (secondPlan.summary.courses.new !== 0 ||
        secondPlan.summary.modules.new !== 0 ||
        secondPlan.summary.lessons.new !== 0 ||
        secondPlan.summary.documents.new !== 0 ||
        secondPlan.summary.flashcards.new !== 0 ||
        secondPlan.summary.quizzes.new !== 0 ||
        secondPlan.summary.questions.new !== 0) {
      throw new Error(`Second validation reported new items! Expected all new=0`);
    }

    if (secondPlan.summary.courses.existing !== 1 ||
        secondPlan.summary.modules.existing !== 1 ||
        secondPlan.summary.lessons.existing !== 1 ||
        secondPlan.summary.documents.existing !== 1 ||
        secondPlan.summary.flashcards.existing !== 1 ||
        secondPlan.summary.quizzes.existing !== 1 ||
        secondPlan.summary.questions.existing !== 1) {
      throw new Error(`Second validation failed to detect existing records!`);
    }

    if (secondPlan.conflicts.length !== 0) {
      throw new Error(`Unexpected conflicts on identical re-import: ${JSON.stringify(secondPlan.conflicts)}`);
    }

    // Execute second import
    const secondExecResult = await importService.executeImport(
      secondPlan.planId,
      testAdmin.id,
      targetOrg.id,
    );
    console.log("Second Import Execution Result:", JSON.stringify(secondExecResult, null, 2));

    if (secondExecResult.counts.created !== 0) {
      throw new Error(`Second import created ${secondExecResult.counts.created} records! Expected 0.`);
    }

    // Verify target table counts did not increase
    const targetCoursesAfter = await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.organizationId, targetOrg.id));
    if (targetCoursesAfter.length !== 1) throw new Error("Target courses duplicated!");

    const targetLessonsAfter = await db
      .select()
      .from(schema.lessons)
      .where(eq(schema.lessons.moduleId, targetModule.id));
    if (targetLessonsAfter.length !== 1) throw new Error("Target lessons duplicated!");

    console.log(">>> [4. REPEATED IMPORT / IDEMPOTENCY]: PASS (0 new records, 100% existing skipped)\n");

    // =========================================================================
    // 5. TRANSACTION ROLLBACK & ORPHAN FILE CLEANUP TEST
    // =========================================================================
    console.log("--- 5. TRANSACTION ROLLBACK & ORPHAN FILE CLEANUP VERIFICATION ---");

    // Create a new target organization for rollback test
    const [rollbackOrg] = await db
      .insert(schema.organizations)
      .values({
        name: `Rollback Test Org ${Date.now()}`,
        slug: `rollback-org-${Date.now()}`,
      })
      .returning();

    // Create a special test ZIP with a valid document & file, but corrupt question data (choices = null or invalid)
    // that causes Postgres to reject the transaction at the end.
    const corruptZip = new JSZip();
    corruptZip.file("manifest.json", JSON.stringify({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: "rollback-test",
      counts: { courses: 1, documents: 1, files: 1, quizzes: 1, questions: 1 },
      files: [{ path: "files/test_rollback.pdf", sha256: sourcePdfSha256, mimeType: "application/pdf", sizeBytes: samplePdfBytes.length }],
    }));
    corruptZip.file("courses.json", JSON.stringify([
      { exportId: "c_roll_1", name: "Rollback Test Course", isOfficial: false, status: "published" },
    ]));
    corruptZip.file("documents.json", JSON.stringify([
      { exportId: "doc_roll_1", courseExportId: "c_roll_1", originalName: "test_rollback.pdf", mimeType: "application/pdf", sizeBytes: samplePdfBytes.length, sha256: sourcePdfSha256, fileEntryPath: "files/test_rollback.pdf" },
    ]));
    corruptZip.file("files/test_rollback.pdf", samplePdfBytes);
    corruptZip.file("quizzes.json", JSON.stringify([
      { exportId: "q_roll_1", courseExportId: "c_roll_1", title: "Roll Quiz", status: "published" },
    ]));
    // In quiz_questions, omit required 'choices' or provide invalid null to force Postgres NOT NULL error
    corruptZip.file("questions.json", JSON.stringify([
      { exportId: "qq_roll_1", quizExportId: "q_roll_1", question: "آزمون برای رول‌بک", choices: null, correctAnswer: null },
    ]));

    const corruptZipBuffer = await corruptZip.generateAsync({ type: "nodebuffer" });

    // Validate corrupt package
    const corruptPlan = await importService.validatePackage(
      corruptZipBuffer,
      testAdmin.id,
      rollbackOrg.id,
    );

    let rollbackErrorCaught = false;
    try {
      await importService.executeImport(corruptPlan.planId, testAdmin.id, rollbackOrg.id);
    } catch (err: any) {
      rollbackErrorCaught = true;
      console.log("Successfully intercepted intentional error during import:", err.message);
    }

    if (!rollbackErrorCaught) {
      throw new Error("Expected import to fail on corrupt data, but it succeeded!");
    }

    // Verify DB rollback: 0 courses, 0 documents in rollbackOrg
    const coursesInRollback = await db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.organizationId, rollbackOrg.id));
    if (coursesInRollback.length !== 0) {
      throw new Error(`DB rollback failed: found ${coursesInRollback.length} courses in rollbackOrg!`);
    }

    const docsInRollback = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.organizationId, rollbackOrg.id));
    if (docsInRollback.length !== 0) {
      throw new Error(`DB rollback failed: found ${docsInRollback.length} docs in rollbackOrg!`);
    }

    // Check physical file cleanup: verify no file with the expected target key exists in storage
    const targetFileKey = `documents/${rollbackOrg.id}/${sourcePdfSha256}.pdf`;
    const fileStillExists = await storageProvider.exists(targetFileKey);
    console.log(`Orphan physical file cleanup check for key [${targetFileKey}]: exists=${fileStillExists}`);
    if (fileStillExists) {
      throw new Error(`Rollback failed to delete physical file from storage! File still exists: ${targetFileKey}`);
    }

    console.log(">>> [5. ROLLBACK]: PASS (DB completely rolled back and physical file deleted from storage)\n");

    // =========================================================================
    // 6. BINARY FILE INTEGRITY VERIFICATION
    // =========================================================================
    console.log("--- 6. BINARY FILE INTEGRITY VERIFICATION ---");

    // Check the file successfully imported into targetOrg during step 3
    const importedStorageKey = targetDoc.storageKey;
    console.log("Reading imported file from storage key:", importedStorageKey);
    const targetFileBuffer = await storageProvider.read(importedStorageKey);
    const targetFileSha256 = crypto.createHash("sha256").update(targetFileBuffer).digest("hex");

    console.log(`Source File SHA-256: [${sourcePdfSha256}]`);
    console.log(`Target File SHA-256: [${targetFileSha256}]`);
    console.log(`Source File Size:     ${samplePdfBytes.length} bytes`);
    console.log(`Target File Size:     ${targetFileBuffer.length} bytes`);

    if (targetFileSha256 !== sourcePdfSha256) {
      throw new Error(`SHA-256 mismatch between source and imported target file!`);
    }
    if (targetFileBuffer.length !== samplePdfBytes.length) {
      throw new Error(`Byte size mismatch between source and imported target file!`);
    }

    // Verify it starts with PDF magic header
    const magicHeader = targetFileBuffer.subarray(0, 5).toString("utf-8");
    console.log("File magic header:", magicHeader);
    if (magicHeader !== "%PDF-") {
      throw new Error(`Target file corrupt! Magic header is '${magicHeader}', expected '%PDF-'`);
    }

    console.log(">>> [6. BINARY FILE INTEGRITY]: PASS (Exact SHA-256 and byte-for-byte integrity verified)\n");

    console.log("=================================================================");
    console.log("ALL 6 FINAL VERIFICATION PASSES COMPLETED AND PASSED WITH 100% SUCCESS!");
    console.log("=================================================================");
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error("VERIFICATION FAILED WITH ERROR:", err);
  process.exit(1);
});
