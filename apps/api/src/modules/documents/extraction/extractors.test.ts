/**
 * PR6-3 extractor unit tests.
 *
 * Covers:
 * - PDF extractor (supports + text extraction + invalid PDF)
 * - DOCX extractor (supports + text extraction + invalid DOCX)
 * - PPTX extractor (supports + per-slide extraction + invalid PPTX)
 * - Registry selection (PDF/DOCX/PPTX + unsupported MIME)
 */

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import zlib from "node:zlib";
import { PdfTextExtractor, extractPdfText } from "./pdf-extractor.js";
import { DocxTextExtractor, extractDocxText } from "./docx-extractor.js";
import { PptxTextExtractor, extractPptxText } from "./pptx-extractor.js";
import { PlainTextExtractor } from "./plain-text-extractor.js";
import { selectExtractor, isSupportedMimeType } from "./extractor-registry.js";
import { ExtractionError } from "./types.js";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

describe("PDF extractor", () => {
  const extractor = new PdfTextExtractor();

  it("supports only application/pdf", () => {
    expect(extractor.supports(PDF_MIME)).toBe(true);
    expect(extractor.supports(DOCX_MIME)).toBe(false);
    expect(extractor.supports("text/plain")).toBe(false);
  });

  it("extracts text from a simple PDF content stream", async () => {
    const pdf = Buffer.from(
      `%PDF-1.4
1 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [1 0 R] /Count 1 >>
endobj
3 0 obj
<< >>
stream
BT /F1 12 Tf
72 720 Td
(Hello AVANA) Tj
ET
endstream
endobj
%%EOF`,
      "latin1",
    );

    const result = await extractor.extract({
      data: pdf,
      mimeType: PDF_MIME,
      originalName: "notes.pdf",
    });

    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages[0].rawText).toContain("Hello AVANA");
    expect(result.pages[0].characterCount).toBeGreaterThan(0);
    expect(result.pages[0].pageNumber).toBe(1);
  });

  it("extracts text from a compressed (FlateDecode) PDF content stream", async () => {
    const rawStream = "BT /F1 12 Tf (فشار خون بالا و درمان) Tj T* (داروهای خط اول) Tj ET";
    const compressed = zlib.deflateSync(Buffer.from(rawStream, "utf-8"));

    const header = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${compressed.length} /Filter /FlateDecode >>
stream\r\n`;

    const footer = `\r\nendstream
endobj
%%EOF`;

    const pdfBuffer = Buffer.concat([
      Buffer.from(header, "latin1"),
      compressed,
      Buffer.from(footer, "latin1"),
    ]);

    const result = await extractor.extract({
      data: pdfBuffer,
      mimeType: PDF_MIME,
      originalName: "hypertension.pdf",
    });

    expect(result.pages.length).toBe(1);
    expect(result.pages[0].rawText).toContain("فشار خون بالا و درمان");
    expect(result.pages[0].rawText).toContain("داروهای خط اول");
  });

  it("extracts and normalizes Persian UTF-16BE hex strings from PDF", async () => {
    // Hex string for: دارو و درمان
    // د(062F) ا(0627) ر(0631) و(0648)  (0020) و(0648)  (0020) د(062F) ر(0631) م(0645) ا(0627) ن(0646)
    const rawStream = "BT /F1 12 Tf <062F062706310648002006480020062F0631064506270646> Tj ET";
    const pdf = Buffer.from(
      `%PDF-1.4
1 0 obj
<< /Type /Page /Contents 2 0 R >>
endobj
2 0 obj
<< >>
stream
${rawStream}
endstream
endobj
%%EOF`,
      "latin1",
    );

    const result = await extractor.extract({
      data: pdf,
      mimeType: PDF_MIME,
      originalName: "persian.pdf",
    });

    expect(result.pages.length).toBe(1);
    expect(result.pages[0].rawText).toContain("دارو و درمان");
  });

  it("throws invalid_pdf for non-PDF bytes", async () => {
    await expect(
      extractor.extract({
        data: Buffer.from("not a pdf"),
        mimeType: PDF_MIME,
        originalName: "bad.pdf",
      }),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it("extractPdfText throws for invalid header", () => {
    expect(() => extractPdfText(Buffer.from("plain text"))).toThrow(
      ExtractionError,
    );
  });
});

describe("DOCX extractor", () => {
  const extractor = new DocxTextExtractor();

  it("supports only docx mime", () => {
    expect(extractor.supports(DOCX_MIME)).toBe(true);
    expect(extractor.supports(PDF_MIME)).toBe(false);
  });

  it("extracts paragraph text from a DOCX package", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>First paragraph</w:t></w:r></w:p>
          <w:p><w:r><w:t>Second</w:t><w:t xml:space="preserve"> paragraph</w:t></w:r></w:p>
        </w:body>
      </w:document>`,
    );
    zip.file(
      "docProps/core.xml",
      `<cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>My Doc</dc:title></cp:coreProperties>`,
    );
    const data = await zip.generateAsync({ type: "nodebuffer" });

    const result = await extractor.extract({
      data: Buffer.from(data),
      mimeType: DOCX_MIME,
      originalName: "notes.docx",
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].rawText).toContain("First paragraph");
    expect(result.pages[0].rawText).toContain("Second paragraph");
    expect(result.metadata?.title).toBe("My Doc");
  });

  it("throws invalid_docx for corrupt data", async () => {
    await expect(
      extractor.extract({
        data: Buffer.from("not a zip"),
        mimeType: DOCX_MIME,
        originalName: "bad.docx",
      }),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it("throws invalid_docx when document.xml is missing", async () => {
    const zip = new JSZip();
    zip.file("other.xml", "<x/>");
    const data = await zip.generateAsync({ type: "nodebuffer" });
    await expect(extractDocxText(Buffer.from(data))).rejects.toBeInstanceOf(
      ExtractionError,
    );
  });
});

describe("PPTX extractor", () => {
  const extractor = new PptxTextExtractor();

  it("supports only pptx mime", () => {
    expect(extractor.supports(PPTX_MIME)).toBe(true);
    expect(extractor.supports(PDF_MIME)).toBe(false);
    expect(extractor.supports("application/vnd.ms-powerpoint")).toBe(false);
  });

  it("extracts per-slide text from a PPTX package", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:t>Slide one title</a:t><a:t>Slide one body</a:t>
      </p:sld>`,
    );
    zip.file(
      "ppt/slides/slide2.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:t>Slide two content</a:t>
      </p:sld>`,
    );
    zip.file(
      "docProps/core.xml",
      `<cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Slides</dc:title></cp:coreProperties>`,
    );
    const data = await zip.generateAsync({ type: "nodebuffer" });

    const result = await extractor.extract({
      data: Buffer.from(data),
      mimeType: PPTX_MIME,
      originalName: "deck.pptx",
    });

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].rawText).toContain("Slide one title");
    expect(result.pages[1].pageNumber).toBe(2);
    expect(result.pages[1].rawText).toContain("Slide two content");
    expect(result.metadata?.title).toBe("Slides");
  });

  it("throws invalid_pptx for corrupt data", async () => {
    await expect(
      extractor.extract({
        data: Buffer.from("not a zip"),
        mimeType: PPTX_MIME,
        originalName: "bad.pptx",
      }),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it("throws invalid_pptx when no slides exist", async () => {
    const zip = new JSZip();
    zip.file("other.xml", "<x/>");
    const data = await zip.generateAsync({ type: "nodebuffer" });
    await expect(extractPptxText(Buffer.from(data))).rejects.toBeInstanceOf(
      ExtractionError,
    );
  });
});

describe("extractor registry", () => {
  it("selects the correct extractor per mime type", () => {
    expect(selectExtractor(PDF_MIME)).toBeInstanceOf(PdfTextExtractor);
    expect(selectExtractor(DOCX_MIME)).toBeInstanceOf(DocxTextExtractor);
    expect(selectExtractor(PPTX_MIME)).toBeInstanceOf(PptxTextExtractor);
    expect(selectExtractor("text/plain")).toBeInstanceOf(PlainTextExtractor);
    expect(selectExtractor("text/markdown")).toBeInstanceOf(PlainTextExtractor);
  });

  it("is case-insensitive", () => {
    expect(selectExtractor("APPLICATION/PDF")).toBeInstanceOf(PdfTextExtractor);
  });

  it("throws for unsupported mime types", () => {
    expect(() => selectExtractor("audio/mp3")).toThrow(ExtractionError);
    expect(() => selectExtractor("application/octet-stream")).toThrow(
      ExtractionError,
    );
  });

  it("isSupportedMimeType reflects supported formats", () => {
    expect(isSupportedMimeType(PDF_MIME)).toBe(true);
    expect(isSupportedMimeType(DOCX_MIME)).toBe(true);
    expect(isSupportedMimeType(PPTX_MIME)).toBe(true);
    expect(isSupportedMimeType("text/plain")).toBe(true);
    expect(isSupportedMimeType("audio/mp3")).toBe(false);
  });
});
