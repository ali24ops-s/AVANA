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
  PresentationGenerationOperationId,
  PresentationBatchId,
  WalletTransactionId,
  DocumentId,
  OrganizationId,
  UserId,
} from "./ids.js";
import { DomainError } from "./errors.js";

// ---------------------------------------------------------------------------
// Enums & Domain Sets
// ---------------------------------------------------------------------------

export const PRESENTATION_CANONICAL_MODEL = "gemini-3.5-flash-lite" as const;
export type PresentationCanonicalModel = typeof PRESENTATION_CANONICAL_MODEL;


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

export interface SlideUnsupportedContent {
  hasCharts: boolean;
  hasSmartArt: boolean;
  hasGroupedShapes: boolean;
  chartCount: number;
  smartArtCount: number;
  warningMessage?: string;
}

export interface ExtractedSlide {
  slideIndex: number;
  title: string | null;
  rawText: string;
  textBlocks: ExtractedTextBlock[];
  tables: ExtractedTable[];
  speakerNotes: string | null;
  visuals: ExtractedVisual[];
  unsupportedContent?: SlideUnsupportedContent;
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

export interface CreatePresentationProjectInput {
  organizationId: OrganizationId;
  ownerUserId: UserId;
  title: string;
  pptxDocumentId?: DocumentId | null;
  targetDurationMinutes?: TargetDurationMinutes;
  academicLevel?: PresentationAcademicLevel;
  tone?: PresentationTone;
  elaborationDepth?: PresentationElaborationDepth;
  status?: PresentationProjectStatus;
  currentStage?: string | null;
  totalSlides?: number;
  overallIntroduction?: string | null;
  overallConclusion?: string | null;
  totalEstimatedSeconds?: number;
}

export interface UpdatePresentationProjectInput {
  title?: string;
  targetDurationMinutes?: TargetDurationMinutes;
  academicLevel?: PresentationAcademicLevel;
  tone?: PresentationTone;
  elaborationDepth?: PresentationElaborationDepth;
  status?: PresentationProjectStatus;
  currentStage?: string | null;
  totalSlides?: number;
  overallIntroduction?: string | null;
  overallConclusion?: string | null;
  totalEstimatedSeconds?: number;
}

export function validatePresentationProjectInput(
  input: Partial<CreatePresentationProjectInput>,
): void {
  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (trimmed.length === 0) {
      throw new DomainError("bad_request", "Presentation project title cannot be empty");
    }
    if (trimmed.length > 255) {
      throw new DomainError("bad_request", "Presentation project title must not exceed 255 characters");
    }
  }

  if (input.targetDurationMinutes !== undefined && !isValidTargetDuration(input.targetDurationMinutes)) {
    throw new DomainError(
      "bad_request",
      `Invalid target duration: ${input.targetDurationMinutes}. Must be 5, 10, 15, 20, or 30.`,
    );
  }

  if (input.academicLevel !== undefined && !PRESENTATION_ACADEMIC_LEVELS.includes(input.academicLevel)) {
    throw new DomainError("bad_request", `Invalid academic level: ${input.academicLevel}`);
  }

  if (input.tone !== undefined && !PRESENTATION_TONES.includes(input.tone)) {
    throw new DomainError("bad_request", `Invalid tone: ${input.tone}`);
  }

  if (input.elaborationDepth !== undefined && !PRESENTATION_ELABORATION_DEPTHS.includes(input.elaborationDepth)) {
    throw new DomainError("bad_request", `Invalid elaboration depth: ${input.elaborationDepth}`);
  }

