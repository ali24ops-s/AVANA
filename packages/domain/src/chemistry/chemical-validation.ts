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
  ChemicalReaction,
  ChemicalReactionStep,
  ChemicalReactionParticipant,
  ChemicalReactionCondition,
  ChemicalReactionValidationResult,
  ReactionCenter,
  BondChange,
  MechanismArrow,
  ChemicalReactionMechanism,
  AtomRef,
  BondRef,
  MechanismArrowType,
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
          /^(\d+)?(Cl|Br|Na|Mg|Al|Si|Ca|Fe|Zn|Cu|Ag|Au|Pt|Se|As|Li|se|as|[BCNOPSFIKcbnopsA-Z])(@+)?(H\d*)?([+-]\d*|\d*[+-])?$/,
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

export interface ChemicalGraphAtom {
  index: number;
  element: string;
  isAromatic: boolean;
  charge: number;
  hydrogens: number;
  isotope?: number;
  rawToken: string;
}

export interface ChemicalGraphBond {
  atom1: number;
  atom2: number;
  order: number;
  type: string;
}

export interface ChemicalGraph {
  smiles: string;
  atoms: ChemicalGraphAtom[];
  bonds: ChemicalGraphBond[];
  valid: boolean;
  errors: string[];
}

/**
 * Pure, deterministic SMILES to ChemicalGraph parser.
 * Extracts heavy atom indices, elements, charges, and topological bonds with orders.
 */
