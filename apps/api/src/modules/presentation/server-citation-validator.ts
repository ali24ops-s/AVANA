import { createHash } from "node:crypto";
import {
  type CitationClaimInput,
  type CitationValidationStatus,
  type GeneratedPresentationSlide,
  type PresentationProjectId,
  type PresentationSlideId,
  type ServerCitationValidationResult,
  type SingleCitationValidationResult,
  type SlideReferenceContextSnapshot,
  type SnapshotReferenceChunk,
  type SnapshotState,
  DomainError,
  SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION,
} from "@avana/domain";
import type {
  PresentationProjectStore,
  PresentationReferenceStore,
  PresentationSlideStore,
} from "./presentation-store.js";

export interface ServerCitationValidatorDeps {
  slideStore: PresentationSlideStore;
  projectStore?: PresentationProjectStore;
  referenceStore?: PresentationReferenceStore;
}

export class ServerCitationValidator {
  constructor(private readonly deps: ServerCitationValidatorDeps) {}

  /**
   * Validate citation claims against the slide's historical reference context snapshot
   * and project integrity boundaries.
   *
   * Guarantees:
   * 1. Slide Context Validation: chunkId must exist in the slide's recorded snapshot.
   * 2. Project Integrity Validation: referenceId and projectId must align with snapshot.
   * 3. Snapshot Cryptographic Integrity: chunk contentHash must match SHA-256 of preserved content.
   * 4. Historical Reproducibility: validation does NOT fail merely because a reference was subsequently deleted or updated.
   */
  async validateSlideCitations(params: {
    projectId: PresentationProjectId;
    slideId: PresentationSlideId;
    claims: CitationClaimInput[];
  }): Promise<ServerCitationValidationResult> {
    const { projectId, slideId, claims } = params;

    // 1. Fetch slide
    const slide = await this.deps.slideStore.findById(slideId, projectId);
    if (!slide) {
      throw new DomainError("not_found", "Presentation slide not found");
    }

    if (!Array.isArray(claims) || claims.length === 0) {
      return {
        valid: true,
        status: "valid",
        slideIndex: slide.slideIndex,
        projectId,
        evaluatedCitations: [],
        validCount: 0,
        invalidCount: 0,
      };
    }

    // 2. Fetch snapshot
    const snapshot = await this.deps.slideStore.getReferenceSnapshot(
      slideId,
      projectId,
    );

    if (!snapshot || !Array.isArray(snapshot.chunks)) {
      const evaluated: SingleCitationValidationResult[] = claims.map((c) => ({
        chunkId: c?.chunkId ?? "",
        status: "unknown_snapshot",
        detail: "Slide has no recorded reference context snapshot.",
      }));
      return {
        valid: false,
        status: "unknown_snapshot",
        slideIndex: slide.slideIndex,
        projectId,
        evaluatedCitations: evaluated,
        validCount: 0,
        invalidCount: claims.length,
      };
    }

    // 3. Project boundary validation on snapshot
    if (snapshot.projectId !== projectId) {
      const evaluated: SingleCitationValidationResult[] = claims.map((c) => ({
        chunkId: c?.chunkId ?? "",
        status: "project_mismatch",
        detail: `Snapshot project ID (${snapshot.projectId}) does not match expected project ID (${projectId}).`,
      }));
      return {
        valid: false,
        status: "project_mismatch",
        slideIndex: slide.slideIndex,
        projectId,
        evaluatedCitations: evaluated,
        validCount: 0,
        invalidCount: claims.length,
      };
    }

    // 4. Slide index alignment check
    if (snapshot.slideIndex !== slide.slideIndex) {
      const evaluated: SingleCitationValidationResult[] = claims.map((c) => ({
        chunkId: c?.chunkId ?? "",
        status: "snapshot_integrity_failure",
        detail: `Snapshot slide index (${snapshot.slideIndex}) does not match slide index (${slide.slideIndex}).`,
      }));
      return {
        valid: false,
        status: "snapshot_integrity_failure",
        slideIndex: slide.slideIndex,
        projectId,
        evaluatedCitations: evaluated,
        validCount: 0,
        invalidCount: claims.length,
      };
    }

    // 5. Schema version validation
    if (snapshot.schemaVersion !== SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION) {
      const evaluated: SingleCitationValidationResult[] = claims.map((c) => ({
        chunkId: c?.chunkId ?? "",
        status: "snapshot_integrity_failure",
        detail: `Unsupported snapshot schemaVersion "${snapshot.schemaVersion}". Expected "${SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION}".`,
      }));
      return {
        valid: false,
        status: "snapshot_integrity_failure",
        slideIndex: slide.slideIndex,
        projectId,
        evaluatedCitations: evaluated,
        validCount: 0,
        invalidCount: claims.length,
      };
    }

    // 6. Cryptographic contentHash integrity check
    for (const chunk of snapshot.chunks) {
      if (!chunk.contentHash || typeof chunk.content !== "string") {
        const evaluated: SingleCitationValidationResult[] = claims.map((c) => ({
          chunkId: c?.chunkId ?? "",
          status: "snapshot_integrity_failure",
          detail: "Snapshot contains corrupted chunk records without content or hash.",
        }));
        return {
          valid: false,
          status: "snapshot_integrity_failure",
          slideIndex: slide.slideIndex,
          projectId,
          evaluatedCitations: evaluated,
          validCount: 0,
          invalidCount: claims.length,
        };
      }

      const computedHash = createHash("sha256")
        .update(chunk.content, "utf8")
        .digest("hex");

      if (computedHash !== chunk.contentHash) {
        const evaluated: SingleCitationValidationResult[] = claims.map((c) => ({
          chunkId: c?.chunkId ?? "",
          status: "snapshot_integrity_failure",
          detail: `Cryptographic integrity failure: chunk ${chunk.chunkId} content hash does not match computed SHA-256.`,
        }));
        return {
          valid: false,
          status: "snapshot_integrity_failure",
          slideIndex: slide.slideIndex,
          projectId,
          evaluatedCitations: evaluated,
          validCount: 0,
          invalidCount: claims.length,
        };
      }
    }

    // Map snapshot chunks by chunkId for O(1) lookup
    const chunksById = new Map<string, SnapshotReferenceChunk>();
    for (const sc of snapshot.chunks) {
      chunksById.set(sc.chunkId, sc);
    }

    // 7. Evaluate each citation claim
    const evaluatedCitations: SingleCitationValidationResult[] = [];

    for (const claim of claims) {
      // Check malformed citation
      if (
        !claim ||
        typeof claim !== "object" ||
        typeof claim.chunkId !== "string" ||
        claim.chunkId.trim().length === 0
      ) {
        evaluatedCitations.push({
          chunkId: claim?.chunkId ?? "",
          status: "malformed_citation",
          detail: "Citation claim has empty or missing chunkId.",
        });
        continue;
      }

      const trimmedChunkId = claim.chunkId.trim();

      // Check chunkId format (valid characters: alphanumeric, colons, hyphens, underscores)
      if (!/^[a-zA-Z0-9_\-:]+$/.test(trimmedChunkId) || trimmedChunkId.length < 5) {
        evaluatedCitations.push({
          chunkId: trimmedChunkId,
          status: "invalid_chunk_id",
          detail: `Chunk ID "${trimmedChunkId}" has an invalid syntactic format.`,
        });
        continue;
      }

      // Check presence in slide context snapshot
      const matched = chunksById.get(trimmedChunkId);
      if (!matched) {
        evaluatedCitations.push({
          chunkId: trimmedChunkId,
          status: "chunk_not_in_slide_context",
          detail: `Chunk "${trimmedChunkId}" was not selected in this slide's reference context snapshot.`,
        });
        continue;
      }

      // Check reference ID alignment if provided
      if (claim.referenceId) {
        const trimmedRefId = claim.referenceId.trim();
        if (trimmedRefId !== matched.referenceId) {
          evaluatedCitations.push({
            chunkId: trimmedChunkId,
            status: "reference_mismatch",
            detail: `Claimed referenceId "${trimmedRefId}" does not match snapshot referenceId "${matched.referenceId}".`,
            matchedChunk: matched,
          });
          continue;
        }
      }

      // Citation is valid!
      evaluatedCitations.push({
        chunkId: trimmedChunkId,
        status: "valid",
        detail: `Verified against slide reference snapshot. Source: "${matched.sourceTitle}" (${matched.citationLabel}).`,
        matchedChunk: matched,
      });
    }

    const validCount = evaluatedCitations.filter((c) => c.status === "valid").length;
    const invalidCount = evaluatedCitations.length - validCount;
    const firstInvalid = evaluatedCitations.find((c) => c.status !== "valid");

    return {
      valid: invalidCount === 0 && evaluatedCitations.length > 0,
      status: firstInvalid ? firstInvalid.status : "valid",
      slideIndex: slide.slideIndex,
      projectId,
      evaluatedCitations,
      validCount,
      invalidCount,
    };
  }

