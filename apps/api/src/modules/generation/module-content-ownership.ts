export interface ModuleContentOwnershipContext {
  targetModuleId: string;
  targetModuleDocId: string | null;
  moduleLessonIds: Set<string>;
  otherLessonIds: Set<string>;
  otherModuleDocIds: Set<string>;
  isDocumentShared: boolean;
}

export interface CandidateGeneratedContent {
  id: string;
  type: string;
  documentId: string | null;
  materializedLessonId?: string | null;
}

/**
 * Determines whether a generated content item belongs to a target module.
 *
 * Rules:
 * Priority 1: Lesson-based association (materialized lesson, flashcard lessonId, quiz question lessonId).
 * Priority 2: Document-based association (if target module has documentId, matches gc.documentId,
 *             and document is NOT shared with other modules in the course).
 *
 * Strict Isolation:
 * If a content belongs to a document claimed exclusively by another module, it is never
 * attributed to the target module.
 * If a document is shared between multiple modules without lesson mapping, unmapped contents
 * are treated as ambiguous and not attributed to any single module.
 */
export function isContentOwnedByModule(
  gc: CandidateGeneratedContent,
  context: ModuleContentOwnershipContext,
  flashcardsByGc?: Map<string, Array<{ lessonId: string | null }>>,
  quizQuestionsByGc?: Map<string, Array<{ lessonId: string | null }>>,
): boolean {
  const { targetModuleDocId, moduleLessonIds, otherLessonIds, otherModuleDocIds, isDocumentShared } = context;

  // Strict boundary: If content belongs to a document claimed by another module and NOT by targetModule,
  // it belongs to that other module and cannot be claimed by targetModule.
  if (gc.documentId && otherModuleDocIds.has(gc.documentId) && gc.documentId !== targetModuleDocId) {
    return false;
  }

  if (gc.type === "lesson") {
    // Priority 1: Explicit lesson mapping
    if (gc.materializedLessonId) {
      if (moduleLessonIds.has(gc.materializedLessonId)) return true;
      if (otherLessonIds.has(gc.materializedLessonId)) return false;
    }
    // Priority 2: Document mapping for unmaterialized lessons
    if (
      targetModuleDocId &&
      gc.documentId === targetModuleDocId &&
      !isDocumentShared
    ) {
      return true;
    }
    return false;
  }

  if (gc.type === "flashcard") {
    const cards = flashcardsByGc?.get(gc.id) || [];
    const hasModuleCard = cards.some((c) => c.lessonId && moduleLessonIds.has(c.lessonId));
    const hasOtherCard = cards.some((c) => c.lessonId && otherLessonIds.has(c.lessonId));

    // Priority 1: Lesson-based mapping
    if (hasOtherCard) return false;
    if (hasModuleCard) return true;

    // Priority 2: Document-based mapping for unmapped cards or if no lessons in module
    if (
      targetModuleDocId &&
      gc.documentId === targetModuleDocId &&
      !isDocumentShared
    ) {
      return true;
    }
    return false;
  }

  if (gc.type === "quiz") {
    // Priority 1: Lesson-based mapping
    if (gc.materializedLessonId) {
      if (moduleLessonIds.has(gc.materializedLessonId)) return true;
      if (otherLessonIds.has(gc.materializedLessonId)) return false;
    }

    const questions = quizQuestionsByGc?.get(gc.id) || [];
    const hasModuleQ = questions.some((q) => q.lessonId && moduleLessonIds.has(q.lessonId));
    const hasOtherQ = questions.some((q) => q.lessonId && otherLessonIds.has(q.lessonId));

    if (hasOtherQ) return false;
    if (hasModuleQ) return true;

    // Priority 2: Document-based mapping for unmapped quizzes or if no lessons in module
    if (
      targetModuleDocId &&
      gc.documentId === targetModuleDocId &&
      !isDocumentShared
    ) {
      return true;
    }
    return false;
  }

  // Other types (e.g., review_summary)
  if (
    targetModuleDocId &&
    gc.documentId === targetModuleDocId &&
    !isDocumentShared
  ) {
    return true;
  }

  return false;
}
