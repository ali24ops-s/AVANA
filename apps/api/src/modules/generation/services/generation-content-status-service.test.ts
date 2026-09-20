import { describe, it, expect, beforeEach } from "vitest";
import { GenerationContentStatusService } from "./generation-content-status-service.js";
import { GenerationQueryService } from "./generation-query-service.js";
import { InMemoryGenerationChunkStore } from "../generation-chunk-store.js";
import { GenerationProgressService } from "../generation-progress-service.js";
import { InMemoryGenerationProgressStore } from "../generation-progress-store.js";
import { InMemoryGeneratedContentStore } from "../test/in-memory-stores.js";
import type { DocumentRecord, DocumentStore, ModuleStore, LessonStore } from "../../learning/learning-store.js";
import type { FlashcardStore, QuizStore, QuizQuestionStore } from "../../study/study-store.js";
import type { Actor, DocumentId, OrganizationId, CourseId, GeneratedContentId, GeneratedContentPayload } from "@avana/domain";

describe("GenerationContentStatusService (Unit Tests)", () => {
  let contentStatusService: GenerationContentStatusService;
  let queryService: GenerationQueryService;
  let chunkStore: InMemoryGenerationChunkStore;
  let progressService: GenerationProgressService;
  let contentStore: InMemoryGeneratedContentStore;
  let mockDocStore: DocumentStore;
  let mockModuleStore: ModuleStore;
  let mockLessonStore: LessonStore;
  let mockFlashcardStore: FlashcardStore;
  let mockQuizStore: QuizStore;
  let mockQuizQuestionStore: QuizQuestionStore;

  const orgId = "org-1" as OrganizationId;
  const docId = "doc-1" as DocumentId;
  const courseId = "course-1" as CourseId;
  const actor: Actor = { userId: "user-1", role: "organization_admin", organizationId: orgId };

  beforeEach(() => {
    chunkStore = new InMemoryGenerationChunkStore();
    progressService = new GenerationProgressService(new InMemoryGenerationProgressStore());
    contentStore = new InMemoryGeneratedContentStore();

    mockDocStore = {
      findByIdForOrganization: async (id: string, org: string) => {
        if (id === docId && org === orgId) {
          return {
            id: docId,
            organizationId: orgId,
            originalName: "cardiology.pdf",
            courseId: courseId,
            status: "ready",
            ownerUserId: "user-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          } as unknown as DocumentRecord;
        }
        return null;
      },
    } as unknown as DocumentStore;

    mockModuleStore = {
      findByDocument: async (dId: string) => {
        if (dId === docId) {
          return { id: "mod-1", documentId: docId };
        }
        return null;
      },
    } as unknown as ModuleStore;

    mockLessonStore = {
      listByModule: async (mId: string) => {
        if (mId === "mod-1") {
          return [
            { id: "les-1", moduleId: "mod-1", deletedAt: null },
            { id: "les-2", moduleId: "mod-1", deletedAt: null },
          ];
        }
        return [];
      },
    } as unknown as LessonStore;

    mockFlashcardStore = {
      listByOrganization: async (oId: string) => {
        if (oId === orgId) {
          return [
            { id: "fc-1", documentId: docId, deletedAt: null },
            { id: "fc-2", documentId: docId, deletedAt: null },
            { id: "fc-3", documentId: docId, deletedAt: null },
          ];
        }
        return [];
      },
    } as unknown as FlashcardStore;

    mockQuizStore = {
      listByOrganization: async (oId: string) => {
        if (oId === orgId) {
          return [
            { id: "quiz-1", documentId: docId, deletedAt: null },
          ];
        }
        return [];
      },
    } as unknown as QuizStore;

    mockQuizQuestionStore = {
      listByQuiz: async (qId: string) => {
        if (qId === "quiz-1") {
          return [
            { id: "qq-1", quizId: "quiz-1", deletedAt: null },
            { id: "qq-2", quizId: "quiz-1", deletedAt: null },
          ];
        }
        return [];
      },
    } as unknown as QuizQuestionStore;

    queryService = new GenerationQueryService(
      mockDocStore,
      chunkStore,
      progressService,
    );

    contentStatusService = new GenerationContentStatusService(
      mockDocStore,
      contentStore,
      progressService,
      queryService,
      undefined,
      mockModuleStore,
      mockLessonStore,
      mockFlashcardStore,
      mockQuizStore,
      mockQuizQuestionStore,
    );
  });

  it("throws not_found if document is not found", async () => {
    await expect(
      contentStatusService.getDocumentContentStatus(actor, orgId, "non-existent" as DocumentId)
    ).rejects.toThrow(/Document not found/);
  });

  it("calculates status from published/store items correctly", async () => {
    const status = await contentStatusService.getDocumentContentStatus(actor, orgId, docId);

    expect(status.document_id).toBe(docId);
    expect(status.course_id).toBe(courseId);
    expect(status.lesson.generated).toBe(true);
    expect(status.lesson.count).toBe(2);
    expect(status.lesson.accepted).toBe(true);

    expect(status.flashcards.generated).toBe(true);
    expect(status.flashcards.count).toBe(3);
    expect(status.flashcards.accepted).toBe(true);

    expect(status.exam.generated).toBe(true);
    expect(status.exam.count).toBe(2);
    expect(status.exam.accepted).toBe(true);

    expect(status.review_summary.generated).toBe(false);
    expect(status.all_generated).toBe(false);
    expect(status.has_publishable_content).toBe(true);
    expect(status.can_generate).toBe(true);
  });

  it("marks all_generated=true and can_generate=false when all 4 content types exist", async () => {
    await contentStore.create({
      id: "gen-rev-1" as unknown as GeneratedContentId,
      documentId: docId,
      organizationId: orgId,
      type: "review_summary",
      status: "accepted",
      payload: { summary: "Great overview" } as unknown as GeneratedContentPayload,
      confidenceScore: 0.95,
      reviewNotes: null,
      reviewedByUserId: "user-1",
      reviewedAt: new Date().toISOString(),
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const status = await contentStatusService.getDocumentContentStatus(actor, orgId, docId);

    expect(status.lesson.generated).toBe(true);
    expect(status.flashcards.generated).toBe(true);
    expect(status.exam.generated).toBe(true);
    expect(status.review_summary.generated).toBe(true);
    expect(status.all_generated).toBe(true);
    expect(status.can_generate).toBe(false);
  });

  it("calculates draft counts from generated content store when no DB records exist", async () => {
    const freshService = new GenerationContentStatusService(
      mockDocStore,
      contentStore,
      progressService,
      queryService,
    );

    await contentStore.create({
      id: "gen-lesson-1" as unknown as GeneratedContentId,
      documentId: docId,
      organizationId: orgId,
      type: "lesson",
      status: "draft",
      payload: {
        sessions: [{ title: "S1" }, { title: "S2" }, { title: "S3" }],
      } as unknown as GeneratedContentPayload,
      confidenceScore: 0.9,
      reviewNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await contentStore.create({
      id: "gen-fc-1" as unknown as GeneratedContentId,
      documentId: docId,
      organizationId: orgId,
      type: "flashcard",
      status: "draft",
      payload: {
        cards: [{ front: "Q1", back: "A1" }, { front: "Q2", back: "A2" }],
      } as unknown as GeneratedContentPayload,
      confidenceScore: 0.9,
      reviewNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const status = await freshService.getDocumentContentStatus(actor, orgId, docId);

    expect(status.lesson.generated).toBe(true);
    expect(status.lesson.count).toBe(3);
    expect(status.lesson.accepted).toBe(false);

    expect(status.flashcards.generated).toBe(true);
    expect(status.flashcards.count).toBe(2);
    expect(status.flashcards.accepted).toBe(false);

    expect(status.exam.generated).toBe(false);
    expect(status.all_generated).toBe(false);
    expect(status.can_generate).toBe(true);
    expect(status.has_publishable_content).toBe(false);
  });

  it("counts review summary if active and not rejected", async () => {
    const freshService = new GenerationContentStatusService(
      mockDocStore,
      contentStore,
      progressService,
      queryService,
    );

    await contentStore.create({
      id: "gen-rev-1" as unknown as GeneratedContentId,
      documentId: docId,
      organizationId: orgId,
      type: "review_summary",
      status: "accepted",
      payload: { summary: "Great overview" } as unknown as GeneratedContentPayload,
      confidenceScore: 0.95,
      reviewNotes: null,
      reviewedByUserId: "user-1",
      reviewedAt: new Date().toISOString(),
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const status = await freshService.getDocumentContentStatus(actor, orgId, docId);
    expect(status.review_summary.generated).toBe(true);
    expect(status.review_summary.count).toBe(1);
    expect(status.review_summary.accepted).toBe(true);
    expect(status.has_publishable_content).toBe(true);
  });

  it("does not count review summary as generated or accepted when status is regenerating", async () => {
    await contentStore.create({
      id: "gen-rev-regen" as unknown as GeneratedContentId,
      documentId: docId,
      organizationId: orgId,
      type: "review_summary",
      status: "regenerating",
      payload: { summary: "Overview regenerating..." } as unknown as GeneratedContentPayload,
      confidenceScore: 0.9,
      reviewNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const status = await contentStatusService.getDocumentContentStatus(actor, orgId, docId);

    // lesson, flashcard, exam are generated from mockStores
    expect(status.lesson.generated).toBe(true);
    expect(status.flashcards.generated).toBe(true);
    expect(status.exam.generated).toBe(true);

    // review_summary is regenerating: generated=false, accepted=false
    expect(status.review_summary.generated).toBe(false);
    expect(status.review_summary.accepted).toBe(false);

    // all_generated must be FALSE
    expect(status.all_generated).toBe(false);

    // can_generate must be FALSE because a regeneration job is currently in progress
    expect(status.can_generate).toBe(false);
  });

  it("does not count any regenerating content type in all_generated", async () => {
    const freshService = new GenerationContentStatusService(
      mockDocStore,
      contentStore,
      progressService,
      queryService,
    );

    await contentStore.create({
      id: "gen-lesson-regen" as unknown as GeneratedContentId,
      documentId: docId,
      organizationId: orgId,
      type: "lesson",
      status: "regenerating",
      payload: { sessions: [{ title: "S1" }] } as unknown as GeneratedContentPayload,
      confidenceScore: 0.9,
      reviewNotes: null,
      reviewedByUserId: null,
      reviewedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const status = await freshService.getDocumentContentStatus(actor, orgId, docId);
    expect(status.lesson.generated).toBe(false);
    expect(status.all_generated).toBe(false);
    expect(status.can_generate).toBe(false);
  });
});
