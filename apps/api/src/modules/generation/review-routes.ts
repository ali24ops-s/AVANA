/**
 * Review HTTP routes (PR6-6) — Human review & acceptance workflow.
 *
 * Endpoints (all organization + course scoped):
 *   GET  .../generated/review-queue
 *        → list generated content pending review for a course
 *   GET  .../generated/:contentId
 *        → get a single generated content with citations, source chunks,
 *          and generation metadata
 *   POST .../generated/:contentId/accept
 *        → draft → accepted (+ materialize lesson into Learning Core)
 *   POST .../generated/:contentId/reject
 *        → draft/edited → rejected (requires rejection reason)
 *   PATCH .../generated/:contentId
 *        → editor modification before acceptance (preserves citations)
 *   POST .../generated/:contentId/regenerate
 *        → async regeneration via the existing GenerationQueue (202 + job_id)
 *
 * Authorization is delegated to the ReviewService via the domain policy:
 *   - review-queue / read : content:review (student + editor + admin)
 *   - accept/reject/edit  : content:accept / content:reject / content:edit
 *                           (course_editor + organization_admin)
 *   - regenerate          : content:regenerate (course_editor + org_admin)
 */

import type { FastifyPluginAsync } from "fastify";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type GeneratedContentId,
  type ModuleId,
  type OrganizationId,
  type Role,
  DomainError,
  defaultPolicy,
  parseGeneratedContentId,
} from "@avana/domain";
import { ReviewService } from "./review-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type {
  DocumentStore,
  DocumentChunkStore,
  ModuleStore,
  LessonStore,
} from "../learning/learning-store.js";
import type {
  GeneratedContentStore,
  GeneratedContentCitationStore,
} from "./generation-store.js";
import type { GenerationQueue } from "./generation-queue.js";
import type { AuditService } from "../../observability/audit-service.js";
import type {
  FlashcardStore,
  QuizStore,
  QuizQuestionStore,
} from "../study/study-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { DbClient } from "@avana/database/client";
import type { CourseStore } from "../courses/course-store.js";

