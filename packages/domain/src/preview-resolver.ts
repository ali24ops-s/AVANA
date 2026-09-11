/**
 * Preview Resolver Domain Primitives.
 *
 * Implements pure deterministic hash-based selection and metadata types
 * for Free Previews in AVANA Library.
 *
 * Guarantees:
 * - 100% deterministic (consistent across refreshes, sessions, server restarts).
 * - Only active/published items considered.
 * - 0 items -> no preview.
 * - 1 item -> that single item is selected.
 * - >1 items -> stable FNV-1a hash based on parentId + resourceType.
 * - Fallback: if an item is soft-deleted or unpublished, the sorted active list
 *   shifts deterministically to a new valid preview.
 */

export interface ContentPreviewMetadata {
  hasPreview: boolean;
  previewLessonId?: string | null;
  previewQuizId?: string | null;
  previewFlashcardCount?: number;
  flashcardLimit?: number;
  lesson?: {
    id: string;
    title?: string;
    estimatedMinutes?: number | null;
    available?: boolean;
  };
  quiz?: {
    id: string;
    title?: string;
    questionCount?: number;
    available?: boolean;
  };
  flashcards?: {
    available: boolean;
    previewCount: number;
  };
}

/**
 * 32-bit FNV-1a non-cryptographic hash for stable deterministic indexing.
 */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type DeterministicSelectionStrategy = "first" | "hash";

/**
 * Selects exactly one item deterministically from a list of sorted active candidates.
 *
 * @param parentId - Immutable ID of the parent container (e.g. moduleId, courseId, contentPackId)
 * @param resourceType - Type of resource (e.g. 'lesson', 'quiz', 'flashcard')
 * @param sortedActiveItems - Pre-filtered active, published items sorted consistently
 * @param strategy - "first" (default, educational canonical preview) or "hash" (stable FNV-1a distribution)
 */
export function selectDeterministicItem<T extends { id: string }>(
  parentId: string,
  resourceType: string,
  sortedActiveItems: T[],
  strategy: DeterministicSelectionStrategy = "first",
): T | undefined {
  if (!sortedActiveItems || sortedActiveItems.length === 0) {
    return undefined;
  }
  if (sortedActiveItems.length === 1 || strategy === "first") {
    return sortedActiveItems[0];
  }
  const seed = `${parentId}:${resourceType}`;
  const index = fnv1a32(seed) % sortedActiveItems.length;
  return sortedActiveItems[index];
}

/**
 * Selects a deterministic subset (e.g. 5 to 10 items) from a list of sorted candidates.
 *
 * @param parentId - Immutable ID of the parent container
 * @param resourceType - Type of resource
 * @param sortedActiveItems - Pre-filtered active items sorted consistently
 * @param limit - Maximum number of items in the subset
 * @param strategy - "first" (default) or "hash"
 */
export function selectDeterministicSubset<T extends { id: string }>(
  parentId: string,
  resourceType: string,
  sortedActiveItems: T[],
  limit: number = 5,
  strategy: DeterministicSelectionStrategy = "first",
): T[] {
  if (!sortedActiveItems || sortedActiveItems.length === 0 || limit <= 0) {
    return [];
  }
  if (sortedActiveItems.length <= limit) {
    return [...sortedActiveItems];
  }
  if (strategy === "first") {
    return sortedActiveItems.slice(0, limit);
  }

  const seed = `${parentId}:${resourceType}`;
  const startIndex = fnv1a32(seed) % sortedActiveItems.length;
  const result: T[] = [];

  for (let i = 0; i < limit; i++) {
    const idx = (startIndex + i) % sortedActiveItems.length;
    result.push(sortedActiveItems[idx]);
  }

  return result;
}

/**
 * Shuffles an array deterministically given a seed string using Mulberry32 PRNG.
 * Produces stable pseudo-random permutations for the lifetime of a preview session.
 */
export function seededRandomShuffle<T>(items: readonly T[], seedStr: string): T[] {
  if (!items || items.length <= 1) return items ? [...items] : [];
  let s = fnv1a32(seedStr);
  const nextRand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}
