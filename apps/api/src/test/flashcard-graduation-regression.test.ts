import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  type CourseId,
  type DocumentId,
  type FlashcardId,
  type OrganizationId,
  type UserId,
  RoleBasedPolicy,
} from "@avana/domain";
import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryFlashcardStudySessionStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import type { FlashcardRecord } from "../modules/study/study-store.js";

describe("Flashcard Graduation & Review Regression Tests", () => {
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStudySessionStore: InMemoryFlashcardStudySessionStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let service: StudyService;

  const organizationId = "11111111-1111-4111-8111-111111111111" as OrganizationId;
  const courseId = "22222222-2222-4222-8222-222222222222" as CourseId;
  const documentId = "33333333-3333-4333-8333-333333333333" as DocumentId;
  const studentUserId = "44444444-4444-4444-8444-444444444444" as UserId;
  const otherUserId = "55555555-5555-4555-8555-555555555555" as UserId;

  const student: Actor = {
    userId: studentUserId,
    role: "student",
    memberships: [
      {
        organizationId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const otherStudent: Actor = {
    userId: otherUserId,
    role: "student",
    memberships: [
      {
        organizationId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
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
    flashcardStudySessionStore = new InMemoryFlashcardStudySessionStore();
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
      undefined,
      undefined,
      undefined,
      flashcardStudySessionStore,
    );
  });

  function createCard(id: FlashcardId): FlashcardRecord {
    const now = new Date().toISOString();
    const card: FlashcardRecord = {
      id,
      organizationId,
      courseId,
      documentId,
      generatedContentId: null,
      question: `Question for ${id}`,
      answer: `Answer for ${id}`,
      explanation: `Explanation for ${id}`,
      cardType: "definition",
      difficulty: "medium",
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    flashcardStore.insert(card);
    return card;
  }

  it("1. New card + 1st Good: does NOT graduate yet (intervalDays=0, due today)", async () => {
    const cardId = "fc-new-1" as FlashcardId;
    createCard(cardId);

    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
    });

    const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(schedule).toBeDefined();
    // Remains 0 (learning step, not graduated yet)
    expect(schedule!.intervalDays).toBe(0);
    expect(schedule!.reviewCount).toBe(1);

    // Due today (dueAt <= now + small buffer)
    const dueTime = new Date(schedule!.dueAt).getTime();
    expect(dueTime).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("2. New card + 2nd Good: graduates (intervalDays=1, scheduled for tomorrow)", async () => {
    const cardId = "fc-new-2" as FlashcardId;
    createCard(cardId);

    // First Good
    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
    });

    // Second Good
    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
    });

    const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(schedule).toBeDefined();
    expect(schedule!.intervalDays).toBe(1);
    expect(schedule!.reviewCount).toBe(2);

    // Next review scheduled for tomorrow (~24 hours later)
    const dueTime = new Date(schedule!.dueAt).getTime();
    const nowTime = Date.now();
    expect(dueTime - nowTime).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
  });

  it("3. New card + 1st Good + Refresh: still requires 2nd Good to graduate", async () => {
    const cardId = "fc-new-3" as FlashcardId;
    createCard(cardId);

    // Submit 1st Good
    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
    });

    // Simulate page refresh / schedule check:
    // Schedule in database must still reflect intervalDays = 0, NOT a Review card
    const scheduleAfterRefresh = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(scheduleAfterRefresh).toBeDefined();
    expect(scheduleAfterRefresh!.intervalDays).toBe(0);

    // Now submit 2nd Good after refresh
    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
    });

    const finalSchedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(finalSchedule!.intervalDays).toBe(1);
  });

  it("4. Review card + 1st Good: graduates immediately today", async () => {
    const cardId = "fc-rev-good" as FlashcardId;
    createCard(cardId);

    // Seed existing review schedule (intervalDays = 1)
    await userFlashcardScheduleStore.upsertSchedule({
      userId: studentUserId,
      flashcardId: cardId,
      dueAt: new Date().toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
    });

    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
    });

    const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(schedule).toBeDefined();
    // 1 * 2.5 = 2.5 -> 3 days
    expect(schedule!.intervalDays).toBeGreaterThanOrEqual(2);
    const dueTime = new Date(schedule!.dueAt).getTime();
    expect(dueTime - Date.now()).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
  });

  it("5. Review card + Easy: graduates immediately today", async () => {
    const cardId = "fc-rev-easy" as FlashcardId;
    createCard(cardId);

    // Seed existing review schedule (intervalDays = 1)
    await userFlashcardScheduleStore.upsertSchedule({
      userId: studentUserId,
      flashcardId: cardId,
      dueAt: new Date().toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
    });

    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "easy",
    });

    const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(schedule).toBeDefined();
    expect(schedule!.intervalDays).toBeGreaterThanOrEqual(2);
  });

  it("6. Review card + Again: enters review queue today (lapse, due in 10 mins)", async () => {
    const cardId = "fc-rev-again" as FlashcardId;
    createCard(cardId);

    // Seed existing review schedule (intervalDays = 2)
    await userFlashcardScheduleStore.upsertSchedule({
      userId: studentUserId,
      flashcardId: cardId,
      dueAt: new Date().toISOString(),
      intervalDays: 2,
      easeFactor: 2.5,
    });

    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "again",
    });

    const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(schedule).toBeDefined();
    expect(schedule!.intervalDays).toBe(0);

    const dueTime = new Date(schedule!.dueAt).getTime();
    const nowTime = Date.now();
    // Due ~10 minutes from now (between 8 and 12 mins)
    expect(dueTime - nowTime).toBeLessThanOrEqual(12 * 60 * 1000);
    expect(dueTime - nowTime).toBeGreaterThanOrEqual(8 * 60 * 1000);
  });

  it("7. New card + Again: retains learning behavior (interval 0, due in 3 mins)", async () => {
    const cardId = "fc-new-again" as FlashcardId;
    createCard(cardId);

    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "again",
    });

    const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(schedule).toBeDefined();
    expect(schedule!.intervalDays).toBe(0);

    const dueTime = new Date(schedule!.dueAt).getTime();
    const nowTime = Date.now();
    // Due ~3 minutes from now (between 2 and 4 mins)
    expect(dueTime - nowTime).toBeLessThanOrEqual(4 * 60 * 1000);
    expect(dueTime - nowTime).toBeGreaterThanOrEqual(2 * 60 * 1000);
  });

  it("8. Check non-double-counting of completedCards in updateFlashcardStudySessionProgress", async () => {
    const card1 = "fc-c1" as FlashcardId;
    const card2 = "fc-c2" as FlashcardId;
    createCard(card1);
    createCard(card2);

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });

    // Update progress for card1 (first time)
    const prog1 = await service.updateFlashcardStudySessionProgress(student, organizationId, session.id, {
      currentIndex: 0,
      cardId: card1,
      rating: "again",
    });
    expect(prog1.completedCards).toBe(1);

    // Update progress for card1 AGAIN (same card repeated)
    const prog2 = await service.updateFlashcardStudySessionProgress(student, organizationId, session.id, {
      currentIndex: 0,
      cardId: card1,
      rating: "good",
    });
    // Should still be 1 unique card completed, NOT 2
    expect(prog2.completedCards).toBe(1);

    // Update progress for card2 (second unique card)
    const prog3 = await service.updateFlashcardStudySessionProgress(student, organizationId, session.id, {
      currentIndex: 1,
      cardId: card2,
      rating: "good",
    });
    expect(prog3.completedCards).toBe(2);
    // Since totalCards was 2, session auto-completes
    expect(prog3.status).toBe("completed");
  });

  it("preserves strict multi-user isolation on flashcard schedules", async () => {
    const cardId = "fc-iso" as FlashcardId;
    createCard(cardId);

    // Seed review card for student
    await userFlashcardScheduleStore.upsertSchedule({
      userId: studentUserId,
      flashcardId: cardId,
      dueAt: new Date().toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
    });

    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
    });

    const studentSchedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    const otherSchedule = await userFlashcardScheduleStore.getByUserAndCard(otherUserId, cardId);

    expect(studentSchedule).toBeDefined();
    expect(studentSchedule!.intervalDays).toBeGreaterThanOrEqual(1);
    expect(otherSchedule).toBeUndefined();
  });

  it("does not alter SRS schedule when reviewing in Exam Mode", async () => {
    const cardId = "fc-exam" as FlashcardId;
    createCard(cardId);

    await service.submitFlashcardReview(student, organizationId, {
      flashcardId: cardId,
      rating: "good",
      isExamMode: true,
    });

    const schedule = await userFlashcardScheduleStore.getByUserAndCard(studentUserId, cardId);
    expect(schedule).toBeUndefined();

    // Review record is still persisted for audit / history
    const reviews = await flashcardReviewStore.listByUserAndFlashcard(studentUserId, cardId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe("good");
  });
});
