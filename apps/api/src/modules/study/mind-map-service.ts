/**
 * Personal Mind Map Service (Interactive AI Mind Map).
 *
 * Coordinates:
 * - Priority-based educational source selection:
 *     Priority 1: DocumentChunkStore from original reference file (PDF, DOCX, PPTX).
 *     Priority 2 (Fallback): LessonStore (published lessons of the chapter).
 *     Strict error if no reliable source is available.
 * - Structured Gemini generation using GeminiModelGateway (gemini-3.5-flash-lite).
 * - Monotonic independent versioning and standalone lifecycle (content_type: 'mind_map').
 * - 3-layer persistence: AI Base, User Modifications, User Notes.
 * - Non-destructive reconciliation across AI regenerations.
 * - On-Demand deep explanation expansion for specific nodes.
 * - Zero financial debit (free user capability per current product spec).
 */

import { randomUUID } from "node:crypto";
import {
  DomainError,
  type Actor,
  type CourseId,
  type OrganizationId,
  type DocumentId,
  type AuthorizationPolicy,
  type ResourceContext,
  buildActor,
  defaultPolicy,
  validateMindMapAiBase,
  validateUserModificationsAndNotes,
  computeEffectiveMindMap,
  cleanStructuredDetails,
  MAX_MINDMAP_DEPTH,
} from "@avana/domain";
import type {
  MindMapDto,
  MindMapPayload,
  MindMapAiBase,
  MindMapNodeBase,
  MindMapCustomEdge,
  MindMapSourceType,
  GetMindMapResponse,
  GenerateMindMapResponse,
  UpdateMindMapRequest,
  ExpandMindMapNodeResponse,
  ListMindMapVersionsResponse,
  RestoreMindMapVersionResponse,
  EnrichMindMapChemicalsResponse,
} from "@avana/contracts";
import type { PersonalSummaryStore, PersonalSummaryRecord } from "./personal-summary-store.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import type { ModuleStore, LessonStore, DocumentChunkStore, DocumentStore } from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { cleanAndParseJson } from "../generation/engine/resilient-json-parser.js";
import {
  enrichMindMapAiBaseChemicalsAsync,
  enrichMindMapChemicalsWithReportAsync,
} from "./mind-map-chemical-enricher.js";

export const PERSONAL_MINDMAP_LEASE_DURATION_MS = 180_000; // 3 minutes
export const MINDMAP_HEARTBEAT_INTERVAL_MS = 10_000; // 10 seconds

export type MindMapLifecycleStage =
  | "REQUEST_RECEIVED"
  | "MODULE_RESOLVED"
  | "SOURCE_RESOLVED"
  | "SOURCE_CONTENT_LOADED"
  | "GEMINI_REQUEST_STARTED"
  | "GEMINI_RESPONSE_RECEIVED"
  | "MODEL_OUTPUT_PARSED"
  | "MIND_MAP_VALIDATED"
  | "MIND_MAP_SAVED"
  | "RESPONSE_RETURNED";

export interface MindMapLifecycleEvent {
  timestamp: string;
  stage: MindMapLifecycleStage;
  correlationId: string;
  moduleId: string;
  courseId: string | null;
  userId: string;
  durationMs: number;
  status: "SUCCESS" | "FAILED";
  details?: Record<string, unknown>;
  error?: {
    exceptionName?: string;
    errorMessage?: string;
    stackTrace?: string;
    errorCause?: unknown;
    geminiHttpStatus?: number;
    geminiResponse?: unknown;
  };
}

export interface MindMapSanitizationMetrics {
  selfParentsFixed: number;
  orphanParentsFixed: number;
  duplicateIdsFixed: number;
  cyclesFixed: number;
  depthLimitsFixed: number;
  nodesAccepted: number;
  nodesRejected: number;
}

/**
 * Normalizes Persian and Arabic text for resilient lexical matching:
 * - Unifies Arabic Kaf (ك) to Persian Kaf (ک)
 * - Unifies Arabic Yeh (ي) and Alef Maksura (ى) to Persian Yeh (ی)
 * - Removes Zero-Width Non-Joiner (ZWNJ \u200c)
 * - Normalizes consecutive whitespaces and trims edges
 */
export function normalizePersianText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\u200c/g, "")
    .replace(/\u0643/g, "ک")
    .replace(/[\u064a\u0649]/g, "ی")
    .replace(/[\s\t\r\n]+/g, " ")
    .trim()
    .toLowerCase();
}

export function sanitizeMindMapLog<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return obj
      .replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]")
      .replace(/bearer\s+[a-zA-Z0-9_.-]+/gi, "bearer [REDACTED]") as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeMindMapLog) as unknown as T;
  }
  if (typeof obj === "object") {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (
        lk.includes("token") ||
        lk.includes("secret") ||
        lk.includes("cookie") ||
        lk.includes("authorization") ||
        lk.includes("password") ||
        lk.includes("apikey") ||
        lk.includes("api_key")
      ) {
        clean[k] = "[REDACTED]";
      } else {
        clean[k] = sanitizeMindMapLog(v);
      }
    }
    return clean as unknown as T;
  }
  return obj;
}

export function emitMindMapLifecycleLog(event: MindMapLifecycleEvent): void {
  const sanitized = sanitizeMindMapLog(event);
  const logLine = `[MIND_MAP_LIFECYCLE] ${JSON.stringify(sanitized)}`;
  if (process.env.NODE_ENV !== "test" || process.env.DEBUG_MINDMAP === "true") {
    process.stdout.write(logLine + "\n");
  }
}

export const MINDMAP_CLICHE_PATTERNS = [
  "بسیار مهم است",
  "بسیار مهم",
  "نکته بسیار مهم",
  "بسیار کاربردی",
  "کاربرد فراوان دارد",
  "اهمیت بالایی دارد",
  "اهمیت زیادی دارد",
  "نقش مهمی ایفا میکند",
  "نقش مهمی ایفا می کند",
  "نقش اساسی دارد",
  "کاربردهای فراوانی دارد",
  "کاربردهای مختلف دارد",
  "باید توجه شود",
  "حائز اهمیت است",
  "از اهمیت ویژه ای برخوردار است",
  "از اهمیت ویژه ای برخوردار می باشد",
];

export function isClicheEducationalContent(text: string): boolean {
  if (!text || typeof text !== "string") return true;
  const norm = normalizePersianText(text);
  return MINDMAP_CLICHE_PATTERNS.some((pattern) =>
    norm.includes(normalizePersianText(pattern)),
  );
}

export function isDuplicateOfNodeContent(text: string, node: MindMapNodeBase): boolean {
  if (!text || typeof text !== "string" || !node) return false;
  const normText = normalizePersianText(text).trim();
  const normTitle = normalizePersianText(node.title || "").trim();
  const normDesc = normalizePersianText(node.shortDescription || "").trim();

  if (normText === normTitle || normText === normDesc) return true;
  if (normText.length <= normTitle.length + 5 && normText.includes(normTitle)) return true;
  if (normDesc.length > 0 && normDesc.includes(normText) && normText.length > 25) {
    return true;
  }
  return false;
}

export function hasValidSupplementaryContent(node: MindMapNodeBase): boolean {
  if (!node) return false;

  // 1. Check keyPoints
  if (Array.isArray(node.keyPoints) && node.keyPoints.length > 0) {
    const validKeyPoints = node.keyPoints.filter(
      (k) =>
        typeof k === "string" &&
        k.trim().length >= 8 &&
        !isDuplicateOfNodeContent(k, node) &&
        !isClicheEducationalContent(k),
    );
    if (validKeyPoints.length > 0) return true;
  }

  // 2. Check examTips
  if (Array.isArray(node.examTips) && node.examTips.length > 0) {
    const validTips = node.examTips.filter(
      (t) =>
        typeof t === "string" &&
        t.trim().length >= 8 &&
        !isDuplicateOfNodeContent(t, node) &&
        !isClicheEducationalContent(t),
    );
    if (validTips.length > 0) return true;
  }

  // 3. Check structuredDetails
  if (node.structuredDetails) {
    const sd = node.structuredDetails;
    const hasField = (val: unknown): boolean =>
      typeof val === "string" &&
      val.trim().length >= 8 &&
      !isDuplicateOfNodeContent(val, node) &&
      !isClicheEducationalContent(val);
    const hasArrayField = (arr: unknown): boolean =>
      Array.isArray(arr) && arr.some((item) => hasField(item));

    if (
      hasField(sd.mechanismOfAction) ||
      hasField(sd.pharmacology) ||
      hasArrayField(sd.clinicalPearls) ||
      hasArrayField(sd.commonPitfalls) ||
      hasArrayField(sd.adverseEffects) ||
      hasArrayField(sd.contraindications) ||
      hasArrayField(sd.interactions) ||
      hasArrayField(sd.indications)
    ) {
      return true;
    }
  }

  return false;
}

export class MindMapService {
  constructor(
    private readonly store: PersonalSummaryStore,
    private readonly gateway: ModelGateway,
    private readonly moduleStore: ModuleStore,
    private readonly lessonStore: LessonStore,
    private readonly courseStore: CourseStore,
    private readonly chunkStore?: DocumentChunkStore,
    _documentStore?: DocumentStore,
    private readonly organizationStore?: OrganizationStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly systemOrganizationId?: OrganizationId,
    private readonly lifecycleLogger?: (event: MindMapLifecycleEvent) => void,
  ) {}

  public emitLifecycle(event: MindMapLifecycleEvent): void {
    if (this.lifecycleLogger) {
      this.lifecycleLogger(event);
    } else {
      emitMindMapLifecycleLog(event);
    }
  }

  /**
   * Verify actor has read access to the module's course and fetch scoped metadata.
   */
  private async verifyModuleAccess(
    actor: Actor,
    moduleId: string,
  ): Promise<{ courseId: CourseId; organizationId: OrganizationId; moduleTitle: string; documentId: string | null }> {
    const moduleRecord = await this.moduleStore.findById(moduleId);
    if (!moduleRecord) {
      throw new DomainError("not_found", "سرفصل آموزشی مورد نظر یافت نشد.");
    }

    const course = await this.courseStore.findByIdForUser(
      moduleRecord.courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError(
        "forbidden",
        "شما به این دوره یا سرفصل دسترسی ندارید.",
      );
    }

    const isSystemResource =
      !!this.systemOrganizationId &&
      this.systemOrganizationId === course.organizationId;

    const memberships = this.organizationStore
      ? await this.organizationStore.listMembershipsByUserId(actor.userId)
      : [];

    const fullActor = buildActor({
      userId: actor.userId,
      globalRole: actor.globalRole,
      role: actor.role,
      memberships,
    });

    const resourceContext: ResourceContext = {
      organizationId: course.organizationId,
      resourceType: "module",
      resourceId: moduleRecord.id,
      courseId: course.id,
      moduleId: moduleRecord.id,
      isSystemResource,
    };

    if (!this.policy.can(fullActor, "study:read", resourceContext)) {
      throw new DomainError(
        "forbidden",
        "شما به این دوره یا سرفصل دسترسی ندارید.",
      );
    }

    return {
      courseId: course.id,
      organizationId: course.organizationId,
      moduleTitle: moduleRecord.title,
      documentId: moduleRecord.documentId ? String(moduleRecord.documentId) : null,
    };
  }

  /**
   * Safely extracts and normalizes MindMapPayload from a DB record.
   * Defends against empty `{}` DB defaults, null/undefined, and missing aiBase.
   */
  public toMindMapPayload(record: PersonalSummaryRecord): MindMapPayload {
    const rawPayload = record.payload;
    if (
      rawPayload &&
      typeof rawPayload === "object" &&
      !Array.isArray(rawPayload) &&
      "aiBase" in rawPayload &&
      rawPayload.aiBase &&
      typeof rawPayload.aiBase === "object" &&
      !Array.isArray(rawPayload.aiBase)
    ) {
      const aiBaseObj = rawPayload.aiBase as Record<string, unknown>;
      const rootNodeId = typeof aiBaseObj.rootNodeId === "string" ? aiBaseObj.rootNodeId.trim() : "";
      if (rootNodeId && aiBaseObj.nodes && typeof aiBaseObj.nodes === "object" && !Array.isArray(aiBaseObj.nodes)) {
        const p = rawPayload as unknown as MindMapPayload;
        return {
          kind: "mind_map",
          version: typeof p.version === "number" ? p.version : record.version,
          sourceType: (p.sourceType === "reference_document" || p.sourceType === "lessons") ? p.sourceType : "lessons",
          sourceId: typeof p.sourceId === "string" ? p.sourceId : record.moduleId,
          updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : record.updatedAt,
          aiBase: p.aiBase,
          userModifications: p.userModifications ?? { deletedNodeIds: [], customNodes: {}, overrides: {} },
          userNotes: p.userNotes ?? {},
        };
      }
    }

    // Default safe fallback if payload is {} (e.g. pending, unpopulated, or legacy/corrupted record)
    return {
      kind: "mind_map",
      version: record.version,
      sourceType: "lessons",
      sourceId: record.moduleId,
      updatedAt: record.updatedAt,
      aiBase: {
        rootNodeId: "root",
        generatedAt: record.createdAt,
        model: "gemini-3.5-flash-lite",
        nodes: {
          root: {
            id: "root",
            parentId: null,
            title: "گره اصلی",
            shortDescription: "ساختار اولیه مایندمپ",
            keyPoints: [],
            examples: [],
            examTips: [],
            sourceReferences: [],
            sortOrder: 0,
          },
        },
      },
      userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
      userNotes: {},
    };
  }

