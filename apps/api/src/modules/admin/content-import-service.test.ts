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
    source_packs: [],
    source_pack_documents: [],
  };

  onConflictDoNothingCalls: Array<{ table: string; target: any }> = [];

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

            // Organization filter
            if (condition) {
              const extractOrgFilter = (cond: any) => {
                let orgId: string | null = null;
                const traverse = (chunks: any[]) => {
                  if (!Array.isArray(chunks)) return;
                  for (let i = 0; i < chunks.length; i++) {
                    const c = chunks[i];
                    if (c && (c.name === "organization_id" || c.name === "organizationId") && chunks[i + 1]?.value?.[0]?.includes("=")) {
                      orgId = chunks[i + 2]?.value ?? chunks[i + 2];
                    }
                    if (c && c.queryChunks) traverse(c.queryChunks);
                  }
                };
                if (cond.queryChunks) traverse(cond.queryChunks);
                return orgId;
              };
              const orgId = extractOrgFilter(condition);
              if (orgId) {
                rows = rows.filter((r) => r.organizationId === orgId);
              }
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
          onConflictDoNothing(opts?: any) {
            self.onConflictDoNothingCalls.push({ table: tableName, target: opts?.target });
            return {
              then(resolve: any) {
                const items = Array.isArray(valOrVals) ? valOrVals : [valOrVals];
                if (!self.tables[tableName]) self.tables[tableName] = [];
                let inserted = 0;
                for (const item of items) {
                  if (tableName === "source_pack_documents") {
                    const dup = self.tables.source_pack_documents.some(
                      (r) => r.sourcePackId === item.sourcePackId && r.documentId === item.documentId,
                    );
                    if (dup) {
                      // Skip duplicate cleanly (ON CONFLICT DO NOTHING)
                      continue;
                    }
                  }
                  self.tables[tableName].push({ ...item });
                  inserted++;
                }
                return resolve({ rowCount: inserted });
              },
            };
          },
          then(resolve: any) {
            const items = Array.isArray(valOrVals) ? valOrVals : [valOrVals];
            if (!self.tables[tableName]) self.tables[tableName] = [];
            for (const item of items) {
              if (tableName === "source_pack_documents") {
                const dup = self.tables.source_pack_documents.some(
                  (r) => r.sourcePackId === item.sourcePackId && r.documentId === item.documentId,
                );
                if (dup) {
                  throw new Error('duplicate key value violates unique constraint "idx_source_pack_docs_pack_doc"');
                }
              }
              self.tables[tableName].push({ ...item });
            }
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

    // validatePackage recognizes shared document without conflict
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    expect(plan.conflicts.length).toBe(0);

    const docRes = plan.resolutions.find((r) => r.entityType === "document");
    expect(docRes?.status).toBe("EXISTING");
    expect(docRes?.subStatus).toBe("EXISTING_SHARED");
    expect(docRes?.conflictReason).toContain("استفاده مشترک از سند موجود");

    // Execution succeeds cleanly
    const result = await importService.executeImport(plan.planId, actorId, orgB);
    expect(result.success).toBe(true);

    // Course A ownership MUST be preserved 100% intact (Zero Hijacking)
    const targetDoc = targetDb.tables.documents.find((d) => d.id === docIdInCourseA);
    expect(targetDoc.courseId).toBe(courseAId);

    // Course A educational structure remains intact
    expect(targetDb.tables.modules.find((m) => m.id === "mod-pharma1-1")).toBeDefined();
    expect(targetDb.tables.flashcards.find((f) => f.id === "card-pharma1-1")).toBeDefined();
  });

  it("Test 4: Document موجود با hash یکسان ولی ownership متفاوت → Document Hijacking رخ ندهد و به صورت Shared Reuse وارد شود", async () => {
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
      name: "دوره جدید استفاده‌کننده از سند",
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

    const docRes = plan.resolutions.find((r) => r.entityType === "document");
    expect(docRes?.status).toBe("EXISTING");
    expect(docRes?.subStatus).toBe("EXISTING_SHARED");
    expect(plan.conflicts.length).toBe(0);

    const execResult = await importService.executeImport(plan.planId, actorId, orgB);
    expect(execResult.success).toBe(true);

    // Document in target DB must remain untouched under courseA
    const docAfter = targetDb.tables.documents.find((d) => d.id === docIdInCourseA);
    expect(docAfter.courseId).toBe(courseAId);
    expect(targetDb.tables.quizzes.find((q) => q.id === "quiz-owner-1")?.courseId).toBe(courseAId);
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

  it("Test 6: سند دارای Module در Course A در Course B نیز قابل استفاده باشد (Shared Reuse)", async () => {
    const courseAId = "course-a-ch1";
    const courseBId = "course-b-ch1";
    const docId = "doc-shared-aulton-ch1";
    const fileContent = Buffer.from("Aulton ch 1: Design of dosage forms");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    // Course A has the document and Module A
    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "فارماسیوتیکس ۱ - مبانی",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "Aulton ch 1.PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 15,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    targetDb.tables.modules.push({
      id: "mod-a-ch1",
      courseId: courseAId,
      documentId: docId,
      title: "طراحی اشکال دارویی در دوره اول",
      deletedAt: null,
    });

    // Course B package arriving with same document and Module B
    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "فارماسیوتیکس ۲ - فرمولاسیون",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-ch1",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "Aulton ch 1.PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-ch1.pdf",
      pageCount: 15,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-ch1.pdf", fileContent);

    sourceDb.tables.modules.push({
      id: "mod-source-b-ch1",
      courseId: courseBId,
      documentId: "doc-source-ch1",
      title: "طراحی اشکال دارویی پیشرفته",
      deletedAt: null,
    });

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    expect(plan.conflicts.length).toBe(0);
    const docRes = plan.resolutions.find((r) => r.entityType === "document");
    expect(docRes?.status).toBe("EXISTING");
    expect(docRes?.subStatus).toBe("EXISTING_SHARED");

    const result = await importService.executeImport(plan.planId, actorId, orgB);
    expect(result.success).toBe(true);

    // Both courses have active modules pointing to the exact same shared document
    const modCourseA = targetDb.tables.modules.find((m) => m.id === "mod-a-ch1");
    expect(modCourseA?.documentId).toBe(docId);

    const modCourseB = targetDb.tables.modules.find((m) => m.title === "طراحی اشکال دارویی پیشرفته");
    expect(modCourseB).toBeDefined();
    expect(modCourseB?.documentId).toBe(docId);
  });

  it("Test 7: documents.courseId بعد از Import همچنان Course A باشد", async () => {
    const courseAId = "course-a-ownership";
    const courseBId = "course-b-ownership";
    const docId = "doc-immutable-owner";
    const fileContent = Buffer.from("Ownership integrity content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره مالک اول",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "Aulton ch 44 (1).PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 8,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره دوم بدون سرقت",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-owner",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "Aulton ch 44 (1).PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-owner.pdf",
      pageCount: 8,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-owner.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    const docInTarget = targetDb.tables.documents.find((d) => d.id === docId);
    expect(docInTarget.courseId).toBe(courseAId);
  });

  it("Test 8: Module جدید Course B به Document ID مشترک متصل شود", async () => {
    const courseAId = "course-a-modtest";
    const courseBId = "course-b-modtest";
    const docId = "doc-mod-link";
    const fileContent = Buffer.from("Module linkage content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره الف ماژول",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "Aulton ch 19.PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 12,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره ب ماژول",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-mod",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "Aulton ch 19.PDF",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-mod.pdf",
      pageCount: 12,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-mod.pdf", fileContent);

    sourceDb.tables.modules.push({
      id: "mod-source-course-b",
      courseId: courseBId,
      documentId: "doc-source-mod",
      title: "فصل ۱۹: محلول‌ها",
      deletedAt: null,
    });

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    const createdModule = targetDb.tables.modules.find((m) => m.title === "فصل ۱۹: محلول‌ها");
    expect(createdModule).toBeDefined();
    expect(createdModule?.documentId).toBe(docId);
  });

  it("Test 9: Lessonهای دو دوره کاملاً مستقل باقی بمانند", async () => {
    const courseAId = "course-a-lesson";
    const courseBId = "course-b-lesson";
    const docId = "doc-lesson-independence";
    const fileContent = Buffer.from("Lesson independence content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره الف درس‌ها",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "DocShared.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 10,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    targetDb.tables.modules.push({
      id: "mod-a-existing",
      courseId: courseAId,
      documentId: docId,
      title: "ماژول دوره اول",
      deletedAt: null,
    });
    targetDb.tables.lessons.push({
      id: "lesson-a-existing",
      moduleId: "mod-a-existing",
      title: "درس ۱ دوره اول",
      contentMarkdown: "# محتوای درس اول",
      deletedAt: null,
    });

    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره ب درس‌ها",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-lesson",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "DocShared.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-lesson.pdf",
      pageCount: 10,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-lesson.pdf", fileContent);

    sourceDb.tables.modules.push({
      id: "mod-b-source",
      courseId: courseBId,
      documentId: "doc-source-lesson",
      title: "ماژول دوره دوم",
      deletedAt: null,
    });
    sourceDb.tables.lessons.push({
      id: "lesson-b-source",
      moduleId: "mod-b-source",
      title: "درس ۱ دوره دوم",
      contentMarkdown: "# محتوای درس دوم مستقل",
      deletedAt: null,
    });

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    const lessonA = targetDb.tables.lessons.find((l) => l.title === "درس ۱ دوره اول");
    const lessonB = targetDb.tables.lessons.find((l) => l.title === "درس ۱ دوره دوم");

    expect(lessonA?.moduleId).toBe("mod-a-existing");
    expect(lessonB?.moduleId).not.toBe("mod-a-existing");
    expect(lessonB?.moduleId).toBeDefined();
  });

  it("Test 10: Flashcards و Quizzes دو دوره تداخلی نداشته باشند", async () => {
    const courseAId = "course-a-cards";
    const courseBId = "course-b-cards";
    const docId = "doc-cards-shared";
    const fileContent = Buffer.from("Cards independence content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره الف فلش‌کارت",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "CardsDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 5,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    targetDb.tables.flashcards.push({
      id: "card-course-a",
      organizationId: orgB,
      courseId: courseAId,
      documentId: docId,
      question: "سوال دوره اول؟",
      answer: "پاسخ اول",
      deletedAt: null,
    });

    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره ب فلش‌کارت",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-card",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "CardsDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-card.pdf",
      pageCount: 5,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-card.pdf", fileContent);

    sourceDb.tables.flashcards.push({
      id: "card-source-b",
      organizationId: orgA,
      courseId: courseBId,
      documentId: "doc-source-card",
      question: "سوال دوره دوم؟",
      answer: "پاسخ دوم",
      deletedAt: null,
    });

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    const targetCourseB = targetDb.tables.courses.find((c) => c.name === "دوره ب فلش‌کارت");
    const cardA = targetDb.tables.flashcards.find((f) => f.question === "سوال دوره اول؟");
    const cardB = targetDb.tables.flashcards.find((f) => f.question === "سوال دوره دوم؟");

    expect(cardA?.courseId).toBe(courseAId);
    expect(cardA?.documentId).toBe(docId);

    expect(cardB?.courseId).toBe(targetCourseB?.id);
    expect(cardB?.documentId).toBe(docId);
  });

  it("Test 11: Import مجدد هیچ رکورد تکراری نسازد (Idempotency)", async () => {
    const courseId = "course-idemp-shared";
    const fileContent = Buffer.from("Idempotency shared test content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "دوره تست آیدم‌پوتنت",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-idemp-1",
      organizationId: orgA,
      courseId,
      ownerUserId: actorId,
      originalName: "IdempShared.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-idemp-1.pdf",
      pageCount: 4,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-idemp-1.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId });

    // Run 1
    const plan1 = await importService.validatePackage(zipBuffer, actorId, orgB);
    await importService.executeImport(plan1.planId, actorId, orgB);

    const docCount1 = targetDb.tables.documents.length;
    const courseCount1 = targetDb.tables.courses.length;

    // Run 2 (exact same package)
    const plan2 = await importService.validatePackage(zipBuffer, actorId, orgB);
    await importService.executeImport(plan2.planId, actorId, orgB);

    expect(targetDb.tables.documents.length).toBe(docCount1);
    expect(targetDb.tables.courses.length).toBe(courseCount1);
  });

  it("Test 12: سند سازمان دیگر قابل Reuse نباشد (Multi-Tenancy Isolation)", async () => {
    const orgOther = "org-different-tenant-99";
    const fileContent = Buffer.from("Cross-tenant isolated content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    // Document exists in targetDb, but under orgOther!
    targetDb.tables.documents.push({
      id: "doc-org-other",
      organizationId: orgOther,
      courseId: "course-other",
      ownerUserId: actorId,
      originalName: "TenantSecret.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-org-other.pdf",
      pageCount: 3,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set("uploads/doc-org-other.pdf", fileContent);

    // Source orgA exports this file for orgB
    sourceDb.tables.courses.push({
      id: "course-tenant-test",
      organizationId: orgA,
      name: "دوره بررسی ایزولاسیون",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-tenant",
      organizationId: orgA,
      courseId: "course-tenant-test",
      ownerUserId: actorId,
      originalName: "TenantSecret.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-tenant.pdf",
      pageCount: 3,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-tenant.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: "course-tenant-test" });

    // Validate for orgB
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    const docRes = plan.resolutions.find((r) => r.entityType === "document");
    // MUST be NEW for orgB, not matched to orgOther!
    expect(docRes?.status).toBe("NEW");

    await importService.executeImport(plan.planId, actorId, orgB);

    // Assert a new document record was created scoped to orgB
    const docInOrgB = targetDb.tables.documents.find((d) => d.organizationId === orgB && d.sha256 === fileSha);
    expect(docInOrgB).toBeDefined();
    expect(docInOrgB?.id).not.toBe("doc-org-other");
  });

  it("Test 13: سند بدون مالک بتواند مالکیت اولیه بگیرد (Scenario B)", async () => {
    const unownedDocId = "doc-unowned-initial";
    const fileContent = Buffer.from("Unowned document content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.documents.push({
      id: unownedDocId,
      organizationId: orgB,
      courseId: null, // Unowned
      ownerUserId: actorId,
      originalName: "UnownedFile.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${unownedDocId}.pdf`,
      pageCount: 2,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${unownedDocId}.pdf`, fileContent);

    sourceDb.tables.courses.push({
      id: "course-claim-unowned",
      organizationId: orgA,
      name: "دوره مالکیت‌گیرنده",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-claim",
      organizationId: orgA,
      courseId: "course-claim-unowned",
      ownerUserId: actorId,
      originalName: "UnownedFile.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-claim.pdf",
      pageCount: 2,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-claim.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: "course-claim-unowned" });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    const docRes = plan.resolutions.find((r) => r.entityType === "document");
    expect(docRes?.status).toBe("EXISTING");
    expect(docRes?.subStatus).toBe("EXISTING_UNOWNED");

    await importService.executeImport(plan.planId, actorId, orgB);

    const claimedDoc = targetDb.tables.documents.find((d) => d.id === unownedDocId);
    const targetCourse = targetDb.tables.courses.find((c) => c.name === "دوره مالکیت‌گیرنده");
    expect(claimedDoc.courseId).toBe(targetCourse?.id);
  });

  it("Test 14: سند دارای ساختار آموزشی قبلی همچنان محافظت شود و داده‌های دوره اول سالم بمانند", async () => {
    const courseAId = "course-a-protected";
    const docId = "doc-protected-structure";
    const fileContent = Buffer.from("Protected structure test");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره تحت محافظت کامل",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "ProtectedData.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 7,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    // Add module, lesson, and quiz to Course A
    targetDb.tables.modules.push({
      id: "mod-prot-1",
      courseId: courseAId,
      documentId: docId,
      title: "سرفصل محافظت‌شده دوره الف",
      deletedAt: null,
    });
    targetDb.tables.lessons.push({
      id: "les-prot-1",
      moduleId: "mod-prot-1",
      title: "درس محافظت‌شده دوره الف",
      contentMarkdown: "# درس ۱ دست‌نخورده",
      deletedAt: null,
    });
    targetDb.tables.quizzes.push({
      id: "quiz-prot-1",
      organizationId: orgB,
      courseId: courseAId,
      documentId: docId,
      title: "آزمون محافظت‌شده دوره الف",
      deletedAt: null,
    });

    // Course B imports this document
    sourceDb.tables.courses.push({
      id: "course-b-incoming",
      organizationId: orgA,
      name: "دوره دوم ورودی",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-incoming",
      organizationId: orgA,
      courseId: "course-b-incoming",
      ownerUserId: actorId,
      originalName: "ProtectedData.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-incoming.pdf",
      pageCount: 7,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-incoming.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: "course-b-incoming" });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);
    await importService.executeImport(plan.planId, actorId, orgB);

    // Verify Course A components remain intact
    expect(targetDb.tables.modules.find((m) => m.id === "mod-prot-1")?.title).toBe("سرفصل محافظت‌شده دوره الف");
    expect(targetDb.tables.lessons.find((l) => l.id === "les-prot-1")?.title).toBe("درس محافظت‌شده دوره الف");
    expect(targetDb.tables.quizzes.find((q) => q.id === "quiz-prot-1")?.title).toBe("آزمون محافظت‌شده دوره الف");
    expect(targetDb.tables.documents.find((d) => d.id === docId)?.courseId).toBe(courseAId);
  });

  it("Test 15: Rollback در صورت خطای میانی صحیح عمل کند", async () => {
    const courseId = "course-rollback-test";
    const fileContent = Buffer.from("Rollback test content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    sourceDb.tables.courses.push({
      id: courseId,
      organizationId: orgA,
      name: "دوره تست رول‌بک",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-rollback-1",
      organizationId: orgA,
      courseId,
      ownerUserId: actorId,
      originalName: "RollbackFile.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-rollback-1.pdf",
      pageCount: 3,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-rollback-1.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    // Inject simulated error in transaction
    const originalInsert = targetDb.insert.bind(targetDb);
    let shouldFail = true;
    targetDb.insert = function (tableObj: any) {
      const tableName = targetDb.getTableName(tableObj);
      if (tableName === "courses" && shouldFail) {
        throw new Error("Simulated DB fatal error during courses insertion");
      }
      return originalInsert(tableObj);
    };

    const docCountBefore = targetDb.tables.documents.length;
    const courseCountBefore = targetDb.tables.courses.length;

    await expect(
      importService.executeImport(plan.planId, actorId, orgB),
    ).rejects.toThrow(/Simulated DB fatal error/);

    // Verify rollback
    expect(targetDb.tables.documents.length).toBe(docCountBefore);
    expect(targetDb.tables.courses.length).toBe(courseCountBefore);

    targetDb.insert = originalInsert;
  });

  it("Test 16: تلاش همزمان دو عملیات برای ایجاد یک ارتباط یکسان با onConflictDoNothing مدیریت شود", async () => {
    const courseAId = "course-race-1";
    const docId = "doc-race-shared";
    const fileContent = Buffer.from("Race condition test content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره مالک اولیه",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "RaceDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    // Course B imports this document
    const courseBId = "course-race-2";
    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره دوم رقابتی",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-race",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "RaceDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-race.pdf",
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-race.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    // Simulate a true check-then-act race condition:
    // Request checks existing links (finds none), but a concurrent operation inserts the link
    // right before this request's insert executes.
    const targetCourse = targetDb.tables.courses.find((c) => c.name === "دوره دوم رقابتی") || { id: "course-race-2-target" };
    const preExistingPackId = "pack-race-preexisting";
    targetDb.tables.source_packs.push({
      id: preExistingPackId,
      organizationId: orgB,
      courseId: targetCourse.id,
      title: "منابع دوره",
      status: "active",
      deletedAt: null,
    });

    let raceInjected = false;
    const originalSelect = targetDb.select.bind(targetDb);
    targetDb.select = function (fields?: any) {
      const builder = originalSelect(fields);
      const originalFrom = builder.from.bind(builder);
      builder.from = function (tableObj: any) {
        const tableName = targetDb.getTableName(tableObj);
        const fromBuilder = originalFrom(tableObj);
        if (tableName === "source_pack_documents" && !raceInjected) {
          const originalWhere = fromBuilder.where.bind(fromBuilder);
          fromBuilder.where = function (cond: any) {
            raceInjected = true;
            // Inject concurrent insertion into table right before our insert executes
            targetDb.tables.source_pack_documents.push({
              id: "spd-preexisting-race",
              sourcePackId: preExistingPackId,
              documentId: docId,
              role: "supplementary_reference",
              orderIndex: 0,
            });
            return {
              orderBy: (..._args: any[]) => Promise.resolve([]),
              then: (resolve: any) => resolve([]),
            };
          };
        }
        return fromBuilder;
      };
      return builder;
    };

    // Execute import - calls onConflictDoNothing to resolve the race without error
    const result = await importService.executeImport(plan.planId, actorId, orgB);
    expect(result.success).toBe(true);
    targetDb.select = originalSelect;

    // Verify exactly one link exists
    const links = targetDb.tables.source_pack_documents.filter(
      (spd) => spd.sourcePackId === preExistingPackId && spd.documentId === docId,
    );
    expect(links.length).toBe(1);

    // Verify that onConflictDoNothing was physically invoked on source_pack_documents
    const spdConflictCalls = targetDb.onConflictDoNothingCalls.filter(
      (c) => c.table === "source_pack_documents",
    );
    expect(spdConflictCalls.length).toBeGreaterThan(0);

    // Verify ownership was not hijacked
    const targetDoc = targetDb.tables.documents.find((d) => d.id === docId);
    expect(targetDoc.courseId).toBe(courseAId);
  });

  it("Test 17: عدم سقط شدن Transaction در صورت برخورد با ارتباط موجود و ادامه اجرای دستورات بعدی", async () => {
    const courseAId = "course-tx-continue-1";
    const docId = "doc-tx-continue-1";
    const fileContent = Buffer.from("Tx continue test content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره قبلی",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "TxFile.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    // Course B imports this doc AND has modules and lessons
    const courseBId = "course-tx-continue-2";
    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره با ماژول‌های بعدی",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-tx",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "TxFile.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-tx.pdf",
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-tx.pdf", fileContent);
    sourceDb.tables.modules.push({
      id: "mod-subsequent-1",
      courseId: courseBId,
      documentId: "doc-source-tx",
      title: "فصل بعد از اتصال سورس‌پک",
      deletedAt: null,
    });
    sourceDb.tables.lessons.push({
      id: "les-subsequent-1",
      moduleId: "mod-subsequent-1",
      title: "درس بعد از اتصال سورس‌پک",
      contentMarkdown: "# محتوای درس",
      deletedAt: null,
    });

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    // Execute import
    const result = await importService.executeImport(plan.planId, actorId, orgB);
    expect(result.success).toBe(true);

    // Verify subsequent commands in the transaction succeeded
    const createdModule = targetDb.tables.modules.find((m) => m.title === "فصل بعد از اتصال سورس‌پک");
    expect(createdModule).toBeDefined();
    const createdLesson = targetDb.tables.lessons.find((l) => l.title === "درس بعد از اتصال سورس‌پک");
    expect(createdLesson).toBeDefined();
  });

  it("Test 18: خطاهای واقعی دیتابیس در مسیر Source Pack به لایه بالاتر منتقل شده و تراکنش رول‌بک شود", async () => {
    const courseAId = "course-real-error-1";
    const docId = "doc-real-error-1";
    const fileContent = Buffer.from("Real DB error test content");
    const fileSha = crypto.createHash("sha256").update(fileContent).digest("hex");

    targetDb.tables.courses.push({
      id: courseAId,
      organizationId: orgB,
      name: "دوره اصلی قبلی",
      status: "published",
    });
    targetDb.tables.documents.push({
      id: docId,
      organizationId: orgB,
      courseId: courseAId,
      ownerUserId: actorId,
      originalName: "RealErrorDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    targetStorage.files.set(`uploads/${docId}.pdf`, fileContent);

    const courseBId = "course-real-error-2";
    sourceDb.tables.courses.push({
      id: courseBId,
      organizationId: orgA,
      name: "دوره مواجه با خطای دیتابیس",
      status: "published",
    });
    sourceDb.tables.documents.push({
      id: "doc-source-err",
      organizationId: orgA,
      courseId: courseBId,
      ownerUserId: actorId,
      originalName: "RealErrorDoc.pdf",
      mimeType: "application/pdf",
      sizeBytes: fileContent.length,
      sha256: fileSha,
      storageKey: "uploads/doc-source-err.pdf",
      pageCount: 1,
      status: "ready",
      deletedAt: null,
    });
    sourceStorage.files.set("uploads/doc-source-err.pdf", fileContent);

    const zipBuffer = await exportService.exportContent(orgA, { courseId: courseBId });
    const plan = await importService.validatePackage(zipBuffer, actorId, orgB);

    // Simulate real database failure (e.g., connection lost or disk error) during source_pack_documents insertion
    const originalInsert = targetDb.insert.bind(targetDb);
    targetDb.insert = function (tableObj: any) {
      const tableName = targetDb.getTableName(tableObj);
      if (tableName === "source_pack_documents") {
        throw new Error("FATAL: connection to PostgreSQL server lost unexpectedly (code 57P01)");
      }
      return originalInsert(tableObj);
    };

    // The real database error MUST bubble up and NOT be swallowed
    await expect(
      importService.executeImport(plan.planId, actorId, orgB),
    ).rejects.toThrow(/connection to PostgreSQL server lost/);

    targetDb.insert = originalInsert;
  });
});

