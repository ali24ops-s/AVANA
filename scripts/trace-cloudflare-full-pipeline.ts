/**
 * End-to-End AVANA Pipeline Trace using Cloudflare Workers AI with GLM-4.7-Flash.
 *
 * Runs the full generation pipeline through AVANA's GenerationService:
 * 1. Stage 1: Content Planning
 * 2. Stage 2: Lessons Generation
 * 3. Stage 3: Flashcards Generation
 * 4. Stage 4: Quiz Generation
 *
 * Verifies:
 * - Integration through ModelGateway abstraction
 * - Cloudflare Workers AI + @cf/zai-org/glm-4.7-flash live call
 * - Proper structured output parsing in GenerationService
 * - Materialization of Lessons, Flashcards, and Quizzes into AVANA stores
 *
 * Security: NEVER logs secrets or tokens.
 */

import { loadMonorepoEnv } from "@avana/config";
import { CloudflareModelGateway, DEFAULT_CLOUDFLARE_AI_MODEL } from "../apps/api/src/modules/generation/gateway/cloudflare.js";
import { GenerationService } from "../apps/api/src/modules/generation/generation-service.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../apps/api/src/modules/generation/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../apps/api/src/modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../apps/api/src/observability/test/in-memory-stores.js";
import { AuditService } from "../apps/api/src/observability/audit-service.js";
import {
  defaultPolicy,
  type Actor,
  type CourseId,
  type DocumentId,
  type DocumentChunkId,
  type OrganizationId,
  type UserId,
} from "@avana/domain";

loadMonorepoEnv();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.CLOUDFLARE_AI_MODEL || DEFAULT_CLOUDFLARE_AI_MODEL;

if (!accountId || !apiToken) {
  console.error("[cloudflare] Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in .env");
  process.exit(1);
}