export function parseSmilesToGraph(smiles: string): ChemicalGraph {
  const atoms: ChemicalGraphAtom[] = [];
  const bonds: ChemicalGraphBond[] = [];
  const errors: string[] = [];

  if (!smiles || typeof smiles !== "string" || smiles.trim().length === 0) {
    return { smiles: "", atoms, bonds, valid: false, errors: ["Empty SMILES"] };
  }

  const s = smiles.trim();
  let currentAtomIndex: number | null = null;
  const branchStack: number[] = [];
  const openRings: Map<string, { atomIndex: number; bondType: string; bondOrder: number }> = new Map();
  let pendingBond: { bondType: string; bondOrder: number } | null = null;

  let i = 0;
  while (i < s.length) {
    const char = s[i];

    if (char === "(") {
      if (currentAtomIndex !== null) {
        branchStack.push(currentAtomIndex);
      }
      i++;
      continue;
    }

    if (char === ")") {
      if (branchStack.length > 0) {
        currentAtomIndex = branchStack.pop()!;
      }
      i++;
      continue;
    }

    if (char === ".") {
      currentAtomIndex = null;
      pendingBond = null;
      i++;
      continue;
    }

    // Bond symbols: -, =, #, :, ~, /, \
    if (char === "=") {
      pendingBond = { bondType: "=", bondOrder: 2 };
      i++;
      continue;
    }
    if (char === "#") {
      pendingBond = { bondType: "#", bondOrder: 3 };
      i++;
      continue;
    }
    if (char === ":") {
      pendingBond = { bondType: ":", bondOrder: 1.5 };
      i++;
      continue;
    }
    if (char === "-" || char === "~" || char === "/" || char === "\\") {
      pendingBond = { bondType: char, bondOrder: 1 };
      i++;
      continue;
    }

    // Ring closure digits %10-%99 or 0-9
    if (char === "%" || /\d/.test(char)) {
      let ringId: string;
      if (char === "%") {
        ringId = s.slice(i + 1, i + 3);
        i += 3;
      } else {
        ringId = char;
        i++;
      }

      if (currentAtomIndex !== null) {
        if (openRings.has(ringId)) {
          const prev = openRings.get(ringId)!;
          const order = pendingBond ? pendingBond.bondOrder : prev.bondOrder;
          const type = pendingBond ? pendingBond.bondType : prev.bondType;
          bonds.push({
            atom1: prev.atomIndex,
            atom2: currentAtomIndex,
            order,
            type,
          });
          openRings.delete(ringId);
          pendingBond = null;
        } else {
          openRings.set(ringId, {
            atomIndex: currentAtomIndex,
            bondType: pendingBond ? pendingBond.bondType : "-",
            bondOrder: pendingBond ? pendingBond.bondOrder : 1,
          });
          pendingBond = null;
        }
      }
      continue;
    }

    // Bracket atom [ ... ]
    if (char === "[") {
      const closeIdx = s.indexOf("]", i);
      if (closeIdx === -1) {
        errors.push("Unclosed square bracket '['");
        break;
      }
      const bracketContent = s.slice(i + 1, closeIdx);
      i = closeIdx + 1;

      const bracketMatch = bracketContent.match(
        /^(\d+)?(Cl|Br|Na|Mg|Al|Si|Ca|Fe|Zn|Cu|Ag|Au|Pt|Se|As|Li|se|as|[BCNOPSFIKcb단nopsA-Z])(@+)?(H\d*)?([+-]\d*|\d*[+-])?$/,
      );

      let element = "C";
      let charge = 0;
      let hydrogens = 0;
      let isAromatic = false;
      let isotope: number | undefined;

      if (bracketMatch) {
        if (bracketMatch[1]) isotope = parseInt(bracketMatch[1], 10);
        const rawEl = bracketMatch[2];
        isAromatic = /^[bcnops]$/.test(rawEl);
        element =
          rawEl.length === 1
            ? rawEl.toUpperCase()
            : rawEl.charAt(0).toUpperCase() + rawEl.charAt(1).toLowerCase();

        if (bracketMatch[4]) {
          const hStr = bracketMatch[4].slice(1);
          hydrogens = hStr ? parseInt(hStr, 10) : 1;
        }
        if (bracketMatch[5]) {
          const chStr = bracketMatch[5];
          if (chStr === "+" || chStr === "1+") charge = 1;
          else if (chStr === "-" || chStr === "1-") charge = -1;
          else if (chStr.endsWith("+")) charge = parseInt(chStr.slice(0, -1), 10);
          else if (chStr.endsWith("-")) charge = -parseInt(chStr.slice(0, -1), 10);
          else if (chStr.startsWith("+")) charge = parseInt(chStr.slice(1), 10) || 1;
          else if (chStr.startsWith("-")) charge = -parseInt(chStr.slice(1), 10) || -1;
        }
      } else {
        element = bracketContent;
      }

      const newAtomIndex = atoms.length;
      atoms.push({
        index: newAtomIndex,
        element,
        isAromatic,
        charge,
        hydrogens,
        isotope,
        rawToken: `[${bracketContent}]`,
      });

      if (currentAtomIndex !== null) {
        const order = pendingBond ? pendingBond.bondOrder : isAromatic && atoms[currentAtomIndex].isAromatic ? 1.5 : 1;
        const type = pendingBond ? pendingBond.bondType : isAromatic && atoms[currentAtomIndex].isAromatic ? ":" : "-";
        bonds.push({
          atom1: currentAtomIndex,
          atom2: newAtomIndex,
          order,
          type,
        });
      }

      currentAtomIndex = newAtomIndex;
      pendingBond = null;
      continue;
    }

    // Two-letter organic subset outside brackets: Cl, Br
    if (char === "C" && s[i + 1] === "l") {
      const newAtomIndex = atoms.length;
      atoms.push({
        index: newAtomIndex,
        element: "Cl",
        isAromatic: false,
        charge: 0,
        hydrogens: 0,
        rawToken: "Cl",
      });
      if (currentAtomIndex !== null) {
        const order = pendingBond ? pendingBond.bondOrder : 1;
        bonds.push({ atom1: currentAtomIndex, atom2: newAtomIndex, order, type: pendingBond ? pendingBond.bondType : "-" });
      }
      currentAtomIndex = newAtomIndex;
      pendingBond = null;
      i += 2;
      continue;
    }

    if (char === "B" && s[i + 1] === "r") {
      const newAtomIndex = atoms.length;
      atoms.push({
        index: newAtomIndex,
        element: "Br",
        isAromatic: false,
        charge: 0,
        hydrogens: 0,
        rawToken: "Br",
      });
      if (currentAtomIndex !== null) {
        const order = pendingBond ? pendingBond.bondOrder : 1;
        bonds.push({ atom1: currentAtomIndex, atom2: newAtomIndex, order, type: pendingBond ? pendingBond.bondType : "-" });
      }
      currentAtomIndex = newAtomIndex;
      pendingBond = null;
      i += 2;
      continue;
    }

    // Single-letter organic subset
    if (ORGANIC_SUBSET.has(char)) {
      const isAromatic = /^[bcnops]$/.test(char);
      const element = char.toUpperCase();
      const newAtomIndex = atoms.length;
      atoms.push({
        index: newAtomIndex,
        element,
        isAromatic,
        charge: 0,
        hydrogens: 0,
        rawToken: char,
      });

      if (currentAtomIndex !== null) {
        const order = pendingBond ? pendingBond.bondOrder : isAromatic && atoms[currentAtomIndex].isAromatic ? 1.5 : 1;
        const type = pendingBond ? pendingBond.bondType : isAromatic && atoms[currentAtomIndex].isAromatic ? ":" : "-";
        bonds.push({
          atom1: currentAtomIndex,
          atom2: newAtomIndex,
          order,
          type,
        });
      }

      currentAtomIndex = newAtomIndex;
      pendingBond = null;
      i++;
      continue;
    }

    // Unknown char
    i++;
  }

  return {
    smiles,
    atoms,
    bonds,
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Pure deterministic bond change detection between reactants and products.
 */
export function detectBondChanges(
  reactants: ChemicalReactionParticipant[],
  products: ChemicalReactionParticipant[],
  atomMapping?: Record<string, string>,
): {
  brokenBonds: BondChange[];
  formedBonds: BondChange[];
  orderChanges: BondChange[];
  mappingErrors: string[];
} {
  const brokenBonds: BondChange[] = [];
  const formedBonds: BondChange[] = [];
  const orderChanges: BondChange[] = [];
  const mappingErrors: string[] = [];

  const reactantGraphs = reactants.map((r) => parseSmilesToGraph(r.smiles));
  const productGraphs = products.map((p) => parseSmilesToGraph(p.smiles));

  if (!atomMapping || Object.keys(atomMapping).length === 0) {
    return { brokenBonds, formedBonds, orderChanges, mappingErrors };
  }

  const rToP = new Map<string, string>();
  const pToR = new Map<string, string>();

  for (const [rKey, pKey] of Object.entries(atomMapping)) {
    const rMatch = rKey.match(/^(?:r:)?(\d+):(\d+)$/);
    const pMatch = pKey.match(/^(?:p:)?(\d+):(\d+)$/);

    if (!rMatch || !pMatch) {
      mappingErrors.push(`Invalid atom mapping key format '${rKey}' -> '${pKey}'`);
      continue;
    }

    const rIdx = parseInt(rMatch[1], 10);
    const rAtomIdx = parseInt(rMatch[2], 10);
    const pIdx = parseInt(pMatch[1], 10);
    const pAtomIdx = parseInt(pMatch[2], 10);

    if (rIdx < 0 || rIdx >= reactants.length) {
      mappingErrors.push(`Mapping reactant index ${rIdx} out of bounds (total reactants: ${reactants.length})`);
      continue;
    }
    if (pIdx < 0 || pIdx >= products.length) {
      mappingErrors.push(`Mapping product index ${pIdx} out of bounds (total products: ${products.length})`);
      continue;
    }

    const rGraph = reactantGraphs[rIdx];
    const pGraph = productGraphs[pIdx];

    if (!rGraph || !rGraph.atoms[rAtomIdx]) {
      mappingErrors.push(`Reactant atom '${rKey}' does not exist in reactant ${rIdx + 1}`);
      continue;
    }
    if (!pGraph || !pGraph.atoms[pAtomIdx]) {
      mappingErrors.push(`Product atom '${pKey}' does not exist in product ${pIdx + 1}`);
      continue;
    }

    const rNorm = `${rIdx}:${rAtomIdx}`;
    const pNorm = `${pIdx}:${pAtomIdx}`;

    if (rToP.has(rNorm)) {
      mappingErrors.push(`Duplicate mapping for reactant atom '${rKey}' (already mapped to '${rToP.get(rNorm)}')`);
      continue;
    }
    if (pToR.has(pNorm)) {
      mappingErrors.push(`Duplicate mapping to product atom '${pKey}' (already mapped from '${pToR.get(pNorm)}')`);
      continue;
    }

    const rEl = rGraph.atoms[rAtomIdx].element;
    const pEl = pGraph.atoms[pAtomIdx].element;

    if (rEl !== pEl) {
      mappingErrors.push(
        `Element mismatch in atom mapping: Reactant '${rKey}' is '${rEl}' but Product '${pKey}' is '${pEl}'`,
      );
    }

    rToP.set(rNorm, pNorm);
    pToR.set(pNorm, rNorm);
  }

  // If there are mapping errors, do NOT compute speculative bond changes
  if (mappingErrors.length > 0) {
    return { brokenBonds: [], formedBonds: [], orderChanges: [], mappingErrors };
  }

  // 1. Find Broken Bonds & Order Changes in Reactants
  for (let rIdx = 0; rIdx < reactantGraphs.length; rIdx++) {
    const rGraph = reactantGraphs[rIdx];
    for (const bond of rGraph.bonds) {
      const p1 = rToP.get(`${rIdx}:${bond.atom1}`);
      const p2 = rToP.get(`${rIdx}:${bond.atom2}`);

      if (p1 && p2) {
        const [pIdx1, pAtom1] = p1.split(":").map(Number);
        const [pIdx2, pAtom2] = p2.split(":").map(Number);

        if (pIdx1 === pIdx2) {
          const prodGraph = productGraphs[pIdx1];
          const prodBond = prodGraph.bonds.find(
            (b) =>
              (b.atom1 === pAtom1 && b.atom2 === pAtom2) ||
              (b.atom1 === pAtom2 && b.atom2 === pAtom1),
          );

          if (!prodBond) {
            brokenBonds.push({
              type: "broken",
              atom1: { participantRole: "reactant", participantIndex: rIdx, atomIndex: bond.atom1, element: rGraph.atoms[bond.atom1].element },
              atom2: { participantRole: "reactant", participantIndex: rIdx, atomIndex: bond.atom2, element: rGraph.atoms[bond.atom2].element },
              previousOrder: bond.order,
            });
          } else if (prodBond.order !== bond.order) {
            orderChanges.push({
              type: "order_change",
              atom1: { participantRole: "reactant", participantIndex: rIdx, atomIndex: bond.atom1, element: rGraph.atoms[bond.atom1].element },
              atom2: { participantRole: "reactant", participantIndex: rIdx, atomIndex: bond.atom2, element: rGraph.atoms[bond.atom2].element },
              previousOrder: bond.order,
              newOrder: prodBond.order,
            });
          }
        } else {
          brokenBonds.push({
            type: "broken",
            atom1: { participantRole: "reactant", participantIndex: rIdx, atomIndex: bond.atom1, element: rGraph.atoms[bond.atom1].element },
            atom2: { participantRole: "reactant", participantIndex: rIdx, atomIndex: bond.atom2, element: rGraph.atoms[bond.atom2].element },
            previousOrder: bond.order,
          });
        }
      }
    }
  }

  // 2. Find Formed Bonds in Products
  for (let pIdx = 0; pIdx < productGraphs.length; pIdx++) {
    const pGraph = productGraphs[pIdx];
    for (const bond of pGraph.bonds) {
      const r1 = pToR.get(`${pIdx}:${bond.atom1}`);
      const r2 = pToR.get(`${pIdx}:${bond.atom2}`);

      if (r1 && r2) {
        const [rIdx1, rAtom1] = r1.split(":").map(Number);
        const [rIdx2, rAtom2] = r2.split(":").map(Number);

        if (rIdx1 !== rIdx2) {
          formedBonds.push({
            type: "formed",
            atom1: { participantRole: "product", participantIndex: pIdx, atomIndex: bond.atom1, element: pGraph.atoms[bond.atom1].element },
            atom2: { participantRole: "product", participantIndex: pIdx, atomIndex: bond.atom2, element: pGraph.atoms[bond.atom2].element },
            newOrder: bond.order,
          });
        } else {
          const reactGraph = reactantGraphs[rIdx1];
          const reactBond = reactGraph.bonds.find(
            (b) =>
              (b.atom1 === rAtom1 && b.atom2 === rAtom2) ||
              (b.atom1 === rAtom2 && b.atom2 === rAtom1),
          );
          if (!reactBond) {
            formedBonds.push({
              type: "formed",
              atom1: { participantRole: "product", participantIndex: pIdx, atomIndex: bond.atom1, element: pGraph.atoms[bond.atom1].element },
              atom2: { participantRole: "product", participantIndex: pIdx, atomIndex: bond.atom2, element: pGraph.atoms[bond.atom2].element },
              newOrder: bond.order,
            });
          }
        }
      }
    }
  }

  return { brokenBonds, formedBonds, orderChanges, mappingErrors };
}

/**
 * Validates SN2 reaction mechanism, verifies reaction centers and computes deterministic mechanism arrows.
 */
export function validateSN2Mechanism(
  reactants: ChemicalReactionParticipant[],
  products: ChemicalReactionParticipant[],
  mechanism?: ChemicalReactionMechanism,
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  bondChanges: BondChange[];
  arrows: MechanismArrow[];
  reactionCenter?: ReactionCenter;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let bondChanges: BondChange[] = [];
  const arrows: MechanismArrow[] = [];

  const reactantGraphs = reactants.map((r) => parseSmilesToGraph(r.smiles));

  if (reactants.length === 0 || products.length === 0) {
    return { valid: false, errors: ["SN2 reaction requires at least one reactant and one product"], warnings, bondChanges: [], arrows: [] };
  }

  let nucleophile = mechanism?.reactionCenter?.nucleophile;
  let electrophile = mechanism?.reactionCenter?.electrophile;
  let leavingGroup = mechanism?.reactionCenter?.leavingGroup;

  // Auto-detect reaction centers ONLY when reactionCenter is completely omitted
  if (!electrophile && !leavingGroup && !nucleophile) {
    // 1. Identify substrate C-LG bond (Halogen or O/S attached to Carbon)
    for (let rIdx = 0; rIdx < reactantGraphs.length; rIdx++) {
      const g = reactantGraphs[rIdx];
      for (const b of g.bonds) {
        const a1 = g.atoms[b.atom1];
        const a2 = g.atoms[b.atom2];
        if (a1.element === "C" && ["Br", "Cl", "I", "F", "O", "S"].includes(a2.element)) {
          if (!electrophile) electrophile = { participantRole: "reactant", participantIndex: rIdx, atomIndex: a1.index, element: a1.element };
          if (!leavingGroup) leavingGroup = { participantRole: "reactant", participantIndex: rIdx, atomIndex: a2.index, element: a2.element };
        } else if (a2.element === "C" && ["Br", "Cl", "I", "F", "O", "S"].includes(a1.element)) {
          if (!electrophile) electrophile = { participantRole: "reactant", participantIndex: rIdx, atomIndex: a2.index, element: a2.element };
          if (!leavingGroup) leavingGroup = { participantRole: "reactant", participantIndex: rIdx, atomIndex: a1.index, element: a1.element };
        }
      }
    }

    // 2. Identify attacking nucleophile from separate reactant
    for (let rIdx = 0; rIdx < reactantGraphs.length; rIdx++) {
      if (electrophile && rIdx === (electrophile.participantIndex ?? 0)) continue;
      const g = reactantGraphs[rIdx];
      const nuAtom = g.atoms.find((a) => a.charge < 0 || ["O", "N", "S", "P", "C", "I", "Br", "Cl", "F"].includes(a.element));
      if (nuAtom && !nucleophile) {
        nucleophile = { participantRole: "reactant", participantIndex: rIdx, atomIndex: nuAtom.index, element: nuAtom.element };
      }
    }
  }

  // 1. Validate Electrophile
  if (!electrophile) {
    errors.push("SN2 mechanism error: Electrophilic reaction center is missing or could not be determined");
  } else {
    if (electrophile.participantIndex === undefined) {
      if (reactants.length === 1) electrophile.participantIndex = 0;
      else errors.push("SN2 mechanism error: Electrophile participantIndex is ambiguous (multiple reactants exist)");
    }
    const rIdx = electrophile.participantIndex ?? 0;
    const g = reactantGraphs[rIdx];
    if (!g || !g.atoms[electrophile.atomIndex]) {
      errors.push(`Electrophile atom index ${electrophile.atomIndex} does not exist in reactant ${rIdx + 1}`);
    } else if (electrophile.element && g.atoms[electrophile.atomIndex].element !== electrophile.element) {
      errors.push(
        `Electrophile element mismatch: expected '${electrophile.element}', but atom ${electrophile.atomIndex} is '${g.atoms[electrophile.atomIndex].element}'`,
      );
    } else {
      const elEl = g.atoms[electrophile.atomIndex].element;
      if (!["C", "P", "S", "Si"].includes(elEl)) {
        errors.push(`Electrophile element '${elEl}' is not a recognized electrophilic element in SN2`);
      }
    }
  }

  // 2. Validate Leaving Group
  if (!leavingGroup) {
    errors.push("SN2 mechanism error: Leaving group is missing or could not be determined");
  } else {
    if (leavingGroup.participantIndex === undefined) {
      if (reactants.length === 1) leavingGroup.participantIndex = 0;
      else errors.push("SN2 mechanism error: Leaving group participantIndex is ambiguous (multiple reactants exist)");
    }
    const rIdx = leavingGroup.participantIndex ?? 0;
    const g = reactantGraphs[rIdx];
    if (!g || !g.atoms[leavingGroup.atomIndex]) {
      errors.push(`Leaving group atom index ${leavingGroup.atomIndex} does not exist in reactant ${rIdx + 1}`);
    } else if (leavingGroup.element && g.atoms[leavingGroup.atomIndex].element !== leavingGroup.element) {
      errors.push(
        `Leaving group element mismatch: expected '${leavingGroup.element}', but atom ${leavingGroup.atomIndex} is '${g.atoms[leavingGroup.atomIndex].element}'`,
      );
    }
  }

  // 3. Validate Nucleophile
  if (!nucleophile) {
    errors.push("SN2 mechanism error: Nucleophile is missing or could not be determined");
  } else {
    if (nucleophile.participantIndex === undefined) {
      if (reactants.length === 1) nucleophile.participantIndex = 0;
      else errors.push("SN2 mechanism error: Nucleophile participantIndex is ambiguous (multiple reactants exist)");
    }
    const rIdx = nucleophile.participantIndex ?? 0;
    const g = reactantGraphs[rIdx];
    if (!g || !g.atoms[nucleophile.atomIndex]) {
      errors.push(`Nucleophile atom index ${nucleophile.atomIndex} does not exist in reactant ${rIdx + 1}`);
    } else if (nucleophile.element && g.atoms[nucleophile.atomIndex].element !== nucleophile.element) {
      errors.push(
        `Nucleophile element mismatch: expected '${nucleophile.element}', but atom ${nucleophile.atomIndex} is '${g.atoms[nucleophile.atomIndex].element}'`,
      );
    }
  }

  // 4. CRITICAL RULE: Electrophile and Leaving Group MUST belong to same reactant and be DIRECTLY BONDED!
  if (electrophile && leavingGroup && errors.length === 0) {
    const elRIdx = electrophile.participantIndex ?? 0;
    const lgRIdx = leavingGroup.participantIndex ?? 0;
    if (elRIdx !== lgRIdx) {
      errors.push("SN2 mechanism error: Electrophile and Leaving Group must belong to the same reactant molecule");
    } else {
      const g = reactantGraphs[elRIdx];
      const bond = g?.bonds.find(
        (b) =>
          (b.atom1 === electrophile!.atomIndex && b.atom2 === leavingGroup!.atomIndex) ||
          (b.atom1 === leavingGroup!.atomIndex && b.atom2 === electrophile!.atomIndex),
      );
      if (!bond) {
        errors.push(
          `SN2 mechanism error: Leaving group (atom ${leavingGroup.atomIndex}) is not bonded to electrophile (atom ${electrophile.atomIndex}) in reactant ${elRIdx + 1}`,
        );
      }
    }
  }

  // 5. Detect and Cross-Verify Bond Changes if atomMapping is provided
  if (errors.length === 0 && mechanism?.atomMapping) {
    const changes = detectBondChanges(reactants, products, mechanism.atomMapping);
    if (changes.mappingErrors.length > 0) {
      errors.push(...changes.mappingErrors);
    } else {
      bondChanges = [...changes.brokenBonds, ...changes.formedBonds, ...changes.orderChanges];

      // Invariant 1: C-LG bond must be broken
      const cLgBroken = changes.brokenBonds.some(
        (bc) =>
          (bc.atom1.atomIndex === electrophile!.atomIndex && bc.atom2.atomIndex === leavingGroup!.atomIndex) ||
          (bc.atom1.atomIndex === leavingGroup!.atomIndex && bc.atom2.atomIndex === electrophile!.atomIndex),
      );
      if (!cLgBroken) {
        errors.push(
          `SN2 mechanism inconsistency: C-LG bond (atoms ${electrophile!.atomIndex}-${leavingGroup!.atomIndex}) is not cleaved in the product atom mapping`,
        );
      }

      // Invariant 2: Nu-E bond must be formed
      const rNuKey = `${nucleophile!.participantIndex ?? 0}:${nucleophile!.atomIndex}`;
      const rEKey = `${electrophile!.participantIndex ?? 0}:${electrophile!.atomIndex}`;
      const pNuKey = mechanism.atomMapping[rNuKey] || mechanism.atomMapping[`r:${rNuKey}`];
      const pEKey = mechanism.atomMapping[rEKey] || mechanism.atomMapping[`r:${rEKey}`];

      if (pNuKey && pEKey) {
        const [pNuIdx, pNuAtom] = pNuKey.replace(/^p:/, "").split(":").map(Number);
        const [pEIdx, pEAtom] = pEKey.replace(/^p:/, "").split(":").map(Number);

        const nuEFormed = changes.formedBonds.some(
          (bc) =>
            (bc.atom1.participantIndex === pNuIdx && bc.atom1.atomIndex === pNuAtom &&
             bc.atom2.participantIndex === pEIdx && bc.atom2.atomIndex === pEAtom) ||
            (bc.atom1.participantIndex === pEIdx && bc.atom1.atomIndex === pEAtom &&
             bc.atom2.participantIndex === pNuIdx && bc.atom2.atomIndex === pNuAtom),
        );

        if (!nuEFormed) {
          errors.push(
            `SN2 mechanism inconsistency: Nu-E bond (Nu atom ${nucleophile!.atomIndex} -> E atom ${electrophile!.atomIndex}) is not formed in the product structure`,
          );
        }
      }
    }
  } else if (errors.length === 0 && electrophile && leavingGroup && nucleophile) {
    bondChanges = [
      {
        type: "broken",
        atom1: electrophile,
        atom2: leavingGroup,
        previousOrder: 1,
      },
      {
        type: "formed",
        atom1: nucleophile,
        atom2: electrophile,
        newOrder: 1,
      },
    ];
  }

  // 6. Generate Deterministic Mechanism Arrows (ONLY if 0 errors!)
  if (errors.length === 0 && nucleophile && electrophile && leavingGroup) {
    arrows.push({
      id: "arrow_nu_to_c",
      type: "lone_pair_to_atom",
      from: {
        type: "lone_pair",
        atom: nucleophile,
      },
      to: {
        type: "atom",
        atom: electrophile,
      },
      label: "حمله نوکلئوفیلی",
      direction: "counter-clockwise",
    });

    arrows.push({
      id: "arrow_bond_to_lg",
      type: "bond_to_atom",
      from: {
        type: "bond",
        bond: {
          participantRole: "reactant",
          participantIndex: electrophile.participantIndex ?? 0,
          atom1: electrophile.atomIndex,
          atom2: leavingGroup.atomIndex,
        },
      },
      to: {
        type: "atom",
        atom: leavingGroup,
      },
      label: "خروج گروه ترک‌کننده",
      direction: "clockwise",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    bondChanges: errors.length === 0 ? bondChanges : [],
    arrows: errors.length === 0 ? arrows : [],
    reactionCenter: errors.length === 0 && nucleophile && electrophile && leavingGroup ? { nucleophile, electrophile, leavingGroup } : undefined,
  };
}

/**
 * Topologically verifies custom mechanism arrows against reactant, product, or intermediate participants.
 */
export function validateCustomMechanismArrows(
  reactants: ChemicalReactionParticipant[],
  products: ChemicalReactionParticipant[],
  intermediates: ChemicalReactionParticipant[] = [],
  arrows: MechanismArrow[],
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const reactantGraphs = reactants.map((r) => parseSmilesToGraph(r.smiles || ""));
  const productGraphs = products.map((p) => parseSmilesToGraph(p.smiles || ""));
  const intermediateGraphs = intermediates.map((inter) => parseSmilesToGraph(inter.smiles || ""));

  function getGraph(role: string, index: number) {
    if (role === "reactant") return reactantGraphs[index];
    if (role === "product") return productGraphs[index];
    if (role === "intermediate") return intermediateGraphs[index];
    return undefined;
  }

  for (let aIdx = 0; aIdx < arrows.length; aIdx++) {
    const arrow = arrows[aIdx];
    const arrowId = arrow.id || `arrow[${aIdx}]`;

    if (arrow.electronCount !== undefined && arrow.electronCount !== 1 && arrow.electronCount !== 2) {
      errors.push(`${arrowId}: electronCount must be either 1 or 2`);
    }

    // 1. Validate 'from'
    if (!arrow.from) {
      errors.push(`${arrowId}: 'from' specification is missing`);
      continue;
    }

    if (arrow.from.type === "atom" || arrow.from.type === "lone_pair") {
      const atomRef = arrow.from.atom;
      if (!atomRef) {
        errors.push(`${arrowId}: 'from.atom' is required for arrow starting from atom or lone_pair`);
      } else {
        const pRole = atomRef.participantRole || "reactant";
        const pIdx = atomRef.participantIndex ?? 0;
        const g = getGraph(pRole, pIdx);
        if (!g) {
          errors.push(`${arrowId}: ${pRole} participant at index ${pIdx} does not exist`);
        } else if (atomRef.atomIndex < 0 || atomRef.atomIndex >= g.atoms.length) {
          errors.push(
            `${arrowId}: Atom index ${atomRef.atomIndex} does not exist in ${pRole} ${pIdx + 1} (total atoms: ${g.atoms.length})`,
          );
        } else if (atomRef.element && g.atoms[atomRef.atomIndex].element !== atomRef.element) {
          errors.push(
            `${arrowId}: Element mismatch at atom ${atomRef.atomIndex}: expected '${atomRef.element}', found '${g.atoms[atomRef.atomIndex].element}'`,
          );
        }
      }
    } else if (arrow.from.type === "bond") {
      const bondRef = arrow.from.bond;
      if (!bondRef) {
        errors.push(`${arrowId}: 'from.bond' is required for arrow starting from bond`);
      } else {
        const pRole = bondRef.participantRole || "reactant";
        const pIdx = bondRef.participantIndex ?? 0;
        const g = getGraph(pRole, pIdx);
        if (!g) {
          errors.push(`${arrowId}: ${pRole} participant at index ${pIdx} does not exist`);
        } else {
          if (bondRef.atom1 < 0 || bondRef.atom1 >= g.atoms.length) {
            errors.push(`${arrowId}: Bond atom1 index ${bondRef.atom1} does not exist in ${pRole} ${pIdx + 1}`);
          }
          if (bondRef.atom2 < 0 || bondRef.atom2 >= g.atoms.length) {
            errors.push(`${arrowId}: Bond atom2 index ${bondRef.atom2} does not exist in ${pRole} ${pIdx + 1}`);
          }
          if (
            bondRef.atom1 >= 0 &&
            bondRef.atom1 < g.atoms.length &&
            bondRef.atom2 >= 0 &&
            bondRef.atom2 < g.atoms.length
          ) {
            const bondExists = g.bonds.some(
              (b) =>
                (b.atom1 === bondRef.atom1 && b.atom2 === bondRef.atom2) ||
                (b.atom1 === bondRef.atom2 && b.atom2 === bondRef.atom1),
            );
            if (!bondExists) {
              errors.push(
                `${arrowId}: No chemical bond exists between atom ${bondRef.atom1} and atom ${bondRef.atom2} in ${pRole} ${pIdx + 1}`,
              );
            }
          }
        }
      }
    }

    // 2. Validate 'to'
    if (!arrow.to) {
      errors.push(`${arrowId}: 'to' specification is missing`);
      continue;
    }

    if (arrow.to.type === "atom") {
      const atomRef = arrow.to.atom;
      if (!atomRef) {
        errors.push(`${arrowId}: 'to.atom' is required for arrow terminating at atom`);
      } else {
        const pRole = atomRef.participantRole || "reactant";
        const pIdx = atomRef.participantIndex ?? 0;
        const g = getGraph(pRole, pIdx);
        if (!g) {
          errors.push(`${arrowId}: ${pRole} participant at index ${pIdx} does not exist`);
        } else if (atomRef.atomIndex < 0 || atomRef.atomIndex >= g.atoms.length) {
          errors.push(
            `${arrowId}: Atom index ${atomRef.atomIndex} does not exist in ${pRole} ${pIdx + 1} (total atoms: ${g.atoms.length})`,
          );
        } else if (atomRef.element && g.atoms[atomRef.atomIndex].element !== atomRef.element) {
          errors.push(
            `${arrowId}: Element mismatch at atom ${atomRef.atomIndex}: expected '${atomRef.element}', found '${g.atoms[atomRef.atomIndex].element}'`,
          );
        }
      }
    } else if (arrow.to.type === "bond") {
      const bondRef = arrow.to.bond;
      if (!bondRef) {
        errors.push(`${arrowId}: 'to.bond' is required for arrow terminating at bond`);
      } else {
        const pRole = bondRef.participantRole || "reactant";
        const pIdx = bondRef.participantIndex ?? 0;
        const g = getGraph(pRole, pIdx);
        if (!g) {
          errors.push(`${arrowId}: ${pRole} participant at index ${pIdx} does not exist`);
        } else {
          if (bondRef.atom1 < 0 || bondRef.atom1 >= g.atoms.length) {
            errors.push(`${arrowId}: Bond atom1 index ${bondRef.atom1} does not exist in ${pRole} ${pIdx + 1}`);
          }
          if (bondRef.atom2 < 0 || bondRef.atom2 >= g.atoms.length) {
            errors.push(`${arrowId}: Bond atom2 index ${bondRef.atom2} does not exist in ${pRole} ${pIdx + 1}`);
          }
          if (
            bondRef.atom1 >= 0 &&
            bondRef.atom1 < g.atoms.length &&
            bondRef.atom2 >= 0 &&
            bondRef.atom2 < g.atoms.length
          ) {
            const bondExists = g.bonds.some(
              (b) =>
                (b.atom1 === bondRef.atom1 && b.atom2 === bondRef.atom2) ||
                (b.atom1 === bondRef.atom2 && b.atom2 === bondRef.atom1),
            );
            if (!bondExists) {
              errors.push(
                `${arrowId}: No chemical bond exists between atom ${bondRef.atom1} and atom ${bondRef.atom2} in ${pRole} ${pIdx + 1}`,
              );
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates an E2 elimination mechanism.
 */
export function validateE2Mechanism(
  reactants: ChemicalReactionParticipant[],
  products: ChemicalReactionParticipant[],
  mechanism: ChemicalReactionMechanism,
  intermediates: ChemicalReactionParticipant[] = [],
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  validatedMechanism?: ChemicalReactionMechanism;
} {
  const warnings: string[] = [];

  // If author provided explicit arrows, validate them topologically
  if (Array.isArray(mechanism.arrows) && mechanism.arrows.length > 0) {
    const arrowRes = validateCustomMechanismArrows(
      reactants,
      products,
      intermediates,
      mechanism.arrows,
    );
    if (!arrowRes.valid) {
      return {
        valid: false,
        errors: arrowRes.errors,
        warnings: arrowRes.warnings,
      };
    }
    return {
      valid: true,
      errors: [],
      warnings: arrowRes.warnings,
      validatedMechanism: {
        ...mechanism,
        reactionType: "E2",
        isVerified: true,
      },
    };
  }

  return {
    valid: false,
    errors: ["E2 elimination requires explicit verified mechanism arrows or valid reactionCenter specification"],
    warnings,
  };
}

/**
 * General mechanism validation dispatcher.
 */
export function validateReactionMechanism(
  reactants: ChemicalReactionParticipant[],
  products: ChemicalReactionParticipant[],
  mechanism?: ChemicalReactionMechanism,
  intermediates: ChemicalReactionParticipant[] = [],
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  validatedMechanism?: ChemicalReactionMechanism;
} {
  if (!mechanism) {
    return { valid: true, errors: [], warnings: [] };
  }

  const rType = (mechanism.reactionType || "").toUpperCase();

  if (rType === "SN2" || rType === "S_N2") {
    const sn2Res = validateSN2Mechanism(reactants, products, mechanism);
    if (!sn2Res.valid) {
      return {
        valid: false,
        errors: sn2Res.errors,
        warnings: sn2Res.warnings,
      };
    }
    return {
      valid: true,
      errors: [],
      warnings: sn2Res.warnings,
      validatedMechanism: {
        ...mechanism,
        reactionType: "SN2",
        reactionCenter: sn2Res.reactionCenter || mechanism.reactionCenter,
        bondChanges: sn2Res.bondChanges,
        arrows: sn2Res.arrows,
        isVerified: true,
      },
    };
  }

  if (rType === "E2") {
    const e2Res = validateE2Mechanism(reactants, products, mechanism, intermediates);
    if (!e2Res.valid) {
      return {
        valid: false,
        errors: e2Res.errors,
        warnings: e2Res.warnings,
      };
    }
    return {
      valid: true,
      errors: [],
      warnings: e2Res.warnings,
      validatedMechanism: e2Res.validatedMechanism,
    };
  }

  // If author provided custom arrows (e.g. for Resonance, Cleavage, Addition, etc.)
  if (Array.isArray(mechanism.arrows) && mechanism.arrows.length > 0) {
    const arrowRes = validateCustomMechanismArrows(
      reactants,
      products,
      intermediates,
      mechanism.arrows,
    );
    if (!arrowRes.valid) {
      return {
        valid: false,
        errors: arrowRes.errors,
        warnings: arrowRes.warnings,
        validatedMechanism: {
          ...mechanism,
          isVerified: false,
          validationErrors: arrowRes.errors,
        },
      };
    }
    return {
      valid: true,
      errors: [],
      warnings: arrowRes.warnings,
      validatedMechanism: {
        ...mechanism,
        isVerified: true,
      },
    };
  }

  // Fallback for custom / other mechanism types in Phase 1
  return {
    valid: true,
    errors: [],
    warnings: [`نوع مکانیزم '${mechanism.reactionType}' در فاز فعلی بدون پیکان‌های اعتبارسنجی‌شده پردازش می‌شود`],
    validatedMechanism: {
      ...mechanism,
      isVerified: false,
    },
  };
}

export interface MoleculeComplexityInfo {
  heavyAtomCount: number;
  ringCount: number;
  estimatedComplexity: "simple" | "medium" | "complex" | "very-complex";
  recommendedScale: number;
}


/**
 * Pure layout helper to calculate structural complexity heuristics for molecule card sizing.
 * Does NOT generate validation errors or mutate domain data.
 */
export function getMoleculeComplexity(smiles: string): MoleculeComplexityInfo {
  if (!smiles || typeof smiles !== "string") {
    return {
      heavyAtomCount: 0,
      ringCount: 0,
      estimatedComplexity: "simple",
      recommendedScale: 1,
    };
  }
  const parsed = parseSmilesStructure(smiles);
  const heavyAtomCount = parsed.totalHeavyAtoms;

  // Approximate ring count from digits in SMILES
  const ringMatches = smiles.match(/[0-9]/g) || [];
  const ringCount = Math.floor(ringMatches.length / 2);

  let estimatedComplexity: MoleculeComplexityInfo["estimatedComplexity"] = "simple";
  let recommendedScale = 1;

  if (heavyAtomCount > 35 || ringCount >= 4) {
    estimatedComplexity = "very-complex";
    recommendedScale = 1.6;
  } else if (heavyAtomCount > 20 || ringCount >= 2) {
    estimatedComplexity = "complex";
    recommendedScale = 1.35;
  } else if (heavyAtomCount > 8 || ringCount >= 1) {
    estimatedComplexity = "medium";
    recommendedScale = 1.15;
  }

  return {
    heavyAtomCount,
    ringCount,
    estimatedComplexity,
    recommendedScale,
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
 * Safely cleans a chemical token (such as a SMILES string) by stripping:
 * 1. Surrounding single or double quotes ("..." or '...')
 * 2. Invisible zero-width unicode characters (\u200B-\u200D, \uFEFF)
 * 3. Bidirectional text markers (\u200E, \u200F, \u202A-\u202E)
 * 4. Trailing and leading whitespace
 *
 * STRICT CHEMICAL INVARIANT:
 * Strictly PRESERVES all valid SMILES syntax and stereochemistry:
 * - Directional double-bond stereochemistry: / and \ (e.g. C/C=C/C, C/C=C\C)
 * - Tetrahedral chirality: @ and @@ (e.g. C[C@H](O)CC)
 * - Bracketed and charged atoms: [NH3+], [O-], [n+], [nH], [Cl-]
 * - Ring closures: 1-9 and %10-%99
 * - Bond orders: -, =, #, :
 * - Lowercase aromatic characters: b, c, n, o, p, s
 * - Atom mappings: :1, :2, etc.
 */
export function sanitizeChemicalToken(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^["']|["']$/g, "").trim();
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, "").trim();
  return cleaned;
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
    const rawSmiles = commentMatch ? commentMatch[1].trim() : firstLine;
    const smiles = sanitizeChemicalToken(rawSmiles);
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
        if (
          parsed &&
          (typeof parsed.smiles === "string" ||
            typeof parsed.smi === "string" ||
            typeof parsed.structure === "string")
        ) {
          const rawSmiles = String(parsed.smiles || parsed.smi || parsed.structure);
          return {
            id: typeof parsed.id === "string" ? parsed.id.trim() : undefined,
            compoundName:
              typeof parsed.compoundName === "string"
                ? parsed.compoundName.trim()
                : typeof parsed.name === "string"
                ? parsed.name.trim()
                : typeof parsed.title === "string"
                ? parsed.title.trim()
                : typeof parsed.molecule === "string"
                ? parsed.molecule.trim()
                : typeof parsed.compound === "string"
                ? parsed.compound.trim()
                : "ساختار شیمیایی",
            smiles: sanitizeChemicalToken(rawSmiles),
            iupacName: typeof parsed.iupacName === "string" ? parsed.iupacName.trim() : undefined,
            formula: typeof parsed.formula === "string" ? parsed.formula.trim() : undefined,
            molecularWeight:
              typeof parsed.molecularWeight === "number"
                ? parsed.molecularWeight
                : typeof parsed.weight === "number"
                ? parsed.weight
                : undefined,
            drugClass:
              typeof parsed.drugClass === "string"
                ? parsed.drugClass.trim()
                : typeof parsed.class === "string"
                ? parsed.class.trim()
                : typeof parsed.category === "string"
                ? parsed.category.trim()
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
                        : { feature: "نکته ساختاری", description: item.trim() };
                    }
                    return {
                      feature: item.feature ? item.feature.trim() : "نکته ساختاری",
                      description: item.description ? item.description.trim() : "",
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
          result.smiles = sanitizeChemicalToken(lineTrim);
        }
        continue;
      }

      const key = lineTrim.slice(0, colonIdx).trim().toLowerCase();
      const val = lineTrim.slice(colonIdx + 1).trim();
      const cleanVal = val.replace(/^["']|["']$/g, "").trim();

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
        key === "title" ||
        key === "compound" ||
        key === "molecule" ||
        key === "drug" ||
        key === "substance"
      ) {
        result.compoundName = cleanVal;
      } else if (
        key === "smiles" ||
        key === "smi" ||
        key === "structure" ||
        key === "smiles_code"
      ) {
        result.smiles = sanitizeChemicalToken(cleanVal);
      } else if (key === "formula" || key === "molformula" || key === "mf") {
        result.formula = cleanVal;
      } else if (key === "weight" || key === "molecularweight" || key === "mw") {
        const num = parseFloat(cleanVal.replace(/[^\d.]/g, ""));
        if (!isNaN(num)) result.molecularWeight = num;
      } else if (key === "class" || key === "drugclass" || key === "category") {
        result.drugClass = cleanVal;
      } else if (key === "id") {
        result.id = cleanVal;
      } else if (key === "iupac" || key === "iupacname") {
        result.iupacName = cleanVal;
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

/**
 * Pure, deterministic parser for reaction participant tokens or lines.
 */
function parseParticipantEntry(raw: string): ChemicalReactionParticipant | null {
  const trimmed = raw.trim().replace(/^-\s*/, "");
  if (!trimmed) return null;

  // JSON format inside array item
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        typeof obj.smiles === "string" ||
        typeof obj.smi === "string" ||
        typeof obj.structure === "string"
      ) {
        return {
          smiles: sanitizeChemicalToken(String(obj.smiles || obj.smi || obj.structure)),
          name:
            typeof obj.name === "string"
              ? obj.name.trim()
              : typeof obj.compoundName === "string"
              ? obj.compoundName.trim()
              : typeof obj.title === "string"
              ? obj.title.trim()
              : undefined,
          formula: typeof obj.formula === "string" ? obj.formula.trim() : undefined,
          coefficient:
            typeof obj.coefficient === "number"
              ? obj.coefficient
              : typeof obj.coeff === "number"
              ? obj.coeff
              : undefined,
        };
      }
    } catch {
      // fallback
    }
  }

  // Key-value inline e.g. "smiles: CCO, name: Ethanol"
  if (trimmed.includes("smiles:") || trimmed.includes("smi:") || trimmed.includes("structure:")) {
    const parts = trimmed.split(/,\s*(?=[a-zA-Z_]+:)/);
    const result: Partial<ChemicalReactionParticipant> = {};
    for (const p of parts) {
      const cIdx = p.indexOf(":");
      if (cIdx === -1) continue;
      const k = p.slice(0, cIdx).trim().toLowerCase();
      const v = p.slice(cIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (k === "smiles" || k === "smi" || k === "structure") {
        result.smiles = sanitizeChemicalToken(v);
      } else if (k === "name" || k === "compoundname" || k === "title") {
        result.name = v.trim();
      } else if (k === "formula" || k === "mf") {
        result.formula = v.trim();
      } else if (k === "coefficient" || k === "coeff") {
        const num = parseInt(v, 10);
        if (!isNaN(num)) result.coefficient = num;
      }
    }
    if (result.smiles) {
      return {
        smiles: result.smiles,
        name: result.name,
        formula: result.formula,
        coefficient: result.coefficient,
      };
    }
  }

  // Comment-annotated SMILES e.g. "CCO # Ethanol" or "2 CCO # Ethanol"
  const commentMatch = trimmed.match(/^(?:(\d+)\s+)?([^#\s]+)(?:\s+#\s*(.+))?$/);
  if (commentMatch) {
    const coeff = commentMatch[1] ? parseInt(commentMatch[1], 10) : undefined;
    const rawSmiles = sanitizeChemicalToken(commentMatch[2]);
    const name = commentMatch[3] ? commentMatch[3].trim() : undefined;
    if (rawSmiles && /^[A-Za-z0-9@+\-=[\]()#/\\$:%.~]+$/.test(rawSmiles)) {
      return {
        smiles: rawSmiles,
        name,
        coefficient: coeff,
      };
    }
  }

  // Plain SMILES string
  const plain = sanitizeChemicalToken(trimmed);
  if (/^[A-Za-z0-9@+\-=[\]()#/\\$:%.~]+$/.test(plain)) {
    return {
      smiles: plain,
    };
  }

  return null;
}

/**
 * Parses a Reaction SMILES string (e.g. "A.B>reagent1.reagent2>C.D") into participants and reagents.
 */
export function parseReactionSmiles(rxnSmiles: string): {
  reactants: ChemicalReactionParticipant[];
  reagents: string[];
  products: ChemicalReactionParticipant[];
  reversible?: boolean;
} | null {
  if (!rxnSmiles || typeof rxnSmiles !== "string") return null;
  const trimmed = rxnSmiles.trim().replace(/^["']|["']$/g, "");
  let normalized = trimmed;
  let isReversible = false;
  if (normalized.includes("<=>")) {
    isReversible = true;
    normalized = normalized.replace("<=>", ">");
  } else if (normalized.includes("<->")) {
    isReversible = true;
    normalized = normalized.replace("<->", ">");
  }
  if (!normalized.includes(">")) return null;

  const parts = normalized.split(">");
  if (parts.length < 2 || parts.length > 3) return null;

  const rawReactants = parts[0].trim();
  const rawReagents = parts.length === 3 ? parts[1].trim() : "";
  const rawProducts = (parts.length === 3 ? parts[2] : parts[1]).trim();

  const reactants: ChemicalReactionParticipant[] = rawReactants
    ? rawReactants
        .split(".")
        .filter((s) => s.trim().length > 0)
        .map((s) => ({ smiles: sanitizeChemicalToken(s) }))
        .filter((p) => p.smiles.length > 0)
    : [];

  const reagents: string[] = rawReagents
    ? rawReagents
        .split(".")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0)
    : [];

  const products: ChemicalReactionParticipant[] = rawProducts
    ? rawProducts
        .split(".")
        .filter((s) => s.trim().length > 0)
        .map((s) => ({ smiles: sanitizeChemicalToken(s) }))
        .filter((p) => p.smiles.length > 0)
    : [];

  if (reactants.length === 0 && products.length === 0) return null;

  return {
    reactants,
    reagents,
    products,
    reversible: isReversible || undefined,
  };
}

/**
 * Lightweight deterministic YAML scalar parser.
 */
function parseYamlScalar(val: string): unknown {
  const cleaned = val.replace(/^["']|["']$/g, "").trim();
  if (cleaned === "true" || cleaned === "yes") return true;
  if (cleaned === "false" || cleaned === "no") return false;
  if (cleaned === "null") return null;
  const num = Number(cleaned);
  if (!isNaN(num) && cleaned !== "" && !cleaned.includes(" ") && !/^[A-Za-z]/.test(cleaned)) {
    return num;
  }
  return cleaned;
}

/**
 * Lightweight deterministic indentation-based YAML block parser.
 * Handles nested objects and lists without third-party dependencies.
 */
function parseSimpleYamlBlock(lines: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [{ indent: -1, obj: root }];
  let pendingKey: string | null = null;
  let pendingKeyIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim() || rawLine.trim().startsWith("#")) continue;

    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();

    if (pendingKey !== null) {
      if (indent > pendingKeyIndent) {
        const parent = stack[stack.length - 1].obj;
        if (line.startsWith("- ")) {
          const arr: unknown[] = [];
          parent[pendingKey] = arr;
        } else {
          const newObj: Record<string, unknown> = {};
          parent[pendingKey] = newObj;
          stack.push({ indent: pendingKeyIndent, obj: newObj });
        }
      }
      pendingKey = null;
    }

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const currentObj = stack[stack.length - 1].obj;

    if (line.startsWith("- ")) {
      const itemContent = line.slice(2).trim();
      let targetArr: unknown[] | null = null;
      for (const k of Object.keys(currentObj).reverse()) {
        if (Array.isArray(currentObj[k])) {
          targetArr = currentObj[k] as unknown[];
          break;
        }
      }
      if (!targetArr) {
        for (let s = stack.length - 1; s >= 0; s--) {
          for (const k of Object.keys(stack[s].obj).reverse()) {
            if (Array.isArray(stack[s].obj[k])) {
              targetArr = stack[s].obj[k] as unknown[];
              break;
            }
          }
          if (targetArr) break;
        }
      }

      const colonIdx = itemContent.indexOf(":");
      if (colonIdx !== -1) {
        const k = itemContent.slice(0, colonIdx).trim();
        const vRaw = itemContent.slice(colonIdx + 1).trim();
        const itemObj: Record<string, unknown> = {};
        if (vRaw.length > 0) {
          itemObj[k] = parseYamlScalar(vRaw);
        } else {
          pendingKey = k;
          pendingKeyIndent = indent;
        }
        if (targetArr) targetArr.push(itemObj);
        stack.push({ indent, obj: itemObj });
      } else {
        if (targetArr) targetArr.push(parseYamlScalar(itemContent));
      }
    } else {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const k = line.slice(0, colonIdx).trim();
        const vRaw = line.slice(colonIdx + 1).trim();
        if (vRaw.length > 0) {
          currentObj[k] = parseYamlScalar(vRaw);
        } else {
          pendingKey = k;
          pendingKeyIndent = indent;
        }
      }
    }
  }

  return root;
}

/**
 * Parses mechanism YAML block into ChemicalReactionMechanism.
 */
export function parseMechanismYamlBlock(lines: string[]): ChemicalReactionMechanism | undefined {
  if (!lines || lines.length === 0) return undefined;
  const joined = lines.join("\n").trim();
  if (!joined) return undefined;

  let rawObj: Record<string, unknown> | null = null;
  if (joined.startsWith("{") && joined.endsWith("}")) {
    try {
      rawObj = JSON.parse(joined) as Record<string, unknown>;
    } catch {
      rawObj = parseSimpleYamlBlock(lines);
    }
  } else {
    rawObj = parseSimpleYamlBlock(lines);
  }

  if (!rawObj || typeof rawObj !== "object") return undefined;

  const rType = rawObj.reactionType || rawObj.reaction_type || rawObj.type;
  const mech: ChemicalReactionMechanism = {};
  if (typeof rType === "string") mech.reactionType = rType;

  // Reaction center
  const rc = (rawObj.reactionCenter || rawObj.reaction_center) as Record<string, unknown> | undefined;
  if (rc && typeof rc === "object") {
    mech.reactionCenter = {};
    const parseAtomRef = (a: unknown): AtomRef | undefined => {
      if (!a || typeof a !== "object") return undefined;
      const obj = a as Record<string, unknown>;
      return {
        participantRole: (obj.participantRole || obj.participant_role || obj.role || "reactant") as AtomRef["participantRole"],
        participantIndex: typeof obj.participantIndex === "number" ? obj.participantIndex : typeof obj.participant_index === "number" ? obj.participant_index : typeof obj.participant === "number" ? obj.participant : undefined,
        atomIndex: typeof obj.atomIndex === "number" ? obj.atomIndex : typeof obj.atom_index === "number" ? obj.atom_index : typeof obj.atom === "number" ? obj.atom : 0,
        element: typeof obj.element === "string" ? obj.element : undefined,
      };
    };
    if (rc.nucleophile) mech.reactionCenter.nucleophile = parseAtomRef(rc.nucleophile);
    if (rc.electrophile) mech.reactionCenter.electrophile = parseAtomRef(rc.electrophile);
    if (rc.leavingGroup || rc.leaving_group) mech.reactionCenter.leavingGroup = parseAtomRef(rc.leavingGroup || rc.leaving_group);
  }

  // Arrows
  if (Array.isArray(rawObj.arrows)) {
    mech.arrows = [];
    for (const a of rawObj.arrows) {
      if (!a || typeof a !== "object") continue;
      const obj = a as Record<string, unknown>;
      const parseAtomRef = (ref: unknown): AtomRef | undefined => {
        if (!ref || typeof ref !== "object") return undefined;
        const r = ref as Record<string, unknown>;
        return {
          participantRole: (r.participantRole || r.participant_role || r.role || "reactant") as AtomRef["participantRole"],
          participantIndex: typeof r.participantIndex === "number" ? r.participantIndex : typeof r.participant_index === "number" ? r.participant_index : typeof r.participant === "number" ? r.participant : undefined,
          atomIndex: typeof r.atomIndex === "number" ? r.atomIndex : typeof r.atom_index === "number" ? r.atom_index : typeof r.atom === "number" ? r.atom : 0,
          element: typeof r.element === "string" ? r.element : undefined,
        };
      };
      const parseBondRef = (b: unknown): BondRef | undefined => {
        if (!b || typeof b !== "object") return undefined;
        const br = b as Record<string, unknown>;
        return {
          participantRole: (br.participantRole || br.participant_role || br.role || "reactant") as BondRef["participantRole"],
          participantIndex: typeof br.participantIndex === "number" ? br.participantIndex : typeof br.participant_index === "number" ? br.participant_index : typeof br.participant === "number" ? br.participant : undefined,
          atom1: typeof br.atom1 === "number" ? br.atom1 : 0,
          atom2: typeof br.atom2 === "number" ? br.atom2 : 1,
        };
      };

      const fromObj = (obj.from && typeof obj.from === "object" ? obj.from : {}) as Record<string, unknown>;
      const toObj = (obj.to && typeof obj.to === "object" ? obj.to : {}) as Record<string, unknown>;

      const arrow: MechanismArrow = {
        id: typeof obj.id === "string" ? obj.id : undefined,
        type: obj.type as MechanismArrowType,
        electronCount: obj.electronCount === 1 || obj.electron_count === 1 ? 1 : 2,
        lonePairIndex: typeof obj.lonePairIndex === "number" ? obj.lonePairIndex : typeof obj.lone_pair_index === "number" ? obj.lone_pair_index : undefined,
        from: {
          type: (fromObj.type as MechanismArrow["from"]["type"]) || "atom",
          atom: fromObj.atom ? parseAtomRef(fromObj.atom) : (fromObj.type === "atom" || fromObj.type === "lone_pair" ? parseAtomRef(fromObj) : undefined),
          bond: fromObj.bond ? parseBondRef(fromObj.bond) : (fromObj.type === "bond" ? parseBondRef(fromObj) : undefined),
          lonePairIndex: typeof fromObj.lonePairIndex === "number" ? fromObj.lonePairIndex : typeof fromObj.lone_pair_index === "number" ? fromObj.lone_pair_index : undefined,
        },
        to: {
          type: (toObj.type as MechanismArrow["to"]["type"]) || "atom",
          atom: toObj.atom ? parseAtomRef(toObj.atom) : (toObj.type === "atom" ? parseAtomRef(toObj) : undefined),
          bond: toObj.bond ? parseBondRef(toObj.bond) : (toObj.type === "bond" ? parseBondRef(toObj) : undefined),
        },
        label: typeof obj.label === "string" ? obj.label : undefined,
        curveOffset: typeof obj.curveOffset === "number" ? obj.curveOffset : typeof obj.curve_offset === "number" ? obj.curve_offset : undefined,
        direction: obj.direction === "clockwise" || obj.direction === "counter-clockwise" ? obj.direction : undefined,
      };

      mech.arrows.push(arrow);
    }
  }

  if (typeof rawObj.notes === "string") mech.notes = rawObj.notes;

  return mech;
}

/**
 * Pure, deterministic parser for fenced ```reaction code blocks.
 * Supports Reaction SMILES, structured JSON, and YAML with single or multi-step reactions.
 */
export function parseReactionCodeContent(
  raw: string,
  lang: string,
): ChemicalReaction | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalizedLang = lang.toLowerCase();
  if (
    normalizedLang !== "reaction" &&
    normalizedLang !== "rxn" &&
    normalizedLang !== "chemical-reaction"
  ) {
    return null;
  }

  // 1. Check if raw content is a pure Reaction SMILES line (e.g. "CC(=O)O.OCC>[H+]>CC(=O)OCC.O")
  if (trimmed.includes(">") && !trimmed.includes("\n") && !trimmed.startsWith("{")) {
    const parsedRxnSmiles = parseReactionSmiles(trimmed);
    if (parsedRxnSmiles) {
      return {
        title: "واکنش شیمیایی",
        reactants: parsedRxnSmiles.reactants,
        reagents: parsedRxnSmiles.reagents.length > 0 ? parsedRxnSmiles.reagents : undefined,
        products: parsedRxnSmiles.products,
        reversible: parsedRxnSmiles.reversible,
      };
    }
  }

  // Helper to map participants
  const mapParticipants = (arr: unknown): ChemicalReactionParticipant[] => {
    if (!Array.isArray(arr)) return [];
    const list: ChemicalReactionParticipant[] = [];
    for (const item of arr) {
      if (typeof item === "string") {
        const p = parseParticipantEntry(item);
        if (p) list.push(p);
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (
          typeof obj.smiles === "string" ||
          typeof obj.smi === "string" ||
          typeof obj.structure === "string"
        ) {
          list.push({
            smiles: sanitizeChemicalToken(String(obj.smiles || obj.smi || obj.structure)),
            name:
              typeof obj.name === "string"
                ? obj.name.trim()
                : typeof obj.compoundName === "string"
                ? obj.compoundName.trim()
                : typeof obj.title === "string"
                ? obj.title.trim()
                : undefined,
            formula: typeof obj.formula === "string" ? obj.formula.trim() : undefined,
            coefficient:
              typeof obj.coefficient === "number"
                ? obj.coefficient
                : typeof obj.coeff === "number"
                ? obj.coeff
                : undefined,
            isIntermediate: typeof obj.isIntermediate === "boolean" ? obj.isIntermediate : undefined,
            role:
              obj.role === "reactant" || obj.role === "product" || obj.role === "intermediate"
                ? obj.role
                : undefined,
          });
        }
      }
    }
    return list;
  };

  const mapStrings = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x || "").trim()).filter((x) => x.length > 0);
  };

  const mapConditions = (arr: unknown): Array<string | ChemicalReactionCondition> => {
    if (!Array.isArray(arr)) return [];
    const list: Array<string | ChemicalReactionCondition> = [];
    for (const item of arr) {
      if (typeof item === "string") {
        if (item.trim()) list.push(item.trim());
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.value === "string") {
          list.push({
            type: typeof obj.type === "string" ? (obj.type as ChemicalReactionCondition["type"]) : undefined,
            value: obj.value.trim(),
            position: obj.position === "above" || obj.position === "below" ? obj.position : undefined,
          });
        }
      }
    }
    return list;
  };

  // 2. Try JSON format
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed && (Array.isArray(parsed.reactants) || Array.isArray(parsed.products) || typeof parsed.smiles === "string" || typeof parsed.reactionSmiles === "string" || Array.isArray(parsed.steps))) {
        // If inline reactionSmiles in JSON
        if (typeof parsed.smiles === "string" && parsed.smiles.includes(">")) {
          const fromSmiles = parseReactionSmiles(parsed.smiles);
          if (fromSmiles) {
            return {
              id: typeof parsed.id === "string" ? parsed.id : undefined,
              title: typeof parsed.title === "string" ? parsed.title : typeof parsed.name === "string" ? parsed.name : "واکنش شیمیایی",
              description: typeof parsed.description === "string" ? parsed.description : undefined,
              reactionType: typeof parsed.type === "string" ? parsed.type : typeof parsed.reactionType === "string" ? parsed.reactionType : undefined,
              layout: parsed.layout === "compact" || parsed.layout === "expanded" || parsed.layout === "stepped" ? parsed.layout : undefined,
              reactants: fromSmiles.reactants,
              reagents: fromSmiles.reagents.length > 0 ? fromSmiles.reagents : undefined,
              products: fromSmiles.products,
              yield: typeof parsed.yield === "string" ? parsed.yield : undefined,
              reversible: fromSmiles.reversible ?? (typeof parsed.reversible === "boolean" ? parsed.reversible : undefined),
              arrowType: typeof parsed.arrowType === "string" ? (parsed.arrowType as ChemicalReaction["arrowType"]) : undefined,
            };
          }
        }

        // Multi-step support in JSON
        let steps: ChemicalReactionStep[] | undefined;
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          steps = parsed.steps.map((st: Record<string, unknown>, idx: number) => ({
            stepNumber: typeof st.stepNumber === "number" ? st.stepNumber : idx + 1,
            title: typeof st.title === "string" ? st.title : undefined,
            reactants: mapParticipants(st.reactants),
            intermediates: Array.isArray(st.intermediates) ? mapParticipants(st.intermediates) : undefined,
            products: mapParticipants(st.products),
            reagents: mapStrings(st.reagents),
            catalysts: mapStrings(st.catalysts),
            solvents: mapStrings(st.solvents),
            conditions: mapConditions(st.conditions),
            temperature: typeof st.temperature === "string" ? st.temperature : undefined,
            pressure: typeof st.pressure === "string" ? st.pressure : undefined,
            yield: typeof st.yield === "string" ? st.yield : undefined,
            notes: typeof st.notes === "string" ? st.notes : undefined,
            reversible: typeof st.reversible === "boolean" ? st.reversible : undefined,
            arrowType: typeof st.arrowType === "string" ? (st.arrowType as ChemicalReactionStep["arrowType"]) : undefined,
            mechanism: (st.mechanism && typeof st.mechanism === "object") ? (st.mechanism as ChemicalReactionMechanism) : undefined,
          }));
        }

        const reactants = mapParticipants(parsed.reactants);
        const intermediates = Array.isArray(parsed.intermediates) ? mapParticipants(parsed.intermediates) : undefined;
        const products = mapParticipants(parsed.products);
        const mechanism = (parsed.mechanism && typeof parsed.mechanism === "object") ? (parsed.mechanism as ChemicalReactionMechanism) : undefined;

        return {
          id: typeof parsed.id === "string" ? parsed.id : undefined,
          title: typeof parsed.title === "string" ? parsed.title : typeof parsed.name === "string" ? parsed.name : "واکنش شیمیایی",
          description: typeof parsed.description === "string" ? parsed.description : undefined,
          reactionType: typeof parsed.type === "string" ? parsed.type : typeof parsed.reactionType === "string" ? parsed.reactionType : undefined,
          layout: parsed.layout === "compact" || parsed.layout === "expanded" || parsed.layout === "stepped" ? parsed.layout : undefined,
          reactants: reactants.length > 0 ? reactants : steps && steps[0] ? steps[0].reactants : [],
          intermediates,
          products: products.length > 0 ? products : steps && steps[steps.length - 1] ? steps[steps.length - 1].products : [],
          reagents: mapStrings(parsed.reagents),
          catalysts: mapStrings(parsed.catalysts),
          solvents: mapStrings(parsed.solvents),
          conditions: mapConditions(parsed.conditions),
          temperature: typeof parsed.temperature === "string" ? parsed.temperature : undefined,
          pressure: typeof parsed.pressure === "string" ? parsed.pressure : undefined,
          yield: typeof parsed.yield === "string" ? parsed.yield : undefined,
          reversible: typeof parsed.reversible === "boolean" ? parsed.reversible : undefined,
          arrowType: typeof parsed.arrowType === "string" ? (parsed.arrowType as ChemicalReaction["arrowType"]) : undefined,
          steps,
          mechanism,
        };
      }

    } catch {
      // fallback to YAML
    }
  }

  // 3. YAML-like key-value / list structure
  const lines = trimmed.split("\n");
  const hasStepsHeader = lines.some((l) => /^[a-zA-Z_]*steps\s*:/i.test(l.trim()));

  if (hasStepsHeader) {
    // Multi-step YAML Parsing
    type StepSection = "reactants" | "intermediates" | "products" | "reagents" | "catalysts" | "solvents" | "conditions" | "none";
    const topResult: Partial<ChemicalReaction> = {};
    const steps: ChemicalReactionStep[] = [];
    let currentStep: Partial<ChemicalReactionStep> | null = null;
    let inSteps = false;
    let currentSection: StepSection = "none";
    let currentParticipant: Partial<ChemicalReactionParticipant> | null = null;

    const flushParticipant = () => {
      if (currentParticipant && currentParticipant.smiles && currentStep) {
        const p: ChemicalReactionParticipant = {
          smiles: currentParticipant.smiles,
          name: currentParticipant.name,
          formula: currentParticipant.formula,
          coefficient: currentParticipant.coefficient,
          isIntermediate: currentSection === "intermediates" ? true : currentParticipant.isIntermediate,
          role: currentSection === "intermediates" ? "intermediate" : currentParticipant.role,
        };
        if (currentSection === "reactants") {
          currentStep.reactants = [...(currentStep.reactants || []), p];
        } else if (currentSection === "intermediates") {
          currentStep.intermediates = [...(currentStep.intermediates || []), p];
        } else if (currentSection === "products") {
          currentStep.products = [...(currentStep.products || []), p];
        }
      }
      currentParticipant = null;
    };

    const flushStep = () => {
      flushParticipant();
      if (currentStep && ((currentStep.reactants && currentStep.reactants.length > 0) || (currentStep.products && currentStep.products.length > 0))) {
        steps.push({
          stepNumber: currentStep.stepNumber || steps.length + 1,
          title: currentStep.title,
          reactants: currentStep.reactants || [],
          intermediates: currentStep.intermediates,
          products: currentStep.products || [],
          reagents: currentStep.reagents,
          catalysts: currentStep.catalysts,
          solvents: currentStep.solvents,
          conditions: currentStep.conditions,
          temperature: currentStep.temperature,
          pressure: currentStep.pressure,
          yield: currentStep.yield,
          notes: currentStep.notes,
          reversible: currentStep.reversible,
          arrowType: currentStep.arrowType,
          mechanism: currentStep.mechanism,
        });
      }
      currentStep = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const rawLine = line.trim();
      if (!rawLine || rawLine.startsWith("#")) continue;
      const isIndented = line.startsWith(" ") || line.startsWith("\t");

      if (!inSteps) {
        if (/^steps\s*:/i.test(rawLine)) {
          inSteps = true;
          continue;
        }
        const topMatch = rawLine.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
        if (topMatch) {
          const k = topMatch[1].toLowerCase();
          const v = topMatch[2].trim().replace(/^["']|["']$/g, "");
          if (k === "title" || k === "name") topResult.title = v;
          else if (k === "layout") {
            if (v === "compact" || v === "expanded" || v === "stepped") topResult.layout = v;
          } else if (k === "type" || k === "reaction_type") topResult.reactionType = v;
          else if (k === "description") topResult.description = v;
          else if (k === "yield") topResult.yield = v;
          else if (k === "reversible") topResult.reversible = v === "true" || v === "yes";
          else if (k === "arrow_type" || k === "arrowtype") topResult.arrowType = v as ChemicalReaction["arrowType"];
          else if (k === "mechanism") {
            const mechLines: string[] = [];
            if (v) mechLines.push(v);
            while (i + 1 < lines.length) {
              const nextRaw = lines[i + 1];
              const nextTrimmed = nextRaw.trim();
              if (!nextTrimmed || nextTrimmed.startsWith("#")) {
                i++;
                continue;
              }
              const nextIsIndented = nextRaw.startsWith(" ") || nextRaw.startsWith("\t");
              if (!nextIsIndented && /^[a-zA-Z_]+\s*:/i.test(nextTrimmed)) {
                break;
              }
              mechLines.push(nextRaw);
              i++;
            }
            topResult.mechanism = parseMechanismYamlBlock(mechLines);
          }
        }
        continue;
      }

      // Inside steps section
      // Check if a new step starts with '- step:' or '- step' or '- title:' or '- reactants:'
      if (rawLine.startsWith("-") && (rawLine.includes("step") || rawLine.includes("title:"))) {
        flushStep();
        currentStep = { reactants: [], products: [] };
        const stripped = rawLine.replace(/^-\s*/, "").trim();
        const colonIdx = stripped.indexOf(":");
        if (colonIdx !== -1) {
          const subKey = stripped.slice(0, colonIdx).trim().toLowerCase();
          const subVal = stripped.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (subKey === "step" || subKey === "stepnumber") {
            const num = parseInt(subVal, 10);
            if (!isNaN(num)) currentStep.stepNumber = num;
          } else if (subKey === "title") {
            currentStep.title = subVal;
          }
        }
        currentSection = "none";
        continue;
      }

      if (!currentStep && inSteps) {
        currentStep = { reactants: [], products: [] };
      }

      // Inside current step: participant sub-properties (name, smiles, formula, coeff)
      if (isIndented && currentParticipant && ((currentSection as StepSection) === "reactants" || (currentSection as StepSection) === "intermediates" || (currentSection as StepSection) === "products")) {
        const colonIdx = rawLine.indexOf(":");
        if (colonIdx !== -1 && !rawLine.startsWith("-")) {
          const k = rawLine.slice(0, colonIdx).trim().toLowerCase();
          const v = rawLine.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (k === "name" || k === "compoundname" || k === "title") {
            currentParticipant.name = v;
            continue;
          } else if (k === "formula" || k === "mf") {
            currentParticipant.formula = v;
            continue;
          } else if (k === "smiles" || k === "smi" || k === "structure") {
            currentParticipant.smiles = sanitizeChemicalToken(v);
            continue;
          } else if (k === "coefficient" || k === "coeff") {
            const num = parseInt(v, 10);
            if (!isNaN(num)) currentParticipant.coefficient = num;
            continue;
          } else {
            flushParticipant();
          }
        }
      }

      // List items starting with '-'
      if (rawLine.startsWith("-")) {
        const itemContent = rawLine.replace(/^-\s*/, "").trim();

        if (
          (currentSection as StepSection) === "reactants" ||
          (currentSection as StepSection) === "intermediates" ||
          (currentSection as StepSection) === "products"
        ) {
          flushParticipant();
          const colonIdx = itemContent.indexOf(":");
          if (colonIdx !== -1) {
            const subKey = itemContent.slice(0, colonIdx).trim().toLowerCase();
            const subVal = itemContent.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
            if (subKey === "smiles" || subKey === "smi" || subKey === "structure") {
              currentParticipant = { smiles: sanitizeChemicalToken(subVal) };
              continue;
            }
          }
          const p = parseParticipantEntry(itemContent);
          if (p && currentStep) {
            if ((currentSection as StepSection) === "reactants") currentStep.reactants = [...(currentStep.reactants || []), p];
            else if ((currentSection as StepSection) === "intermediates") {
              p.isIntermediate = true;
              p.role = "intermediate";
              currentStep.intermediates = [...(currentStep.intermediates || []), p];
            } else currentStep.products = [...(currentStep.products || []), p];
          }
          continue;
        }

        if (currentStep) {
          const cleaned = itemContent.replace(/^["']|["']$/g, "");
          if ((currentSection as StepSection) === "reagents" && cleaned) currentStep.reagents = [...(currentStep.reagents || []), cleaned];
          else if ((currentSection as StepSection) === "catalysts" && cleaned) currentStep.catalysts = [...(currentStep.catalysts || []), cleaned];
          else if ((currentSection as StepSection) === "solvents" && cleaned) currentStep.solvents = [...(currentStep.solvents || []), cleaned];
          else if ((currentSection as StepSection) === "conditions" && cleaned) currentStep.conditions = [...(currentStep.conditions || []), cleaned];
          continue;
        }
      }

      // Step level section / attribute headers
      const match = rawLine.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
      if (match) {
        const k = match[1].toLowerCase();
        const v = match[2].trim().replace(/^["']|["']$/g, "");

        const isReactantHeader =
          k === "reactants" ||
          k === "reactant" ||
          k === "substrates" ||
          k === "substrate" ||
          k === "starting_materials" ||
          k === "starting_material" ||
          k === "educts" ||
          k === "educt";
        const isProductHeader =
          k === "products" || k === "product" || k === "results" || k === "result";
        const isIntermediateHeader = k === "intermediates" || k === "intermediate";
        const isReagentHeader = k === "reagents" || k === "reagent";
        const isCatalystHeader = k === "catalysts" || k === "catalyst";
        const isSolventHeader = k === "solvents" || k === "solvent";
        const isConditionHeader = k === "conditions" || k === "condition";

        if (
          isReactantHeader ||
          isProductHeader ||
          isIntermediateHeader ||
          isReagentHeader ||
          isCatalystHeader ||
          isSolventHeader ||
          isConditionHeader
        ) {
          flushParticipant();
          currentSection = isReactantHeader
            ? "reactants"
            : isProductHeader
            ? "products"
            : isIntermediateHeader
            ? "intermediates"
            : isReagentHeader
            ? "reagents"
            : isCatalystHeader
            ? "catalysts"
            : isSolventHeader
            ? "solvents"
            : "conditions";

          if (v && currentStep) {
            if ((currentSection as StepSection) === "reagents") currentStep.reagents = [...(currentStep.reagents || []), v];
            else if ((currentSection as StepSection) === "catalysts") currentStep.catalysts = [...(currentStep.catalysts || []), v];
            else if ((currentSection as StepSection) === "solvents") currentStep.solvents = [...(currentStep.solvents || []), v];
            else if ((currentSection as StepSection) === "conditions") currentStep.conditions = [...(currentStep.conditions || []), v];
            else {
              const p = parseParticipantEntry(v);
              if (p) {
                if ((currentSection as StepSection) === "reactants") currentStep.reactants = [...(currentStep.reactants || []), p];
                else if ((currentSection as StepSection) === "intermediates") {
                  p.isIntermediate = true;
                  p.role = "intermediate";
                  currentStep.intermediates = [...(currentStep.intermediates || []), p];
                } else currentStep.products = [...(currentStep.products || []), p];
              }
            }
          }
          continue;
        }

        if (currentStep) {
          if (k === "title" || k === "name") currentStep.title = v;
          else if (k === "temperature" || k === "temp") currentStep.temperature = v;
          else if (k === "pressure") currentStep.pressure = v;
          else if (k === "yield") currentStep.yield = v;
          else if (k === "reversible") currentStep.reversible = v === "true" || v === "yes";
          else if (k === "arrow_type" || k === "arrowtype") currentStep.arrowType = v as ChemicalReactionStep["arrowType"];
          else if (k === "notes" || k === "description") currentStep.notes = v;
          else if (k === "mechanism") {
            const mechLines: string[] = [];
            if (v) mechLines.push(v);
            while (i + 1 < lines.length) {
              const nextRaw = lines[i + 1];
              const nextTrimmed = nextRaw.trim();
              if (!nextTrimmed || nextTrimmed.startsWith("#")) {
                i++;
                continue;
              }
              const nextIsIndented = nextRaw.startsWith(" ") || nextRaw.startsWith("\t");
              if (!nextIsIndented && /^[a-zA-Z_]+\s*:/i.test(nextTrimmed)) {
                break;
              }
              mechLines.push(nextRaw);
              i++;
            }
            currentStep.mechanism = parseMechanismYamlBlock(mechLines);
          }
          currentSection = "none";
        }
      }
    }

    flushStep();

    if (steps.length > 0) {
      return {
        title: topResult.title || "واکنش شیمیایی چندمرحله‌ای",
        layout: topResult.layout || "stepped",
        reactionType: topResult.reactionType,
        description: topResult.description,
        yield: topResult.yield,
        reversible: topResult.reversible,
        arrowType: topResult.arrowType,
        steps,
        reactants: steps[0].reactants,
        products: steps[steps.length - 1].products,
        mechanism: topResult.mechanism,
      };
    }
  }

  // Flat single-step YAML structure
  const reactants: ChemicalReactionParticipant[] = [];
  const intermediates: ChemicalReactionParticipant[] = [];
  const products: ChemicalReactionParticipant[] = [];
  const reagents: string[] = [];
  const catalysts: string[] = [];
  const solvents: string[] = [];
  const conditions: Array<string | ChemicalReactionCondition> = [];
  const result: Partial<ChemicalReaction> = {};

  type SectionType = "reactants" | "intermediates" | "products" | "reagents" | "catalysts" | "solvents" | "conditions" | "none";
  let currentSection: SectionType = "none";
  let currentParticipant: Partial<ChemicalReactionParticipant> | null = null;

  const flushParticipant = () => {
    if (currentParticipant && currentParticipant.smiles) {
      const p: ChemicalReactionParticipant = {
        smiles: currentParticipant.smiles,
        name: currentParticipant.name,
        formula: currentParticipant.formula,
        coefficient: currentParticipant.coefficient,
        isIntermediate: currentSection === "intermediates" ? true : currentParticipant.isIntermediate,
        role: currentSection === "intermediates" ? "intermediate" : currentParticipant.role,
      };
      if (currentSection === "reactants") reactants.push(p);
      else if (currentSection === "intermediates") intermediates.push(p);
      else if (currentSection === "products") products.push(p);
    }
    currentParticipant = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const rawLine = line.trim();
    if (!rawLine || rawLine.startsWith("#")) continue;
    const isIndented = line.startsWith(" ") || line.startsWith("\t");

    // 1. If line is indented and we are inside a participant, check participant property
    if (isIndented && currentParticipant && (currentSection === "reactants" || currentSection === "intermediates" || currentSection === "products")) {
      const colonIdx = rawLine.indexOf(":");
      if (colonIdx !== -1 && !rawLine.startsWith("-")) {
        const k = rawLine.slice(0, colonIdx).trim().toLowerCase();
        const v = rawLine.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (k === "name" || k === "compoundname" || k === "title") {
          currentParticipant.name = v.trim();
          continue;
        } else if (k === "formula" || k === "mf") {
          currentParticipant.formula = v.trim();
          continue;
        } else if (k === "smiles" || k === "smi" || k === "structure") {
          currentParticipant.smiles = sanitizeChemicalToken(v);
          continue;
        } else if (k === "coefficient" || k === "coeff") {
          const num = parseInt(v, 10);
          if (!isNaN(num)) currentParticipant.coefficient = num;
          continue;
        } else {
          flushParticipant();
        }
      }
    }

    // 2. Process list items starting with '-'
    if (rawLine.startsWith("-")) {
      const itemContent = rawLine.replace(/^-\s*/, "").trim();

      if (currentSection === "reactants" || currentSection === "intermediates" || currentSection === "products") {
        flushParticipant();
        // Check if item starts a sub-object with "smiles:"
        const colonIdx = itemContent.indexOf(":");
        if (colonIdx !== -1) {
          const subKey = itemContent.slice(0, colonIdx).trim().toLowerCase();
          const subVal = itemContent.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (subKey === "smiles" || subKey === "smi" || subKey === "structure") {
            currentParticipant = { smiles: sanitizeChemicalToken(subVal) };
            continue;
          }
        }

        const p = parseParticipantEntry(itemContent);
        if (p) {
          if (currentSection === "reactants") reactants.push(p);
          else if (currentSection === "intermediates") {
            p.isIntermediate = true;
            p.role = "intermediate";
            intermediates.push(p);
          } else products.push(p);
        }
        continue;
      }

      if (currentSection === "reagents") {
        const cleaned = itemContent.replace(/^["']|["']$/g, "");
        if (cleaned) reagents.push(cleaned);
        continue;
      }

      if (currentSection === "catalysts") {
        const cleaned = itemContent.replace(/^["']|["']$/g, "");
        if (cleaned) catalysts.push(cleaned);
        continue;
      }

      if (currentSection === "solvents") {
        const cleaned = itemContent.replace(/^["']|["']$/g, "");
        if (cleaned) solvents.push(cleaned);
        continue;
      }

      if (currentSection === "conditions") {
        const cleaned = itemContent.replace(/^["']|["']$/g, "");
        if (cleaned) conditions.push(cleaned);
        continue;
      }
    }

    // 3. Check top-level section headers (only when not indented or section header)
    const topKeyMatch = rawLine.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (topKeyMatch) {
      const key = topKeyMatch[1].toLowerCase();
      const val = topKeyMatch[2].trim().replace(/^["']|["']$/g, "");

      const isReactantHeader =
        key === "reactants" ||
        key === "reactant" ||
        key === "substrates" ||
        key === "substrate" ||
        key === "starting_materials" ||
        key === "starting_material" ||
        key === "educts" ||
        key === "educt";
      const isProductHeader =
        key === "products" || key === "product" || key === "results" || key === "result";
      const isIntermediateHeader = key === "intermediates" || key === "intermediate";
      const isReagentHeader = key === "reagents" || key === "reagent";
      const isCatalystHeader = key === "catalysts" || key === "catalyst";
      const isSolventHeader = key === "solvents" || key === "solvent";
      const isConditionHeader = key === "conditions" || key === "condition";

      if (
        isReactantHeader ||
        isProductHeader ||
        isIntermediateHeader ||
        isReagentHeader ||
        isCatalystHeader ||
        isSolventHeader ||
        isConditionHeader
      ) {
        flushParticipant();
        currentSection = isReactantHeader
          ? "reactants"
          : isProductHeader
          ? "products"
          : isIntermediateHeader
          ? "intermediates"
          : isReagentHeader
          ? "reagents"
          : isCatalystHeader
          ? "catalysts"
          : isSolventHeader
          ? "solvents"
          : "conditions";
        if (val) {
          if (val.startsWith("[") && val.endsWith("]")) {
            try {
              const parsedList = JSON.parse(val) as unknown[];
              for (const item of parsedList) {
                if (typeof item === "string") {
                  if (currentSection === "reactants" || currentSection === "intermediates" || currentSection === "products") {
                    const p = parseParticipantEntry(item);
                    if (p) {
                      if (currentSection === "reactants") reactants.push(p);
                      else if (currentSection === "intermediates") {
                        p.isIntermediate = true;
                        p.role = "intermediate";
                        intermediates.push(p);
                      } else products.push(p);
                    }
                  } else if (currentSection === "reagents") reagents.push(item);
                  else if (currentSection === "catalysts") catalysts.push(item);
                  else if (currentSection === "solvents") solvents.push(item);
                  else if (currentSection === "conditions") conditions.push(item);
                }
              }
            } catch {
              // continue
            }
          } else {
            if (currentSection === "reagents") reagents.push(val);
            else if (currentSection === "catalysts") catalysts.push(val);
            else if (currentSection === "solvents") solvents.push(val);
            else if (currentSection === "conditions") conditions.push(val);
            else {
              const p = parseParticipantEntry(val);
              if (p) {
                if (currentSection === "reactants") reactants.push(p);
                else if (currentSection === "intermediates") {
                  p.isIntermediate = true;
                  p.role = "intermediate";
                  intermediates.push(p);
                } else products.push(p);
              }
            }
          }
        }
        continue;
      } else if (!isIndented && (key === "title" || key === "name" || key === "reaction_name" || key === "heading")) {
        result.title = val;
        currentSection = "none";
        continue;
      } else if (!isIndented && key === "layout") {
        if (val === "compact" || val === "expanded" || val === "stepped") {
          result.layout = val;
        }
        currentSection = "none";
        continue;
      } else if (!isIndented && (key === "type" || key === "reaction_type" || key === "class" || key === "category")) {
        result.reactionType = val;
        currentSection = "none";
        continue;
      } else if (!isIndented && (key === "temperature" || key === "temp")) {
        result.temperature = val;
        currentSection = "none";
        continue;
      } else if (!isIndented && key === "pressure") {
        result.pressure = val;
        currentSection = "none";
        continue;
      } else if (!isIndented && key === "yield") {
        result.yield = val;
        currentSection = "none";
        continue;
      } else if (!isIndented && key === "reversible") {
        result.reversible = val === "true" || val === "yes";
        currentSection = "none";
        continue;
      } else if (!isIndented && (key === "arrow_type" || key === "arrowtype")) {
        result.arrowType = val as ChemicalReaction["arrowType"];
        currentSection = "none";
        continue;
      } else if (!isIndented && (key === "description" || key === "notes")) {
        result.description = val;
        currentSection = "none";
        continue;
      } else if (!isIndented && key === "mechanism") {
        flushParticipant();
        currentSection = "none";
        const mechLines: string[] = [];
        if (val) {
          mechLines.push(val);
        }
        while (i + 1 < lines.length) {
          const nextRaw = lines[i + 1];
          const nextTrimmed = nextRaw.trim();
          if (!nextTrimmed || nextTrimmed.startsWith("#")) {
            i++;
            continue;
          }
          const nextIsIndented = nextRaw.startsWith(" ") || nextRaw.startsWith("\t");
          if (!nextIsIndented && /^[a-zA-Z_]+\s*:/i.test(nextTrimmed)) {
            break;
          }
          mechLines.push(nextRaw);
          i++;
        }
        result.mechanism = parseMechanismYamlBlock(mechLines);
        continue;
      } else if (key === "smiles" || key === "smi" || key === "reaction_smiles" || key === "rxn") {
        if (val.includes(">")) {
          const fromSmiles = parseReactionSmiles(val);
          if (fromSmiles) {
            reactants.push(...fromSmiles.reactants);
            reagents.push(...fromSmiles.reagents);
            products.push(...fromSmiles.products);
            if (fromSmiles.reversible) result.reversible = true;
          }
        }
        currentSection = "none";
        continue;
      }
    }
  }

  flushParticipant();

  if (reactants.length > 0 || products.length > 0) {
    const rType = result.reactionType || "واکنش شیمیایی";
    const autoMech: ChemicalReactionMechanism | undefined =
      rType.toUpperCase().includes("SN2") || rType.toUpperCase().includes("S_N2")
        ? { reactionType: "SN2" }
        : undefined;

    return {
      title: result.title || "واکنش شیمیایی",
      layout: result.layout,
      reactionType: result.reactionType,
      description: result.description,
      reactants,
      intermediates: intermediates.length > 0 ? intermediates : undefined,
      products,
      reagents: reagents.length > 0 ? reagents : undefined,
      catalysts: catalysts.length > 0 ? catalysts : undefined,
      solvents: solvents.length > 0 ? solvents : undefined,
      conditions: conditions.length > 0 ? conditions : undefined,
      temperature: result.temperature,
      pressure: result.pressure,
      yield: result.yield,
      reversible: result.reversible,
      arrowType: result.arrowType,
      mechanism: result.mechanism || autoMech,
    };
  }

  return null;
}

/**
 * Conservative validator for ChemicalReaction.
 * Validates reactants, products, and each participant's SMILES string independently.
 */
export function validateChemicalReaction(
  reaction: ChemicalReaction,
): ChemicalReactionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let confidence: ChemicalConfidence = "high";
  const participantValidations: ChemicalReactionValidationResult["participantValidations"] = [];

  if (!reaction || typeof reaction !== "object") {
    return {
      valid: false,
      needsReview: true,
      confidence: "low",
      errors: ["Invalid or null reaction object provided"],
      warnings: [],
      participantValidations: [],
    };
  }

  const checkParticipants = (
    list: ChemicalReactionParticipant[] | undefined,
    role: "reactant" | "product" | "intermediate",
    required = true,
  ) => {
    if (!Array.isArray(list) || list.length === 0) {
      if (required) {
        errors.push(`Reaction must have at least one ${role}`);
        confidence = "low";
      }
      return;
    }

    for (const p of list) {
      if (!p || typeof p !== "object" || !p.smiles || p.smiles.trim().length === 0) {
        errors.push(`Missing or empty SMILES for ${role} participant`);
        confidence = "low";
        continue;
      }

      const struct: ChemicalStructure = {
        compoundName: p.name || (role === "reactant" ? "واکنش‌دهنده" : role === "intermediate" ? "حدواسط" : "فرآورده"),
        smiles: p.smiles,
        formula: p.formula,
      };

      const result = validateChemicalStructure(struct);
      participantValidations.push({
        smiles: p.smiles,
        role,
        result,
      });

      if (!result.valid) {
        errors.push(
          `Invalid ${role} structure '${p.name || p.smiles}': ${result.errors.join(", ")}`,
        );
        confidence = "low";
      } else if (result.needsReview || result.warnings.length > 0) {
        warnings.push(
          `${role} '${p.name || p.smiles}' has warnings: ${result.warnings.join(", ")}`,
        );
        if (confidence === "high") {
          confidence = "medium";
        }
      }
    }
  };

  if (Array.isArray(reaction.steps) && reaction.steps.length > 0) {
    for (const [sIdx, step] of reaction.steps.entries()) {
      if (!step.reactants || step.reactants.length === 0) {
        errors.push(`Step ${sIdx + 1} must have at least one reactant`);
        confidence = "low";
      } else {
        checkParticipants(step.reactants, "reactant");
      }
      if (Array.isArray(step.intermediates) && step.intermediates.length > 0) {
        checkParticipants(step.intermediates, "intermediate", false);
      }
      if (!step.products || step.products.length === 0) {
        errors.push(`Step ${sIdx + 1} must have at least one product`);
        confidence = "low";
      } else {
        checkParticipants(step.products, "product");
      }
    }
  } else {
    checkParticipants(reaction.reactants, "reactant");
    if (Array.isArray(reaction.intermediates) && reaction.intermediates.length > 0) {
      checkParticipants(reaction.intermediates, "intermediate", false);
    }
    checkParticipants(reaction.products, "product");
  }

  let mechanismValidation: ChemicalReactionValidationResult["mechanismValidation"] | undefined;


  // Validate Step-level and Top-level mechanisms if present
  if (Array.isArray(reaction.steps) && reaction.steps.length > 0) {
    for (const [sIdx, step] of reaction.steps.entries()) {
      if (step.mechanism) {
        const mechRes = validateReactionMechanism(step.reactants, step.products, step.mechanism, step.intermediates);
        if (!mechRes.valid) {
          errors.push(`Step ${sIdx + 1} mechanism error: ${mechRes.errors.join(", ")}`);
          step.mechanism.isVerified = false;
          step.mechanism.validationErrors = mechRes.errors;
          confidence = "low";
        } else {
          step.mechanism = mechRes.validatedMechanism || step.mechanism;
          step.mechanism.isVerified = mechRes.validatedMechanism?.isVerified ?? false;
        }
        if (mechRes.warnings.length > 0) {
          warnings.push(`Step ${sIdx + 1} mechanism note: ${mechRes.warnings.join(", ")}`);
        }
        if (!mechanismValidation) {
          mechanismValidation = {
            valid: mechRes.valid,
            errors: mechRes.errors,
            warnings: mechRes.warnings,
            bondChanges: mechRes.validatedMechanism?.bondChanges,
          };
        }
      }
    }
  } else if (reaction.mechanism) {
    const mechRes = validateReactionMechanism(reaction.reactants, reaction.products, reaction.mechanism, reaction.intermediates);
    if (!mechRes.valid) {
      errors.push(`Reaction mechanism error: ${mechRes.errors.join(", ")}`);
      reaction.mechanism.isVerified = false;
      reaction.mechanism.validationErrors = mechRes.errors;
      confidence = "low";
    } else {
      reaction.mechanism = mechRes.validatedMechanism || reaction.mechanism;
      reaction.mechanism.isVerified = mechRes.validatedMechanism?.isVerified ?? false;
    }
    if (mechRes.warnings.length > 0) {
      warnings.push(`Mechanism note: ${mechRes.warnings.join(", ")}`);
    }
    mechanismValidation = {
      valid: mechRes.valid,
      errors: mechRes.errors,
      warnings: mechRes.warnings,
      bondChanges: mechRes.validatedMechanism?.bondChanges,
    };
  }

  const valid = errors.length === 0;
  const needsReview = !valid || confidence === "low" || warnings.length > 0;

  return {
    valid,
    needsReview,
    confidence,
    errors,
    warnings,
    participantValidations,
    mechanismValidation,
  };
}


/**
 * Extracts and validates chemical reactions embedded in Markdown text.
 * Represents a pure, non-destructive projection of ```reaction code blocks.
 */
export function extractChemicalReactionsFromMarkdown(markdown: string): ChemicalReaction[] {
  if (!markdown || typeof markdown !== "string") return [];

  const reactions: ChemicalReaction[] = [];
  const codeBlockRegex = /```(reaction|rxn|chemical-reaction)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const lang = match[1].toLowerCase();
    const rawContent = match[2];
    const parsed = parseReactionCodeContent(rawContent, lang);
    if (parsed) {
      const validation = validateChemicalReaction(parsed);
      reactions.push({
        ...parsed,
        needsReview: validation.needsReview,
        validationErrors: validation.errors.length > 0 ? validation.errors : undefined,
        validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      });
    }
  }

  return reactions;
}


