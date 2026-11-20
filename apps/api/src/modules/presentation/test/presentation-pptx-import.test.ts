import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { UUID } from "node:crypto";
import fastify from "fastify";
import multipart from "@fastify/multipart";
import JSZip from "jszip";
import type {
  Actor,
  CompletionRequest,
  CompletionResult,
  ModelGateway,
  OrganizationId,
  UserId,
} from "@avana/domain";
import {
  asOrganizationId,
  asUserId,
  asPresentationProjectId,
  asPresentationSlideId,
  DomainError,
  PRESENTATION_CANONICAL_MODEL,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
} from "@avana/domain";
import {
  InMemoryPresentationProjectStore,
  InMemoryPresentationReferenceStore,
} from "../in-memory-presentation-store.js";
import { InMemoryPresentationSlideStore } from "../in-memory-presentation-slide-store.js";
import { PresentationGenerationService } from "../presentation-generation-service.js";
import { PresentationLayoutService } from "../presentation-layout-service.js";
import { PresentationReferenceIntegrationService } from "../reference-integration-service.js";
import { PresentationImportService } from "../presentation-import-service.js";
import { presentationProjectRoutes } from "../presentation-project-routes.js";
import { InMemoryOrganizationStore } from "../../organizations/test/in-memory-stores.js";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../../storage/storage-provider.js";
import { PPTX_MIME_TYPE } from "../../documents/extraction/pptx-extractor.js";

// ---------------------------------------------------------------------------
// In-Memory Storage Provider for Testing
// ---------------------------------------------------------------------------
class InMemoryStorageProvider implements StorageProvider {
  public files = new Map<string, { data: Buffer; mimeType: string }>();

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<UploadIntent> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, {
      data: options.data,
      mimeType: options.mimeType,
    });
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const file = this.files.get(storageKey);
    if (!file) throw new Error(`Not found: ${storageKey}`);
    return file.data;
  }
}

