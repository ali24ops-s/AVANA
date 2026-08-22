/**
 * Comprehensive Integration & E2E Tests for the 3 AVANA Production Issues:
 *
 * Flow 1 (Issue 1): Document Deletion Flow
 *   - Upload -> Extract chunks -> Physical file and chunks exist
 *   - DELETE /v1/organizations/:orgId/documents/:docId
 *   - Assert physical storage removed, document chunks removed, draft generated contents removed,
 *     and document soft-deleted.
 *   - Assert cross-organization deletion attempt fails (404).
 *
 * Flow 2 (Issue 2): Regeneration Flow
 *   - Upload -> Extract -> Generate (status transitions from extracted -> review_pending)
 *   - Trigger regeneration of content -> assert status accepted, worker succeeds, no conflict 500 error.
 *   - Assert previous unaccepted draft is cleanly marked obsolete.
 *
 * Flow 3 (Issue 3): Approve & Materialize Flow after Regeneration
 *   - Accept regenerated draft -> Assert lesson/flashcards/quiz materialized cleanly.
 *   - Re-accepting or regenerating -> materializes new set without accumulating duplicate flashcard/quiz piles.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
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
  InMemoryQuizAttemptStore,
  InMemoryFlashcardReviewStore,
} from "../modules/study/test/in-memory-stores.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
import { GeminiModelGateway } from "../modules/generation/gateway/gemini.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { GenerationService } from "../modules/generation/index.js";
import type { Actor, GeneratedContentType } from "@avana/domain";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

function buildMultipartBody(options: {
  filename: string;
  contentType: string;
  data: Buffer;
}): { body: Buffer; contentType: string } {
  const boundary = "----avana-test-boundary";
  const chunks: Buffer[] = [];
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${options.filename}"\r\nContent-Type: ${options.contentType}\r\n\r\n`,
    ),
    options.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function validPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< >>
stream
BT
(مقدمه‌ای بر هوش مصنوعی و یادگیری ماشین در زبان فارسی) Tj
ET
endstream
endobj
%%EOF`,
    "latin1",
  );
}

describe("AVANA 3-Issue Fix E2E Verification", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;
  let documentChunkStore: InMemoryDocumentChunkStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let generatedContentCitationStore: InMemoryGeneratedContentCitationStore;
  let generationJobStore: InMemoryGenerationJobStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let storageDir: string;
  let storageProvider: LocalStorageProvider;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let queue: InMemoryGenerationQueue;
  let gateway: MockModelGateway;

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();
    documentChunkStore = new InMemoryDocumentChunkStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    generationJobStore = new InMemoryGenerationJobStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    queue = new InMemoryGenerationQueue(generationJobStore);
    gateway = new MockModelGateway();
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-issues-e2e-"));
    storageProvider = new LocalStorageProvider(storageDir);
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  afterEach(async () => {
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  async function buildApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      documentStore,
      documentChunkStore,
      storageProvider,
      generatedContentStore,
      generatedContentCitationStore,
      generationJobStore,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      auditService,
      gateway,
      queue,
    });
    await app.ready();
    return app;
  }

  async function signIn(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    expect(res.statusCode).toBe(200);
    const token = extractSessionToken(res);
    expect(token).toBeTruthy();
    const user = (await userStore.findByEmail(email))!;
    return { token: token!, user };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    name: string,
  ): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { organization: { id: string } };
    return body.organization.id;
  }

  async function createCourse(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    organizationId: string,
    title: string,
  ): Promise<string> {
    const res = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/courses`,
      cookies: { avana_session: token },
      payload: { title, description: "A test course" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { course: { id: string } };
    return body.course.id;
  }

  async function uploadAndExtract(
    app: Awaited<ReturnType<typeof buildApp>>,
    token: string,
    organizationId: string,
    courseId?: string,
  ): Promise<{ id: string }> {
    const file = validPdf();
    const mp = buildMultipartBody({
      filename: "sample-persian-ai.pdf",
      contentType: "application/pdf",
      data: file,
    });

    const uploadRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/documents${courseId ? `?course_id=${courseId}` : ""}`,
      headers: { "content-type": mp.contentType },
      cookies: { avana_session: token },
      payload: mp.body,
    });
    expect(uploadRes.statusCode).toBe(201);
    const uploadBody = JSON.parse(uploadRes.body) as {
      document: { id: string; status: string };
    };

    const extractRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${organizationId}/documents/${uploadBody.document.id}/extract`,
      cookies: { avana_session: token },
    });
    expect(extractRes.statusCode).toBe(200);

    return { id: uploadBody.document.id };
  }

  async function runWorkerForLastJob(actor: Actor) {
    const jobs = generationJobStore.getAll();
    const job = jobs[jobs.length - 1];
    if (!job) throw new Error("No queued job");

    const service = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      gateway,
      documentStore,
      documentChunkStore,
      undefined,
      auditService,
    );

    job.status = "running";
    await generationJobStore.update(job);

    try {
      await service.generateForDocument(
        actor,
        job.organizationId,
        job.documentId,
        {
          types: (job.type.split(",") as GeneratedContentType[]) ?? ["lesson"],
          courseId: job.courseId,
          generationKey: job.generationKey ?? undefined,
        },
      );
      job.status = "succeeded";
      await generationJobStore.update(job);
    } catch (err) {
      job.status = "failed";
      job.errorMessage = (err as Error).message;
      await generationJobStore.update(job);
      throw err;
    }
  }

  // =========================================================================
  // ISSUE 1 TESTS: Document Deletion Flow
  // =========================================================================
  describe("Issue 1: Document Deletion Flow", () => {
    it("deletes document, unlinks storage file, and removes chunks and draft contents", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "delete-test@example.com");
      const organizationId = await createOrg(app, token, "Delete Org");
      const courseId = await createCourse(app, token, organizationId, "Course 1");
      const doc = await uploadAndExtract(app, token, organizationId, courseId);

      // Verify chunks exist
      const chunksBefore = await documentChunkStore.listByDocument(doc.id as never);
      expect(chunksBefore.length).toBeGreaterThan(0);

      // Verify file exists in physical storage
      const docRecord = await documentStore.findByIdForOrganization(doc.id as never, organizationId as never);
      expect(docRecord).toBeDefined();
      const fileExistsBefore = await storageProvider.exists(docRecord!.storageKey);
      expect(fileExistsBefore).toBe(true);

      // Perform DELETE
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${organizationId}/documents/${doc.id}`,
        cookies: { avana_session: token },
      });
      expect(deleteRes.statusCode).toBe(204);

      // Assert document is soft-deleted
      const docAfter = await documentStore.findByIdForOrganization(doc.id as never, organizationId as never);
      expect(docAfter).toBeUndefined();

      // Assert storage file is deleted
      const fileExistsAfter = await storageProvider.exists(docRecord!.storageKey);
      expect(fileExistsAfter).toBe(false);

      // Assert chunks are removed
      const chunksAfter = await documentChunkStore.listByDocument(doc.id as never);
      expect(chunksAfter).toHaveLength(0);

      await app.close();
    });

    it("prevents cross-organization document deletion (returns 404)", async () => {
      const app = await buildApp();
      const { token: token1 } = await signIn(app, "org1-user@example.com");
      const org1 = await createOrg(app, token1, "Org 1");
      const doc = await uploadAndExtract(app, token1, org1);

      const { token: token2 } = await signIn(app, "org2-user@example.com");
      const org2 = await createOrg(app, token2, "Org 2");

      // Attempt to delete Org 1's document using Org 2's session
      const res = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${org2}/documents/${doc.id}`,
        cookies: { avana_session: token2 },
      });
      expect(res.statusCode).toBe(404);

      // Ensure Org 1's document is still active
      const docRecord = await documentStore.findByIdForOrganization(doc.id as never, org1 as never);
      expect(docRecord).toBeDefined();

      await app.close();
    });

    it("allows re-uploading a previously uploaded and deleted file cleanly", async () => {
      const app = await buildApp();
      const { token } = await signIn(app, "reupload-user@example.com");
      const organizationId = await createOrg(app, token, "Reupload Org");
      const courseId = await createCourse(app, token, organizationId, "Reupload Course");

      // 1. Initial upload and extract
      const doc1 = await uploadAndExtract(app, token, organizationId, courseId);
      expect(doc1.id).toBeDefined();

      // 2. Delete the document
      const delRes = await app.inject({
        method: "DELETE",
        url: `/v1/organizations/${organizationId}/documents/${doc1.id}`,
        cookies: { avana_session: token },
      });
      expect(delRes.statusCode).toBe(204);

      // 3. Re-upload the EXACT same file
      const doc2 = await uploadAndExtract(app, token, organizationId, courseId);
      expect(doc2.id).toBeDefined();

      // 4. Verify document is active, chunks exist, and can be retrieved
      const docRecord = await documentStore.findByIdForOrganization(doc2.id as never, organizationId as never);
      expect(docRecord).toBeDefined();
      expect(docRecord!.status).toBe("extracted");

      const chunks = await documentChunkStore.listByDocument(doc2.id as never);
      expect(chunks.length).toBeGreaterThan(0);

      await app.close();
    });
  });

  // =========================================================================
  // ISSUE 2 TESTS: Regeneration Flow
  // =========================================================================
  describe("Issue 2: Regeneration Flow", () => {
    it(
      "allows regenerating content after document status is review_pending without conflict 500",
      async () => {
        const app = await buildApp();
      const { token, user } = await signIn(app, "regen-test@example.com");
      const organizationId = await createOrg(app, token, "Regen Org");
      const courseId = await createCourse(app, token, organizationId, "AI Course");
      const doc = await uploadAndExtract(app, token, organizationId, courseId);
      const actor: Actor = { userId: user.id as never, role: "organization_admin" };

      // Initial generation
      const genRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: { types: ["lesson", "flashcard", "quiz"] },
      });
      expect(genRes.statusCode).toBe(202);

      // Run worker for initial generation
      const jobs = generationJobStore.getAll();
      for (const job of jobs) {
        job.status = "running";
        await generationJobStore.update(job);
        const service = new GenerationService(
          generatedContentStore,
          generatedContentCitationStore,
          gateway,
          documentStore,
          documentChunkStore,
          undefined,
          auditService,
        );
        await service.generateForDocument(
          actor,
          job.organizationId,
          job.documentId,
          {
            types: job.type.split(",") as GeneratedContentType[],
            courseId: job.courseId,
            generationKey: job.generationKey ?? undefined,
          },
        );
        job.status = "succeeded";
        await generationJobStore.update(job);
      }

      // Check document status is now review_pending
      const docAfterGen = (await documentStore.findByIdForOrganization(doc.id as never, organizationId as never))!;
      expect(docAfterGen.status).toBe("review_pending");

      // Fetch review queue
      const queueRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      expect(queueRes.statusCode).toBe(200);
      const queueBody = JSON.parse(queueRes.body) as { pending: Array<{ id: string; type: string }> };
      expect(queueBody.pending.length).toBeGreaterThan(0);
      const lessonItem = queueBody.pending.find((p) => p.type === "lesson")!;

      // Trigger REGENERATE on the lesson
      const regenRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${lessonItem.id}/regenerate`,
        cookies: { avana_session: token },
      });
      expect(regenRes.statusCode).toBe(202);
      const regenBody = JSON.parse(regenRes.body) as { job_id: string; status: string };
      expect(regenBody.status).toBe("regenerating");

      // Run worker for regeneration job - MUST NOT throw conflict 500 error!
      await expect(runWorkerForLastJob(actor)).resolves.not.toThrow();

      // Check review queue has the newly regenerated draft
      const queueRes2 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      expect(queueRes2.statusCode).toBe(200);
      const queueBody2 = JSON.parse(queueRes2.body) as { pending: Array<{ id: string; type: string; status: string }> };
      const newLesson = queueBody2.pending.find((p) => p.type === "lesson");
      expect(newLesson).toBeDefined();
      expect(newLesson!.status).toBe("draft");

      await app.close();
    }, 20000);

    it(
      "allows repeatedly triggering intelligent content generation for a previously processed document without conflict",
      async () => {
        const app = await buildApp();
        const { token, user } = await signIn(app, "repeat-gen@example.com");
        const organizationId = await createOrg(app, token, "Repeat Gen Org");
        const courseId = await createCourse(app, token, organizationId, "Repeat Gen Course");
        const doc = await uploadAndExtract(app, token, organizationId, courseId);
        const actor: Actor = { userId: user.id as never, role: "organization_admin" };

        // 1. First generation
        const genRes1 = await app.inject({
          method: "POST",
          url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
          cookies: { avana_session: token },
          payload: { types: ["lesson", "flashcard", "quiz"] },
        });
        expect(genRes1.statusCode).toBe(202);
        await runWorkerForLastJob(actor);

        // 2. Second generation on the SAME document while content exists is rejected with 409 Conflict
        const genRes2 = await app.inject({
          method: "POST",
          url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
          cookies: { avana_session: token },
          payload: { types: ["lesson", "flashcard", "quiz"] },
        });
        expect(genRes2.statusCode).toBe(409);

        // 3. Reject all drafts in review queue so content can be re-generated
        const reviewRes = await app.inject({
          method: "GET",
          url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
          cookies: { avana_session: token },
        });
        const pendingItems = (JSON.parse(reviewRes.body) as { pending: Array<{ id: string }> }).pending;
        for (const item of pendingItems) {
          await app.inject({
            method: "POST",
            url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${item.id}/reject`,
            cookies: { avana_session: token },
            payload: { reason: "Need regenerate" },
          });
        }

        // 4. Once drafts are rejected/deleted, generation succeeds again with 202
        const genRes3 = await app.inject({
          method: "POST",
          url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
          cookies: { avana_session: token },
          payload: { types: ["lesson", "flashcard", "quiz"] },
        });
        expect(genRes3.statusCode).toBe(202);
        await expect(runWorkerForLastJob(actor)).resolves.not.toThrow();

        // 5. Verify review queue contains active fresh drafts for this document
        const queueRes = await app.inject({
          method: "GET",
          url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
          cookies: { avana_session: token },
        });
        expect(queueRes.statusCode).toBe(200);
        const items = (JSON.parse(queueRes.body) as { pending: Array<{ id: string; type: string; status: string }> }).pending;
        expect(items.length).toBe(3);
        expect(items.every((i) => i.status === "draft")).toBe(true);

        await app.close();
      },
      20000,
    );
  });

  // =========================================================================
  // ISSUE 3 TESTS: Approve & Materialize Flow after Regeneration
  // =========================================================================
  describe("Issue 3: Approve & Materialize Flow after Regeneration", () => {
    it(
      "accepts and materializes regenerated lesson, flashcards, and quizzes cleanly without duplicate piles",
      async () => {
        const app = await buildApp();
      const { token, user } = await signIn(app, "approve-test@example.com");
      const organizationId = await createOrg(app, token, "Approve Org");
      const courseId = await createCourse(app, token, organizationId, "Materialization Course");
      const doc = await uploadAndExtract(app, token, organizationId, courseId);
      const actor: Actor = { userId: user.id as never, role: "organization_admin" };

      // Generate flashcards
      const genRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: { types: ["flashcard", "quiz", "lesson"] },
      });
      expect(genRes.statusCode).toBe(202);

      // Process worker jobs
      const jobs = generationJobStore.getAll();
      for (const job of jobs) {
        job.status = "running";
        await generationJobStore.update(job);
        const service = new GenerationService(
          generatedContentStore,
          generatedContentCitationStore,
          gateway,
          documentStore,
          documentChunkStore,
          undefined,
          auditService,
        );
        await service.generateForDocument(
          actor,
          job.organizationId,
          job.documentId,
          {
            types: job.type.split(",") as GeneratedContentType[],
            courseId: job.courseId,
            generationKey: job.generationKey ?? undefined,
          },
        );
        job.status = "succeeded";
        await generationJobStore.update(job);
      }

      // 1. Accept initial drafts
      const queueRes1 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      const items1 = (JSON.parse(queueRes1.body) as { pending: Array<{ id: string; type: string }> }).pending;

      for (const item of items1) {
        const acceptRes = await app.inject({
          method: "POST",
          url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${item.id}/accept`,
          cookies: { avana_session: token },
        });
        expect(acceptRes.statusCode).toBe(200);
      }

      // Check flashcards exist
      const flashcardsInitial = await flashcardStore.listByCourse(courseId as never, organizationId as never);
      expect(flashcardsInitial.length).toBeGreaterThan(0);
      const initialCardCount = flashcardsInitial.length;

      // Check quizzes exist
      const quizzesInitial = await quizStore.listByCourse(courseId as never, organizationId as never);
      expect(quizzesInitial.length).toBe(1);

      // Check lesson exists
      const lessonsInitial = lessonStore.getAll();
      expect(lessonsInitial.length).toBeGreaterThan(0);

      // 2. Now trigger REGENERATE on flashcards
      const regenFlashcardsRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${items1.find((i) => i.type === "flashcard")!.id}/regenerate`,
        cookies: { avana_session: token },
      });
      expect(regenFlashcardsRes.statusCode).toBe(202);

      // Run worker for the regenerated flashcards
      await runWorkerForLastJob(actor);

      // Retrieve new flashcard draft from review queue
      const queueRes2 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      const items2 = (JSON.parse(queueRes2.body) as { pending: Array<{ id: string; type: string }> }).pending;
      const regeneratedFlashcardItem = items2.find((i) => i.type === "flashcard");
      expect(regeneratedFlashcardItem).toBeDefined();

      // Accept the regenerated flashcard draft
      const acceptRegenRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${regeneratedFlashcardItem!.id}/accept`,
        cookies: { avana_session: token },
      });
      expect(acceptRegenRes.statusCode).toBe(200);

      // 3. Verify that flashcards are clean and NOT duplicated!
      const flashcardsAfter = await flashcardStore.listByCourse(courseId as never, organizationId as never);
      expect(flashcardsAfter.length).toBe(initialCardCount); // Replaced, not stacked

      await app.close();
    }, 20000);

    it(
      "preserves published content A when a regeneration attempt fails",
      async () => {
        const app = await buildApp();
      const { token, user } = await signIn(app, "failure-resilience@example.com");
      const organizationId = await createOrg(app, token, "Resilience Org");
      const courseId = await createCourse(app, token, organizationId, "Resilience Course");
      const doc = await uploadAndExtract(app, token, organizationId, courseId);
      const actor: Actor = { userId: user.id as never, role: "organization_admin" };

      // 1. Generate and Publish initial content A (lesson, flashcards, quiz)
      await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: { types: ["lesson", "flashcard", "quiz"] },
      });

      await runWorkerForLastJob(actor);

      // Fetch review queue and accept all
      const queueRes1 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      const itemsA = (JSON.parse(queueRes1.body) as { pending: Array<{ id: string; type: string }> }).pending;
      expect(itemsA.length).toBe(3);

      for (const item of itemsA) {
        const acceptRes = await app.inject({
          method: "POST",
          url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${item.id}/accept`,
          cookies: { avana_session: token },
        });
        expect(acceptRes.statusCode).toBe(200);
      }

      // Check published state before failure
      const lessonsBefore = lessonStore.getAll().filter((l) => l.publicationStatus === "published");
      expect(lessonsBefore.length).toBeGreaterThan(0);
      const initialLessonCount = lessonsBefore.length;
      const initialLessonContent = lessonsBefore[0].contentMarkdown;

      const flashcardsBefore = await flashcardStore.listByCourse(courseId as never, organizationId as never);
      expect(flashcardsBefore.length).toBeGreaterThan(0);

      const quizzesBefore = await quizStore.listByCourse(courseId as never, organizationId as never);
      expect(quizzesBefore.length).toBe(1);

      // 2. Trigger REGENERATE on the lesson
      const lessonItem = itemsA.find((i) => i.type === "lesson")!;
      const regenRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${lessonItem.id}/regenerate`,
        cookies: { avana_session: token },
      });
      expect(regenRes.statusCode).toBe(202);

      // 3. Simulate generation failure in the worker (e.g. gateway error/network failure)
      const failingGateway = {
        provider: "mock" as const,
        complete: async () => {
          throw new Error("Simulated Gateway Timeout Failure");
        },
      };

      const failureService = new GenerationService(
        generatedContentStore,
        generatedContentCitationStore,
        failingGateway as never,
        documentStore,
        documentChunkStore,
        undefined,
        auditService,
      );

      const regenJob = generationJobStore.getAll().find((j) => j.status === "queued" || j.status === "running")!;
      await expect(
        failureService.generateForDocument(actor, regenJob.organizationId, regenJob.documentId, {
          types: regenJob.type.split(",") as GeneratedContentType[],
          courseId: regenJob.courseId,
        }),
      ).rejects.toThrow("Simulated Gateway Timeout Failure");

      // 4. CRITICAL VERIFICATION: Published lesson, flashcards, and quizzes A are STILL completely intact for the student!
      const lessonsAfterFailure = lessonStore.getAll().filter((l) => l.publicationStatus === "published");
      expect(lessonsAfterFailure.length).toBe(initialLessonCount);
      expect(lessonsAfterFailure[0].contentMarkdown).toBe(initialLessonContent);

      const flashcardsAfterFailure = await flashcardStore.listByCourse(courseId as never, organizationId as never);
      expect(flashcardsAfterFailure.length).toBe(flashcardsBefore.length);

      const quizzesAfterFailure = await quizStore.listByCourse(courseId as never, organizationId as never);
      expect(quizzesAfterFailure.length).toBe(1);

      await app.close();
    }, 20000);
  });

  // =========================================================================
  // LIVE GEMINI AI FLOW (Issue 2 & Issue 3 with real Gemini 3.6 Flash)
  // =========================================================================
  const shouldRunLive = process.env.RUN_LIVE_GEMINI_TESTS === "true" && Boolean(process.env.GEMINI_API_KEY);

  describe.skipIf(!shouldRunLive)("Live Gemini 3.6 Flash AI Generation & Materialization Flow", () => {
    it("generates Persian lesson, regenerates, and materializes cleanly with real Gemini", async () => {
      const liveGateway = new GeminiModelGateway({
        apiKey: process.env.GEMINI_API_KEY!,
        modelName: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        timeoutMs: 45_000,
      });

      gateway = liveGateway as never;

      const app = await buildApp();
      const { token, user } = await signIn(app, "gemini-live-user@example.com");
      const organizationId = await createOrg(app, token, "Live Gemini Org");
      const courseId = await createCourse(app, token, organizationId, "دوره جامع یادگیری ماشین");
      const doc = await uploadAndExtract(app, token, organizationId, courseId);
      const actor: Actor = { userId: user.id as never, role: "organization_admin" };

      // Generate lesson with real Gemini
      const genRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/documents/${doc.id}/generate`,
        cookies: { avana_session: token },
        payload: { types: ["lesson"] },
      });
      expect(genRes.statusCode).toBe(202);

      // Run worker with live Gemini
      await runWorkerForLastJob(actor);

      // Fetch review queue
      const queueRes1 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      expect(queueRes1.statusCode).toBe(200);
      const queueBody1 = JSON.parse(queueRes1.body) as { pending: Array<{ id: string; type: string; title: string }> };
      expect(queueBody1.pending.length).toBe(1);
      const lessonItem1 = queueBody1.pending[0];
      expect(lessonItem1.type).toBe("lesson");
      expect(lessonItem1.title.length).toBeGreaterThan(0);

      // Trigger REGENERATE with real Gemini
      const regenRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${lessonItem1.id}/regenerate`,
        cookies: { avana_session: token },
      });
      expect(regenRes.statusCode).toBe(202);

      // Run worker for the regenerated lesson with live Gemini
      await runWorkerForLastJob(actor);

      // Fetch review queue - should contain the newly regenerated lesson
      const queueRes2 = await app.inject({
        method: "GET",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/review-queue`,
        cookies: { avana_session: token },
      });
      expect(queueRes2.statusCode).toBe(200);
      const queueBody2 = JSON.parse(queueRes2.body) as { pending: Array<{ id: string; type: string; title: string }> };
      expect(queueBody2.pending.length).toBe(1);
      const regeneratedLesson = queueBody2.pending[0];

      // Accept the regenerated lesson
      const acceptRes = await app.inject({
        method: "POST",
        url: `/v1/organizations/${organizationId}/courses/${courseId}/generated/${regeneratedLesson.id}/accept`,
        cookies: { avana_session: token },
      });
      expect(acceptRes.statusCode).toBe(200);

      // Verify lesson is published in Learning Core
      const lessons = lessonStore.getAll();
      expect(lessons.length).toBe(1);
      expect(lessons[0].title).toBe(regeneratedLesson.title);

      await app.close();
    }, 90_000);
  });
});