  /**
   * Converts a DB record into MindMapDto.
   */
  private toDto(record: PersonalSummaryRecord): MindMapDto {
    return {
      id: record.id,
      userId: record.userId,
      courseId: record.courseId,
      moduleId: record.moduleId,
      version: record.version,
      status: record.status,
      payload: this.toMindMapPayload(record),
      costToman: record.costToman,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Resolves educational source material using strict Lesson-First priority:
   * Priority 1: Published lesson markdown content from LessonStore.
   *             If lessons are brief (< 1000 chars) and reference document has chunks,
   *             supplements lessons with targeted reference chunks.
   * Priority 2 (Fallback): Reference document chunks from DocumentChunkStore (PDF/DOCX/PPTX)
   *             with deduplication and intelligent length capping.
   * Strict DomainError if neither is available.
   */
  public async resolveEducationalSource(
    moduleId: string,
    documentId: string | null,
  ): Promise<{
    sourceType: MindMapSourceType;
    sourceId: string;
    sourceText: string;
    sourceCitations: Array<{ chunkId?: string; pageNumber?: number; lessonTitle?: string }>;
  }> {
    // 1. Priority 1: Check published lessons from LessonStore
    const lessons = await this.lessonStore.listByModule(moduleId as import("@avana/domain").ModuleId);
    const publishedLessons = lessons.filter(
      (l) => l.publicationStatus === "published" && l.contentMarkdown && l.contentMarkdown.trim().length > 30,
    );

    if (publishedLessons.length > 0) {
      publishedLessons.sort((a, b) => a.sortOrder - b.sortOrder);
      const totalChars = publishedLessons.reduce((acc, l) => acc + (l.contentMarkdown?.length || 0), 0);

      let joinedLessons = publishedLessons
        .map((l, i) => `--- درسنامه ${i + 1}: «${l.title}» ---\n${l.contentMarkdown.trim().replace(/\n{3,}/g, "\n\n")}`)
        .join("\n\n");

      const sourceCitations: Array<{ chunkId?: string; pageNumber?: number; lessonTitle?: string }> =
        publishedLessons.map((l) => ({ lessonTitle: l.title }));

      // If published lessons are brief (< 1000 chars) and reference document chunks are available,
      // supplement lessons with targeted reference chunks to ensure comprehensive scientific depth.
      if (totalChars < 1000 && documentId && this.chunkStore) {
        try {
          const chunks = await this.chunkStore.listByDocument(documentId as DocumentId);
          const validChunks = chunks.filter((c) => c.content && c.content.trim().length > 30);
          if (validChunks.length > 0) {
            validChunks.sort((a, b) => (a.startPage !== b.startPage ? a.startPage - b.startPage : a.sequence - b.sequence));
            const supplementaryChunks = validChunks.slice(0, 10);
            const joinedChunks = supplementaryChunks
              .map(
                (c, i) =>
                  `--- بخش مرجع تکمیلی [چانک ${c.sequence ?? i + 1} | صفحه ${c.startPage}-${c.endPage}${c.heading ? ` | ${c.heading}` : ""}] ---\n${c.content.trim()}`,
              )
              .join("\n\n");

            joinedLessons += `\n\n--- محتوای تکمیلی از سند مرجع سرفصل ---\n${joinedChunks}`;
            for (const c of supplementaryChunks) {
              sourceCitations.push({ chunkId: String(c.id), pageNumber: c.startPage });
            }
          }
        } catch {
          // Keep base published lessons on chunk fetch failure
        }
      }

      return {
        sourceType: "lessons",
        sourceId: moduleId,
        sourceText: joinedLessons,
        sourceCitations,
      };
    }

    // 2. Priority 2: Fallback to document chunks from reference file
    if (documentId && this.chunkStore) {
      try {
        const chunks = await this.chunkStore.listByDocument(documentId as DocumentId);
        const validChunks = chunks.filter((c) => c.content && c.content.trim().length > 30);
        if (validChunks.length > 0) {
          validChunks.sort((a, b) => (a.startPage !== b.startPage ? a.startPage - b.startPage : a.sequence - b.sequence));

          // Intelligently cap to max 35,000 characters to prevent token dilution while preserving key headings
          const selectedChunks: typeof validChunks = [];
          let currentChars = 0;
          const MAX_CHUNKS_CHARS = 35_000;

          for (const chunk of validChunks) {
            if (currentChars + chunk.content.length > MAX_CHUNKS_CHARS && selectedChunks.length >= 5) {
              break;
            }
            selectedChunks.push(chunk);
            currentChars += chunk.content.length;
          }

          const joinedContent = selectedChunks
            .map(
              (c, i) =>
                `--- بخش مرجع [چانک ${c.sequence ?? i + 1} | صفحه ${c.startPage}-${c.endPage}${c.heading ? ` | ${c.heading}` : ""}] (شناسه: ${c.id}) ---\n${c.content.trim().replace(/\n{3,}/g, "\n\n")}`,
            )
            .join("\n\n");

          return {
            sourceType: "reference_document",
            sourceId: documentId,
            sourceText: joinedContent,
            sourceCitations: selectedChunks.map((c) => ({
              chunkId: String(c.id),
              pageNumber: c.startPage,
            })),
          };
        }
      } catch {
        // Proceed to error
      }
    }

    // 3. No valid educational source
    throw new DomainError(
      "bad_request",
      "منبع آموزشی معتبر در دسترس نیست. برای این فصل، درسنامه‌ای یا فایل مرجع استخراج‌شده‌ای یافت نشد.",
    );
  }

  /**
   * Resolves the most relevant educational source material for a specific target node.
   * Priority 1: Document chunks from the reference file ranked by:
   *   a. Direct sourceReferences match (chunkId or pageNumber)
   *   b. Lexical/semantic keyword overlap in heading and content
   * Priority 2: Published lesson markdown content ranked by title and keyword overlap
   * Strictly caps context to max 5 chunks and max 15,000 characters.
   * Throws DomainError if no valid or relevant source material is found.
   */
  public async resolveRelevantSourceForNode(
    moduleId: string,
    documentId: string | null,
    targetNode: MindMapNodeBase,
    parentNode?: MindMapNodeBase | null,
  ): Promise<{
    sourceType: MindMapSourceType;
    sourceId: string;
    sourceText: string;
    sourceCitations: Array<{ chunkId?: string; pageNumber?: number; lessonTitle?: string }>;
  }> {
    // 1. Build search tokens from target concept
    const conceptTexts = [
      targetNode.title,
      parentNode?.title ?? "",
      targetNode.shortDescription,
      ...(targetNode.keyPoints ?? []),
      ...(targetNode.examTips ?? []),
    ].filter(Boolean);

    const fullConceptQuery = conceptTexts.join(" ").toLowerCase();

    // Extract meaningful keyword tokens (Persian & English words >= 2 chars, removing common stop-words)
    const stopWords = new Set([
      "در", "به", "از", "که", "این", "آن", "با", "برای", "یک", "است", "شد", "شده",
      "های", "ها", "می", "هم", "نیز", "تا", "یا", "بر", "بود", "شوند", "شود",
      "and", "the", "for", "with", "from", "that", "this", "are", "was", "not",
    ]);

    const rawTokens = fullConceptQuery
      .split(/[\s,،؛.:;()[\]{}""''«»\-–—/\\_]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    const uniqueKeywords = Array.from(new Set(rawTokens));
    const title = typeof targetNode.title === "string" ? targetNode.title.trim() : "";
    if (!title) {
      throw new DomainError("bad_request", `گره با شناسه "${targetNode.id}" فاقد عنوان معتبر است.`);
    }
    const titleLower = title.toLowerCase();
    const parentTitleLower = (typeof parentNode?.title === "string" ? parentNode.title.trim() : "").toLowerCase();

    // 2. Priority 1: Check published lessons from LessonStore (Lesson-First)
    const lessons = await this.lessonStore.listByModule(moduleId as import("@avana/domain").ModuleId);
    const publishedLessons = lessons.filter(
      (l) => l.publicationStatus === "published" && l.contentMarkdown && l.contentMarkdown.trim().length > 30,
    );

    if (publishedLessons.length > 0) {
      // Score lessons by relevance
      const directLessonTitles = new Set(
        (targetNode.sourceReferences ?? [])
          .map((r) => r.lessonTitle?.trim().toLowerCase())
          .filter(Boolean),
      );

      const scoredLessons = publishedLessons.map((l) => {
        let score = 0;
        const lTitleLower = l.title.toLowerCase();
        const lContentLower = l.contentMarkdown.toLowerCase();

        if (directLessonTitles.has(lTitleLower)) score += 100;
        if (titleLower && lTitleLower.includes(titleLower)) score += 50;
        if (parentTitleLower && lTitleLower.includes(parentTitleLower)) score += 20;

        for (const kw of uniqueKeywords) {
          if (lTitleLower.includes(kw)) score += 10;
          if (lContentLower.includes(kw)) score += 2;
        }

        return { lesson: l, score };
      });

      // Filter lessons strictly with score > 0 (do not force-select unrelated lessons)
      const candidateLessons = scoredLessons.filter((sl) => sl.score > 0).sort((a, b) => b.score - a.score);

      if (candidateLessons.length > 0) {
        const selectedLessons = candidateLessons.slice(0, 3).map((cl) => cl.lesson);
        selectedLessons.sort((a, b) => a.sortOrder - b.sortOrder);

        const joinedLessons = selectedLessons
          .map((l, i) => `--- درسنامه ${i + 1}: «${l.title}» ---\n${l.contentMarkdown.trim().slice(0, 8000)}`)
          .join("\n\n");

        return {
          sourceType: "lessons",
          sourceId: moduleId,
          sourceText: joinedLessons.slice(0, 15_000),
          sourceCitations: selectedLessons.map((l) => ({
            lessonTitle: l.title,
          })),
        };
      }
    }

    // 3. Priority 2: Fallback to document chunks from reference file
    if (documentId && this.chunkStore) {
      try {
        const chunks = await this.chunkStore.listByDocument(documentId as DocumentId);
        const validChunks = chunks.filter((c) => c.content && c.content.trim().length > 30);

        if (validChunks.length > 0) {
          // Direct references registered on the node
          const directRefChunkIds = new Set<string>();
          const directRefPages = new Set<number>();
          if (Array.isArray(targetNode.sourceReferences)) {
            for (const ref of targetNode.sourceReferences) {
              if (ref.chunkId) directRefChunkIds.add(String(ref.chunkId));
              if (typeof ref.pageNumber === "number") directRefPages.add(ref.pageNumber);
            }
          }

          // Score each chunk
          const scoredChunks = validChunks.map((chunk) => {
            let score = 0;
            const headingLower = (chunk.heading ?? "").toLowerCase();
            const contentLower = chunk.content.toLowerCase();

            // Direct citation match: highest priority (+100)
            if (directRefChunkIds.has(String(chunk.id))) {
              score += 100;
            }
            if (directRefPages.size > 0) {
              for (const p of directRefPages) {
                if (chunk.startPage <= p && chunk.endPage >= p) {
                  score += 80;
                  break;
                }
              }
            }

            // Exact title matches
            if (titleLower.length > 2) {
              if (headingLower.includes(titleLower)) score += 40;
              if (contentLower.includes(titleLower)) score += 25;
            }

            // Parent title matches
            if (parentTitleLower.length > 2) {
              if (headingLower.includes(parentTitleLower)) score += 15;
              if (contentLower.includes(parentTitleLower)) score += 10;
            }

            // Keyword matches
            for (const kw of uniqueKeywords) {
              if (headingLower.includes(kw)) score += 8;
              if (contentLower.includes(kw)) score += 2;
            }

            return { chunk, score };
          });

          // Filter by positive score
          const relevantChunks = scoredChunks
            .filter((sc) => sc.score > 0)
            .sort((a, b) => b.score - a.score);

          if (relevantChunks.length > 0) {
            // Select top 3 to 5 chunks, capped at 15,000 characters
            const selectedChunks: typeof validChunks = [];
            let currentChars = 0;
            const MAX_CONTEXT_CHARS = 15_000;
            const MAX_CHUNKS = 5;

            for (const { chunk } of relevantChunks) {
              if (selectedChunks.length >= MAX_CHUNKS) break;
              if (currentChars + chunk.content.length > MAX_CONTEXT_CHARS && selectedChunks.length >= 2) {
                break;
              }
              selectedChunks.push(chunk);
              currentChars += chunk.content.length;
            }

            // Order selected chunks chronologically by startPage / sequence for coherent reading
            selectedChunks.sort((a, b) => (a.startPage !== b.startPage ? a.startPage - b.startPage : a.sequence - b.sequence));

            const joinedContent = selectedChunks
              .map(
                (c, i) =>
                  `--- بخش مرجع [چانک ${c.sequence ?? i + 1} | صفحه ${c.startPage}-${c.endPage}${c.heading ? ` | ${c.heading}` : ""}] (شناسه: ${c.id}) ---\n${c.content.trim()}`,
              )
              .join("\n\n");

            return {
              sourceType: "reference_document",
              sourceId: documentId,
              sourceText: joinedContent,
              sourceCitations: selectedChunks.map((c) => ({
                chunkId: String(c.id),
                pageNumber: c.startPage,
              })),
            };
          }
        }
      } catch {
        // Fallback to error
      }
    }

    // 4. No valid and relevant educational source found
    throw new DomainError(
      "bad_request",
      `منبع آموزشی معتبر و مرتبط با مفهوم «${targetNode.title}» برای استخراج توضیحات تکمیلی یافت نشد.`,
    );
  }

  /**
   * Resilient central sanitizer for raw Gemini mind map tree outputs.
   * Defends against LLM structural defects:
   * 1. Self-Parent (node.parentId === node.id): re-parents to root.
   * 2. Orphan Parent (node.parentId not in tree): re-parents to root.
   * 3. Duplicate IDs: disambiguates without overwriting nodes, preserving children ownership.
   * 4. Multi-node cycle detection & breaking (2-node, 3-node, N-node): breaks cycle by reconnecting to root.
   * 5. Root node preservation: ensures exactly one valid root node.
   * 6. Depth limits: prevents branches from exceeding MAX_MINDMAP_DEPTH (8).
   * 7. Zero silent loss: ensures valid scientific concepts are never silently discarded.
   */
  public sanitizeAiMindMapTree(
    raw: unknown,
    fallbackRootId = "root",
  ): { sanitized: Record<string, unknown>; metrics: MindMapSanitizationMetrics } {
    const metrics: MindMapSanitizationMetrics = {
      selfParentsFixed: 0,
      orphanParentsFixed: 0,
      duplicateIdsFixed: 0,
      cyclesFixed: 0,
      depthLimitsFixed: 0,
      nodesAccepted: 0,
      nodesRejected: 0,
    };

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        sanitized: {
          rootNodeId: fallbackRootId,
          nodes: {
            [fallbackRootId]: {
              id: fallbackRootId,
              parentId: null,
              title: "گره اصلی",
              shortDescription: "ساختار اولیه مایندمپ",
              keyPoints: [],
              examples: [],
              examTips: [],
              sourceReferences: [],
              sortOrder: 0,
            },
          },
        },
        metrics,
      };
    }

    const rawObj = raw as Record<string, unknown>;
    let rootNodeId =
      typeof rawObj.rootNodeId === "string" && rawObj.rootNodeId.trim().length > 0
        ? rawObj.rootNodeId.trim()
        : fallbackRootId;

    const rawNodes = rawObj.nodes;
    interface NodeDraft {
      dictKey?: string;
      rawIdCandidate: string;
      assignedId: string;
      data: Record<string, unknown>;
    }

    const drafts: NodeDraft[] = [];
    const usedIds = new Set<string>();
    const dictKeyToAssignedId = new Map<string, string>();
    const rawIdToDrafts = new Map<string, NodeDraft[]>();

    const rawEntries: Array<{ dictKey?: string; item: Record<string, unknown> }> = [];

    if (Array.isArray(rawNodes)) {
      for (const item of rawNodes) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          rawEntries.push({ item: item as Record<string, unknown> });
        } else {
          metrics.nodesRejected++;
        }
      }
    } else if (rawNodes && typeof rawNodes === "object") {
      for (const [key, val] of Object.entries(rawNodes)) {
        if (val && typeof val === "object" && !Array.isArray(val)) {
          rawEntries.push({ dictKey: key, item: val as Record<string, unknown> });
        } else {
          metrics.nodesRejected++;
        }
      }
    }

    // Step 1: Assign unique IDs and detect duplicates
    for (const entry of rawEntries) {
      const n = entry.item;
      const dictKey = entry.dictKey ? entry.dictKey.trim() : undefined;
      let rawIdCandidate =
        typeof n.id === "string" && n.id.trim().length > 0
          ? n.id.trim()
          : (dictKey || "");

      const title = typeof n.title === "string" ? n.title.trim() : "";
      if (!title) {
        metrics.nodesRejected++;
        continue;
      }

      if (!rawIdCandidate) {
        rawIdCandidate = `node_${randomUUID().slice(0, 8)}`;
      }

      let assignedId = rawIdCandidate;
      if (usedIds.has(assignedId)) {
        metrics.duplicateIdsFixed++;
        let dupCounter = 2;
        while (usedIds.has(`${rawIdCandidate}_dup${dupCounter}`)) {
          dupCounter++;
        }
        assignedId = `${rawIdCandidate}_dup${dupCounter}`;
      }

      usedIds.add(assignedId);

      const draft: NodeDraft = {
        dictKey,
        rawIdCandidate,
        assignedId,
        data: n,
      };
      drafts.push(draft);

      if (dictKey) {
        dictKeyToAssignedId.set(dictKey, assignedId);
      }

      const existingDrafts = rawIdToDrafts.get(rawIdCandidate) || [];
      existingDrafts.push(draft);
      rawIdToDrafts.set(rawIdCandidate, existingDrafts);
    }

    // Step 2: Ensure root node exists
    let rootDraft = drafts.find((d) => d.assignedId === rootNodeId);
    if (!rootDraft) {
      const nullParentDraft = drafts.find(
        (d) => d.data.parentId === null || d.data.parentId === undefined,
      );
      if (nullParentDraft) {
        rootNodeId = nullParentDraft.assignedId;
        rootDraft = nullParentDraft;
      } else if (drafts.length > 0) {
        rootNodeId = drafts[0].assignedId;
        rootDraft = drafts[0];
      } else {
        const synthRoot: NodeDraft = {
          rawIdCandidate: rootNodeId,
          assignedId: rootNodeId,
          data: {
            id: rootNodeId,
            parentId: null,
            title: "گره ریشه",
            shortDescription: "نقشه مفهومی",
          },
        };
        drafts.push(synthRoot);
        rootDraft = synthRoot;
        usedIds.add(rootNodeId);
      }
    }

    // Root node MUST have null parentId
    rootDraft.data.parentId = null;

    // Step 3: Resolve parentId for all drafts with duplicate awareness
    for (const draft of drafts) {
      if (draft.assignedId === rootNodeId) {
        draft.data.parentId = null;
        continue;
      }

      const rawParentVal = draft.data.parentId;
      const rawParentId =
        typeof rawParentVal === "string" ? rawParentVal.trim() : null;

      // 1. Self-Parent check
      if (
        rawParentId === draft.assignedId ||
        rawParentId === draft.rawIdCandidate ||
        (draft.dictKey && rawParentId === draft.dictKey)
      ) {
        draft.data.parentId = rootNodeId;
        metrics.selfParentsFixed++;
        continue;
      }

      // 2. Parent resolution with lexical ownership
      let resolvedParentId: string | null = null;

      if (rawParentId) {
        if (dictKeyToAssignedId.has(rawParentId)) {
          resolvedParentId = dictKeyToAssignedId.get(rawParentId)!;
        } else if (usedIds.has(rawParentId)) {
          resolvedParentId = rawParentId;
        } else if (rawIdToDrafts.has(rawParentId)) {
          const candidateDrafts = rawIdToDrafts.get(rawParentId)!;
          if (candidateDrafts.length === 1) {
            resolvedParentId = candidateDrafts[0].assignedId;
          } else {
            const currentIndex = drafts.indexOf(draft);
            let closestPreceding = candidateDrafts[0];
            for (const cd of candidateDrafts) {
              const cdIndex = drafts.indexOf(cd);
              if (cdIndex < currentIndex && cdIndex > drafts.indexOf(closestPreceding)) {
                closestPreceding = cd;
              }
            }
            resolvedParentId = closestPreceding.assignedId;
          }
        }
      }

      // 3. Orphan parent check
      if (!resolvedParentId || !usedIds.has(resolvedParentId)) {
        draft.data.parentId = rootNodeId;
        metrics.orphanParentsFixed++;
      } else if (resolvedParentId === draft.assignedId) {
        draft.data.parentId = rootNodeId;
        metrics.selfParentsFixed++;
      } else {
        draft.data.parentId = resolvedParentId;
      }
    }

