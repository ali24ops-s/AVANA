/**
 * PR6-3 chunker unit tests.
 *
 * Covers:
 * - buildChunks creates one chunk per page by default
 * - grouping multiple pages per chunk preserves page ranges
 * - deterministic content hashes
 * - token estimation heuristic
 * - empty pages are skipped from content but sequence stays stable
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { DocumentId, OrganizationId } from "@avana/domain";
import {
  buildChunks,
  estimateTokens,
  sha256Hex,
  CHARS_PER_TOKEN,
} from "./chunker.js";
import type { ExtractedPage } from "./types.js";

const docId = randomUUID() as DocumentId;
const orgId = randomUUID() as OrganizationId;

function page(pageNumber: number, rawText: string): ExtractedPage {
  return {
    pageNumber,
    rawText,
    characterCount: rawText.length,
  };
}

describe("buildChunks", () => {
  it("creates one chunk per page by default", () => {
    const pages = [page(1, "alpha"), page(2, "beta"), page(3, "gamma")];
    const chunks = buildChunks(docId, orgId, pages);

    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.sequence)).toEqual([0, 1, 2]);
    expect(chunks.map((c) => c.startPage)).toEqual([1, 2, 3]);
    expect(chunks.map((c) => c.endPage)).toEqual([1, 2, 3]);
    expect(chunks.map((c) => c.content)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("groups multiple pages per chunk and preserves page range", () => {
    const pages = [page(1, "a"), page(2, "b"), page(3, "c"), page(4, "d")];
    const chunks = buildChunks(docId, orgId, pages, 2);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].startPage).toBe(1);
    expect(chunks[0].endPage).toBe(2);
    expect(chunks[0].content).toBe("a\n\nb");
    expect(chunks[1].startPage).toBe(3);
    expect(chunks[1].endPage).toBe(4);
    expect(chunks[1].content).toBe("c\n\nd");
  });

  it("handles pagesPerChunk larger than the page count", () => {
    const chunks = buildChunks(docId, orgId, [page(1, "only")], 5);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("only");
  });

  it("produces deterministic content hashes for identical content", () => {
    const pages1 = [page(1, "same text")];
    const pages2 = [page(1, "same text")];
    const a = buildChunks(docId, orgId, pages1)[0];
    const b = buildChunks(docId, orgId, pages2)[0];
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toHaveLength(64);
  });

  it("produces different hashes for different content", () => {
    const a = buildChunks(docId, orgId, [page(1, "one")])[0];
    const b = buildChunks(docId, orgId, [page(1, "two")])[0];
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("skips empty pages from content but keeps stable sequence", () => {
    const pages = [page(1, ""), page(2, "real content")];
    const chunks = buildChunks(docId, orgId, pages);
    // Empty page produces a chunk with empty content.
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("");
    expect(chunks[1].content).toBe("real content");
  });

  it("sets documentId and organizationId on every chunk", () => {
    const chunks = buildChunks(docId, orgId, [page(1, "x")]);
    expect(chunks[0].documentId).toBe(docId);
    expect(chunks[0].organizationId).toBe(orgId);
    expect(chunks[0].id).toBeDefined();
  });
});

describe("estimateTokens", () => {
  it("estimates at least 1 token for empty text", () => {
    expect(estimateTokens("")).toBe(1);
  });

  it("estimates tokens from character count", () => {
    // "hello world" is 11 chars → ceil(11/4) = 3
    expect(estimateTokens("hello world")).toBe(3);
    // 8 chars → ceil(8/4) = 2
    expect(estimateTokens("12345678")).toBe(2);
  });

  it("uses CHARS_PER_TOKEN constant", () => {
    expect(CHARS_PER_TOKEN).toBe(4);
  });
});

describe("sha256Hex", () => {
  it("returns a 64-char hex digest", () => {
    expect(sha256Hex("abc")).toHaveLength(64);
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
  });
});
