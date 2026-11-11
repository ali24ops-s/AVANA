/**
 * Deterministic Semantic Reference Chunker for AVANA Presentation Assistant.
 *
 * Implements Phase 2A-2.1:
 * - Deterministic, pure algorithmic structural parsing (100% independent of Gemini/LLMs).
 * - Heading hierarchy (breadcrumb stack) tracking with Markdown and structural pattern awareness.
 * - Scientific and medical unit awareness (preventing false-positive headings for drug dosages).
 * - Medical abbreviation preservation in sentence splitting (e.g. b.i.d., q.d., i.v.).
 * - Safe overlap budgeting ensuring hardMaxTokens is never breached and overlap is non-recursive.
 * - Active targetTokens usage as the optimal paragraph boundary flush threshold.
 * - Atomic table handling with header repetition for large tables.
 * - Safe list preservation with item-boundary splitting.
 * - Stable SHA-256 content hashing and idempotent chunk sequence production.
 */

import { createHash } from "node:crypto";
import {
  DomainError,
  type ReferenceChunkContentType,
  type SemanticChunkerInputBlock,
  type SemanticChunkerOptions,
  type SemanticReferenceChunk,
} from "@avana/domain";

// ---------------------------------------------------------------------------
// Constants & Defaults
// ---------------------------------------------------------------------------

/**
 * Character-to-token ratio approximation for mixed Persian, English, and scientific text.
 * NOTE: Token estimation based on character count (~4 chars/token) is a heuristic
 * approximation and does not represent exact model tokenizer counts.
 */
export const CHARS_PER_TOKEN_APPROXIMATION = 4;

export const DEFAULT_SEMANTIC_CHUNKER_OPTIONS: Required<SemanticChunkerOptions> = {
  targetTokens: 600,
  softMaxTokens: 800,
  hardMaxTokens: 1000,
  overlapTokens: 0,
  baseHeadingPath: [],
  startPage: null,
  endPage: null,
  sourceChunkId: null,
};

// ---------------------------------------------------------------------------
// Pure Utility Functions
// ---------------------------------------------------------------------------

/**
 * Estimate token count using heuristic character-to-token ratio approximation.
 */
export function estimateApproximateTokens(text: string): number {
  const len = text.trim().length;
  if (len === 0) return 0;
  return Math.max(1, Math.ceil(len / CHARS_PER_TOKEN_APPROXIMATION));
}

/**
 * Canonicalize text for consistent hashing and storage.
 * Strips null bytes and unprintable control characters, normalizes line breaks,
 * preserves Persian letters, digits, punctuation, and Zero Width Non-Joiner (\u200C).
 */
export function canonicalizeContent(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\0/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

/**
 * Compute stable SHA-256 hex digest from canonicalized content.
 */
export function computeContentHash(content: string): string {
  const canonical = canonicalizeContent(content);
  return createHash("sha256").update(canonical).digest("hex");
}

// ---------------------------------------------------------------------------
// Scientific Units & Abbreviations
// ---------------------------------------------------------------------------

/**
 * Common scientific, medical, and physiological units (single and compound).
 * Examples: mg, ml, mcg/kg, mmol/L, bpm, mmHg, mg/kg/day, etc.
 */
export const SCIENTIFIC_UNITS_SET = new Set([
  "mg", "mcg", "ug", "μg", "g", "kg", "ng", "pg",
  "ml", "l", "dl", "cl", "cc", "ul", "μl",
  "mmol", "mol", "umol", "μmol", "meq", "iu", "u",
  "bpm", "rpm", "mmhg", "cmh2o", "kpa", "pa", "bar",
  "hz", "khz", "mhz", "ghz",
  "sec", "min", "hr", "day", "days", "wk", "wks", "mo", "yr",
  "m", "cm", "mm", "nm", "um", "μm", "km",
  "percent", "pct", "%",
]);

/**
 * Detect whether a text token represents a scientific/medical measurement unit.
 * Supports simple units ("mg", "ml") and compound slash units ("mcg/kg", "mmol/L", "mg/kg/day").
 */
export function isScientificMeasurement(text: string): boolean {
  const clean = text.trim().toLowerCase();
  const normalized = clean.replace(/[:\-–—.,;]$/, "").trim();

  // 1. Direct unit match
  if (SCIENTIFIC_UNITS_SET.has(normalized)) return true;

  // 2. Compound units with slashes: e.g. "mcg/kg", "mmol/l", "mg/kg/day", "ml/hr"
  const slashParts = normalized.split("/");
  if (slashParts.length > 1 && slashParts.every((p) => SCIENTIFIC_UNITS_SET.has(p))) {
    return true;
  }

  // 3. Units followed by qualifier words: e.g. "percent saline", "mmol/L in plasma", "mg orally"
  const firstWord = normalized.split(/\s+/)[0];
  const firstWordSlashParts = firstWord.split("/");
  if (
    firstWordSlashParts.length > 0 &&
    firstWordSlashParts.every((p) => SCIENTIFIC_UNITS_SET.has(p))
  ) {
    return true;
  }

  return false;
}

/** Single-token abbreviations without internal periods */
const COMMON_ABBREVIATIONS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "prof",
  "etc",
  "vs",
  "eg",
  "ie",
  "fig",
  "figs",
  "ref",
  "refs",
  "al",
  "vol",
  "no",
  "pp",
  "dept",
  "univ",
]);

