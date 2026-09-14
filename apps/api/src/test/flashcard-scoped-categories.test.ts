import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
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
import {
  RoleBasedPolicy,
  type Actor,
  type OrganizationId,
  type CourseId,
  type ModuleId,
  type LessonId,
  type DocumentId,
  type UserId,
  type FlashcardId,
  type FlashcardRecord,
} from "@avana/domain";

describe("Flashcard Scoped Categories Study Sessions", () => {
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
  const systemOrgId = "00000000-0000-0000-0000-000000000000" as OrganizationId;
  const courseAId = "22222222-2222-4222-8222-222222222222" as CourseId;
  const courseBId = "33333333-3333-4333-8333-333333333333" as CourseId;
  const studentUserId = "44444444-4444-4444-8444-444444444444" as UserId;

  const modA1Id = "aaaaaaaa-1111-4111-8111-111111111111" as ModuleId;
  const modA2Id = "aaaaaaaa-2222-4222-8222-222222222222" as ModuleId;
  const modB1Id = "bbbbbbbb-1111-4111-8111-111111111111" as ModuleId;
  const modC1Id = "cccccccc-1111-4111-8111-111111111111" as ModuleId;

  const lesA1_1Id = "11111111-aaaa-4111-8111-111111111111" as LessonId;
  const lesA1_2Id = "22222222-aaaa-4222-8222-222222222222" as LessonId;

  const student: Actor = {
    userId: studentUserId,
    role: "student",
  };

  beforeEach(async () => {
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
      systemOrgId,
      undefined,
      flashcardStudySessionStore,
    );

    // Setup taxonomy
    await moduleStore.create({
      id: modA1Id,
      courseId: courseAId,
      title: "Module A1",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    await moduleStore.create({
      id: modA2Id,
      courseId: courseAId,
      title: "Module A2",
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    await moduleStore.create({
      id: modB1Id,
      courseId: courseBId,
      title: "Module B1",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: lesA1_1Id,
      moduleId: modA1Id,
      title: "Lesson A1-1",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
    await lessonStore.create({
      id: lesA1_2Id,
      moduleId: modA1Id,
      title: "Lesson A1-2",
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  function createCard(params: {
    courseId: CourseId;
    lessonId?: LessonId;
    status: "new" | "due" | "overdue" | "learned";
  }): FlashcardRecord {
    const id = randomUUID() as FlashcardId;
    const now = new Date();
    let dueAt = new Date().toISOString();
    let intervalDays = 0;

    if (params.status === "due") {
      dueAt = new Date(now.getTime() - 1000 * 60).toISOString(); // 1 minute ago
      intervalDays = 1;
    } else if (params.status === "overdue") {
      dueAt = new Date(now.getTime() - 25 * 3600 * 1000).toISOString(); // 25 hours ago (>24h)
      intervalDays = 2;
    } else if (params.status === "learned") {
      dueAt = new Date(now.getTime() + 7 * 86400 * 1000).toISOString(); // 7 days in future
      intervalDays = 7;
    }

    const card: FlashcardRecord = {
      id,
      organizationId,
      courseId: params.courseId,
      documentId: null,
      lessonId: params.lessonId ?? null,
      generatedContentId: null,
      question: `Question for ${params.status}`,
      answer: `Answer for ${params.status}`,
      explanation: null,
      cardType: "definition",
      difficulty: "medium",
      dueAt,
      intervalDays,
      easeFactor: 2.5,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    };

    flashcardStore.insert(card);

    if (params.status !== "new") {
      // Add schedule & review so it counts as reviewed
      userFlashcardScheduleStore.upsertSchedule({
        userId: studentUserId,
        flashcardId: id,
        dueAt,
        intervalDays,
        easeFactor: 2.5,
        repetitionNumber: 1,
      });
      flashcardReviewStore.insert({
        id: randomUUID(),
        organizationId,
        courseId: params.courseId,
        flashcardId: id,
        userId: studentUserId,
        rating: "good",
        reviewedAt: now.toISOString(),
      });
    }

    return card;
  }

  it("Scenario A: Scope = Course A, Category = forgotten -> returns only forgotten cards of Course A", async () => {
    // 2 forgotten in Course A, 3 forgotten in Course B, 2 new in Course A
    createCard({ courseId: courseAId, status: "overdue" });
    createCard({ courseId: courseAId, status: "overdue" });
    createCard({ courseId: courseAId, status: "new" });
    createCard({ courseId: courseBId, status: "overdue" });
    createCard({ courseId: courseBId, status: "overdue" });
    createCard({ courseId: courseBId, status: "overdue" });

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseAId],
      mode: "custom",
      customMode: "overdue",
    });

    expect(session.totalCards).toBe(2);
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(detail.cards.length).toBe(2);
    expect(detail.cards.every((c) => c.courseId === courseAId)).toBe(true);
  });

  it("Scenario B: Scope = Module A1, Category = new -> returns only new cards of Module A1", async () => {
    createCard({ courseId: courseAId, lessonId: lesA1_1Id, status: "new" });
    createCard({ courseId: courseAId, lessonId: lesA1_2Id, status: "new" });
    createCard({ courseId: courseAId, lessonId: lesA1_1Id, status: "due" }); // not new
    createCard({ courseId: courseBId, status: "new" }); // different course

    const session = await service.createFlashcardStudySession(student, organizationId, {
      moduleIds: [modA1Id],
      mode: "custom",
      customMode: "new",
    });

    expect(session.totalCards).toBe(2);
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(detail.cards.length).toBe(2);
    expect(detail.cards.every((c) => c.lessonId === lesA1_1Id || c.lessonId === lesA1_2Id)).toBe(true);
  });

  it("Scenario C: Scope = Lesson A1-2, Category = due -> returns only due cards of Lesson A1-2", async () => {
    createCard({ courseId: courseAId, lessonId: lesA1_1Id, status: "due" });
    const targetDue = createCard({ courseId: courseAId, lessonId: lesA1_2Id, status: "due" });
    createCard({ courseId: courseAId, lessonId: lesA1_2Id, status: "new" }); // not due

    const session = await service.createFlashcardStudySession(student, organizationId, {
      lessonIds: [lesA1_2Id],
      mode: "custom",
      customMode: "due",
    });

    expect(session.totalCards).toBe(1);
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(detail.cards[0].id).toBe(targetDue.id);
  });

  it("Scenario D: Scope = Course B, Category = learned -> returns only learned cards of Course B", async () => {
    createCard({ courseId: courseAId, status: "learned" }); // Course A
    const b1 = createCard({ courseId: courseBId, status: "learned" });
    const b2 = createCard({ courseId: courseBId, status: "learned" });
    createCard({ courseId: courseBId, status: "due" }); // not learned
    createCard({ courseId: courseBId, status: "new" }); // not learned

    const session = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseBId],
      mode: "custom",
      customMode: "learned",
    });

    expect(session.totalCards).toBe(2);
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    expect(detail.cards.length).toBe(2);
    const ids = detail.cards.map((c) => c.id);
    expect(ids).toContain(b1.id);
    expect(ids).toContain(b2.id);
    expect(detail.cards.every((c) => c.courseId === courseBId)).toBe(true);
  });

  it("Scenario E: Multi-scope (Module A1 + Module B1), Category = forgotten -> returns exact union", async () => {
    const a1Card = createCard({ courseId: courseAId, lessonId: lesA1_1Id, status: "overdue" });
    const b1Card = createCard({ courseId: courseBId, status: "overdue" }); // courseB has single module modB1
    createCard({ courseId: courseAId, status: "overdue" }); // courseA without module/lesson - not in A1

    const session = await service.createFlashcardStudySession(student, organizationId, {
      moduleIds: [modA1Id, modB1Id],
      mode: "custom",
      customMode: "overdue",
    });

    expect(session.totalCards).toBe(2);
    const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
    const ids = detail.cards.map((c) => c.id);
    expect(ids).toContain(a1Card.id);
    expect(ids).toContain(b1Card.id);
  });

  it("Scenario F: Empty Scope + Category -> throws bad_request and avoids fallback to all cards", async () => {
    // There are some cards in the org, but none in Module C1
    createCard({ courseId: courseAId, status: "new" });
    createCard({ courseId: courseAId, status: "due" });

    await expect(
      service.createFlashcardStudySession(student, organizationId, {
        moduleIds: [modC1Id],
        mode: "custom",
        customMode: "new",
      }),
    ).rejects.toThrow("هیچ فلش‌کارتی برای مطالعه در این دسته یافت نشد");
  });

  it("Scenario G: Category Isolation -> exactly separates forgotten, new, due, and learned", async () => {
    // In Course A: 5 overdue, 10 new, 6 due, 20 learned
    for (let i = 0; i < 5; i++) createCard({ courseId: courseAId, status: "overdue" });
    for (let i = 0; i < 10; i++) createCard({ courseId: courseAId, status: "new" });
    for (let i = 0; i < 6; i++) createCard({ courseId: courseAId, status: "due" });
    for (let i = 0; i < 20; i++) createCard({ courseId: courseAId, status: "learned" });

    const sForgotten = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseAId],
      mode: "custom",
      customMode: "overdue",
    });
    expect(sForgotten.totalCards).toBe(5);

    const sNew = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseAId],
      mode: "custom",
      customMode: "new",
    });
    expect(sNew.totalCards).toBe(10);

    const sDue = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseAId],
      mode: "custom",
      customMode: "due",
    });
    // Note: overdue cards are also due cards. In due mode, all due cards (including overdue) are returned: 5 + 6 = 11.
    expect(sDue.totalCards).toBe(11);

    const sLearned = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseAId],
      mode: "custom",
      customMode: "learned",
    });
    expect(sLearned.totalCards).toBe(20);
  });

  it("Scenario H: Scope Isolation -> Course A (5 forgotten) vs Course B (20 forgotten)", async () => {
    for (let i = 0; i < 5; i++) createCard({ courseId: courseAId, status: "overdue" });
    for (let i = 0; i < 20; i++) createCard({ courseId: courseBId, status: "overdue" });

    const sCourseA = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseAId],
      mode: "custom",
      customMode: "overdue",
    });
    expect(sCourseA.totalCards).toBe(5);

    const sCourseB = await service.createFlashcardStudySession(student, organizationId, {
      courseIds: [courseBId],
      mode: "custom",
      customMode: "overdue",
    });
    expect(sCourseB.totalCards).toBe(20);
  });

  it("Scenario I: Count_box == Count_session (Strict equality between scope count and session cards)", async () => {
    // Under Module A1:
    // 3 overdue, 4 due (non-overdue), 5 new, 6 learned
    for (let i = 0; i < 3; i++) createCard({ courseId: courseAId, lessonId: lesA1_1Id, status: "overdue" });
    for (let i = 0; i < 4; i++) createCard({ courseId: courseAId, lessonId: lesA1_1Id, status: "due" });
    for (let i = 0; i < 5; i++) createCard({ courseId: courseAId, lessonId: lesA1_2Id, status: "new" });
    for (let i = 0; i < 6; i++) createCard({ courseId: courseAId, lessonId: lesA1_2Id, status: "learned" });

    // Under Module A2 (different module):
    for (let i = 0; i < 10; i++) createCard({ courseId: courseAId, lessonId: randomUUID() as LessonId, status: "overdue" });

    // When scoping to Module A1:
    // Box 1 (overdue/forgotten) = 3
    const sForgotten = await service.createFlashcardStudySession(student, organizationId, {
      moduleIds: [modA1Id],
      mode: "custom",
      customMode: "overdue",
    });
    expect(sForgotten.totalCards).toBe(3);

    // Box 2 (new) = 5
    const sNew = await service.createFlashcardStudySession(student, organizationId, {
      moduleIds: [modA1Id],
      mode: "custom",
      customMode: "new",
    });
    expect(sNew.totalCards).toBe(5);

    // Box 3 (due) = 3 overdue + 4 due = 7
    const sDue = await service.createFlashcardStudySession(student, organizationId, {
      moduleIds: [modA1Id],
      mode: "custom",
      customMode: "due",
    });
    expect(sDue.totalCards).toBe(7);

    // Box 4 (learned) = 6
    const sLearned = await service.createFlashcardStudySession(student, organizationId, {
      moduleIds: [modA1Id],
      mode: "custom",
      customMode: "learned",
    });
    expect(sLearned.totalCards).toBe(6);
  });

  describe("Review Limits Enforcement (New=40, Review=120, User Custom Limits)", () => {
    it("New limit: 100 new cards + default limit -> exactly 40 cards snapshot", async () => {
      for (let i = 0; i < 100; i++) {
        createCard({ courseId: courseAId, status: "new" });
      }

      const session = await service.createFlashcardStudySession(student, organizationId, {
        courseIds: [courseAId],
        mode: "custom",
        customMode: "new",
      });

      expect(session.totalCards).toBe(40);
      const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
      expect(detail.cards.length).toBe(40);
    });

    it("New limit: 100 new cards + limit=20 -> exactly 20 cards snapshot", async () => {
      for (let i = 0; i < 100; i++) {
        createCard({ courseId: courseAId, status: "new" });
      }

      const session = await service.createFlashcardStudySession(student, organizationId, {
        courseIds: [courseAId],
        mode: "custom",
        customMode: "new",
        limit: 20,
      });

      expect(session.totalCards).toBe(20);
      const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
      expect(detail.cards.length).toBe(20);
    });

    it("New limit: 100 new cards + limit=200 -> returns all 100 available cards", async () => {
      for (let i = 0; i < 100; i++) {
        createCard({ courseId: courseAId, status: "new" });
      }

      const session = await service.createFlashcardStudySession(student, organizationId, {
        courseIds: [courseAId],
        mode: "custom",
        customMode: "new",
        limit: 200,
      });

      expect(session.totalCards).toBe(100);
      const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
      expect(detail.cards.length).toBe(100);
    });

    it("Previous/Review limit: 200 due cards + default limit -> exactly 120 cards snapshot", async () => {
      for (let i = 0; i < 200; i++) {
        createCard({ courseId: courseAId, status: "due" });
      }

      const session = await service.createFlashcardStudySession(student, organizationId, {
        courseIds: [courseAId],
        mode: "custom",
        customMode: "due",
      });

      expect(session.totalCards).toBe(120);
      const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
      expect(detail.cards.length).toBe(120);
    });

    it("Previous/Review limit: 200 due cards + limit=50 -> exactly 50 cards snapshot", async () => {
      for (let i = 0; i < 200; i++) {
        createCard({ courseId: courseAId, status: "due" });
      }

      const session = await service.createFlashcardStudySession(student, organizationId, {
        courseIds: [courseAId],
        mode: "custom",
        customMode: "due",
        limit: 50,
      });

      expect(session.totalCards).toBe(50);
      const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
      expect(detail.cards.length).toBe(50);
    });

    it("Previous/Review limit: 50 due cards + limit=120 -> returns all 50 available cards", async () => {
      for (let i = 0; i < 50; i++) {
        createCard({ courseId: courseAId, status: "due" });
      }

      const session = await service.createFlashcardStudySession(student, organizationId, {
        courseIds: [courseAId],
        mode: "custom",
        customMode: "due",
        limit: 120,
      });

      expect(session.totalCards).toBe(50);
      const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
      expect(detail.cards.length).toBe(50);
    });

    it("Category + Scope + Limit interaction: Module A1 (30 forgotten) vs Module A2 (30 forgotten) + limit=10 -> exactly 10 cards of Module A1", async () => {
      for (let i = 0; i < 30; i++) {
        createCard({ courseId: courseAId, lessonId: lesA1_1Id, status: "overdue" });
      }
      for (let i = 0; i < 30; i++) {
        createCard({ courseId: courseAId, lessonId: randomUUID() as LessonId, status: "overdue" });
      }

      const session = await service.createFlashcardStudySession(student, organizationId, {
        moduleIds: [modA1Id],
        mode: "custom",
        customMode: "overdue",
        limit: 10,
      });

      expect(session.totalCards).toBe(10);
      const detail = await service.getFlashcardStudySession(student, organizationId, session.id);
      expect(detail.cards.length).toBe(10);
      expect(detail.cards.every((c) => c.lessonId === lesA1_1Id)).toBe(true);
    });
  });
});
