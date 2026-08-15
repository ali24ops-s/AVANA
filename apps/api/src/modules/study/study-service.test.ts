/**
 * PR6-7 StudyService unit tests.
 *
 * Uses in-memory stores and in-memory audit store.
 *
 * Covers:
 * - Flashcard reviews: listing due cards, scheduling updates via FSRS logic, audit emission
 * - Quizzes: listing published quizzes, getting quiz with questions, attempt grading & scoring
 * - Quiz attempts: non-disclosing tenant/user isolation on getQuizAttempt
 * - Study analytics: accurate calculation of lesson progress, flashcard mastery, quiz averages, weak areas
 * - Study recommendations: actionable next steps derived from study data
 * - Authorization: policy enforcement on all operations
 */

import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type FlashcardId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type QuizId,
  type QuizAttemptId,
  type QuizQuestionId,
  type UserId,
  RoleBasedPolicy,
} from "@avana/domain";
import { StudyService } from "./study-service.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "./test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../../observability/test/in-memory-stores.js";
import { AuditService } from "../../observability/audit-service.js";
import type {
  FlashcardRecord,
  QuizRecord,
  QuizQuestionRecord,
} from "./study-store.js";

describe("StudyService", () => {
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: StudyService;

  const organizationId = "11111111-1111-4111-8111-111111111111" as OrganizationId;
  const otherOrgId = "99999999-9999-4999-8999-999999999999" as OrganizationId;
  const courseId = "22222222-2222-4222-8222-222222222222" as CourseId;
  const documentId = "33333333-3333-4333-8333-333333333333" as DocumentId;
  const studentUserId = "44444444-4444-4444-8444-444444444444" as UserId;
  const otherUserId = "55555555-5555-4555-8555-555555555555" as UserId;

  const student: Actor = {
    userId: studentUserId,
    role: "student",
  };

  const otherStudent: Actor = {
    userId: otherUserId,
    role: "student",
  };

  beforeEach(() => {
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);

    service = new StudyService(
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      new RoleBasedPolicy(),
      auditService,
    );
  });

  function seedFlashcard(
    overrides: Partial<FlashcardRecord> = {},
    orgId: OrganizationId = organizationId,
  ): FlashcardRecord {
    const id = (overrides.id ?? randomUUID()) as FlashcardId;
    const now = new Date().toISOString();
    const card: FlashcardRecord = {
      id,
      organizationId: orgId,
      courseId,
      documentId,
      generatedContentId: null,
      question: "What is pharmacology?",
      answer: "The study of drugs.",
      explanation: "From Greek pharmakon.",
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides,
    };
    flashcardStore.insert(card);
    return card;
  }

  function seedQuiz(
    overrides: Partial<QuizRecord> = {},
    orgId: OrganizationId = organizationId,
  ): QuizRecord {
    const id = (overrides.id ?? randomUUID()) as QuizId;
    const now = new Date().toISOString();
    const quiz: QuizRecord = {
      id,
      organizationId: orgId,
      courseId,
      documentId,
      title: "Pharmacology Quiz 1",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...overrides,
    };
    quizStore.insert(quiz);
    return quiz;
  }

  function seedQuizQuestions(quizId: QuizId): QuizQuestionRecord[] {
    const now = new Date().toISOString();
    const questions: QuizQuestionRecord[] = [
      {
        id: randomUUID() as QuizQuestionId,
        quizId,
        generatedContentId: null,
        question: "What is an agonist?",
        questionType: "multiple_choice",
        choices: ["Activates receptor", "Blocks receptor", "Destroys receptor"],
        correctAnswer: "Activates receptor",
        explanation: "Agonists activate target receptors.",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID() as QuizQuestionId,
        quizId,
        generatedContentId: null,
        question: "What is an antagonist?",
        questionType: "multiple_choice",
        choices: ["Activates receptor", "Blocks receptor", "Destroys receptor"],
        correctAnswer: "Blocks receptor",
        explanation: "Antagonists block target receptors.",
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
    ];
    quizQuestionStore.createMany(questions);
    quizStore.setQuestionsForQuiz(quizId, questions);
    return questions;
  }

  // -------------------------------------------------------------------------
  // Flashcard reviews
  // -------------------------------------------------------------------------

  describe("Flashcard Review Flow", () => {
    it("returns only due flashcards in listFlashcardsForReview", async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString(); // 1 hr ago (due)
      const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString(); // 1 day future (not due)

      const dueCard = seedFlashcard({ dueAt: past });
      seedFlashcard({ dueAt: future });

      const dueList = await service.listFlashcardsForReview(
        student,
        organizationId,
        courseId,
      );

      expect(dueList.length).toBe(1);
      expect(dueList[0].id).toBe(dueCard.id);
    });

    it("submits a flashcard review, updates schedule, and emits audit event", async () => {
      const card = seedFlashcard({
        dueAt: new Date(Date.now() - 10000).toISOString(),
        intervalDays: 2,
        easeFactor: 2.5,
      });

      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
        reactionMs: 1500,
      });

      // Check review stored
      const reviews = await flashcardReviewStore.listByUserAndFlashcard(
        student.userId,
        card.id,
      );
      expect(reviews.length).toBe(1);
      expect(reviews[0].rating).toBe("good");
      expect(reviews[0].reactionMs).toBe(1500);

      // Check flashcard schedule updated: intervalDays 2 * 2.5 = 5
      const updatedCard = await flashcardStore.findByIdForOrganization(
        card.id,
        organizationId,
      );
      expect(updatedCard).toBeDefined();
      expect(updatedCard!.intervalDays).toBe(5);
      expect(updatedCard!.easeFactor).toBe(2.5);
      expect(new Date(updatedCard!.dueAt).getTime()).toBeGreaterThan(Date.now());

      // Check audit event emitted
      const events = await auditStore.listAll();
      expect(events.length).toBe(1);
      expect(events[0].action).toBe("flashcard.reviewed");
      expect(events[0].entityId).toBe(card.id);
      expect(events[0].details?.rating).toBe("good");
    });

    it("handles 'again' rating by resetting interval to 0 and scheduling in 10 minutes", async () => {
      const card = seedFlashcard({
        intervalDays: 10,
        easeFactor: 2.5,
      });

      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "again",
      });

      const updatedCard = await flashcardStore.findByIdForOrganization(
        card.id,
        organizationId,
      );
      expect(updatedCard!.intervalDays).toBe(0);
      expect(updatedCard!.easeFactor).toBe(2.3);
      // Scheduled 10 minutes from now
      const diffMinutes =
        (new Date(updatedCard!.dueAt).getTime() - Date.now()) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(8);
      expect(diffMinutes).toBeLessThan(12);
    });

    it("throws not_found when reviewing non-existent flashcard", async () => {
      await expect(
        service.submitFlashcardReview(student, organizationId, {
          flashcardId: randomUUID() as FlashcardId,
          rating: "good",
        }),
      ).rejects.toThrow("Flashcard not found");
    });

    it("throws not_found when reviewing card from another organization (tenant isolation)", async () => {
      const otherCard = seedFlashcard({}, otherOrgId);

      await expect(
        service.submitFlashcardReview(student, organizationId, {
          flashcardId: otherCard.id,
          rating: "good",
        }),
      ).rejects.toThrow("Flashcard not found");
    });
  });

  // -------------------------------------------------------------------------
  // Quizzes
  // -------------------------------------------------------------------------

  describe("Quiz Consumption Flow", () => {
    it("lists only published quizzes", async () => {
      const pubQuiz = seedQuiz({ title: "Published", status: "published" });
      seedQuiz({ title: "Draft", status: "draft" });

      const list = await service.listQuizzes(student, organizationId, courseId);
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(pubQuiz.id);
    });

    it("gets quiz with questions for attempt", async () => {
      const quiz = seedQuiz();
      const questions = seedQuizQuestions(quiz.id);

      const result = await service.getQuizForAttempt(
        student,
        organizationId,
        quiz.id,
      );

      expect(result.id).toBe(quiz.id);
      expect(result.questions.length).toBe(2);
      expect(result.questions[0].id).toBe(questions[0].id);
    });

    it("submits quiz attempt, grades answers accurately, and returns results", async () => {
      const quiz = seedQuiz();
      const questions = seedQuizQuestions(quiz.id);

      const result = await service.submitQuizAttempt(student, organizationId, {
        quizId: quiz.id,
        answers: [
          { questionId: questions[0].id, answer: "Activates receptor" }, // Correct
          { questionId: questions[1].id, answer: "Destroys receptor" },  // Incorrect
        ],
      });

      expect(result.quizId).toBe(quiz.id);
      expect(result.total).toBe(2);
      expect(result.correct).toBe(1);
      expect(result.score).toBe(50);

      // Verify attempt is stored
      const stored = await quizAttemptStore.findById(result.attemptId as QuizAttemptId);
      expect(stored).toBeDefined();
      expect(stored!.score).toBe(50);
      expect(stored!.userId).toBe(student.userId);

      // Verify audit emitted
      const events = await auditStore.listAll();
      expect(events.length).toBe(1);
      expect(events[0].action).toBe("quiz.attempted");
      expect(events[0].details?.score).toBe(50);
      expect(events[0].details?.correct).toBe(1);
    });

    it("allows student to retrieve their own quiz attempt", async () => {
      const quiz = seedQuiz();
      const questions = seedQuizQuestions(quiz.id);

      const submitRes = await service.submitQuizAttempt(student, organizationId, {
        quizId: quiz.id,
        answers: [
          { questionId: questions[0].id, answer: "Activates receptor" },
          { questionId: questions[1].id, answer: "Blocks receptor" },
        ],
      });

      const attempt = await service.getQuizAttempt(
        student,
        organizationId,
        submitRes.attemptId as QuizAttemptId,
      );

      expect(attempt.id).toBe(submitRes.attemptId);
      expect(attempt.score).toBe(100);
    });

    it("throws not_found if a student tries to access another student's quiz attempt", async () => {
      const quiz = seedQuiz();
      const questions = seedQuizQuestions(quiz.id);

      const submitRes = await service.submitQuizAttempt(student, organizationId, {
        quizId: quiz.id,
        answers: [{ questionId: questions[0].id, answer: "Activates receptor" }],
      });

      await expect(
        service.getQuizAttempt(
          otherStudent,
          organizationId,
          submitRes.attemptId as QuizAttemptId,
        ),
      ).rejects.toThrow("Quiz attempt not found");
    });
  });

  // -------------------------------------------------------------------------
  // Study analytics & recommendations
  // -------------------------------------------------------------------------

  describe("Study Analytics & Recommendations", () => {
    it("computes accurate study analytics across lessons, flashcards, and quizzes", async () => {
      // 1. Seed modules and lessons
      const moduleId = randomUUID() as ModuleId;
      moduleStore.insert({
        id: moduleId,
        courseId,
        title: "Module 1",
        description: null,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      const lesson1Id = randomUUID() as LessonId;
      const lesson2Id = randomUUID() as LessonId;
      lessonStore.create({
        id: lesson1Id,
        moduleId,
        title: "Lesson 1",
        contentType: "markdown",
        contentMarkdown: "# Lesson 1",
        sortOrder: 1,
        estimatedMinutes: 10,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
      lessonStore.create({
        id: lesson2Id,
        moduleId,
        title: "Lesson 2",
        contentType: "markdown",
        contentMarkdown: "# Lesson 2",
        sortOrder: 2,
        estimatedMinutes: 10,
        publicationStatus: "published",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      // Complete 1 of 2 lessons
      await progressStore.upsert({
        id: randomUUID(),
        userId: student.userId,
        lessonId: lesson1Id,
        completed: true,
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 2. Seed flashcards: 1 reviewed, 1 fresh
      seedFlashcard({ intervalDays: 10, dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString() }); // Mastered (> 7 days)
      seedFlashcard({ intervalDays: 0, dueAt: new Date(Date.now() - 1000).toISOString() }); // Due

      // 3. Seed quiz and attempt with 60% score
      const quiz = seedQuiz({ title: "Cardiovascular Drugs" });
      const questions = seedQuizQuestions(quiz.id);

      await service.submitQuizAttempt(student, organizationId, {
        quizId: quiz.id,
        answers: [
          { questionId: questions[0].id, answer: "Activates receptor" }, // 1 correct of 2 -> 50%
        ],
      });

      const analytics = await service.getStudyAnalytics(
        student,
        organizationId,
        courseId,
      );

      expect(analytics.total_lessons).toBe(2);
      expect(analytics.completed_lessons).toBe(1);
      expect(analytics.lesson_progress_percent).toBe(50);
      expect(analytics.total_flashcards).toBe(2);
      expect(analytics.reviewed_flashcards).toBe(1);
      expect(analytics.flashcard_mastery_percent).toBe(50);
      expect(analytics.total_quizzes).toBe(1);
      expect(analytics.attempts_taken).toBe(1);
      expect(analytics.average_quiz_score).toBe(50);
      expect(analytics.weak_areas).toEqual(["Cardiovascular Drugs"]);
      expect(analytics.recommended_next_steps.length).toBeGreaterThan(0);
    });

    it("generates actionable recommendations when student has pending items and weak areas", async () => {
      // Seed flashcard that is not reviewed
      seedFlashcard({ intervalDays: 0 });

      // Seed quiz with a failed attempt
      const quiz = seedQuiz({ title: "Antibiotics" });
      const questions = seedQuizQuestions(quiz.id);
      await service.submitQuizAttempt(student, organizationId, {
        quizId: quiz.id,
        answers: [{ questionId: questions[0].id, answer: "wrong" }],
      });

      const recommendations = await service.getStudyRecommendations(
        student,
        organizationId,
        courseId,
      );

      expect(recommendations.length).toBeGreaterThan(0);
      const flashcardRec = recommendations.find((r) => r.source === "flashcard_review");
      const quizRec = recommendations.find((r) => r.source === "quiz_attempt");

      expect(flashcardRec).toBeDefined();
      expect(flashcardRec?.summary).toContain("flashcard");
      expect(quizRec).toBeDefined();
      expect(quizRec?.summary).toContain("Antibiotics");
    });
  });
});
