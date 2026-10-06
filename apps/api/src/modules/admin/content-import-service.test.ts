/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-this-alias, @typescript-eslint/no-unused-vars */
import { describe, expect, it, beforeEach } from "vitest";
import crypto from "node:crypto";
import { ContentExportService } from "./content-export-service.js";
import { ContentImportService } from "./content-import-service.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../storage/storage-provider.js";
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

  getTableName(tableObj: any): string {
    return tableObj?.[Symbol.for("drizzle:Name")] || tableObj?._?.name || tableObj?.name || "unknown";
  }

  select(fields?: any) {
    const self = this;
    return {
      from(tableObj: any) {
        const tableName = self.getTableName(tableObj);
        return {
          where(condition?: any) {
            let rows = [...(self.tables[tableName] || [])];
            const hasDeletedCondition = (cond: any): boolean => {
              if (!cond) return false;
              if (Array.isArray(cond.queryChunks)) {
                for (const chunk of cond.queryChunks) {
                  if (!chunk) continue;
                  if (chunk.name === "deleted_at" || chunk.name === "deletedAt") return true;
                  if (chunk.queryChunks && hasDeletedCondition(chunk)) return true;
                }
              }
              return false;
            };
            if (hasDeletedCondition(condition)) {
              rows = rows.filter((r) => !r.deletedAt);
            }

            // Document filter
            if (tableName === "documents" && condition) {
              const extractDocFilter = (cond: any) => {
                let docId: string | null = null;
                const traverse = (chunks: any[]) => {
                  if (!Array.isArray(chunks)) return;
                  for (let i = 0; i < chunks.length; i++) {
                    const c = chunks[i];
                    if (c && c.name === "id" && chunks[i + 1]?.value?.[0]?.includes("=")) {
                      docId = chunks[i + 2]?.value ?? chunks[i + 2];
                    }
                    if (c && c.queryChunks) traverse(c.queryChunks);
                  }
                };
                traverse(cond.queryChunks);
                return docId;
              };
              const docId = extractDocFilter(condition);
              if (docId) rows = rows.filter((r) => r.id === docId);
            }

            // Educational structure filter by documentId
            if (["modules", "flashcards", "quizzes", "generated_contents"].includes(tableName) && condition) {
              let docIdFilter: string | null = null;
              const traverse = (chunks: any[]) => {
                if (!Array.isArray(chunks)) return;
                for (let i = 0; i < chunks.length; i++) {
                  const c = chunks[i];
                  if (c && (c.name === "document_id" || c.name === "documentId") && chunks[i + 1]?.value?.[0]?.includes("=")) {
                    docIdFilter = chunks[i + 2]?.value ?? chunks[i + 2];
                  }
                  if (c && c.queryChunks) traverse(c.queryChunks);
                }
              };
              traverse(condition.queryChunks);
              if (docIdFilter) {
                rows = rows.filter((r) => r.documentId === docIdFilter);
              }
            }

            return {
              orderBy(..._args: any[]) {
                return Promise.resolve(rows);
              },
              then(resolve: any) {
                return resolve(rows);
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
                  let docIdFilter: string | null = null;
                  const traverse = (chunks: any[]) => {
                    if (!Array.isArray(chunks)) return;
                    for (let i = 0; i < chunks.length; i++) {
                      const c = chunks[i];
                      if (c && c.name === "id" && chunks[i + 1]?.value?.[0]?.includes("=")) {
                        docIdFilter = chunks[i + 2]?.value ?? chunks[i + 2];
                      }
                      if (c && c.queryChunks) traverse(c.queryChunks);
                    }
                  };
                  if (condition?.queryChunks) traverse(condition.queryChunks);

                  for (let i = 0; i < self.tables[tableName].length; i++) {
                    if (!docIdFilter || self.tables[tableName][i].id === docIdFilter) {
                      self.tables[tableName][i] = {
                        ...self.tables[tableName][i],
                        ...values,
                      };
                    }
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

  delete(tableObj: any) {
    const self = this;
    const tableName = self.getTableName(tableObj);
    return {
      where(_condition: any) {
        return {
          then(resolve: any) {
            if (tableName === "documents") {
              self.tables.documents = (self.tables.documents || []).filter((d) => !d.deletedAt);
            }
            return resolve({ rowCount: 1 });
          },
        };
      },
    };
  }

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const snapshot: Record<string, any[]> = {};
    for (const key of Object.keys(this.tables)) {
      snapshot[key] = [...this.tables[key]];
    }

    try {
      const result = await callback(this);
      return result;
    } catch (err) {
      for (const key of Object.keys(snapshot)) {
        this.tables[key] = [...snapshot[key]];
      }
      throw err;
    }
  }
}

describe("ContentImportService: Document Ownership & Anti-Hijacking Regression Suite", () => {
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

  it("Test 1: Document جدید → با Course مقصد ایجاد شود", async () => {
    const courseId = "course-new-1";
    const docId = "doc-new-1";
    const fileContent = Buffer.from("New document content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "دوره جدید فارماسیوتیکس",
      status: "published",
    });

    sourceDb.tables.documents.push({
      id: docId,
      organizationId: orgA,
      courseId,
      ownerUserId: actorId,
      originalName: "NewDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId });

    // Target DB is initially empty
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan.summary.documents.new).toBe(1);
    expect(plan.conflicts.length).toBe(0);

    const result = await importService.executeImport(plan.planId, actorId, orgB);
    expect(result.success).toBe(true);

    const importedDoc = targetDb.tables.documents.find((d) => d.sha256 === fileSha);
    expect(importedDoc).toBeDefined();
    const importedCourse = targetDb.tables.courses.find((c) => c.name === "دوره جدید فارماسیوتیکس");
    expect(importedCourse).toBeDefined();
    expect(importedDoc.courseId).toBe(importedCourse.id);
  });

  it("Test 2: Document موجود بدون هیچ ساختار آموزشی → رفتار فعلی سازگار و امن حفظ شود", async () => {
    const docIdExisting = "doc-orphan-existing";
    const fileContent = Buffer.from("Shared orphan doc content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    // Existing doc in target DB with courseId null and NO educational structure
    targetDb.tables.documents.push({
      id: docIdExisting,
      organizationId: orgB,
      courseId: null,
      ownerUserId: actorId,
      originalName: "OrphanDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docIdExisting}.pdf`,
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docIdExisting}.pdf`, fileContent);

    // Export package from source with this document tied to a course
    const courseIdSource = "course-with-orphan-doc";
    sourceDb.tables.courses.push({
      id: courseIdSource,
      organizationId: orgA,
      name: "دوره مقصد دارای سند آزاد",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-2",
      organizationId: orgA,
      courseId: courseIdSource,
      ownerUserId: actorId,
      originalName: "OrphanDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/doc-source-2.pdf`,
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-2.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseIdSource });

    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan.summary.documents.existing).toBe(1);
    expect(plan.conflicts.length).toBe(0);

    const result = await importService.executeImport(plan.planId, actorId, orgB);
    expect(result.success).toBe(true);

    const importedCourse = targetDb.tables.courses.find((c) => c.name === "دوره مقصد دارای سند آزاد");
    expect(importedCourse).toBeDefined();

    const existingDocInTarget = targetDb.tables.documents.find((d) => d.id === docIdExisting);
    expect(existingDocInTarget.courseId).toBe(importedCourse.id);
  });

  it("Test 3: Document موجود متعلق به Course A و دارای Lesson/Flashcard/Quiz → Import به Course B نباید course_id را overwrite کند", async () => {
    const courseAId = "course-a-pharma1";
    const docIdInCourseA = "doc-pharma1-ulton2";
    const fileContent = Buffer.from("Aulton chapter 2 content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    // Target DB has Course A and document bound to Course A with active modules & flashcards
    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "فارماسیوتیکس ۱",
      status: "published",
    });

    targetDb.tables.documents.push({
      id: docIdInCourseA,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "Aulton ch 2.PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docIdInCourseA}.pdf`,
      pageCount: 19,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docIdInCourseA}.pdf`, fileContent);

    // Active educational structure attached to this doc in Course A
    targetDb.tables.modules.push({
      id: "mod-pharma1-1",
      courseId: courseAId,
      documentId: docIdInCourseA,
      title: "انحلال و انحلال‌پذیری",
      deletedAt: null,
    });
    targetDb.tables.flashcards.push({
      id: "card-pharma1-1",
      organizationId: orgB,
      courseId: courseAId,
      documentId: docIdInCourseA,
      lessonId: "lesson-1",
      question: "مفهوم انحلال چیست؟",
      deletedAt: null,
    });

    // Now an import package arrives trying to import this same document into Course B ("فارماسیوتیکس ۳")
    const courseBId = "course-b-pharma3";
    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "فارماسیوتیکس 3",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-ch2",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "Aulton ch 2.PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-ch2.pdf",
      pageCount: 19,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-ch2.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });

    // validatePackage MUST flag this as CONFLICT
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(plan.conflicts[0].entityType).toBe("document");
    expect(plan.conflicts[0].reason).toContain("دارای ساختار آموزشی");

    const docRes = plan.resolutions.find((r) => r.entityType === "document");
    expect(docRes?.status).toBe("CONFLICT");
    expect(docRes?.conflictReason).toContain("Cannot hijack document ownership");

    // Attempting to execute import with onConflict: "error" MUST reject
    await expect(
      importService.executeImport(plan.planId, actorId, orgB, { onConflict: "error" }),
    ).rejects.toThrow(/conflict/i);

    // Course A ownership MUST be preserved intact
    const targetDoc = targetDb.tables.documents.find((d) => d.id === docIdInCourseA);
    expect(targetDoc.courseId).toBe(courseAId);
  });

  it("Test 4: Document موجود با hash یکسان ولی ownership متفاوت → Document Hijacking رخ ندهد", async () => {
    const courseAId = "course-live-owner";
    const docIdInCourseA = "doc-live-owner-1";
    const fileContent = Buffer.from("Protected chapter content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره اصلی مالک سند",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docIdInCourseA,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "ProtectedDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docIdInCourseA}.pdf`,
      pageCount: 10,
      status: "ready",
      deletedAt: null,
    });
    targetDb.tables.quizzes.push({
      id: "quiz-owner-1",
      organizationId: orgB,
      courseId: courseAId,
      documentId: docIdInCourseA,
      title: "کوییز جامع فصل",
      deletedAt: null,
    });

    const courseBId = "course-hijacker";
    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره تلاش‌کننده برای سرقت سند",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-hijack",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "ProtectedDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-hijack.pdf",
      pageCount: 10,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-hijack.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    // Force execution with onConflict: "skip" to test hard execution guard in executePlan
    await expect(
      importService.executeImport(plan.planId, actorId, orgB, { onConflict: "skip" }),
    ).rejects.toThrow(/Cannot hijack document ownership/i);

    // Document in target DB must remain untouched under courseA
    const docAfter = targetDb.tables.documents.find((d) => d.id === docIdInCourseA);
    expect(docAfter.courseId).toBe(courseAId);
  });

  it("Test 5: Import مجدد idempotent باشد و ساختار موجود را خراب نکند", async () => {
    const courseId = "course-idempotent-1";
    const docId = "doc-idempotent-1";
    const fileContent = Buffer.from("Idempotent document test");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "دوره تکرارپذیر و آیدم‌پوتنت",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: docId,
      organizationId: orgA,
      courseId,
      ownerUserId: actorId,
      originalName: "IdempotentDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 5,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId });

    // First import
    const plan1 = await importService.validatePackage(zipBuffer, actorId, orgB);
    const result1 = await importService.executeImport(plan1.planId, actorId, orgB);
    expect(result1.success).toBe(true);

    const docCountAfter1 = targetDb.tables.documents.length;
    const courseCountAfter1 = targetDb.tables.courses.length;

    // Second import of the EXACT same package
    const plan2 = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan2.summary.documents.existing).toBe(1);
    expect(plan2.summary.courses.existing).toBe(1);
    expect(plan2.conflicts.length).toBe(0);

    const result2 = await importService.executeImport(plan2.planId, actorId, orgB);
    expect(result2.success).toBe(true);

    // Assert zero duplicates created and zero changes to ownership
    expect(targetDb.tables.documents.length).toBe(docCountAfter1);
    expect(targetDb.tables.courses.length).toBe(courseCountAfter1);

    const importedCourse = targetDb.tables.courses.find((c) => c.name === "دوره تکرارپذیر و آیدم‌پوتنت");
    const importedDoc = targetDb.tables.documents.find((d) => d.sha256 === fileSha);
    expect(importedDoc.courseId).toBe(importedCourse.id);
  });
});
