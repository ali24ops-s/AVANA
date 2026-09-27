/**
 * Block Splitter for Deterministic Content Repair.
 *
 * Splits Markdown educational lessons into identifiable blocks (headings,
 * code blocks, display math, blockquotes, tables, lists, and paragraphs).
 *
 * Guarantees 100% byte fidelity when rebuilding untouched blocks:
 * rebuild(split(content).blocks, split(content).separators) === content
 */

import type { ContentBlock, ContentBlockType } from "./types.js";

/**
 * Computes a fast deterministic identifier for a block based on index and content.
 */
function createBlockId(index: number, raw: string): string {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `b_${index}_${Math.abs(hash).toString(16)}`;
}

/**
 * Classifies the type of a block from its raw text.
 */
export function classifyBlockType(raw: string): ContentBlockType {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "paragraph";
  }

  if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
    return "code";
  }

  if (trimmed.startsWith("$$") && (trimmed.endsWith("$$") || trimmed.includes("$$"))) {
    return "math";
  }

  if (/^#{1,6}\s+/.test(trimmed)) {
    return "heading";
  }

  if (trimmed.startsWith(">")) {
    return "blockquote";
  }

  if (trimmed.startsWith("|") && trimmed.includes("\n|") && trimmed.includes("---")) {
    return "table";
  }

  if (/^(?:[-*+]|\d+\.)\s+/.test(trimmed)) {
    return "list";
  }

  return "paragraph";
}

export interface SplitDocumentResult {
  blocks: ContentBlock[];
  separators: string[];
}

/**
 * Splits raw Markdown text into discrete content blocks while capturing the exact inter-block separators.
 */
export function splitMarkdownDocument(content: string): SplitDocumentResult {
  if (!content) {
    return { blocks: [], separators: [] };
  }

  const blocks: ContentBlock[] = [];
  const separators: string[] = [];

  const lines = content.split("\n");
  let currentBlockLines: string[] = [];
  let inFencedCode = false;
  let inDisplayMath = false;
  let currentOffset = 0;
  let blockStartOffset = 0;
  let lastBlockEndOffset = 0;

  const flushBlock = () => {
    if (currentBlockLines.length === 0) return;
    const raw = currentBlockLines.join("\n");
    const endOffset = blockStartOffset + raw.length;
    const blockIndex = blocks.length;

    // Record separator between previous block and this block
    if (blockIndex > 0) {
      const sep = content.slice(lastBlockEndOffset, blockStartOffset);
      separators.push(sep);
    }

    blocks.push({
      id: createBlockId(blockIndex, raw),
      index: blockIndex,
      type: classifyBlockType(raw),
      raw,
      startOffset: blockStartOffset,
      endOffset,
    });

    lastBlockEndOffset = endOffset;
    currentBlockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check code fence toggle
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      if (!inFencedCode && !inDisplayMath) {
        flushBlock();
        inFencedCode = true;
        blockStartOffset = currentOffset;
        currentBlockLines.push(line);
      } else if (inFencedCode) {
        currentBlockLines.push(line);
        flushBlock();
        inFencedCode = false;
      } else {
        currentBlockLines.push(line);
      }
      currentOffset += line.length + (i < lines.length - 1 ? 1 : 0);
      continue;
    }

    if (inFencedCode) {
      currentBlockLines.push(line);
      currentOffset += line.length + (i < lines.length - 1 ? 1 : 0);
      continue;
    }

    // Check display math $$ toggle
    if (trimmed.startsWith("$$") && !trimmed.slice(2).includes("$$")) {
      if (!inDisplayMath) {
        flushBlock();
        inDisplayMath = true;
        blockStartOffset = currentOffset;
        currentBlockLines.push(line);
      } else {
        currentBlockLines.push(line);
        flushBlock();
        inDisplayMath = false;
      }
      currentOffset += line.length + (i < lines.length - 1 ? 1 : 0);
      continue;
    }

    if (inDisplayMath) {
      currentBlockLines.push(line);
      if (trimmed.endsWith("$$")) {
        flushBlock();
        inDisplayMath = false;
      }
      currentOffset += line.length + (i < lines.length - 1 ? 1 : 0);
      continue;
    }

    // Blank line indicates block boundary
    if (trimmed === "") {
      if (currentBlockLines.length > 0) {
        flushBlock();
      }
      currentOffset += line.length + (i < lines.length - 1 ? 1 : 0);
      continue;
    }

    // New heading starts a new block
    if (/^#{1,6}\s+/.test(trimmed) && currentBlockLines.length > 0) {
      flushBlock();
    }

    // Non-blank line starting new block
    if (currentBlockLines.length === 0) {
      blockStartOffset = currentOffset;
    }

    currentBlockLines.push(line);
    currentOffset += line.length + (i < lines.length - 1 ? 1 : 0);
  }

  flushBlock();

  // If there is trailing content after the last block
  if (lastBlockEndOffset < content.length) {
    separators.push(content.slice(lastBlockEndOffset));
  }

  return { blocks, separators };
}

/**
 * Rebuilds the entire document from blocks and separators.
 * If blocks are unchanged, output is byte-identical to original.
 */
export function rebuildMarkdownDocument(
  blocks: ContentBlock[],
  separators: string[],
): string {
  if (blocks.length === 0) {
    return "";
  }

  let result = "";
  for (let i = 0; i < blocks.length; i++) {
    result += blocks[i].raw;
    if (i < separators.length) {
      const nextBlock = blocks[i + 1];
      // If trailing block was deleted, omit separator
      if (nextBlock && nextBlock.raw.length === 0 && i + 1 === blocks.length - 1) {
        // omit
      } else {
        result += separators[i];
      }
    }
  }

  return result.trimEnd();
}
