/**
 * Medicinal Chemistry & Chemical Structure Domain Types.
 *
 * Additive, framework-independent primitives for chemical data representation.
 */

export interface ChemicalSarHighlight {
  feature: string;
  description: string;
}

export type ChemicalConfidence = "high" | "medium" | "low";

export interface ChemicalStructure {
  id?: string;
  compoundName: string;
  smiles: string;
  iupacName?: string;
  inchi?: string;
  formula?: string;
  molecularWeight?: number;
  drugClass?: string;
  sarHighlights?: ChemicalSarHighlight[];
  confidence?: ChemicalConfidence;
  needsReview?: boolean;
  validationErrors?: string[];
  validationWarnings?: string[];
}

export interface ChemicalValidationResult {
  valid: boolean;
  needsReview: boolean;
  confidence: ChemicalConfidence;
  errors: string[];
  warnings: string[];
  extractedFormula?: string;
  estimatedMolecularWeight?: number;
}

export interface ChemicalReactionParticipant {
  smiles: string;
  name?: string;
  formula?: string;
  coefficient?: number;
  structure?: ChemicalStructure;
  /** Future extensibility: atom mapping or reaction center atom indices */
  atomMapping?: Record<number, number>;
  reactionCenterAtoms?: number[];
  highlightColor?: string;
  isIntermediate?: boolean;
  role?: "reactant" | "product" | "intermediate";
}

export interface ChemicalReactionCondition {
  type?: "catalyst" | "reagent" | "solvent" | "temperature" | "pressure" | "time" | "general";
  value: string;
  position?: "above" | "below";
}

export interface AtomRef {
  /** Role of the participant molecule in the reaction step */
  participantRole: "reactant" | "product" | "intermediate";
  /** 0-based index of the participant molecule within reactants or products array */
  participantIndex?: number;
  /** 0-based heavy atom index in the canonical order of the participant SMILES */
  atomIndex: number;
  /** Optional chemical element symbol (e.g. "C", "Br", "O") for cross-verification */
  element?: string;
  /** Optional functional description or label (e.g. "Nucleophile Oxygen", "Leaving Bromine") */
  label?: string;
}

export interface BondRef {
  participantRole: "reactant" | "product" | "intermediate";
  participantIndex?: number;
  atom1: number;
  atom2: number;
  order?: number;
}

export interface ReactionCenter {
  /** Nucleophilic attacking atom (electron pair donor) */
  nucleophile?: AtomRef;
  /** Electrophilic substrate atom (electron pair acceptor / reaction center carbon) */
  electrophile?: AtomRef;
  /** Leaving group atom */
  leavingGroup?: AtomRef;
}

export interface BondChange {
  type: "broken" | "formed" | "order_change";
  atom1: AtomRef;
  atom2: AtomRef;
  previousOrder?: number;
  newOrder?: number;
}

export type MechanismArrowType =
  | "lone_pair_to_atom"
  | "bond_to_atom"
  | "atom_to_atom"
  | "bond_to_bond"
  | "lone_pair_to_bond";

export interface MechanismArrow {
  id?: string;
  type: MechanismArrowType;
  /** Number of electrons pushed: 2 for polar/paired (full arrowhead), 1 for radical/homolytic (fish-hook) */
  electronCount?: 1 | 2;
  lonePairIndex?: number;
  from: {
    type: "atom" | "lone_pair" | "bond";
    atom?: AtomRef;
    bond?: BondRef;
    lonePairIndex?: number;
  };
  to: {
    type: "atom" | "bond";
    atom?: AtomRef;
    bond?: BondRef;
  };
  label?: string;
  curveOffset?: number;
  direction?: "clockwise" | "counter-clockwise";
}

export interface ChemicalReactionMechanism {
  reactionType?: "SN2" | "E2" | "Addition" | "Esterification" | string;
  reactionCenter?: ReactionCenter;
  /** Mapping between reactant atom keys and product atom keys e.g. {"0:0": "0:0"} or {"r:0:0": "p:0:0"} */
  atomMapping?: Record<string, string>;
  bondChanges?: BondChange[];
  arrows?: MechanismArrow[];
  /**
   * Indicates that the mechanism data passed AVANA's deterministic structural and topological validation rules
   * (valid atom references, bonded reaction centers, consistent bond changes, and valid geometric projections).
   * NOTE: This represents algorithmic structural consistency within the defined model, not an empirical quantum-chemical certainty.
   */
  isVerified?: boolean;
  validationErrors?: string[];
  validationWarnings?: string[];
  notes?: string;
}

export interface ChemicalReactionStep {
  stepNumber?: number;
  title?: string;
  reactants: ChemicalReactionParticipant[];
  intermediates?: ChemicalReactionParticipant[];
  products: ChemicalReactionParticipant[];
  reagents?: string[];
  catalysts?: string[];
  solvents?: string[];
  conditions?: Array<string | ChemicalReactionCondition>;
  temperature?: string;
  pressure?: string;
  yield?: string;
  notes?: string;
  reversible?: boolean;
  arrowType?: "forward" | "reversible" | "resonance" | "retrosynthetic";
  /** Optional reaction mechanism for this step */
  mechanism?: ChemicalReactionMechanism;
}

export interface ChemicalReaction {
  id?: string;
  title?: string;
  description?: string;
  reactionType?: string;
  layout?: "compact" | "expanded" | "stepped";
  steps?: ChemicalReactionStep[];
  reactants: ChemicalReactionParticipant[];
  intermediates?: ChemicalReactionParticipant[];
  products: ChemicalReactionParticipant[];
  reagents?: string[];
  catalysts?: string[];
  solvents?: string[];
  conditions?: Array<string | ChemicalReactionCondition>;
  temperature?: string;
  pressure?: string;
  yield?: string;
  reversible?: boolean;
  arrowType?: "forward" | "reversible" | "resonance" | "retrosynthetic";
  needsReview?: boolean;
  validationErrors?: string[];
  validationWarnings?: string[];
  /** Optional reaction mechanism (for single-step or top-level reactions) */
  mechanism?: ChemicalReactionMechanism;
}

export interface ChemicalReactionValidationResult {
  valid: boolean;
  needsReview: boolean;
  confidence: ChemicalConfidence;
  errors: string[];
  warnings: string[];
  participantValidations: Array<{
    smiles: string;
    role: "reactant" | "product" | "intermediate";
    result: ChemicalValidationResult;
  }>;
  mechanismValidation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    bondChanges?: BondChange[];
  };
}


