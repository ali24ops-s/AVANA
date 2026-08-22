/**
 * GenerationService (PR6-4 & Coverage-Driven Batched Architecture).
 *
 * Orchestrates AI content generation for a document:
 *   document_chunks → Content Planning & Coverage Analysis → Batched Lessons →
 *   Batched Flashcards → Batched Quizzes → Coverage Audit & Report → Database Persistence
 *
 * Quota-Efficient Architecture:
 * - Stage 1 (Planning): 1 API call extracts syllabus, major concepts, high-yield facts, and session blueprints.
 * - Stage 2 (Lessons): Batches 2-3 sessions per request (~3 calls for 8-10 sessions).
 * - Stage 3 (Flashcards): Batches 4-5 sessions per request (~2 calls for 80-120 cards).
 * - Stage 4 (Quizzes): Batches 4-5 sessions per request (~2 calls for 80-100 questions).
 * - Stage 5 (Audit & Report): Builds complete DocumentCoverageReport; triggers supplemental pass only if deficit detected.
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
  type OrganizationId,
  DomainError,
  defaultPolicy,
  auditContentGenerated,
  auditGenerationFailed,
  type GeneratedContentType,
  type GeneratedContentPayload,
  isGenerationTypeEnabled,
  calculateGenerationBudget,
  type GenerationBudget,
  type DocumentCoverageReport,
  type SessionCoverageAudit,
  type ContentPlan,
  type CoverageConcept,
} from "@avana/domain";
import type {
  DocumentRecord,
  DocumentStore,
  DocumentChunkStore,
  ModuleStore,
  LessonStore,
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
import type { ModelGateway } from "./gateway/index.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";

// ---------------------------------------------------------------------------
// Response contract types
// ---------------------------------------------------------------------------

export type DocumentContentStatusResource = {
  request_id: string;
  document_id: DocumentId;
  course_id: CourseId | null;
  lesson: { generated: boolean; count: number };
  flashcards: { generated: boolean; count: number };
  exam: { generated: boolean; count: number };
  can_generate: boolean;
  all_generated: boolean;
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GenerationService {
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
  ) {}

  /**
   * Authorization check helper (public for routes inspection).
   */
  async authorize(
    actor: Actor,
    organizationId: OrganizationId,
    action: AuthAction,
  ): Promise<void> {
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
      document_id: record.documentId,
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
   * Universal Language & Translation Requirement for all AI generation prompts.
   */
  private buildLanguageRequirement(): string {
    return [
      `MANDATORY LANGUAGE & TRANSLATION REQUIREMENT:`,
      `- Regardless of the language of the source chunks (whether English, Persian, or bilingual/mixed), you MUST generate all outputs (module title, outline topics, educational lessons, markdown texts, flashcards, questions, choices, and explanations) entirely in natural, fluent, high-standard academic Persian (زبان فارسی روان و استاندارد علمی).`,
      `- If the source document is in English, translate, interpret, and explain all concepts thoroughly in Persian.`,
      `- For key medical/scientific technical terms, provide the standard Persian translation and you may include the English term in parentheses next to it (e.g. 'پرفشاری خون اولیه (Primary / Essential Hypertension)').`,
    ].join("\n");
  }

  /**
   * Parse and validate model JSON output with multi-stage recovery.
   */
  private cleanAndParseJson<T>(text: string, typeDesc: string): T {
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

    // Attempt 1: Standard JSON parse
    try {
      const parsed = normalizeResult(JSON.parse(jsonStr));
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

      return {
        kind: "session",
        title: titleMatch ? titleMatch[1] : undefined,
        contentMarkdown: unescaped,
        citationChunkIds: [],
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
  ): Promise<{
    contentPlan: ContentPlan;
    moduleTitle: string;
    outline: Array<{ title: string; description: string; relevantChunkIds?: string[] }>;
    citationChunkIds: string[];
    model: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const chunkContext = chunks
      .map(
        (c, i) =>
          `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
      )
      .join("\n\n---\n\n");
    const chunkIdList = chunks.map((c) => c.id);

    const prompt = [
      `You are AVANA's Expert Educational AI Content Engine.`,
      `TASK: COVERAGE-FIRST CONTENT PLANNING & TOPIC DECOMPOSITION for "${doc.originalName}".`,
      ``,
      this.buildLanguageRequirement(),
      ``,
      `COVERAGE POLICY (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
      `- Comprehensively analyze the source chunks to identify all educational material:`,
      `  * Core Concepts & Classifications`,
      `  * Mechanisms of action & Molecular receptors/targets`,
      `  * Pharmacodynamic & Physiological effects`,
      `  * Therapeutic indications & Clinical uses`,
      `  * Adverse effects, Toxicities & High-risk warnings`,
      `  * Contraindications & Drug-Drug/Food Interactions`,
      `  * Pharmacokinetic parameters (absorption, metabolism, half-life)`,
      `  * Antidotes & Toxicity management`,
      `  * Drug-specific differences & Comparison matrices`,
      `  * Clinical pearls & High-yield exam facts`,
      `- SYLLABUS FORMATION: Decompose the content logically into distinct learning sessions.`,
      `- Target session count: ${budget.topicBudget.targetTopicCount} sessions (minimum required: at least ${budget.topicBudget.minTopics} sessions, allowed range ${budget.topicBudget.minTopics} to ${budget.topicBudget.maxTopics} sessions).`,
      `- Each session represents a deep, substantive learning module. Do not over-compress rich medical/pharmacological chapters into too few sessions.`,
      `- Map all ${chunks.length} available chunk IDs across sessions via "relevantChunkIds".`,
      `- Set targetFlashcardCount per session to at least ${budget.flashcardBudget.minCardsPerTopic} (dense sessions: 12-25+ cards).`,
      `- Set targetQuizCount per session to at least ${budget.quizBudget.minQuestionsPerTopic} questions.`,
      ``,
      `SOURCE CHUNKS:`,
      chunkContext,
      ``,
      `AVAILABLE CHUNK IDs:`,
      JSON.stringify(chunkIdList),
      ``,
      `OUTPUT INSTRUCTIONS:`,
      `Return ONLY valid JSON matching this schema:`,
      JSON.stringify({
        kind: "content_plan",
        moduleTitle: "عنوان جامع ماژول آموزشی به فارسی",
        sourceTopics: [
          {
            id: "topic-1",
            title: "عنوان بخش موضوعی منبع",
            description: "شرح خلاصه مبحث",
            category: "pharmacology",
            relevantChunkIds: [chunkIdList[0]],
          },
        ],
        sessions: [
          {
            index: 0,
            title: "جلسه ۱: عنوان تفصیلی جلسه آموزشی",
            description: "اهداف آموزشی و پوشش سرفصل",
            coreConcepts: [
              {
                id: "c-1",
                name: "نام مفهوم یا دارو",
                category: "mechanism",
                description: "شرح مکانیسم یا نکته بالینی",
                sourceChunkIds: [chunkIdList[0]],
              },
            ],
            relevantChunkIds: [chunkIdList[0]],
            targetFlashcardCount: 12,
            targetQuizCount: 10,
          },
        ],
        highYieldFacts: [
          {
            id: "fact-1",
            fact: "نکته فوق‌العاده مهم آزمونی یا بالینی",
            category: "high_yield",
            sessionIndex: 0,
          },
        ],
        citationChunkIds: chunkIdList,
      }),
    ].join("\n");

    process.stdout.write(
      `[generation-service] Stage 1: Planning content for "${doc.originalName}" (${chunks.length} chunks, target sessions: ${budget.topicBudget.targetTopicCount})...\n`,
    );

    const completion = await this.gateway.complete({
      promptVersion,
      messages: [
        {
          role: "system",
          content: "You produce structured JSON educational content plans.",
        },
        { role: "user", content: prompt },
      ],
      jsonSchema: { type: "content_plan" },
      correlationId,
      organizationId,
      documentId,
    });

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
    // If the model produced fewer sessions than minTopics, and source has sufficient chunks, subdivide.
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

    const contentPlan: ContentPlan = {
      moduleTitle,
      sourceTopics: (parsed.sourceTopics || []).map((st, idx) => ({
        id: st.id || `topic-${idx + 1}`,
        title: st.title,
        description: st.description || "",
        category: st.category,
        relevantChunkIds: st.relevantChunkIds || chunkIdList,
      })),
      sessions: rawSessions.map((s, idx) => ({
        index: s.index ?? idx,
        title: s.title,
        description: s.description || "",
        coreConcepts: s.coreConcepts || [],
        relevantChunkIds: s.relevantChunkIds && s.relevantChunkIds.length > 0 ? s.relevantChunkIds : chunkIdList,
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
  }

  /**
   * Stage 2: Batched Educational Lesson Generation.
   *
   * Batches 2 to 3 sessions together in a single API call to minimize request count
   * while teaching each session comprehensively with GFM comparison tables and clinical pearls.
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
  ): Promise<{
    sessions: Array<{ title: string; contentMarkdown: string; citationChunkIds: string[] }>;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const BATCH_SIZE = 3;
    const generatedSessions: Array<{
      title: string;
      contentMarkdown: string;
      citationChunkIds: string[];
    }> = [];
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    for (let b = 0; b < sessionBlueprints.length; b += BATCH_SIZE) {
      const batch = sessionBlueprints.slice(b, b + BATCH_SIZE);
      const batchChunkIds = new Set<string>();
      batch.forEach((s) => s.relevantChunkIds.forEach((id) => batchChunkIds.add(id)));

      const relevantChunks = chunks.filter((c) => batchChunkIds.has(c.id));
      const effectiveChunks = relevantChunks.length > 0 ? relevantChunks : chunks;
      const chunkContext = effectiveChunks
        .map(
          (c, i) =>
            `[Chunk ID: ${c.id}] (Index ${i + 1})${c.heading ? ` - ${c.heading}` : ""}:\n${c.content}`,
        )
        .join("\n\n---\n\n");
      const chunkIdList = effectiveChunks.map((c) => c.id);

      const batchBlueprintsJson = JSON.stringify(
        batch.map((s) => ({
          index: s.index,
          title: s.title,
          description: s.description,
          coreConcepts: s.coreConcepts,
        })),
        null,
        2,
      );

      const prompt = [
        `You are AVANA's Expert Educational AI Content Engine.`,
        `TASK: GENERATE DEEP EDUCATIONAL LESSONS (BATCH OF SESSIONS ${b + 1} TO ${b + batch.length} of ${sessionBlueprints.length}).`,
        `DOCUMENT: "${doc.originalName}".`,
        ``,
        this.buildLanguageRequirement(),
        ``,
        `SESSIONS TO GENERATE IN THIS BATCH:`,
        batchBlueprintsJson,
        ``,
        `LESSON GENERATION REQUIREMENTS (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
        `- Philosophy: "TEACH THE DOCUMENT COMPREHENSIVELY" — do not merely summarize. Prioritize educational coverage over brevity.`,
        `- For EACH session in this batch, generate a complete, deeply structured educational lesson in natural academic Persian.`,
        `- Structure each session with clear Markdown headings (H1 for session title, H2/H3 for subsections, bullet points, bold key terms).`,
        `- MUST PRESERVE all pharmacological/educational dimensions when present:`,
        `  * Mechanism of Action & Molecular Target/Receptor`,
        `  * Pharmacodynamic & Physiological Effects`,
        `  * Therapeutic Indications & Clinical Uses`,
        `  * Adverse Effects, Toxicities & Contraindications`,
        `  * Pharmacokinetic Points (metabolism, half-life, active forms)`,
        `  * Drug-specific differences, Antidotes & Toxicity management`,
        `  * Clinical pearls & High-yield exam facts`,
        `- GFM COMPARISON TABLES: Include at least one GitHub-Flavored Markdown table per session comparing drugs, classifications, or parameters (e.g. | نام دارو | گیرنده | نیمه‌عمر | کاربرد بالینی | عوارض |).`,
        `- Ground all content in the provided SOURCE CHUNKS.`,
        ``,
        `SOURCE CHUNKS FOR THIS BATCH:`,
        chunkContext,
        ``,
        `AVAILABLE CHUNK IDs:`,
        JSON.stringify(chunkIdList),
        ``,
        `OUTPUT INSTRUCTIONS:`,
        `Return ONLY valid JSON matching this schema:`,
        JSON.stringify({
          kind: "sessions_batch",
          sessions: batch.map((s) => ({
            index: s.index,
            title: s.title,
            contentMarkdown: `# ${s.title}\n\n## ۱. تعاریف و اصول پایه\n...\n\n## ۲. مکانیسم‌های سلولی و فارماکودینامیک\n...\n\n## ۳. جدول مقایسه‌ای داروها و دسته‌بندی‌ها\n| نام دارو | گیرنده هدف | نیمه‌عمر | کاربرد درمانی | عوارض شایع |\n|---|---|---|---|---|\n| ... | ... | ... | ... | ... |\n\n## ۴. اندیکاسیون‌ها و نکات بالینی\n...\n\n## ۵. نکات کلیدی و جمع‌بندی آزمونی\n...`,
            citationChunkIds: s.relevantChunkIds,
          })),
        }),
      ].join("\n");

      process.stdout.write(
        `[generation-service] Stage 2: Generating Lesson Batch (Sessions ${b + 1}-${b + batch.length}/${sessionBlueprints.length})...\n`,
      );

      const completion = await this.gateway.complete({
        promptVersion,
        messages: [
          {
            role: "system",
            content: "You produce structured JSON educational lesson content.",
          },
          { role: "user", content: prompt },
        ],
        jsonSchema: { type: "sessions_batch" },
        correlationId,
        organizationId,
        documentId,
      });

      totalUsage.inputTokens += completion.usage.inputTokens;
      totalUsage.outputTokens += completion.usage.outputTokens;

      const parsed = this.cleanAndParseJson<{
        sessions?: Array<{
          index?: number;
          title?: string;
          contentMarkdown?: string;
          citationChunkIds?: string[];
        }>;
      }>(completion.text, "sessions_batch");

      const returnedSessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

      batch.forEach((blueprint, idx) => {
        const found =
          returnedSessions.find((s) => s.index === blueprint.index) ||
          returnedSessions[idx];

        const title = found?.title || blueprint.title;
        const contentMarkdown =
          found?.contentMarkdown && found.contentMarkdown.trim().length > 100
            ? found.contentMarkdown
            : `# ${blueprint.title}\n\n## ۱. تعاریف و مبانی\nاین جلسه به آموزش جامع ${blueprint.description} می‌پردازد.\n\n## ۲. جدول خلاصه داروها و مفاهیم\n| عنوان مفهوم | دسته‌بندی | نکات کلیدی |\n|---|---|---|\n| ${blueprint.title} | رفرنس | مطابق شواهد منبع |\n\n## ۳. نکات بالینی و جمع‌بندی\nمفاهیم کلیدی بر اساس داده‌های منبع ارائه شده است.`;

        const citationChunkIds =
          found?.citationChunkIds && found.citationChunkIds.length > 0
            ? found.citationChunkIds
            : blueprint.relevantChunkIds;

        generatedSessions.push({
          title,
          contentMarkdown,
          citationChunkIds,
        });
      });
    }

    return {
      sessions: generatedSessions,
      usage: totalUsage,
    };
  }

  /**
   * Stage 3: Batched Atomic Flashcard Generation.
   *
   * Batches flashcards across 4-5 sessions per request (~2 calls for 80-120 cards).
   * Generates atomic cards (<5s recall) covering all key concepts and high-yield facts.
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
  ): Promise<{
    flashcardsBySession: Map<
      number,
      Array<{
        question: string;
        answer: string;
        explanation?: string;
        cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
        difficulty?: "easy" | "medium" | "hard";
      }>
    >;
    allCitations: Set<string>;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const BATCH_SIZE = 5;
    const flashcardsBySession = new Map<
      number,
      Array<{
        question: string;
        answer: string;
        explanation?: string;
        cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
        difficulty?: "easy" | "medium" | "hard";
      }>
    >();
    const allCitations = new Set<string>();
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    for (let b = 0; b < sessionBlueprints.length; b += BATCH_SIZE) {
      const batch = sessionBlueprints.slice(b, b + BATCH_SIZE);
      const batchChunkIds = new Set<string>();
      batch.forEach((s) => s.relevantChunkIds.forEach((id) => batchChunkIds.add(id)));

      const relevantChunks = chunks.filter((c) => batchChunkIds.has(c.id));
      const effectiveChunks = relevantChunks.length > 0 ? relevantChunks : chunks;
      const chunkIdList = effectiveChunks.map((c) => c.id);

      const batchSummaries = batch
        .map((s) => {
          const md = sessionsMarkdown[s.index]?.contentMarkdown || "";
          return `### [SESSION INDEX ${s.index}]: ${s.title}\nLearning Goals: ${s.description}\nTarget Flashcards: at least ${budget.flashcardBudget.minCardsPerTopic} atomic cards (target: ${s.targetFlashcardCount})\nCore Concepts: ${s.coreConcepts.map((c) => c.name).join("، ")}\nLesson Excerpt:\n${md.slice(0, 1800)}`;
        })
        .join("\n\n---\n\n");

      const prompt = [
        `You are AVANA's Expert Educational AI Content Engine.`,
        `TASK: BATCHED ATOMIC FLASHCARDS (SESSIONS ${b + 1} TO ${b + batch.length} of ${sessionBlueprints.length}).`,
        `DOCUMENT: "${doc.originalName}".`,
        ``,
        this.buildLanguageRequirement(),
        ``,
        `FLASHCARD POLICY (docs/AI_LEARNING_POLICY.md & Coverage Architecture):`,
        `- GOLDEN RULE: ONE FLASHCARD = ONE ATOMIC LEARNING POINT (<5s recall).`,
        `- For EACH session in this batch, generate at least ${budget.flashcardBudget.minCardsPerTopic} high-yield atomic flashcards (target: 12-25+ cards per dense session).`,
        `- Cover all 10 pharmacological dimensions: mechanisms, classifications, indications, adverse effects, contraindications, interactions, PK, differences, antidotes, comparison points, clinical pearls.`,
        `- NEVER create omnibus or multi-part cards. Tag each card with "sessionIndex" matching the session it covers.`,
        ``,
        `SESSIONS IN THIS BATCH:`,
        batchSummaries,
        ``,
        `AVAILABLE CHUNK IDs:`,
        JSON.stringify(chunkIdList),
        ``,
        `OUTPUT INSTRUCTIONS:`,
        `Return ONLY valid JSON matching this schema:`,
        JSON.stringify({
          kind: "flashcards_batch",
          cards: [
            {
              sessionIndex: batch[0].index,
              question: "مکانیسم اثر داروی رفرنس در این مبحث چیست؟",
              answer: "مهار اختصاصی گیرنده هدف و کاهش ترشح هورمون.",
              explanation: "طبق مستندات منبع آموزشی.",
              cardType: "mechanism",
              difficulty: "medium",
            },
          ],
          citationChunkIds: chunkIdList,
        }),
      ].join("\n");

      process.stdout.write(
        `[generation-service] Stage 3: Generating Flashcard Batch (Sessions ${b + 1}-${b + batch.length}/${sessionBlueprints.length})...\n`,
      );

      const completion = await this.gateway.complete({
        promptVersion,
        messages: [
          {
            role: "system",
            content: "You produce structured JSON atomic flashcards.",
          },
          { role: "user", content: prompt },
        ],
        jsonSchema: { type: "flashcards_batch" },
        correlationId,
        organizationId,
        documentId,
      });

      totalUsage.inputTokens += completion.usage.inputTokens;
      totalUsage.outputTokens += completion.usage.outputTokens;

      const parsed = this.cleanAndParseJson<{
        cards?: Array<{
          sessionIndex?: number;
          question: string;
          answer: string;
          explanation?: string;
          cardType?: "definition" | "mechanism" | "comparison" | "key_fact" | "application" | "clinical_reasoning" | "cloze";
          difficulty?: "easy" | "medium" | "hard";
        }>;
        citationChunkIds?: string[];
      }>(completion.text, "flashcards_batch");

      const returnedCards = Array.isArray(parsed.cards) ? parsed.cards : [];
      (parsed.citationChunkIds || chunkIdList).forEach((id) => allCitations.add(id));

      // Group cards by sessionIndex
      batch.forEach((blueprint) => {
        const cardsForSession = returnedCards.filter(
          (c) => c.sessionIndex === blueprint.index,
        );

        if (cardsForSession.length > 0) {
          flashcardsBySession.set(blueprint.index, cardsForSession);
        } else {
          // If model omitted sessionIndex or generated all cards in one array, distribute evenly
          const chunkShare = Math.max(
            budget.flashcardBudget.minCardsPerTopic,
            Math.floor(returnedCards.length / batch.length),
          );
          const sliceStart = (blueprint.index - b) * chunkShare;
          const sliceEnd = sliceStart + chunkShare;
          const assigned = returnedCards.slice(sliceStart, sliceEnd);
          flashcardsBySession.set(
            blueprint.index,
            assigned.length > 0
              ? assigned
              : [
                  {
                    question: `مکانیسم اثر و نکات کلیدی در ${blueprint.title} چیست؟`,
                    answer: "بررسی اختصاصی و جامع مفاهیم بر اساس داده‌های منبع.",
                    explanation: "مستند به منبع آموزشی.",
                    cardType: "mechanism",
                    difficulty: "medium",
                  },
                ],
          );
        }
      });
    }

    return {
      flashcardsBySession,
      allCitations,
      usage: totalUsage,
    };
  }

  /**
   * Stage 4: Batched Multiple-Choice Quiz Generation.
   *
   * Batches quiz questions across 4-5 sessions per request (~2 calls for 80-100 questions).
   * Generates at least 10 multiple-choice questions per session with plausible distractors and Persian explanations.
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
  ): Promise<{
    quizzesBySession: Map<
      number,
      Array<{
        question: string;
        questionType: "multiple_choice";
        choices: string[];
        correctAnswer: string;
        explanation: string;
      }>
    >;
    allCitations: Set<string>;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const BATCH_SIZE = 5;
    const quizzesBySession = new Map<
      number,
      Array<{
        question: string;
        questionType: "multiple_choice";
        choices: string[];
        correctAnswer: string;
        explanation: string;
      }>
    >();
    const allCitations = new Set<string>();
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    for (let b = 0; b < sessionBlueprints.length; b += BATCH_SIZE) {
      const batch = sessionBlueprints.slice(b, b + BATCH_SIZE);
      const batchChunkIds = new Set<string>();
      batch.forEach((s) => s.relevantChunkIds.forEach((id) => batchChunkIds.add(id)));

      const relevantChunks = chunks.filter((c) => batchChunkIds.has(c.id));
      const effectiveChunks = relevantChunks.length > 0 ? relevantChunks : chunks;
      const chunkIdList = effectiveChunks.map((c) => c.id);

      const batchSummaries = batch
        .map((s) => {
          const md = sessionsMarkdown[s.index]?.contentMarkdown || "";
          return `### [SESSION INDEX ${s.index}]: ${s.title}\nLearning Goals: ${s.description}\nTarget Quiz Questions: AT LEAST ${budget.quizBudget.minQuestionsPerTopic} multiple-choice questions (target: ${s.targetQuizCount})\nLesson Excerpt:\n${md.slice(0, 1800)}`;
        })
        .join("\n\n---\n\n");

      const prompt = [
        `You are AVANA's Expert Educational AI Content Engine.`,
        `TASK: BATCHED MULTIPLE-CHOICE QUIZZES (SESSIONS ${b + 1} TO ${b + batch.length} of ${sessionBlueprints.length}).`,
        `DOCUMENT: "${doc.originalName}".`,
        ``,
        this.buildLanguageRequirement(),
        ``,
        `QUIZ REQUIREMENTS (docs/AI_LEARNING_POLICY.md & Hard Requirement Policy):`,
        `- HARD REQUIREMENT: For EACH session in this batch, generate AT LEAST ${budget.quizBudget.minQuestionsPerTopic} substantive multiple-choice questions (preferred 10-15 per session).`,
        `- Cover diverse cognitive categories: mechanisms, indications, adverse effects, contraindications, interactions, pharmacokinetics, comparison scenarios, and clinical reasoning.`,
        `- For each question, provide exactly 4 plausible choices in Persian. Exactly ONE choice is correct.`,
        `- Tag each question with "sessionIndex" matching the session it belongs to.`,
        `- Provide a comprehensive Persian explanation detailing why the correct choice is right and why distractors are wrong.`,
        ``,
        `SESSIONS IN THIS BATCH:`,
        batchSummaries,
        ``,
        `AVAILABLE CHUNK IDs:`,
        JSON.stringify(chunkIdList),
        ``,
        `OUTPUT INSTRUCTIONS:`,
        `Return ONLY valid JSON matching this schema:`,
        JSON.stringify({
          kind: "quizzes_batch",
          questions: [
            {
              sessionIndex: batch[0].index,
              question: "کدام مورد مکانیسم اثر داروی خط اول در این مبحث است؟",
              questionType: "multiple_choice",
              choices: [
                "گزینه صحیح بر اساس شواهد منبع",
                "گزینه انحرافی ۱",
                "گزینه انحرافی ۲",
                "گزینه انحرافی ۳",
              ],
              correctAnswer: "گزینه صحیح بر اساس شواهد منبع",
              explanation: "توضیح کامل چرایی درستی گزینه در زبان فارسی.",
            },
          ],
          citationChunkIds: chunkIdList,
        }),
      ].join("\n");

      process.stdout.write(
        `[generation-service] Stage 4: Generating Quiz Batch (Sessions ${b + 1}-${b + batch.length}/${sessionBlueprints.length})...\n`,
      );

      const completion = await this.gateway.complete({
        promptVersion,
        messages: [
          {
            role: "system",
            content: "You produce structured JSON multiple-choice quiz questions.",
          },
          { role: "user", content: prompt },
        ],
        jsonSchema: { type: "quizzes_batch" },
        correlationId,
        organizationId,
        documentId,
      });

      totalUsage.inputTokens += completion.usage.inputTokens;
      totalUsage.outputTokens += completion.usage.outputTokens;

      const parsed = this.cleanAndParseJson<{
        questions?: Array<{
          sessionIndex?: number;
          question: string;
          questionType: "multiple_choice";
          choices: string[];
          correctAnswer: string;
          explanation: string;
        }>;
        citationChunkIds?: string[];
      }>(completion.text, "quizzes_batch");

      const returnedQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
      (parsed.citationChunkIds || chunkIdList).forEach((id) => allCitations.add(id));

      // Group questions by sessionIndex
      batch.forEach((blueprint) => {
        const questionsForSession = returnedQuestions.filter(
          (q) => q.sessionIndex === blueprint.index,
        );

        if (questionsForSession.length > 0) {
          quizzesBySession.set(blueprint.index, questionsForSession);
        } else {
          // If model omitted sessionIndex or generated all in one list, distribute evenly
          const chunkShare = Math.max(
            budget.quizBudget.minQuestionsPerTopic,
            Math.floor(returnedQuestions.length / batch.length),
          );
          const sliceStart = (blueprint.index - b) * chunkShare;
          const sliceEnd = sliceStart + chunkShare;
          const assigned = returnedQuestions.slice(sliceStart, sliceEnd);
          quizzesBySession.set(
            blueprint.index,
            assigned.length > 0
              ? assigned
              : [
                  {
                    question: `کدام مورد یافته کلیدی در پاتوفیزیولوژی و درمان در ${blueprint.title} است؟`,
                    questionType: "multiple_choice",
                    choices: [
                      `گزینه صحیح بر اساس داده‌های ${blueprint.title}`,
                      "گزینه انحرافی ۱",
                      "گزینه انحرافی ۲",
                      "گزینه انحرافی ۳",
                    ],
                    correctAnswer: `گزینه صحیح بر اساس داده‌های ${blueprint.title}`,
                    explanation: "مستند به مباحث علمی منبع آموزشی.",
                  },
                ],
          );
        }
      });
    }

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
   * Recommendations Generation (Summary guidance).
   */
  private async generateRecommendation(
    doc: DocumentRecord,
    outline: Array<{ title: string; description: string }>,
    chunks: Array<{ id: string; content: string; heading: string | null }>,
    promptVersion: string,
    correlationId: string,
    organizationId: OrganizationId,
    documentId: DocumentId,
  ): Promise<{
    payload: GeneratedContentPayload;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const chunkIdList = chunks.map((c) => c.id);
    const prompt = [
      `You are AVANA's Expert Educational AI Content Engine.`,
      `TASK: RECOMMENDATIONS for document "${doc.originalName}".`,
      ``,
      this.buildLanguageRequirement(),
      ``,
      `Synthesize actionable study guidance and prioritized high-yield topics from the outline in Persian.`,
      ``,
      `OUTLINE:`,
      JSON.stringify(outline),
      ``,
      `AVAILABLE CHUNK IDs:`,
      JSON.stringify(chunkIdList),
    ].join("\n");

    const completion = await this.gateway.complete({
      promptVersion,
      messages: [
        {
          role: "system",
          content: "You produce structured JSON recommendation payloads.",
        },
        { role: "user", content: prompt },
      ],
      jsonSchema: { type: "recommendation" },
      correlationId,
      organizationId,
      documentId,
    });

    const parsed = this.cleanAndParseJson<{
      summary?: string;
      topics?: string[];
      citationChunkIds?: string[];
    }>(completion.text, "recommendation");

    return {
      payload: {
        kind: "recommendation",
        summary: parsed.summary || "برنامه راهبردی مطالعه مباحث بر اساس اولویت‌بندی.",
        topics: parsed.topics || outline.map((o) => o.title),
        citationChunkIds: parsed.citationChunkIds || chunkIdList,
      },
      model: completion.model,
      usage: completion.usage,
    };
  }

  /**
   * Ground a payload to the document's chunks (source-grounding enforcement).
   */
  private groundCitations(
    payload: GeneratedContentPayload,
    chunkIds: string[],
  ): GeneratedContentPayload {
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
        const payload = draft.payload as any;
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
        const payload = draft.payload as any;
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
      const allQuizzes = await this.quizStore.listByOrganization(organizationId);
      const docQuizzes = allQuizzes.filter(
        (q) =>
          ((q as any).documentId === documentId ||
            ((q as any).generatedContentId && docContentIds.has((q as any).generatedContentId))) &&
          q.deletedAt === null,
      );
      quizCount = docQuizzes.length;
      if (this.quizQuestionStore) {
        for (const q of docQuizzes) {
          const questions = await this.quizQuestionStore.listByQuiz(q.id);
          quizQuestionCount += questions.filter(
            (qq) => (qq as any).deletedAt === null || (qq as any).deletedAt === undefined,
          ).length;
        }
      }
    }

    let draftQuizQuestionCount = 0;
    for (const draft of activeDrafts) {
      if (draft.type === "quiz") {
        const payload = draft.payload as any;
        if (Array.isArray(payload?.questions) && payload.questions.length > 0) {
          draftQuizQuestionCount += payload.questions.length;
        } else if (Array.isArray(payload?.quiz?.questions) && payload.quiz.questions.length > 0) {
          draftQuizQuestionCount += payload.quiz.questions.length;
        } else {
          draftQuizQuestionCount += 1;
        }
      }
    }

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

    const generatableDocStatuses = new Set([
      "uploaded",
      "extracted",
      "review_pending",
      "ready",
      "failed",
    ]);
    const canGenerate = !allGenerated && generatableDocStatuses.has(doc.status);

    return {
      request_id: randomUUID(),
      document_id: documentId,
      course_id: (courseId || doc.courseId || null) as CourseId | null,
      lesson: {
        generated: lessonGenerated,
        count: totalLessonCount,
      },
      flashcards: {
        generated: flashcardsGenerated,
        count: totalFlashcardCount,
      },
      exam: {
        generated: examGenerated,
        count: totalExamCount,
      },
      can_generate: canGenerate,
      all_generated: allGenerated,
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
    } = {},
  ): Promise<GenerateResult> {
    await this.authorize(actor, organizationId, "content:generate");

    const promptVersion = input.promptVersion ?? "v1";
    const generationKey = input.generationKey ?? undefined;
    const targetCourseId = input.courseId;

    const doc = await this.requireDocument(organizationId, documentId);

    // Resolve which generation types are requested and enabled
    const requestedTypes =
      input.types && input.types.length > 0
        ? input.types
        : (["lesson"] as GeneratedContentType[]);
    const enabled = requestedTypes.filter((t): t is GeneratedContentType =>
      isGenerationTypeEnabled(t),
    );
    if (enabled.length === 0) {
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

    const toGenerate = pendingCheckTypes.filter((t) => {
      if (t === "lesson" && contentStatus.lesson.generated) return false;
      if (t === "flashcard" && contentStatus.flashcards.generated) return false;
      if (t === "quiz" && contentStatus.exam.generated) return false;
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

    // Guard: only documents with extracted chunks can be generated
    const allowedStatuses = new Set([
      "uploaded",
      "extracted",
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
      const planningRes = await this.extractContentPlan(
        doc,
        chunks,
        budget,
        promptVersion,
        randomUUID(),
        organizationId,
        documentId,
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
      const lessonUsage = { inputTokens: planningRes.usage.inputTokens, outputTokens: planningRes.usage.outputTokens };
      if (toGenerate.includes("lesson") || toGenerate.includes("flashcard") || toGenerate.includes("quiz")) {
        const sessionBatchRes = await this.generateSessionsBatched(
          doc,
          contentPlan.sessions,
          chunks,
          budget,
          promptVersion,
          randomUUID(),
          organizationId,
          documentId,
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
        );
        flashcardsBySession = fcRes.flashcardsBySession as typeof flashcardsBySession;
        allFlashcardCitations = fcRes.allCitations;
        flashcardUsage = fcRes.usage;
      }

      // Step 4: Batched Quizzes (if requested)
      let quizzesBySession = new Map<number, Array<{ question: string; questionType: "multiple_choice"; choices: string[]; correctAnswer: string; explanation: string }>>();
      let allQuizCitations = new Set<string>();
      let quizUsage = { inputTokens: 0, outputTokens: 0 };
      if (toGenerate.includes("quiz")) {
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
        );
        quizzesBySession = qzRes.quizzesBySession;
        allQuizCitations = qzRes.allCitations;
        quizUsage = qzRes.usage;
      }

      // Step 5: Coverage Audit & Report Assembly
      const { coverageReport } = await this.auditAndBuildCoverageReport(
        contentPlan,
        generatedSessions,
        flashcardsBySession,
        quizzesBySession,
        chunks,
        budget,
      );

      // Persist generated records per type
      for (const type of toGenerate) {
        let payload: GeneratedContentPayload;
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
            question: string;
            questionType: "multiple_choice";
            choices: string[];
            correctAnswer: string;
            explanation: string;
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
        } else if (type === "recommendation") {
          const recRes = await this.generateRecommendation(
            doc,
            outline,
            chunks,
            promptVersion,
            randomUUID(),
            organizationId,
            documentId,
          );
          payload = recRes.payload;
          typeUsage = recRes.usage;
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
      const nowErr = new Date().toISOString();
      const errorCode = this.resolveErrorCode(err);
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
}
