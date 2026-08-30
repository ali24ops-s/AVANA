// @ts-nocheck
import { describe, expect, it, beforeEach } from "vitest";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
  InMemoryGenerationJobStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
} from "../modules/study/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { GenerationService } from "../modules/generation/generation-service.js";
import { createModelGateway } from "../modules/generation/gateway/index.js";
import {
  defaultPolicy,
  DomainError,
  type Actor,
  type CourseId,
  type DocumentChunkId,
  type DocumentId,
  type OrganizationId,
  type UserId,
} from "@avana/domain";

describe("Smart Content Multi-Turn Generation (User Bug Scenario)", () => {
  let docStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let genStore: InMemoryGeneratedContentStore;
  let citStore: InMemoryGeneratedContentCitationStore;
  let jobStore: InMemoryGenerationJobStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let flashcardStore: InMemoryFlashcardStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let orgStore: InMemoryOrganizationStore;
  let queue: InMemoryGenerationQueue;
  let service: GenerationService;

  const orgId = "00000000-0000-0000-0000-000000000001" as OrganizationId;
  const courseId = "00000000-0000-0000-0000-000000000002" as CourseId;
  const docId = "00000000-0000-0000-0000-000000000003" as DocumentId;
  const actor: Actor = {
    userId: "00000000-0000-0000-0000-000000000099" as UserId,
    role: "organization_admin",
  };

  beforeEach(async () => {
    docStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    genStore = new InMemoryGeneratedContentStore();
    citStore = new InMemoryGeneratedContentCitationStore();
    jobStore = new InMemoryGenerationJobStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    flashcardStore = new InMemoryFlashcardStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    orgStore = new InMemoryOrganizationStore();

    const gateway = createModelGateway("mock");

    service = new GenerationService(
      genStore,
      citStore,
      gateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      orgStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    queue = new InMemoryGenerationQueue(jobStore, service);

    // Setup initial document and chunks
    const now = new Date().toISOString();
    await orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Cardio Org",
        slug: "cardio-org",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      membership: {
        id: "mem-1" as never,
        organizationId: orgId,
        userId: actor.userId,
        role: "organization_admin",
        createdAt: now,
        updatedAt: now,
      },
      auditEvents: [],
    });

    await docStore.create({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: actor.userId,
      originalName: "cardio_pharmacology.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: "b".repeat(64),
      storageKey: `uploads/${docId}.pdf`,
      pageCount: 3,
      status: "extracted",
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await chunkStore.createMany([
      {
        id: "chunk-1" as DocumentChunkId,
        documentId: docId,
        organizationId: orgId,
        sequence: 0,
        heading: "مقدمه و طبقه‌بندی",
        content: "بتا بلاکرها بر اساس ویژگی‌های فارماکولوژیک به دو دسته اختصاصی و غیراختصاصی تقسیم می‌شوند.",
        startPage: 1,
        endPage: 1,
        tokenEstimate: 40,
        contentHash: "hash-1",
        createdAt: now,
      },
      {
        id: "chunk-2" as DocumentChunkId,
        documentId: docId,
        organizationId: orgId,
        sequence: 1,
        heading: "مکانیسم و عوارض",
        content: "پروپرانولول بتا بلاکر غیراختصاصی است و در بیماران مبتلا به آسم منع مصرف دارد.",
        startPage: 2,
        endPage: 2,
        tokenEstimate: 40,
        contentHash: "hash-2",
        createdAt: now,
      },
    ]);
  });

  it("reproduces and validates multi-turn generation: Step 1 (Lesson only) -> Step 2 (Flashcard + Exam)", async () => {
    // 1. Initial State: Check content status
    let contentStatus = await service.getDocumentContentStatus(actor, orgId, docId, courseId);
    expect(contentStatus.lesson.generated).toBe(false);
    expect(contentStatus.flashcards.generated).toBe(false);
    expect(contentStatus.exam.generated).toBe(false);
    expect(contentStatus.all_generated).toBe(false);
    expect(contentStatus.can_generate).toBe(true);

    // 2. Step 1: User generates ONLY "Lesson"
    const job1 = await queue.enqueueGenerationJob({
      actorUserId: actor.userId,
      actorRole: actor.role,
      organizationId: orgId,
      documentId: docId,
      courseId,
      types: ["lesson"],
      generationKey: "key-lesson-1",
    });

    // Wait for queue async execution
    await new Promise((r) => setTimeout(r, 120));

    const job1Record = await jobStore.findByIdForOrganization(job1.generationJobId, orgId);
    expect(job1Record?.status).toBe("succeeded");

    // Check Document Status
    const docAfterStep1 = await docStore.findByIdForOrganization(docId, orgId);
    expect(docAfterStep1?.status).toBe("review_pending");

    // Check Content Status after Step 1
    contentStatus = await service.getDocumentContentStatus(actor, orgId, docId, courseId);
    expect(contentStatus.lesson.generated).toBe(true);
    expect(contentStatus.lesson.count).toBeGreaterThanOrEqual(1);
    expect(contentStatus.flashcards.generated).toBe(false);
    expect(contentStatus.exam.generated).toBe(false);
    expect(contentStatus.all_generated).toBe(false);
    expect(contentStatus.can_generate).toBe(true);

    // 3. Step 2: User opens modal again and selects "Flashcard" + "Quiz"
    const job2 = await queue.enqueueGenerationJob({
      actorUserId: actor.userId,
      actorRole: actor.role,
      organizationId: orgId,
      documentId: docId,
      courseId,
      types: ["flashcard", "quiz"],
      generationKey: "key-fc-quiz-2",
    });

    // Wait for queue async execution
    await new Promise((r) => setTimeout(r, 120));

    const job2Record = await jobStore.findByIdForOrganization(job2.generationJobId, orgId);
    expect(job2Record?.status).toBe("succeeded");
    expect(job2Record?.errorCode).toBeNull();

    // Check Document Status after Step 2
    const docAfterStep2 = await docStore.findByIdForOrganization(docId, orgId);
    expect(docAfterStep2?.status).toBe("review_pending");

    // Check Content Status after Step 2
    contentStatus = await service.getDocumentContentStatus(actor, orgId, docId, courseId);
    expect(contentStatus.lesson.generated).toBe(true);
    expect(contentStatus.flashcards.generated).toBe(true);
    expect(contentStatus.flashcards.count).toBeGreaterThanOrEqual(1);
    expect(contentStatus.exam.generated).toBe(true);
    expect(contentStatus.exam.count).toBeGreaterThanOrEqual(1);
    expect(contentStatus.all_generated).toBe(true);
    expect(contentStatus.can_generate).toBe(false);

    // Verify all 3 drafts exist in GeneratedContentStore
    const drafts = await genStore.listByDocument(docId, orgId);
    expect(drafts.filter((d) => d.deletedAt === null)).toHaveLength(3);
    expect(drafts.some((d) => d.type === "lesson")).toBe(true);
    expect(drafts.some((d) => d.type === "flashcard")).toBe(true);
    expect(drafts.some((d) => d.type === "quiz")).toBe(true);
  });

  it("properly transitions job and document to 'failed' on unhandled error and never hangs in generating", async () => {
    // Inject a failing gateway
    const failingGateway = {
      provider: "mock" as const,
      async complete() {
        throw new Error("Simulated upstream model timeout / JSON syntax error");
      },
    };

    const failingService = new GenerationService(
      genStore,
      citStore,
      failingGateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      orgStore,
    );

    const failingQueue = new InMemoryGenerationQueue(jobStore, failingService);

    const job = await failingQueue.enqueueGenerationJob({
      actorUserId: actor.userId,
      actorRole: actor.role,
      organizationId: orgId,
      documentId: docId,
      courseId,
      types: ["flashcard", "quiz"],
      generationKey: "key-failing-test",
    });

    // Wait for queue async execution
    await new Promise((r) => setTimeout(r, 120));

    const jobRecord = await jobStore.findByIdForOrganization(job.generationJobId, orgId);
    expect(jobRecord?.status).toBe("failed");
    expect(jobRecord?.errorMessage).toContain("Simulated upstream model timeout");

    const docRecord = await docStore.findByIdForOrganization(docId, orgId);
    expect(docRecord?.status).toBe("failed");
  });

  it("handles Gemini Multi-Key Quota Exhaustion: marks job and document failed, preserves backend error and leaves existing Lesson draft intact", async () => {
    // 1. First successfully generate Lesson
    await queue.enqueueGenerationJob({
      actorUserId: actor.userId,
      actorRole: actor.role,
      organizationId: orgId,
      documentId: docId,
      courseId,
      types: ["lesson"],
      generationKey: "key-lesson-ok",
    });
    await new Promise((r) => setTimeout(r, 120));

    // Confirm Lesson exists
    let drafts = await genStore.listByDocument(docId, orgId);
    expect(drafts.filter((d) => d.type === "lesson" && d.deletedAt === null)).toHaveLength(1);

    // 2. Now simulate Multi-Key Quota Exhaustion on second generation (Flashcard + Exam)
    const quotaExhaustedGateway = {
      provider: "gemini" as const,
      async complete(): Promise<never> {
        throw new DomainError(
          "rate_limit_exceeded",
          "All configured Gemini API keys (2/2) are currently unavailable (key-1: quota_exhausted, key-2: quota_exhausted)",
        );
      },
    };

    const quotaService = new GenerationService(
      genStore,
      citStore,
      quotaExhaustedGateway,
      docStore,
      chunkStore,
      defaultPolicy,
      undefined,
      orgStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    const quotaQueue = new InMemoryGenerationQueue(jobStore, quotaService);

    const quotaJob = await quotaQueue.enqueueGenerationJob({
      actorUserId: actor.userId,
      actorRole: actor.role,
      organizationId: orgId,
      documentId: docId,
      courseId,
      types: ["flashcard", "quiz"],
      generationKey: "key-fc-quiz-quota",
    });

    await new Promise((r) => setTimeout(r, 120));

    // 3. Assertions: Job failed with backend technical error preserved
    const quotaJobRecord = await jobStore.findByIdForOrganization(quotaJob.generationJobId, orgId);
    expect(quotaJobRecord?.status).toBe("failed");
    expect(quotaJobRecord?.errorCode).toBe("rate_limit_exceeded");
    expect(quotaJobRecord?.errorMessage).toContain(
      "All configured Gemini API keys (2/2) are currently unavailable (key-1: quota_exhausted, key-2: quota_exhausted)",
    );

    // 4. Assertions: Document transitioned to failed (not stuck in generating)
    const docRecord = await docStore.findByIdForOrganization(docId, orgId);
    expect(docRecord?.status).toBe("failed");

    // 5. Assertions: Partial Generation Isolation - Lesson is still safe, no partial corrupted flashcards/quizzes
    drafts = await genStore.listByDocument(docId, orgId);
    const activeDrafts = drafts.filter((d) => d.deletedAt === null);
    expect(activeDrafts).toHaveLength(1);
    expect(activeDrafts[0].type).toBe("lesson");
    expect(activeDrafts.some((d) => d.type === "flashcard")).toBe(false);
    expect(activeDrafts.some((d) => d.type === "quiz")).toBe(false);
  });
});
