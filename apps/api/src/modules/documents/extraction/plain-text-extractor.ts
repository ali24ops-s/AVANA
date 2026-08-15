/**
 * Plain text / Markdown / CSV text extractor.
 *
 * Extracts text from plain text files, markdown documents, CSVs, and JSON files.
 * Splits content into pages approximately every 3000 characters or on page break
 * markers (e.g. `---` or form-feed `\f`), ensuring structured chunks for LLM processing.
 */

import {
  type TextExtractor,
  type ExtractionResult,
  type ExtractedPage,
  type DocumentInput,
} from "./types.js";

export const TEXT_PLAIN_MIME = "text/plain";
export const TEXT_MARKDOWN_MIME = "text/markdown";
export const TEXT_CSV_MIME = "text/csv";
export const APP_JSON_MIME = "application/json";

const SUPPORTED_TEXT_MIMES = new Set([
  TEXT_PLAIN_MIME,
  TEXT_MARKDOWN_MIME,
  TEXT_CSV_MIME,
  APP_JSON_MIME,
  "text/x-markdown",
]);

import { sanitizeText, detectLanguage } from "./pdf-extractor.js";

export class PlainTextExtractor implements TextExtractor {
  supports(mimeType: string): boolean {
    return SUPPORTED_TEXT_MIMES.has(mimeType.toLowerCase());
  }

  async extract(input: DocumentInput): Promise<ExtractionResult> {
    const rawText = sanitizeText(input.data.toString("utf-8"));

    // Split on explicit form-feed / page breaks if present
    const rawPages = rawText.split(/\f/);
    const pages: ExtractedPage[] = [];

    if (rawPages.length > 1) {
      for (let i = 0; i < rawPages.length; i++) {
        const text = rawPages[i].trim();
        pages.push({
          pageNumber: i + 1,
          rawText: text,
          characterCount: text.length,
        });
      }
    } else {
      // Chunk long text documents into logical pages (~3000 chars at paragraph boundaries)
      const paragraphs = rawText.split(/\n\s*\n/);
      let currentPageText = "";
      let pageNum = 1;

      for (const p of paragraphs) {
        if (currentPageText.length + p.length > 3500 && currentPageText.length > 0) {
          pages.push({
            pageNumber: pageNum++,
            rawText: currentPageText.trim(),
            characterCount: currentPageText.trim().length,
          });
          currentPageText = p + "\n\n";
        } else {
          currentPageText += p + "\n\n";
        }
      }

      if (currentPageText.trim().length > 0 || pages.length === 0) {
        pages.push({
          pageNumber: pageNum,
          rawText: currentPageText.trim(),
          characterCount: currentPageText.trim().length,
        });
      }
    }

    return {
      pages,
      metadata: {
        title: input.originalName?.replace(/\.[^/.]+$/, "") ?? undefined,
        language: detectLanguage(rawText),
      },
    };
  }
}
