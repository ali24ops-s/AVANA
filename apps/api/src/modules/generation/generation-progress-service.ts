/**
 * GenerationProgressService (Canonical AI Generation Progress Management).
 *
 * Provides a single canonical API for all Generation Pipeline progress transitions:
 *   - startStage
 *   - updateProgress
 *   - completeStage
 *   - complete
 *   - fail
 *   - queue
 *   - reset
 *   - toResource (presentation layer stage labels & percentage)
 *
 * Guarantees:
 * 1. Monotonic progress: out-of-order progress updates never decrease current progress.
 * 2. Real activity tracking: lastActivityAt updates only on real pipeline events.
 * 3. Server restart resilience: all state is persisted via GenerationProgressStore.
 * 4. Separation of concerns: Persian stage labels are resolved only in presentation layer.
 */

import type {
  DocumentId,
  OrganizationId,
  GenerationPipelineStage,
  DocumentGenerationProgressRecord,
  DocumentGenerationProgressResource,
  GenerationProgressStatus,
} from "@avana/domain";
import { STAGE_LABELS_FA } from "@avana/domain";
import type { GenerationProgressStore } from "./generation-progress-store.js";

export class GenerationProgressService {
  constructor(private readonly store: GenerationProgressStore) {}

  /**
   * Enter a new stage in the generation pipeline.
   */
  async startStage(
    documentId: DocumentId,
    organizationId: OrganizationId,
    stage: GenerationPipelineStage,
    total: number,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    let status: GenerationProgressStatus = "generating";
    if (stage === "planning") {
      status = "planning";
    } else if (stage === "review") {
      status = "reviewing";
    }

    return this.store.updateMonotonic(documentId, organizationId, {
      status,
      stage,
      progressCurrent: 0,
      progressTotal: Math.max(0, total),
      stageStartedAt: now,
      lastActivityAt: now,
      errorMessage: null,
    });
  }