/** Medical prescription and Latin abbreviations with internal periods */
const DOTTED_ABBREVIATIONS = new Set([
  "b.i.d.",
  "q.d.",
  "p.o.",
  "i.v.",
  "i.m.",
  "s.c.",
  "t.i.d.",
  "q.i.d.",
  "e.g.",
  "i.e.",
  "et al.",
  "vs.",
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "prof.",
]);

/** Clinical continuation words commonly following medical prescription abbreviations */
const CLINICAL_CONTINUATION_REGEX =
  /^(with|without|after|before|immediately|daily|at|every|as|slowly|orally|stat|in|over|for|prn|p\.r\.n\.|to|by|per|via)\b/i;


// ---------------------------------------------------------------------------
// Structural Classification Types & Detection
// ---------------------------------------------------------------------------

interface ClassifiedBlock {
  type: ReferenceChunkContentType;
  content: string;
  level?: number;
  headingText?: string;
  startPage?: number | null;
  endPage?: number | null;
  sourceChunkId?: string | null;
  sourceOffset?: { start: number; end: number } | null;
}

/**
 * Contextual heading detector.
 * Identifies explicit markdown headings, chapter/section titles, and hierarchical numbers.
 * Excludes normal list items, references, scientific measurements (e.g. 1.5 mg), and sentences with trailing periods.
 */
function detectHeading(
  line: string,
): { isHeading: boolean; level: number; text: string } {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) {
    return { isHeading: false, level: 0, text: "" };
  }

  // 1. Markdown headings: # H1, ## H2, ### H3, ...
  const mdMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (mdMatch) {
    const level = mdMatch[1].length;
    const text = mdMatch[2].trim();
    if (text) {
      return { isHeading: true, level, text };
    }
  }

  // 2. Persian chapter / section prefixes: فصل ۱، بخش ۱-۲، قسمت ۳
  const faChapterMatch = trimmed.match(
    /^(فصل|بخش|قسمت)\s+([۰-۹0-9]+|[یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده]+)\s*[:\-–—]?\s*(.*)$/,
  );
  if (faChapterMatch && !/[.!?؟]$/.test(trimmed)) {
    const prefixType = faChapterMatch[1];
    const level = prefixType === "فصل" ? 1 : 2;
    return { isHeading: true, level, text: trimmed };
  }

  // 3. English chapter / section prefixes: Chapter 1: ..., Section 2: ...
  const enChapterMatch = trimmed.match(
    /^(Chapter|Section|Part)\s+([0-9IVXLCDM]+)\s*[:\-–—]?\s*(.*)$/i,
  );
  if (enChapterMatch && !/[.!?]$/.test(trimmed)) {
    const prefixType = enChapterMatch[1].toLowerCase();
    const level = prefixType === "chapter" ? 1 : 2;
    return { isHeading: true, level, text: trimmed };
  }

  // 4. Hierarchical section numbers: 1.1 ..., 1.2.3 ..., ۱-۲ ...
  // Note: Must NOT match single list numbers like "1. ..." or "1) ..."
  const multiNumMatch = trimmed.match(
    /^([0-9۰-۹]+[.\-–][0-9۰-۹]+(?:[.\-–][0-9۰-۹]+)?)\s+([^\n]+)$/,
  );
  if (multiNumMatch && !/[.!?؟]$/.test(trimmed)) {
    const numPart = multiNumMatch[1];
    const textPart = multiNumMatch[2].trim();

    // Guard: Exclude scientific measurements and drug dosages (e.g. 1.5 mg, 0.5 mcg/kg, 5.0 mmol/L)
    if (isScientificMeasurement(textPart)) {
      return { isHeading: false, level: 0, text: "" };
    }

    // Exclude if textPart looks like a long continuous sentence or clause
    if (textPart.length <= 80 && !/\b(is|are|was|were|است|شد|بود|می‌باشد)\b/.test(textPart)) {
      const depth = numPart.split(/[.\-–]/).length;
      const level = Math.min(6, Math.max(2, depth));
      return { isHeading: true, level, text: trimmed };
    }
  }

  return { isHeading: false, level: 0, text: "" };
}

