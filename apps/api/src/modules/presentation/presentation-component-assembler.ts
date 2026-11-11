/**
 * Presentation Component Assembler.
 *
 * Implements Phase 2A-2.3d:
 * - Transforms accepted GeneratedPresentationSlide into renderer-ready SlideLayoutAssembly.
 * - Strict 1:1 Content Ordering: body.blocks[i].sourceIndex === i.
 * - Exact claim preservation with chunkId multiplicity and resolved citation labels.
 * - Safe markdown table parsing preserving Persian ZWNJ, units, formulas, and headers without synthetic data.
 * - Fail-fast validation if any cited chunkId is missing from the immutable reference snapshot.
 * - Runs authoritative verifyStrictClaimPreservation assertion before returning.
 */

import {
  type AssembledCitation,
  type AssembledClaim,
  type AssembledContentBlock,
  type AssembledBulletListBlock,
  type AssembledTableBlock,
  type AssembledTextBlock,
  type AssembledStatBlock,
  type AssembledQuoteBlock,
  type GeneratedPresentationSlide,
  type GeneratedSlideContentItem,
  type PresentationProjectId,
  type PresentationSlideId,
  type SlideLayoutAssembly,
  type SlideReferenceContextSnapshot,
  type SnapshotReferenceChunk,
  DomainError,
  SLIDE_LAYOUT_ASSEMBLER_VERSION,
  verifyStrictClaimPreservation,
} from "@avana/domain";
import {
  PresentationLayoutSelector,
  type LayoutSelectorResult,
} from "./presentation-layout-selector.js";

export interface AssembleSlideLayoutInput {
  slideId?: PresentationSlideId;
  projectId: PresentationProjectId;
  slideIndex: number;
  totalSlides?: number;
  slide: GeneratedPresentationSlide;
  snapshot: SlideReferenceContextSnapshot;
  isTerminalSlide?: boolean;
  overrideAssembledAt?: string;
}

export class PresentationComponentAssembler {
  /**
   * Assembles a renderer-ready slide presentation layout from validated slide content and snapshot.
   */
  static assemble(input: AssembleSlideLayoutInput): SlideLayoutAssembly {
    const {
      slideId,
      projectId,
      slideIndex,
      totalSlides,
      slide,
      snapshot,
      isTerminalSlide,
      overrideAssembledAt,
    } = input;

    // 1. Snapshot Grounding Verification (Fail-fast invariant)
    const snapshotChunkMap = new Map<string, SnapshotReferenceChunk>();
    for (const chunk of snapshot.chunks) {
      snapshotChunkMap.set(chunk.chunkId, chunk);
    }

    // Check all claim chunkIds
    for (let i = 0; i < slide.content.length; i++) {
      const item = slide.content[i];
      for (let c = 0; c < item.claims.length; c++) {
        const claim = item.claims[c];
        for (const cid of claim.chunkIds) {
          if (!snapshotChunkMap.has(cid)) {
            throw new DomainError(
              "unprocessable",
              `Assembly failed: Claim at content[${i}].claims[${c}] references unknown chunkId "${cid}" that does not exist in the reference snapshot.`,
            );
          }
        }
      }
    }

    // Check all top-level slide citations
    for (let k = 0; k < slide.citations.length; k++) {
      const cit = slide.citations[k];
      if (!snapshotChunkMap.has(cit.chunkId)) {
        throw new DomainError(
          "unprocessable",
          `Assembly failed: Slide citation at index ${k} references unknown chunkId "${cit.chunkId}" that does not exist in the reference snapshot.`,
        );
      }
    }

    // 2. Deterministic Layout Selection
    const selectorResult: LayoutSelectorResult =
      PresentationLayoutSelector.selectLayout({
        slide,
        slideIndex,
        totalSlides,
        isTerminalSlide,
      });

    // 3. Assemble Header Component
    const header = {
      title: slide.title,
      subtitle: slide.subtitle,
      slideNumber: slideIndex,
      totalSlides,
    };

    // 4. Assemble Footer Component (complete citations from snapshot)
    const referencedChunkIds = new Set<string>();
    for (const item of slide.content) {
      for (const claim of item.claims) {
        for (const cid of claim.chunkIds) {
          referencedChunkIds.add(cid);
        }
      }
    }
    for (const cit of slide.citations) {
      referencedChunkIds.add(cit.chunkId);
    }

    // Sort citations deterministically according to snapshot chunk rank/sequence
    const assembledCitations: AssembledCitation[] = [];
    for (const chunk of snapshot.chunks) {
      if (referencedChunkIds.has(chunk.chunkId)) {
        assembledCitations.push({
          chunkId: chunk.chunkId,
          referenceId: chunk.referenceId,
          citationLabel: chunk.citationLabel,
          sourceTitle: chunk.sourceTitle,
          sourceType: chunk.sourceType,
          location: {
            startPage: chunk.sourceLocation.startPage,
            endPage: chunk.sourceLocation.endPage,
            slideIndex: chunk.sourceLocation.slideIndex,
          },
          rank: chunk.rank,
        });
      }
    }

    const footer = {
      speakerNotes: slide.speakerNotes,
      hasNotes: Boolean(slide.speakerNotes && slide.speakerNotes.trim().length > 0),
      citations: assembledCitations,
    };

    // 5. Assemble Content Blocks (Strict 1:1 order: blocks[i].sourceIndex === i)
    const blocks: AssembledContentBlock[] = [];
    let totalSupportedClaims = 0;
    let totalInsufficientEvidenceClaims = 0;

    for (let sourceIndex = 0; sourceIndex < slide.content.length; sourceIndex++) {
      const item = slide.content[sourceIndex];

      // Map claims with exact preservation of text, evidenceStatus, chunkIds, and multiplicity
      const assembledClaims: AssembledClaim[] = item.claims.map((claim) => {
        if (claim.evidenceStatus === "supported") {
          totalSupportedClaims++;
        } else {
          totalInsufficientEvidenceClaims++;
        }

        const citationLabels = claim.chunkIds.map((cid) => {
          const matched = snapshotChunkMap.get(cid);
          return matched ? matched.citationLabel : "[Citation]";
        });

        return {
          text: claim.text,
          chunkIds: [...claim.chunkIds],
          evidenceStatus: claim.evidenceStatus,
          citationLabels,
        };
      });

      const block = PresentationComponentAssembler.assembleBlock({
        sourceIndex,
        item,
        assembledClaims,
        layoutType: selectorResult.layoutType,
        density: selectorResult.density,
      });

      blocks.push(block);
    }

    // 6. Build Assembly
    const assembly: SlideLayoutAssembly = {
      slideId,
      projectId,
      slideIndex,
      layoutType: selectorResult.layoutType,
      direction: selectorResult.direction,
      density: selectorResult.density,
      header,
      body: {
        layoutType: selectorResult.layoutType,
        direction: selectorResult.direction,
        density: selectorResult.density,
        blocks,
        columnRatio: selectorResult.layoutType === "two_column" ? "50/50" : undefined,
      },
      footer,
      metadata: {
        totalClaims: totalSupportedClaims + totalInsufficientEvidenceClaims,
        supportedClaimsCount: totalSupportedClaims,
        insufficientEvidenceCount: totalInsufficientEvidenceClaims,
        totalCitations: assembledCitations.length,
        assembledAt: overrideAssembledAt ?? new Date().toISOString(),
        assemblerVersion: SLIDE_LAYOUT_ASSEMBLER_VERSION,
      },
    };

    // 7. Verify strict preservation invariants before returning
    verifyStrictClaimPreservation(slide, assembly);

    return assembly;
  }