// ---------------------------------------------------------------------------
// Mock Gateway for Phase 1 Speech Engine Integration
// ---------------------------------------------------------------------------
class MockGateway implements ModelGateway {
  readonly provider = "mock" as const;
  public model: string = PRESENTATION_CANONICAL_MODEL;
  public completionHistory: CompletionRequest[] = [];

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.completionHistory.push(req);
    return {
      text: JSON.stringify({
        title: "بررسی بالینی فشار خون",
        speechText:
          "سلام و درود به اساتید و همکاران گرامی. در این اسلاید به بررسی اتیولوژی و درمان بالینی پرفشاری خون می‌پردازیم.",
        pedagogicalRationale:
          "این اسلاید مفاهیم پایه‌ای فارماکولوژی بالینی را برای رزیدنت‌ها تشریح می‌کند.",
        keyPoints: [
          "شروع درمان با مهارکننده‌های ACE",
          "پایش عملکرد کلیوی در هفته اول",
        ],
        clinicalExamples: [
          {
            scenario: "بیمار ۵۲ ساله با فشار خون ۱۶۰ روی ۹۵",
            teachingPoint: "تجویز لوزارتان ۲۵ میلی‌گرم روزانه",
            connectionToSlide: "مطابق الگوریتم درمانی اسلاید",
          },
        ],
        claims: [],
        estimatedDurationSeconds: 75,
        citations: [],
      }),
      model: this.model,
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: Create Mock PPTX Buffers with JSZip
// ---------------------------------------------------------------------------
async function createMockPptx(options?: {
  title?: string;
  slides?: Array<{
    title?: string;
    paragraphs?: string[];
    bullets?: string[];
    table?: { headers: string[]; rows: string[][] };
    notes?: string;
    hasImage?: boolean;
    hasChart?: boolean;
    hasSmartArt?: boolean;
    hasGroupedShapes?: boolean;
  }>;
  extraFiles?: Array<{ path: string; data: Buffer | string }>;
}): Promise<Buffer> {
  const zip = new JSZip();

  // Core properties
  zip.file(
    "docProps/core.xml",
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>${options?.title ?? "Test Medical Presentation"}</dc:title>
      <dc:creator>Dr. Avana</dc:creator>
    </cp:coreProperties>`,
  );

  const slidesData = options?.slides ?? [
    {
      title: "Introduction to Hypertension",
      paragraphs: ["Hypertension affects over 1 billion adults worldwide."],
      bullets: ["Primary cause of stroke", "Major cardiovascular risk factor"],
    },
  ];

  // 1x1 transparent PNG buffer for image tests
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );

  for (let idx = 0; idx < slidesData.length; idx++) {
    const s = slidesData[idx];
    const sNum = idx + 1;

    let shapesXml = "";
    let shapeId = 2;

    // Title shape
    if (s.title !== undefined) {
      shapesXml += `
        <p:sp>
          <p:nvSpPr>
            <p:cNvPr id="${shapeId++}" name="Title ${sNum}"/>
            <p:nvPr><p:ph type="title"/></p:nvPr>
          </p:nvSpPr>
          <p:txBody>
            <a:p><a:r><a:t>${s.title}</a:t></a:r></a:p>
          </p:txBody>
        </p:sp>`;
    }

    // Paragraphs
    if (s.paragraphs) {
      for (const p of s.paragraphs) {
        shapesXml += `
          <p:sp>
            <p:nvSpPr><p:cNvPr id="${shapeId++}" name="Content"/></p:nvSpPr>
            <p:txBody>
              <a:p><a:r><a:t>${p}</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>`;
      }
    }

    // Bullets
    if (s.bullets) {
      let bulletsP = "";
      for (const b of s.bullets) {
        bulletsP += `<a:p><a:pPr lvl="0"/><a:r><a:t>${b}</a:t></a:r></a:p>`;
      }
      shapesXml += `
        <p:sp>
          <p:nvSpPr><p:cNvPr id="${shapeId++}" name="Bullets"/></p:nvSpPr>
          <p:txBody>${bulletsP}</p:txBody>
        </p:sp>`;
    }

    // Table
    if (s.table) {
      let tableRowsXml = "";
      if (s.table.headers && s.table.headers.length > 0) {
        const headerCells = s.table.headers
          .map((h) => `<a:tc><a:txBody><a:p><a:r><a:t>${h}</a:t></a:r></a:p></a:txBody></a:tc>`)
          .join("");
        tableRowsXml += `<a:tr>${headerCells}</a:tr>`;
      }
      for (const row of s.table.rows) {
        const rowCells = row
          .map((c) => `<a:tc><a:txBody><a:p><a:r><a:t>${c}</a:t></a:r></a:p></a:txBody></a:tc>`)
          .join("");
        tableRowsXml += `<a:tr>${rowCells}</a:tr>`;
      }

      shapesXml += `
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr id="${shapeId++}" name="Table 1"/></p:nvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
              <a:tbl>${tableRowsXml}</a:tbl>
            </a:graphicData>
          </a:graphic>
        </p:graphicFrame>`;
    }

    // Chart shape
    let relsXml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
    if (s.hasChart) {
      shapesXml += `
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr id="${shapeId++}" name="Chart 1"/></p:nvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
              <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdChart${sNum}"/>
            </a:graphicData>
          </a:graphic>
        </p:graphicFrame>`;
      relsXml += `
        <Relationship Id="rIdChart${sNum}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${sNum}.xml"/>`;
    }

    // SmartArt shape
    if (s.hasSmartArt) {
      shapesXml += `
        <p:graphicFrame>
          <p:nvGraphicFramePr><p:cNvPr id="${shapeId++}" name="Diagram 1"/></p:nvGraphicFramePr>
          <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">
              <d:diagram xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>
            </a:graphicData>
          </a:graphic>
        </p:graphicFrame>`;
    }

    // Grouped shapes
    if (s.hasGroupedShapes) {
      shapesXml += `
        <p:grpSp>
          <p:grpSpPr/>
          <p:sp>
            <p:nvSpPr><p:cNvPr id="${shapeId++}" name="SubShape1"/></p:nvSpPr>
            <p:txBody><a:p><a:r><a:t>Grouped SubShape Text</a:t></a:r></a:p></p:txBody>
          </p:sp>
        </p:grpSp>`;
    }

    // Image shape
    if (s.hasImage) {
      zip.file(`ppt/media/image${sNum}.png`, pngBuffer);
      shapesXml += `
        <p:pic>
          <p:nvPicPr><p:cNvPr id="${shapeId++}" name="Image"/></p:nvPicPr>
          <p:blipFill><a:blip r:embed="rIdImg${sNum}"/></p:blipFill>
        </p:pic>`;
      relsXml += `
        <Relationship Id="rIdImg${sNum}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${sNum}.png"/>`;
    }

    // Notes
    if (s.notes) {
      zip.file(
        `ppt/notesSlides/notesSlide${sNum}.xml`,
        `<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:spTree>
            <p:sp>
              <p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr>
              <p:txBody><a:p><a:r><a:t>${sNum}</a:t></a:r></a:p></p:txBody>
            </p:sp>
            <p:sp>
              <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
              <p:txBody>
                <a:p><a:r><a:t>${s.notes}</a:t></a:r></a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:notes>`,
      );
      relsXml += `
        <Relationship Id="rIdNotes${sNum}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${sNum}.xml"/>`;
    }

    relsXml += `</Relationships>`;

    zip.file(
      `ppt/slides/slide${sNum}.xml`,
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:spTree>${shapesXml}</p:spTree>
      </p:sld>`,
    );

    zip.file(`ppt/slides/_rels/slide${sNum}.xml.rels`, relsXml);
  }

  if (options?.extraFiles) {
    for (const extra of options.extraFiles) {
      zip.file(extra.path, extra.data);
    }
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

// ---------------------------------------------------------------------------
// Helper: Build Multipart POST Payload
// ---------------------------------------------------------------------------
function buildMultipartPptx(options: {
  filename?: string;
  data: Buffer;
  fields?: Record<string, string>;
  mimeType?: string;
}) {
  const boundary = "----avana-pptx-test-boundary";
  const chunks: Buffer[] = [];

  if (options.fields) {
    for (const [key, val] of Object.entries(options.fields)) {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`,
        ),
      );
    }
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename ?? "presentation.pptx"}"\r\nContent-Type: ${options.mimeType ?? PPTX_MIME_TYPE}\r\n\r\n`,
    ),
    options.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("Phase 2-A: PowerPoint (PPTX) File Upload & Slide Extraction", () => {
  let projectStore: InMemoryPresentationProjectStore;
  let slideStore: InMemoryPresentationSlideStore;
  let referenceStore: InMemoryPresentationReferenceStore;
  let organizationStore: InMemoryOrganizationStore;
  let storageProvider: InMemoryStorageProvider;
  let importService: PresentationImportService;
  let generationService: PresentationGenerationService;
  let mockGateway: MockGateway;

  const orgId: OrganizationId = asOrganizationId(randomUUID() as UUID);
  const userId: UserId = asUserId(randomUUID() as UUID);
  const actor: Actor = {
    userId,
    organizationId: orgId,
    role: "course_editor",
    globalRole: "member",
  };

  beforeEach(async () => {
    projectStore = new InMemoryPresentationProjectStore();
    slideStore = new InMemoryPresentationSlideStore();
    referenceStore = new InMemoryPresentationReferenceStore();
    organizationStore = new InMemoryOrganizationStore();
    storageProvider = new InMemoryStorageProvider();
    mockGateway = new MockGateway();

    generationService = new PresentationGenerationService({
      gateway: mockGateway,
      projectStore,
      slideStore,
      organizationStore,
    });

    importService = new PresentationImportService({
      projectStore,
      slideStore,
      organizationStore,
      storageProvider,
    });

    organizationStore.addOrganization({
      id: orgId,
      name: "Medical School",
      slug: "med-school",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await organizationStore.addMembership({
      userId,
      organizationId: orgId,
      role: "course_editor",
    });
  });

  // -------------------------------------------------------------------------
  // 1. Multi-slide PPTX with title, paragraphs, and bullets
  // -------------------------------------------------------------------------
  it("imports valid multi-slide PPTX and creates ordered slides with title, paragraphs and bullets", async () => {
    const pptxBuffer = await createMockPptx({
      title: "Cardiovascular Pharmacology",
      slides: [
        {
          title: "Introduction to ACE Inhibitors",
          paragraphs: ["ACE inhibitors block angiotensin-converting enzyme."],
          bullets: ["Reduces blood pressure", "Improves renal hemodynamics"],
        },
        {
          title: "Adverse Effects",
          paragraphs: ["Common adverse effects must be monitored closely."],
          bullets: ["Dry persistent cough", "Risk of angioedema", "Hyperkalemia"],
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "cardio.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    expect(result.project).toBeDefined();
    expect(result.project.title).toBe("Cardiovascular Pharmacology");
    expect(result.project.totalSlides).toBe(2);
    expect(result.project.organizationId).toBe(orgId);
    expect(result.project.ownerUserId).toBe(userId);

    expect(result.slides).toHaveLength(2);
    expect(result.slides[0].slideIndex).toBe(1);
    expect(result.slides[0].title).toBe("Introduction to ACE Inhibitors");
    expect(result.slides[0].rawText).toContain("Introduction to ACE Inhibitors");
    expect(result.slides[0].rawText).toContain("Reduces blood pressure");

    expect(result.slides[1].slideIndex).toBe(2);
    expect(result.slides[1].title).toBe("Adverse Effects");
    expect(result.slides[1].rawText).toContain("Dry persistent cough");
  });

  // -------------------------------------------------------------------------
  // 2. PPTX with Tables (preserves row/col structure)
  // -------------------------------------------------------------------------
  it("extracts tables from PPTX slides and preserves row and column structure in extracted_tables", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          title: "Drug Comparison Table",
          table: {
            headers: ["Drug", "Class", "Dose"],
            rows: [
              ["Captopril", "ACE-I", "25mg"],
              ["Losartan", "ARB", "50mg"],
            ],
          },
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "tables.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    expect(result.slides).toHaveLength(1);
    const slide = result.slides[0];
    expect(slide.extractedTables).toHaveLength(1);
    expect(slide.extractedTables[0].rows).toHaveLength(3);
    expect(slide.extractedTables[0].rows[0]).toEqual(["Drug", "Class", "Dose"]);
    expect(slide.extractedTables[0].rows[1]).toEqual(["Captopril", "ACE-I", "25mg"]);
    expect(slide.extractedTables[0].rows[2]).toEqual(["Losartan", "ARB", "50mg"]);
    expect(slide.rawText).toContain("[جدول]");
    expect(slide.rawText).toContain("Captopril | ACE-I | 25mg");
  });

  // -------------------------------------------------------------------------
  // 3. PPTX with Speaker Notes
  // -------------------------------------------------------------------------
  it("extracts original speaker notes and filters out system placeholders", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          title: "Clinical Trial Results",
          notes: "Emphasize p-value < 0.001 in landmark trial.",
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "trial.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    const slide = result.slides[0];
    expect(slide.speakerNotes).toBe("Emphasize p-value < 0.001 in landmark trial.");
    expect(slide.extractionMetadata?.hasOriginalSpeakerNotes).toBe(true);
    expect(slide.rawText).toContain("[یادداشت ارائه: Emphasize p-value < 0.001 in landmark trial.]");
  });

  // -------------------------------------------------------------------------
  // 4. PPTX with Embedded Images
  // -------------------------------------------------------------------------
  it("saves embedded images to StorageProvider and populates media_storage_keys", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          title: "Anatomy of Cardiac Muscle",
          paragraphs: ["Histological structure of myocardium."],
          hasImage: true,
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "anatomy.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    const slide = result.slides[0];
    expect(slide.hasVisuals).toBe(true);
    expect(slide.mediaStorageKeys).toHaveLength(1);
    expect(slide.mediaStorageKeys[0]).toContain("media/s1-image1.png");

    // Verify file actually exists in storage provider
    const fileExists = await storageProvider.exists(slide.mediaStorageKeys[0]);
    expect(fileExists).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. PPTX Slide without Title
  // -------------------------------------------------------------------------
  it("handles slide without title gracefully with fallback", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          paragraphs: ["This is a title-less content slide."],
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "no-title.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].title).toBe("This is a title-less content slide.");
    expect(result.slides[0].rawText).toContain("This is a title-less content slide.");
  });

  // -------------------------------------------------------------------------
  // 6. PPTX Empty Slide
  // -------------------------------------------------------------------------
  it("handles empty slide safely without throwing", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {}, // completely empty slide
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "empty-slide.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].slideIndex).toBe(1);
    expect(result.slides[0].title).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 7. Corrupted non-ZIP file rejected
  // -------------------------------------------------------------------------
  it("rejects corrupted non-ZIP file with bad_request error", async () => {
    const fakeBuffer = Buffer.from("THIS IS NOT A VALID ZIP ARCHIVE CONTENT AT ALL");

    await expect(
      importService.importFromPptx(actor, {
        data: fakeBuffer,
        originalName: "malformed.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: fakeBuffer.length,
      }),
    ).rejects.toThrowError(DomainError);
  });

  // -------------------------------------------------------------------------
  // 8. Fake MIME type / missing ZIP magic header
  // -------------------------------------------------------------------------
  it("rejects file with .pptx extension but missing ZIP magic header PK\\x03\\x04", async () => {
    // 0x00, 0x01, 0x02, 0x03 instead of 0x50, 0x4B, 0x03, 0x04
    const fakeBytes = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

    await expect(
      importService.importFromPptx(actor, {
        data: fakeBytes,
        originalName: "spoofed.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: fakeBytes.length,
      }),
    ).rejects.toThrowError(/missing valid ZIP package signature/);
  });

  // -------------------------------------------------------------------------
  // 9. File exceeding max size rejected
  // -------------------------------------------------------------------------
  it("rejects PPTX file exceeding maximum allowed limit", async () => {
    const smallImportService = new PresentationImportService({
      projectStore,
      slideStore,
      organizationStore,
      storageProvider,
      maxFileSize: 1024, // 1 KB max
    });

    const pptxBuffer = await createMockPptx();

    await expect(
      smallImportService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "oversized.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError(/exceeds maximum allowed limit/);
  });

  // -------------------------------------------------------------------------
  // 10. Canonical slide order preserved
  // -------------------------------------------------------------------------
  it("preserves strict canonical slide order 1, 2, 3", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        { title: "First Slide" },
        { title: "Second Slide" },
        { title: "Third Slide" },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "three-slides.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    expect(result.slides.map((s) => s.slideIndex)).toEqual([1, 2, 3]);
    expect(result.slides.map((s) => s.title)).toEqual([
      "First Slide",
      "Second Slide",
      "Third Slide",
    ]);
  });

  // -------------------------------------------------------------------------
  // 11. Preservation of rawText invariant
  // -------------------------------------------------------------------------
  it("preserves rawText intact without AI distortion during import", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          title: "Untouched Slide Title",
          paragraphs: ["Exact scientific statement that should never be altered."],
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "intact.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    const slide = result.slides[0];
    expect(slide.rawText).toContain("Untouched Slide Title");
    expect(slide.rawText).toContain("Exact scientific statement that should never be altered.");
    expect(slide.speechContent).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 12. Integration (In-Memory Stores & Mock Gateway): imported slide produces speech without overwriting rawText
  // Note: Uses InMemoryPresentationProjectStore, InMemoryPresentationSlideStore, and MockGateway
  // to verify end-to-end integration without making external calls to Google Gemini API.
  // -------------------------------------------------------------------------
  it("Integration (In-Memory Stores & Mock Gateway): imported slide produces speech without overwriting rawText", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          title: "Hypertension Pathophysiology",
          paragraphs: ["Vascular remodeling and sympathetic hyperactivity."],
          notes: "Mention peripheral resistance.",
        },
      ],
    });

    // 1. Import PPTX
    const importResult = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "hypertension.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    const importedSlide = importResult.slides[0];
    const originalRawText = importedSlide.rawText;

    // 2. Attach a valid snapshot (as done when generating for a slide)
    await slideStore.saveReferenceSnapshot(importedSlide.id, importResult.project.id, {
      schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
      generationRunId: randomUUID(),
      selectorVersion: "heuristic-lexical-v1",
      selectedAt: new Date().toISOString(),
      projectId: importResult.project.id,
      slideIndex: importedSlide.slideIndex,
      totalSelectedTokens: 0,
      chunks: [],
    });

    // 3. Feed directly into Phase 1 PresentationGenerationService
    const genResult = await generationService.generateSlide({
      actor,
      projectId: importResult.project.id,
      slideId: importedSlide.id,
      instructions: {
        academicLevel: "intermediate",
        tone: "formal_scientific",
      },
    });

    // 3. Verify speech output
    expect(genResult.speechContent).toBeDefined();
    expect(genResult.speechContent?.speechText).toContain("سلام و درود");

    // Fetch the persisted slide record from the store
    const updatedSlide = await slideStore.findById(importedSlide.id, importResult.project.id);
    expect(updatedSlide).toBeDefined();
    // INVARIANT: Original PPTX speaker notes must NOT be overwritten by AI speech!
    expect(updatedSlide?.speakerNotes).toBe("Mention peripheral resistance.");
    const storedSpeech = updatedSlide?.extractionMetadata?.speechContent as any;
    expect(storedSpeech?.speechText).toContain("سلام و درود");

    // 4. CRITICAL INVARIANT: rawText MUST REMAIN UNTOUCHED
    expect(updatedSlide?.rawText).toBe(originalRawText);
    expect(updatedSlide?.rawText).toContain("Hypertension Pathophysiology");
  });

  // -------------------------------------------------------------------------
  // 13. Tenant isolation & authorization
  // -------------------------------------------------------------------------
  it("rejects actor requesting an organization they do not belong to", async () => {
    const otherOrgId = asOrganizationId(randomUUID() as UUID);
    const pptxBuffer = await createMockPptx();

    await expect(
      importService.importFromPptx(
        actor,
        {
          data: pptxBuffer,
          originalName: "tenant.pptx",
          mimeType: PPTX_MIME_TYPE,
          sizeBytes: pptxBuffer.length,
        },
        { organizationId: otherOrgId },
      ),
    ).rejects.toThrowError(/not a member of the requested organization/);
  });

  // -------------------------------------------------------------------------
  // 14. Scenario 1: Failure during mid-slide creation cleans up project and prior slides
  // -------------------------------------------------------------------------
  it("Scenario 1: failure during mid-slide creation cleans up project and prior slides (0 orphan slides/projects)", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        { title: "Slide 1", paragraphs: ["Content 1"] },
        { title: "Slide 2", paragraphs: ["Content 2"] },
      ],
    });

    let slideCreateCount = 0;
    const originalCreateSlide = slideStore.createSlide.bind(slideStore);
    slideStore.createSlide = async (input) => {
      slideCreateCount++;
      if (slideCreateCount === 2) {
        throw new Error("Simulated database failure on slide 2");
      }
      return originalCreateSlide(input);
    };

    await expect(
      importService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "fail-mid-slide.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError(/Failed to process PPTX file: Simulated database failure on slide 2/);

    // Verify zero projects remain in projectStore
    const projects = await projectStore.listByUserId(actor.userId, orgId);
    expect(projects).toHaveLength(0);

    // Verify zero slides remain in slideStore
    const slideCount = await slideStore.countByProjectId(asPresentationProjectId(randomUUID()));
    expect(slideCount).toBe(0);
    expect((slideStore as unknown as { slides: Map<string, unknown> }).slides.size).toBe(0);

    // Verify storageProvider has no orphaned files
    expect(storageProvider.files.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: DB creation failure purges stored files from StorageProvider
  // -------------------------------------------------------------------------
  it("Scenario 2: DB creation failure purges stored files from StorageProvider", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        { title: "Slide with Image", hasImage: true },
      ],
    });

    projectStore.create = async () => {
      throw new Error("Simulated DB connection failure on project create");
    };

    await expect(
      importService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "db-fail.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError(/Simulated DB connection failure on project create/);

    expect(storageProvider.files.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Failure in storage cleanup does not mask the original domain error
  // -------------------------------------------------------------------------
  it("Scenario 3: failure in storage cleanup does not mask the original domain error", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [{ title: "Slide 1" }],
    });

    slideStore.createSlide = async () => {
      throw new DomainError("bad_request", "Original Slide Creation Error");
    };

    storageProvider.delete = async () => {
      throw new Error("Simulated StorageProvider network timeout during cleanup");
    };

    await expect(
      importService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "cleanup-fail.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError("Original Slide Creation Error");
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Slide containing a Chart is detected with user warning
  // -------------------------------------------------------------------------
  it("Scenario 4: detects chart in slide XML/rels, sets hasCharts: true, and includes user warning in extractionMetadata", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          title: "Clinical Trial Results",
          paragraphs: ["Efficacy analysis over 12 weeks:"],
          hasChart: true,
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "chart.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    expect(result.slides).toHaveLength(1);
    const slide = result.slides[0];
    const meta = slide.extractionMetadata as {
      unsupportedContent?: {
        hasCharts: boolean;
        chartCount: number;
        warningMessage?: string;
      };
    };
    expect(meta.unsupportedContent).toBeDefined();
    expect(meta.unsupportedContent?.hasCharts).toBe(true);
    expect(meta.unsupportedContent?.chartCount).toBeGreaterThanOrEqual(1);
    expect(meta.unsupportedContent?.warningMessage).toContain(
      "این اسلاید شامل نمودار یا دیاگرام SmartArt است. محتوای متنی داخلی این ساختارها در نسخه فعلی استخراج نمی‌شود و ممکن است بخشی از اطلاعات اسلاید در خروجی سخنرانی لحاظ نشود.",
    );
    expect(slide.rawText).toContain("Efficacy analysis over 12 weeks:");
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Slide containing SmartArt / Grouped Shapes records unsupportedContent
  // -------------------------------------------------------------------------
  it("Scenario 5: records hasSmartArt and hasGroupedShapes in extractionMetadata while preserving extracted text", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [
        {
          title: "Diagnostic Workflow",
          hasSmartArt: true,
          hasGroupedShapes: true,
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "smartart.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    const slide = result.slides[0];
    const meta = slide.extractionMetadata as {
      unsupportedContent?: {
        hasSmartArt: boolean;
        hasGroupedShapes: boolean;
        warningMessage?: string;
      };
    };
    expect(meta.unsupportedContent?.hasSmartArt).toBe(true);
    expect(meta.unsupportedContent?.hasGroupedShapes).toBe(true);
    expect(meta.unsupportedContent?.warningMessage).toContain(
      "این اسلاید شامل نمودار یا دیاگرام SmartArt است. محتوای متنی داخلی این ساختارها در نسخه فعلی استخراج نمی‌شود و ممکن است بخشی از اطلاعات اسلاید در خروجی سخنرانی لحاظ نشود.",
    );
    expect(meta.unsupportedContent?.warningMessage).toContain("Grouped Shapes");
    expect(slide.rawText).toContain("Grouped SubShape Text");
  });

  // -------------------------------------------------------------------------
  // Scenario 6: VBA Macro Detection (Standard, Case variations, Windows Backslash)
  // -------------------------------------------------------------------------
  it("Scenario 6a: rejects PPTX containing actual VBA macro (ppt/vbaProject.bin) with macro_detected error", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [{ title: "Macro Slide" }],
      extraFiles: [
        {
          path: "ppt/vbaProject.bin",
          data: Buffer.from("VBA_MACRO_PAYLOAD"),
        },
      ],
    });

    await expect(
      importService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "macro-standard.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError(/active macros or VBA code are not supported/);
  });

  it("Scenario 6b: rejects PPTX containing uppercase VBA macro (PPT/VBAProject.BIN)", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [{ title: "Macro Slide" }],
      extraFiles: [
        {
          path: "PPT/VBAProject.BIN",
          data: Buffer.from("UPPERCASE_VBA_PAYLOAD"),
        },
      ],
    });

    await expect(
      importService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "macro-uppercase.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError(/active macros or VBA code are not supported/);
  });

  it("Scenario 6c: rejects PPTX containing Windows backslash VBA path (ppt\\vbaProject.bin)", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [{ title: "Macro Slide" }],
      extraFiles: [
        {
          path: "ppt\\vbaProject.bin",
          data: Buffer.from("BACKSLASH_VBA_PAYLOAD"),
        },
      ],
    });

    await expect(
      importService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "macro-backslash.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError(/active macros or VBA code are not supported/);
  });

  it("Scenario 6d: rejects Zip Slip entries with both forward slash and backslash separators", async () => {
    const zipSlipPaths = [
      "../sneaky.xml",
      "..\\sneaky.xml",
      "/etc/passwd",
      "\\windows\\system.ini",
      "C:\\danger.xml",
      "ppt/../../root.xml",
      "ppt\\..\\..\\root.xml",
    ];

    for (const badPath of zipSlipPaths) {
      const pptxBuffer = await createMockPptx({
        slides: [{ title: "Normal Slide" }],
        extraFiles: [
          {
            path: badPath,
            data: "malicious payload",
          },
        ],
      });

      await expect(
        importService.importFromPptx(actor, {
          data: pptxBuffer,
          originalName: "slip.pptx",
          mimeType: PPTX_MIME_TYPE,
          sizeBytes: pptxBuffer.length,
        }),
      ).rejects.toThrowError(/Unsafe file path in archive/);
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Safe PPTX containing non-macro .bin files is accepted
  // -------------------------------------------------------------------------
  it("Scenario 7: accepts safe PPTX containing legitimate non-macro .bin files (printerSettings, OLE embeddings)", async () => {
    const pptxBuffer = await createMockPptx({
      slides: [{ title: "Safe Slide with Printer Settings", paragraphs: ["Clean scientific text"] }],
      extraFiles: [
        {
          path: "ppt/printerSettings/printerSettings1.bin",
          data: Buffer.from([0x01, 0x02, 0x03, 0x04]),
        },
        {
          path: "ppt/embeddings/oleObject1.bin",
          data: Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]),
        },
      ],
    });

    const result = await importService.importFromPptx(actor, {
      data: pptxBuffer,
      originalName: "safe-with-bin.pptx",
      mimeType: PPTX_MIME_TYPE,
      sizeBytes: pptxBuffer.length,
    });

    expect(result.project).toBeDefined();
    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].title).toBe("Safe Slide with Printer Settings");
    expect(result.slides[0].rawText).toContain("Clean scientific text");
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Structured logging of cleanup failures without masking original error
  // -------------------------------------------------------------------------
  it("Scenario 10: records structured warning logs when cleanup fails during error handling without masking original error", async () => {
    const warnLogs: Array<{ obj: Record<string, unknown>; msg?: string }> = [];
    const mockLogger = {
      warn: (obj: Record<string, unknown>, msg?: string) => {
        warnLogs.push({ obj, msg });
      },
      error: vi.fn(),
      info: vi.fn(),
    };

    const loggingService = new PresentationImportService({
      projectStore,
      slideStore,
      organizationStore,
      storageProvider,
      logger: mockLogger,
    });

    const pptxBuffer = await createMockPptx({
      slides: [{ title: "Slide 1" }],
    });

    // Make storageProvider.delete fail during cleanup
    storageProvider.delete = async () => {
      throw new Error("S3 simulated network unreachable during delete");
    };

    // Make slideStore.createSlide throw original DomainError
    slideStore.createSlide = async () => {
      throw new DomainError("bad_request", "Original domain validation failure");
    };

    await expect(
      loggingService.importFromPptx(actor, {
        data: pptxBuffer,
        originalName: "log-cleanup-test.pptx",
        mimeType: PPTX_MIME_TYPE,
        sizeBytes: pptxBuffer.length,
      }),
    ).rejects.toThrowError("Original domain validation failure");

    // Verify structured logger captured cleanup failure
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);
    const pptxCleanupLog = warnLogs.find((l) => l.obj.operation === "delete_pptx_file");
    expect(pptxCleanupLog).toBeDefined();
    expect(pptxCleanupLog?.obj.module).toBe("presentation-import");
    expect(pptxCleanupLog?.obj.error).toContain("S3 simulated network unreachable");
    expect(pptxCleanupLog?.obj.targetKey).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 15. API Endpoint Integration: POST /v1/presentation/projects/import-pptx
  // -------------------------------------------------------------------------
  describe("API Endpoint POST /v1/presentation/projects/import-pptx", () => {
    let app: ReturnType<typeof fastify>;

    beforeEach(async () => {
      app = fastify();
      await app.register(errorHandlerPlugin);
      await app.register(multipart);

      const fakeSessionService = {
        validateSessionDetails: async (token: string) => {
          if (!token) return { valid: false, revoked: true };
          return {
            valid: true,
            revoked: false,
            user: {
              id: userId,
              userId,
              role: "course_editor",
              globalRole: null,
            },
          };
        },
        getConfig: () => ({}),
      } as any;

      const fakeUserStore = {
        findById: async () => ({
          id: userId,
          role: "course_editor",
          globalRole: "member",
          status: "active",
        }),
      } as any;

      await app.register(presentationProjectRoutes, {
        projectStore,
        slideStore,
        referenceStore,
        generationService,
        organizationStore,
        sessionService: fakeSessionService,
        userStore: fakeUserStore,
        storageProvider,
        importService,
      });
    });

    it("successfully creates project and slides via multipart upload", async () => {
      const pptxBuffer = await createMockPptx({
        title: "API Uploaded Presentation",
        slides: [
          {
            title: "First Slide Title",
            paragraphs: ["Content in first slide."],
          },
        ],
      });

      const multipartData = buildMultipartPptx({
        filename: "cardio_deck.pptx",
        data: pptxBuffer,
        fields: {
          title: "Custom Project Title",
          organization_id: orgId,
          academic_level: "advanced",
          target_duration_minutes: "20",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/presentation/projects/import-pptx",
        headers: {
          "content-type": multipartData.contentType,
          authorization: "Bearer valid_token",
        },
        payload: multipartData.body,
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.project).toBeDefined();
      expect(json.project.title).toBe("Custom Project Title");
      expect(json.project.target_duration_minutes).toBe(20);
      expect(json.project.academic_level).toBe("advanced");
      expect(json.slides).toHaveLength(1);
      expect(json.slides[0].title).toBe("First Slide Title");
      expect(json.slides[0].raw_text).toContain("Content in first slide.");
    });

    it("rejects request when no file is uploaded", async () => {
      const boundary = "----empty-boundary";
      const emptyBody = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nHello\r\n--${boundary}--\r\n`);

      const res = await app.inject({
        method: "POST",
        url: "/v1/presentation/projects/import-pptx",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          authorization: "Bearer valid_token",
        },
        payload: emptyBody,
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.error).toBeDefined();
    });

    it("rejects unauthenticated request with 401", async () => {
      const pptxBuffer = await createMockPptx();
      const multipartData = buildMultipartPptx({ data: pptxBuffer });

      const unauthApp = fastify();
      await unauthApp.register(errorHandlerPlugin);
      await unauthApp.register(multipart);

      const rejectingSessionService = {
        validateSessionDetails: async () => ({
          valid: false,
          revoked: true,
        }),
        getConfig: () => ({}),
      } as any;

      const fakeUserStore = {
        findById: async () => null,
      } as any;

      await unauthApp.register(presentationProjectRoutes, {
        projectStore,
        slideStore,
        organizationStore,
        generationService,
        sessionService: rejectingSessionService,
        userStore: fakeUserStore,
        storageProvider,
        importService,
      });

      const res = await unauthApp.inject({
        method: "POST",
        url: "/v1/presentation/projects/import-pptx",
        headers: {
          "content-type": multipartData.contentType,
        },
        payload: multipartData.body,
      });

      expect(res.statusCode).toBe(401);
    });

    it("Scenario 8: rejects truncated multipart upload with 400 bad_request", async () => {
      const limitedApp = fastify();
      await limitedApp.register(errorHandlerPlugin);
      await limitedApp.register(multipart, { limits: { fileSize: 50 } });

      const fakeSessionService = {
        validateSessionDetails: async (token: string) => ({
          valid: true,
          revoked: false,
          user: { id: userId, userId, role: "course_editor", globalRole: null },
        }),
        getConfig: () => ({}),
      } as any;

      const fakeUserStore = {
        findById: async () => ({
          id: userId,
          role: "course_editor",
          globalRole: "member",
          status: "active",
        }),
      } as any;

      await limitedApp.register(presentationProjectRoutes, {
        projectStore,
        slideStore,
        referenceStore,
        generationService,
        organizationStore,
        sessionService: fakeSessionService,
        userStore: fakeUserStore,
        storageProvider,
        importService,
      });

      const pptxBuffer = await createMockPptx();
      const multipartData = buildMultipartPptx({
        filename: "oversized.pptx",
        data: pptxBuffer,
      });

      const res = await limitedApp.inject({
        method: "POST",
        url: "/v1/presentation/projects/import-pptx",
        headers: {
          "content-type": multipartData.contentType,
          authorization: "Bearer valid_token",
        },
        payload: multipartData.body,
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.error?.message || json.message).toMatch(/exceeds the maximum allowed size|truncated/i);
    });

    it("Scenario 9: legacy project creation (POST /v1/presentation/projects) remains fully functional and unaffected", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/presentation/projects",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer valid_token",
        },
        payload: {
          title: "Legacy Clinical Cardiology",
          organization_id: orgId,
          target_duration_minutes: 15,
          academic_level: "advanced",
          tone: "formal_scientific",
          elaboration_depth: "balanced",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.project).toBeDefined();
      expect(json.project.title).toBe("Legacy Clinical Cardiology");
      expect(json.project.academic_level).toBe("advanced");
      expect(json.project.total_slides).toBe(0);
    });
  });
});