/**
 * Check if a line is part of a markdown table.
 */
function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && (trimmed.startsWith("|") || trimmed.endsWith("|"));
}

/**
 * Check if a block represents a valid markdown table (has header + separator).
 */
function isValidMarkdownTable(block: string): boolean {
  const lines = block
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  // Second line should be separator row: | --- | :---: | --- |
  const separator = lines[1];
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(separator);
}

/**
 * Check if a line is a list item (bullet or numbered).
 */
function isListItem(line: string): boolean {
  const trimmed = line.trim();
  // Bullets: * , - , + , •
  if (/^([*+-]|•)\s+/.test(trimmed)) return true;
  // Numbered: 1. , 1) , (1) , ۱. , ۱)
  if (/^([0-9۰-۹]+[.)]|\([0-9۰-۹]+\))\s+/.test(trimmed)) return true;
  return false;
}

/**
 * Check if a line/block is speaker notes.
 */
function isSpeakerNotes(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("[یادداشت ارائه:") ||
    /^Speaker Notes:\s*/i.test(trimmed) ||
    trimmed.startsWith("[Speaker Notes:")
  );
}

// ---------------------------------------------------------------------------
// Sentence & Clause Splitters
// ---------------------------------------------------------------------------

/**
 * Split text into sentences preserving English, Persian, numbers, medical abbreviations (e.g. b.i.d., i.v.), and ZWNJ.
 */
export function splitIntoSentences(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const sentences: string[] = [];
  let buffer = "";

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    buffer += char;

    // Check sentence terminators: . ! ? ؟
    if (char === "." || char === "!" || char === "?" || char === "؟") {
      const nextChar = clean[i + 1];

      // 1. If next character is part of a number (e.g. 1.5, 3.14, ۱.۲), don't split
      if (char === "." && nextChar && /[0-9۰-۹]/.test(nextChar) && i > 0 && /[0-9۰-۹]/.test(clean[i - 1])) {
        continue;
      }

      // 2. If preceded by known abbreviation (e.g. Dr., vs., b.i.d., i.v.), don't split
      if (char === ".") {
        const abbrevMatch = buffer.match(/([A-Za-z]+(?:\.[A-Za-z]+)*)\.$/);
        if (abbrevMatch) {
          const candidateWithDot = abbrevMatch[0].toLowerCase();
          const candidateWithoutDot = abbrevMatch[1].toLowerCase().replace(/\./g, "");

          if (
            DOTTED_ABBREVIATIONS.has(candidateWithDot) ||
            COMMON_ABBREVIATIONS.has(candidateWithoutDot)
          ) {
            const remainingText = clean.slice(i + 1).trimStart();

            // If next non-space char is lowercase, it's definitely inside a sentence (e.g. "b.i.d. with meals")
            if (remainingText.length > 0 && /^[a-z]/.test(remainingText)) {
              continue;
            }

            // Standard title/Latin abbreviations shouldn't split regardless of following case (e.g. "Dr. Smith", "e.g. This")
            if (
              ["e.g.", "i.e.", "vs.", "dr.", "mr.", "mrs.", "ms.", "prof.", "et al."].includes(
                candidateWithDot,
              ) ||
              ["dr", "mr", "mrs", "ms", "prof", "vs", "eg", "ie", "al"].includes(
                candidateWithoutDot,
              )
            ) {
              continue;
            }

            // Clinical directions/prescriptions followed by continuation adverbs/prepositions (e.g. "b.i.d. With food", "i.v. Immediately")
            if (CLINICAL_CONTINUATION_REGEX.test(remainingText)) {
              continue;
            }

            // Reference/figure abbreviations followed by numbers (e.g. "fig. 1", "ref. 4", "no. 2")
            if (/^[0-9۰-۹]/.test(remainingText)) {
              continue;
            }
          }
        }
      }

      // 3. If next character is whitespace or end of string, finish sentence
      if (!nextChar || /\s/.test(nextChar)) {
        // Collect any trailing quotes or brackets (e.g. ." or .] or .»)
        while (i + 1 < clean.length && /["'»\])}]/.test(clean[i + 1])) {
          buffer += clean[++i];
        }
        sentences.push(buffer.trim());
        buffer = "";
        // Skip subsequent whitespace
        while (i + 1 < clean.length && /\s/.test(clean[i + 1])) {
          i++;
        }
      }
    }
  }

  if (buffer.trim()) {
    sentences.push(buffer.trim());
  }

  return sentences.filter(Boolean);
}

