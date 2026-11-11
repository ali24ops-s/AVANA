/**
 * Personal Mind Map Contracts & DTOs (Interactive AI Mind Map).
 */

import type { PersonalContentStatus } from "./personal-summary.js";

export type MindMapSourceType = "reference_document" | "lessons";

export interface MindMapSourceReference {
  chunkId?: string;
  pageNumber?: number;
  lessonTitle?: string;
}

export type MindMapNodeCategory =
  | "drug"
  | "disease"
  | "cellular_mechanism"
  | "biochemistry"
  | "general"
  | (string & {});

export type MindMapNodeRole = "category" | "concept";

export interface MindMapStructuredDetails {
  mechanismOfAction?: string;
  indications?: string[];
  drugClass?: string;
  pharmacology?: string; // Pharmacokinetics & Pharmacodynamics
  adverseEffects?: string[];
  contraindications?: string[];
  interactions?: string[];
  clinicalPearls?: string[];
  commonPitfalls?: string[];
  relatedConcepts?: string[];
}

export interface MindMapNodeSection {
  id?: string;
  title: string;
  category?: string;
  content?: string;
  items?: string[];
  icon?: string;
}

export interface ChemicalSarHighlight {
  feature: string;
  description: string;
  color?: string;
}

export type ChemicalConfidence = "high" | "medium" | "low";

export type MindMapNodeChemicalStatus =
  | "not_checked"
  | "not_required"
  | "pending"
  | "enriched"
  | "needs_review"
  | "failed";

export interface MindMapChemicalEnrichmentMetadata {
  enrichedAt: string;
  version: number;
  enrichedCount: number;
  totalCandidateCount: number;
}

export type ChemicalRelationType =
  | "primary_structure"
  | "class_member"
  | "combination_component"
  | "example_of"
  | "mechanism_related"
  | "sar_related"
  | "mentioned_in"
  | "related_chemical"
  | "sar_reference"
  | "generic_scaffold"
  | "reference_core_compound"
  | "representative_compound";

export interface MindMapChemicalStructure {
  compoundName: string;
  smiles: string;
  formula?: string;
  molecularWeight?: number;
  iupacName?: string;
  drugClass?: string;
  sarHighlights?: ChemicalSarHighlight[];
  educationalNote?: string;
  confidence?: ChemicalConfidence;
  isValidated?: boolean;
  validationErrors?: string[];
  validationWarnings?: string[];

  // Normalized identity & provenance fields
  referenceCompoundId?: string;
  canonicalName?: string;
  displayName?: string;
  chemicalForm?: string;
  sourceNodeId?: string;
  provenanceField?: string;
  matchedMention?: string;
  relationType?: ChemicalRelationType;
}

export interface MindMapNodeBase {
  id: string; // Stable identifier, e.g. "node_concept_slug"
  parentId: string | null;
  title: string;
  shortDescription: string;
  detailedExplanation?: string;
  keyPoints?: string[];
  examples?: string[];
  examTips?: string[];
  sourceReferences?: MindMapSourceReference[];
  sortOrder?: number;
  semanticGroup?: string; // Stable cluster ID, e.g. "cluster_statins"
  category?: MindMapNodeCategory;
  nodeRole?: MindMapNodeRole;
  structuredDetails?: MindMapStructuredDetails;
  sections?: MindMapNodeSection[];
  chemicalStructure?: MindMapChemicalStructure;
  relatedChemicals?: MindMapChemicalStructure[];
  chemicalStatus?: MindMapNodeChemicalStatus;
}

export interface MindMapAiBase {
  rootNodeId: string;
  generatedAt: string;
  model: string;
  nodes: Record<string, MindMapNodeBase>;
  chemicalEnrichment?: MindMapChemicalEnrichmentMetadata;
}

export interface MindMapNodeOverride {
  title?: string;
  shortDescription?: string;
  parentId?: string | null;
  sortOrder?: number;
  detailedExplanation?: string;
  semanticGroup?: string;
  category?: MindMapNodeCategory;
  nodeRole?: MindMapNodeRole;
  structuredDetails?: MindMapStructuredDetails;
  sections?: MindMapNodeSection[];
  chemicalStructure?: MindMapChemicalStructure;
  relatedChemicals?: MindMapChemicalStructure[];
  chemicalStatus?: MindMapNodeChemicalStatus;
}

export interface MindMapCustomEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface MindMapUserModifications {
  deletedNodeIds: string[];
  customNodes: Record<string, MindMapNodeBase>;
  overrides: Record<string, MindMapNodeOverride>;
  customEdges?: MindMapCustomEdge[];
  nodePositions?: Record<string, { x: number; y: number }>;
}

export interface MindMapNodeUserNote {
  noteText: string;
  updatedAt: string;
}

export interface MindMapPayload {
  kind: "mind_map";
  version: number;
  sourceType: MindMapSourceType;
  sourceId: string;
  updatedAt: string;
  aiBase: MindMapAiBase;
  userModifications: MindMapUserModifications;
  userNotes: Record<string, MindMapNodeUserNote>;
}

export interface MindMapDto {
  id: string;
  userId: string;
  courseId: string;
  moduleId: string;
  version: number;
  status: PersonalContentStatus;
  payload: MindMapPayload;
  costToman: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetMindMapResponse {
  has_mind_map: boolean;
  mind_map: MindMapDto | null;
  source_available: boolean;
  source_type: MindMapSourceType | null;
}

export interface GenerateMindMapResponse {
  success: boolean;
  mind_map: MindMapDto;
}

export interface UpdateMindMapRequest {
  userModifications: MindMapUserModifications;
  userNotes: Record<string, MindMapNodeUserNote>;
  clientUpdatedAt?: string;
}

export interface ExpandMindMapNodeResponse {
  success: boolean;
  nodeId: string;
  detailedExplanation: string;
  examples: string[];
  examTips: string[];
  structuredDetails?: MindMapStructuredDetails;
  chemicalStructure?: MindMapChemicalStructure;
}

export interface MindMapVersionSummary {
  version: number;
  status: PersonalContentStatus;
  createdAt: string;
  updatedAt: string;
  sourceType: MindMapSourceType;
  nodesCount: number;
  customNodesCount: number;
  notesCount: number;
  totalNodes?: number;
}

export interface ListMindMapVersionsResponse {
  versions: MindMapVersionSummary[];
  currentVersion: number;
}

export interface RestoreMindMapVersionResponse {
  success: boolean;
  mind_map?: MindMapDto;
  mindMap?: MindMapDto;
  restoredVersion: number;
}

export interface EnrichMindMapChemicalsResponse {
  request_id?: string;
  mindMapId: string;
  totalNodes: number;
  enrichedNodes: number;
  notRequiredNodes: number;
  needsReviewNodes: number;
  failedNodes: number;
  preservedExistingNodes: number;
  changedNodes: number;
  enrichmentVersion: number;
  mind_map: MindMapDto;
}

