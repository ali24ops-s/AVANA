/**
 * DOCX text extractor.
 *
 * A DOCX file is a ZIP container. The main document content lives in
 * `word/document.xml`, where paragraphs are `<w:p>` elements and runs of text
 * are `<w:t>` elements. We extract text from those runs and group them into
 * pages (each `<w:p>` treated as a line; pagination is not physically encoded,
 * so we emit a single page per the abstraction contract).
 */

import JSZip from "jszip";
import {
  type TextExtractor,
  type ExtractionResult,
  type ExtractedPage,
  type DocumentInput,
  ExtractionError,
} from "./types.js";

/** DOCX MIME type. */
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** DOC legacy MIME type (not supported by this extractor, but declared). */
export const DOC_MIME_TYPE = "application/msword";

/** The path to the main document part inside the DOCX package. */
const DOCUMENT_XML_PATH = "word/document.xml";

/**
 * Extract the text content of a DOCX buffer.
 *
 * @returns array of paragraphs (lines) extracted from the document.
 */
export async function extractDocxText(
  data: Buffer,
): Promise<{ paragraphs: string[]; title: string | null }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (err) {
    throw new ExtractionError(
      "invalid_docx",
      `Not a valid DOCX file: ${(err as Error)?.message ?? "unreadable"}`,
    );
  }

  const docFile = zip.file(DOCUMENT_XML_PATH);
  if (!docFile) {
    throw new ExtractionError(
      "invalid_docx",
      "DOCX package is missing word/document.xml",
    );
  }

  const xml = await docFile.async("string");

  // Extract paragraphs (<w:p>...</w:p>) then the text runs (<w:t>) within.
  const paragraphs: string[] = [];
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(xml)) !== null) {
    const paraBody = m[1] ?? "";
    const textRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    const runs: string[] = [];
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(paraBody)) !== null) {
      runs.push(decodeXmlEntities(tm[1] ?? ""));
    }
    const text = runs.join("").replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
  }

  // Best-effort title from document properties.
  let title: string | null = null;
  const coreProps = zip.file("docProps/core.xml");
  if (coreProps) {
    const coreXml = await coreProps.async("string");
    const titleMatch = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
    if (titleMatch) title = decodeXmlEntities(titleMatch[1]).trim();
  }

  return { paragraphs, title };
}

/** Decode common XML entities. */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/"/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    );
}

import { sanitizeText, detectLanguage } from "./pdf-extractor.js";

/**
 * DOCX text extractor implementation.
 */
export class DocxTextExtractor implements TextExtractor {
  supports(mimeType: string): boolean {
    return mimeType === DOCX_MIME_TYPE;
  }

  async extract(input: DocumentInput): Promise<ExtractionResult> {
    const { paragraphs, title } = await extractDocxText(input.data);
    const rawText = sanitizeText(paragraphs.join("\n"));
    const pages: ExtractedPage[] = [
      {
        pageNumber: 1,
        rawText,
        characterCount: rawText.length,
        metadata: { paragraph_count: paragraphs.length },
      },
    ];
    return {
      pages,
      metadata: {
        title: title ? sanitizeText(title) : undefined,
        language: detectLanguage(rawText),
      },
    };
  }
}