  if (input.status !== undefined && !PRESENTATION_PROJECT_STATUSES.includes(input.status)) {
    throw new DomainError("bad_request", `Invalid project status: ${input.status}`);
  }
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
  paymentTransactionId?: string | null;
  paidAt?: string | null;
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
  paymentTransactionId?: string | null;
  paidAt?: string | null;
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
  paymentTransactionId?: string | null;
  paidAt?: string | null;
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

// ---------------------------------------------------------------------------
// 3-Tier Scientific Citation Validation Contracts
// ---------------------------------------------------------------------------

export function isValidDoi(doi: string): boolean {
  if (!doi || typeof doi !== "string") return false;
  const clean = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  return /^10\.\d{4,9}\/[-._;()/:a-zA-Z0-9]+$/.test(clean);
}

export function formatDoiUrl(doi: string): string {
  const clean = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").trim();
  return `https://doi.org/${clean}`;
}

export interface ThreeTierCitationEvaluation {
  claimText: string;
  evidenceStatus: EvidenceStatus;
  sourceExistence: {
    verified: boolean;
    status: "verified_in_snapshot" | "missing_from_snapshot" | "invalid_chunk";
    detail: string;
    chunkId?: string;
    referenceId?: string;
    sourceTitle?: string;
  };
  bibliographicAccuracy: {
    accurate: boolean;
    status: "accurate" | "partial_metadata" | "invalid_doi_format" | "unverified_identifier";
    detail: string;
    doi?: string | null;
    doiUrl?: string | null;
    authors?: string[];
    journal?: string | null;
    year?: number | null;
    title?: string | null;
    sourceType?: string;
  };
  claimSupport: {
    supported: boolean;
    status: "supported" | "insufficient_evidence" | "unsupported";
    detail: string;
    groundedChunkIds: string[];
  };
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
  slide?: GeneratedPresentationSlide;
  speechContent?: PresentationSpeakerContent;
  validation: ServerCitationValidationResult;
  repairAttempted: boolean;
  status: SlideGenerationStatus;
  generationRunId: string;
  snapshotState: SnapshotState;
  model: string;
}

// ---------------------------------------------------------------------------
// Scientific Presentation Speech Assistant Models (Speech Engine)
// ---------------------------------------------------------------------------

export interface PresentationSpeakerClaim {
  text: string;
  chunkIds: string[];
  evidenceStatus: EvidenceStatus;
}

export interface PresentationSpeakerClinicalExample {
  scenario?: string;
  clinicalPearl?: string;
  connectionToSlide?: string;
}

export interface PresentationSpeakerContent {
  /** Fluent, oral scientific speech text in natural Persian ready for verbal delivery */
  speechText: string;
  /** Supplementary academic explanation providing depth beyond the slide text */
  supplementaryExplanation?: string;
  /** Key core scientific takeaway points (1 to 3 items) */
  keyPoints?: string[];
  /** High-yield or exam-relevant points (only if genuinely applicable, else empty or omitted) */
  examPoints?: string[];
  /** Clinical or pharmacological case example (only if genuinely applicable, else null) */
  clinicalExample?: PresentationSpeakerClinicalExample | null;
  /** Grounded citations referencing snapshot chunk IDs */
  citations: GeneratedSlideCitation[];
  /** Validated individual scientific claims with explicit evidenceStatus */
  claims: PresentationSpeakerClaim[];
  /** Suggested delivery duration in seconds for this slide */
  suggestedDurationSeconds: number;
  /** Natural transition sentence connecting to the next slide */
  transitionSentence?: string;
  /** Explicit notes explaining when evidence in provided references was insufficient */
  insufficientEvidenceNotes?: string | null;
}

/**
 * Scientific abbreviations commonly found in medical and academic presentation transcripts
 * that should not trigger false sentence boundaries when followed by a dot.
 */
const SCIENTIFIC_ABBREVIATIONS = new Set([
  "dr", "prof", "vs", "eg", "ie", "al", "fig", "tab", "ref", "no",
  "vol", "approx", "ca", "min", "sec", "hr", "mg", "ml", "mcg", "kg", "mol",
]);

/**
 * Splits continuous presentation speech text into sentences without corrupting:
 * - Decimal numbers (e.g., 2.5 mg, 0.05, 3.14)
 * - Academic/medical abbreviations (e.g., Dr., Prof., vs., et al., e.g., i.e.)
 * - Pharmacological and statistical expressions (e.g., p < 0.05)
 */
export function splitSpeechSentences(text: string): string[] {
  if (!text || !text.trim()) return [];
  const normalized = text.trim();
  const sentences: string[] = [];
  let currentStart = 0;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === "." || ch === "!" || ch === "؟" || ch === "?") {
      // Look ahead past any closing parentheses, brackets, or quotes
      let lookahead = i + 1;
      while (
        lookahead < normalized.length &&
        /[)\]}»”"'’]/.test(normalized[lookahead])
      ) {
        lookahead++;
      }

      // Check if lookahead reached whitespace or end of string
      const isBoundarySpace =
        lookahead >= normalized.length || /\s/.test(normalized[lookahead]);

      if (!isBoundarySpace) {
        // e.g., 2.5 or 0.05 or within word
        continue;
      }

      if (ch === ".") {
        // Abbreviation check: examine preceding token
        const lookback = normalized.slice(Math.max(0, i - 15), i);
        const match = lookback.match(/\b([A-Za-z]{1,6})$/);
        if (match && SCIENTIFIC_ABBREVIATIONS.has(match[1].toLowerCase())) {
          continue;
        }

        // Single letter initial in name (e.g., "A. Smith")
        if (match && match[1].length === 1) {
          const afterSpace = normalized.slice(lookahead).match(/^\s+([A-Za-z\u0600-\u06FF])/);
          if (afterSpace && /^[a-z]/i.test(match[1])) {
            const nextWord = normalized.slice(lookahead).trim().split(/\s+/)[0] || "";
            // If next word starts with uppercase Latin or standard word, check if likely a surname
            if (nextWord.length > 2 && /^[A-Z]/.test(nextWord)) {
              continue;
            }
          }
        }
      }

      // Valid sentence boundary!
      // Include any closing brackets/quotes that were part of this sentence termination
      const sentence = normalized.slice(currentStart, lookahead).trim();
      if (sentence) {
        sentences.push(sentence);
      }

      // Advance past trailing whitespace
      while (lookahead < normalized.length && /\s/.test(normalized[lookahead])) {
        lookahead++;
      }
      currentStart = lookahead;
      i = lookahead - 1;
    }
  }

  // Any remaining text
  if (currentStart < normalized.length) {
    const tail = normalized.slice(currentStart).trim();
    if (tail) {
      if (sentences.length > 0 && !/[.؟!?!][)\]}»”"'’]*$/.test(sentences[sentences.length - 1])) {
        sentences[sentences.length - 1] = `${sentences[sentences.length - 1]} ${tail}`;
      } else {
        sentences.push(tail);
      }
    }
  }

  return sentences;
}

