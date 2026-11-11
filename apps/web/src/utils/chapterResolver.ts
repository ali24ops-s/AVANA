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

  // If there are no documents available at all
  if (!documents || documents.length === 0) {
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
    const moduleMatch = (modules || []).find((m) => m.id === cleanChapterId);
    if (moduleMatch) {
      const docForModule = documents.find(
        (d) =>
          (moduleMatch.document_id && d.id === moduleMatch.document_id) ||
          d.id === moduleMatch.id,
      );
      if (docForModule) {
        return {
          activeDocument: docForModule,
          activeModule: moduleMatch,
          canonicalChapterId: moduleMatch.id,
          isResolved: true,
        };
      }
    }

    // 2. Priority 2: Match on document.id
    const directDocMatch = documents.find((d) => d.id === cleanChapterId);
    if (directDocMatch) {
      const moduleForDoc =
        (modules || []).find(
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
    const moduleByDocIdMatch = (modules || []).find(
      (m) => m.document_id === cleanChapterId,
    );
    if (moduleByDocIdMatch) {
      const docForModule = documents.find(
        (d) =>
          d.id === moduleByDocIdMatch.document_id ||
          d.id === moduleByDocIdMatch.id,
      );
      if (docForModule) {
        return {
          activeDocument: docForModule,
          activeModule: moduleByDocIdMatch,
          canonicalChapterId: moduleByDocIdMatch.id,
          isResolved: true,
        };
      }
    }
  }

  // 4. Controlled fallback: canonical preview document or first available document
  const fallbackDoc =
    (canonicalPreviewDocId
      ? documents.find((d) => d.id === canonicalPreviewDocId)
      : null) ??
    documents[0] ??
    null;

  const fallbackModule =
    (modules || []).find(
      (m) =>
        (fallbackDoc && m.document_id === fallbackDoc.id) ||
        (fallbackDoc && m.id === fallbackDoc.id),
    ) ??
    (modules && modules.length > 0 ? modules[0] : null);

  const canonicalChapterId =
    fallbackModule?.id ?? fallbackDoc?.id ?? null;

  return {
    activeDocument: fallbackDoc,
    activeModule: fallbackModule,
    canonicalChapterId,
    isResolved: true,
  };
}
