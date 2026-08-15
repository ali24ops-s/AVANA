/**
 * Generation HTTP routes (PR6-4).
 *
 * Per the approved PR6-4 proposal:
 * - POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate
 *   → Synchronously generate content drafts for a document (mock provider).
 * - GET  /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated
 *   → List generated content drafts + citations for a document.
 * - GET  /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId
 *   → Get a single generated content with citations.
 *
 * Authorization is delegated to the GenerationService via the domain policy.
 * No accept/reject/regenerate mutations here (PR6-6).
 */

import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
  type DocumentId,
  type GeneratedContentId,
  type GeneratedContentType,
  type OrganizationId,
  parseDocumentId,
  parseGeneratedContentId,
  parseGenerationJobId,
  defaultPolicy,
} from "@avana/domain";
import { GenerationService } from "./generation-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type {
  DocumentStore,
  DocumentChunkStore,
} from "../learning/learning-store.js";
import type {
  GeneratedContentStore,
  GeneratedContentCitationStore,
} from "./generation-store.js";
import type { GenerationJobStore } from "./generation-jobs-store.js";
import type { GenerationQueue } from "./generation-queue.js";
import type { ModelGateway } from "./gateway/index.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";

export interface GenerationRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  documentStore: DocumentStore;
  documentChunkStore: DocumentChunkStore;
  generatedContentStore: GeneratedContentStore;
  generatedContentCitationStore: GeneratedContentCitationStore;
  generationJobStore: GenerationJobStore;
  queue: GenerationQueue;
  gateway: ModelGateway;
  organizationStore?: OrganizationStore;
  auditService?: AuditService;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const generationRoutes: FastifyPluginAsync<
  GenerationRouteOptions
> = async (app, opts) => {
  const {
    sessionService,
    userStore,
    documentStore,
    documentChunkStore,
    generatedContentStore,
    generatedContentCitationStore,
    generationJobStore,
    queue,
    gateway,
    auditService,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const service = new GenerationService(
    generatedContentStore,
    generatedContentCitationStore,
    gateway,
    documentStore,
    documentChunkStore,
    defaultPolicy,
    auditService,
    opts.organizationStore,
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

  /**
   * Helper to validate and extract generated content ID from params.
   */
  function getContentId(params: { contentId: string }): GeneratedContentId {
    return parseGeneratedContentId(params.contentId, "contentId");
  }

  // -----------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate
  // -----------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      const body = (request.body ?? {}) as {
        types?: string[];
        prompt_version?: string;
      };
      const courseId = params.courseId as string;

      // Authorization: the queue job will itself call GenerationService which
      // re-authorizes `content:generate`. We still resolve the document here to
      // fail fast (non-disclosing 404) before enqueueing.
      const doc = await documentStore.findByIdForOrganization(
        documentId,
        organizationId,
      );
      if (!doc) {
        throw new DomainError("not_found", "Document not found");
      }

      const generationKey = `doc:${documentId}:async:${randomUUID()}`;

      const result = await queue.enqueueGenerationJob({
        actorUserId: actor.userId,
        actorRole: actor.role,
        organizationId,
        documentId,
        courseId: courseId as never,
        types: (body.types as GeneratedContentType[] | undefined) ?? ["lesson"],
        promptVersion: body.prompt_version,
        generationKey,
      });

      // Async job accepted — return 202 with the job id the client polls.
      reply.code(202);
      return {
        request_id: request.id,
        job_id: result.generationJobId,
        status: result.status,
      };
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate/jobs/:jobId
  // Returns the generation job lifecycle (queued/running/succeeded/failed).
  // -----------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generate/jobs/:jobId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        documentId: string;
        jobId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);
      const jobId = parseGenerationJobId(params.jobId, "jobId");

      // Authorization: content:review required to read job lifecycle.
      await service.authorize(actor, organizationId, "content:review");

      const doc = await documentStore.findByIdForOrganization(
        documentId,
        organizationId,
      );
      if (!doc) {
        throw new DomainError("not_found", "Document not found");
      }

      const job = await generationJobStore.findByIdForOrganization(
        jobId,
        organizationId,
      );
      if (!job || job.documentId !== documentId) {
        throw new DomainError("not_found", "Generation job not found");
      }

      return {
        request_id: request.id,
        job: {
          id: job.id,
          organization_id: job.organizationId,
          document_id: job.documentId,
          course_id: job.courseId,
          type: job.type,
          status: job.status,
          attempts: job.attempts,
          error_code: job.errorCode,
          error_message: job.errorMessage,
          created_at: job.createdAt,
          updated_at: job.updatedAt,
          started_at: job.startedAt,
          completed_at: job.completedAt,
        },
      };
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated
  // -----------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      const contents = await service.listByDocument(
        actor,
        organizationId,
        documentId,
      );

      return {
        request_id: request.id,
        contents,
      };
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId
  // -----------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/documents/:documentId/generated/:contentId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        documentId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);
      const contentId = getContentId(params);

      const content = await service.getGeneratedContent(
        actor,
        organizationId,
        documentId,
        contentId,
      );

      return {
        request_id: request.id,
        content,
      };
    },
  );
};
