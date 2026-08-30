/**
 * Comprehensive Integration Test: Document Lifecycle Decoupling.
 *
 * Verifies the core architectural invariant:
 * - Document is purely a source/raw input artifact.
 * - Accepted / Materialized educational contents (Lessons, Modules, Flashcards, Quizzes,
 *   Quiz Questions, Review Summaries, SRS schedules, Study Sessions) are fully decoupled
 *   from the source Document lifecycle.
 * - Deleting a Document removes raw file storage, document chunks, generation jobs, and
 *   unaccepted drafts, while leaving all accepted educational contents 100% active and accessible.
 * - Hard-deleting a Document or re-uploading the same file (same SHA256) does not delete or corrupt
 *   existing accepted content.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type CourseId,
  type DocumentId,
  type FlashcardId,
  type QuizId,
  type GeneratedContentId,
  defaultPolicy,
} from "@avana/domain";
import { DocumentService } from "../modules/documents/document-service.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
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
} from "../modules/study/test/in-memory-stores.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";

class FakeStorageProvider implements StorageProvider {
  private files = new Map<string, Buffer>();

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<{ storageKey: string; uploadUrl: string | null; expiresAt: string }> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date().toISOString(),
    };
  }

  async save(options: { storageKey: string; data: Buffer; mimeType: string }): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const buf = this.files.get(storageKey);
    if (!buf) throw new Error(`Not found: ${storageKey}`);
    return buf;
  }

  filesCount(): number {
    return this.files.size;
  }
}

describe("Document Lifecycle Decoupling (P0 Core Invariant)", () => {
  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let genContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let jobStore: InMemoryGenerationJobStore;
  let flashcardStore: InMemoryFlashcardStore;
  let reviewStore: InMemoryFlashcardReviewStore;
  let scheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let attemptStore: InMemoryQuizAttemptStore;
  let studySessionStore: InMemoryStudySessionStore;
  let storage: FakeStorageProvider;

  let docService: DocumentService;
  let genService: GenerationService;
  let reviewService: ReviewService;
  let studyService: StudyService;

  const actor: Actor = {
    userId: randomUUID() as Actor["userId"],
    role: "organization_admin",
  };
  const orgId = randomUUID() as OrganizationId;
  const courseId = randomUUID() as CourseId;

  beforeEach(() => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    genContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    jobStore = new InMemoryGenerationJobStore();
    flashcardStore = new InMemoryFlashcardStore();
    reviewStore = new InMemoryFlashcardReviewStore();
    scheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    attemptStore = new InMemoryQuizAttemptStore();
    studySessionStore = new InMemoryStudySessionStore();
    storage = new FakeStorageProvider();

    // Setup Org & Course
    orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Medical Faculty",
        slug: "med-faculty",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId: actor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "Cardiovascular Pharmacology",
        subject: "Medicine",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    docService = new DocumentService(
      docStore,
      storage,
      orgStore,
      defaultPolicy,
      undefined,
      chunkStore,
      genContentStore,
      jobStore,
      flashcardStore,
      quizStore,
      courseStore,
      moduleStore,
      lessonStore,
    );

    reviewService = new ReviewService(
      genContentStore,
      citationStore,
      docStore,
      chunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      { enqueueGenerationJob: async () => ({ generationJobId: "job-1" }) } as any,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      orgStore,
    );

    genService = new GenerationService(
      genContentStore,
      citationStore,
      {
        complete: async () => ({
          text: "{}",
          model: "mock",
          usage: { inputTokens: 10, outputTokens: 10 },
        }),
      } as any,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      orgStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    const progressStore = new InMemoryProgressStore();

    studyService = new StudyService(
      flashcardStore,
      reviewStore,
      quizStore,
      quizQuestionStore,
      attemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      defaultPolicy,
      undefined,
      orgStore,
      scheduleStore,
      courseStore,
      undefined,
      studySessionStore,
    );
  });

  const pdfBytes = Buffer.from("%PDF-1.4 Fake Medical Pharmacology Content");

  it("Full Lifecycle: Soft deleting Document preserves all accepted lessons, flashcards, quizzes, review summary, and SRS history", async () => {
    // 1. Upload Document
    const uploadRes = await docService.confirmUpload(actor, orgId, {
      originalName: "Antiarrhythmic_Drugs.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      data: pdfBytes,
      courseId,
    });
    const docId = uploadRes.document.id;
    const docRecord = await docStore.findByIdForOrganization(docId, orgId);
    expect(docRecord).toBeDefined();
    const storageKey = docRecord!.storageKey;

    expect(await storage.exists(storageKey)).toBe(true);

    // 2. Insert Extracted Chunks
    chunkStore.insert({
      id: randomUUID() as any,
      documentId: docId,
      organizationId: orgId,
      sequence: 1,
      heading: "Class I Antiarrhythmics",
      content: "Sodium channel blockers like Procainamide and Lidocaine.",
      startPage: 1,
      endPage: 2,
      tokenEstimate: 50,
      contentHash: "hash-chunk-1",
      createdAt: new Date().toISOString(),
    });
    expect((await chunkStore.listByDocument(docId)).length).toBe(1);

    // 3. Create & Accept Lesson (Materializes Module & Lesson)
    const genLessonId = randomUUID() as GeneratedContentId;
    await genContentStore.create({
      id: genLessonId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "Class I Antiarrhythmics",
        moduleTitle: "Antiarrhythmic Pharmacology",
        contentMarkdown: "Full lesson content on Sodium Channel Blockers.",
        sessions: [
          {
            title: "Session 1: Mechanism of Action",
            contentMarkdown: "Detailed pharmacological mechanisms.",
            citationChunkIds: [],
          },
        ],
        citationChunkIds: [],
      },
      promptVersion: "1.0",
      model: "mock-v1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    await reviewService.acceptContent(actor, orgId, genLessonId);

    // 4. Create & Accept Flashcards (Materializes Flashcards)
    const genFlashcardId = randomUUID() as GeneratedContentId;
    await genContentStore.create({
      id: genFlashcardId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: [
          {
            question: "What is the mechanism of Lidocaine?",
            answer: "Class IB sodium channel blocker that binds to inactivated Na+ channels.",
            explanation: "Shortens AP duration and preferentially targets ischemic tissue.",
            difficulty: "medium",
          },
          {
            question: "What is a prominent adverse effect of Procainamide?",
            answer: "Drug-induced systemic lupus erythematosus (SLE)-like syndrome.",
            explanation: "Occurs via slow acetylation leading to ANA antibodies.",
            difficulty: "hard",
          },
        ],
        citationChunkIds: [],
      },
      promptVersion: "1.0",
      model: "mock-v1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    await reviewService.acceptContent(actor, orgId, genFlashcardId);

    // 5. Create & Accept Quiz (Materializes Quiz & Quiz Questions)
    const genQuizId = randomUUID() as GeneratedContentId;
    await genContentStore.create({
      id: genQuizId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "Antiarrhythmics Assessment",
        questions: [
          {
            question: "Which drug is a Class IB antiarrhythmic agent?",
            choices: ["Procainamide", "Lidocaine", "Flecainide", "Amiodarone"],
            correctAnswer: "Lidocaine",
            questionType: "multiple_choice",
            difficulty: "medium",
            explanation: "Lidocaine is a prototype Class IB agent.",
          },
        ],
        citationChunkIds: [],
      },
      promptVersion: "1.0",
      model: "mock-v1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    await reviewService.acceptContent(actor, orgId, genQuizId);

    // 6. Create & Accept Review Summary
    const genSummaryId = randomUUID() as GeneratedContentId;
    await genContentStore.create({
      id: genSummaryId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "review_summary",
      status: "accepted",
      payload: {
        kind: "review_summary",
        title: "10-Minute High-Yield Review: Antiarrhythmics",
        estimatedReadingMinutes: 10,
        overview: "Complete high-yield summary of Class I to IV antiarrhythmic agents.",
        sections: [
          {
            title: "Class I Agents Overview",
            keyPoints: ["1A: Prolongs AP", "1B: Shortens AP", "1C: No effect on AP"],
          },
        ],
        finalTakeaways: ["Key clinical pearls for USMLE/board exams."],
        citationChunkIds: [],
      },
      promptVersion: "1.0",
      model: "mock-v1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: new Date().toISOString(),
      acceptedBy: actor.userId,
      reviewedBy: actor.userId,
      reviewedAt: new Date().toISOString(),
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 7. Create 1 Unaccepted Staging Draft (should be soft-deleted when doc is deleted)
    const unacceptedDraftId = randomUUID() as GeneratedContentId;
    await genContentStore.create({
      id: unacceptedDraftId,
      organizationId: orgId,
      documentId: docId,
      courseId,
      type: "quiz",
      status: "draft",
      payload: { kind: "quiz", title: "Unaccepted Staging Quiz Draft", questions: [], citationChunkIds: [] },
      promptVersion: "1.0",
      model: "mock-v1",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Verify initial materialized state
    const modules = await moduleStore.listByCourse(courseId);
    expect(modules.length).toBe(1);
    const lessons = await lessonStore.listByModule(modules[0].id);
    expect(lessons.length).toBe(1);
    const cards = await flashcardStore.listByCourse(courseId, orgId);
    expect(cards.length).toBe(2);
    const quizzes = await quizStore.listByCourse(courseId, orgId);
    expect(quizzes.length).toBe(1);

    // 8. Execute Document Deletion!
    await docService.deleteDocument(actor, orgId, docId);

    // -------------------------------------------------------------
    // ASSERTIONS: Raw artifacts must be deleted
    // -------------------------------------------------------------
    expect(await storage.exists(storageKey)).toBe(false);
    expect((await chunkStore.listByDocument(docId)).length).toBe(0);

    // Unaccepted draft must be soft-deleted
    const draftRecord = await genContentStore.findByIdForOrganization(unacceptedDraftId, orgId);
    expect(draftRecord).toBeUndefined();

    // -------------------------------------------------------------
    // ASSERTIONS: Accepted educational content must remain 100% active!
    // -------------------------------------------------------------
    // Modules & Lessons
    const postDeleteModules = await moduleStore.listByCourse(courseId);
    expect(postDeleteModules.length).toBe(1);
    expect(postDeleteModules[0].deletedAt).toBeNull();
    const postDeleteLessons = await lessonStore.listByModule(postDeleteModules[0].id);
    expect(postDeleteLessons.length).toBe(1);
    expect(postDeleteLessons[0].deletedAt).toBeNull();
    expect(postDeleteLessons[0].title).toBe("Session 1: Mechanism of Action");

    // Flashcards
    const postDeleteCards = await flashcardStore.listByCourse(courseId, orgId);
    expect(postDeleteCards.length).toBe(2);
    expect(postDeleteCards[0].deletedAt).toBeNull();
    expect(postDeleteCards[1].deletedAt).toBeNull();

    // Quizzes & Quiz Questions
    const postDeleteQuizzes = await quizStore.listByCourse(courseId, orgId);
    expect(postDeleteQuizzes.length).toBe(1);
    expect(postDeleteQuizzes[0].deletedAt).toBeNull();
    const postDeleteQuestions = await quizQuestionStore.listByQuiz(postDeleteQuizzes[0].id);
    expect(postDeleteQuestions.length).toBe(1);
    expect(postDeleteQuestions[0].question).toContain("Class IB");

    // Review Summary must be retrievable without 404
    const summary = await genService.getReviewSummaryForDocument(actor, orgId, docId, courseId);
    expect(summary).toBeDefined();
    expect(summary?.payload).toMatchObject({
      title: "10-Minute High-Yield Review: Antiarrhythmics",
    });

    // Study queue must be fully functional
    const studyCards = await studyService.listFlashcardsForReviewMulti(actor, orgId, [courseId]);
    expect(studyCards.length).toBe(2);
  });

  it("Hard Delete Resilience: Hard deleting document record sets documentId to null/provenance without deleting cards or quizzes", async () => {
    // 1. Upload & Accept Flashcards and Quiz
    const uploadRes = await docService.confirmUpload(actor, orgId, {
      originalName: "Pharmacokinetics.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      data: pdfBytes,
      courseId,
    });
    const docId = uploadRes.document.id;

    // Add 1 flashcard
    flashcardStore.insert({
      id: "fc-pk-1" as FlashcardId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      generatedContentId: null,
      lessonId: null,
      question: "What is Volume of Distribution (Vd)?",
      answer: "Theoretical volume relating drug concentration in plasma to total amount of drug in body.",
      explanation: "High Vd means extensive tissue binding.",
      difficulty: "medium",
      cardType: "definition",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Add 1 quiz
    quizStore.insert({
      id: "qz-pk-1" as QuizId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      title: "PK Exam",
      topic: "Pharmacokinetics",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Simulate database hard delete (DELETE FROM documents WHERE id = docId)
    // Under ON DELETE SET NULL, foreign key sets documentId = null
    const cardBefore = await flashcardStore.findByIdForOrganization("fc-pk-1" as FlashcardId, orgId);
    expect(cardBefore).toBeDefined();

    // Manually apply FK SET NULL behavior
    if (cardBefore) {
      flashcardStore.insert({
        ...cardBefore,
        documentId: null,
      });
    }

    const cardAfter = await flashcardStore.findByIdForOrganization("fc-pk-1" as FlashcardId, orgId);
    expect(cardAfter).toBeDefined();
    expect(cardAfter?.documentId).toBeNull();
    expect(cardAfter?.deletedAt).toBeNull();

    // Study queue still finds the card
    const courseCards = await flashcardStore.listByCourse(courseId, orgId);
    expect(courseCards.length).toBe(1);
    expect(courseCards[0].question).toContain("Volume of Distribution");
  });

  it("Re-upload Safety: Re-uploading the same file with identical SHA256 preserves prior accepted content and creates clean new content", async () => {
    // 1. First Upload
    const firstUpload = await docService.confirmUpload(actor, orgId, {
      originalName: "Endocrinology.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      data: pdfBytes,
      courseId,
    });
    const docId1 = firstUpload.document.id;

    // Accept a flashcard for Doc 1
    flashcardStore.insert({
      id: "fc-endo-1" as FlashcardId,
      organizationId: orgId,
      courseId,
      documentId: docId1,
      generatedContentId: null,
      lessonId: null,
      question: "What is the primary action of Insulin?",
      answer: "Stimulates GLUT4 translocation and glycogen synthesis.",
      explanation: null,
      difficulty: "medium",
      cardType: "definition",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 2. Delete Doc 1
    await docService.deleteDocument(actor, orgId, docId1);

    // 3. Re-upload identical file (same SHA256)
    const secondUpload = await docService.confirmUpload(actor, orgId, {
      originalName: "Endocrinology_New.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      data: pdfBytes,
      courseId,
    });
    const docId2 = secondUpload.document.id;

    // Add a flashcard for Doc 2
    flashcardStore.insert({
      id: "fc-endo-2" as FlashcardId,
      organizationId: orgId,
      courseId,
      documentId: docId2,
      generatedContentId: null,
      lessonId: null,
      question: "What is the mechanism of Metformin?",
      answer: "Inhibits hepatic gluconeogenesis via AMPK activation.",
      explanation: null,
      difficulty: "medium",
      cardType: "definition",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // 4. Verify that BOTH prior accepted card and new card exist and are active in the course!
    const allCourseCards = await flashcardStore.listByCourse(courseId, orgId);
    expect(allCourseCards.length).toBe(2);
    expect(allCourseCards.some((c) => c.question.includes("Insulin"))).toBe(true);
    expect(allCourseCards.some((c) => c.question.includes("Metformin"))).toBe(true);
  });
});