/**
 * Forceful split for a single sentence that exceeds hardMaxTokens.
 * Splits safely at clause boundaries (;, :, ,, ،, —, -) or word boundaries.
 * NEVER splits mid-word.
 */
function splitLongSentence(
  sentence: string,
  hardMaxTokens: number,
): string[] {
  const parts: string[] = [];
  const maxChars = hardMaxTokens * CHARS_PER_TOKEN_APPROXIMATION;

  let remaining = sentence.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      parts.push(remaining);
      break;
    }

    // Attempt to split at clause boundary within maxChars
    let splitIdx = -1;
    const searchSlice = remaining.slice(0, maxChars);

    // Prefer semicolon / colon / em-dash / comma / Persian comma
    const clauseMatches = Array.from(
      searchSlice.matchAll(/[؛;:،,—-]\s+/g),
    );
    if (clauseMatches.length > 0) {
      const lastMatch = clauseMatches[clauseMatches.length - 1];
      if (lastMatch.index !== undefined && lastMatch.index > maxChars * 0.4) {
        splitIdx = lastMatch.index + lastMatch[0].length;
      }
    }

    // Fallback: split at nearest whitespace
    if (splitIdx === -1) {
      const lastSpaceIdx = searchSlice.lastIndexOf(" ");
      if (lastSpaceIdx > 0) {
        splitIdx = lastSpaceIdx + 1;
      } else {
        // Find next whitespace beyond maxChars to avoid breaking mid-word
        const nextSpaceIdx = remaining.indexOf(" ", maxChars);
        splitIdx = nextSpaceIdx > 0 ? nextSpaceIdx + 1 : remaining.length;
      }
    }

    const chunkText = remaining.slice(0, splitIdx).trim();
    if (chunkText) {
      parts.push(chunkText);
    }
    remaining = remaining.slice(splitIdx).trim();
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Main Parsing & Semantic Chunking Engine
// ---------------------------------------------------------------------------

/**
 * Parse input string into structural blocks (headings, tables, lists, notes, paragraphs).
 */
function parseRawStringToBlocks(
  text: string,
  options: Required<SemanticChunkerOptions>,
): ClassifiedBlock[] {
  const blocks: ClassifiedBlock[] = [];
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Heading check
    const headingInfo = detectHeading(trimmed);
    if (headingInfo.isHeading) {
      blocks.push({
        type: "heading",
        content: headingInfo.text,
        level: headingInfo.level,
        headingText: headingInfo.text,
        startPage: options.startPage,
        endPage: options.endPage,
        sourceChunkId: options.sourceChunkId,
      });
      i++;
      continue;
    }

    // 2. Table check
    if (isTableLine(line)) {
      const tableLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && isTableLine(lines[j])) {
        tableLines.push(lines[j]);
        j++;
      }
      const tableContent = tableLines.join("\n");
      if (isValidMarkdownTable(tableContent)) {
        blocks.push({
          type: "table",
          content: tableContent,
          startPage: options.startPage,
          endPage: options.endPage,
          sourceChunkId: options.sourceChunkId,
        });
        i = j;
        continue;
      }
    }

    // 3. Speaker notes check
    if (isSpeakerNotes(line)) {
      const noteLines: string[] = [line];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && !detectHeading(lines[j]).isHeading && !isTableLine(lines[j])) {
        noteLines.push(lines[j]);
        j++;
      }
      blocks.push({
        type: "speaker_notes",
        content: noteLines.join("\n").trim(),
        startPage: options.startPage,
        endPage: options.endPage,
        sourceChunkId: options.sourceChunkId,
      });
      i = j;
      continue;
    }

    // 4. List check
    if (isListItem(line)) {
      const listLines: string[] = [line];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].trim() &&
        (isListItem(lines[j]) || /^\s{2,}\S/.test(lines[j])) // continuation of list item
      ) {
        listLines.push(lines[j]);
        j++;
      }
      blocks.push({
        type: "list",
        content: listLines.join("\n").trim(),
        startPage: options.startPage,
        endPage: options.endPage,
        sourceChunkId: options.sourceChunkId,
      });
      i = j;
      continue;
    }

    // 5. Normal paragraph (gather until blank line or special block)
    const paraLines: string[] = [line];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() &&
      !detectHeading(lines[j]).isHeading &&
      !isTableLine(lines[j]) &&
      !isListItem(lines[j]) &&
      !isSpeakerNotes(lines[j])
    ) {
      paraLines.push(lines[j]);
      j++;
    }
    blocks.push({
      type: "paragraph",
      content: paraLines.join("\n").trim(),
      startPage: options.startPage,
      endPage: options.endPage,
      sourceChunkId: options.sourceChunkId,
    });
    i = j;
  }

  return blocks;
}

