/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import fastify from "fastify";
import type {
  Actor,
  DocumentChunkId,
  DocumentId,
  OrganizationId,
  PresentationProjectId,
  PresentationProjectRecord,
  PresentationReferenceType,
  UserId,
} from "@avana/domain";
import {
  InMemoryPresentationReferenceStore,
  InMemoryPresentationProjectStore,
} from "../in-memory-presentation-store.js";
import { PresentationReferenceService } from "../presentation-reference-service.js";
import { presentationReferenceRoutes } from "../presentation-reference-routes.js";
import { InMemoryOrganizationStore } from "../../organizations/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../../learning/test/in-memory-stores.js";
import { errorHandlerPlugin } from "../../../http/errorHandler.js";

describe("Presentation Reference Service & Data Layer", () => {
  let referenceStore: InMemoryPresentationReferenceStore;
  let projectStore: InMemoryPresentationProjectStore;
  let orgStore: InMemoryOrganizationStore;
  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let service: PresentationReferenceService;

  const testOrgId = randomUUID() as OrganizationId;
  const otherOrgId = randomUUID() as OrganizationId;
  const ownerUserId = randomUUID() as UserId;
  const strangerUserId = randomUUID() as UserId;
  const adminUserId = randomUUID() as UserId;

  const ownerActor: Actor = {
    userId: ownerUserId,
    role: "student",
    memberships: [{ organizationId: testOrgId, role: "student" }],
  };

  const adminActor: Actor = {
    userId: adminUserId,
    role: "organization_admin",
    memberships: [{ organizationId: testOrgId, role: "organization_admin" }],
  };

  const strangerActor: Actor = {
    userId: strangerUserId,
    role: "student",
    memberships: [{ organizationId: otherOrgId, role: "student" }],
  };

  const sameOrgStudentActor: Actor = {
    userId: randomUUID() as UserId,
    role: "student",
    memberships: [{ organizationId: testOrgId, role: "student" }],
  };

  let testProjectId: PresentationProjectId;
  let otherProjectId: PresentationProjectId;

  beforeEach(() => {
    referenceStore = new InMemoryPresentationReferenceStore();
    projectStore = new InMemoryPresentationProjectStore();
    orgStore = new InMemoryOrganizationStore();
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();

    // Register organizations
    orgStore.createWithAdminMembership({
      organization: {
        id: testOrgId,
        name: "Test Org",
        slug: "test-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: testOrgId,
        userId: adminUserId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: testOrgId,
      userId: ownerUserId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: testOrgId,
      userId: sameOrgStudentActor.userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.createWithAdminMembership({
      organization: {
        id: otherOrgId,
        name: "Other Org",
        slug: "other-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: otherOrgId,
        userId: strangerUserId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    testProjectId = randomUUID() as PresentationProjectId;
    const projectRecord: PresentationProjectRecord = {
      id: testProjectId,
      organizationId: testOrgId,
      ownerUserId,
      title: "Cardiac Pathology Presentation",
      pptxDocumentId: null,
      targetDurationMinutes: 15,
      academicLevel: "intermediate",
      tone: "formal_scientific",
      elaborationDepth: "balanced",
      status: "created",
      currentStage: null,
      totalSlides: 0,
      overallIntroduction: null,
      overallConclusion: null,
      totalEstimatedSeconds: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    projectStore.seed(projectRecord);

    otherProjectId = randomUUID() as PresentationProjectId;
    projectStore.seed({
      ...projectRecord,
      id: otherProjectId,
      organizationId: otherOrgId,
      ownerUserId: strangerUserId,
      title: "Other Tenant Project",
    });

    service = new PresentationReferenceService({
      referenceStore,
      projectStore,
      organizationStore: orgStore,
      documentStore: docStore,
    });
  });

  // 1. ایجاد Reference معتبر
  it("Scenario 1: creates valid presentation references for multiple types", async () => {
    // 1.1 Text Reference
    const textRef = await service.addReference(ownerActor, testProjectId, {
      type: "text",
      title: "Lecture Notes Chapter 1",
      extractedContent: "Cardiac cycle phases and heart sounds.",
    });
    expect(textRef.id).toBeDefined();
    expect(textRef.projectId).toBe(testProjectId);
    expect(textRef.type).toBe("text");
    expect(textRef.title).toBe("Lecture Notes Chapter 1");
    expect(textRef.accessStatus).toBe("manual_text_provided");
    expect(textRef.extractedContent).toBe(
      "Cardiac cycle phases and heart sounds.",
    );

    // 1.2 DOI Reference
    const doiRef = await service.addReference(ownerActor, testProjectId, {
      type: "doi",
      title: "Myocardial Infarction Review",
      sourceIdentifier: "10.1016/j.cell.2023.01.001",
      bibliographicMetadata: {
        journal: "Cell",
        year: 2023,
        authors: ["Smith, J.", "Doe, A."],
      },
    });
    expect(doiRef.type).toBe("doi");
    expect(doiRef.sourceIdentifier).toBe("10.1016/j.cell.2023.01.001");
    expect(doiRef.accessStatus).toBe("pending");
    expect(doiRef.bibliographicMetadata.journal).toBe("Cell");

    // 1.3 URL Reference
    const urlRef = await service.addReference(ownerActor, testProjectId, {
      type: "url",
      title: "AHA Guidelines",
      sourceIdentifier: "https://www.heart.org/guidelines",
    });
    expect(urlRef.type).toBe("url");
    expect(urlRef.sourceIdentifier).toBe("https://www.heart.org/guidelines");

    // 1.4 PubMed Reference
    const pmidRef = await service.addReference(ownerActor, testProjectId, {
      type: "pubmed",
      title: "Arrhythmia Mechanisms",
      sourceIdentifier: "34567890",
    });
    expect(pmidRef.type).toBe("pubmed");
  });

  // 2. دریافت منابع پروژه
  it("Scenario 2: lists all references belonging to a presentation project", async () => {
    await service.addReference(ownerActor, testProjectId, {
      type: "text",
      title: "Reference 1",
    });
    await service.addReference(ownerActor, testProjectId, {
      type: "text",
      title: "Reference 2",
    });

    const list = await service.listReferences(ownerActor, testProjectId);
    expect(list.length).toBe(2);
    expect(list.every((r) => r.projectId === testProjectId)).toBe(true);
  });

  // 3. دریافت جزئیات Reference
  it("Scenario 3: retrieves reference details by referenceId", async () => {
    const created = await service.addReference(ownerActor, testProjectId, {
      type: "doi",
      title: "Specific Study",
      sourceIdentifier: "10.1056/NEJMoa2001",
      bibliographicMetadata: { year: 2021 },
    });

    const fetched = await service.getReference(
      ownerActor,
      testProjectId,
      created.id,
    );
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe("Specific Study");
    expect(fetched.bibliographicMetadata.year).toBe(2021);
  });

  // 4. ویرایش Reference
  it("Scenario 4: updates reference metadata and content safely", async () => {
    const created = await service.addReference(ownerActor, testProjectId, {
      type: "text",
      title: "Draft Title",
      extractedContent: "Initial draft.",
    });

    const updated = await service.updateReference(
      ownerActor,
      testProjectId,
      created.id,
      {
        title: "Finalized Title",
        extractedContent: "Updated comprehensive content.",
        bibliographicMetadata: { note: "verified" },
      },
    );

    expect(updated.title).toBe("Finalized Title");
    expect(updated.extractedContent).toBe("Updated comprehensive content.");
    expect(updated.bibliographicMetadata.note).toBe("verified");
    // accessStatus must remain untouched by general update
    expect(updated.accessStatus).toBe("manual_text_provided");
  });

  // 5. حذف Reference
  it("Scenario 5: deletes reference from project successfully", async () => {
    const created = await service.addReference(ownerActor, testProjectId, {
      type: "text",
      title: "To Be Deleted",
    });

    await service.deleteReference(ownerActor, testProjectId, created.id);

    await expect(
      service.getReference(ownerActor, testProjectId, created.id),
    ).rejects.toThrow("Presentation reference not found");
  });

  // 6. جلوگیری از دسترسی بین پروژه‌ای
  it("Scenario 6: prevents cross-project reference access and leakage", async () => {
    const refA = await service.addReference(ownerActor, testProjectId, {
      type: "text",
      title: "Private Project A Reference",
    });

    // Attempting to access refA via otherProjectId MUST throw 404
    await expect(
      service.getReference(strangerActor, otherProjectId, refA.id),
    ).rejects.toThrow("Presentation reference not found");

    // Attempting to update refA via otherProjectId MUST throw 404
    await expect(
      service.updateReference(strangerActor, otherProjectId, refA.id, {
        title: "Malicious Tamper",
      }),
    ).rejects.toThrow("Presentation reference not found");

    // Attempting to delete refA via otherProjectId MUST throw 404
    await expect(
      service.deleteReference(strangerActor, otherProjectId, refA.id),
    ).rejects.toThrow("Presentation reference not found");
  });

  // 7. جلوگیری از دسترسی کاربر غیرمجاز
  it("Scenario 7: enforces authorization and rejects unauthorized users", async () => {
    // 7.1 User from another tenant -> 404 non-disclosing
    await expect(
      service.listReferences(strangerActor, testProjectId),
    ).rejects.toThrow("Presentation project not found");

    // 7.2 Unauthorized student from same tenant trying to modify owner's project -> forbidden
    await expect(
      service.addReference(sameOrgStudentActor, testProjectId, {
        type: "text",
        title: "Unauthorized Insertion",
      }),
    ).rejects.toThrow("Role does not permit accessing this presentation project");

    // 7.3 Org Admin can access and add references
    const adminRef = await service.addReference(adminActor, testProjectId, {
      type: "text",
      title: "Admin Supervised Reference",
    });
    expect(adminRef.title).toBe("Admin Supervised Reference");
  });

  // 8. جلوگیری از ثبت تکراری
  it("Scenario 8: prevents duplicate references based on documentId, normalized sourceId, and type+title", async () => {
    // 8.1 Duplicate by normalized DOI (with prefix variations and whitespace)
    await service.addReference(ownerActor, testProjectId, {
      type: "doi",
      title: "Paper 1",
      sourceIdentifier: "10.1000/182",
    });

    await expect(
      service.addReference(ownerActor, testProjectId, {
        type: "doi",
        title: "Paper 1 Duplicate With Prefix",
        sourceIdentifier: "https://doi.org/10.1000/182",
      }),
    ).rejects.toThrow(
      "A duplicate reference already exists in this presentation project",
    );

    // 8.2 Duplicate by normalized URL
    await service.addReference(ownerActor, testProjectId, {
      type: "url",
      title: "Guideline URL",
      sourceIdentifier: "https://example.com/guideline",
    });

    await expect(
      service.addReference(ownerActor, testProjectId, {
        type: "url",
        title: "Different Title Same URL",
        sourceIdentifier: "https://EXAMPLE.com/guideline/",
      }),
    ).rejects.toThrow(
      "A duplicate reference already exists in this presentation project",
    );

    // 8.3 Duplicate text by normalized title
    await service.addReference(ownerActor, testProjectId, {
      type: "text",
      title: "Lecture Notes   Pathology  ",
    });

    await expect(
      service.addReference(ownerActor, testProjectId, {
        type: "text",
        title: "lecture notes pathology",
      }),
    ).rejects.toThrow(
      "A duplicate reference already exists in this presentation project",
    );
  });

  // 9. حفظ Document پس از حذف Reference
  it("Scenario 9: guarantees that deleting a reference leaves the shared document completely intact", async () => {
    const docId = randomUUID() as DocumentId;
    await docStore.create({
      id: docId,
      organizationId: testOrgId,
      courseId: null,
      ownerUserId,
      originalName: "Harrison_Internal_Medicine.pdf",
      mimeType: "application/pdf",
      sizeBytes: 15_000_000,
      sha256: "aabbcc112233",
      status: "ready",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const ref = await service.addReference(ownerActor, testProjectId, {
      type: "pdf",
      title: "Harrison Reference",
      documentId: docId,
    });

    // Delete the reference
    await service.deleteReference(ownerActor, testProjectId, ref.id);

    // The document record in docStore MUST still exist!
    const docAfterDelete = await docStore.findByIdForOrganization(
      docId,
      testOrgId,
    );
    expect(docAfterDelete).toBeDefined();
    expect(docAfterDelete?.originalName).toBe("Harrison_Internal_Medicine.pdf");
  });

  // 10. حفظ Chunkهای Document پس از حذف Reference
  it("Scenario 10: guarantees that document chunks are preserved when a reference is deleted", async () => {
    const docId = randomUUID() as DocumentId;
    await docStore.create({
      id: docId,
      organizationId: testOrgId,
      courseId: null,
      ownerUserId,
      originalName: "Biochemistry.pdf",
      mimeType: "application/pdf",
      sizeBytes: 20_000_000,
      sha256: "ffeedd443322",
      status: "ready",
      errorCode: null,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const chunkId = randomUUID();
    await chunkStore.create({
      id: chunkId as DocumentChunkId,
      documentId: docId,
      organizationId: testOrgId,
      sequence: 1,
      heading: "Glycolysis Pathway",
      content: "Glucose is converted into pyruvate.",
      startPage: 10,
      endPage: 12,
      tokenEstimate: 450,
      contentHash: "1234567890abcdef",
      createdAt: new Date().toISOString(),
    });

    const ref = await service.addReference(ownerActor, testProjectId, {
      type: "pdf",
      title: "Biochemistry Textbook",
      documentId: docId,
    });

    // Delete the reference
    await service.deleteReference(ownerActor, testProjectId, ref.id);

    // Document chunks MUST remain intact
    const chunks = await chunkStore.listByDocument(docId);
    expect(chunks.length).toBe(1);
    expect(chunks[0].heading).toBe("Glycolysis Pathway");
  });

  // 11. کنترل ورودی‌های نامعتبر
  it("Scenario 11: validates inputs and rejects invalid fields, lengths, and enums", async () => {
    // 11.1 Empty title
    await expect(
      service.addReference(ownerActor, testProjectId, {
        type: "text",
        title: "   ",
      }),
    ).rejects.toThrow("Reference title cannot be empty");

    // 11.2 Oversized title (> 500 chars)
    const longTitle = "A".repeat(501);
    await expect(
      service.addReference(ownerActor, testProjectId, {
        type: "text",
        title: longTitle,
      }),
    ).rejects.toThrow("Reference title must not exceed 500 characters");

    // 11.3 Oversized sourceIdentifier (> 2000 chars)
    const longSourceId = "https://example.com/" + "x".repeat(2000);
    await expect(
      service.addReference(ownerActor, testProjectId, {
        type: "url",
        title: "Long URL",
        sourceIdentifier: longSourceId,
      }),
    ).rejects.toThrow("Source identifier must not exceed 2000 characters");

    // 11.4 Invalid type
    await expect(
      service.addReference(ownerActor, testProjectId, {
        type: "invalid_type" as unknown as PresentationReferenceType,
        title: "Invalid Type Ref",
      }),
    ).rejects.toThrow("Invalid presentation reference type");
  });

  // 12. کنترل درخواست‌های همزمان (Concurrency)
  it("Scenario 12: handles concurrent requests and ensures only one duplicate succeeds", async () => {
    const payload = {
      type: "doi" as const,
      title: "Concurrent Target Paper",
      sourceIdentifier: "10.1038/s41586-024-0001",
    };

    // Execute two simultaneous additions of the exact same reference
    const results = await Promise.allSettled([
      service.addReference(ownerActor, testProjectId, payload),
      service.addReference(ownerActor, testProjectId, payload),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly 1 must succeed and exactly 1 must be rejected due to conflict
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error.message).toContain(
      "A duplicate reference already exists in this presentation project",
    );
  });

  // 13. End-to-End API Routes Verification
  describe("API Routes (Fastify)", () => {
    let app: ReturnType<typeof fastify>;

    beforeEach(async () => {
      app = fastify();
      await app.register(errorHandlerPlugin);

      // Dummy session and user stores for test auth
      const mockSessionService = {
        validateSession: async () => ({
          userId: ownerUserId,
          role: "student",
          globalRole: null,
        }),
        validateSessionDetails: async () => ({
          valid: true,
          revoked: false,
          user: {
            id: ownerUserId,
            userId: ownerUserId,
            role: "student",
            globalRole: null,
          },
        }),
        getConfig: () => ({}),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["sessionService"];

      const mockUserStore = {
        findById: async () => ({
          id: ownerUserId,
          role: "student",
          globalRole: null,
        }),
      } as unknown as import("../../../http/authMiddleware.js").AuthMiddlewareDeps["userStore"];

      await app.register(presentationReferenceRoutes, {
        service,
        sessionService: mockSessionService,
        userStore: mockUserStore,
      });
      await app.ready();
    });

    it("POST /v1/presentation/projects/:projectId/references adds reference via HTTP", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/v1/presentation/projects/${testProjectId}/references`,
        headers: { authorization: "Bearer valid-token" },
        payload: {
          type: "text",
          title: "HTTP Created Reference",
          extracted_content: "Some content here",
        },
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.reference.title).toBe("HTTP Created Reference");
      expect(data.reference.project_id).toBe(testProjectId);
    });

    it("GET /v1/presentation/projects/:projectId/references returns list", async () => {
      await service.addReference(ownerActor, testProjectId, {
        type: "text",
        title: "Item 1",
      });

      const response = await app.inject({
        method: "GET",
        url: `/v1/presentation/projects/${testProjectId}/references`,
        headers: { authorization: "Bearer valid-token" },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.items.length).toBeGreaterThanOrEqual(1);
      expect(data.total).toBe(data.items.length);
    });

    it("PATCH and DELETE endpoints work correctly", async () => {
      const ref = await service.addReference(ownerActor, testProjectId, {
        type: "text",
        title: "Before Patch",
      });

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/presentation/projects/${testProjectId}/references/${ref.id}`,
        headers: { authorization: "Bearer valid-token" },
        payload: { title: "After Patch" },
      });

      expect(patchRes.statusCode).toBe(200);
      expect(patchRes.json().reference.title).toBe("After Patch");

      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/v1/presentation/projects/${testProjectId}/references/${ref.id}`,
        headers: { authorization: "Bearer valid-token" },
      });

      expect(deleteRes.statusCode).toBe(204);
    });
  });
});
