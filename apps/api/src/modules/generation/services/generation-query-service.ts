import {
  type Actor,
  type AuthAction,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type DocumentId,
  type GeneratedContentType,
  type GenerationChunkRecord,
  type GenerationProgress,
  type DocumentGenerationProgressResource,
  type OrganizationId,
  DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import type { DocumentRecord, DocumentStore } from "../../learning/learning-store.js";
import type { GenerationChunkStore } from "../generation-chunk-store.js";
import type { GenerationProgressService } from "../generation-progress-service.js";
import type { GenerationJobStore } from "../generation-jobs-store.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";

/**
 * Service dedicated to read-only queries and inspection of document generation progress and active worker state.
 */
export class GenerationQueryService {
  constructor(
    private readonly documentStore: DocumentStore,
    private readonly chunkRecordStore: GenerationChunkStore,
    private readonly progressService: GenerationProgressService,
    private readonly generationJobStore?: GenerationJobStore,
    private readonly orgStore?: OrganizationStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
  ) {}

  async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: AuthAction,
  ): Promise<void> {
    if (actor.role === "platform_admin") {
      if (
        this.orgStore &&
        typeof this.orgStore.findById === "function"
      ) {
        const org = await this.orgStore.findById(organizationId);
        if (!org) {
          throw new DomainError("not_found", "Organization not found");
        }
      }
      const context: AuthContext = { organizationId };
      this.policy.require(action, actor, context);
      return;
    }

    if (
      this.orgStore &&
      typeof this.orgStore.findMembership === "function"
    ) {
      const membership = await this.orgStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError("not_found", "Organization not found");
      }
      const scopedActor = { ...actor, role: membership.role as Actor["role"] };
      const context: AuthContext = { organizationId };
      this.policy.require(action, scopedActor, context);
      return;
    }
    const context: AuthContext = { organizationId };
    this.policy.require(action, actor, context);
  }

  private async requireDocument(
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<DocumentRecord> {

    const doc = await this.documentStore.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (!doc) {
      throw new DomainError("not_found", "Document not found");
    }
    return doc;
  }

  async getGenerationProgress(
    documentId: DocumentId,
    organizationId: OrganizationId,
    requestedTypes?: GeneratedContentType[],
  ): Promise<GenerationProgress> {
    const chunks = await this.chunkRecordStore.listByDocument(
      documentId,
      organizationId,
    );

    const planningChunk = chunks.find(
      (c) =>
        c.stage === "planning" &&
        c.status === "completed" &&
        c.deletedAt === null,
    );

    let sessionCount = 0;
    if (planningChunk?.payload && typeof planningChunk.payload === "object") {
      const p = planningChunk.payload as {
        contentPlan?: { sessions?: unknown[] };
      };
      if (Array.isArray(p.contentPlan?.sessions)) {
        sessionCount = p.contentPlan.sessions.length;
      }
    }

    const types =
      requestedTypes && requestedTypes.length > 0
        ? requestedTypes
        : ([
            "lesson",
            "flashcard",
            "quiz",
            "review_summary",
          ] as GeneratedContentType[]);

    const effectiveSessionCount = sessionCount > 0 ? sessionCount : 8;
    const stagesCount =
      (types.includes("lesson") ? 1 : 0) +
      (types.includes("flashcard") ? 1 : 0) +
      (types.includes("quiz") ? 1 : 0);

    const total =
      1 + // planning
      effectiveSessionCount * stagesCount +
      (types.includes("review_summary") ? 1 : 0);

    const activeChunks = chunks.filter(
      (c) => c.deletedAt === null || c.deletedAt === undefined,
    );
    const completed = activeChunks.filter(
      (c) => c.status === "completed",
    ).length;
    const failed = activeChunks.filter(
      (c) => c.status === "failed",
    ).length;

    const nowTime = Date.now();
    const staleThresholdMs = 600_000;
    const isRunning = activeChunks.some((c) => {
      if (c.status !== "running") return false;
      if (c.leaseExpiresAt) {
        return new Date(c.leaseExpiresAt).getTime() > nowTime;
      }
      if (c.heartbeatAt) {
        return nowTime - new Date(c.heartbeatAt).getTime() <= staleThresholdMs;
      }
      return nowTime - new Date(c.updatedAt).getTime() <= staleThresholdMs;
    });

    let effectiveTotal = total;
    if (!requestedTypes && !isRunning && failed === 0 && completed > 0) {
      effectiveTotal = completed;
    }

    const pending = Math.max(0, effectiveTotal - completed - failed);

    let status: GenerationProgress["status"] = "queued";
    if (failed > 0) {
      status = completed > 0 ? "partial" : "failed";
    } else if (completed >= effectiveTotal && effectiveTotal > 0 && !isRunning) {
      status = "succeeded";
    } else if (isRunning) {
      status = "running";
    } else if (completed > 0) {
      status = "partial";
    }

    const lastActiveChunk = activeChunks[activeChunks.length - 1];

    return {
      total: effectiveTotal,
      completed,
      failed,
      pending,
      status,
      currentStage: lastActiveChunk?.stage,
      currentChunkKey: lastActiveChunk?.chunkKey,
    };
  }

  async isDocumentActivelyWorking(
    documentId: DocumentId,
    organizationId: OrganizationId,
    staleThresholdMs = DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  ): Promise<boolean> {
    const now = Date.now();
    const staleCutoff = now - staleThresholdMs;

    // 1. Check generation jobs
    if (this.generationJobStore) {
      const jobs = await this.generationJobStore.listByDocument(
        documentId,
        organizationId,
      );
      for (const job of jobs) {
        if (job.status === "running" || job.status === "queued") {
          if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() > now) {
            return true;
          }
          if (job.heartbeatAt && new Date(job.heartbeatAt).getTime() > staleCutoff) {
            return true;
          }
          if (!job.heartbeatAt && !job.leaseExpiresAt && new Date(job.updatedAt).getTime() > staleCutoff) {
            return true;
          }
        }
      }
    }

    // 2. Check chunk store
    if (this.chunkRecordStore && "getAll" in this.chunkRecordStore && typeof (this.chunkRecordStore as { getAll?: () => unknown }).getAll === "function") {
      const chunks = (this.chunkRecordStore as unknown as { getAll: () => GenerationChunkRecord[] }).getAll();
      for (const chunk of chunks) {
        if (chunk.documentId === documentId && chunk.status === "running" && !chunk.deletedAt) {
          if (chunk.leaseExpiresAt && new Date(chunk.leaseExpiresAt).getTime() > now) {
            return true;
          }
          if (chunk.heartbeatAt && new Date(chunk.heartbeatAt).getTime() > staleCutoff) {
            return true;
          }
          if (!chunk.heartbeatAt && !chunk.leaseExpiresAt && new Date(chunk.updatedAt).getTime() > staleCutoff) {
            return true;
          }
        }
      }
    }

    return false;
  }

  async getDocumentGenerationProgress(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    _courseId?: CourseId,
  ): Promise<{
    documentId: DocumentId;
    documentName: string;
    courseId: CourseId | null;
    generationProgress: DocumentGenerationProgressResource;
  }> {
    await this.authorize(actor, organizationId, "document:read");
    const doc = await this.requireDocument(organizationId, documentId);

    let isPrivileged = actor.role === "platform_admin";
    if (!isPrivileged && this.orgStore && typeof this.orgStore.findMembership === "function") {
      const membership = await this.orgStore.findMembership(organizationId, actor.userId);
      const role = membership?.role;
      isPrivileged =
        role === "organization_admin" ||
        role === "course_editor" ||
        role === "teacher" ||
        role === "platform_admin" ||
        role === "support_agent";
    }

    if (!isPrivileged && doc.ownerUserId !== actor.userId) {
      throw new DomainError("not_found", "Document not found");
    }

    const record = await this.progressService.getRecord(documentId, organizationId);
    const generationProgress = this.progressService.toResource(
      record,
      doc.status,
      doc.errorCode,
    );

    return {
      documentId: doc.id,
      documentName: doc.originalName,
      courseId: doc.courseId ?? null,
      generationProgress,
    };
  }
}