  /**
   * Authoritatively evaluate the 4-state snapshot integrity boundary:
   * - "valid_with_references": Valid snapshot schema & checksums, has chunks > 0.
   * - "valid_empty": Valid snapshot schema, explicitly 0 chunks (e.g. title / conclusion slide).
   * - "missing_snapshot": Slide has no snapshot recorded at all.
   * - "corrupted_snapshot": Corrupted schema, missing mandatory fields, or SHA-256 hash tampering.
   */
  static evaluateSnapshotState(
    snapshot: SlideReferenceContextSnapshot | null,
  ): { state: SnapshotState; error?: string } {
    if (!snapshot) {
      return {
        state: "missing_snapshot",
        error: "Slide has no recorded reference context snapshot.",
      };
    }

    if (
      typeof snapshot !== "object" ||
      snapshot.schemaVersion !== SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION ||
      !Array.isArray(snapshot.chunks) ||
      !snapshot.projectId ||
      typeof snapshot.slideIndex !== "number"
    ) {
      return {
        state: "corrupted_snapshot",
        error: `Snapshot schema validation failure: expected version ${SLIDE_REFERENCE_SNAPSHOT_SCHEMA_VERSION}.`,
      };
    }

    // Cryptographic contentHash integrity check
    for (const chunk of snapshot.chunks) {
      if (
        !chunk ||
        typeof chunk.chunkId !== "string" ||
        typeof chunk.content !== "string" ||
        !chunk.contentHash
      ) {
        return {
          state: "corrupted_snapshot",
          error: "Snapshot contains corrupted chunk records missing content or hash.",
        };
      }

      const computedHash = createHash("sha256")
        .update(chunk.content, "utf8")
        .digest("hex");

      if (computedHash !== chunk.contentHash) {
        return {
          state: "corrupted_snapshot",
          error: `Cryptographic integrity failure: chunk ${chunk.chunkId} content hash does not match computed SHA-256.`,
        };
      }
    }

    if (snapshot.chunks.length === 0) {
      return { state: "valid_empty" };
    }

    return { state: "valid_with_references" };
  }

