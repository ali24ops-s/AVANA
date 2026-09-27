/**
 * Rule: Duplicated Fragment Repair.
 *
 * Identifies and removes accidental consecutive duplicate fragments (e.g. "0.62\n0.62" or duplicated numeric/equation lines),
 * while STRICTLY preserving intentional Persian educational prose, headings, and emphasis.
 */

import type { ContentBlock, DetectionResult, RepairContext } from "../types.js";

/**
 * Checks if a line is a numeric/equation/data fragment where duplication is an obvious AI glitch.
 */
function isNumericOrDataLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Numbers, decimals, percentages, short chemical/math tokens
  if (/^\d+(?:\.\d+)?%?$/.test(trimmed)) return true;
  if (/^\$[^$\n]+\$$/.test(trimmed)) return true;
  if (/^\\text\{[a-zA-Z0-9_]+\}(?:_\d+)?$/.test(trimmed)) return true;
  if (/^[A-Za-z0-9_+\-^.=/*]{1,30}$/.test(trimmed)) return true;
  return false;
}

export function detectDuplicatedFragment(
  block: ContentBlock,
  _context: RepairContext,
): DetectionResult | null {
  if (block.type === "code") {
    return null;
  }

  const lines = block.raw.split("\n");
  if (lines.length < 2) {
    return null;
  }

  const cleanedLines: string[] = [];
  let hasDuplicate = false;
  let isAllNumericOrData = true;

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const prev = i > 0 ? lines[i - 1] : null;

    if (prev !== null && current.trim() === prev.trim() && current.trim().length > 0) {
      // Adjacent identical line detected
      const isData = isNumericOrDataLine(current);
      if (isData) {
        hasDuplicate = true;
        continue; // Drop duplicate
      }
      // If it is regular prose, only drop if it's very short (< 15 chars) to prevent deleting intentional emphasis
      if (current.trim().length < 15) {
        hasDuplicate = true;
        isAllNumericOrData = false;
        continue;
      }
    }

    cleanedLines.push(current);
  }

  if (!hasDuplicate) {
    return null;
  }

  const repaired = cleanedLines.join("\n");
  const confidence = isAllNumericOrData ? 0.95 : 0.80;
  const confidenceLevel = isAllNumericOrData ? "HIGH" : "MEDIUM";

  return {
    detected: true,
    ruleId: "duplicated-fragment",
    confidence,
    confidenceLevel,
    reason: "تکرار ناخواسته و اضافه یک عبارت یا سطر در این بخش شناسایی و حذف شد.",
    repaired,
    changedPartBefore: block.raw.length > 80 ? block.raw.slice(0, 80) + "..." : block.raw,
    changedPartAfter: repaired.length > 80 ? repaired.slice(0, 80) + "..." : repaired,
  };
}
