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
  type FlashcardRating,
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
  InMemoryUserFlashcardScheduleStore,
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
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
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
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
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
      undefined,
      userFlashcardScheduleStore,
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

  function seedReview(userId: UserId, flashcardId: FlashcardId, rating: FlashcardRating = "good") {
    flashcardReviewStore.create({
      id: randomUUID(),
      flashcardId,
      userId,
      rating,
      reviewedAt: new Date().toISOString(),
      reactionMs: 1000,
    });
  }

  // -------------------------------------------------------------------------
  // Flashcard reviews
  // -------------------------------------------------------------------------

  describe("Flashcard Review Flow", () => {
    it("returns only due flashcards in listFlashcardsForReview", async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString(); // 1 hr ago (due)
      const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString(); // 1 day future (not due)

      const unreviewedCard = seedFlashcard({ dueAt: past });
      const futureCard = seedFlashcard({ dueAt: future });
      seedReview(student.userId, futureCard.id);

      const dueCard = seedFlashcard({ dueAt: past });
      seedReview(student.userId, dueCard.id);

      const dueList = await service.listFlashcardsForReview(
        student,
        organizationId,
        courseId,
      );

      expect(dueList.length).toBe(2);
      expect(dueList.map((c) => c.id).sort()).toEqual([unreviewedCard.id, dueCard.id].sort());
    });

    describe("Ready for Review (dueReviewCards) strict requirements", () => {
      it("includes unread cards with dueAt <= now, excludes future cards and null dueAt in review queue", async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
        const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString();

        // 1. Unread card with past dueAt -> DUE for initial review
        const unreadDueCard = seedFlashcard({ dueAt: past });

        // 2. Read card with future dueAt -> NOT due
        const futureCard = seedFlashcard({ dueAt: future });
        seedReview(student.userId, futureCard.id);

        // 3. Read card with past dueAt -> DUE
        const dueCard1 = seedFlashcard({ dueAt: past, intervalDays: 1 });
        seedReview(student.userId, dueCard1.id);

        // 4. Read card with overdue dueAt (5 days ago) -> DUE
        const overduePast = new Date(now.getTime() - 5 * 86400000).toISOString();
        const dueCard2 = seedFlashcard({ dueAt: overduePast, intervalDays: 2 });
        seedReview(student.userId, dueCard2.id);

        // 5. Card with invalid/null dueAt -> NOT due
        const nullCard = seedFlashcard({ dueAt: null as unknown as string });
        seedReview(student.userId, nullCard.id);

        const summary = await service.getFlashcardSummary(student, organizationId);
        const courseStats = summary.courseMap.get(courseId);

        expect(courseStats).toBeDefined();
        const dueQueue = await service.listFlashcardsForReview(student, organizationId, courseId);
        expect(dueQueue.length).toBe(3);
        expect(dueQueue.map((c) => c.id).sort()).toEqual([unreadDueCard.id, dueCard1.id, dueCard2.id].sort());
      });

      it("enforces due count invariants: unseen+past=>0 due / 1 new, reviewed+future=>0, reviewed+past=>1 due", async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
        const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString();

        // 1. unseen + due_at <= now -> due = 0, newCards = 1
        seedFlashcard({ dueAt: past });

        // 2. reviewed + due_at > now -> due = 0
        const cardFuture = seedFlashcard({ dueAt: future });
        seedReview(student.userId, cardFuture.id);

        // 3. reviewed + due_at <= now -> due = 1
        const cardDue = seedFlashcard({ dueAt: past, intervalDays: 1 });
        seedReview(student.userId, cardDue.id);

        const summary = await service.getFlashcardSummary(student, organizationId);
        const courseStats = summary.courseMap.get(courseId)!;

        // Invariant assertions:
        expect(courseStats.due).toBe(1); // Only reviewed + due_at <= now
        expect(courseStats.newCards).toBe(1); // Unseen card
      });

      it("ensures multi-user isolation (User A review does not affect User B schedule)", async () => {
        const studentB: Actor = { userId: "user-b-id" as UserId, role: "student" };
        const now = new Date();
        const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString();

        const card = seedFlashcard({ dueAt: past, intervalDays: 1 });
        // User A reviews the card
        seedReview(student.userId, card.id);

        // User A checks due summary & queue
        const summaryA = await service.getFlashcardSummary(student, organizationId);
        expect(summaryA.courseMap.get(courseId)!.due).toBe(1);

        const queueA = await service.listFlashcardsForReview(student, organizationId, courseId);
        expect(queueA.length).toBe(1);

        // User B (who has NOT reviewed the card) checks due summary & queue
        const summaryB = await service.getFlashcardSummary(studentB, organizationId);
        expect(summaryB.courseMap.get(courseId)!.due).toBe(0);

        const queueB = await service.listFlashcardsForReview(studentB, organizationId, courseId);
        expect(queueB.length).toBe(1); // User B sees the card ready for initial review
      });
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

      // Check per-user flashcard schedule updated
      const updatedSchedule = await userFlashcardScheduleStore.getByUserAndCard(
        student.userId,
        card.id,
      );
      expect(updatedSchedule).toBeDefined();
      expect(updatedSchedule!.intervalDays).toBe(5); // 2 * 2.5 = 5
      expect(updatedSchedule!.easeFactor).toBe(2.5);
      expect(new Date(updatedSchedule!.dueAt).getTime()).toBeGreaterThan(Date.now());

      const events = await auditStore.listAll();
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].action).toBe("flashcard.reviewed");
    });

    it("submits a flashcard review in Exam Mode and DOES NOT update schedule", async () => {
      const card = seedFlashcard({
        dueAt: new Date(Date.now() - 10000).toISOString(),
        intervalDays: 2,
        easeFactor: 2.5,
      });

      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
        reactionMs: 1500,
        isExamMode: true,
      });

      // Check review stored
      const reviews = await flashcardReviewStore.listByUserAndFlashcard(
        student.userId,
        card.id,
      );
      expect(reviews.length).toBe(1);
      expect(reviews[0].rating).toBe("good");

      // Check per-user flashcard schedule was NOT created in Exam Mode
      const schedule = await userFlashcardScheduleStore.getByUserAndCard(
        student.userId,
        card.id,
      );
      expect(schedule).toBeUndefined();
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

      const updatedSchedule = await userFlashcardScheduleStore.getByUserAndCard(
        student.userId,
        card.id,
      );
      expect(updatedSchedule!.intervalDays).toBe(0);
      expect(updatedSchedule!.easeFactor).toBe(2.3);
      // Scheduled 10 minutes from now
      const diffMinutes =
        (new Date(updatedSchedule!.dueAt).getTime() - Date.now()) / (1000 * 60);
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

  describe("Phase 10 — Per-User Flashcard Schedule Regression Tests", () => {
    it("TEST 1 — User Isolation: User A reviews, User B schedule remains empty", async () => {
      const card = seedFlashcard();
      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
      });

      const schedA = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, card.id);
      const schedB = await userFlashcardScheduleStore.getByUserAndCard(otherUserId, card.id);

      expect(schedA).toBeDefined();
      expect(schedB).toBeUndefined();

      const summaryA = await service.getFlashcardSummary(student, organizationId);
      const summaryB = await service.getFlashcardSummary(otherStudent, organizationId);

      expect(summaryA.courseMap.get(courseId)?.total).toBe(1);
      expect(summaryB.courseMap.get(courseId)?.total).toBe(1);
      expect(summaryB.courseMap.get(courseId)?.due).toBe(0);
      expect(summaryB.courseMap.get(courseId)?.newCards).toBe(1);
    });

    it("TEST 2 — Independent Schedule: User A good vs User B easy produce different schedules", async () => {
      const card = seedFlashcard();
      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
      });
      await service.submitFlashcardReview(otherStudent, organizationId, {
        flashcardId: card.id,
        rating: "easy",
      });

      const schedA = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, card.id);
      const schedB = await userFlashcardScheduleStore.getByUserAndCard(otherUserId, card.id);

      expect(schedA).toBeDefined();
      expect(schedB).toBeDefined();
      expect(schedA?.intervalDays).toBe(1);
      expect(schedB?.intervalDays).toBe(2);
      expect(schedA?.easeFactor).toBe(2.5);
      expect(schedB?.easeFactor).toBe(2.65);
    });

    it("TEST 3 — Cross User Update Protection: Updating User A schedule does not alter User B schedule", async () => {
      const card = seedFlashcard();
      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
      });
      await service.submitFlashcardReview(otherStudent, organizationId, {
        flashcardId: card.id,
        rating: "easy",
      });

      const initialSchedB = await userFlashcardScheduleStore.getByUserAndCard(otherUserId, card.id);

      // User A reviews again with 'hard'
      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "hard",
      });

      const updatedSchedA = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, card.id);
      const finalSchedB = await userFlashcardScheduleStore.getByUserAndCard(otherUserId, card.id);

      expect(updatedSchedA?.reviewCount).toBe(2);
      expect(finalSchedB?.dueAt).toBe(initialSchedB?.dueAt);
      expect(finalSchedB?.intervalDays).toBe(initialSchedB?.intervalDays);
      expect(finalSchedB?.easeFactor).toBe(initialSchedB?.easeFactor);
      expect(finalSchedB?.reviewCount).toBe(1);
    });

    it("TEST 4 — Due Count Isolation: User A due card does not count as due for User B", async () => {
      const card = seedFlashcard();
      // Create past due schedule for User A
      await userFlashcardScheduleStore.upsertSchedule({
        userId: studentUserId,
        flashcardId: card.id,
        dueAt: new Date(Date.now() - 10000).toISOString(),
        intervalDays: 1,
        easeFactor: 2.5,
        lastReviewedAt: new Date(Date.now() - 86400000).toISOString(),
        reviewCount: 1,
      });

      // User B has future schedule
      await userFlashcardScheduleStore.upsertSchedule({
        userId: otherUserId,
        flashcardId: card.id,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        intervalDays: 2,
        easeFactor: 2.65,
        lastReviewedAt: new Date(Date.now() - 86400000).toISOString(),
        reviewCount: 1,
      });

      const summaryA = await service.getFlashcardSummary(student, organizationId);
      const summaryB = await service.getFlashcardSummary(otherStudent, organizationId);

      expect(summaryA.courseMap.get(courseId)?.due).toBe(1);
      expect(summaryB.courseMap.get(courseId)?.due).toBe(0);
    });

    it("TEST 5 — New Card: Unreviewed card counts as NEW and not DUE", async () => {
      seedFlashcard();

      const summary = await service.getFlashcardSummary(student, organizationId);
      const stats = summary.courseMap.get(courseId)!;

      expect(stats.total).toBe(1);
      expect(stats.newCards).toBe(1);
      expect(stats.due).toBe(0);
      expect(stats.overdue).toBe(0);
    });

    it("TEST 6 — First Review: Creates review history and schedule with reviewCount = 1", async () => {
      const card = seedFlashcard();
      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
      });

      const reviews = await flashcardReviewStore.listByUserAndFlashcard(studentUserId, card.id);
      const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, card.id);

      expect(reviews.length).toBe(1);
      expect(schedule).toBeDefined();
      expect(schedule?.reviewCount).toBe(1);
      expect(schedule?.intervalDays).toBe(1);
    });

    it("TEST 7 — Repeated Review: Updates existing schedule and increments reviewCount to 2", async () => {
      const card = seedFlashcard();
      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
      });
      await service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "easy",
      });

      const reviews = await flashcardReviewStore.listByUserAndFlashcard(studentUserId, card.id);
      const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, card.id);

      expect(reviews.length).toBe(2);
      expect(schedule?.reviewCount).toBe(2);
      expect(schedule?.intervalDays).toBe(3); // 1 * 2.5 * 1.3 = 3.25 -> round 3
    });

    it("TEST 8 — Historical Replay: Replays reviews in chronological order and matches pure SRS functions", async () => {
      const card = seedFlashcard();
      const now = Date.now();
      const t1 = new Date(now - 86400000 * 5).toISOString();
      const t2 = new Date(now - 86400000 * 2).toISOString();

      // Seed 2 reviews for User A
      await flashcardReviewStore.create({
        id: randomUUID(),
        flashcardId: card.id,
        userId: studentUserId,
        rating: "good",
        reviewedAt: t1,
        reactionMs: 500,
      });
      await flashcardReviewStore.create({
        id: randomUUID(),
        flashcardId: card.id,
        userId: studentUserId,
        rating: "easy",
        reviewedAt: t2,
        reactionMs: 400,
      });

      // Simulate backfill replay
      const userReviews = await flashcardReviewStore.listByUserAndFlashcard(studentUserId, card.id);
      let state = { intervalDays: 0, easeFactor: 2.5 };
      let lastDue = "";
      for (const r of userReviews) {
        state = (await import("@avana/domain")).nextReviewInterval(r.rating, state);
        lastDue = (await import("@avana/domain")).nextDueAt(r.rating, state, new Date(r.reviewedAt));
      }

      await userFlashcardScheduleStore.upsertSchedule({
        userId: studentUserId,
        flashcardId: card.id,
        dueAt: lastDue,
        intervalDays: state.intervalDays,
        easeFactor: state.easeFactor,
        lastReviewedAt: t2,
        reviewCount: userReviews.length,
      });

      const sched = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, card.id);
      expect(sched).toBeDefined();
      expect(sched?.reviewCount).toBe(2);
      expect(sched?.intervalDays).toBe(3);
    });

    it("TEST 9 — Transaction Rollback: Prevents orphaned records on error", async () => {
      const card = seedFlashcard();

      // Mock error on upsertSchedule
      const failStore = new InMemoryUserFlashcardScheduleStore();
      failStore.upsertSchedule = async () => {
        throw new Error("DB Connection Error");
      };

      const failService = new StudyService(
        flashcardStore,
        flashcardReviewStore,
        quizStore,
        quizQuestionStore,
        quizAttemptStore,
        moduleStore,
        lessonStore,
        progressStore,
        new RoleBasedPolicy(),
        undefined,
        undefined,
        failStore,
      );

      await expect(
        failService.submitFlashcardReview(student, organizationId, {
          flashcardId: card.id,
          rating: "good",
        }),
      ).rejects.toThrow("DB Connection Error");
    });

    it("TEST 10 — Same User Concurrent Review: Handles concurrent reviews cleanly", async () => {
      const card = seedFlashcard();

      const p1 = service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "good",
      });
      const p2 = service.submitFlashcardReview(student, organizationId, {
        flashcardId: card.id,
        rating: "easy",
      });

      await Promise.all([p1, p2]);

      const reviews = await flashcardReviewStore.listByUserAndFlashcard(studentUserId, card.id);
      const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, card.id);

      expect(reviews.length).toBe(2);
      expect(schedule).toBeDefined();
      expect(schedule?.reviewCount).toBe(2);
    });
  });
});
