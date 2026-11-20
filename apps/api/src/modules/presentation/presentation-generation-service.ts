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
  type PresentationSpeakerContent,
  type ServerCitationValidationResult,
  type SlideGenerationResult,
  asDocumentId,
  DomainError,
  formatSpeechText,
  PRESENTATION_CANONICAL_MODEL,
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
  PRESENTATION_SPEAKER_CONTENT_SCHEMA,
  validateGeneratedSlideSchema,
  validateSpeakerContentSchema,
} from "./presentation-generation-schema.js";

/**
 * Validates coverage of each keyPoint within the spoken speechText.
 */
export function validateKeyPointsCoverage(
  speechText: string,
  keyPoints?: string[],
): {
  covered: boolean;
  missingPoints: string[];
  coverageRatio: number;
} {
  if (!keyPoints || keyPoints.length === 0) {
    return { covered: true, missingPoints: [], coverageRatio: 1 };
  }

  const normalize = (text: string) =>
    text
      .replace(/[\u200c\u200b]/g, " ")
      .replace(/[ي]/g, "ی")
      .replace(/[ك]/g, "ک")
      .toLowerCase();

  const normalizedSpeech = normalize(speechText);

  // Common stop words in Persian & English
  const stopWords = new Set([
    "است", "بود", "شد", "شدن", "باشد", "برای", "این", "آن", "های", "ها",
    "دارد", "دارند", "کنند", "کند", "کرده", "می‌کند", "می‌باشد", "یک", "دو",
    "هم", "نیز", "در", "بر", "از", "به", "با", "که", "تا", "و", "یا", "اما",
    "اگر", "the", "and", "for", "with", "that", "this", "from", "are", "is",
  ]);

  const missingPoints: string[] = [];
  let coveredCount = 0;

  for (const point of keyPoints) {
    const normPoint = normalize(point);
    const tokens = normPoint
      .split(/[\s,،؛;.()\[\]\-—]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !stopWords.has(t));

    if (tokens.length === 0) {
      if (normPoint.length > 0 && normalizedSpeech.includes(normPoint)) {
        coveredCount++;
      }
      continue;
    }

    const foundTokens = tokens.filter((t) => normalizedSpeech.includes(t));
    const isCovered =
      tokens.length === 1
        ? foundTokens.length === 1
        : foundTokens.length >= Math.ceil(tokens.length * 0.4);

    if (isCovered) {
      coveredCount++;
    } else {
      missingPoints.push(point);
    }
  }

  const coverageRatio = keyPoints.length > 0 ? coveredCount / keyPoints.length : 1;
  return {
    covered: missingPoints.length === 0,
    missingPoints,
    coverageRatio,
  };
}

/**
 * Guarantees seamless and 100% key point coverage inside speechText without extra round-trips.
 */
