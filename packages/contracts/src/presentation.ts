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

export type {
  GeneratedSlideClaim,
  GeneratedSlideContentItem,
  GeneratedSlideCitation,
  GeneratedPresentationSlide,
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
} from "@avana/domain";

