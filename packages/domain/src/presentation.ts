/**
 * Presentation Assistant Domain Models & Types.
 *
 * Defines core types, validation sets, and contracts for:
 * - Presentation projects
 * - Presentation slides & extracted components
 * - Presentation scientific references
 * - Extraction results contract
 */

import type {
  PresentationProjectId,
  PresentationSlideId,
  PresentationReferenceId,
  DocumentId,
  OrganizationId,
  UserId,
} from "./ids.js";
import { DomainError } from "./errors.js";

// ---------------------------------------------------------------------------
// Enums & Domain Sets
// ---------------------------------------------------------------------------

export const PRESENTATION_ACADEMIC_LEVELS = [
  "introductory",
  "intermediate",
  "advanced",
] as const;
export type PresentationAcademicLevel =
  (typeof PRESENTATION_ACADEMIC_LEVELS)[number];

export const PRESENTATION_TONES = [
  "formal_scientific",
  "fluent_student",
] as const;
export type PresentationTone = (typeof PRESENTATION_TONES)[number];

export const PRESENTATION_ELABORATION_DEPTHS = [
  "concise",
  "balanced",
  "comprehensive",
] as const;
export type PresentationElaborationDepth =
  (typeof PRESENTATION_ELABORATION_DEPTHS)[number];

export const PRESENTATION_PROJECT_STATUSES = [
  "created",
  "extracting",
  "analyzing",
  "generating",
  "completed",
  "failed",
] as const;
export type PresentationProjectStatus =
  (typeof PRESENTATION_PROJECT_STATUSES)[number];

export const PRESENTATION_REFERENCE_TYPES = [
  "text",
  "pdf",
  "docx",
  "url",
  "doi",
  "pubmed",
] as const;
export type PresentationReferenceType =
  (typeof PRESENTATION_REFERENCE_TYPES)[number];

export const PRESENTATION_REFERENCE_ACCESS_STATUSES = [
  "pending",
  "full_text_available",
  "abstract_only",
  "metadata_only",
  "manual_text_provided",
  "failed_to_fetch",
] as const;
export type PresentationReferenceAccessStatus =
  (typeof PRESENTATION_REFERENCE_ACCESS_STATUSES)[number];

export const VALID_TARGET_DURATIONS_MINUTES = [5, 10, 15, 20, 30] as const;
export type TargetDurationMinutes =
  (typeof VALID_TARGET_DURATIONS_MINUTES)[number];

export function isValidTargetDuration(minutes: number): minutes is TargetDurationMinutes {
  return VALID_TARGET_DURATIONS_MINUTES.includes(minutes as TargetDurationMinutes);
}

// ---------------------------------------------------------------------------
// Extracted Presentation Contract (Standard & Independent of PPTX XML)
// ---------------------------------------------------------------------------

export interface ExtractedTextBlock {
  text: string;
  type: "title" | "paragraph" | "bullet";
  order: number;
}

export interface ExtractedTable {
  headers?: string[];
  rows: string[][];
}

export interface ExtractedVisual {
  id: string;
  mediaFileName: string;
  mimeType: string;
  storageKey?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
}

export interface ExtractedSlide {
  slideIndex: number;
  title: string | null;
  rawText: string;
  textBlocks: ExtractedTextBlock[];
  tables: ExtractedTable[];
  speakerNotes: string | null;
  visuals: ExtractedVisual[];
  metadata?: Record<string, unknown>;
}

export interface ExtractedPresentation {
  totalSlides: number;
  title: string | null;
  slides: ExtractedSlide[];
  metadata?: {
    author?: string;
    slideCount: number;
    hasSpeakerNotes: boolean;
    hasTables: boolean;
    totalVisuals: number;
    createdAt?: string;
    modifiedAt?: string;
  };
}

// ---------------------------------------------------------------------------
// Domain Records & Input Types
// ---------------------------------------------------------------------------

