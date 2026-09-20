/**
 * Local Development Composition Root.
 *
 * Wires in-memory stores for local development.
 * This module is ONLY imported when NODE_ENV=development.
 *
 * Sprint 1.5: Enables running the full API locally without a database.
 * Sprint 2: Added learning stores (ModuleStore, LessonStore, ProgressStore).
 */

import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryDeviceStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";
import { MockEmailService } from "../modules/identity/email-service.js";
import {
  MockSmsProvider,
  ConsoleSmsProvider,
} from "../modules/identity/sms-service.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemorySubCourseGroupStore,
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
import {
  InMemoryAssistantConversationStore,
  InMemoryLessonAnnotationStore,
  InMemoryContentReportStore,
} from "../modules/study/index.js";
import {
  createModelGateway,
  OpenRouterModelGateway,
  InMemoryGenerationQueue,
  GenerationService,
  type ModelGateway,
} from "../modules/generation/index.js";
import { defaultPolicy } from "@avana/domain";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryCommerceStore } from "../modules/commerce/index.js";
import { InMemoryWalletStore } from "../modules/wallet/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryContentPackStore,
  InMemoryContentPackUsageStore,
} from "../modules/library/index.js";
import {
  InMemoryNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import {
  InMemorySupportStore,
  SupportService,
} from "../modules/support/index.js";
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
  const deviceStore = new InMemoryDeviceStore();
  deviceStore.setSessionStore(sessionStore);
  const organizationStore = new InMemoryOrganizationStore();
  const userStore = new InMemoryUserStore(organizationStore);
  const emailVerificationStore = new InMemoryEmailVerificationStore();
  const emailService = new MockEmailService();
  const smsProvider =
    config.nodeEnv === "test" || config.sms.provider === "mock"
      ? new MockSmsProvider()
      : new ConsoleSmsProvider();
  const courseStore = new InMemoryCourseStore();
  const moduleStore = new InMemoryModuleStore();
  const subCourseGroupStore = new InMemorySubCourseGroupStore(moduleStore);
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
  const annotationStore = new InMemoryLessonAnnotationStore();
  const reportStore = new InMemoryContentReportStore();

  // Admin store
  const adminStore = new InMemoryAdminStore();
  adminStore.setLearningStores({
    courseStore,
    moduleStore,
    subCourseGroupStore,
    lessonStore,
  });

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
    courseStore,
    progressStore,
    organizationStore,
  );

  // Admin Model gateway: strictly Gemini with multi-key pool, zero fallback to external providers.
  const adminProvider = config.generation.aiProvider === "mock" ? "mock" : "gemini";
  const adminGateway: ModelGateway =
    options?.gateway ??
    createModelGateway({
      provider: adminProvider,
      enableFallback: false,
      geminiApiKey: config.generation.geminiApiKey,
      geminiApiKeys: config.generation.geminiApiKeys,
      geminiModel: config.generation.geminiModel,
    });

  // Dedicated OpenRouter ModelGateway for User-Facing AI (Content Generation & Ask)
  // Zero fallback to Gemini or Cloudflare.
  const userGateway: ModelGateway = new OpenRouterModelGateway({
    apiKey: config.userAi.openrouterApiKey,
    modelName: config.userAi.openrouterModel,
    httpReferer: config.userAi.httpReferer,
    appTitle: config.userAi.appTitle,
  });

  const assistantGateway: ModelGateway = userGateway;

  const auditStore = new InMemoryAuditStore();
  const auditService = new AuditService(auditStore);

  const generationService = new GenerationService(
    generatedContentStore,
    generatedContentCitationStore,
    userGateway,
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

  // Notification store & service
  const notificationStore = new InMemoryNotificationStore();
  const notificationService = new NotificationService(notificationStore);
  // Support store & service
  const supportStore = new InMemorySupportStore(userStore);
  const supportService = new SupportService(
    supportStore,
    notificationService,
    auditService,
  );

  const v1Options: V1RouteOptions = {
    config,
    sessionStore,
    userStore,
    notificationStore,
    notificationService,
    supportStore,
    supportService,
    deviceStore,
    emailVerificationStore,
    emailService,
    smsProvider,
    organizationStore,
    courseStore,
    moduleStore,
    subCourseGroupStore,
    lessonStore,
    progressStore,
    documentStore,
    documentChunkStore,
    storageProvider,
    generatedContentStore,
    generatedContentCitationStore,
    generationJobStore,
    queue,
    gateway: userGateway,
    adminGateway,
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
    annotationStore,
    reportStore,
    auditService,
    adminStore,
    contentPackStore,
    contentPackUsageStore,
    commerceStore: new InMemoryCommerceStore(),
    walletStore: new InMemoryWalletStore(),
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