    // Step 4: Full Multi-Node Cycle Detection & Breaking
    const draftById = new Map<string, NodeDraft>();
    for (const d of drafts) {
      draftById.set(d.assignedId, d);
    }

    for (const draft of drafts) {
      if (draft.assignedId === rootNodeId) continue;
      const visited = new Set<string>();
      let currId: string | null = draft.assignedId;

      while (currId && currId !== rootNodeId) {
        if (visited.has(currId)) {
          // Cycle identified! Break by attaching currId to rootNodeId
          const cycleNode = draftById.get(currId);
          if (cycleNode) {
            cycleNode.data.parentId = rootNodeId;
            metrics.cyclesFixed++;
          }
          break;
        }
        visited.add(currId);
        const currDraft = draftById.get(currId);
        currId = typeof currDraft?.data.parentId === "string" ? currDraft.data.parentId : null;
      }
    }

    // Step 5: Depth Limit Enforcement (MAX_MINDMAP_DEPTH = 8)
    for (const draft of drafts) {
      if (draft.assignedId === rootNodeId) continue;
      let depth = 1;
      let currId: string | null = draft.assignedId;
      const ancestry = new Set<string>();

      while (currId && currId !== rootNodeId) {
        ancestry.add(currId);
        depth++;
        const currDraft = draftById.get(currId);
        currId = typeof currDraft?.data.parentId === "string" ? currDraft.data.parentId : null;
        if (!currId || ancestry.has(currId)) break;
      }

      if (depth > MAX_MINDMAP_DEPTH) {
        draft.data.parentId = rootNodeId;
        metrics.depthLimitsFixed++;
      }
    }

    // Step 6: Assemble sanitized nodes dictionary
    const sanitizedNodes: Record<string, Record<string, unknown>> = {};
    for (const draft of drafts) {
      sanitizedNodes[draft.assignedId] = {
        ...draft.data,
        id: draft.assignedId,
        parentId: draft.data.parentId,
        title: typeof draft.data.title === "string" ? draft.data.title.trim().slice(0, 120) : "",
        shortDescription:
          typeof draft.data.shortDescription === "string"
            ? draft.data.shortDescription.trim().slice(0, 600)
            : "",
      };
    }

    metrics.nodesAccepted = Object.keys(sanitizedNodes).length;

