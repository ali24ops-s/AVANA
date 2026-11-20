/**
 * Presentation PPTX Import Service.
 *
 * Implements Phase 2-A:
 * - Validates uploaded PPTX files (magic bytes, size, ZIP structure, macros).
 * - Persists original presentation file via StorageProvider.
 * - Extracts slides, hierarchical text, tables, original speaker notes, and media.
 * - Creates PresentationProject and PresentationSlide records in strict order.
 * - Preserves original slide rawText and speakerNotes without AI distortion.
 * - Automatic atomic cleanup of stored files on extraction/persistence failure.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type PresentationSlideRecord,
  type TargetDurationMinutes,
  type PresentationAcademicLevel,
  type PresentationTone,
  type PresentationElaborationDepth,
  asOrganizationId,
  DomainError,
} from "@avana/domain";
import type {
  PresentationProjectStore,
  PresentationSlideStore,
} from "./presentation-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import type { PresentationPdfConverter } from "./presentation-pdf-converter.js";
import {
  extractPresentationFromPptx,
  MAX_PPTX_FILE_SIZE,
  PPTX_MIME_TYPE,
} from "../documents/extraction/pptx-extractor.js";
import { ExtractionError } from "../documents/extraction/types.js";

// ZIP Local File Header magic bytes: 'PK\x03\x04'
const ZIP_MAGIC_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface PptxImportOptions {
  title?: string | null;
  organizationId?: string | null;
  targetDurationMinutes?: TargetDurationMinutes;
  academicLevel?: PresentationAcademicLevel;
  tone?: PresentationTone;
  elaborationDepth?: PresentationElaborationDepth;
}

export interface PptxImportResult {
  project: PresentationProjectRecord;
  slides: PresentationSlideRecord[];
}

export interface PresentationImportLogger {
  warn(obj: Record<string, unknown>, msg?: string): void;
  error?(obj: Record<string, unknown>, msg?: string): void;
  info?(obj: Record<string, unknown>, msg?: string): void;
}

export interface PresentationImportServiceDeps {
  projectStore: PresentationProjectStore;
  slideStore: PresentationSlideStore;
  organizationStore: OrganizationStore;
  storageProvider: StorageProvider;
  pdfConverter?: PresentationPdfConverter;
  maxFileSize?: number;
  logger?: PresentationImportLogger;
}

export class PresentationImportService {
  private readonly maxFileSize: number;

  constructor(private readonly deps: PresentationImportServiceDeps) {
    this.maxFileSize = deps.maxFileSize ?? MAX_PPTX_FILE_SIZE;
  }

  /**
   * Log structured cleanup failures without leaking sensitive contents.
   */
  private logCleanupFailure(
    operation: "delete_pptx_file" | "delete_media_file" | "delete_slides" | "delete_project",
    targetKey: string,
    err: unknown,
    context?: { projectId?: string; uploadId?: string },
  ): void {
    const errorMsg = err instanceof Error ? err.message : String(err);
    this.deps.logger?.warn(
      {
        module: "presentation-import",
        operation,
        targetKey,
        projectId: context?.projectId,
        uploadId: context?.uploadId,
        error: errorMsg,
      },
      `Failed to clean up storage or DB item during import error handling: ${targetKey}`,
    );
  }

  /**
   * Validate and import a PPTX file into a new PresentationProject.
   */
  async importFromPptx(
    actor: Actor,
    file: {
      data: Buffer;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    },
    options?: PptxImportOptions,
  ): Promise<PptxImportResult> {
    // 1. File size pre-check
    if (file.sizeBytes > this.maxFileSize || file.data.length > this.maxFileSize) {
      throw new DomainError(
        "bad_request",
        `PPTX file size (${Math.round(file.sizeBytes / 1024 / 1024)}MB) exceeds maximum allowed limit (${Math.round(this.maxFileSize / 1024 / 1024)}MB)`,
      );
    }

    if (file.data.length === 0) {
      throw new DomainError("bad_request", "Uploaded PPTX file is empty");
    }

    // 2. MIME & Extension validation
    const lowerName = file.originalName.toLowerCase();
    if (!lowerName.endsWith(".pptx")) {
      throw new DomainError(
        "bad_request",
        "Invalid file extension. Only .pptx files are supported",
      );
    }

    // 3. Deep Magic Bytes inspection (ZIP package header)
    if (
      file.data.length < 4 ||
      !file.data.subarray(0, 4).equals(ZIP_MAGIC_HEADER)
    ) {
      throw new DomainError(
        "bad_request",
        "Corrupted or invalid PPTX file: missing valid ZIP package signature",
      );
    }

    // 4. Resolve & authorize tenant organization
    const targetOrgId = await this.resolveTargetOrganization(
      actor,
      options?.organizationId,
    );

    const uploadId = randomUUID();
    let projectId: PresentationProjectId | undefined;
    let storageKey: string | undefined;
    const savedMediaKeys: string[] = [];

    try {
      // 5. Extract PPTX structure, slides, notes, tables, and media
      const presentation = await extractPresentationFromPptx(file.data, {
        saveMedia: async (slideIndex, visual) => {
          if (!visual.buffer) return undefined;
          const mediaKey = `presentations/org-${targetOrgId}/uploads/${uploadId}/media/s${slideIndex}-${visual.mediaFileName}`;
          await this.deps.storageProvider.save({
            storageKey: mediaKey,
            data: visual.buffer,
            mimeType: visual.mimeType,
          });
          savedMediaKeys.push(mediaKey);
          return mediaKey;
        },
      });

      if (presentation.slides.length === 0) {
        throw new DomainError(
          "bad_request",
          "PowerPoint presentation contains no slides",
        );
      }

      // 6. Determine project title
      let projectTitle = options?.title?.trim();
      if (!projectTitle && presentation.title) {
        projectTitle = presentation.title.trim();
      }
      if (!projectTitle) {
        // Fallback to filename without extension
        projectTitle = file.originalName.replace(/\.pptx$/i, "").trim() || "Untitled Presentation";
      }

      // Truncate to maximum db length
      if (projectTitle.length > 255) {
        projectTitle = projectTitle.slice(0, 255);
      }

      // 7. Save original PPTX file into StorageProvider
      storageKey = `presentations/org-${targetOrgId}/uploads/${uploadId}/${randomUUID()}.pptx`;
      await this.deps.storageProvider.save({
        storageKey,
        data: file.data,
        mimeType: PPTX_MIME_TYPE,
      });

      // 8. Persist PresentationProject
      const project = await this.deps.projectStore.create({
        organizationId: targetOrgId,
        ownerUserId: actor.userId,
        title: projectTitle,
        pptxDocumentId: null, // Zero-migration: raw PPTX path stored in project metadata if needed
        targetDurationMinutes: options?.targetDurationMinutes ?? 15,
        academicLevel: options?.academicLevel ?? "intermediate",
        tone: options?.tone ?? "formal_scientific",
        elaborationDepth: options?.elaborationDepth ?? "balanced",
      });

      projectId = project.id;

      // Update totalSlides count
      await this.deps.projectStore.update(projectId, {
        totalSlides: presentation.totalSlides,
        status: "created",
      });

      // 10. Persist PresentationSlides in strict canonical order
      const createdSlides: PresentationSlideRecord[] = [];

      for (let i = 0; i < presentation.slides.length; i++) {
        const slide = presentation.slides[i];

        const mediaStorageKeys = slide.visuals
          .map((v) => v.storageKey)
          .filter((k): k is string => typeof k === "string");

        const visualSummary = slide.visuals.length > 0
          ? `${slide.visuals.length} embedded media: ${slide.visuals.map((v) => v.mediaFileName).join(", ")}`
          : null;

        const slideRecord = await this.deps.slideStore.createSlide({
          projectId,
          slideIndex: slide.slideIndex,
          title: slide.title,
          rawText: slide.rawText,
          speakerNotes: slide.speakerNotes,
          hasVisuals: slide.visuals.length > 0,
          visualSummary,
        });

        // Enrich extraction_metadata with structural details
        const enrichedMetadata = {
          importedFromPptx: true,
          originalSlideIndex: slide.slideIndex,
          textBlockCount: slide.textBlocks.length,
          textBlocks: slide.textBlocks,
          tableCount: slide.tables.length,
          extractedTables: slide.tables,
          visualCount: slide.visuals.length,
          mediaStorageKeys,
          hasOriginalSpeakerNotes: Boolean(slide.speakerNotes),
          unsupportedContent: slide.unsupportedContent,
          importedAt: new Date().toISOString(),
          originalFile: {
            name: file.originalName,
            storageKey,
            sizeBytes: file.sizeBytes,
          },
        };

        const updatedSlide = await this.deps.slideStore.updateSlide(
          slideRecord.id,
          projectId,
          {
            extractedTables: slide.tables,
            mediaStorageKeys,
            extractionMetadata: enrichedMetadata,
          },
        );

        createdSlides.push(updatedSlide);
      }

      const finalProject = (await this.deps.projectStore.findById(projectId)) ?? project;

      // 12. Trigger non-blocking asynchronous background PDF conversion
      if (this.deps.pdfConverter && storageKey) {
        this.deps.pdfConverter
          .convertPptxToPdf({
            organizationId: targetOrgId,
            projectId,
            pptxStorageKey: storageKey,
            pptxBuffer: file.data,
          })
          .catch((err) => {
            this.deps.logger?.warn?.(
              {
                module: "presentation-import",
                projectId,
                error: err instanceof Error ? err.message : String(err),
              },
              "Background PDF conversion trigger failed",
            );
          });
      }

      return {
        project: finalProject,
        slides: createdSlides,
      };
    } catch (err) {
      // 11. Cleanup stored files on extraction / persistence failure
      if (storageKey) {
        await this.deps.storageProvider.delete(storageKey).catch((cleanupErr: unknown) => {
          this.logCleanupFailure("delete_pptx_file", storageKey!, cleanupErr, { projectId, uploadId });
        });
      }
      for (const mKey of savedMediaKeys) {
        await this.deps.storageProvider.delete(mKey).catch((cleanupErr: unknown) => {
          this.logCleanupFailure("delete_media_file", mKey, cleanupErr, { projectId, uploadId });
        });
      }

      // Hard-delete project and partial slides so zero orphan data remains
      if (projectId) {
        await this.deps.slideStore.deleteByProjectId(projectId).catch((cleanupErr: unknown) => {
          this.logCleanupFailure("delete_slides", projectId!, cleanupErr, { projectId, uploadId });
        });
        await this.deps.projectStore.delete(projectId).catch((cleanupErr: unknown) => {
          this.logCleanupFailure("delete_project", projectId!, cleanupErr, { projectId, uploadId });
        });
      }

      if (err instanceof ExtractionError) {
        throw new DomainError("bad_request", `PPTX extraction error: ${err.message}`);
      }

      if (err instanceof DomainError) {
        throw err;
      }

      const msg = err instanceof Error ? err.message : String(err);
      throw new DomainError("bad_request", `Failed to process PPTX file: ${msg}`);
    }
  }

  /**
   * Resolve and authorize tenant organization for project creation.
   */
  private async resolveTargetOrganization(
    actor: Actor,
    requestedOrgId?: string | null,
  ): Promise<OrganizationId> {
    const memberships = await this.deps.organizationStore.listMembershipsByUserId(
      actor.userId,
    );

    if (requestedOrgId) {
      const orgId = asOrganizationId(requestedOrgId);
      const isMember = memberships?.some((m) => m.organizationId === orgId);
      if (
        !isMember &&
        actor.globalRole !== "platform_admin" &&
        actor.role !== "platform_admin"
      ) {
        throw new DomainError(
          "forbidden",
          "User is not a member of the requested organization",
        );
      }
      return orgId;
    }

    if (!memberships || memberships.length === 0) {
      throw new DomainError(
        "bad_request",
        "User does not belong to any organization to create presentation projects",
      );
    }

    return memberships[0].organizationId;
  }
}
