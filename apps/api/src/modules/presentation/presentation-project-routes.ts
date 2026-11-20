import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type Role,
  type OrganizationId,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type PresentationSlideRecord,
  type PresentationReferenceRecord,
  type SlideReferenceContextSnapshot,
  type SnapshotReferenceChunk,
  type SlideLayoutAssembly,
  type PresentationSpeakerContent,
  type TargetDurationMinutes,
  type IntegratedReferenceChunk,
  type PresentationGenerationInstructions,
  type UUID,
  asDocumentId,
  asOrganizationId,
  asPresentationProjectId,
  asPresentationSlideId,
  asPresentationBatchId,
  DomainError,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
  validatePresentationProjectInput,
  validatePresentationSlideInput,
  formatSpeechText,
  PRESENTATION_SLIDE_COST_TOMAN,
} from "@avana/domain";
import type {
  PresentationProjectResource,
  PresentationProjectResponse,
  PresentationProjectListResponse,
  CreatePresentationProjectRequest,
  UpdatePresentationProjectRequest,
  PresentationSlideResource,
  PresentationSlideResponse,
  CreatePresentationSlideRequest,
  UpdatePresentationSlideRequest,
  GenerateSlideRequest,
  GenerateSlideResponse,
  GenerateAllSlidesRequest,
  GenerateAllSlidesResponse,
  PresentationGenerationStatusResponse,
  PresentationBatchSlideProgress,
  PresentationBatchCostPreviewResponse,
  PresentationReferenceResource,
  ImportPptxResponse,
  PresentationPdfStatusResponse,
  ExportPresentationPdfRequest,
  PresentationPdfExportOptions,
} from "@avana/contracts";
import type { WalletService } from "../wallet/wallet-service.js";
import type { AuthMiddlewareDeps } from "../../http/authMiddleware.js";
import { makeAuthMiddleware } from "../../http/authMiddleware.js";
import {
  PdfGenerationService,
  defaultPdfGenerationService,
} from "../admin/pdf-generation-service.js";
import {
  renderPresentationPdfHtml,
  type PresentationExportSlideItem,
} from "./presentation-pdf-template.js";
import type {
  PresentationProjectStore,
  PresentationSlideStore,
  PresentationReferenceStore,
} from "./presentation-store.js";
import type { PresentationGenerationService } from "./presentation-generation-service.js";
import type { PresentationLayoutService } from "./presentation-layout-service.js";
import type { PresentationReferenceIntegrationService } from "./reference-integration-service.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { StorageProvider } from "../storage/storage-provider.js";
import { PresentationImportService } from "./presentation-import-service.js";
import { PresentationPdfConverter } from "./presentation-pdf-converter.js";
import { HeuristicLexicalContextSelector } from "./reference-context-selector.js";
import {
  type PresentationGenerationOperationStore,
  DrizzlePresentationGenerationOperationStore,
  InMemoryPresentationGenerationOperationStore,
} from "./presentation-generation-operation-store.js";
import { PresentationGenerationOperationService } from "./presentation-generation-operation-service.js";
import { DrizzlePresentationSlideStore } from "./drizzle-presentation-slide-store.js";

export interface PresentationProjectRouteOptions {
  projectStore: PresentationProjectStore;
  slideStore: PresentationSlideStore;
  referenceStore?: PresentationReferenceStore;
  generationService: PresentationGenerationService;
  layoutService?: PresentationLayoutService;
  referenceIntegrationService?: PresentationReferenceIntegrationService;
  organizationStore: OrganizationStore;
  sessionService: AuthMiddlewareDeps["sessionService"];
  userStore: AuthMiddlewareDeps["userStore"];
  storageProvider?: StorageProvider;
  importService?: PresentationImportService;
  pdfConverter?: PresentationPdfConverter;
  pdfGenerationService?: PdfGenerationService;
  walletService?: WalletService;
  operationStore?: PresentationGenerationOperationStore;
  operationService?: PresentationGenerationOperationService;
}

