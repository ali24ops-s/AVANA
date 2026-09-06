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
  type QuizId,
  DomainError,
  defaultPolicy,
  auditContentGenerated,
  auditGenerationFailed,
  type GeneratedContentType,
  type GeneratedContentPayload,
  type LessonPayload,
  type FlashcardPayload,
  type QuizPayload,
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
  resolveCorrectChoiceText,
  type GenerationChunkRecord,
  type GenerationChunkStage,
  type GenerationProgress,
  type DocumentGenerationProgressResource,
  type GenerationProgressStatus,
  type GenerationPipelineStage,
  DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  normalizeEducationalContent,
  isLessonChunkSetCurrent,
} from "@avana/domain";
import {
  CONTENT_PLANNING_SYSTEM_PROMPT,
  buildContentPlanningUserPrompt,
  LESSON_GENERATION_SYSTEM_PROMPT,
  buildLessonGenerationUserPrompt,
  FLASHCARD_GENERATION_SYSTEM_PROMPT,
  buildFlashcardGenerationUserPrompt,
  QUIZ_GENERATION_SYSTEM_PROMPT,
  buildQuizGenerationUserPrompt,
  REVIEW_SUMMARY_SYSTEM_PROMPT,
  buildReviewSummaryUserPrompt,
} from "./prompt-registry.js";
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
import type { ModelGateway } from "./gateway/index.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

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

