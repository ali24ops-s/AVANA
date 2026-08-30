/**
 * Library & Content Pack HTTP routes.
 *
 * Endpoints:
 * - POST /v1/organizations/:organizationId/documents/:documentId/content-pack/publish
 *   → Publish an approved 4-content set as an immutable Content Pack (requires authentication)
 * - GET  /v1/library/packs
 *   → List/search published Content Packs in the public Library
 * - GET  /v1/library/packs/:packId
 *   → View detailed preview of a published Content Pack
 */

import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type ContentPackId,
  type DocumentId,
  type OrganizationId,
  DomainError,
  defaultPolicy,
  parseContentPackId,
  parseCourseId,
  parseDocumentId,
} from "@avana/domain";
import { LibraryService } from "./library-service.js";
import type { ContentPackStore, ContentPackUsageStore } from "./library-store.js";
import type { DocumentStore } from "../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation/generation-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { UserStore } from "../identity/user-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface LibraryRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: UserStore;
  contentPackStore: ContentPackStore;
  contentPackUsageStore: ContentPackUsageStore;
  documentStore: DocumentStore;
  generatedContentStore: GeneratedContentStore;
  organizationStore?: OrganizationStore;
  courseStore?: CourseStore;
  auditService?: AuditService;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const libraryRoutes: FastifyPluginAsync<LibraryRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    contentPackStore,
    contentPackUsageStore,
    documentStore,
    generatedContentStore,
    organizationStore,
    courseStore,
    auditService,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  const service = new LibraryService(
    contentPackStore,
    contentPackUsageStore,
    documentStore,
    generatedContentStore,
    organizationStore,
    userStore,
    courseStore,
    defaultPolicy,
    auditService,
  );

  /** Helper to extract actor from authenticated request. */
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

  /** Helper to validate and extract organization ID from params. */
  function getOrganizationId(params: {
    organizationId: string;
  }): OrganizationId {
    if (!params.organizationId || !UUID_RE.test(params.organizationId)) {
      throw new DomainError("bad_request", "Invalid organization ID");
    }
    return params.organizationId as OrganizationId;
  }

  /** Helper to validate and extract document ID from params. */
  function getDocumentId(params: { documentId: string }): DocumentId {
    return parseDocumentId(params.documentId, "documentId");
  }

  /** Helper to validate and extract content pack ID from params. */
  function getContentPackId(params: { packId: string }): ContentPackId {
    return parseContentPackId(params.packId, "packId");
  }

  // -------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/documents/:documentId/content-pack/publish
  // -------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/documents/:documentId/content-pack/publish",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const documentId = getDocumentId(params);

      const body = (request.body ?? {}) as {
        title?: string;
        description?: string;
        subject?: string;
      };

      const result = await service.publishContentPack(
        actor,
        organizationId,
        documentId,
        {
          title: body.title,
          description: body.description,
          subject: body.subject,
        },
        request.id,
      );

      reply.code(201);
      return result;
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/library/packs
  // -------------------------------------------------------------------------
  app.get("/v1/library/packs", async (request, _reply) => {
    const query = (request.query ?? {}) as {
      q?: string;
      subject?: string;
      sort?: string;
      page?: string;
      limit?: string;
    };

    const sort =
      query.sort === "newest" || query.sort === "popular"
        ? query.sort
        : "popular";
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;

    return service.listPublishedPacks(
      {
        q: query.q,
        subject: query.subject,
        sort,
        page: isNaN(page) ? 1 : page,
        limit: isNaN(limit) ? 20 : limit,
      },
      request.id,
    );
  });

  // -------------------------------------------------------------------------
  // GET /v1/library/packs/:packId
  // -------------------------------------------------------------------------
  app.get("/v1/library/packs/:packId", async (request, _reply) => {
    const params = request.params as { packId: string };
    const packId = getContentPackId(params);

    return service.getPackDetail(packId, request.id);
  });

  // -------------------------------------------------------------------------
  // POST /v1/library/packs/:packId/add-to-course
  // -------------------------------------------------------------------------
  app.post(
    "/v1/library/packs/:packId/add-to-course",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as { packId: string };
      const packId = getContentPackId(params);

      const body = (request.body ?? {}) as {
        course_id?: string;
        courseId?: string;
      };
      const rawCourseId = body.course_id ?? body.courseId;
      if (!rawCourseId) {
        throw new DomainError("bad_request", "شناسه دوره الزامی است (course_id).");
      }
      const courseId = parseCourseId(rawCourseId, "course_id");

      const result = await service.addPackToCourse(
        actor,
        packId,
        courseId,
        request.id,
      );

      reply.code(200);
      return result;
    },
  );
};
