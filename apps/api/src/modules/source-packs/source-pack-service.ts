import {
  type Actor,
  type CourseId,
  type DocumentId,
  type GeneratedContentType,
  type OrganizationId,
  type SourcePackId,
  type SourcePackRole,
  asGenerationJobId,
  DomainError,
  normalizeAndValidateSourcePackDocuments,
  isPrimaryRole,
  canonicalizeSourceRole,
  isOfficialCourse,
  canManageOfficialContent,
} from "@avana/domain";
import type { CourseStore } from "../courses/course-store.js";
import type { DocumentStore, DocumentRecord } from "../learning/learning-store.js";
import type { GenerationService } from "../generation/generation-service.js";
import type { GenerationQueue, GenerationContext } from "../generation/generation-queue.js";
import type { WalletService } from "../wallet/wallet-service.js";
import type { WalletStore } from "../wallet/wallet-store.js";
import { refundGenerationJobDebit } from "../generation/generation-refund-helper.js";
import { randomUUID } from "node:crypto";
import type {
  SourcePackStore,
  SourcePackWithDocumentsRecord,
  UpdateSourcePackInput,
} from "./source-pack-store.js";

export interface SourcePackServiceDeps {
  store: SourcePackStore;
  documentStore: DocumentStore;
  courseStore: CourseStore;
  generationService?: GenerationService;
  generationQueue?: GenerationQueue;
  walletService?: WalletService;
  walletStore?: WalletStore;
  systemOrganizationId?: OrganizationId;
  questionPatternStore?: import("../generation/question-patterns-store.js").QuestionPatternStore;
}

export class SourcePackService {
  constructor(private readonly deps: SourcePackServiceDeps) {}

  private async assertCourseAccess(
    courseId: CourseId,
    organizationId: OrganizationId,
    actor: Actor,
    action: "read" | "write" = "read",
  ): Promise<void> {
    const sysOrgId =
      this.deps.systemOrganizationId ??
      (process.env.SYSTEM_ORGANIZATION_ID as OrganizationId);
    const course = await this.deps.courseStore.findById(courseId);
    if (!course) {
      throw new DomainError("not_found", "Course not found");
    }
    const isOfficial = isOfficialCourse(course, sysOrgId);
    if (isOfficial) {
      if (action === "write" && !canManageOfficialContent(actor, sysOrgId)) {
        throw new DomainError(
          "forbidden",
          "مدیریت پک‌های منابع در دوره‌های رسمی آوانا مجاز نیست.",
        );
      }
    } else {
      if (course.organizationId !== organizationId) {
        throw new DomainError("forbidden", "Access denied to this course");
      }
    }
  }

  private async validateDocumentsInCourse(
    documents: Array<{ documentId: DocumentId }>,
    courseId: CourseId,
    organizationId: OrganizationId,
  ): Promise<DocumentRecord[]> {
    const verified: DocumentRecord[] = [];
    for (const d of documents) {
      const doc = await this.deps.documentStore.findByIdForOrganization(
        d.documentId,
        organizationId,
      );
      if (!doc) {
        throw new DomainError("not_found", `Document ${d.documentId} not found`);
      }
      if (doc.courseId && doc.courseId !== courseId) {
        throw new DomainError("bad_request", `Document ${d.documentId} does not belong to this course`);
      }
      verified.push(doc);
    }
    return verified;
  }

  async createPack(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    input: {
      title: string;
      documents: Array<{
        documentId: DocumentId;
        role?: SourcePackRole;
        orderIndex?: number;
      }>;
    },
  ): Promise<SourcePackWithDocumentsRecord> {
    await this.assertCourseAccess(courseId, organizationId, actor, "write");

    const title = input.title?.trim() || "پک منابع جدید";
    const normalizedDocs = normalizeAndValidateSourcePackDocuments(input.documents);

    // Verify all documents exist and belong to the same course/org
    await this.validateDocumentsInCourse(normalizedDocs, courseId, organizationId);

    return await this.deps.store.create({
      organizationId,
      courseId,
      title,
      documents: normalizedDocs,
    });
  }

