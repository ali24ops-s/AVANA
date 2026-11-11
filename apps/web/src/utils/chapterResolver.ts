/**
 * Centralized, deterministic chapter resolver for AVANA Review Summary and Mind Map views.
 *
 * Resolves a given chapterId to a valid document and module with strict, deterministic priority:
 * 1. module.id === chapterId
 * 2. doc.id === chapterId
 * 3. module.document_id === chapterId
 * 4. Controlled fallback to canonicalPreviewDocId or first available document
 *
 * Guarantees:
 * - Does not fallback to chapter 1 before documents/modules finish loading.
 * - Produces a single canonical chapterId (preferring module.id when available, falling back to doc.id).
 * - Avoids state leakage between different courses.
 */

export interface ChapterModule {
  id: string;
  title: string;
  document_id?: string | null;
  sort_order?: number;
}

export interface ChapterDocument {
  id: string;
  title: string;
}

export interface ResolveChapterOptions {
  chapterId?: string | null;
  modules?: ChapterModule[];
  documents: ChapterDocument[];
  canonicalPreviewDocId?: string | null;
  isDocumentsLoading?: boolean;
}

export interface ResolveChapterResult {
  activeDocument: ChapterDocument | null;
  activeModule: ChapterModule | null;
  canonicalChapterId: string | null;
  isResolved: boolean;
}

export function resolveChapterDocument({
  chapterId,
  modules,
  documents,
  canonicalPreviewDocId,
  isDocumentsLoading = false,
}: ResolveChapterOptions): ResolveChapterResult {
  // If documents are still loading, do not prematurely resolve or fallback
  if (isDocumentsLoading) {
    return {
      activeDocument: null,
      activeModule: null,
      canonicalChapterId: null,
      isResolved: false,
    };
  }

  const safeDocs = documents || [];
  const safeModules = modules || [];

  // If there are no documents and no modules available at all
  if (safeDocs.length === 0 && safeModules.length === 0) {
    return {
      activeDocument: null,
      activeModule: null,
      canonicalChapterId: null,
      isResolved: true,
    };
  }

  const cleanChapterId = chapterId?.trim() || null;

  if (cleanChapterId) {
    // 1. Priority 1: Match on module.id
    const moduleMatch = safeModules.find((m) => m.id === cleanChapterId);
    if (moduleMatch) {
      const docForModule = safeDocs.find(
        (d) =>
          (moduleMatch.document_id && d.id === moduleMatch.document_id) ||
          d.id === moduleMatch.id,
      ) ?? null;
      return {
        activeDocument: docForModule,
        activeModule: moduleMatch,
        canonicalChapterId: moduleMatch.id,
        isResolved: true,
      };
    }

    // 2. Priority 2: Match on document.id
    const directDocMatch = safeDocs.find((d) => d.id === cleanChapterId);
    if (directDocMatch) {
      const moduleForDoc =
        safeModules.find(
          (m) =>
            m.document_id === directDocMatch.id ||
            m.id === directDocMatch.id,
        ) ?? null;
      return {
        activeDocument: directDocMatch,
        activeModule: moduleForDoc,
        canonicalChapterId: moduleForDoc?.id ?? directDocMatch.id,
        isResolved: true,
      };
    }

    // 3. Priority 3: Match on module.document_id
    const moduleByDocIdMatch = safeModules.find(
      (m) => m.document_id === cleanChapterId,
    );
    if (moduleByDocIdMatch) {
      const docForModule = safeDocs.find(
        (d) =>
          d.id === moduleByDocIdMatch.document_id ||
          d.id === moduleByDocIdMatch.id,
      ) ?? null;
      return {
        activeDocument: docForModule,
        activeModule: moduleByDocIdMatch,
        canonicalChapterId: moduleByDocIdMatch.id,
        isResolved: true,
      };
    }
  }

  // 4. Controlled fallback: canonical preview document or first available document/module
  let fallbackDoc: ChapterDocument | null =
    (canonicalPreviewDocId
      ? safeDocs.find((d) => d.id === canonicalPreviewDocId)
      : null) ??
    safeDocs[0] ??
    null;

  const fallbackModule =
    safeModules.find(
      (m) =>
        (fallbackDoc && m.document_id === fallbackDoc.id) ||
        (fallbackDoc && m.id === fallbackDoc.id),
    ) ??
    (safeModules.length > 0 ? safeModules[0] : null);

  if (!fallbackDoc && fallbackModule) {
    fallbackDoc =
      safeDocs.find(
        (d) =>
          (fallbackModule.document_id && d.id === fallbackModule.document_id) ||
          d.id === fallbackModule.id,
      ) ?? null;
  }

  const canonicalChapterId =
    fallbackModule?.id ?? fallbackDoc?.id ?? null;

  return {
    activeDocument: fallbackDoc,
    activeModule: fallbackModule,
    canonicalChapterId,
    isResolved: true,
  };
}
