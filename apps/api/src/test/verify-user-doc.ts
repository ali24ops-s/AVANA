import { GenerationService } from "../modules/generation/generation-service.js";
import { createModelGateway } from "../modules/generation/gateway/index.js";
import { createDbClient } from "@avana/database/client";
import { loadApiConfig } from "../config.js";
import {
  DrizzleDocumentStore,
  DrizzleDocumentChunkStore,
} from "../modules/learning/drizzle-stores.js";
import {
  DrizzleGeneratedContentStore,
  DrizzleGeneratedContentCitationStore,
  DrizzleGenerationChunkStore,
} from "../modules/generation/drizzle-stores.js";
import { defaultPolicy, type CourseId, type DocumentId, type OrganizationId, type UserId } from "@avana/domain";
import { DrizzleOrganizationStore } from "../modules/organizations/drizzle-stores.js";

async function testRealGemini() {
  const config = loadApiConfig();
  const { db, close } = createDbClient(config.database.url);
  const docStore = new DrizzleDocumentStore(db);
  const chunkStore = new DrizzleDocumentChunkStore(db);
  const genStore = new DrizzleGeneratedContentStore(db);
  const citStore = new DrizzleGeneratedContentCitationStore(db);
  const orgStore = new DrizzleOrganizationStore(db);
  const generationChunkStore = new DrizzleGenerationChunkStore(db);

  const adminProvider = config.generation.aiProvider === "mock" ? "mock" : "gemini";
  console.log("Configured admin AI provider:", adminProvider, "model:", config.generation.geminiModel);
  const gateway = createModelGateway({
    provider: adminProvider,
    enableFallback: false,
    geminiApiKey: config.generation.geminiApiKey,
    geminiApiKeys: config.generation.geminiApiKeys,
    geminiModel: config.generation.geminiModel,
  });

  const service = new GenerationService(
    genStore,
    citStore,
    gateway,
    docStore,
    chunkStore,
    defaultPolicy,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    generationChunkStore,
  );

  const docId = "86c1cdb8-5fdf-4b20-b01c-4161a5b3d0a1" as DocumentId;
  const orgId = "b4a0b464-16db-4087-92b7-163a1e6f6776" as OrganizationId;
  const courseId = "90b7d8c1-abb1-4ca0-b313-19966bd39d46" as CourseId;

  const doc = await docStore.findByIdForOrganization(docId, orgId);
  if (doc) {
    await docStore.update({ ...doc, status: "extracted" });
  }

  console.log("Calling Gemini for real user document:", docId);
  const result = await service.generateForDocument(
    { userId: "79bda286-08a4-4a16-9340-4106864e0732" as UserId, role: "organization_admin", organizationId: orgId },
    orgId,
    docId,
    {
      types: ["lesson"],
      courseId,
      force: true,
      generationContext: "admin",
    },
  );

  console.log("\n================ REGENERATION RESULT ================");
  console.log("Gemini result count:", result.contents.length);
  for (const c of result.contents) {
    console.log("=== TYPE:", c.type, "MODEL:", c.model, "===");
    if (c.type === "lesson") {
      const payload = c.payload as any;
      console.log("Root payload chemicalStructures count:", (payload.chemicalStructures || []).length);
      console.log("Sessions count:", (payload.sessions || []).length);
      if (payload.sessions) {
        payload.sessions.forEach((s: any, idx: number) => {
          console.log(`\n--- Session ${idx + 1}: ${s.title} ---`);
          console.log(`Chemical structures metadata count: ${(s.chemicalStructures || []).length}`);
          if (s.chemicalStructures && s.chemicalStructures.length > 0) {
            console.log("Chemical structures metadata:", JSON.stringify(s.chemicalStructures, null, 2));
          }
          const matches = s.contentMarkdown.match(/```(chemical|smiles)[\s\S]*?```/g) || [];
          console.log(`Chemical blocks in markdown count: ${matches.length}`);
          matches.forEach((m: string, mIdx: number) => {
            console.log(`\n[Block ${mIdx + 1}]:\n${m}`);
          });
        });
      }
    }
  }

  await close();
  process.exit(0);
}

testRealGemini().catch((err) => {
  console.error("Error during generation:", err);
  process.exit(1);
});