  /**
   * Update numeric progress within the active stage.
   */
  async updateProgress(
    documentId: DocumentId,
    organizationId: OrganizationId,
    stage: GenerationPipelineStage,
    current: number,
    total?: number,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "generating",
      stage,
      progressCurrent: Math.max(0, current),
      progressTotal: total !== undefined ? Math.max(0, total) : undefined,
      lastActivityAt: now,
    });
  }

  /**
   * Conclude a specific stage.
   */
  async completeStage(
    documentId: DocumentId,
    organizationId: OrganizationId,
    stage: GenerationPipelineStage,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    const existing = await this.store.findByDocument(documentId, organizationId);
    const targetTotal = existing?.progressTotal || 1;

    return this.store.updateMonotonic(documentId, organizationId, {
      stage,
      progressCurrent: targetTotal,
      lastActivityAt: now,
    });
  }

  /**
   * Transition document to queued state when asynchronous job is accepted.
   */
  async queue(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "queued",
      stage: null,
      progressCurrent: 0,
      progressTotal: 1,
      stageStartedAt: null,
      lastActivityAt: now,
      errorMessage: null,
    });
  }

  /**
   * Conclude entire generation pipeline successfully.
   */
  async complete(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "completed",
      stage: "publishing",
      progressCurrent: 1,
      progressTotal: 1,
      stageStartedAt: null,
      lastActivityAt: now,
      errorMessage: null,
    });
  }

  /**
   * Record a pipeline error.
   */
  async fail(
    documentId: DocumentId,
    organizationId: OrganizationId,
    errorMessage: string,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "failed",
      errorMessage,
      lastActivityAt: now,
    });
  }

  /**
   * Reset progress state to idle.
   */
  async reset(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord> {
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "idle",
      stage: null,
      progressCurrent: 0,
      progressTotal: 1,
      stageStartedAt: null,
      lastActivityAt: null,
      errorMessage: null,
    });
  }

  /**
   * Transition document to stopping state when a stop request is initiated.
   */
  async markStopping(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "stopping",
      lastActivityAt: now,
    });
  }

  /**
   * Transition document to stopped state when a job has safely halted.
   */
  async stop(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "stopped",
      lastActivityAt: now,
      errorMessage: null,
    });
  }

  /**
   * Transition document to deleting state when a delete request is in progress.
   */
  async markDeleting(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "deleting",
      lastActivityAt: now,
    });
  }

  /**
   * Transition document to deleted state when a delete request has completed.
   */
  async markDeleted(
    documentId: DocumentId,
    organizationId: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord> {
    const now = new Date().toISOString();
    return this.store.updateMonotonic(documentId, organizationId, {
      status: "deleted",
      stage: null,
      progressCurrent: 0,
      progressTotal: 1,
      stageStartedAt: null,
      lastActivityAt: now,
      errorMessage: null,
    });
  }

  /**
   * Get raw progress record for a document.
   */
  async getRecord(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord | null> {
    return this.store.findByDocument(documentId, organizationId);
  }

  /**
   * Find raw progress record for a document.
   */
  async findByDocument(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<DocumentGenerationProgressRecord | null> {
    return this.store.findByDocument(documentId, organizationId);
  }

  /**
   * Bulk query progress records for a list of document IDs (prevents N+1).
   */
  async getRecordsMap(
    documentIds: DocumentId[],
    organizationId?: OrganizationId,
  ): Promise<Map<DocumentId, DocumentGenerationProgressRecord>> {
    return this.store.findByDocuments(documentIds, organizationId);
  }

  /**
   * Convert progress record to presentation resource format with Persian stage label.
   */
  toResource(
    record: DocumentGenerationProgressRecord | null | undefined,
    fallbackDocStatus?: string,
    fallbackDocErrorCode?: string | null,
  ): DocumentGenerationProgressResource {
    if (!record) {
      if (fallbackDocStatus === "generating") {
        return {
          status: "generating",
          stage: null,
          stageLabel: null,
          progress: null,
          stageStartedAt: null,
          lastActivityAt: null,
          error: null,
        };
      }
      if (fallbackDocStatus === "review_pending") {
        return {
          status: "reviewing",
          stage: "review",
          stageLabel: STAGE_LABELS_FA.review,
          progress: null,
          stageStartedAt: null,
          lastActivityAt: null,
          error: null,
        };
      }
      if (fallbackDocStatus === "ready") {
        return {
          status: "completed",
          stage: null,
          stageLabel: null,
          progress: null,
          stageStartedAt: null,
          lastActivityAt: null,
          error: null,
        };
      }
      if (fallbackDocStatus === "failed") {
        return {
          status: "failed",
          stage: null,
          stageLabel: null,
          progress: null,
          stageStartedAt: null,
          lastActivityAt: null,
          error: fallbackDocErrorCode || "خطا در پردازش یا تولید سند",
        };
      }
      return {
        status: "idle",
        stage: null,
        stageLabel: null,
        progress: null,
        stageStartedAt: null,
        lastActivityAt: null,
        error: null,
      };
    }

    let status = record.status;
    if (fallbackDocStatus === "ready" && status !== "completed") {
      status = "completed";
    } else if (fallbackDocStatus === "failed" && status !== "failed") {
      status = "failed";
    }

    const stage = record.stage;
    const stageLabel = stage ? STAGE_LABELS_FA[stage] || stage : null;

    let progress: DocumentGenerationProgressResource["progress"] = null;
    if (
      status === "generating" ||
      status === "planning" ||
      status === "reviewing" ||
      status === "stopping" ||
      status === "stopped" ||
      status === "completed"
    ) {
      const total = record.progressTotal > 0 ? record.progressTotal : 1;
      const current = status === "completed" ? total : Math.min(record.progressCurrent, total);
      const percentage = status === "completed" ? 100 : Math.min(100, Math.round((current / total) * 100));
      progress = {
        current,
        total,
        percentage,
      };
    }

    return {
      status,
      stage,
      stageLabel,
      progress,
      stageStartedAt: record.stageStartedAt,
      lastActivityAt: record.lastActivityAt,
      error: record.errorMessage,
    };
  }
}
