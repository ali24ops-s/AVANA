/**
 * Rule: LaTeX Command Corruption.
 *
 * Repairs corrupted LaTeX command strings and chemical representations such as:
 * - textCaC_2 -> \text{CaC}_2
 * - textCaC 2 + 2textH 2O -> \text{CaC}_2 + 2\text{H}_2\text{O}
 * - text{...} without leading backslash in math/chemistry contexts
 * - Vertical single-character corruption: t\ne\nx\nt\nC\na\nC -> \text{CaC}
 */

import type { ContentBlock, DetectionResult, RepairContext } from "../types.js";

/**
 * Repairs horizontal LaTeX command corruptions in a string.
 */
function repairHorizontalLatexCommands(text: string): string {
  let res = text;

  // 1. Convert tab-corrupted commands (e.g. "\t ext{" -> "\text{")
  res = res.replace(/(?:\\t|\t)\s*ext\{/g, "\\text{");

  // 2. Convert raw "text{...}" with missing backslash in math context or equations
  res = res.replace(/(?<!\\)\btext\{([A-Za-z0-9_+\- ]+)\}/g, "\\text{$1}");

  // 3. Convert patterns like "textCaC 2 + 2textH 2O" or "textCaC_2"
  // Handles leading digit e.g. 2textH 2O or word start textCaC
  res = res.replace(
    /(?<![\\a-zA-Z])text([A-Z][a-zA-Z0-9]*)(?:\s+(\d+)|_(\d+))?([A-Z][a-zA-Z0-9]*)?(?:\s+(\d+)|_(\d+))?/g,
    (match, chem1, num1, sub1, chem2, num2, sub2) => {
      // Guard against normal English words that start with "text" (e.g. textbook, textual, text)
      if (!chem1) return match;
      if (
        /^(?:book|ual|ing|ed|ure|iles?|ile|s)$/i.test(chem1) &&
        !num1 &&
        !sub1 &&
        !chem2
      ) {
        return match;
      }

      let reconstructed = `\\text{${chem1}}`;
      const n1 = num1 || sub1;
      if (n1) {
        reconstructed += `_${n1}`;
      }
      if (chem2) {
        reconstructed += `\\text{${chem2}}`;
        const n2 = num2 || sub2;
        if (n2) {
          reconstructed += `_${n2}`;
        }
      }
      return reconstructed;
    },
  );

  // 4. Handle "textCaC_2" or "textCaCO_3" specifically
  res = res.replace(
    /(?<![\\a-zA-Z])text([A-Z][a-z]?)(?:_(\d+)|\s*(\d+))?([A-Z][a-z]*)?(?:_(\d+)|\s*(\d+))?/g,
    (match, el1, n1a, n1b, el2, n2a, n2b) => {
      if (!el1) return match;
      if (/^(?:book|ual|ing|ed|ure|iles?)$/i.test(el1)) return match;

      let result = `\\text{${el1}}`;
      const n1 = n1a || n1b;
      if (n1) result += `_${n1}`;
      if (el2) {
        result += `\\text{${el2}}`;
        const n2 = n2a || n2b;
        if (n2) result += `_${n2}`;
      }
      return result;
    },
  );

  return res;
}

/**
 * Detects and repairs vertical single-character corruption (e.g. "t\ne\nx\nt\nC\na\nC").
 */
function repairVerticalLatexCorruption(text: string): string | null {
  // Check if text consists of vertical single-character lines
  const lines = text.split("\n").map((l) => l.trim());
  if (lines.length < 4) return null;

  // Pattern: lines starting with t, e, x, t
  const joinedLetters = lines.join("");
  if (/^text[A-Za-z0-9_]+$/i.test(joinedLetters)) {
    // Verified vertical LaTeX corruption
    const afterText = joinedLetters.slice(4);
    // Parse chemical or formula representation
    const repaired = `\\text{${afterText}}`;
    return repaired;
  }

  // Check if every line is 1 character long and forms a chemical formula like C, a, C, _, 2
  const allSingleChars = lines.every((l) => l.length === 1 || l === "");
  if (allSingleChars && lines.length >= 3) {
    const sequence = lines.filter(Boolean).join("");
    if (/^[A-Z][a-z0-9_+\-^]+$/.test(sequence)) {
      // Chemical formula or math token
      return `\\text{${sequence}}`;
    }
  }

  return null;
}

export function detectLatexCommandCorruption(
  block: ContentBlock,
  _context: RepairContext,
): DetectionResult | null {
  // Exclude code blocks
  if (block.type === "code") {
    return null;
  }

  // 1. Try vertical corruption first
  const verticalRepaired = repairVerticalLatexCorruption(block.raw);
  if (verticalRepaired && verticalRepaired !== block.raw) {
    return {
      detected: true,
      ruleId: "latex-command-corruption",
      confidence: 0.98,
      confidenceLevel: "HIGH",
      reason: "شکستگی عمودی و خرابی دستور LaTeX/فرمول شیمیایی شناسایی و یکپارچه شد.",
      repaired: verticalRepaired,
      changedPartBefore: block.raw.length > 80 ? block.raw.slice(0, 80) + "..." : block.raw,
      changedPartAfter: verticalRepaired,
    };
  }

  // 2. Horizontal command corruption
  const horizontalRepaired = repairHorizontalLatexCommands(block.raw);
  if (horizontalRepaired !== block.raw) {
    return {
      detected: true,
      ruleId: "latex-command-corruption",
      confidence: 0.96,
      confidenceLevel: "HIGH",
      reason: "الگوی شناخته‌شده خرابی دستورات LaTeX/فرمول‌های ریاضی شناسایی و اصلاح شد.",
      repaired: horizontalRepaired,
      changedPartBefore: block.raw.length > 80 ? block.raw.slice(0, 80) + "..." : block.raw,
      changedPartAfter: horizontalRepaired.length > 80 ? horizontalRepaired.slice(0, 80) + "..." : horizontalRepaired,
    };
  }

  return null;
}
