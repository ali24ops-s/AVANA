/**
 * Targeted Live Verification against Document 39 (Katzung Chapter 39)
 *
 * Tests the Coverage-Driven Generation Architecture with live Gemini 3.6 Flash:
 * - Session Count: At least 8 sessions for Katzung Chapter 39
 * - Flashcard Count: At least 10 cards per session (>= 80 total)
 * - Quiz Questions: At least 10 questions per session (>= 80 total)
 * - Tables: Markdown table rendering structure (| Col 1 | Col 2 |)
 * - Citations: 100% chunk grounding
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type OrganizationId,
  RoleBasedPolicy,
} from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { PdfTextExtractor } from "../modules/documents/extraction/pdf-extractor.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
} from "../modules/learning/learning-store.js";

async function main() {
  // Load .env
  const envPath = resolve(process.cwd(), ".env");
  let geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey && existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/GEMINI_API_KEY=(.+)/);
    if (match) geminiKey = match[1].trim();
  }

  if (!geminiKey) {
    console.error("GEMINI_API_KEY is not set in environment or .env");
    process.exit(1);
  }

  const pdfPath = resolve(
    process.cwd(),
    "storage/uploads/uploads/1d36a907-4e4d-4c05-9e0f-4f41379d9241.pdf",
  );

  if (!existsSync(pdfPath)) {
    console.error(`Document 39 PDF not found at ${pdfPath}`);
    process.exit(1);
  }

  console.log(`[verify-doc39] Loading Document 39 PDF from ${pdfPath}...`);
  const pdfBuffer = readFileSync(pdfPath);
  const extractor = new PdfTextExtractor();
  const extractionResult = await extractor.extract({
    data: pdfBuffer,
    mimeType: "application/pdf",
    originalName: "chapter_39_steroids.pdf",
  });

  const totalChars = extractionResult.pages.reduce((acc, p) => acc + p.rawText.length, 0);
  console.log(`[verify-doc39] Extracted ${extractionResult.pages.length} pages, total text length: ${totalChars} chars.`);

  const docId = "doc-katzung-ch39" as DocumentId;
  const orgId = "org-verify" as OrganizationId;
  const courseId = "course-pharm-ch39" as CourseId;
  const now = new Date().toISOString();

  const docRecord: DocumentRecord = {
    id: docId,
    organizationId: orgId,
    courseId,
    ownerUserId: "user-test" as DocumentRecord["ownerUserId"],
    originalName: "Katzung Chapter 39 - Adrenocorticosteroids & Antagonists.pdf",
    mimeType: "application/pdf",
    sizeBytes: pdfBuffer.length,
    sha256: "hash-doc39",
    storageKey: "uploads/1d36a907-4e4d-4c05-9e0f-4f41379d9241.pdf",
    pageCount: extractionResult.pages.length,
    status: "extracted",
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  // Convert pages to chunks (one chunk per page or section)
  const chunks: DocumentChunkRecord[] = extractionResult.pages.map((p, idx) => ({
    id: `chunk-p${p.pageNumber}` as DocumentChunkRecord["id"],
    documentId: docId,
    organizationId: orgId,
    sequence: idx,
    heading: `بخش ${p.pageNumber}: صفحه ${p.pageNumber}`,
    content: p.rawText.trim().length > 0 ? p.rawText : `صفحه ${p.pageNumber} از کتاب کاتزونگ فصل ۳۹`,
    startPage: p.pageNumber,
    endPage: p.pageNumber,
    tokenEstimate: Math.max(10, Math.round(p.rawText.length / 4)),
    contentHash: `hash-p${p.pageNumber}`,
    createdAt: now,
  }));

  const docStore = new InMemoryDocumentStore();
  const chunkStore = new InMemoryDocumentChunkStore();
  const contentStore = new InMemoryGeneratedContentStore();
  const citationStore = new InMemoryGeneratedContentCitationStore();

  await docStore.create(docRecord);
  await chunkStore.createMany(chunks);

  const gateway = new GeminiModelGateway({
    apiKey: geminiKey,
    modelName: "gemini-3.6-flash",
    timeoutMs: 90000,
  });

  const service = new GenerationService(
    contentStore,
    citationStore,
    gateway,
    docStore,
    chunkStore,
    new RoleBasedPolicy(),
  );

  const actor: Actor = {
    userId: "user-admin" as Actor["userId"],
    role: "organization_admin",
  };

  console.log(`[verify-doc39] Starting Coverage-Driven Generation for Document 39...`);
  const startTime = Date.now();

  const result = await service.generateForDocument(actor, orgId, docId, {
    types: ["lesson", "flashcard", "quiz"],
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[verify-doc39] Generation completed in ${durationSec}s!`);

  const lessonContent = result.contents.find((c) => c.type === "lesson");
  const flashcardContent = result.contents.find((c) => c.type === "flashcard");
  const quizContent = result.contents.find((c) => c.type === "quiz");

  const lessonPayload = lessonContent?.payload as {
    moduleTitle?: string;
    outline?: Array<{ title: string; description: string; relevantChunkIds?: string[] }>;
    sessions?: Array<{ title: string; contentMarkdown: string }>;
    contentMarkdown?: string;
  } | undefined;

  const flashcardPayload = flashcardContent?.payload as {
    cards?: Array<{ question: string; answer: string; cardType?: string; difficulty?: string }>;
  } | undefined;

  const quizPayload = quizContent?.payload as {
    questions?: Array<{ question: string; choices: string[]; correctAnswer: string; explanation: string }>;
  } | undefined;

  console.log("\n=======================================================");
  console.log("             DOCUMENT 39 GENERATION REPORT              ");
  console.log("=======================================================");
  console.log(`Module Title: ${lessonPayload?.moduleTitle}`);
  console.log(`Session Count: ${lessonPayload?.sessions?.length ?? 0} sessions (Requirement: >= 8)`);
  console.log(`Flashcard Count: ${flashcardPayload?.cards?.length ?? 0} cards (Requirement: >= 80, min 10/session)`);
  console.log(`Quiz Question Count: ${quizPayload?.questions?.length ?? 0} questions (Requirement: >= 80, min 10/session)`);

  console.log("\n--- SESSIONS GENERATED ---");
  lessonPayload?.sessions?.forEach((s, idx) => {
    const tableCount = (s.contentMarkdown.match(/\|[\s\S]*?\|/g) || []).length > 0;
    console.log(`  ${idx + 1}. ${s.title} (${s.contentMarkdown.length} chars, GFM Tables: ${tableCount ? "YES" : "NO"})`);
  });

  // Table markdown check
  const masterMd = lessonPayload?.contentMarkdown || "";
  const tableMatches = masterMd.match(/\|(.+)\|/g);
  console.log(`\nMarkdown Tables in Lessons: ${tableMatches ? `${tableMatches.length} table rows detected` : "None"}`);

  // Citations check
  console.log(`Citations Grounded:`);
  console.log(`  - Lesson Citations: ${lessonContent?.citations?.length ?? 0} chunks`);
  console.log(`  - Flashcard Citations: ${flashcardContent?.citations?.length ?? 0} chunks`);
  console.log(`  - Quiz Citations: ${quizContent?.citations?.length ?? 0} chunks`);

  console.log("\nSample Flashcards (First 3):");
  flashcardPayload?.cards?.slice(0, 3).forEach((card, idx) => {
    console.log(`  ${idx + 1}. Q: ${card.question}`);
    console.log(`     A: ${card.answer}`);
  });

  console.log("\nSample Quiz Questions (First 2):");
  quizPayload?.questions?.slice(0, 2).forEach((q, idx) => {
    console.log(`  ${idx + 1}. Question: ${q.question}`);
    console.log(`     Choices: ${q.choices.join(" | ")}`);
    console.log(`     Correct: ${q.correctAnswer}`);
  });
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
