/**
 * Text extraction module — Public API.
 *
 * Exposes the provider-agnostic extraction abstractions, the PDF/DOCX/PPTX
 * extractors, the registry, and the chunking strategy.
 */

export type {
  TextExtractor,
  OCRExtractor,
  ExtractionResult,
  ExtractedPage,
  DocumentInput,
} from "./types.js";
export { ExtractionError } from "./types.js";
export {
  PdfTextExtractor,
  PDF_MIME_TYPE,
  extractPdfText,
  sanitizeText,
  detectLanguage,
  normalizePersianUnicode,
} from "./pdf-extractor.js";
export { DocxTextExtractor, DOCX_MIME_TYPE } from "./docx-extractor.js";
export { PptxTextExtractor, PPTX_MIME_TYPE } from "./pptx-extractor.js";
export {
  PlainTextExtractor,
  TEXT_PLAIN_MIME,
  TEXT_MARKDOWN_MIME,
  TEXT_CSV_MIME,
  APP_JSON_MIME,
} from "./plain-text-extractor.js";
export {
  selectExtractor,
  isSupportedMimeType,
  SUPPORTED_MIME_TYPES,
} from "./extractor-registry.js";
export { buildChunks, estimateTokens, sha256Hex } from "./chunker.js";
export * from "./quality-analyzer.js";
