/**
 * Flashcard Study Sessions (Persistence & Resume) Unit & Integration Tests.
 *
 * Covers:
 * 1. Session Creation: Snapshotting cards with preserved sort order, initial status 'in_progress', session card status 'unseen'.
 * 2. Active Sessions Listing: Returns in-progress sessions, excludes completed and cancelled sessions.
 * 3. Multi-User Isolation: User A cannot list or resume User B's sessions.
 * 4. Resume Precision: Retrieves session with cards, updates current_index, current_card_id, and completed_cards.
 * 5. Card Status Source of Truth: Updates flashcard_study_session_cards status to 'reviewed' with rating.
 * 6. Deletion / Cancellation: Soft deletes session by setting status='cancelled', preserves record.
 * 7. Completion: Sets status='completed' with completedAt timestamp, auto-completes on 100% progress.
 * 8. Resilience: Safely handles deleted flashcards without crashing.
 */

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

describe("Flashcard Study Sessions (Resume & Persistence)", () => {
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

  function seedFlashcards(count = 5): FlashcardRecord[] {
    const cards: FlashcardRecord[] = [];
    const now = new Date().toISOString();
    for (let i = 1; i <= count; i++) {
      const card: FlashcardRecord = {
        id: randomUUID() as FlashcardId,
        organizationId,
        courseId,
        documentId,
        generatedContentId: null,
        question: `Question ${i}: What is concept ${i}?`,
        answer: `Answer ${i}: Definition of concept ${i}.`,
        explanation: `Explanation for concept ${i}.`,
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
      cards.push(card);
    }
    return cards;
  }

  it("creates a persistent flashcard study session with snapshotted cards and initial progress", async () => {
    const cards = seedFlashcards(4);

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.userId).toBe(student.userId);
    expect(session.organizationId).toBe(organizationId);
    expect(session.status).toBe("in_progress");
    expect(session.totalCards).toBe(4);
    expect(session.completedCards).toBe(0);
    expect(session.currentIndex).toBe(0);
    expect(session.currentCardId).toBe(cards[0].id);

    // Verify session cards in store
    const sessionCards = await flashcardStudySessionStore.listSessionCards(session.id);
    expect(sessionCards.length).toBe(4);
    expect(sessionCards[0].sortOrder).toBe(0);
    expect(sessionCards[0].status).toBe("unseen");
    expect(sessionCards[0].flashcardId).toBe(cards[0].id);
  });

  it("lists active in-progress study sessions for the user and excludes completed/cancelled", async () => {
    seedFlashcards(3);

    const s1 = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
      title: "Session 1",
    });

    const s2 = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "exam",
      title: "Session 2",
    });

    // Mark s2 as cancelled
    await service.cancelFlashcardStudySession(student, organizationId, s2.id);

    const activeSessions = await service.listActiveFlashcardStudySessions(student, organizationId);
    expect(activeSessions.length).toBe(1);
    expect(activeSessions[0].id).toBe(s1.id);
    expect(activeSessions[0].title).toBe("Session 1");
    expect(activeSessions[0].totalCards).toBe(3);
    expect(activeSessions[0].completedCards).toBe(0);
  });

  it("enforces tenant and user isolation: User B cannot see or access User A's session", async () => {
    seedFlashcards(3);

    const sessionA = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });

    // User B lists active sessions -> empty
    const listB = await service.listActiveFlashcardStudySessions(otherStudent, organizationId);
    expect(listB.length).toBe(0);

    // User B tries to get User A's session -> throws forbidden
    await expect(
      service.getFlashcardStudySession(otherStudent, organizationId, sessionA.id),
    ).rejects.toThrow("دسترسی به این مطالعه مجاز نیست");

    // User B tries to update User A's session -> throws forbidden
    await expect(
      service.updateFlashcardStudySessionProgress(otherStudent, organizationId, sessionA.id, {
        currentIndex: 1,
      }),
    ).rejects.toThrow("دسترسی به این مطالعه مجاز نیست");

    // Cross-organization check -> throws not_found
    await expect(
      service.getFlashcardStudySession(student, otherOrgId, sessionA.id),
    ).rejects.toThrow("مطالعه یافت نشد");
  });

  it("updates progress incrementally, updates session card status, and supports precise resume", async () => {
    const cards = seedFlashcards(4);

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });

    // Student reviews card 0 with 'good', reactionMs: 1200, and moves to index 1
    const updated1 = await service.updateFlashcardStudySessionProgress(student, organizationId, session.id, {
      currentIndex: 1,
      currentCardId: cards[1].id,
      cardId: cards[0].id,
      rating: "good",
      reactionMs: 1200,
    });

    expect(updated1.currentIndex).toBe(1);
    expect(updated1.completedCards).toBe(1);
    expect(updated1.currentCardId).toBe(cards[1].id);
    expect(updated1.status).toBe("in_progress");

    // Check session card record in store
    const sessionCards1 = await flashcardStudySessionStore.listSessionCards(session.id);
    expect(sessionCards1[0].status).toBe("reviewed");
    expect(sessionCards1[0].rating).toBe("good");
    expect(sessionCards1[0].reactionMs).toBe(1200);
    expect(sessionCards1[1].status).toBe("unseen");

    // Resume session: detail returns accurate current_index and ordered cards
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(detail.session.currentIndex).toBe(1);
    expect(detail.session.completedCards).toBe(1);
    expect(detail.cards.length).toBe(4);
    expect(detail.cards[1].id).toBe(cards[1].id);
    expect(detail.sessionCards[0].reactionMs).toBe(1200);
  });

  it("auto-completes session when reaching final card progress (100%)", async () => {
    const cards = seedFlashcards(2);

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });

    // Review card 0
    await service.updateFlashcardStudySessionProgress(student, organizationId, session.id, {
      currentIndex: 1,
      currentCardId: cards[1].id,
      cardId: cards[0].id,
      rating: "good",
    });

    // Review card 1 (final card) -> moves to index 2
    const finalUpdate = await service.updateFlashcardStudySessionProgress(student, organizationId, session.id, {
      currentIndex: 2,
      cardId: cards[1].id,
      rating: "easy",
    });

    expect(finalUpdate.completedCards).toBe(2);
    expect(finalUpdate.status).toBe("completed");
    expect(finalUpdate.completedAt).toBeDefined();

    // Verify it is no longer listed in active sessions
    const active = await service.listActiveFlashcardStudySessions(student, organizationId);
    expect(active.length).toBe(0);
  });

  it("cancels a study session via soft delete without hard deleting data", async () => {
    seedFlashcards(3);

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });

    const cancelled = await service.cancelFlashcardStudySession(student, organizationId, session.id);
    expect(cancelled.status).toBe("cancelled");

    // Ensure session record still exists in store with status cancelled
    const record = await flashcardStudySessionStore.findById(session.id);
    expect(record).toBeDefined();
    expect(record!.status).toBe("cancelled");

    // Ensure not listed in active sessions
    const active = await service.listActiveFlashcardStudySessions(student, organizationId);
    expect(active.length).toBe(0);
  });

  it("safely handles deleted flashcards during session resume without crashing", async () => {
    const cards = seedFlashcards(3);

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });

    // Soft delete card 1 from flashcardStore (e.g. author deleted the card)
    flashcardStore.insert({ ...cards[1], deletedAt: new Date().toISOString() });

    // Retrieve session: should not throw, should handle missing card safely by filtering it out
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(detail.cards.length).toBe(2);
    // Card 0 and 2 are intact
    expect(detail.cards[0].question).toContain("Question 1");
    expect(detail.cards[1].question).toContain("Question 3");
  });

  it("accurately tracks 10-card session review, exit at card 4, and resumes preserving reviewed vs unseen snapshot state", async () => {
    const cards = seedFlashcards(10);

    // 1. Create session with 10 cards
    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseId,
      mode: "daily",
    });
    expect(session.totalCards).toBe(10);
    expect(session.completedCards).toBe(0);
    expect(session.currentIndex).toBe(0);

    // 2. Review cards 0..3 (4 cards)
    for (let i = 0; i < 4; i++) {
      await service.updateFlashcardStudySessionProgress(student, organizationId, session.id, {
        currentIndex: i + 1,
        currentCardId: cards[i + 1].id,
        cardId: cards[i].id,
        rating: i % 2 === 0 ? "good" : "easy",
        reactionMs: 1000 + i * 100,
      });
    }

    // 3. Exit & Resume (fetch session detail)
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(detail.session.completedCards).toBe(4);
    expect(detail.session.currentIndex).toBe(4);
    expect(detail.session.currentCardId).toBe(cards[4].id);

    // Assert session_cards statuses
    const reviewedCount = detail.sessionCards.filter((sc) => sc.status === "reviewed").length;
    const unseenCount = detail.sessionCards.filter((sc) => sc.status === "unseen").length;
    expect(reviewedCount).toBe(4);
    expect(unseenCount).toBe(6);

    for (let i = 0; i < 4; i++) {
      expect(detail.sessionCards[i].status).toBe("reviewed");
      expect(detail.sessionCards[i].rating).toBeDefined();
    }
    for (let i = 4; i < 10; i++) {
      expect(detail.sessionCards[i].status).toBe("unseen");
      expect(detail.sessionCards[i].rating).toBeNull();
    }

    // The active current card on resume is card 5 (index 4)
    expect(detail.cards[detail.session.currentIndex].id).toBe(cards[4].id);

    // 4. Simulate browser refresh / second load
    const refreshDetail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(refreshDetail.session.completedCards).toBe(4);
    expect(refreshDetail.session.currentIndex).toBe(4);
    expect(refreshDetail.sessionCards.filter((sc) => sc.status === "reviewed").length).toBe(4);
    expect(refreshDetail.sessionCards.filter((sc) => sc.status === "unseen").length).toBe(6);
  });
});