  /**
   * Validate a complete GeneratedPresentationSlide against the slide's historical snapshot.
   *
   * Enforces Phase 2A-2.3c Citation Integrity Rules:
   * 1. Every Claim with evidenceStatus="supported" must have at least 1 valid chunkId.
   * 2. Claims with evidenceStatus="insufficient_evidence" must NOT have chunkIds.
   * 3. All chunkIds in claims and citations must be validated against the snapshot.
   * 4. Extra/unused citations in the citations list must be rejected (unused_extra_citation).
   * 5. Citations claimed in text but missing from the citations array are rejected (claim_citation_mismatch).
   * 6. referenceId from model is untrusted; authoritative referenceId is injected from snapshot.
   * 7. Empty snapshot requires empty citations and zero supported claims with chunkIds.
   */
  async validateFullGeneratedSlide(params: {
    projectId: PresentationProjectId;
    slideId: PresentationSlideId;
    slide: GeneratedPresentationSlide;
  }): Promise<
    ServerCitationValidationResult & {
      authoritativeSlide?: GeneratedPresentationSlide;
      snapshotState: SnapshotState;
    }
  > {
    const { projectId, slideId, slide } = params;

    const slideRecord = await this.deps.slideStore.findById(slideId, projectId);
    if (!slideRecord) {
      throw new DomainError("not_found", "Presentation slide not found");
    }

    const snapshot = await this.deps.slideStore.getReferenceSnapshot(
      slideId,
      projectId,
    );

    const snapshotEvaluation = ServerCitationValidator.evaluateSnapshotState(snapshot);
    const snapshotState = snapshotEvaluation.state;

    // Handle missing or corrupted snapshot
    if (snapshotState === "missing_snapshot" || snapshotState === "corrupted_snapshot") {
      const status: CitationValidationStatus =
        snapshotState === "missing_snapshot"
          ? "unknown_snapshot"
          : "snapshot_integrity_failure";

      return {
        valid: false,
        status,
        slideIndex: slideRecord.slideIndex,
        projectId,
        evaluatedCitations: [
          {
            chunkId: "",
            status,
            detail: snapshotEvaluation.error ?? "Snapshot validation failed.",
          },
        ],
        validCount: 0,
        invalidCount: 1,
        snapshotState,
      };
    }

    // Snapshot integrity check against project and slide index
    if (snapshot!.projectId !== projectId) {
      return {
        valid: false,
        status: "project_mismatch",
        slideIndex: slideRecord.slideIndex,
        projectId,
        evaluatedCitations: [
          {
            chunkId: "",
            status: "project_mismatch",
            detail: `Snapshot project ID (${snapshot!.projectId}) does not match expected project ID (${projectId}).`,
          },
        ],
        validCount: 0,
        invalidCount: 1,
        snapshotState,
      };
    }

    if (snapshot!.slideIndex !== slideRecord.slideIndex) {
      return {
        valid: false,
        status: "snapshot_integrity_failure",
        slideIndex: slideRecord.slideIndex,
        projectId,
        evaluatedCitations: [
          {
            chunkId: "",
            status: "snapshot_integrity_failure",
            detail: `Snapshot slide index (${snapshot!.slideIndex}) does not match slide index (${slideRecord.slideIndex}).`,
          },
        ],
        validCount: 0,
        invalidCount: 1,
        snapshotState,
      };
    }

    // Case A: Valid Empty Snapshot
    if (snapshotState === "valid_empty") {
      const evaluated: SingleCitationValidationResult[] = [];

      // Check if model hallucinated citations or supported claims on an empty snapshot
      for (const item of slide.content ?? []) {
        for (const claim of item.claims ?? []) {
          if (claim.evidenceStatus === "supported" || (claim.chunkIds && claim.chunkIds.length > 0)) {
            evaluated.push({
              chunkId: claim.chunkIds?.[0] ?? "",
              status: "chunk_not_in_slide_context",
              detail: `Claim "${claim.text}" claims evidence but slide snapshot is empty (no references exist).`,
            });
          }
        }
      }

      for (const cit of slide.citations ?? []) {
        evaluated.push({
          chunkId: cit.chunkId,
          status: "chunk_not_in_slide_context",
          detail: `Slide citation "${cit.chunkId}" cannot be grounded because slide snapshot is empty.`,
        });
      }

      if (evaluated.length > 0) {
        return {
          valid: false,
          status: evaluated[0].status,
          slideIndex: slideRecord.slideIndex,
          projectId,
          evaluatedCitations: evaluated,
          validCount: 0,
          invalidCount: evaluated.length,
          snapshotState,
        };
      }

      // Valid empty slide!
      return {
        valid: true,
        status: "valid",
        slideIndex: slideRecord.slideIndex,
        projectId,
        evaluatedCitations: [],
        validCount: 0,
        invalidCount: 0,
        snapshotState,
        authoritativeSlide: {
          ...slide,
          citations: [],
        },
      };
    }

    // Case B: Valid Snapshot with References
    const chunksById = new Map<string, SnapshotReferenceChunk>();
    for (const sc of snapshot!.chunks) {
      chunksById.set(sc.chunkId, sc);
    }

    const evaluatedCitations: SingleCitationValidationResult[] = [];
    const usedChunkIdsInClaims = new Set<string>();

    // 1. Validate all claims in slide content
    for (const item of slide.content ?? []) {
      for (const claim of item.claims ?? []) {
        if (claim.evidenceStatus === "supported") {
          if (!Array.isArray(claim.chunkIds) || claim.chunkIds.length === 0) {
            evaluatedCitations.push({
              chunkId: "",
              status: "unsupported_claim_missing_citation",
              detail: `Claim "${claim.text}" has evidenceStatus="supported" but has no chunkIds attached.`,
            });
            continue;
          }

          for (const rawChunkId of claim.chunkIds) {
            const chunkId = rawChunkId?.trim() ?? "";
            if (!chunkId) {
              evaluatedCitations.push({
                chunkId: "",
                status: "malformed_citation",
                detail: `Claim "${claim.text}" specifies an empty chunkId.`,
              });
              continue;
            }

            if (!/^[a-zA-Z0-9_\-:]+$/.test(chunkId) || chunkId.length < 5) {
              evaluatedCitations.push({
                chunkId,
                status: "invalid_chunk_id",
                detail: `Claim specifies syntactically invalid chunkId "${chunkId}".`,
              });
              continue;
            }

            const matched = chunksById.get(chunkId);
            if (!matched) {
              evaluatedCitations.push({
                chunkId,
                status: "chunk_not_in_slide_context",
                detail: `Claim references chunk "${chunkId}" which does not exist in slide snapshot.`,
              });
              continue;
            }

            usedChunkIdsInClaims.add(chunkId);
          }
        } else if (claim.evidenceStatus === "insufficient_evidence") {
          // Insufficient evidence must not have chunkIds claiming support
          if (Array.isArray(claim.chunkIds) && claim.chunkIds.length > 0) {
            evaluatedCitations.push({
              chunkId: claim.chunkIds[0],
              status: "claim_citation_mismatch",
              detail: `Claim "${claim.text}" is marked insufficient_evidence but includes chunk citations.`,
            });
          }
        }
      }
    }

    // 2. Validate top-level citations list
    const slideCitationsSet = new Set<string>();
    for (const cit of slide.citations ?? []) {
      const chunkId = cit?.chunkId?.trim() ?? "";
      if (!chunkId) {
        evaluatedCitations.push({
          chunkId: "",
          status: "malformed_citation",
          detail: "Slide citation has empty chunkId.",
        });
        continue;
      }

      slideCitationsSet.add(chunkId);

      const matched = chunksById.get(chunkId);
      if (!matched) {
        evaluatedCitations.push({
          chunkId,
          status: "chunk_not_in_slide_context",
          detail: `Slide citation "${chunkId}" was not selected in this slide's snapshot.`,
        });
        continue;
      }

      // Check for unused/extra citations
      if (!usedChunkIdsInClaims.has(chunkId)) {
        evaluatedCitations.push({
          chunkId,
          status: "unused_extra_citation",
          detail: `Slide citation "${chunkId}" is present in citations array but never referenced by any supported claim.`,
          matchedChunk: matched,
        });
        continue;
      }

      evaluatedCitations.push({
        chunkId,
        status: "valid",
        detail: `Verified against slide snapshot. Source: "${matched.sourceTitle}" (${matched.citationLabel}).`,
        matchedChunk: matched,
      });
    }

    // 3. Check for claim-citation mismatch (chunk referenced in supported claim but missing from top-level citations)
    for (const chunkId of usedChunkIdsInClaims) {
      if (chunksById.has(chunkId) && !slideCitationsSet.has(chunkId)) {
        evaluatedCitations.push({
          chunkId,
          status: "claim_citation_mismatch",
          detail: `Chunk "${chunkId}" is cited in supported claim, but omitted from the slide citations array.`,
        });
      }
    }

    const validCount = evaluatedCitations.filter((c) => c.status === "valid").length;
    const invalidCount = evaluatedCitations.length - validCount;
    const firstInvalid = evaluatedCitations.find((c) => c.status !== "valid");

    const isFullyValid = invalidCount === 0 && (evaluatedCitations.length > 0 || usedChunkIdsInClaims.size === 0);

    let authoritativeSlide: GeneratedPresentationSlide | undefined;
    if (isFullyValid) {
      // Overwrite model's referenceId with server-side authoritative referenceId!
      authoritativeSlide = {
        ...slide,
        citations: Array.from(usedChunkIdsInClaims).map((chunkId) => {
          const matched = chunksById.get(chunkId)!;
          return {
            chunkId,
            referenceId: matched.referenceId,
          };
        }),
      };
    }

    return {
      valid: isFullyValid,
      status: firstInvalid ? firstInvalid.status : "valid",
      slideIndex: slideRecord.slideIndex,
      projectId,
      evaluatedCitations,
      validCount,
      invalidCount,
      snapshotState,
      authoritativeSlide,
    };
  }
}

