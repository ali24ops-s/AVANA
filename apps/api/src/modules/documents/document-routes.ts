/**
 * Document upload + extraction HTTP routes.
 *
 * Per PR6-2 acceptance criteria:
 * - POST /v1/organizations/:organizationId/documents/upload-intent
 *   → Begin an upload (validate metadata, return storage key/intent)
 * - POST /v1/organizations/:organizationId/documents
 *   → Confirm an upload (multipart), persist file + metadata, dedupe by SHA256
 * - GET  /v1/organizations/:organizationId/documents
 *   → List documents (optionally scoped to the actor's uploads)
 * - GET  /v1/organizations/:organizationId/documents/:documentId
 *   → Get a single document (org-scoped, non-disclosing 404)
 * - DELETE /v1/organizations/:organizationId/documents/:documentId
 *   → Soft-delete a document and remove its file
 *
 * Per PR6-3 acceptance criteria:
 * - POST /v1/organizations/:organizationId/documents/:documentId/extract
 *   → Trigger text extraction (worker-ready processing service)
 * - GET  /v1/organizations/:organizationId/documents/:documentId/status
 *   → Return extraction lifecycle state, page/chunk counts, errors, retries
 *
 * Authorization is delegated to the DocumentService / DocumentProcessingService
 * via the domain policy.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
  type DocumentId,
  type OrganizationId,
  parseDocumentId,
  defaultPolicy,
} from "@avana/domain";
import { DocumentService } from "./document-service.js";
import type { DocumentListFilter } from "./document-service.js";
import { DocumentProcessingService } from "./document-processing-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type {
  DocumentStore,
  DocumentChunkStore,
  ModuleStore,
  LessonStore,
} from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";
import type { GenerationJobStore } from "../generation/generation-jobs-store.js";
import type { FlashcardStore, QuizStore } from "../study/study-store.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface DocumentRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  organizationStore: OrganizationStore;
  documentStore: DocumentStore;
  documentChunkStore: DocumentChunkStore;
  storageProvider: StorageProvider;
  generatedContentStore?: GeneratedContentStore;
  generationJobStore?: GenerationJobStore;
  flashcardStore?: FlashcardStore;
  quizStore?: QuizStore;
  courseStore?: CourseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  auditService?: AuditService;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const documentRoutes: FastifyPluginAsync<DocumentRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    organizationStore,
    documentStore,
    documentChunkStore,
    storageProvider,
    generatedContentStore,
    generationJobStore,
    flashcardStore,
    quizStore,
    courseStore,
    moduleStore,
    lessonStore,
    auditService,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const documentService = new DocumentService(
    documentStore,
    storageProvider,
    organizationStore,
    defaultPolicy,
    auditService,
    documentChunkStore,
    generatedContentStore,
    generationJobStore,
    flashcardStore,
    quizStore,
    courseStore,
    moduleStore,
    lessonStore,
  );
  const processingService = new DocumentProcessingService(
    documentStore,
    documentChunkStore,
    storageProvider,
    defaultPolicy,
    auditService,
    organizationStore,
  );

  /**
   * Helper to extract actor from authenticated request.
   */
  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: { userId: string; email: string; role: string };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: reqAny.user.userId as Actor["userId"],
      role: reqAny.user.role as Actor["role"],
    };
  }

  /**
   * Helper to validate and extract organization ID from params.
   */
  function getOrganizationId(params: {
    organizationId: string;
  }): OrganizationId {
    if (!params.organizationId || !UUID_RE.test(params.organizationId)) {
      throw new DomainError("bad_request", "Invalid organization ID");
    }
    return params.organizationId as OrganizationId;
  }

  /**
   * Helper to validate and extract document ID from params.
   */
  function getDocumentId(params: { documentId: string }): DocumentId {
    return parseDocumentId(params.documentId, "documentId");
  }

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents/upload-intent
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents/upload-intent",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const organizationId = getOrganizationId(
        request.params as { organizationId: string },
      );
      const body = request.body as {
        original_name?: string;
        mime_type?: string;
        size_bytes?: number;
      };

      if (
        !body.original_name ||
        typeof body.original_name !== "string" ||
        !body.mime_type ||
        typeof body.mime_type !== "string" ||
        typeof body.size_bytes !== "number"
      ) {
        throw new DomainError(
          "bad_request",
          "original_name, mime_type, and size_bytes are required",
        );
      }

      const intent = await documentService.createUploadIntent(
        actor,
        organizationId,
        {
          originalName: body.original_name,
          mimeType: body.mime_type,
          sizeBytes: body.size_bytes,
        },
      );

      return {
        request_id: request.id,
        document_id: intent.document_id,
        storage_key: intent.storage_key,
        upload_url: intent.upload_url,
        expires_at: intent.expires_at,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents
  // Multipart upload: original_name, mime_type, course_id (optional), file
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const organizationId = getOrganizationId(
        request.params as { organizationId: string },
      );

      const parts = await request.file();
      if (!parts) {
        throw new DomainError(
          "bad_request",
          "Multipart file upload is required",
        );
      }

      // Read the file body into a buffer.
      const data = await parts.toBuffer();

      const mimeType = parts.mimetype || "application/octet-stream";
      const originalName = parts.filename || "upload";
      const sizeBytes = data.length;

      // Optional course_id field (from query or multipart form field).
      let courseId: string | null = null;
      const queryCourse = (request.query as { course_id?: string })?.course_id;
      if (queryCourse && UUID_RE.test(queryCourse)) {
        courseId = queryCourse;
      }
      const rawCourseField = parts.fields?.course_id;
      if (rawCourseField) {
        if (Array.isArray(rawCourseField)) {
          const field = rawCourseField[0];
          if (field && typeof field === "object" && "value" in field) {
            const value = (field as { value: string }).value;
            if (value && UUID_RE.test(value)) courseId = value;
          }
        } else if (typeof rawCourseField === "object" && "value" in rawCourseField) {
          const value = (rawCourseField as { value: string }).value;
          if (value && UUID_RE.test(value)) courseId = value;
        } else if (typeof rawCourseField === "string" && UUID_RE.test(rawCourseField)) {
          courseId = rawCourseField;
        }
      }

      const result = await documentService.confirmUpload(
        actor,
        organizationId,
        {
          originalName,
          mimeType,
          sizeBytes,
          data,
          courseId,
        },
      );

      reply.code(result.duplicate ? 200 : 201);
      return {
        request_id: request.id,
        duplicate: result.duplicate,
        document: result.document,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/documents/stats
  // Return aggregate file statistics (count, size, status breakdown).
  // Must be registered BEFORE the /:documentId route to avoid param conflict.
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/documents/stats",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const organizationId = getOrganizationId(
        request.params as { organizationId: string },
      );

      const stats = await documentService.getDocumentStats(
        actor,
        organizationId,
      );

      return {
        request_id: request.id,
        stats,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/documents
  // Query params: search, status, type, course_id, used, sort, page, limit
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/documents",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const organizationId = getOrganizationId(
        request.params as { organizationId: string },
      );

      const query = request.query as {
        search?: string;
        status?: string;
        type?: string;
        course_id?: string;
        used?: string;
        sort?: string;
        page?: string;
        limit?: string;
      };

      const filter: DocumentListFilter = {
        search: query.search?.trim() || undefined,
        status: query.status as DocumentListFilter["status"] | undefined,
        type: query.type || undefined,
        courseId: query.course_id && UUID_RE.test(query.course_id) ? query.course_id : undefined,
        used: (query.used === "used" || query.used === "unused") ? query.used : undefined,
        sort: query.sort as DocumentListFilter["sort"] | undefined,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      };

      const result = await documentService.listDocuments(
        actor,
        organizationId,
        filter,
      );

      return {
        request_id: request.id,
        items: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          total_pages: result.totalPages,
          next_cursor: null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents/bulk-delete
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents/bulk-delete",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const organizationId = getOrganizationId(
        request.params as { organizationId: string },
      );
      const body = request.body as { document_ids?: string[] };

      if (!Array.isArray(body?.document_ids)) {
        throw new DomainError("bad_request", "document_ids array is required");
      }

      const documentIds = body.document_ids
        .filter((id) => typeof id === "string" && UUID_RE.test(id))
        .map((id) => parseDocumentId(id, "documentId"));

      const result = await documentService.bulkDelete(
        actor,
        organizationId,
        documentIds,
      );

      return result;
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents/bulk-reprocess
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents/bulk-reprocess",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const organizationId = getOrganizationId(
        request.params as { organizationId: string },
      );
      const body = request.body as { document_ids?: string[] };

      if (!Array.isArray(body?.document_ids)) {
        throw new DomainError("bad_request", "document_ids array is required");
      }

      const documentIds = body.document_ids
        .filter((id) => typeof id === "string" && UUID_RE.test(id))
        .map((id) => parseDocumentId(id, "documentId"));

      const result = await documentService.bulkReprocess(
        actor,
        organizationId,
        documentIds,
        processingService,
      );

      return result;
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents/bulk-attach-course
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents/bulk-attach-course",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const organizationId = getOrganizationId(
        request.params as { organizationId: string },
      );
      const body = request.body as {
        document_ids?: string[];
        course_id?: string | null;
      };

      if (!Array.isArray(body?.document_ids)) {
        throw new DomainError("bad_request", "document_ids array is required");
      }

      const courseId =
        body.course_id === null || body.course_id === undefined
          ? null
          : UUID_RE.test(body.course_id)
          ? (body.course_id as import("@avana/domain").CourseId)
          : null;

      const documentIds = body.document_ids
        .filter((id) => typeof id === "string" && UUID_RE.test(id))
        .map((id) => parseDocumentId(id, "documentId"));

      const result = await documentService.bulkAttachCourse(
        actor,
        organizationId,
        documentIds,
        courseId,
      );

      return result;
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/documents/:documentId
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/documents/:documentId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      const doc = await documentService.getDocument(
        actor,
        organizationId,
        documentId,
      );

      return {
        request_id: request.id,
        document: doc,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // PATCH /v1/organizations/:organizationId/documents/:documentId
  // ---------------------------------------------------------------------------
  app.patch(
    "/v1/organizations/:organizationId/documents/:documentId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);
      const body = request.body as {
        original_name?: string;
        course_id?: string | null;
      };

      const updated = await documentService.updateDocument(
        actor,
        organizationId,
        documentId,
        {
          originalName: body?.original_name,
          courseId: body?.course_id,
        },
      );

      return {
        request_id: request.id,
        document: updated,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/documents/:documentId/download
  // Streams the file for preview or download.
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/documents/:documentId/download",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);
      const query = request.query as { inline?: string };

      const { data, mimeType, originalName } =
        await documentService.downloadDocument(actor, organizationId, documentId);

      const disposition = query.inline === "1"
        ? `inline; filename="${originalName}"`
        : `attachment; filename="${originalName}"`;

      reply
        .header("Content-Type", mimeType)
        .header("Content-Disposition", disposition)
        .header("Content-Length", data.length)
        .header("Cache-Control", "private, max-age=3600");

      return reply.send(data);
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /v1/organizations/:organizationId/documents/:documentId
  // ---------------------------------------------------------------------------
  app.delete(
    "/v1/organizations/:organizationId/documents/:documentId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      await documentService.deleteDocument(actor, organizationId, documentId);

      reply.code(204);
      return;
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents/:documentId/extract
  // Trigger text extraction (worker-ready processing service).
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents/:documentId/extract",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      const status = await processingService.processDocument(
        actor,
        organizationId,
        documentId,
      );

      return {
        request_id: request.id,
        status,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/documents/:documentId/status
  // Return extraction lifecycle state, page/chunk counts, errors, retries.
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/documents/:documentId/status",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      const status = await processingService.getExtractionStatus(
        actor,
        organizationId,
        documentId,
      );

      return {
        request_id: request.id,
        status,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents/:documentId/reprocess
  // Force re-extraction and chunk regeneration.
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents/:documentId/reprocess",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      const status = await processingService.reprocessDocument(
        actor,
        organizationId,
        documentId,
      );

      return {
        request_id: request.id,
        status,
      };
    },
  );
};
