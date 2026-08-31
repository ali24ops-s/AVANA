import type { FastifyPluginAsync } from "fastify";
import type { OrganizationId } from "@avana/domain";
import { defaultPolicy } from "@avana/domain";
import { healthRoutes } from "./health.js";
import { readinessRoutes } from "./readiness.js";
import { organizationRoutes } from "../modules/organizations/index.js";
import { courseRoutes } from "../modules/courses/index.js";
import { learningRoutes, contentRoutes } from "../modules/learning/index.js";
import { documentRoutes } from "../modules/documents/index.js";
import { generationRoutes, reviewRoutes } from "../modules/generation/index.js";
import { libraryRoutes } from "../modules/library/index.js";
import type {
  ContentPackStore,
  ContentPackUsageStore,
} from "../modules/library/index.js";
import { searchRoutes, type SearchStore } from "../modules/search/index.js";
import {
  studyRoutes,
  assistantRoutes,
  type AssistantConversationStore,
  type StudySessionStore,
  type FlashcardStudySessionStore,
} from "../modules/study/index.js";
import type {
  FlashcardStore,
  FlashcardReviewStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
} from "../modules/study/index.js";
import type {
  GeneratedContentStore,
  GeneratedContentCitationStore,
} from "../modules/generation/generation-store.js";
import type { GenerationJobStore } from "../modules/generation/generation-jobs-store.js";
import type { GenerationQueue } from "../modules/generation/generation-queue.js";
import type { ModelGateway } from "../modules/generation/gateway/index.js";
import type { OrganizationStore } from "../modules/organizations/organization-store.js";
import type { CourseStore } from "../modules/courses/course-store.js";
import type {
  ModuleStore,
  LessonStore,
  ProgressStore,
  DocumentStore,
  DocumentChunkStore,
} from "../modules/learning/learning-store.js";
import type { SessionStore } from "../modules/identity/session-store.js";
import type { UserStore } from "../modules/identity/user-store.js";
import { SessionService } from "../modules/identity/session-service.js";
import {
  registerIdentityModule,
  type IdentityPluginOptions,
} from "../modules/identity/index.js";
import type { StorageProvider } from "../modules/storage/index.js";
import type { AuditService } from "../observability/audit-service.js";

import type {
  EmailVerificationStore,
  EmailService,
} from "../modules/identity/index.js";

import type { AdminStore } from "../modules/admin/admin-store.js";
import { adminRoutes } from "../modules/admin/index.js";
import { DocumentProcessingService } from "../modules/documents/document-processing-service.js";
import { DocumentService } from "../modules/documents/document-service.js";
import { DemoUserResolver } from "../modules/identity/demo-user-resolver.js";

export interface V1RouteOptions {
  config: IdentityPluginOptions["config"];
  sessionStore: SessionStore;
  userStore: UserStore;
  emailVerificationStore?: EmailVerificationStore;
  emailService?: EmailService;
  organizationStore: OrganizationStore;
  courseStore?: CourseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  progressStore?: ProgressStore;
  documentStore?: DocumentStore;
  documentChunkStore?: DocumentChunkStore;
  storageProvider?: StorageProvider;
  generatedContentStore?: GeneratedContentStore;
  generatedContentCitationStore?: GeneratedContentCitationStore;
  generationJobStore?: GenerationJobStore;
  queue?: GenerationQueue;
  gateway?: ModelGateway;
  flashcardStore?: FlashcardStore;
  flashcardReviewStore?: FlashcardReviewStore;
  userFlashcardScheduleStore?: UserFlashcardScheduleStore;
  quizStore?: QuizStore;
  quizQuestionStore?: QuizQuestionStore;
  quizAttemptStore?: QuizAttemptStore;
  conversationStore?: AssistantConversationStore;
  assistantGateway?: ModelGateway;
  studySessionStore?: StudySessionStore;
  flashcardStudySessionStore?: FlashcardStudySessionStore;
  auditService?: AuditService;
  adminStore?: AdminStore;
  contentPackStore?: ContentPackStore;
  contentPackUsageStore?: ContentPackUsageStore;
  searchStore?: SearchStore;
  demoUserResolver?: DemoUserResolver;
}

