/**
 * Admin HTTP routes (Phase 1).
 */

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
  type Role,
} from "@avana/domain";
import type { DocumentProcessingService } from "../documents/document-processing-service.js";
import type { DocumentService } from "../documents/document-service.js";
import type {
  GenerationQueue,
  GenerationJobPayload,
} from "../generation/generation-queue.js";
import type { GenerationJobStore } from "../generation/generation-jobs-store.js";
import { getPromptRegistry } from "../generation/prompt-registry.js";

export interface AdminRouteOptions extends AuthMiddlewareDeps {
  adminStore: AdminStore;
  documentProcessingService?: DocumentProcessingService;
  documentService?: DocumentService;
  generationQueue?: GenerationQueue;
  generationJobStore?: GenerationJobStore;
}

export const adminRoutes: FastifyPluginAsync<AdminRouteOptions> = async (
  app,
  opts,
) => {
  const { sessionService, userStore, adminStore, demoUserResolver, authEnabled } = opts;
  const adminService = new AdminService(adminStore);
  const { requireAuth, requireRole } = makeAuthMiddleware({
    sessionService,
    userStore,
    demoUserResolver,
    authEnabled,
  });

  // All routes here require platform_admin
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(Roles.platform_admin));

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
};
