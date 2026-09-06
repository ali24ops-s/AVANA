import crypto from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  modules,
  lessons,
  documents,
  documentChunks,
  generatedContents,
  generatedContentCitations,
  flashcards,
  quizzes,
  quizQuestions,
  contentImportBatches,
  importedEntities,
  auditLogs,
} from "@avana/database/schema";
import { normalizeEducationalContent } from "@avana/domain";
import type { StorageProvider } from "../storage/storage-provider.js";
import type {
  ExportPackageManifest,
  ExportCourseItem,
  ExportModuleItem,
  ExportLessonItem,
  ExportDocumentItem,
  ExportDocumentChunkItem,
  ExportGeneratedContentItem,
  ExportGeneratedContentCitationItem,
  ExportFlashcardItem,
  ExportQuizItem,
  ExportQuizQuestionItem,
  ParsedExportPackageData,
  ImportPlan,
  ImportPreviewSummary,
  ImportEntityResolution,
  ImportConflict,
  ImportExecutionResult,
} from "./content-export-import-types.js";

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

interface CachedImportPlan {
  plan: ImportPlan;
  parsedData: ParsedExportPackageData;
}

export class ContentImportService {
  // Plan cache bound to planId, checksum, actorId, organizationId, and TTL
  private readonly plans = new Map<string, CachedImportPlan>();

  constructor(
    private readonly db: DbClient,
    private readonly storageProvider: StorageProvider,
    private readonly maxPackageSizeBytes: number = 50 * 1024 * 1024, // 50MB
    private readonly maxUncompressedSizeBytes: number = 250 * 1024 * 1024, // 250MB
    private readonly planTtlMs: number = 30 * 60 * 1000, // 30 minutes
  ) {}

  /**
   * Cleans up expired cached plans.
   */
  private cleanExpiredPlans(): void {
    const now = Date.now();
    for (const [id, cached] of this.plans.entries()) {
      if (cached.plan.expiresAt <= now) {
        this.plans.delete(id);
      }
    }
  }

  /**
   * Step 1: Validate incoming ZIP package, perform security checks,
   * run duplicate detection against target DB, and construct ImportPlan.
   */
  async validatePackage(
    zipBuffer: Buffer,
    actorId: string,
    organizationId: string,
  ): Promise<ImportPlan> {
    this.cleanExpiredPlans();

    // 1. Basic size check
    if (zipBuffer.length > this.maxPackageSizeBytes) {
      throw new Error(
        `Package size (${zipBuffer.length} bytes) exceeds limit of ${this.maxPackageSizeBytes} bytes`,
      );
    }

    const packageChecksum = sha256Hex(zipBuffer);

    // 2. Safe ZIP extraction & ZIP Bomb / Path Traversal checks
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(zipBuffer);
    } catch {
      throw new Error("Invalid or corrupted ZIP archive");
    }

    const entries = Object.keys(zip.files);
    if (entries.length === 0) {
      throw new Error("ZIP archive is empty");
    }
    if (entries.length > 5000) {
      throw new Error("ZIP archive contains too many files (max 5000 entries)");
    }

    let totalUncompressedSize = 0;
    for (const entryName of entries) {
      // Path traversal security check
      if (
        entryName.includes("..") ||
        path.isAbsolute(entryName) ||
        entryName.startsWith("/") ||
        entryName.startsWith("\\") ||
        /^[a-zA-Z]:/.test(entryName)
      ) {
        throw new Error(`Path traversal attempt detected in entry: ${entryName}`);
      }

      const fileObj = zip.files[entryName];
      if (!fileObj.dir) {
        // Approximate uncompressed size check
        const data = await fileObj.async("nodebuffer");
        totalUncompressedSize += data.length;
        if (totalUncompressedSize > this.maxUncompressedSizeBytes) {
          throw new Error(
            `Uncompressed archive size exceeds limit of ${this.maxUncompressedSizeBytes} bytes (possible zip bomb)`,
          );
        }
      }
    }

    const compressionRatio = totalUncompressedSize / Math.max(1, zipBuffer.length);
    if (compressionRatio > 50) {
      throw new Error("Compression ratio too high (possible zip bomb)");
    }

    // 3. Locate files (support root-level or single root-folder wrapper)
    const findFile = (name: string) => {
      if (zip.files[name] && !zip.files[name].dir) return zip.files[name];
      const match = entries.find(
        (e) => e.endsWith(`/${name}`) && !zip.files[e].dir,
      );
      return match ? zip.files[match] : undefined;
    };

    const manifestFile = findFile("manifest.json");
    if (!manifestFile) {
      throw new Error("Package is missing manifest.json");
    }

    let manifest: ExportPackageManifest;
    try {
      const manifestStr = await manifestFile.async("string");
      manifest = JSON.parse(manifestStr);
    } catch {
      throw new Error("Failed to parse manifest.json: invalid JSON format");
    }

