/**
 * Enhanced PPTX text, structure, notes, table, and media extractor.
 *
 * A PPTX file is an OpenXML ZIP package. Slides live at `ppt/slides/slideN.xml`.
 * This extractor extracts:
 * 1. Slide counts and canonical slide ordering (from `ppt/presentation.xml`)
 * 2. Slide titles, text boxes, paragraphs, and bullet lists
 * 3. Tables with row and column preservation
 * 4. Speaker notes from `ppt/notesSlides/notesSlideN.xml`
 * 5. Embedded media and images from `ppt/media/` linked per slide
 * 6. Protection against Zip Slip, Zip Bomb, and active macros (.pptm / vbaProject.bin)
 *
 * Preserves 100% backward compatibility with existing callers of `extractPptxText`
 * and `PptxTextExtractor.extract()`.
 */

import JSZip from "jszip";
import {
  type TextExtractor,
  type ExtractionResult,
  type ExtractedPage,
  type DocumentInput,
  ExtractionError,
} from "./types.js";
import { sanitizeText, detectLanguage } from "./pdf-extractor.js";
import type {
  ExtractedPresentation,
  ExtractedSlide,
  ExtractedTextBlock,
  ExtractedTable,
  ExtractedVisual,
} from "@avana/domain";

/** PPTX MIME type. */
export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** PPT legacy MIME type. */
export const PPT_MIME_TYPE = "application/vnd.ms-powerpoint";

/** Prefix for slide parts inside the PPTX package. */
const SLIDES_PREFIX = "ppt/slides/slide";

// ---------------------------------------------------------------------------
// Safety Limits
// ---------------------------------------------------------------------------

export const MAX_PPTX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_UNCOMPRESSED_TOTAL_SIZE = 150 * 1024 * 1024; // 150 MB
export const MAX_ZIP_ENTRIES = 3000;
export const MAX_SLIDES_COUNT = 150;
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15 MB
export const MAX_IMAGES_COUNT = 100;
export const MAX_XML_ENTRY_SIZE = 20 * 1024 * 1024; // 20 MB max uncompressed for single XML part

// ---------------------------------------------------------------------------
// XML and Encoding Utilities
// ---------------------------------------------------------------------------

/** Decode common XML entities including hex and decimal numbers. */
export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

/**
 * Validates XML text against DOCTYPE / ENTITY declarations (XXE / Billion Laughs).
 * OpenXML standard packages prohibit DOCTYPE and ENTITY declarations.
 */
export function validateXmlSafety(xmlText: string): void {
  // Reject null bytes (which can result from binary injection or UTF-16 decoded as UTF-8)
  if (xmlText.includes("\0")) {
    throw new ExtractionError(
      "invalid_xml_encoding",
      "Prohibited null byte or unsupported character encoding in XML part",
    );
  }

  // Check for non-UTF-8 declared encoding in XML header
  const declMatch = xmlText.match(/<\?xml\b[^>]*\bencoding\s*=\s*["']([^"']+)["']/i);
  if (declMatch && declMatch[1].trim().toLowerCase() !== "utf-8") {
    throw new ExtractionError(
      "unsupported_xml_encoding",
      `Unsupported XML encoding '${declMatch[1]}'; only UTF-8 is supported`,
    );
  }

  // Prohibit DOCTYPE and ENTITY declarations (XXE / Billion Laughs)
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xmlText)) {
    throw new ExtractionError(
      "xml_entity_expansion_detected",
      "Prohibited DOCTYPE or ENTITY declaration detected in OpenXML part",
    );
  }
}

/**
 * Safely resolves and canonicalizes a relative or target path within a ZIP package,
 * guaranteeing it stays strictly contained inside the allowed directory.
 *
 * @param baseDir Directory of the referencing file (e.g., 'ppt/slides' or 'ppt')
 * @param target Raw Target attribute from the relationship (e.g., '../media/image1.png')
 * @param allowedDirectory Allowed target directory prefix (e.g., 'ppt/media' or 'ppt/notesSlides')
 * @returns Canonicalized ZIP path strictly inside allowedDirectory, or null if invalid/unsafe
 */
