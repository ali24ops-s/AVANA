/**
 * Utility functions for formatting and sanitizing exam and quiz display titles.
 * Prevents internal UUIDs and database entity IDs from ever leaking into the UI.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERNAL_ID_PREFIX_REGEX = /^(course|mod|les|quiz|q|doc|chk|user|org|att|attempt)-[0-9a-z_-]+$/i;

/**
 * Checks if a value is a standard UUID or internal database identifier.
 *
 * Strict check: Does NOT match regular English text, clinical terms, numbers, or punctuation
 * (e.g. "HPA Axis", "جلسه ۱: مبانی", "Pharmacokinetics" are safely recognized as titles, NOT IDs).
 */
export function isInternalIdentifier(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  if (UUID_REGEX.test(trimmed)) {
    return true;
  }

  if (INTERNAL_ID_PREFIX_REGEX.test(trimmed)) {
    return true;
  }

  if (trimmed === "course-unassigned" || trimmed === "mod-unassigned") {
    return true;
  }

  return false;
}

/**
 * Extracts clean, human-readable titles from various raw input structures:
 * - Polluted comma-separated string (e.g. "UUID, Title, UUID, Title")
 * - Array of strings [UUID, Title, ...]
 * - Array of tuples [[UUID, Title], ...]
 * - Array of objects [{ id: UUID, title: Title }, ...]
 * - Single object { id: UUID, title: Title }
 *
 * Preserves the original selection/taxonomy order and eliminates duplicates.
 */
export function extractCleanTitles(input: unknown): string[] {
  if (input === null || input === undefined) {
    return [];
  }

  const rawTokens: string[] = [];

  const processItem = (item: unknown) => {
    if (item === null || item === undefined) return;

    if (typeof item === "string") {
      // Split on English comma or Persian comma if present
      if (item.includes(",") || item.includes("،")) {
        const parts = item.split(/[,،]/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.length > 0) {
            rawTokens.push(trimmed);
          }
        }
      } else {
        const trimmed = item.trim();
        if (trimmed.length > 0) {
          rawTokens.push(trimmed);
        }
      }
    } else if (Array.isArray(item)) {
      for (const subItem of item) {
        processItem(subItem);
      }
    } else if (typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const candidate =
        obj.title ??
        obj.lessonTitle ??
        obj.moduleTitle ??
        obj.courseTitle ??
        obj.name ??
        obj.label;
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        rawTokens.push(candidate.trim());
      }
    }
  };

  processItem(input);

  // Filter out internal IDs and deduplicate preserving order
  const seen = new Set<string>();
  const cleanTitles: string[] = [];

  for (const token of rawTokens) {
    if (!isInternalIdentifier(token) && !seen.has(token)) {
      seen.add(token);
      cleanTitles.push(token);
    }
  }

  return cleanTitles;
}

/**
 * Formats a clean exam display title from any input.
 * Joins multiple clean titles with Persian comma ("، ").
 * Falls back to the provided fallback or "آزمون جامع" if no clean titles exist.
 */
export function formatExamDisplayTitle(input: unknown, fallback = "آزمون جامع"): string {
  const cleanTitles = extractCleanTitles(input);
  if (cleanTitles.length > 0) {
    return cleanTitles.join("، ");
  }
  return fallback;
}
