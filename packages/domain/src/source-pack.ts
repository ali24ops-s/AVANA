import type { CourseId, DocumentId, OrganizationId, SourcePackId, UserId } from "./ids.js";
import { DomainError } from "./errors.js";

export type SemanticSourceRole =
  | "primary_notes"
  | "question_template"
  | "primary_reference"
  | "supplementary_reference";

export type SourceRole = SemanticSourceRole;

export type SourcePackRole = SemanticSourceRole | "primary" | "supplementary";

export const SOURCE_ROLES: readonly SemanticSourceRole[] = [
  "primary_notes",
  "question_template",
  "primary_reference",
  "supplementary_reference",
] as const;

export interface SourceRoleMetadata {
  id: SemanticSourceRole;
  labelFa: string;
  shortDescriptionFa: string;
  detailedDescriptionFa: string;
  isPrimaryTeachingFlow: boolean;
  canDeriveLessonSyllabus: boolean;
  isReferenceMaterial: boolean;
  maxAllowedPerPack: number;
}

export const SOURCE_ROLE_METADATA: Record<SemanticSourceRole, SourceRoleMetadata> = {
  primary_notes: {
    id: "primary_notes",
    labelFa: "جزوه اصلی (مسیر تدریس)",
    shortDescriptionFa: "منبع اصلی تدریس و ساختار درس",
    detailedDescriptionFa:
      "منبع اصلی مسیر تدریس و ترتیب مطالب. ساختار، محدوده و اولویت آموزشی محتوا را مشخص می‌کند.",
    isPrimaryTeachingFlow: true,
    canDeriveLessonSyllabus: true,
    isReferenceMaterial: false,
    maxAllowedPerPack: 1,
  },
  question_template: {
    id: "question_template",
    labelFa: "نمونه سؤال و الگو",
    shortDescriptionFa: "الگو، ساختار و سختی آزمون",
    detailedDescriptionFa:
      "برای استخراج سبک، الگو، ساختار و سطح دشواری سؤال‌ها استفاده می‌شود. هرگز به عنوان منبع درسنامه تلقی نمی‌شود و نباید سرفصل‌ها را تغییر دهد.",
    isPrimaryTeachingFlow: false,
    canDeriveLessonSyllabus: false,
    isReferenceMaterial: false,
    maxAllowedPerPack: 1,
  },
  primary_reference: {
    id: "primary_reference",
    labelFa: "رفرنس اصلی (اعتبارسنجی علمی)",
    shortDescriptionFa: "مرجع علمی و رفع تعارضات",
    detailedDescriptionFa:
      "برای اعتبارسنجی علمی، رفع ابهام و بررسی صحت مطالب استفاده می‌شود. تعارض علمی با جزوه باید شناسایی و در متن مدیریت شود.",
    isPrimaryTeachingFlow: false,
    canDeriveLessonSyllabus: false,
    isReferenceMaterial: true,
    maxAllowedPerPack: 1,
  },
  supplementary_reference: {
    id: "supplementary_reference",
    labelFa: "منبع تکمیلی",
    shortDescriptionFa: "تکمیل توضیحات و نکات کمکی",
    detailedDescriptionFa:
      "برای تکمیل توضیحات، افزودن مثال‌های بالینی و مطالب مرتبط استفاده می‌شود، بدون اینکه ساختار اصلی تدریس را تغییر دهد.",
    isPrimaryTeachingFlow: false,
    canDeriveLessonSyllabus: false,
    isReferenceMaterial: true,
    maxAllowedPerPack: 10,
  },
};

export function isPrimaryRole(role?: SourcePackRole | string | null): boolean {
  return role === "primary_notes" || role === "primary";
}

export function canonicalizeSourceRole(role?: SourcePackRole | string | null): SemanticSourceRole {
  if (!role || role === "primary" || role === "primary_notes") {
    return "primary_notes";
  }
  if (role === "supplementary" || role === "supplementary_reference") {
    return "supplementary_reference";
  }
  if (role === "question_template") {
    return "question_template";
  }
  if (role === "primary_reference") {
    return "primary_reference";
  }
  return "supplementary_reference";
}

export const SOURCE_ROLE_PRIORITY: Record<SemanticSourceRole, number> = {
  primary_notes: 0,
  primary_reference: 1,
  supplementary_reference: 2,
  question_template: 3,
};

export function getRolePriority(role?: SourcePackRole | string | null): number {
  const canonical = canonicalizeSourceRole(role);
  return SOURCE_ROLE_PRIORITY[canonical] ?? 99;
}

export function sortSourcesByRolePriority<
  T extends { role?: SourcePackRole | string | null; order?: number; orderIndex?: number },
>(sources: readonly T[] | T[]): T[] {
  return [...sources].sort((a, b) => {
    const pA = getRolePriority(a.role);
    const pB = getRolePriority(b.role);
    if (pA !== pB) return pA - pB;
    const ordA = a.order ?? a.orderIndex ?? 0;
    const ordB = b.order ?? b.orderIndex ?? 0;
    return ordA - ordB;
  });
}

export function sortChunksByRolePriority<T extends object>(
  chunks: readonly T[] | T[],
): T[] {
  return [...chunks].sort((a, b) => {
    const roleA = "role" in a ? (a as { role?: unknown }).role : undefined;
    const roleB = "role" in b ? (b as { role?: unknown }).role : undefined;
    const seqA =
      "sequence" in a && typeof (a as { sequence?: unknown }).sequence === "number"
        ? (a as { sequence: number }).sequence
        : 0;
    const seqB =
      "sequence" in b && typeof (b as { sequence?: unknown }).sequence === "number"
        ? (b as { sequence: number }).sequence
        : 0;
    const pA = getRolePriority(typeof roleA === "string" ? roleA : undefined);
    const pB = getRolePriority(typeof roleB === "string" ? roleB : undefined);
    if (pA !== pB) return pA - pB;
    return seqA - seqB;
  });
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
 * - Exactly one primary document (primary_notes). If none explicitly marked, the first document becomes primary_notes.
 * - At most one question_template document.
 * - At most one primary_reference document.
 * - Any number of supplementary_reference documents up to max limit.
 * - Primary is normalized to orderIndex = 0.
 * - Remaining documents are assigned orderIndex = 1 .. N.
 */
export function normalizeAndValidateSourcePackDocuments(
  docs: SourcePackDocumentInput[],
): NormalizedSourcePackDocument[] {
  if (!Array.isArray(docs) || docs.length < MIN_SOURCE_PACK_DOCUMENTS) {
    throw new DomainError("bad_request", "A source pack must contain at least 1 document");
  }

  if (docs.length > MAX_SOURCE_PACK_DOCUMENTS) {
    throw new DomainError(
      "bad_request",
      `A source pack cannot contain more than ${MAX_SOURCE_PACK_DOCUMENTS} documents`,
    );
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
