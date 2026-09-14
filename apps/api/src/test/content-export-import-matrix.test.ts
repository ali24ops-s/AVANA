import { describe, expect, it, beforeEach } from "vitest";
import crypto from "node:crypto";
import JSZip from "jszip";
import { ContentExportService } from "../modules/admin/content-export-service.js";
import { ContentImportService } from "../modules/admin/content-import-service.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../modules/storage/storage-provider.js";
import type { DbClient } from "@avana/database/client";

/**
 * In-Memory StorageProvider implementation for tests.
 */
class InMemoryStorageProvider implements StorageProvider {
  public files = new Map<string, Buffer>();

  async createUpload(options: { storageKey: string; mimeType: string }): Promise<UploadIntent> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error(`File not found: ${storageKey}`);
    return data;
  }
}

type DbRow = Record<string, unknown>;

interface TableMeta {
  [key: symbol]: unknown;
  _?: { name: string };
  name?: string;
}

/**
 * Strict TypeScript In-Memory Mock Database that supports all Drizzle operations,
 * transaction rollbacks, conflict upserts, and failure simulation.
 */
class ComprehensiveMockDb {
  public tables: Record<string, DbRow[]> = {
    courses: [],
    modules: [],
    lessons: [],
    documents: [],
    document_chunks: [],
    generated_contents: [],
    generated_content_citations: [],
    flashcards: [],
    quizzes: [],
    quiz_questions: [],
    content_import_batches: [],
    imported_entities: [],
    audit_logs: [],
  };

  public failOnInsertTable: string | null = null;
  public failOnCondition: ((tableName: string, val: unknown) => boolean) | null = null;

  getTableName(tableObj: TableMeta): string {
    const nameSymbol = tableObj?.[Symbol.for("drizzle:Name")];
    if (typeof nameSymbol === "string") return nameSymbol;
    if (tableObj?._?.name) return tableObj._.name;
    if (tableObj?.name) return tableObj.name;
    return "unknown";
  }

  select(_fields?: unknown) {
    return {
      from: (tableObj: TableMeta) => {
        const tableName = this.getTableName(tableObj);
        return {
          where: (condition?: unknown) => ({
            orderBy: (..._args: unknown[]) => Promise.resolve(this.filterRows(tableName, condition)),
            then: (resolve: (rows: DbRow[]) => void) => resolve(this.filterRows(tableName, condition)),
          }),
          orderBy: (..._args: unknown[]) => Promise.resolve([...(this.tables[tableName] || [])]),
          then: (resolve: (rows: DbRow[]) => void) => resolve([...(this.tables[tableName] || [])]),
        };
      },
    };
  }

  private filterRows(tableName: string, _condition?: unknown): DbRow[] {
    return [...(this.tables[tableName] || [])];
  }

  insert(tableObj: TableMeta) {
    const tableName = this.getTableName(tableObj);
    return {
      values: (valOrVals: DbRow | DbRow[]) => ({
        onConflictDoUpdate: (_opts: unknown) => ({
          then: (resolve: (res: { rowCount: number }) => void) => {
            if (this.failOnInsertTable === tableName) {
              throw new Error(`Simulated database failure during insertion into ${tableName}`);
            }
            const items = Array.isArray(valOrVals) ? valOrVals : [valOrVals];
            if (!this.tables[tableName]) this.tables[tableName] = [];
            for (const item of items) {
              const existingIdx = this.tables[tableName].findIndex(
                (r) =>
                  r.organizationId === item.organizationId &&
                  r.entityType === item.entityType &&
                  r.exportId === item.exportId,
              );
              if (existingIdx >= 0) {
                this.tables[tableName][existingIdx] = {
                  ...this.tables[tableName][existingIdx],
                  ...item,
                };
              } else {
                this.tables[tableName].push({ ...item });
              }
            }
            return resolve({ rowCount: items.length });
          },
        }),
        then: (resolve: (res: { rowCount: number }) => void) => {
          if (this.failOnInsertTable === tableName) {
            throw new Error(`Simulated database failure during insertion into ${tableName}`);
          }
          if (this.failOnCondition && this.failOnCondition(tableName, valOrVals)) {
            throw new Error(`Simulated conditional database failure during insertion into ${tableName}`);
          }
          const items = Array.isArray(valOrVals) ? valOrVals : [valOrVals];
          if (!this.tables[tableName]) this.tables[tableName] = [];
          this.tables[tableName].push(...items);
          return resolve({ rowCount: items.length });
        },
      }),
    };
  }

  update(tableObj: TableMeta) {
    const tableName = this.getTableName(tableObj);
    return {
      set: (values: DbRow) => ({
        where: (_condition: unknown) => ({
          then: (resolve: (res: { rowCount: number }) => void) => {
            if (this.tables[tableName]) {
              for (let i = 0; i < this.tables[tableName].length; i++) {
                this.tables[tableName][i] = {
                  ...this.tables[tableName][i],
                  ...values,
                };
              }
            }
            return resolve({ rowCount: 1 });
          },
        }),
      }),
    };
  }

  async transaction<T>(callback: (tx: DbClient) => Promise<T>): Promise<T> {
    const snapshot: Record<string, DbRow[]> = {};
    for (const key of Object.keys(this.tables)) {
      snapshot[key] = this.tables[key].map((item) => ({ ...item }));
    }

    try {
      const result = await callback(this as unknown as DbClient);
      return result;
    } catch (err) {
      for (const key of Object.keys(snapshot)) {
        this.tables[key] = snapshot[key].map((item) => ({ ...item }));
      }
      throw err;
    }
  }
}

