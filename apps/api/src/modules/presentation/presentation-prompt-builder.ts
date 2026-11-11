/**
 * Presentation Slide Generation Prompt Builder.
 *
 * Implements Phase 2A-2.3c Generation Prompt Construction:
 * - Slide Context: title, initial text, educational goal, speaker notes.
 * - Approved Reference Context: snapshot chunks with authoritative metadata.
 * - Anti-Hallucination & Grounding Rules: strictly prevents ID fabrications and false citations.
 * - Bilingual Output: enforces language selection (Persian / English) while preserving medical/scientific precision.
 * - Controlled Repair Prompt Builder: generates focused repair instructions for single-attempt retry.
 */

import type {
  GeneratedPresentationSlide,
  PresentationAcademicLevel,
  PresentationElaborationDepth,
  PresentationGenerationInstructions,
  PresentationProjectRecord,
  PresentationSlideRecord,
  PresentationTone,
  ServerCitationValidationResult,
  SlideReferenceContextSnapshot,
  SnapshotReferenceChunk,
} from "@avana/domain";

export interface BuildSlidePromptInput {
  project: Pick<
    PresentationProjectRecord,
    "title" | "academicLevel" | "tone" | "elaborationDepth" | "targetDurationMinutes" | "totalSlides"
  >;
  slide: Pick<
    PresentationSlideRecord,
    "slideIndex" | "title" | "rawText" | "speakerNotes" | "visualSummary"
  >;
  snapshot: SlideReferenceContextSnapshot;
  instructions?: PresentationGenerationInstructions;
}

export interface GeneratedPromptResult {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
}

export const SLIDE_GENERATION_PROMPT_VERSION = "2026-11-presentation-v1";
export const SLIDE_REPAIR_PROMPT_VERSION = "2026-11-presentation-repair-v1";

export class PresentationPromptBuilder {
  /**
   * Builds the primary slide generation prompt for Gemini.
   */
  static buildSlidePrompt(input: BuildSlidePromptInput): GeneratedPromptResult {
    const { project, slide, snapshot, instructions } = input;

    const language = instructions?.language ?? "fa";
    const academicLevel: PresentationAcademicLevel =
      instructions?.academicLevel ?? project.academicLevel ?? "intermediate";
    const tone: PresentationTone =
      instructions?.tone ?? project.tone ?? "formal_scientific";
    const depth: PresentationElaborationDepth =
      instructions?.elaborationDepth ?? project.elaborationDepth ?? "balanced";

    const systemPrompt = PresentationPromptBuilder.buildSystemPrompt(language);

    const slideContextSection = PresentationPromptBuilder.formatSlideContext(slide);
    const referenceContextSection = PresentationPromptBuilder.formatReferenceContext(snapshot.chunks);
    const styleSection = PresentationPromptBuilder.formatStyleGuidelines({
      academicLevel,
      tone,
      depth,
      targetDurationMinutes: project.targetDurationMinutes,
      customInstructions: instructions?.customInstructions,
    });
    const citationRulesSection = PresentationPromptBuilder.formatCitationRules(snapshot.chunks.length === 0);

    const userPrompt = [
      `=== PRESENTATION PROJECT ===`,
      `Project Title: ${project.title}`,
      `Slide ${slide.slideIndex}${project.totalSlides ? ` of ${project.totalSlides}` : ""}`,
      ``,
      slideContextSection,
      ``,
      referenceContextSection,
      ``,
      styleSection,
      ``,
      citationRulesSection,
      ``,
      `=== OUTPUT INSTRUCTIONS ===`,
      `Generate the structured slide JSON adhering strictly to the JSON schema.`,
      language === "fa"
        ? `تمام متون، عنوان، ادعاها و یادداشت سخنران باید به زبان فارسی دقیق علمی نوشته شوند (اصطلاحات پزشکی و فنی انگلیسی می‌توانند در صورت نیاز در پرانتز آورده شوند).`
        : `All text, title, claims, and speaker notes must be in clear academic English.`,
    ].join("\n");

    return {
      systemPrompt,
      userPrompt,
      promptVersion: SLIDE_GENERATION_PROMPT_VERSION,
    };
  }

