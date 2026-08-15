/**
 * PPTX text extractor.
 *
 * A PPTX file is a ZIP container. Slides live at `ppt/slides/slideN.xml`,
 * where text runs are `<a:t>` elements. We extract text per slide and emit
 * one `ExtractedPage` per slide (page_number = slide index).
 */

import JSZip from "jszip";
import {
  type TextExtractor,
  type ExtractionResult,
  type ExtractedPage,
  type DocumentInput,
  ExtractionError,
} from "./types.js";

/** PPTX MIME type. */
export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** PPT legacy MIME type (not supported by this extractor, but declared). */
export const PPT_MIME_TYPE = "application/vnd.ms-powerpoint";

/** Prefix for slide parts inside the PPTX package. */
const SLIDES_PREFIX = "ppt/slides/slide";

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

/** Extract text from a single slide XML. */
function extractSlideText(xml: string): string {
  const fragments: string[] = [];
  const textRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  while ((m = textRe.exec(xml)) !== null) {
    const decoded = decodeXmlEntities(m[1] ?? "");
    if (decoded) fragments.push(decoded);
  }
  return fragments.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Extract per-slide text from a PPTX buffer.
 *
 * @returns array of slides, each with its 1-based slide number and text.
 */
export async function extractPptxText(
  data: Buffer,
): Promise<{
  slides: Array<{ slideNumber: number; text: string }>;
  title: string | null;
}> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (err) {
    throw new ExtractionError(
      "invalid_pptx",
      `Not a valid PPTX file: ${(err as Error)?.message ?? "unreadable"}`,
    );
  }

  // Collect slide files and sort by their numeric suffix.
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith(SLIDES_PREFIX) && name.endsWith(".xml"))
    .sort((a, b) => {
      const na = Number.parseInt(a.slice(SLIDES_PREFIX.length), 10);
      const nb = Number.parseInt(b.slice(SLIDES_PREFIX.length), 10);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new ExtractionError(
      "invalid_pptx",
      "PPTX package contains no slides",
    );
  }

  const slides: Array<{ slideNumber: number; text: string }> = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const file = zip.file(slideFiles[i]);
    if (!file) continue;
    const xml = await file.async("string");
    slides.push({
      slideNumber: i + 1,
      text: extractSlideText(xml),
    });
  }

  // Best-effort title from presentation properties.
  let title: string | null = null;
  const coreProps = zip.file("docProps/core.xml");
  if (coreProps) {
    const coreXml = await coreProps.async("string");
    const titleMatch = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
    if (titleMatch) title = decodeXmlEntities(titleMatch[1]).trim();
  }

  return { slides, title };
}

import { sanitizeText, detectLanguage } from "./pdf-extractor.js";

/**
 * PPTX text extractor implementation.
 */
export class PptxTextExtractor implements TextExtractor {
  supports(mimeType: string): boolean {
    return mimeType === PPTX_MIME_TYPE;
  }

  async extract(input: DocumentInput): Promise<ExtractionResult> {
    const { slides, title } = await extractPptxText(input.data);

    const pages: ExtractedPage[] = slides.map((slide) => {
      const cleanText = sanitizeText(slide.text);
      return {
        pageNumber: slide.slideNumber,
        rawText: cleanText,
        characterCount: cleanText.length,
      };
    });

    const combinedSample = pages.map((p) => p.rawText).join(" ");

    return {
      pages,
      metadata: {
        title: title ? sanitizeText(title) : undefined,
        language: detectLanguage(combinedSample),
      },
    };
  }
}