    if (manifest.formatVersion !== 1) {
      throw new Error(
        `Unsupported package formatVersion: ${manifest.formatVersion}. Expected: 1`,
      );
    }

    // 4. Read and parse entity JSONs
    const readJson = async <T>(name: string): Promise<T[]> => {
      const f = findFile(name);
      if (!f) return [];
      try {
        const content = await f.async("string");
        return JSON.parse(content) as T[];
      } catch {
        throw new Error(`Invalid JSON format in ${name}`);
      }
    };

    const coursesList = await readJson<ExportCourseItem>("courses.json");
    const modulesList = await readJson<ExportModuleItem>("modules.json");
    const lessonsList = await readJson<ExportLessonItem>("lessons.json");
    const documentsList = await readJson<ExportDocumentItem>("documents.json");
    const chunksList = await readJson<ExportDocumentChunkItem>("document-chunks.json");
    const genContentsList = await readJson<ExportGeneratedContentItem>("generated-content.json");
    const citationsList = await readJson<ExportGeneratedContentCitationItem>("citations.json");
    const flashcardsList = await readJson<ExportFlashcardItem>("flashcards.json");
    const quizzesList = await readJson<ExportQuizItem>("quizzes.json");
    const questionsList = await readJson<ExportQuizQuestionItem>("questions.json");

    // 5. Read physical files from package
    const filesMap = new Map<string, Buffer>();
    if (manifest.files && manifest.files.length > 0) {
      for (const mf of manifest.files) {
        let zipEntry = zip.files[mf.path];
        if (!zipEntry) {
          const match = entries.find((e) => e.endsWith(mf.path));
          if (match) zipEntry = zip.files[match];
        }
        if (zipEntry && !zipEntry.dir) {
          const fileBuf = await zipEntry.async("nodebuffer");
          const actualSha = sha256Hex(fileBuf);
          if (actualSha !== mf.sha256) {
            throw new Error(
              `Integrity error for file ${mf.path}: expected checksum ${mf.sha256}, got ${actualSha}`,
            );
          }
          filesMap.set(mf.sha256, fileBuf);
        } else {
          throw new Error(`Referenced file ${mf.path} not found in archive`);
        }
      }
    }

    // 6. Validate Internal Referential Integrity & Unique exportIds
    const ensureUniqueExportIds = (items: { exportId: string }[], typeName: string) => {
      const seen = new Set<string>();
      for (const it of items) {
        if (!it.exportId || typeof it.exportId !== "string") {
          throw new Error(`Missing or invalid exportId in ${typeName}`);
        }
        if (seen.has(it.exportId)) {
          throw new Error(`Duplicate exportId '${it.exportId}' in ${typeName}`);
        }
        seen.add(it.exportId);
      }
    };

    ensureUniqueExportIds(coursesList, "courses");
    ensureUniqueExportIds(modulesList, "modules");
    ensureUniqueExportIds(lessonsList, "lessons");
    ensureUniqueExportIds(documentsList, "documents");
    ensureUniqueExportIds(chunksList, "documentChunks");
    ensureUniqueExportIds(genContentsList, "generatedContents");
    ensureUniqueExportIds(flashcardsList, "flashcards");
    ensureUniqueExportIds(quizzesList, "quizzes");
    ensureUniqueExportIds(questionsList, "questions");

    const courseExportIds = new Set(coursesList.map((c) => c.exportId));
    const moduleExportIds = new Set(modulesList.map((m) => m.exportId));
    const quizExportIds = new Set(quizzesList.map((q) => q.exportId));
    const lessonExportIds = new Set(lessonsList.map((l) => l.exportId));
    const docExportIds = new Set(documentsList.map((d) => d.exportId));

    for (const m of modulesList) {
      if (!courseExportIds.has(m.courseExportId)) {
        throw new Error(
          `Module '${m.title}' references non-existent courseExportId: '${m.courseExportId}'`,
        );
      }
      if (m.documentExportId && !docExportIds.has(m.documentExportId)) {
        throw new Error(
          `Module '${m.title}' references non-existent documentExportId: '${m.documentExportId}'`,
        );
      }
    }

    for (const l of lessonsList) {
      if (!moduleExportIds.has(l.moduleExportId)) {
        throw new Error(
          `Lesson '${l.title}' references non-existent moduleExportId: '${l.moduleExportId}'`,
        );
      }
    }

    for (const qq of questionsList) {
      if (!quizExportIds.has(qq.quizExportId)) {
        throw new Error(
          `Question '${qq.question}' references non-existent quizExportId: '${qq.quizExportId}'`,
        );
      }
      if (qq.lessonExportId && !lessonExportIds.has(qq.lessonExportId)) {
        throw new Error(
          `Question '${qq.question}' references non-existent lessonExportId: '${qq.lessonExportId}'`,
        );
      }
    }

