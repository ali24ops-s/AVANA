import crypto from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { eq, and, or, inArray, isNull } from "drizzle-orm";
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
} from "@avana/database/schema";
import type { StorageProvider } from "../storage/storage-provider.js";
import type {
  ExportContentOptions,
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
  ExportManifestFile,
} from "./content-export-import-types.js";

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function resolveDocExportId(
  docId: string | null,
  docExportMap: Map<string, string>,
  entityType: string,
  entityId: string,
): string | null {
  if (!docId) return null;
  const exportId = docExportMap.get(docId);
  if (!exportId) {
    throw new Error(
      `Export failed: ${entityType} '${entityId}' references document '${docId}' which was not found in exported documents or is deleted.`,
    );
  }
  return exportId;
}

export class ContentExportService {
  constructor(
    private readonly db: DbClient,
    private readonly storageProvider: StorageProvider,
  ) {}

  /**
   * Generates a self-contained, ID-decoupled content export package (.zip).
   */
  async exportContent(
    organizationId: string,
    options: ExportContentOptions = {},
  ): Promise<Buffer> {
    const scope = {
      courses: options.scope?.courses ?? true,
      modules: options.scope?.modules ?? true,
      lessons: options.scope?.lessons ?? true,
      documents: options.scope?.documents ?? true,
      generatedContent: options.scope?.generatedContent ?? true,
      flashcards: options.scope?.flashcards ?? true,
      quizzes: options.scope?.quizzes ?? true,
      questions: options.scope?.questions ?? true,
      files: options.scope?.files ?? true,
    };

    // 1. Query Courses
    const courseConditions = [
      eq(courses.organizationId, organizationId),
      isNull(courses.deletedAt),
    ];
    if (options.courseId) {
      courseConditions.push(eq(courses.id, options.courseId));
    }
    const dbCourses = await this.db
      .select()
      .from(courses)
      .where(and(...courseConditions));

    if (dbCourses.length === 0) {
      throw new Error("No courses found matching export criteria");
    }

    const selectedCourseIds = dbCourses.map((c) => c.id);

    // Map internal DB IDs to stable exportIds
    const courseExportMap = new Map<string, string>();
    const exportCourses: ExportCourseItem[] = [];

    for (const c of dbCourses) {
      const exportId = `course_${c.id}`;
      courseExportMap.set(c.id, exportId);
      if (scope.courses) {
        exportCourses.push({
          exportId,
          name: c.name,
          description: c.description,
          subject: c.subject,
          status: c.status,
          isOfficial: c.isOfficial,
          examDate: c.examDate ? c.examDate.toISOString() : null,
          contentHash: sha256Hex(
            JSON.stringify({
              name: c.name.trim().toLowerCase(),
              subject: (c.subject || "").trim().toLowerCase(),
              description: (c.description || "").trim(),
            }),
          ),
        });
      }
    }

    // 2. Query Modules
    const moduleConditions = [
      inArray(modules.courseId, selectedCourseIds),
      isNull(modules.deletedAt),
    ];
    if (options.moduleIds && options.moduleIds.length > 0) {
      moduleConditions.push(inArray(modules.id, options.moduleIds));
    }
    const dbModules = await this.db
      .select()
      .from(modules)
      .where(and(...moduleConditions))
      .orderBy(modules.sortOrder);

    const selectedModuleIds = dbModules.map((m) => m.id);
    const moduleExportMap = new Map<string, string>();
    for (const m of dbModules) {
      moduleExportMap.set(m.id, `module_${m.id}`);
    }

    // 3. Query Lessons
    let dbLessons: (typeof lessons.$inferSelect)[] = [];
    if (selectedModuleIds.length > 0) {
      const lessonConditions = [
        inArray(lessons.moduleId, selectedModuleIds),
        isNull(lessons.deletedAt),
      ];
      if (options.lessonIds && options.lessonIds.length > 0) {
        lessonConditions.push(inArray(lessons.id, options.lessonIds));
      }
      dbLessons = await this.db
        .select()
        .from(lessons)
        .where(and(...lessonConditions))
        .orderBy(lessons.sortOrder);
    }
    const selectedLessonIds = dbLessons.map((l) => l.id);
    const lessonExportMap = new Map<string, string>();
    for (const l of dbLessons) {
      lessonExportMap.set(l.id, `lesson_${l.id}`);
    }

    // 4. Query Generated Contents & Citations
    let dbGenContents: (typeof generatedContents.$inferSelect)[] = [];
    let dbCitations: (typeof generatedContentCitations.$inferSelect)[] = [];
    if (scope.generatedContent) {
      dbGenContents = await this.db
        .select()
        .from(generatedContents)
        .where(
          and(
            eq(generatedContents.organizationId, organizationId),
            inArray(generatedContents.courseId, selectedCourseIds),
            isNull(generatedContents.deletedAt),
          ),
        );

      const genIds = dbGenContents.map((g) => g.id);
      if (genIds.length > 0) {
        dbCitations = await this.db
          .select()
          .from(generatedContentCitations)
          .where(inArray(generatedContentCitations.generatedContentId, genIds));
      }
    }

    // 5. Query Flashcards
    const dbFlashcards: (typeof flashcards.$inferSelect)[] = [];
    if (scope.flashcards) {
      const flashcardConditions = [
        eq(flashcards.organizationId, organizationId),
        inArray(flashcards.courseId, selectedCourseIds),
        isNull(flashcards.deletedAt),
      ];
      const allCards = await this.db
        .select()
        .from(flashcards)
        .where(and(...flashcardConditions));

      for (const fc of allCards) {
        if (
          options.lessonIds &&
          options.lessonIds.length > 0 &&
          fc.lessonId &&
          !selectedLessonIds.includes(fc.lessonId)
        ) {
          continue;
        }
        dbFlashcards.push(fc);
      }
    }

    // 6. Query Quizzes & Quiz Questions
    let dbQuizzes: (typeof quizzes.$inferSelect)[] = [];
    let dbQuestions: (typeof quizQuestions.$inferSelect)[] = [];
    if (scope.quizzes) {
      dbQuizzes = await this.db
        .select()
        .from(quizzes)
        .where(
          and(
            eq(quizzes.organizationId, organizationId),
            inArray(quizzes.courseId, selectedCourseIds),
            isNull(quizzes.deletedAt),
          ),
        );

      const quizIds = dbQuizzes.map((q) => q.id);
      if (scope.questions && quizIds.length > 0) {
        dbQuestions = await this.db
          .select()
          .from(quizQuestions)
          .where(inArray(quizQuestions.quizId, quizIds))
          .orderBy(quizQuestions.sortOrder);
      }
    }

    // 7. Collect All Referenced Document IDs across all exported entities
    const referencedDocIds = new Set<string>();
    const docToReferencingCourseMap = new Map<string, string>();

    for (const m of dbModules) {
      if (m.documentId) {
        referencedDocIds.add(m.documentId);
        if (!docToReferencingCourseMap.has(m.documentId)) {
          docToReferencingCourseMap.set(m.documentId, m.courseId);
        }
      }
    }
    for (const g of dbGenContents) {
      if (g.documentId) {
        referencedDocIds.add(g.documentId);
        if (!docToReferencingCourseMap.has(g.documentId)) {
          docToReferencingCourseMap.set(g.documentId, g.courseId);
        }
      }
    }
    for (const fc of dbFlashcards) {
      if (fc.documentId) {
        referencedDocIds.add(fc.documentId);
        if (!docToReferencingCourseMap.has(fc.documentId)) {
          docToReferencingCourseMap.set(fc.documentId, fc.courseId);
        }
      }
    }
    for (const q of dbQuizzes) {
      if (q.documentId) {
        referencedDocIds.add(q.documentId);
        if (!docToReferencingCourseMap.has(q.documentId)) {
          docToReferencingCourseMap.set(q.documentId, q.courseId);
        }
      }
    }

    // 8. Query Documents and Chunks (including cross-course referenced documents)
    const docFilterConditions = [
      eq(documents.organizationId, organizationId),
      isNull(documents.deletedAt),
    ];
    const referencedDocIdList = Array.from(referencedDocIds);
    if (referencedDocIdList.length > 0) {
      docFilterConditions.push(
        or(
          inArray(documents.courseId, selectedCourseIds),
          inArray(documents.id, referencedDocIdList),
        )!,
      );
    } else {
      docFilterConditions.push(inArray(documents.courseId, selectedCourseIds));
    }

    const dbDocuments = await this.db
      .select()
      .from(documents)
      .where(and(...docFilterConditions));

    const docExportMap = new Map<string, string>();
    const exportDocuments: ExportDocumentItem[] = [];
    const exportManifestFiles: ExportManifestFile[] = [];
    const fileDataMap = new Map<string, { buffer: Buffer; path: string }>();

    for (const d of dbDocuments) {
      const exportId = `doc_${d.id}`;
      docExportMap.set(d.id, exportId);

      let fileRelPath: string | null = null;
      if (scope.files && (await this.storageProvider.exists(d.storageKey))) {
        try {
          const fileBuf = await this.storageProvider.read(d.storageKey);
          const ext = path.extname(d.originalName) || ".bin";
          fileRelPath = `files/${d.sha256}${ext}`;
          fileDataMap.set(d.sha256, { buffer: fileBuf, path: fileRelPath });
          exportManifestFiles.push({
            exportId,
            path: fileRelPath,
            sha256: d.sha256,
            sizeBytes: fileBuf.length,
          });
        } catch {
          // Non-critical file read failure; metadata still exported
        }
      }

      if (scope.documents) {
        let docCourseExportId: string | null = null;
        if (d.courseId && courseExportMap.has(d.courseId)) {
          docCourseExportId = courseExportMap.get(d.courseId) || null;
        } else if (docToReferencingCourseMap.has(d.id)) {
          const refCourseId = docToReferencingCourseMap.get(d.id)!;
          docCourseExportId = courseExportMap.get(refCourseId) || null;
        }

        exportDocuments.push({
          exportId,
          courseExportId: docCourseExportId,
          originalName: d.originalName,
          mimeType: d.mimeType,
          sizeBytes: d.sizeBytes,
          sha256: d.sha256,
          fileRelativePath: fileRelPath,
          pageCount: d.pageCount,
          qualityScore: d.qualityScore,
          qualityLevel: d.qualityLevel,
          qualityReport: d.qualityReport as Record<string, unknown> | null,
          contentHash: d.sha256,
        });
      }
    }

    // Document Chunks
    const exportDocumentChunks: ExportDocumentChunkItem[] = [];
    const docIds = dbDocuments.map((d) => d.id);
    if (scope.documents && docIds.length > 0) {
      const dbChunks = await this.db
        .select()
        .from(documentChunks)
        .where(inArray(documentChunks.documentId, docIds))
        .orderBy(documentChunks.sequence);

      for (const ch of dbChunks) {
        exportDocumentChunks.push({
          exportId: `chunk_${ch.id}`,
          documentExportId: docExportMap.get(ch.documentId) || `doc_${ch.documentId}`,
          sequence: ch.sequence,
          heading: ch.heading,
          content: ch.content,
          startPage: ch.startPage,
          endPage: ch.endPage,
          tokenEstimate: ch.tokenEstimate,
          contentHash: ch.contentHash,
        });
      }
    }

    // 9. Build Export Modules
    const exportModules: ExportModuleItem[] = [];
    for (const m of dbModules) {
      if (scope.modules) {
        exportModules.push({
          exportId: `module_${m.id}`,
          courseExportId: courseExportMap.get(m.courseId) || `course_${m.courseId}`,
          documentExportId: resolveDocExportId(m.documentId, docExportMap, "Module", m.id),
          title: m.title,
          description: m.description,
          sortOrder: m.sortOrder,
          contentHash: sha256Hex(
            JSON.stringify({
              title: m.title.trim().toLowerCase(),
              sortOrder: m.sortOrder,
            }),
          ),
        });
      }
    }

    // 10. Build Export Lessons
    const exportLessons: ExportLessonItem[] = [];
    for (const l of dbLessons) {
      if (scope.lessons) {
        exportLessons.push({
          exportId: `lesson_${l.id}`,
          moduleExportId: moduleExportMap.get(l.moduleId) || `module_${l.moduleId}`,
          title: l.title,
          contentType: l.contentType,
          contentMarkdown: l.contentMarkdown,
          sortOrder: l.sortOrder,
          estimatedMinutes: l.estimatedMinutes,
          publicationStatus: l.publicationStatus,
          contentHash: sha256Hex(
            JSON.stringify({
              title: l.title.trim().toLowerCase(),
              contentMarkdown: l.contentMarkdown.trim(),
            }),
          ),
        });
      }
    }

    // 11. Build Export Generated Contents & Citations
    const exportGeneratedContents: ExportGeneratedContentItem[] = [];
    const exportCitations: ExportGeneratedContentCitationItem[] = [];

    if (scope.generatedContent) {
      for (const g of dbGenContents) {
        exportGeneratedContents.push({
          exportId: `gen_${g.id}`,
          courseExportId: courseExportMap.get(g.courseId) || `course_${g.courseId}`,
          documentExportId: resolveDocExportId(g.documentId, docExportMap, "GeneratedContent", g.id),
          materializedLessonExportId: g.materializedLessonId
            ? lessonExportMap.get(g.materializedLessonId) || null
            : null,
          type: g.type,
          status: g.status,
          payload: g.payload,
          promptVersion: g.promptVersion,
          model: g.model,
          tokenUsage: g.tokenUsage,
          generationKey: g.generationKey,
          contentHash: sha256Hex(
            JSON.stringify({
              type: g.type,
              payload: g.payload,
            }),
          ),
        });
      }

      for (const c of dbCitations) {
        exportCitations.push({
          generatedContentExportId: `gen_${c.generatedContentId}`,
          documentChunkExportId: `chunk_${c.documentChunkId}`,
        });
      }
    }

    // 12. Build Export Flashcards
    const exportFlashcards: ExportFlashcardItem[] = [];
    if (scope.flashcards) {
      for (const fc of dbFlashcards) {
        exportFlashcards.push({
          exportId: `card_${fc.id}`,
          courseExportId: courseExportMap.get(fc.courseId) || `course_${fc.courseId}`,
          documentExportId: resolveDocExportId(fc.documentId, docExportMap, "Flashcard", fc.id),
          lessonExportId: fc.lessonId ? lessonExportMap.get(fc.lessonId) || null : null,
          generatedContentExportId: fc.generatedContentId ? `gen_${fc.generatedContentId}` : null,
          question: fc.question,
          answer: fc.answer,
          explanation: fc.explanation,
          cardType: fc.cardType,
          difficulty: fc.difficulty,
          intervalDays: fc.intervalDays,
          easeFactor: Number(fc.easeFactor),
          contentHash: sha256Hex(
            JSON.stringify({
              question: fc.question.trim(),
              answer: fc.answer.trim(),
            }),
          ),
        });
      }
    }

    // 13. Build Export Quizzes & Quiz Questions
    const exportQuizzes: ExportQuizItem[] = [];
    const exportQuizQuestions: ExportQuizQuestionItem[] = [];

    if (scope.quizzes) {
      for (const q of dbQuizzes) {
        exportQuizzes.push({
          exportId: `quiz_${q.id}`,
          courseExportId: courseExportMap.get(q.courseId) || `course_${q.courseId}`,
          documentExportId: resolveDocExportId(q.documentId, docExportMap, "Quiz", q.id),
          title: q.title,
          topic: q.topic,
          difficulty: q.difficulty,
          status: q.status,
          contentHash: sha256Hex(
            JSON.stringify({
              title: q.title.trim().toLowerCase(),
              topic: (q.topic || "").trim().toLowerCase(),
            }),
          ),
        });
      }

      if (scope.questions) {
        for (const qq of dbQuestions) {
          if (
            options.lessonIds &&
            options.lessonIds.length > 0 &&
            qq.lessonId &&
            !selectedLessonIds.includes(qq.lessonId)
          ) {
            continue;
          }

          exportQuizQuestions.push({
            exportId: `question_${qq.id}`,
            quizExportId: `quiz_${qq.quizId}`,
            lessonExportId: qq.lessonId ? lessonExportMap.get(qq.lessonId) || null : null,
            generatedContentExportId: qq.generatedContentId ? `gen_${qq.generatedContentId}` : null,
            question: qq.question,
            topic: qq.topic,
            difficulty: qq.difficulty,
            questionType: qq.questionType,
            choices: qq.choices,
            correctAnswer: qq.correctAnswer,
            explanation: qq.explanation,
            sortOrder: qq.sortOrder,
            contentHash: sha256Hex(
              JSON.stringify({
                question: qq.question.trim(),
                choices: qq.choices,
                correctAnswer: qq.correctAnswer,
              }),
            ),
          });
        }
      }
    }

    // 8. Construct Manifest
    const manifest: ExportPackageManifest = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      source: options.sourceName || "avana-export",
      contentVersion: "1.0",
      scope: {
        courses: scope.courses,
        modules: scope.modules,
        lessons: scope.lessons,
        documents: scope.documents,
        generatedContent: scope.generatedContent,
        flashcards: scope.flashcards,
        quizzes: scope.quizzes,
        questions: scope.questions,
        files: scope.files,
      },
      counts: {
        courses: exportCourses.length,
        modules: exportModules.length,
        lessons: exportLessons.length,
        documents: exportDocuments.length,
        documentChunks: exportDocumentChunks.length,
        generatedContents: exportGeneratedContents.length,
        flashcards: exportFlashcards.length,
        quizzes: exportQuizzes.length,
        questions: exportQuizQuestions.length,
        files: exportManifestFiles.length,
      },
      files: exportManifestFiles,
    };

    // 9. Assemble ZIP Archive
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("courses.json", JSON.stringify(exportCourses, null, 2));
    zip.file("modules.json", JSON.stringify(exportModules, null, 2));
    zip.file("lessons.json", JSON.stringify(exportLessons, null, 2));
    zip.file("documents.json", JSON.stringify(exportDocuments, null, 2));
    zip.file("document-chunks.json", JSON.stringify(exportDocumentChunks, null, 2));
    zip.file("generated-content.json", JSON.stringify(exportGeneratedContents, null, 2));
    zip.file("citations.json", JSON.stringify(exportCitations, null, 2));
    zip.file("flashcards.json", JSON.stringify(exportFlashcards, null, 2));
    zip.file("quizzes.json", JSON.stringify(exportQuizzes, null, 2));
    zip.file("questions.json", JSON.stringify(exportQuizQuestions, null, 2));

    // Add physical files
    if (scope.files && fileDataMap.size > 0) {
      for (const [, { buffer, path: relPath }] of fileDataMap.entries()) {
        zip.file(relPath, buffer);
      }
    }

    return zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }
}
