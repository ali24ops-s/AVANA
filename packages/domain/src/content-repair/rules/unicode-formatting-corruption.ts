/**
 * Rule: Unicode Formatting Corruption Repair.
 *
 * Strips corrupted control characters, null bytes, and non-printable escape residue,
 * while STRICTLY preserving Persian typographic characters (ZWNJ \u200C, ZWJ \u200D, RLM \u200F).
 */

import type { ContentBlock, DetectionResult, RepairContext } from "../types.js";

/**
 * Strips invalid non-printable control characters without affecting Persian typography or tabs/newlines.
 */
function cleanCorruptedUnicode(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFD]/g, "");
}

export function detectUnicodeFormattingCorruption(
  block: ContentBlock,
  _context: RepairContext,
): DetectionResult | null {
  const cleaned = cleanCorruptedUnicode(block.raw);
  if (cleaned !== block.raw) {
    return {
      detected: true,
      ruleId: "unicode-formatting-corruption",
      confidence: 0.95,
      confidenceLevel: "HIGH",
      reason: "نویسه‌های کنترلی نامعتبر یونیکد بدون تغییر علائم نگارشی فارسی پالایش شدند.",
      repaired: cleaned,
      changedPartBefore: "حاوی نویسه‌های کنترلی نامعتبر",
      changedPartAfter: "پالایش شده",
    };
  }

  return null;
}
