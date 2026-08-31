/**
 * Learning HTTP routes.
 *
 * Per PR2 acceptance criteria:
 * - GET /v1/courses/:courseId/learn — Get full course learning structure
 *   with modules, lessons, and user lesson completion status.
 * - POST /v1/courses/:courseId/lessons/:lessonId/progress — Mark lesson completed
 * - GET /v1/courses/:courseId/progress — Get course progress summary
 *
 * Authorization is org-scoped:
 * - Resolves the course's owning organization
 * - Verifies the authenticated user's membership
 * - Delegates policy check to the domain layer
 */

import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
  type CourseId,
  type LessonId,
  type OrganizationId,
} from "@avana/domain";
import { LearningService } from "./learning-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type {
  ModuleStore,
  LessonStore,
  ProgressStore,
} from "./learning-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface LearningRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  courseStore: CourseStore;
  organizationStore: OrganizationStore;
  moduleStore: ModuleStore;
  lessonStore: LessonStore;
  progressStore: ProgressStore;
  auditService?: AuditService;
  systemOrganizationId?: OrganizationId;
  demoUserResolver?: AuthMiddlewareDeps["demoUserResolver"];
  authEnabled?: boolean;
}

export const learningRoutes: FastifyPluginAsync<LearningRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    courseStore,
    organizationStore,
    moduleStore,
    lessonStore,
    progressStore,
    auditService,
    systemOrganizationId,
    demoUserResolver,
    authEnabled,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({
    sessionService,
    userStore,
    demoUserResolver,
    authEnabled,
  });
  const learningService = new LearningService(
    courseStore,
    organizationStore,
    moduleStore,
    lessonStore,
    progressStore,
    undefined,
    auditService,
    systemOrganizationId,
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
   * Helper to validate and extract course ID from params.
   */
  function getCourseId(params: { courseId: string }): CourseId {
    if (
      !params.courseId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.courseId,
      )
    ) {
      throw new DomainError("bad_request", "Invalid course ID");
    }
    return params.courseId as CourseId;
  }

  /**
   * Helper to validate and extract lesson ID from params.
   */
  function getLessonId(params: { lessonId: string }): LessonId {
    if (
      !params.lessonId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.lessonId,
      )
    ) {
      throw new DomainError("bad_request", "Invalid lesson ID");
    }
    return params.lessonId as LessonId;
  }

  // ---------------------------------------------------------------------------
  // GET /v1/courses/:courseId/learn — Get course learning structure
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/courses/:courseId/learn",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { courseId: string };
      const courseId = getCourseId(params);

      const result = await learningService.getCourseLearning(
        actor,
        courseId,
        request.id,
      );

      return result;
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/courses/:courseId/lessons/:lessonId/progress — Mark lesson completed
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/courses/:courseId/lessons/:lessonId/progress",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        courseId: string;
        lessonId: string;
      };
      const courseId = getCourseId(params);
      const lessonId = getLessonId(params);
      const body = request.body as { completed?: unknown } | undefined;
      if (body?.completed !== true) {
        throw new DomainError(
          "bad_request",
          "completed must be true to complete a lesson",
        );
      }

      const result = await learningService.markLessonComplete(
        actor,
        courseId,
        lessonId,
      );

      reply.code(200);
      return result;
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/courses/:courseId/progress — Get course progress summary
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/courses/:courseId/progress",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { courseId: string };
      const courseId = getCourseId(params);

      const result = await learningService.getCourseProgress(actor, courseId);

      return result;
    },
  );
};