export interface ReviewRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  generatedContentStore: GeneratedContentStore;
  generatedContentCitationStore: GeneratedContentCitationStore;
  documentStore: DocumentStore;
  documentChunkStore: DocumentChunkStore;
  moduleStore: ModuleStore;
  lessonStore: LessonStore;
  queue: GenerationQueue;
  flashcardStore?: FlashcardStore;
  quizStore?: QuizStore;
  quizQuestionStore?: QuizQuestionStore;
  organizationStore?: OrganizationStore;
  auditService?: AuditService;
  db?: DbClient;
  systemOrganizationId?: OrganizationId;
  courseStore?: CourseStore;
  studyService?: import("../study/index.js").StudyService | (() => import("../study/index.js").StudyService | undefined);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reviewRoutes: FastifyPluginAsync<ReviewRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    generatedContentStore,
    generatedContentCitationStore,
    documentStore,
    documentChunkStore,
    moduleStore,
    lessonStore,
    queue,
    flashcardStore,
    quizStore,
    quizQuestionStore,
    auditService,
    db,
    systemOrganizationId,
    courseStore,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const service = new ReviewService(
    generatedContentStore,
    generatedContentCitationStore,
    documentStore,
    documentChunkStore,
    moduleStore,
    lessonStore,
    defaultPolicy,
    queue,
    auditService,
    flashcardStore,
    quizStore,
    quizQuestionStore,
    opts.organizationStore,
    undefined,
    db,
    undefined,
    systemOrganizationId,
    courseStore,
  );

  /** Helper to extract actor from authenticated request. */
  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: {
        userId: string;
        email: string;
        role: string;
        globalRole?: string | null;
      };
    };
    if (!reqAny.user) {
      throw new DomainError("unauthorized", "Not signed in");
    }
    return {
      userId: reqAny.user.userId as Actor["userId"],
      role: reqAny.user.role as Actor["role"],
      globalRole: (reqAny.user.globalRole as Role) ?? null,
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


  async function resolveCourseIdForActor(
    rawParam: string,
    actor: Actor,
  ): Promise<CourseId> {
    if (!rawParam || !rawParam.trim()) {
      throw new DomainError("bad_request", "Invalid course ID");
    }
    const clean = rawParam.trim();
    if (courseStore && typeof courseStore.findByIdOrSlugForUser === "function") {
      const resolved = await courseStore.findByIdOrSlugForUser(
        clean,
        actor.userId,
        systemOrganizationId,
      );
      if (!resolved || !resolved.course || resolved.course.deletedAt !== null) {
        throw new DomainError("not_found", "Course not found");
      }
      return resolved.course.id;
    }
    if (courseStore && typeof courseStore.findByIdForUser === "function") {
      if (UUID_RE.test(clean)) {
        const course = await courseStore.findByIdForUser(
          clean as CourseId,
          actor.userId,
          systemOrganizationId,
        );
        if (!course || course.deletedAt !== null) {
          throw new DomainError("not_found", "Course not found");
        }
        return course.id;
      }
      if (typeof courseStore.findByIdOrSlug === "function") {
        const resolved = await courseStore.findByIdOrSlug(clean);
        if (resolved && resolved.course && resolved.course.deletedAt === null) {
          const userCourse = await courseStore.findByIdForUser(
            resolved.course.id,
            actor.userId,
            systemOrganizationId,
          );
          if (!userCourse || userCourse.deletedAt !== null) {
            throw new DomainError("forbidden", "You do not have access to this course");
          }
          return userCourse.id;
        }
      }
      throw new DomainError("not_found", "Course not found");
    }
    if (courseStore && typeof courseStore.findByIdOrSlug === "function") {
      const resolved = await courseStore.findByIdOrSlug(clean);
      if (resolved && resolved.course && resolved.course.deletedAt === null) {
        return resolved.course.id;
      }
    }
    if (UUID_RE.test(clean)) {
      return clean as CourseId;
    }
    throw new DomainError("bad_request", "Invalid course ID");
  }

  /** Helper to validate and extract document ID from params. */
  function getDocumentId(params: { documentId: string }): DocumentId {
    if (!params.documentId || !UUID_RE.test(params.documentId)) {
      throw new DomainError("bad_request", "Invalid document ID");
    }
    return params.documentId as DocumentId;
  }

  /** Helper to validate and extract generated content ID from params. */
  function getContentId(params: { contentId: string }): GeneratedContentId {
    return parseGeneratedContentId(params.contentId, "contentId");
  }

  /** Helper to validate and extract module ID from params. */
  function getModuleId(params: { moduleId: string }): ModuleId {
    if (!params.moduleId || !UUID_RE.test(params.moduleId)) {
      throw new DomainError("bad_request", "Invalid module ID");
    }
    return params.moduleId as ModuleId;
  }

  // -----------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/:courseId/generated/review-queue
  // -----------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/generated/review-queue",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = await resolveCourseIdForActor(params.courseId, actor);

      const query = (request.query as {
        page?: string;
        limit?: string;
        type?: import("@avana/domain").GeneratedContentType;
        status?: string;
        search?: string;
      }) || {};
      const page = query.page ? Math.max(1, parseInt(query.page, 10)) : undefined;
      const limit = query.limit ? Math.max(1, parseInt(query.limit, 10)) : undefined;

      return service.reviewQueue(actor, organizationId, courseId, request.id, {
        page,
        limit,
        type: query.type,
        status: query.status,
        search: query.search,
      });
    },
  );

  // -----------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/:courseId/generated/:contentId
  // -----------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/generated/:contentId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const contentId = getContentId(params);

      return service.getContentForReview(
        actor,
        organizationId,
        contentId,
        request.id,
      );
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/generated/:contentId/accept
  // -----------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/generated/:contentId/accept",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const contentId = getContentId(params);

      const result = await service.acceptContent(
        actor,
        organizationId,
        contentId,
      );

      const resolvedStudyService =
        typeof opts.studyService === "function" ? opts.studyService() : opts.studyService;
      if (resolvedStudyService) {
        resolvedStudyService.invalidateTopicSummaryCache(organizationId);
      }

      return { request_id: request.id, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/generated/:contentId/unapprove
  // -----------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/generated/:contentId/unapprove",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = await resolveCourseIdForActor(params.courseId, actor);
      const contentId = getContentId(params);

      const result = await service.unapproveContent(
        actor,
        organizationId,
        courseId,
        contentId,
      );

      const resolvedStudyService =
        typeof opts.studyService === "function" ? opts.studyService() : opts.studyService;
      if (resolvedStudyService) {
        resolvedStudyService.invalidateTopicSummaryCache(organizationId);
      }

      return { request_id: request.id, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/unapprove-contents
  // -----------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/unapprove-contents",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        moduleId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = await resolveCourseIdForActor(params.courseId, actor);
      const moduleId = getModuleId(params);

      const result = await service.unapproveModuleContents(
        actor,
        organizationId,
        courseId,
        moduleId,
      );

      const resolvedStudyService =
        typeof opts.studyService === "function" ? opts.studyService() : opts.studyService;
      if (resolvedStudyService) {
        resolvedStudyService.invalidateTopicSummaryCache(organizationId);
      }

      return { request_id: request.id, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // DELETE /v1/organizations/:organizationId/courses/:courseId/generated/:contentId
  // -----------------------------------------------------------------------
  app.delete(
    "/v1/organizations/:organizationId/courses/:courseId/generated/:contentId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = await resolveCourseIdForActor(params.courseId, actor);
      const contentId = getContentId(params);
      const query = request.query as { confirm_published_delete?: string } | undefined;
      const confirmPublishedDelete = query?.confirm_published_delete === "true";

      const result = await service.deleteGeneratedContent(
        actor,
        organizationId,
        courseId,
        contentId,
        { confirmPublishedDelete },
      );

      const resolvedStudyService =
        typeof opts.studyService === "function" ? opts.studyService() : opts.studyService;
      if (resolvedStudyService) {
        resolvedStudyService.invalidateTopicSummaryCache(organizationId);
      }

      return { request_id: request.id, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/generated/documents/:documentId/accept-all
  // -----------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/generated/documents/:documentId/accept-all",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        documentId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = await resolveCourseIdForActor(params.courseId, actor);
      const documentId = getDocumentId(params);

      const result = await service.acceptPack(
        actor,
        organizationId,
        courseId,
        documentId,
      );

      const resolvedStudyService =
        typeof opts.studyService === "function" ? opts.studyService() : opts.studyService;
      if (resolvedStudyService) {
        resolvedStudyService.invalidateTopicSummaryCache(organizationId);
      }

      return { request_id: request.id, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/generated/:contentId/reject
  // -----------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/generated/:contentId/reject",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const contentId = getContentId(params);

      const body = (request.body ?? {}) as { reason?: string };
      const result = await service.rejectContent(
        actor,
        organizationId,
        contentId,
        body.reason ?? "",
      );

      return { request_id: request.id, ...result };
    },
  );

  // -----------------------------------------------------------------------
  // PATCH /v1/organizations/:organizationId/courses/:courseId/generated/:contentId
  // -----------------------------------------------------------------------
  app.patch(
    "/v1/organizations/:organizationId/courses/:courseId/generated/:contentId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const contentId = getContentId(params);

      const body = (request.body ?? {}) as {
        payload?: { kind?: string; [key: string]: unknown };
      };
      const result = await service.editContent(
        actor,
        organizationId,
        contentId,
        { payload: body.payload as never },
      );

      return result;
    },
  );

  // -----------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/generated/:contentId/regenerate
  // -----------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/generated/:contentId/regenerate",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        contentId: string;
      };
      const organizationId = getOrganizationId(params);
      const contentId = getContentId(params);

      const result = await service.regenerateContent(
        actor,
        organizationId,
        contentId,
      );

      // Async regeneration — 202 with the job id the client polls.
      reply.code(202);
      return { request_id: request.id, ...result };
    },
  );
};