export function ensureKeyPointsInSpeech(
  speechContent: PresentationSpeakerContent,
  language: string = "fa",
): PresentationSpeakerContent {
  const coverage = validateKeyPointsCoverage(
    speechContent.speechText,
    speechContent.keyPoints,
  );

  if (coverage.covered || coverage.missingPoints.length === 0) {
    return speechContent;
  }

  const integrationText =
    language === "fa"
      ? `همچنین در تکمیل این اسلاید، بر این نکات کلیدی تأکید می‌شود که ${coverage.missingPoints.join("؛ و علاوه بر آن، ")}.`
      : `Furthermore, in emphasizing the key takeaways for this slide: ${coverage.missingPoints.join("; and additionally, ")}.`;

  return {
    ...speechContent,
    speechText: formatSpeechText(`${speechContent.speechText.trim()}\n\n${integrationText}`),
  };
}

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
    previousSlideSummary?: string | null;
    nextSlideTitle?: string | null;
    allSlidesOutline?: import("./presentation-prompt-builder.js").PresentationSlideOutlineItem[];
    coveredKeyConcepts?: string[];
  }): Promise<SlideGenerationResult> {
    const { actor, projectId, slideId, instructions } = params;
    let previousSlideSummary = params.previousSlideSummary;
    let nextSlideTitle = params.nextSlideTitle;
    let allSlidesOutline = params.allSlidesOutline;
    let coveredKeyConcepts = params.coveredKeyConcepts;

    const correlationId = params.correlationId ?? randomUUID();
    const generationRunId = randomUUID();

    // 1. Authorize actor
    const project = await this.assertProjectAccess(actor, projectId, "write");

    // Strict Model Verification: Ensure configured gateway model is gemini-3.5-flash-lite
    if (this.deps.gateway.model && this.deps.gateway.model !== PRESENTATION_CANONICAL_MODEL) {
      throw new DomainError(
        "unprocessable",
        `Presentation Assistant strictly requires model "${PRESENTATION_CANONICAL_MODEL}", but configured gateway model is "${this.deps.gateway.model}".`,
      );
    }

    // 2. Fetch slide and establish concurrency checkpoint
    const slide = await this.deps.slideStore.findById(slideId, projectId);
    if (!slide) {
      throw new DomainError("not_found", "Presentation slide not found");
    }
    const initialUpdatedAt = slide.updatedAt;

    // Automatic Narrative Context Resolution (for single slide regeneration or when not pre-provided)
    if (!allSlidesOutline || previousSlideSummary === undefined || nextSlideTitle === undefined) {
      try {
        const allSlides = await this.deps.slideStore.findByProjectId(projectId);
        const sorted = [...allSlides].sort((a, b) => a.slideIndex - b.slideIndex);

        if (!allSlidesOutline) {
          allSlidesOutline = sorted.map((s) => ({ slideIndex: s.slideIndex, title: s.title }));
        }

        const currentIndex = sorted.findIndex((s) => s.id === slideId);
        if (currentIndex > 0 && previousSlideSummary === undefined) {
          const prev = sorted[currentIndex - 1];
          const prevSpeech = prev.extractionMetadata?.speechContent as PresentationSpeakerContent | undefined;
          if (prevSpeech?.speechText) {
            const textPreview = prevSpeech.speechText.slice(0, 220);
            const kp = prevSpeech.keyPoints?.slice(0, 2).join("، ") || "";
            previousSlideSummary = `اسلاید قبلی (${prev.title || "بدون عنوان"}): ${textPreview}... نکات کلیدی: ${kp}`;
          } else if (prev.rawText) {
            previousSlideSummary = `اسلاید قبلی: ${prev.rawText.slice(0, 150)}`;
          }
        }

        if (currentIndex >= 0 && currentIndex < sorted.length - 1 && nextSlideTitle === undefined) {
          nextSlideTitle = sorted[currentIndex + 1].title;
        }

        if (!coveredKeyConcepts && currentIndex > 0) {
          const gathered: string[] = [];
          for (let i = 0; i < currentIndex; i++) {
            const sp = sorted[i].extractionMetadata?.speechContent as PresentationSpeakerContent | undefined;
            if (sp?.keyPoints) {
              for (const kp of sp.keyPoints) {
                if (gathered.length < 6 && !gathered.includes(kp)) {
                  gathered.push(kp);
                }
              }
            }
          }
          coveredKeyConcepts = gathered;
        }
      } catch {
        // Non-fatal fallback
      }
    }

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

    // 4. Construct generation prompt with presentation continuity
    const promptData = PresentationPromptBuilder.buildSpeakerPrompt({
      project,
      slide,
      snapshot: snapshot!,
      instructions,
      previousSlideSummary,
      nextSlideTitle,
      allSlidesOutline,
      coveredKeyConcepts,
    });

    const fallbackDocId: DocumentId =
      project.pptxDocumentId ??
      asDocumentId("00000000-0000-0000-0000-000000000000");

    // 5. Call Gemini via ModelGateway
    let completionText: string;
    let actualModel: string;
    try {
      const completion = await this.deps.gateway.complete({
        promptVersion: promptData.promptVersion,
        messages: [
          { role: "system", content: promptData.systemPrompt },
          { role: "user", content: promptData.userPrompt },
        ],
        jsonSchema: {
          properties: PRESENTATION_SPEAKER_CONTENT_SCHEMA.properties,
          required: PRESENTATION_SPEAKER_CONTENT_SCHEMA.required,
          type: "presentation_speaker_content",
        },
        correlationId,
        organizationId: project.organizationId,
        documentId: fallbackDocId,
        stage: "presentation_speech",
      });
      completionText = completion.text;
      actualModel = completion.model;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DomainError(
        "service_unavailable",
        `AI Gateway generation failed: ${msg}`,
      );
    }

    // Zero-fallback / Model integrity verification:
    if (actualModel !== PRESENTATION_CANONICAL_MODEL) {
      throw new DomainError(
        "service_unavailable",
        `Presentation Assistant generation aborted: unexpected model "${actualModel}" returned by AI Gateway. Required: "${PRESENTATION_CANONICAL_MODEL}".`,
      );
    }

    // 6. Schema validation (supports new PresentationSpeakerContent with backward-compatible legacy fallback)
    const parsedResult = this.parseModelOutput(completionText, {
      title: slide.title,
      defaultTitle: project.title,
    });

    // 7. Citation grounding & Claim integrity validation
    if (parsedResult.isSpeakerFormat) {
      const firstValidation = await this.citationValidator.validateSpeakerContent({
        projectId,
        slideId,
        content: parsedResult.speakerContent,
      });

      const lang = instructions?.language ?? "fa";
      const keyPointsCoverage = validateKeyPointsCoverage(
        parsedResult.speakerContent.speechText,
        parsedResult.speakerContent.keyPoints,
      );

      // Case 1: First attempt is fully valid!
      if (firstValidation.valid) {
        let authoritativeSpeaker = firstValidation.authoritativeContent ?? parsedResult.speakerContent;
        // Ensure 100% key points coverage seamlessly
        authoritativeSpeaker = ensureKeyPointsInSpeech(authoritativeSpeaker, lang);

        const authoritativeSlide: GeneratedPresentationSlide = {
          ...parsedResult.slide,
          citations: authoritativeSpeaker.citations,
        };

        await this.persistSlideSuccess({
          slideId,
          projectId,
          existingTitle: slide.title,
          existingSpeakerNotes: slide.speakerNotes,
          slide: authoritativeSlide,
          speechContent: authoritativeSpeaker,
          generationRunId,
          repairAttempted: false,
          model: actualModel,
          expectedUpdatedAt: initialUpdatedAt,
          existingExtractionMetadata: slide.extractionMetadata,
        });

        return {
          slide: authoritativeSlide,
          speechContent: authoritativeSpeaker,
          validation: firstValidation,
          repairAttempted: false,
          status: "accepted",
          generationRunId,
          snapshotState,
          model: actualModel,
        };
      }

      // Case 2: Validation failed -> Controlled Single-Attempt Speaker Repair
      const repairPromptData = PresentationPromptBuilder.buildSpeakerRepairPrompt({
        content: parsedResult.speakerContent,
        snapshot: snapshot!,
        validation: firstValidation,
        missingKeyPoints: keyPointsCoverage.missingPoints,
        language: lang,
      });

      let repairCompletionText: string;
      let repairActualModel: string;
      try {
        const repairCompletion = await this.deps.gateway.complete({
          promptVersion: repairPromptData.promptVersion,
          messages: [
            { role: "system", content: repairPromptData.systemPrompt },
            { role: "user", content: repairPromptData.userPrompt },
          ],
          jsonSchema: {
            properties: PRESENTATION_SPEAKER_CONTENT_SCHEMA.properties,
            required: PRESENTATION_SPEAKER_CONTENT_SCHEMA.required,
            type: "presentation_speaker_content",
          },
          correlationId: `${correlationId}-repair`,
          organizationId: project.organizationId,
          documentId: fallbackDocId,
          stage: "presentation_speech_repair",
        });
        repairCompletionText = repairCompletion.text;
        repairActualModel = repairCompletion.model;
      } catch {
        return this.handleRepairFailure({
          slideId,
          projectId,
          attemptedSlide: parsedResult.slide,
          attemptedSpeechContent: parsedResult.speakerContent,
          validation: firstValidation,
          generationRunId,
          snapshotState,
          model: actualModel,
          expectedUpdatedAt: initialUpdatedAt,
          existingExtractionMetadata: slide.extractionMetadata,
        });
      }

      if (repairActualModel !== PRESENTATION_CANONICAL_MODEL) {
        throw new DomainError(
          "service_unavailable",
          `Presentation Assistant repair aborted: unexpected model "${repairActualModel}" returned by AI Gateway. Required: "${PRESENTATION_CANONICAL_MODEL}".`,
        );
      }

      let repairedSpeakerResult: ReturnType<typeof this.parseModelOutput>;
      try {
        repairedSpeakerResult = this.parseModelOutput(repairCompletionText, {
          title: slide.title,
          defaultTitle: project.title,
        });
      } catch {
        return this.handleRepairFailure({
          slideId,
          projectId,
          attemptedSlide: parsedResult.slide,
          attemptedSpeechContent: parsedResult.speakerContent,
          validation: firstValidation,
          generationRunId,
          snapshotState,
          model: repairActualModel,
          expectedUpdatedAt: initialUpdatedAt,
          existingExtractionMetadata: slide.extractionMetadata,
        });
      }

      const repairValidation = await this.citationValidator.validateSpeakerContent({
        projectId,
        slideId,
        content: repairedSpeakerResult.speakerContent,
      });

      if (repairValidation.valid) {
        let authoritativeSpeaker = repairValidation.authoritativeContent ?? repairedSpeakerResult.speakerContent;
        authoritativeSpeaker = ensureKeyPointsInSpeech(authoritativeSpeaker, lang);

        const authoritativeSlide: GeneratedPresentationSlide = {
          ...repairedSpeakerResult.slide,
          citations: authoritativeSpeaker.citations,
        };

        await this.persistSlideSuccess({
          slideId,
          projectId,
          existingTitle: slide.title,
          existingSpeakerNotes: slide.speakerNotes,
          slide: authoritativeSlide,
          speechContent: authoritativeSpeaker,
          generationRunId,
          repairAttempted: true,
          model: repairActualModel,
          expectedUpdatedAt: initialUpdatedAt,
          existingExtractionMetadata: slide.extractionMetadata,
        });

        return {
          slide: authoritativeSlide,
          speechContent: authoritativeSpeaker,
          validation: repairValidation,
          repairAttempted: true,
          status: "accepted",
          generationRunId,
          snapshotState,
          model: repairActualModel,
        };
      }

      // Case 3: Repair also failed -> record needs_review
      return this.handleRepairFailure({
        slideId,
        projectId,
        attemptedSlide: repairedSpeakerResult.slide,
        attemptedSpeechContent: repairedSpeakerResult.speakerContent,
        validation: repairValidation,
        generationRunId,
        snapshotState,
        model: repairActualModel,
        expectedUpdatedAt: initialUpdatedAt,
        existingExtractionMetadata: slide.extractionMetadata,
      });
    }

    // Legacy slide format fallback flow
    const firstValidation = await this.citationValidator.validateFullGeneratedSlide({
      projectId,
      slideId,
      slide: parsedResult.slide,
    });

    if (firstValidation.valid) {
      const authoritativeSlide = firstValidation.authoritativeSlide ?? parsedResult.slide;

      await this.persistSlideSuccess({
        slideId,
        projectId,
        slide: authoritativeSlide,
        speechContent: parsedResult.speakerContent,
        generationRunId,
        repairAttempted: false,
        model: actualModel,
        expectedUpdatedAt: initialUpdatedAt,
        existingExtractionMetadata: slide.extractionMetadata,
      });

      return {
        slide: authoritativeSlide,
        speechContent: parsedResult.speakerContent,
        validation: firstValidation,
        repairAttempted: false,
        status: "accepted",
        generationRunId,
        snapshotState,
        model: actualModel,
      };
    }

    // Legacy repair attempt
    const repairPromptData = PresentationPromptBuilder.buildRepairPrompt({
      slide: parsedResult.slide,
      snapshot: snapshot!,
      validation: firstValidation,
      language: instructions?.language ?? "fa",
    });

    let repairCompletionText: string;
    let repairActualModel: string;
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
      repairActualModel = repairCompletion.model;
    } catch {
      return this.handleRepairFailure({
        slideId,
        projectId,
        attemptedSlide: parsedResult.slide,
        attemptedSpeechContent: parsedResult.speakerContent,
        validation: firstValidation,
        generationRunId,
        snapshotState,
        model: actualModel,
        expectedUpdatedAt: initialUpdatedAt,
        existingExtractionMetadata: slide.extractionMetadata,
      });
    }

    if (repairActualModel !== PRESENTATION_CANONICAL_MODEL) {
      throw new DomainError(
        "service_unavailable",
        `Presentation Assistant repair aborted: unexpected model "${repairActualModel}" returned by AI Gateway. Required: "${PRESENTATION_CANONICAL_MODEL}".`,
      );
    }

    let repairedSlide: GeneratedPresentationSlide;
    try {
      repairedSlide = validateGeneratedSlideSchema(repairCompletionText);
    } catch {
      return this.handleRepairFailure({
        slideId,
        projectId,
        attemptedSlide: parsedResult.slide,
        attemptedSpeechContent: parsedResult.speakerContent,
        validation: firstValidation,
        generationRunId,
        snapshotState,
        model: repairActualModel,
        expectedUpdatedAt: initialUpdatedAt,
        existingExtractionMetadata: slide.extractionMetadata,
      });
    }

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
        existingTitle: slide.title,
        existingSpeakerNotes: slide.speakerNotes,
        slide: authoritativeSlide,
        speechContent: parsedResult.speakerContent,
        generationRunId,
        repairAttempted: true,
        model: repairActualModel,
        expectedUpdatedAt: initialUpdatedAt,
        existingExtractionMetadata: slide.extractionMetadata,
      });

      return {
        slide: authoritativeSlide,
        speechContent: parsedResult.speakerContent,
        validation: repairValidation,
        repairAttempted: true,
        status: "accepted",
        generationRunId,
        snapshotState,
        model: repairActualModel,
      };
    }

    return this.handleRepairFailure({
      slideId,
      projectId,
      attemptedSlide: repairedSlide,
      attemptedSpeechContent: parsedResult.speakerContent,
      validation: repairValidation,
      generationRunId,
      snapshotState,
      model: repairActualModel,
      expectedUpdatedAt: initialUpdatedAt,
      existingExtractionMetadata: slide.extractionMetadata,
    });
  }

  // -------------------------------------------------------------------------
  // Private Helper Methods
  // -------------------------------------------------------------------------

  private parseModelOutput(
    rawText: string,
    slideContext: { title: string | null; defaultTitle: string },
  ): {
    isSpeakerFormat: boolean;
    speakerContent: PresentationSpeakerContent;
    slide: GeneratedPresentationSlide;
  } {
    let parsed: Record<string, unknown>;
    let sanitized = rawText.trim();
    if (sanitized.startsWith("```json")) sanitized = sanitized.slice(7);
    else if (sanitized.startsWith("```")) sanitized = sanitized.slice(3);
    if (sanitized.endsWith("```")) sanitized = sanitized.slice(0, -3);
    sanitized = sanitized.trim();

    try {
      parsed = JSON.parse(sanitized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DomainError("bad_request", `Failed to parse model output as JSON: ${msg}`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new DomainError("bad_request", "Model output must be a valid JSON object.");
    }

    if (typeof parsed.speechText === "string") {
      const speakerContent = validateSpeakerContentSchema(parsed);
      const title =
        typeof parsed.title === "string" && parsed.title.trim().length > 0
          ? parsed.title.trim()
          : slideContext.title || slideContext.defaultTitle;

      const slide: GeneratedPresentationSlide = {
        title,
        content: [
          {
            type: "text",
            content: speakerContent.speechText,
            claims: speakerContent.claims,
          },
          ...((speakerContent.keyPoints && speakerContent.keyPoints.length > 0)
            ? [
                {
                  type: "bullet_list" as const,
                  content: speakerContent.keyPoints.map((kp) => `• ${kp}`).join("\n"),
                  claims: [],
                },
              ]
            : []),
        ],
        speakerNotes: speakerContent.speechText,
        citations: speakerContent.citations,
      };

      return { isSpeakerFormat: true, speakerContent, slide };
    } else {
      const slide = validateGeneratedSlideSchema(parsed);
      const keyPoints = slide.content.flatMap((c) =>
        c.type === "bullet_list"
          ? c.content
              .split("\n")
              .map((s) => s.replace(/^[•\-\*]\s*/, "").trim())
              .filter(Boolean)
          : [],
      );
      const allClaims = slide.content.flatMap((c) => c.claims);

      const speakerContent: PresentationSpeakerContent = {
        speechText: formatSpeechText(
          slide.speakerNotes && slide.speakerNotes.trim().length > 0
            ? slide.speakerNotes
            : slide.content.map((c) => c.content).join("\n\n"),
        ),
        supplementaryExplanation: "",
        keyPoints: keyPoints.length > 0 ? keyPoints : [slide.title],
        examPoints: [],
        citations: slide.citations,
        claims: allClaims,
        suggestedDurationSeconds: 90,
      };

      return { isSpeakerFormat: false, speakerContent, slide };
    }
  }

  private async persistSlideSuccess(params: {
    slideId: PresentationSlideId;
    projectId: PresentationProjectId;
    existingTitle?: string | null;
    existingSpeakerNotes?: string | null;
    slide: GeneratedPresentationSlide;
    speechContent: PresentationSpeakerContent;
    generationRunId: string;
    repairAttempted: boolean;
    model: string;
    expectedUpdatedAt: string;
    existingExtractionMetadata?: Record<string, unknown>;
  }): Promise<PresentationSlideRecord> {
    const {
      slideId,
      projectId,
      existingTitle,
      existingSpeakerNotes,
      slide,
      speechContent,
      generationRunId,
      repairAttempted,
      model,
      expectedUpdatedAt,
      existingExtractionMetadata = {},
    } = params;

    const previousSpeechContent = existingExtractionMetadata.speechContent;

    // Invariant: Preserve original slide title and original PPTX speaker notes without AI distortion!
    const effectiveTitle =
      existingTitle && existingTitle.trim().length > 0
        ? existingTitle
        : slide.title;

    const effectiveSpeakerNotes =
      existingSpeakerNotes !== undefined && existingSpeakerNotes !== null
        ? existingSpeakerNotes
        : (slide.speakerNotes || null);

    return await this.deps.slideStore.updateSlide(slideId, projectId, {
      title: effectiveTitle,
      // Invariant: Do NOT overwrite rawText or original speakerNotes with generated speech!
      speakerNotes: effectiveSpeakerNotes,
      extractionMetadata: {
        ...existingExtractionMetadata,
        generationRunId,
        generationStatus: "accepted",
        generatedSlide: slide,
        speechContent,
        ...(previousSpeechContent ? { previousSpeechContent } : {}),
        repairAttempted,
        model,
        lastGeneratedAt: new Date().toISOString(),
      },
      expectedUpdatedAt,
    });
  }

  private async handleRepairFailure(params: {
    slideId: PresentationSlideId;
    projectId: PresentationProjectId;
    attemptedSlide: GeneratedPresentationSlide;
    attemptedSpeechContent?: PresentationSpeakerContent;
    validation: ServerCitationValidationResult;
    generationRunId: string;
    snapshotState: SlideGenerationResult["snapshotState"];
    model: string;
    expectedUpdatedAt: string;
    existingExtractionMetadata?: Record<string, unknown>;
  }): Promise<SlideGenerationResult> {
    const {
      slideId,
      projectId,
      attemptedSlide,
      attemptedSpeechContent,
      validation,
      generationRunId,
      snapshotState,
      model,
      expectedUpdatedAt,
      existingExtractionMetadata = {},
    } = params;

    // Invariant: Do NOT overwrite title, rawText, or speakerNotes of the existing slide.
    // Only update extractionMetadata to reflect needs_review and diagnostic report.
    await this.deps.slideStore.updateSlide(slideId, projectId, {
      extractionMetadata: {
        ...existingExtractionMetadata,
        generationStatus: "needs_review",
        lastFailedGeneration: {
          generationRunId,
          attemptedSlide,
          attemptedSpeechContent,
          failureStatus: validation.status,
          evaluatedCitations: validation.evaluatedCitations,
          model,
          failedAt: new Date().toISOString(),
        },
      },
      expectedUpdatedAt,
    });

    return {
      slide: attemptedSlide,
      speechContent: attemptedSpeechContent,
      validation,
      repairAttempted: true,
      status: "needs_review",
      generationRunId,
      snapshotState,
      model,
    };
  }
}
