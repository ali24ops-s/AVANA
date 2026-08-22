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
        let courseId: string | undefined;

        if (body.context.lessonId !== undefined) {
          if (
            typeof body.context.lessonId !== "string" ||
            !UUID_RE.test(body.context.lessonId)
          ) {
            throw new DomainError("bad_request", "Invalid lessonId UUID format");
          }
          lessonId = body.context.lessonId;
        }

        if (body.context.courseId !== undefined) {
          if (
            typeof body.context.courseId !== "string" ||
            !UUID_RE.test(body.context.courseId)
          ) {
            throw new DomainError("bad_request", "Invalid courseId UUID format");
          }
          courseId = body.context.courseId;
        }

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
