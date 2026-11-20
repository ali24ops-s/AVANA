/**
 * Presentation Slide Generation Structured Schema & Validation.
 *
 * Implements Phase 2A-2.3c Structured Generation Output:
 * - OpenAPI / Gemini responseSchema specification for GeneratedPresentationSlide.
 * - Server-side runtime schema parsing and validation.
 * - Extracts and consolidates citation references across claims and top-level citations.
 */

import {
  type GeneratedPresentationSlide,
  type GeneratedSlideClaim,
  type GeneratedSlideContentItem,
  type GeneratedSlideContentType,
  type PresentationSpeakerContent,
  type PresentationSpeakerClaim,
  type PresentationSpeakerClinicalExample,
  GENERATED_SLIDE_CONTENT_TYPES,
  EVIDENCE_STATUSES,
  DomainError,
  formatSpeechText,
} from "@avana/domain";

export const PRESENTATION_SPEAKER_CONTENT_SCHEMA = {
  type: "object",
  properties: {
    speechText: {
      type: "string",
      description:
        "Complete, fluent, spoken Persian presentation text for this slide. Natural, conversational yet authoritative. Must be organized into 2 to 4 coherent, distinct paragraphs separated by blank lines (\\n\\n) reflecting natural semantic transitions between introduction/context, core scientific mechanisms/findings, and clinical relevance or wrap-up.",
    },
    supplementaryExplanation: {
      type: "string",
      description: "Deeper scientific explanation elaborating on mechanism, rationale, or context beyond the slide bullet points.",
    },
    keyPoints: {
      type: "array",
      items: { type: "string" },
      description: "3-5 crucial takeaway points that the speaker must emphasize.",
    },
    examPoints: {
      type: "array",
      items: { type: "string" },
      description: "High-yield board/residency exam pearls or testable facts relevant to this slide. Empty array if not applicable.",
    },
    clinicalExample: {
      type: "object",
      properties: {
        scenario: { type: "string" },
        connectionToSlide: { type: "string" },
      },
      required: ["scenario", "connectionToSlide"],
      description: "Real-world clinical case scenario or practical example illustrating the concept. Omit or null if purely theoretical.",
    },
    suggestedDurationSeconds: {
      type: "integer",
      description: "Estimated delivery duration in seconds (typically 60-180 seconds).",
    },
    transitionSentence: {
      type: "string",
      description: "Smooth verbal bridge linking this slide to the next topic or wrapping up.",
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chunkId: { type: "string" },
          referenceId: { type: "string" },
        },
        required: ["chunkId"],
      },
      description: "List of chunk references cited in this speech.",
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          chunkIds: {
            type: "array",
            items: { type: "string" },
          },
          evidenceStatus: {
            type: "string",
            enum: ["supported", "insufficient_evidence"],
          },
        },
        required: ["text", "chunkIds", "evidenceStatus"],
      },
      description: "Granular scientific claims made in speechText with their source chunk grounding.",
    },
    insufficientEvidenceNotes: {
      type: "string",
      description: "Honest disclosure if any slide points lacked backing evidence in the uploaded references.",
    },
  },
  required: [
    "speechText",
    "supplementaryExplanation",
    "keyPoints",
    "examPoints",
    "suggestedDurationSeconds",
    "citations",
    "claims",
  ],
} as const;

export const GENERATED_PRESENTATION_SLIDE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    content: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["text", "bullet_list", "table"],
          },
          content: { type: "string" },
          claims: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                chunkIds: {
                  type: "array",
                  items: { type: "string" },
                },
                evidenceStatus: {
                  type: "string",
                  enum: ["supported", "insufficient_evidence"],
                },
              },
              required: ["text", "chunkIds", "evidenceStatus"],
            },
          },
        },
        required: ["type", "content", "claims"],
      },
    },
    speakerNotes: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chunkId: { type: "string" },
          referenceId: { type: "string" },
        },
        required: ["chunkId"],
      },
    },
  },
  required: ["title", "content", "speakerNotes", "citations"],
} as const;

/**
 * Validates raw model output against the GeneratedPresentationSlide schema.
 * Throws DomainError("bad_request", ...) on structural defects or schema violations.
 */
