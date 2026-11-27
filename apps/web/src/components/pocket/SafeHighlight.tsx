import React, { useMemo } from "react";

export interface SafeHighlightProps {
  text?: string | null;
  query?: string | null;
  className?: string;
  highlightClassName?: string;
}

interface CharMapEntry {
  char: string;
  rawStart: number;
  rawEnd: number;
}

/**
 * Punctuation characters normalized to space (22 characters):
 * \t, \r, \n, -, _, /, \, ,, ;, :, (, ), [, ], {, }, ", ', ., ،, ؛, ؟
 */
const PUNCT_REGEX = /[\s\t\r\n\-_/\\,;:()[\]{}'".،؛؟]/;

/**
 * Builds an exact character map linking normalized characters back to raw text UTF-16 intervals.
 * Correctly preserves surrogate pairs, diacritics, ZWNJ, and punctuation collapsing.
 */
export function buildNormalizedCharMap(rawText: string | null | undefined): {
  normalizedText: string;
  charMap: CharMapEntry[];
} {
  if (!rawText || typeof rawText !== "string") {
    return { normalizedText: "", charMap: [] };
  }

  const charMap: CharMapEntry[] = [];
  let i = 0;

  while (i < rawText.length) {
    const code = rawText.charCodeAt(i);
    let charLen = 1;
    let rawChar = rawText[i];

    // Check for surrogate pairs (code points outside BMP > 0xFFFF, e.g. Emojis)
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < rawText.length) {
      charLen = 2;
      rawChar = rawText.slice(i, i + 2);
    }

    // 1. Deleted characters: Arabic/Persian diacritics & zero-width/bidi control characters
    const isDiacritic = (code >= 0x064b && code <= 0x065f) || code === 0x0670;
    const isZeroWidth =
      code === 0x200b ||
      code === 0x200c ||
      code === 0x200d ||
      code === 0x200e ||
      code === 0x200f ||
      code === 0xfeff;

    if (isDiacritic || isZeroWidth) {
      // Expand rawEnd of preceding character if available so the mark encloses diacritics/ZWNJ
      if (charMap.length > 0) {
        charMap[charMap.length - 1].rawEnd = i + charLen;
      }
      i += charLen;
      continue;
    }

    // 2. Whitespace and punctuation collapsed to single space
    if (PUNCT_REGEX.test(rawChar)) {
      if (charMap.length > 0) {
        if (charMap[charMap.length - 1].char === " ") {
          charMap[charMap.length - 1].rawEnd = i + charLen;
        } else {
          charMap.push({ char: " ", rawStart: i, rawEnd: i + charLen });
        }
      }
      i += charLen;
      continue;
    }

    // 3. Normalized letters: unify Arabic Kaf/Yeh and lowercase
    let char = rawChar.toLowerCase();
    if (char === "\u0643") {
      char = "ک";
    } else if (char === "\u064a" || char === "\u0649") {
      char = "ی";
    }

    if (charLen === 2) {
      // Non-BMP surrogate pair: push lead surrogate unit, then trail surrogate unit
      // both sharing raw boundaries [i, i + 2]
      charMap.push({ char: char[0], rawStart: i, rawEnd: i + 2 });
      charMap.push({ char: char[1], rawStart: i, rawEnd: i + 2 });
    } else {
      charMap.push({ char, rawStart: i, rawEnd: i + 1 });
    }
    i += charLen;
  }

  // Trim trailing space in charMap
  if (charMap.length > 0 && charMap[charMap.length - 1].char === " ") {
    charMap.pop();
  }

  const normalizedText = charMap.map((entry) => entry.char).join("");
  return { normalizedText, charMap };
}

/**
 * Extracts unique normalized search tokens from query string.
 */
export function extractHighlightTokens(query: string | null | undefined): string[] {
  if (!query || typeof query !== "string") {
    return [];
  }
  const { normalizedText } = buildNormalizedCharMap(query);
  if (!normalizedText) {
    return [];
  }
  const words = normalizedText.split(" ").filter((w) => w.length > 0);
  return Array.from(new Set(words));
}

/**
 * SafeHighlight: High-performance, zero-XSS, UTF-16 code unit precise search highlighter.
 * Completely immune to ReDoS (uses linear indexOf) and avoids dangerouslySetInnerHTML.
 */
export const SafeHighlight: React.FC<SafeHighlightProps> = ({
  text,
  query,
  className = "",
  highlightClassName = "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 rounded px-0.5 font-medium",
}) => {
  const renderedElements = useMemo(() => {
    if (!text || typeof text !== "string") {
      return null;
    }

    const tokens = extractHighlightTokens(query);
    if (tokens.length === 0) {
      return text;
    }

    const { normalizedText, charMap } = buildNormalizedCharMap(text);
    if (!normalizedText || charMap.length === 0) {
      return text;
    }

    // Find all match occurrences in normalizedText using linear indexOf (ReDoS safe)
    const rawSpans: Array<{ start: number; end: number }> = [];

    for (const token of tokens) {
      if (!token) continue;
      let pos = normalizedText.indexOf(token, 0);
      while (pos !== -1) {
        const normEnd = pos + token.length - 1;
        if (normEnd < charMap.length) {
          const rawStart = charMap[pos].rawStart;
          const rawEnd = charMap[normEnd].rawEnd;
          rawSpans.push({ start: rawStart, end: rawEnd });
        }
        pos = normalizedText.indexOf(token, pos + 1);
      }
    }

    if (rawSpans.length === 0) {
      return text;
    }

    // Sort spans by start ASC, then end DESC
    rawSpans.sort((a, b) => a.start - b.start || b.end - a.end);

    // Merge overlapping or contiguous spans
    const mergedSpans: Array<{ start: number; end: number }> = [rawSpans[0]];
    for (let i = 1; i < rawSpans.length; i++) {
      const current = mergedSpans[mergedSpans.length - 1];
      const next = rawSpans[i];
      if (next.start <= current.end) {
        current.end = Math.max(current.end, next.end);
      } else {
        mergedSpans.push(next);
      }
    }

    // Construct safe React nodes
    const nodes: React.ReactNode[] = [];
    let currentRawIndex = 0;

    for (let i = 0; i < mergedSpans.length; i++) {
      const { start, end } = mergedSpans[i];

      // Add non-highlighted text before the match
      if (start > currentRawIndex) {
        nodes.push(text.slice(currentRawIndex, start));
      }

      // Add highlighted text node wrapped in standard <mark> element
      nodes.push(
        <mark key={`hl-${start}-${end}`} className={highlightClassName}>
          {text.slice(start, end)}
        </mark>,
      );

      currentRawIndex = end;
    }

    // Add trailing text after the last match
    if (currentRawIndex < text.length) {
      nodes.push(text.slice(currentRawIndex));
    }

    return nodes;
  }, [text, query, highlightClassName]);

  if (!text) {
    return null;
  }

  return <span className={className}>{renderedElements}</span>;
};
