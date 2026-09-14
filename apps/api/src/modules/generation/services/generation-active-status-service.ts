import {
  type Actor,
  type AuthAction,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type DocumentId,
  type OrganizationId,
  type GenerationProgressStatus,
  type GenerationPipelineStage,
  DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import type { DocumentStore } from "../../learning/learning-store.js";
import type { GeneratedContentStore } from "../generation-store.js";
import type { GenerationProgressService } from "../generation-progress-service.js";
import type { GenerationQueryService } from "./generation-query-service.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";

export type ActiveGenerationResource = {
  documentId: DocumentId;
  documentName: string;
  courseId: CourseId | null;
  organizationId?: OrganizationId;
  status: GenerationProgressStatus;
  stage: GenerationPipelineStage | null;
  stageLabel: string | null;
  progress: {
    current: number;
    total: number;
    percentage: number;
  } | null;
  stageStartedAt: string | null;
  lastActivityAt: string | null;
  error: string | null;
  updatedAt: string;
};

/**
 * Service dedicated to active generation inspection, aggregation across organizations,
 * and lazy/opportunistic stale reconciliation.
 */
export class GenerationActiveStatusService {
  constructor(
    private readonly documentStore: DocumentStore,
    private readonly generatedContentStore: GeneratedContentStore,
    private readonly progressService: GenerationProgressService,
    private readonly queryService: GenerationQueryService,
    private readonly orgStore?: OrganizationStore,
    private readonly systemOrganizationId?: OrganizationId,
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
   * Return all active generation items visible to the authenticated actor across all
   * authorized organizations and system organization.
   */
  async getGlobalActiveGenerations(
    actor: Actor,
  ): Promise<ActiveGenerationResource[]> {
    const orgIds = new Set<OrganizationId>();

    if (this.systemOrganizationId && actor.role === "platform_admin") {
      orgIds.add(this.systemOrganizationId);
    }

    if (this.orgStore && typeof this.orgStore.listMembershipsByUserId === "function") {
      try {
        const memberships = await this.orgStore.listMembershipsByUserId(actor.userId);
        for (const m of memberships) {
          if (m.organizationId) {
            orgIds.add(m.organizationId);
          }
        }
      } catch {
        // Suppress and fallback
      }
    }

    if (actor.role === "platform_admin" && this.orgStore) {
      type ExtendedOrgStore = OrganizationStore & {
        listAll?: () => Promise<Array<{ id?: OrganizationId }>>;
        listOrganizations?: () => Promise<Array<{ id?: OrganizationId }>>;
      };
      const extStore = this.orgStore as ExtendedOrgStore;
      if (typeof extStore.listAll === "function") {
        try {
          const allOrgs = await extStore.listAll();
          for (const o of allOrgs) {
            if (o.id) orgIds.add(o.id);
          }
        } catch {
          // Suppress
        }
      } else if (typeof extStore.listOrganizations === "function") {
        try {
          const allOrgs = await extStore.listOrganizations();
          for (const o of allOrgs) {
            if (o.id) orgIds.add(o.id);
          }
        } catch {
          // Suppress
        }
      }
    }

    // Fallback if no orgs were found: check systemOrganizationId
    if (orgIds.size === 0 && this.systemOrganizationId) {
      orgIds.add(this.systemOrganizationId);
    }

    const itemsMap = new Map<DocumentId, ActiveGenerationResource>();

    for (const orgId of orgIds) {
      try {
        const orgItems = await this.getActiveGenerations(actor, orgId);
        for (const item of orgItems) {
          if (!itemsMap.has(item.documentId)) {
            itemsMap.set(item.documentId, item);
          }
        }
      } catch {
        // If actor is not authorized for this specific org, safely continue
      }
    }

    const items = Array.from(itemsMap.values());

    // Sort active ones first, then by lastActivityAt descending
    items.sort((a, b) => {
      const aActive =
        a.status === "queued" ||
        a.status === "planning" ||
        a.status === "generating" ||
        a.status === "stopping" ||
        a.status === "deleting";
      const bActive =
        b.status === "queued" ||
        b.status === "planning" ||
        b.status === "generating" ||
        b.status === "stopping" ||
        b.status === "deleting";
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bTime - aTime;
    });

    return items;
  }

  /**
   * Return all currently active generation items for the current user and organization.
   * Scoped strictly to the actor's authorized documents and membership.
   */
  async getActiveGenerations(
    actor: Actor,
    organizationId: OrganizationId,
    courseId?: CourseId,
  ): Promise<ActiveGenerationResource[]> {
    await this.authorize(actor, organizationId, "document:read");

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

    const allDocs = isPrivileged
      ? await this.documentStore.listByOrganization(organizationId)
      : await this.documentStore.listByOwner(organizationId, actor.userId);

    const nonDeletedDocs = allDocs.filter(
      (d) => d.deletedAt === null && (!courseId || d.courseId === courseId),
    );
    if (nonDeletedDocs.length === 0) {
      return [];
    }

    const docIds = nonDeletedDocs.map((d) => d.id);
    const recordsMap = await this.progressService.getRecordsMap(docIds, organizationId);

    const items: ActiveGenerationResource[] = [];
    const now = Date.now();
    const THREE_MINUTES_MS = 3 * 60 * 1000;
    const STALE_THRESHOLD_MS = DEFAULT_GENERATION_STALE_THRESHOLD_MS;

    for (const doc of nonDeletedDocs) {
      const record = recordsMap.get(doc.id);
      let res = this.progressService.toResource(record, doc.status, doc.errorCode);

      // A document is only in active generation phase if it is in queued, planning, generating, stopping, or deleting.
      // Reviewing, validating, publishing, ready, and completed are post-generation or completed phases and are NOT active generation.
      const isPostGenerationOrCompleted =
        res.status === "reviewing" ||
        res.status === "completed" ||
        res.status === "deleted" ||
        res.stage === "review" ||
        res.stage === "publishing" ||
        doc.status === "review_pending" ||
        doc.status === "ready";

      let isActive =
        !isPostGenerationOrCompleted &&
        (res.status === "queued" ||
          res.status === "planning" ||
          res.status === "generating" ||
          res.status === "stopping" ||
          res.status === "deleting" ||
          doc.status === "generating" ||
          doc.status === "pending_generation");

      // If marked active, verify whether it is actually stale (abandoned worker / crashed process)
      if (isActive && res.status !== "stopping" && res.status !== "deleting") {
        const lastActivityTime = res.lastActivityAt
          ? new Date(res.lastActivityAt).getTime()
          : (record?.updatedAt ? new Date(record.updatedAt).getTime() : (doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0));
        const isTimeExceeded = (now - lastActivityTime) > STALE_THRESHOLD_MS;

        if (isTimeExceeded) {
          const hasActiveWorker = await this.queryService.isDocumentActivelyWorking(
            doc.id,
            organizationId,
            STALE_THRESHOLD_MS,
          );
          if (!hasActiveWorker) {
            // Reconcile stale document safely without deleting any drafts or canonical content
            const drafts = await this.generatedContentStore.listByDocument(doc.id, organizationId);
            const hasDrafts = drafts.some((d) => !d.deletedAt && d.status !== "rejected");
            const newDocStatus = hasDrafts ? "review_pending" : "extracted";

            await this.progressService.fail(
              doc.id,
              organizationId,
              "فرآیند تولید به دلیل عدم دریافت پاسخ یا قطع ارتباط با پردازشگر متوقف شد (Timeout).",
            );

            if (doc.status === "generating" || doc.status === "pending_generation") {
              await this.documentStore.update({
                ...doc,
                status: newDocStatus,
                errorCode: "GENERATION_TIMEOUT_STALE",
                updatedAt: new Date().toISOString(),
              });
              doc.status = newDocStatus;
            }

            const updatedRecord = await this.progressService.getRecord(doc.id, organizationId);
            res = this.progressService.toResource(updatedRecord, doc.status, "GENERATION_TIMEOUT_STALE");
            isActive = false;
          }
        }
      }

      const isStopped = !isPostGenerationOrCompleted && res.status === "stopped";
      // Include failed within recent window so client indicator can show the failure state
      const isRecent =
        !isPostGenerationOrCompleted &&
        res.status === "failed" &&
        ((res.lastActivityAt && now - new Date(res.lastActivityAt).getTime() < THREE_MINUTES_MS) ||
          (doc.updatedAt && now - new Date(doc.updatedAt).getTime() < THREE_MINUTES_MS));

      if (isActive || isStopped || isRecent) {
        items.push({
          documentId: doc.id,
          documentName: doc.originalName,
          courseId: doc.courseId ?? null,
          organizationId: doc.organizationId,
          status: res.status,
          stage: res.stage,
          stageLabel: res.stageLabel,
          progress: res.progress,
          stageStartedAt: res.stageStartedAt,
          lastActivityAt: res.lastActivityAt,
          error: res.error,
          updatedAt: record?.updatedAt ?? doc.updatedAt,
        });
      }
    }

    // Sort active ones first, then by lastActivityAt descending
    items.sort((a, b) => {
      const aActive =
        a.status === "queued" ||
        a.status === "planning" ||
        a.status === "generating" ||
        a.status === "stopping" ||
        a.status === "deleting";
      const bActive =
        b.status === "queued" ||
        b.status === "planning" ||
        b.status === "generating" ||
        b.status === "stopping" ||
        b.status === "deleting";
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bTime - aTime;
    });

    return items;
  }
}