export function validateGeneratedSlideSchema(
  raw: unknown,
): GeneratedPresentationSlide {
  let parsed: unknown = raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new DomainError("bad_request", "Model returned an empty response string.");
    }

    // Strip markdown code fences if model enclosed JSON
    let sanitized = trimmed;
    if (sanitized.startsWith("```json")) {
      sanitized = sanitized.slice(7);
    } else if (sanitized.startsWith("```")) {
      sanitized = sanitized.slice(3);
    }
    if (sanitized.endsWith("```")) {
      sanitized = sanitized.slice(0, -3);
    }
    sanitized = sanitized.trim();

    try {
      parsed = JSON.parse(sanitized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DomainError(
        "bad_request",
        `Failed to parse model output as JSON: ${msg}`,
      );
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DomainError(
      "bad_request",
      "Model output must be a valid JSON object matching GeneratedPresentationSlide.",
    );
  }

  const obj = parsed as Record<string, unknown>;

  // Title validation
  if (typeof obj.title !== "string" || obj.title.trim().length === 0) {
    throw new DomainError("bad_request", "Generated slide must have a non-empty 'title' string.");
  }
  const title = obj.title.trim();

  // Subtitle validation (optional)
  let subtitle: string | undefined;
  if (typeof obj.subtitle === "string" && obj.subtitle.trim().length > 0) {
    subtitle = obj.subtitle.trim();
  }

  // Content validation
  if (!Array.isArray(obj.content) || obj.content.length === 0) {
    throw new DomainError(
      "bad_request",
      "Generated slide 'content' must be a non-empty array of content items.",
    );
  }

  const validatedContent: GeneratedSlideContentItem[] = [];

  for (let i = 0; i < obj.content.length; i++) {
    const item = obj.content[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") {
      throw new DomainError(
        "bad_request",
        `Slide content item at index ${i} is not a valid object.`,
      );
    }

    const itemType = item.type as GeneratedSlideContentType;
    if (!GENERATED_SLIDE_CONTENT_TYPES.includes(itemType)) {
      throw new DomainError(
        "bad_request",
        `Invalid content item type "${String(item.type)}" at index ${i}. Expected one of: ${GENERATED_SLIDE_CONTENT_TYPES.join(", ")}.`,
      );
    }

    if (typeof item.content !== "string") {
      throw new DomainError(
        "bad_request",
        `Content item at index ${i} must have a 'content' string.`,
      );
    }

    if (!Array.isArray(item.claims)) {
      throw new DomainError(
        "bad_request",
        `Content item at index ${i} must have a 'claims' array.`,
      );
    }

    const validatedClaims: GeneratedSlideClaim[] = [];
    for (let c = 0; c < item.claims.length; c++) {
      const claim = item.claims[c] as Record<string, unknown>;
      if (!claim || typeof claim !== "object") {
        throw new DomainError(
          "bad_request",
          `Claim at index [${i}][${c}] is not a valid object.`,
        );
      }

      if (typeof claim.text !== "string" || claim.text.trim().length === 0) {
        throw new DomainError(
          "bad_request",
          `Claim at index [${i}][${c}] has empty or missing 'text'.`,
        );
      }

      const evidenceStatus = claim.evidenceStatus as GeneratedSlideClaim["evidenceStatus"];
      if (!EVIDENCE_STATUSES.includes(evidenceStatus)) {
        throw new DomainError(
          "bad_request",
          `Invalid evidenceStatus "${String(claim.evidenceStatus)}" at claim [${i}][${c}]. Expected one of: ${EVIDENCE_STATUSES.join(", ")}.`,
        );
      }

      if (!Array.isArray(claim.chunkIds)) {
        throw new DomainError(
          "bad_request",
          `Claim at index [${i}][${c}] must have a 'chunkIds' array.`,
        );
      }

      const chunkIds = claim.chunkIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0);

      validatedClaims.push({
        text: claim.text.trim(),
        chunkIds,
        evidenceStatus,
      });
    }

    validatedContent.push({
      type: itemType,
      content: item.content,
      claims: validatedClaims,
    });
  }

  // Speaker notes
  if (typeof obj.speakerNotes !== "string") {
    throw new DomainError(
      "bad_request",
      "Generated slide must have a 'speakerNotes' string (can be empty string).",
    );
  }
  const speakerNotes = obj.speakerNotes;

  // Citations array
  if (!Array.isArray(obj.citations)) {
    throw new DomainError(
      "bad_request",
      "Generated slide must have a 'citations' array.",
    );
  }

  const validatedCitations: GeneratedPresentationSlide["citations"] = [];
  for (let k = 0; k < obj.citations.length; k++) {
    const cit = obj.citations[k] as Record<string, unknown>;
    if (!cit || typeof cit !== "object" || typeof cit.chunkId !== "string" || cit.chunkId.trim().length === 0) {
      throw new DomainError(
        "bad_request",
        `Citation entry at index ${k} is missing a valid 'chunkId' string.`,
      );
    }

    const chunkId = cit.chunkId.trim();
    const referenceId = typeof cit.referenceId === "string" && cit.referenceId.trim().length > 0
      ? cit.referenceId.trim()
      : undefined;

    validatedCitations.push({
      chunkId,
      referenceId,
    });
  }

  return {
    title,
    subtitle,
    content: validatedContent,
    speakerNotes,
    citations: validatedCitations,
  };
}

