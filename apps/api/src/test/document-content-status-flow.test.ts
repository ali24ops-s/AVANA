import { describe, it, expect, beforeEach } from "vitest";
import type {
  Actor,
  CourseId,
  DocumentChunkId,
  DocumentId,
  GeneratedContentId,
  LessonId,
  ModuleId,
  OrganizationId,
  QuizId,
  UserId,
  FlashcardId,
} from "@avana/domain";
import { defaultPolicy, DomainError } from "@avana/domain";
import { GenerationService } from "../modules/generation/generation-service.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import { MockModelGateway } from "../modules/generation/gateway/index.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
} from "../modules/study/test/in-memory-stores.js";

describe("Document Content Status & DB Source of Truth Flow", () => {
  let orgId: OrganizationId;
  let courseId: CourseId;
  let docId: DocumentId;
  let actor: Actor;

  let generatedContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let gateway: MockModelGateway;

  let generationService: GenerationService;

  beforeEach(async () => {
    orgId = "org-test-100" as OrganizationId;
    courseId = "course-test-100" as CourseId;
    docId = "doc-test-100" as DocumentId;
    actor = {
      userId: "user-test-1" as UserId,
      role: "course_editor",
    };

    generatedContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    gateway = new MockModelGateway();

    generationService = new GenerationService(
      generatedContentStore,
      citationStore,
      gateway,
      documentStore,
      chunkStore,
      defaultPolicy,
      undefined,
      undefined,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
    );

    // Seed document in extracted state
    documentStore.insert({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: actor.userId,
      originalName: "medical_pharmacology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024 * 50,
      sha256: "hash123",
      storageKey: "key123",
      status: "extracted",
      pageCount: 10,
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Seed chunk
    chunkStore.insert({
      id: "chunk-1" as DocumentChunkId,
      documentId: docId,
      organizationId: orgId,
      sequence: 0,
      heading: "Cardiology",
      content: "Pharmacology of cardiac glycosides and digoxin mechanisms in human biology.",
      startPage: 1,
      endPage: 1,
      tokenEstimate: 20,
      contentHash: "hash-chunk-1",
      createdAt: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // Test 1: Fresh document -> All 3 not generated -> can_generate is true
  // -------------------------------------------------------------------------
  it("computes all false for fresh document with no DB records", async () => {
    const status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );

    expect(status.lesson.generated).toBe(false);
    expect(status.lesson.count).toBe(0);
    expect(status.flashcards.generated).toBe(false);
    expect(status.flashcards.count).toBe(0);
    expect(status.exam.generated).toBe(false);
    expect(status.exam.count).toBe(0);
    expect(status.all_generated).toBe(false);
    expect(status.can_generate).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 2: Materialized Lesson in DB -> lesson.generated is true
  // -------------------------------------------------------------------------
  it("detects materialized lessons in DB for the document's module", async () => {
    const modId = "mod-1" as ModuleId;
    moduleStore.insert({
      id: modId,
      courseId,
      documentId: docId,
      title: "Cardiology Module",
      description: "Description",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lessonStore.insert({
      id: "les-1" as LessonId,
      moduleId: modId,
      title: "Digoxin Mechanism",
      contentMarkdown: "# Digoxin",
      sortOrder: 1,
      contentType: "markdown",
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );

    expect(status.lesson.generated).toBe(true);
    expect(status.lesson.count).toBe(1);
    expect(status.flashcards.generated).toBe(false);
    expect(status.exam.generated).toBe(false);
    expect(status.all_generated).toBe(false);
    expect(status.can_generate).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3: Materialized Flashcards and Quizzes in DB
  // -------------------------------------------------------------------------
  it("detects active flashcards and quizzes in DB", async () => {
    flashcardStore.insert({
      id: "fc-1" as FlashcardId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      generatedContentId: null,
      lessonId: null,
      question: "What is Digoxin?",
      answer: "A cardiac glycoside",
      explanation: null,
      difficulty: "medium",
      cardType: "standard",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    quizStore.insert({
      id: "qz-1" as QuizId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      title: "Pharmacology Quiz",
      topic: "Cardiology",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );

    expect(status.lesson.generated).toBe(false);
    expect(status.flashcards.generated).toBe(true);
    expect(status.flashcards.count).toBe(1);
    expect(status.exam.generated).toBe(true);
    expect(status.exam.count).toBe(1);
    expect(status.all_generated).toBe(false);
    expect(status.can_generate).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 4: All 3 exist in DB -> all_generated: true, can_generate: false
  // -------------------------------------------------------------------------
  it("marks all_generated=true and can_generate=false when all 3 exist in DB", async () => {
    const modId = "mod-2" as ModuleId;
    moduleStore.insert({
      id: modId,
      courseId,
      documentId: docId,
      title: "Cardiology Module",
      description: "Description",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lessonStore.insert({
      id: "les-2" as LessonId,
      moduleId: modId,
      title: "Digoxin Mechanism",
      contentMarkdown: "# Digoxin",
      sortOrder: 1,
      contentType: "markdown",
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    flashcardStore.insert({
      id: "fc-2" as FlashcardId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      generatedContentId: null,
      lessonId: null,
      question: "Q?",
      answer: "A!",
      explanation: null,
      difficulty: "medium",
      cardType: "standard",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    quizStore.insert({
      id: "qz-2" as QuizId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      title: "Exam 1",
      topic: "Cardiology",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );

    expect(status.lesson.generated).toBe(true);
    expect(status.flashcards.generated).toBe(true);
    expect(status.exam.generated).toBe(true);
    expect(status.all_generated).toBe(true);
    expect(status.can_generate).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 5: Deleting Flashcards restores flashcards to not generated
  // -------------------------------------------------------------------------
  it("restores flashcards to not generated when flashcards are soft-deleted", async () => {
    flashcardStore.insert({
      id: "fc-3" as FlashcardId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      generatedContentId: null,
      lessonId: null,
      question: "Q?",
      answer: "A!",
      explanation: null,
      difficulty: "medium",
      cardType: "standard",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    let status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );
    expect(status.flashcards.generated).toBe(true);

    // Delete flashcards for document
    await flashcardStore.deleteByDocument(docId, orgId);

    status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );
    expect(status.flashcards.generated).toBe(false);
    expect(status.flashcards.count).toBe(0);
    expect(status.can_generate).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 6: Deleting Lesson restores lesson to not generated
  // -------------------------------------------------------------------------
  it("restores lesson to not generated when lessons are deleted", async () => {
    const modId = "mod-3" as ModuleId;
    moduleStore.insert({
      id: modId,
      courseId,
      documentId: docId,
      title: "Cardiology",
      description: "",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const lesId = "les-3" as LessonId;
    lessonStore.insert({
      id: lesId,
      moduleId: modId,
      title: "Digoxin",
      contentMarkdown: "Content",
      sortOrder: 1,
      contentType: "markdown",
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    let status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );
    expect(status.lesson.generated).toBe(true);

    // Soft delete lesson
    const les = await lessonStore.findById(lesId);
    if (les) {
      await lessonStore.update({
        ...les,
        deletedAt: new Date().toISOString(),
      });
    }

    status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );
    expect(status.lesson.generated).toBe(false);
    expect(status.lesson.count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 7: Deleting Quiz restores exam to not generated
  // -------------------------------------------------------------------------
  it("restores exam to not generated when quiz is soft-deleted", async () => {
    quizStore.insert({
      id: "qz-3" as QuizId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      title: "Exam",
      topic: "Cardiology",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    let status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );
    expect(status.exam.generated).toBe(true);

    await quizStore.deleteByDocument(docId, orgId);

    status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );
    expect(status.exam.generated).toBe(false);
    expect(status.exam.count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 8: Server-side validation blocks duplicate generation
  // -------------------------------------------------------------------------
  it("server-side generateForDocument throws conflict when requesting already-existing content", async () => {
    flashcardStore.insert({
      id: "fc-4" as FlashcardId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      generatedContentId: null,
      lessonId: null,
      question: "Q?",
      answer: "A!",
      explanation: null,
      difficulty: "medium",
      cardType: "standard",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Requesting only flashcards when flashcards already exist -> Conflict
    await expect(
      generationService.generateForDocument(actor, orgId, docId, {
        types: ["flashcard"],
        courseId,
      }),
    ).rejects.toThrow(DomainError);
  });

  // -------------------------------------------------------------------------
  // Test 9: Draft with multiple flashcards correctly computes total count
  // -------------------------------------------------------------------------
  it("accurately counts multiple flashcards from draft payload cards array", async () => {
    generatedContentStore.insert({
      id: "gen-fc-1" as GeneratedContentId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: [
          { question: "Q1", answer: "A1" },
          { question: "Q2", answer: "A2" },
          { question: "Q3", answer: "A3" },
          { question: "Q4", answer: "A4" },
          { question: "Q5", answer: "A5" },
        ],
        citationChunkIds: [],
      },
      generationKey: null,
      promptVersion: null,
      model: "test-model",
      tokenUsage: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      acceptedBy: null,
      acceptedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );

    expect(status.flashcards.generated).toBe(true);
    expect(status.flashcards.count).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Test 10: Multiple materialized flashcards in DB correctly computes total count
  // -------------------------------------------------------------------------
  it("accurately counts multiple materialized flashcards in DB", async () => {
    for (let i = 1; i <= 8; i++) {
      flashcardStore.insert({
        id: `fc-multi-${i}` as FlashcardId,
        organizationId: orgId,
        courseId,
        documentId: docId,
        generatedContentId: null,
        lessonId: null,
        question: `Q${i}`,
        answer: `A${i}`,
        explanation: null,
        difficulty: "medium",
        cardType: "standard",
        dueAt: new Date().toISOString(),
        intervalDays: 0,
        easeFactor: 2.5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    }

    const status = await generationService.getDocumentContentStatus(
      actor,
      orgId,
      docId,
      courseId,
    );

    expect(status.flashcards.generated).toBe(true);
    expect(status.flashcards.count).toBe(8);
  });

  // =========================================================================
  // Publish Eligibility Invariant Verification (8 Strict Scenarios)
  // Invariant: has_publishable_content is true iff at least 1 accepted content exists
  // =========================================================================
  describe("Publish Eligibility Invariant (8 Conditions)", () => {
    // Condition 1: Lesson accepted => Publish visible
    it("1. Lesson accepted => has_publishable_content: true", async () => {
      generatedContentStore.insert({
        id: "gen-lesson-acc" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "lesson",
        status: "accepted",
        payload: { kind: "lesson", sessions: [{ title: "L1" }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: "admin",
        reviewedAt: new Date().toISOString(),
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: "admin",
        acceptedAt: new Date().toISOString(),
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.lesson.accepted).toBe(true);
      expect(status.has_publishable_content).toBe(true);
    });

    // Condition 2: Lesson generated but draft => Publish hidden
    it("2. Lesson generated but draft => has_publishable_content: false", async () => {
      generatedContentStore.insert({
        id: "gen-lesson-draft" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "lesson",
        status: "draft",
        payload: { kind: "lesson", sessions: [{ title: "L1" }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: null,
        acceptedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.lesson.generated).toBe(true);
      expect(status.lesson.accepted).toBe(false);
      expect(status.has_publishable_content).toBe(false);
    });

    // Condition 3: Lesson rejected => Publish hidden
    it("3. Lesson rejected => has_publishable_content: false", async () => {
      generatedContentStore.insert({
        id: "gen-lesson-rej" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "lesson",
        status: "rejected",
        payload: { kind: "lesson", sessions: [{ title: "L1" }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: "admin",
        reviewedAt: new Date().toISOString(),
        reviewReason: "Not accurate",
        editedBy: null,
        editedAt: null,
        acceptedBy: null,
        acceptedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.lesson.accepted).toBe(false);
      expect(status.has_publishable_content).toBe(false);
    });

    // Condition 4: Flashcard accepted => Publish visible
    it("4. Flashcard accepted => has_publishable_content: true", async () => {
      generatedContentStore.insert({
        id: "gen-fc-acc" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "flashcard",
        status: "accepted",
        payload: { kind: "flashcard", cards: [{ question: "Q1", answer: "A1" }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: "admin",
        reviewedAt: new Date().toISOString(),
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: "admin",
        acceptedAt: new Date().toISOString(),
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.flashcards.accepted).toBe(true);
      expect(status.has_publishable_content).toBe(true);
    });

    // Condition 5: Quiz accepted => Publish visible
    it("5. Quiz accepted => has_publishable_content: true", async () => {
      generatedContentStore.insert({
        id: "gen-quiz-acc" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "quiz",
        status: "accepted",
        payload: { kind: "quiz", questions: [{ question: "Q1", options: ["A", "B"], correctIndex: 0 }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: "admin",
        reviewedAt: new Date().toISOString(),
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: "admin",
        acceptedAt: new Date().toISOString(),
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.exam.accepted).toBe(true);
      expect(status.has_publishable_content).toBe(true);
    });

    // Condition 6: Review Summary accepted => Publish visible
    it("6. Review Summary accepted => has_publishable_content: true", async () => {
      generatedContentStore.insert({
        id: "gen-sum-acc" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "review_summary",
        status: "accepted",
        payload: { kind: "review_summary", summary: "Test summary", keyTakeaways: [] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: "admin",
        reviewedAt: new Date().toISOString(),
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: "admin",
        acceptedAt: new Date().toISOString(),
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.review_summary?.accepted).toBe(true);
      expect(status.has_publishable_content).toBe(true);
    });

    // Condition 7: Only draft and rejected contents => Publish hidden
    it("7. Only draft and rejected contents => has_publishable_content: false", async () => {
      generatedContentStore.insert({
        id: "gen-l-draft" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "lesson",
        status: "draft",
        payload: { kind: "lesson", sessions: [{ title: "L1" }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: null,
        acceptedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
      generatedContentStore.insert({
        id: "gen-fc-rej" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "flashcard",
        status: "rejected",
        payload: { kind: "flashcard", cards: [{ question: "Q1", answer: "A1" }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: "admin",
        reviewedAt: new Date().toISOString(),
        reviewReason: "Bad cards",
        editedBy: null,
        editedAt: null,
        acceptedBy: null,
        acceptedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.lesson.accepted).toBe(false);
      expect(status.flashcards.accepted).toBe(false);
      expect(status.has_publishable_content).toBe(false);
    });

    // Condition 8: Lesson draft + Quiz accepted => Publish visible
    it("8. Lesson draft + Quiz accepted => has_publishable_content: true", async () => {
      generatedContentStore.insert({
        id: "gen-l-draft-8" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "lesson",
        status: "draft",
        payload: { kind: "lesson", sessions: [{ title: "L1" }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: null,
        acceptedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
      generatedContentStore.insert({
        id: "gen-q-acc-8" as GeneratedContentId,
        organizationId: orgId,
        documentId: docId,
        courseId,
        type: "quiz",
        status: "accepted",
        payload: { kind: "quiz", questions: [{ question: "Q1", options: ["A", "B"], correctIndex: 0 }] } as any,
        generationKey: null,
        promptVersion: null,
        model: "test-model",
        tokenUsage: null,
        reviewedBy: "admin",
        reviewedAt: new Date().toISOString(),
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        acceptedBy: "admin",
        acceptedAt: new Date().toISOString(),
        previousPayload: null,
        materializedLessonId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const status = await generationService.getDocumentContentStatus(
        actor,
        orgId,
        docId,
        courseId,
      );

      expect(status.lesson.accepted).toBe(false);
      expect(status.exam.accepted).toBe(true);
      expect(status.has_publishable_content).toBe(true);
    });
  });
});
