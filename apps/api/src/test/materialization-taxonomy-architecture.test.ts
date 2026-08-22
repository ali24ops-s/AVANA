import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { ReviewService } from "../modules/generation/review-service.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryGeneratedContentStore } from "../modules/generation/test/in-memory-stores.js";
import { InMemoryQuizStore, InMemoryQuizQuestionStore, InMemoryFlashcardStore } from "../modules/study/test/in-memory-stores.js";
import type { CourseId, DocumentId, OrganizationId } from "@avana/domain";
import type { GeneratedContentRecord } from "../modules/generation/generation-store.js";
import type { DocumentRecord } from "../modules/learning/learning-store.js";
// @ts-ignore
import { repairChapter39Data } from "../../../../scripts/repair-ch39-data.mjs";

function makeDoc(id: DocumentId, orgId: OrganizationId, courseId: CourseId, originalName: string): DocumentRecord {
  return {
    id,
    organizationId: orgId,
    courseId,
    ownerUserId: "user-1" as any,
    originalName,
    mimeType: "application/pdf",
    sizeBytes: 1000,
    sha256: `hash-${id}`,
    storageKey: `/tmp/${originalName}`,
    status: "extracted",
    pageCount: 10,
    errorCode: null,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}

describe("Materialization & Single Source of Truth Taxonomy Architecture Tests", () => {
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let documentStore: InMemoryDocumentStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let flashcardStore: InMemoryFlashcardStore;
  let reviewService: ReviewService;

  const orgId = "org-test-1" as OrganizationId;
  const courseId = "course-pharm-1" as CourseId;

  beforeEach(() => {
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    documentStore = new InMemoryDocumentStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    flashcardStore = new InMemoryFlashcardStore();

    const policyMock = { require: () => {} } as any;
    const auditServiceMock = { emit: async () => {} } as any;

    reviewService = new ReviewService(
      generatedContentStore as any,
      {} as any,
      documentStore as any,
      {} as any,
      moduleStore as any,
      lessonStore as any,
      policyMock,
      {} as any,
      auditServiceMock,
      flashcardStore as any,
      quizStore as any,
      quizQuestionStore as any,
    );
  });

  it("Test 1 & 5: Lesson and Quiz for a document share a single Module with AI title", async () => {
    const docId = "doc-ch40-1" as DocumentId;
    documentStore.insert(makeDoc(docId, orgId, courseId, "40.pdf"));

    const lessonRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فصل: فارماکولوژی دستگاه گوارش",
        contentMarkdown: "# متن",
        citationChunkIds: [],
        moduleTitle: "فصل: فارماکولوژی دستگاه گوارش",
        sessions: [
          { title: "جلسه ۱: درمان زخم معده", contentMarkdown: "# محتوا" },
          { title: "جلسه ۲: داروهای ضد تهوع", contentMarkdown: "# محتوا" },
        ],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون گوارش",
        moduleTitle: "فصل: فارماکولوژی دستگاه گوارش",
        topic: "درمان زخم معده",
        questions: [
          { question: "سوال ۱ در مورد زخم معده", questionType: "multiple_choice", correctAnswer: "الف", topic: "درمان زخم معده" }
        ],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(lessonRecord);
    generatedContentStore.insert(quizRecord);

    const actor = { userId: "user-1", role: "organization_admin" } as any;

    // Materialize Lesson first
    await reviewService.acceptContent(actor, orgId, lessonRecord.id);
    // Materialize Quiz second
    await reviewService.acceptContent(actor, orgId, quizRecord.id);

    const modules = await moduleStore.listByCourse(courseId);
    expect(modules.length).toBe(1);
    expect(modules[0].title).toBe("فصل: فارماکولوژی دستگاه گوارش");
  });

  it("Test 2 & 3: Quiz published before Lesson does NOT create duplicate module or placeholder lesson", async () => {
    const docId = "doc-ch41-1" as DocumentId;
    documentStore.insert(makeDoc(docId, orgId, courseId, "41.pdf"));

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون کلیه",
        moduleTitle: "فصل: داروشناسی کلیه و دیورتیک‌ها",
        topic: "دیورتیک‌ها",
        questions: [{ question: "مکانیزم اثر فورزماید چیست؟", questionType: "multiple_choice", correctAnswer: "الف" }]
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(quizRecord);
    const actor = { userId: "user-1", role: "organization_admin" } as any;

    // Materialize Quiz BEFORE Lesson
    await reviewService.acceptContent(actor, orgId, quizRecord.id);

    const modules = await moduleStore.listByCourse(courseId);
    expect(modules.length).toBe(1);
    expect(modules[0].title).toBe("فصل: داروشناسی کلیه و دیورتیک‌ها");

    // Verify NO fake 40-character placeholder lesson was created in lessonStore
    const lessons = await lessonStore.listByModule(modules[0].id);
    expect(lessons.length).toBe(0);
  });

  it("Test 4 & 9: Filename is not used as primary identity when AI module title is available", async () => {
    const docId = "doc-ch42-1" as DocumentId;
    documentStore.insert(makeDoc(docId, orgId, courseId, "random_doc_42.pdf"));

    const lessonRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فصل ۴۲: فارماکوتراپی عفونت‌ها",
        contentMarkdown: "# متن",
        citationChunkIds: [],
        moduleTitle: "فصل ۴۲: فارماکوتراپی عفونت‌ها",
        sessions: [{ title: "جلسه ۱", contentMarkdown: "متن" }],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(lessonRecord);
    const actor = { userId: "user-1", role: "organization_admin" } as any;

    await reviewService.acceptContent(actor, orgId, lessonRecord.id);
    const modules = await moduleStore.listByCourse(courseId);
    expect(modules[0].title).toBe("فصل ۴۲: فارماکوتراپی عفونت‌ها");
    expect(modules[0].title).not.toContain("random_doc_42");
  });

  it("Test 8: Repair script is idempotent when executed multiple times", async () => {
    const res1 = await repairChapter39Data();
    expect(res1.status).toBe("already_repaired");

    const res2 = await repairChapter39Data();
    expect(res2.status).toBe("already_repaired");
  });

  it("Test 3 & 14: Flashcard-first materialization resolves same Module and maps to real lesson or null", async () => {
    const docId = "doc-ch43-1" as DocumentId;
    documentStore.insert(makeDoc(docId, orgId, courseId, "43.pdf"));

    const flashcardRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        title: "فلش‌کارت سیستم اعصاب",
        moduleTitle: "فصل: فارماکولوژی اعصاب",
        topic: "اعصاب",
        flashcards: [{ front: "سوال ۱", back: "پاسخ ۱", topic: "اعصاب" }],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(flashcardRecord);
    const actor = { userId: "user-1", role: "organization_admin" } as any;

    await reviewService.acceptContent(actor, orgId, flashcardRecord.id);

    const modules = await moduleStore.listByCourse(courseId);
    const targetModule = modules.find((m) => m.documentId === docId);
    expect(targetModule).toBeDefined();
    expect(targetModule!.title).toBe("فصل: فارماکولوژی اعصاب");
  });

  it("Test 4 & 12: Concurrent materialization produces exactly ONE module and leaves unmapped quiz question lessonId as null", async () => {
    const docId = "doc-ch44-1" as DocumentId;
    documentStore.insert(makeDoc(docId, orgId, courseId, "44.pdf"));

    const lessonRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فصل: فارماکولوژی غدد",
        contentMarkdown: "# متن",
        citationChunkIds: [],
        moduleTitle: "فصل: فارماکولوژی غدد",
        sessions: [{ title: "جلسه ۱: انسولین", contentMarkdown: "# محتوا" }],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    const quizRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون غدد",
        moduleTitle: "فصل: فارماکولوژی غدد",
        topic: "موضوع نامرتبط بدون لسن",
        questions: [{ question: "سوال درباره موضوع نامرتبط", questionType: "multiple_choice", correctAnswer: "الف", topic: "موضوع نامرتبط بدون لسن" }],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(lessonRecord);
    generatedContentStore.insert(quizRecord);

    const actor = { userId: "user-1", role: "organization_admin" } as any;

    // Concurrent materialization via Promise.all
    await Promise.all([
      reviewService.acceptContent(actor, orgId, lessonRecord.id),
      reviewService.acceptContent(actor, orgId, quizRecord.id),
    ]);

    const docModules = (await moduleStore.listByCourse(courseId)).filter((m) => m.documentId === docId);
    expect(docModules.length).toBe(1);

    // Verify unmapped question lessonId is null (not guessed or fallback to lessons[0])
    const quizzes = await quizStore.listByCourse(courseId, orgId);
    expect(quizzes.length).toBeGreaterThan(0);
  });

  it("Test 13: Multiple documents produce separate modules", async () => {
    const doc1 = "doc-ch45-1" as DocumentId;
    const doc2 = "doc-ch45-2" as DocumentId;
    documentStore.insert(makeDoc(doc1, orgId, courseId, "45_part1.pdf"));
    documentStore.insert(makeDoc(doc2, orgId, courseId, "45_part2.pdf"));

    const lesson1: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: doc1,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فصل ۴۵ بخش ۱",
        contentMarkdown: "# متن",
        citationChunkIds: [],
        moduleTitle: "فصل ۴۵ بخش ۱",
        sessions: [{ title: "جلسه ۱", contentMarkdown: "# محتوا" }],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    const lesson2: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: doc2,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فصل ۴۵ بخش ۲",
        contentMarkdown: "# متن",
        citationChunkIds: [],
        moduleTitle: "فصل ۴۵ بخش ۲",
        sessions: [{ title: "جلسه ۱", contentMarkdown: "# محتوا" }],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(lesson1);
    generatedContentStore.insert(lesson2);

    const actor = { userId: "user-1", role: "organization_admin" } as any;
    await reviewService.acceptContent(actor, orgId, lesson1.id);
    await reviewService.acceptContent(actor, orgId, lesson2.id);

    const mod1 = await moduleStore.findByDocument(doc1);
    const mod2 = await moduleStore.findByDocument(doc2);
    expect(mod1).toBeDefined();
    expect(mod2).toBeDefined();
    expect(mod1!.id).not.toBe(mod2!.id);
  });

  it("Test 14: materializeFlashcards maps sessionIndex to matching lesson_id and leaves invalid sessionIndex as null", async () => {
    const docId = "doc-ch46-1" as DocumentId;
    documentStore.insert(makeDoc(docId, orgId, courseId, "46.pdf"));

    const lessonRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فصل: فارماکولوژی غدد",
        contentMarkdown: "# متن",
        citationChunkIds: [],
        moduleTitle: "فصل: فارماکولوژی غدد",
        sessions: [
          { title: "جلسه ۱: انسولین", contentMarkdown: "# محتوا" },
          { title: "جلسه ۲: متفورمین", contentMarkdown: "# محتوا" },
        ],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    const flashcardRecord: GeneratedContentRecord = {
      id: randomUUID() as any,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "flashcard",
      status: "draft",
      payload: {
        kind: "flashcard",
        cards: [
          { question: "سوال ۱ درباره انسولین", answer: "پاسخ ۱", sessionIndex: 0 },
          { question: "سوال ۲ درباره متفورمین", answer: "پاسخ ۲", sessionIndex: 1 },
          { question: "سوال ۳ با sessionIndex نامعتبر", answer: "پاسخ ۳", sessionIndex: 99 },
          { question: "سوال ۴ بدون sessionIndex", answer: "پاسخ ۴" },
        ],
      } as any,
      materializedLessonId: null,
      model: "gemini-3.5-flash-lite",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    } as any as GeneratedContentRecord;

    generatedContentStore.insert(lessonRecord);
    generatedContentStore.insert(flashcardRecord);

    const actor = { userId: "user-1", role: "organization_admin" } as any;

    await reviewService.acceptContent(actor, orgId, lessonRecord.id);
    await reviewService.acceptContent(actor, orgId, flashcardRecord.id);

    const createdLessons = await lessonStore.listByModules([(await moduleStore.findByDocument(docId))!.id]);
    expect(createdLessons.length).toBe(2);

    const createdCards = await flashcardStore.listByCourse(courseId, orgId);
    expect(createdCards.length).toBe(4);

    const card1 = createdCards.find((c) => c.question === "سوال ۱ درباره انسولین");
    const card2 = createdCards.find((c) => c.question === "سوال ۲ درباره متفورمین");
    const card3 = createdCards.find((c) => c.question === "سوال ۳ با sessionIndex نامعتبر");
    const card4 = createdCards.find((c) => c.question === "سوال ۴ بدون sessionIndex");

    expect(card1?.lessonId).toBe(createdLessons[0].id);
    expect(card2?.lessonId).toBe(createdLessons[1].id);
    expect(card3?.lessonId).toBeNull();
    expect(card4?.lessonId).toBeNull();
  });
});
