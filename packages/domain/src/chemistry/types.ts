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
