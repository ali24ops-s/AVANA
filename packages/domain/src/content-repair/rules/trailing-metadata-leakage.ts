/**
 * Rule: Trailing Metadata Leakage Repair.
 *
 * Strips leaked trailing metadata, citation chunk UUID arrays, or trailing JSON residue,
 * while STRICTLY preserving legitimate UUIDs and references mentioned inside educational prose.
 */

import type { ContentBlock, DetectionResult, RepairContext } from "../types.js";

/**
 * Sanitizes trailing leaked metadata artifacts from the end of a block.
 */
function sanitizeTrailingMetadataFromBlock(text: string, isLastBlock: boolean): string {
  let cleaned = text;

  // Remove leaked JSON trailing properties e.g. ',\n "citationChunkIds": [ ... ] }'
  cleaned = cleaned.replace(/,?\s*"citationChunkIds"\s*:\s*\[[\s\S]*?\]\s*}?$/s, "");
  cleaned = cleaned.replace(/,?\s*"kind"\s*:\s*"[^"]*"\s*}?$/s, "");

  // If this is the last block, or if the block consists SOLELY of quoted UUID lists
  // e.g. "6945baa6-20b8-4ea3-89f8-8ba26f731440", "5de9a319-..."
  if (isLastBlock) {
    cleaned = cleaned.replace(
      /(?:\n|^)\s*(?:"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"\s*,?\s*)+$/s,
      "",
    );
  } else {
    // If entire block is ONLY a list of quoted UUIDs (without prose prefix)
    const isOnlyQuotedUuids = /^\s*(?:"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"\s*,?\s*)+$/s.test(
      cleaned,
    );
    if (isOnlyQuotedUuids) {
      cleaned = "";
    }
  }

  return cleaned.trimEnd();
}

export function detectTrailingMetadataLeakage(
  block: ContentBlock,
  context: RepairContext,
): DetectionResult | null {
  const isLastBlock = context.blockIndex === context.totalBlocks - 1;
  const cleaned = sanitizeTrailingMetadataFromBlock(block.raw, isLastBlock);

  if (cleaned !== block.raw) {
    return {
      detected: true,
      ruleId: "trailing-metadata-leakage",
      confidence: 0.99,
      confidenceLevel: "HIGH",
      reason: "شناسه‌ها و متادیتای ساختاری بجامانده در انتهای متن آموزشی با موفقیت پاکسازی شد.",
      repaired: cleaned,
      changedPartBefore: block.raw.length > 80 ? block.raw.slice(0, 80) + "..." : block.raw,
      changedPartAfter: cleaned.length > 80 ? cleaned.slice(0, 80) + "..." : cleaned,
    };
  }

  return null;
}
