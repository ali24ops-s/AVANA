import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
  type CourseId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
} from "@avana/domain";
import { ContentService } from "./content-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { ModuleStore, LessonStore } from "./learning-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface ContentRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  courseStore: CourseStore;
  organizationStore: OrganizationStore;
  moduleStore: ModuleStore;
  lessonStore: LessonStore;
  auditService?: AuditService;
}

export const contentRoutes: FastifyPluginAsync<ContentRouteOptions> = async (
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
    auditService,
  } = opts;
  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const contentService = new ContentService(
    courseStore,
    organizationStore,
    moduleStore,
    lessonStore,
    undefined,
    auditService,
  );

  function getActor(request: unknown): Actor {
    const reqAny = request as {
      user?: { userId: string; email: string; role: string };
    };
    if (!reqAny.user) throw new DomainError("unauthorized", "Not signed in");
    return {
      userId: reqAny.user.userId as Actor["userId"],
      role: reqAny.user.role as Actor["role"],
    };
  }

  function getOrganizationId(params: {
    organizationId: string;
  }): OrganizationId {
    if (
      !params.organizationId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.organizationId,
      )
    )
      throw new DomainError("bad_request", "Invalid organization ID");
    return params.organizationId as OrganizationId;
  }

  function getCourseId(params: { courseId: string }): CourseId {
    if (
      !params.courseId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.courseId,
      )
    )
      throw new DomainError("bad_request", "Invalid course ID");
    return params.courseId as CourseId;
  }

  function getModuleId(params: { moduleId: string }): ModuleId {
    if (
      !params.moduleId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.moduleId,
      )
    )
      throw new DomainError("bad_request", "Invalid module ID");
    return params.moduleId as ModuleId;
  }

  function getLessonId(params: { lessonId: string }): LessonId {
    if (
      !params.lessonId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.lessonId,
      )
    )
      throw new DomainError("bad_request", "Invalid lesson ID");
    return params.lessonId as LessonId;
  }

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/:courseId/content
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId/content",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      return contentService.getCourseContent(
        actor,
        organizationId,
        courseId,
        request.id,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/modules
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/modules",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      const body = request.body as {
        title?: string;
        description?: string | null;
      };
      if (!body.title)
        throw new DomainError("bad_request", "Module title is required");
      const result = await contentService.createModule(
        actor,
        organizationId,
        courseId,
        body.title,
        body.description,
      );
      reply.code(201);
      return result;
    },
  );

  // ---------------------------------------------------------------------------
  // PATCH /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId
  // ---------------------------------------------------------------------------
  app.patch(
    "/v1/organizations/:organizationId/courses/:courseId/modules/:moduleId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        moduleId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      const moduleId = getModuleId(params);
      const body = request.body as {
        title?: string;
        description?: string | null;
      };
      return contentService.updateModule(
        actor,
        organizationId,
        courseId,
        moduleId,
        {
          title: body.title,
          description:
            body.description !== undefined ? body.description : undefined,
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId
  // ---------------------------------------------------------------------------
  app.delete(
    "/v1/organizations/:organizationId/courses/:courseId/modules/:moduleId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        moduleId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      const moduleId = getModuleId(params);
      await contentService.deleteModule(
        actor,
        organizationId,
        courseId,
        moduleId,
      );
      reply.code(204);
      return;
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        moduleId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      const moduleId = getModuleId(params);
      const body = request.body as {
        title?: string;
        content_markdown?: string;
        estimated_minutes?: number | null;
      };
      if (!body.title)
        throw new DomainError("bad_request", "Lesson title is required");
      const result = await contentService.createLesson(
        actor,
        organizationId,
        courseId,
        moduleId,
        body.title,
        body.content_markdown,
        body.estimated_minutes,
      );
      reply.code(201);
      return result;
    },
  );

  // ---------------------------------------------------------------------------
  // PATCH /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId
  // ---------------------------------------------------------------------------
  app.patch(
    "/v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        moduleId: string;
        lessonId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      const moduleId = getModuleId(params);
      const lessonId = getLessonId(params);
      const body = request.body as {
        title?: string;
        content_markdown?: string;
        estimated_minutes?: number | null;
      };
      return contentService.updateLesson(
        actor,
        organizationId,
        courseId,
        moduleId,
        lessonId,
        {
          title: body.title,
          contentMarkdown: body.content_markdown,
          estimatedMinutes:
            body.estimated_minutes !== undefined
              ? body.estimated_minutes
              : undefined,
        },
      );
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId/publish
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/:courseId/modules/:moduleId/lessons/:lessonId/publish",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
        moduleId: string;
        lessonId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      const moduleId = getModuleId(params);
      const lessonId = getLessonId(params);
      return contentService.publishLesson(
        actor,
        organizationId,
        courseId,
        moduleId,
        lessonId,
      );
    },
  );
};
