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
  console.error("Missing Cloudflare credentials in environment.");
  process.exit(1);
}

async function verifyAvanaEndToEnd() {
  console.log("================================================================");
  console.log("  AVANA — Real End-to-End Generation via Cloudflare Gateway");
  console.log("================================================================");

  const gateway = new CloudflareModelGateway({
    accountId,
    apiToken,
    modelName: model,
    timeoutMs: 120_000,
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
    filename: "pharmacology_summary.pdf",
    originalName: "pharmacology_summary.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2048,
    contentHash: "hash-verify-cf",
    storagePath: "/storage/pharmacology_summary.pdf",
    extractedText: "فارماکولوژی بتا بلاکرها",
    pageCount: 1,
    status: "extracted",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await chunkStore.createMany([
    {
      id: "chunk-1" as DocumentChunkId,
      documentId: docId,
      organizationId: orgId,
      sequence: 0,
      heading: "داروهای بتا بلاکر",
      content: `بتا بلاکرها اثر سمپاتیک را بر قلب کاهش می‌دهند و برای آنژین صدری، پرفشاری خون و نارسایی قلبی استفاده می‌شوند.
بتابلاکرهای کاردیوسلکتیو مانند متوپرولول عمدتا گیرنده بتا-۱ را مهار می‌کنند.
بتابلاکرهای غیرسلکتیو مانند پروپرانولول در بیماران آسم کنتراندیکه هستند.`,
      startPage: 1,
      endPage: 1,
      tokenEstimate: 60,
      contentHash: "hash-chunk-1",
      createdAt: new Date().toISOString(),
    },
  ]);

  console.log("[avana-verification] Triggering GenerationService.generateForDocument (type: flashcard)...");
  const result = await generationService.generateForDocument(actor, orgId, docId, {
    types: ["flashcard"],
    promptVersion: "v1",
    courseId,
  });

  console.log(`[avana-verification] Generated items: ${result.contents.length}`);
  const storedItems = await genStore.listByDocument(docId, orgId);
  console.log(`[avana-verification] Stored items in database: ${storedItems.length}`);

  for (const item of result.contents) {
    console.log(`\nItem Type: ${item.type}`);
    console.log(`Item ID: ${item.id}`);
    console.log(`Model: ${item.model}`);
    console.log(`Token usage: ${JSON.stringify(item.tokenUsage)}`);
    console.log(`Payload preview: ${JSON.stringify(item.payload).slice(0, 300)}...`);
  }

  if (result.contents.length > 0 && storedItems.length > 0) {
    console.log("\n================================================================");
    console.log("  AVANA END-TO-END GENERATION VERIFIED: SUCCESS");
    console.log("================================================================");
  } else {
    throw new Error("No items generated or stored in AVANA store.");
  }
}

verifyAvanaEndToEnd().catch((err) => {
  console.error("AVANA generation failed:", err);
  process.exit(1);
});