  /**
   * Assembles an individual content block maintaining exact content and claims.
   */
  private static assembleBlock(params: {
    sourceIndex: number;
    item: GeneratedSlideContentItem;
    assembledClaims: AssembledClaim[];
    layoutType: LayoutSelectorResult["layoutType"];
    density: LayoutSelectorResult["density"];
  }): AssembledContentBlock {
    const { sourceIndex, item, assembledClaims, layoutType, density } = params;

    // 1. Table Item
    if (item.type === "table") {
      const parsedTable = PresentationComponentAssembler.parseMarkdownTable(item.content);
      const tableBlock: AssembledTableBlock = {
        sourceIndex,
        kind: "table",
        sourceType: "table",
        rawContent: item.content,
        claims: assembledClaims,
        headers: parsedTable.headers,
        rows: parsedTable.rows,
        columnAlignments: parsedTable.alignments,
      };
      return tableBlock;
    }

    // 2. Bullet List Item
    if (item.type === "bullet_list") {
      const items = PresentationComponentAssembler.parseBulletList(item.content);
      const listBlock: AssembledBulletListBlock = {
        sourceIndex,
        kind: "bullet_list",
        sourceType: "bullet_list",
        rawContent: item.content,
        claims: assembledClaims,
        items,
        layoutDensity: density,
      };
      return listBlock;
    }

    // 3. Text Item: Check for specialized kinds based on selected layout
    if (layoutType === "statistic_highlight") {
      const parsedStat = PresentationComponentAssembler.parseStatHighlight(item.content);
      const statBlock: AssembledStatBlock = {
        sourceIndex,
        kind: "statistic_highlight",
        sourceType: "text",
        rawContent: item.content,
        claims: assembledClaims,
        metricValue: parsedStat.value,
        metricLabel: parsedStat.label,
        supportingText: parsedStat.supportingText,
      };
      return statBlock;
    }

    if (layoutType === "quote") {
      const parsedQuote = PresentationComponentAssembler.parseQuote(item.content);
      const quoteBlock: AssembledQuoteBlock = {
        sourceIndex,
        kind: "quote",
        sourceType: "text",
        rawContent: item.content,
        claims: assembledClaims,
        quoteText: parsedQuote.quoteText,
        attribution: parsedQuote.attribution,
      };
      return quoteBlock;
    }

    // Standard Text Block
    const paragraphs = item.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const textBlock: AssembledTextBlock = {
      sourceIndex,
      kind: "text",
      sourceType: "text",
      rawContent: item.content,
      claims: assembledClaims,
      paragraphs: paragraphs.length > 0 ? paragraphs : [item.content],
    };

    return textBlock;
  }

