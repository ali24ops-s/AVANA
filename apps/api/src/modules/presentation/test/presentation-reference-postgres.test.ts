/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql, eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  organizations,
  users,
  documents,
  documentChunks,
  presentationProjects,
  presentationReferences,
} from "@avana/database/schema";
import {
  asDocumentId,
  asPresentationProjectId,
} from "@avana/domain";
import {
  DrizzlePresentationReferenceStore,
} from "../drizzle-presentation-store.js";

describe("DrizzlePresentationReferenceStore PostgreSQL Integration", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  let client: ReturnType<typeof createDbClient>;
  let refStore: DrizzlePresentationReferenceStore;
  let isConnected = false;

  const testOrgId = randomUUID();
  const testUserId = randomUUID();

  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;
      refStore = new DrizzlePresentationReferenceStore(client.db);

      // Seed organization and user
      await client.db.insert(organizations).values({
        id: testOrgId,
        name: "Pres Ref Postgres Org",
        slug: `pres-ref-pg-${Date.now()}`,
      });

      await client.db.insert(users).values({
        id: testUserId,
        email: `pres-ref-pg-${Date.now()}@avana.local`,
        name: "Pres Ref User",
      });
    } catch {
      isConnected = false;
    }
  });

  afterAll(async () => {
    if (client) {
      // Clean up test data
      await client.db
        .delete(organizations)
        .where(eq(organizations.id, testOrgId))
        .catch(() => {});
      await client.db
        .delete(users)
        .where(eq(users.id, testUserId))
        .catch(() => {});
      await client.close().catch(() => {});
    }
  });

  it("creates, finds, updates, and deletes references in real PostgreSQL", async (ctx) => {
    if (!isConnected) ctx.skip();

    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "Real PG Presentation Project",
    });

    // 1. Create reference
    const created = await refStore.create({
      projectId: asPresentationProjectId(projectId),
      type: "doi",
      title: "Cardiovascular Science 2024",
      sourceIdentifier: "10.1000/182",
      bibliographicMetadata: { journal: "Circulation", year: 2024 },
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("Cardiovascular Science 2024");
    expect(created.accessStatus).toBe("pending");
    expect(created.bibliographicMetadata.journal).toBe("Circulation");

    // 2. Find by ID and Project ID
    const fetched = await refStore.findById(
      created.id,
      asPresentationProjectId(projectId),
    );
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.sourceIdentifier).toBe("10.1000/182");

    // 3. Find list by Project ID
    const list = await refStore.findByProjectId(
      asPresentationProjectId(projectId),
    );
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);

    // 4. Update reference
    const updated = await refStore.update(
      created.id,
      asPresentationProjectId(projectId),
      {
        title: "Cardiovascular Science 2024 (Updated)",
        bibliographicMetadata: { journal: "Circulation", year: 2024, volume: 150 },
      },
    );
    expect(updated.title).toBe("Cardiovascular Science 2024 (Updated)");
    expect(updated.bibliographicMetadata.volume).toBe(150);

    // 5. Update access status
    const statusUpdated = await refStore.updateAccessStatus(
      created.id,
      asPresentationProjectId(projectId),
      "full_text_available",
    );
    expect(statusUpdated.accessStatus).toBe("full_text_available");

    // 6. Delete reference
    const deleted = await refStore.delete(
      created.id,
      asPresentationProjectId(projectId),
    );
    expect(deleted).toBe(true);

    const postDelete = await refStore.findById(
      created.id,
      asPresentationProjectId(projectId),
    );
    expect(postDelete).toBeNull();
  });

  it("enforces atomic duplicate prevention under PostgreSQL row lock for concurrent Create calls", async (ctx) => {
    if (!isConnected) ctx.skip();

    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "Atomic Lock Test Project",
    });

    const candidate = {
      projectId: asPresentationProjectId(projectId),
      type: "doi" as const,
      title: "Atomic Article",
      sourceIdentifier: "10.1038/s41586-024-pg01",
    };

    // Parallel execution across concurrent PostgreSQL pool connections
    const results = await Promise.allSettled([
      refStore.create(candidate),
      refStore.create({
        ...candidate,
        sourceIdentifier: "https://doi.org/10.1038/s41586-024-pg01",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error.message).toMatch(/duplicate reference/i);

    // Direct database verification: exactly 1 row in PostgreSQL
    const directRows = await client.db
      .select()
      .from(presentationReferences)
      .where(eq(presentationReferences.projectId, projectId));

    expect(directRows.length).toBe(1);
  });

  it("enforces atomic serialization between concurrent Create and Update in PostgreSQL", async (ctx) => {
    if (!isConnected) ctx.skip();

    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "Concurrent Create vs Update Project",
    });

    // Seed two distinct references A and B
    await refStore.create({
      projectId: asPresentationProjectId(projectId),
      type: "doi",
      title: "Existing Reference A",
      sourceIdentifier: "10.1001/jama.2024.001",
    });

    const refB = await refStore.create({
      projectId: asPresentationProjectId(projectId),
      type: "doi",
      title: "Existing Reference B",
      sourceIdentifier: "10.1001/jama.2024.002",
    });

    const targetDoi = "10.1001/jama.2024.SHARED_TARGET";

    // Concurrently:
    // Tx 1: Create a NEW reference with targetDoi
    // Tx 2: Update refB to targetDoi
    const [resCreate, resUpdate] = await Promise.allSettled([
      refStore.create({
        projectId: asPresentationProjectId(projectId),
        type: "doi",
        title: "Concurrent New Ref",
        sourceIdentifier: targetDoi,
      }),
      refStore.update(
        refB.id,
        asPresentationProjectId(projectId),
        {
          sourceIdentifier: targetDoi,
        },
      ),
    ]);

    const fulfilled = [resCreate, resUpdate].filter((r) => r.status === "fulfilled");
    const rejected = [resCreate, resUpdate].filter((r) => r.status === "rejected");

    // Exactly one operation must succeed, and exactly one must fail with conflict
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error.message).toMatch(/duplicate reference/i);

    // Direct PostgreSQL query verification: Exactly one reference with targetDoi exists
    const matchingRows = await client.db
      .select()
      .from(presentationReferences)
      .where(
        and(
          eq(presentationReferences.projectId, projectId),
          eq(presentationReferences.sourceIdentifier, targetDoi),
        ),
      );

    expect(matchingRows.length).toBe(1);
  });

  it("enforces atomic serialization between concurrent Update and Update in PostgreSQL", async (ctx) => {
    if (!isConnected) ctx.skip();

    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "Concurrent Update vs Update Project",
    });

    // Seed two distinct references
    const ref1 = await refStore.create({
      projectId: asPresentationProjectId(projectId),
      type: "pubmed",
      title: "Article 1",
      sourceIdentifier: "11111111",
    });

    const ref2 = await refStore.create({
      projectId: asPresentationProjectId(projectId),
      type: "pubmed",
      title: "Article 2",
      sourceIdentifier: "22222222",
    });

    const commonPmid = "33333333";

    // Concurrently update both references to the exact same PMID
    const [res1, res2] = await Promise.allSettled([
      refStore.update(ref1.id, asPresentationProjectId(projectId), {
        sourceIdentifier: commonPmid,
      }),
      refStore.update(ref2.id, asPresentationProjectId(projectId), {
        sourceIdentifier: commonPmid,
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejected = [res1, res2].filter((r) => r.status === "rejected");

    // Exactly one update must succeed, and exactly one must fail with conflict
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error.message).toMatch(/duplicate reference/i);

    // Direct PostgreSQL query: exactly one reference in DB with commonPmid
    const matchingRows = await client.db
      .select()
      .from(presentationReferences)
      .where(
        and(
          eq(presentationReferences.projectId, projectId),
          eq(presentationReferences.sourceIdentifier, commonPmid),
        ),
      );

    expect(matchingRows.length).toBe(1);
  });

  it("strictly isolates queries between projects in PostgreSQL", async (ctx) => {
    if (!isConnected) ctx.skip();

    const projA = randomUUID();
    const projB = randomUUID();

    await client.db.insert(presentationProjects).values([
      {
        id: projA,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "Project Alpha",
      },
      {
        id: projB,
        organizationId: testOrgId,
        ownerUserId: testUserId,
        title: "Project Beta",
      },
    ]);

    const refA = await refStore.create({
      projectId: asPresentationProjectId(projA),
      type: "text",
      title: "Secret Alpha Reference",
    });

    // Querying refA with projB must return null
    const crossQuery = await refStore.findById(
      refA.id,
      asPresentationProjectId(projB),
    );
    expect(crossQuery).toBeNull();

    // Updating refA with projB must throw not_found
    await expect(
      refStore.update(refA.id, asPresentationProjectId(projB), {
        title: "Hacked",
      }),
    ).rejects.toThrow("Presentation reference not found");

    // Deleting refA with projB must return false and leave refA intact
    const crossDelete = await refStore.delete(
      refA.id,
      asPresentationProjectId(projB),
    );
    expect(crossDelete).toBe(false);

    const checkA = await refStore.findById(
      refA.id,
      asPresentationProjectId(projA),
    );
    expect(checkA).not.toBeNull();
  });

  it("guarantees documents and document_chunks are never deleted when reference is deleted in PostgreSQL", async (ctx) => {
    if (!isConnected) ctx.skip();

    const projectId = randomUUID();
    await client.db.insert(presentationProjects).values({
      id: projectId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      title: "Doc Retention Test Project",
    });

    const docId = randomUUID();
    await client.db.insert(documents).values({
      id: docId,
      organizationId: testOrgId,
      ownerUserId: testUserId,
      originalName: "Never_Deleted_Doc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8_000_000,
      storageKey: `docs/${testOrgId}/${docId}/Never_Deleted_Doc.pdf`,
      sha256: "99887766554433221100aabbccddeeff99887766554433221100aabbccddeeff",
      status: "ready",
    });

    const chunkId = randomUUID();
    await client.db.insert(documentChunks).values({
      id: chunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 1,
      heading: "Crucial Section",
      content: "This content must survive reference deletion.",
      contentHash: "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
    });

    // Create reference pointing to docId
    const ref = await refStore.create({
      projectId: asPresentationProjectId(projectId),
      type: "pdf",
      title: "Doc Reference",
      documentId: asDocumentId(docId),
    });

    // Delete reference
    const deleted = await refStore.delete(
      ref.id,
      asPresentationProjectId(projectId),
    );
    expect(deleted).toBe(true);

    // Verify documents row in Postgres
    const [docRow] = await client.db
      .select()
      .from(documents)
      .where(eq(documents.id, docId));
    expect(docRow).toBeDefined();
    expect(docRow.originalName).toBe("Never_Deleted_Doc.pdf");

    // Verify document_chunks row in Postgres
    const [chunkRow] = await client.db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.id, chunkId));
    expect(chunkRow).toBeDefined();
    expect(chunkRow.heading).toBe("Crucial Section");
  });
});
