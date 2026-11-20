import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type Role,
  type PresentationReferenceType,
  asDocumentId,
  asPresentationProjectId,
  asPresentationReferenceId,
  DomainError,
  type PresentationReferenceRecord,
} from "@avana/domain";
import type {
  PresentationReferenceResource,
  PresentationReferenceResponse,
  PresentationReferenceListResponse,
  CreatePresentationReferenceRequest,
  UpdatePresentationReferenceRequest,
} from "@avana/contracts";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { PresentationReferenceService } from "./presentation-reference-service.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import { isPdf } from "../documents/extraction/pdf-extractor.js";
import { selectExtractor } from "../documents/extraction/extractor-registry.js";

export interface PresentationReferenceRouteOptions {
  service: PresentationReferenceService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  storageProvider?: StorageProvider;
}

// Magic bytes for ZIP packages (DOCX / OpenXML): 'PK\x03\x04'
const ZIP_MAGIC_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_REFERENCE_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function mapReferenceToResource(
  record: PresentationReferenceRecord,
): PresentationReferenceResource {
  return {
    id: record.id,
    project_id: record.projectId,
    document_id: record.documentId,
    type: record.type,
    title: record.title,
    source_identifier: record.sourceIdentifier,
    access_status: record.accessStatus,
    bibliographic_metadata: record.bibliographicMetadata,
    extracted_content: record.extractedContent,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export const presentationReferenceRoutes: FastifyPluginAsync<
  PresentationReferenceRouteOptions
> = async (app, opts) => {
  const { sessionService, userStore, service } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: {
        userId?: string;
        id?: string;
        role?: string;
        globalRole?: string | null;
      };
    };
    const user = reqAny.user;
    const uid = user?.userId ?? user?.id;
    if (!uid) {
      throw new DomainError("unauthorized", "User is not authenticated");
    }
    return {
      userId: uid as Actor["userId"],
      role: (user?.role ?? "student") as Actor["role"],
      globalRole: (user?.globalRole as Role) ?? null,
    };
  }

  // 1. POST /v1/presentation/projects/:projectId/references
  app.post<{
    Params: { projectId: string };
    Body: CreatePresentationReferenceRequest;
  }>(
    "/v1/presentation/projects/:projectId/references",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);
      const body = request.body;

      if (!body || !body.type || !body.title) {
        throw new DomainError(
          "bad_request",
          "Reference type and title are required",
        );
      }

      const reference = await service.addReference(actor, projectId, {
        type: body.type,
        title: body.title,
        sourceIdentifier: body.source_identifier,
        documentId: body.document_id ? asDocumentId(body.document_id) : null,
        bibliographicMetadata: body.bibliographic_metadata,
        extractedContent: body.extracted_content,
      });

      const response: PresentationReferenceResponse = {
        reference: mapReferenceToResource(reference),
      };

      return reply.status(201).send(response);
    },
  );

  // 1b. POST /v1/presentation/projects/:projectId/references/upload
  // Multipart upload of real scientific source file (PDF, Word, TXT)
  app.post<{
    Params: { projectId: string };
  }>(
    "/v1/presentation/projects/:projectId/references/upload",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      let part;
      try {
        part = await request.file();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Invalid multipart request";
        throw new DomainError("bad_request", `Multipart upload error: ${msg}`);
      }

      if (!part) {
        throw new DomainError("bad_request", "فایل جهت بارگذاری ارسال نشده است.");
      }

      if (part.file?.truncated || (part as unknown as { truncated?: boolean }).truncated) {
        throw new DomainError(
          "bad_request",
          "حجم فایل بیش از سقف مجاز (۵۰ مگابایت) است یا فرایند آپلود قطع شده است.",
        );
      }

      const fileBuffer = await part.toBuffer();

      if (fileBuffer.length > MAX_REFERENCE_FILE_SIZE) {
        throw new DomainError(
          "bad_request",
          "حجم فایل بیش از سقف مجاز ۵۰ مگابایت است.",
        );
      }

      if (fileBuffer.length === 0) {
        throw new DomainError("bad_request", "فایل ارسالی خالی است.");
      }

      const originalFilename = part.filename || "scientific-document.pdf";
      const filenameLower = originalFilename.toLowerCase();

      // Deep inspection of file signatures & MIME validation
      const isPdfFormat = isPdf(fileBuffer);
      const isZipFormat = fileBuffer.length >= 4 && fileBuffer.subarray(0, 4).equals(ZIP_MAGIC_HEADER);
      const isTextFormat =
        filenameLower.endsWith(".txt") ||
        filenameLower.endsWith(".md") ||
        (part.mimetype && part.mimetype.startsWith("text/"));

      let mimeType: string;
      let refType: PresentationReferenceType;

      if (isPdfFormat) {
        mimeType = "application/pdf";
        refType = "pdf";
      } else if (isZipFormat && (filenameLower.endsWith(".docx") || filenameLower.endsWith(".doc") || !filenameLower.includes("."))) {
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        refType = "docx";
      } else if (isTextFormat) {
        mimeType = "text/plain";
        refType = "text";
      } else {
        throw new DomainError(
          "bad_request",
          "فرمت فایل نامعتبر است. فرمت‌های مجاز برای مراجع علمی شامل PDF، سند Word (.docx) و فایل متنی معتبر می‌باشند.",
        );
      }

      // Extract text content and metadata using AVANA extractors
      let extraction;
      try {
        const extractor = selectExtractor(mimeType);
        extraction = await extractor.extract({
          data: fileBuffer,
          mimeType,
          originalName: originalFilename,
        });
      } catch (extractErr) {
        const msg = extractErr instanceof Error ? extractErr.message : String(extractErr);
        throw new DomainError(
          "bad_request",
          `پردازش و استخراج متن سند علمی با خطا مواجه شد: ${msg}`,
        );
      }

      // Clean fallback from filename
      const cleanFallbackTitle = originalFilename
        .replace(/\.[a-zA-Z0-9]+$/i, "")
        .replace(/[-_]+/g, " ")
        .trim();

      // Best-effort document title detection
      let detectedTitle: string | null = null;
      if (extraction.metadata?.title && typeof extraction.metadata.title === "string") {
        const trimmed = extraction.metadata.title.trim();
        const trimmedNorm = trimmed.toLowerCase().replace(/[-_]+/g, " ");
        const fallbackNorm = cleanFallbackTitle.toLowerCase();
        if (
          trimmed.length >= 3 &&
          !trimmed.toLowerCase().endsWith(".pdf") &&
          !trimmed.toLowerCase().endsWith(".docx") &&
          !trimmed.toLowerCase().includes("untitled") &&
          trimmedNorm !== fallbackNorm
        ) {
          detectedTitle = trimmed;
        }
      }

      // Fallback: examine first lines of first page
      if (!detectedTitle && extraction.pages.length > 0) {
        const firstPageText = extraction.pages[0].rawText.trim();
        const candidateLine = firstPageText
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.length >= 5 && l.length <= 160 && !/^(page\s*\d|http|doi:)/i.test(l));
        if (candidateLine) {
          detectedTitle = candidateLine;
        }
      }

      const finalTitle = detectedTitle || cleanFallbackTitle || "سند علمی بارگذاری‌شده";

      // Best-effort bibliographic metadata extraction (DOI, PMID, Publication Year)
      const sampleText = extraction.pages
        .slice(0, 3)
        .map((p) => p.rawText)
        .join("\n");

      const doiMatch = sampleText.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/);
      const detectedDoi = doiMatch ? doiMatch[1].replace(/[.,;)]+$/, "") : null;

      const pmidMatch = sampleText.match(/(?:PMID|PubMed ID)[:\s]*(\d{5,9})\b/i);
      const detectedPmid = pmidMatch ? pmidMatch[1] : null;

      const yearMatch = sampleText.match(/\b(19\d{2}|20[0-2]\d)\b/);
      const detectedYear = yearMatch ? parseInt(yearMatch[1], 10) : null;

      const bibliographicMetadata: Record<string, unknown> = {
        originalFileName: originalFilename,
        fileSizeBytes: fileBuffer.length,
        mimeType,
        pageCount: extraction.pages.length,
        characterCount: extraction.pages.reduce((acc, p) => acc + p.characterCount, 0),
        extractedTitle: detectedTitle,
        detectedDoi,
        detectedPmid,
        detectedYear,
        identificationConfidence: detectedDoi || detectedPmid ? "tentative_identifier" : "extracted_from_document",
        importedAt: new Date().toISOString(),
      };

      // Optional persistence in storage provider
      if (opts.storageProvider) {
        const safeName = originalFilename.replace(/[^\x20-\x7E]/g, "_");
        const storageKey = `presentations/references/${randomUUID()}-${safeName}`;
        try {
          await opts.storageProvider.save({
            storageKey,
            data: fileBuffer,
            mimeType,
          });
          bibliographicMetadata.storageKey = storageKey;
        } catch {
          // Non-fatal
        }
      }

      // Concatenate extracted content safely (bounded to 60,000 chars for prompt budgeting)
      const fullText = extraction.pages
        .map((p) => p.rawText.trim())
        .filter(Boolean)
        .join("\n\n");

      const extractedContent = fullText.length > 60000 ? fullText.slice(0, 60000) : fullText;

      // Add reference record to presentation project
      const reference = await service.addReference(actor, projectId, {
        type: refType,
        title: finalTitle,
        sourceIdentifier: originalFilename,
        bibliographicMetadata,
        extractedContent: extractedContent || null,
      });

      const response: PresentationReferenceResponse = {
        reference: mapReferenceToResource(reference),
      };

      return reply.status(201).send(response);
    },
  );

  // 2. GET /v1/presentation/projects/:projectId/references
  app.get<{
    Params: { projectId: string };
  }>(
    "/v1/presentation/projects/:projectId/references",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      const references = await service.listReferences(actor, projectId);

      const response: PresentationReferenceListResponse = {
        items: references.map(mapReferenceToResource),
        total: references.length,
      };

      return reply.status(200).send(response);
    },
  );

  // 3. GET /v1/presentation/projects/:projectId/references/:referenceId
  app.get<{
    Params: { projectId: string; referenceId: string };
  }>(
    "/v1/presentation/projects/:projectId/references/:referenceId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);
      const referenceId = asPresentationReferenceId(
        request.params.referenceId,
      );

      const reference = await service.getReference(
        actor,
        projectId,
        referenceId,
      );

      const response: PresentationReferenceResponse = {
        reference: mapReferenceToResource(reference),
      };

      return reply.status(200).send(response);
    },
  );

  // 4. PATCH /v1/presentation/projects/:projectId/references/:referenceId
  app.patch<{
    Params: { projectId: string; referenceId: string };
    Body: UpdatePresentationReferenceRequest;
  }>(
    "/v1/presentation/projects/:projectId/references/:referenceId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);
      const referenceId = asPresentationReferenceId(
        request.params.referenceId,
      );
      const body = request.body ?? {};

      const updated = await service.updateReference(
        actor,
        projectId,
        referenceId,
        {
          title: body.title,
          sourceIdentifier: body.source_identifier,
          bibliographicMetadata: body.bibliographic_metadata,
          extractedContent: body.extracted_content,
        },
      );

      const response: PresentationReferenceResponse = {
        reference: mapReferenceToResource(updated),
      };

      return reply.status(200).send(response);
    },
  );

  // 5. DELETE /v1/presentation/projects/:projectId/references/:referenceId
  app.delete<{
    Params: { projectId: string; referenceId: string };
  }>(
    "/v1/presentation/projects/:projectId/references/:referenceId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);
      const referenceId = asPresentationReferenceId(
        request.params.referenceId,
      );

      await service.deleteReference(actor, projectId, referenceId);

      return reply.status(204).send();
    },
  );
};
