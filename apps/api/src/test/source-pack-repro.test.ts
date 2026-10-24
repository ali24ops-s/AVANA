import { describe, it, expect } from "vitest";
import { loadApiConfig } from "../config.js";
import { createApp } from "../server/createApp.js";
import { composeLocalDev } from "../server/composeLocalDev.js";
import { v1Routes } from "../routes/v1.js";
import { SessionService } from "../modules/identity/session-service.js";
import { asOrganizationId, asCourseId, asDocumentId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Source Pack Repro Test with composeLocalDev", () => {
  it("tests full source pack lifecycle and verifies no 500 Internal Server Error occurs", async () => {
    const config = loadApiConfig();
    const { v1Options } = await composeLocalDev(config);
    const app = createApp({ config });
    await app.register(v1Routes, v1Options);

    // 1. Create User
    const user = await v1Options.userStore.createUserWithPassword({
      email: "test-admin@avana.test",
      passwordHash: "hash123",
      name: "Admin Tester",
      globalRole: "platform_admin",
    });

    const sessionService = new SessionService(v1Options.sessionStore, config.session);
    const session = await sessionService.createSession(user.id);

    // 2. Create Organization and add membership
    const orgId = asOrganizationId("00000000-0000-0000-0000-000000000001");
    await v1Options.organizationStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Test Organization",
        slug: "test-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      membership: {
        id: randomUUID() as any,
        organizationId: orgId,
        userId: user.id,
        role: "admin",
        createdAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // 3. Create Course
    const courseId = asCourseId("00000000-0000-0000-0000-000000000002");
    await v1Options.courseStore!.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "Test Course",
        description: "Test Course Description",
        status: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 4. Test List Source Packs
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    });
    expect(listRes.statusCode).toBe(200);
    const initialList = JSON.parse(listRes.body);
    expect(initialList.source_packs).toEqual([]);

    // 5. Create Documents and Chunks for pack
    const doc1Id = asDocumentId("00000000-0000-0000-0000-000000000011");
    const doc2Id = asDocumentId("00000000-0000-0000-0000-000000000012");

    await v1Options.documentStore!.create({
      id: doc1Id,
      organizationId: orgId,
      courseId,
      ownerUserId: user.id,
      originalName: "Test Doc 1.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "sha1",
      storageKey: "storage1",
      status: "ready",
      pageCount: 2,
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await v1Options.documentStore!.create({
      id: doc2Id,
      organizationId: orgId,
      courseId,
      ownerUserId: user.id,
      originalName: "Test Doc 2.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "sha2",
      storageKey: "storage2",
      status: "ready",
      pageCount: 3,
      errorCode: null,
      retryCount: 0,
      qualityScore: null,
      qualityLevel: null,
      qualityReport: null,
      qualityAnalyzedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Add chunks so estimateCost won't fail
    if (v1Options.documentChunkStore?.createMany) {
      await v1Options.documentChunkStore.createMany([
        {
          id: randomUUID() as any,
          documentId: doc1Id,
          chunkIndex: 0,
          content: "Content for doc 1 chunk",
          tokenEstimate: 50,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
        {
          id: randomUUID() as any,
          documentId: doc2Id,
          chunkIndex: 0,
          content: "Content for doc 2 chunk",
          tokenEstimate: 70,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    // 6. Create Source Pack
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs`,
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
      payload: {
        title: "پک فارماکولوژی",
        documents: [
          { document_id: doc1Id, role: "primary_notes" },
          { document_id: doc2Id, role: "supplementary_reference" },
        ],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdPack = JSON.parse(createRes.body).source_pack;
    expect(createdPack.title).toBe("پک فارماکولوژی");
    expect(createdPack.documents).toHaveLength(2);

    // 7. Get Pack by ID
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${createdPack.id}`,
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).source_pack.id).toBe(createdPack.id);

    // 8. Patch Pack
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${createdPack.id}`,
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
      payload: {
        title: "پک فارماکولوژی ویرایش شده",
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(JSON.parse(patchRes.body).source_pack.title).toBe("پک فارماکولوژی ویرایش شده");

    // 9. Estimate cost
    const estimateRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${createdPack.id}/estimate-cost`,
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    });
    console.log("estimateRes status:", estimateRes.statusCode, "body:", estimateRes.body);
    expect(estimateRes.statusCode).toBe(200);

    // 10. Generate from pack
    const generateRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/source-packs/${createdPack.id}/generate`,
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
      payload: {
        types: ["lesson", "flashcard", "quiz", "review_summary"],
      },
    });
    console.log("generateRes status:", generateRes.statusCode, "body:", generateRes.body);
    expect(generateRes.statusCode).toBe(202);
  });
});