    return {
      sanitized: {
        rootNodeId,
        nodes: sanitizedNodes,
      },
      metrics,
    };
  }

  /**
   * Reconciles new AI Base tree with previous User Modifications & Notes.
   * Ensures zero user data loss:
   * 1. Match exact ID first.
   * 2. Semantic title match ONLY if title is unique across both trees and structural evidence matches.
   * 3. Ambiguous nodes are preserved under user_preserved_* without duplicate nesting.
   */
  public reconcileMindMap(
    newAiBase: MindMapAiBase,
    previousPayload?: MindMapPayload | null,
  ): MindMapPayload {
    if (!previousPayload) {
      return {
        kind: "mind_map",
        version: 1,
        sourceType: "reference_document",
        sourceId: "",
        updatedAt: new Date().toISOString(),
        aiBase: newAiBase,
        userModifications: {
          deletedNodeIds: [],
          customNodes: {},
          overrides: {},
        },
        userNotes: {},
      };
    }

    const previousModifications = previousPayload.userModifications ?? {
      deletedNodeIds: [],
      customNodes: {},
      overrides: {},
    };
    const previousNotes = previousPayload.userNotes ?? {};
    const previousBaseNodes = previousPayload.aiBase?.nodes ?? {};

    const newNodes = newAiBase.nodes;
    const newKeys = new Set(Object.keys(newNodes));

    // Count title occurrences in oldBaseNodes and newNodes for strict 1-to-1 disambiguation
    const oldTitleCounts = new Map<string, number>();
    for (const oldNode of Object.values(previousBaseNodes)) {
      const t = (typeof oldNode.title === "string" ? oldNode.title.trim() : "").toLowerCase();
      if (!t) continue;
      oldTitleCounts.set(t, (oldTitleCounts.get(t) ?? 0) + 1);
    }

    const newTitleCounts = new Map<string, number>();
    const titleToUniqueNewId = new Map<string, string>();
    for (const [newId, newNode] of Object.entries(newNodes)) {
      const t = (typeof newNode.title === "string" ? newNode.title.trim() : "").toLowerCase();
      if (!t) continue;
      const count = (newTitleCounts.get(t) ?? 0) + 1;
      newTitleCounts.set(t, count);
      if (count === 1) {
        titleToUniqueNewId.set(t, newId);
      } else {
        titleToUniqueNewId.delete(t); // Multiple nodes with same title in new tree -> ambiguous!
      }
    }

    // Matcher: exact ID first, then unique title + structural consistency
    const matchOldToNew = (oldId: string): string | null => {
      if (newKeys.has(oldId)) return oldId;
      const oldNode = previousBaseNodes[oldId];
      if (!oldNode) return null;
      const t = (typeof oldNode.title === "string" ? oldNode.title.trim() : "").toLowerCase();
      if (!t) return null;

      // Only allow title matching if the title appears EXACTLY ONCE in both old and new trees
      if (oldTitleCounts.get(t) === 1 && newTitleCounts.get(t) === 1) {
        const newId = titleToUniqueNewId.get(t);
        if (newId) {
          const newNode = newNodes[newId];
          // Check structural evidence:
          // Either both are root children, or their parent titles match, or root IDs match
          const oldParent = oldNode.parentId ? previousBaseNodes[oldNode.parentId] : null;
          const newParent = newNode.parentId ? newNodes[newNode.parentId] : null;

          const oldIsRootChild = oldNode.parentId === previousPayload.aiBase?.rootNodeId;
          const newIsRootChild = newNode.parentId === newAiBase.rootNodeId;

          if (
            (oldIsRootChild && newIsRootChild) ||
            (!oldNode.parentId && !newNode.parentId) ||
            (oldParent && newParent && oldParent.title.trim().toLowerCase() === newParent.title.trim().toLowerCase())
          ) {
            return newId;
          }
        }
      }
      return null;
    };

    const reconciledOverrides: Record<string, import("@avana/contracts").MindMapNodeOverride> = {};
    const reconciledNotes: Record<string, import("@avana/contracts").MindMapNodeUserNote> = {};
    const reconciledDeleted: string[] = [];
    const matchedOldIds = new Set<string>();

    // 1. Reconcile deleted nodes
    for (const deletedId of previousModifications.deletedNodeIds) {
      if (previousModifications.customNodes?.[deletedId]) {
        reconciledDeleted.push(deletedId);
        continue;
      }
      const matchedNewId = matchOldToNew(deletedId);
      if (matchedNewId && !reconciledDeleted.includes(matchedNewId)) {
        reconciledDeleted.push(matchedNewId);
        matchedOldIds.add(deletedId);
      }
    }

    // 2. Reconcile user notes
    for (const [oldId, note] of Object.entries(previousNotes)) {
      if (previousModifications.customNodes?.[oldId]) {
        reconciledNotes[oldId] = note;
        continue;
      }
      const matchedNewId = matchOldToNew(oldId);
      if (matchedNewId) {
        reconciledNotes[matchedNewId] = note;
        matchedOldIds.add(oldId);
      }
    }

    // 3. Reconcile user overrides
    for (const [oldId, override] of Object.entries(previousModifications.overrides)) {
      if (previousModifications.customNodes?.[oldId]) {
        reconciledOverrides[oldId] = override;
        continue;
      }
      const matchedNewId = matchOldToNew(oldId);
      if (matchedNewId) {
        reconciledOverrides[matchedNewId] = override;
        matchedOldIds.add(oldId);
      }
    }

    // 4. Carry over user custom nodes (preserving their parent hierarchy)
    const reconciledCustomNodes: Record<string, MindMapNodeBase> = {};
    for (const [cId, cNode] of Object.entries(previousModifications.customNodes || {})) {
      const matchedParent = cNode.parentId ? matchOldToNew(cNode.parentId) : null;
      const parentExists =
        (matchedParent && newKeys.has(matchedParent)) ||
        newKeys.has(cNode.parentId ?? "") ||
        Boolean(previousModifications.customNodes?.[cNode.parentId ?? ""]);

      const effectiveParentId = (matchedParent && newKeys.has(matchedParent))
        ? matchedParent
        : (parentExists ? cNode.parentId : newAiBase.rootNodeId);

      reconciledCustomNodes[cId] = {
        ...cNode,
        parentId: effectiveParentId,
      };
    }

    // 5. Preserve unmatched old nodes with user notes/overrides under user_preserved_*
    // Strips existing user_preserved_ prefix to ensure strict idempotency across multiple regenerations
    for (const [oldId, oldNode] of Object.entries(previousBaseNodes)) {
      if (!matchedOldIds.has(oldId)) {
        const hadNote = Boolean(previousNotes[oldId]);
        const hadOverride = Boolean(previousModifications.overrides[oldId]);
        if (hadNote || hadOverride) {
          const rawId = oldId.startsWith("user_preserved_")
            ? oldId.replace(/^user_preserved_/, "")
            : oldId;
          const canonicalId = `user_preserved_${rawId}`;

          const existingTitleOverride = previousModifications.overrides[oldId]?.title;
          const effectiveTitle = existingTitleOverride ?? oldNode.title;

          // If previous parent was matched to a new node, keep preserved node in that conceptual branch; otherwise attach to root
          const oldParentId = oldNode.parentId;
          const matchedParent = oldParentId ? matchOldToNew(oldParentId) : null;
          const targetParentId = matchedParent && newKeys.has(matchedParent) ? matchedParent : newAiBase.rootNodeId;

          reconciledCustomNodes[canonicalId] = {
            ...oldNode,
            id: canonicalId,
            parentId: targetParentId,
            title: effectiveTitle,
            shortDescription: oldNode.shortDescription.startsWith("[شاخه نگه‌داری‌شده")
              ? oldNode.shortDescription
              : `[شاخه نگه‌داری‌شده از نسخه قبلی] ${oldNode.shortDescription}`,
          };

          if (hadNote) {
            reconciledNotes[canonicalId] = previousNotes[oldId];
          }
          if (hadOverride) {
            reconciledOverrides[canonicalId] = previousModifications.overrides[oldId];
          }
        }
      }
    }

    // Helper to resolve an endpoint or position across exact match, custom node, or preserved canonical ID
    const resolveNodeMapping = (id: string): string | null => {
      const directMatch = matchOldToNew(id);
      if (directMatch && (newKeys.has(directMatch) || reconciledCustomNodes[directMatch])) {
        return directMatch;
      }
      if (reconciledCustomNodes[id]) return id;
      const rawId = id.startsWith("user_preserved_") ? id.replace(/^user_preserved_/, "") : id;
      const canonicalId = `user_preserved_${rawId}`;
      if (reconciledCustomNodes[canonicalId]) return canonicalId;
      return null;
    };

    // 6. Carry over user custom edges
    const reconciledCustomEdges: MindMapCustomEdge[] = [];
    for (const edge of previousModifications.customEdges ?? []) {
      const mappedSource = resolveNodeMapping(edge.source);
      const mappedTarget = resolveNodeMapping(edge.target);
      if (mappedSource && mappedTarget && mappedSource !== mappedTarget) {
        if (!reconciledDeleted.includes(mappedSource) && !reconciledDeleted.includes(mappedTarget)) {
          reconciledCustomEdges.push({
            ...edge,
            source: mappedSource,
            target: mappedTarget,
          });
        }
      }
    }

    // 7. Carry over manual node positions (Hold & Drag)
    // Only carries over manual position if the node's parent has NOT changed;
    // if the parent changed (e.g. moved under a new category), reset position so treeLayout positions it correctly under its new parent
    const reconciledPositions: Record<string, { x: number; y: number }> = {};
    for (const [posId, pos] of Object.entries(previousModifications.nodePositions ?? {})) {
      const mappedId = resolveNodeMapping(posId);
      if (mappedId && !reconciledDeleted.includes(mappedId)) {
        const oldNode = previousBaseNodes[posId] ?? previousModifications.customNodes?.[posId];
        const oldParentId = oldNode?.parentId ?? null;
        const newParentId = newNodes[mappedId]?.parentId ?? reconciledCustomNodes[mappedId]?.parentId ?? null;

        const mappedOldParentId = oldParentId ? resolveNodeMapping(oldParentId) : null;
        const parentChanged = oldParentId !== null && newParentId !== oldParentId && newParentId !== mappedOldParentId;

        if (!parentChanged) {
          reconciledPositions[mappedId] = pos;
        }
      }
    }


    return {
      kind: "mind_map",
      version: (previousPayload.version ?? 0) + 1,
      sourceType: previousPayload.sourceType ?? "reference_document",
      sourceId: previousPayload.sourceId ?? "",
      updatedAt: new Date().toISOString(),
      aiBase: newAiBase,
      userModifications: {
        deletedNodeIds: Array.from(new Set(reconciledDeleted)),
        customNodes: reconciledCustomNodes,
        overrides: reconciledOverrides,
        customEdges: reconciledCustomEdges.length > 0 ? reconciledCustomEdges : undefined,
        nodePositions: Object.keys(reconciledPositions).length > 0 ? reconciledPositions : undefined,
      },
      userNotes: reconciledNotes,
    };
  }

  /**
   * Get latest mind map for a chapter.
   */
  async getMindMap(actor: Actor, moduleId: string): Promise<GetMindMapResponse> {
    const { documentId } = await this.verifyModuleAccess(actor, moduleId);

    const latest = await this.store.findLatestCompleted(
      actor.userId,
      moduleId,
      "mind_map",
    );

    let sourceAvailable = false;
    let resolvedSourceType: MindMapSourceType | null = null;
    try {
      const source = await this.resolveEducationalSource(moduleId, documentId);
      sourceAvailable = true;
      resolvedSourceType = source.sourceType;
    } catch {
      sourceAvailable = false;
    }

    return {
      has_mind_map: Boolean(latest),
      mind_map: latest ? this.toDto(latest) : null,
      source_available: sourceAvailable,
      source_type: resolvedSourceType,
    };
  }

  /**
   * Identifies candidate intermediate/leaf nodes that represent complex scientific entities
   * (e.g. drug classes, prototype drugs, pathologies, physiological/biochemical pathways)
   * that would benefit from targeted Stage 2 Progressive Deepening.
   */
  public findCandidatesForExpansion(
    nodes: Record<string, MindMapNodeBase>,
    rootNodeId: string,
    sourceText?: string,
  ): MindMapNodeBase[] {
    const parentIds = new Set<string>();
    for (const n of Object.values(nodes)) {
      if (n.parentId) parentIds.add(n.parentId);
    }

    const depthMap = new Map<string, number>();
    depthMap.set(rootNodeId, 0);

    const getDepth = (nodeId: string, visited = new Set<string>()): number => {
      if (depthMap.has(nodeId)) return depthMap.get(nodeId)!;
      if (visited.has(nodeId)) return 99;
      visited.add(nodeId);
      const node = nodes[nodeId];
      if (!node || !node.parentId) {
        depthMap.set(nodeId, 0);
        return 0;
      }
      const d = getDepth(node.parentId, visited) + 1;
      depthMap.set(nodeId, d);
      return d;
    };

    for (const id of Object.keys(nodes)) {
      getDepth(id);
    }

    const entityKeywords = [
      "دارو", "بیماری", "سندرم", "مسیر", "مکانیسم", "مهارکننده", "آگونیست", "آنتاگونیست",
      "آنزیم", "گیرنده", "هورمون", "پاتولوژی", "پاتوفیزیولوژی", "اتیولوژی", "سنتز", "عوارض", "درمان",
      "تشخیص", "پیش‌ساز", "الکترولیت", "کلیه", "قلب", "کبد",
      "drug", "syndrome", "pathway", "mechanism", "inhibitor", "agonist", "receptor",
      "enzyme", "synthesis", "adverse", "therapy", "pathology", "etiology",
    ];

    const candidates: Array<{ node: MindMapNodeBase; score: number }> = [];

    for (const [id, node] of Object.entries(nodes)) {
      if (id === rootNodeId) continue;
      const depth = depthMap.get(id) ?? 0;
      if (depth < 1 || depth > 4) continue;

      const childrenCount = Object.values(nodes).filter((n) => n.parentId === id).length;

      // Exclude generic container/introductory headings (e.g. "معرفی داروها", "کلیات بیماری‌ها", "دسته‌بندی کلی")
      const isContainerHeading = /^(معرفی|کلیات|مقدمه|آشنایی|فهرست|دسته‌بندی کلی|بررسی کلی)/i.test(node.title.trim());
      if (isContainerHeading) {
        continue;
      }

      // Check if node represents a Category or Subcategory
      const isExplicitCategory = node.nodeRole === "category";
      const isCategoryByTitle =
        /^(داروهای|بیماری‌های|سندرم‌های|مهارکننده‌های|آنتاگونیست‌های|آگونیست‌های|انواع|دسته‌بندی|گروه|کلاس|مشتقات|مسیرهای|مراحل|عوامل)/i.test(node.title.trim()) ||
        /^(داروها|بیماری‌ها|سندرم‌ها|مهارکننده‌ها|آنتاگونیست‌ها|آگونیست‌ها|مشتقات|آنزیم‌ها|هورمون‌ها|گیرنده‌ها)/i.test(node.title.trim()) ||
        /(های|ها)$/i.test(node.title.trim());
      const isCategory = isExplicitCategory || isCategoryByTitle;

      // Pruning rules based on node role:
      // - Category nodes: do NOT automatically exclude at 2 children; only skip if already richly branched (>= 4 children)
      // - Concept nodes: 2 or more children (e.g. mechanism + adverse effects) means it's already well developed
      if (isCategory) {
        if (childrenCount >= 4) continue;
      } else {
        if (childrenCount >= 2) continue;
      }

      const normTitle = normalizePersianText(node.title);
      const nodeTextCombined = `${node.title} ${node.shortDescription}`;
      const normNodeText = normalizePersianText(nodeTextCombined);
      let scientificScore = 0;

      for (const kw of entityKeywords) {
        if (normNodeText.includes(normalizePersianText(kw))) scientificScore += 8;
      }

      if (/(زون|لول|پریل|استاتین|کورتیکوئید|سیکلین|مایسین|آزول|ید|تین|پرازول|ویر|مب)$/i.test(node.title.trim())) {
        scientificScore += 20;
      }

      // Category and Subcategory Boost:
      // Categories and subcategories need strong incentive so they don't get outranked by single drug suffixes
      let categoryBoost = 0;
      if (isCategory) {
        categoryBoost = 25;
      }

      // Compound title detection: e.g. "الف و ب" where parts represent distinct scientific entities
      let compoundScore = 0;
      if (node.title.includes(" و ") || node.title.includes("،") || node.title.includes(",")) {
        const parts = node.title.split(/(?:\s+و\s+|[،,])/).map((p) => p.trim()).filter((p) => p.length >= 3);
        if (parts.length >= 2) {
          const hasScientificParts = parts.some(
            (p) =>
              entityKeywords.some((kw) => p.includes(kw)) ||
              /(زون|لول|پریل|استاتین|کورتیکوئید|سیکلین|مایسین|آزول|ید|تین|پرازول|ویر|مب|ها|های)$/i.test(p),
          );
          if (hasScientificParts) {
            compoundScore = 25;
          }
        }
      }

      // Incompleteness score:
      // 1. Category with 0 children: Critical terminal category defect -> highest priority (+45)
      // 2. Category with 1 child: Highly incomplete -> (+30)
      // 3. Category with 2 or 3 children: Potentially has more documented members in source -> (+15)
      // 4. Concept with 0 children: Leaf concept wanting mechanism/adverse details -> (+25)
      // 5. Concept with 1 child: (+15)
      let incompletenessScore = 0;
      if (isCategory) {
        if (childrenCount === 0) incompletenessScore = 45;
        else if (childrenCount === 1) incompletenessScore = 30;
        else incompletenessScore = 15;
      } else {
        if (childrenCount === 0) incompletenessScore = 25;
        else incompletenessScore = 15;
      }

      if (node.shortDescription && (node.shortDescription.includes(" و ") || node.shortDescription.length > 40)) {
        incompletenessScore += 15;
      }

      // Source grounding score with Persian normalization (handling Yeh, Kaf, ZWNJ, and plural suffixes):
      let sourceCoverageScore = 0;
      if (sourceText && sourceText.length > 0) {
        const normSource = normalizePersianText(sourceText);

        if (normTitle.length >= 3) {
          // Check exact normalized title or plural stem match (e.g. "بتابلوکر" vs "بتابلوکرها")
          let matched = normSource.includes(normTitle);
          if (!matched && normTitle.endsWith("ها") && normTitle.length > 4) {
            matched = normSource.includes(normTitle.slice(0, -2));
          } else if (!matched && normTitle.endsWith("های") && normTitle.length > 5) {
            matched = normSource.includes(normTitle.slice(0, -3));
          }

          if (matched) {
            const escaped = normTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const occurrences = (normSource.match(new RegExp(escaped, "g")) || []).length;
            sourceCoverageScore = Math.min(30, Math.max(10, occurrences * 10));
          } else if (scientificScore === 0) {
            // Only apply negative penalty if the node also lacks any scientific nomenclature
            sourceCoverageScore = -20;
          }
        }
      }

      const totalScore = scientificScore + categoryBoost + compoundScore + incompletenessScore + sourceCoverageScore + (depth === 2 ? 15 : depth === 3 ? 10 : 5);

      // Only nodes with real scientific value, incompleteness, and source backing qualify
      if (totalScore >= 35 && (scientificScore > 0 || sourceCoverageScore > 0 || isCategory)) {
        candidates.push({ node, score: totalScore });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 5).map((c) => c.node);
  }

  public async expandBranchesBatched(
    _actor: Actor,
    moduleId: string,
    documentId: string | null,
    organizationId: OrganizationId,
    correlationId: string,
    candidateNodes: MindMapNodeBase[],
    currentTree: MindMapAiBase,
    sourceText: string,
  ): Promise<Record<string, MindMapNodeBase>> {
    if (candidateNodes.length === 0) {
      return currentTree.nodes;
    }

    const candidateSummaries = candidateNodes.map((n) => {
      const existingChildren = Object.values(currentTree.nodes)
        .filter((c) => c.parentId === n.id)
        .map((c) => ({ id: c.id, title: c.title }));

      const isExplicitCat = n.nodeRole === "category";
      const isCatByTitle =
        /^(داروهای|بیماری‌های|سندرم‌های|مهارکننده‌های|آنتاگونیست‌های|آگونیست‌های|انواع|دسته‌بندی|گروه|کلاس|مشتقات|مسیرهای|مراحل|عوامل)/i.test(
          n.title.trim(),
        ) ||
        /^(داروها|بیماری‌ها|سندرم‌ها|مهارکننده‌ها|آنتاگونیست‌ها|آگونیست‌ها|مشتقات|آنزیم‌ها|هورمون‌ها|گیرنده‌ها)/i.test(
          n.title.trim(),
        ) ||
        /(های|ها)$/i.test(n.title.trim());

      return {
        id: n.id,
        title: n.title,
        parentId: n.parentId,
        role: n.nodeRole ?? (isExplicitCat || isCatByTitle ? "category" : "concept"),
        shortDescription: n.shortDescription,
        existingChildren: existingChildren.length > 0 ? existingChildren : undefined,
      };
    });

    const systemPrompt = `شما موتور تخصصی بسط و انشعاب تحلیلی مفاهیم در نقشه مفهومی علوم پزشکی و آموزشی آوانا (AVANA) هستید.
وظیفه شما گسترش علمی، دقیق و چندسطحی گره‌های مشخص‌شده بر اساس متن آموزشی منبع است.

اصول و قوانین الزامی:
۱. خروجی فقط یک شیء JSON با کلید "newNodes" باشد که دیکشنری گره‌های جدید منشعب‌شده است:
   { "newNodes": { "node_...": { "id": "...", "parentId": "...", "title": "...", "shortDescription": "...", "keyPoints": ["..."], "examTips": ["..."], "nodeRole": "..." } } }

۲. انشعاب هدفمند متناسب با ماهیت و نقش هر گره (Nature-Adaptive Branching):
   پیش از تولید زیرشاخه‌ها، نقش گره (role) و عنوان آن را ارزیابی کنید:
   الف) اگر گره کاندید Category یا Subcategory است (مانند رده دارویی، گروه بیماری، مسیر کلی، یا عنوان‌های جمع/مرکب):
       - اولویت اول و قطعی: استخراج و تفکیک اعضا، زیرگروه‌ها یا مفاهیم و داروهای مشخص ذکرشده در منبع به عنوان فرزندان مستقل (Concept Nodes).
       - قانون اکید: برای یک دسته دارویی یا علمی، هرگز نباید مستقیماً گره‌های مکانیسم اثر یا عوارض جانبی ساخته شود، در حالی که داروها یا اعضای مشخص زیرمجموعه آن هنوز به عنوان گره مستقل در درخت وجود ندارند!
       - اگر گره دارای existingChildren است، فرزندان موجود را تکرار نکنید؛ بلکه اعضا یا زیرگروه‌های مهم دیگر موجود در متن منبع را اضافه کنید.
   ب) اگر گره کاندید یک Concept مشخص است (داروی معین، بیماری مشخص، آنزیم خاص):
       - در صورت وجود اطلاعات کافی در منبع، ابعاد و شاخه‌های اختصاصی آن مفهوم به عنوان فرزند تولید شوند:
         * برای داروها: مکانیسم اثر، کاربردهای بالینی، عوارض جانبی و نکات پایش.
         * برای بیماری‌ها: اتیولوژی، پاتوفیزیولوژی، تظاهرات بالینی، تشخیص، درمان.
         * برای بیوشیمی/فیزیولوژی: پیش‌سازها، آنزیم‌ها و واکنش‌های کلیدی، مراحل تنظیمی، اهمیت بالینی.
   ج) اگر در متن منبع برای یک گره، اطلاعات یا اعضای بیشتری وجود ندارد، به هیچ وجه برای آن گره زیرشاخه تصنعی، فرضی یا خارج از منبع نسازید.

۳. الزامات کیفی توضیحات و نکات (کیفیت غیرقابل‌مذاکره):
   - هر گره جدید باید علاوه بر title دارای یک shortDescription کاملاً علمی، دقیق، مستقل، خودبسنده و غنی (۲ الی ۳ جمله پیوسته) باشد که روابط علت و معلولی و جزئیات تخصصی آن مفهوم را تشریح کند. از عبارات کوتاه، تلگرافی یا برچسب‌گونه اکیداً خودداری کنید.
   - هر گره جدید باید دارای ۱ الی ۲ نکته کلیدی متراکم و ارزشمند (keyPoints) و در صورت وجود نکته آزمونی (examTips) متناسب با ماهیت مفهوم باشد.
   - تکرار مکانیکی یا انتقال محتوای ضروری shortDescription به keyPoints ممنوع است؛ keyPoints باید ارزش افزوده آموزشی تازه داشته باشد.

۴. ساختار سلسله‌مراتبی و شناسه‌ها:
   - فیلد parentId هر گره جدید باید یا شناسه یکی از گره‌های کاندید باشد، یا شناسه یکی از گره‌های فرزند جدیدی که در همین پاسخ می‌سازید (ایجاد زنجیره والد-فرزند جدید برای زیردسته -> مفاهیم مشخص کاملاً مجاز است).
   - ایجاد هرگونه حلقه (Cycle)، گره بدون والد، یا خودوالدی (node.parentId === node.id) اکیداً ممنوع است.
   - نام‌گذاری شناسه‌ها باید معنادار و پایدار به فرمت node_<concept_slug> باشد.
   - عناوین (title) کوتاه، علمی و گویا (۱ الی ۴ کلمه) باشند.
   - وفاداری کامل به منبع: تمام اطلاعات باید مستند به متن منبع باشد. از هرگونه اطلاعات ساختگی یا دوز فرضی بپرهیزید.
۵. در سطح مفاهیم اتمیک متوقف شوید و از ساختن شاخه‌های مصنوعی یا تکراری خودداری کنید.`;

    // Retrieve targeted reference chunks for the selected candidate nodes if documentId and chunkStore exist
    let targetedChunksText = "";
    if (documentId && this.chunkStore && candidateNodes.length > 0) {
      try {
        const allChunks = await this.chunkStore.listByDocument(documentId as DocumentId);
        const validChunks = allChunks.filter((c) => c.content && c.content.trim().length > 30);
        if (validChunks.length > 0) {
          const targetedSections: string[] = [];
          const seenChunkIds = new Set<string>();

          for (const cand of candidateNodes) {
            const candTitleNorm = normalizePersianText(cand.title);
            if (candTitleNorm.length < 3) continue;

            const matchingChunks = validChunks
              .filter((c) => {
                if (seenChunkIds.has(String(c.id))) return false;
                const headNorm = normalizePersianText(c.heading ?? "");
                const bodyNorm = normalizePersianText(c.content);
                return headNorm.includes(candTitleNorm) || bodyNorm.includes(candTitleNorm);
              })
              .slice(0, 2); // Max 2 relevant chunks per candidate

            if (matchingChunks.length > 0) {
              const formattedChunks = matchingChunks
                .map(
                  (c) =>
                    `[چانک ${c.sequence ?? c.id} | صفحه ${c.startPage}-${c.endPage}${c.heading ? ` | ${c.heading}` : ""}]:\n${c.content.trim().slice(0, 3000)}`,
                )
                .join("\n\n");

              targetedSections.push(
                `--- محتوای مرجع اختصاصی برای مفهوم «${cand.title}» (شناسه: ${cand.id}) ---\n${formattedChunks}`,
              );

              for (const mc of matchingChunks) {
                seenChunkIds.add(String(mc.id));
              }
            }
          }

          if (targetedSections.length > 0) {
            targetedChunksText = `\n\n--- بخش‌های مرجع تکمیلی و اختصاصی گره‌های کاندید ---\n` + targetedSections.join("\n\n");
          }
        }
      } catch {
        // Graceful fallback: chunk retrieval errors must never fail the generation process
      }
    }

    // Enforce clear input text cap for Stage 2 (max 25,000 characters total)
    const baseSourceSlice = sourceText.slice(0, 15_000);
    const enrichedSource = (baseSourceSlice + targetedChunksText).slice(0, 25_000);

    const userPrompt = `متن معتبر منبع آموزشی:
${enrichedSource}

گره‌های کاندید برای گسترش تحلیلی:
${JSON.stringify(candidateSummaries, null, 2)}

لطفاً زیرشاخه‌های تحلیلی لازم برای گره‌های فوق را در قالب JSON با ساختار { "newNodes": { ... } } تولید کنید:`;

    try {
      const response = await this.gateway.complete({
        promptVersion: "2.0-progressive",
        correlationId: `${correlationId}_stage2`,
        documentId: (documentId ?? moduleId) as DocumentId,
        organizationId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        jsonSchema: { type: "mind_map" },
        stage: "review_summary",
      });

      const parsed = cleanAndParseJson<{ newNodes?: Record<string, unknown> }>(
        response.text,
        "mind_map_progressive",
      );

      const rawNewNodes = parsed.newNodes;
      if (!rawNewNodes || typeof rawNewNodes !== "object" || Array.isArray(rawNewNodes)) {
        return currentTree.nodes;
      }

      const mergedNodes: Record<string, MindMapNodeBase> = { ...currentTree.nodes };
      const existingKeys = new Set(Object.keys(mergedNodes));
      const candidateIds = new Set(candidateNodes.map((c) => c.id));
      const primaryCandidateId = candidateNodes[0]?.id || currentTree.rootNodeId;

      for (const [key, val] of Object.entries(rawNewNodes)) {
        if (!val || typeof val !== "object" || Array.isArray(val)) continue;
        const n = val as Record<string, unknown>;
        let rawId = typeof n.id === "string" && n.id.trim().length > 0 ? n.id.trim() : key.trim();
        const title = typeof n.title === "string" ? n.title.trim() : "";
        let parentId = typeof n.parentId === "string" ? n.parentId.trim() : "";

        if (!rawId || !title) continue;

        // Disambiguate duplicate ID or collision with existing tree nodes
        if (existingKeys.has(rawId)) {
          // If identical to existing node, skip re-declaration
          if (mergedNodes[rawId] && mergedNodes[rawId].title.trim() === title.trim()) {
            continue;
          }
          let dupCounter = 2;
          while (existingKeys.has(`${rawId}_ext_${dupCounter}`)) {
            dupCounter++;
          }
          rawId = `${rawId}_ext_${dupCounter}`;
        }

        // Self-Parent healing: if new node has parentId === rawId
        if (!parentId || parentId === rawId) {
          parentId = candidateIds.has(rawId) ? currentTree.rootNodeId : primaryCandidateId;
        } else if (!mergedNodes[parentId] && !rawNewNodes[parentId]) {
          // Orphan parent in Stage 2 -> connect to candidate node
          parentId = primaryCandidateId;
        }

        if (Object.keys(mergedNodes).length >= 115) break;

        const shortDesc = typeof n.shortDescription === "string" ? n.shortDescription.trim() : "";
        const keyPoints = Array.isArray(n.keyPoints)
          ? n.keyPoints.filter((k): k is string => typeof k === "string").map((k) => k.trim())
          : [];
        const examTips = Array.isArray(n.examTips)
          ? n.examTips.filter((t): t is string => typeof t === "string").map((t) => t.trim())
          : [];

        const structuredDetails = cleanStructuredDetails(n.structuredDetails);
        mergedNodes[rawId] = {
          id: rawId,
          parentId,
          title: title.slice(0, 120),
          shortDescription: shortDesc.slice(0, 600),
          keyPoints,
          examTips,
          category: typeof n.category === "string" ? (n.category as any) : undefined,
          nodeRole: n.nodeRole === "category" || n.nodeRole === "concept" ? n.nodeRole : undefined,
          structuredDetails,
          sortOrder: typeof n.sortOrder === "number" ? n.sortOrder : 0,
        };

        // Immediately update existingKeys so subsequent new nodes won't collide
        existingKeys.add(rawId);
      }

      const candidateAiBase: MindMapAiBase = {
        ...currentTree,
        nodes: mergedNodes,
      };

      const { sanitized } = this.sanitizeAiMindMapTree(candidateAiBase, currentTree.rootNodeId);
      try {
        const validated = validateMindMapAiBase(sanitized);
        return validated.nodes;
      } catch {
        return currentTree.nodes;
      }
    } catch {
      return currentTree.nodes;
    }
  }

  /**
   * Bounded automated completion pass for nodes lacking supplementary content.
   * Runs inside the generation pipeline before saving the mind map.
   * Completely background/server-side; requires zero user clicks or popup buttons.
   *
   * Enforces:
   * 1. Max 1 bounded Gemini call to enrich only the missing nodes.
   * 2. Anti-cliche, anti-duplication, strict grounding checks.
   * 3. Accurately tracks and reports unresolvedNodeIds if source lacks sufficient info.
   */
  public async ensureAllNodesHaveSupplementaryContent(
    currentTree: MindMapAiBase,
    sourceText: string,
    correlationId?: string,
    organizationId?: OrganizationId,
    documentId?: DocumentId | string | null,
  ): Promise<{ nodes: Record<string, MindMapNodeBase>; unresolvedNodeIds: string[] }> {
    const allNodes: Record<string, MindMapNodeBase> = {};
    for (const [id, node] of Object.entries(currentTree.nodes)) {
      allNodes[id] = { ...node };
    }

    const missingNodeIds = Object.keys(allNodes).filter(
      (id) => !hasValidSupplementaryContent(allNodes[id]),
    );

    if (missingNodeIds.length === 0) {
      return { nodes: allNodes, unresolvedNodeIds: [] };
    }

    // Bounded batch: limit to at most 15 missing nodes to prevent token overload
    const batchToEnrich = missingNodeIds.slice(0, 15);
    const candidateNodesSummary = batchToEnrich.map((id) => ({
      id,
      title: allNodes[id].title,
      shortDescription: allNodes[id].shortDescription,
      category: allNodes[id].category ?? "general",
    }));

    try {
      const enrichmentSystemPrompt = `شما دستیار تخصصی تکمیل نکات آموزشی تکمیلی نقشه مفهومی در پلتفرم آوانا (AVANA) هستید.
وظیفه شما استخراج ۱ الی ۲ نکته کلیدی پرمغز و متراکم (keyPoints) و در صورت وجود ۱ نکته آزمونی/افتراقی (examTips) برای گره‌های ارائه‌شده بر اساس متن منبع است.

قواعد اکید:
۱. خروجی فقط یک شیء JSON با ساختار:
   { "supplementary": { "<node_id>": { "keyPoints": ["..."], "examTips": ["..."] } } }
۲. تکرار، بازنویسی یا تلخیص عنوان گره یا توضیح اولیه (shortDescription) اکیداً ممنوع است.
۳. از جملات کلیشه‌ای و مبهم («بسیار مهم است»، «کاربردهای مختلف دارد») اکیداً خودداری کنید.
۴. وفاداری به منبع: اگر مفهوم در منبع اطلاعات خاصی ندارد، آرایه خالی بگذارید؛ اطلاعات ساختگی یا دوز فرضی تولید نکنید.
۵. هر نکته باید کوتاه، دقیق و حاوی ارزش آموزشی تازه باشد.`;

      const enrichmentUserPrompt = `متن منبع آموزشی:
${sourceText.slice(0, 18000)}

گره‌های نیازمند محتوای تکمیلی:
${JSON.stringify(candidateNodesSummary, null, 2)}`;

      const response = await this.gateway.complete({
        promptVersion: "2.0-deep",
        correlationId: correlationId || randomUUID(),
        organizationId: organizationId as OrganizationId,
        documentId: (documentId ?? randomUUID()) as DocumentId,
        messages: [
          { role: "system", content: enrichmentSystemPrompt },
          { role: "user", content: enrichmentUserPrompt },
        ],
        jsonSchema: { type: "mind_map" },
        stage: "review_summary",
      });

      const parsed = cleanAndParseJson<{
        supplementary?: Record<
          string,
          { keyPoints?: string[]; examTips?: string[]; structuredDetails?: unknown }
        >;
        nodes?: Record<
          string,
          { keyPoints?: string[]; examTips?: string[]; structuredDetails?: unknown }
        >;
      }>(response.text, "mind_map");

      const suppMap = parsed.supplementary || parsed.nodes;
      if (suppMap && typeof suppMap === "object") {
        for (const [nodeId, supp] of Object.entries(suppMap)) {
          if (!allNodes[nodeId] || !supp) continue;
          const node = allNodes[nodeId];

          if (Array.isArray(supp.keyPoints)) {
            const validKeys = supp.keyPoints.filter(
              (k): k is string =>
                typeof k === "string" &&
                k.trim().length >= 8 &&
                !isDuplicateOfNodeContent(k, node) &&
                !isClicheEducationalContent(k),
            );
            if (validKeys.length > 0) {
              node.keyPoints = [...(node.keyPoints || []), ...validKeys].slice(0, 3);
            }
          }

          if (Array.isArray(supp.examTips)) {
            const validTips = supp.examTips.filter(
              (t): t is string =>
                typeof t === "string" &&
                t.trim().length >= 8 &&
                !isDuplicateOfNodeContent(t, node) &&
                !isClicheEducationalContent(t),
            );
            if (validTips.length > 0) {
              node.examTips = [...(node.examTips || []), ...validTips].slice(0, 2);
            }
          }

          if (supp.structuredDetails) {
            const cleanSd = cleanStructuredDetails(supp.structuredDetails);
            if (cleanSd) {
              node.structuredDetails = { ...(node.structuredDetails || {}), ...cleanSd };
            }
          }
        }
      }
    } catch {
      // Bounded retry failure handled gracefully without masking
    }

    const unresolvedNodeIds = Object.keys(allNodes).filter(
      (id) => !hasValidSupplementaryContent(allNodes[id]),
    );

    return { nodes: allNodes, unresolvedNodeIds };
  }

  /**
   * Generates (or regenerates) an Interactive AI Mind Map for a chapter.
   */
  async generateMindMap(
    actor: Actor,
    moduleId: string,
    correlationId?: string,
  ): Promise<GenerateMindMapResponse> {
    const cid = correlationId || randomUUID();
    const overallStart = Date.now();
    let currentStage: MindMapLifecycleStage = "REQUEST_RECEIVED";
    let stageStart = Date.now();
    let courseId: CourseId | null = null;
    let recordId: string | null = null;
    let pendingCreated = false;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const startHeartbeat = (id: string, workerId: string) => {
      heartbeatTimer = setInterval(async () => {
        try {
          const extended = new Date(Date.now() + PERSONAL_MINDMAP_LEASE_DURATION_MS);
          await this.store.updateHeartbeat(id, workerId, extended);
        } catch {
          // suppress heartbeat errors
        }
      }, MINDMAP_HEARTBEAT_INTERVAL_MS);
    };

    try {
      // 1. STAGE: REQUEST_RECEIVED
      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "REQUEST_RECEIVED",
        correlationId: cid,
        moduleId,
        courseId: null,
        userId: actor.userId,
        durationMs: 0,
        status: "SUCCESS",
      });

      // 2. STAGE: MODULE_RESOLVED
      currentStage = "MODULE_RESOLVED";
      stageStart = Date.now();
      const moduleAccess = await this.verifyModuleAccess(actor, moduleId);
      courseId = moduleAccess.courseId;
      const { organizationId, moduleTitle, documentId } = moduleAccess;

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "MODULE_RESOLVED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: Date.now() - stageStart,
        status: "SUCCESS",
        details: {
          moduleTitle,
          organizationId,
          hasDocument: Boolean(documentId),
        },
      });

      // 3. STAGE: SOURCE_RESOLVED
      currentStage = "SOURCE_RESOLVED";
      stageStart = Date.now();
      const source = await this.resolveEducationalSource(moduleId, documentId);

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "SOURCE_RESOLVED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: Date.now() - stageStart,
        status: "SUCCESS",
        details: {
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          citationsCount: source.sourceCitations.length,
        },
      });

      // 4. STAGE: SOURCE_CONTENT_LOADED
      currentStage = "SOURCE_CONTENT_LOADED";
      stageStart = Date.now();
      const sourceTextLength = source.sourceText.length;
      if (sourceTextLength < 30) {
        throw new DomainError(
          "bad_request",
          "متن منبع آموزشی استخراج‌شده برای تولید مایندمپ ناکافی است.",
        );
      }

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "SOURCE_CONTENT_LOADED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: Date.now() - stageStart,
        status: "SUCCESS",
        details: {
          sourceLength: sourceTextLength,
        },
      });

      // Check active in-flight lease to prevent concurrency conflicts
      const activePending = await this.store.findActivePending(
        actor.userId,
        moduleId,
        "mind_map",
      );
      if (activePending && (!activePending.leaseExpiresAt || new Date(activePending.leaseExpiresAt) > new Date())) {
        throw new DomainError(
          "conflict",
          "فرآیند تولید مایندمپ برای این سرفصل در حال انجام است. لطفاً شکیبا باشید.",
        );
      }

      const previousCompleted = await this.store.findLatestCompleted(
        actor.userId,
        moduleId,
        "mind_map",
      );

      const nextVersion = await this.store.getNextVersion(
        actor.userId,
        moduleId,
        "mind_map",
      );

      recordId = randomUUID();
      const workerId = `worker_${process.pid}_${Date.now()}`;
      const leaseExpiresAt = new Date(Date.now() + PERSONAL_MINDMAP_LEASE_DURATION_MS);

      const snapshot: import("@avana/contracts").PersonalContentSnapshot = {
        capturedAt: new Date().toISOString(),
        moduleId,
        moduleTitle,
        courseId,
        totalHighlights: 0,
        totalNotes: 0,
        items: [],
      };

      await this.store.createPending({
        id: recordId,
        userId: actor.userId,
        courseId,
        moduleId,
        contentType: "mind_map",
        version: nextVersion,
        status: "pending",
        inputSnapshot: snapshot,
        highlightsCount: 0,
        notesCount: 0,
        costToman: 0,
        idempotencyKey: `mm_gen_${actor.userId}_${moduleId}_v${nextVersion}`,
        workerId,
        leaseExpiresAt,
      });
      pendingCreated = true;
      startHeartbeat(recordId, workerId);

      const systemPrompt = `شما موتور تخصصی طراحی نقشه‌های مفهومی عمیق، علمی و چندسطحی (Deep Multi-Level Concept Maps) در پلتفرم علوم پزشکی و داروشناسی آوانا (AVANA) هستید.
وظیفه شما استخراج نقشه مفهومی غنی، ساختارمند و با معماری سلسله‌مراتبی معنادار از کل به جزء بر اساس متن آموزشی منبع است.

اصول و قواعد الزامی ساختار درختی:
۱. خروجی فقط و فقط یک شیء JSON معتبر منطبق بر اسکیمای مشخص‌شده باشد (بدون هیچ متن توضیحی قبل یا بعد از JSON). سقف فنی کل گره‌های نقشه حداکثر ۱۲۰ گره است، بنابراین بر روی مفاهیم ساختاری و آموزشی باارزش متمرکز شوید.
۲. ساختار شامل یک گره ریشه (rootNodeId: "root") و دیکشنری nodes است.
۳. ساختاردهی کلان و سلسله‌مراتبی از کل به جزء (Hierarchical Educational Decomposition):
   شما باید ابتدا ساختار آموزشی موضوع را تحلیل کرده و محورها و دسته‌های کلان مفهومی را شناسایی کنید.
   - گره‌های هم‌موضوع را هرگز به صورت انبوه و مسطح مستقیماً به ریشه (root) متصل نکنید. مفاهیمی که زیرمجموعه یک حوزه درمانی، تشخیصی، پاتوفیزیولوژی، داروشناسی یا مکانیسمی مشترک هستند، باید ابتدا زیر یک گره دسته‌بندی واسط با شناسه والد مشخص ("parentId") قرار گیرند، و سپس زیرشاخه‌ها و مفاهیم اتمیک به عنوان فرزندان آن دسته تعریف شوند.
   - برای هر گره دسته‌بندی که نقش هاب ساختاری و چتر مفهومی برای چند گره زیرمجموعه دارد، فیلد "nodeRole": "category" را درج کنید. برای مفاهیم مشخص مقدار "nodeRole": "concept" درج شود.
   - جلوگیری از تجمیع دسته‌های مستقل (No Compound Category Nodes): دو یا چند دسته یا زیرگروه علمی مستقل را هرگز در یک عنوان واحد با «و» یا ویرگول ادغام نکنید (مانند «آلکالوئیدهای وینکا و تاکسان‌ها» که یک ساختار نامطلوب است؛ این دو باید دو گره مجزا با شناسه‌های مستقل باشند: یکی «آلکالوئیدهای وینکا» و دیگری «تاکسان‌ها»، و هر کدام به داروهای مشخص خود در متن منبع منشعب شوند).
   - انشعاب الزامی دسته‌ها به مفاهیم مشخص (No Terminal Category Nodes): هرگاه یک گره نماینده مجموعه‌ای از چند مفهوم مستقل باشد (Category یا Subcategory)، در صورت ذکر اعضا در متن منبع، نباید بدون انشعاب زیرمجموعه‌هایش به عنوان انتهای شاخه (Leaf Node) رها شود:
     * رده دارویی کلان (Category) ← زیرگروه‌های دارویی (Subcategory) ← داروهای مشخص (Concept Nodes) ← ابعاد ضروری (Detail Nodes)
     * گروه بیماری‌ها (Category) ← انواع بیماری (Subcategory) ← بیماری مشخص (Concept)
     * مسیر متابولیک (Category) ← مراحل اصلی (Subcategory) ← آنزیم‌ها یا واسطه‌های مشخص (Concept)
   - ساختار باید منعطف و کاملاً متناسب با موضوع و محتوای منبع طراحی شود (نه یک taxonomy صلب). در صورت وجود فقط یک مفهوم برای یک دسته در متن منبع، تنها همان یک مفهوم تولید شود و شاخه مصنوعی یا خارج از منبع اضافه نشود.
   - مفاهیم واقعاً مستقل: اگر مفهومی در منبع وجود دارد که ماهیتاً مستقل است و به هیچ دسته مشترکی تعلق ندارد (مانند تعریف کلی موضوع، یا یک نکته کلینیکی خاص)، آن را مستقل نگه دارید و مستقیماً با "parentId": "root" متصل کنید. هیچ سقف عددی صلب یا اجباری برای فرزندان ریشه وجود ندارد و نباید دسته‌های مصنوعی مانند «سایر موارد» یا «متفرقه» ساخته شوند.
   - از ایجاد دسته‌بندی بیش‌ازحد و لایه‌های زائد که عمق را بدون محتوای علمی افزایش می‌دهند خودداری کنید (سقف مجاز عمق ۸ است، عمق مطلوب بین ۳ الی ۶ سطح است).
۴. تفکیک ساختاری شاخه‌ها و نقش مکمل محتوای تکمیلی (keyPoints و examTips):
   - هر مفهوم مستقل یا دارای انشعاب علمی (مانند مکانیسم اثر، گیرنده‌ها و مسیرهای بیوشیمیایی، کاربردهای بالینی، یا عوارض جانبی و نکات پایش) حتماً باید یک گره مستقل (Child Node) با شناسه مجزا باشد. هرگز مفاهیم ساختاری و شاخه‌های علمی را درون فیلد keyPoints یک گره فشرده نکنید؛ درخت باید به طور عمیق و سلسله‌مراتبی منشعب شود.
   - نقش مکمل (و نه جایگزین) محتوای تکمیلی: فیلدهای keyPoints و examTips مکمل تحلیلی توضیح اصلی هستند، نه جایگزین آن. منع تکرار نباید هرگز به حذف اطلاعات علمی ضروری، روابط علت و معلولی، نام آنزیم‌ها، گیرنده‌ها، سوبستراها یا کوفاکتورها از shortDescription منجر شود.
   - ارزش افزوده واقعی نکات تکمیلی:
     * گره‌های ریشه و دسته‌بندی (nodeRole: "category"): نقشه راه یادگیری، روابط کلان مفهومی، و خطاهای رایج درک ارتباط مفاهیم.
     * گره‌های نهادی و مفهومی (داروها، بیماری‌ها، پدیده‌ها): مرواریدهای بالینی، ترجیحات دارویی، تمایزهای ظریف با موارد مشابه، تله‌های تشخیصی.
     * گره‌های پایانی (Leaves): نکات طلایی آزمونی، استثناها، شرایط احتیاط یا منع مصرف، خطاهای رایج داوطلبان.
   - معیار تکمیل محتوا: وجود حداقل یک نکته تکمیلی معتبر در فیلد مناسب (keyPoints یا examTips یا structuredDetails) متناسب با ظرفیت آموزشی مفهوم؛ نیازی به پر کردن اجباری و تصنعی تمام فیلدها برای همه گره‌ها نیست.
   - منع اکید کلی‌گویی و عبارات عامیانه: از عبارات مبهم مانند «بسیار مهم است»، «نقش مهمی ایفا می‌کند»، «کاربردهای فراوانی دارد» خودداری کنید.
   - وفاداری کامل و عدم هذیان: تمام اطلاعات دارویی، مکانیسم‌ها و نکات باید مستند به متن منبع باشند. از تولید اطلاعات ساختگی یا دوزهای غیرمستند اکیداً بپرهیزید.
۵. عنوان، توضیح علمی بنیادین (shortDescription) و نقش گره‌ها:
   - عنوان هر گره (title) بسیار کوتاه، واضح، علمی و قابل مرور در یک نگاه باشد (۱ الی ۴ کلمه). نام‌های ژنریک و اصطلاحات علمی حفظ شوند.
   - توضیح علمی بنیادین (shortDescription) - قلب آموزشی گره:
     * shortDescription باید یک توضیح علمی مستقل، عمیق، غنی و خودبسنده باشد؛ نه صرفاً یک برچسب، تعریف لغوی یا تیتر تلگرافی.
     * برای مفاهیم علمی، مکانیسم‌ها، آنزیم‌ها، گیرنده‌ها، مسیرهای بیوشیمیایی و فرآیندهای پاتوفیزیولوژیک، حتماً جزئیات ضروری (شامل روابط علت و معلولی، پیش‌سازها، سوبستراها، محصولات، کوفاکتورها/کوآنزیم‌ها، اندامک درگیر و پیامدهای عملکردی) در خودِ shortDescription تشریح شوند.
     * طول و عمق توضیح باید متناسب با پیچیدگی مفهوم باشد: برای مفاهیم چندمرحله‌ای یا مرکب، از ۲ الی ۳ جمله علمی دقیق و پیوسته استفاده کنید و از تقلیل دادن آن به یک عبارت تک‌خطی ناقص بپرهیزید. در مفاهیم ساده و بدیهی، از اطناب غیرضروری خودداری کنید.
     * تمام گره‌های جدید درخت باید توضیحات اختصاصی، علمی و مستقل خود را داشته باشند و نباید توضیح گره والد در گره‌های فرزند عیناً تکرار شود.
   - فیلد category ("drug" | "disease" | "cellular_mechanism" | "biochemistry" | "general") برای تمام گره‌های مفهومی متناسب با ماهیت علمی درج شود.
   - فیلد nodeRole: برای گره‌های دسته‌بندی مقدار "category" و برای سایر گره‌های مفهومی مقدار "concept" (یا عدم درج).
   - فیلد semanticGroup اختیاری است و می‌تواند برای مشخص کردن تم مشترک شاخه‌ها استفاده شود، اما رابطه واقعی والد و فرزندی منحصراً با parentId تعیین می‌شود.
۶. وفاداری کامل به منبع (Strict Grounding):
   تمام گره‌ها، داروها و مکانیسم‌ها باید مستند به متن منبع باشند. از وارد کردن هرگونه اطلاعات ساختگی، فرضی یا خارج از منبع اکیداً خودداری کنید.
   اگر منبع فاقد اطلاعات عمیق‌تر برای یک شاخه است، شاخه در همان سطح اطلاعات موجود متوقف شود.
۷. معیار توقف اتمیک و مدیریت هوشمند بودجه گره‌ها:
   در سطح مفاهیم اتمیک متوقف شوید. تعداد کل گره‌ها باید متناسب با حجم، گستردگی و پیچیدگی علمی متن منبع باشد (معمولاً بین ۲۵ الی ۶۰ گره برای مباحث کوچک و تا ۷۵ الی ۹۰ گره برای مباحث چندبخشی و گسترده، با سقف فنی ۱۲۰ گره). از فشرده‌سازی غیرمنطقی یا هرس زودهنگام شاخه‌ها که مانع رسیدن درخت از دسته‌بندی‌ها به مفاهیم مشخص می‌شود خودداری کنید، و همزمان از خرد کردن بی‌مورد و غیرعلمی جملات ساده نیز بپرهیزید تا از سقف مجاز ۱۲۰ گره فراتر نرود.
۸. شناسه پایدار معنایی:
   برای هر گره شناسه انگلیسی معنادار بسازید به فرمت: node_<concept_slug> (شناسه ریشه باید "root" باشد).
۹. تمام گره‌ها (به جز root) باید والد معتبر (parentId) داشته باشند. ایجاد هرگونه حلقه (Cycle) یا گره بدون والد اکیداً ممنوع است.
۱۰. هیچ گره‌ای نباید شناسه خودش را به عنوان والد قرار دهد (node.parentId !== node.id). شناسه والد باید متعلق به گره بالادست آن مفهوم باشد.`;

      const userPrompt = `موضوع سرفصل آموزشی: «${moduleTitle}»
نوع منبع: ${source.sourceType === "reference_document" ? "فایل مرجع اصلی سرفصل" : "درسنامه‌های تدوین‌شده سرفصل"}

متن معتبر آموزشی منبع:
${source.sourceText}

لطفاً نقشه مفهومی عمیق، جامع، دسته‌بندی‌شده و چندسطحی سرفصل را در قالب JSON زیر با رعایت عمق کامل علمی در توضیحات اصلی (shortDescription)، روابط دقیق والد و فرزند (parentId)، عناوین کوتاه، تفکیک شاخه‌های مفهومی، و محتوای تکمیلی اختصاصی متناسب با نقش هر گره تولید کنید:
{
  "rootNodeId": "root",
  "nodes": {
    "root": {
      "id": "root",
      "parentId": null,
      "title": "${moduleTitle}",
      "shortDescription": "نقشه مفهومی جامع سرفصل هورمون‌های قشر آدرنال، ساختار بیوشیمیایی، مکانیسم‌های سلولی، کاربردهای بالینی و داروشناسی آگونیست‌ها و آنتاگونیست‌ها.",
      "category": "general",
      "keyPoints": ["نمای کلی پیوندهای مفهومی و سلسله‌مراتبی سرفصل بر اساس منبع آموزشی"],
      "examTips": ["تمرکز ویژه بر تمایزهای پاتوفیزیولوژیک و فارماکوتراپی در آزمون‌های جامع"]
    },
    "node_treatment": {
      "id": "node_treatment",
      "parentId": "root",
      "title": "رویکردهای درمانی",
      "shortDescription": "راهبردهای دارویی شامل هورمون‌تراپی جایگزینی با مینرالوکورتیکوئیدهای صناعی جهت جبران نارسایی آدرنال، و درمان با آنتاگونیست‌های گیرنده آلدوسترون در نارسایی قلبی و هایپرتانسیون.",
      "nodeRole": "category",
      "category": "general",
      "keyPoints": ["تقسیم‌بندی به دو شاخه اصلی فارماکولوژیک: آگونیست‌ها (فلودروکورتیزون) و آنتاگونیست‌ها (اسپیرونولاکتون و اپلرنون)"]
    },
    "node_mineralocorticoids": {
      "id": "node_mineralocorticoids",
      "parentId": "node_treatment",
      "title": "مینرالوکورتیکوئیدها",
      "shortDescription": "هورمون‌های استروئیدی با نقش حیاتی در تنظیم اسمولالیته مایعات، هموستاز سدیم و پتاسیم، و کنترل فشار خون شریانی از طریق اثر بر لوله‌های انتهایی و مجاری جمع‌کننده قشری کلیه.",
      "nodeRole": "category",
      "category": "drug",
      "keyPoints": ["آلدوسترون هورمون طبیعی اصلی است که ترشح آن در زونا گلومرولوزا عمدتاً توسط آنژیوتانسین II و پتاسیم سرم تنظیم می‌شود و نه ACTH."]
    },
    "node_fludrocortisone": {
      "id": "node_fludrocortisone",
      "parentId": "node_mineralocorticoids",
      "title": "فلودروکورتیزون",
      "shortDescription": "مینرالوکورتیکوئید صناعی پرقدرت با اثر مینرالوکورتیکوئیدی بیش از ۱۰۰ برابر کورتیزول و فعالیت گلوکوکورتیکوئیدی اندک؛ آگونیست قدرتمند گیرنده‌های درون‌سلولی MR کلیه که بازجذب فعال سدیم و آب را تحریک می‌کند.",
      "category": "drug",
      "keyPoints": ["داروی انتخابی خوراکی خط اول در درمان جایگزینی نارسایی اولیه کورتکس آدرنال (بیماری آدیسون) و درمان هیپوتانسیون ارتوستاتیک شدید."],
      "examTips": ["تفاوت فارماکولوژیک بارز با گلوکوکورتیکوئیدها: میل ترکیبی بسیار بالا به MR و عدم ایجاد اثرات سرکوب ایمنی سیستمیک."]
    },
    "node_fludro_mechanism": {
      "id": "node_fludro_mechanism",
      "parentId": "node_fludrocortisone",
      "title": "مکانیسم اثر سلولی",
      "shortDescription": "نفوذ به سلول‌های اصلی (Principal cells) در توبول انتهایی و مجاری جمع‌کننده کلیه، اتصال به گیرنده‌های سیتوپلاسمی MR، انتقال کمپلکس لیگاند-گیرنده به هسته سلول و القای رونویسی ژن‌های پروتئین‌های ناقل یونی.",
      "category": "cellular_mechanism",
      "keyPoints": ["تحریک رونویسی mRNA برای سنتز کانال‌های یونی غشای لومینال و پمپ‌های غشای پایه‌ای-جانبی طی چند ساعت."]
    },
    "node_fludro_na_reabsorp": {
      "id": "node_fludro_na_reabsorp",
      "parentId": "node_fludro_mechanism",
      "title": "بازجذب سدیم و آب",
      "shortDescription": "افزایش بیان و باز ماندن کانال‌های سدیمی اپیتلیالی (ENaC) در غشای لومینال همراه با فعال‌سازی پمپ Na+/K+ ATPase در غشای قاعده پستانداران، که منجر به بازجذب فعال سدیم، کشش اسمزی آب و انبساط حجم پلاسما می‌شود.",
      "category": "cellular_mechanism",
      "keyPoints": ["ایجاد پتانسیل الکتریکی منفی در لومن لوله‌های جمع‌کننده که نیروی محرکه دفع کاتیون‌ها را فراهم می‌سازد."]
    },
    "node_fludro_k_excretion": {
      "id": "node_fludro_k_excretion",
      "parentId": "node_fludro_mechanism",
      "title": "دفع پتاسیم و پروتون",
      "shortDescription": "به دنبال بازجذب سدیم و افزایش گرادیان الکتروشیمیایی منفی لومن، ترشح فعال یون پتاسیم از کانال‌های ROMK و خروج یون هیدروژن توسط پمپ H+-ATPase سلول‌های اینترکالیت به ادرار افزایش می‌یابد.",
      "category": "cellular_mechanism",
      "examTips": ["خطر بروز آلکالوز متابولیک هیپوکالمیک شدید در مصرف دوزهای بالاتر از نیاز بالینی."]
    },
    "node_fludro_uses": {
      "id": "node_fludro_uses",
      "parentId": "node_fludrocortisone",
      "title": "کاربردهای بالینی",
      "shortDescription": "درمان جایگزینی مادام‌العمر در نارسایی اولیه قشر آدرنال (بیماری آدیسون) جهت بازگرداندن فشار خون و پیشگیری از هایپرکالمی و شوک هیپوولمیک، و درمان هیپوتانسیون ارتوستاتیک شدید ناشی از نارسایی اتونوم.",
      "category": "disease",
      "keyPoints": ["در نارسایی ثانویه آدرنال به ندرت نیاز است زیرا ترشح آلدوسترون وابسته به محور رنین-آنژیوتانسین سالم باقی مانده است."]
    },
    "node_fludro_adverse": {
      "id": "node_fludro_adverse",
      "parentId": "node_fludrocortisone",
      "title": "عوارض جانبی و پایش",
      "shortDescription": "پیامدهای ناشی از احتباس مفرط آب و سدیم شامل هیپرتانسیون سیستمیک، ادم محیطی و نارسایی احتقانی قلب، همراه با افت سطح پتاسیم سرم، ضعف عضلانی و آریتمی‌های قلبی ناشی از هیپوکالمی.",
      "category": "drug",
      "keyPoints": ["پایش منظم فشار خون، وزن بدن و سطح الکترولیت‌های سرم (سدیم و پتاسیم) در تمام طول دوره درمان الزامی است."]
    },
    "node_antagonists": {
      "id": "node_antagonists",
      "parentId": "node_treatment",
      "title": "آنتاگونیست‌های آلدوسترون",
      "shortDescription": "داروهای مسدودکننده رقابتی گیرنده مینرالوکورتیکوئید در نفرون دیستال؛ مهار بازجذب سدیم و جلوگیری از اتلاف پتاسیم (دیورتیک‌های نگه‌دارنده پتاسیم) با اثرات ضدفیبروتیک بافت میوکارد.",
      "nodeRole": "category",
      "category": "drug",
      "keyPoints": ["کاهش معنادار مورتالیتی در نارسایی مزمن قلبی با کسر تخلیه کاهش‌یافته (HFrEF) و بهبود پیامد پس از انفارکتوس میوکارد."]
    },
    "node_spironolactone": {
      "id": "node_spironolactone",
      "parentId": "node_antagonists",
      "title": "اسپیرونولاکتون",
      "shortDescription": "مهارکننده رقابتی غیراختصاصی گیرنده آلدوسترون در توبول انتهایی با اثرات همزمان آنتاگونیستی بر گیرنده‌های آندروژن و مهار سنتز تستوسترون؛ مانع از احتباس سدیم شده و ترشح پتاسیم به ادرار را مسدود می‌سازد.",
      "nodeRole": "concept",
      "category": "drug",
      "keyPoints": ["دیورتیک نگه‌دارنده پتاسیم و مهارکننده فیبروز قلبی در بیماران مبتلا به هایپرآلدوسترونیسم و نارسایی قلبی."],
      "examTips": ["به دلیل اثرات آنتی‌آندروژنیک می‌تواند منجر به ژنیکوماستی دردناک در مردان و بهبود هیرسوتیسم در زنان شود؛ در صورت بروز عوارض، اپلرنون جایگزین انتخابی است."],
      "structuredDetails": {
        "clinicalPearls": ["کاهش معنادار مورتالیتی در نارسایی قلبی با کسر تخلیه کاهش‌یافته (HFrEF)"],
        "commonPitfalls": ["منع مصرف همزمان با مکمل‌های پتاسیم یا احتیاط شدید با مهارکننده‌های ACE/ARB به علت خطر هایپرکالمی کشنده"]
      }
    },
    "node_eplerenone": {
      "id": "node_eplerenone",
      "parentId": "node_antagonists",
      "title": "اپلرنون",
      "shortDescription": "آنتاگونیست بسیار اختصاصی گیرنده مینرالوکورتیکوئید با میل ترکیبی ناچیز به گیرنده‌های آندروژن و پروژسترون؛ کاهش بازجذب سدیم و کنترل فشار خون بدون ایجاد عوارض هورمونی سیستمیک نظیر ژنیکوماستی.",
      "nodeRole": "concept",
      "category": "drug",
      "keyPoints": ["جایگزین انتخابی اسپیرونولاکتون در بیماران مبتلا به نارسایی قلبی که دچار عوارض آنتی‌آندروژنیک شده‌اند."],
      "examTips": ["به دلیل اختصاصی بودن بالا برای گیرنده MR، عوارض جنسی در مردان ایجاد نمی‌کند اما خطر هایپرکالمی آن مشابه اسپیرونولاکتون است."]
    },
    "node_pathology": {
      "id": "node_pathology",
      "parentId": "root",
      "title": "پاتولوژی و اختلالات بالینی",
      "shortDescription": "سندرم‌های ناشی از تخریب یا نقص عملکرد قشر غده فوق کلیه با تظاهرات برهم خوردن بالانس آب و الکترولیت‌ها، افت فشار خون و اختلالات هورمونی سیستمیک.",
      "nodeRole": "category",
      "category": "disease",
      "keyPoints": ["لزوم تفکیک نارسایی اولیه آدرنال از نارسایی ثانویه ناشی از اختلال محور هیپوتالاموس-هیپوفیز"]
    },
    "node_addisons_disease": {
      "id": "node_addisons_disease",
      "parentId": "node_pathology",
      "title": "نارسایی اولیه آدرنال (آدیسون)",
      "shortDescription": "تخریب دوطرفه قشر غده آدرنال ناشی از پدیده‌های خودایمنی یا عفونی، همراه با کمبود همزمان آلدوسترون و کورتیزول که به هیپوناترمی، هایپرکالمی، کاهش شدید حجم پلاسما، افت فشار خون و کلاپس عروقی منجر می‌گردد.",
      "category": "disease",
      "keyPoints": ["هایپرپیگمانتاسیون پوست و مخاط ناشی از تولید بیش از حد ACTH و پیش‌ساز POMC در پاسخ به فقدان فیدبک منفی."],
      "examTips": ["در نارسایی اولیه سطح رنین پلاسما شدیداً بالا و آلدوسترون پایین است؛ درمان جایگزینی روزانه با فلودروکورتیزون در کنار هیدروکورتیزون حیاتی است."]
    }
  }
}`;

      // 5. STAGE: GEMINI_REQUEST_STARTED
      currentStage = "GEMINI_REQUEST_STARTED";
      stageStart = Date.now();
      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "GEMINI_REQUEST_STARTED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: 0,
        status: "SUCCESS",
        details: {
          promptVersion: "2.0-deep",
          modelStage: "review_summary",
        },
      });

      // 6. STAGE: GEMINI_RESPONSE_RECEIVED
      currentStage = "GEMINI_RESPONSE_RECEIVED";
      const geminiStartTime = Date.now();
      const response = await this.gateway.complete({
        promptVersion: "2.0-deep",
        correlationId: cid,
        documentId: (documentId ?? recordId) as DocumentId,
        organizationId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        jsonSchema: { type: "mind_map" },
        stage: "review_summary",
      });
      const geminiDuration = Date.now() - geminiStartTime;

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "GEMINI_RESPONSE_RECEIVED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: geminiDuration,
        status: "SUCCESS",
        details: {
          responseLength: response.text.length,
          model: (response as unknown as Record<string, unknown>).model,
        },
      });

      // 7. STAGE: MODEL_OUTPUT_PARSED
      currentStage = "MODEL_OUTPUT_PARSED";
      stageStart = Date.now();
      const parsed = cleanAndParseJson<Record<string, unknown>>(response.text, "mind_map");

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "MODEL_OUTPUT_PARSED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: Date.now() - stageStart,
        status: "SUCCESS",
      });

      // 8. STAGE: MIND_MAP_VALIDATED
      currentStage = "MIND_MAP_VALIDATED";
      stageStart = Date.now();
      const { sanitized, metrics } = this.sanitizeAiMindMapTree(parsed, "root");
      const validatedAiBase = validateMindMapAiBase(sanitized);

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "MIND_MAP_VALIDATED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: Date.now() - stageStart,
        status: "SUCCESS",
        details: {
          nodeCount: Object.keys(validatedAiBase.nodes).length,
          rootNodeId: validatedAiBase.rootNodeId,
          sanitization: metrics,
        },
      });

      // Stage 2: Progressive Expansion (Batched Deepening)
      // Evaluate if candidate entities exist with genuine scientific value, incompleteness, and source grounding
      const candidateNodes = this.findCandidatesForExpansion(
        validatedAiBase.nodes,
        validatedAiBase.rootNodeId,
        source.sourceText,
      );

      let effectiveAiBase = validatedAiBase;
      const initialNodeCount = Object.keys(validatedAiBase.nodes).length;

      // Execute Stage 2 ONLY if candidate nodes genuinely warrant expansion and tree budget allows (< 105)
      // Main criterion: presence of important and incomplete scientific nodes, not an arbitrary 60-node gate
      if (candidateNodes.length > 0 && initialNodeCount < 105) {
        try {
          const deepenedNodes = await this.expandBranchesBatched(
            actor,
            moduleId,
            documentId,
            organizationId,
            cid,
            candidateNodes,
            validatedAiBase,
            source.sourceText,
          );

          if (Object.keys(deepenedNodes).length > initialNodeCount) {
            effectiveAiBase = {
              ...validatedAiBase,
              nodes: deepenedNodes,
            };
          }
        } catch {
          // Graceful fallback to Stage 1 nodes
        }
      }

      // Automatic Supplementary Content Guarantee Pass:
      // Verifies that every single node has at least one valid, specialized supplementary item.
      // If any node lacks content, executes a single bounded background enrichment pass.
      const { nodes: completedNodes, unresolvedNodeIds } =
        await this.ensureAllNodesHaveSupplementaryContent(
          effectiveAiBase,
          source.sourceText,
          cid,
          organizationId,
          (documentId ?? recordId) as DocumentId,
        );

      effectiveAiBase = {
        ...effectiveAiBase,
        nodes: completedNodes,
      };

      if (unresolvedNodeIds.length > 0) {
        process.stderr.write(
          `[MIND_MAP_SUPPLEMENTARY_UNRESOLVED] Some nodes remain unresolved after supplementary enrichment: ${unresolvedNodeIds.join(", ")}\n`,
        );
      }

      // Stage 3: Authoritative Chemical Structure Enrichment Pass
      // Identifies drugs/compounds via PubChem + L1 Registry and enriches nodes deterministically.
      // Critical Guarantee: Failure in chemical enrichment NEVER fails mind map generation.
      try {
        effectiveAiBase = await enrichMindMapAiBaseChemicalsAsync(effectiveAiBase, {
          mindMapTopic: source.sourceText?.slice(0, 100),
          correlationId: cid,
          organizationId: organizationId,
          documentId: (documentId ?? recordId) as string,
        });
      } catch (chemErr) {
        process.stderr.write(
          `[MIND_MAP_CHEMICAL_ENRICHMENT_ERROR] Non-fatal chemical enrichment error caught: ${String(chemErr)}\n`,
        );
      }

      stopHeartbeat();

      // Reconciliation
      const reconciledPayload = this.reconcileMindMap(
        effectiveAiBase,
        previousCompleted ? this.toMindMapPayload(previousCompleted) : null,
      );
      reconciledPayload.sourceType = source.sourceType;
      reconciledPayload.sourceId = source.sourceId;

      // 9. STAGE: MIND_MAP_SAVED
      currentStage = "MIND_MAP_SAVED";
      stageStart = Date.now();
      const completedRecord = await this.store.markCompleted(
        recordId,
        reconciledPayload as unknown as Record<string, unknown>,
      );

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "MIND_MAP_SAVED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: Date.now() - stageStart,
        status: "SUCCESS",
        details: {
          version: completedRecord.version,
          recordId,
        },
      });

      // 10. STAGE: RESPONSE_RETURNED
      currentStage = "RESPONSE_RETURNED";
      const totalDuration = Date.now() - overallStart;
      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: "RESPONSE_RETURNED",
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: totalDuration,
        status: "SUCCESS",
        details: {
          totalDurationMs: totalDuration,
        },
      });

      return {
        success: true,
        mind_map: this.toDto(completedRecord),
      };
    } catch (err) {
      stopHeartbeat();
      const errDuration = Date.now() - stageStart;
      const exceptionName = (err as Error)?.name || "Error";
      const errorMessage = (err as Error)?.message || String(err);
      const stackTrace = (err as Error)?.stack;
      const errObj = (err && typeof err === "object") ? (err as Record<string, unknown>) : undefined;
      const errorCause = errObj?.cause;
      const rawStatus = errObj?.statusCode ?? errObj?.status ?? errObj?.geminiCode;
      const geminiHttpStatus = typeof rawStatus === "number" ? rawStatus : undefined;
      const rawResp = errObj?.geminiMessage ?? errObj?.geminiStatus;
      const geminiResponse = typeof rawResp === "string" ? rawResp : undefined;

      this.emitLifecycle({
        timestamp: new Date().toISOString(),
        stage: currentStage,
        correlationId: cid,
        moduleId,
        courseId,
        userId: actor.userId,
        durationMs: errDuration,
        status: "FAILED",
        error: {
          exceptionName,
          errorMessage,
          stackTrace,
          errorCause,
          geminiHttpStatus,
          geminiResponse,
        },
      });

      const mappedErr = this.mapGatewayOrGenerationError(err, "generation");
      if (recordId && pendingCreated) {
        try {
          await this.store.markFailed(recordId, mappedErr.message, null, "none");
        } catch {
          // ignore markFailed error
        }
      }
      throw mappedErr;
    }
  }

  /**
   * Classifies and maps AI Gateway errors, network failures, timeouts, and parse errors
   * into typed DomainErrors with matching HTTP status codes.
   *
   * Crucial rule: Unknown errors are NOT artificially converted to 503;
   * their stack trace is preserved and logged, returning an internal_error DomainError.
   */
  public mapGatewayOrGenerationError(err: unknown, operation: "generation" | "expansion"): DomainError {
    if (err instanceof DomainError) {
      return err;
    }
    if (
      typeof err === "object" &&
      err !== null &&
      (err as Record<string, unknown>).name === "DomainError" &&
      typeof (err as DomainError).code === "string"
    ) {
      return err as DomainError;
    }

    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();

    // 1. Timeout
    if (
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      (err instanceof DOMException && err.name === "AbortError")
    ) {
      return new DomainError(
        "timeout",
        `مهلت زمانی ارتباط با مدل هوش مصنوعی در ${operation === "generation" ? "تولید" : "توسعه"} به پایان رسید: ${message}`,
      );
    }

    // 2. Network Error
    if (
      lower.includes("network") ||
      lower.includes("econnrefused") ||
      lower.includes("enotfound") ||
      lower.includes("fetch failed") ||
      lower.includes("econnreset") ||
      lower.includes("socket")
    ) {
      return new DomainError(
        "service_unavailable",
        `خطای شبکه در ارتباط با سرویس هوش مصنوعی: ${message}`,
      );
    }

    // 3. HTTP 429 / Rate Limit / Quota
    if (
      lower.includes("429") ||
      lower.includes("rate limit") ||
      lower.includes("rate_limit") ||
      lower.includes("quota") ||
      lower.includes("resource_exhausted")
    ) {
      return new DomainError(
        "rate_limit_exceeded",
        `محدودیت نرخ درخواست هوش مصنوعی تکمیل شده است: ${message}`,
      );
    }

    // 4. HTTP 401 / 403 (Authentication & Permissions)
    if (
      lower.includes("401") ||
      lower.includes("unauthorized") ||
      lower.includes("api_key_invalid") ||
      lower.includes("invalid api key") ||
      lower.includes("authentication")
    ) {
      return new DomainError(
        "unauthorized",
        `خطای احراز هویت سرویس هوش مصنوعی: ${message}`,
      );
    }
    if (
      lower.includes("403") ||
      lower.includes("forbidden") ||
      lower.includes("permission denied")
    ) {
      return new DomainError(
        "forbidden",
        `عدم دسترسی به سرویس هوش مصنوعی: ${message}`,
      );
    }

    // 5. Invalid JSON / Invalid AI Output
    if (
      lower.includes("json") ||
      lower.includes("syntaxerror") ||
      lower.includes("parse") ||
      lower.includes("stage5_invalid_model_json")
    ) {
      return new DomainError(
        "unprocessable",
        `پاسخ دریافتی از مدل هوش مصنوعی قالب معتبر ندارد: ${message}`,
      );
    }

    // 6. Unknown Error:
    // Retain stack trace in internal logs, do not mask as 503.
    const stack = err instanceof Error ? err.stack : undefined;
    process.stderr.write(
      `[MIND_MAP_${operation.toUpperCase()}_UNKNOWN_ERROR] ${stack || message}\n`,
    );
    return new DomainError(
      "internal_error",
      `خطای داخلی پیش‌بینی‌نشده در ${operation === "generation" ? "تولید" : "توسعه"} مایندمپ: ${message}`,
    );
  }

  /**
   * On-Demand deep educational expansion for a specific node.
   * Grounded strictly in Priority 1 (document chunks) or Priority 2 (lessons).
   */
  async expandNode(
    actor: Actor,
    moduleId: string,
    nodeId: string,
  ): Promise<ExpandMindMapNodeResponse> {
    const { organizationId, documentId } = await this.verifyModuleAccess(actor, moduleId);

    const latest = await this.store.findLatestCompleted(
      actor.userId,
      moduleId,
      "mind_map",
    );
    if (!latest) {
      throw new DomainError("not_found", "مایندمپ تولیدشده‌ای برای این فصل یافت نشد.");
    }

    const payload = this.toMindMapPayload(latest);
    const effective = computeEffectiveMindMap(payload);
    const targetNode = effective.nodes[nodeId];
    if (!targetNode) {
      throw new DomainError("not_found", `گره با شناسه "${nodeId}" در مایندمپ یافت نشد.`);
    }

    const nodeTitle = typeof targetNode.title === "string" ? targetNode.title.trim() : "";
    if (!nodeTitle) {
      throw new DomainError("bad_request", `گره "${nodeId}" فاقد عنوان معتبر برای توسعه (Expand) است.`);
    }

    // Return cached if already expanded
    if (targetNode.detailedExplanation && (targetNode.examples?.length ?? 0) > 0) {
      return {
        success: true,
        nodeId,
        detailedExplanation: targetNode.detailedExplanation,
        examples: targetNode.examples ?? [],
        examTips: targetNode.examTips ?? [],
        structuredDetails: targetNode.structuredDetails,
      };
    }

    // Grounding: resolve the most relevant educational source chunks/lessons for this node
    const parentNode = targetNode.parentId ? effective.nodes[targetNode.parentId] ?? null : null;
    const source = await this.resolveRelevantSourceForNode(moduleId, documentId, targetNode, parentNode);

    const systemPrompt = `شما استاد و متخصص ارشد علوم پزشکی، داروشناسی و آموزش تحلیلی در پلتفرم آوانا (AVANA) هستید.
وظیفه شما تدوین یک «مینی‌درس تخصصی و عمیق» (Specialized Clinical/Academic Mini-Lesson) درباره یک مفهوم یا گره خاص در نقشه مفهومی است.

اصول بنیادین و قواعد علمی مینی‌درس تخصصی:
۱. تشخیص ماهیت علمی گره (Nature-Adaptive Intelligence):
   ابتدا ماهیت مفهوم هدف را از بین محورهای زیر تشخیص دهید و ساختار محتوا را کاملاً بر اساس آن منطبق کنید (از تحمیل یک ساختار صلب و یکسان برای تمام گره‌ها اکیداً خودداری کنید):
   - داروشناسی (Pharmacology): مکانیسم عمل سلولی، گیرنده‌ها و پیام‌رسان‌ها، کاربردهای درمانی شاخص، فارماکوکینتیک/دینامیک، عوارض جانبی و تداخلات مهم.
   - بیماری و پاتولوژی (Pathology): اتیولوژی، فرایند پاتوفیزیولوژی، علائم و معیارهای تشخیصی، پیامدها و رویکرد مدیریتی/درمانی.
   - مکانیسم سلولی و مولکولی (Cellular Mechanism): محرک‌ها، گیرنده‌ها، آبشار پیام‌رسانی درون‌سلولی، واسطه‌ها و اثر نهایی بیولوژیک.
   - بیوشیمی و متابولیسم (Biochemistry): سوبسترا و محصولات، آنزیم کلیدی و مرحله محدودکننده سرعت (Rate-limiting)، تنظیم آلوستریک/هورمونی و اهمیت بالینی نقص آنزیم.
   - فرایند ترتیبی یا بالینی (Sequential Process): توالی گام‌به‌گام رخدادها به ترتیب زمانی، شرایط پیش‌نیاز هر مرحله و نقطه عطف فرایند.
   - مفهوم مقایسه‌ای یا افتراقی (Comparative Concept): وجوه اشتراک، تفاوت‌های کلیدی بنیادین، معیارهای تفکیک و دام‌های تشخیصی/آزمونی.
   - مفهوم پایه یا تعریف محوری (Foundational Concept): چرایی و چگونگی پدیده، منطق نام‌گذاری، جایگاه در کل مبحث و اصول بنیادین.

۲. حذف تکرار و ارتقای محسوس عمق آموزشی (Deduplication & Deepening):
   - توضیح اولیه گره (shortDescription) و نکات موجود به شما ارائه شده است.
   - فیلد detailedExplanation هرگز نباید بازنویسی، خلاصه‌سازی یا تکرار جملات اولیه با کلمات دیگر باشد!
   - این فیلد باید مانند یک مینی‌درس تخصصی، به «چرایی»، «چگونگی»، «جزئیات مکانیسمی»، «فرایند رخداد» و «ارتباط بین‌بخشی» بپردازد و خلأهای آموزشی موجود را برطرف سازد.

۳. وثاقت علمی سخت‌گیرانه و منع توهم (Strict Grounding & Zero Hallucination):
   - تمام محتوا باید مبتنی بر متن منبع آموزشی ارائه‌شده باشد.
   - ساختن یا حدس زدن دوز دارو، اعداد و ارقام غیرمستند، اندیکاسیون‌های ذکرنشده، یا عوارض غیرواقعی اکیداً ممنوع است.
   - اطلاعات خارج از منبع نباید به عنوان محتوای قطعی منبع معرفی شوند.
   - اگر موضوعی در منبع مسکوت مانده یا اطلاعات کافی نیست، فیلد مربوطه را خالی بگذارید و از گمانه‌زنی بپرهیزید.

۴. قالب خروجی استاندارد:
   خروجی فقط و فقط یک شیء JSON معتبر با ساختار زیر باشد (بدون هیچ متن توضیحی اضافه):
{
  "detailedExplanation": "مینی‌درس تخصصی، تفصیلی و مرحله‌به‌مرحله درباره مفهوم، شامل چرایی، چگونگی و تحلیل علمی عمیق فراتر از توضیح اولیه",
  "examples": ["کاربرد بالینی، سناریوی کوتاه یا مثال ملموس ۱ منطبق بر منبع", "مثال ۲"],
  "examTips": ["نکته آزمونی یا تستی طلایی، دام اشتباهات رایج یادگیری یا وجه افتراق کلیدی بر اساس منبع"],
  "structuredDetails": {
    "mechanismOfAction": "مکانیسم اثر یا پاتوفیزیولوژی علمی در صورت مرتبط بودن با موضوع و وجود در منبع",
    "indications": ["کاربردها و موارد مصرف مستند به منبع"],
    "drugClass": "دسته دارویی یا رده مفهومی",
    "pharmacology": "نکات فارماکوکینتیک یا دینامیک در صورت دارو بودن مفهوم",
    "adverseEffects": ["عوارض مهم مستند به منبع"],
    "contraindications": ["موارد منع مصرف یا هشدارهای جدی مستند به منبع"],
    "interactions": ["تداخلات مهم مستند به منبع"],
    "clinicalPearls": ["نکات مروارید بالینی و کاربردی مستند بر متن"],
    "commonPitfalls": ["اشتباهات رایج تشخیصی یا یادگیری درباره این مفهوم"],
    "relatedConcepts": ["نام مفاهیم مرتبط دیگر در همین مبحث"]
  }
}
توجه: فقط فیلدهایی از structuredDetails را که با ماهیت گره سازگار بوده و در منبع شواهد دارند پر کنید (فیلدهای نامرتبط مانند فارماکولوژی برای یک بیماری یا بیوشیمی باید خالی بمانند).`;

    const userPrompt = `متن منبع آموزشی معتبر (${source.sourceType === "reference_document" ? "متن استخراج‌شده سند مرجع" : "درسنامه‌های آموزشی سرفصل"}):
${source.sourceText.slice(0, 15000)}

---
مشخصات مفهوم هدف برای تدوین مینی‌درس تخصصی:
- عنوان گره: «${targetNode.title}»
- جایگاه سلسله‌مراتبی: والد بالادست = «${parentNode ? parentNode.title : "ریشه اصلی"}»
- توضیح اولیه موجود در باکس: «${targetNode.shortDescription || "ندارد"}»
- نکات فرعی موجود: ${JSON.stringify(targetNode.keyPoints ?? [])}

دستورالعمل:
لطفاً با اتکا به متن منبع فوق، یک مینی‌درس تخصصی، عمیق و غیرتکراری برای این گره تولید کنید. به چرایی و مکانیسم‌های علمی، کاربردهای بالینی واقعی، دام‌های آزمونی و تمایزهای مهم بپردازید و از تکرار توضیح اولیه خودداری فرمایید. خروجی فقط JSON معتبر باشد.`;

    try {
      const response = await this.gateway.complete({
        promptVersion: "2.0-specialized",
        correlationId: `expand_${nodeId}_${Date.now()}`,
        documentId: (documentId ?? latest.id) as DocumentId,
        organizationId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stage: "review_summary",
      });

      const parsed = cleanAndParseJson<{
        detailedExplanation?: string;
        examples?: string[];
        examTips?: string[];
        structuredDetails?: Record<string, unknown>;
      }>(response.text, "mind_map_expansion");

      const detailedExplanation = typeof parsed.detailedExplanation === "string" ? parsed.detailedExplanation.trim() : "";
      const examples = Array.isArray(parsed.examples) ? parsed.examples.filter((e) => typeof e === "string") : [];
      const examTips = Array.isArray(parsed.examTips) ? parsed.examTips.filter((t) => typeof t === "string") : [];
      const structuredDetails = cleanStructuredDetails(parsed.structuredDetails);

      // Cache into payload
      if (payload.aiBase?.nodes?.[nodeId]) {
        payload.aiBase.nodes[nodeId].detailedExplanation = detailedExplanation;
        payload.aiBase.nodes[nodeId].examples = examples;
        if (examTips.length > 0) {
          payload.aiBase.nodes[nodeId].examTips = examTips;
        }
        if (structuredDetails) {
          payload.aiBase.nodes[nodeId].structuredDetails = structuredDetails;
        }
      } else if (payload.userModifications?.customNodes?.[nodeId]) {
        payload.userModifications.customNodes[nodeId].detailedExplanation = detailedExplanation;
        payload.userModifications.customNodes[nodeId].examples = examples;
        if (examTips.length > 0) {
          payload.userModifications.customNodes[nodeId].examTips = examTips;
        }
        if (structuredDetails) {
          payload.userModifications.customNodes[nodeId].structuredDetails = structuredDetails;
        }
      }

      payload.updatedAt = new Date().toISOString();
      await this.store.updatePayload(latest.id, payload as unknown as Record<string, unknown>);

      return {
        success: true,
        nodeId,
        detailedExplanation,
        examples,
        examTips,
        structuredDetails,
      };
    } catch (err) {
      throw this.mapGatewayOrGenerationError(err, "expansion");
    }
  }

  /**
   * Save user modifications and notes with strict domain validation and optimistic concurrency check.
   */
  async updateMindMap(
    actor: Actor,
    moduleId: string,
    request: UpdateMindMapRequest,
  ): Promise<MindMapDto> {
    await this.verifyModuleAccess(actor, moduleId);

    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new DomainError("bad_request", "داده‌های ارسالی برای به‌روزرسانی مایندمپ نامعتبر است (شیء معتبر الزامی است).");
    }

    const latest = await this.store.findLatestCompleted(
      actor.userId,
      moduleId,
      "mind_map",
    );
    if (!latest) {
      throw new DomainError("not_found", "مایندمپ فعالی برای ویرایش یافت نشد.");
    }

    const payload = this.toMindMapPayload(latest);

    // Validate modifications and notes strictly against aiBase
    const validated = validateUserModificationsAndNotes(
      payload.aiBase,
      request.userModifications,
      request.userNotes,
    );

    payload.userModifications = validated.userModifications;
    payload.userNotes = validated.userNotes;
    payload.updatedAt = new Date().toISOString();

    const updated = await this.store.updatePayload(
      latest.id,
      payload as unknown as Record<string, unknown>,
      request.clientUpdatedAt,
    );

    return this.toDto(updated);
  }

  /**
   * Reset user modifications, reverting to pure AI Base content.
   */
  async resetToAiBase(actor: Actor, moduleId: string): Promise<MindMapDto> {
    await this.verifyModuleAccess(actor, moduleId);

    const latest = await this.store.findLatestCompleted(
      actor.userId,
      moduleId,
      "mind_map",
    );
    if (!latest) {
      throw new DomainError("not_found", "مایندمپی برای بازنشانی یافت نشد.");
    }

    const payload = this.toMindMapPayload(latest);
    payload.userModifications = {
      deletedNodeIds: [],
      customNodes: {},
      overrides: {},
    };
    payload.updatedAt = new Date().toISOString();

    const updated = await this.store.updatePayload(
      latest.id,
      payload as unknown as Record<string, unknown>,
    );

    return this.toDto(updated);
  }

  /**
   * List all versions of the mind map for a module.
   */
  async listVersions(actor: Actor, moduleId: string): Promise<ListMindMapVersionsResponse> {
    await this.verifyModuleAccess(actor, moduleId);

    const records = await this.store.listVersions(
      actor.userId,
      moduleId,
      "mind_map",
    );

    const latestCompleted = records.find((r) => r.status === "completed");

    const versions = records.map((record) => {
      const payload = this.toMindMapPayload(record);
      const nodesCount = payload?.aiBase?.nodes ? Object.keys(payload.aiBase.nodes).length : 0;
      const customNodesCount = payload?.userModifications?.customNodes
        ? Object.keys(payload.userModifications.customNodes).length
        : 0;
      const notesCount = payload?.userNotes ? Object.keys(payload.userNotes).length : 0;

      return {
        version: record.version,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        sourceType: payload?.sourceType ?? "reference_document",
        nodesCount,
        customNodesCount,
        notesCount,
      };
    });

    return {
      versions,
      currentVersion: latestCompleted ? latestCompleted.version : 0,
    };
  }

  /**
   * Get a specific historical version of the mind map.
   */
  async getVersion(actor: Actor, moduleId: string, version: number): Promise<GetMindMapResponse> {
    await this.verifyModuleAccess(actor, moduleId);

    const record = await this.store.findByVersion(
      actor.userId,
      moduleId,
      version,
      "mind_map",
    );

    if (!record) {
      throw new DomainError("not_found", `نسخه ${version} مایندمپ یافت نشد.`);
    }

    const payload = this.toMindMapPayload(record);
    return {
      has_mind_map: true,
      mind_map: this.toDto(record),
      source_available: true,
      source_type: payload.sourceType ?? null,
    };
  }

  /**
   * Restore a historical version of the mind map.
   * Monotonically creates a new version with the historical payload without mutating history.
   */
  async restoreVersion(
    actor: Actor,
    moduleId: string,
    targetVersion: number,
  ): Promise<RestoreMindMapVersionResponse> {
    const { courseId } = await this.verifyModuleAccess(actor, moduleId);

    const targetRecord = await this.store.findByVersion(
      actor.userId,
      moduleId,
      targetVersion,
      "mind_map",
    );

    if (!targetRecord || targetRecord.status !== "completed") {
      throw new DomainError("not_found", `نسخه ${targetVersion} مایندمپ یافت نشد یا تکمیل نشده است.`);
    }

    const nextVersion = await this.store.getNextVersion(
      actor.userId,
      moduleId,
      "mind_map",
    );

    const targetPayload = this.toMindMapPayload(targetRecord);
    const newPayload: MindMapPayload = {
      ...targetPayload,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    };

    const newRecord = await this.store.createPending({
      userId: actor.userId,
      courseId,
      moduleId,
      contentType: "mind_map",
      version: nextVersion,
      status: "completed",
      payload: newPayload as unknown as Record<string, unknown>,
      inputSnapshot: targetRecord.inputSnapshot,
      highlightsCount: 0,
      notesCount: 0,
      costToman: 0,
      idempotencyKey: `mm_restore_${actor.userId}_${moduleId}_v${nextVersion}_from_v${targetVersion}_${Date.now()}`,
    });

    return {
      success: true,
      restoredVersion: nextVersion,
      mind_map: this.toDto(newRecord),
    };
  }

  /**
   * Retroactively enriches an existing, completed MindMap with verified chemical structures.
   *
   * Guarantees:
   * 1. 100% Preservation of original educational content, tree structure, user notes, and manual modifications.
   * 2. Idempotent: Subsequent executions preserve already verified structures without redundant mutations.
   * 3. Zero Lost Updates: Concurrency-guarded via optimistic concurrency control (expectedUpdatedAt).
   * 4. Strict Ownership & Access Guard: Users cannot inspect or mutate other users' mind maps.
   */
  async enrichMindMapChemicals(
    actor: Actor,
    targetId: string,
    options?: {
      courseId?: string | null;
      expectedUpdatedAt?: string;
    },
  ): Promise<EnrichMindMapChemicalsResponse> {
    if (!targetId || typeof targetId !== "string" || !targetId.trim()) {
      throw new DomainError("bad_request", "شناسه مایندمپ یا سرفصل الزامی است.");
    }

    const trimmedId = targetId.trim();

    // 1. Resolve target mind map record by ID or by ModuleId
    let record: PersonalSummaryRecord | null = await this.store.findById(trimmedId);
    if (record && record.contentType !== "mind_map") {
      record = null;
    }

    if (!record) {
      record = await this.store.findLatestCompleted(
        actor.userId,
        trimmedId,
        "mind_map",
      );
    }

    if (!record || record.contentType !== "mind_map") {
      throw new DomainError("not_found", "مایندمپ مورد نظر برای غنی‌سازی شیمیایی یافت نشد.");
    }

    // 2. Strict Ownership and Access Verification
    if (record.userId !== actor.userId) {
      throw new DomainError("forbidden", "شما به این مایندمپ دسترسی ندارید.");
    }

    const moduleAccess = await this.verifyModuleAccess(actor, record.moduleId);

    // 2.1. Strict Course-to-Module association guard (when called from course-scoped route)
    if (options?.courseId) {
      const normalizedReqCourseId = options.courseId.trim();
      if (normalizedReqCourseId !== moduleAccess.courseId) {
        throw new DomainError("bad_request", "سرفصل یا ماژول انتخاب‌شده متعلق به این دوره نیست.");
      }
    }

    // 3. Status check: Only completed mind maps can be enriched retroactively
    if (record.status !== "completed") {
      throw new DomainError(
        "bad_request",
        "تنها نقشه‌های ذهنی تکمیل‌شده قابلیت غنی‌سازی شیمیایی عطف‌به‌ماسبق را دارند.",
      );
    }

    // 4. Extract existing payload
    const payload = this.toMindMapPayload(record);
    if (!payload.aiBase || !payload.aiBase.nodes || Object.keys(payload.aiBase.nodes).length === 0) {
      throw new DomainError("bad_request", "مایندمپ فاقد ساختار درختی و گره‌های معتبر هوش مصنوعی است.");
    }

    // 5. Execute intelligent chemical enricher with full metrics
    const enrichmentReport = await enrichMindMapChemicalsWithReportAsync(payload.aiBase, {
      gateway: this.gateway,
      mindMapTopic: record.moduleId,
      correlationId: record.id,
    });

    // 6. Merge ONLY chemical fields into aiBase.nodes, preserving 100% of non-chemical data
    let changedNodes = 0;
    const updatedNodes: Record<string, MindMapNodeBase> = {};

    for (const [nodeId, origNode] of Object.entries(payload.aiBase.nodes)) {
      const enrichedNode = enrichmentReport.enrichedAiBase.nodes[nodeId];

      const mergedNode: MindMapNodeBase = {
        ...origNode,
        ...(origNode.keyPoints !== undefined ? { keyPoints: [...origNode.keyPoints] } : {}),
        ...(origNode.examTips !== undefined ? { examTips: [...origNode.examTips] } : {}),
        ...(origNode.examples !== undefined ? { examples: [...origNode.examples] } : {}),
        ...(origNode.sourceReferences !== undefined
          ? { sourceReferences: origNode.sourceReferences.map((r) => ({ ...r })) }
          : {}),
      };

      if (enrichedNode) {
        if (enrichedNode.chemicalStatus) {
          mergedNode.chemicalStatus = enrichedNode.chemicalStatus;
        }
        if (enrichedNode.chemicalStructure) {
          mergedNode.chemicalStructure = enrichedNode.chemicalStructure;
        } else if ("chemicalStructure" in mergedNode && !mergedNode.chemicalStructure?.isValidated) {
          delete mergedNode.chemicalStructure;
        }
        if (enrichedNode.relatedChemicals) {
          mergedNode.relatedChemicals = enrichedNode.relatedChemicals;
        } else if ("relatedChemicals" in mergedNode) {
          delete mergedNode.relatedChemicals;
        }
      }

      const statusChanged = origNode.chemicalStatus !== mergedNode.chemicalStatus;
      const structureChanged =
        JSON.stringify(origNode.chemicalStructure ?? null) !==
        JSON.stringify(mergedNode.chemicalStructure ?? null);
      const relatedChanged =
        JSON.stringify(origNode.relatedChemicals ?? null) !==
        JSON.stringify(mergedNode.relatedChemicals ?? null);

      if (statusChanged || structureChanged || relatedChanged) {
        changedNodes++;
      }

      updatedNodes[nodeId] = mergedNode;
    }

    const updatedPayload: MindMapPayload = {
      ...payload,
      aiBase: {
        ...payload.aiBase,
        nodes: updatedNodes,
        chemicalEnrichment: enrichmentReport.enrichedAiBase.chemicalEnrichment,
      },
    };

    // 7. Atomic optimistic concurrency update
    const expectedUpdatedAt = options?.expectedUpdatedAt ?? record.updatedAt;
    const updatedRecord = await this.store.updatePayload(
      record.id,
      updatedPayload as unknown as Record<string, unknown>,
      expectedUpdatedAt,
    );

    return {
      mindMapId: record.id,
      totalNodes: enrichmentReport.metrics.totalNodes,
      enrichedNodes: enrichmentReport.metrics.enrichedNodes,
      notRequiredNodes: enrichmentReport.metrics.noNeedNodes,
      needsReviewNodes: enrichmentReport.metrics.skippedNodes,
      failedNodes: enrichmentReport.metrics.failedNodes,
      preservedExistingNodes: enrichmentReport.metrics.preservedExistingNodes,
      changedNodes,
      enrichmentVersion: enrichmentReport.enrichedAiBase.chemicalEnrichment?.version ?? 1,
      mind_map: this.toDto(updatedRecord),
    };
  }
}

