import {
  type Actor,
  type AuthAction,
  type AuthorizationPolicy,
  type CourseId,
  type DocumentId,
  type GeneratedContentType,
  type GenerationProgress,
  type DocumentGenerationProgressResource,
  type LessonPayload,
  type FlashcardPayload,
  type QuizPayload,
  type OrganizationId,
  type ResourceContext,
  buildActor,
  DomainError,
  defaultPolicy,
  normalizeRequestedContentTypes,
} from "@avana/domain";
import type { DocumentRecord, DocumentStore, ModuleStore, LessonStore, ModuleRecord } from "../../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation-store.js";
import type { GenerationProgressService } from "../generation-progress-service.js";
import type { FlashcardStore, QuizStore, QuizQuestionStore, FlashcardRecord, QuizRecord } from "../../study/study-store.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import type { GenerationJobStore, GenerationJobRecord } from "../generation-jobs-store.js";
import type { GenerationQueryService } from "./generation-query-service.js";

export type DocumentContentStatusResource = {
  request_id: string;
  document_id: DocumentId;
  course_id: CourseId | null;
  requested_types?: GeneratedContentType[];
  active_job_id?: string | null;
  latest_job?: {
    id: string;
    status: string;
    type: string;
    types?: GeneratedContentType[];
    is_completed?: boolean;
    error_message?: string | null;
    started_at?: string | null;
    created_at: string;
    completed_at?: string | null;
  } | null;
  lesson: { generated: boolean; count: number; accepted?: boolean };
  flashcards: { generated: boolean; count: number; accepted?: boolean };
  exam: { generated: boolean; count: number; accepted?: boolean };
  review_summary?: { generated: boolean; count: number; accepted?: boolean };
  progress?: GenerationProgress;
  generationProgress?: DocumentGenerationProgressResource;
  can_generate: boolean;
  all_generated: boolean;
  job_completed?: boolean;
  has_publishable_content?: boolean;
};

/**
 * Service dedicated to calculating real database-backed content generation status for a document.
 */
export class GenerationContentStatusService {
  constructor(
    private readonly documentStore: DocumentStore,
    private readonly generatedContentStore: GeneratedContentStore,
    private readonly progressService: GenerationProgressService,
    private readonly queryService: GenerationQueryService,
    private readonly orgStore?: OrganizationStore,
    private readonly moduleStore?: ModuleStore,
    private readonly lessonStore?: LessonStore,
    private readonly flashcardStore?: FlashcardStore,
    private readonly quizStore?: QuizStore,
    private readonly quizQuestionStore?: QuizQuestionStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly generationJobStore?: GenerationJobStore,
  ) {}

