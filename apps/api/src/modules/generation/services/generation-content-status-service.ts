import { randomUUID } from "node:crypto";
import {
  type Actor,
  type AuthAction,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type DocumentId,
  type GeneratedContentId,
  type GenerationProgress,
  type DocumentGenerationProgressResource,
  type LessonPayload,
  type FlashcardPayload,
  type QuizPayload,
  type QuizId,
  type OrganizationId,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import type { DocumentRecord, DocumentStore, ModuleStore, LessonStore } from "../../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation-store.js";
import type { GenerationProgressService } from "../generation-progress-service.js";
import type { FlashcardStore, QuizStore, QuizQuestionStore } from "../../study/study-store.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import type { GenerationQueryService } from "./generation-query-service.js";

export type DocumentContentStatusResource = {
  request_id: string;
  document_id: DocumentId;
  course_id: CourseId | null;
  lesson: { generated: boolean; count: number; accepted?: boolean };
  flashcards: { generated: boolean; count: number; accepted?: boolean };
  exam: { generated: boolean; count: number; accepted?: boolean };
  review_summary?: { generated: boolean; count: number; accepted?: boolean };
  progress?: GenerationProgress;
  generationProgress?: DocumentGenerationProgressResource;
  can_generate: boolean;
  all_generated: boolean;
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
  ) {}

  async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: AuthAction,
  ): Promise<void> {
    if (actor.role === "platform_admin") {
      if (
        this.orgStore &&
        typeof this.orgStore.findById === "function"
      ) {
        const org = await this.orgStore.findById(organizationId);
        if (!org) {
          throw new DomainError("not_found", "Organization not found");
        }
      }
      const context: AuthContext = { organizationId };
      this.policy.require(action, actor, context);
      return;
    }

    if (
      this.orgStore &&
      typeof this.orgStore.findMembership === "function"
    ) {
      const membership = await this.orgStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Organization not found");
      }
      const scopedActor = { ...actor, role: membership.role as Actor["role"] };
      const context: AuthContext = { organizationId };
      this.policy.require(action, scopedActor, context);
      return;
    }
    const context: AuthContext = { organizationId };
    this.policy.require(action, actor, context);
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
    const docContents = await this.generatedContentStore.listByDocument(
      documentId,
      organizationId,
    );
    const docContentIds = new Set(docContents.map((c) => c.id));

    const activeDrafts = docContents.filter(
      (c) =>
        c.deletedAt === null &&
        (c.status === "draft" || c.status === "edited"),
    );

    // 2. Calculate Lesson Status from DB & Drafts
    let lessonCount = 0;
    if (this.moduleStore && this.lessonStore) {
      const moduleRecord = await this.moduleStore.findByDocument(documentId);
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
      const allCards = await this.flashcardStore.listByOrganization(organizationId);
      flashcardCount = allCards.filter(
        (f) =>
          (f.documentId === documentId || (f.generatedContentId && docContentIds.has(f.generatedContentId))) &&
          f.deletedAt === null,
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
      type ExtendedQuizRecord = {
        id: string;
        deletedAt: string | null;
        documentId?: DocumentId | null;
        generatedContentId?: GeneratedContentId | null;
      };
      const allQuizzes = (await this.quizStore.listByOrganization(organizationId)) as unknown as ExtendedQuizRecord[];
      const docQuizzes = allQuizzes.filter(
        (q) =>
          (q.documentId === documentId ||
            (q.generatedContentId && docContentIds.has(q.generatedContentId))) &&
          q.deletedAt === null,
      );
      quizCount = docQuizzes.length;
      if (this.quizQuestionStore) {
        for (const q of docQuizzes) {
          type ExtendedQuestion = { id: string; deletedAt?: string | null };
          const questions = (await this.quizQuestionStore.listByQuiz(q.id as QuizId)) as unknown as ExtendedQuestion[];
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
        c.status !== "rejected",
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

    const allGenerated = lessonGenerated && flashcardsGenerated && examGenerated;

    const progress = await this.queryService.getGenerationProgress(
      documentId,
      organizationId,
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
    const canGenerate =
      !allGenerated &&
      generatableDocStatuses.has(doc.status) &&
      !isDocActivelyRunning;

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
      request_id: randomUUID(),
      document_id: documentId,
      course_id: (courseId || doc.courseId || null) as CourseId | null,
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
