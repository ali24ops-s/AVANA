import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type DocumentId,
  type GeneratedContentType,
  type Role,
  type SourcePackRole,
  asCourseId,
  asDocumentId,
  asOrganizationId,
  asSourcePackId,
  DomainError,
} from "@avana/domain";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { SourcePackService } from "./source-pack-service.js";
import type { SourcePackWithDocumentsRecord } from "./source-pack-store.js";
import type {
  SourcePackResource,
  SourcePackResponse,
  SourcePackListResponse,
} from "@avana/contracts";

export interface SourcePackRouteOptions {
  service: SourcePackService;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
}

function mapSourcePackToResource(pack: SourcePackWithDocumentsRecord): SourcePackResource {
  return {
    id: pack.id,
    organization_id: pack.organizationId,
    course_id: pack.courseId,
    title: pack.title,
    description: null,
    created_by_user_id: "",
    created_at: pack.createdAt,
    updated_at: pack.updatedAt,
    documents: pack.documents.map((d) => ({
      document_id: d.documentId,
      role: d.role,
      order_index: d.orderIndex,
      original_name: d.originalName ?? null,
      status: d.status ?? null,
      mime_type: d.mimeType ?? null,
      size_bytes: d.sizeBytes ?? null,
    })),
  };
}

export const sourcePackRoutes: FastifyPluginAsync<SourcePackRouteOptions> = async (
  app,
  opts,
) => {
  const { sessionService, userStore } = opts;
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

  // GET /v1/organizations/:organizationId/courses/:courseId/source-packs
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/source-packs",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string; courseId: string };
      const organizationId = asOrganizationId(params.organizationId);
      const courseId = asCourseId(params.courseId);

      const packs = await opts.service.listPacks(actor, organizationId, courseId);
      const response: SourcePackListResponse = {
        request_id: request.id,
        source_packs: packs.map(mapSourcePackToResource),
      };
      return reply.send(response);
    },
  );

  // POST /v1/organizations/:organizationId/courses/:courseId/source-packs
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/source-packs",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string; courseId: string };
      const organizationId = asOrganizationId(params.organizationId);
      const courseId = asCourseId(params.courseId);

      const body = (request.body ?? {}) as {
        title?: string;
        documents?: Array<{
          document_id?: string;
          documentId?: string;
          role?: SourcePackRole;
          order_index?: number;
          orderIndex?: number;
        }>;
      };

      const rawDocs = Array.isArray(body.documents) ? body.documents : [];
      const documents = rawDocs.map((d) => ({
        documentId: asDocumentId(String(d.document_id || d.documentId)),
        role: d.role,
        orderIndex: d.order_index ?? d.orderIndex,
      }));

      const pack = await opts.service.createPack(actor, organizationId, courseId, {
        title: body.title ?? "پک منابع جدید",
        documents,
      });

      reply.code(201);
      return {
        request_id: request.id,
        source_pack: mapSourcePackToResource(pack),
      };
    },
  );

  // GET /v1/organizations/:organizationId/courses/:courseId/source-packs/:packId
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/source-packs/:packId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        packId: string;
      };
      const organizationId = asOrganizationId(params.organizationId);
      const courseId = asCourseId(params.courseId);
      const packId = asSourcePackId(params.packId);

      const pack = await opts.service.getPack(actor, organizationId, courseId, packId);
      const response: SourcePackResponse = {
        request_id: request.id,
        source_pack: mapSourcePackToResource(pack),
      };
      return reply.send(response);
    },
  );

  // PATCH /v1/organizations/:organizationId/courses/:courseId/source-packs/:packId
  app.patch(
    "/v1/organizations/:organizationId/courses/:courseId/source-packs/:packId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        packId: string;
      };
      const organizationId = asOrganizationId(params.organizationId);
      const courseId = asCourseId(params.courseId);
      const packId = asSourcePackId(params.packId);

      const body = (request.body ?? {}) as {
        title?: string;
        documents?: Array<{
          document_id?: string;
          documentId?: string;
          role?: SourcePackRole;
          order_index?: number;
          orderIndex?: number;
        }>;
      };

      const updateInput: {
        title?: string;
        documents?: Array<{
          documentId: DocumentId;
          role?: SourcePackRole;
          orderIndex?: number;
        }>;
      } = {};

      if (body.title !== undefined) {
        updateInput.title = body.title;
      }

      if (body.documents !== undefined) {
        updateInput.documents = body.documents.map((d) => ({
          documentId: asDocumentId(String(d.document_id || d.documentId)),
          role: d.role,
          orderIndex: d.order_index ?? d.orderIndex,
        }));
      }

      const pack = await opts.service.updatePack(
        actor,
        organizationId,
        courseId,
        packId,
        updateInput,
      );

      const response: SourcePackResponse = {
        request_id: request.id,
        source_pack: mapSourcePackToResource(pack),
      };
      return reply.send(response);
    },
  );

  // DELETE /v1/organizations/:organizationId/courses/:courseId/source-packs/:packId
  app.delete(
    "/v1/organizations/:organizationId/courses/:courseId/source-packs/:packId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        packId: string;
      };
      const organizationId = asOrganizationId(params.organizationId);
      const courseId = asCourseId(params.courseId);
      const packId = asSourcePackId(params.packId);

      await opts.service.deletePack(actor, organizationId, courseId, packId);
      reply.code(204);
      return reply.send();
    },
  );

  // POST /v1/organizations/:organizationId/courses/:courseId/source-packs/:packId/generate
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/source-packs/:packId/generate",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        packId: string;
      };
      const organizationId = asOrganizationId(params.organizationId);
      const courseId = asCourseId(params.courseId);
      const packId = asSourcePackId(params.packId);

      const body = (request.body ?? {}) as {
        types?: GeneratedContentType[];
        prompt_version?: string;
        question_pattern_id?: string | null;
        question_pattern_version?: number | null;
        question_pattern_ids?: string[] | null;
      };

      const result = await opts.service.generateFromPack(
        actor,
        organizationId,
        courseId,
        packId,
        {
          types: body.types,
          promptVersion: body.prompt_version,
          questionPatternId: body.question_pattern_id,
          questionPatternVersion: body.question_pattern_version,
          questionPatternIds: body.question_pattern_ids,
        },
      );

      reply.code(202);
      return reply.send({
        request_id: request.id,
        job_id: result.generationJobId,
        status: result.status,
      });
    },
  );

  // GET /v1/organizations/:organizationId/courses/:courseId/source-packs/:packId/estimate-cost
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/source-packs/:packId/estimate-cost",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        packId: string;
      };
      const query = (request.query ?? {}) as { types?: string };
      const organizationId = asOrganizationId(params.organizationId);
      const courseId = asCourseId(params.courseId);
      const packId = asSourcePackId(params.packId);

      let types: GeneratedContentType[] | undefined;
      if (query.types) {
        types = query.types.split(",") as GeneratedContentType[];
      }

      const estimate = await opts.service.estimatePackCost(
        actor,
        organizationId,
        courseId,
        packId,
        types,
      );

      return reply.send({
        request_id: request.id,
        estimate,
      });
    },
  );
};
