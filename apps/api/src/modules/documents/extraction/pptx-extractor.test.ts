/* eslint-disable no-secrets/no-secrets */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  extractPresentationFromPptx,
  extractPptxText,
  PptxTextExtractor,
  PPTX_MIME_TYPE,
} from "./pptx-extractor.js";
import { ExtractionError } from "./types.js";

describe("Enhanced PPTX Extractor", () => {
  const extractor = new PptxTextExtractor();

  it("extracts simple PPTX with title, text boxes, and English text", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="2" name="Title 1"/>
              <p:nvPr><p:ph type="title"/></p:nvPr>
            </p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>Introduction to Cardiology</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="3" name="Content 1"/></p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>Cardiology is the study of the human heart.</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:sld>`,
    );
    zip.file(
      "docProps/core.xml",
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Cardiology 101</dc:title>
        <dc:creator>Dr. Smith</dc:creator>
      </cp:coreProperties>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.totalSlides).toBe(1);
    expect(result.title).toBe("Cardiology 101");
    expect(result.metadata?.author).toBe("Dr. Smith");
    expect(result.slides[0].title).toBe("Introduction to Cardiology");
    expect(result.slides[0].textBlocks).toHaveLength(2);
    expect(result.slides[0].textBlocks[0].type).toBe("title");
    expect(result.slides[0].textBlocks[1].type).toBe("paragraph");
    expect(result.slides[0].rawText).toContain("Introduction to Cardiology");
    expect(result.slides[0].rawText).toContain("study of the human heart");
  });

  it("extracts Persian text with correct encoding and no character corruption", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="2" name="Title 1"/>
              <p:nvPr><p:ph type="title"/></p:nvPr>
            </p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>فیزیولوژی دستگاه گردش خون</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="3" name="Content 1"/></p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>قلب انسان دارای چهار حفره اصلی شامل دو دهلیز و دو بطن است.</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:sld>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.slides[0].title).toBe("فیزیولوژی دستگاه گردش خون");
    expect(result.slides[0].rawText).toContain("قلب انسان دارای چهار حفره اصلی");
  });

  it("distinguishes title and bullet lists correctly", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree>
          <p:sp>
            <p:nvSpPr>
              <p:cNvPr id="2" name="Title 1"/>
              <p:nvPr><p:ph type="title"/></p:nvPr>
            </p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>داروهای خط اول</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="3" name="Content"/></p:nvSpPr>
            <p:txBody>
              <a:p>
                <a:pPr lvl="1"><a:buChar char="•"/></a:pPr>
                <a:r><a:t>مهارکننده‌های ACE (کاپتوپریل)</a:t></a:r>
              </a:p>
              <a:p>
                <a:pPr lvl="1"><a:buChar char="•"/></a:pPr>
                <a:r><a:t>مسدودکننده‌های گیرنده آنژیوتانسین (لوزارتان)</a:t></a:r>
              </a:p>
              <a:p>
                <a:pPr/>
                <a:r><a:t>پاراگراف توضیحی معمولی بدون بالت</a:t></a:r>
              </a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:sld>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    const blocks = result.slides[0].textBlocks;
    expect(blocks[0].type).toBe("title");
    expect(blocks[1].type).toBe("bullet");
    expect(blocks[2].type).toBe("bullet");
    expect(blocks[3].type).toBe("paragraph");
    expect(result.slides[0].rawText).toContain("• مهارکننده‌های ACE");
  });

  it("extracts tables with row and column structure and handles empty cells", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree>
          <p:graphicFrame>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
                <a:tbl>
                  <a:tr>
                    <a:tc><a:txBody><a:p><a:r><a:t>دارو</a:t></a:r></a:p></a:txBody></a:tc>
                    <a:tc><a:txBody><a:p><a:r><a:t>دوز</a:t></a:r></a:p></a:txBody></a:tc>
                    <a:tc><a:txBody><a:p><a:r><a:t>عوارض</a:t></a:r></a:p></a:txBody></a:tc>
                  </a:tr>
                  <a:tr>
                    <a:tc><a:txBody><a:p><a:r><a:t>کاپتوپریل</a:t></a:r></a:p></a:txBody></a:tc>
                    <a:tc><a:txBody><a:p><a:r><a:t>25mg</a:t></a:r></a:p></a:txBody></a:tc>
                    <a:tc><a:txBody><a:p><a:r><a:t>سرفه خشک</a:t></a:r></a:p></a:txBody></a:tc>
                  </a:tr>
                  <a:tr>
                    <a:tc><a:txBody><a:p><a:r><a:t>لوزارتان</a:t></a:r></a:p></a:txBody></a:tc>
                    <a:tc><a:txBody><a:p><a:r><a:t>50mg</a:t></a:r></a:p></a:txBody></a:tc>
                    <a:tc><a:txBody><a:p/></a:txBody></a:tc>
                  </a:tr>
                </a:tbl>
              </a:graphicData>
            </a:graphic>
          </p:graphicFrame>
        </p:spTree>
      </p:sld>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.slides[0].tables).toHaveLength(1);
    const table = result.slides[0].tables[0];
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]).toEqual(["دارو", "دوز", "عوارض"]);
    expect(table.rows[1]).toEqual(["کاپتوپریل", "25mg", "سرفه خشک"]);
    expect(table.rows[2]).toEqual(["لوزارتان", "50mg", ""]);
    expect(result.slides[0].rawText).toContain("[جدول]");
    expect(result.slides[0].rawText).toContain("کاپتوپریل | 25mg | سرفه خشک");
  });

  it("extracts speaker notes and filters out system placeholders", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree>
          <p:sp>
            <p:txBody><a:p><a:r><a:t>اسلاید شماره ۱</a:t></a:r></a:p></p:txBody>
          </p:sp>
        </p:spTree>
      </p:sld>`,
    );
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
      </Relationships>`,
    );
    zip.file(
      "ppt/notesSlides/notesSlide1.xml",
      `<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr>
            <p:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></p:txBody>
          </p:sp>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="dt"/></p:nvPr></p:nvSpPr>
            <p:txBody><a:p><a:r><a:t>2026-11-02</a:t></a:r></a:p></p:txBody>
          </p:sp>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>حتماً در ابتدای ارائه به تاریخچه کشف آنتی‌بیوتیک‌ها اشاره کنید.</a:t></a:r></a:p>
              <a:p><a:r><a:t>روی زمان‌بندی بخش پرسش و پاسخ تأکید شود.</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
        </p:spTree>
      </p:notes>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.slides[0].speakerNotes).toContain("حتماً در ابتدای ارائه به تاریخچه کشف آنتی‌بیوتیک‌ها اشاره کنید.");
    expect(result.slides[0].speakerNotes).toContain("روی زمان‌بندی بخش پرسش و پاسخ تأکید شود.");
    expect(result.slides[0].speakerNotes).not.toContain("2026-11-02");
    expect(result.slides[0].rawText).toContain("[یادداشت ارائه:");
  });

  it("extracts embedded images and maps them to respective slides", async () => {
    const zip = new JSZip();
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    zip.file("ppt/media/image1.png", pngBuffer);

    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:spTree>
          <p:pic>
            <p:blipFill><a:blip r:embed="rId10"/></p:blipFill>
          </p:pic>
        </p:spTree>
      </p:sld>`,
    );
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
      </Relationships>`,
    );

    const savedKeys: string[] = [];
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer, {
      saveMedia: async (slideIndex, visual) => {
        const key = `presentations/proj-1/slides/${slideIndex}/${visual.mediaFileName}`;
        savedKeys.push(key);
        return key;
      },
    });

    expect(result.slides[0].visuals).toHaveLength(1);
    expect(result.slides[0].visuals[0].mediaFileName).toBe("image1.png");
    expect(result.slides[0].visuals[0].mimeType).toBe("image/png");
    expect(result.slides[0].visuals[0].storageKey).toBe("presentations/proj-1/slides/1/image1.png");
    expect(savedKeys).toContain("presentations/proj-1/slides/1/image1.png");
  });

  it("handles image shared between multiple slides cleanly", async () => {
    const zip = new JSZip();
    const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    zip.file("ppt/media/logo.png", pngBuffer);

    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
      </p:sld>`,
    );
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/>
      </Relationships>`,
    );

    zip.file(
      "ppt/slides/slide2.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic></p:spTree>
      </p:sld>`,
    );
    zip.file(
      "ppt/slides/_rels/slide2.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/>
      </Relationships>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.slides[0].visuals).toHaveLength(1);
    expect(result.slides[1].visuals).toHaveLength(1);
    expect(result.slides[0].visuals[0].mediaFileName).toBe("logo.png");
    expect(result.slides[1].visuals[0].mediaFileName).toBe("logo.png");
  });

  it("handles slide without text gracefully", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:spTree/></p:sld>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.slides[0].rawText).toBe("");
    expect(result.slides[0].title).toBeNull();
    expect(result.slides[0].textBlocks).toHaveLength(0);
  });

  it("handles presentation without images gracefully", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree><p:sp><p:txBody><a:p><a:r><a:t>No images here</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>
      </p:sld>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.slides[0].visuals).toHaveLength(0);
    expect(result.metadata?.totalVisuals).toBe(0);
  });

  it("rejects malicious Zip Slip paths", async () => {
    const zip = new JSZip();
    zip.file("../evil.sh", "echo bad");
    zip.file("ppt/slides/slide1.xml", "<p:sld/>");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractPresentationFromPptx(buffer)).rejects.toThrow(
      /Unsafe file path in archive/,
    );
  });

  it("rejects files containing active macros (VBA code)", async () => {
    const zip = new JSZip();
    zip.file("ppt/vbaProject.bin", Buffer.from("vba code"));
    zip.file("ppt/slides/slide1.xml", "<p:sld/>");
    const buffer = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractPresentationFromPptx(buffer)).rejects.toThrow(
      /active macros or VBA code are not supported/,
    );
  });

  it("throws ExtractionError for corrupt non-zip file", async () => {
    await expect(
      extractPresentationFromPptx(Buffer.from("not a valid zip container")),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it("ignores broken image relationships without crashing", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:spTree>
          <p:sp><p:txBody><a:p><a:r><a:t>Slide with broken image link</a:t></a:r></a:p></p:txBody></p:sp>
          <p:pic><p:blipFill><a:blip r:embed="rIdGhost"/></p:blipFill></p:pic>
        </p:spTree>
      </p:sld>`,
    );
    // Notice: image rel is pointing to nonexistent file in zip
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdGhost" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/missing.png"/>
      </Relationships>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].visuals).toHaveLength(0);
    expect(result.slides[0].rawText).toContain("Slide with broken image link");
  });

  it("preserves canonical slide order from ppt/presentation.xml", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/presentation.xml",
      `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:sldIdLst>
          <p:sldId r:id="rIdB" id="256"/>
          <p:sldId r:id="rIdA" id="257"/>
        </p:sldIdLst>
      </p:presentation>`,
    );
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
        <Relationship Id="rIdA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
      </Relationships>`,
    );
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Content of file slide1</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>
      </p:sld>`,
    );
    zip.file(
      "ppt/slides/slide2.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Content of file slide2</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>
      </p:sld>`,
    );

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractPresentationFromPptx(buffer);

    // According to presentation.xml, rIdB (slide2) comes first, then rIdA (slide1)!
    expect(result.slides[0].slideIndex).toBe(1);
    expect(result.slides[0].rawText).toContain("Content of file slide2");
    expect(result.slides[1].slideIndex).toBe(2);
    expect(result.slides[1].rawText).toContain("Content of file slide1");
  });

  it("extractPptxText legacy function still works unchanged", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Legacy text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>
      </p:sld>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const legacy = await extractPptxText(buffer);

    expect(legacy.slides).toHaveLength(1);
    expect(legacy.slides[0].slideNumber).toBe(1);
    expect(legacy.slides[0].text).toContain("Legacy text");
  });

  it("PptxTextExtractor class implements TextExtractor contract", async () => {
    expect(extractor.supports(PPTX_MIME_TYPE)).toBe(true);

    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Full contract test</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>
      </p:sld>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const result = await extractor.extract({
      data: buffer,
      mimeType: PPTX_MIME_TYPE,
      originalName: "contract.pptx",
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].rawText).toContain("Full contract test");
    expect(result.metadata?.slideCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Security & Hardening Tests (Path Traversal, OOXML Resolution, XML Safety)
  // ---------------------------------------------------------------------------

  describe("Security & Path Traversal Protections", () => {
    it("extracts media with valid OOXML standard relative path ../media/image1.png", async () => {
      const zip = new JSZip();
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree>
            <p:pic>
              <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
            </p:pic>
          </p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
        </Relationships>`,
      );
      zip.file("ppt/media/image1.png", fakePng);

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);

      expect(result.slides[0].visuals).toHaveLength(1);
      expect(result.slides[0].visuals[0].mediaFileName).toBe("image1.png");
      expect(result.slides[0].visuals[0].mimeType).toBe("image/png");
    });

    it("extracts media with valid archive-rooted path ppt/media/photo.jpg", async () => {
      const zip = new JSZip();
      const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree>
            <p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>
          </p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="ppt/media/photo.jpg"/>
        </Relationships>`,
      );
      zip.file("ppt/media/photo.jpg", fakeJpg);

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);

      expect(result.slides[0].visuals).toHaveLength(1);
      expect(result.slides[0].visuals[0].mediaFileName).toBe("photo.jpg");
      expect(result.slides[0].visuals[0].mimeType).toBe("image/jpeg");
    });

    it("rejects path traversal attempting ../../ outside ppt/media", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rIdEvil"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdEvil" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../../docProps/core.xml"/>
        </Relationships>`,
      );
      zip.file("docProps/core.xml", "<secret>Confidential Company Data</secret>");

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);

      // Traversal target must be rejected: visuals must NOT include core.xml
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("rejects absolute paths (/etc/passwd or C:\\file)", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="/etc/shadow"/>
        </Relationships>`,
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("rejects target escaping ppt/media into ppt/notesSlides", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../notesSlides/notesSlide1.xml"/>
        </Relationships>`,
      );
      zip.file("ppt/notesSlides/notesSlide1.xml", "<notes>Some private note</notes>");

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("rejects target escaping ppt/notesSlides into ppt/media", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../media/image1.png"/>
        </Relationships>`,
      );
      zip.file("ppt/media/image1.png", Buffer.from([1, 2, 3]));

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].speakerNotes).toBeNull();
    });

    it("handles empty or malformed relationship targets safely", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rIdEmpty"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdEmpty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="   "/>
        </Relationships>`,
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("handles reference to non-existent media file gracefully without throwing", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/deleted_image.png"/>
        </Relationships>`,
      );
      // Notice: ppt/media/deleted_image.png is intentionally NOT added to zip

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("detects and rejects XML entity expansion / DOCTYPE injection", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<?xml version="1.0"?>
        <!DOCTYPE lolz [
          <!ENTITY lol "lol">
          <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;">
        ]>
        <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:spTree><p:sp><p:txBody><a:p><a:r><a:t>&lol2;</a:t></a:r></a:p></p:txBody></p:sp></p:spTree>
        </p:sld>`,
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      await expect(extractPresentationFromPptx(buffer)).rejects.toThrow(
        /Prohibited DOCTYPE or ENTITY declaration/i,
      );
    });

    it("detects and rejects DOCTYPE or ENTITY with arbitrary whitespace and case variations", async () => {
      const zip1 = new JSZip();
      zip1.file(
        "ppt/slides/slide1.xml",
        `<!   DOCTYPE   root SYSTEM "http://malicious.host/xxe">
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:spTree/></p:sld>`,
      );
      const buf1 = await zip1.generateAsync({ type: "nodebuffer" });
      await expect(extractPresentationFromPptx(buf1)).rejects.toThrow(
        /Prohibited DOCTYPE or ENTITY declaration/i,
      );

      const zip2 = new JSZip();
      zip2.file(
        "ppt/slides/slide1.xml",
        `<!\n\tentity\n\txxe SYSTEM "file:///etc/passwd">
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:spTree/></p:sld>`,
      );
      const buf2 = await zip2.generateAsync({ type: "nodebuffer" });
      await expect(extractPresentationFromPptx(buf2)).rejects.toThrow(
        /Prohibited DOCTYPE or ENTITY declaration/i,
      );
    });

    it("rejects encoded path traversal attempts (%2e%2e, null bytes, double encoding)", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="%2e%2e/%2e%2e/etc/passwd"/>
        </Relationships>`,
      );
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("gracefully parses malformed or truncated XML without unhandled crashes", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p>
                  <a:t>متن قبل از تگ خراب
                <broken><<unclosed
                <a:t>متن بعد از خرابی</a:t>
        `,
      );
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].rawText).toContain("متن بعد از خرابی");
    });

    it("releases visual buffer from memory once saveMedia returns storage key", async () => {
      const zip = new JSZip();
      const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
      zip.file("ppt/media/chart.png", pngBuffer);
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/chart.png"/>
        </Relationships>`,
      );

      let bufferReceivedInCallback: Buffer | undefined;
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer, {
        saveMedia: async (_slideIndex, visual) => {
          bufferReceivedInCallback = visual.buffer;
          return "presentations/proj-1/slides/1/chart.png";
        },
      });

      expect(bufferReceivedInCallback).toBeDefined();
      expect(bufferReceivedInCallback?.length).toBe(pngBuffer.length);
      // visual.buffer should be deleted from slide result to prevent holding multiple images in RAM
      expect((result.slides[0].visuals[0] as Record<string, unknown>).buffer).toBeUndefined();
      expect(result.slides[0].visuals[0].storageKey).toBe("presentations/proj-1/slides/1/chart.png");
    });

    it("does not retain visual.buffer in output when saveMedia is not provided", async () => {
      const zip = new JSZip();
      const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
      zip.file("ppt/media/test.png", pngBuffer);
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/test.png"/>
        </Relationships>`,
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);

      expect(result.slides[0].visuals).toHaveLength(1);
      expect((result.slides[0].visuals[0] as Record<string, unknown>).buffer).toBeUndefined();
    });

    it("handles saveMedia errors gracefully without crashing presentation extraction", async () => {
      const zip = new JSZip();
      const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
      zip.file("ppt/media/err.png", pngBuffer);
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree>
            <p:sp><p:txBody><a:p><a:r><a:t>Slide with faulty storage</a:t></a:r></a:p></p:txBody></p:sp>
            <p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>
          </p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/err.png"/>
        </Relationships>`,
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer, {
        saveMedia: async () => {
          throw new Error("S3 connection timeout");
        },
      });

      expect(result.slides).toHaveLength(1);
      expect(result.slides[0].rawText).toContain("Slide with faulty storage");
      expect(result.slides[0].visuals).toHaveLength(0); // Failed image was skipped gracefully
    });

    it("rejects XML with non-UTF-8 declared encoding", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<?xml version="1.0" encoding="ISO-8859-1"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:spTree/></p:sld>`,
      );
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      await expect(extractPresentationFromPptx(buffer)).rejects.toThrow(
        /Unsupported XML encoding 'ISO-8859-1'/i,
      );
    });

    it("rejects XML containing null bytes (e.g. UTF-16 misinterpretation)", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        Buffer.from("<\0p\0:\0s\0l\0d\0>\0", "utf-8"),
      );
      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      await expect(extractPresentationFromPptx(buffer)).rejects.toThrow(
        /Prohibited null byte or unsupported character encoding/i,
      );
    });

    it("rejects path traversal using Windows backslashes (..\\..\\)", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rIdBackslash"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdBackslash" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="..\\..\\docProps\\core.xml"/>
        </Relationships>`,
      );
      zip.file("docProps/core.xml", "<secret>data</secret>");

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("accepts valid OOXML image paths with backslashes (..\\media\\image1.png)", async () => {
      const zip = new JSZip();
      const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="..\\media\\image1.png"/>
        </Relationships>`,
      );
      zip.file("ppt/media/image1.png", fakePng);

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(1);
      expect(result.slides[0].visuals[0].mediaFileName).toBe("image1.png");
    });

    it("rejects path traversal containing null bytes (raw and percent-encoded)", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rIdNull"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdNull" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image.png%00.evil"/>
        </Relationships>`,
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });

    it("rejects double-encoded path traversal (%252e%252e)", async () => {
      const zip = new JSZip();
      zip.file(
        "ppt/slides/slide1.xml",
        `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <p:spTree><p:pic><p:blipFill><a:blip r:embed="rIdDouble"/></p:blipFill></p:pic></p:spTree>
        </p:sld>`,
      );
      zip.file(
        "ppt/slides/_rels/slide1.xml.rels",
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rIdDouble" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="%252e%252e/%252e%252e/etc/passwd"/>
        </Relationships>`,
      );

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const result = await extractPresentationFromPptx(buffer);
      expect(result.slides[0].visuals).toHaveLength(0);
    });
  });
});