export function resolveSafeZipPath(
  baseDir: string,
  target: string,
  allowedDirectory: string,
): string | null {
  if (!target || typeof target !== "string") {
    return null;
  }

  const trimmed = target.trim();
  if (!trimmed) {
    return null;
  }

  // Reject paths containing null bytes
  if (trimmed.includes("\0")) {
    return null;
  }

  // Handle URL-encoded characters (e.g. %2e%2e, %2f, %5c, %00)
  let decoded = trimmed;
  if (trimmed.includes("%")) {
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      // Malformed percent-encoding
      return null;
    }
    // Reject if decoded string has null bytes or still contains encoded percent (double-encoding attack)
    if (decoded.includes("\0") || /%2e|%2f|%5c/i.test(decoded)) {
      return null;
    }
  }

  // Reject paths containing colons (protocol or Windows drive specifiers e.g. C:, file:)
  if (decoded.includes(":")) {
    return null;
  }

  // Normalize backslashes to forward slashes
  const normalizedTarget = decoded.replace(/\\/g, "/");

  // Reject absolute paths starting with /
  if (normalizedTarget.startsWith("/")) {
    return null;
  }

  // Determine starting path segments based on whether target is relative or root-in-archive
  let segments: string[];
  if (normalizedTarget.startsWith("ppt/")) {
    // Already archive-rooted under ppt/
    segments = normalizedTarget.split("/");
  } else {
    // Relative to baseDir (e.g. ppt/slides + ../media/image1.png)
    const baseSegments = baseDir.replace(/\\/g, "/").split("/").filter(Boolean);
    const targetSegments = normalizedTarget.split("/");
    segments = [...baseSegments, ...targetSegments];
  }

  // Canonicalize path by resolving '.' and '..'
  const canonicalSegments: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") {
      continue;
    }
    if (seg === "..") {
      if (canonicalSegments.length === 0) {
        // Traversal above package root!
        return null;
      }
      canonicalSegments.pop();
    } else {
      canonicalSegments.push(seg);
    }
  }

  const canonicalPath = canonicalSegments.join("/");

  // Normalize allowedDirectory (ensure clean prefix with trailing slash)
  const cleanAllowed = allowedDirectory.replace(/\\/g, "/").replace(/\/+$/, "");
  const allowedPrefix = cleanAllowed + "/";

  // Strict containment check: Must be inside allowed directory
  if (!canonicalPath.startsWith(allowedPrefix)) {
    return null;
  }

  // Ensure filename part is not empty
  const filePart = canonicalPath.slice(allowedPrefix.length);
  if (!filePart || filePart.trim() === "") {
    return null;
  }

  return canonicalPath;
}

/** Detect image MIME type from filename and magic bytes. */
export function detectImageMimeType(filename: string, buffer?: Buffer): string {
  // 1. Inspect magic bytes first when buffer is present
  if (buffer && buffer.length >= 4) {
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return "image/gif";
    }
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return "image/webp";
    }
  }

  // 2. Fallback to extension
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";

  return "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Extractor Options & Types
// ---------------------------------------------------------------------------

/** Internal visual representation including the raw buffer for storage persisting. */
export interface ExtractedVisualWithBuffer extends ExtractedVisual {
  buffer?: Buffer;
}