/**
 * Tier 1: High-Priority Macro Semantic Markers
 * Signals major structural shifts in presentation focus (overview -> mechanism -> clinical application -> conclusion).
 */
const HIGH_PRIORITY_TRANSITION_REGEX =
  /(?:^|[\s،,])(?:از\s+(?:نظر|دیدگاه|حیث|جنبه|منظر)\s+(?:مکانیسم|پاتوفیزیولوژی|سلولی|مولکولی|فارماکولوژی|بیوشیمیایی|شواهد|بالینی|کاربرد\s+بالینی|درمانی|عملکردی|عملی)|همان‌طور\s+که\s+در\s+(?:تصویر|اسلاید|نمودار|شکل|دیاگرام|جدول)\s+مشاهده\s+می‌کنید|در\s+(?:محیط\s+بالینی|عمل|تصمیم‌گیری\s+بالینی|بیماران|پایش\s+بیمار)|بررسی\s+شواهد\s+(?:بالینی|علمی)|بر\s+اساس\s+(?:مطالعات|یافته‌ها|داده‌ها|نتایج|گایدلاین)|نکته\s+کلیدی\s+در\s+(?:تجویز|درمان)|پروتکل\s+(?:درمانی|پیشنهادی)|در\s+رابطه\s+با\s+عوارض|در\s+تنظیم\s+دوز|مکانیسم\s+(?:اصلی|اثر|عملکرد)|در\s+سطح\s+(?:سلولی|گیرنده|بافتی)|در\s+نهایت|به\s+طور\s+خلاصه|پیام\s+(?:کلیدی|اصلی|نهایی)|نکته\s+پایانی|در\s+مجموع|در\s+ادامه\s*،?\s*به\s+بررسی)/i;