describe("Comprehensive Content Export / Import Test Matrix", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const orgC = "33333333-3333-3333-3333-333333333333";
  const actorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  let sourceDb: ComprehensiveMockDb;
  let targetDb: ComprehensiveMockDb;
  let sourceStorage: InMemoryStorageProvider;
  let targetStorage: InMemoryStorageProvider;

  let exportService: ContentExportService;
  let importService: ContentImportService;

  beforeEach(() => {
    sourceDb = new ComprehensiveMockDb();
    targetDb = new ComprehensiveMockDb();
    sourceStorage = new InMemoryStorageProvider();
    targetStorage = new InMemoryStorageProvider();

    exportService = new ContentExportService(sourceDb as unknown as DbClient, sourceStorage);
    importService = new ContentImportService(targetDb as unknown as DbClient, targetStorage);
  });

  // =========================================================================
  // 1. BASE TEST MODEL: Multi-module, Multi-lesson, Course-level & Lesson-level entities
  // =========================================================================
  it("1. Base Test Model: Full multi-tier educational fixture with course-level and lesson-level entities", async () => {
    // Course
    const courseId = "src-c-base";
    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "فارماکولوژی جامع",
      description: "دوره کامل داروشناسی و سم‌شناسی",
      subject: "پزشکی",
      status: "published",
      isOfficial: true,
    });

    // Module 1
    const m1Id = "src-m-1";
    sourceDb.tables.modules.push({
      id: m1Id,
      courseId,
      title: "فصل ۱: داروهای قلبی عروقی",
      sortOrder: 1,
    });

    // Lesson 1 & Lesson 2 in Module 1
    const l1Id = "src-l-1";
    const l2Id = "src-l-2";
    sourceDb.tables.lessons.push(
      {
        id: l1Id,
        moduleId: m1Id,
        title: "درس ۱: بتابلاکرها",
        contentType: "markdown",
        contentMarkdown: "# بتابلاکرها\nمکانیسم پروپرانولول و متوپرولول",
        sortOrder: 1,
        publicationStatus: "published",
      },
      {
        id: l2Id,
        moduleId: m1Id,
        title: "درس ۲: مهارکننده‌های ACE",
        contentType: "markdown",
        contentMarkdown: "# مهارکننده‌های ACE\nکاپتوپریل و انالاپریل",
        sortOrder: 2,
        publicationStatus: "published",
      },
    );

    // Module 2
    const m2Id = "src-m-2";
    sourceDb.tables.modules.push({
      id: m2Id,
      courseId,
      title: "فصل ۲: داروهای سیستم تنفسی",
      sortOrder: 2,
    });

    // Lesson 3 in Module 2
    const l3Id = "src-l-3";
    sourceDb.tables.lessons.push({
      id: l3Id,
      moduleId: m2Id,
      title: "درس ۳: آگونیست‌های بتا-۲",
      contentType: "markdown",
      contentMarkdown: "# آگونیست‌های بتا-۲\nسالبوتامول و سالمترول",
      sortOrder: 1,
      publicationStatus: "published",
    });

    // Lesson-scoped Flashcards
    sourceDb.tables.flashcards.push(
      {
        id: "fc-l1",
        organizationId: orgA,
        courseId,
        lessonId: l1Id,
        question: "پروپرانولول کدام گیرنده‌ها را مسدود می‌کند؟",
        answer: "بتا-۱ و بتا-۲ غیرانتخابی",
        cardType: "definition",
        easeFactor: "2.5",
      },
      {
        id: "fc-l2",
        organizationId: orgA,
        courseId,
        lessonId: l2Id,
        question: "عارضه شایع کاپتوپریل چیست؟",
        answer: "سرفه خشک به علت تجمع برادی‌کینین",
        cardType: "definition",
        easeFactor: "2.5",
      },
      {
        id: "fc-l3",
        organizationId: orgA,
        courseId,
        lessonId: l3Id,
        question: "سالبوتامول در کدام بیماری کاربرد دارد؟",
        answer: "حملات حاد آسم",
        cardType: "concept",
        easeFactor: "2.5",
      },
    );

    // Course-scoped Flashcard (lessonId: null)
    sourceDb.tables.flashcards.push({
      id: "fc-course",
      organizationId: orgA,
      courseId,
      lessonId: null,
      question: "فارماکوکینتیک چیست؟",
      answer: "آنچه بدن با دارو انجام می‌دهد (ADME)",
      cardType: "concept",
      easeFactor: "2.5",
    });

    // Lesson-scoped Quizzes & Questions
    const quiz1Id = "q-1";
    sourceDb.tables.quizzes.push({
      id: quiz1Id,
      organizationId: orgA,
      courseId,
      title: "آزمون بتابلاکرها",
      status: "published",
    });
    sourceDb.tables.quiz_questions.push({
      id: "qq-1",
      quizId: quiz1Id,
      lessonId: l1Id,
      question: "کدام دارو بتابلاکر انتخابی قلبی است؟",
      choices: ["متوپرولول", "پروپرانولول"],
      correctAnswer: "متوپرولول",
      sortOrder: 1,
    });

    // Course-scoped Quiz (lessonId: null)
    const quizCourseId = "q-course";
    sourceDb.tables.quizzes.push({
      id: quizCourseId,
      organizationId: orgA,
      courseId,
      title: "آزمون جامع داروشناسی",
      status: "published",
    });
    sourceDb.tables.quiz_questions.push({
      id: "qq-course",
      quizId: quizCourseId,
      lessonId: null,
      question: "نیمه عمر دارو به کدام فاکتور بستگی دارد؟",
      choices: ["کلیرانس و حجم توزیع", "تنها دوز مصرفی"],
      correctAnswer: "کلیرانس و حجم توزیع",
      sortOrder: 1,
    });

    // Generated Contents (Lesson-level & Course-level)
    sourceDb.tables.generated_contents.push(
      {
        id: "gc-1",
        organizationId: orgA,
        courseId,
        materializedLessonId: l1Id,
        type: "lesson_summary",
        status: "accepted",
        payload: { summary: "خلاصه بتابلاکرها" },
      },
      {
        id: "gc-course",
        organizationId: orgA,
        courseId,
        materializedLessonId: null,
        type: "course_syllabus",
        status: "accepted",
        payload: { syllabus: "سرفصل کلی دوره" },
      },
    );

    // 1. Export
    const zipBuffer = await exportService.exportContent(orgA, { courseId });
    expect(zipBuffer).toBeInstanceOf(Buffer);

    // 2. Validate & Import to Target
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan.summary.courses.new).toBe(1);
    expect(plan.summary.modules.new).toBe(2);
    expect(plan.summary.lessons.new).toBe(3);
    expect(plan.summary.flashcards.new).toBe(4);
    expect(plan.summary.quizzes.new).toBe(2);
    expect(plan.summary.questions.new).toBe(2);
    expect(plan.summary.generatedContents.new).toBe(2);
    expect(plan.conflicts.length).toBe(0);

    const execResult = await importService.executeImport(plan.planId, actorId, orgB);
    expect(execResult.success).toBe(true);

    // 3. Verify Target Counts & Hierarchy
    const targetCourse = targetDb.tables.courses.find((c) => c.organizationId === orgB)!;
    expect(targetCourse).toBeDefined();
    expect(targetCourse.name).toBe("فارماکولوژی جامع");

    const targetMods = targetDb.tables.modules.filter((m) => m.courseId === targetCourse.id);
    expect(targetMods.length).toBe(2);

    const mod1 = targetMods.find((m) => m.title === "فصل ۱: داروهای قلبی عروقی")!;
    const mod2 = targetMods.find((m) => m.title === "فصل ۲: داروهای سیستم تنفسی")!;
    expect(mod1).toBeDefined();
    expect(mod2).toBeDefined();

    const m1Lessons = targetDb.tables.lessons.filter((l) => l.moduleId === mod1.id);
    const m2Lessons = targetDb.tables.lessons.filter((l) => l.moduleId === mod2.id);
    expect(m1Lessons.length).toBe(2);
    expect(m2Lessons.length).toBe(1);

    // Verify course-level vs lesson-level flashcards
    const lessonCards = targetDb.tables.flashcards.filter((fc) => fc.courseId === targetCourse.id && fc.lessonId !== null);
    const courseCards = targetDb.tables.flashcards.filter((fc) => fc.courseId === targetCourse.id && fc.lessonId === null);
    expect(lessonCards.length).toBe(3);
    expect(courseCards.length).toBe(1);

    // Verify course-level vs lesson-level quiz questions
    const lessonQuestions = targetDb.tables.quiz_questions.filter((qq) => qq.lessonId !== null);
    const courseQuestions = targetDb.tables.quiz_questions.filter((qq) => qq.lessonId === null);
    expect(lessonQuestions.length).toBe(1);
    expect(courseQuestions.length).toBe(1);
  });

  // =========================================================================
  // 2. MAIN USER SCENARIO: Incomplete Version A -> Export A -> Import Destination ->
  //    Complete Version B -> Export B -> Import Destination (Incremental on top of A)
  // =========================================================================
  it("2. Main User Scenario: Version A (Incomplete) -> Import -> Version B (Complete) -> Import incremental", async () => {
    const courseId = "src-c-main";
    const m1Id = "src-m-1";
    const l1Id = "src-l-1";
    const fc1Id = "src-fc-1";
    const q1Id = "src-q-1";
    const qq1Id = "src-qq-1";

    // Build Version A in Source DB
    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "دوره پاتولوژی پایه",
      description: "نسخه اولیه دوره",
      subject: "پزشکی",
      status: "published",
    });

    sourceDb.tables.modules.push({
      id: m1Id,
      courseId,
      title: "ماژول ۱",
      sortOrder: 1,
    });

    sourceDb.tables.lessons.push({
      id: l1Id,
      moduleId: m1Id,
      title: "درس ۱",
      contentType: "markdown",
      contentMarkdown: "# درس ۱ متن اولیه",
      sortOrder: 1,
      publicationStatus: "published",
    });

    sourceDb.tables.flashcards.push({
      id: fc1Id,
      organizationId: orgA,
      courseId,
      lessonId: l1Id,
      question: "سوال فلش کارت ۱",
      answer: "پاسخ ۱",
    });

    sourceDb.tables.quizzes.push({
      id: q1Id,
      organizationId: orgA,
      courseId,
      title: "آزمون ۱",
      status: "published",
    });

    sourceDb.tables.quiz_questions.push({
      id: qq1Id,
      quizId: q1Id,
      lessonId: l1Id,
      question: "سوال کوئیز ۱",
      choices: ["الف", "ب"],
      correctAnswer: "الف",
      sortOrder: 1,
    });

    // Export Package A
    const zipBufferA = await exportService.exportContent(orgA, { courseId });

    // Step 1: Import Package A into Destination
    const planA = await importService.validatePackage(zipBufferA, actorId, orgB);
    expect(planA.summary.courses.new).toBe(1);
    expect(planA.summary.modules.new).toBe(1);
    expect(planA.summary.lessons.new).toBe(1);
    expect(planA.summary.flashcards.new).toBe(1);
    expect(planA.summary.quizzes.new).toBe(1);
    expect(planA.summary.questions.new).toBe(1);

    await importService.executeImport(planA.planId, actorId, orgB);

    const destCourseAfterA = targetDb.tables.courses.find((c) => c.organizationId === orgB)!;
    const destMod1AfterA = targetDb.tables.modules.find((m) => m.courseId === destCourseAfterA.id)!;
    const destLesson1AfterA = targetDb.tables.lessons.find((l) => l.moduleId === destMod1AfterA.id)!;
    const destFlashcard1AfterA = targetDb.tables.flashcards.find((fc) => fc.courseId === destCourseAfterA.id)!;
    const destQuiz1AfterA = targetDb.tables.quizzes.find((q) => q.courseId === destCourseAfterA.id)!;
    const destQuestion1AfterA = targetDb.tables.quiz_questions.find((qq) => qq.quizId === destQuiz1AfterA.id)!;

    // Step 2: In Source DB, Complete to Version B
    const l2Id = "src-l-2";
    const m2Id = "src-m-2";
    const l3Id = "src-l-3";
    const fc2Id = "src-fc-2";
    const q2Id = "src-q-2";
    const qq2Id = "src-qq-2";
    const gcId = "src-gc-1";

    sourceDb.tables.lessons.push({
      id: l2Id,
      moduleId: m1Id,
      title: "درس ۲",
      contentType: "markdown",
      contentMarkdown: "# درس ۲ متن تکمیلی",
      sortOrder: 2,
      publicationStatus: "published",
    });

    sourceDb.tables.modules.push({
      id: m2Id,
      courseId,
      title: "ماژول ۲",
      sortOrder: 2,
    });

    sourceDb.tables.lessons.push({
      id: l3Id,
      moduleId: m2Id,
      title: "درس ۳",
      contentType: "markdown",
      contentMarkdown: "# درس ۳ ماژول ۲",
      sortOrder: 1,
      publicationStatus: "published",
    });

    sourceDb.tables.flashcards.push({
      id: fc2Id,
      organizationId: orgA,
      courseId,
      lessonId: l2Id,
      question: "سوال فلش کارت ۲",
      answer: "پاسخ ۲",
    });

    sourceDb.tables.quizzes.push({
      id: q2Id,
      organizationId: orgA,
      courseId,
      title: "آزمون ۲",
      status: "published",
    });

    sourceDb.tables.quiz_questions.push({
      id: qq2Id,
      quizId: q2Id,
      lessonId: l3Id,
      question: "سوال کوئیز ۲",
      choices: ["ج", "د"],
      correctAnswer: "ج",
      sortOrder: 1,
    });

    sourceDb.tables.generated_contents.push({
      id: gcId,
      organizationId: orgA,
      courseId,
      materializedLessonId: l1Id,
      type: "lesson_summary",
      status: "accepted",
      payload: { summary: "خلاصه درس ۱" },
    });

    // Export Package B
    const zipBufferB = await exportService.exportContent(orgA, { courseId });

    // Step 3: Import Package B onto the SAME Destination
    const planB = await importService.validatePackage(zipBufferB, actorId, orgB);

    // Assert Preview Detection:
    // Existing entities from A must be recognized as EXISTING:
    expect(planB.summary.courses.existing).toBe(1);
    expect(planB.summary.courses.new).toBe(0);

    expect(planB.summary.modules.existing).toBe(1); // Module 1
    expect(planB.summary.modules.new).toBe(1); // Module 2

    expect(planB.summary.lessons.existing).toBe(1); // Lesson 1
    expect(planB.summary.lessons.new).toBe(2); // Lesson 2 & Lesson 3

    expect(planB.summary.flashcards.existing).toBe(1); // Flashcard 1
    expect(planB.summary.flashcards.new).toBe(1); // Flashcard 2

    expect(planB.summary.quizzes.existing).toBe(1); // Quiz 1
    expect(planB.summary.quizzes.new).toBe(1); // Quiz 2

    expect(planB.summary.questions.existing).toBe(1); // Question 1
    expect(planB.summary.questions.new).toBe(1); // Question 2

    expect(planB.summary.generatedContents.new).toBe(1); // Generated Content 1
    expect(planB.conflicts.length).toBe(0);

    // Step 4: Execute Import of Package B
    const execResultB = await importService.executeImport(planB.planId, actorId, orgB);
    expect(execResultB.success).toBe(true);

    // Step 5: Assert Destination Database State
    // 1. Course was NOT duplicated (still exactly 1 course in orgB)
    const allDestCourses = targetDb.tables.courses.filter((c) => c.organizationId === orgB);
    expect(allDestCourses.length).toBe(1);
    expect(allDestCourses[0].id).toBe(destCourseAfterA.id);

    // 2. Module 1 was NOT duplicated (total modules = 2)
    const allDestModules = targetDb.tables.modules.filter((m) => m.courseId === destCourseAfterA.id);
    expect(allDestModules.length).toBe(2);
    const m1InDest = allDestModules.find((m) => m.title === "ماژول ۱")!;
    const m2InDest = allDestModules.find((m) => m.title === "ماژول ۲")!;
    expect(m1InDest.id).toBe(destMod1AfterA.id);
    expect(m2InDest).toBeDefined();

    // 3. Lesson 1 was NOT duplicated (total lessons = 3)
    const allDestLessons = targetDb.tables.lessons;
    expect(allDestLessons.length).toBe(3);
    const l1InDest = allDestLessons.find((l) => l.title === "درس ۱")!;
    const l2InDest = allDestLessons.find((l) => l.title === "درس ۲")!;
    const l3InDest = allDestLessons.find((l) => l.title === "درس ۳")!;
    expect(l1InDest.id).toBe(destLesson1AfterA.id);
    expect(l1InDest.moduleId).toBe(m1InDest.id);
    expect(l2InDest.moduleId).toBe(m1InDest.id);
    expect(l3InDest.moduleId).toBe(m2InDest.id);

    // 4. Flashcard 1 was NOT duplicated (total flashcards = 2)
    const allDestFlashcards = targetDb.tables.flashcards.filter((fc) => fc.courseId === destCourseAfterA.id);
    expect(allDestFlashcards.length).toBe(2);
    const fc1InDest = allDestFlashcards.find((fc) => fc.question === "سوال فلش کارت ۱")!;
    expect(fc1InDest.id).toBe(destFlashcard1AfterA.id);

    // 5. Quiz 1 was NOT duplicated (total quizzes = 2)
    const allDestQuizzes = targetDb.tables.quizzes.filter((q) => q.courseId === destCourseAfterA.id);
    expect(allDestQuizzes.length).toBe(2);
    const q1InDest = allDestQuizzes.find((q) => q.title === "آزمون ۱")!;
    expect(q1InDest.id).toBe(destQuiz1AfterA.id);

    // 6. Question 1 was NOT duplicated (total questions = 2)
    const allDestQuestions = targetDb.tables.quiz_questions;
    expect(allDestQuestions.length).toBe(2);
    const qq1InDest = allDestQuestions.find((qq) => qq.question === "سوال کوئیز ۱")!;
    expect(qq1InDest.id).toBe(destQuestion1AfterA.id);

    // 7. Relationships intact
    expect(qq1InDest.quizId).toBe(q1InDest.id);
    expect(qq1InDest.lessonId).toBe(l1InDest.id);

    const qq2InDest = allDestQuestions.find((qq) => qq.question === "سوال کوئیز ۲")!;
    const q2InDest = allDestQuizzes.find((q) => q.title === "آزمون ۲")!;
    expect(qq2InDest.quizId).toBe(q2InDest.id);
    expect(qq2InDest.lessonId).toBe(l3InDest.id);
  });

  // =========================================================================
  // 3. INCREMENTAL IMPORT MATRIX: A -> A, A -> B, B -> A
  // =========================================================================
  it("3. Incremental Import Matrix: A -> A, A -> B, B -> A", async () => {
    // Setup A and B packages
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره ماتریس", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "متن ۱", sortOrder: 1 });
    const zipA = await exportService.exportContent(orgA);

    // Expand to B
    sourceDb.tables.lessons.push({ id: "l2", moduleId: "m1", title: "درس ۲", contentType: "markdown", contentMarkdown: "متن ۲", sortOrder: 2 });
    const zipB = await exportService.exportContent(orgA);

    // Test 3.1: A -> A on Fresh Destination
    const targetDb1 = new ComprehensiveMockDb();
    const importSvc1 = new ContentImportService(targetDb1 as unknown as DbClient, targetStorage);
    const pA1 = await importSvc1.validatePackage(zipA, actorId, orgB);
    await importSvc1.executeImport(pA1.planId, actorId, orgB);
    const pA2 = await importSvc1.validatePackage(zipA, actorId, orgB);
    expect(pA2.summary.courses.existing).toBe(1);
    expect(pA2.summary.lessons.existing).toBe(1);
    const resA2 = await importSvc1.executeImport(pA2.planId, actorId, orgB);
    expect(resA2.counts.created).toBe(0);
    expect(targetDb1.tables.lessons.length).toBe(1);

    // Test 3.2: A -> B on Destination 1
    const pB = await importSvc1.validatePackage(zipB, actorId, orgB);
    expect(pB.summary.lessons.existing).toBe(1);
    expect(pB.summary.lessons.new).toBe(1);
    await importSvc1.executeImport(pB.planId, actorId, orgB);
    expect(targetDb1.tables.lessons.length).toBe(2);

    // Test 3.3: B -> A on Destination 2 (Complete package imported first, then partial older package A)
    const targetDb2 = new ComprehensiveMockDb();
    const importSvc2 = new ContentImportService(targetDb2 as unknown as DbClient, targetStorage);
    const pB_initial = await importSvc2.validatePackage(zipB, actorId, orgB);
    await importSvc2.executeImport(pB_initial.planId, actorId, orgB);
    expect(targetDb2.tables.lessons.length).toBe(2);

    const pA_after_B = await importSvc2.validatePackage(zipA, actorId, orgB);
    expect(pA_after_B.summary.courses.existing).toBe(1);
    expect(pA_after_B.summary.lessons.existing).toBe(1);
    expect(pA_after_B.summary.lessons.new).toBe(0);
    const resA_after_B = await importSvc2.executeImport(pA_after_B.planId, actorId, orgB);
    expect(resA_after_B.counts.created).toBe(0);
    expect(resA_after_B.counts.skipped).toBe(3); // Course, Module, Lesson 1
    // Lessons in DB remain 2 (non-destructive)
    expect(targetDb2.tables.lessons.length).toBe(2);
  });

  // =========================================================================
  // 4. REPEATED IDENTICAL IMPORT (IDEMPOTENCY): A -> A -> A and B -> B -> B
  // =========================================================================
  it("4. Idempotency: Re-importing identical package multiple times (3x) produces 0 duplicates and stable record counts", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره تکرار", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "ماژول ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "محتوا", sortOrder: 1 });
    sourceDb.tables.flashcards.push({ id: "fc1", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "Q1", answer: "A1" });
    sourceDb.tables.quizzes.push({ id: "q1", organizationId: orgA, courseId: "c1", title: "QZ1", status: "published" });
    sourceDb.tables.quiz_questions.push({ id: "qq1", quizId: "q1", lessonId: "l1", question: "QQ1", choices: ["1"], correctAnswer: "1", sortOrder: 1 });
    sourceDb.tables.generated_contents.push({ id: "gc1", organizationId: orgA, courseId: "c1", materializedLessonId: "l1", type: "summary", payload: {} });

    const zipPackage = await exportService.exportContent(orgA);

    // Pass 1
    const p1 = await importService.validatePackage(zipPackage, actorId, orgB);
    await importService.executeImport(p1.planId, actorId, orgB);

    const countCourse1 = targetDb.tables.courses.length;
    const countModule1 = targetDb.tables.modules.length;
    const countLesson1 = targetDb.tables.lessons.length;
    const countFc1 = targetDb.tables.flashcards.length;
    const countQuiz1 = targetDb.tables.quizzes.length;
    const countQq1 = targetDb.tables.quiz_questions.length;
    const countGc1 = targetDb.tables.generated_contents.length;

    // Pass 2
    const p2 = await importService.validatePackage(zipPackage, actorId, orgB);
    expect(p2.summary.courses.existing).toBe(1);
    expect(p2.summary.modules.existing).toBe(1);
    expect(p2.summary.lessons.existing).toBe(1);
    expect(p2.summary.flashcards.existing).toBe(1);
    expect(p2.summary.quizzes.existing).toBe(1);
    expect(p2.summary.questions.existing).toBe(1);
    expect(p2.summary.generatedContents.existing).toBe(1);
    const r2 = await importService.executeImport(p2.planId, actorId, orgB);
    expect(r2.counts.created).toBe(0);

    // Pass 3
    const p3 = await importService.validatePackage(zipPackage, actorId, orgB);
    const r3 = await importService.executeImport(p3.planId, actorId, orgB);
    expect(r3.counts.created).toBe(0);

    // Check counts unchanged across all entities
    expect(targetDb.tables.courses.length).toBe(countCourse1);
    expect(targetDb.tables.modules.length).toBe(countModule1);
    expect(targetDb.tables.lessons.length).toBe(countLesson1);
    expect(targetDb.tables.flashcards.length).toBe(countFc1);
    expect(targetDb.tables.quizzes.length).toBe(countQuiz1);
    expect(targetDb.tables.quiz_questions.length).toBe(countQq1);
    expect(targetDb.tables.generated_contents.length).toBe(countGc1);
  });

  // =========================================================================
  // 5. PARTIAL -> COMPLETE -> MODIFIED
  // =========================================================================
  it("5. Partial -> Complete -> Modified: Version 1 (L1) -> Version 2 (L1+L2) -> Version 3 (L1 modified+L2+L3)", async () => {
    // V1
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره تغییرات", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "نسخه ۱", sortOrder: 1 });
    const zipV1 = await exportService.exportContent(orgA);

    // Import V1
    const p1 = await importService.validatePackage(zipV1, actorId, orgB);
    await importService.executeImport(p1.planId, actorId, orgB);

    // V2: Add L2
    sourceDb.tables.lessons.push({ id: "l2", moduleId: "m1", title: "درس ۲", contentType: "markdown", contentMarkdown: "نسخه ۲", sortOrder: 2 });
    const zipV2 = await exportService.exportContent(orgA);

    // Import V2
    const p2 = await importService.validatePackage(zipV2, actorId, orgB);
    expect(p2.summary.lessons.existing).toBe(1);
    expect(p2.summary.lessons.new).toBe(1);
    await importService.executeImport(p2.planId, actorId, orgB);

    // V3: Modify L1 content, add L3
    sourceDb.tables.lessons[0].contentMarkdown = "نسخه ۳ با تغییرات اساسی در متن درس";
    sourceDb.tables.lessons.push({ id: "l3", moduleId: "m1", title: "درس ۳", contentType: "markdown", contentMarkdown: "درس ۳ جدید", sortOrder: 3 });
    const zipV3 = await exportService.exportContent(orgA);

    // Validate V3: L1 should be flagged as CONFLICT
    const p3 = await importService.validatePackage(zipV3, actorId, orgB);
    expect(p3.summary.lessons.conflict).toBe(1); // L1 conflict
    expect(p3.summary.lessons.existing).toBe(1); // L2 existing
    expect(p3.summary.lessons.new).toBe(1); // L3 new
    expect(p3.conflicts.length).toBe(1);
    expect(p3.conflicts[0].entityType).toBe("lesson");
    expect(p3.conflicts[0].titleOrName).toBe("درس ۱");
  });

  // =========================================================================
  // 6. CONTENT DELETION: Additive/Non-destructive behavior
  // =========================================================================
  it("6. Content Deletion: Removing an entity in source (L2 deleted) preserves L2 in destination DB upon re-import", async () => {
    // V_A: L1, L2, L3, FC1, FC2, Q1(QQ1, QQ2)
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره حذف", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push(
      { id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "متن ۱", sortOrder: 1 },
      { id: "l2", moduleId: "m1", title: "درس ۲", contentType: "markdown", contentMarkdown: "متن ۲", sortOrder: 2 },
      { id: "l3", moduleId: "m1", title: "درس ۳", contentType: "markdown", contentMarkdown: "متن ۳", sortOrder: 3 },
    );
    sourceDb.tables.flashcards.push(
      { id: "fc1", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "FC1", answer: "A1" },
      { id: "fc2", organizationId: orgA, courseId: "c1", lessonId: "l2", question: "FC2", answer: "A2" },
    );
    sourceDb.tables.quizzes.push({ id: "q1", organizationId: orgA, courseId: "c1", title: "Q1", status: "published" });
    sourceDb.tables.quiz_questions.push(
      { id: "qq1", quizId: "q1", lessonId: "l1", question: "QQ1", choices: ["1"], correctAnswer: "1", sortOrder: 1 },
      { id: "qq2", quizId: "q1", lessonId: "l2", question: "QQ2", choices: ["2"], correctAnswer: "2", sortOrder: 2 },
    );

    const zipA = await exportService.exportContent(orgA);
    const pA = await importService.validatePackage(zipA, actorId, orgB);
    await importService.executeImport(pA.planId, actorId, orgB);

    expect(targetDb.tables.lessons.length).toBe(3);
    expect(targetDb.tables.flashcards.length).toBe(2);
    expect(targetDb.tables.quiz_questions.length).toBe(2);

    // Source DB deletes Lesson 2, Flashcard 2, Question 2
    sourceDb.tables.lessons = sourceDb.tables.lessons.filter((l) => l.id !== "l2");
    sourceDb.tables.flashcards = sourceDb.tables.flashcards.filter((fc) => fc.id !== "fc2");
    sourceDb.tables.quiz_questions = sourceDb.tables.quiz_questions.filter((qq) => qq.id !== "qq2");

    const zipB = await exportService.exportContent(orgA);
    const pB = await importService.validatePackage(zipB, actorId, orgB);

    // Preview should see 2 existing lessons, 1 existing flashcard, 1 existing question
    expect(pB.summary.lessons.existing).toBe(2);
    expect(pB.summary.flashcards.existing).toBe(1);
    expect(pB.summary.questions.existing).toBe(1);

    await importService.executeImport(pB.planId, actorId, orgB);

    // Deletion behavior assertion: Destination database preserves previously imported items (non-destructive additive policy)
    expect(targetDb.tables.lessons.length).toBe(3);
    expect(targetDb.tables.flashcards.length).toBe(2);
    expect(targetDb.tables.quiz_questions.length).toBe(2);
  });

  // =========================================================================
  // 7. ENTITY RENAMING SEMANTICS
  // =========================================================================
  it("7. Entity Renaming: Renaming course or lesson triggers CONFLICT; renaming module recognizes provenance", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "نام اولیه دوره", subject: "پزشکی", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "نام اولیه فصل", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "نام اولیه درس", contentType: "markdown", contentMarkdown: "متن درس", sortOrder: 1 });

    const zip1 = await exportService.exportContent(orgA);
    const p1 = await importService.validatePackage(zip1, actorId, orgB);
    await importService.executeImport(p1.planId, actorId, orgB);

    // 7.1 Rename Lesson in Source
    sourceDb.tables.lessons[0].title = "نام جدید درس";
    const zipLessonRenamed = await exportService.exportContent(orgA);
    const pLesson = await importService.validatePackage(zipLessonRenamed, actorId, orgB);
    expect(pLesson.summary.lessons.conflict).toBe(1);
    expect(pLesson.conflicts.some((c) => c.entityType === "lesson")).toBe(true);

    // 7.2 Rename Course in Source
    sourceDb.tables.lessons[0].title = "نام اولیه درس"; // restore lesson
    sourceDb.tables.courses[0].name = "نام جدید دوره";
    const zipCourseRenamed = await exportService.exportContent(orgA);
    const pCourse = await importService.validatePackage(zipCourseRenamed, actorId, orgB);
    expect(pCourse.summary.courses.conflict).toBe(1);
    expect(pCourse.conflicts.some((c) => c.entityType === "course")).toBe(true);

    // 7.3 Rename Module in Source (Module matching by provenance exportId)
    sourceDb.tables.courses[0].name = "نام اولیه دوره"; // restore course
    sourceDb.tables.modules[0].title = "نام جدید فصل";
    const zipModuleRenamed = await exportService.exportContent(orgA);
    const pModule = await importService.validatePackage(zipModuleRenamed, actorId, orgB);
    expect(pModule.summary.modules.existing).toBe(1); // Module matched via imported_entities exportId
  });

  // =========================================================================
  // 8. CONTENT CHANGE WITHOUT IDENTITY CHANGE
  // =========================================================================
  it("8. Content Change Without Identity Change: Lesson markdown change detected as CONFLICT", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره متن", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "محتوای نسخه X", sortOrder: 1 });

    const zipX = await exportService.exportContent(orgA);
    const pX = await importService.validatePackage(zipX, actorId, orgB);
    await importService.executeImport(pX.planId, actorId, orgB);

    // Change markdown to Y
    sourceDb.tables.lessons[0].contentMarkdown = "محتوای نسخه Y کاملاً متفاوت";
    const zipY = await exportService.exportContent(orgA);
    const pY = await importService.validatePackage(zipY, actorId, orgB);

    expect(pY.summary.lessons.conflict).toBe(1);
    expect(pY.conflicts[0].reason).toContain("متفاوت است");
  });

  // =========================================================================
  // 9. FLASHCARD ADDITION & REMOVAL MATRIX: A(3) -> B(5) -> C(2)
  // =========================================================================
  it("9. Flashcards Matrix: Sequential A(3) -> B(5) -> C(2) maintains correct count and no duplicates", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره فلش کارت", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "متن", sortOrder: 1 });

    // A: 3 cards
    sourceDb.tables.flashcards.push(
      { id: "fc1", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "Q1", answer: "A1" },
      { id: "fc2", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "Q2", answer: "A2" },
      { id: "fc3", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "Q3", answer: "A3" },
    );
    const zipA = await exportService.exportContent(orgA);

    // B: 5 cards (3 existing + 2 new)
    sourceDb.tables.flashcards.push(
      { id: "fc4", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "Q4", answer: "A4" },
      { id: "fc5", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "Q5", answer: "A5" },
    );
    const zipB = await exportService.exportContent(orgA);

    // C: 2 cards (only fc1 and fc2)
    sourceDb.tables.flashcards = sourceDb.tables.flashcards.filter((fc) => fc.id === "fc1" || fc.id === "fc2");
    const zipC = await exportService.exportContent(orgA);

    // Step 1: Import A
    const pA = await importService.validatePackage(zipA, actorId, orgB);
    expect(pA.summary.flashcards.new).toBe(3);
    await importService.executeImport(pA.planId, actorId, orgB);
    expect(targetDb.tables.flashcards.length).toBe(3);

    // Step 2: Import B
    const pB = await importService.validatePackage(zipB, actorId, orgB);
    expect(pB.summary.flashcards.existing).toBe(3);
    expect(pB.summary.flashcards.new).toBe(2);
    await importService.executeImport(pB.planId, actorId, orgB);
    expect(targetDb.tables.flashcards.length).toBe(5);

    // Step 3: Import C
    const pC = await importService.validatePackage(zipC, actorId, orgB);
    expect(pC.summary.flashcards.existing).toBe(2);
    expect(pC.summary.flashcards.new).toBe(0);
    await importService.executeImport(pC.planId, actorId, orgB);
    expect(targetDb.tables.flashcards.length).toBe(5); // Retained non-destructively
  });

  // =========================================================================
  // 10. QUIZZES & QUESTIONS MATRIX: A(1q, 5qq) -> B(1q, 10qq) -> C(2q, 8qq)
  // =========================================================================
  it("10. Quizzes & Questions Matrix: A(1q, 5qq) -> B(1q, 10qq) -> C(2q, 8qq) maintains mapping and 0 orphan questions", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره آزمون", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "متن", sortOrder: 1 });

    // A: 1 Quiz + 5 Questions
    sourceDb.tables.quizzes.push({ id: "q1", organizationId: orgA, courseId: "c1", title: "آزمون ۱", status: "published" });
    for (let i = 1; i <= 5; i++) {
      sourceDb.tables.quiz_questions.push({
        id: `qq-${i}`,
        quizId: "q1",
        lessonId: "l1",
        question: `سوال ${i}`,
        choices: ["1", "2"],
        correctAnswer: "1",
        sortOrder: i,
      });
    }
    const zipA = await exportService.exportContent(orgA);

    // B: 1 Quiz + 10 Questions (5 original + 5 new)
    for (let i = 6; i <= 10; i++) {
      sourceDb.tables.quiz_questions.push({
        id: `qq-${i}`,
        quizId: "q1",
        lessonId: "l1",
        question: `سوال ${i}`,
        choices: ["1", "2"],
        correctAnswer: "1",
        sortOrder: i,
      });
    }
    const zipB = await exportService.exportContent(orgA);

    // C: 2 Quizzes + 8 Questions (Quiz 1 with questions 1..5, Quiz 2 with questions 11..13)
    sourceDb.tables.quizzes.push({ id: "q2", organizationId: orgA, courseId: "c1", title: "آزمون ۲", status: "published" });
    sourceDb.tables.quiz_questions = sourceDb.tables.quiz_questions.filter((qq) => ["qq-1", "qq-2", "qq-3", "qq-4", "qq-5"].includes(qq.id));
    for (let i = 11; i <= 13; i++) {
      sourceDb.tables.quiz_questions.push({
        id: `qq-${i}`,
        quizId: "q2",
        lessonId: "l1",
        question: `سوال جدید کوئیز ۲ - شماره ${i}`,
        choices: ["A", "B"],
        correctAnswer: "A",
        sortOrder: i,
      });
    }
    const zipC = await exportService.exportContent(orgA);

    // Import A
    const pA = await importService.validatePackage(zipA, actorId, orgB);
    expect(pA.summary.quizzes.new).toBe(1);
    expect(pA.summary.questions.new).toBe(5);
    await importService.executeImport(pA.planId, actorId, orgB);
    expect(targetDb.tables.quizzes.length).toBe(1);
    expect(targetDb.tables.quiz_questions.length).toBe(5);

    // Import B
    const pB = await importService.validatePackage(zipB, actorId, orgB);
    expect(pB.summary.quizzes.existing).toBe(1);
    expect(pB.summary.questions.existing).toBe(5);
    expect(pB.summary.questions.new).toBe(5);
    await importService.executeImport(pB.planId, actorId, orgB);
    expect(targetDb.tables.quizzes.length).toBe(1);
    expect(targetDb.tables.quiz_questions.length).toBe(10);

    // Import C
    const pC = await importService.validatePackage(zipC, actorId, orgB);
    expect(pC.summary.quizzes.existing).toBe(1);
    expect(pC.summary.quizzes.new).toBe(1);
    expect(pC.summary.questions.existing).toBe(5);
    expect(pC.summary.questions.new).toBe(3);
    await importService.executeImport(pC.planId, actorId, orgB);
    expect(targetDb.tables.quizzes.length).toBe(2);
    expect(targetDb.tables.quiz_questions.length).toBe(13); // 10 from B + 3 new from C

    // Assert 0 orphan questions: Every question references a valid quiz in targetDb
    const targetQuizIds = new Set(targetDb.tables.quizzes.map((q) => q.id));
    for (const qq of targetDb.tables.quiz_questions) {
      expect(targetQuizIds.has(qq.quizId as string)).toBe(true);
    }
  });

  // =========================================================================
  // 11. DEPENDENCIES & MAPPING VALIDATION
  // =========================================================================
  it("11. Dependencies & exportId -> targetId Mapping: All parent-child foreign references mapped accurately", async () => {
    sourceDb.tables.courses.push({ id: "src-c", organizationId: orgA, name: "دوره نگاشت", status: "published" });
    sourceDb.tables.modules.push({ id: "src-m", courseId: "src-c", title: "ماژول نگاشت", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "src-l", moduleId: "src-m", title: "درس نگاشت", contentType: "markdown", contentMarkdown: "محتوا", sortOrder: 1 });
    sourceDb.tables.generated_contents.push({ id: "src-gc", organizationId: orgA, courseId: "src-c", materializedLessonId: "src-l", type: "summary", payload: {} });
    sourceDb.tables.flashcards.push({ id: "src-fc", organizationId: orgA, courseId: "src-c", lessonId: "src-l", question: "Q", answer: "A" });
    sourceDb.tables.quizzes.push({ id: "src-qz", organizationId: orgA, courseId: "src-c", title: "کوئیز", status: "published" });
    sourceDb.tables.quiz_questions.push({ id: "src-qq", quizId: "src-qz", lessonId: "src-l", generatedContentId: "src-gc", question: "QQ", choices: ["1"], correctAnswer: "1", sortOrder: 1 });

    const zip = await exportService.exportContent(orgA);
    const plan = await importService.validatePackage(zip, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    // Verify imported_entities mapping table entries
    expect(targetDb.tables.imported_entities.length).toBe(7); // course, module, lesson, gc, fc, quiz, qq

    const courseProv = targetDb.tables.imported_entities.find((e) => e.entityType === "course")!;
    const modProv = targetDb.tables.imported_entities.find((e) => e.entityType === "module")!;
    const lessonProv = targetDb.tables.imported_entities.find((e) => e.entityType === "lesson")!;
    const gcProv = targetDb.tables.imported_entities.find((e) => e.entityType === "generated_content")!;
    const fcProv = targetDb.tables.imported_entities.find((e) => e.entityType === "flashcard")!;
    const quizProv = targetDb.tables.imported_entities.find((e) => e.entityType === "quiz")!;
    const qqProv = targetDb.tables.imported_entities.find((e) => e.entityType === "quiz_question")!;

    expect(courseProv.targetEntityId).toBeDefined();
    expect(modProv.targetEntityId).toBeDefined();
    expect(lessonProv.targetEntityId).toBeDefined();

    // Check relationship pointers in DB tables
    const targetMod = targetDb.tables.modules.find((m) => m.id === modProv.targetEntityId)!;
    expect(targetMod.courseId).toBe(courseProv.targetEntityId);

    const targetLesson = targetDb.tables.lessons.find((l) => l.id === lessonProv.targetEntityId)!;
    expect(targetLesson.moduleId).toBe(modProv.targetEntityId);

    const targetGc = targetDb.tables.generated_contents.find((gc) => gc.id === gcProv.targetEntityId)!;
    expect(targetGc.courseId).toBe(courseProv.targetEntityId);
    expect(targetGc.materializedLessonId).toBe(lessonProv.targetEntityId);

    const targetFc = targetDb.tables.flashcards.find((fc) => fc.id === fcProv.targetEntityId)!;
    expect(targetFc.courseId).toBe(courseProv.targetEntityId);
    expect(targetFc.lessonId).toBe(lessonProv.targetEntityId);

    const targetQuiz = targetDb.tables.quizzes.find((q) => q.id === quizProv.targetEntityId)!;
    expect(targetQuiz.courseId).toBe(courseProv.targetEntityId);

    const targetQq = targetDb.tables.quiz_questions.find((qq) => qq.id === qqProv.targetEntityId)!;
    expect(targetQq.quizId).toBe(quizProv.targetEntityId);
    expect(targetQq.lessonId).toBe(lessonProv.targetEntityId);
    expect(targetQq.generatedContentId).toBe(gcProv.targetEntityId);
  });

  // =========================================================================
  // 12. ZIP FILE ORDER INDEPENDENCE
  // =========================================================================
  it("12. ZIP File Order Independence: Reverse and shuffled JSON order in ZIP produces identical hierarchy", async () => {
    const zip = new JSZip();
    const manifest = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: "shuffled-test",
      contentVersion: "1.0",
      scope: { courses: true, modules: true, lessons: true, documents: true, generatedContent: true, flashcards: true, quizzes: true, questions: true, files: true },
      counts: { courses: 1, modules: 1, lessons: 1, documents: 0, documentChunks: 0, generatedContents: 0, flashcards: 1, quizzes: 1, questions: 1, files: 0 },
      files: [],
    };

    // Add entries in reverse order
    zip.file("questions.json", JSON.stringify([{ exportId: "q_qq", quizExportId: "q_qz", lessonExportId: "q_ls", question: "سؤال", choices: ["1"], correctAnswer: "1", sortOrder: 1 }]));
    zip.file("quizzes.json", JSON.stringify([{ exportId: "q_qz", courseExportId: "q_cs", title: "کوئیز", status: "published" }]));
    zip.file("flashcards.json", JSON.stringify([{ exportId: "q_fc", courseExportId: "q_cs", lessonExportId: "q_ls", question: "فلش", answer: "پاسخ" }]));
    zip.file("lessons.json", JSON.stringify([{ exportId: "q_ls", moduleExportId: "q_md", title: "درس", contentType: "markdown", contentMarkdown: "متن", sortOrder: 1 }]));
    zip.file("modules.json", JSON.stringify([{ exportId: "q_md", courseExportId: "q_cs", title: "فصل", sortOrder: 1 }]));
    zip.file("courses.json", JSON.stringify([{ exportId: "q_cs", name: "دوره با ترتیب برعکس", status: "published" }]));
    zip.file("manifest.json", JSON.stringify(manifest));

    const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
    const plan = await importService.validatePackage(zipBuf, actorId, orgB);
    const res = await importService.executeImport(plan.planId, actorId, orgB);
    expect(res.success).toBe(true);

    const crs = targetDb.tables.courses.find((c) => c.name === "دوره با ترتیب برعکس")!;
    const mod = targetDb.tables.modules.find((m) => m.courseId === crs.id)!;
    const les = targetDb.tables.lessons.find((l) => l.moduleId === mod.id)!;
    const qz = targetDb.tables.quizzes.find((q) => q.courseId === crs.id)!;
    const qq = targetDb.tables.quiz_questions.find((q) => q.quizId === qz.id)!;
    expect(qq.lessonId).toBe(les.id);
  });

  // =========================================================================
  // 13. MISSING / PARTIAL PACKAGE
  // =========================================================================
  it("13. Missing / Partial Package: Missing manifest throws; missing non-critical entity JSON files default to empty lists", async () => {
    // 13.1 Missing manifest.json
    const badZip1 = new JSZip();
    badZip1.file("courses.json", JSON.stringify([]));
    const buf1 = await badZip1.generateAsync({ type: "nodebuffer" });
    await expect(importService.validatePackage(buf1, actorId, orgB)).rejects.toThrow(/missing manifest.json/);

    // 13.2 Missing optional files (flashcards.json, quizzes.json) defaults gracefully
    const validMinimalZip = new JSZip();
    validMinimalZip.file("manifest.json", JSON.stringify({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: "minimal",
      contentVersion: "1.0",
      scope: { courses: true, modules: true, lessons: true },
      counts: { courses: 1, modules: 0, lessons: 0 },
      files: [],
    }));
    validMinimalZip.file("courses.json", JSON.stringify([{ exportId: "c_min", name: "دوره کمینه", status: "published" }]));
    const buf2 = await validMinimalZip.generateAsync({ type: "nodebuffer" });
    const plan = await importService.validatePackage(buf2, actorId, orgB);
    expect(plan.summary.courses.new).toBe(1);
    expect(plan.summary.flashcards.new).toBe(0);
    expect(plan.summary.quizzes.new).toBe(0);

    const execRes = await importService.executeImport(plan.planId, actorId, orgB);
    expect(execRes.success).toBe(true);
    expect(targetDb.tables.courses.length).toBe(1);
  });

  // =========================================================================
  // 14. CORRUPTED / INVALID REFERENCES
  // =========================================================================
  it("14. Corrupted / Invalid References: Module with invalid courseExportId, Lesson with invalid moduleExportId, Question with invalid quizExportId reject during validation", async () => {
    // 14.1 Module with invalid courseExportId
    const zip1 = new JSZip();
    zip1.file("manifest.json", JSON.stringify({ formatVersion: 1 }));
    zip1.file("courses.json", JSON.stringify([{ exportId: "c1", name: "C1" }]));
    zip1.file("modules.json", JSON.stringify([{ exportId: "m1", courseExportId: "c_unknown_999", title: "M1" }]));
    const buf1 = await zip1.generateAsync({ type: "nodebuffer" });
    await expect(importService.validatePackage(buf1, actorId, orgB)).rejects.toThrow(/references non-existent courseExportId: 'c_unknown_999'/);

    // 14.2 Lesson with invalid moduleExportId
    const zip2 = new JSZip();
    zip2.file("manifest.json", JSON.stringify({ formatVersion: 1 }));
    zip2.file("courses.json", JSON.stringify([{ exportId: "c1", name: "C1" }]));
    zip2.file("modules.json", JSON.stringify([{ exportId: "m1", courseExportId: "c1", title: "M1" }]));
    zip2.file("lessons.json", JSON.stringify([{ exportId: "l1", moduleExportId: "m_unknown_999", title: "L1" }]));
    const buf2 = await zip2.generateAsync({ type: "nodebuffer" });
    await expect(importService.validatePackage(buf2, actorId, orgB)).rejects.toThrow(/references non-existent moduleExportId: 'm_unknown_999'/);

    // 14.3 Question with invalid quizExportId
    const zip3 = new JSZip();
    zip3.file("manifest.json", JSON.stringify({ formatVersion: 1 }));
    zip3.file("courses.json", JSON.stringify([{ exportId: "c1", name: "C1" }]));
    zip3.file("quizzes.json", JSON.stringify([{ exportId: "qz1", courseExportId: "c1", title: "QZ1" }]));
    zip3.file("questions.json", JSON.stringify([{ exportId: "qq1", quizExportId: "qz_unknown_999", question: "QQ1" }]));
    const buf3 = await zip3.generateAsync({ type: "nodebuffer" });
    await expect(importService.validatePackage(buf3, actorId, orgB)).rejects.toThrow(/references non-existent quizExportId: 'qz_unknown_999'/);
  });

  // =========================================================================
  // 15. CROSS-ENVIRONMENT IMPORT
  // =========================================================================
  it("15. Cross-environment Import: Export from Source Org A with internal IDs maps cleanly to Target Org B with fresh UUIDs", async () => {
    const srcCourseId = "11111111-0000-0000-0000-000000000001";
    const srcModId = "11111111-0000-0000-0000-000000000002";
    const srcLessonId = "11111111-0000-0000-0000-000000000003";

    sourceDb.tables.courses.push({ id: srcCourseId, organizationId: orgA, name: "دوره بین محیطی", status: "published" });
    sourceDb.tables.modules.push({ id: srcModId, courseId: srcCourseId, title: "فصل", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: srcLessonId, moduleId: srcModId, title: "درس", contentType: "markdown", contentMarkdown: "متن", sortOrder: 1 });

    const zip = await exportService.exportContent(orgA);
    const plan = await importService.validatePackage(zip, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    const targetCourse = targetDb.tables.courses.find((c) => c.organizationId === orgB)!;
    const targetMod = targetDb.tables.modules.find((m) => m.courseId === targetCourse.id)!;
    const targetLesson = targetDb.tables.lessons.find((l) => l.moduleId === targetMod.id)!;

    // Must NOT equal source internal IDs
    expect(targetCourse.id).not.toBe(srcCourseId);
    expect(targetMod.id).not.toBe(srcModId);
    expect(targetLesson.id).not.toBe(srcLessonId);
  });

  // =========================================================================
  // 16. COLLISION / EXISTING DATA NATURAL MATCHING
  // =========================================================================
  it("16. Natural Key Matching: Target has pre-existing Course created manually; import attaches modules to it without creating duplicate course", async () => {
    // Pre-existing course in target created manually
    const preExistingCourseId = "target-pre-existing-c1";
    targetDb.tables.courses.push({
      id: preExistingCourseId,
      organizationId: orgB,
      name: "فارماکولوژی دستی",
      status: "published",
    });

    // Source DB has a course with the EXACT same name
    sourceDb.tables.courses.push({
      id: "src-c-manual",
      organizationId: orgA,
      name: "فارماکولوژی دستی",
      status: "published",
    });
    sourceDb.tables.modules.push({
      id: "src-m-manual",
      courseId: "src-c-manual",
      title: "فصل وارداتی",
      sortOrder: 1,
    });
    sourceDb.tables.lessons.push({
      id: "src-l-manual",
      moduleId: "src-m-manual",
      title: "درس وارداتی",
      contentType: "markdown",
      contentMarkdown: "محتوا",
      sortOrder: 1,
    });

    const zip = await exportService.exportContent(orgA);
    const plan = await importService.validatePackage(zip, actorId, orgB);

    // Natural key matching detects course as EXISTING
    expect(plan.summary.courses.existing).toBe(1);
    expect(plan.summary.courses.new).toBe(0);
    expect(plan.summary.modules.new).toBe(1);
    expect(plan.summary.lessons.new).toBe(1);

    await importService.executeImport(plan.planId, actorId, orgB);

    // Target DB still has only 1 course
    expect(targetDb.tables.courses.filter((c) => c.organizationId === orgB).length).toBe(1);
    const importedMod = targetDb.tables.modules.find((m) => m.title === "فصل وارداتی")!;
    expect(importedMod.courseId).toBe(preExistingCourseId);
  });

  // =========================================================================
  // 17. TWO SOURCES -> ONE DESTINATION MERGE
  // =========================================================================
  it("17. Two Sources -> One Destination: Source A (Course X + Lesson 1) and Source B (Course X + Lesson 2) merge under same Course", async () => {
    // Source 1
    sourceDb.tables.courses.push({ id: "src1-c", organizationId: orgA, name: "دوره مشترک", status: "published" });
    sourceDb.tables.modules.push({ id: "src1-m", courseId: "src1-c", title: "ماژول مشترک", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "src1-l1", moduleId: "src1-m", title: "درس ۱ از منبع اول", contentType: "markdown", contentMarkdown: "متن ۱", sortOrder: 1 });
    const zip1 = await exportService.exportContent(orgA);

    // Source 2 (different org, different IDs, same Course and Module titles)
    const sourceDb2 = new ComprehensiveMockDb();
    const exportSvc2 = new ContentExportService(sourceDb2 as unknown as DbClient, sourceStorage);
    sourceDb2.tables.courses.push({ id: "src2-c", organizationId: orgC, name: "دوره مشترک", status: "published" });
    sourceDb2.tables.modules.push({ id: "src2-m", courseId: "src2-c", title: "ماژول مشترک", sortOrder: 1 });
    sourceDb2.tables.lessons.push({ id: "src2-l2", moduleId: "src2-m", title: "درس ۲ از منبع دوم", contentType: "markdown", contentMarkdown: "متن ۲", sortOrder: 2 });
    const zip2 = await exportSvc2.exportContent(orgC);

    // Import Source 1
    const p1 = await importService.validatePackage(zip1, actorId, orgB);
    await importService.executeImport(p1.planId, actorId, orgB);

    // Import Source 2
    const p2 = await importService.validatePackage(zip2, actorId, orgB);
    // Tier 2 natural matching recognizes course and module as EXISTING
    expect(p2.summary.courses.existing).toBe(1);
    expect(p2.summary.modules.existing).toBe(1);
    expect(p2.summary.lessons.new).toBe(1);
    await importService.executeImport(p2.planId, actorId, orgB);

    // Assert Merge: Exactly 1 Course, 1 Module, and 2 Lessons under that module
    expect(targetDb.tables.courses.filter((c) => c.organizationId === orgB).length).toBe(1);
    expect(targetDb.tables.modules.length).toBe(1);
    expect(targetDb.tables.lessons.length).toBe(2);
  });

  // =========================================================================
  // 18. FAILURE & TRANSACTIONAL ROLLBACK
  // =========================================================================
  it("18. Failure & Rollback: Failure during lesson/quiz insertion triggers strict rollback with 0 leaked rows and storage cleanup", async () => {
    // Add document with physical file
    const fileBytes = Buffer.from("Verification Rollback File");
    const fileSha = crypto.createHash("sha256").update(fileBytes).digest("hex");
    await sourceStorage.save({ storageKey: "uploads/rollback.pdf", data: fileBytes, mimeType: "application/pdf" });

    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره شکست", status: "published" });
    sourceDb.tables.documents.push({ id: "d1", organizationId: orgA, courseId: "c1", originalName: "doc.pdf", mimeType: "application/pdf", sizeBytes: fileBytes.length, sha256: fileSha, storageKey: "uploads/rollback.pdf" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "متن", sortOrder: 1 });

    const zip = await exportService.exportContent(orgA);
    const plan = await importService.validatePackage(zip, actorId, orgB);

    // Inject DB failure during lesson insertion
    targetDb.failOnInsertTable = "lessons";

    await expect(importService.executeImport(plan.planId, actorId, orgB)).rejects.toThrow(/Simulated database failure during insertion into lessons/);

    // Assert complete rollback
    expect(targetDb.tables.courses.length).toBe(0);
    expect(targetDb.tables.documents.length).toBe(0);
    expect(targetDb.tables.modules.length).toBe(0);
    expect(targetDb.tables.lessons.length).toBe(0);
    expect(targetDb.tables.imported_entities.length).toBe(0);
    expect(targetStorage.files.size).toBe(0); // Cleaned up physical file
  });

  // =========================================================================
  // 19. FIRST-RUN FAILURE THEN RETRY SUCCESS
  // =========================================================================
  it("19. First-run Failure then Retry: Retry after failure succeeds cleanly without duplicates", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره تلاش مجدد", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "متن", sortOrder: 1 });

    const zip = await exportService.exportContent(orgA);

    // Attempt 1: Validation works, Execution fails due to DB glitch
    const plan1 = await importService.validatePackage(zip, actorId, orgB);
    targetDb.failOnInsertTable = "modules";
    await expect(importService.executeImport(plan1.planId, actorId, orgB)).rejects.toThrow();

    // Fix glitch
    targetDb.failOnInsertTable = null;

    // Attempt 2: Re-validate and re-execute
    const plan2 = await importService.validatePackage(zip, actorId, orgB);
    expect(plan2.summary.courses.new).toBe(1);
    const res2 = await importService.executeImport(plan2.planId, actorId, orgB);
    expect(res2.success).toBe(true);

    expect(targetDb.tables.courses.length).toBe(1);
    expect(targetDb.tables.modules.length).toBe(1);
    expect(targetDb.tables.lessons.length).toBe(1);
  });

  // =========================================================================
  // 20. ROUND-TRIP: Export -> Import -> Export
  // =========================================================================
  it("20. Round-trip: Export A -> Import Destination -> Export Destination B maintains identical counts, titles, questions and cards", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره رفت و برگشت", description: "توضیحات", subject: "پزشکی", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "# درس ۱ رفت و برگشت", sortOrder: 1, publicationStatus: "published" });
    sourceDb.tables.flashcards.push({ id: "fc1", organizationId: orgA, courseId: "c1", lessonId: "l1", question: "سوال کارت", answer: "پاسخ کارت" });
    sourceDb.tables.quizzes.push({ id: "q1", organizationId: orgA, courseId: "c1", title: "آزمون رفت و برگشت", status: "published" });
    sourceDb.tables.quiz_questions.push({ id: "qq1", quizId: "q1", lessonId: "l1", question: "سوال آزمون", choices: ["الف", "ب"], correctAnswer: "الف", sortOrder: 1 });

    // 1. Export from Source
    const zipA = await exportService.exportContent(orgA);

    // 2. Import into Destination
    const planA = await importService.validatePackage(zipA, actorId, orgB);
    await importService.executeImport(planA.planId, actorId, orgB);

    // 3. Export from Destination
    const destExportSvc = new ContentExportService(targetDb as unknown as DbClient, targetStorage);
    const zipB = await destExportSvc.exportContent(orgB);

    // 4. Compare Manifests and Entities
    const zipAObj = await JSZip.loadAsync(zipA);
    const zipBObj = await JSZip.loadAsync(zipB);

    const manifestA = JSON.parse(await zipAObj.files["manifest.json"].async("string"));
    const manifestB = JSON.parse(await zipBObj.files["manifest.json"].async("string"));

    expect(manifestB.counts.courses).toBe(manifestA.counts.courses);
    expect(manifestB.counts.modules).toBe(manifestA.counts.modules);
    expect(manifestB.counts.lessons).toBe(manifestA.counts.lessons);
    expect(manifestB.counts.flashcards).toBe(manifestA.counts.flashcards);
    expect(manifestB.counts.quizzes).toBe(manifestA.counts.quizzes);
    expect(manifestB.counts.questions).toBe(manifestA.counts.questions);

    const lessonsA = JSON.parse(await zipAObj.files["lessons.json"].async("string"));
    const lessonsB = JSON.parse(await zipBObj.files["lessons.json"].async("string"));
    expect(lessonsB[0].title).toBe(lessonsA[0].title);
    expect(lessonsB[0].contentMarkdown).toBe(lessonsA[0].contentMarkdown);
  });

  // =========================================================================
  // 21. IDEMPOTENCY & DETERMINISM ACROSS DESTINATIONS
  // =========================================================================
  it("21. Multi-Destination Determinism: Export(Source) imported to Dest 1 and Dest 2 produces identical structures", async () => {
    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره چند مقصدی", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: "درس ۱", contentType: "markdown", contentMarkdown: "متن", sortOrder: 1 });

    const zip = await exportService.exportContent(orgA);

    // Import to Dest 1
    const targetDb1 = new ComprehensiveMockDb();
    const importSvc1 = new ContentImportService(targetDb1 as unknown as DbClient, targetStorage);
    const p1 = await importSvc1.validatePackage(zip, actorId, orgB);
    await importSvc1.executeImport(p1.planId, actorId, orgB);

    // Import to Dest 2
    const targetDb2 = new ComprehensiveMockDb();
    const importSvc2 = new ContentImportService(targetDb2 as unknown as DbClient, targetStorage);
    const p2 = await importSvc2.validatePackage(zip, actorId, orgC);
    await importSvc2.executeImport(p2.planId, actorId, orgC);

    expect(targetDb1.tables.courses.length).toBe(targetDb2.tables.courses.length);
    expect(targetDb1.tables.modules.length).toBe(targetDb2.tables.modules.length);
    expect(targetDb1.tables.lessons.length).toBe(targetDb2.tables.lessons.length);
    expect(targetDb1.tables.courses[0].name).toBe(targetDb2.tables.courses[0].name);
    expect(targetDb1.tables.lessons[0].title).toBe(targetDb2.tables.lessons[0].title);
  });

  // =========================================================================
  // 22. UNICODE, PERSIAN SPECIAL CHARACTERS & COMPLEX METADATA
  // =========================================================================
  it("22. Persian UTF-8, ZWNJ, and Complex Metadata: Preserves Persian characters and nested payload structures without corruption", async () => {
    const persianTitle = "درس ۱: فارماکوکینتیک و نیمه‌عمر داروها (ADME)";
    const persianContent = "# مفاهیم پایه\nداروی پروپرانولول با نیمه‌عمر ۴ ساعت.\n• نکته‌ی بالینی: مصرف با غذا جذب را افزایش می‌دهد.\n\n$$\\text{Clearance} = \\frac{\\text{Rate of Elimination}}{C_p}$$";

    sourceDb.tables.courses.push({ id: "c1", organizationId: orgA, name: "دوره تخصصی داروشناسی بالینی", status: "published" });
    sourceDb.tables.modules.push({ id: "m1", courseId: "c1", title: "فصل ۱: اصول پایه و نیمه‌عمر", sortOrder: 1 });
    sourceDb.tables.lessons.push({ id: "l1", moduleId: "m1", title: persianTitle, contentType: "markdown", contentMarkdown: persianContent, sortOrder: 1 });
    sourceDb.tables.flashcards.push({
      id: "fc1",
      organizationId: orgA,
      courseId: "c1",
      lessonId: "l1",
      question: "نیمه‌عمر چیست؟",
      answer: "مدت‌زمان لازم برای نصف شدن غلظت پلاسمایی دارو.",
    });

    const zip = await exportService.exportContent(orgA);
    const plan = await importService.validatePackage(zip, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    const importedLesson = targetDb.tables.lessons.find((l) => l.title === persianTitle)!;
    expect(importedLesson).toBeDefined();
    expect(importedLesson.contentMarkdown).toContain("نیمه‌عمر ۴ ساعت");
    expect(importedLesson.contentMarkdown).toContain("Clearance");

    const importedCard = targetDb.tables.flashcards.find((fc) => fc.question === "نیمه‌عمر چیست؟")!;
    expect(importedCard).toBeDefined();
    expect(importedCard.answer).toContain("مدت‌زمان لازم برای نصف شدن غلظت");
  });

  // =========================================================================
  // 23. MODULE DUPLICATE DETECTION BY (COURSE_ID, DOCUMENT_ID)
  // =========================================================================
  it("23. Module Duplicate Detection: Matches existing module by (course_id, document_id) even when title differs without provenance", async () => {
    // 1. Setup Source: Course + Document + Module linked to Doc + Lesson
    const docSha = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    sourceDb.tables.courses.push({
      id: "src-c1",
      organizationId: orgA,
      name: "فارماکولوژی ۱",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "src-doc1",
      organizationId: orgA,
      courseId: "src-c1",
      originalName: "pharma1.pdf",
      mimeType: "application/pdf",
      sha256: docSha,
      sizeBytes: 1024,
      status: "ready",
    });
    sourceDb.tables.modules.push({
      id: "src-m1",
      courseId: "src-c1",
      documentId: "src-doc1",
      title: "فصل ۱: کلیات فارماکولوژی (عنوان جدید منبع)",
      sortOrder: 1,
    });
    sourceDb.tables.lessons.push({
      id: "src-l1",
      moduleId: "src-m1",
      title: "مقدمه",
      contentType: "markdown",
      contentMarkdown: "# مقدمه",
      sortOrder: 1,
    });

    // 2. Setup Target: Already has the same course & document & module (with older title and NO provenance)
    targetDb.tables.courses.push({
      id: "tgt-c1",
      organizationId: orgB,
      name: "فارماکولوژی ۱",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: "tgt-doc1",
      organizationId: orgB,
      courseId: "tgt-c1",
      originalName: "pharma1.pdf",
      mimeType: "application/pdf",
      sha256: docSha,
      sizeBytes: 1024,
      status: "ready",
    });
    targetDb.tables.modules.push({
      id: "tgt-m1",
      courseId: "tgt-c1",
      documentId: "tgt-doc1",
      title: "فصل اول: کلیات و مقدمات (عنوان قدیمی مقصد)",
      sortOrder: 1,
    });

    // 3. Export from Source
    const zip = await exportService.exportContent(orgA);

    // 4. Validate Import into Target
    const plan = await importService.validatePackage(zip, actorId, orgB);

    // Course should be EXISTING (matched by name)
    expect(plan.summary.courses.existing).toBe(1);
    // Document should be EXISTING (matched by sha256)
    expect(plan.summary.documents.existing).toBe(1);
    // Module should be EXISTING (matched by target course + target document despite title difference!)
    expect(plan.summary.modules.existing).toBe(1);
    expect(plan.summary.modules.new).toBe(0);

    const moduleResolution = plan.resolutions.find((r) => r.entityType === "module")!;
    expect(moduleResolution.status).toBe("EXISTING");
    expect(moduleResolution.targetEntityId).toBe("tgt-m1");

    // 5. Execute Import
    const result = await importService.executeImport(plan.planId, actorId, orgB);
    expect(result.success).toBe(true);

    // Verify existing module is preserved in targetDb (not duplicated or overwritten)
    expect(targetDb.tables.modules.length).toBe(1);
    expect(targetDb.tables.modules[0].id).toBe("tgt-m1");
    expect(targetDb.tables.modules[0].title).toBe("فصل اول: کلیات و مقدمات (عنوان قدیمی مقصد)");

    // Verify imported lesson points to the existing target module ID
    const importedLesson = targetDb.tables.lessons.find((l) => l.title === "مقدمه")!;
    expect(importedLesson).toBeDefined();
    expect(importedLesson.moduleId).toBe("tgt-m1");
  });
});