function mapProjectToResource(
  record: PresentationProjectRecord,
): PresentationProjectResource {
  return {
    id: record.id,
    organization_id: record.organizationId,
    owner_user_id: record.ownerUserId,
    title: record.title,
    pptx_document_id: record.pptxDocumentId,
    target_duration_minutes: record.targetDurationMinutes,
    academic_level: record.academicLevel,
    tone: record.tone,
    elaboration_depth: record.elaborationDepth,
    status: record.status,
    current_stage: record.currentStage,
    total_slides: record.totalSlides,
    overall_introduction: record.overallIntroduction,
    overall_conclusion: record.overallConclusion,
    total_estimated_seconds: record.totalEstimatedSeconds,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function mapSlideToResource(
  record: PresentationSlideRecord,
): PresentationSlideResource {
  const speechContent = record.extractionMetadata?.speechContent as
    | PresentationSpeakerContent
    | undefined;

  const isPaid = Boolean(record.paymentTransactionId && record.paidAt);

  return {
    id: record.id,
    project_id: record.projectId,
    slide_index: record.slideIndex,
    title: record.title,
    raw_text: record.rawText,
    extracted_tables: record.extractedTables,
    speaker_notes: record.speakerNotes,
    speech_content: speechContent ?? null,
    has_visuals: record.hasVisuals,
    visual_summary: record.visualSummary,
    media_storage_keys: record.mediaStorageKeys,
    extraction_metadata: record.extractionMetadata,
    payment_transaction_id: record.paymentTransactionId ?? null,
    paid_at: record.paidAt ?? null,
    is_paid: isPaid,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function mapReferenceToResource(
  record: PresentationReferenceRecord,
): PresentationReferenceResource {
  return {
    id: record.id,
    project_id: record.projectId,
    document_id: record.documentId,
    type: record.type,
    title: record.title,
    source_identifier: record.sourceIdentifier,
    access_status: record.accessStatus,
    bibliographic_metadata: record.bibliographicMetadata,
    extracted_content: record.extractedContent,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function getActor(request: unknown): Actor {
  const reqAny = request as {
    user?: {
      userId?: string;
      id?: string;
      role?: string;
      globalRole?: string | null;
    };
  };
  const user = reqAny.user;
  const uid = user?.userId ?? user?.id;
  if (!uid) {
    throw new DomainError("unauthorized", "User is not authenticated");
  }
  return {
    userId: uid as Actor["userId"],
    role: (user?.role ?? "student") as Actor["role"],
    globalRole: (user?.globalRole as Role) ?? null,
  };
}

async function assertProjectAccess(
  actor: Actor,
  projectId: PresentationProjectId,
  projectStore: PresentationProjectStore,
  organizationStore: OrganizationStore,
  mode: "read" | "write" = "read",
): Promise<PresentationProjectRecord> {
  const project = await projectStore.findById(projectId);
  if (!project || project.deletedAt) {
    throw new DomainError("not_found", "Presentation project not found");
  }

  // 1. Platform admin check
  if (
    actor.globalRole === "platform_admin" ||
    actor.role === "platform_admin"
  ) {
    return project;
  }

  // 2. Resolve tenant membership
  const memberships =
    await organizationStore.listMembershipsByUserId(actor.userId);
  const orgMembership = memberships?.find(
    (m) => m.organizationId === project.organizationId,
  );

  if (!orgMembership) {
    // Non-disclosing 404
    throw new DomainError("not_found", "Presentation project not found");
  }

  // 3. Organization admin check
  if (
    orgMembership.role === "organization_admin" ||
    actor.role === "organization_admin"
  ) {
    return project;
  }

  // 4. Project owner check
  if (project.ownerUserId === actor.userId) {
    return project;
  }

  // 5. Read access for course_editor in the same organization
  if (mode === "read" && orgMembership.role === "course_editor") {
    return project;
  }

  throw new DomainError(
    "forbidden",
    "Role does not permit accessing this presentation project",
  );
}

export const presentationProjectRoutes: FastifyPluginAsync<
  PresentationProjectRouteOptions
> = async (app, opts) => {
  const {
    sessionService,
    userStore,
    projectStore,
    slideStore,
    referenceStore,
    generationService,
    layoutService,
    referenceIntegrationService,
    organizationStore,
    storageProvider,
    walletService,
  } = opts;

  const pdfConverter =
    opts.pdfConverter ??
    (storageProvider
      ? new PresentationPdfConverter({
          storageProvider,
          logger: app.log,
        })
      : undefined);

  const importService =
    opts.importService ??
    (storageProvider
      ? new PresentationImportService({
          projectStore,
          slideStore,
          organizationStore,
          storageProvider,
          pdfConverter,
          logger: app.log,
        })
      : undefined);

  const { requireAuth } = makeAuthMiddleware({ sessionService, userStore });
  const pdfService = opts.pdfGenerationService ?? defaultPdfGenerationService;

  const operationStore =
    opts.operationStore ??
    (slideStore instanceof DrizzlePresentationSlideStore
      ? new DrizzlePresentationGenerationOperationStore((slideStore as unknown as { db: import("@avana/database/client").DbClient }).db)
      : new InMemoryPresentationGenerationOperationStore());

  const operationService =
    opts.operationService ??
    new PresentationGenerationOperationService(
      operationStore,
      slideStore,
      generationService,
      walletService,
      layoutService,
    );

  // In-flight concurrency lock to prevent duplicate concurrent generation for the same presentation project
  const activeProjectGenerations = new Set<string>();

  async function ensureSlideSnapshot(params: {
    actor: Actor;
    projectId: PresentationProjectId;
    slide: PresentationSlideRecord;
    projectChunks?: IntegratedReferenceChunk[] | null;
  }): Promise<void> {
    const { actor, projectId, slide } = params;
    let chunks = params.projectChunks;

    if (chunks === undefined) {
      const references = referenceStore
        ? await referenceStore.findByProjectId(projectId)
        : [];
      if (references.length > 0 && referenceIntegrationService) {
        try {
          chunks = await referenceIntegrationService.resolveProjectChunks(actor, projectId);
        } catch {
          chunks = [];
        }
      } else {
        chunks = [];
      }
    }

    if (chunks && chunks.length > 0) {
      const selector = new HeuristicLexicalContextSelector();
      const combinedExistingText = [slide.rawText, slide.speakerNotes]
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .join("\n");

      const selection = selector.selectChunksForSlide(chunks, {
        slideIndex: slide.slideIndex,
        title: slide.title ?? "",
        existingText: combinedExistingText || undefined,
      });

      let selectedChunks = selection.selectedChunks;
      if (selectedChunks.length === 0 && chunks.length > 0) {
        selectedChunks = [
          {
            chunk: chunks[0],
            score: 0.5,
            reasons: ["Top reference chunk fallback"],
            estimatedTokens: chunks[0].chunk.tokenEstimate,
            rank: 1,
          },
        ];
      }

      const snapshotChunks: SnapshotReferenceChunk[] = selectedChunks.map(
        (sc, index) => ({
          chunkId: sc.chunk.id,
          referenceId: sc.chunk.source.referenceId,
          sourceType: sc.chunk.source.sourceType,
          sourceTitle: sc.chunk.source.title,
          citationLabel: sc.chunk.source.citationLabel,
          sourceLocation: {
            startPage: sc.chunk.location.startPage,
            endPage: sc.chunk.location.endPage,
            slideIndex: sc.chunk.location.slideIndex,
            confidence: sc.chunk.location.confidence,
          },
          contentHash: sc.chunk.chunk.contentHash,
          content: sc.chunk.chunk.content,
          selectionScore: sc.score,
          selectionReasons: sc.reasons,
          rank: index + 1,
        }),
      );

      const snapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId,
        slideIndex: slide.slideIndex,
        totalSelectedTokens: selection.totalSelectedTokens,
        chunks: snapshotChunks,
      };

      await slideStore.saveReferenceSnapshot(slide.id, projectId, snapshot);
    } else {
      const snapshot: SlideReferenceContextSnapshot = {
        schemaVersion: SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
        generationRunId: randomUUID(),
        selectorVersion: "heuristic-lexical-v1",
        selectedAt: new Date().toISOString(),
        projectId,
        slideIndex: slide.slideIndex,
        totalSelectedTokens: 0,
        chunks: [],
      };

      await slideStore.saveReferenceSnapshot(slide.id, projectId, snapshot);
    }
  }

  async function computeGenerationStatus(
    projectId: PresentationProjectId,
  ): Promise<PresentationGenerationStatusResponse> {
    // Autonomous financial recovery for stale generating operations (> 5 mins)
    try {
      await operationService.recoverStaleOperations(5 * 60 * 1000);
      const staleSlides = await slideStore.findStaleGeneratingSlides(5 * 60 * 1000);
      for (const stale of staleSlides) {
        const activeOp = await operationStore.findActiveBySlideId(stale.id);
        if (!activeOp) {
          await slideStore.updateSlide(stale.id, stale.projectId, {
            extractionMetadata: {
              ...(stale.extractionMetadata || {}),
              generationStatus: "failed",
              lastError: "عملیات تولید به دلیل وقفه سیستم لغو گردید.",
            },
            paymentTransactionId: stale.paidAt && stale.paymentTransactionId ? stale.paymentTransactionId : null,
            paidAt: stale.paidAt && stale.paymentTransactionId ? stale.paidAt : null,
          }).catch(() => {});
        }
      }
    } catch (recoveryErr) {
      app.log.warn({ recoveryErr, projectId }, "Error during stale presentation operations recovery");
    }

    const [project, slides] = await Promise.all([
      projectStore.findById(projectId),
      slideStore.findByProjectId(projectId),
    ]);

    const sortedSlides = [...slides].sort((a, b) => a.slideIndex - b.slideIndex);
    const totalSlides = sortedSlides.length;

    let completedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    let currentSlideIndex: number | null = null;

    const slidesProgress: PresentationBatchSlideProgress[] = sortedSlides.map((slide) => {
      const metadata = slide.extractionMetadata || {};
      const statusMeta = (metadata.generationStatus as string) || "draft";
      const hasSpeech = Boolean(metadata.speechContent || slide.speakerNotes);

      let status: "pending" | "generating" | "completed" | "failed" = "pending";
      if (statusMeta === "generating") {
        status = "generating";
        currentSlideIndex = slide.slideIndex;
      } else if (statusMeta === "accepted" || hasSpeech) {
        status = "completed";
        completedCount++;
      } else if (statusMeta === "failed") {
        status = "failed";
        failedCount++;
      } else {
        status = "pending";
        pendingCount++;
      }

      return {
        slide_id: slide.id,
        slide_index: slide.slideIndex,
        title: slide.title,
        status,
        error: typeof metadata.lastError === "string" ? metadata.lastError : null,
      };
    });

    const isGenerating = activeProjectGenerations.has(projectId);
    let overallStatus: "idle" | "generating" | "completed" | "failed" = "idle";
    if (isGenerating) {
      overallStatus = "generating";
    } else if (totalSlides > 0 && completedCount === totalSlides) {
      overallStatus = "completed";
    } else if (totalSlides > 0 && failedCount === totalSlides) {
      overallStatus = "failed";
    } else if (completedCount > 0) {
      overallStatus = "idle";
    }

    const previouslyPaidSlides = sortedSlides.filter((s) => Boolean(s.paymentTransactionId && s.paidAt)).length;
    const totalCostToman = previouslyPaidSlides * PRESENTATION_SLIDE_COST_TOMAN;
    const refundedSlides = failedCount;

    return {
      project_id: projectId,
      status: overallStatus,
      is_generating: isGenerating,
      total_slides: totalSlides,
      completed_slides: completedCount,
      failed_slides: failedCount,
      pending_slides: pendingCount,
      previously_paid_slides: previouslyPaidSlides,
      total_cost_toman: totalCostToman,
      refunded_slides: refundedSlides,
      current_slide_index: currentSlideIndex,
      slides_progress: slidesProgress,
      last_updated_at: project?.updatedAt || new Date().toISOString(),
    };
  }

  async function runBatchGeneration(params: {
    actor: Actor;
    projectId: PresentationProjectId;
    instructions?: PresentationGenerationInstructions;
    onlyUnprocessed?: boolean;
  }): Promise<void> {
    const { actor, projectId, instructions, onlyUnprocessed } = params;

    try {
      await projectStore.update(projectId, {
        status: "generating",
      });

      const slides = await slideStore.findByProjectId(projectId);
      const sortedSlides = [...slides].sort((a, b) => a.slideIndex - b.slideIndex);

      // Pre-resolve reference chunks once for the entire project
      let projectChunks: IntegratedReferenceChunk[] = [];
      const references = referenceStore
        ? await referenceStore.findByProjectId(projectId)
        : [];
      if (references.length > 0 && referenceIntegrationService) {
        try {
          projectChunks = await referenceIntegrationService.resolveProjectChunks(actor, projectId);
        } catch (err) {
          app.log.warn({ err }, "Could not resolve reference chunks for batch generation, proceeding with direct slides");
        }
      }

      const allSlidesOutline = sortedSlides.map((s) => ({
        slideIndex: s.slideIndex,
        title: s.title,
      }));
      const coveredConcepts: string[] = [];

      const batchId = asPresentationBatchId(randomUUID() as UUID);

      for (let i = 0; i < sortedSlides.length; i++) {
        const slide = sortedSlides[i];
        const metadata = slide.extractionMetadata || {};
        const isAlreadyAccepted = metadata.generationStatus === "accepted" && Boolean(metadata.speechContent);

        if (onlyUnprocessed && isAlreadyAccepted) {
          const sp = metadata.speechContent as PresentationSpeakerContent | undefined;
          if (sp?.keyPoints) {
            for (const kp of sp.keyPoints) {
              if (coveredConcepts.length < 8 && !coveredConcepts.includes(kp)) {
                coveredConcepts.push(kp);
              }
            }
          }
          continue;
        }

        await projectStore.update(projectId, {
          currentStage: `batch:${i + 1}/${sortedSlides.length}`,
        });

        // Extract previous slide summary for sequential coherence
        let previousSlideSummary: string | null = null;
        if (i > 0) {
          const prevSlide = sortedSlides[i - 1];
          const latestPrev = await slideStore.findById(prevSlide.id, projectId);
          const prevMetadata = latestPrev?.extractionMetadata || prevSlide.extractionMetadata;
          const prevSpeech = prevMetadata?.speechContent as PresentationSpeakerContent | undefined;
          if (prevSpeech?.speechText) {
            const preview = prevSpeech.speechText.slice(0, 220);
            const keyPointsStr = prevSpeech.keyPoints?.slice(0, 2).join("، ") || "";
            previousSlideSummary = `اسلاید قبلی (${latestPrev?.title || prevSlide.title || "بدون عنوان"}): ${preview}... نکات کلیدی: ${keyPointsStr}`;
          } else if (prevSlide.rawText) {
            previousSlideSummary = `اسلاید قبلی: ${prevSlide.rawText.slice(0, 150)}`;
          }
        }

        const nextSlideTitle = i < sortedSlides.length - 1 ? sortedSlides[i + 1].title : null;

        try {
          const execRes = await operationService.executeSlideGeneration({
            actor,
            projectId,
            slideId: slide.id,
            batchId,
            instructions,
            previousSlideSummary,
            nextSlideTitle,
            allSlidesOutline,
            coveredKeyConcepts: [...coveredConcepts],
            onSnapshotNeeded: async () => {
              await ensureSlideSnapshot({
                actor,
                projectId,
                slide,
                projectChunks,
              });
            },
          });

          if (execRes.generationResult.speechContent?.keyPoints) {
            for (const kp of execRes.generationResult.speechContent.keyPoints) {
              if (coveredConcepts.length < 8 && !coveredConcepts.includes(kp)) {
                coveredConcepts.push(kp);
              }
            }
          }
        } catch (slideErr) {
          app.log.error(
            { err: slideErr, slideId: slide.id, slideIndex: slide.slideIndex },
            "Failed generating slide in batch generation",
          );
        }
      }

      const finalSlides = await slideStore.findByProjectId(projectId);
      const anySuccess = finalSlides.some(
        (s) => s.extractionMetadata?.generationStatus === "accepted" || s.extractionMetadata?.speechContent,
      );

      await projectStore.update(projectId, {
        status: anySuccess ? "completed" : "failed",
        currentStage: null,
      });
    } finally {
      activeProjectGenerations.delete(projectId);
    }
  }

  // -------------------------------------------------------------------------
  // 1. POST /v1/presentation/projects
  // -------------------------------------------------------------------------
  app.post<{
    Body: CreatePresentationProjectRequest;
  }>("/v1/presentation/projects", { preHandler: [requireAuth] }, async (request, reply) => {
    const actor = getActor(request);
    const body = request.body;

    if (!body || !body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      throw new DomainError("bad_request", "Presentation project title is required");
    }

    // Resolve & authorize tenant organization
    const memberships = await organizationStore.listMembershipsByUserId(actor.userId);
    let targetOrgId: OrganizationId;

    if (body.organization_id) {
      const requestedOrgId = asOrganizationId(body.organization_id);
      const isMember = memberships?.some((m) => m.organizationId === requestedOrgId);
      if (!isMember && actor.globalRole !== "platform_admin" && actor.role !== "platform_admin") {
        throw new DomainError(
          "forbidden",
          "User is not a member of the requested organization",
        );
      }
      targetOrgId = requestedOrgId;
    } else {
      if (!memberships || memberships.length === 0) {
        throw new DomainError(
          "bad_request",
          "User does not belong to any organization to create presentation projects",
        );
      }
      targetOrgId = asOrganizationId(memberships[0].organizationId);
    }

    validatePresentationProjectInput({
      title: body.title,
      targetDurationMinutes: body.target_duration_minutes as any,
      academicLevel: body.academic_level,
      tone: body.tone,
      elaborationDepth: body.elaboration_depth,
    });

    const project = await projectStore.create({
      organizationId: targetOrgId,
      ownerUserId: actor.userId,
      title: body.title.trim(),
      pptxDocumentId: body.pptx_document_id ? asDocumentId(body.pptx_document_id) : null,
      targetDurationMinutes: body.target_duration_minutes as any,
      academicLevel: body.academic_level,
      tone: body.tone,
      elaborationDepth: body.elaboration_depth,
    });

    const response: PresentationProjectResponse = {
      project: mapProjectToResource(project),
    };

    return reply.status(201).send(response);
  });

  // -------------------------------------------------------------------------
  // 1b. POST /v1/presentation/projects/import-pptx
  // Multipart upload of real PowerPoint (.pptx) file
  // -------------------------------------------------------------------------
  app.post("/v1/presentation/projects/import-pptx", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!importService) {
      throw new DomainError(
        "internal_error",
        "Presentation import service is not configured (missing storage provider).",
      );
    }

    const actor = getActor(request);

    let part;
    try {
      part = await request.file();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid multipart request";
      throw new DomainError(
        "bad_request",
        `Multipart upload error: ${msg}`,
      );
    }

    if (!part) {
      throw new DomainError("bad_request", "Multipart file upload is required");
    }

    if (part.file?.truncated || (part as unknown as { truncated?: boolean }).truncated) {
      throw new DomainError(
        "bad_request",
        "Uploaded PPTX file exceeds the maximum allowed size (50MB) or was truncated.",
      );
    }

    const fileBuffer = await part.toBuffer();

    if (part.file?.truncated || (part as unknown as { truncated?: boolean }).truncated) {
      throw new DomainError(
        "bad_request",
        "Uploaded PPTX file exceeds the maximum allowed size (50MB) or was truncated.",
      );
    }

    const filename = part.filename || "presentation.pptx";
    const mimeType = part.mimetype || "application/octet-stream";

    const fields = (part.fields ?? {}) as Record<string, any>;
    const getFieldValue = (key: string): string | undefined => {
      const val = fields[key];
      if (!val) return undefined;
      if (typeof val === "string") return val;
      if (Array.isArray(val)) {
        const first = val[0];
        return typeof first === "object" && first && "value" in first
          ? String((first as any).value)
          : undefined;
      }
      if (typeof val === "object" && val && "value" in val) {
        return String((val as any).value);
      }
      return undefined;
    };

    const title = getFieldValue("title");
    const organizationIdRaw =
      getFieldValue("organization_id") ||
      (request.query as { organization_id?: string })?.organization_id;
    const organizationId = organizationIdRaw
      ? asOrganizationId(organizationIdRaw)
      : undefined;
    const academicLevel = getFieldValue("academic_level") as any;
    const tone = getFieldValue("tone") as any;
    const elaborationDepth = getFieldValue("elaboration_depth") as any;
    const targetDurationMinutesRaw = getFieldValue("target_duration_minutes");
    const parsedDuration = targetDurationMinutesRaw
      ? parseInt(targetDurationMinutesRaw, 10)
      : undefined;
    const allowedDurations: readonly number[] = [5, 10, 15, 20, 30];
    const targetDurationMinutes: TargetDurationMinutes | undefined =
      parsedDuration !== undefined && allowedDurations.includes(parsedDuration)
        ? (parsedDuration as TargetDurationMinutes)
        : undefined;

    const result = await importService.importFromPptx(
      actor,
      {
        data: fileBuffer,
        originalName: filename,
        mimeType,
        sizeBytes: fileBuffer.length,
      },
      {
        title,
        organizationId,
        academicLevel,
        tone,
        elaborationDepth,
        targetDurationMinutes,
      },
    );

    const response: ImportPptxResponse = {
      project: mapProjectToResource(result.project),
      slides: result.slides.map(mapSlideToResource),
    };

    return reply.status(201).send(response);
  });

  // -------------------------------------------------------------------------
  // 2. GET /v1/presentation/projects
  // -------------------------------------------------------------------------
  app.get<{
    Querystring: { organization_id?: string };
  }>("/v1/presentation/projects", { preHandler: [requireAuth] }, async (request, reply) => {
    const actor = getActor(request);
    const queryOrgId = request.query?.organization_id
      ? asOrganizationId(request.query.organization_id)
      : undefined;

    const projects = await projectStore.listByUserId(actor.userId, queryOrgId);

    const response: PresentationProjectListResponse = {
      items: projects.map(mapProjectToResource),
      total: projects.length,
    };

    return reply.status(200).send(response);
  });

  // -------------------------------------------------------------------------
  // 3. GET /v1/presentation/projects/:projectId
  // -------------------------------------------------------------------------
  app.get<{
    Params: { projectId: string };
  }>(
    "/v1/presentation/projects/:projectId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      const project = await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "read",
      );

      const [slides, references] = await Promise.all([
        slideStore.findByProjectId(projectId),
        referenceStore ? referenceStore.findByProjectId(projectId) : Promise.resolve([]),
      ]);

      const response: PresentationProjectResponse = {
        project: mapProjectToResource(project),
        slides: slides.map(mapSlideToResource),
        references: references.map(mapReferenceToResource),
      };

      return reply.status(200).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 4. PATCH /v1/presentation/projects/:projectId
  // -------------------------------------------------------------------------
  app.patch<{
    Params: { projectId: string };
    Body: UpdatePresentationProjectRequest;
  }>(
    "/v1/presentation/projects/:projectId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "write",
      );

      const body = request.body ?? {};

      validatePresentationProjectInput({
        title: body.title,
        targetDurationMinutes: body.target_duration_minutes as any,
        academicLevel: body.academic_level,
        tone: body.tone,
        elaborationDepth: body.elaboration_depth,
        status: body.status as any,
      });

      const updated = await projectStore.update(projectId, {
        title: body.title,
        targetDurationMinutes: body.target_duration_minutes as any,
        academicLevel: body.academic_level,
        tone: body.tone,
        elaborationDepth: body.elaboration_depth,
        status: body.status as any,
        overallIntroduction: body.overall_introduction,
        overallConclusion: body.overall_conclusion,
      });

      const response: PresentationProjectResponse = {
        project: mapProjectToResource(updated),
      };

      return reply.status(200).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 5. POST /v1/presentation/projects/:projectId/slides
  // -------------------------------------------------------------------------
  app.post<{
    Params: { projectId: string };
    Body: CreatePresentationSlideRequest;
  }>(
    "/v1/presentation/projects/:projectId/slides",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      const project = await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "write",
      );

      const body = request.body;
      if (!body || typeof body.slide_index !== "number") {
        throw new DomainError("bad_request", "Slide index is required");
      }

      validatePresentationSlideInput({
        projectId,
        slideIndex: body.slide_index,
        title: body.title,
      });

      const slide = await slideStore.createSlide({
        projectId,
        slideIndex: body.slide_index,
        title: body.title ?? null,
        rawText: body.raw_text ?? "",
        speakerNotes: body.speaker_notes ?? null,
        hasVisuals: body.has_visuals ?? false,
        visualSummary: body.visual_summary ?? null,
      });

      // Maintain project totalSlides monotonic count
      if (body.slide_index > project.totalSlides) {
        await projectStore.update(projectId, {
          totalSlides: body.slide_index,
        });
      }

      const response: PresentationSlideResponse = {
        slide: mapSlideToResource(slide),
      };

      return reply.status(201).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 6. PATCH /v1/presentation/projects/:projectId/slides/:slideId
  // -------------------------------------------------------------------------
  app.patch<{
    Params: { projectId: string; slideId: string };
    Body: UpdatePresentationSlideRequest;
  }>(
    "/v1/presentation/projects/:projectId/slides/:slideId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);
      const slideId = asPresentationSlideId(request.params.slideId);

      await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "write",
      );

      const existingSlide = await slideStore.findById(slideId, projectId);
      if (!existingSlide) {
        throw new DomainError("not_found", "Presentation slide not found");
      }

      const body = request.body ?? {};
      const formattedSpeakerNotes =
        typeof body.speaker_notes === "string"
          ? formatSpeechText(body.speaker_notes)
          : body.speaker_notes;

      // Invariant: Do NOT overwrite raw AI speechText in extractionMetadata with user speaker_notes!
      // extractionMetadata.speechContent.speechText preserves the pristine AI-generated baseline.
      const updated = await slideStore.updateSlide(slideId, projectId, {
        title: body.title,
        rawText: body.raw_text,
        speakerNotes: formattedSpeakerNotes,
        hasVisuals: body.has_visuals,
        visualSummary: body.visual_summary,
        expectedUpdatedAt: body.expected_updated_at,
      });

      const response: PresentationSlideResponse = {
        slide: mapSlideToResource(updated),
      };

      return reply.status(200).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 7. POST /v1/presentation/projects/:projectId/slides/:slideId/generate
  // -------------------------------------------------------------------------
  app.post<{
    Params: { projectId: string; slideId: string };
    Body?: GenerateSlideRequest;
  }>(
    "/v1/presentation/projects/:projectId/slides/:slideId/generate",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);
      const slideId = asPresentationSlideId(request.params.slideId);

      await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "write",
      );

      const instructions = request.body?.instructions
        ? {
            academicLevel: request.body.instructions.academic_level,
            tone: request.body.instructions.tone,
            elaborationDepth: request.body.instructions.elaboration_depth,
            language: request.body.instructions.language,
            customInstructions: request.body.instructions.custom_instructions,
          }
        : undefined;

      const slide = await slideStore.findById(slideId, projectId);
      if (!slide) {
        throw new DomainError("not_found", "Presentation slide not found");
      }

      const clientKey = request.headers["idempotency-key"] as string | undefined;

      const execResult = await operationService.executeSlideGeneration({
        actor,
        projectId,
        slideId,
        idempotencyKey: clientKey ? `client_${clientKey}_slide_${slideId}` : undefined,
        instructions,
        onSnapshotNeeded: async () => {
          await ensureSlideSnapshot({
            actor,
            projectId,
            slide,
          });
        },
      });

      const finalSlide = await slideStore.findById(slideId, projectId);
      if (!finalSlide) {
        throw new DomainError("not_found", "Presentation slide not found after generation");
      }

      let layoutAssembly: SlideLayoutAssembly | undefined;
      if (layoutService && execResult.generationResult.status === "accepted") {
        try {
          const layoutResult = await layoutService.assembleAndPersistLayout({
            actor,
            projectId,
            slideId,
          });
          layoutAssembly = layoutResult.assembly;
        } catch {
          // Layout assembly failure is non-fatal to content generation
        }
      }

      const response: GenerateSlideResponse = {
        slide: mapSlideToResource(finalSlide),
        generation_status: execResult.generationResult.status,
        repair_attempted: execResult.generationResult.repairAttempted,
        validation_status: execResult.generationResult.validation.status,
        generation_run_id: execResult.generationResult.generationRunId,
        model: execResult.generationResult.model,
        layout_assembly: layoutAssembly,
        speech_content: execResult.generationResult.speechContent ?? null,
      };

      return reply.status(200).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 8. POST /v1/presentation/projects/:projectId/generate-all
  // Generates speech content for all slides in the project sequentially
  // -------------------------------------------------------------------------
  app.post<{
    Params: { projectId: string };
    Body?: GenerateAllSlidesRequest & { wait?: boolean };
  }>(
    "/v1/presentation/projects/:projectId/generate-all",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "write",
      );

      const instructions = request.body?.instructions
        ? {
            academicLevel: request.body.instructions.academic_level,
            tone: request.body.instructions.tone,
            elaborationDepth: request.body.instructions.elaboration_depth,
            language: request.body.instructions.language,
            customInstructions: request.body.instructions.custom_instructions,
          }
        : undefined;

      const onlyUnprocessed = request.body?.only_unprocessed ?? false;
      const shouldWait = Boolean(request.body?.wait);

      const allSlides = await slideStore.findByProjectId(projectId);
      const targetSlides = onlyUnprocessed
        ? allSlides.filter(
            (s) => !(s.extractionMetadata?.generationStatus === "accepted" && Boolean(s.extractionMetadata?.speechContent)),
          )
        : allSlides;

      const unpaidSlides = targetSlides.filter((s) => !Boolean(s.paidAt && s.paymentTransactionId));
      const requiredCostToman = unpaidSlides.length * PRESENTATION_SLIDE_COST_TOMAN;

      if (requiredCostToman > 0 && walletService) {
        const myWallet = await walletService.getMyWallet(actor);
        if (myWallet.balance < requiredCostToman) {
          throw new DomainError(
            "bad_request",
            `موجودی کیف پول شما (${myWallet.balance.toLocaleString("fa-IR")} تومان) برای تولید این اسلایدها (${requiredCostToman.toLocaleString("fa-IR")} تومان) کافی نیست. لطفاً ابتدا کیف پول خود را شارژ نمایید.`,
          );
        }
      }

      if (activeProjectGenerations.has(projectId)) {
        const currentStatus = await computeGenerationStatus(projectId);
        const response: GenerateAllSlidesResponse = {
          project_id: projectId,
          message: "تولید متون ارائه در حال حاضر در پس‌زمینه در جریان است.",
          status: currentStatus,
        };
        return reply.status(200).send(response);
      }

      activeProjectGenerations.add(projectId);

      const batchPromise = runBatchGeneration({
        actor,
        projectId,
        instructions,
        onlyUnprocessed,
      }).catch((err) => {
        app.log.error({ err, projectId }, "Batch presentation generation background error");
      });

      if (shouldWait) {
        await batchPromise;
        const finalStatus = await computeGenerationStatus(projectId);
        const response: GenerateAllSlidesResponse = {
          project_id: projectId,
          message: "تولید متن تمام اسلایدها با موفقیت تکمیل شد.",
          status: finalStatus,
        };
        return reply.status(200).send(response);
      }

      const initialStatus = await computeGenerationStatus(projectId);
      const response: GenerateAllSlidesResponse = {
        project_id: projectId,
        message: "فرایند هوشمند تولید متن تمام اسلایدها آغاز گردید.",
        status: {
          ...initialStatus,
          is_generating: true,
          status: "generating",
        },
      };

      return reply.status(202).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 9. GET /v1/presentation/projects/:projectId/generation-status
  // Live tracking for presentation speech generation progress
  // -------------------------------------------------------------------------
  app.get<{
    Params: { projectId: string };
  }>(
    "/v1/presentation/projects/:projectId/generation-status",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "read",
      );

      const status = await computeGenerationStatus(projectId);
      return reply.status(200).send(status);
    },
  );

  // -------------------------------------------------------------------------
  // 10. GET /v1/presentation/projects/:projectId/batch-cost-preview
  // Computes preview of slides, previously paid slides, cost, and balance check
  // -------------------------------------------------------------------------
  app.get<{
    Params: { projectId: string };
    Querystring?: { only_unprocessed?: string };
  }>(
    "/v1/presentation/projects/:projectId/batch-cost-preview",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "read",
      );

      const onlyUnprocessed = request.query?.only_unprocessed === "true";
      const slides = await slideStore.findByProjectId(projectId);

      let eligibleSlides = slides;
      if (onlyUnprocessed) {
        eligibleSlides = slides.filter(
          (s) => !(s.extractionMetadata?.generationStatus === "accepted" && Boolean(s.extractionMetadata?.speechContent)),
        );
      }

      const previouslyPaidCount = eligibleSlides.filter(
        (s) => Boolean(s.paidAt && s.paymentTransactionId),
      ).length;

      const slidesToPay = eligibleSlides.length - previouslyPaidCount;
      const totalCostToman = slidesToPay * PRESENTATION_SLIDE_COST_TOMAN;

      let currentBalanceToman = 0;
      if (walletService) {
        try {
          const myWallet = await walletService.getMyWallet(actor);
          currentBalanceToman = myWallet.balance;
        } catch {
          currentBalanceToman = 0;
        }
      }

      const response: PresentationBatchCostPreviewResponse = {
        project_id: projectId,
        total_slides: eligibleSlides.length,
        previously_paid_slides: previouslyPaidCount,
        unpaid_slides: slidesToPay,
        cost_per_slide_toman: PRESENTATION_SLIDE_COST_TOMAN,
        total_cost_toman: totalCostToman,
        wallet_balance_toman: currentBalanceToman,
        has_sufficient_balance: currentBalanceToman >= totalCostToman,
      };

      return reply.status(200).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 10. GET /v1/presentation/projects/:projectId/pdf-status
  // Returns PDF readiness status for slide viewer (supports new & legacy projects)
  // -------------------------------------------------------------------------
  app.get<{
    Params: { projectId: string };
  }>(
    "/v1/presentation/projects/:projectId/pdf-status",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      const project = await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "read",
      );

      if (!pdfConverter || !storageProvider) {
        const response: PresentationPdfStatusResponse = {
          project_id: projectId,
          status: "unavailable",
          error: "PDF storage or converter is not configured",
        };
        return reply.status(200).send(response);
      }

      // Find originalStorageKey to evaluate cache validity and on-demand conversion
      const slides = await slideStore.findByProjectId(projectId);
      let originalStorageKey: string | undefined;
      for (const slide of slides) {
        const meta = slide.extractionMetadata as Record<string, unknown> | undefined;
        const originalFile = meta?.originalFile as { storageKey?: string } | undefined;
        if (originalFile?.storageKey) {
          originalStorageKey = originalFile.storageKey;
          break;
        }
      }

      const statusResult = await pdfConverter.getStatus(
        project.organizationId,
        projectId,
        originalStorageKey,
      );

      if (statusResult.status === "ready") {
        const response: PresentationPdfStatusResponse = {
          project_id: projectId,
          status: "ready",
          pdf_url: `/v1/presentation/projects/${projectId}/slides-pdf`,
        };
        return reply.status(200).send(response);
      }

      if (statusResult.status === "processing") {
        const response: PresentationPdfStatusResponse = {
          project_id: projectId,
          status: "processing",
        };
        return reply.status(200).send(response);
      }

      if (statusResult.status === "failed") {
        const response: PresentationPdfStatusResponse = {
          project_id: projectId,
          status: "failed",
          error: statusResult.error ?? "PDF conversion failed",
          retry_after: statusResult.retryAfterSeconds ?? null,
        };
        return reply.status(200).send(response);
      }

      if (statusResult.status === "unavailable") {
        const response: PresentationPdfStatusResponse = {
          project_id: projectId,
          status: "unavailable",
          error: statusResult.error ?? "LibreOffice is not installed on the server environment.",
        };
        return reply.status(200).send(response);
      }

      // Check if we can trigger on-demand conversion for pending/legacy presentations
      if (originalStorageKey) {
        const fileExists = await storageProvider.exists(originalStorageKey);
        if (fileExists) {
          // Trigger non-blocking conversion in background
          pdfConverter
            .convertPptxToPdf({
              organizationId: project.organizationId,
              projectId,
              pptxStorageKey: originalStorageKey,
            })
            .catch((err) => {
              app.log.warn(
                { err, projectId },
                "Background on-demand PDF conversion failed",
              );
            });

          const response: PresentationPdfStatusResponse = {
            project_id: projectId,
            status: "processing",
          };
          return reply.status(200).send(response);
        }
      }

      const response: PresentationPdfStatusResponse = {
        project_id: projectId,
        status: "unavailable",
        error: "No original presentation file found",
      };
      return reply.status(200).send(response);
    },
  );

  // -------------------------------------------------------------------------
  // 11. GET /v1/presentation/projects/:projectId/slides-pdf
  // Securely streams original converted PDF with tenant authorization
  // -------------------------------------------------------------------------
  app.get<{
    Params: { projectId: string };
  }>(
    "/v1/presentation/projects/:projectId/slides-pdf",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      const project = await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "read",
      );

      if (!pdfConverter || !storageProvider) {
        throw new DomainError("not_found", "PDF storage is not configured");
      }

      const pdfKey = pdfConverter.getPdfStorageKey(
        project.organizationId,
        projectId,
      );

      let ready = await storageProvider.exists(pdfKey);

      if (!ready) {
        // If not ready, check if we can trigger conversion for old presentation
        const slides = await slideStore.findByProjectId(projectId);
        let originalStorageKey: string | undefined;
        for (const slide of slides) {
          const meta = slide.extractionMetadata as Record<string, unknown> | undefined;
          const originalFile = meta?.originalFile as { storageKey?: string } | undefined;
          if (originalFile?.storageKey) {
            originalStorageKey = originalFile.storageKey;
            break;
          }
        }

        if (originalStorageKey && (await storageProvider.exists(originalStorageKey))) {
          const conversionResult = await pdfConverter.convertPptxToPdf({
            organizationId: project.organizationId,
            projectId,
            pptxStorageKey: originalStorageKey,
          });
          if (conversionResult.success) {
            ready = true;
          }
        }
      }

      if (!ready) {
        throw new DomainError(
          "not_found",
          "PDF presentation slides are not available for this project",
        );
      }

      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", 'inline; filename="slides.pdf"');
      reply.header("Cache-Control", "private, max-age=3600");

      if (storageProvider.readStream) {
        const stream = await storageProvider.readStream(pdfKey);
        return reply.send(stream);
      } else {
        const data = await storageProvider.read(pdfKey);
        return reply.send(data);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 12. POST /v1/presentation/projects/:projectId/export-pdf
  // Securely generates and streams a high-fidelity academic presentation PDF
  // -------------------------------------------------------------------------
  app.post<{
    Params: { projectId: string };
    Body: ExportPresentationPdfRequest;
  }>(
    "/v1/presentation/projects/:projectId/export-pdf",
    {
      preHandler: [requireAuth],
      bodyLimit: 30 * 1024 * 1024, // 30MB limit to safely support extracted slide images
    },
    async (request, reply) => {
      const actor = getActor(request);
      const projectId = asPresentationProjectId(request.params.projectId);

      const project = await assertProjectAccess(
        actor,
        projectId,
        projectStore,
        organizationStore,
        "read",
      );

      const body = request.body || ({} as ExportPresentationPdfRequest);
      const options: PresentationPdfExportOptions = body.options || {};
      const clientSlideImages = body.slideImages || {};
      const draftNotes = body.draftNotesBySlideId || {};

      // 1. Fetch slides for this presentation project in canonical order
      const slideRecords = await slideStore.findByProjectId(projectId);
      const sortedSlides = [...slideRecords].sort((a, b) => a.slideIndex - b.slideIndex);

      if (sortedSlides.length === 0) {
        throw new DomainError("bad_request", "این ارائه فاقد اسلاید برای خروجی PDF است.");
      }

      // 2. Map slides into presentation export items
      const items: PresentationExportSlideItem[] = sortedSlides.map((slide) => {
        const metadata = (slide.extractionMetadata || {}) as Record<string, unknown>;
        const speechContent = metadata.speechContent as PresentationSpeakerContent | undefined;

        // Resolution precedence for speech text:
        // 1. Local draft explicitly sent in request (if non-empty)
        // 2. User-edited speaker notes saved in DB
        // 3. Raw AI-generated speech text
        let effectiveSpeechText: string | null = null;
        let isUserEdited = false;

        const draftText = draftNotes[slide.id]?.trim();
        const savedNotes = slide.speakerNotes?.trim();
        const rawAiSpeech = speechContent?.speechText?.trim();

        if (draftText) {
          effectiveSpeechText = draftText;
          isUserEdited = draftText !== rawAiSpeech;
        } else if (savedNotes) {
          effectiveSpeechText = savedNotes;
          isUserEdited = true;
        } else if (rawAiSpeech) {
          effectiveSpeechText = rawAiSpeech;
          isUserEdited = false;
        }

        // Image validation:
        // Must be a data URI starting with data:image/ and under 4MB
        let slideImage: string | undefined =
          clientSlideImages[slide.slideIndex] ||
          clientSlideImages[String(slide.slideIndex)];

        if (typeof slideImage === "string") {
          const trimmed = slideImage.trim();
          if (
            !trimmed.startsWith("data:image/") ||
            trimmed.length > 4 * 1024 * 1024 // max 4MB per slide image
          ) {
            slideImage = undefined;
          }
        } else {
          slideImage = undefined;
        }

        // Fallback structured content if real image is not provided
        const textBlocks = metadata.textBlocks as Array<{ type?: string; text?: string }> | undefined;
        const fallbackContent = !slideImage
          ? {
              rawText: slide.rawText,
              textBlocks: textBlocks || [],
              tables: slide.extractedTables || [],
            }
          : undefined;

        return {
          slideIndex: slide.slideIndex,
          title: slide.title,
          speechText: effectiveSpeechText,
          isUserEditedNotes: isUserEdited,
          keyPoints: speechContent?.keyPoints,
          supplementaryExplanation: speechContent?.supplementaryExplanation,
          clinicalExample: speechContent?.clinicalExample
            ? {
                scenario: speechContent.clinicalExample.scenario,
                clinicalPearl: speechContent.clinicalExample.clinicalPearl,
              }
            : null,
          transitionSentence: speechContent?.transitionSentence,
          suggestedDurationSeconds: speechContent?.suggestedDurationSeconds,
          slideImageBase64: slideImage,
          fallbackContent,
        };
      });

      // 3. Render HTML with canonical AVANA styles, typography, and callouts
      const html = renderPresentationPdfHtml({
        projectTitle: project.title,
        targetDurationMinutes: project.targetDurationMinutes,
        academicLevel: project.academicLevel,
        tone: project.tone,
        elaborationDepth: project.elaborationDepth,
        totalSlides: sortedSlides.length,
        options,
        slides: items,
      });

      // 4. Generate PDF buffer via Playwright Chromium
      const pdfBuffer = await pdfService.generatePdfFromHtml(html, {
        displayHeaderFooter: true,
        headerTitle: project.title,
        footerSubtitle: "آوانا • دستیار ارائه دانشگاهی",
      });

      const safeAsciiFallback = `presentation-${projectId.replace(/[^\w-]/g, "_")}.pdf`;
      const cleanTitle = project.title.replace(/[\\/:*?"<>|]/g, "_").trim();
      const finalFilename = `ارائه - ${cleanTitle || "آوانا"}.pdf`;
      const encodedFilename = encodeURIComponent(finalFilename);

      return reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="${safeAsciiFallback}"; filename*=UTF-8''${encodedFilename}`,
        )
        .header("Content-Length", pdfBuffer.length)
        .header("Cache-Control", "private, no-cache, no-store, must-revalidate")
        .header("Pragma", "no-cache")
        .send(pdfBuffer);
    },
  );
};

