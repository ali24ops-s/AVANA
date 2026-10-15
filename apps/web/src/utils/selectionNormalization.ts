/**
 * selectionNormalization.ts
 *
 * Core engine for unifying text selection boundary normalization (word snapping)
 * in AVANA study reading pages.
 *
 * Guarantees:
 * 1. Touching any part of a word expands selection to the full word boundary.
 * 2. Multi-word selections expand the first and last words while preserving
 *    all interior spaces, punctuation, and formatting.
 * 3. Untouched adjacent words are strictly excluded.
 * 4. Persian compound words with Zero-Width Non-Joiner (ZWNJ / \u200C) like «نیمه‌عمر»
 *    and «می‌شود» are handled as single coherent words.
 * 5. English terms, numbers (Persian, Arabic, Latin), and alphanumeric tokens (e.g. B12, mRNA)
 *    are fully supported.
 * 6. Selections containing only spaces or punctuation are not expanded.
 * 7. Canonical DOM text node traversal mirrors annotation restoration 1:1.
 */

// Unicode regex matching word characters:
// - \p{L}: Any Unicode letter (Persian, Arabic, Latin, Greek, etc.)
// - \p{N}: Any Unicode number (0-9, ۰-۹, ٠-٩)
// - \p{M}: Combining marks / diacritics / tashkeel / tanween
// - _: Underscore
// ZWNJ (\u200C) and ZWJ (\u200D) are handled explicitly to avoid ESLint no-misleading-character-class.
export const BASE_WORD_CHAR_REGEX = /[\p{L}\p{N}\p{M}_]/u;

/**
 * Checks whether a single character is considered a word character.
 */
export function isWordCharacter(char: string | undefined): boolean {
  if (!char) return false;
  return char === "\u200C" || char === "\u200D" || BASE_WORD_CHAR_REGEX.test(char);
}

export interface WordSegment {
  text: string;
  start: number;
  end: number;
  isWord: boolean;
}

interface IntlSegmentItem {
  segment: string;
  index: number;
  input: string;
  isWordLike?: boolean;
}

interface IntlSegmenterInstance {
  segment: (input: string) => Iterable<IntlSegmentItem>;
}

interface IntlWithSegmenter {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity?: "grapheme" | "word" | "sentence" },
  ) => IntlSegmenterInstance;
}

/**
 * Segments a text into word and non-word spans using Intl.Segmenter with a regex fallback.
 */
export function getWordSegments(text: string): WordSegment[] {
  if (!text) return [];

  const intlObj = (typeof Intl !== "undefined" ? Intl : {}) as IntlWithSegmenter;
  if (typeof intlObj.Segmenter === "function") {
    try {
      const segmenter = new intlObj.Segmenter(["fa", "en"], { granularity: "word" });
      const rawSegments = Array.from(segmenter.segment(text));
      return rawSegments.map((s: IntlSegmentItem) => {
        let isWord = s.isWordLike === true;
        // Verify with word character matcher to catch any numbers or ZWNJ combinations
        if (!isWord && Array.from(s.segment).some((c: string) => isWordCharacter(c))) {
          isWord = true;
        }
        return {
          text: s.segment,
          start: s.index,
          end: s.index + s.segment.length,
          isWord,
        };
      });
    } catch {
      // Fallback below
    }
  }

  // Fallback tokenizer: group contiguous word characters and non-word characters
  const segments: WordSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const isWord = isWordCharacter(text[i]);
    while (i < text.length && isWordCharacter(text[i]) === isWord) {
      i++;
    }
    segments.push({
      text: text.slice(start, i),
      start,
      end: i,
      isWord,
    });
  }
  return segments;
}

export interface ExpandedOffsetsResult {
  startOffset: number;
  endOffset: number;
  selectedText: string;
}

/**
 * Expands character offsets in text to word boundaries.
 *
 * Rules:
 * - If selection starts inside a word, start expands to the beginning of that word.
 * - If selection ends inside a word, end expands to the end of that word.
 * - Multi-word selections expand the outer edges while preserving interior spaces and punctuation.
 * - Untouched adjacent words are never included.
 * - Selections consisting solely of spaces or punctuation are NOT expanded to adjacent words.
 * - Out-of-bounds or inverted offsets are safely clamped.
 */
