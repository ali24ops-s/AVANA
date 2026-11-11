import {
  DomainError,
  type CourseId,
  type DocumentId,
  type OrganizationId,
} from "@avana/domain";
import type { DocumentRecord, DocumentStore } from "../learning/learning-store.js";
import type { SourcePackStore } from "../source-packs/source-pack-store.js";

export interface DocumentCourseAssociationDeps {
  documentStore: DocumentStore;
  sourcePackStore?: SourcePackStore;
}

export type DocumentCourseAssociationResult = {
  associated: boolean;
  document?: DocumentRecord;
  reason?: "not_found" | "unassigned" | "different_course";
};

/**
 * Checks whether a document is associated with a specific course.
 *
 * Association is established if:
 * 1. The document is directly assigned to the course (doc.courseId === courseId), OR
 * 2. The document is linked to an active (non-deleted) source pack belonging to the course.
 *
 * Scoped strictly to the provided organizationId to prevent cross-tenant leakage.
 */
export async function isDocumentAssociatedWithCourse(
  deps: DocumentCourseAssociationDeps,
  documentId: DocumentId,
  courseId: CourseId,
  organizationId: OrganizationId,
): Promise<DocumentCourseAssociationResult> {
  const doc = await deps.documentStore.findByIdForOrganization(
    documentId,
    organizationId,
  );

  if (!doc || doc.deletedAt) {
    return { associated: false, reason: "not_found" };
  }

  // 1. Direct assignment
  if (doc.courseId === courseId) {
    return { associated: true, document: doc };
  }

  // 2. Active Source Pack link in target course
  if (deps.sourcePackStore) {
    try {
      const packs = await deps.sourcePackStore.listByCourse(courseId, organizationId);
      const isLinkedToActivePack = packs.some(
        (pack) =>
          !pack.deletedAt &&
          pack.status !== "archived" &&
          pack.documents?.some((d) => d.documentId === documentId),
      );
      if (isLinkedToActivePack) {
        return { associated: true, document: doc };
      }
    } catch {
      // Gracefully handle source pack lookup failures
    }
  }

  const reason = doc.courseId ? "different_course" : "unassigned";
  return { associated: false, document: doc, reason };
}

/**
 * Asserts that a document exists, belongs to the organization, and is actively associated with the course.
 *
 * Throws consistent DomainError matching domain requirements if association is invalid.
 */
export async function assertDocumentAssociatedWithCourse(
  deps: DocumentCourseAssociationDeps,
  documentId: DocumentId,
  courseId: CourseId,
  organizationId: OrganizationId,
): Promise<DocumentRecord> {
  const result = await isDocumentAssociatedWithCourse(
    deps,
    documentId,
    courseId,
    organizationId,
  );

  if (!result.associated) {
    if (result.reason === "not_found" || !result.document) {
      throw new DomainError("not_found", "Document not found (سند منبع یافت نشد).");
    }
    if (result.reason === "unassigned") {
      throw new DomainError(
        "bad_request",
        "این سند به دوره‌ای اختصاص نیافته است. لطفاً ابتدا سند را به دوره متصل کنید.",
      );
    }
    throw new DomainError(
      "bad_request",
      "این سند متعلق به دوره دیگری است و امکان تولید محتوا برای این دوره با آن وجود ندارد. (Document belongs to a different course / does not belong to this course / این سند به دوره دیگری تعلق دارد. / سند انتخاب‌شده متعلق به این دوره نیست)",
    );
  }

  return result.document!;
}
