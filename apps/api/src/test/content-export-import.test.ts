import { describe, expect, it, beforeEach } from "vitest";
import crypto from "node:crypto";
import JSZip from "jszip";
import { ContentExportService } from "../modules/admin/content-export-service.js";
import { ContentImportService } from "../modules/admin/content-import-service.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../modules/storage/storage-provider.js";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  modules,
  lessons,
  documents,
  documentChunks,
  generatedContents,
  flashcards,
  quizzes,
  quizQuestions,
  importedEntities,
  contentImportBatches,
} from "@avana/database/schema";

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

/**
 * In-Memory Mock Database that tracks rows per table and executes transactions.
 */
class InMemoryMockDb {
  public tables: Record<string, any[]> = {
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

  getTableName(tableObj: any): string {
    // Drizzle table objects have [Symbol.for("drizzle:Name")] or ._name or config.name
    return tableObj?.[Symbol.for("drizzle:Name")] || tableObj?._?.name || tableObj?.name || "unknown";
  }

  select(fields?: any) {
    const self = this;
    return {
      from(tableObj: any) {
        const tableName = self.getTableName(tableObj);
        return {
          where(condition?: any) {
            return {
              orderBy(..._args: any[]) {
                return Promise.resolve([...(self.tables[tableName] || [])]);
              },
              then(resolve: any) {
                return resolve([...(self.tables[tableName] || [])]);
              },
            };
          },
          orderBy(..._args: any[]) {
            return Promise.resolve([...(self.tables[tableName] || [])]);
          },
          then(resolve: any) {
            return resolve([...(self.tables[tableName] || [])]);
          },
        };
      },
    };
  }

  insert(tableObj: any) {
    const self = this;
    const tableName = self.getTableName(tableObj);
    return {
      values(valOrVals: any) {
        return {
          onConflictDoUpdate(opts: any) {
            return {
              then(resolve: any) {
                const items = Array.isArray(valOrVals) ? valOrVals : [valOrVals];
                if (!self.tables[tableName]) self.tables[tableName] = [];
                for (const item of items) {
                  const existingIdx = self.tables[tableName].findIndex(
                    (r) =>
                      r.organizationId === item.organizationId &&
                      r.entityType === item.entityType &&
                      r.exportId === item.exportId,
                  );
                  if (existingIdx >= 0) {
                    self.tables[tableName][existingIdx] = {
                      ...self.tables[tableName][existingIdx],
                      ...item,
                    };
                  } else {
                    self.tables[tableName].push({ ...item });
                  }
                }
                return resolve({ rowCount: items.length });
              },
            };
          },
          then(resolve: any) {
            if (self.failOnInsertTable === tableName) {
              throw new Error(`Simulated database failure during insertion into ${tableName}`);
            }
            const items = Array.isArray(valOrVals) ? valOrVals : [valOrVals];
            if (!self.tables[tableName]) self.tables[tableName] = [];
            self.tables[tableName].push(...items);
            return resolve({ rowCount: items.length });
          },
        };
      },
    };
  }

  update(tableObj: any) {
    const self = this;
    const tableName = self.getTableName(tableObj);
    return {
      set(values: any) {
        return {
          where(condition: any) {
            return {
              then(resolve: any) {
                if (self.tables[tableName]) {
                  for (let i = 0; i < self.tables[tableName].length; i++) {
                    self.tables[tableName][i] = {
                      ...self.tables[tableName][i],
                      ...values,
                    };
                  }
                }
                return resolve({ rowCount: 1 });
              },
            };
          },
        };
      },
    };
  }

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    // Snapshot state for rollback
    const snapshot: Record<string, any[]> = {};
    for (const key of Object.keys(this.tables)) {
      snapshot[key] = [...this.tables[key]];
    }

    try {
      const result = await callback(this);
      return result;
    } catch (err) {
      // Roll back DB state
      for (const key of Object.keys(snapshot)) {
        this.tables[key] = [...snapshot[key]];
      }
      throw err;
    }
  }
}

