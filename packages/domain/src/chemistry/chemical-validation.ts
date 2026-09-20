/**
 * Pure, Deterministic Chemical Structure Validator for AVANA.
 *
 * Implements conservative 2-level validation:
 * Level 1: Syntactic & Structural validation (SMILES grammar, brackets, ring closures, atom tokens, basic valence).
 * Level 2: Metadata consistency checking (Formula atom counts, Molecular Weight estimation).
 *
 * Conservative Principle:
 * Never claims 100% scientific certainty. If syntax is invalid or metadata is inconsistent,
 * returns { needsReview: true, confidence: "low" } without crashing.
 */

import type {
  ChemicalConfidence,
  ChemicalSarHighlight,
  ChemicalStructure,
  ChemicalValidationResult,
} from "./types.js";

// Standard atomic weights (IUPAC standard values)
const ATOMIC_WEIGHTS: Record<string, number> = {
  H: 1.008,
  B: 10.81,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  F: 18.998,
  Na: 22.99,
  Mg: 24.305,
  Si: 28.085,
  P: 30.974,
  S: 32.06,
  Cl: 35.45,
  K: 39.098,
  Ca: 40.078,
  Br: 79.904,
  I: 126.904,
  Fe: 55.845,
  Zn: 65.38,
};

// Organic subset elements allowed outside brackets
const ORGANIC_SUBSET = new Set([
  "B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I",
  "b", "c", "n", "o", "p", "s",
]);

/**
 * Parses a molecular formula like "C14H22N2O" into element counts and estimated MW.
 */
export function parseMolecularFormula(
  formula: string,
): { counts: Record<string, number>; molecularWeight: number } | null {
  if (!formula || typeof formula !== "string") return null;

  const trimmed = formula.trim().replace(/\s+/g, "");
  if (!trimmed || !/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
    return null;
  }

  const counts: Record<string, number> = {};
  const elementRegex = /([A-Z][a-z]?)(?:_?\{?(\d+)\}?)?/g;
  let match: RegExpExecArray | null;
  let totalLength = 0;

  while ((match = elementRegex.exec(trimmed)) !== null) {
    const el = match[1];
    const qty = match[2] ? parseInt(match[2], 10) : 1;
    if (qty <= 0) return null;
    counts[el] = (counts[el] || 0) + qty;
    totalLength += match[0].length;
  }

  // If not all characters were consumed, formula syntax is malformed
  if (totalLength !== trimmed.length) {
    return null;
  }

  let molecularWeight = 0;
  for (const [el, qty] of Object.entries(counts)) {
    const weight = ATOMIC_WEIGHTS[el];
    if (weight === undefined) {
      // Unknown element
      return null;
    }
    molecularWeight += weight * qty;
  }

  return {
    counts,
    molecularWeight: Math.round(molecularWeight * 100) / 100,
  };
}

/**
 * Tokenizes a SMILES string and extracts heavy atom counts while checking structural grammar.
 */
