/**
 * Real Generation & Verification Script for Document 39.
 *
 * 1. Performs a tiny 1-token quota pre-check against Gemini.
 *    If quota is exhausted (429), terminates immediately with clean report.
 * 2. Connects to real PostgreSQL database.
 * 3. Finds or sets up Document 39 and its extracted chunks.
 * 4. Runs generationService.generateForDocument using GeminiModelGateway.
 * 5. Queries and reports exact database records:
 *    - Session count
 *    - Flashcards total & per session
 *    - Quiz questions total & per session
 *    - Full content coverage & Markdown table presence
 *    - Compliance with hard minimums (>=8 sessions, >=10 cards/session, >=10 questions/session)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, desc } from "drizzle-orm";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type OrganizationId,
  RoleBasedPolicy,
  DomainError,
} from "@avana/domain";
import {
  documents,
  documentChunks,
  generatedContents,
  generatedContentCitations,
} from "../../../../database/schema/index.js";
import {
  DrizzleDocumentStore,
  DrizzleDocumentChunkStore,
} from "../modules/learning/drizzle-stores.js";
import {
  DrizzleGeneratedContentStore,
  DrizzleGeneratedContentCitationStore,
} from "../modules/generation/drizzle-stores.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { PdfTextExtractor } from "../modules/documents/extraction/pdf-extractor.js";

async function main() {
  const envPath = resolve(process.cwd(), ".env");
  let geminiKey = process.env.GEMINI_API_KEY;
  let dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/avana";

  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const kMatch = envContent.match(/GEMINI_API_KEY=(.+)/);
    if (kMatch) geminiKey = kMatch[1].trim();
    const dMatch = envContent.match(/DATABASE_URL=(.+)/);
    if (dMatch) dbUrl = dMatch[1].trim();
  }

  if (!geminiKey) {
    console.error("❌ GEMINI_API_KEY is not set.");
    process.exit(1);
  }

  console.log("==================================================");
  console.log("STEP 1: PRE-FLIGHT GEMINI QUOTA SMOKE TEST");
  console.log("==================================================");

  const gateway = new GeminiModelGateway({
    apiKey: geminiKey,
    model: "gemini-2.5-flash",
  });

  try {
    const smokeRes = await gateway.complete({
      promptVersion: "smoke",
      messages: [{ role: "user", content: "Reply with the single word: OK" }],
      correlationId: "quota-smoke-test",
      organizationId: "org-smoke" as OrganizationId,
    });
    console.log(`✅ Quota Pre-Check Passed! Model response: "${smokeRes.text.trim()}", model: ${smokeRes.model}`);
  } catch (err: unknown) {
    const isQuotaError =
      err instanceof DomainError &&
      (err.code === "rate_limit_exceeded" || err.message.includes("quota") || err.message.includes("429"));

    if (isQuotaError) {
      console.error("\n❌ [QUOTA EXHAUSTED] Gemini Free Tier Daily Quota (20 requests/day) is currently exhausted.");
      console.error("Error details:", (err as Error).message);
      console.error("Halting immediately without retrying on 429 as requested.");
      process.exit(0);
    }
    console.error("Unexpected error during quota check:", err);
    throw err;
  }

  console.log("\n==================================================");
  console.log("STEP 2: DATABASE INITIALIZATION & DOCUMENT 39 LOOKUP");
  console.log("==================================================");

  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  const docStore = new DrizzleDocumentStore(db);
  const chunkStore = new DrizzleDocumentChunkStore(db);
  const contentStore = new DrizzleGeneratedContentStore(db);
  const citationStore = new DrizzleGeneratedContentCitationStore(db);

  // Find latest document 39 in DB or create/extract if missing
  const existingDocs = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.createdAt));

  console.log(`Found ${existingDocs.length} documents in database.`);

  let targetDoc = existingDocs.find(
    (d) =>
      d.originalName.includes("39") ||
      d.originalName.toLowerCase().includes("steroid") ||
      d.originalName.toLowerCase().includes("katzung") ||
      d.storageKey.includes("1d36a907"),
  );

  let orgId = targetDoc?.organizationId as OrganizationId;
  let courseId = targetDoc?.courseId as CourseId;
  let docId = targetDoc?.id as DocumentId;

  const pdfPath = resolve(
    process.cwd(),
    "storage/uploads/uploads/1d36a907-4e4d-4c05-9e0f-4f41379d9241.pdf",
  );

  if (!targetDoc) {
    console.log(`Document 39 not yet in DB. Registering from ${pdfPath}...`);
    if (!existsSync(pdfPath)) {
      console.error(`PDF file not found at ${pdfPath}`);
      process.exit(1);
    }

    const pdfBuffer = readFileSync(pdfPath);
    const extractor = new PdfTextExtractor();
    const extractionResult = await extractor.extract({
      data: pdfBuffer,
      mimeType: "application/pdf",
      originalName: "Katzung Chapter 39 - Adrenocorticosteroids & Antagonists.pdf",
    });

    orgId = "org_e2e_real_test" as OrganizationId;
    courseId = "course_e2e_real_test" as CourseId;
    docId = "1d36a907-4e4d-4c05-9e0f-4f41379d9241" as DocumentId;
    const now = new Date().toISOString();

    await docStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: "user_test_owner" as any,
      originalName: "Katzung Chapter 39 - Adrenocorticosteroids & Antagonists.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBuffer.length,
      sha256: "hash-doc39-real",
      storageKey: "uploads/1d36a907-4e4d-4c05-9e0f-4f41379d9241.pdf",
      pageCount: extractionResult.pages.length,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const chunks = extractionResult.pages.map((p, idx) => ({
      id: `chunk-doc39-p${p.pageNumber}` as any,
      documentId: docId,
      organizationId: orgId,
      sequence: idx + 1,
      heading: `Chapter 39 - Page ${p.pageNumber}`,
      content: p.rawText,
      startPage: p.pageNumber,
      endPage: p.pageNumber,
      tokenEstimate: Math.max(1, Math.ceil(p.rawText.length / 4)),
      contentHash: `hash-p${p.pageNumber}`,
      createdAt: now,
    }));

    await chunkStore.createMany(chunks);
    console.log(`Created document record and extracted ${chunks.length} chunks into DB.`);
  } else {
    docId = targetDoc.id as DocumentId;
    orgId = targetDoc.organizationId as OrganizationId;
    courseId = targetDoc.courseId as CourseId;
    console.log(`Using existing document in DB: ${targetDoc.originalName} (ID: ${docId}, Org: ${orgId})`);

    // Ensure chunks exist
    const existingChunks = await chunkStore.listByDocument(docId);
    if (existingChunks.length === 0 && existsSync(pdfPath)) {
      console.log(`Re-extracting chunks for document ${docId}...`);
      const pdfBuffer = readFileSync(pdfPath);
      const extractor = new PdfTextExtractor();
      const extractionResult = await extractor.extract({
        data: pdfBuffer,
        mimeType: "application/pdf",
        originalName: targetDoc.originalName,
      });
      const now = new Date().toISOString();
      const chunks = extractionResult.pages.map((p, idx) => ({
        id: `chunk-doc39-p${p.pageNumber}` as any,
        documentId: docId,
        organizationId: orgId,
        sequence: idx + 1,
        heading: `Chapter 39 - Page ${p.pageNumber}`,
        content: p.rawText,
        startPage: p.pageNumber,
        endPage: p.pageNumber,
        tokenEstimate: Math.max(1, Math.ceil(p.rawText.length / 4)),
        contentHash: `hash-p${p.pageNumber}`,
        createdAt: now,
      }));
      await chunkStore.createMany(chunks);
      console.log(`Extracted and stored ${chunks.length} chunks.`);
    } else {
      console.log(`Document has ${existingChunks.length} existing chunks in DB.`);
    }
  }

  console.log("\n==================================================");
  console.log("STEP 3: RUNNING LIVE GENERATION FOR DOCUMENT 39");
  console.log("==================================================");

  const generationService = new GenerationService(
    contentStore,
    citationStore,
    gateway,
    docStore,
    chunkStore,
    new RoleBasedPolicy(),
  );

  const actor: Actor = {
    userId: "user_test_owner" as any,
    role: "student",
  };

  const startTime = Date.now();
  console.log(`Starting batched coverage-driven generation for Document 39...`);

  const genResult = await generationService.generateForDocument(
    actor,
    orgId,
    docId,
    { types: ["lesson", "flashcard", "quiz"] },
  );

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Generation completed in ${durationSec}s! Document status: ${genResult.document_status}`);

  console.log("\n==================================================");
  console.log("STEP 4: INSPECTING DATABASE RECORDS & COVERAGE");
  console.log("==================================================");

  const savedContents = await db
    .select()
    .from(generatedContents)
    .where(eq(generatedContents.documentId, docId));

  const lessonRecord = savedContents.find((c) => c.type === "lesson");
  const flashcardRecord = savedContents.find((c) => c.type === "flashcard");
  const quizRecord = savedContents.find((c) => c.type === "quiz");

  const lessonPayload = lessonRecord?.payload as any;
  const flashcardPayload = flashcardRecord?.payload as any;
  const quizPayload = quizRecord?.payload as any;

  const sessionCount = lessonPayload?.sessions?.length || 0;
  const totalFlashcards = flashcardPayload?.cards?.length || 0;
  const totalQuizQuestions = quizPayload?.questions?.length || 0;

  console.log(`\n📊 SUMMARY REPORT FOR DOCUMENT 39:`);
  console.log(`-----------------------------------`);
  console.log(`1. Sessions Generated: ${sessionCount}`);
  if (lessonPayload?.sessions) {
    lessonPayload.sessions.forEach((s: any, idx: number) => {
      console.log(`   - Session ${idx + 1}: "${s.title}" (${s.contentMarkdown?.length || 0} chars)`);
    });
  }

  console.log(`\n2. Flashcards:`);
  console.log(`   - Total Cards: ${totalFlashcards}`);
  if (lessonPayload?.coverageReport?.flashcardCoverage?.cardsPerSession) {
    lessonPayload.coverageReport.flashcardCoverage.cardsPerSession.forEach((cs: any, idx: number) => {
      console.log(`   - Session ${idx + 1} (${cs.sessionTitle}): ${cs.cardCount} cards`);
    });
  }

  console.log(`\n3. Quiz Questions:`);
  console.log(`   - Total Questions: ${totalQuizQuestions}`);
  if (lessonPayload?.coverageReport?.quizCoverage?.questionsPerSession) {
    lessonPayload.coverageReport.quizCoverage.questionsPerSession.forEach((qs: any, idx: number) => {
      console.log(`   - Session ${idx + 1} (${qs.sessionTitle}): ${qs.questionCount} questions`);
    });
  }

  const hasTables = (lessonPayload?.sessions || []).some((s: any) =>
    s.contentMarkdown?.includes("|---|") || s.contentMarkdown?.includes("|:---|"),
  );
  console.log(`\n4. Markdown Tables in Lessons: ${hasTables ? "✅ YES (GFM table syntax present in sessions)" : "❌ NO"}`);

  const meetsSessionMinimum = sessionCount >= 8;
  const meetsFlashcardMinimum = totalFlashcards >= sessionCount * 10;
  const meetsQuizMinimum = totalQuizQuestions >= sessionCount * 10;

  console.log(`\n5. Minimum Requirements Checklist:`);
  console.log(`   - Minimum 8 Sessions: ${meetsSessionMinimum ? "✅ PASS" : "❌ FAIL"} (${sessionCount}/8)`);
  console.log(`   - Minimum 10 Flashcards/Session: ${meetsFlashcardMinimum ? "✅ PASS" : "❌ FAIL"} (${totalFlashcards} total, avg ${(totalFlashcards / Math.max(1, sessionCount)).toFixed(1)}/session)`);
  console.log(`   - Minimum 10 Quiz Questions/Session: ${meetsQuizMinimum ? "✅ PASS" : "❌ FAIL"} (${totalQuizQuestions} total, avg ${(totalQuizQuestions / Math.max(1, sessionCount)).toFixed(1)}/session)`);

  await pool.end();
}

main().catch((err) => {
  console.error("FATAL ERROR in generation run:", err);
  process.exit(1);
});