  async getPack(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    packId: SourcePackId,
  ): Promise<SourcePackWithDocumentsRecord> {
    await this.assertCourseAccess(courseId, organizationId, actor);

    const pack = await this.deps.store.findById(packId, organizationId);
    if (!pack || pack.courseId !== courseId) {
      throw new DomainError("not_found", "Source pack not found");
    }
    return pack;
  }

  async listPacks(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<SourcePackWithDocumentsRecord[]> {
    await this.assertCourseAccess(courseId, organizationId, actor);
    return await this.deps.store.listByCourse(courseId, organizationId);
  }

  async updatePack(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    packId: SourcePackId,
    input: {
      title?: string;
      documents?: Array<{
        documentId: DocumentId;
        role?: SourcePackRole;
        orderIndex?: number;
      }>;
    },
  ): Promise<SourcePackWithDocumentsRecord> {
    await this.assertCourseAccess(courseId, organizationId, actor, "write");

    const existing = await this.deps.store.findById(packId, organizationId);
    if (!existing || existing.courseId !== courseId) {
      throw new DomainError("not_found", "Source pack not found");
    }

    const updatePayload: UpdateSourcePackInput = {};
    if (input.title !== undefined) {
      updatePayload.title = input.title.trim() || existing.title;
    }

    if (input.documents !== undefined) {
      const normalizedDocs = normalizeAndValidateSourcePackDocuments(input.documents);
      await this.validateDocumentsInCourse(normalizedDocs, courseId, organizationId);
      updatePayload.documents = normalizedDocs;
    }

    return await this.deps.store.update(packId, organizationId, updatePayload);
  }

  async deletePack(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    packId: SourcePackId,
  ): Promise<void> {
    await this.assertCourseAccess(courseId, organizationId, actor, "write");

    const existing = await this.deps.store.findById(packId, organizationId);
    if (!existing || existing.courseId !== courseId) {
      throw new DomainError("not_found", "Source pack not found");
    }

    await this.deps.store.delete(packId, organizationId);
  }

  /**
   * Generates unified multi-source content from a Source Pack.
   * Leverages the existing multi-source generation pipeline:
   * 1. Requires at least 2 ready/extracted documents in the pack.
   * 2. Reserves all documents atomically.
   * 3. Charges a single debit for all sources via walletService.
   * 4. Enqueues job with primary documentId and full sources list for Stage 1 unified planning.
   */
  async generateFromPack(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    packId: SourcePackId,
    options?: {
      types?: GeneratedContentType[];
      promptVersion?: string;
      questionPatternId?: string | null;
      questionPatternVersion?: number | null;
      questionPatternIds?: string[] | null;
    },
  ): Promise<{ generationJobId: string; status: string }> {
    await this.assertCourseAccess(courseId, organizationId, actor, "write");

    const pack = await this.deps.store.findById(packId, organizationId);
    if (!pack || pack.courseId !== courseId) {
      throw new DomainError("not_found", "Source pack not found");
    }

    if (pack.documents.length < 2) {
      throw new DomainError("bad_request", "تولید محتوای یکپارچه پک منابع نیازمند حداقل ۲ سند است.");
    }

    // Sort documents: primary (orderIndex 0) first, then other sources
    const sortedDocs = [...pack.documents].sort((a, b) => a.orderIndex - b.orderIndex);
    const primaryPackDoc = sortedDocs.find((d) => isPrimaryRole(d.role)) ?? sortedDocs[0];
    const nonPrimaryPackDocs = sortedDocs.filter((d) => d.documentId !== primaryPackDoc.documentId);

    const orderedSources = [
      {
        documentId: primaryPackDoc.documentId,
        order: 0,
        role: canonicalizeSourceRole(primaryPackDoc.role),
      },
      ...nonPrimaryPackDocs.map((d, i) => ({
        documentId: d.documentId,
        order: i + 1,
        role: canonicalizeSourceRole(d.role),
      })),
    ];

    // Load actual document records and verify extraction/readiness
    const loadedDocs: DocumentRecord[] = [];
    for (const s of orderedSources) {
      const doc = await this.deps.documentStore.findByIdForOrganization(
        s.documentId,
        organizationId,
      );
      if (!doc) {
        throw new DomainError("not_found", `سند ${s.documentId} یافت نشد.`);
      }
      if (doc.courseId && doc.courseId !== courseId) {
        throw new DomainError("bad_request", `سند ${s.documentId} به این درس تعلق ندارد.`);
      }
      const allowedStatuses = ["extracted", "review_pending", "ready"];
      if (!allowedStatuses.includes(doc.status)) {
        throw new DomainError(
          "conflict",
          `سند «${doc.originalName}» هنوز برای تولید محتوا آماده نیست (وضعیت: ${doc.status}). تمام فایل‌های پک منابع باید ابتدا پردازش شوند.`,
        );
      }
      loadedDocs.push(doc);
    }

    const requestedTypes: GeneratedContentType[] =
      options?.types && options.types.length > 0
        ? options.types
        : ["lesson", "flashcard", "quiz", "review_summary"];

    const isActorAdmin =
      actor.role === "platform_admin" ||
      actor.role === "organization_admin" ||
      actor.role === "course_editor";
    const generationContext: GenerationContext = isActorAdmin ? "admin" : "public";

    // 0. Validate requested question patterns before taking any reservation or billing action
    let resolvedPatternId: import("@avana/domain").QuestionPatternId | undefined;
    let resolvedPatternVersion: number | undefined;
    let resolvedPatternIds: import("@avana/domain").QuestionPatternId[] | undefined;

    const rawPatternIds: string[] = [];
    if (Array.isArray(options?.questionPatternIds)) {
      for (const id of options.questionPatternIds) {
        if (typeof id === "string" && id.trim()) {
          rawPatternIds.push(id.trim());
        }
      }
    }
    if (typeof options?.questionPatternId === "string" && options.questionPatternId.trim()) {
      rawPatternIds.push(options.questionPatternId.trim());
    }
    const requestedPatternIds = Array.from(new Set(rawPatternIds)) as import("@avana/domain").QuestionPatternId[];

    if (requestedPatternIds.length > 0) {
      if (!this.deps.questionPatternStore) {
        throw new DomainError("bad_request", "سرویس الگوهای سؤال در دسترس نیست.");
      }
      const patterns = await this.deps.questionPatternStore.findByIds(requestedPatternIds);
      const foundMap = new Map(patterns.map((p) => [p.id, p]));

      for (const id of requestedPatternIds) {
        const pattern = foundMap.get(id);
        if (!pattern || pattern.deletedAt) {
          throw new DomainError("bad_request", `الگوی سؤال درخواستی با شناسه ${id} نامعتبر یا حذف‌شده است.`);
        }
        if (!isActorAdmin && !pattern.isActive) {
          throw new DomainError("bad_request", `الگوی سؤال درخواستی با شناسه ${id} غیرفعال است.`);
        }
      }

      const validPatterns = requestedPatternIds
        .map((id) => foundMap.get(id)!)
        .filter((p) => (isActorAdmin ? !p.deletedAt : p.isActive && !p.deletedAt));

      if (validPatterns.length > 0) {
        resolvedPatternIds = validPatterns.map((p) => p.id);
        resolvedPatternId = validPatterns[0].id;
        resolvedPatternVersion =
          typeof options?.questionPatternVersion === "number"
            ? options.questionPatternVersion
            : validPatterns[0].version;
      }
    }

    // Concurrency control: atomically reserve all documents in pack
    const reservedDocs: Array<{ doc: DocumentRecord; prevStatus: DocumentRecord["status"] }> = [];
    try {
      for (const doc of loadedDocs) {
        let res: { previousStatus: DocumentRecord["status"]; document: DocumentRecord } | undefined;
        if (this.deps.documentStore.reserveForGeneration) {
          res = await this.deps.documentStore.reserveForGeneration(doc.id, organizationId);
        } else {
          if (doc.status === "generating" || doc.status === "pending_generation") {
            res = undefined;
          } else {
            const prev = doc.status;
            const updated = await this.deps.documentStore.update({
              ...doc,
              status: "pending_generation",
              updatedAt: new Date().toISOString(),
            });
            res = { previousStatus: prev, document: updated };
          }
        }

        if (!res) {
          throw new DomainError("conflict", `سند «${doc.originalName}» در حال حاضر در حال پردازش یا تولید محتوا است.`);
        }
        reservedDocs.push({ doc: res.document, prevStatus: res.previousStatus });
      }
    } catch (reserveErr) {
      for (const r of reservedDocs) {
        await this.deps.documentStore.update({
          ...r.doc,
          status: r.prevStatus,
          updatedAt: new Date().toISOString(),
        });
      }
      throw reserveErr;
    }

    const jobId = randomUUID();
    const generationKey = `pack:${pack.id}:${randomUUID()}`;

    // Billing: Single charge for aggregate multi-source generation
    if (generationContext === "public" && this.deps.walletService && this.deps.generationService) {
      const estimate = await this.deps.generationService.estimateCostForSources(
        actor,
        organizationId,
        orderedSources.map((s) => s.documentId),
        requestedTypes,
        courseId,
      );

      const chargedAmountToman = estimate.userPrice.totalPriceToman;
      if (chargedAmountToman > 0) {
        try {
          await this.deps.walletService.debit({
            userId: actor.userId,
            amount: chargedAmountToman,
            source: "content_generation",
            referenceType: "generation_job",
            referenceId: jobId,
            idempotencyKey: `generation-debit:${jobId}`,
            metadata: {
              jobId,
              sourcePackId: pack.id,
              documentId: primaryPackDoc.documentId,
              courseId,
              organizationId,
              sourcesCount: orderedSources.length,
              types: requestedTypes,
              chargedAmountToman,
            },
          });
        } catch (debitErr) {
          for (const r of reservedDocs) {
            await this.deps.documentStore.update({
              ...r.doc,
              status: r.prevStatus,
              updatedAt: new Date().toISOString(),
            });
          }
          throw debitErr;
        }
      }
    }

    if (this.deps.generationService) {
      await this.deps.generationService.progressService.queue(
        primaryPackDoc.documentId,
        organizationId,
      );
    }

    if (!this.deps.generationQueue) {
      throw new DomainError("bad_request", "Generation queue is not configured");
    }

    try {
      const result = await this.deps.generationQueue.enqueueGenerationJob({
        jobId: asGenerationJobId(jobId),
        actorUserId: actor.userId,
        actorRole: actor.role,
        organizationId,
        documentId: primaryPackDoc.documentId,
        courseId: courseId as never,
        types: requestedTypes,
        promptVersion: options?.promptVersion,
        generationKey,
        generationContext,
        sources: orderedSources,
        questionPatternId: resolvedPatternId,
        questionPatternVersion: resolvedPatternVersion,
        questionPatternIds: resolvedPatternIds,
      });

      return {
        generationJobId: result.generationJobId,
        status: result.status,
      };
    } catch (enqueueErr) {
      if (
        generationContext === "public" &&
        this.deps.walletService &&
        this.deps.walletStore
      ) {
        await refundGenerationJobDebit({
          walletService: this.deps.walletService,
          walletStore: this.deps.walletStore,
          jobId: asGenerationJobId(jobId),
          actorUserId: actor.userId,
          documentId: primaryPackDoc.documentId,
          organizationId,
          reason: "enqueue_failed",
        });
      }

      for (const r of reservedDocs) {
        await this.deps.documentStore.update({
          ...r.doc,
          status: r.prevStatus,
          updatedAt: new Date().toISOString(),
        });
      }

      if (this.deps.generationService) {
        await this.deps.generationService.progressService.fail(
          primaryPackDoc.documentId,
          organizationId,
          enqueueErr instanceof Error
            ? enqueueErr.message
            : "خطا در صف‌بندی عملیات تولید محتوا.",
        );
      }

      throw enqueueErr;
    }
  }

  async estimatePackCost(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
    packId: SourcePackId,
    types?: GeneratedContentType[],
  ) {
    await this.assertCourseAccess(courseId, organizationId, actor, "write");

    const pack = await this.deps.store.findById(packId, organizationId);
    if (!pack || pack.courseId !== courseId) {
      throw new DomainError("not_found", "Source pack not found");
    }

    if (!this.deps.generationService) {
      throw new DomainError("bad_request", "Generation service is not configured");
    }

    const requestedTypes: GeneratedContentType[] =
      types && types.length > 0
        ? types
        : ["lesson", "flashcard", "quiz", "review_summary"];

    return await this.deps.generationService.estimateCostForSources(
      actor,
      organizationId,
      pack.documents.map((d) => d.documentId),
      requestedTypes,
      courseId,
    );
  }
}
