/**
 * Content Repair Service (AVANA Admin Content Repair).
 *
 * Provides transactional, deterministic repair of educational lesson content
 * with optimistic concurrency control and audit trail logging.
 */

import {
  DomainError,
  ContentRepairEngine,
  type Actor,
  type LessonId,
  type OrganizationId,
  type GeneratedContentId,
  type RepairCandidate,
  type RepairPreviewResult,
  type RepairRuleId,
  type RepairValidationResult,
} from "@avana/domain";
import type { LessonStore, LessonRecord } from "../learning/learning-store.js";
import type { GeneratedContentStore, GeneratedContentRecord } from "../generation/generation-store.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { AdminStore } from "./admin-store.js";

export interface PreviewRepairRequest {
  content?: string;
  lessonId?: string;
  generatedContentId?: string;
  organizationId?: OrganizationId;
  appliedRuleIds?: RepairRuleId[];
  appliedBlockIndices?: number[];
}

export interface ApplyRepairRequest {
  content?: string;
  lessonId?: string;
  generatedContentId?: string;
  originalHash: string;
  appliedRuleIds?: RepairRuleId[];
  appliedBlockIndices?: number[];
  actor: Actor;
  organizationId?: OrganizationId;
}

export interface ApplyRepairResponse {
  success: boolean;
  lessonId?: string;
  generatedContentId?: string;
  originalContent: string;
  repairedContent: string;
  contentHash: string;
  appliedCandidates: RepairCandidate[];
  validation: RepairValidationResult;
  repairedBlockCount: number;
}

export interface ContentRepairServiceDeps {
  adminStore: AdminStore;
  lessonStore?: LessonStore;
  generatedContentStore?: GeneratedContentStore;
  auditService?: AuditService;
}

export class ContentRepairService {
  constructor(private readonly deps: ContentRepairServiceDeps) {}

  /**
   * Retrieves content from raw payload (highest priority for active editor text),
   * Lesson, or Generated Content.
   */
  private async resolveContent(input: {
    content?: string;
    lessonId?: string;
    generatedContentId?: string;
    organizationId?: OrganizationId;
  }): Promise<{ content: string; lesson?: LessonRecord; generatedContent?: GeneratedContentRecord }> {
    // 1. If explicit content string is provided (e.g. active text from editor), use it directly
    if (typeof input.content === "string") {
      let lesson: LessonRecord | undefined;
      let generatedContent: GeneratedContentRecord | undefined;

      if (input.lessonId) {
        try {
          if (this.deps.lessonStore) {
            lesson = await this.deps.lessonStore.findById(input.lessonId as LessonId);
          }
          if (!lesson && typeof (this.deps.adminStore as any).getLesson === "function") {
            lesson = await (this.deps.adminStore as any).getLesson(input.lessonId);
          }
        } catch {
          // Gracefully continue with provided content
        }
      }

      if (input.generatedContentId && this.deps.generatedContentStore) {
        try {
          const store = this.deps.generatedContentStore;
          if (input.organizationId) {
            generatedContent = await store.findByIdForOrganization(
              input.generatedContentId as GeneratedContentId,
              input.organizationId,
            );
          } else if (typeof store.findById === "function") {
            generatedContent = await store.findById(
              input.generatedContentId as GeneratedContentId,
            );
          }
        } catch {
          // Gracefully continue with provided content
        }
      }

      return { content: input.content, lesson, generatedContent };
    }

    // 2. If only lessonId is provided, resolve from database store
    if (input.lessonId) {
      if (this.deps.lessonStore) {
        const lesson = await this.deps.lessonStore.findById(input.lessonId as LessonId);
        if (lesson) {
          return { content: lesson.contentMarkdown || "", lesson };
        }
      }
      // Check adminStore fallback
      if (typeof (this.deps.adminStore as any).getLesson === "function") {
        const adminLesson = await (this.deps.adminStore as any).getLesson(input.lessonId);
        if (adminLesson) {
          return { content: adminLesson.contentMarkdown || "", lesson: adminLesson };
        }
      }
      throw new DomainError("not_found", `درس با شناسه ${input.lessonId} یافت نشد.`);
    }

    // 3. If only generatedContentId is provided, resolve draft payload
    if (input.generatedContentId) {
      if (this.deps.generatedContentStore) {
        const store = this.deps.generatedContentStore;
        let gen: GeneratedContentRecord | undefined;
        if (input.organizationId) {
          gen = await store.findByIdForOrganization(
            input.generatedContentId as GeneratedContentId,
            input.organizationId,
          );
        } else if (typeof store.findById === "function") {
          gen = await store.findById(
            input.generatedContentId as GeneratedContentId,
          );
        }
        if (gen) {
          const payload = (gen.payload || {}) as Record<string, unknown>;
          const raw = String(
            payload.contentMarkdown ??
            payload.content_markdown ??
            payload.markdown ??
            (Array.isArray(payload.sessions) && (payload.sessions[0] as Record<string, unknown>)?.contentMarkdown) ??
            "",
          );
          return { content: raw, generatedContent: gen };
        }
      }
      throw new DomainError(
        "not_found",
        `محتوای پیش‌نویس با شناسه ${input.generatedContentId} یافت نشد.`,
      );
    }

    throw new DomainError(
      "bad_request",
      "یکی از مقادیر content ،lessonId یا generatedContentId باید ارسال شود.",
    );
  }

