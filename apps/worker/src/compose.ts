/**
 * Worker composition root.
 *
 * Wires the same store/service/gateway stack the API uses, so the worker
 * calls the existing `GenerationService` unchanged (no duplication). The
 * worker uses Drizzle-backed stores (PostgreSQL) and the config-gated mock
 * gateway — matching the API's production composition root.
 *
 * The worker does NOT wire any HTTP routes. It only needs the stores, the
 * gateway, the audit service, and the GenerationService to process jobs.
 */

import { createDbClient } from "@avana/database/client";
import { defaultPolicy } from "@avana/domain";
import {
  DrizzleDocumentStore,
  DrizzleDocumentChunkStore,
} from "@avana/api/learning/drizzle-stores";
import {
  DrizzleGeneratedContentStore,
  DrizzleGeneratedContentCitationStore,
  DrizzleGenerationJobStore,
} from "@avana/api/generation/drizzle-stores";
import { createModelGateway } from "@avana/api/generation/gateway";
import { GenerationService } from "@avana/api/generation/generation-service";
import { DrizzleAuditStore } from "@avana/api/observability/drizzle-stores";
import { AuditService } from "@avana/api/observability/audit-service";
import type { WorkerConfig } from "./config.js";

export interface WorkerDependencies {
  generationService: GenerationService;
  generationJobStore: DrizzleGenerationJobStore;
  close: () => Promise<void>;
}

/**
 * Build the worker's dependency graph.
 */
export async function composeWorker(
  config: WorkerConfig,
): Promise<WorkerDependencies> {
  const { db, close } = createDbClient(config.database.url);

  // Stores (Drizzle-backed, matching production API).
  const documentStore = new DrizzleDocumentStore(db);
  const documentChunkStore = new DrizzleDocumentChunkStore(db);
  const generatedContentStore = new DrizzleGeneratedContentStore(db);
  const generatedContentCitationStore =
    new DrizzleGeneratedContentCitationStore(db);
  const generationJobStore = new DrizzleGenerationJobStore(db);

  // Model gateway (mock provider unless a real provider is configured).
  const gateway = createModelGateway({
    provider: config.generation.aiProvider,
    geminiApiKey: config.generation.geminiApiKey,
    geminiModel: config.generation.geminiModel,
    cloudflareAccountId: config.generation.cloudflareAccountId,
    cloudflareApiToken: config.generation.cloudflareApiToken,
    cloudflareAiModel: config.generation.cloudflareAiModel,
  });

  // Audit service.
  const auditStore = new DrizzleAuditStore(db);
  const auditService = new AuditService(auditStore);

  // Reuse the existing worker-ready GenerationService unchanged.
  const generationService = new GenerationService(
    generatedContentStore,
    generatedContentCitationStore,
    gateway,
    documentStore,
    documentChunkStore,
    defaultPolicy,
    auditService,
  );

  return {
    generationService,
    generationJobStore,
    close,
  };
}
