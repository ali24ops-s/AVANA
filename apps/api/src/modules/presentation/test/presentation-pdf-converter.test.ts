import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PresentationPdfConverter,
} from "../presentation-pdf-converter.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../../storage/storage-provider.js";

class MockStorageProvider implements StorageProvider {
  public files = new Map<string, { data: Buffer; mimeType: string }>();

  async createUpload(options: { storageKey: string; mimeType: string }): Promise<UploadIntent> {
    return { storageKey: options.storageKey, uploadUrl: null, expiresAt: new Date().toISOString() };
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, { data: options.data, mimeType: options.mimeType });
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const f = this.files.get(storageKey);
    if (!f) throw new Error(`ENOENT: ${storageKey}`);
    return f.data;
  }
}

describe("PresentationPdfConverter", () => {
  let storage: MockStorageProvider;
  const orgId = "org-123";
  const projId = "proj-456";

  beforeEach(() => {
    storage = new MockStorageProvider();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes deterministic storage keys", () => {
    const converter = new PresentationPdfConverter({ storageProvider: storage });
    const key = converter.getPdfStorageKey(orgId, projId);
    expect(key).toBe(`presentations/org-${orgId}/projects/${projId}/slides.pdf`);
  });

  it("reports ready when PDF already exists in storage even without LibreOffice", async () => {
    const converter = new PresentationPdfConverter({ storageProvider: storage });
    const pdfKey = converter.getPdfStorageKey(orgId, projId);

    // Mock LibreOffice as completely missing
    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(false);

    expect(await converter.isPdfReady(orgId, projId)).toBe(false);

    await storage.save({
      storageKey: pdfKey,
      data: Buffer.from("%PDF-1.4 mock"),
      mimeType: "application/pdf",
    });

    expect(await converter.isPdfReady(orgId, projId)).toBe(true);
    const status = await converter.getStatus(orgId, projId);
    expect(status.status).toBe("ready");
    expect(status.storageKey).toBe(pdfKey);
  });

  it("returns cached result if PDF already converted", async () => {
    const converter = new PresentationPdfConverter({ storageProvider: storage });
    const pdfKey = converter.getPdfStorageKey(orgId, projId);

    await storage.save({
      storageKey: pdfKey,
      data: Buffer.from("%PDF-1.4 mock"),
      mimeType: "application/pdf",
    });

    const result = await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.cached).toBe(true);
  });

  it("handles unavailable LibreOffice gracefully without crashing", async () => {
    const converter = new PresentationPdfConverter({
      storageProvider: storage,
      sofficeCommand: "/non-existent/soffice/binary",
    });

    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(false);

    const status = await converter.getStatus(orgId, projId);
    expect(status.status).toBe("unavailable");

    const result = await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
      pptxBuffer: Buffer.from("PK mock pptx"),
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("unavailable");
  });

  it("deduplicates concurrent conversion requests for the same project", async () => {
    const converter = new PresentationPdfConverter({ storageProvider: storage });

    let resolveConversion: () => void = () => {};
    const fakePromise = new Promise<{ success: boolean; status: "ready"; storageKey: string }>(
      (resolve) => {
        resolveConversion = () =>
          resolve({ success: true, status: "ready", storageKey: "some-key" });
      },
    );

    // Directly test inFlightConversions map behavior
    (converter as unknown as { inFlightConversions: Map<string, unknown> }).inFlightConversions.set(
      projId,
      fakePromise,
    );

    const call1 = converter.convertPptxToPdf({ organizationId: orgId, projectId: projId });
    const call2 = converter.convertPptxToPdf({ organizationId: orgId, projectId: projId });

    resolveConversion();

    const [r1, r2] = await Promise.all([call1, call2]);
    expect(r1).toEqual(r2);
  });

  it("stores failure in Failure Cache with TTL and prevents repetitive conversion runs", async () => {
    const converter = new PresentationPdfConverter({
      storageProvider: storage,
      failureTtlMs: 60_000, // 60s TTL
    });

    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(true);

    // Simulate convert with missing storage key
    const res = await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
      pptxStorageKey: "non-existent-key.pptx",
    });

    expect(res.success).toBe(false);
    expect(res.status).toBe("failed");

    // Immediate getStatus should reflect failed state with retryAfterSeconds
    const status = await converter.getStatus(orgId, projId);
    expect(status.status).toBe("failed");
    expect(status.error).toContain("Original PPTX file not found");
    expect(status.retryAfterSeconds).toBeGreaterThan(0);

    // Second convert attempt should return cached failure without re-running
    const res2 = await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
      pptxStorageKey: "non-existent-key.pptx",
    });
    expect(res2.success).toBe(false);
    expect(res2.status).toBe("failed");
    expect(res2.retryAfterSeconds).toBeDefined();
  });

  it("invalidates failure cache when source file changes", async () => {
    const converter = new PresentationPdfConverter({
      storageProvider: storage,
      failureTtlMs: 60_000,
    });

    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(true);

    await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
      pptxStorageKey: "file-v1.pptx",
    });

    // Same file returns failed
    const status1 = await converter.getStatus(orgId, projId, "file-v1.pptx");
    expect(status1.status).toBe("failed");

    // Different file invalidates failure cache and reports pending
    const status2 = await converter.getStatus(orgId, projId, "file-v2.pptx");
    expect(status2.status).toBe("pending");
  });

  it("allows retry after failure TTL expires", async () => {
    vi.useFakeTimers();
    const converter = new PresentationPdfConverter({
      storageProvider: storage,
      failureTtlMs: 10_000, // 10s TTL
    });

    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(true);

    await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
      pptxStorageKey: "missing.pptx",
    });

    const statusImmediate = await converter.getStatus(orgId, projId);
    expect(statusImmediate.status).toBe("failed");

    // Advance past TTL (11 seconds)
    vi.advanceTimersByTime(11_000);

    const statusAfterTtl = await converter.getStatus(orgId, projId);
    expect(statusAfterTtl.status).toBe("pending");
  });

  it("returns pending status when LibreOffice is available and conversion has not run yet", async () => {
    const converter = new PresentationPdfConverter({ storageProvider: storage });
    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(true);

    const status = await converter.getStatus(orgId, projId);
    expect(status.status).toBe("pending");
  });

  it("rejects invalid PDF output missing %PDF- signature and marks conversion as failed", async () => {
    const mockExecFile = ((
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const outDirIdx = args.indexOf("--outdir");
      const outDir = args[outDirIdx + 1];
      const pdfPath = path.join(outDir, "presentation.pdf");
      // Write corrupted output file without %PDF-
      fs.writeFile(pdfPath, Buffer.from("NOT_A_PDF_FILE_CONTENT")).then(() => {
        cb(null, "", "");
      });
      return {} as ReturnType<typeof childProcess.execFile>;
    }) as unknown as typeof childProcess.execFile;

    const converter = new PresentationPdfConverter({
      storageProvider: storage,
      execFileFn: mockExecFile,
    });
    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(true);

    const result = await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
      pptxBuffer: Buffer.from("PK test"),
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("missing %PDF- signature");

    // Invalid file must NOT be saved to storage
    const saved = await converter.isPdfReady(orgId, projId);
    expect(saved).toBe(false);

    // Failure must be cached
    const status = await converter.getStatus(orgId, projId);
    expect(status.status).toBe("failed");
  });

  it("successfully saves valid PDF output matching %PDF- signature", async () => {
    const mockExecFile = ((
      _cmd: string,
      args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const outDirIdx = args.indexOf("--outdir");
      const outDir = args[outDirIdx + 1];
      const pdfPath = path.join(outDir, "presentation.pdf");
      // Write valid PDF output
      fs.writeFile(pdfPath, Buffer.from("%PDF-1.4\nvalid pdf content")).then(() => {
        cb(null, "", "");
      });
      return {} as ReturnType<typeof childProcess.execFile>;
    }) as unknown as typeof childProcess.execFile;

    const converter = new PresentationPdfConverter({
      storageProvider: storage,
      execFileFn: mockExecFile,
    });
    vi.spyOn(converter, "isLibreOfficeAvailable").mockResolvedValue(true);

    const result = await converter.convertPptxToPdf({
      organizationId: orgId,
      projectId: projId,
      pptxBuffer: Buffer.from("PK test"),
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("ready");

    // File MUST be saved in storage
    const saved = await converter.isPdfReady(orgId, projId);
    expect(saved).toBe(true);

    const status = await converter.getStatus(orgId, projId);
    expect(status.status).toBe("ready");
  });
});