export function expandOffsetsToWordBoundaries(
  text: string,
  rawStart: number,
  rawEnd: number,
): ExpandedOffsetsResult {
  if (!text) {
    return { startOffset: 0, endOffset: 0, selectedText: "" };
  }

  const clampedStart = Math.max(0, Math.min(text.length, Math.min(rawStart, rawEnd)));
  const clampedEnd = Math.max(0, Math.min(text.length, Math.max(rawStart, rawEnd)));

  if (clampedStart >= clampedEnd) {
    return {
      startOffset: clampedStart,
      endOffset: clampedEnd,
      selectedText: "",
    };
  }

  const initialSlice = text.slice(clampedStart, clampedEnd);

  // If the selection does not contain any word characters (only spaces, symbols, punctuation),
  // do NOT expand to adjacent words.
  if (!Array.from(initialSlice).some((c) => isWordCharacter(c))) {
    return {
      startOffset: clampedStart,
      endOffset: clampedEnd,
      selectedText: initialSlice,
    };
  }

  const segments = getWordSegments(text);

  // Find all word segments that intersect the half-open interval [clampedStart, clampedEnd)
  const touchedWordSegments = segments.filter((seg) => {
    if (!seg.isWord) return false;
    return Math.max(seg.start, clampedStart) < Math.min(seg.end, clampedEnd);
  });

  if (touchedWordSegments.length === 0) {
    return {
      startOffset: clampedStart,
      endOffset: clampedEnd,
      selectedText: initialSlice,
    };
  }

  const firstSeg = touchedWordSegments[0];
  const lastSeg = touchedWordSegments[touchedWordSegments.length - 1];

  let startOffset = firstSeg.start;
  let endOffset = lastSeg.end;

  // Trim any dangling leading or trailing ZWNJ/ZWJ at the word boundary edges
  while (
    startOffset < endOffset &&
    (text[startOffset] === "\u200C" || text[startOffset] === "\u200D")
  ) {
    startOffset++;
  }
  while (
    endOffset > startOffset &&
    (text[endOffset - 1] === "\u200C" || text[endOffset - 1] === "\u200D")
  ) {
    endOffset--;
  }

  return {
    startOffset,
    endOffset,
    selectedText: text.slice(startOffset, endOffset),
  };
}

export interface TextNodeEntry {
  node: Text;
  start: number;
  end: number;
}

/**
 * Extracts all non-ignored Text nodes in container and calculates canonical character offsets.
 *
 * Skips PRE, CODE, SCRIPT, and STYLE elements according to AVANA lesson content contracts.
 * This exact function is shared between text selection capture and annotation DOM restoration
 * to ensure 100% offset consistency.
 */
export function getTextNodeEntries(container: Node): {
  entries: TextNodeEntry[];
  fullText: string;
} {
  const entries: TextNodeEntry[] = [];
  let currentOffset = 0;

  if (typeof document === "undefined") {
    return { entries: [], fullText: "" };
  }

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let currentNode = walker.nextNode() as Text | null;

  while (currentNode) {
    const parent = currentNode.parentElement;
    if (parent && ["PRE", "CODE", "SCRIPT", "STYLE"].includes(parent.tagName)) {
      currentNode = walker.nextNode() as Text | null;
      continue;
    }
    const len = currentNode.textContent?.length || 0;
    entries.push({
      node: currentNode,
      start: currentOffset,
      end: currentOffset + len,
    });
    currentOffset += len;
    currentNode = walker.nextNode() as Text | null;
  }

  const fullText = entries.map((e) => e.node.textContent || "").join("");
  return { entries, fullText };
}

/**
 * Computes the character offset in container for a given target Node and targetOffset.
 */
export function getCharacterOffsetInContainer(
  container: Node,
  targetNode: Node,
  targetOffset: number,
  cachedEntries?: TextNodeEntry[],
): number {
  const entries = cachedEntries || getTextNodeEntries(container).entries;

  if (entries.length === 0) return 0;

  // Direct match if targetNode is a Text node in entries
  const directEntry = entries.find((e) => e.node === targetNode);
  if (directEntry) {
    return directEntry.start + Math.max(0, Math.min(targetOffset, directEntry.node.length));
  }

  // If targetNode is an Element containing text nodes
  if (container.contains(targetNode) && targetNode !== container) {
    for (const entry of entries) {
      if (
        targetNode.contains(entry.node) ||
        targetNode.compareDocumentPosition(entry.node) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        return entry.start;
      }
    }
  }

  // Default: if targetNode is after all entries, return total length
  const last = entries[entries.length - 1];
  return last ? last.end : 0;
}

/**
 * Resolves a character index in fullText back to a specific Text node and character offset within it.
 */
export function getNodeAndOffsetAtCharacterIndex(
  entries: TextNodeEntry[],
  targetOffset: number,
  isEnd: boolean = false,
): { node: Text; offset: number } | null {
  if (entries.length === 0) return null;

  if (targetOffset <= entries[0].start) {
    return { node: entries[0].node, offset: 0 };
  }

  const last = entries[entries.length - 1];
  if (targetOffset >= last.end) {
    return { node: last.node, offset: last.node.textContent?.length || 0 };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (isEnd) {
      if (targetOffset > entry.start && targetOffset <= entry.end) {
        return { node: entry.node, offset: targetOffset - entry.start };
      }
    } else {
      if (targetOffset >= entry.start && targetOffset < entry.end) {
        return { node: entry.node, offset: targetOffset - entry.start };
      }
    }
  }

  return { node: last.node, offset: last.node.textContent?.length || 0 };
}

/**
 * Constructs a DOM Range spanning the given character offsets in container.
 */
export function createRangeFromOffsets(
  container: HTMLElement,
  startOffset: number,
  endOffset: number,
  cachedEntries?: TextNodeEntry[],
): Range | null {
  if (typeof document === "undefined") return null;

  const entries = cachedEntries || getTextNodeEntries(container).entries;
  if (entries.length === 0) return null;

  const startPoint = getNodeAndOffsetAtCharacterIndex(entries, startOffset, false);
  const endPoint = getNodeAndOffsetAtCharacterIndex(entries, endOffset, true);

  if (!startPoint || !endPoint) return null;

  try {
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    return range;
  } catch {
    return null;
  }
}