  /**
   * Generates a preview of repairs.
   */
  async preview(input: PreviewRepairRequest): Promise<RepairPreviewResult> {
    const { content } = await this.resolveContent(input);
    return ContentRepairEngine.preview(content, {
      filterRuleIds: input.appliedRuleIds,
      filterBlockIndices: input.appliedBlockIndices,
    });
  }

  /**
   * Applies repairs with optimistic concurrency check and audit logging.
   */
  async apply(input: ApplyRepairRequest): Promise<ApplyRepairResponse> {
    const resolved = await this.resolveContent(input);
    const originalContent = resolved.content;

    // Target persistence validation and prioritization:
    // Case A: lessonId is provided and resolved.lesson exists -> primary target is Lesson entity.
    // Case B: generatedContentId is provided and resolved.generatedContent exists -> primary target is Generated Content draft.
    // Case C: Neither target exists in the database -> fail with explicit, descriptive 404 DomainError.
    const hasLessonTarget = Boolean(input.lessonId && resolved.lesson);
    const hasGeneratedTarget = Boolean(input.generatedContentId && resolved.generatedContent);

    if (!hasLessonTarget && !hasGeneratedTarget) {
      if (input.lessonId) {
        throw new DomainError(
          "not_found",
          "درس برای ذخیره اصلاحات پیدا نشد. ابتدا درس را ذخیره کنید.",
        );
      }
      if (input.generatedContentId) {
        throw new DomainError(
          "not_found",
          "محتوای پیش‌نویس برای ذخیره اصلاحات پیدا نشد.",
        );
      }
      throw new DomainError(
        "bad_request",
        "برای اعمال و ذخیره اصلاحات، شناسه درس (lessonId) یا پیش‌نویس (generatedContentId) الزامی است.",
      );
    }

    // Apply deterministic repair
    const applyResult = ContentRepairEngine.apply(originalContent, {
      content: originalContent,
      originalHash: input.originalHash,
      appliedRuleIds: input.appliedRuleIds,
      appliedBlockIndices: input.appliedBlockIndices,
    });

    if (!applyResult.success) {
      const errorMsg =
        applyResult.validation.errors.join(" | ") ||
        "محتوا از زمان پیش‌نمایش تغییر کرده است. دوباره بررسی کنید.";
      throw new DomainError("conflict", errorMsg);
    }

    const now = new Date().toISOString();

    // 1. If targeting an existing database lesson
    if (input.lessonId && resolved.lesson) {
      if (this.deps.lessonStore) {
        await this.deps.lessonStore.update({
          ...resolved.lesson,
          contentMarkdown: applyResult.repairedContent,
          updatedAt: now,
        });
      } else if (typeof (this.deps.adminStore as any).updateLessonContent === "function") {
        await (this.deps.adminStore as any).updateLessonContent(
          input.lessonId,
          applyResult.repairedContent,
        );
      }
    }

    // 2. If targeting generated content draft
    if (input.generatedContentId && resolved.generatedContent && this.deps.generatedContentStore) {
      const gen = resolved.generatedContent;
      const prevPayload = gen.payload;
      const updatedPayload = {
        ...prevPayload,
        contentMarkdown: applyResult.repairedContent,
        content_markdown: applyResult.repairedContent,
      };

      await this.deps.generatedContentStore.update({
        ...gen,
        payload: updatedPayload,
        previousPayload: prevPayload,
        editedBy: input.actor?.userId || "00000000-0000-0000-0000-000000000001",
        editedAt: now,
        updatedAt: now,
      });
    }

    // 3. Emit Audit log
    if (this.deps.auditService && input.actor) {
      const orgId =
        input.organizationId ||
        (resolved.lesson?.moduleId as unknown as OrganizationId) ||
        resolved.generatedContent?.organizationId ||
        null;

      await this.deps.auditService.emit([
        {
          actorId: input.actor?.userId || "00000000-0000-0000-0000-000000000001",
          organizationId: orgId,
          action: "content.edited",
          entityType: input.lessonId ? "lesson" : input.generatedContentId ? "generated_content" : "lesson",
          entityId: (input.lessonId || input.generatedContentId || "raw") as string,
          details: {
            repairAction: "deterministic_repair",
            ruleIds: applyResult.appliedCandidates.map((c) => c.ruleId),
            repairedBlockCount: applyResult.repairedBlockCount,
            originalHash: input.originalHash,
            newHash: applyResult.contentHash,
          },
          createdAt: now,
        },
      ]);
    }

    return {
      success: true,
      lessonId: input.lessonId,
      generatedContentId: input.generatedContentId,
      originalContent,
      repairedContent: applyResult.repairedContent,
      contentHash: applyResult.contentHash,
      appliedCandidates: applyResult.appliedCandidates,
      validation: applyResult.validation,
      repairedBlockCount: applyResult.repairedBlockCount,
    };
  }
}
