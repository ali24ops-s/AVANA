/**
 * Chunking strategy.
 *
 * Turns extracted pages into `DocumentChunkRecord`s. Per the AVANA Sprint 6
 * proposal, chunking is semantic where possible and deterministic:
 * - Each page becomes one chunk (preserving page boundaries for citations).
 * - Chunk content is hashed (SHA-256) for stability and dedupe.
 * - Token estimate is derived from character count (~4 chars/token).
 * - start_page/end_page reflect the source page range.
 *
 * Deterministic and re-runnable: the same pages produce the same chunks.
 * No embeddings are generated here (deferred to a later PR).
 */

import { createHash, randomUUID } from "node:crypto";
import type {
  DocumentChunkId,
  DocumentId,
  OrganizationId,
} from "@avana/domain";
import type { DocumentChunkRecord } from "../../learning/learning-store.js";
import type { ExtractedPage } from "./types.js";

/** Approximate characters per token (rough heuristic for cost budgeting). */
export const CHARS_PER_TOKEN = 4;

/** SHA-256 hex digest of a string. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Estimate token count from raw text length. */
export function estimateTokens(text: string): number {
  const chars = text.trim().length;
  return Math.max(1, Math.ceil(chars / CHARS_PER_TOKEN));
}

/**
 * Build `DocumentChunkRecord`s from extracted pages.
 *
 * Each page becomes a single chunk by default. `pagesPerChunk` allows grouping
 * multiple consecutive pages into one larger semantic chunk while preserving
 * the source page range.
 *
 * @param documentId   owning document
 * @param organizationId tenant scope (denormalized)
 * @param pages        extracted pages (ordered)
 * @param pagesPerChunk pages to group per chunk (default 1)
 */
export function buildChunks(
  documentId: DocumentId,
  organizationId: OrganizationId,
  pages: ExtractedPage[],
  pagesPerChunk = 1,
): DocumentChunkRecord[] {
  if (pagesPerChunk < 1) pagesPerChunk = 1;

  const chunks: DocumentChunkRecord[] = [];
  let sequence = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < pages.length; i += pagesPerChunk) {
    const group = pages.slice(i, i + pagesPerChunk);
    const content = group
      .map((p) => p.rawText)
      .filter(Boolean)
      .join("\n\n")
      .replace(/\0/g, "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "");

    const startPage = group[0]?.pageNumber ?? 1;
    const endPage = group[group.length - 1]?.pageNumber ?? startPage;

    chunks.push({
      id: randomUUID() as DocumentChunkId,
      documentId,
      organizationId,
      sequence: sequence++,
      heading: null,
      content,
      startPage,
      endPage,
      tokenEstimate: estimateTokens(content),
      contentHash: sha256Hex(content),
      createdAt: now,
    });
  }

  return chunks;
}
