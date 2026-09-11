/**
 * Admin HTTP routes (Phase 1).
 */

import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import { AdminService } from "./admin-service.js";
import type { AdminStore } from "./admin-store.js";
import {
  Roles,
  asUserId,
  asOrganizationId,
  asDocumentId,
  asProductId,
  asContentPackId,
  buildAdminContentPackPreview,
  type Role,
  type CourseId,
  type LessonId,
} from "@avana/domain";
import type { DocumentProcessingService } from "../documents/document-processing-service.js";
import type { DocumentService } from "../documents/document-service.js";
import type {
  GenerationQueue,
  GenerationJobPayload,
} from "../generation/generation-queue.js";
import type { GenerationJobStore } from "../generation/generation-jobs-store.js";
import { getPromptRegistry } from "../generation/prompt-registry.js";
import type { OfficialContentService } from "./official-content-service.js";
import type { ContentPackStore } from "../library/library-store.js";
import type { CommerceStore } from "../commerce/commerce-store.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { DeviceService } from "../identity/device-service.js";
import type { ContentExportService } from "./content-export-service.js";
import type { ContentImportService } from "./content-import-service.js";
import type { ExportScope } from "./content-export-import-types.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { CourseStore } from "../courses/course-store.js";
import { DomainError } from "@avana/domain";

export interface AdminRouteOptions extends AuthMiddlewareDeps {
  adminStore: AdminStore;
  deviceService?: DeviceService;
  documentProcessingService?: DocumentProcessingService;
  documentService?: DocumentService;
  generationQueue?: GenerationQueue;
  generationJobStore?: GenerationJobStore;
  officialContentService?: OfficialContentService;
  contentPackStore?: ContentPackStore;
  commerceStore?: CommerceStore;
  auditService?: AuditService;
  contentExportService?: ContentExportService;
  contentImportService?: ContentImportService;
  systemOrganizationId?: string;
  organizationStore?: OrganizationStore;
  courseStore?: CourseStore;
}

