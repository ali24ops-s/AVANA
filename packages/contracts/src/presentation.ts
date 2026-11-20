/**
 * Presentation Assistant Contracts.
 *
 * Defines API request/response shapes for presentation references.
 */

export interface PresentationReferenceResource {
  id: string;
  project_id: string;
  document_id: string | null;
  type: string;
  title: string;
  source_identifier: string | null;
  access_status: string;
  bibliographic_metadata: Record<string, unknown>;
  extracted_content: string | null;
  created_at: string;
  updated_at: string;
}

export interface PresentationReferenceResponse {
  reference: PresentationReferenceResource;
}

export interface PresentationReferenceListResponse {
  items: PresentationReferenceResource[];
  total: number;
}

export interface CreatePresentationReferenceRequest {
  type: "text" | "pdf" | "docx" | "url" | "doi" | "pubmed";
  title: string;
  source_identifier?: string | null;
  document_id?: string | null;
  bibliographic_metadata?: Record<string, unknown>;
  extracted_content?: string | null;
}

export interface UpdatePresentationReferenceRequest {
  title?: string;
  source_identifier?: string | null;
  bibliographic_metadata?: Record<string, unknown>;
  extracted_content?: string | null;
}

// ---------------------------------------------------------------------------
// Presentation Projects Contracts
// ---------------------------------------------------------------------------

