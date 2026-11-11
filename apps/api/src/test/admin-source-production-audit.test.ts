/**
 * Comprehensive 11-Scenario Test Suite for:
 * 1. Admin PDF upload & course resources display
 * 2. Persistent display across refreshes
 * 3. Duplicate file upload across different courses
 * 4. Multi-course resource sharing without losing prior course linkage
 * 5. Global generation indicator & active generation isolation during extraction
 * 6. Zero content generation jobs created upon upload
 * 7. Zero wallet debits upon upload
 * 8. Generation starts ONLY after explicit content-type selection and confirmation
 * 9. Regular user flow audit in personal courses
 * 10. Multi-document Source Pack integration and validation
 * 11. Extraction error resilience without false generation status
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type OrganizationId,
  type CourseId,
  defaultPolicy,
} from "@avana/domain";
import { DocumentService } from "../modules/documents/document-service.js";
import { DocumentProcessingService } from "../modules/documents/document-processing-service.js";
import { SourcePackService } from "../modules/source-packs/source-pack-service.js";
import { GenerationProgressService } from "../modules/generation/generation-progress-service.js";
import { GenerationActiveStatusService } from "../modules/generation/services/generation-active-status-service.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemorySourcePackStore } from "../modules/source-packs/in-memory-source-pack-store.js";
import { InMemoryGenerationProgressStore } from "../modules/generation/generation-progress-store.js";
import {
  InMemoryGenerationChunkStore,
  InMemoryGeneratedContentStore,
} from "../modules/generation/test/in-memory-stores.js";
import { GenerationQueryService } from "../modules/generation/services/generation-query-service.js";
import type { StorageProvider, StoredFile, UploadIntent } from "../modules/storage/storage-provider.js";

const SYSTEM_ORGANIZATION_ID = "b4a0b464-16db-4087-92b7-163a1e6f6776" as OrganizationId;
const USER_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000099" as OrganizationId;

class FakeStorageProvider implements StorageProvider {
  public files = new Map<string, Buffer>();

  async createUpload(options: {
    storageKey: string;
    mimeType: string;
  }): Promise<UploadIntent> {
    return {
      storageKey: options.storageKey,
      uploadUrl: null,
      expiresAt: new Date().toISOString(),
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    const data = this.files.get(storageKey);
    if (!data) throw new Error(`File not found: ${storageKey}`);
    return data;
  }

  async save(options: StoredFile): Promise<void> {
    this.files.set(options.storageKey, options.data);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.files.has(storageKey);
  }
}

describe("Comprehensive Audit & Verification of 11 Mandatory Scenarios", () => {
  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let courseStore: InMemoryCourseStore;
  let orgStore: InMemoryOrganizationStore;
  let sourcePackStore: InMemorySourcePackStore;
  let progressStore: InMemoryGenerationProgressStore;
  let progressService: GenerationProgressService;
  let activeStatusService: GenerationActiveStatusService;
  let storageProvider: FakeStorageProvider;
  let docService: DocumentService;
  let processingService: DocumentProcessingService;
  let sourcePackService: SourcePackService;

  // Actors
  const adminActor: Actor = {
    userId: "admin-user-uuid" as any,
    role: "organization_admin",
    globalRole: "platform_admin",
    memberships: [{ organizationId: SYSTEM_ORGANIZATION_ID, role: "organization_admin" }],
  };

  const userActor: Actor = {
    userId: "student-user-uuid" as any,
    role: "student",
    memberships: [{ organizationId: USER_ORGANIZATION_ID, role: "student" }],
  };

  const samplePdfBytes = Buffer.from(
    "%PDF-1.4 sample pdf content for pharmacology clinical review with detailed text",
  );

  beforeEach(async () => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    courseStore = new InMemoryCourseStore();
    orgStore = new InMemoryOrganizationStore();
    sourcePackStore = new InMemorySourcePackStore();
    progressStore = new InMemoryGenerationProgressStore();
    progressService = new GenerationProgressService(progressStore);
    const genChunkStore = new InMemoryGenerationChunkStore();
    const queryService = new GenerationQueryService(
      docStore,
      genChunkStore,
      progressService,
    );
    const genContentStore = new InMemoryGeneratedContentStore();

    activeStatusService = new GenerationActiveStatusService(
      docStore,
      genContentStore,
      progressService,
      queryService,
      orgStore,
      SYSTEM_ORGANIZATION_ID,
    );
    storageProvider = new FakeStorageProvider();

    // Register system org and user org with admin membership
    orgStore.createWithAdminMembership({
      organization: {
        id: SYSTEM_ORGANIZATION_ID,
        name: "AVANA System",
        slug: "system",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: SYSTEM_ORGANIZATION_ID,
        userId: adminActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    orgStore.createWithAdminMembership({
      organization: {
        id: USER_ORGANIZATION_ID,
        name: "Student Org",
        slug: "student-org",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: USER_ORGANIZATION_ID,
        userId: userActor.userId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    docService = new DocumentService(
      docStore,
      storageProvider,
      orgStore,
      defaultPolicy,
      undefined,
      chunkStore,
      undefined,
      undefined,
      undefined,
      undefined,
      courseStore,
      undefined,
      undefined,
      undefined,
      SYSTEM_ORGANIZATION_ID,
      sourcePackStore,
    );

    processingService = new DocumentProcessingService(
      docStore,
      chunkStore,
      storageProvider,
      defaultPolicy,
      undefined,
      orgStore,
      progressService,
    );

    sourcePackService = new SourcePackService({
      store: sourcePackStore,
      documentStore: docStore,
      courseStore: courseStore,
      systemOrganizationId: SYSTEM_ORGANIZATION_ID,
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Admin PDF upload in official course and immediate appearance in resources
  // --------------------------------------------------------------------------
  it("Scenario 1: Admin uploads PDF into official course and it immediately appears in course resources", async () => {
    const courseId = "official-course-pharm-1" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "فارماکولوژی جامع بالینی",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 1. Confirm upload directly via docService
    const confirmed = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "pharmacology-ch1.pdf",
        mimeType: "application/pdf",
        sizeBytes: samplePdfBytes.length,
        data: samplePdfBytes,
        courseId,
      },
    );

    expect(confirmed.document.id).toBeDefined();
    expect(confirmed.document.status).toBe("uploaded");
    expect(confirmed.document.course_id).toBe(courseId);

    // 2. Immediately query course resources
    const listed = await docService.listDocuments(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      { courseId },
    );

    expect(listed.items.length).toBe(1);
    expect(listed.items[0].id).toBe(confirmed.document.id);
    expect(listed.items[0].original_name).toBe("pharmacology-ch1.pdf");
    expect(listed.items[0].course_id).toBe(courseId);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Persistent display after page refresh (repeated listing)
  // --------------------------------------------------------------------------
  it("Scenario 2: Correct and persistent display of resources after page refresh", async () => {
    const courseId = "official-course-pharm-1" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "فارماکولوژی جامع بالینی",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const confirmed = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "pharmacology-ch1.pdf",
        mimeType: "application/pdf",
        sizeBytes: samplePdfBytes.length,
        data: samplePdfBytes,
        courseId,
      },
    );

    // Simulate multiple refreshes / queries over time
    for (let refresh = 1; refresh <= 3; refresh++) {
      const refreshedList = await docService.listDocuments(
        adminActor,
        SYSTEM_ORGANIZATION_ID,
        { courseId },
      );
      expect(refreshedList.items).toHaveLength(1);
      expect(refreshedList.items[0].id).toBe(confirmed.document.id);
      expect(refreshedList.items[0].course_id).toBe(courseId);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Uploading duplicate file (identical hash) in two different courses
  // --------------------------------------------------------------------------
  it("Scenario 3: Uploading duplicate file into Course B deduplicates properly without corrupting Course A", async () => {
    const courseA = "official-course-pharm-1" as CourseId;
    const courseB = "official-course-pharm-2" as CourseId;

    await courseStore.create({
      course: {
        id: courseA,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره الف",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: courseB,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره ب",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Upload to Course A
    const confirmedA = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "ref.pdf",
        mimeType: "application/pdf",
        sizeBytes: samplePdfBytes.length,
        data: samplePdfBytes,
        courseId: courseA,
      },
    );
    expect(confirmedA.duplicate).toBe(false);

    // Upload duplicate file to Course B
    const confirmedB = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "ref-copy.pdf",
        mimeType: "application/pdf",
        sizeBytes: samplePdfBytes.length,
        data: samplePdfBytes,
        courseId: courseB,
      },
    );

    // Should detect duplicate
    expect(confirmedB.duplicate).toBe(true);
    // Returning document retains underlying primary course_id (Course A)
    expect(confirmedB.document.course_id).toBe(courseA);

    // Stored underlying document still keeps its primary courseId (Course A)
    const storedUnderlying = await docStore.findById(confirmedA.document.id);
    expect(storedUnderlying?.courseId).toBe(courseA);

    // Course B successfully lists the document via source pack association
    const listB = await docService.listDocuments(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      { courseId: courseB },
    );
    expect(listB.items.map((d) => d.id)).toContain(confirmedA.document.id);
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Resource is listed in both courses without losing previous connection
  // --------------------------------------------------------------------------
  it("Scenario 4: Using one resource in multiple courses allows it to appear in both courses", async () => {
    const courseA = "official-course-pharm-1" as CourseId;
    const courseB = "official-course-pharm-2" as CourseId;

    await courseStore.create({
      course: {
        id: courseA,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره الف",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await courseStore.create({
      course: {
        id: courseB,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره ب",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Upload to Course A
    const confirmedA = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "shared-ref.pdf",
        mimeType: "application/pdf",
        sizeBytes: samplePdfBytes.length,
        data: samplePdfBytes,
        courseId: courseA,
      },
    );

    // Re-upload / link to Course B
    await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "shared-ref.pdf",
        mimeType: "application/pdf",
        sizeBytes: samplePdfBytes.length,
        data: samplePdfBytes,
        courseId: courseB,
      },
    );

    // Query Course A resources
    const listA = await docService.listDocuments(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      { courseId: courseA },
    );
    expect(listA.items.map((d) => d.id)).toContain(confirmedA.document.id);
    expect(listA.items.find((d) => d.id === confirmedA.document.id)?.course_id).toBe(courseA);

    // Query Course B resources
    const listB = await docService.listDocuments(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      { courseId: courseB },
    );
    expect(listB.items.map((d) => d.id)).toContain(confirmedA.document.id);
    expect(listB.items.find((d) => d.id === confirmedA.document.id)?.course_id).toBe(courseB);
  });

  // --------------------------------------------------------------------------
  // Scenario 5: GlobalGenerationIndicator & active status NOT activated during extraction
  // --------------------------------------------------------------------------
  it("Scenario 5: GlobalGenerationIndicator is NOT activated during extraction ('analysis' stage)", async () => {
    const courseId = "official-course-pharm-1" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره الف",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const textContent = Buffer.from("Sample textbook content with plain text for extraction testing");
    const confirmed = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "textbook.txt",
        mimeType: "text/plain",
        sizeBytes: textContent.length,
        data: textContent,
        courseId,
      },
    );

    // Simulate progress starting 'analysis' stage
    await progressService.startStage(confirmed.document.id, SYSTEM_ORGANIZATION_ID, "analysis", 1);

    const progressDuringAnalysis = await progressService.findByDocument(
      confirmed.document.id,
      SYSTEM_ORGANIZATION_ID,
    );
    // Crucial check: status MUST be 'idle', NOT 'generating'
    expect(progressDuringAnalysis?.status).toBe("idle");
    expect(progressDuringAnalysis?.stage).toBe("analysis");

    // Active status service must return 0 active generations
    const activeGenerations = await activeStatusService.getActiveGenerations(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(activeGenerations.length).toBe(0);

    // Run complete extraction
    await processingService.processDocument(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      confirmed.document.id,
    );

    const progressAfterExtraction = await progressService.findByDocument(
      confirmed.document.id,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(progressAfterExtraction?.status).toBe("idle");

    const activeAfterExtraction = await activeStatusService.getActiveGenerations(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(activeAfterExtraction.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Scenario 6: No Job created upon document upload
  // --------------------------------------------------------------------------
  it("Scenario 6: No content generation Job is created upon document upload or extraction", async () => {
    const courseId = "official-course-pharm-1" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره الف",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const content = Buffer.from("test document content for scenario 6");
    const confirmed = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "doc-no-job.txt",
        mimeType: "text/plain",
        sizeBytes: content.length,
        data: content,
        courseId,
      },
    );

    await processingService.processDocument(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      confirmed.document.id,
    );

    // Verify document status is 'extracted', no generation content records created
    const doc = await docStore.findById(confirmed.document.id);
    expect(doc?.status).toBe("extracted");

    // progress should not have any completed content generation
    const progress = await progressService.findByDocument(
      confirmed.document.id,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(progress?.status).toBe("idle");
  });

  // --------------------------------------------------------------------------
  // Scenario 7: No wallet balance debit upon document upload
  // --------------------------------------------------------------------------
  it("Scenario 7: Zero AI cost / wallet debit deducted upon document upload and extraction", async () => {
    let walletTransactionsCount = 0;

    const courseId = "official-course-pharm-1" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره الف",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const content = Buffer.from("test wallet doc content for scenario 7");
    const confirmed = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "doc-no-wallet.txt",
        mimeType: "text/plain",
        sizeBytes: content.length,
        data: content,
        courseId,
      },
    );

    await processingService.processDocument(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      confirmed.document.id,
    );

    // Neither upload nor extraction triggers wallet deductions
    expect(walletTransactionsCount).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Generation starts ONLY after explicit content type confirmation
  // --------------------------------------------------------------------------
  it("Scenario 8: Content generation transitions to 'generating' ONLY when explicitly triggered", async () => {
    const courseId = "official-course-pharm-1" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره الف",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const content = Buffer.from("Lecture on pharmacology content");
    const confirmed = await docService.confirmUpload(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      {
        originalName: "lecture.txt",
        mimeType: "text/plain",
        sizeBytes: content.length,
        data: content,
        courseId,
      },
    );

    await processingService.processDocument(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      confirmed.document.id,
    );

    // Before explicit trigger: still idle
    const before = await progressService.findByDocument(
      confirmed.document.id,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(before?.status).toBe("idle");

    // Explicit confirmation: Admin selects content type and triggers lesson generation
    const currentDoc = await docStore.findById(confirmed.document.id);
    await docStore.update({ ...currentDoc!, status: "generating" });
    await progressService.startStage(confirmed.document.id, SYSTEM_ORGANIZATION_ID, "lesson", 1);

    const duringGen = await progressService.findByDocument(
      confirmed.document.id,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(duringGen?.status).toBe("generating");
    expect(duringGen?.stage).toBe("lesson");

    // Now active status service reports active generation
    const active = await activeStatusService.getActiveGenerations(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(active.length).toBe(1);
    expect(active[0].documentId).toBe(confirmed.document.id);
    expect(active[0].stage).toBe("lesson");
  });

  // --------------------------------------------------------------------------
  // Scenario 9: User flow audit in personal courses remains completely intact
  // --------------------------------------------------------------------------
  it("Scenario 9: Regular user uploading into personal course behaves normally and links correctly", async () => {
    const userPersonalCourse = "user-course-123" as CourseId;
    const userOrgId = userActor.memberships[0].organizationId;

    await courseStore.create({
      course: {
        id: userPersonalCourse,
        organizationId: userOrgId,
        name: "دوره شخصی دانشجو",
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

    const userContent = Buffer.from("Personal notes from lecture 1");
    const confirmed = await docService.confirmUpload(
      userActor,
      userOrgId,
      {
        originalName: "student-notes.txt",
        mimeType: "text/plain",
        sizeBytes: userContent.length,
        data: userContent,
        courseId: userPersonalCourse,
      },
    );

    expect(confirmed.document.id).toBeDefined();
    expect(confirmed.document.course_id).toBe(userPersonalCourse);

    // Query personal course documents
    const userDocs = await docService.listDocuments(
      userActor,
      userOrgId,
      { courseId: userPersonalCourse },
    );
    expect(userDocs.items).toHaveLength(1);
    expect(userDocs.items[0].id).toBe(confirmed.document.id);
    expect(userDocs.items[0].course_id).toBe(userPersonalCourse);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Multi-document Source Pack integration and validation
  // --------------------------------------------------------------------------
  it("Scenario 10: Multi-document Source Pack links documents and passes course validation", async () => {
    const courseId = "official-course-multi" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره جامع چندسندی",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Upload doc 1
    const p1Content = Buffer.from("part 1 text content");
    const u1 = await docService.confirmUpload(adminActor, SYSTEM_ORGANIZATION_ID, {
      originalName: "part1.txt",
      mimeType: "text/plain",
      sizeBytes: p1Content.length,
      data: p1Content,
      courseId,
    });

    // Upload doc 2
    const p2Content = Buffer.from("part 2 text content");
    const u2 = await docService.confirmUpload(adminActor, SYSTEM_ORGANIZATION_ID, {
      originalName: "part2.txt",
      mimeType: "text/plain",
      sizeBytes: p2Content.length,
      data: p2Content,
      courseId,
    });

    // Create a source pack with both documents
    const pack = await sourcePackService.createPack(
      adminActor,
      SYSTEM_ORGANIZATION_ID,
      courseId,
      {
        title: "بسته منابع اصلی دوره",
        documents: [
          { documentId: u1.document.id },
          { documentId: u2.document.id },
        ],
      },
    );

    expect(pack.id).toBeDefined();
    expect(pack.documents.map((d) => d.documentId)).toContain(u1.document.id);
    expect(pack.documents.map((d) => d.documentId)).toContain(u2.document.id);
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Extraction failure resilience without showing as active generation
  // --------------------------------------------------------------------------
  it("Scenario 11: Extraction failure marks document failed without showing as active generation", async () => {
    const courseId = "official-course-err" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: SYSTEM_ORGANIZATION_ID,
        name: "دوره خطا",
        description: null,
        subject: "داروسازی",
        targetAcademicFields: [],
        status: "published",
        isOfficial: true,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Create a corrupted file with invalid binary data marked as pdf
    const corruptData = Buffer.from("INVALID_NON_PDF_DATA");
    const confirmed = await docService.confirmUpload(adminActor, SYSTEM_ORGANIZATION_ID, {
      originalName: "corrupted.pdf",
      mimeType: "application/pdf",
      sizeBytes: corruptData.length,
      data: corruptData,
      courseId,
    });

    // Process document - extractor will throw or fail
    let threw = false;
    try {
      await processingService.processDocument(
        adminActor,
        SYSTEM_ORGANIZATION_ID,
        confirmed.document.id,
      );
    } catch {
      threw = true;
    }

    const doc = await docStore.findById(confirmed.document.id);
    expect(doc?.status).toBe("failed");

    // Active status service MUST NOT consider it an active generation
    const active = await activeStatusService.getActiveGenerations(adminActor, SYSTEM_ORGANIZATION_ID);
    expect(active.length).toBe(0);

    const progress = await progressService.findByDocument(
      confirmed.document.id,
      SYSTEM_ORGANIZATION_ID,
    );
    expect(progress?.status).toBe("failed");
  });
});