  /**
   * Parses markdown table preserving exact cell characters without trim loss.
   */
  private static parseMarkdownTable(content: string): {
    headers: string[];
    rows: string[][];
    alignments: Array<"right" | "left" | "center">;
  } {
    const rawLines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

    // Look for markdown divider row: e.g. |---|:---:|---|
    const dividerIndex = rawLines.findIndex((line) => {
      const stripped = line.replace(/\|/g, "").replace(/[-:\s]/g, "");
      return stripped.length === 0 && line.includes("-");
    });

    let headers: string[] = [];
    const rows: string[][] = [];
    const alignments: Array<"right" | "left" | "center"> = [];

    const parseLineCells = (line: string): string[] => {
      let raw = line;
      // Strip leading and trailing pipe
      if (raw.startsWith("|")) raw = raw.slice(1);
      if (raw.endsWith("|")) raw = raw.slice(0, -1);

      // Split by pipe
      const rawCells = raw.split("|");
      return rawCells.map((cell) => {
        // Strip only outer delimiter spaces; preserve internal spaces, ZWNJ, math, units
        return cell.replace(/^\s+/, "").replace(/\s+$/, "");
      });
    };

    if (dividerIndex > 0) {
      // Header is line before divider
      headers = parseLineCells(rawLines[dividerIndex - 1]);

      // Parse alignments from divider line
      const dividerCells = parseLineCells(rawLines[dividerIndex]);
      for (const d of dividerCells) {
        const trimmed = d.trim();
        if (trimmed.startsWith(":") && trimmed.endsWith(":")) {
          alignments.push("center");
        } else if (trimmed.endsWith(":")) {
          alignments.push("left");
        } else {
          alignments.push("right");
        }
      }

      // Rows are lines after divider
      for (let r = dividerIndex + 1; r < rawLines.length; r++) {
        rows.push(parseLineCells(rawLines[r]));
      }
    } else {
      // No divider found: all lines are rows
      for (const line of rawLines) {
        rows.push(parseLineCells(line));
      }
    }

    return {
      headers,
      rows,
      alignments,
    };
  }

  /**
   * Parses bullet list items cleanly.
   */
  private static parseBulletList(content: string): string[] {
    const lines = content.split("\n");
    const items: string[] = [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // Match bullets: *, -, •, or numbered (1., 2.)
      const cleaned = trimmed
        .replace(/^[*•-]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .trim();

      if (cleaned.length > 0) {
        items.push(cleaned);
      }
    }

    return items.length > 0 ? items : [content.trim()];
  }

  /**
   * Parses a quote and optional attribution.
   */
  private static parseQuote(content: string): {
    quoteText: string;
    attribution?: string;
  } {
    const trimmed = content.trim();

    // Check for author / attribution separated by dash at the end
    const dashMatch = trimmed.match(/^([\s\S]+?)(?:\s*(?:—|--|-)\s*([^\n\r]+))$/);
    let quoteRaw = trimmed;
    let attribution: string | undefined;

    if (dashMatch) {
      quoteRaw = dashMatch[1].trim();
      attribution = dashMatch[2].trim();
    }

    // Strip quotation characters
    const quoteText = quoteRaw
      .replace(/^[«“">]\s*/, "")
      .replace(/\s*[»”"]$/, "")
      .trim();

    return {
      quoteText: quoteText || trimmed,
      attribution,
    };
  }

  /**
   * Parses a quantitative metric and label.
   */
  private static parseStatHighlight(content: string): {
    value: string;
    label: string;
    supportingText?: string;
  } {
    const trimmed = content.trim();

    // Match metric prefix: e.g., "75%", "p < 0.01", "2.5x", "120 mg/dL"
    const metricMatch = trimmed.match(
      /^((?:p\s*<\s*0?\.\d+|\d+(?:[.,]\d+)?\s*(?:%|درصد|برابر|mg|g|kg|ml|L|mcg|IU|mmol|mmHg|bpm)?))\s*[:\-–—]?\s*([\s\S]*)$/i,
    );

    if (metricMatch) {
      const value = metricMatch[1].trim();
      const rest = metricMatch[2].trim();
      const splitPeriod = rest.split(/([.!\n])/);
      const label = splitPeriod[0]?.trim() || rest;
      const supportingText = splitPeriod.slice(1).join("").trim() || undefined;

      return {
        value,
        label: label || value,
        supportingText,
      };
    }

    return {
      value: trimmed.slice(0, 20),
      label: trimmed,
    };
  }
}
