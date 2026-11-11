import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type Role,
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

export interface PresentationReferenceRouteOptions {
  service: PresentationReferenceService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

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
