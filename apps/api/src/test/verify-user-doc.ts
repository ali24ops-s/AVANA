import { GenerationService } from "../modules/generation/generation-service.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { createDbClient } from "@avana/database/client";
import {
  DrizzleDocumentStore,
  DrizzleDocumentChunkStore,
} from "../modules/learning/drizzle-stores.js";
import {
  DrizzleGeneratedContentStore,
  DrizzleGeneratedContentCitationStore,
} from "../modules/generation/drizzle-stores.js";
import { defaultPolicy, type CourseId, type DocumentId, type OrganizationId, type UserId } from "@avana/domain";
import { DrizzleOrganizationStore } from "../modules/organizations/drizzle-stores.js";

async function testRealGemini() {
  const { db, close } = createDbClient(process.env.DATABASE_URL!);
  const docStore = new DrizzleDocumentStore(db);
  const chunkStore = new DrizzleDocumentChunkStore(db);
  const genStore = new DrizzleGeneratedContentStore(db);
  const citStore = new DrizzleGeneratedContentCitationStore(db);
  const orgStore = new DrizzleOrganizationStore(db);

  console.log("Using API key present:", !!process.env.GEMINI_API_KEY, "model: gemini-3.6-flash");
  const gateway = new GeminiModelGateway({
    apiKey: process.env.GEMINI_API_KEY!,
    modelName: "gemini-3.6-flash",
  });

  const service = new GenerationService(
    genStore,
    citStore,
    gateway,
    docStore,
    chunkStore,
    defaultPolicy,
    undefined,
    orgStore,
  );

  const docId = "a2a8caed-5f6c-460a-8324-3802c176bf46" as DocumentId;
  const orgId = "b4a0b464-16db-4087-92b7-163a1e6f6776" as OrganizationId;
  const courseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e" as CourseId;

  const doc = await docStore.findByIdForOrganization(docId, orgId);
  if (doc) {
    await docStore.update({ ...doc, status: "extracted" });
  }

  console.log("Calling Gemini for real user document:", docId);
  const result = await service.generateForDocument(
    { userId: "80d0c7fa-94fe-4f30-ba2a-90f04080e324" as UserId, role: "organization_admin" },
    orgId,
    docId,
    {
      types: ["lesson", "flashcard", "quiz"],
      promptVersion: "v2-gemini-live",
      courseId,
    },
  );

  console.log("Gemini result count:", result.contents.length);
  for (const c of result.contents) {
    console.log("=== TYPE:", c.type, "MODEL:", c.model, "===");
    console.log(JSON.stringify(c.payload, null, 2));
  }

  await close();
}

testRealGemini().catch(console.error);