    // 7. Duplicate Detection against Target DB
    const resolutions: ImportEntityResolution[] = [];
    const conflicts: ImportConflict[] = [];

    // Query existing imported_entities for this organization
    const existingImports = await this.db
      .select()
      .from(importedEntities)
      .where(eq(importedEntities.organizationId, organizationId));

    const importedByExportId = new Map<string, typeof importedEntities.$inferSelect>();
    for (const imp of existingImports) {
      importedByExportId.set(`${imp.entityType}:${imp.exportId}`, imp);
    }

    // 7.1 Course Duplicate Detection
    const dbTargetCourses = await this.db
      .select()
      .from(courses)
      .where(and(eq(courses.organizationId, organizationId), isNull(courses.deletedAt)));

    const coursesByName = new Map<string, typeof courses.$inferSelect>();
    const coursesById = new Map<string, typeof courses.$inferSelect>();
    for (const c of dbTargetCourses) {
      coursesByName.set(c.name.trim().toLowerCase(), c);
      coursesById.set(c.id, c);
    }

    const courseResolutions = new Map<string, string>(); // exportId -> targetCourseId

    for (const c of coursesList) {
      const imp = importedByExportId.get(`course:${c.exportId}`);
      if (imp && coursesById.has(imp.targetEntityId)) {
        // Tier 1: Match by prior import provenance
        const targetCourse = coursesById.get(imp.targetEntityId)!;
        courseResolutions.set(c.exportId, targetCourse.id);
        if (imp.contentHash === c.contentHash) {
          resolutions.push({
            entityType: "course",
            exportId: c.exportId,
            status: "EXISTING",
            targetEntityId: targetCourse.id,
            titleOrName: c.name,
          });
        } else {
          resolutions.push({
            entityType: "course",
            exportId: c.exportId,
            status: "CONFLICT",
            targetEntityId: targetCourse.id,
            conflictReason: "Course content was modified since prior import",
            titleOrName: c.name,
          });
          conflicts.push({
            entityType: "course",
            exportId: c.exportId,
            titleOrName: c.name,
            reason: "دوره در محیط مقصد از قبل وجود دارد اما محتوای آن متفاوت است",
          });
        }
      } else {
        // Tier 2: Match by natural key (organizationId, name)
        const naturalMatch = coursesByName.get(c.name.trim().toLowerCase());
        if (naturalMatch) {
          courseResolutions.set(c.exportId, naturalMatch.id);
          resolutions.push({
            entityType: "course",
            exportId: c.exportId,
            status: "EXISTING",
            targetEntityId: naturalMatch.id,
            titleOrName: c.name,
          });
        } else {
          resolutions.push({
            entityType: "course",
            exportId: c.exportId,
            status: "NEW",
            titleOrName: c.name,
          });
        }
      }
    }

    // 7.2 Document Duplicate Detection (Tier 1: imported_entities, Tier 2: sha256)
    const dbTargetDocs = await this.db
      .select()
      .from(documents)
      .where(and(eq(documents.organizationId, organizationId), isNull(documents.deletedAt)));

    const docsBySha = new Map<string, typeof documents.$inferSelect>();
    const docsById = new Map<string, typeof documents.$inferSelect>();
    for (const d of dbTargetDocs) {
      docsBySha.set(d.sha256, d);
      docsById.set(d.id, d);
    }

    for (const d of documentsList) {
      const imp = importedByExportId.get(`document:${d.exportId}`);
      if (imp && docsById.has(imp.targetEntityId)) {
        const targetDoc = docsById.get(imp.targetEntityId)!;
        resolutions.push({
          entityType: "document",
          exportId: d.exportId,
          status: "EXISTING",
          targetEntityId: targetDoc.id,
          titleOrName: d.originalName,
        });
      } else {
        const naturalMatch = docsBySha.get(d.sha256);
        if (naturalMatch) {
          resolutions.push({
            entityType: "document",
            exportId: d.exportId,
            status: "EXISTING",
            targetEntityId: naturalMatch.id,
            titleOrName: d.originalName,
          });
        } else {
          resolutions.push({
            entityType: "document",
            exportId: d.exportId,
            status: "NEW",
            titleOrName: d.originalName,
          });
        }
      }
    }

    // 7.3 Module Duplicate Detection
    const dbTargetModules = await this.db
      .select()
      .from(modules)
      .where(isNull(modules.deletedAt));

    const modulesById = new Map<string, typeof modules.$inferSelect>();
    const modulesByCourseAndTitle = new Map<string, typeof modules.$inferSelect>();
    for (const m of dbTargetModules) {
      modulesById.set(m.id, m);
      modulesByCourseAndTitle.set(`${m.courseId}:${m.title.trim().toLowerCase()}`, m);
    }

