/**
 * Rule: LaTeX Delimiter Corruption.
 *
 * Repairs broken/unclosed LaTeX delimiters when math syntax is definitively present,
 * while STRICTLY preserving genuine currency dollar amounts (e.g. "قیمت دارو $0.77 است.").
 */

import type { ContentBlock, DetectionResult, RepairContext } from "../types.js";

/**
 * Checks if a string contains definite math or scientific LaTeX indicators.
 */
function hasMathIndicators(str: string): boolean {
  return (
    /\\[a-zA-Z]+/.test(str) || // LaTeX command like \text, \frac, \alpha
    /g\/cm\^?3|mg\/dL|mmol\/L|mol\/L/.test(str) || // Scientific units with powers
    /[-+=^_]\s*\d+/.test(str) || // Superscripts/subscripts or equation signs
    /[α-ωΑ-Ω]/.test(str) // Greek letters
  );
}

/**
 * Checks if a dollar sign is part of a standard currency expression.
 * Examples: "$100", "$0.77 است", "$50 هزار تومان"
 */
function isCurrencyContext(line: string, dollarIndex: number): boolean {
  const afterDollar = line.slice(dollarIndex + 1);
  // Match currency: number optionally followed by currency words or end of sentence/space
  const currencyMatch = afterDollar.match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:USD|تومان|ریال|هزار|میلیون|دلار|است|می‌باشد|[.,؛!؟\s]|$))/);
  if (currencyMatch) {
    const candidateRest = afterDollar.slice(currencyMatch[1].length);
    // If the rest of the line does NOT have LaTeX math indicators before the next sentence break, it's currency
    if (!hasMathIndicators(candidateRest)) {
      return true;
    }
  }
  return false;
}

/**
 * Repairs unclosed inline LaTeX math expressions.
 */
function repairInlineMathDelimiters(line: string): string {
  // If line already has balanced pairs of `$`, check if there's an unclosed one
  const dollarIndices: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "$" && (i === 0 || line[i - 1] !== "\\")) {
      dollarIndices.push(i);
    }
  }

  // If odd number of dollar signs, one is unclosed
  if (dollarIndices.length % 2 === 1) {
    const lastDollarIdx = dollarIndices[dollarIndices.length - 1];
    const afterLastDollar = line.slice(lastDollarIdx + 1);

    // If it's a currency context, do NOT turn it into math
    if (isCurrencyContext(line, lastDollarIdx)) {
      return line;
    }

    // If it clearly contains math indicators (e.g. `\text{ g/cm}^3`, `\frac`, powers, chemistry), repair with closing `$`
    if (hasMathIndicators(afterLastDollar)) {
      // Find where the math expression ends (e.g., before Persian punctuation, space before Persian word, or end of line)
      const mathEndMatch = afterLastDollar.match(/([^\u0600-\u06FF\n]+)/);
      if (mathEndMatch && mathEndMatch[1]) {
        const mathContent = mathEndMatch[1].trimEnd();
        const remainder = afterLastDollar.slice(mathContent.length);
        return line.slice(0, lastDollarIdx) + "$" + mathContent + "$" + remainder;
      }
      return line + "$";
    }
  }

  return line;
}

/**
 * Repairs unbalanced `\[ ...` and `\( ...` delimiters.
 */
function repairBracketDelimiters(text: string): string {
  let res = text;

  // Replace unclosed \[ with display math $$ ... $$
  if (res.includes("\\[") && !res.includes("\\]")) {
    res = res.replace(/\\\[([\s\S]*?)(?=\n\n|$)/g, "$$$$1$$$$");
  }

  // Replace unclosed \( with inline math $ ... $
  if (res.includes("\\(") && !res.includes("\\)")) {
    res = res.replace(/\\\(([\s\S]*?)(?=[.,؛\s\u0600-\u06FF]|$)/g, "$$1$");
  }

  return res;
}

export function detectLatexDelimiterCorruption(
  block: ContentBlock,
  _context: RepairContext,
): DetectionResult | null {
  if (block.type === "code") {
    return null;
  }

  const lines = block.raw.split("\n");
  const repairedLines = lines.map((l) => repairInlineMathDelimiters(l));
  let repairedText = repairedLines.join("\n");
  repairedText = repairBracketDelimiters(repairedText);

  if (repairedText !== block.raw) {
    return {
      detected: true,
      ruleId: "latex-delimiter-corruption",
      confidence: 0.95,
      confidenceLevel: "HIGH",
      reason: "عدم توازن و نقص در نشانه‌گذاری فرمول ریاضی (LaTeX Delimiters) اصلاح گردید.",
      repaired: repairedText,
      changedPartBefore: block.raw.length > 80 ? block.raw.slice(0, 80) + "..." : block.raw,
      changedPartAfter: repairedText.length > 80 ? repairedText.slice(0, 80) + "..." : repairedText,
    };
  }

  return null;
}