export interface ExtractPresentationOptions {
  /** Optional callback to persist extracted visuals to StorageProvider. */
  saveMedia?: (
    slideIndex: number,
    visual: ExtractedVisualWithBuffer,
  ) => Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Full Presentation Extractor
// ---------------------------------------------------------------------------

/**
 * Extracts comprehensive presentation structure from a PPTX file.
 */
export async function extractPresentationFromPptx(
  data: Buffer,
  options?: ExtractPresentationOptions,
): Promise<ExtractedPresentation> {
  if (data.length > MAX_PPTX_FILE_SIZE) {
    throw new ExtractionError(
      "file_too_large",
      `PPTX file size (${(data.length / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 50MB`,
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (err) {
    throw new ExtractionError(
      "invalid_pptx",
      `Not a valid PPTX file: ${(err as Error)?.message ?? "unreadable"}`,
    );
  }

  // 1. Security Checks: Zip Slip, Zip Bomb, and Macro Protection
  const fileNames = Object.keys(zip.files);

  if (fileNames.length > MAX_ZIP_ENTRIES) {
    throw new ExtractionError(
      "zip_bomb_detected",
      `Archive contains too many entries (${fileNames.length} > ${MAX_ZIP_ENTRIES})`,
    );
  }

  let totalDecompressedSize = 0;
  for (const name of fileNames) {
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      name.startsWith("\\") ||
      name.includes(":")
    ) {
      throw new ExtractionError(
        "zip_slip_detected",
        `Unsafe file path in archive: ${name}`,
      );
    }

    // Macro detection (.pptm / vbaProject.bin)
    if (
      name.toLowerCase() === "ppt/vbaproject.bin" ||
      name.toLowerCase().endsWith(".bin")
    ) {
      throw new ExtractionError(
        "macro_detected",
        "Presentations containing active macros or VBA code are not supported",
      );
    }

    const zipObj = zip.files[name];
    if (zipObj && (zipObj as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize) {
      totalDecompressedSize += (zipObj as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize;
      if (totalDecompressedSize > MAX_UNCOMPRESSED_TOTAL_SIZE) {
        throw new ExtractionError(
          "zip_bomb_detected",
          "Archive uncompressed size exceeds maximum safety limit",
        );
      }
    }
  }

  // 2. Canonical Slide Ordering (from ppt/presentation.xml and its rels)
  const orderedSlideFiles: string[] = [];
  const presFile = zip.file("ppt/presentation.xml");
  const presRelsFile = zip.file("ppt/_rels/presentation.xml.rels");

  if (presFile && presRelsFile) {
    try {
      const presXml = await presFile.async("string");
      validateXmlSafety(presXml);
      const presRelsXml = await presRelsFile.async("string");
      validateXmlSafety(presRelsXml);

      const relMap = new Map<string, string>();
      const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = relRe.exec(presRelsXml)) !== null) {
        const target = rMatch[2];
        const safeSlidePath = resolveSafeZipPath(
          "ppt",
          target,
          "ppt/slides",
        );
        if (safeSlidePath) {
          relMap.set(rMatch[1], safeSlidePath);
        }
      }

      const sldIdRe = /<p:sldId\b[^>]*r:id="([^"]+)"/g;
      let sMatch: RegExpExecArray | null;
      while ((sMatch = sldIdRe.exec(presXml)) !== null) {
        const targetPath = relMap.get(sMatch[1]);
        if (targetPath && zip.file(targetPath)) {
          orderedSlideFiles.push(targetPath);
        }
      }
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      // Fallback to numeric sorting below
    }
  }

  // Fallback if presentation.xml parsing produced no slides
  if (orderedSlideFiles.length === 0) {
    const rawSlideFiles = fileNames
      .filter((name) => name.startsWith(SLIDES_PREFIX) && name.endsWith(".xml"))
      .sort((a, b) => {
        const na = Number.parseInt(a.slice(SLIDES_PREFIX.length), 10);
        const nb = Number.parseInt(b.slice(SLIDES_PREFIX.length), 10);
        return na - nb;
      });
    orderedSlideFiles.push(...rawSlideFiles);
  }

  if (orderedSlideFiles.length === 0) {
    throw new ExtractionError(
      "invalid_pptx",
      "PPTX package contains no slides",
    );
  }

  if (orderedSlideFiles.length > MAX_SLIDES_COUNT) {
    throw new ExtractionError(
      "max_slides_exceeded",
      `Presentation exceeds maximum allowed slide count (${orderedSlideFiles.length} > ${MAX_SLIDES_COUNT})`,
    );
  }