    for (const m of modulesList) {
      const imp = importedByExportId.get(`module:${m.exportId}`);
      if (imp && modulesById.has(imp.targetEntityId)) {
        const targetMod = modulesById.get(imp.targetEntityId)!;
        resolutions.push({
          entityType: "module",
          exportId: m.exportId,
          status: "EXISTING",
          targetEntityId: targetMod.id,
          titleOrName: m.title,
        });
      } else {
        const targetCourseId = courseResolutions.get(m.courseExportId);
        const naturalMatch = targetCourseId
          ? modulesByCourseAndTitle.get(`${targetCourseId}:${m.title.trim().toLowerCase()}`)
          : undefined;

        if (naturalMatch) {
          resolutions.push({
            entityType: "module",
            exportId: m.exportId,
            status: "EXISTING",
            targetEntityId: naturalMatch.id,
            titleOrName: m.title,
          });
        } else {
          resolutions.push({
            entityType: "module",
            exportId: m.exportId,
            status: "NEW",
            titleOrName: m.title,
          });
        }
      }
    }

    // 7.4 Lesson Duplicate Detection
    const dbTargetLessons = await this.db
      .select()
      .from(lessons)
      .where(isNull(lessons.deletedAt));

    const lessonsById = new Map<string, typeof lessons.$inferSelect>();
    for (const l of dbTargetLessons) {
      lessonsById.set(l.id, l);
    }

    for (const l of lessonsList) {
      const imp = importedByExportId.get(`lesson:${l.exportId}`);
      if (imp && lessonsById.has(imp.targetEntityId)) {
        const targetLes = lessonsById.get(imp.targetEntityId)!;
        if (imp.contentHash === l.contentHash) {
          resolutions.push({
            entityType: "lesson",
            exportId: l.exportId,
            status: "EXISTING",
            targetEntityId: targetLes.id,
            titleOrName: l.title,
          });
        } else {
          resolutions.push({
            entityType: "lesson",
            exportId: l.exportId,
            status: "CONFLICT",
            targetEntityId: targetLes.id,
            conflictReason: "Lesson markdown content differs from prior import",
            titleOrName: l.title,
          });
          conflicts.push({
            entityType: "lesson",
            exportId: l.exportId,
            titleOrName: l.title,
            reason: "متن درس با نسخه قبلی واردشده متفاوت است",
          });
        }
      } else {
        resolutions.push({
          entityType: "lesson",
          exportId: l.exportId,
          status: "NEW",
          titleOrName: l.title,
        });
      }
    }