  /**
   * Builds a targeted prompt for Controlled Citation Repair (maximum 1 attempt).
   */
  static buildRepairPrompt(params: {
    slide: GeneratedPresentationSlide;
    snapshot: SlideReferenceContextSnapshot;
    validation: ServerCitationValidationResult;
    language?: string;
  }): GeneratedPromptResult {
    const { slide, snapshot, validation, language = "fa" } = params;

    const systemPrompt = [
      `You are the AVANA Presentation Citation Grounding Repair Specialist.`,
      `Your task is to fix citation integrity defects in a previously generated presentation slide.`,
      `You must strictly follow the provided Allowlist of Chunk IDs and Anti-Hallucination rules.`,
    ].join(" ");

    const allowlistChunkIds = snapshot.chunks.map((c) => c.chunkId);

    const failureDetails = validation.evaluatedCitations
      .filter((c) => c.status !== "valid")
      .map((c, i) => `${i + 1}. [Status: ${c.status}] ChunkId: "${c.chunkId || "NONE"}": ${c.detail}`)
      .join("\n");

    const userPrompt = [
      `=== CITATION VALIDATION DEFECTS DETECTED ===`,
      `The previous slide generation was rejected by the ServerCitationValidator due to the following defects:`,
      failureDetails || "Citation claims or citations array failed server validation.",
      ``,
      `=== STRICT ALLOWLIST OF VALID CHUNK IDS FOR THIS SLIDE ===`,
      allowlistChunkIds.length > 0
        ? allowlistChunkIds.map((id) => `- ${id}`).join("\n")
        : `(No external reference chunks exist for this slide. Citations list must be completely empty: []).`,
      ``,
      `=== APPROVED REFERENCE CHUNKS ===`,
      PresentationPromptBuilder.formatReferenceContext(snapshot.chunks),
      ``,
      `=== PREVIOUS GENERATION TO REPAIR ===`,
      JSON.stringify(slide, null, 2),
      ``,
      `=== REPAIR RULES ===`,
      `1. DO NOT invent or fabricate any new chunkId or referenceId. Only IDs in the Allowlist above are permitted.`,
      `2. For each claim with an invalid or unverified citation:`,
      `   a) If the claim is genuinely supported by one of the Allowed Chunk IDs above, change its chunkIds to that exact ID and set evidenceStatus="supported".`,
      `   b) If the claim is NOT directly supported by the allowed chunks, or if there is insufficient evidence, change evidenceStatus="insufficient_evidence" and set chunkIds=[].`,
      `3. DO NOT silently delete claims. Preserve the pedagogical explanations and educational structure.`,
      `4. In the top-level "citations" array, include ONLY chunk IDs that are actually referenced by supported claims. Remove any unused or extra citations.`,
      `5. Return the corrected complete GeneratedPresentationSlide JSON.`,
      language === "fa"
        ? `زبان اسلاید باید به زبان فارسی علمی و روان حفظ شود.`
        : `Slide language must remain in professional academic English.`,
    ].join("\n");

    return {
      systemPrompt,
      userPrompt,
      promptVersion: SLIDE_REPAIR_PROMPT_VERSION,
    };
  }

  // -------------------------------------------------------------------------
  // Private Formatting Helpers
  // -------------------------------------------------------------------------

  private static buildSystemPrompt(language: string): string {
    const isFa = language === "fa";
    return [
      `You are the AVANA Scientific Presentation Assistant, an expert medical and academic slide authoring engine.`,
      `Your purpose is to synthesize structured, high-yield presentation slides strictly grounded in verified reference materials.`,
      isFa
        ? `شما باید اسلایدهای آموزشی، مستند، دقیق و استاندارد تولید کنید که فقط بر اساس شواهد موجود در منابع ارائه‌شده نگارش شوند.`
        : `You generate authoritative, scientifically grounded presentation slides strictly anchored to approved references.`,
      `Output must always conform to the structured JSON schema.`,
    ].join(" ");
  }

  private static formatSlideContext(
    slide: Pick<PresentationSlideRecord, "slideIndex" | "title" | "rawText" | "speakerNotes" | "visualSummary">,
  ): string {
    const lines = [
      `=== SLIDE CONTEXT ===`,
      `Slide Index: ${slide.slideIndex}`,
      `Slide Title: ${slide.title ?? "(To be determined by model)"}`,
    ];

    if (slide.rawText && slide.rawText.trim().length > 0) {
      lines.push(`Existing / Draft Text:\n${slide.rawText.trim()}`);
    }

    if (slide.speakerNotes && slide.speakerNotes.trim().length > 0) {
      lines.push(`Speaker Notes Intent:\n${slide.speakerNotes.trim()}`);
    }

    if (slide.visualSummary && slide.visualSummary.trim().length > 0) {
      lines.push(`Visual Summary / Media Intent: ${slide.visualSummary.trim()}`);
    }

    return lines.join("\n");
  }

