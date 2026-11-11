/**
 * Presentation Slide Layout Synthesis & Component Assembler Contracts.
 *
 * Implements Phase 2A-2.3d:
 * - Deterministic slide layout types and density definitions.
 * - Discriminated assembled content block models (preserving sourceIndex, sourceType, rawContent, and claims).
 * - Exact claim and citation preservation types.
 * - Comprehensive slide layout assembly contract ready for frontend rendering.
 */

import type {
  PresentationProjectId,
  PresentationSlideId,
} from "./ids.js";
import type {
  EvidenceStatus,
  GeneratedPresentationSlide,
  GeneratedSlideContentType,
} from "./presentation.js";
import { DomainError } from "./errors.js";

export const SLIDE_LAYOUT_TYPES = [
  "title",
  "bullet_list",
  "two_column",
  "table",
  "text_content",
  "statistic_highlight",
  "quote",
  "conclusion",
] as const;

export type SlideLayoutType = (typeof SLIDE_LAYOUT_TYPES)[number];
export type SlideDensity = "compact" | "normal" | "spacious";
export type TextDirection = "rtl" | "ltr";

export const ASSEMBLED_BLOCK_KINDS = [
  "bullet_list",
  "table",
  "text",
  "statistic_highlight",
  "quote",
] as const;

export type AssembledBlockKind = (typeof ASSEMBLED_BLOCK_KINDS)[number];

/**
 * Exact representation of a claim preserved from GeneratedSlideClaim.
 * Retains exact text, evidenceStatus, chunkIds (including multiplicity), and resolved citation labels.
 */
export interface AssembledClaim {
  text: string;
  chunkIds: string[];
  evidenceStatus: EvidenceStatus;
  citationLabels: string[];
}

/**
 * Enriched citation entry for footer display, resolved exclusively from the reference snapshot.
 */
export interface AssembledCitation {
  chunkId: string;
  referenceId?: string;
  citationLabel: string;
  sourceTitle: string;
  sourceType: string;
  location?: {
    startPage: number | null;
    endPage: number | null;
    slideIndex: number | null;
  };
  rank: number;
}

export interface SlideHeaderComponent {
  title: string;
  subtitle?: string;
  slideNumber: number;
  totalSlides?: number;
}

/**
 * Base interface for all assembled content blocks.
 * Preserves the original source index, unmutated raw content, and original claims.
 */
export interface AssembledContentBlockBase {
  sourceIndex: number;
  sourceType: GeneratedSlideContentType;
  rawContent: string;
  claims: AssembledClaim[];
}

export interface AssembledBulletListBlock extends AssembledContentBlockBase {
  kind: "bullet_list";
  sourceType: "bullet_list";
  items: string[];
  layoutDensity: SlideDensity;
}

export interface AssembledTableBlock extends AssembledContentBlockBase {
  kind: "table";
  sourceType: "table";
  headers: string[];
  rows: string[][];
  columnAlignments: Array<"right" | "left" | "center">;
  caption?: string;
}

export interface AssembledTextBlock extends AssembledContentBlockBase {
  kind: "text";
  sourceType: "text";
  paragraphs: string[];
}

export interface AssembledStatBlock extends AssembledContentBlockBase {
  kind: "statistic_highlight";
  sourceType: "text";
  metricValue: string;
  metricLabel: string;
  supportingText?: string;
}

export interface AssembledQuoteBlock extends AssembledContentBlockBase {
  kind: "quote";
  sourceType: "text";
  quoteText: string;
  attribution?: string;
}

export type AssembledContentBlock =
  | AssembledBulletListBlock
  | AssembledTableBlock
  | AssembledTextBlock
  | AssembledStatBlock
  | AssembledQuoteBlock;

export interface SlideBodyLayout {
  layoutType: SlideLayoutType;
  direction: TextDirection;
  density: SlideDensity;
  /**
   * Content blocks strictly in their original presentation sequence.
   * `blocks[i].sourceIndex === i` is invariant across all layout types.
   */
  blocks: AssembledContentBlock[];
  columnRatio?: "50/50" | "60/40" | "40/60";
}

export interface SlideFooterComponent {
  speakerNotes: string;
  hasNotes: boolean;
  citations: AssembledCitation[];
}

export interface SlideLayoutAssembly {
  slideId?: PresentationSlideId;
  projectId: PresentationProjectId;
  slideIndex: number;
  layoutType: SlideLayoutType;
  direction: TextDirection;
  density: SlideDensity;
  header: SlideHeaderComponent;
  body: SlideBodyLayout;
  footer: SlideFooterComponent;
  metadata: {
    totalClaims: number;
    supportedClaimsCount: number;
    insufficientEvidenceCount: number;
    totalCitations: number;
    assembledAt: string;
    assemblerVersion: string;
  };
}

export const SLIDE_LAYOUT_ASSEMBLER_VERSION = "1.0.0" as const;
export const PRESENTATION_LAYOUT_METADATA_KEY = "layoutAssembly" as const;