const ENGLISH_HIGH_PRIORITY_REGEX =
  /^(?:From a clinical perspective|Clinically|In clinical practice|Regarding the underlying mechanism|From a pathophysiological standpoint|At the cellular level|In terms of clinical|Looking at the (?:data|evidence|diagram|chart)|As shown in (?:the|this)|In conclusion|To summarize|Moving on to)/i;

/**
 * Tier 2: Low-Priority Discourse Connectors
 * Intra-paragraph logical connectives (therefore, furthermore, on the other hand).
 * MUST NOT trigger a paragraph break alone without a substantial paragraph body (>= 3 sentences and >= 260 chars).
 */
const LOW_PRIORITY_CONNECTOR_REGEX =
  /(?:^|[\s،,])(?:بنابراین|در\s+نتیجه|از\s+(?:سوی|طرف)\s+دیگر|در\s+مقابل|علاوه\s+بر\s+این|همچنین)/i;

const ENGLISH_LOW_PRIORITY_REGEX =
  /^(?:Therefore|Consequently|Furthermore|Moreover|In contrast|Additionally|Also)/i;

export type SemanticTransitionPriority = "high" | "low" | "none";

export function getSemanticTransitionPriority(sentence: string): SemanticTransitionPriority {
  const prefix = sentence.slice(0, 80);
  if (HIGH_PRIORITY_TRANSITION_REGEX.test(prefix) || ENGLISH_HIGH_PRIORITY_REGEX.test(prefix)) {
    return "high";
  }
  if (LOW_PRIORITY_CONNECTOR_REGEX.test(prefix) || ENGLISH_LOW_PRIORITY_REGEX.test(prefix)) {
    return "low";
  }
  return "none";
}

/**
 * Splits presentation speech text into cohesive, readable paragraphs.
 *
 * Algorithm Rules:
 * 1. Existing Paragraph Preservation: If the text is already formatted with blank lines (\n\n or \r\n\r\n),
 *    the author's or model's paragraphs are preserved intact.
 * 2. Single Line Breaks: If lines are separated by single \n and are substantial thoughts/sentences,
 *    they are cleanly treated as paragraphs.
 * 3. Continuous Unsegmented Text: Intelligently segmented into 2-4 cohesive multi-sentence paragraphs
 *    based on semantic discourse topic shifts (mechanism, clinical relevance, conclusion).
 * 4. Content Fidelity: Never deletes, summarizes, reorders, or modifies any scientific word, decimal number
 *    (e.g., 2.5 mg), or medical abbreviation (Dr., et al.).
 * 5. Flow & Cohesion: Avoids turning individual sentences into single-line paragraphs.
 * 6. Priority-Based Breaking: High-priority macro markers trigger topic shifts after cohesive thoughts,
 *    while low-priority connectors ("بنابراین", "علاوه بر این") keep sentences grouped in the same paragraph.
 */
