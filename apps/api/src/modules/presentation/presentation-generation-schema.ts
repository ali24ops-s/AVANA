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
  GENERATED_SLIDE_CONTENT_TYPES,
  EVIDENCE_STATUSES,
  DomainError,
} from "@avana/domain";

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
