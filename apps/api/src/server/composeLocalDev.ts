/**
 * Local Development Composition Root.
 *
 * Wires in-memory stores for local development.
 * This module is ONLY imported when NODE_ENV=development.
 *
 * Sprint 1.5: Enables running the full API locally without a database.
 * Sprint 2: Added learning stores (ModuleStore, LessonStore, ProgressStore).
 */

import { InMemorySessionStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryStudySessionStore,
  InMemoryFlashcardStudySessionStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryAssistantConversationStore } from "../modules/study/index.js";
import {
  createModelGateway,
  InMemoryGenerationQueue,
  GenerationService,
  type ModelGateway,
} from "../modules/generation/index.js";
import { defaultPolicy } from "@avana/domain";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/index.js";
import { seedLocalDevData } from "../dev/seed.js";
import type { V1RouteOptions } from "../routes/v1.js";
import type { ApiConfig } from "../config.js";

export interface ComposeLocalDevOptions {
  gateway?: ModelGateway;
}

export interface LocalDevDependencies {
  v1Options: V1RouteOptions;
  auditService: AuditService;
}

/**
 * Create all in-memory stores and wire them into V1RouteOptions.
 *
 * This is the development-only composition root. In production,
 * a different composition root would wire Drizzle-backed stores.
 */
export async function composeLocalDev(
  config: ApiConfig,
  options?: ComposeLocalDevOptions,
): Promise<LocalDevDependencies> {
  // In-memory stores
  const sessionStore = new InMemorySessionStore();
  const organizationStore = new InMemoryOrganizationStore();
  const userStore = new InMemoryUserStore(organizationStore);
  const courseStore = new InMemoryCourseStore();
  const moduleStore = new InMemoryModuleStore();
  const lessonStore = new InMemoryLessonStore();
  const progressStore = new InMemoryProgressStore();
  const documentStore = new InMemoryDocumentStore();
  const documentChunkStore = new InMemoryDocumentChunkStore();
  const generatedContentStore = new InMemoryGeneratedContentStore();
  const generatedContentCitationStore =
    new InMemoryGeneratedContentCitationStore();
  const generationJobStore = new InMemoryGenerationJobStore();

  // Study stores
  const flashcardStore = new InMemoryFlashcardStore();
  const flashcardReviewStore = new InMemoryFlashcardReviewStore();
  const userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
  const quizStore = new InMemoryQuizStore();
  const quizQuestionStore = new InMemoryQuizQuestionStore();
  const quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
  const conversationStore = new InMemoryAssistantConversationStore();
  const studySessionStore = new InMemoryStudySessionStore();
  const flashcardStudySessionStore = new InMemoryFlashcardStudySessionStore();

  // Admin store
  const adminStore = new InMemoryAdminStore();

  // Library & Content Pack stores
  const contentPackUsageStore = new InMemoryContentPackUsageStore();
  const contentPackStore = new InMemoryContentPackStore(
    userStore,
    moduleStore,
    lessonStore,
    flashcardStore,
    quizStore,
    quizQuestionStore,
    generatedContentStore,
    contentPackUsageStore,
  );

  // Model gateway (Gemini default, or mock/cloudflare/groq if configured, or injected gateway).
  const gateway =
    options?.gateway ??
    createModelGateway({
      provider: config.generation.aiProvider,
      enableFallback: config.generation.enableFallback,
      geminiApiKey: config.generation.geminiApiKey,
      geminiApiKeys: config.generation.geminiApiKeys,
      geminiModel: config.generation.geminiModel,
      cloudflareAccountId: config.generation.cloudflareAccountId,
      cloudflareApiToken: config.generation.cloudflareApiToken,
      cloudflareAiModel: config.generation.cloudflareAiModel,
      groqApiKey: config.generation.groqApiKey,
      groqModel: config.generation.groqModel,
      gapgptApiKey: config.generation.gapgptApiKey,
      gapgptBaseUrl: config.generation.gapgptBaseUrl,
      gapgptModel: config.generation.gapgptModel,
    });

  // Assistant gateway using Cloudflare if configured
  const assistantGateway =
    config.generation.cloudflareAccountId &&
    config.generation.cloudflareApiToken
      ? createModelGateway({
          provider: "cloudflare",
          cloudflareAccountId: config.generation.cloudflareAccountId,
          cloudflareApiToken: config.generation.cloudflareApiToken,
          cloudflareAiModel: config.generation.cloudflareAiModel,
        })
      : gateway;

  const auditStore = new InMemoryAuditStore();
  const auditService = new AuditService(auditStore);

  const generationService = new GenerationService(
    generatedContentStore,
    generatedContentCitationStore,
    gateway,
    documentStore,
    documentChunkStore,
    defaultPolicy,
    auditService,
    organizationStore,
  );

  // In-memory generation queue with background execution.
  const queue = new InMemoryGenerationQueue(generationJobStore, generationService);

  // Local filesystem storage for document uploads (dev).
  const storageProvider = new LocalStorageProvider(
    config.storage.local.directory,
  );

  const v1Options: V1RouteOptions = {
    config,
    sessionStore,
    userStore,
    organizationStore,
    courseStore,
    moduleStore,
    lessonStore,
    progressStore,
    documentStore,
    documentChunkStore,
    storageProvider,
    generatedContentStore,
    generatedContentCitationStore,
    generationJobStore,
    queue,
    gateway,
    flashcardStore,
    flashcardReviewStore,
    userFlashcardScheduleStore,
    quizStore,
    quizQuestionStore,
    quizAttemptStore,
    conversationStore,
    assistantGateway,
    studySessionStore,
    flashcardStudySessionStore,
    auditService,
    adminStore,
    contentPackStore,
    contentPackUsageStore,
  };

  // Seed demo data for local development — awaited before routes register
  if (config.nodeEnv === "development") {
    process.stdout.write("[seed] Seed started...\n");
    const seedResult = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
      lessonStore,
      quizStore,
      quizQuestionStore,
      auditService,
    });
    process.stdout.write(
      `[seed] User count: ${seedResult.seeded.user ? 1 : 0}, ` +
        `Organization count: ${seedResult.seeded.organization ? 1 : 0}, ` +
        `Course count: ${seedResult.seeded.courses.length}\n`,
    );
  }

  return { v1Options, auditService };
}
