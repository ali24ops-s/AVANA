/**
 * Comprehensive Test Suite for Content-Based (SHA-256) File Deduplication in AVANA.
 *
 * Covers all required acceptance scenarios:
 * 1. Initial upload of a file.
 * 2. Re-upload of the exact same file with the same name.
 * 3. Upload of identical content with a different name.
 * 4. Upload of different content with the exact same name.
 * 5. Upload of identical content with a different extension.
 * 6. Reuse attempt by another user who lacks access permission to the previous file.
 * 7. Two concurrent upload requests for the same file (Race Condition prevention).
 * 8. Ensuring the previous file, storage content, chunks, and drafts are not harmed/deleted.
 * 9. Successful continuation of downstream processes (extraction, listing, source pack creation)
 *    identically for both fresh uploads and reused uploads.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type CourseId,
  type DocumentId,
  type DocumentChunkId,
  type GeneratedContentId,
  defaultPolicy,
} from "@avana/domain";
import { DocumentService } from "../modules/documents/document-service.js";
import { DocumentProcessingService } from "../modules/documents/document-processing-service.js";
import { SourcePackService } from "../modules/source-packs/source-pack-service.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemorySourcePackStore } from "../modules/source-packs/in-memory-source-pack-store.js";
import type { StorageProvider } from "../modules/storage/storage-provider.js";

class TrackableFakeStorageProvider implements StorageProvider {
  public files = new Map<string, Buffer>();
  public saveCallCount = 0;
  public deleteCallCount = 0;

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<{ storageKey: string; uploadUrl: string | null; expiresAt: string }> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date().toISOString(),
    };
  }

  async save(options: { storageKey: string; data: Buffer; mimeType?: string }): Promise<void> {
    this.saveCallCount++;
    this.files.set(options.storageKey, options.data);
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error(`Not found in storage: ${storageKey}`);
    return data;
  }

  async delete(storageKey: string): Promise<void> {
    this.deleteCallCount++;
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }
}

describe("AVANA Content-Based File Deduplication Suite (SHA-256)", () => {
  const orgAId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const orgBId = "00000000-0000-0000-0000-000000000002" as OrganizationId;

  const course1Id = "11111111-1111-1111-1111-111111111111" as CourseId;
  const course2Id = "22222222-2222-2222-2222-222222222222" as CourseId;

  const adminActor: Actor = {
    userId: "admin-user",
    role: "organization_admin",
    globalRole: "platform_admin",
    memberships: [{ organizationId: orgAId, role: "organization_admin" }],
  };

  const studentUser1: Actor = {
    userId: "student-user-1",
    role: "student",
    memberships: [{ organizationId: orgAId, role: "student" }],
  };

  const studentUser2: Actor = {
    userId: "student-user-2",
    role: "student",
    memberships: [{ organizationId: orgAId, role: "student" }],
  };

  const orgBActor: Actor = {
    userId: "org-b-user",
    role: "organization_admin",
    memberships: [{ organizationId: orgBId, role: "organization_admin" }],
  };

  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let orgStore: InMemoryOrganizationStore;
  let genContentStore: InMemoryGeneratedContentStore;
  let sourcePackStore: InMemorySourcePackStore;
  let storage: TrackableFakeStorageProvider;
  let docService: DocumentService;
  let processingService: DocumentProcessingService;
  let sourcePackService: SourcePackService;

  // Authentic test buffers
  const pdfBytesAlpha = Buffer.from("%PDF-1.4 sample persian pharmacology content alpha");
  const pdfBytesBeta = Buffer.from("%PDF-1.4 completely different content beta");

  beforeEach(async () => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    orgStore = new InMemoryOrganizationStore();
    genContentStore = new InMemoryGeneratedContentStore();
    sourcePackStore = new InMemorySourcePackStore();
    storage = new TrackableFakeStorageProvider();

    // Seed org A & org B
    orgStore.createWithAdminMembership({
      organization: {
        id: orgAId,
        name: "Organization A",
        slug: "org-a",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgAId,
        userId: adminActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    orgStore.createWithAdminMembership({
      organization: {
        id: orgBId,
        name: "Organization B",
        slug: "org-b",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgBId,
        userId: orgBActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Add student memberships in Org A
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgAId,
      userId: studentUser1.userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgAId,
      userId: studentUser2.userId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed Course 1 and Course 2 in Org A
    await courseStore.create({
      course: {
        id: course1Id,
        organizationId: orgAId,
        name: "دوره فارماکولوژی",
        description: null,
        subject: "پزشکی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: false,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: course2Id,
        organizationId: orgAId,
        name: "دوره فیزیولوژی",
        description: null,
        subject: "پزشکی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: false,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    processingService = new DocumentProcessingService(
      docStore,
      chunkStore,
      storage,
      defaultPolicy,
      undefined,
      orgStore,
    );

    docService = new DocumentService(
      docStore,
      storage,
      orgStore,
      defaultPolicy,
      undefined,
      chunkStore,
      genContentStore,
      undefined,
      undefined,
      undefined,
      courseStore,
      moduleStore,
      lessonStore,
    );

    sourcePackService = new SourcePackService({
      store: sourcePackStore,
      documentStore: docStore,
      courseStore,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Initial upload of a file
  // ---------------------------------------------------------------------------
  it("Scenario 1: Initial upload persists file to storage and creates a new document record", async () => {
    const res = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "pharmacology_lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });

    expect(res.duplicate).toBe(false);
    expect(res.document.id).toBeDefined();
    expect(res.document.original_name).toBe("pharmacology_lecture.pdf");
    expect(res.document.course_id).toBe(course1Id);
    expect(res.document.status).toBe("uploaded");
    expect(storage.saveCallCount).toBe(1);
    expect(storage.files.size).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 2. Re-upload of the exact same file with the same name
  // ---------------------------------------------------------------------------
  it("Scenario 2: Re-uploading exact same file with same name reuses previous file without storage write or error", async () => {
    const initial = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "pharmacology_lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });
    expect(initial.duplicate).toBe(false);
    expect(storage.saveCallCount).toBe(1);

    // Second upload: exact same file, exact same name
    const reupload = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "pharmacology_lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });

    expect(reupload.duplicate).toBe(true);
    expect(reupload.document.id).toBe(initial.document.id);
    expect(reupload.document.sha256).toBe(initial.document.sha256);
    // Storage must NOT be written again
    expect(storage.saveCallCount).toBe(1);
    expect(storage.files.size).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Upload of identical content with a different name
  // ---------------------------------------------------------------------------
  it("Scenario 3: Uploading identical content with a different name reuses previous file and preserves ID", async () => {
    const first = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "pharmacology_lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });

    const second = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "different_filename_entirely.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });

    expect(second.duplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);
    // Storage count remains 1
    expect(storage.saveCallCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Upload of different content with the exact same name
  // ---------------------------------------------------------------------------
  it("Scenario 4: Two files with identical names but different content are treated as distinct independent files", async () => {
    const docAlpha = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });
    expect(docAlpha.duplicate).toBe(false);

    const docBeta = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "notes.pdf", // Same name, different content
      mimeType: "application/pdf",
      sizeBytes: pdfBytesBeta.length,
      data: pdfBytesBeta,
      courseId: course1Id,
    });
    expect(docBeta.duplicate).toBe(false);

    expect(docBeta.document.id).not.toBe(docAlpha.document.id);
    expect(docBeta.document.sha256).not.toBe(docAlpha.document.sha256);
    expect(storage.saveCallCount).toBe(2);
    expect(storage.files.size).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 5. Upload of identical content with a different extension
  // ---------------------------------------------------------------------------
  it("Scenario 5: Uploading same content with different extension/mime type reuses previous file based on content hash", async () => {
    const first = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
    });

    const second = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "lecture.docx", // Different extension, same content bytes
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
    });

    expect(second.duplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);
    expect(storage.saveCallCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6. Reuse attempt by another user who lacks access permission
  // ---------------------------------------------------------------------------
  it("Scenario 6: Cross-organization user cannot reuse, access, or detect files from another organization", async () => {
    // Org A uploads the file
    const docInOrgA = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "confidential_org_a.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
    });

    // Actor in Org B uploads identical file to Org B
    const docInOrgB = await docService.confirmUpload(orgBActor, orgBId, {
      originalName: "confidential_org_b.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
    });

    // Org B must create its own independent document record scoped to Org B
    expect(docInOrgB.duplicate).toBe(false);
    expect(docInOrgB.document.organization_id).toBe(orgBId);
    expect(docInOrgB.document.id).not.toBe(docInOrgA.document.id);

    // Org B actor attempting to get Org A document directly receives non-disclosing 404
    await expect(
      docService.getDocument(orgBActor, orgAId, docInOrgA.document.id as DocumentId),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("Scenario 6 (Part 2): Unauthorized user without access rights is denied reuse without leaking data", async () => {
    // Student 1 uploads a private unassigned document
    const student1Upload = await docService.confirmUpload(studentUser1, orgAId, {
      originalName: "student1_private_notes.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: undefined,
    });
    expect(student1Upload.document.owner_user_id).toBe(studentUser1.userId);

    // Outsider actor has NO membership
    const unprivilegedActor: Actor = {
      userId: "unauthorized-outsider",
      role: "student",
      memberships: [], // No tenant membership
    };

    await expect(
      docService.confirmUpload(unprivilegedActor, orgAId, {
        originalName: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  // ---------------------------------------------------------------------------
  // 7. Concurrent upload requests for the same file (Race Condition)
  // ---------------------------------------------------------------------------
  it("Scenario 7: Concurrent duplicate uploads resolve race condition gracefully without duplicate storage or crash", async () => {
    // Fire two identical upload promises simultaneously
    const [uploadA, uploadB] = await Promise.all([
      docService.confirmUpload(adminActor, orgAId, {
        originalName: "concurrent_file.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
        courseId: course1Id,
      }),
      docService.confirmUpload(adminActor, orgAId, {
        originalName: "concurrent_file.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
        courseId: course1Id,
      }),
    ]);

    // Both must succeed
    expect(uploadA.document).toBeDefined();
    expect(uploadB.document).toBeDefined();
    // Both resolve to the same canonical document ID
    expect(uploadA.document.id).toBe(uploadB.document.id);
    // Exactly one is duplicate: false, one is duplicate: true
    const duplicates = [uploadA.duplicate, uploadB.duplicate];
    expect(duplicates).toContain(false);
    expect(duplicates).toContain(true);
    // Exactly one file preserved in storage
    expect(storage.files.size).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 8. Ensuring the previous file, storage content, chunks, and drafts are unharmed
  // ---------------------------------------------------------------------------
  it("Scenario 8: Re-uploading does not damage previous physical file, chunks, drafts, or course associations", async () => {
    // 1. Initial upload
    const uploadRes = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "pharmacology_ch1.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });
    const docId = uploadRes.document.id as DocumentId;

    // 2. Simulate extraction and chunk creation
    await processingService.processDocument(adminActor, orgAId, docId);
    const chunksAfterInitial = await chunkStore.listByDocument(docId);
    expect(chunksAfterInitial.length).toBeGreaterThan(0);

    // 3. Simulate existing generated content draft for this document
    const draftId = randomUUID();
    await genContentStore.create({
      id: draftId as GeneratedContentId,
      organizationId: orgAId,
      documentId: docId,
      courseId: course1Id,
      type: "lesson",
      title: "درس فارماکولوژی",
      contentMarkdown: "# محتوای تولیدشده اولیه",
      status: "draft",
      sourceChunkIds: [chunksAfterInitial[0].id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Mark document as ready
    const storedDoc = await docStore.findByIdForOrganization(docId, orgAId);
    await docStore.update({ ...storedDoc!, status: "ready" });

    // 4. User re-uploads the exact same file in Course 1 or without course
    const reuploadRes = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "pharmacology_ch1.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });

    expect(reuploadRes.duplicate).toBe(true);
    expect(reuploadRes.document.id).toBe(docId);

    // 5. Automatic extraction trigger on duplicate
    await processingService.processDocument(adminActor, orgAId, docId);

    // Assert: Previous physical file content is completely intact
    const storageData = await storage.read(storedDoc!.storageKey);
    expect(storageData).toEqual(pdfBytesAlpha);

    // Assert: Previous chunks remain completely intact
    const chunksAfterReupload = await chunkStore.listByDocument(docId);
    expect(chunksAfterReupload.length).toBe(chunksAfterInitial.length);

    // Assert: Previous generated drafts were NOT deleted or damaged
    const drafts = await genContentStore.listByDocument(docId, orgAId);
    expect(drafts.length).toBe(1);
    expect(drafts[0].title).toBe("درس فارماکولوژی");

    // Assert: Course connection to Course 1 is preserved
    const finalDoc = await docStore.findByIdForOrganization(docId, orgAId);
    expect(finalDoc?.courseId).toBe(course1Id);
  });

  // ---------------------------------------------------------------------------
  // 9. Successful continuation of downstream processes identically
  // ---------------------------------------------------------------------------
  it("Scenario 9: Downstream processes (extraction, source pack creation, listing) continue seamlessly on reused files", async () => {
    // 1. First upload of lecture notes
    const firstUpload = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "microbiology.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });
    expect(firstUpload.duplicate).toBe(false);

    // Extract first upload
    const status1 = await processingService.processDocument(
      adminActor,
      orgAId,
      firstUpload.document.id as DocumentId,
    );
    expect(status1.page_count).toBeGreaterThan(0);

    // 2. Second upload (reuse in Source Pack workflow)
    const secondUpload = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "microbiology_renamed.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });
    expect(secondUpload.duplicate).toBe(true);
    expect(secondUpload.document.id).toBe(firstUpload.document.id);

    // Downstream 1: Automatic triggerExtraction succeeds seamlessly
    const status2 = await processingService.processDocument(
      adminActor,
      orgAId,
      secondUpload.document.id as DocumentId,
    );
    expect(status2.document_id).toBe(firstUpload.document.id);

    // Downstream 2: Document appears in course documents listing
    const listRes = await docService.listDocuments(adminActor, orgAId, {
      courseId: course1Id,
    });
    expect(listRes.items.some((d) => d.id === secondUpload.document.id)).toBe(true);

    // Downstream 3: Create Source Pack with the reused document succeeds
    const pack = await sourcePackService.createPack(adminActor, orgAId, course1Id, {
      title: "پک جامع میکروبیولوژی",
      documents: [
        {
          documentId: secondUpload.document.id as DocumentId,
          role: "primary_notes",
          orderIndex: 0,
        },
      ],
    });

    expect(pack.id).toBeDefined();
    expect(pack.documents.length).toBe(1);
    expect(pack.documents[0].documentId).toBe(secondUpload.document.id);
  });

  // ---------------------------------------------------------------------------
  // Course-Document association preservation
  // ---------------------------------------------------------------------------
  it("Course association: attaches unassigned document to course, but never overwrites existing course connection", async () => {
    // 1. Upload unassigned document in general library
    const unassigned = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "unassigned_guide.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: undefined,
    });
    expect(unassigned.document.course_id).toBeNull();

    // 2. Re-upload with Course 1: attaches document to Course 1
    const attached = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "unassigned_guide.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course1Id,
    });
    expect(attached.duplicate).toBe(true);
    expect(attached.document.course_id).toBe(course1Id);

    // Verify in store
    const inStoreAfterAttach = await docStore.findByIdForOrganization(
      unassigned.document.id as DocumentId,
      orgAId,
    );
    expect(inStoreAfterAttach?.courseId).toBe(course1Id);

    // 3. User selects the same file in Course 2 context:
    // MUST NOT overwrite previous Course 1 attachment, must NOT throw conflict error
    const reselectedInCourse2 = await docService.confirmUpload(adminActor, orgAId, {
      originalName: "unassigned_guide.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytesAlpha.length,
      data: pdfBytesAlpha,
      courseId: course2Id,
    });
    expect(reselectedInCourse2.duplicate).toBe(true);
    // Preserves Course 1
    expect(reselectedInCourse2.document.course_id).toBe(course1Id);

    const inStoreAfterReselect = await docStore.findByIdForOrganization(
      unassigned.document.id as DocumentId,
      orgAId,
    );
    expect(inStoreAfterReselect?.courseId).toBe(course1Id);
  });

  // ---------------------------------------------------------------------------
  // Incomplete Extraction Recovery & Status Validation Suite
  // ---------------------------------------------------------------------------
  describe("Incomplete Extraction Recovery & Status Validation", () => {
    it("Presence of Chunk with status 'extracting' triggers recovery and completes extraction", async () => {
      // Setup: Upload document
      const upload = await docService.confirmUpload(adminActor, orgAId, {
        originalName: "interrupted.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
        courseId: course1Id,
      });
      const docId = upload.document.id as DocumentId;

      // Simulate partial worker run: 1 chunk written, but worker crashed leaving status 'extracting'
      await chunkStore.create({
        id: randomUUID() as DocumentChunkId,
        documentId: docId,
        organizationId: orgAId,
        sequence: 1,
        pageNumber: 1,
        content: "partial chunk before crash",
        tokenCount: 5,
        wordCount: 5,
        byteSize: 26,
        isOcr: false,
        ocrConfidence: null,
        language: "fa",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const doc = (await docStore.findByIdForOrganization(docId, orgAId))!;
      await docStore.update({ ...doc, status: "extracting" });

      // Action: Recovery execution via processDocument
      const result = await processingService.processDocument(adminActor, orgAId, docId);

      // Assert: Successfully recovered and reached 'extracted' status
      expect(result.status).toBe("extracted");
      expect(result.page_count).toBeGreaterThan(0);

      // Chunks were rebuilt cleanly
      const chunks = await chunkStore.listByDocument(docId);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((c) => c.content === "partial chunk before crash")).toBe(false);

      const finalDoc = await docStore.findByIdForOrganization(docId, orgAId);
      expect(finalDoc?.status).toBe("extracted");
    });

    it("Presence of Chunk with status 'failed' triggers recovery and completes extraction", async () => {
      // Setup: Upload document
      const upload = await docService.confirmUpload(adminActor, orgAId, {
        originalName: "failed_doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
        courseId: course1Id,
      });
      const docId = upload.document.id as DocumentId;

      // Simulate failed previous run with leftover chunk
      await chunkStore.create({
        id: randomUUID() as DocumentChunkId,
        documentId: docId,
        organizationId: orgAId,
        sequence: 1,
        pageNumber: 1,
        content: "leftover failed chunk",
        tokenCount: 3,
        wordCount: 3,
        byteSize: 21,
        isOcr: false,
        ocrConfidence: null,
        language: "fa",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const doc = (await docStore.findByIdForOrganization(docId, orgAId))!;
      await docStore.update({ ...doc, status: "failed", errorCode: "EXTRACT_ERROR" });

      // Action: Re-run processDocument
      const result = await processingService.processDocument(adminActor, orgAId, docId);

      // Assert: Overcomes failure, clears old chunk, successfully extracts
      expect(result.status).toBe("extracted");
      expect(result.error_code).toBeNull();

      const chunks = await chunkStore.listByDocument(docId);
      expect(chunks.some((c) => c.content === "leftover failed chunk")).toBe(false);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("Complete extraction with status 'ready' is recognized as already extracted (idempotent)", async () => {
      // Setup: Upload and extract completely
      const upload = await docService.confirmUpload(adminActor, orgAId, {
        originalName: "ready_doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
        courseId: course1Id,
      });
      const docId = upload.document.id as DocumentId;
      await processingService.processDocument(adminActor, orgAId, docId);

      // Transition document to 'ready' (downstream pipeline completed)
      const doc = (await docStore.findByIdForOrganization(docId, orgAId))!;
      await docStore.update({ ...doc, status: "ready" });

      const chunksBefore = await chunkStore.listByDocument(docId);

      // Action: Trigger processDocument on ready document
      const result = await processingService.processDocument(adminActor, orgAId, docId);

      // Assert: Returns current 'ready' status directly without re-processing
      expect(result.status).toBe("ready");
      expect(result.chunk_count).toBe(chunksBefore.length);

      const docAfter = await docStore.findByIdForOrganization(docId, orgAId);
      expect(docAfter?.status).toBe("ready");
    });

    it("Complete extraction with status 'generating' is recognized as already extracted (idempotent)", async () => {
      // Setup: Upload and extract completely
      const upload = await docService.confirmUpload(adminActor, orgAId, {
        originalName: "generating_doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
        courseId: course1Id,
      });
      const docId = upload.document.id as DocumentId;
      await processingService.processDocument(adminActor, orgAId, docId);

      // Transition document to 'generating'
      const doc = (await docStore.findByIdForOrganization(docId, orgAId))!;
      await docStore.update({ ...doc, status: "generating" });

      const chunksBefore = await chunkStore.listByDocument(docId);

      // Action: Trigger processDocument on generating document
      const result = await processingService.processDocument(adminActor, orgAId, docId);

      // Assert: Returns current 'generating' status directly without re-processing
      expect(result.status).toBe("generating");
      expect(result.chunk_count).toBe(chunksBefore.length);

      const docAfter = await docStore.findByIdForOrganization(docId, orgAId);
      expect(docAfter?.status).toBe("generating");
    });

    it("Preserves existing Drafts and outputs when recovering incomplete extraction", async () => {
      // Setup: Upload document
      const upload = await docService.confirmUpload(adminActor, orgAId, {
        originalName: "recovering_with_drafts.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytesAlpha.length,
        data: pdfBytesAlpha,
        courseId: course1Id,
      });
      const docId = upload.document.id as DocumentId;

      // Simulate existing draft created previously
      const draftId = randomUUID() as GeneratedContentId;
      await genContentStore.create({
        id: draftId,
        organizationId: orgAId,
        documentId: docId,
        courseId: course1Id,
        type: "lesson",
        title: "درس تولیدشده حفظ‌شده",
        contentMarkdown: "# پیش‌نویس مهم",
        status: "draft",
        sourceChunkIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Simulate document left in 'extracting' status
      const doc = (await docStore.findByIdForOrganization(docId, orgAId))!;
      await docStore.update({ ...doc, status: "extracting" });

      // Action: Recover extraction
      const result = await processingService.processDocument(adminActor, orgAId, docId);
      expect(result.status).toBe("extracted");

      // Assert: Draft was NOT deleted or damaged during recovery
      const drafts = await genContentStore.listByDocument(docId, orgAId);
      expect(drafts.length).toBe(1);
      expect(drafts[0].title).toBe("درس تولیدشده حفظ‌شده");
      expect(drafts[0].id).toBe(draftId);
    });
  });
});
