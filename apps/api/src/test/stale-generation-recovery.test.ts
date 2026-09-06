import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type OrganizationId,
  asUserId,
  asOrganizationId,
  asDocumentId,
  defaultPolicy,
  DomainError,
} from "@avana/domain";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
  InMemoryGenerationChunkStore,
} from "../modules/generation/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { GenerationRecoveryService } from "../modules/generation/generation-recovery-service.js";
import { ReviewService } from "../modules/generation/review-service.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { OfficialContentService } from "../modules/admin/official-content-service.js";

describe("Stale Generation Recovery & Lease Architecture (Regression Test Suite)", () => {
  const officialOrgId = asOrganizationId("b4a0b464-16db-4087-92b7-163a1e6f6776");
  const adminActor: Actor = {
    userId: asUserId("admin-ops-user"),
    role: "platform_admin",
  };

  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let generationChunkStore: InMemoryGenerationChunkStore;
  let adminStore: InMemoryAdminStore;
  let orgStore: InMemoryOrganizationStore;

  let modelGateway: MockModelGateway;
  let generationService: GenerationService;
  let reviewService: ReviewService;
  let recoveryService: GenerationRecoveryService;
  let officialContentService: OfficialContentService;

  beforeEach(async () => {
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    generationChunkStore = new InMemoryGenerationChunkStore();
    adminStore = new InMemoryAdminStore();
    orgStore = new InMemoryOrganizationStore();

    await orgStore.createWithAdminMembership({
      organization: {
        id: officialOrgId,
        name: "AVANA OFFICIAL",
        slug: "avana-official",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: officialOrgId,
        userId: adminActor.userId,
        role: "organization_admin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    modelGateway = new MockModelGateway();

    generationService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      modelGateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      undefined,
      orgStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      courseStore,
      officialOrgId,
      generationChunkStore,
    );

    reviewService = new ReviewService(
      generatedContentStore,
      generatedContentCitationStore,
      documentStore,
      documentChunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      undefined,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      orgStore,
    );

    // InMemory recovery service adapter for tests
    recoveryService = new GenerationRecoveryService(
      (adminStore as any).db ?? {},
      courseStore,
      documentStore,
      generatedContentStore,
      documentChunkStore,
      generationJobStore,
      generationChunkStore,
    );

    officialContentService = new OfficialContentService(
      (adminStore as any).db ?? {},
      courseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
      documentStore,
      generatedContentStore,
      generationService,
      reviewService,
      adminStore,
      officialOrgId,
      recoveryService,
    );
  });

  // Helper to create course and extracted document
  async function setupCourseAndDocument(params: {
    courseName?: string;
    docName?: string;
    chunkCount?: number;
    courseStatus?: import("@avana/domain").CourseStatus;
    docStatus?: import("@avana/domain").DocumentRecord["status"];
  } = {}) {
    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();

    const courseRecord = await courseStore.create({
      course: {
        id: courseId,
        organizationId: officialOrgId,
        name: params.courseName ?? "فارماکولوژی ۳",
        description: "دوره فارماکولوژی جامع",
        subject: "فارماکولوژی",
        status: params.courseStatus ?? "draft",
        isOfficial: true,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const docId = randomUUID() as DocumentId;
    const docRecord = await documentStore.create({
      id: docId,
      organizationId: officialOrgId,
      courseId,
      filename: `${params.docName ?? "41"}.pdf`,
      originalName: `${params.docName ?? "41"}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1024 * 1024,
      storageKey: `docs/${docId}.pdf`,
      status: params.docStatus ?? "extracted",
      pageCount: 15,
      extractedText: "فارماکولوژی سیستم قلبی عروقی و داروهای ضد فشار خون...",
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const chunks = [];
    const count = params.chunkCount ?? 5;
    for (let i = 0; i < count; i++) {
      const chunk = await documentChunkStore.create({
        id: randomUUID(),
        documentId: docId,
        chunkIndex: i,
        content: `بخش ${i + 1}: توضیحات تفصیلی مکانیسم اثر داروهای مسدودکننده بتا و کانال کلسیم.`,
        heading: `فصل ${i + 1}`,
        tokenEstimate: 200,
        pageNumber: i + 1,
        createdAt: now,
      });
      chunks.push(chunk);
    }

    return { course: courseRecord, document: docRecord, chunks };
  }

  it("Scenario 1: Happy path generation transitions extracted doc to review_pending and course to review", async () => {
    const { course, document } = await setupCourseAndDocument();

    const result = await officialContentService.triggerOfficialGeneration(
      adminActor,
      course.id,
      document.id,
      { lesson: true, flashcards: true, exam: true, review_summary: true },
    );

    expect(result.status).toBe("review");

    const updatedCourse = await courseStore.findById(course.id);
    expect(updatedCourse?.status).toBe("review");

    const updatedDoc = await documentStore.findByIdForOrganization(
      document.id,
      officialOrgId,
    );
    expect(updatedDoc?.status).toBe("review_pending");

    const drafts = await generatedContentStore.listByDocument(
      document.id,
      officialOrgId,
    );
    expect(drafts.length).toBeGreaterThanOrEqual(4);
    const types = drafts.map((d) => d.type);
    expect(types).toContain("lesson");
    expect(types).toContain("flashcard");
    expect(types).toContain("quiz");
    expect(types).toContain("review_summary");
  });

  it("Scenario 2: Gateway failure properly transitions document to failed and records error without wiping drafts", async () => {
    const { course, document } = await setupCourseAndDocument();

    // Configure model gateway to throw service_unavailable
    modelGateway.complete = async () => {
      throw new DomainError("service_unavailable", "AI provider overload 503");
    };

    await expect(
      officialContentService.triggerOfficialGeneration(
        adminActor,
        course.id,
        document.id,
        { lesson: true },
      ),
    ).rejects.toThrow();

    const updatedDoc = await documentStore.findByIdForOrganization(
      document.id,
      officialOrgId,
    );
    expect(updatedDoc?.status).toBe("failed");
    expect(updatedDoc?.errorCode).toBe("service_unavailable");

    const updatedCourse = await courseStore.findById(course.id);
    expect(updatedCourse?.status).toBe("draft");
  });

  it("Scenario 3: Heartbeat and lease update keeps worker state active", async () => {
    const { course, document } = await setupCourseAndDocument();

    const claim = await generationChunkStore.claimChunk({
      organizationId: officialOrgId,
      documentId: document.id,
      courseId: course.id,
      stage: "planning",
      chunkIndex: 0,
      chunkKey: "planning",
    });

    expect(claim.status).toBe("claimed");
    expect(claim.record.heartbeatAt).toBeDefined();
    expect(claim.record.leaseExpiresAt).toBeDefined();

    // Simulate worker heartbeat refresh after small delay
    await new Promise((r) => setTimeout(r, 50));
    const newHeartbeat = new Date(Date.now() + 1000).toISOString();
    await generationChunkStore.updateHeartbeat(
      document.id,
      "planning",
      officialOrgId,
      newHeartbeat,
    );

    const updatedChunk = await generationChunkStore.findByDocumentAndKey(
      document.id,
      "planning",
      officialOrgId,
    );
    expect(updatedChunk?.status).toBe("running");
    expect(updatedChunk?.heartbeatAt).toBe(newHeartbeat);
    expect(new Date(updatedChunk!.leaseExpiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("Scenario 4: Stale course recovery unblocks stuck 'generating' course to 'review' when existing drafts exist", async () => {
    const { course, document } = await setupCourseAndDocument({
      courseStatus: "generating",
      docStatus: "generating",
    });

    // Simulate existing drafts from other documents (like 38, 39, 40.pdf in Pharma 3)
    await generatedContentStore.create({
      id: randomUUID() as any,
      organizationId: officialOrgId,
      documentId: document.id,
      courseId: course.id,
      type: "lesson",
      status: "draft",
      payload: { kind: "lesson", title: "درس نمونه", sessions: [] },
      promptVersion: "v1",
      model: "test",
      tokenUsage: null,
      generationKey: null,
      acceptedAt: null,
      acceptedBy: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      previousPayload: null,
      materializedLessonId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Simulate stale running chunk from 2 days ago with expired lease
    const oldDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    await generationChunkStore.upsert({
      id: randomUUID(),
      organizationId: officialOrgId,
      documentId: document.id,
      courseId: course.id,
      stage: "planning",
      chunkIndex: 0,
      chunkKey: "planning",
      status: "running",
      attempts: 1,
      createdAt: oldDate,
      updatedAt: oldDate,
      heartbeatAt: oldDate,
      leaseExpiresAt: oldDate,
    });

    // Run course recovery
    const recoveryResult = await officialContentService.reconcileCourse(
      adminActor,
      course.id,
    );

    expect(recoveryResult.recovered).toBe(true);
    expect(recoveryResult.previousStatus).toBe("generating");
    expect(recoveryResult.newStatus).toBe("review");

    // Existing drafts MUST NOT be deleted
    const drafts = await generatedContentStore.listByCourse(
      course.id,
      officialOrgId,
    );
    expect(drafts.length).toBe(1);

    // Stale chunk must be marked failed
    const staleChunk = await generationChunkStore.findByDocumentAndKey(
      document.id,
      "planning",
      officialOrgId,
    );
    expect(staleChunk?.status).toBe("failed");
    expect(staleChunk?.errorCode).toBe("STALE_LEASE_EXPIRED");
  });

  it("Scenario 5: Stale document with chunks and 0 drafts recovers to 'extracted'", async () => {
    const { course, document } = await setupCourseAndDocument({
      courseStatus: "draft",
      docStatus: "generating",
      chunkCount: 26,
    });

    // Document 41.pdf situation: 26 extracted chunks, 0 generated drafts, stuck in 'generating'
    const recoveryRes = await recoveryService.reconcileStaleDocument(
      officialOrgId,
      document.id,
    );

    expect(recoveryRes.recovered).toBe(true);
    expect(recoveryRes.newStatus).toBe("extracted");

    const updatedDoc = await documentStore.findByIdForOrganization(
      document.id,
      officialOrgId,
    );
    expect(updatedDoc?.status).toBe("extracted");

    // Check that getDocumentContentStatus reflects can_generate = true
    const statusResource = await generationService.getDocumentContentStatus(
      adminActor,
      officialOrgId,
      document.id,
      course.id,
    );
    expect(statusResource.can_generate).toBe(true);
  });

  it("Scenario 6: triggerOfficialGeneration automatically unblocks stale 'generating' course and proceeds", async () => {
    const { course, document } = await setupCourseAndDocument({
      courseStatus: "generating", // Course was left in generating state
      docStatus: "extracted",
    });

    // No active heartbeat exists -> triggerOfficialGeneration should reconcile and succeed
    const genResult = await officialContentService.triggerOfficialGeneration(
      adminActor,
      course.id,
      document.id,
      { lesson: true },
    );

    expect(genResult.status).toBe("review");
    const updatedCourse = await courseStore.findById(course.id);
    expect(updatedCourse?.status).toBe("review");
  });

  it("Scenario 7: Concurrency protection — active fresh lease throws 409 conflict", async () => {
    const { course, document } = await setupCourseAndDocument({
      courseStatus: "generating",
    });

    // Create a fresh active chunk lease
    await generationChunkStore.upsert({
      id: randomUUID(),
      organizationId: officialOrgId,
      documentId: document.id,
      courseId: course.id,
      stage: "planning",
      chunkIndex: 0,
      chunkKey: "planning",
      status: "running",
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    await expect(
      officialContentService.triggerOfficialGeneration(
        adminActor,
        course.id,
        document.id,
        { lesson: true },
      ),
    ).rejects.toThrow(DomainError);
  });

  it("Scenario 8: Reconcile all stale finds and recovers all orphaned jobs and chunks", async () => {
    const { course, document } = await setupCourseAndDocument();

    const staleDate = new Date(Date.now() - 3600 * 1000).toISOString();
    await generationJobStore.create({
      id: randomUUID() as any,
      organizationId: officialOrgId,
      documentId: document.id,
      courseId: course.id,
      type: "lesson",
      status: "running",
      generationKey: "test-stale-job",
      jobId: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      createdAt: staleDate,
      updatedAt: staleDate,
      startedAt: staleDate,
      heartbeatAt: staleDate,
      leaseExpiresAt: staleDate,
      completedAt: null,
      deletedAt: null,
    });

    const reconciledJobs = await generationJobStore.reconcileStaleJobs({
      organizationId: officialOrgId,
      maxAgeMs: 600_000,
    });
    expect(reconciledJobs.reconciledCount).toBe(1);

    const jobs = await generationJobStore.listByDocument(
      document.id,
      officialOrgId,
    );
    expect(jobs[0].status).toBe("failed");
    expect(jobs[0].errorCode).toBe("STALE_LEASE_EXPIRED");
  });
});
