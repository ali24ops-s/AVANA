/**
 * Extractor registry.
 *
 * Selects the appropriate TextExtractor for a given MIME type. New extractors
 * (including a future OCRExtractor) can be registered here without changing
 * the processing service.
 */

import { type TextExtractor, ExtractionError } from "./types.js";
import { PdfTextExtractor } from "./pdf-extractor.js";
import { DocxTextExtractor } from "./docx-extractor.js";
import { PptxTextExtractor } from "./pptx-extractor.js";
import {
  PlainTextExtractor,
  TEXT_PLAIN_MIME,
  TEXT_MARKDOWN_MIME,
  TEXT_CSV_MIME,
  APP_JSON_MIME,
} from "./plain-text-extractor.js";

/**
 * All supported document MIME types.
 */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  TEXT_PLAIN_MIME,
  TEXT_MARKDOWN_MIME,
  TEXT_CSV_MIME,
  APP_JSON_MIME,
  "text/x-markdown",
];

/**
 * Registry of extractors, ordered so the first match wins.
 */
const EXTRACTORS: TextExtractor[] = [
  new PdfTextExtractor(),
  new DocxTextExtractor(),
  new PptxTextExtractor(),
  new PlainTextExtractor(),
];

/**
 * Select the extractor that supports the given MIME type.
 *
 * @throws {ExtractionError} if no extractor supports the MIME type.
 */
export function selectExtractor(mimeType: string): TextExtractor {
  const normalized = mimeType.toLowerCase();
  for (const extractor of EXTRACTORS) {
    if (extractor.supports(normalized)) return extractor;
  }
  throw new ExtractionError(
    "unsupported_mime",
    `No extractor available for MIME type: ${mimeType}`,
  );
}

/**
 * Whether the given MIME type is supported by any registered extractor.
 */
export function isSupportedMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return EXTRACTORS.some((extractor) => extractor.supports(normalized));
}