/**
 * Extracts and consolidates all chunkIds referenced across claims and slide citations.
 */
export function extractAllSlideChunkIds(slide: GeneratedPresentationSlide): {
  claimChunkIds: string[];
  citationChunkIds: string[];
  allUniqueChunkIds: string[];
} {
  const claimChunkIds: string[] = [];
  for (const item of slide.content) {
    for (const claim of item.claims) {
      for (const cid of claim.chunkIds) {
        claimChunkIds.push(cid);
      }
    }
  }

  const citationChunkIds = slide.citations.map((c) => c.chunkId);
  const allUniqueChunkIds = Array.from(new Set([...claimChunkIds, ...citationChunkIds]));

  return {
    claimChunkIds,
    citationChunkIds,
    allUniqueChunkIds,
  };
}

/**
 * Validates raw model output against the PresentationSpeakerContent schema.
 * Throws DomainError("bad_request", ...) on structural defects or schema violations.
 */
export function validateSpeakerContentSchema(
  raw: unknown,
): PresentationSpeakerContent {
  let parsed: unknown = raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new DomainError("bad_request", "Model returned an empty response string.");
    }

    let sanitized = trimmed;
    if (sanitized.startsWith("```json")) {
      sanitized = sanitized.slice(7);
    } else if (sanitized.startsWith("```")) {
      sanitized = sanitized.slice(3);
    }
    if (sanitized.endsWith("```")) {
      sanitized = sanitized.slice(0, -3);
    }
    sanitized = sanitized.trim();

    try {
      parsed = JSON.parse(sanitized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new DomainError(
        "bad_request",
        `Failed to parse model output as JSON: ${msg}`,
      );
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DomainError(
      "bad_request",
      "Model output must be a valid JSON object matching PresentationSpeakerContent.",
    );
  }

  const obj = parsed as Record<string, unknown>;

  // speechText validation
  if (typeof obj.speechText !== "string" || obj.speechText.trim().length === 0) {
    throw new DomainError(
      "bad_request",
      "Speaker content must have a non-empty 'speechText' string.",
    );
  }
  const speechText = formatSpeechText(obj.speechText);

  // supplementaryExplanation
  const supplementaryExplanation =
    typeof obj.supplementaryExplanation === "string"
      ? obj.supplementaryExplanation.trim()
      : "";

  // keyPoints validation
  if (!Array.isArray(obj.keyPoints)) {
    throw new DomainError(
      "bad_request",
      "Speaker content must have a 'keyPoints' array.",
    );
  }
  const keyPoints: string[] = [];
  for (const kp of obj.keyPoints) {
    if (typeof kp === "string" && kp.trim().length > 0) {
      keyPoints.push(kp.trim());
    }
  }

  // examPoints validation
  const examPoints: string[] = [];
  if (Array.isArray(obj.examPoints)) {
    for (const ep of obj.examPoints) {
      if (typeof ep === "string" && ep.trim().length > 0) {
        examPoints.push(ep.trim());
      }
    }
  }

  // clinicalExample validation
  let clinicalExample: PresentationSpeakerClinicalExample | undefined;
  if (
    obj.clinicalExample &&
    typeof obj.clinicalExample === "object" &&
    !Array.isArray(obj.clinicalExample)
  ) {
    const ce = obj.clinicalExample as Record<string, unknown>;
    if (
      typeof ce.scenario === "string" &&
      ce.scenario.trim().length > 0 &&
      typeof ce.connectionToSlide === "string" &&
      ce.connectionToSlide.trim().length > 0
    ) {
      clinicalExample = {
        scenario: ce.scenario.trim(),
        connectionToSlide: ce.connectionToSlide.trim(),
      };
    }
  }

  // suggestedDurationSeconds
  let suggestedDurationSeconds = 90;
  if (typeof obj.suggestedDurationSeconds === "number" && !isNaN(obj.suggestedDurationSeconds)) {
    suggestedDurationSeconds = Math.max(10, Math.round(obj.suggestedDurationSeconds));
  }

  // transitionSentence
  let transitionSentence: string | undefined;
  if (typeof obj.transitionSentence === "string" && obj.transitionSentence.trim().length > 0) {
    transitionSentence = obj.transitionSentence.trim();
  }

  // citations array
  if (!Array.isArray(obj.citations)) {
    throw new DomainError(
      "bad_request",
      "Speaker content must have a 'citations' array.",
    );
  }
  const validatedCitations: PresentationSpeakerContent["citations"] = [];
  for (let k = 0; k < obj.citations.length; k++) {
    const cit = obj.citations[k] as Record<string, unknown>;
    if (!cit || typeof cit !== "object" || typeof cit.chunkId !== "string" || cit.chunkId.trim().length === 0) {
      throw new DomainError(
        "bad_request",
        `Citation entry at index ${k} is missing a valid 'chunkId' string.`,
      );
    }
    const chunkId = cit.chunkId.trim();
    const referenceId =
      typeof cit.referenceId === "string" && cit.referenceId.trim().length > 0
        ? cit.referenceId.trim()
        : undefined;

    validatedCitations.push({
      chunkId,
      referenceId,
    });
  }

  // claims array
  if (!Array.isArray(obj.claims)) {
    throw new DomainError(
      "bad_request",
      "Speaker content must have a 'claims' array.",
    );
  }
  const validatedClaims: PresentationSpeakerClaim[] = [];
  for (let c = 0; c < obj.claims.length; c++) {
    const claim = obj.claims[c] as Record<string, unknown>;
    if (!claim || typeof claim !== "object") {
      throw new DomainError(
        "bad_request",
        `Claim at index [${c}] is not a valid object.`,
      );
    }

    if (typeof claim.text !== "string" || claim.text.trim().length === 0) {
      throw new DomainError(
        "bad_request",
        `Claim at index [${c}] has empty or missing 'text'.`,
      );
    }

    const evidenceStatus = claim.evidenceStatus as PresentationSpeakerClaim["evidenceStatus"];
    if (!EVIDENCE_STATUSES.includes(evidenceStatus)) {
      throw new DomainError(
        "bad_request",
        `Invalid evidenceStatus "${String(claim.evidenceStatus)}" at claim [${c}]. Expected one of: ${EVIDENCE_STATUSES.join(", ")}.`,
      );
    }

    if (!Array.isArray(claim.chunkIds)) {
      throw new DomainError(
        "bad_request",
        `Claim at index [${c}] must have a 'chunkIds' array.`,
      );
    }

    const chunkIds = claim.chunkIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id.length > 0);

    validatedClaims.push({
      text: claim.text.trim(),
      chunkIds,
      evidenceStatus,
    });
  }

  // insufficientEvidenceNotes
  let insufficientEvidenceNotes: string | undefined;
  if (
    typeof obj.insufficientEvidenceNotes === "string" &&
    obj.insufficientEvidenceNotes.trim().length > 0
  ) {
    insufficientEvidenceNotes = obj.insufficientEvidenceNotes.trim();
  }

  return {
    speechText,
    supplementaryExplanation,
    keyPoints,
    examPoints,
    clinicalExample,
    citations: validatedCitations,
    claims: validatedClaims,
    suggestedDurationSeconds,
    transitionSentence,
    insufficientEvidenceNotes,
  };
}

/**
 * Extracts and consolidates all chunkIds referenced across claims and speech citations.
 */
export function extractAllSpeakerChunkIds(content: PresentationSpeakerContent): {
  claimChunkIds: string[];
  citationChunkIds: string[];
  allUniqueChunkIds: string[];
} {
  const claimChunkIds: string[] = [];
  for (const claim of content.claims) {
    for (const cid of claim.chunkIds) {
      claimChunkIds.push(cid);
    }
  }

  const citationChunkIds = content.citations.map((c) => c.chunkId);
  const allUniqueChunkIds = Array.from(new Set([...claimChunkIds, ...citationChunkIds]));

  return {
    claimChunkIds,
    citationChunkIds,
    allUniqueChunkIds,
  };
}