export function parseSmilesStructure(smiles: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  atomCounts: Record<string, number>;
  totalHeavyAtoms: number;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const atomCounts: Record<string, number> = {};
  let totalHeavyAtoms = 0;

  if (!smiles || typeof smiles !== "string" || smiles.trim().length === 0) {
    return {
      valid: false,
      errors: ["SMILES string is empty"],
      warnings,
      atomCounts,
      totalHeavyAtoms: 0,
    };
  }

  const s = smiles.trim();

  // 1. Bracket & Parenthesis matching
  let parenDepth = 0;
  let inBracket = false;
  let bracketContent = "";
  const ringOccurrences: Record<string, number> = {};

  let i = 0;
  while (i < s.length) {
    const char = s[i];

    if (char === "(") {
      if (inBracket) {
        errors.push("Nested parenthesis inside square bracket is invalid");
      }
      parenDepth++;
      i++;
      continue;
    }

    if (char === ")") {
      parenDepth--;
      if (parenDepth < 0) {
        errors.push("Unmatched closing parenthesis ')'");
      }
      i++;
      continue;
    }

    if (char === "[") {
      if (inBracket) {
        errors.push("Nested square brackets '[' are invalid");
      }
      inBracket = true;
      bracketContent = "";
      i++;
      continue;
    }

    if (char === "]") {
      if (!inBracket) {
        errors.push("Unmatched closing square bracket ']'");
      } else {
        inBracket = false;
        // Parse bracket content e.g. "NH+", "O-", "Fe+2", "13CH4", "nH", "CH2", "Cl-", "Na+"
        const bracketMatch = bracketContent.match(
          /^(\d+)?(Cl|Br|Na|Mg|Al|Si|Ca|Fe|Zn|Cu|Ag|Au|Pt|Se|As|Li|se|as|[BCNOPSFIKcb단nopsA-Z])(@+)?(H\d*)?([+-]\d*|\d*[+-])?$/,
        );
        if (!bracketMatch) {
          errors.push(`Malformed bracket atom syntax '[${bracketContent}]'`);
        } else {
          const rawEl = bracketMatch[2];
          // Standardize aromatic or titlecase element
          const standardEl =
            rawEl.length === 1
              ? rawEl.toUpperCase()
              : rawEl.charAt(0).toUpperCase() + rawEl.charAt(1).toLowerCase();

          atomCounts[standardEl] = (atomCounts[standardEl] || 0) + 1;
          if (standardEl !== "H") {
            totalHeavyAtoms++;
          }
        }
      }
      i++;
      continue;
    }

    if (inBracket) {
      bracketContent += char;
      i++;
      continue;
    }

    // 2. Ring closure digits (1-9 and %10-%99)
    if (char === "%") {
      const nextTwo = s.slice(i + 1, i + 3);
      if (/^\d\d$/.test(nextTwo)) {
        ringOccurrences[nextTwo] = (ringOccurrences[nextTwo] || 0) + 1;
        i += 3;
        continue;
      } else {
        errors.push(`Invalid ring closure syntax near '%${nextTwo}'`);
        i++;
        continue;
      }
    }

    if (/\d/.test(char)) {
      ringOccurrences[char] = (ringOccurrences[char] || 0) + 1;
      i++;
      continue;
    }

    // 3. Bond symbols
    if (/[-=#$:~/\\.]/.test(char)) {
      // Valid bond symbol
      i++;
      continue;
    }

    // 4. Two-letter organic subset outside brackets: Cl, Br
    if (char === "C" && s[i + 1] === "l") {
      atomCounts["Cl"] = (atomCounts["Cl"] || 0) + 1;
      totalHeavyAtoms++;
      i += 2;
      continue;
    }

    if (char === "B" && s[i + 1] === "r") {
      atomCounts["Br"] = (atomCounts["Br"] || 0) + 1;
      totalHeavyAtoms++;
      i += 2;
      continue;
    }

    // 5. Single-letter organic subset atoms
    if (ORGANIC_SUBSET.has(char)) {
      const standardEl = char.toUpperCase();
      atomCounts[standardEl] = (atomCounts[standardEl] || 0) + 1;
      totalHeavyAtoms++;
      i++;
      continue;
    }

    // Unrecognized character
    errors.push(`Unrecognized SMILES character '${char}' at position ${i}`);
    i++;
  }

  if (inBracket) {
    errors.push("Unclosed square bracket '['");
  }
  if (parenDepth !== 0) {
    errors.push("Unbalanced parentheses '(' and ')'");
  }

  // Verify ring closures: each ring digit must occur an even number of times (opened and closed)
  for (const [ringId, count] of Object.entries(ringOccurrences)) {
    if (count % 2 !== 0) {
      errors.push(
        `Unmatched ring closure for ring identifier '${ringId}' (occurred ${count} times, expected even open/close pair)`,
      );
    }
  }

  if (totalHeavyAtoms === 0 && errors.length === 0) {
    errors.push("SMILES contains no detectable heavy atoms");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    atomCounts,
    totalHeavyAtoms,
  };
}

/**
 * Validates a chemical structure and returns a conservative validation result.
 */
export function validateChemicalStructure(
  structure: ChemicalStructure,
): ChemicalValidationResult {
  if (!structure || typeof structure !== "object") {
    return {
      valid: false,
      needsReview: true,
      confidence: "low",
      errors: ["Invalid or null structure object provided"],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  let confidence: ChemicalConfidence = "high";

  // Level 1: Syntactic & Structural validation
  const structAnalysis = parseSmilesStructure(structure.smiles || "");
  if (!structAnalysis.valid) {
    errors.push(...structAnalysis.errors);
    confidence = "low";
  }

  // Level 2: Metadata consistency cross-checks
  let extractedFormula: string | undefined;
  let estimatedMolecularWeight: number | undefined;

  if (structure.formula && structure.formula.trim().length > 0) {
    const parsedFormula = parseMolecularFormula(structure.formula);
    if (!parsedFormula) {
      warnings.push(`Formula '${structure.formula}' has invalid or unsupported syntax`);
      confidence = "low";
    } else {
      extractedFormula = structure.formula.trim();
      estimatedMolecularWeight = parsedFormula.molecularWeight;

      // Cross-check heavy atom counts between SMILES and formula
      if (structAnalysis.valid) {
        for (const [el, formulaCount] of Object.entries(parsedFormula.counts)) {
          if (el === "H") continue; // Implicit hydrogens in SMILES vary by protonation
          const smilesCount = structAnalysis.atomCounts[el] || 0;
          if (smilesCount !== formulaCount) {
            warnings.push(
              `Atom count mismatch for element ${el}: Formula specifies ${formulaCount}, but SMILES contains ${smilesCount}`,
            );
            confidence = "low";
          }
        }
        for (const [el, smilesCount] of Object.entries(structAnalysis.atomCounts)) {
          if (el === "H") continue;
          const formulaCount = parsedFormula.counts[el] || 0;
          if (formulaCount === 0 && smilesCount > 0) {
            warnings.push(
              `Element ${el} present in SMILES (${smilesCount}) but absent in formula`,
            );
            confidence = "low";
          }
        }
      }
    }
  } else {
    // Missing optional formula -> medium confidence
    if (confidence === "high") {
      confidence = "medium";
    }
  }

  // Cross-check Molecular Weight if provided
  if (
    typeof structure.molecularWeight === "number" &&
    !isNaN(structure.molecularWeight) &&
    structure.molecularWeight > 0
  ) {
    if (estimatedMolecularWeight !== undefined) {
      const diff = Math.abs(structure.molecularWeight - estimatedMolecularWeight);
      if (diff > 3.0) {
        warnings.push(
          `Provided molecular weight (${structure.molecularWeight}) differs significantly from formula-derived weight (~${estimatedMolecularWeight})`,
        );
        confidence = "low";
      }
    }
  } else if (structure.molecularWeight !== undefined) {
    warnings.push("Invalid non-numeric molecular weight provided");
    confidence = "low";
  }

  // Compound name check
  if (!structure.compoundName || structure.compoundName.trim().length === 0) {
    warnings.push("Compound name is missing or empty");
    if (confidence === "high") {
      confidence = "medium";
    }
  }

  const valid = errors.length === 0;
  const needsReview = !valid || confidence === "low" || warnings.length > 0;

  return {
    valid,
    needsReview,
    confidence,
    errors,
    warnings,
    extractedFormula,
    estimatedMolecularWeight,
  };
}

/**
 * Pure, deterministic parser for fenced ```chemical or ```smiles code blocks.
 */
export function parseChemicalCodeContent(
  raw: string,
  lang: string,
): ChemicalStructure | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (lang === "smiles") {
    const lines = trimmed.split("\n");
    const firstLine = lines[0].trim();
    const commentMatch = firstLine.match(/^([^#]+)(?:#\s*(.+))?$/);
    const smiles = commentMatch ? commentMatch[1].trim() : firstLine;
    const compoundName =
      commentMatch && commentMatch[2] ? commentMatch[2].trim() : "ساختار شیمیایی";

    return {
      compoundName,
      smiles,
    };
  }

  if (lang === "chemical") {
    // 1. Try JSON
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed && (typeof parsed.smiles === "string" || typeof parsed.smi === "string")) {
          const rawSmiles = String(parsed.smiles || parsed.smi);
          return {
            id: typeof parsed.id === "string" ? parsed.id : undefined,
            compoundName:
              typeof parsed.compoundName === "string"
                ? parsed.compoundName
                : typeof parsed.name === "string"
                ? parsed.name
                : "ساختار شیمیایی",
            smiles: rawSmiles,
            iupacName: typeof parsed.iupacName === "string" ? parsed.iupacName : undefined,
            formula: typeof parsed.formula === "string" ? parsed.formula : undefined,
            molecularWeight:
              typeof parsed.molecularWeight === "number"
                ? parsed.molecularWeight
                : typeof parsed.weight === "number"
                ? parsed.weight
                : undefined,
            drugClass:
              typeof parsed.drugClass === "string"
                ? parsed.drugClass
                : typeof parsed.class === "string"
                ? parsed.class
                : undefined,
            sarHighlights: Array.isArray(parsed.sarHighlights)
              ? (parsed.sarHighlights as ChemicalSarHighlight[])
              : Array.isArray(parsed.sar)
              ? (parsed.sar as Array<{ feature?: string; description?: string } | string>).map(
                  (item) => {
                    if (typeof item === "string") {
                      const colonIdx = item.indexOf(":");
                      return colonIdx > 0
                        ? {
                            feature: item.slice(0, colonIdx).trim(),
                            description: item.slice(colonIdx + 1).trim(),
                          }
                        : { feature: "نکته ساختاری", description: item };
                    }
                    return {
                      feature: item.feature || "نکته ساختاری",
                      description: item.description || "",
                    };
                  },
                )
              : undefined,
          };
        }
      } catch {
        // Fallback to key-value
      }
    }

    // 2. Parse YAML-like key-value format
    const lines = trimmed.split("\n");
    const result: Partial<ChemicalStructure> = {};
    const sarHighlights: ChemicalSarHighlight[] = [];
    let inSarSection = false;

    for (const line of lines) {
      const lineTrim = line.trim();
      if (!lineTrim || lineTrim.startsWith("#")) continue;

      if (inSarSection && lineTrim.startsWith("-")) {
        const sarContent = lineTrim.replace(/^-\s*/, "").trim();
        const colonIdx = sarContent.indexOf(":");
        if (colonIdx !== -1) {
          sarHighlights.push({
            feature: sarContent.slice(0, colonIdx).trim(),
            description: sarContent.slice(colonIdx + 1).trim(),
          });
        } else {
          sarHighlights.push({
            feature: "نکته ساختاری",
            description: sarContent,
          });
        }
        continue;
      }

      const colonIdx = lineTrim.indexOf(":");
      if (colonIdx === -1) {
        if (!result.smiles && /^[A-Za-z0-9@+\-=[\]()#/\\$:%.~]+$/.test(lineTrim)) {
          result.smiles = lineTrim;
        }
        continue;
      }

      const key = lineTrim.slice(0, colonIdx).trim().toLowerCase();
      const val = lineTrim.slice(colonIdx + 1).trim();

      if (key === "sar" || key === "sarhighlights" || key === "sar_highlights") {
        inSarSection = true;
        continue;
      } else {
        inSarSection = false;
      }

      if (
        key === "name" ||
        key === "compoundname" ||
        key === "compound_name" ||
        key === "title"
      ) {
        result.compoundName = val;
      } else if (key === "smiles" || key === "smi") {
        result.smiles = val;
      } else if (key === "formula" || key === "molformula" || key === "mf") {
        result.formula = val;
      } else if (key === "weight" || key === "molecularweight" || key === "mw") {
        const num = parseFloat(val.replace(/[^\d.]/g, ""));
        if (!isNaN(num)) result.molecularWeight = num;
      } else if (key === "class" || key === "drugclass" || key === "category") {
        result.drugClass = val;
      } else if (key === "id") {
        result.id = val;
      } else if (key === "iupac" || key === "iupacname") {
        result.iupacName = val;
      }
    }

    if (sarHighlights.length > 0) {
      result.sarHighlights = sarHighlights;
    }

    if (result.smiles && result.smiles.length > 0) {
      return {
        id: result.id,
        compoundName: result.compoundName || "ساختار شیمیایی",
        smiles: result.smiles,
        iupacName: result.iupacName,
        formula: result.formula,
        molecularWeight: result.molecularWeight,
        drugClass: result.drugClass,
        sarHighlights: result.sarHighlights,
      };
    }
  }

  return null;
}

/**
 * Extracts and validates chemical structures embedded in Markdown text.
 * Represents a pure, non-destructive projection of Markdown code blocks.
 */
export function extractChemicalStructuresFromMarkdown(markdown: string): ChemicalStructure[] {
  if (!markdown || typeof markdown !== "string") return [];

  const structures: ChemicalStructure[] = [];
  const codeBlockRegex = /```(chemical|smiles)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const lang = match[1].toLowerCase();
    const rawContent = match[2];
    const parsed = parseChemicalCodeContent(rawContent, lang);
    if (parsed) {
      const validation = validateChemicalStructure(parsed);
      structures.push({
        ...parsed,
        confidence: validation.confidence,
        needsReview: validation.needsReview,
        validationErrors: validation.errors.length > 0 ? validation.errors : undefined,
        validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      });
    }
  }

  return structures;
}