/**
 * Split large table block into smaller table chunks while repeating headers.
 * Note: If an individual data row alone exceeds hardMaxTokens, it is preserved atomically
 * with the table header to avoid breaking column structure.
 */
function splitLargeTable(
  tableContent: string,
  softMaxTokens: number,
  hardMaxTokens: number,
): string[] {
  const lines = tableContent.trim().split("\n");
  if (lines.length <= 2) return [tableContent];

  const headerRow = lines[0];
  const separatorRow = lines[1];
  const headerBlock = `${headerRow}\n${separatorRow}`;
  const headerTokens = estimateApproximateTokens(headerBlock);

  const dataRows = lines.slice(2);
  const chunks: string[] = [];

  let currentRows: string[] = [];
  let currentTokens = headerTokens;

  for (const row of dataRows) {
    const rowTokens = estimateApproximateTokens(row);

    if (currentRows.length > 0 && currentTokens + rowTokens > softMaxTokens) {
      chunks.push(`${headerBlock}\n${currentRows.join("\n")}`);
      currentRows = [row];
      currentTokens = headerTokens + rowTokens;
    } else {
      currentRows.push(row);
      currentTokens += rowTokens;
    }

    // If single row exceeds hardMaxTokens, force push to avoid infinite loop
    if (currentTokens >= hardMaxTokens && currentRows.length > 0) {
      chunks.push(`${headerBlock}\n${currentRows.join("\n")}`);
      currentRows = [];
      currentTokens = headerTokens;
    }
  }

  if (currentRows.length > 0) {
    chunks.push(`${headerBlock}\n${currentRows.join("\n")}`);
  }

  return chunks.length > 0 ? chunks : [tableContent];
}

/**
 * Split large list block into item-bounded list chunks.
 */
function splitLargeList(
  listContent: string,
  softMaxTokens: number,
): string[] {
  const lines = listContent.trim().split("\n");
  const items: string[] = [];
  let curItem = "";

  for (const line of lines) {
    if (isListItem(line)) {
      if (curItem) items.push(curItem.trim());
      curItem = line;
    } else {
      curItem += `\n${line}`;
    }
  }
  if (curItem) items.push(curItem.trim());

  const chunks: string[] = [];
  let currentBuffer: string[] = [];
  let currentTokens = 0;

  for (const item of items) {
    const itemTokens = estimateApproximateTokens(item);
    if (currentBuffer.length > 0 && currentTokens + itemTokens > softMaxTokens) {
      chunks.push(currentBuffer.join("\n"));
      currentBuffer = [item];
      currentTokens = itemTokens;
    } else {
      currentBuffer.push(item);
      currentTokens += itemTokens;
    }
  }

  if (currentBuffer.length > 0) {
    chunks.push(currentBuffer.join("\n"));
  }

  return chunks.length > 0 ? chunks : [listContent];
}

/**
 * Extract trailing sentences from text up to target overlap token count.
 */
function extractOverlapPrefix(text: string, maxOverlapTokens: number): string {
  if (maxOverlapTokens <= 0) return "";
  const sentences = splitIntoSentences(text);
  if (sentences.length <= 1) return "";

  const selected: string[] = [];
  let accumulated = 0;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const sTokens = estimateApproximateTokens(sentences[i]);
    if (accumulated + sTokens > maxOverlapTokens && selected.length > 0) {
      break;
    }
    selected.unshift(sentences[i]);
    accumulated += sTokens;
    if (accumulated >= maxOverlapTokens) break;
  }

  // Never overlap the entire chunk content
  if (selected.length >= sentences.length) {
    selected.shift();
  }

  return selected.join(" ").trim();
}

/**
 * Prepends overlap prefix text to base chunk content safely without breaching hardMaxTokens.
 * Guarantees that the new base content is NEVER dropped or trimmed; only overlap is reduced/dropped if needed.
 */
