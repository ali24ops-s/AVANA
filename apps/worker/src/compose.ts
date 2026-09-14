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
  DrizzleGenerationChunkStore,
} from "@avana/api/generation/drizzle-stores";
import { DrizzleCourseStore } from "@avana/api/courses/drizzle-stores";
import { GenerationRecoveryService } from "@avana/api/generation/generation-recovery-service";
import {
  OpenRouterModelGateway,
  type ModelGateway,
} from "@avana/api/generation/gateway";
import { GenerationService } from "@avana/api/generation/generation-service";
import { DrizzleAuditStore } from "@avana/api/observability/drizzle-stores";
import { AuditService } from "@avana/api/observability/audit-service";
import { DrizzleNotificationStore } from "@avana/api/notifications/drizzle-stores";
import { NotificationService } from "@avana/api/notifications/notification-service";
import type { WorkerConfig } from "./config.js";

export interface WorkerDependencies {
  generationService: GenerationService;
  generationJobStore: DrizzleGenerationJobStore;
  generationChunkStore: DrizzleGenerationChunkStore;
  recoveryService: GenerationRecoveryService;
  gateway: ModelGateway;
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
  const courseStore = new DrizzleCourseStore(db);
  const documentStore = new DrizzleDocumentStore(db);
  const documentChunkStore = new DrizzleDocumentChunkStore(db);
  const generatedContentStore = new DrizzleGeneratedContentStore(db);
  const generatedContentCitationStore =
    new DrizzleGeneratedContentCitationStore(db);
  const generationJobStore = new DrizzleGenerationJobStore(db);
  const generationChunkStore = new DrizzleGenerationChunkStore(db);

  // User-facing content generation gateway: OpenRouter (DeepSeek)
  // Zero fallback to Gemini or Cloudflare.
  const gateway: ModelGateway = new OpenRouterModelGateway({
    apiKey: config.userAi.openrouterApiKey,
    modelName: config.userAi.openrouterModel,
    httpReferer: config.userAi.httpReferer,
    appTitle: config.userAi.appTitle,
  });

  // Audit service.
  const auditStore = new DrizzleAuditStore(db);
  const auditService = new AuditService(auditStore);

  // Recovery service for automatic startup and background stale reconciliation.
  const recoveryService = new GenerationRecoveryService(
    db,
    courseStore,
    documentStore,
    generatedContentStore,
    documentChunkStore,
    generationJobStore,
    generationChunkStore,
    auditService,
  );

  // Reuse the existing worker-ready GenerationService unchanged.
  const generationService = new GenerationService(
    generatedContentStore,
    generatedContentCitationStore,
    gateway,
    documentStore,
    documentChunkStore,
    defaultPolicy,
    auditService,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    generationChunkStore,
    generationJobStore,
  );

  const notificationStore = new DrizzleNotificationStore(db);
  const notificationService = new NotificationService(notificationStore);
  generationService.setNotificationService(notificationService);

  return {
    generationService,
    generationJobStore,
    generationChunkStore,
    recoveryService,
    gateway,
    close,
  };
}