async function traceAvanaPipeline() {
  console.log("================================================================");
  console.log("  AVANA — Full End-to-End Pipeline Trace with Cloudflare AI");
  console.log("================================================================");
  console.log(`[cloudflare-pipeline] Model: ${model}`);
  console.log("[cloudflare-pipeline] Initializing ModelGateway and GenerationService...");

  const gateway = new CloudflareModelGateway({
    accountId,
    apiToken,
    modelName: model,
    timeoutMs: 180_000,
  });

  const docStore = new InMemoryDocumentStore();
  const chunkStore = new InMemoryDocumentChunkStore();
  const genStore = new InMemoryGeneratedContentStore();
  const citStore = new InMemoryGeneratedContentCitationStore();
  const auditStore = new InMemoryAuditStore();
  const auditService = new AuditService(auditStore);

  const generationService = new GenerationService(
    genStore,
    citStore,
    gateway,
    docStore,
    chunkStore,
    defaultPolicy,
    auditService,
  );

  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const docId = "00000000-0000-0000-0000-000000000003" as DocumentId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as UserId,
    role: "organization_admin",
  };

  await docStore.create({
    id: docId,
    organizationId: orgId,
    courseId,
    uploadedBy: actor.userId,
    filename: "cardiology_pharmacology.pdf",
    originalName: "cardiology_pharmacology.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10240,
    contentHash: "hash-cf-test",
    storagePath: "/storage/cardiology_pharmacology.pdf",
    extractedText: "فارماکولوژی داروهای قلبی و عروقی",
    pageCount: 4,
    status: "extracted",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await chunkStore.createMany([
    {
      id: "chunk-cf-1" as DocumentChunkId,
      documentId: docId,
      organizationId: orgId,
      sequence: 0,
      heading: "داروهای مسدودکننده گیرنده بتا (Beta-Blockers)",
      content: `داروهای بتا بلاکر با مهار رقابتی اثر کاتکول‌آمین‌ها بر گیرنده‌های بتا-۱ و بتا-۲ عمل می‌کنند.
داروهای اختصاصی بتا-۱ (کاردیوسلکتیو) مانند متوپرولول و آتنولول بر قلب اثر گذاشته و ضربان قلب و فشار خون را کاهش می‌دهند.
داروهای غیراختصاصی مانند پروپرانولول هر دو گیرنده را مهار کرده و در بیماران آسم و COPD کنتراندیکه مطلق هستند به دلیل ایجاد برونکواسپاسم.
کاربردهای بالینی شامل درمان پرفشاری خون، آنژین صدری، کنترل ریتم در فیبریلاسیون دهلیزی و کاهش مورتالیتی در نارسایی قلبی مزمن (کارودیلول، متوپرولول سوکسینات، بیزوپرولول) است.`,
      startPage: 1,
      endPage: 2,
      tokenEstimate: 120,
      contentHash: "hash-chunk-1",
      createdAt: new Date().toISOString(),
    },
    {
      id: "chunk-cf-2" as DocumentChunkId,
      documentId: docId,
      organizationId: orgId,
      sequence: 1,
      heading: "مهارکننده‌های آنزیم تبدیل‌کننده آنژیوتنسین (ACE Inhibitors) و ARB",
      content: `داروهای ACE Inhibitor مانند کاپتوپریل، انالاپریل و لیزینوپریل از تبدیل آنژیوتنسین I به آنژیوتنسین II جلوگیری می‌کنند و سطح برادی‌کینین را افزایش می‌دهند.
مهم‌ترین عارضه جانبی ACEIها سرفه خشک مزمن و آنژیوادم به علت تجمع برادی‌کینین است.
داروهای ARB مانند لوزارتان و والزارتان مستقیماً گیرنده AT1 آنژیوتنسین II را مهار کرده و برادی‌کینین را افزایش نمی‌دهند، بنابراین ایجاد سرفه نمی‌کنند.
هر دو دسته در بارداری کنتراندیکه مطلق هستند (تراتوژنیک). در بیماران با تنگی دوطرفه شریان کلیوی باعث نارسایی حاد کلیه می‌شوند و هیپرکالمی ایجاد می‌کنند.`,
      startPage: 3,
      endPage: 4,
      tokenEstimate: 130,
      contentHash: "hash-chunk-2",
      createdAt: new Date().toISOString(),
    },
  ]);

  console.log("[cloudflare-pipeline] Document and 2 source chunks created.");
  console.log("[cloudflare-pipeline] Triggering generateForDocument (lesson, flashcard, quiz)...");

  const startTime = Date.now();
  const result = await generationService.generateForDocument(actor, orgId, docId, {
    types: ["lesson", "flashcard", "quiz"],
    promptVersion: "v1",
    courseId,
  });
  const totalElapsed = Date.now() - startTime;

  console.log("\n================================================================");
  console.log("  PIPELINE EXECUTION COMPLETE");
  console.log("================================================================");
  console.log(`[cloudflare-pipeline] Total elapsed time: ${totalElapsed}ms`);
  const totalInputTokens = result.contents.reduce((sum, item) => sum + (item.tokenUsage?.inputTokens || 0), 0);
  const totalOutputTokens = result.contents.reduce((sum, item) => sum + (item.tokenUsage?.outputTokens || 0), 0);

  console.log(`[cloudflare-pipeline] Total input tokens: ${totalInputTokens}`);
  console.log(`[cloudflare-pipeline] Total output tokens: ${totalOutputTokens}`);

  for (const item of result.contents) {
    console.log(`\n--- Generated Item: [${item.type.toUpperCase()}] ID: ${item.id} ---`);
    console.log(`Model: ${item.model}`);
    console.log(`Token usage: ${JSON.stringify(item.tokenUsage)}`);

    if (item.type === "lesson") {
      const lessonPayload = item.payload as {
        kind?: string;
        title?: string;
        contentMarkdown?: string;
        topics?: Array<{ title?: string; contentMarkdown?: string }>;
      };
      console.log(`Lesson Title: ${lessonPayload.title || "N/A"}`);
      const md = lessonPayload.contentMarkdown || lessonPayload.topics?.[0]?.contentMarkdown || "";
      console.log(`Lesson Markdown Preview (${md.length} chars):\n${md.slice(0, 300)}...`);
    } else if (item.type === "flashcard") {
      const flashcardPayload = item.payload as {
        cards?: Array<{ question?: string; answer?: string }>;
      };
      console.log(`Total Flashcards: ${flashcardPayload.cards?.length || 0}`);
      flashcardPayload.cards?.slice(0, 3).forEach((c, idx) => {
        console.log(`  Card ${idx + 1}: Q: ${c.question} | A: ${c.answer}`);
      });
    } else if (item.type === "quiz") {
      const quizPayload = item.payload as {
        questions?: Array<{ question?: string; correctAnswer?: string }>;
      };
      console.log(`Total Quiz Questions: ${quizPayload.questions?.length || 0}`);
      quizPayload.questions?.slice(0, 3).forEach((q, idx) => {
        console.log(`  Q ${idx + 1}: ${q.question} -> Correct: ${q.correctAnswer}`);
      });
    }
  }

  console.log("\n================================================================");
  console.log("  AVANA END-TO-END GENERATION VERIFIED WITH CLOUDFLARE WORKERS AI");
  console.log("================================================================");
}

traceAvanaPipeline().catch((err) => {
  console.error("[cloudflare-pipeline] Execution failed:", err);
  process.exit(1);
});