export type DocumentContentStatusResource = {
  request_id: string;
  document_id: DocumentId;
  course_id: CourseId | null;
  lesson: { generated: boolean; count: number; accepted?: boolean };
  flashcards: { generated: boolean; count: number; accepted?: boolean };
  exam: { generated: boolean; count: number; accepted?: boolean };
  review_summary?: { generated: boolean; count: number; accepted?: boolean };
  progress?: GenerationProgress;
  generationProgress?: DocumentGenerationProgressResource;
  can_generate: boolean;
  all_generated: boolean;
  has_publishable_content?: boolean;
};

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
  ) {
    this.chunkRecordStore =
      generationChunkStore ?? new InMemoryGenerationChunkStore();
    this.generationJobStore = generationJobStore;
    this.progressService =
      generationProgressService ??
      new GenerationProgressService(new InMemoryGenerationProgressStore());
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
    if (!jobId || !organizationId || !this.generationJobStore) {
      return;
    }

    const job = await this.generationJobStore.findByIdForOrganization(
      jobId as any,
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
   */
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
   */
  private cleanAndParseJson<T>(text: string, typeDesc: string): T {
    if (!text || text.trim().length === 0) {
      if (typeDesc.includes("review_summary") || typeDesc.includes("summary")) {
        throw new DomainError(
          "unprocessable",
          `STAGE5_INVALID_MODEL_JSON: Model returned an empty response for ${typeDesc}`,
        );
      }
      throw new DomainError(
        "unprocessable",
        `Model returned an empty response for ${typeDesc}`,
      );
    }

    let jsonStr = text.trim();
    const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      jsonStr = jsonBlockMatch[1].trim();
    } else {
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      const firstBracket = jsonStr.indexOf("[");
      const lastBracket = jsonStr.lastIndexOf("]");

      if (
        firstBracket !== -1 &&
        lastBracket !== -1 &&
        lastBracket > firstBracket &&
        (firstBrace === -1 || firstBracket < firstBrace)
      ) {
        jsonStr = jsonStr.slice(firstBracket, lastBracket + 1).trim();
      } else if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1).trim();
      }
    }

    const normalizeResult = (val: unknown): unknown => {
      if (Array.isArray(val)) {
        if (typeDesc.includes("flashcard")) {
          return { kind: "flashcards_batch", cards: val };
        }
        if (typeDesc.includes("quiz")) {
          return { kind: "quizzes_batch", questions: val };
        }
        if (typeDesc.includes("session")) {
          return { kind: "sessions_batch", sessions: val };
        }
      }
      return val;
    };

    // Helper to safely preserve single-backslash LaTeX commands inside JSON string literals
    // Prevents JSON.parse from converting \t (in \text), \b (in \beta), \f (in \frac), \r (in \rho), \n (in \neq) into control characters
    const sanitizeLatexBackslashesInJson = (raw: string): string => {
      return raw.replace(/"((?:[^"\\]|\\.)*)"/gs, (stringLiteral) => {
        return stringLiteral.replace(
          /(?<!\\)\\(text|textbf|textit|textrm|textsf|texttt|beta|bar|binom|bullet|frac|forall|flat|rho|rightarrow|right|rangle|neq|nabla|nu|not|neg|alpha|gamma|theta|sigma|omega|delta|Delta|mu|lambda|pi|partial|times|le|ge|pm|approx|cdot|infty|sqrt|sum|int|lim|to|leftarrow|left|langle|cup|cap|subset|subseteq|in|notin|subset|exists|emptyset|log|ln|sin|cos|tan)(?![a-zA-Z])/g,
          "\\\\$1",
        );
      });
    };

    const latexSafeJson = sanitizeLatexBackslashesInJson(jsonStr);

    // Attempt 1: Standard JSON parse with LaTeX escape protection
    try {
      const parsed = normalizeResult(JSON.parse(latexSafeJson));
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as T;
      }
    } catch {
      // Continue to cleanup attempts
    }

    // Attempt 2: Remove trailing commas
    try {
      const noTrailingCommas = jsonStr.replace(/,\s*([}\]])/g, "$1");
      const parsed = normalizeResult(JSON.parse(noTrailingCommas));
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as T;
      }
    } catch {
      // Continue
    }

    // Attempt 3: Fix unescaped newlines and tabs inside string literals
    try {
      const escapedStrings = jsonStr
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/"((?:[^"\\]|\\.)*)"/gs, (match) => {
          return match
            .replace(/\r\n/g, "\\n")
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\n")
            .replace(/\t/g, "\\t");
        });
      const parsed = normalizeResult(JSON.parse(escapedStrings));
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as T;
      }
    } catch {
      // Continue
    }

    // Attempt 4: Fix unescaped control chars
    try {
      const sanitized = jsonStr
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/"((?:[^"\\]|\\.)*)"/gs, (match) => {
          return match
            .replace(/\r\n/g, "\\n")
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\n")
            .replace(/\t/g, "\\t");
        })
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      const parsed = JSON.parse(sanitized);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as T;
      }
    } catch {
      // Continue
    }

    // Attempt 5: Comprehensive fallback parsing per content type
    if (typeDesc.includes("sessions_batch")) {
      const sessionsMatch = [
        ...jsonStr.matchAll(
          /{\s*"index"\s*:\s*(\d+)[\s\S]*?"title"\s*:\s*"([^"]+)"[\s\S]*?"contentMarkdown"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"citationChunkIds"|\s*})/g,
        ),
      ];
      if (sessionsMatch.length > 0) {
        const sessions = sessionsMatch.map((m) => ({
          index: parseInt(m[1], 10),
          title: m[2],
          contentMarkdown: m[3]
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\"),
          citationChunkIds: [],
        }));
        return {
          kind: "sessions_batch",
          sessions,
          citationChunkIds: [],
        } as T;
      }
    }

    if (typeDesc.includes("session")) {
      const titleMatch =
        jsonStr.match(/"title"\s*:\s*"([^"]+)"/i) ||
        text.match(/"title"\s*:\s*"([^"]+)"/i);

      let content = "";
      const contentMatch = jsonStr.match(
        /"contentMarkdown"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"citationChunkIds"|\s*,\s*"kind"|\s*})/,
      );
      if (contentMatch && contentMatch[1]) {
        content = contentMatch[1];
      } else {
        const idx = jsonStr.indexOf('"contentMarkdown"');
        if (idx !== -1) {
          const after = jsonStr.slice(idx + 17);
          const startQuote = after.indexOf('"');
          if (startQuote !== -1) {
            const rawContent = after.slice(startQuote + 1);
            const endCitation = rawContent.lastIndexOf('"citationChunkIds"');
            if (endCitation !== -1) {
              content = rawContent.slice(0, endCitation).replace(/",\s*$/, "").trim();
            } else {
              content = rawContent.replace(/"\s*}\s*$/, "").trim();
            }
          }
        }
      }

      const finalContent = content || text;
      const unescaped = finalContent
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      let citationChunkIds: string[] = [];
      const citMatch =
        jsonStr.match(/"citationChunkIds"\s*:\s*(\[[^\]]*\])/) ||
        text.match(/"citationChunkIds"\s*:\s*(\[[^\]]*\])/);
      if (citMatch && citMatch[1]) {
        try {
          citationChunkIds = JSON.parse(citMatch[1]);
        } catch {
          // ignore
        }
      }

      return {
        kind: "session",
        title: titleMatch ? titleMatch[1] : undefined,
        contentMarkdown: unescaped,
        citationChunkIds,
      } as T;
    }

    if (typeDesc.includes("flashcard")) {
      const cardMatches = [
        ...jsonStr.matchAll(
          /{\s*(?:"sessionIndex"\s*:\s*(\d+)\s*,\s*)?"question"\s*:\s*"([\s\S]*?)"\s*,\s*"answer"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"explanation"\s*:\s*"([\s\S]*?)")?(?:\s*,\s*"cardType"\s*:\s*"([\s\S]*?)")?(?:\s*,\s*"difficulty"\s*:\s*"([\s\S]*?)")?\s*}/g,
        ),
      ];
      if (cardMatches.length > 0) {
        const cards = cardMatches.map((m) => ({
          sessionIndex: m[1] ? parseInt(m[1], 10) : undefined,
          question: m[2].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
          answer: m[3].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
          explanation: m[4] ? m[4].replace(/\\"/g, '"').replace(/\\n/g, "\n") : undefined,
          cardType: (m[5] as unknown as "key_fact") || "key_fact",
          difficulty: (m[6] as unknown as "medium") || "medium",
        }));
        return {
          kind: "flashcards_batch",
          cards,
          citationChunkIds: [],
        } as T;
      }
    }

    if (typeDesc.includes("quiz")) {
      const qMatches = [
        ...jsonStr.matchAll(
          /(?:{\s*"sessionIndex"\s*:\s*(\d+)\s*,)?[\s\S]*?"question"\s*:\s*"([^"]+)"[\s\S]*?"choices"\s*:\s*\[([\s\S]*?)\][\s\S]*?"correctAnswer"\s*:\s*"([^"]+)"[\s\S]*?"explanation"\s*:\s*"([^"]+)"/g,
        ),
      ];
      if (qMatches.length > 0) {
        const questions = qMatches.map((m) => {
          const rawChoices = m[3];
          const choices = [...rawChoices.matchAll(/"([^"]+)"/g)].map((c) => c[1]);
          return {
            sessionIndex: m[1] ? parseInt(m[1], 10) : undefined,
            question: m[2],
            questionType: "multiple_choice" as const,
            choices:
              choices.length >= 4
                ? choices
                : [m[4], "گزینه انحرافی ۱", "گزینه انحرافی ۲", "گزینه انحرافی ۳"],
            correctAnswer: m[4],
            explanation: m[5],
          };
        });
        return {
          kind: "quizzes_batch",
          questions,
          citationChunkIds: [],
        } as T;
      }
    }

    if (typeDesc.includes("review_summary") || typeDesc.includes("summary")) {
      throw new DomainError(
        "unprocessable",
        `STAGE5_INVALID_MODEL_JSON: Model returned malformed or unparseable JSON for ${typeDesc}`,
      );
    }

    throw new DomainError(
      "unprocessable",
      `Model returned invalid JSON for ${typeDesc}`,
    );
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

          const moduleTitle = parsed.moduleTitle || doc.originalName;

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

            // Support both single session schema { kind: "session", title, contentMarkdown, citationChunkIds }
            // and fallback array/batch format { kind: "sessions_batch", sessions: [...] }
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

            process.stdout.write(
              `[GENERATION] validation_passed: stage=lesson chunkKey=${chunkKey} correlationId=${correlationId} markdownLength=${normalizedContentMarkdown.length}\n`,
            );

            return {
              session: {
                title,
                contentMarkdown: normalizedContentMarkdown,
                citationChunkIds,
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
      documentTitle: doc.originalName,
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
   *
   * Accurately determines whether lessons, flashcards, and quizzes exist in DB
   * or active unrejected review drafts exist.
   * If an item is deleted in DB, generated status reverts to false.
   */
  async getDocumentContentStatus(
    actor: Actor,
    organizationId: OrganizationId,
    documentId: DocumentId,
    courseId?: CourseId,
  ): Promise<DocumentContentStatusResource> {
    await this.authorize(actor, organizationId, "content:review");
    const doc = await this.requireDocument(organizationId, documentId);

    // 1. Resolve all generated content records for this document
    const docContents = await this.generatedContentStore.listByDocument(
      documentId,
      organizationId,
    );
    const docContentIds = new Set(docContents.map((c) => c.id));

    const activeDrafts = docContents.filter(
      (c) =>
        c.deletedAt === null &&
        (c.status === "draft" || c.status === "edited"),
    );

    // 2. Calculate Lesson Status from DB & Drafts
    let lessonCount = 0;
    if (this.moduleStore && this.lessonStore) {
      const moduleRecord = await this.moduleStore.findByDocument(documentId);
      if (moduleRecord) {
        const lessons = await this.lessonStore.listByModule(moduleRecord.id);
        lessonCount = lessons.filter((l) => l.deletedAt === null).length;
      }
    }

    let draftLessonCount = 0;
    for (const draft of activeDrafts) {
      if (draft.type === "lesson") {
        const payload = draft.payload as LessonPayload | undefined;
        if (Array.isArray(payload?.sessions) && payload.sessions.length > 0) {
          draftLessonCount += payload.sessions.length;
        } else {
          draftLessonCount += 1;
        }
      }
    }

    // 3. Calculate Flashcards Status from DB & Drafts
    let flashcardCount = 0;
    if (this.flashcardStore) {
      const allCards = await this.flashcardStore.listByOrganization(organizationId);
      flashcardCount = allCards.filter(
        (f) =>
          (f.documentId === documentId || (f.generatedContentId && docContentIds.has(f.generatedContentId))) &&
          f.deletedAt === null,
      ).length;
    }

    let draftFlashcardCount = 0;
    for (const draft of activeDrafts) {
      if (draft.type === "flashcard") {
        type FlashcardShape = FlashcardPayload & { flashcards?: unknown[]; question?: unknown; answer?: unknown };
        const payload = draft.payload as FlashcardShape | undefined;
        if (Array.isArray(payload?.cards) && payload.cards.length > 0) {
          draftFlashcardCount += payload.cards.length;
        } else if (Array.isArray(payload?.flashcards) && payload.flashcards.length > 0) {
          draftFlashcardCount += payload.flashcards.length;
        } else if (payload?.question && payload?.answer) {
          draftFlashcardCount += 1;
        }
      }
    }

    // 4. Calculate Quizzes/Exam Status from DB & Drafts
    let quizCount = 0;
    let quizQuestionCount = 0;
    if (this.quizStore) {
      type ExtendedQuizRecord = {
        id: string;
        deletedAt: string | null;
        documentId?: DocumentId | null;
        generatedContentId?: GeneratedContentId | null;
      };
      const allQuizzes = (await this.quizStore.listByOrganization(organizationId)) as unknown as ExtendedQuizRecord[];
      const docQuizzes = allQuizzes.filter(
        (q) =>
          (q.documentId === documentId ||
            (q.generatedContentId && docContentIds.has(q.generatedContentId))) &&
          q.deletedAt === null,
      );
      quizCount = docQuizzes.length;
      if (this.quizQuestionStore) {
        for (const q of docQuizzes) {
          type ExtendedQuestion = { id: string; deletedAt?: string | null };
          const questions = (await this.quizQuestionStore.listByQuiz(q.id as QuizId)) as unknown as ExtendedQuestion[];
          quizQuestionCount += questions.filter(
            (qq) => qq.deletedAt === null || qq.deletedAt === undefined,
          ).length;
        }
      }
    }

    let draftQuizQuestionCount = 0;
    for (const draft of activeDrafts) {
      if (draft.type === "quiz") {
        type QuizDraftShape = QuizPayload & { quiz?: { questions?: unknown[] } };
        const payload = draft.payload as QuizDraftShape | undefined;
        if (Array.isArray(payload?.questions) && payload.questions.length > 0) {
          draftQuizQuestionCount += payload.questions.length;
        } else if (Array.isArray(payload?.quiz?.questions) && payload.quiz.questions.length > 0) {
          draftQuizQuestionCount += payload.quiz.questions.length;
        } else {
          draftQuizQuestionCount += 1;
        }
      }
    }

    // 5. Calculate Review Summary Status from DB & Drafts
    let reviewSummaryCount = 0;
    const reviewSummaryItem = docContents.find(
      (c) =>
        c.type === "review_summary" &&
        c.deletedAt === null &&
        c.status !== "rejected",
    );
    if (reviewSummaryItem) {
      reviewSummaryCount = 1;
    }
    const reviewSummaryGenerated = reviewSummaryCount > 0;

    const totalLessonCount = lessonCount > 0 ? lessonCount : draftLessonCount;
    const totalFlashcardCount = flashcardCount > 0 ? flashcardCount : draftFlashcardCount;
    const totalExamCount =
      quizQuestionCount > 0
        ? quizQuestionCount
        : (quizCount > 0 ? quizCount : draftQuizQuestionCount);

    const lessonGenerated = totalLessonCount > 0;
    const flashcardsGenerated = totalFlashcardCount > 0;
    const examGenerated = totalExamCount > 0;

    const allGenerated = lessonGenerated && flashcardsGenerated && examGenerated;

    const progress = await this.getGenerationProgress(
      documentId,
      organizationId,
    );

    const generatableDocStatuses = new Set([
      "uploaded",
      "extracted",
      "generating",
      "review_pending",
      "ready",
      "failed",
    ]);
    const isDocActivelyRunning =
      doc.status === "generating" && Boolean(progress && progress.status === "running");
    const canGenerate =
      !allGenerated &&
      generatableDocStatuses.has(doc.status) &&
      !isDocActivelyRunning;

    // Compute accepted status for publish eligibility (publishableAcceptedContentCount >= 1)
    const activeAcceptedContents = docContents.filter(
      (c) => c.deletedAt === null && c.status === "accepted",
    );
    const lessonAccepted =
      activeAcceptedContents.some((c) => c.type === "lesson") || lessonCount > 0;
    const flashcardsAccepted =
      activeAcceptedContents.some((c) => c.type === "flashcard") || flashcardCount > 0;
    const examAccepted =
      activeAcceptedContents.some((c) => c.type === "quiz") || quizCount > 0;
    const reviewSummaryAccepted = activeAcceptedContents.some(
      (c) => c.type === "review_summary",
    );

    const hasPublishableContent = Boolean(
      lessonAccepted ||
      flashcardsAccepted ||
      examAccepted ||
      reviewSummaryAccepted,
    );

    const progressRecord = await this.progressService.getRecord(documentId, organizationId);
    const generationProgress = this.progressService.toResource(
      progressRecord,
      doc.status,
      doc.errorCode,
    );

    return {
      request_id: randomUUID(),
      document_id: documentId,
      course_id: (courseId || doc.courseId || null) as CourseId | null,
      lesson: {
        generated: lessonGenerated,
        count: totalLessonCount,
        accepted: lessonAccepted,
      },
      flashcards: {
        generated: flashcardsGenerated,
        count: totalFlashcardCount,
        accepted: flashcardsAccepted,
      },
      exam: {
        generated: examGenerated,
        count: totalExamCount,
        accepted: examAccepted,
      },
      review_summary: {
        generated: reviewSummaryGenerated,
        count: reviewSummaryCount,
        accepted: reviewSummaryAccepted,
      },
      progress,
      generationProgress,
      can_generate: canGenerate,
      all_generated: allGenerated,
      has_publishable_content: hasPublishableContent,
    };
  }

  /**
   * Check if a document has an actively running worker with a valid lease or recent heartbeat.
   */
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
    if (this.chunkRecordStore && typeof (this.chunkRecordStore as any).getAll === "function") {
      const chunks = (this.chunkRecordStore as any).getAll() as GenerationChunkRecord[];
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

      let isActive =
        res.status === "queued" ||
        res.status === "planning" ||
        res.status === "generating" ||
        res.status === "reviewing" ||
        res.status === "stopping" ||
        res.status === "deleting" ||
        doc.status === "generating" ||
        doc.status === "pending_generation";

      // If marked active, verify whether it is actually stale (abandoned worker / crashed process)
      if (isActive && res.status !== "stopping" && res.status !== "deleting") {
        const lastActivityTime = res.lastActivityAt
          ? new Date(res.lastActivityAt).getTime()
          : (record?.updatedAt ? new Date(record.updatedAt).getTime() : (doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0));
        const isTimeExceeded = (now - lastActivityTime) > STALE_THRESHOLD_MS;

        if (isTimeExceeded) {
          const hasActiveWorker = await this.isDocumentActivelyWorking(
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

      const isStopped = res.status === "stopped";
      // Include completed/failed within recent window so client indicator can show the completion toast/summary
      const isRecent =
        (res.status === "completed" || res.status === "failed") &&
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
        a.status === "reviewing";
      const bActive =
        b.status === "queued" ||
        b.status === "planning" ||
        b.status === "generating" ||
        b.status === "reviewing";
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bTime - aTime;
    });

    return items;
  }

  /**
   * Return canonical progress for a single document with strict tenant/ownership verification.
   */
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
    } = {},
  ): Promise<GenerateResult> {
    await this.authorize(actor, organizationId, "content:generate");

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
            activeJobId as any,
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
          const outlineListing = outline
            .map((item, idx) => `${idx + 1}. **${item.title}**: ${item.description}`)
            .join("\n");
          const masterMarkdown = [
            `# ${moduleTitle || doc.originalName}`,
            `## فهرست جلسات آموزشی`,
            outlineListing,
            `---`,
            ...generatedSessions.map((s) => s.contentMarkdown),
          ].join("\n\n");

          const allSessionCitations = Array.from(
            new Set(generatedSessions.flatMap((s) => s.citationChunkIds)),
          );

          payload = {
            kind: "lesson",
            moduleTitle,
            title: moduleTitle || doc.originalName,
            outline,
            sessions: generatedSessions,
            contentMarkdown: masterMarkdown,
            citationChunkIds:
              allSessionCitations.length > 0
                ? allSessionCitations
                : planningRes.citationChunkIds,
            coverageReport,
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

          payload = {
            kind: "flashcard",
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

          payload = {
            kind: "quiz",
            title: `آزمون ارزیابی آموخته‌ها: ${moduleTitle}`,
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
        let updatedDoc = await this.requireDocument(organizationId, documentId);
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
    },
  ): Promise<GeneratedContentResource> {
    await this.authorize(actor, organizationId, "content:generate");
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

    if (claim.status === "completed") {
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
            c.status !== "rejected",
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
        const masterMarkdown = [
          `# ${planningRes.moduleTitle || doc.originalName}`,
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
          moduleTitle: planningRes.moduleTitle,
          title: planningRes.moduleTitle || doc.originalName,
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
      targetOrgId = (course.organizationId || (course as any).organization_id) as OrganizationId;
    } else {
      await this.authorize(actor, organizationId, "content:review");
    }

    // Check if an active summary exists (including decoupled summaries where source document was soft-deleted)
    const contents = await this.generatedContentStore.listByDocument(
      documentId,
      targetOrgId,
    );

    const summary = contents.find(
      (c) =>
        c.type === "review_summary" &&
        c.deletedAt === null &&
        c.status !== "rejected",
    );

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
}
