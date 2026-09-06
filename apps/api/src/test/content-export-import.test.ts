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
});
