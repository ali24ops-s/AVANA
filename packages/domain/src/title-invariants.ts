/**
 * AVANA Content Title Invariants & Canonical Resolvers.
 *
 * Enforces the architectural boundary:
 * - Original File Identity (documents.original_name) is strictly for File/Document records.
 * - Generated Content Identity (lessons, modules, packs, quizzes, flashcards, summaries)
 *   MUST have its own educational title and NEVER display original filenames.
 */

const FILE_EXTENSION_REGEX = /\.(pdf|docx?|pptx?|xlsx?|txt|csv|bin|mp3|wav|png|jpe?g|webp)(\b|[\s),;:«»"']|$)/i;
const EMBEDDED_FILE_REGEX = /[a-zA-Z0-9_\-\u0600-\u06FF]*\.(pdf|docx?|pptx?|xlsx?|txt|csv|bin|mp3|wav|png|jpe?g|webp)/i;
const NUMERIC_MODULE_REGEX = /^(فصل\s*[:\-–—]?\s*)?(\d+(\.\d+)?|[a-zA-Z0-9_-]+(\.(pdf|docx?|pptx?|txt|bin))?)$/i;
const EXTRACTION_PLACEHOLDER_REGEX = /(استخراج[\s‌]*(شده|شده‌|شده\s*از|از)|مباحث و جلسات آموزشی استخراج|سرفصل آموزشی استخراج|محتوای آموزشی استخراج|محتوای استخراج)/i;
const GENERIC_DESCRIPTION_REGEX = /^(مباحث و جلسات آموزشی|سرفصل[\s‌]*آموزشی|محتوای[\s‌]*آموزشی|فصل[\s‌]*آموزشی)(\s*جامع)?$/i;

const GENERIC_PLACEHOLDERS = [
  "مباحث و جلسات آموزشی استخراج‌شده",
  "مباحث و جلسات آموزشی استخراج شده",
  "مباحث و جلسات آموزشی استخراجشده",
  "مباحث و جلسات آموزشی",
  "مباحث و جلسات آموزشی جامع",
  "سرفصل آموزشی استخراج‌شده",
  "سرفصل آموزشی استخراج شده",
  "سرفصل آموزشی استخراجشده",
  "سرفصل آموزشی",
  "سرفصل آموزشی جامع",
  "فصل آموزشی جامع",
  "فصل آموزشی",
  "محتوای آموزشی استخراج‌شده",
  "محتوای استخراج‌شده",
  "محتوای استخراج شده",
  "محتوای استخراجشده",
  "محتوای آموزشی جامع",
  "فایل آپلود شده",
  "سند آپلود شده",
  "نامشخص",
  "undefined",
  "null",
  "upload",
  "document",
];

/**
 * Checks whether a given string is derived from or represents a filename,
 * a raw numeric index, or an invalid file fallback.
 */
export function isFilenameLike(title: string | null | undefined): boolean {
  if (!title || typeof title !== "string") return true;
  const trimmed = title.trim();
  if (trimmed.length === 0) return true;

  // Has file extension or matches numeric/filename pattern or extraction placeholder
  if (
    FILE_EXTENSION_REGEX.test(trimmed) ||
    EMBEDDED_FILE_REGEX.test(trimmed) ||
    NUMERIC_MODULE_REGEX.test(trimmed) ||
    EXTRACTION_PLACEHOLDER_REGEX.test(trimmed)
  ) {
    return true;
  }

  // Clean "فصل:" prefix to inspect the core content
  const core = trimmed.replace(/^فصل\s*[:\-–—]?\s*/i, "").trim();
  if (core.length === 0) return true;

  // Core is purely numeric (e.g. "24", "31.2", "فصل: 24")
  if (/^\d+(\.\d+)?$/.test(core)) return true;

  // Core is a raw filename without extension (e.g. "pharma_lecture_03_v2", "lecture_slides")
  if (/^[a-zA-Z0-9_.-]+$/.test(core) && (core.includes("_") || core.includes("-")) && !core.includes(" ")) {
    return true;
  }

  // Placeholder generic fallbacks that mask missing content
  if (GENERIC_PLACEHOLDERS.includes(core) || GENERIC_PLACEHOLDERS.includes(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Regex matching content-type prefixes that mistakenly leak into module titles.
 * Examples: "فلش‌کارت‌های آموزشی:", "مجموعه فلش‌کارت آموزشی:", "آزمون ارزیابی آموخته‌ها:", "خلاصه مروری:".
 */
export const CONTENT_TYPE_PREFIX_REGEX =
  /^(فصل\s*[:\-–—]?\s*)?(فلش[\s‌]?کارت[\s‌]?(های|هاي)?(\s*آموزشی)?|مجموعه[\s‌]?([0-9\u06F0-\u06F9]+|چند)?[\s‌]?فلش[\s‌]?کارت(\s*آموزشی)?|آزمون\s*(ارزیابی\s*آموخته‌ها|ارزیابی|سنجش|جامع)?|خلاصه\s*(مروری|جامع))\s*[:\-–—]?\s*/i;

/**
 * Checks whether a module title is polluted with generated content type prefixes
 * such as "فلش‌کارت‌های آموزشی:", "آزمون ارزیابی آموخته‌ها:", or "خلاصه مروری:".
 */
export function isPollutedModuleTitle(title: string | null | undefined): boolean {
  if (!title || typeof title !== "string") return true;
  const trimmed = title.trim();
  if (trimmed.length === 0) return true;
  if (CONTENT_TYPE_PREFIX_REGEX.test(trimmed)) return true;
  const core = trimmed.replace(/^فصل\s*[:\-–—]?\s*/i, "").trim();
  if (CONTENT_TYPE_PREFIX_REGEX.test(core)) return true;
  if (/فلش[\s‌]?کارت[\s‌]?(های|هاي)?\s*آموزشی/i.test(trimmed)) return true;
  return false;
}

/**
 * Strips content-type prefixes from a title (e.g. "فلش‌کارت‌های آموزشی:", "آزمون ارزیابی:").
 */
export function stripContentTypePrefix(title: string | null | undefined): string {
  if (!title || typeof title !== "string") return "";
  let cleaned = title.trim();
  while (CONTENT_TYPE_PREFIX_REGEX.test(cleaned)) {
    const next = cleaned.replace(CONTENT_TYPE_PREFIX_REGEX, "").trim();
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned;
}

/**
 * Checks whether a title is suspicious (either filename-like, too short, corrupted, or polluted with content-type prefixes).
 */
export function isSuspiciousTitle(title: string | null | undefined): boolean {
  if (isFilenameLike(title)) return true;
  if (isPollutedModuleTitle(title)) return true;
  const trimmed = (title ?? "").trim();
  if (trimmed.length < 3) return true;
  // If stripped of "فصل:" it's less than 2 characters
  const core = trimmed.replace(/^فصل\s*[:\-–—]?\s*/i, "").trim();
  if (core.length < 2) return true;
  return false;
}

/**
 * Cleans an educational title by stripping unwanted prefixes, quotation marks,
 * or accidental filename leaks.
 */
export function cleanEducationalTitle(
  title: string | null | undefined,
  fallback = "مبحث آموزشی جامع",
): string {
  if (!title || isFilenameLike(title)) {
    return fallback;
  }
  let cleaned = title.trim();

  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["'«“]+|["'»”]+$/g, "").trim();

  // Remove duplicate "فصل:" if present
  cleaned = cleaned.replace(/^فصل\s*[:\-–—]?\s*(فصل\s*[:\-–—]?\s*)+/i, "فصل: ").trim();

  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Ensures a module title starts cleanly with "فصل: " and NEVER contains content-type prefixes.
 */
export function formatModuleTitle(
  title: string | null | undefined,
  fallback = "فصل: مبحث آموزشی جامع",
): string {
  if (!title || isFilenameLike(title)) {
    return fallback;
  }
  let cleaned = cleanEducationalTitle(title, "");
  if (!cleaned) return fallback;

  // Invariant: Strip any accidental content-type prefix (e.g. "فلش‌کارت‌های آموزشی:")
  cleaned = stripContentTypePrefix(cleaned);
  if (!cleaned || cleaned.length < 2) return fallback;

  if (/^فصل\s+[\d\u06F0-\u06F9]+(\.\d+)?\s*[:\-–—]?\s*/i.test(cleaned)) {
    return cleaned.replace(/^فصل\s+([\d\u06F0-\u06F9]+(\.\d+)?)\s*[:\-–—]?\s*/i, "فصل $1: ");
  }

  if (
    /^فصل\s+(اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|سیزدهم|چهاردهم|پانزدهم|شانزدهم|هفدهم|هجدهم|نوزدهم|بیستم)(\s*[:\-–—]\s*|\s+)/i.test(
      cleaned,
    )
  ) {
    return cleaned;
  }

  if (cleaned.startsWith("فصل:") || cleaned.startsWith("فصل :")) {
    return cleaned.replace(/^فصل\s*:\s*/, "فصل: ");
  }
  if (cleaned.startsWith("فصل ")) {
    return cleaned.replace(/^فصل\s+/, "فصل: ");
  }
  return `فصل: ${cleaned}`;
}

export interface ResolveTitleOptions {
  type?: "lesson" | "flashcard" | "quiz" | "review_summary" | string;
  payload?: Record<string, unknown> | null;
  moduleTitle?: string | null;
  defaultSubject?: string | null;
}

/**
 * Canonical title resolver for any Generated Content item.
 * Guarantees that the returned title is strictly educational and never a filename.
 */
export function resolveCanonicalContentTitle(options: ResolveTitleOptions): string {
  const { type = "lesson", payload = {}, moduleTitle } = options;
  const p = payload ?? {};

  // 1. Candidate from payload
  const rawPayloadTitle = typeof p.title === "string" ? p.title : undefined;
  const rawModuleTitle =
    (typeof p.moduleTitle === "string" ? p.moduleTitle : undefined) ||
    (moduleTitle && !isFilenameLike(moduleTitle) ? moduleTitle : undefined);

  const cleanModTitle = rawModuleTitle && !isFilenameLike(rawModuleTitle)
    ? cleanEducationalTitle(rawModuleTitle.replace(/^فصل\s*[:\-–—]?\s*/i, ""))
    : undefined;

  switch (type) {
    case "lesson": {
      if (cleanModTitle) {
        return cleanModTitle;
      }
      if (rawPayloadTitle && !isFilenameLike(rawPayloadTitle)) {
        return cleanEducationalTitle(rawPayloadTitle);
      }
      // Check sessions in payload
      if (Array.isArray(p.sessions) && p.sessions.length > 0) {
        const firstSession = p.sessions[0] as { title?: string };
        if (firstSession?.title && !isFilenameLike(firstSession.title)) {
          return cleanEducationalTitle(firstSession.title);
        }
      }
      return "درسنامه آموزشی جامع";
    }

    case "flashcard": {
      if (rawPayloadTitle && !isFilenameLike(rawPayloadTitle)) {
        const cleaned = cleanEducationalTitle(rawPayloadTitle);
        return cleaned.startsWith("فلش‌کارت") || cleaned.startsWith("مجموعه")
          ? cleaned
          : `فلش‌کارت‌های آموزشی: ${cleaned}`;
      }
      if (cleanModTitle) {
        return `فلش‌کارت‌های آموزشی: ${cleanModTitle}`;
      }
      const cardCount = Array.isArray(p.cards) ? p.cards.length : 0;
      return cardCount > 0
        ? `مجموعه ${cardCount} فلش‌کارت آموزشی`
        : "فلش‌کارت‌های آموزشی";
    }

    case "quiz": {
      if (rawPayloadTitle && !isFilenameLike(rawPayloadTitle)) {
        const cleaned = cleanEducationalTitle(rawPayloadTitle);
        return cleaned.startsWith("آزمون")
          ? cleaned
          : `آزمون ارزیابی آموخته‌ها: ${cleaned}`;
      }
      if (cleanModTitle) {
        return `آزمون ارزیابی آموخته‌ها: ${cleanModTitle}`;
      }
      return "آزمون ارزیابی آموخته‌ها";
    }

    case "review_summary": {
      if (rawPayloadTitle && !isFilenameLike(rawPayloadTitle)) {
        return cleanEducationalTitle(rawPayloadTitle);
      }
      if (cleanModTitle) {
        return `خلاصه مروری: ${cleanModTitle}`;
      }
      return "خلاصه جامع و مروری مبحث";
    }

    default: {
      if (rawPayloadTitle && !isFilenameLike(rawPayloadTitle)) {
        return cleanEducationalTitle(rawPayloadTitle);
      }
      if (cleanModTitle) {
        return cleanModTitle;
      }
      return "محتوای آموزشی";
    }
  }
}

/**
 * Checks whether a given description string is derived from a filename or contains
 * automated extraction placeholder text (e.g. "مباحث و جلسات آموزشی استخراجشده از 32.pdf").
 */
export function isFilenameOrPlaceholderDescription(
  desc: string | null | undefined,
): boolean {
  if (!desc || typeof desc !== "string") return true;
  const trimmed = desc.trim();
  if (trimmed.length === 0) return true;
  if (isFilenameLike(trimmed)) return true;
  if (EMBEDDED_FILE_REGEX.test(trimmed)) return true;
  if (EXTRACTION_PLACEHOLDER_REGEX.test(trimmed)) return true;
  if (GENERIC_DESCRIPTION_REGEX.test(trimmed)) return true;
  if (GENERIC_PLACEHOLDERS.includes(trimmed)) return true;
  return false;
}

/**
 * Cleans an educational description by returning a safe scholarly fallback if
 * the description is empty, filename-like, or contains extraction placeholder text.
 */
export function cleanEducationalDescription(
  desc: string | null | undefined,
  fallback: string | null | undefined = "بسته آموزشی جامع فصل شامل درسنامه ساختاریافته، خلاصه نکات کلیدی، فلش‌کارت‌های مرور فعال و آزمون تستی.",
): string | null {
  if (isFilenameOrPlaceholderDescription(desc)) {
    return fallback ?? null;
  }
  return desc!.trim();
}

/**
 * Strips the static "آزمون ارزیابی آموخته‌ها:" prefix from a quiz title,
 * leaving only the clean chapter or topic title.
 * Examples:
 * - "آزمون ارزیابی آموخته‌ها: فیزیولوژی قلب" -> "فیزیولوژی قلب"
 * - "آزمون ارزیابی آموختهها: فیزیولوژی قلب" -> "فیزیولوژی قلب"
 */
export function cleanQuizChapterTitle(title: string | null | undefined): string {
  if (!title || typeof title !== "string") return "";
  const trimmed = title.trim();
  const cleaned = trimmed
    .replace(/^آزمون\s*ارزیابی\s*آموخته[\s‌]*ها\s*[:\-–—]?\s*/i, "")
    .trim();
  return cleaned.length > 0 ? cleaned : trimmed;
}

/**
 * Single source of truth for PDF filenames across Avana (Backend & Frontend).
 * Guarantees:
 * - Single source of truth for PDF filenames.
 * - Never duplicates prefixes or titles (e.g. "فصل - فصل اول", "فصل اول - فصل اول").
 * - Sanitizes illegal filesystem characters.
 * - Ensures clean ".pdf" extension.
 */
export function buildPdfFilename(
  type: "chapter" | "lesson" | "review_summary",
  rawTitle: string | null | undefined,
  fallbackId?: string | null,
): string {
  const safeFallbackId = fallbackId
    ? fallbackId.replace(/[^\w-]/g, "_")
    : "document";

  const defaultFallback =
    type === "chapter"
      ? `chapter-${safeFallbackId}`
      : type === "lesson"
      ? `lesson-${safeFallbackId}`
      : `review-summary-${safeFallbackId}`;

  if (!rawTitle || typeof rawTitle !== "string") {
    return `${defaultFallback}.pdf`;
  }

  let cleaned = rawTitle.trim();
  if (cleaned.length === 0) {
    return `${defaultFallback}.pdf`;
  }

  // Remove existing .pdf extension if user/input included it
  cleaned = cleaned.replace(/\.pdf$/i, "").trim();

  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["'«“]+|["'»”]+$/g, "").trim();

  // Deduplicate exact duplicated segments separated by hyphen, en-dash, em-dash, or colon
  // Example: "فصل اول - فصل اول" -> "فصل اول"
  // Example: "فصل اول: فصل اول" -> "فصل اول"
  const exactDuplicateMatch = cleaned.match(/^(.+?)\s*[-–—:]\s*\1$/u);
  if (exactDuplicateMatch && exactDuplicateMatch[1]) {
    cleaned = exactDuplicateMatch[1].trim();
  }

  // Helper to sanitize illegal filesystem characters: replace / \ : * ? " < > | with dash
  const sanitizeChars = (str: string) => {
    let s = str
      .replace(/[/\\:*?"<>|]/g, " - ")
      .replace(/\s*[-–—]\s*/g, " - ")
      .replace(/\s+/g, " ")
      .trim();
    // Trim leading/trailing hyphens
    s = s.replace(/^(?:\s*[-–—]\s*)+|(?:\s*[-–—]\s*)+$/g, "").trim();
    return s;
  };

  // Type-specific deduplication and formatting
  if (type === "chapter") {
    // Deduplicate "فصل - فصل..." or "فصل: فصل..."
    cleaned = cleaned.replace(/^فصل\s*[-:–—]\s*فصل(?:\s|[:\-_–—]|$)/u, "فصل ").trim();
    // Deduplicate repeated ordinal patterns: e.g. "فصل اول - فصل اول ..."
    cleaned = cleaned.replace(
      /^(فصل\s*(?:[0-9\u06F0-\u06F9]+|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|سیزدهم|چهاردهم|پانزدهم|شانزدهم|هفدهم|هجدهم|نوزدهم|بیستم)?)\s*[-:–—]\s*\1(?:\s|[:\-_–—]|$)/u,
      "$1",
    ).trim();

    const safe = sanitizeChars(cleaned);

    // If the title already starts with "فصل", do not prepend redundant "فصل - "
    if (/^فصل(?:\s|[:\-_–—]|$)/u.test(safe)) {
      return `${safe}.pdf`;
    }
    return `فصل - ${safe}.pdf`;
  }

  if (type === "lesson") {
    cleaned = cleaned.replace(/^درسنامه\s*[-:–—]\s*درسنامه(?:\s|[:\-_–—]|$)/u, "درسنامه ").trim();
    const safe = sanitizeChars(cleaned);

    if (/^درسنامه(?:\s|[:\-_–—]|$)/u.test(safe)) {
      return `${safe}.pdf`;
    }
    return `درسنامه - ${safe}.pdf`;
  }

  if (type === "review_summary") {
    cleaned = cleaned.replace(/^خلاصه\s*مرور(?:ی)?\s*[-:–—]\s*خلاصه\s*مرور(?:ی)?(?:\s|[:\-_–—]|$)/u, "خلاصه مرور ").trim();
    const safe = sanitizeChars(cleaned);

    if (/^خلاصه\s*مرور/u.test(safe)) {
      return `${safe}.pdf`;
    }
    return `خلاصه مرور - ${safe}.pdf`;
  }

  const safe = sanitizeChars(cleaned);
  return `${safe}.pdf`;
}

export const PERSIAN_ORDINALS_MAP: Record<string, number> = {
  "اول": 1,
  "نخست": 1,
  "دوم": 2,
  "سوم": 3,
  "چهارم": 4,
  "پنجم": 5,
  "ششم": 6,
  "هفتم": 7,
  "هشتم": 8,
  "نهم": 9,
  "دهم": 10,
  "یازدهم": 11,
  "دوازدهم": 12,
  "سیزدهم": 13,
  "چهاردهم": 14,
  "پانزدهم": 15,
  "شانزدهم": 16,
  "هفدهم": 17,
  "هجدهم": 18,
  "نوزدهم": 19,
  "بیستم": 20,
};

/**
 * Extracts a candidate session number from a title if present.
 * Looks for patterns like "جلسه ۱", "جلسه 2", "جلسه اول", "جلسه دوم", "درس اول", etc.
 */
export function extractSessionNumberFromTitle(title: string | null | undefined): number | null {
  if (!title || typeof title !== "string") return null;
  const trimmed = title.trim();

  // 1. Matches "(جلسه|درس|قسمت|بخش) N" where N is digits (Persian or Latin)
  const digitMatch = trimmed.match(/^(?:جلسه|درس|قسمت|بخش)\s*([0-9\u06F0-\u06F9]+)/u);
  if (digitMatch && digitMatch[1]) {
    const latinDigits = digitMatch[1].replace(/[\u06F0-\u06F9]/g, (d) =>
      String(d.charCodeAt(0) - 0x06f0),
    );
    const num = parseInt(latinDigits, 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // 2. Matches "(جلسه|درس|قسمت|بخش) (اول|نخست|دوم...)"
  const ordinalMatch = trimmed.match(
    /^(?:جلسه|درس|قسمت|بخش)\s*(اول|نخست|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|سیزدهم|چهاردهم|پانزدهم|شانزدهم|هفدهم|هجدهم|نوزدهم|بیستم)(?:\s|[:\-_–—]|$)/u,
  );
  if (ordinalMatch && ordinalMatch[1]) {
    const num = PERSIAN_ORDINALS_MAP[ordinalMatch[1]];
    if (num) return num;
  }

  return null;
}

/**
 * Resolves session badge display numbers for an entire ordered list of sessions in a chapter.
 * Rules:
 * 1. Independent per chapter: numbering always starts fresh (from 1) for each chapter.
 * 2. If a session has a valid explicit session number or title-extracted number, it is considered.
 * 3. Crucial guarantee: extracted numbers must NEVER cause duplicate numbers or out-of-order jumps.
 *    If an extracted number conflicts or is duplicated, sequential index in chapter (idx + 1) is the definitive fallback.
 * 4. NEVER use global sortOrder (which could be 0-based or shared across chapters).
 */
export function resolveChapterSessionNumbers<
  T extends { title?: string | null; sessionNumber?: number | null }
>(sessions: T[]): number[] {
  const count = sessions.length;
  if (count === 0) return [];

  // Step 1: Collect candidates (explicit sessionNumber takes precedence over title extraction)
  const candidates: (number | null)[] = sessions.map((s) => {
    if (typeof s.sessionNumber === "number" && s.sessionNumber > 0 && Number.isInteger(s.sessionNumber)) {
      return s.sessionNumber;
    }
    return extractSessionNumberFromTitle(s.title);
  });

  // Step 2: Validate the candidates against duplicate, disordered, or out-of-range anomalies
  const nonNulls = candidates.filter((c): c is number => c !== null);
  const hasDuplicates = new Set(nonNulls).size !== nonNulls.length;

  let isMonotonic = true;
  for (let i = 1; i < nonNulls.length; i++) {
    if (nonNulls[i] <= nonNulls[i - 1]) {
      isMonotonic = false;
      break;
    }
  }

  // If first session has candidate > 1, or any candidate > count, or if duplicates/disordered:
  // Fall back to clean sequential 1..N order.
  const startsPastOne = candidates[0] !== null && candidates[0] > 1;
  const anyExceedsCount = nonNulls.some((n) => n > count);

  if (hasDuplicates || !isMonotonic || startsPastOne || anyExceedsCount) {
    return sessions.map((_, idx) => idx + 1);
  }

  // Step 3: Clean candidates resolved sequentially
  return sessions.map((_, idx) => candidates[idx] ?? idx + 1);
}