  // 3. Document-level metadata (Title from docProps/core.xml)
  let presentationTitle: string | null = null;
  let presentationAuthor: string | null = null;
  let createdAtStr: string | null = null;
  let modifiedAtStr: string | null = null;
  const coreProps = zip.file("docProps/core.xml");
  if (coreProps) {
    try {
      const coreXml = await coreProps.async("string");
      validateXmlSafety(coreXml);
      const titleMatch = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
      if (titleMatch) presentationTitle = decodeXmlEntities(titleMatch[1]).trim();

      const creatorMatch = coreXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/);
      if (creatorMatch) presentationAuthor = decodeXmlEntities(creatorMatch[1]).trim();

      const createdMatch = coreXml.match(/<dcterms:created[^>]*>([\s\S]*?)<\/dcterms:created>/);
      if (createdMatch) createdAtStr = createdMatch[1].trim();

      const modifiedMatch = coreXml.match(/<dcterms:modified[^>]*>([\s\S]*?)<\/dcterms:modified>/);
      if (modifiedMatch) modifiedAtStr = modifiedMatch[1].trim();
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      // Non-blocking
    }
  }

  // 4. Per-Slide Processing
  const slides: ExtractedSlide[] = [];
  let totalVisualsCount = 0;

  for (let i = 0; i < orderedSlideFiles.length; i++) {
    const slidePath = orderedSlideFiles[i];
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;

    const slideZipObj = zip.files[slidePath];
    if (
      slideZipObj &&
      (slideZipObj as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize &&
      (slideZipObj as unknown as { _data: { uncompressedSize: number } })._data.uncompressedSize > MAX_XML_ENTRY_SIZE
    ) {
      throw new ExtractionError(
        "xml_entry_too_large",
        `Slide XML exceeds maximum allowed size (${slidePath})`,
      );
    }

    const slideIndex = i + 1;
    const xml = await slideFile.async("string");
    if (xml.length > MAX_XML_ENTRY_SIZE) {
      throw new ExtractionError(
        "xml_entry_too_large",
        `Slide XML exceeds maximum allowed size (${slidePath})`,
      );
    }
    validateXmlSafety(xml);

    // Relationships for this slide: ppt/slides/_rels/slideN.xml.rels
    const slideFileName = slidePath.split("/").pop() ?? `slide${slideIndex}.xml`;
    const relsPath = `ppt/slides/_rels/${slideFileName}.rels`;
    const relsFile = zip.file(relsPath);

    let notesSlideZipPath: string | null = null;
    const imageMap = new Map<string, string>(); // rId -> ppt/media/xxx.png

    if (relsFile) {
      try {
        const relsXml = await relsFile.async("string");
        validateXmlSafety(relsXml);
        const relRe =
          /<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"/g;
        let m: RegExpExecArray | null;
        while ((m = relRe.exec(relsXml)) !== null) {
          const rId = m[1];
          const type = m[2];
          const target = m[3];

          if (type.endsWith("/notesSlide")) {
            // Target is typically ../notesSlides/notesSlide1.xml
            const safeNotesPath = resolveSafeZipPath(
              "ppt/slides",
              target,
              "ppt/notesSlides",
            );
            if (safeNotesPath) {
              notesSlideZipPath = safeNotesPath;
            }
          } else if (type.endsWith("/image")) {
            // Target is typically ../media/image1.png
            const safeMediaPath = resolveSafeZipPath(
              "ppt/slides",
              target,
              "ppt/media",
            );
            if (safeMediaPath) {
              imageMap.set(rId, safeMediaPath);
            }
          }
        }
      } catch (err) {
        if (err instanceof ExtractionError) throw err;
        // Non-blocking
      }
    }

    // A. Parse Shapes and Text Blocks
    const textBlocks: ExtractedTextBlock[] = [];
    let slideTitle: string | null = null;
    let orderCounter = 0;

    const spRe = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
    let spMatch: RegExpExecArray | null;
    while ((spMatch = spRe.exec(xml)) !== null) {
      const spBody = spMatch[1] ?? "";
      const isTitleShape =
        /<p:ph\b[^>]*type="(?:title|ctrTitle)"/i.test(spBody) ||
        /<p:cNvPr\b[^>]*name="Title[^"]*"/i.test(spBody);

      const pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
      let pMatch: RegExpExecArray | null;
      while ((pMatch = pRe.exec(spBody)) !== null) {
        const pBody = pMatch[1] ?? "";

        // Check for bullet tags or indent levels in <a:pPr>
        const pPrMatch = pBody.match(/<a:pPr\b([^>]*)>([\s\S]*?)<\/a:pPr>/);
        const pPrAttrs = pPrMatch ? pPrMatch[1] : "";
        const pPrChildren = pPrMatch ? pPrMatch[2] : "";

        const isBullet =
          /<a:bu(?:Char|AutoNum|Font|SzPct|Blip)\b/i.test(pPrChildren) ||
          /\blvl="[1-9]"/i.test(pPrAttrs);

        const textRuns: string[] = [];
        const tRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = tRe.exec(pBody)) !== null) {
          const decoded = decodeXmlEntities(tMatch[1] ?? "").trim();
          if (decoded) textRuns.push(decoded);
        }

        const paragraphText = textRuns.join(" ").replace(/\s+/g, " ").trim();
        if (!paragraphText) continue;

        const blockType: "title" | "paragraph" | "bullet" = isTitleShape
          ? "title"
          : isBullet
            ? "bullet"
            : "paragraph";

        if (blockType === "title" && !slideTitle) {
          slideTitle = paragraphText;
        }

        textBlocks.push({
          text: paragraphText,
          type: blockType,
          order: ++orderCounter,
        });
      }
    }

    // Fallback: If no explicit title shape was flagged, treat first short block as title
    if (!slideTitle && textBlocks.length > 0 && textBlocks[0].type !== "bullet") {
      if (textBlocks[0].text.length <= 150) {
        slideTitle = textBlocks[0].text;
      }
    }

    // Fallback: If no text blocks were extracted via <p:sp>, scan for any <a:t> in the slide XML
    if (textBlocks.length === 0) {
      const fallbackRuns: string[] = [];
      const tRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;
      while ((tMatch = tRe.exec(xml)) !== null) {
        const decoded = decodeXmlEntities(tMatch[1] ?? "").trim();
        if (decoded) fallbackRuns.push(decoded);
      }
      if (fallbackRuns.length > 0) {
        const text = fallbackRuns.join(" ");
        if (!slideTitle && text.length <= 150) {
          slideTitle = text;
        }
        textBlocks.push({
          text,
          type: "paragraph",
          order: 1,
        });
      }
    }

    // Set first slide title as presentation title if core title was empty
    if (!presentationTitle && slideTitle) {
      presentationTitle = slideTitle;
    }

    // B. Parse Tables
    const tables: ExtractedTable[] = [];
    const tblRe = /<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/g;
    let tblMatch: RegExpExecArray | null;
    while ((tblMatch = tblRe.exec(xml)) !== null) {
      const tblBody = tblMatch[1] ?? "";
      const rows: string[][] = [];
      const trRe = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g;
      let trMatch: RegExpExecArray | null;
      while ((trMatch = trRe.exec(tblBody)) !== null) {
        const trBody = trMatch[1] ?? "";
        const cells: string[] = [];
        const tcRe = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g;
        let tcMatch: RegExpExecArray | null;
        while ((tcMatch = tcRe.exec(trBody)) !== null) {
          const tcBody = tcMatch[1] ?? "";
          const textRuns: string[] = [];
          const tRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
          let tMatch: RegExpExecArray | null;
          while ((tMatch = tRe.exec(tcBody)) !== null) {
            const decoded = decodeXmlEntities(tMatch[1] ?? "").trim();
            if (decoded) textRuns.push(decoded);
          }
          cells.push(textRuns.join(" "));
        }
        if (cells.length > 0) {
          rows.push(cells);
        }
      }
      if (rows.length > 0) {
        tables.push({ rows });
      }
    }

    // C. Parse Speaker Notes
    let speakerNotes: string | null = null;
    if (notesSlideZipPath && zip.file(notesSlideZipPath)) {
      try {
        const notesXml = await zip.file(notesSlideZipPath)!.async("string");
        validateXmlSafety(notesXml);
        const notesParagraphs: string[] = [];
        const nSpRe = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
        let nSpMatch: RegExpExecArray | null;
        while ((nSpMatch = nSpRe.exec(notesXml)) !== null) {
          const nSpBody = nSpMatch[1] ?? "";
          // Skip standard PowerPoint system placeholders: sldNum, dt, hdr, ftr, sldImg
          if (
            /<p:ph\b[^>]*type="(?:sldNum|dt|hdr|ftr|sldImg)"/i.test(nSpBody)
          ) {
            continue;
          }

          const ntRe = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
          let ntMatch: RegExpExecArray | null;
          const runs: string[] = [];
          while ((ntMatch = ntRe.exec(nSpBody)) !== null) {
            const decoded = decodeXmlEntities(ntMatch[1] ?? "").trim();
            if (decoded) runs.push(decoded);
          }
          const pText = runs.join(" ").replace(/\s+/g, " ").trim();
          if (pText) notesParagraphs.push(pText);
        }
        if (notesParagraphs.length > 0) {
          speakerNotes = notesParagraphs.join("\n");
        }
      } catch (err) {
        if (err instanceof ExtractionError) throw err;
        // Non-blocking
      }
    }

    // D. Parse Embedded Visuals (Images referenced in slide)
    const visuals: ExtractedVisual[] = [];
    const blipRe = /<a:blip\b[^>]*r:embed="([^"]+)"/g;
    let bMatch: RegExpExecArray | null;
    const embeddedRIds = new Set<string>();
    while ((bMatch = blipRe.exec(xml)) !== null) {
      embeddedRIds.add(bMatch[1]);
    }

    for (const rId of embeddedRIds) {
      const mediaZipPath = imageMap.get(rId);
      if (!mediaZipPath) continue;

      const mediaFile = zip.file(mediaZipPath);
      if (!mediaFile) continue;

      if (totalVisualsCount >= MAX_IMAGES_COUNT) {
        break;
      }

      // Pre-check declared uncompressed size from ZIP header before allocating buffer
      const mediaZipObj = zip.files[mediaZipPath];
      const declaredSize = (
        mediaZipObj as unknown as { _data?: { uncompressedSize?: number } }
      )?._data?.uncompressedSize;
      if (typeof declaredSize === "number" && declaredSize > MAX_IMAGE_SIZE) {
        continue;
      }

      try {
        const imgBuffer = await mediaFile.async("nodebuffer");
        if (imgBuffer.length > MAX_IMAGE_SIZE) {
          continue;
        }

        const fileName = mediaZipPath.split("/").pop() ?? `image-${rId}`;
        const mimeType = detectImageMimeType(fileName, imgBuffer);

        const visual: ExtractedVisualWithBuffer = {
          id: rId,
          mediaFileName: fileName,
          mimeType,
          buffer: imgBuffer,
          sizeBytes: imgBuffer.length,
        };

        if (options?.saveMedia) {
          const storageKey = await options.saveMedia(slideIndex, visual);
          if (storageKey) {
            visual.storageKey = storageKey;
          }
        }

        // Always release buffer from returned object to prevent memory ballooning
        delete visual.buffer;

        visuals.push(visual);
        totalVisualsCount++;
      } catch {
        // Continue if single image fails
      }
    }

    // E. Synthesize Raw Text
    const rawTextParts: string[] = [];
    for (const block of textBlocks) {
      if (block.type === "bullet") {
        rawTextParts.push(`• ${block.text}`);
      } else {
        rawTextParts.push(block.text);
      }
    }
    for (const tbl of tables) {
      const tableStr = tbl.rows
        .map((row) => row.join(" | "))
        .join("\n");
      rawTextParts.push(`[جدول]\n${tableStr}`);
    }
    if (speakerNotes) {
      rawTextParts.push(`[یادداشت ارائه: ${speakerNotes}]`);
    }

    const cleanRawText = sanitizeText(rawTextParts.join("\n\n"));

    slides.push({
      slideIndex,
      title: slideTitle ? sanitizeText(slideTitle) : null,
      rawText: cleanRawText,
      textBlocks,
      tables,
      speakerNotes: speakerNotes ? sanitizeText(speakerNotes) : null,
      visuals,
      metadata: {
        textBlockCount: textBlocks.length,
        tableCount: tables.length,
        hasSpeakerNotes: Boolean(speakerNotes),
        visualCount: visuals.length,
      },
    });
  }

  return {
    totalSlides: slides.length,
    title: presentationTitle ? sanitizeText(presentationTitle) : null,
    slides,
    metadata: {
      author: presentationAuthor ?? undefined,
      slideCount: slides.length,
      hasSpeakerNotes: slides.some((s) => Boolean(s.speakerNotes)),
      hasTables: slides.some((s) => s.tables.length > 0),
      totalVisuals: totalVisualsCount,
      createdAt: createdAtStr ?? undefined,
      modifiedAt: modifiedAtStr ?? undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Backward Compatibility Functions
// ---------------------------------------------------------------------------

/**
 * Extract per-slide text from a PPTX buffer.
 * Preserves the exact signature expected by existing callers.
 */
export async function extractPptxText(
  data: Buffer,
): Promise<{
  slides: Array<{ slideNumber: number; text: string }>;
  title: string | null;
}> {
  const presentation = await extractPresentationFromPptx(data);
  return {
    slides: presentation.slides.map((s) => ({
      slideNumber: s.slideIndex,
      text: s.rawText,
    })),
    title: presentation.title,
  };
}

/**
 * Standard TextExtractor implementation for document processing pipeline.
 */
export class PptxTextExtractor implements TextExtractor {
  supports(mimeType: string): boolean {
    return mimeType === PPTX_MIME_TYPE;
  }

  async extract(input: DocumentInput): Promise<ExtractionResult> {
    const presentation = await extractPresentationFromPptx(input.data);

    const pages: ExtractedPage[] = presentation.slides.map((slide) => ({
      pageNumber: slide.slideIndex,
      rawText: slide.rawText,
      characterCount: slide.rawText.length,
      metadata: {
        title: slide.title,
        hasNotes: Boolean(slide.speakerNotes),
        tableCount: slide.tables.length,
        hasVisuals: slide.visuals.length > 0,
      },
    }));

    const combinedSample = pages.map((p) => p.rawText).join(" ");

    return {
      pages,
      metadata: {
        title: presentation.title ?? undefined,
        language: detectLanguage(combinedSample),
        slideCount: presentation.totalSlides,
      },
    };
  }
}
