/**
 * Presentation PDF Converter Service.
 *
 * Converts PowerPoint (.pptx) files to PDF using headless LibreOffice (soffice).
 *
 * Key Design Guarantees:
 * 1. Background & Non-blocking: Conversion runs asynchronously; failures never
 *    block the presentation import flow or AI speech generation.
 * 2. Deduplication & Idempotency: Uses fixed deterministic storage keys per project
 *    and deduplicates concurrent conversion requests for the same project.
 * 3. Concurrency Control: Uses an in-process semaphore to limit simultaneous
 *    LibreOffice instances (default max: 2), protecting system memory & CPU.
 * 4. Graceful Degradation: If LibreOffice is not installed, times out, or encounters
 *    a password-protected/corrupt PPTX, the service logs structured details and
 *    returns an explicit failure status without crashing the process.
 * 5. Secure Temp Handling & Profile Isolation: Uses isolated temporary folders and
 *    independent `-env:UserInstallation` profiles cleaned up in `finally`.
 * 6. Failure Caching: Prevents repetitive failed conversion runs on every poll
 *    using a time-to-live (TTL) failure cache, with automatic invalidation on source file changes.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { StorageProvider } from "../storage/storage-provider.js";

const PDF_MAGIC_HEADER = Buffer.from("%PDF-");

export type PdfConversionStatus =
  | "ready"
  | "processing"
  | "failed"
  | "unavailable"
  | "pending";

export interface FailedConversionRecord {
  timestamp: number;
  error: string;
  sourceFileKey?: string;
}

export interface PdfConversionResult {
  success: boolean;
  status: PdfConversionStatus;
  storageKey?: string;
  error?: string;
  cached?: boolean;
  retryAfterSeconds?: number;
}

export interface PresentationPdfConverterDeps {
  storageProvider: StorageProvider;
  logger?: {
    info(obj: Record<string, unknown>, msg?: string): void;
    warn(obj: Record<string, unknown>, msg?: string): void;
    error(obj: Record<string, unknown>, msg?: string): void;
  };
  sofficeCommand?: string;
  maxConcurrentConversions?: number;
  conversionTimeoutMs?: number;
  failureTtlMs?: number;
  execFileFn?: typeof execFile;
}

export class PresentationPdfConverter {
  private readonly maxConcurrent: number;
  private readonly timeoutMs: number;
  private readonly failureTtlMs: number;
  private readonly execFileFn: typeof execFile;
  private currentActiveConversions = 0;
  private readonly waitQueue: Array<() => void> = [];
  private readonly inFlightConversions = new Map<string, Promise<PdfConversionResult>>();
  private readonly failureCache = new Map<string, FailedConversionRecord>();
  private detectedSofficeCmd: string | null | undefined = undefined;

  constructor(private readonly deps: PresentationPdfConverterDeps) {
    this.maxConcurrent = deps.maxConcurrentConversions ?? 2;
    this.timeoutMs = deps.conversionTimeoutMs ?? 45_000;
    this.failureTtlMs = deps.failureTtlMs ?? 5 * 60 * 1000; // 5 minutes default TTL
    this.execFileFn = deps.execFileFn ?? execFile;
    if (deps.sofficeCommand) {
      this.detectedSofficeCmd = deps.sofficeCommand;
    }
  }

  /**
   * Deterministic storage key for the converted PDF of a presentation project.
   */
  public getPdfStorageKey(organizationId: string, projectId: string): string {
    return `presentations/org-${organizationId}/projects/${projectId}/slides.pdf`;
  }

  /**
   * Check whether the converted PDF is already available in storage.
   */
  public async isPdfReady(organizationId: string, projectId: string): Promise<boolean> {
    const pdfKey = this.getPdfStorageKey(organizationId, projectId);
    return this.deps.storageProvider.exists(pdfKey);
  }

  /**
   * Clean expired entries from failure cache to avoid unbounded memory growth.
   */
  private pruneExpiredFailures(): void {
    const now = Date.now();
    for (const [key, record] of this.failureCache.entries()) {
      if (now - record.timestamp > this.failureTtlMs) {
        this.failureCache.delete(key);
      }
    }
  }

  /**
   * Explicitly invalidate cached failure for a project (e.g. on force-retry).
   */
  public clearFailure(projectId: string): void {
    this.failureCache.delete(projectId);
  }

  /**
   * Get current PDF status for a project with strict precedence:
   * 1. ready: valid PDF exists in storage
   * 2. processing: conversion is actively running
   * 3. failed: previously failed within TTL (with retryAfterSeconds)
   * 4. unavailable: LibreOffice is not installed/executable
   * 5. pending: ready to convert on-demand
   */
  public async getStatus(
    organizationId: string,
    projectId: string,
    sourceFileKey?: string,
  ): Promise<{
    status: PdfConversionStatus;
    storageKey?: string;
    error?: string;
    retryAfterSeconds?: number;
  }> {
    // 1. Ready
    const isReady = await this.isPdfReady(organizationId, projectId);
    if (isReady) {
      this.failureCache.delete(projectId);
      return {
        status: "ready",
        storageKey: this.getPdfStorageKey(organizationId, projectId),
      };
    }

    // 2. Processing
    if (this.inFlightConversions.has(projectId)) {
      return { status: "processing" };
    }

    // 3. Failed (within TTL)
    this.pruneExpiredFailures();
    const failure = this.failureCache.get(projectId);
    if (failure) {
      // Invalidate if source file changed
      if (sourceFileKey && failure.sourceFileKey && sourceFileKey !== failure.sourceFileKey) {
        this.failureCache.delete(projectId);
      } else {
        const elapsed = Date.now() - failure.timestamp;
        if (elapsed < this.failureTtlMs) {
          const retryAfterSeconds = Math.max(1, Math.ceil((this.failureTtlMs - elapsed) / 1000));
          return {
            status: "failed",
            error: failure.error,
            retryAfterSeconds,
          };
        } else {
          this.failureCache.delete(projectId);
        }
      }
    }

    // 4. Unavailable
    const available = await this.isLibreOfficeAvailable();
    if (!available) {
      return {
        status: "unavailable",
        error: "LibreOffice is not installed on the server environment.",
      };
    }

    // 5. Pending
    return { status: "pending" };
  }

  /**
   * Check if a working LibreOffice / soffice binary is installed and executable across
   * macOS, Linux, and Windows standard locations.
   */
  public async isLibreOfficeAvailable(): Promise<boolean> {
    if (this.detectedSofficeCmd !== undefined) {
      return this.detectedSofficeCmd !== null;
    }

    const candidates = [
      "soffice",
      "libreoffice",
      "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      "/usr/bin/soffice",
      "/usr/local/bin/soffice",
    ];

    for (const cmd of candidates) {
      const ok = await new Promise<boolean>((resolve) => {
        this.execFileFn(cmd, ["--version"], { timeout: 5000 }, (err) => {
          resolve(!err);
        });
      });
      if (ok) {
        this.detectedSofficeCmd = cmd;
        return true;
      }
    }

    this.detectedSofficeCmd = null;
    this.deps.logger?.warn?.(
      { module: "presentation-pdf-converter" },
      "LibreOffice (soffice) not found in system PATH or standard locations. Original PPTX rendering will fallback to text mode until LibreOffice is installed.",
    );
    return false;
  }

  /**
   * Acquire concurrency slot.
   */
  private async acquireSlot(): Promise<void> {
    if (this.currentActiveConversions < this.maxConcurrent) {
      this.currentActiveConversions++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
    this.currentActiveConversions++;
  }

  /**
   * Release concurrency slot.
   */
  private releaseSlot(): void {
    this.currentActiveConversions = Math.max(0, this.currentActiveConversions - 1);
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Convert PPTX to PDF in the background or on-demand.
   *
   * Guarantees:
   * - Deduplication: Concurrent requests for the same project share the exact same Promise.
   * - Isolated profile: Uses -env:UserInstallation with an isolated temporary directory.
   * - Failure cache: Failed attempts within TTL are not endlessly retried unless forceRetry is true.
   */
  public async convertPptxToPdf(params: {
    organizationId: string;
    projectId: string;
    pptxStorageKey?: string;
    pptxBuffer?: Buffer;
    forceRetry?: boolean;
  }): Promise<PdfConversionResult> {
    const { organizationId, projectId, pptxStorageKey, pptxBuffer, forceRetry } = params;
    const targetPdfKey = this.getPdfStorageKey(organizationId, projectId);

    // 1. Check if already exists in storage
    const exists = await this.deps.storageProvider.exists(targetPdfKey);
    if (exists) {
      this.failureCache.delete(projectId);
      return {
        success: true,
        status: "ready",
        storageKey: targetPdfKey,
        cached: true,
      };
    }

    // 2. Deduplication: Check if already converting in-flight
    const inFlight = this.inFlightConversions.get(projectId);
    if (inFlight) {
      return inFlight;
    }

    // 3. Check failure cache (unless forced)
    if (!forceRetry) {
      this.pruneExpiredFailures();
      const failure = this.failureCache.get(projectId);
      if (failure) {
        if (!pptxStorageKey || failure.sourceFileKey === pptxStorageKey) {
          const elapsed = Date.now() - failure.timestamp;
          if (elapsed < this.failureTtlMs) {
            const retryAfterSeconds = Math.max(1, Math.ceil((this.failureTtlMs - elapsed) / 1000));
            return {
              success: false,
              status: "failed",
              error: failure.error,
              retryAfterSeconds,
            };
          }
        }
        this.failureCache.delete(projectId);
      }
    } else {
      this.failureCache.delete(projectId);
    }

    // 4. Check LibreOffice availability
    const isAvailable = await this.isLibreOfficeAvailable();
    if (!isAvailable) {
      return {
        success: false,
        status: "unavailable",
        error: "LibreOffice is not installed on server.",
      };
    }

    const conversionPromise = (async (): Promise<PdfConversionResult> => {
      await this.acquireSlot();
      let tempDir: string | null = null;
      const startTime = Date.now();

      try {
        // Fetch PPTX bytes
        let fileData = pptxBuffer;
        if (!fileData && pptxStorageKey) {
          const existsPptx = await this.deps.storageProvider.exists(pptxStorageKey);
          if (!existsPptx) {
            const notFoundErr = `Original PPTX file not found in storage: ${pptxStorageKey}`;
            this.failureCache.set(projectId, {
              timestamp: Date.now(),
              error: notFoundErr,
              sourceFileKey: pptxStorageKey,
            });
            return {
              success: false,
              status: "failed",
              error: notFoundErr,
            };
          }
          fileData = await this.deps.storageProvider.read(pptxStorageKey);
        }

        if (!fileData || fileData.length === 0) {
          const emptyErr = "No PPTX data available for PDF conversion";
          this.failureCache.set(projectId, {
            timestamp: Date.now(),
            error: emptyErr,
            sourceFileKey: pptxStorageKey,
          });
          return {
            success: false,
            status: "failed",
            error: emptyErr,
          };
        }

        // Setup temporary directories with isolated user profile
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-pptx-pdf-"));
        const profileDir = path.join(tempDir, "profile");
        const outDir = path.join(tempDir, "out");
        await fs.mkdir(profileDir, { recursive: true });
        await fs.mkdir(outDir, { recursive: true });

        const tempPptxPath = path.join(tempDir, "presentation.pptx");
        const tempPdfPath = path.join(outDir, "presentation.pdf");

        await fs.writeFile(tempPptxPath, fileData);

        const cmd = this.detectedSofficeCmd || "soffice";
        const profileUrl = pathToFileURL(profileDir).href;

        // Execute LibreOffice headless conversion with isolated profile
        await new Promise<void>((resolve, reject) => {
          const args = [
            "--headless",
            "--invisible",
            "--nologo",
            "--nodefault",
            `-env:UserInstallation=${profileUrl}`,
            "--convert-to",
            "pdf",
            "--outdir",
            outDir,
            tempPptxPath,
          ];

          this.execFileFn(
            cmd,
            args,
            { timeout: this.timeoutMs, maxBuffer: 10 * 1024 * 1024 },
            (error, _stdout, stderr) => {
              const durationMs = Date.now() - startTime;
              const stderrStr = (stderr || "").toString().trim();

              if (error) {
                const exitCode = typeof error.code === "number" ? error.code : null;
                const errorMsg = error.message;

                this.deps.logger?.warn?.(
                  {
                    module: "presentation-pdf-converter",
                    projectId,
                    exitCode,
                    durationMs,
                    stderr: stderrStr,
                    errorMessage: errorMsg,
                  },
                  `LibreOffice conversion process failed after ${durationMs}ms`,
                );

                const finalErrorDetail = stderrStr
                  ? `${errorMsg} (stderr: ${stderrStr})`
                  : errorMsg;

                return reject(new Error(`LibreOffice conversion failed: ${finalErrorDetail}`));
              }

              this.deps.logger?.info?.(
                {
                  module: "presentation-pdf-converter",
                  projectId,
                  durationMs,
                },
                `LibreOffice converted PPTX to PDF successfully in ${durationMs}ms`,
              );

              resolve();
            },
          );
        });

        // Verify PDF was generated and has valid %PDF- magic signature
        const pdfBytes = await fs.readFile(tempPdfPath);
        if (pdfBytes.length === 0) {
          throw new Error("Generated PDF file is empty");
        }
        if (
          pdfBytes.length < PDF_MAGIC_HEADER.length ||
          !pdfBytes.subarray(0, PDF_MAGIC_HEADER.length).equals(PDF_MAGIC_HEADER)
        ) {
          throw new Error("Generated file is not a valid PDF: missing %PDF- signature");
        }

        // Save PDF to StorageProvider
        await this.deps.storageProvider.save({
          storageKey: targetPdfKey,
          data: pdfBytes,
          mimeType: "application/pdf",
        });

        const totalDurationMs = Date.now() - startTime;
        this.deps.logger?.info?.(
          {
            module: "presentation-pdf-converter",
            projectId,
            pdfKey: targetPdfKey,
            sizeBytes: pdfBytes.length,
            durationMs: totalDurationMs,
          },
          "Successfully converted PPTX to PDF and saved to storage",
        );

        // Clear failure cache upon success
        this.failureCache.delete(projectId);

        return {
          success: true,
          status: "ready",
          storageKey: targetPdfKey,
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startTime;

        this.deps.logger?.warn?.(
          {
            module: "presentation-pdf-converter",
            projectId,
            durationMs,
            error: errorMsg,
          },
          `Failed to convert PPTX to PDF: ${errorMsg}`,
        );

        // Record in failure cache with source file key
        this.failureCache.set(projectId, {
          timestamp: Date.now(),
          error: errorMsg,
          sourceFileKey: pptxStorageKey,
        });

        return {
          success: false,
          status: "failed",
          error: errorMsg,
          retryAfterSeconds: Math.ceil(this.failureTtlMs / 1000),
        };
      } finally {
        this.releaseSlot();
        if (tempDir) {
          try {
            await fs.rm(tempDir, { recursive: true, force: true });
          } catch (cleanupErr) {
            this.deps.logger?.warn?.(
              { module: "presentation-pdf-converter", tempDir, error: String(cleanupErr) },
              "Failed to clean up temporary conversion directory",
            );
          }
        }
      }
    })();

    this.inFlightConversions.set(projectId, conversionPromise);

    conversionPromise.finally(() => {
      this.inFlightConversions.delete(projectId);
    });

    return conversionPromise;
  }
}