  async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: AuthAction,
  ): Promise<Actor> {
    if (
      this.orgStore &&
      typeof this.orgStore.findById === "function"
    ) {
      const org = await this.orgStore.findById(organizationId);
      if (!org) {
        throw new DomainError("not_found", "Organization not found");
      }
    }

    let memberships = actor.memberships;
    if (
      !memberships &&
      this.orgStore &&
      typeof this.orgStore.listMembershipsByUserId === "function"
    ) {
      memberships = await this.orgStore.listMembershipsByUserId(
        actor.userId,
      );
    } else if (
      !memberships &&
      this.orgStore &&
      typeof this.orgStore.findMembership === "function"
    ) {
      const m = await this.orgStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (m) {
        memberships = [
          {
            organizationId,
            role: m.role as import("@avana/domain").Role,
          },
        ];
      }
    }

    const fullActor = buildActor({
      userId: actor.userId,
      globalRole:
        actor.globalRole ??
        (actor.role === "platform_admin" ? "platform_admin" : undefined),
      role: actor.role,
      memberships,
    });

    const resourceContext: ResourceContext = {
      organizationId,
      resourceType: "course",
    };

    if (!this.policy.can(fullActor, action, resourceContext)) {
      throw new DomainError("not_found", "Organization not found");
    }

    return fullActor;
  }

  private async requireDocument(
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentRecord> {

    const doc = await this.documentStore.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }
    return doc;
  }

  async getDocumentContentStatus(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    courseId?: CourseId,
  ): Promise<DocumentContentStatusResource> {
    await this.authorize(actor, organizationId, "content:review");
    const doc = await this.requireDocument(organizationId, documentId);

    // 1. Resolve all generated content records for this document
    const allDocContents = await this.generatedContentStore.listByDocument(
      documentId,
      organizationId,
    );
    const docContents = courseId
      ? allDocContents.filter((c) => !c.courseId || c.courseId === courseId)
      : allDocContents;
    const docContentIds = new Set(docContents.map((c) => c.id));

    const activeDrafts = docContents.filter(
      (c) =>
        c.deletedAt === null &&
        (c.status === "draft" || c.status === "edited"),
    );

    // 2. Calculate Lesson Status from DB & Drafts
    let lessonCount = 0;
    if (this.moduleStore && this.lessonStore) {
      let moduleRecord: ModuleRecord | undefined;
      if (courseId) {
        const courseModules = await this.moduleStore.listByCourse(courseId);
        moduleRecord = courseModules.find(
          (m) => m.documentId === documentId && m.deletedAt === null,
        );
      } else {
        moduleRecord = await this.moduleStore.findByDocument(documentId);
      }
      if (moduleRecord) {
        const lessons = await this.lessonStore.listByModule(moduleRecord.id);
        lessonCount = lessons.filter((l) => l.deletedAt === null).length;
      }
    }

    let draftLessonCount = 0;
    for (const draft of activeDrafts) {
      if (draft.type === "lesson") {
        const payload = draft.payload as LessonPayload | undefined;
        if (Array.isArray(payload?.sessions) && payload.sessions.length > 0) {
          draftLessonCount += payload.sessions.length;
        } else {
          draftLessonCount += 1;
        }
      }
    }

    // 3. Calculate Flashcards Status from DB & Drafts
    let flashcardCount = 0;
    if (this.flashcardStore) {
      const allCards = courseId
        ? await this.flashcardStore.listByCourse(courseId, organizationId)
        : await this.flashcardStore.listByOrganization(organizationId);
      flashcardCount = allCards.filter(
        (f: FlashcardRecord) =>
          (f.documentId === documentId || (f.generatedContentId && docContentIds.has(f.generatedContentId))) &&
          f.deletedAt === null &&
          (!courseId || !f.courseId || f.courseId === courseId),
      ).length;
    }

    let draftFlashcardCount = 0;
    for (const draft of activeDrafts) {
      if (draft.type === "flashcard") {
        type FlashcardShape = FlashcardPayload & { flashcards?: unknown[]; question?: unknown; answer?: unknown };
        const payload = draft.payload as FlashcardShape | undefined;
        if (Array.isArray(payload?.cards) && payload.cards.length > 0) {
          draftFlashcardCount += payload.cards.length;
        } else if (Array.isArray(payload?.flashcards) && payload.flashcards.length > 0) {
          draftFlashcardCount += payload.flashcards.length;
        } else if (payload?.question && payload?.answer) {
          draftFlashcardCount += 1;
        }
      }
    }

    // 4. Calculate Quizzes/Exam Status from DB & Drafts
    let quizCount = 0;
    let quizQuestionCount = 0;
    if (this.quizStore) {
      const allQuizzes = courseId
        ? await this.quizStore.listByCourse(courseId, organizationId)
        : await this.quizStore.listByOrganization(organizationId);
      const docQuizzes = allQuizzes.filter(
        (q: QuizRecord) =>
          (q.documentId === documentId ||
            (q.generatedContentId && docContentIds.has(q.generatedContentId))) &&
          q.deletedAt === null &&
          (!courseId || !q.courseId || q.courseId === courseId),
      );
      quizCount = docQuizzes.length;
      if (this.quizQuestionStore) {
        for (const q of docQuizzes) {
          const questions = await this.quizQuestionStore.listByQuiz(q.id);
          quizQuestionCount += questions.filter(
            (qq) => qq.deletedAt === null || qq.deletedAt === undefined,
          ).length;
        }
      }
    }

    let draftQuizQuestionCount = 0;
    for (const draft of activeDrafts) {
      if (draft.type === "quiz") {
        type QuizDraftShape = QuizPayload & { quiz?: { questions?: unknown[] } };
        const payload = draft.payload as QuizDraftShape | undefined;
        if (Array.isArray(payload?.questions) && payload.questions.length > 0) {
          draftQuizQuestionCount += payload.questions.length;
        } else if (Array.isArray(payload?.quiz?.questions) && payload.quiz.questions.length > 0) {
          draftQuizQuestionCount += payload.quiz.questions.length;
        } else {
          draftQuizQuestionCount += 1;
        }
      }
    }

    // 5. Calculate Review Summary Status from DB & Drafts
    let reviewSummaryCount = 0;
    const reviewSummaryItem = docContents.find(
      (c) =>
        c.type === "review_summary" &&
        c.deletedAt === null &&
        (c.status === "draft" || c.status === "edited" || c.status === "accepted"),
    );
    if (reviewSummaryItem) {
      reviewSummaryCount = 1;
    }
    const reviewSummaryGenerated = reviewSummaryCount > 0;

    const totalLessonCount = lessonCount > 0 ? lessonCount : draftLessonCount;
    const totalFlashcardCount = flashcardCount > 0 ? flashcardCount : draftFlashcardCount;
    const totalExamCount =
      quizQuestionCount > 0
        ? quizQuestionCount
        : (quizCount > 0 ? quizCount : draftQuizQuestionCount);

    const lessonGenerated = totalLessonCount > 0;
    const flashcardsGenerated = totalFlashcardCount > 0;
    const examGenerated = totalExamCount > 0;

    const hasAnyRegenerating = docContents.some(
      (c) => c.deletedAt === null && c.status === "regenerating",
    );

    // 6. Resolve requested content types from latest generation job if available
    let requestedTypes: GeneratedContentType[] | undefined = undefined;
    let latestJob: GenerationJobRecord | undefined = undefined;
    if (this.generationJobStore) {
      const jobs = await this.generationJobStore.listByDocument(
        documentId,
        organizationId,
      );
      const activeJobs = jobs.filter(
        (j) => j.deletedAt === null && (!courseId || !j.courseId || j.courseId === courseId),
      );
      if (activeJobs.length > 0) {
        activeJobs.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        latestJob = activeJobs[0];
        requestedTypes = normalizeRequestedContentTypes(latestJob.type);
      }
    }

    const activeJobId =
      latestJob && (latestJob.status === "queued" || latestJob.status === "running")
        ? latestJob.id
        : null;

    const progress = await this.queryService.getGenerationProgress(
      documentId,
      organizationId,
      requestedTypes,
    );

    const generatableDocStatuses = new Set([
      "uploaded",
      "extracted",
      "generating",
      "review_pending",
      "ready",
      "failed",
    ]);
    const isDocActivelyRunning =
      doc.status === "generating" && Boolean(progress && progress.status === "running");

    const isJobActive = Boolean(
      activeJobId ||
      latestJob?.status === "queued" ||
      latestJob?.status === "running" ||
      isDocActivelyRunning ||
      hasAnyRegenerating,
    );

    const isTypeGenerated = (t: GeneratedContentType): boolean => {
      if (t === "lesson") return lessonGenerated;
      if (t === "flashcard") return flashcardsGenerated;
      if (t === "quiz") return examGenerated;
      if (t === "review_summary") return reviewSummaryGenerated;
      return false;
    };

    const requestedTypesGenerated =
      requestedTypes && requestedTypes.length > 0
        ? requestedTypes.every((t) => isTypeGenerated(t))
        : (lessonGenerated && flashcardsGenerated && examGenerated && reviewSummaryGenerated);

    const jobCompleted = Boolean(
      latestJob &&
      latestJob.status === "succeeded" &&
      !isJobActive &&
      requestedTypesGenerated,
    );

    const allCoreGenerated =
      lessonGenerated &&
      flashcardsGenerated &&
      examGenerated &&
      reviewSummaryGenerated;

    // all_generated strictly evaluates whether all core types for this document are generated.
    // If only a subset (e.g. flashcards) was generated, all_generated remains false so user can generate other types.
    const allGenerated = !isJobActive && allCoreGenerated;

    const canGenerate =
      !allCoreGenerated &&
      generatableDocStatuses.has(doc.status) &&
      !isDocActivelyRunning &&
      !hasAnyRegenerating &&
      !isJobActive;

    // Compute accepted status for publish eligibility (publishableAcceptedContentCount >= 1)
    const activeAcceptedContents = docContents.filter(
      (c) => c.deletedAt === null && c.status === "accepted",
    );
    const lessonAccepted =
      activeAcceptedContents.some((c) => c.type === "lesson") || lessonCount > 0;
    const flashcardsAccepted =
      activeAcceptedContents.some((c) => c.type === "flashcard") || flashcardCount > 0;
    const examAccepted =
      activeAcceptedContents.some((c) => c.type === "quiz") || quizCount > 0;
    const reviewSummaryAccepted = activeAcceptedContents.some(
      (c) => c.type === "review_summary",
    );

    const hasPublishableContent = Boolean(
      lessonAccepted ||
      flashcardsAccepted ||
      examAccepted ||
      reviewSummaryAccepted,
    );

    const progressRecord = await this.progressService.getRecord(documentId, organizationId);
    const generationProgress = this.progressService.toResource(
      progressRecord,
      doc.status,
      doc.errorCode,
    );

    return {
      request_id: latestJob?.id ?? activeJobId ?? documentId,
      document_id: documentId,
      course_id: (courseId || doc.courseId || null) as CourseId | null,
      requested_types: requestedTypes,
      active_job_id: activeJobId,
      latest_job: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            type: latestJob.type,
            types: requestedTypes,
            error_message: latestJob.errorMessage,
            started_at: latestJob.startedAt,
            created_at: latestJob.createdAt,
            completed_at: latestJob.completedAt,
            is_completed: jobCompleted,
          }
        : null,
      job_completed: jobCompleted,
      lesson: {
        generated: lessonGenerated,
        count: totalLessonCount,
        accepted: lessonAccepted,
      },
      flashcards: {
        generated: flashcardsGenerated,
        count: totalFlashcardCount,
        accepted: flashcardsAccepted,
      },
      exam: {
        generated: examGenerated,
        count: totalExamCount,
        accepted: examAccepted,
      },
      review_summary: {
        generated: reviewSummaryGenerated,
        count: reviewSummaryCount,
        accepted: reviewSummaryAccepted,
      },
      progress,
      generationProgress,
      can_generate: canGenerate,
      all_generated: allGenerated,
      has_publishable_content: hasPublishableContent,
    };
  }
}
