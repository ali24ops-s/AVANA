/**
 * AI Study Assistant HTTP routes.
 *
 * Canonical endpoint:
 *   POST /v1/ai/ask — Ask question to AI Study Assistant (Lesson or Dashboard mode)
 *   GET  /v1/ai/conversations/:conversationId — Get conversation message history
 *   DELETE /v1/ai/conversations/:conversationId — Delete conversation history
 *
 * Strictly authenticated and authorized against IDOR vulnerabilities.
 */

import type { FastifyPluginAsync } from "fastify";
import {
  DomainError,
  type Actor,
  type CourseId,
  type LessonId,
  type OrganizationId,
} from "@avana/domain";
import { StudyAssistantService } from "./assistant-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import type { AssistantConversationStore } from "./assistant-store.js";
import type { LessonStore, ModuleStore } from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { EntitlementService } from "../commerce/entitlement-service.js";

export interface AssistantRouteOptions {
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  assistantGateway: ModelGateway;
  conversationStore: AssistantConversationStore;
  lessonStore: LessonStore;
  moduleStore: ModuleStore;
  courseStore: CourseStore;
  organizationStore: OrganizationStore;
  auditService?: AuditService;
  systemOrganizationId?: OrganizationId;
  entitlementService?: EntitlementService;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const assistantRoutes: FastifyPluginAsync<
  AssistantRouteOptions
> = async (app, opts) => {
  const {
    sessionService,
    userStore,
    assistantGateway,
    conversationStore,
    lessonStore,
    moduleStore,
    courseStore,
    organizationStore,
    auditService,
    systemOrganizationId,
    entitlementService,
  } = opts;

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });

  const service = new StudyAssistantService(
    assistantGateway,
    conversationStore,
    lessonStore,
    moduleStore,
    courseStore,
    organizationStore,
    undefined,
    auditService,
    systemOrganizationId,
    entitlementService,
  );

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

  async function resolveCourseIdForActor(
    rawParam: string,
    actor: Actor,
  ): Promise<CourseId> {
    const clean = rawParam.trim();
    if (!clean) {
      throw new DomainError("bad_request", "Invalid courseId format");
    }

    if (actor.role === "platform_admin" || actor.globalRole === "platform_admin") {
      if (courseStore && typeof courseStore.findByIdOrSlug === "function") {
        const resolved = await courseStore.findByIdOrSlug(clean);
        if (resolved && resolved.course && resolved.course.deletedAt === null) {
          return resolved.course.id;
        }
      }
      if (courseStore && typeof courseStore.findById === "function" && UUID_RE.test(clean)) {
        const course = await courseStore.findById(clean as CourseId);
        if (course && course.deletedAt === null) {
          return course.id;
        }
      }
      throw new DomainError("not_found", "Course not found");
    }

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
    throw new DomainError("bad_request", "Invalid courseId format");
  }

  // ---------------------------------------------------------------------------
  // POST /v1/ai/ask — Canonical Ask endpoint
  // ---------------------------------------------------------------------------
  app.post(
    "/v1/ai/ask",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const body = request.body as
        | {
            message?: unknown;
            context?: {
              type?: unknown;
              lessonId?: unknown;
              courseId?: unknown;
            };
            conversationId?: unknown;
          }
        | undefined;

      if (!body || typeof body !== "object") {
        throw new DomainError("bad_request", "Missing request body");
      }

      if (typeof body.message !== "string" || body.message.trim().length === 0) {
        throw new DomainError("bad_request", "Message must be a non-empty string");
      }

      if (body.conversationId !== undefined) {
        if (
          typeof body.conversationId !== "string" ||
          !UUID_RE.test(body.conversationId)
        ) {
          throw new DomainError("bad_request", "Invalid conversationId UUID format");
        }
      }

      let context: { type: "lesson" | "dashboard"; lessonId?: string; courseId?: string } | undefined;
      if (body.context) {
        const type = body.context.type === "lesson" ? "lesson" : "dashboard";
        let lessonId: string | undefined;

        let lessonDerivedCourseId: string | undefined;
        if (body.context.lessonId !== undefined) {
          if (
            typeof body.context.lessonId !== "string" ||
            !UUID_RE.test(body.context.lessonId)
          ) {
            throw new DomainError("bad_request", "Invalid lessonId UUID format");
          }
          lessonId = body.context.lessonId;

          const lesson = await lessonStore.findById(lessonId as LessonId);
          if (lesson && lesson.deletedAt === null) {
            const moduleRecord = await moduleStore.findById(lesson.moduleId);
            if (moduleRecord && moduleRecord.deletedAt === null) {
              lessonDerivedCourseId = moduleRecord.courseId;
            }
          }
        }

        let resolvedCourseId: string | undefined;
        if (body.context.courseId !== undefined) {
          if (
            typeof body.context.courseId !== "string" ||
            !body.context.courseId.trim()
          ) {
            throw new DomainError("bad_request", "Invalid courseId format");
          }
          resolvedCourseId = await resolveCourseIdForActor(body.context.courseId, actor);
        }

        if (lessonDerivedCourseId && resolvedCourseId) {
          if (lessonDerivedCourseId !== resolvedCourseId) {
            throw new DomainError("bad_request", "The specified lesson does not belong to the provided course");
          }
        }

        const courseId = resolvedCourseId || lessonDerivedCourseId;

        context = { type, lessonId, courseId };
      }

      const result = await service.ask(
        actor,
        {
          message: body.message,
          context,
          conversationId: body.conversationId as string | undefined,
        },
        request.id,
      );

      reply.code(200);
      return {
        request_id: request.id,
        answer: result.answer,
        conversationId: result.conversationId,
        sources: result.sources,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // GET /v1/ai/conversations/:conversationId — Get conversation history
  // ---------------------------------------------------------------------------
  app.get(
    "/v1/ai/conversations/:conversationId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { conversationId: string };

      if (!params.conversationId || !UUID_RE.test(params.conversationId)) {
        throw new DomainError("bad_request", "Invalid conversation ID format");
      }

      const result = await service.getConversation(actor, params.conversationId);
      return {
        request_id: request.id,
        conversationId: result.conversation.id,
        messages: result.messages,
      };
    },
  );

  // ---------------------------------------------------------------------------
  // DELETE /v1/ai/conversations/:conversationId — Delete conversation
  // ---------------------------------------------------------------------------
  app.delete(
    "/v1/ai/conversations/:conversationId",
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const actor = getActor(request);
      const params = request.params as { conversationId: string };

      if (!params.conversationId || !UUID_RE.test(params.conversationId)) {
        throw new DomainError("bad_request", "Invalid conversation ID format");
      }

      await service.deleteConversation(actor, params.conversationId);
      return {
        request_id: request.id,
        ok: true,
      };
    },
  );
};
