/**
 * Presentation Slide Generation Service.
 *
 * Implements Phase 2A-2.3c:
 * - Generation Pipeline Integration & Orchestration.
 * - Enforces Snapshot State Pre-condition: stops BEFORE Gemini if snapshot is missing or corrupted.
 * - ModelGateway Integration with gemini-3.5-flash-lite via existing key rotation & proxy gateway.
 * - Runtime Schema Validation for GeneratedPresentationSlide.
 * - Authoritative Server-side Citation Grounding Validation.
 * - Controlled Single-Attempt Repair with strict Allowlist and conversion to insufficient_evidence.
 * - Atomic Persistence & Optimistic Concurrency Control (expectedUpdatedAt).
 * - Preservation Invariant: Previously accepted slide content is never corrupted or overwritten on repair failure.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type DocumentId,
  type GeneratedPresentationSlide,
  type PresentationGenerationInstructions,
  type PresentationProjectId,
  type PresentationProjectRecord,
  type PresentationSlideId,
  type PresentationSlideRecord,
  type ServerCitationValidationResult,
  type SlideGenerationResult,
  asDocumentId,
  DomainError,
} from "@avana/domain";
import type {
  PresentationProjectStore,
  PresentationSlideStore,
} from "./presentation-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { ModelGateway } from "../generation/gateway/types.js";
import { ServerCitationValidator } from "./server-citation-validator.js";
import { PresentationPromptBuilder } from "./presentation-prompt-builder.js";
import {
  GENERATED_PRESENTATION_SLIDE_SCHEMA,
  validateGeneratedSlideSchema,
} from "./presentation-generation-schema.js";

export interface PresentationGenerationServiceDeps {
  projectStore: PresentationProjectStore;
  slideStore: PresentationSlideStore;
  organizationStore: OrganizationStore;
  gateway: ModelGateway;
  citationValidator?: ServerCitationValidator;
}

export class PresentationGenerationService {
  private readonly citationValidator: ServerCitationValidator;

  constructor(private readonly deps: PresentationGenerationServiceDeps) {
    this.citationValidator =
      deps.citationValidator ??
      new ServerCitationValidator({
        slideStore: deps.slideStore,
        projectStore: deps.projectStore,
      });
  }

  /**
   * Authorize actor against presentation project.
   */
  private async assertProjectAccess(
    actor: Actor,
    projectId: PresentationProjectId,
    mode: "read" | "write" = "write",
  ): Promise<PresentationProjectRecord> {
    const project = await this.deps.projectStore.findById(projectId);
    if (!project || project.deletedAt) {
      throw new DomainError("not_found", "Presentation project not found");
    }

    if (
      actor.globalRole === "platform_admin" ||
      actor.role === "platform_admin"
    ) {
      return project;
    }

    const memberships =
      await this.deps.organizationStore.listMembershipsByUserId(actor.userId);
    const orgMembership = memberships?.find(
      (m) => m.organizationId === project.organizationId,
    );

    if (!orgMembership) {
      throw new DomainError("not_found", "Presentation project not found");
    }

    if (
      orgMembership.role === "organization_admin" ||
      actor.role === "organization_admin"
    ) {
      return project;
    }

    if (project.ownerUserId === actor.userId) {
      return project;
    }

    if (mode === "read" && orgMembership.role === "course_editor") {
      return project;
    }

    throw new DomainError(
      "forbidden",
      "Role does not permit modifying this presentation project",
    );
  }

  /**
   * Generate content for a single presentation slide.
   */
  async generateSlide(params: {
    actor: Actor;
    projectId: PresentationProjectId;
    slideId: PresentationSlideId;
    instructions?: PresentationGenerationInstructions;
    correlationId?: string;
  }): Promise<SlideGenerationResult> {
    const { actor, projectId, slideId, instructions } = params;
    const correlationId = params.correlationId ?? randomUUID();
    const generationRunId = randomUUID();

    // 1. Authorize actor
    const project = await this.assertProjectAccess(actor, projectId, "write");

    // 2. Fetch slide and establish concurrency checkpoint
    const slide = await this.deps.slideStore.findById(slideId, projectId);
    if (!slide) {
      throw new DomainError("not_found", "Presentation slide not found");
    }
    const initialUpdatedAt = slide.updatedAt;

    // 3. Snapshot State Evaluation
    const snapshot = await this.deps.slideStore.getReferenceSnapshot(
      slideId,
      projectId,
    );

    const snapshotEvaluation = ServerCitationValidator.evaluateSnapshotState(snapshot);
    const snapshotState = snapshotEvaluation.state;

    // Rule: Missing or corrupted snapshot MUST stop generation BEFORE calling Gemini
    if (snapshotState === "missing_snapshot") {
      throw new DomainError(
        "bad_request",
        "Cannot generate slide content: slide has no recorded reference snapshot. Please run reference context selection first.",
      );
    }

    if (snapshotState === "corrupted_snapshot") {
      throw new DomainError(
        "unprocessable",
        `Cannot generate slide content: slide reference snapshot integrity check failed: ${snapshotEvaluation.error ?? "corrupted data"}`,
      );
    }

    // 4. Construct generation prompt
    const promptData = PresentationPromptBuilder.buildSlidePrompt({
      project,
      slide,
      snapshot: snapshot!,
      instructions,
    });

    const fallbackDocId: DocumentId =
      project.pptxDocumentId ??
      asDocumentId("00000000-0000-0000-0000-000000000000");

    // 5. Call Gemini via ModelGateway
    let completionText: string;
    try {
      const completion = await this.deps.gateway.complete({
        promptVersion: promptData.promptVersion,
        messages: [
          { role: "system", content: promptData.systemPrompt },
          { role: "user", content: promptData.userPrompt },
        ],
        jsonSchema: {
          properties: GENERATED_PRESENTATION_SLIDE_SCHEMA.properties,
          required: GENERATED_PRESENTATION_SLIDE_SCHEMA.required,
          type: "generated_presentation_slide",
        },
        correlationId,
        organizationId: project.organizationId,
        documentId: fallbackDocId,
        stage: "presentation_slide",
      });
      completionText = completion.text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DomainError(
        "service_unavailable",
        `AI Gateway generation failed: ${msg}`,
      );
    }

    // 6. Schema validation
    const rawParsedSlide = validateGeneratedSlideSchema(completionText);

    // 7. Citation grounding & Claim integrity validation
    const firstValidation = await this.citationValidator.validateFullGeneratedSlide({
      projectId,
      slideId,
      slide: rawParsedSlide,
    });

    // Case 1: First attempt is fully valid!
    if (firstValidation.valid) {
      const authoritativeSlide = firstValidation.authoritativeSlide ?? rawParsedSlide;

      // Atomic persistence with optimistic concurrency control
      await this.persistSlideSuccess({
        slideId,
        projectId,
        slide: authoritativeSlide,
        generationRunId,
        repairAttempted: false,
        expectedUpdatedAt: initialUpdatedAt,
      });

      return {
        slide: authoritativeSlide,
        validation: firstValidation,
        repairAttempted: false,
        status: "accepted",
        generationRunId,
        snapshotState,
      };
    }

    // Case 2: Validation failed -> Controlled Single-Attempt Repair
    const repairPromptData = PresentationPromptBuilder.buildRepairPrompt({
      slide: rawParsedSlide,
      snapshot: snapshot!,
      validation: firstValidation,
      language: instructions?.language ?? "fa",
    });

    let repairCompletionText: string;
    try {
      const repairCompletion = await this.deps.gateway.complete({
        promptVersion: repairPromptData.promptVersion,
        messages: [
          { role: "system", content: repairPromptData.systemPrompt },
          { role: "user", content: repairPromptData.userPrompt },
        ],
        jsonSchema: {
          properties: GENERATED_PRESENTATION_SLIDE_SCHEMA.properties,
          required: GENERATED_PRESENTATION_SLIDE_SCHEMA.required,
          type: "generated_presentation_slide",
        },
        correlationId: `${correlationId}-repair`,
        organizationId: project.organizationId,
        documentId: fallbackDocId,
        stage: "presentation_slide_repair",
      });
      repairCompletionText = repairCompletion.text;
    } catch {
      // If gateway fails during repair, record needs_review and retain existing content
      return this.handleRepairFailure({
        slideId,
        projectId,
        attemptedSlide: rawParsedSlide,
        validation: firstValidation,
        generationRunId,
        snapshotState,
        expectedUpdatedAt: initialUpdatedAt,
      });
    }

    // Validate repaired slide schema
    let repairedSlide: GeneratedPresentationSlide;
    try {
      repairedSlide = validateGeneratedSlideSchema(repairCompletionText);
    } catch {
      // If repair schema is invalid, record needs_review and retain existing content
      return this.handleRepairFailure({
        slideId,
        projectId,
        attemptedSlide: rawParsedSlide,
        validation: firstValidation,
        generationRunId,
        snapshotState,
        expectedUpdatedAt: initialUpdatedAt,
      });
    }

    // Validate repaired citations
    const repairValidation = await this.citationValidator.validateFullGeneratedSlide({
      projectId,
      slideId,
      slide: repairedSlide,
    });

    if (repairValidation.valid) {
      const authoritativeSlide = repairValidation.authoritativeSlide ?? repairedSlide;

      await this.persistSlideSuccess({
        slideId,
        projectId,
        slide: authoritativeSlide,
        generationRunId,
        repairAttempted: true,
        expectedUpdatedAt: initialUpdatedAt,
      });

      return {
        slide: authoritativeSlide,
        validation: repairValidation,
        repairAttempted: true,
        status: "accepted",
        generationRunId,
        snapshotState,
      };
    }

    // Case 3: Repair also failed (strictly NO 3rd attempt) -> record needs_review
    return this.handleRepairFailure({
      slideId,
      projectId,
      attemptedSlide: repairedSlide,
      validation: repairValidation,
      generationRunId,
      snapshotState,
      expectedUpdatedAt: initialUpdatedAt,
    });
  }

  // -------------------------------------------------------------------------
  // Private Persistence Helpers
  // -------------------------------------------------------------------------

  private async persistSlideSuccess(params: {
    slideId: PresentationSlideId;
    projectId: PresentationProjectId;
    slide: GeneratedPresentationSlide;
    generationRunId: string;
    repairAttempted: boolean;
    expectedUpdatedAt: string;
  }): Promise<PresentationSlideRecord> {
    const {
      slideId,
      projectId,
      slide,
      generationRunId,
      repairAttempted,
      expectedUpdatedAt,
    } = params;

    const formattedRawText = slide.content
      .map((item) => {
        if (item.type === "bullet_list") {
          return item.content;
        }
        return item.content;
      })
      .join("\n\n");

    return await this.deps.slideStore.updateSlide(slideId, projectId, {
      title: slide.title,
      rawText: formattedRawText,
      speakerNotes: slide.speakerNotes,
      extractionMetadata: {
        generationRunId,
        generationStatus: "accepted",
        generatedSlide: slide,
        repairAttempted,
        lastGeneratedAt: new Date().toISOString(),
      },
      expectedUpdatedAt,
    });
  }

  private async handleRepairFailure(params: {
    slideId: PresentationSlideId;
    projectId: PresentationProjectId;
    attemptedSlide: GeneratedPresentationSlide;
    validation: ServerCitationValidationResult;
    generationRunId: string;
    snapshotState: SlideGenerationResult["snapshotState"];
    expectedUpdatedAt: string;
  }): Promise<SlideGenerationResult> {
    const {
      slideId,
      projectId,
      attemptedSlide,
      validation,
      generationRunId,
      snapshotState,
      expectedUpdatedAt,
    } = params;

    // Invariant: Do NOT overwrite title, rawText, or speakerNotes of the existing slide.
    // Only update extractionMetadata to reflect needs_review and diagnostic report.
    await this.deps.slideStore.updateSlide(slideId, projectId, {
      extractionMetadata: {
        generationStatus: "needs_review",
        lastFailedGeneration: {
          generationRunId,
          attemptedSlide,
          failureStatus: validation.status,
          evaluatedCitations: validation.evaluatedCitations,
          failedAt: new Date().toISOString(),
        },
      },
      expectedUpdatedAt,
    });

    return {
      slide: attemptedSlide,
      validation,
      repairAttempted: true,
      status: "needs_review",
      generationRunId,
      snapshotState,
    };
  }
}
