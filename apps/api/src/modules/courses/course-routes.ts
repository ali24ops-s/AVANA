/**
 * Course HTTP routes.
 *
 * Per PR-9 acceptance criteria:
 * - Courses are always organization-scoped.
 * - No course lookup by ID alone.
 * - Authorization delegated to domain policy layer.
 * - Routes remain thin; business logic in CourseService.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
  type CourseId,
  type OrganizationId,
} from "@avana/domain";
import { CourseService } from "./course-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { CourseStore } from "./course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { AuditService } from "../../observability/audit-service.js";

export interface CourseRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  courseStore: CourseStore;
  organizationStore: OrganizationStore;
  auditService?: AuditService;
  systemOrganizationId?: OrganizationId;
}

export const courseRoutes: FastifyPluginAsync<CourseRouteOptions> = async (
  app,
  opts,
) => {
  const {
    sessionService,
    userStore,
    courseStore,
    organizationStore,
    auditService,
    systemOrganizationId,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const courseService = new CourseService(
    courseStore,
    async (actor, organizationId) => {
      const membership = await organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Organization not found");
      }
      return membership;
    },
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
   * Helper to validate and extract organization ID from params.
   */
  function getOrganizationId(params: {
    organizationId: string;
  }): OrganizationId {
    if (
      !params.organizationId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.organizationId,
      )
    ) {
      throw new DomainError("bad_request", "Invalid organization ID");
    }
    return params.organizationId as OrganizationId;
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

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses — Create a course
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };
      const organizationId = getOrganizationId(params);
      const body = request.body as {
        title?: string;
        subject?: string | null;
        exam_at?: string | null;
      };

      if (
        !body.title ||
        typeof body.title !== "string" ||
        body.title.trim().length === 0
      ) {
        throw new DomainError("bad_request", "Course title is required");
      }

      const course = await courseService.createCourse(
        actor,
        organizationId,
        body.title.trim(),
        body.subject ?? null,
        body.exam_at ?? null,
      );

      reply.code(201);
      return {
        request_id: request.id,
        course: {
          id: course.id,
          title: course.name,
          subject: course.subject,
          exam_at: course.examDate,
          created_at: course.createdAt,
          updated_at: course.updatedAt,
          archived: course.deletedAt !== null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses — List courses
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };
      const organizationId = getOrganizationId(params);

      const courses = await courseService.listCourses(actor, organizationId);

      return {
        request_id: request.id,
        items: courses.map((c) => ({
          id: c.id,
          title: c.name,
          subject: c.subject,
          exam_at: c.examDate,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          archived: c.deletedAt !== null,
        })),
        pagination: {
          limit: Math.max(1, courses.length),
          next_cursor: null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/my — List user's selected courses
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/my",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };
      const organizationId = getOrganizationId(params);

      const courses = await courseService.listMyCourses(actor, organizationId);

      return {
        request_id: request.id,
        items: courses.map((c) => ({
          id: c.id,
          title: c.name,
          subject: c.subject,
          exam_at: c.examDate,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          archived: c.deletedAt !== null,
        })),
        pagination: {
          limit: Math.max(1, courses.length),
          next_cursor: null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/popular — List popular courses
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/popular",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };
      const organizationId = getOrganizationId(params);

      const courses = await courseService.listPopularCourses(
        actor,
        organizationId,
        8,
      );

      return {
        request_id: request.id,
        items: courses.map((c) => ({
          id: c.id,
          title: c.name,
          subject: c.subject,
          exam_at: c.examDate,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          archived: c.deletedAt !== null,
        })),
        pagination: {
          limit: 8,
          next_cursor: null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // POST /v1/organizations/:organizationId/courses/my — Add a course to user's list
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/organizations/:organizationId/courses/my",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };
      const organizationId = getOrganizationId(params);
      const body = request.body as {
        course_id?: string;
        courseId?: string;
      };

      const rawCourseId = body.course_id ?? body.courseId;
      if (
        !rawCourseId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          rawCourseId,
        )
      ) {
        throw new DomainError("bad_request", "Valid course ID is required");
      }

      await courseService.addMyCourse(
        actor,
        organizationId,
        rawCourseId as CourseId,
      );

      reply.code(200);
      return {
        request_id: request.id,
        success: true,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // PUT /v1/organizations/:organizationId/courses/my — Atomically sync user's courses
  // ---------------------------------------------------------------------------
  app.put(
    "/v1/organizations/:organizationId/courses/my",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { organizationId: string };
      const organizationId = getOrganizationId(params);
      const body = request.body as {
        course_ids?: string[];
        courseIds?: string[];
      };

      const rawCourseIds = body.course_ids ?? body.courseIds ?? [];
      if (!Array.isArray(rawCourseIds)) {
        throw new DomainError("bad_request", "course_ids must be an array");
      }

      for (const id of rawCourseIds) {
        if (
          !id ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          )
        ) {
          throw new DomainError("bad_request", `Invalid course ID: ${id}`);
        }
      }

      const courses = await courseService.syncMyCourses(
        actor,
        organizationId,
        rawCourseIds as CourseId[],
      );

      return {
        request_id: request.id,
        items: courses.map((c) => ({
          id: c.id,
          title: c.name,
          subject: c.subject,
          exam_at: c.examDate,
          created_at: c.createdAt,
          updated_at: c.updatedAt,
          archived: c.deletedAt !== null,
        })),
        pagination: {
          limit: Math.max(1, courses.length),
          next_cursor: null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /v1/organizations/:organizationId/courses/my/:courseId — Remove course from user's list
  // ---------------------------------------------------------------------------
  app.delete(
    "/v1/organizations/:organizationId/courses/my/:courseId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);

      await courseService.removeMyCourse(actor, organizationId, courseId);

      reply.code(204);
      return;
    },
  );


  // ---------------------------------------------------------------------------
  // GET /v1/organizations/:organizationId/courses/:courseId — Get course
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/organizations/:organizationId/courses/:courseId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);

      const course = await courseService.getCourse(
        actor,
        organizationId,
        courseId,
      );

      return {
        request_id: request.id,
        course: {
          id: course.id,
          title: course.name,
          subject: course.subject,
          exam_at: course.examDate,
          created_at: course.createdAt,
          updated_at: course.updatedAt,
          archived: course.deletedAt !== null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // PATCH /v1/organizations/:organizationId/courses/:courseId — Update course
  // ---------------------------------------------------------------------------
  app.patch(
    "/v1/organizations/:organizationId/courses/:courseId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);
      const body = request.body as {
        title?: string;
        subject?: string | null;
        exam_at?: string | null;
      };

      const course = await courseService.updateCourse(
        actor,
        organizationId,
        courseId,
        {
          title: body.title,
          subject: body.subject !== undefined ? body.subject : undefined,
          examAt: body.exam_at !== undefined ? body.exam_at : undefined,
        },
      );

      return {
        request_id: request.id,
        course: {
          id: course.id,
          title: course.name,
          subject: course.subject,
          exam_at: course.examDate,
          created_at: course.createdAt,
          updated_at: course.updatedAt,
          archived: course.deletedAt !== null,
        },
      };
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /v1/organizations/:organizationId/courses/:courseId — Archive course
  // ---------------------------------------------------------------------------
  app.delete(
    "/v1/organizations/:organizationId/courses/:courseId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const params = request.params as {
        organizationId: string;
        courseId: string;
      };
      const organizationId = getOrganizationId(params);
      const courseId = getCourseId(params);

      await courseService.archiveCourse(actor, organizationId, courseId);

      reply.code(204);
      return;
    },
  );
};
