import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import { createModelGateway } from "../modules/generation/gateway/index.js";
import { InMemoryGenerationQueue } from "../modules/generation/generation-queue.js";
import { GenerationService } from "../modules/generation/index.js";
import { defaultPolicy } from "@avana/domain";
import { loadMonorepoEnv } from "@avana/config";

loadMonorepoEnv();

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
  const boundary = "----avana-e2e-boundary";
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

const shouldRunLive = process.env.RUN_LIVE_TESTS === "true";

describe.skipIf(!shouldRunLive)("Real User End-to-End Flow (Upload → Real Gemini → Materialize → Learning Experience)", () => {
  let tempStorageDir: string;

  beforeAll(async () => {
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), "avana-e2e-real-"));
  });

  afterAll(async () => {
    await fs.rm(tempStorageDir, { recursive: true, force: true });
  });

  it("successfully executes the complete user journey with real Gemini generation", async () => {
    // 1. Load Real Persian PDF from storage
    const realPdfPath = path.resolve(
      "./storage/uploads/uploads/1d36a907-4e4d-4c05-9e0f-4f41379d9241.pdf",
    );
    try {
      await fs.access(realPdfPath);
    } catch {
      console.warn("Skipping real PDF live test: file not found at", realPdfPath);
      return;
    }
    const realPdfBuffer = await fs.readFile(realPdfPath);
    expect(realPdfBuffer.length).toBeGreaterThan(10000);

    // 2. Setup Server with Real Gemini Gateway
    process.env.NODE_ENV = "test";
    process.env.AVANA_API_PORT = "0";
    const config = loadApiConfig();

    const sessionStore = new InMemorySessionStore();
    const userStore = new InMemoryUserStore();
    const organizationStore = new InMemoryOrganizationStore();
    const courseStore = new InMemoryCourseStore();
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();
    const documentStore = new InMemoryDocumentStore();
    const documentChunkStore = new InMemoryDocumentChunkStore();
    const generatedContentStore = new InMemoryGeneratedContentStore();
    const generatedContentCitationStore = new InMemoryGeneratedContentCitationStore();
    const generationJobStore = new InMemoryGenerationJobStore();

    const flashcardStore = new InMemoryFlashcardStore();
    const flashcardReviewStore = new InMemoryFlashcardReviewStore();
    const quizStore = new InMemoryQuizStore();
    const quizQuestionStore = new InMemoryQuizQuestionStore();
    const quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);

    const auditStore = new InMemoryAuditStore();
    const auditService = new AuditService(auditStore);
    const storageProvider = new LocalStorageProvider(tempStorageDir);

    // Model Gateway: Uses live Gemini when live flag or key is enabled, otherwise mock in sandboxed CI
    const useLiveGemini = process.env.RUN_LIVE_GEMINI_TESTS === "true";
    const gateway = useLiveGemini ? createModelGateway("gemini") : createModelGateway("mock");

    const generationService = new GenerationService(
      generatedContentStore,
      generatedContentCitationStore,
      gateway,
      documentStore,
      documentChunkStore,
      defaultPolicy,
      auditService,
      organizationStore,
    );

    const queue = new InMemoryGenerationQueue(generationJobStore, generationService);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
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
      queue,
      gateway,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      auditService,
    });
    await app.ready();

    // 3. User Sign-In & Authentication via HTTP API
    const signInRes = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email: "pharmacist@example.com", name: "دکتر داروساز" },
    });
    expect(signInRes.statusCode).toBe(200);
    const sessionToken = extractSessionToken(signInRes);
    expect(sessionToken).toBeTruthy();

    const authCookies = { avana_session: sessionToken! };

    // 4. Create Organization via HTTP API
    const createOrgRes = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: authCookies,
      payload: { name: "Pharmacy Faculty" },
    });
    expect(createOrgRes.statusCode).toBe(201);
    const orgBody = JSON.parse(createOrgRes.body) as { organization: { id: string } };
    const orgId = orgBody.organization.id;

    // 5. Create Course via HTTP API
    const createCourseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: authCookies,
      payload: {
        title: "فارماسیوتیکس اشکال دارویی پوستی",
        description: "بررسی کامل فرآورده‌های موضعی، پایه‌های پماد و سامانه‌های نوین",
      },
    });
    expect(createCourseRes.statusCode).toBe(201);
    const courseBody = JSON.parse(createCourseRes.body) as { course: { id: string } };
    const courseId = courseBody.course.id;

    // 6. STEP A & B & C: Real PDF Document Upload & Extraction
    const uploadPayload = buildMultipartBody({
      filename: "Dermatological_Forms.pdf",
      contentType: "application/pdf",
      data: realPdfBuffer,
    });

    const uploadRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents?course_id=${courseId}`,
      cookies: authCookies,
      headers: {
        "content-type": uploadPayload.contentType,
      },
      payload: uploadPayload.body,
    });

    expect(uploadRes.statusCode).toBe(201);
    const uploadBody = JSON.parse(uploadRes.body);
    const uploadedDoc = uploadBody.document;
    expect(uploadedDoc.id).toBeDefined();

    // Trigger Extraction
    const extractRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/documents/${uploadedDoc.id}/extract`,
      cookies: authCookies,
    });
    expect(extractRes.statusCode).toBe(200);
    const extractBody = JSON.parse(extractRes.body);
    expect(extractBody.status.status).toBe("extracted");
    expect(extractBody.status.page_count).toBe(6);
    expect(extractBody.status.chunk_count).toBe(6);

    // Verify Chunks in Store
    const persistedChunks = await documentChunkStore.listByDocument(uploadedDoc.id);
    expect(persistedChunks.length).toBe(6);
    expect(persistedChunks[0].content).toContain("Conventional");

    // 7. STEP D & E: Trigger Real Gemini Generation
    const genTriggerRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${uploadedDoc.id}/generate`,
      cookies: authCookies,
      headers: {
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        types: ["lesson", "flashcard", "quiz"],
      }),
    });

    expect(genTriggerRes.statusCode).toBe(202);
    const genJob = JSON.parse(genTriggerRes.body);
    expect(genJob.job_id).toBeDefined();

    // Poll for generation completion
    let attempts = 0;
    let jobCompleted = false;
    while (attempts < 120 && !jobCompleted) {
      const jobStatusRes = await app.inject({
        method: "GET",
        url: `/v1/organizations/${orgId}/courses/${courseId}/documents/${uploadedDoc.id}/generate/jobs/${genJob.job_id}`,
        cookies: authCookies,
      });
      const currentJob = JSON.parse(jobStatusRes.body);
      if (currentJob.job.status === "succeeded") {
        jobCompleted = true;
        break;
      }
      if (currentJob.job.status === "failed") {
        throw new Error(`Generation job failed: ${currentJob.job.error_message || currentJob.job.error_code || JSON.stringify(currentJob.job)}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
      attempts++;
    }

    expect(jobCompleted).toBe(true);

    // 8. STEP F & G & H: Verify Generated Drafts & Review Queue
    const reviewQueueRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/generated/review-queue`,
      cookies: authCookies,
    });

    expect(reviewQueueRes.statusCode).toBe(200);
    const reviewQueue = JSON.parse(reviewQueueRes.body);
    expect(reviewQueue.pending.length).toBe(3);

    type ReviewQueueItem = {
      id: string;
      document_id: string;
      course_id: string;
      type: string;
      status: string;
      title: string;
    };

    const lessonDraft = (reviewQueue.pending as ReviewQueueItem[]).find((item) => item.type === "lesson");
    const flashcardDraft = (reviewQueue.pending as ReviewQueueItem[]).find((item) => item.type === "flashcard");
    const quizDraft = (reviewQueue.pending as ReviewQueueItem[]).find((item) => item.type === "quiz");

    expect(lessonDraft).toBeDefined();
    expect(lessonDraft?.title.length).toBeGreaterThan(0);

    expect(flashcardDraft).toBeDefined();
    expect(flashcardDraft?.title.length).toBeGreaterThan(0);

    expect(quizDraft).toBeDefined();
    expect(quizDraft?.title.length).toBeGreaterThan(0);

    // Fetch full lesson draft detail
    const lessonDetailRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/courses/${courseId}/generated/${lessonDraft!.id}`,
      cookies: authCookies,
    });
    expect(lessonDetailRes.statusCode).toBe(200);
    const lessonDetail = JSON.parse(lessonDetailRes.body);
    expect(lessonDetail.content).toBeDefined();
    expect(lessonDetail.content.status).toBe("draft");
    expect(lessonDetail.source_chunks.length).toBeGreaterThanOrEqual(1);

    // 9. STEP I: Materialize / Accept Drafts into Learning Core
    expect(lessonDraft).toBeDefined();
    expect(flashcardDraft).toBeDefined();
    expect(quizDraft).toBeDefined();

    const acceptLessonRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/generated/${lessonDraft!.id}/accept`,
      cookies: authCookies,
      payload: {},
    });
    expect(acceptLessonRes.statusCode).toBe(200);

    const acceptFlashcardsRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/generated/${flashcardDraft!.id}/accept`,
      cookies: authCookies,
      payload: {},
    });
    expect(acceptFlashcardsRes.statusCode).toBe(200);

    const acceptQuizRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses/${courseId}/generated/${quizDraft!.id}/accept`,
      cookies: authCookies,
      payload: {},
    });
    expect(acceptQuizRes.statusCode).toBe(200);

    // Verify document status
    const docCheckRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgId}/documents/${uploadedDoc.id}`,
      cookies: authCookies,
    });
    expect(docCheckRes.statusCode).toBe(200);
    const docCheck = JSON.parse(docCheckRes.body);
    expect(["review_pending", "completed"]).toContain(docCheck.document.status);

    // 10. STEP J & K: Student Experience — Fetch Learning Data (LearningPage APIs)
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: authCookies,
    });

    expect(learnRes.statusCode).toBe(200);
    const learnData = JSON.parse(learnRes.body);
    expect(learnData.modules.length).toBeGreaterThanOrEqual(1);
    expect(learnData.modules[0].lessons.length).toBeGreaterThanOrEqual(2);

    const firstLesson = learnData.modules[0].lessons[0];
    expect(firstLesson.title).toBeDefined();
    expect(firstLesson.content_markdown).toContain("#");
    expect(firstLesson.completed).toBe(false);

    // Mark Lesson as Completed
    const completeLessonRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/lessons/${firstLesson.id}/progress`,
      cookies: authCookies,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ completed: true }),
    });
    expect(completeLessonRes.statusCode).toBe(200);

    // Verify Progress Updated
    const updatedLearnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: authCookies,
    });
    const updatedLearnData = JSON.parse(updatedLearnRes.body);
    expect(updatedLearnData.progress.completed_lessons).toBe(1);
    expect(updatedLearnData.progress.progress_percent).toBeGreaterThan(0);

    // 11. Study Flashcards API
    const flashcardsRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/flashcards`,
      cookies: authCookies,
    });
    expect(flashcardsRes.statusCode).toBe(200);
    const flashcardsData = JSON.parse(flashcardsRes.body);
    expect(flashcardsData.items.length).toBeGreaterThanOrEqual(5);
    expect(flashcardsData.items[0].question).toBeDefined();
    expect(flashcardsData.items[0].answer).toBeDefined();

    // 12. Study Quizzes API & Attempt Submission
    const quizzesRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/quizzes`,
      cookies: authCookies,
    });
    expect(quizzesRes.statusCode).toBe(200);
    const quizzesData = JSON.parse(quizzesRes.body);
    expect(quizzesData.items.length).toBeGreaterThanOrEqual(1);

    const activeQuiz = quizzesData.items[0];
    expect(activeQuiz.questions.length).toBeGreaterThanOrEqual(3);

    // Submit Quiz Attempt
    const question1 = activeQuiz.questions[0];
    const attemptPayload = {
      answers: [
        {
          questionId: question1.id,
          selectedChoice: question1.correct_answer,
        },
      ],
    };

    const submitAttemptRes = await app.inject({
      method: "POST",
      url: `/v1/courses/${courseId}/quizzes/${activeQuiz.id}/attempts`,
      cookies: authCookies,
      headers: {
        "content-type": "application/json",
      },
      payload: JSON.stringify(attemptPayload),
    });

    expect(submitAttemptRes.statusCode).toBe(201);
    const attemptResult = JSON.parse(submitAttemptRes.body);
    expect(attemptResult.score).toBe(1);
    expect(attemptResult.maxScore).toBe(1);
    expect(attemptResult.passed).toBe(true);

    // 13. Study Analytics API
    const analyticsRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/study-analytics`,
      cookies: authCookies,
    });
    expect(analyticsRes.statusCode).toBe(200);
    const analyticsData = JSON.parse(analyticsRes.body);
    expect(analyticsData.summary).toBeDefined();
  }, 240000);
});
