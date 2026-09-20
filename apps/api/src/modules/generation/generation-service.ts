/**
 * GenerationService (PR6-4 & Coverage-Driven Batched Architecture).
 *
 * Orchestrates AI content generation for a document:
 *   document_chunks → Content Planning & Coverage Analysis → Batched Lessons →
 *   Batched Flashcards → Batched Quizzes → Coverage Audit & Report → Database Persistence
 *
 * Quota-Efficient Architecture:
 * - Stage 1 (Planning): 1 API call extracts syllabus, major concepts, high-yield facts, and session blueprints.
 * - Stage 2 (Lessons): Educational Lessons per session.
 * - Stage 3 (Flashcards): Batched atomic flashcards.
 * - Stage 4 (Quizzes): Batched multiple-choice quizzes.
 * - Stage 5 (Review Summary & Audit): High-Density Review Summary («خلاصه مروری») and DocumentCoverageReport.
 *
 * Total API request count for a 17-page chapter: ~6-8 calls total (down from ~31+ calls),
 * safely within the Gemini Free Tier limit (20 calls/day).
 *
 * Status separation (explicit design rule):
 *   - Document status is the processing lifecycle (extracted → generating →
 *     review_pending → ready).
 *   - Generated-content status is the AI artifact lifecycle (draft → ...).
 * These are separate axes. A document may be `review_pending` while
 * individual contents remain `draft`.
 *
 * Source-grounding: every generated artifact must link to document_chunks.
 * The service assigns the loaded chunk IDs to the payload's
 * `citationChunkIds`, so no artifact is ever persisted without citations.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type AuthAction,
  type AuthContext,
  type AuthorizationPolicy,
  type CourseId,
  type DocumentChunkId,
  type DocumentId,
  type GeneratedContentId,
  type GenerationJobId,
  type GenerationJobStatus,
  type OrganizationId,
  DomainError,
  defaultPolicy,
  auditContentGenerated,
  auditGenerationFailed,
  type GeneratedContentType,
  type GeneratedContentPayload,
  type LessonPayload,
  isGenerationTypeEnabled,
  calculateGenerationBudget,
  type GenerationBudget,
  type DocumentCoverageReport,
  type SessionCoverageAudit,
  type ContentPlan,
  type CoverageConcept,
  type ReviewSummaryPayload,
  type ReviewSummarySection,
  type ReviewSummaryComparison,
  type ReviewSummaryGenerationInput,
  type ReviewSummarySourceTopic,
  type ReviewSummarySession,
  type ReviewSummaryCoreConcept,
  type ReviewSummaryHighYieldFact,
  type ReviewSummaryLessonInput,
  type ReviewSummarySourceChunk,
  type ReviewSummaryGenerationContext,
  validateReviewSummaryInput,
  validateReviewSummaryPayload,
  validateAndGroundReviewSummaryCitations,
  getReviewSummaryConfig,
  validateQuestionQuality,
  repairQuestionBias,
  canonicalizeAndShuffleQuestion,
  isNearDuplicateQuestion,
  calculateEstimatedGenerationCost,
  type CostEstimateResult,
  calculateReferenceBasedUserPrice,
  type ReferenceBasedUserPriceResult,
  type ReferencePricingBaseline,
  type ModelPricingConfig,
  resolveCorrectChoiceText,
  type GenerationChunkRecord,
  type GenerationChunkStage,
  type GenerationProgress,
  type DocumentGenerationProgressResource,
  DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  normalizeEducationalContent,
  extractChemicalStructuresFromMarkdown,
  isLessonChunkSetCurrent,
  cleanEducationalTitle,
  resolveCanonicalContentTitle,
} from "@avana/domain";
import {
  CONTENT_PLANNING_SYSTEM_PROMPT,
  buildContentPlanningUserPrompt,
  LESSON_GENERATION_SYSTEM_PROMPT,
  buildLessonGenerationUserPrompt,
  buildLessonBatchGenerationUserPrompt,
  FLASHCARD_GENERATION_SYSTEM_PROMPT,
  buildFlashcardGenerationUserPrompt,
  buildFlashcardBatchGenerationUserPrompt,
  QUIZ_GENERATION_SYSTEM_PROMPT,
  buildQuizGenerationUserPrompt,
  buildQuizBatchGenerationUserPrompt,
  REVIEW_SUMMARY_SYSTEM_PROMPT,
  buildReviewSummaryUserPrompt,
} from "./prompt-registry.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type {
  DocumentRecord,
  DocumentChunkRecord,
  DocumentStore,
  DocumentChunkStore,
  ModuleStore,
  LessonStore,
} from "../learning/learning-store.js";
import type {
  GeneratedContentStore,
  GeneratedContentCitationStore,
  GeneratedContentRecord,
} from "./generation-store.js";
import {
  type GenerationChunkStore,
  InMemoryGenerationChunkStore,
} from "./generation-chunk-store.js";
import {
  InMemoryGenerationProgressStore,
} from "./generation-progress-store.js";
import { GenerationProgressService } from "./generation-progress-service.js";
import type { GenerationJobStore } from "./generation-jobs-store.js";
import type {
  FlashcardStore,
  QuizStore,
  QuizQuestionStore,
} from "../study/study-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { EntitlementService } from "../commerce/entitlement-service.js";
import { isDeepSeekProvider, type ModelGateway } from "./gateway/index.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { GenerationContext } from "./generation-queue.js";
import { cleanAndParseJson } from "./engine/resilient-json-parser.js";
import { GenerationQueryService } from "./services/generation-query-service.js";
import {
  GenerationContentStatusService,
  type DocumentContentStatusResource,
} from "./services/generation-content-status-service.js";
import {
  GenerationActiveStatusService,
  type ActiveGenerationResource,
} from "./services/generation-active-status-service.js";
import { GenerationLifecycleService } from "./services/generation-lifecycle-service.js";

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

export type { ActiveGenerationResource };
export type { DocumentContentStatusResource };

export type GeneratedContentResource = {
  id: GeneratedContentId;
  organization_id: OrganizationId;
  document_id: DocumentId;
  course_id: CourseId;
  type: GeneratedContentType;
  status: GeneratedContentRecord["status"];
  payload: GeneratedContentPayload;
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

export type GenerateResult = {
  contents: GeneratedContentResource[];
  document_status: DocumentRecord["status"];
};

export class GenerationStoppedError extends DomainError {
  constructor(message = "عملیات تولید با درخواست کاربر متوقف شد.") {
    super("bad_request", message);
    this.name = "GenerationStoppedError";
    Object.setPrototypeOf(this, GenerationStoppedError.prototype);
  }
}

export class GenerationDeletedError extends DomainError {
  constructor(message = "عملیات تولید حذف شد.") {
    super("bad_request", message);
    this.name = "GenerationDeletedError";
    Object.setPrototypeOf(this, GenerationDeletedError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GenerationService {
  private readonly chunkRecordStore: GenerationChunkStore;
  private readonly generationJobStore?: GenerationJobStore;
  public readonly progressService: GenerationProgressService;
  public readonly queryService: GenerationQueryService;
  public readonly contentStatusService: GenerationContentStatusService;
  public readonly activeStatusService: GenerationActiveStatusService;
  public readonly lifecycleService: GenerationLifecycleService;
  private notificationService?: NotificationService;
  private readonly pricingConfig?: ModelPricingConfig;
  private readonly referencePricingProvider?: () => Promise<ReferencePricingBaseline>;
  private readonly entitlementService?: EntitlementService;

  constructor(
    private readonly generatedContentStore: GeneratedContentStore,
    private readonly citationStore: GeneratedContentCitationStore,
    private readonly gateway: ModelGateway,
    private readonly documentStore: DocumentStore,
    private readonly chunkStore: DocumentChunkStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly auditService?: AuditService,
    private readonly orgStore?: OrganizationStore,
    private readonly moduleStore?: ModuleStore,
    private readonly lessonStore?: LessonStore,
    private readonly flashcardStore?: FlashcardStore,
    private readonly quizStore?: QuizStore,
    private readonly quizQuestionStore?: QuizQuestionStore,
    private readonly courseStore?: CourseStore,
    private readonly systemOrganizationId?: OrganizationId,
    generationChunkStore?: GenerationChunkStore,
    generationJobStore?: GenerationJobStore,
    generationProgressService?: GenerationProgressService,
    notificationService?: NotificationService,
    generationQueryService?: GenerationQueryService,
    generationContentStatusService?: GenerationContentStatusService,
    generationActiveStatusService?: GenerationActiveStatusService,
    generationLifecycleService?: GenerationLifecycleService,
    pricingConfig?: ModelPricingConfig,
    referencePricingProvider?: () => Promise<ReferencePricingBaseline>,
    entitlementService?: EntitlementService,
  ) {
    this.pricingConfig = pricingConfig;
    this.referencePricingProvider = referencePricingProvider;
    this.entitlementService = entitlementService;
    this.chunkRecordStore =
      generationChunkStore ?? new InMemoryGenerationChunkStore();
    this.generationJobStore = generationJobStore;
    this.progressService =
      generationProgressService ??
      new GenerationProgressService(new InMemoryGenerationProgressStore());
    this.notificationService = notificationService;
    this.queryService =
      generationQueryService ??
      new GenerationQueryService(
        this.documentStore,
        this.chunkRecordStore,
        this.progressService,
        this.generationJobStore,
        this.orgStore,
        this.policy,
      );
    this.contentStatusService =
      generationContentStatusService ??
      new GenerationContentStatusService(
        this.documentStore,
        this.generatedContentStore,
        this.progressService,
        this.queryService,
        this.orgStore,
        this.moduleStore,
        this.lessonStore,
        this.flashcardStore,
        this.quizStore,
        this.quizQuestionStore,
        this.policy,
      );
    this.activeStatusService =
      generationActiveStatusService ??
      new GenerationActiveStatusService(
        this.documentStore,
        this.generatedContentStore,
        this.progressService,
        this.queryService,
        this.orgStore,
        this.systemOrganizationId,
        this.policy,
      );
    this.lifecycleService =
      generationLifecycleService ??
      new GenerationLifecycleService(
        this.documentStore,
        this.generatedContentStore,
        this.progressService,
        this.chunkRecordStore,
        this.generationJobStore,
        this.orgStore,
        this.policy,
      );
  }

  setNotificationService(service?: NotificationService): void {
    this.notificationService = service;
  }

  /**
   * Safe point cancellation check. Checks whether the current generation run has been stopped or deleted.
   * If stopping, transitions the job to stopped and aborts execution cleanly.
   */
  private async checkCancellation(
    jobId?: string,
    organizationId?: OrganizationId,
    documentId?: DocumentId,
  ): Promise<void> {
    return this.lifecycleService.checkCancellation(
      jobId,
      organizationId,
      documentId,
    );
  }

  /**
   * Authorization check helper (public for routes inspection).
   */
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
   * Execute an atomic chunk AI task with isolated retries (transient/parse errors).
   */
  private async executeWithChunkRetry<T>(
    chunkKey: string,
    fn: () => Promise<T>,
    maxRetries = 1,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        // Do NOT retry provider-level DomainErrors (gateway is sole retry owner)
        if (
          err instanceof DomainError &&
          (err.code === "service_unavailable" ||
            err.code === "rate_limit_exceeded" ||
            err.code === "bad_request" ||
            err.code === "not_found" ||
            err.code === "conflict" ||
            err.code === "unauthorized" ||
            err.code === "forbidden")
        ) {
          throw err;
        }
        if (attempt < maxRetries) {
          process.stderr.write(
            `[generation-service] Chunk "${chunkKey}" parsing/internal attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}. Retrying chunk parsing...\n`,
          );
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  /**
   * Atomically acquire execution lock for a chunk or wait for a concurrent worker to finish.
   */
  private async acquireOrWaitForChunk<T>(params: {
    id?: string;
    organizationId: OrganizationId;
    documentId: DocumentId;
    courseId?: CourseId | null;
    jobId?: string;
    stage: GenerationChunkStage;
    chunkIndex: number;
    chunkKey: string;
    maxWaitMs?: number;
  }): Promise<
    | { status: "completed"; payload: T; record: GenerationChunkRecord }
    | { status: "claimed"; record: GenerationChunkRecord }
  > {
    const maxWait = params.maxWaitMs ?? 30_000;
    const startTime = Date.now();

    while (true) {
      const claim = await this.chunkRecordStore.claimChunk({
        id: params.id,
        organizationId: params.organizationId,
        documentId: params.documentId,
        courseId: params.courseId,
        stage: params.stage,
        chunkIndex: params.chunkIndex,
        chunkKey: params.chunkKey,
      });

      if (claim.status === "completed" && claim.record.payload) {
        return {
          status: "completed",
          payload: claim.record.payload as T,
          record: claim.record,
        };
      }

      if (claim.status === "claimed") {
        return {
          status: "claimed",
          record: claim.record,
        };
      }

      // Chunk is locked by another active worker
      if (Date.now() - startTime >= maxWait) {
        const latest = await this.chunkRecordStore.findByDocumentAndKey(
          params.documentId,
          params.chunkKey,
          params.organizationId,
        );
        if (latest?.status === "completed" && latest.payload) {
          return {
            status: "completed",
            payload: latest.payload as T,
            record: latest,
          };
        }
        // Force-claim stale locked chunk with fresh lease in database
        const now = new Date();
        const leaseExpiresAt = new Date(now.getTime() + 600_000).toISOString();
        const claimedRecord = await this.chunkRecordStore.upsert({
          id: latest?.id ?? params.id ?? randomUUID(),
          organizationId: params.organizationId,
          documentId: params.documentId,
          courseId: params.courseId ?? null,
          stage: params.stage,
          chunkIndex: params.chunkIndex,
          chunkKey: params.chunkKey,
          status: "running",
          payload: null,
          tokenUsage: null,
          attempts: (latest?.attempts ?? 0) + 1,
          createdAt: latest?.createdAt ?? now.toISOString(),
          updatedAt: now.toISOString(),
          heartbeatAt: now.toISOString(),
          leaseExpiresAt,
        });

        return {
          status: "claimed",
          record: claimedRecord,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  /**
   * Calculate incremental generation progress for a document based on real persisted DB state.
   * Delegated to GenerationQueryService.
   */
  async getGenerationProgress(
    documentId: DocumentId,
    organizationId: OrganizationId,
    requestedTypes?: GeneratedContentType[],
  ): Promise<GenerationProgress> {
    return this.queryService.getGenerationProgress(
      documentId,
      organizationId,
      requestedTypes,
    );
  }

  /**
   * Ensure document exists in organization.
   */
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

  /**
   * Map record to external resource.
   */
  private async toResource(
    record: GeneratedContentRecord,
  ): Promise<GeneratedContentResource> {
    const citations = await this.citationStore.listByGeneratedContent(
      record.id,
    );
    const chunkIds = citations.map((c) => c.documentChunkId);

    const token_usage = record.tokenUsage
      ? {
          input_tokens: record.tokenUsage.inputTokens,
          output_tokens: record.tokenUsage.outputTokens,
        }
      : null;

    return {
      id: record.id,
      organization_id: record.organizationId,
      document_id: (record.documentId ?? "") as DocumentId,
      course_id: record.courseId,
      type: record.type,
      status: record.status,
      payload: record.payload,
      prompt_version: record.promptVersion,
      model: record.model,
      token_usage,
      citations: chunkIds,
      reviewed_by: record.reviewedBy,
      reviewed_at: record.reviewedAt,
      review_reason: record.reviewReason,
      edited_by: record.editedBy,
      edited_at: record.editedAt,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }

  /**
   * Parse and validate model JSON output with multi-stage recovery.
   * Delegated to standalone ResilientJsonParser engine.
   */
  private cleanAndParseJson<T>(text: string, typeDesc: string): T {
    return cleanAndParseJson<T>(text, typeDesc);
  }

  /**
   * Stage 1: Content Planning & Coverage Analysis.
   *
   * 1 LLM request extracts:
   * - Unified Table of Contents (Outline) with at least minTopics sessions (>=8 for medium/large docs).
   * - Inventory of all major concepts and high-yield facts across 11 pharmacological/educational categories.
   * - Session blueprints mapping source chunks, concepts, and target flashcard/quiz counts.
   */
  private async extractContentPlan(
    doc: DocumentRecord,
    chunks: Array<{ id: string; content: string; heading: string | null }>,
    budget: GenerationBudget,
    promptVersion: string,
    correlationId: string,
    organizationId: OrganizationId,
    documentId: DocumentId,
    targetCourseId?: CourseId,
    jobId?: string,
  ): Promise<{
    contentPlan: ContentPlan;
    moduleTitle: string;
    outline: Array<{ title: string; description: string; relevantChunkIds?: string[] }>;
    citationChunkIds: string[];
    model: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    await this.checkCancellation(jobId, organizationId, documentId);
    await this.progressService.startStage(documentId, organizationId, "planning", 1);

    const claim = await this.acquireOrWaitForChunk<{
      contentPlan: ContentPlan;
      moduleTitle: string;
      outline: Array<{ title: string; description: string; relevantChunkIds?: string[] }>;
      citationChunkIds: string[];
      model: string;
      usage: { inputTokens: number; outputTokens: number };
    }>({
      organizationId,
      documentId,
      courseId: targetCourseId ?? doc.courseId,
      jobId,
      stage: "planning",
      chunkIndex: 0,
      chunkKey: "planning",
    });

    if (claim.status === "completed") {
      const currentChunkIds = new Set(chunks.map((c) => c.id));
      const cachedPlan = claim.payload?.contentPlan;

      const hasInvalidSessionChunks =
        !cachedPlan ||
        !Array.isArray(cachedPlan.sessions) ||
        cachedPlan.sessions.length === 0 ||
        cachedPlan.sessions.some(
          (s) =>
            Array.isArray(s.relevantChunkIds) &&
            s.relevantChunkIds.some((id) => !currentChunkIds.has(id)),
        );

      const hasInvalidTopicChunks =
        Array.isArray(cachedPlan?.sourceTopics) &&
        cachedPlan.sourceTopics.some(
          (t) =>
            Array.isArray(t.relevantChunkIds) &&
            t.relevantChunkIds.some((id) => !currentChunkIds.has(id)),
        );

      const hasInvalidTopLevelCitations =
        Array.isArray(claim.payload?.citationChunkIds) &&
        claim.payload.citationChunkIds.some((id) => !currentChunkIds.has(id));

      if (hasInvalidSessionChunks || hasInvalidTopicChunks || hasInvalidTopLevelCitations) {
        process.stdout.write(
          `[generation-service] Stage 1: Cached planning has stale/unknown chunk references for document "${documentId}". Invalidating stage cache and re-extracting plan.\n`,
        );
        await this.chunkRecordStore.deleteByDocumentAndStages(
          documentId,
          ["planning", "lesson", "flashcard", "quiz"],
          organizationId,
        );
      } else {
        process.stdout.write(
          `[generation-service] Stage 1: Content Planning loaded from cache for "${doc.originalName}" (${claim.payload.contentPlan.sessions.length} sessions).\n`,
        );
        await this.progressService.completeStage(documentId, organizationId, "planning");
        return claim.payload;
      }
    }

    const existing = claim.record;
    const now = existing.updatedAt || new Date().toISOString();

    const chunkContext = chunks
      .map(
        (c, i) =>
          `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
      )
      .join("\n\n---\n\n");
    const chunkIdList = chunks.map((c) => c.id);

    const prompt = buildContentPlanningUserPrompt({
      docName: doc.originalName,
      targetTopicCount: budget.topicBudget.targetTopicCount,
      minTopics: budget.topicBudget.minTopics,
      maxTopics: budget.topicBudget.maxTopics,
      minCardsPerTopic: budget.flashcardBudget.minCardsPerTopic,
      minQuestionsPerTopic: budget.quizBudget.minQuestionsPerTopic,
      chunkCount: chunks.length,
      chunkContext,
      chunkIdList,
    });

    process.stdout.write(
      `[generation-service] Stage 1: Planning content for "${doc.originalName}" (${chunks.length} chunks, target sessions: ${budget.topicBudget.targetTopicCount})...\n`,
    );
    process.stdout.write(
      `[GENERATION] stage_started: documentId=${documentId} stage=planning correlationId=${correlationId}\n`,
    );

    try {
      const planningResult = await this.executeWithChunkRetry(
        "planning",
        async () => {
          process.stdout.write(
            `[GENERATION] provider_request_started: stage=planning correlationId=${correlationId}\n`,
          );
          const completion = await this.gateway.complete({
            promptVersion,
            messages: [
              {
                role: "system",
                content: CONTENT_PLANNING_SYSTEM_PROMPT,
              },
              { role: "user", content: prompt },
            ],
            jsonSchema: { type: "content_plan" },
            correlationId,
            organizationId,
            documentId,
            stage: "planning",
          });

          process.stdout.write(
            `[GENERATION] provider_response_received: stage=planning correlationId=${correlationId} inputTokens=${completion.usage?.inputTokens ?? 0} outputTokens=${completion.usage?.outputTokens ?? 0}\n`,
          );

          process.stdout.write(
            `[GENERATION] parsing_started: stage=planning correlationId=${correlationId}\n`,
          );
          const parsed = this.cleanAndParseJson<{
            moduleTitle?: string;
            sourceTopics?: Array<{
              id: string;
              title: string;
              description: string;
              category?: string;
              relevantChunkIds?: string[];
            }>;
            sessions?: Array<{
              index?: number;
              title: string;
              description: string;
              coreConcepts?: CoverageConcept[];
              relevantChunkIds?: string[];
              targetFlashcardCount?: number;
              targetQuizCount?: number;
            }>;
            outline?: Array<{ title: string; description: string; relevantChunkIds?: string[] }>;
            highYieldFacts?: Array<{
              id: string;
              fact: string;
              category: string;
              sessionIndex: number;
            }>;
            citationChunkIds?: string[];
          }>(completion.text, "content planning");

          const moduleTitle = cleanEducationalTitle(
            parsed.moduleTitle,
            "مبحث آموزشی جامع",
          );

          // Normalize session blueprints
          let rawSessions = Array.isArray(parsed.sessions) && parsed.sessions.length > 0
            ? parsed.sessions
            : (Array.isArray(parsed.outline) && parsed.outline.length > 0
                ? parsed.outline.map((o, idx) => ({
                    index: idx,
                    title: o.title,
                    description: o.description,
                    relevantChunkIds: o.relevantChunkIds,
                    coreConcepts: [],
                    targetFlashcardCount: budget.flashcardBudget.targetCardsPerTopic,
                    targetQuizCount: budget.quizBudget.targetQuestionsPerTopic,
                  }))
                : [
                    {
                      index: 0,
                      title: "جلسه ۱: مفاهیم کلیدی و مبانی",
                      description: "بررسی اصول و تعاریف پایه منبع",
                      relevantChunkIds: chunkIdList,
                      coreConcepts: [],
                      targetFlashcardCount: budget.flashcardBudget.targetCardsPerTopic,
                      targetQuizCount: budget.quizBudget.targetQuestionsPerTopic,
                    },
                  ]);

          // Explicit minimum session policy enforcement:
          if (
            rawSessions.length < budget.topicBudget.minTopics &&
            chunks.length >= budget.topicBudget.minTopics
          ) {
            const targetCount = budget.topicBudget.targetTopicCount;
            const expanded: typeof rawSessions = [];
            const chunksPerSession = Math.max(1, Math.floor(chunks.length / targetCount));

            for (let s = 0; s < targetCount; s++) {
              const startIdx = s * chunksPerSession;
              const endIdx = s === targetCount - 1 ? chunks.length : (s + 1) * chunksPerSession;
              const assignedChunks = chunks.slice(startIdx, endIdx);
              const chunkIds = assignedChunks.map((c) => c.id);
              const headings = assignedChunks
                .map((c) => c.heading)
                .filter(Boolean)
                .join("، ");

              const title =
                headings.length > 0
                  ? `جلسه ${s + 1}: ${headings.slice(0, 60)}`
                  : `جلسه ${s + 1}: مبحث شماره ${s + 1} - تحلیل و آموزش مفاهیم`;

              expanded.push({
                index: s,
                title,
                description: `بررسی جامع و آموزشی سرفصل شماره ${s + 1} بر اساس داده‌های منبع`,
                relevantChunkIds: chunkIds,
                coreConcepts: [],
                targetFlashcardCount: budget.flashcardBudget.targetCardsPerTopic,
                targetQuizCount: budget.quizBudget.targetQuestionsPerTopic,
              });
            }
            rawSessions = expanded;
          }

          const chunkIdSet = new Set(chunkIdList);

          // Build validated ContentPlan
          const contentPlan: ContentPlan = {
            moduleTitle,
            sourceTopics: (parsed.sourceTopics || []).map((t, idx) => ({
              id: t.id || `topic-${idx + 1}`,
              title: t.title,
              description: t.description || "",
              category: (t.category as unknown as "major_topic") || "major_topic",
              relevantChunkIds:
                Array.isArray(t.relevantChunkIds) && t.relevantChunkIds.length > 0
                  ? t.relevantChunkIds.filter((id) => chunkIdSet.has(id))
                  : chunkIdList,
            })),
            sessions: rawSessions.map((s, idx) => ({
              index: typeof s.index === "number" ? s.index : idx,
              title: s.title,
              description: s.description || "",
              coreConcepts: (s.coreConcepts || []).map((c) => ({
                ...c,
                sourceChunkIds: Array.isArray(c.sourceChunkIds)
                  ? c.sourceChunkIds.filter((id) => chunkIdSet.has(id))
                  : undefined,
              })),
              relevantChunkIds:
                Array.isArray(s.relevantChunkIds) && s.relevantChunkIds.length > 0
                  ? s.relevantChunkIds.filter((id) => chunkIdSet.has(id))
                  : rawSessions.length === 1
                    ? chunkIdList
                    : [],
              targetFlashcardCount: s.targetFlashcardCount || budget.flashcardBudget.targetCardsPerTopic,
              targetQuizCount: s.targetQuizCount || budget.quizBudget.targetQuestionsPerTopic,
            })),
            highYieldFacts: (parsed.highYieldFacts || []).map((hy, idx) => ({
              id: hy.id || `fact-${idx + 1}`,
              fact: hy.fact,
              category: (hy.category as unknown as "high_yield") || "high_yield",
              sessionIndex: hy.sessionIndex ?? 0,
            })),
          };

          process.stdout.write(
            `[GENERATION] validation_passed: stage=planning correlationId=${correlationId} sessionsCount=${contentPlan.sessions.length}\n`,
          );

          const outline = contentPlan.sessions.map((s) => ({
            title: s.title,
            description: s.description,
            relevantChunkIds: s.relevantChunkIds,
          }));

          return {
            contentPlan,
            moduleTitle,
            outline,
            citationChunkIds: chunkIdList,
            model: completion.model,
            usage: completion.usage,
          };
        },
      );

      const completedAt = new Date().toISOString();
      await this.chunkRecordStore.upsert({
        id: existing?.id ?? randomUUID(),
        organizationId,
        documentId,
        courseId: targetCourseId ?? doc.courseId,
        stage: "planning",
        chunkIndex: 0,
        chunkKey: "planning",
        status: "completed",
        payload: planningResult,
        tokenUsage: planningResult.usage,
        attempts: (existing?.attempts ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: completedAt,
        completedAt,
      });

      process.stdout.write(
        `[GENERATION] persistence_completed: stage=planning chunkKey=planning documentId=${documentId}\n`,
      );

      await this.progressService.completeStage(documentId, organizationId, "planning");

      return planningResult;
    } catch (err) {
      await this.chunkRecordStore.upsert({
        id: existing?.id ?? randomUUID(),
        organizationId,
        documentId,
        courseId: targetCourseId ?? doc.courseId,
        stage: "planning",
        chunkIndex: 0,
        chunkKey: "planning",
        status: "failed",
        errorCode: this.resolveErrorCode(err),
        errorMessage: err instanceof Error ? err.message : String(err),
        attempts: (existing?.attempts ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: new Date().toISOString(),
      });
      throw err;
    }
  }


  /**
   * Stage 2: Educational Lesson Generation (Per-Session).
   *
   * Generates a complete, deep, structured educational lesson for EACH session blueprint
   * independently in a dedicated API/Model call.
   * Each call receives ONLY the blueprint and relevant source chunks for that specific session.
   */
  private async generateSessionsBatched(
    doc: DocumentRecord,
    sessionBlueprints: ContentPlan["sessions"],
    chunks: Array<{ id: string; content: string; heading: string | null }>,
    _budget: GenerationBudget,
    promptVersion: string,
    correlationId: string,
    organizationId: OrganizationId,
    documentId: DocumentId,
    targetCourseId?: CourseId,
    jobId?: string,
  ): Promise<{
    sessions: Array<{ title: string; contentMarkdown: string; citationChunkIds: string[] }>;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    await this.checkCancellation(jobId, organizationId, documentId);
    const generatedSessions: Array<{
      title: string;
      contentMarkdown: string;
      citationChunkIds: string[];
    }> = [];
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    await this.progressService.startStage(
      documentId,
      organizationId,
      "lesson",
      sessionBlueprints.length,
    );

    if (isDeepSeekProvider(this.gateway)) {
      // -----------------------------------------------------------------------
      // DeepSeek Batch Processing (batchSize = 3)
      // -----------------------------------------------------------------------
      const BATCH_SIZE = 3;
      for (let batchStart = 0; batchStart < sessionBlueprints.length; batchStart += BATCH_SIZE) {
        await this.checkCancellation(jobId, organizationId, documentId);
        const batchBlueprints = sessionBlueprints.slice(batchStart, batchStart + BATCH_SIZE);

        // 1. Check cache for each blueprint in batch
        const pendingBlueprints: typeof batchBlueprints = [];
        for (const blueprint of batchBlueprints) {
          const chunkKey = `lesson:${blueprint.index}`;
          const claim = await this.acquireOrWaitForChunk<{
            title: string;
            contentMarkdown: string;
            citationChunkIds: string[];
          }>({
            organizationId,
            documentId,
            courseId: targetCourseId ?? doc.courseId,
            jobId,
            stage: "lesson",
            chunkIndex: blueprint.index,
            chunkKey,
          });

          if (claim.status === "completed") {
            const currentChunkIds = new Set(chunks.map((c) => c.id));
            const isStale =
              !claim.payload ||
              (Array.isArray(claim.payload.citationChunkIds) &&
                claim.payload.citationChunkIds.some((id) => !currentChunkIds.has(id)));

            if (!isStale) {
              process.stdout.write(
                `[generation-service] Stage 2: Lesson for session ${blueprint.index + 1}/${sessionBlueprints.length} ("${blueprint.title}") loaded from cache.\n`,
              );
              generatedSessions[blueprint.index] = claim.payload;
              if (claim.record.tokenUsage) {
                totalUsage.inputTokens += claim.record.tokenUsage.inputTokens;
                totalUsage.outputTokens += claim.record.tokenUsage.outputTokens;
              }
              await this.progressService.updateProgress(
                documentId,
                organizationId,
                "lesson",
                blueprint.index + 1,
                sessionBlueprints.length,
              );
              continue;
            }
          }
          pendingBlueprints.push(blueprint);
        }

        if (pendingBlueprints.length === 0) {
          continue;
        }

        // 2. Validate relevant chunks for pending blueprints
        const validPendingItems: Array<{
          blueprint: (typeof batchBlueprints)[number];
          effectiveChunks: Array<{ id: string; content: string; heading: string | null }>;
          chunkContext: string;
          chunkIdList: string[];
          sessionBlueprintJson: string;
        }> = [];

        for (const blueprint of pendingBlueprints) {
          const relevantChunks = chunks.filter((c) =>
            blueprint.relevantChunkIds?.includes(c.id),
          );

          if (relevantChunks.length === 0) {
            process.stderr.write(
              `[generation-service] Stage 2 Diagnostic Warning: Session ${blueprint.index + 1}/${sessionBlueprints.length} ("${blueprint.title}") has no valid matching chunks. Model call skipped.\n`,
            );
            const fallbackLesson = {
              title: blueprint.title,
              contentMarkdown: `# ${blueprint.title}\n\n> **خطای انتساب منبع:** هیچ بخش معتبری از سند برای این جلسه آموزشی اختصاص نیافته است.\n\nتولید این جلسه برای جلوگیری از کاهش دقت علمی و اختلاط با سایر بخش‌های سند متوقف شد.`,
              citationChunkIds: [],
            };
            generatedSessions[blueprint.index] = fallbackLesson;
            await this.progressService.updateProgress(
              documentId,
              organizationId,
              "lesson",
              blueprint.index + 1,
              sessionBlueprints.length,
            );
            continue;
          }

          const effectiveChunks = relevantChunks;
          const chunkContext = effectiveChunks
            .map(
              (c, i) =>
                `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
            )
            .join("\n\n---\n\n");
          const chunkIdList = effectiveChunks.map((c) => c.id);
          const sessionBlueprintJson = JSON.stringify(
            {
              index: blueprint.index,
              title: blueprint.title,
              description: blueprint.description,
              coreConcepts: blueprint.coreConcepts,
              relevantChunkIds: blueprint.relevantChunkIds,
            },
            null,
            2,
          );

          validPendingItems.push({
            blueprint,
            effectiveChunks,
            chunkContext,
            chunkIdList,
            sessionBlueprintJson,
          });
        }

        if (validPendingItems.length === 0) {
          continue;
        }

        // 3. Dispatch batch request to DeepSeek
        const batchKey = `lesson_batch:${validPendingItems.map((v) => v.blueprint.index).join(",")}`;
        const batchPrompt = buildLessonBatchGenerationUserPrompt({
          documentTitle: doc.originalName,
          sessions: validPendingItems.map((v) => ({
            sessionIndex: v.blueprint.index,
            sessionTitle: v.blueprint.title,
            sessionBlueprint: v.sessionBlueprintJson,
            chunkContext: v.chunkContext,
            chunkIdList: v.chunkIdList,
          })),
        });

        process.stdout.write(
          `[generation-service] Stage 2: Generating DeepSeek Batch (${validPendingItems.length} lessons: ${validPendingItems.map((v) => `"${v.blueprint.title}"`).join(", ")})...\n`,
        );

        const batchResult = await this.executeWithChunkRetry(
          batchKey,
          async () => {
            const completion = await this.gateway.complete({
              promptVersion,
              messages: [
                {
                  role: "system",
                  content: LESSON_GENERATION_SYSTEM_PROMPT,
                },
                { role: "user", content: batchPrompt },
              ],
              jsonSchema: { type: "lesson_batch" },
              correlationId,
              organizationId,
              documentId,
              stage: "lesson",
            });

            const parsed = this.cleanAndParseJson<{
              results?: Array<{
                sessionIndex?: number;
                index?: number;
                sessionTitle?: string;
                title?: string;
                contentMarkdown?: string;
                citationChunkIds?: string[];
              }>;
              sessions?: Array<{
                sessionIndex?: number;
                index?: number;
                sessionTitle?: string;
                title?: string;
                contentMarkdown?: string;
                citationChunkIds?: string[];
              }>;
            }>(completion.text, "lesson_batch");

            const rawResults = Array.isArray(parsed?.results)
              ? parsed.results
              : Array.isArray(parsed?.sessions)
                ? parsed.sessions
                : Array.isArray(parsed)
                  ? (parsed as unknown[])
                  : [];

            return {
              results: rawResults as Array<{
                sessionIndex?: number;
                index?: number;
                sessionTitle?: string;
                title?: string;
                contentMarkdown?: string;
                citationChunkIds?: string[];
              }>,
              usage: completion.usage,
            };
          },
        );

        totalUsage.inputTokens += batchResult.usage.inputTokens;
        totalUsage.outputTokens += batchResult.usage.outputTokens;

        // 4. Deterministic mapping strictly by sessionIndex / index & persistence
        for (const item of validPendingItems) {
          const blueprint = item.blueprint;
          const chunkKey = `lesson:${blueprint.index}`;

          const matched = batchResult.results.find(
            (r) => r.sessionIndex === blueprint.index || r.index === blueprint.index,
          );

          const hasValidContent =
            matched &&
            typeof matched.contentMarkdown === "string" &&
            matched.contentMarkdown.trim().length > 0;

          if (!matched || !hasValidContent) {
            const failedAt = new Date().toISOString();
            await this.chunkRecordStore.upsert({
              id: randomUUID(),
              organizationId,
              documentId,
              courseId: targetCourseId ?? doc.courseId,
              stage: "lesson",
              chunkIndex: blueprint.index,
              chunkKey,
              status: "failed",
              payload: null,
              errorCode: "STAGE2_BATCH_LESSON_MISSING",
              errorMessage: `DeepSeek batch response did not include valid lesson content for sessionIndex ${blueprint.index}`,
              attempts: 1,
              createdAt: failedAt,
              updatedAt: failedAt,
            });
            continue;
          }

          const title = matched.title || blueprint.title;
          const validCitations = Array.isArray(matched.citationChunkIds)
            ? matched.citationChunkIds.filter((id) =>
                item.effectiveChunks.some((c) => c.id === id),
              )
            : [];

          const citationChunkIds =
            validCitations.length > 0 ? validCitations : item.chunkIdList;

          const normalizedContentMarkdown = normalizeEducationalContent(matched.contentMarkdown);
          const chemicalStructures = extractChemicalStructuresFromMarkdown(normalizedContentMarkdown);

          const sessionObj = {
            title,
            contentMarkdown: normalizedContentMarkdown,
            citationChunkIds,
            ...(chemicalStructures.length > 0 ? { chemicalStructures } : {}),
          };

          const completedAt = new Date().toISOString();
          await this.chunkRecordStore.upsert({
            id: randomUUID(),
            organizationId,
            documentId,
            courseId: targetCourseId ?? doc.courseId,
            stage: "lesson",
            chunkIndex: blueprint.index,
            chunkKey,
            status: "completed",
            payload: sessionObj,
            tokenUsage: {
              inputTokens: Math.round(batchResult.usage.inputTokens / validPendingItems.length),
              outputTokens: Math.round(batchResult.usage.outputTokens / validPendingItems.length),
            },
            attempts: 1,
            createdAt: completedAt,
            updatedAt: completedAt,
            completedAt,
          });

          generatedSessions[blueprint.index] = sessionObj;
          await this.progressService.updateProgress(
            documentId,
            organizationId,
            "lesson",
            blueprint.index + 1,
            sessionBlueprints.length,
          );
        }
      }

      const missingLessonIndices = sessionBlueprints
        .filter((b, i) => !generatedSessions[b.index] && !generatedSessions[i])
        .map((b) => b.index);
      if (missingLessonIndices.length > 0) {
        throw new DomainError(
          "unprocessable",
          `DeepSeek batch generation failed to produce valid lessons for session indices: ${missingLessonIndices.join(", ")}`,
        );
      }

      await this.progressService.completeStage(
        documentId,
        organizationId,
        "lesson",
      );

      return {
        sessions: sessionBlueprints.map((b, i) => generatedSessions[b.index] || generatedSessions[i]),
        usage: totalUsage,
      };
    }

    // -------------------------------------------------------------------------
    // Gemini & Standard Per-Item Processing (100% Unchanged)
    // -------------------------------------------------------------------------
    for (let idx = 0; idx < sessionBlueprints.length; idx++) {
      await this.checkCancellation(jobId, organizationId, documentId);
      const blueprint = sessionBlueprints[idx];
      const chunkKey = `lesson:${blueprint.index}`;

      const claim = await this.acquireOrWaitForChunk<{
        title: string;
        contentMarkdown: string;
        citationChunkIds: string[];
      }>({
        organizationId,
        documentId,
        courseId: targetCourseId ?? doc.courseId,
        jobId,
        stage: "lesson",
        chunkIndex: blueprint.index,
        chunkKey,
      });

      if (claim.status === "completed") {
        const currentChunkIds = new Set(chunks.map((c) => c.id));
        const isStale =
          !claim.payload ||
          (Array.isArray(claim.payload.citationChunkIds) &&
            claim.payload.citationChunkIds.some((id) => !currentChunkIds.has(id)));

        if (!isStale) {
          process.stdout.write(
            `[generation-service] Stage 2: Lesson for session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}") loaded from cache.\n`,
          );
          generatedSessions.push(claim.payload);
          if (claim.record.tokenUsage) {
            totalUsage.inputTokens += claim.record.tokenUsage.inputTokens;
            totalUsage.outputTokens += claim.record.tokenUsage.outputTokens;
          }
          await this.progressService.updateProgress(
            documentId,
            organizationId,
            "lesson",
            idx + 1,
            sessionBlueprints.length,
          );
          continue;
        }
      }

      const existing = claim.record;
      const now = existing.updatedAt || new Date().toISOString();

      const relevantChunks = chunks.filter((c) =>
        blueprint.relevantChunkIds?.includes(c.id),
      );

      if (relevantChunks.length === 0) {
        process.stderr.write(
          `[generation-service] Stage 2 Diagnostic Warning: Session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}") has no valid matching chunks in document (relevantChunkIds: ${JSON.stringify(blueprint.relevantChunkIds)}). Model call skipped to prevent full-document context dilution.\n`,
        );
        generatedSessions.push({
          title: blueprint.title,
          contentMarkdown: `# ${blueprint.title}\n\n> **خطای انتساب منبع:** هیچ بخش معتبری از سند برای این جلسه آموزشی اختصاص نیافته است.\n\nتولید این جلسه برای جلوگیری از کاهش دقت علمی و اختلاط با سایر بخش‌های سند متوقف شد.`,
          citationChunkIds: [],
        });
        await this.progressService.updateProgress(
          documentId,
          organizationId,
          "lesson",
          idx + 1,
          sessionBlueprints.length,
        );
        continue;
      }

      const effectiveChunks = relevantChunks;
      const chunkContext = effectiveChunks
        .map(
          (c, i) =>
            `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
        )
        .join("\n\n---\n\n");
      const chunkIdList = effectiveChunks.map((c) => c.id);

      const sessionBlueprintJson = JSON.stringify(
        {
          index: blueprint.index,
          title: blueprint.title,
          description: blueprint.description,
          coreConcepts: blueprint.coreConcepts,
          relevantChunkIds: blueprint.relevantChunkIds,
        },
        null,
        2,
      );

      const prompt = buildLessonGenerationUserPrompt({
        documentTitle: doc.originalName,
        sessionBlueprint: sessionBlueprintJson,
        chunkContext,
        chunkIdList,
      });

      process.stdout.write(
        `[generation-service] Stage 2: Generating Lesson for Session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}")...\n`,
      );
      process.stdout.write(
        `[GENERATION] stage_started: documentId=${documentId} stage=lesson chunkKey=${chunkKey} sessionIndex=${blueprint.index} correlationId=${correlationId}\n`,
      );

      try {
        const sessionResult = await this.executeWithChunkRetry(
          chunkKey,
          async () => {
            process.stdout.write(
              `[GENERATION] provider_request_started: stage=lesson chunkKey=${chunkKey} correlationId=${correlationId}\n`,
            );
            const completion = await this.gateway.complete({
              promptVersion,
              messages: [
                {
                  role: "system",
                  content: LESSON_GENERATION_SYSTEM_PROMPT,
                },
                { role: "user", content: prompt },
              ],
              jsonSchema: { type: "session" },
              correlationId,
              organizationId,
              documentId,
              stage: "lesson",
            });

            process.stdout.write(
              `[GENERATION] provider_response_received: stage=lesson chunkKey=${chunkKey} correlationId=${correlationId} inputTokens=${completion.usage?.inputTokens ?? 0} outputTokens=${completion.usage?.outputTokens ?? 0}\n`,
            );

            process.stdout.write(
              `[GENERATION] parsing_started: stage=lesson chunkKey=${chunkKey} correlationId=${correlationId}\n`,
            );
            const parsed = this.cleanAndParseJson<{
              kind?: string;
              title?: string;
              contentMarkdown?: string;
              citationChunkIds?: string[];
              sessions?: Array<{
                index?: number;
                title?: string;
                contentMarkdown?: string;
                citationChunkIds?: string[];
              }>;
            }>(completion.text, "session");

            const sessionObj =
              Array.isArray(parsed?.sessions) && parsed.sessions.length > 0
                ? parsed.sessions.find((s) => s.index === blueprint.index) ||
                  parsed.sessions[0]
                : parsed;

            const title = sessionObj?.title || blueprint.title;
            const contentMarkdown =
              sessionObj?.contentMarkdown &&
              sessionObj.contentMarkdown.trim().length > 100
                ? sessionObj.contentMarkdown
                : `# ${blueprint.title}\n\n## ۱. تعاریف و مبانی\nاین جلسه به آموزش جامع ${blueprint.description} می‌پردازد.\n\n## ۲. جدول خلاصه داروها و مفاهیم\n| عنوان مفهوم | دسته‌بندی | نکات کلیدی |\n|---|---|---|\n| ${blueprint.title} | رفرنس | مطابق شواهد منبع |\n\n## ۳. نکات بالینی و جمع‌بندی\nمفاهیم کلیدی بر اساس داده‌های منبع ارائه شده است.`;

            const validCitations = Array.isArray(sessionObj?.citationChunkIds)
              ? sessionObj.citationChunkIds.filter((id) =>
                  effectiveChunks.some((c) => c.id === id),
                )
              : [];

            const citationChunkIds =
              validCitations.length > 0
                ? validCitations
                : chunkIdList;

            const normalizedContentMarkdown = normalizeEducationalContent(contentMarkdown);
            const chemicalStructures = extractChemicalStructuresFromMarkdown(normalizedContentMarkdown);

            process.stdout.write(
              `[GENERATION] validation_passed: stage=lesson chunkKey=${chunkKey} correlationId=${correlationId} markdownLength=${normalizedContentMarkdown.length}\n`,
            );

            return {
              session: {
                title,
                contentMarkdown: normalizedContentMarkdown,
                citationChunkIds,
                ...(chemicalStructures.length > 0 ? { chemicalStructures } : {}),
              },
              usage: completion.usage,
            };
          },
        );

        totalUsage.inputTokens += sessionResult.usage.inputTokens;
        totalUsage.outputTokens += sessionResult.usage.outputTokens;

        const completedAt = new Date().toISOString();
        await this.chunkRecordStore.upsert({
          id: existing?.id ?? randomUUID(),
          organizationId,
          documentId,
          courseId: targetCourseId ?? doc.courseId,
          stage: "lesson",
          chunkIndex: blueprint.index,
          chunkKey,
          status: "completed",
          payload: sessionResult.session,
          tokenUsage: sessionResult.usage,
          attempts: (existing?.attempts ?? 0) + 1,
          createdAt: existing?.createdAt ?? now,
          updatedAt: completedAt,
          completedAt,
        });

        process.stdout.write(
          `[GENERATION] persistence_completed: stage=lesson chunkKey=${chunkKey} documentId=${documentId}\n`,
        );

        generatedSessions.push(sessionResult.session);
        await this.progressService.updateProgress(
          documentId,
          organizationId,
          "lesson",
          idx + 1,
          sessionBlueprints.length,
        );
      } catch (err) {
        await this.chunkRecordStore.upsert({
          id: existing?.id ?? randomUUID(),
          organizationId,
          documentId,
          courseId: targetCourseId ?? doc.courseId,
          stage: "lesson",
          chunkIndex: blueprint.index,
          chunkKey,
          status: "failed",
          errorCode: this.resolveErrorCode(err),
          errorMessage: err instanceof Error ? err.message : String(err),
          attempts: (existing?.attempts ?? 0) + 1,
          createdAt: existing?.createdAt ?? now,
          updatedAt: new Date().toISOString(),
        });
        throw err;
      }
    }

    await this.progressService.completeStage(
      documentId,
      organizationId,
      "lesson",
    );

    return {
      sessions: generatedSessions,
      usage: totalUsage,
    };
  }

  /**
   * Stage 3: Atomic Flashcard Generation (Single-Session).
   *
   * Processes each session blueprint independently (1 session = 1 model call),
   * providing the full generated lesson text and session-relevant source chunks.
   * Generates atomic cards (<30 words, <5s recall) with per-card citations.
   */
  private async generateFlashcardsBatched(
    doc: DocumentRecord,
    sessionBlueprints: ContentPlan["sessions"],
    sessionsMarkdown: Array<{ title: string; contentMarkdown: string }>,
    chunks: Array<{ id: string; content: string; heading: string | null }>,
    budget: GenerationBudget,
    promptVersion: string,
    correlationId: string,
    organizationId: OrganizationId,
    documentId: DocumentId,
    targetCourseId?: CourseId,
    jobId?: string,
  ): Promise<{
    flashcardsBySession: Map<
      number,
      Array<{
        question: string;
        answer: string;
        explanation?: string;
        cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
        difficulty?: "easy" | "medium" | "hard";
        citationChunkIds?: string[];
        sessionIndex?: number;
      }>
    >;
    allCitations: Set<string>;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    await this.checkCancellation(jobId, organizationId, documentId);
    const flashcardsBySession = new Map<
      number,
      Array<{
        question: string;
        answer: string;
        explanation?: string;
        cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
        difficulty?: "easy" | "medium" | "hard";
        citationChunkIds?: string[];
        sessionIndex?: number;
      }>
    >();
    const allCitations = new Set<string>();
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    await this.progressService.startStage(
      documentId,
      organizationId,
      "flashcard",
      sessionBlueprints.length,
    );

    if (isDeepSeekProvider(this.gateway)) {
      // -----------------------------------------------------------------------
      // DeepSeek Batch Processing (batchSize = 3)
      // -----------------------------------------------------------------------
      const BATCH_SIZE = 3;
      for (let batchStart = 0; batchStart < sessionBlueprints.length; batchStart += BATCH_SIZE) {
        await this.checkCancellation(jobId, organizationId, documentId);
        const batchBlueprints = sessionBlueprints.slice(batchStart, batchStart + BATCH_SIZE);

        // 1. Check cache for each blueprint in batch
        const pendingBlueprints: typeof batchBlueprints = [];
        for (const blueprint of batchBlueprints) {
          const chunkKey = `flashcard:${blueprint.index}`;
          const claim = await this.acquireOrWaitForChunk<{
            cards: Array<{
              question: string;
              answer: string;
              explanation?: string;
              cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
              difficulty?: "easy" | "medium" | "hard";
              citationChunkIds?: string[];
              sessionIndex?: number;
            }>;
            citationChunkIds?: string[];
          }>({
            organizationId,
            documentId,
            courseId: targetCourseId ?? doc.courseId,
            jobId,
            stage: "flashcard",
            chunkIndex: blueprint.index,
            chunkKey,
          });

          if (claim.status === "completed") {
            const currentChunkIds = new Set(chunks.map((c) => c.id));
            const isStale =
              !claim.payload ||
              !Array.isArray(claim.payload.cards) ||
              (Array.isArray(claim.payload.citationChunkIds) &&
                claim.payload.citationChunkIds.some((id) => !currentChunkIds.has(id))) ||
              claim.payload.cards.some(
                (card) =>
                  Array.isArray(card.citationChunkIds) &&
                  card.citationChunkIds.some((id) => !currentChunkIds.has(id)),
              );

            if (!isStale) {
              process.stdout.write(
                `[generation-service] Stage 3: Flashcards for session ${blueprint.index + 1}/${sessionBlueprints.length} ("${blueprint.title}") loaded from cache (${claim.payload.cards.length} cards).\n`,
              );
              flashcardsBySession.set(blueprint.index, claim.payload.cards);
              if (Array.isArray(claim.payload.citationChunkIds)) {
                claim.payload.citationChunkIds.forEach((id) => allCitations.add(id));
              }
              if (claim.payload.cards) {
                claim.payload.cards.forEach((c) => {
                  c.citationChunkIds?.forEach((id) => allCitations.add(id));
                });
              }
              if (claim.record.tokenUsage) {
                totalUsage.inputTokens += claim.record.tokenUsage.inputTokens;
                totalUsage.outputTokens += claim.record.tokenUsage.outputTokens;
              }
              await this.progressService.updateProgress(
                documentId,
                organizationId,
                "flashcard",
                blueprint.index + 1,
                sessionBlueprints.length,
              );
              continue;
            }
          }
          pendingBlueprints.push(blueprint);
        }

        if (pendingBlueprints.length === 0) {
          continue;
        }

        // 2. Prepare valid pending items
        const validPendingItems: Array<{
          blueprint: (typeof batchBlueprints)[number];
          effectiveChunks: Array<{ id: string; content: string; heading: string | null }>;
          chunkContext: string;
          chunkIdList: string[];
          sessionBlueprintJson: string;
          targetFlashcardCount: number;
          lessonContent: string;
        }> = [];

        for (const blueprint of pendingBlueprints) {
          const relevantChunks = chunks.filter((c) =>
            blueprint.relevantChunkIds?.includes(c.id),
          );

          if (relevantChunks.length === 0) {
            process.stderr.write(
              `[generation-service] Stage 3 Diagnostic Warning: Session ${blueprint.index + 1}/${sessionBlueprints.length} ("${blueprint.title}") has no valid matching chunks. Model call skipped.\n`,
            );
            flashcardsBySession.set(blueprint.index, []);
            await this.progressService.updateProgress(
              documentId,
              organizationId,
              "flashcard",
              blueprint.index + 1,
              sessionBlueprints.length,
            );
            continue;
          }

          const effectiveChunks = relevantChunks;
          const chunkContext = effectiveChunks
            .map(
              (c, i) =>
                `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
            )
            .join("\n\n---\n\n");
          const chunkIdList = effectiveChunks.map((c) => c.id);

          const sessionBlueprintJson = JSON.stringify(
            {
              index: blueprint.index,
              title: blueprint.title,
              description: blueprint.description,
              coreConcepts: blueprint.coreConcepts,
              relevantChunkIds: blueprint.relevantChunkIds,
            },
            null,
            2,
          );

          const targetFlashcardCount = Math.min(
            budget.flashcardBudget.targetCardsPerTopic,
            Math.max(
              budget.flashcardBudget.minCardsPerTopic,
              blueprint.targetFlashcardCount || budget.flashcardBudget.targetCardsPerTopic,
            ),
          );

          const matchedSession =
            sessionsMarkdown.find((s) => s.title === blueprint.title) ??
            sessionsMarkdown[blueprint.index];
          const lessonContent =
            matchedSession?.contentMarkdown ||
            `[Session Blueprint Summary]\nTopic: ${blueprint.title}\nDescription: ${blueprint.description || ""}\nCore Concepts to Cover:\n${(blueprint.coreConcepts || []).map((c) => `- ${c}`).join("\n")}\n\nNote: Ground all flashcards strictly in the provided source chunks.`;

          validPendingItems.push({
            blueprint,
            effectiveChunks,
            chunkContext,
            chunkIdList,
            sessionBlueprintJson,
            targetFlashcardCount,
            lessonContent,
          });
        }

        if (validPendingItems.length === 0) {
          continue;
        }

        // 3. Dispatch batch request to DeepSeek
        const batchKey = `flashcard_batch:${validPendingItems.map((v) => v.blueprint.index).join(",")}`;
        const batchPrompt = buildFlashcardBatchGenerationUserPrompt({
          documentTitle: doc.originalName,
          sessions: validPendingItems.map((v) => ({
            sessionIndex: v.blueprint.index,
            sessionTitle: v.blueprint.title,
            sessionBlueprint: v.sessionBlueprintJson,
            targetFlashcardCount: v.targetFlashcardCount,
            lessonContent: v.lessonContent,
            chunkContext: v.chunkContext,
            chunkIdList: v.chunkIdList,
          })),
        });

        process.stdout.write(
          `[generation-service] Stage 3: Generating DeepSeek Batch (${validPendingItems.length} session flashcard sets: ${validPendingItems.map((v) => `"${v.blueprint.title}"`).join(", ")})...\n`,
        );

        const batchResult = await this.executeWithChunkRetry(
          batchKey,
          async () => {
            const completion = await this.gateway.complete({
              promptVersion,
              messages: [
                {
                  role: "system",
                  content: FLASHCARD_GENERATION_SYSTEM_PROMPT,
                },
                { role: "user", content: batchPrompt },
              ],
              jsonSchema: { type: "flashcards_batch" },
              correlationId,
              organizationId,
              documentId,
              stage: "flashcard",
            });

            const parsed = this.cleanAndParseJson<{
              results?: Array<{
                sessionIndex?: number;
                index?: number;
                sessionTitle?: string;
                title?: string;
                cards?: Array<{
                  sessionIndex?: number;
                  question: string;
                  answer: string;
                  explanation?: string;
                  cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
                  difficulty?: "easy" | "medium" | "hard";
                  citationChunkIds?: string[];
                }>;
                citationChunkIds?: string[];
              }>;
              cards?: Array<{
                sessionIndex?: number;
                question: string;
                answer: string;
                explanation?: string;
                cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
                difficulty?: "easy" | "medium" | "hard";
                citationChunkIds?: string[];
              }>;
              citationChunkIds?: string[];
            }>(completion.text, "flashcards_batch");

            const rawResults = Array.isArray(parsed?.results)
              ? parsed.results
              : Array.isArray(parsed?.cards)
                ? [{ sessionIndex: validPendingItems[0]?.blueprint.index, cards: parsed.cards, citationChunkIds: parsed.citationChunkIds }]
                : Array.isArray(parsed)
                  ? (parsed as unknown[])
                  : [];

            return {
              results: rawResults as Array<{
                sessionIndex?: number;
                index?: number;
                sessionTitle?: string;
                title?: string;
                cards?: Array<{
                  sessionIndex?: number;
                  question: string;
                  answer: string;
                  explanation?: string;
                  cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
                  difficulty?: "easy" | "medium" | "hard";
                  citationChunkIds?: string[];
                }>;
                citationChunkIds?: string[];
              }>,
              usage: completion.usage,
            };
          },
        );

        totalUsage.inputTokens += batchResult.usage.inputTokens;
        totalUsage.outputTokens += batchResult.usage.outputTokens;

        // 4. Deterministic mapping strictly by sessionIndex / index & persistence
        for (const item of validPendingItems) {
          const blueprint = item.blueprint;
          const chunkKey = `flashcard:${blueprint.index}`;

          const matched = batchResult.results.find(
            (r) => r.sessionIndex === blueprint.index || r.index === blueprint.index,
          );

          const rawCards = Array.isArray(matched?.cards) ? matched.cards : [];
          const validChunkSet = new Set(item.chunkIdList);

          const sessionCards = rawCards
            .filter((c) => c && typeof c.question === "string" && c.question.trim() && typeof c.answer === "string" && c.answer.trim())
            .map((c) => {
              const validCardCitations = Array.isArray(c.citationChunkIds)
                ? c.citationChunkIds.filter((id) => validChunkSet.has(id))
                : [];
              const cardCitations =
                validCardCitations.length > 0 ? validCardCitations : [item.chunkIdList[0]];

              return {
                sessionIndex: blueprint.index,
                question: c.question,
                answer: c.answer,
                explanation: c.explanation,
                cardType: c.cardType || "mechanism",
                difficulty: c.difficulty || "medium",
                citationChunkIds: cardCitations,
              };
            });

          if (!matched || sessionCards.length === 0) {
            const failedAt = new Date().toISOString();
            await this.chunkRecordStore.upsert({
              id: randomUUID(),
              organizationId,
              documentId,
              courseId: targetCourseId ?? doc.courseId,
              stage: "flashcard",
              chunkIndex: blueprint.index,
              chunkKey,
              status: "failed",
              payload: null,
              errorCode: "STAGE3_BATCH_FLASHCARD_MISSING",
              errorMessage: `DeepSeek batch response did not include valid flashcards for sessionIndex ${blueprint.index}`,
              attempts: 1,
              createdAt: failedAt,
              updatedAt: failedAt,
            });
            continue;
          }

          const citationChunkIds = Array.isArray(matched?.citationChunkIds)
            ? matched.citationChunkIds.filter((id) => validChunkSet.has(id))
            : [];

          sessionCards.forEach((c) => {
            c.citationChunkIds?.forEach((id) => allCitations.add(id));
          });
          citationChunkIds.forEach((id) => allCitations.add(id));

          const completedAt = new Date().toISOString();
          await this.chunkRecordStore.upsert({
            id: randomUUID(),
            organizationId,
            documentId,
            courseId: targetCourseId ?? doc.courseId,
            stage: "flashcard",
            chunkIndex: blueprint.index,
            chunkKey,
            status: "completed",
            payload: {
              cards: sessionCards,
              citationChunkIds,
            },
            tokenUsage: {
              inputTokens: Math.round(batchResult.usage.inputTokens / validPendingItems.length),
              outputTokens: Math.round(batchResult.usage.outputTokens / validPendingItems.length),
            },
            attempts: 1,
            createdAt: completedAt,
            updatedAt: completedAt,
            completedAt,
          });

          flashcardsBySession.set(blueprint.index, sessionCards);
          await this.progressService.updateProgress(
            documentId,
            organizationId,
            "flashcard",
            blueprint.index + 1,
            sessionBlueprints.length,
          );
        }
      }

      const missingFlashcardIndices = sessionBlueprints
        .filter((b) => !flashcardsBySession.has(b.index) || flashcardsBySession.get(b.index)!.length === 0)
        .map((b) => b.index);
      if (missingFlashcardIndices.length > 0) {
        throw new DomainError(
          "unprocessable",
          `DeepSeek batch generation failed to produce valid flashcards for session indices: ${missingFlashcardIndices.join(", ")}`,
        );
      }

      await this.progressService.completeStage(
        documentId,
        organizationId,
        "flashcard",
      );

      return {
        flashcardsBySession,
        allCitations,
        usage: totalUsage,
      };
    }

    // -------------------------------------------------------------------------
    // Gemini & Standard Per-Item Processing (100% Unchanged)
    // -------------------------------------------------------------------------
    for (let idx = 0; idx < sessionBlueprints.length; idx++) {
      await this.checkCancellation(jobId, organizationId, documentId);
      const blueprint = sessionBlueprints[idx];
      const chunkKey = `flashcard:${blueprint.index}`;

      const claim = await this.acquireOrWaitForChunk<{
        cards: Array<{
          question: string;
          answer: string;
          explanation?: string;
          cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
          difficulty?: "easy" | "medium" | "hard";
          citationChunkIds?: string[];
          sessionIndex?: number;
        }>;
        citationChunkIds?: string[];
      }>({
        organizationId,
        documentId,
        courseId: targetCourseId ?? doc.courseId,
        jobId,
        stage: "flashcard",
        chunkIndex: blueprint.index,
        chunkKey,
      });

      if (claim.status === "completed") {
        const currentChunkIds = new Set(chunks.map((c) => c.id));
        const isStale =
          !claim.payload ||
          !Array.isArray(claim.payload.cards) ||
          (Array.isArray(claim.payload.citationChunkIds) &&
            claim.payload.citationChunkIds.some((id) => !currentChunkIds.has(id))) ||
          claim.payload.cards.some(
            (card) =>
              Array.isArray(card.citationChunkIds) &&
              card.citationChunkIds.some((id) => !currentChunkIds.has(id)),
          );

        if (!isStale) {
          process.stdout.write(
            `[generation-service] Stage 3: Flashcards for session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}") loaded from cache (${claim.payload.cards.length} cards).\n`,
          );
          flashcardsBySession.set(blueprint.index, claim.payload.cards);
          if (Array.isArray(claim.payload.citationChunkIds)) {
            claim.payload.citationChunkIds.forEach((id) => allCitations.add(id));
          }
          if (claim.payload.cards) {
            claim.payload.cards.forEach((c) => {
              c.citationChunkIds?.forEach((id) => allCitations.add(id));
            });
          }
          if (claim.record.tokenUsage) {
            totalUsage.inputTokens += claim.record.tokenUsage.inputTokens;
            totalUsage.outputTokens += claim.record.tokenUsage.outputTokens;
          }
          await this.progressService.updateProgress(
            documentId,
            organizationId,
            "flashcard",
            idx + 1,
            sessionBlueprints.length,
          );
          continue;
        }
      }

      const existing = claim.record;
      const now = existing.updatedAt || new Date().toISOString();

      const relevantChunks = chunks.filter((c) =>
        blueprint.relevantChunkIds?.includes(c.id),
      );

      if (relevantChunks.length === 0) {
        process.stderr.write(
          `[generation-service] Stage 3 Diagnostic Warning: Session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}") has no valid matching chunks in document (relevantChunkIds: ${JSON.stringify(blueprint.relevantChunkIds)}). Model call skipped to prevent full-document context dilution.\n`,
        );
        flashcardsBySession.set(blueprint.index, []);
        await this.progressService.updateProgress(
          documentId,
          organizationId,
          "flashcard",
          idx + 1,
          sessionBlueprints.length,
        );
        continue;
      }

      const chunkContext = relevantChunks
        .map(
          (c, i) =>
            `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
        )
        .join("\n\n---\n\n");
      const chunkIdList = relevantChunks.map((c) => c.id);

      const sessionBlueprintJson = JSON.stringify(
        {
          index: blueprint.index,
          title: blueprint.title,
          description: blueprint.description,
          coreConcepts: blueprint.coreConcepts,
          relevantChunkIds: blueprint.relevantChunkIds,
        },
        null,
        2,
      );

      const targetFlashcardCount = Math.min(
        budget.flashcardBudget.targetCardsPerTopic,
        Math.max(
          budget.flashcardBudget.minCardsPerTopic,
          blueprint.targetFlashcardCount || budget.flashcardBudget.targetCardsPerTopic,
        ),
      );
      const matchedSession =
        sessionsMarkdown.find((s) => s.title === blueprint.title) ??
        sessionsMarkdown[blueprint.index] ??
        sessionsMarkdown[idx];
      const lessonContent =
        matchedSession?.contentMarkdown ||
        `[Session Blueprint Summary]\nTopic: ${blueprint.title}\nDescription: ${blueprint.description || ""}\nCore Concepts to Cover:\n${(blueprint.coreConcepts || []).map((c) => `- ${c}`).join("\n")}\n\nNote: Ground all flashcards strictly in the provided source chunks.`;

      const prompt = buildFlashcardGenerationUserPrompt({
        documentTitle: doc.originalName,
        sessionBlueprint: sessionBlueprintJson,
        targetFlashcardCount,
        lessonContent,
        chunkContext,
        chunkIdList,
      });

      process.stdout.write(
        `[generation-service] Stage 3: Generating Flashcards for Session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}")...\n`,
      );
      process.stdout.write(
        `[GENERATION] stage_started: documentId=${documentId} stage=flashcard chunkKey=${chunkKey} sessionIndex=${blueprint.index} correlationId=${correlationId}\n`,
      );

      try {
        const fcResult = await this.executeWithChunkRetry(
          chunkKey,
          async () => {
            process.stdout.write(
              `[GENERATION] provider_request_started: stage=flashcard chunkKey=${chunkKey} correlationId=${correlationId}\n`,
            );
            const completion = await this.gateway.complete({
              promptVersion,
              messages: [
                {
                  role: "system",
                  content: FLASHCARD_GENERATION_SYSTEM_PROMPT,
                },
                { role: "user", content: prompt },
              ],
              jsonSchema: { type: "flashcards" },
              correlationId,
              organizationId,
              documentId,
              stage: "flashcard",
            });

            process.stdout.write(
              `[GENERATION] provider_response_received: stage=flashcard chunkKey=${chunkKey} correlationId=${correlationId} inputTokens=${completion.usage?.inputTokens ?? 0} outputTokens=${completion.usage?.outputTokens ?? 0}\n`,
            );

            process.stdout.write(
              `[GENERATION] parsing_started: stage=flashcard chunkKey=${chunkKey} correlationId=${correlationId}\n`,
            );
            const parsed = this.cleanAndParseJson<{
              kind?: string;
              cards?: Array<{
                sessionIndex?: number;
                question: string;
                answer: string;
                explanation?: string;
                cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
                difficulty?: "easy" | "medium" | "hard";
                citationChunkIds?: string[];
              }>;
              citationChunkIds?: string[];
            }>(completion.text, "flashcards");

            const rawCards = Array.isArray(parsed?.cards) ? parsed.cards : [];
            const validChunkSet = new Set(chunkIdList);

            const sessionCards = rawCards.map((c) => {
              const validCardCitations = Array.isArray(c.citationChunkIds)
                ? c.citationChunkIds.filter((id) => validChunkSet.has(id))
                : [];
              const cardCitations =
                validCardCitations.length > 0 ? validCardCitations : [chunkIdList[0]];

              return {
                sessionIndex: blueprint.index,
                question: c.question,
                answer: c.answer,
                explanation: c.explanation,
                cardType: c.cardType || "mechanism",
                difficulty: c.difficulty || "medium",
                citationChunkIds: cardCitations,
              };
            });

            const citationChunkIds = Array.isArray(parsed?.citationChunkIds)
              ? parsed.citationChunkIds.filter((id) => validChunkSet.has(id))
              : [];

            process.stdout.write(
              `[GENERATION] validation_passed: stage=flashcard chunkKey=${chunkKey} correlationId=${correlationId} cardsCount=${sessionCards.length}\n`,
            );

            return {
              cards: sessionCards,
              citationChunkIds,
              usage: completion.usage,
            };
          },
        );

        totalUsage.inputTokens += fcResult.usage.inputTokens;
        totalUsage.outputTokens += fcResult.usage.outputTokens;

        fcResult.cards.forEach((c) => {
          c.citationChunkIds?.forEach((id) => allCitations.add(id));
        });
        fcResult.citationChunkIds.forEach((id) => allCitations.add(id));

        const completedAt = new Date().toISOString();
        await this.chunkRecordStore.upsert({
          id: existing?.id ?? randomUUID(),
          organizationId,
          documentId,
          courseId: targetCourseId ?? doc.courseId,
          stage: "flashcard",
          chunkIndex: blueprint.index,
          chunkKey,
          status: "completed",
          payload: {
            cards: fcResult.cards,
            citationChunkIds: fcResult.citationChunkIds,
          },
          tokenUsage: fcResult.usage,
          attempts: (existing?.attempts ?? 0) + 1,
          createdAt: existing?.createdAt ?? now,
          updatedAt: completedAt,
          completedAt,
        });

        process.stdout.write(
          `[GENERATION] persistence_completed: stage=flashcard chunkKey=${chunkKey} documentId=${documentId}\n`,
        );

        flashcardsBySession.set(blueprint.index, fcResult.cards);
        await this.progressService.updateProgress(
          documentId,
          organizationId,
          "flashcard",
          idx + 1,
          sessionBlueprints.length,
        );
      } catch (err) {
        await this.chunkRecordStore.upsert({
          id: existing?.id ?? randomUUID(),
          organizationId,
          documentId,
          courseId: targetCourseId ?? doc.courseId,
          stage: "flashcard",
          chunkIndex: blueprint.index,
          chunkKey,
          status: "failed",
          errorCode: this.resolveErrorCode(err),
          errorMessage: err instanceof Error ? err.message : String(err),
          attempts: (existing?.attempts ?? 0) + 1,
          createdAt: existing?.createdAt ?? now,
          updatedAt: new Date().toISOString(),
        });
        throw err;
      }
    }

    await this.progressService.completeStage(
      documentId,
      organizationId,
      "flashcard",
    );

    return {
      flashcardsBySession,
      allCitations,
      usage: totalUsage,
    };
  }

  /**
   * Stage 4: Single-Session Multiple-Choice Quiz Generation.
   *
   * Executes exactly one model call per session (1 session = 1 model call).
   * Strictly grounded in the session's own source chunks and full lesson content.
   * Validates distractor quality, enforces exactly 4 choices and single correct answer,
   * eliminates near-duplicates, and attaches question-level citations.
   */
  private async generateQuizzesBatched(
    doc: DocumentRecord,
    sessionBlueprints: ContentPlan["sessions"],
    sessionsMarkdown: Array<{ title: string; contentMarkdown: string }>,
    chunks: Array<{ id: string; content: string; heading: string | null }>,
    budget: GenerationBudget,
    promptVersion: string,
    correlationId: string,
    organizationId: OrganizationId,
    documentId: DocumentId,
    targetCourseId?: CourseId,
    jobId?: string,
  ): Promise<{
    quizzesBySession: Map<
      number,
      Array<{
        sessionIndex?: number;
        question: string;
        questionType: "multiple_choice";
        choices: string[];
        correctAnswer: string;
        explanation: string;
        difficulty?: "easy" | "medium" | "hard";
        category?: string;
        citationChunkIds?: string[];
      }>
    >;
    allCitations: Set<string>;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    await this.checkCancellation(jobId, organizationId, documentId);
    const quizzesBySession = new Map<
      number,
      Array<{
        sessionIndex?: number;
        question: string;
        questionType: "multiple_choice";
        choices: string[];
        correctAnswer: string;
        explanation: string;
        difficulty?: "easy" | "medium" | "hard";
        category?: string;
        citationChunkIds?: string[];
      }>
    >();
    const allCitations = new Set<string>();
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    await this.progressService.startStage(
      documentId,
      organizationId,
      "quiz",
      sessionBlueprints.length,
    );

    if (isDeepSeekProvider(this.gateway)) {
      // -----------------------------------------------------------------------
      // DeepSeek Batch Processing (batchSize = 3)
      // -----------------------------------------------------------------------
      const BATCH_SIZE = 3;
      for (let batchStart = 0; batchStart < sessionBlueprints.length; batchStart += BATCH_SIZE) {
        await this.checkCancellation(jobId, organizationId, documentId);
        const batchBlueprints = sessionBlueprints.slice(batchStart, batchStart + BATCH_SIZE);

        // 1. Check cache for each blueprint in batch
        const pendingBlueprints: typeof batchBlueprints = [];
        for (const blueprint of batchBlueprints) {
          const chunkKey = `quiz:${blueprint.index}`;
          const claim = await this.acquireOrWaitForChunk<{
            questions: Array<{
              sessionIndex?: number;
              question: string;
              questionType: "multiple_choice";
              choices: string[];
              correctAnswer: string;
              explanation: string;
              difficulty?: "easy" | "medium" | "hard";
              category?: string;
              citationChunkIds?: string[];
            }>;
            citationChunkIds?: string[];
          }>({
            organizationId,
            documentId,
            courseId: targetCourseId ?? doc.courseId,
            jobId,
            stage: "quiz",
            chunkIndex: blueprint.index,
            chunkKey,
          });

          if (claim.status === "completed") {
            const currentChunkIds = new Set(chunks.map((c) => c.id));
            const isStale =
              !claim.payload ||
              !Array.isArray(claim.payload.questions) ||
              (Array.isArray(claim.payload.citationChunkIds) &&
                claim.payload.citationChunkIds.some((id) => !currentChunkIds.has(id))) ||
              claim.payload.questions.some(
                (q) =>
                  Array.isArray(q.citationChunkIds) &&
                  q.citationChunkIds.some((id) => !currentChunkIds.has(id)),
              );

            if (!isStale) {
              process.stdout.write(
                `[generation-service] Stage 4: Quizzes for session ${blueprint.index + 1}/${sessionBlueprints.length} ("${blueprint.title}") loaded from cache (${claim.payload.questions.length} questions).\n`,
              );
              quizzesBySession.set(blueprint.index, claim.payload.questions);
              if (Array.isArray(claim.payload.citationChunkIds)) {
                claim.payload.citationChunkIds.forEach((id) => allCitations.add(id));
              }
              if (claim.payload.questions) {
                claim.payload.questions.forEach((q) => {
                  q.citationChunkIds?.forEach((id) => allCitations.add(id));
                });
              }
              if (claim.record.tokenUsage) {
                totalUsage.inputTokens += claim.record.tokenUsage.inputTokens;
                totalUsage.outputTokens += claim.record.tokenUsage.outputTokens;
              }
              await this.progressService.updateProgress(
                documentId,
                organizationId,
                "quiz",
                blueprint.index + 1,
                sessionBlueprints.length,
              );
              continue;
            }
          }
          pendingBlueprints.push(blueprint);
        }

        if (pendingBlueprints.length === 0) {
          continue;
        }

        // 2. Prepare valid pending items
        const validPendingItems: Array<{
          blueprint: (typeof batchBlueprints)[number];
          effectiveChunks: Array<{ id: string; content: string; heading: string | null }>;
          chunkContext: string;
          chunkIdList: string[];
          sessionBlueprintJson: string;
          targetQuizCount: number;
          lessonContent: string;
        }> = [];

        for (const blueprint of pendingBlueprints) {
          const relevantChunks = chunks.filter((c) =>
            blueprint.relevantChunkIds?.includes(c.id),
          );

          if (relevantChunks.length === 0) {
            process.stderr.write(
              `[generation-service] Stage 4 Diagnostic Warning: Session ${blueprint.index + 1}/${sessionBlueprints.length} ("${blueprint.title}") has no valid matching chunks. Model call skipped.\n`,
            );
            quizzesBySession.set(blueprint.index, []);
            await this.progressService.updateProgress(
              documentId,
              organizationId,
              "quiz",
              blueprint.index + 1,
              sessionBlueprints.length,
            );
            continue;
          }

          const effectiveChunks = relevantChunks;
          const chunkContext = effectiveChunks
            .map(
              (c, i) =>
                `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
            )
            .join("\n\n---\n\n");
          const chunkIdList = effectiveChunks.map((c) => c.id);

          const sessionBlueprintJson = JSON.stringify(
            {
              index: blueprint.index,
              title: blueprint.title,
              description: blueprint.description,
              coreConcepts: blueprint.coreConcepts,
              relevantChunkIds: blueprint.relevantChunkIds,
            },
            null,
            2,
          );

          const targetQuizCount = Math.min(
            budget.quizBudget.maxQuestionsPerTopic,
            Math.max(
              budget.quizBudget.minQuestionsPerTopic,
              blueprint.targetQuizCount || budget.quizBudget.targetQuestionsPerTopic,
            ),
          );

          const matchedSession =
            sessionsMarkdown.find((s) => s.title === blueprint.title) ??
            sessionsMarkdown[blueprint.index];
          const lessonContent =
            matchedSession?.contentMarkdown ||
            `[Session Blueprint Summary]\nTopic: ${blueprint.title}\nDescription: ${blueprint.description || ""}\nCore Concepts to Cover:\n${(blueprint.coreConcepts || []).map((c) => `- ${c}`).join("\n")}\n\nNote: Ground all quiz questions strictly in the provided source chunks.`;

          validPendingItems.push({
            blueprint,
            effectiveChunks,
            chunkContext,
            chunkIdList,
            sessionBlueprintJson,
            targetQuizCount,
            lessonContent,
          });
        }

        if (validPendingItems.length === 0) {
          continue;
        }

        // 3. Dispatch batch request to DeepSeek
        const batchKey = `quiz_batch:${validPendingItems.map((v) => v.blueprint.index).join(",")}`;
        const batchPrompt = buildQuizBatchGenerationUserPrompt({
          documentTitle: doc.originalName,
          sessions: validPendingItems.map((v) => ({
            sessionIndex: v.blueprint.index,
            sessionTitle: v.blueprint.title,
            sessionBlueprint: v.sessionBlueprintJson,
            targetQuizCount: v.targetQuizCount,
            lessonContent: v.lessonContent,
            chunkContext: v.chunkContext,
            chunkIdList: v.chunkIdList,
          })),
        });

        process.stdout.write(
          `[generation-service] Stage 4: Generating DeepSeek Batch (${validPendingItems.length} session quiz sets: ${validPendingItems.map((v) => `"${v.blueprint.title}"`).join(", ")})...\n`,
        );

        const batchResult = await this.executeWithChunkRetry(
          batchKey,
          async () => {
            const completion = await this.gateway.complete({
              promptVersion,
              messages: [
                {
                  role: "system",
                  content: QUIZ_GENERATION_SYSTEM_PROMPT,
                },
                { role: "user", content: batchPrompt },
              ],
              jsonSchema: { type: "quizzes_batch" },
              correlationId,
              organizationId,
              documentId,
              stage: "quiz",
            });

            const parsed = this.cleanAndParseJson<{
              results?: Array<{
                sessionIndex?: number;
                index?: number;
                sessionTitle?: string;
                title?: string;
                questions?: Array<{
                  question: string;
                  questionType?: "multiple_choice";
                  difficulty?: "easy" | "medium" | "hard";
                  category?: string;
                  choices?: string[];
                  correctAnswer?: string;
                  explanation?: string;
                  citationChunkIds?: string[];
                }>;
                citationChunkIds?: string[];
              }>;
              questions?: Array<{
                question: string;
                questionType?: "multiple_choice";
                difficulty?: "easy" | "medium" | "hard";
                category?: string;
                choices?: string[];
                correctAnswer?: string;
                explanation?: string;
                citationChunkIds?: string[];
              }>;
              citationChunkIds?: string[];
            }>(completion.text, "quizzes_batch");

            const rawResults = Array.isArray(parsed?.results)
              ? parsed.results
              : Array.isArray(parsed?.questions)
                ? [{ sessionIndex: validPendingItems[0]?.blueprint.index, questions: parsed.questions, citationChunkIds: parsed.citationChunkIds }]
                : Array.isArray(parsed)
                  ? (parsed as unknown[])
                  : [];

            return {
              results: rawResults as Array<{
                sessionIndex?: number;
                index?: number;
                sessionTitle?: string;
                title?: string;
                questions?: Array<{
                  question: string;
                  questionType?: "multiple_choice";
                  difficulty?: "easy" | "medium" | "hard";
                  category?: string;
                  choices?: string[];
                  correctAnswer?: string;
                  explanation?: string;
                  citationChunkIds?: string[];
                }>;
                citationChunkIds?: string[];
              }>,
              usage: completion.usage,
            };
          },
        );

        totalUsage.inputTokens += batchResult.usage.inputTokens;
        totalUsage.outputTokens += batchResult.usage.outputTokens;

        // 4. Deterministic mapping strictly by sessionIndex / index & persistence
        for (const item of validPendingItems) {
          const blueprint = item.blueprint;
          const chunkKey = `quiz:${blueprint.index}`;

          const matched = batchResult.results.find(
            (r) => r.sessionIndex === blueprint.index || r.index === blueprint.index,
          );

          const rawQuestions = Array.isArray(matched?.questions) ? matched.questions : [];
          const validChunkSet = new Set(item.chunkIdList);
          const validSessionQuestions: Array<{
            sessionIndex: number;
            question: string;
            questionType: "multiple_choice";
            choices: string[];
            correctAnswer: string;
            explanation: string;
            difficulty: "easy" | "medium" | "hard";
            category: string;
            citationChunkIds: string[];
          }> = [];

          for (const q of rawQuestions) {
            if (!q.question || typeof q.question !== "string" || !q.question.trim()) {
              continue;
            }

            let choices = Array.isArray(q.choices)
              ? q.choices.map((c) => String(c).trim()).filter(Boolean)
              : [];

            // Quality constraint 1: Exactly 4 choices
            if (choices.length !== 4) {
              continue;
            }

            // Quality constraint 2: Distinct choices (no duplicate options)
            if (new Set(choices).size !== 4) {
              continue;
            }

            // Quality constraint 3: Strict correct answer resolution
            let resolvedCorrectAnswer = resolveCorrectChoiceText(choices, q.correctAnswer, { strict: true });
            if (!resolvedCorrectAnswer) {
              continue;
            }

            // Quality constraint 4: Quality gate
            let qualityResult = validateQuestionQuality(
              {
                question: q.question,
                choices,
                correctAnswer: resolvedCorrectAnswer,
              },
              { requireFourChoices: true },
            );

            // Quality constraint 4b: Safe Deterministic Repair if quality gate failed
            if (!qualityResult.valid) {
              const repairRes = repairQuestionBias({
                question: q.question,
                choices,
                correctAnswer: resolvedCorrectAnswer,
                explanation: q.explanation,
              });

              if (repairRes.repaired && repairRes.question && Array.isArray(repairRes.question.choices)) {
                choices = repairRes.question.choices.map((c) => String(c).trim());
                resolvedCorrectAnswer = String(repairRes.question.correctAnswer);
                qualityResult = validateQuestionQuality(
                  {
                    question: q.question,
                    choices,
                    correctAnswer: resolvedCorrectAnswer,
                  },
                  { requireFourChoices: true },
                );
              }

              if (!qualityResult.valid) {
                continue;
              }
            }

            // Quality constraint 5: De-duplication
            const isDuplicate = validSessionQuestions.some((existingQ) =>
              isNearDuplicateQuestion(existingQ.question, q.question),
            );
            if (isDuplicate) {
              continue;
            }

            // Quality constraint 6: Sanitize citations
            const validQuestionCitations = Array.isArray(q.citationChunkIds)
              ? q.citationChunkIds.filter((id) => validChunkSet.has(id))
              : [];
            const finalQuestionCitations =
              validQuestionCitations.length > 0
                ? validQuestionCitations
                : [item.chunkIdList[0]];

            let normalizedDifficulty: "easy" | "medium" | "hard" = "medium";
            if (q.difficulty === "easy" || q.difficulty === "hard") {
              normalizedDifficulty = q.difficulty;
            }

            const baseExplanation =
              q.explanation && q.explanation.trim()
                ? q.explanation.trim()
                : `پاسخ صحیح: ${resolvedCorrectAnswer}. بر اساس تحلیل داده‌های منبع درس.`;

            // Quality constraint 7: Atomic Choice Shuffling
            const shuffled = canonicalizeAndShuffleQuestion({
              question: q.question.trim(),
              choices,
              correctAnswer: resolvedCorrectAnswer,
              explanation: baseExplanation,
            });

            validSessionQuestions.push({
              sessionIndex: blueprint.index,
              question: shuffled.question || q.question.trim(),
              questionType: "multiple_choice",
              choices: (shuffled.choices as string[]) || choices,
              correctAnswer: String(shuffled.correctAnswer),
              explanation: shuffled.explanation || baseExplanation,
              difficulty: normalizedDifficulty,
              category: q.category?.trim() || "application",
              citationChunkIds: finalQuestionCitations,
            });
          }

          if (!matched || validSessionQuestions.length === 0) {
            const failedAt = new Date().toISOString();
            await this.chunkRecordStore.upsert({
              id: randomUUID(),
              organizationId,
              documentId,
              courseId: targetCourseId ?? doc.courseId,
              stage: "quiz",
              chunkIndex: blueprint.index,
              chunkKey,
              status: "failed",
              payload: null,
              errorCode: "STAGE4_BATCH_QUIZ_MISSING",
              errorMessage: `DeepSeek batch response did not include valid quiz questions for sessionIndex ${blueprint.index}`,
              attempts: 1,
              createdAt: failedAt,
              updatedAt: failedAt,
            });
            continue;
          }

          const citationChunkIds = Array.isArray(matched?.citationChunkIds)
            ? matched.citationChunkIds.filter((id) => validChunkSet.has(id))
            : [];

          validSessionQuestions.forEach((q) => {
            q.citationChunkIds.forEach((id) => allCitations.add(id));
          });
          citationChunkIds.forEach((id) => allCitations.add(id));

          const completedAt = new Date().toISOString();
          await this.chunkRecordStore.upsert({
            id: randomUUID(),
            organizationId,
            documentId,
            courseId: targetCourseId ?? doc.courseId,
            stage: "quiz",
            chunkIndex: blueprint.index,
            chunkKey,
            status: "completed",
            payload: {
              questions: validSessionQuestions,
              citationChunkIds,
            },
            tokenUsage: {
              inputTokens: Math.round(batchResult.usage.inputTokens / validPendingItems.length),
              outputTokens: Math.round(batchResult.usage.outputTokens / validPendingItems.length),
            },
            attempts: 1,
            createdAt: completedAt,
            updatedAt: completedAt,
            completedAt,
          });

          quizzesBySession.set(blueprint.index, validSessionQuestions);
          await this.progressService.updateProgress(
            documentId,
            organizationId,
            "quiz",
            blueprint.index + 1,
            sessionBlueprints.length,
          );
        }
      }

      const missingQuizIndices = sessionBlueprints
        .filter((b) => !quizzesBySession.has(b.index) || quizzesBySession.get(b.index)!.length === 0)
        .map((b) => b.index);
      if (missingQuizIndices.length > 0) {
        throw new DomainError(
          "unprocessable",
          `DeepSeek batch generation failed to produce valid quizzes for session indices: ${missingQuizIndices.join(", ")}`,
        );
      }

      await this.progressService.completeStage(
        documentId,
        organizationId,
        "quiz",
      );

      return {
        quizzesBySession,
        allCitations,
        usage: totalUsage,
      };
    }

    // -------------------------------------------------------------------------
    // Gemini & Standard Per-Item Processing (100% Unchanged)
    // -------------------------------------------------------------------------
    for (let idx = 0; idx < sessionBlueprints.length; idx++) {
      await this.checkCancellation(jobId, organizationId, documentId);
      const blueprint = sessionBlueprints[idx];
      const chunkKey = `quiz:${blueprint.index}`;

      const claim = await this.acquireOrWaitForChunk<{
        questions: Array<{
          sessionIndex?: number;
          question: string;
          questionType: "multiple_choice";
          choices: string[];
          correctAnswer: string;
          explanation: string;
          difficulty?: "easy" | "medium" | "hard";
          category?: string;
          citationChunkIds?: string[];
        }>;
        citationChunkIds?: string[];
      }>({
        organizationId,
        documentId,
        courseId: targetCourseId ?? doc.courseId,
        jobId,
        stage: "quiz",
        chunkIndex: blueprint.index,
        chunkKey,
      });

      if (claim.status === "completed") {
        const currentChunkIds = new Set(chunks.map((c) => c.id));
        const isStale =
          !claim.payload ||
          !Array.isArray(claim.payload.questions) ||
          (Array.isArray(claim.payload.citationChunkIds) &&
            claim.payload.citationChunkIds.some((id) => !currentChunkIds.has(id))) ||
          claim.payload.questions.some(
            (q) =>
              Array.isArray(q.citationChunkIds) &&
              q.citationChunkIds.some((id) => !currentChunkIds.has(id)),
          );

        if (!isStale) {
          process.stdout.write(
            `[generation-service] Stage 4: Quizzes for session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}") loaded from cache (${claim.payload.questions.length} questions).\n`,
          );
          quizzesBySession.set(blueprint.index, claim.payload.questions);
          if (Array.isArray(claim.payload.citationChunkIds)) {
            claim.payload.citationChunkIds.forEach((id) => allCitations.add(id));
          }
          if (claim.payload.questions) {
            claim.payload.questions.forEach((q) => {
              q.citationChunkIds?.forEach((id) => allCitations.add(id));
            });
          }
          if (claim.record.tokenUsage) {
            totalUsage.inputTokens += claim.record.tokenUsage.inputTokens;
            totalUsage.outputTokens += claim.record.tokenUsage.outputTokens;
          }
          await this.progressService.updateProgress(
            documentId,
            organizationId,
            "quiz",
            idx + 1,
            sessionBlueprints.length,
          );
          continue;
        }
      }

      const existing = claim.record;
      const now = existing.updatedAt || new Date().toISOString();

      const relevantChunks = chunks.filter((c) =>
        blueprint.relevantChunkIds?.includes(c.id),
      );

      // Strict safeguard against full-document context dilution
      if (relevantChunks.length === 0) {
        process.stderr.write(
          `[generation-service] Stage 4 Diagnostic Warning: Session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}") has no valid matching chunks in document (relevantChunkIds: ${JSON.stringify(blueprint.relevantChunkIds)}). Model call skipped to prevent full-document context dilution.\n`,
        );
        quizzesBySession.set(blueprint.index, []);
        await this.progressService.updateProgress(
          documentId,
          organizationId,
          "quiz",
          idx + 1,
          sessionBlueprints.length,
        );
        continue;
      }

      const chunkContext = relevantChunks
        .map(
          (c, i) =>
            `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
        )
        .join("\n\n---\n\n");
      const chunkIdList = relevantChunks.map((c) => c.id);
      const validChunkSet = new Set(chunkIdList);

      const sessionBlueprintJson = JSON.stringify(
        {
          index: blueprint.index,
          title: blueprint.title,
          description: blueprint.description,
          coreConcepts: blueprint.coreConcepts,
          relevantChunkIds: blueprint.relevantChunkIds,
        },
        null,
        2,
      );

      const targetQuizCount = Math.min(
        budget.quizBudget.maxQuestionsPerTopic,
        Math.max(
          budget.quizBudget.minQuestionsPerTopic,
          blueprint.targetQuizCount || budget.quizBudget.targetQuestionsPerTopic,
        ),
      );
      const matchedSession =
        sessionsMarkdown.find((s) => s.title === blueprint.title) ??
        sessionsMarkdown[blueprint.index] ??
        sessionsMarkdown[idx];
      const lessonContent =
        matchedSession?.contentMarkdown ||
        `[Session Blueprint Summary]\nTopic: ${blueprint.title}\nDescription: ${blueprint.description || ""}\nCore Concepts to Cover:\n${(blueprint.coreConcepts || []).map((c) => `- ${c}`).join("\n")}\n\nNote: Ground all quiz questions strictly in the provided source chunks.`;

      const prompt = buildQuizGenerationUserPrompt({
        documentTitle: doc.originalName,
        sessionBlueprint: sessionBlueprintJson,
        targetQuizCount,
        lessonContent,
        chunkContext,
        chunkIdList,
      });

      process.stdout.write(
        `[generation-service] Stage 4: Generating Quizzes for Session ${idx + 1}/${sessionBlueprints.length} ("${blueprint.title}")...\n`,
      );
      process.stdout.write(
        `[GENERATION] stage_started: documentId=${documentId} stage=quiz chunkKey=${chunkKey} sessionIndex=${blueprint.index} correlationId=${correlationId}\n`,
      );

      try {
        const qzResult = await this.executeWithChunkRetry(
          chunkKey,
          async () => {
            process.stdout.write(
              `[GENERATION] provider_request_started: stage=quiz chunkKey=${chunkKey} correlationId=${correlationId}\n`,
            );
            const completion = await this.gateway.complete({
              promptVersion,
              messages: [
                {
                  role: "system",
                  content: QUIZ_GENERATION_SYSTEM_PROMPT,
                },
                { role: "user", content: prompt },
              ],
              jsonSchema: { type: "quizzes" },
              correlationId,
              organizationId,
              documentId,
              stage: "quiz",
            });

            process.stdout.write(
              `[GENERATION] provider_response_received: stage=quiz chunkKey=${chunkKey} correlationId=${correlationId} inputTokens=${completion.usage?.inputTokens ?? 0} outputTokens=${completion.usage?.outputTokens ?? 0}\n`,
            );

            process.stdout.write(
              `[GENERATION] parsing_started: stage=quiz chunkKey=${chunkKey} correlationId=${correlationId}\n`,
            );
            const parsed = this.cleanAndParseJson<{
              kind?: string;
              questions?: Array<{
                question: string;
                questionType?: "multiple_choice";
                difficulty?: "easy" | "medium" | "hard";
                category?: string;
                choices?: string[];
                correctAnswer?: string;
                explanation?: string;
                citationChunkIds?: string[];
              }>;
              citationChunkIds?: string[];
            }>(completion.text, "quizzes");

            const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
            const validSessionQuestions: Array<{
              sessionIndex: number;
              question: string;
              questionType: "multiple_choice";
              choices: string[];
              correctAnswer: string;
              explanation: string;
              difficulty: "easy" | "medium" | "hard";
              category: string;
              citationChunkIds: string[];
            }> = [];

            for (const q of rawQuestions) {
              if (!q.question || typeof q.question !== "string" || !q.question.trim()) {
                continue;
              }

              let choices = Array.isArray(q.choices)
                ? q.choices.map((c) => String(c).trim()).filter(Boolean)
                : [];

              // Quality constraint 1: Exactly 4 choices
              if (choices.length !== 4) {
                continue;
              }

              // Quality constraint 2: Distinct choices (no duplicate options)
              if (new Set(choices).size !== 4) {
                continue;
              }

              // Quality constraint 3: Strict correct answer resolution (never silently pick choices[0])
              let resolvedCorrectAnswer = resolveCorrectChoiceText(choices, q.correctAnswer, { strict: true });
              if (!resolvedCorrectAnswer) {
                continue;
              }

              // Quality constraint 4: Quality gate (reject placeholders, lazy omnibus options, length bias, leakage)
              let qualityResult = validateQuestionQuality(
                {
                  question: q.question,
                  choices,
                  correctAnswer: resolvedCorrectAnswer,
                },
                { requireFourChoices: true },
              );

              // Quality constraint 4b: Safe Deterministic Repair if quality gate failed
              if (!qualityResult.valid) {
                const repairRes = repairQuestionBias({
                  question: q.question,
                  choices,
                  correctAnswer: resolvedCorrectAnswer,
                  explanation: q.explanation,
                });

                if (repairRes.repaired && repairRes.question && Array.isArray(repairRes.question.choices)) {
                  choices = repairRes.question.choices.map((c) => String(c).trim());
                  resolvedCorrectAnswer = String(repairRes.question.correctAnswer);
                  qualityResult = validateQuestionQuality(
                    {
                      question: q.question,
                      choices,
                      correctAnswer: resolvedCorrectAnswer,
                    },
                    { requireFourChoices: true },
                  );
                }

                if (!qualityResult.valid) {
                  continue;
                }
              }

              // Quality constraint 5: De-duplication against existing questions in this session
              const isDuplicate = validSessionQuestions.some((existingQ) =>
                isNearDuplicateQuestion(existingQ.question, q.question),
              );
              if (isDuplicate) {
                continue;
              }

              // Quality constraint 6: Sanitize citationChunkIds (only accept valid chunk IDs of this session)
              const validQuestionCitations = Array.isArray(q.citationChunkIds)
                ? q.citationChunkIds.filter((id) => validChunkSet.has(id))
                : [];
              const finalQuestionCitations =
                validQuestionCitations.length > 0
                  ? validQuestionCitations
                  : [chunkIdList[0]];

              let normalizedDifficulty: "easy" | "medium" | "hard" = "medium";
              if (q.difficulty === "easy" || q.difficulty === "hard") {
                normalizedDifficulty = q.difficulty;
              }

              const baseExplanation =
                q.explanation && q.explanation.trim()
                  ? q.explanation.trim()
                  : `پاسخ صحیح: ${resolvedCorrectAnswer}. بر اساس تحلیل داده‌های منبع درس.`;

              // Quality constraint 7: Atomic Choice Shuffling & Answer Key Sync
              const shuffled = canonicalizeAndShuffleQuestion({
                question: q.question.trim(),
                choices,
                correctAnswer: resolvedCorrectAnswer,
                explanation: baseExplanation,
              });

              validSessionQuestions.push({
                sessionIndex: blueprint.index,
                question: shuffled.question || q.question.trim(),
                questionType: "multiple_choice",
                choices: (shuffled.choices as string[]) || choices,
                correctAnswer: String(shuffled.correctAnswer),
                explanation: shuffled.explanation || baseExplanation,
                difficulty: normalizedDifficulty,
                category: q.category?.trim() || "application",
                citationChunkIds: finalQuestionCitations,
              });
            }

            const citationChunkIds = Array.isArray(parsed?.citationChunkIds)
              ? parsed.citationChunkIds.filter((id) => validChunkSet.has(id))
              : [];

            process.stdout.write(
              `[GENERATION] validation_passed: stage=quiz chunkKey=${chunkKey} correlationId=${correlationId} questionsCount=${validSessionQuestions.length}\n`,
            );

            return {
              questions: validSessionQuestions,
              citationChunkIds,
              usage: completion.usage,
            };
          },
        );

        totalUsage.inputTokens += qzResult.usage.inputTokens;
        totalUsage.outputTokens += qzResult.usage.outputTokens;

        qzResult.questions.forEach((q) => {
          q.citationChunkIds.forEach((id) => allCitations.add(id));
        });
        qzResult.citationChunkIds.forEach((id) => allCitations.add(id));

        const completedAt = new Date().toISOString();
        await this.chunkRecordStore.upsert({
          id: existing?.id ?? randomUUID(),
          organizationId,
          documentId,
          courseId: targetCourseId ?? doc.courseId,
          stage: "quiz",
          chunkIndex: blueprint.index,
          chunkKey,
          status: "completed",
          payload: {
            questions: qzResult.questions,
            citationChunkIds: qzResult.citationChunkIds,
          },
          tokenUsage: qzResult.usage,
          attempts: (existing?.attempts ?? 0) + 1,
          createdAt: existing?.createdAt ?? now,
          updatedAt: completedAt,
          completedAt,
        });

        process.stdout.write(
          `[GENERATION] persistence_completed: stage=quiz chunkKey=${chunkKey} documentId=${documentId}\n`,
        );

        quizzesBySession.set(blueprint.index, qzResult.questions);
        await this.progressService.updateProgress(
          documentId,
          organizationId,
          "quiz",
          idx + 1,
          sessionBlueprints.length,
        );
      } catch (err) {
        await this.chunkRecordStore.upsert({
          id: existing?.id ?? randomUUID(),
          organizationId,
          documentId,
          courseId: targetCourseId ?? doc.courseId,
          stage: "quiz",
          chunkIndex: blueprint.index,
          chunkKey,
          status: "failed",
          errorCode: this.resolveErrorCode(err),
          errorMessage: err instanceof Error ? err.message : String(err),
          attempts: (existing?.attempts ?? 0) + 1,
          createdAt: existing?.createdAt ?? now,
          updatedAt: new Date().toISOString(),
        });
        throw err;
      }
    }

    await this.progressService.completeStage(
      documentId,
      organizationId,
      "quiz",
    );

    return {
      quizzesBySession,
      allCitations,
      usage: totalUsage,
    };
  }

  /**
   * Stage 5: Coverage Audit, Supplemental Gap Filling & Final Report Assembly.
   */
  private async auditAndBuildCoverageReport(
    contentPlan: ContentPlan,
    sessionsMarkdown: Array<{ title: string; contentMarkdown: string }>,
    flashcardsBySession: Map<number, Array<{ question: string; answer: string }>>,
    quizzesBySession: Map<number, Array<{ question: string; choices: string[]; correctAnswer: string }>>,
    _chunks: Array<{ id: string; content: string; heading: string | null }>,
    budget: GenerationBudget,
  ): Promise<{
    coverageReport: DocumentCoverageReport;
  }> {
    let totalCoveredByFlashcards = 0;
    let totalCoveredByQuiz = 0;
    let totalFactsCount = 0;

    const cardsPerSessionReport: Array<{ sessionTitle: string; cardCount: number }> = [];
    const questionsPerSessionReport: Array<{ sessionTitle: string; questionCount: number }> = [];
    const sessionsAudit: SessionCoverageAudit[] = [];
    const majorConceptsCovered: CoverageConcept[] = [];
    const uncoveredConcepts: CoverageConcept[] = [];

    contentPlan.sessions.forEach((s) => {
      const cards = flashcardsBySession.get(s.index) || [];
      const questions = quizzesBySession.get(s.index) || [];
      const md = sessionsMarkdown[s.index]?.contentMarkdown || "";

      totalCoveredByFlashcards += cards.length;
      totalCoveredByQuiz += questions.length;
      totalFactsCount += Math.max(1, s.coreConcepts.length);

      cardsPerSessionReport.push({
        sessionTitle: s.title,
        cardCount: cards.length,
      });
      questionsPerSessionReport.push({
        sessionTitle: s.title,
        questionCount: questions.length,
      });

      const coveredByLesson = md.length > 200;
      const coveredByFlashcards = cards.length >= budget.flashcardBudget.minCardsPerTopic;
      const coveredByQuiz = questions.length >= budget.quizBudget.minQuestionsPerTopic;

      s.coreConcepts.forEach((c) => majorConceptsCovered.push(c));

      sessionsAudit.push({
        topicIndex: s.index,
        topicTitle: s.title,
        keyConcepts: s.coreConcepts,
        flashcardCount: cards.length,
        quizQuestionCount: questions.length,
        coveredByLesson,
        coveredByFlashcards,
        coveredByQuiz,
        uncoveredConcepts: [],
        supplementalNeeded: !coveredByFlashcards || !coveredByQuiz,
      });
    });

    const totalExpectedCards = contentPlan.sessions.length * budget.flashcardBudget.minCardsPerTopic;
    const totalExpectedQuiz = contentPlan.sessions.length * budget.quizBudget.minQuestionsPerTopic;

    const flashcardCoveragePct = Math.min(
      100,
      Math.round((totalCoveredByFlashcards / Math.max(1, totalExpectedCards)) * 100),
    );
    const quizCoveragePct = Math.min(
      100,
      Math.round((totalCoveredByQuiz / Math.max(1, totalExpectedQuiz)) * 100),
    );

    const coverageReport: DocumentCoverageReport = {
      sourceTopicsIdentified: contentPlan.sourceTopics,
      topicsAssignedToSessions: contentPlan.sessions.map((s) => ({
        sessionIndex: s.index,
        sessionTitle: s.title,
        assignedTopics: [s.title],
      })),
      majorConceptsCovered,
      uncoveredConcepts,
      flashcardCoverage: {
        totalCards: totalCoveredByFlashcards,
        coveragePct: flashcardCoveragePct,
        cardsPerSession: cardsPerSessionReport,
      },
      quizCoverage: {
        totalQuestions: totalCoveredByQuiz,
        coveragePct: quizCoveragePct,
        questionsPerSession: questionsPerSessionReport,
      },
      totalIdentifiedFacts: totalFactsCount,
      coveredByLessons: contentPlan.sessions.length,
      coveredByFlashcards: totalCoveredByFlashcards,
      coveredByQuiz: totalCoveredByQuiz,
      lessonCoveragePct: 100,
      flashcardCoveragePct,
      quizCoveragePct,
      sessionsAudit,
      supplementalPassTriggered: false,
    };

    return { coverageReport };
  }

  /**
   * Ground a payload to the document's chunks (source-grounding enforcement).
   */
  private groundCitations(
    payload: GeneratedContentPayload,
    chunkIds: string[],
  ): GeneratedContentPayload {
    if (payload.kind === "review_summary") {
      return validateAndGroundReviewSummaryCitations(payload, chunkIds);
    }
    const chunkIdSet = new Set(chunkIds);
    const payloadAny = payload as GeneratedContentPayload & {
      citationChunkIds?: string[];
    };
    const present = (payloadAny.citationChunkIds ?? []).filter((id) =>
      chunkIdSet.has(id),
    );
    const grounded = present.length > 0 ? present : chunkIds;
    if (grounded.length === 0) {
      throw new DomainError(
        "unprocessable",
        "Generated content has no citations to source chunks",
      );
    }
    return {
      ...(payload as object),
      citationChunkIds: grounded,
    } as GeneratedContentPayload;
  }

  /**
   * Assembles structured Stage 5 generation input according to the production input contract:
   * Stage 1 (Planning) + Stage 2 (Generated Lessons) + Source Chunks (Grounding/Citations) + Adaptive Budget.
   */
  public buildReviewSummaryGenerationInput(
    doc: DocumentRecord,
    chunks: DocumentChunkRecord[],
    contentPlan: ContentPlan,
    generatedSessions: Array<{
      title: string;
      contentMarkdown: string;
      citationChunkIds: string[];
    }>,
    totalTokens?: number,
    generationId?: string,
  ): ReviewSummaryGenerationInput {
    // 1. Source Topics
    const sourceTopics: ReviewSummarySourceTopic[] = (
      contentPlan.sourceTopics || []
    ).map((st, idx) => ({
      id: st.id || `topic-${idx + 1}`,
      title: st.title,
      description: st.description,
      category: st.category,
      chunkIds: st.relevantChunkIds || chunks.map((c) => c.id),
    }));

    // 2. Sessions
    const sessions: ReviewSummarySession[] = (contentPlan.sessions || []).map(
      (s, idx) => ({
        id: `session-${(s.index ?? idx) + 1}`,
        order: s.index ?? idx,
        title: s.title,
        description: s.description,
        relevantChunkIds: s.relevantChunkIds || [],
        coreConceptIds: (s.coreConcepts || []).map((c) => c.id),
      }),
    );

    // 3. Core Concepts
    const allConceptsMap = new Map<string, ReviewSummaryCoreConcept>();
    for (let sIdx = 0; sIdx < (contentPlan.sessions || []).length; sIdx++) {
      const s = contentPlan.sessions[sIdx];
      const sessionId = `session-${(s.index ?? sIdx) + 1}`;
      for (const c of s.coreConcepts || []) {
        if (!allConceptsMap.has(c.id)) {
          allConceptsMap.set(c.id, {
            id: c.id,
            title: c.name,
            description: c.description,
            importance: "high",
            category: c.category,
            relatedChunkIds: c.sourceChunkIds || s.relevantChunkIds,
            relatedSessionIds: [sessionId],
          });
        } else {
          const existing = allConceptsMap.get(c.id)!;
          if (
            existing.relatedSessionIds &&
            !existing.relatedSessionIds.includes(sessionId)
          ) {
            existing.relatedSessionIds.push(sessionId);
          }
        }
      }
    }
    const coreConcepts = Array.from(allConceptsMap.values());

    // 4. High-Yield Facts
    const highYieldFacts: ReviewSummaryHighYieldFact[] = (
      contentPlan.highYieldFacts || []
    ).map((hy, idx) => {
      const sessionObj = contentPlan.sessions.find(
        (s, sIdx) => (s.index ?? sIdx) === hy.sessionIndex,
      );
      const sessionId = sessionObj
        ? `session-${(sessionObj.index ?? hy.sessionIndex) + 1}`
        : `session-${hy.sessionIndex + 1}`;
      const sourceChunkIds =
        sessionObj && sessionObj.relevantChunkIds.length > 0
          ? sessionObj.relevantChunkIds
          : chunks.map((c) => c.id);

      return {
        id: hy.id || `fact-${idx + 1}`,
        fact: hy.fact,
        importance: "high",
        category: hy.category,
        sourceChunkIds,
        sessionIndex: hy.sessionIndex,
        sessionId,
      };
    });

    // 5. Stage 2 Lessons mapped to sessions
    const lessons: ReviewSummaryLessonInput[] = generatedSessions.map(
      (ls, idx) => {
        const matchingSession = contentPlan.sessions[idx];
        const sessionOrder = matchingSession?.index ?? idx;
        const sessionId = `session-${sessionOrder + 1}`;

        return {
          sessionId,
          sessionOrder,
          title:
            ls.title || matchingSession?.title || `جلسه ${sessionOrder + 1}`,
          contentMarkdown: ls.contentMarkdown || "",
          citationChunkIds: ls.citationChunkIds || [],
        };
      },
    );

    // 6. Source Chunks for grounding
    const sourceChunks: ReviewSummarySourceChunk[] = chunks.map((c) => ({
      id: c.id,
      text: c.content,
      sectionTitle: c.heading ?? undefined,
      pageNumber: c.startPage ?? undefined,
    }));

    // 7. Adaptive Generation Context via getReviewSummaryConfig
    const calculatedTokens =
      totalTokens ||
      chunks.reduce((acc, c) => acc + (c.tokenEstimate || 500), 0);
    const budgetConfig = getReviewSummaryConfig({
      chunkCount: chunks.length,
      totalTokens: calculatedTokens,
    });

    const generationContext: ReviewSummaryGenerationContext = {
      targetMinutes: budgetConfig.targetReadingMinutes,
      minMinutes: budgetConfig.minReadingMinutes,
      maxMinutes: budgetConfig.maxReadingMinutes,
      language: "fa",
      audience: "pharmacy_students",
      documentTitle: cleanEducationalTitle(
        contentPlan.moduleTitle,
        "مبحث آموزشی جامع",
      ),
      wordsPerMinute: budgetConfig.wordsPerMinute,
      targetWordBudget: budgetConfig.targetWordBudget,
      maxSections: budgetConfig.maxSections,
    };

    return {
      documentId: doc.id,
      generationId,
      planning: {
        sourceTopics,
        sessions,
        coreConcepts,
        highYieldFacts,
      },
      lessons,
      sourceChunks,
      generationContext,
    };
  }

  /**
   * Calculate true database-backed content generation status for a document.
   * Delegated to GenerationContentStatusService.
   */
  async getDocumentContentStatus(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    courseId?: CourseId,
  ): Promise<DocumentContentStatusResource> {
    return this.contentStatusService.getDocumentContentStatus(
      actor,
      organizationId,
      documentId,
      courseId,
    );
  }

  /**
   * Estimate generation selling price in Toman for a document before starting generation,
   * calibrated against Katzung Chapter 40 reference document baseline.
   * Deterministic, zero AI calls, safe against client-side parameter tampering.
   */
  async estimateCostForDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    types: GeneratedContentType[],
    _courseId?: CourseId,
  ): Promise<{
    userPrice: ReferenceBasedUserPriceResult;
    aiCostEstimate: CostEstimateResult;
    estimatedPriceToman: number;
    formattedPrice: string;
    currency: "toman";
    disclaimer: string;
  }> {
    await this.authorize(actor, organizationId, "content:generate");

    const doc = await this.requireDocument(organizationId, documentId);
    const chunks = await this.chunkStore.listByDocument(documentId);

    if (!chunks || chunks.length === 0) {
      throw new DomainError(
        "unprocessable",
        "Document has not been processed or has no extracted text content for price estimation.",
      );
    }

    const totalTokens = chunks.reduce(
      (acc, c) => acc + (c.tokenEstimate || 0),
      0,
    );
    const totalCharacters = chunks.reduce(
      (acc, c) => acc + c.content.length,
      0,
    );

    if (totalTokens <= 0) {
      throw new DomainError(
        "unprocessable",
        "Document contains no usable extracted tokens for price estimation.",
      );
    }

    const requestedTypes =
      types && types.length > 0
        ? types
        : (["lesson", "flashcard", "quiz", "review_summary"] as GeneratedContentType[]);
    const enabled = requestedTypes.filter((t): t is GeneratedContentType =>
      isGenerationTypeEnabled(t),
    );

    let baselineOverride: Partial<ReferencePricingBaseline> | undefined;
    if (this.referencePricingProvider) {
      try {
        baselineOverride = await this.referencePricingProvider();
      } catch {
        // Fallback safely to canonical default baseline
      }
    }

    // 1. User Selling Price (Calibrated on Katzung Chapter 40 Reference File)
    const userPrice = calculateReferenceBasedUserPrice({
      targetUsableTokens: totalTokens,
      types: enabled,
      baseline: baselineOverride,
    });

    // 2. AI Infrastructure Cost Estimate (DeepSeek Flash V4 token rate)
    const aiCostEstimate = calculateEstimatedGenerationCost({
      documentMetrics: {
        pageCount: doc.pageCount,
        chunkCount: chunks.length,
        totalTokens,
        totalCharacters,
      },
      types: enabled,
      pricing: this.pricingConfig,
    });

    return {
      userPrice,
      aiCostEstimate,
      estimatedPriceToman: userPrice.totalPriceToman,
      formattedPrice: userPrice.formattedTotalPrice,
      currency: "toman",
      disclaimer: userPrice.disclaimer,
    };
  }

  /**
   * Check if a document has an actively running worker with a valid lease or recent heartbeat.
   * Delegated to GenerationQueryService.
   */
  async isDocumentActivelyWorking(
    documentId: DocumentId,
    organizationId: OrganizationId,
    staleThresholdMs = DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  ): Promise<boolean> {
    return this.queryService.isDocumentActivelyWorking(
      documentId,
      organizationId,
      staleThresholdMs,
    );
  }

  /**
   * Return all active generation items visible to the authenticated actor across all
   * authorized organizations and system organization.
   * Delegated to GenerationActiveStatusService.
   */
  async getGlobalActiveGenerations(
    actor: Actor,
  ): Promise<ActiveGenerationResource[]> {
    return this.activeStatusService.getGlobalActiveGenerations(actor);
  }

  /**
   * Return all currently active generation items for the current user and organization.
   * Scoped strictly to the actor's authorized documents and membership.
   * Delegated to GenerationActiveStatusService.
   */
  async getActiveGenerations(
    actor: Actor,
    organizationId: OrganizationId,
    courseId?: CourseId,
  ): Promise<ActiveGenerationResource[]> {
    return this.activeStatusService.getActiveGenerations(
      actor,
      organizationId,
      courseId,
    );
  }

  /**
   * Return canonical progress for a single document with strict tenant/ownership verification.
   * Delegated to GenerationQueryService.
   */
  async getDocumentGenerationProgress(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    courseId?: CourseId,
  ): Promise<{
    documentId: DocumentId;
    documentName: string;
    courseId: CourseId | null;
    generationProgress: DocumentGenerationProgressResource;
  }> {
    return this.queryService.getDocumentGenerationProgress(
      actor,
      organizationId,
      documentId,
      courseId,
    );
  }

  /**
   * Generate content for a document (worker-ready entry point).
   *
   * Authorization: requires `content:generate`.
   * Guard: the document must be in `extracted` (chunks present).
   * Idempotency: identical calls with the same `generationKey` for the same
   * document/type return the existing draft (no duplicate).
   */
  async generateForDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    input: {
      types?: GeneratedContentType[];
      promptVersion?: string;
      generationKey?: string;
      courseId?: CourseId;
      force?: boolean;
      jobId?: string;
      generationContext?: GenerationContext;
    } = {},
  ): Promise<GenerateResult> {
    await this.authorize(actor, organizationId, "content:generate");

    // Central Invariant: Admin generation = Gemini ONLY
    if (input.generationContext === "admin") {
      if (
        isDeepSeekProvider(this.gateway) ||
        (this.gateway.provider !== "gemini" && this.gateway.provider !== "mock")
      ) {
        throw new DomainError(
          "bad_request",
          `Admin generation invariant violation: Admin content generation must strictly use Gemini gateway (current provider: ${this.gateway.provider}, model: ${this.gateway.model ?? "unknown"}).`,
        );
      }
    }

    const promptVersion = input.promptVersion ?? "v1";
    const generationKey = input.generationKey ?? undefined;
    const targetCourseId = input.courseId;

    const doc = await this.requireDocument(organizationId, documentId);

    // Start background heartbeat refresher for this active generation run if jobId is provided
    let heartbeatTimer: NodeJS.Timeout | null = null;
    if (input.jobId && this.generationJobStore) {
      const activeJobId = input.jobId;
      process.stdout.write(
        `[GENERATION] heartbeat_started: jobId=${activeJobId} documentId=${documentId} interval=15s\n`,
      );
      heartbeatTimer = setInterval(async () => {
        try {
          const leaseExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await this.generationJobStore?.updateHeartbeat?.(
            activeJobId as GenerationJobId,
            organizationId,
            new Date().toISOString(),
            leaseExpiresAt,
          );
        } catch {
          // Ignore background heartbeat update errors
        }
      }, 15_000);
    }

    // Resolve which generation types are requested and enabled
    const requestedTypes =
      input.types && input.types.length > 0
        ? input.types
        : (["lesson"] as GeneratedContentType[]);
    const enabled = requestedTypes.filter((t): t is GeneratedContentType =>
      isGenerationTypeEnabled(t),
    );
    if (enabled.length === 0) {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      throw new DomainError(
        "bad_request",
        "No enabled generation types requested",
      );
    }

    // Idempotency: first check if existing drafts exist for the exact same generationKey (worker redelivery)
    const contents: GeneratedContentRecord[] = [];
    const pendingCheckTypes: GeneratedContentType[] = [];
    for (const type of enabled) {
      if (generationKey) {
        const existing = await this.generatedContentStore.findByGenerationKey(
          documentId,
          type,
          generationKey,
          organizationId,
        );
        if (existing) {
          contents.push(existing);
          continue;
        }
      }
      pendingCheckTypes.push(type);
    }

    // If all enabled types were already matched by generationKey, return them idempotently
    if (pendingCheckTypes.length === 0) {
      const resources = await Promise.all(
        contents.map((r) => this.toResource(r)),
      );
      return { contents: resources, document_status: doc.status };
    }

    // Server-side validation: check DB content status and prevent re-generating already-existing types
    const contentStatus = await this.getDocumentContentStatus(
      actor,
      organizationId,
      documentId,
      targetCourseId,
    );

    const isRegen = Boolean(
      input.force || (generationKey && generationKey.includes(":regen:")),
    );

    const toGenerate = pendingCheckTypes.filter((t) => {
      if (isRegen && requestedTypes.includes(t)) return true;
      if (t === "lesson" && contentStatus.lesson.generated) return false;
      if (t === "flashcard" && contentStatus.flashcards.generated) return false;
      if (t === "quiz" && contentStatus.exam.generated) return false;
      if (t === "review_summary" && contentStatus.review_summary?.generated) return false;
      return true;
    });

    if (toGenerate.length === 0 && contents.length === 0) {
      throw new DomainError(
        "conflict",
        "تمام محتواهای درخواستی از قبل برای این فایل وجود دارند.",
      );
    }

    // Nothing new to generate
    if (toGenerate.length === 0) {
      const resources = await Promise.all(
        contents.map((r) => this.toResource(r)),
      );
      return { contents: resources, document_status: doc.status };
    }

    // If regeneration was explicitly requested, clear existing chunk records for the targeted stages
    if (isRegen) {
      const stagesToClear: GenerationChunkStage[] = [];
      if (toGenerate.includes("lesson")) {
        stagesToClear.push("planning", "lesson");
      }
      if (toGenerate.includes("flashcard")) {
        stagesToClear.push("flashcard");
      }
      if (toGenerate.includes("quiz")) {
        stagesToClear.push("quiz");
      }
      if (toGenerate.includes("review_summary")) {
        stagesToClear.push("review_summary");
      }
      if (stagesToClear.length > 0) {
        await this.chunkRecordStore.deleteByDocumentAndStages(
          documentId,
          stagesToClear,
          organizationId,
        );
      }
    }

    // Guard: only documents with extracted chunks can be generated
    const allowedStatuses = new Set([
      "uploaded",
      "extracted",
      "pending_generation",
      "generating",
      "review_pending",
      "ready",
      "failed",
    ]);
    if (!allowedStatuses.has(doc.status)) {
      throw new DomainError(
        "conflict",
        `Document must be in 'extracted', 'review_pending', or 'ready' state to generate; current status: ${doc.status}`,
      );
    }

    // If the only type to generate is review_summary and lessons already exist in store
    // (such as during regeneration or when Stage 2 lessons were already generated),
    // delegate directly to generateReviewSummaryDirect. This consumes the existing persisted Stage 1 planning
    // and Stage 2 lessons from the database without regenerating them (preserving C2, Test E, and Test F).
    if (toGenerate.length === 1 && toGenerate[0] === "review_summary") {
      const existingContents = await this.generatedContentStore.listByDocument(
        documentId,
        organizationId,
      );
      const existingLesson = existingContents.find(
        (c) =>
          c.type === "lesson" &&
          c.deletedAt === null &&
          c.status !== "rejected",
      );
      if (existingLesson) {
        const summaryResource = await this.generateReviewSummaryDirect(
          actor,
          organizationId,
          documentId,
          {
            force: isRegen || Boolean(input.force),
            promptVersion,
            courseId: targetCourseId,
            generationKey,
          },
        );
        let updatedDoc = await this.requireDocument(organizationId, documentId);
        if (
          updatedDoc.status === "generating" ||
          updatedDoc.status === "extracted" ||
          updatedDoc.status === "failed"
        ) {
          const nowSuccess = new Date().toISOString();
          await this.documentStore.update({
            ...updatedDoc,
            status: "review_pending",
            errorCode: null,
            updatedAt: nowSuccess,
          });
          updatedDoc = {
            ...updatedDoc,
            status: "review_pending",
            updatedAt: nowSuccess,
          };
        }
        return {
          contents: [
            ...(await Promise.all(contents.map((r) => this.toResource(r)))),
            summaryResource,
          ],
          document_status: updatedDoc.status,
        };
      }
    }

    // Load source chunks
    const chunks = await this.chunkStore.listByDocument(documentId);
    if (chunks.length === 0) {
      throw new DomainError(
        "conflict",
        "Document has no chunks available to cite. Please extract text first.",
      );
    }

    const now = new Date().toISOString();
    let docStatus: DocumentRecord["status"] = doc.status;

    // Transition document to generating state immediately
    if (docStatus === "extracted" || docStatus === "uploaded" || docStatus === "failed") {
      await this.documentStore.update({
        ...doc,
        status: "generating",
        errorCode: null,
        updatedAt: now,
      });
      docStatus = "generating";
    }

    // Calculate adaptive generation budget
    const totalTokens = chunks.reduce(
      (acc, c) => acc + (c.tokenEstimate || 1),
      0,
    );
    const totalCharacters = chunks.reduce(
      (acc, c) => acc + c.content.length,
      0,
    );
    const budget = calculateGenerationBudget({
      pageCount: doc.pageCount,
      chunkCount: chunks.length,
      totalTokens,
      totalCharacters,
    });

    try {
      const resolvedModelName =
        (this.gateway as { modelName?: string }).modelName ??
        this.gateway.model ??
        "unknown";
      process.stdout.write(
        `[generation-service] Provider: ${this.gateway.provider}\n`,
      );
      process.stdout.write(
        `[generation-service] Model: ${resolvedModelName}\n`,
      );

      // Step 1: Content Planning & Coverage Analysis (1 API call)
      await this.checkCancellation(input.jobId, organizationId, documentId);
      const planningRes = await this.extractContentPlan(
        doc,
        chunks,
        budget,
        promptVersion,
        randomUUID(),
        organizationId,
        documentId,
        targetCourseId,
        input.jobId,
      );

      const contentPlan = planningRes.contentPlan;
      const moduleTitle = planningRes.moduleTitle;
      const outline = planningRes.outline;
      const model = planningRes.model;

      // Shared cache for generated session markdowns
      let generatedSessions: Array<{
        title: string;
        contentMarkdown: string;
        citationChunkIds: string[];
      }> = [];

      // Step 2: Batched Lesson Sessions (if requested)
      const lessonUsage = {
        inputTokens: planningRes.usage.inputTokens,
        outputTokens: planningRes.usage.outputTokens,
      };
      if (
        toGenerate.includes("lesson") ||
        toGenerate.includes("review_summary")
      ) {
        await this.checkCancellation(input.jobId, organizationId, documentId);
        const sessionBatchRes = await this.generateSessionsBatched(
          doc,
          contentPlan.sessions,
          chunks,
          budget,
          promptVersion,
          randomUUID(),
          organizationId,
          documentId,
          targetCourseId,
          input.jobId,
        );
        generatedSessions = sessionBatchRes.sessions;
        lessonUsage.inputTokens += sessionBatchRes.usage.inputTokens;
        lessonUsage.outputTokens += sessionBatchRes.usage.outputTokens;
      }

      // Step 3: Batched Flashcards (if requested)
      let flashcardsBySession = new Map<number, Array<{ question: string; answer: string; explanation?: string; cardType?: string; difficulty?: string }>>();
      let allFlashcardCitations = new Set<string>();
      let flashcardUsage = { inputTokens: 0, outputTokens: 0 };
      if (toGenerate.includes("flashcard")) {
        await this.checkCancellation(input.jobId, organizationId, documentId);
        const fcRes = await this.generateFlashcardsBatched(
          doc,
          contentPlan.sessions,
          generatedSessions,
          chunks,
          budget,
          promptVersion,
          randomUUID(),
          organizationId,
          documentId,
          targetCourseId,
          input.jobId,
        );
        flashcardsBySession = fcRes.flashcardsBySession as typeof flashcardsBySession;
        allFlashcardCitations = fcRes.allCitations;
        flashcardUsage = fcRes.usage;
      }

      // Step 4: Quizzes (if requested)
      let quizzesBySession = new Map<
        number,
        Array<{
          sessionIndex?: number;
          question: string;
          questionType: "multiple_choice";
          choices: string[];
          correctAnswer: string;
          explanation: string;
          difficulty?: "easy" | "medium" | "hard";
          category?: string;
          citationChunkIds?: string[];
        }>
      >();
      let allQuizCitations = new Set<string>();
      let quizUsage = { inputTokens: 0, outputTokens: 0 };
      if (toGenerate.includes("quiz")) {
        await this.checkCancellation(input.jobId, organizationId, documentId);
        const qzRes = await this.generateQuizzesBatched(
          doc,
          contentPlan.sessions,
          generatedSessions,
          chunks,
          budget,
          promptVersion,
          randomUUID(),
          organizationId,
          documentId,
          targetCourseId,
          input.jobId,
        );
        quizzesBySession = qzRes.quizzesBySession;
        allQuizCitations = qzRes.allCitations;
        quizUsage = qzRes.usage;
      }

      // Step 5: Coverage Audit & Report Assembly
      await this.checkCancellation(input.jobId, organizationId, documentId);
      const { coverageReport } = await this.auditAndBuildCoverageReport(
        contentPlan,
        generatedSessions,
        flashcardsBySession,
        quizzesBySession,
        chunks,
        budget,
      );

      // Persist generated records per type
      await this.checkCancellation(input.jobId, organizationId, documentId);
      for (const type of toGenerate) {
        let payload!: GeneratedContentPayload;
        let typeUsage = { inputTokens: 0, outputTokens: 0 };

        if (type === "lesson") {
          const cleanLessonTitle = cleanEducationalTitle(
            moduleTitle,
            "درسنامه آموزشی جامع",
          );
          const outlineListing = outline
            .map((item, idx) => `${idx + 1}. **${item.title}**: ${item.description}`)
            .join("\n");
          const masterMarkdown = [
            `# ${cleanLessonTitle}`,
            `## فهرست جلسات آموزشی`,
            outlineListing,
            `---`,
            ...generatedSessions.map((s) => s.contentMarkdown),
          ].join("\n\n");

          const allSessionCitations = Array.from(
            new Set(generatedSessions.flatMap((s) => s.citationChunkIds)),
          );

          const rootChemicalStructures = extractChemicalStructuresFromMarkdown(masterMarkdown);

          payload = {
            kind: "lesson",
            moduleTitle: cleanLessonTitle,
            title: cleanLessonTitle,
            outline,
            sessions: generatedSessions,
            contentMarkdown: masterMarkdown,
            citationChunkIds:
              allSessionCitations.length > 0
                ? allSessionCitations
                : planningRes.citationChunkIds,
            coverageReport,
            ...(rootChemicalStructures.length > 0 ? { chemicalStructures: rootChemicalStructures } : {}),
          };
          typeUsage = lessonUsage;
        } else if (type === "flashcard") {
          const allCards: Array<{
            question: string;
            answer: string;
            explanation?: string;
            cardType?: string;
            difficulty?: "easy" | "medium" | "hard";
          }> = [];

          contentPlan.sessions.forEach((s) => {
            const cards = flashcardsBySession.get(s.index) || [];
            allCards.push(...(cards as typeof allCards));
          });

          const flashcardTitle = resolveCanonicalContentTitle({
            type: "flashcard",
            payload: { cards: allCards },
            moduleTitle,
          });

          payload = {
            kind: "flashcard",
            title: flashcardTitle,
            question: allCards[0]?.question,
            answer: allCards[0]?.answer,
            explanation: allCards[0]?.explanation,
            cardType: allCards[0]?.cardType,
            difficulty: allCards[0]?.difficulty,
            cards: allCards,
            citationChunkIds:
              allFlashcardCitations.size > 0
                ? Array.from(allFlashcardCitations)
                : planningRes.citationChunkIds,
          };
          typeUsage = flashcardUsage;
        } else if (type === "quiz") {
          const allQuestions: Array<{
            sessionIndex?: number;
            question: string;
            questionType: "multiple_choice";
            choices: string[];
            correctAnswer: string;
            explanation: string;
            difficulty?: "easy" | "medium" | "hard";
            category?: string;
            citationChunkIds?: string[];
          }> = [];

          contentPlan.sessions.forEach((s) => {
            const questions = quizzesBySession.get(s.index) || [];
            allQuestions.push(...questions);
          });

          const cleanQuizTopic = cleanEducationalTitle(
            moduleTitle,
            "مبحث آموزشی",
          );

          payload = {
            kind: "quiz",
            title: `آزمون ارزیابی آموخته‌ها: ${cleanQuizTopic}`,
            questions: allQuestions,
            citationChunkIds:
              allQuizCitations.size > 0
                ? Array.from(allQuizCitations)
                : planningRes.citationChunkIds,
          };
          typeUsage = quizUsage;
        } else if (type === "review_summary") {
          await this.progressService.startStage(documentId, organizationId, "summary", 1);
          const chunkKey = "review_summary";
          const claim = await this.acquireOrWaitForChunk<ReviewSummaryPayload>({
            organizationId,
            documentId,
            courseId: targetCourseId ?? doc.courseId,
            stage: "review_summary",
            chunkIndex: 0,
            chunkKey,
          });

          let isSummaryCacheValid = false;
          if (claim.status === "completed") {
            const currentChunkIds = new Set(chunks.map((c) => c.id));
            const cachedSummary = claim.payload as ReviewSummaryPayload;
            const isStale =
              !cachedSummary ||
              !Array.isArray(cachedSummary.sections) ||
              cachedSummary.sections.some(
                (sec) =>
                  Array.isArray(sec.citationChunkIds) &&
                  sec.citationChunkIds.some((id) => !currentChunkIds.has(id)),
              ) ||
              (Array.isArray(cachedSummary.citationChunkIds) &&
                cachedSummary.citationChunkIds.some((id) => !currentChunkIds.has(id)));

            if (!isStale) {
              isSummaryCacheValid = true;
              process.stdout.write(
                `[generation-service] Stage 5: Review summary loaded from cache.\n`,
              );
              payload = claim.payload as unknown as GeneratedContentPayload;
              typeUsage = claim.record.tokenUsage || {
                inputTokens: 0,
                outputTokens: 0,
              };
              await this.progressService.completeStage(documentId, organizationId, "summary");
            }
          }

          if (!isSummaryCacheValid) {
            const existingSummaryChunk = claim.record;
            const nowChunk = existingSummaryChunk.updatedAt || new Date().toISOString();

            const summaryInput = this.buildReviewSummaryGenerationInput(
              doc,
              chunks,
              contentPlan,
              generatedSessions,
              totalTokens,
              input?.generationKey || generationKey || undefined,
            );
            validateReviewSummaryInput(summaryInput);

            const summaryPrompt = buildReviewSummaryUserPrompt(summaryInput);
            const summaryCorrelationId = randomUUID();

            process.stdout.write(
              `[GENERATION] stage_started: documentId=${documentId} stage=review_summary chunkKey=${chunkKey} correlationId=${summaryCorrelationId}\n`,
            );

            try {
              const summaryRes = await this.executeWithChunkRetry(
                chunkKey,
                async () => {
                  process.stdout.write(
                    `[GENERATION] provider_request_started: stage=review_summary chunkKey=${chunkKey} correlationId=${summaryCorrelationId}\n`,
                  );
                  const res = await this.gateway.complete({
                    promptVersion,
                    messages: [
                      {
                        role: "system",
                        content: REVIEW_SUMMARY_SYSTEM_PROMPT,
                      },
                      { role: "user", content: summaryPrompt },
                    ],
                    jsonSchema: { type: "review_summary" },
                    correlationId: summaryCorrelationId,
                    organizationId,
                    documentId,
                    stage: "review_summary",
                  });

                  process.stdout.write(
                    `[GENERATION] provider_response_received: stage=review_summary chunkKey=${chunkKey} correlationId=${summaryCorrelationId} inputTokens=${res.usage?.inputTokens ?? 0} outputTokens=${res.usage?.outputTokens ?? 0}\n`,
                  );

                  process.stdout.write(
                    `[GENERATION] parsing_started: stage=review_summary chunkKey=${chunkKey} correlationId=${summaryCorrelationId}\n`,
                  );
                  const rawSummaryPayload = this.cleanAndParseJson<unknown>(
                    res.text,
                    "review_summary",
                  );
                  const validated = validateReviewSummaryPayload(rawSummaryPayload);

                  const summaryPayload: ReviewSummaryPayload = {
                    kind: "review_summary",
                    title: validated.title,
                    estimatedReadingMinutes:
                      typeof validated.estimatedReadingMinutes === "number" &&
                      validated.estimatedReadingMinutes > 0
                        ? validated.estimatedReadingMinutes
                        : summaryInput.generationContext.targetMinutes,
                    overview: normalizeEducationalContent(validated.overview),
                    sections: validated.sections.map((s): ReviewSummarySection => {
                      let comparisons: ReviewSummaryComparison[] | string[] | undefined;
                      if (s.comparisons && Array.isArray(s.comparisons)) {
                        if (s.comparisons.length > 0 && typeof s.comparisons[0] === "string") {
                          comparisons = (s.comparisons as string[]).map((c) => normalizeEducationalContent(c));
                        } else {
                          comparisons = (s.comparisons as ReviewSummaryComparison[]).map((cmp) => ({
                            ...cmp,
                            keyDifferences: normalizeEducationalContent(cmp.keyDifferences),
                          }));
                        }
                      }
                      return {
                        ...s,
                        keyPoints: s.keyPoints.map((kp) => normalizeEducationalContent(kp)),
                        mechanisms: s.mechanisms?.map((m) => normalizeEducationalContent(m)),
                        classifications: s.classifications?.map((c) => normalizeEducationalContent(c)),
                        memorizationPoints: s.memorizationPoints?.map((mp) => normalizeEducationalContent(mp)),
                        examPoints: s.examPoints?.map((ep) => normalizeEducationalContent(ep)),
                        comparisons,
                      };
                    }),
                    finalTakeaways: validated.finalTakeaways.map((ft) => normalizeEducationalContent(ft)),
                    citationChunkIds: validated.citationChunkIds ?? [],
                    targetReadingMinutes: summaryInput.generationContext.targetMinutes,
                  };

                  process.stdout.write(
                    `[GENERATION] validation_passed: stage=review_summary chunkKey=${chunkKey} correlationId=${summaryCorrelationId} sectionsCount=${validated.sections.length}\n`,
                  );

                  return {
                    payload: summaryPayload,
                    usage: res.usage,
                  };
                },
              );

              payload = summaryRes.payload;
              typeUsage = {
                inputTokens: summaryRes.usage.inputTokens,
                outputTokens: summaryRes.usage.outputTokens,
              };

              const completedAt = new Date().toISOString();
              await this.chunkRecordStore.upsert({
                id: existingSummaryChunk?.id ?? randomUUID(),
                organizationId,
                documentId,
                courseId: targetCourseId ?? doc.courseId,
                stage: "review_summary",
                chunkIndex: 0,
                chunkKey,
                status: "completed",
                payload,
                tokenUsage: typeUsage,
                attempts: (existingSummaryChunk?.attempts ?? 0) + 1,
                createdAt: existingSummaryChunk?.createdAt ?? nowChunk,
                updatedAt: completedAt,
                completedAt,
              });

              process.stdout.write(
                `[GENERATION] persistence_completed: stage=review_summary chunkKey=${chunkKey} documentId=${documentId}\n`,
              );

              await this.progressService.completeStage(documentId, organizationId, "summary");
            } catch (err) {
              await this.chunkRecordStore.upsert({
                id: existingSummaryChunk?.id ?? randomUUID(),
                organizationId,
                documentId,
                courseId: targetCourseId ?? doc.courseId,
                stage: "review_summary",
                chunkIndex: 0,
                chunkKey,
                status: "failed",
                errorCode: this.resolveErrorCode(err),
                errorMessage: err instanceof Error ? err.message : String(err),
                attempts: (existingSummaryChunk?.attempts ?? 0) + 1,
                createdAt: existingSummaryChunk?.createdAt ?? nowChunk,
                updatedAt: new Date().toISOString(),
              });
              throw err;
            }
          }
        } else {
          continue;
        }

        const groundedPayload = this.groundCitations(
          payload,
          chunks.map((c) => c.id),
        );

        // Delete any existing draft for this type
        await this.generatedContentStore.deleteDraftsByDocumentAndType(
          documentId,
          type,
          organizationId,
        );

        const record: GeneratedContentRecord = {
          id: randomUUID() as GeneratedContentId,
          organizationId,
          documentId,
          courseId: (targetCourseId || doc.courseId) as CourseId,
          type,
          status: "draft",
          payload: groundedPayload,
          promptVersion,
          model,
          tokenUsage: typeUsage,
          generationKey: generationKey ?? null,
          acceptedAt: null,
          acceptedBy: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          editedBy: null,
          editedAt: null,
          previousPayload: null,
          materializedLessonId: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        await this.generatedContentStore.create(record);

        const citationChunkIds = (
          groundedPayload as { citationChunkIds: string[] }
        ).citationChunkIds;
        await this.citationStore.createMany(
          citationChunkIds.map((chunkId) => ({
            generatedContentId: record.id,
            documentChunkId: chunkId as DocumentChunkId,
          })),
        );

        process.stdout.write(
          `[GENERATION] draft_persisted: documentId=${documentId} type=${type} contentId=${record.id} citationsCount=${citationChunkIds.length}\n`,
        );

        contents.push(record);
      }

      // Transition document status generating → review_pending
      const nowSuccess = new Date().toISOString();
      await this.documentStore.update({
        ...doc,
        status: "review_pending",
        errorCode: null,
        updatedAt: nowSuccess,
      });
      docStatus = "review_pending";
      await this.progressService.startStage(documentId, organizationId, "review", 1);

      process.stdout.write(
        `[GENERATION] generation_completed: documentId=${documentId} contentsCount=${contents.length}\n`,
      );

      if (this.auditService) {
        await this.auditService.emit(
          contents.map((c) =>
            auditContentGenerated(actor.userId, organizationId, c.id, {
              documentId,
              type: c.type,
              model: c.model ?? "mock",
              promptVersion,
              sourceChunkCount: chunks.length,
            }),
          ),
        );
      }

      if (this.notificationService) {
        void this.notificationService.notifyGenerationCompleted(actor.userId, {
          jobId: input.jobId,
          documentId,
          courseId: input.courseId ?? doc.courseId ?? undefined,
          types: contents.map((c) => c.type),
        });
      }
    } catch (err) {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      if (
        err instanceof GenerationStoppedError ||
        (err instanceof Error && err.name === "GenerationStoppedError")
      ) {
        process.stdout.write(
          `[GENERATION] pipeline stopped cleanly: documentId=${documentId} jobId=${input.jobId}\n`,
        );
        const updatedDoc = await this.requireDocument(organizationId, documentId);
        if (updatedDoc.status === "generating") {
          const existingDrafts = await this.generatedContentStore.listByDocument(documentId, organizationId);
          const newDocStatus = existingDrafts.length > 0 ? "review_pending" : "extracted";
          await this.documentStore.update({
            ...updatedDoc,
            status: newDocStatus,
            errorCode: null,
            updatedAt: new Date().toISOString(),
          });
          docStatus = newDocStatus;
        } else {
          docStatus = updatedDoc.status;
        }

        const resources = await Promise.all(
          contents.map((c) => this.toResource(c)),
        );
        return { contents: resources, document_status: docStatus };
      }

      if (
        err instanceof GenerationDeletedError ||
        (err instanceof Error && err.name === "GenerationDeletedError")
      ) {
        process.stdout.write(
          `[GENERATION] pipeline aborted due to deletion: documentId=${documentId} jobId=${input.jobId}\n`,
        );
        const updatedDoc = await this.requireDocument(organizationId, documentId);
        return { contents: [], document_status: updatedDoc.status };
      }

      const nowErr = new Date().toISOString();
      const errorCode = this.resolveErrorCode(err);
      process.stderr.write(
        `[GENERATION] generation_failed: documentId=${documentId} error=${err instanceof Error ? err.message : String(err)} code=${errorCode}\n`,
      );
      await this.progressService.fail(
        documentId,
        organizationId,
        err instanceof Error ? err.message : String(err),
      );
      await this.documentStore.update({
        ...doc,
        status: "failed",
        errorCode,
        retryCount: (doc.retryCount || 0) + 1,
        updatedAt: nowErr,
      });
      if (this.auditService) {
        await this.auditService.emit([
          auditGenerationFailed(actor.userId, organizationId, documentId, {
            type: "lesson",
            errorCode,
            retryCount: (doc.retryCount || 0) + 1,
          }),
        ]);
      }
      if (this.notificationService) {
        void this.notificationService.notifyGenerationFailed(actor.userId, {
          jobId: input.jobId,
          documentId,
          courseId: input.courseId ?? doc.courseId ?? undefined,
          errorCode,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }

    const resources = await Promise.all(
      contents.map((c) => this.toResource(c)),
    );

    return { contents: resources, document_status: docStatus };
  }

  /**
   * List generated contents for a document (org-scoped).
   */
  async listByDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<GeneratedContentResource[]> {
    await this.authorize(actor, organizationId, "content:review");
    await this.requireDocument(organizationId, documentId);

    const records = await this.generatedContentStore.listByDocument(
      documentId,
      organizationId,
    );
    return Promise.all(records.map((r) => this.toResource(r)));
  }

  /**
   * Get a single generated content with citations (org-scoped).
   */
  async getGeneratedContent(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    contentId: GeneratedContentId,
  ): Promise<GeneratedContentResource> {
    await this.authorize(actor, organizationId, "content:review");
    await this.requireDocument(organizationId, documentId);

    const record = await this.generatedContentStore.findByIdForOrganization(
      contentId,
      organizationId,
    );
    if (!record || record.documentId !== documentId) {
      throw new DomainError("not_found", "Generated content not found");
    }

    return this.toResource(record);
  }

  /**
   * Directly generates or fetches the Review Summary for a document.
   * Caches and prevents duplicates unless force=true is requested.
   */
  async generateReviewSummaryDirect(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    options?: {
      force?: boolean;
      promptVersion?: string;
      courseId?: CourseId;
      generationKey?: string;
      generationContext?: GenerationContext;
    },
  ): Promise<GeneratedContentResource> {
    await this.authorize(actor, organizationId, "content:generate");

    // Central Invariant: Admin generation = Gemini ONLY
    if (options?.generationContext === "admin") {
      if (
        isDeepSeekProvider(this.gateway) ||
        (this.gateway.provider !== "gemini" && this.gateway.provider !== "mock")
      ) {
        throw new DomainError(
          "bad_request",
          `Admin generation invariant violation: Admin content generation must strictly use Gemini gateway (current provider: ${this.gateway.provider}, model: ${this.gateway.model ?? "unknown"}).`,
        );
      }
    }

    const doc = await this.requireDocument(organizationId, documentId);

    if (!options?.force) {
      const existing = await this.generatedContentStore.listByDocument(
        documentId,
        organizationId,
      );
      const existingSummary = existing.find(
        (c) =>
          c.type === "review_summary" &&
          c.deletedAt === null &&
          c.status !== "rejected",
      );
      if (existingSummary) {
        return this.toResource(existingSummary);
      }
    }

    const chunks = await this.chunkStore.listByDocument(documentId);
    if (chunks.length === 0) {
      throw new DomainError(
        "conflict",
        "Document has no chunks available to cite. Please extract text first.",
      );
    }

    const promptVersion = options?.promptVersion ?? "v1";
    const now = new Date().toISOString();
    const correlationId = randomUUID();

    const targetCourseId = options?.courseId || doc.courseId;
    const currentChunkSet = new Set(chunks.map((c) => c.id));

    const chunkKey = "review_summary";
    const claim = await this.acquireOrWaitForChunk<ReviewSummaryPayload>({
      organizationId,
      documentId,
      courseId: targetCourseId ?? doc.courseId,
      stage: "review_summary",
      chunkIndex: 0,
      chunkKey,
    });

    if (!options?.force && claim.status === "completed") {
      const isStale =
        !claim.payload ||
        !Array.isArray((claim.payload as ReviewSummaryPayload).citationChunkIds) ||
        (claim.payload as ReviewSummaryPayload).citationChunkIds.some(
          (id) => !currentChunkSet.has(id),
        );

      if (!isStale) {
        const existingContents = await this.generatedContentStore.listByDocument(
          documentId,
          organizationId,
        );
        const existingSummary = existingContents.find(
          (c) =>
            c.type === "review_summary" &&
            c.deletedAt === null &&
            c.status !== "rejected" &&
            c.status !== "regenerating",
        );
        if (existingSummary) {
          return this.toResource(existingSummary);
        }
      }
    }

    const existingSummaryChunk = claim.record;
    const nowChunk = existingSummaryChunk?.updatedAt || now;

    try {
      // Check for existing Stage 1 Planning & Stage 2 Lessons
      const existingContents = await this.generatedContentStore.listByDocument(
        documentId,
        organizationId,
      );
      const existingLesson = existingContents.find(
        (c) =>
          c.type === "lesson" &&
          c.deletedAt === null &&
          c.status !== "rejected",
      );

      if (!existingLesson) {
        throw new DomainError(
          "bad_request",
          "STAGE5_MISSING_LESSONS: Stage 2 lessons must be generated before generating a review summary.",
        );
      }

      let contentPlan: ContentPlan;
      let generatedSessions: Array<{
        title: string;
        contentMarkdown: string;
        citationChunkIds: string[];
      }>;

      const isLessonCurrent = isLessonChunkSetCurrent(
        existingLesson.payload,
        currentChunkSet,
      );

      if (isLessonCurrent) {
        const lessonPayload = existingLesson.payload as LessonPayload;
        const lessonSessions = lessonPayload.sessions || [];
        if (lessonSessions.length === 0) {
          throw new DomainError(
            "bad_request",
            "STAGE5_MISSING_LESSONS: Stage 2 lessons must be generated before generating a review summary.",
          );
        }

        // Check for Stage 1 planning artifacts
        const coverageReport = lessonPayload.coverageReport;
        const outline = lessonPayload.outline || [];
        if (!coverageReport && outline.length === 0) {
          throw new DomainError(
            "bad_request",
            "STAGE5_MISSING_PLANNING: Stage 1 content planning must be completed before generating a review summary.",
          );
        }

        // Reconstruct canonical ContentPlan from persisted lesson artifacts
        const sourceTopics = (
          coverageReport?.sourceTopicsIdentified ||
          outline.map((o) => ({
            title: o.title,
            description: o.description || "",
          }))
        ).map((st, idx) => ({
          id: `topic-${idx + 1}`,
          title: st.title,
          description: st.description || "",
          category: (st as { category?: string }).category,
          relevantChunkIds:
            (st as { relevantChunkIds?: string[] }).relevantChunkIds ||
            chunks.map((c) => c.id),
        }));

        const sessions: ContentPlan["sessions"] = lessonSessions.map((s, idx) => {
          const audit = coverageReport?.sessionsAudit?.[idx];
          const coreConcepts = audit?.keyConcepts || [];
          const relevantChunkIds =
            s.citationChunkIds && s.citationChunkIds.length > 0
              ? s.citationChunkIds
              : chunks.map((c) => c.id);
          return {
            index: idx,
            title: s.title,
            description: outline[idx]?.description || "",
            coreConcepts,
            relevantChunkIds,
            targetFlashcardCount: 5,
            targetQuizCount: 3,
          };
        });

        contentPlan = {
          moduleTitle: lessonPayload.moduleTitle || doc.originalName,
          sourceTopics,
          sessions,
          highYieldFacts: [],
        };

        generatedSessions = lessonSessions.map((s) => ({
          title: s.title,
          contentMarkdown: s.contentMarkdown,
          citationChunkIds: s.citationChunkIds || [],
        }));
      } else {
        // Stale lesson detected! Rebuild upstream dependencies automatically:
        process.stdout.write(
          `[generation-service] Stale lesson detected for document ${documentId}. Regenerating planning and lessons using current chunk set.\n`,
        );

        // Invalidate/delete stale lesson draft for this document
        await this.generatedContentStore.deleteDraftsByDocumentAndType(
          documentId,
          "lesson",
          organizationId,
        );

        const budget = calculateGenerationBudget({
          totalTokens: chunks.reduce((acc, c) => acc + (c.tokenEstimate || 500), 0),
          totalCharacters: chunks.reduce((acc, c) => acc + c.content.length, 0),
          chunkCount: chunks.length,
        });

        // Step 1: Planning (Stage 1) - automatically detects and evicts stale planning cache
        const planningRes = await this.extractContentPlan(
          doc,
          chunks,
          budget,
          promptVersion,
          correlationId,
          organizationId,
          documentId,
          targetCourseId ?? undefined,
        );
        contentPlan = planningRes.contentPlan;

        // Step 2: Lessons (Stage 2) - batched per session on current chunks
        const sessionBatchRes = await this.generateSessionsBatched(
          doc,
          contentPlan.sessions,
          chunks,
          budget,
          promptVersion,
          correlationId,
          organizationId,
          documentId,
          targetCourseId ?? undefined,
        );
        generatedSessions = sessionBatchRes.sessions;

        // Step 3: Persist fresh regenerated lesson draft
        const outlineListing = planningRes.outline
          .map((item, idx) => `${idx + 1}. **${item.title}**: ${item.description}`)
          .join("\n");
        const cleanPlanTitle = cleanEducationalTitle(
          planningRes.moduleTitle,
          "درسنامه آموزشی جامع",
        );
        const masterMarkdown = [
          `# ${cleanPlanTitle}`,
          `## فهرست جلسات آموزشی`,
          outlineListing,
          `---`,
          ...generatedSessions.map((s) => s.contentMarkdown),
        ].join("\n\n");

        const allSessionCitations = Array.from(
          new Set(generatedSessions.flatMap((s) => s.citationChunkIds)),
        );

        const { coverageReport } = await this.auditAndBuildCoverageReport(
          contentPlan,
          generatedSessions,
          new Map(),
          new Map(),
          chunks,
          budget,
        );

        const newLessonPayload: GeneratedContentPayload = {
          kind: "lesson",
          moduleTitle: cleanPlanTitle,
          title: cleanPlanTitle,
          outline: planningRes.outline,
          sessions: generatedSessions,
          contentMarkdown: masterMarkdown,
          citationChunkIds:
            allSessionCitations.length > 0
              ? allSessionCitations
              : planningRes.citationChunkIds,
          coverageReport,
        };

        const groundedLessonPayload = this.groundCitations(
          newLessonPayload,
          chunks.map((c) => c.id),
        );

        const newLessonRecord: GeneratedContentRecord = {
          id: randomUUID() as GeneratedContentId,
          organizationId,
          documentId,
          courseId: (targetCourseId || doc.courseId) as CourseId,
          type: "lesson",
          status: "draft",
          payload: groundedLessonPayload,
          materializedLessonId: null,
          promptVersion,
          model: planningRes.model,
          tokenUsage: {
            inputTokens: planningRes.usage.inputTokens + sessionBatchRes.usage.inputTokens,
            outputTokens: planningRes.usage.outputTokens + sessionBatchRes.usage.outputTokens,
          },
          generationKey: options?.generationKey ?? null,
          acceptedAt: null,
          acceptedBy: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          editedBy: null,
          editedAt: null,
          previousPayload: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };

        const existingActiveContents = await this.generatedContentStore.listByDocument(
          documentId,
          organizationId,
        );
        const currentValidLesson = existingActiveContents.find(
          (c) =>
            c.type === "lesson" &&
            c.deletedAt === null &&
            isLessonChunkSetCurrent(c.payload, currentChunkSet),
        );

        if (!currentValidLesson) {
          // Delete any existing stale draft for lesson before persisting fresh one
          await this.generatedContentStore.deleteDraftsByDocumentAndType(
            documentId,
            "lesson",
            organizationId,
          );

          await this.generatedContentStore.create(newLessonRecord);
          const lessonCitations = (groundedLessonPayload as { citationChunkIds?: string[] })?.citationChunkIds;
          if (Array.isArray(lessonCitations) && lessonCitations.length > 0) {
            await this.citationStore.createMany(
              lessonCitations.map((chunkId) => ({
                generatedContentId: newLessonRecord.id,
                documentChunkId: chunkId as DocumentChunkId,
              })),
            );
          }
        }
      }

      const totalTokens = chunks.reduce(
        (acc, c) => acc + (c.tokenEstimate || 500),
        0,
      );

      const summaryInput = this.buildReviewSummaryGenerationInput(
        doc,
        chunks,
        contentPlan,
        generatedSessions,
        totalTokens,
        options?.generationKey || correlationId,
      );
      validateReviewSummaryInput(summaryInput);

      await this.progressService.startStage(documentId, organizationId, "summary", 1);

      const prompt = buildReviewSummaryUserPrompt(summaryInput);

      process.stdout.write(
        `[GENERATION] stage_started: documentId=${documentId} stage=review_summary correlationId=${correlationId}\n`,
      );
      process.stdout.write(
        `[GENERATION] provider_request_started: stage=review_summary correlationId=${correlationId}\n`,
      );

      const response = await this.gateway.complete({
        promptVersion,
        messages: [
          {
            role: "system",
            content: REVIEW_SUMMARY_SYSTEM_PROMPT,
          },
          { role: "user", content: prompt },
        ],
        jsonSchema: { type: "review_summary" },
        correlationId,
        organizationId,
        documentId,
        stage: "review_summary",
      });

      process.stdout.write(
        `[GENERATION] provider_response_received: stage=review_summary correlationId=${correlationId} inputTokens=${response.usage?.inputTokens ?? 0} outputTokens=${response.usage?.outputTokens ?? 0}\n`,
      );

      process.stdout.write(
        `[GENERATION] parsing_started: stage=review_summary correlationId=${correlationId}\n`,
      );
      const rawPayload = this.cleanAndParseJson<unknown>(
        response.text,
        "review_summary",
      );
      const validated = validateReviewSummaryPayload(rawPayload);

      process.stdout.write(
        `[GENERATION] validation_passed: stage=review_summary correlationId=${correlationId} sectionsCount=${validated.sections.length}\n`,
      );

      const fullPayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: validated.title,
        estimatedReadingMinutes:
          typeof validated.estimatedReadingMinutes === "number" &&
          validated.estimatedReadingMinutes > 0
            ? validated.estimatedReadingMinutes
            : summaryInput.generationContext.targetMinutes,
        overview: validated.overview,
        sections: validated.sections,
        finalTakeaways: validated.finalTakeaways,
        citationChunkIds: validated.citationChunkIds ?? [],
        targetReadingMinutes: summaryInput.generationContext.targetMinutes,
      };

      const groundedPayload = this.groundCitations(
        fullPayload,
        chunks.map((c) => c.id),
      );

      await this.generatedContentStore.deleteDraftsByDocumentAndType(
        documentId,
        "review_summary",
        organizationId,
      );

      const record: GeneratedContentRecord = {
        id: randomUUID() as GeneratedContentId,
        organizationId,
        documentId,
        courseId: targetCourseId as CourseId,
        type: "review_summary",
        status: "draft",
        payload: groundedPayload,
        promptVersion,
        model: response.model,
        tokenUsage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
        generationKey: options?.generationKey ?? null,
        acceptedAt: null,
        acceptedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null,
        editedBy: null,
        editedAt: null,
        previousPayload: null,
        materializedLessonId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      await this.generatedContentStore.create(record);

      process.stdout.write(
        `[GENERATION] draft_persisted: documentId=${documentId} type=review_summary contentId=${record.id}\n`,
      );

      const completedAt = new Date().toISOString();
      await this.chunkRecordStore.upsert({
        id: existingSummaryChunk?.id ?? randomUUID(),
        organizationId,
        documentId,
        courseId: targetCourseId ?? doc.courseId,
        stage: "review_summary",
        chunkIndex: 0,
        chunkKey,
        status: "completed",
        payload: groundedPayload,
        tokenUsage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
        attempts: (existingSummaryChunk?.attempts ?? 0) + 1,
        createdAt: existingSummaryChunk?.createdAt ?? nowChunk,
        updatedAt: completedAt,
        completedAt,
      });

      await this.progressService.completeStage(documentId, organizationId, "summary");

      const citationChunkIds = (
        groundedPayload as { citationChunkIds: string[] }
      ).citationChunkIds;
      if (citationChunkIds && citationChunkIds.length > 0) {
        await this.citationStore.createMany(
          citationChunkIds.map((chunkId) => ({
            generatedContentId: record.id,
            documentChunkId: chunkId as DocumentChunkId,
          })),
        );
      }

      if (this.auditService) {
        await this.auditService.emit([
          auditContentGenerated(actor.userId, organizationId, record.id, {
            documentId,
            type: "review_summary",
            model: record.model ?? "mock",
            promptVersion,
            sourceChunkCount: chunks.length,
          }),
        ]);
      }

      return this.toResource(record);
    } catch (err) {
      // If there was an unaccepted review summary in "regenerating" status, restore to "draft" on failure so it can be discovered and retried
      try {
        const docContents = await this.generatedContentStore.listByDocument(documentId, organizationId);
        const regeneratingSummary = docContents.find(
          (c) => c.type === "review_summary" && c.deletedAt === null && c.status === "regenerating",
        );
        if (regeneratingSummary) {
          await this.generatedContentStore.update({
            ...regeneratingSummary,
            status: "draft",
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        // Non-blocking rollback
      }

      await this.chunkRecordStore.upsert({
        id: existingSummaryChunk?.id ?? randomUUID(),
        organizationId,
        documentId,
        courseId: targetCourseId ?? doc.courseId,
        stage: "review_summary",
        chunkIndex: 0,
        chunkKey,
        status: "failed",
        errorCode: this.resolveErrorCode(err),
        errorMessage: err instanceof Error ? err.message : String(err),
        attempts: (existingSummaryChunk?.attempts ?? 0) + 1,
        createdAt: existingSummaryChunk?.createdAt ?? nowChunk,
        updatedAt: new Date().toISOString(),
      });
      throw err;
    }
  }

  /**
   * Fetches the generated Review Summary for a document if one exists.
   */
  async getReviewSummaryForDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    courseId?: CourseId,
  ): Promise<GeneratedContentResource | undefined> {
    let targetOrgId = organizationId;

    if (courseId && this.courseStore) {
      const course = await this.courseStore.findByIdForUser(
        courseId,
        actor.userId,
        this.systemOrganizationId,
      );
      if (!course) {
        throw new DomainError("not_found", "Course not found");
      }
      targetOrgId = (course.organizationId || (course as { organization_id?: OrganizationId }).organization_id) as OrganizationId;

      if (this.entitlementService) {
        const access = await this.entitlementService.checkAccess(actor, {
          userId: actor.userId,
          resourceType: "document",
          resourceId: documentId,
          courseId,
        });
        if (!access.granted) {
          throw new DomainError(
            "forbidden",
            "برای دسترسی به خلاصه مروری این فصل، خرید دوره یا فعال‌سازی اشتراک الزامی است.",
          );
        }
      }
    } else {
      await this.authorize(actor, organizationId, "content:review");

      if (this.entitlementService && actor.role !== "platform_admin" && actor.role !== "organization_admin") {
        const doc = this.documentStore
          ? await this.documentStore.findByIdForOrganization(documentId, targetOrgId).catch(() => undefined)
          : undefined;
        if (doc && doc.ownerUserId !== actor.userId) {
          const access = await this.entitlementService.checkAccess(actor, {
            userId: actor.userId,
            resourceType: "document",
            resourceId: documentId,
            courseId: doc.courseId ?? undefined,
          });
          if (!access.granted) {
            throw new DomainError(
              "forbidden",
              "برای دسترسی به خلاصه مروری این فصل، خرید دوره یا فعال‌سازی اشتراک الزامی است.",
            );
          }
        }
      }
    }

    // Check if an active summary exists (including decoupled summaries where source document was soft-deleted)
    const contents = await this.generatedContentStore.listByDocument(
      documentId,
      targetOrgId,
    );

    const activeSummaries = contents.filter(
      (c) =>
        c.type === "review_summary" &&
        c.deletedAt === null &&
        c.status !== "rejected",
    );

    // Prefer newest active draft/revision for review/editing, followed by accepted
    activeSummaries.sort((a, b) => {
      const isDraftA = a.status === "draft" || a.status === "edited" || a.status === "regenerating";
      const isDraftB = b.status === "draft" || b.status === "edited" || b.status === "regenerating";
      if (isDraftA && !isDraftB) return -1;
      if (!isDraftA && isDraftB) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const summary = activeSummaries[0];

    if (summary) {
      if (courseId && summary.courseId && summary.courseId !== courseId) {
        throw new DomainError("not_found", "Document not found in course");
      }
      return this.toResource(summary);
    }

    // If no summary was found, ensure the document exists and belongs to the organization (or throw 404)
    const doc = await this.requireDocument(targetOrgId, documentId);
    if (courseId && doc.courseId && doc.courseId !== courseId) {
      throw new DomainError("not_found", "Document not found in course");
    }

    return undefined;
  }

  private resolveErrorCode(err: unknown): string {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      typeof (err as { code: unknown }).code === "string"
    ) {
      return (err as { code: string }).code;
    }
    return "generation_failed";
  }

  /**
   * Stop an active or queued generation job at the next safe point (PR Real Stop).
   * Delegated to GenerationLifecycleService.
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
    return this.lifecycleService.stopGenerationJob(
      actor,
      organizationId,
      jobId,
    );
  }

  /**
   * Stop any active generation job associated with a document.
   * Delegated to GenerationLifecycleService.
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
    return this.lifecycleService.stopGenerationForDocument(
      actor,
      organizationId,
      documentId,
    );
  }

  /**
   * Safely delete a generation job, cancel in-flight work, and clean up transient chunks/drafts
   * without deleting the parent Document or accepted contents (PR Real Delete).
   * Delegated to GenerationLifecycleService.
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
    return this.lifecycleService.deleteGenerationJob(
      actor,
      organizationId,
      jobId,
    );
  }

  /**
   * Delete generation processes and transient drafts for a document.
   * Delegated to GenerationLifecycleService.
   */
  async deleteGenerationForDocument(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<{
    status: "deleted";
    previousStatus?: GenerationJobStatus;
  }> {
    return this.lifecycleService.deleteGenerationForDocument(
      actor,
      organizationId,
      documentId,
    );
  }
}
