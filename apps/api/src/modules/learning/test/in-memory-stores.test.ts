// @ts-nocheck
/**
 * PR6-1: In-memory DocumentStore and DocumentChunkStore tests.
 *
 * Verifies tenant/owner scoping and soft-delete behavior against the
 * store interfaces defined in learning-store.ts.
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  DocumentId,
  DocumentChunkId,
  OrganizationId,
  UserId,
  CourseId,
} from "@avana/domain";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "./in-memory-stores.js";
import type { DocumentRecord, DocumentChunkRecord } from "../learning-store.js";

const orgA = "00000000-0000-0000-0000-000000000010" as OrganizationId;
const orgB = "00000000-0000-0000-0000-000000000011" as OrganizationId;
const userA = "00000000-0000-0000-0000-000000000001" as UserId;
const userB = "00000000-0000-0000-0000-000000000002" as UserId;
const courseA = "00000000-0000-0000-0000-000000000020" as CourseId;

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID() as DocumentId,
    organizationId: orgA,
    courseId: courseA,
    ownerUserId: userA,
    originalName: "notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
    storageKey: "uploads/notes.pdf",
    pageCount: null,
    status: "uploaded",
    errorCode: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function makeChunk(
  documentId: DocumentId,
  sequence: number,
  overrides: Partial<DocumentChunkRecord> = {},
): DocumentChunkRecord {
  return {
    id: randomUUID() as DocumentChunkId,
    documentId,
    organizationId: orgA,
    sequence,
    heading: null,
    content: `chunk ${sequence}`,
    startPage: 1,
    endPage: 1,
    tokenEstimate: 100,
    contentHash: `hash-${sequence}`,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("InMemoryDocumentStore", () => {
  it("creates and finds a document scoped to its organization", async () => {
    const store = new InMemoryDocumentStore();
    const doc = makeDocument();
    await store.create(doc);

    await expect(
      store.findByIdForOrganization(doc.id, orgA),
    ).resolves.toMatchObject({ id: doc.id });
    await expect(
      store.findByIdForOrganization(doc.id, orgB),
    ).resolves.toBeUndefined();
  });

  it("scopes findByIdForOwner to the owner user", async () => {
    const store = new InMemoryDocumentStore();
    const doc = makeDocument({ ownerUserId: userA });
    await store.create(doc);

    await expect(
      store.findByIdForOwner(doc.id, orgA, userA),
    ).resolves.toMatchObject({ id: doc.id });
    await expect(
      store.findByIdForOwner(doc.id, orgA, userB),
    ).resolves.toBeUndefined();
  });

  it("lists documents by organization and filters by course", async () => {
    const store = new InMemoryDocumentStore();
    const doc1 = makeDocument({ courseId: courseA });
    const doc2 = makeDocument({
      id: randomUUID() as DocumentId,
      courseId: null,
    });
    await store.create(doc1);
    await store.create(doc2);

    const all = await store.listByOrganization(orgA);
    expect(all).toHaveLength(2);

    const scoped = await store.listByOrganization(orgA, courseA);
    expect(scoped).toHaveLength(1);
    expect(scoped[0].id).toBe(doc1.id);
  });

  it("lists documents by owner", async () => {
    const store = new InMemoryDocumentStore();
    const mine = makeDocument({ ownerUserId: userA });
    const theirs = makeDocument({ ownerUserId: userB });
    await store.create(mine);
    await store.create(theirs);

    const mineList = await store.listByOwner(orgA, userA);
    expect(mineList).toHaveLength(1);
    expect(mineList[0].id).toBe(mine.id);
  });

  it("finds by organization and sha256 for dedupe", async () => {
    const store = new InMemoryDocumentStore();
    const sha = "c".repeat(64);
    const doc = makeDocument({ sha256: sha });
    await store.create(doc);

    await expect(
      store.findByOrganizationAndSha256(orgA, sha),
    ).resolves.toMatchObject({ id: doc.id });
    await expect(
      store.findByOrganizationAndSha256(orgB, sha),
    ).resolves.toBeUndefined();
  });

  it("soft-deletes a document and excludes it from reads", async () => {
    const store = new InMemoryDocumentStore();
    const doc = makeDocument();
    await store.create(doc);

    await store.delete(doc.id);

    await expect(
      store.findByIdForOrganization(doc.id, orgA),
    ).resolves.toBeUndefined();
    await expect(
      store.findByOrganizationAndSha256(orgA, doc.sha256),
    ).resolves.toBeUndefined();
    expect((await store.listByOrganization(orgA)).length).toBe(0);
  });
});

describe("InMemoryDocumentChunkStore", () => {
  it("lists chunks ordered by sequence", async () => {
    const store = new InMemoryDocumentChunkStore();
    const docId = randomUUID() as DocumentId;
    await store.createMany([
      makeChunk(docId, 2),
      makeChunk(docId, 1),
      makeChunk(docId, 3),
    ]);

    const chunks = await store.listByDocument(docId);
    expect(chunks.map((c) => c.sequence)).toEqual([1, 2, 3]);
  });

  it("finds a chunk scoped to its organization", async () => {
    const store = new InMemoryDocumentChunkStore();
    const docId = randomUUID() as DocumentId;
    const chunk = makeChunk(docId, 1);
    await store.createMany([chunk]);

    await expect(
      store.findByIdForOrganization(chunk.id, orgA),
    ).resolves.toMatchObject({ id: chunk.id });
    await expect(
      store.findByIdForOrganization(chunk.id, orgB),
    ).resolves.toBeUndefined();
  });

  it("deletes all chunks for a document", async () => {
    const store = new InMemoryDocumentChunkStore();
    const docId = randomUUID() as DocumentId;
    const otherDocId = randomUUID() as DocumentId;
    await store.createMany([
      makeChunk(docId, 1),
      makeChunk(docId, 2),
      makeChunk(otherDocId, 1),
    ]);

    await store.deleteByDocument(docId);

    expect(await store.listByDocument(docId)).toHaveLength(0);
    expect(await store.listByDocument(otherDocId)).toHaveLength(1);
  });
});
