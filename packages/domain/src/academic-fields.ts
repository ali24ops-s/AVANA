/**
 * Academic Fields (Majors/Disciplines) Taxonomy and Relevance Engine.
 *
 * Provides a canonical, type-safe source of truth for student academic fields
 * and course relevance ranking without hard-filtering.
 */

export const ACADEMIC_FIELDS = [
  { id: "pharmacy", label: "داروسازی", slug: "pharmacy" },
  { id: "medicine", label: "پزشکی", slug: "medicine" },
  { id: "dentistry", label: "دندانپزشکی", slug: "dentistry" },
  { id: "nursing", label: "پرستاری", slug: "nursing" },
  { id: "medical_laboratory", label: "علوم آزمایشگاهی", slug: "medical_laboratory" },
  { id: "operating_room", label: "اتاق عمل", slug: "operating_room" },
  { id: "anesthesia", label: "هوشبری", slug: "anesthesia" },
  { id: "midwifery", label: "مامایی", slug: "midwifery" },
  { id: "physiotherapy", label: "فیزیوتراپی", slug: "physiotherapy" },
  { id: "occupational_therapy", label: "کاردرمانی", slug: "occupational_therapy" },
  { id: "nutrition", label: "تغذیه", slug: "nutrition" },
  { id: "public_health", label: "بهداشت", slug: "public_health" },
  { id: "other", label: "سایر", slug: "other" },
  { id: "undecided", label: "هنوز انتخاب نکرده‌ام", slug: "undecided" },
] as const;

export type AcademicField = (typeof ACADEMIC_FIELDS)[number];
export type AcademicFieldId = AcademicField["id"];

const VALID_FIELD_SET = new Set<string>(ACADEMIC_FIELDS.map((f) => f.id));

/**
 * Type guard to check if a value is a valid AcademicFieldId.
 */
export function isValidAcademicField(value: unknown): value is AcademicFieldId {
  if (typeof value !== "string") return false;
  return VALID_FIELD_SET.has(value.trim());
}

/**
 * Returns the Persian label for a given academic field id.
 */
export function getAcademicFieldLabel(id: unknown): string {
  if (typeof id !== "string") return "نامشخص";
  const found = ACADEMIC_FIELDS.find((f) => f.id === id.trim());
  return found ? found.label : "سایر";
}

/**
 * Normalizes an array of academic fields, removing invalid values and duplicates.
 */
export function normalizeAcademicFields(fields: unknown): AcademicFieldId[] {
  if (!Array.isArray(fields)) return [];
  const valid = new Set<AcademicFieldId>();
  for (const item of fields) {
    if (typeof item === "string" && isValidAcademicField(item)) {
      valid.add(item);
    }
  }
  return Array.from(valid);
}

/**
 * Checks if a major is a specific recognized academic discipline (not other/undecided).
 */
export function isSpecificAcademicField(major?: AcademicFieldId | null): boolean {
  if (!major) return false;
  return major !== "other" && major !== "undecided" && isValidAcademicField(major);
}

export type RelevanceTier = "direct_match" | "general" | "unrelated";

/**
 * Computes course relevance tier and numeric score for a given student's major.
 *
 * Scoring logic:
 * - Direct Match: course specifically includes student's major (Score: 100)
 * - General/Shared: course has no target fields or student major is undecided/other/null (Score: 50)
 * - Unrelated: course has specific fields, but none match the student's major (Score: 10)
 */
export function scoreCourseRelevance(
  courseTargetFields?: readonly AcademicFieldId[] | readonly string[] | null,
  studentMajor?: AcademicFieldId | string | null,
): { score: number; tier: RelevanceTier } {
  // If student has no specific major (null, undefined, 'undecided', or 'other'), treat all courses as general/neutral
  if (!studentMajor || !isSpecificAcademicField(studentMajor as AcademicFieldId)) {
    return { score: 50, tier: "general" };
  }

  const normalizedFields = normalizeAcademicFields(courseTargetFields);

  // If course has no target academic fields defined, it is a universal/general course
  if (normalizedFields.length === 0) {
    return { score: 50, tier: "general" };
  }

  // Check direct match
  if (normalizedFields.includes(studentMajor as AcademicFieldId)) {
    return { score: 100, tier: "direct_match" };
  }

  // Specific course targeting other fields
  return { score: 10, tier: "unrelated" };
}