export const v1Routes: FastifyPluginAsync<Partial<V1RouteOptions>> = async (
  app,
  opts,
) => {
  void app.register(healthRoutes);
  void app.register(readinessRoutes);

  const authEnabled = opts.config?.auth?.enabled ?? true;
  const demoUserResolver =
    opts.demoUserResolver ??
    (opts.userStore && opts.config
      ? new DemoUserResolver(
          opts.userStore,
          opts.organizationStore,
          opts.config.auth?.demoUserEmail || "ali1383mohammadlo@gmail.com",
        )
      : undefined);

  // Register identity (auth) module if stores are provided
  if (opts.config && opts.sessionStore && opts.userStore) {
    await registerIdentityModule(app, {
      config: opts.config,
      sessionStore: opts.sessionStore,
      userStore: opts.userStore,
      emailVerificationStore: opts.emailVerificationStore,
      emailService: opts.emailService,
      organizationStore: opts.organizationStore,
      demoUserResolver,
    });
  }

  // Register organization routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore
  ) {
    await app.register(organizationRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      organizationStore: opts.organizationStore,
      auditService: opts.auditService,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register course routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.courseStore
  ) {
    await app.register(courseRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      organizationStore: opts.organizationStore,
      courseStore: opts.courseStore,
      auditService: opts.auditService,
      systemOrganizationId: opts.config.systemOrganizationId as OrganizationId,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register content (authoring) routes if all required stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.courseStore &&
    opts.moduleStore &&
    opts.lessonStore
  ) {
    await app.register(contentRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      courseStore: opts.courseStore,
      organizationStore: opts.organizationStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      auditService: opts.auditService,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register learning routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.courseStore &&
    opts.moduleStore &&
    opts.lessonStore &&
    opts.progressStore
  ) {
    await app.register(learningRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      courseStore: opts.courseStore,
      organizationStore: opts.organizationStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      progressStore: opts.progressStore,
      auditService: opts.auditService,
      systemOrganizationId: opts.config.systemOrganizationId as OrganizationId,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register document routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.documentStore &&
    opts.documentChunkStore &&
    opts.storageProvider
  ) {
    await app.register(documentRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      organizationStore: opts.organizationStore,
      documentStore: opts.documentStore,
      documentChunkStore: opts.documentChunkStore,
      storageProvider: opts.storageProvider,
      generatedContentStore: opts.generatedContentStore,
      generationJobStore: opts.generationJobStore,
      flashcardStore: opts.flashcardStore,
      quizStore: opts.quizStore,
      courseStore: opts.courseStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      auditService: opts.auditService,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register generation routes if all stores and a gateway are provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.organizationStore &&
    opts.documentStore &&
    opts.documentChunkStore &&
    opts.generatedContentStore &&
    opts.generatedContentCitationStore &&
    opts.generationJobStore &&
    opts.queue &&
    opts.gateway
  ) {
    await app.register(generationRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      documentStore: opts.documentStore,
      documentChunkStore: opts.documentChunkStore,
      generatedContentStore: opts.generatedContentStore,
      generatedContentCitationStore: opts.generatedContentCitationStore,
      generationJobStore: opts.generationJobStore,
      queue: opts.queue,
      gateway: opts.gateway,
      organizationStore: opts.organizationStore,
      auditService: opts.auditService,
      courseStore: opts.courseStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      flashcardStore: opts.flashcardStore,
      quizStore: opts.quizStore,
      quizQuestionStore: opts.quizQuestionStore,
      systemOrganizationId: opts.config.systemOrganizationId as OrganizationId,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register review routes (PR6-6) if all required stores are provided.
  // Requires generation + learning stores (moduleStore/lessonStore) for
  // materializing accepted lessons into the Learning Core.
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.documentStore &&
    opts.documentChunkStore &&
    opts.generatedContentStore &&
    opts.generatedContentCitationStore &&
    opts.moduleStore &&
    opts.lessonStore &&
    opts.queue
  ) {
    await app.register(reviewRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      generatedContentStore: opts.generatedContentStore,
      generatedContentCitationStore: opts.generatedContentCitationStore,
      documentStore: opts.documentStore,
      documentChunkStore: opts.documentChunkStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      queue: opts.queue,
      flashcardStore: opts.flashcardStore,
      quizStore: opts.quizStore,
      quizQuestionStore: opts.quizQuestionStore,
      organizationStore: opts.organizationStore,
      auditService: opts.auditService,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register study consumption routes (PR6-7) if all required stores are provided.
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.flashcardStore &&
    opts.flashcardReviewStore &&
    opts.quizStore &&
    opts.quizQuestionStore &&
    opts.quizAttemptStore &&
    opts.moduleStore &&
    opts.lessonStore &&
    opts.progressStore
  ) {
    await app.register(studyRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      organizationStore: opts.organizationStore,
      courseStore: opts.courseStore,
      flashcardStore: opts.flashcardStore,
      flashcardReviewStore: opts.flashcardReviewStore,
      userFlashcardScheduleStore: opts.userFlashcardScheduleStore,
      quizStore: opts.quizStore,
      quizQuestionStore: opts.quizQuestionStore,
      quizAttemptStore: opts.quizAttemptStore,
      moduleStore: opts.moduleStore,
      lessonStore: opts.lessonStore,
      progressStore: opts.progressStore,
      auditService: opts.auditService,
      systemOrganizationId: opts.config.systemOrganizationId as OrganizationId,
      studySessionStore: opts.studySessionStore,
      flashcardStudySessionStore: opts.flashcardStudySessionStore,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register AI Study Assistant routes (POST /v1/ai/ask)
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    (opts.assistantGateway || opts.gateway) &&
    opts.conversationStore &&
    opts.lessonStore &&
    opts.moduleStore &&
    opts.courseStore &&
    opts.organizationStore
  ) {
    await app.register(assistantRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      assistantGateway: (opts.assistantGateway ?? opts.gateway)!,
      conversationStore: opts.conversationStore,
      lessonStore: opts.lessonStore,
      moduleStore: opts.moduleStore,
      courseStore: opts.courseStore,
      organizationStore: opts.organizationStore,
      auditService: opts.auditService,
      systemOrganizationId: opts.config.systemOrganizationId as OrganizationId,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register Admin routes
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.adminStore
  ) {
    await app.register(adminRoutes, {
      prefix: "/v1/admin",
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      adminStore: opts.adminStore,
      documentProcessingService: opts.documentStore && opts.documentChunkStore && opts.storageProvider ? new DocumentProcessingService(opts.documentStore, opts.documentChunkStore, opts.storageProvider, defaultPolicy, opts.auditService, opts.organizationStore) : undefined,
      documentService: opts.documentStore && opts.storageProvider && opts.organizationStore ? new DocumentService(opts.documentStore, opts.storageProvider, opts.organizationStore, defaultPolicy, opts.auditService, opts.documentChunkStore, opts.generatedContentStore, opts.generationJobStore, opts.flashcardStore, opts.quizStore, opts.courseStore, opts.moduleStore, opts.lessonStore) : undefined,
      generationQueue: opts.queue,
      generationJobStore: opts.generationJobStore,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register Library & Content Pack routes
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.contentPackStore &&
    opts.contentPackUsageStore &&
    opts.documentStore &&
    opts.generatedContentStore
  ) {
    await app.register(libraryRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      contentPackStore: opts.contentPackStore,
      contentPackUsageStore: opts.contentPackUsageStore,
      documentStore: opts.documentStore,
      generatedContentStore: opts.generatedContentStore,
      organizationStore: opts.organizationStore,
      courseStore: opts.courseStore,
      auditService: opts.auditService,
      demoUserResolver,
      authEnabled,
    });
  }

  // Register Search routes if all stores provided
  if (
    opts.config &&
    opts.sessionStore &&
    opts.userStore &&
    opts.searchStore
  ) {
    await app.register(searchRoutes, {
      sessionService: new SessionService(
        opts.sessionStore,
        opts.config.session,
      ),
      userStore: opts.userStore,
      searchStore: opts.searchStore,
      systemOrganizationId: opts.config.systemOrganizationId as OrganizationId,
      demoUserResolver,
      authEnabled,
    });
  }
};