/**
 * Strict Claim and Citation Preservation Verification Invariant.
 *
 * Verifies that:
 * 1. Total claims count matches original slide claims count.
 * 2. Every claim in original content item `i` exists in assembled block with `sourceIndex === i`.
 * 3. Exact claim text, evidenceStatus, chunkIds, and multiplicity are preserved.
 * 4. All slide-level and claim-level citations are present in the footer citations list.
 *
 * Throws DomainError("unprocessable", ...) if any invariant is violated.
 */
export function verifyStrictClaimPreservation(
  originalSlide: GeneratedPresentationSlide,
  assembly: SlideLayoutAssembly,
): void {
  // 1. Verify blocks count and sourceIndex mapping
  if (assembly.body.blocks.length !== originalSlide.content.length) {
    throw new DomainError(
      "unprocessable",
      `Preservation violation: Assembled blocks count (${assembly.body.blocks.length}) does not match original content items count (${originalSlide.content.length}).`,
    );
  }

  let totalOriginalClaims = 0;
  let totalAssembledClaims = 0;

  for (let i = 0; i < originalSlide.content.length; i++) {
    const originalItem = originalSlide.content[i];
    const assembledBlock = assembly.body.blocks[i];

    if (!assembledBlock || assembledBlock.sourceIndex !== i) {
      throw new DomainError(
        "unprocessable",
        `Preservation violation: Block at index ${i} has mismatching sourceIndex ${assembledBlock?.sourceIndex}.`,
      );
    }

    if (assembledBlock.sourceType !== originalItem.type) {
      throw new DomainError(
        "unprocessable",
        `Preservation violation: Block at index ${i} has sourceType "${assembledBlock.sourceType}", expected "${originalItem.type}".`,
      );
    }

    totalOriginalClaims += originalItem.claims.length;
    totalAssembledClaims += assembledBlock.claims.length;

    if (assembledBlock.claims.length !== originalItem.claims.length) {
      throw new DomainError(
        "unprocessable",
        `Preservation violation: Block ${i} claims count (${assembledBlock.claims.length}) does not match original claims count (${originalItem.claims.length}).`,
      );
    }

    for (let c = 0; c < originalItem.claims.length; c++) {
      const origClaim = originalItem.claims[c];
      const assemClaim = assembledBlock.claims[c];

      if (!assemClaim) {
        throw new DomainError(
          "unprocessable",
          `Preservation violation: Missing assembled claim at block [${i}][${c}].`,
        );
      }

      if (assemClaim.text !== origClaim.text) {
        throw new DomainError(
          "unprocessable",
          `Preservation violation: Claim text mutated at block [${i}][${c}]. Expected "${origClaim.text}", got "${assemClaim.text}".`,
        );
      }

      if (assemClaim.evidenceStatus !== origClaim.evidenceStatus) {
        throw new DomainError(
          "unprocessable",
          `Preservation violation: Claim evidenceStatus mutated at block [${i}][${c}]. Expected "${origClaim.evidenceStatus}", got "${assemClaim.evidenceStatus}".`,
        );
      }

      // Check chunkIds exact length, elements, and multiplicity
      if (assemClaim.chunkIds.length !== origClaim.chunkIds.length) {
        throw new DomainError(
          "unprocessable",
          `Preservation violation: Claim chunkIds length mutated at block [${i}][${c}]. Expected ${origClaim.chunkIds.length}, got ${assemClaim.chunkIds.length}.`,
        );
      }

      for (let k = 0; k < origClaim.chunkIds.length; k++) {
        if (assemClaim.chunkIds[k] !== origClaim.chunkIds[k]) {
          throw new DomainError(
            "unprocessable",
            `Preservation violation: Claim chunkId at [${i}][${c}][${k}] mutated. Expected "${origClaim.chunkIds[k]}", got "${assemClaim.chunkIds[k]}".`,
          );
        }
      }
    }
  }

  if (totalAssembledClaims !== totalOriginalClaims) {
    throw new DomainError(
      "unprocessable",
      `Preservation violation: Total assembled claims (${totalAssembledClaims}) does not match original claims (${totalOriginalClaims}).`,
    );
  }

  // 2. Verify footer citations completeness
  const expectedChunkIds = new Set<string>();
  for (const item of originalSlide.content) {
    for (const claim of item.claims) {
      for (const cid of claim.chunkIds) {
        expectedChunkIds.add(cid);
      }
    }
  }
  for (const cit of originalSlide.citations) {
    expectedChunkIds.add(cit.chunkId);
  }

  const footerChunkIds = new Set(assembly.footer.citations.map((c) => c.chunkId));
  for (const expectedId of expectedChunkIds) {
    if (!footerChunkIds.has(expectedId)) {
      throw new DomainError(
        "unprocessable",
        `Preservation violation: Footer citations omitted referenced chunkId "${expectedId}".`,
      );
    }
  }
}
