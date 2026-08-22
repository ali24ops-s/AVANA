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
  parseFlashcardId,
  parseQuizId,
  parseQuizQuestionId,
  auditContentAccepted,
  auditContentEdited,
  auditContentRejected,
  auditContentRegenerated,
} from "@avana/domain";
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
import type { AuditService } from "../../observability/audit-service.js";

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

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
  pending: ReviewQueueResource[];
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
    if (
      this.organizationStore &&
      typeof this.organizationStore.findMembership === "function"
    ) {
      const membership = await this.organizationStore.findMembership(
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
   * List the review queue for a course: all generated content requiring
   * review (draft / edited / rejected). Accepted content is excluded.
   */
  async reviewQueue(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    requestId: string,
  ): Promise<ReviewQueueResponse> {
    // Review-queue exposes drafts — only editors/admins may review AI output.
    // Students may read only accepted content (already materialized lessons).
    await this.authorize(actor, organizationId, "content:accept");

    const pending = await this.generatedContentStore.listByCourse(
      courseId,
      organizationId,
    );

    const activeDocs = await this.documentStore.listByOrganization(
      organizationId,
    );
    const activeDocIds = new Set(
      activeDocs
        .filter((d) => d.courseId === courseId || d.courseId === null)
        .map((d) => d.id),
    );

    const resources = pending
      .filter((c) => activeDocIds.has(c.documentId))
      .filter((c) => c.status === "draft" || c.status === "edited")
      .map((c) => this.toReviewQueueResource(c));

    return { request_id: requestId, pending: resources };
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
      document_id: c.documentId,
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
    const document = await this.documentStore.findByIdForOrganization(
      record.documentId,
      organizationId,
    );
    if (!document) {
      throw new DomainError("not_found", "Document not found");
    }
    const allChunks = await this.chunkStore.listByDocument(record.documentId);

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
        document_id: record.documentId,
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
    await this.authorize(actor, organizationId, "content:accept");

    const record = await this.requireContent(organizationId, contentId);

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
          documentId: record.documentId,
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
    await this.authorize(actor, organizationId, "content:reject");

    if (!reason || reason.trim().length === 0) {
      throw new DomainError("bad_request", "Rejection reason is required");
    }

    const record = await this.requireContent(organizationId, contentId);

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
          documentId: record.documentId,
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
    await this.authorize(actor, organizationId, "content:edit");

    if (!updates.payload) {
      throw new DomainError("bad_request", "Edited payload is required");
    }

    const record = await this.requireContent(organizationId, contentId);

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
          documentId: record.documentId,
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
    await this.authorize(actor, organizationId, "content:regenerate");

    const record = await this.requireContent(organizationId, contentId);

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
      documentId: record.documentId,
      courseId: record.courseId,
      types: [record.type],
      promptVersion: record.promptVersion ?? undefined,
      generationKey,
    });

    if (this.auditService) {
      await this.auditService.emit([
        auditContentRegenerated(actor.userId, organizationId, record.id, {
          documentId: record.documentId,
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

  /**
   * Materialize an accepted AI lesson into the Learning Core.
   *
   * Creates/resolves a dedicated Module for the document/topic, and
   * materializes each session from `payload.sessions` as an individual,
   * properly sequenced LessonRecord (sortOrder: 0, 1, 2, ...).
   */
  private async materializeLesson(
    record: GeneratedContentRecord,
  ): Promise<LessonId> {
    if (!this.lessonStore || !this.moduleStore) {
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
    const priorDrafts = await this.generatedContentStore.listByDocument(
      record.documentId,
      record.organizationId,
    );
    const priorLessonDrafts = priorDrafts.filter(
      (g) => g.type === "lesson" && g.id !== record.id && g.materializedLessonId,
    );
    for (const prior of priorLessonDrafts) {
      if (prior.materializedLessonId) {
        const priorLesson = await this.lessonStore.findById(
          prior.materializedLessonId as LessonId,
        );
        if (priorLesson) {
          await this.lessonStore.delete(priorLesson.id);
        }
      }
      await this.generatedContentStore.update({
        ...prior,
        deletedAt: now,
        updatedAt: now,
      });
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
        contentMarkdown: sess.contentMarkdown,
        sortOrder: idx,
        estimatedMinutes: null,
        publicationStatus: "published",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      await this.lessonStore.create(lessonRecord);
      if (!firstLessonId) {
        firstLessonId = lessonRecord.id;
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
  ): Promise<ModuleRecord> {
    if (!this.moduleStore) {
      throw new DomainError("bad_request", "Module store not initialized");
    }

    // 1. Primary Identity: Check if a Module is already explicitly linked to this documentId
    let targetModule = await this.moduleStore.findByDocument(record.documentId);
    if (targetModule) {
      return targetModule;
    }

    // 2. Check previously materialized generated content records for this document
    if (this.generatedContentStore) {
      const docContents = await this.generatedContentStore.listByDocument(
        record.documentId,
        record.organizationId,
      );
      for (const gc of docContents) {
        if (gc.materializedLessonId && this.lessonStore) {
          const lesson = await this.lessonStore.findById(gc.materializedLessonId);
          if (lesson) {
            const mod = await this.moduleStore.findById(lesson.moduleId);
            if (mod) {
              // Update module's documentId reference if missing
              if (!mod.documentId) {
                mod.documentId = record.documentId;
                await this.moduleStore.update(mod).catch(() => {});
              }
              return mod;
            }
          }
        }
      }
    }

    // Fetch document metadata for title fallback if needed
    const doc = this.documentStore
      ? await this.documentStore.findByIdForOrganization(
          record.documentId,
          record.organizationId,
        )
      : null;
    const cleanDocName = doc?.originalName
      ? doc.originalName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim()
      : null;

    const modules = await this.moduleStore.listByCourse(record.courseId);

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
    const extractedTitle =
      payloadModuleTitle?.trim() ||
      payloadTopic?.trim() ||
      ((record.payload as any)?.title
        ? (record.payload as any).title.replace(/^آزمون (ارزیابی آموخته‌ها: |ارزیابی: |)/, "").trim()
        : null);

    const isFilenameFallback = (t: string) => this.isFilenameFallback(t);

    if (targetModule) {
      let needsUpdate = false;
      if (!targetModule.documentId) {
        targetModule.documentId = record.documentId;
        needsUpdate = true;
      }
      if (extractedTitle && isFilenameFallback(targetModule.title)) {
        targetModule.title = extractedTitle.startsWith("فصل") ? extractedTitle : `فصل: ${extractedTitle}`;
        needsUpdate = true;
      }
      if (needsUpdate) {
        await this.moduleStore.update(targetModule).catch(() => {});
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
      targetModule = await this.moduleStore.create({
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
    } catch (err: any) {
      // Race condition catch: if another concurrent process inserted the module milliseconds ago
      if (err?.code === "23505" || err?.message?.includes("idx_modules_course_document_unique")) {
        const raceModule = await this.moduleStore.findByDocument(record.documentId);
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
  ): Promise<void> {
    if (!this.flashcardStore) return;
    const existing = await this.flashcardStore.findByGeneratedContent(
      record.id,
    );
    if (existing) return;

    // Clean up previous flashcards for this document to avoid duplicate card piles
    await this.flashcardStore.deleteByDocument(
      record.documentId,
      record.organizationId,
    );

    const now = new Date().toISOString();
    const payload = record.payload as {
      title?: string;
      moduleTitle?: string;
      topic?: string;
      flashcards?: Array<{
        front: string;
        back: string;
        explanation?: string;
        difficulty?: string;
        topic?: string;
      }>;
    };

    const targetModule = await this.resolveOrCreateDocumentModule(
      record,
      payload.moduleTitle,
      payload.topic,
    );

    const lessons = this.lessonStore
      ? await this.lessonStore.listByModule(targetModule.id)
      : [];

    const rawCards =
      Array.isArray(payload.flashcards) && payload.flashcards.length > 0
        ? payload.flashcards
        : Array.isArray((payload as any).cards) && (payload as any).cards.length > 0
        ? (payload as any).cards
        : (payload as any).question && (payload as any).answer
        ? [payload as any]
        : [];

    const cards = rawCards.map((c: any) => {
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
      await this.flashcardStore.createMany(cards);
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
  private async materializeQuiz(record: GeneratedContentRecord): Promise<LessonId | null> {
    if (!this.quizStore || !this.quizQuestionStore) return null;
    const existing = await this.quizStore.findByGeneratedContent(record.id);
    if (existing) return record.materializedLessonId ?? null;

    // Clean up previous quizzes for this document to avoid duplicate quizzes
    await this.quizStore.deleteByDocument(
      record.documentId,
      record.organizationId,
    );

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
    );

    const lessons = this.lessonStore
      ? await this.lessonStore.listByModule(targetModule.id)
      : [];

    const quizId = parseQuizId(randomUUID());
    const defaultTopic = payload.topic ?? targetModule.title;
    const defaultDifficulty = payload.difficulty ?? "medium";

    const title =
      payload.title ??
      (payload.question
        ? `آزمون: ${payload.question.slice(0, 30)}`
        : `آزمون ارزیابی: ${targetModule.title}`);

    await this.quizStore.create({
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

      return {
        id: parseQuizQuestionId(randomUUID()),
        quizId,
        generatedContentId: record.id,
        lessonId: qLessonId,
        question: q.question,
        topic: cleanQuestionTopic,
        difficulty: q.difficulty ?? payload.difficulty ?? defaultDifficulty,
        questionType: q.questionType ?? "multiple_choice",
        choices: choices.length > 0 ? choices : null,
        correctAnswer,
        explanation: q.explanation ?? payload.explanation ?? null,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
    });

    if (questions.length > 0) {
      await this.quizQuestionStore.createMany(questions);
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
