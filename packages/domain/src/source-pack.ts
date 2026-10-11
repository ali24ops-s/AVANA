import type { CourseId, DocumentId, OrganizationId, SourcePackId, UserId } from "./ids.js";
import { DomainError } from "./errors.js";

export type SemanticSourceRole =
  | "primary_notes"
  | "question_template"
  | "primary_reference"
  | "supplementary_reference";

export type SourceRole = SemanticSourceRole;

export type SourcePackRole = SemanticSourceRole | "primary" | "supplementary";

export function isPrimaryRole(role?: SourcePackRole): boolean {
  return role === "primary_notes" || role === "primary";
}

export function canonicalizeSourceRole(role?: SourcePackRole): SemanticSourceRole {
  if (!role || role === "primary" || role === "primary_notes") {
    return "primary_notes";
  }
  if (role === "supplementary" || role === "supplementary_reference") {
    return "supplementary_reference";
  }
  return role;
}

export const MAX_SOURCE_PACK_DOCUMENTS = 10;
export const MIN_SOURCE_PACK_DOCUMENTS = 1;
export const MIN_SOURCE_PACK_GENERATION_DOCUMENTS = 2;

export interface SourcePackDocumentInput {
  documentId: DocumentId;
  role?: SourcePackRole;
  orderIndex?: number;
}

export interface NormalizedSourcePackDocument {
  documentId: DocumentId;
  role: SemanticSourceRole;
  orderIndex: number;
}

export interface SourcePack {
  id: SourcePackId;
  organizationId: OrganizationId;
  courseId: CourseId;
  title: string;
  description?: string | null;
  createdByUserId: UserId;
  createdAt: Date;
  updatedAt: Date;
}

export interface SourcePackWithDocuments extends SourcePack {
  documents: NormalizedSourcePackDocument[];
}

/**
 * Validates and normalizes documents for a Source Pack:
 * - 1 to 10 documents allowed in pack definition.
 * - No duplicate document IDs.
 * - Exactly one primary document (or auto-assigns the first as primary if none explicitly specified).
 * - Primary is normalized to orderIndex = 0.
 * - Supplementary documents are assigned orderIndex = 1 .. N.
 */
export function normalizeAndValidateSourcePackDocuments(
  docs: SourcePackDocumentInput[],
): NormalizedSourcePackDocument[] {
  if (!Array.isArray(docs) || docs.length < MIN_SOURCE_PACK_DOCUMENTS) {
    throw new DomainError("bad_request", "A source pack must contain at least 1 document");
  }

  if (docs.length > MAX_SOURCE_PACK_DOCUMENTS) {
    throw new DomainError("bad_request", `A source pack cannot contain more than ${MAX_SOURCE_PACK_DOCUMENTS} documents`);
  }

  const seen = new Set<string>();
  for (const doc of docs) {
    if (!doc.documentId) {
      throw new DomainError("bad_request", "Document ID is required for each source pack document");
    }
    if (seen.has(doc.documentId)) {
      throw new DomainError("bad_request", `Duplicate document detected in source pack: ${doc.documentId}`);
    }
    seen.add(doc.documentId);
  }

  const primaryCount = docs.filter((d) => isPrimaryRole(d.role)).length;
  if (primaryCount > 1) {
    throw new DomainError("bad_request", "A source pack cannot have more than 1 primary document");
  }

  const questionTemplateCount = docs.filter((d) => d.role === "question_template").length;
  if (questionTemplateCount > 1) {
    throw new DomainError("bad_request", "A source pack cannot have more than 1 question template document");
  }

  const primaryReferenceCount = docs.filter((d) => d.role === "primary_reference").length;
  if (primaryReferenceCount > 1) {
    throw new DomainError("bad_request", "A source pack cannot have more than 1 primary reference document");
  }

  let primaryDoc: SourcePackDocumentInput;
  let otherDocs: SourcePackDocumentInput[];

  if (primaryCount === 1) {
    primaryDoc = docs.find((d) => isPrimaryRole(d.role))!;
    otherDocs = docs.filter((d) => !isPrimaryRole(d.role));
  } else {
    // If no primary explicitly marked, the first document becomes primary_notes by default
    primaryDoc = docs[0];
    otherDocs = docs.slice(1);
  }

  // Preserve user ordering among other docs if provided, otherwise preserve array order
  otherDocs.sort((a, b) => {
    const orderA = typeof a.orderIndex === "number" ? a.orderIndex : 999;
    const orderB = typeof b.orderIndex === "number" ? b.orderIndex : 999;
    return orderA - orderB;
  });

  const normalized: NormalizedSourcePackDocument[] = [
    {
      documentId: primaryDoc.documentId,
      role: "primary_notes",
      orderIndex: 0,
    },
    ...otherDocs.map((doc, idx) => ({
      documentId: doc.documentId,
      role: doc.role ? canonicalizeSourceRole(doc.role) : "supplementary_reference",
      orderIndex: idx + 1,
    })),
  ];

  return normalized;
}