function applyOverlapSafely(
  baseContent: string,
  overlapText: string,
  hardMaxTokens: number,
): string {
  if (!overlapText) return baseContent;

  const baseTokens = estimateApproximateTokens(baseContent);
  const overlapTokens = estimateApproximateTokens(overlapText);

  if (baseTokens + overlapTokens <= hardMaxTokens) {
    return `${overlapText}\n\n${baseContent}`.trim();
  }

  // Budget available for overlap without breaching hardMaxTokens
  const availableBudget = Math.max(0, hardMaxTokens - baseTokens);
  if (availableBudget <= 0) {
    // Overlap discarded to preserve original baseContent within budget
    return baseContent;
  }

  const trimmedOverlap = extractOverlapPrefix(overlapText, availableBudget);
  if (trimmedOverlap) {
    return `${trimmedOverlap}\n\n${baseContent}`.trim();
  }

  return baseContent;
}

/**
 * Main Deterministic Semantic Splitter.
 * Turns raw text or structured blocks into a sequence of SemanticReferenceChunks.
 *
 * @param input Raw string content OR array of pre-structured blocks.
 * @param options Configurable options for token budget, overlap, and metadata.
 */
export function splitIntoSemanticChunks(
  input: string | SemanticChunkerInputBlock[],
  options?: SemanticChunkerOptions,
): SemanticReferenceChunk[] {
  const opts: Required<SemanticChunkerOptions> = {
    ...DEFAULT_SEMANTIC_CHUNKER_OPTIONS,
    ...(options ?? {}),
  };

  // 1. Strict validation of token limits
  if (opts.targetTokens <= 0 || opts.softMaxTokens <= 0 || opts.hardMaxTokens <= 0) {
    throw new DomainError(
      "bad_request",
      "Token limits must be positive integers",
    );
  }

  if (opts.overlapTokens < 0) {
    throw new DomainError(
      "bad_request",
      "overlapTokens cannot be negative",
    );
  }

  if (
    opts.targetTokens > opts.softMaxTokens ||
    opts.softMaxTokens > opts.hardMaxTokens
  ) {
    throw new DomainError(
      "bad_request",
      `Invalid token limits: targetTokens (${opts.targetTokens}) <= softMaxTokens (${opts.softMaxTokens}) <= hardMaxTokens (${opts.hardMaxTokens}) is required`,
    );
  }

  // 2. Normalize input into ClassifiedBlocks
  let blocks: ClassifiedBlock[] = [];

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];
    blocks = parseRawStringToBlocks(input, opts);
  } else if (Array.isArray(input)) {
    if (input.length === 0) return [];
    for (const b of input) {
      const bContent = b.content.trim();
      if (!bContent) continue;

      if (b.contentType) {
        blocks.push({
          type: b.contentType,
          content: bContent,
          level: b.contentType === "heading" ? 1 : undefined,
          headingText: b.contentType === "heading" ? bContent : undefined,
          startPage: b.startPage ?? opts.startPage,
          endPage: b.endPage ?? opts.endPage,
          sourceChunkId: b.sourceChunkId ?? opts.sourceChunkId,
          sourceOffset: b.sourceOffset ?? null,
        });
      } else {
        const parsed = parseRawStringToBlocks(bContent, {
          ...opts,
          startPage: b.startPage ?? opts.startPage,
          endPage: b.endPage ?? opts.endPage,
          sourceChunkId: b.sourceChunkId ?? opts.sourceChunkId,
        });
        blocks.push(...parsed);
      }
    }
  }

  if (blocks.length === 0) return [];

  // 3. State machine for heading hierarchy, aggregation, and overlap
  const chunks: SemanticReferenceChunk[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];

  let pendingOverlap = "";
  let sequence = 0;

  // Narrative buffer for paragraphs
  let narrativeBuffer: string[] = [];
  let narrativeTokens = 0;
  let narrativeStartPage: number | null = null;
  let narrativeEndPage: number | null = null;
  let narrativeSourceChunkId: string | null = null;

  const getCurrentHeadingPath = (): string[] => {
    return [...opts.baseHeadingPath, ...headingStack.map((h) => h.text)];
  };

  const flushNarrativeBuffer = () => {
    if (narrativeBuffer.length === 0) return;

    const pureNewContent = narrativeBuffer.join("\n\n").trim();
    const fullText = applyOverlapSafely(
      pureNewContent,
      pendingOverlap,
      opts.hardMaxTokens,
    );
    pendingOverlap = "";

    const tokenEst = estimateApproximateTokens(fullText);
    const hash = computeContentHash(fullText);

    chunks.push({
      sequence: sequence++,
      content: fullText,
      headingPath: getCurrentHeadingPath(),
      contentType: "paragraph",
      startPage: narrativeStartPage,
      endPage: narrativeEndPage,
      tokenEstimate: tokenEst,
      contentHash: hash,
      sourceChunkId: narrativeSourceChunkId,
      sourceOffset: null,
    });

    // Extract overlap strictly from pureNewContent to prevent recursive overlap expansion
    if (opts.overlapTokens > 0) {
      pendingOverlap = extractOverlapPrefix(pureNewContent, opts.overlapTokens);
    }

    narrativeBuffer = [];
    narrativeTokens = 0;
    narrativeStartPage = null;
    narrativeEndPage = null;
    narrativeSourceChunkId = null;
  };

  for (const block of blocks) {
    // A. Heading Block
    if (block.type === "heading" && block.headingText) {
      flushNarrativeBuffer();
      // Reset overlap on heading boundary
      pendingOverlap = "";

      const level = block.level ?? 1;

      // Reset heading path stack: pop all items at current level or deeper
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, text: block.headingText });

      // Note: Standalone headings are tracked in headingPath and not emitted
      // as separate micro-chunks to prevent tiny, context-less 2-token chunks.
      continue;
    }

    // B. Table Block
    if (block.type === "table") {
      flushNarrativeBuffer();
      pendingOverlap = "";

      const tableTokens = estimateApproximateTokens(block.content);
      if (tableTokens <= opts.softMaxTokens) {
        chunks.push({
          sequence: sequence++,
          content: block.content,
          headingPath: getCurrentHeadingPath(),
          contentType: "table",
          startPage: block.startPage ?? opts.startPage,
          endPage: block.endPage ?? opts.endPage,
          tokenEstimate: tableTokens,
          contentHash: computeContentHash(block.content),
          sourceChunkId: block.sourceChunkId ?? opts.sourceChunkId,
          sourceOffset: block.sourceOffset ?? null,
        });
      } else {
        const tableSlices = splitLargeTable(
          block.content,
          opts.softMaxTokens,
          opts.hardMaxTokens,
        );
        for (const slice of tableSlices) {
          chunks.push({
            sequence: sequence++,
            content: slice,
            headingPath: getCurrentHeadingPath(),
            contentType: "table",
            startPage: block.startPage ?? opts.startPage,
            endPage: block.endPage ?? opts.endPage,
            tokenEstimate: estimateApproximateTokens(slice),
            contentHash: computeContentHash(slice),
            sourceChunkId: block.sourceChunkId ?? opts.sourceChunkId,
            sourceOffset: null,
          });
        }
      }
      continue;
    }

    // C. Speaker Notes Block
    if (block.type === "speaker_notes") {
      flushNarrativeBuffer();
      pendingOverlap = "";

      chunks.push({
        sequence: sequence++,
        content: block.content,
        headingPath: getCurrentHeadingPath(),
        contentType: "speaker_notes",
        startPage: block.startPage ?? opts.startPage,
        endPage: block.endPage ?? opts.endPage,
        tokenEstimate: estimateApproximateTokens(block.content),
        contentHash: computeContentHash(block.content),
        sourceChunkId: block.sourceChunkId ?? opts.sourceChunkId,
        sourceOffset: block.sourceOffset ?? null,
      });
      continue;
    }

    // D. List Block
    if (block.type === "list") {
      flushNarrativeBuffer();
      pendingOverlap = "";

      const listTokens = estimateApproximateTokens(block.content);
      if (listTokens <= opts.softMaxTokens) {
        chunks.push({
          sequence: sequence++,
          content: block.content,
          headingPath: getCurrentHeadingPath(),
          contentType: "list",
          startPage: block.startPage ?? opts.startPage,
          endPage: block.endPage ?? opts.endPage,
          tokenEstimate: listTokens,
          contentHash: computeContentHash(block.content),
          sourceChunkId: block.sourceChunkId ?? opts.sourceChunkId,
          sourceOffset: block.sourceOffset ?? null,
        });
      } else {
        const listSlices = splitLargeList(block.content, opts.softMaxTokens);
        for (const slice of listSlices) {
          chunks.push({
            sequence: sequence++,
            content: slice,
            headingPath: getCurrentHeadingPath(),
            contentType: "list",
            startPage: block.startPage ?? opts.startPage,
            endPage: block.endPage ?? opts.endPage,
            tokenEstimate: estimateApproximateTokens(slice),
            contentHash: computeContentHash(slice),
            sourceChunkId: block.sourceChunkId ?? opts.sourceChunkId,
            sourceOffset: null,
          });
        }
      }
      continue;
    }

    // E. Paragraph Block
    const paraTokens = estimateApproximateTokens(block.content);

    // If paragraph itself exceeds softMaxTokens, break down into sentences
    if (paraTokens > opts.softMaxTokens) {
      flushNarrativeBuffer();

      const rawSentences = splitIntoSentences(block.content);
      const sentences: string[] = [];

      // Guard against single sentences exceeding hardMaxTokens
      for (const s of rawSentences) {
        const sTokens = estimateApproximateTokens(s);
        if (sTokens > opts.hardMaxTokens) {
          const splitParts = splitLongSentence(s, opts.hardMaxTokens);
          sentences.push(...splitParts);
        } else {
          sentences.push(s);
        }
      }

      let sentenceBuffer: string[] = [];
      let sBufferTokens = 0;

      for (const sent of sentences) {
        const sTokens = estimateApproximateTokens(sent);
        const effectiveTokens = (pendingOverlap ? estimateApproximateTokens(pendingOverlap) : 0) + sBufferTokens;

        if (
          sentenceBuffer.length > 0 &&
          (effectiveTokens >= opts.targetTokens || effectiveTokens + sTokens > opts.softMaxTokens)
        ) {
          const pureBase = sentenceBuffer.join(" ").trim();
          const chunkText = applyOverlapSafely(
            pureBase,
            pendingOverlap,
            opts.hardMaxTokens,
          );
          pendingOverlap = "";

          chunks.push({
            sequence: sequence++,
            content: chunkText,
            headingPath: getCurrentHeadingPath(),
            contentType: "paragraph",
            startPage: block.startPage ?? opts.startPage,
            endPage: block.endPage ?? opts.endPage,
            tokenEstimate: estimateApproximateTokens(chunkText),
            contentHash: computeContentHash(chunkText),
            sourceChunkId: block.sourceChunkId ?? opts.sourceChunkId,
            sourceOffset: null,
          });

          if (opts.overlapTokens > 0) {
            pendingOverlap = extractOverlapPrefix(pureBase, opts.overlapTokens);
          }

          sentenceBuffer = [sent];
          sBufferTokens = sTokens;
        } else {
          sentenceBuffer.push(sent);
          sBufferTokens += sTokens;
        }
      }

      if (sentenceBuffer.length > 0) {
        const pureBase = sentenceBuffer.join(" ").trim();
        const chunkText = applyOverlapSafely(
          pureBase,
          pendingOverlap,
          opts.hardMaxTokens,
        );
        pendingOverlap = "";

        chunks.push({
          sequence: sequence++,
          content: chunkText,
          headingPath: getCurrentHeadingPath(),
          contentType: "paragraph",
          startPage: block.startPage ?? opts.startPage,
          endPage: block.endPage ?? opts.endPage,
          tokenEstimate: estimateApproximateTokens(chunkText),
          contentHash: computeContentHash(chunkText),
          sourceChunkId: block.sourceChunkId ?? opts.sourceChunkId,
          sourceOffset: null,
        });

        if (opts.overlapTokens > 0) {
          pendingOverlap = extractOverlapPrefix(pureBase, opts.overlapTokens);
        }
      }
      continue;
    }

    // Normal paragraph accumulating within narrative buffer
    // Uses targetTokens as the optimal paragraph boundary flush threshold
    const pendingOverlapTokens = pendingOverlap ? estimateApproximateTokens(pendingOverlap) : 0;
    const effectiveBufferTokens = pendingOverlapTokens + narrativeTokens;

    if (
      narrativeBuffer.length > 0 &&
      (effectiveBufferTokens >= opts.targetTokens || effectiveBufferTokens + paraTokens > opts.softMaxTokens)
    ) {
      flushNarrativeBuffer();
    }

    narrativeBuffer.push(block.content);
    narrativeTokens += paraTokens;
    if (narrativeStartPage === null && block.startPage !== undefined) {
      narrativeStartPage = block.startPage;
    }
    if (block.endPage !== undefined && block.endPage !== null) {
      narrativeEndPage = block.endPage;
    }
    if (narrativeSourceChunkId === null && block.sourceChunkId) {
      narrativeSourceChunkId = block.sourceChunkId;
    }
  }

  // Flush remaining narrative buffer
  flushNarrativeBuffer();

  return chunks;
}

/**
 * Class wrapper for Semantic Reference Chunker.
 */
export class SemanticChunker {
  static split(
    input: string | SemanticChunkerInputBlock[],
    options?: SemanticChunkerOptions,
  ): SemanticReferenceChunk[] {
    return splitIntoSemanticChunks(input, options);
  }
}
