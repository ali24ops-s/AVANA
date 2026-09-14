import {
  type Actor,
  type AuthAction,
  type AuthContext,
  type AuthorizationPolicy,
  type DocumentId,
  type OrganizationId,
  type GenerationJobId,
  type GenerationJobStatus,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import type { DocumentStore } from "../../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation-store.js";
import type { GenerationProgressService } from "../generation-progress-service.js";
import type { GenerationChunkStore } from "../generation-chunk-store.js";
import type { GenerationJobStore } from "../generation-jobs-store.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import {
  GenerationStoppedError,
  GenerationDeletedError,
} from "../generation-service.js";

/**
 * Service dedicated to explicit generation lifecycle mutations:
 * stopping active/queued jobs and deleting jobs/drafts with safe document preservation.
 */
export class GenerationLifecycleService {
  constructor(
    private readonly documentStore: DocumentStore,
    private readonly generatedContentStore: GeneratedContentStore,
    private readonly progressService: GenerationProgressService,
    private readonly chunkRecordStore: GenerationChunkStore,
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

  /**
   * Stop an active or queued generation job at the next safe point (PR Real Stop).
   */
  async stopGenerationJob(
    actor: Actor,
    organizationId: OrganizationId,
    jobId: GenerationJobId,
  ): Promise<{
    jobId: GenerationJobId;
    status: "stopped" | "stopping";
    previousStatus: GenerationJobStatus;
  }> {
    await this.authorize(actor, organizationId, "content:generate");

    if (!this.generationJobStore) {
      throw new DomainError("bad_request", "Generation job store not configured");
    }

    const job = await this.generationJobStore.findByIdForOrganization(
      jobId,
      organizationId,
    );
    if (!job) {
      throw new DomainError("not_found", "Generation job not found");
    }

    const previousStatus = job.status;

    if (previousStatus === "stopped") {
      return { jobId, status: "stopped", previousStatus };
    }
    if (previousStatus === "deleted") {
      return { jobId, status: "stopped", previousStatus };
    }
    if (previousStatus === "succeeded" || previousStatus === "failed") {
      throw new DomainError(
        "conflict",
        `Cannot stop a job that has already completed (status: ${previousStatus})`,
      );
    }

    const now = new Date().toISOString();

    if (previousStatus === "queued") {
      await this.generationJobStore.update({
        ...job,
        status: "stopped",
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      });
      await this.progressService.stop(job.documentId, organizationId);

      const doc = await this.documentStore.findByIdForOrganization(
        job.documentId,
        organizationId,
      );
      if (doc && (doc.status === "generating" || doc.status === "pending_generation")) {
        const remaining = await this.generatedContentStore.listByDocument(
          job.documentId,
          organizationId,
        );
        const hasDrafts = remaining.some((d) => !d.deletedAt && d.status !== "rejected");
        const newDocStatus = hasDrafts ? "review_pending" : "extracted";
        await this.documentStore.update({
          ...doc,
          status: newDocStatus,
          updatedAt: now,
        });
      }

      return { jobId, status: "stopped", previousStatus };
    }

    if (previousStatus === "running") {
      const isLeaseExpired =
        job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < Date.now();

      if (isLeaseExpired) {
        await this.generationJobStore.update({
          ...job,
          status: "stopped",
          leaseExpiresAt: null,
          completedAt: now,
          updatedAt: now,
        });
        await this.progressService.stop(job.documentId, organizationId);

        const doc = await this.documentStore.findByIdForOrganization(
          job.documentId,
          organizationId,
        );
        if (doc && (doc.status === "generating" || doc.status === "pending_generation")) {
          const remaining = await this.generatedContentStore.listByDocument(
            job.documentId,
            organizationId,
          );
          const hasDrafts = remaining.some((d) => !d.deletedAt && d.status !== "rejected");
          const newDocStatus = hasDrafts ? "review_pending" : "extracted";
          await this.documentStore.update({
            ...doc,
            status: newDocStatus,
            updatedAt: now,
          });
        }
        return { jobId, status: "stopped", previousStatus };
      }

      await this.generationJobStore.update({
        ...job,
        status: "stopping",
        updatedAt: now,
      });
      await this.progressService.markStopping(job.documentId, organizationId);
      return { jobId, status: "stopping", previousStatus };
    }

    if (previousStatus === "stopping") {
      return { jobId, status: "stopping", previousStatus };
    }

    return { jobId, status: "stopped", previousStatus };
  }

  /**
   * Stop any active generation job associated with a document.
   */
  async stopGenerationForDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<{
    jobId?: GenerationJobId;
    status: "stopped" | "stopping";
    previousStatus: GenerationJobStatus;
  }> {
    await this.authorize(actor, organizationId, "content:generate");

    let result: {
      jobId?: GenerationJobId;
      status: "stopped" | "stopping";
      previousStatus: GenerationJobStatus;
    } = { status: "stopped", previousStatus: "running" };

    if (this.generationJobStore) {
      const jobs = await this.generationJobStore.listByDocument(
        documentId,
        organizationId,
      );
      const activeJob = jobs.find(
        (j) =>
          j.status === "running" ||
          j.status === "queued" ||
          j.status === "stopping",
      );
      if (activeJob) {
        result = await this.stopGenerationJob(actor, organizationId, activeJob.id);
      }
    }

    if (result.status !== "stopping") {
      await this.progressService.stop(documentId, organizationId);
    }

    const doc = await this.documentStore.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (doc && (doc.status === "generating" || doc.status === "pending_generation")) {
      const remaining = await this.generatedContentStore.listByDocument(
        documentId,
        organizationId,
      );
      const hasDrafts = remaining.some((d) => !d.deletedAt && d.status !== "rejected");
      const newDocStatus = hasDrafts ? "review_pending" : "extracted";
      await this.documentStore.update({
        ...doc,
        status: newDocStatus,
        updatedAt: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Safely delete a generation job, cancel in-flight work, and clean up transient chunks/drafts
   * without deleting the parent Document or accepted contents (PR Real Delete).
   */
  async deleteGenerationJob(
    actor: Actor,
    organizationId: OrganizationId,
    jobId: GenerationJobId,
  ): Promise<{
    jobId: GenerationJobId;
    status: "deleted";
    previousStatus: GenerationJobStatus;
  }> {
    await this.authorize(actor, organizationId, "content:generate");

    if (!this.generationJobStore) {
      throw new DomainError("bad_request", "Generation job store not configured");
    }

    const job = await this.generationJobStore.findByIdForOrganization(
      jobId,
      organizationId,
    );
    if (!job) {
      return { jobId, status: "deleted", previousStatus: "deleted" };
    }

    const previousStatus = job.status;
    if (previousStatus === "deleted") {
      return { jobId, status: "deleted", previousStatus };
    }

    const now = new Date().toISOString();

    // 1. Mark job as deleting
    await this.generationJobStore.update({
      ...job,
      status: "deleting",
      leaseExpiresAt: null,
      updatedAt: now,
    });
    await this.progressService.markDeleting(job.documentId, organizationId);

    // 2. Clean up chunks attributed to this job
    if (this.chunkRecordStore.deleteByJob) {
      await this.chunkRecordStore.deleteByJob(jobId, organizationId);
    }

    // 3. Clean up unaccepted draft contents for this document
    await this.generatedContentStore.deleteDraftsByDocument(
      job.documentId,
      organizationId,
    );

    // 4. Soft-delete the job record
    await this.generationJobStore.delete(jobId, organizationId);

    // 5. Reset document generation progress to idle
    await this.progressService.reset(job.documentId, organizationId);

    // 6. Safeguard document status: NEVER delete document row
    const doc = await this.documentStore.findByIdForOrganization(
      job.documentId,
      organizationId,
    );
    if (doc) {
      if (doc.status === "generating" || doc.status === "pending_generation") {
        const remaining = await this.generatedContentStore.listByDocument(
          job.documentId,
          organizationId,
        );
        const hasDrafts = remaining.some((d) => !d.deletedAt && d.status !== "rejected");
        const newDocStatus = hasDrafts ? "review_pending" : "extracted";
        await this.documentStore.update({
          ...doc,
          status: newDocStatus,
          updatedAt: now,
        });
      }
    }

    return { jobId, status: "deleted", previousStatus };
  }

  /**
   * Delete generation processes and transient drafts for a document.
   */
  async deleteGenerationForDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<{
    status: "deleted";
    previousStatus?: GenerationJobStatus;
  }> {
    await this.authorize(actor, organizationId, "content:generate");

    if (this.generationJobStore) {
      const jobs = await this.generationJobStore.listByDocument(
        documentId,
        organizationId,
      );
      for (const job of jobs) {
        await this.deleteGenerationJob(actor, organizationId, job.id);
      }
    }

    // Also clean up document chunks and drafts
    await this.chunkRecordStore.deleteByDocument(documentId, organizationId);
    await this.generatedContentStore.deleteDraftsByDocument(
      documentId,
      organizationId,
    );
    await this.progressService.reset(documentId, organizationId);

    const doc = await this.documentStore.findByIdForOrganization(
      documentId,
      organizationId,
    );
    if (doc && (doc.status === "generating" || doc.status === "pending_generation")) {
      const remaining = await this.generatedContentStore.listByDocument(
        documentId,
        organizationId,
      );
      const hasDrafts = remaining.some((d) => !d.deletedAt && d.status !== "rejected");
      const newDocStatus = hasDrafts ? "review_pending" : "extracted";
      await this.documentStore.update({
        ...doc,
        status: newDocStatus,
        updatedAt: new Date().toISOString(),
      });
    }

    return { status: "deleted" };
  }

  /**
   * Safe point cancellation check. Checks whether the current generation run has been stopped or deleted.
   * If stopping, transitions the job to stopped and aborts execution cleanly.
   */
  async checkCancellation(
    jobId?: string,
    organizationId?: OrganizationId,
    documentId?: DocumentId,
  ): Promise<void> {
    if (!jobId || !organizationId || !this.generationJobStore) {
      return;
    }

    const job = await this.generationJobStore.findByIdForOrganization(
      jobId as GenerationJobId,
      organizationId,
    );

    if (!job) {
      if (documentId) {
        await this.progressService.reset(documentId, organizationId);
      }
      throw new GenerationDeletedError();
    }

    if (job.status === "stopping") {
      const now = new Date().toISOString();
      await this.generationJobStore.update({
        ...job,
        status: "stopped",
        leaseExpiresAt: null,
        completedAt: now,
        updatedAt: now,
      });
      if (documentId) {
        await this.progressService.stop(documentId, organizationId);
      }
      process.stdout.write(
        `[GENERATION] cancelled_at_safe_point: jobId=${jobId} documentId=${documentId}\n`,
      );
      throw new GenerationStoppedError();
    }

    if (job.status === "stopped") {
      if (documentId) {
        await this.progressService.stop(documentId, organizationId);
      }
      throw new GenerationStoppedError();
    }

    if (job.status === "deleting" || job.status === "deleted") {
      if (documentId) {
        await this.progressService.reset(documentId, organizationId);
      }
      process.stdout.write(
        `[GENERATION] aborted_due_to_deletion: jobId=${jobId} documentId=${documentId}\n`,
      );
      throw new GenerationDeletedError();
    }
  }
}
