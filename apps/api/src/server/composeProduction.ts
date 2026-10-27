/**
 * Production Composition Root.
 *
 * Wires Drizzle-backed stores for production runtime.
 * This module is the default composition root for both development
 * and production environments.
 *
 * PR5-B1: Database Runtime Foundation.
 * - Creates Drizzle DB client from config.database.url
 * - Wires all stores with Drizzle implementations
 * - Seeds demo data in development mode only
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import { Redis } from "ioredis";
import { modules, lessons, courses } from "@avana/database/schema";
import type { DbClient } from "@avana/database/client";
import {
  DrizzleSessionStore,
  DrizzleUserStore,
  DrizzleEmailVerificationStore,
  DrizzlePasswordResetStore,
  DrizzleDeviceStore,
  DrizzleWelcomeGiftStore,
  DrizzleOnboardingTourStore,
  MockEmailService,
  ResendEmailService,
  type EmailService,
  ConsoleSmsProvider,
  MockSmsProvider,
  HttpSmsProvider,
  MedianaSmsProvider,
  type SmsProvider,
} from "../modules/identity/index.js";

import { DrizzleOrganizationStore } from "../modules/organizations/drizzle-stores.js";
import {
  DrizzleClassroomStore,
  DrizzleClassroomMemberStore,
  DrizzleTeacherExamStore,
  DrizzleTeacherExamQuestionStore,
  DrizzleTeacherExamAttemptStore,
  DrizzleTeacherExamAttemptAnswerStore,
  DrizzleAssignmentStore,
  DrizzleAssignmentSubmissionStore,
  DrizzleClassroomContentStore,
  DrizzleTeacherConversationStore,
  DrizzleTeacherConversationMessageStore,
} from "../modules/teacher-platform/stores.js";

import {
  DrizzleCourseStore,
  DrizzleCoursePublicationStore,
} from "../modules/courses/drizzle-stores.js";
import {
  DrizzleModuleStore,
  DrizzleSubCourseGroupStore,
  DrizzleLessonStore,
  DrizzleProgressStore,
  DrizzleDocumentStore,
  DrizzleDocumentChunkStore,
} from "../modules/learning/drizzle-stores.js";
import {
  DrizzleGeneratedContentStore,
  DrizzleGeneratedContentCitationStore,
  DrizzleGenerationJobStore,
  DrizzleGenerationChunkStore,
} from "../modules/generation/drizzle-stores.js";
import { DrizzleGenerationProgressStore } from "../modules/generation/generation-progress-store.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import {
  DrizzleFlashcardStore,
  DrizzleFlashcardReviewStore,
  DrizzleUserFlashcardScheduleStore,
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
  DrizzleQuizAttemptStore,
  DrizzleAssistantConversationStore,
  DrizzleStudySessionStore,
  DrizzleFlashcardStudySessionStore,
  DrizzleLessonAnnotationStore,
  DrizzleContentReportStore,
} from "../modules/study/index.js";
import {
  createModelGateway,
  BullMqGenerationQueue,
  GenerationService,
  type ModelGateway,
} from "../modules/generation/index.js";
import { createGenerationWorker } from "../modules/generation/generation-processor.js";
import type { Worker } from "bullmq";
import { DrizzleAuditStore } from "../observability/drizzle-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { TelegramClient } from "../observability/telegram-client.js";
import { AdminAlertService } from "../observability/admin-alert-service.js";
import { TelegramOpsBot } from "../observability/telegram-ops-bot.js";
import { DrizzleTelegramOutboxStore } from "../observability/telegram-outbox-store.js";
import { TelegramOutboxDispatcher } from "../observability/telegram-outbox-dispatcher.js";
import { checkWorkerHealth } from "../observability/worker-health-probe.js";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import { AdminService } from "../modules/admin/admin-service.js";
import {
  DrizzleContentPackStore,
  DrizzleContentPackUsageStore,
} from "../modules/library/index.js";
import { DrizzleQuestionPatternStore } from "../modules/generation/question-patterns-store.js";
import { DrizzleSourcePackStore } from "../modules/source-packs/drizzle-source-pack-store.js";
import { DrizzleSearchStore } from "../modules/search/index.js";
import {
  DrizzleCommerceStore,
  MockPaymentGateway,
  ZarinpalPaymentGateway,
} from "../modules/commerce/index.js";
import {
  DrizzleWalletStore,
  WalletService,
} from "../modules/wallet/index.js";
import { DrizzleReferralStore } from "../modules/referral/index.js";
import { DrizzleBlogStore } from "../modules/blog/index.js";
import {
  DrizzleNotificationStore,
  NotificationService,
} from "../modules/notifications/index.js";
import {
  DrizzleSupportStore,
  SupportService,
} from "../modules/support/index.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { seedLocalDevData } from "../dev/seed.js";
import type { V1RouteOptions } from "../routes/v1.js";
import type { ApiConfig } from "../config.js";
import { defaultPolicy, type CourseId, type OrganizationId } from "@avana/domain";

export interface ComposeProductionOptions {
  startWorker?: boolean;
}

export interface ProductionDependencies {
  v1Options: V1RouteOptions;
  auditService: AuditService;
  adminAlertService: AdminAlertService;
  telegramOpsBot?: TelegramOpsBot;
  telegramOutboxStore?: DrizzleTelegramOutboxStore;
  telegramOutboxDispatcher?: TelegramOutboxDispatcher;
  worker?: Worker;
  close: () => Promise<void>;
}

/**
 * Seed module and lesson data directly via Drizzle.
 *
 * Per PR5-B1 guidance, the ModuleStore/LessonStore interfaces are not
 * extended for seed convenience. Instead, we seed at the composition
 * root level using the Drizzle client directly.
 */
