/* eslint-disable no-secrets/no-secrets */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  Actor,
  CourseId,
  DocumentId,
  FlashcardId,
  OrganizationId,
  QuizId,
  QuizQuestionId,
  UserId,
} from "@avana/domain";
import { RoleBasedPolicy, Roles } from "@avana/domain";
import { StudyService } from "../modules/study/study-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import type { UserRecord } from "../modules/identity/user-store.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { studyRoutes } from "../modules/study/study-routes.js";
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
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";

describe("Study Performance & Optimization Audit Test Suite", () => {
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let courseStore: InMemoryCourseStore;
  let progressStore: InMemoryProgressStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;
  let flashcardStudySessionStore: InMemoryFlashcardStudySessionStore;
  let service: StudyService;

  const organizationId = "11111111-1111-4111-8111-111111111111" as OrganizationId;
  const courseId = "22222222-2222-4222-8222-222222222222" as CourseId;
  const studentUserId = "33333333-3333-4333-8333-333333333333" as UserId;

  const student: Actor = {
    userId: studentUserId,
    role: "student",
  };

  beforeEach(async () => {
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    quizStore.setQuestionStore(quizQuestionStore);
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    courseStore = new InMemoryCourseStore();
    progressStore = new InMemoryProgressStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
    flashcardStudySessionStore = new InMemoryFlashcardStudySessionStore();

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
      courseStore,
      undefined,
      undefined,
      flashcardStudySessionStore,
    );

    await courseStore.create({
      course: {
        id: courseId,
        organizationId,
        name: "دوره جامع شیمی آوانا",
        academicYear: "1403",
        grade: "12",
        field: "تجربی",
        icon: "atom",
        color: "#008080",
        description: "آزمون‌ها و فلش‌کارت‌ها",
        status: "published",
        isOfficial: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      creatorUserId: studentUserId,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Non-receipt of questions in quiz list
  // ---------------------------------------------------------------------------
  it("Scenario 1: Non-receipt of questions, choices, answers, and explanations in quiz list", async () => {
    const q1Id = randomUUID() as QuizId;
    await quizStore.create({
      id: q1Id,
      organizationId,
      courseId,
      title: "آزمون مبحث ساختار اتم",
      status: "published",
      topic: "شیمی دهم",
      difficulty: "medium",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId: q1Id,
        question: "عدد جرمی نشان‌دهنده چیست؟",
        difficulty: "easy",
        questionType: "multiple_choice",
        choices: ["پروتون + نوترون", "الکترون + پروتون", "فقط نوترون", "فقط پروتون"],
        correctAnswer: "پروتون + نوترون",
        explanation: "مجموع ذرات درون هسته عدد جرمی است.",
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
    ]);

    const result = await service.listQuizzes(student, organizationId, courseId, { limit: 10, offset: 0 });
    expect(result.items.length).toBe(1);
    const quizItem = result.items[0];

    // Basic metadata and question_count are returned
    expect(quizItem.id).toBe(q1Id);
    expect(quizItem.question_count).toBe(1);
    expect(quizItem.title).toBe("آزمون مبحث ساختار اتم");

    // Questions and choices are NOT returned on the quiz item
    expect((quizItem as Record<string, unknown>).questions).toBeUndefined();
    expect((quizItem as Record<string, unknown>).choices).toBeUndefined();
    expect((quizItem as Record<string, unknown>).correctAnswer).toBeUndefined();
    expect((quizItem as Record<string, unknown>).explanation).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 2. No N+1 queries in quiz list
  // ---------------------------------------------------------------------------
  it("Scenario 2: Completely eliminates N+1 queries in quiz list endpoint", async () => {
    for (let i = 0; i < 5; i++) {
      const qId = randomUUID() as QuizId;
      await quizStore.create({
        id: qId,
        organizationId,
        courseId,
        title: `آزمون شماره ${i + 1}`,
        status: "published",
        topic: "شیمی",
        difficulty: "medium",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });

      await quizQuestionStore.createMany([
        {
          id: randomUUID() as QuizQuestionId,
          quizId: qId,
          question: `سوال ${i + 1}`,
          difficulty: "easy",
          questionType: "multiple_choice",
          choices: ["۱", "۲", "۳", "۴"],
          correctAnswer: "۱",
          explanation: "توضیح",
          sortOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          generatedContentId: null,
          lessonId: null,
          deletedAt: null,
        },
      ]);
    }

    const listByQuizSpy = vi.spyOn(quizQuestionStore, "listByQuiz");
    const listWithCountSpy = vi.spyOn(quizStore, "listByCourseWithQuestionCount");

    const result = await service.listQuizzes(student, organizationId, courseId, { limit: 15, offset: 0 });

    expect(result.items.length).toBe(5);
    // Verified: listByCourseWithQuestionCount called once, listByQuiz called 0 times
    expect(listWithCountSpy).toHaveBeenCalledTimes(1);
    expect(listByQuizSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 3. Accuracy of quiz pagination
  // ---------------------------------------------------------------------------
  it("Scenario 3: Server-side pagination accurately pages through quizzes (limit, offset, total, has_more)", async () => {
    for (let i = 0; i < 25; i++) {
      await quizStore.create({
        id: randomUUID() as QuizId,
        organizationId,
        courseId,
        title: `آزمون فصل ${i + 1}`,
        status: "published",
        topic: "شیمی",
        difficulty: "medium",
        createdAt: new Date(Date.now() - (25 - i) * 60000).toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    }

    // Page 1: limit 10, offset 0 -> 10 items, total 25, has_more true
    const page1 = await service.listQuizzes(student, organizationId, courseId, { limit: 10, offset: 0 });
    expect(page1.items.length).toBe(10);
    expect(page1.total).toBe(25);
    expect(page1.limit).toBe(10);
    expect(page1.offset).toBe(0);
    expect(page1.has_more).toBe(true);

    // Page 2: limit 10, offset 10 -> 10 items, total 25, has_more true
    const page2 = await service.listQuizzes(student, organizationId, courseId, { limit: 10, offset: 10 });
    expect(page2.items.length).toBe(10);
    expect(page2.offset).toBe(10);
    expect(page2.has_more).toBe(true);

    // Page 3: limit 10, offset 20 -> 5 items, total 25, has_more false
    const page3 = await service.listQuizzes(student, organizationId, courseId, { limit: 10, offset: 20 });
    expect(page3.items.length).toBe(5);
    expect(page3.offset).toBe(20);
    expect(page3.has_more).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 4. Accuracy of question counts per chapter and difficulty in getExamTopicSummary
  // ---------------------------------------------------------------------------
  it("Scenario 4: getExamTopicSummary accurately aggregates question counts by difficulty and chapter without full question load", async () => {
    const qId = randomUUID() as QuizId;
    await quizStore.create({
      id: qId,
      organizationId,
      courseId,
      title: "آزمون سینتیک شیمیایی",
      status: "published",
      topic: "سینتیک شیمیایی",
      difficulty: "medium",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId: qId,
        question: "سوال آسان ۱",
        difficulty: "easy",
        topic: "سینتیک شیمیایی",
        questionType: "multiple_choice",
        choices: ["۱", "۲", "۳", "۴"],
        correctAnswer: "۱",
        explanation: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
      {
        id: randomUUID() as QuizQuestionId,
        quizId: qId,
        question: "سوال آسان ۲",
        difficulty: "آسان",
        topic: "سینتیک شیمیایی",
        questionType: "multiple_choice",
        choices: ["۱", "۲", "۳", "۴"],
        correctAnswer: "۱",
        explanation: null,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
      {
        id: randomUUID() as QuizQuestionId,
        quizId: qId,
        question: "سوال سخت ۱",
        difficulty: "hard",
        topic: "سینتیک شیمیایی",
        questionType: "multiple_choice",
        choices: ["۱", "۲", "۳", "۴"],
        correctAnswer: "۱",
        explanation: null,
        sortOrder: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
      {
        id: randomUUID() as QuizQuestionId,
        quizId: qId,
        question: "سوال متوسط ۱",
        difficulty: "medium",
        topic: "سینتیک شیمیایی",
        questionType: "multiple_choice",
        choices: ["۱", "۲", "۳", "۴"],
        correctAnswer: "۱",
        explanation: null,
        sortOrder: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
    ]);

    const summary = await service.getExamTopicSummary(student, organizationId);
    expect(summary.courses.length).toBeGreaterThan(0);
    const courseSummary = summary.courses.find((c) => c.courseId === courseId || c.courseTitle.includes("شیمی"));
    expect(courseSummary).toBeDefined();
    expect(courseSummary!.questionCount).toBe(4);
    expect(courseSummary!.easyCount).toBe(2);
    expect(courseSummary!.hardCount).toBe(1);
    expect(courseSummary!.mediumCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Fetching new cards with no review history (review_count > 0 rule)
  // ---------------------------------------------------------------------------
  it("Scenario 5: New cards with no review history are NOT eliminated from the learning queue", async () => {
    const cardId = randomUUID() as FlashcardId;
    await flashcardStore.create({
      id: cardId,
      organizationId,
      courseId,
      question: "تعریف آنتالپی پیوند چیست؟",
      answer: "مقدار انرژی لازم برای شکستن یک مول پیوند کووالانسی",
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedContentId: null,
      deletedAt: null,
    });

    // Student has 0 reviews and 0 schedules for this card (brand new card)
    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseId],
      mode: "daily",
      targetCardCount: 20,
    });

    expect(session.totalCards).toBe(1);

    const restored = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(restored.cards.length).toBe(1);
    expect(restored.cards[0].id).toBe(cardId);

    const newCards = await service.getCustomStudyFlashcards(
      student,
      organizationId,
      "new",
      [courseId],
      20,
    );
    expect(newCards.length).toBe(1);
    expect(newCards[0].id).toBe(cardId);
  });

  // ---------------------------------------------------------------------------
  // 6. Fetching due cards with review history
  // ---------------------------------------------------------------------------
  it("Scenario 6: Due cards with review history (reviewCount > 0, dueAt <= NOW) are included in review queue", async () => {
    const cardId = randomUUID() as FlashcardId;
    await flashcardStore.create({
      id: cardId,
      organizationId,
      courseId,
      question: "قانون هس چیست؟",
      answer: "گرمای کل واکنش مستقل از مسیر انجام آن است",
      explanation: null,
      cardType: "concept",
      difficulty: "medium",
      dueAt: new Date(Date.now() - 3600000).toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedContentId: null,
      deletedAt: null,
    });

    // Schedule for this user: reviewed 2 times, due 1 hour ago
    await userFlashcardScheduleStore.upsertSchedule({
      userId: studentUserId,
      flashcardId: cardId,
      dueAt: new Date(Date.now() - 3600000).toISOString(),
      intervalDays: 1,
      easeFactor: 2.5,
      reviewCount: 2,
      lastReviewedAt: new Date(Date.now() - 86400000).toISOString(),
      rating: 3,
    });

    const reviewCards = await service.listFlashcardsForReviewMulti(
      student,
      organizationId,
      [courseId],
      undefined,
      20,
    );

    expect(reviewCards.some((c) => c.id === cardId)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7. No future cards in review queue (dueAt > NOW excluded)
  // ---------------------------------------------------------------------------
  it("Scenario 7: Future cards (dueAt > NOW) are strictly excluded from the review queue", async () => {
    const futureCardId = randomUUID() as FlashcardId;
    await flashcardStore.create({
      id: futureCardId,
      organizationId,
      courseId,
      question: "آرایش الکترونی گاز نجیب آرگون چیست؟",
      answer: "1s2 2s2 2p6 3s2 3p6",
      explanation: null,
      cardType: "concept",
      difficulty: "easy",
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), // 7 days in future
      intervalDays: 7,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedContentId: null,
      deletedAt: null,
    });

    await userFlashcardScheduleStore.upsertSchedule({
      userId: studentUserId,
      flashcardId: futureCardId,
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      intervalDays: 7,
      easeFactor: 2.5,
      reviewCount: 3,
      lastReviewedAt: new Date().toISOString(),
      rating: 4,
    });

    const reviewCards = await service.listFlashcardsForReviewMulti(
      student,
      organizationId,
      [courseId],
      undefined,
      20,
    );

    expect(reviewCards.some((c) => c.id === futureCardId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 8. Preserving session snapshot card ordering
  // ---------------------------------------------------------------------------
  it("Scenario 8: Preserves exact snapshot card ordering when restoring study sessions", async () => {
    const cardIds: FlashcardId[] = [];
    for (let i = 0; i < 5; i++) {
      const cId = randomUUID() as FlashcardId;
      cardIds.push(cId);
      await flashcardStore.create({
        id: cId,
        organizationId,
        courseId,
        question: `کارت آزمایشی ${i + 1}`,
        answer: `پاسخ ${i + 1}`,
        explanation: null,
        cardType: "concept",
        difficulty: "easy",
        dueAt: new Date().toISOString(),
        intervalDays: 0,
        easeFactor: 2.5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        deletedAt: null,
      });
    }

    // Shuffle the sequence intentionally to verify preservation
    const customOrder = [cardIds[3], cardIds[0], cardIds[4], cardIds[1], cardIds[2]];

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseId],
      mode: "custom",
      targetCardCount: 5,
      cardIds: customOrder,
    });

    const restored = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(restored.cards.map((c) => c.id)).toEqual(customOrder);
  });

  // ---------------------------------------------------------------------------
  // 9. Not loading all org cards to restore a session
  // ---------------------------------------------------------------------------
  it("Scenario 9: getFlashcardStudySession fetches only snapshot card IDs via findManyByIds without loading all org cards", async () => {
    const allIds: FlashcardId[] = [];
    for (let i = 0; i < 50; i++) {
      const cId = randomUUID() as FlashcardId;
      allIds.push(cId);
      await flashcardStore.create({
        id: cId,
        organizationId,
        courseId,
        question: `فلش کارت ${i + 1}`,
        answer: `پاسخ ${i + 1}`,
        explanation: null,
        cardType: "concept",
        difficulty: "easy",
        dueAt: new Date().toISOString(),
        intervalDays: 0,
        easeFactor: 2.5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        deletedAt: null,
      });
    }

    const sessionCardIds = allIds.slice(5, 10); // Only 5 cards in session

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseId],
      mode: "normal",
      targetCardCount: 5,
      cardIds: sessionCardIds,
    });

    const listByOrgSpy = vi.spyOn(flashcardStore, "listByOrganization");
    const findManyByIdsSpy = vi.spyOn(flashcardStore, "findManyByIds");

    const restored = await service.getFlashcardStudySession(student, organizationId, session.id);

    expect(restored.cards.length).toBe(5);
    // Verified: listByOrganization was NEVER called, only findManyByIds with the 5 IDs
    expect(listByOrgSpy).not.toHaveBeenCalled();
    expect(findManyByIdsSpy).toHaveBeenCalledTimes(1);
    expect(findManyByIdsSpy).toHaveBeenCalledWith(sessionCardIds);
  });

  // ---------------------------------------------------------------------------
  // 10. Accurate stats after card create/delete/update and cache invalidation
  // ---------------------------------------------------------------------------
  it("Scenario 10: Accurate stats reflect immediately after cache invalidation", async () => {
    const cardId = randomUUID() as FlashcardId;
    await flashcardStore.create({
      id: cardId,
      organizationId,
      courseId,
      question: "انرژی فعال‌سازی چیست؟",
      answer: "حداقل انرژی لازم برای شروع واکنش",
      explanation: null,
      cardType: "concept",
      difficulty: "easy",
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedContentId: null,
      deletedAt: null,
    });

    service.invalidateFlashcardSummaryCache(organizationId);
    service.invalidateTopicSummaryCache(organizationId);

    const counts = await flashcardStore.getCardCountsByCourseLesson(organizationId);
    const courseCardCount = counts.find((c) => c.courseId === courseId);
    expect(courseCardCount).toBeDefined();
    expect(courseCardCount!.totalCards).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 11. Preventing duplicate requests and caching topic summary
  // ---------------------------------------------------------------------------
  it("Scenario 11: Caches topic summary and avoids repeating DB query on subsequent requests", async () => {
    const qId = randomUUID() as QuizId;
    await quizStore.create({
      id: qId,
      organizationId,
      courseId,
      title: "آزمون مبانی ترمودینامیک",
      status: "published",
      topic: "ترمودینامیک",
      difficulty: "medium",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId: qId,
        question: "قانون اول ترمودینامیک چیست؟",
        difficulty: "easy",
        topic: "ترمودینامیک",
        questionType: "multiple_choice",
        choices: ["۱", "۲", "۳", "۴"],
        correctAnswer: "۱",
        explanation: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
    ]);

    const countSpy = vi.spyOn(quizQuestionStore, "countByCourseAndDifficulty");

    // Request 1: hits store and caches
    const summary1 = await service.getExamTopicSummary(student, organizationId);
    expect(summary1.courses.length).toBeGreaterThan(0);
    expect(countSpy).toHaveBeenCalledTimes(1);

    // Request 2: served from cache in memory without calling DB count again
    const summary2 = await service.getExamTopicSummary(student, organizationId);
    expect(summary2.courses.length).toBe(summary1.courses.length);
    expect(countSpy).toHaveBeenCalledTimes(1); // Still 1!
  });

  // ---------------------------------------------------------------------------
  // 12. Invalidation with systemOrganizationId present
  // ---------------------------------------------------------------------------
  it("Scenario 12: Invalidation accurately clears cache when systemOrganizationId is configured", async () => {
    const sysOrgId = "system-shared-org" as OrganizationId;
    const serviceWithSysOrg = new StudyService(
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
      courseStore,
      sysOrgId,
      undefined,
      flashcardStudySessionStore,
    );

    const countSpy = vi.spyOn(quizQuestionStore, "countByCourseAndDifficulty");
    countSpy.mockClear();

    // Call 1: Populates cache with key: `${organizationId}:${sysOrgId}`
    await serviceWithSysOrg.getExamTopicSummary(student, organizationId);
    expect(countSpy).toHaveBeenCalledTimes(1);

    // Call 2: Hit cache
    await serviceWithSysOrg.getExamTopicSummary(student, organizationId);
    expect(countSpy).toHaveBeenCalledTimes(1);

    // Invalidate specifically for organizationId
    serviceWithSysOrg.invalidateTopicSummaryCache(organizationId);

    // Call 3: Must miss cache and hit DB again
    await serviceWithSysOrg.getExamTopicSummary(student, organizationId);
    expect(countSpy).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // 13. Multi-tenant isolation: Invalidating Org A preserves valid cache of Org B
  // ---------------------------------------------------------------------------
  it("Scenario 13: Invalidating Org A cache preserves cached summary of unrelated Org B", async () => {
    const orgB = "org-second-tenant" as OrganizationId;
    const courseBId = "course-org-b" as CourseId;

    await courseStore.create({
      course: {
        id: courseBId,
        organizationId: orgB,
        name: "فیزیک هالیدی",
        academicYear: "1403",
        grade: "12",
        field: "ریاضی",
        icon: "atom",
        description: "دوره فیزیک عمومی",
        status: "published",
        isDefault: false,
        publishedAt: new Date().toISOString(),
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      settings: {
        courseId: courseBId,
        enableQuizzes: true,
        enableFlashcards: true,
        enablePractice: true,
        enableSummaries: true,
        enablePdfExport: false,
        theme: "light",
      },
    });

    const quizBId = randomUUID() as QuizId;
    await quizStore.create({
      id: quizBId,
      organizationId: orgB,
      courseId: courseBId,
      title: "آزمون فیزیک پایه",
      status: "published",
      topic: "مکانیک",
      difficulty: "easy",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId: quizBId,
        question: "معادله حرکت چیست؟",
        difficulty: "easy",
        topic: "مکانیک",
        questionType: "multiple_choice",
        choices: ["۱", "۲", "۳", "۴"],
        correctAnswer: "۱",
        explanation: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
    ]);

    const countSpy = vi.spyOn(quizQuestionStore, "countByCourseAndDifficulty");
    countSpy.mockClear();

    const studentB: Actor = {
      userId: randomUUID() as UserId,
      role: "student",
      memberships: [{ organizationId: orgB, role: "student" }],
    };

    // Warm up cache for both orgs
    await service.getExamTopicSummary(student, organizationId);
    expect(countSpy).toHaveBeenCalledTimes(1);

    await service.getExamTopicSummary(studentB, orgB);
    expect(countSpy).toHaveBeenCalledTimes(2);

    // Invalidate ONLY organizationId (Org A)
    service.invalidateTopicSummaryCache(organizationId);

    // Org B summary should STILL be served from cache without calling store again
    await service.getExamTopicSummary(studentB, orgB);
    expect(countSpy).toHaveBeenCalledTimes(2); // Still 2!

    // Org A summary should fetch fresh from store
    await service.getExamTopicSummary(student, organizationId);
    expect(countSpy).toHaveBeenCalledTimes(3); // Incremented to 3!
  });

  // ---------------------------------------------------------------------------
  // 14. Topic summary updates accurately after question creation
  // ---------------------------------------------------------------------------
  it("Scenario 14: Accurately updates question count in summary after creating a question", async () => {
    const testQuizId = randomUUID() as QuizId;
    await quizStore.create({
      id: testQuizId,
      organizationId,
      courseId,
      title: "آزمون مبانی سینتیک",
      status: "published",
      topic: "سینتیک",
      difficulty: "easy",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId: testQuizId,
        question: "سرعت واکنش چیست؟",
        difficulty: "easy",
        topic: "سینتیک",
        questionType: "multiple_choice",
        choices: ["الف", "ب", "ج", "د"],
        correctAnswer: "الف",
        explanation: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
    ]);

    service.invalidateTopicSummaryCache(organizationId);
    const summaryBefore = await service.getExamTopicSummary(student, organizationId);
    const initialCourse = summaryBefore.courses.find((c) => c.courseId === courseId);
    const initialCount = initialCourse?.questionCount ?? 0;

    // Create a new question
    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId: testQuizId,
        question: "عوامل موثر بر سرعت واکنش چیستند؟",
        difficulty: "medium",
        topic: "سینتیک",
        questionType: "multiple_choice",
        choices: ["دما", "غلظت", "کاتالیزور", "همه موارد"],
        correctAnswer: "همه موارد",
        explanation: null,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
    ]);

    // Before invalidation: returns cached initialCount
    const cachedSummary = await service.getExamTopicSummary(student, organizationId);
    expect(cachedSummary.courses.find((c) => c.courseId === courseId)?.questionCount).toBe(initialCount);

    // Invalidate cache
    service.invalidateTopicSummaryCache(organizationId);

    // After invalidation: accurately reflects incremented count (+1)
    const summaryAfter = await service.getExamTopicSummary(student, organizationId);
    const updatedCourse = summaryAfter.courses.find((c) => c.courseId === courseId);
    expect(updatedCourse?.questionCount).toBe(initialCount + 1);
  });

  // ---------------------------------------------------------------------------
  // 15. Topic summary updates accurately after quiz or question deletion
  // ---------------------------------------------------------------------------
  it("Scenario 15: Accurately reflects question and quiz deletion after cache invalidation", async () => {
    const ephemeralQuizId = randomUUID() as QuizId;
    const ephemeralCourseId = "course-to-be-deleted" as CourseId;

    await courseStore.create({
      course: {
        id: ephemeralCourseId,
        organizationId,
        name: "شیمی آلی ۳",
        academicYear: "1403",
        grade: "12",
        field: "تجربی",
        icon: "atom",
        description: "دوره موقت برای تست حذف",
        status: "published",
        isDefault: false,
        publishedAt: new Date().toISOString(),
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      settings: {
        courseId: ephemeralCourseId,
        enableQuizzes: true,
        enableFlashcards: true,
        enablePractice: true,
        enableSummaries: true,
        enablePdfExport: false,
        theme: "light",
      },
    });

    const ephemeralDocId = "doc-ephemeral-1" as DocumentId;
    await quizStore.create({
      id: ephemeralQuizId,
      organizationId,
      courseId: ephemeralCourseId,
      documentId: ephemeralDocId,
      title: "آزمون شیمی آلی پیشرفته",
      status: "published",
      topic: "شیمی آلی",
      difficulty: "hard",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const ephemeralQuestion = {
      id: randomUUID() as QuizQuestionId,
      quizId: ephemeralQuizId,
      question: "سنتز فیشر چگونه انجام می‌شود؟",
      difficulty: "hard",
      topic: "شیمی آلی",
      questionType: "multiple_choice" as const,
      choices: ["۱", "۲", "۳", "۴"],
      correctAnswer: "۱",
      explanation: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedContentId: null,
      lessonId: null,
      deletedAt: null,
    };
    await quizQuestionStore.createMany([ephemeralQuestion]);

    service.invalidateTopicSummaryCache(organizationId);
    const summaryBefore = await service.getExamTopicSummary(student, organizationId);
    expect(summaryBefore.courses.some((c) => c.courseId === ephemeralCourseId)).toBe(true);

    // Delete the quiz by document and invalidate cache (as done in handleDeleteQuizzesByDocument)
    await quizStore.deleteByDocument(ephemeralDocId, organizationId);
    service.invalidateTopicSummaryCache(organizationId);

    // Summary should now exclude the deleted quiz/course questions
    const summaryAfter = await service.getExamTopicSummary(student, organizationId);
    expect(summaryAfter.courses.some((c) => c.courseId === ephemeralCourseId)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 16. Real HTTP API route DELETE /quizzes by document invalidates cache on success
  // ---------------------------------------------------------------------------
  it("Scenario 16: Real API route DELETE /quizzes by document triggers cache invalidation upon success", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    const testOrgId = randomUUID() as OrganizationId;
    const testUserId = randomUUID() as UserId;

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: testOrgId,
      userId: testUserId,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const userRecord: UserRecord = {
      id: testUserId,
      email: "student-route@test.com",
      role: Roles.student,
      globalRole: null,
      createdAt: new Date().toISOString(),
    };
    userStore.insert(userRecord);

    const session = await sessionService.createSession(testUserId);

    const targetDocId = randomUUID() as DocumentId;
    const targetQuizId = randomUUID() as QuizId;
    const targetCourseId = randomUUID() as CourseId;

    await courseStore.create({
      course: {
        id: targetCourseId,
        organizationId: testOrgId,
        name: "شیمی مسیر واقعی API",
        academicYear: "1403",
        grade: "12",
        field: "تجربی",
        icon: "atom",
        description: "تست مسیر واقعی",
        status: "published",
        isDefault: false,
        publishedAt: new Date().toISOString(),
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      settings: {
        courseId: targetCourseId,
        enableQuizzes: true,
        enableFlashcards: true,
        enablePractice: true,
        enableSummaries: true,
        enablePdfExport: false,
        theme: "light",
      },
    });

    await quizStore.create({
      id: targetQuizId,
      organizationId: testOrgId,
      courseId: targetCourseId,
      documentId: targetDocId,
      title: "آزمون مستند واقعی",
      status: "published",
      topic: "شیمی",
      difficulty: "medium",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizQuestionStore.createMany([
      {
        id: randomUUID() as QuizQuestionId,
        quizId: targetQuizId,
        question: "آیا کش ابطال می‌شود؟",
        difficulty: "medium",
        topic: "شیمی",
        questionType: "multiple_choice",
        choices: ["بله", "خیر"],
        correctAnswer: "بله",
        explanation: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedContentId: null,
        lessonId: null,
        deletedAt: null,
      },
    ]);

    const app = createApp({ config });
    await app.register(studyRoutes, {
      sessionService,
      userStore,
      organizationStore: orgStore,
      courseStore,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      auditService,
      systemOrganizationId: "00000000-0000-0000-0000-000000000001" as OrganizationId,
      studyService: service,
    });

    const routeActor: Actor = {
      userId: testUserId,
      role: "student",
      memberships: [{ organizationId: testOrgId, role: "student" }],
    };

    // 1. Initial warm up of cache for testOrgId
    const countSpy = vi.spyOn(quizQuestionStore, "countByCourseAndDifficulty");
    countSpy.mockClear();

    const summaryBefore = await service.getExamTopicSummary(routeActor, testOrgId);
    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(summaryBefore.courses.some((c) => c.courseId === targetCourseId)).toBe(true);

    // Second call without route mutation should hit cache
    await service.getExamTopicSummary(routeActor, testOrgId);
    expect(countSpy).toHaveBeenCalledTimes(1);

    const invalidateSpy = vi.spyOn(service, "invalidateTopicSummaryCache");

    // 2. Execute REAL HTTP route DELETE
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${testOrgId}/documents/${targetDocId}/quizzes`,
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(invalidateSpy).toHaveBeenCalledWith(testOrgId);

    // 3. Subsequent summary call must bypass stale cache and fetch fresh
    const summaryAfter = await service.getExamTopicSummary(routeActor, testOrgId);
    expect(countSpy).toHaveBeenCalledTimes(2);
    expect(summaryAfter.courses.some((c) => c.courseId === targetCourseId)).toBe(false);

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 17. Real HTTP API route failure preserves cache without invalidation
  // ---------------------------------------------------------------------------
  it("Scenario 17: Real API route failure preserves topicSummaryCache without invalidation", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    const app = createApp({ config });
    await app.register(studyRoutes, {
      sessionService,
      userStore,
      organizationStore: orgStore,
      courseStore,
      flashcardStore,
      flashcardReviewStore,
      userFlashcardScheduleStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      progressStore,
      auditService,
      systemOrganizationId: "00000000-0000-0000-0000-000000000001" as OrganizationId,
      studyService: service,
    });

    const invalidateSpy = vi.spyOn(service, "invalidateTopicSummaryCache");
    invalidateSpy.mockClear();

    // Attempt DELETE without authentication token -> 401
    const unauthResponse = await app.inject({
      method: "DELETE",
      url: `/v1/organizations/${organizationId}/documents/unauth-doc/quizzes`,
    });

    expect(unauthResponse.statusCode).toBe(401);
    expect(invalidateSpy).not.toHaveBeenCalled();

    await app.close();
  });
});
