/**
 * Type definitions for Deterministic Content Repair Engine in AVANA.
 */

export type RepairRuleId =
  | "json-leakage"
  | "latex-command-corruption"
  | "latex-delimiter-corruption"
  | "duplicated-fragment"
  | "trailing-metadata-leakage"
  | "broken-whitespace"
  | "unicode-formatting-corruption";

export type RepairConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type ContentBlockType =
  | "heading"
  | "paragraph"
  | "blockquote"
  | "list"
  | "code"
  | "math"
  | "table"
  | "unknown";

export interface ContentBlock {
  id: string;
  index: number;
  type: ContentBlockType;
  raw: string;
  startOffset: number;
  endOffset: number;
}

export interface RepairDiff {
  before: string;
  after: string;
  changedPartBefore?: string;
  changedPartAfter?: string;
}

export interface RepairCandidate {
  ruleId: RepairRuleId;
  blockIndex: number;
  blockType: ContentBlockType;
  confidence: number;
  confidenceLevel: RepairConfidenceLevel;
  reason: string;
  before: string;
  after: string;
  diff?: RepairDiff;
}

export interface RepairValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RepairPreviewResult {
  originalContent: string;
  originalHash: string;
  repairedContent: string;
  repairedHash: string;
  hasRepairs: boolean;
  totalBlocks: number;
  repairedBlockCount: number;
  candidates: RepairCandidate[];
  validation: RepairValidationResult;
}

export interface ApplyRepairInput {
  content: string;
  originalHash: string;
  appliedRuleIds?: RepairRuleId[];
  appliedBlockIndices?: number[];
}

export interface ApplyRepairResult {
  success: boolean;
  originalContent: string;
  repairedContent: string;
  contentHash: string;
  appliedCandidates: RepairCandidate[];
  validation: RepairValidationResult;
  repairedBlockCount: number;
}

export interface DetectionResult {
  detected: boolean;
  ruleId: RepairRuleId;
  confidence: number;
  confidenceLevel: RepairConfidenceLevel;
  reason: string;
  repaired: string;
  changedPartBefore?: string;
  changedPartAfter?: string;
}

export interface RepairContext {
  fullContent?: string;
  blockIndex: number;
  totalBlocks: number;
  previousBlock?: ContentBlock;
  nextBlock?: ContentBlock;
}

export interface RuleAuditSample {
  lessonId: string;
  lessonTitle?: string;
  blockIndex: number;
  confidence: number;
  confidenceLevel: RepairConfidenceLevel;
  reason: string;
  before: string;
  suggested: string;
}

export interface RuleAuditSummary {
  ruleId: RepairRuleId;
  ruleName: string;
  triggered: boolean;
  triggerCount: number;
  affectedLessonCount: number;
  affectedBlockCount: number;
  confidenceBreakdown: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  samples: RuleAuditSample[];
}

export interface ContentCorruptionAuditReport {
  totalLessonsScanned: number;
  totalBlocksScanned: number;
  lessonsWithCorruption: number;
  totalCorruptionFindings: number;
  overallConfidence: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  ruleSummaries: RuleAuditSummary[];
  scannedAt: string;
}

export interface AuditLessonInput {
  id: string;
  title?: string;
  courseId?: string;
  contentMarkdown: string;
}