async function seedModulesAndLessons(
  db: DbClient,
  pharmacologyCourseId: CourseId,
): Promise<{ modules: boolean; lessons: boolean }> {
  const now = new Date();

  // Check if modules already exist for this course
  const existingModules = await db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, pharmacologyCourseId))
    .limit(1);

  if (existingModules.length > 0) {
    return { modules: false, lessons: false };
  }

  // Seed "Drug Classification & Nomenclature" module
  const module1Id = randomUUID();
  await db.insert(modules).values({
    id: module1Id,
    courseId: pharmacologyCourseId,
    title: "Drug Classification & Nomenclature",
    description:
      "Understanding how drugs are classified, named, and categorized by therapeutic use and chemical structure.",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Seed lessons for module 1
  await db.insert(lessons).values([
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: "Introduction to Drug Classifications",
      contentType: "markdown",
      contentMarkdown:
        "# Drug Classifications\n\nDrugs are classified in several ways:\n\n## 1. Therapeutic Classification\nBased on the condition they treat:\n- Antihypertensives (treat high blood pressure)\n- Antidiabetics (treat diabetes)\n- Antidepressants (treat depression)\n\n## 2. Pharmacologic Classification\nBased on mechanism of action:\n- Beta-blockers\n- ACE inhibitors\n- Calcium channel blockers\n\n## 3. Chemical Classification\nBased on chemical structure:\n- Benzodiazepines\n- Opioids\n- Statins",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: "Generic vs Brand Names",
      contentType: "markdown",
      contentMarkdown:
        "# Generic vs Brand Names\n\nEvery drug has at least three names:\n\n## Chemical Name\nDescribes the molecular structure (e.g., N-acetyl-para-aminophenol).\n\n## Generic Name\nThe official medical name (e.g., acetaminophen).\n\n## Brand Name\nThe proprietary name given by the manufacturer (e.g., Tylenol).\n\n## Key Points\n- Generic drugs are bioequivalent to brand-name drugs\n- Generic names are not capitalized\n- Multiple brands may exist for the same generic drug",
      sortOrder: 2,
      estimatedMinutes: 8,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: "Controlled Substances & Schedules",
      contentType: "markdown",
      contentMarkdown:
        "# Controlled Substances & Schedules\n\nThe Controlled Substances Act (CSA) categorizes drugs into schedules based on medical use and abuse potential:\n\n## Schedule I\n- High abuse potential, no accepted medical use\n- Examples: Heroin, LSD, Marijuana (federal classification)\n\n## Schedule II\n- High abuse potential, accepted medical use\n- Examples: Morphine, Oxycodone, Adderall\n\n## Schedule III\n- Moderate abuse potential\n- Examples: Tylenol with Codeine, Ketamine\n\n## Schedule IV\n- Low abuse potential\n- Examples: Xanax, Valium, Ambien\n\n## Schedule V\n- Lowest abuse potential\n- Examples: Cough suppressants with codeine",
      sortOrder: 3,
      estimatedMinutes: 12,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Seed "Pharmacokinetics (ADME)" module
  const module2Id = randomUUID();
  await db.insert(modules).values({
    id: module2Id,
    courseId: pharmacologyCourseId,
    title: "Pharmacokinetics (ADME)",
    description:
      "The study of how the body absorbs, distributes, metabolizes, and excretes drugs — the foundation of rational drug therapy.",
    sortOrder: 2,
    createdAt: now,
    updatedAt: now,
  });

  // Seed lessons for module 2
  await db.insert(lessons).values([
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: "Absorption",
      contentType: "markdown",
      contentMarkdown:
        "# Absorption\n\nAbsorption is the process by which a drug enters the bloodstream from its site of administration.\n\n## Routes of Administration\n- **Oral**: Most common, undergoes first-pass metabolism\n- **Intravenous**: 100% bioavailability, rapid onset\n- **Intramuscular**: Moderate absorption rate\n- **Subcutaneous**: Slow, sustained absorption\n- **Transdermal**: Steady absorption over time\n\n## Factors Affecting Absorption\n- Blood flow to the absorption site\n- Solubility of the drug (lipophilic vs hydrophilic)\n- pH of the environment\n- Drug formulation (tablet, liquid, injection)",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: "Distribution & Metabolism",
      contentType: "markdown",
      contentMarkdown:
        "# Distribution & Metabolism\n\n## Distribution\nDistribution refers to how a drug spreads throughout the body:\n- **Volume of distribution (Vd)**: Theoretical volume needed to contain the drug at the measured plasma concentration\n- **Protein binding**: Many drugs bind to albumin; only unbound drug is pharmacologically active\n- **Blood-brain barrier**: Limits CNS penetration of many drugs\n\n## Metabolism (Biotransformation)\nThe liver is the primary site of drug metabolism:\n\n### Phase I Reactions\n- Oxidation, reduction, hydrolysis\n- Cytochrome P450 enzymes (CYP3A4, CYP2D6, etc.)\n- Often produces active metabolites\n\n### Phase II Reactions\n- Conjugation reactions\n- Glucuronidation, sulfation, acetylation\n- Produces water-soluble compounds for excretion\n\n## Key Concept: First-Pass Effect\nOral drugs absorbed from the GI tract pass through the liver before reaching systemic circulation, reducing bioavailability.",
      sortOrder: 2,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: "Excretion",
      contentType: "markdown",
      contentMarkdown:
        "# Excretion\n\nExcretion is the process by which drugs and their metabolites are removed from the body.\n\n## Renal Excretion\n- **Glomerular filtration**: Free drug is filtered\n- **Tubular secretion**: Active transport into urine\n- **Tubular reabsorption**: Passive diffusion back into blood\n\n## Other Routes of Excretion\n- **Biliary excretion**: Drugs excreted in bile may be reabsorbed (enterohepatic recirculation)\n- **Pulmonary excretion**: Volatile substances (alcohol, anesthetics)\n- **Mammary excretion**: Drugs excreted in breast milk\n\n## Half-Life (t½)\nThe time required for the drug concentration to decrease by 50%.\n- Determines dosing frequency\n- Affected by organ function (liver, kidney)\n- 5 half-lives to reach steady state",
      sortOrder: 3,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return { modules: true, lessons: true };
}

/**
 * Create all Drizzle-backed stores and wire them into V1RouteOptions.
 *
 * This is the default composition root for all environments.
 * In-memory composition (composeLocalDev) is preserved for test use only.
 */
export async function composeProduction(
  config: ApiConfig,
  options?: ComposeProductionOptions,
): Promise<ProductionDependencies> {
  // Create database client
  const { db, close } = createDbClient(config.database.url);

  // Drizzle-backed stores
  const sessionStore = new DrizzleSessionStore(db);
  const userStore = new DrizzleUserStore(db);
  const deviceStore = new DrizzleDeviceStore(db);
  const emailVerificationStore = new DrizzleEmailVerificationStore(db);
  const passwordResetStore = new DrizzlePasswordResetStore(db);
  const notificationStore = new DrizzleNotificationStore(db);
  const notificationService = new NotificationService(notificationStore);
  let emailService: EmailService;
  if (config.nodeEnv === "production") {
    if (!config.email.resendApiKey) {
      throw new Error(
        "Missing required production email configuration: RESEND_API_KEY is not set.",
      );
    }
    emailService = new ResendEmailService(
      config.email.resendApiKey,
      config.email.from,
      globalThis.fetch,
      config.appUrl,
    );
  } else if (config.email.provider === "resend" && config.email.resendApiKey) {
    emailService = new ResendEmailService(
      config.email.resendApiKey,
      config.email.from,
      globalThis.fetch,
      config.appUrl,
    );
  } else {
    emailService = new MockEmailService();
  }

  let smsProvider: SmsProvider;
  if (
    config.sms.provider === "mediana" ||
    (config.nodeEnv === "production" &&
      config.sms.apiKey &&
      config.sms.patternCode)
  ) {
    if (!config.sms.apiKey) {
      throw new Error(
        "Missing required SMS configuration: MEDIANA_API_KEY is not set.",
      );
    }
    if (!config.sms.patternCode) {
      throw new Error(
        "Missing required SMS configuration: MEDIANA_PATTERN_CODE is not set.",
      );
    }
    smsProvider = new MedianaSmsProvider({
      apiKey: config.sms.apiKey,
      patternCode: config.sms.patternCode,
      apiUrl: config.sms.apiUrl,
      timeoutMs: config.sms.timeoutMs,
    });
  } else if (
    config.sms.provider === "http" ||
    (config.nodeEnv === "production" &&
      config.sms.apiUrl &&
      !config.sms.patternCode)
  ) {
    if (!config.sms.apiUrl) {
      throw new Error(
        "Missing required production SMS configuration: SMS_API_URL is not set.",
      );
    }
    smsProvider = new HttpSmsProvider({
      apiUrl: config.sms.apiUrl,
      apiKey: config.sms.apiKey,
      username: config.sms.username,
      password: config.sms.password,
      sender: config.sms.sender,
    });
  } else if (config.nodeEnv === "test" || config.sms.provider === "mock") {
    smsProvider = new MockSmsProvider();
  } else {
    smsProvider = new ConsoleSmsProvider();
  }
  const organizationStore = new DrizzleOrganizationStore(db);
  const courseStore = new DrizzleCourseStore(db);
  const coursePublicationStore = new DrizzleCoursePublicationStore(db);
  const moduleStore = new DrizzleModuleStore(db);
  const subCourseGroupStore = new DrizzleSubCourseGroupStore(db);
  const lessonStore = new DrizzleLessonStore(db);
  const progressStore = new DrizzleProgressStore(db);
  const documentStore = new DrizzleDocumentStore(db);
  const documentChunkStore = new DrizzleDocumentChunkStore(db);

  // AI generation stores + gateway (mock provider in this PR).
  const generatedContentStore = new DrizzleGeneratedContentStore(db);
  const generatedContentCitationStore =
    new DrizzleGeneratedContentCitationStore(db);
  const generationJobStore = new DrizzleGenerationJobStore(db);
  const generationChunkStore = new DrizzleGenerationChunkStore(db);
  const generationProgressStore = new DrizzleGenerationProgressStore(db);
  const generationProgressService = new GenerationProgressService(generationProgressStore);
  // Admin Model gateway: strictly Gemini with multi-key pool, zero fallback to external providers.
  const geminiRedis =
    config.generation.aiProvider !== "mock" && config.redis.url
      ? new Redis(config.redis.url, { maxRetriesPerRequest: null, enableReadyCheck: false })
      : undefined;

  const adminProvider = config.generation.aiProvider === "mock" ? "mock" : "gemini";
  const adminGateway: ModelGateway = createModelGateway({
    provider: adminProvider,
    enableFallback: false,
    geminiApiKey: config.generation.geminiApiKey,
    geminiApiKeys: config.generation.geminiApiKeys,
    geminiKeyConfigs: config.generation.geminiKeyConfigs,
    geminiRedis,
    geminiQuotas: config.generation.geminiQuotas,
    geminiModel: config.generation.geminiModel,
    geminiSocksProxyUrl: config.generation.geminiSocksProxyUrl,
  });

  // BullMQ generation queue (Redis-backed producer).
  const queue = new BullMqGenerationQueue({
    jobStore: generationJobStore,
    connection: { url: config.redis.url },
    queueName: config.generation.queueName,
  });

  // Local filesystem storage for document uploads (dev/single-node).
  const storageProvider = new LocalStorageProvider(
    config.storage.local.directory,
  );

  // Study stores (PR6-7 & Assistant)
  const flashcardStore = new DrizzleFlashcardStore(db);
  const flashcardReviewStore = new DrizzleFlashcardReviewStore(db);
  const userFlashcardScheduleStore = new DrizzleUserFlashcardScheduleStore(db);
  const quizStore = new DrizzleQuizStore(db);
  const quizQuestionStore = new DrizzleQuizQuestionStore(db);
  const quizAttemptStore = new DrizzleQuizAttemptStore(db);
  const conversationStore = new DrizzleAssistantConversationStore(db);
  const studySessionStore = new DrizzleStudySessionStore(db);
  const flashcardStudySessionStore = new DrizzleFlashcardStudySessionStore(db);
  const annotationStore = new DrizzleLessonAnnotationStore(db);
  const reportStore = new DrizzleContentReportStore(db);
  
  // Admin Store
  const adminStore = new DrizzleAdminStore(db, {
    systemOrganizationId: config.systemOrganizationId,
  });
  const questionPatternStore = new DrizzleQuestionPatternStore(db);

  // Library & Content Pack Stores
  const contentPackStore = new DrizzleContentPackStore(db);
  const contentPackUsageStore = new DrizzleContentPackUsageStore(db);

  // Unified central ModelGateway: user content generation and assistant/mentor
  // use the centralized Gemini API infrastructure sharing the same key pool and rate limiter.
  const userGateway: ModelGateway = adminGateway;
  const assistantGateway: ModelGateway = adminGateway;

  const auditStore = new DrizzleAuditStore(db);
  const auditService = new AuditService(auditStore);

  // Operational Telegram Alerts & Durable Outbox
  const telegramClient = new TelegramClient({
    botToken: config.telegram.botToken,
    adminChatId: config.telegram.adminChatId,
    timeoutMs: config.telegram.timeoutMs,
    apiBaseUrl: config.telegram.apiBaseUrl,
    socksProxyUrl: config.telegram.socksProxyUrl,
  });

  const telegramOutboxStore = new DrizzleTelegramOutboxStore(db);
  const telegramOutboxDispatcher = new TelegramOutboxDispatcher({
    store: telegramOutboxStore,
    telegramClient,
  });

  const adminAlertService = new AdminAlertService({
    enabled: config.telegram.enabled,
    telegramClient,
    outboxStore: telegramOutboxStore,
    outboxDispatcher: telegramOutboxDispatcher,
  });

  // Tap AuditService for domain events (e.g. generation.failed, payments, teachers, user registrations)
  auditService.addListener((events) => {
    for (const event of events) {
      if (event.action === "generation.failed") {
        void adminAlertService.notifyCritical(
          "generation.failed",
          "شکست نهایی فرآیند تولید محتوا",
          {
            details: {
              documentId: event.entityId,
              errorCode: String(event.details?.errorCode ?? "unknown"),
              retryCount: Number(event.details?.retryCount ?? 0),
            },
            cooldownKey: `generation.failed:${event.entityId}:${event.details?.errorCode}`,
          },
        );
      } else if (event.action === "user.registered") {
        void adminAlertService.notifyUserRegistered({
          userId: event.entityId,
          name: typeof event.details?.name === "string" ? event.details.name : undefined,
        });
      } else if (event.action === "teacher.requested") {
        void adminAlertService.notifyTeacherRequested({
          teacherId: event.entityId,
          name: typeof event.details?.name === "string" ? event.details.name : undefined,
          university: typeof event.details?.university === "string" ? event.details.university : undefined,
        });
      } else if (event.action === "payment.c2c_submitted") {
        void adminAlertService.notifyPaymentReceived({
          paymentId: event.entityId,
          orderId: typeof event.details?.orderId === "string" ? event.details.orderId : undefined,
          userId: typeof event.details?.userId === "string" ? event.details.userId : (event.actorId || undefined),
          amount: Number(event.details?.amount ?? 0),
          productTitle: typeof event.details?.productTitle === "string" ? event.details.productTitle : undefined,
          productType: typeof event.details?.productType === "string" ? event.details.productType : undefined,
          status: "در انتظار بررسی ادمین",
          isC2C: true,
          trackingNumber: typeof event.details?.trackingNumber === "string" ? event.details.trackingNumber : undefined,
          sourceCardLast4: typeof event.details?.sourceCardLast4 === "string" ? event.details.sourceCardLast4 : undefined,
          payerName: typeof event.details?.payerName === "string" ? event.details.payerName : undefined,
          paidAt: typeof event.details?.paymentDate === "string"
            ? event.details.paymentDate
            : (typeof event.details?.paidAt === "string" ? event.details.paidAt : undefined),
        });
      } else if (event.action === "payment.completed") {
        const paymentId = String(event.details?.paymentId ?? event.entityId);
        void adminAlertService.notifyPaymentReceived({
          paymentId,
          orderId: typeof event.details?.orderId === "string" ? event.details.orderId : undefined,
          userId: typeof event.details?.userId === "string" ? event.details.userId : (event.actorId || undefined),
          amount: Number(event.details?.amount ?? 0),
          productTitle: typeof event.details?.productTitle === "string" ? event.details.productTitle : undefined,
          productType: typeof event.details?.productType === "string" ? event.details.productType : undefined,
          gateway: typeof event.details?.gateway === "string" ? event.details.gateway : undefined,
          status: "موفق",
          isC2C: false,
        });
      } else if (event.action === "payment.approved") {
        if (event.details?.actorType !== "admin/telegram") {
          void adminAlertService.notifyPaymentApproved({
            paymentId: event.entityId,
            orderId: typeof event.details?.orderId === "string" ? event.details.orderId : undefined,
            amount: Number(event.details?.amount ?? 0),
            productTitle: typeof event.details?.productTitle === "string" ? event.details.productTitle : undefined,
            productType: typeof event.details?.productType === "string" ? event.details.productType : undefined,
            userId: typeof event.details?.userId === "string" ? event.details.userId : undefined,
            approvedBy: typeof event.details?.adminId === "string" ? event.details.adminId : undefined,
            actorType: typeof event.details?.actorType === "string" ? event.details.actorType : "admin/web",
            createdAt: event.createdAt,
          });
        }
      } else if (event.action === "payment.rejected") {
        if (event.details?.actorType !== "admin/telegram") {
          void adminAlertService.notifyPaymentRejected({
            paymentId: event.entityId,
            orderId: typeof event.details?.orderId === "string" ? event.details.orderId : undefined,
            amount: Number(event.details?.amount ?? 0),
            productTitle: typeof event.details?.productTitle === "string" ? event.details.productTitle : undefined,
            productType: typeof event.details?.productType === "string" ? event.details.productType : undefined,
            userId: typeof event.details?.userId === "string" ? event.details.userId : undefined,
            rejectedBy: typeof event.details?.adminId === "string" ? event.details.adminId : undefined,
            reason: String(event.details?.reason || "رد پرداخت"),
            actorType: typeof event.details?.actorType === "string" ? event.details.actorType : "admin/web",
            createdAt: event.createdAt,
          });
        }
      } else if (event.action === "wallet.refunded") {
        void adminAlertService.notifyWalletRefunded({
          walletId: event.entityId,
          amount: Number(event.details?.amount ?? 0),
          source: typeof event.details?.source === "string" ? event.details.source : undefined,
          userId: event.actorId || undefined,
          referenceType: typeof event.details?.referenceType === "string" ? event.details.referenceType : undefined,
          referenceId: typeof event.details?.referenceId === "string" ? event.details.referenceId : undefined,
          createdAt: event.createdAt,
        });
      } else if ((event.action as string) === "TEACHER_APPROVED") {
        void adminAlertService.notifyInfo(
          "teacher.approved",
          "تأیید درخواست تدریس استاد",
          {
            details: {
              teacherId: event.entityId,
              status: "تأیید شده",
            },
            cooldownKey: `teacher.approved:${event.entityId}`,
          },
        );
      } else if ((event.action as string) === "TEACHER_REJECTED") {
        void adminAlertService.notifyInfo(
          "teacher.rejected",
          "رد درخواست تدریس استاد",
          {
            details: {
              teacherId: event.entityId,
              reason: String(event.details?.reason ?? "عدم احراز شرایط"),
              status: "رد شده",
            },
            cooldownKey: `teacher.rejected:${event.entityId}`,
          },
        );
      } else if (event.action === "support_ticket.created") {
        void adminAlertService.notifySupportTicketCreated({
          ticketId: event.entityId,
          title: String(event.details?.title ?? "تیکت جدید"),
          category: typeof event.details?.category === "string" ? event.details.category : undefined,
          priority: typeof event.details?.priority === "string" ? event.details.priority : undefined,
          userName: typeof event.details?.userName === "string" ? event.details.userName : undefined,
          userId: event.actorId || undefined,
          createdAt: event.createdAt,
        });
      } else if (event.action === "support_ticket.replied") {
        void adminAlertService.notifySupportTicketUserReplied({
          ticketId: event.entityId,
          userName: typeof event.details?.userName === "string" ? event.details.userName : undefined,
          snippet: typeof event.details?.snippet === "string" ? event.details.snippet : undefined,
          createdAt: event.createdAt,
        });
      }
    }
  });

  const searchStore = new DrizzleSearchStore(db);
  const blogStore = new DrizzleBlogStore(db);

  // Commerce & Monetization Stores & Payment Gateway
  const commerceStore = new DrizzleCommerceStore(db);
  const walletStore = new DrizzleWalletStore(db);
  const walletService = new WalletService(walletStore, auditService, commerceStore);
  const adminService = new AdminService(
    adminStore,
    walletService,
    commerceStore,
    notificationService,
    undefined,
    undefined,
    undefined,
    undefined,
    auditService,
  );

  const supportStore = new DrizzleSupportStore(db);
  const supportService = new SupportService(
    supportStore,
    notificationService,
    auditService,
  );

  // AVANA Ops Bot: Inbound polling commands (/status, /queues, /errors, /payments, /tickets) + Callback actions
  const telegramOpsBot = new TelegramOpsBot({
    enabled: config.telegram.enabled,
    botToken: config.telegram.botToken,
    adminChatId: config.telegram.adminChatId,
    botUsername: config.telegram.botUsername,
    telegramClient,
    adminStore,
    adminService,
    supportStore,
    supportService,
    auditService,
    generationQueue: queue.getRawQueue(),
    workerHealthChecker: () =>
      checkWorkerHealth({
        queue: queue.getRawQueue(),
        db,
      }),
  });

  if (config.telegram.enabled && config.telegram.botToken && config.telegram.adminChatId) {
    telegramOutboxDispatcher.start();
    telegramOpsBot.start();
  }
  const referralStore = new DrizzleReferralStore(db);
  let paymentGateway: MockPaymentGateway | ZarinpalPaymentGateway;
  if (
    config.commerce.onlinePaymentEnabled &&
    config.commerce.provider === "zarinpal" &&
    config.commerce.zarinpalMerchantId
  ) {
    paymentGateway = new ZarinpalPaymentGateway({
      merchantId: config.commerce.zarinpalMerchantId,
      sandbox: config.commerce.zarinpalSandbox,
    });
  } else {
    paymentGateway = new MockPaymentGateway({
      enabled: config.commerce.mockPaymentEnabled,
    });
  }

  const classroomStore = new DrizzleClassroomStore(db);
  const classroomMemberStore = new DrizzleClassroomMemberStore(db);
  const teacherExamStore = new DrizzleTeacherExamStore(db);
  const teacherExamQuestionStore = new DrizzleTeacherExamQuestionStore(db);
  const teacherExamAttemptStore = new DrizzleTeacherExamAttemptStore(db);
  const teacherExamAttemptAnswerStore = new DrizzleTeacherExamAttemptAnswerStore(db);
  const assignmentStore = new DrizzleAssignmentStore(db);
  const assignmentSubmissionStore = new DrizzleAssignmentSubmissionStore(db);
  const contentStore = new DrizzleClassroomContentStore(db);
  const teacherConversationStore = new DrizzleTeacherConversationStore(db);
  const teacherConversationMessageStore = new DrizzleTeacherConversationMessageStore(db);
  const sourcePackStore = new DrizzleSourcePackStore(db);

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
    passwordResetStore,
    emailService,
    smsProvider,
    organizationStore,
    courseStore,
    coursePublicationStore,
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
    generationChunkStore,
    generationProgressStore,
    generationProgressService,
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
    questionPatternStore,
    contentPackStore,
    contentPackUsageStore,
    searchStore,
    commerceStore,
    walletStore,
    referralStore,
    paymentGateway,
    blogStore,
    classroomStore,
    classroomMemberStore,
    teacherExamStore,
    teacherExamQuestionStore,
    teacherExamAttemptStore,
    teacherExamAttemptAnswerStore,
    assignmentStore,
    assignmentSubmissionStore,
    contentStore,
    teacherConversationStore,
    teacherConversationMessageStore,
    sourcePackStore,
    welcomeGiftStore: new DrizzleWelcomeGiftStore(db),
    onboardingTourStore: new DrizzleOnboardingTourStore(db),
    db,
  };


  // Explicit opt-in dev seed: never seed automatically on regular dev/restart
  if (config.nodeEnv === "development" && process.env.ENABLE_DEV_AUTO_SEED === "true") {
    process.stdout.write("[seed] Explicit dev seed started...\n");
    const seedResult = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    if (seedResult.seeded.courses.length > 0) {
      const pharmacologyCourse = await db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.name, "شیمی دارویی ۱"))
        .limit(1)
        .then((rows) => rows[0]);

      if (pharmacologyCourse) {
        await seedModulesAndLessons(db, pharmacologyCourse.id as CourseId);
      }
    }

    process.stdout.write(
      `[seed] User count: ${seedResult.seeded.user ? 1 : 0}, ` +
        `Organization count: ${seedResult.seeded.organization ? 1 : 0}, ` +
        `Course count: ${seedResult.seeded.courses.length}\n`,
    );
  }

  let worker: Worker | undefined;
  if (options?.startWorker ?? (config.nodeEnv !== "test")) {
    const adminGenerationService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      adminGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      auditService,
      organizationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      config.systemOrganizationId as OrganizationId,
      generationChunkStore,
      generationJobStore,
      generationProgressService,
      notificationService,
    );
    adminGenerationService.setQuestionPatternStore(questionPatternStore);

    const userGenerationService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      userGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      auditService,
      organizationStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      config.systemOrganizationId as OrganizationId,
      generationChunkStore,
      generationJobStore,
      generationProgressService,
      notificationService,
    );
    userGenerationService.setQuestionPatternStore(questionPatternStore);

    worker = createGenerationWorker(
      { url: config.redis.url },
      config.generation.queueName,
      {
        adminGenerationService,
        userGenerationService,
        generationService: userGenerationService,
        generationJobStore,
        generationProgressService,
        walletService,
        walletStore,
      },
    );

    worker.on("ready", () => {
      process.stdout.write(
        `[worker] Generation worker ready on queue "${config.generation.queueName}" (admin: ${adminGateway.provider}/${adminGateway.model ?? "gemini"}, user: ${userGateway.provider}/${userGateway.model ?? "gemini"})\n`,
      );
      void adminAlertService.notifyRecovery(
        "worker.queue_error",
        "بازیابی موفق ورکر صف محتوا آوانا",
        {
          details: {
            queue: config.generation.queueName,
            status: "سالم و آماده دریافت جاب",
          },
        },
      );
    });

    worker.on("active", (job) => {
      process.stdout.write(
        `[worker] ACTIVE: Processing job ${job.id} (name=${job.name})...\n`,
      );
    });

    worker.on("completed", (job) => {
      process.stdout.write(
        `[worker] COMPLETED: Job ${job.id} succeeded!\n`,
      );
    });

    worker.on("failed", (job, err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[worker] FAILED: Job ${job?.id} failed: ${msg}\n`,
      );
    });

    worker.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[worker] Generation worker warning: ${msg}\n`);
      void adminAlertService.notifyCritical(
        "worker.queue_error",
        "خطای سطح زیرساخت در ورکر صف محتوا",
        {
          error: err,
          details: {
            queue: config.generation.queueName,
          },
          cooldownKey: `worker:error:${msg}`,
        },
      );
    });
  }

  const enhancedClose = async () => {
    if (worker) {
      await worker.close();
    }
    await queue.close();
    if (telegramOpsBot) {
      await telegramOpsBot.stop();
    }
    await telegramOutboxDispatcher.stop();
    if ("destroy" in adminGateway && typeof adminGateway.destroy === "function") {
      adminGateway.destroy();
    }
    if (geminiRedis) {
      await geminiRedis.quit().catch(() => {});
    }
    telegramClient.destroy();
    await close();
  };

  return {
    v1Options,
    auditService,
    adminAlertService,
    telegramOpsBot,
    telegramOutboxStore,
    telegramOutboxDispatcher,
    worker,
    close: enhancedClose,
  };
}
