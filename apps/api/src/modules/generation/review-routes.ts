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
  type GeneratedContentId,
  type OrganizationId,
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

  /** Helper to validate and extract course ID from params. */
  function getCourseId(params: { courseId: string }): CourseId {
    if (!params.courseId || !UUID_RE.test(params.courseId)) {
      throw new DomainError("bad_request", "Invalid course ID");
    }
    return params.courseId as CourseId;
  }

  /** Helper to validate and extract generated content ID from params. */
  function getContentId(params: { contentId: string }): GeneratedContentId {
    return parseGeneratedContentId(params.contentId, "contentId");
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
      const courseId = getCourseId(params);

      return service.reviewQueue(actor, organizationId, courseId, request.id);
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
