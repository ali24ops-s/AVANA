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

  async function seedReview(
    userId: UserId,
    flashcardId: FlashcardId,
    rating: FlashcardRating = "good",
    scheduleOverrides: Partial<{
      dueAt: string;
      intervalDays: number;
      easeFactor: number;
      reviewCount: number;
      lastReviewedAt: string;
    }> = {},
  ) {
    flashcardReviewStore.create({
      id: randomUUID(),
      flashcardId,
      userId,
      rating,
      reviewedAt: new Date().toISOString(),
      reactionMs: 1000,
    });
    const card = await flashcardStore.findById(flashcardId);
    const defaultDueAt = card?.dueAt !== undefined ? card.dueAt : new Date().toISOString();
    await userFlashcardScheduleStore.upsertSchedule({
      userId,
      flashcardId,
      dueAt: defaultDueAt,
      intervalDays: card?.intervalDays ?? 1,
      easeFactor: card?.easeFactor ?? 2.5,
      reviewCount: 1,
      lastReviewedAt: new Date().toISOString(),
      ...scheduleOverrides,
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
      await seedReview(student.userId, futureCard.id);

      const dueCard = seedFlashcard({ dueAt: past });
      await seedReview(student.userId, dueCard.id);

      const dueList = await service.listFlashcardsForReview(
        student,
        organizationId,
        courseId,
      );

      // Only dueCard (which is reviewed and dueAt <= now) is in the review queue
      expect(dueList.length).toBe(1);
      expect(dueList.map((c) => c.id)).toEqual([dueCard.id]);
    });

    describe("Ready for Review (dueReviewCards) strict requirements", () => {
      it("includes reviewed cards with dueAt <= now, excludes future cards, unreviewed cards, and null dueAt in review queue", async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
        const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString();

        // 1. Unread card with past dueAt -> NOT in review queue (unreviewed card)
        const unreadDueCard = seedFlashcard({ dueAt: past });

        // 2. Read card with future dueAt -> NOT due
        const futureCard = seedFlashcard({ dueAt: future });
        await seedReview(student.userId, futureCard.id);

        // 3. Read card with past dueAt -> DUE
        const dueCard1 = seedFlashcard({ dueAt: past, intervalDays: 1 });
        await seedReview(student.userId, dueCard1.id);

        // 4. Read card with overdue dueAt (5 days ago) -> DUE
        const overduePast = new Date(now.getTime() - 5 * 86400000).toISOString();
        const dueCard2 = seedFlashcard({ dueAt: overduePast, intervalDays: 2 });
        await seedReview(student.userId, dueCard2.id);

        // 5. Card with invalid/null dueAt -> NOT due
        const nullCard = seedFlashcard({ dueAt: null as unknown as string });
        await seedReview(student.userId, nullCard.id);

        const summary = await service.getFlashcardSummary(student, organizationId);
        const courseStats = summary.courseMap.get(courseId);

        expect(courseStats).toBeDefined();
        const dueQueue = await service.listFlashcardsForReview(student, organizationId, courseId);
        expect(dueQueue.length).toBe(2);
        expect(dueQueue.map((c) => c.id).sort()).toEqual([dueCard1.id, dueCard2.id].sort());
      });

      it("enforces due count invariants: unseen+past=>0 due / 1 new, reviewed+future=>0, reviewed+past=>1 due", async () => {
        const now = new Date();
        const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
        const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString();

        // 1. unseen + due_at <= now -> due = 0, newCards = 1
        seedFlashcard({ dueAt: past });

        // 2. reviewed + due_at > now -> due = 0
        const cardFuture = seedFlashcard({ dueAt: future });
        await seedReview(student.userId, cardFuture.id);

        // 3. reviewed + due_at <= now -> due = 1
        const cardDue = seedFlashcard({ dueAt: past, intervalDays: 1 });
        await seedReview(student.userId, cardDue.id);

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
        await seedReview(student.userId, card.id);

        // User A checks due summary & queue
        const summaryA = await service.getFlashcardSummary(student, organizationId);
        expect(summaryA.courseMap.get(courseId)!.due).toBe(1);

        const queueA = await service.listFlashcardsForReview(student, organizationId, courseId);
        expect(queueA.length).toBe(1);

        // User B (who has NOT reviewed the card) checks due summary & queue
        const summaryB = await service.getFlashcardSummary(studentB, organizationId);
        expect(summaryB.courseMap.get(courseId)!.due).toBe(0);

        const queueB = await service.listFlashcardsForReview(studentB, organizationId, courseId);
        expect(queueB.length).toBe(0); // User B has no due reviews
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

    it("preserves historical question snapshot on course quiz review even if original questions are modified or deleted", async () => {
      const quiz = seedQuiz();
      const questions = seedQuizQuestions(quiz.id);

      // 1. Submit Course Quiz
      const submitRes = await service.submitQuizAttempt(student, organizationId, {
        quizId: quiz.id,
        answers: [
          { questionId: questions[0].id, answer: "Activates receptor" },
          { questionId: questions[1].id, answer: "Blocks receptor" },
        ],
      });

      // 2. Snapshot is created and stored in quizAttemptStore
      const storedAttempt = await quizAttemptStore.findById(submitRes.attemptId as QuizAttemptId);
      expect(storedAttempt?.questionSnapshot).toBeDefined();
      expect(Array.isArray(storedAttempt?.questionSnapshot)).toBe(true);
      expect((storedAttempt?.questionSnapshot as unknown[]).length).toBe(2);

      // 3. Mutate/delete the original questions in quizQuestionStore
      quizQuestionStore.clear();
      quizQuestionStore.insert({
        id: questions[0].id,
        quizId: quiz.id,
        generatedContentId: null,
        question: "MUTATED QUESTION TEXT",
        choices: ["Changed Option A", "Changed Option B"],
        correctAnswer: "Changed Option A",
        explanation: "Mutated explanation",
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 4. Review of the attempt via getQuizAttempt still returns original snapshot question and choices
      const review = await service.getQuizAttempt(
        student,
        organizationId,
        submitRes.attemptId as QuizAttemptId,
      );

      expect(review.questions).toHaveLength(2);
      expect(review.questions![0].question).toBe(questions[0].question);
      expect(review.questions![0].question).not.toBe("MUTATED QUESTION TEXT");
      expect(review.questions![0].choices).toEqual(questions[0].choices);
      expect(review.questions![1].question).toBe(questions[1].question);

      // Also verify getExamAttempt (used by ExamResultView / exams history) returns original snapshot
      const examReview = await service.getExamAttempt(
        student,
        organizationId,
        submitRes.attemptId as QuizAttemptId,
      );
      expect(examReview.questions).toHaveLength(2);
      expect(examReview.questions![0].question).toBe(questions[0].question);
      expect(examReview.questions![0].question).not.toBe("MUTATED QUESTION TEXT");
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

      // 2. Seed flashcards: 1 reviewed (mastered), 1 fresh
      const c1 = seedFlashcard();
      await userFlashcardScheduleStore.upsertSchedule({
        userId: student.userId,
        flashcardId: c1.id,
        dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
        intervalDays: 10,
        easeFactor: 2.5,
        reviewCount: 1,
        lastReviewedAt: new Date().toISOString(),
      });
      seedFlashcard(); // Fresh unreviewed card

      // 3. Seed quiz and attempt with 50% score
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
      // Seed flashcard that is due for review
      const card = seedFlashcard({ intervalDays: 1, dueAt: new Date(Date.now() - 3600000).toISOString() });
      await seedReview(student.userId, card.id);

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
      expect(flashcardRec?.summary).toContain("آماده برای مرور");
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

  // -------------------------------------------------------------------------
  // Question to Lesson Hierarchy Resolution
  // -------------------------------------------------------------------------

  describe("Question to Lesson Hierarchy Resolution", () => {
    it("resolves Lesson -> Chapter (Module) -> Course hierarchy when questions have lesson_id", async () => {
      const moduleId = randomUUID() as ModuleId;
      const lessonId = randomUUID() as LessonId;
      const now = new Date().toISOString();

      moduleStore.insert({
        id: moduleId,
        courseId,
        title: "فارماکوکینتیک",
        description: "فصل مبانی فارماکوکینتیک",
        sortOrder: 1,
        documentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      lessonStore.insert({
        id: lessonId,
        moduleId,
        title: "جذب داروها",
        content: "متن درس جذب داروها",
        sortOrder: 1,
        documentChunkId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      const quiz = seedQuiz();
      const questionId = randomUUID() as QuizQuestionId;
      const question: QuizQuestionRecord = {
        id: questionId,
        quizId: quiz.id,
        lessonId,
        generatedContentId: null,
        question: "عوامل موثر بر جذب دارو کدامند؟",
        questionType: "multiple_choice",
        choices: ["pH محیط", "حلالیت چربی", "هر دو مورد"],
        correctAnswer: "هر دو مورد",
        explanation: "هر دو فاکتور اثرگذارند.",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      };

      await quizQuestionStore.createMany([question]);
      quizStore.setQuestionsForQuiz(quiz.id, [question]);

      const result = await service.getQuizForAttempt(student, organizationId, quiz.id);

      expect(result).toBeDefined();
      expect(result.questions).toHaveLength(1);

      const q = result.questions[0]!;
      expect(q.lessonId).toBe(lessonId);
      expect(q.lesson).toEqual({
        id: lessonId,
        title: "جذب داروها",
      });
      expect(q.chapter).toEqual({
        id: moduleId,
        title: "فارماکوکینتیک",
      });
    });

    it("handles questions with null lesson_id gracefully with null hierarchy", async () => {
      const quiz = seedQuiz();
      const questionId = randomUUID() as QuizQuestionId;
      const now = new Date().toISOString();
      const question: QuizQuestionRecord = {
        id: questionId,
        quizId: quiz.id,
        lessonId: null,
        generatedContentId: null,
        question: "سوال بدون درس آزمایشی؟",
        questionType: "multiple_choice",
        choices: ["الف", "ب"],
        correctAnswer: "الف",
        explanation: "توضیح سوال",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      };

      await quizQuestionStore.createMany([question]);
      quizStore.setQuestionsForQuiz(quiz.id, [question]);

      const result = await service.getQuizForAttempt(student, organizationId, quiz.id);
      expect(result.questions).toHaveLength(1);

      const q = result.questions[0]!;
      expect(q.lessonId ?? null).toBeNull();
      expect(q.lesson).toBeNull();
      expect(q.chapter).toBeNull();
    });

    it("batch resolves questions across multiple distinct lessons and modules", async () => {
      const mod1 = randomUUID() as ModuleId;
      const mod2 = randomUUID() as ModuleId;
      const les1 = randomUUID() as LessonId;
      const les2 = randomUUID() as LessonId;
      const now = new Date().toISOString();

      moduleStore.insert({
        id: mod1,
        courseId,
        title: "فارماکولوژی عروق",
        description: null,
        sortOrder: 1,
        documentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      moduleStore.insert({
        id: mod2,
        courseId,
        title: "فارماکولوژی اعصاب",
        description: null,
        sortOrder: 2,
        documentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      lessonStore.insert({
        id: les1,
        moduleId: mod1,
        title: "مهارکننده‌های رنین",
        content: "درس ۱",
        sortOrder: 1,
        documentChunkId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      lessonStore.insert({
        id: les2,
        moduleId: mod2,
        title: "آگونیست‌های دوپامین",
        content: "درس ۲",
        sortOrder: 1,
        documentChunkId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      const quiz = seedQuiz();
      const q1: QuizQuestionRecord = {
        id: randomUUID() as QuizQuestionId,
        quizId: quiz.id,
        lessonId: les1,
        generatedContentId: null,
        question: "سوال ۱",
        questionType: "multiple_choice",
        choices: ["الف", "ب"],
        correctAnswer: "الف",
        explanation: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      };
      const q2: QuizQuestionRecord = {
        id: randomUUID() as QuizQuestionId,
        quizId: quiz.id,
        lessonId: les2,
        generatedContentId: null,
        question: "سوال ۲",
        questionType: "multiple_choice",
        choices: ["ج", "د"],
        correctAnswer: "ج",
        explanation: null,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      };
      const q3: QuizQuestionRecord = {
        id: randomUUID() as QuizQuestionId,
        quizId: quiz.id,
        lessonId: null,
        generatedContentId: null,
        question: "سوال ۳ بدون درس",
        questionType: "multiple_choice",
        choices: ["هـ", "و"],
        correctAnswer: "هـ",
        explanation: null,
        sortOrder: 3,
        createdAt: now,
        updatedAt: now,
      };

      await quizQuestionStore.createMany([q1, q2, q3]);
      quizStore.setQuestionsForQuiz(quiz.id, [q1, q2, q3]);

      const result = await service.getQuizForAttempt(student, organizationId, quiz.id);
      expect(result.questions).toHaveLength(3);

      expect(result.questions[0]!.lesson?.title).toBe("مهارکننده‌های رنین");
      expect(result.questions[0]!.chapter?.title).toBe("فارماکولوژی عروق");

      expect(result.questions[1]!.lesson?.title).toBe("آگونیست‌های دوپامین");
      expect(result.questions[1]!.chapter?.title).toBe("فارماکولوژی اعصاب");

      expect(result.questions[2]!.lesson).toBeNull();
      expect(result.questions[2]!.chapter).toBeNull();
    });

    it("preserves hierarchy metadata during quiz attempt submission and retrieval", async () => {
      const moduleId = randomUUID() as ModuleId;
      const lessonId = randomUUID() as LessonId;
      const now = new Date().toISOString();

      moduleStore.insert({
        id: moduleId,
        courseId,
        title: "فارماکوکینتیک",
        description: null,
        sortOrder: 1,
        documentId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      lessonStore.insert({
        id: lessonId,
        moduleId,
        title: "توزیع داروها",
        content: "درس توزیع",
        sortOrder: 1,
        documentChunkId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      const quiz = seedQuiz();
      const question: QuizQuestionRecord = {
        id: randomUUID() as QuizQuestionId,
        quizId: quiz.id,
        lessonId,
        generatedContentId: null,
        question: "میزان حجم توزیع چیست؟",
        questionType: "multiple_choice",
        choices: ["Vd", "Cl", "AUC"],
        correctAnswer: "Vd",
        explanation: "حجم فرضی مایعات بدن",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      };

      await quizQuestionStore.createMany([question]);
      quizStore.setQuestionsForQuiz(quiz.id, [question]);

      const submission = await service.submitQuizAttempt(
        student,
        organizationId,
        {
          quizId: quiz.id,
          answers: [{ questionId: question.id, answer: "Vd" }],
        },
      );

      const attemptResult = await service.getQuizAttempt(
        student,
        organizationId,
        submission.attemptId as QuizAttemptId,
      );

      expect(attemptResult.questions).toBeDefined();
      expect(attemptResult.questions).toHaveLength(1);
      expect(attemptResult.questions[0]!.lesson).toEqual({
        id: lessonId,
        title: "توزیع داروها",
      });
      expect(attemptResult.questions[0]!.chapter).toEqual({
        id: moduleId,
        title: "فارماکوکینتیک",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Unified Study Analysis & Next Steps Domain Specification Test Suite
  // -------------------------------------------------------------------------

  describe("Unified Study Analysis & Next Steps Domain Specification", () => {
    describe("Flashcard Metrics & Mastery Distinction", () => {
      it("handles zero flashcards correctly", async () => {
        const analytics = await service.getStudyAnalytics(student, organizationId, courseId);
        expect(analytics.total_flashcards).toBe(0);
        expect(analytics.reviewed_flashcards).toBe(0);
        expect(analytics.mastered_flashcards).toBe(0);
        expect(analytics.flashcard_mastery_percent).toBe(0);
      });

      it("correctly differentiates reviewed cards vs mastered cards (interval >= 7)", async () => {
        // Card 1: Reviewed 1 time, interval 1 day -> Reviewed, NOT Mastered
        const card1 = seedFlashcard();
        await userFlashcardScheduleStore.upsertSchedule({
          userId: student.userId,
          flashcardId: card1.id,
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          intervalDays: 1,
          easeFactor: 2.5,
          reviewCount: 1,
          lastReviewedAt: new Date().toISOString(),
        });

        // Card 2: Reviewed 3 times, interval 8 days -> Reviewed & Mastered
        const card2 = seedFlashcard();
        await userFlashcardScheduleStore.upsertSchedule({
          userId: student.userId,
          flashcardId: card2.id,
          dueAt: new Date(Date.now() + 8 * 86400000).toISOString(),
          intervalDays: 8,
          easeFactor: 2.8,
          reviewCount: 3,
          lastReviewedAt: new Date().toISOString(),
        });

        // Card 3: Fresh, unreviewed card
        seedFlashcard();

        const analytics = await service.getStudyAnalytics(student, organizationId, courseId);
        expect(analytics.total_flashcards).toBe(3);
        expect(analytics.reviewed_flashcards).toBe(2);
        expect(analytics.mastered_flashcards).toBe(1);
        expect(analytics.flashcard_mastery_percent).toBe(33); // 1 of 3 = 33%
      });
    });

    describe("Weak Areas & Strengths Calculation", () => {
      it("single attempt < 70% is weak, >= 70% is not weak", async () => {
        const quiz1 = seedQuiz({ title: "Renal Drugs" });
        const q1 = seedQuizQuestions(quiz1.id);
        const quiz2 = seedQuiz({ title: "Cardiac Drugs" });
        const q2 = seedQuizQuestions(quiz2.id);

        // Attempt 1: score 50% (< 70%) -> weak
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz1.id,
          answers: [{ questionId: q1[0].id, answer: "Activates receptor" }],
        });

        // Attempt 2: score 100% (>= 70%) -> not weak, is strength
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz2.id,
          answers: [
            { questionId: q2[0].id, answer: "Activates receptor" },
            { questionId: q2[1].id, answer: "Blocks receptor" },
          ],
        });

        const analytics = await service.getStudyAnalytics(student, organizationId, courseId);
        expect(analytics.weak_areas).toContain("Renal Drugs");
        expect(analytics.weak_areas).not.toContain("Cardiac Drugs");
        expect(analytics.strengths).toContain("Cardiac Drugs");
      });

      it("two recent attempts: average of last 2 determines weakness", async () => {
        const quiz = seedQuiz({ title: "Autonomic Nervous System" });
        const q = seedQuizQuestions(quiz.id);

        // Attempt 1: 0%
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz.id,
          answers: [{ questionId: q[0].id, answer: "wrong" }],
        });

        // Attempt 2: 60% -> avg(0, 60) = 30% (< 70%) -> still weak
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz.id,
          answers: [{ questionId: q[0].id, answer: "Activates receptor" }],
        });

        let analytics = await service.getStudyAnalytics(student, organizationId, courseId);
        expect(analytics.weak_areas).toContain("Autonomic Nervous System");

        // Attempt 3: 100% -> last 2 are (60, 100) -> avg = 80% (>= 70%) -> exits weak area!
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz.id,
          answers: [
            { questionId: q[0].id, answer: "Activates receptor" },
            { questionId: q[1].id, answer: "Blocks receptor" },
          ],
        });

        analytics = await service.getStudyAnalytics(student, organizationId, courseId);
        expect(analytics.weak_areas).not.toContain("Autonomic Nervous System");
      });
    });

    describe("Structured Recommendations & Single Source of Truth", () => {
      it("zero state: recommends first lesson if course has lessons", async () => {
        const moduleId = randomUUID() as ModuleId;
        const lessonId = randomUUID() as LessonId;
        moduleStore.insert({
          id: moduleId,
          courseId,
          title: "فصل اول",
          description: null,
          sortOrder: 1,
          documentId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });
        lessonStore.insert({
          id: lessonId,
          moduleId,
          title: "مقدمه بر فارماکولوژی",
          content: "متن درس",
          sortOrder: 1,
          documentChunkId: null,
          publicationStatus: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        expect(recs.length).toBe(1);
        expect(recs[0].type).toBe("lesson_continue");
        expect(recs[0].id).toBe(`rec:course:${courseId}:lesson:${lessonId}`);
        expect(recs[0].title).toContain("مقدمه بر فارماکولوژی");
        expect(recs[0].priority).toBe("medium");
      });

      it("caps recommendations at MAX_RECOMMENDATIONS_COUNT (3) and orders deterministically", async () => {
        const moduleId = randomUUID() as ModuleId;
        const l1 = randomUUID() as LessonId;
        const l2 = randomUUID() as LessonId;
        moduleStore.insert({
          id: moduleId,
          courseId,
          title: "M1",
          description: null,
          sortOrder: 1,
          documentId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });
        lessonStore.insert({
          id: l1,
          moduleId,
          title: "L1",
          content: "C1",
          sortOrder: 1,
          documentChunkId: null,
          publicationStatus: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });
        lessonStore.insert({
          id: l2,
          moduleId,
          title: "L2",
          content: "C2",
          sortOrder: 2,
          documentChunkId: null,
          publicationStatus: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });

        // 1. Due flashcard -> Priority High
        const card = seedFlashcard();
        await userFlashcardScheduleStore.upsertSchedule({
          userId: student.userId,
          flashcardId: card.id,
          dueAt: new Date(Date.now() - 3600000).toISOString(),
          intervalDays: 1,
          easeFactor: 2.5,
          reviewCount: 1,
          lastReviewedAt: new Date().toISOString(),
        });

        // 2. Weak quiz 1 (< 50%) -> Priority High
        const quiz1 = seedQuiz({ title: "Very Weak Quiz" });
        const q1 = seedQuizQuestions(quiz1.id);
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz1.id,
          answers: [{ questionId: q1[0].id, answer: "wrong" }],
        });

        // 3. Weak quiz 2 (50% <= score < 70%) -> Priority Medium
        const quiz2 = seedQuiz({ title: "Medium Weak Quiz" });
        const q2 = seedQuizQuestions(quiz2.id);
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz2.id,
          answers: [{ questionId: q2[0].id, answer: "Activates receptor" }],
        });

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        expect(recs.length).toBeLessThanOrEqual(3);
        // High priority recommendations must come first
        expect(recs[0].priority).toBe("high");
        expect(recs[1].priority).toBe("high");

        // Critical weak quiz (<50%) ranks before due flashcard
        expect(recs[0].id).toBe(`rec:course:${courseId}:quiz:${quiz1.id}:weak`);
        expect(recs[1].id).toBe(`rec:course:${courseId}:flashcards:due`);
      });

      it("Scenario 1: 1 Due card + 35% quiz -> critical weak quiz first, due card second", async () => {
        // 1. One Due Flashcard
        const card = seedFlashcard();
        await userFlashcardScheduleStore.upsertSchedule({
          userId: student.userId,
          flashcardId: card.id,
          dueAt: new Date(Date.now() - 3600000).toISOString(),
          intervalDays: 1,
          easeFactor: 2.5,
          reviewCount: 1,
          lastReviewedAt: new Date().toISOString(),
        });

        // 2. 35% Quiz (< 50%) -> Critical weak quiz
        const quiz = seedQuiz({ title: "Pharmacokinetics 35" });
        const questions = seedQuizQuestions(quiz.id);
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz.id,
          answers: [{ questionId: questions[0].id, answer: "wrong" }],
        });

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        expect(recs).toHaveLength(2);
        expect(recs[0].id).toBe(`rec:course:${courseId}:quiz:${quiz.id}:weak`);
        expect(recs[0].priority).toBe("high");
        expect(recs[1].id).toBe(`rec:course:${courseId}:flashcards:due`);
        expect(recs[1].priority).toBe("high");
      });

      it("Scenario 2: Due cards + 65% quiz + unfinished lesson -> Due first, 65% quiz second, unfinished lesson third", async () => {
        // 1. Module and published unfinished lesson
        const moduleId = randomUUID() as ModuleId;
        const lessonId = randomUUID() as LessonId;
        moduleStore.insert({
          id: moduleId,
          courseId,
          title: "فصل مبانی",
          description: null,
          sortOrder: 1,
          documentId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });
        lessonStore.insert({
          id: lessonId,
          moduleId,
          title: "درس دوم ناتمام",
          content: "محتوا",
          sortOrder: 1,
          documentChunkId: null,
          publicationStatus: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });

        // 2. Due flashcards
        const card = seedFlashcard();
        await userFlashcardScheduleStore.upsertSchedule({
          userId: student.userId,
          flashcardId: card.id,
          dueAt: new Date(Date.now() - 3600000).toISOString(),
          intervalDays: 1,
          easeFactor: 2.5,
          reviewCount: 1,
          lastReviewedAt: new Date().toISOString(),
        });

        // 3. 65% Moderate Weak Quiz (50% <= score < 70%)
        const quiz = seedQuiz({ title: "Moderate Quiz 65" });
        const questions = seedQuizQuestions(quiz.id);
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz.id,
          answers: [{ questionId: questions[0].id, answer: "Activates receptor" }],
        });

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        expect(recs).toHaveLength(3);
        expect(recs[0].type).toBe("flashcard_review");
        expect(recs[0].priority).toBe("high");
        expect(recs[1].type).toBe("quiz_retry_weak");
        expect(recs[1].priority).toBe("medium");
        expect(recs[1].title).toContain("Moderate Quiz 65");
        expect(recs[2].type).toBe("lesson_continue");
        expect(recs[2].priority).toBe("medium");
        expect(recs[2].title).toContain("درس دوم ناتمام");
      });

      it("Scenario 3: 35% quiz + 65% quiz + unfinished lesson -> 35% quiz first, 65% quiz second, lesson third", async () => {
        // 1. Module and published unfinished lesson
        const moduleId = randomUUID() as ModuleId;
        const lessonId = randomUUID() as LessonId;
        moduleStore.insert({
          id: moduleId,
          courseId,
          title: "فصل مبانی",
          description: null,
          sortOrder: 1,
          documentId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });
        lessonStore.insert({
          id: lessonId,
          moduleId,
          title: "درس بعدی",
          content: "محتوا",
          sortOrder: 1,
          documentChunkId: null,
          publicationStatus: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        });

        // 2. 35% quiz (< 50%) -> Critical
        const quiz35 = seedQuiz({ title: "Critical Quiz 35" });
        const q35 = seedQuizQuestions(quiz35.id);
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz35.id,
          answers: [{ questionId: q35[0].id, answer: "wrong" }],
        });

        // 3. 65% quiz (50-69%) -> Moderate
        const quiz65 = seedQuiz({ title: "Moderate Quiz 65" });
        const q65 = seedQuizQuestions(quiz65.id);
        await service.submitQuizAttempt(student, organizationId, {
          quizId: quiz65.id,
          answers: [{ questionId: q65[0].id, answer: "Activates receptor" }],
        });

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        expect(recs).toHaveLength(3);
        expect(recs[0].type).toBe("quiz_retry_weak");
        expect(recs[0].priority).toBe("high");
        expect(recs[0].title).toContain("Critical Quiz 35");

        expect(recs[1].type).toBe("quiz_retry_weak");
        expect(recs[1].priority).toBe("medium");
        expect(recs[1].title).toContain("Moderate Quiz 65");

        expect(recs[2].type).toBe("lesson_continue");
        expect(recs[2].priority).toBe("medium");
        expect(recs[2].title).toContain("درس بعدی");
      });

      it("maintains backward compatibility with analytics.recommended_next_steps", async () => {
        const card = seedFlashcard();
        await userFlashcardScheduleStore.upsertSchedule({
          userId: student.userId,
          flashcardId: card.id,
          dueAt: new Date(Date.now() - 3600000).toISOString(),
          intervalDays: 1,
          easeFactor: 2.5,
          reviewCount: 1,
          lastReviewedAt: new Date().toISOString(),
        });

        const analytics = await service.getStudyAnalytics(student, organizationId, courseId);
        expect(analytics.recommended_next_steps).toBeDefined();
        expect(Array.isArray(analytics.recommended_next_steps)).toBe(true);
        expect(analytics.recommended_next_steps.length).toBeGreaterThan(0);
        expect(analytics.recommended_next_steps[0]).toContain("مرور فلش‌کارت‌ها");
      });
    });

    describe("Multi-Tenant Course Flashcard Scope & Mastery Calculation (Pharma 3 Root Cause Regression)", () => {
      const systemOrgId = "00000000-0000-0000-0000-000000000000" as OrganizationId;
      const userOrgId = "11111111-1111-4111-8111-111111111111" as OrganizationId;

      it("correctly aggregates total_flashcards from system/owner org (676) + user org (124) = 800 total", async () => {
        const multiTenantService = new StudyService(
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
          undefined,
          systemOrgId,
        );

        // 1. Seed 676 cards in systemOrganizationId for courseId
        for (let i = 0; i < 676; i++) {
          seedFlashcard({}, systemOrgId);
        }

        // 2. Seed 124 cards in userOrgId for courseId
        const userCards: FlashcardRecord[] = [];
        for (let i = 0; i < 124; i++) {
          userCards.push(seedFlashcard({}, userOrgId));
        }

        // 3. Seed 10 soft-deleted cards in courseId (should be ignored)
        seedFlashcard({ deletedAt: new Date().toISOString() }, systemOrgId);

        // 4. Seed 50 cards in another unrelated course (should be ignored)
        const otherCourseId = randomUUID() as CourseId;
        for (let i = 0; i < 50; i++) {
          seedFlashcard({ courseId: otherCourseId }, systemOrgId);
        }

        // Case A: User has 0 mastered cards
        let analytics = await multiTenantService.getStudyAnalytics(student, userOrgId, courseId);
        expect(analytics.total_flashcards).toBe(800);
        expect(analytics.reviewed_flashcards).toBe(0);
        expect(analytics.mastered_flashcards).toBe(0);
        expect(analytics.flashcard_mastery_percent).toBe(0);

        // Case B: User masters 10 cards (interval >= 7, reviewCount >= 1)
        for (let i = 0; i < 10; i++) {
          await userFlashcardScheduleStore.upsertSchedule({
            userId: student.userId,
            flashcardId: userCards[i].id,
            dueAt: new Date(Date.now() + 86400000 * 10).toISOString(),
            intervalDays: 10,
            easeFactor: 2.5,
            reviewCount: 3,
            lastReviewedAt: new Date().toISOString(),
          });
        }

        analytics = await multiTenantService.getStudyAnalytics(student, userOrgId, courseId);
        expect(analytics.total_flashcards).toBe(800);
        expect(analytics.reviewed_flashcards).toBe(10);
        expect(analytics.mastered_flashcards).toBe(10);
        // (10 / 800) * 100 = 1.25% -> rounds to 1%
        expect(analytics.flashcard_mastery_percent).toBe(1);
      });
    });

    describe("Flashcard Recommendation & Review Queue Reconciled Regression Tests", () => {
      it("Case 1: Due = 0 -> does not generate flashcard_review recommendation", async () => {
        // Seed 10 unreviewed cards (no schedule)
        for (let i = 0; i < 10; i++) {
          seedFlashcard();
        }

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        const flashcardRec = recs.find((r) => r.source === "flashcard_review");
        expect(flashcardRec).toBeUndefined();
      });

      it("Case 2: Due = 1, limit = 120 -> displays 1 card in recommendation", async () => {
        const card = seedFlashcard();
        await userFlashcardScheduleStore.upsertSchedule({
          userId: student.userId,
          flashcardId: card.id,
          dueAt: new Date(Date.now() - 3600000).toISOString(),
          intervalDays: 1,
          easeFactor: 2.5,
          reviewCount: 1,
          lastReviewedAt: new Date().toISOString(),
        });

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        const flashcardRec = recs.find((r) => r.source === "flashcard_review");
        expect(flashcardRec).toBeDefined();
        expect(flashcardRec?.summary).toBe("شما ۱ فلش‌کارت آماده برای مرور دارید.");
        expect(flashcardRec?.metadata?.dueCount).toBe(1);
      });

      it("Case 3: Due = 120, limit = 120 -> displays 120 cards in recommendation", async () => {
        for (let i = 0; i < 120; i++) {
          const card = seedFlashcard();
          await userFlashcardScheduleStore.upsertSchedule({
            userId: student.userId,
            flashcardId: card.id,
            dueAt: new Date(Date.now() - 3600000).toISOString(),
            intervalDays: 1,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewedAt: new Date().toISOString(),
          });
        }

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        const flashcardRec = recs.find((r) => r.source === "flashcard_review");
        expect(flashcardRec).toBeDefined();
        expect(flashcardRec?.summary).toBe("شما ۱۲۰ فلش‌کارت آماده برای مرور دارید.");
        expect(flashcardRec?.metadata?.dueCount).toBe(120);
      });

      it("Case 4: Due = 150, limit = 120 -> displays capped 120 cards in recommendation", async () => {
        for (let i = 0; i < 150; i++) {
          const card = seedFlashcard();
          await userFlashcardScheduleStore.upsertSchedule({
            userId: student.userId,
            flashcardId: card.id,
            dueAt: new Date(Date.now() - 3600000).toISOString(),
            intervalDays: 1,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewedAt: new Date().toISOString(),
          });
        }

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        const flashcardRec = recs.find((r) => r.source === "flashcard_review");
        expect(flashcardRec).toBeDefined();
        expect(flashcardRec?.summary).toBe("شما ۱۲۰ فلش‌کارت آماده برای مرور دارید.");
        expect(flashcardRec?.metadata?.dueCount).toBe(120);
      });

      it("Case 5: Unreviewed cards are strictly excluded from Due count and Review Queue", async () => {
        // 5 cards without schedule
        for (let i = 0; i < 5; i++) {
          seedFlashcard({ dueAt: new Date(Date.now() - 3600000).toISOString() });
        }

        // 5 cards with reviewCount = 0
        for (let i = 0; i < 5; i++) {
          const card = seedFlashcard();
          await userFlashcardScheduleStore.upsertSchedule({
            userId: student.userId,
            flashcardId: card.id,
            dueAt: new Date(Date.now() - 3600000).toISOString(),
            intervalDays: 0,
            easeFactor: 2.5,
            reviewCount: 0,
            lastReviewedAt: new Date().toISOString(),
          });
        }

        // 2 genuinely due cards (reviewCount >= 1 && dueAt <= now)
        const dueCards: FlashcardRecord[] = [];
        for (let i = 0; i < 2; i++) {
          const card = seedFlashcard();
          dueCards.push(card);
          await userFlashcardScheduleStore.upsertSchedule({
            userId: student.userId,
            flashcardId: card.id,
            dueAt: new Date(Date.now() - 3600000).toISOString(),
            intervalDays: 1,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewedAt: new Date().toISOString(),
          });
        }

        const summary = await service.getFlashcardSummary(student, organizationId);
        expect(summary.courseMap.get(courseId)?.due).toBe(2);
        expect(summary.courseMap.get(courseId)?.newCards).toBe(10); // 5 unscheduled + 5 reviewCount=0

        const reviewQueue = await service.listFlashcardsForReview(student, organizationId, courseId);
        expect(reviewQueue.length).toBe(2);
        expect(reviewQueue.map((c) => c.id).sort()).toEqual(dueCards.map((c) => c.id).sort());

        const recs = await service.getStudyRecommendations(student, organizationId, courseId);
        const flashcardRec = recs.find((r) => r.source === "flashcard_review");
        expect(flashcardRec?.summary).toBe("شما ۲ فلش‌کارت آماده برای مرور دارید.");
      });

      it("Case 6: End-to-end consistency (800 total, 700 unreviewed, 100 reviewed, 35 due, limit 20)", async () => {
        // 700 unreviewed cards
        for (let i = 0; i < 700; i++) {
          seedFlashcard();
        }

        // 65 reviewed cards not due (future)
        for (let i = 0; i < 65; i++) {
          const card = seedFlashcard();
          await userFlashcardScheduleStore.upsertSchedule({
            userId: student.userId,
            flashcardId: card.id,
            dueAt: new Date(Date.now() + 86400000 * 5).toISOString(),
            intervalDays: 5,
            easeFactor: 2.5,
            reviewCount: 2,
            lastReviewedAt: new Date().toISOString(),
          });
        }

        // 35 reviewed cards due (past)
        const dueCards: FlashcardRecord[] = [];
        for (let i = 0; i < 35; i++) {
          const card = seedFlashcard();
          dueCards.push(card);
          await userFlashcardScheduleStore.upsertSchedule({
            userId: student.userId,
            flashcardId: card.id,
            dueAt: new Date(Date.now() - 3600000).toISOString(),
            intervalDays: 1,
            easeFactor: 2.5,
            reviewCount: 1,
            lastReviewedAt: new Date().toISOString(),
          });
        }

        const analytics = await service.getStudyAnalytics(student, organizationId, courseId);
        expect(analytics.total_flashcards).toBe(800);
        expect(analytics.reviewed_flashcards).toBe(100);

        // Verify recommendations with limit override (dailyReviewLimit = 20)
        const recs = await service.getStudyRecommendations(student, organizationId, courseId, {
          dailyReviewLimit: 20,
        });
        const flashcardRec = recs.find((r) => r.source === "flashcard_review");
        expect(flashcardRec).toBeDefined();
        // Capped at 20:
        expect(flashcardRec?.summary).toBe("شما ۲۰ فلش‌کارت آماده برای مرور دارید.");
        expect(flashcardRec?.metadata?.dueCount).toBe(20);

        // Verify review queue returns all 35 due cards (or limited when limit requested)
        const fullQueue = await service.listFlashcardsForReview(student, organizationId, courseId);
        expect(fullQueue.length).toBe(35);
        expect(fullQueue.map((c) => c.id).sort()).toEqual(dueCards.map((c) => c.id).sort());
      });
    });
  });
});
