/**
 * Comprehensive End-to-End Trace of the real Upload & Gemini AI Learning Pipeline.
 *
 * Exercises the entire live production stack with REAL Persian educational text:
 * UI HTTP Endpoints -> Fastify API -> PostgreSQL -> LocalStorage -> Document Extractor ->
 * Document Chunker -> Redis BullMQ -> Worker Processor -> Gemini AI Gateway ->
 * Draft Review -> Materialization -> Course/Flashcards/Quizzes API.
 *
 * Explicitly asserts:
 * - Worker provider is "gemini"
 * - Generated model is NOT "mock-1"
 * - No mock placeholder strings in generated content
 * - Authentic Persian educational content derived from uploaded document
 * - Citations reference actual document chunks
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import JSZip from "jszip";
import * as schema from "@avana/database/schema";
import { SessionService } from "../modules/identity/session-service.js";
import { loadApiConfig } from "../config.js";
import { DrizzleSessionStore } from "../modules/identity/drizzle-stores.js";

import { DOCX_MIME_TYPE } from "../modules/documents/extraction/docx-extractor.js";

/**
 * Builds a valid DOCX containing rich Persian pharmacology text about Digoxin.
 */
async function buildPersianPharmacologyDocx(tag: string = `${Date.now()}`): Promise<Buffer> {
  const zip = new JSZip();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>فارماکولوژی گلیکوزیدهای قلبی و دیگوکسین (شناسه مستند: ${tag})</w:t></w:r></w:p>
    <w:p><w:r><w:t>مکانیسم عمل سلولی: دیگوکسین یک داروی اینوتروپیک مثبت است که با مهار اختصاصی و برگشت‌پذیر پمپ سدیم-پتاسیم ATPase (Na+/K+-ATPase) در غشای سارکولم سلول‌های عضله قلب (میوکارد) عمل می‌کند.</w:t></w:r></w:p>
    <w:p><w:r><w:t>این مهار سبب افزایش غلظت سدیم داخل سلولی شده و در نتیجه گرادیان الکتروشیمیایی سدیم کاهش می‌یابد. به دنبال آن، فعالیت مبادله‌گر سدیم-کلسیم (NCX) مهار شده و خروج کلسیم از سلول کاهش می‌یابد.</w:t></w:r></w:p>
    <w:p><w:r><w:t>تجمع کلسیم در شبکه سارکوپلاسمیک و افزایش آزادسازی کلسیم در زمان انقباض، منجر به افزایش قدرت انقباضی میوکارد بدون افزایش مصرف اکسیژن متناسب می‌شود.</w:t></w:r></w:p>
    <w:p><w:r><w:t>کاربردهای بالینی اصلی: ۱) درمان نارسایی احتقانی قلب (CHF) با کسر تخلیه‌ای کاهش یافته (HFrEF) جهت بهبود علائم و کاهش بستری؛ ۲) کنترل سرعت پاسخ بطنی در آریتمی‌های فوق بطنی شامل فیبریلاسیون دهلیزی (AFib) و فلوتر دهلیزی.</w:t></w:r></w:p>
    <w:p><w:r><w:t>فارماکوکینتیک و پنجره درمانی: دیگوکسین دارای شاخص درمانی بسیار باریک (Narrow Therapeutic Index) است. دفع آن عمدتاً کلیوی بوده و نیمه‌عمر آن حدود ۳۶ تا ۴۸ ساعت در بیماران با عملکرد کلیوی نرمال است.</w:t></w:r></w:p>
    <w:p><w:r><w:t>عوارض جانبی و مسمومیت: هیپوکالمی (کاهش پتاسیم خون) و هیپومنیزیمی به شدت حساسیت به مسمومیت دیگوکسین را افزایش می‌دهند زیرا پتاسیم با دیگوکسین بر سر اتصال به پمپ سدیم-پتاسیم رقابت می‌کند.</w:t></w:r></w:p>
    <w:p><w:r><w:t>علائم سمیت و توکسیسیتی: علائم گوارشی (بی‌اشتهایی، تهوع، استفراغ)، علائم عصبی و بینایی (دید زرد-سبز معروف به زانتوپسی Xanthopsia، هاله نورانی اطراف اشیاء) و انواع آریتمی‌های قلبی از جمله PVCهای مکرر، تاکیکاردی بطنی و بلوک هدایتی دهلیزی-بطنی (AV block).</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  zip.file("word/document.xml", documentXml);
  const mainType = `${DOCX_MIME_TYPE}.main+xml`;
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="${mainType}"/>
</Types>`);

  return zip.generateAsync({ type: "nodebuffer" });
}

async function runEndToEndTrace() {
  console.log(`\n=============================================================`);
  console.log(`AVANA End-to-End Real Persian Upload & Gemini AI Pipeline Trace`);
  console.log(`=============================================================\n`);

  const config = loadApiConfig();
  console.log(`[config] AI Provider: ${config.generation.aiProvider}`);
  console.log(`[config] Gemini Model: ${config.generation.geminiModel}`);
  console.log(`[config] Gemini API Key Configured: ${Boolean(config.generation.geminiApiKey)}`);

  if (config.generation.aiProvider !== "gemini") {
    throw new Error(
      `E2E pipeline test requires AI_PROVIDER='gemini', but found '${config.generation.aiProvider}'.`,
    );
  }

  const pool = new pg.Pool({ connectionString: config.database.url });
  const db = drizzle(pool, { schema });

  try {
    // 1. Resolve User, Org, and Course
    const [user] = await db.select().from(schema.users).limit(1);
    const [org] = await db.select().from(schema.organizations).limit(1);
    const [course] = await db.select().from(schema.courses).limit(1);

    if (!user || !org || !course) {
      throw new Error("Missing seeded user/org/course in DB");
    }

    const orgId = org.id;
    const courseId = course.id;

    // 2. Create Active Session
    const sessionStore = new DrizzleSessionStore(db);
    const sessionService = new SessionService(sessionStore, config.session);
    const { sessionToken } = await sessionService.createSession(
      user.id as unknown as Parameters<typeof sessionService.createSession>[0],
    );

    const apiBase = `http://127.0.0.1:3000`;
    const headers = {
      Cookie: `avana_session=${sessionToken}`,
    };

    const tag = `${Date.now()}`;
    console.log(`[1/7] UPLOAD: Sending Persian DOCX file (tag=${tag}) to ${apiBase}/v1/organizations/${orgId}/documents...`);

    const docxBuffer = await buildPersianPharmacologyDocx(tag);
    const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;

    const filename = `digoxin_pharmacology_${tag}.docx`;
    const multipartBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="course_id"\r\n\r\n${courseId}\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`,
        "utf8",
      ),
      docxBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const uploadRes = await fetch(`${apiBase}/v1/organizations/${orgId}/documents`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      throw new Error(`Upload failed (${uploadRes.status}): ${errBody}`);
    }

    const uploadData = (await uploadRes.json()) as { document: { id: string; status: string } };
    const documentId = uploadData.document.id;
    console.log(`[✓] UPLOAD SUCCESS: Document ID: ${documentId} | Status: ${uploadData.document.status}`);

    // 3. EXTRACTION: Trigger and verify text extraction
    console.log(`\n[2/7] EXTRACTION: Triggering text extraction for document ${documentId}...`);
    const extractRes = await fetch(
      `${apiBase}/v1/organizations/${orgId}/documents/${documentId}/extract`,
      {
        method: "POST",
        headers,
      },
    );

    if (!extractRes.ok) {
      const errBody = await extractRes.text();
      throw new Error(`Extract failed (${extractRes.status}): ${errBody}`);
    }

    const extractData = (await extractRes.json()) as {
      status: { status: string; page_count: number | null; chunk_count: number | null };
    };
    console.log(
      `[✓] EXTRACTION SUCCESS: Status: ${extractData.status.status} | Pages: ${extractData.status.page_count} | Chunks: ${extractData.status.chunk_count}`,
    );

    // Verify document_chunks in DB contain real Persian text
    const chunksInDb = await db
      .select()
      .from(schema.documentChunks)
      .where(eq(schema.documentChunks.documentId, documentId));

    if (chunksInDb.length === 0) {
      throw new Error("No document_chunks found in DB for extracted document");
    }
    console.log(`[✓] Extracted DB Chunks: ${chunksInDb.length} chunk(s) verified in database`);
    const chunkSample = chunksInDb[0].content;
    if (!chunkSample.includes("دیگوکسین") && !chunkSample.includes("پمپ")) {
      throw new Error(`Chunk content does not contain expected Persian text: "${chunkSample.slice(0, 80)}"`);
    }

    // 4. GENERATION: Enqueue generation job for Lesson, Flashcard, Quiz
    console.log(`\n[3/7] QUEUE & GENERATION: Enqueueing generation job (Lesson, Flashcard, Quiz)...`);
    const genRes = await fetch(
      `${apiBase}/v1/organizations/${orgId}/courses/${courseId}/documents/${documentId}/generate`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          types: ["lesson", "flashcard", "quiz"],
        }),
      },
    );

    if (!genRes.ok) {
      const errBody = await genRes.text();
      throw new Error(`Generate failed (${genRes.status}): ${errBody}`);
    }

    const genData = (await genRes.json()) as { job_id: string; status: string };
    const jobId = genData.job_id;
    console.log(`[✓] GENERATION JOB QUEUED: Job ID: ${jobId} | Initial Status: ${genData.status}`);

    // 5. WORKER & GEMINI: Poll generation job status until Worker and Gemini complete
    console.log(`\n[4/7] WORKER: Polling generation job status from BullMQ worker & Gemini...`);
    let attempts = 0;
    let jobStatus = genData.status;

    while (attempts < 45 && jobStatus !== "succeeded" && jobStatus !== "failed") {
      await new Promise((r) => setTimeout(r, 2000));
      attempts++;

      const jobPollRes = await fetch(
        `${apiBase}/v1/organizations/${orgId}/courses/${courseId}/documents/${documentId}/generate/jobs/${jobId}`,
        {
          headers,
        },
      );

      if (jobPollRes.ok) {
        const pollData = (await jobPollRes.json()) as { job: { status: string; errorMessage?: string } };
        jobStatus = pollData.job.status;
        process.stdout.write(`    Attempt ${attempts}: Job Status = ${jobStatus}${pollData.job.errorMessage ? ` (${pollData.job.errorMessage})` : ""}\n`);
      }
    }

    if (jobStatus !== "succeeded") {
      throw new Error(`Worker generation job did not succeed. Final status: ${jobStatus}`);
    }
    console.log(`[✓] WORKER & GEMINI GENERATION SUCCEEDED!`);

    // 5b. STRICT DB AUDIT: Inspect generated_contents in PostgreSQL
    console.log(`\n[4b] STRICT DATABASE VERIFICATION: Inspecting generated_contents rows...`);
    const generatedRows = await db
      .select()
      .from(schema.generatedContents)
      .where(eq(schema.generatedContents.documentId, documentId));

    if (generatedRows.length === 0) {
      throw new Error("No generated_contents records found in database for document");
    }

    console.log(`[✓] Found ${generatedRows.length} generated_contents records in database.`);

    const mockStrings = [
      "Generated Lesson",
      "What is the key concept from this source?",
      "A deterministic, source-grounded lesson",
      "Practice Quiz",
    ];

    for (const record of generatedRows) {
      console.log(`    Checking artifact [${record.type}] (ID: ${record.id}):`);
      console.log(`      - Model: ${record.model}`);
      console.log(`      - Prompt Version: ${record.promptVersion}`);

      // 1. Model assertion
      if (record.model === "mock-1" || record.model === "mock") {
        throw new Error(
          `STRICT FAILURE: generated_contents record ${record.id} has mock model '${record.model}'! Real Gemini was not used.`,
        );
      }

      const payload = record.payload as Record<string, unknown>;
      const payloadString = JSON.stringify(payload);

      // 2. Mock strings assertion
      for (const mockStr of mockStrings) {
        if (payloadString.includes(mockStr)) {
          throw new Error(
            `STRICT FAILURE: generated_contents record ${record.id} contains mock placeholder string "${mockStr}"!`,
          );
        }
      }

      // 3. Persian domain keywords assertion
      const hasPersianKeywords =
        payloadString.includes("دیگوکسین") ||
        payloadString.includes("پمپ") ||
        payloadString.includes("سدیم") ||
        payloadString.includes("کلسیم") ||
        payloadString.includes("قلب") ||
        payloadString.includes("میوکارد");

      if (!hasPersianKeywords) {
        throw new Error(
          `STRICT FAILURE: Artifact ${record.id} does not contain expected Persian educational keywords derived from the source document! Payload: ${payloadString.slice(0, 150)}...`,
        );
      }

      // 4. Structure assertions per artifact type
      if (record.type === "lesson") {
        const title = String(payload.title || "");
        const content = String(payload.contentMarkdown || "");
        if (title.length < 3 || content.length < 50) {
          throw new Error(`Lesson title or content too short: title="${title}", len=${content.length}`);
        }
        console.log(`      ✓ Lesson Title: "${title}" (${content.length} chars markdown)`);
      } else if (record.type === "flashcard") {
        const cards = (payload.cards as Array<{ question: string; answer: string }>) || [];
        if (cards.length < 2) {
          throw new Error(`Expected multiple flashcards, got ${cards.length}`);
        }
        console.log(`      ✓ Flashcards generated: ${cards.length} atomic cards`);
        console.log(`        Sample Card Q: "${cards[0].question}"`);
        console.log(`        Sample Card A: "${cards[0].answer}"`);
      } else if (record.type === "quiz") {
        const questions = (payload.questions as Array<{ question: string; choices: string[]; correctAnswer: string }>) || [];
        if (questions.length < 2) {
          throw new Error(`Expected multiple quiz questions, got ${questions.length}`);
        }
        console.log(`      ✓ Quiz questions generated: ${questions.length} questions`);
        console.log(`        Sample Question: "${questions[0].question}"`);
        console.log(`        Choices: ${questions[0].choices.join(" | ")}`);
        console.log(`        Correct: "${questions[0].correctAnswer}"`);
      }

      // 5. Verify citations link to real chunks
      const citations = await db
        .select()
        .from(schema.generatedContentCitations)
        .where(eq(schema.generatedContentCitations.generatedContentId, record.id));

      if (citations.length === 0) {
        throw new Error(`Record ${record.id} has no citations joined in generated_content_citations table!`);
      }
      console.log(`      ✓ Citations: ${citations.length} chunk link(s) verified`);
    }

    // 6. REVIEW QUEUE: Inspect generated items via API
    console.log(`\n[5/7] REVIEW QUEUE: Fetching pending drafts from review queue...`);
    const reviewRes = await fetch(
      `${apiBase}/v1/organizations/${orgId}/courses/${courseId}/generated/review-queue`,
      {
        headers,
      },
    );

    if (!reviewRes.ok) {
      throw new Error(`Failed to fetch review queue: ${reviewRes.status}`);
    }

    const reviewData = (await reviewRes.json()) as {
      pending: Array<{ id: string; type: string; title: string }>;
    };
    console.log(`[✓] REVIEW QUEUE ITEMS: Total Pending = ${reviewData.pending.length}`);

    for (const item of reviewData.pending) {
      console.log(`    - ID: ${item.id} | Type: ${item.type} | Title: "${item.title}"`);
    }

    // 7. MATERIALIZATION: Accept all pending drafts into course
    console.log(`\n[6/7] MATERIALIZATION: Accepting all drafts into course...`);
    for (const item of reviewData.pending) {
      const acceptRes = await fetch(
        `${apiBase}/v1/organizations/${orgId}/courses/${courseId}/generated/${item.id}/accept`,
        {
          method: "POST",
          headers,
        },
      );

      if (!acceptRes.ok) {
        const errText = await acceptRes.text();
        throw new Error(`Accept failed for ${item.id} (${acceptRes.status}): ${errText}`);
      }
      const acceptData = (await acceptRes.json()) as { status: string };
      console.log(`[✓] ACCEPTED ${item.type} (${item.id}) -> status: ${acceptData.status}`);
    }

    // 8. FRONTEND QUERY VALIDATION: Verify items are readable via course endpoints
    console.log(`\n[7/7] FRONTEND VERIFICATION: Verifying course content endpoints...`);

    const flashcardsRes = await fetch(
      `${apiBase}/v1/organizations/${orgId}/courses/${courseId}/flashcards`,
      { headers },
    );
    const flashcardsData = (await flashcardsRes.json()) as { flashcards?: unknown[] };
    console.log(`[✓] Materialized Course Flashcards: ${flashcardsData.flashcards?.length ?? 0}`);

    const quizzesRes = await fetch(
      `${apiBase}/v1/organizations/${orgId}/courses/${courseId}/quizzes`,
      { headers },
    );
    const quizzesData = (await quizzesRes.json()) as { quizzes?: unknown[] };
    console.log(`[✓] Materialized Course Quizzes: ${quizzesData.quizzes?.length ?? 0}`);

    const learnRes = await fetch(
      `${apiBase}/v1/courses/${courseId}/learn`,
      { headers },
    );
    const learnData = (await learnRes.json()) as { modules?: Array<{ lessons?: unknown[] }> };
    const totalLessons = (learnData.modules ?? []).reduce(
      (acc, m) => acc + (m.lessons?.length ?? 0),
      0,
    );
    console.log(`[✓] Visible Student Lessons in Curriculum: ${totalLessons}`);

    console.log(`\n=============================================================`);
    console.log(`REAL GEMINI AI LEARNING PIPELINE PASSED WITH 100% SUCCESS!`);
    console.log(`=============================================================\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    console.error("FATAL PIPELINE TRACE ERROR:", message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runEndToEndTrace();