export const adminRoutes: FastifyPluginAsync<AdminRouteOptions> = async (
  app,
  opts,
) => {
  const { sessionService, userStore, adminStore } = opts;
  const adminService = new AdminService(adminStore);
  const { requireAuth, requireRole } = makeAuthMiddleware({ sessionService, userStore });

  // All routes here require platform_admin, EXCEPT content export and course hierarchy reading for content workers
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", async (request, reply) => {
    const rawPath = request.url.split("?")[0];
    const isWorkerAllowed =
      rawPath.endsWith("/content/export") ||
      rawPath.endsWith("/content/import/validate") ||
      rawPath.endsWith("/content/import") ||
      rawPath.endsWith("/courses") ||
      (rawPath.includes("/courses/") && rawPath.endsWith("/hierarchy")) ||
      rawPath.includes("/content-studio/");

    if (isWorkerAllowed) {
      const user = (request as any).user;
      if (
        user &&
        (user.globalRole === Roles.platform_admin ||
          user.role === Roles.platform_admin ||
          user.globalRole === Roles.content_worker ||
          user.role === Roles.content_worker ||
          user.role === Roles.organization_admin ||
          user.role === Roles.course_editor)
      ) {
        return;
      }
      throw new DomainError("forbidden", "Access denied. Insufficient permissions.");
    }

    await requireRole(Roles.platform_admin)(request, reply);
  });

  app.get("/dashboard", async (_request, reply) => {
    const stats = await adminService.getDashboardStats();
    return reply.send(stats);
  });

  app.get("/users", async (request, reply) => {
    const query = request.query as { page?: string; pageSize?: string; search?: string; role?: string; status?: string };
    const page = query.page ? parseInt(query.page, 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20;
    
    const result = await adminService.listUsers(page, pageSize, query.search, query.role, query.status);
    return reply.send(result);
  });

  app.get("/generation", async (request, reply) => {
    const query = request.query as { page?: string; pageSize?: string; status?: string };
    const page = query.page ? parseInt(query.page, 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20;
    
    const result = await adminService.listGenerationJobs(page, pageSize, query.status);
    return reply.send(result);
  });

  app.get("/system/integrity", async (_request, reply) => {
    const report = await adminService.getDataIntegrityReport();
    return reply.send(report);
  });

  // --- Phase 2 ---

  app.get("/courses", async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string; search?: string };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const data = await opts.adminStore.listCourses({ page, pageSize, search: query.search });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list courses");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/documents", async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string; search?: string; status?: string };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const data = await opts.adminStore.listDocuments({ page, pageSize, search: query.search, status: query.status });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list documents");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/documents/:id", async (request, reply) => {
    try {
      const params = request.params as { id: string }; void params.id;
      const data = await opts.adminStore.getDocument(params.id);
      if (!data) return reply.status(404).send({ code: "not_found" });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to get document");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.delete("/documents/:id", async (request, reply) => {
    try {
      const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
      const params = request.params as { id: string };
      
      const doc = await opts.adminStore.getDocument(params.id);
      if (!doc) return reply.status(404).send({ code: "not_found" });
      
      if (!opts.documentService) {
        return reply.status(500).send({ code: "internal_error", message: "DocumentService not available" });
      }

      await opts.documentService.adminDeleteDocument(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role as Role },
        asOrganizationId(doc.organizationId as unknown as import("@avana/domain").UUID),
        asDocumentId(params.id as unknown as import("@avana/domain").UUID)
      );

      reply.code(204);
      return;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      request.log.error({ err: error }, "Failed to delete document");
      return reply.status(500).send({ code: "internal_error", message: err.message || "Unknown error" });
    }
  });

  app.get("/documents/:id/download", async (request, reply) => {
    try {
      const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
      const params = request.params as { id: string };
      
      const doc = await opts.adminStore.getDocument(params.id);
      if (!doc) return reply.status(404).send({ code: "not_found" });
      
      if (!opts.documentService) {
        return reply.status(500).send({ code: "internal_error", message: "DocumentService not available" });
      }

      const { stream, sizeBytes, mimeType, originalName } = await opts.documentService.adminDownloadDocument(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role as Role },
        asOrganizationId(doc.organizationId as unknown as import("@avana/domain").UUID),
        asDocumentId(params.id as unknown as import("@avana/domain").UUID)
      );

      reply
        .header("Content-Type", mimeType)
        .header("Content-Disposition", `attachment; filename="${originalName}"`)
        .header("Content-Length", sizeBytes)
        .header("Cache-Control", "private, max-age=3600")
        .send(stream);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      request.log.error({ err: error }, "Failed to download document");
      if (err.code === "not_found" || err.message === "Document not found") {
        return reply.status(404).send({ code: "not_found" });
      }
      return reply.status(500).send({ code: "internal_error", message: err.message || "Unknown error" });
    }
  });

  app.get("/system/health", async (request, reply) => {
    try {
      const data = await opts.adminStore.getSystemHealth();
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to get system health");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/system/logs", async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string; level?: string };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const data = await opts.adminStore.listLogs({ page, pageSize, level: query.level });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list logs");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/system/audit", async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string; search?: string; action?: string; entityType?: string; adminEmail?: string };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const data = await opts.adminStore.listAuditLogs({
        page,
        pageSize,
        search: query.search,
        action: query.action,
        entityType: query.entityType,
        adminEmail: query.adminEmail,
      });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to get audit logs");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/generation/:id", async (request, reply) => {
    try {
      const params = request.params as { id: string };
      const data = await opts.adminStore.getGenerationJob(params.id);
      if (!data) return reply.status(404).send({ code: "not_found" });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to get generation job");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/content/courses/:id/hierarchy", async (request, reply) => {
    try {
      const params = request.params as { id: string };
      const data = await opts.adminStore.getCourseHierarchy(params.id);
      if (!data) return reply.status(404).send({ code: "not_found" });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to get course hierarchy");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/content/lessons", async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string; search?: string };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const data = await opts.adminStore.listLessons({ page, pageSize, search: query.search });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list lessons");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/content/flashcards", async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string; search?: string };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const data = await opts.adminStore.listFlashcards({ page, pageSize, search: query.search });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list flashcards");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/content/exams", async (request, reply) => {
    try {
      const query = request.query as { page?: string; pageSize?: string; search?: string };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);
      const data = await opts.adminStore.listExams({ page, pageSize, search: query.search });
      return reply.send(data);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list exams");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Content Export & Import Endpoints
  // ---------------------------------------------------------------------------

  app.post("/content/export", async (request, reply) => {
    try {
      if (!opts.contentExportService) {
        return reply.status(503).send({
          code: "export_service_unavailable",
          message: "Content export service is not configured",
        });
      }

      const body = (request.body || {}) as {
        courseId?: string;
        moduleIds?: string[];
        lessonIds?: string[];
        scope?: ExportScope;
        organizationId?: string;
      };
      const query = (request.query || {}) as { organizationId?: string; courseId?: string };
      let targetOrgId = body.organizationId || query.organizationId;
      const targetCourseId = body.courseId || query.courseId;

      if (!targetOrgId && targetCourseId && opts.courseStore) {
        const foundCourse = await opts.courseStore.findById(targetCourseId as any);
        if (foundCourse?.organizationId) {
          targetOrgId = foundCourse.organizationId;
        }
      }

      if (!targetOrgId) {
        targetOrgId =
          opts.systemOrganizationId || "00000000-0000-0000-0000-000000000001";
      }

      // Security check: non-platform_admin users (such as content_worker)
      // cannot export courses outside of the organizations they belong to.
      const user = (request as any).user;
      const isPlatformAdmin =
        user?.globalRole === Roles.platform_admin || user?.role === Roles.platform_admin;

      if (!isPlatformAdmin && user?.userId && opts.organizationStore) {
        const memberships = await opts.organizationStore.listMembershipsByUserId(user.userId);
        const hasAccess = memberships.some((m) => m.organizationId === targetOrgId);
        if (!hasAccess) {
          return reply.status(403).send({
            code: "forbidden",
            message: "دسترسی به محتوای این سازمان برای حساب کاربری شما مجاز نیست.",
          });
        }
      }

      const zipBuffer = await opts.contentExportService.exportContent(targetOrgId, {
        courseId: targetCourseId,
        moduleIds: body.moduleIds,
        lessonIds: body.lessonIds,
        scope: body.scope,
      });

      const filename = `avana-content-export-${Date.now()}.zip`;
      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(zipBuffer);
    } catch (err: unknown) {
      request.log.error({ err }, "Content export failed");
      const message = err instanceof Error ? err.message : "Export failed";
      return reply.status(400).send({ code: "export_failed", message });
    }
  });

  app.post("/content/import/validate", async (request, reply) => {
    try {
      if (!opts.contentImportService) {
        return reply.status(503).send({
          code: "import_service_unavailable",
          message: "Content import service is not configured",
        });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          code: "bad_request",
          message: "No ZIP file uploaded",
        });
      }

      const zipBuffer = await file.toBuffer();
      const user = (request as unknown as { user?: { userId: string } }).user;
      const actorId = user?.userId || "00000000-0000-0000-0000-000000000001";

      const query = (request.query || {}) as { organizationId?: string };
      const targetOrgId =
        query.organizationId ||
        opts.systemOrganizationId ||
        "00000000-0000-0000-0000-000000000001";

      const isPlatformAdmin =
        (user as any)?.globalRole === Roles.platform_admin || (user as any)?.role === Roles.platform_admin;

      if (!isPlatformAdmin && (user as any)?.userId && opts.organizationStore) {
        const memberships = await opts.organizationStore.listMembershipsByUserId((user as any).userId);
        const hasAccess = memberships.some((m) => m.organizationId === targetOrgId);
        if (!hasAccess) {
          return reply.status(403).send({
            code: "forbidden",
            message: "دسترسی به این سازمان برای حساب کاربری شما مجاز نیست.",
          });
        }
      }

      const plan = await opts.contentImportService.validatePackage(
        zipBuffer,
        actorId,
        targetOrgId,
      );

      return reply.send({ success: true, plan });
    } catch (err: unknown) {
      request.log.error({ err }, "Content import validation failed");
      const message = err instanceof Error ? err.message : "Validation failed";
      return reply.status(400).send({ code: "validation_failed", message });
    }
  });

  app.post("/content/import", async (request, reply) => {
    try {
      if (!opts.contentImportService) {
        return reply.status(503).send({
          code: "import_service_unavailable",
          message: "Content import service is not configured",
        });
      }

      const user = (request as unknown as { user?: { userId: string } }).user;
      const actorId = user?.userId || "00000000-0000-0000-0000-000000000001";

      const query = (request.query || {}) as { organizationId?: string };
      const body = (request.body || {}) as {
        planId?: string;
        packageChecksum?: string;
        onConflict?: "skip" | "error";
        organizationId?: string;
      };

      const targetOrgId =
        body.organizationId ||
        query.organizationId ||
        opts.systemOrganizationId ||
        "00000000-0000-0000-0000-000000000001";

      const isPlatformAdmin =
        (user as any)?.globalRole === Roles.platform_admin || (user as any)?.role === Roles.platform_admin;

      if (!isPlatformAdmin && (user as any)?.userId && opts.organizationStore) {
        const memberships = await opts.organizationStore.listMembershipsByUserId((user as any).userId);
        const hasAccess = memberships.some((m) => m.organizationId === targetOrgId);
        if (!hasAccess) {
          return reply.status(403).send({
            code: "forbidden",
            message: "دسترسی به این سازمان برای حساب کاربری شما مجاز نیست.",
          });
        }
      }

      if (!body.planId) {
        return reply.status(400).send({
          code: "bad_request",
          message: "planId is required to execute an import",
        });
      }

      const result = await opts.contentImportService.executeImport(
        body.planId,
        actorId,
        targetOrgId,
        {
          onConflict: body.onConflict || "skip",
          packageChecksum: body.packageChecksum,
        },
      );

      return reply.send(result);
    } catch (err: unknown) {
      request.log.error({ err }, "Content import execution failed");
      const message = err instanceof Error ? err.message : "Import execution failed";
      return reply.status(400).send({ code: "import_failed", message });
    }
  });

  app.get("/generation/providers", async (_request, reply) => {
    // Determine active provider from process.env or fallback to 'gemini'
    const activeProvider = (
      process.env.AI_PRIMARY_PROVIDER ||
      process.env.AI_CONTENT_PROVIDER ||
      process.env.AI_PROVIDER ||
      "gemini"
    ).toLowerCase();
    const providers = [
      {
        name: "Gemini",
        id: "gemini",
        status: activeProvider === "gemini" ? "active" : "inactive",
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        priority: 1,
        health: "unknown",
      },
      {
        name: "GapGPT",
        id: "gapgpt",
        status: activeProvider === "gapgpt" ? "active" : "inactive",
        model: process.env.GAPGPT_MODEL || "gpt-5.6-luna",
        priority: 2,
        health: "unknown",
      },
      {
        name: "Groq",
        id: "groq",
        status: activeProvider === "groq" ? "active" : "inactive",
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        priority: 3,
        health: "unknown",
      },
      {
        name: "ArvanCloud AI",
        id: "arvancloud",
        status: activeProvider === "arvancloud" ? "active" : "inactive",
        model: process.env.ARVANCLOUD_MODEL || "DeepSeek-R1-qwen-7b-awq",
        priority: 4,
        health: "unknown",
      },
      {
        name: "Cloudflare AI",
        id: "cloudflare",
        status: activeProvider === "cloudflare" ? "active" : "inactive",
        model: process.env.CLOUDFLARE_AI_MODEL || "@cf/zai-org/glm-4.7-flash",
        priority: 5,
        health: "unknown",
      },
      {
        name: "Mock (Testing)",
        id: "mock",
        status: activeProvider === "mock" ? "active" : "inactive",
        model: "mock-model",
        priority: 0,
        health: "unknown",
      }
    ];
    return reply.send({ providers });
  });

  const handlePrompts = async (_request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    const activeProvider = (
      process.env.AI_PRIMARY_PROVIDER ||
      process.env.AI_CONTENT_PROVIDER ||
      process.env.AI_PROVIDER ||
      "gemini"
    ).toLowerCase();
    const prompts = getPromptRegistry({ provider: activeProvider });
    return reply.send({ prompts });
  };

  app.get("/prompts", handlePrompts);
  app.get("/generation/prompts", handlePrompts);

  app.get("/settings/features", async (_request, reply) => {
    const features = [
      { id: "f1", name: "AI Generation", status: "enabled", environment: "all" },
      { id: "f2", name: "Flashcards", status: "enabled", environment: "all" },
      { id: "f3", name: "Exam Mode", status: "enabled", environment: "all" },
      { id: "f4", name: "Study Assistant", status: "enabled", environment: "all" },
      { id: "f5", name: "Study Planner", status: "enabled", environment: "all" },
    ];
    return reply.send({ features });
  });

  app.get("/settings", async (_request, reply) => {
    const activeProvider = (
      process.env.AI_PRIMARY_PROVIDER ||
      process.env.AI_CONTENT_PROVIDER ||
      process.env.AI_PROVIDER ||
      "gemini"
    ).toLowerCase();
    const activeModel =
      activeProvider === "gemini"
        ? process.env.GEMINI_MODEL || "gemini-3.6-flash"
        : activeProvider === "gapgpt"
          ? process.env.GAPGPT_MODEL || "gpt-5.6-luna"
          : activeProvider === "groq"
            ? process.env.GROQ_MODEL || "openai/gpt-oss-120b"
            : activeProvider === "arvancloud"
              ? process.env.ARVANCLOUD_MODEL || "DeepSeek-R1-qwen-7b-awq"
              : process.env.CLOUDFLARE_AI_MODEL || "@cf/zai-org/glm-4.7-flash";

    const settings = {
      general: {
        appName: "AVANA",
        environment: process.env.NODE_ENV || "development",
        version: "1.0.0",
      },
      ai: {
        activeProvider,
        activeModel,
      },
      system: {
        database: "PostgreSQL",
        redis: process.env.REDIS_URL ? "Configured" : "Not Configured",
        storage: "S3 Compatible",
      }
    };
    return reply.send(settings);
  });

  app.get("/analytics", async (_request, reply) => {
    try {
      const data = await opts.adminStore.getAnalytics();
      return reply.send(data);
    } catch (error) {
      _request.log.error({ err: error }, "Failed to get analytics");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/analytics/ai", async (_request, reply) => {
    try {
      const data = await opts.adminStore.getAiAnalytics();
      return reply.send(data);
    } catch (error) {
      _request.log.error({ err: error }, "Failed to get ai analytics");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  // ---------------------------------------------------------------------------
  // Phase 4: Mutations
  // ---------------------------------------------------------------------------

  app.patch<{ Params: { id: string }; Body: { role: string } }>(
    "/users/:id/role",
    async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
      const adminId = user.userId;
      const { id } = request.params;
      const { role } = request.body || {};
      
      const validRoles = ["student", "teacher", "course_editor", "organization_admin", "support_agent", "platform_admin"];
      if (!role || !validRoles.includes(role)) {
        return reply.status(400).send({ code: "invalid_input", message: "Invalid role" });
      }

      try {
        await opts.adminStore.updateUserRole(adminId, id, role);
        return reply.status(200).send({ success: true });
      } catch (error: unknown) {
        const err = error as { message?: string };
        request.log.error({ err: error }, "Failed to update user role");
        if (err.message === "user_has_no_org") {
           return reply.status(409).send({ code: "conflict", message: "User does not belong to any organization." });
        }
        if (err.message === "multi_org_requires_explicit_handling") {
           return reply.status(409).send({ code: "conflict", message: "User belongs to multiple organizations; explicit organization handling is required." });
        }
        return reply.status(500).send({ code: "internal_error" });
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: { name?: string; subject?: string } }>(
    "/courses/:id",
    async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
      const adminId = user.userId;
      const { id } = request.params;
      const body = request.body || {};

      const payload: { name?: string; subject?: string } = {};
      if (typeof body.name === "string" && body.name.trim().length > 0) {
        payload.name = body.name.trim();
      }
      if (body.subject !== undefined) {
        if (typeof body.subject === "string") {
          payload.subject = body.subject.trim();
        }
      }

      if (Object.keys(payload).length === 0) {
        return reply.status(400).send({ code: "invalid_input", message: "No valid fields provided to update" });
      }

      try {
        await opts.adminStore.updateCourseMetadata(adminId, id, payload);
        return reply.status(200).send({ success: true });
      } catch (error: unknown) {
        const err = error as { message?: string };
        request.log.error({ err: error }, "Failed to update course");
        if (err.message === "not_found") {
          return reply.status(404).send({ code: "not_found" });
        }
        return reply.status(500).send({ code: "internal_error" });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/documents/:id/retry",
    async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
      const { id } = request.params;
      
      try {
        const doc = await opts.adminStore.getDocument(id);
        if (!doc) {
          return reply.status(404).send({ code: "not_found" });
        }
        
        if (doc.status !== "failed" && doc.status !== "error") {
          return reply.status(400).send({ code: "invalid_status", message: "Only failed documents can be retried" });
        }
        
        const orgId = (doc as { organizationId?: string }).organizationId;
        if (!orgId) throw new Error("Missing organizationId on document");

        // The audit log for the explicit retry intent
        await opts.adminStore.retryDocumentProcessing(user.userId, id);
        
        if (opts.documentProcessingService) {
          await opts.documentProcessingService.reprocessDocument(
            { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role as Role }, 
            asOrganizationId(orgId as unknown as import("@avana/domain").UUID), 
            asDocumentId(id as unknown as import("@avana/domain").UUID)
          );
        }
        
        return reply.status(200).send({ success: true });
      } catch (error: unknown) {
        const err = error as { message?: string };
        request.log.error({ err: error }, "Failed to retry document");
        return reply.status(500).send({ code: "internal_error", message: err.message || "Unknown error" });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/generation/:id/retry",
    async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
      const { id } = request.params;
      
      try {
        const job = await opts.adminStore.getGenerationJob(id);
        if (!job) {
          return reply.status(404).send({ code: "not_found" });
        }
        
        if (job.status !== "failed") {
          return reply.status(400).send({ code: "invalid_status", message: "Only failed generation jobs can be retried" });
        }
        
        if (!job.payload) {
          return reply.status(400).send({ code: "missing_payload", message: "Original job payload is missing, cannot retry" });
        }

        // Keep the manual audit log intent since queue might not emit one for 'retry' specifically
        await opts.adminStore.retryGenerationJob(user.userId, id);
        
        if (opts.generationQueue) {
          await opts.generationQueue.enqueueGenerationJob(job.payload as unknown as GenerationJobPayload);
        }
        
        return reply.status(200).send({ success: true });
      } catch (error: unknown) {
        const err = error as { message?: string };
        request.log.error({ err: error }, "Failed to retry generation job");
        return reply.status(500).send({ code: "internal_error", message: err.message || "Unknown error" });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Monetization & Commerce Routes
  // ---------------------------------------------------------------------------

  app.get("/commerce/stats", async (_request, reply) => {
    try {
      const stats = await adminService.getCommerceStats();
      return reply.send(stats);
    } catch (error) {
      _request.log.error({ err: error }, "Failed to get commerce stats");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/commerce/orders", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        search?: string;
        status?: string;
        from?: string;
        to?: string;
      };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);

      const result = await adminService.listCommerceOrders({
        page,
        pageSize,
        search: query.search,
        status: query.status,
        from: query.from,
        to: query.to,
      });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list commerce orders");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/commerce/payments", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        search?: string;
        gateway?: string;
        status?: string;
        from?: string;
        to?: string;
      };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);

      const result = await adminService.listCommercePayments({
        page,
        pageSize,
        search: query.search,
        gateway: query.gateway,
        status: query.status,
        from: query.from,
        to: query.to,
      });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list commerce payments");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/commerce/subscriptions", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        search?: string;
        status?: string;
      };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);

      const result = await adminService.listCommerceSubscriptions({
        page,
        pageSize,
        search: query.search,
        status: query.status,
      });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list commerce subscriptions");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/commerce/entitlements", async (request, reply) => {
    try {
      const query = request.query as {
        page?: string;
        pageSize?: string;
        search?: string;
        resourceType?: string;
        sourceType?: string;
        status?: string;
      };
      const page = parseInt(query.page || "1", 10);
      const pageSize = parseInt(query.pageSize || "20", 10);

      const result = await adminService.listCommerceEntitlements({
        page,
        pageSize,
        search: query.search,
        resourceType: query.resourceType,
        sourceType: query.sourceType,
        status: query.status,
      });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, "Failed to list commerce entitlements");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.get("/commerce/products", async (_request, reply) => {
    try {
      const productsList = await adminService.listCommerceProducts();
      return reply.send({ products: productsList });
    } catch (error) {
      _request.log.error({ err: error }, "Failed to list commerce products");
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.patch<{
    Params: { productId: string };
    Body: { active?: boolean; price?: number };
  }>("/commerce/products/:productId", async (request, reply) => {
    const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
    const { productId } = request.params;
    const body = request.body || {};

    if (body.active === undefined && body.price === undefined) {
      return reply.status(400).send({
        code: "invalid_input",
        message: "حداقل یکی از فیلدهای active یا price باید مشخص باشد.",
      });
    }

    if (
      body.price !== undefined &&
      (typeof body.price !== "number" || isNaN(body.price) || !Number.isInteger(body.price) || body.price < 0)
    ) {
      return reply.status(400).send({
        code: "invalid_input",
        message: "قیمت باید یک عدد صحیح نامنفی (به تومان) باشد.",
      });
    }

    try {
      const updated = await adminService.updateCommerceProduct(user.userId, productId, body);
      return reply.status(200).send({ success: true, product: updated });
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string };
      request.log.error({ err: error }, "Failed to update commerce product");

      if (err.message === "not_found") {
        return reply.status(404).send({ code: "not_found", message: "محصول یافت نشد." });
      }
      if (err.code === "bad_request" || (error instanceof DomainError && error.code === "bad_request")) {
        return reply.status(400).send({ code: "invalid_input", message: err.message || "ورودی نامعتبر است." });
      }
      return reply.status(500).send({ code: "internal_error", message: err.message || "خطای سرور" });
    }
  });

  app.post<{
    Body: {
      userId: string;
      resourceType: "subscription" | "course" | "content_pack" | "content";
      resourceId?: string | null;
      durationDays?: number;
    };
  }>("/commerce/grants", async (request, reply) => {
    const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
    const body = request.body || {};

    if (!body.userId) {
      return reply.status(400).send({ code: "invalid_input", message: "شناسه کاربر الزامی است." });
    }
    if (!["subscription", "course", "content_pack"].includes(body.resourceType)) {
      return reply.status(400).send({ code: "invalid_input", message: "نوع منبع معتبر نیست." });
    }
    if ((body.resourceType === "course" || body.resourceType === "content_pack") && !body.resourceId) {
      return reply.status(400).send({
        code: "invalid_input",
        message: "برای دوره یا بسته آموزشی، شناسه منبع الزامی است.",
      });
    }

    try {
      const entitlement = await adminService.grantCommerceEntitlement(user.userId, body);
      return reply.status(201).send({ success: true, entitlement });
    } catch (error: unknown) {
      const err = error as { message?: string };
      request.log.error({ err: error }, "Failed to grant commerce entitlement");

      if (err.message === "user_not_found") {
        return reply.status(404).send({ code: "not_found", message: "کاربر مورد نظر یافت نشد." });
      }
      if (err.message === "course_not_found") {
        return reply.status(404).send({ code: "not_found", message: "دوره آموزشی مورد نظر یافت نشد." });
      }
      if (err.message === "content_pack_not_found") {
        return reply.status(404).send({ code: "not_found", message: "بسته آموزشی مورد نظر یافت نشد." });
      }
      return reply.status(500).send({ code: "internal_error", message: err.message || "خطای سرور" });
    }
  });

  app.get<{ Params: { id: string } }>("/users/:id/commerce", async (request, reply) => {
    const { id } = request.params;
    try {
      const profile = await adminService.getUserCommerceProfile(id);
      return reply.send(profile);
    } catch (error: unknown) {
      const err = error as { message?: string };
      request.log.error({ err: error }, "Failed to get user commerce profile");

      if (err.message === "user_not_found") {
        return reply.status(404).send({ code: "not_found", message: "کاربر یافت نشد." });
      }
      return reply.status(500).send({ code: "internal_error" });
    }
  });

  app.post<{
    Params: { subscriptionId: string };
    Body: { reason?: string };
  }>("/commerce/subscriptions/:subscriptionId/cancel", async (request, reply) => {
    const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
    const { subscriptionId } = request.params;
    const body = request.body || {};

    try {
      const result = await adminService.cancelUserSubscription(
        user.userId,
        subscriptionId,
        body.reason,
      );
      return reply.status(200).send(result);
    } catch (error: unknown) {
      const err = error as { message?: string };
      request.log.error({ err: error }, "Failed to cancel commerce subscription");

      if (err.message === "not_found") {
        return reply.status(404).send({ code: "not_found", message: "اشتراک یافت نشد." });
      }
      if (err.message === "subscription_already_expired") {
        return reply.status(400).send({
          code: "subscription_already_expired",
          message: "این اشتراک قبلاً منقضی شده است و امکان لغو آن وجود ندارد.",
        });
      }
      return reply.status(500).send({ code: "internal_error", message: err.message || "خطای سرور" });
    }
  });

  app.post<{
    Params: { paymentId: string };
  }>("/commerce/payments/:paymentId/approve", async (request, reply) => {
    const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
    const { paymentId } = request.params;

    const result = await adminService.approvePayment(user.userId, paymentId);
    return reply.status(200).send(result);
  });

  app.post<{
    Params: { paymentId: string };
    Body: { reason: string };
  }>("/commerce/payments/:paymentId/reject", async (request, reply) => {
    const user = (request as unknown as { user: { userId: string; email: string; role: string } }).user;
    const { paymentId } = request.params;
    const body = request.body || ({} as { reason: string });

    if (!body.reason || !body.reason.trim()) {
      return reply.status(400).send({
        code: "invalid_input",
        message: "علت رد پرداخت الزامی است.",
      });
    }

    const result = await adminService.rejectPayment(
      user.userId,
      paymentId,
      body.reason,
    );
    return reply.status(200).send(result);
  });

  // ---------------------------------------------------------------------------
  // Official Content Studio Routes
  // ---------------------------------------------------------------------------

  if (opts.officialContentService) {
    const officialContentService = opts.officialContentService;

    // 1. Create Official Course
    app.post<{
      Body: { name: string; subject?: string | null; description?: string | null; examDate?: string | null };
    }>("/content-studio/courses", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const body = request.body || {};
      const course = await officialContentService.createOfficialCourse(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        body,
      );
      return reply.status(201).send({ success: true, course });
    });

    // 2. List Official Courses
    app.get("/content-studio/courses", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const coursesList = await officialContentService.listOfficialCourses(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
      );
      return reply.send({ courses: coursesList });
    });

    // 3. Trigger Official Content Generation (reuses canonical GenerationService)
    app.post<{
      Params: { id: string };
      Body: { documentId: string; lesson?: boolean; flashcards?: boolean; exam?: boolean; review_summary?: boolean; force?: boolean };
    }>("/content-studio/courses/:id/generate", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const body = request.body || {};
      if (!body.documentId) {
        return reply.status(400).send({ code: "bad_request", message: "documentId is required" });
      }

      const result = await officialContentService.triggerOfficialGeneration(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
        body.documentId,
        body,
      );
      return reply.send(result);
    });

    // 4. Review Workspace (inspects generated drafts & deterministic lesson mappings)
    app.get<{ Params: { id: string } }>("/content-studio/courses/:id/review", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const workspace = await officialContentService.getReviewWorkspace(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
      );
      return reply.send(workspace);
    });

    // 5. Approve Official Course (reuses ReviewService.acceptContent & enforces invariants)
    app.post<{ Params: { id: string } }>("/content-studio/courses/:id/approve", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const result = await officialContentService.approveOfficialCourse(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
      );
      return reply.send(result);
    });

    // 6. Set Product Pricing (separate from approval)
    app.post<{
      Params: { id: string };
      Body: { price: number; title?: string; description?: string };
    }>("/content-studio/courses/:id/pricing", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const body = request.body || {};
      const product = await officialContentService.setProductPricing(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
        body,
      );
      return reply.send({ success: true, product });
    });

    // 6.5 Set Lesson Pricing (Independent Content Pricing)
    app.post<{
      Params: { id: string };
      Body: { price: number; title?: string; description?: string; active?: boolean };
    }>("/content-studio/lessons/:id/pricing", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const body = request.body || {};
      const product = await officialContentService.createOrUpdateLessonProduct(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as LessonId,
        body,
      );
      return reply.send({ success: true, product });
    });

    // 6.6 Get Lesson Pricing Suggestion (Volume-Based Breakdown & Current Product Preview)
    app.get<{
      Params: { id: string };
    }>("/content-studio/lessons/:id/pricing-suggestion", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const suggestion = await officialContentService.getSuggestedPriceForLesson(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as LessonId,
      );
      return reply.send({ success: true, ...suggestion });
    });

    // 7. Validate Consistency
    app.get<{ Params: { id: string } }>("/content-studio/courses/:id/validate", async (request, reply) => {
      const { id } = request.params;
      const report = await officialContentService.validateConsistency(id as CourseId);
      return reply.send(report);
    });

    // 8. Publish Official Course (Course: published, Product: active)
    app.post<{ Params: { id: string } }>("/content-studio/courses/:id/publish", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const result = await officialContentService.publishOfficialCourse(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
      );
      return reply.send(result);
    });

    // 9. Archive Official Course
    app.post<{ Params: { id: string } }>("/content-studio/courses/:id/archive", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const result = await officialContentService.archiveOfficialCourse(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
      );
      return reply.send(result);
    });

    // 10. Delete Official Course (Draft / Generating / Review safe permanent deletion)
    app.delete<{
      Params: { id: string };
      Body: { confirmationName: string; deleteSourceDocuments?: boolean };
    }>("/content-studio/courses/:id", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const body = request.body || ({} as any);

      if (!body.confirmationName) {
        return reply.status(400).send({
          code: "bad_request",
          message: "تأیید نام دوره برای حذف الزامی است.",
        });
      }

      const result = await officialContentService.deleteOfficialCourse(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
        {
          confirmationName: body.confirmationName,
          deleteSourceDocuments: Boolean(body.deleteSourceDocuments),
        },
      );
      return reply.send(result);
    });

    // 11. Explicit Course Stale Generation Reconciliation
    app.post<{ Params: { id: string } }>("/content-studio/courses/:id/reconcile", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const { id } = request.params;
      const result = await officialContentService.reconcileCourse(
        { userId: asUserId(user.userId as unknown as import("@avana/domain").UUID), role: user.role },
        id as CourseId,
      );
      return reply.send(result);
    });

    // 12. Explicit Global Generation Stale Reconciliation
    app.post("/generation/reconcile", async (request, reply) => {
      const user = (request as unknown as { user: { userId: string; role: Role } }).user;
      const result = await officialContentService.reconcileAllStale({
        userId: asUserId(user.userId as unknown as import("@avana/domain").UUID),
        role: user.role,
      });
      return reply.send(result);
    });
  }

  // =========================================================================
  // Community Content Packs Review & Moderation Endpoints
  // =========================================================================

  // 1. List Community Content Packs
  app.get("/content-packs", async (request, reply) => {
    if (!opts.contentPackStore) {
      return reply.status(500).send({
        code: "internal_error",
        message: "ContentPackStore not configured",
      });
    }
    const query = request.query as {
      page?: string;
      pageSize?: string;
      status?: string;
      search?: string;
    };
    const page = Math.max(1, query.page ? parseInt(query.page, 10) : 1);
    const pageSize = Math.max(
      1,
      Math.min(100, query.pageSize ? parseInt(query.pageSize, 10) : 20),
    );

    const { items, totalCount } = await opts.contentPackStore.listAll({
      status: query.status,
      search: query.search,
      page,
      limit: pageSize,
    });

    const enrichedItems = await Promise.all(
      items.map(async (pack) => {
        const creatorInfo = await opts.contentPackStore!.getCreatorPublicInfo(
          pack.creatorUserId,
        );
        let product = null;
        if (opts.commerceStore) {
          product = await opts.commerceStore.findProductByTarget(
            "content_pack",
            pack.id,
          );
        }
        return {
          id: pack.id,
          title: pack.title,
          description: pack.description,
          subject: pack.subject,
          status: pack.status,
          usageCount: pack.usageCount,
          creator: {
            id: creatorInfo?.id ?? (pack.creatorUserId as string) ?? "",
            name: creatorInfo?.name ?? "کاربر آوانا",
          },
          stats: {
            sessionCount: pack.metadata.sessionCount ?? 0,
            flashcardCount: pack.metadata.flashcardCount ?? 0,
            quizQuestionCount: pack.metadata.quizQuestionCount ?? 0,
            estimatedReadingMinutes:
              pack.metadata.estimatedReadingMinutes ?? 12,
          },
          accessType: pack.metadata.accessType ?? "paid",
          rejectionReason: pack.metadata.rejectionReason ?? null,
          reviewedAt: pack.metadata.reviewedAt ?? null,
          pricing: {
            is_free: pack.metadata.accessType === "free",
            price: product?.price ?? 0,
            currency: product?.currency ?? "toman",
            product_id: product?.id ?? null,
          },
          product: product
            ? {
                id: product.id,
                code: product.code,
                price: product.price,
                currency: product.currency,
                active: product.active,
              }
            : null,
          publishedAt: pack.publishedAt,
          createdAt: pack.createdAt,
          updatedAt: pack.updatedAt,
        };
      }),
    );

    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    return reply.send({
      items: enrichedItems,
      totalCount,
      page,
      pageSize,
      totalPages,
      pagination: {
        page,
        limit: pageSize,
        total_count: totalCount,
        total_pages: totalPages,
      },
    });
  });

  // 2. Get Single Community Content Pack Detail for Review
  app.get<{ Params: { id: string } }>("/content-packs/:id", async (request, reply) => {
    if (!opts.contentPackStore) {
      return reply.status(500).send({
        code: "internal_error",
        message: "ContentPackStore not configured",
      });
    }
    const packId = asContentPackId(request.params.id as any);
    const pack = await opts.contentPackStore.findById(packId);
    if (!pack) {
      return reply.status(404).send({
        code: "not_found",
        message: "بسته آموزشی یافت نشد.",
      });
    }

    const [items, creatorInfo] = await Promise.all([
      opts.contentPackStore.findItemsByPackId(packId),
      opts.contentPackStore.getCreatorPublicInfo(pack.creatorUserId),
    ]);
    const preview = buildAdminContentPackPreview(items);

    let sourceDocument = null;
    if (
      pack.sourceDocumentId &&
      opts.adminStore &&
      typeof opts.adminStore.getDocument === "function"
    ) {
      try {
        const docRecord = await opts.adminStore.getDocument(pack.sourceDocumentId);
        if (docRecord) {
          sourceDocument = {
            id: docRecord.id,
            originalName: docRecord.originalName,
            mimeType: docRecord.mimeType,
            sizeBytes: docRecord.sizeBytes,
            status: docRecord.status,
            createdAt: docRecord.createdAt,
            downloadUrl: `/v1/admin/documents/${docRecord.id}/download`,
          };
        }
      } catch {
        // non-blocking fallback
      }
    }

    let product = null;
    if (opts.commerceStore) {
      product = await opts.commerceStore.findProductByTarget(
        "content_pack",
        pack.id,
      );
    }

    return reply.send({
      pack: {
        id: pack.id,
        title: pack.title,
        description: pack.description,
        subject: pack.subject,
        status: pack.status,
        usageCount: pack.usageCount,
        sourceDocumentId: pack.sourceDocumentId,
        creator: {
          id: creatorInfo?.id ?? (pack.creatorUserId as string) ?? "",
          name: creatorInfo?.name ?? "کاربر آوانا",
        },
        stats: {
          sessionCount: pack.metadata.sessionCount ?? 0,
          flashcardCount: pack.metadata.flashcardCount ?? 0,
          quizQuestionCount: pack.metadata.quizQuestionCount ?? 0,
          estimatedReadingMinutes:
            pack.metadata.estimatedReadingMinutes ?? 12,
        },
        accessType: pack.metadata.accessType ?? "paid",
        rejectionReason: pack.metadata.rejectionReason ?? null,
        reviewedAt: pack.metadata.reviewedAt ?? null,
        pricing: {
          is_free: pack.metadata.accessType === "free",
          price: product?.price ?? 0,
          currency: product?.currency ?? "toman",
          product_id: product?.id ?? null,
        },
        publishedAt: pack.publishedAt,
        createdAt: pack.createdAt,
        updatedAt: pack.updatedAt,
      },
      preview,
      sourceDocument,
      itemsCount: items.length,
      product: product
        ? {
            id: product.id,
            code: product.code,
            price: product.price,
            currency: product.currency,
            active: product.active,
          }
        : null,
    });
  });

  // 3. Approve Community Content Pack (Set accessType and price)
  app.post<{
    Params: { id: string };
    Body: { accessType: "free" | "paid"; price?: number };
  }>("/content-packs/:id/approve", async (request, reply) => {
    if (!opts.contentPackStore) {
      return reply.status(500).send({
        code: "internal_error",
        message: "ContentPackStore not configured",
      });
    }
    const user = (request as unknown as { user: { userId: string; role: Role } }).user;
    const packId = asContentPackId(request.params.id as any);
    const pack = await opts.contentPackStore.findById(packId);
    if (!pack) {
      return reply.status(404).send({
        code: "not_found",
        message: "بسته آموزشی یافت نشد.",
      });
    }

    const body = request.body || ({} as any);
    const accessType = body.accessType;
    if (accessType !== "free" && accessType !== "paid") {
      return reply.status(400).send({
        code: "bad_request",
        message: "نوع دسترسی (accessType) باید 'free' یا 'paid' باشد.",
      });
    }

    let activeProductRecord: any = null;

    if (accessType === "paid") {
      if (
        typeof body.price !== "number" ||
        !Number.isInteger(body.price) ||
        body.price <= 0
      ) {
        return reply.status(400).send({
          code: "bad_request",
          message:
            "برای بسته آموزشی پولی، قیمت معتبر به تومان الزامی است (بزرگتر از صفر).",
        });
      }

      if (opts.commerceStore) {
        const existingProduct = await opts.commerceStore.findProductByTarget(
          "content_pack",
          pack.id,
        );
        if (existingProduct) {
          activeProductRecord = await opts.commerceStore.updateProduct(
            existingProduct.id,
            {
              price: body.price,
              currency: "toman",
              active: true,
              title: pack.title,
              description: pack.description,
            },
          );
        } else {
          activeProductRecord = await opts.commerceStore.createProduct({
            id: asProductId(randomUUID()),
            code: `content_pack_${pack.id}`,
            type: "content_pack",
            title: pack.title,
            description: pack.description,
            price: body.price,
            currency: "toman",
            targetType: "content_pack",
            targetId: pack.id,
            durationDays: null,
            active: true,
            metadata: { contentPackId: pack.id },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          });
        }
      }
    } else {
      // accessType === "free"
      if (opts.commerceStore) {
        const existingProduct = await opts.commerceStore.findProductByTarget(
          "content_pack",
          pack.id,
        );
        if (existingProduct) {
          await opts.commerceStore.updateProduct(existingProduct.id, {
            active: false,
          });
        }
      }
    }

    const now = new Date().toISOString();
    const updatedMetadata = {
      ...pack.metadata,
      accessType,
      rejectionReason: null,
      reviewedAt: now,
      reviewedByUserId: user.userId,
    };

    const updatedPack = await opts.contentPackStore.updateStatus(
      pack.id,
      "published",
      updatedMetadata,
      now,
    );

    if (opts.auditService) {
      await opts.auditService.emit([
        {
          actorId: asUserId(user.userId as any),
          organizationId: pack.organizationId,
          action: "content_pack.approved",
          entityType: "content_pack",
          entityId: pack.id,
          createdAt: now,
          details: {
            accessType,
            price: accessType === "paid" ? body.price : 0,
            productId: activeProductRecord?.id ?? null,
          },
        },
      ]);
    }

    return reply.send({
      success: true,
      pack: updatedPack,
      product: activeProductRecord,
    });
  });

  // 4. Reject Community Content Pack
  app.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>("/content-packs/:id/reject", async (request, reply) => {
    if (!opts.contentPackStore) {
      return reply.status(500).send({
        code: "internal_error",
        message: "ContentPackStore not configured",
      });
    }
    const user = (request as unknown as { user: { userId: string; role: Role } }).user;
    const packId = asContentPackId(request.params.id as any);
    const pack = await opts.contentPackStore.findById(packId);
    if (!pack) {
      return reply.status(404).send({
        code: "not_found",
        message: "بسته آموزشی یافت نشد.",
      });
    }

    const body = request.body || {};

    if (opts.commerceStore) {
      const existingProduct = await opts.commerceStore.findProductByTarget(
        "content_pack",
        pack.id,
      );
      if (existingProduct) {
        await opts.commerceStore.updateProduct(existingProduct.id, {
          active: false,
        });
      }
    }

    const now = new Date().toISOString();
    const updatedMetadata = {
      ...pack.metadata,
      rejectionReason: body.reason?.trim() || null,
      reviewedAt: now,
      reviewedByUserId: user.userId,
    };

    const updatedPack = await opts.contentPackStore.updateStatus(
      pack.id,
      "rejected",
      updatedMetadata,
    );

    if (opts.auditService) {
      await opts.auditService.emit([
        {
          actorId: asUserId(user.userId as any),
          organizationId: pack.organizationId,
          action: "content_pack.rejected",
          entityType: "content_pack",
          entityId: pack.id,
          createdAt: now,
          details: {
            reason: body.reason?.trim() || null,
          },
        },
      ]);
    }

    return reply.send({
      success: true,
      pack: updatedPack,
    });
  });

  // -------------------------------------------------------------------------
  // Device & Single-Session Admin Management
  // -------------------------------------------------------------------------

  app.get("/users/:userId/devices", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const targetUser = await userStore.findById(userId as any);
    if (!targetUser) {
      throw new DomainError("not_found", "کاربر مورد نظر یافت نشد.");
    }

    const devices = opts.deviceService
      ? await opts.deviceService.listUserDevices(userId as any)
      : [];

    let subscriptionStatus = "inactive";
    if (opts.commerceStore) {
      const activeSub = await opts.commerceStore.findActiveSubscription(
        userId as any,
        new Date(),
      );
      if (activeSub) {
        subscriptionStatus = activeSub.status || "active";
      }
    }

    return reply.send({
      userId: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      subscriptionStatus,
      devices: devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        deviceName: d.deviceName,
        userAgent: d.userAgent,
        lastIp: d.lastIp,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        registrationStatus: d.revokedAt ? "revoked" : "active",
        revokedAt: d.revokedAt,
      })),
    });
  });

  app.get("/users/:userId/auth-attempts", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const targetUser = await userStore.findById(userId as any);
    if (!targetUser) {
      throw new DomainError("not_found", "کاربر مورد نظر یافت نشد.");
    }

    const attempts = opts.deviceService
      ? await opts.deviceService.listUserAttempts(userId as any, 50)
      : [];

    return reply.send({
      userId: targetUser.id,
      attempts,
    });
  });

  app.post("/users/:userId/reset-devices", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const reqUser = (request as any).user as { userId: string };
    const targetUser = await userStore.findById(userId as any);
    if (!targetUser) {
      throw new DomainError("not_found", "کاربر مورد نظر یافت نشد.");
    }

    let revokedDevicesCount = 0;
    if (opts.deviceService) {
      revokedDevicesCount = await opts.deviceService.resetUserDevices(
        userId as any,
      );
    }

    // Revoke all active sessions for target user
    await sessionService.revokeAllUserSessions(userId as any, "admin_reset");

    if (opts.auditService) {
      await opts.auditService.emit([
        {
          actorId: asUserId(reqUser.userId as any),
          organizationId: asOrganizationId(
            "00000000-0000-0000-0000-000000000000" as any,
          ),
          action: "admin.reset_user_devices",
          entityType: "user",
          entityId: targetUser.id,
          createdAt: new Date().toISOString(),
          details: {
            admin_user_id: reqUser.userId,
            target_user_id: targetUser.id,
            revokedDevicesCount,
            timestamp: new Date().toISOString(),
          },
        },
      ]);
    }

    return reply.send({
      success: true,
      message: "دستگاه‌ها و نشست‌های کاربر با موفقیت بازنشانی شدند.",
      revokedDevicesCount,
    });
  });
};

