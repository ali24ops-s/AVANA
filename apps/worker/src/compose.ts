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
  DrizzleGenerationProgressStore,
  GenerationProgressService,
} from "@avana/api/generation/drizzle-stores";
import { DrizzleCourseStore } from "@avana/api/courses/drizzle-stores";
import { GenerationRecoveryService } from "@avana/api/generation/generation-recovery-service";
import {
  createModelGateway,
  GapGPTModelGateway,
  OpenRouterModelGateway,
  type ModelGateway,
} from "@avana/api/generation/gateway";
import { GenerationService } from "@avana/api/generation/generation-service";
import { DrizzleAuditStore } from "@avana/api/observability/drizzle-stores";
import { AuditService } from "@avana/api/observability/audit-service";
import { DrizzleNotificationStore } from "@avana/api/notifications/drizzle-stores";
import { NotificationService } from "@avana/api/notifications/notification-service";
import { DrizzleWalletStore } from "@avana/api/wallet/wallet-store";
import { WalletService } from "@avana/api/wallet/wallet-service";
import { TelegramClient } from "@avana/api/observability/telegram-client";
import { AdminAlertService } from "@avana/api/observability/admin-alert-service";
import type { WorkerConfig } from "./config.js";

export interface WorkerDependencies {
  adminGenerationService: GenerationService;
  userGenerationService: GenerationService;
  generationService: GenerationService;
  generationJobStore: DrizzleGenerationJobStore;
  generationChunkStore: DrizzleGenerationChunkStore;
  generationProgressStore?: DrizzleGenerationProgressStore;
  generationProgressService?: GenerationProgressService;
  recoveryService: GenerationRecoveryService;
  walletService: WalletService;
  walletStore: DrizzleWalletStore;
  adminGateway: ModelGateway;
  userGateway: ModelGateway;
  gateway: ModelGateway;
  adminAlertService: AdminAlertService;
  close: () => Promise<void>;
}

/**
 * Build the worker's dependency graph.
 */
export async function composeWorker(
  config: WorkerConfig,
  customDb?: { db: ReturnType<typeof createDbClient>["db"]; close: () => Promise<void> },
): Promise<WorkerDependencies> {
  const { db, close } = customDb ?? createDbClient(config.database.url);

  // Stores (Drizzle-backed, matching production API).
  const courseStore = new DrizzleCourseStore(db);
  const documentStore = new DrizzleDocumentStore(db);
  const documentChunkStore = new DrizzleDocumentChunkStore(db);
  const generatedContentStore = new DrizzleGeneratedContentStore(db);
  const generatedContentCitationStore =
    new DrizzleGeneratedContentCitationStore(db);
  const generationJobStore = new DrizzleGenerationJobStore(db);
  const generationChunkStore = new DrizzleGenerationChunkStore(db);
  const walletStore = new DrizzleWalletStore(db);

  // Admin Model gateway: strictly Gemini with multi-key pool, zero fallback to external providers.
  const adminProvider = config.generation.aiProvider === "mock" ? "mock" : "gemini";
  const adminGateway: ModelGateway = createModelGateway({
    provider: adminProvider,
    enableFallback: false,
    geminiApiKey: config.generation.geminiApiKey,
    geminiApiKeys: config.generation.geminiApiKeys,
    geminiModel: config.generation.geminiModel,
  });

  // User-facing content generation gateway: GapGPT (deepseek-v4-flash) or OpenRouter
  // Zero fallback to Gemini, Cloudflare, or other external providers.
  const userGateway: ModelGateway =
    config.userAi.provider === "openrouter"
      ? new OpenRouterModelGateway({
          apiKey: config.userAi.openrouterApiKey,
          modelName: config.userAi.openrouterModel,
          httpReferer: config.userAi.httpReferer,
          appTitle: config.userAi.appTitle,
        })
      : new GapGPTModelGateway({
          apiKey: config.userAi.gapgptApiKey,
          baseUrl: config.userAi.gapgptBaseUrl,
          modelName: config.userAi.gapgptModel,
        });

  // Audit service.
  const auditStore = new DrizzleAuditStore(db);
  const auditService = new AuditService(auditStore);

  // Operational Telegram Alerts
  const telegramClient = new TelegramClient({
    botToken: config.telegram?.botToken,
    adminChatId: config.telegram?.adminChatId,
    timeoutMs: config.telegram?.timeoutMs ?? 5000,
    apiBaseUrl: config.telegram?.apiBaseUrl,
  });
  const adminAlertService = new AdminAlertService({
    enabled: config.telegram?.enabled ?? false,
    telegramClient,
  });

  // Tap AuditService for worker-originated generation failures
  auditService.addListener((events) => {
    for (const event of events) {
      if (event.action === "generation.failed") {
        void adminAlertService.notifyCritical(
          "generation.failed",
          "شکست نهایی فرآیند تولید محتوا در ورکر",
          {
            details: {
              documentId: event.entityId,
              errorCode: String(event.details?.errorCode ?? "unknown"),
              retryCount: Number(event.details?.retryCount ?? 0),
            },
            cooldownKey: `worker:generation.failed:${event.entityId}:${event.details?.errorCode}`,
          },
        );
      }
    }
  });

  // Wallet service for user balance mutations and generation debit refunds.
  const walletService = new WalletService(walletStore, auditService);

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
    undefined,
    undefined,
    walletService,
    walletStore,
  );

  const notificationStore = new DrizzleNotificationStore(db);
  const notificationService = new NotificationService(notificationStore);

  const generationProgressStore = new DrizzleGenerationProgressStore(db);
  const generationProgressService = new GenerationProgressService(generationProgressStore);

  // Admin GenerationService (strictly Gemini)
  const adminGenerationService = new GenerationService(
    generatedContentStore,
    generatedContentCitationStore,
    adminGateway,
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
    generationProgressService,
  );
  adminGenerationService.setNotificationService(notificationService);

  // User GenerationService (strictly OpenRouter / DeepSeek)
  const userGenerationService = new GenerationService(
    generatedContentStore,
    generatedContentCitationStore,
    userGateway,
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
    generationProgressService,
  );
  userGenerationService.setNotificationService(notificationService);

  return {
    adminGenerationService,
    userGenerationService,
    generationService: userGenerationService,
    generationJobStore,
    generationChunkStore,
    generationProgressStore,
    generationProgressService,
    recoveryService,
    walletService,
    walletStore,
    adminGateway,
    userGateway,
    gateway: userGateway,
    adminAlertService,
    close,
  };
}