    // 7.5 Flashcards Duplicate Detection
    const dbTargetFlashcards = await this.db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.organizationId, organizationId), isNull(flashcards.deletedAt)));
    const fcById = new Map<string, typeof flashcards.$inferSelect>();
    for (const fc of dbTargetFlashcards) {
      fcById.set(fc.id, fc);
    }

    for (const fc of flashcardsList) {
      const imp = importedByExportId.get(`flashcard:${fc.exportId}`);
      if (imp && fcById.has(imp.targetEntityId)) {
        resolutions.push({
          entityType: "flashcard",
          exportId: fc.exportId,
          status: "EXISTING",
          targetEntityId: imp.targetEntityId,
          titleOrName: fc.question.slice(0, 40),
        });
      } else {
        resolutions.push({
          entityType: "flashcard",
          exportId: fc.exportId,
          status: "NEW",
          titleOrName: fc.question.slice(0, 40),
        });
      }
    }

    // 7.6 Quizzes Duplicate Detection
    const dbTargetQuizzes = await this.db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.organizationId, organizationId), isNull(quizzes.deletedAt)));
    const quizzesById = new Map<string, typeof quizzes.$inferSelect>();
    for (const q of dbTargetQuizzes) {
      quizzesById.set(q.id, q);
    }

    for (const q of quizzesList) {
      const imp = importedByExportId.get(`quiz:${q.exportId}`);
      if (imp && quizzesById.has(imp.targetEntityId)) {
        resolutions.push({
          entityType: "quiz",
          exportId: q.exportId,
          status: "EXISTING",
          targetEntityId: imp.targetEntityId,
          titleOrName: q.title,
        });
      } else {
        resolutions.push({
          entityType: "quiz",
          exportId: q.exportId,
          status: "NEW",
          titleOrName: q.title,
        });
      }
    }

    // 7.7 Quiz Questions Duplicate Detection
    for (const qq of questionsList) {
      const imp = importedByExportId.get(`quiz_question:${qq.exportId}`);
      if (imp) {
        resolutions.push({
          entityType: "quiz_question",
          exportId: qq.exportId,
          status: "EXISTING",
          targetEntityId: imp.targetEntityId,
          titleOrName: (qq.question || "").slice(0, 40),
        });
      } else {
        resolutions.push({
          entityType: "quiz_question",
          exportId: qq.exportId,
          status: "NEW",
          titleOrName: (qq.question || "").slice(0, 40),
        });
      }
    }

    // 7.8 Generated Contents Duplicate Detection
    for (const gc of genContentsList) {
      const imp = importedByExportId.get(`generated_content:${gc.exportId}`);
      if (imp) {
        resolutions.push({
          entityType: "generated_content",
          exportId: gc.exportId,
          status: "EXISTING",
          targetEntityId: imp.targetEntityId,
        });
      } else {
        resolutions.push({
          entityType: "generated_content",
          exportId: gc.exportId,
          status: "NEW",
        });
      }
    }

    // 8. Build Summary Breakdown
    const computeBreakdown = (type: string) => {
      const items = resolutions.filter((r) => r.entityType === type);
      return {
        new: items.filter((r) => r.status === "NEW").length,
        existing: items.filter((r) => r.status === "EXISTING").length,
        updated: items.filter((r) => r.status === "UPDATED").length,
        conflict: items.filter((r) => r.status === "CONFLICT").length,
      };
    };

    const docItems = resolutions.filter((r) => r.entityType === "document");
    const summary: ImportPreviewSummary = {
      courses: computeBreakdown("course"),
      modules: computeBreakdown("module"),
      lessons: computeBreakdown("lesson"),
      documents: computeBreakdown("document"),
      generatedContents: computeBreakdown("generated_content"),
      flashcards: computeBreakdown("flashcard"),
      quizzes: computeBreakdown("quiz"),
      questions: computeBreakdown("quiz_question"),
      files: {
        new: docItems.filter((d) => d.status === "NEW" && filesMap.has(d.exportId)).length,
        existing: docItems.filter((d) => d.status === "EXISTING").length,
      },
      totalConflicts: conflicts.length,
    };

    // 9. Construct and Cache ImportPlan with TTL and Bindings
    const planId = crypto.randomUUID();
    const plan: ImportPlan = {
      planId,
      packageChecksum,
      actorId,
      organizationId,
      formatVersion: manifest.formatVersion,
      source: manifest.source,
      exportedAt: manifest.exportedAt,
      summary,
      resolutions,
      conflicts,
      expiresAt: Date.now() + this.planTtlMs,
    };

    const parsedData: ParsedExportPackageData = {
      manifest,
      courses: coursesList,
      modules: modulesList,
      lessons: lessonsList,
      documents: documentsList,
      documentChunks: chunksList,
      generatedContents: genContentsList,
      citations: citationsList,
      flashcards: flashcardsList,
      quizzes: quizzesList,
      questions: questionsList,
      files: filesMap,
    };

    this.plans.set(planId, { plan, parsedData });

    return plan;
  }

  /**
   * Step 2: Execute Import inside a strict PostgreSQL transaction
   * with physical file rollback on error.
   */
  async executeImport(
    planId: string,
    actorId: string,
    organizationId: string,
    options: { onConflict?: "skip" | "error"; packageChecksum?: string } = {},
  ): Promise<ImportExecutionResult> {
    const startTime = Date.now();
    this.cleanExpiredPlans();

    const cached = this.plans.get(planId);
    if (!cached) {
      throw new Error("Import plan is invalid or has expired. Please re-validate the package.");
    }

    const { plan, parsedData } = cached;

    // Security binding verifications (Requirement 3)
    if (plan.actorId !== actorId) {
      throw new Error("Import plan was created by a different administrator");
    }
    if (plan.organizationId !== organizationId) {
      throw new Error("Organization mismatch for import plan");
    }
    if (options.packageChecksum && options.packageChecksum !== plan.packageChecksum) {
      throw new Error("Package checksum does not match validated plan");
    }
    if (plan.conflicts.length > 0 && options.onConflict === "error") {
      throw new Error(
        `Import cannot proceed due to ${plan.conflicts.length} conflict(s). Resolve conflicts or choose 'skip'.`,
      );
    }

    const resolutionMap = new Map<string, ImportEntityResolution>();
    for (const res of plan.resolutions) {
      resolutionMap.set(`${res.entityType}:${res.exportId}`, res);
    }

    // Mapping: exportId -> target Database UUID
    const targetIdMap = new Map<string, string>();

    // Pre-populate targetIdMap with matched EXISTING entities
    for (const res of plan.resolutions) {
      if (res.targetEntityId && (res.status === "EXISTING" || res.status === "UPDATED")) {
        targetIdMap.set(res.exportId, res.targetEntityId);
      }
    }

    // Track physical files saved to storage for rollback
    const newlySavedStorageKeys: string[] = [];
    const newProvenanceRecords: (typeof importedEntities.$inferInsert)[] = [];

    const batchId = crypto.randomUUID();
    let totalCreated = 0;
    let totalSkipped = 0;

    try {
      await this.db.transaction(async (tx) => {
        // 1. Create content_import_batches record
        await tx.insert(contentImportBatches).values({
          id: batchId,
          organizationId,
          source: plan.source,
          formatVersion: plan.formatVersion,
          packageChecksum: plan.packageChecksum,
          manifest: plan.summary as unknown as Record<string, unknown>,
          stats: plan.summary as unknown as Record<string, unknown>,
          status: "in_progress",
          createdBy: actorId,
        });

        // 2. Insert Documents & Files
        for (const doc of parsedData.documents) {
          const res = resolutionMap.get(`document:${doc.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(doc.exportId, res.targetEntityId);
            totalSkipped++;
            continue;
          }

          const newDocId = crypto.randomUUID();
          let storageKey = `uploads/${newDocId}.bin`;
          if (doc.originalName) {
            const ext = path.extname(doc.originalName) || ".bin";
            storageKey = `uploads/${newDocId}${ext}`;
          }

          // If binary file was bundled in package, save to storageProvider
          if (parsedData.files.has(doc.sha256)) {
            const fileData = parsedData.files.get(doc.sha256)!;
            await this.storageProvider.save({
              storageKey,
              data: fileData,
              mimeType: doc.mimeType,
            });
            newlySavedStorageKeys.push(storageKey);
          }

          await tx.insert(documents).values({
            id: newDocId,
            organizationId,
            courseId: null, // Will be bound if course is created
            ownerUserId: actorId,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            sha256: doc.sha256,
            storageKey,
            pageCount: doc.pageCount,
            status: "ready",
            qualityScore: doc.qualityScore,
            qualityLevel: doc.qualityLevel,
            qualityReport: doc.qualityReport,
          });

          targetIdMap.set(doc.exportId, newDocId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "document",
            exportId: doc.exportId,
            targetEntityId: newDocId,
            contentHash: doc.contentHash,
            naturalKey: doc.sha256,
          });
        }

        // Insert Document Chunks
        const chunkExportToId = new Map<string, string>();
        for (const ch of parsedData.documentChunks) {
          const targetDocId = targetIdMap.get(ch.documentExportId);
          if (!targetDocId) continue;

          // Check if document was existing; if doc is new, insert chunks
          const docRes = resolutionMap.get(`document:${ch.documentExportId}`);
          if (docRes?.status === "EXISTING") continue;

          const newChunkId = crypto.randomUUID();
          await tx.insert(documentChunks).values({
            id: newChunkId,
            documentId: targetDocId,
            organizationId,
            sequence: ch.sequence,
            heading: ch.heading,
            content: ch.content,
            startPage: ch.startPage,
            endPage: ch.endPage,
            tokenEstimate: ch.tokenEstimate,
            contentHash:
              ch.contentHash ||
              crypto.createHash("sha256").update(ch.content).digest("hex"),
          });
          chunkExportToId.set(ch.exportId, newChunkId);
        }

        // 3. Insert Courses
        for (const c of parsedData.courses) {
          const res = resolutionMap.get(`course:${c.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(c.exportId, res.targetEntityId);
            totalSkipped++;
            // Still register provenance if not already registered
            newProvenanceRecords.push({
              id: crypto.randomUUID(),
              organizationId,
              batchId,
              entityType: "course",
              exportId: c.exportId,
              targetEntityId: res.targetEntityId,
              contentHash: c.contentHash,
              naturalKey: c.name.trim().toLowerCase(),
            });
            continue;
          }

          const newCourseId = crypto.randomUUID();
          await tx.insert(courses).values({
            id: newCourseId,
            organizationId,
            name: c.name,
            description: c.description,
            subject: c.subject,
            status: c.status || "published",
            isOfficial: Boolean(c.isOfficial),
            examDate: c.examDate ? new Date(c.examDate) : null,
          });

          targetIdMap.set(c.exportId, newCourseId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "course",
            exportId: c.exportId,
            targetEntityId: newCourseId,
            contentHash: c.contentHash,
            naturalKey: c.name.trim().toLowerCase(),
          });
        }

        // Link Documents to Courses if courseExportId was set
        for (const doc of parsedData.documents) {
          if (doc.courseExportId) {
            const targetCourseId = targetIdMap.get(doc.courseExportId);
            const targetDocId = targetIdMap.get(doc.exportId);
            if (targetCourseId && targetDocId) {
              await tx
                .update(documents)
                .set({ courseId: targetCourseId })
                .where(eq(documents.id, targetDocId));
            }
          }
        }

        // 4. Insert Modules
        for (const m of parsedData.modules) {
          const res = resolutionMap.get(`module:${m.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(m.exportId, res.targetEntityId);
            totalSkipped++;
            newProvenanceRecords.push({
              id: crypto.randomUUID(),
              organizationId,
              batchId,
              entityType: "module",
              exportId: m.exportId,
              targetEntityId: res.targetEntityId,
              contentHash: m.contentHash,
              naturalKey: `${m.courseExportId}:${m.title.trim().toLowerCase()}`,
            });
            continue;
          }

          const targetCourseId = targetIdMap.get(m.courseExportId);
          if (!targetCourseId) {
            throw new Error(`Missing target course ID for module '${m.title}'`);
          }

          const targetDocId = m.documentExportId
            ? targetIdMap.get(m.documentExportId) || null
            : null;

          const newModuleId = crypto.randomUUID();
          await tx.insert(modules).values({
            id: newModuleId,
            courseId: targetCourseId,
            documentId: targetDocId,
            title: m.title,
            description: m.description,
            sortOrder: m.sortOrder,
          });

          targetIdMap.set(m.exportId, newModuleId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "module",
            exportId: m.exportId,
            targetEntityId: newModuleId,
            contentHash: m.contentHash,
            naturalKey: `${m.courseExportId}:${m.title.trim().toLowerCase()}`,
          });
        }

        // 5. Insert Lessons
        for (const l of parsedData.lessons) {
          const res = resolutionMap.get(`lesson:${l.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(l.exportId, res.targetEntityId);
            totalSkipped++;
            newProvenanceRecords.push({
              id: crypto.randomUUID(),
              organizationId,
              batchId,
              entityType: "lesson",
              exportId: l.exportId,
              targetEntityId: res.targetEntityId,
              contentHash: l.contentHash,
              naturalKey: `${l.moduleExportId}:${l.title.trim().toLowerCase()}`,
            });
            continue;
          }

          const targetModuleId = targetIdMap.get(l.moduleExportId);
          if (!targetModuleId) {
            throw new Error(`Missing target module ID for lesson '${l.title}'`);
          }

          const newLessonId = crypto.randomUUID();
          await tx.insert(lessons).values({
            id: newLessonId,
            moduleId: targetModuleId,
            title: l.title,
            contentType: l.contentType || "markdown",
            contentMarkdown: l.contentMarkdown ? normalizeEducationalContent(l.contentMarkdown) : "",
            sortOrder: l.sortOrder,
            estimatedMinutes: l.estimatedMinutes,
            publicationStatus: l.publicationStatus || "published",
          });

          targetIdMap.set(l.exportId, newLessonId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "lesson",
            exportId: l.exportId,
            targetEntityId: newLessonId,
            contentHash: l.contentHash,
            naturalKey: `${l.moduleExportId}:${l.title.trim().toLowerCase()}`,
          });
        }

        // 6. Insert Generated Contents & Citations
        const genExportToId = new Map<string, string>();
        for (const gc of parsedData.generatedContents) {
          const res = resolutionMap.get(`generated_content:${gc.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(gc.exportId, res.targetEntityId);
            totalSkipped++;
            continue;
          }

          const targetCourseId = targetIdMap.get(gc.courseExportId);
          if (!targetCourseId) continue;

          const targetDocId = gc.documentExportId
            ? targetIdMap.get(gc.documentExportId) || null
            : null;
          const targetMatLessonId = gc.materializedLessonExportId
            ? targetIdMap.get(gc.materializedLessonExportId) || null
            : null;

          const newGenId = crypto.randomUUID();
          await tx.insert(generatedContents).values({
            id: newGenId,
            organizationId,
            courseId: targetCourseId,
            documentId: targetDocId,
            materializedLessonId: targetMatLessonId,
            type: gc.type,
            status: gc.status || "accepted",
            payload: gc.payload as unknown as Record<string, unknown>,
            promptVersion: gc.promptVersion,
            model: gc.model,
            tokenUsage: gc.tokenUsage as unknown as Record<string, unknown>,
            generationKey: gc.generationKey,
          });

          targetIdMap.set(gc.exportId, newGenId);
          genExportToId.set(gc.exportId, newGenId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "generated_content",
            exportId: gc.exportId,
            targetEntityId: newGenId,
            contentHash: gc.contentHash,
          });
        }

        // Citations
        for (const cit of parsedData.citations) {
          const targetGenId = genExportToId.get(cit.generatedContentExportId);
          const targetChunkId = chunkExportToId.get(cit.documentChunkExportId);
          if (targetGenId && targetChunkId) {
            await tx.insert(generatedContentCitations).values({
              generatedContentId: targetGenId,
              documentChunkId: targetChunkId,
            });
          }
        }

        // 7. Insert Flashcards
        for (const fc of parsedData.flashcards) {
          const res = resolutionMap.get(`flashcard:${fc.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(fc.exportId, res.targetEntityId);
            totalSkipped++;
            continue;
          }

          const targetCourseId = targetIdMap.get(fc.courseExportId);
          if (!targetCourseId) continue;

          const targetLessonId = fc.lessonExportId
            ? targetIdMap.get(fc.lessonExportId) || null
            : null;
          const targetDocId = fc.documentExportId
            ? targetIdMap.get(fc.documentExportId) || null
            : null;
          const targetGenId = fc.generatedContentExportId
            ? targetIdMap.get(fc.generatedContentExportId) || null
            : null;

          const newCardId = crypto.randomUUID();
          await tx.insert(flashcards).values({
            id: newCardId,
            organizationId,
            courseId: targetCourseId,
            lessonId: targetLessonId,
            documentId: targetDocId,
            generatedContentId: targetGenId,
            question: fc.question,
            answer: fc.answer,
            explanation: fc.explanation,
            cardType: fc.cardType || "definition",
            difficulty: fc.difficulty || "medium",
            intervalDays: fc.intervalDays || 0,
            easeFactor: String(fc.easeFactor || "2.5"),
          });

          targetIdMap.set(fc.exportId, newCardId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "flashcard",
            exportId: fc.exportId,
            targetEntityId: newCardId,
            contentHash: fc.contentHash,
          });
        }

        // 8. Insert Quizzes
        for (const q of parsedData.quizzes) {
          const res = resolutionMap.get(`quiz:${q.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(q.exportId, res.targetEntityId);
            totalSkipped++;
            continue;
          }

          const targetCourseId = targetIdMap.get(q.courseExportId);
          if (!targetCourseId) continue;

          const targetDocId = q.documentExportId
            ? targetIdMap.get(q.documentExportId) || null
            : null;

          const newQuizId = crypto.randomUUID();
          await tx.insert(quizzes).values({
            id: newQuizId,
            organizationId,
            courseId: targetCourseId,
            documentId: targetDocId,
            title: q.title,
            topic: q.topic,
            difficulty: q.difficulty || "medium",
            status: q.status || "published",
          });

          targetIdMap.set(q.exportId, newQuizId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "quiz",
            exportId: q.exportId,
            targetEntityId: newQuizId,
            contentHash: q.contentHash,
          });
        }

        // 9. Insert Quiz Questions
        for (const qq of parsedData.questions) {
          const res = resolutionMap.get(`quiz_question:${qq.exportId}`);
          if (res?.status === "EXISTING" && res.targetEntityId) {
            targetIdMap.set(qq.exportId, res.targetEntityId);
            totalSkipped++;
            continue;
          }

          const targetQuizId = targetIdMap.get(qq.quizExportId);
          if (!targetQuizId) continue;

          const targetLessonId = qq.lessonExportId
            ? targetIdMap.get(qq.lessonExportId) || null
            : null;
          const targetGenId = qq.generatedContentExportId
            ? targetIdMap.get(qq.generatedContentExportId) || null
            : null;

          const newQuestionId = crypto.randomUUID();
          await tx.insert(quizQuestions).values({
            id: newQuestionId,
            quizId: targetQuizId,
            lessonId: targetLessonId,
            generatedContentId: targetGenId,
            question: qq.question,
            topic: qq.topic,
            difficulty: qq.difficulty || "medium",
            questionType: qq.questionType || "multiple_choice",
            choices: qq.choices as unknown as Record<string, unknown>,
            correctAnswer: qq.correctAnswer as unknown as Record<string, unknown>,
            explanation: qq.explanation,
            sortOrder: qq.sortOrder,
          });

          targetIdMap.set(qq.exportId, newQuestionId);
          totalCreated++;

          newProvenanceRecords.push({
            id: crypto.randomUUID(),
            organizationId,
            batchId,
            entityType: "quiz_question",
            exportId: qq.exportId,
            targetEntityId: newQuestionId,
            contentHash: qq.contentHash,
          });
        }

        // 10. Persist Provenance records in imported_entities
        if (newProvenanceRecords.length > 0) {
          for (const prov of newProvenanceRecords) {
            await tx
              .insert(importedEntities)
              .values(prov)
              .onConflictDoUpdate({
                target: [
                  importedEntities.organizationId,
                  importedEntities.entityType,
                  importedEntities.exportId,
                ],
                set: {
                  targetEntityId: prov.targetEntityId,
                  contentHash: prov.contentHash,
                  batchId: prov.batchId,
                  importedAt: sql`now()`,
                },
              });
          }
        }

        // 11. Finalize batch status
        await tx
          .update(contentImportBatches)
          .set({
            status: "completed",
            completedAt: new Date(),
          })
          .where(eq(contentImportBatches.id, batchId));

        // 12. Log audit event
        await tx.insert(auditLogs).values({
          actorId,
          organizationId,
          action: "admin.content_imported",
          entityType: "content_import_batch",
          entityId: batchId,
          details: {
            createdCount: totalCreated,
            skippedCount: totalSkipped,
            packageChecksum: plan.packageChecksum,
          },
        });
      });
    } catch (error) {
      // Transaction was rolled back by PostgreSQL!
      // Rollback physical files written to storage:
      for (const storageKey of newlySavedStorageKeys) {
        try {
          await this.storageProvider.delete(storageKey);
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }

    // Invalidate plan cache immediately to prevent replay
    this.plans.delete(planId);

    return {
      batchId,
      success: true,
      counts: {
        created: totalCreated,
        skipped: totalSkipped,
        conflicts: plan.conflicts.length,
      },
      summary: plan.summary,
      durationMs: Date.now() - startTime,
    };
  }
}