export interface PresentationProjectResource {
  id: string;
  organization_id: string;
  owner_user_id: string;
  title: string;
  pptx_document_id: string | null;
  target_duration_minutes: number;
  academic_level: string;
  tone: string;
  elaboration_depth: string;
  status: string;
  current_stage: string | null;
  total_slides: number;
  overall_introduction: string | null;
  overall_conclusion: string | null;
  total_estimated_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface PresentationProjectResponse {
  project: PresentationProjectResource;
  slides?: PresentationSlideResource[];
  references?: PresentationReferenceResource[];
}

export interface ImportPptxResponse {
  project: PresentationProjectResource;
  slides: PresentationSlideResource[];
}

export interface PresentationProjectListResponse {
  items: PresentationProjectResource[];
  total: number;
}

export interface CreatePresentationProjectRequest {
  organization_id?: string;
  title: string;
  pptx_document_id?: string | null;
  target_duration_minutes?: number;
  academic_level?: "introductory" | "intermediate" | "advanced";
  tone?: "formal_scientific" | "fluent_student";
  elaboration_depth?: "concise" | "balanced" | "comprehensive";
}

export interface UpdatePresentationProjectRequest {
  title?: string;
  target_duration_minutes?: number;
  academic_level?: "introductory" | "intermediate" | "advanced";
  tone?: "formal_scientific" | "fluent_student";
  elaboration_depth?: "concise" | "balanced" | "comprehensive";
  status?: string;
  overall_introduction?: string | null;
  overall_conclusion?: string | null;
}

// ---------------------------------------------------------------------------
// Presentation Slides Contracts
// ---------------------------------------------------------------------------

import type { PresentationSpeakerContent } from "@avana/domain";

export interface PresentationSlideResource {
  id: string;
  project_id: string;
  slide_index: number;
  title: string | null;
  raw_text: string;
  extracted_tables: Array<{ headers?: string[]; rows: string[][] }>;
  speaker_notes: string | null;
  speech_content?: PresentationSpeakerContent | null;
  has_visuals: boolean;
  visual_summary: string | null;
  media_storage_keys: string[];
  extraction_metadata: Record<string, unknown>;
  payment_transaction_id: string | null;
  paid_at: string | null;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface PresentationSlideResponse {
  slide: PresentationSlideResource;
}

export interface PresentationSlideListResponse {
  items: PresentationSlideResource[];
  total: number;
}

export interface CreatePresentationSlideRequest {
  slide_index: number;
  title?: string | null;
  raw_text?: string;
  speaker_notes?: string | null;
  has_visuals?: boolean;
  visual_summary?: string | null;
}

export interface UpdatePresentationSlideRequest {
  title?: string | null;
  raw_text?: string;
  speaker_notes?: string | null;
  has_visuals?: boolean;
  visual_summary?: string | null;
  expected_updated_at?: string;
}

// ---------------------------------------------------------------------------
// Slide Generation Contracts
// ---------------------------------------------------------------------------

export interface GenerateSlideRequest {
  instructions?: {
    academic_level?: "introductory" | "intermediate" | "advanced";
    tone?: "formal_scientific" | "fluent_student";
    elaboration_depth?: "concise" | "balanced" | "comprehensive";
    language?: "fa" | "en";
    custom_instructions?: string;
  };
}

export interface GenerateSlideResponse {
  slide: PresentationSlideResource;
  generation_status: "accepted" | "needs_review";
  repair_attempted: boolean;
  validation_status: string;
  generation_run_id: string;
  model: string;
  layout_assembly?: unknown;
  speech_content?: PresentationSpeakerContent | null;
}

export interface GenerateAllSlidesRequest {
  instructions?: {
    academic_level?: "introductory" | "intermediate" | "advanced";
    tone?: "formal_scientific" | "fluent_student";
    elaboration_depth?: "concise" | "balanced" | "comprehensive";
    language?: "fa" | "en";
    custom_instructions?: string;
  };
  only_unprocessed?: boolean;
}

export interface PresentationBatchSlideProgress {
  slide_id: string;
  slide_index: number;
  title: string | null;
  status: "pending" | "generating" | "completed" | "failed";
  error?: string | null;
}

export interface PresentationBatchCostPreviewResponse {
  project_id: string;
  total_slides: number;
  previously_paid_slides: number;
  unpaid_slides: number;
  cost_per_slide_toman: number;
  total_cost_toman: number;
  wallet_balance_toman: number;
  has_sufficient_balance: boolean;
}

export interface PresentationGenerationStatusResponse {
  project_id: string;
  status: "idle" | "generating" | "completed" | "failed";
  is_generating: boolean;
  total_slides: number;
  completed_slides: number;
  failed_slides: number;
  pending_slides: number;
  current_slide_index: number | null;
  slides_progress: PresentationBatchSlideProgress[];
  last_updated_at: string;
  previously_paid_slides?: number;
  newly_paid_slides?: number;
  successful_slides?: number;
  refunded_slides?: number;
  total_cost_toman?: number;
  refunded_amount_toman?: number;
}

export interface GenerateAllSlidesResponse {
  project_id: string;
  message: string;
  status: PresentationGenerationStatusResponse;
}

export interface PresentationPdfStatusResponse {
  project_id: string;
  status: "ready" | "processing" | "failed" | "unavailable";
  pdf_url?: string;
  error?: string | null;
  retry_after?: number | null;
}

export interface PresentationPdfExportOptions {
  includeSlideImages?: boolean;
  includeSpeechText?: boolean;
  includeKeyPoints?: boolean;
  includeSupplementary?: boolean;
  includeClinicalExample?: boolean;
  includeTransitionSentence?: boolean;
  includeEstimatedDuration?: boolean;
}

export interface ExportPresentationPdfRequest {
  options: PresentationPdfExportOptions;
  slideImages?: Record<string, string>;
  draftNotesBySlideId?: Record<string, string>;
}


export type {
  GeneratedSlideClaim,
  GeneratedSlideContentItem,
  GeneratedSlideCitation,
  GeneratedPresentationSlide,
  PresentationSpeakerClaim,
  PresentationSpeakerClinicalExample,
  PresentationSpeakerContent,
  PresentationGenerationInstructions,
  SlideGenerationResult,
  SlideGenerationStatus,
  SnapshotState,
  SlideLayoutType,
  SlideDensity,
  TextDirection,
  AssembledBlockKind,
  AssembledClaim,
  AssembledCitation,
  SlideHeaderComponent,
  AssembledContentBlockBase,
  AssembledBulletListBlock,
  AssembledTableBlock,
  AssembledTextBlock,
  AssembledStatBlock,
  AssembledQuoteBlock,
  AssembledContentBlock,
  SlideBodyLayout,
  SlideFooterComponent,
  SlideLayoutAssembly,
  PRESENTATION_CANONICAL_MODEL,
  PresentationCanonicalModel,
} from "@avana/domain";


