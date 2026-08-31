import { describe, it, expect, beforeEach } from "vitest";
import type {
  Actor,
  CourseId,
  DocumentId,
  GeneratedContentId,
  OrganizationId,
  UserId,
} from "@avana/domain";
import { defaultPolicy } from "@avana/domain";

import { ReviewService } from "../modules/generation/review-service.js";
import type { GenerationQueueService } from "../modules/generation/generation-queue.js";
import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryGeneratedContentStore,
  InMemoryGeneratedContentCitationStore,
} from "../modules/generation/test/in-memory-stores.js";
import {
  InMemoryDocumentStore,
  InMemoryDocumentChunkStore,
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
} from "../modules/study/test/in-memory-stores.js";

describe("Quiz & Educational Content Approval/Publish & Exam Integration", () => {
  let orgId: OrganizationId;
  let courseId: CourseId;
  let docId: DocumentId;
  let actor: Actor;

  let documentStore: InMemoryDocumentStore;
  let chunkStore: InMemoryDocumentChunkStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let generatedContentStore: InMemoryGeneratedContentStore;
  let citationStore: InMemoryGeneratedContentCitationStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;

  let reviewService: ReviewService;
  let studyService: StudyService;

  beforeEach(() => {
    orgId = "11111111-1111-4111-8111-111111111111" as OrganizationId;
    courseId = "22222222-2222-4222-8222-222222222222" as CourseId;
    docId = "33333333-3333-4333-8333-333333333333" as DocumentId;
    actor = {
      userId: "user-1" as UserId,
      role: "organization_admin",
    };

    documentStore = new InMemoryDocumentStore();
    chunkStore = new InMemoryDocumentChunkStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    generatedContentStore = new InMemoryGeneratedContentStore();
    citationStore = new InMemoryGeneratedContentCitationStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();

    const dummyQueue = {
      enqueueGenerationJob: async () => ({ generationJobId: "job-1" }),
    } as unknown as GenerationQueueService;

    reviewService = new ReviewService(
      generatedContentStore,
      citationStore,
      documentStore,
      chunkStore,
      moduleStore,
      lessonStore,
      defaultPolicy,
      dummyQueue,
      undefined,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    );

    studyService = new StudyService(
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      defaultPolicy,
      undefined,
      undefined,
      undefined,
      courseStore,
    );
  });

  it("should materialize educational content and quiz content into Learning Core & Exam Engine", async () => {
    const now = new Date().toISOString();

    // 1. Setup Document in DocumentStore
    const documentName = "قلب و عروق.pdf";
    documentStore.insert({
      id: docId,
      organizationId: orgId,
      courseId,
      ownerUserId: "user-1" as UserId,
      originalName: documentName,
      mimeType: "application/pdf",
      sizeBytes: 1024,
      sha256: "hash123",
      storageKey: "key123",
      status: "ready",
      pageCount: 10,
      errorCode: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 2. Setup Course in CourseStore
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "دوره جامع فیزیولوژی",
        subject: null,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    // 3. Create Draft Educational Content (Lesson)
    const lessonContentId = "gen-1" as GeneratedContentId;
    generatedContentStore.insert({
      id: lessonContentId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "lesson",
      status: "draft",
      payload: {
        kind: "lesson",
        title: "فیزیولوژی عروق و فشار خون",
        contentMarkdown: "# مکانیسم‌های تنظیم فشار خون\nسیستم رنین-آنژیوتانسیون...",
        citationChunkIds: [],
      },
      generationKey: null,
      previousPayload: null,
      promptVersion: "1.0",
      model: "gemini-2.5-flash",
      tokenUsage: { inputTokens: 100, outputTokens: 200 },
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      acceptedBy: null,
      acceptedAt: null,
      materializedLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 4. Create Draft Exam/Quiz Content (Quiz)
    const quizContentId = "gen-2" as GeneratedContentId;
    generatedContentStore.insert({
      id: quizContentId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      type: "quiz",
      status: "draft",
      payload: {
        kind: "quiz",
        title: "آزمون فیزیولوژی عروق",
        citationChunkIds: [],
        questions: [
          {
            question: "کدام هورمون باعث انقباض عروق و افزایش فشار خون می‌شود؟",
            questionType: "multiple_choice",
            choices: ["آنژیوتانسیون ۲", "برادی‌کینین", "نیتریک اکساید", "هیستامین"],
            correctAnswer: "آنژیوتانسیون ۲",
            explanation: "آنژیوتانسیون ۲ یک پپتید قوی منقبض‌کننده عروقی است.",
          },
          {
            question: "محل اصلی تنظیم مقاومت عروق محیطی کدام است؟",
            questionType: "multiple_choice",
            choices: ["آرتریول‌ها", "کاپیلارها", "وریدچه‌ها", "دهلیز راست"],
            correctAnswer: "آرتریول‌ها",
            explanation: "آرتریول‌ها بیشترین سهم را در مقاومت محیطی دارند.",
          },
        ],
      },
      generationKey: null,
      previousPayload: null,
      promptVersion: "1.0",
      model: "gemini-2.5-flash",
      tokenUsage: { inputTokens: 100, outputTokens: 200 },
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      editedBy: null,
      editedAt: null,
      acceptedBy: null,
      acceptedAt: null,
      materializedLessonId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 5. Approve & Publish Educational Content
    const lessonPublishRes = await reviewService.acceptContent(actor, orgId, lessonContentId);
    expect(lessonPublishRes.status).toBe("accepted");
    expect(lessonPublishRes.materialized_lesson_id).toBeDefined();

    // Verify Lesson is created in Learning Core
    const createdLessons = lessonStore.getAll();
    expect(createdLessons.length).toBeGreaterThanOrEqual(1);
    const materializedLesson = createdLessons.find((l) => l.title.includes("فیزیولوژی عروق و فشار خون"));
    expect(materializedLesson).toBeDefined();
    expect(materializedLesson?.publicationStatus).toBe("published");

    // 6. Approve & Publish Quiz Content (must not throw Internal Error)
    const quizPublishRes = await reviewService.acceptContent(actor, orgId, quizContentId);
    expect(quizPublishRes.status).toBe("accepted");

    // 7. Verify Quiz & QuizQuestions materialized in Learning Core
    const quizzes = quizStore.getAll();
    expect(quizzes.length).toBe(1);
    expect(quizzes[0].status).toBe("published");
    expect(quizzes[0].courseId).toBe(courseId);
    expect(quizzes[0].documentId).toBe(docId);

    const questions = await quizQuestionStore.listByQuiz(quizzes[0].id);
    expect(questions).toHaveLength(2);

    // Verify fields materialized correctly
    const q1 = questions.find((q) => q.question.includes("انقباض عروق"));
    expect(q1).toBeDefined();
    expect(q1?.choices).toEqual(expect.arrayContaining(["آنژیوتانسیون ۲", "برادی‌کینین", "نیتریک اکساید", "هیستامین"]));
    expect(q1?.correctAnswer).toBe("آنژیوتانسیون ۲");
    expect(q1?.difficulty).toBe("medium");
    expect(q1?.explanation).toContain("آنژیوتانسیون ۲");

    const q2 = questions.find((q) => q.question.includes("مقاومت عروق"));
    expect(q2).toBeDefined();
    expect(q2?.choices).toEqual(expect.arrayContaining(["آرتریول‌ها", "کاپیلارها", "وریدچه‌ها", "دهلیز راست"]));
    expect(q2?.correctAnswer).toBe("آرتریول‌ها");

    // 8. Verify GET /v1/organizations/:organizationId/study/exams/topics
    const topicSummary = await studyService.getExamTopicSummary(actor, orgId);
    expect(topicSummary.sections).toBeDefined();
    expect(topicSummary.sections.length).toBeGreaterThan(0);

    // 9. Verify starting an Exam with the materialized Lesson/Topic
    const examStartResult = await studyService.startConfiguredExamAttempt(actor, orgId, {
      chapters: [materializedLesson!.id],
      questionCount: 2,
      difficulty: "all",
    });

    expect(examStartResult.attemptId).toBeDefined();
    expect(examStartResult.questions).toHaveLength(2);
    expect(examStartResult.questions[0]).not.toHaveProperty("correctAnswer"); // Security: stripped in attempt response
  });
});
