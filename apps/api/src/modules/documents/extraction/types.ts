/**
 * Text extraction core types.
 *
 * Providers a provider-agnostic `TextExtractor` abstraction so that PDF,
 * DOCX, and PPTX parsers (and a future OCR path) can be swapped without
 * touching the processing service.
 *
 * Per PR6-3:
 * - OCR is intentionally NOT implemented yet. `OCRExtractor` is exposed as a
 *   placeholder interface only, ready to be added later behind the same
 *   abstraction boundary.
 */

// ---------------------------------------------------------------------------
// Extraction output
// ---------------------------------------------------------------------------

/**
 * A single page/slide of extracted text.
 *
 * Per PR6-3, each page must expose:
 * - page_number
 * - raw_text
 * - character_count
 * - metadata
 */
export type ExtractedPage = {
  /** 1-based page/slide number within the document. */
  pageNumber: number;
  /** Raw text extracted from this page/slide. */
  rawText: string;
  /** Number of characters in rawText (excluding surrounding whitespace). */
  characterCount: number;
  /** Optional per-page/slide metadata (e.g. confidence). */
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

/** Result of a successful extraction. */
export type ExtractionResult = {
  /** Extracted pages, ordered by page number. */
  pages: ExtractedPage[];
  /** Optional document-level metadata (title, language, source format). */
  metadata?: {
    title?: string;
    language?: string;
    [key: string]: string | number | boolean | null | undefined;
  };
};

/** Input handed to an extractor. */
export type DocumentInput = {
  /** Raw file bytes. */
  data: Buffer;
  /** MIME type of the document (always lowercased by the caller). */
  mimeType: string;
  /** Original client filename (for downstream metadata). */
  originalName: string;
};

// ---------------------------------------------------------------------------
// Extractor interfaces
// ---------------------------------------------------------------------------

/**
 * Provider-agnostic text extractor.
 *
 * Implementations decide which MIME types they support and turn raw file
 * bytes into structured per-page text.
 */
export interface TextExtractor {
  /**
   * Whether this extractor can handle the given MIME type.
   */
  supports(mimeType: string): boolean;

  /**
   * Extract text from a document.
   *
   * @throws {ExtractionError} if the file is corrupted or cannot be parsed.
   */
  extract(input: DocumentInput): Promise<ExtractionResult>;
}

/**
 * OCR extractor placeholder.
 *
 * OCR is deferred per PR6-3. Do NOT implement this yet. When OCR support is
 * added later, it will be registered behind the same selection path used by
 * TextExtractor implementations so the processing service remains unchanged.
 */
export interface OCRExtractor {
  supports(mimeType: string): boolean;
  extract(input: DocumentInput): Promise<ExtractionResult>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Error raised when a document cannot be extracted (corrupt, unreadable, or
 * internally inconsistent). Carries a stable error code for status reporting.
 */
export class ExtractionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ExtractionError";
    this.code = code;
    Object.setPrototypeOf(this, ExtractionError.prototype);
  }
}
