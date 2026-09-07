/**
 * ReviewService (PR6-6) — Human review & acceptance workflow.
 *
 * Implements the human-in-the-loop gate for AI-generated content. Per the
 * product requirement, AI is *assistive, not authoritative*: generated
 * lessons/flashcards/quizzes must not become learner-visible until reviewed
 * and accepted by a `course_editor` or `organization_admin`.
 *
 * Review lifecycle on `generated_contents`:
 *   draft → accepted / rejected / edited → (regenerating → draft)
 *
 * Authorization:
 *   - review-queue / read  : `content:review` (student + editor + admin)
 *   - accept/reject/edit   : `content:accept` / `content:reject` /
 *                            `content:edit` (course_editor + organization_admin)
 *   - regenerate           : `content:regenerate` (course_editor + org_admin)
 *
 * Learning Core integration (Option A — approved):
 *   An accepted AI lesson is materialized as a normal Learning Core lesson
 *   via the existing lesson creation path (generated_content → lesson draft →
 *   existing publication flow). It is NOT auto-published; the existing
 *   draft/published publication workflow governs learner visibility.
 *   Materialization is explicitly idempotent: accepting twice does not create
 *   a duplicate lesson (guarded by `materialized_lesson_id`).
 *
 * Regeneration: reuses the existing async GenerationQueue/BullMQ
 * infrastructure. It never calls the ModelGateway synchronously. The flow is:
 *   accepted/edited/rejected content → create regeneration job → status
 *   `regenerating` → worker produces a replacement draft → review again.
 *   The route returns 202 + job_id.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type DocumentChunkId,
  type DocumentId,
  type GeneratedContentId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  DomainError,
  normalizeQuestionOptions,
  canonicalizeAndShuffleQuestion,
  parseFlashcardId,
  parseQuizId,
  parseQuizQuestionId,
  auditContentAccepted,
  auditContentEdited,
  auditContentRejected,
  auditContentRegenerated,
  normalizeEducationalContent,
  calculateDefaultContentPrice,
  calculateContentPricingBreakdown,
  isCompleteReviewSummary,
  asProductId,
} from "@avana/domain";
import type { CommerceStore } from "../commerce/commerce-store.js";
import type {
  DocumentStore,
  DocumentChunkStore,
  ModuleStore,
  LessonStore,
  LessonRecord,
  ModuleRecord,
} from "../learning/learning-store.js";
import type {
  GeneratedContentRecord,
  GeneratedContentStore,
  GeneratedContentCitationStore,
} from "./generation-store.js";
import type {
  FlashcardStore,
  QuizStore,
  QuizQuestionStore,
} from "../study/study-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { GenerationQueue } from "./generation-queue.js";
import { AuditService } from "../../observability/audit-service.js";
import type { DbClient } from "@avana/database/client";
import { DrizzleGeneratedContentStore } from "./drizzle-stores.js";
import {
  DrizzleDocumentStore,
  DrizzleModuleStore,
  DrizzleLessonStore,
} from "../learning/drizzle-stores.js";
import {
  DrizzleFlashcardStore,
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
} from "../study/drizzle-stores.js";
import { DrizzleCommerceStore } from "../commerce/commerce-store.js";
import { DrizzleAuditStore } from "../../observability/drizzle-stores.js";

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

export type BulkAcceptItemResult = {
  content_id: GeneratedContentId;
  type: GeneratedContentRecord["type"];
  status: "accepted";
  materialized_lesson_id: LessonId | null;
};

export type BulkAcceptPackResult = {
  document_id: DocumentId | null;
  total_items: number;
  accepted_count: number;
  already_accepted_count: number;
  accepted_content_ids: GeneratedContentId[];
  results: BulkAcceptItemResult[];
};

export type ReviewScopedStores = {
  generatedContentStore?: GeneratedContentStore;
  documentStore?: DocumentStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  flashcardStore?: FlashcardStore;
  quizStore?: QuizStore;
  quizQuestionStore?: QuizQuestionStore;
  commerceStore?: CommerceStore;
  auditService?: AuditService;
};

export type ReviewDocumentResource = {
  id: string;
  filename: string | null;
  title: string | null;
  created_at?: string | null;
};

export type ReviewDocumentStats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  needsRevision: number;
};

export type ReviewDocumentGroupResource = {
  document: ReviewDocumentResource | null;
  stats: ReviewDocumentStats;
  items: ReviewQueueResource[];
};

export type ReviewQueueResource = {
  id: GeneratedContentId;
  document_id: DocumentId;
  course_id: CourseId;
  type: GeneratedContentRecord["type"];
  status: GeneratedContentRecord["status"];
  title: string;
  updated_at: string;
};

export type ReviewQueueResponse = {
  request_id: string;
  groups?: ReviewDocumentGroupResource[];
  pending: ReviewQueueResource[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ContentReviewResource = {
  request_id: string;
  content: {
    id: GeneratedContentId;
    document_id: DocumentId;
    course_id: CourseId;
    type: GeneratedContentRecord["type"];
    status: GeneratedContentRecord["status"];
    payload: GeneratedContentRecord["payload"];
    prompt_version: string | null;
    model: string | null;
    token_usage: { input_tokens: number; output_tokens: number } | null;
    citations: string[];
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_reason: string | null;
    edited_by: string | null;
    edited_at: string | null;
    created_at: string;
    updated_at: string;
  };
  source_chunks: Array<{
    id: DocumentChunkId;
    sequence: number;
    heading: string | null;
    content: string;
    start_page: number;
    end_page: number;
  }>;
  generation: {
    model: string | null;
    prompt_version: string | null;
    token_usage: { input_tokens: number; output_tokens: number } | null;
  };
};

export type AcceptContentResult = {
  content_id: GeneratedContentId;
  status: "accepted";
  materialized_lesson_id: LessonId | null;
};

export type RejectContentResult = {
  content_id: GeneratedContentId;
  status: "rejected";
};

export type RegenerateContentResult = {
  content_id: GeneratedContentId;
  job_id: string;
  status: "regenerating";
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReviewService {
  constructor(
    private readonly generatedContentStore: GeneratedContentStore,
    private readonly citationStore: GeneratedContentCitationStore,
    private readonly documentStore: DocumentStore,
    private readonly chunkStore: DocumentChunkStore,
    private readonly moduleStore: ModuleStore,
    private readonly lessonStore: LessonStore,
    private readonly policy: AuthorizationPolicy,
    private readonly queue: GenerationQueue,
    private readonly auditService?: AuditService,
    private readonly flashcardStore?: FlashcardStore,
    private readonly quizStore?: QuizStore,
    private readonly quizQuestionStore?: QuizQuestionStore,
    private readonly organizationStore?: OrganizationStore,
    private readonly commerceStore?: CommerceStore,
    private readonly db?: DbClient,
  ) {}

  /**
   * Authorize a review action within an organization.
   */
  async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action:
      | "content:review"
      | "content:accept"
      | "content:reject"
      | "content:edit"
      | "content:regenerate",
  ): Promise<void> {
    let scopedActor = actor;
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership && actor.role !== "platform_admin") {
        throw new DomainError("not_found", "Organization not found");
      }
      const role =
        actor.role === "platform_admin"
          ? "platform_admin"
          : (membership?.role as Actor["role"] ?? actor.role);
      scopedActor = { ...actor, role };
    }
    const context: AuthContext = { organizationId };
    this.policy.require(action, scopedActor, context);
  }

  /**
   * Authorize a mutating review action (accept, reject, edit, regenerate).
   *
   * Security Rules:
   * 1. Actor must be a member of the organization (non-disclosing 404).
   * 2. Either the actor's scoped role has permission (course_editor, org_admin, platform_admin),
   *    OR the actor is the owner of the document that produced this content (doc.ownerUserId === actor.userId).
   */
  async authorizeAction(
    actor: Actor,
    organizationId: OrganizationId,
    action:
      | "content:accept"
      | "content:reject"
      | "content:edit"
      | "content:regenerate",
    record: GeneratedContentRecord,
  ): Promise<void> {
    let scopedActor = actor;
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership && actor.role !== "platform_admin") {
        throw new DomainError("not_found", "Organization not found");
      }
      const role =
        actor.role === "platform_admin"
          ? "platform_admin"
          : (membership?.role as Actor["role"] ?? actor.role);
      scopedActor = { ...actor, role };
    }

    const context: AuthContext = { organizationId };
    const hasRolePermission = this.policy.check(action, scopedActor, context);

    let isOwner = false;
    if (record.documentId && this.documentStore) {
      const doc = await this.documentStore.findByIdForOrganization(
        record.documentId,
        organizationId,
      );
      if (doc && doc.ownerUserId === actor.userId) {
        isOwner = true;
      }
    }

    if (!hasRolePermission && !isOwner) {
      throw new DomainError(
        "forbidden",
        `Action '${action}' not permitted for role '${scopedActor.role}' on content not owned by user`,
      );
    }
  }

  private async requireContent(
    organizationId: OrganizationId,
    contentId: GeneratedContentId,
  ): Promise<GeneratedContentRecord> {
    const record = await this.generatedContentStore.findByIdForOrganization(
      contentId,
      organizationId,
    );
    if (!record) {
      throw new DomainError("not_found", "Generated content not found");
    }
    return record;
  }

  /**
   * List the review queue for a course grouped by source document.
   */
  async reviewQueue(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    requestId: string,
    options?: {
      page?: number;
      limit?: number;
      type?: GeneratedContentRecord["type"];
      status?: string;
      search?: string;
    },
  ): Promise<ReviewQueueResponse> {
    await this.authorize(actor, organizationId, "content:review");

    // 1. Fetch all course contents
    const allCourseContents = await this.generatedContentStore.listByCourse(
      courseId,
      organizationId,
    );

    // 2. Fetch all active documents for the organization
    const activeDocs = await this.documentStore.listByOrganization(
      organizationId,
    );
    const docMap = new Map(activeDocs.map((d) => [d.id, d]));

    // 3. Group generated contents by documentId (or '__unknown__' for null/unmatched docs)
    const contentGroups = new Map<string, GeneratedContentRecord[]>();
    for (const record of allCourseContents) {
      const groupKey =
        record.documentId && docMap.has(record.documentId)
          ? record.documentId
          : "__unknown__";
      const existing = contentGroups.get(groupKey);
      if (existing) {
        existing.push(record);
      } else {
        contentGroups.set(groupKey, [record]);
      }
    }

    const searchQuery = options?.search?.trim().toLowerCase();
    const groups: ReviewDocumentGroupResource[] = [];

    for (const [groupKey, allItems] of contentGroups.entries()) {
      const doc =
        groupKey !== "__unknown__"
          ? docMap.get(groupKey as DocumentId)
          : undefined;

      // Calculate total breakdown stats for this document
      const total = allItems.length;
      const pendingCount = allItems.filter(
        (c) =>
          c.status === "draft" ||
          c.status === "edited" ||
          c.status === "regenerating",
      ).length;
      const approvedCount = allItems.filter(
        (c) => c.status === "accepted",
      ).length;
      const rejectedCount = allItems.filter(
        (c) => c.status === "rejected",
      ).length;
      const needsRevisionCount = allItems.filter(
        (c) => c.status === "edited",
      ).length;

      const stats: ReviewDocumentStats = {
        total,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        needsRevision: needsRevisionCount,
      };

      // Filter items for the review queue based on status, type, and search
      let matchedItems = allItems.filter((c) => {
        if (options?.status === "all") {
          return true;
        } else if (options?.status) {
          return c.status === options.status;
        }
        return c.status === "draft" || c.status === "edited";
      });

      if (options?.type) {
        matchedItems = matchedItems.filter((c) => c.type === options.type);
      }

      if (searchQuery) {
        const docNameMatches = doc?.originalName
          .toLowerCase()
          .includes(searchQuery);
        if (!docNameMatches) {
          matchedItems = matchedItems.filter((c) => {
            const res = this.toReviewQueueResource(c);
            return res.title.toLowerCase().includes(searchQuery);
          });
        }
      }

      // Only include this document group if there are matching review items
      if (matchedItems.length === 0) {
        continue;
      }

      // Sort matched items within group
      matchedItems.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

      const docResource: ReviewDocumentResource | null = doc
        ? {
            id: doc.id,
            filename: doc.originalName,
            title: doc.originalName,
            created_at: doc.createdAt,
          }
        : null;

      groups.push({
        document: docResource,
        stats,
        items: matchedItems.map((c) => this.toReviewQueueResource(c)),
      });
    }

    // Sort groups deterministically: newest item update first, then document ID
    groups.sort((a, b) => {
      const timeA =
        a.items.length > 0 ? new Date(a.items[0].updated_at).getTime() : 0;
      const timeB =
        b.items.length > 0 ? new Date(b.items[0].updated_at).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return (a.document?.id ?? "zzz").localeCompare(b.document?.id ?? "zzz");
    });

    const totalGroups = groups.length;
    const page = options?.page ? Math.max(1, options.page) : 1;
    const limit =
      options?.limit !== undefined ? Math.max(1, options.limit) : undefined;
    const effectiveLimit = limit ?? (totalGroups || 1);
    const totalPages = Math.ceil(totalGroups / effectiveLimit) || 1;

    const paginatedGroups =
      limit !== undefined || options?.page !== undefined
        ? groups.slice((page - 1) * effectiveLimit, page * effectiveLimit)
        : groups;

    const allPendingItems = paginatedGroups.flatMap((g) => g.items);

    return {
      request_id: requestId,
      groups: paginatedGroups,
      pending: allPendingItems,
      pagination: {
        page,
        limit: limit ?? totalGroups,
        total: totalGroups,
        totalPages,
      },
    };
  }

  private toReviewQueueResource(
    c: GeneratedContentRecord,
  ): ReviewQueueResource {
    const payload = c.payload as {
      title?: string;
      question?: string;
      cards?: Array<{ question: string }>;
    };
    let title = payload.title;
    if (!title) {
      if (c.type === "flashcard") {
        const count = Array.isArray(payload.cards) ? payload.cards.length : 0;
        title =
          count > 0
            ? `مجموعه ${count} فلش‌کارت آموزشی`
            : "مجموعه فلش‌کارت‌های آموزشی";
      } else if (c.type === "quiz") {
        title = payload.question
          ? `آزمون: ${payload.question.slice(0, 40)}`
          : "آزمون ارزیابی آموخته‌ها";
      } else if (c.type === "lesson") {
        title = "درس آموزشی";
      } else {
        title = "محتوای آموزشی";
      }
    }
    return {
      id: c.id,
      document_id: (c.documentId ?? "") as DocumentId,
      course_id: c.courseId,
      type: c.type,
      status: c.status,
      title,
      updated_at: c.updatedAt,
    };
  }

  /**
   * Get a single generated content for review, with its citations, source
   * chunks, and generation metadata.
   */
  async getContentForReview(
    actor: Actor,
    organizationId: OrganizationId,
    contentId: GeneratedContentId,
    requestId: string,
  ): Promise<ContentReviewResource> {
    await this.authorize(actor, organizationId, "content:review");

    const record = await this.requireContent(organizationId, contentId);
    const citations = await this.citationStore.listByGeneratedContent(
      record.id,
    );
    const chunkIds = citations.map((c) => c.documentChunkId);
    const document = record.documentId
      ? await this.documentStore.findByIdForOrganization(
          record.documentId,
          organizationId,
        )
      : null;
    if (!document && record.documentId) {
      throw new DomainError("not_found", "Document not found");
    }
    const allChunks = record.documentId
      ? await this.chunkStore.listByDocument(record.documentId)
      : [];

    const sourceChunks = allChunks
      .filter((ch) => chunkIds.includes(ch.id))
      .map((ch) => ({
        id: ch.id,
        sequence: ch.sequence,
        heading: ch.heading,
        content: ch.content,
        start_page: ch.startPage,
        end_page: ch.endPage,
      }));

    return {
      request_id: requestId,
      content: {
        id: record.id,
        document_id: (record.documentId ?? "") as DocumentId,
        course_id: record.courseId,
        type: record.type,
        status: record.status,
        payload: record.payload,
        prompt_version: record.promptVersion,
        model: record.model,
        token_usage: record.tokenUsage
          ? {
              input_tokens: record.tokenUsage.inputTokens,
              output_tokens: record.tokenUsage.outputTokens,
            }
          : null,
        citations: chunkIds.map((id) => id as string),
        reviewed_by: record.reviewedBy,
        reviewed_at: record.reviewedAt,
        review_reason: record.reviewReason,
        edited_by: record.editedBy,
        edited_at: record.editedAt,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
      source_chunks: sourceChunks,
      generation: {
        model: record.model,
        prompt_version: record.promptVersion,
        token_usage: record.tokenUsage
          ? {
              input_tokens: record.tokenUsage.inputTokens,
              output_tokens: record.tokenUsage.outputTokens,
            }
          : null,
      },
    };
  }

  /**
   * Accept a generated content.
   *
   * Idempotent: accepting an already-accepted content returns the existing
   * materialized entity (no duplicate creation).
   */
  async acceptContent(
    actor: Actor,
    organizationId: OrganizationId,
    contentId: GeneratedContentId,
  ): Promise<AcceptContentResult> {
    const record = await this.requireContent(organizationId, contentId);
    await this.authorizeAction(actor, organizationId, "content:accept", record);

    // Idempotent accept: already accepted → return existing materialization.
    if (record.status === "accepted") {
      return {
        content_id: record.id,
        status: "accepted",
        materialized_lesson_id: record.materializedLessonId,
      };
    }

    if (record.status !== "draft" && record.status !== "edited") {
      throw new DomainError(
        "conflict",
        `Cannot accept content in status '${record.status}'`,
      );
    }

    const now = new Date().toISOString();

    // Materialize accepted content into its respective store.
    let materializedLessonId: LessonId | null = record.materializedLessonId;
    if (record.type === "lesson" && !record.materializedLessonId) {
      materializedLessonId = await this.materializeLesson(record);
    } else if (record.type === "flashcard") {
      await this.materializeFlashcard(record);
    } else if (record.type === "quiz") {
      const qLessonId = await this.materializeQuiz(record);
      if (qLessonId) {
        materializedLessonId = qLessonId;
      }
    }

    const updated: GeneratedContentRecord = {
      ...record,
      status: "accepted",
      acceptedAt: now,
      acceptedBy: actor.userId,
      reviewedBy: actor.userId,
      reviewedAt: now,
      reviewReason: null,
      materializedLessonId,
      updatedAt: now,
    };
    await this.generatedContentStore.update(updated);

    if (this.auditService) {
      await this.auditService.emit([
        auditContentAccepted(actor.userId, organizationId, record.id, {
          documentId: record.documentId ?? "",
          type: record.type,
        }),
      ]);
    }

    return {
      content_id: record.id,
      status: "accepted",
      materialized_lesson_id: materializedLessonId,
    };
  }

  /**
   * Reject a generated content. Requires a rejection reason.
   */
  async rejectContent(
    actor: Actor,
    organizationId: OrganizationId,
    contentId: GeneratedContentId,
    reason: string,
  ): Promise<RejectContentResult> {
    const record = await this.requireContent(organizationId, contentId);
    await this.authorizeAction(actor, organizationId, "content:reject", record);

    if (!reason || reason.trim().length === 0) {
      throw new DomainError("bad_request", "Rejection reason is required");
    }

    if (record.status === "rejected") {
      return { content_id: record.id, status: "rejected" };
    }
    if (record.status !== "draft" && record.status !== "edited") {
      throw new DomainError(
        "conflict",
        `Cannot reject content in status '${record.status}'`,
      );
    }

    const now = new Date().toISOString();
    const updated: GeneratedContentRecord = {
      ...record,
      status: "rejected",
      reviewedBy: actor.userId,
      reviewedAt: now,
      reviewReason: reason.trim(),
      updatedAt: now,
    };
    await this.generatedContentStore.update(updated);

    if (this.auditService) {
      await this.auditService.emit([
        auditContentRejected(actor.userId, organizationId, record.id, {
          documentId: record.documentId ?? "",
          type: record.type,
        }),
      ]);
    }

    return { content_id: record.id, status: "rejected" };
  }

  /**
   * Edit a generated content before acceptance. Preserves citations and
   * stores the previous payload before mutation.
   */
  async editContent(
    actor: Actor,
    organizationId: OrganizationId,
    contentId: GeneratedContentId,
    updates: { payload: GeneratedContentRecord["payload"] },
  ): Promise<ContentReviewResource> {
    const record = await this.requireContent(organizationId, contentId);
    await this.authorizeAction(actor, organizationId, "content:edit", record);

    if (!updates.payload) {
      throw new DomainError("bad_request", "Edited payload is required");
    }

    if (record.status !== "draft" && record.status !== "edited") {
      throw new DomainError(
        "conflict",
        `Cannot edit content in status '${record.status}'`,
      );
    }

    const now = new Date().toISOString();
    const previousPayload = record.payload;
    const updated: GeneratedContentRecord = {
      ...record,
      status: "edited",
      payload: updates.payload,
      previousPayload,
      editedBy: actor.userId,
      editedAt: now,
      updatedAt: now,
    };
    await this.generatedContentStore.update(updated);

    if (this.auditService) {
      await this.auditService.emit([
        auditContentEdited(actor.userId, organizationId, record.id, {
          documentId: record.documentId ?? "",
          type: record.type,
          changedFields: ["payload"],
        }),
      ]);
    }

    return this.getContentForReview(actor, organizationId, contentId, "");
  }

  /**
   * Request regeneration of a generated content. Async: creates a
   * regeneration job, marks the content `regenerating`, and returns a job id
   * the client polls. The worker produces a replacement draft.
   */
  async regenerateContent(
    actor: Actor,
    organizationId: OrganizationId,
    contentId: GeneratedContentId,
  ): Promise<RegenerateContentResult> {
    const record = await this.requireContent(organizationId, contentId);
    await this.authorizeAction(actor, organizationId, "content:regenerate", record);

    if (record.status === "regenerating") {
      throw new DomainError("conflict", "Content is already being regenerated");
    }

    const now = new Date().toISOString();
    const generationKey = `content:${record.id}:regen:${now}`;

    // Mark unaccepted content as regenerating (async job in flight).
    // Accepted content remains accepted so students retain access if generation fails.
    if (record.status !== "accepted") {
      const updated: GeneratedContentRecord = {
        ...record,
        status: "regenerating",
        updatedAt: now,
      };
      await this.generatedContentStore.update(updated);
    }

    // Reuse the async generation queue (BullMQ). Never call the gateway
    // synchronously. The worker will call generateForDocument which is
    // idempotent on the generation key.
    const result = await this.queue.enqueueGenerationJob({
      actorUserId: actor.userId,
      actorRole: actor.role,
      organizationId,
      documentId: (record.documentId ?? "") as DocumentId,
      courseId: record.courseId,
      types: [record.type],
      promptVersion: record.promptVersion ?? undefined,
      generationKey,
      force: true,
    });

    if (this.auditService) {
      await this.auditService.emit([
        auditContentRegenerated(actor.userId, organizationId, record.id, {
          documentId: record.documentId ?? "",
          type: record.type,
          generationKey,
        }),
      ]);
    }

    return {
      content_id: record.id,
      job_id: result.generationJobId,
      status: "regenerating",
    };
  }

  private getModuleStore(stores?: ReviewScopedStores): ModuleStore | undefined {
    return stores?.moduleStore ?? this.moduleStore;
  }
  private getLessonStore(stores?: ReviewScopedStores): LessonStore | undefined {
    return stores?.lessonStore ?? this.lessonStore;
  }
  private getGeneratedContentStore(stores?: ReviewScopedStores): GeneratedContentStore {
    return stores?.generatedContentStore ?? this.generatedContentStore;
  }
  private getFlashcardStore(stores?: ReviewScopedStores): FlashcardStore | undefined {
    return stores?.flashcardStore ?? this.flashcardStore;
  }
  private getQuizStore(stores?: ReviewScopedStores): QuizStore | undefined {
    return stores?.quizStore ?? this.quizStore;
  }
  private getQuizQuestionStore(stores?: ReviewScopedStores): QuizQuestionStore | undefined {
    return stores?.quizQuestionStore ?? this.quizQuestionStore;
  }
  private getCommerceStore(stores?: ReviewScopedStores): CommerceStore | undefined {
    return stores?.commerceStore ?? this.commerceStore;
  }
  private getDocumentStore(stores?: ReviewScopedStores): DocumentStore | undefined {
    return stores?.documentStore ?? this.documentStore;
  }
  private getAuditService(stores?: ReviewScopedStores): AuditService | undefined {
    return stores?.auditService ?? this.auditService;
  }

  /**
   * Bulk accept all pending generated contents for a document (Content Pack).
   *
   * Rules:
   * 1. Requires `content:accept` permission or document ownership.
   * 2. Only processes approvable items (`draft` / `edited`).
   * 3. Already accepted items are skipped (idempotent, not re-processed).
   * 4. Only items for this specific document & course change status.
   * 5. Atomicity: In PostgreSQL, executes inside a real database transaction.
   *    In in-memory environments, snapshots state and rolls back completely on any failure.
   * 6. Emits audit logs for newly accepted items.
   */
  async acceptPack(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    documentId: DocumentId,
  ): Promise<BulkAcceptPackResult> {
    let scopedActor = actor;
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership && actor.role !== "platform_admin") {
        throw new DomainError("not_found", "Organization not found");
      }
      const role =
        actor.role === "platform_admin"
          ? "platform_admin"
          : (membership?.role as Actor["role"] ?? actor.role);
      scopedActor = { ...actor, role };
    }

    const context: AuthContext = { organizationId };
    const hasRolePermission = this.policy.check(
      "content:accept",
      scopedActor,
      context,
    );

    let isOwner = false;
    if (this.documentStore) {
      const doc = await this.documentStore.findByIdForOrganization(
        documentId,
        organizationId,
      );
      if (!doc) {
        throw new DomainError("not_found", "Document not found");
      }
      if (doc.ownerUserId === actor.userId) {
        isOwner = true;
      }
    }

    if (!hasRolePermission && !isOwner) {
      throw new DomainError(
        "forbidden",
        `Action 'content:accept' not permitted for role '${scopedActor.role}' on content pack not owned by user`,
      );
    }

    const allContents = (
      await this.generatedContentStore.listByDocument(documentId, organizationId)
    ).filter((c) => c.courseId === courseId && c.deletedAt === null);

    const alreadyAccepted = allContents.filter((c) => c.status === "accepted");
    const toAccept = allContents.filter(
      (c) => c.status === "draft" || c.status === "edited",
    );

    if (toAccept.length === 0) {
      return {
        document_id: documentId,
        total_items: allContents.length,
        accepted_count: 0,
        already_accepted_count: alreadyAccepted.length,
        accepted_content_ids: [],
        results: alreadyAccepted.map((item) => ({
          content_id: item.id,
          type: item.type,
          status: "accepted" as const,
          materialized_lesson_id: item.materializedLessonId,
        })),
      };
    }

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(async (tx) => {
        const txStores: ReviewScopedStores = {
          generatedContentStore: new DrizzleGeneratedContentStore(tx),
          documentStore: this.documentStore ? new DrizzleDocumentStore(tx) : undefined,
          moduleStore: this.moduleStore ? new DrizzleModuleStore(tx) : undefined,
          lessonStore: this.lessonStore ? new DrizzleLessonStore(tx) : undefined,
          flashcardStore: this.flashcardStore ? new DrizzleFlashcardStore(tx) : undefined,
          quizStore: this.quizStore ? new DrizzleQuizStore(tx) : undefined,
          quizQuestionStore: this.quizQuestionStore ? new DrizzleQuizQuestionStore(tx) : undefined,
          commerceStore: this.commerceStore ? new DrizzleCommerceStore(tx) : undefined,
          auditService: this.auditService ? new AuditService(new DrizzleAuditStore(tx)) : undefined,
        };
        return await this.executeAcceptPackBatch(
          actor,
          organizationId,
          documentId,
          allContents,
          toAccept,
          alreadyAccepted,
          txStores,
        );
      });
    }

    // In-memory execution with snapshot-based atomic rollback
    const snapContent = (this.generatedContentStore as any).takeSnapshot?.();
    const snapModule = (this.moduleStore as any)?.takeSnapshot?.();
    const snapLesson = (this.lessonStore as any)?.takeSnapshot?.();
    const snapFlashcard = (this.flashcardStore as any)?.takeSnapshot?.();
    const snapQuiz = (this.quizStore as any)?.takeSnapshot?.();
    const snapQuizQuestion = (this.quizQuestionStore as any)?.takeSnapshot?.();
    const snapAudit = (this.auditService as any)?.store?.takeSnapshot?.();

    try {
      return await this.executeAcceptPackBatch(
        actor,
        organizationId,
        documentId,
        allContents,
        toAccept,
        alreadyAccepted,
      );
    } catch (err) {
      if (snapContent) (this.generatedContentStore as any).restoreSnapshot?.(snapContent);
      if (snapModule) (this.moduleStore as any)?.restoreSnapshot?.(snapModule);
      if (snapLesson) (this.lessonStore as any)?.restoreSnapshot?.(snapLesson);
      if (snapFlashcard) (this.flashcardStore as any)?.restoreSnapshot?.(snapFlashcard);
      if (snapQuiz) (this.quizStore as any)?.restoreSnapshot?.(snapQuiz);
      if (snapQuizQuestion) (this.quizQuestionStore as any)?.restoreSnapshot?.(snapQuizQuestion);
      if (snapAudit) (this.auditService as any)?.store?.restoreSnapshot?.(snapAudit);
      throw err;
    }
  }

  private async executeAcceptPackBatch(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    allContents: GeneratedContentRecord[],
    toAccept: GeneratedContentRecord[],
    alreadyAccepted: GeneratedContentRecord[],
    stores?: ReviewScopedStores,
  ): Promise<BulkAcceptPackResult> {
    const contentStore = this.getGeneratedContentStore(stores);
    const auditService = this.getAuditService(stores);
    const now = new Date().toISOString();

    const results: BulkAcceptItemResult[] = [];
    const newlyAcceptedIds: GeneratedContentId[] = [];
    const auditEvents = [];

    for (const record of toAccept) {
      let materializedLessonId: LessonId | null = record.materializedLessonId;
      if (record.type === "lesson" && !record.materializedLessonId) {
        materializedLessonId = await this.materializeLesson(record, stores);
      } else if (record.type === "flashcard") {
        await this.materializeFlashcard(record, stores);
      } else if (record.type === "quiz") {
        const qLessonId = await this.materializeQuiz(record, stores);
        if (qLessonId) {
          materializedLessonId = qLessonId;
        }
      }

      const updated: GeneratedContentRecord = {
        ...record,
        status: "accepted",
        acceptedAt: now,
        acceptedBy: actor.userId,
        reviewedBy: actor.userId,
        reviewedAt: now,
        reviewReason: null,
        materializedLessonId,
        updatedAt: now,
      };
      await contentStore.update(updated);

      newlyAcceptedIds.push(record.id);
      results.push({
        content_id: record.id,
        type: record.type,
        status: "accepted",
        materialized_lesson_id: materializedLessonId,
      });

      auditEvents.push(
        auditContentAccepted(actor.userId, organizationId, record.id, {
          documentId: record.documentId ?? "",
          type: record.type,
          bulkApproved: true,
        }),
      );
    }

    if (auditService && auditEvents.length > 0) {
      await auditService.emit(auditEvents);
    }

    const allResults: BulkAcceptItemResult[] = [
      ...results,
      ...alreadyAccepted.map((item) => ({
        content_id: item.id,
        type: item.type,
        status: "accepted" as const,
        materialized_lesson_id: item.materializedLessonId,
      })),
    ];

    return {
      document_id: documentId,
      total_items: allContents.length,
      accepted_count: newlyAcceptedIds.length,
      already_accepted_count: alreadyAccepted.length,
      accepted_content_ids: newlyAcceptedIds,
      results: allResults,
    };
  }

  /**
   * Materialize an accepted AI lesson into the Learning Core.
   *
   * Creates/resolves a dedicated Module for the document/topic, and
   * materializes each session from `payload.sessions` as an individual,
   * properly sequenced LessonRecord (sortOrder: 0, 1, 2, ...).
   */
  private async materializeLesson(
    record: GeneratedContentRecord,
    stores?: ReviewScopedStores,
  ): Promise<LessonId> {
    const lessonStore = this.getLessonStore(stores);
    const moduleStore = this.getModuleStore(stores);
    const generatedContentStore = this.getGeneratedContentStore(stores);
    const flashcardStore = this.getFlashcardStore(stores);
    const quizStore = this.getQuizStore(stores);
    const commerceStore = this.getCommerceStore(stores);

    if (!lessonStore || !moduleStore) {
      return randomUUID() as LessonId;
    }

    const payload = record.payload as {
      title?: string;
      moduleTitle?: string;
      outline?: Array<{ title: string; description?: string }>;
      sessions?: Array<{
        title: string;
        contentMarkdown: string;
        citationChunkIds?: string[];
      }>;
      contentMarkdown?: string;
    };

    // 1. Resolve or create the single authoritative Module for this document
    const targetModule = await this.resolveOrCreateDocumentModule(
      record,
      payload.moduleTitle,
      payload.title,
      stores,
    );

    const now = new Date().toISOString();

    // 2. Determine sessions to materialize
    const sessionList: Array<{ title: string; contentMarkdown: string }> =
      Array.isArray(payload.sessions) && payload.sessions.length > 0
        ? payload.sessions
        : [
            {
              title: payload.title ?? "درس آموزشی",
              contentMarkdown: payload.contentMarkdown ?? "",
            },
          ];

    // 3. Clean up / soft-delete prior lessons materialized for this document/module to avoid duplication
    const priorLessonIds: LessonId[] = [];
    if (record.documentId) {
      const priorDrafts = await generatedContentStore.listByDocument(
        record.documentId,
        record.organizationId,
      );
      const priorLessonDrafts = priorDrafts.filter(
        (g) => g.type === "lesson" && g.id !== record.id && g.materializedLessonId,
      );
      for (const prior of priorLessonDrafts) {
        if (prior.materializedLessonId) {
          priorLessonIds.push(prior.materializedLessonId as LessonId);
          const priorLesson = await lessonStore.findById(
            prior.materializedLessonId as LessonId,
          );
          if (priorLesson) {
            await lessonStore.delete(priorLesson.id);
            if (flashcardStore && record.documentId) {
              await flashcardStore.deleteByDocument(
                record.documentId,
                record.organizationId,
              );
            }
            if (quizStore && record.documentId) {
              await quizStore.deleteByDocument(
                record.documentId,
                record.organizationId,
              );
            }
          }
        }
        await generatedContentStore.update({
          ...prior,
          deletedAt: now,
          updatedAt: now,
        });
      }
    }

    // 4. Create each session as a distinct LessonRecord
    let firstLessonId: LessonId | null = null;
    for (let idx = 0; idx < sessionList.length; idx++) {
      const sess = sessionList[idx];
      const lessonRecord: LessonRecord = {
        id: randomUUID() as LessonId,
        moduleId: targetModule.id,
        title: sess.title,
        contentType: "markdown",
        contentMarkdown: normalizeEducationalContent(sess.contentMarkdown),
        sortOrder: idx,
        estimatedMinutes: null,
        publicationStatus: "published",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await lessonStore.create(lessonRecord);
      if (!firstLessonId) {
        firstLessonId = lessonRecord.id;
      }
    }

    // 5. Commerce Product Handling: Volume-based Suggested Pricing & Zero-Overwrite Preservation
    if (commerceStore && firstLessonId) {
      // Check if a prior materialized lesson had an existing product (e.g. from previous run / admin priced)
      let existingProduct = null;
      for (const priorId of priorLessonIds) {
        const prod = await commerceStore.findProductByCode(
          `content_${priorId}`,
        );
        if (prod) {
          existingProduct = prod;
          break;
        }
      }

      if (!existingProduct) {
        existingProduct = await commerceStore.findProductByCode(
          `content_${firstLessonId}`,
        );
      }

      if (existingProduct) {
        // PRESERVE EXISTING PRODUCT AND SELLING PRICE (e.g. 10,000 set by Admin)
        // Update targetId & code to track the new materialized lesson id
        const existingPrior = Array.isArray((existingProduct.metadata as any)?.priorLessonIds)
          ? ((existingProduct.metadata as any).priorLessonIds as string[])
          : [];
        const combinedPrior = Array.from(
          new Set([...existingPrior, ...priorLessonIds, existingProduct.targetId].filter(Boolean)),
        );

        await commerceStore.updateProduct(existingProduct.id, {
          targetId: firstLessonId,
          code: `content_${firstLessonId}`,
          title: sessionList[0]?.title ?? existingProduct.title,
          metadata: {
            ...((existingProduct.metadata as any) ?? {}),
            priorLessonIds: combinedPrior,
          },
        });
      } else {
        // New Content: Compute suggested price based on content volume
        let flashcardCount = 0;
        let questionCount = 0;
        let hasReviewSummary = false;

        if (record.documentId) {
          const docDrafts = await generatedContentStore.listByDocument(
            record.documentId,
            record.organizationId,
          );
          for (const d of docDrafts) {
            if (d.deletedAt || d.status === "rejected") continue;
            if (d.type === "flashcard") {
              const p = d.payload as { cards?: unknown[]; question?: unknown; answer?: unknown } | undefined;
              if (Array.isArray(p?.cards) && p.cards.length > 0) {
                flashcardCount += p.cards.length;
              } else if (p?.question && p?.answer) {
                flashcardCount += 1;
              }
            } else if (d.type === "quiz") {
              const p = d.payload as { questions?: unknown[]; quiz?: { questions?: unknown[] } } | undefined;
              if (Array.isArray(p?.questions) && p.questions.length > 0) {
                questionCount += p.questions.length;
              } else if (Array.isArray(p?.quiz?.questions) && p.quiz.questions.length > 0) {
                questionCount += p.quiz.questions.length;
              }
            } else if (d.type === "review_summary") {
              if (isCompleteReviewSummary(d.payload)) {
                hasReviewSummary = true;
              }
            }
          }
        }

        const metrics = {
          lessonCount: sessionList.length,
          flashcardCount,
          questionCount,
          hasReviewSummary,
        };
        const suggestedPrice = calculateDefaultContentPrice(metrics);
        const breakdown = calculateContentPricingBreakdown(metrics);

        await commerceStore.createProduct({
          id: asProductId(randomUUID()),
          code: `content_${firstLessonId}`,
          type: "content",
          title: sessionList[0]?.title ?? "درس آموزشی",
          description: sessionList[0]?.title ?? "",
          price: suggestedPrice,
          currency: "toman",
          targetType: "content",
          targetId: firstLessonId,
          durationDays: null,
          active: false, // Inactive/Draft until admin activates
          metadata: {
            suggestedPrice,
            defaultPriced: true,
            pricingBreakdown: breakdown,
            explicitlyFree: false,
          },
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }

    return firstLessonId ?? (randomUUID() as LessonId);
  }

  /**
   * Single Source of Truth Document Module Resolver.
   *
   * Absolute Invariant: ONE DOCUMENT → ONE AUTHORITATIVE MODULE.
   *
   * Priority:
   * 1. Direct document_id match in moduleStore via findByDocument
   * 2. Existing module associated via previously materialized generated content
   * 3. Title match on course modules (using payloadModuleTitle / payloadTopic)
   * 4. Create new Module linked explicitly to record.documentId
   *    (Concurrency-safe: handles duplicate key unique constraint race conditions)
   */
  private async resolveOrCreateDocumentModule(
    record: GeneratedContentRecord,
    payloadModuleTitle?: string,
    payloadTopic?: string,
    stores?: ReviewScopedStores,
  ): Promise<ModuleRecord> {
    const moduleStore = this.getModuleStore(stores);
    const generatedContentStore = this.getGeneratedContentStore(stores);
    const lessonStore = this.getLessonStore(stores);
    const documentStore = this.getDocumentStore(stores);

    if (!moduleStore) {
      throw new DomainError("bad_request", "Module store not initialized");
    }

    // 1. Primary Identity: Check if a Module is already explicitly linked to this documentId
    let targetModule = record.documentId
      ? await moduleStore.findByDocument(record.documentId)
      : undefined;
    if (targetModule) {
      return targetModule;
    }

    // 2. Check previously materialized generated content records for this document
    if (generatedContentStore && record.documentId) {
      const docContents = await generatedContentStore.listByDocument(
        record.documentId,
        record.organizationId,
      );
      for (const gc of docContents) {
        if (gc.materializedLessonId && lessonStore) {
          const lesson = await lessonStore.findById(gc.materializedLessonId);
          if (lesson) {
            const mod = await moduleStore.findById(lesson.moduleId);
            if (mod) {
              // Update module's documentId reference if missing
              if (!mod.documentId && record.documentId) {
                mod.documentId = record.documentId;
                await moduleStore.update(mod).catch(() => {});
              }
              return mod;
            }
          }
        }
      }
    }

    // Fetch document metadata for title fallback if needed
    const doc = documentStore && record.documentId
      ? await documentStore.findByIdForOrganization(
          record.documentId,
          record.organizationId,
        )
      : null;
    const cleanDocName = doc?.originalName
      ? doc.originalName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim()
      : null;

    const modules = await moduleStore.listByCourse(record.courseId);

    // 3. Title-based match for existing course modules
    targetModule = modules.find((m) => {
      if (doc?.originalName && m.description?.includes(doc.originalName)) {
        return true;
      }
      if (payloadModuleTitle && m.title === payloadModuleTitle.trim()) {
        return true;
      }
      if (cleanDocName && (m.title === `فصل: ${cleanDocName}` || m.title.includes(cleanDocName))) {
        return true;
      }
      return false;
    });

    // Determine clean extracted title from AI payload
    type PayloadWithTitle = { title?: string };
    const payloadTitle = (record.payload as PayloadWithTitle | undefined)?.title;
    const extractedTitle =
      payloadModuleTitle?.trim() ||
      payloadTopic?.trim() ||
      (payloadTitle
        ? payloadTitle.replace(/^آزمون (ارزیابی آموخته‌ها: |ارزیابی: |)/, "").trim()
        : null);

    const isFilenameFallback = (t: string) => this.isFilenameFallback(t);

    if (targetModule) {
      let needsUpdate = false;
      if (!targetModule.documentId && record.documentId) {
        targetModule.documentId = record.documentId;
        needsUpdate = true;
      }
      if (extractedTitle && isFilenameFallback(targetModule.title)) {
        targetModule.title = extractedTitle.startsWith("فصل") ? extractedTitle : `فصل: ${extractedTitle}`;
        needsUpdate = true;
      }
      if (needsUpdate) {
        await moduleStore.update(targetModule).catch(() => {});
      }
      return targetModule;
    }

    // 4. Determine title for new module (Identity is documentId, Title is metadata)
    const resolvedTitle =
      extractedTitle
        ? (extractedTitle.startsWith("فصل") ? extractedTitle : `فصل: ${extractedTitle}`)
        : (cleanDocName ? `فصل: ${cleanDocName}` : "سرفصل آموزشی استخراج‌شده");

    const now = new Date().toISOString();

    // 5. Create new Module with concurrency safety against race conditions
    try {
      targetModule = await moduleStore.create({
        id: randomUUID() as ModuleId,
        courseId: record.courseId,
        documentId: record.documentId,
        title: resolvedTitle,
        description: `مباحث و جلسات آموزشی استخراج‌شده از ${doc?.originalName ?? "جزوه"}`,
        sortOrder: modules.length,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      return targetModule;
    } catch (err: unknown) {
      type ErrorWithCode = { code?: string; message?: string };
      const e = err as ErrorWithCode;
      // Race condition catch: if another concurrent process inserted the module milliseconds ago
      if (e?.code === "23505" || e?.message?.includes("idx_modules_course_document_unique")) {
        const raceModule = record.documentId ? await moduleStore.findByDocument(record.documentId) : undefined;
        if (raceModule) return raceModule;
      }
      throw err;
    }
  }

  /**
   * Materialize an accepted AI flashcard (or flashcard set).
   *
   * Idempotent: checking existing flashcard by generated_content_id.
   */
  private async materializeFlashcard(
    record: GeneratedContentRecord,
    stores?: ReviewScopedStores,
  ): Promise<void> {
    const flashcardStore = this.getFlashcardStore(stores);
    const lessonStore = this.getLessonStore(stores);

    if (!flashcardStore) return;
    const existing = await flashcardStore.findByGeneratedContent(
      record.id,
    );
    if (existing) return;

    // Clean up previous flashcards for this document to avoid duplicate card piles
    if (record.documentId) {
      await flashcardStore.deleteByDocument(
        record.documentId,
        record.organizationId,
      );
    }

    const now = new Date().toISOString();
    type RawFlashcardItem = {
      front?: string;
      back?: string;
      question?: string;
      answer?: string;
      explanation?: string;
      difficulty?: string;
      cardType?: string;
      topic?: string;
      sessionIndex?: number;
    };
    type ExtendedFlashcardPayload = {
      title?: string;
      moduleTitle?: string;
      topic?: string;
      flashcards?: RawFlashcardItem[];
      cards?: RawFlashcardItem[];
      question?: string;
      answer?: string;
    };

    const payload = (record.payload || {}) as ExtendedFlashcardPayload;

    const targetModule = await this.resolveOrCreateDocumentModule(
      record,
      payload.moduleTitle,
      payload.topic,
      stores,
    );

    const lessons = lessonStore
      ? await lessonStore.listByModule(targetModule.id)
      : [];

    const rawCards: RawFlashcardItem[] =
      Array.isArray(payload.flashcards) && payload.flashcards.length > 0
        ? payload.flashcards
        : Array.isArray(payload.cards) && payload.cards.length > 0
        ? payload.cards
        : payload.question && payload.answer
        ? [payload]
        : [];

    const cards = rawCards.map((c: RawFlashcardItem) => {
      let cLessonId: LessonId | null = null;
      if (lessons.length > 0) {
        if (typeof c.sessionIndex === "number" && !isNaN(c.sessionIndex)) {
          const matchBySortOrder = lessons.find((l) => l.sortOrder === c.sessionIndex);
          if (matchBySortOrder) {
            cLessonId = matchBySortOrder.id;
          } else if (c.sessionIndex >= 0 && c.sessionIndex < lessons.length) {
            cLessonId = lessons[c.sessionIndex].id;
          }
        } else if (c.topic || payload.topic) {
          const cardTopic = (c.topic ?? payload.topic ?? "").toLowerCase().trim();
          const match = cardTopic
            ? lessons.find((l) => l.title.toLowerCase().includes(cardTopic))
            : null;
          cLessonId = match ? match.id : null;
        }

        if (!cLessonId && lessons.length === 1) {
          cLessonId = lessons[0].id;
        }
      }

      const qText = c.front ?? c.question ?? "سوال Flashcard";
      const aText = c.back ?? c.answer ?? "پاسخ Flashcard";

      return {
        id: parseFlashcardId(randomUUID()),
        organizationId: record.organizationId,
        courseId: record.courseId,
        documentId: record.documentId,
        generatedContentId: record.id,
        lessonId: cLessonId,
        question: qText,
        answer: aText,
        explanation: c.explanation ?? null,
        cardType: c.cardType ?? "definition",
        difficulty: c.difficulty ?? "medium",
        dueAt: now,
        intervalDays: 0,
        easeFactor: 2.5,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
    });

    if (cards.length > 0) {
      await flashcardStore.createMany(cards);
    }
  }

  /**
   * Materialize an accepted AI quiz.
   *
   * Idempotent: checking existing quiz by generated_content_id.
   * Resolves Module in Learning Core using Single Source of Truth resolver (`resolveOrCreateDocumentModule`),
   * attaches quiz questions to matching lessons or leaves lessonId as null if unmapped,
   * avoiding creation of duplicate shell modules or fake placeholder lessons.
   */
  private async materializeQuiz(
    record: GeneratedContentRecord,
    stores?: ReviewScopedStores,
  ): Promise<LessonId | null> {
    const quizStore = this.getQuizStore(stores);
    const quizQuestionStore = this.getQuizQuestionStore(stores);
    const lessonStore = this.getLessonStore(stores);

    if (!quizStore || !quizQuestionStore) return null;
    const existing = await quizStore.findByGeneratedContent(record.id);
    if (existing) return record.materializedLessonId ?? null;

    // Clean up previous quizzes for this document to avoid duplicate quizzes
    if (record.documentId) {
      await quizStore.deleteByDocument(
        record.documentId,
        record.organizationId,
      );
    }

    const now = new Date().toISOString();

    const payload = record.payload as {
      title?: string;
      moduleTitle?: string;
      topic?: string;
      difficulty?: string;
      question?: string;
      choices?: string[];
      options?: string[];
      correctAnswer?: unknown;
      correct_answer?: unknown;
      answer?: unknown;
      explanation?: string;
      questions?: Array<{
        question: string;
        questionType?: string;
        choices?: string[];
        options?: string[];
        correctAnswer?: unknown;
        correct_answer?: unknown;
        answer?: unknown;
        explanation?: string;
        difficulty?: string;
        topic?: string;
        sessionIndex?: number;
      }>;
    };

    // 1. Resolve or create Module for this document using unified Single Source of Truth resolver
    const targetModule = await this.resolveOrCreateDocumentModule(
      record,
      payload.moduleTitle,
      payload.topic,
      stores,
    );

    const lessons = lessonStore
      ? await lessonStore.listByModule(targetModule.id)
      : [];

    const quizId = parseQuizId(randomUUID());
    const defaultTopic = payload.topic ?? targetModule.title;
    const defaultDifficulty = payload.difficulty ?? "medium";

    const title =
      payload.title ??
      (payload.question
        ? `آزمون: ${payload.question.slice(0, 30)}`
        : `آزمون ارزیابی: ${targetModule.title}`);

    await quizStore.create({
      id: quizId,
      organizationId: record.organizationId,
      courseId: record.courseId,
      documentId: record.documentId,
      title,
      topic: defaultTopic,
      difficulty: defaultDifficulty,
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const rawQuestions =
      Array.isArray(payload.questions) && payload.questions.length > 0
        ? payload.questions
        : payload.question
        ? [
            {
              question: payload.question,
              questionType: "multiple_choice",
              choices: payload.choices ?? payload.options ?? [],
              correctAnswer:
                payload.correctAnswer ?? payload.correct_answer ?? payload.answer,
              explanation: payload.explanation,
              difficulty: payload.difficulty,
              topic: payload.topic,
            },
          ]
        : [];

    let matchedLessonId: LessonId | null = null;

    const questions = rawQuestions.map((q, index) => {
      const choices = q.choices ?? q.options ?? payload.choices ?? payload.options ?? [];
      const rawAns =
        q.correctAnswer ??
        q.correct_answer ??
        q.answer ??
        payload.correctAnswer ??
        payload.correct_answer;

      const correctAnswer =
        rawAns !== undefined && rawAns !== null
          ? rawAns
          : choices.length > 0
          ? choices[0]
          : "گزینه ۱";

      // Deterministically map question to a specific lesson in the module using sessionIndex, sortOrder, topic or block fallback
      let qLessonId: LessonId | null = null;
      if (lessons.length > 0) {
        if (typeof q.sessionIndex === "number" && !isNaN(q.sessionIndex)) {
          const matchBySortOrder = lessons.find((l) => l.sortOrder === q.sessionIndex);
          if (matchBySortOrder) {
            qLessonId = matchBySortOrder.id;
          } else if (q.sessionIndex >= 0 && q.sessionIndex < lessons.length) {
            qLessonId = lessons[q.sessionIndex].id;
          } else if (q.sessionIndex - 1 >= 0 && q.sessionIndex - 1 < lessons.length) {
            qLessonId = lessons[q.sessionIndex - 1].id;
          }
        } else if (q.topic || payload.topic) {
          const qTopic = (q.topic ?? payload.topic ?? "").toLowerCase().trim();
          const match = qTopic
            ? lessons.find((l) => l.title.toLowerCase().includes(qTopic))
            : null;
          if (match) {
            qLessonId = match.id;
          }
        }

        if (!qLessonId && rawQuestions.length >= lessons.length) {
          const blockIdx = Math.min(
            lessons.length - 1,
            Math.floor((index / rawQuestions.length) * lessons.length),
          );
          if (lessons[blockIdx]) {
            qLessonId = lessons[blockIdx].id;
          }
        }

        if (qLessonId && !matchedLessonId) {
          matchedLessonId = qLessonId;
        }
      }

      const mappedLesson = qLessonId ? lessons.find((l) => l.id === qLessonId) : null;
      const rawQTopic = q.topic ?? defaultTopic;
      const cleanQuestionTopic =
        mappedLesson?.title ||
        (rawQTopic && !this.isFilenameFallback(rawQTopic) ? rawQTopic : null) ||
        targetModule.title;

      const normalized = normalizeQuestionOptions({
        question: q.question,
        choices,
        correctAnswer,
        explanation: q.explanation ?? payload.explanation ?? null,
      });

      const shuffled = canonicalizeAndShuffleQuestion(normalized.normalized);

      return {
        id: parseQuizQuestionId(randomUUID()),
        quizId,
        generatedContentId: record.id,
        lessonId: qLessonId,
        question: shuffled.question ?? q.question,
        topic: cleanQuestionTopic,
        difficulty: q.difficulty ?? payload.difficulty ?? defaultDifficulty,
        questionType: q.questionType ?? "multiple_choice",
        choices: shuffled.choices && shuffled.choices.length > 0 ? shuffled.choices : null,
        correctAnswer: shuffled.correctAnswer,
        explanation: q.explanation ?? payload.explanation ?? null,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
    });

    if (questions.length > 0) {
      await quizQuestionStore.createMany(questions);
    }

    return matchedLessonId;
  }

  private isFilenameFallback(t: string | null | undefined): boolean {
    if (!t) return true;
    const c = t.replace(/^فصل:\s*/, "").trim();
    if (/^\d+$/.test(c)) return true;
    if (/\.(pdf|docx|pptx|txt)$/i.test(c)) return true;
    return false;
  }
}