  private static formatReferenceContext(chunks: SnapshotReferenceChunk[]): string {
    if (chunks.length === 0) {
      return [
        `=== APPROVED REFERENCE CONTEXT ===`,
        `[NO EXTERNAL REFERENCE CHUNKS SELECTED FOR THIS SLIDE]`,
        `This slide serves as an introduction, overview, structural agenda, or pedagogical conclusion.`,
        `Do not cite any external sources. Citations array must be empty [].`,
      ].join("\n");
    }

    const lines = [
      `=== APPROVED REFERENCE CONTEXT (HISTORICAL SNAPSHOT) ===`,
      `The following ${chunks.length} reference chunks have been authoritatively selected for this slide:`,
      ``,
    ];

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const pageInfo =
        c.sourceLocation.startPage !== null
          ? `Pages ${c.sourceLocation.startPage}${c.sourceLocation.endPage && c.sourceLocation.endPage !== c.sourceLocation.startPage ? `-${c.sourceLocation.endPage}` : ""} (Confidence: ${c.sourceLocation.confidence})`
          : `Unpaged / Direct source (Confidence: ${c.sourceLocation.confidence})`;

      lines.push(`--- REFERENCE CHUNK [${i + 1}] ---`);
      lines.push(`Chunk ID: ${c.chunkId}`);
      lines.push(`Reference ID: ${c.referenceId}`);
      lines.push(`Citation Label: ${c.citationLabel}`);
      lines.push(`Source Title: ${c.sourceTitle}`);
      lines.push(`Location: ${pageInfo}`);
      lines.push(`Content:`);
      lines.push(c.content.trim());
      lines.push(``);
    }

    return lines.join("\n");
  }

  private static formatStyleGuidelines(params: {
    academicLevel: PresentationAcademicLevel;
    tone: PresentationTone;
    depth: PresentationElaborationDepth;
    targetDurationMinutes: number;
    customInstructions?: string;
  }): string {
    const lines = [
      `=== PRESENTATION STYLE GUIDELINES ===`,
      `Academic Level: ${params.academicLevel}`,
      `Tone: ${params.tone}`,
      `Elaboration Depth: ${params.depth}`,
      `Target Slide Duration: ~${Math.max(1, Math.round(params.targetDurationMinutes / 10))} minutes delivery per slide`,
    ];

    if (params.customInstructions && params.customInstructions.trim().length > 0) {
      lines.push(`Custom Instructions:\n${params.customInstructions.trim()}`);
    }

    return lines.join("\n");
  }

  private static formatCitationRules(isEmptySnapshot: boolean): string {
    if (isEmptySnapshot) {
      return [
        `=== STRICT CITATION & GROUNDING RULES (EMPTY SNAPSHOT) ===`,
        `1. This slide has NO external reference snapshot.`,
        `2. You MUST set citations: [] (empty array).`,
        `3. All claims in content items must either have chunkIds: [] and evidenceStatus="insufficient_evidence", or provide conceptual structural framing without scientific fact assertion.`,
        `4. NEVER invent or hallucinate chunk IDs or reference IDs.`,
      ].join("\n");
    }

    return [
      `=== STRICT CITATION & GROUNDING RULES ===`,
      `1. SOLE SOURCE OF TRUTH: Base all factual, scientific, and empirical statements strictly on the Approved Reference Context above.`,
      `2. ZERO EXTERNAL CITATIONS: Never cite sources from model pre-training, general memory, or external web.`,
      `3. CHUNK ID INTEGRITY: Every chunkId referenced in claims or citations MUST exist in the Approved Reference Context above. Never fabricate or invent IDs.`,
      `4. EVIDENCE STATUS:`,
      `   - If a claim is directly supported by a reference chunk, set evidenceStatus="supported" and provide the exact chunkId(s) in chunkIds.`,
      `   - If information is supplementary, pedagogical explanation, or lacks direct textual evidence in the provided chunks, you MUST set evidenceStatus="insufficient_evidence" and chunkIds=[].`,
      `5. NO UNUSED CITATIONS: Every chunkId listed in the top-level "citations" array MUST be referenced by at least one supported claim in the content. Do not include extra or decorative citations.`,
      `6. SPEAKER NOTES: Provide insightful, professional narration notes for the presenter elaborating on the slide points and clinical/academic implications.`,
    ].join("\n");
  }
}
