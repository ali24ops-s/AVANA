import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type DocumentId,
  type CourseId,
  type GeneratedContentId,
  RoleBasedPolicy,
  DomainError,
  validateFlashcardDifficulty,
} from "@avana/domain";
import { ReviewService } from "./review-service.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "./test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../learning/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "./generation-queue.js";
import type { DocumentRecord } from "../learning/learning-store.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../study/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";

const organizationId = "b4a0b464-16db-4087-92b7-163a1e6f6776" as OrganizationId;
const courseId = "b34316ac-ad13-4025-a75b-5c0d400455f1" as CourseId;
const documentId = "a8a97747-e217-4629-ace9-9efd70112152" as DocumentId;

const editor: Actor = {
  userId: "79bda286-08a4-4a16-9340-4106864e0732" as Actor["userId"],
  roles: ["course_editor", "platform_admin"],
};

function makeDocument(docId: DocumentId): DocumentRecord {
  const now = new Date().toISOString();
  return {
    id: docId,
    organizationId,
    courseId,
    ownerUserId: editor.userId,
    originalName: "Type 1 Diabetes.PDF",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    storageKey: `uploads/${docId}.pdf`,
    pageCount: 10,
    status: "review_pending",
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

describe("Flashcard Difficulty Validation & Regression", () => {
  let contentStore: InMemoryGeneratedContentStore;
  let flashcardStore: InMemoryFlashcardStore;
  let documentStore: InMemoryDocumentStore;
  let moduleStore: InMemoryModuleStore;
  let service: ReviewService;

  beforeEach(() => {
    contentStore = new InMemoryGeneratedContentStore();
    const citationStore = new InMemoryGeneratedContentCitationStore();
    documentStore = new InMemoryDocumentStore();
    const chunkStore = new InMemoryDocumentChunkStore();
    moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    flashcardStore = new InMemoryFlashcardStore();
    const quizStore = new InMemoryQuizStore();
    const quizQuestionStore = new InMemoryQuizQuestionStore();
    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const queue = new InMemoryGenerationQueue();

    service = new ReviewService(
      contentStore,
      citationStore,
      documentStore,
      chunkStore,
      moduleStore,
      lessonStore,
      new RoleBasedPolicy(),
      queue,
      auditService,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );
  });

  it("unit: validateFlashcardDifficulty normalizes valid and defaults, and rejects malformed values", () => {
    expect(validateFlashcardDifficulty("easy")).toBe("easy");
    expect(validateFlashcardDifficulty("medium")).toBe("medium");
    expect(validateFlashcardDifficulty("hard")).toBe("hard");
    expect(validateFlashcardDifficulty(undefined)).toBe("medium");
    expect(validateFlashcardDifficulty(null)).toBe("medium");
    expect(validateFlashcardDifficulty("")).toBe("medium");
    expect(() => validateFlashcardDifficulty("easy_corrupted")).toThrow(DomainError);
  });

  // -------------------------------------------------------------------------
  // Test 1: Valid difficulties
  // -------------------------------------------------------------------------
  it("Test 1 — valid difficulties ('easy', 'medium', 'hard', undefined/default) materialize cleanly", async () => {
    await documentStore.create(makeDocument(documentId));

    const contentId = randomUUID() as GeneratedContentId;
    const now = new Date().toISOString();
    await contentStore.create({
      id: contentId,
      organizationId,
      courseId,
      documentId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        title: "Test Flashcards",
        cards: [
          { question: "Q1", answer: "A1", difficulty: "easy" },
          { question: "Q2", answer: "A2", difficulty: "medium" },
          { question: "Q3", answer: "A3", difficulty: "hard" },
          { question: "Q4", answer: "A4" }, // undefined -> default to medium
        ],
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await service.acceptContent(editor, organizationId, contentId);

    const cards = await flashcardStore.listByCourse(courseId, organizationId);
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.difficulty)).toEqual(["easy", "medium", "hard", "medium"]);
  });

  // -------------------------------------------------------------------------
  // Test 2: Malformed difficulty
  // -------------------------------------------------------------------------
  it("Test 2 — malformed difficulty is stopped before DB insertion with a recognizable DomainError", async () => {
    await documentStore.create(makeDocument(documentId));

    const contentId = randomUUID() as GeneratedContentId;
    const now = new Date().toISOString();
    const malformedValue = 'easy",\n "citationChunkIds": ["abc"],\n "next": { "q": 123 }';

    await contentStore.create({
      id: contentId,
      organizationId,
      courseId,
      documentId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: [
          { question: "Q1", answer: "A1", difficulty: "easy" },
          { question: "Q2", answer: "A2", difficulty: malformedValue },
        ],
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    let thrownError: unknown;
    try {
      await service.acceptContent(editor, organizationId, contentId);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(DomainError);
    const domainErr = thrownError as DomainError;
    expect(domainErr.code).toBe("unprocessable");
    expect(domainErr.message).toContain("Invalid flashcard difficulty at card index 1");
    expect(domainErr.details).toMatchObject({
      contentType: "flashcard",
      cardIndex: 1,
      field: "difficulty",
    });

    // Verify nothing was inserted into flashcardStore
    const cards = await flashcardStore.listByCourse(courseId, organizationId);
    expect(cards).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 3: Exact regression scenario matching cards[134]
  // -------------------------------------------------------------------------
  it("Test 3 — exact regression scenario of 1500-char difficulty from cards[134] is rejected with DomainError", async () => {
    await documentStore.create(makeDocument(documentId));

    const contentId = randomUUID() as GeneratedContentId;
    const now = new Date().toISOString();

    // Reconstruct the exact corrupted string structure from the root cause audit
    const corrupted1500Chars =
      'easy",\n      "citationChunkIds": [\n        "6aee8a81-9074-4be8-ab8f-d4be191cbf5d"\n      ]\n    },\n    {\n      "question": "تست استاندارد نیتروپروساید...",\n      "answer": "استواستات",\n      "explanation": "این تست به بتاهیدروکسی‌بوتیرات حساس نیست.",\n      "cardType": "key_fact",\n      "difficulty": "medium"\n    }' +
      "a".repeat(1200);

    const cardsPayload = Array.from({ length: 135 }, (_, idx) => ({
      question: `Question ${idx}`,
      answer: `Answer ${idx}`,
      difficulty: idx === 134 ? corrupted1500Chars : "medium",
    }));

    await contentStore.create({
      id: contentId,
      organizationId,
      courseId,
      documentId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: cardsPayload,
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    let thrownError: unknown;
    try {
      await service.acceptContent(editor, organizationId, contentId);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(DomainError);
    const domainErr = thrownError as DomainError;
    expect(domainErr.code).toBe("unprocessable");
    expect(domainErr.details?.cardIndex).toBe(134);
    expect(domainErr.details?.field).toBe("difficulty");

    // Flashcard store remains empty
    const saved = await flashcardStore.listByCourse(courseId, organizationId);
    expect(saved).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 4: Current repaired content of Type 1 Diabetes
  // -------------------------------------------------------------------------
  it("Test 4 — current repaired content with 135 cards materializes 100% successfully", async () => {
    await documentStore.create(makeDocument(documentId));

    const contentId = "446db2c7-1847-4896-95a8-f7aafda8e858" as GeneratedContentId;
    const now = new Date().toISOString();

    // 135 cards where cards[134] has been repaired to "easy"
    const repairedCards = Array.from({ length: 135 }, (_, idx) => ({
      question: `Question ${idx}`,
      answer: `Answer ${idx}`,
      difficulty: idx === 134 ? "easy" : (idx % 2 === 0 ? "hard" : "medium"),
      citationChunkIds: ["6aee8a81-9074-4be8-ab8f-d4be191cbf5d"],
    }));

    await contentStore.create({
      id: contentId,
      organizationId,
      courseId,
      documentId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        title: "فلش‌کارت‌های دیابت نوع ۱",
        cards: repairedCards,
      },
      promptVersion: "v1",
      model: "mock",
      tokenUsage: { inputTokens: 10, outputTokens: 20 },
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
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const result = await service.acceptContent(editor, organizationId, contentId);
    expect(result.status).toBe("accepted");

    const savedCards = await flashcardStore.listByCourse(courseId, organizationId);
    expect(savedCards).toHaveLength(135);
    expect(savedCards[134].difficulty).toBe("easy");
  });
});
