/**
 * Content Export & Import Domain Types and Contracts.
 *
 * Defines canonical shapes for export packages, manifests, stable exportId mapping,
 * validation plans, duplicate detection results, and transactional execution.
 */

export interface ExportScope {
  courses?: boolean;
  modules?: boolean;
  lessons?: boolean;
  documents?: boolean;
  generatedContent?: boolean;
  flashcards?: boolean;
  quizzes?: boolean;
  questions?: boolean;
  files?: boolean;
}

export interface ExportManifestFile {
  exportId: string;
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface ExportPackageManifest {
  formatVersion: number; // 1
  exportedAt: string;
  source: string;
  contentVersion: string;
  scope: Required<ExportScope>;
  counts: {
    courses: number;
    modules: number;
    lessons: number;
    documents: number;
    documentChunks: number;
    generatedContents: number;
    flashcards: number;
    quizzes: number;
    questions: number;
    files: number;
  };
  files: ExportManifestFile[];
}

export interface ExportCourseItem {
  exportId: string;
  name: string;
  description: string | null;
  subject: string | null;
  status: string;
  isOfficial: boolean;
  examDate: string | null;
  contentHash: string;
}

export interface ExportModuleItem {
  exportId: string;
  courseExportId: string;
  documentExportId: string | null;
  title: string;
  description: string | null;
  sortOrder: number;
  contentHash: string;
}

export interface ExportLessonItem {
  exportId: string;
  moduleExportId: string;
  title: string;
  contentType: string;
  contentMarkdown: string;
  sortOrder: number;
  estimatedMinutes: number | null;
  publicationStatus: string;
  contentHash: string;
}

export interface ExportDocumentItem {
  exportId: string;
  courseExportId: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  fileRelativePath: string | null;
  pageCount: number | null;
  qualityScore: number | null;
  qualityLevel: string | null;
  qualityReport: Record<string, unknown> | null;
  contentHash: string;
}

export interface ExportDocumentChunkItem {
  exportId: string;
  documentExportId: string;
  sequence: number;
  heading: string | null;
  content: string;
  startPage: number;
  endPage: number;
  tokenEstimate: number;
  contentHash: string;
}

export interface ExportGeneratedContentItem {
  exportId: string;
  courseExportId: string;
  documentExportId: string | null;
  materializedLessonExportId: string | null;
  type: string;
  status: string;
  payload: unknown;
  promptVersion: string | null;
  model: string | null;
  tokenUsage: unknown | null;
  generationKey: string | null;
  contentHash: string;
}

export interface ExportGeneratedContentCitationItem {
  generatedContentExportId: string;
  documentChunkExportId: string;
}

export interface ExportFlashcardItem {
  exportId: string;
  courseExportId: string;
  documentExportId: string | null;
  lessonExportId: string | null;
  generatedContentExportId: string | null;
  question: string;
  answer: string;
  explanation: string | null;
  cardType: string;
  difficulty: string;
  intervalDays: number;
  easeFactor: number;
  contentHash: string;
}

export interface ExportQuizItem {
  exportId: string;
  courseExportId: string;
  documentExportId: string | null;
  title: string;
  topic: string | null;
  difficulty: string | null;
  status: string;
  contentHash: string;
}

export interface ExportQuizQuestionItem {
  exportId: string;
  quizExportId: string;
  lessonExportId: string | null;
  generatedContentExportId: string | null;
  question: string;
  topic: string | null;
  difficulty: string | null;
  questionType: string;
  choices: unknown;
  correctAnswer: unknown;
  explanation: string | null;
  sortOrder: number;
  contentHash: string;
}

export interface ParsedExportPackageData {
  manifest: ExportPackageManifest;
  courses: ExportCourseItem[];
  modules: ExportModuleItem[];
  lessons: ExportLessonItem[];
  documents: ExportDocumentItem[];
  documentChunks: ExportDocumentChunkItem[];
  generatedContents: ExportGeneratedContentItem[];
  citations: ExportGeneratedContentCitationItem[];
  flashcards: ExportFlashcardItem[];
  quizzes: ExportQuizItem[];
  questions: ExportQuizQuestionItem[];
  files: Map<string, Buffer>; // sha256 -> binary data
}

export type ImportEntityStatus = "NEW" | "EXISTING" | "UPDATED" | "CONFLICT";

export interface ImportEntityResolution {
  entityType: string;
  exportId: string;
  status: ImportEntityStatus;
  targetEntityId?: string;
  conflictReason?: string;
  titleOrName?: string;
}

export interface ImportConflict {
  entityType: string;
  exportId: string;
  titleOrName: string;
  reason: string;
}

export interface ImportCountBreakdown {
  new: number;
  existing: number;
  updated: number;
  conflict: number;
}

export interface ImportPreviewSummary {
  courses: ImportCountBreakdown;
  modules: ImportCountBreakdown;
  lessons: ImportCountBreakdown;
  documents: ImportCountBreakdown;
  generatedContents: ImportCountBreakdown;
  flashcards: ImportCountBreakdown;
  quizzes: ImportCountBreakdown;
  questions: ImportCountBreakdown;
  files: { new: number; existing: number };
  totalConflicts: number;
}

export interface ImportPlan {
  planId: string;
  packageChecksum: string;
  actorId: string;
  organizationId: string;
  formatVersion: number;
  source: string;
  exportedAt: string;
  summary: ImportPreviewSummary;
  resolutions: ImportEntityResolution[];
  conflicts: ImportConflict[];
  expiresAt: number;
}

export interface ImportExecutionResult {
  batchId: string;
  success: boolean;
  counts: {
    created: number;
    skipped: number;
    conflicts: number;
  };
  summary: ImportPreviewSummary;
  durationMs: number;
}

export interface ExportContentOptions {
  courseId?: string;
  moduleIds?: string[];
  lessonIds?: string[];
  scope?: ExportScope;
  sourceName?: string;
}
