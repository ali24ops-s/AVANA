/**
 * AVANA Content Title Invariants & Canonical Resolvers.
 *
 * Enforces the architectural boundary:
 * - Original File Identity (documents.original_name) is strictly for File/Document records.
 * - Generated Content Identity (lessons, modules, packs, quizzes, flashcards, summaries)
 *   MUST have its own educational title and NEVER display original filenames.
 */

const FILE_EXTENSION_REGEX = /\.(pdf|docx?|pptx?|xlsx?|txt|csv|bin|mp3|wav|png|jpe?g|webp)$/i;
const NUMERIC_MODULE_REGEX = /^(فصل\s*[:\-–—]?\s*)?(\d+(\.\d+)?|[a-zA-Z0-9_\-]+(\.(pdf|docx?|pptx?|txt|bin))?)$/i;

/**
 * Checks whether a given string is derived from or represents a filename,
 * a raw numeric index, or an invalid file fallback.
 */
export function isFilenameLike(title: string | null | undefined): boolean {
  if (!title || typeof title !== "string") return true;
  const trimmed = title.trim();
  if (trimmed.length === 0) return true;

  // Has file extension or matches numeric/filename pattern
  if (FILE_EXTENSION_REGEX.test(trimmed) || NUMERIC_MODULE_REGEX.test(trimmed)) return true;

  // Clean "فصل:" prefix to inspect the core content
  const core = trimmed.replace(/^فصل\s*[:\-–—]?\s*/i, "").trim();
  if (core.length === 0) return true;

  // Core is purely numeric (e.g. "24", "31.2", "فصل: 24")
  if (/^\d+(\.\d+)?$/.test(core)) return true;

  // Core is a raw filename without extension (e.g. "pharma_lecture_03_v2", "lecture_slides")
  if (/^[a-zA-Z0-9_\-\.]+$/.test(core) && (core.includes("_") || core.includes("-")) && !core.includes(" ")) {
    return true;
  }

  // Placeholder generic fallbacks that mask missing content
  const genericPlaceholders = [
    "سرفصل آموزشی استخراج‌شده",
    "سرفصل آموزشی",
    "محتوای استخراج‌شده",
    "فایل آپلود شده",
    "سند آپلود شده",
    "نامشخص",
    "undefined",
    "null",
    "upload",
    "document",
  ];
  if (genericPlaceholders.includes(core) || genericPlaceholders.includes(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks whether a title is suspicious (either filename-like, too short, or corrupted).
 */
export function isSuspiciousTitle(title: string | null | undefined): boolean {
  if (isFilenameLike(title)) return true;
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
 * Ensures a module title starts cleanly with "فصل: ".
 */
export function formatModuleTitle(
  title: string | null | undefined,
  fallback = "فصل: مبحث آموزشی جامع",
): string {
  if (!title || isFilenameLike(title)) {
    return fallback;
  }
  const cleaned = cleanEducationalTitle(title, "");
  if (!cleaned) return fallback;

  if (/^فصل\s+[\d\u06F0-\u06F9]+(\.\d+)?\s*:\s*/i.test(cleaned)) {
    return cleaned.replace(/^فصل\s+([\d\u06F0-\u06F9]+(\.\d+)?)\s*:\s*/i, "فصل $1: ");
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
