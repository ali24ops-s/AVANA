/**
 * Chemical Structure & Identity Intelligence Types for AVANA Mind Maps.
 */

import type { MindMapChemicalStructure, MindMapNodeChemicalStatus } from "@avana/contracts";
import type { AuthoritativeScaffoldRecord } from "@avana/domain";

export type ChemicalNodeClassificationType =
  | "specific_drug"
  | "specific_compound"
  | "drug_subfamily"
  | "drug_class"
  | "pharmacological_concept"
  | "chemical_concept"
  | "unknown";

export interface CandidateNodeContext {
  nodeId: string;
  title: string;
  shortDescription?: string;
  parentTitle?: string;
  parentDescription?: string;
  childrenTitles?: string[];
  category?: string;
  nodeRole?: string;
}

export interface ChemicalNodeClassificationResult {
  nodeId: string;
  classification: ChemicalNodeClassificationType;
  canonicalEnglishName?: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  suggestedAliases?: string[];
  matchedScaffold?: AuthoritativeScaffoldRecord;
  matchedScaffoldId?: string;
  applicableSubfamily?: string;
}

export interface ScientificCompoundData {
  cid: number;
  canonicalName: string;
  canonicalSmiles: string;
  isomericSmiles?: string;
  inChIKey: string;
  inChI?: string;
  formula: string;
  molecularWeight: number;
  iupacName?: string;
  synonyms: string[];
  source: "pubchem" | "reference_registry" | "cache";
  verifiedAt: string;
}

export interface ResolvedChemicalStructure {
  structure: MindMapChemicalStructure;
  status: MindMapNodeChemicalStatus;
  compoundData?: ScientificCompoundData;
  validationErrors?: string[];
  validationWarnings?: string[];
}
