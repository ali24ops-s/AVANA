/**
 * Domain primitives and rules for SEO-friendly Course URLs.
 *
 * Rules:
 * - Lowercase alphanumeric English characters separated by single hyphens.
 * - Leading and trailing hyphens stripped.
 * - Reserved words guarded.
 * - Deterministic fallback for Persian course titles without English equivalents.
 * - Central `getCourseUrl` helper for UI/SEO link generation.
 */

export const RESERVED_COURSE_SLUGS = new Set<string>([
  "courses",
  "course",
  "admin",
  "api",
  "v1",
  "new",
  "create",
  "edit",
  "manage",
  "delete",
  "popular",
  "library",
  "learn",
  "flashcards",
  "quizzes",
  "preview",
  "analytics",
  "documents",
  "settings",
  "explore",
  "search",
  "share",
  "auth",
  "login",
  "register",
]);

/**
 * Common known Persian academic course names mapped to clean English slugs.
 */
export const KNOWN_COURSE_SLUGS: Record<string, string> = {
  "شیمی دارویی ۱": "medicinal-chemistry-1",
  "شیمی دارویی ۲": "medicinal-chemistry-2",
  "شیمی دارویی ۳": "medicinal-chemistry-3",
  "شیمی دارویی": "medicinal-chemistry",
  "فارماسیوتیکس ۱": "pharmaceutics-1",
  "فارماسیوتیکس ۲": "pharmaceutics-2",
  "فارماسیوتیکس ۳": "pharmaceutics-3",
  "فارماسیوتیکس ۴": "pharmaceutics-4",
  "فارماسیوتیکس ۵": "pharmaceutics-5",
  "فارماسیوتیکس": "pharmaceutics",
  "فارماکولوژی ۱": "pharmacology-1",
  "فارماکولوژی ۲": "pharmacology-2",
  "فارماکولوژی ۳": "pharmacology-3",
  "فارماکولوژی": "pharmacology",
  "بافت شناسی": "histology",
  "بافت‌شناسی": "histology",
  "بیولوژی": "biology",
  "سم شناسی": "toxicology",
  "سم‌شناسی": "toxicology",
  "فیزیولوژی": "physiology",
  "فیزیولوژی ۱": "physiology-1",
  "فیزیولوژی ۲": "physiology-2",
  "بیوشیمی": "biochemistry",
  "آناتومی": "anatomy",
  "آناتومی قلب": "anatomy-heart",
  "ایمونولوژی": "immunology",
  "میکروب شناسی": "microbiology",
  "میکروب‌شناسی": "microbiology",
  "تست نمودار": "charts-test",
  "تست واکنش‌های شیمیایی": "chemistry-reactions-test",
};

/**
 * Normalizes user-supplied or system-generated text into a URL-safe lowercase slug.
 */
export function normalizeCourseSlug(text: string): string {
  if (!text) return "";

  // 1. Convert Persian/Arabic digits to Latin digits
  const normalizedDigits = text
    .replace(/[۰٠]/g, "0")
    .replace(/[۱١]/g, "1")
    .replace(/[۲٢]/g, "2")
    .replace(/[۳٣]/g, "3")
    .replace(/[۴٤]/g, "4")
    .replace(/[۵٥]/g, "5")
    .replace(/[۶٦]/g, "6")
    .replace(/[۷٧]/g, "7")
    .replace(/[۸٨]/g, "8")
    .replace(/[۹٩]/g, "9");

  return normalizedDigits
    .toLowerCase()
    .trim()
    .replace(/\u200C|\u200B|\u200D|\uFEFF/g, " ")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates whether a candidate slug is valid and non-reserved.
 */
export function isValidCourseSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.length < 2 || slug.length > 100) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  return !RESERVED_COURSE_SLUGS.has(slug);
}

/**
 * Generates a stable and deterministic default slug for a course.
 */
export function generateDefaultCourseSlug(course: {
  id: string;
  name?: string | null;
  subject?: string | null;
}): string {
  const name = course.name?.trim() ?? "";

  // 1. Direct match with known curriculum courses
  if (name && KNOWN_COURSE_SLUGS[name]) {
    return KNOWN_COURSE_SLUGS[name];
  }

  // Check with zero-width non-joiners stripped or normalized
  const cleanName = name.replace(/\u200C|\u200B|\u200D|\uFEFF/g, " ").replace(/\s+/g, " ").trim();
  if (cleanName && KNOWN_COURSE_SLUGS[cleanName]) {
    return KNOWN_COURSE_SLUGS[cleanName];
  }

  // 2. If the name already contains Latin characters / numbers
  const slugFromName = normalizeCourseSlug(name);
  if (slugFromName && slugFromName.length >= 2 && !RESERVED_COURSE_SLUGS.has(slugFromName)) {
    return slugFromName;
  }

  // 3. Try subject if present
  const subject = course.subject?.trim() ?? "";
  if (subject && KNOWN_COURSE_SLUGS[subject]) {
    const baseSlug = KNOWN_COURSE_SLUGS[subject];
    const shortId = course.id.replace(/-/g, "").slice(0, 4).toLowerCase();
    return `${baseSlug}-${shortId}`;
  }

  const slugFromSubject = normalizeCourseSlug(subject);
  if (slugFromSubject && slugFromSubject.length >= 2 && !RESERVED_COURSE_SLUGS.has(slugFromSubject)) {
    const shortId = course.id.replace(/-/g, "").slice(0, 4).toLowerCase();
    return `${slugFromSubject}-${shortId}`;
  }

  // 4. Stable deterministic fallback
  const shortId = course.id.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `course-${shortId}`;
}

/**
 * Canonical helper for constructing public course detail / learning URLs.
 * Always prefers the SEO slug when available, with a clean fallback to the course ID.
 */
export function getCourseUrl(course: {
  id: string;
  slug?: string | null;
}): string {
  const identifier = course.slug && course.slug.trim() ? course.slug.trim() : course.id;
  return `/courses/${encodeURIComponent(identifier)}`;
}
