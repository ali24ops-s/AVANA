/**
 * Rule: Broken Whitespace / Line Wrapping Repair.
 *
 * Reconnects broken lines inside chemical formulas and scientific units,
 * while STRICTLY preserving general Persian text paragraphs and intentional line breaks.
 */

import type { ContentBlock, DetectionResult, RepairContext } from "../types.js";

/**
 * Repairs line-wrapped chemical symbols and scientific units.
 */
function repairBrokenFormulaWhitespace(text: string): string {
  let res = text;

  // 1. Line-broken formulas e.g. "Ca\nC\n₂" or "Ca\nC_2"
  res = res.replace(/\b([A-Z][a-z]?)\n([A-Z][a-z]?)\n([₀-₉0-9_]+)/g, (_match, el1, el2, sub) => {
    const subClean = sub.replace(/[₀-₉]/g, (d: string) => String.fromCharCode(d.charCodeAt(0) - 0x2080 + 48));
    return `\\text{${el1}${el2}}_${subClean}`;
  });

  // 2. Line-broken chemical names inside LaTeX commands e.g. "\text{\nCaC\n}" -> "\text{CaC}"
  res = res.replace(/\\text\{\s*\n\s*([A-Za-z0-9_+\- ]+?)\s*\n\s*\}/g, "\\text{$1}");

  // 3. Line-broken scientific units e.g. "g/\ncm³" -> "g/cm³" or "mg/\ndL" -> "mg/dL"
  res = res.replace(/\b(g|mg|mcg|μg|mmol|mol)\/\n(cm[³3]|dL|L|kg|min|hr|day)\b/g, "$1/$2");

  return res;
}

export function detectBrokenWhitespace(
  block: ContentBlock,
  _context: RepairContext,
): DetectionResult | null {
  if (block.type === "code") {
    return null;
  }

  const repaired = repairBrokenFormulaWhitespace(block.raw);
  if (repaired !== block.raw) {
    return {
      detected: true,
      ruleId: "broken-whitespace",
      confidence: 0.92,
      confidenceLevel: "HIGH",
      reason: "شکستگی غیراستاندارد سطرها در فرمول علمی شناسایی و یکپارچه شد.",
      repaired,
      changedPartBefore: block.raw.length > 80 ? block.raw.slice(0, 80) + "..." : block.raw,
      changedPartAfter: repaired.length > 80 ? repaired.slice(0, 80) + "..." : repaired,
    };
  }

  return null;
}