export function splitSpeechTextIntoParagraphs(text: string | null | undefined): string[] {
  if (!text || typeof text !== "string") return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  // Step 1: Check existing multi-paragraph structure (\n\s*\n)
  const existingParagraphs = normalized
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (existingParagraphs.length >= 2) {
    return existingParagraphs;
  }

  // Step 2: Check if text has single line breaks separating logical paragraphs
  const singleLines = normalized
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (singleLines.length >= 2) {
    const allSubstantial = singleLines.every(
      (l) => l.length >= 35 || /[.؟!?!][)\]}»”"'’]*$/.test(l),
    );
    if (allSubstantial) {
      return singleLines;
    }
  }

  // Step 3: Text is a single continuous block. Split into sentences safely.
  const sentences = splitSpeechSentences(normalized);

  // If text is short or only has 1 or 2 sentences, keep as single cohesive paragraph.
  if (sentences.length <= 2 || normalized.length < 140) {
    return [normalized];
  }

  // Group sentences into 2 to 4 coherent, multi-sentence paragraphs based on semantic topic shifts
  const paragraphs: string[] = [];
  let currentGroup: string[] = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const sentence = sentences[i];
    const priority = getSemanticTransitionPriority(sentence);
    const currentLength = currentGroup.join(" ").length;
    const remainingSentences = sentences.length - i;

    // Conditions to start a new paragraph:
    // 1. High-Priority Macro Shift:
    //    Requires current group to have at least 2 sentences (or 1 compound sentence >= 140 chars)
    //    AND remaining sentences can also form a cohesive unit (remainingSentences >= 2 || (remainingSentences === 1 && sentence.length >= 100)).
    const isCurrentGroupSubstantial = currentGroup.length >= 2 || currentLength >= 140;
    const isRemainingSubstantial =
      remainingSentences >= 2 || (remainingSentences === 1 && sentence.length >= 100);

    const shouldBreakOnHighPriority =
      priority === "high" && isCurrentGroupSubstantial && isRemainingSubstantial;

    // 2. Low-Priority Connector (بنابراین, علاوه بر این, همچنین, etc.):
    //    MUST NOT create a new paragraph simply because current group has 2 sentences.
    //    Only allows a break if current group is already long (>= 3 sentences AND >= 260 chars)
    //    AND remaining sentences >= 2.
    const shouldBreakOnLowPriority =
      priority === "low" && currentGroup.length >= 3 && currentLength >= 260 && remainingSentences >= 2;

    // 3. Length Fallback (no transition markers, but text is very long):
    //    If current group has >= 3 sentences and >= 280 chars, break at natural sentence boundary.
    const shouldBreakOnLength =
      priority === "none" && currentGroup.length >= 3 && currentLength >= 280 && remainingSentences >= 2;

    if (shouldBreakOnHighPriority || shouldBreakOnLowPriority || shouldBreakOnLength) {
      paragraphs.push(currentGroup.join(" "));
      currentGroup = [sentence];
    } else {
      currentGroup.push(sentence);
    }
  }

  if (currentGroup.length > 0) {
    // If the trailing group has only 1 short sentence and we already have paragraphs,
    // merge it with the last paragraph to prevent an orphan single-sentence paragraph.
    if (paragraphs.length > 0 && currentGroup.length === 1 && currentGroup[0].length < 120) {
      paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${currentGroup[0]}`;
    } else {
      paragraphs.push(currentGroup.join(" "));
    }
  }

  return paragraphs.length > 0 ? paragraphs : [normalized];
}

/**
 * Normalizes and formats speech text into coherent paragraphs separated by double newlines (\n\n).
 */
export function formatSpeechText(text: string | null | undefined): string {
  const paragraphs = splitSpeechTextIntoParagraphs(text);
  return paragraphs.join("\n\n");
}

// ---------------------------------------------------------------------------
// Presentation Generation Operations (Persistent Financial State Machine)
// ---------------------------------------------------------------------------

export const PRESENTATION_OPERATION_STATUSES = [
  "pending",
  "debited",
  "generating",
  "completed",
  "refund_pending",
  "refunded",
  "failed",
] as const;
export type PresentationGenerationOperationStatus =
  (typeof PRESENTATION_OPERATION_STATUSES)[number];

export function isPresentationGenerationOperationStatus(
  value: string,
): value is PresentationGenerationOperationStatus {
  return (PRESENTATION_OPERATION_STATUSES as readonly string[]).includes(value);
}

export interface PresentationGenerationOperationRecord {
  id: PresentationGenerationOperationId;
  projectId: PresentationProjectId;
  slideId: PresentationSlideId;
  userId: UserId;
  batchId: PresentationBatchId | null;
  status: PresentationGenerationOperationStatus;
  costToman: number;
  debitTransactionId: WalletTransactionId | null;
  refundTransactionId: WalletTransactionId | null;
  idempotencyKey: string;
  recoveryWorkerId: string | null;
  recoveryLockedUntil: string | null;
  startedAt: string;
  completedAt: string | null;
  refundedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