export interface PresentationProjectRecord {
  id: PresentationProjectId;
  organizationId: OrganizationId;
  ownerUserId: UserId;
  title: string;
  pptxDocumentId: DocumentId | null;
  targetDurationMinutes: number;
  academicLevel: PresentationAcademicLevel;
  tone: PresentationTone;
  elaborationDepth: PresentationElaborationDepth;
  status: PresentationProjectStatus;
  currentStage: string | null;
  totalSlides: number;
  overallIntroduction: string | null;
  overallConclusion: string | null;
  totalEstimatedSeconds: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PresentationSlideRecord {
  id: PresentationSlideId;
  projectId: PresentationProjectId;
  slideIndex: number;
  title: string | null;
  rawText: string;
  extractedTables: Array<{ headers?: string[]; rows: string[][] }>;
  speakerNotes: string | null;
  hasVisuals: boolean;
  visualSummary: string | null;
  mediaStorageKeys: string[];
  extractionMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationBibliographicMetadata {
  authors?: string[];
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
  abstract?: string;
  [key: string]: unknown;
}

export interface PresentationReferenceRecord {
  id: PresentationReferenceId;
  projectId: PresentationProjectId;
  documentId: DocumentId | null;
  type: PresentationReferenceType;
  title: string;
  sourceIdentifier: string | null;
  accessStatus: PresentationReferenceAccessStatus;
  bibliographicMetadata: PresentationBibliographicMetadata;
  extractedContent: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Reference Input Contracts & Validation
// ---------------------------------------------------------------------------

export interface CreatePresentationReferenceInput {
  projectId: PresentationProjectId;
  type: PresentationReferenceType;
  title: string;
  sourceIdentifier?: string | null;
  documentId?: DocumentId | null;
  accessStatus?: PresentationReferenceAccessStatus;
  bibliographicMetadata?: PresentationBibliographicMetadata;
  extractedContent?: string | null;
}

export interface UpdatePresentationReferenceInput {
  title?: string;
  sourceIdentifier?: string | null;
  accessStatus?: PresentationReferenceAccessStatus;
  bibliographicMetadata?: PresentationBibliographicMetadata;
  extractedContent?: string | null;
}

export const MAX_REFERENCE_TITLE_LENGTH = 500;
export const MAX_REFERENCE_SOURCE_IDENTIFIER_LENGTH = 2000;
export const MAX_REFERENCE_EXTRACTED_CONTENT_LENGTH = 500_000;

export function normalizeTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeSourceIdentifier(
  identifier?: string | null,
  type?: PresentationReferenceType,
): string | null {
  if (!identifier) return null;
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  if (type === "doi") {
    // Strip common DOI prefixes: https://doi.org/, http://dx.doi.org/, doi:
    return trimmed
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .trim()
      .toLowerCase();
  }

  if (type === "pubmed") {
    // Strip PMID: prefix
    return trimmed
      .replace(/^pmid:\s*/i, "")
      .replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, "")
      .replace(/\/$/, "")
      .trim()
      .toLowerCase();
  }

  if (type === "url") {
    try {
      const parsed = new URL(trimmed);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}${parsed.search}`;
    } catch {
      return trimmed.toLowerCase();
    }
  }

  return trimmed.toLowerCase();
}

export function validatePresentationReferenceInput(
  input: Partial<CreatePresentationReferenceInput>,
): void {
  if (input.type && !PRESENTATION_REFERENCE_TYPES.includes(input.type)) {
    throw new DomainError(
      "bad_request",
      `Invalid presentation reference type: ${input.type}`,
    );
  }

  if (input.title !== undefined) {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length === 0) {
      throw new DomainError("bad_request", "Reference title cannot be empty");
    }
    if (trimmedTitle.length > MAX_REFERENCE_TITLE_LENGTH) {
      throw new DomainError(
        "bad_request",
        `Reference title must not exceed ${MAX_REFERENCE_TITLE_LENGTH} characters`,
      );
    }
  }

  if (input.sourceIdentifier !== undefined && input.sourceIdentifier !== null) {
    const trimmedId = input.sourceIdentifier.trim();
    if (trimmedId.length > MAX_REFERENCE_SOURCE_IDENTIFIER_LENGTH) {
      throw new DomainError(
        "bad_request",
        `Source identifier must not exceed ${MAX_REFERENCE_SOURCE_IDENTIFIER_LENGTH} characters`,
      );
    }
  }

  if (input.extractedContent !== undefined && input.extractedContent !== null) {
    if (input.extractedContent.length > MAX_REFERENCE_EXTRACTED_CONTENT_LENGTH) {
      throw new DomainError(
        "bad_request",
        `Extracted content must not exceed ${MAX_REFERENCE_EXTRACTED_CONTENT_LENGTH} characters`,
      );
    }
  }

  if (
    input.accessStatus &&
    !PRESENTATION_REFERENCE_ACCESS_STATUSES.includes(input.accessStatus)
  ) {
    throw new DomainError(
      "bad_request",
      `Invalid presentation reference access status: ${input.accessStatus}`,
    );
  }
}

export function isDuplicateReference(
  existing: PresentationReferenceRecord,
  candidate: {
    type: PresentationReferenceType;
    title: string;
    sourceIdentifier?: string | null;
    documentId?: DocumentId | null;
  },
): boolean {
  // 1. Same physical document in this project
  if (
    candidate.documentId &&
    existing.documentId &&
    existing.documentId === candidate.documentId
  ) {
    return true;
  }

  // 2. Same normalized sourceIdentifier for identifier-backed types
  if (candidate.sourceIdentifier && existing.sourceIdentifier) {
    const normExistingSource = normalizeSourceIdentifier(
      existing.sourceIdentifier,
      existing.type,
    );
    const normCandidateSource = normalizeSourceIdentifier(
      candidate.sourceIdentifier,
      candidate.type,
    );
    if (
      normExistingSource &&
      normCandidateSource &&
      normExistingSource === normCandidateSource
    ) {
      return true;
    }
  }

  // 3. For textual or manual title-based references without distinct external identifiers
  const normExistingTitle = normalizeTitle(existing.title);
  const normCandidateTitle = normalizeTitle(candidate.title);

  if (
    existing.type === candidate.type &&
    normExistingTitle === normCandidateTitle &&
    !candidate.documentId &&
    !existing.documentId &&
    !candidate.sourceIdentifier &&
    !existing.sourceIdentifier
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Semantic Reference Chunk Contract (Phase 2A-2.1)
// ---------------------------------------------------------------------------

export const REFERENCE_CHUNK_CONTENT_TYPES = [
  "paragraph",
  "heading",
  "table",
  "list",
  "speaker_notes",
] as const;

export type ReferenceChunkContentType =
  (typeof REFERENCE_CHUNK_CONTENT_TYPES)[number];

export interface SemanticReferenceChunk {
  /** 0-based sequential order of the chunk in the reference or document stream. */
  sequence: number;
  /** Cleaned, canonicalized content text of the chunk. */
  content: string;
  /** Hierarchical heading path representing structural position (e.g. ["Chapter 1", "Section 1.2"]). */
  headingPath: string[];
  /** Structural category of the chunk content. */
  contentType: ReferenceChunkContentType;
  /** 1-based start page number in source document, or null if unpaged/unknown. */
  startPage: number | null;
  /** 1-based end page number in source document, or null if unpaged/unknown. */
  endPage: number | null;
  /** Estimated token count (~4 chars per token approximation). */
  tokenEstimate: number;
  /** Stable SHA-256 hex digest of the canonicalized content. */
  contentHash: string;
  /** Optional reference to upstream document chunk id if mapped from an existing document. */
  sourceChunkId?: string | null;
  /**
   * Optional start and end character offsets in the original raw source text
   * measured as 0-based JavaScript / UTF-16 character indices (start inclusive, end exclusive).
   * Note: Set to null when exact source character location cannot be reliably mapped.
   */
  sourceOffset?: {
    start: number;
    end: number;
  } | null;
}

export interface SemanticChunkerOptions {
  /** Target token count per chunk (default: 600). */
  targetTokens?: number;
  /** Soft maximum tokens before finalizing a chunk boundary (default: 800). */
  softMaxTokens?: number;
  /** Hard maximum tokens before forceful split at clause or word boundaries (default: 1000). */
  hardMaxTokens?: number;
  /** Number of tokens to overlap between adjacent narrative chunks (default: 0). */
  overlapTokens?: number;
  /** Base heading breadcrumb path to prepend to all generated chunks (default: []). */
  baseHeadingPath?: string[];
  /** Optional 1-based start page to assign if not derived from blocks. */
  startPage?: number | null;
  /** Optional 1-based end page to assign if not derived from blocks. */
  endPage?: number | null;
  /** Optional source chunk identifier to preserve across processing. */
  sourceChunkId?: string | null;
}

export interface SemanticChunkerInputBlock {
  /** Text content of the input block. */
  content: string;
  /** 1-based start page of this block. */
  startPage?: number | null;
  /** 1-based end page of this block. */
  endPage?: number | null;
  /** Optional pre-parsed heading path for this block. */
  headingPath?: string[];
  /** Structural category of this block if known in advance. */
  contentType?: ReferenceChunkContentType;
  /** Optional upstream source chunk id. */
  sourceChunkId?: string | null;
  /** Optional character offset range in source document. */
  sourceOffset?: {
    start: number;
    end: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Reference Integration Contracts (Phase 2A-2.2)
// ---------------------------------------------------------------------------

/**
 * Confidence grading of reference source location metadata:
 * - "exact": Verified physical page layout (e.g. PDF documents with explicit physical page boundaries).
 * - "approximate": Logical or synthetic pagination with deterministic boundaries (e.g. DOCX or structured text).
 * - "unknown": Unpaged or direct content (e.g. direct text, PubMed abstracts, URLs) without physical pagination.
 */
export const SOURCE_LOCATION_CONFIDENCES = [
  "exact",
  "approximate",
  "unknown",
] as const;

export type SourceLocationConfidence =
  (typeof SOURCE_LOCATION_CONFIDENCES)[number];

export const REFERENCE_PROVENANCE_TYPES = [
  "stored_document_chunk",
  "derived_semantic_chunk",
] as const;

export type ReferenceProvenanceType =
  (typeof REFERENCE_PROVENANCE_TYPES)[number];

export interface ReferenceSourceLocation {
  /** 1-based start page in source document, or null if unpaged/unknown. */
  startPage: number | null;
  /** 1-based end page in source document, or null if unpaged/unknown. */
  endPage: number | null;
  /** Slide index if reference originated from presentation slide, or null otherwise. */
  slideIndex: number | null;
  /** Character offset range in original text, or null if unmapped. */
  sourceOffset: {
    start: number;
    end: number;
  } | null;
  /** Confidence grade of the location metadata. */
  confidence: SourceLocationConfidence;
}

export interface ReferenceSourceIdentity {
  /** Authoritative presentation reference id. */
  referenceId: PresentationReferenceId;
  /** Associated document id if backed by an uploaded document, or null for direct sources. */
  documentId: DocumentId | null;
  /** Reference type classification (document, text, pubmed, doi, url). */
  sourceType: PresentationReferenceType;
  /** Canonical title of the reference. */
  title: string;
  /** Normalized source identifier (DOI, PMID, URL), or null. */
  sourceIdentifier: string | null;
  /** Human-readable and model-friendly citation label (e.g. "[1] Smith et al. (2024)"). */
  citationLabel: string;
  /** Bibliographic metadata associated with the reference. */
  bibliographicMetadata: PresentationBibliographicMetadata;
}

export interface IntegratedReferenceChunk {
  /**
   * Deterministic composite identifier:
   * `refchunk_${referenceId}_${sequence}_${contentHashPrefix}`
   */
  id: string;
  /** Authoritative identity and metadata of the origin reference. */
  source: ReferenceSourceIdentity;
  /** Underlying semantic chunk data. */
  chunk: SemanticReferenceChunk;
  /** Verified physical or logical location in source material. */
  location: ReferenceSourceLocation;
  /** Processing provenance (retrieved from existing document_chunks vs. computed on-the-fly). */
  provenance: ReferenceProvenanceType;
}

/**
 * Structural citation validation result.
 *
 * NOTE: Validates structural citation existence, chunk ID integrity, and project ownership.
 * Does NOT perform semantic entailment or Natural Language Inference (NLI) of slide content claims.
 */
export interface CitationGroundingVerificationResult {
  /** True if all candidate chunk IDs were verified to exist and belong to this project's references. */
  valid: boolean;
  /** List of chunk IDs confirmed to belong to this project's references. */
  validChunkIds: string[];
  /** List of chunk IDs that could not be matched (potential hallucinations, stale IDs, or foreign chunks). */
  invalidChunkIds: string[];
  /** Distinct reference source identities that were successfully grounded structurally. */
  groundedReferences: ReferenceSourceIdentity[];
}

export interface ProjectReferenceResolutionSummary {
  projectId: PresentationProjectId;
  totalReferences: number;
  totalChunks: number;
  storedDocumentChunks: number;
  derivedSemanticChunks: number;
  totalTokenEstimate: number;
}

/**
 * Extract author surname/last name from string (handles "Last, First" and "First Last").
 */
export function extractAuthorLastName(authorStr: string): string {
  const trimmed = authorStr.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    return trimmed.split(",")[0].trim();
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Format a deterministic citation label for a reference.
 * Examples:
 * - "[1] Smith et al. (2024)"
 * - "[2] Miller & Davis (2023)"
 * - "[3] Harrison (2021)"
 * - "[4] Clinical Guidelines in Oncology (2022)"
 * - "[5] Direct Clinical Note"
 */
export function formatCitationLabel(
  reference: {
    title: string;
    bibliographicMetadata?: PresentationBibliographicMetadata;
  },
  index?: number,
): string {
  const prefix = typeof index === "number" ? `[${index}] ` : "";
  const meta = reference.bibliographicMetadata;
  const authors = (meta?.authors ?? []).filter(
    (a) => typeof a === "string" && a.trim().length > 0,
  );
  const year = meta?.year;

  let authorPart = "";
  if (authors.length === 1) {
    authorPart = extractAuthorLastName(authors[0]);
  } else if (authors.length === 2) {
    authorPart = `${extractAuthorLastName(authors[0])} & ${extractAuthorLastName(authors[1])}`;
  } else if (authors.length > 2) {
    authorPart = `${extractAuthorLastName(authors[0])} et al.`;
  }

  if (authorPart && year) {
    return `${prefix}${authorPart} (${year})`;
  }
  if (authorPart) {
    return `${prefix}${authorPart}`;
  }

  const shortTitle =
    reference.title.length > 50
      ? `${reference.title.slice(0, 47)}...`
      : reference.title;

  if (year) {
    return `${prefix}${shortTitle} (${year})`;
  }
  return `${prefix}${shortTitle}`;
}

/**
 * Deterministically compute the composite ID for an integrated reference chunk.
 */
export function computeIntegratedChunkId(
  referenceId: string,
  sequence: number,
  contentHash: string,
): string {
  const hashPrefix = contentHash ? contentHash.slice(0, 8) : "00000000";
  return `refchunk_${referenceId}_${sequence}_${hashPrefix}`;
}

// ---------------------------------------------------------------------------
// Reference Context Selection & Token Budget Contracts (Phase 2A-2.3a)
// ---------------------------------------------------------------------------

export interface SlideContextQuery {
  /** 1-based index of the slide in the presentation */
  slideIndex: number;
  /** Primary slide title */
  title?: string | null;
  /** Key learning points, bullet ideas, or concepts intended for this slide */
  keyPoints?: string[];
  /** Structural category of the slide (e.g. content, title, agenda, case_study, conclusion) */
  slideType?: string;
  /** Optional specific learning outcome targeted by this slide */
  intendedLearningOutcome?: string | null;
  /** Optional pre-existing raw slide text or draft notes */
  existingText?: string | null;
}

export interface ReferenceContextScoringWeights {
  /** Weight for matching slide title against chunk content (default: 0.35) */
  titleContentWeight: number;
  /** Weight for matching slide key points against chunk content (default: 0.30) */
  keyPointsContentWeight: number;
  /** Weight for matching slide title/keywords against chunk heading path (default: 0.20) */
  titleHeadingWeight: number;
  /** Weight for matching slide title/topic against reference source title (default: 0.15) */
  referenceTitleWeight: number;
}

export const DEFAULT_REFERENCE_SCORING_WEIGHTS: ReferenceContextScoringWeights = {
  titleContentWeight: 0.35,
  keyPointsContentWeight: 0.30,
  titleHeadingWeight: 0.20,
  referenceTitleWeight: 0.15,
};

export const DEFAULT_RELEVANCE_THRESHOLD = 0.12;
export const DEFAULT_MAX_CHUNKS_PER_SLIDE = 5;
export const DEFAULT_MAX_TOKENS_PER_SLIDE = 3000;
export const DEFAULT_MAX_TOKENS_PER_CHUNK = 1000;
export const DEFAULT_SAFETY_MARGIN_MULTIPLIER = 1.25;

export interface ReferenceContextSelectionOptions {
  /** Maximum number of chunks to select for this slide (default: 5) */
  maxChunks?: number;
  /** Maximum aggregate token budget for reference context in this slide (default: 3000) */
  maxTokens?: number;
  /** Maximum token budget allowed for any single chunk before it is rejected as oversized (default: 1000) */
  maxTokensPerChunk?: number;
  /** Minimum relevance score required to be selected (default: 0.12) */
  minRelevanceScore?: number;
  /** Multiplier applied to conservative token counts (default: 1.25) */
  safetyMarginMultiplier?: number;
  /** Configurable component weights for lexical heuristic scoring */
  scoringWeights?: Partial<ReferenceContextScoringWeights>;
  /** Whether to account for metadata overhead (citation label, title, chunk ID) in token budget (default: true) */
  includeMetadataTokens?: boolean;
}

export interface SelectedReferenceChunk {
  /** The original, unmutated integrated reference chunk */
  chunk: IntegratedReferenceChunk;
  /** Deterministic heuristic lexical score (between 0 and 1) */
  score: number;
  /** Traceable reasons and keyword matches explaining why this chunk was selected */
  reasons: string[];
  /** Estimated token cost for this chunk in the slide context */
  estimatedTokens: number;
  /** 1-based rank among selected chunks */
  rank: number;
}

export const REJECTION_REASONS = [
  "below_relevance_threshold",
  "oversized_chunk",
  "exceeds_token_budget",
  "exceeds_max_chunks",
  "redundant_near_duplicate",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface RejectedReferenceChunk {
  /** The evaluated integrated reference chunk */
  chunk: IntegratedReferenceChunk;
  /** Calculated heuristic score */
  score: number;
  /** Categorized rejection reason */
  reason: RejectionReason;
  /** Detailed human-readable explanation */
  detail: string;
  /** Estimated token cost */
  estimatedTokens: number;
}

export interface ReferenceContextSelectionResult {
  /** Target slide index */
  slideIndex: number;
  /** Chunks selected for prompt injection, ordered by deterministic rank */
  selectedChunks: SelectedReferenceChunk[];
  /** Chunks rejected during evaluation with traceable rationale */
  rejectedChunks: RejectedReferenceChunk[];
  /** Total number of project chunks evaluated */
  evaluatedCount: number;
  /** Aggregate token count of all selected chunks (including metadata if enabled) */
  totalSelectedTokens: number;
  /** Applied token budget limit */
  budgetLimitTokens: number;
  /** Remaining token headroom */
  remainingTokens: number;
}

export interface TokenEstimationBreakdown {
  /** Estimated tokens from Persian/Arabic script characters */
  persianTokens: number;
  /** Estimated tokens from Latin/English script characters */
  latinTokens: number;
  /** Estimated tokens from digits, scientific symbols, and punctuation */
  otherTokens: number;
  /** Raw token sum before safety multiplier */
  rawTotal: number;
  /** Configured safety margin multiplier */
  safetyMultiplier: number;
  /** Final conservative token count: ceil(rawTotal * safetyMultiplier) */
  finalTotal: number;
}

// ---------------------------------------------------------------------------
// Phase 2A-2.3b: PresentationSlide CRUD & Historical Snapshot Contracts
// ---------------------------------------------------------------------------

export interface CreatePresentationSlideInput {
  projectId: PresentationProjectId;
  slideIndex: number;
  title?: string | null;
  rawText?: string;
  extractedTables?: Array<{ headers?: string[]; rows: string[][] }>;
  speakerNotes?: string | null;
  hasVisuals?: boolean;
  visualSummary?: string | null;
  mediaStorageKeys?: string[];
  extractionMetadata?: Record<string, unknown>;
}

export interface UpdatePresentationSlideInput {
  title?: string | null;
  rawText?: string;
  extractedTables?: Array<{ headers?: string[]; rows: string[][] }>;
  speakerNotes?: string | null;
  hasVisuals?: boolean;
  visualSummary?: string | null;
  mediaStorageKeys?: string[];
  extractionMetadata?: Record<string, unknown>;
  expectedUpdatedAt?: string;
}

export function validatePresentationSlideInput(
  input: CreatePresentationSlideInput,
): void {
  if (!input.projectId) {
    throw new DomainError("bad_request", "Project ID is required for slide");
  }
  if (
    typeof input.slideIndex !== "number" ||
    input.slideIndex <= 0 ||
    !Number.isInteger(input.slideIndex)
  ) {
    throw new DomainError(
      "bad_request",
      "Slide index must be a positive integer (> 0)",
    );
  }
  if (input.title && input.title.length > 500) {
    throw new DomainError(
      "bad_request",
      "Slide title exceeds maximum length of 500 characters",
    );
  }
}

/**
 * Immutable representation of a reference chunk captured at generation time.
 * Full content is stored to ensure 100% historical reproducibility even if
 * original documents or references are subsequently modified or deleted.
 */
export interface SnapshotReferenceChunk {
  chunkId: string;
  referenceId: PresentationReferenceId;
  sourceType: PresentationReferenceType;
  sourceTitle: string;
  citationLabel: string;
  sourceLocation: {
    startPage: number | null;
    endPage: number | null;
    slideIndex: number | null;
    confidence: "exact" | "approximate" | "unknown";
  };
  contentHash: string;
  /** Full unmutated chunk text preserved for historical reproducibility */
  content: string;
  selectionScore: number;
  selectionReasons: string[];
  rank: number;
}

export const SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;

export const REFERENCE_CONTEXT_SNAPSHOT_KEY = "referenceContextSnapshot" as const;

/**
 * Self-contained historical snapshot of reference context selected for a slide.
 */
export interface SlideReferenceContextSnapshot {
  schemaVersion: typeof SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION;
  generationRunId: string;
  selectorVersion: string;
  selectedAt: string;
  projectId: PresentationProjectId;
  slideIndex: number;
  chunks: SnapshotReferenceChunk[];
  totalSelectedTokens: number;
}

/**
 * Helper to build a self-contained snapshot from selection results.
 */
export function createSlideReferenceSnapshot(params: {
  generationRunId: string;
  selectorVersion?: string;
  projectId: PresentationProjectId;
  selectionResult: ReferenceContextSelectionResult;
}): SlideReferenceContextSnapshot {
  return {
    schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
    generationRunId: params.generationRunId,
    selectorVersion: params.selectorVersion ?? "heuristic-lexical-v1",
    selectedAt: new Date().toISOString(),
    projectId: params.projectId,
    slideIndex: params.selectionResult.slideIndex,
    totalSelectedTokens: params.selectionResult.totalSelectedTokens,
    chunks: params.selectionResult.selectedChunks.map((sc) => ({
      chunkId: sc.chunk.id,
      referenceId: sc.chunk.source.referenceId,
      sourceType: sc.chunk.source.sourceType,
      sourceTitle: sc.chunk.source.title,
      citationLabel: sc.chunk.source.citationLabel,
      sourceLocation: {
        startPage: sc.chunk.location.startPage,
        endPage: sc.chunk.location.endPage,
        slideIndex: sc.chunk.location.slideIndex,
        confidence: sc.chunk.location.confidence,
      },
      contentHash: sc.chunk.chunk.contentHash,
      content: sc.chunk.chunk.content,
      selectionScore: sc.score,
      selectionReasons: [...sc.reasons],
      rank: sc.rank,
    })),
  };
}

// ---------------------------------------------------------------------------
// Server Citation Validator Contracts (Phase 2A-2.3b)
// ---------------------------------------------------------------------------

export const CITATION_VALIDATION_STATUSES = [
  "valid",
  "unknown_snapshot",
  "invalid_chunk_id",
  "chunk_not_in_slide_context",
  "reference_mismatch",
  "project_mismatch",
  "malformed_citation",
  "snapshot_integrity_failure",
  "unsupported_claim_missing_citation",
  "unused_extra_citation",
  "claim_citation_mismatch",
] as const;

export type CitationValidationStatus =
  (typeof CITATION_VALIDATION_STATUSES)[number];

export interface CitationClaimInput {
  chunkId: string;
  referenceId?: string;
  claimSnippet?: string;
}

export interface SingleCitationValidationResult {
  chunkId: string;
  status: CitationValidationStatus;
  detail: string;
  matchedChunk?: SnapshotReferenceChunk;
}

export interface ServerCitationValidationResult {
  valid: boolean;
  status: CitationValidationStatus;
  slideIndex: number;
  projectId: PresentationProjectId;
  evaluatedCitations: SingleCitationValidationResult[];
  validCount: number;
  invalidCount: number;
}

// ---------------------------------------------------------------------------
// Structured Slide Generation & Grounding Contracts (Phase 2A-2.3c)
// ---------------------------------------------------------------------------

export const SNAPSHOT_STATES = [
  "valid_with_references",
  "valid_empty",
  "missing_snapshot",
  "corrupted_snapshot",
] as const;

export type SnapshotState = (typeof SNAPSHOT_STATES)[number];

export const EVIDENCE_STATUSES = [
  "supported",
  "insufficient_evidence",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const GENERATED_SLIDE_CONTENT_TYPES = [
  "text",
  "bullet_list",
  "table",
] as const;

export type GeneratedSlideContentType =
  (typeof GENERATED_SLIDE_CONTENT_TYPES)[number];

export interface GeneratedSlideClaim {
  text: string;
  chunkIds: string[];
  evidenceStatus: EvidenceStatus;
}

export interface GeneratedSlideContentItem {
  type: GeneratedSlideContentType;
  content: string;
  claims: GeneratedSlideClaim[];
}

export interface GeneratedSlideCitation {
  chunkId: string;
  referenceId?: string;
}

export interface GeneratedPresentationSlide {
  title: string;
  subtitle?: string;
  content: GeneratedSlideContentItem[];
  speakerNotes: string;
  citations: GeneratedSlideCitation[];
}

export interface PresentationGenerationInstructions {
  language?: string;
  customInstructions?: string;
  academicLevel?: PresentationAcademicLevel;
  tone?: PresentationTone;
  elaborationDepth?: PresentationElaborationDepth;
}

export const SLIDE_GENERATION_STATUSES = [
  "accepted",
  "needs_review",
] as const;

export type SlideGenerationStatus =
  (typeof SLIDE_GENERATION_STATUSES)[number];

export interface SlideGenerationResult {
  slide: GeneratedPresentationSlide;
  validation: ServerCitationValidationResult;
  repairAttempted: boolean;
  status: SlideGenerationStatus;
  generationRunId: string;
  snapshotState: SnapshotState;
}