describe("Content Export & Import Production-Ready System", () => {
  const orgA = "11111111-1111-1111-1111-111111111111";
  const orgB = "22222222-2222-2222-2222-222222222222";
  const actorId = "33333333-3333-3333-3333-333333333333";

  let sourceDb: InMemoryMockDb;
  let targetDb: InMemoryMockDb;
  let sourceStorage: InMemoryStorageProvider;
  let targetStorage: InMemoryStorageProvider;

  let exportService: ContentExportService;
  let importService: ContentImportService;

  beforeEach(() => {
    sourceDb = new InMemoryMockDb();
    targetDb = new InMemoryMockDb();
    sourceStorage = new InMemoryStorageProvider();
    targetStorage = new InMemoryStorageProvider();

    exportService = new ContentExportService(sourceDb as unknown as DbClient, sourceStorage);
    importService = new ContentImportService(targetDb as unknown as DbClient, targetStorage);
  });

  it("1. Export Package Creation: Generates complete graph with stable exportIds and manifest", async () => {
    // Seed Source DB
    const courseId = "course-source-1";
    const modId = "module-source-1";
    const lessonId = "lesson-source-1";
    const docId = "doc-source-1";
    const quizId = "quiz-source-1";
    const questionId = "question-source-1";
    const cardId = "card-source-1";

    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "فارماکولوژی پایه",
      description: "دوره جامع داروشناسی",
      subject: "پزشکی",
      status: "published",
      isOfficial: false,
    });

    sourceDb.tables.modules.push({
      id: modId,
      courseId,
      title: "فصل ۱: داروهای قلبی",
      description: "آشنایی با بتابلاکرها",
      sortOrder: 0,
    });

    sourceDb.tables.lessons.push({
      id: lessonId,
      moduleId: modId,
      title: "درس ۱: متوپرولول",
      contentType: "markdown",
      contentMarkdown: "# متوپرولول\nداروی مسدودکننده گیرنده بتا.",
      sortOrder: 0,
      publicationStatus: "published",
    });

    const fileContent = Buffer.from("PDF Content for Cardiology Document");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");
    const storageKey = `uploads/${docId}.pdf`;
    await sourceStorage.save({ storageKey, data: fileContent, mimeType: "application/pdf" });

    sourceDb.tables.documents.push({
      id: docId,
      organizationId: orgA,
      courseId,
      originalName: "cardio.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey,
      pageCount: 12,
    });

    sourceDb.tables.quizzes.push({
      id: quizId,
      organizationId: orgA,
      courseId,
      title: "آزمون فصل ۱",
      status: "published",
    });

    sourceDb.tables.quiz_questions.push({
      id: questionId,
      quizId,
      lessonId,
      question: "مکانیسم عمل متوپرولول چیست؟",
      choices: ["بتابلاکر", "مهارکننده ACE"],
      correctAnswer: "بتابلاکر",
      sortOrder: 0,
    });

    sourceDb.tables.flashcards.push({
      id: cardId,
      organizationId: orgA,
      courseId,
      lessonId,
      question: "متوپرولول چه نوع دارویی است؟",
      answer: "بتابلاکر اختصاصی بتا-۱",
      cardType: "definition",
    });

    // Execute Export
    const zipBuffer = await exportService.exportContent(orgA, { courseId });
    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(100);

    // Verify ZIP Contents
    const zip = await JSZip.loadAsync(zipBuffer);
    expect(zip.files["manifest.json"]).toBeDefined();
    expect(zip.files["courses.json"]).toBeDefined();
    expect(zip.files["modules.json"]).toBeDefined();
    expect(zip.files["lessons.json"]).toBeDefined();
    expect(zip.files["documents.json"]).toBeDefined();
    expect(zip.files["quizzes.json"]).toBeDefined();
    expect(zip.files["questions.json"]).toBeDefined();
    expect(zip.files["flashcards.json"]).toBeDefined();

    // Verify Manifest
    const manifest = JSON.parse(await zip.files["manifest.json"].async("string"));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.counts.courses).toBe(1);
    expect(manifest.counts.modules).toBe(1);
    expect(manifest.counts.lessons).toBe(1);
    expect(manifest.counts.flashcards).toBe(1);
    expect(manifest.counts.quizzes).toBe(1);
    expect(manifest.counts.questions).toBe(1);
    expect(manifest.counts.documents).toBe(1);
    expect(manifest.counts.files).toBe(1);

    // Verify File was bundled inside ZIP
    const exportedFileEntry = manifest.files[0];
    expect(exportedFileEntry.sha256).toBe(fileSha);
    expect(zip.files[exportedFileEntry.path]).toBeDefined();

    // Verify Clean exportIds & NO raw DB source IDs in foreign keys
    const coursesJson = JSON.parse(await zip.files["courses.json"].async("string"));
    const modulesJson = JSON.parse(await zip.files["modules.json"].async("string"));
    const lessonsJson = JSON.parse(await zip.files["lessons.json"].async("string"));
    const flashcardsJson = JSON.parse(await zip.files["flashcards.json"].async("string"));
    const questionsJson = JSON.parse(await zip.files["questions.json"].async("string"));

    expect(coursesJson[0].exportId).toBe(`course_${courseId}`);
    expect(modulesJson[0].exportId).toBe(`module_${modId}`);
    expect(modulesJson[0].courseExportId).toBe(`course_${courseId}`);
    expect(lessonsJson[0].moduleExportId).toBe(`module_${modId}`);
    expect(flashcardsJson[0].lessonExportId).toBe(`lesson_${lessonId}`);
    expect(questionsJson[0].lessonExportId).toBe(`lesson_${lessonId}`);
  });

  it("2. Security & Validation: Rejects invalid manifest and unsupported formatVersion", async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        formatVersion: 99, // Unsupported
        counts: {},
      }),
    );
    const badZip = await zip.generateAsync({ type: "nodebuffer" });

    await expect(importService.validatePackage(badZip, actorId, orgB)).rejects.toThrow(
      /Unsupported package formatVersion: 99/,
    );
  });

  it("3. Security & Validation: Rejects Path Traversal attacks in ZIP entries", async () => {
    const zip = new JSZip();
    zip.file("../evil.sh", "echo 'malicious'");
    zip.file("manifest.json", JSON.stringify({ formatVersion: 1 }));
    const badZip = await zip.generateAsync({ type: "nodebuffer" });

    await expect(importService.validatePackage(badZip, actorId, orgB)).rejects.toThrow(
      /Path traversal attempt detected/,
    );
  });

  it("4. Security & Validation: Rejects broken relations inside package", async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        formatVersion: 1,
        counts: { courses: 1, modules: 1 },
      }),
    );
    zip.file("courses.json", JSON.stringify([{ exportId: "course_1", name: "C1" }]));
    zip.file(
      "modules.json",
      JSON.stringify([
        {
          exportId: "module_1",
          courseExportId: "non_existent_course", // Broken reference
          title: "M1",
        },
      ]),
    );

    const badZip = await zip.generateAsync({ type: "nodebuffer" });
    await expect(importService.validatePackage(badZip, actorId, orgB)).rejects.toThrow(
      /references non-existent courseExportId: 'non_existent_course'/,
    );
  });

  it("5. Security & Validation: Rejects duplicate exportId within same entity list", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ formatVersion: 1 }));
    zip.file(
      "courses.json",
      JSON.stringify([
        { exportId: "course_dup", name: "C1" },
        { exportId: "course_dup", name: "C2" }, // Duplicate exportId
      ]),
    );

    const badZip = await zip.generateAsync({ type: "nodebuffer" });
    await expect(importService.validatePackage(badZip, actorId, orgB)).rejects.toThrow(
      /Duplicate exportId 'course_dup' in courses/,
    );
  });

  it("6. Critical Integration Test: Decoupled ID Import across different environments", async () => {
    // 1. Source DB has IDs 1, 2, 3
    const sourceCourseId = "11111111-0000-0000-0000-000000000001";
    const sourceModuleId = "11111111-0000-0000-0000-000000000002";
    const sourceLessonId = "11111111-0000-0000-0000-000000000003";
    const sourceQuizId = "11111111-0000-0000-0000-000000000004";
    const sourceQuestionId = "11111111-0000-0000-0000-000000000005";
    const sourceCardId = "11111111-0000-0000-0000-000000000006";

    sourceDb.tables.courses.push({
      id: sourceCourseId,
      organizationId: orgA,
      name: "فارماکولوژی بالینی",
      subject: "پزشکی",
      status: "published",
      isOfficial: false,
    });

    sourceDb.tables.modules.push({
      id: sourceModuleId,
      courseId: sourceCourseId,
      title: "ماژول آنتی‌بیوتیک‌ها",
      sortOrder: 0,
    });

    sourceDb.tables.lessons.push({
      id: sourceLessonId,
      moduleId: sourceModuleId,
      title: "پنی‌سیلین‌ها",
      contentType: "markdown",
      contentMarkdown: "محتوای آموزشی درس پنی‌سیلین",
      sortOrder: 0,
      publicationStatus: "published",
    });

    sourceDb.tables.quizzes.push({
      id: sourceQuizId,
      organizationId: orgA,
      courseId: sourceCourseId,
      title: "کوئیز آنتی‌بیوتیک",
      status: "published",
    });

    sourceDb.tables.quiz_questions.push({
      id: sourceQuestionId,
      quizId: sourceQuizId,
      lessonId: sourceLessonId,
      question: "کدام دارو پنی‌سیلین طبیعی است؟",
      choices: ["پنی‌سیلین G", "آموکسی‌سیلین"],
      correctAnswer: "پنی‌سیلین G",
      sortOrder: 0,
    });

    sourceDb.tables.flashcards.push({
      id: sourceCardId,
      organizationId: orgA,
      courseId: sourceCourseId,
      lessonId: sourceLessonId,
      question: "مکانیسم پنی‌سیلین؟",
      answer: "مهار سنتز دیواره سلولی",
      cardType: "definition",
    });

    // 2. Target DB intentionally has different pre-existing IDs (500, 800, 1200)
    targetDb.tables.courses.push({
      id: "50000000-0000-0000-0000-000000000500",
      organizationId: orgB,
      name: "دوره فیزیک پزشکی قبلی",
      status: "published",
      isOfficial: false,
    });

    // Export from Source
    const zipPackage = await exportService.exportContent(orgA);

    // Step 1 Import on Target: Validate
    const plan = await importService.validatePackage(zipPackage, actorId, orgB);
    expect(plan.summary.courses.new).toBe(1);
    expect(plan.summary.modules.new).toBe(1);
    expect(plan.summary.lessons.new).toBe(1);
    expect(plan.summary.quizzes.new).toBe(1);
    expect(plan.summary.questions.new).toBe(1);
    expect(plan.summary.flashcards.new).toBe(1);
    expect(plan.conflicts.length).toBe(0);

    // Step 2 Import on Target: Execute
    const execResult = await importService.executeImport(plan.planId, actorId, orgB);
    expect(execResult.success).toBe(true);
    expect(execResult.counts.created).toBe(6);

    // Verify Target DB state
    const targetCourses = targetDb.tables.courses.filter((c) => c.organizationId === orgB);
    expect(targetCourses.length).toBe(2); // 1 pre-existing + 1 newly imported
    const importedCourse = targetCourses.find((c) => c.name === "فارماکولوژی بالینی")!;
    expect(importedCourse).toBeDefined();

    // Critical: ID must NOT be the source ID!
    expect(importedCourse.id).not.toBe(sourceCourseId);

    // Verify Modules in target
    const targetModules = targetDb.tables.modules.filter((m) => m.courseId === importedCourse.id);
    expect(targetModules.length).toBe(1);
    const importedModule = targetModules[0];
    expect(importedModule.id).not.toBe(sourceModuleId);
    expect(importedModule.courseId).toBe(importedCourse.id); // Remapped!

    // Verify Lessons in target
    const targetLessons = targetDb.tables.lessons.filter((l) => l.moduleId === importedModule.id);
    expect(targetLessons.length).toBe(1);
    const importedLesson = targetLessons[0];
    expect(importedLesson.id).not.toBe(sourceLessonId);
    expect(importedLesson.moduleId).toBe(importedModule.id); // Remapped!

    // Verify Quizzes in target
    const targetQuizzes = targetDb.tables.quizzes.filter((q) => q.courseId === importedCourse.id);
    expect(targetQuizzes.length).toBe(1);
    const importedQuiz = targetQuizzes[0];
    expect(importedQuiz.id).not.toBe(sourceQuizId);
    expect(importedQuiz.courseId).toBe(importedCourse.id); // Remapped!

    // Verify Quiz Questions in target
    const targetQuestions = targetDb.tables.quiz_questions.filter((qq) => qq.quizId === importedQuiz.id);
    expect(targetQuestions.length).toBe(1);
    expect(targetQuestions[0].id).not.toBe(sourceQuestionId);
    expect(targetQuestions[0].quizId).toBe(importedQuiz.id); // Remapped!
    expect(targetQuestions[0].lessonId).toBe(importedLesson.id); // Remapped!

    // Verify Flashcards in target
    const targetFlashcards = targetDb.tables.flashcards.filter((fc) => fc.courseId === importedCourse.id);
    expect(targetFlashcards.length).toBe(1);
    expect(targetFlashcards[0].id).not.toBe(sourceCardId);
    expect(targetFlashcards[0].courseId).toBe(importedCourse.id); // Remapped!
    expect(targetFlashcards[0].lessonId).toBe(importedLesson.id); // Remapped!

    // Verify imported_entities provenance table
    expect(targetDb.tables.imported_entities.length).toBe(6);
  });

  it("7. Idempotency & Duplicate Detection: Re-importing exact same package creates 0 duplicates", async () => {
    // 1. Seed & Export
    sourceDb.tables.courses.push({
      id: "src-c1",
      organizationId: orgA,
      name: "آناتومی عمومی",
      status: "published",
      isOfficial: false,
    });
    sourceDb.tables.modules.push({
      id: "src-m1",
      courseId: "src-c1",
      title: "اندام فوقانی",
      sortOrder: 0,
    });
    sourceDb.tables.lessons.push({
      id: "src-l1",
      moduleId: "src-m1",
      title: "استخوان بازو",
      contentType: "markdown",
      contentMarkdown: "هومروس...",
      sortOrder: 0,
      publicationStatus: "published",
    });

    const zipPackage = await exportService.exportContent(orgA);

    // First Import
    const plan1 = await importService.validatePackage(zipPackage, actorId, orgB);
    await importService.executeImport(plan1.planId, actorId, orgB);

    const initialCourseCount = targetDb.tables.courses.length;
    const initialModuleCount = targetDb.tables.modules.length;
    const initialLessonCount = targetDb.tables.lessons.length;

    // Second Import of the EXACT same package
    const plan2 = await importService.validatePackage(zipPackage, actorId, orgB);

    // Verify Preview reports 100% EXISTING
    expect(plan2.summary.courses.new).toBe(0);
    expect(plan2.summary.courses.existing).toBe(1);
    expect(plan2.summary.modules.new).toBe(0);
    expect(plan2.summary.modules.existing).toBe(1);
    expect(plan2.summary.lessons.new).toBe(0);
    expect(plan2.summary.lessons.existing).toBe(1);
    expect(plan2.conflicts.length).toBe(0);

    // Execute Second Import
    const execResult2 = await importService.executeImport(plan2.planId, actorId, orgB);
    expect(execResult2.success).toBe(true);
    expect(execResult2.counts.created).toBe(0);
    expect(execResult2.counts.skipped).toBe(3);

    // Verify Target DB row counts did not increase
    expect(targetDb.tables.courses.length).toBe(initialCourseCount);
    expect(targetDb.tables.modules.length).toBe(initialModuleCount);
    expect(targetDb.tables.lessons.length).toBe(initialLessonCount);
  });

  it("8. Security Binding & TTL: Rejects import if planId expired, actor mismatched, or replayed", async () => {
    sourceDb.tables.courses.push({
      id: "src-c1",
      organizationId: orgA,
      name: "دوره تست امنیتی",
      status: "published",
    });
    const zipPackage = await exportService.exportContent(orgA);

    const plan = await importService.validatePackage(zipPackage, actorId, orgB);

    // A. Actor Mismatch
    await expect(
      importService.executeImport(plan.planId, "different-attacker-id", orgB),
    ).rejects.toThrow(/created by a different administrator/);

    // B. Organization Mismatch
    await expect(
      importService.executeImport(plan.planId, actorId, "different-org-id"),
    ).rejects.toThrow(/Organization mismatch/);

    // C. Checksum Mismatch
    await expect(
      importService.executeImport(plan.planId, actorId, orgB, {
        packageChecksum: "bad_checksum_hash_123456",
      }),
    ).rejects.toThrow(/Package checksum does not match/);

    // D. Valid execution
    await importService.executeImport(plan.planId, actorId, orgB);

    // E. Replay Attack: Using the same planId again must fail
    await expect(
      importService.executeImport(plan.planId, actorId, orgB),
    ).rejects.toThrow(/Import plan is invalid or has expired/);
  });

  it("9. Transaction Safety & Physical File Rollback: Cleans up files on DB failure", async () => {
    // Prepare source document with physical file
    const fileBytes = Buffer.from("My Document Binary To Test Rollback");
    const fileSha = crypto.createHash("sha256").update(fileBytes).digest("hex");
    await sourceStorage.save({
      storageKey: "uploads/test-doc.pdf",
      data: fileBytes,
      mimeType: "application/pdf",
    });

    sourceDb.tables.courses.push({
      id: "course-1",
      organizationId: orgA,
      name: "دوره دارای فایل",
      status: "published",
    });

    sourceDb.tables.documents.push({
      id: "doc-1",
      organizationId: orgA,
      courseId: "course-1",
      originalName: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileBytes.length,
      sha256: fileSha,
      storageKey: "uploads/test-doc.pdf",
    });

    const zipPackage = await exportService.exportContent(orgA);

    // Validate package in target
    const plan = await importService.validatePackage(zipPackage, actorId, orgB);

    // Inject simulated failure on target DB when inserting courses
    targetDb.failOnInsertTable = "courses";

    // Expect executeImport to fail and throw
    await expect(
      importService.executeImport(plan.planId, actorId, orgB),
    ).rejects.toThrow(/Simulated database failure during insertion into courses/);

    // Verify Rollback:
    // 1. DB rows rolled back to 0
    expect(targetDb.tables.documents.length).toBe(0);
    expect(targetDb.tables.courses.length).toBe(0);

    // 2. Physical files cleaned up from targetStorage!
    expect(targetStorage.files.size).toBe(0);
  });

  it("10. Comprehensive Initial Detection & Multi-Scope Content: Flashcards and Quizzes identified in preview and imported cleanly", async () => {
    // 1. Seed Source DB with both Lesson-scoped AND Course-scoped Flashcards and Quizzes
    const courseId = "src-c-multi";
    const modId = "src-m-multi";
    const lessonId = "src-l-multi";
    const lessonCardId = "src-fc-lesson";
    const courseCardId = "src-fc-course";
    const quizId = "src-quiz-1";
    const q1Id = "src-qq-lesson";
    const q2Id = "src-qq-course";

    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "دوره جامع با فلش‌کارت‌های درسی و سراسری",
      subject: "پزشکی",
      status: "published",
    });

    sourceDb.tables.modules.push({
      id: modId,
      courseId,
      title: "ماژول اول",
      sortOrder: 0,
    });

    sourceDb.tables.lessons.push({
      id: lessonId,
      moduleId: modId,
      title: "درس اول",
      contentType: "markdown",
      contentMarkdown: "# درس اول\nمحتوای درس",
      sortOrder: 0,
      publicationStatus: "published",
    });

    // Lesson-scoped flashcard
    sourceDb.tables.flashcards.push({
      id: lessonCardId,
      organizationId: orgA,
      courseId,
      lessonId,
      question: "سوال فلش‌کارت درسی",
      answer: "پاسخ فلش‌کارت درسی",
      cardType: "definition",
    });

    // Course-scoped flashcard (lessonId is null)
    sourceDb.tables.flashcards.push({
      id: courseCardId,
      organizationId: orgA,
      courseId,
      lessonId: null,
      question: "سوال فلش‌کارت عمومی دوره",
      answer: "پاسخ فلش‌کارت عمومی دوره",
      cardType: "concept",
    });

    // Quiz and questions (one linked to lesson, one course-level)
    sourceDb.tables.quizzes.push({
      id: quizId,
      organizationId: orgA,
      courseId,
      title: "آزمون ارزیابی جامع",
      status: "published",
    });

    sourceDb.tables.quiz_questions.push({
      id: q1Id,
      quizId,
      lessonId,
      question: "سوال مرتبط با درس",
      choices: ["الف", "ب"],
      correctAnswer: "الف",
      sortOrder: 0,
    });

    sourceDb.tables.quiz_questions.push({
      id: q2Id,
      quizId,
      lessonId: null,
      question: "سوال سطح کل دوره",
      choices: ["۱", "۲"],
      correctAnswer: "۱",
      sortOrder: 1,
    });

    // Step A: Export
    const zipBuffer = await exportService.exportContent(orgA, { courseId });

    // Step B & C: Validate & Initial Detection
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    // Initial detection MUST show ALL entity counts before Import
    expect(plan.summary.courses.new).toBe(1);
    expect(plan.summary.modules.new).toBe(1);
    expect(plan.summary.lessons.new).toBe(1);
    expect(plan.summary.flashcards.new).toBe(2); // Both lesson-scoped and course-scoped
    expect(plan.summary.quizzes.new).toBe(1);
    expect(plan.summary.questions.new).toBe(2);
    expect(plan.conflicts.length).toBe(0);

    // Step D: Execute Import
    const execResult = await importService.executeImport(plan.planId, actorId, orgB);
    expect(execResult.success).toBe(true);
    expect(execResult.counts.created).toBe(8); // 1 course + 1 module + 1 lesson + 2 flashcards + 1 quiz + 2 quizQuestions = 8

    // Step E: Verify remapped DB entries in Target
    const targetCourse = targetDb.tables.courses.find((c) => c.organizationId === orgB && c.name === "دوره جامع با فلش‌کارت‌های درسی و سراسری")!;
    expect(targetCourse).toBeDefined();

    const targetLessonCards = targetDb.tables.flashcards.filter((fc) => fc.courseId === targetCourse.id && fc.lessonId !== null);
    const targetCourseCards = targetDb.tables.flashcards.filter((fc) => fc.courseId === targetCourse.id && fc.lessonId === null);
    expect(targetLessonCards.length).toBe(1);
    expect(targetCourseCards.length).toBe(1);

    const targetQuiz = targetDb.tables.quizzes.find((q) => q.courseId === targetCourse.id)!;
    expect(targetQuiz).toBeDefined();

    const targetQuestions = targetDb.tables.quiz_questions.filter((qq) => qq.quizId === targetQuiz.id);
    expect(targetQuestions.length).toBe(2);

    // Step F: Re-import exact same ZIP -> 0 duplicates
    const plan2 = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan2.summary.courses.new).toBe(0);
    expect(plan2.summary.courses.existing).toBe(1);
    expect(plan2.summary.modules.new).toBe(0);
    expect(plan2.summary.modules.existing).toBe(1);
    expect(plan2.summary.lessons.new).toBe(0);
    expect(plan2.summary.lessons.existing).toBe(1);
    expect(plan2.summary.flashcards.new).toBe(0);
    expect(plan2.summary.flashcards.existing).toBe(2);
    expect(plan2.summary.quizzes.new).toBe(0);
    expect(plan2.summary.quizzes.existing).toBe(1);
    expect(plan2.summary.questions.new).toBe(0);
    expect(plan2.summary.questions.existing).toBe(2);

    const execResult2 = await importService.executeImport(plan2.planId, actorId, orgB);
    expect(execResult2.counts.created).toBe(0);
  });

  it("11. ZIP Entry Order Independence: Package with reverse/shuffled JSON files imports with deterministic hierarchy", async () => {
    const customZip = new JSZip();

    const manifest = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: "shuffled-test",
      contentVersion: "1.0",
      scope: {
        courses: true,
        modules: true,
        lessons: true,
        documents: true,
        generatedContent: true,
        flashcards: true,
        quizzes: true,
        questions: true,
        files: true,
      },
      counts: {
        courses: 1,
        modules: 1,
        lessons: 1,
        documents: 0,
        documentChunks: 0,
        generatedContents: 0,
        flashcards: 1,
        quizzes: 1,
        questions: 1,
        files: 0,
      },
      files: [],
    };

    // Add files in reverse topological order (children before parents)
    customZip.file("questions.json", JSON.stringify([{
      exportId: "q_child",
      quizExportId: "qz_parent",
      lessonExportId: "ls_parent",
      question: "سوال تستی",
      choices: ["1", "2"],
      correctAnswer: "1",
      sortOrder: 0,
    }]));
    customZip.file("quizzes.json", JSON.stringify([{
      exportId: "qz_parent",
      courseExportId: "cs_root",
      title: "کوئیز تستی",
      status: "published",
    }]));
    customZip.file("flashcards.json", JSON.stringify([{
      exportId: "fc_child",
      courseExportId: "cs_root",
      lessonExportId: "ls_parent",
      question: "سوال فلش کارت",
      answer: "پاسخ",
    }]));
    customZip.file("lessons.json", JSON.stringify([{
      exportId: "ls_parent",
      moduleExportId: "md_parent",
      title: "درس مستقل",
      contentType: "markdown",
      contentMarkdown: "# درس",
      sortOrder: 0,
    }]));
    customZip.file("modules.json", JSON.stringify([{
      exportId: "md_parent",
      courseExportId: "cs_root",
      title: "ماژول مستقل",
      sortOrder: 0,
    }]));
    customZip.file("courses.json", JSON.stringify([{
      exportId: "cs_root",
      name: "دوره تست ترتیب فایل",
      status: "published",
    }]));
    customZip.file("manifest.json", JSON.stringify(manifest));

    const zipBuffer = await customZip.generateAsync({ type: "nodebuffer" });

    // Validate
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan.summary.courses.new).toBe(1);
    expect(plan.summary.modules.new).toBe(1);
    expect(plan.summary.lessons.new).toBe(1);
    expect(plan.summary.flashcards.new).toBe(1);
    expect(plan.summary.quizzes.new).toBe(1);
    expect(plan.summary.questions.new).toBe(1);

    // Execute
    const execResult = await importService.executeImport(plan.planId, actorId, orgB);
    expect(execResult.success).toBe(true);

    // Verify all parent-child links were correctly resolved
    const targetCourse = targetDb.tables.courses.find((c) => c.name === "دوره تست ترتیب فایل")!;
    expect(targetCourse).toBeDefined();
    const targetModule = targetDb.tables.modules.find((m) => m.courseId === targetCourse.id)!;
    expect(targetModule).toBeDefined();
    const targetLesson = targetDb.tables.lessons.find((l) => l.moduleId === targetModule.id)!;
    expect(targetLesson).toBeDefined();
    const targetQuiz = targetDb.tables.quizzes.find((q) => q.courseId === targetCourse.id)!;
    expect(targetQuiz).toBeDefined();
    const targetQuestion = targetDb.tables.quiz_questions.find((qq) => qq.quizId === targetQuiz.id)!;
    expect(targetQuestion).toBeDefined();
    expect(targetQuestion.lessonId).toBe(targetLesson.id);
  });

  it("12. Resilient Graceful Degradation: Unexported/missing optional parent references fallback to course-level without crashing", async () => {
    const customZip = new JSZip();

    const manifest = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: "missing-ref-test",
      contentVersion: "1.0",
      scope: {
        courses: true,
        modules: true,
        lessons: true,
        documents: true,
        generatedContent: true,
        flashcards: true,
        quizzes: true,
        questions: true,
        files: true,
      },
      counts: {
        courses: 1,
        modules: 0,
        lessons: 0,
        documents: 0,
        documentChunks: 0,
        generatedContents: 0,
        flashcards: 1,
        quizzes: 1,
        questions: 1,
        files: 0,
      },
      files: [],
    };

    // Flashcard and Question reference a lessonExportId that does not exist in lessons.json (e.g. deleted lesson)
    customZip.file("manifest.json", JSON.stringify(manifest));
    customZip.file("courses.json", JSON.stringify([{ exportId: "c_1", name: "دوره بدون درس" }]));
    customZip.file("modules.json", JSON.stringify([]));
    customZip.file("lessons.json", JSON.stringify([]));
    customZip.file("flashcards.json", JSON.stringify([{
      exportId: "fc_1",
      courseExportId: "c_1",
      lessonExportId: "lesson_deleted_uuid", // Missing in lessons.json
      question: "فلش کارت با درس حذف شده",
      answer: "پاسخ",
    }]));
    customZip.file("quizzes.json", JSON.stringify([{
      exportId: "qz_1",
      courseExportId: "c_1",
      title: "آزمون با سوال دارای درس ناموجود",
    }]));
    customZip.file("questions.json", JSON.stringify([{
      exportId: "qq_1",
      quizExportId: "qz_1",
      lessonExportId: "lesson_deleted_uuid", // Missing in lessons.json
      question: "سوال با درس ناموجود",
      choices: ["A"],
      correctAnswer: "A",
    }]));

    const zipBuffer = await customZip.generateAsync({ type: "nodebuffer" });

    // Validation must NOT crash; it should gracefully decouple the optional missing lesson reference
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan.summary.flashcards.new).toBe(1);
    expect(plan.summary.quizzes.new).toBe(1);
    expect(plan.summary.questions.new).toBe(1);

    // Import must succeed and save flashcard and question as course-scoped (lessonId = null)
    const execResult = await importService.executeImport(plan.planId, actorId, orgB);
    expect(execResult.success).toBe(true);

    const savedFc = targetDb.tables.flashcards.find((fc) => fc.question === "فلش کارت با درس حذف شده")!;
    expect(savedFc).toBeDefined();
    expect(savedFc.lessonId).toBeNull(); // Gracefully fell back to course-level

    const savedQq = targetDb.tables.quiz_questions.find((qq) => qq.question === "سوال با درس ناموجود")!;
    expect(savedQq).toBeDefined();
    expect(savedQq.lessonId).toBeNull(); // Gracefully fell back to course-level
  });
});
